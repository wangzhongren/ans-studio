// test/桌面应用/network-monitor.test.ts
// P2（2026-10-30，Delta-TR-2 精确授权；团队计划 §3.4 P2）：主进程网络监听纯逻辑——
//  - 首采样定初始状态（在线/离线）；5s 采样；
//  - 防抖：1 次瞬时抖动不判离线；连续 2 次离线采样或 1s 稳定窗口才判离线；恢复立即；
//  - 渲染 online/offline 只是提示（只触发重探，主进程 net.isOnline 可纠正误报）；
//  - powerMonitor suspend/resume/lock/unlock 只提示/重探——**锁屏 ≠ 离线**；
//  - 诊断 network.state/network.power/network.hint 仅用既有白名单字段（state/mode/reasonCode/durationMs）。

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_NETWORK_OFFLINE_SAMPLE_COUNT,
  DEFAULT_NETWORK_OFFLINE_STABLE_WINDOW_MS,
  DEFAULT_NETWORK_SAMPLE_INTERVAL_MS,
  createNetworkMonitor,
  type NetworkMonitorClock,
} from "../../app/desktop/network-monitor.ts";
import type { NetworkState } from "../../src/model/runtime.ts";
import type { DiagnosticLogger } from "../../src/common/shared/diagnostics.ts";

/** 可推进的假时钟（支持 interval；advance 依次触发到期计时器）。 */
function fakeClock(): NetworkMonitorClock & { advance(ms: number): void; pending(): number } {
  let now = 0;
  let seq = 1;
  const timers = new Map<number, { at: number; callback: () => void; every?: number }>();
  return {
    now: () => now,
    setInterval(callback, ms) {
      const id = seq++;
      timers.set(id, { at: now + ms, callback, every: ms });
      return id;
    },
    clearInterval(handle) {
      timers.delete(handle as number);
    },
    setTimeout(callback, ms) {
      const id = seq++;
      timers.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimeout(handle) {
      timers.delete(handle as number);
    },
    advance(ms) {
      now += ms;
      for (let guard = 0; guard < 1000; guard += 1) {
        const due = [...timers].filter(([, timer]) => timer.at <= now);
        if (due.length === 0) return;
        for (const [id, timer] of due) {
          if (timer.every !== undefined) {
            timer.at = now + timer.every;
            timer.callback();
          } else {
            timers.delete(id);
            timer.callback();
          }
        }
      }
    },
    pending: () => timers.size,
  };
}

interface DiagRecord { event: string; [key: string]: unknown }
function fakeDiagnostics(): { logger: DiagnosticLogger; records: DiagRecord[] } {
  const records: DiagRecord[] = [];
  return {
    records,
    logger: {
      record: (event, fields) => { records.push({ event, ...(fields ?? {}) }); },
      error: (event, _error, fields) => { records.push({ event, ...(fields ?? {}) }); },
    },
  };
}

const DIAG_WHITELIST = new Set(["state", "mode", "reasonCode", "durationMs"]);

test("默认值：5s 采样 / 连续 2 次离线 / 1s 稳定窗口；首采样定初始状态（在线不外推、离线外推一次）", () => {
  assert.equal(DEFAULT_NETWORK_SAMPLE_INTERVAL_MS, 5_000);
  assert.equal(DEFAULT_NETWORK_OFFLINE_SAMPLE_COUNT, 2);
  assert.equal(DEFAULT_NETWORK_OFFLINE_STABLE_WINDOW_MS, 1_000);

  const onlineClock = fakeClock();
  const onlineStates: NetworkState[] = [];
  let onlineProbe = true;
  const online = createNetworkMonitor({ probe: () => onlineProbe, clock: onlineClock, onState: (s) => onlineStates.push(s) });
  online.start();
  assert.deepEqual(online.current(), { online: true, source: "main-net", at: 0, stableForMs: 0, reason: "initial" });
  assert.equal(onlineStates.length, 0, "初始在线不产生状态切换外推");
  assert.equal(online.gate.isOnline(), true);
  onlineClock.advance(5_000);
  assert.equal(onlineStates.length, 0, "持续在线不外推/不刷屏");
  online.stop();
  onlineProbe = false;
  onlineClock.advance(60_000);
  assert.equal(onlineStates.length, 0, "stop 后不再采样");

  const offlineClock = fakeClock();
  const offlineStates: NetworkState[] = [];
  const offline = createNetworkMonitor({ probe: () => false, clock: offlineClock, onState: (s) => offlineStates.push(s) });
  offline.start();
  assert.equal(offline.current().online, false);
  assert.equal(offline.current().reason, "initial", "启动首采样即离线：原因如实 initial");
  assert.equal(offline.gate.isOnline(), false, "状态门同步离线（适配器可立即暂停）");
  assert.equal(offlineStates.length, 1);
  offline.stop();
});

test("稳定窗口：2s 采样、1s 窗口 —— 首次离线采样不判离线；窗口到点重探仍离线才判（reason interface-down）", () => {
  const clock = fakeClock();
  const states: NetworkState[] = [];
  let online = true;
  const monitor = createNetworkMonitor({
    probe: () => online,
    clock,
    sampleIntervalMs: 2_000,
    offlineStableWindowMs: 1_000,
    onState: (s) => states.push(s),
  });
  monitor.start();
  online = false;
  clock.advance(2_000); // 第一次离线采样（不判离线）
  assert.equal(monitor.current().online, true, "一次采样不判离线");
  assert.equal(states.length, 0);
  clock.advance(999);
  assert.equal(monitor.current().online, true, "稳定窗口未到");
  clock.advance(1); // 窗口到点重探，仍离线
  assert.equal(monitor.current().online, false);
  assert.equal(monitor.current().reason, "interface-down");
  assert.equal(monitor.current().source, "main-net");
  assert.equal(monitor.current().stableForMs, 1_000, "稳定窗口时长如实");
  assert.equal(states.length, 1);
  assert.equal(monitor.gate.isOnline(), false);
  monitor.stop();
});

test("连续 2 次采样：稳定窗口调长时，第二次离线采样判离线；1 次瞬时抖动被恢复抹掉", () => {
  const clock = fakeClock();
  const states: NetworkState[] = [];
  let online = true;
  const monitor = createNetworkMonitor({
    probe: () => online,
    clock,
    sampleIntervalMs: 1_000,
    offlineStableWindowMs: 60_000,
    offlineSampleCount: 2,
    onState: (s) => states.push(s),
  });
  monitor.start();
  online = false;
  clock.advance(1_000); // 第 1 次离线采样
  assert.equal(monitor.current().online, true);
  online = true;
  clock.advance(1_000); // 抖动恢复：不判离线
  assert.equal(monitor.current().online, true, "1 次瞬时抖动不判离线");
  online = false;
  clock.advance(1_000); // 新的一次离线采样（计数从 0 重来）
  assert.equal(monitor.current().online, true);
  clock.advance(1_000); // 连续第 2 次
  assert.equal(monitor.current().online, false, "连续 2 次离线采样判离线");
  assert.equal(states.length, 1);
  assert.equal(states[0]!.online, false);
  monitor.stop();
});

test("恢复立即：一个在线采样即恢复；状态门同步；reason=probe", () => {
  const clock = fakeClock();
  const states: NetworkState[] = [];
  let online = true;
  const monitor = createNetworkMonitor({ probe: () => online, clock, sampleIntervalMs: 1_000, offlineStableWindowMs: 500, onState: (s) => states.push(s) });
  monitor.start();
  online = false;
  clock.advance(1_000); // 第 1 次离线采样
  clock.advance(500); // 稳定窗口 → 离线
  assert.equal(monitor.current().online, false);
  online = true;
  clock.advance(1_000); // 下一次采样 → 立即恢复
  assert.equal(monitor.current().online, true);
  assert.equal(monitor.current().reason, "probe");
  assert.equal(monitor.gate.isOnline(), true);
  assert.deepEqual(states.map((s) => s.online), [false, true]);
  monitor.stop();
});

test("渲染层提示：只触发重探（两次离线提示=两次采样判离线）；渲染在线不能纠正接口离线", () => {
  const clock = fakeClock();
  const diag = fakeDiagnostics();
  const states: NetworkState[] = [];
  let online = true;
  const monitor = createNetworkMonitor({
    probe: () => online,
    clock,
    sampleIntervalMs: 60_000,
    offlineStableWindowMs: 60_000,
    offlineSampleCount: 2,
    diagnostics: diag.logger,
    onState: (s) => states.push(s),
  });
  monitor.start();
  online = false;
  monitor.noteRendererState(false); // 第 1 次重探：仍在线
  assert.equal(monitor.current().online, true);
  monitor.noteRendererState(false); // 第 2 次重探：判离线
  assert.equal(monitor.current().online, false);
  assert.equal(states[0]!.reason, "renderer-offline", "原因如实记录来自渲染提示");
  assert.equal(states[0]!.source, "renderer");

  // 主进程可纠正渲染层误报：渲染说在线但接口离线 ⇒ 仍离线。
  online = false;
  monitor.noteRendererState(true);
  assert.equal(monitor.current().online, false, "net.isOnline 权威，不被渲染提示带偏");
  // 渲染离线提示但接口在线 ⇒ 维持在线。
  const clock2 = fakeClock();
  const states2: NetworkState[] = [];
  let online2 = true;
  const monitor2 = createNetworkMonitor({ probe: () => online2, clock: clock2, sampleIntervalMs: 60_000, offlineStableWindowMs: 60_000, onState: (s) => states2.push(s) });
  monitor2.start();
  monitor2.noteRendererState(false);
  assert.equal(monitor2.current().online, true, "渲染误报离线被 net.isOnline 纠正");
  assert.equal(states2.length, 0);
  assert.ok(diag.records.some((record) => record.event === "network.hint" && record.state === "offline" && record.mode === "renderer"));
  monitor.stop();
  monitor2.stop();
});

test("power：锁屏 ≠ 离线；suspend/resume 只重探；解锁不强制离线", () => {
  const clock = fakeClock();
  const diag = fakeDiagnostics();
  const states: NetworkState[] = [];
  let online = true;
  let probes = 0;
  const monitor = createNetworkMonitor({
    probe: () => { probes += 1; return online; },
    clock,
    sampleIntervalMs: 60_000,
    offlineStableWindowMs: 60_000,
    diagnostics: diag.logger,
    onState: (s) => states.push(s),
  });
  monitor.start();
  const before = probes;
  monitor.notePower("lock");
  assert.equal(probes, before + 1, "锁屏只触发一次重探");
  assert.equal(monitor.current().online, true, "锁屏 ≠ 离线");
  monitor.notePower("unlock");
  assert.equal(probes, before + 2, "解锁只触发重探");
  assert.equal(monitor.current().online, true);
  monitor.notePower("suspend");
  monitor.notePower("resume");
  assert.equal(probes, before + 4, "suspend/resume 各重探一次");
  assert.equal(states.length, 0, "网络一直在线：锁屏/挂起不产生离线状态");

  // 网络真实离线时才由采样判定（解锁本身不直接判离线：只算一次采样）。
  online = false;
  monitor.notePower("unlock");
  assert.equal(monitor.current().online, true, "单次离线重探未达防抖阈值，不因解锁判离线");
  assert.ok(diag.records.some((record) => record.event === "network.power" && record.state === "lock" && record.mode === "power"));
  monitor.stop();
});

test("诊断字段：network.* 仅用既有白名单字段；探针异常不误判离线", () => {
  const clock = fakeClock();
  const diag = fakeDiagnostics();
  let online = true;
  const monitor = createNetworkMonitor({
    probe: () => { if (online) throw new Error("probe fixture"); return online; },
    clock,
    sampleIntervalMs: 1_000,
    offlineStableWindowMs: 500,
    diagnostics: diag.logger,
  });
  monitor.start(); // 探针抛错 ⇒ 保守在线
  assert.equal(monitor.current().online, true, "探针异常不误判离线");
  online = false;
  clock.advance(1_000);
  clock.advance(500); // 稳定窗口到点，探针返回 false → 离线
  assert.equal(monitor.current().online, false);
  const stateRecords = diag.records.filter((record) => record.event === "network.state");
  assert.ok(stateRecords.length >= 1);
  for (const record of diag.records) {
    for (const key of Object.keys(record)) {
      if (key === "event") continue;
      assert.ok(DIAG_WHITELIST.has(key), `诊断字段 ${key} 不在既有白名单`);
    }
  }
  assert.equal(stateRecords.at(-1)!.state, "offline");
  assert.equal(stateRecords.at(-1)!.mode, "main-net");
  monitor.stop();
});

// —————— F1 返工（验收 v1）：探针异常必须保持已知状态，绝不得把离线翻成在线 ——————

test("F1：已知离线 + 探针异常 ⇒ 保持离线、gate 不回在线、无 onState 迁移", () => {
  const clock = fakeClock();
  const states: NetworkState[] = [];
  let mode: "online" | "offline" | "throw" = "online";
  const monitor = createNetworkMonitor({
    probe: () => { if (mode === "throw") throw new Error("probe fixture"); return mode === "online"; },
    clock,
    sampleIntervalMs: 1_000,
    offlineStableWindowMs: 500,
    onState: (s) => states.push(s),
  });
  monitor.start();
  mode = "offline";
  clock.advance(1_000);
  clock.advance(500);
  assert.equal(monitor.current().online, false);
  assert.equal(monitor.gate.isOnline(), false);
  const transitions = states.length;
  assert.equal(transitions, 1, "离线恰一次迁移");

  mode = "throw";
  const { probeNow } = monitor;
  const returned = probeNow();
  assert.equal(returned.online, false, "probeNow 异常路径返回已知离线");
  clock.advance(10_000); // 采样全部异常
  assert.equal(monitor.current().online, false, "已知离线在探针异常下保持不变");
  assert.equal(monitor.gate.isOnline(), false, "状态门不得被翻成在线（否则会 resume 请求/放行队列）");
  assert.equal(states.length, transitions, "不得触发 onState 迁移");
  monitor.stop();
});

test("F1：启动即离线 + 探针异常 ⇒ 保持离线、不产生新迁移", () => {
  const clock = fakeClock();
  const states: NetworkState[] = [];
  let mode: "offline" | "throw" = "offline";
  const monitor = createNetworkMonitor({
    probe: () => { if (mode === "throw") throw new Error("probe fixture"); return false; },
    clock,
    sampleIntervalMs: 1_000,
    onState: (s) => states.push(s),
  });
  monitor.start();
  assert.equal(monitor.current().online, false);
  assert.equal(monitor.gate.isOnline(), false);
  assert.equal(states.length, 1, "启动离线恰一次迁移");
  mode = "throw";
  const { probeNow } = monitor;
  probeNow();
  clock.advance(5_000);
  assert.equal(monitor.current().online, false, "启动离线在探针异常下保持离线");
  assert.equal(monitor.gate.isOnline(), false);
  assert.equal(states.length, 1, "探针异常不得产生新迁移");
  monitor.stop();
});

test("F1：启动首采样探针异常 ⇒ 保持在线占位（unknown）、不迁移；后续采样可正常判定", () => {
  const clock = fakeClock();
  const states: NetworkState[] = [];
  let mode: "throw" | "online" | "offline" = "throw";
  const monitor = createNetworkMonitor({
    probe: () => { if (mode === "throw") throw new Error("probe fixture"); return mode === "online"; },
    clock,
    sampleIntervalMs: 1_000,
    offlineStableWindowMs: 500,
    onState: (s) => states.push(s),
  });
  monitor.start();
  assert.equal(monitor.current().online, true, "未知时保持保守在线占位");
  assert.equal(monitor.current().source, "unknown");
  assert.equal(states.length, 0, "异常首采样不产生迁移");
  mode = "online";
  clock.advance(1_000);
  assert.equal(states.length, 0, "在线采样不外推");
  mode = "offline";
  clock.advance(1_000);
  clock.advance(500);
  assert.equal(monitor.current().online, false);
  assert.equal(states.length, 1);
  monitor.stop();
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 400; i += 1) {
    if (predicate()) return;
    await sleep(5);
  }
  assert.fail(label);
}

test("F1 真实计时（默认时钟）：已知离线 + probe 抛错 ⇒ 保持离线、无 onState 迁移", async () => {
  let mode: "online" | "offline" | "throw" = "online";
  const states: NetworkState[] = [];
  const monitor = createNetworkMonitor({
    probe: () => { if (mode === "throw") throw new Error("probe fixture"); return mode === "online"; },
    sampleIntervalMs: 10,
    offlineStableWindowMs: 5,
    offlineSampleCount: 2,
    onState: (s) => states.push(s),
  });
  try {
    monitor.start();
    mode = "offline";
    await until(() => monitor.current().online === false, "真实计时下未判离线");
    assert.equal(monitor.gate.isOnline(), false);
    const transitions = states.length;
    mode = "throw";
    const { probeNow } = monitor;
    probeNow();
    await sleep(60); // 覆盖多个真实采样周期
    assert.equal(monitor.current().online, false, "真实计时下探针异常保持已知离线");
    assert.equal(monitor.gate.isOnline(), false);
    assert.equal(states.length, transitions, "真实计时下探针异常不得触发 onState");
  } finally {
    monitor.stop();
  }
});
