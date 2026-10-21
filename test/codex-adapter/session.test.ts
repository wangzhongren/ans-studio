import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
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

test("G-4 installed-skills section splices verbatim as the last segment or renders nothing", async () => {
  const root = await temporary();
  try {
    const engines = harness();
    const adapter = createCodexRuntimeAdapter(options(root, engines));
    const bare = (await adapter.composeContext(role)).systemPrompt;
    assert.equal(bare.includes("本角色已安装技能"), false, "零技能 ⇒ 零渲染");
    // 坏件（缺 SKILL.md）跳过、绝不拒开会话：提示逐字不变（诊断面在渲染单一来源内）。
    await mkdir(path.join(root, "docs", "skills", "broken"), { recursive: true });
    await writeFile(path.join(root, "docs", "skills", "broken", "install.md"), "- 用途：broken fixture\n- 适用角色：codex-fixture\n- 状态：installed\n- 安装日期：2026-10-16\n");
    assert.equal((await adapter.composeContext(role)).systemPrompt, bare, "坏件 ⇒ 该条不注入、逐字不变");
    const session = await adapter.bindRole(role);
    await session.dispose();
    await rm(path.join(root, "docs", "skills", "broken"), { recursive: true, force: true });
    // 命中条目：整段逐字拼入（sha256 由测试独立按当刻字节算）。
    await mkdir(path.join(root, "docs", "skills", "probe"), { recursive: true });
    await writeFile(path.join(root, "docs", "skills", "probe", "install.md"), "- 用途：probe fixture 用途\n- 适用角色：codex-fixture\n- 状态：installed\n- 安装日期：2026-10-16\n");
    const body = Buffer.from("probe skill body\n");
    await writeFile(path.join(root, "docs", "skills", "probe", "SKILL.md"), body);
    const digest = createHash("sha256").update(body).digest("hex");
    const section = [
      "## 本角色已安装技能（动手前先读，按序）",
      `1. docs/skills/probe/SKILL.md（用途：probe fixture 用途；sha256:${digest}；安装于 2026-10-16）`,
      "内容以文件当刻字节为准；读到与派发描述/版本不符 ⇒ 停止并交 blocked 报告（不得猜）。",
    ].join("\n");
    const wired = (await adapter.composeContext(role)).systemPrompt;
    assert.equal(wired, `${bare}\n\n${section}`, "整段逐字追加、仅多一段");
    // 假 engine 路径：bindRole 的 composeContext 同源，注入节经 thread/start developerInstructions 原样到达引擎。
    const wiredEngines = harness();
    const wiredSession = await createCodexRuntimeAdapter(options(root, wiredEngines)).bindRole(role);
    const thread = wiredEngines.engine.requests.find(request => request.method === "thread/start")!;
    assert.equal(thread.params.developerInstructions, wired);
    await wiredSession.dispose();
  } finally { await rm(root, { recursive: true, force: true }); }
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
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { tools, interactionGate: gate, turnLastResortMs: 100 })).bindRole(role);
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
  const timed = await createCodexRuntimeAdapter(options("/fixture", timeoutEngine, { turnLastResortMs: 40 })).bindRole(role);
  const timedEvents = collect(timed);
  const timeoutTurn = await start(timed, timeoutEngine.engine);
  await assert.rejects(timeoutTurn.completion, /Codex 本轮运行超过最后兜底（40ms）/);
  await timed.dispose(); await timedEvents.done;
  assert.equal((timedEvents.entries.at(-1)!.detail as { outcome: string }).outcome, "timed_out");
  assert.match(JSON.stringify(timedEvents.entries.at(-1)!.detail), /最后兜底/);
});

test("inspect timeout never aborts the turn; only the injected last resort aborts, with distinguishing text", async () => {
  const engines = harness();
  // 到点检查时限（promptTimeoutMs）刻意设得远小于兜底：若仍被当作整轮 abort 时限，120ms 内必中止。
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { promptTimeoutMs: 20, turnLastResortMs: 300 })).bindRole(role);
  const events = collect(session);
  const turn = await start(session, engines.engine);
  let settled = false;
  void turn.completion.then(() => { settled = true; }, () => { settled = true; });
  await tick(120);
  assert.equal(engines.engine.requests.some(request => request.method === "turn/interrupt"), false, "到点检查不得中止整轮");
  assert.equal(settled, false, "到点检查时限不得结束整轮");
  await assert.rejects(turn.completion, /Codex 本轮运行超过最后兜底（300ms）/);
  assert.equal(engines.engine.requests.filter(request => request.method === "turn/interrupt").length, 1);
  await session.dispose(); await events.done;
  assert.equal((events.entries.at(-1)!.detail as { outcome: string }).outcome, "timed_out");
  assert.match((events.entries.at(-1)!.detail as { error?: string }).error ?? "", /最后兜底/);
  assert.equal(JSON.stringify(events.entries).includes("prompt 超时"), false);
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
  const root = await temporary();
  await mkdir(path.join(root, "sub"));
  await writeFile(path.join(root, "hello.txt"), "fixture");
  const received: Array<Record<string, unknown>> = [];
  const engines = harness();
  const tools = buildGovernedTools(deny, {
    readRoot: root,
    runtime: "codex", roleId: role.id, currentTurnId: () => "service-turn-fixed",
    customerInput: () => ({ outcome: "declined" }),
    reportHandback: (payload, metadata) => { received.push({ payload, metadata }); return { ok: false, message: "report rejected" }; },
    dispatchTask: (payload, metadata) => { received.push({ payload, metadata }); return { ok: true, message: "dispatch accepted" }; },
    shellVerdict: () => { throw new Error("verdict failed"); },
    shellGate: async () => ({ allow: false, reason: "deny", by: "fixture" }),
  });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { tools, currentTurnId: () => "service-turn-fixed" })).bindRole(role);
  const turn = await start(session, engines.engine);
  try {
    assert.equal((await engines.engine.call("request_confirmation", { title: "decline fixture" })).success, false);
    assert.equal((await engines.engine.call("request_choice", { title: "choose", options: [{ id: "one", label: "one" }] })).success, false);
    assert.equal((await engines.engine.call("submit_report", { status: "completed", summary: "fixture report" })).success, false);
    assert.equal((await engines.engine.call("dispatch_task", { roleId: "other", task: "fixture task" })).success, true);
    assert.equal((await engines.engine.call("report_shell_verdict", { verdict: "allow" })).success, false);
    for (const item of received) assert.deepEqual(item.metadata, { turnId: "service-turn-fixed", roleId: role.id, runtime: "codex" });
    const specs = engines.engine.requests.find(request => request.method === "thread/start")!.params.dynamicTools as Array<{ name: string }>;
    assert.equal(specs.length, 10);
    assert.ok(specs.every(spec => spec.name.startsWith("ans_")));
    assert.ok(specs.some(spec => spec.name === "ans_list_dir"), "普通角色工具面含只读 list_dir（运行时核心新增）");
    // 注册即可执行：临时读取根下如实列出一层（目录带 `/`），不是「未注册工具」拒绝。
    const listed = await engines.engine.call("list_dir", { path: "." });
    assert.equal(listed.success, true);
    assert.match(JSON.stringify(listed), /hello\.txt/);
    assert.match(JSON.stringify(listed), /sub\//);
  } finally {
    engines.engine.finish(); await turn.completion.catch(() => {}); await session.dispose();
    await rm(root, { recursive: true, force: true });
  }
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

test("actual native process JSON-RPC parser routes callbacks and serverRequest/resolved cancellation", async t => {
  let signal: AbortSignal | undefined;
  let invoked = 0;
  const tool: ToolDefinition = { name: "probe", description: "native process fixture", inputSchema: { type: "object" }, async handler(call) {
    invoked++;
    if (invoked === 1) return { ok: true, message: "first process callback" };
    signal = call.signal;
    return new Promise(resolve => call.signal!.addEventListener("abort", () => resolve({ ok: false, message: "upstream cancelled" }), { once: true }));
  } };
  const fixture = fileURLToPath(new URL("./fixtures/native-cli.mjs", import.meta.url));
  const originalSpawn = childProcess.spawn;
  let launches = 0;
  // Windows cannot execute a POSIX shebang. Change only this fixture's OS
  // launch, retaining a real process and the production JSON-RPC transport.
  t.mock.method(childProcess, "spawn", (...args: Parameters<typeof childProcess.spawn>) => {
    if (args[0] !== fixture) return originalSpawn(...args);
    launches++;
    const child = originalSpawn(process.execPath, [fixture, ...(args[1] as readonly string[])], args[2]);
    assert.ok(child.pid && child.pid > 0);
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); });
  const session = await createCodexRuntimeAdapter(options("/fixture", harness(), {
    tools: [tool], engineFactory: undefined,
    cliPath: fixture,
  })).bindRole(role);
  assert.equal(launches, 1);
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

test("required display capabilities reject at factory before any native, MCP or storage effects", async () => {
  const engines = harness();
  let effects = 0;
  const validProjector: NonNullable<import("../../src/model/runtime.ts").RuntimeProviderOptions["projectToolEvent"]> = () => { throw new Error("not reached"); };
  for (const capabilities of [
    {}, { projectToolEvent: validProjector }, { registerToolDisplayProfile: () => {} },
    { projectToolEvent: 1, registerToolDisplayProfile: () => {} },
    { projectToolEvent: validProjector, registerToolDisplayProfile: "invalid" },
  ]) {
    assert.throws(() => createCodexRuntimeAdapter(options("/fixture", engines, {
      toolDisplayMode: "required-v1", mcpLoader: async () => { effects++; throw new Error("not reached"); },
      storage: { prepareNativeDirectory: async () => { effects++; } } as RuntimeSessionStorage,
      ...capabilities as Partial<import("../../src/provider/codex/session.ts").CodexRuntimeAdapterOptions>,
    })), /requires projector\/register/);
  }
  assert.equal(effects, 0);
  assert.equal(engines.engines.length, 0);
});

test("profile registers selected credential and named extras from the same immutable bind snapshot before effects", async () => {
  const engines = harness();
  const env = { CUSTOM: "fake-selected", EXTRA: "fake-extra", UNLISTED: "fake-unlisted", PATH: process.env.PATH };
  let profile: import("../../src/model/runtime.ts").RuntimeToolDisplayProfileV1 | undefined;
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, {
    env, apiKeyEnvVar: "CUSTOM", toolDisplayCredentialEnvNames: ["EXTRA", "CUSTOM", "MISSING"],
    registerToolDisplayProfile(value) {
      assert.equal(engines.engines.length, 0);
      profile = value;
      env.CUSTOM = "changed-after-snapshot";
      env.PATH = "changed-path";
    },
  })).bindRole(role);
  assert.deepEqual(profile, { apiKeyEnvVar: "CUSTOM", credentials: [
    { name: "CUSTOM", value: "fake-selected" }, { name: "EXTRA", value: "fake-extra" }, { name: "MISSING", value: undefined },
  ] });
  assert.equal(engines.engine.input.env.CODEX_API_KEY, "fake-selected");
  assert.notEqual(engines.engine.input.env.PATH, "changed-path");
  await session.dispose();
  const refused = harness();
  let storageEffects = 0;
  await assert.rejects(createCodexRuntimeAdapter(options("/fixture", refused, {
    registerToolDisplayProfile() { throw new Error("profile rejected"); },
    storage: { validateNativeDirectory: async () => { storageEffects++; } } as RuntimeSessionStorage,
  })).bindRole(role), /profile rejected/);
  assert.equal(refused.engines.length, 0);
  assert.equal(storageEffects, 0);
});

test("injected display receives real handler facts, rules, error and execution; opaque identities bypass legacy scrub", async () => {
  const engines = harness();
  const sources: import("../../src/model/runtime.ts").RuntimeToolEventFactsV1[] = [];
  const handlerIds: string[] = [];
  const secret = "fake-codex-key";
  const execution = { exitCode: 7, stdout: "stdout sentinel", stderr: "stderr sentinel", error: "process sentinel" };
  let count = 0;
  const tools: ToolDefinition[] = [{ name: "run_shell", description: "fixture", displayInputRule: "core-command-v1", inputSchema: { type: "object" }, async handler(call) {
    handlerIds.push(call.toolCallId!);
    count++;
    if (count === 2) throw new Error(`error ${secret}`);
    if (count === 3) throw { raw: "arbitrary object must stay absent" };
    return { ok: false, message: "model original sentinel", execution };
  } }, { name: "read_file", description: "custom no rule", inputSchema: { type: "object" }, async handler() { return { ok: true, message: "custom result" }; } }];
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, {
    tools, toolDisplayMode: "required-v1", currentTurnId: () => `turn:${secret}`, registerToolDisplayProfile() {},
    projectToolEvent(source, redact) {
      assert.ok("phase" in source);
      sources.push(source);
      let summary = "safe start";
      if (source.phase === "result") summary = redact!(source.result?.message ?? source.error?.message ?? "generic failure");
      return { runtime: source.runtime, roleId: source.roleId, turnId: source.turnId, kind: source.phase === "start" ? "tool_call" : "denied", summary,
        detail: { toolName: source.toolName, toolCallId: source.toolCallId, turnId: source.turnId, phase: source.phase } };
    },
  })).bindRole(role);
  const events = collect(session);
  const turn = await start(session, engines.engine);
  const args = { cmd: `echo ${secret}`, arbitrary: "raw never queued" };
  const receipt = await engines.engine.call("run_shell", args, { callId: `native:${secret}` });
  assert.deepEqual(receipt, { success: false, contentItems: [{ type: "inputText", text: "model original sentinel" }] });
  await engines.engine.call("run_shell", {});
  await engines.engine.call("run_shell", {});
  await engines.engine.call("read_file", { file_path: "custom target" });
  engines.engine.finish(); await turn.completion; await session.dispose(); await events.done;
  assert.equal(sources.length, 8);
  assert.deepEqual(sources.map(source => source.origin), Array.from({ length: 4 }, () => ["handler-start", "handler-result"]).flat());
  assert.deepEqual(sources[0].input, { rule: "core-command-v1", args });
  assert.equal(sources[0].toolCallId, handlerIds[0]);
  assert.equal(sources[0].turnId, `turn:${secret}`);
  const first = sources[1]; assert.equal(first.phase, "result");
  if (first.phase === "result") assert.deepEqual(first.result, { ok: false, message: "model original sentinel", execution });
  const thrown = sources[3]; assert.equal(thrown.phase, "result");
  if (thrown.phase === "result") { assert.deepEqual(thrown.error, { message: `error ${secret}` }); assert.equal(thrown.result, undefined); }
  const nonError = sources[5]; if (nonError.phase === "result") assert.deepEqual(nonError.error, {});
  assert.equal(sources[6].input?.rule, undefined);
  assert.ok(events.entries.filter(event => event.kind === "tool_call").every(event => (event.detail as { phase: string }).phase === "start"));
  const firstTool = events.entries.find(event => event.kind === "tool_call")!;
  assert.equal((firstTool.detail as { toolCallId: string }).toolCallId, handlerIds[0]);
  assert.equal(firstTool.turnId, `turn:${secret}`);
  assert.equal(events.entries.some(event => JSON.stringify(event).includes("raw never queued")), false);
  assert.equal(events.entries.some(event => JSON.stringify(event).includes("arbitrary object")), false);
  assert.equal(events.entries.some(event => event.summary.includes(secret)), false);
});

test("projector failure emits bounded diagnostic without raw fallback or changing model receipt and settled outcome", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, {
    toolDisplayMode: "required-v1", registerToolDisplayProfile() {}, projectToolEvent() { throw new Error("raw projector exception"); },
    tools: [{ name: "echo", description: "fixture", inputSchema: { type: "object" }, async handler() { return { ok: true, message: "original model text" }; } }],
  })).bindRole(role);
  const events = collect(session); const turn = await start(session, engines.engine);
  assert.deepEqual(await engines.engine.call("echo", { path: "raw target" }), { success: true, contentItems: [{ type: "inputText", text: "original model text" }] });
  engines.engine.finish(); await turn.completion; await session.dispose(); await events.done;
  const displayEntries = events.entries.filter(event => (event.detail as { source?: string } | undefined)?.source !== "system");
  assert.equal(displayEntries.length, 3);
  for (const event of displayEntries.slice(0, 2)) assert.deepEqual(event.detail, { version: 1, source: "tool-display-diagnostic", code: "PROJECTION_FAILED" });
  assert.equal(JSON.stringify(events.entries).includes("raw"), false);
  assert.deepEqual(events.entries.at(-1)?.detail, { outcome: "completed" });
});

test("provider prompt keeps exact model text and image bytes while ignoring Core-only delivery metadata", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(role);
  const image = { type: "image" as const, mimeType: "image/png", data: Buffer.from("image exact bytes").toString("base64") };
  const original = "model raw sentinel\n原始文字";
  const promptOptions: import("../../src/model/runtime.ts").PromptOptions = { images: [image], inputProvenance: { version: 1, kind: "handback", deliveryId: "Core only", attemptId: "attempt", target: { roleId: role.id, runtime: "codex" }, reports: [] }, inputPresentation: { version: 1, kind: "handback-live", durability: "memory-only", reports: [], deliveryId: "Core only" }, onDeliveryProgress() { throw new Error("not provider responsibility"); } };
  const completion = session.prompt(original, promptOptions);
  await until(() => engines.engine.turns === 1);
  const params = engines.engine.requests.find(request => request.method === "turn/start")!.params;
  const input = params.input as Array<Record<string, unknown>>;
  assert.deepEqual(input[0], { type: "text", text: original, text_elements: [] });
  assert.equal(await readFile(String(input[1].path), "utf8"), "image exact bytes");
  assert.equal(JSON.stringify(params).includes("Core only"), false);
  assert.deepEqual(Object.keys(params).sort(), ["approvalPolicy", "approvalsReviewer", "input", "model", "sandboxPolicy", "threadId"]);
  engines.engine.finish(); await completion; await session.dispose();
});

test("projection never attributes unknown, repeated, queued stopped or late callbacks to a new turn", async () => {
  const engines = harness();
  const sources: import("../../src/model/runtime.ts").RuntimeToolEventFactsV1[] = [];
  let release!: () => void;
  let began = false;
  let writes = 0;
  let turnId = "first actual turn";
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, {
    currentTurnId: () => turnId, toolDisplayMode: "required-v1", registerToolDisplayProfile() {},
    projectToolEvent(source) {
      assert.ok("phase" in source); sources.push(source);
      return { runtime: "codex", turnId: source.turnId, kind: "tool_call", summary: "protected", detail: { toolName: source.toolName, toolCallId: source.toolCallId, turnId: source.turnId, phase: source.phase } };
    },
    tools: [{ name: "hold", description: "fixture", inputSchema: { type: "object" }, async handler() { began = true; await new Promise<void>(resolve => { release = resolve; }); return { ok: true, message: "late result", execution: { exitCode: 0 } }; } },
      { name: "write", description: "fixture", inputSchema: { type: "object" }, async handler() { writes++; return { ok: true, message: "written" }; } }],
  })).bindRole(role);
  const first = await start(session, engines.engine);
  const holding = engines.engine.call("hold", {}, { callId: "same native call" }); await until(() => began);
  const queued = engines.engine.call("write", {});
  assert.equal((await engines.engine.call("hold", {}, { callId: "same native call" })).success, false);
  assert.equal((await engines.engine.call("unknown", {})).success, false);
  await session.abort!(); await first.completion;
  turnId = "second actual turn";
  const second = await start(session, engines.engine);
  assert.equal((await engines.engine.call("write", {}, { turnId: first.nativeTurnId })).success, false);
  release(); await holding; await queued;
  assert.equal(writes, 0);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].turnId, "first actual turn");
  await engines.engine.call("write", {});
  assert.equal(sources.length, 3);
  assert.ok(sources.slice(1).every(source => source.turnId === "second actual turn"));
  engines.engine.finish(); await second.completion; await session.dispose();
});
