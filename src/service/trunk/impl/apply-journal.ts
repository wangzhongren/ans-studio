// src/service/trunk/impl/apply-journal.ts
// apply-journal 两阶段提交与崩溃对账（S2；P1 §2.3-14/§4.5；F1/F4/F18/F27/AC-12）。
//
// 协议（P1.6 §4.5）：
// 1. 校验目标冻结 + 内容哈希（以磁盘字节为准，内容匹配为主）；
// 2. 写 apply-journal.json（phase:"prepared"，fsync 由 Provider 原子写保证）；
// 3. 需要时经 RunRepinPort（S3）更新 pinned run → phase:"run-manifest-written"；
// 4. **提交点 = trunk manifest 写成功**；旧 manifest 先归档 history（不可变）；
// 5. phase:"committed"（仅审计）；事件载荷返回 S4 写账本。
//
// 失败路径一律不改 trunk 指针；历史归档失败/目标哈希不符/未冻结 ⇒ 不提交。
// 对账：内容匹配判定实际阶段（journal.target vs trunk manifest / run manifest），phase 仅辅助；
// 两方向/相位滞后如实返回 split，不自动「修复指针」。

import { bindInitialWorkflowSource, prepareInitialWorkflowSnapshot, applyStableSnapshot, isInitialWorkflowSource } from "./stable-snapshot.ts";
import { STABLE_WRITES_REL, STABLE_WRITE_PERMITS_REL, completeSnapshotDigest, scanVersionedDocuments, readOperationEvents, appendTaskLedgerEvent, createStableWriteStore, createStableWritePermitStore, acquireVersionLock, ownsVersionLock, readConfirmedIntentEvidence } from "../../../provider/version-change/public/version-change-store.ts";
import { createGitQueryPort, readGitInitializationFacts, readGitProtectionFacts, createGitDocumentMutationStore, createGitActiveMutationStore, createGitInitialWorkflowMutationStore, createGitCandidateStore, createGitRefStore, readGitCandidateEvidence, appendGitCandidateTaskEvent, readGitActiveCompletionBasis, appendGitActiveCompletionTaskEvent, readGitInitializationTaskBasis, appendGitInitializationTaskEvent } from "../../../provider/trunk/public/trunk-store.ts";
import { readGitStableCompletionBasis, appendGitStableCompletionTaskEvent, readGitDeliveryEvidence, appendGitDocumentPreparationTaskEvent, readGitPlanCompletionBasis, appendGitPlanCompletionTaskEvent } from "../../../provider/trunk/public/trunk-store.ts";
import { validateTaskStateEvent } from "../../../common/编排/task-state.ts";
import { isRunGitBases, type RunGitBases } from "../../../common/编排/run-manifest.ts";
import { governanceCardGroup, isJudgeD3Resolution, isTaskParentRef, isTaskReviewBasisRef, isDispatchTaskReviewTarget, isTaskReviewControllerRef, isDispatchTaskResumeController, isTaskWorkSourceRef, isRuntimeSessionDrained, requestResolvedD3DecisionId } from "../../../model/runtime.ts";
import { parseTeamPlan, parseProjectRoster, parseProjectModules, evaluatePlanningHandoff, isConvenerBuiltInDispatchTarget } from "../../../common/编排/workflow-preconditions.ts";
// X-R5（E2 S4）：verifier 最终 review 的角色侧前置——角色模块 public entry（api-spec §5 登记事实键）。
// 只消费 `preflight`；不调用模块 `dispatch()`（E2 评审 X-2/X-4：目标模块为 diff-only，不进生产路由）。
import { verifierRoleModule } from "../../../common/roles/verifier/index.ts";
// X-R6（E2 S2）：chief hub 派发的角色策略纯数据（routing/source/report/purpose/schema/五目标）。
// 只消费数据；Service 事务/账本/证据核验与真实 creator 路由逐字保留（E0 R-2）。
import { CHIEF_HUB_DISPATCH } from "../../../common/roles/chief/index.ts";
import type { SubmitVersionChangeInput, SelectRunChangeInput, SelectRunChangeResult, CompleteTeamPlanInput, CloseCreatedTaskInput, CloseCreatedTaskResult, TaskStateEvent, TaskClosedEvent, ActivateRoleDocumentsInput, ActivateRoleDocumentsResult, CustomerInputOutcome, DispatchTaskReviewTarget, GovernanceCardKind, GovernanceJudgeAudit } from "../../../model/runtime.ts";
import { isValidDocFreezeRecord, type DocFreezeRecord, type JudgeDelegatedSource } from "../../../model/version-change.ts";
import type { BoundaryEntry } from "../../../model/boundary.ts";
import { randomUUID, createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";

import {
  TRUNK_APPLY_JOURNAL_SCHEMA,
  TRUNK_MANIFEST_SCHEMA,
  type TrunkApplyJournal,
  type TrunkApplySnapshot,
  type TrunkArtifactRef,
  type TrunkDocKind,
  type TrunkErrorCode,
  type TrunkManifest,
  type TrunkSource,
  type TrunkStableArtifactRef,
  type DirectActionReceipt, type DirectActionSource, type CompleteSnapshot, isCompleteSnapshot, isSnapshotRef, isFrozenRoleEvidence, isSnapshotArtifactRef, isDirectActionReceipt, isDirectActionSource, isActiveRoleEvidence, isGitBasis, isGitOid, isGitLiteralPath, hasExecutionWorkflow, FROZEN_ROLE_REF_KEYS, type FrozenRoleEvidence,
} from "../../../model/trunk.ts";
import type {
  JournalContentPhase,
  ReconcileResult,
  TrunkApplyInput,
  TrunkApplyResult,
  TrunkServiceDeps,
  TrunkServiceResult,
  TrunkStateAuditPayload,
  TrunkDirectApplyInput, DecisionEvidenceInput, DecisionEvidenceVerification, PreparedDecisionEvidence, PreparedDirectSubmission, ExecutionRunBasis, CreatedTaskCloseBasis, CompletedTeamPlanReceipt, PreparedRoleActivation, TrunkRoleDocumentCheck, PreparedIntentConfirmation, PreparedExecutionRun, RoleDraftScope, RoleDispatchResult,
} from "../abstract/trunk-service.ts";
import { parseAmendmentSnapshot } from "./amendment-validate.ts";
import { validateUpgradeChain } from "./upgrade-validate.ts";
import { runManifestMatchesTarget } from "./trunk-derive.ts";
import {
  computeTrunkDigest,
  docFreezeState,
  docVersionOfPath,
  filePathOfRef,
  sha256File,
  snapshotMatchesManifest,
  snapshotOfManifest,
  canonicalJson,
} from "./trunk-common.ts";

export interface InternalApplyInput extends Omit<TrunkApplyInput, "source"> {
  source: TrunkSource;
  reason?: string;
}

function fail<T>(code: TrunkErrorCode, message?: string): TrunkServiceResult<T> {
  return { ok: false, code, message };
}

function emptySnapshot(): TrunkApplySnapshot {
  return {
    trunkVersion: 0,
    runId: null,
    documents: {},
    execution: { teamPlan: null, flow: null },
    boundaries: {},
  };
}

function stableSnapshotOf(
  refs: Record<string, TrunkStableArtifactRef> | undefined,
): Record<string, { path: string; sha256: string }> | undefined {
  if (refs === undefined) return undefined;
  const out: Record<string, { path: string; sha256: string }> = {};
  for (const [roleId, ref] of Object.entries(refs)) out[roleId] = { path: ref.path, sha256: ref.sha256 };
  return out;
}

/** 合并目标快照：未提供的 stable 快照沿用当前 manifest（不虚构），workflow 必填。 */
function mergeTarget(input: InternalApplyInput, current: TrunkManifest | undefined, newVersion: number): TrunkApplySnapshot {
  const workflow =
    input.target.workflow ??
    (current?.artifacts.workflow !== undefined
      ? { path: current.artifacts.workflow.path, sha256: current.artifacts.workflow.sha256 }
      : undefined);
  const roleCards =
    input.target.roleCards ??
    (current !== undefined ? stableSnapshotOf(current.artifacts.roleCards) : undefined);
  const boundaries =
    input.target.boundaries ??
    (current !== undefined ? stableSnapshotOf(current.artifacts.boundaries) : undefined);
  return {
    trunkVersion: newVersion,
    runId: input.runId,
    documents: input.target.documents,
    execution: input.target.execution,
    ...(workflow !== undefined ? { workflow } : {}),
    ...(roleCards !== undefined ? { roleCards } : {}),
    ...(boundaries !== undefined ? { boundaries } : {}),
  };
}

/** 目标内容哈希以磁盘字节复核（内容匹配为主；引用允许 `path#fragment`，哈希取文件部分）。 */
async function verifyTargetContent(projectRoot: string, target: TrunkApplySnapshot): Promise<string | undefined> {
  if (target.workflow === undefined) return "target.workflow 缺失";
  const check = async (label: string, relPath: string, expected: string): Promise<string | undefined> => {
    const actual = await sha256File(projectRoot, filePathOfRef(relPath));
    if (actual === undefined) return `${label} 文件缺失：${relPath}`;
    if (actual.toLowerCase() !== expected.toLowerCase()) return `${label} 哈希不符：${relPath}`;
    return undefined;
  };
  for (const [kind, ref] of Object.entries(target.documents)) {
    const problem = await check(`documents.${kind}`, ref.path, ref.sha256);
    if (problem !== undefined) return problem;
  }
  if (target.execution.teamPlan !== null) {
    const problem = await check("execution.teamPlan", target.execution.teamPlan.path, target.execution.teamPlan.sha256);
    if (problem !== undefined) return problem;
  }
  if (target.execution.flow !== null) {
    const problem = await check("execution.flow", target.execution.flow.path, target.execution.flow.sha256);
    if (problem !== undefined) return problem;
  }
  const workflowProblem = await check("workflow", target.workflow.path, target.workflow.sha256);
  if (workflowProblem !== undefined) return workflowProblem;
  for (const [roleId, ref] of Object.entries(target.roleCards ?? {})) {
    const problem = await check(`roleCards.${roleId}`, ref.path, ref.sha256);
    if (problem !== undefined) return problem;
  }
  for (const [roleId, ref] of Object.entries(target.boundaries ?? {})) {
    const problem = await check(`boundaries.${roleId}`, ref.path, ref.sha256);
    if (problem !== undefined) return problem;
  }
  return undefined;
}

/** 目标版本化文档必须已冻结（VCA approved/apply 时冻结；execution/stable 不查 guard，C15）。 */
async function verifyTargetsFrozen(
  deps: TrunkServiceDeps,
  target: TrunkApplySnapshot,
): Promise<string | undefined> {
  for (const [kind, ref] of Object.entries(target.documents)) {
    // 冻结记录按文件路径登记（无 fragment）；引用 `path#fragment` 时查文件部分。
    const state = await docFreezeState(deps.freezeRegistry, filePathOfRef(ref.path), ref.sha256);
    if (state === "corrupt") return "冻结注册表不可用：fail-closed（不自动重建）";
    if (state !== "frozen") return `documents.${kind} 未冻结：${ref.path}`;
  }
  return undefined;
}

function buildAudit(input: {
  manifest: TrunkManifest;
  previousTrunkVersion: number | null;
  journalId: string;
  decisionId?: string;
  amendmentId?: string;
  reason?: string;
  at: string;
}): TrunkStateAuditPayload {
  const { manifest, previousTrunkVersion, journalId, decisionId, amendmentId, reason, at } = input;
  const op = manifest.source === "recovery" ? "recovered" : "switched";
  return {
    kind: "trunk.state",
    op,
    trunkVersion: manifest.trunkVersion,
    ...(previousTrunkVersion !== null ? { previousTrunkVersion } : {}),
    runId: manifest.runId,
    flowId: manifest.flowId,
    source: manifest.source,
    origin: decisionId !== undefined ? "customer" : "application",
    ...(decisionId !== undefined ? { decidedBy: "customer" as const, decisionId } : {}),
    ...(amendmentId !== undefined ? { amendmentId } : {}),
    journalId,
    at,
    ...(reason !== undefined ? { reason } : {}),
  };
}

async function updateJournalQuietly(deps: TrunkServiceDeps, journal: TrunkApplyJournal): Promise<void> {
  try {
    await deps.store.writeJournal(journal);
  } catch {
    /* phase 仅审计：写失败由内容对账兜底 */
  }
}

function documentsOf(target: TrunkApplySnapshot): TrunkManifest["artifacts"]["documents"] {
  const documents: TrunkManifest["artifacts"]["documents"] = {};
  for (const [kind, ref] of Object.entries(target.documents)) {
    const version = docVersionOfPath(ref.path);
    documents[kind as TrunkDocKind] = {
      path: ref.path,
      sha256: ref.sha256,
      ...(version !== undefined ? { version } : {}),
    } satisfies TrunkArtifactRef;
  }
  return documents;
}

function roleCardsOf(target: TrunkApplySnapshot): TrunkManifest["artifacts"]["roleCards"] {
  const roleCards: Record<string, TrunkStableArtifactRef> = {};
  for (const [roleId, ref] of Object.entries(target.roleCards ?? {})) {
    roleCards[roleId] = { kind: "role-card", path: ref.path, sha256: ref.sha256 };
  }
  return roleCards;
}

function boundariesOf(target: TrunkApplySnapshot): TrunkManifest["artifacts"]["boundaries"] {
  const boundaries: Record<string, TrunkStableArtifactRef> = {};
  for (const [roleId, ref] of Object.entries(target.boundaries ?? {})) {
    boundaries[roleId] = { kind: "boundary", path: ref.path, sha256: ref.sha256 };
  }
  return boundaries;
}

/**
 * 两阶段提交（executeApply/recover 共用）。`source:"recovery"` 仅 recover() 调用。
 */
export async function commitTrunkApply(
  deps: TrunkServiceDeps,
  input: InternalApplyInput,
): Promise<TrunkServiceResult<TrunkApplyResult>> {
  const at = input.at;
  const journalId = input.journalId ?? `j-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const currentRead = await deps.store.readManifest();
  const manifestCorrupt = !currentRead.ok && currentRead.reason === "corrupt";
  if (manifestCorrupt && input.source !== "recovery") {
    return fail("trunk-manifest-corrupt", `trunk manifest 损坏：${currentRead.message ?? "invalid"}（恢复需客户确认）`);
  }
  const current = currentRead.ok ? currentRead.value : undefined;
  // 损坏 manifest 的恢复：以 journal 记录的最后已知版本作为 tN 提示（不自动重建）。
  let versionHint: number | null = null;
  if (manifestCorrupt) {
    const priorJournal = await deps.store.readJournal();
    if (priorJournal.ok) {
      versionHint = Math.max(priorJournal.value.target.trunkVersion, priorJournal.value.before.trunkVersion);
      if (!Number.isInteger(versionHint) || versionHint < 1) versionHint = null;
    }
  }

  if (input.source === "bootstrap") {
    if (current !== undefined) return fail("trunk-version-invalid", "已存在 trunk：bootstrap 只允许一次");
    if (input.baseTrunkVersion !== null) return fail("trunk-version-invalid", "bootstrap 必须 baseTrunkVersion:null");
  } else if (input.source !== "recovery") {
    if (current === undefined) return fail("trunk-unavailable", "无 trunk manifest：先 bootstrap/派生");
  }
  if (input.baseTrunkVersion !== null && input.source !== "recovery") {
    if (current === undefined || current.trunkVersion !== input.baseTrunkVersion) {
      return fail(
        "trunk-version-invalid",
        `baseTrunkVersion=${input.baseTrunkVersion} 与当前主干 ${String(current?.trunkVersion)} 不一致`,
      );
    }
  }

  const newVersion = current !== undefined ? current.trunkVersion + 1 : versionHint !== null ? versionHint + 1 : 1;
  const target = mergeTarget(input, current, newVersion);

  // 幂等：当前 manifest 内容已等于目标内容（崩溃后重放；版本按当前 manifest 归一比较）。
  // 元数据（rosterVersion/d3/roles）也须一致——显式修复携带名单事实时不得被内容幂等短路。
  const metadataMatches =
    current !== undefined &&
    (input.rosterVersion === undefined || input.rosterVersion === current.rosterVersion) &&
    (input.d3 === undefined || JSON.stringify(input.d3) === JSON.stringify(current.d3)) &&
    (input.roles === undefined || JSON.stringify(input.roles) === JSON.stringify(current.roles));
  if (
    current !== undefined &&
    metadataMatches &&
    current.flowId === input.flowId &&
    snapshotMatchesManifest({ ...target, trunkVersion: current.trunkVersion, runId: current.runId }, current)
  ) {
    return {
      ok: true,
      value: {
        manifest: current,
        journalId,
        alreadyApplied: true,
        previousTrunkVersion: current.previous?.trunkVersion ?? null,
        audit: buildAudit({
          manifest: current,
          previousTrunkVersion: current.previous?.trunkVersion ?? null,
          journalId,
          ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
          ...(input.amendmentId !== undefined ? { amendmentId: input.amendmentId } : {}),
          at,
        }),
      },
    };
  }

  const contentProblem = await verifyTargetContent(deps.projectRoot, target);
  if (contentProblem !== undefined) return fail("trunk-apply-failed", contentProblem);
  const frozenProblem = await verifyTargetsFrozen(deps, target);
  if (frozenProblem !== undefined) return fail("trunk-apply-failed", frozenProblem);

  const journal: TrunkApplyJournal = {
    v: 1,
    schema: TRUNK_APPLY_JOURNAL_SCHEMA,
    journalId,
    ...(input.amendmentId !== undefined ? { amendmentId: input.amendmentId } : {}),
    applicationId: input.applicationId,
    flowId: input.flowId,
    phase: "prepared",
    target,
    before: current !== undefined ? snapshotOfManifest(current) : emptySnapshot(),
    startedAt: at,
    updatedAt: at,
  };
  const journalWritten = await deps.store.writeJournal(journal);
  if (!journalWritten.ok) return fail("trunk-journal-write-failed", journalWritten.message ?? "journal 写入失败");

  if (input.repin !== undefined) {
    if (deps.runRepin === undefined) {
      await updateJournalQuietly(deps, { ...journal, result: "apply-failed", message: "run-repin-unavailable" });
      return fail("trunk-apply-failed", "run re-pin 端口未注入（S3 依赖）");
    }
    const repinned = await deps.runRepin.repin({
      runId: input.repin.runId,
      targets: input.repin.targets,
      applicationId: input.applicationId,
      ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
      at,
    });
    if (!repinned.ok) {
      await updateJournalQuietly(deps, { ...journal, result: "apply-failed", message: `run-repin:${repinned.message ?? repinned.code}` });
      return fail("trunk-apply-failed", `run manifest re-pin 失败：${repinned.message ?? repinned.code}`);
    }
    journal.phase = "run-manifest-written";
    journal.updatedAt = at;
    await updateJournalQuietly(deps, journal);
  }

  if (current !== undefined) {
    const archived = await deps.store.archiveHistory(current.trunkVersion, current);
    if (!archived.ok) {
      await updateJournalQuietly(deps, { ...journal, result: "apply-failed", message: "history-archive-failed" });
      return fail("trunk-apply-failed", `history 归档失败：${archived.message ?? archived.code}`);
    }
  }

  const documents = documentsOf(target);
  const roleCards = roleCardsOf(target);
  const boundaries = boundariesOf(target);
  const workflow = target.workflow;
  if (workflow === undefined) return fail("trunk-apply-failed", "target.workflow 缺失");
  const rosterVersion =
    input.rosterVersion ??
    (documents.roster !== undefined ? documents.roster.version : undefined) ??
    current?.rosterVersion;
  const d3 = input.d3 ?? current?.d3;
  const roles = input.roles ?? current?.roles;
  const digest = computeTrunkDigest({
    trunkVersion: newVersion,
    flowId: input.flowId,
    runId: input.runId,
    documents,
    execution: target.execution,
    workflow: { kind: "workflow", path: workflow.path, sha256: workflow.sha256 },
    roleCards,
    boundaries,
    ...(rosterVersion !== undefined ? { rosterVersion } : {}),
    ...(d3 !== undefined ? { d3 } : {}),
    ...(roles !== undefined ? { roles } : {}),
  });
  const manifest: TrunkManifest = {
    schema: TRUNK_MANIFEST_SCHEMA,
    trunkVersion: newVersion,
    source: input.source,
    previous:
      current !== undefined ? { trunkVersion: current.trunkVersion, runId: current.runId } : null,
    flowId: input.flowId,
    runId: input.runId,
    artifacts: {
      documents,
      execution: {
        teamPlan:
          target.execution.teamPlan === null
            ? null
            : { path: target.execution.teamPlan.path, sha256: target.execution.teamPlan.sha256 },
        flow:
          target.execution.flow === null
            ? null
            : {
                path: target.execution.flow.path,
                sha256: target.execution.flow.sha256,
                version: target.execution.flow.version,
              },
      },
      workflow: { kind: "workflow", path: workflow.path, sha256: workflow.sha256 },
      roleCards,
      boundaries,
    },
    ...(rosterVersion !== undefined ? { rosterVersion } : {}),
    ...(d3 !== undefined ? { d3 } : {}),
    ...(roles !== undefined ? { roles } : {}),
    digest,
    createdAt: current?.createdAt ?? at,
    updatedAt: at,
  };
  const written = await deps.store.writeManifest(manifest);
  if (!written.ok) {
    await updateJournalQuietly(deps, { ...journal, result: "apply-failed", message: written.message ?? "manifest-write-failed" });
    return fail("trunk-manifest-write-failed", written.message ?? "trunk manifest 写入失败（指针未变）");
  }

  journal.phase = "committed";
  journal.result = "committed";
  journal.updatedAt = at;
  await updateJournalQuietly(deps, journal);

  const previousTrunkVersion = current?.trunkVersion ?? null;
  return {
    ok: true,
    value: {
      manifest,
      journalId,
      alreadyApplied: false,
      previousTrunkVersion,
      ...(current !== undefined ? { historyArchivedVersion: current.trunkVersion } : {}),
      audit: buildAudit({
        manifest,
        previousTrunkVersion,
        journalId,
        ...(input.decisionId !== undefined ? { decisionId: input.decisionId } : {}),
        ...(input.amendmentId !== undefined ? { amendmentId: input.amendmentId } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        at,
      }),
    },
  };
}

/** `executeApply`：source ∈ amendment/upgrade/bootstrap（recovery 只经 recover()）。 */
export async function executeApply(
  deps: TrunkServiceDeps,
  input: TrunkApplyInput,
): Promise<TrunkServiceResult<TrunkApplyResult>> {
  return commitTrunkApply(deps, { ...input, source: input.source });
}

const PHASE_RANK: Readonly<Record<JournalContentPhase, number>> = Object.freeze({
  prepared: 0,
  "run-manifest-written": 1,
  committed: 2,
});

/** 崩溃对账：内容匹配为主、phase 辅助；两方向/相位滞后 ⇒ split（不自动修指针）。 */
export async function reconcileJournal(deps: TrunkServiceDeps): Promise<TrunkServiceResult<ReconcileResult>> {
  const now = deps.now ?? (() => new Date());
  const read = await deps.store.readJournal();
  if (!read.ok) {
    if (read.reason === "missing") return { ok: true, value: { state: "none", split: false } };
    return fail("trunk-journal-corrupt", `apply-journal 损坏：${read.message ?? read.reason}`);
  }
  const journal = read.value;
  const manifestRead = await deps.store.readManifest();
  let contentPhase: JournalContentPhase = "prepared";
  if (manifestRead.ok && snapshotMatchesManifest(journal.target, manifestRead.value)) {
    contentPhase = "committed";
  } else if (
    journal.target.runId !== null &&
    (await runManifestMatchesTarget(deps.projectRoot, journal.target.runId, journal.target))
  ) {
    contentPhase = "run-manifest-written";
  }

  if (contentPhase === "committed") {
    const manifest = manifestRead.ok ? manifestRead.value : undefined;
    const recorded = journal.phase;
    const split = recorded !== "committed";
    return {
      ok: true,
      value: {
        state: "committed",
        journalId: journal.journalId,
        recordedPhase: recorded,
        contentPhase,
        split,
        ...(split ? { message: "内容已到提交点但 phase 滞后：事件可由 S4 补写（幂等）" } : {}),
        ...(manifest !== undefined
          ? {
              audit: buildAudit({
                manifest,
                previousTrunkVersion: manifest.previous?.trunkVersion ?? null,
                journalId: journal.journalId,
                at: now().toISOString(),
              }),
            }
          : {}),
      },
    };
  }

  const split = PHASE_RANK[contentPhase] !== PHASE_RANK[journal.phase];
  if (contentPhase === "run-manifest-written") {
    return {
      ok: true,
      value: {
        state: split ? "split" : "run-manifest-written",
        journalId: journal.journalId,
        recordedPhase: journal.phase,
        contentPhase,
        split,
        ...(split
          ? { message: "run manifest 已 re-pin 但 journal phase 与内容不符：如实报告分裂态，交恢复" }
          : {}),
      },
    };
  }
  if (journal.phase !== "prepared") {
    return {
      ok: true,
      value: {
        state: "split",
        journalId: journal.journalId,
        recordedPhase: journal.phase,
        contentPhase,
        split: true,
        message: "journal phase 领先于磁盘内容：如实报告分裂态，不自动修复指针",
      },
    };
  }
  return {
    ok: true,
    value: {
      state: "prepared",
      journalId: journal.journalId,
      recordedPhase: journal.phase,
      contentPhase,
      split: false,
    },
  };
}


// Direct commits use immutable complete bytes and a single CAS pointer. They never re-pin a run.
const directHash = (value: unknown): string => createHash("sha256").update(canonicalJson(value)).digest("hex");
const directHashBytes = (value: string): string => createHash("sha256").update(value).digest("hex");
type RoleDirectSource = Extract<DirectActionSource, { kind: "role-direct" }>;
function directFailure(operationId: string, baseDigest: string | null, code: string, message: string): Extract<DirectActionReceipt, { ok: false }> {
  return { ok: false, status: "rejected", operationId, baseDigest, targetDigest: null, errorCode: code, message };
}
function directRefs(target: TrunkApplySnapshot): Array<{ path: string; sha256: string }> {
  return [...Object.values(target.documents), ...Object.values(target.execution), target.workflow,
    ...Object.values(target.roleCards ?? {}), ...Object.values(target.boundaries ?? {})]
    .filter((ref): ref is { path: string; sha256: string } => ref != null);
}
function targetSlots(target: TrunkApplySnapshot): Record<string, { path: string; sha256: string }> {
  return Object.fromEntries([...Object.entries(target.documents).map(([key, value]) => [`doc:${key}`, value] as const),
    ...Object.entries(target.execution).filter((entry): entry is [string, { path: string; sha256: string }] => entry[1] !== null)
      .map(([key, value]) => [`execution:${key}`, value] as const)]);
}
export async function readEffectiveSnapshot(deps: TrunkServiceDeps): Promise<TrunkServiceResult<{ manifest: TrunkManifest; snapshot: CompleteSnapshot }>> {
  const read = await deps.store.readManifest();
  if (!read.ok) return fail("trunk-unavailable", `effective-manifest-${read.reason}`);
  if (read.value.snapshotRef === undefined || deps.store.readSnapshot === undefined)
    return fail("trunk-unavailable", "complete-snapshot-evidence-missing");
  const snapshot = await deps.store.readSnapshot(read.value.snapshotRef);
  return snapshot.ok ? { ok: true, value: { manifest: read.value, snapshot: snapshot.value } }
    : fail("trunk-unavailable", `effective-snapshot-${snapshot.reason}`);
}
async function finishDirect(deps: TrunkServiceDeps, journal: TrunkApplyJournal, knownCommitted = false): Promise<DirectActionReceipt> {
  const source = journal.actionSource;
  if (source?.kind !== "role-direct" || journal.targetSnapshot === undefined || !journal.applicationId)
    return directFailure(journal.operationId ?? "unknown", null, "direct-evidence-missing", "Operation lacks complete source/snapshot evidence");
  const base = { operationId: source.operationId, baseDigest: source.baseDigest, targetDigest: source.targetDigest,
    applicationId: source.applicationId, journalId: journal.journalId, source };
  const pending = (message: string): DirectActionReceipt => ({ ...base, ok: false, status: "committed-pending-recovery",
    errorCode: "direct-metadata-pending", message });
  let committed;
  try { committed = deps.store.readOperationCommit ? await deps.store.readOperationCommit(journal)
    : await deps.store.readManifestAt!({ version: journal.target.trunkVersion, digest: source.targetDigest }, source.baseDigest === source.targetDigest ? undefined : journal.targetSnapshot); }
  catch (error) { return knownCommitted ? pending(String(error)) : { ...base, ok: false, status: "blocked", errorCode: "direct-commit-unverified", message: String(error) }; }
  const noOp = source.baseDigest === source.targetDigest;
  if (!committed.ok || (!noOp && committed.value.snapshotRef?.digest !== journal.targetSnapshot.digest)) {
    if (knownCommitted) return pending("Committed pointer requires recovery verification");
    return committed.ok || committed.reason === "missing" || committed.reason === "corrupt"
      ? directFailure(source.operationId, source.baseDigest, "direct-not-committed", "No committed pointer/history matches this operation and complete snapshot")
      : { ...base, ok: false, status: "blocked", errorCode: "direct-commit-unverified", message: "Cannot determine commit outcome" };
  }
  if (!noOp && (committed.value.actionSource?.kind !== "role-direct" || committed.value.actionSource.operationId !== source.operationId))
    return directFailure(source.operationId, source.baseDigest, "direct-operation-mismatch", "Committed source does not match operation");
  try {
    const evidence = await deps.store.readSnapshot!(journal.targetSnapshot);
    if (!evidence.ok) return pending("Complete operation bytes are unavailable");
    const hashes = new Map(evidence.value.files.map(file => [file.path, file.sha256]));
    if (!directRefs(snapshotOfManifest(committed.value)).every(ref => hashes.get(filePathOfRef(ref.path)) === ref.sha256))
      return pending("Operation snapshot is not a complete closure of the committed target");
    let metadataProof: import("../../../provider/version-change/public/version-change-store.ts").CommittedFreezeBasis | undefined;
    if (!noOp) {
      const before = targetSlots(journal.before);
      const freezes = Object.entries(journal.target.documents)
        .filter(([key, ref]) => canonicalJson(before[`doc:${key}`] ?? null) !== canonicalJson(ref))
        .map(([, ref]) => ({ path: filePathOfRef(ref.path), version: docVersionOfPath(filePathOfRef(ref.path))!, sha256: ref.sha256,
          freeze: { schema: "doc-freeze/v1" as const, applicationId: source.applicationId, reason: "role-direct-applied" as const,
            origin: "role-direct" as const, actorRoleId: source.actorRoleId, frozenAt: source.at, source, snapshotRef: journal.targetSnapshot } }));
      if (journal.amendmentId) {
        const amendment = evidence.value.files.find(file => {
          const parsed = parseAmendmentSnapshot(evidence.value, file.path, journal.flowId);
          return parsed.ok && parsed.value.amendmentId === journal.amendmentId;
        });
        if (!amendment) return pending("Frozen amendment audit bytes are missing");
        freezes.push({ path: amendment.path, version: docVersionOfPath(amendment.path)!, sha256: amendment.sha256,
          freeze: { schema: "doc-freeze/v1", applicationId: source.applicationId, reason: "role-direct-applied", origin: "role-direct",
            actorRoleId: source.actorRoleId, frozenAt: source.at, source, snapshotRef: journal.targetSnapshot } });
      }
      const committedBasis = freezes.length ? await deps.store.readCommittedFreezeBasis?.(journal) : undefined;
      if (committedBasis?.ok) metadataProof = committedBasis.value;
      const frozen = await deps.freezeRegistry.appendDocFreezeRecords(freezes, committedBasis?.ok ? { committedOperation: committedBasis.value } : undefined);
      if (!frozen.ok) return pending(frozen.message ?? frozen.code);
      await deps.freezeRegistry.refreshSnapshot();
    }
    if (journal.phase === "committed" && journal.result === "committed") return { ...base, ok: true, status: noOp ? "no-op" : "applied" };
    const completed: TrunkApplyJournal = { ...journal, phase: "committed", result: "committed", updatedAt: (deps.now ?? (() => new Date()))().toISOString() };
    const saved = metadataProof && deps.store.finalizeCommittedMetadata ? await deps.store.finalizeCommittedMetadata(completed, metadataProof) : await deps.store.writeOperation!(completed);
    if (!saved.ok) return pending(saved.message ?? saved.code);
    return { ...base, ok: true, status: noOp ? "no-op" : "applied" };
  } catch (error) { return pending(String(error)); }
}
export async function recoverDirect(deps: TrunkServiceDeps, operationId: string): Promise<DirectActionReceipt> {
  if (!deps.store.readOperation || !deps.store.writeOperation || !deps.store.readManifestAt || !deps.store.readSnapshot)
    return directFailure(operationId, null, "direct-store-unavailable", "Complete atomic storage is required");
  const read = await deps.store.readOperation(operationId);
  if (!read.ok) return directFailure(operationId, null, "direct-journal-unavailable", `operation-${read.reason}`);
  return finishDirect(deps, read.value);
}
async function readDirectPublicationManifest(store: TrunkServiceDeps["store"], flowId: string, base: TrunkDirectApplyInput["baseTrunk"]) {
  const read = await store.readManifest();
  if (!read.ok && base === null && read.message === "git-media-has-no-effective-ref" && store.readInitialGitPublicationBasis) {
    const initial = await store.readInitialGitPublicationBasis(flowId);
    if (initial.ok) return { ok: false as const, reason: "missing" as const };
  }
  return read;
}
async function executeDirectInternal(deps: TrunkServiceDeps, input: TrunkDirectApplyInput, prepareOnly = false): Promise<DirectActionReceipt | import("../abstract/trunk-service.ts").PreparedDirectCommit> {
  const { store } = deps;
  const reject = (code: string, message: string) => directFailure(input.operationId, input.baseTrunk?.digest ?? null, code, message);
  if (!store.captureSnapshot || !store.compareAndSwapManifest || !store.readSnapshot || !store.readOperation || !store.writeOperation || !store.readManifestAt)
    return reject("direct-store-unavailable", "Complete snapshot/CAS/recovery storage is required");
  if (!input.operationId?.trim() || !input.applicationId?.trim() || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(input.flowId))
    return reject("direct-invalid", "Missing operation/application/flow identity");
  if ((input.kind === "version-upgrade" ? "product" : input.kind === "detail-amendment" ? "rapporteur" : undefined) !== input.actorRoleId)
    return reject("vca-role-not-allowed", "Trusted role cannot perform this action");
  // A durable per-operation journal prevents concurrent operations from overwriting recovery evidence.
  const requestDigest = directHash({ kind: input.kind, flowId: input.flowId, baseTrunk: input.baseTrunk,
    applicationId: input.applicationId, actorRoleId: input.actorRoleId, target: { ...input.target, trunkVersion: 0, runId: null },
    expectedFrom: input.expectedFrom, amendmentId: input.amendmentId, amendmentDocPath: input.amendmentDocPath, rosterVersion: input.rosterVersion, d3: input.d3, roles: input.roles });
  const prior = await store.readOperation(input.operationId);
  if (prior.ok) {
    const source = prior.value.actionSource;
    if (prior.value.message !== `request:${requestDigest}` || source?.kind !== "role-direct" || source.actorRoleId !== input.actorRoleId || source.action !== input.kind
      || source.applicationId !== input.applicationId || prior.value.flowId !== input.flowId
      || source.baseDigest !== (input.baseTrunk?.digest ?? null)
      || canonicalJson({ ...input.target, trunkVersion: prior.value.target.trunkVersion, runId: prior.value.target.runId }) !== canonicalJson(prior.value.target))
      return reject("direct-replay-conflict", "Operation id was already bound to a different request");
    if (!prepareOnly) {
      const recovery = await finishDirect(deps, prior.value);
      if (recovery.ok || recovery.status === "committed-pending-recovery" || recovery.status === "blocked") return recovery;
    }
    // Prepared before a crash: resume below only while the original base still matches.
  } else if (prior.reason !== "missing") return reject("direct-journal-corrupt", prior.message ?? prior.reason);
  const read = await readDirectPublicationManifest(store, input.flowId, input.baseTrunk);
  if (!read.ok && read.reason !== "missing") return reject("trunk-unavailable", `manifest-${read.reason}`);
  const current = read.ok ? read.value : undefined;
  if (current ? current.flowId !== input.flowId || input.baseTrunk?.version !== current.trunkVersion || input.baseTrunk.digest !== current.digest : input.baseTrunk !== null)
    return reject("vca-base-mismatch", "Expected version and digest differ from the effective manifest");
  if (!current && (input.target.runId !== null || !input.target.documents.proposal))
    return reject("direct-bootstrap-evidence-missing", "Initial publication needs real proposal/confirmed-intent bytes, and cannot invent an old run");
  let confirmedIntent: { path: string; sha256: string } | undefined;
  let baselineRef: { path: string; sha256: string } | undefined;
  if (!current) {
    await deps.freezeRegistry.refreshSnapshot();
    const intents = (await deps.freezeRegistry.listFreezes()).filter(entry => entry.freeze.reason === "intent-confirmed"
      && (entry.freeze.origin === "customer" || entry.freeze.origin === "chief-delegated" || entry.freeze.origin === "judge-delegated")
      && entry.path.startsWith(`docs/product/${input.flowId}-intent-v`)).sort((a, b) => b.version - a.version);
    if (!intents[0] || !store.readProjectFile) return reject("direct-bootstrap-evidence-missing", "No actual confirmed-intent record");
    confirmedIntent = { path: intents[0].path, sha256: intents[0].sha256 };
    const baseline = await store.readProjectFile(".ans/state/versions.jsonl");
    if (!baseline.ok) return reject("direct-bootstrap-evidence-missing", "Confirmed-intent baseline bytes unavailable");
    baselineRef = { path: ".ans/state/versions.jsonl", sha256: baseline.value.sha256 };
  }
  const target = mergeTarget({ ...input, source: input.kind === "version-upgrade" ? "upgrade" : "amendment",
    baseTrunkVersion: current?.trunkVersion ?? null, runId: current?.runId ?? null }, current, (current?.trunkVersion ?? 0) + 1);
  // Direct document changes cannot silently change stable role permissions, workflow or run identity.
  if (current && (canonicalJson(target.workflow) !== canonicalJson(current.artifacts.workflow ? { path: current.artifacts.workflow.path, sha256: current.artifacts.workflow.sha256 } : undefined)
    || canonicalJson(target.roleCards ?? {}) !== canonicalJson(stableSnapshotOf(current.artifacts.roleCards) ?? {})
    || canonicalJson(target.boundaries ?? {}) !== canonicalJson(stableSnapshotOf(current.artifacts.boundaries) ?? {})))
    return reject("vca-boundary-forbidden", "Stable document activation requires its own authorised action");
  const before = current ? snapshotOfManifest(current) : emptySnapshot(), beforeSlots = targetSlots(before), nextSlots = targetSlots(target);
  if (Object.keys(beforeSlots).some(key => nextSlots[key] === undefined)) return reject("vca-target-invalid", "Cannot omit unchanged baseline references");
  const changed = Object.entries(nextSlots).filter(([key, ref]) => canonicalJson(beforeSlots[key] ?? null) !== canonicalJson(ref));
  const expected = new Map(input.expectedFrom.map(ref => [ref.path, ref.sha256]));
  if (expected.size !== input.expectedFrom.length || expected.size !== changed.length) return reject("vca-target-invalid", "Every changed target must have one expected original byte hash");
  for (const [key, ref] of changed) {
    if (!expected.has(ref.path) || expected.get(ref.path) !== (beforeSlots[key]?.sha256 ?? null))
      return reject("vca-hash-drift", `Original bytes changed: ${ref.path}`);
    const doc = key.startsWith("doc:") ? key.slice(4) : undefined;
    const suffix = doc === "roster" ? "roster" : doc;
    const validDoc = doc !== undefined && ["proposal", "modules", "topology", "architecture", "assets", "roster"].includes(doc)
      && ref.path === `docs/${doc === "architecture" || doc === "assets" ? "contracts" : "proposals"}/${input.flowId}-${suffix}-v${docVersionOfPath(ref.path)}.md`
      && docVersionOfPath(ref.path)! > (docVersionOfPath(beforeSlots[key]?.path ?? "") ?? 0);
    const validExecution = input.kind === "detail-amendment" && (key === "execution:teamPlan"
      ? new RegExp(`^docs/scheduling/${input.flowId}-team-v[1-9]\\d*\\.md$`).test(ref.path)
      : key === "execution:flow" && new RegExp(`^docs/flows/${input.flowId}\\.ya?ml$`).test(ref.path));
    if (!validDoc && !validExecution) return reject("vca-target-invalid", `Target is outside the authorised author area: ${ref.path}`);
  }
  let amendmentRef: { path: string; sha256: string } | undefined;
  if (input.kind === "detail-amendment") {
    if (!input.amendmentDocPath || !input.amendmentId || !store.readProjectFile) return reject("vca-invalid", "Detail submission requires the real amendment document");
    if (input.preparedSnapshotRef === undefined) {
      const amendmentBytes = await store.readProjectFile(input.amendmentDocPath);
      if (!amendmentBytes.ok) return reject("vca-target-invalid", "Amendment document is unreadable");
      amendmentRef = { path: input.amendmentDocPath, sha256: amendmentBytes.value.sha256 };
    }
  }
  const captured = input.preparedSnapshotRef !== undefined ? { ok: true as const, value: input.preparedSnapshotRef }
    : await store.captureSnapshot({ snapshotId: `s-${directHash([input.flowId, input.operationId])}`, createdAt: input.at,
    files: [...directRefs(target), ...(amendmentRef ? [amendmentRef] : []), ...(confirmedIntent ? [confirmedIntent] : []), ...(baselineRef ? [baselineRef] : [])], ...(current?.snapshotRef ? { baseSnapshotRef: current.snapshotRef } : {}) });
  if (!captured.ok) return reject("vca-hash-drift", captured.message ?? captured.reason);
  const complete = await store.readSnapshot(captured.value);
  if (!complete.ok) return reject("direct-evidence-missing", complete.message ?? complete.reason);
  const allFiles = new Map(complete.value.files.map(file => [file.path, file.sha256.toLowerCase()]));
  if (!directRefs(target).every(ref => allFiles.get(filePathOfRef(ref.path)) === ref.sha256.toLowerCase()))
    return reject("direct-evidence-missing", "Prepared snapshot omits a target or unchanged reference");
  for (const [key, ref] of changed.filter(([key]) => key.startsWith("execution:"))) {
    const file = complete.value.files.find(file => file.path === filePathOfRef(ref.path))!;
    const text = Buffer.from(file.bytesBase64, "base64").toString("utf8");
    let parsed: unknown;
    try {
      const body = key === "execution:teamPlan" ? /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] : text;
      parsed = body === undefined ? undefined : parseYaml(body);
    } catch { parsed = undefined; }
    if (!evidenceObject(parsed) || (key === "execution:teamPlan" ? parsed.schema !== "teamPlanSchema:3"
      : !Number.isSafeInteger(parsed.version) || parsed.version !== target.execution.flow?.version)
      || (parsed.flowId !== undefined && parsed.flowId !== input.flowId))
      return reject("vca-target-invalid", `Execution document schema/version differs from frozen target: ${ref.path}`);
  }
  if (input.kind === "detail-amendment") {
    const parsed = parseAmendmentSnapshot(complete.value, input.amendmentDocPath!, input.flowId);
    if (!parsed.ok) return reject("vca-target-invalid", parsed.message ?? parsed.code);
    const doc = parsed.value;
    if (doc.amendmentId !== input.amendmentId || (current ? !doc.baseTrunk || doc.baseTrunk.trunkVersion !== current.trunkVersion || doc.baseTrunk.digest !== current.digest : doc.baseTrunk !== null || !doc.bootstrap))
      return reject("vca-base-mismatch", "Frozen amendment identity/base does not match the operation");
    const items = doc.items.filter(item => item.change !== "none");
    if (items.length !== changed.length || new Set(items.map(item => item.to)).size !== items.length)
      return reject("vca-target-invalid", "Every amendment change must be applied once as a whole");
    for (const item of doc.items) {
      const slot = changed.find(([, ref]) => ref.path === item.to);
      if (item.change === "none") {
        if (!Object.values(beforeSlots).some(ref => ref.path === item.to) || !allFiles.has(item.to))
          return reject("vca-target-invalid", "No-op amendment item lacks real baseline bytes");
        continue;
      }
      if (!slot || (slot[0].startsWith("execution:") ? item.kind !== "execution" : slot[0] === "doc:roster" ? item.kind !== "roster" : item.kind !== "contract")
        || (item.change === "modify" && item.from !== beforeSlots[slot[0]]?.path)
        || (item.change === "add" && beforeSlots[slot[0]] !== undefined))
        return reject("vca-target-invalid", "Amendment items differ from the complete target");
    }
  }
  const chain = await validateUpgradeChain(deps.projectRoot, { flowId: input.flowId, documents: target.documents,
    rosterChanged: changed.some(([key]) => key === "doc:roster"), rosterVersionFloor: current?.rosterVersion,
    d3: input.d3 ?? current?.d3, planningOnly: true, confirmedIntent, snapshot: complete.value, roleDocumentChecks: input.roleDocumentChecks });
  if (!chain.ok) return reject("vca-target-invalid", chain.message ?? chain.code);
  const noOp = current !== undefined && changed.length === 0 && (input.rosterVersion === undefined || input.rosterVersion === current.rosterVersion)
    && (input.d3 === undefined || canonicalJson(input.d3) === canonicalJson(current.d3))
    && (input.roles === undefined || canonicalJson(input.roles) === canonicalJson(current.roles));
  const operationAt = prior.ok ? prior.value.startedAt : input.at;
  const documents = documentsOf(target), workflow = target.workflow;
  const manifest: TrunkManifest = { ...current, schema: TRUNK_MANIFEST_SCHEMA, flowId: input.flowId, runId: current?.runId ?? null,
    createdAt: current?.createdAt ?? operationAt, digest: "", trunkVersion: noOp ? current!.trunkVersion : (current?.trunkVersion ?? 0) + 1,
    previous: noOp ? current!.previous : current ? { trunkVersion: current.trunkVersion, runId: current.runId } : null,
    source: input.kind === "version-upgrade" ? "upgrade" : "amendment", updatedAt: operationAt,
    artifacts: { documents, execution: target.execution, ...(workflow ? { workflow: { kind: "workflow" as const, ...workflow } } : {}), roleCards: roleCardsOf(target), boundaries: boundariesOf(target) },
    snapshotRef: captured.value, ...(input.rosterVersion === undefined ? {} : { rosterVersion: input.rosterVersion }),
    ...(input.d3 === undefined ? {} : { d3: input.d3 }), ...(input.roles === undefined ? {} : { roles: input.roles }) };
  if (current) {
    // Document publication preserves the original stable confirmation metadata and active role pointers.
    manifest.artifacts.workflow = current.artifacts.workflow;
    manifest.artifacts.roleCards = current.artifacts.roleCards;
    manifest.artifacts.boundaries = current.artifacts.boundaries;
    if (noOp) manifest.artifacts = current.artifacts;
  }
  manifest.digest = noOp ? current!.digest : directHash({ flowId: manifest.flowId, trunkVersion: manifest.trunkVersion,
    artifacts: manifest.artifacts, snapshotRef: manifest.snapshotRef, rosterVersion: manifest.rosterVersion, d3: manifest.d3, roles: manifest.roles });
  const source: RoleDirectSource = prior.ok ? prior.value.actionSource as RoleDirectSource : { kind: "role-direct", action: input.kind,
    actorRoleId: input.actorRoleId, operationId: input.operationId, applicationId: input.applicationId,
    baseDigest: current?.digest ?? null, targetDigest: manifest.digest, at: input.at,
    journalId: `j-${directHash(input.operationId).slice(0, 24)}` };
  manifest.actionSource = source;
  const journal: TrunkApplyJournal = prior.ok ? prior.value : { v: 1, schema: TRUNK_APPLY_JOURNAL_SCHEMA,
    journalId: source.journalId!, applicationId: input.applicationId, operationId: input.operationId, flowId: input.flowId,
    ...(input.amendmentId ? { amendmentId: input.amendmentId } : {}),
    phase: "prepared", message: `request:${requestDigest}`, target: { ...target, trunkVersion: manifest.trunkVersion }, before,
    actionSource: source, targetSnapshot: captured.value,
    ...(current?.snapshotRef ? { beforeSnapshot: current.snapshotRef } : {}), startedAt: input.at, updatedAt: input.at };
  if (prepareOnly) return { preparationKind: "direct-document-commit", input: structuredClone(input), manifest, journal, snapshot: complete.value,
    expectedActive: { revision: current?.activeRevision ?? 0, digest: current?.activeDigest ?? null }, ...(current?.snapshotRef ? { expectedSnapshot: current.snapshotRef } : {}) };
  const saved = await store.writeOperation(journal);
  if (!saved.ok) return reject("trunk-journal-write-failed", saved.message ?? saved.code);
  if (noOp && current!.snapshotRef) {
    return finishDirect(deps, journal);
  }
  if (current && !noOp) {
    const archived = await store.archiveHistory(current.trunkVersion, current);
    if (!archived.ok) return reject("trunk-apply-failed", archived.message ?? archived.code);
  }
  let committed;
  try { committed = await store.compareAndSwapManifest(input.baseTrunk, manifest, captured.value,
    { revision: current?.activeRevision ?? 0, digest: current?.activeDigest ?? null }, current?.snapshotRef); }
  catch (error) { committed = { ok: false as const, code: "io" as const, message: String(error) }; }
  if (!committed.ok) {
    // A failed acknowledgement may follow the actual atomic pointer write. Re-read before classifying.
    const recovery = await finishDirect(deps, journal);
    if (recovery.ok || recovery.status === "committed-pending-recovery" || recovery.status === "blocked") return recovery;
    return reject(committed.code === "conflict" ? "vca-base-mismatch" : "trunk-manifest-write-failed", committed.message ?? committed.code);
  }
  return finishDirect(deps, journal, true);
}

export async function executeDirect(deps: TrunkServiceDeps, input: TrunkDirectApplyInput): Promise<DirectActionReceipt> {
  try { const result = await executeDirectInternal(deps, input); return "preparationKind" in result ? directFailure(input.operationId, input.baseTrunk?.digest ?? null, "direct-preparation-only", "No pointer was committed") : result; }
  catch (error) { return directFailure(input.operationId, input.baseTrunk?.digest ?? null, "direct-precommit-failed", String(error)); }
}


const DECISION_FILE_LIMIT = 64 * 1024;
const DECISION_TOTAL_LIMIT = 256 * 1024;
function evidenceObject(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function secretEvidence(path: string, text: string): boolean {
  return /(^|\/)(?:\.env(?:\.[^/]*)?|\.git|\.ssh|\.aws|\.codex|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*))($|\/)/i.test(path)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_+\/.=-]{12,}/i.test(text);
}
async function discoverDecisionFiles(projectRoot: string, flowId: string) {
  const docs = await scanVersionedDocuments(projectRoot, { filePrefix: `${flowId}-`, maxFiles: 128, maxBytesPerFile: DECISION_FILE_LIMIT });
  const latest = new Map<string, typeof docs[number]>();
  for (const doc of docs) {
    const family = doc.path.replace(/-v[1-9]\d*\.md$/i, "");
    if (!latest.has(family) || latest.get(family)!.version < doc.version) latest.set(family, doc);
  }
  return [...latest.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export async function checkDecisionEvidence(deps: TrunkServiceDeps, verification: DecisionEvidenceVerification): Promise<boolean> {
  if (!deps.store.readProjectFile || !verification.files.length || verification.files.length > 64) return false;
  try {
    if (verification.discovery && directHash(await discoverDecisionFiles(deps.projectRoot, verification.discovery.flowId)) !== verification.discovery.digest) return false;
    if (verification.task) {
      const ledger = await deps.store.readProjectFile(".ans/state/tasks.jsonl", { maxBytes: 2 * 1024 * 1024 });
      if (!ledger.ok) return false;
      const rows: unknown[] = Buffer.from(ledger.value.bytesBase64, "base64").toString("utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
      if (directHash(rows.filter(row => evidenceObject(row) && row.taskId === verification.task!.taskId)) !== verification.task.digest) return false;
    }
    for (const ref of verification.files) {
      const read = await deps.store.readProjectFile(ref.path, { maxBytes: 2 * 1024 * 1024 });
      if (ref.sha256 === null ? read.ok || read.reason !== "missing" : !read.ok || read.value.sha256 !== ref.sha256) return false;
    }
    return true;
  } catch { return false; }
}
/** Materialise one real pending request's bounded evidence; this grants no decision or execution authority. */
export async function prepareDecisionEvidence(deps: TrunkServiceDeps, input: DecisionEvidenceInput): Promise<TrunkServiceResult<PreparedDecisionEvidence>> {
  const { store } = deps, metadata = input.metadata, judge = metadata?.judgeContext;
  const unavailable = (message: string) => fail<PreparedDecisionEvidence>("trunk-unavailable", message);
  if (!store.readProjectFile || !store.prepareSnapshot || !store.readSnapshot || !store.readFrozenRoleEvidence)
    return unavailable("Complete evidence storage is unavailable");
  if (!input.originRoleId?.trim() || (metadata?.roleId !== undefined && metadata.roleId !== input.originRoleId)
    || judge?.unavailableReason || judge?.intentResolutionError || (judge?.facts.ledgerErrors ?? 0) > 0)
    return unavailable("Trusted origin or request evidence is unavailable");
  const flowId = judge?.flowId ?? metadata?.flowId ?? input.request.flowId;
  if (!flowId || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(flowId)) return unavailable("Pending request has no valid flow binding");
  if ([metadata?.flowId, input.request.flowId, judge?.facts.flowId].some(value => value !== undefined && value !== flowId))
    return unavailable("Request metadata contains conflicting flow bindings");
  const verification: { path: string; sha256: string | null }[] = [];
  const markers = async (rel: string) => {
    const read = await store.readProjectFile!(rel, { maxBytes: 2 * 1024 * 1024 });
    if (read.ok) verification.push({ path: rel, sha256: read.value.sha256 });
    else if (read.reason === "missing") verification.push({ path: rel, sha256: null });
    else throw new Error(read.message ?? read.reason);
    return read;
  };
  try {
    let runId = judge?.facts.runId;
    let taskVerification: { taskId: string; digest: string } | undefined;
    const taskId = metadata?.taskId;
    if (taskId) {
      const ledger = await store.readProjectFile(".ans/state/tasks.jsonl", { maxBytes: 2 * 1024 * 1024 });
      if (!ledger.ok) return unavailable("Task-bound request has no actual task ledger");
      const rows = Buffer.from(ledger.value.bytesBase64, "base64").toString("utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as unknown);
      const created = rows.find(row => evidenceObject(row) && row.kind === "task.created" && row.taskId === taskId);
      if (!evidenceObject(created) || typeof created.runId !== "string" || created.flowId !== flowId
        || (created.to !== input.originRoleId && created.from !== input.originRoleId)
        || (runId !== undefined && runId !== created.runId)) return unavailable("Task/request/run binding differs from the actual task creator");
      runId = created.runId;
      taskVerification = { taskId, digest: directHash(rows.filter(row => evidenceObject(row) && row.taskId === taskId)) };
    }
    let discovery: { flowId: string; digest: string } | undefined;
    const paths = [...new Set(Object.values(judge?.artifacts ?? {}).filter((value): value is string => typeof value === "string"))];
    if (metadata?.criteriaRef?.path) paths.push(metadata.criteriaRef.path);
    const files: Array<{ path: string; sha256: string; bytesBase64: string }> = [];
    let basis: unknown;
    if (runId !== undefined) {
      if (!/^run-[a-zA-Z0-9-]+$/.test(runId)) return unavailable("Invalid actual run identity");
      const raw = await markers(`.ans/runs/${runId}/manifest.json`);
      if (!raw.ok) return unavailable("Run-bound decision has no run manifest");
      const run: unknown = JSON.parse(Buffer.from(raw.value.bytesBase64, "base64").toString("utf8"));
      if (!evidenceObject(run) || run.runId !== runId || run.flowId !== flowId || (run.state !== "draft" && run.state !== "pinned"))
        return unavailable("Decision run is not a current draft or pinned run");
      basis = { runId, manifestSha256: raw.value.sha256 };
      if (run.state === "pinned") {
        if (!isSnapshotRef(run.snapshotRef) || !evidenceObject(run.frozenRoles) || !Object.keys(run.frozenRoles).length)
          return unavailable("Pinned run lacks historical complete evidence; live fallback is forbidden");
        const snapshot = await store.readSnapshot(run.snapshotRef);
        if (!snapshot.ok) return unavailable("Pinned snapshot is unreadable");
        for (const evidence of Object.values(run.frozenRoles)) {
          if (!isFrozenRoleEvidence(evidence) || evidence.runId !== runId || evidence.pinDigest !== run.pinDigest
            || evidence.snapshotRef.digest !== run.snapshotRef.digest || !(await store.readFrozenRoleEvidence(evidence)).ok)
            return unavailable("Pinned run role/authorization closure is incomplete");
        }
        files.push(...snapshot.value.files.map(file => ({ ...file })));
        if (paths.some(rel => !files.some(file => file.path === filePathOfRef(rel)))) return unavailable("Requested evidence is outside the frozen run snapshot");
      } else {
        const refs: Array<{ path: string; sha256: string }> = [];
        for (const group of [run.documents, run.execution]) if (evidenceObject(group)) for (const value of Object.values(group)) {
          if (value === null) continue;
          if (!evidenceObject(value) || typeof value.path !== "string" || typeof value.sha256 !== "string") return unavailable("Draft run lacks bound planning hashes");
          refs.push({ path: filePathOfRef(value.path), sha256: value.sha256 });
        }
        if (refs.length) {
          // A draft that already carries manifest-bound refs keeps the manifest as sole authority.
          if (paths.some(rel => !refs.some(ref => ref.path === filePathOfRef(rel)))) return unavailable("Draft request target is not bound to that run");
          for (const ref of refs) {
            const read = await markers(ref.path);
            if (!read.ok || read.value.sha256 !== ref.sha256) return unavailable("Draft run evidence drifted");
            files.push({ path: ref.path, ...read.value });
          }
        } else {
          // A′（fix 2026-11-09 proposal-draft-run-evidence-binding）：draft 在 pin 之前没有文档绑定写点
          // （manifest documents/execution 恒空）。以应用计算的目标集（host artifacts / criteriaRef；无则按
          // flowId 的版本化文档发现，与无 runId 分支同一机制）读取实际项目字节，逐文件 SHA-256 进入
          // complete-snapshot/v1，再由 verification/discovery 在结算前复核（漂移 fail-closed）。
          // 角色自报路径只做 ⊆ 校验，绝不直接读取；未知/空目标仍拒绝。
          if (!paths.length) {
            const discovered = await discoverDecisionFiles(deps.projectRoot, flowId);
            if (!discovered.length) return unavailable("Draft request target is not bound to that run");
            discovery = { flowId, digest: directHash(discovered) };
            paths.push(...discovered.map(file => file.path));
          }
          const targets = [...new Set(paths.map(filePathOfRef))];
          const declared = [...(metadata?.paths ?? []), ...(judge?.paths ?? [])].filter(rel => typeof rel === "string").map(filePathOfRef);
          if (declared.some(rel => !targets.includes(rel))) return unavailable("Draft request target is not bound to that run");
          const criteriaPath = metadata?.criteriaRef?.path === undefined ? undefined : filePathOfRef(metadata.criteriaRef.path);
          for (const target of targets) {
            const read = await markers(target);
            if (!read.ok) return unavailable(`Target evidence is unreadable: ${target}`);
            if (target === criteriaPath && typeof metadata?.criteriaRef?.sha256 === "string" && read.value.sha256 !== metadata.criteriaRef.sha256)
              return unavailable(`Target evidence hash differs from the criteria reference: ${target}`);
            files.push({ path: target, ...read.value });
          }
        }
      }
    } else {
      const manifest = await markers(".ans/trunk/manifest.json");
      if (manifest.ok) {
        const effective = await readEffectiveSnapshot(deps);
        if (!effective.ok || effective.value.manifest.flowId !== flowId) return unavailable("Request is not bound to the actual effective document trunk");
        basis = { trunkVersion: effective.value.manifest.trunkVersion, digest: effective.value.manifest.digest, snapshotRef: effective.value.manifest.snapshotRef };
        files.push(...effective.value.snapshot.files.map(file => ({ ...file })));
      } else basis = { flowId, manifest: null };
      if (!paths.length) {
        const discovered = await discoverDecisionFiles(deps.projectRoot, flowId);
        if (!discovered.length && !files.length) return unavailable("Initial request has no actual target artifact paths");
        discovery = { flowId, digest: directHash(discovered) };
        paths.push(...discovered.map(file => file.path));
      }
      for (const rel of paths) {
        const path = filePathOfRef(rel);
        const read = await markers(path);
        if (!read.ok) return unavailable(`Target evidence is unreadable: ${path}`);
        const existing = files.find(file => file.path === path);
        if (existing) {
          // A request for an effective ref uses its immutable bytes, never a live draft replacement.
          if (existing.sha256 !== read.value.sha256) return unavailable("Target path differs from the effective immutable evidence");
        } else files.push({ path, ...read.value });
      }
    }
    const uniqueFiles = [...new Map(files.map(file => [file.path, file])).values()];
    if (!uniqueFiles.length || uniqueFiles.length > 32) return unavailable("Evidence file budget is missing or exceeded");
    const requestData = { originRoleId: input.originRoleId, flowId, runId, taskId, request: input.request,
      facts: judge?.facts, intentId: judge?.intentId ?? metadata?.intentId, rosterVersion: metadata?.rosterVersion, rosterSha256: metadata?.rosterSha256 };
    const requestBytes = Buffer.from(canonicalJson(requestData));
    if (requestBytes.length > DECISION_FILE_LIMIT || secretEvidence("request.json", requestBytes.toString("utf8"))) return unavailable("Request is oversized or contains secret material");
    let total = requestBytes.length;
    const sections: string[] = [requestBytes.toString("utf8")];
    for (const file of uniqueFiles) {
      const bytes = Buffer.from(file.bytesBase64, "base64"), text = bytes.toString("utf8"); total += bytes.length;
      if (bytes.length > DECISION_FILE_LIMIT || total > DECISION_TOTAL_LIMIT || !Buffer.from(text, "utf8").equals(bytes) || secretEvidence(file.path, text))
        return unavailable("Evidence is oversized, non-text or secret; chief cannot decide automatically");
      sections.push(`FILE ${file.path}\nSHA256 ${file.sha256}\n${text}`);
    }
    const requestHash = createHash("sha256").update(requestBytes).digest("hex");
    uniqueFiles.push({ path: `.ans/decision-input/${requestHash}.json`, sha256: requestHash, bytesBase64: requestBytes.toString("base64") });
    const digest = completeSnapshotDigest(uniqueFiles), snapshotId = `decision-${digest}`;
    const saved = await store.prepareSnapshot({ schema: "complete-snapshot/v1", snapshotId, digest, files: uniqueFiles, createdAt: (deps.now ?? (() => new Date()))().toISOString() });
    if (!saved.ok) return unavailable(saved.message ?? saved.reason);
    return { ok: true, value: { baseDigest: directHash({ basis, requestHash, snapshotDigest: digest }),
      evidenceRefs: uniqueFiles.map(file => ({ snapshotId, path: file.path, sha256: file.sha256 })),
      context: sections.join("\n\n"), verification: { files: verification, ...(discovery ? { discovery } : {}), ...(taskVerification ? { task: taskVerification } : {}) } } };
  } catch (error) { return unavailable(String(error)); }
}


/** Application-side preparation for the existing submit tool. No decision, activation or pointer write. */
export async function prepareDirectCommit(deps: TrunkServiceDeps, input: TrunkDirectApplyInput): Promise<TrunkServiceResult<import("../abstract/trunk-service.ts").PreparedDirectCommit>> {
  try { const result = await executeDirectInternal(deps, input, true);
    return "preparationKind" in result ? { ok: true, value: result } : fail("trunk-item-invalid", result.message ?? result.status);
  } catch (error) { return fail("trunk-item-invalid", String(error)); }
}
/** Actual action provenance; worker ancestry follows its persisted controller, never the repository initialization operation. */
export async function readTaskProcessSource(deps: TrunkServiceDeps, input: { taskId: string; actorRoleId: string; flowId: string; runId: string }): Promise<TrunkServiceResult<import("../abstract/trunk-service.ts").PreparedTaskProcessSource>> {
  const invalid = (message: string) => fail<import("../abstract/trunk-service.ts").PreparedTaskProcessSource>("trunk-item-invalid", message);
  try {
    const ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return invalid("Actual action task ledger is unavailable");
    const assigned = (taskId: string) => {
      const rows = ledger.records.filter(row => row.value.taskId === taskId), creates = rows.filter(row => row.value.kind === "task.created");
      const value = creates.length === 1 ? validateTaskStateEvent(creates[0]!.value) : undefined;
      return value?.ok && value.event.kind === "task.created" && !rows.some(row => row.value.kind === "task.closed") ? value.event : undefined;
    };
    const task = assigned(input.taskId);
    if (!task || task.to !== input.actorRoleId || task.flowId !== input.flowId || task.runId !== input.runId) return invalid("Actual action task/actor/flow/run is absent, changed or closed");
    let sourceTask = task;
    if (task.from === "convener") {
      if (!isTaskParentRef(task.parentTaskRef)) return invalid("Worker process source requires its real persisted controller relation");
      const controller = assigned(task.parentTaskRef.taskId);
      if (!controller || controller.to !== "convener" || controller.from !== "chief" || controller.flowId !== input.flowId || controller.runId !== input.runId)
        return invalid("Worker controller process source is absent, closed or belongs to another flow/run");
      sourceTask = controller;
    }
    const ref = sourceTask.workSourceRef;
    if (sourceTask.from !== "chief" || !isTaskWorkSourceRef(ref)) return invalid("The actual action/controller has no original Chief input source");
    const run = await deps.store.readRunRecord?.(input.runId), file = await deps.store.readInitializationSource?.(ref.sourceId);
    if (!run?.ok || run.value.value.flowId !== input.flowId || !["draft", "pinned"].includes(String(run.value.value.state))
      || !file?.ok || file.value.path !== ref.path || file.value.sha256 !== ref.sha256.toLowerCase()) return invalid("Actual action run or immutable work-source bytes/hash differ");
    const source: unknown = JSON.parse(Buffer.from(file.value.bytesBase64, "base64").toString("utf8"));
    const root = await readGitProtectionFacts(deps.projectRoot);
    if (!evidenceObject(source) || source.schema !== "repository-work-source/v1" || source.sourceId !== ref.sourceId || source.flowId !== input.flowId
      || root.coverage !== "complete" || source.projectRoot !== root.projectRoot || source.kind !== (ref.kind === "chief-creator-report" ? "creator-report" : "customer-turn")
      || !evidenceObject(source.parent) || source.parent.roleId !== "chief" || typeof source.parent.sessionId !== "string" || !source.parent.sessionId.trim()
      || source.parent.inputAccepted !== true || source.parent.settled !== false) return invalid("Action source does not bind the original Chief/root/flow");
    if (source.purpose !== undefined && (source.targetRoleId !== sourceTask.to || source.planningRunId !== sourceTask.runId
      || !["builtin-preparation", "document-preparation", "team-planning", "role-preparation"].includes(String(source.purpose)))) return invalid("Action source belongs to another task purpose/run/actor");
    const execution = await verifyRestartExecutionSource(deps, source, input.runId, input.flowId);
    if (!execution.ok) return invalid(execution.message ?? execution.code);
    if (sourceTask.hubRouting === "chief-hub-v1" && (source.hubRouting !== sourceTask.hubRouting || (source.executionRunSelection === undefined && run.value.value.builtinPreparationSource !== ref.sourceId)))
      return invalid("Actual Hub controller differs from its source-bound run");
    const bytes = await deps.store.readProjectFile?.(".ans/state/tasks.jsonl", { maxBytes: 2 * 1024 * 1024 });
    if (!bytes?.ok) return invalid("Actual action task ledger bytes are unavailable");
    return { ok: true, value: { taskId: input.taskId, sourceAssignmentTaskId: sourceTask.taskId, parentCoreSessionId: source.parent.sessionId, workSourceRef: structuredClone(ref),
      expectedFiles: [{ path: file.value.path, sha256: file.value.sha256 }, { path: `.ans/runs/${input.runId}/manifest.json`, sha256: run.value.sha256 }, { path: ".ans/state/tasks.jsonl", sha256: bytes.value.sha256 }, ...execution.value.expectedFiles] } };
  } catch (error) { return invalid(String(error)); }
}

/** This private instance binding is not returned by model tools and cannot be recreated from a caller's allow flag. */
export function createDirectCommitPort(deps: TrunkServiceDeps) {
  type DirectPreparation = import("../abstract/trunk-service.ts").PreparedDirectCommit;
  type PlanPreparation = import("../abstract/trunk-service.ts").PreparedTeamPlanCommit;
  type ActivationPreparation = import("../abstract/trunk-service.ts").PreparedActivationCommit;
  type WorkflowPreparation = import("../abstract/trunk-service.ts").PreparedInitialWorkflowCommit;
  type Preparation = DirectPreparation | PlanPreparation | ActivationPreparation | WorkflowPreparation;
  type Authority = import("../abstract/trunk-service.ts").PreparedDirectAuthority;
  type Policy = import("../abstract/trunk-service.ts").DirectDocumentPolicyInput;
  const prepared = new WeakMap<Preparation, string>();
  async function prepareDirectAuthority(value: Preparation, taskId: string): Promise<TrunkServiceResult<Authority>> {
    const invalid = (message: string) => fail<Authority>("trunk-item-invalid", message);
    if (!prepared.has(value) || prepared.get(value) !== directHash(value) || !value.gitPlan) return invalid("Only this Service instance's unchanged Git preparation is accepted");
    const publication = value.preparationKind === "direct-document-commit" ? value.input : value.preparationKind === "active-role-commit" ? {
      operationId: value.input.operationId, flowId: value.input.flowId, actorRoleId: value.actorRoleId, baseTrunk: value.baseTrunk,
      expectedFrom: Object.values(value.input.documents),
    } : value.preparationKind === "initial-workflow-commit" ? {
      operationId: value.source.operationId, flowId: value.source.flowId, actorRoleId: "convener", baseTrunk: value.source.documentCommit,
      expectedFrom: [value.sourceFile, { path: value.input.path }, { path: STABLE_WRITES_REL }, { path: STABLE_WRITE_PERMITS_REL }],
    } : {
      operationId: value.input.operationId, flowId: value.input.flowId, actorRoleId: value.actorRoleId, baseTrunk: value.baseTrunk,
      expectedFrom: [{ path: value.input.plan.path, sha256: value.input.plan.sha256 }],
    };
    try {
        if (value.preparationKind === "active-role-commit") {
          const fresh = await prepareRoleActivation(deps, value.input, "nominator", true);
          if (!fresh.ok || directHash(fresh.value) !== directHash(value.activation)) return invalid("Actual D3/document/active activation basis changed");
        }
        if (value.preparationKind === "initial-workflow-commit") {
          if (value.source.taskId !== taskId) return invalid("Workflow task differs from its immutable actual Core work source");
          const fresh = await prepareInitialWorkflowSnapshot(deps, value.input, true);
          if (!("preparationKind" in fresh) || directHash([fresh.source, fresh.sourceFile, fresh.before, fresh.manifest, fresh.snapshot, fresh.record, fresh.permit])
            !== directHash([value.source, value.sourceFile, value.before, value.manifest, value.snapshot, value.record, value.permit])) return invalid("Actual workflow approval/consumption/document basis changed");
        }
        const ledger = await readOperationEvents(deps.projectRoot);
        if (!ledger.ok) return invalid("Actual task authorization is unavailable");
        const rows = ledger.records.filter(row => row.value.taskId === taskId), creates = rows.filter(row => row.value.kind === "task.created");
        const event = creates[0] ? validateTaskStateEvent(creates[0].value) : undefined;
        if (creates.length !== 1 || !event?.ok || event.event.kind !== "task.created" || event.event.to !== publication.actorRoleId || event.event.flowId !== publication.flowId
          || !event.event.runId || rows.some(row => row.value.kind === "task.closed")) return invalid("The real publication task is absent, closed or belongs to another actor/flow");
        if (value.preparationKind === "team-plan-commit" && value.input.runId && value.input.runId !== event.event.runId) return invalid("Plan input run differs from the actual assigned task run");
        if (value.preparationKind === "initial-workflow-commit" && event.event.runId !== value.source.runId) return invalid("Actual workflow source run differs from assigned task");
        const task = event.event, run = await deps.store.readRunRecord?.(task.runId!);
        if (!run?.ok || run.value.value.flowId !== task.flowId || !["draft", "pinned"].includes(String(run.value.value.state))) return invalid("The actual publication run is unavailable or cancelled");
        const ref = task.workSourceRef;
        if (task.from !== "chief" || !isTaskWorkSourceRef(ref)) return invalid("The actual publication task has no original Chief input source");
        const sourceFile = await deps.store.readInitializationSource?.(ref.sourceId);
        if (!sourceFile?.ok || sourceFile.value.path !== ref.path || sourceFile.value.sha256 !== ref.sha256.toLowerCase()) return invalid("Actual publication work-source bytes/hash differ");
        const source: unknown = JSON.parse(Buffer.from(sourceFile.value.bytesBase64, "base64").toString("utf8"));
        if (!evidenceObject(source) || source.schema !== "repository-work-source/v1" || source.sourceId !== ref.sourceId || source.flowId !== task.flowId
          || source.projectRoot !== value.gitPlan.repo.root || source.kind !== (ref.kind === "chief-creator-report" ? "creator-report" : "customer-turn")
          || !evidenceObject(source.parent) || source.parent.roleId !== "chief" || typeof source.parent.sessionId !== "string" || !source.parent.sessionId.trim()
          || source.parent.inputAccepted !== true || source.parent.settled !== false) return invalid("Publication task input source does not bind its actual Chief/root/flow");
        if (source.purpose !== undefined && (source.targetRoleId !== task.to || source.planningRunId !== task.runId
          || !["builtin-preparation", "document-preparation", "team-planning", "role-preparation"].includes(String(source.purpose)))) return invalid("Publication source belongs to another actual task purpose/run/actor");
        const execution = await verifyRestartExecutionSource(deps, source, task.runId!, task.flowId!);
        if (!execution.ok) return invalid(execution.message ?? execution.code);
        if (task.hubRouting === "chief-hub-v1" && (source.hubRouting !== task.hubRouting || (source.executionRunSelection === undefined && run.value.value.builtinPreparationSource !== ref.sourceId))) return invalid("Publication Hub task differs from its actual source-bound run");
        const processSource = { parentCoreSessionId: source.parent.sessionId, workSourceRef: ref };
        const taskBytes = await deps.store.readProjectFile!(".ans/state/tasks.jsonl", { maxBytes: 2 * 1024 * 1024 });
        if (!taskBytes.ok) return invalid("Actual task ledger bytes are unavailable");
        const changedPaths = new Set(publication.expectedFrom.map(file => file.path));
        if (publication.baseTrunk === null) for (const file of value.snapshot.files) if (file.path.startsWith(`docs/product/${publication.flowId}-intent-v`) || file.path === ".ans/state/versions.jsonl") changedPaths.add(file.path);
        const expectedFiles = [{ path: ".ans/state/tasks.jsonl", sha256: taskBytes.value.sha256 }, { path: `.ans/runs/${task.runId}/manifest.json`, sha256: run.value.sha256 },
          ...value.snapshot.files.filter(file => changedPaths.has(file.path)).map(({ path, sha256 }) => ({ path, sha256 })), { path: sourceFile.value.path, sha256: sourceFile.value.sha256 }, ...execution.value.expectedFiles];

      const git = value.gitPlan, raw = git.candidate;
      const authorizationDigest = directHash({ task: rows.map(row => row.value), runSha256: run.value.sha256, expectedFiles,
        snapshot: value.manifest.snapshotRef, base: publication.baseTrunk, active: value.expectedActive, repoId: git.repo.repoId, configDigest: git.repo.configDigest });
      const paths = [...new Set(raw.input.files.map(file => file.path))].sort();
      const common = { repoId: git.repo.repoId, operationId: value.input.operationId, actorRoleId: publication.actorRoleId, taskId, runId: task.runId!,
        authorizationRevision: authorizationDigest, currentAuthorizationRevision: authorizationDigest, objectFormat: git.repo.objectFormat,
        paths, readPaths: ["."], writePaths: paths, ownedCandidateRef: raw.ref, base: git.base, candidate: raw.commit.candidate,
        allDiff: { complete: true as const, base: git.base, candidate: raw.commit.candidate, entries: raw.diff }, worksite: raw.worksite,
        rawObjectPlan: raw, businessPublication: git.publication, appGeneratedFiles: git.files, manifestSha256: git.manifestSha256, journalDigest: git.journalDigest,
        businessJournal: value.journal, ...(git.baseManifestBytesBase64 ? { businessBaseManifestBytesBase64: git.baseManifestBytesBase64 } : {}) };
      const candidatePolicyInput: Policy = { ...common, template: "commit", ref: raw.ref, argv: raw.commands[0]!, commands: raw.commands };
      const publicationPolicyInput: Policy = { ...common, template: "publish-documents", ref: "refs/ans/trunk", publicationRef: "refs/ans/trunk",
        argv: raw.commands[0]!, commands: [...raw.commands, git.publicationCommand] };
      return { ok: true, value: { taskId, runId: task.runId!, authorizationDigest, processSource, expectedFiles, candidatePolicyInput, publicationPolicyInput } };
    } catch (error) { return invalid(String(error)); }
  }
  return {
    prepareDirectAuthority,
    bindInitialWorkflowSource: (input: { requestId: string; taskId: string; coreSessionId: string; coreTurnId?: string; hostLeaseId: string }) => bindInitialWorkflowSource(deps, input),
    async prepareInitialWorkflowCommit(input: import("../abstract/trunk-service.ts").TrunkStableSnapshotInput) {
      const result = await prepareInitialWorkflowSnapshot(deps, input, true);
      if (!("preparationKind" in result)) return { ok: true as const, value: result };
      const operationInput = result.input, operationId = result.source.operationId, journal: TrunkApplyJournal = { v: 1, schema: TRUNK_APPLY_JOURNAL_SCHEMA, operationId,
        applicationId: `stable:${result.record.requestId}`, journalId: `j-${operationId}`, flowId: result.source.flowId, phase: "prepared",
        message: canonicalJson({ schema: "stable-initial-workflow/v1", source: result.source, sourceFile: result.sourceFile, record: result.record, permit: result.permit, input: operationInput }),
        before: snapshotOfManifest(result.before), target: snapshotOfManifest(result.manifest), beforeSnapshot: result.before.snapshotRef,
        targetSnapshot: result.manifest.snapshotRef, startedAt: operationInput.at, updatedAt: operationInput.at };
      const value: WorkflowPreparation = { ...result, preparationKind: "initial-workflow-commit", input: { ...operationInput, operationId, flowId: result.source.flowId }, journal,
        baseTrunk: result.source.documentCommit, expectedActive: { revision: result.before.activeRevision ?? 0, digest: result.before.activeDigest ?? null }, expectedSnapshot: result.source.documentSnapshot };
      const planned = await deps.store.planInitialWorkflowCommit?.({ manifest: value.manifest, journal, source: result.source, record: result.record, permit: result.permit });
      if (!planned?.ok) return fail<WorkflowPreparation>("trunk-item-invalid", planned && (planned.message ?? planned.reason) || "Initial workflow Git planner unavailable");
      value.gitPlan = planned.value; prepared.set(value, directHash(value));
      return { ok: true as const, value };
    },
    async commitPreparedInitialWorkflow(value: WorkflowPreparation, authority: { hostLeaseId: string; taskId: string; candidateVerdict: { allowed: boolean; inputDigest: string; code?: string }; publicationVerdict: { allowed: boolean; inputDigest: string; code?: string } }): Promise<import("../abstract/trunk-service.ts").TrunkStableSnapshotResult> {
      const blocked = (message: string) => ({ applied: false, pendingReattach: true, errorCode: "initial-workflow-binding-invalid", message });
      const current = await prepareDirectAuthority(value, authority.taskId);
      if (!current.ok || !value.gitPlan) return blocked(current.ok ? "Git plan missing" : current.message ?? current.code);
      if (!authority.candidateVerdict.allowed || authority.candidateVerdict.inputDigest !== directHash(current.value.candidatePolicyInput)
        || !authority.publicationVerdict.allowed || authority.publicationVerdict.inputDigest !== directHash(current.value.publicationPolicyInput)) return blocked("Workflow current source/task/full plan differs from policy verdicts");
      prepared.delete(value);
      let applied: import("../abstract/trunk-service.ts").TrunkStableSnapshotResult | undefined;
      try {
      const store = createGitInitialWorkflowMutationStore(deps.projectRoot, { hostLeaseId: authority.hostLeaseId, manifest: value.manifest, journal: value.journal,
        expectedActive: value.expectedActive, expectedFiles: current.value.expectedFiles, gitPlan: value.gitPlan });
      const journal = await store.writeOperation!(value.journal); if (!journal.ok) return blocked(journal.message ?? journal.code);
      const result = await applyStableSnapshot({ ...deps, store }, value.input); applied = result;
      if (result.applied) {
        const saved = await store.writeOperation!({ ...value.journal, phase: "committed", result: "committed", updatedAt: (deps.now?.() ?? new Date()).toISOString() });
        if (!saved.ok) return { ...result, pendingReattach: true, errorCode: "committed-pending-recovery", message: saved.message ?? saved.code };
      }
      return result;
      } catch (error) { return applied?.applied ? { ...applied, pendingReattach: true, errorCode: "committed-pending-recovery", message: String(error) } : blocked(String(error)); }
    },
    async prepareActivationCommit(activation: PreparedRoleActivation, checks: readonly TrunkRoleDocumentCheck[], boundaryEntries: readonly BoundaryEntry[], actor: string) {
      if (actor !== "nominator") return fail<ActivationPreparation>("trunk-item-invalid", "Only the actual nominator can prepare activation");
      const actual = await prepareRoleActivation(deps, activation.input, actor);
      if (!actual.ok || directHash(actual.value) !== directHash(activation)) return fail<ActivationPreparation>("trunk-item-invalid", "Activation is not the actual current D3/plan/draft basis");
      const result = await activateRoleDocumentsInternal(deps, activation, checks, boundaryEntries, true);
      if (!("preparationKind" in result)) return { ok: true as const, value: result };
      if (deps.store.planActiveCommit) {
        const planned = await deps.store.planActiveCommit({ manifest: result.manifest, journal: result.journal, expectedBase: result.baseTrunk,
          expectedActive: result.expectedActive, targetRoleId: result.input.targetRoleId });
        if (!planned.ok) return fail<ActivationPreparation>("trunk-item-invalid", planned.message ?? planned.reason);
        result.gitPlan = planned.value;
      }
      prepared.set(result, directHash(result));
      return { ok: true as const, value: result };
    },
    async commitPreparedActivation(value: ActivationPreparation, authority: { hostLeaseId: string; taskId: string; candidateVerdict: { allowed: boolean; inputDigest: string; code?: string }; publicationVerdict: { allowed: boolean; inputDigest: string; code?: string } }): Promise<ActivateRoleDocumentsResult> {
      const invalid = (message: string) => directFailure(value.input.operationId, value.expectedActive.digest, "activation-commit-binding-invalid", message);
      const current = await prepareDirectAuthority(value, authority.taskId);
      if (!current.ok || !value.gitPlan) return invalid(current.ok ? "Git plan missing" : current.message ?? current.code);
      if (!authority.candidateVerdict.allowed || authority.candidateVerdict.inputDigest !== directHash(current.value.candidatePolicyInput)
        || !authority.publicationVerdict.allowed || authority.publicationVerdict.inputDigest !== directHash(current.value.publicationPolicyInput)) return invalid("Current D3/task/complete active plan differs from policy verdicts");
      const ledgerFile = current.value.expectedFiles.find(file => file.path === ".ans/state/tasks.jsonl");
      if (!ledgerFile) return invalid("The actual activation task ledger bytes are unavailable");
      prepared.delete(value);
      try {
        const store = createGitActiveMutationStore(deps.projectRoot, { hostLeaseId: authority.hostLeaseId, manifest: value.manifest, journal: value.journal,
          expectedBase: value.baseTrunk, expectedActive: value.expectedActive, expectedFiles: current.value.expectedFiles, gitPlan: value.gitPlan, publicationTask: { taskId: current.value.taskId, runId: current.value.runId, ledgerSha256: ledgerFile.sha256 } });
        return activateRoleDocuments({ ...deps, store, now: () => new Date(value.journal.startedAt) }, value.activation, value.checks, value.boundaryEntries);
      } catch (error) { return invalid(String(error)); }
    },
    async prepareTeamPlanCommit(input: CompleteTeamPlanInput, actor: string) {
      const result = await completeTeamPlanInternal(deps, input, actor, true);
      if (!("preparationKind" in result)) return { ok: true as const, value: result };
      if (deps.store.planDocumentCommit) {
        const planned = await deps.store.planDocumentCommit({ manifest: result.manifest, journal: result.journal, expectedBase: result.baseTrunk });
        if (!planned.ok) return fail<PlanPreparation>("trunk-item-invalid", planned.message ?? planned.reason);
        result.gitPlan = planned.value;
      }
      prepared.set(result, directHash(result));
      return { ok: true as const, value: result };
    },
    async commitPreparedTeamPlan(value: PlanPreparation, authority: { hostLeaseId: string; taskId: string; candidateVerdict: { allowed: boolean; inputDigest: string; code?: string }; publicationVerdict: { allowed: boolean; inputDigest: string; code?: string } }): Promise<CompletedTeamPlanReceipt> {
      const invalid = (message: string) => directFailure(value.input.operationId, value.input.baseDigest ?? null, "plan-commit-binding-invalid", message);
      const current = await prepareDirectAuthority(value, authority.taskId);
      if (!current.ok || !value.gitPlan) return invalid(current.ok ? "Git plan missing" : current.message ?? current.code);
      if (!authority.candidateVerdict.allowed || authority.candidateVerdict.inputDigest !== directHash(current.value.candidatePolicyInput)
        || !authority.publicationVerdict.allowed || authority.publicationVerdict.inputDigest !== directHash(current.value.publicationPolicyInput)) return invalid("Current task/complete plan differs from policy verdicts");
      const ledgerFile = current.value.expectedFiles.find(file => file.path === ".ans/state/tasks.jsonl");
      if (!ledgerFile) return invalid("The actual publication task ledger bytes are unavailable");
      prepared.delete(value);
      try {
        const store = createGitDocumentMutationStore(deps.projectRoot, { hostLeaseId: authority.hostLeaseId, manifest: value.manifest, journal: value.journal,
          publicationTask: { taskId: current.value.taskId, runId: current.value.runId, ledgerSha256: ledgerFile.sha256 },
          expectedBase: value.baseTrunk, expectedActive: value.expectedActive, expectedSnapshot: value.expectedSnapshot, expectedFiles: current.value.expectedFiles, gitPlan: value.gitPlan });
        return completeTeamPlan({ ...deps, store }, value.input, value.actorRoleId, value.journal.startedAt);
      } catch (error) { return invalid(String(error)); }
    },
    async prepareDirectCommit(input: TrunkDirectApplyInput) {
      const result = await prepareDirectCommit(deps, input);
      if (result.ok) {
        const protection = await readGitProtectionFacts(deps.projectRoot);
        if (protection.identity && deps.store.planDocumentCommit) {
          const planned = await deps.store.planDocumentCommit({ manifest: result.value.manifest, journal: result.value.journal, expectedBase: input.baseTrunk });
          if (!planned.ok) return fail<DirectPreparation>("trunk-item-invalid", planned.message ?? planned.reason);
          result.value.gitPlan = planned.value;
        }
        prepared.set(result.value, directHash(result.value));
      }
      return result;
    },
    async commitPreparedDirect(value: DirectPreparation, authority: { hostLeaseId: string; taskId: string; candidateVerdict: { allowed: boolean; inputDigest: string; code?: string }; publicationVerdict: { allowed: boolean; inputDigest: string; code?: string } }): Promise<DirectActionReceipt> {
      const invalid = (message: string) => directFailure(value.input.operationId, value.input.baseTrunk?.digest ?? null, "direct-commit-binding-invalid", message);
      const current = await prepareDirectAuthority(value, authority.taskId);
      if (!current.ok || !value.gitPlan) return invalid(current.ok ? "Git plan missing" : current.message ?? current.code);
      if (!authority.candidateVerdict.allowed || authority.candidateVerdict.inputDigest !== directHash(current.value.candidatePolicyInput)
        || !authority.publicationVerdict.allowed || authority.publicationVerdict.inputDigest !== directHash(current.value.publicationPolicyInput)) return invalid("Current task/complete Git plan does not match the two content-bound policy verdicts");
      prepared.delete(value);
      try {
        const store = createGitDocumentMutationStore(deps.projectRoot, { hostLeaseId: authority.hostLeaseId, manifest: value.manifest, journal: value.journal,
          expectedBase: value.input.baseTrunk, expectedActive: value.expectedActive, expectedSnapshot: value.expectedSnapshot, expectedFiles: current.value.expectedFiles, gitPlan: value.gitPlan });
        return executeDirect({ ...deps, store }, value.input);
      } catch (error) { return invalid(String(error)); }
    },
  };
}

export async function prepareDirectSubmission(deps: TrunkServiceDeps, input: SubmitVersionChangeInput, actor: string): Promise<TrunkServiceResult<PreparedDirectSubmission>> {
  const invalid = (message: string) => fail<PreparedDirectSubmission>("trunk-item-invalid", message);
  const { store } = deps;
  if (!input.operationId || input.baseTrunk === undefined || input.initiatorRoleId !== actor
    || actor !== (input.kind === "version-upgrade" ? "product" : input.kind === "detail-amendment" ? "rapporteur" : undefined))
    return invalid("Direct submission requires a trusted action owner, operation id and explicit expected base");
  if (!store.readProjectFile || !store.captureSnapshot || !store.readSnapshot) return invalid("Complete storage is unavailable");
  try {
    const read = await readDirectPublicationManifest(store, input.flowId, input.baseTrunk);
    if (!read.ok && read.reason !== "missing") return invalid(`effective-manifest-${read.reason}`);
    const current = read.ok ? read.value : undefined;
    // The first run remains absent; legacy run data is never materialised from live role files.
    const target: TrunkApplySnapshot = current ? snapshotOfManifest(current) : { trunkVersion: 1, runId: null, documents: {}, execution: { teamPlan: null, flow: null }, roleCards: {}, boundaries: {} };
    const oldSlots = targetSlots(target), expectedFrom: Array<{ path: string; sha256: string | null }> = [], seen = new Set<string>();
    for (const draft of input.targets) {
      if (seen.has(draft.path) || draft.expectedFromSha256 === undefined || (draft.action !== "add" && draft.action !== "modify")) return invalid("Duplicate target or missing expected original hash");
      seen.add(draft.path);
      const bytes = await store.readProjectFile(draft.path);
      if (!bytes.ok) return invalid(`Target is unreadable: ${draft.path}`);
      const doc = /-(proposal|modules|topology|architecture|assets|roster)-v[1-9]\d*\.md$/i.exec(draft.path)?.[1]?.toLowerCase() as TrunkDocKind | undefined;
      let slot: string;
      if (doc !== undefined && (doc === "roster" ? draft.kind === "roster" : draft.kind === "contract")) {
        slot = `doc:${doc}`; target.documents[doc] = { path: draft.path, sha256: bytes.value.sha256 };
      } else if (draft.kind === "execution" && /^docs\/scheduling\//.test(draft.path)) {
        slot = "execution:teamPlan"; target.execution.teamPlan = { path: draft.path, sha256: bytes.value.sha256 };
      } else if (draft.kind === "execution" && /^docs\/flows\//.test(draft.path)) {
        slot = "execution:flow";
        let flow: unknown; try { flow = parseYaml(Buffer.from(bytes.value.bytesBase64, "base64").toString("utf8")); } catch { flow = undefined; }
        if (!evidenceObject(flow) || !Number.isSafeInteger(flow.version) || (flow.version as number) < 1) return invalid("Flow document has no actual valid version");
        target.execution.flow = { path: draft.path, sha256: bytes.value.sha256, version: flow.version as number };
      } else return invalid("Target kind/path differs from the author responsibility");
      const old = oldSlots[slot];
      if (draft.expectedFromSha256 !== (old?.sha256 ?? null) || (draft.from !== undefined && draft.from !== old?.path)) return invalid("Expected original reference differs from the actual effective baseline");
      if (!old || old.path !== draft.path || old.sha256 !== bytes.value.sha256) expectedFrom.push({ path: draft.path, sha256: draft.expectedFromSha256 });
    }
    const extra: Array<{ path: string; sha256: string }> = [];
    if (input.amendmentDocPath !== undefined) {
      const bytes = await store.readProjectFile(input.amendmentDocPath); if (!bytes.ok) return invalid("Amendment is unreadable");
      extra.push({ path: input.amendmentDocPath, sha256: bytes.value.sha256 });
    }
    if (!current) {
      await deps.freezeRegistry.refreshSnapshot();
      const intent = (await deps.freezeRegistry.listFreezes()).filter(entry => entry.freeze.reason === "intent-confirmed"
        && (entry.freeze.origin === "customer" || entry.freeze.origin === "chief-delegated" || entry.freeze.origin === "judge-delegated") && entry.path.startsWith(`docs/product/${input.flowId}-intent-v`))
        .sort((a, b) => b.version - a.version)[0];
      if (!intent) return invalid("Initial publication lacks actual confirmed-intent evidence");
      extra.push({ path: intent.path, sha256: intent.sha256 });
      const baseline = await store.readProjectFile(".ans/state/versions.jsonl"); if (!baseline.ok) return invalid("Intent baseline bytes are unavailable");
      extra.push({ path: ".ans/state/versions.jsonl", sha256: baseline.value.sha256 });
    }
    const captured = await store.captureSnapshot({ snapshotId: `s-${directHash([input.flowId, input.operationId])}`, createdAt: (deps.now ?? (() => new Date()))().toISOString(),
      files: [...directRefs(target), ...extra], ...(current?.snapshotRef ? { baseSnapshotRef: current.snapshotRef } : {}) });
    if (!captured.ok) return invalid(captured.message ?? captured.reason);
    const snapshot = await store.readSnapshot(captured.value); if (!snapshot.ok) return invalid(snapshot.message ?? snapshot.reason);
    let amendmentItems;
    if (input.kind === "detail-amendment") {
      if (!input.amendmentDocPath) return invalid("Detail submission requires an amendment document");
      const parsed = parseAmendmentSnapshot(snapshot.value, input.amendmentDocPath, input.flowId);
      if (!parsed.ok) return invalid(parsed.message ?? parsed.code); amendmentItems = parsed.value.items;
    }
    const applicationId = `vc-${BigInt(`0x${directHash([input.flowId, input.operationId]).slice(0, 12)}`).toString()}`;
    return { ok: true, value: { applicationId, snapshot: snapshot.value,
      currentTrunk: current ? { trunkVersion: current.trunkVersion, runId: current.runId, digest: current.digest } : null,
      applyInput: { operationId: input.operationId, applicationId, actorRoleId: actor, kind: input.kind, flowId: input.flowId,
        baseTrunk: input.baseTrunk, target, expectedFrom, preparedSnapshotRef: captured.value,
        ...(input.amendmentId ? { amendmentId: input.amendmentId } : {}), ...(input.amendmentDocPath ? { amendmentDocPath: input.amendmentDocPath } : {}), at: (deps.now ?? (() => new Date()))().toISOString() },
      ...(amendmentItems ? { amendmentItems } : {}) } };
  } catch (error) { return invalid(String(error)); }
}

export async function readDirectOperation(deps: TrunkServiceDeps, operationId: string): Promise<TrunkServiceResult<{ journal: TrunkApplyJournal; manifest: TrunkManifest; snapshot: CompleteSnapshot }>> {
  if (!deps.store.readOperation || !deps.store.readManifestAt || !deps.store.readSnapshot) return fail("trunk-unavailable", "Complete operation storage unavailable");
  const journal = await deps.store.readOperation(operationId);
  if (!journal.ok || journal.value.actionSource?.kind !== "role-direct" || !journal.value.targetSnapshot) return fail("trunk-unavailable", "Complete operation evidence missing");
  const manifest = deps.store.readOperationCommit ? await deps.store.readOperationCommit(journal.value)
    : await deps.store.readManifestAt({ version: journal.value.target.trunkVersion, digest: journal.value.actionSource.targetDigest },
      journal.value.actionSource.baseDigest === journal.value.actionSource.targetDigest ? undefined : journal.value.targetSnapshot);
  const snapshot = await deps.store.readSnapshot(journal.value.targetSnapshot);
  if (!manifest.ok || !snapshot.ok) return fail("trunk-unavailable", "Operation has no matching committed immutable baseline");
  return { ok: true, value: { journal: journal.value, manifest: manifest.value, snapshot: snapshot.value } };
}

/** Reopen the actual run's immutable closure. Missing historical bytes never use live documents. */
async function deliveredControllerSource(deps: TrunkServiceDeps, bases: RunGitBases): Promise<TrunkServiceResult<{ taskId: string; digest: string } | null>> {
  const invalid = (message: string) => fail<{ taskId: string; digest: string } | null>("trunk-verify-failed", message);
  if (bases.codeBasisSource.kind === "document-ref") return { ok: true, value: null };
  const source = bases.codeBasisSource, journal = await createGitRefStore(deps.projectRoot).readJournal(source.operationId);
  if (!journal || journal.phase !== "published" || !journal.deliverySource) return invalid("Original delivered controller source is unavailable");
  const delivery = journal.deliverySource, ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return invalid(ledger.reason);
  const rows = ledger.records.filter(row => row.value.taskId === source.controllerTaskId), created = rows.filter(row => row.value.kind === "task.created");
  const creation = created.length === 1 ? validateTaskStateEvent(created[0]!.value) : undefined;
  const reportRow = rows.filter(row => row.value.kind === "task.reported").at(-1), closedRow = rows.filter(row => row.value.kind === "task.closed").at(-1);
  const report = reportRow ? validateTaskStateEvent(reportRow.value) : undefined, closed = closedRow ? validateTaskStateEvent(closedRow.value) : undefined;
  const qualityRows = ledger.records.filter(row => row.value.taskId === delivery.qualityTaskId), qualityCreates = qualityRows.filter(row => row.value.kind === "task.created");
  const qualityCreation = qualityCreates.length === 1 ? validateTaskStateEvent(qualityCreates[0]!.value) : undefined;
  const qualityClosures = qualityRows.filter(row => row.value.kind === "task.closed"), qualityRow = qualityClosures.length === 1 ? qualityClosures[0] : undefined;
  const quality = qualityRow ? validateTaskStateEvent(qualityRow.value) : undefined;
  const qualityReportRow = qualityRows.filter(row => row.value.kind === "task.reported").at(-1), qualityReport = qualityReportRow ? validateTaskStateEvent(qualityReportRow.value) : undefined;
  const reviewTarget = { kind: "git-candidate-review" as const, candidateOperationId: delivery.candidateOperationId, candidate: journal.newOid, criteria: [...delivery.criteria] };
  if (!creation?.ok || creation.event.kind !== "task.created" || creation.event.from !== "chief" || creation.event.to !== "convener" || creation.event.runId !== source.sourceRunId || creation.event.flowId !== source.sourceFlowId
    || !report?.ok || report.event.kind !== "task.reported" || report.event.from !== "convener" || report.event.status !== "done"
    || !closed?.ok || closed.event.kind !== "task.closed" || closed.event.by !== "chief" || closed.event.outcome !== "accepted" || closed.event.actionSource?.kind !== "role-direct"
    || closed.event.actionSource.action !== "close-created-task" || closed.event.actionSource.runId !== source.sourceRunId
    || delivery.taskId !== source.controllerTaskId || delivery.runId !== source.sourceRunId || delivery.flowId !== source.sourceFlowId || canonicalJson(journal.newOid) !== canonicalJson(bases.codeBasis.oid)
    || !isTaskReviewBasisRef(reviewTarget) || !qualityCreation?.ok || qualityCreation.event.kind !== "task.created"
    || !isControllerReviewTask(qualityCreation.event, source.controllerTaskId, source.sourceFlowId, source.sourceRunId, reviewTarget)
    || !qualityReport?.ok || qualityReport.event.kind !== "task.reported" || qualityReport.event.from !== "verifier" || qualityReport.event.status !== "done"
    || !qualityReportRow || directHashBytes(qualityReportRow.raw) !== delivery.qualityReportSha256
    || !quality?.ok || quality.event.kind !== "task.closed" || quality.event.by !== qualityCreation.event.from || quality.event.outcome !== "accepted"
    || quality.event.operationId !== delivery.creatorCloseOperationId || quality.event.eventId !== delivery.creatorCloseEventId
    || quality.event.actionSource?.kind !== "role-direct" || quality.event.actionSource.action !== "close-created-task" || quality.event.actionSource.actorRoleId !== qualityCreation.event.from
    || quality.event.actionSource.operationId !== quality.event.operationId || quality.event.actionSource.runId !== source.sourceRunId
    || quality.event.actionSource.baseDigest !== delivery.qualityDigest)
    return invalid("A new run cannot inherit an unaccepted or unrelated delivered controller result");
  const qualityTask = qualityCreation.event;
  if (qualityTask.hubRouting === "chief-hub-v1") {
    const ref = qualityTask.workSourceRef;
    if (qualityTask.from !== "chief" || quality.event.by !== "chief" || !isTaskWorkSourceRef(ref)) return invalid("Delivered Hub quality has no original Chief source");
    const stored = await deps.store.readInitializationSource?.(ref.sourceId), root = await readGitProtectionFacts(deps.projectRoot);
    if (!stored?.ok || stored.value.path !== ref.path || stored.value.sha256 !== ref.sha256.toLowerCase()
      || !delivery.liveFiles.some(file => file.path === stored.value.path && file.sha256 === stored.value.sha256)) return invalid("Delivered Hub quality source bytes differ from the actual publication");
    let value: unknown; try { value = JSON.parse(Buffer.from(stored.value.bytesBase64, "base64").toString("utf8")); } catch { return invalid("Delivered Hub quality source JSON is invalid"); }
    if (!evidenceObject(value) || value.schema !== "repository-work-source/v1" || value.purpose !== "builtin-preparation" || value.hubRouting !== qualityTask.hubRouting
      || value.sourceId !== ref.sourceId || value.projectRoot !== root.projectRoot || value.flowId !== source.sourceFlowId || value.targetRoleId !== "verifier" || value.planningRunId !== source.sourceRunId
      || value.kind !== (ref.kind === "chief-creator-report" ? "creator-report" : "customer-turn") || !evidenceObject(value.parent) || value.parent.roleId !== "chief"
      || typeof value.parent.sessionId !== "string" || !value.parent.sessionId || value.parent.inputAccepted !== true || value.parent.settled !== false
      || canonicalJson(value.reviewControllerRef) !== canonicalJson(qualityTask.reviewControllerRef) || canonicalJson(value.reviewBasisRef) !== canonicalJson(reviewTarget))
      return invalid("Delivered Hub quality source does not bind this original controller/run/CID/criteria");
    if (value.kind === "creator-report") {
      const original = await creatorReportSource(deps, source.sourceFlowId, value.creatorReports, false, true);
      if (!original.ok) return invalid(original.message ?? original.code);
    }
  } else if (qualityTask.from !== "convener" || quality.event.by !== "convener" || qualityTask.reviewControllerRef !== undefined || qualityTask.parentTaskRef?.taskId !== source.controllerTaskId)
    return invalid("Historical delivered quality differs from its original Convener creator/parent");
  const integrated = await readGitCandidateEvidence(deps.projectRoot, delivery.candidateOperationId, journal.newOid);
  const integration = integrated.ok ? integrated.value.journal.candidateSource : undefined;
  if (!integrated.ok || integrated.value.journalFile.sha256 !== delivery.candidateJournalSha256 || (integration?.kind !== "run-integration" && integration?.kind !== "run-revert")
    || integration.taskId !== source.controllerTaskId || integration.runId !== source.sourceRunId || integration.flowId !== source.sourceFlowId || integration.pinDigest !== delivery.pinDigest)
    return invalid("Delivered quality refers to another actual integration source");
  if (integration.kind === "run-revert") { const error = await verifyRevertCandidateMaterial(deps, integrated.value); if (error) return invalid(error); }
  const originalRun = await deps.store.readRunRecord?.(source.sourceRunId), raw = originalRun?.ok ? originalRun.value.value : undefined;
  const proposal = raw && evidenceObject(raw.documents) ? raw.documents.proposal : undefined;
  const documents = raw && isGitBasis(raw.documentGitBasis) ? raw.documentGitBasis : integration.base.ref === "refs/ans/trunk" ? integration.base : undefined;
  if (!raw || raw.schema !== "ans-run/v1" || !["pinned", "cancelled"].includes(String(raw.state)) || raw.runId !== source.sourceRunId || raw.flowId !== source.sourceFlowId || raw.pinDigest !== delivery.pinDigest || !isGitBasis(raw.codeBasis)
    || canonicalJson(raw.codeBasis) !== canonicalJson(integration.base) || !evidenceObject(proposal) || typeof proposal.path !== "string" || typeof proposal.sha256 !== "string" || !documents?.oid
    || canonicalJson(reviewTarget.criteria) !== canonicalJson([{ oid: documents.oid, path: proposal.path, sha256: proposal.sha256 }])) return invalid("Delivered criteria differ from the original frozen document/code sources");
  const criterion = await createGitCandidateStore(deps.projectRoot).readBlob(documents.oid, proposal.path);
  if (criterion.sha256 !== proposal.sha256) return invalid("Delivered criterion bytes differ from the original frozen Git object");
  const expected = directHash({ kind: "delivered-controller-completion", target: { kind: "git-candidate-review", candidateOperationId: delivery.candidateOperationId,
    candidate: journal.newOid, criteria: delivery.criteria }, qualityDigest: delivery.qualityDigest, qualityClose: qualityRow!.value,
    deliveryOperationId: source.operationId, deliveryJournalSha256: source.journalSha256 });
  return closed.event.actionSource.baseDigest !== expected ? invalid("The original creator closure does not bind this exact published delivery")
    : { ok: true, value: { taskId: source.controllerTaskId, digest: directHashBytes(JSON.stringify(rows.map(row => row.value))) } };
}
/** Read-only business provenance of an expected Git basis. It does not create a draft, repin or grant execution. */
export async function inspectExecutionCodeSource(deps: TrunkServiceDeps, bases: RunGitBases): ReturnType<import("../abstract/trunk-service.ts").DirectTrunkService["inspectExecutionCodeSource"]> {
  if (!isRunGitBases(bases) || !deps.store.verifyExecutionBases) return fail("trunk-verify-failed", "Actual independent Git execution bases are required");
  try {
    const actual = await deps.store.verifyExecutionBases(bases); if (!actual.ok) return fail("trunk-verify-failed", actual.message ?? actual.reason);
    const controller = await deliveredControllerSource(deps, actual.value); if (!controller.ok) return controller;
    return { ok: true, value: { bases: structuredClone(actual.value), controllerTask: controller.value } };
  } catch (error) { return fail("trunk-verify-failed", String(error)); }
}
export async function readRunEvidence(deps: TrunkServiceDeps, runId: string): Promise<TrunkServiceResult<ExecutionRunBasis>> {
  const { store } = deps;
  const unavailable = (message: string) => fail<ExecutionRunBasis>("trunk-verify-failed", message);
  if (!store.readRunRecord || !store.readSnapshot || !store.readFrozenRoleEvidence) return unavailable("Run evidence storage unavailable");
  try {
    const record = await store.readRunRecord(runId);
    if (!record.ok) return unavailable(`run-${record.reason}`);
    const run = record.value.value;
    if (run.schema !== "ans-run/v1" || run.runId !== runId || run.state !== "pinned" || typeof run.flowId !== "string"
      || typeof run.pinDigest !== "string" || !/^[a-f0-9]{64}$/i.test(run.pinDigest) || !isSnapshotRef(run.snapshotRef)
      || !isSnapshotArtifactRef(run.workflowRef) || run.workflowRef.snapshotId !== run.snapshotRef.snapshotId
      || !Array.isArray(run.roles) || !run.roles.length || run.roles.some(role => typeof role !== "string")
      || new Set(run.roles).size !== run.roles.length || !evidenceObject(run.frozenRoles)) return unavailable("Run lacks a complete executable immutable pin");
    if (run.documentGitBasis !== undefined || run.codeBasisSource !== undefined) {
      if (!isRunGitBases(run) || !store.verifyExecutionBases) return unavailable("Independent frozen Git code/document sources are incomplete");
      const verified = await store.verifyExecutionBases(run); if (!verified.ok) return unavailable(verified.message ?? verified.reason);
      const source = await deliveredControllerSource(deps, run); if (!source.ok) return unavailable(source.message ?? source.code);
      const blob = await createGitCandidateStore(deps.projectRoot).readBlob(run.documentGitBasis.oid!, ".ans/trunk/manifest.json");
      const document: unknown = JSON.parse(Buffer.from(blob.bytesBase64, "base64").toString("utf8"));
      if (!evidenceObject(document) || !evidenceObject(document.artifacts) || !evidenceObject(run.documentCommit)
        || document.trunkVersion !== run.documentCommit.version || document.digest !== run.documentCommit.digest
        || canonicalJson(document.artifacts.documents) !== canonicalJson(run.documents) || canonicalJson(document.artifacts.execution) !== canonicalJson(run.execution))
        return unavailable("Frozen document Git source differs from the run's original actual document snapshot");
    }
    const workflow = run.workflowRef;
    const snapshot = await store.readSnapshot(run.snapshotRef);
    if (!snapshot.ok || !snapshot.value.files.some(file => file.path === workflow.path && file.sha256 === workflow.sha256)) return unavailable("Pinned workflow bytes are missing");
    const frozenRoles: ExecutionRunBasis["frozenRoles"] = {};
    if (Object.keys(run.frozenRoles).length !== run.roles.length) return unavailable("Run roster and frozen role set differ");
    for (const roleId of run.roles as string[]) {
      const evidence = run.frozenRoles[roleId];
      if (!isFrozenRoleEvidence(evidence) || evidence.roleId !== roleId || evidence.runId !== runId || evidence.pinDigest !== run.pinDigest
        || evidence.snapshotRef.snapshotId !== run.snapshotRef.snapshotId || evidence.snapshotRef.digest !== run.snapshotRef.digest)
        return unavailable(`Run role has a different pin: ${roleId}`);
      const read = await store.readFrozenRoleEvidence(evidence); if (!read.ok) return unavailable(`run-role-${read.reason}:${roleId}`);
      frozenRoles[roleId] = evidence;
    }
    return { ok: true, value: { runId, flowId: run.flowId, pinDigest: run.pinDigest, recordSha256: record.value.sha256, snapshot: snapshot.value, frozenRoles, run } };
  } catch (error) { return unavailable(String(error)); }
}

/** A run decision never changes document publication or replaces the existing pin. */
export async function selectRunChange(deps: TrunkServiceDeps, input: SelectRunChangeInput, actor: string): Promise<SelectRunChangeResult> {
  const rejected = (code: string, message: string) => ({ ok: false as const, status: "rejected" as const, operationId: input.operationId,
    runId: input.runId, baseDigest: input.expectedPinDigest, targetDigest: null, errorCode: code, message });
  if (actor !== "rapporteur" || !input.operationId || !["continue-frozen", "stop-and-restart", "stop"].includes(input.mode)
    || !input.reason?.trim()) return rejected("run-change-invalid", "Only the real rapporteur may explicitly select a valid run mode");
  if (!deps.store.compareAndSwapRunRecord || !deps.store.readManifestAt) return rejected("run-store-unavailable", "Run CAS storage is unavailable");
  const basis = await readRunEvidence(deps, input.runId);
  if (!basis.ok) return rejected("run-evidence-unavailable", basis.message ?? basis.code);
  const value = basis.value, requestDigest = directHash(input);
  const changes = value.run.directRunChanges;
  if (changes !== undefined && (!Array.isArray(changes) || changes.some(change => !evidenceObject(change) || !isDirectActionReceipt(change.receipt))))
    return rejected("run-change-history-corrupt", "Existing run change evidence is corrupt");
  const history = (changes ?? []) as Array<{ requestDigest: string; receipt: DirectActionReceipt }>;
  const replay = history.find(change => change.receipt.operationId === input.operationId);
  if (replay) return replay.requestDigest === requestDigest ? { ...replay.receipt,
    journalId: replay.receipt.journalId ?? `.ans/runs/${input.runId}/manifest.json#directRunChanges/${input.operationId}`,
    runId: input.runId } : rejected("run-operation-conflict", "Operation id is bound to another run decision");
  if (input.expectedPinDigest !== value.pinDigest) return rejected("run-pin-conflict", "Expected pin differs from the actual immutable run");
  const target = await deps.store.readManifestAt(input.targetTrunk);
  if (!target.ok || target.value.flowId !== value.flowId || !target.value.snapshotRef) return rejected("run-target-unavailable", "Target trunk is not a real complete baseline for this flow");
  if (input.mode !== "continue-frozen") return { ...rejected("run-stop-unverified", "The actual run must be stopped through its lifecycle owner before stop/restart can commit"), status: "blocked" };
  const at = (deps.now ?? (() => new Date()))().toISOString(), targetDigest = directHash({ runId: input.runId, pinDigest: value.pinDigest,
    mode: input.mode, targetTrunk: input.targetTrunk, requestDigest });
  const applicationId = `run-change-${directHash([input.runId, input.operationId])}`;
  const source: DirectActionSource = { kind: "role-direct", actorRoleId: actor, action: "select-run-change", operationId: input.operationId,
    applicationId, journalId: `.ans/runs/${input.runId}/manifest.json#directRunChanges/${input.operationId}`, runId: input.runId, baseDigest: value.pinDigest, targetDigest, at };
  const receipt: SelectRunChangeResult = { ok: true, status: "applied", operationId: input.operationId, applicationId,
    journalId: source.journalId, runId: input.runId, baseDigest: value.pinDigest, targetDigest, source };
  const written = await deps.store.compareAndSwapRunRecord(input.runId, value.recordSha256, { ...value.run, updatedAt: at,
    directRunChanges: [...history, { requestDigest, mode: input.mode, targetTrunk: input.targetTrunk, reason: input.reason, receipt }] });
  if (!written.ok) {
    // A write may have committed before its acknowledgement was lost. Verify this operation rather than guessing from phase.
    const reread = await deps.store.readRunRecord!(input.runId);
    const rows = reread.ok ? reread.value.value.directRunChanges : undefined;
    if (!Array.isArray(rows) || !rows.some(row => evidenceObject(row) && row.requestDigest === requestDigest
      && isDirectActionReceipt(row.receipt) && row.receipt.operationId === input.operationId)) return rejected("run-cas-conflict", written.message ?? written.code);
  }
  return receipt;
}

/** Host-only two-phase run lifecycle; facts never replace the actual task/source or private preparation identity. */
export function createRunChangePort(deps: TrunkServiceDeps) {
  const prepared = new WeakMap<import("../abstract/trunk-service.ts").PreparedRunChange, string>();
  return {
    async prepareRunChange(input: { request: SelectRunChangeInput; actorRoleId: "rapporteur"; taskId: string; replacementRunId?: string }): Promise<TrunkServiceResult<import("../abstract/trunk-service.ts").PreparedRunChange>> {
      const invalid = (message: string) => fail<import("../abstract/trunk-service.ts").PreparedRunChange>("trunk-item-invalid", message);
      try {
        const request = input.request;
        if (input.actorRoleId !== "rapporteur" || !input.taskId || !request.operationId?.trim() || !request.reason?.trim()
          || !["stop", "stop-and-restart"].includes(request.mode)) return invalid("An actual assigned rapporteur stop/restart request is required");
        const old = await readRunEvidence(deps, request.runId); if (!old.ok || old.value.pinDigest !== request.expectedPinDigest) return invalid(old.ok ? "Old pin changed" : old.message ?? old.code);
        const ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return invalid(ledger.reason);
        const rows = ledger.records.filter(row => row.value.taskId === input.taskId), creates = rows.filter(row => row.value.kind === "task.created");
        const created = creates.length === 1 ? validateTaskStateEvent(creates[0]!.value) : undefined;
        if (!created?.ok || created.event.kind !== "task.created" || created.event.to !== "rapporteur" || created.event.flowId !== old.value.flowId
          || rows.some(row => row.value.kind === "task.closed")) return invalid("The requester is not the actual open same-flow rapporteur assignment");
        let requesterSourceFile: { path: string; sha256: string } | undefined;
        const processSource = created.event.workSourceRef && created.event.runId ? await readTaskProcessSource(deps, {
          taskId: input.taskId, actorRoleId: "rapporteur", flowId: old.value.flowId, runId: created.event.runId,
        }) : undefined;
        if (processSource && !processSource.ok) return invalid(processSource.message ?? processSource.code);
        if (created.event.runId !== request.runId) {
          if (created.event.from !== "chief" || created.event.hubRouting !== "chief-hub-v1" || !created.event.workSourceRef) return invalid("A different requester run requires its actual Chief-issued Hub source");
          const assigned = await inspectAssignedTask(deps, { taskId: input.taskId, actorRoleId: "rapporteur" });
          if (!assigned.ok || assigned.value.flowId !== old.value.flowId || assigned.value.runId !== created.event.runId) return invalid(assigned.ok ? "Requester source/run differs" : assigned.message ?? assigned.code);
          requesterSourceFile = { path: created.event.workSourceRef.path, sha256: created.event.workSourceRef.sha256 };
        }
        const target = await deps.store.readManifestAt?.(request.targetTrunk);
        if (!target?.ok || target.value.flowId !== old.value.flowId || !target.value.snapshotRef) return invalid("Requested target is not an actual same-flow complete baseline");
        if (requesterSourceFile) {
          const snapshot = await deps.store.readSnapshot?.(target.value.snapshotRef);
          if (!snapshot?.ok) return invalid("The exact selected target document source is unavailable");
          const intent = await documentPreparationIntent(deps, old.value.flowId, undefined, { manifest: target.value, snapshot: snapshot.value });
          if (!intent.ok) return invalid(intent.message ?? intent.code);
        }
        const requestDigest = directHash({ request, requesterCreation: created.event, requesterSource: requesterSourceFile ?? null,
          processSource: processSource?.ok ? processSource.value.workSourceRef : null });
        const runChangeSource: import("../../../provider/trunk/public/trunk-store.ts").RunChangeSource = { oldRunId: request.runId, oldSha256: old.value.recordSha256,
          requesterTaskId: input.taskId, requesterDigest: directHashBytes(JSON.stringify(created.event)), requestDigest };
        let replacement: import("../abstract/trunk-service.ts").PreparedExecutionRun | undefined;
        if (request.mode === "stop-and-restart") {
          if (!deps.store.compareAndSwapRunRecord || !deps.store.readRunRecord || !target.value.activeRevision || !target.value.activeDigest || !target.value.artifacts.workflow)
            return invalid("Restart target lacks actual Active/workflow material or draft storage");
          const replacementRunId = `run-restart-${directHash([request.runId, request.operationId, input.taskId]).slice(0, 48)}`;
          if (input.replacementRunId !== undefined && input.replacementRunId !== replacementRunId) return invalid("Caller replacement differs from the actual operation/source-derived draft");
          const prior = await deps.store.readRunRecord(replacementRunId);
          if (prior.ok) {
            if (prior.value.value.state !== "draft" || prior.value.value.flowId !== old.value.flowId || prior.value.value.runChangeOperationId !== request.operationId
              || canonicalJson(prior.value.value.runChangeSource) !== canonicalJson(runChangeSource)) return invalid("This restart operation already belongs to another draft/source/request");
          } else {
            if (prior.reason !== "missing") return invalid(prior.message ?? prior.reason);
            const at = (deps.now ?? (() => new Date()))().toISOString();
            const draft = { schema: "ans-run/v1", schemas: { run: "ans-run/v1" }, runId: replacementRunId, flowId: old.value.flowId, state: "draft",
              createdAt: at, updatedAt: at, documents: {}, execution: { teamPlan: null, flow: null }, runChangeOperationId: request.operationId, runChangeSource };
            const saved = await deps.store.compareAndSwapRunRecord(replacementRunId, null, draft, { trunk: request.targetTrunk,
              active: { revision: target.value.activeRevision, digest: target.value.activeDigest }, snapshot: target.value.snapshotRef, runChangeSource });
            if (!saved.ok) return invalid(saved.message ?? saved.code);
          }
          const next = await prepareExecutionRun(deps, { runId: replacementRunId, flowId: old.value.flowId, operationId: request.operationId });
          if (!next.ok || next.value.alreadyPinned || canonicalJson(next.value.expectedTrunk) !== canonicalJson(request.targetTrunk)) return invalid(next.ok ? "Replacement is not the exact requested executable target" : next.message ?? next.code);
          replacement = next.value;
        } else if (input.replacementRunId !== undefined) return invalid("Plain stop cannot create a replacement run");
        const taskIds: string[] = [];
        for (const row of ledger.records) {
          const event = validateTaskStateEvent(row.value); if (!event.ok) return invalid(event.message);
          if (event.event.kind === "task.created" && event.event.runId === request.runId && event.event.flowId === old.value.flowId) taskIds.push(event.event.taskId);
        }
        const value: import("../abstract/trunk-service.ts").PreparedRunChange = { request: structuredClone(request), requesterTaskId: input.taskId,
          preparedAt: (deps.now ?? (() => new Date()))().toISOString(),
          requesterCreationDigest: directHash(created.event), runChangeSource, ...(requesterSourceFile ? { requesterSourceFile } : {}),
          ...(processSource?.ok ? { processSource: processSource.value } : {}),
          ledgerDigest: directHashBytes(JSON.stringify(ledger.records.map(row => row.value))), requestDigest,
          old: old.value, taskIds, ...(replacement ? { replacement } : {}) };
        const release = await acquireVersionLock(deps.projectRoot);
        try {
          const freshLedger = await readOperationEvents(deps.projectRoot), freshOld = await deps.store.readRunRecord?.(request.runId);
          if (!freshLedger.ok || directHashBytes(JSON.stringify(freshLedger.records.map(row => row.value))) !== value.ledgerDigest || !freshOld?.ok
            || freshOld.value.sha256 !== old.value.recordSha256 || freshOld.value.value.state !== "pinned") return invalid("Run/requester basis changed before stop preparation completed");
          if (requesterSourceFile) { const source = await deps.store.readProjectFile?.(requesterSourceFile.path);
            if (!source?.ok || source.value.sha256 !== requesterSourceFile.sha256) return invalid("Requester source bytes changed before stop preparation completed"); }
          if (replacement) {
            const current = await deps.store.readManifest();
            if (!current.ok || current.value.trunkVersion !== replacement.expectedTrunk.version || current.value.digest !== replacement.expectedTrunk.digest
              || current.value.activeRevision !== replacement.expectedActive.revision || current.value.activeDigest !== replacement.expectedActive.digest
              || canonicalJson(current.value.snapshotRef) !== canonicalJson(replacement.expectedDocumentSnapshot)) return invalid("Executable replacement basis changed before stop preparation completed");
          }
          if (!await ownsVersionLock(deps.projectRoot, release.token)) return invalid("Run preparation source fence lost");
          prepared.set(value, directHash(value)); return { ok: true, value };
        } finally { await release(); }
      } catch (error) { return invalid(String(error)); }
    },
    async commitPreparedRunChange(value: import("../abstract/trunk-service.ts").PreparedRunChange, evidence: import("../abstract/trunk-service.ts").RunStopCommitEvidence): Promise<SelectRunChangeResult> {
      const request = value.request, invalid = (code: string, message: string): SelectRunChangeResult => ({ ok: false, status: "blocked", operationId: request.operationId,
        runId: request.runId, baseDigest: request.expectedPinDigest, targetDigest: null, errorCode: code, message });
      if (prepared.get(value) !== directHash(value)) return invalid("run-preparation-invalid", "Only this unchanged private preparation can commit");
      if (!deps.store.commitRunTransition) return invalid("run-transition-store-unavailable", "The actual run transition storage is unavailable");
      if (!evidence.instances.length || evidence.instances.some(fact => !isRuntimeSessionDrained(fact)))
        return invalid("run-stop-unverified", "Actual same-instance Core drain and tracked-process termination facts are required (native coverage may be unknown)");
      if (!evidence.hostStops.length || evidence.hostStops.some(fact => fact.operationId !== request.operationId || fact.runId !== request.runId || fact.requestDigest !== value.requestDigest || fact.state !== "fenced"))
        return invalid("run-host-fence-unverified", "The exact host run/operation producer fence is required");
      // A natural tool return may persist its own report before a deferred host stop. It never closes/replaces the actual source assignment.
      const ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return invalid("run-source-unavailable", ledger.reason);
      const requesterRows = ledger.records.filter(row => row.value.taskId === value.requesterTaskId), requesterCreates = requesterRows.filter(row => row.value.kind === "task.created");
      if (requesterCreates.length !== 1 || directHash(requesterCreates[0]!.value) !== value.requesterCreationDigest || requesterRows.some(row => row.value.kind === "task.closed")
        || canonicalJson(ledger.records.filter(row => row.value.kind === "task.created" && row.value.runId === request.runId && row.value.flowId === value.old.flowId).map(row => row.value.taskId)) !== canonicalJson(value.taskIds))
        return invalid("run-source-changed", "The actual requester was cancelled/closed or the stopped task set changed");
      const assigned = await inspectAssignedTask(deps, { taskId: value.requesterTaskId, actorRoleId: "rapporteur" });
      if (!assigned.ok || assigned.value.flowId !== value.old.flowId) return invalid("run-requester-authority-changed", assigned.ok ? "Requester flow changed" : assigned.message ?? assigned.code);
      if (value.requesterSourceFile) { const actual = await deps.store.readProjectFile?.(value.requesterSourceFile.path);
        if (!actual?.ok || actual.value.sha256 !== value.requesterSourceFile.sha256) return invalid("run-requester-source-changed", "Actual requester work source bytes changed"); }
      if (value.processSource) {
        const current = await readTaskProcessSource(deps, { taskId: value.requesterTaskId, actorRoleId: "rapporteur", flowId: value.old.flowId, runId: assigned.value.runId });
        if (!current.ok || canonicalJson([current.value.taskId, current.value.sourceAssignmentTaskId, current.value.parentCoreSessionId, current.value.workSourceRef])
          !== canonicalJson([value.processSource.taskId, value.processSource.sourceAssignmentTaskId, value.processSource.parentCoreSessionId, value.processSource.workSourceRef]))
          return invalid("run-requester-source-changed", "Actual original requester process source changed before transition commit");
      }
      const at = value.preparedAt, targetDigest = directHash({ requestDigest: value.requestDigest, replacement: value.replacement?.nextRun.pinDigest ?? null });
      const applicationId = `run-change-${directHash([request.runId, request.operationId])}`, journalId = `.ans/runs/${request.runId}/manifest.json#directRunChanges/${request.operationId}`;
      const source: DirectActionSource = { kind: "role-direct", actorRoleId: "rapporteur", action: "select-run-change", operationId: request.operationId, applicationId, journalId,
        runId: request.runId, baseDigest: value.old.pinDigest, targetDigest, at };
      const receipt: SelectRunChangeResult = { ok: true, status: "applied", operationId: request.operationId, applicationId, journalId, source, runId: request.runId,
        ...(value.replacement ? { replacementRunId: value.replacement.runId } : {}), baseDigest: value.old.pinDigest, targetDigest };
      const prior = value.old.run.directRunChanges;
      if (prior !== undefined && (!Array.isArray(prior) || prior.some(row => !evidenceObject(row) || !isDirectActionReceipt(row.receipt)))) return invalid("run-change-history-corrupt", "Existing run history is invalid");
      const next = { ...value.old.run, state: "cancelled", updatedAt: at, directRunChanges: [...(Array.isArray(prior) ? prior : []), {
        requestDigest: directHash(request), mode: request.mode, targetTrunk: request.targetTrunk, reason: request.reason, receipt,
        lifecycle: { instances: evidence.instances, hostStops: evidence.hostStops }, ...(value.replacement ? { replacementRunId: value.replacement.runId } : {}) }] };
      const replacement = value.replacement, gitBases = replacement && isRunGitBases(replacement.nextRun) ? { codeBasis: replacement.nextRun.codeBasis, documentGitBasis: replacement.nextRun.documentGitBasis, codeBasisSource: replacement.nextRun.codeBasisSource } : undefined;
      const written = await deps.store.commitRunTransition({ hostLeaseId: evidence.hostLeaseId, coordinatorRevision: evidence.coordinatorRevision, ...(value.runChangeSource ? { runChangeSource: value.runChangeSource } : {}), ledgerDigest: directHashBytes(JSON.stringify(ledger.records.map(row => row.value))),
        old: { runId: request.runId, sha256: value.old.recordSha256, value: next }, ...(replacement ? { replacement: { runId: replacement.runId, sha256: replacement.expectedRunSha256,
          value: replacement.nextRun, trunk: replacement.expectedTrunk, active: replacement.expectedActive, snapshot: replacement.expectedDocumentSnapshot,
          ...(gitBases ? { gitBases } : {}), ...(replacement.expectedCodeSourceTask ? { sourceTask: replacement.expectedCodeSourceTask } : {}) } } : {}) });
      if (!written.ok) return invalid("run-transition-unverified", written.message ?? written.code);
      prepared.delete(value); return receipt;
    },
  };
}

/** Produce the report reference from a real submitted task report, rather than requiring a creator to invent it. */
/** Intent is a confirmed input, not a seventh published document slot. Follow only the run's frozen Git source. */
async function verifyReviewIntent(deps: TrunkServiceDeps, basis: ExecutionRunBasis, ledger: readonly { value: Record<string, unknown> }[]): Promise<string | undefined> {
  const run = basis.run, documentBasis = isGitBasis(run.documentGitBasis) ? run.documentGitBasis : isGitBasis(run.codeBasis) && run.codeBasis.ref === "refs/ans/trunk" ? run.codeBasis : undefined;
  if (!documentBasis?.oid || !deps.store.readSnapshot || !evidenceObject(run.documents) || !evidenceObject(run.documents.roster) || !evidenceObject(run.documents.proposal)) return "Frozen intent approval source is unavailable";
  const rosterRef = run.documents.roster, proposalRef = run.documents.proposal;
  const rosterFile = basis.snapshot.files.find(file => file.path === rosterRef.path && file.sha256 === rosterRef.sha256);
  const proposalFile = basis.snapshot.files.find(file => file.path === proposalRef.path && file.sha256 === proposalRef.sha256);
  if (!rosterFile || !proposalFile) return "Frozen intent references are missing";
  const roster = parseProjectRoster(Buffer.from(rosterFile.bytesBase64, "base64").toString("utf8"), basis.flowId);
  const proposalText = Buffer.from(proposalFile.bytesBase64, "base64").toString("utf8"), header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(proposalText);
  const proposal: unknown = header ? parseYaml(header[1]!) : undefined;
  if (!roster.ok || !evidenceObject(proposal) || proposal.intent !== roster.roster.intent) return "Frozen proposal and roster do not bind the same confirmed intent";
  const objects = createGitCandidateStore(deps.projectRoot), tree = await objects.listTree(documentBasis.oid);
  const manifests = tree.filter(entry => entry.path === ".ans/trunk/manifest.json" || /^\.ans\/trunk\/history\/manifest-v[1-9]\d*\.json$/.test(entry.path));
  if (!manifests.length || manifests.length > 256) return "Frozen document history is unavailable or exceeds the evidence budget";
  let approved: { path: string; sha256: string; version: number; freeze: DocFreezeRecord } | undefined;
  for (const entry of manifests) {
    const blob = await objects.readBlob(documentBasis.oid, entry.path), manifest: unknown = JSON.parse(Buffer.from(blob.bytesBase64, "base64").toString("utf8"));
    if (!evidenceObject(manifest) || manifest.schema !== TRUNK_MANIFEST_SCHEMA || manifest.flowId !== basis.flowId || !isSnapshotRef(manifest.snapshotRef)) continue;
    const snapshotPath = `.ans/trunk/snapshots/${manifest.snapshotRef.snapshotId}.json`;
    if (!tree.some(file => file.path === snapshotPath)) return "Frozen document history lost its actual complete snapshot";
    const snapshotBlob = await objects.readBlob(documentBasis.oid, snapshotPath), snapshot: unknown = JSON.parse(Buffer.from(snapshotBlob.bytesBase64, "base64").toString("utf8"));
    if (!isCompleteSnapshot(snapshot) || snapshot.snapshotId !== manifest.snapshotRef.snapshotId || snapshot.digest !== manifest.snapshotRef.digest
      || completeSnapshotDigest(snapshot.files) !== snapshot.digest || snapshot.files.some(file => createHash("sha256").update(Buffer.from(file.bytesBase64, "base64")).digest("hex") !== file.sha256)) return "Frozen intent history snapshot bytes differ";
    const baseline = snapshot.files.find(file => file.path === ".ans/state/versions.jsonl"), intent = snapshot.files.find(file => file.path === roster.roster.intent);
    if (!baseline || !intent) continue;
    for (const line of Buffer.from(baseline.bytesBase64, "base64").toString("utf8").split(/\r?\n/).filter(line => line.trim())) {
      const row: unknown = JSON.parse(line);
      if (!evidenceObject(row) || row.flowId !== basis.flowId || row.doc !== "intent" || row.event !== "frozen") continue;
      if (`${row.path}-v${row.version}.md` !== intent.path) continue;
      if (row.v !== 1 || row.sha256 !== intent.sha256 || !Number.isSafeInteger(row.version) || typeof row.version !== "number" || row.version < 1
        || !isValidDocFreezeRecord(row.freeze) || row.freeze.reason !== "intent-confirmed" || !isSnapshotRef(row.freeze.snapshotRef)
        || !row.freeze.source || (row.freeze.origin !== "customer" && row.freeze.origin !== "chief-delegated" && row.freeze.origin !== "judge-delegated")) return "Frozen intent confirmation record is invalid";
      const candidate = { path: intent.path, sha256: intent.sha256, version: row.version, freeze: row.freeze };
      if (approved && canonicalJson(approved) !== canonicalJson(candidate)) return "Frozen intent approval has conflicting historical sources";
      approved = candidate;
    }
  }
  if (!approved?.freeze.snapshotRef || !approved.freeze.source) return "No actual confirmed-intent record in the frozen document Git history";
  const original = await deps.store.readSnapshot(approved.freeze.snapshotRef);
  if (!original.ok || !original.value.files.some(file => file.path === approved.path && file.sha256 === approved.sha256)) return "Original approved intent snapshot bytes are unavailable";
  const source = approved.freeze.source, requestId = source.kind === "customer-decision" || source.kind === "chief-delegated" || source.kind === "judge-delegated" ? source.requestId : undefined;
  const created = ledger.filter(row => row.value.kind === "request.created" && row.value.requestId === requestId), resolved = ledger.filter(row => row.value.kind === "request.resolved" && row.value.requestId === requestId);
  if (created.length !== 1 || resolved.length !== 1) return "Original intent confirmation is missing or ambiguous";
  const request = validateTaskStateEvent(created[0]!.value), decision = validateTaskStateEvent(resolved[0]!.value);
  const marker = `[ans-intent-evidence snapshot=${approved.freeze.snapshotRef.snapshotId} path=${approved.path} sha256=${approved.sha256} version=${approved.version}]`;
  if (!request.ok || request.event.kind !== "request.created" || request.event.cardKind !== "intent-confirm" || request.event.flowId !== basis.flowId || request.event.sourceRoleId !== "chief"
    || !request.event.context?.includes(marker) || !decision.ok || decision.event.kind !== "request.resolved" || decision.event.cardKind !== "intent-confirm"
    || !decision.event.selectedOptionIds?.includes("confirm") || decision.event.selectedOptionIds.includes("revise") || decision.event.at !== approved.freeze.frozenAt) return "Original intent decision does not confirm these exact frozen bytes";
  if (source.kind === "customer-decision") {
    if (decision.event.by !== "customer" || decision.event.decisionId !== source.decisionId || source.decisionId !== approved.freeze.decisionId
      || source.at !== decision.event.at || decision.event.judge || decision.event.directiveId) return "Original customer intent confirmation source differs";
  } else if (source.kind === "chief-delegated") {
    if (decision.event.by !== "chief-delegated" || decision.event.decisionId !== undefined
      || canonicalJson(decision.event.actionSource) !== canonicalJson(source)) return "Original delegated intent confirmation source differs";
  } else if (source.kind === "judge-delegated") {
    // 2026-11-09 judge-delegated（W-J2/P1.2 §3.5）：从账本重放逐字段核对 judge 来源，不信任冻结记录自述。
    if (approved.freeze.origin !== "judge-delegated" || approved.freeze.decisionId !== undefined || approved.freeze.decidedBy !== undefined
      || approved.freeze.applicationId !== `intent-${requestId}` || !judgeIntentAuditMatchesSource(decision.event, source)) return "Original judge intent confirmation source differs";
  } else return "Original intent confirmation source differs";
  return undefined;
}

/** Current Active intersected with the original frozen module ownership, for the exact inverse paths. */
export async function prepareRevertOwnerGrants(deps: TrunkServiceDeps, basis: ExecutionRunBasis, paths: readonly string[]): Promise<TrunkServiceResult<import("../../../provider/trunk/public/trunk-store.ts").GitRevertSource["ownerGrants"]>> {
  const invalid = (code: string, message: string) => fail<import("../../../provider/trunk/public/trunk-store.ts").GitRevertSource["ownerGrants"]>("trunk-item-invalid", `${code}: ${message}`);
  try {
      const role = Object.values(basis.frozenRoles)[0], rosterFile = role && basis.snapshot.files.find(file => file.path === role.rosterRef.path && file.sha256 === role.rosterRef.sha256);
      const roster = parseProjectRoster(rosterFile ? Buffer.from(rosterFile.bytesBase64, "base64").toString("utf8") : "", basis.flowId);
      if (!roster.ok) return invalid("git-revert-roster-unavailable", "Original frozen owner/module roster is unavailable");
      const affected = [...paths], owners = new Map<string, { paths: string[]; modules: Set<string> }>();
      const contains = (root: string, file: string) => root === file || root.endsWith("/") && file.startsWith(root);
      for (const file of affected) {
        const matching = roster.roster.roles.flatMap(owner => owner.modules.flatMap(moduleId => roster.roster.modules.filter(module => module.id === moduleId && module.paths.some(root => contains(root, file))).map(() => ({ owner, moduleId }))));
        if (matching.length !== 1 || !basis.frozenRoles[matching[0]!.owner.id]) return invalid("git-revert-owner-unproven", `The inverse path has no unique frozen project owner: ${file}`);
        const match = matching[0]!, row = owners.get(match.owner.id) ?? { paths: [], modules: new Set<string>() }; row.paths.push(file); row.modules.add(match.moduleId); owners.set(match.owner.id, row);
      }
      const current = await deps.store.readManifest(); if (!current.ok || current.value.flowId !== basis.flowId) return invalid("git-revert-current-authority-unavailable", "Actual current same-flow authority is unavailable");
      const ownerGrants: import("../../../provider/trunk/public/trunk-store.ts").GitRevertSource["ownerGrants"][number][] = [];
      for (const [ownerRoleId, owner] of owners) {
        const active = current.value.activeRoles?.[ownerRoleId], activeBytes = active ? await deps.store.readActiveRoleEvidence!(active) : undefined;
        const authFile = activeBytes?.ok ? activeBytes.value.files.find(file => file.path === active!.authorizationRef.path && file.sha256 === active!.authorizationRef.sha256) : undefined;
        const auth: unknown = authFile ? JSON.parse(Buffer.from(authFile.bytesBase64, "base64").toString("utf8")) : undefined;
        if (!auth || typeof auth !== "object" || !("schema" in auth) || auth.schema !== "role-authorization/v1" || !("roleId" in auth) || auth.roleId !== ownerRoleId
          || !("flowId" in auth) || auth.flowId !== basis.flowId || !("writesets" in auth) || !Array.isArray(auth.writesets) || auth.writesets.some(value => typeof value !== "string"))
          return invalid("git-revert-owner-authority-unavailable", "A frozen owner lacks current actual Active authorization");
        const modulePaths: string[] = [];
        const writesets: readonly unknown[] = auth.writesets;
        for (const moduleId of owner.modules) {
          const dispatch = await prepareRoleDispatch(deps, { fromRoleId: "convener", targetRoleId: ownerRoleId, moduleId, flowId: basis.flowId, runId: basis.runId });
          if (!dispatch.ok || dispatch.value.kind !== "execution" || !dispatch.value.modulePaths) return invalid("git-revert-scope-withdrawn", dispatch.ok ? "Frozen module scope is unavailable" : dispatch.message);
          modulePaths.push(...dispatch.value.modulePaths);
        }
        if (owner.paths.some(file => !modulePaths.some(root => contains(root, file)) || !writesets.some(root => typeof root === "string" && contains(root, file))))
          return invalid("git-revert-scope-withdrawn", "Every inverse path must remain inside current Active and frozen owner/module permissions");
        ownerGrants.push({ ownerRoleId, paths: owner.paths.sort(), evidenceDigest: directHash({ frozen: basis.frozenRoles[ownerRoleId], active, authorizationSha256: authFile!.sha256, modulePaths }) });
      }
      ownerGrants.sort((a, b) => a.ownerRoleId < b.ownerRoleId ? -1 : 1);

    return { ok: true, value: ownerGrants };
  } catch(error) { return invalid("git-revert-owner-authority-unavailable", String(error)); }
}

/** Re-read native objects and reproduce the inverse candidate; no accepted worker is substituted for a revert. */
async function verifyRevertCandidateMaterial(deps: TrunkServiceDeps, proof: import("../../../provider/trunk/public/trunk-store.ts").GitCandidateEvidence): Promise<string | undefined> {
  const source = proof.journal.candidateSource;
  if (!source || source.kind !== "run-revert" || !source.base.oid) return "Actual revert source/base is unavailable";
  const ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return ledger.reason;
  const creates = ledger.records.filter(row => row.value.kind === "task.created" && row.value.taskId === source.taskId);
  const checked = creates.length === 1 ? validateTaskStateEvent(creates[0]!.value) : undefined;
  if (!checked?.ok || checked.event.kind !== "task.created" || checked.event.from !== "chief" || checked.event.to !== "convener"
    || checked.event.flowId !== source.flowId || checked.event.runId !== source.runId) return "Revert has no unique actual Chief-created same-run controller";
  const message = /^(?<message>[\s\S]*)\n\nANS-Request: [a-f0-9]{64}\n$/.exec(proof.commit.message)?.groups?.message;
  if (!message) return "Actual revert commit has no reproducible bounded request message";
  const ancestor = await createGitQueryPort(deps.projectRoot).query({ operationId: proof.journal.operationId, template: "merge-base", target: source.target, other: source.base.oid });
  if (ancestor.termination !== "exited" || ancestor.exitCode !== 0 || ancestor.outputTruncated || ancestor.stdout.trim() !== source.target.hex) return "Revert target is not an actual ancestor of the original immutable code basis";
  const objects = createGitCandidateStore(deps.projectRoot), planned = await objects.planRevert({ operationId: proof.journal.operationId, base: source.base.oid, commit: source.target,
    ...(source.mainline !== undefined ? { mainline: source.mainline } : {}), message, timestamp: checked.event.at });
  if (!planned.ok) return `${planned.code}: ${planned.message}`;
  const files = planned.value.input.files.map(file => ({ path: file.path, sha256: file.bytesBase64 === null ? null : createHash("sha256").update(Buffer.from(file.bytesBase64, "base64")).digest("hex") }));
  if (canonicalJson(planned.value.commit) !== canonicalJson(proof.commit) || canonicalJson(planned.value.revertBasis) !== canonicalJson(source.revertBasis)
    || canonicalJson(files) !== canonicalJson(source.files) || directHash(source.ownerGrants) !== source.scopeDigest) return "Native inverse commit/tree/source file bytes or owner digest changed";
  return undefined;
}

async function readReviewMaterial(deps: TrunkServiceDeps, input: { parentTaskId: string; flowId: string; runId: string; target: DispatchTaskReviewTarget }): Promise<TrunkServiceResult<import("../abstract/trunk-service.ts").ReviewMaterial>> {
  const invalid = (message: string) => fail<import("../abstract/trunk-service.ts").ReviewMaterial>("trunk-item-invalid", message);
  try {
    if (!input.parentTaskId || !isDispatchTaskReviewTarget(input.target)) return invalid("An actual parent and explicit expected review candidate are required");
    const run = await readRunEvidence(deps, input.runId); if (!run.ok || run.value.flowId !== input.flowId) return invalid(run.ok ? "Review belongs to another flow" : run.message ?? run.code);
    const proof = await readGitCandidateEvidence(deps.projectRoot, input.target.operationId, input.target.candidate); if (!proof.ok) return invalid(proof.message ?? proof.reason);
    const source = proof.value.journal.candidateSource;
    if (!source || (source.kind !== "run-integration" && source.kind !== "run-revert") || source.roleId !== "convener" || source.taskId !== input.parentTaskId || source.flowId !== input.flowId
      || source.runId !== input.runId || source.pinDigest !== run.value.pinDigest || !isGitBasis(run.value.run.codeBasis)
      || !run.value.run.codeBasis.oid || canonicalJson(source.base) !== canonicalJson(run.value.run.codeBasis)
      || canonicalJson(proof.value.commit.parents) !== canonicalJson(source.kind === "run-integration" ? [source.base.oid, ...source.contributors.map(row => row.candidate)] : [source.base.oid]))
      return invalid("Review target is not the real final integration of this actual parent and frozen run");
    const read = await readOperationEvents(deps.projectRoot); if (!read.ok) return invalid(read.reason);
    const intentError = await verifyReviewIntent(deps, run.value, read.records); if (intentError) return invalid(intentError);
    const events: Array<{ raw: string; event: TaskStateEvent }> = [];
    for (const row of read.records) { const checked = validateTaskStateEvent(row.value); if (!checked.ok) return invalid(checked.message); events.push({ raw: row.raw, event: checked.event }); }
    const parents = events.filter(row => row.event.kind === "task.created" && row.event.taskId === input.parentTaskId);
    const parent = parents[0]?.event;
    if (parents.length !== 1 || parent?.kind !== "task.created" || parent.to !== "convener" || parent.from !== "chief" || parent.flowId !== input.flowId || parent.runId !== input.runId || events.some(row => row.event.kind === "task.closed" && row.event.taskId === input.parentTaskId))
      return invalid("The integration has no real same-run assigned controller parent");
    if (source.kind === "run-revert") {
      const native = await verifyRevertCandidateMaterial(deps, proof.value); if (native) return invalid(native);
      const grants = await prepareRevertOwnerGrants(deps, run.value, source.files.map(file => file.path));
      if (!grants.ok || canonicalJson(grants.value) !== canonicalJson(source.ownerGrants)) return invalid(grants.ok ? "Revert owner authority changed" : grants.message ?? grants.code);
    }
    for (const child of source.kind === "run-integration" ? source.contributors : []) {
      const rows = events.filter(row => "taskId" in row.event && row.event.taskId === child.source.taskId), creates = rows.filter(row => row.event.kind === "task.created");
      const created = creates[0]?.event, report = rows.filter(row => row.event.kind === "task.reported").at(-1), closed = rows.filter(row => row.event.kind === "task.closed").at(-1)?.event;
      if (creates.length !== 1 || created?.kind !== "task.created" || created.parentTaskRef?.taskId !== input.parentTaskId || created.to !== child.source.roleId
        || created.runId !== input.runId || created.flowId !== input.flowId || report?.event.kind !== "task.reported" || report.event.status !== "done"
        || directHashBytes(report.raw) !== child.reportSha256 || closed?.kind !== "task.closed" || closed.by !== "convener" || closed.outcome !== "accepted"
        || closed.operationId !== child.closeOperationId || closed.eventId !== child.closeEventId || closed.actionSource?.kind !== "role-direct"
        || closed.actionSource.action !== "close-created-task" || closed.actionSource.runId !== input.runId) return invalid("Final review requires the unchanged actual accepted child results, not a model summary");
      const original = await readGitCandidateEvidence(deps.projectRoot, child.operationId, child.candidate);
      if (!original.ok || canonicalJson(original.value.journal.candidateSource) !== canonicalJson(child.source)) return invalid("A child candidate's original source is unavailable or changed");
    }
    const documents = run.value.run.documents, proposal = evidenceObject(documents) && evidenceObject(documents.proposal) ? documents.proposal : undefined;
    if (!proposal || typeof proposal.path !== "string" || typeof proposal.sha256 !== "string") return invalid("The actual frozen run has no explicit approved proposal criterion source");
    const file = run.value.snapshot.files.find(file => file.path === proposal.path && file.sha256 === proposal.sha256);
    if (!file) return invalid("Frozen proposal criterion bytes are missing");
    const text = Buffer.from(file.bytesBase64, "base64").toString("utf8"), frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    const meta: unknown = frontmatter ? parseYaml(frontmatter[1]!) : undefined, body = frontmatter ? text.slice(frontmatter[0].length) : "";
    if (!evidenceObject(meta) || meta.schema !== "project-proposal/v2" || meta.flowId !== input.flowId || !Number.isSafeInteger(meta.version)
      || docVersionOfPath(proposal.path) !== meta.version || Buffer.byteLength(text, "utf8") > DECISION_FILE_LIMIT
      || (proposal.version !== undefined && meta.version !== proposal.version) || !body.split(/\r?\n/).some(line => line.trim() && !line.trim().startsWith("#"))
      || secretEvidence(proposal.path, text)) return invalid("The frozen proposal has no readable actual completion requirements; no criteria are invented");
    const documentBasis = isGitBasis(run.value.run.documentGitBasis) ? run.value.run.documentGitBasis : source.base.ref === "refs/ans/trunk" ? source.base : undefined;
    if (!documentBasis?.oid) return invalid("The original run has no explicit frozen document Git source; never fill criteria from current live or old delivered code");
    const objects = createGitCandidateStore(deps.projectRoot), criterion = await objects.readBlob(documentBasis.oid, proposal.path);
    if (criterion.sha256 !== proposal.sha256) return invalid("Criterion bytes differ from the actual frozen document Git source");
    const reviewBasisRef = { kind: "git-candidate-review", candidateOperationId: input.target.operationId, candidate: input.target.candidate,
      criteria: [{ oid: documentBasis.oid, path: proposal.path, sha256: proposal.sha256 }] };
    if (!isTaskReviewBasisRef(reviewBasisRef)) return invalid("Actual review material cannot form the single strict host reference shape");
    return { ok: true, value: { flowId: input.flowId, runId: input.runId, parentTaskId: input.parentTaskId, pinDigest: run.value.pinDigest,
      runRecordSha256: run.value.recordSha256, reviewBasisRef, candidateJournalSha256: proof.value.journalFile.sha256,
      relatedLedgerDigest: directHashBytes(JSON.stringify(read.records.map(row => row.value))),
      contextText: `Read-only final candidate review\n${canonicalJson(reviewBasisRef)}\nFrozen completion requirements (${proposal.path}):\n${text}\nA model pass or a ref alone is not quality evidence. Report unavailable required execution as blocked.` } };
  } catch (error) { return invalid(String(error)); }
}

/**
 * X-R5（E2 S4）：verifier 最终 review 的角色侧前置事实（api-spec §5 登记键，**恰好两个**）：
 *  - `reviewTarget` = 最终 review 的期望目标（`operationId` 即期望 CID；`candidate` 即最终候选完整 OID）；
 *  - `criteria` = 宿主冻结材料产出的冻结 criteria（`GitEvidenceRef[]`）。
 * 只投影宿主已核验的材料，不造键、不读取验收结论（`accepted`/`passed` 等属未登记键，模块一律 deny）。
 */
export function verifierReviewFacts(input: {
  target: DispatchTaskReviewTarget;
  reviewBasisRef: import("../abstract/trunk-service.ts").ReviewMaterial["reviewBasisRef"];
}): Readonly<Record<string, unknown>> {
  return { reviewTarget: input.target, criteria: input.reviewBasisRef.criteria };
}

export async function prepareReviewTask(deps: TrunkServiceDeps, input: { parentTaskId: string; flowId: string; runId: string; target: DispatchTaskReviewTarget }): Promise<TrunkServiceResult<import("../abstract/trunk-service.ts").PreparedReviewTask>> {
  const parent = await prepareParentTaskRef(deps, { actorRoleId: "convener", taskId: input.parentTaskId, flowId: input.flowId, runId: input.runId });
  if (!parent.ok) return fail("trunk-item-invalid", parent.message);
  const material = await readReviewMaterial(deps, input);
  if (!material.ok) return material;
  // X-R5（E2 S4）：review 角色侧前置——在宿主材料（`reviewBasisRef`：最终候选/CID/冻结 criteria）
  // 产出后、返回/提交前调用 verifier 模块；事实键严格按 api-spec 登记（`reviewTarget`/`criteria`），
  // 未登记键不传。普通调查任务没有最终 CID，不进入本函数（不调用 preflight）。
  // deny ⇒ 既有 `trunk-item-invalid` 回执（不新增错误码、不改变 Service 既有拒绝顺序/文案语义）；
  // allow 只表示角色侧不反对，**不替代**独立验收判定、证据内容核验或 Service 事务/账本校验。
  const decision = verifierRoleModule.preflight?.checkAction({
    action: "review",
    facts: verifierReviewFacts({ target: input.target, reviewBasisRef: material.value.reviewBasisRef }),
  });
  if (decision !== undefined && !decision.allow) {
    return fail("trunk-item-invalid", `Final review material was rejected by the verifier role precondition (internal code=${decision.code}); no review task was prepared.`);
  }
  return { ok: true, value: { ...material.value, parentTaskRef: parent.parentTaskRef } };
}
export async function readAssignedReviewContext(deps: TrunkServiceDeps, input: { taskId: string; actorRoleId: string }): Promise<TrunkServiceResult<import("../abstract/trunk-service.ts").ReviewMaterial>> {
  return readReviewTaskContext(deps, input, false);
}
/**
 * 已指派 review 材料的读取（事务/账本/证据绑定）。**不调用** `preflight.checkAction`：
 * X-R5 的 review 前置只在 `prepareReviewTask`（最终 review 准备）消费；普通调查任务与重复读取
 * 不重复执行角色策略前置，也不得用前置 allow 替代本函数/Service 的证据核验。
 */
async function readReviewTaskContext(deps: TrunkServiceDeps, input: { taskId: string; actorRoleId: string }, allowClosed: boolean): Promise<TrunkServiceResult<import("../abstract/trunk-service.ts").ReviewMaterial>> {
  const invalid = (message: string) => fail<import("../abstract/trunk-service.ts").ReviewMaterial>("trunk-item-invalid", message);
  const read = await readOperationEvents(deps.projectRoot); if (!read.ok) return invalid(read.reason);
  const rows = read.records.filter(row => row.value.taskId === input.taskId), creations = rows.filter(row => row.value.kind === "task.created"), checked = creations[0] && validateTaskStateEvent(creations[0].value);
  if (input.actorRoleId !== "verifier" || creations.length !== 1 || !checked?.ok || checked.event.kind !== "task.created" || checked.event.to !== "verifier"
    || !checked.event.flowId || !checked.event.runId || !isTaskReviewBasisRef(checked.event.reviewBasisRef)
    || (!allowClosed && rows.some(row => row.value.kind === "task.closed"))) return invalid("An actual open assigned verifier task with a host review reference is required");
  const task = checked.event, ref = checked.event.reviewBasisRef;
  let controllerTaskId: string, sourceFile: { path: string; sha256: string } | undefined;
  if (task.hubRouting === "chief-hub-v1") {
    const controller = task.reviewControllerRef;
    if (task.from !== "chief" || task.parentTaskRef !== undefined || !isTaskReviewControllerRef(controller) || controller.flowId !== task.flowId
      || controller.runId !== task.runId || canonicalJson(controller.reviewBasisRef) !== canonicalJson(ref) || !task.workSourceRef)
      return invalid("Chief final review requires its independent actual controller reference");
    const stored = await deps.store.readInitializationSource?.(task.workSourceRef.sourceId);
    if (!stored?.ok || stored.value.path !== task.workSourceRef.path || stored.value.sha256 !== task.workSourceRef.sha256) return invalid("Final review chief source bytes are unavailable");
    let source: unknown; try { source = JSON.parse(Buffer.from(stored.value.bytesBase64, "base64").toString("utf8")); } catch { return invalid("Final review source JSON is invalid"); }
    const root = await readGitProtectionFacts(deps.projectRoot);
    if (!evidenceObject(source) || source.schema !== "repository-work-source/v1" || source.purpose !== "builtin-preparation" || source.hubRouting !== task.hubRouting
      || source.sourceId !== task.workSourceRef.sourceId || source.projectRoot !== root.projectRoot || source.flowId !== task.flowId || source.targetRoleId !== "verifier"
      || source.planningRunId !== task.runId || canonicalJson(source.reviewControllerRef) !== canonicalJson(controller) || canonicalJson(source.reviewBasisRef) !== canonicalJson(ref))
      return invalid("Final review differs from its actual chief-issued immutable source");
    controllerTaskId = controller.taskId; sourceFile = { path: stored.value.path, sha256: stored.value.sha256 };
  } else {
    if (task.from !== "convener" || !task.parentTaskRef || task.reviewControllerRef !== undefined) return invalid("Historical review requires its original actual creator/parent");
    controllerTaskId = task.parentTaskRef.taskId;
  }
  const material = await readReviewMaterial(deps, { parentTaskId: controllerTaskId, flowId: task.flowId!, runId: task.runId!, target: { operationId: ref.candidateOperationId, candidate: ref.candidate } });
  if (!material.ok) return material;
  if (canonicalJson(material.value.reviewBasisRef) !== canonicalJson(ref)) return invalid("Assigned review criteria differ from the actual frozen source");
  return { ok: true, value: { ...material.value, ...(sourceFile ? { sourceFile } : {}) } };
}

/** Bounded mechanical text-artifact evidence. This is not a model verdict or a substitute for program execution. */
async function readTextQualityProof(deps: TrunkServiceDeps, taskId: string, evidence: readonly string[], review: import("../abstract/trunk-service.ts").ReviewMaterial): Promise<TrunkServiceResult<{
  digest: string; files: CompleteSnapshot["files"]; liveFiles: readonly { path: string; sha256: string }[];
}>> {
  const invalid = (message: string) => fail<{ digest: string; files: CompleteSnapshot["files"]; liveFiles: readonly { path: string; sha256: string }[] }>("trunk-item-invalid", message);
  try {
    const paths = [...new Set(evidence.filter(path => path.startsWith("docs/quality/") && path.endsWith(".md")))];
    if (paths.length !== 1 || !paths[0]!.startsWith(`docs/quality/${review.flowId}-report-v`) || !/^docs\/quality\/[A-Za-z0-9_-]+-report-v[1-9]\d*\.md$/.test(paths[0]!))
      return invalid("review-quality-report-missing: name the actual canonical quality document in the verifier report evidence");
    const path = paths[0]!, quality = await deps.store.readProjectFile!(path, { maxBytes: DECISION_FILE_LIMIT });
    if (!quality.ok) return invalid(quality.message ?? quality.reason);
    const text = Buffer.from(quality.value.bytesBase64, "base64").toString("utf8"), fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text), meta: unknown = fm ? parseYaml(fm[1]!) : undefined;
    const ref = review.reviewBasisRef;
    if (!evidenceObject(meta) || meta.schema !== "git-quality-report/v1" || meta.taskId !== taskId || meta.runId !== review.runId || meta.flowId !== review.flowId
      || meta.candidateOperationId !== ref.candidateOperationId || canonicalJson(meta.candidate) !== canonicalJson(ref.candidate) || canonicalJson(meta.criteria) !== canonicalJson(ref.criteria)
      || (meta.version !== undefined && meta.version !== docVersionOfPath(path)) || Object.keys(meta).some(key => !["schema", "version", "taskId", "runId", "flowId", "candidateOperationId", "candidate", "criteria", "checks"].includes(key))
      || secretEvidence(path, text)) return invalid("review-quality-binding-invalid: quality data must bind this actual verifier task, final OID and frozen criteria; approval/pass fields are not evidence");
    const objects = createGitCandidateStore(deps.projectRoot), criterion = ref.criteria[0];
    if (ref.criteria.length !== 1 || !criterion) return invalid("review-quality-execution-unproven: this mechanical text verifier does not cover the supplied criterion set");
    const criterionFile = await objects.readBlob(criterion.oid, criterion.path), criterionText = Buffer.from(criterionFile.bytesBase64, "base64").toString("utf8");
    const criterionBody = criterionText.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#")).join(" ").replace(/\s+/g, " ");
    // Only this explicit, already-approved text/evidence/creator-closure requirement is mechanically covered.
    // Other/program requirements remain unproved instead of treating the absence of shell as a verdict.
    const requirement = /^Produce ([A-Za-z0-9_./-]+\.txt), preserve evidence and use creator closure\.$/i.exec(criterionBody);
    if (!requirement || !isGitLiteralPath(requirement[1])) return invalid("review-quality-execution-unproven: actual criteria require evidence outside this bounded text-artifact check");
    const targetPath = requirement[1]!, proof = await readGitCandidateEvidence(deps.projectRoot, ref.candidateOperationId, ref.candidate);
    const source = proof.ok ? proof.value.journal.candidateSource : undefined;
    if (!source || (source.kind !== "run-integration" && source.kind !== "run-revert") || source.files.length !== 1 || source.files[0]?.path !== targetPath || !source.files[0].sha256)
      return invalid("review-quality-scope-unproven: the actual integration is not exactly the approved text-artifact change");
    if (!Array.isArray(meta.checks) || meta.checks.length !== 1 || !evidenceObject(meta.checks[0])) return invalid("review-quality-checks-missing: an explicit actual blob/content check is required");
    const check = meta.checks[0], artifact = check.artifact;
    if (Object.keys(check).length !== 2 || check.assertion !== "nonempty-utf8" || !evidenceObject(artifact) || Object.keys(artifact).length !== 3
      || !isGitOid(artifact.oid) || canonicalJson(artifact.oid) !== canonicalJson(ref.candidate) || artifact.path !== targetPath || typeof artifact.sha256 !== "string")
      return invalid("review-quality-check-invalid: assertion must address the exact final candidate blob");
    const blob = await objects.readBlob(ref.candidate, targetPath), bytes = Buffer.from(blob.bytesBase64, "base64"), content = bytes.toString("utf8");
    if (blob.sha256 !== artifact.sha256.toLowerCase() || blob.sha256 !== source.files[0].sha256 || !content.trim() || content.includes("\0") || !Buffer.from(content, "utf8").equals(bytes))
      return invalid("review-quality-content-mismatch: the actual final blob/hash/nonempty UTF8 assertion failed");
    return { ok: true, value: { digest: directHash({ kind: "verified-text-quality", taskId, target: ref, pinDigest: review.pinDigest, quality: [path, quality.value.sha256], artifact: [targetPath, blob.sha256],
      ...(source.kind === "run-integration" ? { acceptedChildren: source.contributors.map(row => [row.source.taskId, row.closeOperationId, row.closeEventId, row.reportSha256]) }
        : { revert: { target: source.target, mainline: source.mainline, ownerGrants: source.ownerGrants, scopeDigest: source.scopeDigest, basis: source.revertBasis } }) }),
      files: [{ path, ...quality.value }, { path: targetPath, ...blob }], liveFiles: [{ path, sha256: quality.value.sha256 }] } };
  } catch (error) { return invalid(String(error)); }
}

/** Relationship facts only: legacy creators remain unchanged; a Chief hub review has no worker parent. */
function isControllerReviewTask(value: unknown, controllerTaskId: string, flowId: string, runId: string, ref: import("../../../model/runtime.ts").TaskReviewBasisRef): boolean {
  if (!evidenceObject(value)) return false;
  const checked = validateTaskStateEvent(value);
  if (!checked.ok || checked.event.kind !== "task.created") return false;
  const task = checked.event;
  if (task.to !== "verifier" || task.flowId !== flowId || task.runId !== runId || canonicalJson(task.reviewBasisRef) !== canonicalJson(ref)) return false;
  if (task.hubRouting === "chief-hub-v1") return task.from === "chief" && task.parentTaskRef === undefined && isTaskReviewControllerRef(task.reviewControllerRef)
    && task.reviewControllerRef.taskId === controllerTaskId && task.reviewControllerRef.flowId === flowId && task.reviewControllerRef.runId === runId
    && canonicalJson(task.reviewControllerRef.reviewBasisRef) === canonicalJson(ref);
  return task.from === "convener" && task.parentTaskRef?.taskId === controllerTaskId && task.reviewControllerRef === undefined;
}

/** Genuine quality-child acceptance permits delivery while its controller task is still open. */
export async function prepareVerifiedDelivery(deps: TrunkServiceDeps, input: {
  taskId: string; runId: string; candidate: import("../../../model/trunk.ts").GitOid; creatorCloseOperationId?: string;
}): Promise<TrunkServiceResult<import("../../../provider/trunk/public/trunk-store.ts").GitDeliverySource>> {
  const invalid = (message: string) => fail<import("../../../provider/trunk/public/trunk-store.ts").GitDeliverySource>("trunk-item-invalid", message);
  try {
    const assigned = await inspectAssignedTask(deps, { taskId: input.taskId, actorRoleId: "convener" });
    if (!assigned.ok || assigned.value.runId !== input.runId) return invalid(assigned.ok ? "Delivery controller run differs" : assigned.message ?? assigned.code);
    const ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return invalid(ledger.reason);
    const journals = (await createGitRefStore(deps.projectRoot).listJournals()).filter(row => row.phase === "published" && (row.candidateSource?.kind === "run-integration" || row.candidateSource?.kind === "run-revert")
      && row.candidateSource.taskId === input.taskId && row.candidateSource.runId === input.runId && canonicalJson(row.newOid) === canonicalJson(input.candidate));
    if (journals.length !== 1 || journals[0]?.phase !== "published") return invalid("Delivery requires one actual same-controller integration operation");
    const candidate = journals[0], review = await readReviewMaterial(deps, { parentTaskId: input.taskId, flowId: assigned.value.flowId, runId: input.runId,
      target: { operationId: candidate.operationId, candidate: input.candidate } });
    if (!review.ok) return invalid(review.message ?? review.code);
    const qualityTasks = ledger.records.filter(row => isControllerReviewTask(row.value, input.taskId, assigned.value.flowId, input.runId, review.value.reviewBasisRef)
      && ledger.records.some(close => close.value.kind === "task.closed" && close.value.taskId === row.value.taskId && close.value.operationId === input.creatorCloseOperationId));
    if (qualityTasks.length !== 1 || typeof qualityTasks[0]!.value.taskId !== "string") return invalid("Delivery requires the exact actually accepted independent review task");
    const qualityTaskId = qualityTasks[0]!.value.taskId, rows = ledger.records.filter(row => row.value.taskId === qualityTaskId);
    const reportRow = rows.filter(row => row.value.kind === "task.reported").at(-1), closeRow = rows.filter(row => row.value.kind === "task.closed").at(-1);
    const report = reportRow ? validateTaskStateEvent(reportRow.value) : undefined, close = closeRow ? validateTaskStateEvent(closeRow.value) : undefined;
    if (!report?.ok || report.event.kind !== "task.reported" || report.event.from !== "verifier" || report.event.status !== "done"
      || !close?.ok || close.event.kind !== "task.closed" || close.event.by !== qualityTasks[0]!.value.from || close.event.outcome !== "accepted" || !close.event.operationId || !close.event.eventId
      || close.event.operationId !== input.creatorCloseOperationId || close.event.actionSource?.kind !== "role-direct" || close.event.actionSource.action !== "close-created-task"
      || close.event.actionSource.runId !== input.runId) return invalid("Delivery must name the actual verifier child's original creator acceptance operation");
    const assignedReview = await readReviewTaskContext(deps, { taskId: qualityTaskId, actorRoleId: "verifier" }, true);
    if (!assignedReview.ok || canonicalJson(assignedReview.value.reviewBasisRef) !== canonicalJson(review.value.reviewBasisRef)) return invalid(assignedReview.ok ? "Accepted review target differs" : assignedReview.message ?? assignedReview.code);
    const quality = await readTextQualityProof(deps, qualityTaskId, report.event.evidence ?? [], review.value);
    if (!quality.ok || close.event.actionSource.baseDigest !== quality.value.digest) return invalid(quality.ok ? "Quality acceptance does not bind current actual evidence" : quality.message ?? quality.code);
    const artifacts = quality.value.files.filter(file => !quality.value.liveFiles.some(live => live.path === file.path));
    return { ok: true, value: { kind: "verified-run-delivery", taskId: input.taskId, runId: input.runId, flowId: review.value.flowId, roleId: "convener",
      candidateOperationId: candidate.operationId, candidateJournalSha256: review.value.candidateJournalSha256, pinDigest: review.value.pinDigest, runRecordSha256: review.value.runRecordSha256,
      taskDigest: directHashBytes(JSON.stringify(ledger.records.filter(row => row.value.taskId === input.taskId).map(row => row.value))), ledgerDigest: directHashBytes(JSON.stringify(ledger.records.map(row => row.value))),
      qualityTaskId, qualityDigest: quality.value.digest, creatorCloseOperationId: close.event.operationId, creatorCloseEventId: close.event.eventId,
      qualityReportSha256: directHashBytes(reportRow!.raw), criteria: review.value.reviewBasisRef.criteria,
      evidence: artifacts.map(file => ({ oid: input.candidate, path: file.path, sha256: file.sha256 })), liveFiles: [...quality.value.liveFiles, ...(assignedReview.value.sourceFile ? [assignedReview.value.sourceFile] : [])] } };
  } catch (error) { return invalid(String(error)); }
}

/** Exact open controller facts only; stopping never manufactures an assigned-role report. */
export async function prepareControllerStop(deps: TrunkServiceDeps, input: { taskId: string; actorRoleId: "chief" }): Promise<TrunkServiceResult<import("../abstract/trunk-service.ts").ControllerStopScope>> {
  const invalid = (message: string) => fail<import("../abstract/trunk-service.ts").ControllerStopScope>("trunk-item-invalid", message);
  try {
    if (input.actorRoleId !== "chief" || !input.taskId?.trim()) return invalid("An exact controller task and its actual Chief creator are required");
    const ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return invalid(ledger.reason);
    const rows = ledger.records.filter(row => row.value.taskId === input.taskId), creates = rows.filter(row => row.value.kind === "task.created");
    const checked = creates.length === 1 ? validateTaskStateEvent(creates[0]!.value) : undefined;
    if (!checked?.ok || checked.event.kind !== "task.created" || checked.event.from !== "chief" || checked.event.to !== "convener"
      || !checked.event.flowId || !checked.event.runId || rows.some(row => row.value.kind === "task.closed") || rows.some(row => !validateTaskStateEvent(row.value).ok))
      return invalid("The exact open same-project Chief-created Convener task is unavailable");
    const task = checked.event, assigned = await inspectAssignedTask(deps, { taskId: input.taskId, actorRoleId: "convener" });
    if (!assigned.ok || assigned.value.flowId !== task.flowId || assigned.value.runId !== task.runId) return invalid(assigned.ok ? "Actual controller assignment differs" : assigned.message ?? assigned.code);
    const run = await deps.store.readRunRecord?.(task.runId), source = await readTaskProcessSource(deps, { taskId: input.taskId, actorRoleId: "convener", flowId: task.flowId, runId: task.runId });
    if (!run?.ok || run.value.value.flowId !== task.flowId || !["draft", "pinned"].includes(String(run.value.value.state)) || !source.ok)
      return invalid(!source.ok ? source.message ?? source.code : "Controller run is unavailable or cancelled");
    const after = await readOperationEvents(deps.projectRoot);
    const ledgerDigest = directHashBytes(JSON.stringify(ledger.records.map(row => row.value)));
    if (!after.ok || directHashBytes(JSON.stringify(after.records.map(row => row.value))) !== ledgerDigest) return invalid("Controller stop source changed while reading; prepare fresh explicitly");
    return { ok: true, value: { taskId: input.taskId, actorRoleId: "convener", creatorRoleId: "chief", flowId: task.flowId, runId: task.runId,
      taskDigest: directHashBytes(JSON.stringify(rows.map(row => row.value))), ledgerDigest, runSha256: run.value.sha256, processSource: source.value } };
  } catch(error) { return invalid(String(error)); }
}

/** Final R9 observation of the original expectations. No task report, task close, run mutation or second stop ledger. */
export async function confirmControllerStop(deps: TrunkServiceDeps, expected: import("../abstract/trunk-service.ts").ControllerStopScope): Promise<TrunkServiceResult<import("../abstract/trunk-service.ts").ControllerStopScope>> {
  const invalid = (message: string) => fail<import("../abstract/trunk-service.ts").ControllerStopScope>("trunk-item-invalid", message);
  const release = await acquireVersionLock(deps.projectRoot);
  try {
    if (!await ownsVersionLock(deps.projectRoot, release.token)) return invalid("Controller stop source fence is unavailable");
    const actual = await prepareControllerStop(deps, { taskId: expected.taskId, actorRoleId: "chief" });
    if (!actual.ok || canonicalJson(actual.value) !== canonicalJson(expected)) return invalid(actual.ok ? "Controller task/report/run/source changed during drain; explicitly prepare fresh" : actual.message ?? actual.code);
    if (!await ownsVersionLock(deps.projectRoot, release.token)) return invalid("Controller stop source fence was lost");
    return actual;
  } finally { await release(); }
}

/** An accepted final review resumes the same live controller; it never creates a task or closes that controller. */
export async function prepareControllerResume(deps: TrunkServiceDeps, input: {
  resumeController: import("../../../model/runtime.ts").DispatchTaskResumeController; hostInitialization: import("../abstract/trunk-service.ts").RepositoryInitializationContext;
}): Promise<TrunkServiceResult<import("../abstract/trunk-service.ts").ControllerResumePreparation>> {
  const invalid = (message: string) => fail<import("../abstract/trunk-service.ts").ControllerResumePreparation>("trunk-item-invalid", message);
  try {
    const expected = input.resumeController, host = input.hostInitialization;
    if (!isDispatchTaskResumeController(expected) || !host || host.parent.roleId !== "chief" || host.parent.inputAccepted !== true || host.parent.settled !== false
      || host.registration.source !== "native-directory-selection" || !host.registration.selectionId || !Number.isSafeInteger(host.registration.listingGeneration) || host.registration.listingGeneration < 1
      || (!host.creatorReports && host.parent.kind !== undefined && host.parent.kind !== "message")) return invalid("Resume requires the real current Chief input and exact expected controller/review identities");
    const root = await readGitInitializationFacts(deps.projectRoot), selected = await readGitInitializationFacts(host.registration.selectedRoot), registered = await readGitInitializationFacts(host.registration.projectRoot);
    if (root.projectRoot !== selected.projectRoot || root.projectRoot !== registered.projectRoot) return invalid("Resume project identity differs from the registered host source");
    const creator = host.creatorReports ? await creatorReportSource(deps, expected.flowId, host.creatorReports, true, true) : undefined;
    if (creator && !creator.ok) return invalid(creator.message ?? creator.code);
    return inspectControllerResumeFacts(deps, input.resumeController);
  } catch (error) { return invalid(String(error)); }
}

export async function inspectQueuedControllerResume(deps: TrunkServiceDeps, input: { resumeController: import("../../../model/runtime.ts").DispatchTaskResumeController }): Promise<TrunkServiceResult<import("../abstract/trunk-service.ts").ControllerResumePreparation>> {
  return inspectControllerResumeFacts(deps, input.resumeController);
}
async function inspectControllerResumeFacts(deps: TrunkServiceDeps, expected: import("../../../model/runtime.ts").DispatchTaskResumeController): Promise<TrunkServiceResult<import("../abstract/trunk-service.ts").ControllerResumePreparation>> {
  const invalid = (message: string) => fail<import("../abstract/trunk-service.ts").ControllerResumePreparation>("trunk-item-invalid", message);
  if (!isDispatchTaskResumeController(expected)) return invalid("An exact controller/review tuple is required");
  try {
    const ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return invalid(ledger.reason);
    const creates = ledger.records.filter(row => row.value.kind === "task.created" && row.value.taskId === expected.reviewTaskId);
    const checked = creates.length === 1 ? validateTaskStateEvent(creates[0]!.value) : undefined;
    if (!checked?.ok || checked.event.kind !== "task.created" || checked.event.hubRouting !== "chief-hub-v1" || checked.event.from !== "chief" || checked.event.to !== "verifier"
      || !isTaskReviewControllerRef(checked.event.reviewControllerRef)) return invalid("Resume names no actual Chief-created final review");
    const controller = checked.event.reviewControllerRef;
    if (controller.taskId !== expected.taskId || controller.flowId !== expected.flowId || controller.runId !== expected.runId) return invalid("Review belongs to a different real controller/flow/run");
    const authority = await prepareVerifiedDelivery(deps, { taskId: expected.taskId, runId: expected.runId, candidate: controller.reviewBasisRef.candidate,
      creatorCloseOperationId: expected.reviewCloseOperationId });
    if (!authority.ok || authority.value.qualityTaskId !== expected.reviewTaskId || authority.value.flowId !== expected.flowId)
      return invalid(authority.ok ? "The exact accepted review differs from the requested resume" : authority.message ?? authority.code);
    const integrations = (await createGitRefStore(deps.projectRoot).listJournals()).filter(row => row.phase === "published" && (row.candidateSource?.kind === "run-integration" || row.candidateSource?.kind === "run-revert")
      && row.candidateSource.taskId === expected.taskId && row.candidateSource.runId === expected.runId);
    if (integrations.length !== 1 || integrations[0]?.phase !== "published" || integrations[0].operationId !== controller.reviewBasisRef.candidateOperationId) return invalid("Queued review CID is no longer the unique actual final integration");
    const integration = integrations[0]!.candidateSource;
    if (!integration || (integration.kind !== "run-integration" && integration.kind !== "run-revert")) return invalid("Actual final candidate source is unavailable");
    const currentManifest = await deps.store.readManifest();
    if (!currentManifest.ok) return invalid("Current contribution permissions are unavailable");
    const authoritySources: { roleId: string; evidence: import("../../../model/trunk.ts").ActiveRoleEvidence; sha256: string }[] = [];
    for (const contribution of integration.kind === "run-integration" ? integration.contributors : []) {
      const owner = contribution.source, dispatch = await prepareRoleDispatch(deps, { fromRoleId: "convener", targetRoleId: owner.roleId, flowId: expected.flowId, runId: expected.runId, moduleId: owner.moduleId });
      const active = currentManifest.value.activeRoles?.[owner.roleId], evidence = active ? await deps.store.readActiveRoleEvidence?.(active) : undefined;
      const authFile = evidence?.ok ? evidence.value.files.find(file => file.path === active!.authorizationRef.path && file.sha256 === active!.authorizationRef.sha256) : undefined;
      const auth: unknown = authFile ? JSON.parse(Buffer.from(authFile.bytesBase64, "base64").toString("utf8")) : undefined;
      if (!dispatch.ok || dispatch.value.kind !== "execution" || !evidenceObject(auth) || auth.schema !== "role-authorization/v1" || auth.roleId !== owner.roleId
        || auth.flowId !== expected.flowId || !Array.isArray(auth.writesets)) return invalid("Current Active/frozen contribution permission is unproven");
      const grants = auth.writesets;
      if (owner.files.some(file => !dispatch.value.modulePaths?.some(root => file.path === root || root.endsWith("/") && file.path.startsWith(root))
        || !grants.some(root => typeof root === "string" && (file.path === root || root.endsWith("/") && file.path.startsWith(root))))) return invalid("Contribution permission was withdrawn before resume");
      authoritySources.push({ roleId: owner.roleId, evidence: active!, sha256: authFile!.sha256 });
    }
    if (integration.kind === "run-revert") {
      const run = await readRunEvidence(deps, expected.runId); if (!run.ok) return invalid(run.message ?? run.code);
      const grants = await prepareRevertOwnerGrants(deps, run.value, integration.files.map(file => file.path));
      if (!grants.ok || canonicalJson(grants.value) !== canonicalJson(integration.ownerGrants)) return invalid(grants.ok ? "Revert current owner authority changed before resume" : grants.message ?? grants.code);
      for (const grant of integration.ownerGrants) {
        const active = currentManifest.value.activeRoles?.[grant.ownerRoleId], bytes = active ? await deps.store.readActiveRoleEvidence?.(active) : undefined;
        const auth = bytes?.ok ? bytes.value.files.find(file => file.path === active!.authorizationRef.path && file.sha256 === active!.authorizationRef.sha256) : undefined;
        if (!active || !auth) return invalid("Actual revert owner authorization snapshot is unavailable");
        authoritySources.push({ roleId: grant.ownerRoleId, evidence: active, sha256: auth.sha256 });
      }
    }
    const release = await acquireVersionLock(deps.projectRoot);
    try {
      if (!await ownsVersionLock(deps.projectRoot, release.token)) return invalid("Resume source fence was lost");
      const current = await readOperationEvents(deps.projectRoot), run = await deps.store.readRunRecord?.(expected.runId);
      if (!current.ok || directHashBytes(JSON.stringify(current.records.map(row => row.value))) !== authority.value.ledgerDigest || !run?.ok
        || run.value.sha256 !== authority.value.runRecordSha256 || run.value.value.state !== "pinned") return invalid("Controller/review/run changed while preparing resume");
      const currentIntegrations = (await createGitRefStore(deps.projectRoot).listJournals()).filter(row => row.phase === "published" && (row.candidateSource?.kind === "run-integration" || row.candidateSource?.kind === "run-revert")
        && row.candidateSource.taskId === expected.taskId && row.candidateSource.runId === expected.runId);
      if (currentIntegrations.length !== 1 || currentIntegrations[0]!.operationId !== authority.value.candidateOperationId) return invalid("Final integration set changed before controller resume");
      const candidate = await readGitCandidateEvidence(deps.projectRoot, authority.value.candidateOperationId, controller.reviewBasisRef.candidate);
      if (!candidate.ok || candidate.value.journalFile.sha256 !== authority.value.candidateJournalSha256) return invalid("Final integration changed before controller resume");
      const manifest = await deps.store.readManifest();
      if (!manifest.ok || manifest.value.digest !== currentManifest.value.digest || manifest.value.activeRevision !== currentManifest.value.activeRevision
        || manifest.value.activeDigest !== currentManifest.value.activeDigest) return invalid("Current permission basis changed before resume");
      // Quality reports and Chief source files are physical live material; Active authority is an immutable stored snapshot, not a worktree projection.
      for (const file of authority.value.liveFiles) {
        const actual = await deps.store.readProjectFile?.(file.path);
        if (!actual?.ok || actual.value.sha256 !== file.sha256) return invalid(`Actual accepted review evidence changed before resume: ${JSON.stringify({ category: "live-material", path: file.path,
          expectedSha256: file.sha256, actualSha256: actual?.ok ? actual.value.sha256 : null, reason: actual?.ok ? "hash-mismatch" : actual?.reason ?? "reader-unavailable" })}`);
      }
      for (const source of authoritySources) {
        const active = manifest.value.activeRoles?.[source.roleId];
        if (!active || canonicalJson(active) !== canonicalJson(source.evidence)) return invalid(`Current authorization reference changed before resume: ${source.roleId}`);
        const stored = await deps.store.readActiveRoleEvidence?.(active);
        const actual = stored?.ok ? stored.value.files.find(file => file.path === active.authorizationRef.path && file.sha256 === active.authorizationRef.sha256) : undefined;
        if (!actual || actual.sha256 !== source.sha256 || createHash("sha256").update(Buffer.from(actual.bytesBase64, "base64")).digest("hex") !== source.sha256)
          return invalid(`Current authorization snapshot changed before resume: ${JSON.stringify({ category: "active-snapshot", roleId: source.roleId, path: active.authorizationRef.path,
            snapshotId: active.snapshotRef.snapshotId, expectedSha256: source.sha256, actualSha256: actual?.sha256 ?? null, reason: stored?.ok ? "authorization-bytes-missing-or-changed" : stored?.reason ?? "reader-unavailable" })}`);
      }
      if (!await ownsVersionLock(deps.projectRoot, release.token)) return invalid("Resume source fence was lost");
      return { ok: true, value: { taskId: expected.taskId, actorRoleId: "convener", flowId: expected.flowId, runId: expected.runId,
        reviewTaskId: expected.reviewTaskId, reviewCloseOperationId: expected.reviewCloseOperationId,
        resumeKey: directHash(["chief-hub-resume/v1", expected.taskId, expected.reviewCloseOperationId]), basisDigest: directHash({ ...authority.value, ledgerDigest: undefined, taskDigest: undefined }) } };
    } finally { await release(); }
  } catch (error) { return invalid(String(error)); }
}

/** Read-only effect receipt: historical transport task identity confers no scope. */
async function classifyCommittedEffectNotice(deps: TrunkServiceDeps, input: Parameters<import("../abstract/trunk-service.ts").DirectTrunkService["classifyClosedTaskNotice"]>[0]): ReturnType<import("../abstract/trunk-service.ts").DirectTrunkService["classifyClosedTaskNotice"]> {
  const invalid = (message: string) => ({ ok: false as const, code: "effect-notice-unproven", message });
  const source = input.source;
  if (source.kind !== "role-direct" || !["activate-role-documents", "complete-team-plan"].includes(source.action)
    || input.operationId !== source.operationId || !["chief", "convener", source.actorRoleId].includes(input.recipientRoleId)) return invalid("Unsupported or unrelated actual effect receipt");
  const release = await acquireVersionLock(deps.projectRoot);
  try {
    const journal = await createGitRefStore(deps.projectRoot).readJournal(input.operationId), proof = await readDirectOperation(deps, input.operationId);
    if (!journal || journal.phase !== "published" || journal.process?.termination !== "exited" || journal.process.exitCode !== 0 || !journal.publicationTask
      || !proof.ok || canonicalJson(journal.businessJournal?.actionSource) !== canonicalJson(source) || canonicalJson(proof.value.journal.actionSource) !== canonicalJson(source)
      || journal.businessJournal?.operationId !== input.operationId || proof.value.journal.applicationId !== source.applicationId || proof.value.journal.journalId !== source.journalId)
      return invalid("The exact effect has no settled original journal/source/task provenance");
    const operation = proof.value, flowId = operation.journal.flowId, publicationTask = journal.publicationTask;
    if (operation.manifest.flowId !== flowId || completeSnapshotDigest(operation.snapshot.files) !== operation.snapshot.digest) return invalid("Effect snapshot/flow is unproved");
    if (source.action === "activate-role-documents") {
      const meta: unknown = JSON.parse(operation.journal.message ?? "null");
      if (source.actorRoleId !== "nominator" || !isActivationMeta(meta) || meta.input.operationId !== source.operationId || meta.input.flowId !== flowId
        || meta.targetActive.digest !== source.targetDigest || operation.manifest.activeDigest !== source.targetDigest
        || canonicalJson(operation.manifest.activeRoles?.[meta.input.targetRoleId]) !== canonicalJson(meta.evidence)
        || operation.snapshot.snapshotId !== meta.evidence.snapshotRef.snapshotId || operation.snapshot.digest !== meta.evidence.snapshotRef.digest)
        return invalid("The actual activation target/eight-reference snapshot differs");
    } else if (source.actorRoleId !== "convener" || operation.manifest.digest !== source.targetDigest || !operation.manifest.artifacts.execution.teamPlan)
      return invalid("The actual team-plan publication target differs");
    const ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return invalid(ledger.reason);
    const actorRows = ledger.records.filter(row => row.value.taskId === publicationTask.taskId), actorCreates = actorRows.filter(row => row.value.kind === "task.created");
    const actor = actorCreates.length === 1 ? validateTaskStateEvent(actorCreates[0]!.value) : undefined;
    if (!actor?.ok || actor.event.kind !== "task.created" || actor.event.to !== source.actorRoleId || actor.event.flowId !== flowId || actor.event.runId !== publicationTask.runId)
      return invalid("Actual effect publisher belongs to another task/run/flow");
    const prefixHash = createHash("sha256"); let originalRows: typeof ledger.records = [];
    for (let i = 0; i < ledger.records.length; i++) { prefixHash.update(ledger.records[i]!.raw + "\n"); if (prefixHash.copy().digest("hex") === publicationTask.ledgerSha256) { originalRows = ledger.records.slice(0, i + 1); break; } }
    if (!originalRows.some(row => row.raw === actorCreates[0]!.raw) || originalRows.some(row => row.value.taskId === publicationTask.taskId && row.value.kind === "task.closed"))
      return invalid("The original open publisher ledger bytes no longer match");
    if (actor.event.hubRouting === "chief-hub-v1") {
      const ref = actor.event.workSourceRef, stored = ref ? await deps.store.readInitializationSource?.(ref.sourceId) : undefined;
      const value: unknown = stored?.ok ? JSON.parse(Buffer.from(stored.value.bytesBase64, "base64").toString("utf8")) : undefined;
      const root = await readGitInitializationFacts(deps.projectRoot), run = await deps.store.readRunRecord?.(publicationTask.runId);
      if (!ref || !stored?.ok || stored.value.path !== ref.path || stored.value.sha256 !== ref.sha256.toLowerCase() || !evidenceObject(value)
        || value.schema !== "repository-work-source/v1" || value.purpose !== "builtin-preparation" || value.hubRouting !== actor.event.hubRouting || actor.event.from !== "chief"
        || value.sourceId !== ref.sourceId || value.projectRoot !== root.projectRoot || value.flowId !== flowId || value.targetRoleId !== source.actorRoleId
        || value.planningRunId !== publicationTask.runId || !run?.ok || run.value.value.builtinPreparationSource !== ref.sourceId || run.value.value.flowId !== flowId)
        return invalid("Actual builtin effect publisher source/hash differs");
    }
    const boundRows = ledger.records.filter(row => row.value.taskId === input.boundTaskId), creates = boundRows.filter(row => row.value.kind === "task.created"), closes = boundRows.filter(row => row.value.kind === "task.closed");
    const bound = creates.length === 1 ? validateTaskStateEvent(creates[0]!.value) : undefined, closed = closes.length === 1 ? validateTaskStateEvent(closes[0]!.value) : undefined;
    if (!bound?.ok || bound.event.kind !== "task.created" || bound.event.to !== input.recipientRoleId || bound.event.flowId !== flowId
      || !closed?.ok || closed.event.kind !== "task.closed" || closed.event.by !== bound.event.from || closed.event.actionSource?.kind !== "role-direct"
      || closed.event.actionSource.action !== "close-created-task" || closed.event.actionSource.actorRoleId !== closed.event.by
      || closed.event.actionSource.operationId !== closed.event.operationId || closed.event.actionSource.runId !== bound.event.runId) return invalid("The unrelated transport is not an actually closed same-flow recipient assignment");
    if (!await ownsVersionLock(deps.projectRoot, release.token)) return invalid("Effect notice read fence lost");
    return { ok: true, value: { kind: "information-only", taskId: publicationTask.taskId, recipientRoleId: input.recipientRoleId, operationId: input.operationId } };
  } catch (error) { return invalid(String(error)); } finally { await release(); }
}

/** Read assignment relationships at one real ledger/run boundary. Returned facts confer no tool authority. */
export async function classifyClosedTaskNotice(deps: TrunkServiceDeps, input: Parameters<import("../abstract/trunk-service.ts").DirectTrunkService["classifyClosedTaskNotice"]>[0]): ReturnType<import("../abstract/trunk-service.ts").DirectTrunkService["classifyClosedTaskNotice"]> {
  const invalid = (message: string) => ({ ok: false as const, code: "closed-task-notice-unproven", message });
  if (input.boundTaskId?.trim() && input.recipientRoleId?.trim() && isDirectActionSource(input.source) && input.source.kind === "role-direct" && input.source.action !== "close-created-task")
    return classifyCommittedEffectNotice(deps, input);
  if (!input.boundTaskId?.trim() || !input.recipientRoleId?.trim() || !isDirectActionSource(input.source) || input.source.kind !== "role-direct" || input.source.action !== "close-created-task" || input.operationId !== input.source.operationId)
    return invalid("The actual host close receipt and exact recipient-bound task are required");
  const release = await acquireVersionLock(deps.projectRoot);
  try {
    const read = await readOperationEvents(deps.projectRoot); if (!read.ok) return invalid(read.reason);
    // The closed source task and the recipient's existing assignment are separate objects.
    // A host fact about a product child does not reopen (or require reopening) an old convener task.
    const sourceCloses = read.records.filter(row => row.value.kind === "task.closed" && row.value.operationId === input.operationId);
    if (sourceCloses.length !== 1 || typeof sourceCloses[0]!.value.taskId !== "string") return invalid("The original source close operation is missing or ambiguous");
    const sourceTaskId = sourceCloses[0]!.value.taskId;
    const rows = read.records.filter(row => row.value.taskId === sourceTaskId), creates = rows.filter(row => row.value.kind === "task.created"), closes = rows.filter(row => row.value.kind === "task.closed");
    const created = creates.length === 1 ? validateTaskStateEvent(creates[0]!.value) : undefined, closed = closes.length === 1 ? validateTaskStateEvent(closes[0]!.value) : undefined;
    if (!created?.ok || created.event.kind !== "task.created" || !closed?.ok || closed.event.kind !== "task.closed"
      || closed.event.by !== created.event.from || closed.event.operationId !== input.operationId || closed.event.actionSource?.kind !== "role-direct"
      || closed.event.actionSource.actorRoleId !== closed.event.by || closed.event.actionSource.runId !== created.event.runId
      || canonicalJson(closed.event.actionSource) !== canonicalJson(input.source)) return invalid("This notice does not exactly match the actual closed task's original creator receipt");
    const boundRows = read.records.filter(row => row.value.taskId === input.boundTaskId), boundCreates = boundRows.filter(row => row.value.kind === "task.created"), boundCloses = boundRows.filter(row => row.value.kind === "task.closed");
    const bound = boundCreates.length === 1 ? validateTaskStateEvent(boundCreates[0]!.value) : undefined;
    const boundClosed = boundCloses.length === 1 ? validateTaskStateEvent(boundCloses[0]!.value) : undefined;
    let sourcePlanningDraft = false;
    if (bound?.ok && bound.event.kind === "task.created" && created.event.runId !== bound.event.runId
      && created.event.from === "chief" && ["product", "rapporteur"].includes(created.event.to) && created.event.runState === "draft"
      && created.event.workSourceRef && created.event.runId) {
      const ref = created.event.workSourceRef, source = await deps.store.readInitializationSource?.(ref.sourceId), run = await deps.store.readRunRecord?.(created.event.runId);
      if (source?.ok && source.value.path === ref.path && source.value.sha256 === ref.sha256.toLowerCase() && run?.ok) {
        const value: unknown = JSON.parse(Buffer.from(source.value.bytesBase64, "base64").toString("utf8"));
        const root = await readGitInitializationFacts(deps.projectRoot);
        sourcePlanningDraft = evidenceObject(value) && value.schema === "repository-work-source/v1" && value.purpose === "document-preparation"
          && value.kind === (ref.kind === "chief-creator-report" ? "creator-report" : "customer-turn") && value.sourceId === ref.sourceId
          && value.projectRoot === root.projectRoot && value.flowId === created.event.flowId && value.targetRoleId === created.event.to
          && value.planningRunId === created.event.runId && evidenceObject(value.parent) && value.parent.roleId === "chief"
          && run.value.value.state === "draft" && run.value.value.flowId === created.event.flowId && run.value.value.documentPreparationSource === ref.sourceId
          && bound.event.from === created.event.from;
        if (sourcePlanningDraft && evidenceObject(value) && value.kind === "creator-report") {
          const historical = await creatorReportSource(deps, created.event.flowId!, value.creatorReports, false);
          sourcePlanningDraft = historical.ok;
        }
        sourcePlanningDraft = sourcePlanningDraft && boundClosed?.ok === true && boundClosed.event.kind === "task.closed"
          && boundClosed.event.actionSource?.kind === "role-direct" && boundClosed.event.actionSource.action === "close-created-task"
          && boundClosed.event.actionSource.operationId === boundClosed.event.operationId && boundClosed.event.actionSource.actorRoleId === bound.event.from
          && boundClosed.event.actionSource.runId === bound.event.runId;
      }
    }
    if (!bound?.ok || bound.event.kind !== "task.created" || bound.event.to !== input.recipientRoleId
      || !boundClosed?.ok || boundClosed.event.kind !== "task.closed" || boundClosed.event.by !== bound.event.from
      || !["chief", "convener", closed.event.by].includes(input.recipientRoleId)
      || bound.event.flowId !== created.event.flowId || (bound.event.runId !== created.event.runId && !sourcePlanningDraft)
      || (sourceTaskId !== input.boundTaskId && (!created.event.flowId || !created.event.runId)))
      return invalid("The actual recipient assignment and source fact do not share the same original project flow/run");
    if (!await ownsVersionLock(deps.projectRoot, release.token)) return invalid("The actual ledger read boundary changed");
    return { ok: true, value: { kind: "information-only", taskId: sourceTaskId, recipientRoleId: input.recipientRoleId, operationId: input.operationId } };
  } catch (error) { return invalid(String(error)); } finally { await release(); }
}

export async function resolveDeliveryAssignment(deps: TrunkServiceDeps, input: import("../abstract/trunk-service.ts").DeliveryAssignmentInput): Promise<import("../abstract/trunk-service.ts").DeliveryAssignmentResult> {
  const invalid = (code: string, message: string) => ({ ok: false as const, code, message });
  const opaque = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 1024 && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
  if (!opaque(input.recipientRoleId) || !input.source || !["assigned-task", "child-report"].includes(input.source.kind)
    || input.expectedFlowId !== undefined && !opaque(input.expectedFlowId) || input.expectedRunId !== undefined && !opaque(input.expectedRunId))
    return invalid("delivery-assignment-input-invalid", "An exact host delivery source and recipient are required");
  const release = await acquireVersionLock(deps.projectRoot);
  try {
    const read = await readOperationEvents(deps.projectRoot); if (!read.ok) return invalid("delivery-assignment-ledger-unavailable", read.reason);
    const rows: TaskStateEvent[] = [];
    for (const row of read.records) { const event = validateTaskStateEvent(row.value); if (!event.ok) return invalid("delivery-assignment-ledger-invalid", event.message); rows.push(event.event); }
    const creation = (id: string) => { const found = rows.filter(event => event.kind === "task.created" && event.taskId === id); return found.length === 1 && found[0]?.kind === "task.created" ? found[0] : undefined; };
    let taskId: string;
    if (input.source.kind === "assigned-task") {
      if (!opaque(input.source.taskId)) return invalid("delivery-assignment-input-invalid", "The original assigned task ID is required");
      taskId = input.source.taskId;
    } else {
      if (!opaque(input.source.childTaskId) || !opaque(input.source.childRoleId)) return invalid("delivery-assignment-input-invalid", "The actual reported child and its role are required");
      const childTaskId = input.source.childTaskId, child = creation(childTaskId), childRoleId = input.source.childRoleId;
      const report = rows.filter(event => event.kind === "task.reported" && event.taskId === childTaskId).at(-1);
      if (!child || child.from !== input.recipientRoleId || child.to !== childRoleId || !isTaskParentRef(child.parentTaskRef)
        || report?.kind !== "task.reported" || report.from !== childRoleId) return invalid("delivery-child-source-invalid", "The persisted child report does not belong to this original creator");
      taskId = child.parentTaskRef.taskId;
      const parent = creation(taskId);
      if (!parent || child.flowId !== parent.flowId || child.runId !== parent.runId) return invalid("delivery-child-parent-mismatch", "Child and assigned parent must bind the same actual flow and run");
    }
    const task = creation(taskId);
    if (!task || task.to !== input.recipientRoleId || !opaque(task.flowId) || rows.some(event => event.kind === "task.closed" && event.taskId === taskId))
      return invalid("delivery-assignment-unavailable", "The exact recipient assignment is absent, closed or belongs to another role");
    if (input.expectedFlowId !== undefined && task.flowId !== input.expectedFlowId || input.expectedRunId !== undefined && task.runId !== input.expectedRunId)
      return invalid("delivery-assignment-basis-mismatch", "The actual assigned flow or run differs from the host delivery");
    if (task.runId !== undefined) {
      const run = await deps.store.readRunRecord?.(task.runId);
      if (!run?.ok || run.value.value.flowId !== task.flowId || !["draft", "pinned"].includes(String(run.value.value.state)))
        return invalid("delivery-assignment-run-unavailable", "The actual assigned run is missing, corrupt or cancelled");
    }
    if (!await ownsVersionLock(deps.projectRoot, release.token)) return invalid("delivery-assignment-fence-lost", "The assignment read boundary changed");
    return { ok: true, value: { taskId, actorRoleId: input.recipientRoleId, flowId: task.flowId, ...(task.runId !== undefined ? { runId: task.runId } : {}) } };
  } catch (error) { return invalid("delivery-assignment-read-failed", String(error)); } finally { await release(); }
}

/** References are issued from actual ledger bytes, never a model's report summary or approval word. */
async function creatorReportSource(deps: TrunkServiceDeps, flowId: string, refs: unknown, latest: boolean, reportContextOnly = false): Promise<TrunkServiceResult<{ reports: Array<{ taskId: string; roleId: string; reportId: string; turnId: string; reportSha256: string }>; ledgerDigest: string }>> {
  const invalid = (message: string) => fail<{ reports: Array<{ taskId: string; roleId: string; reportId: string; turnId: string; reportSha256: string }>; ledgerDigest: string }>("trunk-item-invalid", message);
  if (!Array.isArray(refs) || !refs.length || refs.length > 16) return invalid("Actual bounded creator report references are required");
  const ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return invalid(ledger.reason);
  const reports: Array<{ taskId: string; roleId: string; reportId: string; turnId: string; reportSha256: string }> = [], seen = new Set<string>();
  for (const ref of refs) {
    if (!evidenceObject(ref) || [ref.taskId, ref.roleId, ref.reportId, ref.turnId].some(value => typeof value !== "string" || !value.trim() || value.length > 1024 || /[\x00-\x1f\x7f]/.test(value))
      || typeof ref.taskId !== "string" || typeof ref.roleId !== "string" || typeof ref.reportId !== "string" || typeof ref.turnId !== "string" || seen.has(ref.taskId)) return invalid("Creator report identity is invalid");
    seen.add(ref.taskId);
    const rows = ledger.records.filter(row => row.value.taskId === ref.taskId), creates = rows.filter(row => row.value.kind === "task.created");
    const created = creates.length === 1 ? validateTaskStateEvent(creates[0]!.value) : undefined;
    const candidates = rows.filter(row => row.value.kind === "task.reported");
    const report = latest ? candidates.at(-1) : candidates.find(row => row.value.turnId === ref.turnId && directHashBytes(row.raw) === ref.reportSha256);
    const checked = report ? validateTaskStateEvent(report.value) : undefined;
    if (!created?.ok || created.event.kind !== "task.created" || created.event.from !== "chief" || created.event.to !== ref.roleId || created.event.flowId !== flowId
      || !checked?.ok || checked.event.kind !== "task.reported" || checked.event.from !== ref.roleId || checked.event.turnId !== ref.turnId || !(reportContextOnly ? ["done", "blocked", "failed"] : ["done", "blocked"]).includes(checked.event.status)
      || !report || (ref.reportSha256 !== undefined && ref.reportSha256 !== directHashBytes(report.raw))) return invalid("The actual chief-created same-flow child/latest report differs from this handback source");
    reports.push({ taskId: ref.taskId, roleId: ref.roleId, reportId: ref.reportId, turnId: ref.turnId, reportSha256: directHashBytes(report.raw) });
  }
  return { ok: true, value: { reports, ledgerDigest: directHashBytes(JSON.stringify(ledger.records.map(row => row.value))) } };
}

type RestartExecutionSelection = {
  oldRunId: string; oldSha256: string; operationId: string; requesterTaskId: string; reportSha256: string;
  replacementRunId: string; replacementSha256: string; receiptDigest: string; targetTrunk: { version: number; digest: string }; targetActive: { revision: number; digest: string };
};
/** A current real mode report selects its own committed replacement, never a latest run or model-supplied run id. */
async function readRestartExecutionSelection(deps: TrunkServiceDeps, flowId: string, reports: readonly { taskId: string; roleId: string; turnId: string; reportSha256: string }[], requireCurrentTarget = true): Promise<TrunkServiceResult<{ selection?: RestartExecutionSelection; expectedFiles: { path: string; sha256: string }[] }>> {
  const invalid = (message: string) => fail<{ selection?: RestartExecutionSelection; expectedFiles: { path: string; sha256: string }[] }>("trunk-verify-failed", message);
  const rapporteurs = reports.filter(report => report.roleId === "rapporteur");
  if (!rapporteurs.length) return { ok: true, value: { expectedFiles: [] } };
  if (!deps.store.listRunRecords || !deps.store.readRunRecord) return invalid("Actual run-change history storage is unavailable");
  const records = await deps.store.listRunRecords(), ledger = await readOperationEvents(deps.projectRoot);
  if (!records.ok || !ledger.ok) return invalid("Actual run-change/task history is unavailable");
  const selected: Array<{ selection: RestartExecutionSelection; expectedFiles: { path: string; sha256: string }[] }> = [];
  for (const candidate of records.value) {
    if (candidate.flowId !== flowId || candidate.state !== "pinned" || !evidenceObject(candidate.runChangeSource)) continue;
    const source = candidate.runChangeSource, report = rapporteurs.find(report => report.taskId === source.requesterTaskId);
    if (!report) continue;
    if (typeof source.oldRunId !== "string" || typeof candidate.runId !== "string" || typeof candidate.runChangeOperationId !== "string") return invalid("Replacement has an incomplete original run-change source");
    const old = await deps.store.readRunRecord(source.oldRunId), replacement = await readRunEvidence(deps, candidate.runId);
    if (!old.ok || old.value.value.state !== "cancelled" || old.value.value.flowId !== flowId || !replacement.ok || replacement.value.flowId !== flowId)
      return invalid("Reported restart lacks the real stopped-old and complete pinned replacement");
    if (requireCurrentTarget && ledger.records.some(row => row.value.kind === "task.created" && row.value.from === "chief" && row.value.to === "convener" && row.value.runId === candidate.runId))
      return invalid("This actual replacement already has its controller assignment; replay does not reopen execution");
    const rows = old.value.value.directRunChanges;
    if (!Array.isArray(rows)) return invalid("Reported restart has no original committed transition");
    const matching = rows.filter(row => evidenceObject(row) && evidenceObject(row.receipt) && row.receipt.operationId === candidate.runChangeOperationId);
    if (matching.length !== 1 || !evidenceObject(matching[0])) return invalid("Reported restart operation is absent or ambiguous");
    const row = matching[0], receipt = row.receipt;
    const active = replacement.value.run.activeBasis;
    if (!evidenceObject(active) || !Number.isSafeInteger(active.revision) || typeof active.revision !== "number" || active.revision < 1
      || typeof active.digest !== "string" || !/^[a-f0-9]{64}$/i.test(active.digest)) return invalid("Replacement has no complete original Active basis");
    if (!isDirectActionReceipt(receipt) || receipt.ok !== true || receipt.status !== "applied" || receipt.source?.kind !== "role-direct"
      || receipt.source.action !== "select-run-change" || receipt.source.actorRoleId !== "rapporteur" || receipt.source.runId !== source.oldRunId
      || receipt.source.operationId !== candidate.runChangeOperationId || receipt.operationId !== candidate.runChangeOperationId
      || !("replacementRunId" in receipt) || receipt.replacementRunId !== candidate.runId || receipt.baseDigest !== old.value.value.pinDigest
      || receipt.journalId !== `.ans/runs/${source.oldRunId}/manifest.json#directRunChanges/${candidate.runChangeOperationId}`
      || row.mode !== "stop-and-restart" || row.replacementRunId !== candidate.runId || !evidenceObject(row.targetTrunk)
      || !Number.isSafeInteger(row.targetTrunk.version) || typeof row.targetTrunk.version !== "number" || row.targetTrunk.version < 1
      || typeof row.targetTrunk.digest !== "string" || !/^[a-f0-9]{64}$/i.test(row.targetTrunk.digest)
      || canonicalJson(replacement.value.run.documentCommit) !== canonicalJson(row.targetTrunk)) return invalid("Reported replacement differs from its actual applied mode/target/source");
    const requesterRows = ledger.records.filter(item => item.value.taskId === report.taskId), creates = requesterRows.filter(item => item.value.kind === "task.created");
    const created = creates.length === 1 ? validateTaskStateEvent(creates[0]!.value) : undefined;
    const actualReport = requesterRows.filter(item => item.value.kind === "task.reported" && item.value.turnId === report.turnId && directHashBytes(item.raw) === report.reportSha256);
    if (!created?.ok || created.event.kind !== "task.created" || created.event.from !== "chief" || created.event.to !== "rapporteur" || created.event.flowId !== flowId
      || directHashBytes(JSON.stringify(created.event)) !== source.requesterDigest || actualReport.length !== 1 || actualReport[0]!.value.status !== "done"
      || typeof actualReport[0]!.value.at !== "string" || Date.parse(actualReport[0]!.value.at) < Date.parse(receipt.source.at))
      return invalid("Restart selection is not the original requester's actual completed report");
    const current = requireCurrentTarget ? await deps.store.readManifest() : undefined;
    if (current && (!current.ok || current.value.flowId !== flowId || current.value.trunkVersion !== row.targetTrunk.version || current.value.digest !== row.targetTrunk.digest
      || canonicalJson(replacement.value.run.activeBasis) !== canonicalJson({ revision: current.value.activeRevision, digest: current.value.activeDigest }))
      ) return invalid("Reported restart target/current authority changed before its execution dispatch");
    selected.push({ selection: { oldRunId: source.oldRunId, oldSha256: old.value.sha256, operationId: candidate.runChangeOperationId,
      requesterTaskId: report.taskId, reportSha256: report.reportSha256, replacementRunId: candidate.runId, replacementSha256: replacement.value.recordSha256,
      receiptDigest: directHash(receipt), targetTrunk: { version: row.targetTrunk.version, digest: row.targetTrunk.digest }, targetActive: { revision: active.revision, digest: active.digest } },
      expectedFiles: [{ path: `.ans/runs/${source.oldRunId}/manifest.json`, sha256: old.value.sha256 }, { path: `.ans/runs/${candidate.runId}/manifest.json`, sha256: replacement.value.recordSha256 }] });
  }
  if (selected.length > 1) return invalid("The current report identifies multiple applied replacement executions");
  return { ok: true, value: selected[0] ?? { expectedFiles: [] } };
}

async function verifyRestartExecutionSource(deps: TrunkServiceDeps, source: Record<string, unknown>, runId: string, flowId: string): Promise<TrunkServiceResult<{ expectedFiles: { path: string; sha256: string }[]; selection?: RestartExecutionSelection }>> {
  if (source.executionRunSelection === undefined) return { ok: true as const, value: { expectedFiles: [] as { path: string; sha256: string }[] } };
  if (source.kind !== "creator-report" || source.targetRoleId !== "convener" || source.planningRunId !== runId) return fail<{ expectedFiles: { path: string; sha256: string }[] }>("trunk-verify-failed", "Replacement execution source differs from its actual chief report/task");
  const creator = await creatorReportSource(deps, flowId, source.creatorReports, false, true);
  if (!creator.ok) return creator;
  const actual = await readRestartExecutionSelection(deps, flowId, creator.value.reports, false);
  if (!actual.ok || !actual.value.selection || actual.value.selection.replacementRunId !== runId || canonicalJson(actual.value.selection) !== canonicalJson(source.executionRunSelection))
    return fail<{ expectedFiles: { path: string; sha256: string }[] }>("trunk-verify-failed", actual.ok ? "Original replacement execution selection changed" : actual.message ?? actual.code);
  return { ok: true as const, value: { expectedFiles: actual.value.expectedFiles, selection: actual.value.selection } };
}

type DocumentIntentConfirmation = { path: string; version: number; sha256: string; confirmationDigest: string };
type RolePreparationPlan = { basis: import("../../../provider/trunk/public/trunk-store.ts").GitPlanCompletionBasis; closeOperationId: string; closeSha256: string };
async function rolePreparationPlan(deps: TrunkServiceDeps, flowId: string, refs?: readonly { taskId: string }[]): Promise<TrunkServiceResult<{ plan: RolePreparationPlan; ledgerDigest: string }>> {
  const invalid = (message: string) => fail<{ plan: RolePreparationPlan; ledgerDigest: string }>("trunk-verify-failed", message);
  const ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return invalid(ledger.reason);
  const plans: RolePreparationPlan[] = [];
  for (const row of ledger.records) {
    const checked = validateTaskStateEvent(row.value);
    if (!checked.ok || checked.event.kind !== "task.created") continue;
    const task = checked.event;
    if (task.from !== "chief" || task.to !== "convener" || task.flowId !== flowId || !task.runId || !task.workSourceRef
      || (refs !== undefined && !refs.some(ref => ref.taskId === task.taskId))) continue;
    const closes = ledger.records.filter(row => row.value.kind === "task.closed" && row.value.taskId === task.taskId);
    const closed = closes.length === 1 ? validateTaskStateEvent(closes[0]!.value) : undefined;
    if (!closed?.ok || closed.event.kind !== "task.closed" || closed.event.by !== "chief" || closed.event.outcome !== "accepted"
      || closed.event.actionSource?.kind !== "role-direct" || closed.event.actionSource.action !== "close-created-task"
      || closed.event.actionSource.actorRoleId !== "chief" || closed.event.actionSource.runId !== task.runId || !closed.event.operationId) continue;
    const proof = await readGitPlanCompletionBasis(deps.projectRoot, { flowId, taskId: task.taskId, runId: task.runId, sourceId: task.workSourceRef.sourceId });
    if (proof.ok && proof.value.basis.sourceSha256 === task.workSourceRef.sha256.toLowerCase()) plans.push({ basis: proof.value.basis,
      closeOperationId: closed.event.operationId, closeSha256: directHashBytes(closes[0]!.raw) });
  }
  if (plans.length !== 1) return invalid("Role preparation requires one actual same-flow team-plan task accepted by its original chief creator");
  return { ok: true, value: { plan: plans[0]!, ledgerDigest: directHashBytes(JSON.stringify(ledger.records.map(row => row.value))) } };
}
async function documentPreparationIntent(deps: TrunkServiceDeps, flowId: string, refs: unknown,
  baseline?: { manifest: TrunkManifest; snapshot: CompleteSnapshot }): Promise<TrunkServiceResult<{ intent: DocumentIntentConfirmation; ledgerDigest: string }>> {
  const invalid = (message: string) => fail<{ intent: DocumentIntentConfirmation; ledgerDigest: string }>("trunk-verify-failed", message);
  const paths = new Set<string>(), productReports = Array.isArray(refs) ? refs.filter(ref => evidenceObject(ref) && ref.roleId === "product") : [];
  const validPath = (value: unknown): value is string => typeof value === "string" && value.startsWith(`docs/product/${flowId}-intent-v`)
    && /^docs\/product\/[a-z0-9][a-z0-9-]*-intent-v[1-9]\d*\.md$/i.test(value);
  if (productReports.length) {
    const ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return invalid(ledger.reason);
    for (const ref of productReports) {
      const report = ledger.records.find(row => row.value.kind === "task.reported" && row.value.taskId === ref.taskId
        && row.value.turnId === ref.turnId && directHashBytes(row.raw) === ref.reportSha256);
      if (!report || !Array.isArray(report.value.evidence)) return invalid("The actual product handback has no exact intent material reference");
      for (const value of report.value.evidence) if (validPath(value)) paths.add(value);
    }
  } else if (baseline) {
    const ref = baseline.manifest.artifacts.documents.proposal, rosterRef = baseline.manifest.artifacts.documents.roster;
    const file = ref && baseline.snapshot.files.find(file => file.path === ref.path && file.sha256 === ref.sha256);
    const rosterFile = rosterRef && baseline.snapshot.files.find(file => file.path === rosterRef.path && file.sha256 === rosterRef.sha256);
    if (file && rosterFile) {
      const header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(Buffer.from(file.bytesBase64, "base64").toString("utf8"));
      const proposal: unknown = header ? parseYaml(header[1]!) : undefined;
      const roster = parseProjectRoster(Buffer.from(rosterFile.bytesBase64, "base64").toString("utf8"), flowId);
      if (evidenceObject(proposal) && roster.ok && proposal.intent === roster.roster.intent && validPath(proposal.intent)) paths.add(proposal.intent);
    }
  }
  if (paths.size !== 1) return invalid("Rapporteur preparation needs one exact intent from its actual product report or effective approved document source");
  const proof = await readConfirmedIntentEvidence(deps.projectRoot, [...paths][0]!);
  if (!proof.ok) return invalid(`Document preparation intent is not confirmed: ${proof.reason}`);
  const { ledgerDigest, ...intent } = proof.value;
  return { ok: true, value: { intent, ledgerDigest } };
}

export async function inspectAssignedTask(deps: TrunkServiceDeps, input: { taskId: string; actorRoleId: string }): ReturnType<import("../abstract/trunk-service.ts").DirectTrunkService["inspectAssignedTask"]> {
  const invalid = (message: string): Awaited<ReturnType<import("../abstract/trunk-service.ts").DirectTrunkService["inspectAssignedTask"]>> => ({ ok: false, code: "trunk-item-invalid", message });
  const read = await readOperationEvents(deps.projectRoot); if (!read.ok) return invalid(read.reason);
  const rows = read.records.filter(row => row.value.taskId === input.taskId), creates = rows.filter(row => row.value.kind === "task.created"), event = creates[0] ? validateTaskStateEvent(creates[0].value) : undefined;
  if (creates.length !== 1 || !event?.ok || event.event.kind !== "task.created" || event.event.to !== input.actorRoleId || !event.event.runId || !event.event.flowId
    || rows.some(row => row.value.kind === "task.closed")) return invalid("The actual assigned child task is absent, closed or belongs to another role");
  const task = event.event, run = await deps.store.readRunRecord?.(task.runId!);
  if (!run?.ok || run.value.value.flowId !== task.flowId || (run.value.value.state !== "draft" && run.value.value.state !== "pinned")) return invalid("The actual assigned run is unavailable or cancelled");
  if (task.reviewBasisRef !== undefined) {
    const review = await readAssignedReviewContext(deps, input); if (!review.ok) return invalid(review.message ?? review.code);
    return { ok: true, value: { taskId: input.taskId, actorRoleId: input.actorRoleId, flowId: task.flowId!, runId: task.runId!, kind: "review",
      basisDigest: directHash({ rows: rows.map(row => row.value), review: review.value.reviewBasisRef, runSha256: run.value.sha256 }),
      ...(task.workSourceRef ? { workSourceRef: task.workSourceRef } : {}) } };
  }
  if (task.workSourceRef) {
    const ref = task.workSourceRef, source = await deps.store.readInitializationSource?.(ref.sourceId);
    if (!source?.ok || source.value.sha256 !== ref.sha256.toLowerCase() || source.value.path !== ref.path) return invalid("Assigned work-source bytes/hash are unavailable");
    let value: unknown; try { value = JSON.parse(Buffer.from(source.value.bytesBase64, "base64").toString("utf8")); } catch { return invalid("Assigned work-source JSON is invalid"); }
    const root = await readGitProtectionFacts(deps.projectRoot);
    if (!evidenceObject(value) || value.schema !== "repository-work-source/v1" || !["customer-turn", "creator-report"].includes(String(value.kind))
      || (value.kind === "creator-report" ? ref.kind !== "chief-creator-report" : ref.kind !== "chief-customer-turn") || value.sourceId !== ref.sourceId || value.flowId !== task.flowId || value.projectRoot !== root.projectRoot)
      return invalid("Assigned work source belongs to a different flow/root");
    if (value.kind === "creator-report") { const source = await creatorReportSource(deps, task.flowId!, value.creatorReports, false, value.purpose === "builtin-preparation"); if (!source.ok) return invalid(source.message ?? source.code); }
    if (value.purpose === "builtin-preparation") {
      const execution = await verifyRestartExecutionSource(deps, value, task.runId!, task.flowId!);
      if (!execution.ok) return invalid(execution.message ?? execution.code);
      if (task.hubRouting !== "chief-hub-v1" || value.hubRouting !== task.hubRouting || task.from !== "chief"
        || !["product", "rapporteur", "nominator", "convener", "verifier"].includes(task.to) || value.targetRoleId !== task.to
        || value.planningRunId !== task.runId || (value.executionRunSelection === undefined && run.value.value.builtinPreparationSource !== ref.sourceId)) return invalid("Builtin assignment differs from its actual chief work source");
      if (run.value.value.state === "pinned" && (task.to !== "convener" || !(await readRunEvidence(deps, task.runId!)).ok)) return invalid("Builtin controller lacks its actual complete pin");
      return { ok: true, value: { taskId: input.taskId, actorRoleId: task.to, flowId: task.flowId!, runId: task.runId!, kind: value.executionRunSelection === undefined ? "planning" : "execution",
        basisDigest: directHash({ task: rows.map(row => row.value), runSha256: run.value.sha256 }), workSourceRef: ref } };
    }
    if ((value.purpose === "document-preparation" && task.to === "rapporteur") || value.purpose === "team-planning" || value.purpose === "role-preparation") {
      const selected = value.intentConfirmation;
      if (!evidenceObject(selected) || typeof selected.path !== "string") return invalid("Assigned rapporteur work lacks its confirmed intent source");
      const proof = await readConfirmedIntentEvidence(deps.projectRoot, selected.path);
      if (!proof.ok) return invalid(`Assigned rapporteur intent is unavailable: ${proof.reason}`);
      const { ledgerDigest: _ledgerDigest, ...intent } = proof.value;
      if (canonicalJson(intent) !== canonicalJson(selected)) return invalid("Assigned rapporteur intent source changed");
    }
    if (value.purpose === "role-preparation") {
      const proof = await rolePreparationPlan(deps, task.flowId!);
      if (!proof.ok || canonicalJson(proof.value.plan) !== canonicalJson(value.planCompletion)) return invalid(proof.ok ? "Assigned role preparation plan/creator receipt changed" : proof.message ?? proof.code);
    }
    if (value.purpose === "document-preparation" || value.purpose === "team-planning" || value.purpose === "role-preparation") {
      const coordinatedPin = value.purpose === "team-planning" && run.value.value.state === "pinned" ? await readRunEvidence(deps, task.runId!) : undefined;
      if (task.from !== "chief" || !(value.purpose === "role-preparation" ? task.to === "nominator" : value.purpose === "team-planning" ? task.to === "convener" : ["product", "rapporteur"].includes(task.to)) || value.targetRoleId !== task.to || value.planningRunId !== task.runId
        || task.runState !== "draft" || (run.value.value.state !== "draft" && !coordinatedPin?.ok) || run.value.value.documentPreparationSource !== ref.sourceId)
        return invalid("Assigned document preparation differs from its actual professional planning source");
    } else if (value.kind !== "customer-turn" || value.purpose !== undefined || task.from !== "chief" || task.to !== "convener") return invalid("Assigned work purpose differs from its original customer source");
  }
  const planning = ["chief", "convener", "product", "rapporteur", "nominator", "verifier"].includes(input.actorRoleId);
  let scopeDigest: string | undefined;
  if (!planning) { const scope = await prepareAssignedTaskWriteScope(deps, input); if (!scope.ok) return invalid(scope.message ?? scope.code); scopeDigest = scope.value.basisDigest; }
  return { ok: true, value: { taskId: input.taskId, actorRoleId: input.actorRoleId, flowId: task.flowId!, runId: task.runId!, kind: planning ? "planning" : "execution",
    basisDigest: directHash({ rows: rows.map(row => row.value), runSha: run.value.sha256, scopeDigest }), ...(task.workSourceRef ? { workSourceRef: task.workSourceRef } : {}) } };
}

/** Host-only parent work source: ordinary reference, backed by exact real assigned ledger rows. */
export async function prepareParentTaskRef(deps: TrunkServiceDeps, input: { actorRoleId: "convener"; taskId: string; flowId: string; runId: string }): ReturnType<import("../abstract/trunk-service.ts").DirectTrunkService["prepareParentTaskRef"]> {
  const invalid = (message: string) => ({ ok: false as const, code: "task-parent-unavailable", message });
  try {
    if (input.actorRoleId !== "convener" || !input.taskId || !input.flowId || !input.runId) return invalid("An actual assigned convener task, flow and run are required");
    const assigned = await inspectAssignedTask(deps, input);
    if (!assigned.ok || assigned.value.flowId !== input.flowId || assigned.value.runId !== input.runId) return invalid(assigned.ok ? "Parent belongs to a different flow/run" : assigned.message ?? assigned.code);
    const read = await readOperationEvents(deps.projectRoot); if (!read.ok) return invalid(read.reason);
    const rows = read.records.filter(row => row.value.taskId === input.taskId), creates = rows.filter(row => row.value.kind === "task.created");
    const checked = creates.length === 1 ? validateTaskStateEvent(creates[0]!.value) : undefined;
    if (!checked?.ok || checked.event.kind !== "task.created" || checked.event.to !== "convener" || checked.event.flowId !== input.flowId
      || checked.event.runId !== input.runId || rows.some(row => row.value.kind === "task.closed")) return invalid("The parent is not the actual open same-flow/run convener assignment");
    for (const row of rows) if (!validateTaskStateEvent(row.value).ok) return invalid("The parent task ledger contains invalid events");
    const parentTaskRef = { kind: "assigned-task", taskId: input.taskId, ledgerSha256: directHashBytes(JSON.stringify(rows.map(row => row.value))) };
    if (!isTaskParentRef(parentTaskRef)) return invalid("Historical parent identity cannot form a valid assigned-task reference");
    return { ok: true, parentTaskRef };
  } catch (error) { return invalid(String(error)); }
}

export async function prepareAssignedTaskWriteScope(deps: TrunkServiceDeps, input: { taskId: string; actorRoleId: string }): Promise<TrunkServiceResult<{ taskId: string; runId: string; basisDigest: string; paths: string[] }>> {
  const invalid = (message: string) => fail<{ taskId: string; runId: string; basisDigest: string; paths: string[] }>("trunk-item-invalid", message);
  const read = await readOperationEvents(deps.projectRoot); if (!read.ok) return invalid(read.reason);
  const rows = read.records.filter(row => row.value.taskId === input.taskId), creations = rows.filter(row => row.value.kind === "task.created"), raw = creations[0]?.value;
  const checked = raw ? validateTaskStateEvent(raw) : undefined;
  if (creations.length !== 1 || !checked?.ok || checked.event.kind !== "task.created" || checked.event.to !== input.actorRoleId || !checked.event.runId || !checked.event.flowId
    || rows.some(row => row.value.kind === "task.closed")) return invalid("No actual open assigned execution task");
  const task = checked.event, dispatch = await prepareRoleDispatch(deps, { fromRoleId: task.from, targetRoleId: task.to, flowId: task.flowId!, runId: task.runId, moduleId: task.moduleId });
  if (!dispatch.ok || dispatch.value.kind !== "execution" || !dispatch.value.modulePaths?.length) return invalid(dispatch.ok ? "Task is not executable" : dispatch.message);
  const current = await deps.store.readManifest(), active = current.ok ? current.value.activeRoles?.[input.actorRoleId] : undefined;
  if (!current.ok || !active || !deps.store.readActiveRoleEvidence) return invalid("Current activated authorization is unavailable");
  const bytes = await deps.store.readActiveRoleEvidence(active); if (!bytes.ok) return invalid(bytes.message ?? bytes.reason);
  const file = bytes.value.files.find(file => file.path === active.authorizationRef.path && file.sha256 === active.authorizationRef.sha256);
  let auth: unknown; try { auth = file ? JSON.parse(Buffer.from(file.bytesBase64, "base64").toString("utf8")) : undefined; } catch { return invalid("Current authorization is invalid"); }
  if (!evidenceObject(auth) || auth.schema !== "role-authorization/v1" || auth.roleId !== input.actorRoleId || auth.flowId !== task.flowId || !Array.isArray(auth.writesets)
    || auth.writesets.some(path => typeof path !== "string")) return invalid("Current authorization does not bind the actual role/flow");
  const within = (path: string, root: string) => path === root || (root.endsWith("/") && path.startsWith(root));
  const paths = new Set<string>();
  for (const pinned of dispatch.value.modulePaths) for (const grant of auth.writesets as string[]) {
    if (within(pinned, grant)) paths.add(pinned); else if (within(grant, pinned)) paths.add(grant);
  }
  if (!paths.size) return invalid("Current authorization no longer intersects this task's frozen module");
  return { ok: true, value: { taskId: input.taskId, runId: task.runId!, paths: [...paths].sort(),
    basisDigest: directHash({ pin: dispatch.value.basisDigest, task: rows.map(row => row.value), currentActive: [current.value.activeRevision, current.value.activeDigest], paths: [...paths].sort() }) } };
}

export async function prepareCreatedTaskClose(deps: TrunkServiceDeps, taskId: string, actor: string): Promise<TrunkServiceResult<CreatedTaskCloseBasis>> {
  const invalid = (message: string) => fail<CreatedTaskCloseBasis>("trunk-item-invalid", message);
  const { store } = deps;
  if ((actor !== "chief" && actor !== "convener") || !taskId || !store.prepareSnapshot || !store.readProjectFile) return invalid("A real task creator and complete storage are required");
  try {
    const read = await readOperationEvents(deps.projectRoot); if (!read.ok) return invalid(read.reason);
    const rows = read.records.filter(row => row.value.taskId === taskId);
    const events: Array<{ raw: string; event: import("../../../model/runtime.ts").TaskStateEvent }> = [];
    for (const row of rows) { const checked = validateTaskStateEvent(row.value); if (!checked.ok) return invalid(checked.message); events.push({ raw: row.raw, event: checked.event }); }
    const creations = events.filter(row => row.event.kind === "task.created");
    const created = creations[0];
    if (creations.length !== 1 || created?.event.kind !== "task.created" || created.event.from !== actor || !created.event.runId
      || events.some(row => row.event.kind === "task.closed")) return invalid("Task is not an open task created by this actual actor");
    const last = events.filter(row => row.event.kind === "task.reported").at(-1);
    if (last?.event.kind !== "task.reported" || last.event.from !== created.event.to) return invalid("No current report from the actual assigned role");
    const record = await store.readRunRecord?.(created.event.runId);
    if (!record?.ok || record.value.value.schema !== "ans-run/v1" || record.value.value.runId !== created.event.runId
      || !created.event.flowId || record.value.value.flowId !== created.event.flowId) return invalid("A real same-flow run is required");
    const materialFiles: Array<CompleteSnapshot["files"][number]> = [];
    let basisDigest: string;
    let initializationCommit: CreatedTaskCloseBasis["initializationCommit"];
    let reviewCommit: CreatedTaskCloseBasis["reviewCommit"], deliveryCommit: CreatedTaskCloseBasis["deliveryCommit"], acceptanceBlock: string | undefined, acceptanceMessage: string | undefined, relatedLedgerDigest: string | undefined;
    let stableCommit: CreatedTaskCloseBasis["stableCommit"];
    let planCommit: CreatedTaskCloseBasis["planCommit"];
    let reportOnly: true | undefined;
    let activationCommit: CreatedTaskCloseBasis["activationCommit"], completionLiveFiles: readonly { path: string; sha256: string }[] | undefined;
    if (record.value.value.state === "draft") {
      if (created.event.runState !== "draft" || !["chief", "convener", "product", "rapporteur", "nominator", "verifier"].includes(created.event.to))
        return invalid("Only actual built-in planning tasks may close against draft material");
      let workPurpose: unknown;
      if (created.event.workSourceRef) {
        const source = await store.readInitializationSource?.(created.event.workSourceRef.sourceId);
        if (!source?.ok || source.value.sha256 !== created.event.workSourceRef.sha256.toLowerCase()) return invalid("Task work-source bytes changed before close");
        const body: unknown = JSON.parse(Buffer.from(source.value.bytesBase64, "base64").toString("utf8"));
        if (!evidenceObject(body)) return invalid("Task work-source JSON is invalid"); workPurpose = body.purpose;
        if (created.event.from === "chief" && created.event.to === "convener" && workPurpose !== undefined && workPurpose !== "team-planning" && workPurpose !== "builtin-preparation")
          return invalid("This convener source has no supported initialization or team-planning completion purpose");
      }
      const hubReport = created.event.hubRouting === "chief-hub-v1" && workPurpose === "builtin-preparation";
      const hubInitialization = hubReport && created.event.to === "convener" ? await readGitInitializationTaskBasis(deps.projectRoot,
        { taskId, runId: created.event.runId, flowId: created.event.flowId, sourceId: created.event.workSourceRef!.sourceId }) : undefined;
      const hubPlan = hubReport && created.event.to === "convener" ? await readGitPlanCompletionBasis(deps.projectRoot,
        { taskId, runId: created.event.runId, flowId: created.event.flowId, sourceId: created.event.workSourceRef!.sourceId }) : undefined;
      const active = hubReport && created.event.to === "nominator" ? await store.readManifest() : undefined;
      const hubActivation = active?.ok && Object.values(active.value.activeRoles ?? {}).some(role => [role.cardRef, role.boundaryMdRef, role.boundaryYamlRef].every(ref => (last.event.kind === "task.reported" ? last.event.evidence ?? [] : []).includes(ref.path)));
      if (created.event.workSourceRef && created.event.from === "chief" && created.event.to === "convener" && (workPurpose === "team-planning" || hubPlan?.ok)
        && !(last.event.evidence ?? []).includes("docs/workflow.md")) {
        const assigned = await inspectAssignedTask(deps, { taskId, actorRoleId: "convener" });
        if (!assigned.ok) return invalid(assigned.message ?? assigned.code);
        const proof = await readGitPlanCompletionBasis(deps.projectRoot, { taskId, runId: created.event.runId, flowId: created.event.flowId, sourceId: created.event.workSourceRef.sourceId });
        if (!proof.ok || proof.value.basis.sourceSha256 !== created.event.workSourceRef.sha256.toLowerCase()) return invalid(proof.ok ? "Plan work-source differs" : proof.message ?? proof.reason);
        if (!(last.event.evidence ?? []).includes(proof.value.basis.plan.path)) return invalid("The actual latest plan report must reference its published plan");
        if ((last.event.evidence ?? []).some(path => path.startsWith("docs/") && path !== proof.value.basis.plan.path)) return invalid("A typed plan completion cannot certify unrelated document outputs");
        planCommit = proof.value.basis; completionLiveFiles = proof.value.liveFiles; materialFiles.push(...proof.value.files);
        basisDigest = directHash({ kind: "team-plan-completion", planCommit, runSha256: record.value.sha256, materials: materialFiles.map(({ path, sha256 }) => ({ path, sha256 })) });
      } else if (created.event.workSourceRef && created.event.from === "chief" && created.event.to === "convener" && (workPurpose === undefined || hubInitialization?.ok)) {
        const initialized = await readGitInitializationTaskBasis(deps.projectRoot, { taskId, runId: created.event.runId, flowId: created.event.flowId, sourceId: created.event.workSourceRef.sourceId });
        if (!initialized.ok || initialized.value.sourceSha256 !== created.event.workSourceRef.sha256.toLowerCase()) return invalid("Actual same-task initialization output is unavailable or differs from the true work source");
        const { files, ...binding } = initialized.value; initializationCommit = binding; materialFiles.push(...files);
        basisDigest = directHash({ kind: "initialization-task-output", initializationCommit, runSha256: record.value.sha256,
          materials: materialFiles.map(({ path, sha256 }) => ({ path, sha256 })) });
      } else if (created.event.to === "convener" && (last.event.evidence ?? []).includes("docs/workflow.md")) {
        if ((last.event.evidence ?? []).some(path => path.startsWith("docs/") && path !== "docs/workflow.md")) return invalid("A typed workflow completion cannot certify other document outputs");
        const operations = await store.listOperationRecords?.(); if (!operations?.ok) return invalid("Actual stable publication history is unavailable");
        const candidates: Array<{ journal: TrunkApplyJournal; source: import("../../../provider/trunk/public/trunk-store.ts").GitInitialWorkflowSource; meta: Record<string, unknown> }> = [];
        for (const journal of operations.value) {
          let meta: unknown; try { meta = journal.message ? JSON.parse(journal.message) : undefined; } catch { continue; }
          if (evidenceObject(meta) && meta.schema === "stable-initial-workflow/v1" && isInitialWorkflowSource(meta.source)
            && meta.source.flowId === created.event.flowId && meta.source.taskId === taskId && meta.source.runId === created.event.runId)
            candidates.push({ journal, source: meta.source, meta });
        }
        if (candidates.length !== 1) return invalid("One actual same-task published stable workflow source is required; report text cannot create it");
        const { journal, source, meta } = candidates[0]!;
        if (journal.operationId !== source.operationId || journal.applicationId !== `stable:${source.requestId}` || journal.actionSource !== undefined)
          return invalid("Stable completion operation differs from its original actual source");
        const records = (await createStableWriteStore(deps.projectRoot).list()).filter(value => value.requestId === source.requestId);
        const permits = (await createStableWritePermitStore(deps.projectRoot).list()).filter(value => value.permitId === source.permitId);
        const written = records[0], permit = permits[0];
        if (records.length !== 1 || permits.length !== 1 || !written || !permit || written.kind !== "workflow" || written.roleId !== "convener"
          || written.status !== "written" || !written.writtenAt || !written.consumedAt || written.baseSha256 !== "" || written.path !== source.path
          || written.targetSha256 !== source.targetSha256 || written.permitId !== source.permitId || permit.requestId !== source.requestId
          || permit.kind !== "workflow" || permit.roleId !== "convener" || permit.path !== source.path || permit.baseSha256 !== ""
          || permit.status !== "consumed" || !permit.consumedAt || permit.targetSha256 !== source.targetSha256
          || written.decisionId !== permit.authority.decisionId || written.confirmationId !== permit.authority.confirmationId
          || canonicalJson(source.authority) !== canonicalJson(permit.authority) || canonicalJson(written) !== canonicalJson(meta.record)
          || canonicalJson(permit) !== canonicalJson(meta.permit)) return invalid("Actual written workflow and consumed approval do not match the published same-task source");
        const proof = await readGitStableCompletionBasis(deps.projectRoot, { operationId: source.operationId, flowId: created.event.flowId, taskId, runId: created.event.runId });
        if (!proof.ok || canonicalJson(proof.value.businessJournal) !== canonicalJson(journal)) return invalid(proof.ok ? "Stable journal changed while preparing the report" : proof.message ?? proof.reason);
        for (const [path, selected, key] of [[STABLE_WRITES_REL, written, "requestId"], [STABLE_WRITE_PERMITS_REL, permit, "permitId"]] as const) {
          const file = proof.value.publishedSnapshot.files.find(file => file.path === path);
          const values: unknown = file ? JSON.parse(Buffer.from(file.bytesBase64, "base64").toString("utf8")) : undefined;
          if (!Array.isArray(values) || values.filter(value => evidenceObject(value) && value[key] === selected[key]).length !== 1
            || !values.some(value => canonicalJson(value) === canonicalJson(selected))) return invalid("The approved stable record is absent from the actual published snapshot");
        }
        const workflow = proof.value.files.find(file => file.path === source.path);
        if (!workflow || secretEvidence(source.path, Buffer.from(workflow.bytesBase64, "base64").toString("utf8"))) return invalid("Stable completion evidence is unavailable or contains secret material");
        stableCommit = proof.value.basis; completionLiveFiles = proof.value.liveFiles; materialFiles.push(...proof.value.files);
        basisDigest = directHash({ kind: "stable-workflow-completion", stableCommit, runSha256: record.value.sha256,
          materials: materialFiles.map(({ path, sha256 }) => ({ path, sha256 })) });
      } else if (created.event.from === "chief" && created.event.to === "nominator" && (!hubReport || hubActivation) && (last.event.evidence ?? []).some(path => path.startsWith("角色卡/"))) {
        const current = await store.readManifest();
        if (!current.ok || current.value.flowId !== created.event.flowId || !current.value.activeRoles) return invalid("No actual active role completion exists for the nominator report");
        const reported = new Set(last.event.evidence ?? []), selected = Object.values(current.value.activeRoles).filter(role =>
          [role.cardRef, role.boundaryMdRef, role.boundaryYamlRef].every(ref => reported.has(ref.path)));
        if (!selected.length || selected.length > 16 || [...reported].filter(path => path.startsWith("角色卡/")).some(path => !selected.some(role => [role.cardRef.path, role.boundaryMdRef.path, role.boundaryYamlRef.path].includes(path))))
          return invalid("The report must name the complete canonical three documents of real current active roles");
        const draftScope = await prepareRoleDraftScope(deps, { flowId: created.event.flowId, taskId });
        if (!draftScope.ok) return invalid(draftScope.message ?? draftScope.code);
        const targets: Array<{ roleId: string; operationId: string }> = [];
        for (const role of selected) {
          const bytes = await store.readActiveRoleEvidence?.(role); if (!bytes?.ok) return invalid("The active role's eight-ref immutable bytes are unavailable");
          const activationFile = bytes.value.files.find(file => file.path === role.activationRef.path && file.sha256 === role.activationRef.sha256);
          const activation: unknown = activationFile ? JSON.parse(Buffer.from(activationFile.bytesBase64, "base64").toString("utf8")) : undefined;
          const authFile = bytes.value.files.find(file => file.path === role.authorizationRef.path && file.sha256 === role.authorizationRef.sha256);
          const auth: unknown = authFile ? JSON.parse(Buffer.from(authFile.bytesBase64, "base64").toString("utf8")) : undefined;
          if (!evidenceObject(activation) || activation.schema !== "role-activation/v1" || activation.actorRoleId !== "nominator" || !evidenceObject(activation.input)
            || typeof activation.input.operationId !== "string" || activation.input.flowId !== created.event.flowId || activation.input.targetRoleId !== role.roleId
            || !evidenceObject(auth) || auth.schema !== "role-authorization/v1" || auth.d3RequestId !== draftScope.value.d3RequestId
            || current.value.artifacts.execution.teamPlan?.path !== role.planRef.path || current.value.artifacts.execution.teamPlan.sha256 !== role.planRef.sha256
            || current.value.artifacts.documents.roster?.path !== role.rosterRef.path || current.value.artifacts.documents.roster.sha256 !== role.rosterRef.sha256
            || ![role.cardRef.path, role.boundaryMdRef.path, role.boundaryYamlRef.path].every(path => draftScope.value.paths.includes(path)))
            return invalid("Active completion does not bind this task's applicable plan/roster and current real D3 selection");
          targets.push({ roleId: role.roleId, operationId: activation.input.operationId });
        }
        const proof = await readGitActiveCompletionBasis(deps.projectRoot, { flowId: created.event.flowId, roles: targets });
        if (!proof.ok) return invalid(proof.message ?? proof.reason);
        activationCommit = proof.value.basis; completionLiveFiles = proof.value.liveFiles; materialFiles.push(...proof.value.files);
        basisDigest = directHash({ kind: "current-active-completion", activationCommit, runSha256: record.value.sha256,
          materials: materialFiles.map(({ path, sha256 }) => ({ path, sha256 })) });
      } else if (hubReport && !created.event.reviewBasisRef && !created.event.reviewControllerRef) {
        const assigned = await inspectAssignedTask(deps, { taskId, actorRoleId: created.event.to }); if (!assigned.ok) return invalid(assigned.message ?? assigned.code);
        if (created.event.to === "convener") {
          const worker = read.records.some(row => row.value.kind === "task.created" && row.value.from === "convener"
            && evidenceObject(row.value.parentTaskRef) && row.value.parentTaskRef.taskId === taskId);
          const operation = (await createGitRefStore(deps.projectRoot).listJournals()).some(row => row.phase !== "business-prepared" && (row.candidateSource?.taskId === taskId || row.deliverySource?.taskId === taskId));
          if (worker || operation || record.value.value.pinDigest !== undefined || record.value.value.frozenRoles !== undefined)
            return invalid("An actual execution controller cannot close as preparation; its worker/quality/delivery and stop evidence remain required");
        }
        const source = await store.readInitializationSource?.(created.event.workSourceRef!.sourceId);
        if (!source?.ok || source.value.sha256 !== created.event.workSourceRef!.sha256.toLowerCase()) return invalid("Preparation source bytes changed");
        materialFiles.push({ path: source.value.path, sha256: source.value.sha256, bytesBase64: source.value.bytesBase64 });
        const refs = [...new Set(last.event.evidence ?? [])]; if (refs.length > 32) return invalid("Preparation report references exceed the bounded read budget");
        let total = 0;
        for (const path of refs) {
          if (!isGitLiteralPath(path) || path.split("/").some(part => /^(?:\.ans|\.git|\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|\.netrc)$/i.test(part))) return invalid("Preparation report reference is outside readable project material");
          const file = await store.readProjectFile(path, { maxBytes: DECISION_FILE_LIMIT });
          if (!file.ok || secretEvidence(path, Buffer.from(file.value.bytesBase64, "base64").toString("utf8"))) return invalid("Preparation report material is missing or protected");
          total += Buffer.from(file.value.bytesBase64, "base64").length; if (total > DECISION_TOTAL_LIMIT) return invalid("Preparation report exceeds the material byte budget");
          materialFiles.push({ path, ...file.value });
        }
        reportOnly = true; relatedLedgerDigest = directHashBytes(JSON.stringify(read.records.map(row => row.value)));
        acceptanceMessage = "Preparation report evidence only; this closure certifies no publication, activation, execution, or final quality result";
        basisDigest = directHash({ kind: "hub-report-only", taskId, source: created.event.workSourceRef, report: last.raw, runSha256: record.value.sha256,
          materials: materialFiles.map(({ path, sha256 }) => ({ path, sha256 })) });
      } else {
      const refs = new Map<string, string | undefined>();
      const documents = record.value.value.documents;
      if (evidenceObject(documents)) for (const ref of Object.values(documents)) {
        if (evidenceObject(ref) && typeof ref.path === "string") refs.set(ref.path, typeof ref.sha256 === "string" ? ref.sha256 : undefined);
      }
      // A report's textual claim grants nothing: resolve only explicit relative planning paths,
      // then verify their actual frontmatter flow and bytes. Never discover latest live documents.
      for (const ref of last.event.evidence ?? []) if (/^docs\/[A-Za-z0-9_./-]+\.md$/.test(ref)) refs.set(ref, refs.get(ref));
      if (!refs.size || refs.size > 32) return invalid("Draft report has no bounded actual planning material references");
      let total = 0;
      for (const [path, expectedSha] of [...refs].sort(([a], [b]) => a.localeCompare(b))) {
        if (!/^docs\/[A-Za-z0-9_/-]+\.md$/.test(path) || path.split("/").includes("..")) return invalid("Invalid planning material path");
        const bytes = await store.readProjectFile(path, { maxBytes: DECISION_FILE_LIMIT });
        if (!bytes.ok || (expectedSha !== undefined && bytes.value.sha256 !== expectedSha)) return invalid("Draft material bytes differ from the actual run reference");
        const text = Buffer.from(bytes.value.bytesBase64, "base64").toString("utf8");
        const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
        const metadata: unknown = frontmatter ? parseYaml(frontmatter[1]!) : undefined;
        if (secretEvidence(path, text) || !evidenceObject(metadata) || metadata.flowId !== created.event.flowId)
          return invalid("Planning evidence is secret or does not bind the task's actual flow");
        total += Buffer.from(bytes.value.bytesBase64, "base64").length;
        if (total > DECISION_TOTAL_LIMIT) return invalid("Draft planning evidence exceeds the byte budget");
        materialFiles.push({ path, ...bytes.value });
      }
      basisDigest = directHash({ runId: created.event.runId, flowId: created.event.flowId, runSha256: record.value.sha256,
        materials: materialFiles.map(({ path, sha256 }) => ({ path, sha256 })) });
      }
    } else {
      const basis = await readRunEvidence(deps, created.event.runId); if (!basis.ok) return invalid(basis.message ?? basis.code);
      if (basis.value.flowId !== created.event.flowId || basis.value.recordSha256 !== record.value.sha256)
        return invalid("Task does not belong to this run's frozen roster");
      if (basis.value.frozenRoles[created.event.to]) basisDigest = basis.value.pinDigest;
      else {
        let review: TrunkServiceResult<import("../abstract/trunk-service.ts").ReviewMaterial> | undefined;
        if (created.event.to === "verifier" && created.event.reviewBasisRef) review = await readAssignedReviewContext(deps, { taskId, actorRoleId: "verifier" });
        else if (created.event.to === "convener" && created.event.from === "chief") {
          const candidates = (await createGitRefStore(deps.projectRoot).listJournals()).filter(row => row.phase === "published" && (row.candidateSource?.kind === "run-integration" || row.candidateSource?.kind === "run-revert")
            && row.candidateSource.taskId === taskId && row.candidateSource.runId === basis.value.runId);
          if (candidates.length !== 1 || candidates[0]?.phase !== "published") return invalid("Controller closure awaits one actual integration and independent final quality; no project-role frozen evidence is invented");
          review = await readReviewMaterial(deps, { parentTaskId: taskId, flowId: created.event.flowId, runId: created.event.runId,
            target: { operationId: candidates[0].operationId, candidate: candidates[0].newOid } });
        }
        if (!review?.ok) return invalid(review ? review.message ?? review.code : "Task has neither project-worker authority nor an actual assigned final-review/controller basis");
        const ref = review.value.reviewBasisRef, proof = await readGitCandidateEvidence(deps.projectRoot, ref.candidateOperationId, ref.candidate);
        if (!proof.ok) return invalid(proof.message ?? proof.reason);
        materialFiles.push(proof.value.journalFile);
        for (const criterion of ref.criteria) { const bytes = await createGitCandidateStore(deps.projectRoot).readBlob(criterion.oid, criterion.path); materialFiles.push({ path: criterion.path, ...bytes }); }
        completionLiveFiles = [{ path: proof.value.journalFile.path, sha256: proof.value.journalFile.sha256 }, ...(review.value.sourceFile ? [review.value.sourceFile] : [])];
        reviewCommit = { operationId: ref.candidateOperationId, candidate: ref.candidate, journalSha256: proof.value.journalFile.sha256, criteria: ref.criteria };
        acceptanceBlock = created.event.to === "verifier" ? "review-quality-execution-unproven" : "controller-final-quality-unproven";
        basisDigest = directHash({ kind: "final-review-controller", target: ref, runSha256: record.value.sha256, acceptanceBlock });
        if (created.event.to === "verifier" && last.event.status === "done") {
          const quality = await readTextQualityProof(deps, taskId, last.event.evidence ?? [], review.value);
          if (quality.ok) {
            basisDigest = quality.value.digest; acceptanceBlock = undefined;
            materialFiles.push(...quality.value.files); completionLiveFiles = [...completionLiveFiles, ...quality.value.liveFiles];
            relatedLedgerDigest = directHashBytes(JSON.stringify(read.records.map(row => row.value)));
          } else acceptanceMessage = quality.message ?? quality.code;
        } else if (created.event.to === "convener" && last.event.status === "done") {
          const qualityTasks = read.records.filter(row => isControllerReviewTask(row.value, taskId, basis.value.flowId, basis.value.runId, ref));
          if (qualityTasks.length === 1) {
            const qualityTaskId = qualityTasks[0]!.value.taskId;
            if (typeof qualityTaskId === "string") {
              const qualityRows = read.records.filter(row => row.value.taskId === qualityTaskId);
              const reportRow = qualityRows.filter(row => row.value.kind === "task.reported").at(-1), closeRow = qualityRows.filter(row => row.value.kind === "task.closed").at(-1);
              const report = reportRow ? validateTaskStateEvent(reportRow.value) : undefined, closed = closeRow ? validateTaskStateEvent(closeRow.value) : undefined;
              if (report?.ok && report.event.kind === "task.reported" && report.event.from === "verifier" && report.event.status === "done"
                && closed?.ok && closed.event.kind === "task.closed" && closed.event.outcome === "accepted" && closed.event.by === qualityTasks[0]!.value.from
                && closed.event.actionSource?.kind === "role-direct" && closed.event.actionSource.action === "close-created-task" && closed.event.actionSource.runId === basis.value.runId) {
                const assignedReview = await readReviewTaskContext(deps, { taskId: qualityTaskId, actorRoleId: "verifier" }, true);
                if (!assignedReview.ok || canonicalJson(assignedReview.value.reviewBasisRef) !== canonicalJson(ref)) return invalid(assignedReview.ok ? "Accepted review target differs" : assignedReview.message ?? assignedReview.code);
                const quality = await readTextQualityProof(deps, qualityTaskId, report.event.evidence ?? [], review.value);
                if (quality.ok && closed.event.actionSource.baseDigest === quality.value.digest) {
                  // Independent quality permits the still-live controller to publish; it does not prove delivery happened.
                  acceptanceBlock = "controller-delivery-unpublished"; acceptanceMessage = "The actual final candidate passed independent quality; the controller must still publish its delivery ref before overall acceptance";
                  basisDigest = directHash({ kind: "verified-controller-completion", target: ref, pinDigest: review.value.pinDigest,
                    qualityTaskId, qualityDigest: quality.value.digest, close: closeRow!.value });
                  materialFiles.push(...quality.value.files, { path: `.ans/task-reports/${directHashBytes(taskId)}/quality-closed.json`, sha256: directHashBytes(closeRow!.raw), bytesBase64: Buffer.from(closeRow!.raw).toString("base64") });
                  completionLiveFiles = [...completionLiveFiles, ...quality.value.liveFiles, ...(assignedReview.value.sourceFile ? [assignedReview.value.sourceFile] : [])]; relatedLedgerDigest = directHashBytes(JSON.stringify(read.records.map(row => row.value)));
                  const deliveries = (await createGitRefStore(deps.projectRoot).listJournals()).filter(row => row.phase === "published" && row.deliverySource?.taskId === taskId
                    && row.deliverySource.runId === basis.value.runId && row.deliverySource.candidateOperationId === ref.candidateOperationId
                    && canonicalJson(row.newOid) === canonicalJson(ref.candidate));
                  if (deliveries.length === 1) {
                    const delivery = await readGitDeliveryEvidence(deps.projectRoot, deliveries[0]!.operationId);
                    const source = delivery.ok ? delivery.value.journal.deliverySource : undefined;
                    if (delivery.ok && source && source.qualityTaskId === qualityTaskId && source.qualityDigest === quality.value.digest
                      && source.creatorCloseOperationId === closed.event.operationId && source.creatorCloseEventId === closed.event.eventId
                      && source.qualityReportSha256 === directHashBytes(reportRow!.raw) && source.pinDigest === review.value.pinDigest
                      && source.candidateJournalSha256 === review.value.candidateJournalSha256 && canonicalJson(source.criteria) === canonicalJson(ref.criteria)) {
                      acceptanceBlock = undefined; acceptanceMessage = undefined;
                      deliveryCommit = { operationId: delivery.value.journal.operationId, journalSha256: delivery.value.journalFile.sha256 };
                      basisDigest = directHash({ kind: "delivered-controller-completion", target: ref, qualityDigest: quality.value.digest, qualityClose: closeRow!.value,
                        deliveryOperationId: deliveryCommit.operationId, deliveryJournalSha256: deliveryCommit.journalSha256 });
                      materialFiles.push(delivery.value.journalFile); completionLiveFiles = [...completionLiveFiles, { path: delivery.value.journalFile.path, sha256: delivery.value.journalFile.sha256 }];
                    }
                  }
                } else acceptanceMessage = quality.ok ? "The accepted verifier closure does not bind this current quality evidence" : quality.message ?? quality.code;
              }
            }
          }
        }
      }
    }
    const runPath = `.ans/runs/${created.event.runId}/manifest.json`, run = await store.readProjectFile(runPath);
    if (!run.ok || run.value.sha256 !== record.value.sha256) return invalid("Run changed while preparing the current report basis");
    const reportSha = directHashBytes(last.raw), base = `.ans/task-reports/${directHashBytes(taskId)}`;
    const files = [{ path: `${base}/${reportSha}.json`, sha256: reportSha, bytesBase64: Buffer.from(last.raw).toString("base64") },
      { path: `${base}/created.json`, sha256: directHashBytes(created.raw), bytesBase64: Buffer.from(created.raw).toString("base64") },
      { path: runPath, ...run.value }, ...materialFiles];
    const snapshotId = `s-report-${directHash([taskId, reportSha, basisDigest, run.value.sha256])}`, digest = completeSnapshotDigest(files);
    const prepared = await store.prepareSnapshot({ schema: "complete-snapshot/v1", snapshotId, digest, files, createdAt: last.event.at });
    if (!prepared.ok) return invalid(prepared.message ?? prepared.reason);
    return { ok: true, value: { taskId, runId: created.event.runId, basisDigest,
      reportRef: { snapshotId, path: files[0]!.path, sha256: reportSha }, reportStatus: last.event.status,
      reportSummary: last.event.summary, taskDigest: directHashBytes(JSON.stringify(rows.map(row => row.value))), runRecordSha256: record.value.sha256,
      ...(initializationCommit ? { initializationCommit } : {}),
      ...(reviewCommit ? { reviewCommit } : {}), ...(acceptanceBlock ? { acceptanceBlock } : {}), ...(acceptanceMessage ? { acceptanceMessage } : {}), ...(relatedLedgerDigest ? { relatedLedgerDigest } : {}),
      ...(deliveryCommit ? { deliveryCommit } : {}),
      ...(activationCommit ? { activationCommit } : {}),
      ...(stableCommit ? { stableCommit } : {}),
      ...(planCommit ? { planCommit } : {}),
      ...(reportOnly ? { reportOnly } : {}),
      ...(completionLiveFiles ? { materialRefs: completionLiveFiles } : materialFiles.length ? { materialRefs: materialFiles.map(({ path, sha256 }) => ({ path, sha256 })) } : {}) } };
  } catch (error) { return invalid(String(error)); }
}

/** Publish the convener's actual structurally complete plan, independently of future execution authority. */
export async function completeTeamPlan(deps: TrunkServiceDeps, input: CompleteTeamPlanInput, actor: string, operationTime?: string): Promise<CompletedTeamPlanReceipt> {
  const result = await completeTeamPlanInternal(deps, input, actor, false, operationTime);
  return "preparationKind" in result ? directFailure(input.operationId, input.baseDigest ?? null, "plan-preparation-only", "No pointer committed") : result;
}
async function completeTeamPlanInternal(deps: TrunkServiceDeps, input: CompleteTeamPlanInput, actor: string, prepareOnly = false, operationTime?: string): Promise<CompletedTeamPlanReceipt | import("../abstract/trunk-service.ts").PreparedTeamPlanCommit> {
  // B1 AC-1 / Q10：失败回执 baseDigest 分层——effective 读取成功后回显派生值；此前回显 input.baseDigest ?? null。
  let effectiveBase: string | undefined;
  const reject = (code: string, message: string): CompletedTeamPlanReceipt => directFailure(input.operationId, effectiveBase ?? input.baseDigest ?? null, code, message);
  const { store } = deps;
  // B1 AC-1：baseDigest 可缺省（应用派生）；给了必须保持既有 64 hex 形状，随后严格值断言。
  if (actor !== "convener" || !input.operationId || !input.flowId || (input.baseDigest !== undefined && !/^[a-f0-9]{64}$/i.test(input.baseDigest))) return reject("plan-identity-invalid", "Only the real convener can complete a plan against an actual document basis");
  if (!store.readOperation || !store.writeOperation || !store.captureSnapshot || !store.readSnapshot || !store.prepareSnapshot || !store.compareAndSwapManifest) return reject("plan-store-unavailable", "Complete atomic plan storage is unavailable");
  const requestDigest = directHash({ input, actor });
  let preparedJournal: TrunkApplyJournal | undefined;
  const decorate = (receipt: DirectActionReceipt, journal: TrunkApplyJournal): CompletedTeamPlanReceipt => {
    const snapshotId = journal.targetSnapshot!.snapshotId, plan = journal.target.execution.teamPlan;
    const roster = journal.target.documents.roster, modules = journal.target.documents.modules;
    return { ...receipt, ...(plan ? { planRef: { snapshotId, path: plan.path, sha256: plan.sha256, version: input.plan.version } } : {}),
      ...(roster ? { rosterRef: { snapshotId, ...roster } } : {}), ...(modules ? { modulesRef: { snapshotId, ...modules } } : {}) };
  };
  try {
    const prior = await store.readOperation(input.operationId);
    if (prior.ok) {
      if (prior.value.message !== `team-plan:${requestDigest}` || prior.value.actionSource?.kind !== "role-direct"
        || prior.value.actionSource.action !== "complete-team-plan" || !prior.value.targetSnapshot) return reject("plan-operation-conflict", "Operation id is already bound to another request");
      return decorate(await finishDirect(deps, prior.value), prior.value);
    }
    if (prior.reason !== "missing") return reject("plan-journal-corrupt", `operation-${prior.reason}`);
    const effective = await readEffectiveSnapshot(deps); if (!effective.ok) return reject(effective.code, effective.message ?? effective.code);
    const { manifest: current, snapshot: old } = effective.value;
    // B1 AC-1：baseDigest 由 effective trunk manifest digest 派生；声明值只作严格相等断言（无 case fold）。
    const derivedBase = current.digest;
    effectiveBase = derivedBase;
    if (current.flowId !== input.flowId || (input.baseDigest !== undefined && input.baseDigest !== derivedBase)) return reject("plan-base-conflict", "Plan basis differs from the actual effective flow document snapshot");
    if (input.runId) { const run = await store.readRunRecord?.(input.runId); if (!run?.ok || run.value.value.flowId !== input.flowId) return reject("plan-run-conflict", "Plan task refers to a different or unavailable real run"); }
    const escaped = input.flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`^docs/scheduling/${escaped}-team-v${input.plan.version}\\.md$`).test(input.plan.path)) return reject("plan-path-invalid", "Plan path and declared version must identify the real flow team plan");
    const target = snapshotOfManifest(current), rosterRef = target.documents.roster, modulesRef = target.documents.modules;
    if (!rosterRef || !modulesRef) return reject("plan-basis-incomplete", "The actual planning trunk needs a roster and authoritative modules reference");
    const rosterBytes = old.files.find(file => file.path === rosterRef.path), modulesBytes = old.files.find(file => file.path === modulesRef.path);
    if (!rosterBytes || !modulesBytes) return reject("plan-basis-incomplete", "Planning basis bytes are missing");
    const roster = parseProjectRoster(Buffer.from(rosterBytes.bytesBase64, "base64").toString("utf8"), input.flowId);
    const modules = parseProjectModules(Buffer.from(modulesBytes.bytesBase64, "base64").toString("utf8"), input.flowId);
    if (!roster.ok || !modules.ok || canonicalJson(roster.roster.modules) !== canonicalJson(modules.doc.modules)) return reject("plan-owner-invalid", "The real roster and authoritative modules disagree");
    // B1 AC-2：来源选择逐字保留现状（G1）。(i) 声明 sha 命中冻结快照同 path ⇒ 用冻结字节（不读 live）；
    // (ii) 声明 sha 未命中 ⇒ 读 live 并要求 live 命中声明；(iii) 缺省 sha ⇒ live 优先、同 path frozen 兜底。
    const frozenPlan = input.plan.sha256 !== undefined ? old.files.find(file => file.path === input.plan.path && file.sha256 === input.plan.sha256) : undefined;
    const livePlan = frozenPlan === undefined ? await store.readProjectFile?.(input.plan.path) : undefined;
    const planBytes = frozenPlan ?? (livePlan?.ok ? livePlan.value : undefined)
      ?? (input.plan.sha256 === undefined ? old.files.find(file => file.path === input.plan.path) : undefined);
    if (!planBytes) return reject("plan-hash-drift", input.plan.sha256 === undefined
      ? "Plan bytes are unreadable or absent from the effective snapshot" : "Plan bytes differ from the submitted exact hash");
    const derivedSha = planBytes.sha256;
    if (input.plan.sha256 !== undefined && input.plan.sha256 !== derivedSha) return reject("plan-hash-drift", "Plan bytes differ from the submitted exact hash");
    const parsed = parseTeamPlan(Buffer.from(planBytes.bytesBase64, "base64").toString("utf8"), { flowId: input.flowId, version: input.plan.version,
      modules: modulesRef, roster: rosterRef, rosterFacts: roster.roster });
    if (!parsed.ok) return reject("plan-structure-invalid", parsed.reason);
    // resolved 只用于 marker/target/回执/commit 断言；journal message/source/targetDigest 语义不变（M1）。
    const resolvedPlan = { path: input.plan.path, sha256: derivedSha, version: input.plan.version };
    const noOp = target.execution.teamPlan?.path === resolvedPlan.path && target.execution.teamPlan.sha256 === resolvedPlan.sha256;
    target.execution.teamPlan = { path: resolvedPlan.path, sha256: resolvedPlan.sha256 };
    const at = operationTime ?? (deps.now ?? (() => new Date()))().toISOString(), applicationId = `plan-${directHash([input.flowId, input.operationId])}`;
    let captured = await store.captureSnapshot({ snapshotId: `s-plan-bytes-${directHash([input.flowId, input.operationId])}`, createdAt: at,
      files: directRefs(target), baseSnapshotRef: current.snapshotRef });
    if (!captured.ok) return reject("plan-snapshot-invalid", captured.message ?? captured.reason);
    const bytes = await store.readSnapshot(captured.value); if (!bytes.ok) return reject("plan-snapshot-invalid", bytes.message ?? bytes.reason);
    const marker = canonicalJson({ schema: "team-plan-completion/v1", operationId: input.operationId, actorRoleId: actor, flowId: input.flowId,
      plan: resolvedPlan, modules: modulesRef, roster: rosterRef });
    const files = [...bytes.value.files, { path: `.ans/trunk/plan-completions/${directHash(input.operationId)}.json`, sha256: directHashBytes(marker), bytesBase64: Buffer.from(marker).toString("base64") }];
    captured = await store.prepareSnapshot({ schema: "complete-snapshot/v1", snapshotId: `s-plan-${directHash([input.flowId, input.operationId])}`,
      digest: completeSnapshotDigest(files), files, createdAt: at });
    if (!captured.ok) return reject("plan-snapshot-invalid", captured.message ?? captured.reason);
    const next: TrunkManifest = { ...current, source: noOp ? current.source : "team-plan", trunkVersion: noOp ? current.trunkVersion : current.trunkVersion + 1,
      previous: noOp ? current.previous : { trunkVersion: current.trunkVersion, runId: current.runId }, updatedAt: at,
      artifacts: { ...current.artifacts, execution: target.execution }, snapshotRef: captured.value };
    next.digest = noOp ? current.digest : directHash({ flowId: input.flowId, trunkVersion: next.trunkVersion, artifacts: next.artifacts, snapshotRef: captured.value });
    const source: RoleDirectSource = { kind: "role-direct", actorRoleId: actor, action: "complete-team-plan", operationId: input.operationId,
      applicationId, journalId: `j-plan-${directHash(input.operationId).slice(0, 24)}`, ...(input.runId !== undefined ? { runId: input.runId } : {}),
      baseDigest: current.digest, targetDigest: next.digest, at };
    next.actionSource = source;
    const journal: TrunkApplyJournal = { v: 1, schema: TRUNK_APPLY_JOURNAL_SCHEMA, operationId: input.operationId, applicationId,
      journalId: source.journalId!, flowId: input.flowId, phase: "prepared", message: `team-plan:${requestDigest}`, target: { ...target, trunkVersion: next.trunkVersion },
      before: snapshotOfManifest(current), beforeSnapshot: current.snapshotRef, targetSnapshot: captured.value, actionSource: source, startedAt: at, updatedAt: at };
    if (prepareOnly) {
      const complete = await store.readSnapshot(captured.value);
      if (!complete.ok) return reject("plan-snapshot-invalid", complete.message ?? complete.reason);
      return { preparationKind: "team-plan-commit", input: structuredClone(input), actorRoleId: "convener",
        baseTrunk: { version: current.trunkVersion, digest: current.digest }, manifest: next, journal, snapshot: complete.value,
        expectedActive: { revision: current.activeRevision ?? 0, digest: current.activeDigest ?? null }, expectedSnapshot: current.snapshotRef! };
    }
    const saved = await store.writeOperation(journal); if (!saved.ok) return reject("plan-journal-failed", saved.message ?? saved.code);
    preparedJournal = journal;
    if (noOp) return decorate(await finishDirect(deps, journal), journal);
    const archived = await store.archiveHistory(current.trunkVersion, current); if (!archived.ok) return reject("plan-history-failed", archived.message ?? archived.code);
    const written = await store.compareAndSwapManifest({ version: current.trunkVersion, digest: current.digest }, next, captured.value,
      { revision: current.activeRevision ?? 0, digest: current.activeDigest ?? null }, current.snapshotRef);
    if (!written.ok) {
      const recovered = await finishDirect(deps, journal);
      return recovered.ok || recovered.status === "committed-pending-recovery" ? decorate(recovered, journal) : reject("plan-cas-conflict", written.message ?? written.code);
    }
    return decorate(await finishDirect(deps, journal, true), journal);
  } catch (error) {
    if (preparedJournal) {
      const recovery = await finishDirect(deps, preparedJournal);
      if (recovery.ok || recovery.status === "committed-pending-recovery" || recovery.status === "blocked") return decorate(recovery, preparedJournal);
    }
    return reject("plan-completion-failed", String(error));
  }
}

/** Host observations share one ledger CAS path. Closing remains the creator's separate command. */
export async function recordTaskObservation(deps: TrunkServiceDeps, event: TaskStateEvent): Promise<import("../abstract/trunk-service.ts").TaskObservationResult> {
  const invalid = (message: string, code = "task-observation-invalid") => ({ ok: false as const, code, message });
  const checked = validateTaskStateEvent(event); if (!checked.ok) return invalid(checked.message, "task-event-invalid");
  if (event.kind === "task.closed") return invalid("Use the actual creator's closeCreatedTask command", "task-close-command-required");
  try {
    const read = await readOperationEvents(deps.projectRoot); if (!read.ok) return invalid(read.reason, "task-ledger-unavailable");
    const taskId = "taskId" in event ? event.taskId : undefined;
    const rows = taskId ? read.records.filter(row => row.value.taskId === taskId) : [];
    if (rows.some(row => row.raw === JSON.stringify(event))) return { ok: true, replay: true };
    const creates = rows.filter(row => row.value.kind === "task.created"), closed = rows.some(row => row.value.kind === "task.closed");
    if (event.kind === "task.created" && creates.length) return invalid("Task id is already bound to a different actual creation", "task-identity-conflict");
    let expectedRun: { runId: string; sha256: string } | undefined;
    let expectedSourceFile: { path: string; sha256: string } | undefined;
      let documentPreparation: { documentBasis: { version: number; digest: string; snapshotRef?: import("../../../model/trunk.ts").SnapshotRef } | null; sourceFile: { path: string; sha256: string }; expectedLedgerDigest?: string; initializationOperationId?: string; intentConfirmation?: DocumentIntentConfirmation; planCompletion?: RolePreparationPlan; hubRouting?: "chief-hub-v1"; expectedFiles?: readonly { path: string; sha256: string }[]; expectedActive?: { revision: number; digest: string } } | undefined;
    let expectedParentTask: { taskId: string; digest: string; flowId: string; runId: string; to: "convener" } | undefined;
    let reviewProof: import("../abstract/trunk-service.ts").ReviewMaterial | undefined;
    if (event.kind === "task.created" && (event.parentTaskRef !== undefined || event.from === "convener" && event.flowId !== undefined)) {
      if (event.from !== "convener" || !event.flowId || !event.runId || !isTaskParentRef(event.parentTaskRef) || event.parentTaskRef.taskId === event.taskId || event.workSourceRef !== undefined)
        return invalid("A new convener project child needs its actual assigned-task parent, distinct from a customer-turn source", "task-parent-required");
      const parent = await prepareParentTaskRef(deps, { actorRoleId: "convener", taskId: event.parentTaskRef.taskId, flowId: event.flowId, runId: event.runId });
      if (!parent.ok || parent.parentTaskRef.ledgerSha256 !== event.parentTaskRef.ledgerSha256.toLowerCase())
        return invalid(parent.ok ? "The actual parent ledger changed before child creation" : parent.message, "task-parent-stale");
      expectedParentTask = { taskId: parent.parentTaskRef.taskId, digest: parent.parentTaskRef.ledgerSha256, flowId: event.flowId, runId: event.runId, to: "convener" };
    }
    if (event.kind === "task.created" && event.workSourceRef) {
      const source = await deps.store.readInitializationSource?.(event.workSourceRef.sourceId);
      if (!source?.ok || source.value.path !== event.workSourceRef.path || source.value.sha256 !== event.workSourceRef.sha256.toLowerCase()) return invalid("Actual initialization work-source bytes are unavailable");
      let value: unknown; try { value = JSON.parse(Buffer.from(source.value.bytesBase64, "base64").toString("utf8")); } catch { return invalid("Initialization work-source JSON is invalid"); }
      const root = await readGitProtectionFacts(deps.projectRoot);
      if (!evidenceObject(value) || value.schema !== "repository-work-source/v1" || !["customer-turn", "creator-report"].includes(String(value.kind))
        || (value.kind === "creator-report" ? event.workSourceRef.kind !== "chief-creator-report" : event.workSourceRef.kind !== "chief-customer-turn") || value.sourceId !== event.workSourceRef.sourceId
        || value.flowId !== event.flowId || value.projectRoot !== root.projectRoot || !evidenceObject(value.parent) || value.parent.roleId !== "chief")
        return invalid("Initialization work-source does not bind this actual flow/root/customer turn");
      expectedSourceFile = { path: source.value.path, sha256: source.value.sha256 };
      if (value.purpose === "builtin-preparation") {
        const execution = await verifyRestartExecutionSource(deps, value, event.runId!, event.flowId!);
        if (!execution.ok) return invalid(execution.message ?? execution.code, "task-restart-source-invalid");
        const selection = execution.value.selection;
        if (selection && read.records.some(row => row.value.kind === "task.created" && row.value.from === "chief" && row.value.to === "convener" && row.value.runId === selection.replacementRunId))
          return invalid("Replacement already belongs to its original controller assignment", "task-execution-already-assigned");
        if (event.hubRouting !== "chief-hub-v1" || value.hubRouting !== event.hubRouting || event.from !== "chief" || !["product", "rapporteur", "nominator", "convener", "verifier"].includes(event.to)
          || value.targetRoleId !== event.to || value.planningRunId !== event.runId || event.parentTaskRef !== undefined
          || (event.reviewBasisRef === undefined ? event.runState !== (selection ? "pinned" : "draft") || event.reviewControllerRef !== undefined || (selection !== undefined && event.to !== "convener") : event.runState !== "pinned" || event.to !== "verifier" || selection !== undefined))
          return invalid("New builtin tasks need their actual chief hub source, not a worker parent", "task-hub-source-invalid");
        if (event.reviewBasisRef !== undefined) {
          const controller = event.reviewControllerRef;
          if (event.moduleId !== undefined || event.modulePaths !== undefined || event.moduleDirectory !== undefined
            || !isTaskReviewBasisRef(event.reviewBasisRef) || !isTaskReviewControllerRef(controller) || controller.flowId !== event.flowId || controller.runId !== event.runId
            || canonicalJson(controller.reviewBasisRef) !== canonicalJson(event.reviewBasisRef) || canonicalJson(value.reviewControllerRef) !== canonicalJson(controller)
            || canonicalJson(value.reviewBasisRef) !== canonicalJson(event.reviewBasisRef)) return invalid("Final review host references differ from its immutable chief source", "task-review-basis-required");
          const prepared = await prepareReviewTask(deps, { parentTaskId: controller.taskId, flowId: controller.flowId, runId: controller.runId,
            target: { operationId: event.reviewBasisRef.candidateOperationId, candidate: event.reviewBasisRef.candidate } });
          if (!prepared.ok || canonicalJson(prepared.value.reviewBasisRef) !== canonicalJson(event.reviewBasisRef)) return invalid(prepared.ok ? "Frozen review criteria changed" : prepared.message ?? prepared.code, "task-review-basis-stale");
          reviewProof = prepared.value;
        } else documentPreparation = { documentBasis: selection?.targetTrunk ?? null, sourceFile: expectedSourceFile, hubRouting: "chief-hub-v1",
          ...(selection ? { expectedActive: selection.targetActive, expectedFiles: execution.value.expectedFiles } : {}) };
        if (value.kind === "creator-report") {
          const actual = await creatorReportSource(deps, event.flowId!, value.creatorReports, true, true); if (!actual.ok) return invalid(actual.message ?? actual.code, "task-creator-report-stale");
          if (documentPreparation) documentPreparation.expectedLedgerDigest = actual.value.ledgerDigest;
          if (reviewProof && reviewProof.relatedLedgerDigest !== actual.value.ledgerDigest) return invalid("Chief report source changed during final review preparation", "task-review-basis-stale");
        }
      } else if (value.purpose === "document-preparation" || value.purpose === "team-planning" || value.purpose === "role-preparation") {
        const basis = value.documentBasis;
        if (event.from !== "chief" || !(value.purpose === "role-preparation" ? event.to === "nominator" : value.purpose === "team-planning" ? event.to === "convener" : ["product", "rapporteur"].includes(event.to)) || value.targetRoleId !== event.to || value.planningRunId !== event.runId || event.runState !== "draft"
          || (basis !== null && (!evidenceObject(basis) || !Number.isSafeInteger(basis.version) || typeof basis.version !== "number" || basis.version < 1
            || typeof basis.digest !== "string" || !/^[a-f0-9]{64}$/i.test(basis.digest) || (basis.snapshotRef !== undefined && !isSnapshotRef(basis.snapshotRef)))))
          return invalid("Document preparation source does not bind this actual professional role/planning draft/baseline", "task-document-source-invalid");
        documentPreparation = { documentBasis: basis === null ? null : { version: basis.version as number, digest: basis.digest as string,
          ...(isSnapshotRef(basis.snapshotRef) ? { snapshotRef: basis.snapshotRef } : {}) }, sourceFile: expectedSourceFile };
        if (typeof value.initializationOperationId === "string") documentPreparation.initializationOperationId = value.initializationOperationId;
        if (value.kind === "creator-report") {
          const actual = await creatorReportSource(deps, event.flowId!, value.creatorReports, true); if (!actual.ok) return invalid(actual.message ?? actual.code, "task-creator-report-stale");
          documentPreparation.expectedLedgerDigest = actual.value.ledgerDigest;
        }
        if (event.to === "rapporteur" || value.purpose === "team-planning" || value.purpose === "role-preparation") {
          const selected = value.intentConfirmation;
          if (!evidenceObject(selected) || typeof selected.path !== "string") return invalid("Rapporteur work source has no exact confirmed intent", "task-document-source-invalid");
          const proof = await readConfirmedIntentEvidence(deps.projectRoot, selected.path);
          if (!proof.ok) return invalid(`Rapporteur intent is no longer confirmed: ${proof.reason}`, "task-document-source-invalid");
          const { ledgerDigest, ...intent } = proof.value;
          if (canonicalJson(intent) !== canonicalJson(selected) || (documentPreparation.expectedLedgerDigest !== undefined && documentPreparation.expectedLedgerDigest !== ledgerDigest))
            return invalid("The selected intent or actual source ledger changed before document assignment", "task-document-source-invalid");
          documentPreparation.intentConfirmation = intent; documentPreparation.expectedLedgerDigest = ledgerDigest;
        }
        if (value.purpose === "role-preparation") {
          const proof = await rolePreparationPlan(deps, event.flowId!);
          if (!proof.ok || canonicalJson(proof.value.plan) !== canonicalJson(value.planCompletion)
            || proof.value.ledgerDigest !== documentPreparation.expectedLedgerDigest) return invalid(proof.ok ? "Role preparation source plan/creator receipt changed" : proof.message ?? proof.code, "task-document-source-invalid");
          documentPreparation.planCompletion = proof.value.plan;
        }
      } else if (value.kind !== "customer-turn" || value.purpose !== undefined || event.from !== "chief" || event.to !== "convener") return invalid("The original initialization source cannot authorize a different work purpose", "task-work-source-purpose-invalid");
    }
    if (event.kind === "task.created" && event.hubRouting !== "chief-hub-v1" && (event.reviewBasisRef !== undefined || event.from === "convener" && event.to === "verifier" && event.flowId !== undefined)) {
      if (event.from !== "convener" || event.to !== "verifier" || !event.flowId || !event.runId || event.runState !== "pinned" || !event.parentTaskRef
        || !isTaskReviewBasisRef(event.reviewBasisRef) || event.moduleId !== undefined || event.modulePaths !== undefined || event.moduleDirectory !== undefined)
        return invalid("A final verifier task requires a host-bound candidate review, not a worker module or model assertion", "task-review-basis-required");
      const prepared = await prepareReviewTask(deps, { parentTaskId: event.parentTaskRef.taskId, flowId: event.flowId, runId: event.runId,
        target: { operationId: event.reviewBasisRef.candidateOperationId, candidate: event.reviewBasisRef.candidate } });
      if (!prepared.ok || canonicalJson(prepared.value.reviewBasisRef) !== canonicalJson(event.reviewBasisRef)
        || canonicalJson(prepared.value.parentTaskRef) !== canonicalJson(event.parentTaskRef))
        return invalid(prepared.ok ? "The actual parent or frozen criteria changed before review assignment" : prepared.message ?? prepared.code, "task-review-basis-stale");
      reviewProof = prepared.value;
    }
    if (event.kind === "task.created" && event.flowId !== undefined) {
      if (!event.runId || !event.runState || event.runState === "legacy") return invalid("A new project task needs its actual run; historical read-only state cannot dispatch", "task-run-required");
      const run = await deps.store.readRunRecord?.(event.runId);
      if (!run?.ok || run.value.value.flowId !== event.flowId || run.value.value.state !== event.runState) return invalid("Task run binding differs from the actual application-owned run", "task-run-binding-invalid");
      const planningRole = ["chief", "convener", "product", "rapporteur", "nominator", "verifier"].includes(event.to);
      if (!planningRole) {
        const basis = await readRunEvidence(deps, event.runId);
        if (!basis.ok) return invalid(basis.message ?? basis.code, "task-worker-pin-unavailable");
        if (!basis.value.frozenRoles[event.to]) return invalid("Worker role is absent from this actual same-run authorization closure", "task-worker-role-unavailable");
      }
      expectedRun = { runId: event.runId, sha256: run.value.sha256 };
    }
    if (event.kind === "task.reported" || event.kind === "task.delivered") {
      const created = creates[0]?.value;
      if (creates.length !== 1 || !created || closed || (event.kind === "task.reported" ? event.from : event.to) !== created.to)
        return invalid("Task observation is not from the actual open assigned task");
    }
    const written = documentPreparation && event.kind === "task.created" && taskId && expectedRun ? await appendGitDocumentPreparationTaskEvent(deps.projectRoot, event, {
      ...documentPreparation, expectedTask: { taskId, digest: directHashBytes(JSON.stringify(rows.map(row => row.value))) }, expectedRun })
      : reviewProof && taskId && expectedRun ? await appendGitCandidateTaskEvent(deps.projectRoot, event, {
      operationId: reviewProof.reviewBasisRef.candidateOperationId, candidate: reviewProof.reviewBasisRef.candidate, journalSha256: reviewProof.candidateJournalSha256,
      criteria: reviewProof.reviewBasisRef.criteria, expectedLedgerDigest: reviewProof.relatedLedgerDigest,
      expectedTask: { taskId, digest: directHashBytes(JSON.stringify(rows.map(row => row.value))) }, expectedRun, ...(expectedParentTask ? { expectedParentTask } : {}), ...(expectedSourceFile ? { expectedFiles: [expectedSourceFile] } : {}) })
      : await appendTaskLedgerEvent(deps.projectRoot, event, { ...(taskId ? { expectedTask: { taskId, digest: directHashBytes(JSON.stringify(rows.map(row => row.value))) } } : {}),
      ...(expectedRun ? { expectedRun } : {}), ...(expectedParentTask ? { expectedParentTask } : {}), ...(expectedSourceFile ? { expectedFiles: [expectedSourceFile] } : {}) });
    return written.ok ? written : invalid(written.reason, "task-ledger-append-failed");
  } catch (error) { return invalid(String(error), "task-observation-exception"); }
}

/** The actual creator closes exactly the current report/pin, with the ledger append as the commit point. */
export async function closeCreatedTask(deps: TrunkServiceDeps, input: CloseCreatedTaskInput, actor: string): Promise<CloseCreatedTaskResult> {
  const reject = (code: string, message: string): CloseCreatedTaskResult => ({ ok: false, status: "rejected", operationId: input.operationId,
    baseDigest: input.basisDigest, targetDigest: null, errorCode: code, message, taskId: input.taskId });
  if ((actor !== "chief" && actor !== "convener") || !input.operationId || !["accepted", "rework", "rejected"].includes(input.outcome)
    || !isSnapshotArtifactRef(input.reportRef)) return reject("task-close-invalid", "A real creator, report reference and valid closure outcome are required");
  const targetDigest = directHash({ input, actor }), applicationId = `close-${directHash([input.taskId, input.operationId])}`, eventId = `task-close-${directHash([input.operationId, targetDigest])}`;
  try {
    const read = await readOperationEvents(deps.projectRoot); if (!read.ok) return reject("task-ledger-unavailable", read.reason);
    const replay = read.records.find(row => row.value.kind === "task.closed" && row.value.operationId === input.operationId);
    if (replay) {
      const old = validateTaskStateEvent(replay.value);
      if (!old.ok || old.event.kind !== "task.closed" || old.event.taskId !== input.taskId || old.event.by !== actor
        || old.event.actionSource?.kind !== "role-direct" || old.event.actionSource.targetDigest !== targetDigest || old.event.eventId !== eventId)
        return reject("task-operation-conflict", "Operation is already bound to another closure");
      return { ok: true, status: "applied", operationId: input.operationId, applicationId, journalId: eventId, eventId,
        taskId: input.taskId, taskStatus: "closed", baseDigest: input.basisDigest, targetDigest, source: old.event.actionSource };
    }
    const prepared = await prepareCreatedTaskClose(deps, input.taskId, actor);
    if (!prepared.ok) return reject("task-close-basis-unavailable", prepared.message ?? prepared.code);
    const basis = prepared.value;
    if (basis.runId !== input.runId || basis.basisDigest !== input.basisDigest || canonicalJson(basis.reportRef) !== canonicalJson(input.reportRef)
      || (input.outcome === "accepted" && basis.reportStatus !== "done")) return reject("task-close-stale", "The report, run pin or legal closure state is no longer current");
    if (input.outcome === "accepted" && basis.acceptanceBlock) return reject(basis.acceptanceBlock, basis.acceptanceMessage ?? "The actual final candidate/criteria are bound, but independent quality execution and final evidence are not proved; use a real rework/rejection rather than accepting a model verdict");
    const at = (deps.now ?? (() => new Date()))().toISOString();
    const source: RoleDirectSource = { kind: "role-direct", actorRoleId: actor, action: "close-created-task", operationId: input.operationId,
      applicationId, journalId: eventId, runId: input.runId, baseDigest: input.basisDigest, targetDigest, at };
    const event: TaskClosedEvent = { v: 1, at, kind: "task.closed", taskId: input.taskId, by: actor, outcome: input.outcome,
      ...(input.note ? { note: input.note } : {}), actionSource: source, operationId: input.operationId, eventId };
    const stored = basis.reviewCommit ? await appendGitCandidateTaskEvent(deps.projectRoot, event, { ...basis.reviewCommit,
      ...(basis.deliveryCommit ? { expectedDelivery: basis.deliveryCommit } : {}),
      ...(basis.relatedLedgerDigest ? { expectedLedgerDigest: basis.relatedLedgerDigest } : {}), ...(basis.materialRefs ? { expectedFiles: basis.materialRefs } : {}),
      expectedTask: { taskId: input.taskId, digest: basis.taskDigest }, expectedRun: { runId: input.runId, sha256: basis.runRecordSha256 } })
      : basis.initializationCommit ? await appendGitInitializationTaskEvent(deps.projectRoot, event, {
      basis: basis.initializationCommit, expectedFiles: basis.materialRefs!, expectedTask: { taskId: input.taskId, digest: basis.taskDigest }, expectedRun: { runId: input.runId, sha256: basis.runRecordSha256 } })
      : basis.planCommit ? await appendGitPlanCompletionTaskEvent(deps.projectRoot, event, { basis: basis.planCommit,
        expectedFiles: basis.materialRefs!, expectedTask: { taskId: input.taskId, digest: basis.taskDigest }, expectedRun: { runId: input.runId, sha256: basis.runRecordSha256 } })
      : basis.stableCommit ? await appendGitStableCompletionTaskEvent(deps.projectRoot, event, { basis: basis.stableCommit,
        expectedFiles: basis.materialRefs!, expectedTask: { taskId: input.taskId, digest: basis.taskDigest }, expectedRun: { runId: input.runId, sha256: basis.runRecordSha256 } })
      : basis.activationCommit ? await appendGitActiveCompletionTaskEvent(deps.projectRoot, event, { basis: basis.activationCommit,
        expectedFiles: basis.materialRefs!, expectedTask: { taskId: input.taskId, digest: basis.taskDigest }, expectedRun: { runId: input.runId, sha256: basis.runRecordSha256 } })
      : await appendTaskLedgerEvent(deps.projectRoot, event, { expectedTask: { taskId: input.taskId, digest: basis.taskDigest },
      expectedRun: { runId: input.runId, sha256: basis.runRecordSha256 }, ...(basis.materialRefs ? { expectedFiles: basis.materialRefs } : {}),
      ...(basis.reportOnly && basis.relatedLedgerDigest ? { expectedLedgerDigest: basis.relatedLedgerDigest } : {}) });
    if (!stored.ok) return reject("task-close-cas-conflict", stored.reason);
    return { ok: true, status: "applied", operationId: input.operationId, applicationId, journalId: eventId, taskId: input.taskId,
      eventId, taskStatus: "closed", baseDigest: input.basisDigest, targetDigest, source,
      ...(basis.reportOnly ? { message: basis.acceptanceMessage } : {}) };
  } catch (error) {
    // If acknowledgement was lost, the actual source-bound close event is the commit proof.
    const reread = await readOperationEvents(deps.projectRoot).catch(() => ({ ok: false as const, reason: "unavailable" }));
    const committed = reread.ok ? reread.records.find(row => row.value.eventId === eventId && row.value.taskId === input.taskId) : undefined;
    const checked = committed ? validateTaskStateEvent(committed.value) : undefined;
    if (checked?.ok && checked.event.kind === "task.closed" && checked.event.actionSource?.kind === "role-direct"
      && checked.event.actionSource.targetDigest === targetDigest) return { ok: true, status: "applied", operationId: input.operationId, applicationId,
        journalId: eventId, taskId: input.taskId, eventId, taskStatus: "closed", baseDigest: input.basisDigest, targetDigest, source: checked.event.actionSource };
    return reject("task-close-unverified", String(error));
  }
}

type ActivationMeta = Omit<PreparedRoleActivation, "snapshot">;
function isActivationMeta(value: unknown): value is ActivationMeta {
  const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
  return evidenceObject(value) && evidenceObject(value.input) && isActiveRoleEvidence(value.evidence)
    && evidenceObject(value.expectedTrunk) && Number.isSafeInteger(value.expectedTrunk.version) && digest(value.expectedTrunk.digest)
    && evidenceObject(value.expectedActive) && Number.isSafeInteger(value.expectedActive.revision)
    && (value.expectedActive.digest === null || digest(value.expectedActive.digest))
    && evidenceObject(value.targetActive) && Number.isSafeInteger(value.targetActive.revision) && digest(value.targetActive.digest)
    && typeof value.noOp === "boolean" && evidenceObject(value.role) && typeof value.role.roleId === "string"
    && [value.role.cardPath, value.role.boundaryMdPath, value.role.boundaryYamlPath].every(path => typeof path === "string")
    && Array.isArray(value.role.allowedPaths) && value.role.allowedPaths.every(path => evidenceObject(path) && typeof path.path === "string" && (path.kind === "file" || path.kind === "directory"))
    && Array.isArray(value.writesets) && value.writesets.every(path => typeof path === "string");
}

/**
 * Prepare actual D3 + completed plan + three draft bytes. No role is enabled by this preparation.
 *
 * X-R3（E2 S4，nominator）：本函数**不**调用角色模块 preflight——`role-documents` 阶段事实包中的
 * `boundaryWithinRoleModules` / `boundaryMdYamlSynchronized` / `roleCardRequiredSections` 由 G 侧
 * `validateRoleDocumentsSnapshot` 产出，调用点在 Pipeline
 * `trunk-runtime.ts::createDirectRoleRuntime.activateRoleDocuments`（两处 G 校验之后）。此处保留
 * Service 事务/账本/证据最终校验（真实 D3 账本、计划完成证据、名单/模块绑定、三文档字节 hash），
 * 不因 preflight allow 省略任何一步；recovery/revalidate 路径（`prepareDirectAuthority` 的
 * `prepareRoleActivation(..., true)`）不重复调用角色策略（该路径事实不可得且原始激活已过 preflight，
 * 见 `角色卡/编排/docs/change/2026-11-07_E2-XR3_orchestration-nominator-evidence.md`）。
 */
export async function prepareRoleActivation(deps: TrunkServiceDeps, input: ActivateRoleDocumentsInput, actor: string, revalidatePending = false): Promise<TrunkServiceResult<PreparedRoleActivation>> {
  const invalid = (message: string) => fail<PreparedRoleActivation>("trunk-item-invalid", message), { store } = deps;
  if (actor !== "nominator" || !input.operationId || !input.targetRoleId || !store.readSnapshotArtifact || !store.prepareSnapshot || !store.readOperation)
    return invalid("A real nominator and complete immutable evidence storage are required");
  try {
    const prior = await store.readOperation(input.operationId);
    if (prior.ok && !revalidatePending) {
      if (prior.value.actionSource?.kind !== "role-direct" || prior.value.actionSource.action !== "activate-role-documents" || !prior.value.targetSnapshot || !prior.value.message)
        return invalid("Operation id is bound to another action");
      const meta: unknown = JSON.parse(prior.value.message);
      if (!isActivationMeta(meta) || canonicalJson(meta.input) !== canonicalJson(input)) return invalid("Activation operation request differs from its immutable journal");
      const snapshot = await store.readSnapshot!(prior.value.targetSnapshot); if (!snapshot.ok) return invalid("Activation snapshot is unavailable");
      return { ok: true, value: { ...meta, input, snapshot: snapshot.value } };
    }
    if (!prior.ok && prior.reason !== "missing") return invalid(`activation-operation-${prior.reason}`);
    const effective = await readEffectiveSnapshot(deps); if (!effective.ok) return invalid(effective.message ?? effective.code);
    const current = effective.value.manifest;
    if (current.flowId !== input.flowId || !isSnapshotArtifactRef(input.planRef) || !isSnapshotArtifactRef(input.rosterRef)) return invalid("Activation references a different real flow");
    const planRef = current.artifacts.execution.teamPlan, rosterRef = current.artifacts.documents.roster, modulesRef = current.artifacts.documents.modules;
    if (!planRef || !rosterRef || !modulesRef || planRef.path !== input.planRef.path || planRef.sha256 !== input.planRef.sha256
      || rosterRef.path !== input.rosterRef.path || rosterRef.sha256 !== input.rosterRef.sha256) return invalid("Activation plan/roster are not the current applicable document references");
    const plan = await store.readSnapshotArtifact(input.planRef), roster = await store.readSnapshotArtifact(input.rosterRef);
    if (!plan.ok || !roster.ok || input.planRef.snapshotId !== input.rosterRef.snapshotId) return invalid("Plan and roster must have real same-completion immutable bytes");
    const marker = plan.value.snapshot.files.find(file => file.path.startsWith(".ans/trunk/plan-completions/"));
    const completed: unknown = marker ? JSON.parse(Buffer.from(marker.bytesBase64, "base64").toString("utf8")) : undefined;
    if (!evidenceObject(completed) || completed.schema !== "team-plan-completion/v1" || completed.actorRoleId !== "convener"
      || typeof completed.operationId !== "string" || completed.flowId !== input.flowId || !evidenceObject(completed.plan)
      || completed.plan.path !== planRef.path || completed.plan.sha256 !== planRef.sha256) return invalid("No real convener plan-completion evidence");
    const planOperation = await readDirectOperation(deps, completed.operationId);
    if (!planOperation.ok || planOperation.value.journal.actionSource?.kind !== "role-direct"
      || planOperation.value.journal.actionSource.action !== "complete-team-plan" || planOperation.value.snapshot.snapshotId !== input.planRef.snapshotId)
      return invalid("Plan completion has no matching committed operation");
    const actualRoster = parseProjectRoster(Buffer.from(roster.value.bytesBase64, "base64").toString("utf8"), input.flowId);
    if (!actualRoster.ok) return invalid(actualRoster.reason);
    const parsedPlan = parseTeamPlan(Buffer.from(plan.value.bytesBase64, "base64").toString("utf8"), { flowId: input.flowId,
      version: completed.plan.version as number, modules: modulesRef, roster: rosterRef, rosterFacts: actualRoster.roster });
    if (!parsedPlan.ok) return invalid(parsedPlan.reason);
    const selectedRole = actualRoster.roster.roles.find(role => role.id === input.targetRoleId), row = parsedPlan.plan.roleRows.find(row => row.roleId === input.targetRoleId);
    if (!selectedRole || !row) return invalid("Activation target is not assigned by this actual plan and roster");
    const ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return invalid(ledger.reason);
    const requests = new Map<string, { event: Extract<TaskStateEvent, { kind: "request.created" }>; raw: string }>();
    let decision: { created: string; resolved: string; event: Extract<TaskStateEvent, { kind: "request.resolved" }> } | undefined;
    for (const record of ledger.records) {
      if (record.value.kind !== "request.created" && record.value.kind !== "request.resolved") continue;
      const parsed = validateTaskStateEvent(record.value); if (!parsed.ok) return invalid(parsed.message);
      if (parsed.event.kind === "request.created" && parsed.event.flowId === input.flowId && parsed.event.cardKind === "appointment" && parsed.event.sourceRoleId === "nominator") requests.set(parsed.event.requestId, { event: parsed.event, raw: record.raw });
      if (parsed.event.kind === "request.resolved" && parsed.event.cardKind === "appointment" && requests.has(parsed.event.requestId)) decision = { created: requests.get(parsed.event.requestId)!.raw, resolved: record.raw, event: parsed.event };
    }
    const d3 = decision?.event;
    // 2026-11-09 judge-delegated（W-J2/I-30/F11）：来源判定与参考值一律走共享纯函数；judge 用真实应用 decisionId。
    const judgeD3 = d3 !== undefined && d3.by === "judge" && isJudgeD3Resolution(d3);
    if (!decision || !d3 || (d3.by !== "customer" && d3.by !== "chief-delegated" && !judgeD3) || requestResolvedD3DecisionId(d3) !== input.d3DecisionId
      || !d3.targetRoleIds?.includes(input.targetRoleId) || d3.rosterVersion !== actualRoster.roster.version || d3.rosterSha256 !== rosterRef.sha256
      || d3.targetRoleIds.some(roleId => !actualRoster.roster.roles.some(role => role.id === roleId))) return invalid("Latest actual D3 does not select this role against the applicable roster bytes");
    const canonical = { card: `角色卡/${input.targetRoleId}/role-card.md`, boundaryMd: `角色卡/${input.targetRoleId}/boundary.md`, boundaryYaml: `角色卡/${input.targetRoleId}/boundary.yaml` };
    const files: Array<{ path: string; sha256: string; bytesBase64: string }> = [
      { path: planRef.path, sha256: planRef.sha256, bytesBase64: plan.value.bytesBase64 }, { path: rosterRef.path, sha256: rosterRef.sha256, bytesBase64: roster.value.bytesBase64 }];
    for (const key of ["card", "boundaryMd", "boundaryYaml"] as const) {
      const ref = input.documents[key]; if (ref.path !== canonical[key]) return invalid("Activation requires the canonical complete three documents");
      const bytes = await store.readProjectFile!(ref.path, { maxBytes: 256 * 1024 });
      if (!bytes.ok || bytes.value.sha256 !== ref.sha256) return invalid(`Activation draft bytes are absent or changed: ${key}`);
      files.push({ path: ref.path, ...bytes.value });
    }
    const add = (path: string, value: unknown) => { const text = canonicalJson(value); files.push({ path, sha256: directHashBytes(text), bytesBase64: Buffer.from(text).toString("base64") }); return files.at(-1)!; };
    const d3File = add(`.ans/role-evidence/d3-${directHash(d3.requestId)}.json`, { createdBytesBase64: Buffer.from(decision.created).toString("base64"), resolvedBytesBase64: Buffer.from(decision.resolved).toString("base64") });
    const authorization = add(`.ans/role-evidence/authorization-${input.targetRoleId}.json`, { schema: "role-authorization/v1", flowId: input.flowId, roleId: input.targetRoleId,
      plan: { path: planRef.path, sha256: planRef.sha256 }, roster: { path: rosterRef.path, sha256: rosterRef.sha256 }, d3RequestId: d3.requestId, d3Source: d3.by,
      ...(d3.actionSource ? { actionSource: d3.actionSource } : { decisionId: d3.decisionId }), writesets: row.writesets });
    const activation = add(`.ans/role-evidence/activation-${directHash(input.operationId)}.json`, { schema: "role-activation/v1", input, actorRoleId: actor });
    const snapshotId = `s-activation-${directHash([input.flowId, input.operationId])}`, digest = completeSnapshotDigest(files);
    const saved = await store.prepareSnapshot({ schema: "complete-snapshot/v1", snapshotId, digest, files, createdAt: (deps.now ?? (() => new Date()))().toISOString() });
    if (!saved.ok) return invalid(saved.message ?? saved.reason);
    const snapshot = await store.readSnapshot!(saved.value); if (!snapshot.ok) return invalid(snapshot.message ?? snapshot.reason);
    const ref = (file: { path: string; sha256: string }) => ({ snapshotId, path: file.path, sha256: file.sha256 });
    const evidence = { roleId: input.targetRoleId, snapshotRef: saved.value, rosterRef: ref(rosterRef), planRef: ref(planRef), d3Ref: ref(d3File),
      activationRef: ref(activation), cardRef: ref(input.documents.card), boundaryMdRef: ref(input.documents.boundaryMd), boundaryYamlRef: ref(input.documents.boundaryYaml), authorizationRef: ref(authorization) };
    const old = current.activeRoles?.[input.targetRoleId], noOp = old !== undefined && ["rosterRef", "planRef", "d3Ref", "cardRef", "boundaryMdRef", "boundaryYamlRef", "authorizationRef"].every(key => {
      const field = key as Exclude<keyof typeof evidence, "roleId" | "snapshotRef" | "activationRef">; return old[field].path === evidence[field].path && old[field].sha256 === evidence[field].sha256;
    });
    const selected = noOp ? old! : evidence;
    const selectedSnapshot = noOp ? await store.readSnapshot!(selected.snapshotRef) : snapshot;
    if (!selectedSnapshot.ok) return invalid("Existing unchanged active evidence is unavailable");
    const roles = { ...current.activeRoles, [input.targetRoleId]: selected }, expectedActive = { revision: current.activeRevision ?? 0, digest: current.activeDigest ?? null };
    return { ok: true, value: { input, snapshot: selectedSnapshot.value, evidence: selected, expectedTrunk: { version: current.trunkVersion, digest: current.digest }, expectedActive,
      targetActive: { revision: noOp ? expectedActive.revision : expectedActive.revision + 1, digest: noOp ? expectedActive.digest! : directHash(roles) }, noOp,
      role: { roleId: input.targetRoleId, cardPath: canonical.card, boundaryMdPath: canonical.boundaryMd, boundaryYamlPath: canonical.boundaryYaml,
        allowedPaths: actualRoster.roster.modules.filter(module => selectedRole.modules.includes(module.id)).flatMap(module => module.paths.map(path => ({ path, kind: path.endsWith("/") ? "directory" as const : "file" as const }))) }, writesets: row.writesets } };
  } catch (error) { return invalid(String(error)); }
}

/** The only activation commit point is the independent, dual-fenced active pointer. */
export async function activateRoleDocuments(deps: TrunkServiceDeps, prepared: PreparedRoleActivation, checks: readonly TrunkRoleDocumentCheck[], boundaryEntries: readonly BoundaryEntry[]): Promise<ActivateRoleDocumentsResult> {
  const result = await activateRoleDocumentsInternal(deps, prepared, checks, boundaryEntries);
  return "preparationKind" in result ? directFailure(prepared.input.operationId, prepared.expectedActive.digest, "activation-preparation-only", "No active pointer committed") : result;
}
async function activateRoleDocumentsInternal(deps: TrunkServiceDeps, prepared: PreparedRoleActivation, checks: readonly TrunkRoleDocumentCheck[], boundaryEntries: readonly BoundaryEntry[], prepareOnly = false): Promise<ActivateRoleDocumentsResult | import("../abstract/trunk-service.ts").PreparedActivationCommit> {
  const { input, evidence } = prepared, { store } = deps;
  const rejected = (code: string, message: string): ActivateRoleDocumentsResult => ({ ok: false, status: "rejected", operationId: input.operationId,
    baseDigest: prepared.expectedActive.digest, targetDigest: null, errorCode: code, message });
  if (!isActivationMeta(prepared) || !store.readActiveRolesAt || !store.compareAndSwapActiveRoles || !store.writeOperation || !store.readOperation || !store.readSnapshot)
    return rejected("activation-evidence-invalid", "Complete prepared evidence and independent active CAS are required");
  const applicationId = `activation-${directHash([input.flowId, input.operationId])}`, journalId = `j-activation-${directHash(input.operationId).slice(0, 24)}`;
  let source: RoleDirectSource | undefined;
  let knownCommitted = false;
  const { snapshot: ignoredSnapshot, ...metadata } = prepared; void ignoredSnapshot;
  const metadataText = canonicalJson(metadata);
  const pending = (message: string): ActivateRoleDocumentsResult => ({ ok: false, status: "committed-pending-recovery", operationId: input.operationId,
    applicationId, journalId, baseDigest: prepared.expectedActive.digest, targetDigest: prepared.targetActive.digest, source,
    activationDigest: evidence.snapshotRef.digest, evidence, errorCode: "activation-metadata-pending", message });
  const finish = async (): Promise<ActivateRoleDocumentsResult | undefined> => {
    const state = await store.readActiveRolesAt!(prepared.targetActive);
    if (!state.ok) return undefined;
    const active = state.value.roles[input.targetRoleId];
    if (!active || canonicalJson(active) !== canonicalJson(evidence)) return undefined;
    const journal = await store.readOperation!(input.operationId);
    if (!journal.ok || journal.value.actionSource?.kind !== "role-direct" || journal.value.actionSource.action !== "activate-role-documents"
      || journal.value.message !== metadataText) return undefined;
    source = journal.value.actionSource;
    const base = { operationId: input.operationId, applicationId, journalId, baseDigest: source.baseDigest, targetDigest: source.targetDigest,
      source, activationDigest: evidence.snapshotRef.digest, evidence };
    if (journal.value.phase === "committed" && journal.value.result === "committed") return { ...base, ok: true, status: prepared.noOp ? "no-op" : "applied" };
    const saved = await store.writeOperation!({ ...journal.value, phase: "committed", result: "committed", updatedAt: (deps.now ?? (() => new Date()))().toISOString() });
    return saved.ok ? { ...base, ok: true, status: prepared.noOp ? "no-op" : "applied" }
      : { ...base, ok: false, status: "committed-pending-recovery", errorCode: "activation-metadata-pending", message: saved.message ?? saved.code };
  };
  try {
    const snapshot = await store.readSnapshot(evidence.snapshotRef);
    if (!snapshot.ok || snapshot.value.digest !== prepared.snapshot.digest || canonicalJson(snapshot.value.files) !== canonicalJson(prepared.snapshot.files)) return rejected("activation-bytes-invalid", "Prepared evidence differs from its actual immutable snapshot");
    const check = checks.find(check => check.roleId === input.targetRoleId);
    if (!check || !check.ok || check.snapshotDigest !== snapshot.value.digest || check.cardSha256 !== evidence.cardRef.sha256
      || check.boundaryMdSha256 !== evidence.boundaryMdRef.sha256 || check.boundaryYamlSha256 !== evidence.boundaryYamlRef.sha256)
      return rejected("activation-quality-unverified", "All three documents need a content-bound G validation result");
    const authorizationFile = snapshot.value.files.find(file => file.path === evidence.authorizationRef.path && file.sha256 === evidence.authorizationRef.sha256);
    const authorization: unknown = authorizationFile ? JSON.parse(Buffer.from(authorizationFile.bytesBase64, "base64").toString("utf8")) : undefined;
    if (!evidenceObject(authorization) || authorization.schema !== "role-authorization/v1" || authorization.roleId !== input.targetRoleId
      || authorization.flowId !== input.flowId || canonicalJson(authorization.writesets) !== canonicalJson(prepared.writesets)) return rejected("activation-authorization-invalid", "Execution writesets are not bound to the actual authorization bytes");
    const covered = (write: string) => boundaryEntries.some(entry => entry.root === "project" && entry.kind !== "conditional-directory"
      && (entry.kind === "file" ? write === entry.path : write === entry.path || write.startsWith(entry.path.endsWith("/") ? entry.path : `${entry.path}/`)));
    if (!prepared.writesets.length || !prepared.writesets.every(covered)) return rejected("activation-write-scope-invalid", "Actual plan writesets are not within the validated new role boundary");
    const previous = await store.readOperation(input.operationId);
    if (previous.ok) {
      if (previous.value.message !== metadataText || previous.value.actionSource?.kind !== "role-direct"
        || previous.value.actionSource.action !== "activate-role-documents" || previous.value.actionSource.actorRoleId !== "nominator")
        return rejected("activation-operation-conflict", "Operation id is bound to different activation evidence");
      const recovered = await finish(); if (recovered) return recovered;
    } else if (previous.reason !== "missing") return rejected("activation-journal-corrupt", `operation-${previous.reason}`);
    const current = await store.readManifest();
    if (!current.ok || current.value.flowId !== input.flowId || current.value.trunkVersion !== prepared.expectedTrunk.version || current.value.digest !== prepared.expectedTrunk.digest
      || (current.value.activeRevision ?? 0) !== prepared.expectedActive.revision || (current.value.activeDigest ?? null) !== prepared.expectedActive.digest)
      return rejected("activation-basis-conflict", "Document or active role basis changed before activation");
    const at = (deps.now ?? (() => new Date()))().toISOString();
    source = previous.ok ? previous.value.actionSource as RoleDirectSource : { kind: "role-direct", actorRoleId: "nominator", action: "activate-role-documents",
      operationId: input.operationId, applicationId, journalId, baseDigest: prepared.expectedActive.digest, targetDigest: prepared.targetActive.digest, at };
    const journal: TrunkApplyJournal = previous.ok ? previous.value : { v: 1, schema: TRUNK_APPLY_JOURNAL_SCHEMA, operationId: input.operationId, applicationId,
      journalId, flowId: input.flowId, phase: "prepared", message: metadataText, actionSource: source, targetSnapshot: evidence.snapshotRef,
      beforeSnapshot: current.value.snapshotRef, before: snapshotOfManifest(current.value), target: snapshotOfManifest(current.value), startedAt: at, updatedAt: at };
    if (prepareOnly) return { preparationKind: "active-role-commit", input: structuredClone(input), actorRoleId: "nominator", activation: structuredClone(prepared),
      checks: structuredClone(checks), boundaryEntries: structuredClone(boundaryEntries), baseTrunk: prepared.expectedTrunk,
      manifest: { ...current.value, activeRoles: { ...current.value.activeRoles, [input.targetRoleId]: evidence },
        activeRevision: prepared.targetActive.revision, activeDigest: prepared.targetActive.digest }, journal, snapshot: prepared.snapshot,
      expectedActive: prepared.expectedActive, expectedSnapshot: current.value.snapshotRef! };
    const saved = await store.writeOperation(journal); if (!saved.ok) return rejected("activation-journal-failed", saved.message ?? saved.code);
    if (prepared.noOp) return await finish() ?? rejected("activation-noop-unverified", "The unchanged active role could not be verified");
    const committed = await store.compareAndSwapActiveRoles(prepared.expectedTrunk, prepared.expectedActive,
      { ...prepared.targetActive, roles: { ...current.value.activeRoles, [input.targetRoleId]: evidence } });
    knownCommitted = committed.ok;
    const receipt = await finish();
    if (receipt) return receipt;
    return committed.ok ? pending("Active pointer committed; its recovery proof is temporarily unavailable") : rejected("activation-cas-conflict", committed.message ?? committed.code);
  } catch (error) {
    const recovered = await finish().catch(() => undefined); if (recovered) return recovered;
    if (knownCommitted) return pending(String(error));
    return { ok: false, status: "blocked", operationId: input.operationId, baseDigest: prepared.expectedActive.digest, targetDigest: null,
      errorCode: "activation-commit-unverified", message: String(error) };
  }
}

/** Bind the retained intent-confirm card to real bytes before any customer decision. */
export async function prepareIntentConfirmation(deps: TrunkServiceDeps, flowId: string): Promise<TrunkServiceResult<PreparedIntentConfirmation>> {
  const invalid = (message: string) => fail<PreparedIntentConfirmation>("trunk-item-invalid", message);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(flowId) || !deps.store.captureSnapshot || !deps.store.readSnapshot || !deps.store.readProjectFile) return invalid("An actual flow and immutable intent evidence storage are required");
  try {
    const candidates = (await scanVersionedDocuments(deps.projectRoot, { filePrefix: `${flowId}-`, maxFiles: 256, maxBytesPerFile: 256 * 1024 }))
      .filter(file => file.path.startsWith(`docs/product/${flowId}-intent-v`)).sort((a, b) => b.version - a.version);
    const intent = candidates[0]; if (!intent) return invalid("Write the actual versioned intent document before asking for confirmation");
    const bytes = await deps.store.readProjectFile(intent.path, { maxBytes: 256 * 1024 }); if (!bytes.ok) return invalid("Intent bytes are unreadable");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(bytes.value.bytesBase64, "base64"));
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    const shape: unknown = frontmatter ? parseYaml(frontmatter[1]!) : undefined;
    if (!evidenceObject(shape) || shape.schema !== "project-intent/v1" || (shape.flowId !== undefined && shape.flowId !== flowId)
      || (shape.version !== undefined && shape.version !== intent.version)) return invalid("Intent schema/flow/version differs from the actual document");
    const snapshot = await deps.store.captureSnapshot({ snapshotId: `s-intent-${directHash([flowId, intent.path, bytes.value.sha256])}`,
      createdAt: (deps.now ?? (() => new Date()))().toISOString(), files: [{ path: intent.path, sha256: bytes.value.sha256 }] });
    if (!snapshot.ok) return invalid(snapshot.message ?? snapshot.reason);
    const marker = `[ans-intent-evidence snapshot=${snapshot.value.snapshotId} path=${intent.path} sha256=${bytes.value.sha256} version=${intent.version}]`;
    return { ok: true, value: { flowId, path: intent.path, sha256: bytes.value.sha256, version: intent.version, snapshotRef: snapshot.value, text, marker } };
  } catch (error) { return invalid(String(error)); }
}

/**
 * 2026-11-09 judge-delegated（W-J2，P1.2 §3.3/§3.5）：冻结 source 与账本 `request.resolved`
 * （及其 `judge` 审计）逐字段一致性——从账本重放验证，不信任冻结记录自述。
 * G1 单一策略：只做类型/自洽/一致性核对，不设长度上界、不截断；任何非法形状 fail-closed、不抛错。
 */
function judgeIntentAuditMatchesSource(event: Extract<TaskStateEvent, { kind: "request.resolved" }>, source: JudgeDelegatedSource): boolean {
  if (event.by !== "judge") return false;
  const judge: unknown = event.judge;
  if (judge === null || typeof judge !== "object" || Array.isArray(judge)) return false;
  const audit = judge as Record<string, unknown>;
  const engine = audit["engine"], reasonCode = audit["reasonCode"], cardKind = audit["cardKind"], group = audit["group"];
  const model = audit["model"], reason = audit["reason"], selected = audit["selected"], confirmed = audit["confirmed"];
  if (typeof engine !== "string" || engine === "" || engine !== source.engine) return false;
  if (typeof reasonCode !== "string" || reasonCode === "" || reasonCode !== source.reasonCode) return false;
  if (typeof cardKind !== "string" || cardKind !== "intent-confirm" || source.cardKind !== "intent-confirm") return false;
  if (typeof group !== "string" || group !== governanceCardGroup(cardKind as GovernanceCardKind)) return false;
  if (event.operatorId !== source.operatorId || source.operatorId !== `judge:${source.engine}`) return false;
  if ((model ?? undefined) !== (source.model ?? undefined)) return false;
  if ((reason ?? undefined) !== (source.reason ?? undefined)) return false;
  if (selected !== undefined && (!Array.isArray(selected) || selected.some(part => typeof part !== "string"))) return false;
  const auditSelected = selected === undefined ? undefined : [...(selected as string[])];
  const sourceSelected = source.selected === undefined ? undefined : [...source.selected];
  if (canonicalJson(auditSelected) !== canonicalJson(sourceSelected)) return false;
  if (auditSelected !== undefined && canonicalJson(auditSelected) !== canonicalJson(event.selectedOptionIds)) return false;
  if (confirmed !== undefined && confirmed !== true) return false;
  if ((confirmed === true) !== (source.confirmed === true)) return false;
  if (event.actionSource !== undefined || event.directiveId !== undefined) return false;
  if (typeof event.requestId !== "string" || event.requestId === "" || event.decisionId !== `decision-${event.requestId}`) return false;
  return true;
}

/**
 * 2026-11-09 judge-delegated（W-J2，P1.2 §3.3）：由真实账本裁决构造 intent-confirmed 冻结。
 * `outcome.judge` 与 `resolved.judge` 逐字段对账（G1：摘要按账本原值复制、不截断）；
 * `operatorId === "judge:"+engine`；`decisionId === "decision-"+requestId`；禁止 actionSource/directiveId。
 * 任何非法形状返回 undefined（fail-closed，不抛错）。
 */
function judgeIntentConfirmFreeze(outcome: CustomerInputOutcome, resolved: Extract<TaskStateEvent, { kind: "request.resolved" }>, snapshotRef: PreparedIntentConfirmation["snapshotRef"]): DocFreezeRecord | undefined {
  if (outcome.outcome !== "answered" || outcome.judge === undefined || !evidenceObject(outcome.judge)) return undefined;
  if (resolved.by !== "judge" || !evidenceObject(resolved.judge)) return undefined;
  if (canonicalJson(outcome.judge) !== canonicalJson(resolved.judge)) return undefined;
  const audit = resolved.judge as Record<string, unknown>;
  const engine = audit["engine"], model = audit["model"], reasonCode = audit["reasonCode"], reason = audit["reason"];
  const selected = audit["selected"], confirmed = audit["confirmed"], cardKind = audit["cardKind"], group = audit["group"];
  if (typeof engine !== "string" || engine === "") return undefined;
  if (typeof reasonCode !== "string" || reasonCode === "") return undefined;
  if (typeof cardKind !== "string" || cardKind !== "intent-confirm") return undefined;
  if (typeof group !== "string" || group !== governanceCardGroup(cardKind as GovernanceCardKind)) return undefined;
  if (typeof resolved.requestId !== "string" || resolved.requestId === "" || resolved.decisionId !== `decision-${resolved.requestId}`) return undefined;
  if (resolved.operatorId !== outcome.operatorId || outcome.operatorId !== `judge:${engine}`) return undefined;
  if (resolved.actionSource !== undefined || resolved.directiveId !== undefined) return undefined;
  if (model !== undefined && typeof model !== "string") return undefined;
  if (reason !== undefined && typeof reason !== "string") return undefined;
  if (selected !== undefined && (!Array.isArray(selected) || selected.some(part => typeof part !== "string"))) return undefined;
  const auditSelected = selected === undefined ? undefined : [...(selected as string[])];
  if (auditSelected !== undefined && canonicalJson(auditSelected) !== canonicalJson(resolved.selectedOptionIds)) return undefined;
  if (confirmed !== undefined && confirmed !== true) return undefined;
  const source: JudgeDelegatedSource = {
    kind: "judge-delegated",
    requestId: resolved.requestId,
    engine,
    ...(model !== undefined ? { model: model as string } : {}),
    operatorId: `judge:${engine}`,
    reasonCode,
    ...(reason !== undefined ? { reason: reason as string } : {}),
    ...(auditSelected !== undefined ? { selected: auditSelected } : {}),
    ...(confirmed === true ? { confirmed: true as const } : {}),
    cardKind,
    at: resolved.at,
  };
  return { schema: "doc-freeze/v1", applicationId: `intent-${resolved.requestId}`, reason: "intent-confirmed", origin: "judge-delegated",
    source, snapshotRef, frozenAt: resolved.at };
}

/** Only an actually persisted retained-card confirmation can create intent-confirmed R9 evidence. */
export async function finalizeIntentConfirmation(deps: TrunkServiceDeps, prepared: PreparedIntentConfirmation, outcome: CustomerInputOutcome): Promise<TrunkServiceResult<{ path: string; sha256: string }>> {
  const invalid = (message: string) => fail<{ path: string; sha256: string }>("trunk-item-invalid", message);
  if (outcome.outcome !== "answered" || !outcome.value.selected?.includes("confirm") || outcome.value.selected.includes("revise")
    || outcome.directive || !deps.store.readSnapshot || !deps.store.readProjectFile) return invalid("No real retained-card confirmation to freeze");
  try {
    const snapshot = await deps.store.readSnapshot(prepared.snapshotRef), live = await deps.store.readProjectFile(prepared.path);
    if (!snapshot.ok || !live.ok || live.value.sha256 !== prepared.sha256 || !snapshot.value.files.some(file => file.path === prepared.path && file.sha256 === prepared.sha256)) return invalid("Intent changed while its exact bytes were being confirmed");
    const read = await readOperationEvents(deps.projectRoot); if (!read.ok) return invalid(read.reason);
    let resolved: Extract<TaskStateEvent, { kind: "request.resolved" }> | undefined;
    const delegated = outcome.actionSource?.kind === "chief-delegated" ? outcome.actionSource : undefined;
    for (const row of read.records) {
      if (row.value.kind !== "request.resolved") continue;
      if (delegated ? row.value.requestId !== delegated.requestId : row.value.decisionId !== outcome.decisionId || !outcome.decisionId) continue;
      const event = validateTaskStateEvent(row.value); if (!event.ok || event.event.kind !== "request.resolved") return invalid("Actual confirmation ledger is invalid");
      resolved = event.event;
    }
    if (!resolved || resolved.cardKind !== "intent-confirm" || !resolved.selectedOptionIds?.includes("confirm") || resolved.selectedOptionIds.includes("revise")) return invalid("No matching actual intent-confirm resolution");
    const request = read.records.find(row => row.value.kind === "request.created" && row.value.requestId === resolved!.requestId)?.value;
    if (!request || request.flowId !== prepared.flowId || request.sourceRoleId !== "chief" || request.cardKind !== "intent-confirm"
      || typeof request.context !== "string" || !request.context.includes(prepared.marker)) return invalid("Confirmation was not presented with this application's bound intent bytes");
    let freeze: DocFreezeRecord;
    if (delegated) {
      if (outcome.decisionId !== undefined || resolved.decisionId !== undefined || resolved.by !== "chief-delegated"
        || canonicalJson(resolved.actionSource) !== canonicalJson(delegated) || delegated.disposition !== "select") return invalid("Chief confirmation must retain its true source without fabricated customer ids");
      freeze = { schema: "doc-freeze/v1", applicationId: `intent-${resolved.requestId}`, reason: "intent-confirmed", origin: "chief-delegated",
        actorRoleId: "chief", source: delegated, snapshotRef: prepared.snapshotRef, frozenAt: resolved.at };
    } else if (resolved.by === "judge") {
      // 2026-11-09 judge-delegated（W-J2/I-01..I-03）：客户开启「替我决策」后的 judge approve 是真实保留卡确认；
      // 冻结如实携带 judge 来源，不写 decidedBy/decisionId/actorRoleId（不冒充客户）。客户/幕僚分支逐字不变。
      const judged = outcome.outcome === "answered" ? judgeIntentConfirmFreeze(outcome, resolved, prepared.snapshotRef) : undefined;
      if (!judged) return invalid("Judgement source is not a real judge delegation");
      freeze = judged;
    } else {
      if (resolved.by !== "customer" || !resolved.decisionId || resolved.judge || resolved.directiveId) return invalid("Confirmation source is not a real customer decision");
      freeze = { schema: "doc-freeze/v1", applicationId: `intent-${resolved.requestId}`, reason: "intent-confirmed", origin: "customer", decidedBy: "customer",
        decisionId: resolved.decisionId, source: { kind: "customer-decision", decisionId: resolved.decisionId, requestId: resolved.requestId, at: resolved.at }, snapshotRef: prepared.snapshotRef, frozenAt: resolved.at };
    }
    if (!isValidDocFreezeRecord(freeze)) return invalid("Confirmation source is invalid");
    const old = (await deps.freezeRegistry.listFreezes()).find(entry => entry.path === prepared.path && entry.freeze.reason === "intent-confirmed");
    if (old) return old.sha256 === prepared.sha256 ? { ok: true, value: { path: prepared.path, sha256: prepared.sha256 } } : invalid("Existing confirmed intent bytes conflict");
    const stored = await deps.freezeRegistry.appendDocFreezeRecords([{ path: prepared.path, version: prepared.version, sha256: prepared.sha256, freeze }]);
    if (!stored.ok) return invalid(`Actual decision was recorded; intent evidence requires recovery: appendDocFreezeRecords/${stored.code}/${stored.message ?? stored.code}; path=${prepared.path}; version=${prepared.version}; sha256=${prepared.sha256}; snapshot=${prepared.snapshotRef.snapshotId}`);
    await deps.freezeRegistry.refreshSnapshot();
    return { ok: true, value: { path: prepared.path, sha256: prepared.sha256 } };
  } catch (error) { return invalid(`Actual confirmation evidence is pending recovery: ${String(error)}`); }
}

/** Freeze current document and activation bytes together for one actual draft run. */
export async function prepareExecutionRun(deps: TrunkServiceDeps, input: { runId: string; flowId: string; operationId: string }): Promise<TrunkServiceResult<PreparedExecutionRun>> {
  const invalid = (message: string) => fail<PreparedExecutionRun>("trunk-verify-failed", message), { store } = deps;
  if (!input.operationId || !store.readRunRecord || !store.readActiveRoleEvidence || !store.prepareSnapshot) return invalid("Actual run and complete evidence storage are required");
  try {
    const read = await store.readRunRecord(input.runId);
    if (!read.ok || read.value.value.schema !== "ans-run/v1" || read.value.value.flowId !== input.flowId) return invalid("No actual same-flow draft run");
    const raw = read.value.value;
    if (raw.state === "pinned") {
      const old = await readRunEvidence(deps, input.runId); if (!old.ok) return invalid("Old run lacks its historical evidence; never refill it from live files");
      if (!evidenceObject(raw.documentCommit) || typeof raw.documentCommit.version !== "number" || typeof raw.documentCommit.digest !== "string"
        || !evidenceObject(raw.activeBasis) || typeof raw.activeBasis.revision !== "number" || typeof raw.activeBasis.digest !== "string") return invalid("Old pin has no actual source identities");
      const roles: PreparedExecutionRun["roles"] = [];
      for (const [roleId, evidence] of Object.entries(old.value.frozenRoles)) {
        const authorization = old.value.snapshot.files.find(file => file.path === evidence.authorizationRef.path);
        const scope: unknown = authorization ? JSON.parse(Buffer.from(authorization.bytesBase64, "base64").toString("utf8")) : undefined;
        if (!evidenceObject(scope) || !Array.isArray(scope.writesets) || scope.writesets.some(path => typeof path !== "string")) return invalid("Pinned authorization bytes are invalid");
        roles.push({ roleId, cardPath: evidence.cardRef.path, boundaryMdPath: evidence.boundaryMdRef.path, boundaryYamlPath: evidence.boundaryYamlRef.path,
          allowedPaths: (scope.writesets as string[]).map(path => ({ path, kind: path.endsWith("/") ? "directory" : "file" })) });
      }
      return { ok: true, value: { ...input, alreadyPinned: true, expectedRunSha256: read.value.sha256,
        expectedTrunk: { version: raw.documentCommit.version, digest: raw.documentCommit.digest }, expectedActive: { revision: raw.activeBasis.revision, digest: raw.activeBasis.digest },
        snapshot: old.value.snapshot, nextRun: raw, roles } };
    }
    if (raw.state !== "draft") return invalid("Only a real draft can become a new execution run");
    if (raw.schemas !== undefined && (!evidenceObject(raw.schemas) || Object.values(raw.schemas).some(value => typeof value !== "string")))
      return invalid("The actual draft schema declarations are malformed");
    const effective = await readEffectiveSnapshot(deps); if (!effective.ok) return invalid(effective.message ?? effective.code);
    const current = effective.value.manifest, snapshot = effective.value.snapshot;
    if (current.flowId !== input.flowId || !hasExecutionWorkflow(current)) return invalid("Execution requires the real applicable workflow; planning-only publication cannot create it");
    const rosterRef = current.artifacts.documents.roster, modulesRef = current.artifacts.documents.modules, planRef = current.artifacts.execution.teamPlan;
    if (!rosterRef || !modulesRef || !planRef || !current.activeRevision || !current.activeDigest || !current.activeRoles) return invalid("Execution needs real roster/modules/complete plan and active roles");
    const text = (path: string) => { const file = snapshot.files.find(file => file.path === path); return file ? Buffer.from(file.bytesBase64, "base64").toString("utf8") : undefined; };
    const roster = parseProjectRoster(text(rosterRef.path) ?? "", input.flowId), modules = parseProjectModules(text(modulesRef.path) ?? "", input.flowId);
    if (!roster.ok || !modules.ok || canonicalJson(roster.roster.modules) !== canonicalJson(modules.doc.modules)) return invalid("Execution roster/modules ownership is inconsistent");
    const planVersion = /-team-v([1-9]\d*)\.md$/.exec(planRef.path)?.[1];
    const plan = parseTeamPlan(text(planRef.path) ?? "", { flowId: input.flowId, version: Number(planVersion), modules: modulesRef, roster: rosterRef, rosterFacts: roster.roster });
    if (!plan.ok) return invalid(plan.reason);
    const files = new Map(snapshot.files.map(file => [file.path, { ...file }])), roles: PreparedExecutionRun["roles"] = [];
    const activeForRun: Record<string, typeof current.activeRoles[string]> = {};
    for (const role of roster.roster.roles) {
      const evidence = current.activeRoles[role.id], row = plan.plan.roleRows.find(row => row.roleId === role.id);
      if (!evidence || !row || evidence.rosterRef.sha256 !== rosterRef.sha256 || evidence.planRef.sha256 !== planRef.sha256) return invalid(`Role ${role.id} has no activation for this actual plan/roster`);
      const active = await store.readActiveRoleEvidence(evidence); if (!active.ok) return invalid(`Role ${role.id} has incomplete activation bytes`);
      const authFile = active.value.files.find(file => file.path === evidence.authorizationRef.path), d3File = active.value.files.find(file => file.path === evidence.d3Ref.path);
      const auth: unknown = authFile ? JSON.parse(Buffer.from(authFile.bytesBase64, "base64").toString("utf8")) : undefined;
      const decisionBytes: unknown = d3File ? JSON.parse(Buffer.from(d3File.bytesBase64, "base64").toString("utf8")) : undefined;
      if (!evidenceObject(auth) || auth.schema !== "role-authorization/v1" || auth.roleId !== role.id || auth.flowId !== input.flowId
        || canonicalJson(auth.writesets) !== canonicalJson(row.writesets) || !evidenceObject(decisionBytes)
        || typeof decisionBytes.createdBytesBase64 !== "string" || typeof decisionBytes.resolvedBytesBase64 !== "string") return invalid(`Role ${role.id} has invalid authorization or D3 bytes`);
      const created = validateTaskStateEvent(JSON.parse(Buffer.from(decisionBytes.createdBytesBase64, "base64").toString("utf8")));
      const resolved = validateTaskStateEvent(JSON.parse(Buffer.from(decisionBytes.resolvedBytesBase64, "base64").toString("utf8")));
      // 2026-11-09 judge-delegated（W-J2/I-32/F11）：judge 来源经共享校验；chief/customer 分支逐字保留。
      const judgeD3 = resolved.ok && resolved.event.kind === "request.resolved" && resolved.event.by === "judge" && isJudgeD3Resolution(resolved.event);
      if (!created.ok || created.event.kind !== "request.created" || created.event.cardKind !== "appointment" || created.event.sourceRoleId !== "nominator" || created.event.flowId !== input.flowId
        || !resolved.ok || resolved.event.kind !== "request.resolved" || resolved.event.requestId !== created.event.requestId || resolved.event.cardKind !== "appointment"
        || !resolved.event.targetRoleIds?.includes(role.id) || resolved.event.rosterSha256 !== rosterRef.sha256 || resolved.event.rosterVersion !== roster.roster.version
        || (resolved.event.by !== "customer" && resolved.event.by !== "chief-delegated" && !judgeD3) || (resolved.event.by === "chief-delegated" && resolved.event.decisionId !== undefined))
        return invalid(`Role ${role.id} is not authorized by its real frozen D3`);
      for (const file of active.value.files) {
        const original = files.get(file.path), documentRef = [...Object.values(current.artifacts.documents), ...Object.values(current.artifacts.execution), current.artifacts.workflow].find(ref => ref?.path === file.path);
        if (original && original.sha256 !== file.sha256 && documentRef) return invalid("Document and role activation references conflict");
        files.set(file.path, { ...file });
      }
      activeForRun[role.id] = evidence;
      roles.push({ roleId: role.id, cardPath: evidence.cardRef.path, boundaryMdPath: evidence.boundaryMdRef.path, boundaryYamlPath: evidence.boundaryYamlRef.path,
        allowedPaths: roster.roster.modules.filter(module => role.modules.includes(module.id)).flatMap(module => module.paths.map(path => ({ path, kind: path.endsWith("/") ? "directory" as const : "file" as const }))) });
    }
    if ([...files.values()].reduce((total, file) => total + Buffer.from(file.bytesBase64, "base64").length, 0) > 16 * 1024 * 1024) return invalid("Run evidence byte budget exceeded");
    const snapshotId = `s-run-${directHash([input.runId, input.operationId, current.digest, current.activeDigest])}`, digest = completeSnapshotDigest([...files.values()]);
    const saved = await store.prepareSnapshot({ schema: "complete-snapshot/v1", snapshotId, digest, files: [...files.values()], createdAt: (deps.now ?? (() => new Date()))().toISOString() });
    if (!saved.ok) return invalid(saved.message ?? saved.reason);
    const stored = await store.readSnapshot!(saved.value); if (!stored.ok) return invalid(stored.message ?? stored.reason);
    const expectedTrunk = { version: current.trunkVersion, digest: current.digest }, expectedActive = { revision: current.activeRevision, digest: current.activeDigest };
    const basesRead = await store.readExecutionBases?.({ trunk: expectedTrunk, active: expectedActive, snapshot: current.snapshotRef });
    if (basesRead && !basesRead.ok && basesRead.reason !== "missing") return invalid(basesRead.message ?? basesRead.reason);
    const gitBases = basesRead?.ok ? basesRead.value : undefined;
    const sourceTask = gitBases ? await deliveredControllerSource(deps, gitBases) : undefined;
    if (sourceTask && !sourceTask.ok) return invalid(sourceTask.message ?? sourceTask.code);
    const codeRead = gitBases ? { ok: true as const, value: gitBases.codeBasis } : await store.readCodeBasis?.({ trunk: expectedTrunk, active: expectedActive, snapshot: current.snapshotRef });
    if (codeRead && !codeRead.ok && codeRead.reason !== "missing") return invalid(codeRead.message ?? codeRead.reason);
    const codeBasis = codeRead?.ok ? codeRead.value : undefined;
    const pinDigest = directHash({ runId: input.runId, flowId: input.flowId, document: { version: current.trunkVersion, digest: current.digest },
      active: { revision: current.activeRevision, digest: current.activeDigest }, snapshot: saved.value, ...(gitBases ?? (codeBasis ? { codeBasis } : {})) });
    const frozenRoles: Record<string, FrozenRoleEvidence> = {};
    for (const [roleId, evidence] of Object.entries(activeForRun)) {
      frozenRoles[roleId] = { ...evidence, runId: input.runId, pinDigest, snapshotRef: saved.value,
        rosterRef: { ...evidence.rosterRef, snapshotId }, planRef: { ...evidence.planRef, snapshotId }, d3Ref: { ...evidence.d3Ref, snapshotId }, activationRef: { ...evidence.activationRef, snapshotId },
        cardRef: { ...evidence.cardRef, snapshotId }, boundaryMdRef: { ...evidence.boundaryMdRef, snapshotId }, boundaryYamlRef: { ...evidence.boundaryYamlRef, snapshotId }, authorizationRef: { ...evidence.authorizationRef, snapshotId } };
    }
    const at = (deps.now ?? (() => new Date()))().toISOString();
    return { ok: true, value: { ...input, alreadyPinned: false, expectedRunSha256: read.value.sha256, expectedTrunk, expectedActive, expectedDocumentSnapshot: current.snapshotRef, snapshot: stored.value, roles,
      ...(sourceTask?.ok && sourceTask.value ? { expectedCodeSourceTask: sourceTask.value } : {}),
      nextRun: { ...raw, schemas: { ...(evidenceObject(raw.schemas) ? raw.schemas : {}), run: raw.schema }, state: "pinned", pinnedBy: "app", pinnedAt: at, updatedAt: at, documents: current.artifacts.documents, execution: current.artifacts.execution,
        rosterVersion: roster.roster.version, roles: roster.roster.roles.map(role => role.id), snapshotRef: saved.value, pinDigest, frozenRoles,
        workflowRef: { snapshotId, path: current.artifacts.workflow.path, sha256: current.artifacts.workflow.sha256 }, documentCommit: expectedTrunk, activeBasis: expectedActive, pinOperationId: input.operationId,
         ...(gitBases ?? (codeBasis ? { codeBasis } : {})) } } };
  } catch (error) { return invalid(String(error)); }
}

export async function pinExecutionRun(deps: TrunkServiceDeps, prepared: PreparedExecutionRun, checks: readonly TrunkRoleDocumentCheck[]): Promise<TrunkServiceResult<ExecutionRunBasis>> {
  const invalid = (message: string) => fail<ExecutionRunBasis>("trunk-verify-failed", message), { store } = deps;
  if (!store.compareAndSwapRunRecord || !store.readSnapshot || !isSnapshotRef(prepared.nextRun.snapshotRef) || !evidenceObject(prepared.nextRun.frozenRoles)
    || prepared.nextRun.runId !== prepared.runId || prepared.nextRun.flowId !== prepared.flowId) return invalid("Prepared run evidence is invalid");
  const actual = await store.readSnapshot(prepared.nextRun.snapshotRef);
  if (!actual.ok || actual.value.digest !== prepared.snapshot.digest) return invalid("Run snapshot bytes are unavailable");
  for (const role of prepared.roles) {
    const evidence = prepared.nextRun.frozenRoles[role.roleId], check = checks.find(check => check.roleId === role.roleId);
    if (!isFrozenRoleEvidence(evidence) || evidence.runId !== prepared.runId || evidence.pinDigest !== prepared.nextRun.pinDigest || evidence.snapshotRef.digest !== actual.value.digest
      || !check || check.snapshotDigest !== actual.value.digest || check.cardSha256 !== evidence.cardRef.sha256 || check.boundaryMdSha256 !== evidence.boundaryMdRef.sha256
      || check.boundaryYamlSha256 !== evidence.boundaryYamlRef.sha256 || !FROZEN_ROLE_REF_KEYS.every(key => actual.value.files.some(file => file.path === evidence[key].path && file.sha256 === evidence[key].sha256)))
      return invalid(`Missing content-bound role validation for ${role.roleId}`);
  }
  if (prepared.alreadyPinned) return readRunEvidence(deps, prepared.runId);
  if (prepared.nextRun.runChangeSource !== undefined) return invalid("A prepared restart target can only be pinned by its actual stopped-old-run transition");
  const gitBases = isRunGitBases(prepared.nextRun) ? { codeBasis: prepared.nextRun.codeBasis, documentGitBasis: prepared.nextRun.documentGitBasis, codeBasisSource: prepared.nextRun.codeBasisSource } : undefined;
  const written = await store.compareAndSwapRunRecord(prepared.runId, prepared.expectedRunSha256, prepared.nextRun,
    { trunk: prepared.expectedTrunk, active: prepared.expectedActive, snapshot: prepared.expectedDocumentSnapshot,
      ...(gitBases ? { gitBases } : {}), ...(prepared.expectedCodeSourceTask ? { sourceTask: prepared.expectedCodeSourceTask } : {}),
      ...(isGitBasis(prepared.nextRun.codeBasis) ? { codeBasis: prepared.nextRun.codeBasis } : {}) });
  const read = await readRunEvidence(deps, prepared.runId);
  if (read.ok && read.value.pinDigest === prepared.nextRun.pinDigest) return read;
  return invalid(written.ok ? "Committed run pin requires recovery verification" : written.message ?? written.code);
}

/** Draft permission is only the actual selected three-document paths, and never changes active roles. */
export async function prepareRoleDraftScope(deps: TrunkServiceDeps, input: { flowId?: string; taskId?: string }): Promise<TrunkServiceResult<RoleDraftScope>> {
  const invalid = (message: string) => fail<RoleDraftScope>("trunk-item-invalid", message);
  try {
    const ledger = await readOperationEvents(deps.projectRoot); if (!ledger.ok) return invalid(ledger.reason);
    let flowId = input.flowId;
    if (input.taskId) {
      const records = ledger.records.filter(row => row.value.kind === "task.created" && row.value.taskId === input.taskId);
      const created = records[0]?.value;
      if (records.length !== 1 || created?.to !== "nominator" || created.from !== "chief" || typeof created.flowId !== "string"
        || (flowId !== undefined && flowId !== created.flowId)) return invalid("Draft task is not the actual chief-to-nominator flow task");
      flowId = created.flowId;
    }
    const effective = await readEffectiveSnapshot(deps); if (!effective.ok) return invalid(effective.message ?? effective.code);
    const current = effective.value.manifest; flowId ??= current.flowId;
    const rosterRef = current.artifacts.documents.roster, modulesRef = current.artifacts.documents.modules, planRef = current.artifacts.execution.teamPlan;
    if (flowId !== current.flowId || !rosterRef || !modulesRef || !planRef || !deps.store.listOperationRecords) return invalid("Draft preparation needs the actual complete plan, modules and roster");
    const operations = await deps.store.listOperationRecords(); if (!operations.ok) return invalid(operations.message ?? operations.reason);
    const completions = operations.value.filter(operation => operation.flowId === flowId && operation.actionSource?.kind === "role-direct"
      && operation.actionSource.action === "complete-team-plan" && operation.actionSource.actorRoleId === "convener"
      && operation.target.execution.teamPlan?.path === planRef.path && operation.target.execution.teamPlan.sha256 === planRef.sha256)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    let proof: Awaited<ReturnType<typeof readDirectOperation>> | undefined;
    for (const operation of completions) { const read = await readDirectOperation(deps, operation.operationId!); if (read.ok) { proof = read; break; } }
    if (!proof?.ok) return invalid("The actual convener has not completed this plan");
    const files = effective.value.snapshot.files, text = (path: string) => { const file = files.find(file => file.path === path); return file ? Buffer.from(file.bytesBase64, "base64").toString("utf8") : ""; };
    const roster = parseProjectRoster(text(rosterRef.path), flowId), modules = parseProjectModules(text(modulesRef.path), flowId);
    if (!roster.ok || !modules.ok || canonicalJson(roster.roster.modules) !== canonicalJson(modules.doc.modules)) return invalid("Draft owner scope differs from the actual roster/modules");
    const plan = parseTeamPlan(text(planRef.path), { flowId, version: Number(/-team-v([1-9]\d*)\.md$/.exec(planRef.path)?.[1]), modules: modulesRef, roster: rosterRef, rosterFacts: roster.roster });
    if (!plan.ok) return invalid(plan.reason);
    const requests = new Set<string>(); let decision: Extract<TaskStateEvent, { kind: "request.resolved" }> | undefined;
    for (const row of ledger.records) {
      if (row.value.kind !== "request.created" && row.value.kind !== "request.resolved") continue;
      const event = validateTaskStateEvent(row.value); if (!event.ok) return invalid(event.message);
      if (event.event.kind === "request.created" && event.event.cardKind === "appointment" && event.event.flowId === flowId && event.event.sourceRoleId === "nominator") requests.add(event.event.requestId);
      if (event.event.kind === "request.resolved" && event.event.cardKind === "appointment" && requests.has(event.event.requestId)) decision = event.event;
    }
    // 2026-11-09 judge-delegated（W-J2/I-33/F11）：judge 来源经共享校验；d3Reference 统一走共享参考值。
    const judgeD3 = decision !== undefined && decision.by === "judge" && isJudgeD3Resolution(decision);
    if (!decision || (decision.by !== "customer" && decision.by !== "chief-delegated" && !judgeD3) || !decision.targetRoleIds?.length
      || decision.rosterVersion !== roster.roster.version || decision.rosterSha256 !== rosterRef.sha256
      || (decision.by === "customer" ? !decision.decisionId : decision.by === "chief-delegated" ? decision.decisionId !== undefined : false)
      || decision.targetRoleIds.some(roleId => !roster.roster.roles.some(role => role.id === roleId) || !plan.plan.roleRows.some(row => row.roleId === roleId)))
      return invalid("No actual current D3 selects the draft roles for this plan/roster");
    const d3Reference = requestResolvedD3DecisionId(decision);
    if (d3Reference === undefined) return invalid("No actual current D3 selects the draft roles for this plan/roster");
    return { ok: true, value: { flowId, basisDigest: current.digest, d3RequestId: decision.requestId,
      d3Reference,
      paths: decision.targetRoleIds.flatMap(roleId => ["role-card.md", "boundary.md", "boundary.yaml"].map(name => `角色卡/${roleId}/${name}`)) } };
  } catch (error) { return invalid(String(error)); }
}

/**
 * X-R6（E2 S2）：chief hub 可派发目标判定——唯一真源 = 角色模块纯数据 `CHIEF_HUB_DISPATCH.targetRoleIds`
 * （迁移前五内置字面量，同值）。只回答“是否 hub 目标”，不授予派发权限；权限/事务/账本/证据核验仍由
 * 本 Service 既有校验与调用方硬授权共同决定。
 */
function isChiefHubDispatchTarget(roleId: string): boolean {
  return CHIEF_HUB_DISPATCH.targetRoleIds.some((targetRoleId) => targetRoleId === roleId);
}

/**
 * Formal handoff/worker dispatch preflight. A report alone never releases a plan dependency.
 *
 * X-R4（E2 S3）消费边界（仅角色侧**纯数据**；R-2）：
 *  - worker 派发目标的允许内置集改读已装配 convener 模块的 `CONVENER_WORKER_DISPATCH_TARGETS`
 *    （经 `workflow-preconditions.isConvenerBuiltInDispatchTarget`）；迁移前为字面量
 *    `targetRoleId === "verifier"`，集合等价（`["verifier"]`），0 行为差异。
 *  - run/module/D3/roster/交付属主、hub/legacy/review 路由与报告时点**仍在本 Service**
 *    （冻结路径校验、任务/账本/证据核验）——不从模块扩张，也不因模块化放宽。
 *  - `prepareRoleDispatch` 的 Service 首检（来源/目标/冻结 run/模块/依赖收口）逐字保留；
 *    角色侧策略前置（team-plan/stable-write/requirement-change）由 Pipeline/能力注入层调用，
 *    本 Service 不重复、也不替代。
 *
 * X-R5（verifier）核对结论——**无适用路由条件替换项**（记录理由）：
 *  - convener→内置目标的 review 路由已由 X-R4 改读来源模块纯数据（`isConvenerBuiltInDispatchTarget`）；
 *  - 本文件其余 `targetRoleId/to/from === "verifier"` 条件均为 Service 任务身份、账本事件、review
 *    材料/证据绑定（如 `readReviewTaskContext`、`isControllerReviewTask`、delivery 证据闭包）⇒ 保留；
 *  - hub 目标列表（`["product",…,"verifier"]`）属 **chief 来源**路由，归 X-R6 收口（E0 R-2）；
 *  - **不调用** verifier 模块 `dispatch()`：E2 评审 X-2/X-4 明确目标模块为 diff-only，接入生产会
 *    把 convener→verifier 的 `kind=project` 事实误判为 `target-kind-mismatch`（旧行为 allow）。
 *  - 唯一的 verifier 角色侧消费 = `prepareReviewTask` 的 review preflight（S4，见上）。
 *
 * X-R6（chief）消费边界（仅角色侧**纯数据**；R-2）：
 *  - `prepareRoleDispatch` 的 hub 分支来源/目标/路由/purpose/schema 改读 `CHIEF_HUB_DISPATCH`
 *    （`sourceRoleId`/`targetRoleIds`/`routing`/`purpose`/`workSourceSchema`）；迁移前为同值字面量，
 *    0 行为差异。非 hub 的 chief→built-in 文档/协调/角色准备路由的来源判定同读 `sourceRoleId`；
 *    具体目标映射仍属引擎路由。
 *  - review 目标仍要求显式 `targetRoleId === "verifier"` + 真实 convener controller 证据（本模块的
 *    review 路由语义不在 hub 纯数据内）；报告路由仍按真实 task creator（`workflow-preconditions`）。
 *  - **保留**：任务身份/账本事件/工作源字节与证据核验（含 `inspectAssignedTask`、journal apply 中的
 *    hub 来源绑定与 `task.to` 五内置校验）——证据核验面不因模块化放宽，目标表副本不构成第二权限源。
 *  - **不调用** chief 模块 `dispatch()`：S3 硬授权组合属 `workflow-preconditions`/桌面单元（E2 评审
 *    C-3/C-4），本 Service 不做来源模块派发判定。
 */
export async function prepareRoleDispatch(deps: TrunkServiceDeps, input: { fromRoleId: string; targetRoleId: string; flowId: string; runId?: string; moduleId?: string;
  parentTaskId?: string; reviewTarget?: DispatchTaskReviewTarget; hostInitialization?: import("../abstract/trunk-service.ts").RepositoryInitializationContext; hubRouting?: import("../../../model/runtime.ts").TaskHubRouting }): Promise<RoleDispatchResult> {
  const invalid = (message: string): RoleDispatchResult => ({ ok: false, code: "trunk-verify-failed", message });
  try {
    if (input.hubRouting === CHIEF_HUB_DISPATCH.routing) {
      const host = input.hostInitialization;
      if (input.fromRoleId !== CHIEF_HUB_DISPATCH.sourceRoleId || !isChiefHubDispatchTarget(input.targetRoleId)
        || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(input.flowId) || !host || host.parent.roleId !== CHIEF_HUB_DISPATCH.sourceRoleId || host.parent.inputAccepted !== true || host.parent.settled !== false
        || host.registration.source !== "native-directory-selection" || !host.registration.selectionId || !Number.isSafeInteger(host.registration.listingGeneration)
        || host.registration.listingGeneration < 1 || !Number.isFinite(Date.parse(host.registration.selectedAt))
        || (!host.creatorReports && host.parent.kind !== undefined && host.parent.kind !== "message")) return invalid("Ordinary builtin preparation requires the actual current chief input and project identity");
      const root = await readGitInitializationFacts(deps.projectRoot), selected = await readGitInitializationFacts(host.registration.selectedRoot), registered = await readGitInitializationFacts(host.registration.projectRoot);
      if (root.projectRoot !== selected.projectRoot || root.projectRoot !== registered.projectRoot) return invalid("Builtin preparation project identity differs from the actual host source");
      const creator = host.creatorReports ? await creatorReportSource(deps, input.flowId, host.creatorReports, true, true) : undefined;
      if (creator && !creator.ok) return invalid(creator.message ?? creator.code);
      if (!deps.store.writeInitializationSource || !deps.store.readRunRecord || !deps.store.compareAndSwapRunRecord) return invalid("Builtin task/source storage is unavailable");
      let finalReview: import("../abstract/trunk-service.ts").ReviewMaterial | undefined;
      if (input.reviewTarget !== undefined) {
        if (input.targetRoleId !== "verifier" || input.moduleId !== undefined || input.parentTaskId !== undefined || !isDispatchTaskReviewTarget(input.reviewTarget)) return invalid("Only an explicit exact verifier review target can request final review without a worker module/parent");
        const proof = await readGitCandidateEvidence(deps.projectRoot, input.reviewTarget.operationId, input.reviewTarget.candidate);
        const controller = proof.ok ? proof.value.journal.candidateSource : undefined;
        if (!controller || (controller.kind !== "run-integration" && controller.kind !== "run-revert") || controller.roleId !== "convener" || controller.flowId !== input.flowId)
          return invalid("Final review target has no actual same-flow integration controller");
        const prepared = await prepareReviewTask(deps, { parentTaskId: controller.taskId, flowId: controller.flowId, runId: controller.runId, target: input.reviewTarget });
        if (!prepared.ok) return invalid(prepared.message ?? prepared.code);
        finalReview = prepared.value;
      }
      const reviewControllerRef = finalReview ? { kind: "convener-controller" as const, taskId: finalReview.parentTaskId, flowId: finalReview.flowId,
        runId: finalReview.runId, reviewBasisRef: finalReview.reviewBasisRef } : undefined;
      const execution = input.targetRoleId === "convener" && creator?.ok && !finalReview ? await readRestartExecutionSelection(deps, input.flowId, creator.value.reports) : undefined;
      if (execution && !execution.ok) return invalid(execution.message ?? execution.code);
      const executionRunSelection = execution?.ok ? execution.value.selection : undefined;
      const sourceId = `init-source-${directHash([CHIEF_HUB_DISPATCH.routing, host.registration.selectionId, host.parent.sessionId, host.parent.turnId, input.flowId, input.targetRoleId, ...(finalReview ? [finalReview.reviewBasisRef] : []), ...(executionRunSelection ? [executionRunSelection] : [])])}`;
      const runId = finalReview?.runId ?? executionRunSelection?.replacementRunId ?? `run-hub-${directHash(sourceId).slice(0, 48)}`;
      const body = canonicalJson({ schema: CHIEF_HUB_DISPATCH.workSourceSchema, kind: creator ? "creator-report" : "customer-turn", purpose: CHIEF_HUB_DISPATCH.purpose, hubRouting: CHIEF_HUB_DISPATCH.routing,
        sourceId, flowId: input.flowId, projectRoot: root.projectRoot, targetRoleId: input.targetRoleId, planningRunId: runId, registration: host.registration, parent: host.parent,
        ...(creator?.ok ? { creatorReports: creator.value.reports } : {}), ...(finalReview ? { reviewBasisRef: finalReview.reviewBasisRef, reviewControllerRef } : {}),
        ...(executionRunSelection ? { executionRunSelection } : {}) });
      const stored = await deps.store.writeInitializationSource(sourceId, Buffer.from(body).toString("base64")); if (!stored.ok) return invalid(stored.message ?? stored.reason);
      if (finalReview) return { ok: true, value: { kind: "review", purpose: CHIEF_HUB_DISPATCH.purpose, hubRouting: CHIEF_HUB_DISPATCH.routing, flowId: input.flowId, runId,
        basisDigest: directHash({ sourceId, review: finalReview.reviewBasisRef, runSha256: finalReview.runRecordSha256 }), reviewBasisRef: finalReview.reviewBasisRef, reviewControllerRef,
        initializationSource: { sourceId, ...stored.value, kind: creator ? "chief-creator-report" : "chief-customer-turn" } } };
      if (executionRunSelection) return { ok: true, value: { kind: "execution", purpose: CHIEF_HUB_DISPATCH.purpose, hubRouting: CHIEF_HUB_DISPATCH.routing, flowId: input.flowId, runId,
        basisDigest: directHash({ sourceId, executionRunSelection }),
        initializationSource: { sourceId, ...stored.value, kind: "chief-creator-report" } } };
      const prior = await deps.store.readRunRecord(runId);
      if (prior.ok) {
        if (prior.value.value.state !== "draft" || prior.value.value.flowId !== input.flowId || prior.value.value.builtinPreparationSource !== sourceId) return invalid("Builtin draft belongs to another source/state");
      } else {
        if (prior.reason !== "missing") return invalid(prior.message ?? prior.reason);
        const at = (deps.now ?? (() => new Date()))().toISOString();
        const saved = await deps.store.compareAndSwapRunRecord(runId, null, { schema: "ans-run/v1", runId, flowId: input.flowId, state: "draft", createdAt: at, updatedAt: at,
          schemas: { run: "ans-run/v1" }, documents: {}, execution: { teamPlan: null, flow: null }, builtinPreparationSource: sourceId });
        if (!saved.ok) return invalid(saved.message ?? saved.code);
      }
      return { ok: true, value: { kind: "planning", purpose: CHIEF_HUB_DISPATCH.purpose, hubRouting: CHIEF_HUB_DISPATCH.routing, flowId: input.flowId, runId,
        basisDigest: directHash({ projectRoot: root.projectRoot, sourceId }), initializationSource: { sourceId, ...stored.value, kind: creator ? "chief-creator-report" : "chief-customer-turn" } } };
    }
    const coordination = input.fromRoleId === CHIEF_HUB_DISPATCH.sourceRoleId && input.targetRoleId === "convener" ? await readEffectiveSnapshot(deps) : undefined;
    const teamPlanning = coordination?.ok === true;
    const rolePreparation = input.fromRoleId === CHIEF_HUB_DISPATCH.sourceRoleId && input.targetRoleId === "nominator";
    if (input.fromRoleId === CHIEF_HUB_DISPATCH.sourceRoleId && (["product", "rapporteur"].includes(input.targetRoleId) || teamPlanning || rolePreparation)) {
      const host = input.hostInitialization;
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(input.flowId) || !host || host.registration.source !== "native-directory-selection" || !host.registration.selectionId
        || !Number.isSafeInteger(host.registration.listingGeneration) || host.registration.listingGeneration < 1 || !Number.isFinite(Date.parse(host.registration.selectedAt))
        || host.parent.roleId !== CHIEF_HUB_DISPATCH.sourceRoleId || host.parent.inputAccepted !== true || host.parent.settled !== false
        || (host.creatorReports === undefined && host.parent.kind !== undefined && host.parent.kind !== "message"))
        return invalid("Document preparation requires the actual registered root and current accepted chief customer work source");
      const root = await readGitInitializationFacts(deps.projectRoot), selected = await readGitInitializationFacts(host.registration.selectedRoot), registered = await readGitInitializationFacts(host.registration.projectRoot);
      if (root.projectRoot !== selected.projectRoot || root.projectRoot !== registered.projectRoot || root.state === "unsupported" || root.parentRepositories.length || root.reasons.length)
        return invalid(`Document preparation root/selection is unproven: ${JSON.stringify({
          root: { projectRoot: root.projectRoot, state: root.state, parentRepositories: root.parentRepositories, reasons: root.reasons },
          selected: { projectRoot: selected.projectRoot, state: selected.state, parentRepositories: selected.parentRepositories, reasons: selected.reasons },
          registered: { projectRoot: registered.projectRoot, state: registered.state, parentRepositories: registered.parentRepositories, reasons: registered.reasons },
        })}`);
      const creator = host.creatorReports !== undefined ? await creatorReportSource(deps, input.flowId, host.creatorReports, true) : undefined;
      if (creator && !creator.ok) return invalid(creator.message ?? creator.code);
      const current = await deps.store.readManifest(); let initializationOperationId: string | undefined;
      if (!current.ok && current.reason !== "missing") {
        const initial = current.message === "git-media-has-no-effective-ref" ? await deps.store.readInitialGitPublicationBasis?.(input.flowId) : undefined;
        if (!initial?.ok) return invalid(initial ? initial.message ?? initial.reason : current.message ?? current.reason);
        initializationOperationId = initial.value.initializationOperationId;
      }
      const effective = current.ok ? await readEffectiveSnapshot(deps) : undefined;
      if (effective && (!effective.ok || effective.value.manifest.flowId !== input.flowId)) return invalid(effective.ok ? "Document preparation belongs to another effective flow" : effective.message ?? effective.code);
      if (teamPlanning || rolePreparation) {
        if (!effective?.ok) return invalid("Team planning needs an actual complete publication");
        const { manifest, snapshot } = effective.value, { proposal, modules, roster } = manifest.artifacts.documents;
        if (!proposal || !modules || !roster) return invalid("Planning coordination needs the actual proposal/modules/roster basis");
        const text = (path: string) => { const file = snapshot.files.find(file => file.path === path); return file ? Buffer.from(file.bytesBase64, "base64").toString("utf8") : ""; };
        const rosterFacts = parseProjectRoster(text(roster.path), input.flowId), modulesFacts = parseProjectModules(text(modules.path), input.flowId);
        if (!rosterFacts.ok || !modulesFacts.ok) return invalid("Planning roster or modules are invalid");
        if (teamPlanning) {
          const checked = evaluatePlanningHandoff({ ...input, proposal, modules, roster, rosterFacts: rosterFacts.roster, modulesFacts: modulesFacts.doc });
          if (!checked.ok) return invalid(checked.reason);
        } else if (canonicalJson(rosterFacts.roster.modules) !== canonicalJson(modulesFacts.doc.modules)) return invalid("Role preparation roster/modules differ");
        const chain = await validateUpgradeChain(deps.projectRoot, { flowId: input.flowId, documents: manifest.artifacts.documents, rosterChanged: true, planningOnly: true, snapshot });
        if (!chain.ok) return invalid(chain.message ?? chain.code);
      }
      const intent = input.targetRoleId === "rapporteur" || teamPlanning || rolePreparation ? await documentPreparationIntent(deps, input.flowId, !teamPlanning && !rolePreparation && creator?.ok ? creator.value.reports : undefined,
        effective?.ok ? effective.value : undefined) : undefined;
      if (intent && !intent.ok) return invalid(intent.message ?? intent.code);
      const rolePlan = rolePreparation ? await rolePreparationPlan(deps, input.flowId, creator?.ok ? creator.value.reports : undefined) : undefined;
      if (rolePlan && !rolePlan.ok) return invalid(rolePlan.message ?? rolePlan.code);
      if (!deps.store.writeInitializationSource || !deps.store.compareAndSwapRunRecord || !deps.store.readRunRecord) return invalid("Actual work-source and planning draft storage are unavailable");
      const documentBasis = current.ok ? { version: current.value.trunkVersion, digest: current.value.digest, snapshotRef: current.value.snapshotRef } : null;
      const purpose = rolePreparation ? "role-preparation" : teamPlanning ? "team-planning" : "document-preparation";
      const sourceId = `init-source-${directHash([purpose, host.creatorReports ? "creator-report" : "customer-turn", host.registration.selectionId, host.parent.sessionId, host.parent.turnId, input.flowId, input.targetRoleId])}`;
      const runId = `run-${rolePreparation ? "roles" : teamPlanning ? "plan" : "docs"}-${directHash(sourceId).slice(0, 48)}`, basisDigest = directHash({ root: root.projectRoot, flowId: input.flowId, documentBasis });
      const body = canonicalJson({ schema: "repository-work-source/v1", kind: host.creatorReports ? "creator-report" : "customer-turn", purpose, sourceId,
        flowId: input.flowId, projectRoot: root.projectRoot, targetRoleId: input.targetRoleId, planningRunId: runId, documentBasis, registration: host.registration, parent: host.parent,
        ...(creator?.ok ? { creatorReports: creator.value.reports } : {}), ...(intent?.ok ? { intentConfirmation: intent.value.intent } : {}),
        ...(rolePlan?.ok ? { planCompletion: rolePlan.value.plan } : {}),
        ...(initializationOperationId ? { initializationOperationId } : {}) });
      const stored = await deps.store.writeInitializationSource(sourceId, Buffer.from(body).toString("base64"));
      if (!stored.ok) return invalid(stored.message ?? stored.reason);
      const prior = await deps.store.readRunRecord(runId);
      if (prior.ok) {
        if (prior.value.value.state !== "draft" || prior.value.value.flowId !== input.flowId || prior.value.value.documentPreparationSource !== sourceId) return invalid("Existing planning draft belongs to another source or execution state");
      } else {
        if (prior.reason !== "missing") return invalid(prior.message ?? prior.reason);
        const at = (deps.now ?? (() => new Date()))().toISOString();
        const written = await deps.store.compareAndSwapRunRecord(runId, null, { schema: "ans-run/v1", runId, flowId: input.flowId, state: "draft", createdAt: at, updatedAt: at,
          schemas: { run: "ans-run/v1" }, documents: {}, execution: { teamPlan: null, flow: null }, documentPreparationSource: sourceId });
        if (!written.ok) return invalid(written.message ?? written.code);
      }
      return { ok: true, value: { kind: "planning", purpose, flowId: input.flowId, runId, basisDigest, initializationSource: { sourceId, ...stored.value,
        kind: host.creatorReports ? "chief-creator-report" : "chief-customer-turn" } } };
    }
    if (input.reviewTarget !== undefined || input.fromRoleId === "convener" && isConvenerBuiltInDispatchTarget(input.targetRoleId)) {
      if (input.fromRoleId !== "convener" || !isConvenerBuiltInDispatchTarget(input.targetRoleId) || !input.parentTaskId || !input.runId || !isDispatchTaskReviewTarget(input.reviewTarget))
        return invalid("Final verifier coordination needs its actual parent/run and an explicit ordinary expected candidate target");
      const prepared = await prepareReviewTask(deps, { parentTaskId: input.parentTaskId, flowId: input.flowId, runId: input.runId, target: input.reviewTarget });
      if (!prepared.ok) return invalid(prepared.message ?? prepared.code);
      return { ok: true, value: { kind: "review", flowId: input.flowId, runId: input.runId,
        basisDigest: directHash({ ref: prepared.value.reviewBasisRef, runSha256: prepared.value.runRecordSha256 }), reviewBasisRef: prepared.value.reviewBasisRef,
        parentTaskRef: prepared.value.parentTaskRef } };
    }
    if (input.fromRoleId === CHIEF_HUB_DISPATCH.sourceRoleId && input.targetRoleId === "convener") {
      const effective = await readEffectiveSnapshot(deps);
      if (!effective.ok) {
        const stored = await deps.store.readManifest();
        if (stored.ok || stored.reason !== "missing" || !deps.store.readGitInitializationFacts) return invalid(effective.message ?? effective.code);
        const initial = await deps.store.readGitInitializationFacts();
        const host = input.hostInitialization;
        if (!host || host.registration.source !== "native-directory-selection" || !host.registration.selectionId || !Number.isSafeInteger(host.registration.listingGeneration)
          || host.registration.listingGeneration < 1 || !Number.isFinite(Date.parse(host.registration.selectedAt)) || host.parent.roleId !== CHIEF_HUB_DISPATCH.sourceRoleId
          || host.creatorReports !== undefined || (host.parent.kind !== undefined && host.parent.kind !== "message"))
          return invalid("Repository initialization requires the actual native project selection and accepted chief turn");
        const selected = await readGitInitializationFacts(host.registration.selectedRoot), registered = await readGitInitializationFacts(host.registration.projectRoot);
        if (selected.projectRoot !== initial.projectRoot || registered.projectRoot !== initial.projectRoot) return invalid("Native selected root differs from the actual registered project root");
        if (initial.state !== "absent" || !initial.applicationStatePresent || initial.parentRepositories.length || initial.reasons.length)
          return invalid(`Repository initialization root is unproven: ${initial.reasons.join("; ") || initial.state}`);
        if (!deps.store.writeInitializationSource) return invalid("Durable initialization work-source storage is unavailable");
        const contentBasis = directHash({ root: initial.projectRoot, state: initial.state, parents: initial.parentRepositories,
          files: initial.files.filter(file => file.source !== "application-state") });
        const sourceId = `init-source-${directHash({ selection: host.registration.selectionId, session: host.parent.sessionId, turn: host.parent.turnId, flowId: input.flowId })}`;
        const body = canonicalJson({ schema: "repository-work-source/v1", kind: "customer-turn", sourceId, flowId: input.flowId,
          projectRoot: initial.projectRoot, contentBasisDigest: contentBasis, registration: host.registration, parent: host.parent });
        const storedSource = await deps.store.writeInitializationSource(sourceId, Buffer.from(body).toString("base64"));
        if (!storedSource.ok) return invalid(storedSource.message ?? storedSource.reason);
        // Infrastructure coordination only. No existing file is granted, no future plan/D3/worker readiness is synthesized.
        return { ok: true, value: { kind: "planning", purpose: "repository-initialization", flowId: input.flowId, basisDigest: directHash({ root: contentBasis, host }),
          initializationSource: { sourceId, ...storedSource.value } } };
      }
      const { manifest, snapshot } = effective.value;
      const proposal = manifest.artifacts.documents.proposal, modules = manifest.artifacts.documents.modules, roster = manifest.artifacts.documents.roster;
      if (manifest.flowId !== input.flowId || !proposal || !modules || !roster) return invalid("Planning coordination needs the actual proposal/modules/roster basis");
      const text = (path: string) => { const file = snapshot.files.find(file => file.path === path); return file ? Buffer.from(file.bytesBase64, "base64").toString("utf8") : ""; };
      const rosterFacts = parseProjectRoster(text(roster.path), input.flowId), modulesFacts = parseProjectModules(text(modules.path), input.flowId);
      if (!rosterFacts.ok || !modulesFacts.ok) return invalid("Planning roster or modules are invalid");
      const checked = evaluatePlanningHandoff({ ...input, proposal, modules, roster, rosterFacts: rosterFacts.roster, modulesFacts: modulesFacts.doc });
      if (!checked.ok) return invalid(checked.reason);
      const chain = await validateUpgradeChain(deps.projectRoot, { flowId: input.flowId, documents: manifest.artifacts.documents,
        rosterChanged: true, planningOnly: true, snapshot });
      if (!chain.ok) return invalid(chain.message ?? chain.code);
      return { ok: true, value: { kind: "planning", flowId: input.flowId, basisDigest: manifest.digest } };
    }
    if (input.fromRoleId !== "convener" || !input.runId) return invalid("Worker execution requires the actual convener and a real frozen run");
    const basis = await readRunEvidence(deps, input.runId); if (!basis.ok) return invalid(basis.message ?? basis.code);
    if (basis.value.flowId !== input.flowId) return invalid("Dispatch flow differs from the actual frozen run");
    const evidence = basis.value.frozenRoles[input.targetRoleId]; if (!evidence) return invalid("Target is not authorized in this actual run pin");
    const file = (ref: { path: string; sha256: string }) => basis.value.snapshot.files.find(file => file.path === ref.path && file.sha256 === ref.sha256);
    const rosterFile = file(evidence.rosterRef), planFile = file(evidence.planRef), authFile = file(evidence.authorizationRef);
    if (!rosterFile || !planFile || !authFile) return invalid("Frozen dispatch documents are missing");
    const roster = parseProjectRoster(Buffer.from(rosterFile.bytesBase64, "base64").toString("utf8"), input.flowId);
    if (!roster.ok) return invalid(roster.reason);
    const documents = basis.value.run.documents;
    const modulesRef = evidenceObject(documents) && evidenceObject(documents.modules) ? documents.modules : undefined;
    if (!modulesRef || typeof modulesRef.path !== "string" || typeof modulesRef.sha256 !== "string") return invalid("Run lacks its frozen authoritative modules reference");
    const plan = parseTeamPlan(Buffer.from(planFile.bytesBase64, "base64").toString("utf8"), { flowId: input.flowId,
      version: Number(/-team-v([1-9]\d*)\.md$/.exec(evidence.planRef.path)?.[1]), modules: { path: modulesRef.path, sha256: modulesRef.sha256 },
      roster: { path: evidence.rosterRef.path, sha256: evidence.rosterRef.sha256 }, rosterFacts: roster.roster });
    if (!plan.ok) return invalid(plan.reason);
    const role = roster.roster.roles.find(role => role.id === input.targetRoleId), row = plan.plan.roleRows.find(row => row.roleId === input.targetRoleId);
    const moduleId = input.moduleId ?? (role?.modules.length === 1 ? role.modules[0] : undefined);
    if (!role || !row || !moduleId || !role.modules.includes(moduleId)) return invalid("Dispatch module is absent, ambiguous or belongs to a different role");
    const module = roster.roster.modules.find(module => module.id === moduleId)!;
    const authorization: unknown = JSON.parse(Buffer.from(authFile.bytesBase64, "base64").toString("utf8"));
    if (!evidenceObject(authorization) || authorization.schema !== "role-authorization/v1" || authorization.roleId !== input.targetRoleId
      || canonicalJson(authorization.writesets) !== canonicalJson(row.writesets)) return invalid("Dispatch authorization differs from the frozen completed plan");
    const modulePaths = row.writesets.filter(write => module.paths.some(root => root === write || (root.endsWith("/") && write.startsWith(root))));
    if (!modulePaths.length) return invalid("This module has no authorized planned writeset");
    const events = await readOperationEvents(deps.projectRoot); if (!events.ok) return invalid(events.reason);
    const parsedEvents: TaskStateEvent[] = [];
    for (const row of events.records) { const event = validateTaskStateEvent(row.value); if (!event.ok) return invalid(event.message); parsedEvents.push(event.event); }
    const blockedDependencies: Array<{ roleId: string; moduleId: string }> = [];
    for (const dependencyId of row.dependsOn) {
      const dependency = plan.plan.roleRows.find(role => role.roleId === dependencyId)!;
      for (const dependencyModule of dependency.modules) {
        const created = parsedEvents.filter((event): event is Extract<TaskStateEvent, { kind: "task.created" }> => event.kind === "task.created"
          && event.runId === input.runId && event.flowId === input.flowId && event.to === dependencyId && event.moduleId === dependencyModule).at(-1);
        const closed = created ? parsedEvents.filter((event): event is TaskClosedEvent => event.kind === "task.closed" && event.taskId === created.taskId).at(-1) : undefined;
        if (!created || created.from !== "convener" || !closed || closed.by !== created.from || closed.outcome !== "accepted"
          || closed.actionSource?.kind !== "role-direct" || closed.actionSource.action !== "close-created-task" || closed.actionSource.runId !== input.runId)
          blockedDependencies.push({ roleId: dependencyId, moduleId: dependencyModule });
      }
    }
    if (blockedDependencies.length) return { ok: false, code: "trunk-verify-failed", message: "Plan dependencies await the actual creator's accepted closure; reports do not release them", blockedDependencies };
    return { ok: true, value: { kind: "execution", flowId: input.flowId, basisDigest: basis.value.pinDigest, runId: input.runId, moduleId, modulePaths,
      documentContext: { runId: input.runId, pinDigest: basis.value.pinDigest, frozenRoleEvidence: evidence } } };
  } catch (error) { return invalid(String(error)); }
}
