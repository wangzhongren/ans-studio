// test/测试/g2-verify/w3-closure.test.ts —— G-2 独立复验「W3 完成态收束（滞回）」对抗域（纯逻辑＋注入时钟）。
//
// 覆盖（独立构造）：
//   · 预热：自导入以来无 settled ⇒ 永不触发（防空项目一进来就触发）；
//   · 静默恰 30s 边界（2026-10-16 复裁默认）：差 1ms 不投、恰值投**恰一条**收束提示；
//   · 每静默窗口至多一条：投出后持续静默不重发；
//   · 系统投递的 settle 不算真实活动（防骚扰回路）；su 对收束提示的回复不重武装；
//   · 真实活动（activity / 非 system settled）重新武装后，再次静默可再投；
//   · 静默谓词逐项：busy / 队列非空 / 在途 / 待确认 / 链在跑 ⇒ 任一不静默即重置静默起点；
//   · 投递失败不消费窗口（重试恰一条）。

import test from "node:test";
import assert from "node:assert/strict";

import {
  createWatchdogService,
  type WatchdogConfig,
  type WatchdogProjectSnapshot,
  type WatchdogRoleView,
} from "../../../app/desktop/watchdog.ts";
import { WATCHDOG_CLOSURE_PREFIX } from "../../../src/common/编排/watchdog.ts";

const P = "/proj-verify";
const SU = "su";
// 复裁修订（客户 2026-10-16 run-5 观察后）：批准默认 5min → 30s。本 rig 传空 env、不覆盖 silenceMs
// ⇒ 真默认驱动判定；30_000 与新批准值**精确对偶**——差 1ms 边界断言使默认再漂移即红（不随实现放水的严格钉）。
const SILENCE = 30_000;

interface Rig {
  svc: ReturnType<typeof createWatchdogService>;
  deliveries: string[];
  setSnapshot: (s: WatchdogProjectSnapshot) => void;
  T: { v: number };
  advance(ms: number): void;
}

function baseSnapshot(over: Partial<WatchdogProjectSnapshot> = {}): WatchdogProjectSnapshot {
  return {
    projectRoot: P,
    suRoleId: SU,
    roles: [{ roleId: SU, runtime: "pi", busy: false } as WatchdogRoleView],
    queues: [],
    activeDeliveries: 0,
    chainsActive: false,
    pendingConfirmationsTotal: 0,
    pendingConfirmationsByRole: new Map<string, number>(),
    ...over,
  };
}

function makeRig(over: Partial<WatchdogConfig> = {}, deliverImpl?: (text: string) => void): Rig {
  const T = { v: 1_700_200_000_000 };
  let current: WatchdogProjectSnapshot = baseSnapshot();
  const deliveries: string[] = [];
  const svc = createWatchdogService({
    projects: () => [P],
    snapshot: () => current,
    deliver: (_r, m) => {
      deliverImpl?.(m.text); // 先过钩子（抛错＝投递端异常，不记入已投）
      deliveries.push(m.text);
    },
    now: () => T.v,
    config: { env: {}, ...over },
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

const closureCount = (rig: Rig): number => rig.deliveries.filter((t) => t.startsWith(WATCHDOG_CLOSURE_PREFIX)).length;

test("W3 预热：无 settled ⇒ 即使静默超 N 也永不触发", () => {
  const rig = makeRig();
  rig.advance(SILENCE * 3);
  rig.svc.tick();
  rig.svc.tick();
  assert.equal(closureCount(rig), 0, "预热条件（≥1 轮 settled）未满足 ⇒ 不触发");
});

test("W3：静默恰 30s 边界——差 1ms 不投；恰值投恰一条（文案「已持续 30 秒」）", () => {
  const rig = makeRig();
  rig.svc.observe(P, { kind: "settled", roleId: SU, outcome: "completed", at: rig.T.v, fromSystemDelivery: false });
  rig.svc.tick(); // 第一次静默 tick ⇒ silenceSince = T0
  rig.advance(SILENCE - 1);
  rig.svc.tick();
  assert.equal(closureCount(rig), 0, "静默差 1ms：不投");
  rig.advance(1);
  rig.svc.tick();
  assert.equal(closureCount(rig), 1, "恰 30s：投恰一条");
  assert.ok(rig.deliveries[0].includes("已持续 30 秒"), `静默时长如实（新秒档渲染）：${rig.deliveries[0].slice(0, 40)}`);
  assert.ok(rig.deliveries[0].includes("不代表任何验收结论"), "不强迫断言完成");
});

test("W3：每静默窗口至多一条——投出后再静默 4×N 不重发", () => {
  const rig = makeRig();
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "completed", at: rig.T.v, fromSystemDelivery: false });
  rig.svc.tick();
  rig.advance(SILENCE);
  rig.svc.tick();
  assert.equal(closureCount(rig), 1, "第一条");
  rig.advance(SILENCE * 4);
  rig.svc.tick();
  rig.svc.tick();
  assert.equal(closureCount(rig), 1, "持续静默不重发（防骚扰）");
});

test("W3：system 投递的 settle 不算真实活动（su 回复收束提示 → 不重武装）", () => {
  const rig = makeRig();
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "completed", at: rig.T.v, fromSystemDelivery: false });
  rig.svc.tick();
  rig.advance(SILENCE);
  rig.svc.tick();
  assert.equal(closureCount(rig), 1, "收束提示已投");
  // su 处理收束提示的那一轮（由 kind:"system" 投递持有）结束：
  rig.svc.observe(P, { kind: "settled", roleId: SU, outcome: "completed", at: rig.T.v, fromSystemDelivery: true });
  rig.advance(SILENCE + 1000);
  rig.svc.tick();
  assert.equal(closureCount(rig), 1, "su 的收束回复不重武装（「总结完 → 30 秒又催」回路不存在）");
});

test("W3：真实活动（activity / 非 system settled）重新武装——再次静默满 N 才可再投", () => {
  const rig = makeRig();
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "completed", at: rig.T.v, fromSystemDelivery: false });
  rig.svc.tick();
  rig.advance(SILENCE);
  rig.svc.tick();
  assert.equal(closureCount(rig), 1, "第一条");
  // 真实活动：客户消息（activity）——重武装
  rig.svc.observe(P, { kind: "activity", reason: "customer-send" });
  rig.svc.tick(); // 新静默窗口起点
  rig.advance(SILENCE - 1);
  rig.svc.tick();
  assert.equal(closureCount(rig), 1, "新窗口差 1ms：不投");
  rig.advance(1);
  rig.svc.tick();
  assert.equal(closureCount(rig), 2, "新窗口满 N：第二条");
  // 另一条路径：非 system 的 settled 同样重武装
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "completed", at: rig.T.v, fromSystemDelivery: false });
  rig.svc.tick();
  rig.advance(SILENCE);
  rig.svc.tick();
  assert.equal(closureCount(rig), 3, "真实 settled 重武装 ⇒ 第三条");
});

test("W3 静默谓词：busy / 队列 / 在途 / 待确认 / 链在跑——任一非静默即重置静默起点", () => {
  const cases: [string, WatchdogProjectSnapshot][] = [
    ["busy", baseSnapshot({ roles: [{ roleId: SU, runtime: "pi", busy: true } as WatchdogRoleView] })],
    ["队列非空", baseSnapshot({ queues: [{ targetRoleId: "X", runtime: "pi", items: [{ kind: "dispatch", dedupKey: "k", sourceRoleId: "su", summary: "t", enqueuedAtMs: 0 }] }] })],
    ["在途投递", baseSnapshot({ activeDeliveries: 1 })],
    ["待确认卡", baseSnapshot({ pendingConfirmationsTotal: 1 })],
    ["open/rebuild 链在跑", baseSnapshot({ chainsActive: true })],
  ];
  for (const [name, nonSilent] of cases) {
    const rig = makeRig();
    rig.svc.observe(P, { kind: "settled", roleId: SU, outcome: "completed", at: rig.T.v, fromSystemDelivery: false });
    rig.svc.tick();
    rig.advance(SILENCE - 1);
    rig.setSnapshot(nonSilent); // 差 1ms 时出现非静默事实
    rig.svc.tick();
    assert.equal(closureCount(rig), 0, `${name}：非静默事实拦下`);
    rig.setSnapshot(baseSnapshot()); // 恢复静默——静默起点从这一刻重算
    rig.svc.tick();
    rig.advance(SILENCE - 1);
    rig.svc.tick();
    assert.equal(closureCount(rig), 0, `${name}：重置后差 1ms 仍不投`);
    rig.advance(1);
    rig.svc.tick();
    assert.equal(closureCount(rig), 1, `${name}：重置后满 N 投出恰一条`);
  }
});

test("W3：投递失败不消费窗口——下个 tick 重试恰一条（投不出 ≠ 已投）", () => {
  let fail = true;
  const rig = makeRig({}, () => {
    if (fail) throw new Error("夹具：投递端异常");
  });
  rig.svc.observe(P, { kind: "settled", roleId: "X", outcome: "completed", at: rig.T.v, fromSystemDelivery: false });
  rig.svc.tick();
  rig.advance(SILENCE);
  rig.svc.tick(); // 尝试投递 ⇒ 失败
  rig.svc.tick(); // 再次尝试 ⇒ 仍失败
  fail = false;
  rig.svc.tick(); // 成功
  assert.equal(closureCount(rig), 1, "投出恰好一条（失败未消费窗口）");
  rig.advance(SILENCE);
  rig.svc.tick();
  assert.equal(closureCount(rig), 1, "投出后不重发");
});
