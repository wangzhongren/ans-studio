import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPLETE_SNAPSHOT_SCHEMA, FROZEN_ROLE_REF_KEYS, isCompleteSnapshot, isDirectActionReceipt,
  isDirectActionSource, isFrozenRoleEvidence,
  hasExecutionWorkflow,
  isActiveRoleEvidence,
  TRUNK_SOURCES,
  type CompleteSnapshot, type DirectActionReceipt, type DirectActionSource, type FrozenRoleEvidence,
  type TrunkManifest, type TrunkApplySnapshot, type ExecutionTrunkManifest,
  type ActiveRoleEvidence,
} from "../../src/model/trunk.ts";
import {
  isChiefDecisionExecutionContext, isJudgeD3Resolution, requestResolvedD3DecisionId, RUN_CHANGE_MODES,
  type ActivateRoleDocumentsInput, type ChiefDecisionExecutionContext, type CloseCreatedTaskInput,
  type CompleteTeamPlanInput, type DecidePendingRequestInput, type DirectSubmitVersionChangeInput,
  type GovernanceJudgeAudit, type SelectRunChangeInput, type SubmitVersionChangeFn,
  type TaskStateEvent,
} from "../../src/model/runtime.ts";
import {
  DOC_FREEZE_DIRECT_REASONS, DOC_FREEZE_JUDGE_DELEGATED_REASONS, isJudgeDelegatedSource,
  isValidDocFreezeRecord, type DirectDocFreezeRecord, type DocFreezeRecord, type JudgeDelegatedSource,
} from "../../src/model/version-change.ts";

const digest = "a".repeat(64), next = "b".repeat(64), at = "2026-11-05T00:00:00Z";
const ref = { snapshotId: "snapshot-1", path: "docs/evidence.md", sha256: digest };
const direct: DirectActionSource = { kind: "role-direct", actorRoleId: "product", action: "version-upgrade",
  operationId: "op-1", applicationId: "vc-1", baseDigest: digest, targetDigest: next, at };
const delegated: DirectActionSource = { kind: "chief-delegated", actorRoleId: "chief", originRoleId: "convener",
  requestId: "req-1", baseDigest: digest, delegationRevision: 2, disposition: "select", selected: ["alternative"], reason: "Evidence supports this option", at };

// Negative compile-time contracts; no production tool accepts a model-supplied identity.
type Assert<T extends true> = T;
type NoActor<T> = "actorRoleId" extends keyof T ? false : "source" extends keyof T ? false : true;
type ScopeOnly = Assert<NoActor<SelectRunChangeInput> & NoActor<CompleteTeamPlanInput>
  & NoActor<ActivateRoleDocumentsInput> & NoActor<CloseCreatedTaskInput> & NoActor<DecidePendingRequestInput>>;
void (0 as unknown as ScopeOnly);
// @ts-expect-error The new direct path must carry the expected original hash for each target.
const missingOriginalHash: DirectSubmitVersionChangeInput["targets"][number] = { kind: "contract", path: "a.md", action: "add" };
// @ts-expect-error Reject/revise cannot smuggle a selected approval.
const contradictoryDecision: DecidePendingRequestInput = { requestId: "r", baseDigest: digest, delegationRevision: 2, reason: "revise", disposition: "revise", selected: ["approve"] };
void missingOriginalHash; void contradictoryDecision;
// @ts-expect-error Execution cancellation cannot masquerade as a task.closed verdict.
const invalidClosure: CloseCreatedTaskInput["outcome"] = "cancelled";
const validClosure: CloseCreatedTaskInput["outcome"] = "accepted";
void invalidClosure; void validClosure;

test("three audit sources round-trip distinctly without fabricated customer facts", () => {
  const customer: DirectActionSource = { kind: "customer-decision", decisionId: "real-decision", at };
  for (const source of [customer, direct, delegated]) {
    assert.equal(isDirectActionSource(source), true);
    assert.deepEqual(JSON.parse(JSON.stringify(source)), source);
  }
  assert.equal(isDirectActionSource({ ...direct, decisionId: "pretend" }), false);
  assert.equal(isDirectActionSource({ ...direct, decidedBy: "customer" }), false);
  assert.equal(isDirectActionSource({ ...direct, actorRoleId: "nominator" }), false);
  assert.equal(isDirectActionSource({ ...customer, decisionId: "" }), false);
  assert.equal(isDirectActionSource({ ...delegated, actorRoleId: "judge" }), false);
});

test("chief delegation requires revision, request, basis, reason and a real disposition", () => {
  for (const key of ["requestId", "baseDigest", "reason", "delegationRevision"]) {
    const invalid: Record<string, unknown> = { ...delegated }; delete invalid[key];
    assert.equal(isDirectActionSource(invalid), false, key);
  }
  assert.equal(isDirectActionSource({ ...delegated, selected: [] }), false);
  assert.equal(isDirectActionSource({ ...delegated, selected: ["x", "x"] }), false);
  assert.equal(isDirectActionSource({ ...delegated, delegationRevision: -1 }), false);
  for (const disposition of ["reject", "revise"]) {
    assert.equal(isDirectActionSource({ ...delegated, disposition, selected: undefined }), true);
    assert.equal(isDirectActionSource({ ...delegated, disposition }), false);
  }
});

test("direct receipts distinguish committed recovery from pre-commit failure and no-op", () => {
  const base = { operationId: "op-1", baseDigest: digest, targetDigest: next };
  const applied: DirectActionReceipt = { ...base, ok: true, status: "applied" };
  const pending: DirectActionReceipt = { ...base, ok: false, status: "committed-pending-recovery",
    applicationId: "vc-1", journalId: "j-1", errorCode: "notification-failed", message: "Committed, notification pending" };
  assert.equal(isDirectActionReceipt(applied), true);
  assert.equal(isDirectActionReceipt({ ...applied, source: direct }), true);
  assert.equal(isDirectActionReceipt({ ...applied, source: { ...direct, operationId: "other" } }), false);
  assert.equal(isDirectActionReceipt({ ...base, ok: true, status: "no-op", targetDigest: digest }), true);
  assert.equal(isDirectActionReceipt({ ...base, ok: true, status: "no-op" }), false);
  assert.equal(isDirectActionReceipt(pending), true);
  for (const key of ["applicationId", "journalId", "targetDigest"]) {
    const invalid: Record<string, unknown> = { ...pending }; delete invalid[key];
    assert.equal(isDirectActionReceipt(invalid), false, key);
  }
  assert.equal(isDirectActionReceipt({ ...pending, ok: true }), false);
  for (const status of ["rejected", "blocked"]) assert.equal(isDirectActionReceipt({ ...base,
    status, ok: false, errorCode: "base-conflict", message: "Expected base changed" }), true);
});

test("complete snapshots preserve exact bytes, reject missing content, unsafe paths and duplicates", () => {
  const snapshot: CompleteSnapshot = { schema: COMPLETE_SNAPSHOT_SCHEMA, snapshotId: "snapshot-1", digest,
    files: [{ path: "docs/a.md", sha256: digest, bytesBase64: "77u/AA0K/w==" }], createdAt: at };
  assert.equal(isCompleteSnapshot(snapshot), true);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  assert.equal(isCompleteSnapshot({ ...snapshot, files: [] }), false);
  assert.equal(isCompleteSnapshot({ ...snapshot, files: [...snapshot.files, ...snapshot.files] }), false);
  for (const path of ["../x", "C:/x", "/x", "a\\b", "a//b"]) assert.equal(isCompleteSnapshot({ ...snapshot,
    files: [{ ...snapshot.files[0], path }] }), false, path);
  assert.equal(isCompleteSnapshot({ ...snapshot, files: [{ path: "docs/a.md", sha256: digest }] }), false);
  assert.equal(isCompleteSnapshot({ ...snapshot, files: [{ ...snapshot.files[0], bytesBase64: "not base64" }] }), false);
});

test("run frozen evidence is all-or-nothing and never combines different snapshots", () => {
  const evidence = { runId: "run-1", pinDigest: digest, roleId: "worker", snapshotRef: { snapshotId: "snapshot-1", digest },
    ...Object.fromEntries(FROZEN_ROLE_REF_KEYS.map(key => [key, { ...ref, path: `docs/${key}.md` }])) } as unknown as FrozenRoleEvidence;
  assert.equal(isFrozenRoleEvidence(evidence), true);
  assert.deepEqual(JSON.parse(JSON.stringify(evidence)), evidence);
  for (const key of FROZEN_ROLE_REF_KEYS) {
    const missing: Record<string, unknown> = { ...evidence }; delete missing[key];
    assert.equal(isFrozenRoleEvidence(missing), false, key);
    assert.equal(isFrozenRoleEvidence({ ...evidence, [key]: { ...ref, snapshotId: "live-new" } }), false, key);
  }
  assert.equal(isFrozenRoleEvidence({ ...evidence, pinDigest: "unknown" }), false);
});

test("historical customer freeze remains unchanged while direct freeze has no customer credentials", () => {
  const historical: DocFreezeRecord = { schema: "doc-freeze/v1", applicationId: "vc-0", reason: "vca-approved",
    origin: "customer", decidedBy: "customer", decisionId: "real-old", frozenAt: at };
  const raw = JSON.stringify(historical);
  const freeze: DirectDocFreezeRecord = { schema: "doc-freeze/v1", applicationId: "vc-1", reason: "role-direct-applied",
    origin: "role-direct", source: direct as Extract<DirectActionSource, { kind: "role-direct" }>,
    snapshotRef: { snapshotId: "snapshot-1", digest: next }, frozenAt: at };
  assert.deepEqual(DOC_FREEZE_DIRECT_REASONS, [freeze.reason]);
  assert.equal("decisionId" in freeze, false);
  assert.equal(JSON.stringify(historical), raw);
});

test("bounded real-chief decision context has no production writer or alternate executor", () => {
  const context: ChiefDecisionExecutionContext = { roleId: "chief", executionId: "exec-1", mode: "bounded-decision",
    productionWriteAuthority: false, tools: ["decide_pending_request"], limits: { maxTurns: 1, timeoutMs: 1000, maxAttempts: 1 },
    request: { requestId: "req-1", baseDigest: digest, delegationRevision: 2, originRoleId: "convener", cardKind: "decision",
      question: "Choose a supported recovery", options: [{ id: "recommended", label: "First", recommended: true },
        { id: "alternative", label: "Second" }], evidenceRefs: [ref] } };
  assert.equal(isChiefDecisionExecutionContext(context), true);
  assert.equal(isChiefDecisionExecutionContext({ ...context, roleId: "judge" }), false);
  assert.equal(isChiefDecisionExecutionContext({ ...context, productionWriteAuthority: true }), false);
  assert.equal(isChiefDecisionExecutionContext({ ...context, tools: ["decide_pending_request", "write"] }), false);
  assert.equal(isChiefDecisionExecutionContext({ ...context, limits: { ...context.limits, maxAttempts: Infinity } }), false);
  assert.equal(isChiefDecisionExecutionContext({ ...context, request: { ...context.request, delegationRevision: -1 } }), false);
});

test("existing submit function remains callable and all three explicit run choices remain distinct", async () => {
  const submit: SubmitVersionChangeFn = async () => ({ ok: true, applicationId: "vc-old", status: "submitted" });
  const result = await submit({ kind: "version-upgrade", initiatorRoleId: "product", flowId: "flow-1", summary: "legacy", targets: [] });
  assert.equal(result.status, "submitted");
  assert.deepEqual(RUN_CHANGE_MODES, ["continue-frozen", "stop-and-restart", "stop"]);
});

test("R3 planning trunk preserves missing workflow and cannot claim the execution prerequisite", () => {
  const planning: TrunkManifest = { schema: "trunk/v1", trunkVersion: 1, source: "bootstrap", previous: null,
    flowId: "flow-1", runId: null, artifacts: { documents: {}, execution: { teamPlan: null, flow: null }, boundaries: {} },
    digest, createdAt: at, updatedAt: at };
  const snapshot: TrunkApplySnapshot = { trunkVersion: 1, runId: null, documents: {}, execution: { teamPlan: null, flow: null } };
  // @ts-expect-error Planning-only manifest cannot be passed as an execution manifest before narrowing.
  const premature: ExecutionTrunkManifest = planning;
  void premature;
  assert.equal(hasExecutionWorkflow(planning), false);
  assert.equal("workflow" in JSON.parse(JSON.stringify(planning)).artifacts, false);
  assert.equal("workflow" in JSON.parse(JSON.stringify(snapshot)), false);
  const ready: TrunkManifest = { ...planning, artifacts: { ...planning.artifacts,
    workflow: { kind: "workflow", path: "docs/workflow.md", sha256: digest } } };
  assert.equal(hasExecutionWorkflow(ready), true);
  if (hasExecutionWorkflow(ready)) assert.equal(ready.artifacts.workflow.path, "docs/workflow.md");
  for (const workflow of [null, { kind: "workflow", path: "docs/workflow.md", sha256: "" },
    { kind: "boundary", path: "docs/workflow.md", sha256: digest },
    { kind: "workflow", path: "../workflow.md", sha256: digest }]) {
    assert.equal(hasExecutionWorkflow({ ...planning, artifacts: { ...planning.artifacts, workflow } } as TrunkManifest), false);
  }
});

test("R3 single freeze invariant accepts historical customer/application and bound direct/delegated records", () => {
  const legacy: DocFreezeRecord = { schema: "doc-freeze/v1", applicationId: "vc-old", reason: "vca-approved", origin: "customer", frozenAt: at };
  const customer: DocFreezeRecord = { ...legacy, decisionId: "real-customer", decidedBy: "customer",
    source: { kind: "customer-decision", decisionId: "real-customer", at } };
  const application: DocFreezeRecord = { schema: "doc-freeze/v1", applicationId: "migration-old", reason: "migrated-legacy", origin: "application", frozenAt: at };
  const roleDirect: DocFreezeRecord = { schema: "doc-freeze/v1", applicationId: "vc-1", reason: "role-direct-applied", origin: "role-direct",
    actorRoleId: "product", source: direct, snapshotRef: { snapshotId: "snapshot-1", digest: next }, frozenAt: at };
  const chief: DocFreezeRecord = { schema: "doc-freeze/v1", applicationId: "proposal-req-1", reason: "proposal-confirmed", origin: "chief-delegated",
    actorRoleId: "chief", source: delegated, frozenAt: at };
  for (const record of [legacy, customer, application, roleDirect, chief]) {
    const raw = JSON.stringify(record);
    assert.equal(isValidDocFreezeRecord(record), true, record.origin);
    assert.equal(isValidDocFreezeRecord(JSON.parse(raw)), true);
    assert.equal(JSON.stringify(record), raw, "pure validator never rewrites historical evidence");
  }
  // A committed delegate record carries its historical revision, not a live switch/revision input.
  assert.equal(isValidDocFreezeRecord(chief), true);
  const invalid: unknown[] = [null, [], { ...legacy, applicationId: "" }, { ...legacy, reason: "invented" },
    { ...legacy, origin: "application" }, { ...application, origin: "customer" }, { ...application, decidedBy: "customer" },
    { ...customer, source: { ...customer.source, decisionId: "other" } }, { ...application, source: direct },
    { ...roleDirect, decisionId: "fake" }, { ...roleDirect, actorRoleId: "chief" }, { ...roleDirect, applicationId: "other" },
    { ...roleDirect, snapshotRef: undefined }, { ...roleDirect, reason: "vca-approved" },
    { ...chief, decidedBy: "customer" }, { ...chief, decisionId: "fake" }, { ...chief, actorRoleId: "convener" },
    { ...chief, reason: "migrated-legacy" }, { ...chief, source: { ...delegated, disposition: "reject", selected: undefined } },
    { ...chief, source: { ...delegated, delegationRevision: -1 } }, { ...chief, frozenAt: "" }];
  for (const record of invalid) assert.equal(isValidDocFreezeRecord(record), false, JSON.stringify(record));
});

test("R5 activation evidence does not fabricate a run/pin and freezes only when real ones are bound", () => {
  assert.equal(TRUNK_SOURCES.includes("team-plan"), true);
  const active = { roleId: "worker", snapshotRef: { snapshotId: "snapshot-1", digest },
    ...Object.fromEntries(FROZEN_ROLE_REF_KEYS.map(key => [key, { ...ref, path: `docs/${key}.md` }])) } as unknown as ActiveRoleEvidence;
  assert.equal(isActiveRoleEvidence(active), true);
  assert.equal("runId" in active, false); assert.equal("pinDigest" in active, false);
  assert.equal(isFrozenRoleEvidence(active), false);
  assert.equal(isFrozenRoleEvidence({ ...active, runId: "real-run", pinDigest: digest }), true);
  assert.equal(isFrozenRoleEvidence({ ...active, runId: "", pinDigest: digest }), false);
  const planning = { schema: "trunk/v1", trunkVersion: 1, digest, activeRevision: 2, activeDigest: next,
    activeRoles: { worker: active } };
  assert.equal(JSON.parse(JSON.stringify(planning)).digest, digest);
  assert.equal(JSON.parse(JSON.stringify(planning)).trunkVersion, 1);
  assert.equal(JSON.parse(JSON.stringify(planning)).activeDigest, next);
});

// —————————————— 2026-11-09 judge-delegated（W-J1 Model/纯函数层；B1 J1/J2/J5-model/J9-helper） ——————————————

const judgeSource: JudgeDelegatedSource = { kind: "judge-delegated", requestId: "req-judge-1", engine: "claude",
  model: "claude-fable-5", operatorId: "judge:claude", reasonCode: "sufficient",
  reason: "Recommendation matches the confirmed intent", selected: ["confirm"], cardKind: "intent-confirm", at };
const judgeIntentFreeze: DocFreezeRecord = { schema: "doc-freeze/v1", applicationId: "intent-req-judge-1",
  reason: "intent-confirmed", origin: "judge-delegated", source: judgeSource,
  snapshotRef: { snapshotId: "snapshot-1", digest: next }, frozenAt: at };

test("J1/J2 judge-delegated freeze accepts honest intent/proposal sources and never fabricates customer facts", () => {
  // 正例：intent-confirmed / proposal-confirmed，字段不被重写
  assert.equal(isJudgeDelegatedSource(judgeSource), true);
  assert.deepEqual(JSON.parse(JSON.stringify(judgeSource)), judgeSource);
  assert.equal(isValidDocFreezeRecord(judgeIntentFreeze), true);
  const raw = JSON.stringify(judgeIntentFreeze);
  assert.equal(isValidDocFreezeRecord(JSON.parse(raw)), true);
  assert.equal(JSON.stringify(judgeIntentFreeze), raw, "pure validator never rewrites judge evidence");

  const proposalSource: JudgeDelegatedSource = { ...judgeSource, cardKind: "proposal", requestId: "req-judge-2" };
  const proposalFreeze: DocFreezeRecord = { ...judgeIntentFreeze, applicationId: "proposal-req-judge-2",
    reason: "proposal-confirmed", source: proposalSource };
  assert.equal(isValidDocFreezeRecord(proposalFreeze), true);

  // 审计真实：judge 来源/记录不得携带任何客户字段（decidedBy/decisionId/actorRoleId）
  for (const source of [{ ...judgeSource, decidedBy: "customer" }, { ...judgeSource, decisionId: "decision-req-judge-1" },
    { ...judgeSource, actorRoleId: "judge" }]) {
    assert.equal(isJudgeDelegatedSource(source), false, JSON.stringify(source));
  }
  const invalid: unknown[] = [
    null, [], "judge-delegated", 7,
    { ...judgeIntentFreeze, decidedBy: "customer" },
    { ...judgeIntentFreeze, decisionId: "decision-req-judge-1" },
    { ...judgeIntentFreeze, actorRoleId: "judge" },
    { ...judgeIntentFreeze, applicationId: "intent-req-other" },
    { ...judgeIntentFreeze, applicationId: "proposal-req-judge-1" },
    { ...judgeIntentFreeze, reason: "vca-approved" },
    { ...judgeIntentFreeze, reason: "version-upgrade-approved" },
    { ...judgeIntentFreeze, reason: "detail-item-applied" },
    { ...judgeIntentFreeze, reason: "amendment-submitted" },
    { ...judgeIntentFreeze, frozenAt: "2026-11-05T00:00:01Z" },
    { ...judgeIntentFreeze, frozenAt: "" },
    { ...judgeIntentFreeze, source: undefined },
    { ...judgeIntentFreeze, source: null },
    { ...judgeIntentFreeze, source: "judge-delegated" },
    { ...judgeIntentFreeze, source: { ...judgeSource, kind: "chief-delegated" } },
    { ...judgeIntentFreeze, source: { ...judgeSource, operatorId: "judge:codex" } },
    { ...judgeIntentFreeze, source: { ...judgeSource, engine: "" } },
    { ...judgeIntentFreeze, source: { ...judgeSource, requestId: "" } },
    { ...judgeIntentFreeze, source: { ...judgeSource, reasonCode: "" } },
    { ...judgeIntentFreeze, source: { ...judgeSource, cardKind: "proposal" } }, // reason↔cardKind 绑定
    { ...judgeIntentFreeze, source: { ...judgeSource, at: "" } },
    { ...judgeIntentFreeze, source: { ...judgeSource, selected: "confirm" } },
    { ...judgeIntentFreeze, snapshotRef: { snapshotId: "", digest: next } },
  ];
  for (const record of invalid) assert.equal(isValidDocFreezeRecord(record), false, JSON.stringify(record));

  // 旧记录兼容：customer/application 记录不经新分支（R3 套件保留；此处钉住相邻正例）
  const legacy: DocFreezeRecord = { schema: "doc-freeze/v1", applicationId: "vc-old", reason: "vca-approved",
    origin: "customer", decidedBy: "customer", decisionId: "real-old", frozenAt: at };
  assert.equal(isValidDocFreezeRecord(legacy), true);

  // G1 单一策略：不设长度上限、按账本原值保留（不截断）
  const longReason = "r".repeat(10_000);
  const longModel = "m".repeat(4_096);
  const longSource: JudgeDelegatedSource = { ...judgeSource, reason: longReason, model: longModel };
  const longFreeze: DocFreezeRecord = { ...judgeIntentFreeze, source: longSource };
  assert.equal(isJudgeDelegatedSource(longSource), true);
  assert.equal(isValidDocFreezeRecord(longFreeze), true);
  assert.equal((JSON.parse(JSON.stringify(longFreeze)).source as JudgeDelegatedSource).reason, longReason);
  assert.equal((JSON.parse(JSON.stringify(longFreeze)).source as JudgeDelegatedSource).model, longModel);

  assert.deepEqual([...DOC_FREEZE_JUDGE_DELEGATED_REASONS], ["proposal-confirmed", "intent-confirmed"]);
});

type ResolvedEvent = Extract<TaskStateEvent, { kind: "request.resolved" }>;

test("J9 shared D3 helpers: judge uses the real application decisionId and fails closed on malformed ledgers", () => {
  const judgeAudit: GovernanceJudgeAudit = { group: "decision", cardKind: "appointment", engine: "claude",
    model: "claude-fable-5", reasonCode: "sufficient", reason: "唯一推荐", selected: ["worker"] };
  const judgeResolved: ResolvedEvent = { v: 1, at, kind: "request.resolved", requestId: "req-judge-1",
    decisionId: "decision-req-judge-1", by: "judge", operatorId: "judge:claude", choice: "select",
    cardKind: "appointment", targetRoleIds: ["worker"], selectedOptionIds: ["worker"], judge: judgeAudit };
  assert.equal(isJudgeD3Resolution(judgeResolved), true);
  assert.equal(requestResolvedD3DecisionId(judgeResolved), "decision-req-judge-1");

  // customer / chief-delegated 既有语义不外溢
  const customer: ResolvedEvent = { ...judgeResolved, by: "customer", judge: undefined, operatorId: "51054" };
  assert.equal(isJudgeD3Resolution(customer), false);
  assert.equal(requestResolvedD3DecisionId(customer), "decision-req-judge-1");
  assert.equal(requestResolvedD3DecisionId({ ...customer, decisionId: undefined }), undefined);
  const chief: ResolvedEvent = { ...judgeResolved, by: "chief-delegated", judge: undefined,
    decisionId: undefined, actionSource: delegated };
  assert.equal(isJudgeD3Resolution(chief), false);
  assert.equal(requestResolvedD3DecisionId(chief), "req-judge-1");
  const directive: ResolvedEvent = { ...judgeResolved, by: "directive", judge: undefined, directiveId: "d-1" };
  assert.equal(isJudgeD3Resolution(directive), false);
  assert.equal(requestResolvedD3DecisionId(directive), undefined);
  assert.equal(requestResolvedD3DecisionId({ ...judgeResolved, by: "externally-unknown" } as unknown as ResolvedEvent), undefined);

  // 非法形状 fail-closed、不抛错（judge:null/非对象/缺字段/审计不自洽/冻结外字段混入）
  const invalid: unknown[] = [
    null, undefined,
    { ...judgeResolved, judge: null },
    { ...judgeResolved, judge: "audit" },
    { ...judgeResolved, judge: { ...judgeAudit, engine: "" } },
    { ...judgeResolved, judge: { ...judgeAudit, engine: undefined } },
    { ...judgeResolved, judge: { ...judgeAudit, reasonCode: "" } },
    { ...judgeResolved, judge: { ...judgeAudit, cardKind: undefined } },
    { ...judgeResolved, judge: { ...judgeAudit, group: undefined } },
    { ...judgeResolved, judge: { ...judgeAudit, group: "approval" } },
    { ...judgeResolved, judge: { ...judgeAudit, cardKind: "stable-write" } },
    { ...judgeResolved, operatorId: "judge:codex" },
    { ...judgeResolved, operatorId: undefined },
    { ...judgeResolved, actionSource: delegated },
    { ...judgeResolved, directiveId: "d-1" },
    { ...judgeResolved, decisionId: "decision-other" },
    { ...judgeResolved, decisionId: undefined },
    { ...judgeResolved, requestId: "", decisionId: "decision-" },
    { ...judgeResolved, requestId: undefined, decisionId: "decision-undefined" },
    { ...judgeResolved, by: "customer" },
  ];
  for (const record of invalid) assert.equal(isJudgeD3Resolution(record as ResolvedEvent), false, JSON.stringify(record));
  assert.equal(requestResolvedD3DecisionId(null as unknown as ResolvedEvent), undefined);
});
