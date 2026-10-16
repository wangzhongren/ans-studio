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
  const deadline = Date.now() + 2000;
  while (!condition()) { if (Date.now() >= deadline) throw new Error("Codex fixture wait timed out"); await tick(2); }
}
export async function realMcp(): Promise<CodexMcpModules> {
  const root = process.env.ANS_CODEX_TEST_MCP_ROOT;
  const modules = ["server/index.js", "client/index.js", "inMemory.js", "types.js"];
  const [server, client, memory, types] = await Promise.all(modules.map(file => import(root ? pathToFileURL(path.join(root, "dist/esm", file)).href : `@modelcontextprotocol/sdk/${file}`)));
  return { Server: server.Server, Client: client.Client, InMemoryTransport: memory.InMemoryTransport, ListToolsRequestSchema: types.ListToolsRequestSchema, CallToolRequestSchema: types.CallToolRequestSchema };
}

interface Behavior {
  foreignRemains?: boolean;
  configFails?: boolean;
  unsafeSandbox?: boolean;
  resumeFails?: boolean;
  catalogForeign?: boolean;
  interruptHangs?: boolean;
  /** Forces a config/read web_search readback value (simulates requirements pinning the mode back). */
  webSearchReadback?: string;
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
    if (method === "config/read") {
      if (this.behavior.configFails) throw new Error("fake config read failure");
      const disabled = this.input.configOverrides.includes('mcp_servers={"foreign"={enabled=false}}');
      const override = this.input.configOverrides.find(value => value.startsWith("web_search="));
      const mode = /^web_search="([^"]*)"$/.exec(override ?? "")?.[1] ?? "disabled";
      return { config: { features: Object.fromEntries(DISABLED_NATIVE_FEATURES.map(name => [name, false])), sandbox_mode: "read-only", approval_policy: "never", web_search: this.behavior.webSearchReadback ?? mode, mcp_servers: { foreign: { enabled: this.behavior.foreignRemains || !disabled } } } };
    }
    if (method === "thread/start" || method === "thread/resume") {
      if (method === "thread/resume" && this.behavior.resumeFails) throw new Error("fake native resume failure");
      if (method === "thread/resume") this.nativeId = String(params.threadId);
      return { thread: { id: this.nativeId }, sandbox: { type: this.behavior.unsafeSandbox ? "workspaceWrite" : "readOnly" }, approvalPolicy: "never" };
    }
    if (method === "mcpServerStatus/list") return { data: this.behavior.catalogForeign ? [{ name: "foreign" }] : [], nextCursor: null };
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
