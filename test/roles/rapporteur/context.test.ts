// test/roles/rapporteur/context.test.ts
// rapporteur `context()` 单测：静态提示块（决策上下文/报告期望/decision 卡数据）与模型分支。

import assert from "node:assert/strict";
import { test } from "node:test";

import type { RoleContextInput } from "../../../src/model/role.ts";
import { rapporteurRoleModule } from "../../../src/common/roles/rapporteur/index.ts";

const TRIO: RoleContextInput = { governanceModel: "trio" };

test("context：trio 返回 4 个稳定 section（顺序固定）", () => {
  const sections = rapporteurRoleModule.context(TRIO);
  assert.deepEqual(sections.map((section) => section.id), [
    "rapporteur-role",
    "rapporteur-decision-context",
    "rapporteur-report-expectation",
    "rapporteur-decision-card",
  ]);
  for (const section of sections) {
    assert.ok(section.text.length > 0);
    assert.equal("resources" in section, false, "rapporteur 无专属资源文件");
  }
});

test("context：决策上下文覆盖三类动作与 fail-closed 口径", () => {
  const text = rapporteurRoleModule.context(TRIO).find((section) => section.id === "rapporteur-decision-context")!.text;
  assert.ok(text.includes("detail-amendment"));
  assert.ok(text.includes("continue-frozen"));
  assert.ok(text.includes("stop-and-restart"));
  assert.ok(text.includes("stop`"));
  assert.ok(text.includes("requirement-change"));
  assert.ok(text.includes("发起方不得自批"));
  assert.ok(text.includes("fail-closed"));
});

test("context：报告期望回真实创建者且不得自行收口", () => {
  const text = rapporteurRoleModule.context(TRIO).find((section) => section.id === "rapporteur-report-expectation")!.text;
  assert.ok(text.includes("submit_report"));
  assert.ok(text.includes("task.created.from"));
  assert.ok(text.includes("报告不是任务关闭"));
  assert.ok(text.includes("不得自报他人身份"));
});

test("context：decision 卡数据与旧卡种/结构约束一致", () => {
  const text = rapporteurRoleModule.context(TRIO).find((section) => section.id === "rapporteur-decision-card")!.text;
  assert.ok(text.includes("`proposal`、`decision`"));
  assert.ok(text.includes("需求变更审批"));
  assert.ok(text.includes("recommended: true"));
  assert.ok(text.includes("至少 2 个不重复选项"));
  assert.ok(text.includes("不得自批"));
  assert.ok(text.includes("不触发门禁/验收"));
});

test("context：single/未知模型返回单一不可用声明（fail-closed）", () => {
  for (const governanceModel of ["single", "weird"] as const) {
    const sections = rapporteurRoleModule.context({ governanceModel: governanceModel as RoleContextInput["governanceModel"] });
    assert.equal(sections.length, 1);
    assert.equal(sections[0]!.id, "rapporteur-governance-model");
    assert.ok(sections[0]!.text.includes("不可开启"));
  }
  const malformed = rapporteurRoleModule.context(null as unknown as RoleContextInput);
  assert.equal(malformed.length, 1);
  assert.equal(malformed[0]!.id, "rapporteur-governance-model");
});

test("context：未提供 facts（undefined / 空对象）时返回静态 section", () => {
  const base = rapporteurRoleModule.context({ governanceModel: "trio" });
  assert.equal(rapporteurRoleModule.context({ governanceModel: "trio", facts: {} }), base);
});

test("context：未登记的 facts 一律 fail-closed（单一拒绝性 section，不读取内容）", () => {
  for (const facts of [{ anything: true, secret: "must-not-be-read" }, ["x"], "raw", 42, null]) {
    const sections = rapporteurRoleModule.context({ governanceModel: "trio", facts } as never);
    assert.equal(sections.length, 1, JSON.stringify(facts));
    assert.equal(sections[0]!.id, "rapporteur-context-facts-rejected");
    assert.equal(sections[0]!.text.includes("must-not-be-read"), false);
    assert.ok(sections[0]!.text.includes("未被读取"));
  }
});

test("context：非 trio 优先返回不可用声明（即便同时提供 facts）", () => {
  const sections = rapporteurRoleModule.context({ governanceModel: "single", facts: { anything: true } });
  assert.equal(sections.length, 1);
  assert.equal(sections[0]!.id, "rapporteur-governance-model");
});

test("context：纯函数——重复调用同结果且 section 冻结", () => {
  const first = rapporteurRoleModule.context(TRIO);
  const second = rapporteurRoleModule.context(TRIO);
  assert.equal(first, second);
  assert.ok(Object.isFrozen(first));
  for (const section of first) assert.ok(Object.isFrozen(section));
});

test("context：文本不含运行时秘密/环境变量值", () => {
  const text = rapporteurRoleModule.context(TRIO).map((section) => section.text).join("\n");
  for (const marker of ["sk-", "Bearer ", "apiKey=", "process.env", "ANTHROPIC_API_KEY"]) {
    assert.equal(text.includes(marker), false, `context 不得含 ${marker}`);
  }
});
