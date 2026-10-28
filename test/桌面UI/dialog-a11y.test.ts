// test/桌面UI/dialog-a11y.test.ts
// E 批：独立对话框的焦点/键盘/ARIA/误触/二次确认/聊天流无卡守卫。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const DIALOG = readFileSync(new URL("../../app/renderer/src/chat/DecisionDialog.tsx", import.meta.url), "utf8");
const CHAT_ROW = readFileSync(new URL("../../app/renderer/src/chat/ChatRow.tsx", import.meta.url), "utf8");
const CHAT_STREAM = readFileSync(new URL("../../app/renderer/src/chat/ChatStream.tsx", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../../app/renderer/src/shell/phase4a.css", import.meta.url), "utf8");

test("对话框 ARIA/模态：role=dialog、aria-modal、标题/来源/风险描述", () => {
  assert.match(DIALOG, /role="dialog"/);
  assert.match(DIALOG, /aria-modal="true"/);
  assert.match(DIALOG, /aria-labelledby="dd-title"/);
  assert.match(DIALOG, /aria-describedby="dd-source dd-risk"/);
  assert.match(DIALOG, /data-priority=\{view\.priority\}/);
});

test("键盘/焦点：默认焦点不在确认；Esc=稍后处理；Tab 焦点陷阱", () => {
  assert.match(DIALOG, /laterRef\.current\?\.focus/);
  assert.match(DIALOG, /event\.key === "Escape"/);
  assert.match(DIALOG, /defer\(activeId\)/);
  assert.match(DIALOG, /event\.key !== "Tab"/);
  assert.match(DIALOG, /last\.focus\(\)/);
  assert.equal(/autoFocus[^\n]*dd-confirm/.test(DIALOG), false);
});

test("误触/二次确认：破坏性卡需二次确认，提交中禁用，双击不重复回答", () => {
  assert.match(DIALOG, /view\.destructive && !armed/);
  assert.match(DIALOG, /setArmed\(true\)/);
  assert.match(DIALOG, /disabled=\{!canSubmit \|\| busy\}/);
  assert.match(DIALOG, /if \(busy \|\| !canSubmit\) return/);
  assert.match(DIALOG, /ui\.decisionDialog\.secondConfirm/);
});

test("聊天流无卡：operator 行只显示系统通知；无旧可作答卡 DOM/按钮", () => {
  assert.match(CHAT_ROW, /sys-operator-note/);
  for (const forbidden of ["op-request", "op-confirm", "op-deny", "op-submit", "op-options"]) {
    assert.equal(CHAT_ROW.includes(forbidden), false, "ChatRow 不得含 " + forbidden);
    assert.equal(CHAT_STREAM.includes(forbidden), false, "ChatStream 不得含 " + forbidden);
  }
  assert.match(CHAT_STREAM, /客户决定\/审批只在独立对话框/);
});

test("样式：对话框焦点/按钮间距/窄屏可用；决策面板可换行", () => {
  assert.match(CSS, /\.decision-dialog-overlay\s*\{/);
  assert.match(CSS, /\.dd-actions\s*\{[^}]*gap:\s*8px/);
  assert.match(CSS, /@media \(max-width: 480px\)/);
});
