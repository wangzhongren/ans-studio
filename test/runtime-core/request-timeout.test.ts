// test/runtime-core/request-timeout.test.ts
// P1（2026-10-30 团队计划 §4.3 / 附录 B）：请求级首字节/流空闲超时的**纯逻辑**——
//  - 默认值 90s/300s；首字节到点、流活动重置空闲、暂停期间停走（余量保留）；
//  - 超时错误形状：RequestTimeoutError（**不是** TimeoutError —— 终态 failed 而非最后兜底 timed_out）；
//  - 未超时（正常长回合持续活动）不被误杀；stop() 后不再触发。
// 该模块被 Claude 适配器真实消费（test/claude-adapter/request-timeout.test.ts）；本文件不透支其行为。

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_REQUEST_FIRST_BYTE_TIMEOUT_MS,
  DEFAULT_REQUEST_IDLE_TIMEOUT_MS,
  createRequestDeadline,
  createRequestTimeoutFailure,
  isRequestFailureCode,
  isRequestTimeoutFailure,
  requestTimeoutFailureFacts,
  requestTimeoutSummary,
  type RequestDeadlineClock,
} from "../../src/common/runtime-core/request-timeout.ts";
import { MODEL_REQUEST_FAILED, MODEL_REQUEST_RETRY_EXHAUSTED, REQUEST_TIMEOUT_ERROR_CODES } from "../../src/model/runtime.ts";

/** 可推进的假时钟：setTimeout 只登记，advance 按到期时刻依次触发。 */
function fakeClock(): RequestDeadlineClock & { advance(ms: number): void; pending(): number } {
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

test("默认值：首字节 90000ms / 流空闲 300000ms；错误码与短报为人话且不泄露技术 code", () => {
  assert.equal(DEFAULT_REQUEST_FIRST_BYTE_TIMEOUT_MS, 90_000);
  assert.equal(DEFAULT_REQUEST_IDLE_TIMEOUT_MS, 300_000);
  assert.equal(REQUEST_TIMEOUT_ERROR_CODES["first-byte"], "request-timeout-first-byte");
  assert.equal(REQUEST_TIMEOUT_ERROR_CODES.idle, "request-timeout-idle");
  assert.equal(requestTimeoutSummary("first-byte"), "本轮请求超时（首字节未返回）");
  assert.equal(requestTimeoutSummary("idle"), "本轮请求超时（响应空闲超时）");
  assert.ok(!/request-timeout|MODEL_|code/i.test(requestTimeoutSummary("first-byte")), "短报不含技术 code");
  assert.ok(isRequestFailureCode("request-timeout-first-byte"));
  assert.ok(isRequestFailureCode("request-timeout-idle"));
  assert.ok(isRequestFailureCode(MODEL_REQUEST_FAILED));
  assert.equal(isRequestFailureCode("PERSIST_FAILED"), false);
  assert.equal(isRequestFailureCode(undefined), false);
});

test("首字节：到点触发 first-byte，有效耗时如实；错误名不是 TimeoutError（终态 failed）", () => {
  const clock = fakeClock();
  const timeouts: Array<{ kind: string; timeoutMs: number; elapsedMs: number }> = [];
  const deadline = createRequestDeadline({
    firstByteTimeoutMs: 50,
    idleTimeoutMs: 300,
    onTimeout: (kind, timeoutMs, elapsedMs) => timeouts.push({ kind, timeoutMs, elapsedMs }),
    clock,
  });
  deadline.start();
  clock.advance(49);
  assert.equal(timeouts.length, 0, "49ms 未到点");
  clock.advance(1);
  assert.deepEqual(timeouts, [{ kind: "first-byte", timeoutMs: 50, elapsedMs: 50 }]);

  const failure = createRequestTimeoutFailure("first-byte", 50, 50, 1, false);
  assert.equal(failure.name, "RequestTimeoutError");
  assert.notEqual(failure.name, "TimeoutError", "请求超时终态是 failed，不是最后兜底 timed_out");
  assert.equal(failure.code, "request-timeout-first-byte");
  assert.equal(failure.timeoutKind, "first-byte");
  assert.equal(failure.timeoutMs, 50);
  assert.equal(failure.elapsedMs, 50);
  assert.equal(failure.attempts, 1);
  assert.equal(failure.replaySafe, false);
  assert.ok(isRequestTimeoutFailure(failure));
  assert.deepEqual(requestTimeoutFailureFacts(failure), {
    errorCode: "request-timeout-first-byte",
    attempts: 1,
    replaySafe: false,
    timeoutKind: "first-byte",
  });
  assert.equal(isRequestTimeoutFailure(new Error("x")), false);
});

test("isRequestFailureCode：已知请求失败码包含 P3 重试耗尽；未知码不误收", () => {
  for (const code of [REQUEST_TIMEOUT_ERROR_CODES["first-byte"], REQUEST_TIMEOUT_ERROR_CODES.idle, MODEL_REQUEST_FAILED, MODEL_REQUEST_RETRY_EXHAUSTED]) {
    assert.equal(isRequestFailureCode(code), true, code);
  }
  for (const code of ["network-offline-timeout", "TURN_LAST_RESORT", "", undefined, null, 42]) {
    assert.equal(isRequestFailureCode(code), false, String(code));
  }
});

test("流空闲：首条消息关闭首字节；后续每条消息重置 idle；未超时（长回合）不被误杀", () => {
  const clock = fakeClock();
  const timeouts: string[] = [];
  const deadline = createRequestDeadline({
    firstByteTimeoutMs: 100,
    idleTimeoutMs: 40,
    onTimeout: (kind) => timeouts.push(kind),
    clock,
  });
  deadline.start();
  clock.advance(30);
  assert.equal(deadline.activity(), true, "首条 SDK 消息 = 首字节到达");
  assert.equal(deadline.firstByteSeen, true);
  assert.equal(deadline.firstByteElapsedMs, 30);
  clock.advance(39);
  assert.equal(timeouts.length, 0);
  assert.equal(deadline.activity(), false, "后续消息不再报告首字节");
  clock.advance(39);
  assert.equal(timeouts.length, 0, "每条消息重置 idle，连续活动不超时");
  clock.advance(1);
  assert.deepEqual(timeouts, ["idle"], "距最后一条消息满 40ms 才判流空闲超时");
});

test("暂停：交互/工具/abort 清理期间计时停走，恢复后按剩余时间继续（引用计数）", () => {
  const clock = fakeClock();
  const timeouts: Array<{ kind: string; elapsedMs: number }> = [];
  const deadline = createRequestDeadline({
    firstByteTimeoutMs: 50,
    idleTimeoutMs: 300,
    onTimeout: (kind, _limit, elapsedMs) => timeouts.push({ kind, elapsedMs }),
    clock,
  });
  deadline.pause(); // 交互闸在 start 前已在等待
  deadline.start();
  clock.advance(500);
  assert.equal(timeouts.length, 0, "暂停期间首字节计时停走");
  deadline.pause(); // 嵌套（工具/另一层等待）
  deadline.resume();
  clock.advance(500);
  assert.equal(timeouts.length, 0, "嵌套暂停未全部恢复前仍停走");
  deadline.resume();
  clock.advance(49);
  assert.equal(timeouts.length, 0, "恢复后按剩余时间继续");
  clock.advance(1);
  assert.deepEqual(timeouts, [{ kind: "first-byte", elapsedMs: 50 }], "有效耗时只累计未暂停时间");
});

test("stop：停止后不再触发；首字节已到达后的空闲阶段同样可停", () => {
  const clock = fakeClock();
  const timeouts: string[] = [];
  const deadline = createRequestDeadline({
    firstByteTimeoutMs: 50,
    idleTimeoutMs: 50,
    onTimeout: (kind) => timeouts.push(kind),
    clock,
  });
  deadline.start();
  deadline.stop();
  clock.advance(10_000);
  assert.equal(timeouts.length, 0);
  assert.equal(deadline.activity(), false, "停止后 activity 无副作用");
});

test("首字节时限关闭（0/非有限）时：首条消息前不超时；活动后仍按 idle 计时", () => {
  const clock = fakeClock();
  const timeouts: string[] = [];
  const deadline = createRequestDeadline({
    firstByteTimeoutMs: 0,
    idleTimeoutMs: 30,
    onTimeout: (kind) => timeouts.push(kind),
    clock,
  });
  deadline.start();
  clock.advance(10_000);
  assert.equal(timeouts.length, 0, "首字节时限 0 = 不启用");
  deadline.activity();
  clock.advance(30);
  assert.deepEqual(timeouts, ["idle"]);
});

test("暂停中收到首条消息：首字节标记生效，恢复后只按剩余 idle 计时", () => {
  const clock = fakeClock();
  const timeouts: string[] = [];
  const deadline = createRequestDeadline({
    firstByteTimeoutMs: 50,
    idleTimeoutMs: 30,
    onTimeout: (kind) => timeouts.push(kind),
    clock,
  });
  deadline.start();
  deadline.pause();
  clock.advance(100);
  assert.equal(deadline.activity(), true);
  clock.advance(100);
  assert.equal(timeouts.length, 0, "暂停中不触发");
  deadline.resume();
  clock.advance(29);
  assert.equal(timeouts.length, 0);
  clock.advance(1);
  assert.deepEqual(timeouts, ["idle"]);
});
