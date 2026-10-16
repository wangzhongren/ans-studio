import type { InteractionGate, SessionEvent } from "../../model/runtime.ts";

/** Infrastructure is constructed in Provider; these are adapter-private wire shapes. */
export interface CodexRpcConnection {
  request(method: string, params: Record<string, unknown>): Promise<unknown>;
  notify(method: string, params: Record<string, unknown>): void;
  onNotification(listener: (method: string, params: unknown) => void): () => void;
  onServerRequest(handler: (method: string, params: unknown, request?: { signal: AbortSignal }) => Promise<Record<string, unknown>>): void;
  close(): Promise<void>;
}
export interface CodexEngineInput {
  cwd: string;
  nativeHome: string;
  env: Record<string, string>;
  configOverrides: readonly string[];
  timeoutMs: number;
}
export type CodexEngineFactory = (input: CodexEngineInput) => Promise<CodexRpcConnection>;

export function object(value: unknown, label = "response"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Codex invalid ${label}`);
  return value as Record<string, unknown>;
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function eventQueue() {
  const entries: SessionEvent[] = [];
  let wake: (() => void) | undefined;
  let ended = false;
  return {
    push(event: SessionEvent) { if (!ended) { entries.push(event); wake?.(); wake = undefined; } },
    end() { ended = true; wake?.(); wake = undefined; },
    async *events(): AsyncGenerator<SessionEvent> {
      while (true) {
        if (entries.length) { yield entries.shift()!; continue; }
        if (ended) return;
        await new Promise<void>(resolve => { wake = resolve; });
      }
    },
  };
}

/** Counts active work only; customer and shell review waits pause the deadline. */
export function pausedDeadline(gate: InteractionGate, milliseconds: number, expired: () => void): () => void {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return () => {};
  let remaining = milliseconds;
  let started = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const pause = () => {
    if (timer) { clearTimeout(timer); timer = undefined; remaining -= Date.now() - started; }
  };
  const resume = () => {
    if (stopped || timer) return;
    started = Date.now();
    timer = setTimeout(() => { timer = undefined; stopped = true; expired(); }, Math.max(0, remaining));
  };
  const unsubscribe = gate.onChange(waiting => { if (waiting) pause(); else resume(); });
  if (!gate.isWaiting()) resume();
  return () => { stopped = true; pause(); unsubscribe(); };
}

export async function bounded<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Codex ${label} timed out`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

/** Bounded projection of the opaque native `results` list into the row detail; longer lists are marked, never silently cut. */
const WEB_SEARCH_RESULTS_CAP = 20;

/**
 * Projects one native `webSearch` thread item (item/completed) into a single ANS message row.
 * Detail v1 (2026-10-16 web-search implementation): only fields the app-server actually reported
 * are carried; missing fields stay missing; nothing is invented. Tolerant by contract — a
 * malformed item still yields the fallback row and never throws.
 */
export function webSearchRow(item: Record<string, unknown>): { summary: string; detail: Record<string, unknown> } {
  const query = typeof item.query === "string" && item.query ? item.query : undefined;
  const detail: Record<string, unknown> = { version: 1, source: "web-search" };
  if (typeof item.id === "string" && item.id) detail.itemId = item.id;
  if (query !== undefined) detail.query = query;
  const action = item.action && typeof item.action === "object" && !Array.isArray(item.action) ? item.action as Record<string, unknown> : undefined;
  if (action && typeof action.type === "string" && action.type) {
    const projected: Record<string, unknown> = { type: action.type };
    if (typeof action.url === "string") projected.url = action.url;
    if (typeof action.pattern === "string") projected.pattern = action.pattern;
    if (Array.isArray(action.queries) && action.queries.every(value => typeof value === "string")) projected.queries = [...action.queries];
    detail.action = projected;
  }
  if (Array.isArray(item.results)) {
    detail.results = item.results.slice(0, WEB_SEARCH_RESULTS_CAP).map(entry => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return {};
      const record = entry as Record<string, unknown>;
      const row: Record<string, unknown> = {};
      if (typeof record.title === "string") row.title = record.title;
      if (typeof record.url === "string") row.url = record.url;
      return row;
    });
    if (item.results.length > WEB_SEARCH_RESULTS_CAP) detail.resultsTruncated = true;
  }
  return { summary: query === undefined ? "联网搜索" : `联网搜索：${query}`, detail };
}

/**
 * G-4 V2（P2）模型面工具名：P0 探针实证 0.162.1 把 MCP 工具经 `type:"namespace"` 桥
 * `mcp__<server>`（`-`→`_`）下发、回传须 `name`＋`namespace` 双字段；行名沿三平台
 * `mcp__<server>__<tool>` 家族形态（§5.4 行内容面统一）。
 */
export function mcpToolName(server: string, tool: string): string {
  return `mcp__${server.replace(/[^A-Za-z0-9_]/g, "_")}__${tool}`;
}

/**
 * G-4 V2（P2）：`mcpToolCall` item（item/completed）→ native-result 事实块（探针字段全集：
 * server/tool/status/arguments/result.content/error/durationMs）。文本块保真、其余块如实
 * 标 `unsupported`（沿核心 `RuntimeNativeToolResultFactsV1` 纪律）；`status:"failed"` 或
 * 带 error 即 `isError`。纯函数、容错不抛（坏形状 ⇒ 空 content＋按字段可得性取）。
 */
export function mcpToolCallNative(item: Record<string, unknown>): { isError: boolean; content: Array<{ type: "text"; text: string } | { type: "unsupported" }>; errorText?: string } {
  const result = item.result && typeof item.result === "object" && !Array.isArray(item.result) ? item.result as Record<string, unknown> : undefined;
  const content: Array<{ type: "text"; text: string } | { type: "unsupported" }> = [];
  if (Array.isArray(result?.content)) {
    for (const block of result.content) {
      const record = block && typeof block === "object" && !Array.isArray(block) ? block as Record<string, unknown> : undefined;
      if (record?.type === "text" && typeof record.text === "string") content.push({ type: "text", text: record.text });
      else content.push({ type: "unsupported" });
    }
  }
  const error = item.error && typeof item.error === "object" && !Array.isArray(item.error) ? item.error as Record<string, unknown> : undefined;
  const errorText = typeof error?.message === "string" && error.message !== "" ? error.message : undefined;
  return { isError: item.status === "failed" || errorText !== undefined, content, ...(errorText !== undefined ? { errorText } : {}) };
}
