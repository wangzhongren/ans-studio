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
//
// —— 交互等待时限（设计 G-1，2026-10-12 客户裁定「没必要超时，就卡在这等客户同意」）——
//
// **缺省不设限**：客户确认制的等待**一直等**客户作答（同意/拒绝/通道失效），不再有缺省上限。
// 仅当**显式配置**（`opts.customerInputTimeoutMs` 或环境变量 `ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS`）才计时；
// 一旦计时，**超时 = 未获同意**（fail-closed）——绝不让「没等到回应」变成「假设同意」。
// **历史（留痕）**：本文件曾有 `DEFAULT_CUSTOMER_INPUT_TIMEOUT_MS=110000` 与
// `resolveCustomerInputTimeoutMs`（把等待时限收敛到 `promptMs−余量` 之下）；随缺省上限取消（G-1）
// 两者已删除——改由「**等待期间暂停每轮硬超时**」（见下 `InteractionGate` / `withPausableTimeout`）承接，
// 从根上消除「长等待被整轮掐断」的问题，而非把等待压在整轮预算之内。

export const PROMPT_TIMEOUT_ENV = "ANS_PI_PROMPT_TIMEOUT_MS";
export const CONSTRUCT_TIMEOUT_ENV = "ANS_PI_CONSTRUCT_TIMEOUT_MS";
export const SHELL_REVIEW_TIMEOUT_ENV = "ANS_PI_SHELL_REVIEW_TIMEOUT_MS";
/** 交互等待时限的**显式**配置（G-1 后仅显式才生效；未设 = 不超时）。 */
export const CUSTOMER_INPUT_TIMEOUT_ENV = "ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS";

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

/**
 * 读取**可选**时限（G-1 语义）：环境变量未设、空串或非法 → `undefined`——调用方据此决定「**不限时**」。
 * 与 `readTimeoutMs`（带 fallback 的必回值版）相对；交互等待用本函数（缺省不设限）。
 */
export function readOptionalTimeoutMs(
  env: Record<string, string | undefined>,
  name: string,
): number | undefined {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

/** 构造一个带 label 标记的「已中止」错误（会话中止/取消，与超时区分——同 isTimeoutError 的结构）。 */
export function abortError(label: string): Error {
  const err = new Error(`${label} 被中止（会话中止/取消，未获客户回应）。`);
  err.name = "AbortError";
  (err as { label?: string }).label = label;
  return err;
}

/** 判断某错误是否为中止错误。 */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * 让任意 Promise 响应 `AbortSignal`（设计 A-6：execute 的 AbortSignal 须透传，「防悬挂」）。
 * - `signal` 为 undefined → 原样等待 `work`；
 * - `signal` 已中止 → 立即以 `abortError(label)` 拒绝；
 * - 等待期间中止 → 立即拒绝（**不等** `work` 完成）。
 *
 * 如实标注：`work`（客户通道的等待）本身**不可取消**——本函数只保证 **handler 不再悬挂**、
 * 立即以 fail-closed 结果返回；被放弃的底层等待即使之后才有回音也无监听者，无副作用。
 */
export async function raceAbort<T>(work: Promise<T>, signal: AbortSignal | undefined, label: string): Promise<T> {
  if (signal === undefined) return work;
  if (signal.aborted) throw abortError(label);
  return await new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError(label));
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err as Error);
      },
    );
  });
}

// —————————————— 「交互挂起」活动闸与可暂停时限（设计 G-1） ——————————————

/**
 * 「交互挂起」活动闸（设计 G-1）：交互工具在**等待客户**期间 `begin()`、离开时 `end()`
 * （**引用计数**，可重入——同一轮多个交互工具 / 嵌套等待都正确）；外部（如**每轮硬超时**）据此
 * 暂停/恢复自己的计时（见 `withPausableTimeout`）。
 *
 * **为什么需要它**：G-1 裁定等待客户**不设时限**，但每轮 prompt 仍有硬超时（缺省 120s）——
 * 若不做挂起联动，「等你点头」的轮次会被整轮超时杀掉。有了本闸，**客户输入挂起期间该轮时限暂停**，
 * 作答后按**剩余时间**恢复。
 */
export interface InteractionGate {
  /** 进入等待（引用计数 +1；首个进入会通知监听者「暂停」）。 */
  begin(): void;
  /** 离开等待（引用计数 −1；归零时通知监听者「恢复」；多余调用为 no-op）。 */
  end(): void;
  /** 当前是否有交互在等待客户。 */
  isWaiting(): boolean;
  /** 订阅「等待开始/结束」；返回退订函数。 */
  onChange(listener: (waiting: boolean) => void): () => void;
}

/** 构造交互挂起活动闸。 */
export function createInteractionGate(): InteractionGate {
  let depth = 0;
  const listeners = new Set<(waiting: boolean) => void>();
  const notify = (waiting: boolean): void => {
    for (const listener of [...listeners]) listener(waiting);
  };
  return {
    begin(): void {
      depth += 1;
      if (depth === 1) notify(true);
    },
    end(): void {
      if (depth === 0) return;
      depth -= 1;
      if (depth === 0) notify(false);
    },
    isWaiting(): boolean {
      return depth > 0;
    },
    onChange(listener: (waiting: boolean) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * 可暂停的硬超时（设计 G-1）：与 `withTimeout` 同形，但可被 `gate` **暂停/恢复**——
 * 闸「等待中」时**计时停走**（余量保留），闸恢复后按**剩余时间**继续；超出（有效）时限才以
 * `timeoutError(label, timeoutMs)` 拒绝。
 *
 * 语义细节（如实）：
 * - `timeoutMs` 非正/非有限 → **不加超时**（同 `withTimeout`）；
 * - `gate` 缺省 → 等价 `withTimeout`（不可暂停）；
 * - 计时用「已消耗时间从总量扣减」：暂停时刻余量 = 原时限 − 本次运行段已耗时间，恢复后从余量重计；
 * - 超时拒绝后**不取消** `work`（与既有 `withTimeout` 相同：调用方决定后续，如 `session.abort()`）。
 */
export async function withPausableTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  label: string,
  gate?: InteractionGate,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return work;

  let remainingMs = timeoutMs;
  let segmentStartedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let paused = false;
  let rejectDeadline!: (err: Error) => void;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const arm = (): void => {
    if (timer !== undefined) return;
    segmentStartedAt = Date.now();
    timer = setTimeout(() => {
      timer = undefined;
      rejectDeadline(timeoutError(label, timeoutMs));
    }, remainingMs);
  };
  const disarm = (): void => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    remainingMs = Math.max(0, remainingMs - (Date.now() - segmentStartedAt));
  };
  const setPaused = (next: boolean): void => {
    if (next === paused) return;
    if (next) disarm();
    else arm();
    paused = next;
  };

  paused = gate?.isWaiting() === true;
  if (!paused) arm();
  const unsubscribe = gate?.onChange(setPaused);
  try {
    return await Promise.race([work, deadline]);
  } finally {
    unsubscribe?.();
    disarm();
  }
}
