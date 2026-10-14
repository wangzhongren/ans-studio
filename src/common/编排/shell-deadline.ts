// Shell review has its own bounded deadline; this policy does not depend on an engine's private helpers.
export const DEFAULT_SHELL_REVIEW_TIMEOUT_MS = 120000;
// Preserve the existing operator setting while the engine-neutral contract is adopted.
export const SHELL_REVIEW_TIMEOUT_ENV = "ANS_PI_SHELL_REVIEW_TIMEOUT_MS";

export function readTimeoutMs(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const parsed = Number(env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

export async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return work;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`${label} 超时（${ms}ms）：审核未完成，未获放行。`);
        error.name = "TimeoutError";
        reject(error);
      }, ms);
      work.then(resolve, reject);
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
