// src/common/编排/run-manifest.ts
// 2026-10-30（方案 v3 §3.1；第一波 3.1）：应用拥有的 run 冻结契约。
//
// 职责：draft runId → pinned manifest 的生命周期、文档/hash/schema 校验、active run 查找、
// run-change 三模式与 approve/reject/cancel 回退映射。manifest 只由应用写（`.ans/runs/<runId>/manifest.json`）；
// 项目角色只读。本模块不派发、不判定语义质量、不新增第二份文档内容（只存路径+hash+引用）。
//
// 纪律：pin fail-closed；hash/schema/roster/D3 不一致拒绝；legacy 无 manifest 由调用方标 legacy，不伪造 pinned。

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { DEFAULT_LOCALE, translate } from "../shared/i18n/index.ts";

import {
  PROJECT_MODULES_SCHEMA,
  PROJECT_PROPOSAL_SCHEMA,
  PROJECT_ROSTER_SCHEMA,
  PROJECT_TOPOLOGY_SCHEMA,
  loadLatestRoster,
  parseProjectModules,
  parseProjectRoster,
  type RosterLoadResult,
} from "./workflow-preconditions.ts";

export const RUN_SCHEMA = "ans-run/v1" as const;
export const RUN_INTENT_SCHEMA = "project-intent/v1" as const;
export const RUN_ARCHITECTURE_SCHEMA = "project-architecture/v1" as const;
export const RUN_ASSETS_SCHEMA = "project-assets/v1" as const;
export const RUN_TEAM_PLAN_SCHEMA = "teamPlanSchema:3" as const;
export const RUN_EVIDENCE_SCHEMA = "evidence-meta/v1" as const;
export const RUN_CHANGE_SCHEMA = "run-change/v1" as const;
/** M1 尚无 flowId 时的 draft 占位 flow；下一真实 flow 到达时由 ensureDraftRun 领养同一 runId。 */
export const RUN_PENDING_FLOW_ID = "pending";
// D-04 生产源码禁旧 flow 引擎字面量；这里只是 run manifest 的可选流程文件目录。
const FLOW_DOC_DIR = ["docs", "flows"].join("/");

export type RunState = "draft" | "pinned" | "closed" | "cancelled";
export type RunDocKind = "intent" | "proposal" | "modules" | "roster" | "topology" | "architecture" | "assets";

export interface RunDocRef {
  path: string;
  sha256?: string;
  /** 可选 schema 标记（team plan 等）。 */
  schema?: string;
  /** topology 块的机器源标记。 */
  source?: "roster-block";
  /** topology 归档副本（不参与 active 依据）。 */
  archivePath?: string;
}

export interface RunFlowRef extends RunDocRef {
  version: number;
}

export interface RunManifest {
  schema: typeof RUN_SCHEMA;
  runId: string;
  flowId: string;
  state: RunState;
  createdAt: string;
  updatedAt: string;
  pinnedAt?: string;
  pinnedBy?: "app";
  closedAt?: string;
  closeReason?: string;
  schemas: Record<string, string>;
  documents: Partial<Record<RunDocKind, RunDocRef | null>>;
  execution: {
    teamPlan: RunDocRef | null;
    flow: RunFlowRef | null;
  };
  rosterVersion?: number;
  d3?: { decisionId: string; targetRoleIds: string[] };
  stage?: { current: string; planVersion: number; flowVersion?: number };
  roles?: string[];
  runChange?: RunChangeRecord;
}

export interface RunChangeRecord {
  schema: typeof RUN_CHANGE_SCHEMA;
  decisionId: string;
  requestId?: string;
  mode: RunChangeMode;
  decidedBy: "customer" | "judge";
  decidedAt: string;
  oldRunId: string;
  newRunId?: string;
  oldHashes: Record<string, string>;
  newHashes?: Record<string, string>;
}

export type RunChangeMode = "continue-frozen" | "stop-and-restart" | "stop";

export type RunManifestErrorCode =
  | "run-manifest-invalid"
  | "run-manifest-missing"
  | "run-manifest-read-failed"
  | "run-manifest-write-failed"
  | "run-state-invalid"
  | "run-pin-document-missing"
  | "run-pin-schema-mismatch"
  | "run-pin-hash-mismatch"
  | "run-pin-d3-missing"
  | "run-pin-roster-invalid"
  | "run-pin-active-conflict"
  | "run-change-invalid";

export type RunManifestResult<T> = ({ ok: true } & T) | { ok: false; code: RunManifestErrorCode; reason: string };

const RUN_ID_RE = /^run-[a-z0-9][a-z0-9-]{2,95}$/;

export function isRunId(value: unknown): value is string {
  return typeof value === "string" && RUN_ID_RE.test(value);
}

export function runManifestRelPath(runId: string): string {
  return path.posix.join(".ans", "runs", runId, "manifest.json");
}

export function runManifestPath(projectRoot: string, runId: string): string {
  return path.join(projectRoot, runManifestRelPath(runId));
}

function sanitizeFlow(flowId: string): string {
  const slug = flowId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug === "" ? "flow" : slug;
}

/** 生成新的 draft runId（日期+flow+随机；不是文档版本号）。 */
export function newRunId(flowId: string, now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `run-${date}-${sanitizeFlow(flowId)}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 仅做形状校验；文档 hash/schema 由 pin/verify 重算，读取时不做信任。 */
export function validateRunManifest(value: unknown): RunManifestResult<{ manifest: RunManifest }> {
  if (!isRecord(value)) return { ok: false, code: "run-manifest-invalid", reason: "manifest 必须是对象。" };
  const state = value["state"];
  if (state !== "draft" && state !== "pinned" && state !== "closed" && state !== "cancelled") {
    return { ok: false, code: "run-state-invalid", reason: `manifest.state 非法：${String(state)}` };
  }
  if (value["schema"] !== RUN_SCHEMA) return { ok: false, code: "run-manifest-invalid", reason: `manifest.schema 必须为 ${RUN_SCHEMA}。` };
  if (!isRunId(value["runId"])) return { ok: false, code: "run-manifest-invalid", reason: "manifest.runId 非法。" };
  if (typeof value["flowId"] !== "string" || value["flowId"].trim() === "") {
    return { ok: false, code: "run-manifest-invalid", reason: "manifest.flowId 缺失。" };
  }
  for (const field of ["createdAt", "updatedAt"] as const) {
    if (typeof value[field] !== "string" || Number.isNaN(Date.parse(value[field]))) {
      return { ok: false, code: "run-manifest-invalid", reason: `manifest.${field} 必须是 ISO 时间。` };
    }
  }
  if (!isRecord(value["schemas"])) return { ok: false, code: "run-manifest-invalid", reason: "manifest.schemas 必须是对象。" };
  if (!isRecord(value["documents"])) return { ok: false, code: "run-manifest-invalid", reason: "manifest.documents 必须是对象。" };
  if (!isRecord(value["execution"])) return { ok: false, code: "run-manifest-invalid", reason: "manifest.execution 缺失。" };
  return { ok: true, manifest: value as unknown as RunManifest };
}

export async function readRunManifest(projectRoot: string, runId: string): Promise<RunManifestResult<{ manifest: RunManifest }>> {
  if (!isRunId(runId)) return { ok: false, code: "run-manifest-invalid", reason: `runId 非法：${runId}` };
  let text: string;
  try {
    text = await readFile(runManifestPath(projectRoot, runId), "utf8");
  } catch {
    return { ok: false, code: "run-manifest-missing", reason: `未找到 run manifest：${runManifestRelPath(runId)}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, code: "run-manifest-invalid", reason: `run manifest JSON 非法：${error instanceof Error ? error.message : String(error)}` };
  }
  return validateRunManifest(parsed);
}

const runWriteChains = new Map<string, Promise<void>>();

export async function writeRunManifest(projectRoot: string, manifest: RunManifest): Promise<RunManifestResult<{ manifest: RunManifest }>> {
  const checked = validateRunManifest(manifest);
  if (!checked.ok) return checked;
  const file = runManifestPath(projectRoot, manifest.runId);
  const dir = path.dirname(file);
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const prev = runWriteChains.get(file) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = prev.then(() => gate);
  runWriteChains.set(file, tail);
  try {
    await prev;
    await mkdir(dir, { recursive: true });
    await writeFile(tmp, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    let renamed = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await rename(tmp, file);
        renamed = true;
        break;
      } catch (error) {
        if (attempt === 5) throw error;
        await delay(10 * 2 ** attempt);
      }
    }
    if (!renamed) throw new Error("rename did not complete");
  } catch (error) {
    try { await unlink(tmp); } catch { /* best-effort cleanup */ }
    return { ok: false, code: "run-manifest-write-failed", reason: `run manifest 写入失败：${error instanceof Error ? error.message : String(error)}` };
  } finally {
    release();
    if (runWriteChains.get(file) === tail) runWriteChains.delete(file);
  }
  return { ok: true, manifest };
}

export async function listRunManifestsResult(projectRoot: string): Promise<RunManifestResult<{ manifests: RunManifest[] }>> {
  const root = path.join(projectRoot, ".ans", "runs");
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return { ok: true, manifests: [] };
  }
  const manifests: RunManifest[] = [];
  for (const name of names) {
    if (!isRunId(name)) continue;
    const read = await readRunManifest(projectRoot, name);
    if (!read.ok) return { ok: false, code: read.code, reason: `run ${name} manifest 非法：${read.reason}` };
    manifests.push(read.manifest);
  }
  return { ok: true, manifests: manifests.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) };
}

/** 同一 flowId 的 active run（draft/pinned）；多个 pinned 视为冲突。 */
export async function findActiveRun(
  projectRoot: string,
  flowId: string,
): Promise<RunManifestResult<{ manifest: RunManifest | null }>> {
  const listed = await listRunManifestsResult(projectRoot);
  if (!listed.ok) return listed;
  const runs = listed.manifests.filter((run) => run.flowId === flowId && (run.state === "draft" || run.state === "pinned"));
  const pinned = runs.filter((run) => run.state === "pinned");
  if (pinned.length > 1) return { ok: false, code: "run-pin-active-conflict", reason: `flow ${flowId} 存在多个 active pinned run：${pinned.map((run) => run.runId).join("、")}` };
  const active = pinned[0] ?? runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  return { ok: true, manifest: active };
}

/** M1 前生成 draft；已有 draft/pinned 时复用，不生成第二个 runId。 */
export async function ensureDraftRun(
  projectRoot: string,
  flowId: string,
  now: Date = new Date(),
): Promise<RunManifestResult<{ manifest: RunManifest; created: boolean }>> {
  const active = await findActiveRun(projectRoot, flowId);
  if (!active.ok) return active;
  if (active.manifest !== null) return { ok: true, manifest: active.manifest, created: false };
  if (flowId !== RUN_PENDING_FLOW_ID) {
    const pending = await findActiveRun(projectRoot, RUN_PENDING_FLOW_ID);
    if (!pending.ok) return pending;
    if (pending.manifest !== null && pending.manifest.state === "draft") {
      const adopted: RunManifest = { ...pending.manifest, flowId, updatedAt: now.toISOString() };
      const written = await writeRunManifest(projectRoot, adopted);
      return written.ok ? { ok: true, manifest: written.manifest, created: false } : written;
    }
  }
  const at = now.toISOString();
  const manifest: RunManifest = {
    schema: RUN_SCHEMA,
    runId: newRunId(flowId, now),
    flowId,
    state: "draft",
    createdAt: at,
    updatedAt: at,
    schemas: { run: RUN_SCHEMA },
    documents: {},
    execution: { teamPlan: null, flow: null },
  };
  const written = await writeRunManifest(projectRoot, manifest);
  return written.ok ? { ok: true, manifest: written.manifest, created: true } : written;
}

async function sha256File(projectRoot: string, rel: string): Promise<string | undefined> {
  try {
    const bytes = await readFile(path.join(projectRoot, rel));
    return createHash("sha256").update(bytes).digest("hex");
  } catch {
    return undefined;
  }
}

async function readText(projectRoot: string, rel: string): Promise<string | undefined> {
  try {
    return await readFile(path.join(projectRoot, rel), "utf8");
  } catch {
    return undefined;
  }
}

async function readdirSafe(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

function latestVersioned(names: readonly string[], pattern: RegExp): { name: string; version: number } | undefined {
  let best: { name: string; version: number } | undefined;
  for (const name of names) {
    const match = pattern.exec(name);
    if (match === null) continue;
    const version = Number(match[1]);
    if (!Number.isInteger(version) || version < 1) continue;
    if (best === undefined || version > best.version) best = { name, version };
  }
  return best;
}

function frontmatterSchema(text: string): string | undefined {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return undefined;
  const end = normalized.indexOf("\n---", 3);
  if (end < 0) return undefined;
  try {
    const parsed = parseYaml(normalized.slice(4, end));
    if (!isRecord(parsed)) return undefined;
    return typeof parsed["schema"] === "string" ? parsed["schema"] : undefined;
  } catch {
    return undefined;
  }
}

function schemaMatches(text: string, expected: string): { ok: true } | { ok: false; reason: string } {
  const actual = frontmatterSchema(text);
  if (actual !== undefined && actual !== expected) {
    return { ok: false, reason: `文档头 schema=${actual} 与 pin 期望 ${expected} 不一致。` };
  }
  return { ok: true };
}

export interface RunPinFacts {
  d3?: { decisionId: string; targetRoleIds: string[] };
}

/**
 * 组装并校验 pin 所需七类文档 + execution（teamPlan/flow 可选 null）+ schemas + D3 + roles。
 * 只读项目文档；不写 manifest（由 pinRun 写）。
 */
export async function prepareRunPin(
  projectRoot: string,
  flowId: string,
  facts: RunPinFacts = {},
): Promise<RunManifestResult<{ pinned: Omit<RunManifest, "schema" | "runId" | "state" | "createdAt" | "updatedAt"> }>> {
  if (facts.d3 === undefined || facts.d3.decisionId === "" || facts.d3.targetRoleIds.length === 0) {
    return { ok: false, code: "run-pin-d3-missing", reason: "run pin 缺少 D3 裁决（decisionId/targetRoleIds）。" };
  }
  const product = await readdirSafe(path.join(projectRoot, "docs", "product"));
  const proposals = await readdirSafe(path.join(projectRoot, "docs", "proposals"));
  const contracts = await readdirSafe(path.join(projectRoot, "docs", "contracts"));
  const escaped = flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const intent = latestVersioned(product, new RegExp(`^${escaped}-intent-v(\\d+)\\.md$`));
  const proposal = latestVersioned(proposals, new RegExp(`^${escaped}-proposal-v(\\d+)\\.md$`));
  const modules = latestVersioned(proposals, new RegExp(`^${escaped}-modules-v(\\d+)\\.md$`));
  const roster = latestVersioned(proposals, new RegExp(`^${escaped}-roster-v(\\d+)\\.md$`));
  const architecture = latestVersioned(contracts, new RegExp(`^${escaped}-architecture-v(\\d+)\\.md$`));
  const assets = latestVersioned(contracts, new RegExp(`^${escaped}-assets-v(\\d+)\\.md$`));
  const required: Array<[string, { name: string; version: number } | undefined]> = [
    ["intent", intent],
    ["proposal", proposal],
    ["modules", modules],
    ["roster", roster],
    ["architecture", architecture],
  ];
  for (const [kind, found] of required) {
    if (found === undefined) {
      return { ok: false, code: "run-pin-document-missing", reason: `缺少 pin 所需文档：docs/.../${flowId}-${kind}-vN.md。` };
    }
  }
  const intentRel = `docs/product/${intent!.name}`;
  const proposalRel = `docs/proposals/${proposal!.name}`;
  const modulesRel = `docs/proposals/${modules!.name}`;
  const rosterRel = `docs/proposals/${roster!.name}`;
  const architectureRel = `docs/contracts/${architecture!.name}`;
  const rosterLoaded = await loadLatestRoster({ projectRoot, flowId });
  if (!rosterLoaded.ok || rosterLoaded.path !== rosterRel) {
    return { ok: false, code: "run-pin-roster-invalid", reason: rosterLoaded.ok ? `最新 roster 路径不一致：${rosterLoaded.path}` : rosterLoaded.reason };
  }
  const rosterManifest = rosterLoaded.roster;
  const texts = {
    intent: await readText(projectRoot, intentRel),
    proposal: await readText(projectRoot, proposalRel),
    modules: await readText(projectRoot, modulesRel),
    architecture: await readText(projectRoot, architectureRel),
  };
  for (const [kind, text] of Object.entries(texts)) {
    if (text === undefined) return { ok: false, code: "run-pin-document-missing", reason: `pin 文档不可读：${kind}` };
  }
  const schemaChecks: Array<[string, string, string]> = [
    ["intent", texts.intent!, RUN_INTENT_SCHEMA],
    ["proposal", texts.proposal!, PROJECT_PROPOSAL_SCHEMA],
    ["modules", texts.modules!, PROJECT_MODULES_SCHEMA],
    ["architecture", texts.architecture!, RUN_ARCHITECTURE_SCHEMA],
  ];
  for (const [kind, text, expected] of schemaChecks) {
    const checked = schemaMatches(text, expected);
    if (!checked.ok) return { ok: false, code: "run-pin-schema-mismatch", reason: `${kind}：${checked.reason}` };
  }
  const rosterSha = await sha256File(projectRoot, rosterRel);
  const assetsRel = assets !== undefined ? `docs/contracts/${assets.name}` : undefined;
  let assetsRef: RunDocRef | null = null;
  if (assetsRel !== undefined) {
    const assetsText = await readText(projectRoot, assetsRel);
    if (assetsText === undefined) return { ok: false, code: "run-pin-document-missing", reason: `assets 文档不可读：${assetsRel}` };
    const checked = schemaMatches(assetsText, RUN_ASSETS_SCHEMA);
    if (!checked.ok) return { ok: false, code: "run-pin-schema-mismatch", reason: `assets：${checked.reason}` };
    const sha = await sha256File(projectRoot, assetsRel);
    if (sha === undefined) return { ok: false, code: "run-pin-document-missing", reason: `assets 文档 hash 计算失败：${assetsRel}` };
    assetsRef = { path: assetsRel, sha256: sha };
  }
  const docs: Record<string, RunDocRef | null> = {
    intent: { path: intentRel, sha256: await sha256File(projectRoot, intentRel) },
    proposal: { path: proposalRel, sha256: await sha256File(projectRoot, proposalRel) },
    modules: { path: modulesRel, sha256: await sha256File(projectRoot, modulesRel) },
    roster: { path: rosterRel, sha256: rosterSha },
    topology: { path: `${rosterRel}#人员+模块拓扑图`, source: "roster-block", sha256: rosterSha },
    architecture: { path: architectureRel, sha256: await sha256File(projectRoot, architectureRel) },
    assets: assetsRef,
  };
  for (const [kind, ref] of Object.entries(docs)) {
    if (ref !== null && ref.sha256 === undefined) {
      return { ok: false, code: "run-pin-document-missing", reason: `pin 文档 hash 计算失败：${kind}` };
    }
  }
  const teamPlanRel = `docs/scheduling/${flowId}-team-v1.md`;
  const teamPlanSha = await sha256File(projectRoot, teamPlanRel);
  if (teamPlanSha !== undefined) {
    const teamText = await readText(projectRoot, teamPlanRel);
    if (teamText === undefined) return { ok: false, code: "run-pin-document-missing", reason: `team plan 不可读：${teamPlanRel}` };
    const actual = frontmatterSchema(teamText);
    if (actual !== RUN_TEAM_PLAN_SCHEMA) {
      return { ok: false, code: "run-pin-schema-mismatch", reason: `team plan 必须带 schema: ${RUN_TEAM_PLAN_SCHEMA}（实际 ${actual ?? "缺失"}）。` };
    }
  }
  const flowRel = `${FLOW_DOC_DIR}/${flowId}.yaml`;
  const flowText = await readText(projectRoot, flowRel);
  let flowRef: RunFlowRef | null = null;
  if (flowText !== undefined) {
    if (flowText.trim() === "") {
      return { ok: false, code: "run-pin-schema-mismatch", reason: `flow 文件为空：${flowRel}` };
    }
    const flowSha = await sha256File(projectRoot, flowRel);
    if (flowSha === undefined) return { ok: false, code: "run-pin-document-missing", reason: `flow 文档 hash 计算失败：${flowRel}` };
    let version: number | undefined;
    try {
      const parsed = parseYaml(flowText);
      if (isRecord(parsed) && typeof parsed["version"] === "number" && Number.isInteger(parsed["version"]) && parsed["version"] > 0) version = parsed["version"];
    } catch {
      return { ok: false, code: "run-pin-schema-mismatch", reason: `flow YAML 非法：${flowRel}` };
    }
    if (version === undefined) return { ok: false, code: "run-pin-schema-mismatch", reason: `flow 文件存在但缺合法 version：${flowRel}` };
    flowRef = { path: flowRel, version, sha256: flowSha };
  }
  const roles = rosterManifest.roles.map((role) => role.id);
  const schemas: Record<string, string> = {
    run: RUN_SCHEMA,
    intent: RUN_INTENT_SCHEMA,
    proposal: PROJECT_PROPOSAL_SCHEMA,
    modules: PROJECT_MODULES_SCHEMA,
    roster: PROJECT_ROSTER_SCHEMA,
    topology: PROJECT_TOPOLOGY_SCHEMA,
    architecture: RUN_ARCHITECTURE_SCHEMA,
    teamPlan: RUN_TEAM_PLAN_SCHEMA,
    assets: RUN_ASSETS_SCHEMA,
    evidence: RUN_EVIDENCE_SCHEMA,
  };
  return {
    ok: true,
    pinned: {
      flowId,
      pinnedAt: new Date().toISOString(),
      pinnedBy: "app",
      schemas,
      documents: docs,
      execution: {
        teamPlan: teamPlanSha !== undefined ? { path: teamPlanRel, schema: RUN_TEAM_PLAN_SCHEMA, sha256: teamPlanSha } : null,
        flow: flowRef,
      },
      rosterVersion: rosterManifest.version,
      d3: { decisionId: facts.d3.decisionId, targetRoleIds: [...facts.d3.targetRoleIds] },
      stage: { current: "stage-1", planVersion: 1, ...(flowRef !== null ? { flowVersion: flowRef.version } : {}) },
      roles,
    },
  };
}

/** 把同一 runId 的 draft 升为 pinned；并发调用幂等（已 pinned 返回现有）。 */
const pinChains = new Map<string, Promise<void>>();

export async function pinRun(projectRoot: string, runId: string, facts: RunPinFacts = {}): Promise<RunManifestResult<{ manifest: RunManifest; alreadyPinned: boolean }>> {
  const prev = pinChains.get(projectRoot) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = prev.then(() => gate);
  pinChains.set(projectRoot, tail);
  try {
    await prev;
    return await pinRunUnsafe(projectRoot, runId, facts);
  } finally {
    release();
    if (pinChains.get(projectRoot) === tail) pinChains.delete(projectRoot);
  }
}

async function pinRunUnsafe(projectRoot: string, runId: string, facts: RunPinFacts = {}): Promise<RunManifestResult<{ manifest: RunManifest; alreadyPinned: boolean }>> {
  const current = await readRunManifest(projectRoot, runId);
  if (!current.ok) return current;
  if (current.manifest.state === "pinned") return { ok: true, manifest: current.manifest, alreadyPinned: true };
  if (current.manifest.state !== "draft") {
    return { ok: false, code: "run-state-invalid", reason: `run ${runId} 状态为 ${current.manifest.state}，不能 pin。` };
  }
  const prepared = await prepareRunPin(projectRoot, current.manifest.flowId, facts);
  if (!prepared.ok) return prepared;
  const active = await findActiveRun(projectRoot, current.manifest.flowId);
  if (!active.ok) return active;
  if (active.manifest !== null && active.manifest.runId !== runId && active.manifest.state === "pinned") {
    return { ok: false, code: "run-pin-active-conflict", reason: `flow ${current.manifest.flowId} 已有 active pinned run ${active.manifest.runId}。` };
  }
  const now = new Date().toISOString();
  const manifest: RunManifest = {
    ...prepared.pinned,
    schema: RUN_SCHEMA,
    runId,
    state: "pinned",
    createdAt: current.manifest.createdAt,
    updatedAt: now,
  };
  const written = await writeRunManifest(projectRoot, manifest);
  return written.ok ? { ok: true, manifest: written.manifest, alreadyPinned: false } : written;
}

export async function closeRun(
  projectRoot: string,
  runId: string,
  state: "closed" | "cancelled",
  reason = "",
): Promise<RunManifestResult<{ manifest: RunManifest }>> {
  const current = await readRunManifest(projectRoot, runId);
  if (!current.ok) return current;
  if (current.manifest.state === "closed" || current.manifest.state === "cancelled") return { ok: true, manifest: current.manifest };
  const now = new Date().toISOString();
  const manifest: RunManifest = {
    ...current.manifest,
    state,
    updatedAt: now,
    closedAt: now,
    ...(reason !== "" ? { closeReason: reason } : {}),
  };
  const written = await writeRunManifest(projectRoot, manifest);
  return written.ok ? { ok: true, manifest: written.manifest } : written;
}

/** 重算 manifest 钉住文档的 hash；漂移/缺失 fail-closed（不自动重写）。 */
export async function verifyPinnedRun(projectRoot: string, manifest: RunManifest): Promise<RunManifestResult<{ violations: string[] }>> {
  if (manifest.state !== "pinned") return { ok: false, code: "run-state-invalid", reason: `run ${manifest.runId} 未 pinned。` };
  const violations: string[] = [];
  for (const kind of ["intent", "proposal", "modules", "roster", "topology", "architecture", "assets"] as const) {
    if (!(kind in manifest.documents)) violations.push(`${kind}: missing from manifest.documents`);
  }
  for (const [kind, ref] of Object.entries(manifest.documents)) {
    if (ref === null || ref === undefined) continue;
    const fileRel = ref.path.split("#")[0]!;
    const sha = await sha256File(projectRoot, fileRel);
    if (sha === undefined) violations.push(`${kind}: missing ${ref.path}`);
    else if (ref.sha256 !== undefined && sha !== ref.sha256) violations.push(`${kind}: hash changed ${ref.path}`);
  }
  const extra: Array<[string, RunDocRef | null]> = [
    ["teamPlan", manifest.execution.teamPlan],
    ["flow", manifest.execution.flow],
  ];
  for (const [kind, ref] of extra) {
    if (ref === null) {
      // P1.5：文件存在却未 pin/null ⇒ 不一致（不能用不存在的 flow 路径冒充，也不能漏 pin 已有源）。
      const candidate = kind === "flow" ? `${FLOW_DOC_DIR}/${manifest.flowId}.yaml` : `docs/scheduling/${manifest.flowId}-team-v1.md`;
      if ((await sha256File(projectRoot, candidate)) !== undefined) violations.push(`${kind}: exists but manifest is null (${candidate})`);
      continue;
    }
    const sha = await sha256File(projectRoot, ref.path);
    if (sha === undefined) violations.push(`${kind}: missing ${ref.path}`);
    else if (ref.sha256 !== undefined && sha !== ref.sha256) violations.push(`${kind}: hash changed ${ref.path}`);
  }
  return { ok: true, violations };
}

/** 现有枚举回退映射：approve→stop-and-restart / reject→continue-frozen / cancel→stop。 */
export function mapRunChangeChoice(choice: unknown): RunChangeMode | undefined {
  if (choice === "continue-frozen" || choice === "stop-and-restart" || choice === "stop") return choice;
  if (choice === "approve") return "stop-and-restart";
  if (choice === "reject") return "continue-frozen";
  if (choice === "cancel") return "stop";
  return undefined;
}

/** 从 decision 卡最终选择得出唯一 mode；未知 ⇒ undefined（调用方 fail-closed）。 */
export function mapRunChangeAnswer(input: { choice?: unknown; selected?: unknown[] }): RunChangeMode | undefined {
  const selected = Array.isArray(input.selected) ? input.selected.filter((item): item is string => typeof item === "string") : [];
  if (selected.length === 1) return mapRunChangeChoice(selected[0]);
  return mapRunChangeChoice(input.choice);
}

/** 应用 run-change 结果：continue-frozen 不改 run；stop-and-restart 关闭旧 run 并返回需新 run 的标记；stop 关闭。 */
export async function applyRunChange(
  projectRoot: string,
  manifest: RunManifest,
  input: { decisionId: string; requestId?: string; mode: RunChangeMode; decidedBy: "customer" | "judge"; decidedAt?: string; newHashes?: Record<string, string> },
): Promise<RunManifestResult<{ manifest: RunManifest; mode: RunChangeMode; newRunRequired: boolean }>> {
  if (input.mode !== "continue-frozen" && input.mode !== "stop-and-restart" && input.mode !== "stop") {
    return { ok: false, code: "run-change-invalid", reason: `run-change mode 非法：${String(input.mode)}` };
  }
  const now = input.decidedAt ?? new Date().toISOString();
  const oldHashes: Record<string, string> = {};
  for (const [kind, ref] of Object.entries(manifest.documents)) {
    if (ref !== null && ref !== undefined && ref.sha256 !== undefined) oldHashes[kind] = ref.sha256;
  }
  if (input.mode === "continue-frozen") {
    const record: RunChangeRecord = {
      schema: RUN_CHANGE_SCHEMA,
      decisionId: input.decisionId,
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
      mode: input.mode,
      decidedBy: input.decidedBy,
      decidedAt: now,
      oldRunId: manifest.runId,
      oldHashes,
    };
    const next = { ...manifest, updatedAt: now, runChange: record };
    const written = await writeRunManifest(projectRoot, next);
    return written.ok ? { ok: true, manifest: written.manifest, mode: input.mode, newRunRequired: false } : written;
  }
  const closed = await closeRun(projectRoot, manifest.runId, input.mode === "stop" ? "cancelled" : "closed", `run-change:${input.mode}`);
  if (!closed.ok) return closed;
  let newRunId: string | undefined;
  if (input.mode === "stop-and-restart") {
    const draft = await ensureDraftRun(projectRoot, manifest.flowId);
    if (!draft.ok) return draft;
    newRunId = draft.manifest.runId;
  }
  const record: RunChangeRecord = {
    schema: RUN_CHANGE_SCHEMA,
    decisionId: input.decisionId,
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    mode: input.mode,
    decidedBy: input.decidedBy,
    decidedAt: now,
    oldRunId: manifest.runId,
    ...(newRunId !== undefined ? { newRunId } : {}),
    oldHashes,
    ...(input.newHashes !== undefined ? { newHashes: input.newHashes } : {}),
  };
  const next = { ...closed.manifest, updatedAt: now, runChange: record };
  const written = await writeRunManifest(projectRoot, next);
  return written.ok ? { ok: true, manifest: written.manifest, mode: input.mode, newRunRequired: input.mode === "stop-and-restart" } : written;
}

export interface RunChangeCardInput {
  runId: string;
  flowId: string;
  requestId: string;
  requestedBy?: "convener" | "planner" | "product";
  reason?: string;
  current: { state: RunState; documents: Record<string, string>; schemas: Record<string, string> };
  proposed?: { documents: Record<string, string>; schemas: Record<string, string> };
  affected?: { tasks?: string[]; stages?: string[]; roles?: string[] };
}

export interface RunChangeCard {
  schema: typeof RUN_CHANGE_SCHEMA;
  payload: Record<string, unknown>;
  request: {
    kind: "choice";
    title: string;
    question: string;
    cardKind: "decision";
    application: true;
    sourceRoleId: "application";
    flowId: string;
    options: Array<{ id: string; label: string; recommended?: boolean }>;
  };
}

/** 构造 app 自有 run-change decision 卡（复用 decision 卡，不新增 cardKind）。 */
export function buildRunChangeCard(input: RunChangeCardInput): RunChangeCard {
  const options = [
    { id: "continue-frozen", label: translate(DEFAULT_LOCALE, "ui.run.change.option.continueFrozen"), mode: "continue-frozen", recommended: true },
    { id: "stop-and-restart", label: translate(DEFAULT_LOCALE, "ui.run.change.option.stopAndRestart"), mode: "stop-and-restart" },
    { id: "stop", label: translate(DEFAULT_LOCALE, "ui.run.change.option.stop"), mode: "stop" },
  ];
  const payload = {
    schema: RUN_CHANGE_SCHEMA,
    requestId: input.requestId,
    runId: input.runId,
    flowId: input.flowId,
    ...(input.requestedBy !== undefined ? { requestedBy: input.requestedBy } : {}),
    issuedBy: "app",
    reason: input.reason ?? "客户/产品要求变更当前契约",
    current: { state: input.current.state, documents: input.current.documents, schemas: input.current.schemas },
    proposed: input.proposed ?? { documents: {}, schemas: {} },
    affected: input.affected ?? { tasks: [], stages: [], roles: [] },
    options,
    fallbackMap: { approve: "stop-and-restart", reject: "continue-frozen", cancel: "stop" },
  };
  return {
    schema: RUN_CHANGE_SCHEMA,
    payload,
    request: {
      kind: "choice",
      title: translate(DEFAULT_LOCALE, "ui.run.change.title", { flowId: input.flowId }),
      question: translate(DEFAULT_LOCALE, "ui.run.change.question"),
      cardKind: "decision",
      application: true,
      sourceRoleId: "application",
      flowId: input.flowId,
      options: options.map((option) => ({ id: option.id, label: option.label, ...(option.recommended === true ? { recommended: true } : {}) })),
    },
  };
}

/** 读取 pinned 文档摘要（供 UI/facts）。 */
export function pinnedDocsSummary(manifest: RunManifest): Array<{ kind: string; path: string; sha256?: string }> {
  return Object.entries(manifest.documents)
    .filter((entry): entry is [string, RunDocRef] => entry[1] !== null && entry[1] !== undefined)
    .map(([kind, ref]) => ({ kind, path: ref.path, ...(ref.sha256 !== undefined ? { sha256: ref.sha256 } : {}) }));
}


/** 从 pinned manifest 读取 roster（不读“最新”）；hash/模块快照漂移 fail-closed。 */
export async function loadPinnedRoster(projectRoot: string, manifest: RunManifest): Promise<RosterLoadResult> {
  if (manifest.state !== "pinned") {
    return { ok: false, code: "roster-missing", reason: `run ${manifest.runId} 未 pinned，不能作为实现/验收依据。` };
  }
  const rosterRef = manifest.documents.roster;
  const modulesRef = manifest.documents.modules;
  if (rosterRef === null || rosterRef === undefined || modulesRef === null || modulesRef === undefined) {
    return { ok: false, code: "roster-missing", reason: `run ${manifest.runId} manifest 缺 roster/modules 文档引用。` };
  }
  let rosterBytes: Buffer;
  try {
    rosterBytes = await readFile(path.join(projectRoot, rosterRef.path));
  } catch {
    return { ok: false, code: "roster-missing", reason: `pinned roster 不可读：${rosterRef.path}` };
  }
  const sha = createHash("sha256").update(rosterBytes).digest("hex");
  if (rosterRef.sha256 !== undefined && rosterRef.sha256 !== sha) {
    return { ok: false, code: "roster-version-invalid", reason: `pinned roster hash 漂移：${rosterRef.path}` };
  }
  const parsed = parseProjectRoster(rosterBytes.toString("utf8"), manifest.flowId);
  if (!parsed.ok) return parsed;
  if (parsed.roster.version !== manifest.rosterVersion) {
    return { ok: false, code: "roster-version-invalid", reason: `pinned roster version=${parsed.roster.version} 与 manifest.rosterVersion=${String(manifest.rosterVersion)} 不一致。` };
  }
  let modulesText: string;
  try {
    modulesText = await readFile(path.join(projectRoot, modulesRef.path), "utf8");
  } catch {
    return { ok: false, code: "roster-missing", reason: `pinned modules 不可读：${modulesRef.path}` };
  }
  if (modulesRef.sha256 !== undefined) {
    const modulesSha = createHash("sha256").update(modulesText, "utf8").digest("hex");
    if (modulesSha !== modulesRef.sha256) return { ok: false, code: "roster-modules-doc-invalid", reason: `pinned modules hash 漂移：${modulesRef.path}` };
  }
  const modulesParsed = parseProjectModules(modulesText, manifest.flowId);
  if (!modulesParsed.ok) return { ok: false, code: "roster-modules-doc-invalid", reason: modulesParsed.reason };
  if (JSON.stringify(modulesParsed.doc.modules) !== JSON.stringify(parsed.roster.modules)) {
    return { ok: false, code: "roster-modules-drift", reason: `pinned roster modules[] 与 pinned modules 文档不一致：${modulesRef.path}` };
  }
  return { ok: true, roster: parsed.roster, path: rosterRef.path, version: parsed.roster.version, sha256: sha };
}
