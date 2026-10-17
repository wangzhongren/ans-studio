import type { InteractionGate, RuntimeKind } from "../../model/runtime.ts";
// 时限工具（契约 §4 修复：构造/交互/命令不得无限期挂起）。
//
// 归属：运行时核心私有辅助（src/common/runtime-core/）。
// 不 import 任何 Pi 包，可在纯单测中加载。
//
// 两层整轮时限（客户裁定 2026-10-17）：
// · **到点检查**（`promptTimeoutMs`／`ANS_PI_PROMPT_TIMEOUT_MS`，历史字段名）——只供看护到点检查，
//   **不中止整轮**；本文件不再把它交给整轮 abort 路径。
// · **最后兜底**（`DEFAULT_TURN_LAST_RESORT_MS`＝1 小时，固定、无 env）——唯一的自动整轮上限。
// 其余时限（shell 命令 10 分钟、审核/确认 120 秒、构造 120 秒）保持不变。
//
// 设计：用工厂函数产出带标记的 Error（避免自定义 class 的字段擦除歧义），
// 并提供 withTimeout 与从环境变量读取时限的工具。

/**
 * **到点检查时限**默认值：300000ms（5 分钟；历史字段名 prompt；客户裁定 2026-10-17，PM 确认系统默认 5 分钟）。
 *
 * 语义已改为「看护到点检查」：到点**不中止整轮**，只供看护向 su 发一条「轮次到点检查」，
 * 由 su 核对是否卡死（仍在推进 → 不动作；卡死 → `propose_recovery` 提议）。
 * 适配器/服务运行时**不得**再用本值作为整轮 abort 时限；整轮上限见 `DEFAULT_TURN_LAST_RESORT_MS`。
 */
export const DEFAULT_PROMPT_TIMEOUT_MS = 300000;
/**
 * **整轮最后兜底**：3600000ms（1 小时）——唯一的自动整轮上限（客户裁定 2026-10-17）。
 *
 * **固定值，不暴露 env**；测试可经 `turnLastResortMs` 注入小值。按**有效运行时间**计
 * （确认卡挂起期间暂停，语义沿 `InteractionGate` / `withPausableTimeout`）；到点才中止整轮。
 * 错误 label 固定为「本轮最后兜底」，与「到点检查」明确区分。
 */
export const DEFAULT_TURN_LAST_RESORT_MS = 3600000;
/** 默认构造期单步时限：与检查时限同量级，避免构造阶段无声挂起。 */
export const DEFAULT_CONSTRUCT_TIMEOUT_MS = 120000;
/**
 * 默认 shell 审核时限：120000ms。审核（含 §7.3 的 b 问 pm、a 问操作者）用**超时包装**，
 * **超时 = 拒绝**（设计 §7.5 第 2 条）——绝不让「审核没回」变成「放行」。
 */
export const DEFAULT_SHELL_REVIEW_TIMEOUT_MS = 120000;
/**
 * 默认**命令级执行时限**（F-1，2026-10-16 客户批准）：600000ms（10 分钟）。
 *
 * 与「审核时限」是两把尺子：审核时限量的是「审核没回」（超时 = 拒绝，绝不放行），
 * 本时限量的是 **spawn 之后命令自身的运行时长**——到期经共享 `terminate()` 终止命令，
 * 工具以「超时已终止（N ms）」如实返回，**轮次继续**（区别于「停止本轮」的 ABORTED 整轮语义）。
 *
 * 默认值取舍（客户已批准 600000）：覆盖常见 `npm test`/构建时长上限；无人值守挂起最多兜底
 * 10 分钟（相对「无任何时限」是量级改善）。更长的合法任务用 `ANS_PI_SHELL_EXEC_TIMEOUT_MS`
 * 或 `GovernedToolsOptions.shellExecTimeoutMs` 显式调大。**不可禁用**：0/负数/非法一律回退默认
 * （readTimeoutMs 语义）——P0「挂起命令使角色停摆」的意义就是永远有一条命令级兜底。
 */
export const DEFAULT_SHELL_EXEC_TIMEOUT_MS = 600000;
/** 命令级执行时限环境变量（命名对齐既有 `ANS_PI_SHELL_REVIEW_TIMEOUT_MS`）。 */
export const SHELL_EXEC_TIMEOUT_ENV = "ANS_PI_SHELL_EXEC_TIMEOUT_MS";
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

/** 到点检查时限环境变量（历史键名；客户裁定后不再作为整轮 abort 时限）。 */
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
 * 解析一次有效时限（Provider composition 时调用）：
 * - `promptTimeoutMs`：**到点检查时限**（历史字段名；客户裁定 2026-10-17 起不用于 abort）。
 *   显式 option 以 `??` 优先；未给时**所有运行时**（Pi/Claude/Codex）都读同一
 *   `ANS_PI_PROMPT_TIMEOUT_MS`（历史键名），缺省 `DEFAULT_PROMPT_TIMEOUT_MS`（300000＝5 分钟）。
 * - `turnLastResortMs`：**整轮最后兜底**（默认 1 小时，固定、无 env；可显式 option 覆盖供测试注入）。
 * - `constructTimeoutMs`：构造期单步时限（120 秒；Pi 读 `ANS_PI_CONSTRUCT_TIMEOUT_MS`）。
 */
export function resolveRuntimeTimeouts(
  runtime: RuntimeKind,
  options: { promptTimeoutMs?: number; turnLastResortMs?: number; constructTimeoutMs?: number },
  env: Record<string, string | undefined> = process.env,
): { promptTimeoutMs: number; turnLastResortMs: number; constructTimeoutMs: number } {
  return {
    promptTimeoutMs: options.promptTimeoutMs ?? readTimeoutMs(env, PROMPT_TIMEOUT_ENV, DEFAULT_PROMPT_TIMEOUT_MS),
    turnLastResortMs: options.turnLastResortMs ?? DEFAULT_TURN_LAST_RESORT_MS,
    constructTimeoutMs: options.constructTimeoutMs ?? (runtime === "pi" ? readTimeoutMs(env, CONSTRUCT_TIMEOUT_ENV, DEFAULT_CONSTRUCT_TIMEOUT_MS) : DEFAULT_CONSTRUCT_TIMEOUT_MS),
  };
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
 * 立即以 fail-closed 结果返回；迟到回执不会恢复当前 await。底层能力自身的副作用仍由其属主负责。
 */
export async function raceAbort<T>(work: Promise<T>, signal: AbortSignal | undefined, label: string): Promise<T> {
  if (signal === undefined) return work;
  if (signal.aborted) {
    // The already-created work may reject after cancellation; retain a rejection observer.
    void work.catch(() => {});
    throw abortError(label);
  }
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
 * **为什么需要它**：G-1 裁定等待客户**不设时限**；整轮另有**最后兜底**（缺省 1 小时，客户裁定
 * 2026-10-17）——若不做挂起联动，「等你点头」的轮次会被兜底杀掉。有了本闸，**客户输入挂起期间
 * 该轮兜底暂停**，作答后按**剩余时间**恢复；等待 2 小时也不会触发 1 小时兜底。
 */

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
