// convener 角色模块单元测试（E1；团队计划 §4.4⑤ / B1 E1.7）。
//
// 覆盖：规格数据（D8/D10）、tools 门控（D1）、dispatch 硬身份/存在性（R-2）、
// preflight 四动作正负例（团队计划 / Git 动作 / stable-write / 需求变更）、context 资源与报告期望、
// 纯数据/无 I/O 约束。差分对照旧 oracle 见 `convener-differential.test.ts`。

import test from "node:test";
import assert from "node:assert/strict";

import {
  CONVENER_WORKER_DISPATCH_TARGETS,
  convenerRoleModule,
} from "../../../src/common/roles/convener/index.ts";
import type {
  RoleDispatchPolicyInput,
  RolePolicyDecision,
  RolePreflightInput,
  RoleToolId,
} from "../../../src/model/role.ts";

const MODULE = convenerRoleModule;

function denyCode(decision: RolePolicyDecision): string {
  return decision.allow === false ? decision.code : "";
}

function denyMessageKey(decision: RolePolicyDecision): string {
  return decision.allow === false ? decision.messageKey : "";
}

function preflight(action: RolePreflightInput["action"], facts: Readonly<Record<string, unknown>>): RolePolicyDecision {
  const hook = MODULE.preflight;
  assert.ok(hook, "convener 模块必须提供 preflight");
  return hook.checkAction({ action, facts });
}

function dispatch(input: RoleDispatchPolicyInput): ReturnType<NonNullable<typeof MODULE.dispatch>> {
  return MODULE.dispatch(input);
}

// —————————————————————— 共享 fixture ——————————————————————

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

const GIT_OID = Object.freeze({ objectFormat: "sha256" as const, hex: "c".repeat(64) });
const GIT_OID_2 = Object.freeze({ objectFormat: "sha256" as const, hex: "d".repeat(64) });
const GIT_BASIS = Object.freeze({ ref: "refs/ans/candidates/example", oid: GIT_OID });
const EVIDENCE_REF = Object.freeze({ oid: GIT_OID, path: "docs/quality/report.md", sha256: SHA_A });

function validTeamPlanFacts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actorRoleId: "convener",
    operationId: "op-plan-1",
    flowId: "focus",
    runId: "run-1",
    baseDigest: SHA_A,
    plan: {
      path: "docs/scheduling/focus-team-v2.md",
      sha256: SHA_B,
      version: 2,
    },
    ...overrides,
  };
}

function validStableWriteFacts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actorRoleId: "convener",
    kind: "workflow",
    content: "# 项目工作流\n",
    ...overrides,
  };
}

function validRequirementChangeFacts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actorRoleId: "convener",
    changeKind: "scope",
    summary: "需要补充新的验收证据形式",
    rationale: "现有证据形式无法覆盖真实运行环境",
    flowId: "focus",
    ...overrides,
  };
}

function validInitFacts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actorRoleId: "convener",
    action: "init",
    operationId: "op-init-1",
    taskId: "task-1",
    runId: "run-1",
    customerSource: true,
    repositoryState: "absent",
    ...overrides,
  };
}

function validCommitFacts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actorRoleId: "convener",
    action: "commit",
    operationId: "op-commit-1",
    taskId: "task-1",
    runId: "run-1",
    base: GIT_BASIS,
    paths: ["docs/workflow.md"],
    pathsAuthorized: true,
    ...overrides,
  };
}

function validIntegrateFacts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actorRoleId: "convener",
    action: "integrate",
    operationId: "op-integrate-1",
    taskId: "task-1",
    runId: "run-1",
    base: GIT_BASIS,
    candidates: [GIT_OID, GIT_OID_2],
    contributorsAccepted: true,
    contributorsAuthorized: true,
    ...overrides,
  };
}

function validRevertFacts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actorRoleId: "convener",
    action: "revert",
    operationId: "op-revert-1",
    taskId: "task-1",
    runId: "run-1",
    base: GIT_BASIS,
    commit: GIT_OID,
    controllerTaskId: "task-controller-1",
    reviewAccepted: true,
    ownerGrantsVerified: true,
    ...overrides,
  };
}

function validPublishFacts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actorRoleId: "convener",
    action: "publish",
    operationId: "op-publish-1",
    taskId: "task-1",
    runId: "run-1",
    expected: GIT_BASIS,
    candidate: GIT_OID,
    publishTarget: "delivery",
    finalCandidateVerified: true,
    criteria: [EVIDENCE_REF],
    evidence: [EVIDENCE_REF],
    creatorCloseOperationId: "op-close-1",
    ...overrides,
  };
}

// —————————————————————— 规格数据 ——————————————————————

test("规格数据：id/displayName/function/capabilities/cards 与旧 convener 规格一致（D8/D10）", () => {
  assert.equal(MODULE.id, "convener");
  assert.equal(MODULE.displayName, "运营");
  assert.equal(MODULE.function, "schedule");

  assert.deepEqual(MODULE.capabilities, {
    customerInput: true,
    dispatchTask: true,
    roleStatus: false,
    sessionTail: false,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
  });
  assert.deepEqual([...MODULE.cards], ["decision"]);

  // D8：旧 legacy "write" 不进入模块数据。
  assert.equal((MODULE.cards as readonly string[]).includes("write"), false);
  // appointment 只归人事。
  assert.equal((MODULE.cards as readonly string[]).includes("appointment"), false);

  assert.equal(MODULE.card.text.startsWith("# 角色：运营（内置角色；项目运营者）"), true);
  assert.equal(MODULE.card.text.includes("不创建新的 Verifier 或其它内置角色任务"), true);
  assert.equal(MODULE.card.text.includes("task.created.from"), true);

  assert.deepEqual(
    MODULE.card.entries.map((entry) => ({ root: entry.root, path: entry.path, kind: entry.kind })),
    [
      { root: "project", path: "docs/workflow.md", kind: "file" },
      { root: "project", path: "docs/scheduling/", kind: "directory" },
      { root: "project", path: "docs/governance/convener/", kind: "directory" },
    ],
  );
  assert.deepEqual([...MODULE.card.preauthorizedDirs], [
    "docs/workflow.md",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.deepEqual([...MODULE.card.forbiddenWritePaths], [
    ".ans/",
    "docs/bootstrap-manifest.md",
    "角色卡/governance-boundary.yaml",
    "角色卡/",
    "docs/proposals/",
    "docs/nominations/",
    "docs/skills/",
    "docs/mcp/",
  ]);

  // 纯数据：不可变、无权限/批准字段。
  assert.equal(Object.isFrozen(MODULE), true);
  assert.equal(Object.isFrozen(MODULE.capabilities), true);
  assert.equal(Object.isFrozen(MODULE.cards), true);
  for (const forbidden of ["allowed", "authorized", "approved", "grant"]) {
    assert.equal(forbidden in MODULE, false);
  }
});

// —————————————————————— tools() ——————————————————————

test("tools()：trio 返回 convener 五个允许工具；capabilities 与 spec 同源（D10）", () => {
  const policy = MODULE.tools({ governanceModel: "trio" });
  assert.deepEqual([...policy.tools], [
    "requestRequirementChange",
    "completeTeamPlan",
    "closeCreatedTask",
    "submitRefactor",
    "requestStableWrite",
  ] satisfies RoleToolId[]);
  assert.equal(policy.capabilities, MODULE.capabilities, "tools().capabilities 必须是 spec 的派生（同引用）");
  assert.deepEqual(policy.reasons, []);
  assert.equal(Object.isFrozen(policy.tools), true);
});

test("tools()：single 只保留旧角色门控两项；未知治理模型 fail-closed", () => {
  const single = MODULE.tools({ governanceModel: "single" });
  assert.deepEqual([...single.tools], ["submitRefactor", "requestStableWrite"]);

  const unknown = MODULE.tools({ governanceModel: "other" as "trio" });
  assert.deepEqual([...unknown.tools], []);
  assert.equal(unknown.reasons.length, 1);
  assert.equal(unknown.reasons[0]?.code, "governance-model-unknown");
  assert.equal(unknown.capabilities, MODULE.capabilities);
});

// —————————————————————— dispatch()（R-2）——————————————————————

test("dispatch()：真实 convener → 真实项目 worker（宿主显式存在）允许，报告期望 convener", () => {
  const policy = dispatch({
    sourceRoleId: "convener",
    targetRoleId: "implementer",
    targetKind: "project",
    targetExists: true,
  });
  assert.deepEqual(policy.decision, { allow: true });
  assert.equal(policy.reportToRoleId, "convener");
  assert.equal(CONVENER_WORKER_DISPATCH_TARGETS.workerTargetKind, "project");
  assert.deepEqual([...CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds], ["verifier"]);
});

test("dispatch()：内置目标只允许质检（verifier）；其它内置目标拒绝", () => {
  const verifier = dispatch({
    sourceRoleId: "convener",
    targetRoleId: "verifier",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.deepEqual(verifier.decision, { allow: true });
  assert.equal(verifier.reportToRoleId, "convener");

  // 存在性是宿主显式事实：内置目标缺省 targetExists 也 fail-closed（契约 §3.1）。
  for (const targetExists of [undefined, false] as const) {
    const denied = dispatch({
      sourceRoleId: "convener",
      targetRoleId: "verifier",
      targetKind: "built-in-governance",
      ...(targetExists === undefined ? {} : { targetExists }),
    });
    assert.equal(denyCode(denied.decision), "dispatch-target-missing");
    assert.equal(denied.reportToRoleId, undefined);
  }

  for (const targetRoleId of ["chief", "product", "rapporteur", "nominator", "su"]) {
    const denied = dispatch({
      sourceRoleId: "convener",
      targetRoleId,
      targetKind: "built-in-governance",
      targetExists: true,
    });
    assert.equal(denied.decision.allow, false, targetRoleId);
    assert.equal(denyCode(denied.decision), "convener-target-forbidden");
    assert.equal(denyMessageKey(denied.decision), "role.convener.dispatch.targetForbidden");
    assert.equal(denied.reportToRoleId, undefined);
  }
});

test("dispatch()：来源非 convener、空目标、自派、项目目标不存在、内置矛盾事实一律 fail-closed", () => {
  const missingSource = dispatch({
    targetRoleId: "implementer",
    targetKind: "project",
    targetExists: true,
  });
  assert.equal(denyCode(missingSource.decision), "dispatch-source-invalid");
  assert.equal(missingSource.reportToRoleId, undefined);

  const wrongSource = dispatch({
    sourceRoleId: "chief",
    targetRoleId: "implementer",
    targetKind: "project",
    targetExists: true,
  });
  assert.equal(denyCode(wrongSource.decision), "dispatch-source-invalid");

  const emptyTarget = dispatch({
    sourceRoleId: "convener",
    targetRoleId: "  ",
    targetKind: "project",
    targetExists: true,
  });
  assert.equal(denyCode(emptyTarget.decision), "dispatch-target-invalid");

  const self = dispatch({
    sourceRoleId: "convener",
    targetRoleId: "convener",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.equal(denyCode(self.decision), "self-dispatch");

  for (const targetExists of [undefined, false] as const) {
    const denied = dispatch({
      sourceRoleId: "convener",
      targetRoleId: "implementer",
      targetKind: "project",
      ...(targetExists === undefined ? {} : { targetExists }),
    });
    assert.equal(denyCode(denied.decision), "dispatch-target-missing");
    assert.equal(denied.reportToRoleId, undefined);
  }

  const contradictory = dispatch({
    sourceRoleId: "convener",
    targetRoleId: "verifier",
    targetKind: "built-in-governance",
    targetExists: false,
  });
  assert.equal(denyCode(contradictory.decision), "dispatch-target-missing");

  const badKind = dispatch({
    sourceRoleId: "convener",
    targetRoleId: "implementer",
    targetKind: "unknown-kind" as "project",
    targetExists: true,
  });
  assert.equal(denyCode(badKind.decision), "dispatch-target-kind-invalid");
});

// —————————————————————— preflight：动作范围 ——————————————————————

test("preflight：非本角色动作与非法 facts 默认拒绝（action-not-covered / facts-invalid）", () => {
  for (const action of ["version-upgrade", "detail-amendment", "run-change", "version-decision", "appointment", "review"] as const) {
    const decision = preflight(action, {});
    assert.equal(decision.allow, false, action);
    assert.equal(denyCode(decision), "action-not-covered");
    assert.equal(denyMessageKey(decision), "role.convener.preflight.actionNotCovered");
  }
  const hook = MODULE.preflight;
  assert.ok(hook);
  const nullFacts = hook.checkAction({ action: "team-plan", facts: null as unknown as Record<string, unknown> });
  assert.equal(denyCode(nullFacts), "facts-invalid");
});

test("preflight：未知 fact 键 deny（只读 api-spec 登记的键，fail-closed）", () => {
  const teamPlan = preflight("team-plan", { ...validTeamPlanFacts(), unexpected: true });
  assert.equal(denyCode(teamPlan), "facts-unknown");
  assert.deepEqual((teamPlan as { details?: unknown }).details, { action: "team-plan", key: "unexpected" });

  const git = preflight("git-action", { ...validCommitFacts(), unexpected: true });
  assert.equal(denyCode(git), "facts-unknown");

  const rc = preflight("requirement-change", { ...validRequirementChangeFacts(), unexpected: true });
  assert.equal(denyCode(rc), "facts-unknown");
});

// —————————————————————— preflight：team-plan ——————————————————————

test("preflight/team-plan：合法事实允许；baseDigest/plan.sha256 可缺省；路径/版本/形状/身份错误拒绝", () => {
  assert.deepEqual(preflight("team-plan", validTeamPlanFacts()), { allow: true });

  for (const key of ["actorRoleId", "operationId", "flowId", "plan"]) {
    const invalid = validTeamPlanFacts();
    delete invalid[key];
    assert.equal(denyCode(preflight("team-plan", invalid)), "team-plan-facts-invalid", key);
  }

  // 2026-11-09（B1 §4.3 旧断言改写）：旧断言为「删除 baseDigest ⇒ team-plan-facts-invalid」。
  // 新契约下 baseDigest 由应用从 effective trunk manifest digest 派生，角色侧事实包缺省合法 ⇒ allow。
  const withoutBaseDigest = validTeamPlanFacts();
  delete withoutBaseDigest["baseDigest"];
  assert.deepEqual(preflight("team-plan", withoutBaseDigest), { allow: true });

  // 新增正例（P-10）：plan 恰为 {path, version}（无 sha256）⇒ allow；sha256 由应用按实际字节派生。
  assert.deepEqual(
    preflight("team-plan", validTeamPlanFacts({ plan: { path: "docs/scheduling/focus-team-v2.md", version: 2 } })),
    { allow: true },
  );
  // 新 payload 形态（baseDigest 与 plan.sha256 均缺省）⇒ allow。
  const minimal = validTeamPlanFacts({ plan: { path: "docs/scheduling/focus-team-v2.md", version: 2 } });
  delete minimal["baseDigest"];
  assert.deepEqual(preflight("team-plan", minimal), { allow: true });

  for (const overrides of [
    { actorRoleId: "chief" },
    { operationId: "" },
    { flowId: "  " },
    { baseDigest: "a".repeat(63) },
    { runId: "" },
    { plan: { path: "docs/scheduling/focus-team-v2.md", sha256: SHA_B, version: 0 } },
    { plan: { path: "docs/scheduling/focus-team-v2.md", sha256: "not-a-sha", version: 2 } },
    { plan: { path: "docs/scheduling/focus-team-v2.md", sha256: SHA_B, version: 2, extra: true } },
    { plan: { path: "docs/scheduling/focus-team-v2.md", version: 2, extra: true } },
    { plan: { path: "docs/scheduling/focus-team-v2.md" } },
    { plan: { version: 2 } },
  ]) {
    assert.equal(denyCode(preflight("team-plan", validTeamPlanFacts(overrides))), "team-plan-facts-invalid", JSON.stringify(overrides));
  }

  const wrongFlow = validTeamPlanFacts({ flowId: "other" });
  assert.equal(denyCode(preflight("team-plan", wrongFlow)), "team-plan-path-invalid");
  const wrongVersion = validTeamPlanFacts({
    plan: { path: "docs/scheduling/focus-team-v3.md", sha256: SHA_B, version: 2 },
  });
  assert.equal(denyCode(preflight("team-plan", wrongVersion)), "team-plan-path-invalid");
  // RR5 形态非规范路径（`docs/scheduling/snake-game-team-plan-v1.md`）仍被路径规则拒绝（P-15/AC-8；不放宽）。
  const rr5Path = validTeamPlanFacts({
    flowId: "snake-game",
    plan: { path: "docs/scheduling/snake-game-team-plan-v1.md", sha256: SHA_B, version: 1 },
  });
  assert.equal(denyCode(preflight("team-plan", rr5Path)), "team-plan-path-invalid");
  assert.equal(denyMessageKey(preflight("team-plan", wrongFlow)), "role.convener.preflight.teamPlanPathInvalid");
});

// —————————————————————— preflight：stable-write ——————————————————————

test("preflight/stable-write：仅 convener 的 workflow 内容写入允许", () => {
  assert.deepEqual(preflight("stable-write", validStableWriteFacts()), { allow: true });
  assert.equal(denyCode(preflight("stable-write", validStableWriteFacts({ kind: "role-card" }))), "stable-write-kind-invalid");
  assert.equal(denyCode(preflight("stable-write", validStableWriteFacts({ kind: "boundary" }))), "stable-write-kind-invalid");
  assert.equal(denyCode(preflight("stable-write", validStableWriteFacts({ actorRoleId: "chief" }))), "stable-write-facts-invalid");
  assert.equal(denyCode(preflight("stable-write", validStableWriteFacts({ content: "" }))), "stable-write-facts-invalid");

  const missing = validStableWriteFacts();
  delete missing["content"];
  assert.equal(denyCode(preflight("stable-write", missing)), "stable-write-facts-invalid");
});

// —————————————————————— preflight：requirement-change ——————————————————————

test("preflight/requirement-change：至少一个归属键；changeKind/必填文本非法拒绝", () => {
  assert.deepEqual(preflight("requirement-change", validRequirementChangeFacts()), { allow: true });
  assert.deepEqual(
    preflight("requirement-change", validRequirementChangeFacts({ flowId: undefined, intentId: "intent-1" })),
    { allow: true },
  );
  assert.deepEqual(
    preflight("requirement-change", validRequirementChangeFacts({ flowId: undefined, taskId: "task-1" })),
    { allow: true },
  );
  assert.deepEqual(
    preflight(
      "requirement-change",
      validRequirementChangeFacts({ impact: "影响一个模块", proposedIntentPatch: "建议补充范围" }),
    ),
    { allow: true },
  );

  assert.equal(
    denyCode(preflight("requirement-change", validRequirementChangeFacts({ flowId: undefined }))),
    "requirement-change-scope-missing",
  );
  for (const overrides of [
    { changeKind: "unknown" },
    { changeKind: "scope", summary: "" },
    { changeKind: "scope", rationale: "" },
    { changeKind: "scope", impact: "" },
    { changeKind: "scope", proposedIntentPatch: "" },
    { actorRoleId: "rapporteur" },
  ]) {
    assert.equal(
      denyCode(preflight("requirement-change", validRequirementChangeFacts(overrides))),
      "requirement-change-facts-invalid",
      JSON.stringify(overrides),
    );
  }
});

// —————————————————————— preflight：git-action ——————————————————————

test("preflight/git-action/init：真实客户来源 + 仓库不存在才允许", () => {
  assert.deepEqual(preflight("git-action", validInitFacts()), { allow: true });

  const noSource = preflight("git-action", validInitFacts({ customerSource: false }));
  assert.equal(denyCode(noSource), "git-action-conditions-unmet");
  assert.deepEqual((noSource as { details?: { checks?: string[] } }).details?.checks, ["customer-source-required"]);

  for (const repositoryState of ["present", "unknown"]) {
    const decision = preflight("git-action", validInitFacts({ repositoryState }));
    assert.equal(denyCode(decision), "git-action-conditions-unmet", repositoryState);
    assert.deepEqual((decision as { details?: { checks?: string[] } }).details?.checks, ["repository-absent-required"]);
  }

  assert.equal(denyCode(preflight("git-action", validInitFacts({ taskId: "" }))), "git-action-facts-invalid");
});

test("preflight/git-action/commit：base/paths 与本人 scope 事实", () => {
  assert.deepEqual(preflight("git-action", validCommitFacts()), { allow: true });

  for (const overrides of [
    { taskId: "" },
    { runId: "" },
    { base: { ref: "refs/heads/main", oid: null } },
    { base: { ref: "", oid: GIT_OID } },
    { base: { ref: "refs/heads/main", oid: { objectFormat: "sha256", hex: "zz" } } },
    { paths: [] },
    { paths: [""] },
    { pathsAuthorized: "yes" },
  ]) {
    assert.equal(denyCode(preflight("git-action", validCommitFacts(overrides))), "git-action-facts-invalid", JSON.stringify(overrides));
  }

  const unauthorized = preflight("git-action", validCommitFacts({ pathsAuthorized: false }));
  assert.equal(denyCode(unauthorized), "git-action-conditions-unmet");
  assert.deepEqual((unauthorized as { details?: { checks?: string[] } }).details?.checks, ["paths-within-assigned-scope"]);
});

test("preflight/git-action/integrate：只收已授权且已收口的 owner 候选", () => {
  assert.deepEqual(preflight("git-action", validIntegrateFacts()), { allow: true });

  assert.deepEqual(
    (preflight("git-action", validIntegrateFacts({ contributorsAccepted: false })) as { details?: { checks?: string[] } })
      .details?.checks,
    ["contributors-accepted"],
  );
  assert.deepEqual(
    (preflight("git-action", validIntegrateFacts({ contributorsAuthorized: false })) as { details?: { checks?: string[] } })
      .details?.checks,
    ["contributors-authorized"],
  );
  for (const overrides of [
    { candidates: [] },
    { candidates: [GIT_OID, GIT_OID] },
    { candidates: ["deadbeef"] },
    { base: { ref: "refs/heads/main", oid: null } },
  ]) {
    assert.equal(denyCode(preflight("git-action", validIntegrateFacts(overrides))), "git-action-facts-invalid", JSON.stringify(overrides));
  }
});

test("preflight/git-action/revert：controller/review/OID 重新核验事实", () => {
  assert.deepEqual(preflight("git-action", validRevertFacts()), { allow: true });

  assert.deepEqual(
    (preflight("git-action", validRevertFacts({ reviewAccepted: false })) as { details?: { checks?: string[] } })
      .details?.checks,
    ["review-accepted"],
  );
  assert.deepEqual(
    (preflight("git-action", validRevertFacts({ ownerGrantsVerified: false })) as { details?: { checks?: string[] } })
      .details?.checks,
    ["owner-grants-verified"],
  );
  for (const overrides of [
    { controllerTaskId: "" },
    { commit: "not-an-oid" },
    { commit: { objectFormat: "sha1", hex: "c".repeat(64) } },
    { base: { ref: "refs/heads/main", oid: null } },
  ]) {
    assert.equal(denyCode(preflight("git-action", validRevertFacts(overrides))), "git-action-facts-invalid", JSON.stringify(overrides));
  }
});

test("preflight/git-action/publish：仅 delivery + 最终候选/收口/证据事实", () => {
  assert.deepEqual(preflight("git-action", validPublishFacts()), { allow: true });

  assert.equal(
    denyCode(preflight("git-action", validPublishFacts({ publishTarget: "documents" }))),
    "git-action-target-invalid",
  );
  assert.deepEqual(
    (preflight("git-action", validPublishFacts({ finalCandidateVerified: false })) as { details?: { checks?: string[] } })
      .details?.checks,
    ["final-candidate-verified"],
  );
  assert.deepEqual(
    (preflight("git-action", validPublishFacts({ creatorCloseOperationId: undefined })) as { details?: { checks?: string[] } })
      .details?.checks,
    ["creator-close-operation"],
  );
  for (const overrides of [
    { candidate: "not-an-oid" },
    { expected: { ref: "refs/heads/main", oid: null } },
    { criteria: [] },
    { evidence: [] },
    { evidence: [{ oid: GIT_OID, path: "", sha256: SHA_A }] },
    { evidence: [{ oid: GIT_OID, path: "docs/quality/report.md", sha256: "bad" }] },
  ]) {
    assert.equal(denyCode(preflight("git-action", validPublishFacts(overrides))), "git-action-facts-invalid", JSON.stringify(overrides));
  }
});

test("preflight/git-action：未知动作拒绝（git-action-invalid）", () => {
  const decision = preflight("git-action", {
    actorRoleId: "convener",
    action: "cherry-pick",
    operationId: "op-1",
  });
  assert.equal(denyCode(decision), "git-action-invalid");
  assert.equal(denyMessageKey(decision), "role.convener.preflight.gitActionInvalid");
});

// —————————————————————— context() ——————————————————————

test("context()：decision 卡 / 项目 workflow / 报告期望三段稳定文本", () => {
  const sections = MODULE.context({ governanceModel: "trio" });
  assert.deepEqual(sections.map((section) => section.id), ["decision-card", "project-workflow", "report-expectation"]);
  for (const section of sections) {
    assert.equal(section.text.trim().length > 0, true, section.id);
    // D5/Q4：项目 docs/workflow.md 不作为应用资源根下的 resources 声明。
    assert.equal(section.resources, undefined, section.id);
  }
  const text = sections.map((section) => section.text).join("\n");
  assert.equal(text.includes("request_choice(cardKind=decision)"), true);
  assert.equal(text.includes("recommended: true"), true);
  assert.equal(text.includes("docs/workflow.md"), true);
  assert.equal(text.includes("D5/Q4"), true);
  assert.equal(text.includes("submit_report"), true);
  assert.equal(text.includes("reportTargetForTaskCreator"), true);
  assert.equal(Object.isFrozen(sections), true);
});

test("context()：不同治理模型返回同一静态模板（无运行时事实拼接、无 I/O）", () => {
  assert.equal(MODULE.context({ governanceModel: "trio" }), MODULE.context({ governanceModel: "single" }));
});
