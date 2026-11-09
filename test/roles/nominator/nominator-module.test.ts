// test/roles/nominator/nominator-module.test.ts
// nominator 内置角色模块单测（E1；纯数据/纯策略正负例）。
//
// 只测本角色模块；差分 oracle 见 nominator-differential.test.ts。测试文件可 import 旧引擎/
// 私有 common 仅用于差分；生产模块（src/common/roles/nominator/index.ts）零此类 import。

import { test } from "node:test";
import assert from "node:assert/strict";

import { nominatorRoleModule } from "../../../src/common/roles/nominator/index.ts";
import { intentEntryContractText } from "../../../src/common/shared/intent-entry-contract.ts";
import {
  ROSTER_ROLE_IDS,
  WORKER_ROLE_ID,
  d3CardFacts,
  roleDocumentsFacts,
} from "./fixtures/nominator-fixtures.ts";

const preflight = nominatorRoleModule.preflight;
assert.ok(preflight !== undefined);

function checkAppointment(facts: Record<string, unknown>) {
  return preflight!.checkAction({ action: "appointment", facts });
}

function expectDeny(
  decision: ReturnType<typeof checkAppointment>,
  code: string,
  messageKey: string,
) {
  assert.equal(decision.allow, false);
  if (decision.allow === false) {
    assert.equal(decision.code, code);
    assert.equal(decision.messageKey, messageKey);
  }
}

test("模块身份与卡/边界/capabilities/cards 为纯数据且与旧规格一致", () => {
  assert.equal(nominatorRoleModule.id, "nominator");
  assert.equal(nominatorRoleModule.displayName, "人事");
  assert.equal(nominatorRoleModule.function, "nomination");
  assert.equal(nominatorRoleModule.card.text.startsWith("# 角色：人事（内置角色）"), true);
  // 卡文本内嵌共享意图契约（单一来源），不是第二份手抄。
  assert.equal(nominatorRoleModule.card.text.includes(intentEntryContractText("nominator")), true);
  assert.equal(nominatorRoleModule.card.text.includes("人事回退"), true);
  assert.equal(nominatorRoleModule.card.text.includes("完整激活"), true);
  assert.equal(nominatorRoleModule.card.text.includes("不招名单外的角色"), true);

  assert.deepEqual(nominatorRoleModule.card.entries, [
    {
      root: "project",
      path: "角色卡/",
      kind: "directory",
      purpose: "项目角色目录（真实 D3 与团队计划范围内直接写 role-card.md / boundary.md / boundary.yaml，完整校验激活）",
    },
    {
      root: "project",
      path: "docs/skills/",
      kind: "directory",
      purpose: "技能文档与安装登记（先落盘再激活）",
    },
    {
      root: "project",
      path: "docs/mcp/",
      kind: "directory",
      purpose: "MCP 声明文档（先落盘再激活；凭据值不写文件）",
    },
    {
      root: "project",
      path: "docs/governance/nominator/",
      kind: "directory",
      purpose: "人事 / Crew 的治理工作记录",
    },
  ]);
  assert.deepEqual(nominatorRoleModule.card.preauthorizedDirs, [
    "docs/skills/",
    "docs/mcp/",
    "docs/governance/nominator/",
  ]);
  assert.deepEqual(nominatorRoleModule.card.forbiddenWritePaths, [
    ".ans/",
    "docs/bootstrap-manifest.md",
    "角色卡/governance-boundary.yaml",
    "角色卡/chief/",
    "角色卡/product/",
    "角色卡/rapporteur/",
    "角色卡/nominator/",
    "角色卡/convener/",
    "角色卡/verifier/",
    "角色卡/su/",
    "docs/proposals/",
    "docs/scheduling/",
  ]);
  assert.deepEqual(nominatorRoleModule.capabilities, {
    customerInput: true,
    dispatchTask: false,
    roleStatus: false,
    sessionTail: false,
    installSkill: true,
    installMcp: true,
    shell: "operator-approve",
  });
  assert.deepEqual([...nominatorRoleModule.cards], ["appointment", "appointment-write"]);
  // 纯数据：契约不提供权限/批准字段。
  for (const forbidden of ["allowed", "authorized", "approved", "grant"]) {
    assert.equal(forbidden in nominatorRoleModule, false);
  }
});

test("tools()：trio 声明 activateRoleDocuments；single 为空；未知模型 fail-closed", () => {
  const trio = nominatorRoleModule.tools({ governanceModel: "trio" });
  assert.deepEqual([...trio.tools], ["activateRoleDocuments"]);
  assert.deepEqual(trio.reasons, []);
  // D10：capabilities 单一真源，tools() 输出为同一引用派生。
  assert.equal(trio.capabilities, nominatorRoleModule.capabilities);

  const single = nominatorRoleModule.tools({ governanceModel: "single" });
  assert.deepEqual([...single.tools], []);
  assert.deepEqual(single.reasons, []);
  assert.equal(single.capabilities, nominatorRoleModule.capabilities);

  const unknown = nominatorRoleModule.tools({
    governanceModel: "future-model",
  } as unknown as { governanceModel: "trio" });
  assert.deepEqual([...unknown.tools], []);
  assert.equal(unknown.reasons.length, 1);
  assert.equal(unknown.reasons[0]?.code, "role-tools-model-unknown");
  assert.equal(unknown.reasons[0]?.messageKey, "role.nominator.tools.modelUnknown");
});

test("dispatch()：chief→nominator 通过并给报告期望 chief；其余组合 fail-closed", () => {
  const allowed = nominatorRoleModule.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "nominator",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.deepEqual(allowed.decision, { allow: true });
  assert.equal(allowed.reportToRoleId, "chief");

  const self = nominatorRoleModule.dispatch({
    sourceRoleId: "nominator",
    targetRoleId: "nominator",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  expectDeny(self.decision, "self-dispatch", "role.nominator.dispatch.selfDispatch");
  assert.equal(self.reportToRoleId, undefined);

  const unknownSource = nominatorRoleModule.dispatch({
    sourceRoleId: "product",
    targetRoleId: "nominator",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  expectDeny(unknownSource.decision, "unknown-source", "role.nominator.dispatch.unknownSource");

  const missingSource = nominatorRoleModule.dispatch({
    targetRoleId: "nominator",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  expectDeny(missingSource.decision, "unknown-source", "role.nominator.dispatch.unknownSource");

  const convener = nominatorRoleModule.dispatch({
    sourceRoleId: "convener",
    targetRoleId: "nominator",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  expectDeny(
    convener.decision,
    "convener-target-forbidden",
    "role.nominator.dispatch.convenerTargetForbidden",
  );

  const chiefToProject = nominatorRoleModule.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "nominator",
    targetKind: "project",
    targetExists: true,
  });
  expectDeny(
    chiefToProject.decision,
    "chief-to-project-forbidden",
    "role.nominator.dispatch.chiefToProjectForbidden",
  );

  const missingTarget = nominatorRoleModule.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "nominator",
    targetKind: "built-in-governance",
  });
  expectDeny(
    missingTarget.decision,
    "target-card-missing",
    "role.nominator.dispatch.targetCardMissing",
  );

  const outOfScope = nominatorRoleModule.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  expectDeny(
    outOfScope.decision,
    "dispatch-not-in-module-scope",
    "role.nominator.dispatch.notInModuleScope",
  );

  const invalidKind = nominatorRoleModule.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "nominator",
    targetKind: "worker" as unknown as "project",
    targetExists: true,
  });
  expectDeny(invalidKind.decision, "dispatch-input-invalid", "role.nominator.dispatch.inputInvalid");
});

test("preflight：非 appointment 动作一律 action-not-covered", () => {
  for (const action of [
    "version-upgrade",
    "detail-amendment",
    "run-change",
    "requirement-change",
    "version-decision",
    "stable-write",
    "team-plan",
    "git-action",
    "review",
  ] as const) {
    const decision = preflight!.checkAction({ action, facts: {} });
    expectDeny(decision, "action-not-covered", "role.preflight.actionNotCovered");
  }
});

test("preflight d3-card：合法事实 allow（纯策略不反对，不是权限票）", () => {
  assert.deepEqual(checkAppointment(d3CardFacts()), { allow: true });
});

test("preflight：缺键/未知键/类型不符/stage 非法 fail-closed", () => {
  expectDeny(
    checkAppointment({}),
    "appointment-facts-missing",
    "role.nominator.preflight.factsMissing",
  );
  const missing = d3CardFacts();
  delete missing["rosterRoleIds"];
  expectDeny(
    checkAppointment(missing),
    "appointment-facts-missing",
    "role.nominator.preflight.factsMissing",
  );
  expectDeny(
    checkAppointment(d3CardFacts({ extraFact: true })),
    "appointment-facts-unknown",
    "role.nominator.preflight.factsUnknown",
  );
  expectDeny(
    checkAppointment(d3CardFacts({ rosterVersion: "3" })),
    "appointment-facts-invalid",
    "role.nominator.preflight.factsInvalid",
  );
  // 已登记但本阶段不读取的键，若出现也必须类型合法（fail-closed）。
  expectDeny(
    checkAppointment(d3CardFacts({ cardPath: 123 })),
    "appointment-facts-invalid",
    "role.nominator.preflight.factsInvalid",
  );
  expectDeny(
    checkAppointment(d3CardFacts({ stage: "appointment-write" })),
    "appointment-stage-invalid",
    "role.nominator.preflight.stageInvalid",
  );
  expectDeny(
    checkAppointment(d3CardFacts({ flowId: "Not A Slug" })),
    "appointment-facts-invalid",
    "role.nominator.preflight.factsInvalid",
  );
  expectDeny(
    checkAppointment(d3CardFacts({ rosterSha256: "abc" })),
    "appointment-facts-invalid",
    "role.nominator.preflight.factsInvalid",
  );
  expectDeny(
    checkAppointment(d3CardFacts({ rosterRoleIds: [] })),
    "appointment-facts-invalid",
    "role.nominator.preflight.factsInvalid",
  );
  expectDeny(
    checkAppointment(d3CardFacts({ rosterRoleIds: ["implementer", "implementer"] })),
    "appointment-facts-invalid",
    "role.nominator.preflight.factsInvalid",
  );
});

test("preflight d3-card：名单/卡形负例", () => {
  expectDeny(
    checkAppointment(d3CardFacts({ rosterFound: false })),
    "appointment-roster-missing",
    "role.nominator.preflight.rosterMissing",
  );
  expectDeny(
    checkAppointment(d3CardFacts({ rosterContainsBuiltInRoleIds: true })),
    "appointment-roster-builtin-role",
    "role.nominator.preflight.rosterBuiltinRole",
  );
  expectDeny(
    checkAppointment(
      d3CardFacts({
        rosterRoleIds: ["implementer", "qa"],
        d3CardOptionRoleIds: ["implementer", "qa"],
        d3CardRecommendedRoleIds: ["implementer", "qa"],
      }),
    ),
    "appointment-roster-env-bootstrap-missing",
    "role.nominator.preflight.rosterEnvBootstrapMissing",
  );
  expectDeny(
    checkAppointment(
      d3CardFacts({
        rosterRoleIds: ["env-bootstrap", "implementer"],
        rosterEnvBootstrapOmitted: true,
        d3CardOptionRoleIds: ["env-bootstrap", "implementer"],
        d3CardRecommendedRoleIds: ["env-bootstrap", "implementer"],
      }),
    ),
    "appointment-roster-invalid",
    "role.nominator.preflight.rosterInvalid",
  );
  expectDeny(
    checkAppointment(d3CardFacts({ d3CardMultiple: false })),
    "appointment-d3-card-not-multiple",
    "role.nominator.preflight.d3CardNotMultiple",
  );
  expectDeny(
    checkAppointment(d3CardFacts({ d3CardOptionRoleIds: ["env-bootstrap", "implementer"] })),
    "appointment-d3-card-roster-mismatch",
    "role.nominator.preflight.d3CardRosterMismatch",
  );
  expectDeny(
    checkAppointment(
      d3CardFacts({
        d3CardRecommendedRoleIds: ["env-bootstrap", "implementer"],
      }),
    ),
    "appointment-d3-card-recommended-mismatch",
    "role.nominator.preflight.d3CardRecommendedMismatch",
  );
});

test("preflight：intentEntryConsistent 为可选诊断事实——缺失/false/true 均 allow（E2 D-1）", () => {
  // E2 D-1 处置 (a)：旧 D3 卡/激活路径（validateAppointmentCardAgainstRoster /
  // prepareRoleActivation）不校验意图入口一致性；模块不得据此新增拒绝。
  const d3Missing = d3CardFacts();
  delete d3Missing["intentEntryConsistent"];
  const docsMissing = roleDocumentsFacts();
  delete docsMissing["intentEntryConsistent"];

  for (const facts of [
    d3Missing,
    d3CardFacts({ intentEntryConsistent: false }),
    d3CardFacts({ intentEntryConsistent: true }),
    docsMissing,
    roleDocumentsFacts({ intentEntryConsistent: false }),
    roleDocumentsFacts({ intentEntryConsistent: true }),
  ]) {
    assert.deepEqual(checkAppointment(facts), { allow: true });
  }

  // 键仍登记为已知键：提供时类型必须是 boolean（事实包通用纪律，不是意图入口强制）。
  expectDeny(
    checkAppointment(d3CardFacts({ intentEntryConsistent: "yes" })),
    "appointment-facts-invalid",
    "role.nominator.preflight.factsInvalid",
  );
});

test("preflight role-documents：合法事实 allow", () => {
  assert.deepEqual(checkAppointment(roleDocumentsFacts()), { allow: true });
});

test("preflight role-documents：Runtime 包装层 judge D3 事实包被接受；customer/chief-delegated 回归（W-J2b）", () => {
  // W-J2b（judge 代批生效，D3/激活链）：Runtime 包装层 `nominatorRoleDocumentsFacts`
  //（src/pipeline/orchestration/trunk-runtime.ts）在 judge D3 下如实产出 d3By:"judge"，
  // d3DecisionId 为共享函数 requestResolvedD3DecisionId 的真实应用值 `decision-<requestId>`
  //（customer/judge => decisionId；chief-delegated => requestId）。本模块按模块单测范围
  // 只消费该事实包形状（不 import pipeline，不做跨角色集成）。
  for (const d3By of ["customer", "chief-delegated", "judge"] as const) {
    assert.deepEqual(checkAppointment(roleDocumentsFacts({ d3By })), { allow: true }, d3By);
  }
  // judge D3 的真实 decisionId 形状（decision-<requestId>，不是客户 decisionId）。
  assert.deepEqual(
    checkAppointment(
      roleDocumentsFacts({ d3By: "judge", d3DecisionId: "decision-d3-request" }),
    ),
    { allow: true },
  );
});

test("preflight role-documents：d3By 非法值仍 fail-closed（model/空串/非字符串）", () => {
  // W-J2b：接受集之外一律拒绝（fail-closed）；既有 `model` 负例保留在下方目标/D3 负例中。
  for (const d3By of ["model", "directive", "", 42, true, null] as const) {
    expectDeny(
      checkAppointment(roleDocumentsFacts({ d3By })),
      "appointment-facts-invalid",
      "role.nominator.preflight.factsInvalid",
    );
  }
});

test("preflight role-documents：目标/D3 负例", () => {
  expectDeny(
    checkAppointment(roleDocumentsFacts({ targetIsBuiltIn: true })),
    "appointment-target-builtin",
    "role.nominator.preflight.targetBuiltin",
  );
  expectDeny(
    checkAppointment(
      roleDocumentsFacts({
        targetRoleId: "outsider",
        cardPath: "角色卡/outsider/role-card.md",
        boundaryMdPath: "角色卡/outsider/boundary.md",
        boundaryYamlPath: "角色卡/outsider/boundary.yaml",
      }),
    ),
    "appointment-target-not-in-roster",
    "role.nominator.preflight.targetNotInRoster",
  );
  expectDeny(
    checkAppointment(roleDocumentsFacts({ d3Present: false })),
    "appointment-d3-missing",
    "role.nominator.preflight.d3Missing",
  );
  expectDeny(
    checkAppointment(
      roleDocumentsFacts({ d3TargetRoleIds: ["env-bootstrap", "outsider"] }),
    ),
    "appointment-d3-invalid",
    "role.nominator.preflight.d3Invalid",
  );
  expectDeny(
    checkAppointment(roleDocumentsFacts({ d3TargetRoleIds: ["env-bootstrap", "qa"] })),
    "appointment-d3-not-selected",
    "role.nominator.preflight.d3NotSelected",
  );
  expectDeny(
    checkAppointment(roleDocumentsFacts({ d3RosterVersion: 2 })),
    "appointment-d3-roster-mismatch",
    "role.nominator.preflight.d3RosterMismatch",
  );
  expectDeny(
    checkAppointment(roleDocumentsFacts({ d3RosterSha256: "c".repeat(64) })),
    "appointment-d3-roster-mismatch",
    "role.nominator.preflight.d3RosterMismatch",
  );
  expectDeny(
    checkAppointment(roleDocumentsFacts({ d3By: "model" })),
    "appointment-facts-invalid",
    "role.nominator.preflight.factsInvalid",
  );
});

test("preflight role-documents：计划/三文档/边界负例", () => {
  expectDeny(
    checkAppointment(roleDocumentsFacts({ planCompleted: false })),
    "appointment-plan-incomplete",
    "role.nominator.preflight.planIncomplete",
  );
  expectDeny(
    checkAppointment(
      roleDocumentsFacts({ planRoleIds: ["env-bootstrap", "qa"] }),
    ),
    "appointment-plan-target-missing",
    "role.nominator.preflight.planTargetMissing",
  );
  expectDeny(
    checkAppointment(
      roleDocumentsFacts({
        cardPath: "角色卡/implementer/other.md",
      }),
    ),
    "appointment-document-invalid",
    "role.nominator.preflight.documentInvalid",
  );
  expectDeny(
    checkAppointment(
      roleDocumentsFacts({
        boundaryYamlPath: "角色卡/implementer/boundary.yml",
      }),
    ),
    "appointment-document-invalid",
    "role.nominator.preflight.documentInvalid",
  );
  expectDeny(
    checkAppointment(roleDocumentsFacts({ boundaryWithinRoleModules: false })),
    "appointment-boundary-scope-invalid",
    "role.nominator.preflight.boundaryScopeInvalid",
  );
  expectDeny(
    checkAppointment(roleDocumentsFacts({ boundaryMdYamlSynchronized: false })),
    "appointment-boundary-unsynchronized",
    "role.nominator.preflight.boundaryUnsynchronized",
  );
  expectDeny(
    checkAppointment(roleDocumentsFacts({ roleCardRequiredSections: false })),
    "appointment-role-card-sections-missing",
    "role.nominator.preflight.roleCardSectionsMissing",
  );
});

test("context()：appointment 卡数据与报告期望为静态纯数据", () => {
  const sections = nominatorRoleModule.context({ governanceModel: "trio" });
  assert.deepEqual(
    sections.map((section) => section.id),
    ["nominator-appointment-card", "nominator-appointment-write", "nominator-report-expectation"],
  );
  const byId = new Map(sections.map((section) => [section.id, section.text]));
  assert.equal(byId.get("nominator-appointment-card")?.includes("cardKind=appointment"), true);
  assert.equal(byId.get("nominator-appointment-card")?.includes("multiple=true"), true);
  const write = byId.get("nominator-appointment-write") ?? "";
  assert.equal(write.includes("cardKind: `appointment-write`"), true);
  assert.equal(write.includes("targetRoleId:"), true);
  assert.equal(write.includes("decisionId:"), true);
  assert.equal(write.includes("角色卡/<targetRoleId>/role-card.md"), true);
  assert.equal(byId.get("nominator-report-expectation")?.includes("submit_report"), true);
  assert.equal(
    byId.get("nominator-report-expectation")?.includes("task.created.from"),
    true,
  );
  // 无资源引用（模块不读盘）；重复调用结果稳定。
  for (const section of sections) assert.equal(section.resources, undefined);
  assert.deepEqual(nominatorRoleModule.context({ governanceModel: "single" }), sections);
});

test("纯策略：不修改输入、结果确定、无权限字段", () => {
  const facts = Object.freeze(d3CardFacts());
  const before = JSON.stringify(facts);
  const first = preflight!.checkAction({
    action: "appointment",
    facts,
  });
  const second = preflight!.checkAction({
    action: "appointment",
    facts,
  });
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(facts), before);

  const dispatchInput = Object.freeze({
    sourceRoleId: "chief",
    targetRoleId: "nominator",
    targetKind: "built-in-governance" as const,
    targetExists: true,
  });
  const dispatchBefore = JSON.stringify(dispatchInput);
  nominatorRoleModule.dispatch(dispatchInput);
  assert.equal(JSON.stringify(dispatchInput), dispatchBefore);

  for (const forbidden of ["allowed", "authorized", "approved", "grant", "token"]) {
    assert.equal(forbidden in first, false);
  }
  // 负例 details 只含普通 JSON 数据。
  const denied = checkAppointment(d3CardFacts({ d3CardOptionRoleIds: ["implementer"] }));
  assert.equal(denied.allow, false);
  if (denied.allow === false) {
    assert.doesNotThrow(() => JSON.stringify(denied.details));
  }
});
