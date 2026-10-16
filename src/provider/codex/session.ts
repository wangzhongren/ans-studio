import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { ResolvedRole } from "../../model/role.ts";
import type { RuntimeAdapter, RuntimeProviderOptions, RoleSession, SessionEvent, ToolResult, RuntimeTurnOutcome, RuntimeToolEventFactsV1, RuntimeToolErrorFactsV1, InstalledMcpServerV1 } from "../../model/runtime.ts";
import { object, deferred, eventQueue, pausedDeadline, bounded, webSearchRow, mcpToolName, mcpToolCallNative, isReasoningParamRejection } from "../../common/codex-adapter/protocol.ts";
import type { CodexRpcConnection, CodexEngineInput, CodexEngineFactory } from "../../common/codex-adapter/protocol.ts";
import { settings, safetyConfig, safetyOverrides, effectiveConfig, verifyThread, reasoningEffortOverride } from "../../common/codex-adapter/config.ts";
// G-5：推理事实通道（适配器只产事实；投影单点在 Service）+ 降级链诊断（沿 installed-skills 先例）。事件 summary
// 用核心定格常量（Service 在投影单点强制覆盖——适配器不随载荷携带自由文本上 summary 位）。
import { REASONING_EVENT_SUMMARY } from "../../common/runtime-core/reasoning.ts";
import { createDiagnosticLogger } from "../../common/shared/diagnostics.ts";
// Windows 瞬时句柄占用（`EBUSY`/`EPERM`/`EACCES`）的**有界重试**单一来源（§一.5 不得第二份实现）：
// 收尾删除 workRoot 时，刚退出的原生进程/在途句柄可能短暂未释放——沿原子写原语同一口径处置。
import { retryOnTransient } from "../../common/shared/atomic-write.ts";
// G-4「已安装技能」注入节：渲染单一来源在编排（installed-skills.ts）——本适配器只做「非空则整段拼接」。
import { renderInstalledSkillsSection } from "../../common/编排/installed-skills.ts";

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
          if (!exited && child.pid) {
            const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
            await bounded(new Promise<void>((resolve, reject) => {
              killer.once("error", reject);
              killer.once("exit", code => { if (code === 0) resolve(); else reject(new Error("Codex owned Windows process tree cleanup failed")); });
            }), 120, "Windows process cleanup");
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
  reason?: RuntimeTurnOutcome;
  failure?: string;
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
  // G-4 installed-skills section: the render is the single orchestration source (hash/matching/bad-file
  // handling all live there). Non-empty splices the whole section verbatim as one prompt segment; empty
  // string renders nothing (zero-skill status quo stays byte-identical).
  const composeContext = async (role: ResolvedRole) => {
    const installedSkills = renderInstalledSkillsSection(options.projectRoot, role.id);
    return { systemPrompt: [
      role.cardText,
      `固定角色：${role.id}。实际项目目录：${options.projectRoot}。`,
      "只通过 ans_ 前缀工具执行项目读取、修改、命令、交互和回交；原生运行环境只读。派发不转移授权。",
      `角色写入边界：${JSON.stringify(role.boundary)}`,
      ...options.tools.flatMap(tool => tool.promptGuidelines ?? []),
      ...(installedSkills === "" ? [] : [installedSkills]),
    ].join("\n\n") };
  };

  return {
    composeContext,
    async bindRole(role) {
      // Resolve authentication, profile registration and child environment from one snapshot.
      const environmentSnapshot = { ...(options.env ?? process.env) };
      const config = settings(options, environmentSnapshot);
      options.registerToolDisplayProfile?.({
        apiKeyEnvVar: config.keyName,
        credentials: [...new Set([config.keyName, ...(options.toolDisplayCredentialEnvNames ?? [])])]
          .map(name => ({ name, value: environmentSnapshot[name] })),
      });
      const storage = options.storage;
      if (storage && (storage.runtime !== "codex" || storage.roleId !== role.id)) throw new Error("Codex storage role/runtime mismatch");
      const toolMap = new Map(options.tools.map(tool => [tool.name, tool]));
      if (toolMap.size !== options.tools.length || options.tools.some(tool => !/^[A-Za-z0-9_-]{1,60}$/.test(tool.name))) {
        throw new Error("Codex tools require unique valid ANS names");
      }
      // G-4 V2：已安装 MCP 的校验/展开（装配前、零副作用）与白名单名集（进程/线程/目录三处恰等、降级面共用）。
      const installedServers = prepareInstalledMcpServers(options.installedMcpServers ?? [], environmentSnapshot);
      const allowedServers = new Set(installedServers.map(server => server.name));
      // G-5：推理强度接线面（注入判定＝会话级；off＝无该档不注入另有如实行）+ 降级闸（会话级恰一次）+ 降级诊断。
      const reasoningInjected = reasoningEffortOverride(config.reasoningEffort) !== undefined;
      let reasoningDegraded = false;
      const diagnosticLog = createDiagnosticLogger({ component: "codex-adapter", projectRoot: options.projectRoot, roleId: role.id });
      await storage?.validateNativeDirectory?.();
      const previous = await storage?.readLatest();
      if (previous && (previous.runtime !== "codex" || previous.roleId !== role.id)) throw new Error("Codex native session record role/runtime mismatch");
      const instanceId = randomUUID();
      const workRoot = await mkdtemp(path.join(os.tmpdir(), "ans-codex-"));
      const cwd = path.join(workRoot, "work");
      const nativeHome = storage?.nativeDirectory ?? path.join(workRoot, "native");
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
        const connect = async (disabled: readonly string[], injectReasoning = true) => {
          // G-4 V2：白名单定义＋禁用集编入**同一条** `-c mcp_servers={…}`（P0 探针铁律：连续 -c 同根键覆盖不合并）。
          // G-5：`model_reasoning_effort` 为顶层标量键、独立一条（探针实证叠加无冲突）；去参数重发＝该条缺席。
          const reasoningOverride = injectReasoning ? reasoningEffortOverride(config.reasoningEffort) : undefined;
          const connected = await engineFactory({ cwd, nativeHome, env: environment, configOverrides: [...safetyOverrides(cwd, disabled, config.webSearch, installedServers), ...(reasoningOverride !== undefined ? [reasoningOverride] : []), providerDefinition, `model_provider=${JSON.stringify(provider)}`], timeoutMs: options.constructTimeoutMs ?? 30000 });
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
            void turn.ready.promise.then(expected => {
              if (typeof notifyId !== "string" || notifyId !== expected || active !== turn || turn.completed) return;
              if (method === "item/completed") {
                const item = object(params.item, "native item");
                if (item.type === "agentMessage") { turn.outputSeen = true; emit(turn, "message", String(item.text ?? ""), { text: item.text }); }
                // Server-side (gateway-executed) search: always mapped, never quarantined, never inferred as failure.
                if (item.type === "webSearch") {
                  turn.outputSeen = true;
                  turn.searchCalls += 1;
                  const row = webSearchRow(item);
                  emit(turn, "message", row.summary, row.detail);
                }
                // G-4 V2 使用行（P0 探针字段全集；status/error/result 三态如实）：走核心投影单点
                // （native-result 事实），白名单调用＝已授予能力的执行事实——**不进隔离**（非越权信号）。
                if (item.type === "mcpToolCall") {
                  turn.outputSeen = true;
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
                  turn.failure = "Codex reported a forbidden native command/file tool; session quarantined";
                  quarantined = true; turn.reason = "failed"; turn.controller.abort(); turn.done.resolve("failed");
                  void engine!.close().catch(error => { turn.failure = config.redact(error); });
                }
              } else if (method === "item/started") {
                // G-5：reasoning item 的真实起点（durationMs 信号面）；其余 item/started 不映射（沿既有先例）。
                const item = object(params.item, "native item");
                if (item.type === "reasoning") {
                  turn.outputSeen = true;
                  if (typeof item.id === "string" && typeof params.startedAtMs === "number" && Number.isFinite(params.startedAtMs)) turn.reasoningStarted.set(item.id, params.startedAtMs);
                }
              } else if (method === "item/reasoning/summaryPartAdded" || method === "item/reasoning/summaryTextDelta" || method === "item/reasoning/textDelta") {
                // G-5 增量帧＝消费（「已产出内容」证据——降级闸依赖）但不产行：行由完成态 item 给（完成态先行）。
                turn.outputSeen = true;
              } else if (method === "turn/completed") {
                const completed = object(params.turn);
                const outcome = turn.reason ?? (completed.status === "completed" ? "completed" : completed.status === "interrupted" ? "aborted" : "failed");
                turn.reason = outcome;
                if (completed.error) turn.failure = config.redact(object(completed.error).message ?? "Codex turn failed");
                turn.done.resolve(outcome);
              } else if (method === "error" && params.willRetry !== true) {
                turn.reason = "failed"; turn.failure = config.redact(object(params.error ?? {}).message ?? "Codex turn failed"); turn.done.resolve("failed");
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
        // G-5：Codex 无「off」档——显式「关」不注入任何参数（`reasoningEffortOverride` 对 off 返回 undefined）
        // 并如实一行说明（不假装关闭；会话级恰一次，在构造期）。
        if (config.reasoningEffort === "off") {
          emit(undefined, "message", "Codex 平台无「关」档：未注入推理强度参数（维持平台默认，推理未关闭）", { version: 1, source: "reasoning-effort", reason: "off-unsupported" });
        }
        const session: RoleSession = {
          runtime: "codex", roleId: role.id, contextSource, nativeSessionId: nativeId,
          ...(contextWarning ? { contextWarning } : {}),
          async prompt(text, promptOptions) {
            if (disposed || quarantined) throw new Error("Codex session is disposed or quarantined; create a new session");
            if (active) throw new Error("Codex session already has an active turn");
            const turn: TurnState = { ansId: options.currentTurnId() ?? randomUUID(), controller: new AbortController(), ready: deferred<string>(), done: deferred<RuntimeTurnOutcome>(), completed: false, calls: new Set(), searchCalls: 0, outputSeen: false, reasoningStarted: new Map() };
            // Abort can resolve ready before turn/start so early tool requests fail closed.
            active = turn;
            const stopTimer = pausedDeadline(options.interactionGate, options.promptTimeoutMs ?? 0, () => { void stop(turn, "timed_out").catch(error => { turn.failure = config.redact(error); }); });
            try {
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
              const started = object(await engine!.request("turn/start", { threadId: nativeId, input, approvalPolicy: "never", approvalsReviewer: "user", sandboxPolicy: { type: "readOnly", networkAccess: false }, model: config.model }), "turn/start");
              const id = object(started.turn, "native turn").id;
              if (typeof id !== "string" || !id) throw new Error("Codex native turn has no ID");
              turn.nativeId = id; turn.ready.resolve(id);
              if (turn.controller.signal.aborted) await stop(turn, turn.reason ?? "aborted");
              let outcome = await turn.done.promise;
              // G-5 降级链闸（保守＋有界恰一次）：首请求即失败（产出任何内容前）＋本会话曾注入推理强度＋
              // 错误命中推理参数拒绝判据 ⇒ 恰一次去参数重发（degradeReasoning 内部重建引擎/线程并以同一输入重发）。
              if (outcome === "failed" && !reasoningDegraded && reasoningInjected && !turn.outputSeen && !turn.controller.signal.aborted
                  && isReasoningParamRejection(turn.failure)) {
                await degradeReasoning(turn, input);
                outcome = await turn.done.promise;
              }
              if (outcome === "failed" || outcome === "timed_out") throw new Error(turn.failure ?? `Codex turn ${outcome}`);
            } catch (error) {
              turn.reason ??= "failed";
              turn.failure ??= config.redact(error);
              turn.controller.abort();
              turn.ready.resolve("");
              if (turn.reason !== "aborted") throw new Error(turn.failure);
            } finally {
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
        // G-5 降级链核心（有界恰一次；会话级）：网关因推理参数拒绝首请求 ⇒ 去掉该参数、其余覆盖逐字不变
        // （连进程重建——0.162.1 探针：thread config 置 null/空被拒、轮级 effort=null 不生效，无轻量取消路径）、
        // 重建线程（有 storage 先试续接当前线程，失败或非持久会话走新线程）并以同一输入重发；成功后本轮继续。
        // 中途中止：清 nativeId 转既有 early-abort 语义（quarantine——沿既有纪律，不拿死引擎发 interrupt）。
        async function degradeReasoning(turn: TurnState, input: readonly Record<string, unknown>[]): Promise<void> {
          reasoningDegraded = true; // 恰一次（会话级：此后本会话引擎不再携带该参数，也不会再次重发）
          const resumableThreadId = storage ? nativeId : "";
          turn.nativeId = undefined;
          emit(turn, "message", "本网关不支持所设推理强度，本轮已按默认执行", { version: 1, source: "reasoning-effort", reason: "gateway-rejected" });
          try { diagnosticLog.record("reasoning.effort.degraded", { runtime: "codex", retried: true }); } catch { /* 诊断绝不改变执行 */ }
          unsubscribe?.();
          await engine!.close();
          if (turn.controller.signal.aborted) return;
          const reconnected = await connect(foreignServers, false);
          engine = reconnected.connected;
          engine.onServerRequest(nativeToolHandler);
          subscribeNotifications(engine);
          if (turn.controller.signal.aborted) return;
          await establishThread(engine, resumableThreadId !== "" ? resumableThreadId : undefined);
          await inspectCatalog(engine);
          if (turn.controller.signal.aborted) return;
          // 重臂轮状态并以同一输入重发（reason/failure 清空——首次失败不再算数；ready/done 重挂到重发轮）。
          turn.reason = undefined; turn.failure = undefined;
          turn.calls.clear(); turn.reasoningStarted.clear();
          turn.ready = deferred<string>(); turn.done = deferred<RuntimeTurnOutcome>();
          const restarted = object(await engine.request("turn/start", { threadId: nativeId, input, approvalPolicy: "never", approvalsReviewer: "user", sandboxPolicy: { type: "readOnly", networkAccess: false }, model: config.model }), "turn/start");
          const retried = object(restarted.turn, "native turn").id;
          if (typeof retried !== "string" || !retried) throw new Error("Codex native turn has no ID");
          turn.nativeId = retried; turn.ready.resolve(retried);
          if (turn.controller.signal.aborted) await stop(turn, turn.reason ?? "aborted");
        }
        return session;
      } catch (error) {
        try { await cleanup(); } catch (cleanupError) { throw new Error(`${config.redact(error)}; cleanup: ${config.redact(cleanupError)}`); }
        throw new Error(config.redact(error));
      }
    },
  };
}
