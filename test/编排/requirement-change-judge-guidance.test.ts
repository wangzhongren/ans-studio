// test/编排/requirement-change-judge-guidance.test.ts
// 2026-10-26 需求变更申请（request_requirement_change）在治理卡判断 agent 的文案接线：
//   · 提案卡若包含未授权的新联网/外部目录/范围/成本授权 ⇒ 判断 agent 不得 approve（decision 组不能
//     deny ⇒ manual/intent-drift），理由必须指向专用通道：「Draft 先发 request_requirement_change；
//     需求变更审批卡由统筹（Convener）或提案角色（Rapporteur）发起，发起方不得自批；审批由独立判断
//     agent（勾选「替我决策」时按唯一推荐项代批）或客户（未勾选时手选）完成；主理不审批、只在批准后
//     执行意图变更；不得通过在提案卡上代批或将需求删掉绕过」；
//   · 指引单一来源＝`governance-judge-facts.ts` 的 `GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE`，
//     由系统提示引用；**不改变任何机械权限/裁决**（判断 agent 仍不能在提案卡上代批新授权）；
//   · 2026-10-26 客户纠正：文案不再把审批写成「主理改意图 + intent-confirm」——审批在 decision 卡由
//     判断 agent/客户独立完成，主理只执行；统筹与提案角色都可发起（不排除统筹）；
//   · **不新增 cardKind / FlowStepKind**：治理卡分组映射保持原样，facts 结构不新增字段。

import { test } from "node:test";
import assert from "node:assert/strict";

import { governanceCardGroup } from "../../src/model/runtime.ts";
import type { GovernanceCardKind } from "../../src/model/runtime.ts";
import {
  GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE,
  buildGovernanceJudgeFacts,
} from "../../src/common/编排/governance-judge-facts.ts";
import { buildGovernanceJudgeSystemPrompt } from "../../src/common/编排/governance-judge-prompt.ts";

test("需求变更申请指引：未授权新授权、decision 卡独立审批、产品只执行与「不得绕过」纪律", () => {
  assert.equal(typeof GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, "string");
  assert.match(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /新联网\/外部目录访问\/范围扩张\/成本授权/);
  assert.match(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /一律不得 approve/);
  assert.match(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /decision 组不能 deny ⇒ manual/);
  assert.match(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /intent-drift/);
  assert.match(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /Draft 应先发 request_requirement_change/);
  // 审批通道（2026-10-26 客户纠正/补充）：统筹与提案角色都可发起；发起方不得自批；
  // 审批人是判断 agent（替我决策开启时按唯一推荐项）或客户（未开启时手选）。
  assert.match(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /由运营（Convener）或策划角色（Rapporteur）发起/);
  assert.match(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /发起方不得自批/);
  assert.match(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /替.*决策.*按卡内唯一推荐项代批/);
  assert.match(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /未勾选时手动选择/);
  // 主理只执行，不审批；也不再把 intent-confirm 写成需求变更审批。
  assert.match(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /产品不审批，只在批准后执行意图变更/);
  assert.doesNotMatch(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /产品改意图/);
  assert.doesNotMatch(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /intent-confirm/);
  assert.doesNotMatch(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /运营不参与/);
  assert.match(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /不得通过在提案卡上代批或将需求删掉绕过/);
  assert.match(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /申请 ≠ 客户批准/);
  assert.match(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE, /不能代批任何新授权/);
});

test("系统提示：proposal rubric 引用需求变更申请指引，且机械权限表述保持不变", () => {
  const prompt = buildGovernanceJudgeSystemPrompt();
  // 指引逐字进入系统提示（单一来源，不复制第二份）。
  assert.ok(prompt.includes(GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE), "系统提示应逐字引用指引");
  assert.match(prompt, /【提案卡与需求变更申请（2026-10-26 客户要求）】/);
  assert.match(prompt, /request_requirement_change/);
  assert.match(prompt, /由运营（Convener）或策划角色（Rapporteur）/);
  assert.match(prompt, /发起方不得自批/);
  assert.match(prompt, /产品不审批，只在批准后执行意图变更/);
  assert.match(prompt, /未勾选时由客户手选/);
  // 旧口径（主理改意图 + intent-confirm 作为审批）必须消失。
  assert.doesNotMatch(prompt, /由产品先改意图并走 intent-confirm/);
  assert.doesNotMatch(prompt, /由产品改意图 \+ intent-confirm/);
  assert.doesNotMatch(prompt, /新授权\/新范围必须由产品/);
  assert.match(prompt, /不得通过在提案卡上代批或将需求删掉绕过/);
  assert.match(prompt, /新联网\/外部目录访问\/范围扩张\/成本授权/);
  assert.match(prompt, /未获意图授权的新联网\/外部目录访问\/范围扩张\/成本授权属于\*\*意图漂移\*\*/);
  // decision rubric 同步为「统筹或报告员可发起」，不再写「仅统筹可发」。
  assert.match(prompt, /由运营\/Steward 发起/);
  assert.match(prompt, /报告员 Rapporteur 仅可为/);
  assert.match(prompt, /需求变更审批/);
  assert.doesNotMatch(prompt, /仅运营\/Steward 可发/);
  // 机械权限不变：decision 组仍不得 deny；approval 组 deny 规则仍在。
  assert.match(prompt, /decision 组不得 deny/);
  assert.match(prompt, /deny：\*\*仅 approval 组可用\*\*/);
  assert.match(prompt, /判断 agent 也不能代批任何新授权/);
});

test("不新增 cardKind / FlowStepKind：治理卡分组映射与 facts 结构保持原样", () => {
  assert.equal(governanceCardGroup("proposal"), "decision");
  assert.equal(governanceCardGroup("intent-confirm"), "decision");
  assert.equal(governanceCardGroup("decision"), "decision");
  assert.equal(governanceCardGroup("write"), "approval");
  // 需求变更申请不是新卡种：未知 cardKind 仍不映射（判断入口据此 fail-closed）。
  assert.equal(governanceCardGroup("requirement-change" as GovernanceCardKind), undefined);
  assert.equal(governanceCardGroup("requirement_change" as GovernanceCardKind), undefined);

  const facts = buildGovernanceJudgeFacts({ snapshot: { entries: [], errors: [] }, flowId: "flow-a" });
  assert.deepEqual(
    Object.keys(facts).sort(),
    ["flowId", "governanceModel", "latestDecisionKinds", "ledgerErrors", "unresolvedClarificationCount"],
    "facts 不新增机械字段（指引只是提示词文案，不参与裁决）",
  );
});
