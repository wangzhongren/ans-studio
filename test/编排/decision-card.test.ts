// test/编排/decision-card.test.ts
// D 批（2026-10-28）：decision 卡在编排/运行时契约中的 D 语义。
//
// 覆盖：
//   · governanceCardGroup：decision 组保留 proposal/appointment/acceptance/intent-confirm/decision；
//     approval 组仅 appointment-write；write/schedule-write 不再有分组；
//   · request_choice schema 的 cardKind 枚举保留 decision；request_confirmation 仅 appointment-write；
//   · decision 卡结构校验（应用自有/角色上限/唯一推荐）与 D 的 fail-closed。

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GOVERNANCE_CARD_GROUP,
  governanceCardGroup,
} from "../../src/model/runtime.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { validateDecisionCardRequest } from "../../src/common/编排/decision-card.ts";
import type { CustomerInputRequest } from "../../src/model/runtime.ts";

function schemaEnum(tool: string, prop: string): unknown[] {
  const schema = describeTool(tool);
  return (schema.parameters.properties as Record<string, { enum?: unknown[] }>)[prop]?.enum ?? [];
}

test("D 卡种分组：decision 组保留五种 choice；approval 组仅 appointment-write", () => {
  assert.equal(governanceCardGroup("proposal"), "decision");
  assert.equal(governanceCardGroup("appointment"), "decision");
  assert.equal(governanceCardGroup("acceptance"), "decision");
  assert.equal(governanceCardGroup("intent-confirm"), "decision");
  assert.equal(governanceCardGroup("decision"), "decision");
  assert.equal(governanceCardGroup("appointment-write"), "approval");
  assert.equal(governanceCardGroup("write" as never), undefined);
  assert.equal(governanceCardGroup("schedule-write" as never), undefined);
  assert.deepEqual(Object.keys(GOVERNANCE_CARD_GROUP).sort(), [
    "acceptance",
    "appointment",
    "appointment-write",
    "decision",
    "intent-confirm",
    "proposal",
  ]);
});

test("工具 schema：request_choice 保留 decision，request_confirmation 仅 appointment-write", () => {
  const choice = schemaEnum("request_choice", "cardKind");
  for (const kind of ["proposal", "appointment", "acceptance", "intent-confirm", "decision"]) {
    assert.ok(choice.includes(kind), `request_choice 缺 ${kind}`);
  }
  assert.equal(choice.includes("write"), false);
  assert.equal(choice.includes("schedule-write"), false);
  assert.deepEqual(schemaEnum("request_confirmation", "cardKind"), ["appointment-write"]);
});

test("decision 结构校验：应用自有卡放行；角色卡仅 convener/rapporteur；推荐项恰一", () => {
  const base = {
    kind: "choice" as const,
    title: "材料性选择",
    cardKind: "decision" as const,
    flowId: "flow-a",
    options: [
      { id: "a", label: "A", recommended: false },
      { id: "b", label: "B", recommended: true },
    ],
  } satisfies CustomerInputRequest;
  const app = validateDecisionCardRequest({ request: { ...base, application: true }, roleId: "verifier", governanceModel: "trio" });
  assert.equal(app.ok, true);
  const convener = validateDecisionCardRequest({ request: base, roleId: "convener", governanceModel: "trio" });
  assert.equal(convener.ok, true);
  if (convener.ok) assert.equal(convener.recommendedOptionId, "b");
  const chief = validateDecisionCardRequest({ request: base, roleId: "chief", governanceModel: "trio" });
  assert.equal(chief.ok, false);
  const twoRecommended = validateDecisionCardRequest({
    request: { ...base, options: [{ id: "a", label: "A", recommended: true }, { id: "b", label: "B", recommended: true }] },
    roleId: "convener",
    governanceModel: "trio",
  });
  assert.equal(twoRecommended.ok, false);
  if (!twoRecommended.ok) assert.equal(twoRecommended.reasonCode, "recommended-count");
});
