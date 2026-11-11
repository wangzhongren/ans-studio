// test/编排/workflow-dispatch-fixed.test.ts
// T3 B1（2026-11-10）：B1 AC-01/AC-02/AC-04、T-01——fixed 派发矩阵全组合 + Q6 证据 fail-closed。
// 覆盖：convener→生产内置/项目；chief→verifier/stage-request/MF-10 项目验收角色；拒绝码；
// self/unknown-source/目标不存在；live-turn/assigned-task/identity/幂等/sourceTaskId 证据缺失。

import test from "node:test";
import assert from "node:assert/strict";

import {
  FIXED_CONVENER_BUILT_IN_TARGETS,
  evaluateFixedPathDispatchAuthorization,
  stageRequestIdempotencyKey,
  stageStopIdempotencyKey,
  type FixedDispatchEvidence,
  type FixedDispatchPolicyInput,
} from "../../src/common/编排/workflow-dispatch.ts";

const WF = "wf-0123456789abcdef01234567";
const AT = "2026-11-10T10:00:00.000Z";

function evidence(extra: Record<string, unknown> = {}): FixedDispatchEvidence {
  return {
    sourceIsCurrent: true,
    idempotencyKey: "dispatch-key-1",
    sourceTaskId: "t-chief-turn-1",
    identity: { sourceRoleId: "convener", targetRoleId: "product" },
    assignedTask: {
      taskId: "t-stage-request",
      from: "chief",
      to: "convener",
      taskKind: "stage-request",
      workflowId: WF,
      stage: "A4",
      open: true,
      stopped: false,
    },
    ...extra,
  } as FixedDispatchEvidence;
}

function base(extra: Partial<FixedDispatchPolicyInput>): FixedDispatchPolicyInput {
  return {
    sourceRoleId: "convener",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
    workflow: { workflowId: WF, stage: "A4" },
    evidence: evidence({ identity: { sourceRoleId: "convener", targetRoleId: "product" } }),
    ...extra,
  };
}

test("convener→product/rapporteur/nominator（内置，生产）允许；fixed 常量恰为三项", () => {
  assert.deepEqual([...FIXED_CONVENER_BUILT_IN_TARGETS], ["product", "rapporteur", "nominator"]);
  for (const target of ["product", "rapporteur", "nominator"]) {
    const decision = evaluateFixedPathDispatchAuthorization(base({
      targetRoleId: target,
      evidence: evidence({ identity: { sourceRoleId: "convener", targetRoleId: target } }),
    }));
    assert.equal(decision.ok, true, `${target}: ${decision.ok === false ? decision.code : ""}`);
    if (decision.ok) assert.equal(decision.purpose, "production");
  }
});

test("convener→verifier 拒绝 convener-to-verifier-forbidden；convener→chief/su 拒绝 convener-target-forbidden（自身= self-dispatch）", () => {
  const verifier = evaluateFixedPathDispatchAuthorization(base({ targetRoleId: "verifier" }));
  assert.equal(verifier.ok, false);
  if (!verifier.ok) assert.equal(verifier.code, "convener-to-verifier-forbidden");
  for (const target of ["chief", "su"]) {
    const decision = evaluateFixedPathDispatchAuthorization(base({ targetRoleId: target }));
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.code, "convener-target-forbidden", target);
  }
  const self = evaluateFixedPathDispatchAuthorization(base({ targetRoleId: "convener" }));
  assert.equal(self.ok, false);
  if (!self.ok) assert.equal(self.code, "self-dispatch");
});

test("convener→项目角色：targetExists 时必须绑定 open stage-request；缺省/已关闭/错创建者均拒绝", () => {
  const project = base({
    targetRoleId: "worker",
    targetKind: "project",
    evidence: evidence({ identity: { sourceRoleId: "convener", targetRoleId: "worker" } }),
  });
  const allow = evaluateFixedPathDispatchAuthorization(project);
  assert.equal(allow.ok, true, allow.ok === false ? allow.code : "");
  const missing = evaluateFixedPathDispatchAuthorization(base({
    targetRoleId: "worker", targetKind: "project", targetExists: false,
    evidence: evidence({ identity: undefined }),
  }));
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "target-card-missing");
});

test("convener 生产派发 Q6：无证据/来源已变/缺幂等/assigned-task 缺失或不匹配 ⇒ fail-closed", () => {
  const project = (ev: unknown) => {
    const record = (ev ?? {}) as Record<string, unknown>;
    return evaluateFixedPathDispatchAuthorization(base({
      targetRoleId: "worker", targetKind: "project",
      evidence: (ev === undefined ? undefined : {
        ...record,
        identity: { sourceRoleId: "convener", targetRoleId: "worker" },
      }) as never,
    }));
  };
  const noEvidence = project(undefined);
  assert.equal(noEvidence.ok, false);
  if (!noEvidence.ok) assert.equal(noEvidence.code, "dispatch-evidence-missing");

  const stale = project(evidence({ sourceIsCurrent: false }));
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "dispatch-source-changed");

  const noKey = project(evidence({ idempotencyKey: undefined }));
  assert.equal(noKey.ok, false);
  if (!noKey.ok) assert.equal(noKey.code, "dispatch-evidence-missing");

  const keyMismatch = project(evidence({ expectedIdempotencyKey: "other-key" }));
  assert.equal(keyMismatch.ok, false);
  if (!keyMismatch.ok) assert.equal(keyMismatch.code, "dispatch-evidence-missing");

  const noAssigned = project(evidence({ assignedTask: undefined }));
  assert.equal(noAssigned.ok, false);
  if (!noAssigned.ok) assert.equal(noAssigned.code, "stage-request-required");

  const closedAssigned = project(evidence({ assignedTask: { ...evidence().assignedTask, open: false } }));
  assert.equal(closedAssigned.ok, false);
  if (!closedAssigned.ok) assert.equal(closedAssigned.code, "stage-request-required");

  const stoppedAssigned = project(evidence({ assignedTask: { ...evidence().assignedTask, stopped: true } }));
  assert.equal(stoppedAssigned.ok, false);
  if (!stoppedAssigned.ok) assert.equal(stoppedAssigned.code, "stage-request-required");

  const wrongCreator = project(evidence({ assignedTask: { ...evidence().assignedTask, from: "convener" } }));
  assert.equal(wrongCreator.ok, false);
  if (!wrongCreator.ok) assert.equal(wrongCreator.code, "dispatch-evidence-missing");

  const wrongStage = project(evidence({ assignedTask: { ...evidence().assignedTask, stage: "A11" } }));
  assert.equal(wrongStage.ok, false);
  if (!wrongStage.ok) assert.equal(wrongStage.code, "dispatch-evidence-missing");

  const identityMismatch = evaluateFixedPathDispatchAuthorization(base({
    targetRoleId: "worker", targetKind: "project",
    evidence: evidence({ identity: { sourceRoleId: "chief", targetRoleId: "worker" } }),
  }));
  assert.equal(identityMismatch.ok, false);
  if (!identityMismatch.ok) assert.equal(identityMismatch.code, "dispatch-evidence-missing");
});

test("chief→verifier（前置/验收）允许；chief→product/rapporteur/nominator ⇒ chief-production-dispatch-forbidden", () => {
  const verifier = evaluateFixedPathDispatchAuthorization({
    sourceRoleId: "chief",
    targetRoleId: "verifier",
    targetKind: "built-in-governance",
    targetExists: true,
    purpose: "review",
    evidence: evidence({ identity: { sourceRoleId: "chief", targetRoleId: "verifier" } }),
  });
  assert.equal(verifier.ok, true, verifier.ok === false ? verifier.code : "");
  for (const target of ["product", "rapporteur", "nominator"]) {
    const decision = evaluateFixedPathDispatchAuthorization({
      sourceRoleId: "chief",
      targetRoleId: target,
      targetKind: "built-in-governance",
      targetExists: true,
      evidence: evidence({ identity: { sourceRoleId: "chief", targetRoleId: target } }),
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) assert.equal(decision.code, "chief-production-dispatch-forbidden", target);
  }
});

test("chief→项目角色仅 MF-10 窄例外：reviewRoleId+roster review+basis 一致+已激活；其余 chief-to-project-forbidden", () => {
  const narrow = (extra: Record<string, unknown>) => evaluateFixedPathDispatchAuthorization({
    sourceRoleId: "chief",
    targetRoleId: "qa-project",
    targetKind: "project",
    targetExists: true,
    purpose: "review",
    reviewRoleId: "qa-project",
    rosterReviewRoleId: "qa-project",
    basisReviewRoleId: "qa-project",
    targetActivated: true,
    workflow: { workflowId: WF, reviewRoleId: "qa-project" },
    evidence: evidence({ identity: { sourceRoleId: "chief", targetRoleId: "qa-project" } }),
    ...extra,
  });
  const allow = narrow({});
  assert.equal(allow.ok, true, allow.ok === false ? allow.code : "");

  for (const [label, extra] of Object.entries({
    "roster 未标记": { rosterReviewRoleId: undefined },
    "basis 不一致": { basisReviewRoleId: "verifier" },
    "未激活": { targetActivated: false },
  })) {
    const decision = narrow(extra);
    assert.equal(decision.ok, false, label);
    if (!decision.ok) assert.equal(decision.code, "review-role-invalid", label);
  }
  const randomRole = evaluateFixedPathDispatchAuthorization({
    sourceRoleId: "chief",
    targetRoleId: "other-worker",
    targetKind: "project",
    targetExists: true,
    purpose: "review",
    reviewRoleId: "qa-project",
    rosterReviewRoleId: "qa-project",
    basisReviewRoleId: "qa-project",
    targetActivated: true,
    evidence: evidence({ identity: { sourceRoleId: "chief", targetRoleId: "other-worker" } }),
  });
  assert.equal(randomRole.ok, false);
  if (!randomRole.ok) assert.equal(randomRole.code, "chief-to-project-forbidden");

  const production = evaluateFixedPathDispatchAuthorization({
    sourceRoleId: "chief",
    targetRoleId: "qa-project",
    targetKind: "project",
    targetExists: true,
    purpose: "production",
    reviewRoleId: "qa-project",
    rosterReviewRoleId: "qa-project",
    basisReviewRoleId: "qa-project",
    targetActivated: true,
  });
  assert.equal(production.ok, false);
  if (!production.ok) assert.equal(production.code, "chief-to-project-forbidden");
});

test("chief→convener 仅 stage-request：read-only、无 module/写集、sourceTaskId 必填；其余拒绝", () => {
  const stageRequest = (overrides: Record<string, unknown> = {}) => evaluateFixedPathDispatchAuthorization({
    sourceRoleId: "chief",
    targetRoleId: "convener",
    targetKind: "built-in-governance",
    targetExists: true,
    purpose: "stage-request",
    stageRequest: { taskKind: "stage-request", workflowAction: "advance", sideEffect: "read-only" },
    evidence: evidence({ identity: { sourceRoleId: "chief", targetRoleId: "convener" } }),
    ...overrides,
  });
  const allow = stageRequest();
  assert.equal(allow.ok, true, allow.ok === false ? allow.code : "");
  if (allow.ok) assert.equal(allow.purpose, "stage-request");

  const production = evaluateFixedPathDispatchAuthorization({
    sourceRoleId: "chief",
    targetRoleId: "convener",
    targetKind: "built-in-governance",
    targetExists: true,
    purpose: "production",
    evidence: evidence({ identity: { sourceRoleId: "chief", targetRoleId: "convener" } }),
  });
  assert.equal(production.ok, false);
  if (!production.ok) assert.equal(production.code, "target-card-missing");

  const withModule = stageRequest({ stageRequest: { taskKind: "stage-request", sideEffect: "read-only", moduleId: "core" } });
  assert.equal(withModule.ok, false);
  if (!withModule.ok) assert.equal(withModule.code, "stage-request-invalid");

  const withWrite = stageRequest({ stageRequest: { taskKind: "stage-request", sideEffect: "code" } });
  assert.equal(withWrite.ok, false);
  if (!withWrite.ok) assert.equal(withWrite.code, "stage-request-invalid");

  const noSource = stageRequest({ evidence: evidence({ identity: { sourceRoleId: "chief", targetRoleId: "convener" }, sourceTaskId: undefined }) });
  assert.equal(noSource.ok, false);
  if (!noSource.ok) assert.equal(noSource.code, "stage-request-source-missing");
});

test("self/unknown-source/目标类别缺失/目标不存在 ⇒ 稳定拒绝码", () => {
  const self = evaluateFixedPathDispatchAuthorization(base({ sourceRoleId: "product", targetRoleId: "product" }));
  assert.equal(self.ok, false);
  if (!self.ok) assert.equal(self.code, "self-dispatch");

  const unknown = evaluateFixedPathDispatchAuthorization(base({ sourceRoleId: "worker" }));
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, "unknown-source");

  const missingSource = evaluateFixedPathDispatchAuthorization(base({ sourceRoleId: undefined }));
  assert.equal(missingSource.ok, false);
  if (!missingSource.ok) assert.equal(missingSource.code, "unknown-source");

  const noKind = evaluateFixedPathDispatchAuthorization(base({ targetKind: undefined, targetBuiltIn: undefined }));
  assert.equal(noKind.ok, false);
  if (!noKind.ok) assert.equal(noKind.code, "target-card-missing");

  const noVerifier = evaluateFixedPathDispatchAuthorization({
    sourceRoleId: "chief",
    targetRoleId: "verifier",
    targetKind: "built-in-governance",
    targetExists: false,
    evidence: evidence(),
  });
  assert.equal(noVerifier.ok, false);
  if (!noVerifier.ok) assert.equal(noVerifier.code, "target-card-missing");
});

test("幂等键形态：advance 统一 stage-request:<wf>:<stage>:<attempt>；stop 独立 stage-stop（G-4）", () => {
  assert.equal(stageRequestIdempotencyKey(WF, "A4", 2), `stage-request:${WF}:A4:2`);
  assert.equal(stageStopIdempotencyKey(WF, "A11", 1), `stage-stop:${WF}:A11:1`);
  assert.ok(new Date(AT).toISOString() === AT);
});
