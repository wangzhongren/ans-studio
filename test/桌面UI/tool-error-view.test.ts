// test/桌面UI/tool-error-view.test.ts
// 工具失败卡片组件渲染（react-dom/server，无浏览器）：
// summary 不含完整长文、失败徽标存在、展开区仍含全文、无弹窗/live region。

import test from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ToolErrorFullEntry,
  ToolErrorSummary,
  type ToolErrorSummaryProps,
} from "../../app/renderer/src/chat/tool-error-view.ts";
import { extractToolErrorReason } from "../../app/renderer/src/chat/tool-error.ts";

const NESTED =
  "request_choice 执行失败（request_choice：未获客户同意（原因：客户拒绝（团队计划 docs/scheduling/wukong-2d-team-v1.md 不完整：团队计划角色表缺少必需列（类型/module/职责目标/能力要求/授权目录/公开契约/测试面/依赖/dependsOn/并行组/组别/apiSpec/粒度理由）；团队计划缺少推荐角色 dev-entities 的角色行；…）→ 不要写盘；如实告知客户，不得假设同意。））";
const LONG = NESTED + "；" + "补充细节".repeat(200);

function renderFailedRow(
  summaryProps: ToolErrorSummaryProps,
  details: ReactNode = null,
) {
  return renderToStaticMarkup(
    createElement(
      "details",
      { className: "tool-call-record", "data-failed": "true" },
      createElement(ToolErrorSummary, summaryProps),
      details,
    ),
  );
}

test("summary 只含工具名/失败徽标/一行原因，不铺完整长文", () => {
  const reason = extractToolErrorReason(LONG, { toolName: "request_choice" });
  const html = renderFailedRow(
    {
      timeText: "14:00",
      timeTitle: "2026-10-25T06:00:33.664Z",
      toolName: "request_choice",
      target: "无文件目标",
      statusLabel: "调用发起 → 执行失败",
      statusClass: "failed",
      reason,
    },
    createElement("div", { className: "tool-call-details" }, LONG),
  );
  const summary =
    html.slice(html.indexOf("<summary"), html.indexOf("</summary>") + "</summary>".length);
  assert.match(summary, /class="tool-error-summary"/);
  assert.match(summary, /<strong>request_choice<\/strong>/);
  assert.match(summary, /class="tool-call-status failed"/);
  assert.match(summary, /<svg[^>]*class="[^"]*lucide[^"]*"/);
  assert.match(summary, /执行失败/);
  assert.match(summary, /class="tool-error-reason"/);
  assert.equal(summary.includes(NESTED), false);
  assert.equal(summary.includes("补充细节".repeat(20)), false);
  assert.equal(summary.includes("tool-call-error"), false);
  const visibleText = summary.replace(/<[^>]*>/g, "");
  assert.ok(visibleText.length < 200, "summary 可见文本应为一行扫读信息");
});

test("展开区仍含全文，且完整入口不重复出现在 summary", () => {
  const reason = extractToolErrorReason(LONG, { toolName: "request_choice" });
  const html = renderFailedRow(
    {
      timeText: "14:00",
      toolName: "request_choice",
      target: "无文件目标",
      statusLabel: "调用发起 → 执行失败",
      reason,
    },
    createElement(
      "div",
      { className: "tool-call-details" },
      createElement(ToolErrorFullEntry, { label: "错误", text: LONG }),
    ),
  );
  const details = html.slice(html.indexOf("</summary>"));
  assert.match(details, /class="tool-call-details"/);
  assert.match(details, /class="tool-error-full"/);
  assert.match(details, /class="tool-error-full-text"/);
  assert.equal(details.includes(LONG), true);
  assert.equal(html.includes("tool-call-error"), false);
});

test("完整错误入口是可聚焦 details/summary，不新增弹窗/live region", () => {
  const html = renderToStaticMarkup(
    createElement(ToolErrorFullEntry, { label: "错误", text: "完整错误原文" }),
  );
  assert.match(html, /^<details class="tool-error-full">/);
  assert.match(html, /<summary>/);
  assert.match(html, /disclosure-chevron/);
  assert.match(html, /完整错误原文/);
  assert.equal(html.includes("dialog"), false);
  assert.equal(html.includes("role=\"alert\""), false);
  assert.equal(html.includes("aria-live"), false);
});

test("无原因时不渲染原因 span，徽标与工具名仍在", () => {
  const html = renderFailedRow(
    {
      timeText: "",
      toolName: "flow_get",
      statusLabel: "执行失败",
      statusClass: "failed",
      reason: "",
    },
    null,
  );
  const summary = html.slice(
    html.indexOf("<summary"),
    html.indexOf("</summary>") + "</summary>".length,
  );
  assert.match(summary, /<strong>flow_get<\/strong>/);
  assert.match(summary, /执行失败/);
  assert.equal(summary.includes("tool-error-reason"), false);
});
