// test/runtime-core/dispatch-workflow-writer-copy.test.ts
// 2026-11-04 客户决定（方案 A）：工作流由运营（convener）落盘（Section 1 预授权、直接写），
// 保留「先落盘再派发」要求；清除「写盘经确认制 / 列入规划确认 preview」的过时说法。
// 依据：docs/communication/2026-11-04_issue-workflow-md-no-writer.md。
import { test } from "node:test";
import assert from "node:assert/strict";

import { describeTool } from "../../src/provider/runtime/schema.ts";

test("dispatch_task 文案：工作流由运营（convener）落盘（直接写）后再派发；保留工作流先行", () => {
  const tool = describeTool("dispatch_task");
  const description = tool.description ?? "";
  assert.match(description, /工作流由\*\*运营（convener）\*\*落盘到 `docs\/workflow\.md`/);
  assert.match(description, /运营的 Section 1 预授权、直接写即可/);
  assert.match(description, /先落盘再派发/);
  assert.match(description, /\*\*再\*\*派发任务/);
  assert.equal(description.includes("写盘经确认制"), false, "不得再声称工作流走确认制（trio 无对应入口）");
  assert.equal(
    description.includes("把路径列入规划确认的 preview"),
    false,
    "不得再要求把 workflow.md 列入规划确认 preview",
  );
  assert.ok(
    description.includes("缺失（旧项目过渡期）不拒投"),
    "保留既有派发宽容行为的事实陈述（该行为不在本批改动范围）",
  );
});

test("dispatch_task promptGuidelines：同步运营写者口径，保留「先落盘再派发」", () => {
  const tool = describeTool("dispatch_task");
  const guidelines = (tool.promptGuidelines ?? []).join("\n");
  assert.match(guidelines, /工作流由\*\*运营（convener）\*\*落盘到 `docs\/workflow\.md`/);
  assert.match(guidelines, /运营的 Section 1 预授权、直接写即可/);
  assert.match(guidelines, /先落盘再派发/);
  assert.equal(guidelines.includes("路径列入规划确认的 preview"), false);
});
