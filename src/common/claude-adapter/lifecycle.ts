import type { InteractionGate } from "../../model/runtime.ts";

export function createQueue<T>() {
  const values: T[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  return {
    push(value: T) { if (!closed) { values.push(value); wake?.(); wake = undefined; } },
    close() { closed = true; wake?.(); wake = undefined; },
    async *stream(): AsyncGenerator<T> {
      while (true) {
        if (values.length) yield values.shift()!;
        else if (closed) return;
        else await new Promise<void>((resolve) => { wake = resolve; });
      }
    },
  };
}

export function abortError(): Error {
  const error = new Error("Claude 本轮已中止");
  error.name = "AbortError";
  return error;
}

/**
 * The bundled SDK rejects control requests with a plain Error carrying exactly this message once the
 * query is already closed (its `request()` / pending-response cleanup path). For `interrupt()` that
 * means the query is already gone — i.e. the stop already happened — not an interrupt failure.
 * Deliberately exact: any other rejection still propagates.
 */
export function isQueryClosedError(error: unknown): boolean {
  return error instanceof Error && error.message === "Query closed before response received";
}

/** Framework deadline; pauses on the injected gate and listens to this turn's signal. */
export async function waitForTurn<T>(work: Promise<T>, signal: AbortSignal, timeoutMs: number, gate: InteractionGate): Promise<T> {
  let remaining = timeoutMs;
  let started = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reject!: (error: Error) => void;
  const cancellation = new Promise<never>((_resolve, fail) => { reject = fail; });
  const stop = () => {
    if (timer) { clearTimeout(timer); timer = undefined; remaining = Math.max(0, remaining - (Date.now() - started)); }
  };
  const start = () => {
    if (timer || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return;
    started = Date.now();
    timer = setTimeout(() => {
      timer = undefined;
      const error = new Error(`Claude 本轮超时（${timeoutMs}ms）`);
      error.name = "TimeoutError";
      reject(error);
    }, remaining);
  };
  const onAbort = () => reject(abortError());
  const unsubscribe = gate.onChange((waiting) => { if (waiting) stop(); else start(); });
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) onAbort();
  else if (!gate.isWaiting()) start();
  try { return await Promise.race([work, cancellation]); }
  finally { stop(); unsubscribe(); signal.removeEventListener("abort", onAbort); }
}
