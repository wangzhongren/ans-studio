// 客户 2026-10-27 补充约束 + 纠正：Codex 的 Chat Completions 传输保留，但 Pi **只能作为临时测试配置**，
// 产品路径不得自动回退 Pi。本探针不读 `.env`，只接受显式测试环境变量（由操作者一次性注入）：
//   ANS_CODEX_CHAT_PROBE_BASE_URL / ANS_CODEX_CHAT_PROBE_MODEL / ANS_CODEX_CHAT_PROBE_API_KEY
// 并把它们作为显式 options 传给适配器（test-only）；适配器自身不做任何 Pi 自动回退。
//
// 探针行为：
//  1. 文本轮次可达（Chat Completions 可用）。
//  2. 模型发起 `ans_view_image_probe` 工具调用；工具结果附 1×1 半透明红色 PNG；
//     模型在随后回复中说出 red/pink 系颜色 ⇒ **同轮工具结果图片被真实模型看到**。
//  3. 文本-only 工具结果对照：工具被调用，回复正常。
//
// 凭据只在进程内存使用，绝不打印/落盘；报告不含密钥、base64 或模型原文。
// 配置缺失 ⇒ `blocked-config`（退出码 0，不算通过也不算失败）；配置存在但探针失败 ⇒ 退出码 1。
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import type { SessionEvent, ToolResult } from "../../src/model/runtime.ts";
import { role, interactionGate } from "./fixtures.ts";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="; // 1×1 RGBA ff0000/7f
const sourceHashes = Object.fromEntries(await Promise.all([
  "../../src/provider/codex/session.ts",
  "../../src/common/codex-adapter/chat-transport.ts",
  "../../src/common/codex-adapter/config.ts",
  "./chat-completions.probe.ts",
].map(async file => [file, createHash("sha256").update(await readFile(new URL(file, import.meta.url))).digest("hex")])));

interface Report { name: string; passed: boolean; failure?: string; toolCalled?: boolean; colorMatched?: boolean; replyLength?: number; wire?: Array<Record<string, unknown>> }
const reports: Report[] = [];

// 显式临时测试注入（不读 .env；产品路径不做 Pi 自动回退）。
const baseUrl = process.env.ANS_CODEX_CHAT_PROBE_BASE_URL;
const model = process.env.ANS_CODEX_CHAT_PROBE_MODEL;
const token = process.env.ANS_CODEX_CHAT_PROBE_API_KEY;
if (!baseUrl || !model || !token) {
  console.log(JSON.stringify({ status: "blocked-config", reason: "explicit probe env not set: ANS_CODEX_CHAT_PROBE_BASE_URL / ANS_CODEX_CHAT_PROBE_MODEL / ANS_CODEX_CHAT_PROBE_API_KEY (temporary test-only injection; product never auto-reads Pi)", sourceHashes }, null, 2));
  process.exitCode = 0;
} else {
  const redactProbe = (value: unknown): string => String(value instanceof Error ? value.message : value).split(token).join("[REDACTED]");
  const host = (() => { const url = new URL(baseUrl); return `${url.protocol}//${url.host}`; })();
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-codex-chat-probe-"));
  try {
    const run = async (name: string, result: () => ToolResult, prompt: string, check: (events: SessionEvent[], toolCalls: number) => Report) => {
      let toolCalls = 0;
      const wire: Array<Record<string, unknown>> = [];
      // 只记录响应形状摘要（无正文/base64）：证明网关真实返回了什么，但不泄露内容。
      const chatFetch: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        const clone = response.clone();
        const text = await clone.text();
        try {
          const json = JSON.parse(text);
          const choice = json.choices?.[0];
          const message = choice?.message;
          wire.push({
            status: response.status,
            finish: choice?.finish_reason ?? null,
            contentLength: typeof message?.content === "string" ? message.content.length : null,
            reasoningLength: typeof message?.reasoning_content === "string" ? message.reasoning_content.length : null,
            toolCalls: Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0,
          });
        } catch { wire.push({ status: response.status, json: false }); }
        return response;
      };
      let session: Awaited<ReturnType<ReturnType<typeof createCodexRuntimeAdapter>["bindRole"]>> | undefined;
      const events: SessionEvent[] = [];
      let collect: Promise<void> | undefined;
      try {
        session = await createCodexRuntimeAdapter({
          runtime: "codex", projectRoot: root, skillRoot: root, modelId: model, baseUrl,
          apiKeyEnvVar: "ANS_CODEX_CHAT_PROBE_API_KEY",
          env: { ANS_CODEX_CHAT_PROBE_API_KEY: token, PATH: process.env.PATH },
          wireApi: "chat", chatFetch,
          interactionGate: interactionGate(), currentTurnId: () => name, turnLastResortMs: 120000,
          tools: [{ name: "view_image_probe", description: "returns the fixture image result under test", inputSchema: { type: "object" }, async handler() { toolCalls += 1; return result(); } }],
        }).bindRole(role);
        collect = (async () => { for await (const event of session!.events()) events.push(event); })();
        await session.prompt(prompt);
        // prompt 在 settled 入队后返回；等消费者排空（FIFO：settled 出现即此前事件已全部入列）。
        const deadline = Date.now() + 5000;
        while (!events.some(event => event.kind === "settled") && Date.now() < deadline) await new Promise<void>(resolve => setTimeout(resolve, 5));
        reports.push({ ...check(events, toolCalls), wire });
      } catch (error) {
        reports.push({ name, passed: false, failure: redactProbe(error), wire });
      } finally {
        try { await session?.dispose(); await collect; } catch { /* dispose failure recorded by the report if any */ }
      }
    };

    await run("text-turn", () => ({ ok: true, message: "unused" }), "Reply with the single word pong.", (events) => {
      const text = events.filter(event => event.kind === "message").map(event => event.summary).join("\n");
      return { name: "text-turn", passed: /\bpong\b/i.test(text), replyLength: text.length };
    });

    await run("tool-result-image", () => ({ ok: true, message: "图片已随本工具结果附上", images: [{ type: "image", mimeType: "image/png", data: PNG }] }),
      "Call the view_image_probe tool exactly once. Then state the dominant color of the image the tool returned, in one word.", (events, toolCalls) => {
        const text = events.filter(event => event.kind === "message").map(event => event.summary).join("\n");
        const colorMatched = /red|pink|salmon|coral|scarlet|rose/i.test(text);
        return { name: "tool-result-image", passed: toolCalls === 1 && colorMatched, toolCalled: toolCalls === 1, colorMatched, replyLength: text.length };
      });

    await run("tool-result-text-control", () => ({ ok: true, message: "the fixture tool returned no image" }),
      "Call the view_image_probe tool exactly once. Then confirm in one short sentence that the tool returned no image.", (events, toolCalls) => {
        const text = events.filter(event => event.kind === "message").map(event => event.summary).join("\n");
        return { name: "tool-result-text-control", passed: toolCalls === 1 && text.length > 0, toolCalled: toolCalls === 1, replyLength: text.length };
      });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  const passed = reports.every(report => report.passed);
  console.log(JSON.stringify({
    status: "probed", chatCompletions: "available", gatewayHost: host, model,
    credentials: "explicit temporary test injection (present; never printed; product does not auto-read Pi)",
    wireApi: "chat", externalModelCalls: "real gateway (explicit temporary test config; product path requires explicit Codex config)",
    sourceHashes, passed, reports,
  }, null, 2));
  if (!passed) process.exitCode = 1;
}
