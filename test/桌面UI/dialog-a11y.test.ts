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
  assert.match(DIALOG, /options\?\.allowCancel !== true/);
  assert.match(DIALOG, /cancelled: true \}, \{ allowCancel: true \}/);
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

test("验收决定卡：本地化徽标/原文区/O2 路径；preview 仍为纯文本 pre", () => {
  assert.match(DIALOG, /view\.acceptance \? t\("ui\.decisionDialog\.acceptanceKind"\) : view\.cardKind/);
  assert.match(DIALOG, /className="dd-acceptance-report"/);
  assert.match(DIALOG, /aria-label=\{t\("ui\.decisionDialog\.acceptanceReportTitle"\)\}/);
  assert.match(DIALOG, /ui\.decisionDialog\.reportPath/);
  assert.match(DIALOG, /dangerouslySetInnerHTML=\{markdownHtml\(acceptanceReport\.text\)\}/);
  assert.match(DIALOG, /<pre className="dd-preview">\{view\.preview\}<\/pre>/);
  assert.equal(/<pre[^>]*dangerouslySetInnerHTML/.test(DIALOG), false);
  assert.equal(/<details[^>]*>[\s\S]{0,200}<pre className="dd-preview"/.test(DIALOG), false);
});

test("验收危险色优先：决定卡 compound 规则在冷色之后；窄屏原文区可换行", () => {
  const acceptance = CSS.indexOf(".decision-dialog.is-acceptance {");
  const highRisk = CSS.indexOf(".decision-dialog.is-acceptance.is-high-risk");
  const destructive = CSS.indexOf(".decision-dialog.is-acceptance.is-destructive");
  assert.ok(acceptance >= 0, "缺少 .decision-dialog.is-acceptance");
  assert.ok(highRisk > acceptance, "高风险规则必须写在验收冷色之后");
  assert.ok(destructive > acceptance, "破坏性规则必须写在验收冷色之后");
  assert.match(CSS, /\.dd-acceptance-body\s*\{[^}]*max-height:\s*46vh/);
  assert.match(CSS, /@media \(max-width: 480px\)[\s\S]*\.dd-acceptance-body/);
});
