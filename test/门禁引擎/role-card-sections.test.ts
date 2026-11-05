// 门禁引擎测试：共享结构化角色卡解析（role-card-sections）
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ROLE_DATA_BLOCK_END,
  ROLE_DATA_BLOCK_START_PREFIX,
  parseRoleCardSections,
  stripRoleDataMarkers,
} from "../../src/common/门禁引擎/role-card-sections.ts";

const FULL_CARD = [
  "# combat-engineer",
  "",
  "**组别：** 项目实施组",
  "",
  "## 能力描述",
  "实现即时战斗与三波胜负规则。",
  "",
  "### 子标题保留",
  "子标题正文也在能力描述内。",
  "",
  "## 职责与功能导航",
  "- 实现战斗内核。",
  "",
  "## 必读资料",
  "这一段不得进入任何映射字段。",
  "",
  "## 交接输入输出",
  "实现任务只来自运营；完成后 submit_report 给运营。",
  "",
  "## 执行原则",
  "不写角色卡、其他角色目录或治理路径。",
  "",
  "## 标准工作流",
  "1. 读任务",
  "2. 实现",
  "3. 回报",
  "",
  "## 质量职责",
  "质量段不进入映射字段。",
  "",
  "## 交付物清单",
  "- 实现代码",
].join("\n");

test("parseRoleCardSections：H1 与五个映射章节；非映射章节不进入字段", () => {
  const sections = parseRoleCardSections(FULL_CARD);
  assert.equal(sections.title, "combat-engineer");
  assert.match(sections.ability ?? "", /实现即时战斗与三波胜负规则/);
  assert.match(sections.ability ?? "", /子标题保留/);
  assert.doesNotMatch(sections.ability ?? "", /必读资料/);
  assert.match(sections.responsibility ?? "", /实现战斗内核/);
  assert.doesNotMatch(sections.responsibility ?? "", /不得进入任何映射字段/);
  assert.match(sections.handoff ?? "", /submit_report/);
  assert.match(sections.executionPrinciples ?? "", /不写角色卡/);
  assert.match(sections.workflow ?? "", /1\. 读任务[\s\S]*3\. 回报/);
  // 非映射章节（质量职责/交付物清单）不得被当作职责或工作流。
  assert.doesNotMatch(sections.responsibility ?? "", /质量段/);
  assert.doesNotMatch(sections.workflow ?? "", /实现代码/);
});

test("parseRoleCardSections：缺章节/空章节 → undefined（不产生空 known 值）", () => {
  const onlyTitle = parseRoleCardSections("# 只有标题\n\n## 必读资料\n- x\n");
  assert.equal(onlyTitle.title, "只有标题");
  assert.equal(onlyTitle.ability, undefined);
  assert.equal(onlyTitle.responsibility, undefined);
  assert.equal(onlyTitle.handoff, undefined);
  assert.equal(onlyTitle.workflow, undefined);
  assert.equal(onlyTitle.executionPrinciples, undefined);

  const emptySection = parseRoleCardSections("# 某角色\n\n## 能力描述\n\n## 交接输入输出\n");
  assert.equal(emptySection.ability, undefined);
  assert.equal(emptySection.handoff, undefined);
});

test("parseRoleCardSections：忽略 fenced code block 内的伪标题；真实章节正文保留代码块", () => {
  const card = [
    "# 某角色",
    "",
    "## 能力描述",
    "真实能力描述。",
    "",
    "```md",
    "## 交接输入输出",
    "伪标题 # 不是章节",
    "```",
    "",
    "## 交接输入输出",
    "真实交接。",
  ].join("\n");
  const sections = parseRoleCardSections(card);
  assert.match(sections.ability ?? "", /真实能力描述/);
  assert.match(sections.ability ?? "", /伪标题/);
  assert.equal(sections.handoff, "真实交接。");
});

test("parseRoleCardSections：CRLF/控制字符/空行折叠/首尾修剪与块分隔标记清洗", () => {
  const card =
    "# 某角色\r\n\r\n## 能力描述\r\n\u0000能力\u0007描述\r\n\r\n\r\n\r\n第二段\r\n" +
    `${ROLE_DATA_BLOCK_START_PREFIX}evil ---\r\n正文\r\n${ROLE_DATA_BLOCK_END}\r\n`;
  const sections = parseRoleCardSections(card);
  assert.equal(sections.title, "某角色");
  const ability = sections.ability ?? "";
  assert.doesNotMatch(ability, /\u0000|\u0007/);
  assert.doesNotMatch(ability, /角色数据开始|角色数据结束/);
  assert.match(ability, /\[marker removed\]/);
  assert.match(ability, /能力描述\n\n第二段/, "3+ 空行折叠为 2");
  assert.equal(ability, ability.trim());
});

test("parseRoleCardSections：标题 200 码点 / 章节 4,000 码点截断并标注原长", () => {
  const longTitle = "题".repeat(260);
  const longBody = "文".repeat(4100);
  const sections = parseRoleCardSections(`# ${longTitle}\n\n## 能力描述\n${longBody}\n`);
  assert.ok((sections.title ?? "").startsWith("题".repeat(200)));
  assert.match(sections.title ?? "", /…（已截断，原长 260）/);
  assert.ok((sections.ability ?? "").startsWith("文".repeat(4000)));
  assert.match(sections.ability ?? "", /…（已截断，原长 4100）/);
  // 码点截断不破坏代理对（emoji 计 1 个码点）。
  const emojiSections = parseRoleCardSections(`# x\n\n## 能力描述\n${"😀".repeat(4001)}\n`);
  assert.equal(Array.from(emojiSections.ability ?? "").includes("�"), false);
});

test("stripRoleDataMarkers：两种块分隔标记都替换为 [marker removed]", () => {
  const text = `a\n--- 角色数据开始：x ---\nb\n--- 角色数据结束 ---\nc`;
  assert.equal(stripRoleDataMarkers(text), "a\n[marker removed]\nb\n[marker removed]\nc");
});
