import type { ResolvedRole } from "../../src/model/role.ts";
import type { InteractionGate, RoleSession, SessionEvent, RuntimeProviderOptions } from "../../src/model/runtime.ts";
import type { CodexEngineInput, CodexRpcConnection, CodexRuntimeAdapterOptions, CodexMcpModules } from "../../src/provider/codex/session.ts";
import { DISABLED_NATIVE_FEATURES } from "../../src/common/codex-adapter/config.ts";
import { pathToFileURL } from "node:url";
import path from "node:path";

export const role: ResolvedRole = { id: "codex-fixture", kind: "project", cardText: "# fixture role", boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } }, boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" } };

export function interactionGate(): InteractionGate {
  let count = 0;
  const listeners = new Set<(waiting: boolean) => void>();
  const changed = () => { for (const listener of listeners) listener(count > 0); };
  return { begin() { count++; changed(); }, end() { count = Math.max(0, count - 1); changed(); }, isWaiting: () => count > 0, onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}
export const tick = (milliseconds = 0) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));
export async function until(condition: () => boolean) {
  // Windows CI may scan the 318 MiB installed binary before the reconnect completes; the
  // deadline only bounds how long a condition may stay false, never what is asserted.
  const deadline = Date.now() + 10_000;
  while (!condition()) { if (Date.now() >= deadline) throw new Error("Codex fixture wait timed out"); await tick(2); }
}
export async function realMcp(): Promise<CodexMcpModules> {
  const root = process.env.ANS_CODEX_TEST_MCP_ROOT;
  const modules = ["server/index.js", "client/index.js", "inMemory.js", "types.js"];
  const [server, client, memory, types] = await Promise.all(modules.map(file => import(root ? pathToFileURL(path.join(root, "dist/esm", file)).href : `@modelcontextprotocol/sdk/${file}`)));
  return { Server: server.Server, Client: client.Client, InMemoryTransport: memory.InMemoryTransport, ListToolsRequestSchema: types.ListToolsRequestSchema, CallToolRequestSchema: types.CallToolRequestSchema };
}

interface Behavior {
  models?: Array<Record<string, unknown>>;
  foreignRemains?: boolean;
  configFails?: boolean;
  unsafeSandbox?: boolean;
  resumeFails?: boolean;
  catalogForeign?: boolean;
  interruptHangs?: boolean;
  /** Forces a config/read web_search readback value (simulates requirements pinning the mode back). */
  webSearchReadback?: string;
  /** G-4 V2：config/read 枚举的 server 名集（enabled 从进程 `-c mcp_servers={…}` 覆盖推导；缺省＝旧 foreign 探针形态）。 */
  mcpServers?: readonly string[];
  /** G-4 V2：mcpServerStatus/list 的 data（缺省＝旧空目录/foreign 形态）。 */
  mcpCatalog?: Array<Record<string, unknown>>;
  /** G-4 V2：目录 nextCursor（缺省 null）。 */
  catalogNextCursor?: string;
}
export class FakeEngine implements CodexRpcConnection {
  input: CodexEngineInput;
  behavior: Behavior;
  requests: Array<{ method: string; params: Record<string, unknown> }> = [];
  listeners = new Set<(method: string, params: unknown) => void>();
  handler?: Parameters<CodexRpcConnection["onServerRequest"]>[0];
  nativeId = "native-thread";
  turnId = "";
  turns = 0;
  closed = false;
  constructor(input: CodexEngineInput, behavior: Behavior) { this.input = input; this.behavior = behavior; }
  async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    this.requests.push({ method, params });
    if (method === "initialize") return {};
    if (method === "model/list") return { data: this.behavior.models ?? [], nextCursor: null };
    if (method === "config/read") {
      if (this.behavior.configFails) throw new Error("fake config read failure");
      const override = this.input.configOverrides.find(value => value.startsWith("web_search="));
      const mode = /^web_search="([^"]*)"$/.exec(override ?? "")?.[1] ?? "disabled";
      let servers: Record<string, { enabled: boolean }>;
      if (this.behavior.mcpServers !== undefined) {
        // G-4 V2：从进程 `-c mcp_servers={…}` 覆盖里读 `"name"={enabled=false}` 词条（生产编码器形态）。
        const declared = this.input.configOverrides.filter(value => value.startsWith("mcp_servers=")).join("\n");
        const disabled = new Set([...declared.matchAll(/"([^"]+)"=\{enabled=false\}/g)].map(match => match[1] ?? ""));
        servers = Object.fromEntries(this.behavior.mcpServers.map(name => [name, { enabled: this.behavior.foreignRemains === true || !disabled.has(name) }]));
      } else {
        const disabled = this.input.configOverrides.includes('mcp_servers={"foreign"={enabled=false}}');
        servers = { foreign: { enabled: this.behavior.foreignRemains === true || !disabled } };
      }
      return { config: { features: Object.fromEntries(DISABLED_NATIVE_FEATURES.map(name => [name, false])), sandbox_mode: "read-only", approval_policy: "never", web_search: this.behavior.webSearchReadback ?? mode, mcp_servers: servers } };
    }
    if (method === "thread/start" || method === "thread/resume") {
      if (method === "thread/resume" && this.behavior.resumeFails) throw new Error("fake native resume failure");
      if (method === "thread/resume") this.nativeId = String(params.threadId);
      return { thread: { id: this.nativeId }, sandbox: { type: this.behavior.unsafeSandbox ? "workspaceWrite" : "readOnly" }, approvalPolicy: "never" };
    }
    if (method === "mcpServerStatus/list") {
      if (this.behavior.mcpCatalog !== undefined) return { data: this.behavior.mcpCatalog, nextCursor: this.behavior.catalogNextCursor ?? null };
      if (this.behavior.mcpServers !== undefined) {
        // P0 探针：目录＝线程 enabled 集（线程级 {enabled:false} 的 server 不进 catalog）——从最后一次 thread/* 推导。
        const threadRequest = [...this.requests].reverse().find(entry => entry.method === "thread/start" || entry.method === "thread/resume");
        const rawConfig = threadRequest?.params.config;
        const config = rawConfig !== null && typeof rawConfig === "object" && !Array.isArray(rawConfig) ? rawConfig as Record<string, unknown> : {};
        const rawServers = config.mcp_servers;
        const threadServers = rawServers !== null && typeof rawServers === "object" && !Array.isArray(rawServers) ? rawServers as Record<string, { enabled?: unknown }> : undefined;
        const enabled = this.behavior.mcpServers.filter(name => threadServers === undefined || threadServers[name] === undefined || threadServers[name]?.enabled !== false);
        return { data: enabled.map(name => ({ name, runtimeStatus: "connected" })), nextCursor: null };
      }
      return { data: this.behavior.catalogForeign ? [{ name: "foreign" }] : [], nextCursor: null };
    }
    if (method === "turn/start") {
      this.turnId = `native-turn-${++this.turns}`;
      return { turn: { id: this.turnId, status: "inProgress" } };
    }
    if (method === "turn/interrupt") {
      if (this.behavior.interruptHangs) return new Promise(() => {});
      this.finish("interrupted");
      return {};
    }
    throw new Error(`unexpected fixture RPC ${method}`);
  }
  notify() {}
  onNotification(listener: (method: string, params: unknown) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  onServerRequest(handler: Parameters<CodexRpcConnection["onServerRequest"]>[0]) { this.handler = handler; }
  async close() { this.closed = true; }
  finish(status = "completed", error?: string) {
    for (const listener of this.listeners) listener("turn/completed", { threadId: this.nativeId, turn: { id: this.turnId, status, ...(error ? { error: { message: error } } : {}) } });
  }
  message(text: string) { for (const listener of this.listeners) listener("item/completed", { threadId: this.nativeId, turnId: this.turnId, item: { type: "agentMessage", text } }); }
  event(method: string, item: Record<string, unknown>) { for (const listener of this.listeners) listener(method, { threadId: this.nativeId, turnId: this.turnId, item }); }
  webSearch(item: Record<string, unknown> = {}) { this.event("item/completed", { type: "webSearch", id: "ws-fixture-1", query: "fixture query", ...item }); }
  /** G-4 V2：白名单 server 启动状态通知（会话级、无轮次身份；P0 探针形状）。 */
  startup(name: string, status: string, error?: string | null) { for (const listener of this.listeners) listener("mcpServer/startupStatus/updated", { threadId: this.nativeId, name, status, error: error ?? null, failureReason: null }); }
  /** G-4 V2：mcpToolCall item（item/completed，P0 探针字段全集形状）。 */
  mcpToolCall(item: Record<string, unknown> = {}) { this.event("item/completed", { type: "mcpToolCall", id: "mcp-fixture-1", server: "fixture-mcp", tool: "echo", status: "completed", arguments: {}, result: { content: [{ type: "text", text: "fixture result" }] }, error: null, durationMs: 1, ...item }); }
  /** G-5：推理帧（A3 探针形状——item/started+item/completed，时间戳走真实通知字段）。 */
  reasoningItem(item: Record<string, unknown> = {}, times: { startedAtMs?: number; completedAtMs?: number } = {}) {
    const full = { type: "reasoning", id: "rs-fixture-1", summary: [], content: [], ...item };
    for (const listener of this.listeners) listener("item/started", { threadId: this.nativeId, turnId: this.turnId, item: { ...full, summary: [], content: [] }, ...(times.startedAtMs !== undefined ? { startedAtMs: times.startedAtMs } : {}) });
    for (const listener of this.listeners) listener("item/completed", { threadId: this.nativeId, turnId: this.turnId, item: full, ...(times.completedAtMs !== undefined ? { completedAtMs: times.completedAtMs } : {}) });
  }
  /** G-5：推理增量帧（三个方法名之一；增量不产行——仅消费）。 */
  reasoningDelta(method: string, params: Record<string, unknown> = {}) { for (const listener of this.listeners) listener(method, { threadId: this.nativeId, turnId: this.turnId, itemId: "rs-fixture-1", ...params }); }
  /** G-5：轮失败（error 通知，willRetry=false——与 A4 探针拒绝面同形）。 */
  failTurn(message: string, willRetry = false) {
    for (const listener of this.listeners) listener("error", { threadId: this.nativeId, turnId: this.turnId, error: { message }, willRetry });
    if (!willRetry) this.finish("failed", message);
  }
  async call(name: string, args: Record<string, unknown>, override: Record<string, unknown> = {}, requestController = new AbortController()) {
    if (!this.handler) throw new Error("fixture handler missing");
    return this.handler("item/tool/call", { threadId: this.nativeId, turnId: this.turnId, callId: `call-${Math.random()}`, namespace: null, tool: `ans_${name}`, arguments: args, ...override }, { signal: requestController.signal });
  }
}
export function harness(behavior: Behavior = {}) {
  const engines: FakeEngine[] = [];
  return { engines, get engine() { return engines.at(-1)!; }, async factory(input: CodexEngineInput) { const engine = new FakeEngine(input, behavior); engines.push(engine); return engine; } };
}

export function options(root: string, engines: ReturnType<typeof harness>, extra: Partial<CodexRuntimeAdapterOptions> = {}): CodexRuntimeAdapterOptions {
  return { runtime: "codex", projectRoot: root, skillRoot: root, tools: [], interactionGate: interactionGate(), currentTurnId: () => "ans-turn", modelId: "fixture-model", env: { CODEX_API_KEY: "fake-codex-key", OPENAI_API_KEY: "fake-openai-key", PATH: process.env.PATH }, engineFactory: engines.factory, mcpLoader: realMcp, ...extra };
}
export function collect(session: RoleSession) {
  const entries: SessionEvent[] = [];
  const done = (async () => { for await (const event of session.events()) entries.push(event); })();
  return { entries, done };
}
export async function start(session: RoleSession, engine: FakeEngine, text = "fixture") {
  const before = engine.turns;
  const completion = session.prompt(text);
  // Keep expected rejections observed while an async native request runs.
  void completion.catch(() => {});
  await until(() => engine.turns > before);
  await tick();
  return { completion, nativeTurnId: engine.turnId };
}
