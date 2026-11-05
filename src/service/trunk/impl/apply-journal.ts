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

import { randomUUID } from "node:crypto";

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
} from "../../../model/trunk.ts";
import type {
  JournalContentPhase,
  ReconcileResult,
  TrunkApplyInput,
  TrunkApplyResult,
  TrunkServiceDeps,
  TrunkServiceResult,
  TrunkStateAuditPayload,
} from "../abstract/trunk-service.ts";
import { runManifestMatchesTarget } from "./trunk-derive.ts";
import {
  computeTrunkDigest,
  docFreezeState,
  docVersionOfPath,
  filePathOfRef,
  sha256File,
  snapshotMatchesManifest,
  snapshotOfManifest,
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
    (current !== undefined
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
