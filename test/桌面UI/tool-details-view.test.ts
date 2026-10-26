// test/桌面UI/tool-details-view.test.ts
// 2026-10-25 工具行展开详情：阶段时间线、命令去重、stdout/stderr 分区、长输出折叠、
// 失败/拒绝状态保留、与判断卡共用详情样式。

import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  splitToolOutput,
  ToolDetailsView,
  toolDetailsModel,
} from "../../app/renderer/src/chat/tool-details-view.ts";
import type { ActivityItem } from "../../app/renderer/src/chat/types.ts";
import { createTranslator } from "../../app/renderer/src/i18n/index.ts";

const t = createTranslator("zh-CN");
const COMMAND = "node -e console.log(1) --long-command";
const LONG_STDOUT = ["安全输出 [REDACTED]", ...Array.from({ length: 19 }, (_, i) => "line " + (i + 2))].join("\n");

function item(extra: Partial<ActivityItem>): ActivityItem {
  return {
    toolName: "run_shell",
    target: "",
    status: "completed",
    statusText: "",
    summary: "",
    ...extra,
  } as ActivityItem;
}

const start = item({
  label: "调用发起",
  at: "2026-10-25T17:14:00.000Z",
  display: {
    version: 1,
    target: { kind: "command", value: { text: COMMAND } },
    omissions: [],
  },
  hasDisplay: true,
});
const result = item({
  label: "执行完成",
  at: "2026-10-25T17:14:05.000Z",
  status: "exited-nonzero",
  display: {
    version: 1,
    target: { kind: "command", value: { text: COMMAND } },
    error: { text: "ENOENT 原始安全错误" },
    resultText: { text: "结果预览" },
    process: {
      exitCode: 2,
      stdout: { text: LONG_STDOUT, redacted: true, truncated: true },
      stderr: { text: "warning: stderr", truncated: false },
      durationMs: 32,
    },
    omissions: ["budget"],
  },
  hasDisplay: true,
});

test("模型：阶段时间线、命令去重、exit code、stdout/stderr/flags", () => {
  const model = toolDetailsModel([start, result], "zh-CN");
  assert.equal(model.commands.length, 1);
  assert.equal(model.commands[0], COMMAND);
  assert.equal(model.timeline.includes("调用发起"), true);
  assert.equal(model.timeline.includes("执行完成"), true);
  assert.equal(model.timeline.includes("exit 2"), true);
  assert.equal(model.exitCode, 2);
  assert.equal(model.durationMs, 32);
  assert.equal(model.stdout?.text, LONG_STDOUT);
  assert.equal(model.stdout?.redacted, true);
  assert.equal(model.stdout?.truncated, true);
  assert.equal(model.stderr?.text, "warning: stderr");
  assert.equal(model.error?.text, "ENOENT 原始安全错误");
  assert.equal(model.resultText?.text, "结果预览");
  assert.deepEqual(model.omissions, ["budget"]);
});

test("失败/拒绝状态追加到阶段时间线", () => {
  const failed = item({
    label: "调用发起",
    status: "failed",
    statusText: "",
    hasDisplay: true,
    display: { version: 1, target: { kind: "command", value: { text: "npm test" } } },
  });
  const denied = item({
    label: "调用发起",
    status: "denied",
    statusText: "",
    hasDisplay: true,
    display: { version: 1, target: { kind: "command", value: { text: "npm test" } } },
  });
  assert.match(toolDetailsModel([failed]).timeline, /执行失败/);
  assert.match(toolDetailsModel([denied]).timeline, /已拒绝/);
});

test("结果文本包含 stdout 时不重复渲染 result 区", () => {
  const merged = item({
    label: "执行完成",
    hasDisplay: true,
    display: {
      version: 1,
      target: { kind: "command", value: { text: "cat a.txt" } },
      resultText: { text: "cat a.txt (exit 0)\nstdout:\nhello\nworld" },
      process: { exitCode: 0, stdout: { text: "hello\nworld" } },
    },
  });
  const model = toolDetailsModel([merged], "zh-CN");
  assert.equal(model.resultText, null);
  assert.equal(model.stdout?.text, "hello\nworld");
});

test("长输出折叠：前 12 行 + 展开全部 +N；短输出不折叠", () => {
  const long = splitToolOutput(LONG_STDOUT, 12);
  assert.equal(long.totalLines, 20);
  assert.equal(long.hiddenLines, 8);
  assert.equal(long.first.split("\n").length, 12);
  assert.equal(long.rest.includes("line 20"), true);
  const short = splitToolOutput("a\nb\nc", 12);
  assert.equal(short.hiddenLines, 0);
  assert.equal(short.rest, "");
});

test("渲染：命令只出现一次，时间线/stdout/stderr/错误/结果/关键字段/折叠齐全", () => {
  const html = renderToStaticMarkup(
    createElement(ToolDetailsView, { items: [start, result], t, locale: "zh-CN" }),
  );
  const text = html.replace(/<[^>]*>/g, "");
  assert.equal(text.split(COMMAND).length - 1, 1, "命令只出现一次");
  assert.match(html, /class="tool-detail-timeline"[^>]*data-stages="2"/);
  assert.match(html, /<pre class="sj-pre"><code>/);
  assert.match(html, /class="sj-d-label">实际命令<\/p>/);
  assert.equal(text.includes("ENOENT 原始安全错误"), true);
  assert.equal(text.includes("退出码：2"), true);
  assert.equal(text.includes("耗时：32 ms"), true);
  assert.equal(text.includes("安全输出 [REDACTED]"), true);
  assert.equal(text.includes("已净化"), true);
  assert.equal(text.includes("已截断"), true);
  assert.equal(text.includes("结果预览"), true);
  assert.match(html, /class="sj-detail-section tool-output is-stderr"/);
  assert.match(html, /data-stream="stdout"/);
  assert.match(html, /class="tool-line-count"[^>]*>20</);
  assert.match(html, /class="tool-output-more"/);
  assert.match(html, /class="tool-output-more-count">\+8</);
  assert.match(html, /展开全文/);
  assert.equal(text.includes("line 20"), true);
  assert.equal(html.includes("部分展示内容因预算省略"), true);
  assert.match(html, /tool-process-meta/);
});

test("无 target 的 display：显示无文件目标提示且不出现失败字样", () => {
  const noTarget = item({
    label: "调用发起",
    status: "completed",
    hasDisplay: true,
    display: { version: 1, omissions: [] },
  });
  const html = renderToStaticMarkup(
    createElement(ToolDetailsView, { items: [noTarget], t, locale: "zh-CN" }),
  );
  const text = html.replace(/<[^>]*>/g, "");
  assert.equal(text.includes("本次调用无文件目标（交互/派发类工具）"), true);
  assert.equal(text.includes("失败"), false);
});

test("无 display：显示 noDetails；不支持详情显示 unsupportedDetail", () => {
  const none = item({ label: "调用发起", status: "completed" });
  const noneHtml = renderToStaticMarkup(
    createElement(ToolDetailsView, { items: [none], t, locale: "zh-CN" }),
  );
  assert.match(noneHtml, /这条历史没有保存更多目标和错误详情/);
  const unsupported = item({
    label: "调用发起",
    hasDisplay: true,
    displayUnsupported: true,
    display: { version: 99 },
  });
  const unsupportedHtml = renderToStaticMarkup(
    createElement(ToolDetailsView, { items: [unsupported], t, locale: "zh-CN" }),
  );
  assert.match(unsupportedHtml, /不支持此详情版本/);
});
