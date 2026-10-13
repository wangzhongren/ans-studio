import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGovernedTools } from "../../src/provider/pi/tools.ts";
import { toPiTool, makeRolePrompt, wireSettledOnce, describeTool, buildGovernanceExtension } from "../../src/common/pi-adapter/real-adapter.ts";
import { createTurnLifecycle } from "../../src/common/pi-adapter/lifecycle.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import type { SessionEvent, ReportHandbackMetadata } from "../../src/provider/pi/session.ts";
import { makeGate } from "./fixtures.ts";

const log = { stage() {}, trace() {}, traceEnabled: false };

test("handler failure is a Pi error with safe identifiable details", async () => {
  const pi = toPiTool({ name: "write_file", handler: async () => ({ ok: false, message: "private result text" }) }, { currentTurnId: () => "turn-one" });
  const result = await pi.execute("call-one", { path: "src/file.ts", content: "private source text" }, undefined, () => {}, {} as never);
  assert.equal(result.isError, true);
  assert.equal((result.details as Record<string, unknown>).path, "src/file.ts");
  assert.equal((result.details as Record<string, unknown>).turnId, "turn-one");
  assert.equal(JSON.stringify(result.details).includes("private"), false);
});

test("terminal outcome uses the final retry response and emits exactly once", () => {
  const events: SessionEvent[] = [];
  const turn = createTurnLifecycle(e => events.push(e));
  turn.begin();
  const id = turn.currentTurnId();
  turn.observe({ role: "assistant", stopReason: "error", content: [] });
  turn.observe({ role: "assistant", stopReason: "stop", content: [] });
  turn.finish(); turn.finish(true);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].detail, { turnId: id, outcome: "completed" });
  turn.begin();
  assert.notEqual(turn.currentTurnId(), id);
  turn.observe({ role: "assistant", stopReason: "error", content: [] });
  turn.finish();
  assert.equal((events.at(-1)!.detail as Record<string, unknown>).outcome, "failed");
  assert.equal(events.at(-2)!.kind, "denied");
});

test("prompt timeout is locked before SDK aborted settle, with no duplicate terminal", async () => {
  const events: SessionEvent[] = [];
  const lifecycle = createTurnLifecycle(e => events.push(e));
  let listener: (e: { type: string; aborted?: boolean }) => void = () => {};
  const session = { prompt: () => new Promise<void>(() => {}), abort: async () => listener({ type: "agent_settled", aborted: true }), dispose() {}, subscribe(fn: typeof listener) { listener = fn; return () => {}; } };
  wireSettledOnce(session, e => events.push(e), lifecycle);
  const prompt = makeRolePrompt({ session, promptMs: 20, gate: createInteractionGate(), emit: e => events.push(e), log, lifecycle });
  await assert.rejects(prompt("private input"), /超时/);
  assert.equal(events.filter(e => e.kind === "settled").length, 1);
  assert.equal((events.at(-1)!.detail as Record<string, unknown>).outcome, "timed_out");
});

test("abort cleanup is bounded and quarantines an unresponsive session", async () => {
  const events: SessionEvent[] = [];
  const prompt = makeRolePrompt({ session: { prompt: () => new Promise<void>(() => {}), abort: () => new Promise<void>(() => {}), dispose() {} }, promptMs: 10, abortTimeoutMs: 10, gate: createInteractionGate(), emit: e => events.push(e), log });
  const began = Date.now();
  await assert.rejects(prompt("wait"), /超时/);
  assert.ok(Date.now() - began < 1000);
  assert.equal(events.filter(e => e.kind === "settled").length, 1);
  await assert.rejects(prompt("again"), /重新建立会话/);
});

test("SDK finally-settled followed by prompt rejection cannot publish an early completed turn", async () => {
  const events: SessionEvent[] = [];
  const lifecycle = createTurnLifecycle(e => events.push(e));
  let listener: (e: { type: string }) => void = () => {};
  const session = { prompt: async () => { listener({ type: "agent_settled" }); assert.equal(events.filter(e => e.kind === "settled").length, 0); throw new Error("post-run failure"); }, abort: async () => {}, dispose() {}, subscribe(fn: typeof listener) { listener = fn; return () => {}; } };
  wireSettledOnce(session, e => events.push(e), lifecycle);
  await assert.rejects(makeRolePrompt({ session, promptMs: 1000, gate: createInteractionGate(), emit: e => events.push(e), log, lifecycle })("fixture"), /post-run/);
  assert.equal(events.filter(e => e.kind === "settled").length, 1);
  assert.equal((events.at(-1)!.detail as Record<string, unknown>).outcome, "failed");
});

test("report captures entry turnId even if the current turn changes before callback", async () => {
  let id = "original";
  let metadata: ReportHandbackMetadata | undefined;
  const tool = buildGovernedTools(makeGate({ skill: [], project: [] }), { currentTurnId: () => id, reportHandback: (_report, meta) => { metadata = meta; } }).find(t => t.name === "submit_report")!;
  const work = tool.handler({ name: tool.name, args: { status: "completed", summary: "done" } });
  id = "next";
  assert.equal((await work).ok, true);
  assert.deepEqual(metadata, { turnId: "original" });
});

test("an already aborted report never calls the receiving capability", async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  const tool = buildGovernedTools(makeGate({ skill: [], project: [] }), { reportHandback: () => { calls++; } }).find(t => t.name === "submit_report")!;
  assert.equal((await tool.handler({ name: tool.name, args: { status: "completed", summary: "done" }, signal: controller.signal })).ok, false);
  await Promise.resolve();
  assert.equal(calls, 0);
});

test("tool guidance preserves governance confirmation and permits authorized routine work", () => {
  for (const name of ["request_confirmation", "request_choice", "dispatch_task"]) {
    const text = JSON.stringify(describeTool(name));
    assert.match(text, /无需逐次确认|无需重复确认/);
    assert.match(text, /扩张.*边界|扩张角色边界/);
    assert.doesNotMatch(text, /调用任何写盘工具.*必须先经/);
  }
});

test("real faux SDK: failed handler emits denied; accepted report precedes same-turn settled", async () => {
  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } = await import("@earendil-works/pi-coding-agent");
  const { fauxProvider, fauxAssistantMessage, fauxToolCall, InMemoryCredentialStore } = await import("@earendil-works/pi-ai");
  const events: SessionEvent[] = [];
  const order: string[] = [];
  const emit = (e: SessionEvent) => { events.push(e); if (e.kind === "settled") order.push("settled"); };
  const lifecycle = createTurnLifecycle(emit);
  const gate = makeGate({ project: [], skill: [] });
  const tools = buildGovernedTools(gate, { currentTurnId: lifecycle.currentTurnId, reportHandback: (_report, metadata) => { assert.equal(metadata?.turnId, lifecycle.currentTurnId()); order.push("report"); } });
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage([fauxToolCall("read_file", {}), fauxToolCall("submit_report", { status: "blocked", summary: "missing path" })]), fauxAssistantMessage("done")]);
  const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  runtime.registerNativeProvider(faux.provider);
  const settingsManager = SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } });
  const resourceLoader = new DefaultResourceLoader({ cwd: process.cwd(), agentDir: process.cwd(), extensionFactories: [buildGovernanceExtension(gate, emit, false)], noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, settingsManager });
  await resourceLoader.reload();
  const { session } = await createAgentSession({ cwd: process.cwd(), noTools: "builtin", customTools: tools.map(t => toPiTool(t, { currentTurnId: lifecycle.currentTurnId })), resourceLoader, model: runtime.getModel(faux.provider.id, faux.models[0].id)!, modelRuntime: runtime, sessionManager: SessionManager.inMemory(process.cwd()), settingsManager });
  const unsubscribe = wireSettledOnce(session, emit, lifecycle);
  try {
    await makeRolePrompt({ session, promptMs: 2000, gate: createInteractionGate(), emit, log, lifecycle })("run fixture");
    const failed = events.find(e => (e.detail as Record<string, unknown> | undefined)?.toolName === "read_file" && e.kind === "denied");
    assert.ok(failed, "actual SDK must map handler ok:false to denied");
    assert.equal((failed.detail as Record<string, unknown>).ok, false);
    assert.deepEqual(order, ["report", "settled"]);
    assert.equal((events.at(-1)!.detail as Record<string, unknown>).turnId, lifecycle.currentTurnId());
    assert.equal(events.filter(e => e.kind === "settled").length, 1);
    // An empty-content model error must still become a failed terminal with retry disabled.
    faux.setResponses([fauxAssistantMessage([], { stopReason: "error", errorMessage: "fixture error" })]);
    await makeRolePrompt({ session, promptMs: 2000, gate: createInteractionGate(), emit, log, lifecycle })("failure fixture");
    assert.equal((events.at(-1)!.detail as Record<string, unknown>).outcome, "failed");
  } finally { unsubscribe(); session.dispose(); }
});
