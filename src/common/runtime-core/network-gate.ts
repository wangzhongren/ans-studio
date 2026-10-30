// P2（2026-10-30）：网络状态门与「离线等待恢复窗口」的纯逻辑（无 provider/SDK 依赖，可在纯单测中加载）。
//
// 归属：运行时核心私有辅助（src/common/runtime-core/）。形状契约在 Model（`NetworkState`/`NetworkGate`，
// `src/model/runtime.ts`）——主进程权威、渲染提示、power 提示；本文件只提供可注入的状态门实现、
// 离线窗口守卫与网络失败错误形状，供适配器/桌面/测试复用。
//
// 语义（方案 v1.1 §5.3 / §10 Q4·Q5；团队计划 P2）：
// · 离线时对进行中的请求**安全暂停优先**：调用 P1 `RequestDeadline.pause()`（计时停走，不触发超时），
//   恢复后 `resume()`；**不自动重放**已完成/失败回合（重试属 P3）。
// · 离线持续超过 `networkRetryWindowMs`（缺省 5min，可注入小值）⇒ 本轮 `failed`
//   （errorCode `network-offline-timeout`），如实终态、队列继续——不伪造成功。
// · 锁屏 ≠ 离线：power 事件只做提示/重探，状态永远以主进程 `net.isOnline()` 采样为准。
// · 未注入 `NetworkGate` ⇒ always-online（旧行为零变化；Pi/Codex 不消费本字段）。

import {
  NETWORK_OFFLINE_TIMEOUT,
  type NetworkGate,
  type NetworkState,
} from "../../model/runtime.ts";

/** 离线等待恢复窗口默认值：300000ms（5 分钟；方案 v1.1 Q5）。 */
export const DEFAULT_NETWORK_RETRY_WINDOW_MS = 300_000;

/** 可注入时钟（默认 Date.now；测试用假时钟）。 */
export interface NetworkGateClock {
  now(): number;
}

/** 可写状态门：宿主（主进程 monitor）经 `apply()` 推送权威状态；其余层只读消费 `NetworkGate`。 */
export interface MutableNetworkGate extends NetworkGate {
  apply(state: NetworkState): void;
}

/**
 * 构造状态门。缺省初始状态 online=true（未接网状态前不误判离线）；宿主首采样后 `apply()` 覆盖。
 * **只在 online 变化时**通知监听者（状态去重、不刷屏）；监听者抛错不得影响状态推进。
 */
export function createNetworkGate(options: { now?: () => number; initial?: NetworkState } = {}): MutableNetworkGate {
  const now = options.now ?? Date.now;
  let state: NetworkState = options.initial ?? { online: true, source: "unknown", at: now(), stableForMs: 0, reason: "initial" };
  const listeners = new Set<(state: NetworkState) => void>();
  return {
    current: () => ({ ...state }),
    isOnline: () => state.online,
    onChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    apply(next) {
      const wasOnline = state.online;
      state = { ...next };
      if (wasOnline === state.online) return;
      for (const listener of [...listeners]) {
        try { listener({ ...state }); } catch { /* 观察者异常不得改变执行/状态 */ }
      }
    },
  };
}

/** 离线窗口守卫的计时源（默认 Node timer；测试可注入假时钟）。 */
export interface OfflineWindowClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
const systemClock: OfflineWindowClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface OfflineWindowGuard {
  /** 喂入最新网络状态：offline 起窗（首个离线状态定格起点），online 取消。重复 offline 不重开窗。 */
  update(state: Pick<NetworkState, "online">): void;
  /** 停止计时并释放（幂等）。 */
  dispose(): void;
}

/**
 * 离线等待恢复窗口：离线起点起计时，超窗回调 `onExpire(offlineMs)`；恢复立即取消。
 * `windowMs` 非正/非有限 ⇒ 永不超窗（只暂停，不失败）——宿主应使用默认 5min。
 */
export function createOfflineWindowGuard(options: {
  windowMs: number;
  onExpire(offlineMs: number): void;
  clock?: OfflineWindowClock;
}): OfflineWindowGuard {
  const clock = options.clock ?? systemClock;
  const windowMs = Number.isFinite(options.windowMs) ? Math.floor(options.windowMs) : 0;
  let offlineSince: number | undefined;
  let timer: unknown;
  let disposed = false;
  const clear = (): void => {
    if (timer !== undefined) {
      clock.clearTimeout(timer);
      timer = undefined;
    }
  };
  return {
    update(state) {
      if (disposed) return;
      if (state.online) {
        offlineSince = undefined;
        clear();
        return;
      }
      if (offlineSince !== undefined) return; // 已在离线窗口内：保持首见时刻，不重置
      offlineSince = clock.now();
      if (!(windowMs > 0)) return; // 非正窗口 = 只暂停不失败（宿主配置错误时的保守退路）
      timer = clock.setTimeout(() => {
        timer = undefined;
        if (disposed || offlineSince === undefined) return;
        const offlineMs = Math.max(0, clock.now() - offlineSince);
        offlineSince = undefined;
        options.onExpire(offlineMs);
      }, windowMs);
    },
    dispose() {
      disposed = true;
      offlineSince = undefined;
      clear();
    },
  };
}

/** 网络离线窗口耗尽错误（终态 failed；name 刻意不是 TimeoutError——最后兜底才是 timed_out）。 */
export interface NetworkOfflineFailure extends Error {
  /** `network-offline-timeout`（Model 常量）。 */
  code: string;
  /** 本回合已发起的请求尝试数（P2 恒为 1；P3 重试后递增）。 */
  attempts: number;
  /** 失败时本回合**是否仍可安全重放**（true = 无文本/thinking/工具/客户交互副作用）。 */
  replaySafe: boolean;
  /** 离线持续时长（毫秒，暂停/窗口语义的如实值）。 */
  offlineMs: number;
}

/** 构造网络离线超窗错误；客户可见 summary 由 Service 用人话短报，code 只进 detail/诊断。 */
export function createNetworkOfflineFailure(attempts: number, replaySafe: boolean, offlineMs: number): NetworkOfflineFailure {
  const error = new Error("网络已断开，等待恢复超时，本轮已失败。") as NetworkOfflineFailure;
  error.name = "NetworkOfflineError";
  error.code = NETWORK_OFFLINE_TIMEOUT;
  error.attempts = attempts;
  error.replaySafe = replaySafe;
  error.offlineMs = offlineMs;
  return error;
}

/** 判断是否网络离线超窗错误（只认本模块构造的形状）。 */
export function isNetworkOfflineFailure(error: unknown): error is NetworkOfflineFailure {
  if (!(error instanceof Error) || error.name !== "NetworkOfflineError") return false;
  const candidate = error as Partial<NetworkOfflineFailure>;
  return candidate.code === NETWORK_OFFLINE_TIMEOUT && typeof candidate.offlineMs === "number";
}

/** 是否为网络离线失败 errorCode（桌面/服务识别用；不把其它 errorCode 混入）。 */
export function isNetworkOfflineFailureCode(code: unknown): code is string {
  return code === NETWORK_OFFLINE_TIMEOUT;
}

/** 把任意错误规整为网络失败事实（Service/桌面展示用；非网络失败返回 undefined）。 */
export function networkOfflineFailureFacts(error: unknown): { errorCode: string; attempts: number; replaySafe: boolean; offlineMs: number } | undefined {
  if (!isNetworkOfflineFailure(error)) return undefined;
  return { errorCode: error.code, attempts: error.attempts, replaySafe: error.replaySafe, offlineMs: error.offlineMs };
}

/** 网络离线超窗终态的人话短报（Service `settled.summary`；客户端可见，**不含**技术 code）。 */
export function networkOfflineSummary(): string {
  return "网络已断开，等待恢复超时，本轮已结束。";
}
