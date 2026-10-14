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
