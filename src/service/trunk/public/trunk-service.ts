// src/service/trunk/public/trunk-service.ts
// 主干 Service 公共出口（编排 B-3 / S2）：显式 re-export 抽象契约 + 组合工厂。
// 消费方：S4 `trunk-runtime`/`version-change-runtime`、C2c `createVersionChangeService`
// 的 `trunk` 依赖（`current`/`latestFrozenVersion`/`applyStableSnapshot`）、测试。
// 不 wildcard 导出 impl 内部；不定义第二份形状。

import { TRUNK_AMENDMENT_SCHEMA } from "../../../model/trunk.ts";
import { createProjectTrunkStore } from "../../../provider/trunk/public/trunk-store.ts";
import { createGuardFreezeRegistry, operationDeliveryRecorded, recordOperationDelivery } from "../../../provider/version-change/public/version-change-store.ts";
import type { TrunkAmendmentState, TrunkDocKind, TrunkManifest } from "../../../model/trunk.ts";
import type { TrunkServiceDeps } from "../abstract/trunk-service.ts";
import type { DirectTrunkService } from "../abstract/trunk-service.ts";
import { canTransitionAmendment, validateAmendmentState } from "../impl/amendment-validate.ts";
import { detectBoundaryExpansion, detectStableBoundaryExpansion } from "../impl/amendment-expansion.ts";
import { executeApply, reconcileJournal, executeDirect, recoverDirect, readEffectiveSnapshot, prepareDecisionEvidence, checkDecisionEvidence, prepareDirectSubmission, createDirectCommitPort, createRunChangePort, readDirectOperation, readRunEvidence, selectRunChange, prepareCreatedTaskClose, completeTeamPlan, recordTaskObservation, closeCreatedTask, prepareRoleActivation, activateRoleDocuments, prepareIntentConfirmation, finalizeIntentConfirmation, prepareExecutionRun, pinExecutionRun, prepareRoleDraftScope, prepareRoleDispatch, prepareAssignedTaskWriteScope, inspectAssignedTask, prepareParentTaskRef, prepareReviewTask, readAssignedReviewContext, prepareControllerResume, prepareControllerStop, confirmControllerStop, inspectQueuedControllerResume, resolveDeliveryAssignment, classifyClosedTaskNotice, readTaskProcessSource, inspectExecutionCodeSource } from "../impl/apply-journal.ts";
import { applyStableSnapshot } from "../impl/stable-snapshot.ts";
import { abandonUpgradeTrunk, refreezeTrunk, trunkHistory } from "../impl/refreeze.ts";
import { validateUpgradeChain } from "../impl/upgrade-validate.ts";
import { deriveTrunk } from "../impl/trunk-derive.ts";
import { pathFamilyOfPath } from "../impl/trunk-common.ts";
import { recoverTrunk } from "../impl/trunk-recovery.ts";
import { verifyTrunk } from "../impl/trunk-verify.ts";
import {
  selectTargetVersion,
  snapshotItemHashes,
  validateAmendment,
} from "../impl/amendment-validate.ts";

/**
 * 组合工厂：构建 `TrunkService`（deps = S1 `TrunkStore` + S1 `FreezeRegistryStore` +
 * 可选 S3 `RunRepinPort`）。不读盘以外的副作用、不发事件、不写账本、不启动后台任务。
 */
export function createTrunkService(input: TrunkServiceDeps | Pick<TrunkServiceDeps, "projectRoot">): DirectTrunkService {
  const deps: TrunkServiceDeps = "store" in input ? input : {
    projectRoot: input.projectRoot,
    store: createProjectTrunkStore(input.projectRoot),
    freezeRegistry: createGuardFreezeRegistry(input.projectRoot),
  };
  const now = deps.now ?? (() => new Date());
  const projectRoot = deps.projectRoot;

  return {
    ...createDirectCommitPort(deps),
    ...createRunChangePort(deps),
    classifyClosedTaskNotice(input) { return classifyClosedTaskNotice(deps, input); },
    resolveDeliveryAssignment(input) { return resolveDeliveryAssignment(deps, input); },
    inspectAssignedTask(input) { return inspectAssignedTask(deps, input); },
    readTaskProcessSource(input) { return readTaskProcessSource(deps, input); },
    inspectExecutionCodeSource(bases) { return inspectExecutionCodeSource(deps, bases); },
    prepareParentTaskRef(input) { return prepareParentTaskRef(deps, input); },
    inspectQueuedControllerResume(input) { return inspectQueuedControllerResume(deps, input); },
    prepareControllerStop(input) { return prepareControllerStop(deps, input); },
    confirmControllerStop(expected) { return confirmControllerStop(deps, expected); },
    prepareControllerResume(input) { return prepareControllerResume(deps, input); },
    prepareReviewTask(input) { return prepareReviewTask(deps, input); },
    readAssignedReviewContext(input) { return readAssignedReviewContext(deps, input); },
    prepareAssignedTaskWriteScope(input) { return prepareAssignedTaskWriteScope(deps, input); },
    directDeliveryRecorded(key) { return operationDeliveryRecorded(projectRoot, key); },
    recordDirectDelivery(key) { return recordOperationDelivery(projectRoot, key); },
    prepareRoleDispatch(input) { return prepareRoleDispatch(deps, input); },
    prepareRoleDraftScope(input) { return prepareRoleDraftScope(deps, input); },
    prepareExecutionRun(input) { return prepareExecutionRun(deps, input); },
    pinExecutionRun(prepared, checks) { return pinExecutionRun(deps, prepared, checks); },
    prepareIntentConfirmation(flowId) { return prepareIntentConfirmation(deps, flowId); },
    finalizeIntentConfirmation(prepared, outcome) { return finalizeIntentConfirmation(deps, prepared, outcome); },
    prepareRoleActivation(input, actor) { return prepareRoleActivation(deps, input, actor); },
    activateRoleDocuments(prepared, checks, entries) { return activateRoleDocuments(deps, prepared, checks, entries); },
    recordTaskObservation(event) { return recordTaskObservation(deps, event); },
    closeCreatedTask(input, actor) { return closeCreatedTask(deps, input, actor); },
    completeTeamPlan(input, actor) { return completeTeamPlan(deps, input, actor); },
    prepareCreatedTaskClose(taskId, actor) { return prepareCreatedTaskClose(deps, taskId, actor); },
    selectRunChange(input, actor) { return selectRunChange(deps, input, actor); },
    readRunEvidence(runId) { return readRunEvidence(deps, runId); },
    prepareDirectSubmission(input, actor) { return prepareDirectSubmission(deps, input, actor); },
    executeDirect(input) { return executeDirect(deps, input); },
    recoverDirect(operationId) { return recoverDirect(deps, operationId); },
    readDirectOperation(operationId) { return readDirectOperation(deps, operationId); },
    readEffectiveSnapshot() { return readEffectiveSnapshot(deps); },
    prepareDecisionEvidence(input) { return prepareDecisionEvidence(deps, input); },
    checkDecisionEvidence(verification) { return checkDecisionEvidence(deps, verification); },
    async status() {
      const read = await deps.store.readManifest();
      const amendmentRead = await deps.store.readAmendment();
      const journalRead = await deps.store.readJournal();
      const amendment =
        amendmentRead.ok
          ? {
              amendmentId: amendmentRead.value.amendmentId,
              status: amendmentRead.value.status,
              applyState: amendmentRead.value.applyState,
              ...(amendmentRead.value.applicationId !== undefined
                ? { applicationId: amendmentRead.value.applicationId }
                : {}),
            }
          : undefined;
      const journal =
        journalRead.ok
          ? {
              journalId: journalRead.value.journalId,
              phase: journalRead.value.phase,
              ...(journalRead.value.result !== undefined ? { result: journalRead.value.result } : {}),
            }
          : undefined;

      if (!read.ok) {
        const issues = read.reason === "corrupt" ? [`manifest: corrupt (${read.message ?? "invalid"})`] : [];
        if (read.reason !== "missing") return { availability: "unavailable", derived: false, frozenDocuments: [], stable: {}, pendingReattach: [],
          ...(amendment !== undefined ? { amendment } : {}), ...(journal !== undefined ? { journal } : {}), issues: [...issues, `manifest: ${read.message ?? read.reason}`] };
        const derived = await deriveTrunk(projectRoot, now);
        if (!derived.ok) {
          return {
            availability: "unavailable",
            derived: false,
            frozenDocuments: [],
            stable: {},
            ...(amendment !== undefined ? { amendment } : {}),
            ...(journal !== undefined ? { journal } : {}),
            pendingReattach: [],
            issues: [...issues, `${derived.code}: ${derived.message ?? ""}`],
          };
        }
        const manifest = derived.value.manifest;
        return {
          availability: "derived",
          manifest,
          derived: true,
          frozenDocuments: documentList(manifest),
          stable: {
            workflow: manifest.artifacts.workflow,
            ...(manifest.artifacts.roleCards !== undefined ? { roleCards: manifest.artifacts.roleCards } : {}),
            boundaries: manifest.artifacts.boundaries,
          },
          ...(amendment !== undefined ? { amendment } : {}),
          ...(journal !== undefined ? { journal } : {}),
          pendingReattach: [],
          issues: derived.value.issues,
        };
      }

      const manifest = read.value;
      const applyUncertain =
        journal !== undefined &&
        journal.phase !== "committed" &&
        journal.result !== "committed" &&
        journal.result !== "apply-failed";
      return {
        availability: applyUncertain ? "apply-uncertain" : "frozen",
        manifest,
        derived: false,
        frozenDocuments: documentList(manifest),
        stable: {
          workflow: manifest.artifacts.workflow,
          ...(manifest.artifacts.roleCards !== undefined ? { roleCards: manifest.artifacts.roleCards } : {}),
          boundaries: manifest.artifacts.boundaries,
        },
        ...(amendment !== undefined ? { amendment } : {}),
        ...(journal !== undefined ? { journal } : {}),
        pendingReattach: [],
        issues: [],
      };
    },

    verify() {
      return verifyTrunk({ projectRoot, store: deps.store, freezeRegistry: deps.freezeRegistry, now });
    },

    derive() {
      return deriveTrunk(projectRoot, now);
    },

    validateAmendment(input) {
      return validateAmendment({ projectRoot, store: deps.store, ...input });
    },

    snapshotItemHashes(items) {
      return snapshotItemHashes({ projectRoot, store: deps.store, items });
    },

    detectBoundaryExpansion(items) {
      return detectBoundaryExpansion({ projectRoot, items });
    },

    selectTargetVersion(input) {
      return selectTargetVersion({ projectRoot, path: input.path });
    },

    async recordAmendment(state: TrunkAmendmentState) {
      const problem = validateAmendmentState(state);
      if (problem !== undefined) return { ok: false, code: "trunk-amendment-invalid", message: problem };
      const existing = await deps.store.readAmendment();
      if (!existing.ok && existing.reason === "corrupt") {
        return { ok: false, code: "trunk-amendment-invalid", message: "现有 amendment.json 损坏（fail-closed）" };
      }
      if (existing.ok && existing.value.amendmentId !== state.amendmentId) {
        return { ok: false, code: "trunk-amendment-conflict", message: "已有其他进行中修正案" };
      }
      if (existing.ok && !canTransitionAmendment(existing.value.status, state.status)) {
        return {
          ok: false,
          code: "trunk-amendment-status-invalid",
          message: `修正案状态 ${existing.value.status} → ${state.status} 非法`,
        };
      }
      const written = await deps.store.writeAmendment({ ...state, schema: TRUNK_AMENDMENT_SCHEMA });
      if (!written.ok) {
        return { ok: false, code: "trunk-amendment-invalid", message: written.message ?? "amendment 写入失败" };
      }
      return { ok: true, value: state };
    },

    async readAmendment() {
      const read = await deps.store.readAmendment();
      if (read.ok) return { ok: true, value: read.value };
      if (read.reason === "missing") return { ok: true, value: undefined };
      return { ok: false, code: "trunk-amendment-invalid", message: `amendment.json 损坏：${read.message ?? read.reason}` };
    },

    executeApply(input) {
      return executeApply(deps, input);
    },

    reconcileJournal() {
      return reconcileJournal(deps);
    },

    recover(input) {
      return recoverTrunk(deps, input);
    },

    applyStableSnapshot(input) {
      return applyStableSnapshot(deps, input);
    },

    refreeze(input) {
      return refreezeTrunk(deps, input);
    },

    abandonUpgrade(input) {
      return abandonUpgradeTrunk(deps, input);
    },

    history() {
      return trunkHistory(deps);
    },

    validateUpgradeChain(input) {
      return validateUpgradeChain(deps.projectRoot, input);
    },

    detectStableBoundaryExpansion(input) {
      return detectStableBoundaryExpansion(input);
    },

    async current() {
      const read = await deps.store.readManifest();
      if (!read.ok) return null;
      return { trunkVersion: read.value.trunkVersion, runId: read.value.runId, digest: read.value.digest };
    },

    async latestFrozenVersion(family: string) {
      let freezes;
      try {
        freezes = await deps.freezeRegistry.listFreezes();
      } catch {
        return undefined;
      }
      let latest: number | undefined;
      for (const entry of freezes) {
        if (pathFamilyOfPath(entry.path.replace(/\\/g, "/")) !== family) continue;
        if (latest === undefined || entry.version > latest) latest = entry.version;
      }
      return latest;
    },
  };
}

function documentList(manifest: TrunkManifest): Array<{
  kind: TrunkDocKind;
  path: string;
  sha256: string;
  version?: number;
}> {
  const out: Array<{ kind: TrunkDocKind; path: string; sha256: string; version?: number }> = [];
  for (const [kind, ref] of Object.entries(manifest.artifacts.documents)) {
    if (ref === undefined) continue;
    out.push({
      kind: kind as TrunkDocKind,
      path: ref.path,
      sha256: ref.sha256,
      ...(ref.version !== undefined ? { version: ref.version } : {}),
    });
  }
  return out;
}

// —————————————— 抽象契约（re-export，不复制） ——————————————

export type {
  RoleDispatchPreparation,
  RoleDispatchResult,
  ReviewMaterial,
  PreparedReviewTask,
  RoleDraftScope,
  PreparedExecutionRun,
  PreparedIntentConfirmation,
  PreparedRoleActivation,
  CompletedTeamPlanReceipt,
  CreatedTaskCloseBasis,
  ExecutionRunBasis,
  TrunkDirectApplyInput,
  TrunkRoleDocumentCheck,
  DecisionEvidenceInput,
  DecisionEvidenceVerification,
  PreparedDecisionEvidence,
  PreparedDirectSubmission,
  DirectTrunkService,
  AmendmentValidation,
  StableBoundaryExpansionInput,
  StableBoundaryExpansionResult,
  TrunkAbandonUpgradeInput,
  TrunkAbandonUpgradeResult,
  TrunkHistoryResult,
  TrunkRefreezeInput,
  TrunkRefreezeResult,
  TrunkStableSnapshotTarget,
  UpgradeChainValidation,
  UpgradeChainValidationInput,
  ExpansionResult,
  JournalContentPhase,
  ReconcileResult,
  RunRepinPort,
  SnapshotItem,
  StableRepinAuditPayload,
  TargetVersionChoice,
  TrunkApplyInput,
  TrunkApplyResult,
  TrunkRecoveryInput,
  TrunkRepinTarget,
  TrunkRepinTargetKind,
  TrunkService,
  TrunkServiceDeps,
  TrunkServiceResult,
  TrunkStableSnapshotInput,
  TrunkStableSnapshotResult,
  TrunkStateAuditPayload,
  TrunkStatusView,
  TrunkVerifyResult,
} from "../abstract/trunk-service.ts";
export { canTransitionAmendment } from "../impl/amendment-validate.ts";
export { createGitCapabilityService } from "../impl/git-capabilities.ts";
export type { GitCapabilityService, GitQueryContext, PreparedGitQuery, PreparedGitInitialization, PreparedGitDelivery, RepositoryInitializationContext, DeliveryAssignmentInput, DeliveryAssignmentResult } from "../abstract/trunk-service.ts";

export type { PreparedDirectCommit, PreparedTeamPlanCommit, PreparedActivationCommit, PreparedInitialWorkflowCommit, PreparedDirectAuthority, DirectDocumentPolicyInput, TaskObservationResult } from "../abstract/trunk-service.ts";
export type { PreparedRunChange, RunStopCommitEvidence } from "../abstract/trunk-service.ts";

export type { ControllerStopScope } from "../abstract/trunk-service.ts";
