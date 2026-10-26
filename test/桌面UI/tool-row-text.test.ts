// test/桌面UI/tool-row-text.test.ts
// 2026-10-25 工具行单行化：多行命令归一/截断、title 全文、状态列不换行、失败原因短后缀、
// composer 聚焦冷色环。纯函数 + 样式源码守卫。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeToolRowText,
  toolRowTextDisplay,
  truncateToolRowText,
} from "../../app/renderer/src/chat/tool-row-text.ts";
import { extractToolErrorReason } from "../../app/renderer/src/chat/tool-error.ts";

const SHELL_CSS = readFileSync(
  new URL("../../app/renderer/src/shell/shell.css", import.meta.url),
  "utf8",
);
const PHASE4A_CSS = readFileSync(
  new URL("../../app/renderer/src/shell/phase4a.css", import.meta.url),
  "utf8",
);
const CHAT_ROW = readFileSync(
  new URL("../../app/renderer/src/chat/ChatRow.tsx", import.meta.url),
  "utf8",
);

function ruleBody(source: string, selector: string): string {
  const start = source.indexOf(selector + " {");
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

test("多行/连续空白命令归一为单行，展示截断 ≤72 且 title 保留全文", () => {
  const raw =
    "node -e \"const f=require('fs');\nconst p=['C:/Program Files/Edge/msedge.exe',\n  'C:/Program Files/Chrome/chrome.exe']\"";
  assert.equal(normalizeToolRowText(raw).includes("\n"), false);
  const view = toolRowTextDisplay(raw);
  assert.ok(view.display.length <= 72);
  assert.equal(view.display.endsWith("…"), true);
  assert.equal(view.title, normalizeToolRowText(raw));
  assert.equal(view.title.includes("C:/Program Files/Chrome/chrome.exe"), true);
  assert.equal(view.display.includes("\n"), false);
});

test("短文本原样；超长按字符截断；空值返回空串", () => {
  assert.equal(normalizeToolRowText("  npm   test  "), "npm test");
  assert.equal(truncateToolRowText("npm test"), "npm test");
  assert.equal(truncateToolRowText("x".repeat(200), 72).length, 72);
  assert.equal(truncateToolRowText("x".repeat(200), 72).endsWith("…"), true);
  assert.equal(truncateToolRowText(""), "");
  assert.equal(truncateToolRowText(undefined), "");
});

test("失败原因短后缀 ≤48；完整错误仍由展开区承载", () => {
  const full =
    "request_choice 执行失败（request_choice：未获客户同意（原因：客户拒绝（团队计划 docs/scheduling/wukong-2d-team-v1.md 不完整：团队计划角色表缺少必需列（类型/module/职责目标）；团队计划缺少推荐角色 dev-entities 的角色行）→ 不要写盘；如实告知客户，不得假设同意。））";
  const reason = extractToolErrorReason(full, {
    toolName: "request_choice",
    maxLength: 48,
  });
  assert.ok(reason.length <= 48);
  assert.equal(reason.endsWith("…"), true);
  assert.equal(full.includes(reason.slice(0, -1)), true);
});

test("工具行 CSS：summary 单行、target 省略、状态列 nowrap、ActivityRow 同口径", () => {
  const summary = ruleBody(SHELL_CSS, ".tool-call-record > summary");
  assert.match(summary, /flex-wrap:\s*nowrap/);
  assert.match(summary, /min-height:\s*24px/);
  const time = ruleBody(SHELL_CSS, ".tool-call-record > summary > .tool-call-time");
  assert.match(time, /flex:\s*0 0 42px/);
  assert.match(time, /white-space:\s*nowrap/);
  const target = ruleBody(SHELL_CSS, ".tool-call-target");
  assert.match(target, /min-width:\s*0/);
  assert.match(target, /text-overflow:\s*ellipsis/);
  assert.match(target, /white-space:\s*nowrap/);
  const status = ruleBody(SHELL_CSS, ".tool-call-status");
  assert.match(status, /flex:\s*0 0 auto/);
  assert.match(status, /white-space:\s*nowrap/);
  assert.match(status, /text-overflow:\s*ellipsis/);
  const activityTarget = ruleBody(SHELL_CSS, ".activity-target");
  assert.match(activityTarget, /white-space:\s*nowrap/);
  assert.match(activityTarget, /text-overflow:\s*ellipsis/);
  const activityState = ruleBody(SHELL_CSS, ".activity-state");
  assert.match(activityState, /white-space:\s*nowrap/);
});

test("ChatRow：target 统一走单行 helper 并带 title 全文；失败原因 maxLength=48", () => {
  assert.match(CHAT_ROW, /toolRowTextDisplay/);
  assert.match(CHAT_ROW, /title=\{targetView\.title\}/);
  assert.match(CHAT_ROW, /maxLength:\s*48/);
  assert.match(CHAT_ROW, /targetTitle=\{targetView\.title\}/);
});

test("composer 聚焦：冷色 info 环 ≥2px，textarea 自身不叠绿环；pi-input 同口径", () => {
  const capsule = ruleBody(SHELL_CSS, ".capsule:focus-within");
  assert.match(capsule, /var\(--info/);
  assert.match(capsule, /0 0 0 2px var\(--info-border\)/);
  assert.equal(capsule.includes("var(--primary)"), false);
  const input = ruleBody(SHELL_CSS, "#inp-message:focus-visible");
  assert.match(input, /outline:\s*none/);
  const piInput = ruleBody(PHASE4A_CSS, ".pi-input:focus-visible");
  assert.match(piInput, /var\(--info\)/);
  assert.equal(piInput.includes("var(--ring)"), false);
});
