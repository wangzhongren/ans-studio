// test/runtime-core/dispatch-workflow-writer-copy.test.ts
// 2026-11-16 KR-33 K3：两个测试名是冻结基线的历史名（不得改名）。断言按 e71501c 后的现行文案与
// 2026-11-04 C1d stable-write 契约更新：运营仍负责 docs/workflow.md，跨角色实现前准备契约与工作流、
// 按地址引用且缺失容忍；实际写 workflow 走 request_stable_write 的客户 stable-write 确认卡，
// 不再声称「Section 1 预授权、直接写」或「先落盘再派发」。
import { test } from "node:test";
import assert from "node:assert/strict";

import { describeTool } from "../../src/provider/runtime/schema.ts";

test("dispatch_task 文案：工作流由运营（convener）落盘（直接写）后再派发；保留工作流先行", () => {
  const tool = describeTool("dispatch_task");
  const description = tool.description ?? "";
  // 现行文案的语义核心：运营职责内的 workflow、跨角色实现前准备、按地址引用、缺失容忍。
  assert.ok(description.includes("运营职责内的 `docs/workflow.md`"), "运营仍是 docs/workflow.md 的职责写者");
  assert.ok(description.includes("需要跨角色实现时，在实际执行动作前准备适用契约"), "跨角色实现前准备契约与工作流");
  assert.ok(description.includes("按地址引用"), "任务文本按地址引用契约与工作流");
  assert.ok(description.includes("不内嵌契约全文"), "不内嵌契约全文");
  assert.ok(description.includes("`docs/workflow.md` 缺失（旧项目过渡期）不拒投"), "保留既有派发宽容行为的事实陈述");
  assert.ok(description.includes("本工具**不写盘、不做治理判定、不改变任何角色的写权**"), "派发工具不写盘");
  // 旧「直接写」模型已被 stable-write 客户确认卡取代，不得回潮。
  assert.equal(description.includes("Section 1 预授权、直接写即可"), false, "不得再声称 Section 1 预授权直接写");
  assert.equal(description.includes("先落盘再派发"), false, "不得再声称工作流先落盘再派发");
  // 现行写路径：request_stable_write 提交内容，客户 stable-write 确认卡批准后由应用写门禁写入。
  const stableWrite = describeTool("request_stable_write");
  const stableDescription = stableWrite.description ?? "";
  assert.match(stableDescription, /stable-write.*客户确认卡/);
  assert.match(stableDescription, /客户批准后才会生成一次性许可/);
  assert.match(stableDescription, /本工具不签发许可、不批准、不直接写文件/);
});

test("dispatch_task promptGuidelines：同步运营写者口径，保留「先落盘再派发」", () => {
  const tool = describeTool("dispatch_task");
  const guidelines = (tool.promptGuidelines ?? []).join("\n");
  assert.ok(guidelines.includes("运营职责内 `docs/workflow.md`"), "guidelines 同步运营 workflow 职责");
  assert.ok(guidelines.includes("按地址引用"), "guidelines 要求按地址引用契约与工作流");
  assert.ok(guidelines.includes("不内嵌契约全文"), "guidelines 要求不内嵌契约全文");
  assert.ok(guidelines.includes("引用的契约文件不存在时投递会被**拒绝**"), "缺失契约拒绝投递的现行口径");
  assert.equal(guidelines.includes("Section 1 预授权、直接写即可"), false, "旧直接写口径不得回潮");
  assert.equal(guidelines.includes("先落盘再派发"), false, "旧先落盘再派发口径不得回潮");
  // stable-write 路径的准则：提交 ≠ 已写入，批准后由应用写入门禁执行。
  const stableGuidelines = (describeTool("request_stable_write").promptGuidelines ?? []).join("\n");
  assert.match(stableGuidelines, /改 docs\/workflow\.md 用 request_stable_write 提交完整新内容/);
  assert.match(stableGuidelines, /提交 ≠ 已写入/);
});
