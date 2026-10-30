// test/测试/request-timeout-e2e.test.ts
// P1（2026-10-30 团队计划 §4.3 / 附录 B）：**请求超时端到端**（编排 → Service → 真实 Claude 适配器）——
//  - 首字节永不来（注入 40ms）⇒ `handle.send` 以 `request-timeout-first-byte` 失败；事件流恰一条
//    `settled(failed)`，summary 为人话短报，detail 带 errorCode/attempts/replaySafe/timeoutKind；
//    **无 handback**（重试属 P3，不在本批）；
//  - 流中途静默 ⇒ `request-timeout-idle`；
//  - 诊断 request.attempt.start/request.timeout/request.failed 齐全；ANS 只发一次请求输入；
//  - 项目目录零写入（临时夹具；不落 `.ans`）。
// 真实路径：真实 openRoleSession（编排+Service 组合）+ 真实 createClaudeRuntimeAdapter（仅 SDK 传输为假）。

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { after } from "node:test";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { Options, SDKMessage, SDKUserMessage, Query } from "@anthropic-ai/claude-agent-sdk";
import * as z from "zod";

import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { createClaudeRuntimeAdapter } from "../../src/provider/claude/session.ts";
import { listProject } from "../../src/service/role/resolve-role.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../src/common/shared/diagnostics.ts";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";

const ROOT = mkdtempSync(join(tmpdir(), "ans-request-timeout-e2e-"));
after(() => {
  try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* 忽略 */ }
});

const environment = { PATH: process.env.PATH, HOME: process.env.HOME, ANTHROPIC_API_KEY: "fixture-api-secret" };

function writeAt(root: string, rel: string, text: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, "utf8");
}

/** 造一个最小项目（角色 A + 边界）；不在仓库留文件。 */
function projectFixture(): string {
  const root = mkdtempSync(join(ROOT, "proj-"));
  writeAt(root, "角色卡/A/role-card.md", "# 角色：A\n\n请求超时 e2e 夹具角色。\n");
  writeAt(root, "角色卡/A/boundary.yaml", "role: A\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: fixture\n");
  return root;
}

const assistantFrame = (blocks: unknown[]): SDKMessage => ({
  type: "assistant",
  message: { id: "msg_fixture", type: "message", role: "assistant", model: "fixture", content: blocks, stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
  parent_tool_use_id: null, session_id: "fixture", uuid: randomUUID(),
}) as unknown as SDKMessage;

/** 假 SDK 传输：不返回任何帧（首字节永不来）或先给一帧再静默；abort 时以 AbortError 退出。 */
function fakeSdk(mode: "never" | "after-first-frame") {
  const users: SDKUserMessage[] = [];
  const query = ({ prompt, options }: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }) => {
    assert.equal(typeof prompt, "object");
    const signal = options!.abortController!.signal;
    const hang = () => new Promise<never>((_resolve, reject) => {
      const fail = () => reject(Object.assign(new Error("fixture abort"), { name: "AbortError" }));
      if (signal.aborted) return fail();
      signal.addEventListener("abort", fail, { once: true });
    });
    let closed = false;
    const generator = (async function* () {
      for await (const user of prompt as AsyncIterable<SDKUserMessage>) {
        users.push(user);
        if (mode === "after-first-frame") yield assistantFrame([{ type: "text", text: "先输出一段" }]);
        await hang();
      }
    })();
    return Object.assign(generator, {
      async interrupt() {},
      close() { closed = true; },
      async mcpServerStatus() { return []; },
    }) as unknown as Query;
  };
  return { users, dependencies: { env: environment, loadSdk: async () => ({ createSdkMcpServer, query }), loadZod: async () => z } };
}

async function withDiagnostics<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "ans-request-timeout-e2e-diag-"));
  configureDiagnostics({ directory: dir });
  try { return await fn(dir); } finally { await disposeDiagnostics(); await rm(dir, { recursive: true, force: true }); }
}

interface DiagRecord { event: string; [key: string]: unknown }
async function diagnosticEvents(dir: string): Promise<DiagRecord[]> {
  await flushDiagnostics();
  const records: DiagRecord[] = [];
  for (const file of await readdir(dir)) {
    const text = await readFile(join(dir, file), "utf8");
    for (const line of text.trim().split("\n")) if (line !== "") records.push(JSON.parse(line) as DiagRecord);
  }
  return records;
}

async function runTimeoutE2e(mode: "never" | "after-first-frame"): Promise<{ events: OrchestrationEvent[]; failure: Error & { code?: string }; users: number; diagnostics: DiagRecord[] }> {
  return withDiagnostics(async (diagDir) => {
    const root = projectFixture();
    const fake = fakeSdk(mode);
    const listing = await listProject(root);
    const project = buildProjectConfig(listing, { accepted: true, source: "unit-test:request-timeout-e2e" });
    const handle = await openRoleSession(
      { roleId: "A", runtime: "claude", project, persistSession: false },
      {
        runtimeOptions: {
          providerFactories: { claude: (providerOptions) => createClaudeRuntimeAdapter(providerOptions, fake.dependencies) },
          requestFirstByteTimeoutMs: 40,
          requestIdleTimeoutMs: 40,
        },
      },
    );
    const events: OrchestrationEvent[] = [];
    const collector = (async () => {
      for await (const event of handle.events()) {
        events.push(event);
        if (event.kind === "settled") break;
      }
    })();
    const failure = await handle.send("请求超时 e2e").then(() => undefined, (error: unknown) => error as Error & { code?: string });
    await collector;
    await handle.dispose();
    // 项目零写入（夹具目录只应有 角色卡/）。
    assert.equal(existsSync(join(root, ".ans")), false, "请求超时回合不得写项目 .ans/（零项目写入）");
    return { events, failure: failure!, users: fake.users.length, diagnostics: await diagnosticEvents(diagDir) };
  });
}

test("e2e 首字节超时：service+编排透传 failed/errorCode；恰一条 settled、无 handback、人话短报", async () => {
  const result = await runTimeoutE2e("never");
  assert.ok(result.failure, "请求超时必须让 send 失败（不得伪造成功）");
  assert.equal(result.failure.name, "RequestTimeoutError");
  assert.equal(result.failure.code, "request-timeout-first-byte");
  const terminals = result.events.filter((event) => event.kind === "settled");
  assert.equal(terminals.length, 1, "恰一条 settled（不产生额外 settled）");
  const terminal = terminals[0]!;
  assert.equal(terminal.summary, "本轮请求超时（首字节未返回）", "短报为人话，不含技术 code");
  const detail = (terminal as { detail?: unknown }).detail as { outcome?: unknown; errorCode?: unknown; attempts?: unknown; replaySafe?: unknown; timeoutKind?: unknown };
  assert.equal(detail.outcome, "failed", "请求超时终态是 failed（不是最后兜底 timed_out）");
  assert.equal(detail.errorCode, "request-timeout-first-byte");
  assert.equal(detail.attempts, 1);
  assert.equal(detail.replaySafe, false);
  assert.equal(detail.timeoutKind, "first-byte");
  assert.equal(result.events.filter((event) => event.kind === "handback").length, 0, "失败回合不得产生 handback（重试属 P3）");
  assert.equal(result.users, 1, "ANS 只发一次请求输入（SDK 重试期间不并发重试；P1 无 ANS 重试）");
  assert.ok(result.diagnostics.some((record) => record.event === "request.timeout" && record.mode === "first-byte"));
  assert.ok(result.diagnostics.some((record) => record.event === "request.failed" && record.errorCode === "request-timeout-first-byte"));
});

test("e2e 流空闲超时：请求已活动后静默 ⇒ request-timeout-idle；仍恰一条 settled、无 handback", async () => {
  const result = await runTimeoutE2e("after-first-frame");
  assert.equal(result.failure.name, "RequestTimeoutError");
  assert.equal(result.failure.code, "request-timeout-idle");
  const terminals = result.events.filter((event) => event.kind === "settled");
  assert.equal(terminals.length, 1);
  assert.equal(terminals[0]!.summary, "本轮请求超时（响应空闲超时）");
  const detail = (terminals[0] as { detail?: unknown }).detail as { outcome?: unknown; errorCode?: unknown; timeoutKind?: unknown };
  assert.equal(detail.outcome, "failed");
  assert.equal(detail.errorCode, "request-timeout-idle");
  assert.equal(detail.timeoutKind, "idle");
  assert.equal(result.events.filter((event) => event.kind === "handback").length, 0);
  assert.equal(result.users, 1);
  assert.ok(result.diagnostics.some((record) => record.event === "request.timeout" && record.mode === "idle"));
});
