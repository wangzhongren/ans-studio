// test/桌面UI/status.test.ts
// Phase 3A 纯逻辑：角色状态优先级与徽标文案。

import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveRoleStatus,
  statusBadge,
  STOPPED_LABEL,
} from "../../app/renderer/src/chat/status.ts";

test("状态优先级：等待确认 > 工作中（busy/队列）> 错误 > 空闲/已停止/已恢复/未开启", () => {
  assert.equal(
    deriveRoleStatus({ awaitingConfirm: true, busy: true, error: true }),
    "awaiting-confirm",
  );
  assert.equal(deriveRoleStatus({ busy: true, error: true }), "working");
  assert.equal(deriveRoleStatus({ queueDepth: 2, error: true }), "working");
  assert.equal(deriveRoleStatus({ error: true }), "error");
  assert.equal(deriveRoleStatus({ live: true }), "idle");
  assert.equal(deriveRoleStatus({ hadSession: true }), "stopped");
  assert.equal(deriveRoleStatus({ restored: true }), "idle-restored");
  assert.equal(deriveRoleStatus({}), "not-opened");
  assert.equal(deriveRoleStatus({ busy: false, queueDepth: 0, error: true }), "error");
});

test("徽标：working 类名/队列后缀/停止唯一措辞", () => {
  const working = statusBadge("working", 2);
  assert.equal(working.className, "st-working");
  assert.equal(working.label, "工作中 · 2 待办");
  assert.ok(working.title.includes("已入队"));
  const error = statusBadge("error", 0);
  assert.equal(error.className, "st-error");
  assert.equal(error.label, "错误");
  assert.equal(statusBadge("stopped").label, STOPPED_LABEL);
  assert.equal(statusBadge("awaiting-confirm").className, "st-confirm");
});
