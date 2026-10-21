import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { ResolvedRole } from "../../model/role.ts";
import type { RuntimeAdapter, RuntimeProviderOptions, RoleSession, SessionEvent, ToolDefinition, ToolResult, RuntimeTurnOutcome, RuntimeToolEventFactsV1, RuntimeToolErrorFactsV1, InstalledMcpServerV1 } from "../../model/runtime.ts";
import { object, deferred, eventQueue, pausedDeadline, bounded, webSearchRow, mcpToolName, mcpToolCallNative, reasoningRejection } from "../../common/codex-adapter/protocol.ts";
import type { CodexRpcConnection, CodexEngineInput, CodexEngineFactory } from "../../common/codex-adapter/protocol.ts";
import { settings, safetyConfig, safetyOverrides, effectiveConfig, verifyThread, reasoningEffortOverride } from "../../common/codex-adapter/config.ts";
import { prepareReasoningCatalog, type TemporaryReasoningCatalog } from "../../common/codex-adapter/reasoning-catalog.ts";
// G-5：推理事实通道（适配器只产事实；投影单点在 Service）。事件 summary
// 用核心定格常量（Service 在投影单点强制覆盖——适配器不随载荷携带自由文本上 summary 位）。
import { REASONING_EVENT_SUMMARY } from "../../common/runtime-core/reasoning.ts";
// 整轮时限（客户裁定 2026-10-17）：`promptTimeoutMs` 只是看护到点检查时限，**不中止整轮**；
// 适配器自己的整轮上限只认「最后兜底」（缺省 1 小时、固定无 env；测试/宿主可经 `turnLastResortMs` 注入小值）。
import { DEFAULT_TURN_LAST_RESORT_MS } from "../../common/runtime-core/timeout.ts";
// Windows 瞬时句柄占用（`EBUSY`/`EPERM`/`EACCES`）的**有界重试**单一来源（§一.5 不得第二份实现）：
// 收尾删除 workRoot 时，刚退出的原生进程/在途句柄可能短暂未释放——沿原子写原语同一口径处置。
import { retryOnTransient } from "../../common/shared/atomic-write.ts";
// G-4「已安装技能」注入节：渲染单一来源在编排（installed-skills.ts）——本适配器只做「非空则整段拼接」。
import { renderInstalledSkillsSection } from "../../common/编排/installed-skills.ts";
// 判断 agent（「替我审批」/「替我决策」）结构性隔离（2026-10-18 双开关评审 §6.2/§十一 P3c）：judge 会话
// 只消费运行时核心注入的三只只读工具。allowlist 单一来源＝运行时核心导出的并集 `ALL_JUDGE_TOOL_NAMES`
// （shell 与治理判断共享读/列两名、各有一个 report 工具）；并集**只用于 allowlist，不用于装配**，
// 本适配器不另造名单。
import { ALL_JUDGE_TOOL_NAMES, GOVERNANCE_JUDGE_REPORT_TOOL } from "../../common/runtime-core/governance-judge/tools.ts";
import { SHELL_JUDGE_REPORT_TOOL, SHELL_JUDGE_TOOL_NAMES } from "../../common/runtime-core/shell-judge/tools.ts";

export type { CodexRpcConnection, CodexEngineInput, CodexEngineFactory } from "../../common/codex-adapter/protocol.ts";

interface McpPeer {
  connect(transport: unknown): Promise<void>;
  close(): Promise<void>;
}
interface McpServer extends McpPeer {
  setRequestHandler(schema: unknown, handler: (request: { params?: Record<string, unknown> }) => Promise<unknown> | unknown): void;
}
interface McpClient extends McpPeer {
  callTool(params: Record<string, unknown>, schema?: unknown, options?: Record<string, unknown>): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }>;
  listTools(): Promise<{ tools: Array<Record<string, unknown>> }>;
}
/** Allows tests to load the real MCP package from an isolated package harness. */
export interface CodexMcpModules {
  Server: new (info: Record<string, unknown>, options: Record<string, unknown>) => McpServer;
  Client: new (info: Record<string, unknown>) => McpClient;
  InMemoryTransport: { createLinkedPair(): [unknown, unknown] };
  ListToolsRequestSchema: unknown;
  CallToolRequestSchema: unknown;
}

/**
 * G-4 V2（P2）：已安装 MCP 声明 → 可装配定义（本角色全部校验/展开的单一位置）。校验面与
 * 读取器（`mcp-declarations.ts`）同口径（读者已过滤；此处纵深防御，任何越界＝上游契约破坏，
 * 装配前抛错、零副作用——沿 tools 名校验先例）。三件事：
 * · 名字 `[A-Za-z0-9_-]`、非保留（`ans`/`ans_codex` 及**规范化后**同形态）；
 * · **清洗碰撞拒绝**（P0 探针 §5.3 残余 2 的 P2 落点）：namespace 清洗 `-`→`_` 后重名（如
 *   `a-b` 与 `a_b`）⇒ 模型面 `mcp__<server>` 桥无法区分——配置侧直接拒（fail closed）；
 * · env 值展开：字面量原样；`env:NAME` 引用取 **bind 时环境快照**真值（声明文件零凭据面，
 *   真值不落盘）；引用真值缺失/空 ⇒ 该变量不带入（server 自会以启动失败走降级行，不拦会话）。
 */
export function prepareInstalledMcpServers(declared: readonly InstalledMcpServerV1[], environment: Readonly<Record<string, string | undefined>>): InstalledMcpServerV1[] {
  const normalized = new Map<string, string>();
  const prepared: InstalledMcpServerV1[] = [];
  for (const server of declared) {
    if (typeof server.name !== "string" || !/^[A-Za-z0-9_-]+$/.test(server.name)) throw new Error("Codex installed MCP server name is invalid");
    const key = server.name.replaceAll("-", "_");
    const lowered = key.toLowerCase();
    if (lowered === "ans" || lowered === "ans_codex") throw new Error(`Codex installed MCP server name is reserved: ${server.name}`);
    const collision = normalized.get(key);
    if (collision !== undefined) throw new Error(`Codex installed MCP server names collide after namespace normalization: ${collision} / ${server.name}`);
    normalized.set(key, server.name);
    if (typeof server.command !== "string" || server.command.trim() === "" || /[\u0000-\u001f\u007f]/.test(server.command)) throw new Error(`Codex installed MCP server command is invalid: ${server.name}`);
    if (!Array.isArray(server.args) || server.args.some(argument => typeof argument !== "string")) throw new Error(`Codex installed MCP server args are invalid: ${server.name}`);
    let env: Record<string, string> | undefined;
    if (server.env !== undefined) {
      env = {};
      for (const [name, value] of Object.entries(server.env)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || typeof value !== "string" || value === "") throw new Error(`Codex installed MCP server env is invalid: ${server.name}`);
        if (value.startsWith("env:")) {
          const truth = environment[value.slice(4)];
          if (truth === undefined || truth === "") continue; // 真值缺失 ⇒ 不带入（server 自会降级；不拦会话）
          env[name] = truth;
        } else {
          env[name] = value;
        }
      }
    }
    prepared.push({ name: server.name, command: server.command, args: [...server.args], ...(env !== undefined ? { env } : {}) });
  }
  return prepared;
}
export interface CodexRuntimeAdapterOptions extends RuntimeProviderOptions {
  engineFactory?: CodexEngineFactory;
  mcpLoader?: () => Promise<CodexMcpModules>;
  /** Controlled environment for tests/embedding; never inherits wholesale into the child. */
  env?: Record<string, string | undefined>;
  /** Explicit executable override; default resolves the pinned @openai/codex package lazily. */
  cliPath?: string;
  /**
   * Server-side web search capability (R1). Fail-closed default off; explicit value overrides
   * ANS_CODEX_WEB_SEARCH (on|off). Gates only the request declaration — the webSearch item
   * mapping is always on so gateway-reported search activity is never silently dropped.
   */
  webSearch?: boolean;
}

async function loadMcp(): Promise<CodexMcpModules> {
  const names = ["@modelcontextprotocol/sdk/server/index.js", "@modelcontextprotocol/sdk/client/index.js", "@modelcontextprotocol/sdk/inMemory.js", "@modelcontextprotocol/sdk/types.js"];
  try {
    const [server, client, memory, types] = await Promise.all(names.map(name => import(name)));
    return { Server: server.Server, Client: client.Client, InMemoryTransport: memory.InMemoryTransport, ListToolsRequestSchema: types.ListToolsRequestSchema, CallToolRequestSchema: types.CallToolRequestSchema };
  } catch { throw new Error("Codex requires @modelcontextprotocol/sdk@1.32.1"); }
}

const JUDGE_TOOL_NAME_SET: ReadonlySet<string> = new Set(ALL_JUDGE_TOOL_NAMES);
const JUDGE_REPORT_TOOL_NAMES: ReadonlySet<string> = new Set([SHELL_JUDGE_REPORT_TOOL, GOVERNANCE_JUDGE_REPORT_TOOL]);
/** 判断会话的两类冻结工具集：shell judge（`report_shell_judgement`）与治理 judge（`report_governance_judgement`）。 */
type JudgeToolFlavor = "shell" | "governance";

/**
 * 判断模式工具集校验（2026-10-18 双开关评审 §6.2/§十一 P3c/AC19/AC24）：judge 会话**恰**接受运行时核心
 * 两种冻结工具集之一（各三只）：
 * · shell judge：`judge_read_file`/`judge_list_dir`/`report_shell_judgement`；
 * · 治理 judge：`judge_read_file`/`judge_list_dir`/`report_governance_judgement`。
 * allowlist 来自运行时核心并集 `ALL_JUDGE_TOOL_NAMES`（本适配器不另造名单）。写入/编辑/shell/客户交互/
 * 回交/派发工具即便被误注入也**不进入**原生工具面与 MCP 目录——装配前抛错、零副作用（fail closed）。
 * 返回值指出注入的是哪一类，用于系统提示中指明正确的 report 工具名。
 * 普通角色会话不经过本函数（逐字不变）。
 */
function assertJudgeToolSet(tools: readonly ToolDefinition[]): JudgeToolFlavor {
  const names = new Set(tools.map(tool => tool.name));
  const reports = tools.filter(tool => JUDGE_REPORT_TOOL_NAMES.has(tool.name));
  // 两种冻结集都恰三只；名字不重复；恰一只 report；每只都在运行时核心并集内。
  if (tools.length !== SHELL_JUDGE_TOOL_NAMES.length || names.size !== tools.length || reports.length !== 1 || tools.some(tool => !JUDGE_TOOL_NAME_SET.has(tool.name))) {
    throw new Error(`Codex judge session accepts only a frozen judge tool set (${ALL_JUDGE_TOOL_NAMES.join(", ")})`);
  }
  return names.has(GOVERNANCE_JUDGE_REPORT_TOOL) ? "governance" : "shell";
}

/** JSON-RPC transport owns the native process; importing this module starts nothing. */
async function nativeEngine(input: CodexEngineInput, cliPath?: string): Promise<CodexRpcConnection> {
  let command: string;
  let argumentsPrefix: string[];
  if (cliPath) { command = cliPath; argumentsPrefix = []; }
  else {
    let packageJson: string;
    try { packageJson = createRequire(import.meta.url).resolve("@openai/codex/package.json"); }
    catch { throw new Error("Codex requires @openai/codex@0.162.1"); }
    command = process.execPath;
    argumentsPrefix = [path.join(path.dirname(packageJson), "bin/codex.js")];
  }
  const child = spawn(command, [...argumentsPrefix, "app-server", "--listen", "stdio://", "--strict-config", ...input.configOverrides.flatMap(value => ["-c", value])], {
    // Electron's executable is also our Node host for the default JS CLI. Keep
    // the isolated allowlist; explicit native CLI paths need no Electron flags.
    cwd: input.cwd, env: !cliPath && process.versions.electron ? { ...input.env, ELECTRON_RUN_AS_NODE: "1" } : input.env,
    stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32",
  });
  const requests = new Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
  const listeners = new Set<(method: string, params: unknown) => void>();
  let serverHandler: ((method: string, params: unknown, request?: { signal: AbortSignal }) => Promise<Record<string, unknown>>) | undefined;
  const serverRequests = new Map<string, AbortController>();
  let sequence = 0;
  let closed = false;
  let stderr = "";
  let closePromise: Promise<void> | undefined;
  const exit = deferred<void>();
  // 'close' 仅在进程退出**且**全部 stdio 管道关闭后触发；删 cwd/workRoot 前必须等它，
  // 否则 Windows 上在途句柄未释放，rmdir 会瞬时 EBUSY（见 test/codex-adapter 真机红与 fix 记录）。
  const stdioClosed = deferred<void>();
  let exited = false;
  const groupExists = () => {
    if (!child.pid) return false;
    if (process.platform === "win32") return !exited;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH") return false;
      // EPERM is unresolved existence, never proof of teardown; wait/recheck until the deadline.
      if (code === "EPERM") return true;
      throw new Error(`Codex owned group probe failed: ${String(error)}`);
    }
  };
  const signalOwnedGroup = (signal: NodeJS.Signals) => {
    if (!child.pid) return;
    try { process.kill(process.platform === "win32" ? child.pid : -child.pid, signal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw new Error(`Codex owned group ${signal} failed: ${String(error)}`); }
  };
  const waitOwnedGroup = async (milliseconds: number) => {
    const deadline = Date.now() + milliseconds;
    while (groupExists()) {
      if (Date.now() >= deadline) throw new Error("Codex owned process tree cleanup timed out");
      await new Promise<void>(resolve => setTimeout(resolve, 5));
    }
    await bounded(exit.promise, Math.max(1, deadline - Date.now()), "process exit");
  };
  child.stderr.on("data", data => { stderr = (stderr + data.toString()).slice(-8192); });
  const rejectPending = (error: Error) => {
    closed = true;
    for (const request of requests.values()) { clearTimeout(request.timer); request.reject(error); }
    requests.clear();
    for (const controller of serverRequests.values()) controller.abort();
    serverRequests.clear();
    for (const listener of listeners) listener("ans/transportClosed", { message: error.message });
  };
  child.on("error", error => { exited = true; rejectPending(error); exit.resolve(); });
  child.on("exit", code => { exited = true; rejectPending(new Error(`Codex app-server exited (${code ?? "signal"}): ${stderr}`)); exit.resolve(); });
  child.on("close", () => stdioClosed.resolve());
  const lines = createInterface({ input: child.stdout });
  const send = (value: Record<string, unknown>) => {
    if (closed || !child.stdin.writable) throw new Error("Codex app-server transport is closed");
    child.stdin.write(JSON.stringify(value) + "\n");
  };
  lines.on("line", line => {
    let message: Record<string, unknown>;
    try { message = object(JSON.parse(line), "JSON-RPC"); }
    catch { rejectPending(new Error("Codex app-server emitted invalid JSON-RPC")); child.kill(); return; }
    if (typeof message.method === "string") {
      if (message.id !== undefined) {
        const requestController = new AbortController();
        const requestKey = String(message.id);
        serverRequests.set(requestKey, requestController);
        Promise.resolve().then(() => {
          if (!serverHandler) throw new Error("Codex server request has no governed handler");
          return serverHandler(message.method as string, message.params, { signal: requestController.signal });
        }).then(result => {
          if (!closed) send({ id: message.id, result });
        }, () => {
          if (!closed) send({ id: message.id, error: { code: -32601, message: "ANS rejected unsupported native request" } });
        }).finally(() => { serverRequests.delete(requestKey); }).catch(error => {
          rejectPending(error instanceof Error ? error : new Error("Codex server response failed")); child.kill();
        });
      } else {
        if (message.method === "serverRequest/resolved") {
          const resolved = object(message.params ?? {}, "resolved request");
          serverRequests.get(String(resolved.requestId))?.abort();
        }
        for (const listener of listeners) listener(message.method, message.params);
      }
    } else if (typeof message.id === "number" && requests.has(message.id)) {
      const pending = requests.get(message.id)!;
      requests.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(String(object(message.error).message ?? "Codex RPC failed")));
      else pending.resolve(message.result);
    }
  });
  return {
    request(method, params) {
      if (closed) return Promise.reject(new Error("Codex app-server transport is closed"));
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { requests.delete(id); reject(new Error(`Codex ${method} timed out`)); }, input.timeoutMs);
        requests.set(id, { resolve, reject, timer });
        try { send({ id, method, params }); } catch (error) { clearTimeout(timer); requests.delete(id); reject(error); }
      });
    },
    notify(method, params) { send({ method, params }); },
    onNotification(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    onServerRequest(handler) { serverHandler = handler; },
    close() { return closePromise ??= (async () => {
      closed = true;
      for (const pending of requests.values()) { clearTimeout(pending.timer); pending.reject(new Error("Codex transport closed")); }
      requests.clear();
      for (const controller of serverRequests.values()) controller.abort();
      serverRequests.clear();
      try {
        if (process.platform === "win32") {
          // Kill the tree before terminating its wrapper; Windows SIGTERM does not forward.
          // 平台真值（v1.3.0 CI 实证，run 38924209553）：windows-2025 全量测试峰值并行时，
          // taskkill.exe 的 spawn+kill+exit 超出过原 120ms 上界（同 CI 内同 close 路径的姊妹
          // 原生进程用例轻负载时序位通过）——120ms 是过紧的假失败源（杀树本身未失败，是等待
          // 上限误伤）。放宽到平台现实值 2000ms，仍为**有界**（真挂起照限如实失败）；后续
          // 80/80ms 等待为 EBUSY 修复的有意收紧、沿用不动。
          if (!exited && child.pid) {
            const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
            await bounded(new Promise<void>((resolve, reject) => {
              killer.once("error", reject);
              killer.once("exit", code => { if (code === 0) resolve(); else reject(new Error("Codex owned Windows process tree cleanup failed")); });
            }), 2000, "Windows process cleanup");
          }
          child.stdin.destroy();
          await bounded(exit.promise, 80, "Windows process exit");
          // 等 stdio 管道全关（'close' 蕴含 'exit'）；此后 workRoot 的目录锁才可能被 OS 释放。
          await bounded(stdioClosed.promise, 80, "Windows stdio close");
          return;
        }
        signalOwnedGroup("SIGTERM");
        child.stdin.destroy();
        try { await waitOwnedGroup(100); }
        catch (graceError) {
          try { signalOwnedGroup("SIGKILL"); }
          catch (forceError) { throw new Error(`${String(graceError)}; ${String(forceError)}`); }
          await waitOwnedGroup(80);
        }
        // 与 Windows 分支同序：进程组已消失后仍等 stdio 管道关闭再允许删目录。
        await bounded(stdioClosed.promise, 80, "process stdio close");
      }
      finally { lines.close(); }
    })(); },
  };
}

interface TurnState {
  ansId: string;
  nativeId?: string;
  controller: AbortController;
  ready: ReturnType<typeof deferred<string>>;
  done: ReturnType<typeof deferred<RuntimeTurnOutcome>>;
  terminal: ReturnType<typeof deferred<void>>;
  reason?: RuntimeTurnOutcome;
  failure?: string;
  failureFacts?: unknown;
  completed: boolean;
  stopping?: Promise<void>;
  calls: Set<string>;
  searchCalls: number;
  /** G-5 降级闸：该轮是否已产出任何模型内容（产出前才允许「去参数重发」——设计 §七）。 */
  outputSeen: boolean;
  /** G-5：reasoning item 的真实起点（item/started.startedAtMs，按 item id——durationMs 只取真实信号）。 */
  reasoningStarted: Map<string, number>;
}

export function createCodexRuntimeAdapter(options: CodexRuntimeAdapterOptions): RuntimeAdapter {
  if (options.toolDisplayMode === "required-v1" && (typeof options.projectToolEvent !== "function" || typeof options.registerToolDisplayProfile !== "function")) {
    throw new Error("Codex required-v1 tool display requires projector/register capabilities");
  }
  const judgeMode = options.judgeMode === true;
  // 判断模式：装配前做结构性工具集校验（零副作用）；普通角色会话不受影响。
  if (judgeMode) assertJudgeToolSet(options.tools);
  /** 判断会话的 report 工具名（每次从注入集重取：工厂与 bind 之间 options 可能被误改）。 */
  const judgeReportTool = () => assertJudgeToolSet(options.tools) === "governance" ? GOVERNANCE_JUDGE_REPORT_TOOL : SHELL_JUDGE_REPORT_TOOL;
  // G-4 installed-skills section: the render is the single orchestration source (hash/matching/bad-file
  // handling all live there). Non-empty splices the whole section verbatim as one prompt segment; empty
  // string renders nothing (zero-skill status quo stays byte-identical).
  const composeContext = async (role: ResolvedRole) => {
    // 判断会话不拼接项目技能注入节：判断只按稳定 rubric + 按需 judge_read_file 读证据，
    // 不让角色/技能文本进入系统提示（普通角色会话逐字不变）。
    const installedSkills = judgeMode ? "" : renderInstalledSkillsSection(options.projectRoot, role.id);
    return { systemPrompt: [
      role.cardText,
      `固定角色：${role.id}。实际项目目录：${options.projectRoot}。`,
      // 判断会话只有只读工具：明确告知可用面，避免模型在不存在的能力上反复尝试（普通会话逐字不变）。
      // 治理 judge 与 shell judge 的 report 工具名不同（并集 allowlist → 按注入集判定）；读取面相同。
      judgeMode
        ? `本会话是只读判断会话：只通过 ans_ 前缀的 judge_read_file/judge_list_dir 读取项目，并用 ${judgeReportTool()} 交回结论；没有写入、命令、客户交互或派发工具。`
        : "只通过 ans_ 前缀工具执行项目读取、修改、命令、交互和回交；原生运行环境只读。派发不转移授权。",
      `角色写入边界：${JSON.stringify(role.boundary)}`,
      ...options.tools.flatMap(tool => tool.promptGuidelines ?? []),
      ...(installedSkills === "" ? [] : [installedSkills]),
    ].join("\n\n") };
  };

  return {
    composeContext,
    async bindRole(role) {
      // 判断模式再校验一次（options 在工厂与 bind 之间可能被误改；仍为零副作用）。
      if (judgeMode) assertJudgeToolSet(options.tools);
      // Resolve authentication, profile registration and child environment from one snapshot.
      const environmentSnapshot = { ...(options.env ?? process.env) };
      // 判断模式强制关闭 server-side web search（忽略 options.webSearch 与 ANS_CODEX_WEB_SEARCH，
      // PM 评审 §6.1/A35：引擎原生工具/网络一律不得进入判断会话）。
      const config = settings(judgeMode ? { ...options, webSearch: false } : options, environmentSnapshot);
      options.registerToolDisplayProfile?.({
        apiKeyEnvVar: config.keyName,
        credentials: [...new Set([config.keyName, ...(options.toolDisplayCredentialEnvNames ?? [])])]
          .map(name => ({ name, value: environmentSnapshot[name] })),
      });
      // 判断模式不持久化：即便上游误传 storage 也不读/不写会话记录（PM 评审 §6.3 `persistSession:false`）。
      const storage = judgeMode ? undefined : options.storage;
      if (storage && (storage.runtime !== "codex" || storage.roleId !== role.id)) throw new Error("Codex storage role/runtime mismatch");
      const toolMap = new Map(options.tools.map(tool => [tool.name, tool]));
      if (toolMap.size !== options.tools.length || options.tools.some(tool => !/^[A-Za-z0-9_-]{1,60}$/.test(tool.name))) {
        throw new Error("Codex tools require unique valid ANS names");
      }
      // G-4 V2：已安装 MCP 的校验/展开（装配前、零副作用）与白名单名集（进程/线程/目录三处恰等、降级面共用）。
      // 判断模式：外来 MCP 一律不装配（即使上游误传声明也置空——PM 评审 §6.1/A35）。
      const installedServers = prepareInstalledMcpServers(judgeMode ? [] : options.installedMcpServers ?? [], environmentSnapshot);
      const allowedServers = new Set(installedServers.map(server => server.name));
      // Only completed compatibility turns commit a new strategy. Every ordinary turn explicitly
      // reapplies a confirmed effort, undoing native turn/start settings left by a failed attempt.
      let confirmedEffort: string | undefined = config.reasoningEffort === "off" ? undefined : config.reasoningEffort;
      let compatibilityConfirmed = false;
      let configurationShown = false;
      let promptCount = 0;
      let defaultEffortPromise: Promise<string | undefined> | undefined;
      await storage?.validateNativeDirectory?.();
      const previous = await storage?.readLatest();
      if (previous && (previous.runtime !== "codex" || previous.roleId !== role.id)) throw new Error("Codex native session record role/runtime mismatch");
      const instanceId = randomUUID();
      const workRoot = await mkdtemp(path.join(os.tmpdir(), "ans-codex-"));
      const cwd = path.join(workRoot, "work");
      const nativeHome = storage?.nativeDirectory ?? path.join(workRoot, "native");
      let activeReasoningCatalog: TemporaryReasoningCatalog | undefined;
      let restoreOriginalCatalog = false;
      let engine: CodexRpcConnection | undefined;
      let server: McpServer | undefined;
      let client: McpClient | undefined;
      let unsubscribe: (() => void) | undefined;
      const queue = eventQueue();
      let active: TurnState | undefined;
      let disposed = false;
      let quarantined = false;
      let cleanupPromise: Promise<void> | undefined;
      let disposePromise: Promise<void> | undefined;
      let nativeId = "";
      const calls = new Map<string, { turn: TurnState; name: string; callId: string }>();
      let sequential: Promise<unknown> = Promise.resolve();
      const scrub = (value: unknown): unknown => {
        if (typeof value === "string") return config.redact(value);
        if (Array.isArray(value)) return value.map(scrub);
        if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)]));
        return value;
      };
      const emit = (turn: TurnState | undefined, kind: SessionEvent["kind"], summary: string, detail?: unknown) => {
        queue.push({ runtime: "codex", roleId: role.id, ...(turn ? { turnId: turn.ansId } : {}), kind, summary: config.redact(summary), ...(detail === undefined ? {} : { detail: scrub(detail) }) });
      };
      // 原生越权信号单点处置（既有「command/file 工具」先例；判断模式另把 MCP/网络搜索计入同一处置）。
      const quarantineForbidden = (turn: TurnState, failure: string): void => {
        turn.failure = failure;
        quarantined = true; turn.reason = "failed"; turn.controller.abort(); turn.done.resolve("failed");
        void engine!.close().catch(error => { turn.failure = config.redact(error); });
      };
      // Projected display text is already protected; never recursively scrub its opaque IDs.
      const emitTool = (turn: TurnState, facts: RuntimeToolEventFactsV1, legacyKind: SessionEvent["kind"], legacySummary: string, legacyDetail: unknown) => {
        if (!options.projectToolEvent) {
          emit(turn, legacyKind, legacySummary, legacyDetail);
          return;
        }
        try {
          queue.push(options.projectToolEvent({ ...facts, runtime: "codex", roleId: role.id, turnId: turn.ansId }, config.redact));
        } catch {
          queue.push({ runtime: "codex", kind: "message", summary: "Tool display projection failed",
            detail: { version: 1, source: "tool-display-diagnostic", code: "PROJECTION_FAILED" } });
        }
      };
      // G-4 V2 降级面：白名单 server 未连接＝如实一行（类别化；error 只进 detail、经 scrub 且截断）。
      // 去重单点：同一会话内每个 server 至多一行（catalog 扫掠与 startupStatus 通知两路共用——不双报）。
      const reportedDegradedMcp = new Set<string>();
      const reportMcpDegraded = (name: string, state: "failed" | "cancelled", error?: unknown): void => {
        if (reportedDegradedMcp.has(name)) return;
        reportedDegradedMcp.add(name);
        const detail: Record<string, unknown> = { version: 1, source: "mcp-startup", name, state };
        const text = typeof error === "string" && error.trim() !== "" ? error : undefined;
        if (text !== undefined) detail.error = text.slice(0, 300);
        emit(undefined, "message", `已安装 MCP「${name}」未连接：${state === "failed" ? "启动失败" : "已取消"}`, detail);
      };
      const cleanup = () => cleanupPromise ??= (async () => {
        unsubscribe?.();
        const results = await Promise.allSettled([client?.close(), server?.close(), engine?.close()]);
        // engine.close 已等进程 exit+stdio close；Windows 仍可能被内核/索引器/实时防护
        // 瞬时占用 workRoot（EBUSY/EPERM/EACCES，CI 实证）——照 src/common/shared/atomic-write.ts
        // 先例做有界重试：仅瞬时码、setImmediate 让出、非瞬时立即抛、上界耗尽照抛（不吞）。
        await retryOnTransient(() => rm(workRoot, { recursive: true, force: true }));
        const failed = results.find((entry): entry is PromiseRejectedResult => entry.status === "rejected");
        if (failed) throw new Error(config.redact(failed.reason));
      })();

      try {
        await mkdir(cwd, { recursive: true });
        await storage?.prepareNativeDirectory?.();
        await mkdir(nativeHome, { recursive: true });
        await storage?.validateNativeDirectory?.();
        const provider = `ans_${instanceId.replaceAll("-", "")}`;
        const providerDefinition = `model_providers.${provider}={name="ANS Codex",base_url=${JSON.stringify(config.baseUrl)},env_key="CODEX_API_KEY",wire_api="responses",requires_openai_auth=false}`;
        const environment = { PATH: environmentSnapshot.PATH ?? path.dirname(process.execPath), CODEX_HOME: nativeHome, CODEX_API_KEY: config.key };
        const engineFactory = options.engineFactory ?? ((input: CodexEngineInput) => nativeEngine(input, options.cliPath));
        const connect = async (disabled: readonly string[], injectReasoning = true, reasoningCatalog?: TemporaryReasoningCatalog) => {
          // G-4 V2：白名单定义＋禁用集编入**同一条** `-c mcp_servers={…}`（P0 探针铁律：连续 -c 同根键覆盖不合并）。
          // G-5：`model_reasoning_effort` 为顶层标量键、独立一条（探针实证叠加无冲突）；去参数重发＝该条缺席。
          const reasoningOverride = injectReasoning ? reasoningEffortOverride(config.reasoningEffort) : undefined;
          const connected = await engineFactory({ cwd, nativeHome, env: environment, configOverrides: [...safetyOverrides(cwd, disabled, config.webSearch, installedServers), ...(reasoningOverride !== undefined ? [reasoningOverride] : []), ...(reasoningCatalog ? [`model_catalog_json=${JSON.stringify(reasoningCatalog.path)}`] : []), providerDefinition, `model_provider=${JSON.stringify(provider)}`], timeoutMs: options.constructTimeoutMs ?? 30000 });
          // Preflight has no model, thread, MCP connections, or native approval handlers.
          try {
            await connected.request("initialize", { clientInfo: { name: "ans_codex_adapter", version: "2.0.0" }, capabilities: { experimentalApi: true, explicitGatewayOauth: true } });
            connected.notify("initialized", {});
            const inspected = effectiveConfig(await connected.request("config/read", { includeLayers: false, cwd }), config.webSearch);
            return { connected, inspected };
          } catch (error) { await connected.close(); throw error; }
        };
        let connection = await connect([]);
        engine = connection.connected;
        const allServers = Object.keys(connection.inspected.servers);
        const foreignServers = allServers.filter(name => !allowedServers.has(name));
        if (foreignServers.length) {
          await engine.close();
          connection = await connect(foreignServers);
          engine = connection.connected;
        }
        // P2 恰等（进程级）：生效 enabled 集必须恰等于白名单名集（白名单外残留＝隔离不放松，拒开工；
        // 白名单自身缺失＝装配面破损，同样拒——与旧「全量 disable 后必须全空」同势、白名单空时同义）。
        const expectedEnabled = [...allowedServers].sort();
        const enabledServers = [...connection.inspected.enabled].sort();
        if (enabledServers.length !== expectedEnabled.length || enabledServers.some((name, index) => name !== expectedEnabled[index])) {
          throw new Error("Codex native MCP enabled set differs from the installed whitelist");
        }
        const modules = await (options.mcpLoader ?? loadMcp)();
        server = new modules.Server({ name: "ans_codex", version: "2.0.0" }, { capabilities: { tools: {} } });
        client = new modules.Client({ name: "ans_codex_proxy", version: "2.0.0" });
        server.setRequestHandler(modules.ListToolsRequestSchema, () => ({ tools: options.tools.map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })) }));
        server.setRequestHandler(modules.CallToolRequestSchema, async request => {
          const params = object(request.params, "MCP call");
          const metadata = object(params._meta, "MCP call metadata");
          const token = metadata.ansCallToken;
          const original = typeof token === "string" ? calls.get(token) : undefined;
          if (!original || params.name !== original.name) return { isError: true, content: [{ type: "text", text: "ANS refused an unattributed MCP call" }] };
          // Capture the original state before awaiting any other call; never substitute active.signal.
          const { turn, name, callId } = original;
          const tool = toolMap.get(name)!;
          const args = object(params.arguments ?? {}, "tool arguments");
          const facts = { toolName: name, toolCallId: callId, input: { rule: tool.displayInputRule, args } };
          let displayError: RuntimeToolErrorFactsV1 | undefined;
          let handlerStarted = false;
          const execute = async (): Promise<ToolResult> => {
            if (turn.controller.signal.aborted || turn.completed || active !== turn) return { ok: false, message: "ANS refused a stopped or stale turn" };
            handlerStarted = true;
            emitTool(turn, { ...facts, phase: "start", origin: "handler-start" }, "tool_call", name, { toolName: name, name, toolCallId: callId, args });
            try { return await tool.handler({ name, args, toolCallId: callId, signal: turn.controller.signal }); }
            catch (error) {
              displayError = {};
              if (error instanceof Error) displayError = { message: error.message };
              return { ok: false, message: config.redact(error) };
            }
          };
          // A single queue also prevents a sequential write from overlapping parallel reads/tools.
          const resultPromise = sequential.then(execute, execute);
          sequential = resultPromise.then(() => {}, () => {});
          const returned = await resultPromise;
          const result = turn.controller.signal.aborted || turn.completed
            ? { ok: false, message: "ANS refused a result from a stopped turn" }
            : returned;
          // A late callback cannot append an apparent success after that turn's settled event.
          if (!turn.completed && active === turn && (handlerStarted || !options.projectToolEvent)) {
            let source: RuntimeToolEventFactsV1 = { ...facts, phase: "result", origin: "handler-result", result };
            if (displayError && result === returned) source = { ...facts, phase: "result", origin: "handler-result", error: displayError };
            emitTool(turn, source, result.ok ? "accepted" : "denied", result.message, { toolName: name, name, toolCallId: callId, ok: result.ok });
          }
          return { isError: !result.ok, content: [{ type: "text", text: config.redact(result.message) }] };
        });
        const [serverTransport, clientTransport] = modules.InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const advertised = await client.listTools();
        if (advertised.tools.length !== options.tools.length || advertised.tools.some(tool => !toolMap.has(String(tool.name)))) {
          throw new Error("Codex local MCP tool catalog differs from injected ANS tools");
        }
        // G-5：处理器具名化——去参数重发重建引擎后需在同一位置重挂（不第二份实现）。
        const nativeToolHandler: Parameters<CodexRpcConnection["onServerRequest"]>[0] = async (method, input, requestContext) => {
          if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") return { decision: "decline" };
          if (method === "item/permissions/requestApproval") return { permissions: {}, scope: "turn" };
          if (method === "mcpServer/elicitation/request") return { action: "cancel", content: null };
          if (method === "item/tool/requestUserInput") return { answers: {} };
          if (method !== "item/tool/call") throw new Error("ANS rejected unsupported native request");
          const params = object(input, "dynamic tool request");
          const original = active;
          const denied = (message: unknown) => ({ success: false, contentItems: [{ type: "inputText", text: config.redact(message) }] });
          if (!original || original.controller.signal.aborted || original.completed || params.threadId !== nativeId || typeof params.turnId !== "string" || params.namespace != null) return denied("ANS refused unknown or stale native tool call");
          original.outputSeen = true; // G-5 降级闸：模型已发起原生工具调用＝请求面被接受（不可能再算「产出任何内容前」）。
          // Requests that precede the turn/start response wait for that response, keeping this state.
          const expectedTurn = await original.ready.promise;
          if (params.turnId !== expectedTurn || active !== original || original.controller.signal.aborted || original.completed) return denied("ANS refused unknown or stale native turn");
          const proxyName = typeof params.tool === "string" ? params.tool : "";
          const name = proxyName.startsWith("ans_") ? proxyName.slice(4) : "";
          if (!toolMap.has(name) || typeof params.callId !== "string" || !params.callId) return denied("ANS refused an unregistered tool");
          if (original.calls.has(params.callId)) return denied("ANS refused a repeated native tool call");
          original.calls.add(params.callId);
          const token = randomUUID();
          const callId = `codex:${instanceId}:${original.ansId}:${params.turnId}:${params.callId}`;
          calls.set(token, { turn: original, name, callId });
          const cancelledUpstream = () => {
            original.failure = "Codex native tool request ended before the ANS handler completed";
            void stop(original, "failed").catch(error => { original.failure = config.redact(error); });
          };
          requestContext?.signal.addEventListener("abort", cancelledUpstream, { once: true });
          if (requestContext?.signal.aborted) cancelledUpstream();
          try {
            const result = await client!.callTool({ name, arguments: object(params.arguments ?? {}, "dynamic arguments"), _meta: { ansCallToken: token } }, undefined, { signal: original.controller.signal, timeout: 2147483647 });
            return { success: !result.isError, contentItems: result.content.filter(item => item.type === "text").map(item => ({ type: "inputText", text: config.redact(item.text ?? "") })) };
          } catch (error) { return denied(error); }
          finally { calls.delete(token); requestContext?.signal.removeEventListener("abort", cancelledUpstream); }
        };
        engine.onServerRequest(nativeToolHandler);
        const context = await composeContext(role);
        // G-4 V2：线程级恰等——白名单外显式 enabled=false 不变；白名单内 enabled=true（白名单空＝逐字现状）。
        const threadConfig = { ...safetyConfig(cwd, config.webSearch), mcp_servers: Object.fromEntries(allServers.map(name => [name, { enabled: allowedServers.has(name) }])) };
        const threadParams = { model: config.model, modelProvider: provider, cwd, sandbox: "read-only", approvalPolicy: "never", approvalsReviewer: "user", config: threadConfig, developerInstructions: context.systemPrompt };
        let contextSource: RoleSession["contextSource"] = storage ? "fresh" : "in-memory";
        let contextWarning: string | undefined;
        // G-5 降级链与会话构造共用三段（同源，不第二份实现）：
        // · establishThread＝线程建立（resume→recovered→start 语义逐字沿旧内联实现）；
        // · subscribeNotifications＝通知面订阅（订阅点在目录复核之前——缩小「状态先于监听」丢失窗）；
        // · inspectCatalog＝目录级名字集恰等复核＋已 failed/cancelled 白名单条目降级行（去重单点）。
        const establishThread = async (connection: CodexRpcConnection, resumeSessionId: string | undefined): Promise<void> => {
          if (resumeSessionId !== undefined) {
            await storage?.validateNativeDirectory?.();
            let response: unknown;
            try { response = await connection.request("thread/resume", { ...threadParams, threadId: resumeSessionId, excludeTurns: true }); }
            catch (error) { contextWarning = `Codex native resume failed: ${config.redact(error)}`; contextSource = "recovered"; }
            if (response !== undefined) { nativeId = verifyThread(response); contextSource = "resumed"; }
          }
          if (!nativeId) nativeId = verifyThread(await connection.request("thread/start", { ...threadParams, ephemeral: !storage, dynamicTools: options.tools.map(tool => ({ type: "function", name: `ans_${tool.name}`, description: tool.description, inputSchema: tool.inputSchema })) }));
        };
        const subscribeNotifications = (connection: CodexRpcConnection): void => {
          unsubscribe = connection.onNotification((method, raw) => {
            if (method === "mcpServer/startupStatus/updated") {
              // 会话级通知（无轮次身份）：白名单 server 启动失败/取消 ⇒ 降级行（去重单点；慢失败路径）。
              try {
                const status = object(raw ?? {}, "startup status");
                if (typeof status.name === "string" && allowedServers.has(status.name) && (status.status === "failed" || status.status === "cancelled")) {
                  reportMcpDegraded(status.name, status.status, status.error);
                }
              } catch { /* 坏通知不毁会话 */ }
              return;
            }
            const turn = active;
            if (!turn || turn.completed) return;
            let params: Record<string, unknown>;
            try { params = object(raw ?? {}, "notification"); } catch { return; }
            if (method === "ans/transportClosed") {
              quarantined = true; turn.failure = config.redact(params.message); turn.reason ??= "failed"; turn.done.resolve(turn.reason); return;
            }
            if (params.threadId !== nativeId) return;
            const notifyId = method === "turn/completed" ? object(params.turn, "completed native turn").id : params.turnId;
            const ready = turn.ready;
            void ready.promise.then(expected => {
              if (ready !== turn.ready || typeof notifyId !== "string" || notifyId !== expected || active !== turn || turn.completed) return;
              if (method === "item/completed") {
                const item = object(params.item, "native item");
                if (item.type === "agentMessage") { turn.outputSeen = true; emit(turn, "message", String(item.text ?? ""), { text: item.text }); }
                // Server-side (gateway-executed) search: always mapped, never quarantined, never inferred as failure.
                if (item.type === "webSearch") {
                  turn.outputSeen = true;
                  turn.searchCalls += 1;
                  // 判断会话禁止网络/原生搜索（PM 评审 §6.1/A35）：网关仍报搜索＝原生能力泄漏，隔离该轮。
                  if (judgeMode) { quarantineForbidden(turn, "Codex reported a native web search in a read-only judge session; session quarantined"); return; }
                  const row = webSearchRow(item);
                  emit(turn, "message", row.summary, row.detail);
                }
                // G-4 V2 使用行（P0 探针字段全集；status/error/result 三态如实）：走核心投影单点
                // （native-result 事实），白名单调用＝已授予能力的执行事实——**不进隔离**（非越权信号）。
                if (item.type === "mcpToolCall") {
                  turn.outputSeen = true;
                  // 判断会话只消费注入的 judge 工具（`item/tool/call`）；外部 MCP 调用＝白名单/隔离被绕过，隔离该轮。
                  if (judgeMode) { quarantineForbidden(turn, "Codex reported a native MCP tool in a read-only judge session; session quarantined"); return; }
                  const name = mcpToolName(typeof item.server === "string" ? item.server : "", typeof item.tool === "string" ? item.tool : "");
                  const native = mcpToolCallNative(item);
                  const args = item.arguments !== null && typeof item.arguments === "object" && !Array.isArray(item.arguments) ? item.arguments as Record<string, unknown> : {};
                  const durationMs = typeof item.durationMs === "number" ? item.durationMs : undefined;
                  const text = native.content.flatMap(block => block.type === "text" ? [block.text] : []).join("\n");
                  const legacyText = native.isError ? native.errorText ?? name : text || name;
                  emitTool(turn, {
                    origin: "native-result", phase: "result", toolName: name,
                    ...(typeof item.id === "string" ? { toolCallId: item.id } : {}),
                    input: { rule: "none", args },
                    native: { isError: native.isError, content: native.content },
                    ...(native.isError && native.errorText !== undefined ? { error: { message: native.errorText } } : {}),
                    ...(durationMs !== undefined ? { durationMs } : {}),
                  }, native.isError ? "denied" : "accepted", legacyText.length > 1024 ? `${legacyText.slice(0, 1024)}…` : legacyText,
                    { toolName: name, native: true, ...(typeof item.status === "string" ? { status: item.status } : {}), ...(durationMs !== undefined ? { durationMs } : {}) });
                }
                // G-5 推理事实（A3 探针逐字：完成态 item `{type:"reasoning", summary:string[], content:string[]}`；
                // 增量帧不产行——完成态先行）：适配器只产事实（text/status/durationMs），呈现归核心投影单点。
                if (item.type === "reasoning") {
                  turn.outputSeen = true;
                  const summary = Array.isArray(item.summary) ? item.summary.filter((part): part is string => typeof part === "string") : [];
                  const content = Array.isArray(item.content) ? item.content.filter((part): part is string => typeof part === "string") : [];
                  // 平台给什么就是什么：正文本位优先；仅摘要时取摘要（v1 事实通道单一正文位——不合成、不发明）；
                  // 两者皆空＝平台省略正文（status:"omitted"，如实不假装）。
                  const text = content.length ? content.join("\n") : summary.join("\n");
                  const startedAt = typeof item.id === "string" ? turn.reasoningStarted.get(item.id) : undefined;
                  if (typeof item.id === "string") turn.reasoningStarted.delete(item.id);
                  const completedAt = typeof params.completedAtMs === "number" && Number.isFinite(params.completedAtMs) ? params.completedAtMs : undefined;
                  // durationMs 只取真实信号（item/started.startedAtMs → item/completed.completedAtMs）；无则不携带、绝不猜测。
                  const durationMs = startedAt !== undefined && completedAt !== undefined ? Math.max(0, completedAt - startedAt) : undefined;
                  emit(turn, "message", REASONING_EVENT_SUMMARY, { version: 1, source: "reasoning", reasoning: { text, status: text === "" ? "omitted" : "complete", ...(durationMs !== undefined ? { durationMs } : {}) } });
                }
                if (item.type === "commandExecution" || item.type === "fileChange") {
                  quarantineForbidden(turn, "Codex reported a forbidden native command/file tool; session quarantined");
                }
              } else if (method === "item/started") {
                // G-5：reasoning item 的真实起点（durationMs 信号面）；其余 item/started 不映射（沿既有先例）。
                const item = object(params.item, "native item");
                if (["mcpToolCall", "webSearch", "dynamicToolCall", "agentMessage", "commandExecution", "fileChange"].includes(String(item.type))) turn.outputSeen = true;
                if (item.type === "reasoning") {
                  turn.outputSeen = true;
                  if (typeof item.id === "string" && typeof params.startedAtMs === "number" && Number.isFinite(params.startedAtMs)) turn.reasoningStarted.set(item.id, params.startedAtMs);
                }
              } else if (method === "item/reasoning/summaryPartAdded" || method === "item/reasoning/summaryTextDelta" || method === "item/reasoning/textDelta" || method === "item/agentMessage/delta") {
                // G-5 增量帧＝消费（「已产出内容」证据——降级闸依赖）但不产行：行由完成态 item 给（完成态先行）。
                turn.outputSeen = true;
              } else if (method === "turn/completed") {
                const completed = object(params.turn);
                const outcome = turn.reason ?? (completed.status === "completed" ? "completed" : completed.status === "interrupted" ? "aborted" : "failed");
                turn.reason = outcome;
                if (completed.error) { turn.failureFacts = completed.error; turn.failure = config.redact(object(completed.error).message ?? "Codex turn failed"); }
                turn.terminal.resolve();
                turn.done.resolve(outcome);
              } else if (method === "error" && params.willRetry !== true) {
                turn.reason = "failed"; turn.failureFacts = params.error;
                turn.failure = config.redact(object(params.error ?? {}).message ?? "Codex turn failed"); turn.done.resolve("failed");
              }
            }).catch(error => { turn.failure = config.redact(error); turn.reason = "failed"; turn.done.resolve("failed"); });
          });
        };
        const inspectCatalog = async (connection: CodexRpcConnection): Promise<void> => {
          // P2 恰等（目录级）：catalog 名字集必须恰等于白名单名集（P0 探针修正——失败的白名单条目
          // 仍在 data（runtimeStatus:"failed"），「data 必须为空」判据不能沿用）；随后对已
          // failed/cancelled 的白名单条目如实降级一行（慢失败留给 startupStatus 通知路径，去重单点防双报）。
          const catalog = object(await connection.request("mcpServerStatus/list", { threadId: nativeId, detail: "toolsAndAuthOnly", limit: 100 }), "native MCP catalog");
          const catalogEntries = Array.isArray(catalog.data) ? catalog.data.map(entry => object(entry, "native MCP catalog entry")) : undefined;
          if (catalogEntries === undefined || catalog.nextCursor || catalogEntries.some(entry => typeof entry.name !== "string" || entry.name === "")) {
            throw new Error("Codex native MCP catalog does not match the installed whitelist");
          }
          const catalogNames = catalogEntries.map(entry => String(entry.name)).sort();
          if (catalogNames.length !== expectedEnabled.length || catalogNames.some((name, index) => name !== expectedEnabled[index])) {
            throw new Error("Codex native MCP catalog does not match the installed whitelist");
          }
          for (const entry of catalogEntries) {
            if (entry.runtimeStatus !== "failed" && entry.runtimeStatus !== "cancelled") continue;
            const name = String(entry.name);
            if (allowedServers.has(name)) reportMcpDegraded(name, entry.runtimeStatus, entry.toolsError);
          }
        };
        await establishThread(engine, previous?.nativeSessionId);
        subscribeNotifications(engine);
        await inspectCatalog(engine);
        const session: RoleSession = {
          runtime: "codex", roleId: role.id, get contextSource() { return contextSource; }, get nativeSessionId() { return nativeId; },
          ...(contextWarning ? { contextWarning } : {}),
          async prompt(text, promptOptions) {
            if (disposed || quarantined) throw new Error("Codex session is disposed or quarantined; create a new session");
            if (active) throw new Error("Codex session already has an active turn");
            const turn: TurnState = { ansId: options.currentTurnId() ?? randomUUID(), controller: new AbortController(), ready: deferred<string>(), done: deferred<RuntimeTurnOutcome>(), terminal: deferred<void>(), completed: false, calls: new Set(), searchCalls: 0, outputSeen: false, reasoningStarted: new Map() };
            // Abort can resolve ready before turn/start so early tool requests fail closed.
            active = turn;
            promptCount += 1;
            if (!configurationShown) {
              configurationShown = true;
              const summary = config.reasoningEffort === "off"
                ? "Codex 未覆盖思考等级：不表示关闭推理，实际推理强度未验证。"
                : config.reasoningEffort === undefined ? "本会话未覆盖 Codex 思考等级；服务端实际推理强度未验证。"
                  : `本会话向 Codex SDK 请求的思考等级：${config.reasoningEffort}；服务端实际采纳未验证。`;
              emit(turn, "message", summary, { source: "system", reasonCode: "reasoning-configuration", state: "configured" });
            }
            // 整轮**最后兜底**（唯一自动整轮上限；缺省 1 小时）：`promptTimeoutMs` 只看护到点检查，绝不在这里 abort。
            // 计时沿 InteractionGate 可暂停＝按有效运行时间计（确认卡等待不触发兜底）。文案与「到点检查」明确区分；
            // outcome 仍走既有 `timed_out` 枚举（契约不变），诊断由 failure 文本承载。
            const lastResortMs = options.turnLastResortMs ?? DEFAULT_TURN_LAST_RESORT_MS;
            const stopTimer = pausedDeadline(options.interactionGate, lastResortMs, () => {
              if (turn.completed || turn.stopping) return;
              turn.failure ??= `Codex 本轮运行超过最后兜底（${lastResortMs}ms），已中止以免无限挂起。`;
              void stop(turn, "timed_out").catch(error => { turn.failure = config.redact(error); });
            });
            try {
              // A failed/cancelled E1 attempt changed process-level model metadata. Restore the
              // original catalog before the next request; an effort scalar alone is insufficient.
              if (restoreOriginalCatalog) await reconnectNative(turn, true);
              if (turn.controller.signal.aborted) return;
              await storage?.validateNativeDirectory?.();
              const input: Record<string, unknown>[] = [{ type: "text", text, text_elements: [] }];
              for (const [index, image] of (promptOptions?.images ?? []).entries()) {
                const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
                const extension = extensions[image.mimeType];
                if (!extension) throw new Error("Codex unsupported image MIME type");
                const imagePath = path.join(workRoot, `${turn.ansId.replace(/[^A-Za-z0-9-]/g, "_")}-${index}.${extension}`);
                await writeFile(imagePath, Buffer.from(image.data, "base64"), { mode: 0o600 });
                input.push({ type: "localImage", path: imagePath });
              }
              if (turn.controller.signal.aborted) return;
              let attemptedEffort = confirmedEffort;
              await startNativeTurn(turn, input, attemptedEffort);
              let outcome = await turn.done.promise;
              const attempted = new Set<string | undefined>([attemptedEffort]);
              let compatibilityAttempted = false;
              while (outcome === "failed" && !compatibilityConfirmed && attemptedEffort !== undefined
                  && !turn.outputSeen && !turn.controller.signal.aborted && attempted.size <= 2) {
                const rejection = reasoningRejection(turn.failureFacts ?? turn.failure);
                if (!rejection) break;
                let candidate: string | undefined;
                if (rejection === "value") candidate = await catalogDefaultEffort();
                if (candidate === undefined || attempted.has(candidate)) {
                  candidate = undefined;
                  if (attempted.has(undefined)) break;
                  if (!storage && promptCount > 1) {
                    emit(turn, "message", "本会话无法在保留已有历史的同时重建默认请求；未重放当前任务。", { source: "system", reasonCode: "reasoning-compatibility", state: "unavailable" });
                    break;
                  }
                }
                // An error notification may precede the terminal turn notification. Never start
                // a second turn while the rejected native turn is still running.
                await bounded(turn.terminal.promise, options.constructTimeoutMs ?? 30000, "rejected native turn completion");
                if (turn.controller.signal.aborted || turn.outputSeen) break;
                attempted.add(candidate);
                compatibilityAttempted = true;
                emit(turn, "message", "接口拒绝了本次思考参数，正在按兼容方式继续；已保存设置不变。", { source: "system", reasonCode: "reasoning-compatibility", state: "trying" });
                if (candidate === undefined) await reconnectNative(turn, false, true);
                if (turn.controller.signal.aborted) break;
                attemptedEffort = candidate;
                await startNativeTurn(turn, input, attemptedEffort, true);
                outcome = await turn.done.promise;
              }
              if (outcome === "completed" && !turn.controller.signal.aborted && compatibilityAttempted) {
                confirmedEffort = attemptedEffort;
                compatibilityConfirmed = true;
                emit(turn, "message", "本会话已使用兼容请求完成，后续沿用该方式；已保存设置不变。", { source: "system", reasonCode: "reasoning-compatibility", state: "completed" });
              }
              if (turn.controller.signal.aborted) outcome = turn.reason ?? "aborted";
              if (outcome === "failed" || outcome === "timed_out") throw new Error(turn.failure ?? `Codex turn ${outcome}`);
            } catch (error) {
              turn.reason ??= "failed";
              turn.failure = config.redact(error);
              turn.controller.abort();
              turn.ready.resolve("");
              if (turn.reason !== "aborted") throw new Error(turn.failure);
            } finally {
              if (activeReasoningCatalog && !compatibilityConfirmed) restoreOriginalCatalog = true;
              stopTimer(); turn.completed = true; turn.controller.abort(); turn.ready.resolve("");
              emit(turn, "settled", `Codex turn ${turn.reason ?? "completed"}`, { outcome: turn.reason ?? "completed", ...(turn.failure ? { error: turn.failure } : {}), ...(turn.searchCalls ? { searchCalls: turn.searchCalls } : {}) });
              if (active === turn) active = undefined;
            }
          },
          events: queue.events,
          async abort() { if (active) await stop(active, "aborted"); },
          dispose() { return disposePromise ??= (async () => {
            disposed = true;
            let failure: unknown;
            try { if (active) await stop(active, "aborted"); } catch (error) { failure = error; }
            try { await cleanup(); } finally { queue.end(); }
            if (failure) throw failure;
          })(); },
        };
        async function stop(turn: TurnState, outcome: RuntimeTurnOutcome): Promise<void> {
          if (turn.completed) return;
          if (turn.stopping) return turn.stopping;
          turn.reason = outcome; turn.controller.abort();
          turn.stopping = (async () => {
            try {
              if (!turn.nativeId) {
                turn.ready.resolve("");
                quarantined = true;
                await bounded(engine!.close(), 750, "early abort cleanup");
                turn.done.resolve(outcome);
              } else {
                await bounded(Promise.all([engine!.request("turn/interrupt", { threadId: nativeId, turnId: turn.nativeId }), turn.done.promise]), 750, "turn interrupt");
              }
            } catch (error) {
              quarantined = true; turn.failure = config.redact(error); turn.done.resolve(outcome);
              await bounded(engine!.close(), 200, "interrupt cleanup");
              throw new Error(turn.failure);
            }
          })();
          return turn.stopping;
        }
        // Model metadata is read only after a precise effort rejection, from this CLI instance
        // (value-default selection or E1's field-removal candidate), never on the normal path.
        // Exact model identity and a declared default are required; no alias or guessed default.
        function catalogDefaultEffort(): Promise<string | undefined> {
          return defaultEffortPromise ??= (async () => {
            let cursor: string | undefined;
            const seen = new Set<string>();
            try {
              do {
                const page = object(await engine!.request("model/list", { includeHidden: true, limit: 100, ...(cursor ? { cursor } : {}) }), "model catalog");
                if (!Array.isArray(page.data)) return undefined;
                for (const value of page.data) {
                  const model = object(value, "catalog model");
                  if (model.model !== config.model) continue;
                  const effort = model.defaultReasoningEffort;
                  return typeof effort === "string" && /^[a-z]{1,16}$/.test(effort)
                    && Array.isArray(model.supportedReasoningEfforts)
                    && model.supportedReasoningEfforts.some(option => object(option).reasoningEffort === effort) ? effort : undefined;
                }
                cursor = typeof page.nextCursor === "string" && page.nextCursor ? page.nextCursor : undefined;
                if (cursor && seen.has(cursor)) return undefined;
                if (cursor) seen.add(cursor);
              } while (cursor && seen.size < 10);
            } catch { /* Missing/unavailable directory is not a guessed model capability. */ }
            return undefined;
          })();
        }
        async function startNativeTurn(turn: TurnState, input: readonly Record<string, unknown>[], effort: string | undefined, retry = false): Promise<void> {
          turn.reason = undefined; turn.failure = undefined; turn.failureFacts = undefined;
          turn.nativeId = undefined;
          // The first ready promise may already be captured by an early native tool request.
          // Keep its identity until it resolves; only a completed/rejected attempt is rearmed.
          if (retry) { turn.ready = deferred<string>(); turn.done = deferred<RuntimeTurnOutcome>(); turn.terminal = deferred<void>(); }
          const started = object(await engine!.request("turn/start", { threadId: nativeId, input, approvalPolicy: "never", approvalsReviewer: "user", sandboxPolicy: { type: "readOnly", networkAccess: false }, model: config.model, ...(effort !== undefined ? { effort } : {}) }), "turn/start");
          const id = object(started.turn, "native turn").id;
          if (typeof id !== "string" || !id) throw new Error("Codex native turn has no ID");
          turn.nativeId = id; turn.ready.resolve(id);
          if (turn.controller.signal.aborted) await stop(turn, turn.reason ?? "aborted");
        }
        async function reconnectNative(turn: TurnState, originalStrategy: boolean, effortRejected = false): Promise<void> {
          const needsCatalog = !originalStrategy && effortRejected && !options.cliPath && await catalogDefaultEffort() !== undefined;
          if (turn.controller.signal.aborted) return;
          const resumableThreadId = storage ? nativeId : undefined;
          const previousCatalog = activeReasoningCatalog;
          let replacement: TemporaryReasoningCatalog | undefined;
          turn.nativeId = undefined;
          nativeId = "";
          unsubscribe?.();
          try {
            await engine!.close();
            if (turn.controller.signal.aborted) return;
            // This replaces the existing absent-effort candidate; it is not a third retry.
            // Custom CLI paths are not asserted to share the installed package's metadata format.
            if (needsCatalog) {
              replacement = await prepareReasoningCatalog(workRoot, config.model);
            }
            if (turn.controller.signal.aborted) {
              if (replacement) await rm(replacement.directory, { recursive: true, force: true });
              return;
            }
            const reconnected = await connect(foreignServers, originalStrategy, replacement);
            engine = reconnected.connected;
            activeReasoningCatalog = replacement;
            engine.onServerRequest(nativeToolHandler);
            subscribeNotifications(engine);
            if (turn.controller.signal.aborted) {
              quarantined = true;
              await engine.close();
              if (replacement) await rm(replacement.directory, { recursive: true, force: true });
              activeReasoningCatalog = undefined;
              return;
            }
            await establishThread(engine, resumableThreadId);
            await inspectCatalog(engine);
            if (previousCatalog) await rm(previousCatalog.directory, { recursive: true, force: true });
            restoreOriginalCatalog = false;
          } catch (error) {
            // No next turn may reuse an engine whose reconstruction was not confirmed.
            quarantined = true;
            await engine?.close().catch(() => {});
            if (replacement) await rm(replacement.directory, { recursive: true, force: true });
            if (previousCatalog) await rm(previousCatalog.directory, { recursive: true, force: true });
            activeReasoningCatalog = undefined;
            throw error;
          }
        }
        return session;
      } catch (error) {
        try { await cleanup(); } catch (cleanupError) { throw new Error(`${config.redact(error)}; cleanup: ${config.redact(cleanupError)}`); }
        throw new Error(config.redact(error));
      }
    },
  };
}
