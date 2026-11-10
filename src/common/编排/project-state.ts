// src/common/编排/project-state.ts
// 全局任务状态派生视图（2026-11-02，A1）。
//
// 职责：从 `.ans/state/tasks.jsonl`、`.ans/runs/*/manifest.json`、版本化文档与约定报告路径**即时派生**
// `project-state/v1` 只读视图；不落第二份状态、不写盘、不缓存。
//
// 关键纪律（A1 修订 V1 / PM 裁决）：
//   · R1：manifest 用 `scanRunManifestsForState` 逐项部分扫描；active run 由
//     `deriveActiveRunFromManifests` 从部分结果派生；**不 import/调用** `findActiveRun` /
//     `listRunManifestsResult`，`run-manifest.ts` 零改动。
//   · 错误统一用 A0 `ProjectStateError`（source 五值；坏行/坏 manifest 不阻塞可读部分）。
//   · `evidence.status` 只表示指针存在性（present/missing），不读正文、不判有效性。
//   · rework-pending 只按机器事实（acceptance request reject；可选 task.closed(outcome="rework")）；
//     不实现设计 §3.4「未收口返工任务」的文本推断（A1 收窄，E1/E2 披露）。
//   · 有界：50 flows / 500 tasks / 每 flow 20 versions / 50 evidence；工具文本 ≤8 KiB。

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";
import type {
  ProjectFocusEvent,
  ProjectNoteEvent,
  RequestCreatedEvent,
  RequestOrphanedEvent,
  RequestResolvedEvent,
  TaskStateEvent,
} from "../../model/runtime.ts";
import {
  PROJECT_STATE_LIMITS,
  PROJECT_STATE_SCHEMA,
  PROJECT_STATE_TOOL_MAX_BYTES,
} from "../../model/project-state.ts";
import type {
  ProjectStateBlocker,
  ProjectStateBlockerKind,
  ProjectStateCounts,
  ProjectStateDocKind,
  ProjectStateError,
  ProjectStateEvidence,
  ProjectStateFlow,
  ProjectStateFocus,
  ProjectStateLatestVersionPointer,
  ProjectStateNextStep,
  ProjectStateNote,
  ProjectStateRunView,
  ProjectStateTask,
  ProjectStateVersion,
  ProjectStateView,
} from "../../model/project-state.ts";
import {
  RUN_PENDING_FLOW_ID,
  findNewerContractDocs,
  isRunId,
  readRunManifest,
  runManifestRelPath,
  type RunManifest,
} from "./run-manifest.ts";
import {
  loadLatestRoster,
  parseProjectModules,
} from "./workflow-preconditions.ts";
import { shortenSummary, readTaskState, taskCardOf, taskCards, type TaskRecord } from "./task-state.ts";
import {
  detectLegacyStateIgnored,
  readBasisLedger,
  readReleaseLedger,
  readWorkflowLedger,
} from "./workflow-service.ts";
import { deriveWorkflowView, nextStages } from "./workflow-state.ts";
import { isVersionedDocPath, versionedDocVersionOf } from "../门禁引擎/versioned-doc-guard.ts";

const FLOW_ID_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);
const VERSIONED_DOC_NAME_RE = /^(.+)-(intent|proposal|modules|roster|topology|architecture|assets)-v(\d+)\.md$/;
const QUALITY_REPORT_RE = /^(.+)-report-v(\d+)\.md$/;
const VERSIONED_DOC_KINDS: readonly ProjectStateDocKind[] = [
  "intent", "proposal", "modules", "roster", "topology", "architecture", "assets",
];
// PM 2026-11-02 裁决（D-04）：blocker kind 固定为 `rework-pending`（A0 类型已同步）。
const BLOCKER_KIND_ORDER: readonly ProjectStateBlockerKind[] = [
  "task-blocked", "task-failed", "request-pending", "rework-pending", "redispatch-exhausted",
  "version-drift", "reference-invalid", "run-ambiguous", "focus-stale", "chief-note",
];

/** 视图有界上限（A1-4 冻结；scope 可覆盖但不得改变默认值）。 */
export interface ProjectStateLimits {
  flows: number;
  tasks: number;
  versionsPerFlow: number;
  evidence: number;
}

/** 读取域：viewerRoleId/roleId 决定裁剪；未给或 chief = 完整视图（UI 用 roleId:"chief"）。 */
export interface ProjectStateScope {
  /** A2 会话身份（与 viewerRoleId 等价；二选一）。 */
  roleId?: string;
  viewerRoleId?: string;
  /** 显式完整视图；默认角色为 chief/未给时完整。 */
  full?: boolean;
  /** 可选只读过滤（工具 `project_state` 入参）。 */
  flowId?: string;
  now?: Date;
  limits?: Partial<ProjectStateLimits>;
  /** 派生下一步文案（A2/A3 可注入 i18n；缺省用机器可读英文短语）。 */
  derivedNextStepText?: (code: ProjectStateDerivedNextStepCode) => string;
}

export type ProjectStateDerivedNextStepCode = "set-focus" | "pin-run" | "resolve-blockers" | "none";

/** 部分扫描 + 纯派生 active run（R1）。 */
export interface ActiveRunDerivation {
  active: RunManifest | null;
  activeRuns: RunManifest[];
  conflict?: "multiple-pinned";
}

/** 单个 flow 的版本化文档指针（A2 计算 targetVersions 复用）。 */
export interface VersionedDocPointer {
  path: string;
  version: number;
}

/** 工具文本投影标签（缺省为机器可读英文；A2 可注入 A3 i18n 文案）。 */
export interface ProjectStateSummaryLabels {
  focus: string;
  counts: string;
  tasks: string;
  blockers: string;
  versions: string;
  evidence: string;
  nextStep: string;
  errors: string;
  truncated: string;
  none: string;
  flow: string;
  run: string;
  stage: string;
  status: string;
  source: string;
}

const DEFAULT_SUMMARY_LABELS: ProjectStateSummaryLabels = {
  focus: "focus",
  counts: "counts",
  tasks: "tasks",
  blockers: "blockers",
  versions: "versions",
  evidence: "evidence",
  nextStep: "nextStep",
  errors: "errors",
  truncated: "truncated",
  none: "none",
  flow: "flow",
  run: "run",
  stage: "stage",
  status: "status",
  source: "source",
};

function clock(scope: ProjectStateScope): string {
  return (scope.now ?? new Date()).toISOString();
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback;
}

function mergeLimits(scope: ProjectStateScope): ProjectStateLimits {
  return {
    flows: positiveLimit(scope.limits?.flows, PROJECT_STATE_LIMITS.flows),
    tasks: positiveLimit(scope.limits?.tasks, PROJECT_STATE_LIMITS.tasks),
    versionsPerFlow: positiveLimit(scope.limits?.versionsPerFlow, PROJECT_STATE_LIMITS.versionsPerFlow),
    evidence: positiveLimit(scope.limits?.evidence, PROJECT_STATE_LIMITS.evidence),
  };
}

function isFlowId(value: string): boolean {
  return FLOW_ID_RE.test(value);
}

// —————————————— manifest 部分扫描 / active 派生（R1） ——————————————

/**
 * 逐 manifest 读取（部分结果）；坏项进 errors 并继续；按 createdAt 升序。
 * **不调用** `listRunManifestsResult`（all-or-nothing）或 `findActiveRun`。
 */
export async function scanRunManifestsForState(
  projectRoot: string,
): Promise<{ manifests: RunManifest[]; errors: ProjectStateError[] }> {
  const root = path.join(projectRoot, ".ans", "runs");
  let names: string[];
  try {
    names = await readdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { manifests: [], errors: [] };
    return { manifests: [], errors: [{ source: "run-manifest", message: `runs 目录不可读：${error instanceof Error ? error.message : String(error)}` }] };
  }
  const manifests: RunManifest[] = [];
  const errors: ProjectStateError[] = [];
  for (const name of names) {
    if (!isRunId(name)) continue;
    const read = await readRunManifest(projectRoot, name);
    if (!read.ok) {
      errors.push({ source: "run-manifest", file: runManifestRelPath(name), message: `run ${name} manifest 不可读：${read.reason}` });
      continue;
    }
    manifests.push(read.manifest);
  }
  manifests.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { manifests, errors };
}

/**
 * 从部分扫描结果派生 active run（纯函数；复用 findActiveRun 的冲突/优先级规则）：
 * draft/pinned 为活动；多 pinned 冲突；pinned 优先，否则最新 draft。
 */
export function deriveActiveRunFromManifests(
  manifests: readonly RunManifest[],
  flowId: string,
): ActiveRunDerivation {
  const activeRuns = manifests
    .filter((manifest) => manifest.flowId === flowId && (manifest.state === "draft" || manifest.state === "pinned"))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pinned = activeRuns.filter((manifest) => manifest.state === "pinned");
  if (pinned.length > 1) return { active: null, activeRuns, conflict: "multiple-pinned" };
  const latestDraft = [...activeRuns]
    .filter((manifest) => manifest.state === "draft")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return { active: pinned[0] ?? latestDraft ?? null, activeRuns };
}

// —————————————— 版本化文档扫描 ——————————————

interface DocScanCatalog {
  byFlow: Map<string, Partial<Record<ProjectStateDocKind, VersionedDocPointer>>>;
  errors: ProjectStateError[];
}

async function scanVersionedDocsCatalog(projectRoot: string): Promise<DocScanCatalog> {
  const byFlow = new Map<string, Partial<Record<ProjectStateDocKind, VersionedDocPointer>>>();
  const errors: ProjectStateError[] = [];
  const dirs = ["docs/product", "docs/proposals", "docs/contracts"];
  for (const dirRel of dirs) {
    let names: string[];
    try {
      names = await readdir(path.join(projectRoot, ...dirRel.split("/")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      errors.push({ source: "docs", file: dirRel, message: `文档目录不可读：${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    for (const name of names) {
      const rel = `${dirRel}/${name}`;
      if (!isVersionedDocPath(rel)) continue;
      const version = versionedDocVersionOf(rel);
      if (version === undefined) continue;
      const match = VERSIONED_DOC_NAME_RE.exec(name);
      if (match === null) continue;
      const flowId = match[1]!;
      const kind = match[2]! as ProjectStateDocKind;
      if (!isFlowId(flowId) || flowId === RUN_PENDING_FLOW_ID) continue;
      const current = byFlow.get(flowId) ?? {};
      const previous = current[kind];
      if (previous === undefined || version > previous.version) current[kind] = { path: rel, version };
      byFlow.set(flowId, current);
    }
  }
  return { byFlow, errors };
}

/** 供 A2 计算 targetVersions：单个 flow 的最新版本化文档指针（只读）。 */
export async function scanVersionedDocsForFlow(
  projectRoot: string,
  flowId: string,
): Promise<{ docs: Partial<Record<ProjectStateDocKind, VersionedDocPointer>>; errors: ProjectStateError[] }> {
  const catalog = await scanVersionedDocsCatalog(projectRoot);
  return { docs: { ...(catalog.byFlow.get(flowId) ?? {}) }, errors: catalog.errors };
}

async function fileSha256(projectRoot: string, rel: string): Promise<string | undefined> {
  try {
    return createHash("sha256").update(await readFile(path.join(projectRoot, rel))).digest("hex");
  } catch {
    return undefined;
  }
}

async function fileExists(projectRoot: string, rel: string): Promise<boolean> {
  if (rel.startsWith("/") || rel.includes("\\") || /^[a-zA-Z]:[\\/]/.test(rel)) return false;
  if (rel.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  try {
    await stat(path.join(projectRoot, rel));
    return true;
  } catch {
    return false;
  }
}

function docVersionFromPath(relPath: string | undefined): number | undefined {
  if (relPath === undefined) return undefined;
  const match = /-v(\d+)\.md(?:#.*)?$/.exec(relPath);
  if (match === null) return undefined;
  const version = Number(match[1]);
  return Number.isInteger(version) && version > 0 ? version : undefined;
}

// —————————————— 事件派生辅助 ——————————————

interface RequestView {
  created?: RequestCreatedEvent;
  resolved?: RequestResolvedEvent;
  orphaned?: RequestOrphanedEvent;
}

function collectRequests(events: readonly TaskStateEvent[]): Map<string, RequestView> {
  const requests = new Map<string, RequestView>();
  const get = (requestId: string): RequestView => {
    const existing = requests.get(requestId);
    if (existing !== undefined) return existing;
    const created: RequestView = {};
    requests.set(requestId, created);
    return created;
  };
  for (const event of events) {
    if (event.kind === "request.created") get(event.requestId).created = event;
    else if (event.kind === "request.resolved") get(event.requestId).resolved = event;
    else if (event.kind === "request.orphaned") get(event.requestId).orphaned = event;
  }
  return requests;
}

function deriveSupersededBy(events: readonly TaskStateEvent[], manifests: readonly RunManifest[]): Map<string, string> {
  const superseded = new Map<string, string>();
  for (const event of events) {
    if (event.kind !== "version.decision") continue;
    if (event.status !== "executed" || event.action !== "new-version-development") continue;
    if (event.oldFlowId === undefined || event.newFlowId === undefined) continue;
    superseded.set(event.oldFlowId, event.newFlowId);
  }
  // 轮转丢失 version.decision 时的只读回退：旧 run 的 closeReason 仍保留 supersede 事实。
  for (const manifest of manifests) {
    if (manifest.closeReason === undefined || !manifest.closeReason.startsWith("superseded-by:")) continue;
    if (superseded.has(manifest.flowId)) continue;
    const rest = manifest.closeReason.slice("superseded-by:".length);
    const slash = rest.indexOf("/");
    if (slash > 0) superseded.set(manifest.flowId, rest.slice(0, slash));
  }
  return superseded;
}

function latestFocusEvent(events: readonly TaskStateEvent[]): ProjectFocusEvent | undefined {
  let latest: ProjectFocusEvent | undefined;
  for (const event of events) if (event.kind === "project.focus") latest = event;
  return latest;
}

function collectNotes(events: readonly TaskStateEvent[]): { notes: ProjectStateNote[]; nextStep?: ProjectNoteEvent } {
  const latestByKey = new Map<string, ProjectNoteEvent>();
  let latestNextStep: ProjectNoteEvent | undefined;
  for (const event of events) {
    if (event.kind !== "project.note" || event.roleId !== "chief") continue;
    latestByKey.set(event.noteKey, event);
    if (event.noteKind === "next-step" && event.active) latestNextStep = event;
  }
  const notes: ProjectStateNote[] = [...latestByKey.values()]
    .filter((event) => event.active)
    .map((event) => ({
      noteKey: event.noteKey,
      kind: event.noteKind,
      text: event.text,
      ...(event.refs !== undefined ? { refs: [...event.refs] } : {}),
      at: event.at,
      roleId: "chief" as const,
      active: true,
    }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.noteKey.localeCompare(b.noteKey));
  return { notes, ...(latestNextStep !== undefined ? { nextStep: latestNextStep } : {}) };
}

// —————————————— 任务派生 ——————————————

function redispatchCounts(records: Map<string, TaskRecord>): Map<string, number> {
  const children = new Map<string, string[]>();
  for (const record of records.values()) {
    if (record.retryOf === undefined) continue;
    const list = children.get(record.retryOf) ?? [];
    list.push(record.taskId);
    children.set(record.retryOf, list);
  }
  const counts = new Map<string, number>();
  const count = (taskId: string, seen: Set<string>): number => {
    const memo = counts.get(taskId);
    if (memo !== undefined) return memo;
    if (seen.has(taskId)) return 0;
    seen.add(taskId);
    const next = children.get(taskId) ?? [];
    const total = next.length + next.reduce((sum, child) => sum + count(child, seen), 0);
    counts.set(taskId, total);
    return total;
  };
  for (const taskId of records.keys()) count(taskId, new Set());
  return counts;
}

function projectTaskOf(record: TaskRecord, redispatchCount: number): ProjectStateTask | undefined {
  const card = taskCardOf(record);
  if (card === undefined || record.created === undefined) return undefined;
  return {
    ...card,
    from: record.created.from,
    blocked: card.lastReport?.status === "blocked",
    failed: card.lastReport?.status === "failed",
    redispatchCount,
  };
}

function boundedTasks(
  all: readonly ProjectStateTask[],
  unclosedIds: ReadonlySet<string>,
  limit: number,
): { tasks: ProjectStateTask[]; truncated: boolean } {
  const unclosed = all
    .filter((task) => unclosedIds.has(task.taskId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const closed = all
    .filter((task) => !unclosedIds.has(task.taskId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const combined = [...unclosed, ...closed];
  return { tasks: combined.slice(0, limit), truncated: combined.length > limit };
}

function maxTime(...values: Array<string | undefined>): string | undefined {
  let latest: string | undefined;
  for (const value of values) {
    if (value === undefined) continue;
    if (latest === undefined || value > latest) latest = value;
  }
  return latest;
}

// —————————————— roster/modules 引用检查 ——————————————

interface ReferenceIssueResult {
  blockers: ProjectStateBlocker[];
  errors: ProjectStateError[];
  issues: Map<ProjectStateDocKind, string>;
}

async function collectReferenceIssues(
  projectRoot: string,
  flowId: string | undefined,
  docs: Partial<Record<ProjectStateDocKind, VersionedDocPointer>>,
): Promise<ReferenceIssueResult> {
  const blockers: ProjectStateBlocker[] = [];
  const errors: ProjectStateError[] = [];
  const issues = new Map<ProjectStateDocKind, string>();
  if (flowId === undefined) return { blockers, errors, issues };

  const rosterDoc = docs.roster;
  if (rosterDoc !== undefined) {
    const loaded = await loadLatestRoster({ projectRoot, flowId });
    if (!loaded.ok) {
      const message = `roster 解析/引用失败：${loaded.reason}`;
      issues.set("roster", message);
      errors.push({ source: "roster", file: rosterDoc.path, message });
      blockers.push({
        id: `reference-invalid:${flowId}:roster`,
        kind: "reference-invalid",
        flowId,
        summary: shortenSummary(message, 200),
        source: "app",
      });
    }
  }

  const modulesDoc = docs.modules;
  if (modulesDoc !== undefined) {
    let text: string | undefined;
    try {
      text = await readFile(path.join(projectRoot, modulesDoc.path), "utf8");
    } catch (error) {
      const message = `模块清单不可读：${error instanceof Error ? error.message : String(error)}`;
      errors.push({ source: "docs", file: modulesDoc.path, message });
      issues.set("modules", message);
    }
    if (text !== undefined) {
      const parsed = parseProjectModules(text, flowId);
      if (!parsed.ok) {
        const message = `modules 解析/引用失败：${parsed.reason}`;
        issues.set("modules", message);
        errors.push({ source: "modules", file: modulesDoc.path, message });
        blockers.push({
          id: `reference-invalid:${flowId}:modules`,
          kind: "reference-invalid",
          flowId,
          summary: shortenSummary(message, 200),
          source: "app",
        });
      }
    }
  }
  return { blockers, errors, issues };
}

// —————————————— 质量报告存在性（evidence 指针） ——————————————

async function scanQualityReports(
  projectRoot: string,
): Promise<{ byFlow: Map<string, { path: string; version: number }>; errors: ProjectStateError[] }> {
  const dirRel = "docs/quality";
  const byFlow = new Map<string, { path: string; version: number }>();
  let names: string[];
  try {
    names = await readdir(path.join(projectRoot, "docs", "quality"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { byFlow, errors: [] };
    return { byFlow, errors: [{ source: "docs", file: dirRel, message: `质量报告目录不可读：${error instanceof Error ? error.message : String(error)}` }] };
  }
  for (const name of names) {
    const match = QUALITY_REPORT_RE.exec(name);
    if (match === null) continue;
    const flowId = match[1]!;
    const version = Number(match[2]);
    if (!isFlowId(flowId) || !Number.isInteger(version) || version < 1) continue;
    const current = byFlow.get(flowId);
    if (current === undefined || version > current.version) byFlow.set(flowId, { path: `${dirRel}/${name}`, version });
  }
  return { byFlow, errors: [] };
}

// —————————————— 视图构建 ——————————————

function focusOf(
  events: readonly TaskStateEvent[],
  flowIds: ReadonlySet<string>,
  manifests: readonly RunManifest[],
  derivationByFlow: ReadonlyMap<string, ActiveRunDerivation>,
  unclosedCountByFlow: ReadonlyMap<string, number>,
  supersededBy: ReadonlyMap<string, string>,
  generatedAt: string,
): ProjectStateFocus {
  const latest = latestFocusEvent(events);
  if (latest?.cleared === true) return { selectedBy: "none", updatedAt: latest.at };
  if (latest !== undefined) {
    const flowId = latest.flowId!;
    const runInstances = manifests.filter((manifest) => manifest.runId === latest.runId && manifest.flowId === flowId);
    const run = latest.runId !== undefined ? runInstances[0] : undefined;
    const runInvalid = latest.runId !== undefined
      ? run === undefined || (run.state !== "draft" && run.state !== "pinned")
      : false;
    const derivation = derivationByFlow.get(flowId);
    const uniqueActive = derivation !== undefined && derivation.activeRuns.length === 1 ? derivation.active : null;
    const activeFromFlow = latest.runId === undefined ? uniqueActive : null;
    const hasRuns = manifests.some((manifest) => manifest.flowId === flowId);
    const hasActiveRuns = (derivation?.activeRuns.length ?? 0) > 0;
    const stale = !flowIds.has(flowId) ||
      supersededBy.has(flowId) ||
      runInvalid ||
      (latest.runId === undefined && hasRuns && !hasActiveRuns);
    const runState = latest.runId !== undefined
      ? (run !== undefined && (run.state === "draft" || run.state === "pinned") ? run.state : undefined)
      : activeFromFlow !== null
        ? activeFromFlow.state as "draft" | "pinned"
        : (unclosedCountByFlow.get(flowId) ?? 0) > 0 && !hasRuns ? "legacy" : undefined;
    const stage = latest.runId !== undefined ? run?.stage?.current : activeFromFlow?.stage?.current;
    return {
      flowId,
      ...(latest.runId !== undefined ? { runId: latest.runId } : activeFromFlow !== null ? { runId: activeFromFlow.runId } : {}),
      ...(runState !== undefined ? { runState } : {}),
      ...(stage !== undefined ? { stage } : {}),
      selectedBy: latest.roleId,
      updatedAt: latest.at,
      ...(stale ? { stale: true } : {}),
    };
  }

  const candidates = [...flowIds].filter((flowId) =>
    !supersededBy.has(flowId) &&
    ((derivationByFlow.get(flowId)?.activeRuns.length ?? 0) > 0 || (unclosedCountByFlow.get(flowId) ?? 0) > 0),
  );
  if (candidates.length === 1) {
    const flowId = candidates[0]!;
    const derivation = derivationByFlow.get(flowId);
    const uniqueActive = derivation !== undefined && derivation.activeRuns.length === 1 ? derivation.active : null;
    const hasRuns = manifests.some((manifest) => manifest.flowId === flowId);
    return {
      flowId,
      ...(uniqueActive !== null ? { runId: uniqueActive.runId } : {}),
      ...(uniqueActive !== null
        ? { runState: uniqueActive.state as "draft" | "pinned" }
        : !hasRuns && (unclosedCountByFlow.get(flowId) ?? 0) > 0
          ? { runState: "legacy" as const }
          : {}),
      ...(uniqueActive?.stage?.current !== undefined ? { stage: uniqueActive.stage.current } : {}),
      selectedBy: "derived",
      updatedAt: generatedAt,
    };
  }
  return { selectedBy: "none", updatedAt: generatedAt };
}

function buildBlockers(input: {
  tasks: readonly ProjectStateTask[];
  unclosedIds: ReadonlySet<string>;
  focus: ProjectStateFocus;
  derivationByFlow: ReadonlyMap<string, ActiveRunDerivation>;
  requests: ReadonlyMap<string, RequestView>;
  supersededBy: ReadonlyMap<string, string>;
  notes: readonly ProjectStateNote[];
  referenceBlockers: readonly ProjectStateBlocker[];
  newerKinds: ReadonlySet<ProjectStateDocKind>;
}): ProjectStateBlocker[] {
  const blockers: ProjectStateBlocker[] = [];
  const isActiveFlow = (flowId: string | undefined): boolean =>
    flowId === undefined || !input.supersededBy.has(flowId);

  for (const task of input.tasks) {
    if (!input.unclosedIds.has(task.taskId) || !isActiveFlow(task.flowId)) continue;
    if (task.blocked && task.flowId !== undefined) {
      blockers.push({
        id: `task-blocked:${task.taskId}`,
        kind: "task-blocked",
        ...(task.flowId !== undefined ? { flowId: task.flowId } : {}),
        ...(task.runId !== undefined ? { runId: task.runId } : {}),
        taskId: task.taskId,
        summary: `task ${task.taskId} reported blocked（目标角色 ${task.targetRoleId}）`,
        since: task.lastReport?.at ?? task.createdAt,
        source: "app",
      });
    }
    if (task.failed && task.flowId !== undefined) {
      blockers.push({
        id: `task-failed:${task.taskId}`,
        kind: "task-failed",
        ...(task.flowId !== undefined ? { flowId: task.flowId } : {}),
        ...(task.runId !== undefined ? { runId: task.runId } : {}),
        taskId: task.taskId,
        summary: `task ${task.taskId} reported failed（目标角色 ${task.targetRoleId}）`,
        since: task.lastReport?.at ?? task.createdAt,
        source: "app",
      });
    }
    if (task.flowId !== undefined && task.redispatchCount >= 2) {
      blockers.push({
        id: `redispatch-exhausted:${task.taskId}`,
        kind: "redispatch-exhausted",
        flowId: task.flowId,
        ...(task.runId !== undefined ? { runId: task.runId } : {}),
        taskId: task.taskId,
        summary: `task ${task.taskId} 自动重派已 ${task.redispatchCount} 次仍未收口`,
        since: task.createdAt,
        source: "app",
      });
    }
  }

  // request-pending：request.created 无 resolved/orphaned。
  for (const [requestId, request] of input.requests) {
    if (request.created === undefined || request.resolved !== undefined || request.orphaned !== undefined) continue;
    if (!isActiveFlow(request.created.flowId)) continue;
    blockers.push({
      id: `request-pending:${requestId}`,
      kind: "request-pending",
      ...(request.created.flowId !== undefined ? { flowId: request.created.flowId } : {}),
      requestId,
      summary: `未决申请 ${requestId}：${shortenSummary(request.created.title, 160)}（来源 ${request.created.sourceRoleId}）`,
      since: request.created.at,
      source: "app",
    });
  }

  // rework-pending：只按机器事实（acceptance request reject + 可选 task.closed(rework)）。
  const reworkByFlow = new Map<string, { rejected: number; reworkClosed: number }>();
  for (const request of input.requests.values()) {
    const created = request.created;
    if (created?.cardKind !== "acceptance" || created.flowId === undefined) continue;
    if (!isActiveFlow(created.flowId)) continue;
    const resolved = request.resolved;
    const rejected = resolved !== undefined &&
      (resolved.choice === "reject" || (resolved.selectedOptionIds?.includes("reject") ?? false));
    if (!rejected) continue;
    const counts = reworkByFlow.get(created.flowId) ?? { rejected: 0, reworkClosed: 0 };
    counts.rejected += 1;
    reworkByFlow.set(created.flowId, counts);
  }
  for (const task of input.tasks) {
    if (task.flowId === undefined || task.closed?.outcome !== "rework" || !isActiveFlow(task.flowId)) continue;
    const counts = reworkByFlow.get(task.flowId) ?? { rejected: 0, reworkClosed: 0 };
    counts.reworkClosed += 1;
    reworkByFlow.set(task.flowId, counts);
  }
  for (const [flowId, counts] of reworkByFlow) {
    blockers.push({
      id: `rework-pending:${flowId}`,
      kind: "rework-pending",
      flowId,
      summary: `flow ${flowId}：acceptance reject ${counts.rejected} 次、rework closed ${counts.reworkClosed} 次（机器事实；不推断未收口返工任务）`,
      source: "app",
    });
  }

  // version-drift：focus pinned + 磁盘上有更新契约文档。
  if (input.focus.flowId !== undefined && input.newerKinds.size > 0) {
    blockers.push({
      id: `version-drift:${input.focus.flowId}`,
      kind: "version-drift",
      flowId: input.focus.flowId,
      ...(input.focus.runId !== undefined ? { runId: input.focus.runId } : {}),
      summary: `pinned run 磁盘存在更新契约文档：${[...input.newerKinds].join("、")}`,
      source: "app",
    });
  }

  blockers.push(...input.referenceBlockers);

  // run-ambiguous：focus flow 多个活动 run 且未指定 runId；或多 pinned 冲突。
  if (input.focus.flowId !== undefined) {
    const derivation = input.derivationByFlow.get(input.focus.flowId);
    if (derivation !== undefined && (derivation.conflict !== undefined || (derivation.activeRuns.length > 1 && input.focus.runId === undefined))) {
      blockers.push({
        id: `run-ambiguous:${input.focus.flowId}`,
        kind: "run-ambiguous",
        flowId: input.focus.flowId,
        summary: derivation.conflict !== undefined
          ? `flow ${input.focus.flowId} 存在多个 pinned run；需要先走「版本变更申请」/「主干升级」或人工核对`
          : `flow ${input.focus.flowId} 有多个活动 run；版本决策需指定 runId`,
        source: "app",
      });
    }
  }

  if (input.focus.stale === true) {
    blockers.push({
      id: "focus-stale",
      kind: "focus-stale",
      ...(input.focus.flowId !== undefined ? { flowId: input.focus.flowId } : {}),
      ...(input.focus.runId !== undefined ? { runId: input.focus.runId } : {}),
      summary: "project.focus 指向已关闭/不存在的 flow/run；视图列候选，不自动改",
      source: "app",
    });
  }

  for (const note of input.notes) {
    if (note.kind !== "blocker" || !note.active) continue;
    blockers.push({
      id: `chief-note:${note.noteKey}`,
      kind: "chief-note",
      summary: shortenSummary(note.text, 200),
      since: note.at,
      source: "chief",
    });
  }

  blockers.sort((a, b) => {
    const order = BLOCKER_KIND_ORDER.indexOf(a.kind) - BLOCKER_KIND_ORDER.indexOf(b.kind);
    return order !== 0 ? order : a.id.localeCompare(b.id);
  });
  return blockers;
}

/**
 * 构建 `project-state/v1` 只读视图。纯读、零写入；坏行/坏 manifest/文档扫描失败进 errors[]，
 * 可读部分照常返回（不抛）。`scope.roleId`/`viewerRoleId` 决定裁剪；未给或 chief = 完整视图。
 */
export async function buildProjectStateView(
  projectRoot: string,
  scope: ProjectStateScope = {},
): Promise<ProjectStateView> {
  const generatedAt = clock(scope);
  const limits = mergeLimits(scope);
  const viewerRoleId = scope.viewerRoleId ?? scope.roleId;
  const full = scope.full === true || viewerRoleId === undefined || viewerRoleId === "chief";

  const state = await readTaskState(projectRoot);
  const manifestScan = await scanRunManifestsForState(projectRoot);
  const docCatalog = await scanVersionedDocsCatalog(projectRoot);
  const quality = await scanQualityReports(projectRoot);

  const errors: ProjectStateError[] = [
    ...state.errors.map((error) => ({
      source: "tasks" as const,
      message: error.message,
      ...(error.file !== "" ? { file: error.file } : {}),
      ...(error.line > 0 ? { line: error.line } : {}),
    })),
    ...manifestScan.errors,
    ...docCatalog.errors,
    ...quality.errors,
  ];

  const manifests = manifestScan.manifests;
  const requests = collectRequests(state.events);
  const supersededBy = deriveSupersededBy(state.events, manifests);

  const flowIds = new Set<string>();
  for (const manifest of manifests) {
    if (manifest.flowId !== RUN_PENDING_FLOW_ID) flowIds.add(manifest.flowId);
  }
  for (const task of taskCards(state)) {
    if (task.flowId !== undefined && task.flowId !== RUN_PENDING_FLOW_ID) flowIds.add(task.flowId);
  }
  for (const flowId of docCatalog.byFlow.keys()) {
    if (flowId !== RUN_PENDING_FLOW_ID) flowIds.add(flowId);
  }

  const derivationByFlow = new Map<string, ActiveRunDerivation>();
  for (const flowId of flowIds) derivationByFlow.set(flowId, deriveActiveRunFromManifests(manifests, flowId));

  const unclosedIds = new Set(state.unclosed.map((record) => record.taskId));
  const redispatch = redispatchCounts(state.records);
  const allTasks: ProjectStateTask[] = [];
  for (const card of taskCards(state)) {
    const record = state.records.get(card.taskId);
    if (record === undefined) continue;
    const task = projectTaskOf(record, redispatch.get(card.taskId) ?? 0);
    if (task !== undefined) allTasks.push(task);
  }

  const unclosedCountByFlow = new Map<string, number>();
  for (const record of state.unclosed) {
    const flowId = record.created?.flowId;
    if (flowId === undefined) continue;
    unclosedCountByFlow.set(flowId, (unclosedCountByFlow.get(flowId) ?? 0) + 1);
  }

  const focus = focusOf(state.events, flowIds, manifests, derivationByFlow, unclosedCountByFlow, supersededBy, generatedAt);
  const focusDocs = focus.flowId !== undefined ? (docCatalog.byFlow.get(focus.flowId) ?? {}) : {};
  const reference = await collectReferenceIssues(projectRoot, focus.flowId, focusDocs);
  errors.push(...reference.errors);

  // 版本漂移（focus pinned run 与磁盘更新契约文档）。
  let newerKinds = new Set<ProjectStateDocKind>();
  const focusActive = focus.flowId !== undefined ? derivationByFlow.get(focus.flowId)?.active : null;
  if (focusActive?.state === "pinned") {
    const newer = await findNewerContractDocs(projectRoot, focusActive);
    newerKinds = new Set(newer.map((doc) => doc.kind));
  }

  const { notes, nextStep: chiefNextStep } = collectNotes(state.events);
  const blockers = buildBlockers({
    tasks: allTasks,
    unclosedIds,
    focus,
    derivationByFlow,
    requests,
    supersededBy,
    notes,
    referenceBlockers: reference.blockers,
    newerKinds,
  });

  // ———— flows ————
  const flowViews: ProjectStateFlow[] = [];
  for (const flowId of flowIds) {
    const flowManifests = manifests.filter((manifest) => manifest.flowId === flowId);
    const derivation = derivationByFlow.get(flowId)!;
    const flowTasks = allTasks.filter((task) => task.flowId === flowId);
    const flowUnclosed = flowTasks.filter((task) => unclosedIds.has(task.taskId));
    const runs: ProjectStateRunView[] = flowManifests.map((manifest) => ({
      runId: manifest.runId,
      state: manifest.state,
      active: manifest.state === "draft" || manifest.state === "pinned",
      ...(manifest.stage?.current !== undefined ? { stage: manifest.stage.current } : {}),
      createdAt: manifest.createdAt,
      updatedAt: manifest.updatedAt,
      ...(manifest.pinnedAt !== undefined ? { pinnedAt: manifest.pinnedAt } : {}),
      ...(manifest.closedAt !== undefined ? { closedAt: manifest.closedAt } : {}),
      ...(manifest.closeReason !== undefined ? { closeReason: manifest.closeReason } : {}),
      ...(manifest.rosterVersion !== undefined ? { rosterVersion: manifest.rosterVersion } : {}),
      documentKinds: Object.keys(manifest.documents),
    }));
    const taskLast = maxTime(...flowTasks.flatMap((task) => [task.createdAt, task.lastReport?.at, task.closed?.at]));
    const runLast = maxTime(...flowManifests.flatMap((manifest) => [manifest.updatedAt, manifest.closedAt]));
    const sources: ProjectStateFlow["sources"] = [];
    if (flowManifests.length > 0) sources.push("run");
    if (flowTasks.length > 0) sources.push("task");
    if ((docCatalog.byFlow.get(flowId) ?? undefined) !== undefined) sources.push("docs");
    flowViews.push({
      flowId,
      sources,
      runs,
      taskCounts: {
        unclosed: flowUnclosed.length,
        blocked: flowUnclosed.filter((task) => task.blocked).length,
        failed: flowUnclosed.filter((task) => task.failed).length,
      },
      ...(maxTime(taskLast, runLast) !== undefined ? { lastActivityAt: maxTime(taskLast, runLast) } : {}),
      ...(supersededBy.has(flowId) ? { supersededBy: supersededBy.get(flowId) } : {}),
    });
  }
  flowViews.sort((a, b) => {
    if (a.flowId === focus.flowId && b.flowId !== focus.flowId) return -1;
    if (b.flowId === focus.flowId && a.flowId !== focus.flowId) return 1;
    return (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "") || a.flowId.localeCompare(b.flowId);
  });
  const flowsTruncated = flowViews.length > limits.flows;
  let flows = flowViews.slice(0, limits.flows);

  // ———— tasks ————
  const scopedTasks = scope.flowId !== undefined ? allTasks.filter((task) => task.flowId === scope.flowId) : allTasks;
  const viewerTasks = full || viewerRoleId === undefined
    ? scopedTasks
    : scopedTasks.filter((task) => task.targetRoleId === viewerRoleId || task.from === viewerRoleId);
  const bounded = boundedTasks(viewerTasks, unclosedIds, limits.tasks);

  // ———— versions ————
  const versionViews: ProjectStateVersion[] = [];
  let versionsTruncated = false;
  const flowsForVersions = full ? [...flows] : flows.filter((flow) => flow.flowId === focus.flowId);
  for (const flow of flowsForVersions) {
    const docs = docCatalog.byFlow.get(flow.flowId) ?? {};
    const pinnedManifest = manifests.find((manifest) => manifest.flowId === flow.flowId && manifest.state === "pinned");
    const kinds = full && flow.flowId === focus.flowId
      ? VERSIONED_DOC_KINDS
      : [...new Set([...Object.keys(docs), ...Object.keys(pinnedManifest?.documents ?? {})])] as ProjectStateDocKind[];
    const entries: ProjectStateVersion[] = [];
    for (const kind of kinds) {
      const latest = docs[kind];
      const pinRef = pinnedManifest?.documents[kind];
      const focusKind = full && flow.flowId === focus.flowId;
      if (latest === undefined && (pinRef === undefined || pinRef === null) && !focusKind) continue;
      let latestPointer: ProjectStateLatestVersionPointer | undefined;
      if (latest !== undefined) {
        const sha = flow.flowId === focus.flowId ? await fileSha256(projectRoot, latest.path) : undefined;
        latestPointer = { path: latest.path, version: latest.version, ...(sha !== undefined ? { sha256: sha } : {}) };
      }
      const pinnedPointer = pinRef !== undefined && pinRef !== null
        ? {
          path: pinRef.path,
          ...(docVersionFromPath(pinRef.path) !== undefined ? { version: docVersionFromPath(pinRef.path) } : {}),
          ...(pinRef.sha256 !== undefined ? { sha256: pinRef.sha256 } : {}),
        }
        : undefined;
      const referenceIssue = reference.issues.get(kind);
      entries.push({
        flowId: flow.flowId,
        docKind: kind,
        ...(latestPointer !== undefined ? { latest: latestPointer } : {}),
        ...(pinnedPointer !== undefined ? { pinned: pinnedPointer } : {}),
        newerThanPinned: flow.flowId === focus.flowId && newerKinds.has(kind),
        ...(referenceIssue !== undefined ? { referenceIssue } : {}),
      });
    }
    if (entries.length > limits.versionsPerFlow) versionsTruncated = true;
    versionViews.push(...entries.slice(0, limits.versionsPerFlow));
  }

  // ———— evidence（只做指针存在性） ————
  const evidenceViews: ProjectStateEvidence[] = [];
  const acceptanceFlows = new Set<string>();
  for (const request of requests.values()) {
    const created = request.created;
    if (created?.cardKind !== "acceptance") continue;
    const flowId = created.flowId ?? focus.flowId;
    if (flowId === undefined) continue;
    acceptanceFlows.add(flowId);
    if (scope.flowId !== undefined && flowId !== scope.flowId) continue;
    if (!full && flowId !== focus.flowId) continue;
    evidenceViews.push({
      flowId,
      kind: "acceptance-card",
      ref: `request:${created.requestId}`,
      summary: shortenSummary(created.title, 160),
      status: "present",
      at: created.at,
    });
  }
  for (const flowId of acceptanceFlows) {
    if (scope.flowId !== undefined && flowId !== scope.flowId) continue;
    if (!full && flowId !== focus.flowId) continue;
    const report = quality.byFlow.get(flowId);
    evidenceViews.push({
      flowId,
      kind: "verifier-report",
      ref: report?.path ?? `docs/quality/${flowId}-report-v1.md`,
      status: report !== undefined ? "present" : "missing",
    });
  }
  for (const task of bounded.tasks) {
    const refs = [...(task.requestedEvidence ?? []), ...(task.modulePaths ?? [])];
    for (const ref of refs) {
      if (!full && task.flowId !== focus.flowId) continue;
      if (scope.flowId !== undefined && task.flowId !== scope.flowId) continue;
      const present = await fileExists(projectRoot, ref);
      evidenceViews.push({
        flowId: task.flowId ?? focus.flowId ?? "",
        kind: "task-evidence",
        ref,
        summary: `task ${task.taskId} 引用`,
        status: present ? "present" : "missing",
        at: task.createdAt,
      });
      if (evidenceViews.length >= limits.evidence * 4) break;
    }
    if (evidenceViews.length >= limits.evidence * 4) break;
  }
  const evidenceTruncated = evidenceViews.length > limits.evidence;
  const evidence = evidenceViews.slice(0, limits.evidence);

  // ———— counts（F4 口径） ————
  const unclosedTasks = allTasks.filter((task) => unclosedIds.has(task.taskId));
  const supersededUnclosed = unclosedTasks.filter((task) => task.flowId !== undefined && supersededBy.has(task.flowId)).length;
  const activeUnclosedTasks = unclosedTasks.filter((task) => task.flowId !== undefined && !supersededBy.has(task.flowId));
  const pendingRequests = [...requests.values()].filter((request) =>
    request.created !== undefined && request.resolved === undefined && request.orphaned === undefined,
  ).length;
  const counts: ProjectStateCounts = {
    unclosed: state.unclosed.length,
    supersededUnclosed,
    activeUnclosed: state.unclosed.length - supersededUnclosed,
    blocked: activeUnclosedTasks.filter((task) => task.blocked).length,
    failed: activeUnclosedTasks.filter((task) => task.failed).length,
    pendingRequests,
    flows: flowViews.length,
    tasks: allTasks.length,
  };

  // ———— nextStep ————
  let nextStep: ProjectStateNextStep;
  if (chiefNextStep !== undefined) {
    nextStep = { text: chiefNextStep.text, source: "chief", at: chiefNextStep.at };
  } else {
    const code: ProjectStateDerivedNextStepCode = focus.flowId === undefined
      ? "set-focus"
      : focus.runState === "draft"
        ? "pin-run"
        : blockers.some((blocker) => blocker.kind !== "focus-stale")
          ? "resolve-blockers"
          : "none";
    const text = scope.derivedNextStepText?.(code) ?? defaultDerivedNextStepText(code);
    nextStep = { text, source: "derived", at: generatedAt };
  }

  // ———— 角色裁剪 ————
  let notesForView = notes;
  let blockersForView = blockers;
  if (!full && viewerRoleId !== undefined) {
    const ownTaskIds = new Set(viewerTasks.map((task) => task.taskId));
    const allowedFlows = new Set<string>();
    if (focus.flowId !== undefined) allowedFlows.add(focus.flowId);
    for (const task of viewerTasks) if (task.flowId !== undefined) allowedFlows.add(task.flowId);
    flows = flows.map((flow) => allowedFlows.has(flow.flowId)
      ? flow
      : { ...flow, sources: [], runs: [] });
    blockersForView = blockers.filter((blocker) => {
      if (blocker.kind === "task-blocked" || blocker.kind === "task-failed" || blocker.kind === "redispatch-exhausted") {
        return blocker.taskId !== undefined && ownTaskIds.has(blocker.taskId);
      }
      if (blocker.kind === "chief-note") return true;
      return blocker.flowId !== undefined && allowedFlows.has(blocker.flowId);
    });
    notesForView = [];
  }

  const filteredVersions = scope.flowId !== undefined ? versionViews.filter((version) => version.flowId === scope.flowId) : versionViews;
  const filteredEvidence = scope.flowId !== undefined ? evidence.filter((item) => item.flowId === scope.flowId) : evidence;
  const filteredFlows = scope.flowId !== undefined ? flows.filter((flow) => flow.flowId === scope.flowId) : flows;
  const filteredBlockers = scope.flowId !== undefined
    ? blockersForView.filter((blocker) => blocker.flowId === undefined || blocker.flowId === scope.flowId)
    : blockersForView;

  return {
    schema: PROJECT_STATE_SCHEMA,
    generatedAt,
    projectRoot,
    focus,
    flows: filteredFlows,
    tasks: bounded.tasks,
    blockers: filteredBlockers,
    versions: filteredVersions,
    evidence: filteredEvidence,
    notes: notesForView,
    nextStep,
    errors,
    truncated: flowsTruncated || bounded.truncated || versionsTruncated || evidenceTruncated,
    counts,
  };
}

function defaultDerivedNextStepText(code: ProjectStateDerivedNextStepCode): string {
  switch (code) {
    case "set-focus": return "set a focus flow";
    case "pin-run": return "pin the current draft run";
    case "resolve-blockers": return "resolve current blockers";
    case "none": return "no action";
  }
}

/**
 * 工具文本摘要投影（与 UI 同一 `ProjectStateView`，不二次派生）；UTF-8 ≤8 KiB，超限截断标注。
 * A2 可通过 labels 注入 A3 i18n 文案；缺省为机器可读英文短语。
 */
export function renderProjectStateSummary(
  view: ProjectStateView,
  labels: Partial<ProjectStateSummaryLabels> = {},
  workflow?: ProjectStateWorkflowSummary,
): string {
  const text = { ...DEFAULT_SUMMARY_LABELS, ...labels };
  const marker = `\n[${text.truncated}]`;
  const reserve = Buffer.byteLength(marker, "utf8");
  const lines: string[] = [];
  let used = 0;
  let truncated = view.truncated;
  const push = (line: string): boolean => {
    const bytes = Buffer.byteLength(`${line}\n`, "utf8");
    if (used + bytes > PROJECT_STATE_TOOL_MAX_BYTES - reserve) {
      truncated = true;
      return false;
    }
    lines.push(line);
    used += bytes;
    return true;
  };

  const focus = view.focus;
  push(`[${text.focus}] ${text.flow}=${focus.flowId ?? text.none} ${text.run}=${focus.runId ?? text.none} ` +
    `${text.status}=${focus.runState ?? text.none} ${text.stage}=${focus.stage ?? text.none} selectedBy=${focus.selectedBy}` +
    `${focus.stale === true ? " stale=true" : ""}`);
  push(`[${text.counts}] unclosed=${view.counts.unclosed} supersededUnclosed=${view.counts.supersededUnclosed} ` +
    `activeUnclosed=${view.counts.activeUnclosed} blocked=${view.counts.blocked} failed=${view.counts.failed} ` +
    `pendingRequests=${view.counts.pendingRequests} flows=${view.counts.flows} tasks=${view.counts.tasks}`);

  push(`[${text.tasks}]`);
  const unclosedTasks = view.tasks.filter((task) => task.status !== "closed");
  if (unclosedTasks.length === 0) push(`- ${text.none}`);
  for (const task of unclosedTasks) {
    if (!push(`- #${task.taskId} to=${task.targetRoleId} status=${task.status} blocked=${task.blocked} failed=${task.failed} ` +
      `flow=${task.flowId ?? text.none} run=${task.runId ?? text.none} text=${shortenSummary(task.text, 120)}`)) break;
  }

  push(`[${text.blockers}]`);
  if (view.blockers.length === 0) push(`- ${text.none}`);
  for (const blocker of view.blockers.slice(0, 20)) {
    if (!push(`- kind=${blocker.kind} ${text.flow}=${blocker.flowId ?? text.none} ${text.source}=${blocker.source} ` +
      `summary=${shortenSummary(blocker.summary, 160)}`)) break;
  }

  push(`[${text.versions}]`);
  if (view.versions.length === 0) push(`- ${text.none}`);
  for (const version of view.versions.slice(0, 20)) {
    if (!push(`- ${text.flow}=${version.flowId} kind=${version.docKind} latest=${version.latest?.version ?? text.none} ` +
      `path=${version.latest?.path ?? text.none} pinned=${version.pinned?.version ?? version.pinned?.path ?? text.none} ` +
      `newerThanPinned=${version.newerThanPinned}${version.referenceIssue !== undefined ? ` referenceIssue=${shortenSummary(version.referenceIssue, 120)}` : ""}`)) break;
  }

  push(`[${text.evidence}]`);
  if (view.evidence.length === 0) push(`- ${text.none}`);
  for (const item of view.evidence.slice(0, 20)) {
    if (!push(`- ${text.flow}=${item.flowId} kind=${item.kind} ref=${item.ref} status=${item.status}`)) break;
  }

  // T3 fixed 工作流视图（只读投影；`legacyStateIgnored` 作为警告展示，不静默——G-18）。
  if (workflow !== undefined) {
    if (workflow.workflow !== undefined) {
      const wf = workflow.workflow;
      push(`[workflow] ${wf.workflowId} flow=${wf.flowId} path=${wf.path} stage=${wf.stage} status=${wf.status}` +
        `${wf.basisId !== undefined ? ` basis=${wf.basisId}` : ""}${wf.releaseId !== undefined ? ` release=${wf.releaseId}` : ""}` +
        `${wf.reviewRoleId !== undefined ? ` reviewRole=${wf.reviewRoleId}` : ""}` +
        `${wf.blocked !== undefined ? ` blocked=${wf.blocked.code}` : ""}` +
        `${wf.closed !== undefined ? ` closed=${wf.closed.outcome}` : ""}`);
      if (wf.nextStages.length > 0) push(`- next=${wf.nextStages.join(",")}`);
    } else {
      push(`[workflow] ${text.none}`);
    }
    if (workflow.legacyStateIgnored.length > 0) {
      push(`- legacyStateIgnored=${workflow.legacyStateIgnored.join(",")}`);
    }
    for (const warning of workflow.warnings.slice(0, 10)) push(`- warning=${shortenSummary(warning, 160)}`);
  }
  if (view.nextStep !== undefined) {
    push(`[${text.nextStep}] ${text.source}=${view.nextStep.source} text=${shortenSummary(view.nextStep.text, 200)}`);
  }
  if (view.errors.length > 0) {
    push(`[${text.errors}] count=${view.errors.length}`);
    for (const error of view.errors.slice(0, 3)) {
      if (!push(`- ${error.source}: ${shortenSummary(error.message, 160)}${error.file !== undefined ? ` (${error.file}${error.line !== undefined ? `:${error.line}` : ""})` : ""}`)) break;
    }
  }
  if (truncated) lines.push(marker.trim());
  return lines.join("\n");
}

// —————————————— T3 B1：fixed 工作流只读投影（AC-19/G-18；project_state 附加段） ——————————————
//
// 形状保持**加法可选**：`ProjectStateView`（Model 属主）不在此改动；本段另提供
// `ProjectStateWorkflowSummary`，由 `renderProjectStateSummary(view, labels, workflow)` 追加展示。
// `legacyStateIgnored` 作为警告/审计字段展示（存在旧 trunk/run/versions 状态时如实列出，不静默）。

export interface ProjectStateWorkflowStage {
  stage: string;
  status: string;
  attempt: number;
}

export interface ProjectStateWorkflowEntry {
  workflowId: string;
  flowId: string;
  path: "A" | "B";
  stage: string;
  status: string;
  basisId?: string;
  releaseId?: string;
  reviewRoleId?: string;
  blocked?: { code: string; summary: string };
  stopping?: boolean;
  closed?: { outcome: string; reason: string };
  activatedRoleIds: string[];
  nextStages: string[];
  stages: ProjectStateWorkflowStage[];
}

export interface ProjectStateRoleActivation {
  workflowId: string;
  roleId: string;
  rosterPath: string;
  rosterSha256: string;
  documents: { path: string; sha256: string }[];
}

export interface ProjectStateWorkflowSummary {
  /** 活动（或最近）fixed workflow 的单条视图；无 workflow 时缺席。 */
  workflow?: ProjectStateWorkflowEntry;
  /** 全部 workflow（按启动顺序；有界读取由账本轮转承担）。 */
  workflows: ProjectStateWorkflowEntry[];
  activeWorkflowId?: string;
  /** 被忽略的旧治理状态（存在即列出；只读忽略、不删除/不迁移）。 */
  legacyStateIgnored: string[];
  roleActivations: ProjectStateRoleActivation[];
  warnings: string[];
}

/**
 * 构建 fixed 工作流只读投影（纯读、零写入、不缓存）：
 * - workflow 视图由 `deriveWorkflowView`（纯投影）派生；坏账本 ⇒ `workflow-corrupt` 警告；
 * - basis/release 引用与 `reviewRoleId` 从 basis 账本读取；
 * - `legacyStateIgnored` 探测 `.ans/trunk`/`.ans/runs`/旧 state 文件，如实列出（G-18）。
 */
export async function buildWorkflowStateProjection(input: {
  projectRoot: string;
}): Promise<ProjectStateWorkflowSummary> {
  const warnings: string[] = [];
  const workflowLedger = await readWorkflowLedger(input.projectRoot);
  const basisLedger = await readBasisLedger(input.projectRoot);
  const releaseLedger = await readReleaseLedger(input.projectRoot);
  const taskState = await readTaskState(input.projectRoot);
  const legacy = await detectLegacyStateIgnored(input.projectRoot);
  if (legacy.present) warnings.push(`legacyStateIgnored: ${legacy.ignored.join(",")}（只读忽略，不删除/不迁移）`);
  if (workflowLedger.badLines > 0) warnings.push(`workflow-ledger-bad-lines: ${workflowLedger.badLines}`);
  if (basisLedger.badLines > 0) warnings.push(`basis-ledger-bad-lines: ${basisLedger.badLines}`);

  const workflowIds: string[] = [];
  for (const event of workflowLedger.events) if (!workflowIds.includes(event.workflowId)) workflowIds.push(event.workflowId);
  const workflows: ProjectStateWorkflowEntry[] = [];
  const roleActivations: ProjectStateRoleActivation[] = [];
  for (const workflowId of workflowIds) {
    const events = workflowLedger.events.filter((event) => event.workflowId === workflowId);
    const view = deriveWorkflowView(events, taskState.events);
    if (view.blocked?.code === "workflow-corrupt") warnings.push(`workflow-corrupt: ${workflowId}（${view.blocked.summary}）`);
    const basis = [...basisLedger.events]
      .reverse()
      .find((event) => (event.kind === "basis.recorded" || event.kind === "basis.amended") && event.workflowId === workflowId);
    const release = [...releaseLedger.events]
      .reverse()
      .find((event) => event.kind === "release.merged" && event.workflowId === workflowId);
    for (const event of events) {
      if (event.kind === "role.activated") {
        roleActivations.push({
          workflowId,
          roleId: event.roleId,
          rosterPath: event.roster.path,
          rosterSha256: event.roster.sha256,
          documents: event.documents.map((doc) => ({ ...doc })),
        });
      }
    }
    workflows.push({
      workflowId,
      flowId: view.flowId,
      path: view.path,
      stage: view.stage,
      status: view.status,
      ...(view.basisId !== undefined
        ? { basisId: view.basisId }
        : basis !== undefined && (basis.kind === "basis.recorded" || basis.kind === "basis.amended")
          ? { basisId: basis.basisId }
          : {}),
      ...(release !== undefined && release.kind === "release.merged" ? { releaseId: release.releaseId } : {}),
      ...(basis !== undefined && (basis.kind === "basis.recorded" || basis.kind === "basis.amended")
        ? (basis.reviewRoleId !== undefined ? { reviewRoleId: basis.reviewRoleId } : {})
        : {}),
      ...(view.blocked !== undefined ? { blocked: { ...view.blocked } } : {}),
      ...(view.stopping === true ? { stopping: true } : {}),
      ...(view.closed !== undefined ? { closed: { ...view.closed } } : {}),
      activatedRoleIds: [...(view.activatedRoleIds ?? [])],
      nextStages: [...nextStages(view)],
      stages: Object.entries(view.stages)
        .filter(([, state]) => state.status !== "pending")
        .map(([stage, state]) => ({ stage, status: state.status, attempt: state.attempt })),
    });
  }
  const activeWorkflowId = [...workflows].reverse().find((workflow) => workflow.closed === undefined)?.workflowId;
  const active = workflows.find((workflow) => workflow.workflowId === activeWorkflowId) ?? workflows[workflows.length - 1];
  return {
    ...(active !== undefined ? { workflow: active } : {}),
    workflows,
    ...(activeWorkflowId !== undefined ? { activeWorkflowId } : {}),
    legacyStateIgnored: [...legacy.ignored],
    roleActivations,
    warnings,
  };
}
