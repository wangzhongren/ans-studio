// test/桌面应用/watchdog-reuse.test.ts
// B 批（2026-10-28）：巡检复用现有 30s watchdog tick——不新增第二个 setInterval；
// 既有四信号（turn-deadline/queue-stuck/cmd-timeout/repeat-fail）保持；start 幂等、stop 清理。
import test from "node:test";
import assert from "node:assert/strict";

import {
  createWatchdogService,
  type WatchdogProjectSnapshot,
  type WatchdogRoleView,
} from "../../app/desktop/watchdog.ts";

function snap(opts: { roles?: WatchdogRoleView[]; queues?: WatchdogProjectSnapshot["queues"]; pending?: number } = {}): WatchdogProjectSnapshot {
  return {
    projectRoot: "/proj",
    governanceRoleId: "chief",
    roles: opts.roles ?? [],
    queues: opts.queues ?? [],
    activeDeliveries: 0,
    chainsActive: false,
    pendingConfirmationsTotal: opts.pending ?? 0,
    pendingConfirmationsByRole: new Map(),
  };
}

function service(snapshot: () => WatchdogProjectSnapshot, env: Record<string, string | undefined> = {}) {
  let now = 0;
  const delivered: string[] = [];
  const svc = createWatchdogService({
    projects: () => ["/proj"],
    snapshot,
    deliver: (_root, message) => { delivered.push(message.text); },
    now: () => now,
    config: { env, patrolIntervalMs: 24 * 60 * 60 * 1000, promptTimeoutOverrideMs: 120_000, turnLastResortOverrideMs: 3_600_000 },
  });
  return { svc, delivered, setNow: (value: number) => { now = value; } };
}

test("复用单一 tick：start 只创建一个 setInterval（幂等）；巡检/日志静默不新增定时器", () => {
  const h = service(() => snap());
  const original = globalThis.setInterval;
  let count = 0;
  globalThis.setInterval = ((callback: () => void, ms?: number) => {
    count += 1;
    return original(callback, ms);
  }) as typeof setInterval;
  try {
    h.svc.start();
    h.svc.start();
    assert.equal(count, 1);
    assert.equal(h.svc.running(), true);
  } finally {
    globalThis.setInterval = original;
    h.svc.stop();
  }
  assert.equal(h.svc.running(), false);
});

test("既有信号 #1：轮次到点检查仍工作（budget/挂起卡语义不变）", () => {
  const role: WatchdogRoleView = { roleId: "worker", runtime: "demo", busy: true, builtIn: true, turnStartedAt: 0, turnId: "t-1", taskId: "task-1", lastActivityAt: 0 };
  const h = service(() => snap({ roles: [role] }));
  h.svc.tick();
  h.setNow(120_000);
  h.svc.tick();
  assert.ok(h.delivered.some((text) => /轮次到点检查/.test(text)));
});

test("既有信号 #2/#3/#4 仍工作（队列积压/命令超时/重复失败）", () => {
  // #2 队列积压
  {
    let now = 0;
    const delivered: string[] = [];
    const svc = createWatchdogService({
      projects: () => ["/proj"],
      snapshot: () => snap({ queues: [{ targetRoleId: "worker", runtime: "demo", items: [{ kind: "dispatch", dedupKey: "d1", sourceRoleId: "chief", summary: "任务", enqueuedAtMs: 0 }] }] }),
      deliver: (_root, message) => { delivered.push(message.text); },
      now: () => now,
      config: { env: {}, patrolIntervalMs: 24 * 60 * 60 * 1000 },
    });
    svc.tick();
    now = 10 * 60 * 1000;
    svc.tick();
    assert.ok(delivered.some((text) => /投递排队积压/.test(text)));
    svc.stop();
  }
  // #3 命令超时
  {
    const delivered: string[] = [];
    const svc = createWatchdogService({
      projects: () => ["/proj"],
      snapshot: () => snap(),
      deliver: (_root, message) => { delivered.push(message.text); },
      now: () => 0,
      config: { env: {}, patrolIntervalMs: 24 * 60 * 60 * 1000 },
    });
    svc.observe("/proj", { kind: "command-timed-out", roleId: "worker", at: 0 });
    assert.ok(delivered.some((text) => /命令超时/.test(text)));
    svc.stop();
  }
  // #4 重复失败
  {
    let now = 0;
    const delivered: string[] = [];
    const svc = createWatchdogService({
      projects: () => ["/proj"],
      snapshot: () => snap(),
      deliver: (_root, message) => { delivered.push(message.text); },
      now: () => now,
      config: { env: {}, patrolIntervalMs: 24 * 60 * 60 * 1000 },
    });
    for (let i = 0; i < 3; i += 1) svc.observe("/proj", { kind: "settled", roleId: "worker", outcome: "failed", at: i, fromSystemDelivery: false });
    svc.tick();
    assert.ok(delivered.some((text) => /重复失败/.test(text)));
    svc.stop();
  }
});
