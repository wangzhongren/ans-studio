// test/门禁引擎/decision-card.test.ts
// D 批（2026-10-28）：decision 卡结构校验（申请直达/应用自有卡/唯一推荐项）。
//
// 覆盖 D/C 语义：
//   · 应用自有 decision 卡（application:true）由应用直接构造，不借用角色槽位；
//   · 角色发行仍限 trio 的 convener/rapporteur（C 批未扩大 DECISION_CARD_ALLOWED_ROLES）；
//   · 唯一推荐项、选项/flowId/结构负例 fail-closed；
//   · 不写 flow/ledger，不触发 gate/验收（纯函数）。

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DECISION_CARD_ALLOWED_ROLES,
  DECISION_CARD_MIN_OPTIONS,
  validateDecisionCardRequest,
} from "../../src/common/编排/decision-card.ts";
import type { CustomerInputRequest } from "../../src/model/runtime.ts";

const options = [
  { id: "a", label: "A", recommended: false },
  { id: "b", label: "B", recommended: true },
];

function decision(overrides: Record<string, unknown> = {}): CustomerInputRequest {
  return {
    kind: "choice",
    title: "材料性选择",
    cardKind: "decision",
    flowId: "flow-a",
    options,
    ...overrides,
  } as CustomerInputRequest;
}

test("非 decision 卡 ⇒ applicable:false（调用方按原卡种处理）", () => {
  const out = validateDecisionCardRequest({
    request: decision({ cardKind: "proposal" }),
    roleId: "rapporteur",
    governanceModel: "trio",
  });
  assert.deepEqual(out, { ok: true, applicable: false });
});

test("角色发行上限：仅 trio 的 convener/rapporteur；其余角色/single 拒绝", () => {
  assert.deepEqual(DECISION_CARD_ALLOWED_ROLES, ["convener", "rapporteur"]);
  for (const roleId of ["convener", "rapporteur"]) {
    const out = validateDecisionCardRequest({ request: decision(), roleId, governanceModel: "trio" });
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.applicable, true);
      assert.equal(out.flowId, "flow-a");
      assert.equal(out.recommendedOptionId, "b");
    }
  }
  for (const roleId of ["chief", "product", "nominator", "verifier", "su", "project-role"]) {
    const out = validateDecisionCardRequest({ request: decision(), roleId, governanceModel: "trio" });
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.reasonCode, "role-not-allowed");
  }
  const single = validateDecisionCardRequest({ request: decision(), roleId: "convener", governanceModel: "single" });
  assert.equal(single.ok, false);
});

test("应用自有 decision 卡：application:true 不借用角色槽位，任意来源角色可发", () => {
  for (const roleId of ["chief", "product", "nominator", "verifier", "", "application"]) {
    const out = validateDecisionCardRequest({
      request: decision({ application: true, sourceRoleId: "application" }),
      roleId,
      governanceModel: "trio",
    });
    assert.equal(out.ok, true, `application 卡不应被角色上限拒绝：${roleId}`);
    if (out.ok) assert.equal(out.applicable, true);
  }
});

test("结构负例 fail-closed：非 choice/缺 flowId/选项不足/重复/非法 id/推荐项非恰一", () => {
  const cases: Array<[CustomerInputRequest, string]> = [
    [decision({ kind: "confirm" }), "not-choice"],
    [decision({ flowId: "" }), "missing-flow-id"],
    [decision({ flowId: "flow-" }), "missing-flow-id"],
    [decision({ options: [{ id: "a", label: "A", recommended: true }] }), "not-enough-options"],
    [decision({ options: [{ id: "a", label: "A", recommended: true }, { id: "a", label: "A2", recommended: false }] }), "duplicate-option-id"],
    [decision({ options: [{ id: "", label: "A", recommended: true }, { id: "b", label: "B", recommended: false }] }), "invalid-option-id"],
    [decision({ options: [{ id: "a", label: "A", recommended: false }, { id: "b", label: "B", recommended: false }] }), "recommended-count"],
    [decision({ options: [{ id: "a", label: "A", recommended: true }, { id: "b", label: "B", recommended: true }] }), "recommended-count"],
  ];
  for (const [request, reason] of cases) {
    const out = validateDecisionCardRequest({ request, roleId: "convener", governanceModel: "trio" });
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.reasonCode, reason);
  }
  assert.ok(DECISION_CARD_MIN_OPTIONS >= 2);
});
