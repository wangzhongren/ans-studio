// test/桌面应用/log-patrol.test.ts
// B 批（2026-10-28）：10 分钟巡检——复用看护 tick；仅 busy 且有活动任务的内置角色；
// 首 tick 只登记基准；patrolPending 最多 1，连续跳过记诊断/系统行；settled 清零；无假卡。
import test from "node:test";
import assert from "node:assert/strict";

import { createWatchdogService, PATROL_INTERVAL_MS, type WatchdogProjectSnapshot, type WatchdogRoleView } from "../../app/desktop/watchdog.ts";

function snapshot(roles: WatchdogRoleView[], governanceRoleId = "chief"): WatchdogProjectSnapshot {
  return {
    projectRoot: "/proj",
    governanceRoleId,
    roles,
    queues: [],
    activeDeliveries: 0,
    chainsActive: false,
    pendingConfirmationsTotal: 0,
    pendingConfirmationsByRole: new Map(),
  };
}

function service(initialRoles: WatchdogRoleView[], opts: { now: () => number; roles?: () => WatchdogRoleView[] }) {
  const delivered: { text: string; summary: string; dedupKey: string }[] = [];
  let roles = initialRoles;
  const svc = createWatchdogService({
    projects: () => ["/proj"],
    snapshot: () => snapshot(opts.roles ? opts.roles() : roles),
    deliver: (_root, message) => { delivered.push(message); },
    now: opts.now,
    config: { env: {}, patrolIntervalMs: PATROL_INTERVAL_MS },
  });
  return { svc, delivered, setRoles: (next: WatchdogRoleView[]) => { roles = next; } };
}

const busyChief: WatchdogRoleView = {
  roleId: "chief",
  runtime: "demo",
  busy: true,
  builtIn: true,
  taskId: "t-1",
  turnStartedAt: 0,
  lastActivityAt: 0,
  lastAction: "tool.result：write_file",
};

test("首 tick 只登记基准；10 分钟到点发一条巡检；空项目/无 busy 内置角色不发", () => {
  let now = 0;
  const h = service([busyChief], { now: () => now });
  h.svc.tick();
  assert.equal(h.delivered.length, 0, "启动瞬间不发巡检");
  now = PATROL_INTERVAL_MS - 1;
  h.svc.tick();
  assert.equal(h.delivered.length, 0);
  now = PATROL_INTERVAL_MS;
  h.svc.tick();
  assert.equal(h.delivered.length, 1);
  assert.match(h.delivered[0].text, /^\[系统·巡检\]/);
  assert.match(h.delivered[0].text, /task=t-1/);
  assert.match(h.delivered[0].text, /最后日志=/);
  assert.match(h.delivered[0].text, /最近动作=tool\.result/);
  assert.match(h.delivered[0].text, /静默=/);
  assert.match(h.delivered[0].text, /状态=/);
  assert.match(h.delivered[0].text, /不构成任何授权/);
  h.svc.stop();
});

test("等待/闲置角色不巡检；项目 worker（非内置）默认不列入巡检", () => {
  let now = 0;
  const h = service([{ ...busyChief, busy: false }, { ...busyChief, roleId: "worker", builtIn: false }], { now: () => now });
  h.svc.tick();
  for (now = PATROL_INTERVAL_MS; now <= PATROL_INTERVAL_MS * 3; now += PATROL_INTERVAL_MS) h.svc.tick();
  assert.equal(h.delivered.filter((message) => message.text.startsWith("[系统·巡检]")).length, 0);
  h.svc.stop();
});

test("patrolPending 最多 1：未结算跳过并计数；连续 2 次跳过发系统行；幕僚 settled 后恢复巡检", () => {
  let now = 0;
  const h = service([busyChief], { now: () => now });
  h.svc.tick();
  now = PATROL_INTERVAL_MS;
  h.svc.tick();
  assert.equal(h.delivered.length, 1);
  // 未结算：连续两个 10 分钟窗口跳过（第 2 次跳过发系统行）。
  now = PATROL_INTERVAL_MS * 2;
  h.svc.tick();
  assert.equal(h.delivered.length, 1);
  now = PATROL_INTERVAL_MS * 3;
  h.svc.tick();
  assert.equal(h.delivered.length, 2);
  assert.match(h.delivered[1].text, /巡检已连续跳过 2 次|已连续跳过/);
  // 幕僚结算 ⇒ pending 清零；下一窗口恢复巡检。
  h.svc.observe("/proj", { kind: "settled", roleId: "chief", outcome: "completed", at: now, fromSystemDelivery: true });
  now = PATROL_INTERVAL_MS * 4;
  h.svc.tick();
  assert.equal(h.delivered.length, 3);
  assert.match(h.delivered[2].text, /^\[系统·巡检\]/);
  h.svc.stop();
});

test("巡检内容为纯系统消息（无客户卡/无裁决语义）", () => {
  let now = 0;
  const h = service([busyChief], { now: () => now });
  h.svc.tick();
  now = PATROL_INTERVAL_MS;
  h.svc.tick();
  const text = h.delivered[0].text;
  assert.doesNotMatch(text, /request_choice|request_confirmation|customer\.decision|验收通过/);
  assert.match(text, /读日志/);
  assert.match(text, /终止并重派/);
  h.svc.stop();
});
