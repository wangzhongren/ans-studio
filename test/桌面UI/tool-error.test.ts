// test/桌面UI/tool-error.test.ts
// 工具失败原因归一化（2026-10-25）：嵌套括号/单层失败/无中文标点/空串/超长文本。
// 纯函数实现 = app/renderer/src/chat/tool-error.ts；不依赖 DOM/存储。

import test from "node:test";
import assert from "node:assert/strict";
import {
  extractToolErrorReason,
  normalizeToolErrorText,
  toolDetailsContainText,
  toolFailureFullText,
  truncateToolErrorReason,
} from "../../app/renderer/src/chat/tool-error.ts";
import type { ActivityItem } from "../../app/renderer/src/chat/types.ts";

const NESTED =
  "request_choice 执行失败（request_choice：未获客户同意（原因：客户拒绝（团队计划 docs/scheduling/wukong-2d-team-v1.md 不完整：团队计划角色表缺少必需列（类型/module/职责目标/能力要求/授权目录/公开契约/测试面/依赖/dependsOn/并行组/组别/apiSpec/粒度理由）；团队计划缺少推荐角色 dev-entities 的角色行；…）→ 不要写盘；如实告知客户，不得假设同意。））";

test("嵌套括号：取最内层「原因：」并剥掉工具名前缀/包装括号", () => {
  const reason = extractToolErrorReason(NESTED, { toolName: "request_choice" });
  assert.match(reason, /^团队计划 docs\/scheduling\/wukong-2d-team-v1\.md 不完整/);
  assert.ok(reason.includes("团队计划角色表缺少必需列"));
  assert.equal(reason.includes("request_choice"), false);
  assert.equal(reason.includes("原因："), false);
  assert.equal(reason.includes("客户拒绝（"), false);
});

test("多「原因：」取最内层，并丢掉截取后未闭合的右括号", () => {
  const reason = extractToolErrorReason(
    "write_file 执行失败（write_file：未获客户同意（原因：客户拒绝（原因：目标目录不在授权范围）→ 不要写盘））",
    { toolName: "write_file" },
  );
  assert.equal(reason, "目标目录不在授权范围");
});

test("原文被截断（右括号不在文本内）仍剥掉「客户拒绝（」包装词", () => {
  const truncated = NESTED.slice(0, 260);
  const reason = extractToolErrorReason(truncated, { toolName: "request_choice" });
  assert.match(reason, /^团队计划 docs\/scheduling\/wukong-2d-team-v1\.md 不完整/);
  assert.equal(reason.includes("客户拒绝（"), false);
  assert.equal(reason.length, 72);
});

test("单层失败：保留人类可读句子，不误伤括号", () => {
  assert.equal(
    extractToolErrorReason("read_file 执行失败：文件不存在（docs/missing.md）", {
      toolName: "read_file",
    }),
    "文件不存在（docs/missing.md）",
  );
});

test("无中文标点 / 英文状态：去掉工具名与 failed 前缀", () => {
  assert.equal(
    extractToolErrorReason("run_shell failed: exit code 1", { toolName: "run_shell" }),
    "exit code 1",
  );
  assert.equal(
    extractToolErrorReason("error: connection reset"),
    "connection reset",
  );
});

test("空字符串/纯空白：返回空串，不发明原因", () => {
  assert.equal(extractToolErrorReason(""), "");
  assert.equal(extractToolErrorReason("   \r\n\t "), "");
  assert.equal(extractToolErrorReason(undefined as unknown as string), "");
});

test("超长文本：截断到 72 字符（含省略号）", () => {
  const reason = extractToolErrorReason("x".repeat(300), { toolName: "" });
  assert.equal(reason.length, 72);
  assert.equal(reason.endsWith("…"), true);
  assert.equal(reason.slice(0, -1), "x".repeat(71));
  assert.equal(truncateToolErrorReason("abc", 72), "abc");
  assert.equal(truncateToolErrorReason("abcdef", 4), "abc…");
});

test("重复工具名前缀去重；无法解析时回退首句", () => {
  assert.equal(
    extractToolErrorReason("request_choice request_choice 执行失败（request_choice：未获客户同意）", {
      toolName: "request_choice",
    }),
    "未获客户同意",
  );
  assert.equal(
    extractToolErrorReason("run_shell 执行失败：第一句。第二句不应出现", {
      toolName: "run_shell",
    }),
    "第一句",
  );
});

test("normalizeToolErrorText：多行折成单行", () => {
  assert.equal(normalizeToolErrorText("  a\r\n b\t c  "), "a b c");
});

test("toolFailureFullText：summary 更长且含 visibleSummary 时取完整 summary", () => {
  assert.equal(
    toolFailureFullText({ visibleSummary: "第一行", summary: "第一行\n第二行细节" }),
    "第一行\n第二行细节",
  );
  assert.equal(
    toolFailureFullText({ visibleSummary: "唯一文本", summary: "唯一文本" }),
    "唯一文本",
  );
  assert.equal(toolFailureFullText({ summary: "" }), "");
});

test("toolDetailsContainText：display.error 已含全文时复用，不再重复", () => {
  const full = NESTED;
  const withError = {
    toolName: "request_choice",
    summary: full,
    visibleSummary: full,
    display: {
      version: 1,
      error: { text: "前缀 " + full + " 后缀" },
    },
  } as unknown as ActivityItem;
  const withoutError = {
    toolName: "request_choice",
    summary: full,
    visibleSummary: full,
    display: { version: 1, error: { text: "另一段无关文本" } },
  } as unknown as ActivityItem;
  assert.equal(toolDetailsContainText([withError], full), true);
  assert.equal(toolDetailsContainText([withoutError], full), false);
  assert.equal(toolDetailsContainText([], full), false);
  assert.equal(toolDetailsContainText([withError], ""), false);
});

test("toolDetailsContainText：详情原文比 visibleSummary 更完整时按原因命中", () => {
  const visible = NESTED.slice(0, 260); // 被截断的 visibleSummary
  const reason = extractToolErrorReason(visible, { toolName: "request_choice" });
  const detailActivity = {
    toolName: "request_choice",
    summary: visible,
    visibleSummary: visible,
    display: {
      version: 1,
      error: {
        text: "request_choice：未获客户同意（原因：" + NESTED + " 结尾补充说明）",
      },
    },
  } as unknown as ActivityItem;
  assert.equal(toolDetailsContainText([detailActivity], visible, reason), true);
});
