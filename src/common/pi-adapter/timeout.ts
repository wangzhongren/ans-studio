// 硬超时工具（契约 §4 修复：prompt / 构造不得无限期挂起）。
//
// 归属：Pi适配器角色私有辅助（src/common/pi-adapter/）。
// 不 import 任何 Pi 包，可在纯单测中加载。
//
// 设计：用工厂函数产出带标记的 Error（避免自定义 class 的字段擦除歧义），
// 并提供 withTimeout 与从环境变量读取时限的工具。

/** 默认 prompt 时限：120000ms。 */
export const DEFAULT_PROMPT_TIMEOUT_MS = 120000;
/** 默认构造期单步时限：与 prompt 同量级，避免构造阶段无声挂起。 */
export const DEFAULT_CONSTRUCT_TIMEOUT_MS = 120000;
/**
 * 默认 shell 审核时限：120000ms。审核（含 §7.3 的 b 问 pm、a 问操作者）用**超时包装**，
 * **超时 = 拒绝**（设计 §7.5 第 2 条）——绝不让「审核没回」变成「放行」。
 */
export const DEFAULT_SHELL_REVIEW_TIMEOUT_MS = 120000;

export const PROMPT_TIMEOUT_ENV = "ANS_PI_PROMPT_TIMEOUT_MS";
export const CONSTRUCT_TIMEOUT_ENV = "ANS_PI_CONSTRUCT_TIMEOUT_MS";
export const SHELL_REVIEW_TIMEOUT_ENV = "ANS_PI_SHELL_REVIEW_TIMEOUT_MS";

/** 构造一个带 label/timeoutMs 标记的"超时"错误。message 可读，绝不含凭据。 */
export function timeoutError(label: string, timeoutMs: number): Error {
  const err = new Error(
    `${label} 超时（${timeoutMs}ms）：底层操作未在时限内返回，已中止以免无限挂起。`,
  );
  err.name = "TimeoutError";
  (err as { label?: string; timeoutMs?: number }).label = label;
  (err as { label?: string; timeoutMs?: number }).timeoutMs = timeoutMs;
  return err;
}

/** 判断某错误是否为超时错误。 */
export function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.name === "TimeoutError";
}

/**
 * 给任意 Promise 施加硬超时。
 * - timeoutMs 非正/非有限 → 不加超时（直接返回原 Promise）。
 * - 超时 → reject 一个 timeoutError(label, timeoutMs)。
 */
export async function withTimeout<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return work;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(timeoutError(label, timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** 从环境变量读取时限；缺失或非法则回退到 fallback。 */
export function readTimeoutMs(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}
