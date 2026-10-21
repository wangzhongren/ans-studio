// Explicit native regression: node test/codex-adapter/reasoning-loopback.probe.ts
// Only localhost, fake credentials and disposable directories. A failed case remains a failed case.
import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import type { RoleSession, RuntimeSessionStorage, SessionEvent, ReasoningEffortV1 } from "../../src/model/runtime.ts";
import { role, interactionGate } from "./fixtures.ts";

type Body = { reasoning?: { effort?: string }; input?: unknown; model?: string };
type Wire = { effort?: string; hasReasoning: boolean; model?: string; input: unknown; status?: number };
const reports: Record<string, unknown>[] = [];
const selectedCases = new Set((process.env.ANS_CODEX_PROBE_CASES ?? "").split(",").filter(Boolean));
const sourceHashes = Object.fromEntries(await Promise.all([
  "../../src/provider/codex/session.ts", "../../src/common/codex-adapter/protocol.ts", "../../src/common/codex-adapter/config.ts", "../../src/common/codex-adapter/reasoning-catalog.ts", "./reasoning-loopback.probe.ts",
].map(async file => [file, createHash("sha256").update(await readFile(new URL(file, import.meta.url))).digest("hex")])));
let requests: Wire[] = [];
let handler: (body: Body, response: ServerResponse) => void = () => {};
let sequence = 0;
const server = createServer(async (request, response) => {
  let raw = "";
  for await (const part of request) raw += part;
  try {
    const body = JSON.parse(raw) as Body;
    requests.push({ effort: body.reasoning?.effort, hasReasoning: Object.hasOwn(body, "reasoning"), model: body.model, input: body.input });
    handler(body, response);
  } catch { response.writeHead(500); response.end("invalid local fixture request"); }
});
await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const address = server.address(); assert.ok(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}/v1`;
const delay = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean) { const end = Date.now() + 20000; while (!check()) { if (Date.now() > end) throw new Error("native probe condition timed out"); await delay(); } }
function reject(response: ServerResponse, field = "reasoning.effort", kind: "value" | "field" = "field", status = 400) {
  requests.at(-1)!.status = status;
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: { message: kind === "value" ? "Invalid value: high" : `Unsupported parameter: ${field}`, type: status >= 500 ? "server_error" : "invalid_request_error", code: kind === "value" ? "unsupported_value" : "unsupported_parameter", param: field } }));
}
function answer(response: ServerResponse, tool = false, hold = false) {
  requests.at(-1)!.status = 200;
  response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  const id = ++sequence;
  const initial = { id: `resp_${id}`, object: "response", created_at: 1, status: "in_progress", model: "probe-model", output: [] };
  const send = (type: string, data: unknown) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...(data as object) })}\n\n`);
  send("response.created", { response: initial });
  if (hold) return;
  const item = tool ? { type: "function_call", id: `fc_${id}`, call_id: `call_${id}`, name: "ans_probe", arguments: "{}" }
    : { type: "message", id: `msg_${id}`, role: "assistant", status: "completed", content: [{ type: "output_text", text: "local completed", annotations: [] }] };
  send("response.output_item.added", { output_index: 0, item: tool ? { ...item, arguments: "" } : { ...item, content: [] } });
  send("response.output_item.done", { output_index: 0, item });
  send("response.completed", { response: { ...initial, status: "completed", output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
  response.end();
}
function system(events: SessionEvent[], state: string) { return events.filter(event => (event.detail as { source?: string; state?: string } | undefined)?.source === "system" && (event.detail as { state?: string }).state === state); }
async function scenario(name: string, options: { model?: string; effort?: ReasoningEffortV1; persistent?: boolean; timeout?: number; tool?: () => void }, run: (session: RoleSession, events: SessionEvent[]) => Promise<void>) {
  if (selectedCases.size && !selectedCases.has(name)) return;
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-codex-reasoning-regression-"));
  requests = [];
  handler = (_body, response) => answer(response);
  const events: SessionEvent[] = [];
  let session: RoleSession | undefined;
  let collect: Promise<void> | undefined;
  const storage: RuntimeSessionStorage = { runtime: "codex", roleId: role.id, directory: root, nativeDirectory: path.join(root, "native"), async readLatest() { return undefined; }, async saveSession() {}, async appendReplay() {}, async readReplay() { return []; } };
  let failure: string | undefined;
  try {
    session = await createCodexRuntimeAdapter({ runtime: "codex", projectRoot: root, skillRoot: root, modelId: options.model ?? "probe-model", baseUrl, env: { CODEX_API_KEY: "fake-local-probe-only", PATH: process.env.PATH }, interactionGate: interactionGate(), currentTurnId: () => name, reasoningEffort: options.effort ?? "high", storage: options.persistent ? storage : undefined, constructTimeoutMs: 15000, turnLastResortMs: options.timeout ?? 60000, tools: options.tool ? [{ name: "probe", description: "increments an in-memory counter", inputSchema: { type: "object" }, async handler() { options.tool!(); return { ok: true, message: "counted once" }; } }] : [] }).bindRole(role);
    collect = (async () => { for await (const event of session!.events()) events.push(event); })();
    await run(session, events);
  } catch (error) { failure = String(error); }
  finally {
    try { await session?.dispose(); await collect; } catch (error) { failure ??= String(error); }
    server.closeAllConnections();
    await rm(root, { recursive: true, force: true });
  }
  reports.push({ name, passed: failure === undefined, ...(failure ? { failure } : {}), wire: requests.map(({ effort, hasReasoning, model, input, status }) => ({ effort: effort ?? null, hasReasoning, model, status, historySentinelPresent: JSON.stringify(input).includes("history-sentinel") })), system: events.filter(event => (event.detail as { source?: string } | undefined)?.source === "system").map(event => ({ summary: event.summary, detail: event.detail, turnId: event.turnId })), outcomes: events.filter(event => event.kind === "settled").map(event => event.detail) });
}
try {
  for (const effort of ["low", "medium", "high", "xhigh", "off"] as const) {
    await scenario(`mapping-${effort}`, { effort }, async (session, events) => {
      await session.prompt("mapping"); assert.equal(requests[0].effort, effort === "off" ? undefined : effort);
      assert.equal(system(events, "configured").length, 1); assert.ok(system(events, "configured")[0].turnId);
    });
  }
  await scenario("catalog-default-preserves-history", { model: "gpt-5.5" }, async (session, events) => {
    await session.prompt("history-sentinel"); const id = session.nativeSessionId;
    handler = (body, response) => body.reasoning?.effort === "high" ? reject(response, "reasoning.effort", "value") : answer(response);
    await session.prompt("retry this turn"); await session.prompt("next turn");
    assert.deepEqual(requests.map(request => request.effort), ["high", "high", "medium", "medium"]);
    assert.equal(session.nativeSessionId, id); assert.ok(JSON.stringify(requests[2].input).includes("history-sentinel"));
    assert.equal(system(events, "completed").length, 1);
  });
  for (const persistent of [false, true]) {
    await scenario(`field-removal-${persistent ? "persistent" : "ephemeral"}`, { persistent }, async (session, events) => {
      const id = session.nativeSessionId;
      handler = (body, response) => body.reasoning?.effort !== undefined ? reject(response) : answer(response);
      await session.prompt("field rejection"); await session.prompt("next turn");
      assert.deepEqual(requests.map(request => request.effort), ["high", undefined, undefined]);
      assert.equal(session.nativeSessionId === id, persistent);
      assert.equal(system(events, "completed").length, 1);
    });
  }
  for (const kind of ["500", "cancel", "timeout", "field-500", "e1-500", "e1-cancel", "e1-timeout"] as const) {
    const timeout = kind.endsWith("timeout");
    await scenario(`restore-${kind}`, { model: kind === "field-500" ? "probe-model" : "gpt-5.5", persistent: kind.startsWith("e1-"), timeout: timeout ? 1000 : 60000 }, async (session, events) => {
      handler = (body, response) => {
        if (body.reasoning?.effort === "high") reject(response, "reasoning.effort", kind === "field-500" || kind.startsWith("e1-") ? "field" : "value");
        else if (kind.endsWith("500")) reject(response, "reasoning.effort", "field", 500);
        else answer(response, false, true);
      };
      const completion = session.prompt("compatibility must not stick"); void completion.catch(() => {});
      await until(() => requests.some(request => request.effort !== "high"));
      if (kind.endsWith("cancel")) { await session.abort!(); await completion; }
      else if (timeout) await assert.rejects(completion, /最后兜底/);
      else {
        // CLI 0.162.1 maps exhausted HTTP 500 retries to its high-demand user message.
        // Assert actual HTTP status and terminal failure, not a guessed native message spelling.
        await assert.rejects(completion);
        assert.ok(requests.some(request => request.status === 500));
        assert.equal((events.find(event => event.kind === "settled")?.detail as { outcome?: string })?.outcome, "failed");
      }
      assert.equal(system(events, "completed").length, 0);
      handler = (_body, response) => answer(response);
      await session.prompt("restore original"); assert.equal(requests.at(-1)!.effort, "high");
    });
  }
  await scenario("model-error-no-compatibility", {}, async (session, events) => {
    handler = (_body, response) => reject(response, "model");
    await assert.rejects(session.prompt("model error")); assert.equal(requests.length, 1); assert.equal(system(events, "trying").length, 0);
  });
  await scenario("whole-reasoning-interface-limit", {}, async (session, events) => {
    handler = (_body, response) => reject(response, "reasoning");
    await assert.rejects(session.prompt("interface mismatch")); assert.equal(requests.length, 1); assert.equal(system(events, "completed").length, 0);
  });
  let toolCalls = 0;
  await scenario("completed-tool-never-replayed", { tool: () => { toolCalls++; } }, async (session, events) => {
    handler = (_body, response) => requests.length === 1 ? answer(response, true) : reject(response);
    await assert.rejects(session.prompt("call the in-memory tool")); assert.equal(toolCalls, 1); assert.equal(requests.length, 2); assert.equal(system(events, "trying").length, 0);
  });
  // Keep the original D1 success requirement: E1 must make the formerly failing case pass.
  await scenario("known-model-effort-field-removal-required", { model: "gpt-5.5" }, async session => {
    handler = (body, response) => body.reasoning?.effort !== undefined ? reject(response) : answer(response);
    await session.prompt("ordinary interface accepts no effort");
    assert.equal(requests.at(-1)!.effort, undefined);
    await session.prompt("next request still has no effort");
    assert.deepEqual(requests.map(request => request.effort), ["high", undefined, undefined]);
    assert.ok(requests.every(request => request.model === "gpt-5.5"));
  });
  await scenario("known-model-default-value-rejected-then-no-effort", { model: "gpt-5.5" }, async session => {
    handler = (body, response) => body.reasoning?.effort !== undefined ? reject(response, "reasoning.effort", "value") : answer(response);
    await session.prompt("both explicit values rejected, no effort works");
    await session.prompt("confirmed no effort next turn");
    assert.deepEqual(requests.map(request => request.effort), ["high", "medium", undefined, undefined]);
  });
} finally {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
}
console.log(JSON.stringify({ node: process.version, platform: `${process.platform}/${process.arch}`, cli: "0.162.1", credentials: "fake only", externalModelCalls: 0, selectedCases: [...selectedCases], sourceHashes, passed: reports.every(report => report.passed), reports }, null, 2));
if (reports.some(report => !report.passed)) process.exitCode = 1;
