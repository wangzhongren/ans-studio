import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCodexRuntimeAdapter } from "../../src/provider/codex/session.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { createRuntimeSessionStore } from "../../src/provider/runtime/session-store.ts";
import type { ToolDefinition, WriteGate, RuntimeSessionStorage } from "../../src/model/runtime.ts";
import { harness, options, role, collect, start, tick, until, interactionGate } from "./fixtures.ts";

const allow: WriteGate = target => ({ allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "fixture" } });
const deny: WriteGate = () => ({ allowed: false, reason: "outside role boundary", allowedByRoot: { project: [], skill: [] } });
const temporary = () => mkdtemp(path.join(os.tmpdir(), "ans-codex-tests-"));

test("loading/factory is lazy; model/key required, optional official URL, userinfo rejected", async () => {
  const engines = harness();
  const adapter = createCodexRuntimeAdapter(options("/fixture", engines));
  assert.equal(engines.engines.length, 0);
  assert.match((await adapter.composeContext(role)).systemPrompt, /固定角色/);
  for (const [extra, expected] of [
    [{ modelId: "", env: { CODEX_API_KEY: "fake" } }, /MODEL/],
    [{ env: {} }, /API key/],
    [{ env: { CODEX_API_KEY: "fake" }, apiKeyEnvVar: "OTHER_KEY" }, /API key/],
    [{ baseUrl: "https://secret-user:secret-password@example.test/v1" }, /without credentials/],
  ] as const) await assert.rejects(createCodexRuntimeAdapter(options("/fixture", engines, extra)).bindRole(role), expected);
  assert.equal(engines.engines.length, 0);
  const session = await adapter.bindRole(role);
  assert.equal(engines.engines.length, 2);
  assert.ok(engines.engine.input.configOverrides.some(value => value.includes('base_url="https://api.openai.com/v1"')));
  assert.deepEqual(Object.keys(engines.engine.input.env).sort(), ["CODEX_API_KEY", "CODEX_HOME", "PATH"]);
  assert.equal(engines.engine.input.env.CODEX_API_KEY, "fake-codex-key");
  assert.equal(engines.engine.input.cwd.startsWith("/fixture"), false);
  await session.dispose();
  const fallback = await createCodexRuntimeAdapter(options("/fixture", harness(), { env: { OPENAI_API_KEY: "only-fallback" } })).bindRole(role);
  await fallback.dispose();
});

test("optional API address blank values use official default; explicit nonblank wins environment and invalid values stay redacted", async () => {
  const fallback = "https://api.openai.com/v1";
  const cases = [
    { environment: "", expected: fallback },
    { environment: " \t\n ", expected: fallback },
    { environment: "https://environment.example.test/v1", explicit: "", expected: fallback },
    { environment: "https://environment.example.test/v1", explicit: " \t ", expected: fallback },
    { environment: "https://environment.example.test/v1", explicit: " https://explicit.example.test/v1 ", expected: "https://explicit.example.test/v1" },
    { environment: " https://environment.example.test/v1 ", expected: "https://environment.example.test/v1" },
  ];
  for (const entry of cases) {
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, {
      baseUrl: entry.explicit,
      env: { CODEX_API_KEY: "fake-required-key", ANS_CODEX_MODEL: "environment-model", ANS_CODEX_BASE_URL: entry.environment },
    })).bindRole(role);
    try {
      assert.ok(engines.engine.input.configOverrides.some(value => value.includes(`base_url=${JSON.stringify(entry.expected)}`)));
      assert.equal(engines.engine.input.env.CODEX_API_KEY, "fake-required-key");
      assert.equal(engines.engine.requests.find(request => request.method === "thread/start")!.params.model, "fixture-model");
    } finally { await session.dispose(); }
  }
  for (const invalid of ["file:///private/fake-required-key", "https://private-user:private-password@example.test/v1"]) {
    const engines = harness();
    await assert.rejects(createCodexRuntimeAdapter(options("/fixture", engines, {
      env: { CODEX_API_KEY: "fake-required-key", ANS_CODEX_BASE_URL: invalid },
    })).bindRole(role), error => {
      const text = String(error);
      assert.equal(text.includes("fake-required-key"), false);
      assert.equal(text.includes("private-user"), false);
      assert.equal(text.includes("private-password"), false);
      assert.match(text, /without credentials/);
      return true;
    });
    assert.equal(engines.engines.length, 0);
  }
});

test("bound model/address/key and error redaction keep the same captured environment after async transport starts", async () => {
  const engines = harness();
  const env = { CODEX_API_KEY: "captured-secret-key", ANS_CODEX_MODEL: "captured-model", ANS_CODEX_BASE_URL: " https://captured.example.test/v1 " };
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, {
    modelId: undefined, env,
    async engineFactory(input) {
      env.CODEX_API_KEY = "later-secret-key";
      env.ANS_CODEX_MODEL = "later-model";
      env.ANS_CODEX_BASE_URL = "https://later.example.test/v1";
      return engines.factory(input);
    },
  })).bindRole(role);
  const events = collect(session);
  try {
    assert.ok(engines.engines.every(engine => engine.input.env.CODEX_API_KEY === "captured-secret-key"));
    assert.ok(engines.engine.input.configOverrides.some(value => value.includes('base_url="https://captured.example.test/v1"')));
    assert.equal(engines.engine.requests.find(request => request.method === "thread/start")!.params.model, "captured-model");
    const turn = await start(session, engines.engine);
    engines.engine.finish("failed", "captured-secret-key provider error");
    await assert.rejects(turn.completion, error => {
      assert.match(String(error), /REDACTED/);
      assert.equal(String(error).includes("captured-secret-key"), false);
      return true;
    });
  } finally { await session.dispose(); await events.done; }
  assert.equal(JSON.stringify(events.entries).includes("captured-secret-key"), false);
});

test("config enumeration/verification occurs before thread, no unsafe config/catalog fallback", async () => {
  for (const behavior of [{ configFails: true }, { foreignRemains: true }, { unsafeSandbox: true }, { catalogForeign: true }]) {
    const engines = harness(behavior);
    await assert.rejects(createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(role));
    assert.equal(engines.engines.every(engine => engine.closed), true);
    if (behavior.configFails || behavior.foreignRemains) assert.equal(engines.engines.flatMap(engine => engine.requests).some(request => request.method.startsWith("thread/")), false);
  }
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(role);
  assert.equal(engines.engines[0].requests.some(request => request.method.startsWith("thread/")), false);
  const init = engines.engine.requests.find(request => request.method === "initialize")!;
  assert.deepEqual(init.params.capabilities, { experimentalApi: true, explicitGatewayOauth: true });
  assert.ok(engines.engine.input.configOverrides.includes('mcp_servers={"foreign"={enabled=false}}'));
  assert.ok(engines.engine.input.configOverrides.includes("features.shell_tool=false"));
  await session.dispose();
});

test("real MCP callbacks use injected schemas and gates: deny/throw have zero writes, allow writes", async () => {
  const root = await temporary();
  try {
    for (const gate of [deny, (() => { throw new Error("gate exploded"); }) as WriteGate, allow]) {
      const engines = harness();
      const tools = buildGovernedTools(gate, { writeRoot: root, readRoot: root });
      const session = await createCodexRuntimeAdapter(options(root, engines, { tools })).bindRole(role);
      const events = collect(session);
      const thread = engines.engine.requests.find(request => request.method === "thread/start")!;
      const definitions = thread.params.dynamicTools as Array<{ name: string; inputSchema: unknown }>;
      assert.deepEqual(definitions.find(tool => tool.name === "ans_write_file")?.inputSchema, tools.find(tool => tool.name === "write_file")?.inputSchema);
      const turn = await start(session, engines.engine);
      const receipt = await engines.engine.call("write_file", { path: "nested/file.txt", content: "written by ANS" });
      assert.equal(receipt.success, gate === allow);
      if (gate !== allow) assert.deepEqual(await readdir(root), []);
      else assert.equal(await readFile(path.join(root, "nested/file.txt"), "utf8"), "written by ANS");
      engines.engine.finish(); await turn.completion; await session.dispose(); await events.done;
      const called = events.entries.find(event => event.kind === "tool_call")!;
      assert.equal((called.detail as { toolName: string }).toolName, "write_file");
      assert.equal(called.turnId, "ans-turn");
      assert.equal(events.entries.filter(event => event.kind === "settled").length, 1);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("shell deny/unknown native tool never executes and optional capabilities only come from injection", async () => {
  const root = await temporary();
  try {
    let gateCalls = 0;
    const engines = harness();
    const tools = buildGovernedTools(allow, { writeRoot: root, shellCwd: root, shellGate: async () => { gateCalls++; return { allow: false, reason: "shell denied", by: "fixture" }; } });
    const session = await createCodexRuntimeAdapter(options(root, engines, { tools })).bindRole(role);
    const turn = await start(session, engines.engine);
    assert.equal((await engines.engine.call("run_shell", { command: `${process.execPath} -e "require('fs').writeFileSync('escaped', 'bad')"` })).success, false);
    assert.equal(gateCalls, 1);
    assert.equal((await engines.engine.call("dispatch_task", { roleId: "other", task: "unsafe" })).success, false);
    assert.equal((await engines.engine.call("apply_patch", {})).success, false);
    assert.equal((await engines.engine.call("write_file", { path: "bad", content: "bad" }, { tool: "exec_command" })).success, false);
    assert.equal((await engines.engine.handler!("item/fileChange/requestApproval", {})).decision, "decline");
    assert.deepEqual(await engines.engine.handler!("item/permissions/requestApproval", {}), { permissions: {}, scope: "turn" });
    assert.deepEqual(await readdir(root), []);
    engines.engine.finish(); await turn.completion; await session.dispose();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("sequential MCP calls keep original turn signal, queued writes and late old-turn requests cannot cross abort", async () => {
  const root = await temporary();
  try {
    let release!: () => void;
    let began = false;
    let writes = 0;
    const signals: AbortSignal[] = [];
    const block: ToolDefinition = { name: "hold", description: "hold fixture", inputSchema: { type: "object" }, executionMode: "sequential", async handler(call) { began = true; signals.push(call.signal!); await new Promise<void>(resolve => { release = resolve; }); return { ok: true, message: "hold done" }; } };
    const write: ToolDefinition = { name: "write", description: "write fixture", inputSchema: { type: "object" }, executionMode: "sequential", async handler(call) { signals.push(call.signal!); writes++; return { ok: true, message: "write done" }; } };
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options(root, engines, { tools: [block, write] })).bindRole(role);
    const first = await start(session, engines.engine);
    const holding = engines.engine.call("hold", {});
    await until(() => began);
    const queued = engines.engine.call("write", {});
    await tick();
    assert.equal(writes, 0);
    await session.abort!(); await first.completion;
    assert.equal(signals[0].aborted, true);
    const second = await start(session, engines.engine, "next");
    assert.equal((await engines.engine.call("write", {}, { turnId: first.nativeTurnId })).success, false);
    release();
    assert.equal((await holding).success, false);
    assert.equal((await queued).success, false);
    assert.equal(writes, 0);
    assert.equal((await engines.engine.call("write", {})).success, true);
    assert.equal(writes, 1);
    assert.notEqual(signals.at(-1), signals[0]);
    engines.engine.finish(); await second.completion; await session.dispose();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("customer wait pauses deadline; abort and late confirmed do not authorize, next turn can continue", async () => {
  const gate = interactionGate();
  let answer!: (value: { outcome: "answered"; value: { confirmed: true } }) => void;
  let waiting = false;
  const engines = harness();
  const tools = buildGovernedTools(deny, { interactionGate: gate, customerInput: () => { waiting = true; return new Promise(resolve => { answer = resolve; }); } });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { tools, interactionGate: gate, promptTimeoutMs: 100 })).bindRole(role);
  const first = await start(session, engines.engine);
  const confirmation = engines.engine.call("request_confirmation", { title: "fixture approval" });
  await until(() => waiting);
  await tick(150);
  assert.equal(engines.engine.requests.some(request => request.method === "turn/interrupt"), false);
  await session.abort!(); await first.completion;
  answer({ outcome: "answered", value: { confirmed: true } });
  assert.equal((await confirmation).success, false);
  const second = await start(session, engines.engine, "next");
  engines.engine.finish(); await second.completion; await session.dispose();
});

test("upstream tool-request cancellation invalidates original signal; timeout/failed turn settle exactly once", async () => {
  const gate = interactionGate();
  let signal: AbortSignal | undefined;
  const engines = harness();
  const tool: ToolDefinition = { name: "wait", description: "fixture", inputSchema: { type: "object" }, async handler(call) { signal = call.signal; return new Promise(resolve => { call.signal!.addEventListener("abort", () => resolve({ ok: false, message: "cancelled" }), { once: true }); }); } };
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { tools: [tool], interactionGate: gate })).bindRole(role);
  const events = collect(session);
  const first = await start(session, engines.engine);
  const upstream = new AbortController();
  const call = engines.engine.call("wait", {}, {}, upstream);
  await until(() => !!signal);
  upstream.abort();
  await assert.rejects(first.completion, /native tool request ended/);
  assert.equal((await call).success, false);
  assert.equal(signal!.aborted, true);
  const second = await start(session, engines.engine);
  engines.engine.finish("failed", "fake-codex-key fake-openai-key failure");
  await assert.rejects(second.completion, /REDACTED/);
  await session.dispose(); await events.done;
  assert.equal(events.entries.filter(event => event.kind === "settled").length, 2);
  assert.equal(JSON.stringify(events.entries).includes("fake-codex-key"), false);
  const timeoutEngine = harness();
  const timed = await createCodexRuntimeAdapter(options("/fixture", timeoutEngine, { promptTimeoutMs: 40 })).bindRole(role);
  const timedEvents = collect(timed);
  const timeoutTurn = await start(timed, timeoutEngine.engine);
  await assert.rejects(timeoutTurn.completion, /timed_out/);
  await timed.dispose(); await timedEvents.done;
  assert.equal((timedEvents.entries.at(-1)!.detail as { outcome: string }).outcome, "timed_out");
});

test("stop is idempotent and bounded; hanging interrupt quarantines rather than claiming continued session", async () => {
  const engines = harness({ interruptHangs: true });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(role);
  const turn = await start(session, engines.engine);
  const began = Date.now();
  const first = Promise.resolve(session.abort!());
  const second = Promise.resolve(session.abort!());
  await assert.rejects(first, /interrupt.*timed out/);
  await assert.rejects(second, /interrupt.*timed out/);
  assert.ok(Date.now() - began < 1200);
  await turn.completion;
  assert.equal(engines.engine.requests.filter(request => request.method === "turn/interrupt").length, 1);
  await assert.rejects(session.prompt("next"), /quarantined/);
  await session.dispose();
});

test("exact role/runtime native store checks, confirmed resume vs recovered; later model failure retains resumed", async () => {
  const root = await temporary();
  try {
    const store = createRuntimeSessionStore({ projectRoot: root, roleId: role.id, runtime: "codex" });
    assert.equal(existsSync(store.directory), false);
    await store.saveSession({ version: 1, id: "index", runtime: "codex", roleId: role.id, nativeSessionId: "saved-native", contextSource: "fresh", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    for (const resumeFails of [false, true]) {
      const engines = harness({ resumeFails });
      const session = await createCodexRuntimeAdapter(options(root, engines, { storage: store })).bindRole(role);
      assert.equal(session.contextSource, resumeFails ? "recovered" : "resumed");
      assert.equal(session.contextWarning !== undefined, resumeFails);
      const resume = engines.engine.requests.find(request => request.method === "thread/resume")!;
      assert.equal(resume.params.sandbox, "read-only");
      assert.equal(resume.params.approvalPolicy, "never");
      const turn = await start(session, engines.engine);
      engines.engine.finish("failed", "model unavailable");
      await assert.rejects(turn.completion, /model unavailable/);
      assert.equal(session.contextSource, resumeFails ? "recovered" : "resumed");
      await session.dispose();
    }
    await assert.rejects(createCodexRuntimeAdapter(options(root, harness(), { storage: { ...store, runtime: "pi" } as RuntimeSessionStorage })).bindRole(role), /mismatch/);
    const other = createRuntimeSessionStore({ projectRoot: root, roleId: "other-role", runtime: "codex" });
    await assert.rejects(createCodexRuntimeAdapter(options(root, harness(), { storage: other })).bindRole(role), /mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("native directory symlink rejected before engine, absent persistence creates no .ans, images stay temporary", async () => {
  const root = await temporary();
  const outside = await temporary();
  try {
    const engines = harness();
    const session = await createCodexRuntimeAdapter(options(root, engines)).bindRole(role);
    const before = engines.engine.turns;
    const prompt = session.prompt("image", { images: [{ type: "image", mimeType: "image/png", data: Buffer.from("fixture image").toString("base64") }] });
    await until(() => engines.engine.turns > before);
    const input = engines.engine.requests.find(request => request.method === "turn/start")!.params.input as Array<{ type: string; path?: string }>;
    const imagePath = input.find(item => item.type === "localImage")!.path!;
    assert.equal(await readFile(imagePath, "utf8"), "fixture image");
    assert.equal(existsSync(path.join(root, ".ans")), false);
    engines.engine.finish(); await prompt; await session.dispose();
    assert.equal(existsSync(imagePath), false);
    const store = createRuntimeSessionStore({ projectRoot: root, roleId: role.id, runtime: "codex" });
    await store.prepareNativeDirectory!();
    await rm(store.nativeDirectory, { recursive: true });
    await symlink(outside, store.nativeDirectory, "dir");
    const refused = harness();
    await assert.rejects(createCodexRuntimeAdapter(options(root, refused, { storage: store })).bindRole(role), /会话目录不是普通目录/);
    assert.equal(refused.engines.length, 0);
    assert.deepEqual(await readdir(outside), []);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("all injected ANS capability callbacks keep receipts/turn metadata; denied customer and failed report stay failed", async () => {
  const received: Array<Record<string, unknown>> = [];
  const engines = harness();
  const tools = buildGovernedTools(deny, {
    runtime: "codex", roleId: role.id, currentTurnId: () => "service-turn-fixed",
    customerInput: () => ({ outcome: "declined" }),
    reportHandback: (payload, metadata) => { received.push({ payload, metadata }); return { ok: false, message: "report rejected" }; },
    dispatchTask: (payload, metadata) => { received.push({ payload, metadata }); return { ok: true, message: "dispatch accepted" }; },
    shellVerdict: () => { throw new Error("verdict failed"); },
    shellGate: async () => ({ allow: false, reason: "deny", by: "fixture" }),
  });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { tools, currentTurnId: () => "service-turn-fixed" })).bindRole(role);
  const turn = await start(session, engines.engine);
  assert.equal((await engines.engine.call("request_confirmation", { title: "decline fixture" })).success, false);
  assert.equal((await engines.engine.call("request_choice", { title: "choose", options: [{ id: "one", label: "one" }] })).success, false);
  assert.equal((await engines.engine.call("submit_report", { status: "completed", summary: "fixture report" })).success, false);
  assert.equal((await engines.engine.call("dispatch_task", { roleId: "other", task: "fixture task" })).success, true);
  assert.equal((await engines.engine.call("report_shell_verdict", { verdict: "allow" })).success, false);
  for (const item of received) assert.deepEqual(item.metadata, { turnId: "service-turn-fixed", roleId: role.id, runtime: "codex" });
  const specs = engines.engine.requests.find(request => request.method === "thread/start")!.params.dynamicTools as Array<{ name: string }>;
  assert.equal(specs.length, 9);
  assert.ok(specs.every(spec => spec.name.startsWith("ans_")));
  engines.engine.finish(); await turn.completion; await session.dispose();
});

test("call IDs differ across restarts; all shared credential values are scrubbed from model/tool outputs", async () => {
  const identifiers: string[] = [];
  for (let index = 0; index < 2; index++) {
    const engines = harness();
    const tool: ToolDefinition = { name: "echo", description: "fixture", inputSchema: { type: "object" }, async handler(call) { identifiers.push(call.toolCallId!); return { ok: false, message: "fake-codex-key fake-openai-key fake-oauth-key fake-codex-access fake-custom-key" }; } };
    const session = await createCodexRuntimeAdapter(options("/fixture", engines, { tools: [tool], apiKeyEnvVar: "CUSTOM_CODEX_KEY", env: { CODEX_API_KEY: "fake-codex-key", OPENAI_API_KEY: "fake-openai-key", CODEX_ACCESS_TOKEN: "fake-codex-access", CLAUDE_CODE_OAUTH_TOKEN: "fake-oauth-key", CUSTOM_CODEX_KEY: "fake-custom-key" } })).bindRole(role);
    const events = collect(session);
    const turn = await start(session, engines.engine);
    const result = await engines.engine.call("echo", {}, { callId: "same-native-call-id" });
    assert.equal(result.success, false);
    assert.equal(JSON.stringify(result).includes("fake-"), false);
    engines.engine.message("fake-oauth-key fake-custom-key");
    engines.engine.finish(); await turn.completion; await session.dispose(); await events.done;
    assert.equal(JSON.stringify(events.entries).includes("fake-"), false);
  }
  assert.notEqual(identifiers[0], identifiers[1]);
});

test("actual native process JSON-RPC parser routes callbacks and serverRequest/resolved cancellation", async () => {
  let signal: AbortSignal | undefined;
  let invoked = 0;
  const tool: ToolDefinition = { name: "probe", description: "native process fixture", inputSchema: { type: "object" }, async handler(call) {
    invoked++;
    if (invoked === 1) return { ok: true, message: "first process callback" };
    signal = call.signal;
    return new Promise(resolve => call.signal!.addEventListener("abort", () => resolve({ ok: false, message: "upstream cancelled" }), { once: true }));
  } };
  const session = await createCodexRuntimeAdapter(options("/fixture", harness(), {
    tools: [tool], engineFactory: undefined,
    cliPath: fileURLToPath(new URL("./fixtures/native-cli.mjs", import.meta.url)),
  })).bindRole(role);
  const events = collect(session);
  await session.prompt("normal");
  await assert.rejects(session.prompt("cancel-upstream"), /native tool request ended/);
  assert.equal(invoked, 2);
  assert.equal(signal!.aborted, true);
  const firstDisposal = session.dispose();
  assert.equal(session.dispose(), firstDisposal);
  await firstDisposal; await events.done;
  assert.equal(events.entries.filter(event => event.kind === "settled").length, 2);
});

test("owned native process group cleanup kills a wrapper and child that ignore SIGTERM", { skip: process.platform === "win32" }, async () => {
  const root = await temporary();
  let childPid = 0;
  const tool: ToolDefinition = { name: "probe", description: "owned child fixture", inputSchema: { type: "object" }, async handler(call) { childPid = Number(call.args.childPid); return { ok: true, message: "child PID received" }; } };
  const session = await createCodexRuntimeAdapter(options(root, harness(), { tools: [tool], engineFactory: undefined, cliPath: fileURLToPath(new URL("./fixtures/native-cli.mjs", import.meta.url)) })).bindRole(role);
  try {
    const marker = path.join(root, "orphan-write");
    await session.prompt(`owned-tree:${marker}`);
    assert.ok(childPid > 0);
    await tick(50); // Ensure the child has installed its SIGTERM handler before disposal.
    const began = Date.now();
    await session.dispose();
    assert.ok(Date.now() - began < 1000);
    await tick(950);
    assert.equal(existsSync(marker), false);
    assert.throws(() => process.kill(childPid, 0), { code: "ESRCH" });
  } finally { await session.dispose(); await rm(root, { recursive: true, force: true }); }
});
