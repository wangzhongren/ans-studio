// Explicit native loopback probe: node test/codex-adapter/images-loopback.probe.ts
//
// 目的（2026-10-27 同轮看图设计 §10.5 Codex 探针）：用本机固定 `@openai/codex 0.162.1` 的真实
// app-server，验证动态工具响应的 `{type:"inputImage",imageUrl:"data:<mime>;base64,<data>"}` 被接受，
// 且图片进入**同一轮**的下一次 Responses 请求；失败/非法载荷绝不附图。
//
// 只用 localhost 假模型服务、假凭据（`fake-local-probe-only`）与一次性临时目录；
// **不调用任何外部模型**，不打印任何凭据或 base64（报告只含布尔与计数）。
// 通过标准：success-image 场景第二请求包含逐字 data URL；其余场景不包含图片。
// 失败即失败（退出码 1），不降级为“结构上应该可以”。
import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import type { RoleSession, SessionEvent, ToolResult } from "../../src/model/runtime.ts";
import { role, interactionGate } from "./fixtures.ts";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TOOL_NAME = "view_image_probe";
const MODEL_CALL_NAME = `ans_${TOOL_NAME}`;

type Reports = { name: string; passed: boolean; failure?: string; requests?: number; imageDataUrlInNextRequest?: boolean; imageDataUrlAbsent?: boolean; failClosedNotePresent?: boolean; outcome?: string };
const reports: Reports[] = [];
const selected = new Set((process.env.ANS_CODEX_IMAGE_PROBE_CASES ?? "").split(",").filter(Boolean));
const sourceHashes = Object.fromEntries(await Promise.all([
  "../../src/provider/codex/session.ts",
  "../../src/common/codex-adapter/tool-result-images.ts",
  "./images-loopback.probe.ts",
].map(async file => [file, createHash("sha256").update(await readFile(new URL(file, import.meta.url))).digest("hex")])));

let requests: string[] = [];
let handler: (body: string, response: ServerResponse) => void = () => {};
let sequence = 0;
const server = createServer(async (request, response) => {
  let raw = "";
  for await (const part of request) raw += part;
  requests.push(raw);
  try { handler(raw, response); }
  catch { response.writeHead(500); response.end("invalid local fixture request"); }
});
await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const address = server.address(); assert.ok(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}/v1`;

function sse(response: ServerResponse, item: Record<string, unknown>, initial: Record<string, unknown>) {
  response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  const send = (type: string, data: unknown) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...(data as object) })}\n\n`);
  send("response.created", { response: initial });
  send("response.output_item.added", { output_index: 0, item: { ...item, ...(item.type === "function_call" ? { arguments: "" } : { content: [] }) } });
  send("response.output_item.done", { output_index: 0, item });
  send("response.completed", { response: { ...initial, status: "completed", output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
  response.end();
}

function answerTool(response: ServerResponse) {
  const id = ++sequence;
  const initial = { id: `resp_${id}`, object: "response", created_at: 1, status: "in_progress", model: "probe-model", output: [] };
  sse(response, { type: "function_call", id: `fc_${id}`, call_id: `call_${id}`, name: MODEL_CALL_NAME, arguments: "{}" }, initial);
}
function answerMessage(response: ServerResponse) {
  const id = ++sequence;
  const initial = { id: `resp_${id}`, object: "response", created_at: 1, status: "in_progress", model: "probe-model", output: [] };
  sse(response, { type: "message", id: `msg_${id}`, role: "assistant", status: "completed", content: [{ type: "output_text", text: "local completed", annotations: [] }] }, initial);
}

async function scenario(name: string, result: () => ToolResult, check: (requestBodies: string[], events: SessionEvent[], details: Partial<Reports>) => void) {
  if (selected.size && !selected.has(name)) return;
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-codex-image-loopback-"));
  requests = [];
  // 第一条请求 → 模型发起动态工具调用；工具结果回传后的下一条请求 → 直接完成。
  handler = (_body, response) => requests.length === 1 ? answerTool(response) : answerMessage(response);
  const events: SessionEvent[] = [];
  const details: Partial<Reports> = {};
  let failure: string | undefined;
  let session: RoleSession | undefined;
  let collect: Promise<void> | undefined;
  try {
    session = await createCodexRuntimeAdapter({
      runtime: "codex", projectRoot: root, skillRoot: root, modelId: "probe-model", baseUrl,
      env: { CODEX_API_KEY: "fake-local-probe-only", PATH: process.env.PATH },
      interactionGate: interactionGate(), currentTurnId: () => name, constructTimeoutMs: 15000, turnLastResortMs: 60000,
      tools: [{ name: TOOL_NAME, description: "returns the fixture image result under test", inputSchema: { type: "object" }, async handler() { return result(); } }],
    }).bindRole(role);
    collect = (async () => { for await (const event of session!.events()) events.push(event); })();
    await session.prompt("call the image probe tool");
    check(requests, events, details);
  } catch (error) { failure = String(error); }
  finally {
    try { await session?.dispose(); await collect; } catch (error) { failure ??= String(error); }
    server.closeAllConnections();
    await rm(root, { recursive: true, force: true });
  }
  const outcome = events.find(event => event.kind === "settled")?.detail as { outcome?: string } | undefined;
  reports.push({ name, passed: failure === undefined, ...(failure ? { failure } : {}), requests: requests.length, outcome: outcome?.outcome, ...details });
}

try {
  await scenario("success-image", () => ({ ok: true, message: "图片已随本工具结果附上", images: [{ type: "image", mimeType: "image/png", data: PNG }] }), (bodies, _events, details) => {
    assert.ok(bodies.length >= 2, "tool result must trigger a second model request");
    const next = bodies[1]!;
    assert.ok(next.includes(`data:image/png;base64,${PNG}`), "next Responses request must contain the exact inputImage data URL");
    details.imageDataUrlInNextRequest = true;
  });

  await scenario("text-only", () => ({ ok: true, message: "no image attached" }), (bodies, _events, details) => {
    assert.ok(bodies.length >= 2);
    assert.equal(bodies[1]!.includes("data:image"), false);
    assert.equal(bodies[1]!.includes("input_image"), false);
    details.imageDataUrlAbsent = true;
  });

  await scenario("failed-image", () => ({ ok: false, message: "capability refused", images: [{ type: "image", mimeType: "image/png", data: PNG }] }), (bodies, _events, details) => {
    assert.ok(bodies.length >= 2);
    assert.equal(bodies[1]!.includes("data:image"), false);
    assert.equal(bodies[1]!.includes(`base64,${PNG}`), false);
    details.imageDataUrlAbsent = true;
  });

  await scenario("invalid-mime", () => ({ ok: true, message: "claimed attached", images: [{ type: "image", mimeType: "image/svg+xml", data: PNG }] }), (bodies, _events, details) => {
    assert.ok(bodies.length >= 2);
    assert.equal(bodies[1]!.includes("data:image"), false);
    assert.ok(bodies[1]!.includes("未向模型提供任何图片"), "fail-closed note must reach the model");
    details.imageDataUrlAbsent = true;
    details.failClosedNotePresent = true;
  });
} finally {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
}
console.log(JSON.stringify({ node: process.version, platform: `${process.platform}/${process.arch}`, cli: "0.162.1", credentials: "fake only", externalModelCalls: 0, selectedCases: [...selected], sourceHashes, passed: reports.every(report => report.passed && report.outcome === "completed"), reports }, null, 2));
if (reports.some(report => !report.passed || report.outcome !== "completed")) process.exitCode = 1;
