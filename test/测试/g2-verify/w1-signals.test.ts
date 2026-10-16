// test/测试/g2-verify/w1-signals.test.ts —— G-2 独立复验「W1 四信号」对抗域（纯逻辑＋注入时钟/快照/投递端）。
//
// 覆盖（独立构造；阈值边界前后行为、排除项、去重冷却、风暴护栏、看护恢复行）：
//   #1 轮次逼近超时：恰 90% 边界；挂起确认卡排除；su 自身忙排除；每轮一次＋身份更替恢复行。
//   #2 投递排队积压：age 恰 10min / depth 恰 5 边界；活跃期单报＋累计；恢复行计数如实；冷却恰边界。
//   #3 命令超时：单次即报；冷却恰边界；su 忙抑制；无恢复行。
//   #4 重复失败：15min 窗口恰 3 次边界；completed/aborted 不计；恰 15min 剪枝边界；冷却 30min。
//   风暴护栏：15min 窗口第 6 条起只投「已抑制 N 条」恰一条通告；统计如实；窗口滑出恢复额度。
//   恢复行只在告警确实投出过时投；看护器/投递端异常隔离（不抛、下个时机重试）。

import test from "node:test";
import assert from "node:assert/strict";

import {
  createWatchdogService,
  type WatchdogConfig,
  type WatchdogOutboundMessage,
  type WatchdogProjectSnapshot,
  type WatchdogRoleView,
  type WatchdogService,
} from "../../../app/desktop/watchdog.ts";
import { WATCHDOG_ALERT_PREFIX } from "../../../src/common/编排/watchdog.ts";

const P = "/proj-verify";
const SU = "su";

type Delivery = WatchdogOutboundMessage & { dedupKey: string };

interface Rig {
  svc: WatchdogService;
  deliveries: Delivery[];
  setSnapshot: (s: WatchdogProjectSnapshot) => void;
  T: { v: number };
  advance(ms: number): void;
}

function makeRig(configOver: Partial<WatchdogConfig> = {}): Rig {
  const T = { v: 1_700_100_000_000 };
  let current: WatchdogProjectSnapshot = baseSnapshot();
  const deliveries: Delivery[] = [];
  const svc = createWatchdogService({
    projects: () => [P],
    snapshot: () => current,
    deliver: (_root, message) => {
      deliveries.push(message);
    },
    now: () => T.v,
    // 默认把 W3 静默阈值拔高（隔离支柱一）——本文件只测四信号；W3 由 w3-closure.test.ts 专测。
    config: { env: {}, silenceMs: 365 * 24 * 3600 * 1000, ...configOver },
  });
  return {
    svc,
    deliveries,
    setSnapshot: (s) => {
      current = s;
    },
    T,
    advance: (ms) => {
      T.v += ms;
    },
  };
}

function baseSnapshot(over: Partial<WatchdogProjectSnapshot> = {}): WatchdogProjectSnapshot {
  return {
    projectRoot: P,
    suRoleId: SU,
    roles: [],
    queues: [],
    activeDeliveries: 0,
    chainsActive: false,
    pendingConfirmationsTotal: 0,
    pendingConfirmationsByRole: new Map<string, number>(),
    ...over,
  };
}

function roleView(roleId: string, over: Partial<WatchdogRoleView> = {}): WatchdogRoleView {
  return { roleId, runtime: "pi", busy: false, ...over };
}

function busyRole(roleId: string, startedAt: number, turnId?: string): WatchdogRoleView {
  return { roleId, runtime: "pi", busy: true, turnStartedAt: startedAt, ...(turnId !== undefined ? { turnId } : {}) };
}

/** 造一条目标为 X 的队列快照（age 数组＝各条目已排队毫秒）。 */
function queueSnap(agesMs: number[], now: number): WatchdogProjectSnapshot {
  return baseSnapshot({
    roles: [roleView(SU)],
    queues: [
      {
        targetRoleId: "X",
        runtime: "pi",
        items: agesMs.map((a, i) => ({ kind: "dispatch", dedupKey: `k${i}`, sourceRoleId: "su", summary: `任务 ${i}`, enqueuedAtMs: now - a })),
      },
    ],
  });
}

const TURN_LIMIT = 120_000; // 默认生效时限（env={}）
const RATIO = 0.9;
const alertTexts = (rig: Rig): string[] => rig.deliveries.map((d) => d.text);

// ————————————————————— #1 轮次逼近超时 —————————————————————

test("W1#1：恰 90% 边界——差 1ms 不报、恰 108000ms 报一条；每轮一次", () => {
  const rig = makeRig();
  const t0 = rig.T.v;
  rig.setSnapshot(baseSnapshot({ roles: [busyRole("X", t0, "turn-1"), roleView(SU)] }));
  rig.advance(TURN_LIMIT * RATIO - 1);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 0, "90% 差 1ms：不报");
  rig.advance(1);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1, "恰 90%：报一条（≥ 语义）");
  assert.ok(alertTexts(rig)[0].startsWith(WATCHDOG_ALERT_PREFIX), "文首＝看护前缀");
  rig.svc.tick();
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1, "同一轮次内不重复打扰（活跃期单报＋累计）");
});

test("W1#1 排除：带挂起确认卡的角色不触发；解除后按真实已耗触发", () => {
  const rig = makeRig();
  const t0 = rig.T.v;
  const snap = (pending: number): WatchdogProjectSnapshot =>
    baseSnapshot({
      roles: [busyRole("X", t0, "turn-1"), roleView(SU)],
      pendingConfirmationsTotal: pending,
      pendingConfirmationsByRole: new Map(pending > 0 ? [["X", pending]] : []),
    });
  rig.setSnapshot(snap(1));
  rig.advance(TURN_LIMIT * RATIO);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 0, "挂起确认卡 = 正确等待 ⇒ 不报 #1");
  rig.setSnapshot(snap(0));
  rig.advance(1000);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1, "卡解除后按真实已耗检测 ⇒ 报");
});

test("W1#1 排除：su 自身忙 ⇒ 关于 su 的告警不触发；项目角色照报", () => {
  const rig = makeRig();
  const t0 = rig.T.v;
  rig.setSnapshot(baseSnapshot({ roles: [busyRole(SU, t0, "s1"), busyRole("X", t0, "t1")] }));
  rig.advance(TURN_LIMIT * RATIO);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1, "su 忙时只有 X 的告警（su 自身被抑制）");
  assert.ok(alertTexts(rig)[0].includes("「X」"), "告警对象是 X");
});

test("W1#1 身份更替：旧轮次解除投恢复行（计数如实），新一轮独立起算", () => {
  const rig = makeRig();
  const t0 = rig.T.v;
  rig.setSnapshot(baseSnapshot({ roles: [busyRole("X", t0, "turn-1"), roleView(SU)] }));
  rig.advance(TURN_LIMIT * RATIO);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1, "第一轮告警");
  rig.setSnapshot(baseSnapshot({ roles: [busyRole("X", rig.T.v, "turn-2"), roleView(SU)] }));
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 2, "旧轮次解除 ⇒ 恰一条恢复行");
  assert.ok(alertTexts(rig)[1].includes("看护恢复"), "第二条＝看护恢复行");
  assert.ok(alertTexts(rig)[1].includes("轮次逼近超时"), "恢复行指名信号");
  assert.ok(alertTexts(rig)[1].includes("期间共命中 1 次"), "命中计数如实（N=1）");
  rig.advance(TURN_LIMIT * RATIO);
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 3, "新一轮到 90% 独立触发");
  assert.ok(!alertTexts(rig)[2].includes("看护恢复"), "第三条是新告警（不是恢复行）");
});

// ————————————————————— #2 投递排队积压 —————————————————————

test("W1#2：age 恰 10min 边界——599999ms 不报、600000ms 报；depth 恰 5 辅判触发、depth 4 不触发", () => {
  const rig = makeRig();
  rig.setSnapshot(queueSnap([10 * 60 * 1000 - 1], rig.T.v));
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 0, "age 599999ms：不报");
  rig.setSnapshot(queueSnap([10 * 60 * 1000], rig.T.v));
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1, "age 恰 600000ms：报");

  const rig2 = makeRig();
  rig2.setSnapshot(queueSnap([0, 0, 0, 0, 0], rig2.T.v));
  rig2.svc.tick();
  assert.equal(rig2.deliveries.length, 1, "depth 恰 5（age 未到）：辅判触发");
  const rig3 = makeRig();
  rig3.setSnapshot(queueSnap([0, 0, 0, 0], rig3.T.v));
  rig3.svc.tick();
  assert.equal(rig3.deliveries.length, 0, "depth 4 且 age 未到：不报");
});

test("W1#2：活跃期单报＋累计；恢复行 N/M 如实；冷却恰 10min 边界（自告警投出时刻起算）", () => {
  const rig = makeRig();
  rig.setSnapshot(queueSnap([10 * 60 * 1000], rig.T.v));
  rig.svc.tick(); // hits=1 ⇒ 告警（lastDeliveredAt = T0）
  assert.equal(rig.deliveries.length, 1);
  rig.advance(30_000);
  rig.setSnapshot(queueSnap([10 * 60 * 1000 + 30_000], rig.T.v));
  rig.svc.tick(); // hits=2 ⇒ 累计
  rig.svc.tick(); // hits=3 ⇒ 累计
  assert.equal(rig.deliveries.length, 1, "活跃期内只累计不重复投");
  rig.setSnapshot(baseSnapshot({ roles: [roleView(SU)] })); // 队列清空 ⇒ sweep 解除
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 2, "解除 ⇒ 恢复行");
  assert.ok(alertTexts(rig)[1].includes("期间共命中 3 次"), `N=3 如实：${alertTexts(rig)[1]}`);
  assert.ok(alertTexts(rig)[1].includes("抑制 2 条"), "M=2 如实");
  // 冷却：自首条告警投出时刻（T0）起算 10min。当前 T0+30000。
  rig.advance(10 * 60 * 1000 - 30_000 - 1); // now - T0 = 599999
  rig.setSnapshot(queueSnap([10 * 60 * 1000], rig.T.v));
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 2, "冷却差 1ms：复发的告警被抑制");
  rig.advance(1); // now - T0 = 恰 600000
  rig.setSnapshot(queueSnap([10 * 60 * 1000], rig.T.v));
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 3, "冷却恰满：允许再报");
});

test("W1#2 排除：su 自身忙 ⇒ 关于 su 的目标队列不报；空目标队列跳过", () => {
  const rig = makeRig();
  const at = rig.T.v;
  rig.setSnapshot(
    baseSnapshot({
      roles: [busyRole(SU, at - 10 * 60 * 1000, "s")],
      queues: [
        { targetRoleId: SU, runtime: "pi", items: [{ kind: "dispatch", dedupKey: "k0", sourceRoleId: "X", summary: "t", enqueuedAtMs: at - 10 * 60 * 1000 }] },
        { targetRoleId: "", runtime: "pi", items: [{ kind: "dispatch", dedupKey: "k1", sourceRoleId: "X", summary: "t", enqueuedAtMs: at - 60 * 60 * 1000 }] },
      ],
    }),
  );
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 0, "su 忙抑制 su 队列；空目标队列跳过");
});

// ————————————————————— #3 命令超时 —————————————————————

test("W1#3：单次即报；冷却恰边界；su 忙抑制；无恢复行", () => {
  const rig = makeRig();
  rig.setSnapshot(baseSnapshot({ roles: [roleView(SU), roleView("X"), roleView("Y")] }));
  rig.svc.observe(P, { kind: "command-timed-out", roleId: "X", at: rig.T.v });
  assert.equal(rig.deliveries.length, 1, "单次即报");
  assert.ok(alertTexts(rig)[0].includes("命令超时"), "信号名");
  rig.svc.observe(P, { kind: "command-timed-out", roleId: "X", at: rig.T.v });
  assert.equal(rig.deliveries.length, 1, "冷却内：抑制");
  rig.advance(10 * 60 * 1000 - 1);
  rig.svc.observe(P, { kind: "command-timed-out", roleId: "X", at: rig.T.v });
  assert.equal(rig.deliveries.length, 1, "冷却差 1ms：抑制");
  rig.advance(1);
  rig.svc.observe(P, { kind: "command-timed-out", roleId: "X", at: rig.T.v });
  assert.equal(rig.deliveries.length, 2, "恰冷却边界：再报");
  // su 忙：关于 su 的命令超时抑制
  rig.setSnapshot(baseSnapshot({ roles: [busyRole(SU, rig.T.v, "s")] }));
  rig.svc.observe(P, { kind: "command-timed-out", roleId: SU, at: rig.T.v });
  assert.equal(rig.deliveries.length, 2, "su 忙：其命令超时被抑制");
  // 无恢复行：#3 为瞬时事件（无解除语义），后续 tick 不产生恢复行
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 2, "#3 无恢复行");
});

// ————————————————————— #4 重复失败 —————————————————————

test("W1#4：15min 窗口恰 3 次边界；completed/aborted 不计；恰 15min 剪枝；冷却 30min 内不报", () => {
  const rig = makeRig();
  const snap = (): WatchdogProjectSnapshot => baseSnapshot({ roles: [roleView(SU), roleView("X")] });
  rig.setSnapshot(snap());
  const at = (): number => rig.T.v;
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "completed", at: at(), fromSystemDelivery: false });
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "aborted", at: at(), fromSystemDelivery: false });
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "failed", at: at(), fromSystemDelivery: false });
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "timed_out", at: at(), fromSystemDelivery: false });
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 0, "仅 2 次 failed/timed_out（completed/aborted 不计）：不报");
  rig.advance(60_000);
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "failed", at: at(), fromSystemDelivery: false });
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 1, "恰 3 次（15min 内）：报");
  assert.ok(alertTexts(rig)[0].includes("3 次轮次以 failed/timed_out 结束"), "计数如实");
  // 剪枝边界：推进到距第一条失败恰 15min（第一条被剪、后两条仍在窗口内）
  rig.advance(15 * 60 * 1000 - 60_000);
  rig.setSnapshot(snap());
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 2, "计数跌破阈值 ⇒ 活跃期解除（恢复行）");
  assert.ok(alertTexts(rig)[1].includes("看护恢复") && alertTexts(rig)[1].includes("重复失败"), "恢复行指名重复失败");
  // 冷却 30min（自首条告警投出起算）：窗口内再次满 3 次也不报
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "failed", at: at(), fromSystemDelivery: false });
  rig.advance(30_000);
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "failed", at: at(), fromSystemDelivery: false });
  rig.advance(30_000);
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "failed", at: at(), fromSystemDelivery: false });
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 2, "冷却窗（30min）内即使再满 3 次也不报");
});

test("W1#4：outcome 缺事实不猜（不计入）", () => {
  const rig = makeRig();
  rig.setSnapshot(baseSnapshot({ roles: [roleView(SU), roleView("X")] }));
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "timed_out", at: rig.T.v, fromSystemDelivery: false });
  rig.svc.observe(P, { kind: "settled", roleId: "X", at: rig.T.v, fromSystemDelivery: false }); // 无 outcome
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "timed_out", at: rig.T.v, fromSystemDelivery: false });
  rig.svc.tick();
  assert.equal(rig.deliveries.length, 0, "仅 2 条 timed_out（一条缺事实）⇒ 不报");
});

// ————————————————————— 风暴护栏 —————————————————————

test("风暴护栏：15min 窗口 ≤5 条；第 6 条起只投「已抑制 N 条」通告恰一条；统计如实；窗口滑出恢复", () => {
  const rig = makeRig();
  rig.setSnapshot(baseSnapshot({ roles: [roleView(SU), roleView("X")] }));
  for (const r of ["r1", "r2", "r3", "r4", "r5", "r6", "r7"]) rig.svc.observe(P, { kind: "command-timed-out", roleId: r, at: rig.T.v });
  const alerts = rig.deliveries.filter((d) => d.text.includes("命令超时"));
  const notices = rig.deliveries.filter((d) => d.text.includes("风暴护栏"));
  assert.equal(alerts.length, 5, "恰 5 条告警投出（≤5）");
  assert.equal(notices.length, 1, "抑制通告恰一条");
  assert.ok(notices[0].text.includes("已抑制 1 条"), `首次越限时 N=1 如实：${notices[0].text}`);
  assert.equal(rig.svc.stats(P).suppressedTotal, 2, "累计抑制数如实（6、7 两条）");
  rig.advance(15 * 60 * 1000 + 1);
  for (const r of ["q1", "q2", "q3", "q4", "q5"]) rig.svc.observe(P, { kind: "command-timed-out", roleId: r, at: rig.T.v });
  assert.equal(rig.deliveries.filter((d) => d.text.includes("命令超时")).length, 10, "窗口滑出后新 5 条全部投出（额度恢复）");
});

// ————————————————————— 恢复行条件与异常隔离 —————————————————————

test("恢复行只在告警确实投出过时投：仅被风暴抑制（从未投出）的活跃期解除不产生恢复行", () => {
  const rig = makeRig();
  rig.setSnapshot(baseSnapshot({ roles: [roleView(SU), roleView("X")] }));
  for (const r of ["r1", "r2", "r3", "r4", "r5"]) rig.svc.observe(P, { kind: "command-timed-out", roleId: r, at: rig.T.v });
  assert.equal(rig.deliveries.filter((d) => d.text.includes("命令超时")).length, 5, "额度用光");
  // 第 6 个信号（角色 X 的 #1，已过 90%）：告警被风暴抑制 ⇒ alerted=false 的活跃期
  const at = rig.T.v;
  rig.setSnapshot(baseSnapshot({ roles: [busyRole("X", at - TURN_LIMIT * RATIO, "tX"), roleView(SU)] }));
  rig.svc.tick();
  const before = rig.deliveries.length;
  rig.setSnapshot(baseSnapshot({ roles: [roleView("X"), roleView(SU)] })); // 解除
  rig.svc.tick();
  const newOnes = rig.deliveries.slice(before);
  assert.ok(!newOnes.some((d) => d.text.includes("看护恢复")), "从未投出告警的活跃期解除：不投恢复行");
});

test("看护器异常隔离：快照抛错 ⇒ tick 不抛；下一时机恢复工作", () => {
  const T = { v: 1_700_100_000_000 };
  let broken = true;
  const deliveries: string[] = [];
  const svc = createWatchdogService({
    projects: () => [P],
    snapshot: () => {
      if (broken) throw new Error("夹具：快照读取失败");
      return baseSnapshot({ roles: [roleView(SU), roleView("X")] });
    },
    deliver: (_r, m) => {
      deliveries.push(m.text);
    },
    now: () => T.v,
    config: { env: {} },
  });
  assert.doesNotThrow(() => svc.tick(), "看护异常不得上抛（核心治理零依赖）");
  broken = false;
  svc.observe(P, { kind: "command-timed-out", roleId: "X", at: T.v });
  assert.equal(deliveries.length, 1, "恢复后照常工作");
});

test("投递端抛错 ⇒ 该告警视为未投出（不崩）；条件仍在时重试投出（前次失败未占用冷却）", () => {
  const T = { v: 1_700_100_000_000 };
  let fail = true;
  const deliveries: string[] = [];
  const svc = createWatchdogService({
    projects: () => [P],
    snapshot: () => baseSnapshot({ roles: [roleView(SU), roleView("X")] }),
    deliver: (_r, m) => {
      if (fail) throw new Error("夹具：投递端异常");
      deliveries.push(m.text);
    },
    now: () => T.v,
    config: { env: {} },
  });
  svc.observe(P, { kind: "command-timed-out", roleId: "X", at: T.v });
  assert.equal(deliveries.length, 0, "投递端异常：未投出（无未捕获异常）");
  fail = false;
  svc.observe(P, { kind: "command-timed-out", roleId: "X", at: T.v });
  assert.equal(deliveries.length, 1, "恢复后重试投出");
});
