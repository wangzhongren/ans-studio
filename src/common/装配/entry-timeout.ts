// 装配私有：入口兜底超时（bin/ans.js 用）。
//
// 目的：入口 `await main(...)` 必须**确定性收敛**。若 main() 因未释放资源（定时器/句柄/
// 事件流）迟迟不 resolve，入口不能无限等待——到点以非 0 退出并说明“入口超时”。
//
// 与编排层给 prompt 加的超时是**两层**，互不冲突：此处兜底的是“入口进程整体收敛”。
// 纯函数，便于单测。

/** 默认入口超时：5 分钟。 */
export const DEFAULT_ENTRY_TIMEOUT_MS = 300_000;

/** 覆盖入口超时的环境变量名。 */
export const ENTRY_TIMEOUT_ENV = "ANS_ENTRY_TIMEOUT_MS";

/**
 * 解析入口超时（毫秒）。env 里 ENTRY_TIMEOUT_ENV 为**有限正数**时采用，否则用默认值。
 * 非法值（非数字、非正、Infinity/NaN）一律回退默认，绝不放行“0 或负 → 立即超时”的意外。
 */
export function resolveEntryTimeoutMs(
  env: Record<string, string | undefined>,
  defaultMs: number = DEFAULT_ENTRY_TIMEOUT_MS,
): number {
  const raw = env[ENTRY_TIMEOUT_ENV];
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return defaultMs;
}
