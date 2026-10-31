// P2（2026-10-30）：主进程网络监听（Electron `net.isOnline` 权威 + 渲染提示 + powerMonitor 提示）。
//
// 归属：桌面窗口（Interface 主进程侧纯逻辑）。本文件不 import Electron——`probe`（net.isOnline）与
// 事件源（powerMonitor/渲染 IPC）由 `app/main.ts` 注入，便于纯单测。
//
// 语义（方案 v1.1 §5.3.1 / §10 Q4·Q5；团队计划 P2）：
// · 主进程 `net.isOnline()` **初始 + 5s 采样**（仅状态，不逐请求轮询）；`NetworkState` 经 Model 契约外推。
// · **防抖**：连续 2 次离线采样或 1s 稳定窗口才判离线（1 次瞬时抖动不判离线）；
//   恢复**立即**（1 个在线采样/探针）生效。默认值可注入小值测试。
// · **渲染层 online/offline 是提示**：只触发一次重探；`net.isOnline()` 可纠正渲染误报
//   （渲染说离线但接口在线 ⇒ 维持在线；渲染说在线但接口离线 ⇒ 按采样判定）。
// · **powerMonitor suspend/resume/lock/unlock 只作提示/重探**：**锁屏 ≠ 离线**——锁屏/解锁绝不
//   直接置离线，只重探 `net.isOnline()`。
// · 状态去重、只在变化时外推（`onState` 仅 online 变化触发；诊断 `network.*` 只用既有白名单字段）。

import type { DiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
import { createNetworkGate, type MutableNetworkGate } from "../../src/common/runtime-core/network-gate.ts";
import type { NetworkGate, NetworkState, NetworkStateReason, NetworkStateSource } from "../../src/model/runtime.ts";

/** 采样间隔默认 5000ms（方案 v1.1 §5.3.1）。 */
export const DEFAULT_NETWORK_SAMPLE_INTERVAL_MS = 5_000;
/** 连续离线采样确认阈值（默认 2 次）。 */
export const DEFAULT_NETWORK_OFFLINE_SAMPLE_COUNT = 2;
/** 离线稳定窗口（默认 1000ms；窗口内重探仍离线即判定）。 */
export const DEFAULT_NETWORK_OFFLINE_STABLE_WINDOW_MS = 1_000;

/** 可注入计时源（默认 Date.now + Node timer；测试用假时钟）。 */
export interface NetworkMonitorClock {
  now(): number;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
const systemClock: NetworkMonitorClock = {
  now: () => Date.now(),
  setInterval: (callback, ms) => {
    const handle = setInterval(callback, ms);
    (handle as { unref?: () => void }).unref?.();
    return handle;
  },
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** powerMonitor 提示事件（只提示/重探；不直接判离线）。 */
export type NetworkPowerEvent = "suspend" | "resume" | "lock" | "unlock";

export interface NetworkMonitorOptions {
  /** 权威探针（主进程注入 `net.isOnline()`；纯单测注入桩件）。 */
  probe: () => boolean;
  sampleIntervalMs?: number;
  offlineSampleCount?: number;
  offlineStableWindowMs?: number;
  clock?: NetworkMonitorClock;
  diagnostics?: DiagnosticLogger;
  /** 状态变化外推（只在 online 变化时；主进程据此推进渲染侧/会话队列）。 */
  onState?: (state: NetworkState) => void;
}

export interface NetworkMonitor {
  /** Model 契约状态门（供适配器/Service 消费；主进程 `apply()` 后只读）。 */
  readonly gate: NetworkGate;
  start(): void;
  stop(): void;
  current(): NetworkState;
  /**
   * 渲染层 online/offline 提示：**只触发一次重探**，由 `net.isOnline()` 决定最终状态
   * （主进程可纠正渲染层误报）。返回重探后的状态。
   */
  noteRendererState(online: boolean): NetworkState;
  /** powerMonitor 事件：只记录提示并重探；锁屏/解锁不改变在线判定。 */
  notePower(event: NetworkPowerEvent): void;
  /** 立即重探（渲染提示/power 事件/测试；`source` 记录本次探针来源）。 */
  probeNow(reason?: NetworkStateReason, source?: NetworkStateSource): NetworkState;
}

interface Cause {
  reason: NetworkStateReason;
  source: NetworkStateSource;
}

/**
 * 构造网络监听。`start()` 前为保守在线占位（不误判离线）；`start()` 的**首采样**立即定初始状态。
 * 状态只在 online 变化时经 `gate.apply()` + `onState` 外推；监听异常不得改变状态推进。
 */
export function createNetworkMonitor(options: NetworkMonitorOptions): NetworkMonitor {
  const clock = options.clock ?? systemClock;
  const sampleIntervalMs = positiveOr(options.sampleIntervalMs, DEFAULT_NETWORK_SAMPLE_INTERVAL_MS);
  const offlineSampleCount = Math.max(1, Math.floor(positiveOr(options.offlineSampleCount, DEFAULT_NETWORK_OFFLINE_SAMPLE_COUNT)));
  const offlineStableWindowMs = positiveOr(options.offlineStableWindowMs, DEFAULT_NETWORK_OFFLINE_STABLE_WINDOW_MS);
  const gate: MutableNetworkGate = createNetworkGate({ now: () => clock.now() });
  let state: NetworkState = { online: true, source: "unknown", at: clock.now(), stableForMs: 0, reason: "initial" };
  let started = false;
  let stopped = false;
  let intervalHandle: unknown;
  let stableHandle: unknown;
  let offlineSamples = 0;
  let pendingSince: number | undefined;
  let pendingCause: Cause | undefined;

  const diagnostic = (event: string, fields: Record<string, unknown>): void => {
    try { options.diagnostics?.record(event, fields); } catch { /* 诊断绝不能改变执行 */ }
  };
  const resetPending = (): void => {
    offlineSamples = 0;
    pendingSince = undefined;
    pendingCause = undefined;
    if (stableHandle !== undefined) {
      clock.clearTimeout(stableHandle);
      stableHandle = undefined;
    }
  };
  const transition = (next: NetworkState): void => {
    const wasOnline = state.online;
    state = next;
    gate.apply(next);
    diagnostic("network.state", {
      state: next.online ? "online" : "offline",
      mode: next.source,
      reasonCode: next.reason ?? "probe",
      durationMs: Math.max(0, Math.round(next.stableForMs)),
    });
    if (wasOnline !== next.online) {
      try { options.onState?.({ ...next }); } catch { /* 观察者异常不得改变状态推进 */ }
    }
  };
  const confirmOffline = (cause: Cause, stableForMs: number): void => {
    resetPending();
    transition({
      online: false,
      source: cause.source,
      at: clock.now(),
      stableForMs: Math.max(0, Math.round(stableForMs)),
      reason: cause.reason === "renderer-offline" ? "renderer-offline" : cause.reason === "initial" ? "initial" : "interface-down",
    });
  };
  /** 一次采样/探针结果进入状态机。 */
  const evaluate = (online: boolean, cause: Cause): void => {
    const at = clock.now();
    if (online) {
      const wasOffline = !state.online;
      resetPending();
      if (wasOffline) {
        transition({
          online: true,
          source: cause.source,
          at,
          stableForMs: 0,
          reason: cause.reason === "resume" ? "resume" : "probe",
        });
      } else {
        // 状态未变：仅更新来源/时刻（不外推、不刷屏）；保持 gate 引用同一事实。
        state = { ...state, source: cause.source, at, stableForMs: Math.max(0, at - state.at) };
      }
      return;
    }
    if (!state.online) return; // 已离线：保持首个离线切换点（stableForMs 不随采样增长）
    offlineSamples += 1;
    if (pendingSince === undefined) {
      pendingSince = at;
      pendingCause = cause;
      // 1s 稳定窗口：窗口到点再探一次；仍离线 ⇒ 判离线（不等下一次 5s 采样）。
      if (offlineStableWindowMs > 0) {
        stableHandle = clock.setTimeout(() => {
          stableHandle = undefined;
          if (stopped || pendingSince === undefined) return;
          const stillOnline = safeProbe(options.probe);
          if (stillOnline === undefined) return; // 探针异常：保持已知状态与待定采样，不迁移
          if (!stillOnline) {
            const since = pendingSince;
            const pending = pendingCause ?? cause;
            confirmOffline(pending, clock.now() - since);
          } else {
            // 抖动：窗口内恢复 ⇒ 维持在线（不判离线）。
            evaluate(true, { reason: "probe", source: "main-net" });
          }
        }, offlineStableWindowMs);
      }
    }
    if (offlineSamples >= offlineSampleCount && pendingSince !== undefined) {
      confirmOffline(pendingCause ?? cause, at - pendingSince);
    }
  };

  const monitor: NetworkMonitor = {
    gate,
    start() {
      if (started || stopped) return;
      started = true;
      const at = clock.now();
      const online = safeProbe(options.probe);
      if (online === undefined) {
        // 首采样探针异常：保持保守在线占位（unknown）——**不产生状态迁移/onState**；
        // 后续成功采样可纠正。绝不在异常路径上把未知/离线切换成在线。
      } else if (online) {
        state = { online: true, source: "main-net", at, stableForMs: 0, reason: "initial" };
        gate.apply(state);
      } else {
        // 启动首采样即离线：不经历抖动窗口（此前没有“已知在线”状态可抖）。
        state = { online: false, source: "main-net", at, stableForMs: 0, reason: "initial" };
        gate.apply(state);
        diagnostic("network.state", { state: "offline", mode: "main-net", reasonCode: "initial", durationMs: 0 });
        try { options.onState?.({ ...state }); } catch { /* 观察者异常不得改变状态推进 */ }
      }
      intervalHandle = clock.setInterval(() => {
        if (stopped) return;
        const sampled = safeProbe(options.probe);
        if (sampled !== undefined) evaluate(sampled, { reason: "probe", source: "main-net" });
      }, sampleIntervalMs);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      started = false;
      resetPending();
      if (intervalHandle !== undefined) {
        clock.clearInterval(intervalHandle);
        intervalHandle = undefined;
      }
    },
    current: () => ({ ...state }),
    noteRendererState(online: boolean) {
      diagnostic("network.hint", { state: online ? "online" : "offline", mode: "renderer" });
      return monitor.probeNow(online ? "probe" : "renderer-offline", "renderer");
    },
    notePower(event: NetworkPowerEvent) {
      diagnostic("network.power", { state: event, mode: "power" });
      // 锁屏/解锁/挂起/恢复一律只重探；**锁屏 ≠ 离线**——离线只由 net.isOnline 采样决定。
      monitor.probeNow(event === "resume" ? "resume" : "probe", "power");
    },
    probeNow(reason: NetworkStateReason = "probe", source: NetworkStateSource = "main-net") {
      const online = safeProbe(options.probe);
      // 探针异常（undefined）⇒ 保持已知状态：不迁移、不外推、不放行队列、不恢复请求计时。
      if (online !== undefined) evaluate(online, { reason, source });
      return { ...state };
    },
  };
  return monitor;
}

function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * 探针结果：`true` 在线 / `false` 离线 / `undefined` **未知**（探针抛错）。
 * 未知时调用方**保持已知状态**、不触发任何迁移/onState——绝不在异常路径上把离线当在线。
 */
function safeProbe(probe: () => boolean): boolean | undefined {
  try { return probe() === true; } catch { return undefined; }
}
