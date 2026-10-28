// test/桌面UI/i18n-b1-b2.test.ts
// E 批：决策对话框/任务面板新增 key 的中英 parity 与泄漏守卫。

import assert from "node:assert/strict";
import { test } from "node:test";

import { zhCN } from "../../src/common/shared/i18n/messages/zh-CN.ts";
import { enUS } from "../../src/common/shared/i18n/messages/en-US.ts";

const HAN = /\p{Script=Han}/u;
const DECISION_KEYS = [
  "ui.decisionDialog.title",
  "ui.decisionDialog.panelTitle",
  "ui.decisionDialog.later",
  "ui.decisionDialog.confirm",
  "ui.decisionDialog.reject",
  "ui.decisionDialog.submit",
  "ui.decisionDialog.pendingMore",
  "ui.decisionDialog.secondConfirm",
  "ui.decisionDialog.todo",
  "ui.decisionDialog.history",
  "ui.decisionDialog.open",
  "ui.decisionDialog.judge",
] as const;
const TASK_KEYS = [
  "ui.taskCenter.title",
  "ui.taskCenter.tasks",
  "ui.taskCenter.logs",
  "ui.taskCenter.closeTask",
  "ui.taskCenter.terminate",
  "ui.taskCenter.redispatch",
  "ui.roleLog.status.normal",
  "ui.roleLog.status.slow",
  "ui.roleLog.status.stuck",
  "ui.roleLog.status.waiting",
] as const;

test("decisionDialog/taskCenter key 中英成对", () => {
  for (const key of [...DECISION_KEYS, ...TASK_KEYS]) {
    assert.ok(key in zhCN, `zh-CN 缺 ${key}`);
    assert.ok(key in enUS, `en-US 缺 ${key}`);
  }
});

test("决策/任务新 key 英文无中文泄漏", () => {
  for (const key of [...DECISION_KEYS, ...TASK_KEYS]) {
    const value = enUS[key as keyof typeof enUS];
    const texts = typeof value === "string" ? [value] : Object.values(value);
    assert.equal(texts.some((text) => HAN.test(text)), false, `en-US 泄漏中文：${key}`);
  }
});
