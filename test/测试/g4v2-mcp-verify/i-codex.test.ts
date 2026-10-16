// test/测试/g4v2-mcp-verify/i-codex.test.ts —— I 域：Codex P2（config 编码/白名单恰等/降级行/mcpToolCall 映射）。
//
// 独立构造：纯函数对抗（含**自写 mini TOML inline-table 解析器**做转义往返）＋自建假 Codex 引擎
// （CodexRpcConnection 接口）驱动会话级三处恰等与降级/使用行。不复用实施方断言。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  safetyOverrides,
  mcpServersOverride,
  INSTALLED_MCP_TOOL_TIMEOUT_SEC,
  DISABLED_NATIVE_FEATURES,
} from "../../../src/common/codex-adapter/config.ts";
import { mcpToolName, mcpToolCallNative } from "../../../src/common/codex-adapter/protocol.ts";
import { createCodexRuntimeAdapter, prepareInstalledMcpServers, type CodexEngineInput, type CodexRpcConnection } from "../../../src/provider/codex/session.ts";
import type { InstalledMcpServerV1, SessionEvent } from "../../../src/model/runtime.ts";
import type { ResolvedRole } from "../../../src/model/role.ts";
import { makeRoot } from "./helpers.ts";

// —————————————————————— 自写 mini TOML inline-table 解析器（仅覆盖生产编码器语法） ——————————————————————

function parseString(s: string, pos: { i: number }): string {
  if (s[pos.i] !== '"') throw new Error(`expect string at ${pos.i}: ${s.slice(pos.i, pos.i + 20)}`);
  let j = pos.i;
  j += 1;
  while (j < s.length) {
    if (s[j] === "\\") { j += 2; continue; }
    if (s[j] === '"') break;
    j += 1;
  }
  const raw = s.slice(pos.i, j + 1);
  pos.i = j + 1;
  return JSON.parse(raw) as string;
}

function parseValue(s: string, pos: { i: number }): unknown {
  const ch = s[pos.i];
  if (ch === '"') return parseString(s, pos);
  if (ch === "[") {
    pos.i += 1;
    const items: unknown[] = [];
    while (s[pos.i] !== "]") {
      items.push(parseValue(s, pos));
      if (s[pos.i] === ",") pos.i += 1;
    }
    pos.i += 1;
    return items;
  }
  if (ch === "{") return parseTable(s, pos);
  const start = pos.i;
  while (pos.i < s.length && !",}]".includes(s[pos.i]!)) pos.i += 1;
  const token = s.slice(start, pos.i).trim();
  if (token === "true") return true;
  if (token === "false") return false;
  const num = Number(token);
  if (Number.isNaN(num)) throw new Error(`bad token: ${token}`);
  return num;
}

function parseTable(s: string, pos: { i: number }): Record<string, unknown> {
  if (s[pos.i] !== "{") throw new Error("expect {");
  pos.i += 1;
  const out: Record<string, unknown> = {};
  while (s[pos.i] !== "}") {
    let key: string;
    if (s[pos.i] === '"') {
      key = parseString(s, pos);
    } else {
      const start = pos.i;
      while (s[pos.i] !== "=") pos.i += 1;
      key = s.slice(start, pos.i).trim();
    }
    if (s[pos.i] !== "=") throw new Error("expect =");
    pos.i += 1;
    out[key] = parseValue(s, pos);
    if (s[pos.i] === ",") pos.i += 1;
  }
  pos.i += 1;
  return out;
}

/** 解析 `mcp_servers={…}` 覆盖串为 map（先验：恰一处根键、JSON 字符串语法完整）。 */
function parseMcpOverride(override: string): Record<string, unknown> {
  assert.ok(override.startsWith("mcp_servers={"), "根键形态");
  const pos = { i: "mcp_servers=".length };
  const map = parseTable(override, pos);
  assert.equal(pos.i, override.length, "解析必须消费整串（转义/结构不得残渣）");
  return map;
}

// —————————————————————— 纯函数 ——————————————————————

test("I1 mcpServersOverride：单条 root map（转义往返含引号/空格/反斜杠/注入串）；定义＋禁用同一图；零条目 ⇒ 不产覆盖", () => {
  const tricky: InstalledMcpServerV1[] = [{
    name: "srv-a_b",
    command: `node "/x y" \\ 'z'`,
    args: [`--x={"a":1}`, "空格 参数", "", `},"sneak"={enabled=false}`], // 注入尝试：值内伪结构不得破图
    env: { A: `v"quote`, B: "{enabled=false}", C: "半角,逗号=等号" },
  }];
  const override = mcpServersOverride(["foreign"], tricky)!;
  assert.ok(override.startsWith("mcp_servers={"), "根键恰一（调用方单条 `-c`）");
  assert.equal(override.split("mcp_servers={").length - 1, 1, "串内 `mcp_servers={` 恰一次");
  const map = parseMcpOverride(override) as Record<string, Record<string, unknown>>;
  assert.deepEqual(Object.keys(map).sort(), ["foreign", "srv-a_b"], "恰两键（注入尝试不产出第三键）");
  const def = map["srv-a_b"]!;
  assert.equal(def["command"], `node "/x y" \\ 'z'`, "命令转义往返逐字");
  assert.deepEqual(def["args"], [`--x={"a":1}`, "空格 参数", "", `},"sneak"={enabled=false}`], "参数转义往返（含伪造结构串）");
  assert.deepEqual(def["env"], { A: `v"quote`, B: "{enabled=false}", C: "半角,逗号=等号" }, "env 转义往返逐字");
  assert.equal(def["default_tools_approval_mode"], "approve", "approve 模式在位（「装什么≈能跑什么」第二键）");
  assert.equal(def["tool_timeout_sec"], INSTALLED_MCP_TOOL_TIMEOUT_SEC, "tool_timeout_sec 在位");
  assert.deepEqual(map["foreign"], { enabled: false }, "禁用集同图");
  assert.equal(INSTALLED_MCP_TOOL_TIMEOUT_SEC, 300, "超时策略值＝300s（集中单点）");
  // 零条目 ⇒ undefined（不产覆盖——逐字现状）
  assert.equal(mcpServersOverride([], []), undefined, "零禁用零安装 ⇒ 不产覆盖");
  // safetyOverrides 恰一条 mcp_servers=（且仅当有内容）
  const withAll = safetyOverrides("/tmp/x", ["foreign"], false, tricky);
  assert.equal(withAll.filter((v) => v.startsWith("mcp_servers=")).length, 1, "恰一条同根 `-c`（连续同根覆盖禁止）");
  const none = safetyOverrides("/tmp/x", [], false, []);
  assert.equal(none.filter((v) => v.startsWith("mcp_servers=")).length, 0, "无内容不产 mcp_servers 覆盖");
  assert.equal(none.length, DISABLED_NATIVE_FEATURES.length + 5, "结构项逐字不回退");
});

test("I2 prepareInstalledMcpServers：名集恰判/保留名/清洗碰撞拒绝；env:NAME 快照展开（缺失⇒不带入不拦会话）；坏形状抛错", () => {
  const env: Record<string, string | undefined> = { SNAP: "snap-value", EMPTY: "" };
  // 好件与展开
  const prepared = prepareInstalledMcpServers([
    { name: "srv-ok", command: "node", args: ["a"], env: { TOK: "env:SNAP", LIT: "literal", GONE: "env:NOT_THERE", GONE2: "env:EMPTY" } },
  ], env);
  assert.deepEqual(prepared, [{ name: "srv-ok", command: "node", args: ["a"], env: { TOK: "snap-value", LIT: "literal" } }],
    "快照展开：在场⇒真值、缺失/空⇒不带入（server 自降级，不拦会话）");
  const input = [{ name: "srv-ok", command: "node", args: ["a"] }];
  const before = JSON.stringify(input);
  prepareInstalledMcpServers(input, env);
  assert.equal(JSON.stringify(input), before, "纯函数不改输入");
  // 清洗碰撞：- 与 _ 归一后同名 ⇒ 拒（P0 残余 2 的 P2 落点）
  assert.throws(() => prepareInstalledMcpServers([{ name: "a-b", command: "node", args: [] }, { name: "a_b", command: "node", args: [] }], env), /collide/);
  // 保留名（含大小写形态与归一形态）
  for (const name of ["ans", "ANS", "ans_codex", "ans-codex", "ANS_CODEX"]) {
    assert.throws(() => prepareInstalledMcpServers([{ name, command: "node", args: [] }], env), /reserved/, `保留名必须拒：${name}`);
  }
  // 名非法/命令空/控制字符/args 非字符串/env 名非法
  assert.throws(() => prepareInstalledMcpServers([{ name: "a b", command: "node", args: [] }], env), /invalid/);
  assert.throws(() => prepareInstalledMcpServers([{ name: "ok", command: "  ", args: [] }], env), /command/);
  assert.throws(() => prepareInstalledMcpServers([{ name: "ok", command: "node\u0007", args: [] }], env), /command/);
  assert.throws(() => prepareInstalledMcpServers([{ name: "ok", command: "node", args: [7 as unknown as string] }], env), /args/);
  assert.throws(() => prepareInstalledMcpServers([{ name: "ok", command: "node", args: [], env: { "1BAD": "v" } }], env), /env/);
});

test("I3 协议纯函数：mcpToolName 清洗桥形；mcpToolCallNative 字段全集三态（文本/非文本/失败/error）", () => {
  assert.equal(mcpToolName("srv-a", "echo"), "mcp__srv_a__echo", "-→_ 桥形（namespace 桥）");
  assert.equal(mcpToolName("srv.a b", "x"), "mcp__srv_a_b__x", "其余非法字符→_");
  const ok = mcpToolCallNative({ status: "completed", result: { content: [{ type: "text", text: "T1" }, { type: "image", data: "x" }] }, error: null });
  assert.deepEqual(ok.content, [{ type: "text", text: "T1" }, { type: "unsupported" }], "文本保真、非文本 unsupported");
  assert.equal(ok.isError, false);
  assert.equal(ok.errorText, undefined);
  const failed = mcpToolCallNative({ status: "failed", result: { content: [] }, error: { message: "boom" } });
  assert.equal(failed.isError, true, "status=failed ⇒ isError");
  assert.equal(failed.errorText, "boom", "error.message 取材");
  const errOnly = mcpToolCallNative({ status: "completed", error: { message: "late-error" } });
  assert.equal(errOnly.isError, true, "带 error 即 isError（即使 status=completed）");
  const malformed = mcpToolCallNative({ result: { content: "not-array" }, error: 42 } as unknown as Record<string, unknown>);
  assert.deepEqual(malformed.content, []);
  assert.equal(malformed.isError, false, "坏形状容错不抛、不误判");
});

// —————————————————————— 会话级（自建假引擎） ——————————————————————

interface Behavior {
  /** config/read 读回的全部 server（默认 ["fixture-mcp"] ∪ whitelist）。 */
  readbackServers?: string[];
  /** 无论怎么禁用都保持 enabled 的名字（模拟隔离失败）。 */
  stuckEnabled?: string[];
  /** 即使被定义为白名单也不出现在 enabled 读回（模拟 CLI 未应用）。 */
  hideEnabled?: string[];
  /** mcpServerStatus/list 的 data。 */
  catalog?: Array<Record<string, unknown>>;
  catalogNextCursor?: string;
  /** 在 mcpServerStatus/list 应答前发一次 startupStatus 通知（慢失败路径）。 */
  startupDuringCatalog?: { name: string; status: string; error?: string };
}

class FakeCodexEngine implements CodexRpcConnection {
  input: CodexEngineInput;
  behavior: Behavior;
  requests: Array<{ method: string; params: Record<string, unknown> }> = [];
  listeners = new Set<(method: string, params: unknown) => void>();
  closed = false;
  turnCounter = 0;
  turnId = "";
  constructor(input: CodexEngineInput, behavior: Behavior) { this.input = input; this.behavior = behavior; }
  private disabledFromOverride(): Set<string> {
    const override = this.input.configOverrides.filter((v) => v.startsWith("mcp_servers=")).join("\n");
    if (override === "") return new Set();
    const map = parseMcpOverride(override) as Record<string, { enabled?: unknown }>;
    return new Set(Object.entries(map).filter(([, v]) => v && typeof v === "object" && v.enabled === false).map(([k]) => k));
  }
  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === "initialize") return {};
    if (method === "config/read") {
      const disabled = this.disabledFromOverride();
      const names = this.behavior.readbackServers ?? ["fixture-mcp", ...(this.whitelistNames ?? [])];
      const servers = Object.fromEntries(names.map((name) => {
        const stuck = this.behavior.stuckEnabled?.includes(name) === true;
        const hidden = this.behavior.hideEnabled?.includes(name) === true;
        return [name, { enabled: !hidden && (stuck || !disabled.has(name)) }];
      }));
      return { config: { features: Object.fromEntries(DISABLED_NATIVE_FEATURES.map((name) => [name, false])), sandbox_mode: "read-only", approval_policy: "never", web_search: "disabled", mcp_servers: servers } };
    }
    if (method === "thread/start" || method === "thread/resume") {
      return { thread: { id: "native-thread-1" }, sandbox: { type: "readOnly" }, approvalPolicy: "never" };
    }
    if (method === "mcpServerStatus/list") {
      if (this.behavior.startupDuringCatalog) {
        const { name, status, error } = this.behavior.startupDuringCatalog;
        for (const listener of this.listeners) listener("mcpServer/startupStatus/updated", { threadId: "native-thread-1", name, status, error: error ?? null });
      }
      if (this.behavior.catalog !== undefined) return { data: this.behavior.catalog, nextCursor: this.behavior.catalogNextCursor ?? null };
      return { data: [], nextCursor: null };
    }
    if (method === "turn/start") {
      this.turnId = `native-turn-${++this.turnCounter}`;
      return { turn: { id: this.turnId, status: "inProgress" } };
    }
    if (method === "turn/interrupt") return {};
    throw new Error(`fake engine unexpected method: ${method}`);
  }
  whitelistNames: string[] = [];
  notify(): void {}
  onNotification(listener: (method: string, params: unknown) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  onServerRequest(): void {}
  async close(): Promise<void> { this.closed = true; }
  finish(status = "completed"): void {
    for (const listener of this.listeners) listener("turn/completed", { threadId: "native-thread-1", turn: { id: this.turnId, status } });
  }
  mcpToolCall(item: Record<string, unknown>): void {
    for (const listener of this.listeners) listener("item/completed", { threadId: "native-thread-1", turnId: this.turnId, item: { type: "mcpToolCall", id: "mcp-1", durationMs: 12, ...item } });
  }
}

const role: ResolvedRole = { id: "codex-fixture", kind: "project", cardText: "# fx", boundary: { entries: [], boundarySource: "x", acceptance: { accepted: true, source: "x" } }, boundarySource: "x", location: { card: "", boundary: "" } };

async function mcpModules() {
  const [server, client, memory, types] = await Promise.all([
    import("@modelcontextprotocol/sdk/server/index.js"),
    import("@modelcontextprotocol/sdk/client/index.js"),
    import("@modelcontextprotocol/sdk/inMemory.js"),
    import("@modelcontextprotocol/sdk/types.js"),
  ]);
  return { Server: server.Server, Client: client.Client, InMemoryTransport: memory.InMemoryTransport, ListToolsRequestSchema: types.ListToolsRequestSchema, CallToolRequestSchema: types.CallToolRequestSchema } as never;
}

function adapterOptions(root: string, installed: InstalledMcpServerV1[], behavior: Behavior) {
  const engines: FakeCodexEngine[] = [];
  const options = {
    runtime: "codex" as const,
    projectRoot: root,
    skillRoot: root,
    tools: [],
    currentTurnId: () => "ans-turn",
    modelId: "fixture-model",
    env: { CODEX_API_KEY: "fake-key", PATH: process.env.PATH, SNAP: "snap-value" },
    installedMcpServers: installed,
    engineFactory: async (input: CodexEngineInput) => { const e = new FakeCodexEngine(input, behavior); e.whitelistNames = installed.map((s) => s.name); engines.push(e); return e; },
    mcpLoader: mcpModules,
    promptTimeoutMs: 3000,
    interactionGate: (() => { let w = 0; const ls = new Set<(b: boolean) => void>(); return { begin() { w += 1; for (const l of ls) l(w > 0); }, end() { w = Math.max(0, w - 1); for (const l of ls) l(w > 0); }, isWaiting: () => w > 0, onChange(l: (b: boolean) => void) { ls.add(l); return () => ls.delete(l); } }; })(),
  };
  return { options, engines };
}

async function waitSettled(rows: SessionEvent[]): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!rows.some((r) => r.kind === "settled")) {
    if (Date.now() > deadline) throw new Error("settled 未达（事件泵超时）");
    await new Promise((r) => setTimeout(r, 10));
  }
}

function collect(session: { events(): AsyncIterable<SessionEvent> }): { rows: SessionEvent[]; done: Promise<void> } {
  const rows: SessionEvent[] = [];
  const done = (async () => { for await (const event of session.events()) rows.push(event); })();
  return { rows, done };
}

/** 起一轮并等到原生 turn/start 应答；返回 completion（放在元组里避免 async 拍平导致死锁）。 */
async function startTurn(session: { prompt(t: string): Promise<void> }, engine: FakeCodexEngine): Promise<[Promise<void>]> {
  const completion = session.prompt("go");
  void completion.catch(() => {});
  const deadline = Date.now() + 2000;
  while (engine.turnId === "") { if (Date.now() > deadline) throw new Error("turn/start 未到达"); await new Promise((r) => setTimeout(r, 5)); }
  return [completion];
}

test("I4 会话级：白名单定义＋禁用集编入恰一条 `-c`（approve/超时/env 展开）；线程级 enabled 恰等；目录名字集恰等", async () => {
  const root = makeRoot();
  try {
    const installed: InstalledMcpServerV1[] = [
      { name: "srv-a", command: "node", args: ["s.js"], env: { TOK: "env:SNAP", GONE: "env:ABSENT" } },
    ];
    const { options, engines } = adapterOptions(root, installed, {
      catalog: [{ name: "srv-a", runtimeStatus: "connected" }],
    });
    const session = await createCodexRuntimeAdapter(options).bindRole(role);
    const engine = engines.at(-1)!;
    const overrides = engine.input.configOverrides.filter((v) => v.startsWith("mcp_servers="));
    assert.equal(overrides.length, 1, "恰一条 mcp_servers= 覆盖");
    const map = parseMcpOverride(overrides[0]!) as Record<string, Record<string, unknown>>;
    assert.equal(map["srv-a"]!["command"], "node");
    assert.deepEqual(map["srv-a"]!["args"], ["s.js"]);
    assert.deepEqual(map["srv-a"]!["env"], { TOK: "snap-value" }, "快照展开（缺失引用不带入）");
    assert.equal(map["srv-a"]!["default_tools_approval_mode"], "approve", "approve 在位");
    assert.equal(map["srv-a"]!["tool_timeout_sec"], 300, "超时在位");
    assert.deepEqual(map["fixture-mcp"], { enabled: false }, "外来 server 并入同一图的 enabled=false（连二手连接）");
    // 线程级恰等
    const threadStart = engine.requests.find((r) => r.method === "thread/start")!;
    assert.deepEqual((threadStart.params.config as Record<string, unknown>)["mcp_servers"], { "srv-a": { enabled: true }, "fixture-mcp": { enabled: false } }, "线程级：白名单 true、其余 false");
    // 目录名字集恰等已由装配通过隐含（不等即抛）；这里显式再证目录条目读取正常
    const catalogReq = engine.requests.find((r) => r.method === "mcpServerStatus/list")!;
    assert.ok(catalogReq, "目录复核已执行");
    const rows = collect(session);
    const [completion] = await startTurn(session, engine);
    engine.finish();
    await completion;
    await waitSettled(rows.rows);
    assert.equal(rows.rows.some((r) => String(r.summary).includes("未连接")), false, "connected 白名单不产降级行");
    await session.dispose();
    await rows.done.catch(() => {});
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("I5 三处恰等负例：外来残留 enabled（进程级）⇒ 拒开工；白名单缺席读回（CLI 未应用）⇒ 拒；目录多一名/少一名 ⇒ 拒", async () => {
  const root = makeRoot();
  try {
    // ① 外来残留在 enabled
    const caseA = adapterOptions(root, [{ name: "srv-a", command: "node", args: [] }], { stuckEnabled: ["fixture-mcp"], catalog: [{ name: "srv-a", runtimeStatus: "connected" }] });
    await assert.rejects(createCodexRuntimeAdapter(caseA.options).bindRole(role), /enabled set differs/, "外来残留 ⇒ 与白名单不等，拒开工");
    // ② 白名单未生效（读回缺名）
    const caseB = adapterOptions(root, [{ name: "srv-a", command: "node", args: [] }], { hideEnabled: ["srv-a"], catalog: [] });
    await assert.rejects(createCodexRuntimeAdapter(caseB.options).bindRole(role), /enabled set differs/, "白名单缺席读回 ⇒ 恰等失败，拒");
    // ③ 目录多一名
    const caseC = adapterOptions(root, [{ name: "srv-a", command: "node", args: [] }], { catalog: [{ name: "srv-a", runtimeStatus: "connected" }, { name: "sneak", runtimeStatus: "connected" }] });
    await assert.rejects(createCodexRuntimeAdapter(caseC.options).bindRole(role), /catalog does not match/, "目录多一名 ⇒ 拒");
    // ④ 目录少一名
    const caseD = adapterOptions(root, [{ name: "srv-a", command: "node", args: [] }, { name: "srv-b", command: "node", args: [] }], { catalog: [{ name: "srv-a", runtimeStatus: "connected" }] });
    await assert.rejects(createCodexRuntimeAdapter(caseD.options).bindRole(role), /catalog does not match/, "目录少一名 ⇒ 拒");
    // ⑤ 名字集不含白名单名（读回只有 foreign）——白名单也必须恰等（拒）
    const caseE = adapterOptions(root, [{ name: "srv-a", command: "node", args: [] }], { readbackServers: ["fixture-mcp"] });
    await assert.rejects(createCodexRuntimeAdapter(caseE.options).bindRole(role), /enabled set differs/, "读回之名集不含白名单 ⇒ 拒");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("I6 降级行：目录 failed/cancelled 白名单条目如实一行（类别化、error 进 detail 截断）；startupStatus 慢路径去重不双报；不毁轮次", async () => {
  const root = makeRoot();
  try {
    const { options, engines } = adapterOptions(root, [{ name: "srv-a", command: "node", args: [] }], {
      catalog: [{ name: "srv-a", runtimeStatus: "failed", toolsError: "E: tools listing blew up " + "x".repeat(400) }],
      startupDuringCatalog: { name: "srv-a", status: "failed", error: "E: early failure" },
    });
    const session = await createCodexRuntimeAdapter(options).bindRole(role);
    const engine = engines.at(-1)!;
    const rows = collect(session);
    const [completion] = await startTurn(session, engine);
    engine.finish();
    await completion;
    await waitSettled(rows.rows);
    const degraded = rows.rows.filter((r) => r.kind === "message" && String(r.summary).includes("已安装 MCP「srv-a」未连接"));
    assert.equal(degraded.length, 1, `去重单点：恰一行（不双报）——实得 ${degraded.length}`);
    assert.ok(String(degraded[0]!.summary).includes("启动失败"), `类别化文案：${degraded[0]!.summary}`);
    const detail = degraded[0]!.detail as { source?: string; name?: string; state?: string; error?: string };
    assert.equal(detail.source, "mcp-startup");
    assert.equal(detail.name, "srv-a");
    assert.equal(detail.state, "failed");
    assert.ok((detail.error ?? "").length <= 300, "error 截断 ≤300（不落全文）");
    assert.ok(rows.rows.some((r) => r.kind === "settled"), "白名单起不来 ⇒ 会话照开、轮次照完");
    await session.dispose();
    await rows.done.catch(() => {});
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("I7 mcpToolCall 使用行映射：字段全集（server/tool→mcp__ 名/status/args/result/error/durationMs）；三态如实；不进隔离", async () => {
  const root = makeRoot();
  try {
    const { options, engines } = adapterOptions(root, [{ name: "srv-a", command: "node", args: [] }], { catalog: [{ name: "srv-a", runtimeStatus: "connected" }] });
    const session = await createCodexRuntimeAdapter(options).bindRole(role);
    const engine = engines.at(-1)!;
    const rows = collect(session);
    const [completion] = await startTurn(session, engine);
    engine.mcpToolCall({ server: "srv-a", tool: "echo", status: "completed", arguments: { text: "hi" }, result: { content: [{ type: "text", text: "RESULT-TEXT" }] }, error: null, durationMs: 7 });
    engine.mcpToolCall({ server: "srv-a", tool: "boom", status: "failed", arguments: {}, result: { content: [] }, error: { message: "boom-message" }, durationMs: 9 });
    engine.finish();
    await completion;
    await waitSettled(rows.rows);
    const ok = rows.rows.find((r) => (r.detail as { toolName?: string })?.toolName === "mcp__srv_a__echo");
    assert.ok(ok, `使用行在场：${JSON.stringify(rows.rows.map((r) => r.kind))}`);
    assert.equal(ok!.kind, "accepted", "成功调用 ⇒ accepted 行");
    const okDetail = ok!.detail as { toolName?: string; status?: string; durationMs?: number };
    assert.equal(okDetail.status, "completed");
    assert.equal(okDetail.durationMs, 7, "durationMs 传递");
    assert.ok(String(ok!.summary).includes("RESULT-TEXT"), "结果文本进 legacy 摘要");
    const bad = rows.rows.find((r) => (r.detail as { toolName?: string })?.toolName === "mcp__srv_a__boom");
    assert.ok(bad, "失败调用行在场");
    assert.equal(bad!.kind, "denied", "失败 ⇒ denied 行");
    assert.equal(rows.rows.some((r) => String(r.summary).includes("quarantin")), false, "白名单调用不进隔离（非越权信号）");
    await session.dispose();
    await rows.done.catch(() => {});
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
