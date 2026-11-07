// chief 角色模块单元测试（E1.7；B1 E1.1/E1.2/E1.4/E1.5/E1.7 的模块侧证据）。
//
// 只测本模块公开行为：规格数据、tools 策略、dispatch 硬身份/存在性、preflight、context、
// hub/intent-confirm 纯数据与冻结/纯函数约束。差分（旧引擎 oracle 逐字段）在
// `differential.test.ts`；import/模块图扫描在 `imports.test.ts`。

import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  RoleDispatchPolicyInput,
  RolePreflightInput,
  TrustedToolPolicyInput,
} from "../../../src/model/role.ts";
import { TASK_HUB_ROUTING } from "../../../src/model/runtime.ts";
import { governanceCardGroup } from "../../../src/model/runtime.ts";
import {
  VERSION_DECISION_REASON_MAX,
  VERSION_DECISION_REFS_MAX,
} from "../../../src/model/project-state.ts";
import {
  CHIEF_HUB_DISPATCH,
  CHIEF_INTENT_CONFIRM_CARD,
  CHIEF_MESSAGE_KEYS,
  CHIEF_POLICY_CODES,
  CHIEF_TOOL_IDS,
  CHIEF_WORKFLOW_RESOURCE,
  chiefRoleModule,
} from "../../../src/common/roles/chief/index.ts";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

// —————————————————————— 规格数据 ——————————————————————

test("spec：id/displayName/function/cards 与模块形状", () => {
  assert.equal(chiefRoleModule.id, "chief");
  assert.equal(chiefRoleModule.displayName, "幕僚");
  assert.equal(chiefRoleModule.function, "chief");
  assert.deepEqual(chiefRoleModule.cards, ["intent-confirm"]);
  assert.equal(chiefRoleModule.cards.includes("write" as never), false, "D8：legacy write 不得进入模块数据");
});

test("spec：card 字段形状（text 非空；entries/preauthorized/forbidden 只读数据）", () => {
  assert.equal(typeof chiefRoleModule.card.text, "string");
  assert.ok(chiefRoleModule.card.text.startsWith("# 角色：幕僚（内置角色）"));
  assert.ok(chiefRoleModule.card.text.includes("intentId"));
  assert.deepEqual(chiefRoleModule.card.entries, [
    {
      root: "project",
      path: "docs/intents/",
      kind: "directory",
      purpose: "客户意图 / 沟通记录（intentId/handoffKind/goal/scope/acceptance/客户原话）",
    },
  ]);
  assert.deepEqual(chiefRoleModule.card.preauthorizedDirs, ["docs/intents/"]);
  assert.deepEqual(chiefRoleModule.card.forbiddenWritePaths, [
    ".ans/",
    "docs/bootstrap-manifest.md",
    "角色卡/governance-boundary.yaml",
    "角色卡/",
    "docs/proposals/",
    "docs/contracts/",
    "docs/nominations/",
    "docs/skills/",
    "docs/mcp/",
    "docs/governance/",
    "docs/workflow.md",
  ]);
  assert.ok(chiefRoleModule.card.forbiddenWritePaths.includes("角色卡/"));
});

test("spec：capabilities 七字段（D10 唯一真源）", () => {
  assert.deepEqual(chiefRoleModule.capabilities, {
    customerInput: true,
    dispatchTask: true,
    roleStatus: true,
    sessionTail: true,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
  });
});

// —————————————————————— tools ——————————————————————

test("tools：trio 返回 6 个 chief 专属 id（含 E2 C-1 的 closeCreatedTask），顺序与旧 run-role 一致，capabilities 同 spec 引用", () => {
  const policy = chiefRoleModule.tools({ governanceModel: "trio" });
  assert.deepEqual(policy.tools, [
    "roleActivityLog",
    "terminateRoleRun",
    "redispatchTask",
    "projectNote",
    "requestVersionDecision",
    "closeCreatedTask",
  ]);
  assert.equal(policy.tools.includes("closeCreatedTask"), true, "E2 C-1：旧 directGovernance 下 trio chief 注入的工具不得丢失");
  assert.equal(policy.tools.includes("decidePendingRequest"), false, "独立决策上下文工具不由普通会话声明");
  assert.equal(policy.capabilities, chiefRoleModule.capabilities, "D10：tools().capabilities 必须是 spec 派生");
  assert.deepEqual(policy.reasons, []);
  assert.equal(new Set(policy.tools).size, policy.tools.length, "不得重复声明同一 id");
  assert.deepEqual(policy.tools, CHIEF_TOOL_IDS);
});

test("tools：single 不装配 trio 工具（空集 + 结构化原因，非 deny）", () => {
  const policy = chiefRoleModule.tools({ governanceModel: "single" });
  assert.deepEqual(policy.tools, []);
  assert.equal(policy.reasons.length, 1);
  assert.equal(policy.reasons[0]!.code, "chief-tools-single-model");
  assert.equal(policy.reasons[0]!.messageKey, "role.chief.tools.singleModel");
  assert.equal(policy.capabilities, chiefRoleModule.capabilities);
});

test("tools：未知治理模型 fail-closed（空集 + 原因，不猜测）", () => {
  const policy = chiefRoleModule.tools({ governanceModel: "weird" } as unknown as TrustedToolPolicyInput);
  assert.deepEqual(policy.tools, []);
  assert.equal(policy.reasons.length, 1);
  assert.equal(policy.reasons[0]!.code, "chief-tools-governance-model-unknown");
  assert.deepEqual(policy.reasons[0]!.details, { governanceModel: "weird" });
});

// —————————————————————— dispatch ——————————————————————

const allowCases = ["product", "rapporteur", "nominator", "convener", "verifier"] as const;

test("dispatch：chief → 五个内置角色允许，reportToRoleId=chief（真实创建者）", () => {
  for (const targetRoleId of allowCases) {
    const policy = chiefRoleModule.dispatch({
      sourceRoleId: "chief",
      targetRoleId,
      targetKind: "built-in-governance",
      targetExists: true,
    });
    assert.deepEqual(policy.decision, { allow: true });
    assert.equal(policy.reportToRoleId, "chief");
  }
});

test("dispatch：自派拒绝（稳定码 self-dispatch，不返回报告期望）", () => {
  const policy = chiefRoleModule.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "chief",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal(policy.decision.allow, false);
  assert.equal((policy.decision as unknown as { code: string }).code, "self-dispatch");
  assert.equal(policy.reportToRoleId, undefined);
});

test("dispatch：幕僚不得直接派项目 worker（chief-to-project-forbidden）", () => {
  const policy = chiefRoleModule.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "worker-a",
    targetKind: "project",
    targetExists: true,
  });
  assert.equal(policy.decision.allow, false);
  assert.equal((policy.decision as unknown as { code: string }).code, "chief-to-project-forbidden");
  assert.equal(policy.reportToRoleId, undefined);
});

test("dispatch：闭集外内置目标 / 目标不存在 / targetExists 缺省 = 拒绝（fail-closed）", () => {
  const unknownTarget = chiefRoleModule.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "liaison",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal((unknownTarget.decision as unknown as { code: string }).code, "target-card-missing");

  const notExists = chiefRoleModule.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: false,
  });
  assert.equal((notExists.decision as unknown as { code: string }).code, "target-card-missing");

  const missing = chiefRoleModule.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "product",
    targetKind: "built-in-governance",
  });
  assert.equal((missing.decision as unknown as { code: string }).code, "target-card-missing");
  assert.deepEqual((missing.decision as unknown as { details: unknown }).details, {
    targetRoleId: "product",
    targetExists: "missing",
  });
});

test("dispatch：来源缺失/非 chief/目标类别未知 = 拒绝（fail-closed）", () => {
  const missingSource = chiefRoleModule.dispatch({
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal((missingSource.decision as unknown as { code: string }).code, "chief-dispatch-source-missing");

  const wrongSource = chiefRoleModule.dispatch({
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal((wrongSource.decision as unknown as { code: string }).code, "chief-dispatch-source-not-chief");

  const badKind = chiefRoleModule.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "product",
    targetKind: "alien" as unknown as RoleDispatchPolicyInput["targetKind"],
    targetExists: true,
  });
  assert.equal((badKind.decision as unknown as { code: string }).code, "chief-dispatch-target-kind-invalid");
});

// —————————————————————— preflight ——————————————————————

function check(facts: unknown, action: unknown = "version-decision") {
  return chiefRoleModule.preflight!.checkAction({
    action,
    facts,
  } as unknown as RolePreflightInput);
}

test("preflight：覆盖 version-decision；其他动作 action-not-covered", () => {
  const other = check({}, "review");
  assert.equal(other.allow, false);
  assert.equal((other as unknown as { code: string }).code, "action-not-covered");
});

test("preflight：合法 version-decision 请求 allow", () => {
  const decision = check({ flowId: "q2-new", action: "version-modify", reason: "需要在同 flow 出新版本" });
  assert.deepEqual(decision, { allow: true });
});

test("preflight：缺事实 / facts 非对象 = fact-missing（fail-closed）", () => {
  for (const facts of [undefined, null, "x", 3, []]) {
    const decision = check(facts);
    assert.equal(decision.allow, false);
    assert.equal((decision as unknown as { code: string }).code, "chief-preflight-fact-missing");
  }
  const missingFlow = check({ action: "version-modify", reason: "x" });
  assert.deepEqual((missingFlow as unknown as { details: unknown }).details, { key: "flowId" });
});

test("preflight：未知 fact 键 / 非法值 = fact-invalid", () => {
  const unknownKey = check({ flowId: "q2-new", action: "version-modify", reason: "x", extra: true });
  assert.equal((unknownKey as unknown as { code: string }).code, "chief-preflight-fact-invalid");
  assert.deepEqual((unknownKey as unknown as { details: unknown }).details, { key: "extra", reason: "unknown-key" });

  const badFlow = check({ flowId: "Q2 New", action: "version-modify", reason: "x" });
  assert.deepEqual((badFlow as unknown as { details: unknown }).details, { key: "flowId", reason: "not-governance-slug" });

  const badAction = check({ flowId: "q2-new", action: "upgrade", reason: "x" });
  assert.deepEqual((badAction as unknown as { details: unknown }).details, { key: "action", reason: "not-version-decision-action" });

  const emptyReason = check({ flowId: "q2-new", action: "version-modify", reason: "   " });
  assert.deepEqual((emptyReason as unknown as { details: unknown }).details, { key: "reason", reason: "empty" });

  const longReason = check({ flowId: "q2-new", action: "version-modify", reason: "x".repeat(VERSION_DECISION_REASON_MAX + 1) });
  assert.deepEqual((longReason as unknown as { details: unknown }).details, { key: "reason", reason: "too-long" });

  const tooManyRefs = check({
    flowId: "q2-new",
    action: "version-modify",
    reason: "x",
    refs: Array.from({ length: VERSION_DECISION_REFS_MAX + 1 }, (_, i) => `ref-${i}`),
  });
  assert.deepEqual((tooManyRefs as unknown as { details: unknown }).details, { key: "refs", reason: "too-many" });

  const badRunId = check({ flowId: "q2-new", action: "version-modify", reason: "x", runId: 7 });
  assert.deepEqual((badRunId as unknown as { details: unknown }).details, { key: "runId", reason: "not-non-empty-string" });
});

test("preflight：pinned run 拒绝（应走既有 run-change）", () => {
  const decision = check({ flowId: "q2-new", action: "version-modify", reason: "x", runState: "pinned" });
  assert.equal((decision as unknown as { code: string }).code, "chief-version-decision-pinned-run");
  assert.equal((decision as unknown as { messageKey: string }).messageKey, "role.chief.preflight.versionDecisionPinnedRun");
});

test("preflight：已有未决版本决策请求拒绝（不重复发卡）", () => {
  const decision = check({ flowId: "q2-new", action: "version-modify", reason: "x", pendingVersionDecisionCount: 1 });
  assert.equal((decision as unknown as { code: string }).code, "chief-version-decision-pending");
});

test("preflight：draft/legacy 与非零 pending 边界", () => {
  assert.deepEqual(check({ flowId: "q2-new", action: "new-version-development", reason: "x", runState: "draft" }), { allow: true });
  assert.deepEqual(check({ flowId: "q2-new", action: "new-version-development", reason: "x", runState: "legacy" }), { allow: true });
  assert.deepEqual(check({ flowId: "q2-new", action: "version-modify", reason: "x", pendingVersionDecisionCount: 0 }), { allow: true });
  const badPending = check({ flowId: "q2-new", action: "version-modify", reason: "x", pendingVersionDecisionCount: -1 });
  assert.equal((badPending as unknown as { code: string }).code, "chief-preflight-fact-invalid");
});

// —————————————————————— context ——————————————————————

test("context：返回 chief-workflow / 决策上下文 / intent-confirm 三段（顺序固定）", () => {
  const sections = chiefRoleModule.context({ governanceModel: "trio" });
  assert.deepEqual(sections.map((section) => section.id), [
    "chief-workflow",
    "chief-decision-context",
    "chief-intent-confirm",
  ]);
  for (const section of sections) assert.ok(section.text.length > 0);
  assert.deepEqual(sections[0]!.resources, [CHIEF_WORKFLOW_RESOURCE]);
});

test("context：不读取 facts（任意 facts 输出一致；不读盘）", () => {
  const a = chiefRoleModule.context({ governanceModel: "trio" });
  const b = chiefRoleModule.context({
    governanceModel: "single",
    facts: { anything: true, secret: "must-not-be-read" },
  });
  assert.equal(a, b, "返回同一冻结 section 表（纯数据、无状态）");
});

// —————————————————————— 纯数据 / 冻结 ——————————————————————

test("纯数据：模块对象/数据/卡数据/资源引用冻结（不可变状态）", () => {
  assert.equal(Object.isFrozen(chiefRoleModule), true);
  assert.equal(Object.isFrozen(chiefRoleModule.capabilities), true);
  assert.equal(Object.isFrozen(chiefRoleModule.cards), true);
  assert.equal(Object.isFrozen(chiefRoleModule.card), true);
  assert.equal(Object.isFrozen(chiefRoleModule.card.entries), true);
  assert.equal(Object.isFrozen(chiefRoleModule.card.preauthorizedDirs), true);
  assert.equal(Object.isFrozen(chiefRoleModule.card.forbiddenWritePaths), true);
  assert.equal(Object.isFrozen(CHIEF_HUB_DISPATCH), true);
  assert.equal(Object.isFrozen(CHIEF_HUB_DISPATCH.targetRoleIds), true);
  assert.equal(Object.isFrozen(CHIEF_INTENT_CONFIRM_CARD), true);
  assert.equal(Object.isFrozen(CHIEF_WORKFLOW_RESOURCE), true);
  assert.equal(Object.isFrozen(CHIEF_POLICY_CODES), true);
  assert.equal(Object.isFrozen(CHIEF_MESSAGE_KEYS), true);
});

test("纯函数：输入深冻结也可调用，且不修改调用方数据", () => {
  const toolsInput = deepFreeze({ governanceModel: "trio" as const });
  const dispatchInput = deepFreeze({
    sourceRoleId: "chief",
    targetRoleId: "product",
    targetKind: "built-in-governance" as const,
    targetExists: true,
  });
  const preflightInput = deepFreeze({
    action: "version-decision" as const,
    facts: { flowId: "q2-new", action: "version-modify", reason: "x" },
  });
  const contextInput = deepFreeze({ governanceModel: "trio" as const });

  assert.doesNotThrow(() => chiefRoleModule.tools(toolsInput));
  assert.doesNotThrow(() => chiefRoleModule.dispatch(dispatchInput));
  assert.doesNotThrow(() => chiefRoleModule.preflight!.checkAction(preflightInput));
  assert.doesNotThrow(() => chiefRoleModule.context(contextInput));
  assert.deepEqual(toolsInput, { governanceModel: "trio" });
  assert.deepEqual(dispatchInput, {
    sourceRoleId: "chief",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
  });
});

// —————————————————————— hub / intent-confirm 纯数据 ——————————————————————

test("hub 数据：routing/source/report/purpose/schema/目标五内置（与 Model 单一来源一致）", () => {
  assert.equal(CHIEF_HUB_DISPATCH.routing, TASK_HUB_ROUTING);
  assert.equal(CHIEF_HUB_DISPATCH.routing, "chief-hub-v1");
  assert.equal(CHIEF_HUB_DISPATCH.sourceRoleId, "chief");
  assert.equal(CHIEF_HUB_DISPATCH.reportToRoleId, "chief");
  assert.equal(CHIEF_HUB_DISPATCH.purpose, "builtin-preparation");
  assert.equal(CHIEF_HUB_DISPATCH.workSourceSchema, "repository-work-source/v1");
  assert.deepEqual(CHIEF_HUB_DISPATCH.targetRoleIds, ["product", "rapporteur", "nominator", "convener", "verifier"]);
});

test("intent-confirm 数据：固定 confirm/revise；decision 分组；仅 confirm 可被判断代理代批", () => {
  assert.equal(CHIEF_INTENT_CONFIRM_CARD.cardKind, "intent-confirm");
  assert.equal(CHIEF_INTENT_CONFIRM_CARD.toolName, "request_choice");
  assert.deepEqual(CHIEF_INTENT_CONFIRM_CARD.optionIds, ["confirm", "revise"]);
  assert.equal(CHIEF_INTENT_CONFIRM_CARD.requiredOptionId, "confirm");
  assert.equal(CHIEF_INTENT_CONFIRM_CARD.judgeGroup, governanceCardGroup("intent-confirm"));
  assert.equal(CHIEF_INTENT_CONFIRM_CARD.judgeDelegableOptionId, "confirm");
  assert.deepEqual(CHIEF_INTENT_CONFIRM_CARD.customerOnlyOptionIds, ["revise"]);
  assert.equal(CHIEF_INTENT_CONFIRM_CARD.applicationOwned, false);
});
