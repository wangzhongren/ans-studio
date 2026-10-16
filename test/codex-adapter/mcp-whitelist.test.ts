import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCodexRuntimeAdapter, prepareInstalledMcpServers } from "../../src/provider/codex/session.ts";
import { INSTALLED_MCP_TOOL_TIMEOUT_SEC, mcpServersOverride } from "../../src/common/codex-adapter/config.ts";
import type { InstalledMcpServerV1, RuntimeToolEventFactsV1, RuntimeSessionStorage } from "../../src/model/runtime.ts";
import { harness, options, role, collect, start, tick } from "./fixtures.ts";

// G-4 V2（P2）：白名单化三处恰等、单条 root map 定义注入、mcpToolCall 行映射、降级行。
// 形状依据＝P0 探针（docs/change/2026-10-16-probe_mcp-surface.md）逐项定格；假 engine 夹具把探针单元格转正。

const temporary = () => mkdtemp(path.join(os.tmpdir(), "ans-codex-mcp-tests-"));
const server = (overrides: Partial<InstalledMcpServerV1> = {}): InstalledMcpServerV1 => ({ name: "probe-mcp", command: process.execPath, args: ["server.mjs"], ...overrides });
const mcpMaps = (engine: { input: { configOverrides: readonly string[] } }) => engine.input.configOverrides.filter(value => value.startsWith("mcp_servers="));
const healthyCatalog = (name = "probe-mcp") => [{ name, runtimeStatus: "connected" }];

test("mcpServersOverride encodes one combined root map; JSON.stringify escaping survives byte-for-byte", () => {
  const tricky = server({ args: ["server path/mcp.mjs", "value with  spaces", "quote\"q", "back\\slash", "中文值", ""], env: { TOKEN: "lit\"eral\\", SECOND: "x" } });
  const map = mcpServersOverride(["foreign"], [tricky]);
  const q = (value: string) => JSON.stringify(value);
  assert.equal(map, `mcp_servers={${q("probe-mcp")}={command=${q(process.execPath)},args=[${tricky.args.map(q).join(",")}],env={${q("TOKEN")}=${q("lit\"eral\\")},${q("SECOND")}=${q("x")}},default_tools_approval_mode="approve",tool_timeout_sec=${INSTALLED_MCP_TOOL_TIMEOUT_SEC}},${q("foreign")}={enabled=false}}`);
  assert.ok(map!.includes('"quote\\"q"'), "内嵌引号 JSON 转义保真");
  assert.ok(map!.includes('"back\\\\slash"'), "反斜杠保真");
  assert.ok(map!.includes('"中文值"'));
  assert.ok(map!.includes(',""]'), "空字符串 arg 保真");
  assert.equal(mcpServersOverride([], []), undefined, "零条目 ⇒ 不产覆盖");
  assert.equal(mcpServersOverride(["a"], []), 'mcp_servers={"a"={enabled=false}}', "白名单空时逐字现状");
});

test("whitelist-only role assembles definitions in a single -c map and stays single-process", async () => {
  const installed = [server({ env: { REF: "env:PROBE_TRUTH", LIT: "literal" } })];
  const engines = harness({ mcpServers: ["probe-mcp"] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, {
    installedMcpServers: installed,
    env: { CODEX_API_KEY: "fake-codex-key", PROBE_TRUTH: "truth-from-snapshot", PATH: process.env.PATH },
  })).bindRole(role);
  assert.equal(engines.engines.length, 1, "无白名单外 server ⇒ 不起第二个进程");
  const maps = mcpMaps(engines.engine);
  assert.equal(maps.length, 1, "单条 root map 铁律（连续 -c 同根键覆盖不合并）");
  const expected = mcpServersOverride([], [{ name: "probe-mcp", command: process.execPath, args: ["server.mjs"], env: { REF: "truth-from-snapshot", LIT: "literal" } }]);
  assert.equal(maps[0], expected, "env:NAME 引用按 bind 快照展开、逐字入 map");
  assert.ok(maps[0]!.includes('"REF"="truth-from-snapshot"'));
  const thread = engines.engine.requests.find(request => request.method === "thread/start")!;
  assert.deepEqual((thread.params.config as { mcp_servers: unknown }).mcp_servers, { "probe-mcp": { enabled: true } }, "线程级恰等：白名单 enabled=true");
  await session.dispose();
});

test("foreign native MCP is confined as one disabled entry inside the same combined map", async () => {
  const installed = [server()];
  const engines = harness({ mcpServers: ["probe-mcp", "foreign"] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { installedMcpServers: installed })).bindRole(role);
  assert.equal(engines.engines.length, 2, "发现白名单外 server ⇒ 二次 connect 禁用");
  assert.deepEqual(mcpMaps(engines.engines[0]), [mcpServersOverride([], installed)], "首次连接仅定义、无禁用条目");
  const maps = mcpMaps(engines.engine);
  assert.equal(maps.length, 1);
  assert.equal(maps[0], mcpServersOverride(["foreign"], installed), "定义＋禁用编入同一条");
  assert.ok(maps[0]!.endsWith(',"foreign"={enabled=false}}'));
  const thread = engines.engine.requests.find(request => request.method === "thread/start")!;
  assert.deepEqual((thread.params.config as { mcp_servers: unknown }).mcp_servers, { "probe-mcp": { enabled: true }, foreign: { enabled: false } });
  await session.dispose();
});

test("process-level exact-set validation rejects foreign residue and missing whitelist entries", async () => {
  for (const behavior of [
    { mcpServers: ["probe-mcp", "foreign"], foreignRemains: true }, // 白名单外仍 enabled
    { mcpServers: ["other-server"] }, // 白名单自身缺失
  ]) {
    const engines = harness(behavior);
    await assert.rejects(createCodexRuntimeAdapter(options("/fixture", engines, { installedMcpServers: [server()] })).bindRole(role), /whitelist/);
    assert.equal(engines.engines.every(engine => engine.closed), true);
    assert.equal(engines.engines.flatMap(engine => engine.requests).some(request => request.method.startsWith("thread/")), false, "拒开工：线程未起");
  }
});

test("catalog name-set equality: failed whitelist entry passes, foreign/missing entries and cursors refuse", async () => {
  for (const behavior of [
    { mcpCatalog: [{ name: "probe-mcp" }, { name: "foreign" }] },
    { mcpCatalog: [] },
    { mcpCatalog: [{ name: "other-server" }] },
    { mcpCatalog: [{ name: "probe-mcp" }], catalogNextCursor: "more" },
  ]) {
    const engines = harness({ mcpServers: ["probe-mcp"], ...behavior });
    await assert.rejects(createCodexRuntimeAdapter(options("/fixture", engines, { installedMcpServers: [server()] })).bindRole(role), /catalog/);
  }
  const engines = harness({ mcpServers: ["probe-mcp"], mcpCatalog: [{ name: "probe-mcp", runtimeStatus: "failed", toolsError: "MCP startup failed: No such file or directory (os error 2)" }] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { installedMcpServers: [server()] })).bindRole(role);
  await session.dispose();
});

test("failed whitelist server degrades to one honest row (no turn id) and the session keeps working", async () => {
  const engines = harness({ mcpServers: ["probe-mcp"], mcpCatalog: [{ name: "probe-mcp", runtimeStatus: "failed", toolsError: "MCP startup failed: No such file or directory (os error 2) fake-codex-key" }] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { installedMcpServers: [server()] })).bindRole(role);
  const events = collect(session);
  const turn = await start(session, engines.engine);
  engines.engine.finish(); await turn.completion;
  await session.dispose(); await events.done;
  const rows = events.entries.filter(event => (event.detail as { source?: string } | undefined)?.source === "mcp-startup");
  assert.equal(rows.length, 1, "catalog 扫掠如实一行（去重单点）");
  assert.match(rows[0].summary, /^已安装 MCP「probe-mcp」未连接：启动失败$/);
  assert.equal(rows[0].turnId, undefined, "会话级行不带轮次身份");
  const detail = rows[0].detail as { version: number; name: string; state: string; error: string };
  assert.equal(detail.version, 1);
  assert.equal(detail.name, "probe-mcp");
  assert.equal(detail.state, "failed");
  assert.match(detail.error, /os error 2/);
  assert.equal(JSON.stringify(events.entries).includes("fake-codex-key"), false, "detail 经 scrub 脱敏");
  assert.equal((events.entries.at(-1)!.detail as { outcome: string }).outcome, "completed", "轮次照常完成（不毁会话）");
});

test("late startupStatus failures degrade once, ignore foreign names, and never double-report", async () => {
  const engines = harness({ mcpServers: ["probe-mcp"], mcpCatalog: healthyCatalog() });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { installedMcpServers: [server()] })).bindRole(role);
  const events = collect(session);
  engines.engine.startup("foreign", "failed", "ignored foreign");
  engines.engine.startup("probe-mcp", "starting");
  await tick(10);
  engines.engine.startup("probe-mcp", "failed", "crashed later");
  await tick(10);
  engines.engine.startup("probe-mcp", "failed", "crashed again");
  await tick(10);
  await session.dispose(); await events.done;
  const rows = events.entries.filter(event => (event.detail as { source?: string } | undefined)?.source === "mcp-startup");
  assert.equal(rows.length, 1, "同 server 至多一行；starting/foreign 无声");
  assert.match(rows[0].summary, /未连接：启动失败/);
  assert.equal((rows[0].detail as { error: string }).error, "crashed later");
});

test("catalog sweep and startupStatus notification dedupe to a single row per server", async () => {
  const engines = harness({ mcpServers: ["probe-mcp"], mcpCatalog: [{ name: "probe-mcp", runtimeStatus: "failed", toolsError: "startup failed" }] });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { installedMcpServers: [server()] })).bindRole(role);
  const events = collect(session);
  engines.engine.startup("probe-mcp", "failed", "startup failed");
  await tick(10);
  await session.dispose(); await events.done;
  assert.equal(events.entries.filter(event => (event.detail as { source?: string } | undefined)?.source === "mcp-startup").length, 1);
});

test("mcpToolCall projects to native-result facts (probe field set) and never quarantines", async () => {
  const engines = harness({ mcpServers: ["probe-mcp"], mcpCatalog: healthyCatalog() });
  const sources: RuntimeToolEventFactsV1[] = [];
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, {
    installedMcpServers: [server()],
    toolDisplayMode: "required-v1", registerToolDisplayProfile() {},
    projectToolEvent(source) {
      assert.ok("phase" in source);
      sources.push(source);
      return { runtime: source.runtime, roleId: source.roleId, turnId: source.turnId, kind: "tool_call", summary: "protected",
        detail: { toolName: source.toolName, ...(source.toolCallId !== undefined ? { toolCallId: source.toolCallId } : {}), ...(source.turnId !== undefined ? { turnId: source.turnId } : {}), phase: source.phase } };
    },
  })).bindRole(role);
  const events = collect(session);
  const turn = await start(session, engines.engine);
  engines.engine.mcpToolCall({ id: "call-1", status: "completed", arguments: { text: "hi" }, result: { content: [{ type: "text", text: "echo:hi" }, { type: "image", data: "opaque" }] }, error: null, durationMs: 7 });
  await tick();
  const completed = sources.find(source => source.phase === "result" && source.toolCallId === "call-1")!;
  if (completed.phase !== "result") throw new Error("unreachable");
  assert.equal(completed.origin, "native-result");
  assert.equal(completed.toolName, "mcp__fixture_mcp__echo", "行名沿 mcp__<清洗 server>__<tool> 家族（-→_）");
  assert.deepEqual(completed.input, { rule: "none", args: { text: "hi" } });
  assert.deepEqual(completed.native, { isError: false, content: [{ type: "text", text: "echo:hi" }, { type: "unsupported" }] });
  assert.equal(completed.durationMs, 7);
  assert.equal(completed.error, undefined);
  engines.engine.mcpToolCall({ id: "call-2", status: "failed", arguments: {}, result: null, error: { message: "boom fake-codex-key" }, durationMs: 3 });
  await tick();
  const failed = sources.find(source => source.toolCallId === "call-2")!;
  if (failed.phase !== "result") throw new Error("unreachable");
  assert.equal(failed.native?.isError, true);
  assert.deepEqual(failed.error, { message: "boom fake-codex-key" });
  assert.deepEqual(failed.native?.content, []);
  engines.engine.finish(); await turn.completion; await session.dispose(); await events.done;
  assert.equal((events.entries.at(-1)!.detail as { outcome: string }).outcome, "completed", "不隔离：轮次照常 settle completed");
});

test("legacy path (no projector): mcpToolCall rows keep three-state honesty and bounded summary", async () => {
  const engines = harness({ mcpServers: ["probe-mcp"], mcpCatalog: healthyCatalog() });
  const session = await createCodexRuntimeAdapter(options("/fixture", engines, { installedMcpServers: [server()] })).bindRole(role);
  const events = collect(session);
  const turn = await start(session, engines.engine);
  engines.engine.mcpToolCall({ id: "m1", status: "completed", result: { content: [{ type: "text", text: "legacy result" }] } });
  await tick();
  engines.engine.mcpToolCall({ id: "m2", status: "failed", result: null, error: { message: "legacy failure" } });
  await tick();
  engines.engine.mcpToolCall({ id: "m3", status: "completed", arguments: { big: "x".repeat(3000) }, result: { content: [{ type: "text", text: "y".repeat(3000) }] } });
  await tick();
  engines.engine.finish(); await turn.completion; await session.dispose(); await events.done;
  const accepted = events.entries.find(event => event.kind === "accepted" && (event.detail as { native?: boolean })?.native === true)!;
  assert.equal(accepted.summary, "legacy result");
  assert.equal(accepted.turnId, "ans-turn");
  assert.equal((accepted.detail as { toolName: string }).toolName, "mcp__fixture_mcp__echo");
  const denied = events.entries.find(event => event.kind === "denied" && (event.detail as { native?: boolean })?.native === true)!;
  assert.equal(denied.summary, "legacy failure");
  const capped = events.entries.find(event => event.kind === "accepted" && event.summary.endsWith("…"))!;
  assert.equal(capped.summary.length, 1025, "超长 legacy 摘要截断有标记（1024＋…）");
});

test("declaration validation: collisions/reserved/bad shapes throw before any effect; env refs expand from the bind snapshot", async () => {
  // 直接单测（单一校验/展开位置）
  const prepared = prepareInstalledMcpServers([server({ env: { TOKEN: "env:PROBE_TRUTH", LIT: "literal" } })], { PROBE_TRUTH: "truth" });
  assert.deepEqual(prepared[0].env, { TOKEN: "truth", LIT: "literal" });
  assert.deepEqual(prepareInstalledMcpServers([server({ env: { TOKEN: "env:ABSENT" } })], {})[0].env, {}, "引用真值缺失 ⇒ 该变量不带入");
  assert.deepEqual(prepareInstalledMcpServers([server()], {})[0].args, ["server.mjs"]);
  for (const bad of [
    server({ name: "bad name" }), server({ name: "ans" }), server({ name: "ans-codex" }), server({ name: "Ans_Codex" }),
    server({ command: "  " }), server({ command: "evil\ncommand" }), server({ args: [1 as unknown as string] }),
    server({ env: { "1BAD": "x" } }), server({ env: { OK: "" } }),
  ]) assert.throws(() => prepareInstalledMcpServers([bad], {}), /Codex installed MCP/);
  assert.throws(() => prepareInstalledMcpServers([server({ name: "a-b" }), server({ name: "a_b" })], {}), /collide/, "清洗碰撞拒绝（残余 2 的 P2 落点）");
  assert.throws(() => prepareInstalledMcpServers([server(), server()], {}), /collide/, "同名重复拒绝");
  // bindRole 面：装配前抛错、零副作用
  const engines = harness();
  let effects = 0;
  await assert.rejects(createCodexRuntimeAdapter(options("/fixture", engines, {
    installedMcpServers: [server({ name: "ans" })],
    storage: { runtime: "codex", roleId: role.id, validateNativeDirectory: async () => { effects++; } } as RuntimeSessionStorage,
  })).bindRole(role), /reserved/);
  assert.equal(effects, 0);
  assert.equal(engines.engines.length, 0);
});

test("zero-install posture is byte-identical: no first-connect map, exact legacy disable map, all-false thread config", async () => {
  const engines = harness();
  const session = await createCodexRuntimeAdapter(options("/fixture", engines)).bindRole(role);
  assert.equal(mcpMaps(engines.engines[0]).length, 0, "零安装 ⇒ 首次连接无 mcp_servers 覆盖");
  assert.deepEqual(mcpMaps(engines.engine), ['mcp_servers={"foreign"={enabled=false}}'], "禁用集覆盖逐字现状");
  const thread = engines.engine.requests.find(request => request.method === "thread/start")!;
  assert.deepEqual((thread.params.config as { mcp_servers: unknown }).mcp_servers, { foreign: { enabled: false } });
  await session.dispose();
});
