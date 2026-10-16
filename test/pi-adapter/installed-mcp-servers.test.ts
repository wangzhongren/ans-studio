// G-4 V2（P3 Pi）：按角色安装的外来 MCP——接线/放行判据/env 收窄/dispose 收口/首轮等待。
// 归属：Pi适配器角色测试目录。
//
// 依据：客户 2026-10-16 批准 G-4 V2（契约＝`src/model/runtime.ts` 的 `InstalledMcpServerV1`）；
// P0 探针定格见 `docs/fix/2026-10-16_probe_mcp-surface.md`（本文件＝探针单元格转正）。
// 口径：①接通＝bindExtensions（仅装配 MCP 时补调）；②放行＝前缀面 `mcp__<清洗后白名单名>__*`（1128 与门禁
// 同判据；工具名清洗与 SDK 同名 `[^A-Za-z0-9_]`→`_`）；③tools-only（资源工具三名不在放行面——不接）；
// ④env 收窄＝自持 StdioTransport{inheritEnv:false, 最小集＝PATH＋声明 env}、`env:NAME` 只自进程环境展开；
// ⑤dispose 收口＝先补发 session_shutdown（MCP 关连接/子进程）再 dispose。
//
// 依赖隔离：本文件**不静态 import** Pi 包（全部经测试内动态 import；未安装时相关用例跳过）。
// 全离线：faux 模型进程内＋本地 stdio 夹具（`mcp-fixture-server.ts`，子进程拉起），零网关请求。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { InstalledMcpServerV1, SessionEvent } from "../../src/model/runtime.ts";
import {
  createRealPiRuntimeAdapter,
  mcpToolAllowedByWhitelistedServer,
  resolveInstalledMcpServers,
  type RealPiAdapterOptions,
} from "../../src/common/pi-adapter/real-adapter.ts";
import { resolvePiProviderConfig } from "../../src/common/pi-adapter/provider-config.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import { makeRole } from "./fixtures.ts";

const log = { stage() {}, trace() {}, traceEnabled: false };
const SERVER_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "mcp-fixture-server.ts");
const config = resolvePiProviderConfig(
  { providerId: "p3-mcp", baseUrl: "https://p3.invalid/", modelId: "p3-model", apiKeyEnvVar: "P3_MCP_FAKE", contextWindow: 32768 },
  { P3_MCP_FAKE: "offline-placeholder" },
);

async function piInstalled(): Promise<boolean> {
  try { await import("@earendil-works/pi-coding-agent"); return true; } catch { return false; }
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const now = (): number => Date.now();
async function until(fn: () => boolean, timeoutMs: number, stepMs = 25): Promise<boolean> {
  const begun = now();
  for (;;) {
    if (fn()) return true;
    if (now() - begun > timeoutMs) return false;
    await wait(stepMs);
  }
}
const alive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

async function temp(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "p3-mcp-"));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

/** faux 引擎＋捕获原生会话（loadPi 接缝：生产代码零改动，测试在运行期包一层 createAgentSession）。 */
async function engine() {
  const pi = await import("@earendil-works/pi-coding-agent");
  const ai = await import("@earendil-works/pi-ai");
  const faux = ai.fauxProvider({ tokensPerSecond: 100000 });
  const runtime = await pi.ModelRuntime.create({ credentials: new ai.InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  runtime.registerNativeProvider(faux.provider);
  const model = runtime.getModel(faux.provider.id, faux.models[0].id)!;
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
    currentTurnId: () => "p3-turn",
    promptTimeoutMs: 5000,
    config,
    logger: log,
    ...(mcpServers !== undefined ? { installedMcpServers: mcpServers } : {}),
    ...extra,
  };
}

function stdioServer(name: string, dir: string, extraArgs: string[] = []): InstalledMcpServerV1 {
  return { name, command: process.execPath, args: [SERVER_SCRIPT, `--name=${name}`, "--tools=echo", ...extraArgs] };
}

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

/** 等“接通”：活动面出现任意 mcp__ 名（server 命中断言另做）。 */
const mcpNamesOf = (native: NativeSession): string[] => native.getActiveToolNames().filter((n) => n.startsWith("mcp__"));

// —————————————————————— 单元：判据与 env 展开（纯函数） ——————————————————————

test("判据单元：前缀面命中/边界/清洗；env 展开（env:NAME 只自进程环境、缺失即抛、字面量原样）", () => {
  const wl = ["srv-a"];
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__srv_a__echo", wl), true, "清洗名（- → _）命中");
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__srv_a__echo__x", wl), true, "tool 段含 __ 仍命中（前缀面）");
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__srv_a__long_name_ab12cd34", wl), true, "哈希缩短路径前缀完整");
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__srv_ax__echo", wl), false, "前缀边界（__）防近似串");
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__other__echo", wl), false, "异 server 不命中");
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__srv_a__echo", []), false, "空白名单不命中");
  assert.equal(mcpToolAllowedByWhitelistedServer("write_file", wl), false, "非 mcp__ 名不命中（注入名走精确集）");
  assert.equal(mcpToolAllowedByWhitelistedServer("mcp__srv-a__echo", wl), false, "未清洗原名不命中（SDK 侧名是清洗后）");

  // resolveInstalledMcpServers：字面量原样 / env:NAME 展开 / 缺失即抛 / 不改输入
  const input: InstalledMcpServerV1[] = [
    { name: "a", command: "node", args: ["x"], env: { LIT: "literal", REF: "env:FROM_ENV" } },
    { name: "b", command: "node", args: [] },
  ];
  const before = JSON.stringify(input);
  const resolved = resolveInstalledMcpServers(input, { FROM_ENV: "real-value" });
  assert.deepEqual(resolved[0], { name: "a", command: "node", args: ["x"], env: { LIT: "literal", REF: "real-value" } });
  assert.deepEqual(resolved[1], { name: "b", command: "node", args: [], env: {} });
  assert.equal(JSON.stringify(input), before, "纯函数不改输入");
  assert.throws(() => resolveInstalledMcpServers([{ name: "c", command: "node", args: [], env: { K: "env:MISSING_VAR" } }], {}), /MISSING_VAR/);
  assert.throws(() => resolveInstalledMcpServers([{ name: "c", command: "node", args: [], env: { K: "env:" } }], {}), /env:/);
});

// —————————————————————— 接通＋放行＋端到端（bindExtensions 落到生产路径） ——————————————————————

test("接通与放行：bindRole 装配 MCP（bindExtensions 补调）⇒ direct 工具可达、前缀面放行、工具真跑到服务端", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await temp(async (dir) => {
    const sdk = await engine();
    const calls = join(dir, "calls.log");
    const servers: InstalledMcpServerV1[] = [stdioServer("srv-a", dir, [`--call-log=${calls}`])];
    const session = await createRealPiRuntimeAdapter(adapterOptions(dir, servers), sdk.dependencies).bindRole(makeRole());
    try {
      const connected = await until(() => mcpNamesOf(sdk.native).length >= 1, 8000);
      assert.ok(connected, `MCP 应接通（活动面：${JSON.stringify(sdk.native.getActiveToolNames())}）`);
      const echo = mcpNamesOf(sdk.native).find((n) => n.endsWith("__echo"))!;
      assert.equal(echo, "mcp__srv_a__echo", "名字＝SDK 清洗形态（- → _）");

      // 构造期 1128 已通过（bindRole 未抛）＋前缀面载荷对照：tools=[] ⇒ 活动面＝纯 MCP 名（快照式会全判「非注入」）。
      assert.deepEqual(sdk.native.getActiveToolNames().filter((n) => !n.startsWith("mcp__")), [], "活动面＝纯 MCP 名");

      sdk.faux.setResponses([
        sdk.ai.fauxAssistantMessage([sdk.ai.fauxToolCall(echo, { text: "MCP_WIRE_MARKER" })]),
        sdk.ai.fauxAssistantMessage("done"),
      ] as never);
      await session.prompt("call the mcp tool");
      assert.ok(readFileSync(calls, "utf8").includes("echo"), "服务端收到调用（门禁放行 ⇒ 真执行）");
      assert.ok(toolResultTexts(sdk.native).some((r) => r.includes("MCP_WIRE_MARKER") && r.includes('"echo"')), "结果进入转录");
    } finally {
      const events = await drain(session);
      assert.equal(events.filter((e) => e.kind === "settled").length, 1, "settled 单点不变");
      assert.equal(events.some((e) => e.kind === "denied" && String(e.summary).includes("非注入")), false, "白名单 MCP 调用不落拒绝");
    }
  });
});

test("无声明零变化：未注入 installedMcpServers ⇒ 不加载 MCP 扩展、不调 bindExtensions、活动面仅注入", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await temp(async (dir) => {
    const sdk = await engine();
    const session = await createRealPiRuntimeAdapter(adapterOptions(dir), sdk.dependencies).bindRole(makeRole());
    try {
      assert.deepEqual(sdk.native.getActiveToolNames(), [], "tools=[] ⇒ 活动面为空（既有行为）");
      const paths = sdk.extensionsResult.extensions.map((x) => String(x.path));
      assert.deepEqual(paths, ["<inline:ans-governance>"], "仅治理扩展（MCP 扩展不加载）");
      sdk.faux.setResponses([sdk.ai.fauxAssistantMessage("ok")] as never);
      await session.prompt("no mcp");
    } finally {
      const events = await drain(session);
      assert.equal(events.filter((e) => e.kind === "settled").length, 1);
    }
  });
});

// —————————————————————— env 收窄（生产自持 transport 实证） ——————————————————————

test("env 收窄：自持 transport inheritEnv:false＋最小集；env:NAME 真值展开；宿主哨兵不泄漏", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await temp(async (dir) => {
    const sdk = await engine();
    const dump = join(dir, "env-dump.json");
    const sentinelKey = "P3_MCP_GATEWAY_SENTINEL";
    process.env[sentinelKey] = "planted";
    process.env.P3_MCP_DUMP_PATH = dump;
    const servers: InstalledMcpServerV1[] = [
      { ...stdioServer("srv-e", dir, [`--dump-env=${dump}`]), env: { PROBE_ENV_DUMP: "env:P3_MCP_DUMP_PATH", PROBE_MARKER: "literal-marker" } },
    ];
    const session = await createRealPiRuntimeAdapter(adapterOptions(dir, servers), sdk.dependencies).bindRole(makeRole());
    try {
      const connected = await until(() => mcpNamesOf(sdk.native).length >= 1 && existsSync(dump), 8000);
      assert.ok(connected, "接通且落盘 env 清单（env:NAME 展开为真路径 ⇒ 文件存在）");
      const dumpJson = JSON.parse(readFileSync(dump, "utf8")) as { envKeys: string[] };
      const expectedSelf = ["PATH", "PROBE_ENV_DUMP", "PROBE_MARKER"];
      // 平台级注入（**平台真值豁免**——与 transport 无关、OS 在进程创建时补入；「哨兵不泄漏」断言不受影响）：
      // · macOS：`__CF_USER_TEXT_ENCODING`（`env -i` 亦见；P0 探针单核）。
      // · Windows（CI run 38924209553 实据）：`HOMEDRIVE/HOMEPATH/LOGONSERVER/SYSTEMDRIVE/SYSTEMROOT/TEMP/USERDOMAIN/USERNAME/USERPROFILE/WINDIR`
      //   —— 整组为登录会话级真值（身份/系统目录/临时目录，CreateProcess 语义补入）；**三平台适配器各自独立的
      //   收窄测试在同一次 Windows CI 中实得同一键集**（本角色/Claude端/Codex端三处 spawn 实现互异）⇒ 平台级、非栈级；
      //   该次实得同时证：宿主哨兵键零泄漏、名单外业务键为零。
      const platformInjected = process.platform === "win32"
        ? ["HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "USERDOMAIN", "USERNAME", "USERPROFILE", "WINDIR"]
        : process.platform === "darwin"
          ? ["__CF_USER_TEXT_ENCODING"]
          : [];
      const extra = dumpJson.envKeys.filter((k) => !expectedSelf.includes(k) && !platformInjected.includes(k));
      assert.deepEqual(extra, [], `子进程 env 键＝自持最小集∪平台注入；实得 ${JSON.stringify(dumpJson.envKeys)}`);
      assert.ok(expectedSelf.every((k) => dumpJson.envKeys.includes(k)), "自持三键在场");
      assert.equal(dumpJson.envKeys.includes(sentinelKey), false, "宿主哨兵键不泄漏");
    } finally {
      await session.dispose();
      await rm(dump, { force: true });
      delete process.env[sentinelKey];
      delete process.env.P3_MCP_DUMP_PATH;
    }
  });
});

test("env:NAME 缺失 ⇒ bindRole 构造期如实抛错（不静默省略、不拉起子进程）", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await temp(async (dir) => {
    const sdk = await engine();
    const servers: InstalledMcpServerV1[] = [
      { ...stdioServer("srv-x", dir), env: { CRED: "env:P3_DEFINITELY_MISSING_VAR" } },
    ];
    delete process.env.P3_DEFINITELY_MISSING_VAR;
    await assert.rejects(
      createRealPiRuntimeAdapter(adapterOptions(dir, servers), sdk.dependencies).bindRole(makeRole()),
      /P3_DEFINITELY_MISSING_VAR/,
    );
  });
});

// —————————————————————— tools-only（资源工具不接） ——————————————————————

test("tools-only：server 自报 resources ⇒ 会话照常，资源工具不在放行面（门禁拒）", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await temp(async (dir) => {
    const sdk = await engine();
    const calls = join(dir, "calls.log");
    const servers: InstalledMcpServerV1[] = [stdioServer("srv-r", dir, ["--resources", `--call-log=${calls}`])];
    const session = await createRealPiRuntimeAdapter(adapterOptions(dir, servers), sdk.dependencies).bindRole(makeRole());
    let resourceActive = false;
    let echoDeniedRows = 0;
    try {
      const connected = await until(() => mcpNamesOf(sdk.native).length >= 1, 8000);
      assert.ok(connected, "带 resources 的 server 照常接通（构造期硬校验不被误伤：判据在 bindExtensions 前快照）");
      resourceActive = await until(() => sdk.native.getActiveToolNames().includes("list_mcp_resources"), 5000);
      t.diagnostic(`资源工具被 SDK 登记/激活：${String(resourceActive)}（活动面：${JSON.stringify(sdk.native.getActiveToolNames())}）`);
      const echo = mcpNamesOf(sdk.native).find((n) => n.endsWith("__echo"))!;
      // 资源工具若有则必拒（不在放行面）；tools 照常可达——一次 prompt 内两笔调用。
      sdk.faux.setResponses([
        sdk.ai.fauxAssistantMessage([sdk.ai.fauxToolCall("list_mcp_resources", {}), sdk.ai.fauxToolCall(echo, { text: "SRV_R_MARKER" })]),
        sdk.ai.fauxAssistantMessage("done"),
      ] as never);
      await session.prompt("resources and tools");
      const results = toolResultTexts(sdk.native);
      if (resourceActive) {
        assert.ok(results.some((r) => r.includes("list_mcp_resources") && r.includes("非注入的 ANS 工具")), "资源工具调用被门禁拒（不接＝不放行）");
      } else {
        const blocked = results.some((r) => r.includes("list_mcp_resources") && (r.includes("非注入") || r.includes("not found") || r.includes("isError\":true")));
        assert.ok(blocked, "未登记形态下亦无资源工具执行成功");
      }
      assert.ok(readFileSync(calls, "utf8").includes("echo"), "同轮 tools 调用照常真执行");
      assert.ok(results.some((r) => r.includes("SRV_R_MARKER")), "tools 结果进入转录");
    } finally {
      const events = await drain(session);
      echoDeniedRows = events.filter((e) => e.kind === "denied" && String(e.summary).includes("非注入") && String(e.summary).includes("list_mcp_resources")).length;
      assert.equal(events.filter((e) => e.kind === "settled").length, 1);
      assert.equal(echoDeniedRows >= 1, resourceActive, "资源工具拒绝行与激活态一致（不接＝不放行）");
    }
  });
});

// —————————————————————— dispose 收口（子进程退出） ——————————————————————

test("dispose 收口：RoleSession.dispose() 后 MCP 子进程退出（session_shutdown 补发生效）", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await temp(async (dir) => {
    const sdk = await engine();
    const dump = join(dir, "env.json");
    const servers: InstalledMcpServerV1[] = [stdioServer("srv-d", dir, [`--dump-env=${dump}`])];
    const session = await createRealPiRuntimeAdapter(adapterOptions(dir, servers), sdk.dependencies).bindRole(makeRole());
    const connected = await until(() => mcpNamesOf(sdk.native).length >= 1 && existsSync(dump), 8000);
    assert.ok(connected, "接通");
    const pid = (JSON.parse(readFileSync(dump, "utf8")) as { pid: number }).pid;
    assert.equal(alive(pid), true, "前置：子进程在场");
    await session.dispose();
    const gone = await until(() => !alive(pid), 5000);
    assert.equal(gone, true, "dispose 后子进程退出（P0 探针缺口已补）");
  });
});

// —————————————————————— startupWaitMs 首轮钳位 ——————————————————————

test("startupWaitMs：慢 server 首轮被钳位、次轮不再等；0 ⇒ 不等；接通后工具动态出现", async (t) => {
  if (!(await piInstalled())) { t.skip("未安装 @earendil-works/pi-coding-agent"); return; }
  await temp(async (dir) => {
    const sdk = await engine();
    const servers: InstalledMcpServerV1[] = [stdioServer("srv-s", dir, ["--init-delay=2500"])];
    const session = await createRealPiRuntimeAdapter(adapterOptions(dir, servers, { mcpStartupWaitMs: 700 }), sdk.dependencies).bindRole(makeRole());
    try {
      sdk.faux.setResponses([sdk.ai.fauxAssistantMessage("p1")] as never);
      const t1 = now();
      await session.prompt("slow p1");
      const p1 = now() - t1;
      sdk.faux.setResponses([sdk.ai.fauxAssistantMessage("p2")] as never);
      const t2 = now();
      await session.prompt("slow p2");
      const p2 = now() - t2;
      t.diagnostic(`首轮 ${p1}ms / 次轮 ${p2}ms（server initialize 延迟 2500ms，等待上限 700ms）`);
      assert.ok(p1 >= 550 && p1 <= 1500, `首轮被钳到 ≈700ms（实得 ${p1}ms）`);
      assert.ok(p2 < 400, `次轮不再等待（实得 ${p2}ms；waitedForStartup 一次性）`);
      const late = await until(() => mcpNamesOf(sdk.native).length >= 1, 8000);
      assert.ok(late, "后台继续接通、工具动态出现");
    } finally {
      await session.dispose();
    }
  });

  await temp(async (dir) => {
    const sdk = await engine();
    const servers: InstalledMcpServerV1[] = [stdioServer("srv-z", dir, ["--init-delay=2500"])];
    const session = await createRealPiRuntimeAdapter(adapterOptions(dir, servers, { mcpStartupWaitMs: 0 }), sdk.dependencies).bindRole(makeRole());
    try {
      sdk.faux.setResponses([sdk.ai.fauxAssistantMessage("z1")] as never);
      const t0 = now();
      await session.prompt("zero wait");
      assert.ok(now() - t0 < 400, "startupWaitMs=0 ⇒ 首轮不等待");
    } finally {
      await session.dispose();
    }
  });
});
