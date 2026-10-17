// test/测试/turn-watch-verify/a-inspect.test.ts
// 测试角色：到点检查（inspect）独立验证（2026-10-17）。
//
// 覆盖 PM 评审 §5.1/§5.2/§5.8：
//   · 检查时限到点（100%）才发一条；差 1ms 不发；
//   · 文案＝「轮次到点检查」，不含「逼近超时/已超时/硬超时/剩余量」；含不中止/仍在推进不动作/
//     卡死才 propose_recovery/1 小时最后兜底；
//   · 每轮一次（2× 检查时限仍 1 条）；下一轮独立再检查；
//   · 挂起确认卡排除；su 自身忙抑制 su、项目角色照报；
//   · 看护只投消息，**不中止**任何轮次（无 abort 能力/无副作用）。
//
// 独立构造：自建看护 rig（注入时钟/快照/投递端）；不跑真实轮次。

import { test } from "node:test";
import assert from "node:assert/strict";

import { WATCHDOG_ALERT_PREFIX } from "../../../src/common/编排/watchdog.ts";
import { busyRole, makeWatchdogRig, roleView, snapshot, SU } from "./fixture.ts";

const INSPECT = 300_000; // 默认看护检查时限（5 分钟）

test("A1 到点检查：299999ms 不发、300000ms 恰一条；文案合规；每轮一次", () => {
  const rig = makeWatchdogRig();
  const t0 = rig.now();
  rig.setSnapshot(snapshot({ roles: [busyRole("X", t0, "turn-1"), roleView(SU)] }));

  rig.advance(INSPECT - 1);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 0, "差 1ms 不发");

  rig.advance(1);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1, "到点恰一条");
  const text = rig.deliveries[0].text;
  assert.ok(text.startsWith(WATCHDOG_ALERT_PREFIX), "看护前缀");
  assert.ok(text.includes("轮次到点检查"), "标签＝轮次到点检查");
  for (const bad of ["逼近超时", "已超时", "硬超时", "剩余量"]) {
    assert.equal(text.includes(bad), false, `不得出现旧措辞：${bad}`);
  }
  for (const must of [
    "到点仅检查、不中止本轮",
    "仍在推进则不动作",
    "propose_recovery",
    "客户确认后应用执行",
    "最后兜底",
    "挂起确认卡时不触发本信号",
  ]) {
    assert.ok(text.includes(must), `文案须含：${must}`);
  }

  // 2× 检查时限：同一轮仍只有 1 条。
  rig.advance(INSPECT);
  rig.svc.tick();
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1, "同一轮不重复检查");

  // 下一轮独立再检查。到点检查不是故障：旧轮次解除**不投「看护恢复」行**（只留诊断）。
  rig.setSnapshot(snapshot({ roles: [busyRole("X", rig.now(), "turn-2"), roleView(SU)] }));
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1, "旧轮次解除不得投看护恢复行");
  assert.equal(rig.deliveries.some((d) => d.text.includes("看护恢复")), false);
  rig.advance(INSPECT);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 2, "下一轮独立再检查");
  assert.ok(rig.deliveries[1].text.includes("轮次到点检查"));
});

test("A2 检查时限可由 env 调整（Pi）：60000ms 到点", () => {
  const rig = makeWatchdogRig({ env: { ANS_PI_PROMPT_TIMEOUT_MS: "60000" } });
  const t0 = rig.now();
  rig.setSnapshot(snapshot({ roles: [busyRole("X", t0, "turn-env"), roleView(SU)] }));
  rig.advance(59_999);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 0);
  rig.advance(1);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1, "Pi 到点检查时限读 env");
});

test("A3 排除：挂起确认卡不报；解除后按真实已耗报", () => {
  const rig = makeWatchdogRig();
  const t0 = rig.now();
  const snap = (pending: number) =>
    snapshot({
      roles: [busyRole("X", t0, "turn-1"), roleView(SU)],
      pendingConfirmationsTotal: pending,
      pendingConfirmationsByRole: new Map(pending > 0 ? [["X", pending]] : []),
    });
  rig.setSnapshot(snap(1));
  rig.advance(INSPECT);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 0, "挂起确认卡＝正确等待，不报");
  rig.setSnapshot(snap(0));
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1, "解除后立即按真实已耗报");
});

test("A4 排除：su 自身忙 ⇒ 关于 su 不报；项目角色照报（消息排队由投递机负责）", () => {
  const rig = makeWatchdogRig();
  const t0 = rig.now();
  rig.setSnapshot(snapshot({ roles: [busyRole(SU, t0, "su-turn"), busyRole("X", t0, "x-turn")] }));
  rig.advance(INSPECT);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1, "只报项目角色");
  assert.ok(rig.deliveries[0].text.includes("「X」"));
  assert.equal(rig.deliveries[0].text.includes(`「${SU}」`), false);
});

test("A5 到点不中止：看护只有消息投递面，没有任何轮次中止/恢复执行钩子", () => {
  const rig = makeWatchdogRig();
  const t0 = rig.now();
  rig.setSnapshot(snapshot({ roles: [busyRole("X", t0, "turn-1"), roleView(SU)] }));
  rig.advance(INSPECT);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1);
  // WatchdogService 的构造依赖只有 projects/snapshot/deliver/now/config（无 abort/recovery/repropose 钩子）——
  // 到点检查只可能产生一条消息；本用例以「投递次数恰 1 且文本明示不中止」+ 类型面（编译期）双重保证。
  assert.equal(rig.deliveries[0].text.includes("不中止本轮"), true);
  assert.equal(rig.deliveries.length, 1);
});
