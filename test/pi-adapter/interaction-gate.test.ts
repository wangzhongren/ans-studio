// 「交互挂起」活动闸与可暂停硬超时单测（设计 G-1）。不导入任何 Pi 包。
// 归属：Pi适配器角色测试目录。
//
// 覆盖：
//   1. `createInteractionGate`：引用计数（可重入）、onChange 只在 0↔1 通知、多余 end 为 no-op、退订生效；
//   2. `withPausableTimeout`：无闸 = 普通硬超时；**闸等待期间计时停走**（tick 越过时限不拒）、
//      闸恢复后按**剩余时间**继续（到期才拒）；timeoutMs 非正 → 不加超时（原样返回 work）。
// 用 node:test **mock 时钟**（setTimeout + Date）驱动，不真等。

import { test } from "node:test";
import assert from "node:assert/strict";

import { createInteractionGate, isTimeoutError, withPausableTimeout } from "../../src/common/pi-adapter/timeout.ts";

test("InteractionGate：引用计数（可重入）、onChange 只在 0↔1 通知、多余 end 为 no-op、退订生效", () => {
  const gate = createInteractionGate();
  const events: boolean[] = [];
  const off = gate.onChange((waiting) => events.push(waiting));

  assert.equal(gate.isWaiting(), false);
  gate.begin();
  assert.equal(gate.isWaiting(), true);
  gate.begin(); // 重入：引用计数
  gate.end();
  assert.equal(gate.isWaiting(), true, "还有一层等待未结束");
  gate.end();
  assert.equal(gate.isWaiting(), false);
  gate.end(); // 多余调用：no-op（不得通知）
  assert.deepEqual(events, [true, false], "只在 0↔1 边界各通知一次");

  off(); // 先退订
  gate.begin(); // 通知不会再送达
  gate.end();
  assert.deepEqual(events, [true, false], "退订后不再收通知");
  assert.equal(gate.isWaiting(), false);
});

test("withPausableTimeout：无闸 = 普通硬超时（到点即拒，TimeoutError）", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const work = new Promise<never>(() => {}); // 永不返回
    const outcome = withPausableTimeout(work, 1000, "无闸").then(
      () => "resolved" as const,
      (err: unknown) => err,
    );
    t.mock.timers.tick(999);
    await Promise.resolve();
    t.mock.timers.tick(1);
    const result = await outcome;
    assert.ok(isTimeoutError(result), "到点应 TimeoutError");
  } finally {
    t.mock.timers.reset();
  }
});

test("withPausableTimeout：闸等待中计时停走；恢复后按剩余时间到期才拒", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const gate = createInteractionGate();
    const work = new Promise<never>(() => {});
    let outcome: unknown;
    void withPausableTimeout(work, 1000, "可暂停").then(
      () => {
        outcome = "resolved";
      },
      (err: unknown) => {
        outcome = err;
      },
    );

    t.mock.timers.tick(400); // 已耗 400ms（Date 同步前进）
    gate.begin(); // 进入等待 → 暂停
    t.mock.timers.tick(10_000_000); // 暂停期间无论走多久都不超时
    await Promise.resolve();
    assert.equal(outcome, undefined, "暂停期间不得超时（G-1 核心）");

    gate.end(); // 恢复：应只剩 ~600ms
    t.mock.timers.tick(599);
    await Promise.resolve();
    assert.equal(outcome, undefined, "剩余时间未到不得超时");

    t.mock.timers.tick(1);
    await Promise.resolve();
    assert.ok(isTimeoutError(outcome), "剩余时间用尽应超时（按剩余量续算）");
  } finally {
    t.mock.timers.reset();
  }
});

test("withPausableTimeout：work 先完成 → 按时返回；timeoutMs 非正 → 不加超时", async () => {
  const value = await withPausableTimeout(Promise.resolve(42), 1000, "快活");
  assert.equal(value, 42);

  // 非正/非有限 → 不加超时（async 包装下断言取值等价，而非 promise 同一性）。
  assert.equal(await withPausableTimeout(Promise.resolve("原样"), 0, "未设限"), "原样");
  assert.equal(await withPausableTimeout(Promise.resolve("原样"), Number.POSITIVE_INFINITY, "未设限"), "原样");
});
