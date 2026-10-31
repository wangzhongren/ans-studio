// test/runtime-core/network-gate.test.ts
// P2（2026-10-30 团队计划 §3.3 P2 / 附录 B）：网络状态门与离线等待窗口的**纯逻辑**——
//  - `NetworkGate`：默认 online、只在 online 变化时通知、监听异常不影响状态；
//  - 离线窗口守卫：首个离线状态起窗、重复 offline 不重开、恢复立即取消、到点 `onExpire(offlineMs)`；
//  - 网络失败错误形状：`NetworkOfflineError`（name 不是 TimeoutError——终态 failed 而非最后兜底 timed_out）、
//    errorCode `network-offline-timeout`、attempts/replaySafe/offlineMs 如实；人话短报不含技术 code。
// 该模块被 Claude 适配器（暂停/超窗失败）与桌面/I/O 侧真实消费；本文件不替代适配器行为测试。

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_NETWORK_RETRY_WINDOW_MS,
  createNetworkGate,
  createNetworkOfflineFailure,
  createOfflineWindowGuard,
  isNetworkOfflineFailure,
  isNetworkOfflineFailureCode,
  networkOfflineFailureFacts,
  networkOfflineSummary,
  type OfflineWindowClock,
} from "../../src/common/runtime-core/network-gate.ts";
import { NETWORK_OFFLINE_TIMEOUT, type NetworkState } from "../../src/model/runtime.ts";

/** 可推进的假时钟：setTimeout 只登记，advance 按到期时刻依次触发。 */
function fakeClock(): OfflineWindowClock & { advance(ms: number): void; pending(): number } {
  let now = 0;
  let seq = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
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
      for (const [id, timer] of [...timers]) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.callback();
      }
    },
    pending: () => timers.size,
  };
}

function state(online: boolean, at: number, reason: NetworkState["reason"] = "probe"): NetworkState {
  return { online, source: "main-net", at, stableForMs: 0, reason };
}

test("默认窗口 5min；门默认 online，只在 online 变化时通知（去重），监听异常不影响状态", () => {
  assert.equal(DEFAULT_NETWORK_RETRY_WINDOW_MS, 300_000);
  const gate = createNetworkGate({ now: () => 1000 });
  assert.equal(gate.isOnline(), true, "未接状态前不误判离线");
  assert.deepEqual(gate.current(), { online: true, source: "unknown", at: 1000, stableForMs: 0, reason: "initial" });

  const seen: boolean[] = [];
  gate.onChange((next) => { seen.push(next.online); });
  gate.onChange(() => { throw new Error("observer fixture"); });
  gate.apply(state(false, 2000, "interface-down"));
  assert.equal(gate.isOnline(), false);
  assert.equal(gate.current().reason, "interface-down");
  gate.apply(state(false, 3000)); // 仍离线：状态更新但不通知
  assert.deepEqual(seen, [false], "只在 online 变化时通知");
  gate.apply(state(true, 4000, "resume")); // 前面的监听者抛错不得阻断
  assert.deepEqual(seen, [false, true]);
  assert.equal(gate.isOnline(), true);
});

test("离线窗口：首个离线状态起窗；重复 offline 不重开；到点 onExpire(offlineMs)", () => {
  const clock = fakeClock();
  const expired: number[] = [];
  const guard = createOfflineWindowGuard({ windowMs: 100, onExpire: (ms) => expired.push(ms), clock });
  guard.update({ online: false });
  assert.equal(clock.pending(), 1);
  clock.advance(40);
  guard.update({ online: false }); // 重复离线不重置起点
  clock.advance(59);
  assert.deepEqual(expired, [], "未到窗口不失败");
  clock.advance(1);
  assert.deepEqual(expired, [100], "超窗回调如实给出离线时长");
  assert.equal(clock.pending(), 0);
  guard.dispose();
});

test("离线窗口：恢复立即取消；dispose 取消；非正窗口只暂停不失败", () => {
  const clock = fakeClock();
  const expired: number[] = [];
  const guard = createOfflineWindowGuard({ windowMs: 100, onExpire: (ms) => expired.push(ms), clock });
  guard.update({ online: false });
  clock.advance(40);
  guard.update({ online: true });
  assert.equal(clock.pending(), 0, "恢复取消窗口计时");
  clock.advance(500);
  assert.deepEqual(expired, [], "恢复后不得失败");

  guard.update({ online: false });
  clock.advance(40);
  guard.dispose();
  clock.advance(500);
  assert.deepEqual(expired, [], "dispose 后不得回调");

  const passthrough = fakeClock();
  const never: number[] = [];
  const guard2 = createOfflineWindowGuard({ windowMs: 0, onExpire: (ms) => never.push(ms), clock: passthrough });
  guard2.update({ online: false });
  passthrough.advance(1_000_000);
  assert.deepEqual(never, [], "非正窗口 = 只暂停不失败（保守退路）");
  guard2.dispose();
});

test("网络失败形状：NetworkOfflineError / code / attempts / replaySafe / offlineMs；短报人话无技术 code", () => {
  assert.equal(NETWORK_OFFLINE_TIMEOUT, "network-offline-timeout");
  const failure = createNetworkOfflineFailure(2, true, 300_500);
  assert.equal(failure.name, "NetworkOfflineError");
  assert.notEqual(failure.name, "TimeoutError", "网络超窗终态是 failed，不是最后兜底 timed_out");
  assert.equal(failure.code, "network-offline-timeout");
  assert.equal(failure.attempts, 2);
  assert.equal(failure.replaySafe, true);
  assert.equal(failure.offlineMs, 300_500);
  assert.ok(isNetworkOfflineFailure(failure));
  assert.deepEqual(networkOfflineFailureFacts(failure), {
    errorCode: "network-offline-timeout",
    attempts: 2,
    replaySafe: true,
    offlineMs: 300_500,
  });
  assert.equal(isNetworkOfflineFailure(new Error("x")), false);
  assert.ok(isNetworkOfflineFailureCode("network-offline-timeout"));
  assert.equal(isNetworkOfflineFailureCode("request-timeout-idle"), false);
  assert.equal(isNetworkOfflineFailureCode(undefined), false);
  const summary = networkOfflineSummary();
  assert.ok(summary.includes("网络") && summary.includes("恢复超时"), summary);
  assert.ok(!/network-offline-timeout|NetworkOfflineError|ECONN|https?:/i.test(summary), "短报不含技术 code/堆栈/URL");
});
