// test/测试/g2-verify/w3-closure.test.ts —— G-2「完成态收束」已于 2026-10-18 按客户要求移除：
// 验收通过即结束，看护不再在静默满 30s 后投 `[系统·收束]`，也不再有 silenceMs/滞回状态机。
//
// 本套件保留两条回归钉（独立构造、注入时钟）：
//   1. 无论静默多久、活动如何，看护**绝不**投 `[系统·收束]`（投递队列也不出现收束项）；
//   2. 告警仍保留——队列积压照常投 `[系统·看护告警]`，证明看护没有整体失效。

import test from "node:test";
import assert from "node:assert/strict";

import {
  createWatchdogService,
  QUEUE_HEAD_AGE_MS,
  type WatchdogConfig,
  type WatchdogProjectSnapshot,
  type WatchdogRoleView,
} from "../../../app/desktop/watchdog.ts";
import {
  WATCHDOG_ALERT_PREFIX,
  WATCHDOG_CLOSURE_PREFIX,
} from "../../../src/common/编排/watchdog.ts";

const P = "/proj-verify";
const SU = "su";

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
    governanceRoleId: SU,
    roles: [{ roleId: SU, runtime: "pi", busy: false } as WatchdogRoleView],
    queues: [],
    activeDeliveries: 0,
    chainsActive: false,
    pendingConfirmationsTotal: 0,
    pendingConfirmationsByRole: new Map<string, number>(),
    ...over,
  };
}

function makeRig(over: Partial<WatchdogConfig> = {}): Rig {
  const T = { v: 1_700_200_000_000 };
  let current: WatchdogProjectSnapshot = baseSnapshot();
  const deliveries: string[] = [];
  const svc = createWatchdogService({
    projects: () => [P],
    snapshot: () => current,
    deliver: (_r, m) => {
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

test("完成态收束已移除：预热/多窗口/真实活动后静默再久也不投 [系统·收束]", () => {
  const rig = makeRig();
  // 预热 + 数轮真实 settled / activity，再跨过多个旧阈值窗口。
  rig.svc.observe(P, { kind: "settled", roleId: SU, outcome: "completed", at: rig.T.v, fromSystemDelivery: false });
  rig.svc.tick();
  for (const advanceMs of [30_000 - 1, 1, 30_000, 120_000, 600_000]) {
    rig.advance(advanceMs);
    rig.svc.tick();
    assert.equal(closureCount(rig), 0, `静默 +${advanceMs}ms：不得投完成态收束`);
  }
  rig.svc.observe(P, { kind: "activity", reason: "customer-send" });
  rig.svc.tick();
  rig.advance(600_000);
  rig.svc.tick();
  assert.equal(closureCount(rig), 0, "真实活动后仍不投收束（验收通过即结束）");
  assert.equal(rig.deliveries.length, 0, "看护不得产生任何收束投递");
});

test("告警仍保留：队列积压仍投 [系统·看护告警]（收束移除 ≠ 看护失效）", () => {
  const rig = makeRig();
  rig.setSnapshot(baseSnapshot({
    queues: [{
      targetRoleId: "X",
      runtime: "pi",
      items: [{
        kind: "dispatch",
        dedupKey: "k",
        sourceRoleId: SU,
        summary: "积压任务",
        enqueuedAtMs: rig.T.v - (QUEUE_HEAD_AGE_MS + 1),
      }],
    }],
  }));
  rig.svc.tick();
  assert.equal(closureCount(rig), 0, "不投收束");
  assert.ok(
    rig.deliveries.some((text) => text.startsWith(WATCHDOG_ALERT_PREFIX)),
    "队列积压告警仍应投递（告警/恢复保留）",
  );
});
