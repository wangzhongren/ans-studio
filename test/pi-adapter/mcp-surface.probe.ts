// scratch 探针驱动：V2 MCP P0（评估文档 §九.3 逐项定格）。
// 归属：Pi适配器角色测试目录。**不是自动化测试**（`test/**/*.test.ts` glob 不会选中本文件）。
//
// 纪律（沿 G-3 探针先例）：
//   · 纯本地——faux 模型在进程内（不发任何真实网关请求）；MCP server 全为本地夹具（stdio 子进程 / 环回 HTTP）；
//   · scratch 文件全部落系统临时目录（本驱动 finally 自清）；`PI_CODING_AGENT_DIR` 覆盖到 scratch，
//     全程不碰真实 `~/.pi`；
//   · 环境面证据只记录**键名**（绝不记录值）；HTTP 头解析用 plant 的哑值，只记存在性；
//   · 输出结构化 JSON（PROBE_RESULT）；用法：`node test/pi-adapter/mcp-surface.probe.ts [OUTDIR]`。
//
// 逐项对应：
//   A. bindExtensions 接通 MCP（生产适配器真实路径）＋现状门禁拒绝直连工具＋治理回归（settled×1/工具面/dispose 后子进程）
//   B. 判据草案模拟（`mcp__<白名单 server>__*` 前缀面＋精确注入名）：端到端可达、stray 仍拒、写门禁照旧、
//      server-tools 观测注册面与合成观测、1128 快照式 vs 前缀式对照；B2：名字清洗/哈希路径
//   C. `startupWaitMs` 首轮时延实测（baseline / fast / slow+800 / slow+0）
//   D. 环境收窄对照（自持 StdioTransport{inheritEnv:false} vs 默认 transport）
//   E. HTTP server 路径（环回；无子进程、header `${VAR}` 逐键解析面；如实注明风险差异）

import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync, writeFileSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { SessionEvent, ToolDefinition as GovernedTool } from "../../src/model/runtime.ts";
import { createRealPiRuntimeAdapter, buildGovernanceExtension, toPiTool, wireSettledOnce } from "../../src/common/pi-adapter/real-adapter.ts";
import { buildGovernedTools } from "../../src/provider/pi/tools.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import { ANS_SETTINGS_OVERRIDES } from "../../src/common/pi-adapter/settings.ts";
import { resolvePiProviderConfig } from "../../src/common/pi-adapter/provider-config.ts";
import { parseServerToolConfig, type ServerToolExtensionOptions } from "../../src/common/pi-adapter/server-tools.ts";
import { makeGate, makeRole } from "./fixtures.ts";

// —————————————————————— scratch 环境（先于任何 Pi 包加载） ——————————————————————

const SCRATCH = mkdtempSync(join(tmpdir(), "ans-mcp-surface-probe-"));
process.env.PI_CODING_AGENT_DIR = join(SCRATCH, "agent-dir");
mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });
const OUTDIR = process.argv[2] !== undefined && process.argv[2] !== "" ? process.argv[2] : undefined;
const SERVER_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "mcp-probe-server.probe.ts");

const result: Record<string, unknown> = {};
const childPids: number[] = [];
let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (!ok) failures += 1;
  console.log(`[probe] ${ok ? "PASS" : "FAIL"} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) result[`FAIL:${label}`] = detail ?? true;
}
const now = (): number => Date.now();
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
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
function readDump(path: string): { server: string; pid: number; ppid: number; envKeys: string[] } | undefined {
  try { return JSON.parse(readFileSync(path, "utf8")) as { server: string; pid: number; ppid: number; envKeys: string[] }; } catch { return undefined; }
}
const sorted = (names: readonly string[]): string[] => [...names].sort();

// —————————————————————— 引擎（faux，进程内） ——————————————————————

type PiModule = typeof import("@earendil-works/pi-coding-agent");
type AiModule = typeof import("@earendil-works/pi-ai");
type NativeSession = Awaited<ReturnType<PiModule["createAgentSession"]>>["session"];
type ExtensionsResult = Awaited<ReturnType<PiModule["createAgentSession"]>>["extensionsResult"];
type McpEntry = import("@earendil-works/pi-coding-agent").McpServerEntry;
type McpFactory = import("@earendil-works/pi-coding-agent").McpTransportFactory;

interface Engine { pi: PiModule; ai: AiModule; faux: ReturnType<AiModule["fauxProvider"]>; model: unknown; runtime: unknown; }
let engine: Engine;

async function makeEngine(): Promise<Engine> {
  const pi = await import("@earendil-works/pi-coding-agent");
  const ai = await import("@earendil-works/pi-ai");
  const faux = ai.fauxProvider({ tokensPerSecond: 100000 });
  const runtime = await pi.ModelRuntime.create({ credentials: new ai.InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  runtime.registerNativeProvider(faux.provider);
  const model = runtime.getModel(faux.provider.id, faux.models[0].id);
  return { pi, ai, faux, model, runtime };
}

// —————————————————————— 判据草案（前缀模式；报告 §二 引用同一份） ——————————————————————

/** 草案：`mcp__<白名单 server>__*` 前缀匹配（server 侧按 SDK 同名清洗 `[^A-Za-z0-9_]`→`_`）。 */
function mcpToolAllowedByWhitelistedServer(toolName: string, whitelistedServerNames: readonly string[]): boolean {
  if (!toolName.startsWith("mcp__")) return false;
  return whitelistedServerNames.some((server) => {
    const sanitized = server.replace(/[^A-Za-z0-9_]/g, "_");
    return sanitized !== "" && toolName.startsWith(`mcp__${sanitized}__`);
  });
}

// —————————————————————— 手工会话构造（B/C/D/E 用；逐字复刻 real-adapter :1046-1068 的生产拼装） ——————————————————————

interface ManualSession {
  session: NativeSession;
  extensionsResult: ExtensionsResult;
  events: SessionEvent[];
  rawSettledCount: () => number;
  disposeWithLiveness: () => Promise<{ pid: number | undefined; aliveAfterDispose: boolean; aliveAfterShutdown: boolean }>;
}

async function buildManualSession(cfg: {
  dir: string;
  governedTools?: GovernedTool[];
  extraPiTools?: unknown[];
  surface: (name: string) => boolean;
  mcpEntries: McpEntry[];
  createTransport?: McpFactory;
  startupWaitMs?: number;
  serverTools?: ServerToolExtensionOptions;
  dumpPathForPid?: string;
}): Promise<ManualSession> {
  mkdirSync(cfg.dir, { recursive: true });
  const events: SessionEvent[] = [];
  const emit = (event: SessionEvent): void => { events.push(event); };
  const governed = cfg.governedTools ?? [];
  const extension = buildGovernanceExtension(
    () => { throw new Error("probe：生产工具判定必须由注入 handler 执行"); },
    emit,
    governed.some((t) => t.name === "run_shell"),
    {
      allowedToolNames: { has: (name: string) => cfg.surface(name) } as unknown as ReadonlySet<string>,
      ...(cfg.serverTools !== undefined ? { serverTools: cfg.serverTools } : {}),
    },
  );
  const mcp = engine.pi.createMcpExtension({
    loadConfig: () => ({ servers: cfg.mcpEntries, errors: [] }),
    ...(cfg.createTransport !== undefined ? { createTransport: cfg.createTransport } : {}),
    ...(cfg.startupWaitMs !== undefined ? { startupWaitMs: cfg.startupWaitMs } : {}),
  });
  const settingsManager = engine.pi.SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES);
  const resourceLoader = new engine.pi.DefaultResourceLoader({
    cwd: cfg.dir,
    agentDir: cfg.dir,
    extensionFactories: [extension, mcp],
    noExtensions: true,
    systemPrompt: "# probe\n",
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    settingsManager,
  });
  await resourceLoader.reload();
  const customTools = [...governed.map((t) => toPiTool(t, {})), ...(cfg.extraPiTools ?? [])];
  const created = await engine.pi.createAgentSession({
    cwd: cfg.dir,
    noTools: "builtin",
    customTools: customTools as never,
    resourceLoader,
    model: engine.model as never,
    modelRuntime: engine.runtime as never,
    sessionManager: engine.pi.SessionManager.inMemory(cfg.dir),
    settingsManager,
  });
  const session = created.session;
  let rawSettled = 0;
  const unsubRaw = session.subscribe((ev: { type: string }) => { if (ev.type === "agent_settled") rawSettled += 1; });
  wireSettledOnce(session, emit);
  return {
    session,
    extensionsResult: created.extensionsResult,
    events,
    rawSettledCount: () => rawSettled,
    async disposeWithLiveness() {
      unsubRaw();
      const pid = cfg.dumpPathForPid !== undefined ? readDump(cfg.dumpPathForPid)?.pid : undefined;
      session.dispose();
      await wait(200);
      const aliveAfterDispose = pid !== undefined && alive(pid);
      // SDK 走 AgentSessionRuntime 时才发 session_shutdown；本适配器直接持有 AgentSession ⇒ 探针补发，
      // 观察 MCP 扩展的收口路径（V2 的 dispose 收口候选，见报告）。
      await session.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }).catch(() => undefined);
      const gone = pid !== undefined ? await until(() => !alive(pid), 5000) : true;
      return { pid, aliveAfterDispose, aliveAfterShutdown: pid !== undefined && !gone };
    },
  };
}

/** 自持 transport 工厂：环境收窄的挂点（报告 §四）。 */
async function selfTransportFactory(env: Record<string, string>): Promise<McpFactory> {
  const mcpLib = await import("@earendil-works/pi-mcp");
  return ((entry: McpEntry, cwd: string) => {
    const config = entry.config as { command: string; args?: string[] };
    return new mcpLib.StdioTransport({
      command: config.command,
      args: config.args,
      cwd,
      env,
      inheritEnv: false,
      stderr: "pipe",
    });
  }) as McpFactory;
}

function probeEntry(name: string, args: string[]): McpEntry {
  return {
    name,
    config: { type: "stdio", command: process.execPath, args: [SERVER_SCRIPT, ...args], exposure: "direct" },
    source: "probe",
  };
}

/** 跑一轮 prompt：设好 faux 脚本、计时、返回时长（毫秒）。 */
async function promptTimed(target: { prompt(text: string): Promise<unknown> }, label: string, call?: { name: string; args: Record<string, unknown> }): Promise<number> {
  const responses: unknown[] = [];
  if (call !== undefined) responses.push(engine.ai.fauxAssistantMessage([engine.ai.fauxToolCall(call.name, call.args as never)]));
  responses.push(engine.ai.fauxAssistantMessage(`ok:${label}`));
  engine.faux.setResponses(responses as never);
  const begun = now();
  await target.prompt(label);
  return now() - begun;
}

const mcpNamesOf = (session: NativeSession): string[] => session.getActiveToolNames().filter((n) => n.startsWith("mcp__"));

/** 转录里的工具结果消息（role=toolResult）文本——结果面证据（与助手调用参数区分）。 */
function toolResultTexts(session: NativeSession): string[] {
  const messages = (session as unknown as { state: { messages: { role?: string }[] } }).state.messages;
  return messages.filter((m) => m.role === "toolResult").map((m) => JSON.stringify(m));
}

// —————————————————————— A：bindExtensions 接通 + 现状门禁 + 治理回归（生产适配器真实路径） ——————————————————————

async function sectionA(): Promise<void> {
  console.log("\n[probe] ===== A. 生产路径 bindExtensions ↔ MCP 接通 / 现状门禁 / 治理回归 =====");
  const dir = join(SCRATCH, "a");
  mkdirSync(dir, { recursive: true });
  const dump = join(dir, "env-self.json");
  const callLog = join(dir, "calls.log");
  const config = resolvePiProviderConfig(
    { providerId: "probe", baseUrl: "https://probe.invalid/", modelId: "probe-model", apiKeyEnvVar: "PROBE_FAKE", contextWindow: 32768 },
    { PROBE_FAKE: "offline-placeholder" },
  );
  const entryA = probeEntry("probe-a", ["--name=probe-a", "--tools=echo,pid", `--dump-env=${dump}`, `--call-log=${callLog}`]);
  const transportA = await selfTransportFactory({ PATH: process.env.PATH ?? "", PROBE_ENV_DUMP: dump, PROBE_MARKER: "self-held" });
  const mcpFactory = engine.pi.createMcpExtension({ loadConfig: () => ({ servers: [entryA], errors: [] }), createTransport: transportA, startupWaitMs: 3000 });

  let native!: NativeSession;
  let nativeExtensions: ExtensionsResult | undefined;
  const deps = {
    buildRuntime: async () => ({ runtime: engine.runtime, model: engine.model }),
    loadPi: async () => {
      const pi = await import("@earendil-works/pi-coding-agent");
      class PatchedLoader extends pi.DefaultResourceLoader {
        constructor(options: ConstructorParameters<typeof pi.DefaultResourceLoader>[0]) {
          super({ ...options, extensionFactories: [...(options.extensionFactories ?? []), mcpFactory] });
        }
      }
      return {
        ...pi,
        DefaultResourceLoader: PatchedLoader,
        async createAgentSession(input: Parameters<typeof pi.createAgentSession>[0]) {
          const out = await pi.createAgentSession(input);
          native = out.session;
          nativeExtensions = out.extensionsResult;
          return out;
        },
      } as typeof pi;
    },
  };

  const tools = buildGovernedTools(makeGate({ project: [], skill: [] }));
  const roleSession = await createRealPiRuntimeAdapter(
    { runtime: "pi", projectRoot: dir, skillRoot: dir, tools, interactionGate: createInteractionGate(), currentTurnId: () => "a-turn", promptTimeoutMs: 10000, config, logger: { stage() {}, trace() {}, traceEnabled: false } },
    deps as never,
  ).bindRole(makeRole());

  const preBindActive = sorted(native.getActiveToolNames());
  console.log("[probe] A bindRole 后（bindExtensions 前）活动工具:", JSON.stringify(preBindActive));
  console.log("[probe] A 加载的扩展:", JSON.stringify(nativeExtensions?.extensions.map((x) => ({ path: String(x.path), handlers: [...x.handlers.keys()].sort() }))));
  check("A 绑定前活动工具＝仅注入（无 mcp__）", preBindActive.every((n) => !n.startsWith("mcp__")));

  await native.bindExtensions({});
  const connected = await until(() => mcpNamesOf(native).length >= 2, 10000);
  const postBindActive = sorted(native.getActiveToolNames());
  const callables = sorted(native.getCallableToolNames());
  console.log("[probe] A bindExtensions 后活动工具:", JSON.stringify(postBindActive));
  console.log("[probe] A bindExtensions 后可被工具调用面（getCallableToolNames）:", JSON.stringify(callables));
  const mcpEcho = mcpNamesOf(native).find((n) => n.endsWith("__echo"));
  check("A bindExtensions 后 MCP 接通、direct 工具进入声明面（恰 echo/pid 两只）", connected && mcpNamesOf(native).length === 2, mcpNamesOf(native));
  const mcpNamesA = mcpNamesOf(native);

  const collected: SessionEvent[] = [];
  const drain = (async () => { for await (const ev of roleSession.events()) collected.push(ev); })();

  if (mcpEcho !== undefined) {
    await promptTimed(roleSession, "a-p1（现状口径：应被门禁拒）", { name: mcpEcho, args: { text: "PROBE_A_MARKER" } });
    await promptTimed(roleSession, "a-p2");
  }
  await roleSession.dispose();
  await drain;

  const settledRows = collected.filter((ev) => ev.kind === "settled");
  const deniedRows = collected.filter((ev) => ev.kind === "denied" && String(ev.summary).includes("非注入的 ANS 工具"));
  const callLogText = existsSync(callLog) ? readFileSync(callLog, "utf8") : "";
  const resultsA = toolResultTexts(native);
  console.log("[probe] A 映射 settled 行:", JSON.stringify(settledRows.map((s) => (s.detail as { outcome?: string }).outcome)));
  console.log("[probe] A 门禁拒绝行:", JSON.stringify(deniedRows.map((d) => d.summary)));
  check("A 现状门禁（499-504 快照口径）拒绝 MCP 直连工具", deniedRows.length >= 1);
  check("A 被拒调用未到达服务端（call-log 为空 ⇒ 执行前阻断）", callLogText.trim() === "", callLogText.trim());
  check("A 拒绝理由进入转录（createErrorToolResult(reason)）", resultsA.some((r) => r.includes("非注入的 ANS 工具")));
  check("A 每轮映射 settled 恰 1（2 轮）", settledRows.length === 2, settledRows.length);

  // dispose 后子进程收口（V2 收口发现）。
  const dumpA = readDump(dump);
  if (dumpA !== undefined) childPids.push(dumpA.pid);
  const pidA = dumpA?.pid;
  const aliveAfterDispose = pidA !== undefined && alive(pidA);
  await native.extensionRunner.emit({ type: "session_shutdown", reason: "quit" }).catch(() => undefined);
  const goneAfterShutdown = pidA !== undefined ? await until(() => !alive(pidA), 5000) : true;
  console.log("[probe] A dispose() 后子进程存活:", aliveAfterDispose, "；补发 session_shutdown 后退出:", goneAfterShutdown);
  result["a"] = {
    preBindActive,
    postBindActive,
    callableNames: callables,
    mcpNames: mcpNamesA,
    deniedSummaries: deniedRows.map((d) => d.summary),
    settledMappedPer2Turns: settledRows.length,
    callLogEmptyAfterBlockedCalls: callLogText.trim() === "",
    disposeLeavesChildAlive: aliveAfterDispose,
    shutdownEventStopsChild: goneAfterShutdown,
    selfHeldEnvKeys: dumpA?.envKeys,
  };
}

// —————————————————————— B：判据草案模拟（前缀面） ——————————————————————

async function sectionB(): Promise<void> {
  console.log("\n[probe] ===== B. 判据草案（前缀面）模拟：可达/回归/1128 对照 =====");
  const dir = join(SCRATCH, "b");
  const dump = join(dir, "env.json");
  const callLog = join(dir, "calls.log");
  const entryB = probeEntry("probe-b", ["--name=probe-b", "--tools=echo", `--dump-env=${dump}`, `--call-log=${callLog}`]);
  const transportB = await selfTransportFactory({ PATH: process.env.PATH ?? "", PROBE_ENV_DUMP: dump, PROBE_MARKER: "self-held" });

  const injected = buildGovernedTools(makeGate({ project: [join(dir, "src/ok.ts")], skill: [] }), { writeRoot: dir, readRoot: dir });
  const injectedNames = new Set(injected.map((t) => t.name));
  const whitelist = ["probe-b"];
  const surface = (name: string) => injectedNames.has(name) || mcpToolAllowedByWhitelistedServer(name, whitelist);
  let strayCalls = 0;
  const stray = {
    name: "stray_tool",
    description: "probe stray",
    parameters: { type: "object", properties: {}, additionalProperties: true },
    async execute() { strayCalls += 1; return { content: [{ type: "text", text: "MUST NOT RUN" }] }; },
  };

  // server-tools 观测：开启配置（env）→ 扩展注册面证据（构造期解析，等价生产 bindRole 内 parseServerToolConfig）。
  const previousServerTools = process.env.ANS_PI_SERVER_TOOLS;
  process.env.ANS_PI_SERVER_TOOLS = "web_search";
  let serverTools: ServerToolExtensionOptions | undefined;
  try {
    const parsed = parseServerToolConfig(process.env);
    serverTools = parsed.enabled.length > 0 ? { declarations: parsed.enabled } : undefined;
  } finally {
    if (previousServerTools === undefined) delete process.env.ANS_PI_SERVER_TOOLS;
    else process.env.ANS_PI_SERVER_TOOLS = previousServerTools;
  }

  const session = await buildManualSession({
    dir,
    governedTools: injected,
    extraPiTools: [stray],
    surface,
    mcpEntries: [entryB],
    createTransport: transportB,
    startupWaitMs: 3000,
    serverTools,
    dumpPathForPid: dump,
  });
  await session.session.bindExtensions({});
  const connected = await until(() => mcpNamesOf(session.session).length >= 1, 10000);
  const active = sorted(session.session.getActiveToolNames());
  const mcpEcho = mcpNamesOf(session.session).find((n) => n.endsWith("__echo"));
  console.log("[probe] B bindExtensions 后活动工具:", JSON.stringify(active));
  check("B 前缀面口径下 MCP 工具可达（direct 声明）", connected && mcpEcho !== undefined, mcpEcho);

  // 1128 对照：快照式（现状形态）会拒；前缀式（草案）放行（本探针的 stray_tool 是脚手架——故意置于面外，
  // 真 V2 拼装里不存在该工具；对照只看 mcp__ 名）。
  const snapshotUnexpected = active.filter((n) => !injectedNames.has(n));
  const surfaceUnexpected = active.filter((n) => !surface(n));
  const surfaceUnexpectedMcp = surfaceUnexpected.filter((n) => n.startsWith("mcp__"));
  console.log("[probe] B 快照式 1128 视作『非注入』:", JSON.stringify(snapshotUnexpected));
  console.log("[probe] B 前缀式 1128 残余（含脚手架 stray_tool）:", JSON.stringify(surfaceUnexpected));
  check("B 快照式 1128 会把 MCP 工具当非注入（对照证据）", snapshotUnexpected.some((n) => n.startsWith("mcp__")));
  check("B 前缀式 1128：mcp__ 零残余（stray 为脚手架故意面外）", surfaceUnexpectedMcp.length === 0 && JSON.stringify(surfaceUnexpected) === JSON.stringify(["stray_tool"]), surfaceUnexpected);

  const predicateCases: [string, string[], boolean][] = [
    [mcpEcho ?? "mcp__probe_b__echo", ["probe-b"], true],
    [mcpEcho ?? "mcp__probe_b__echo", [], false],
    ["mcp__probe_bx__echo", ["probe-b"], false],
    ["mcp__other__echo", ["probe-b"], false],
    ["write_file", ["probe-b"], false],
    ["mcp__probe-b__echo", ["probe-b"], false],
  ];
  const predicateResults = predicateCases.map(([name, wl, expected]) => ({ name, whitelist: wl, expected, got: mcpToolAllowedByWhitelistedServer(name, wl) }));
  console.log("[probe] B 判据样例:", JSON.stringify(predicateResults));
  check("B 判据样例全部符合", predicateResults.every((c) => c.expected === c.got));

  // server-tools 注册面（治理扩展 handler 键）：bindExtensions 后仍在；合成观测走注册 handler（活性）。
  const governanceExt = session.extensionsResult.extensions.find((x) => x.path === "<inline:ans-governance>") ?? session.extensionsResult.extensions.find((x) => String(x.path).includes("ans-governance"));
  const handlerKeys = governanceExt !== undefined ? [...governanceExt.handlers.keys()].sort() : [];
  console.log("[probe] B 治理扩展 handler 键:", JSON.stringify(handlerKeys));
  check("B server-tools 观测 handler 已注册（before_provider_request/provider_stream_event）", handlerKeys.includes("before_provider_request") && handlerKeys.includes("provider_stream_event"));
  if (governanceExt !== undefined) {
    const streamHandlers = governanceExt.handlers.get("provider_stream_event") ?? [];
    for (const handler of streamHandlers) {
      await handler(
        { type: "provider_stream_event", api: "anthropic-messages", provider: "probe", model: "probe", data: { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "srvtoolu_probe", name: "web_search", input: { query: "probe-q" } } } } as never,
        undefined as never,
      );
    }
    const requestHandlers = governanceExt.handlers.get("before_provider_request") ?? [];
    const payloadAfter = requestHandlers.length > 0 ? await requestHandlers[0]({ type: "before_provider_request", payload: {} } as never, undefined as never) : undefined;
    const observedRow = session.events.find((ev) => ev.kind === "tool_call" && String(ev.summary).includes("web_search"));
    console.log("[probe] B 合成 provider_stream_event → 观测行:", JSON.stringify(observedRow?.summary));
    console.log("[probe] B 合成 before_provider_request → 声明注入:", JSON.stringify(payloadAfter)?.slice(0, 220));
    check("B 合成观测经注册 handler 产出服务端工具行", observedRow !== undefined);
    check("B 合成声明注入改动请求 payload", payloadAfter !== undefined && JSON.stringify(payloadAfter).includes("web_search"));
  }

  const turns: { label: string; call: { name: string; args: Record<string, unknown> } }[] = [
    { label: "b-p1-echo", call: { name: mcpEcho ?? "mcp__probe_b__echo", args: { text: "PROBE_ECHO_MARKER" } } },
    { label: "b-p2-stray", call: { name: "stray_tool", args: {} } },
    { label: "b-p3-write-ok", call: { name: "write_file", args: { path: "src/ok.ts", content: "ok" } } },
    { label: "b-p4-write-denied", call: { name: "write_file", args: { path: "src/evil.ts", content: "evil" } } },
  ];
  const perTurnSettled: { raw: number; mapped: number }[] = [];
  let rawPrev = 0;
  for (const turn of turns) {
    await promptTimed(session.session, turn.label, turn.call);
    await wait(30);
    perTurnSettled.push({ raw: session.rawSettledCount() - rawPrev, mapped: session.events.filter((ev) => ev.kind === "settled").length });
    rawPrev = session.rawSettledCount();
  }
  // mapped 是累计值：换算每轮增量。
  const mappedDeltas = perTurnSettled.map((row, i) => (i === 0 ? row.mapped : row.mapped - perTurnSettled[i - 1]!.mapped));
  console.log("[probe] B 每轮 settled（raw / mapped 增量）:", JSON.stringify(perTurnSettled.map((row, i) => ({ raw: row.raw, mapped: mappedDeltas[i] }))));

  const callLogText = existsSync(callLog) ? readFileSync(callLog, "utf8") : "";
  const resultsB = toolResultTexts(session.session);
  const deniedRows = session.events.filter((ev) => ev.kind === "denied" && String(ev.summary).includes("非注入的 ANS 工具"));
  // 门禁（注入 handler 层）拒绝的形态：事件行是「write_file 执行失败」，理由在 toolResult 内容（沿旧路径）。
  const gateDeniedRow = session.events.some((ev) => ev.kind === "denied" && String(ev.summary).includes("write_file 执行失败"));
  const gateDeniedResult = resultsB.some((r) => r.includes("不在允许写集内"));
  const mcpNamesB = mcpNamesOf(session.session);
  console.log("[probe] B call-log:", JSON.stringify(callLogText.trim().split("\n").filter((l) => l !== "")));
  console.log("[probe] B 拒绝行（stray）:", JSON.stringify(deniedRows.map((d) => d.summary)));
  console.log("[probe] B 写门禁拒绝（事件行/toolResult）:", gateDeniedRow, gateDeniedResult);
  console.log("[probe] B 转录工具结果角色采样:", JSON.stringify((session.session as unknown as { state: { messages: { role?: string }[] } }).state.messages.map((m) => m.role)));
  for (const [i, r] of resultsB.entries()) console.log(`[probe] B toolResult[${i}]:`, r.slice(0, 300));
  check("B MCP echo 端到端：服务端收到调用", callLogText.includes("echo"));
  check("B MCP echo 端到端：结果进入转录（toolResult 面）", resultsB.some((r) => r.includes("PROBE_ECHO_MARKER") && r.includes('"echo"')), resultsB.length);
  check("B stray 被前缀面外拦截且未执行", strayCalls === 0 && deniedRows.length >= 1, { strayCalls });
  check("B 写门禁照旧：允许写落盘", existsSync(join(dir, "src", "ok.ts")));
  check("B 写门禁照旧：越界写拒绝且未落盘", gateDeniedRow && gateDeniedResult && !existsSync(join(dir, "src", "evil.ts")), { gateDeniedRow, gateDeniedResult });
  check("B 每轮 settled 恰 1（raw 与 mapped 双面，4 轮）", perTurnSettled.every((row, i) => row.raw === 1 && mappedDeltas[i] === 1), perTurnSettled.map((row, i) => ({ raw: row.raw, mapped: mappedDeltas[i] })));

  const closeInfo = await session.disposeWithLiveness();
  console.log("[probe] B dispose 后子进程存活:", closeInfo.aliveAfterDispose, "；补发 session_shutdown 后存活:", closeInfo.aliveAfterShutdown);
  result["b"] = {
    activeNames: active,
    mcpNames: mcpNamesB,
    snapshotUnexpected,
    surfaceUnexpected,
    predicateResults,
    handlerKeys,
    perTurnSettled: perTurnSettled.map((row, i) => ({ raw: row.raw, mapped: mappedDeltas[i] })),
    serverCallLog: callLogText.trim().split("\n").filter((l) => l !== ""),
    strayCalls,
    writeOkLanded: existsSync(join(dir, "src", "ok.ts")),
    writeEvilBlocked: gateDeniedRow && gateDeniedResult && !existsSync(join(dir, "src", "evil.ts")),
    disposeLeavesChildAlive: closeInfo.aliveAfterDispose,
    shutdownEventStopsChild: !closeInfo.aliveAfterShutdown,
  };
}

// —————————————————————— B2：名字清洗/哈希路径 ——————————————————————

async function sectionB2(): Promise<void> {
  console.log("\n[probe] ===== B2. 工具名清洗/哈希路径 vs 前缀判据 =====");
  const dir = join(SCRATCH, "b2");
  const longName = "tool_name_that_is_quite_long_indeed_exceeding_the_limit_abc";
  const entry = probeEntry("probe-srv.v2", ["--name=probe-srv.v2", `--tools=echo,echo.tool,${longName}`]);
  const transport = await selfTransportFactory({ PATH: process.env.PATH ?? "" });
  const session = await buildManualSession({
    dir,
    surface: (name) => mcpToolAllowedByWhitelistedServer(name, ["probe-srv.v2"]),
    mcpEntries: [entry],
    createTransport: transport,
    startupWaitMs: 3000,
  });
  await session.session.bindExtensions({});
  const connected = await until(() => mcpNamesOf(session.session).length >= 3, 10000);
  const observed = sorted(mcpNamesOf(session.session));
  console.log("[probe] B2 观察到的注册名（server=probe-srv.v2；tool=echo / echo.tool / 长名）:", JSON.stringify(observed));
  check("B2 三只工具全部登记（清洗/哈希路径）", connected && observed.length === 3);
  const allMatch = observed.every((n) => mcpToolAllowedByWhitelistedServer(n, ["probe-srv.v2"]));
  console.log("[probe] B2 全部命中前缀白名单:", allMatch, "；边界负例 mcp__probe_srv_v2x__ 命中:", mcpToolAllowedByWhitelistedServer("mcp__probe_srv_v2x__echo", ["probe-srv.v2"]));
  check("B2 清洗/哈希名仍被前缀判据命中；前缀边界（__）防近似串", allMatch && !mcpToolAllowedByWhitelistedServer("mcp__probe_srv_v2x__echo", ["probe-srv.v2"]));
  const closeInfo = await session.disposeWithLiveness();
  result["b2"] = { observedNames: observed, allMatch, closeInfo: { aliveAfterDispose: closeInfo.aliveAfterDispose } };
}

// —————————————————————— C：startupWaitMs 首轮时延实测 ——————————————————————

async function sectionC(): Promise<void> {
  console.log("\n[probe] ===== C. startupWaitMs 首轮时延实测 =====");
  const c = result["c"] = {} as Record<string, unknown>;

  const baseDir = join(SCRATCH, "c-base");
  const baseTransport = await selfTransportFactory({ PATH: process.env.PATH ?? "" });
  const base = await buildManualSession({ dir: baseDir, surface: () => false, mcpEntries: [], createTransport: baseTransport });
  await base.session.bindExtensions({});
  const baselineMs = await promptTimed(base.session, "c-baseline");
  console.log("[probe] C baseline（无 MCP server）首轮:", baselineMs, "ms");
  await base.disposeWithLiveness();
  c["baselineNoMcpMs"] = baselineMs;

  const fastDir = join(SCRATCH, "c-fast");
  const fastDump = join(fastDir, "env.json");
  const fastTransport = await selfTransportFactory({ PATH: process.env.PATH ?? "" });
  const fast = await buildManualSession({ dir: fastDir, surface: (n) => mcpToolAllowedByWhitelistedServer(n, ["probe-fast"]), mcpEntries: [probeEntry("probe-fast", ["--name=probe-fast", "--tools=echo", `--dump-env=${fastDump}`])], createTransport: fastTransport });
  await fast.session.bindExtensions({});
  const fastP1 = await promptTimed(fast.session, "c-fast-p1");
  const fastConnectedAfterP1 = mcpNamesOf(fast.session).length >= 1;
  const fastP2 = await promptTimed(fast.session, "c-fast-p2");
  console.log("[probe] C fast：p1 =", fastP1, "ms（含等待接通）；p2 =", fastP2, "ms；p1 后已接通:", fastConnectedAfterP1);
  await fast.disposeWithLiveness();
  c["fastP1Ms"] = fastP1;
  c["fastP2Ms"] = fastP2;
  c["fastConnectedByP1"] = fastConnectedAfterP1;

  const slowDir = join(SCRATCH, "c-slow");
  const slowDump = join(slowDir, "env.json");
  const slowTransport = await selfTransportFactory({ PATH: process.env.PATH ?? "" });
  const slow = await buildManualSession({ dir: slowDir, surface: (n) => mcpToolAllowedByWhitelistedServer(n, ["probe-slow"]), mcpEntries: [probeEntry("probe-slow", ["--name=probe-slow", "--tools=echo", "--init-delay=3000", `--dump-env=${slowDump}`])], createTransport: slowTransport, startupWaitMs: 800 });
  await slow.session.bindExtensions({});
  const t0 = now();
  const slowP1 = await promptTimed(slow.session, "c-slow-p1");
  const slowP1Done = now();
  const slowP2 = await promptTimed(slow.session, "c-slow-p2");
  const connectedAt = await until(() => mcpNamesOf(slow.session).length >= 1, 8000) ? now() : undefined;
  const slowP3 = await promptTimed(slow.session, "c-slow-p3");
  console.log("[probe] C slow(init-delay=3000)+startupWaitMs=800：p1 =", slowP1, "ms；p2 =", slowP2, "ms；接通时刻≈bind+", connectedAt !== undefined ? connectedAt - t0 : "未接通", "ms；p3（接通后）=", slowP3, "ms");
  check("C slow：首轮被钳到 ≈ startupWaitMs（800±400）", slowP1 >= 600 && slowP1 <= 1300, slowP1);
  check("C slow：次轮不再等待（waitedForStartup 已消费）", slowP2 < 400, slowP2);
  check("C slow：后台继续接通、工具动态出现、p3 正常", connectedAt !== undefined && mcpNamesOf(slow.session).length >= 1, { slowP3 });
  const slowClose = await slow.disposeWithLiveness();
  c["slowP1Ms"] = slowP1;
  c["slowP1DoneAtMs"] = slowP1Done - t0;
  c["slowP2Ms"] = slowP2;
  c["slowConnectedAtMsAfterBind"] = connectedAt !== undefined ? connectedAt - t0 : undefined;
  c["slowP3Ms"] = slowP3;
  c["slowDisposeLeavesChildAlive"] = slowClose.aliveAfterDispose;

  const zeroDir = join(SCRATCH, "c-zero");
  const zeroDump = join(zeroDir, "env.json");
  const zeroTransport = await selfTransportFactory({ PATH: process.env.PATH ?? "" });
  const zero = await buildManualSession({ dir: zeroDir, surface: (n) => mcpToolAllowedByWhitelistedServer(n, ["probe-zero"]), mcpEntries: [probeEntry("probe-zero", ["--name=probe-zero", "--tools=echo", "--init-delay=3000", `--dump-env=${zeroDump}`])], createTransport: zeroTransport, startupWaitMs: 0 });
  await zero.session.bindExtensions({});
  const zeroP1 = await promptTimed(zero.session, "c-zero-p1");
  console.log("[probe] C slow+startupWaitMs=0：p1 =", zeroP1, "ms（不等待）");
  check("C startupWaitMs=0 ⇒ 首轮不等待（<400ms）", zeroP1 < 400, zeroP1);
  await zero.disposeWithLiveness();
  c["slowZeroP1Ms"] = zeroP1;
}

// —————————————————————— D：环境收窄对照 ——————————————————————

async function sectionD(): Promise<void> {
  console.log("\n[probe] ===== D. 环境收窄对照（自持 transport vs 默认） =====");
  const sentinelKey = "ANS_PROBE_GATEWAY_SENTINEL";
  process.env[sentinelKey] = "planted";
  try {
    const d1Dir = join(SCRATCH, "d1");
    const d1Dump = join(d1Dir, "env.json");
    const d1 = await buildManualSession({
      dir: d1Dir,
      surface: (n) => mcpToolAllowedByWhitelistedServer(n, ["probe-d1"]),
      mcpEntries: [probeEntry("probe-d1", ["--name=probe-d1", "--tools=echo", `--dump-env=${d1Dump}`])],
      createTransport: await selfTransportFactory({ PATH: process.env.PATH ?? "", PROBE_ENV_DUMP: d1Dump, PROBE_MARKER: "self-held" }),
    });
    await d1.session.bindExtensions({});
    const d1Connected = await until(() => mcpNamesOf(d1.session).length >= 1, 10000);
    const dump1 = readDump(d1Dump);
    const keys1 = dump1?.envKeys ?? [];
    // macOS 平台注入键：任何子进程都会多出 __CF_USER_TEXT_ENCODING（`env -i` 下亦可见，与 transport 无关）——
    // 已单独核过；收窄结论按「自持集 ∪ 平台注入集」判定。
    const platformInjected = ["__CF_USER_TEXT_ENCODING"];
    const expectedSelf = ["PATH", "PROBE_ENV_DUMP", "PROBE_MARKER"];
    const keys1Extra = keys1.filter((k) => !expectedSelf.includes(k) && !platformInjected.includes(k));
    console.log("[probe] D1 自持（inheritEnv:false，env={PATH,PROBE_ENV_DUMP,PROBE_MARKER}）子进程 env 键:", JSON.stringify(keys1));
    check("D1 子进程 env 键＝自持最小集（3 键）∪ 平台注入（__CF_USER_TEXT_ENCODING）", d1Connected && keys1Extra.length === 0 && expectedSelf.every((k) => keys1.includes(k)), keys1);
    check("D1 宿主哨兵键未泄漏", !keys1.includes(sentinelKey));
    const c1 = await d1.disposeWithLiveness();

    const d2Dir = join(SCRATCH, "d2");
    const d2Dump = join(d2Dir, "env.json");
    const d2 = await buildManualSession({
      dir: d2Dir,
      surface: (n) => mcpToolAllowedByWhitelistedServer(n, ["probe-d2"]),
      // 不给 createTransport ⇒ SDK 默认 transport（createDefaultTransport → StdioTransport 无 inheritEnv:false）。
      mcpEntries: [{ name: "probe-d2", config: { type: "stdio", command: process.execPath, args: [SERVER_SCRIPT, "--name=probe-d2", "--tools=echo", `--dump-env=${d2Dump}`], env: { PROBE_MARKER: "default-transport" }, exposure: "direct" }, source: "probe" }],
    });
    await d2.session.bindExtensions({});
    const d2Connected = await until(() => mcpNamesOf(d2.session).length >= 1, 10000);
    const dump2 = readDump(d2Dump);
    const keys2 = dump2?.envKeys ?? [];
    const parentKeys = Object.keys(process.env).sort();
    const sentinelLeaked = keys2.includes(sentinelKey);
    console.log("[probe] D2 默认 transport 子进程 env 键数:", keys2.length, "（宿主 env 键数:", parentKeys.length, "）；含哨兵:", sentinelLeaked);
    console.log("[probe] D2 实测键名:", JSON.stringify(keys2));
    check("D2 默认 transport 继承全量宿主 env（键集 ⊇ 宿主）", d2Connected && parentKeys.every((k) => keys2.includes(k)));
    check("D2 宿主哨兵键泄漏到第三方 server", sentinelLeaked);
    const c2 = await d2.disposeWithLiveness();
    result["d"] = {
      selfHeldKeys: keys1,
      platformInjectedKeys: platformInjected.filter((k) => keys1.includes(k)),
      selfHeldExactMinimalUnionPlatform: keys1Extra.length === 0 && expectedSelf.every((k) => keys1.includes(k)),
      defaultKeyCount: keys2.length,
      parentKeyCount: parentKeys.length,
      defaultInheritsAll: parentKeys.every((k) => keys2.includes(k)),
      sentinelLeakedToDefault: sentinelLeaked,
      selfHeldDisposeLeavesChildAlive: c1.aliveAfterDispose,
      defaultDisposeLeavesChildAlive: c2.aliveAfterDispose,
    };
  } finally {
    delete process.env[sentinelKey];
  }
}

// —————————————————————— E：HTTP 路径（环回） ——————————————————————

async function sectionE(): Promise<void> {
  console.log("\n[probe] ===== E. HTTP server 路径（环回；如实注明风险差异） =====");
  const requests: { method: string; rpcMethod?: string; headerNames: string[] }[] = [];
  let probeTokenSeen = false;
  const httpServer: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const headerNames = Object.keys(req.headers).sort();
      if (String(req.headers["x-probe-token"] ?? "") !== "" && req.headers["x-probe-token"] === "planted-http-token") probeTokenSeen = true;
      if (req.method === "GET") { requests.push({ method: "GET", headerNames }); res.writeHead(405).end(); return; }
      const body = Buffer.concat(chunks).toString("utf8");
      let message: Record<string, unknown> = {};
      try { message = JSON.parse(body) as Record<string, unknown>; } catch { /* 忽略 */ }
      const rpcMethod = typeof message["method"] === "string" ? message["method"] : undefined;
      requests.push({ method: String(req.method), rpcMethod, headerNames });
      const id = message["id"];
      const isRequest = id !== undefined && id !== null;
      if (!isRequest) { res.writeHead(202).end(); return; }
      const json = (payload: unknown): void => { res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(payload)); };
      if (rpcMethod === "initialize") {
        json({ jsonrpc: "2.0", id, result: { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "probe-http", version: "0.0.1" } } });
        return;
      }
      if (rpcMethod === "tools/list") {
        json({ jsonrpc: "2.0", id, result: { tools: [{ name: "echo", description: "probe", inputSchema: { type: "object", properties: { text: { type: "string" } }, additionalProperties: true } }] } });
        return;
      }
      if (rpcMethod === "tools/call") {
        const params = (message["params"] as Record<string, unknown> | undefined) ?? {};
        json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify({ httpEcho: params["arguments"] ?? {} }) }] } });
        return;
      }
      json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    });
  });
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  const port = (httpServer.address() as AddressInfo).port;

  process.env.ANS_PROBE_HTTP_TOKEN = "planted-http-token";
  try {
    const dir = join(SCRATCH, "e");
    const entry: McpEntry = {
      name: "probe-http",
      config: { type: "http", url: `http://127.0.0.1:${port}/mcp`, exposure: "direct", headers: { "X-Probe-Token": "${ANS_PROBE_HTTP_TOKEN}" } },
      source: "probe",
    };
    const session = await buildManualSession({
      dir,
      surface: (n) => mcpToolAllowedByWhitelistedServer(n, ["probe-http"]),
      mcpEntries: [entry],
      startupWaitMs: 3000,
    });
    await session.session.bindExtensions({});
    const connected = await until(() => mcpNamesOf(session.session).length >= 1, 10000);
    const echoName = mcpNamesOf(session.session).find((n) => n.endsWith("__echo"));
    console.log("[probe] E 环回 HTTP：接通 =", connected, "；工具 =", JSON.stringify(mcpNamesOf(session.session)));
    if (connected && echoName !== undefined) await promptTimed(session.session, "e-p1", { name: echoName, args: { text: "hi" } });
    const transcript = JSON.stringify((session.session as unknown as { state: { messages: unknown } }).state.messages);
    const mcpNamesE = mcpNamesOf(session.session);
    console.log("[probe] E 请求面（方法/rpcMethod/头键名）:", JSON.stringify(requests));
    console.log("[probe] E X-Probe-Token（${ANS_PROBE_HTTP_TOKEN} 解析）到达:", probeTokenSeen);
    check("E 环回 HTTP 接通且工具可达", connected && echoName !== undefined);
    check("E HTTP 端到端结果进入转录", transcript.includes("httpEcho"));
    check("E header `${VAR}` 逐键解析（只声明键自 process.env 读）", probeTokenSeen);
    await session.disposeWithLiveness();
    result["e"] = {
      connected,
      mcpNames: mcpNamesE,
      transcriptHasHttpEcho: transcript.includes("httpEcho"),
      probeTokenSeen,
      requests: requests.map((r) => ({ method: r.method, rpcMethod: r.rpcMethod, headerNames: r.headerNames })),
      notes: "HTTP 路径无子进程（StreamableHttpTransport 在宿主进程内 fetch；本探针的 server 本身就在驱动进程内运行——无子进程是结构性的）；风险差异：① header/env 引用 `${VAR}` 逐键自 process.env 解析（只读声明键，非全量继承）；② 无子进程即无 env 继承面，但有出站网络面与 OAuth 面（401→needs-auth，登录走浏览器/凭据存储——V1 未接）；③ GET SSE 流：本探针 server 以 405 关闭该流，客户端按『无 GET 流』处理。",
    };
  } finally {
    delete process.env.ANS_PROBE_HTTP_TOKEN;
    await new Promise<void>((r) => httpServer.close(() => r()));
  }
}

// —————————————————————— main ——————————————————————

async function main(): Promise<void> {
  engine = await makeEngine();
  const only = process.env.PROBE_ONLY; // 调试用：仅跑指定段（a/b/b2/c/d/e）
  const want = (key: string): boolean => only === undefined || only === key;
  console.log("[probe] scratch:", SCRATCH);
  console.log("[probe] PI_CODING_AGENT_DIR（scratch）初始内容:", JSON.stringify(readdirSync(process.env.PI_CODING_AGENT_DIR!)));
  console.log("[probe] 宿主 env 键数:", Object.keys(process.env).length);

  if (want("a")) await sectionA();
  if (want("b")) await sectionB();
  if (want("b2")) await sectionB2();
  if (want("c")) await sectionC();
  if (want("d")) await sectionD();
  if (want("e")) await sectionE();

  console.log("[probe] scratch agent-dir 结束时内容:", JSON.stringify(readdirSync(process.env.PI_CODING_AGENT_DIR!)));
  result["failures"] = failures;
  if (OUTDIR !== undefined) {
    mkdirSync(OUTDIR, { recursive: true });
    writeFileSync(join(OUTDIR, "probe-result.json"), JSON.stringify(result, null, 2));
    for (const [name, rel] of [
      ["env-self-held.json", "a/env-self.json"],
      ["env-self-held-b.json", "b/env.json"],
      ["env-default-transport.json", "d2/env.json"],
      ["calls-a.log", "a/calls.log"],
      ["calls-b.log", "b/calls.log"],
    ] as [string, string][]) {
      const from = join(SCRATCH, rel);
      if (existsSync(from)) copyFileSync(from, join(OUTDIR, name));
    }
  }
  console.log("\n[probe] PROBE_RESULT " + JSON.stringify(result, null, 2));
  console.log(`[probe] 总失败项: ${failures}`);

  for (const pid of childPids) { if (alive(pid)) { try { process.kill(-pid, "SIGTERM"); } catch { /* 已退出 */ } } }
  if (process.env.PROBE_KEEP_SCRATCH === "1") console.log("[probe] scratch kept:", SCRATCH);
  else rmSync(SCRATCH, { recursive: true, force: true });
}

await main();
