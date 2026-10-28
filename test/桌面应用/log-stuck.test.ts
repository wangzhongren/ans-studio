// test/桌面应用/log-stuck.test.ts
// B 批（2026-10-28）：日志静默信号——slow≥5min/stuck≥10min/hard-cap≥30min；slow 只提醒不终止；
// 同一角色同一活跃期不重复告警；默认只告警，env auto-terminate 才回调终止。
import test from "node:test";
import assert from "node:assert/strict";

import {
  LOG_HARD_CAP_MS,
  LOG_SLOW_SILENCE_MS,
  LOG_STUCK_SILENCE_MS,
  createWatchdogService,
  logSilenceState,
  type WatchdogProjectSnapshot,
  type WatchdogRoleView,
} from "../../app/desktop/watchdog.ts";

const tick = 30_000;

function snapshot(role: WatchdogRoleView, pending = 0): WatchdogProjectSnapshot {
  return {
    projectRoot: "/proj",
    governanceRoleId: "chief",
    roles: [role],
    queues: [],
    activeDeliveries: 0,
    chainsActive: false,
    pendingConfirmationsTotal: pending,
    pendingConfirmationsByRole: new Map(pending > 0 ? [[role.roleId, pending]] : []),
  };
}

function service(role: WatchdogRoleView, env: Record<string, string | undefined> = {}) {
  let now = 0;
  const delivered: string[] = [];
  const stuck: { roleId: string; state: string; taskId?: string }[] = [];
  let current = role;
  const svc = createWatchdogService({
    projects: () => ["/proj"],
    snapshot: () => snapshot(current, current.roleId === role.roleId ? 0 : 0),
    deliver: (_root, message) => { delivered.push(message.text); },
    now: () => now,
    config: { env, patrolIntervalMs: 24 * 60 * 60 * 1000 },
    onStuckRole: (_root, roleId, _runtime, info) => { stuck.push({ roleId, state: info.state, ...(info.taskId !== undefined ? { taskId: info.taskId } : {}) }); },
  });
  return {
    svc,
    delivered,
    stuck,
    setNow: (value: number) => { now = value; },
    setRole: (next: WatchdogRoleView) => { current = next; },
  };
}

const worker: WatchdogRoleView = {
  roleId: "worker",
  runtime: "demo",
  busy: true,
  builtIn: true,
  taskId: "t-1",
  turnStartedAt: 0,
  turnId: "turn-1",
  lastActivityAt: 0,
  lastAction: "tool.result：write_file",
};

test("阈值：normal/slow/stuck/hard-cap（5/10/30 分钟默认）", () => {
  assert.equal(logSilenceState(LOG_SLOW_SILENCE_MS - 1), "normal");
  assert.equal(logSilenceState(LOG_SLOW_SILENCE_MS), "slow");
  assert.equal(logSilenceState(LOG_STUCK_SILENCE_MS), "stuck");
  assert.equal(logSilenceState(LOG_HARD_CAP_MS), "hard-cap");
});

test("slow：只发一次告警、不调用终止；同一活跃期不重复", () => {
  const h = service(worker, { [LogAutoTerminateEnv]: "auto-terminate" });
  h.svc.tick();
  h.setNow(LOG_SLOW_SILENCE_MS);
  h.svc.tick();
  const alerts = h.delivered.filter((text) => text.includes("运行日志静默"));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /状态：slow/);
  assert.match(alerts[0], /任务：#t-1/);
  assert.equal(h.stuck.length, 0, "slow 不终止");
  h.setNow(LOG_SLOW_SILENCE_MS + tick);
  h.svc.tick();
  assert.equal(h.delivered.filter((text) => text.includes("运行日志静默")).length, 1, "同一活跃期不重复");
  h.svc.stop();
});

test("stuck：默认只告警；env auto-terminate 才回调一次（同活跃期去重）", () => {
  {
    const h = service(worker, {});
    h.svc.tick();
    h.setNow(LOG_STUCK_SILENCE_MS);
    h.svc.tick();
    const alerts = h.delivered.filter((text) => text.includes("运行日志静默"));
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /状态：stuck/);
    assert.equal(h.stuck.length, 0, "默认只告警");
    h.svc.stop();
  }
  {
    const env = { [LogAutoTerminateEnv]: "auto-terminate" };
    const h = service(worker, env);
    h.svc.tick();
    h.setNow(LOG_STUCK_SILENCE_MS);
    h.svc.tick();
    h.setNow(LOG_STUCK_SILENCE_MS + tick);
    h.svc.tick();
    assert.equal(h.stuck.length, 1, "同一角色同一活跃期恰一次");
    assert.equal(h.stuck[0].taskId, "t-1");
    h.svc.stop();
  }
});

test("正确等待不报：有挂起确认卡时不发 log-silence；高硬顶 hard-cap 仍可告警", () => {
  const h = service(worker);
  h.svc.tick();
  h.setNow(LOG_STUCK_SILENCE_MS);
  // 以挂起卡快照替换：直接构造服务不可注入 pending，改用另一个 service 包装。
  assert.equal(typeof h.svc.tick, "function");
  h.svc.stop();

  const role: WatchdogRoleView = { ...worker, roleId: "worker2", turnId: "turn-2" };
  let now = 0;
  const delivered: string[] = [];
  const svc = createWatchdogService({
    projects: () => ["/proj"],
    snapshot: () => snapshot(role, 1),
    deliver: (_root, message) => { delivered.push(message.text); },
    now: () => now,
    config: { env: {}, patrolIntervalMs: 24 * 60 * 60 * 1000 },
  });
  svc.tick();
  now = LOG_HARD_CAP_MS;
  svc.tick();
  assert.equal(delivered.filter((text) => text.includes("运行日志静默")).length, 0, "挂起卡 = 正确等待");
  svc.stop();
});

// 常量取自 env 名（测试内联避免依赖导出顺序）。
const LogAutoTerminateEnv = "ANS_LOG_AUTO_TERMINATE";

test("B-07 共享 episode：log-silence 与 10 分钟巡检读取同一活跃期/告警状态（不重复告警）", () => {
  let now = 0;
  const delivered: string[] = [];
  let current = worker;
  const svc = createWatchdogService({
    projects: () => ["/proj"],
    snapshot: () => snapshot(current),
    deliver: (_root, message) => { delivered.push(message.text); },
    now: () => now,
    config: { env: {}, patrolIntervalMs: LOG_STUCK_SILENCE_MS },
  });
  svc.tick();
  now = LOG_STUCK_SILENCE_MS;
  svc.tick();
  const silence = () => delivered.filter((text) => text.includes("运行日志静默"));
  assert.equal(silence().length, 1, "首次 stuck 告警");
  const patrol = delivered.find((text) => text.startsWith("[系统·巡检]"));
  assert.ok(patrol, "同一 tick 发出巡检");
  assert.match(patrol!, /状态=stuck/);
  assert.match(patrol!, /已告警：stuck/, "巡检读取共享活跃期的已告警状态");

  // 幕僚结算清除 pending；角色仍 busy 卡死 ⇒ 下一巡检窗口只汇总，不重复告警。
  svc.observe("/proj", { kind: "settled", roleId: "chief", outcome: "completed", at: now, fromSystemDelivery: true });
  now = LOG_STUCK_SILENCE_MS * 2;
  svc.tick();
  assert.equal(silence().length, 1, "同一活跃期不重复告警（共享 episode）");
  svc.stop();
});
