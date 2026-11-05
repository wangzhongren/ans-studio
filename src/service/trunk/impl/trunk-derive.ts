// src/service/trunk/impl/trunk-derive.ts
// 从唯一 pinned run 派生只读 trunk v1（S2；P1 §2.3-10/§4.6）。
//
// 纪律：
// · **零写入**：派生只读、不落盘；无 trunk manifest 时状态视图按派生展示（P1 §4.6）；
// · 唯一 pinned run：0 个或多个 pinned、坏 manifest、verify 违规、roster 不可用 ⇒
//   `trunk-unavailable` fail-closed；
// · stable 文件（workflow/role-card/boundary）哈希取当前磁盘字节；缺失记 issue（workflow 缺失
//   不可派生）；roleCards/boundaries 只收存在文件（不虚构）；
// · run manifest 只经既有只读 API（`readRunManifest`/`verifyPinnedRun`/`loadPinnedRoster`）。

import path from "node:path";

import {
  listRunManifestsResult,
  loadPinnedRoster,
  readRunManifest,
  verifyPinnedRun,
  type RunManifest,
} from "../../../common/编排/run-manifest.ts";
import {
  TRUNK_DOC_KINDS,
  TRUNK_MANIFEST_SCHEMA,
  type TrunkArtifactRef,
  type TrunkDocKind,
  type TrunkManifest,
  type TrunkStableArtifactRef,
} from "../../../model/trunk.ts";
import type { TrunkServiceResult } from "../abstract/trunk-service.ts";
import {
  computeTrunkDigest,
  docVersionOfPath,
  filePathOfRef,
  sha256File,
} from "./trunk-common.ts";

const WORKFLOW_PATH = "docs/workflow.md";

function fail(message: string): TrunkServiceResult<never> {
  return { ok: false, code: "trunk-unavailable", message };
}

async function artifactRef(projectRoot: string, relPath: string): Promise<TrunkArtifactRef | undefined> {
  // run documents 允许 `path#fragment`（内嵌区块）；哈希取文件部分，引用串原样保留。
  const sha256 = await sha256File(projectRoot, filePathOfRef(relPath));
  if (sha256 === undefined) return undefined;
  const version = docVersionOfPath(filePathOfRef(relPath));
  return { path: relPath, sha256, ...(version !== undefined ? { version } : {}) };
}

async function stableRef(
  projectRoot: string,
  kind: TrunkStableArtifactRef["kind"],
  relPath: string,
): Promise<TrunkStableArtifactRef | undefined> {
  const sha256 = await sha256File(projectRoot, relPath);
  if (sha256 === undefined) return undefined;
  return { kind, path: relPath, sha256 };
}

/**
 * 从唯一 pinned run 派生 trunk manifest（只读；`trunkVersion:1`、`source:"adopted"`、不落盘）。
 * 返回 issues（role-card/boundary 缺失不致命；workflow 缺失不可派生）。
 */
export async function deriveTrunk(
  projectRoot: string,
  now: () => Date,
): Promise<TrunkServiceResult<{ manifest: TrunkManifest; issues: string[] }>> {
  const listed = await listRunManifestsResult(projectRoot);
  if (!listed.ok) return fail(`run manifest 列表不可读：${listed.reason}`);
  const pinned = listed.manifests.filter((manifest) => manifest.state === "pinned");
  if (pinned.length === 0) return fail("无 pinned run：trunk 不可派生（先 handoff pin）");
  if (pinned.length > 1) {
    return fail(`存在多个 pinned run（${pinned.map((run) => run.runId).join("、")}）：trunk 不可派生`);
  }
  const run = pinned[0]!;

  const verified = await verifyPinnedRun(projectRoot, run);
  if (!verified.ok) return fail(`pinned run 校验失败：${verified.reason}`);
  if (verified.violations.length > 0) {
    return fail(`pinned run 不完整：${verified.violations.join("; ")}`);
  }

  const roster = await loadPinnedRoster(projectRoot, run);
  if (!roster.ok) return fail(`pinned roster 不可用：${roster.reason}`);

  const issues: string[] = [];
  const documents: TrunkManifest["artifacts"]["documents"] = {};
  for (const kind of TRUNK_DOC_KINDS) {
    const ref = run.documents[kind];
    if (ref === null || ref === undefined) continue;
    const built = await artifactRef(projectRoot, ref.path);
    if (built === undefined) return fail(`documents.${kind} 文件缺失：${ref.path}`);
    if (ref.sha256 !== undefined && ref.sha256.toLowerCase() !== built.sha256.toLowerCase()) {
      return fail(`documents.${kind} 哈希漂移：${ref.path}`);
    }
    documents[kind] = built;
  }

  const execution: TrunkManifest["artifacts"]["execution"] = { teamPlan: null, flow: null };
  if (run.execution.teamPlan !== null) {
    const built = await artifactRef(projectRoot, run.execution.teamPlan.path);
    if (built === undefined) return fail(`execution.teamPlan 文件缺失：${run.execution.teamPlan.path}`);
    execution.teamPlan = built;
  }
  if (run.execution.flow !== null) {
    const built = await artifactRef(projectRoot, run.execution.flow.path);
    if (built === undefined) return fail(`execution.flow 文件缺失：${run.execution.flow.path}`);
    execution.flow = {
      path: built.path,
      sha256: built.sha256,
      version: run.execution.flow.version,
    };
  }

  const workflow = await stableRef(projectRoot, "workflow", WORKFLOW_PATH);
  if (workflow === undefined) return fail(`workflow 文件缺失：${WORKFLOW_PATH}`);

  const roles = run.roles ?? roster.roster.roles.map((role) => role.id);
  const roleCards: Record<string, TrunkStableArtifactRef> = {};
  const boundaries: Record<string, TrunkStableArtifactRef> = {};
  for (const roleId of roles) {
    const card = await stableRef(projectRoot, "role-card", `角色卡/${roleId}/role-card.md`);
    if (card === undefined) issues.push(`role-card missing: ${roleId}`);
    else roleCards[roleId] = card;
    const boundary = await stableRef(projectRoot, "boundary", `角色卡/${roleId}/boundary.yaml`);
    if (boundary === undefined) issues.push(`boundary missing: ${roleId}`);
    else boundaries[roleId] = boundary;
  }

  const at = now().toISOString();
  const digest = computeTrunkDigest({
    trunkVersion: 1,
    flowId: run.flowId,
    runId: run.runId,
    documents,
    execution,
    workflow,
    roleCards,
    boundaries,
    rosterVersion: roster.version,
    ...(run.d3 !== undefined ? { d3: run.d3 } : {}),
    roles,
  });

  const manifest: TrunkManifest = {
    schema: TRUNK_MANIFEST_SCHEMA,
    trunkVersion: 1,
    source: "adopted",
    previous: null,
    flowId: run.flowId,
    runId: run.runId,
    artifacts: {
      documents,
      execution,
      workflow,
      roleCards,
      boundaries,
    },
    rosterVersion: roster.version,
    ...(run.d3 !== undefined ? { d3: run.d3 } : {}),
    roles,
    digest,
    createdAt: run.pinnedAt ?? run.updatedAt,
    updatedAt: at,
  };
  return { ok: true, value: { manifest, issues } };
}

/** 读取唯一 pinned run（供 reconcile 内容匹配/恢复复用；只读）。 */
export async function uniquePinnedRun(
  projectRoot: string,
): Promise<TrunkServiceResult<{ run: RunManifest; manifests: RunManifest[] }>> {
  const listed = await listRunManifestsResult(projectRoot);
  if (!listed.ok) return fail(`run manifest 列表不可读：${listed.reason}`);
  const pinned = listed.manifests.filter((manifest) => manifest.state === "pinned");
  if (pinned.length === 0) return fail("无 pinned run");
  if (pinned.length > 1) return fail("多个 pinned run");
  return { ok: true, value: { run: pinned[0]!, manifests: listed.manifests } };
}

/** run manifest 是否已包含 target 快照内容（reconcile 内容匹配；只读）。 */
export async function runManifestMatchesTarget(
  projectRoot: string,
  runId: string,
  target: {
    documents: Record<string, { path: string; sha256: string }>;
    execution: { teamPlan: { path: string; sha256: string } | null; flow: { path: string; sha256: string } | null };
  },
): Promise<boolean> {
  const read = await readRunManifest(projectRoot, runId);
  if (!read.ok) return false;
  const run = read.manifest;
  for (const [kind, expected] of Object.entries(target.documents)) {
    const ref = run.documents[kind as keyof typeof run.documents];
    if (ref === null || ref === undefined) return false;
    if (path.posix.normalize(filePathOfRef(ref.path)) !== path.posix.normalize(filePathOfRef(expected.path))) return false;
    if (ref.sha256 !== undefined && ref.sha256.toLowerCase() !== expected.sha256.toLowerCase()) return false;
  }
  const plan = run.execution.teamPlan;
  if (target.execution.teamPlan === null) {
    if (plan !== null) return false;
  } else if (plan === null || plan.path !== target.execution.teamPlan.path) {
    return false;
  } else if (plan.sha256 !== undefined && plan.sha256.toLowerCase() !== target.execution.teamPlan.sha256.toLowerCase()) {
    return false;
  }
  const flow = run.execution.flow;
  if (target.execution.flow === null) {
    if (flow !== null) return false;
  } else if (flow === null || flow.path !== target.execution.flow.path) {
    return false;
  } else if (flow.sha256 !== undefined && flow.sha256.toLowerCase() !== target.execution.flow.sha256.toLowerCase()) {
    return false;
  }
  return true;
}
