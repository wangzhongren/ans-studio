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
import { DECISION_CARD_ALLOWED_ROLES, validateDecisionCardRequest } from "../../src/common/编排/decision-card.ts";
import { buildVersionDecisionCard, versionDecisionCardToRequest } from "../../src/common/编排/version-decision.ts";
import type { CustomerInputRequest } from "../../src/model/runtime.ts";

function schemaEnum(tool: string, prop: string): unknown[] {
  const schema = describeTool(tool);
  return (schema.parameters.properties as Record<string, { enum?: unknown[] }>)[prop]?.enum ?? [];
}

test("D 卡种分组：decision 组保留五种 choice；approval 组为 appointment-write 与 download", () => {
  assert.equal(governanceCardGroup("proposal"), "decision");
  assert.equal(governanceCardGroup("appointment"), "decision");
  assert.equal(governanceCardGroup("acceptance"), "decision");
  assert.equal(governanceCardGroup("intent-confirm"), "decision");
  assert.equal(governanceCardGroup("decision"), "decision");
  assert.equal(governanceCardGroup("appointment-write"), "approval");
  assert.equal(governanceCardGroup("download"), "approval");
  assert.equal(governanceCardGroup("write" as never), undefined);
  assert.equal(governanceCardGroup("schedule-write" as never), undefined);
  assert.deepEqual(Object.keys(GOVERNANCE_CARD_GROUP).sort(), [
    "acceptance",
    "appointment",
    "appointment-write",
    "decision",
    "download",
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

test("版本决策卡：application-owned decision 通过校验；两选项恰一 recommended；角色上限不变", () => {
  const card = buildVersionDecisionCard({
    requestId: "version-decision-run-20261030-focus-abcdef12-m1abc-1234abcd",
    flowId: "focus",
    action: "new-version-development",
    reason: "验收证据循环",
    facts: {
      flowId: "focus",
      unclosedCount: 2,
      blockedCount: 1,
      failedCount: 0,
      pendingRequestCount: 1,
      acceptanceRejectedCount: 1,
      priorVersionDecisionCount: 0,
      latestDocs: [],
      newerThanPinned: [],
    },
    labels: {
      title: "版本决策：focus",
      question: "当前 flow focus 卡在验收证据循环。",
      disclaimer: "若选择新版本开发，应用将关闭旧 flow 的全部活动 run；这是路线选择，不是内容批准，也不是验收。",
      optionVersionModify: "版本修改",
      optionNewVersionDevelopment: "新版本开发",
    },
  });
  assert.equal(card.options.length, 2);
  assert.equal(card.options.filter((option) => option.recommended === true).length, 1);
  assert.equal(card.options.find((option) => option.recommended === true)?.id, "new-version-development");
  assert.match(card.question, /全部活动 run/);
  assert.match(card.question, /不是内容批准/);

  const request = versionDecisionCardToRequest(card);
  assert.equal(request.kind, "choice");
  assert.equal(request.cardKind, "decision");
  assert.equal(request.application, true);
  assert.equal(request.sourceRoleId, "application");
  assert.equal(request.flowId, "focus");
  const validated = validateDecisionCardRequest({ request, roleId: "verifier", governanceModel: "trio" });
  assert.equal(validated.ok, true);
  if (validated.ok) assert.equal(validated.recommendedOptionId, "new-version-development");

  const unowned = { ...request, application: undefined, sourceRoleId: undefined };
  const chiefCannotIssue = validateDecisionCardRequest({ request: unowned, roleId: "chief", governanceModel: "trio" });
  assert.equal(chiefCannotIssue.ok, false);
  assert.deepEqual([...DECISION_CARD_ALLOWED_ROLES], ["convener", "rapporteur"]);
});
