// P1（2026-10-30）：请求级首字节/流空闲超时——纯逻辑与可注入计时。
//
// 归属：运行时核心私有辅助（src/common/runtime-core/）。不 import 任何 provider/SDK，
// 可在纯单测中加载；Claude 适配器消费本模块，Pi/Codex 本轮只回归（Q10）。
//
// 语义（方案 v1.1 §4.3.1/§4.3.2；团队计划 P1）：
// · **首字节**：从输入交给模型到收到第一条 SDK 消息（assistant/user/result/system api_retry 任一）
//   的上限，默认 90s；
// · **流空闲**：已有活动后，距上一条 SDK 消息的空闲上限，默认 300s——**不是整轮总时长**；
//   任何 SDK 消息都会重置（含 `system/api_retry`），正常长回合不被误杀；
// · **暂停**：客户交互等待、工具执行、abort 清理期间计时停走，恢复后按剩余时间继续（引用计数，
//   可嵌套）；网络暂停由 P2 通过同一 `pause()/resume()` 中性接口接线（本批不接线）。
//
// 终态（§4.3.4）：请求超时是 **failed** + 明确 errorCode（`request-timeout-first-byte` /
// `request-timeout-idle`），不是 `timed_out`；`timed_out` 只保留给 1h 最后兜底。
// `turnLastResortMs`/`promptTimeoutMs`/`DEFAULT_TURN_ABORT_MS` 语义均不变。

import {
  MODEL_REQUEST_RETRY_EXHAUSTED,
  REQUEST_TIMEOUT_ERROR_CODES,
  type RequestTimeoutKind,
} from "../../model/runtime.ts";

/** 请求首字节时限默认值：90000ms（90s；方案 v1.1 Q1）。 */
export const DEFAULT_REQUEST_FIRST_BYTE_TIMEOUT_MS = 90_000;
/** 请求流空闲时限默认值：300000ms（300s；方案 v1.1 Q1）。 */
export const DEFAULT_REQUEST_IDLE_TIMEOUT_MS = 300_000;

/** 测试/宿主可注入的计时源（默认 Date.now + Node timer）。 */
export interface RequestDeadlineClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
const systemClock: RequestDeadlineClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** 请求失败（请求级超时）：错误形状固定，终态由 Service 归为 failed（name 刻意不是 TimeoutError）。 */
export interface RequestTimeoutFailure extends Error {
  /** `request-timeout-first-byte` / `request-timeout-idle`（见模型常量）。 */
  code: string;
  timeoutKind: RequestTimeoutKind;
  /** 触发本次超时的时限值（毫秒）。 */
  timeoutMs: number;
  /** 本阶段有效计时（暂停不计）已消耗的毫秒数。 */
  elapsedMs: number;
  /** 本回合已发起的请求尝试数（P1 恒为 1；P3 重试后递增，最多 3）。 */
  attempts: number;
  /** 失败时本回合**是否仍可安全重放**（true = 无文本/thinking/工具/客户交互副作用）。 */
  replaySafe: boolean;
}

/** 构造请求级超时错误；`name` 使用 `RequestTimeoutError`，避免被 Service 误判为最后兜底 `timed_out`。 */
export function createRequestTimeoutFailure(
  kind: RequestTimeoutKind,
  timeoutMs: number,
  elapsedMs: number,
  attempts: number,
  replaySafe: boolean,
): RequestTimeoutFailure {
  const phase = kind === "first-byte" ? "首字节" : "流空闲";
  const error = new Error(`请求${phase}超时（${timeoutMs}ms）：模型请求未在时限内产生预期活动，本轮已失败。`) as RequestTimeoutFailure;
  error.name = "RequestTimeoutError";
  error.code = REQUEST_TIMEOUT_ERROR_CODES[kind];
  error.timeoutKind = kind;
  error.timeoutMs = timeoutMs;
  error.elapsedMs = elapsedMs;
  error.attempts = attempts;
  error.replaySafe = replaySafe;
  return error;
}

/** 判断是否请求级超时错误（只认本模块构造的形状，避免误伤 SDK 自带超时）。 */
export function isRequestTimeoutFailure(error: unknown): error is RequestTimeoutFailure {
  if (!(error instanceof Error) || error.name !== "RequestTimeoutError") return false;
  const candidate = error as Partial<RequestTimeoutFailure>;
  return typeof candidate.code === "string" && (candidate.timeoutKind === "first-byte" || candidate.timeoutKind === "idle");
}

/** 把任意错误规整为请求失败事实（Service/桌面展示用；非请求超时返回 undefined）。 */
export function requestTimeoutFailureFacts(error: unknown): { errorCode: string; attempts: number; replaySafe: boolean; timeoutKind: RequestTimeoutKind } | undefined {
  if (!isRequestTimeoutFailure(error)) return undefined;
  return { errorCode: error.code, attempts: error.attempts, replaySafe: error.replaySafe, timeoutKind: error.timeoutKind };
}

/** 请求超时终态的人话短报（Service `settled.summary`；客户端可见，**不含**技术 code）。 */
export function requestTimeoutSummary(kind: RequestTimeoutKind): string {
  return kind === "first-byte" ? "本轮请求超时（首字节未返回）" : "本轮请求超时（响应空闲超时）";
}

/** 是否为已知的请求失败 errorCode（`request-timeout-*`、`MODEL_REQUEST_FAILED` 或 P3 重试耗尽 `MODEL_REQUEST_RETRY_EXHAUSTED`）。 */
export function isRequestFailureCode(code: unknown): code is string {
  return typeof code === "string" && (code === REQUEST_TIMEOUT_ERROR_CODES["first-byte"] || code === REQUEST_TIMEOUT_ERROR_CODES.idle || code === "MODEL_REQUEST_FAILED" || code === MODEL_REQUEST_RETRY_EXHAUSTED);
}

export interface RequestDeadline {
  /** 开始计时（首字节阶段）。可先 `pause()` 再 `start()`（交互闸已处于等待时）。 */
  start(): void;
  /**
   * 记录一条 SDK 消息。返回 true **恰一次**：该消息是本请求首条消息（首字节到达）。
   * 首字节到达后切入空闲计时；后续每条消息都重置空闲计时。
   */
  activity(): boolean;
  /** 暂停计时（引用计数；客户交互/工具执行/abort 清理/P2 网络暂停共用）。 */
  pause(): void;
  /** 恢复计时（按剩余时间继续）。 */
  resume(): void;
  /** 停止计时并释放监听/定时器（幂等）。 */
  stop(): void;
  readonly firstByteSeen: boolean;
  /** 首字节到达时的有效耗时（暂停不计）；未到达为 undefined。 */
  readonly firstByteElapsedMs: number | undefined;
  readonly paused: boolean;
}

export interface RequestDeadlineOptions {
  firstByteTimeoutMs: number;
  idleTimeoutMs: number;
  /** 超时回调：kind / 该阶段时限 / 有效耗时（暂停不计）。 */
  onTimeout(kind: RequestTimeoutKind, timeoutMs: number, elapsedMs: number): void;
  /** 测试注入；缺省真实时钟。 */
  clock?: RequestDeadlineClock;
}

const positive = (value: number): number => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/**
 * 可暂停的请求级 deadline：首字节 → 流空闲两阶段。
 * 有效计时只累计「未暂停」时间；暂停时保留剩余量，恢复后从剩余量继续（同 `withPausableTimeout` 语义）。
 */
export function createRequestDeadline(options: RequestDeadlineOptions): RequestDeadline {
  const clock = options.clock ?? systemClock;
  const firstLimit = positive(options.firstByteTimeoutMs);
  const idleLimit = positive(options.idleTimeoutMs);
  const now = () => clock.now();

  let phase: RequestTimeoutKind = "first-byte";
  let started = false;
  let stopped = false;
  let pauseDepth = 0;
  let timer: unknown;
  let remainingMs = 0; // 当前阶段剩余有效时间
  let deadlineAt = 0; // 已武装时：绝对到期时刻（仅未暂停时有意义）
  let limitForPhase = 0;
  let elapsedActive = 0; // 已累计的有效活动时间
  let activeSince: number | undefined; // 当前未暂停段的起点；undefined = 暂停中
  let firstByteSeen = false;
  let firstByteElapsedMs: number | undefined;

  const activeElapsed = (): number => elapsedActive + (activeSince !== undefined ? Math.max(0, now() - activeSince) : 0);
  const clearTimer = (): void => {
    if (timer !== undefined) {
      clock.clearTimeout(timer);
      timer = undefined;
    }
  };
  const arm = (ms: number): void => {
    clearTimer();
    remainingMs = Math.max(0, ms);
    if (remainingMs <= 0 || pauseDepth > 0) return;
    deadlineAt = now() + remainingMs;
    timer = clock.setTimeout(fire, remainingMs);
  };
  const fire = (): void => {
    timer = undefined;
    if (stopped || pauseDepth > 0) return;
    const elapsed = activeElapsed();
    options.onTimeout(phase, limitForPhase, elapsed);
  };
  const enterIdle = (): void => {
    phase = "idle";
    limitForPhase = idleLimit;
    if (idleLimit > 0) arm(idleLimit);
    else clearTimer();
  };

  return {
    start() {
      if (started || stopped) return;
      started = true;
      if (pauseDepth === 0) activeSince = now();
      if (firstLimit > 0) {
        phase = "first-byte";
        limitForPhase = firstLimit;
        arm(firstLimit);
      }
    },
    activity() {
      if (!started || stopped) return false;
      if (!firstByteSeen) {
        firstByteSeen = true;
        firstByteElapsedMs = activeElapsed();
        enterIdle();
        return true;
      }
      if (phase === "idle" && idleLimit > 0) arm(idleLimit);
      return false;
    },
    pause() {
      if (stopped) return;
      if (pauseDepth === 0) {
        if (timer !== undefined) remainingMs = Math.max(0, deadlineAt - now());
        clearTimer();
        elapsedActive = activeElapsed();
        activeSince = undefined;
      }
      pauseDepth += 1;
    },
    resume() {
      if (stopped || pauseDepth === 0) return;
      pauseDepth -= 1;
      if (pauseDepth === 0) {
        activeSince = now();
        const enabled = phase === "first-byte" ? firstLimit > 0 : idleLimit > 0;
        if (started && enabled && remainingMs > 0) arm(remainingMs);
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimer();
    },
    get firstByteSeen() {
      return firstByteSeen;
    },
    get firstByteElapsedMs() {
      return firstByteElapsedMs;
    },
    get paused() {
      return pauseDepth > 0;
    },
  };
}
