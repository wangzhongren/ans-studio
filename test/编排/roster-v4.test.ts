// test/编排/roster-v4.test.ts
// T3 B1（2026-11-10）：B1 AC-25/MF-IR-7、T-20——project-roster/v4 双字面量 + 可选 roles[].review。
// 覆盖：v3 语义逐字不变；v4 可选 review（至多一个 true）；非布尔/多个 true/v3 出现 ⇒ 确定性拒绝；
// reviewRoleIdOfRoster 默认 verifier；格式 id 不新增（54 由 doc-format-specs 既有测试守护）。

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_REVIEW_ROLE_ID,
  PROJECT_ROSTER_SCHEMA,
  PROJECT_ROSTER_SCHEMA_V4,
  PROJECT_ROSTER_SCHEMAS,
  parseProjectRoster,
  reviewRoleIdOfRoster,
  type ProjectRoster,
} from "../../src/common/编排/workflow-preconditions.ts";

function rosterText(input: { schema: string; review?: string; secondRole?: string }): string {
  const lines = [
    "---",
    `schema: ${input.schema}`,
    "flowId: snake",
    "version: 1",
    "intent: docs/product/snake-intent-v1.md",
    "proposal: docs/proposals/snake-proposal-v1.md",
    "architecture: docs/contracts/snake-architecture-v1.md",
    "envBootstrap:",
    "  omitted: true",
    "  omissionReason: pure local text task",
    "roles:",
    "  - id: qa-project",
    "    displayName: Project QA",
    "    purpose: Independent review",
    "    capability: Review",
    "    modules: [core]",
    ...(input.review !== undefined ? [`    review: ${input.review}`] : []),
    ...(input.secondRole !== undefined
      ? [
        `  - id: ${input.secondRole}`,
        "    displayName: Worker",
        "    purpose: Implement",
        "    capability: Code",
        "    modules: [core]",
        "    review: true",
      ]
      : []),
    "modules:",
    "  - id: core",
    "    name: Core",
    "    purpose: Core module",
    "    path: src/core/",
    "    category: core",
    "    publicContract: src/core/index.ts",
    "    architectureSource: docs/contracts/snake-architecture-v1.md",
    "---",
    "# Roster",
    "## 人员+模块拓扑图",
    "```topology",
    "schema: project-topology/v2",
    "management: [convener, qa-project]",
    "modules:",
    "  - id: core",
    "    path: src/core/",
    "    roleId: qa-project",
    "roles:",
    "  - id: qa-project",
    "    modules: [core]",
    "```",
    "",
  ];
  return lines.join("\n");
}

test("双字面量：v3/v4 均被接受（PROJECT_ROSTER_SCHEMAS），v3 无 review 语义逐字不变", () => {
  assert.deepEqual([...PROJECT_ROSTER_SCHEMAS], [PROJECT_ROSTER_SCHEMA, PROJECT_ROSTER_SCHEMA_V4]);
  const v3 = parseProjectRoster(rosterText({ schema: PROJECT_ROSTER_SCHEMA }));
  assert.equal(v3.ok, true, v3.ok === false ? v3.reason : "");
  if (v3.ok) {
    assert.equal(v3.roster.schema, PROJECT_ROSTER_SCHEMA);
    assert.equal(v3.roster.roles[0]?.review, undefined);
    assert.equal(reviewRoleIdOfRoster(v3.roster), DEFAULT_REVIEW_ROLE_ID);
  }
  const v4 = parseProjectRoster(rosterText({ schema: PROJECT_ROSTER_SCHEMA_V4 }));
  assert.equal(v4.ok, true, v4.ok === false ? v4.reason : "");
  if (v4.ok) assert.equal(v4.roster.schema, PROJECT_ROSTER_SCHEMA_V4);
});

test("v4 可选 roles[].review=true ⇒ 项目验收角色；无标记默认 verifier", () => {
  const marked = parseProjectRoster(rosterText({ schema: PROJECT_ROSTER_SCHEMA_V4, review: "true" }));
  assert.equal(marked.ok, true, marked.ok === false ? marked.reason : "");
  if (marked.ok) {
    assert.equal(marked.roster.roles[0]?.review, true);
    assert.equal(reviewRoleIdOfRoster(marked.roster), "qa-project");
  }
  const unmarked = parseProjectRoster(rosterText({ schema: PROJECT_ROSTER_SCHEMA_V4 }));
  assert.equal(unmarked.ok, true);
  if (unmarked.ok) assert.equal(reviewRoleIdOfRoster(unmarked.roster), "verifier");
  const explicitFalse = parseProjectRoster(rosterText({ schema: PROJECT_ROSTER_SCHEMA_V4, review: "false" }));
  assert.equal(explicitFalse.ok, true);
  if (explicitFalse.ok) assert.equal(reviewRoleIdOfRoster(explicitFalse.roster), "verifier");
});

test("v4 roles[].review 非法：多个 true/非布尔 ⇒ roster-role-review-invalid（至多一个 true）", () => {
  const twoTrue = parseProjectRoster(rosterText({ schema: PROJECT_ROSTER_SCHEMA_V4, review: "true", secondRole: "worker" }));
  assert.equal(twoTrue.ok, false);
  if (!twoTrue.ok) assert.equal(twoTrue.code, "roster-role-review-invalid");
  const nonBoolean = parseProjectRoster(rosterText({ schema: PROJECT_ROSTER_SCHEMA_V4, review: "\"yes\"" }));
  assert.equal(nonBoolean.ok, false);
  if (!nonBoolean.ok) assert.equal(nonBoolean.code, "roster-role-review-invalid");
  const numeric = parseProjectRoster(rosterText({ schema: PROJECT_ROSTER_SCHEMA_V4, review: "1" }));
  assert.equal(numeric.ok, false);
  if (!numeric.ok) assert.equal(numeric.code, "roster-role-review-invalid");
});

test("v3 文档出现 roles[].review ⇒ 确定性拒绝（不静默忽略）", () => {
  const v3WithReview = parseProjectRoster(rosterText({ schema: PROJECT_ROSTER_SCHEMA, review: "true" }));
  assert.equal(v3WithReview.ok, false);
  if (!v3WithReview.ok) {
    assert.equal(v3WithReview.code, "roster-role-review-invalid");
    assert.match(v3WithReview.reason, /仅 v4/);
  }
});

test("未知 schema 仍拒绝（错误语义保留 v1/v2 提示），roster 类型含 review 字段", () => {
  const bad = parseProjectRoster(rosterText({ schema: "project-roster/v2" }));
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.code, "roster-schema-invalid");
    assert.match(bad.reason, /project-roster\/v3 或 project-roster\/v4/);
  }
  const typeCheck: Pick<ProjectRoster, "schema" | "roles"> | undefined = undefined;
  assert.equal(typeCheck, undefined);
});
