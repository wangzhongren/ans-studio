// P1 neutral-contract and actual Pi SDK wiring, with an entirely in-process faux model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import type { CustomerInputMetadata, RuntimeProviderOptions, SessionEvent, ToolDefinition } from "../../src/model/runtime.ts";
import { createPiRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { buildGovernedTools, describeTool as publicDescription } from "../../src/provider/pi/tools.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createRuntimeSessionStore } from "../../src/provider/runtime/session-store.ts";
import { createRealPiRuntimeAdapter, toPiTool, describeTool, buildGovernanceExtension, selectSessionManager } from "../../src/common/pi-adapter/real-adapter.ts";
import { resolvePiProviderConfig } from "../../src/common/pi-adapter/provider-config.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import { makeGate, makeRole } from "./fixtures.ts";

const log = { stage() {}, trace() {}, traceEnabled: false };
const config = resolvePiProviderConfig({ providerId: "p1-faux", baseUrl: "https://p1.invalid/", modelId: "p1-model", apiKeyEnvVar: "P1_FAKE_CREDENTIAL", contextWindow: 32768 }, { P1_FAKE_CREDENTIAL: "offline-placeholder" });
const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
async function temp(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "p1-injection-"));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
function options(projectRoot: string, tools: readonly ToolDefinition[] = []): RuntimeProviderOptions {
  return { runtime: "pi", projectRoot, skillRoot: projectRoot, tools, interactionGate: createInteractionGate(), currentTurnId: () => "injected-turn", promptTimeoutMs: 1000 };
}
async function engine() {
  const pi = await import("@earendil-works/pi-coding-agent");
  const ai = await import("@earendil-works/pi-ai");
  const faux = ai.fauxProvider({ tokensPerSecond: 100000 });
  const runtime = await pi.ModelRuntime.create({ credentials: new ai.InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  runtime.registerNativeProvider(faux.provider);
  const model = runtime.getModel(faux.provider.id, faux.models[0].id)!;
  let native: Awaited<ReturnType<typeof pi.createAgentSession>>["session"] | undefined;
  let constructed: Parameters<typeof pi.createAgentSession>[0];
  const dependencies = {
    buildRuntime: async () => ({ runtime, model }),
    loadPi: async () => ({ ...pi, async createAgentSession(input: Parameters<typeof pi.createAgentSession>[0]) {
      constructed = input;
      const result = await pi.createAgentSession(input); native = result.session; return result;
    } }),
  };
  return { pi, ai, faux, dependencies, get native() { return native!; }, get constructed() { return constructed!; } };
}
async function drain(session: { events(): AsyncIterable<SessionEvent>; dispose(): Promise<void> }) {
  await session.dispose(); const events: SessionEvent[] = [];
  for await (const event of session.events()) events.push(event);
  return events;
}

test("injected schema/description/executionMode override legacy name lookup and exact SDK signal reaches handler", async () => {
  const controller = new AbortController(); let seenSignal: AbortSignal | undefined;
  const tool: ToolDefinition = { name: "write_file", description: "injected custom meaning", inputSchema: { type: "object", properties: { marker: { type: "string" } }, required: ["marker"] }, promptGuidelines: ["injected guidance"], executionMode: "parallel", async handler(call) { seenSignal = call.signal; assert.deepEqual(call.args, { marker: "yes" }); assert.equal(call.toolCallId, "original-call"); return { ok: true, message: "original handler" }; } };
  const converted = toPiTool(tool, { currentTurnId: () => "original-turn" });
  assert.deepEqual(converted.parameters, tool.inputSchema);
  assert.equal(converted.description, tool.description);
  assert.equal(converted.executionMode, "parallel");
  assert.deepEqual(converted.promptGuidelines, tool.promptGuidelines);
  const result = await converted.execute("original-call", { marker: "yes" }, controller.signal, () => {}, {} as never);
  assert.equal(seenSignal, controller.signal);
  assert.equal(result.content[0].type, "text");
  assert.equal((result.details as { turnId: string }).turnId, "original-turn");
  assert.equal(describeTool, publicDescription, "legacy descriptions alias the one core schema operation");
});

test("production hook denies every native or unregistered tool and permits only injected names", () => {
  const hooks = new Map<string, (event: unknown) => unknown>(); let gateCalls = 0;
  const extension = buildGovernanceExtension(() => { gateCalls++; throw new Error("not production policy"); }, () => {}, true, { allowedToolNames: new Set(["ans_custom", "write_file"]) });
  extension.factory({ on: (name: string, fn: (event: unknown) => unknown) => { hooks.set(name, fn); } } as never);
  const before = hooks.get("tool_call")!;
  for (const name of ["bash", "write", "edit", "read", "run_shell", "unknown"]) assert.equal((before({ toolName: name, toolCallId: "call", input: {} }) as { block: boolean }).block, true);
  assert.equal(before({ toolName: "write_file", toolCallId: "call", input: { path: "any" } }), undefined);
  assert.equal(before({ toolName: "ans_custom", toolCallId: "call", input: {} }), undefined);
  assert.equal(gateCalls, 0, "production uses original injected handlers, never mirrored gate logic");
});

test("actual production bind registers injected tools only, freezes definition and emits exact Service turn", async () => temp(async dir => {
  const sdk = await engine(); let calls = 0; let originalSignal: AbortSignal | undefined;
  const tool: ToolDefinition = { name: "ans_marker", description: "injected marker", inputSchema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] }, async handler(call) { calls++; originalSignal = call.signal; assert.deepEqual(call.args, { value: "kept" }); return { ok: true, message: "marker handled" }; } };
  sdk.faux.setResponses([sdk.ai.fauxAssistantMessage([sdk.ai.fauxToolCall(tool.name, { value: "kept" })]), sdk.ai.fauxAssistantMessage("done")]);
  const opts = options(dir, [tool]);
  const session = await createRealPiRuntimeAdapter({ ...opts, config, logger: log }, sdk.dependencies).bindRole(makeRole());
  assert.deepEqual(sdk.native.getActiveToolNames(), ["ans_marker"]);
  assert.equal(sdk.constructed.noTools, "builtin");
  assert.match(sdk.native.systemPrompt, /角色：Pi适配器/);
  tool.handler = async () => { throw new Error("late mutation must not run"); };
  (tool.inputSchema.required as string[]).push("late");
  await session.prompt("exercise injection");
  const events = await drain(session);
  assert.equal(calls, 1); assert.ok(originalSignal instanceof AbortSignal);
  assert.equal(events.filter(e => (e.detail as { source?: string })?.source === "prompt-input").length, 0, "raw production Pi delegates input echo to Core");
  assert.equal(events.filter(e => e.kind === "tool_call").length, 1);
  assert.equal(session.runtime, "pi"); assert.equal(session.contextSource, "in-memory");
  assert.equal(events.filter(e => e.kind === "settled").length, 1);
  const settled = events.find(e => e.kind === "settled")!;
  assert.equal(settled.turnId, "injected-turn");
  assert.deepEqual(settled.detail, { turnId: "injected-turn", outcome: "completed" });
  assert.equal((await readdir(dir)).includes(".ans"), false);
}));

test("Service -> real Pi native wiring shares injected wait gate, captured customer context and one terminal", async () => temp(async dir => {
  const sdk = await engine(); let answer!: (value: { outcome: "answered"; value: { confirmed: boolean } }) => void;
  let arrived!: () => void; const waiting = new Promise<void>(r => { arrived = r; });
  let metadata: CustomerInputMetadata | undefined; let providerOpts: RuntimeProviderOptions | undefined;
  sdk.faux.setResponses([sdk.ai.fauxAssistantMessage([sdk.ai.fauxToolCall("request_confirmation", { title: "temporary request" })]), sdk.ai.fauxAssistantMessage("done")]);
  const adapter = createRuntimeAdapter({ runtime: "pi", gate: makeGate({ project: [], skill: [] }), projectRoot: dir, skillRoot: dir, promptTimeoutMs: 250, customerInput: (_req, meta) => { metadata = meta; arrived(); return new Promise(r => { answer = r; }); }, providerFactories: { pi: opts => { providerOpts = opts; return createRealPiRuntimeAdapter({ ...opts, config, logger: log }, sdk.dependencies); } } });
  const session = await adapter.bindRole(makeRole());
  const work = session.prompt("wait for confirmation"); await waiting;
  assert.equal(providerOpts!.interactionGate.isWaiting(), true);
  assert.ok(metadata?.signal instanceof AbortSignal);
  const turnId = metadata!.turnId; await pause(400);
  assert.equal(metadata!.signal!.aborted, false, "actual shared gate pauses both Service and Pi deadlines");
  answer({ outcome: "answered", value: { confirmed: true } }); await work;
  const events = await drain(session);
  assert.equal(providerOpts!.interactionGate.isWaiting(), false);
  const inputEchoes = events.filter(e => (e.detail as { source?: string })?.source === "prompt-input");
  assert.equal(inputEchoes.length, 1, "Core and production Pi together emit exactly one actual input");
  assert.equal(inputEchoes[0].turnId, turnId);
  assert.equal((inputEchoes[0].detail as { text: string }).text, "wait for confirmation");
  const start = events.find(e => e.kind === "tool_call")!;
  assert.equal((start.detail as { toolCallId?: string }).toolCallId, metadata!.toolCallId);
  assert.ok(metadata!.toolCallId);
  assert.equal(events.filter(e => e.kind === "settled").length, 1);
  assert.equal(events.at(-1)!.turnId, turnId);
  assert.equal((events.at(-1)!.detail as { outcome: string }).outcome, "completed");
}));

test("Pi cancellation forwards original customer signal; late consent stays aborted across next turn", async () => temp(async dir => {
  const sdk = await engine(); let reply!: (value: { outcome: "answered"; value: { confirmed: boolean } }) => void;
  let arrived!: () => void; const waiting = new Promise<void>(r => { arrived = r; });
  let original: CustomerInputMetadata | undefined; let id = "first-turn";
  const gate = createInteractionGate();
  const tools = buildGovernedTools(makeGate({ project: [], skill: [] }), { interactionGate: gate, currentTurnId: () => id, customerInput: (_req, meta) => { original = meta; arrived(); return new Promise(r => { reply = r; }); } });
  sdk.faux.setResponses([sdk.ai.fauxAssistantMessage([sdk.ai.fauxToolCall("request_confirmation", { title: "stop this request" })]), sdk.ai.fauxAssistantMessage("next")]);
  const session = await createRealPiRuntimeAdapter({ ...options(dir, tools), interactionGate: gate, currentTurnId: () => id, config, logger: log }, sdk.dependencies).bindRole(makeRole());
  const work = session.prompt("start"); await waiting;
  await Promise.all([session.abort!(), session.abort!()]); await work;
  assert.equal(original!.signal!.aborted, true); assert.equal(gate.isWaiting(), false);
  id = "second-turn"; sdk.faux.setResponses([sdk.ai.fauxAssistantMessage("continued")]);
  reply({ outcome: "answered", value: { confirmed: true } }); await session.prompt("continue");
  assert.equal(original!.turnId, "first-turn"); assert.equal(original!.signal!.aborted, true);
  const events = await drain(session); const terminal = events.filter(e => e.kind === "settled");
  assert.deepEqual(terminal.map(e => [e.turnId, (e.detail as { outcome: string }).outcome]), [["first-turn", "aborted"], ["second-turn", "completed"]]);
}));

test("native Pi storage starts fresh then restores actual native context, separate from ANS replay", async () => temp(async dir => {
  const sdk = await engine(); const storage = createRuntimeSessionStore({ projectRoot: dir, roleId: makeRole().id, runtime: "pi" });
  assert.deepEqual(await storage.readReplay(), []); assert.equal((await readdir(dir)).includes(".ans"), false);
  sdk.faux.setResponses([sdk.ai.fauxAssistantMessage("native saved")]);
  const adapter = () => createRealPiRuntimeAdapter({ ...options(dir), storage, config, logger: log }, sdk.dependencies);
  const first = await adapter().bindRole(makeRole()); assert.equal(first.contextSource, "fresh");
  await first.prompt("native history"); const nativeId = first.nativeSessionId; await first.dispose();
  assert.ok((await readdir(storage.nativeDirectory)).some(p => p.endsWith(".jsonl")));
  const second = await adapter().bindRole(makeRole());
  assert.equal(second.contextSource, "resumed"); assert.equal(second.nativeSessionId, nativeId);
  assert.ok(sdk.native.messages.some(m => m.role === "user" && JSON.stringify(m).includes("native history")));
  await second.dispose();
  assert.deepEqual(await storage.readReplay(), [], "native adapter does not pretend native JSONL is ANS replay");
}));

test("Pi legacy file migrates to native copy, retains original ID/context and never appends old role file", async () => temp(async dir => {
  const sdk = await engine(); const storage = createRuntimeSessionStore({ projectRoot: dir, roleId: makeRole().id, runtime: "pi" });
  const old = sdk.pi.SessionManager.create(dir, storage.legacyDirectory);
  old.appendMessage({ role: "user", content: "old Pi context", timestamp: Date.now() });
  const oldFile = old.getSessionFile()!; const before = await readFile(oldFile, "utf8");
  const selected = await selectSessionManager(sdk.pi.SessionManager, { cwd: dir, storage });
  assert.equal(selected.contextSource, "resumed"); assert.equal(selected.manager.getSessionId(), old.getSessionId());
  assert.equal(dirname(selected.sessionFile!), storage.nativeDirectory);
  selected.manager.appendMessage({ role: "user", content: "new context", timestamp: Date.now() });
  assert.equal(await readFile(oldFile, "utf8"), before);
  assert.match(await readFile(selected.sessionFile!, "utf8"), /new context/);
  assert.ok(selected.manager.buildSessionContext().messages.some(m => JSON.stringify(m).includes("old Pi context")));
}));

test("malformed native history rebuilds with recovered warning; never reads sibling Codex/Claude files", async () => temp(async dir => {
  const sdk = await engine(); const storage = createRuntimeSessionStore({ projectRoot: dir, roleId: makeRole().id, runtime: "pi" });
  await storage.prepareNativeDirectory!(); await writeFile(join(storage.nativeDirectory, "broken.jsonl"), "not a Pi session");
  const sibling = join(storage.legacyDirectory!, "codex", "native"); await mkdir(sibling, { recursive: true }); await writeFile(join(sibling, "foreign.jsonl"), "foreign Codex context");
  const session = await createRealPiRuntimeAdapter({ ...options(dir), storage, config, logger: log }, sdk.dependencies).bindRole(makeRole());
  assert.equal(session.contextSource, "recovered"); assert.match(session.contextWarning!, /重新建立会话/);
  assert.equal(sdk.native.messages.some(m => JSON.stringify(m).includes("foreign")), false);
  await session.dispose();
}));

test("store validate callback rejects directory symlink before Pi parse or new native write", async () => temp(async dir => {
  const sdk = await engine(); const outside = join(dir, "outside"); await mkdir(outside);
  const storage = createRuntimeSessionStore({ projectRoot: dir, roleId: makeRole().id, runtime: "pi" });
  await mkdir(dirname(storage.nativeDirectory), { recursive: true }); await symlink(outside, storage.nativeDirectory, "dir");
  await assert.rejects(selectSessionManager(sdk.pi.SessionManager, { cwd: dir, storage }), /普通目录/);
  assert.deepEqual(await readdir(outside), []);
}));

test("Pi storage refuses file symlink and role/runtime mismatch without touching other storage", async () => temp(async dir => {
  const sdk = await engine(); const storage = createRuntimeSessionStore({ projectRoot: dir, roleId: makeRole().id, runtime: "pi" }); await storage.prepareNativeDirectory!();
  const file = join(dir, "outside.jsonl"); await writeFile(file, "outside"); await symlink(file, join(storage.nativeDirectory, "link.jsonl"));
  await assert.rejects(selectSessionManager(sdk.pi.SessionManager, { cwd: dir, storage }), /普通文件/);
  assert.equal(await readFile(file, "utf8"), "outside");
  await assert.rejects(selectSessionManager(sdk.pi.SessionManager, { cwd: dir, storage: { ...storage, runtime: "codex" } }), /其他 runtime/);
  await assert.rejects(createRealPiRuntimeAdapter({ ...options(dir), storage: { ...storage, roleId: "other-role" }, config, logger: log }, sdk.dependencies).bindRole(makeRole()), /角色不匹配/);
}));

test("public injected factory accepts Model shape and keeps compose/load free of filesystem effects", async () => temp(async dir => {
  const previous = process.env.P1_FAKE_CREDENTIAL; process.env.P1_FAKE_CREDENTIAL = "offline-placeholder";
  try {
    const adapter = createPiRuntimeAdapter({ ...options(dir), providerId: config.providerId, modelId: config.modelId, baseUrl: config.baseUrl, apiKeyEnvVar: config.apiKeyEnvVar });
    assert.match((await adapter.composeContext(makeRole())).systemPrompt, /Pi适配器/);
    const session = await adapter.bindRole(makeRole()); assert.equal(session.contextSource, "in-memory"); await session.dispose();
    assert.deepEqual(await readdir(dir), []);
  } finally { if (previous === undefined) delete process.env.P1_FAKE_CREDENTIAL; else process.env.P1_FAKE_CREDENTIAL = previous; }
}));

test("migrated Service/Pi timers honor legacy env once and native timeout normalizes to one timed_out terminal", async () => temp(async dir => {
  const saved = { prompt: process.env.ANS_PI_PROMPT_TIMEOUT_MS, construct: process.env.ANS_PI_CONSTRUCT_TIMEOUT_MS };
  process.env.ANS_PI_PROMPT_TIMEOUT_MS = "45.9"; process.env.ANS_PI_CONSTRUCT_TIMEOUT_MS = "5000";
  try {
    const sdk = await engine(); let providerInput: RuntimeProviderOptions | undefined; let abortCalls = 0;
    let failPrompt: ((error: Error) => void) | undefined;
    const realLoad = sdk.dependencies.loadPi;
    sdk.dependencies.loadPi = async () => {
      const pi = await realLoad();
      return { ...pi, async createAgentSession(input) {
        const result = await pi.createAgentSession(input);
        // This controlled prompt does not run any provider or model/API request.
        result.session.prompt = () => new Promise<void>((_resolve, reject) => { failPrompt = reject; });
        result.session.abort = async () => { abortCalls++; failPrompt?.(new Error("fixture stopped")); };
        return result;
      } };
    };
    const adapter = createRuntimeAdapter({ runtime: "pi", gate: makeGate({ project: [], skill: [] }), projectRoot: dir, skillRoot: dir, turnLastResortMs: 45, providerFactories: { pi: opts => { providerInput = opts; return createRealPiRuntimeAdapter({ ...opts, config, logger: log }, sdk.dependencies); } } });
    const session = await adapter.bindRole(makeRole());
    assert.equal(providerInput!.promptTimeoutMs, 45); assert.equal(providerInput!.turnLastResortMs, 45); assert.equal(providerInput!.constructTimeoutMs, 5000);
    const began = Date.now(); await assert.rejects(session.prompt("timing fixture"), /超时/);
    assert.ok(Date.now() - began < 1000);
    assert.equal(abortCalls, 1, "Service and Pi cleanup reuse the same per-turn native abort");
    const events = await drain(session); const settled = events.filter(e => e.kind === "settled");
    assert.equal(settled.length, 1); assert.equal((settled[0].detail as { outcome: string }).outcome, "timed_out");
    assert.equal((settled[0].detail as { turnId: string }).turnId, settled[0].turnId);
  } finally {
    if (saved.prompt === undefined) delete process.env.ANS_PI_PROMPT_TIMEOUT_MS; else process.env.ANS_PI_PROMPT_TIMEOUT_MS = saved.prompt;
    if (saved.construct === undefined) delete process.env.ANS_PI_CONSTRUCT_TIMEOUT_MS; else process.env.ANS_PI_CONSTRUCT_TIMEOUT_MS = saved.construct;
  }
}));

test("native stop cleanup rejects promptly and quarantines actual bound session when SDK cannot finish", async () => temp(async dir => {
  const sdk = await engine(); let started!: () => void; const entered = new Promise<void>(r => { started = r; }); let abortCalls = 0;
  const realLoad = sdk.dependencies.loadPi;
  sdk.dependencies.loadPi = async () => {
    const pi = await realLoad(); return { ...pi, async createAgentSession(input) {
      const result = await pi.createAgentSession(input);
      result.session.prompt = () => { started(); return new Promise<void>(() => {}); };
      result.session.abort = () => { abortCalls++; return new Promise<void>(() => {}); };
      return result;
    } };
  };
  const session = await createRealPiRuntimeAdapter({ ...options(dir), promptTimeoutMs: 5, turnLastResortMs: 10, config, logger: log }, sdk.dependencies).bindRole(makeRole());
  const prompt = session.prompt("cleanup fixture"); await entered;
  const began = Date.now(); const stops = await Promise.allSettled([session.abort!(), session.abort!()]);
  assert.ok(Date.now() - began < 1200); assert.equal(abortCalls, 1);
  assert.ok(stops.every(result => result.status === "rejected"));
  await assert.rejects(prompt, /超时/);
  await assert.rejects(session.prompt("cannot reuse"), /重新建立会话/);
  const events = await drain(session); assert.equal(events.filter(e => e.kind === "settled").length, 1);
}));

test("Service saves actual fresh/resumed/recovered Pi metadata and public replay remains runtime-isolated", async () => temp(async dir => {
  const sdk = await engine(); const role = makeRole();
  const build = () => createRuntimeAdapter({ runtime: "pi", persistSession: true, projectRoot: dir, skillRoot: dir, gate: makeGate({ project: [], skill: [] }), providerFactories: { pi: input => createRealPiRuntimeAdapter({ ...input, config, logger: log }, sdk.dependencies) } });
  const storage = createRuntimeSessionStore({ projectRoot: dir, roleId: role.id, runtime: "pi" });
  sdk.faux.setResponses([sdk.ai.fauxAssistantMessage("first context")]);
  const fresh = await build().bindRole(role); await fresh.prompt("first"); await fresh.dispose();
  assert.equal((await storage.readLatest())!.contextSource, "fresh");
  const resumed = await build().bindRole(role); assert.equal(resumed.contextSource, "resumed");
  sdk.faux.setResponses([sdk.ai.fauxAssistantMessage("restored context")]); await resumed.prompt("second"); await resumed.dispose();
  assert.equal((await storage.readLatest())!.contextSource, "resumed");
  assert.equal((await storage.readLatest())!.nativeSessionId, resumed.nativeSessionId);
  for (const file of await readdir(storage.nativeDirectory)) await writeFile(join(storage.nativeDirectory, file), "broken native");
  const recovered = await build().bindRole(role); assert.equal(recovered.contextSource, "recovered");
  sdk.faux.setResponses([sdk.ai.fauxAssistantMessage("rebuilt context")]); await recovered.prompt("third"); await recovered.dispose();
  const record = (await storage.readLatest())!; assert.equal(record.contextSource, "recovered"); assert.match(record.contextWarning!, /重新建立会话/);
  assert.equal((await storage.readReplay()).filter(e => e.kind === "user").length, 3);
  const codex = createRuntimeSessionStore({ projectRoot: dir, roleId: role.id, runtime: "codex" });
  assert.equal(await codex.readLatest(), undefined); assert.deepEqual(await codex.readReplay(), []);
}));
