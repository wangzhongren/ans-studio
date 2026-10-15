// Real, offline SDK mapping: starts describe requests, never grant execution permission.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGovernanceExtension, toPiTool } from "../../src/common/pi-adapter/real-adapter.ts";
import type { SessionEvent, ToolDefinition, WriteGate } from "../../src/model/runtime.ts";

const names = ["read_file", "write_file", "edit_file", "run_shell", "request_confirmation", "request_choice", "dispatch_task", "submit_report", "report_shell_verdict"];
const allow: WriteGate = () => ({ allowed: true, matchedEntry: { root: "project", path: "test", kind: "file", purpose: "test" } });
type Scenario = "allow" | "whitelist" | "write-denied" | "shell-denied" | "missing" | "invalid" | "throw";

async function run(scenario: Scenario, sequential: boolean) {
  const pi = await import("@earendil-works/pi-coding-agent");
  const ai = await import("@earendil-works/pi-ai");
  const dir = await mkdtemp(join(tmpdir(), "ans-pi-call-events-"));
  try {
    const events: SessionEvent[] = []; const effects: string[] = [];
    const tools: ToolDefinition[] = names.map(name => ({ name, description: "offline probe", executionMode: sequential ? "sequential" : "parallel", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }, async handler(call) { effects.push(name); assert.ok(call.signal instanceof AbortSignal); assert.ok(call.toolCallId); return { ok: true, message: "handled" }; } }));
    const selected = scenario === "allow" ? names : [scenario === "shell-denied" ? "run_shell" : "write_file"];
    const faux = ai.fauxProvider({ tokensPerSecond: 100000 });
    faux.setResponses([ai.fauxAssistantMessage(selected.map(name => ai.fauxToolCall(scenario === "missing" ? "absent" : name, scenario === "invalid" ? {} : { path: "same-text" }))), ai.fauxAssistantMessage("用户指令：this is actual assistant text")]);
    const runtime = await pi.ModelRuntime.create({ credentials: new ai.InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
    runtime.registerNativeProvider(faux.provider);
    const gate: WriteGate = scenario === "throw" ? () => { throw new Error("probe gate error"); } : scenario === "write-denied" ? () => ({ allowed: false, reason: "outside-boundary", allowedByRoot: { project: [], skill: [] } }) : allow;
    const context = { currentTurnId: () => "actual-turn", ...(scenario === "whitelist" ? { allowedToolNames: new Set<string>() } : scenario === "allow" || scenario === "missing" || scenario === "invalid" ? { allowedToolNames: new Set(names) } : {}) };
    const extension = buildGovernanceExtension(gate, event => events.push(event), scenario !== "shell-denied", context);
    const settingsManager = pi.SettingsManager.inMemory({});
    const resourceLoader = new pi.DefaultResourceLoader({ cwd: dir, agentDir: dir, extensionFactories: [extension], noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, settingsManager });
    await resourceLoader.reload();
    const { session } = await pi.createAgentSession({ cwd: dir, noTools: "builtin", customTools: tools.map(tool => toPiTool(tool, context)), resourceLoader, model: runtime.getModel(faux.provider.id, faux.models[0].id)!, modelRuntime: runtime, sessionManager: pi.SessionManager.inMemory(dir), settingsManager });
    try { await session.prompt("offline request"); } finally { session.dispose(); }
    return { events, effects, selected };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

for (const sequential of [true, false]) {
  test(`real SDK nine tool names, ${sequential ? "sequential" : "parallel"}: handler once/start once/result once`, async () => {
    const { events, effects } = await run("allow", sequential);
    assert.deepEqual([...effects].sort(), [...names].sort());
    const starts = events.filter(event => event.kind === "tool_call");
    assert.equal(starts.length, names.length);
    const ids = new Set<string>();
    for (const start of starts) {
      const detail = start.detail as Record<string, unknown>;
      assert.equal(detail.phase, "start"); assert.equal(detail.turnId, "actual-turn"); assert.equal(detail.path, "same-text");
      assert.equal(typeof detail.toolCallId, "string"); ids.add(detail.toolCallId as string);
      const results = events.filter(event => (event.detail as Record<string, unknown>)?.toolCallId === detail.toolCallId && (event.detail as Record<string, unknown>)?.phase === "result");
      assert.equal(results.length, 1); assert.equal(results[0].kind, "accepted"); assert.equal((results[0].detail as Record<string, unknown>).ok, true);
    }
    assert.equal(ids.size, names.length, "same arguments remain distinct real calls");
    assert.ok(events.some(event => event.kind === "message" && event.summary === "用户指令：this is actual assistant text"));
  });
}

for (const scenario of ["whitelist", "write-denied", "shell-denied", "missing", "invalid", "throw"] as const) {
  test(`real SDK ${scenario}: no handler effect, canonical start and true failure remain`, async () => {
    const { events, effects } = await run(scenario, true);
    assert.deepEqual(effects, []);
    const starts = events.filter(event => event.kind === "tool_call"); assert.equal(starts.length, 1);
    const identity = starts[0].detail as Record<string, unknown>;
    const results = events.filter(event => (event.detail as Record<string, unknown>)?.phase === "result"); assert.equal(results.length, 1);
    assert.equal(results[0].kind, "denied"); const result = results[0].detail as Record<string, unknown>;
    assert.equal(result.toolCallId, identity.toolCallId); assert.equal(result.turnId, "actual-turn"); assert.equal(result.ok, false); assert.equal(result.status, "failed");
    const blocked = events.filter(event => (event.detail as Record<string, unknown>)?.phase === "blocked");
    assert.equal(blocked.length, ["whitelist", "write-denied", "shell-denied"].includes(scenario) ? 1 : 0);
    if (blocked.length) { const detail = blocked[0].detail as Record<string, unknown>; assert.equal(detail.turnId, "actual-turn"); assert.equal(detail.toolCallId, identity.toolCallId); }
  });
}

test("mapping preserves different turns, duplicate/late failed ends and legacy missing identity without text guesses", () => {
  const hooks = new Map<string, (event: any) => unknown>(); const events: SessionEvent[] = []; let turnId = "first";
  buildGovernanceExtension(allow, e => events.push(e), true, { currentTurnId: () => turnId }).factory({ on: (name: string, handler: (event: any) => unknown) => { hooks.set(name, handler); } } as never);
  const start = hooks.get("tool_execution_start")!; const end = hooks.get("tool_execution_end")!;
  start({ toolName: "submit_report", toolCallId: "old", args: {} });
  turnId = "second"; start({ toolName: "submit_report", toolCallId: "new", args: {} });
  const failed = { toolName: "submit_report", toolCallId: "old", result: { details: { turnId: "first", errorCode: "ABORTED" } }, isError: true };
  end(failed); end(failed);
  start({ toolName: "submit_report", args: {} });
  const starts = events.filter(e => e.kind === "tool_call"); assert.equal(starts.length, 3);
  assert.equal((starts[0].detail as Record<string, unknown>).turnId, "first"); assert.equal((starts[1].detail as Record<string, unknown>).turnId, "second");
  assert.equal((starts[2].detail as Record<string, unknown>).toolCallId, undefined, "legacy absence is never invented");
  const results = events.filter(e => e.kind === "denied"); assert.equal(results.length, 2);
  for (const event of results) { const detail = event.detail as Record<string, unknown>; assert.equal(detail.turnId, "first"); assert.equal(detail.phase, "result"); assert.equal(detail.ok, false); assert.equal(detail.errorCode, "ABORTED"); }
});
