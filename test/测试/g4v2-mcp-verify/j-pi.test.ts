// test/测试/g4v2-mcp-verify/j-pi.test.ts —— J 域：Pi P3（装配/放行/tools-only/自持收窄/dispose 收口/治理回归）。
//
// 独立构造：自建 stdio 夹具 server（pi-server.fixture.ts）＋真实 Pi SDK（faux 模型进程内、零网关）＋
// 自建 loadPi 包装捕获原生会话。不复用实施方断言；覆盖声明驱动（不读盘上其他来源）、近似名前缀负例、
// 资源工具门禁拒（tools-only）、子进程 env 恰等与哨兵零泄漏、env:NAME 缺失构造期抛错且不拉子进程、
// dispose 收口 ≤5s、零声明逐字旧行为。

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createRealPiRuntimeAdapter,
  mcpToolAllowedByWhitelistedServer,
  resolveInstalledMcpServers,
  type RealPiAdapterOptions,
} from "../../../src/common/pi-adapter/real-adapter.ts";
import { resolvePiProviderConfig } from "../../../src/common/pi-adapter/provider-config.ts";
import { createInteractionGate } from "../../../src/common/pi-adapter/timeout.ts";
import type { InstalledMcpServerV1, SessionEvent } from "../../../src/model/runtime.ts";
import type { ResolvedRole } from "../../../src/model/role.ts";

const SERVER_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "pi-server.fixture.ts");
const log = { stage() {}, trace() {}, traceEnabled: false };
const config = resolvePiProviderConfig(
  { providerId: "g4v2-verify", baseUrl: "https://g4v2.invalid/", modelId: "g4v2-model", apiKeyEnvVar: "G4V2_FAKE_KEY", contextWindow: 32768 },
  { G4V2_FAKE_KEY: "offline-placeholder" },
);

const role: ResolvedRole = {
  id: "PiG4V2",
  kind: "project",
  cardText: "# G-4 V2 复验角色\n",
  boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
  boundarySource: "fixture",
  location: { card: "fixture", boundary: "fixture" },
};

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, timeoutMs: number, stepMs = 25): Promise<boolean> {
  const began = Date.now();
  for (;;) {
    if (fn()) return true;
    if (Date.now() - began > timeoutMs) return false;
    await wait(stepMs);
  }
}
const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function temp(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "g4v2-pi-"));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

interface FauxHandle {
  provider: { id: string };
  models: { id: string }[];
  setResponses(responses: unknown[]): void;
}

async function engine() {
  const pi = await import("@earendil-works/pi-coding-agent");
  const ai = await import("@earendil-works/pi-ai");
  const faux = (ai as unknown as { fauxProvider: (o: { tokensPerSecond: number }) => FauxHandle }).fauxProvider({ tokensPerSecond: 100000 });
  const runtime = await pi.ModelRuntime.create({ credentials: new (ai as unknown as { InMemoryCredentialStore: new () => never }).InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  runtime.registerNativeProvider(faux.provider as never);
  const model = runtime.getModel(faux.provider.id, faux.models[0]!.id)!;
  let native: Awaited<ReturnType<typeof pi.createAgentSession>>["session"] | undefined;
  let extensionsResult: Awaited<ReturnType<typeof pi.createAgentSession>>["extensionsResult"] | undefined;
  const dependencies = {
    buildRuntime: async () => ({ runtime, model }),
    loadPi: async () => {
      const real = await import("@earendil-works/pi-coding-agent");
      return {
        ...real,
        async createAgentSession(input: Parameters<typeof real.createAgentSession>[0]) {
          const out = await real.createAgentSession(input);
          native = out.session;
          extensionsResult = out.extensionsResult;
          return out;
        },
      } as typeof real;
    },
  };
  return {
    ai, faux, dependencies,
    get native() { return native!; },
    get extensionsResult() { return extensionsResult!; },
  };
}

type Engine = Awaited<ReturnType<typeof engine>>;
type NativeSession = Awaited<ReturnType<(typeof import("@earendil-works/pi-coding-agent"))["createAgentSession"]>>["session"];

function adapterOptions(dir: string, mcpServers?: readonly InstalledMcpServerV1[], extra?: Partial<RealPiAdapterOptions>): RealPiAdapterOptions {
  return {
    runtime: "pi",
    projectRoot: dir,
    skillRoot: dir,
    tools: [],
    interactionGate: createInteractionGate(),
    currentTurnId: () => "g4v2-turn",
    promptTimeoutMs: 5000,
    config,
    logger: log,
    ...(mcpServers !== undefined ? { installedMcpServers: mcpServers } : {}),
    ...extra,
  };
}

function server(id: string, dir: string, extraArgs: string[] = []): InstalledMcpServerV1 {
  return { name: id, command: process.execPath, args: [SERVER_SCRIPT, `--id=${id}`, ...extraArgs] };
}

const mcpNamesOf = (native: NativeSession): string[] => native.getActiveToolNames().filter((n) => n.startsWith("mcp__"));

async function drain(session: { events(): AsyncIterable<SessionEvent>; dispose(): Promise<void> }): Promise<SessionEvent[]> {
  await session.dispose();
  const events: SessionEvent[] = [];
  for await (const event of session.events()) events.push(event);
  return events;
}

function toolResultTexts(native: NativeSession): string[] {
  const messages = (native as unknown as { state: { messages: { role?: string }[] } }).state.messages;
  return messages.filter((m) => m.role === "toolResult").map((m) => JSON.stringify(m));
}

// —————————————————————— 纯函数对抗 ——————————————————————

test("J1 判据纯函数：清洗名命中/前缀边界负例（近似串不中）/空白名单不中；env 展开缺失即抛且空引用抛、不改输入", () => {
  const wl = ["srv-a", "b_c"];
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__srv_a__echo", wl), true, "清洗名命中（-→_）");
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__b_c__tool__x", wl), true, "tool 段再造 __ 仍命中（前缀面）");
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__srv_ax__echo", wl), false, "近似串（缺 __ 边界）不中");
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__srv_a", wl), false, "无 tool 段不中");
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__srv-a__echo", wl), false, "未清洗原名不中（SDK 面是清洗后名）");
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__other__echo", wl), false, "异 server 不中");
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__srv_a__echo", []), false, "空白名单不中");
  assert.equal(mcpToolAllowedByWhitelistedServer("read_file", wl), false, "非 mcp__ 不中（注入名走精确集）");
  const input: InstalledMcpServerV1[] = [{ name: "x", command: "node", args: ["a"], env: { L: "lit", R: "env:REAL" } }];
  const before = JSON.stringify(input);
  const resolved = resolveInstalledMcpServers(input, { REAL: "real-value" });
  assert.deepEqual(resolved, [{ name: "x", command: "node", args: ["a"], env: { L: "lit", R: "real-value" } }]);
  assert.equal(JSON.stringify(input), before, "不改输入");
  assert.throws(() => resolveInstalledMcpServers([{ name: "x", command: "node", args: [], env: { K: "env:MISSING_XYZ" } }], {}), /MISSING_XYZ/, "缺失即抛（先于任何子进程）");
  assert.throws(() => resolveInstalledMcpServers([{ name: "x", command: "node", args: [], env: { K: "env:" } }], {}), /env:/, "空引用抛");
});

// —————————————————————— 接通/放行/tools-only ——————————————————————

test("J2 声明驱动接通：rogue mcp.json 被无视；前缀面放行真实执行；资源工具（tools-only）放行面外 ⇒ 门禁拒不可执行", async () => {
  await temp(async (dir) => {
    const sdk = await engine();
    // 声明驱动（绝不读盘上其他来源）：项目根植入 rogue mcp.json + .pi 配置，声明面只有 srv-a
    await mkdir(join(dir, ".pi"), { recursive: true });
    await writeFile(join(dir, "mcp.json"), JSON.stringify({ servers: { rogue: { command: "node", args: ["-e", "process.exit(0)"] } } }));
    await writeFile(join(dir, ".pi", "mcp.json"), JSON.stringify({ servers: { rogue2: { command: "node", args: ["-e", "process.exit(0)"] } } }));
    const calls = join(dir, "calls.log");
    const session = await createRealPiRuntimeAdapter(
      adapterOptions(dir, [server("srv-a", dir, [`--calls=${calls}`, "--resources"])]),
      sdk.dependencies,
    ).bindRole(role);
    try {
      const connected = await until(() => mcpNamesOf(sdk.native).length >= 1, 8000);
      assert.ok(connected, `接通（活动面 ${JSON.stringify(sdk.native.getActiveToolNames())}）`);
      const names = sdk.native.getActiveToolNames();
      assert.ok(names.includes("mcp__srv_a__echo"), "清洗形态 mcp__srv_a__echo 在场");
      assert.equal(names.some((n) => n.includes("rogue")), false, "盘上 rogue 来源零搭车（声明驱动）");
      // tools=[] ⇒ 活动面＝mcp__ 家族 ∪（SDK 因 server 自报 resources 而登记的）资源工具三名；
      // 资源三名不带 mcp__ 前缀（探针 §六已定格）——「不接＝不放行」由下一节的门禁拒证明。
      const RESOURCE_TRIO = ["list_mcp_resources", "list_mcp_resource_templates", "read_mcp_resource"];
      const nonMcp = names.filter((n) => !n.startsWith("mcp__"));
      assert.ok(nonMcp.every((n) => RESOURCE_TRIO.includes(n)), `非 mcp__ 活动名须 ⊆ 资源工具三名：${JSON.stringify(nonMcp)}`);
      // tools 调用真跑到服务端（门禁放行）
      sdk.faux.setResponses([
        sdk.ai.fauxAssistantMessage([sdk.ai.fauxToolCall("mcp__srv_a__echo", { text: "J2-MARKER" })]),
        sdk.ai.fauxAssistantMessage("done"),
      ] as never);
      await session.prompt("call echo");
      assert.ok(readFileSync(calls, "utf8").includes("echo"), "服务端收到调用（放行 ⇒ 真执行）");
      assert.ok(toolResultTexts(sdk.native).some((r) => r.includes("J2-MARKER")), "结果进转录");
      // 资源工具（SDK 因 resources 自报而登记）：不在放行面 ⇒ 门禁拒、不可执行
      const resourceActive = sdk.native.getActiveToolNames().includes("list_mcp_resources");
      sdk.faux.setResponses([
        sdk.ai.fauxAssistantMessage([sdk.ai.fauxToolCall("list_mcp_resources", {})]),
        sdk.ai.fauxAssistantMessage("done2"),
      ] as never);
      await session.prompt("call resource tool");
      const results = toolResultTexts(sdk.native);
      assert.ok(
        results.some((r) => r.includes("list_mcp_resources") && (r.includes("非注入的 ANS 工具，拒绝执行") || r.includes("isError\":true"))),
        `资源工具不可执行（门禁拒或错误终态）：${results.join("\n").slice(0, 400)}`,
      );
      assert.equal(readFileSync(calls, "utf8").includes("list_mcp_resources"), false, "服务端从未收到资源工具调用");
      void resourceActive;
    } finally {
      const events = await drain(session);
      assert.equal(events.filter((e) => e.kind === "settled").length, 2, "两轮恰两 settled（单点每轮一次——X-1 回归）");
      assert.ok(events.some((e) => e.kind === "accepted" && String(e.summary).includes("mcp__srv_a__echo")), "MCP 结果行经既有管道（accepted，按工具名归属）");
      assert.ok(events.some((e) => e.kind === "denied" && e.summary === "非注入的 ANS 工具，拒绝执行：list_mcp_resources"), "资源工具拒绝行逐字（门禁拦）");
    }
  });
});

// —————————————————————— 自持收窄 ——————————————————————

test("J3 自持收窄：子进程 env 键＝PATH＋声明键（平台注入除外）；哨兵零泄漏；env:NAME 展开入子进程", async () => {
  await temp(async (dir) => {
    const sdk = await engine();
    const state = join(dir, "state.json");
    const sentinelKey = "G4V2_GATEWAY_SENTINEL";
    process.env[sentinelKey] = "planted-secret";
    process.env.G4V2_STATE_PATH = state;
    const servers: InstalledMcpServerV1[] = [
      { ...server("srv-e", dir, [`--state=${state}`]), env: { PROBE_STATE: "env:G4V2_STATE_PATH", MARK: "literal-mark" } },
    ];
    const session = await createRealPiRuntimeAdapter(adapterOptions(dir, servers), sdk.dependencies).bindRole(role);
    try {
      const ok = await until(() => mcpNamesOf(sdk.native).length >= 1 && existsSync(state), 8000);
      assert.ok(ok, "接通且 state 落盘（env:NAME 真值展开 ⇒ 路径有效）");
      const dumped = JSON.parse(readFileSync(state, "utf8")) as { pid: number; envKeys: string[] };
      // 平台级注入（OS/libuv 真值，与实现无关；v1.3.0 CI Windows 红修复，沿 v1.1.0 平台真值分支先例）：
      // · macOS：`__CF_USER_TEXT_ENCODING`（CF 运行时注入，env -i 亦见）；· Windows：libuv uv_spawn
      // 强制补齐的十键（loader/winsock 依赖，env 参数无法阻止）——同一 CI 中本套件 G1a／J3 与
      // pi-adapter 自有套件三处互异 spawn 实现实得**相同十键集** ⇒ 平台级真值，非泄漏面。
      // Windows env 名大小写不敏感 ⇒ 按大写归一比对；断言本体零放宽（仍为「恰等−平台真值集」）。
      const platform = process.platform === "win32"
        ? ["HOMEDRIVE", "HOMEPATH", "USERDOMAIN", "USERNAME", "USERPROFILE", "LOGONSERVER", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "TEMP"]
        : ["__CF_USER_TEXT_ENCODING"];
      const allowed = new Set(["PATH", "PROBE_STATE", "MARK", ...platform].map((name) => name.toUpperCase()));
      const unexpected = dumped.envKeys.filter((k) => !allowed.has(k.toUpperCase()));
      assert.deepEqual(unexpected, [], `子进程 env 键＝自持最小集∪平台注入；实得 ${JSON.stringify(dumped.envKeys)}`);
      assert.ok(dumped.envKeys.includes("PROBE_STATE") && dumped.envKeys.includes("MARK"), "声明键在场");
      assert.equal(dumped.envKeys.includes(sentinelKey), false, "宿主哨兵绝不泄漏");
      assert.equal(dumped.pid > 0, true);
    } finally {
      await session.dispose();
      delete process.env[sentinelKey];
      delete process.env.G4V2_STATE_PATH;
    }
  });
});

test("J4 env:NAME 缺失 ⇒ bindRole 构造期抛错，且子进程从未拉起（无 state 落盘）", async () => {
  await temp(async (dir) => {
    const sdk = await engine();
    const state = join(dir, "state.json");
    delete process.env.G4V2_ABSENT_VAR;
    const servers: InstalledMcpServerV1[] = [
      { ...server("srv-x", dir, [`--state=${state}`]), env: { CRED: "env:G4V2_ABSENT_VAR" } },
    ];
    await assert.rejects(
      createRealPiRuntimeAdapter(adapterOptions(dir, servers), sdk.dependencies).bindRole(role),
      /G4V2_ABSENT_VAR/,
      "缺失引用 ⇒ 构造期如实抛错（不静默省略）",
    );
    await wait(300);
    assert.equal(existsSync(state), false, "子进程从未拉起（不拉半装配链路）");
  });
});

// —————————————————————— dispose 收口 ——————————————————————

test("J5 dispose 收口（真路径）：dispose 后 MCP 子进程 ≤5s 退出（session_shutdown 补发生效）", async () => {
  await temp(async (dir) => {
    const sdk = await engine();
    const state = join(dir, "state.json");
    const session = await createRealPiRuntimeAdapter(adapterOptions(dir, [server("srv-d", dir, [`--state=${state}`])]), sdk.dependencies).bindRole(role);
    const ok = await until(() => mcpNamesOf(sdk.native).length >= 1 && existsSync(state), 8000);
    assert.ok(ok, "接通");
    const pid = (JSON.parse(readFileSync(state, "utf8")) as { pid: number }).pid;
    assert.equal(alive(pid), true, "前置：子进程在场");
    await session.dispose();
    const gone = await until(() => !alive(pid), 5000);
    assert.equal(gone, true, "dispose 后子进程退出（旧链缺口已补）");
  });
});

// —————————————————————— 治理回归（MCP 激活下） ——————————————————————

test("J7 治理回归（MCP 激活下）：server-tools 声明照常启用（启用行在场）；门禁放行 MCP 工具；settled 恰 1", async () => {
  await temp(async (dir) => {
    const sdk = await engine();
    const prev = process.env.ANS_PI_SERVER_TOOLS;
    process.env.ANS_PI_SERVER_TOOLS = "web_search:1";
    try {
      const calls = join(dir, "calls.log");
      const session = await createRealPiRuntimeAdapter(
        adapterOptions(dir, [server("srv-g", dir, [`--calls=${calls}`])]),
        sdk.dependencies,
      ).bindRole(role);
      try {
        const connected = await until(() => mcpNamesOf(sdk.native).length >= 1, 8000);
        assert.ok(connected, "MCP 照常接通（server-tools 同开不互斥）");
        const extensions = sdk.extensionsResult.extensions.map((x) => String(x.path));
        assert.ok(extensions.includes("<inline:ans-governance>") && extensions.length === 2, `扩展＝治理＋MCP 恰两件：${JSON.stringify(extensions)}`);
        sdk.faux.setResponses([
          sdk.ai.fauxAssistantMessage([sdk.ai.fauxToolCall("mcp__srv_g__echo", { text: "G-MARK" })]),
          sdk.ai.fauxAssistantMessage("done"),
        ] as never);
        await session.prompt("go");
        assert.ok(readFileSync(calls, "utf8").includes("echo"), "门禁放行（MCP 工具照常真执行）");
      } finally {
        const events = await drain(session);
        assert.equal(events.filter((e) => e.kind === "settled").length, 1, "settled 恰 1（治理回归）");
        assert.ok(events.some((e) => e.kind === "message" && String(e.summary).includes("已启用服务端工具：web_search")), `server-tools 启用行在场：${JSON.stringify(events.map((e) => String(e.summary).slice(0, 40)))}`);
      }
    } finally {
      if (prev === undefined) delete process.env.ANS_PI_SERVER_TOOLS; else process.env.ANS_PI_SERVER_TOOLS = prev;
    }
  });
});

// —————————————————————— 零声明逐字旧行为 ——————————————————————

test("J6 零声明：扩展仅治理一件、活动面为空、不调 bindExtensions、轮次照常（settled 恰 1）", async () => {
  await temp(async (dir) => {
    const sdk = await engine();
    await writeFile(join(dir, "mcp.json"), JSON.stringify({ servers: { rogue: { command: "node", args: [] } } }));
    const session = await createRealPiRuntimeAdapter(adapterOptions(dir), sdk.dependencies).bindRole(role);
    try {
      assert.deepEqual(sdk.native.getActiveToolNames(), [], "活动面为空（零声明）");
      assert.deepEqual(sdk.extensionsResult.extensions.map((x) => String(x.path)), ["<inline:ans-governance>"], "扩展仅治理一件（MCP 扩展不加载；rogue mcp.json 零搭车）");
      sdk.faux.setResponses([sdk.ai.fauxAssistantMessage("plain")] as never);
      await session.prompt("no mcp");
    } finally {
      const events = await drain(session);
      assert.equal(events.filter((e) => e.kind === "settled").length, 1, "settled 恰一（逐字旧行为）");
    }
  });
});
