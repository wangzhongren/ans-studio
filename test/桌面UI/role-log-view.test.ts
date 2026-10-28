// test/桌面UI/role-log-view.test.ts
// E 批：角色运行日志徽标（正常/迟滞/卡死/等待）/最后日志/最近动作纯逻辑。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  ROLE_LOG_SLOW_MS,
  ROLE_LOG_STUCK_MS,
  lastLogActionFromText,
  lastLogTimeFromText,
  roleLogBadgeView,
  roleLogStatus,
} from "../../app/renderer/src/chat/role-log-view.ts";

const NOW = Date.parse("2026-10-28T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

test("状态：等待 > 卡死 > 迟滞 > 正常", () => {
  assert.equal(roleLogStatus({ busy: true, pending: 1, now: NOW }), "waiting");
  assert.equal(roleLogStatus({ busy: true, pending: 0, lastActivityAt: ago(ROLE_LOG_STUCK_MS + 1), now: NOW }), "stuck");
  assert.equal(roleLogStatus({ busy: true, pending: 0, lastActivityAt: ago(ROLE_LOG_SLOW_MS + 1), now: NOW }), "slow");
  assert.equal(roleLogStatus({ busy: true, pending: 0, lastActivityAt: ago(1000), now: NOW }), "normal");
  assert.equal(roleLogStatus({ busy: false, pending: 0, now: NOW }), "normal");
});

test("徽标类名/文案与最后日志/最近动作提取", () => {
  const badge = roleLogBadgeView({ busy: true, pending: 0, lastActivityAt: ago(ROLE_LOG_STUCK_MS + 1), now: NOW });
  assert.equal(badge.status, "stuck");
  assert.match(badge.className, /is-stuck/);
  const text = "2026-10-28T11:00:00.000Z role=worker action=report\n2026-10-28T11:05:00.000Z role=worker action=idle";
  assert.equal(lastLogTimeFromText(text), "2026-10-28T11:05:00.000Z");
  assert.match(lastLogActionFromText(text), /action=idle/);
});

const TASK_CENTER = readFileSync(new URL("../../app/renderer/src/chat/TaskCenterPanel.tsx", import.meta.url), "utf8");

test("任务/日志面板：任务卡、短报、收口/终止/重派入口、日志徽标与视图", () => {
  for (const marker of ["task-card", "task-status", "task-report", "closeTask", "terminate", "redispatch", "role-log-select", "role-log-view", "ui.taskCenter.logs"]) {
    assert.equal(TASK_CENTER.includes(marker), true, marker);
  }
  assert.match(TASK_CENTER, /listTasks/);
  assert.match(TASK_CENTER, /readRoleActivityLog/);
});
