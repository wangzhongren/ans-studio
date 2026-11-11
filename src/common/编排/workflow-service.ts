// src/common/编排/workflow-service.ts
// 编排主属（T3「两条固定工作流路径」B0，2026-11-10）：固定工作流账本/模式/配置写回的**骨架**。
//
// 依据：实现级方案 v1.3 §4.1（per-flow 模式、账本路径/轮转、project.json 原子写回）、
// §5.2（ans-managed `.gitignore` 块）、§5.3（basis 账本）、§7.1（事件 schema）；B1 验收
// AC-12/AC-15/AC-17/T-05/T-07。**B0 不实现** fixed 派发 / session 路由 / stage-request
// 受理 / closeTask / prepareIntent / finalizeIntent / 发布合并（B1/B3）。
//
// 纪律：
//  · 账本 append/read 复用 `src/common/shared/jsonl-ledger.ts`（5 MiB × 3 轮转，单一实现）；
//    路径常量只在本模块声明，消费方不得另拼一份。
//  · 事件形状/枚举单一来源 = `model/runtime.ts`（`isWorkflowEvent`/`isBasisEvent`/`isReleaseEvent`）。
//  · 幂等：同 `idempotencyKey` 重复 append 返回原事件（replay），不追加第二行。
//  · `workflowMode` **不缓存**项目级单值：每次按 `flowId` 解析（混合项目 legacy 在飞 + 新 fixed 并存）。
//  · 写 `.ans/state/**` 是应用独占职责；角色不可写（本模块调用方必须是应用/编排宿主）。

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import type { ProjectConfig } from "../../model/role.ts";
import type {
  BasisDocumentRef,
  BasisEvent,
  BasisTeamPlanRef,
  ReleaseConfirmedEvent,
  ReleaseEvent,
  ReleaseFailedEvent,
  ReleaseFileChange,
  ReleaseMergeKind,
  ReleaseMergedEvent,
  ReleaseRejectedEvent,
  ReleaseRequestedEvent,
  RequestResolvedEvent,
  TaskClosedOutcome,
  TaskStateEvent,
  WorkflowAction,
  WorkflowArtifactRef,
  WorkflowClosedOutcome,
  WorkflowDocumentRef,
  WorkflowEvent,
  WorkflowPath,
  WorkflowRepoSnapshot,
  WorkflowStage,
} from "../../model/runtime.ts";
import {
  BASIS_LEDGER_SCHEMA,
  RELEASE_LEDGER_SCHEMA,
  WORKFLOW_LEDGER_SCHEMA,
  isBasisEvent,
  isReleaseEvent,
  isWorkflowEvent,
  isWorkflowPath,
  isWorkflowStage,
} from "../../model/runtime.ts";
import type { BoundaryEntry } from "../../model/boundary.ts";
import type { GitOid } from "../../model/trunk.ts";
import { TRUNK_MANIFEST_SCHEMA, isGitOid } from "../../model/trunk.ts";
import { parseBoundarySection1 } from "../门禁引擎/boundary-parse.ts";
import { parseBoundaryYaml } from "../门禁引擎/boundary-yaml.ts";
import {
  DEFAULT_JSONL_MAX_BYTES,
  DEFAULT_JSONL_ROTATIONS,
  appendJsonlLine,
  readJsonlLedger,
  type JsonlReadError,
} from "../shared/jsonl-ledger.ts";
import { ANS_DIR_NAME, ansProjectPath, loadEffectiveConfig } from "../shared/config-loader.ts";
import { readIntentEntryFacts } from "../shared/intent-entry-contract.ts";
import { appendTaskEvent, newTaskId, readTaskState, taskEvent, type TaskRecord } from "./task-state.ts";
import {
  WORKFLOW_CORRUPT_CODE,
  WORKFLOW_REWORK_FALLBACKS,
  canCompleteStage,
  canDispatchStage,
  canRequestStage,
  deriveWorkflowView,
  type WorkflowView,
} from "./workflow-state.ts";
import {
  DEFAULT_REVIEW_ROLE_ID,
  loadLatestRoster,
  parseProjectRoster,
  parseTeamPlan,
  reviewRoleIdOfRoster,
  type ProjectRoster,
} from "./workflow-preconditions.ts";
import {
  basisIdFor,
  buildBasisRecordedEvent,
  discoverBasisDocuments,
  readBasisDocuments,
  recordBasisDocuments,
  verifyBasisDocuments,
} from "./basis-guard.ts";
import { stageRequestIdempotencyKey, stageStopIdempotencyKey } from "./workflow-dispatch.ts";

// —————————————— 账本路径 / schema / 轮转 ——————————————

/** 固定工作流账本（应用独占、append-only；v1.3 §4.1）。 */
export const WORKFLOWS_STATE_REL = ".ans/state/workflows.jsonl";
export const BASIS_STATE_REL = ".ans/state/basis.jsonl";
export const RELEASES_STATE_REL = ".ans/state/releases.jsonl";

/** 三份账本 schema 唯一来源 = Model（本表只做便捷聚合，不复制字面量）。 */
export const FIXED_PATH_LEDGER_SCHEMAS = Object.freeze({
  workflows: WORKFLOW_LEDGER_SCHEMA,
  basis: BASIS_LEDGER_SCHEMA,
  releases: RELEASE_LEDGER_SCHEMA,
} as const);

/** 5 MiB × 3 轮转（与 tasks 账本同默认；env 覆盖不在 B0 范围）。 */
export const FIXED_LEDGER_LIMITS = Object.freeze({
  maxBytes: DEFAULT_JSONL_MAX_BYTES,
  rotations: DEFAULT_JSONL_ROTATIONS,
});

export function workflowsStatePath(projectRoot: string): string {
  return path.join(projectRoot, ...WORKFLOWS_STATE_REL.split("/"));
}

export function basisStatePath(projectRoot: string): string {
  return path.join(projectRoot, ...BASIS_STATE_REL.split("/"));
}

export function releasesStatePath(projectRoot: string): string {
  return path.join(projectRoot, ...RELEASES_STATE_REL.split("/"));
}

// —————————————— 读取 / 幂等追加（jsonl-ledger 单一实现） ——————————————

export interface FixedLedgerReadResult<T> {
  /** 参与读取的段名（旧→新）。 */
  files: string[];
  events: T[];
  errors: JsonlReadError[];
  /** 坏 JSON + parser 拒绝的行数。 */
  badLines: number;
  /** parser 返回 ignore 的行数。 */
  ignoredLines: number;
}

export type FixedLedgerAppendResult<T> =
  | { ok: true; path: string; replay: boolean; event: T }
  | { ok: false; code?: string; message: string };

type LedgerGuard<T> = (value: unknown) => value is T;

async function readFixedLedger<T>(file: string, guard: LedgerGuard<T>): Promise<FixedLedgerReadResult<T>> {
  const read = await readJsonlLedger<T>(
    file,
    (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        return { ok: false, message: `JSON 坏行：${err instanceof Error ? err.message : String(err)}` };
      }
      return guard(parsed) ? { ok: true, value: parsed } : { ok: false, message: "事件形状非法（schema/字段/枚举）" };
    },
    FIXED_LEDGER_LIMITS,
  );
  return {
    files: [...read.files],
    events: [...read.values],
    errors: [...read.errors],
    badLines: read.badLines,
    ignoredLines: read.ignoredLines,
  };
}

/** 同文件幂等追加的进程内串行链（read-then-append 原子化；跨进程并发不在 B0 范围）。 */
const appendChains = new Map<string, Promise<unknown>>();

function appendFixedLedgerEvent<T extends { idempotencyKey: string }>(
  file: string,
  event: T,
  guard: LedgerGuard<T>,
  label: string,
): Promise<FixedLedgerAppendResult<T>> {
  if (!guard(event)) {
    return Promise.resolve({ ok: false, code: "invalid-event", message: `${label} 事件形状非法（拒绝写入）` });
  }
  const canonical = path.resolve(file);
  const previous = appendChains.get(canonical) ?? Promise.resolve();
  const next = previous.then(async (): Promise<FixedLedgerAppendResult<T>> => {
    const existing = await readFixedLedger(canonical, guard);
    const replay = existing.events.find((item) => item.idempotencyKey === event.idempotencyKey);
    if (replay !== undefined) {
      return { ok: true, path: canonical, replay: true, event: replay };
    }
    const appended = await appendJsonlLine(canonical, JSON.stringify(event), FIXED_LEDGER_LIMITS);
    if (!appended.ok) {
      return {
        ok: false,
        ...(appended.code !== undefined ? { code: appended.code } : {}),
        message: appended.message,
      };
    }
    return { ok: true, path: canonical, replay: false, event };
  });
  const settled = next.then(() => undefined, () => undefined);
  appendChains.set(canonical, settled);
  void settled.finally(() => {
    if (appendChains.get(canonical) === settled) appendChains.delete(canonical);
  });
  return next;
}

/** `ans-workflow/v1`（`.ans/state/workflows.jsonl`）读取；坏行计数不阻塞。 */
export function readWorkflowLedger(projectRoot: string): Promise<FixedLedgerReadResult<WorkflowEvent>> {
  return readFixedLedger(workflowsStatePath(projectRoot), isWorkflowEvent);
}

/** `ans-basis/v1`（`.ans/state/basis.jsonl`）读取。 */
export function readBasisLedger(projectRoot: string): Promise<FixedLedgerReadResult<BasisEvent>> {
  return readFixedLedger(basisStatePath(projectRoot), isBasisEvent);
}

/** `ans-release/v1`（`.ans/state/releases.jsonl`）读取。 */
export function readReleaseLedger(projectRoot: string): Promise<FixedLedgerReadResult<ReleaseEvent>> {
  return readFixedLedger(releasesStatePath(projectRoot), isReleaseEvent);
}

/** 追加 workflow 事件；同幂等键 replay 返回原事件、不重复追加。 */
export function appendWorkflowEvent(
  projectRoot: string,
  event: WorkflowEvent,
): Promise<FixedLedgerAppendResult<WorkflowEvent>> {
  return appendFixedLedgerEvent(workflowsStatePath(projectRoot), event, isWorkflowEvent, "ans-workflow/v1");
}

/** 追加 basis 事件（`basis.recorded`/`amended`/`verified`/`drift`）。 */
export function appendBasisEvent(
  projectRoot: string,
  event: BasisEvent,
): Promise<FixedLedgerAppendResult<BasisEvent>> {
  return appendFixedLedgerEvent(basisStatePath(projectRoot), event, isBasisEvent, "ans-basis/v1");
}

/** 追加 release 事件（`requested/confirmed/rejected/merged/failed`）。 */
export function appendReleaseEvent(
  projectRoot: string,
  event: ReleaseEvent,
): Promise<FixedLedgerAppendResult<ReleaseEvent>> {
  return appendFixedLedgerEvent(releasesStatePath(projectRoot), event, isReleaseEvent, "ans-release/v1");
}

// —————————————— per-flow 模式判定（v1.3 §4.1 MF-5） ——————————————

/** 工作流模式：`fixed` = 两条固定路径；`legacy` = 旧 trunk/run 机制（兼容）。 */
export type WorkflowMode = "fixed" | "legacy";

/** `.ans/project.json` 的 workflowSchema 值域（单一来源 = `model/role.ts::ProjectConfig`）。 */
export type WorkflowSchemaValue = NonNullable<ProjectConfig["workflowSchema"]>;

async function readJsonObject(file: string): Promise<Record<string, unknown> | undefined> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

/** 项目级 `workflowSchema`（只作默认/强制值）；配置损坏 ⇒ `invalid:true`（调用方 fail-closed）。 */
async function readProjectWorkflowSchema(
  projectRoot: string,
): Promise<{ schema?: WorkflowSchemaValue; invalid: boolean }> {
  const loaded = await loadEffectiveConfig({
    projectRoot,
    skillRoot: "",
    fallback: { projectRoot, skillRoot: "", roles: {} },
  });
  if (loaded.source.kind === "ans-invalid") return { invalid: true };
  return loaded.project.workflowSchema === undefined
    ? { invalid: false }
    : { schema: loaded.project.workflowSchema, invalid: false };
}

/** 该 flow 是否存在活动 legacy run（`.ans/runs/<runId>/manifest.json` state ∈ {draft,pinned} 且 flowId 匹配）。 */
async function activeLegacyRunExists(projectRoot: string, flowId: string): Promise<boolean> {
  const runsRoot = path.join(projectRoot, ANS_DIR_NAME, "runs");
  let names: string[];
  try {
    names = await fs.readdir(runsRoot);
  } catch {
    return false;
  }
  for (const name of names) {
    const manifest = await readJsonObject(path.join(runsRoot, name, "manifest.json"));
    if (manifest === undefined) continue;
    if (manifest["flowId"] !== flowId) continue;
    if (manifest["state"] === "draft" || manifest["state"] === "pinned") return true;
  }
  return false;
}

/** `.ans/trunk/manifest.json` 的有效 trunk 是否指向该 flow 且未关闭（未被封闭的 run 引用）。 */
async function validTrunkPointsToFlow(projectRoot: string, flowId: string): Promise<boolean> {
  const manifest = await readJsonObject(path.join(projectRoot, ANS_DIR_NAME, "trunk", "manifest.json"));
  if (manifest === undefined) return false;
  if (manifest["schema"] !== TRUNK_MANIFEST_SCHEMA) return false;
  if (manifest["flowId"] !== flowId) return false;
  const version = manifest["trunkVersion"];
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) return false;
  // “未关闭”：trunk 引用的 run 若已 closed/cancelled 则视为关闭（B0 解释；B1 复核）。
  const runId = manifest["runId"];
  if (typeof runId === "string" && runId !== "") {
    const run = await readJsonObject(path.join(projectRoot, ANS_DIR_NAME, "runs", runId, "manifest.json"));
    if (run !== undefined && (run["state"] === "closed" || run["state"] === "cancelled")) return false;
  }
  return true;
}

/**
 * 按 flow 解析工作流模式（v1.3 §4.1；**不缓存**）：
 * 1. `.ans/project.json workflowSchema === "legacy/v1"` ⇒ 该项目所有 flow 强制 legacy；
 * 2. 该 flow 存在活动 legacy run 或有效 trunk 指向该 flow ⇒ legacy（legacy 在飞可并存）；
 * 3. 其余（含 `"two-fixed-paths/v1"` 默认与缺省）⇒ fixed（新 flow 一律 fixed）。
 * 配置不可解析 ⇒ fail-closed 走 legacy（不猜 fixed；`.ans/project.json` 写回失败另由
 * `writeProjectConfigWorkflowSchema` 报 `project-config-write-failed`）。
 */
export async function workflowMode(projectRoot: string, flowId: string): Promise<WorkflowMode> {
  const flow = typeof flowId === "string" ? flowId.trim() : "";
  if (flow === "") return "legacy";
  const config = await readProjectWorkflowSchema(projectRoot);
  if (config.invalid) return "legacy";
  if (config.schema === "legacy/v1") return "legacy";
  if (await activeLegacyRunExists(projectRoot, flow)) return "legacy";
  if (await validTrunkPointsToFlow(projectRoot, flow)) return "legacy";
  return "fixed";
}

// —————————————— `.ans/project.json` 原子写回（G-11） ——————————————

export type ProjectConfigWriteResult =
  | { ok: true; changed: boolean; path: string; skipped?: "explicit-legacy" }
  | { ok: false; code: "project-config-write-failed"; message: string };

/**
 * 原子写 `.ans/project.json` 的 `workflowSchema`（首次 fixed workflow 启动时）：
 * - 保留既有键（governanceModel/roles/acceptance/未知键原样保留；键序自然保留，新键追加）；
 * - 已显式 `"legacy/v1"` ⇒ **不覆盖**（`changed:false, skipped:"explicit-legacy"`）；
 * - 文件存在但不可解析/非对象/既有值非法 ⇒ fail-closed `project-config-write-failed`（不覆盖）；
 * - 失败不弹客户卡（调用方回报运营/幕僚）。
 */
export async function writeProjectConfigWorkflowSchema(
  projectRoot: string,
  schema: WorkflowSchemaValue = "two-fixed-paths/v1",
  ansDirName: string = ANS_DIR_NAME,
): Promise<ProjectConfigWriteResult> {
  const fail = (message: string): ProjectConfigWriteResult =>
    ({ ok: false, code: "project-config-write-failed", message });
  const file = ansProjectPath(projectRoot, ansDirName);
  let raw: Record<string, unknown> = {};
  let text: string | undefined;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return fail(`读取 .ans/project.json 失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (text !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return fail(`现有 .ans/project.json 不可解析（不覆盖）：${err instanceof Error ? err.message : String(err)}`);
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("现有 .ans/project.json 顶层不是对象（不覆盖）");
    }
    raw = { ...(parsed as Record<string, unknown>) };
  }
  const existing = raw["workflowSchema"];
  if (existing !== undefined && existing !== "legacy/v1" && existing !== "two-fixed-paths/v1") {
    return fail(`现有 workflowSchema 非法（不覆盖）：${JSON.stringify(existing)}`);
  }
  if (schema === "two-fixed-paths/v1" && existing === "legacy/v1") {
    return { ok: true, changed: false, path: file, skipped: "explicit-legacy" };
  }
  if (existing === schema) return { ok: true, changed: false, path: file };
  raw["workflowSchema"] = schema;
  const next = `${JSON.stringify(raw, null, 2)}\n`;
  const tmp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid.toString(36)}.${Date.now().toString(36)}.tmp`,
  );
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(tmp, next, "utf8");
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    return fail(`写入 .ans/project.json 失败：${err instanceof Error ? err.message : String(err)}`);
  }
  return { ok: true, changed: true, path: file };
}

// —————————————— 首次 fixed workflow 启动顺序助手（编排 B2；B3 调用） ——————————————

export type PrepareFixedPathStartResult =
  | { ok: true; config: Extract<ProjectConfigWriteResult, { ok: true }>; workflowMode: WorkflowMode }
  | { ok: false; code: "project-config-write-failed"; message: string };

/**
 * **首次 fixed workflow 启动顺序助手（编排 B2 提供；B3 桌面调用）**。
 *
 * 桌面 B1 启用闸（`app/desktop/workflow.ts::isFixedPathEnabledForFlow`）只在项目显式
 * `workflowSchema:"two-fixed-paths/v1"` 或该 flow 已有 `workflow.started` 时启用 fixed——而
 * `workflow.started` 只能由 fixed 派发产生。为避免**鸡生蛋死锁**，B3 在首次 fixed 派发**之前**
 * 必须调用本助手完成顺序：
 *
 * 1. `writeProjectConfigWorkflowSchema` 原子写 `.ans/project.json workflowSchema`（保留既有键；
 *    显式 `"legacy/v1"` **不覆盖** ⇒ `config.skipped:"explicit-legacy"`；坏文件 ⇒
 *    `project-config-write-failed` fail-closed，不弹客户卡）；
 * 2. 以 `workflowMode(projectRoot, flowId)` 复核该 flow 的实际模式（legacy 在飞 flow 仍为 legacy）。
 *
 * 返回 `workflowMode === "fixed"` 且桌面启用闸已可放行后，B3 才能派发首个 fixed workflow；
 * 返回 `"legacy"`（显式 legacy 项目 / legacy 在飞 flow）⇒ B3 不得按 fixed 派发。
 * **不改变** B1 闸语义、不授予任何写权/派发权：本函数只排序既有应用写回与模式判定。
 */
export async function prepareFixedPathStart(input: {
  projectRoot: string;
  flowId: string;
}): Promise<PrepareFixedPathStartResult> {
  const config = await writeProjectConfigWorkflowSchema(input.projectRoot);
  if (!config.ok) return { ok: false, code: config.code, message: config.message };
  const mode = await workflowMode(input.projectRoot, input.flowId);
  return { ok: true, config, workflowMode: mode };
}

// —————————————— `.gitignore` ans-managed 块（v1.3 §5.2 MF-6；骨架） ——————————————

export const ANS_GITIGNORE_BLOCK_START = "# >>> ans managed >>>";
export const ANS_GITIGNORE_BLOCK_END = "# <<< ans managed <<<";

/**
 * ans-managed 忽略项（v1.3 §5.2）：治理文档/账本/角色卡不进入 Git（Git 只装代码）；
 * `.gitignore` 本身是代码文件。被跟踪且 dirty 的判定属 B1（`baseline-gitignore-dirty`）。
 */
export const ANS_GITIGNORE_ENTRIES: readonly string[] = Object.freeze([
  ".ans/",
  "角色卡/",
  "docs/product/",
  "docs/proposals/",
  "docs/contracts/",
  "docs/scheduling/",
  "docs/intents/",
  "docs/governance/",
  "docs/audit/",
  "docs/quality/",
  "docs/verification/",
  "docs/acceptance/",
  "docs/skills/",
  "docs/mcp/",
  "docs/bootstrap-manifest.md",
  "docs/workflow.md",
  "download/",
  "node_modules/",
]);

/** 规范 ans-managed 块（标记 + 条目；末尾无换行）。 */
export function ansGitignoreBlock(): string {
  return [ANS_GITIGNORE_BLOCK_START, ...ANS_GITIGNORE_ENTRIES, ANS_GITIGNORE_BLOCK_END].join("\n");
}

export type AnsGitignoreBlockStatus = "present" | "absent" | "malformed";

/** 判定现有 `.gitignore` 文本的 ans-managed 块状态（起止标记成对且顺序正确 = present）。 */
export function ansGitignoreBlockStatus(text: string): AnsGitignoreBlockStatus {
  const start = text.indexOf(ANS_GITIGNORE_BLOCK_START);
  const end = text.indexOf(ANS_GITIGNORE_BLOCK_END);
  if (start === -1 && end === -1) return "absent";
  if (start !== -1 && end > start) return "present";
  return "malformed";
}

/** 补齐 ans-managed 块：已存在原样返回；缺失时追加（保留用户既有内容与换行风格）。 */
export function withAnsGitignoreBlock(text: string): string {
  if (ansGitignoreBlockStatus(text) === "present") return text;
  const block = ansGitignoreBlock();
  if (text.trim() === "") return `${block}\n`;
  const separator = text.endsWith("\n") ? "\n" : "\n\n";
  return `${text}${separator}${block}\n`;
}

export type GitignoreWriteResult =
  | { ok: true; changed: boolean; path: string; sha256: string }
  | { ok: false; code: "baseline-gitignore-malformed" | "baseline-gitignore-write-failed"; message: string };

/**
 * 确保项目根 `.gitignore` 含 ans-managed 块（幂等、保留用户内容；原子写）。
 * 块起点存在但缺终点 ⇒ fail-closed（不覆盖用户内容，B1 交运营/人处理）。
 */
export async function ensureProjectGitignore(projectRoot: string): Promise<GitignoreWriteResult> {
  const file = path.join(projectRoot, ".gitignore");
  let text = "";
  try {
    text = await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return { ok: false, code: "baseline-gitignore-write-failed", message: `读取 .gitignore 失败：${err instanceof Error ? err.message : String(err)}` };
    }
  }
  const status = ansGitignoreBlockStatus(text);
  if (status === "malformed") {
    return { ok: false, code: "baseline-gitignore-malformed", message: "现有 .gitignore 的 ans-managed 块标记不完整（不覆盖用户内容）" };
  }
  const next = withAnsGitignoreBlock(text);
  const sha256 = createHash("sha256").update(Buffer.from(next, "utf8")).digest("hex");
  if (status === "present") return { ok: true, changed: false, path: file, sha256 };
  const tmp = path.join(path.dirname(file), `.gitignore.${process.pid.toString(36)}.${Date.now().toString(36)}.tmp`);
  try {
    await fs.writeFile(tmp, next, "utf8");
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    return { ok: false, code: "baseline-gitignore-write-failed", message: `写入 .gitignore 失败：${err instanceof Error ? err.message : String(err)}` };
  }
  return { ok: true, changed: true, path: file, sha256 };
}

// —————————————————————— T3 B1：fixed 工作流服务面（2026-11-10） ——————————————————————
//
// 依据：实现级方案 v1.3 §3.3（stage-request/stop）、§4.2（A3/A8/A9/A12/A13）、§4.5（完成判定）、
// §5.2/§5.3（基线/basis）、§6.4（发布前置）、§7.1/§7.2（账本/drift）；B1 验收 AC-05/AC-06/AC-07/
// AC-08/AC-09/AC-18/AC-19、T-02/T-03/T-04/T-08。
//
// 纪律：
//  · 本段只服务 **fixed** 路径；legacy 调用点（trunk/run/CAS/snapshot）不在此路径上（不 import、不调用）。
//  · 应用独占写 `.ans/state/**` 与 `docs/acceptance/**`（应用归档）；角色不可写这些路径。
//  · 幂等：workflow/basis 事件同 `idempotencyKey` replay；任务同幂等键返回原任务；不接受模型自报来源。
//  · fail-closed：证据缺失/不匹配 ⇒ 稳定失败码，不默认通过、不猜。

const WORKFLOW_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;
const INTENT_MAX_BYTES = 256 * 1024;

function isWorkflowSlug(value: unknown): value is string {
  return typeof value === "string" && WORKFLOW_SLUG_RE.test(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX_RE.test(value);
}

function sha256Of(text: string | Uint8Array): string {
  return createHash("sha256").update(text).digest("hex");
}

function reasonDigest(reason: string): string {
  return sha256Of(reason).slice(0, 24);
}

function isProjectRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  if (value.startsWith("/") || value.includes("\\") || /^[a-zA-Z]:/.test(value)) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** workflowId 确定性计算（v1.3 G-4/G-12；无时钟/随机）。 */
export function workflowIdFor(flowId: string, workflowPath: WorkflowPath, sourceTaskId: string, requestDigest: string): string {
  return `wf-${sha256Of(`${flowId}|${workflowPath}|${sourceTaskId}|${requestDigest}`).slice(0, 24)}`;
}

/** `workflow.started` 幂等键（v1.3 §7.1）。 */
export function workflowStartIdempotencyKey(flowId: string, workflowPath: WorkflowPath, sourceTaskId: string): string {
  return `workflow-start:${flowId}:${workflowPath}:${sourceTaskId}`;
}

/**
 * 首请求形态键（任务书写法 `stage-start:<flowId>:<path>:<stage>:<attempt>`）：
 * **仅审计/展示**——AC-06（冻结）要求首次请求也先算 workflowId 并统一使用
 * `stage-request:<workflowId>:<stage>:<attempt>`；两者冲突处按 AC-06 执行（B1 记录已披露）。
 */
export function stageStartIdempotencyKey(flowId: string, workflowPath: WorkflowPath, stage: WorkflowStage, attempt: number): string {
  return `stage-start:${flowId}:${workflowPath}:${stage}:${attempt}`;
}

// —————————————— 旧状态忽略清单（G-18 / v1.3 §9.3） ——————————————

/** 固定路径不读取的旧治理状态（只读忽略，不删除/不迁移）。 */
export const LEGACY_STATE_IGNORED_PATHS: readonly string[] = Object.freeze([
  ".ans/trunk/**",
  ".ans/runs/**",
  ".ans/state/versions.jsonl",
  ".ans/state/version-changes.json",
  ".ans/state/stable-writes.json",
  ".ans/state/doc-freezes.json",
  ".ans/state/refactor-requests.json",
]);

export interface LegacyStateIgnoredFacts {
  present: boolean;
  ignored: string[];
}

/** 探测项目内存在的旧状态（存在即列名；不删除、不读取为前置）。 */
export async function detectLegacyStateIgnored(projectRoot: string): Promise<LegacyStateIgnoredFacts> {
  const checks: Array<{ pattern: string; rel: string; dir?: boolean }> = [
    { pattern: ".ans/trunk/**", rel: ".ans/trunk", dir: true },
    { pattern: ".ans/runs/**", rel: ".ans/runs", dir: true },
    { pattern: ".ans/state/versions.jsonl", rel: ".ans/state/versions.jsonl" },
    { pattern: ".ans/state/version-changes.json", rel: ".ans/state/version-changes.json" },
    { pattern: ".ans/state/stable-writes.json", rel: ".ans/state/stable-writes.json" },
    { pattern: ".ans/state/doc-freezes.json", rel: ".ans/state/doc-freezes.json" },
    { pattern: ".ans/state/refactor-requests.json", rel: ".ans/state/refactor-requests.json" },
  ];
  const ignored: string[] = [];
  for (const check of checks) {
    const abs = path.join(projectRoot, ...check.rel.split("/"));
    try {
      await fs.stat(abs);
      if (check.dir === true) {
        const entries = await fs.readdir(abs);
        if (entries.length === 0) continue;
      }
      ignored.push(check.pattern);
    } catch {
      /* 不存在 ⇒ 不列 */
    }
  }
  return { present: ignored.length > 0, ignored };
}

// —————————————— 账本投影辅助 ——————————————

function workflowEventList(events: readonly WorkflowEvent[], workflowId: string): WorkflowEvent[] {
  return events.filter((event) => event.workflowId === workflowId);
}

function workflowIdsInOrder(events: readonly WorkflowEvent[]): string[] {
  const seen: string[] = [];
  for (const event of events) if (!seen.includes(event.workflowId)) seen.push(event.workflowId);
  return seen;
}

function activeWorkflowIdsOf(events: readonly WorkflowEvent[]): string[] {
  return workflowIdsInOrder(events).filter((workflowId) => {
    const list = workflowEventList(events, workflowId);
    return list.some((event) => event.kind === "workflow.started") && !list.some((event) => event.kind === "workflow.closed");
  });
}

export type WorkflowServiceFailure = { ok: false; code: string; message: string; missing?: string[] };

function serviceFailure(code: string, message: string, missing?: string[]): WorkflowServiceFailure {
  return { ok: false, code, message, ...(missing !== undefined ? { missing } : {}) };
}

function viewFailure(view: WorkflowView): WorkflowServiceFailure | undefined {
  if (view.blocked?.code === WORKFLOW_CORRUPT_CODE) {
    return serviceFailure(WORKFLOW_CORRUPT_CODE, `工作流账本损坏：${view.blocked.summary}（不猜、不自动推进）`);
  }
  return undefined;
}

function isStageRequestTask(created: TaskRecord["created"] | undefined): boolean {
  return created?.taskKind === "stage-request" && created.idempotencyKey.startsWith("stage-request:");
}

// —————————————— stage-request（AC-05/AC-06/AC-07） ——————————————

export interface StageRequestInput {
  projectRoot: string;
  flowId: string;
  stage: WorkflowStage;
  /** `advance`（缺省）/ `stop`。 */
  workflowAction?: WorkflowAction;
  /** 首次 advance 必填；后续从账本解析。 */
  workflowPath?: WorkflowPath;
  /** 首次可省略（应用确定性生成并回执）；后续必填（或从活动 workflow 解析）。 */
  workflowId?: string;
  /** 返工：被返工来源阶段（MF-IR-1：A12b→A11 时给出 "A12b"）。 */
  reworkOf?: WorkflowStage;
  /** `sha256(<stage-request 请求文本>)`（host 计算；决定 workflowId 与幂等键）。 */
  requestDigest: string;
  /** chief 当前真实客户轮次 id（host 捕获；缺失 ⇒ `stage-request-source-missing`）。 */
  sourceTaskId?: string;
  /** stage-request 任务文本（host 构造；非空、自足）。 */
  text: string;
  /** stop 原因 / workflow.started 原因 / rework 原因。 */
  reason?: string;
  /** 测试/重试用；缺省按账本推导 attempt。 */
  attempt?: number;
  now?: () => Date;
}

export interface StageRequestReceipt {
  workflowId: string;
  flowId: string;
  workflowPath: WorkflowPath;
  stage: WorkflowStage;
  workflowAction: WorkflowAction;
  attempt: number;
  idempotencyKey: string;
  taskId: string;
  /** true = 同一请求重放（返回原任务，不重复投递）。 */
  replay: boolean;
  workflowStarted: boolean;
}

export type StageRequestResult = ({ ok: true } & StageRequestReceipt) | WorkflowServiceFailure;

/**
 * stage-request 原语（幕僚→运营产线调度请求）。
 *
 * - `workflowId` 确定性：`wf- + sha256(flowId|path|sourceTaskId|requestDigest).slice(0,24)`（无时钟/随机）；
 * - 首请求也先算 workflowId，再统一用 `stage-request:<workflowId>:<stage>:<attempt>`（AC-06/G-4）；
 * - `sourceTaskId` 缺失 ⇒ `stage-request-source-missing`（不创建）；
 * - 每活动 workflow 至多一个 open advance 请求；下一 advance 前必须收口（`stage-request-open`）；
 * - stop：先收口 open advance → `workflow.stop-requested` + `stage-stop:<workflowId>:<stage>:<attempt>`；
 * - 重复请求返回原任务（replay），不重复投递。
 */
export async function requestStage(input: StageRequestInput): Promise<StageRequestResult> {
  const now = input.now ?? (() => new Date());
  const flowId = typeof input.flowId === "string" ? input.flowId.trim() : "";
  if (!isWorkflowSlug(flowId)) return serviceFailure("stage-request-invalid", `flowId 非法（须小写 slug）：${String(input.flowId)}`);
  if (!isWorkflowStage(input.stage)) return serviceFailure("stage-request-invalid", `stage 非法：${String(input.stage)}`);
  if (!isNonEmptyText(input.text)) return serviceFailure("stage-request-invalid", "stage-request 任务文本不得为空。");
  if (!isSha256Hex(input.requestDigest)) {
    return serviceFailure("stage-request-invalid", "requestDigest 非法：必须是请求文本的 64 hex SHA-256（应用计算）。");
  }
  if (!isNonEmptyText(input.sourceTaskId)) {
    return serviceFailure(
      "stage-request-source-missing",
      "stage-request 未创建：缺少 chief 当前真实客户轮次（sourceTaskId 由 host 捕获，不可模型自报）。",
      ["sourceTaskId"],
    );
  }
  const action: WorkflowAction = input.workflowAction ?? "advance";
  if (action !== "advance" && action !== "stop") {
    return serviceFailure("stage-request-invalid", `workflowAction 非法：${String(action)}`);
  }

  const ledger = await readWorkflowLedger(input.projectRoot);
  const taskState = await readTaskState(input.projectRoot);
  const events = ledger.events;
  const active = activeWorkflowIdsOf(events);

  const activeForFlowAll = active.filter((id) => workflowEventList(events, id).some((event) => event.flowId === flowId));
  const providedWorkflowId = isNonEmptyText(input.workflowId) ? input.workflowId : undefined;
  let workflowId: string | undefined = providedWorkflowId;
  if (workflowId !== undefined) {
    const list = workflowEventList(events, workflowId);
    if (list.length === 0) {
      // 显式 workflowId 不在账本：若该 flow 尚无活动 workflow，则按“首请求”处理（下方与确定性计算值比对，
      // 不符即 stage-request-invalid）；否则视为指向不存在的 workflow。
      if (action === "advance" && activeForFlowAll.length === 0) {
        workflowId = undefined;
      } else {
        return serviceFailure("workflow-not-found", `workflow ${workflowId} 不存在（账本无记录）。`);
      }
    } else if (!list.some((event) => event.kind === "workflow.started")) {
      return serviceFailure(WORKFLOW_CORRUPT_CODE, `workflow ${workflowId} 缺少 workflow.started（关键事件缺失，不猜）。`);
    }
  } else {
    const activeForFlow = activeForFlowAll;
    if (activeForFlow.length > 1) {
      return serviceFailure("workflow-active-conflict", `flow ${flowId} 存在多个活动 fixed workflow；不猜。`);
    }
    workflowId = activeForFlow[0];
  }

  const startingNew = workflowId === undefined;
  let resolvedPath: WorkflowPath;
  if (startingNew) {
    if (action === "stop") {
      return serviceFailure("workflow-not-found", `flow ${flowId} 没有活动 fixed workflow（stop 需活动 workflow）。`);
    }
    if (!isWorkflowPath(input.workflowPath)) {
      return serviceFailure("stage-request-invalid", "首次 advance 请求必须给出 workflowPath（A/B）。");
    }
    resolvedPath = input.workflowPath;
    const otherActive = active.filter((id) => !workflowEventList(events, id).some((event) => event.flowId === flowId));
    if (otherActive.length > 0) {
      return serviceFailure(
        "workflow-workspace-busy",
        `项目已有活动 fixed workflow（${otherActive[0]}）；每项目同时至多一个活动 fixed workflow。`,
      );
    }
    const firstStage: WorkflowStage = resolvedPath === "B" ? "B1" : "A1";
    if (input.stage !== firstStage) {
      return serviceFailure(
        "stage-transition-invalid",
        `新 workflow 的首个阶段必须是 ${firstStage}（收到 ${input.stage}）；不原地跳阶段。`,
      );
    }
    const computed = workflowIdFor(flowId, resolvedPath, input.sourceTaskId, input.requestDigest);
    if (input.workflowId !== undefined && input.workflowId !== computed) {
      return serviceFailure(
        "stage-request-invalid",
        `首请求 workflowId 必须是确定性计算值 ${computed}（收到 ${input.workflowId}；不采信模型自报）。`,
      );
    }
    workflowId = computed;
  } else {
    const first = workflowEventList(events, workflowId!).find((event) => event.kind === "workflow.started");
    if (first === undefined) return serviceFailure(WORKFLOW_CORRUPT_CODE, `workflow ${workflowId} 缺少 workflow.started。`);
    if (first.flowId !== flowId) {
      return serviceFailure("workflow-active-conflict", `workflow ${workflowId} 属于 flow ${first.flowId}，与请求 flow ${flowId} 不一致。`);
    }
    resolvedPath = first.path;
  }
  if (workflowId === undefined) {
    return serviceFailure(WORKFLOW_CORRUPT_CODE, "workflowId 解析失败（不猜）");
  }
  const resolvedWorkflowId: string = workflowId;
  const wfEvents = workflowEventList(events, resolvedWorkflowId);
  const view: WorkflowView | undefined = startingNew
    ? undefined
    : deriveWorkflowView(wfEvents, taskState.events);
  if (view !== undefined) {
    const corrupted = viewFailure(view);
    if (corrupted !== undefined) return corrupted;
    if (view.closed !== undefined) {
      return serviceFailure("workflow-closed", `workflow ${resolvedWorkflowId} 已关闭（${view.closed.outcome}），不再接受请求。`);
    }
  }

  // 幂等重放：同一 (workflow, stage, digest) 的最近一次请求仍在当前阶段时返回原任务。
  if (action === "advance") {
    const requestedIndexes = wfEvents
      .map((event, index) => ({ event, index }))
      .filter((item) => item.event.kind === "stage.requested" && item.event.stage === input.stage);
    const latest = requestedIndexes[requestedIndexes.length - 1];
    if (latest !== undefined && latest.event.kind === "stage.requested"
      && latest.event.requestDigest === input.requestDigest
      && !wfEvents.slice(latest.index + 1).some((event) => event.kind === "stage.reworked"
        || event.kind === "workflow.stop-requested" || event.kind === "workflow.closed")) {
      return {
        ok: true,
        workflowId: resolvedWorkflowId,
        flowId,
        workflowPath: resolvedPath,
        stage: input.stage,
        workflowAction: "advance",
        attempt: latest.event.attempt,
        idempotencyKey: latest.event.idempotencyKey,
        taskId: latest.event.requestTaskId,
        replay: true,
        workflowStarted: false,
      };
    }
  } else {
    const stopEvent = [...wfEvents].reverse().find((event) => event.kind === "workflow.stop-requested");
    if (stopEvent !== undefined && stopEvent.kind === "workflow.stop-requested") {
      return {
        ok: true,
        workflowId: resolvedWorkflowId,
        flowId,
        workflowPath: resolvedPath,
        stage: stopEvent.stage,
        workflowAction: "stop",
        attempt: 1,
        idempotencyKey: stageStopIdempotencyKey(resolvedWorkflowId, stopEvent.stage, 1),
        taskId: stopEvent.requestTaskId,
        replay: true,
        workflowStarted: false,
      };
    }
  }

  // open advance 请求不变量（AC-07）。
  const openAdvance = [...taskState.records.values()].find((record) =>
    record.created?.workflowId === resolvedWorkflowId
    && isStageRequestTask(record.created)
    && record.closed === undefined);
  if (openAdvance !== undefined) {
    return serviceFailure(
      "stage-request-open",
      `${action === "stop" ? "stop 之前必须" : "下一 advance 之前必须"}收口当前 open advance 请求（${openAdvance.taskId}）；否则 stage-request-open。`,
    );
  }

  let attempt: number;
  let idempotencyKey: string;
  if (action === "advance") {
    if (view !== undefined && !canRequestStage(view, input.stage)) {
      return serviceFailure(
        "stage-transition-invalid",
        `stage 转移非法：当前 ${view.stage}(${view.stages[view.stage].status}) 不允许推进 ${input.stage}（A10 未完成发 A11 等均拒绝）。`,
      );
    }
    // AC-09/G-1（实施前写标准）：A11 stage-request 派发实现前，A12a criteria 必须已创建（不得 pending）。
    if (view !== undefined && input.stage === "A11" && view.stages.A12a.status === "pending") {
      return serviceFailure(
        "stage-transition-invalid",
        "A11 派发前必须先创建 A12a criteria 任务（AC-09：实施前写标准）。",
      );
    }
    const priorAttempts = wfEvents
      .filter((event) => event.kind === "stage.requested" && event.stage === input.stage)
      .map((event) => (event.kind === "stage.requested" ? event.attempt : 0));
    attempt = input.attempt ?? (priorAttempts.length === 0 ? 1 : Math.max(...priorAttempts) + 1);
    if (!Number.isSafeInteger(attempt) || attempt < 1) {
      return serviceFailure("stage-request-invalid", `attempt 非法：${String(attempt)}`);
    }
    idempotencyKey = stageRequestIdempotencyKey(resolvedWorkflowId, input.stage, attempt);
  } else {
    const priorStops = wfEvents.filter((event) => event.kind === "workflow.stop-requested").length;
    // stop 的 stage 必须是当前阶段（application 核验；不猜）。
    if (view !== undefined && (view.stage !== input.stage || view.stopping === true)) {
      return serviceFailure(
        "stage-transition-invalid",
        `stop 请求阶段非法：当前 ${view.stage}(${view.stages[view.stage].status})，请求 ${input.stage}${view.stopping === true ? "（stop 已在办）" : ""}。`,
      );
    }
    attempt = input.attempt ?? priorStops + 1;
    idempotencyKey = stageStopIdempotencyKey(resolvedWorkflowId, input.stage, attempt);
  }

  const at = now().toISOString();
  const taskId = newTaskId(now());
  const hasFirstStageRequestTask = [...taskState.records.values()].some((record) =>
    record.created?.workflowId === resolvedWorkflowId && record.created.taskKind === "stage-request");

  // 1) workflow 账本事件（先记请求，再创建任务；任务失败如实上抛）。
  if (startingNew) {
    const legacy = await detectLegacyStateIgnored(input.projectRoot);
    const startedEvent: WorkflowEvent = {
      v: 1,
      at,
      schema: WORKFLOW_LEDGER_SCHEMA,
      kind: "workflow.started",
      workflowId: resolvedWorkflowId,
      flowId,
      path: resolvedPath,
      idempotencyKey: workflowStartIdempotencyKey(flowId, resolvedPath, input.sourceTaskId),
      trigger: { by: "chief", reason: input.reason ?? "chief stage request" },
      sourceTaskId: input.sourceTaskId,
      ...(legacy.present ? { legacyStateIgnored: true } : {}),
    };
    const appended = await appendWorkflowEvent(input.projectRoot, startedEvent);
    if (!appended.ok) {
      return serviceFailure("workflow-ledger-write-failed", `workflow.started 写入失败：${appended.message}`);
    }
  }
  if (action === "advance") {
    const requestEvent: WorkflowEvent = {
      v: 1,
      at,
      schema: WORKFLOW_LEDGER_SCHEMA,
      kind: "stage.requested",
      workflowId: resolvedWorkflowId,
      flowId,
      path: resolvedPath,
      idempotencyKey,
      stage: input.stage,
      ...(view !== undefined ? { fromStage: view.stage } : {}),
      requestTaskId: taskId,
      requestDigest: input.requestDigest,
      attempt,
    };
    const appended = await appendWorkflowEvent(input.projectRoot, requestEvent);
    if (!appended.ok) {
      return serviceFailure("workflow-ledger-write-failed", `stage.requested 写入失败：${appended.message}`);
    }
  } else {
    const stopEvent: WorkflowEvent = {
      v: 1,
      at,
      schema: WORKFLOW_LEDGER_SCHEMA,
      kind: "workflow.stop-requested",
      workflowId: resolvedWorkflowId,
      flowId,
      path: resolvedPath,
      idempotencyKey,
      stage: input.stage,
      requestTaskId: taskId,
      reason: input.reason ?? "chief stop request",
      requestedBy: "chief",
    };
    const appended = await appendWorkflowEvent(input.projectRoot, stopEvent);
    if (!appended.ok) {
      return serviceFailure("workflow-ledger-write-failed", `workflow.stop-requested 写入失败：${appended.message}`);
    }
  }

  // 2) 创建 stage-request 任务（from chief → convener；sideEffect=read-only；无 module/写集）。
  const created = taskEvent("task.created", {
    taskId,
    from: "chief",
    to: "convener",
    text: input.text,
    sideEffect: "read-only",
    idempotencyKey,
    flowId,
    workflowId: resolvedWorkflowId,
    stage: input.stage,
    taskKind: "stage-request",
    ...(hasFirstStageRequestTask ? {} : { workflowPath: resolvedPath }),
  }, now);
  const taskAppended = await appendTaskEvent(input.projectRoot, created);
  if (!taskAppended.ok) {
    return serviceFailure(taskAppended.code ?? "stage-request-invalid", `stage-request 任务创建失败：${taskAppended.message}`);
  }

  // 3) A11 派发标记：stage-request 创建 ⇒ stage.dispatched A11（§4.5）。
  if (action === "advance" && input.stage === "A11") {
    const after = await readWorkflowLedger(input.projectRoot);
    const afterView = deriveWorkflowView(workflowEventList(after.events, resolvedWorkflowId), [
      ...taskState.events,
      created,
    ]);
    if (canDispatchStage(afterView, "A11")) {
      const dispatchEvent: WorkflowEvent = {
        v: 1,
        at,
        schema: WORKFLOW_LEDGER_SCHEMA,
        kind: "stage.dispatched",
        workflowId: resolvedWorkflowId,
        flowId,
        path: resolvedPath,
        idempotencyKey: `stage-dispatch:${resolvedWorkflowId}:A11:${taskId}`,
        stage: "A11",
        taskId,
        targetRoleId: "convener",
      };
      const appended = await appendWorkflowEvent(input.projectRoot, dispatchEvent);
      if (!appended.ok) {
        return serviceFailure("workflow-ledger-write-failed", `stage.dispatched A11 写入失败：${appended.message}`);
      }
    }
  }

  return {
    ok: true,
    workflowId: resolvedWorkflowId,
    flowId,
    workflowPath: resolvedPath,
    stage: input.stage,
    workflowAction: action,
    attempt,
    idempotencyKey,
    taskId,
    replay: false,
    workflowStarted: startingNew,
  };
}

// —————————————— stage.dispatched 记账（A1/A4/A7/A12a/A12b 等） ——————————————

/**
 * 记录阶段派发（应用按真实 `task.created` 记 `stage.dispatched`；§4.5 G-11）：
 * 用于 A1/A4/A7（任务创建即完成）与 A12a/A12b 直派验收（不属运营 stage-request）。
 */
export async function recordStageDispatch(input: {
  projectRoot: string;
  workflowId: string;
  stage: WorkflowStage;
  taskId: string;
  targetRoleId: string;
  moduleId?: string;
  now?: () => Date;
}): Promise<{ ok: true; replay: boolean } | WorkflowServiceFailure> {
  const now = input.now ?? (() => new Date());
  if (!isNonEmptyText(input.workflowId) || !isNonEmptyText(input.taskId) || !isNonEmptyText(input.targetRoleId)) {
    return serviceFailure("stage-request-invalid", "recordStageDispatch 缺少 workflowId/taskId/targetRoleId。");
  }
  if (!isWorkflowStage(input.stage)) return serviceFailure("stage-request-invalid", `stage 非法：${String(input.stage)}`);
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(ledger.events, input.workflowId);
  if (!wfEvents.some((event) => event.kind === "workflow.started")) {
    return serviceFailure("workflow-not-found", `workflow ${input.workflowId} 不存在。`);
  }
  const tasks = await readTaskState(input.projectRoot);
  const task = tasks.records.get(input.taskId);
  if (task?.created === undefined) return serviceFailure("stage-request-required", `任务 ${input.taskId} 不存在。`);
  if (task.created.workflowId !== input.workflowId || task.created.stage !== input.stage || task.created.to !== input.targetRoleId) {
    return serviceFailure("stage-workflow-mismatch", `任务 ${input.taskId} 的 workflow/stage/受派人与派发事实不一致。`);
  }
  const view = deriveWorkflowView(wfEvents, tasks.events);
  const vf = viewFailure(view);
  if (vf !== undefined) return vf;
  if (!canDispatchStage(view, input.stage)) {
    return serviceFailure("stage-transition-invalid", `stage.dispatched 非法：当前 ${view.stage}(${view.stages[view.stage].status}) → ${input.stage}。`);
  }
  const event: WorkflowEvent = {
    v: 1,
    at: now().toISOString(),
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "stage.dispatched",
    workflowId: input.workflowId,
    flowId: view.flowId,
    path: view.path,
    idempotencyKey: `stage-dispatch:${input.workflowId}:${input.stage}:${input.taskId}`,
    stage: input.stage,
    taskId: input.taskId,
    targetRoleId: input.targetRoleId,
    ...(input.moduleId !== undefined ? { moduleId: input.moduleId } : {}),
  };
  const appended = await appendWorkflowEvent(input.projectRoot, event);
  if (!appended.ok) return serviceFailure("workflow-ledger-write-failed", `stage.dispatched 写入失败：${appended.message}`);
  return { ok: true, replay: appended.replay };
}

// —————————————— inspectAssignedTask（Q6 证据） ——————————————

export interface AssignedTaskFacts {
  taskId: string;
  from: "chief" | "convener";
  to: string;
  flowId?: string;
  workflowId?: string;
  stage?: WorkflowStage;
  taskKind?: string;
  sideEffect: string;
  open: boolean;
  stopped: boolean;
  idempotencyKey: string;
}

export type InspectAssignedTaskResult = { ok: true; task: AssignedTaskFacts } | WorkflowServiceFailure;

/** 读取真实受派任务事实（convener 生产派发绑定证据）：只认 tasks 账本，不采信模型自报。 */
export async function inspectAssignedTask(input: {
  projectRoot: string;
  taskId: string;
  actorRoleId?: string;
}): Promise<InspectAssignedTaskResult> {
  const state = await readTaskState(input.projectRoot);
  const record = state.records.get(input.taskId);
  if (record?.created === undefined) {
    return serviceFailure("stage-request-required", `任务 ${input.taskId} 不存在（无 task.created）。`);
  }
  const created = record.created;
  if (input.actorRoleId !== undefined && created.to !== input.actorRoleId) {
    return serviceFailure("dispatch-evidence-missing", `任务 ${input.taskId} 的受派人 ${created.to} 与调用角色 ${input.actorRoleId} 不一致。`);
  }
  let workflowStopped = false;
  if (created.workflowId !== undefined) {
    const ledger = await readWorkflowLedger(input.projectRoot);
    const list = workflowEventList(ledger.events, created.workflowId);
    workflowStopped = list.some((event) => event.kind === "workflow.stop-requested" || event.kind === "workflow.closed");
  }
  return {
    ok: true,
    task: {
      taskId: record.taskId,
      from: created.from,
      to: created.to,
      ...(created.flowId !== undefined ? { flowId: created.flowId } : {}),
      ...(created.workflowId !== undefined ? { workflowId: created.workflowId } : {}),
      ...(created.stage !== undefined ? { stage: created.stage } : {}),
      ...(created.taskKind !== undefined ? { taskKind: created.taskKind } : {}),
      sideEffect: created.sideEffect,
      open: record.closed === undefined,
      stopped: workflowStopped || record.closed?.outcome === "rejected",
      idempotencyKey: created.idempotencyKey,
    },
  };
}

// —————————————— fixed closeTask（AC-18 / MF-IR-2） ——————————————

export interface FixedStageEvidence {
  /** 应用计算并核验的阶段产物（path/sha256）。 */
  artifacts?: WorkflowArtifactRef[];
  /** A11/B3 完成所需的分支 tip OID 证据（应用从任务分支读取）。 */
  branchTipOid?: string;
  /** A12b → A12 归档证据（`archiveAcceptance` 回执）。 */
  acceptanceArchive?: { path: string; sha256: string };
}

export interface CloseTaskInput {
  projectRoot: string;
  operationId: string;
  taskId: string;
  outcome: TaskClosedOutcome;
  note?: string;
  /** host 解析的调用角色（必须等于 task.created.from）。 */
  actorRoleId: string;
  /** 应用提供的完成证据（绝不由模型自报；缺省 ⇒ 只写 task.closed，不推进阶段）。 */
  evidence?: FixedStageEvidence;
  now?: () => Date;
}

export interface CloseTaskReceipt {
  taskId: string;
  outcome: TaskClosedOutcome;
  workflowId?: string;
  stage?: WorkflowStage;
  eventId: string;
  operationId: string;
  replay: boolean;
  stageCompleted: boolean;
}

export type CloseTaskResult = ({ ok: true } & CloseTaskReceipt) | WorkflowServiceFailure;

/**
 * fixed `close_created_task` v2 **模型可见入参**（v1.3 §3.5/§4.2；MF-IR-2；编排 B2 接线）。
 * 可信身份（`projectRoot`/`actorRoleId`）由 `run-role` 以会话解析结果绑定，**绝不来自模型参数**；
 * `evidence`（artifacts/branchTipOid/acceptanceArchive）只能由应用补入，不在模型可见入参中。
 */
export interface FixedCloseCreatedTaskToolInput {
  operationId: string;
  taskId: string;
  outcome: TaskClosedOutcome;
  note?: string;
}

/**
 * `openRoleSession({ closeCreatedTaskFixed })` 可注入的**应用实现**（可选；仅 fixed 会话消费）：
 * run-role 传入已绑定的可信身份；应用实现可补 `evidence` 后调用 `closeTask`（或自行完成同等校验）。
 * 未注入 ⇒ run-role 默认直连 `closeTask`（无 evidence；适合非完成型收口）。
 */
export type FixedCloseCreatedTaskDep = (
  input: FixedCloseCreatedTaskToolInput & { projectRoot: string; actorRoleId: string },
  signal?: AbortSignal,
) => Promise<CloseTaskResult>;

/**
 * run-role 注入给**运行时核心 B2 `close_created_task` fixed handler** 的工具依赖
 * （身份/项目根已绑定；handler 只需传模型参数）。legacy 会话不注入本依赖。
 */
export type FixedCloseCreatedTaskFn = (
  input: FixedCloseCreatedTaskToolInput,
  signal?: AbortSignal,
) => Promise<CloseTaskResult>;

const CLOSE_COMPLETABLE_STAGES: ReadonlySet<WorkflowStage> = new Set<WorkflowStage>(["A2", "A5", "A11", "B1", "B3"]);
const CLOSE_REVIEW_STAGES: ReadonlySet<WorkflowStage> = new Set<WorkflowStage>(["A12a", "A12b"]);
/** v1.3 §4.2 A11/B3：完成要求“全部选中实现任务 accepted”（其余阶段以单个 accepted 收口为准）。 */
const CLOSE_ALL_TASKS_STAGES: ReadonlySet<WorkflowStage> = new Set<WorkflowStage>(["A11", "B3"]);

/** 阶段在**收口**时完成的机械条件（服务层只校验账本事实；artifact/hash 由应用提供）。 */
function closeStageCompletionCheck(
  stage: WorkflowStage,
  evidence: FixedStageEvidence | undefined,
): WorkflowServiceFailure | undefined {
  if (CLOSE_COMPLETABLE_STAGES.has(stage) || CLOSE_REVIEW_STAGES.has(stage)) {
    if (evidence?.artifacts === undefined || evidence.artifacts.length === 0) {
      return serviceFailure("close-report-missing", `阶段 ${stage} 完成需要应用提供的产物证据（artifacts[]）。`);
    }
    if ((stage === "A11" || stage === "B3") && !isNonEmptyText(evidence.branchTipOid)) {
      return serviceFailure("close-report-missing", `阶段 ${stage} 完成需要分支 tip OID 证据（branchTipOid）。`);
    }
  }
  return undefined;
}

/**
 * fixed `close_created_task` v2 服务实现（MF-IR-2 / AC-18）：
 * - 输入 `{operationId, taskId, outcome, note?}`；不要求 runId/basisDigest/reportRef；
 * - 校验真实创建者（`actorRoleId === task.created.from`）、任务 open、幂等（operationId）；
 * - `accepted` 要求已有 `task.reported(status=done)`；
 * - 写 `task.closed`，并按模式写阶段事件（`stage.completed`/`stage.reworked`/`stage.blocked`）；
 * - **不写** `.ans/runs`/`.ans/trunk`、不做 CAS/snapshot；legacy 实现逐字保留（本函数只服务 fixed）。
 */
export async function closeTask(input: CloseTaskInput): Promise<CloseTaskResult> {
  const now = input.now ?? (() => new Date());
  if (!isNonEmptyText(input.operationId) || input.operationId.length > 500) {
    return serviceFailure("close-task-invalid", "operationId 缺失或超过 500 字符。");
  }
  if (!isNonEmptyText(input.taskId)) return serviceFailure("close-task-invalid", "taskId 缺失。");
  if (input.outcome !== "accepted" && input.outcome !== "rework" && input.outcome !== "rejected") {
    return serviceFailure("close-task-invalid", `outcome 非法：${String(input.outcome)}`);
  }
  const state = await readTaskState(input.projectRoot);
  const record = state.records.get(input.taskId);
  if (record?.created === undefined) return serviceFailure("close-task-invalid", `任务 ${input.taskId} 不存在。`);
  const created = record.created;
  if (created.workflowId === undefined) {
    return serviceFailure("close-task-invalid", "该任务不是 fixed 工作流任务（无 workflowId）；legacy 收口走旧实现。");
  }
  if (created.from !== input.actorRoleId) {
    return serviceFailure(
      "close-identity-invalid",
      `只有真实创建者可以收口任务：创建者 ${created.from}，调用角色 ${input.actorRoleId}。`,
    );
  }
  if (record.closed !== undefined) {
    if (record.closed.operationId === input.operationId) {
      return {
        ok: true,
        taskId: input.taskId,
        outcome: record.closed.outcome,
        ...(created.workflowId !== undefined ? { workflowId: created.workflowId } : {}),
        ...(created.stage !== undefined ? { stage: created.stage } : {}),
        eventId: record.closed.eventId ?? "",
        operationId: input.operationId,
        replay: true,
        stageCompleted: false,
      };
    }
    return serviceFailure("close-task-invalid", `任务 ${input.taskId} 已被收口（${record.closed.outcome}），不得重复收口。`);
  }
  const lastReport = record.reports[record.reports.length - 1];
  if (input.outcome === "accepted" && lastReport?.status !== "done") {
    return serviceFailure("close-report-missing", "accepted 收口要求已有 task.reported(status=done)；报告只是报告，不是收口。");
  }

  const workflowId = created.workflowId;
  const stage = created.stage;
  const at = now().toISOString();
  const eventId = `event-${sha256Of(`${input.operationId}|${input.taskId}`).slice(0, 24)}`;
  const targetDigest = sha256Of(`${workflowId}|${input.taskId}|${input.outcome}|${input.operationId}`);
  const closedEvent: TaskStateEvent = {
    v: 1,
    at,
    kind: "task.closed",
    taskId: input.taskId,
    by: created.from,
    outcome: input.outcome,
    ...(input.note !== undefined ? { note: input.note } : {}),
    operationId: input.operationId,
    eventId,
    actionSource: {
      kind: "role-direct",
      actorRoleId: created.from,
      action: "close-created-task",
      operationId: input.operationId,
      applicationId: "ans-fixed-workflow",
      baseDigest: null,
      targetDigest,
      at,
    },
  };
  const appended = await appendTaskEvent(input.projectRoot, closedEvent);
  if (!appended.ok) {
    return serviceFailure(appended.code ?? "close-task-invalid", `task.closed 写入失败：${appended.message}`);
  }

  let stageCompleted = false;
  if (stage !== undefined && isWorkflowStage(stage) && created.taskKind !== "stage-request") {
    const ledger = await readWorkflowLedger(input.projectRoot);
    const wfEvents = workflowEventList(ledger.events, workflowId);
    const tasksAfter: TaskStateEvent[] = [...state.events, closedEvent];
    const view = deriveWorkflowView(wfEvents, tasksAfter);
    const vf = viewFailure(view);
    if (vf !== undefined) return vf;
    if (input.outcome === "accepted") {
      const evidenceIssue = closeStageCompletionCheck(stage, input.evidence);
      if (evidenceIssue !== undefined) return evidenceIssue;
      const siblings = [...state.records.values()].filter((sibling) =>
        sibling.created?.workflowId === workflowId
        && sibling.created.stage === stage
        && sibling.created.taskKind !== "stage-request");
      // B13.1（2026-11-11，RR8 失败修复）：阶段完成不得被**已返工/已拒绝的旧 attempt** 永久阻塞
      // （RR8 A2：原任务按 rework 关闭后，补交/返工任务的 accepted 收口永远无法满足“所有兄弟任务
      // accepted”，A2 永久停在 requested）。规则：
      //  ① 阶段内不得还有未收口任务——open 兄弟仍阻塞完成（完成时不得仍有任务可改产物）；
      //  ② A11/B3（v1.3 §4.2：全部选中实现任务 accepted）要求其余已收口任务均 accepted，
      //     rework 视为被新 attempt 取代、不再阻塞；rejected 仍阻塞（缺一次 accepted 重派）；
      //  ③ 其余阶段（A2/A5/A12a/A12b/B1）以本 accepted 任务 + 应用证据完成（v1.3 §4.5：
      //     创建者 task.closed accepted + 文档/hash 可算 ⇒ stage.completed）。
      const noOpenSiblings = siblings.every((sibling) =>
        sibling.taskId === input.taskId || sibling.closed !== undefined);
      const allRequiredAccepted = !CLOSE_ALL_TASKS_STAGES.has(stage) || siblings.every((sibling) =>
        sibling.taskId === input.taskId
          ? true
          : sibling.closed?.outcome === "accepted" || sibling.closed?.outcome === "rework");
      if (noOpenSiblings && allRequiredAccepted && canCompleteStage(view, stage)) {
        const artifacts = input.evidence?.artifacts ?? [];
        const completion: WorkflowEvent = {
          v: 1,
          at,
          schema: WORKFLOW_LEDGER_SCHEMA,
          kind: "stage.completed",
          workflowId,
          flowId: created.flowId ?? view.flowId,
          path: view.path,
          idempotencyKey: `stage-complete:${workflowId}:${stage}:${input.taskId}`,
          stage,
          cause: { kind: "task-closed", ref: input.taskId },
          artifacts,
        };
        const done = await appendWorkflowEvent(input.projectRoot, completion);
        if (!done.ok) return serviceFailure("workflow-ledger-write-failed", `stage.completed 写入失败：${done.message}`);
        stageCompleted = true;
        // A12b accepted + 归档 ⇒ 追加 A12 聚合完成（G-16）。
        if (stage === "A12b" && input.evidence?.acceptanceArchive !== undefined) {
          const aggregateView = deriveWorkflowView([...wfEvents, completion], tasksAfter);
          if (canCompleteStage(aggregateView, "A12")) {
            const reportSha = artifacts.find((artifact) => artifact.kind === "report")?.sha256
              ?? input.evidence.acceptanceArchive.sha256;
            const aggregate: WorkflowEvent = {
              v: 1,
              at,
              schema: WORKFLOW_LEDGER_SCHEMA,
              kind: "stage.completed",
              workflowId,
              flowId: created.flowId ?? view.flowId,
              path: view.path,
              idempotencyKey: `stage-complete:${workflowId}:A12:acceptance:${reportSha.slice(0, 16)}`,
              stage: "A12",
              cause: { kind: "acceptance-archive", ref: `acceptance:${workflowId}:${reportSha}` },
              artifacts: [...artifacts, { path: input.evidence.acceptanceArchive.path, sha256: input.evidence.acceptanceArchive.sha256, kind: "acceptance-archive" }],
            };
            const aggregateDone = await appendWorkflowEvent(input.projectRoot, aggregate);
            if (!aggregateDone.ok) return serviceFailure("workflow-ledger-write-failed", `stage.completed A12 写入失败：${aggregateDone.message}`);
          }
        }
      }
    } else if (input.outcome === "rework" && stage === "A12b") {
      // MF-IR-1：`stage` = 回落目标 A11；`reworkOf` = 被返工来源 A12b。
      const fallback = WORKFLOW_REWORK_FALLBACKS.A12b;
      if (fallback !== undefined && canCompleteStage(view, "A12b")) {
        const attempt = (view.stages[fallback].attempt ?? 0) + 1;
        const reworked: WorkflowEvent = {
          v: 1,
          at,
          schema: WORKFLOW_LEDGER_SCHEMA,
          kind: "stage.reworked",
          workflowId,
          flowId: created.flowId ?? view.flowId,
          path: view.path,
          idempotencyKey: `stage-rework:${workflowId}:${fallback}:${attempt}`,
          stage: fallback,
          reworkOf: "A12b",
          reason: input.note ?? "acceptance rework",
          attempt,
        };
        const done = await appendWorkflowEvent(input.projectRoot, reworked);
        if (!done.ok) return serviceFailure("workflow-ledger-write-failed", `stage.reworked 写入失败：${done.message}`);
      }
    }
    const blockedByOutcome = input.outcome !== "accepted" && !(input.outcome === "rework" && stage === "A12b");
    const blockedByReport = input.outcome === "accepted" && (lastReport?.status === "failed" || lastReport?.status === "blocked");
    // B13.1（RR8）：只有**仍在办**的阶段才能被阻塞——阶段已完成/已推进后，迟到的旧兄弟任务收口
    // 不得再追加 `stage.blocked`（否则投影看到 blocked 的阶段 ≠ 当前阶段，会判 `workflow-corrupt`）。
    const stageCanBlock = view.stage === stage
      && (view.stages[stage].status === "requested" || view.stages[stage].status === "dispatched"
        || view.stages[stage].status === "in-progress" || view.stages[stage].status === "blocked");
    if ((blockedByOutcome || blockedByReport) && stageCanBlock) {
      const code = input.outcome === "rework"
        ? "task-report-blocked"
        : lastReport?.status === "failed" ? "task-report-failed" : "task-closed-rejected";
      const blocked: WorkflowEvent = {
        v: 1,
        at,
        schema: WORKFLOW_LEDGER_SCHEMA,
        kind: "stage.blocked",
        workflowId,
        flowId: created.flowId ?? view.flowId,
        path: view.path,
        idempotencyKey: `stage-block:${workflowId}:${stage}:${Math.max(1, view.stages[stage].attempt ?? 1)}:${code}`,
        stage,
        code,
        summary: input.note ?? lastReport?.summary ?? `任务 ${input.taskId} 收口 ${input.outcome}`,
        taskId: input.taskId,
        attempt: Math.max(1, view.stages[stage].attempt ?? 1),
      };
      const done = await appendWorkflowEvent(input.projectRoot, blocked);
      if (!done.ok) return serviceFailure("workflow-ledger-write-failed", `stage.blocked 写入失败：${done.message}`);
    }
  }

  return {
    ok: true,
    taskId: input.taskId,
    outcome: input.outcome,
    ...(workflowId !== undefined ? { workflowId } : {}),
    ...(stage !== undefined ? { stage } : {}),
    eventId,
    operationId: input.operationId,
    replay: false,
    stageCompleted,
  };
}

// —————————————— A3 fixed 意图确认（AC-18 / MF-4） ——————————————

export interface FixedDocumentRef extends WorkflowDocumentRef {
  /** 文档版本（v1.3 §4.2 A3 documentRefs 含 version；MF-IR-5 在 Model 追加前先由服务携带）。 */
  readonly version?: number;
}

export interface PreparedFixedIntent {
  ok: true;
  flowId: string;
  intentId?: string;
  path: string;
  version: number;
  sha256: string;
  bytes: number;
  documentRefs: FixedDocumentRef[];
  marker: string;
  text: string;
}

export type PrepareIntentResult = PreparedFixedIntent | WorkflowServiceFailure;

function frontmatterRecord(text: string): Record<string, unknown> | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text.replace(/^﻿/, "").replace(/\r\n?/g, "\n"));
  if (match === null) return undefined;
  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]!);
  } catch {
    return undefined;
  }
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
}

/** 最新意图文件发现：`docs/product/<flowId>-intent-vN.md`（N 最大）。 */
async function latestIntentFile(projectRoot: string, flowId: string): Promise<{ name: string; version: number } | undefined> {
  let names: string[];
  try {
    names = await fs.readdir(path.join(projectRoot, "docs", "product"));
  } catch {
    return undefined;
  }
  const escaped = flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-intent-v(\\d+)\\.md$`);
  let best: { name: string; version: number } | undefined;
  for (const name of names) {
    const match = pattern.exec(name);
    if (match === null) continue;
    const version = Number(match[1]);
    if (!Number.isSafeInteger(version) || version < 1) continue;
    if (best === undefined || version > best.version) best = { name, version };
  }
  return best;
}

/**
 * A3 fixed `prepareIntent`（不触 trunk/doc-freeze/CAS）：读最新意图、校验 frontmatter 与文件名、
 * 计算字节 SHA-256/bytes，生成应用 `documentRefs`（含 version）与卡 context marker。
 * 若 flow 有活动 fixed workflow 且 A3 尚未 requested，则补记 `stage.requested A3`（卡在办）。
 */
export async function prepareIntent(input: { projectRoot: string; flowId: string; workflowId?: string; now?: () => Date }): Promise<PrepareIntentResult> {
  const flowId = typeof input.flowId === "string" ? input.flowId.trim() : "";
  if (!isWorkflowSlug(flowId)) return serviceFailure("intent-decision-invalid", `flowId 非法：${String(input.flowId)}`);
  const latest = await latestIntentFile(input.projectRoot, flowId);
  if (latest === undefined) {
    return serviceFailure("baseline-document-missing", `未找到 docs/product/${flowId}-intent-vN.md（最新意图缺失）。`);
  }
  const rel = `docs/product/${latest.name}`;
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(path.join(input.projectRoot, ...rel.split("/")));
  } catch (error) {
    return serviceFailure("baseline-document-unreadable", `意图不可读：${rel}（${error instanceof Error ? error.message : String(error)}）`);
  }
  if (bytes.byteLength > INTENT_MAX_BYTES) {
    return serviceFailure("baseline-document-budget", `意图超出读取预算：${rel} ${bytes.byteLength} > ${INTENT_MAX_BYTES}。`);
  }
  const text = bytes.toString("utf8");
  const front = frontmatterRecord(text);
  if (front === undefined || front["schema"] !== "project-intent/v1") {
    return serviceFailure("intent-decision-invalid", `意图 frontmatter 非法：schema 必须为 project-intent/v1（${rel}）。`);
  }
  if (front["flowId"] !== flowId) {
    return serviceFailure("intent-decision-invalid", `意图 flowId 与请求不一致：${String(front["flowId"])} != ${flowId}。`);
  }
  if (front["version"] !== latest.version) {
    return serviceFailure("intent-decision-invalid", `意图 version=${String(front["version"])} 与文件名 v${latest.version} 不一致。`);
  }
  const sha256 = sha256Of(bytes);
  const intentId = typeof front["intentId"] === "string" && front["intentId"].trim() !== "" ? front["intentId"].trim() : undefined;
  const documentRefs: FixedDocumentRef[] = [
    { kind: "intent", path: rel, sha256, ...(intentId !== undefined ? { intentId } : {}), version: latest.version },
  ];
  // 活动 workflow 的 A3 卡在办：记录 stage.requested A3（幂等；不创建任务——A3 由 chief 呈卡）。
  // B13.1（2026-11-11，RR8 失败修复）：A3 卡呈现以**账本状态**为前置——RR8 中幕僚在
  // `A2(requested)` 时呈卡、客户 confirm 后 `stage.completed A3` 被 `stage-transition-invalid`
  // 拒绝（卡已结算但阶段无法完成）。prepareIntent 不得在不能推进 A3 时静默返回证据：
  // 无活动 workflow / workflow 已关闭或 blocked / 当前阶段不是 A2 completed（或 A3 在办）
  // ⇒ fail-closed 拒绝，调用方不得发卡。A3 在办（卡已 request、待结算/恢复）时仍返回证据，
  // 供 B12.1 幂等判定与 pending-recovery 复核，但不重复写 stage.requested。
  const ledger = await readWorkflowLedger(input.projectRoot);
  const workflowId = input.workflowId
    ?? activeWorkflowIdsOf(ledger.events).find((id) => workflowEventList(ledger.events, id).some((event) => event.flowId === flowId));
  if (workflowId === undefined) {
    return serviceFailure("workflow-not-found", `flow ${flowId} 没有活动 fixed workflow；A3 意图确认卡无法绑定 workflow（不发卡）。`);
  }
  const wfEvents = workflowEventList(ledger.events, workflowId);
  const view = deriveWorkflowView(wfEvents, (await readTaskState(input.projectRoot)).events);
  const vf = viewFailure(view);
  if (vf !== undefined) return vf;
  if (view.closed !== undefined) {
    return serviceFailure("workflow-closed", `workflow ${workflowId} 已关闭（${view.closed.outcome}）；不发 A3 意图卡。`);
  }
  const a3InFlight = view.stage === "A3"
    && (view.stages.A3.status === "requested" || view.stages.A3.status === "dispatched" || view.stages.A3.status === "in-progress");
  if (!a3InFlight) {
    // 只认**当前阶段仍在办且被阻塞**（view.blocked 是历史字段：stage.requested/completed 不会清除它，
    // 返工恢复后仍可能残留旧 code；按 current status 判定，避免误拦已恢复的 A2）。
    if (view.stages[view.stage].status === "blocked") {
      return serviceFailure(
        "stage-transition-invalid",
        `A3 意图卡不可呈：workflow 当前 blocked（${view.blocked?.code ?? "blocked"}）；要求 A2 completed。`,
      );
    }
    if ((view.stage !== "A2" && view.stage !== "A3") || !canRequestStage(view, "A3")) {
      return serviceFailure(
        "stage-transition-invalid",
        `A3 意图卡不可呈：当前 ${view.stage}(${view.stages[view.stage].status})；要求 A2 completed。`,
      );
    }
    const now = input.now ?? (() => new Date());
    const requestEvent: WorkflowEvent = {
      v: 1,
      at: now().toISOString(),
      schema: WORKFLOW_LEDGER_SCHEMA,
      kind: "stage.requested",
      workflowId,
      flowId,
      path: view.path,
      idempotencyKey: stageRequestIdempotencyKey(workflowId, "A3", 1),
      stage: "A3",
      fromStage: "A2",
      requestTaskId: `intent-card:${flowId}:${sha256.slice(0, 12)}`,
      requestDigest: sha256,
      attempt: 1,
    };
    const appended = await appendWorkflowEvent(input.projectRoot, requestEvent);
    if (!appended.ok) return serviceFailure("workflow-ledger-write-failed", `stage.requested A3 写入失败：${appended.message}`);
  }
  return {
    ok: true,
    flowId,
    ...(intentId !== undefined ? { intentId } : {}),
    path: rel,
    version: latest.version,
    sha256,
    bytes: bytes.byteLength,
    documentRefs,
    marker: `[ans-intent-evidence path=${rel} sha256=${sha256} version=${latest.version}]`,
    text,
  };
}

export interface FinalizeIntentInput {
  projectRoot: string;
  /** `request.resolved` 裁决事件（应用一次写入；finalize 只校验，不重写）。 */
  event: RequestResolvedEvent;
  /** 可选显式 workflowId（缺省取事件字段/活动 workflow）。 */
  workflowId?: string;
  flowId?: string;
  now?: () => Date;
}

export type FinalizeIntentResult =
  | { ok: true; workflowId: string; stage: "A3"; requestId: string; eventId: string; replay: boolean }
  | WorkflowServiceFailure;

/**
 * A3 fixed `finalizeIntent`：校验 `request.resolved`（cardKind=intent-confirm、selected confirm、
 * documentRefs 与当前意图字节 hash 一致）→ 校验 `docs/intents/<intentId>.md` 存在且一致 →
 * 追加 `workflow.stage.completed A3`。**不重写/补写 `request.resolved`，不写 doc-freeze/trunk/CAS。**
 */
export async function finalizeIntent(input: FinalizeIntentInput): Promise<FinalizeIntentResult> {
  const now = input.now ?? (() => new Date());
  const event = input.event;
  if (event.kind !== "request.resolved") return serviceFailure("intent-decision-invalid", "finalizeIntent 只接受 request.resolved 事件。");
  if (event.cardKind !== "intent-confirm") return serviceFailure("intent-decision-invalid", `cardKind 必须为 intent-confirm（收到 ${String(event.cardKind)}）。`);
  if (event.choice !== "confirm") return serviceFailure("intent-decision-invalid", `意图确认只接受 confirm（收到 ${String(event.choice)}）。`);
  const refs = event.documentRefs ?? [];
  const intentRef = refs.find((ref) => ref.kind === "intent");
  if (intentRef === undefined) {
    return serviceFailure("intent-decision-invalid", "request.resolved 缺少 documentRefs[intent]（应用裁决时一次写入）。");
  }
  if (!isProjectRelativePath(intentRef.path) || !isSha256Hex(intentRef.sha256)) {
    return serviceFailure("intent-decision-invalid", "documentRefs[intent] 的 path/sha256 形状非法。");
  }
  let flowId = typeof input.flowId === "string" ? input.flowId.trim() : "";
  if (flowId === "") {
    const match = /^docs\/product\/([a-z0-9][a-z0-9-]{0,62}[a-z0-9])-intent-v\d+\.md$/.exec(intentRef.path);
    if (match !== null) flowId = match[1]!;
  }
  if (!isWorkflowSlug(flowId)) return serviceFailure("intent-decision-invalid", "无法从 documentRefs 解析 flowId；请显式给出。");
  let current: Buffer;
  try {
    current = await fs.readFile(path.join(input.projectRoot, ...intentRef.path.split("/")));
  } catch {
    return serviceFailure("baseline-document-missing", `意图不可读：${intentRef.path}。`);
  }
  if (sha256Of(current) !== intentRef.sha256) {
    return serviceFailure("intent-hash-drift", `意图字节已漂移：${intentRef.path}（裁决 hash ${intentRef.sha256}）。`);
  }
  const facts = await readIntentEntryFacts({ projectRoot: input.projectRoot, flowId, productIntentPath: intentRef.path });
  const intentId = facts.productIntentId ?? (typeof (intentRef as { intentId?: unknown }).intentId === "string"
    ? String((intentRef as { intentId?: unknown }).intentId) : undefined);
  if (intentId === undefined || facts.intentEntryExists !== true || facts.intentEntryIntentId !== intentId) {
    return serviceFailure(
      "intent-entry-missing",
      `意图入口缺失或 intentId 不一致：docs/intents/${intentId ?? "<intentId>"}.md（chief 写后重试；幂等）。`,
      ["docs/intents/<intentId>.md"],
    );
  }
  const ledger = await readWorkflowLedger(input.projectRoot);
  const workflowId = input.workflowId ?? event.workflowId
    ?? activeWorkflowIdsOf(ledger.events).find((id) => workflowEventList(ledger.events, id).some((wf) => wf.flowId === flowId));
  if (workflowId === undefined) return serviceFailure("workflow-not-found", `flow ${flowId} 没有活动 fixed workflow。`);
  if (event.workflowId !== undefined && event.workflowId !== workflowId) {
    return serviceFailure("stage-workflow-mismatch", `request.resolved.workflowId=${event.workflowId} 与目标 ${workflowId} 不一致。`);
  }
  const view = deriveWorkflowView(workflowEventList(ledger.events, workflowId), (await readTaskState(input.projectRoot)).events);
  const vf = viewFailure(view);
  if (vf !== undefined) return vf;
  if (view.closed !== undefined) return serviceFailure("workflow-closed", `workflow ${workflowId} 已关闭。`);
  // 幂等 replay：同一 requestId 的 A3 完成事件已存在 ⇒ 返回原回执（不重复追加）。
  const completionKey = `stage-complete:${workflowId}:A3:${event.requestId}`;
  const existing = workflowEventList(ledger.events, workflowId)
    .find((wf) => wf.kind === "stage.completed" && wf.idempotencyKey === completionKey);
  if (existing !== undefined) {
    return { ok: true, workflowId, stage: "A3", requestId: event.requestId, eventId: existing.idempotencyKey, replay: true };
  }
  if (view.stage !== "A3" || !canCompleteStage(view, "A3")) {
    return serviceFailure(
      "stage-transition-invalid",
      `A3 意图确认完成非法：当前 ${view.stage}(${view.stages[view.stage].status})；要求 A3 在办。`,
    );
  }
  const at = now().toISOString();
  const artifacts: WorkflowArtifactRef[] = [
    { path: intentRef.path, sha256: intentRef.sha256, kind: "intent" },
    ...(facts.intentEntryPath !== undefined ? [{ path: facts.intentEntryPath, kind: "intent-entry" }] : []),
  ];
  const completion: WorkflowEvent = {
    v: 1,
    at,
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "stage.completed",
    workflowId,
    flowId,
    path: view.path,
    idempotencyKey: `stage-complete:${workflowId}:A3:${event.requestId}`,
    stage: "A3",
    cause: { kind: "intent-confirmed", ref: event.requestId },
    artifacts,
  };
  const appended = await appendWorkflowEvent(input.projectRoot, completion);
  if (!appended.ok) return serviceFailure("workflow-ledger-write-failed", `stage.completed A3 写入失败：${appended.message}`);
  return {
    ok: true,
    workflowId,
    stage: "A3",
    requestId: event.requestId,
    eventId: appended.event.idempotencyKey,
    replay: appended.replay,
  };
}

// —————————————— A8 fixed activation（AC-24 / MF-IR-3 服务侧） ——————————————

export interface ActivateRoleDocumentsFixedInput {
  projectRoot: string;
  operationId: string;
  flowId: string;
  workflowId: string;
  /** A6 方案卡 resolved 的 decisionId（应用核验；不接受模型自报）。 */
  proposalDecisionId: string;
  targetRoleId: string;
  roster: { path: string; sha256: string };
  documents: {
    card: { path: string; sha256: string };
    boundaryMd: { path: string; sha256: string };
    boundaryYaml: { path: string; sha256: string };
  };
  now?: () => Date;
}

export type ActivateRoleDocumentsFixedResult =
  | {
    ok: true;
    workflowId: string;
    roleId: string;
    rosterSha256: string;
    activationKey: string;
    replay: boolean;
    stageCompleted: boolean;
  }
  | WorkflowServiceFailure;

/**
 * fixed `activate_role_documents` v2 **模型可见入参**（v1.3 §4.2 A8；MF-IR-3；编排 B2 接线）：
 * roster/提案决定/三文档 hash 均由应用在服务层重算核验（`activation-hash-drift` 等 fail-closed）。
 * 可信 `projectRoot` 由 run-role 绑定，**绝不来自模型参数**。
 */
export type FixedActivateRoleDocumentsToolInput = Omit<ActivateRoleDocumentsFixedInput, "projectRoot" | "now">;

/**
 * `openRoleSession({ activateRoleDocumentsFixed })` 可注入的**应用实现**（可选；仅 fixed 会话消费）：
 * 默认由 run-role 直连 `activateRoleDocumentsFixed`；应用实现可先做额外取证再调用同一服务。
 */
export type FixedActivateRoleDocumentsDep = (
  input: FixedActivateRoleDocumentsToolInput & { projectRoot: string },
  signal?: AbortSignal,
) => Promise<ActivateRoleDocumentsFixedResult>;

/**
 * run-role 注入给**运行时核心 B2 `activate_role_documents` fixed handler** 的工具依赖
 * （项目根已绑定；handler 只需传模型参数）。legacy 会话不注入本依赖。
 */
export type FixedActivateRoleDocumentsFn = (
  input: FixedActivateRoleDocumentsToolInput,
  signal?: AbortSignal,
) => Promise<ActivateRoleDocumentsFixedResult>;

async function readAndHash(projectRoot: string, rel: string): Promise<{ ok: true; sha256: string } | { ok: false }> {
  try {
    const bytes = await fs.readFile(path.join(projectRoot, ...rel.split("/")));
    return { ok: true, sha256: sha256Of(bytes) };
  } catch {
    return { ok: false };
  }
}

/**
 * A8 fixed activation 服务骨架（与 B2 `activate_role_documents` v2 schema/tools 对接）：
 * 校验提案决定/名单/属主/三文档实际字节 SHA-256（`activation-hash-drift`），写 `role.activated`；
 * 全部名单角色激活后追加 `stage.completed A8`。**不写 trunk、不发 appointment-write 卡。**
 */
export async function activateRoleDocumentsFixed(input: ActivateRoleDocumentsFixedInput): Promise<ActivateRoleDocumentsFixedResult> {
  const now = input.now ?? (() => new Date());
  if (!isNonEmptyText(input.operationId)) return serviceFailure("activation-document-invalid", "operationId 缺失。");
  if (!isWorkflowSlug(input.flowId)) return serviceFailure("activation-document-invalid", `flowId 非法：${String(input.flowId)}`);
  if (!isNonEmptyText(input.workflowId)) return serviceFailure("activation-document-invalid", "workflowId 缺失。");
  if (!isNonEmptyText(input.targetRoleId)) return serviceFailure("activation-document-invalid", "targetRoleId 缺失。");
  const refs = [input.roster, input.documents.card, input.documents.boundaryMd, input.documents.boundaryYaml];
  if (refs.some((ref) => !isProjectRelativePath(ref.path) || !isSha256Hex(ref.sha256))) {
    return serviceFailure("activation-document-invalid", "roster/documents 的 path/sha256 形状非法。");
  }
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(ledger.events, input.workflowId);
  if (!wfEvents.some((event) => event.kind === "workflow.started")) {
    return serviceFailure("workflow-not-found", `workflow ${input.workflowId} 不存在。`);
  }
  // 幂等 replay：同 (workflow, role, rosterSha) 的 role.activated 已存在 ⇒ 返回原回执。
  const activationKey = `role-activation:${input.workflowId}:${input.targetRoleId}:${input.roster.sha256}`;
  const existingActivation = wfEvents.find((event) => event.kind === "role.activated" && event.idempotencyKey === activationKey);
  if (existingActivation !== undefined) {
    return {
      ok: true,
      workflowId: input.workflowId,
      roleId: input.targetRoleId,
      rosterSha256: input.roster.sha256,
      activationKey,
      replay: true,
      stageCompleted: false,
    };
  }
  const view = deriveWorkflowView(wfEvents, (await readTaskState(input.projectRoot)).events);
  const vf = viewFailure(view);
  if (vf !== undefined) return vf;
  if (view.closed !== undefined) return serviceFailure("workflow-closed", `workflow ${input.workflowId} 已关闭。`);
  if (view.stage !== "A8" || !(view.stages.A8.status === "requested" || view.stages.A8.status === "dispatched"
    || view.stages.A8.status === "in-progress")) {
    return serviceFailure(
      "stage-transition-invalid",
      `A8 激活非法：当前 ${view.stage}(${view.stages[view.stage].status})；要求 A8 在办。`,
    );
  }
  let rosterText: string;
  try {
    rosterText = await fs.readFile(path.join(input.projectRoot, ...input.roster.path.split("/")), "utf8");
  } catch {
    return serviceFailure("activation-roster-mismatch", `名单不可读：${input.roster.path}。`);
  }
  if (sha256Of(Buffer.from(rosterText, "utf8")) !== input.roster.sha256) {
    return serviceFailure("activation-roster-mismatch", `名单字节 hash 与入参不一致：${input.roster.path}。`);
  }
  const parsedRoster = parseProjectRoster(rosterText, input.flowId);
  if (!parsedRoster.ok) return serviceFailure("activation-roster-mismatch", `名单非法：${parsedRoster.reason}`);
  if (!parsedRoster.roster.roles.some((role) => role.id === input.targetRoleId)) {
    return serviceFailure("activation-role-not-selected", `目标角色 ${input.targetRoleId} 不在名单内。`);
  }
  const tasks = await readTaskState(input.projectRoot);
  const decision = tasks.events.find((event): event is RequestResolvedEvent =>
    event.kind === "request.resolved" && event.decisionId === input.proposalDecisionId);
  if (decision === undefined || decision.cardKind !== "proposal") {
    return serviceFailure("activation-document-invalid", `提案决定 ${input.proposalDecisionId} 不存在或不是 proposal 卡。`);
  }
  const accepted = decision.choice === "accept" || (decision.selectedOptionIds ?? []).includes("accept");
  if (!accepted) return serviceFailure("activation-document-invalid", `提案决定 ${input.proposalDecisionId} 不是 accept。`);
  const rosterDecisionRef = (decision.documentRefs ?? []).find((ref) => ref.kind === "roster" || ref.path === input.roster.path);
  if (rosterDecisionRef !== undefined && rosterDecisionRef.sha256 !== input.roster.sha256) {
    return serviceFailure("activation-roster-mismatch", "提案决定绑定的 roster hash 与入参不一致（roster drift）。");
  }
  const documents: { path: string; sha256: string }[] = [];
  for (const [kind, ref] of Object.entries(input.documents)) {
    const actual = await readAndHash(input.projectRoot, ref.path);
    if (!actual.ok) return serviceFailure("activation-document-invalid", `${kind} 文档不可读：${ref.path}。`);
    if (actual.sha256 !== ref.sha256) {
      return serviceFailure("activation-hash-drift", `${kind} 文档字节 hash 与入参不一致：${ref.path}（activation-hash-drift）。`);
    }
    documents.push({ path: ref.path, sha256: ref.sha256 });
  }
  const activated: WorkflowEvent = {
    v: 1,
    at: now().toISOString(),
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "role.activated",
    workflowId: input.workflowId,
    flowId: input.flowId,
    path: view.path,
    idempotencyKey: activationKey,
    roleId: input.targetRoleId,
    decisionRef: input.proposalDecisionId,
    roster: { path: input.roster.path, sha256: input.roster.sha256 },
    documents,
  };
  const appended = await appendWorkflowEvent(input.projectRoot, activated);
  if (!appended.ok) return serviceFailure("activation-ledger-write-failed", `role.activated 写入失败：${appended.message}`);

  const after = await readWorkflowLedger(input.projectRoot);
  const activatedNow = new Set(
    workflowEventList(after.events, input.workflowId)
      .filter((event): event is Extract<WorkflowEvent, { kind: "role.activated" }> => event.kind === "role.activated")
      .map((event) => event.roleId),
  );
  const rosterRoleIds = parsedRoster.roster.roles.map((role) => role.id);
  let stageCompleted = false;
  const currentView = deriveWorkflowView(workflowEventList(after.events, input.workflowId), tasks.events);
  if (rosterRoleIds.every((roleId) => activatedNow.has(roleId)) && currentView.stage === "A8" && canCompleteStage(currentView, "A8")) {
    const artifacts = workflowEventList(after.events, input.workflowId)
      .filter((event) => event.kind === "role.activated")
      .flatMap((event) => event.kind === "role.activated" ? event.documents.map((doc) => ({ ...doc, kind: "activation-document" })) : []);
    const completion: WorkflowEvent = {
      v: 1,
      at: now().toISOString(),
      schema: WORKFLOW_LEDGER_SCHEMA,
      kind: "stage.completed",
      workflowId: input.workflowId,
      flowId: input.flowId,
      path: currentView.path,
      idempotencyKey: `stage-complete:${input.workflowId}:A8:${input.roster.sha256}`,
      stage: "A8",
      cause: { kind: "activation-complete", ref: input.roster.sha256 },
      artifacts,
    };
    const done = await appendWorkflowEvent(input.projectRoot, completion);
    if (!done.ok) return serviceFailure("activation-ledger-write-failed", `stage.completed A8 写入失败：${done.message}`);
    stageCompleted = true;
  }
  return {
    ok: true,
    workflowId: input.workflowId,
    roleId: input.targetRoleId,
    rosterSha256: input.roster.sha256,
    activationKey,
    replay: appended.replay,
    stageCompleted,
  };
}

/** A10 前置：名单角色必须全部有 `role.activated` 账本记录（G-8；不按磁盘枚举放行）。 */
export async function inspectRoleActivations(input: {
  projectRoot: string;
  workflowId: string;
  roleIds: readonly string[];
}): Promise<{ ok: true; activated: string[] } | WorkflowServiceFailure> {
  const ledger = await readWorkflowLedger(input.projectRoot);
  const activated = workflowEventList(ledger.events, input.workflowId)
    .filter((event): event is Extract<WorkflowEvent, { kind: "role.activated" }> => event.kind === "role.activated")
    .map((event) => event.roleId);
  const missing = input.roleIds.filter((roleId) => !activated.includes(roleId));
  if (missing.length > 0) {
    return serviceFailure(
      "role-activation-unrecorded",
      `角色文件在盘但账本缺少 role.activated：${missing.join("、")}（不按磁盘枚举放行）。`,
      missing,
    );
  }
  return { ok: true, activated: [...new Set(activated)] };
}

// —————————————— A9 基线（basis.recorded） ——————————————

export interface BasisDocumentView {
  kind: string;
  path: string;
  version: number;
  sha256: string;
  bytes: number;
}

export interface RecordBasisInput {
  projectRoot: string;
  flowId: string;
  workflowId: string;
  operationId: string;
  /** 团队计划路径 `docs/scheduling/<flowId>-team-vN.md`（baseline 必填；path-b 忽略）。 */
  planPath?: string;
  planVersion?: number;
  /** 声明即断言（v1.3 §5.1 `plan.sha256`；不一致 ⇒ `baseline-plan-hash-drift`）。 */
  planSha256?: string;
  repo?: WorkflowRepoSnapshot;
  reason?: "baseline" | "path-b";
  /**
   * B3：基线/路径 B 的最小 Git 准备端口（git init/.gitignore+baseline commit/任务分支/dirty）。
   * 注入后在文档校验通过、`basis.recorded` 写入之前执行（v1.3 §5.2/§4.3 MF-12）；
   * 缺省 = 只读记录（B1 兼容；调用方须自行提供 `repo` 快照）。
   */
  port?: BaselineGitPort;
  now?: () => Date;
}

export interface RecordBasisReceipt {
  basisId: string;
  reviewRoleId: string;
  documents: BasisDocumentView[];
  /** baseline 团队计划事实（path-b 为 undefined）；应用回执用。 */
  teamPlan?: { path: string; version: number; sha256: string };
  /** B3：注入端口时的 Git 准备回执（state/branch/headOid/gitignoreSha256/…）。 */
  git?: BaselineGitReceipt;
  replay: boolean;
  stageCompleted: boolean;
}

export type RecordBasisResult = ({ ok: true } & RecordBasisReceipt) | WorkflowServiceFailure;

async function latestModulesRef(projectRoot: string, flowId: string): Promise<{ path: string; version: number; sha256: string } | undefined> {  let names: string[];
  try {
    names = await fs.readdir(path.join(projectRoot, "docs", "proposals"));
  } catch {
    return undefined;
  }
  const escaped = flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-modules-v(\\d+)\\.md$`);
  let best: { name: string; version: number } | undefined;
  for (const name of names) {
    const match = pattern.exec(name);
    if (match === null) continue;
    const version = Number(match[1]);
    if (!Number.isSafeInteger(version) || version < 1) continue;
    if (best === undefined || version > best.version) best = { name, version };
  }
  if (best === undefined) return undefined;
  const rel = `docs/proposals/${best.name}`;
  const hashed = await readAndHash(projectRoot, rel);
  if (!hashed.ok) return undefined;
  return { path: rel, version: best.version, sha256: hashed.sha256 };
}

/**
 * MF-IR-6 码表映射：B0 `basis-guard` 内部使用 `basis-document-*`；A9 基线对外（服务回执/阶段阻断）
 * 必须使用 AC-16 冻结的 `baseline-document-*`——单一映射点在此，不并存第二套对外码。
 */
function baselineDocumentCode(code: string): string {
  switch (code) {
    case "basis-document-missing":
      return "baseline-document-missing";
    case "basis-document-unreadable":
      return "baseline-document-unreadable";
    case "basis-document-budget":
      return "baseline-document-budget";
    default:
      return code;
  }
}

/**
 * path-b 只读快照（Q4）：只快照**当前存在**的文档；缺失不失败、不产生写权、drift fail-closed。
 */
async function snapshotExistingBasisDocuments(
  projectRoot: string,
  flowId: string,
): Promise<{ ok: true; documents: BasisDocumentRef[]; teamPlan?: BasisTeamPlanRef } | WorkflowServiceFailure> {
  const discovery = await discoverBasisDocuments(projectRoot, flowId);
  const refs = [
    ...discovery.documents.map((doc) => ({ kind: doc.kind, path: doc.path, version: doc.version })),
    ...(discovery.teamPlan !== undefined
      ? [{ kind: discovery.teamPlan.kind, path: discovery.teamPlan.path, version: discovery.teamPlan.version }]
      : []),
  ];
  if (refs.length === 0) return { ok: true, documents: [] };
  const read = await readBasisDocuments(projectRoot, refs);
  if (!read.ok) return serviceFailure(baselineDocumentCode(read.code), read.message);
  const teamPlanRef = discovery.teamPlan === undefined
    ? undefined
    : read.documents.find((doc) => doc.path === discovery.teamPlan?.path);
  return {
    ok: true,
    documents: read.documents.filter((doc) => doc.path !== discovery.teamPlan?.path),
    ...(teamPlanRef !== undefined
      ? { teamPlan: { path: teamPlanRef.path, version: teamPlanRef.version, sha256: teamPlanRef.sha256 } }
      : {}),
  };
}

/**
 * A9 基线 3 件小事中的「文档哈希入账 + 团队计划结构校验」（git init/.gitignore 由宿主 GitPort 执行，
 * 本服务只读校验并记录 `repo` 快照）。path-b 为只读快照（Q4：只读、不产生写权、drift fail-closed）。
 */
export async function recordBasis(input: RecordBasisInput): Promise<RecordBasisResult> {
  const now = input.now ?? (() => new Date());
  const reason = input.reason ?? "baseline";
  const flowId = typeof input.flowId === "string" ? input.flowId.trim() : "";
  if (!isWorkflowSlug(flowId)) return serviceFailure("baseline-identity-invalid", `flowId 非法：${String(input.flowId)}`);
  if (!isNonEmptyText(input.workflowId)) return serviceFailure("baseline-identity-invalid", "workflowId 缺失。");
  if (!isNonEmptyText(input.operationId)) return serviceFailure("baseline-identity-invalid", "operationId 缺失。");
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(ledger.events, input.workflowId);
  if (!wfEvents.some((event) => event.kind === "workflow.started")) {
    return serviceFailure("workflow-not-found", `workflow ${input.workflowId} 不存在。`);
  }
  const tasks = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, tasks.events);
  const vf = viewFailure(view);
  if (vf !== undefined) return vf;
  if (view.closed !== undefined) return serviceFailure("workflow-closed", `workflow ${input.workflowId} 已关闭。`);
  if (reason === "baseline") {
    // 幂等 replay：同 workflow 已有 basis.recorded ⇒ 不走 A9 在办门（同幂等键 append 会 replay）。
    const priorBasis = (await readBasisLedger(input.projectRoot)).events.some((event) =>
      event.kind === "basis.recorded" && event.workflowId === input.workflowId);
    if (!priorBasis) {
      const a9 = view.stages.A9.status;
      // B3/AC-16：失败事件 stage.blocked A9 后允许同阶段重试（blocked 不计为终态；不猜完成）。
      if (view.stage !== "A9" || (a9 !== "requested" && a9 !== "dispatched" && a9 !== "in-progress" && a9 !== "blocked")) {
        return serviceFailure("stage-transition-invalid", `A9 基线非法：当前 ${view.stage}(${view.stages[view.stage].status})；要求 A9 在办。`);
      }
    }
  }
  const roster = await loadLatestRoster({ projectRoot: input.projectRoot, flowId });
  let reviewRoleId: string = DEFAULT_REVIEW_ROLE_ID;
  if (roster.ok) {
    reviewRoleId = reviewRoleIdOfRoster(roster.roster);
  } else if (reason === "baseline") {
    return serviceFailure("baseline-roster-drift", `A9 基线需要合法名单：${roster.reason}`);
  }
  let planSha: string | undefined;
  let planPath: string | undefined;
  let planVersion: number | undefined;
  if (reason === "baseline") {
    if (!isProjectRelativePath(input.planPath)) {
      return serviceFailure("baseline-team-plan-invalid", "团队计划路径非法（须项目相对 docs/scheduling/<flowId>-team-vN.md）。");
    }
    const escaped = flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`^docs/scheduling/${escaped}-team-v(\\d+)\\.md$`).exec(input.planPath);
    if (match === null) {
      return serviceFailure("baseline-team-plan-invalid", `团队计划路径须为 docs/scheduling/${flowId}-team-vN.md：${input.planPath}。`);
    }
    const version = Number(match[1]);
    if (input.planVersion !== undefined && input.planVersion !== version) {
      return serviceFailure("baseline-plan-hash-drift", `planVersion=${input.planVersion} 与文件名 v${version} 不一致。`);
    }
    planVersion = version;
    planPath = input.planPath;
    let planText: string;
    try {
      planText = await fs.readFile(path.join(input.projectRoot, ...planPath.split("/")), "utf8");
    } catch {
      return serviceFailure("baseline-document-missing", `团队计划不可读：${planPath}。`);
    }
    planSha = sha256Of(Buffer.from(planText, "utf8"));
    if (input.planSha256 !== undefined) {
      if (!isSha256Hex(input.planSha256)) {
        return serviceFailure("baseline-identity-invalid", "plan.sha256 形状非法（须 64 hex）。");
      }
      if (input.planSha256 !== planSha) {
        return serviceFailure("baseline-plan-hash-drift", `plan.sha256 声明值与实际字节不一致：${planPath}。`);
      }
    }
    if (!roster.ok) return serviceFailure("baseline-roster-drift", `A9 基线需要合法名单：${roster.reason}`);
    const modules = await latestModulesRef(input.projectRoot, flowId);
    if (modules === undefined) {
      return serviceFailure("baseline-document-missing", `未找到最新模块清单 docs/proposals/${flowId}-modules-vN.md。`);
    }
    const parsed = parseTeamPlan(planText, {
      flowId,
      version,
      modules: { path: modules.path, sha256: modules.sha256 },
      roster: { path: roster.path, sha256: roster.sha256 },
      rosterFacts: roster.roster,
    });
    if (!parsed.ok) return serviceFailure("baseline-team-plan-invalid", parsed.reason);
  }
  const read = reason === "baseline"
    ? await recordBasisDocuments(input.projectRoot, flowId)
    : await snapshotExistingBasisDocuments(input.projectRoot, flowId);
  if (!read.ok) return serviceFailure(baselineDocumentCode(read.code), read.message);
  if (reason === "baseline") {
    if (read.teamPlan === undefined || read.teamPlan.path !== planPath || read.teamPlan.version !== planVersion) {
      return serviceFailure("baseline-team-plan-invalid", "团队计划发现结果与入参不一致（plan path/version drift）。");
    }
    if (planSha !== undefined && read.teamPlan.sha256 !== planSha) {
      return serviceFailure("baseline-plan-hash-drift", "团队计划字节 hash 在读取期间漂移。");
    }
  }
  const idempotencyKey = reason === "baseline"
    ? `baseline:${input.workflowId}:${read.teamPlan?.sha256 ?? "none"}`
    : `path-b:${input.workflowId}:${sha256Of(JSON.stringify(read.documents)).slice(0, 24)}`;
  // AC-16 `baseline-operation-conflict`：同 operationId 指向不同幂等键（内容不同）⇒ 冲突拒绝；
  // 同幂等键重复 ⇒ 下方 append replay 返回原回执。
  const priorOperation = (await readBasisLedger(input.projectRoot)).events.find((event) =>
    (event.kind === "basis.recorded" || event.kind === "basis.amended")
    && event.workflowId === input.workflowId
    && event.operationId === input.operationId
    && event.idempotencyKey !== idempotencyKey);
  if (priorOperation !== undefined) {
    return serviceFailure(
      "baseline-operation-conflict",
      `operationId ${input.operationId} 已用于不同的基线内容（${priorOperation.idempotencyKey}）；请用新 operationId 重试。`,
    );
  }
  // B3（§5.2/§4.3 MF-12）：注入端口时在文档校验通过之后、basis.recorded 写入之前执行最小 Git 准备
  // （git init -b main / ans-managed `.gitignore` + baseline commit / 任务分支 / dirty 判定）。
  // 失败即 fail-closed（真实原因码），不写 basis、不产生客户卡；path-b 不自动 init（b-repository-required）。
  let repoSnapshot = input.repo;
  let gitReceipt: BaselineGitReceipt | undefined;
  if (input.port !== undefined) {
    const prepared = await prepareBaselineGit({
      projectRoot: input.projectRoot,
      workflowId: input.workflowId,
      reason,
      port: input.port,
    });
    if (!prepared.ok) return prepared;
    repoSnapshot = prepared.repo;
    gitReceipt = prepared.receipt;
  }
  const recorded = buildBasisRecordedEvent({
    workflowId: input.workflowId,
    flowId,
    documents: read.documents,
    teamPlan: reason === "baseline" ? (read.teamPlan ?? null) : null,
    ...(repoSnapshot !== undefined ? { repo: repoSnapshot } : {}),
    reviewRoleId,
    operationId: input.operationId,
    idempotencyKey,
    reason,
    now,
  });
  const appended = await appendBasisEvent(input.projectRoot, recorded);
  if (!appended.ok) return serviceFailure("baseline-ledger-write-failed", `basis.recorded 写入失败：${appended.message}`);
  const basisId = appended.event.basisId;
  let stageCompleted = false;
  if (reason === "baseline") {
    const after = await readWorkflowLedger(input.projectRoot);
    const currentView = deriveWorkflowView(workflowEventList(after.events, input.workflowId), tasks.events);
    if (currentView.stage === "A9" && canCompleteStage(currentView, "A9")) {
      const artifacts = [
        ...read.documents.map((doc) => ({ path: doc.path, sha256: doc.sha256, kind: doc.kind })),
        ...(read.teamPlan !== undefined ? [{ path: read.teamPlan.path, sha256: read.teamPlan.sha256, kind: "team-plan" }] : []),
      ];
      const completion: WorkflowEvent = {
        v: 1,
        at: now().toISOString(),
        schema: WORKFLOW_LEDGER_SCHEMA,
        kind: "stage.completed",
        workflowId: input.workflowId,
        flowId,
        path: currentView.path,
        idempotencyKey: `stage-complete:${input.workflowId}:A9:${basisId}`,
        stage: "A9",
        cause: { kind: "basis-recorded", ref: basisId },
        artifacts,
      };
      const done = await appendWorkflowEvent(input.projectRoot, completion);
      if (!done.ok) return serviceFailure("baseline-ledger-write-failed", `stage.completed A9 写入失败：${done.message}`);
      stageCompleted = true;
    }
  }
  return {
    ok: true,
    basisId,
    reviewRoleId,
    documents: read.documents.map((doc) => ({ ...doc })),
    ...(read.teamPlan !== undefined
      ? { teamPlan: { path: read.teamPlan.path, version: read.teamPlan.version, sha256: read.teamPlan.sha256 } }
      : {}),
    ...(gitReceipt !== undefined ? { git: gitReceipt } : {}),
    replay: appended.replay,
    stageCompleted,
  };
}

// —————————————— A9/B1 基线修正（basis.amended；AC-19/T-08 B2.1） ——————————————

/** 同 workflow 的 basis 记录（`basis.recorded`/`basis.amended`；旧 basis 保留，修正链按追加顺序取最新）。 */
type BasisRecordEvent = Extract<BasisEvent, { kind: "basis.recorded" | "basis.amended" }>;

function basisRecordList(events: readonly BasisEvent[], workflowId: string): BasisRecordEvent[] {
  return events.filter((event): event is BasisRecordEvent =>
    (event.kind === "basis.recorded" || event.kind === "basis.amended") && event.workflowId === workflowId);
}

function basisDocumentViews(documents: readonly BasisDocumentRef[]): BasisDocumentView[] {
  return documents.map((doc) => ({ kind: doc.kind, path: doc.path, version: doc.version, sha256: doc.sha256, bytes: doc.bytes }));
}

/** `basis.drift` 追加（detectedAt/path/expected/actual；同键 replay 不重复记账）。 */
async function appendBasisDriftEvents(
  projectRoot: string,
  workflowId: string,
  basisId: string,
  drift: readonly { path: string; expectedSha256: string; actualSha256: string | null }[],
  now: () => Date,
): Promise<void> {
  for (const entry of drift) {
    const at = now().toISOString();
    const event: BasisEvent = {
      v: 1,
      at,
      schema: BASIS_LEDGER_SCHEMA,
      kind: "basis.drift",
      idempotencyKey: `basis-drift:${workflowId}:${entry.path}:${entry.actualSha256 ?? "missing"}`,
      basisId,
      path: entry.path,
      expectedSha256: entry.expectedSha256,
      actualSha256: entry.actualSha256,
      detectedAt: at,
    };
    await appendBasisEvent(projectRoot, event);
  }
}

export interface AmendBasisInput {
  projectRoot: string;
  flowId: string;
  workflowId: string;
  operationId: string;
  /** 当前最新 basis 的 basisId；修正链只允许指向最新记录（不跳代）。 */
  previousBasisId: string;
  /** 新团队计划声明（可选断言）：路径须为磁盘最新 `docs/scheduling/<flowId>-team-vN.md`，hash/版本一致。 */
  planPath?: string;
  planVersion?: number;
  planSha256?: string;
  /** 新仓库快照（缺省沿用上一 basis 的 repo 记录；只读，不产生写权）。 */
  repo?: WorkflowRepoSnapshot;
  now?: () => Date;
}

export interface AmendBasisReceipt {
  basisId: string;
  previousBasisId: string;
  reviewRoleId: string;
  documents: BasisDocumentView[];
  teamPlan?: { path: string; version: number; sha256: string };
  /** 重复同幂等键 ⇒ replay 返回原 basisId（不追加第二行）。 */
  replay: boolean;
}

export type AmendBasisResult = ({ ok: true } & AmendBasisReceipt) | WorkflowServiceFailure;

/**
 * 文档修正（v1.3 §5.3/§7.2）：同 workflow 新 basis ⇒ 追加 `basis.amended`（`previousBasisId` 指向
 * 旧记录，旧 basis 保留）。修正须出新 `-vN` 文件——
 *  · 同一路径的既有文档字节必须与 `previousBasisId` 记录一致；同路径改字节 ⇒ `basis.drift` + `basis-hash-mismatch`；
 *  · 已记录 kind 消失且无新版本 ⇒ 同上；
 *  · 基线型 basis（有团队计划）：按最新名单/模块清单重新校验团队计划结构（名单/模块出新版必须同步出新计划）；
 *  · path-b 只读快照：重新快照现存文档（缺失允许），不接受团队计划声明。
 * 重复同幂等键 replay；同 operationId 不同内容 ⇒ `baseline-operation-conflict`。
 * **不产生写权、不视为客户/验收批准**：只追加 basis 账本记录，不写阶段推进/激活/发布事件。
 */
export async function amendBasis(input: AmendBasisInput): Promise<AmendBasisResult> {
  const now = input.now ?? (() => new Date());
  const flowId = typeof input.flowId === "string" ? input.flowId.trim() : "";
  if (!isWorkflowSlug(flowId)) return serviceFailure("basis-amend-invalid", `flowId 非法：${String(input.flowId)}`);
  if (!isNonEmptyText(input.workflowId)) return serviceFailure("basis-amend-invalid", "workflowId 缺失。");
  if (!isNonEmptyText(input.operationId)) return serviceFailure("basis-amend-invalid", "operationId 缺失。");
  if (!isNonEmptyText(input.previousBasisId)) return serviceFailure("basis-amend-invalid", "previousBasisId 缺失。");

  const wfLedger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(wfLedger.events, input.workflowId);
  if (!wfEvents.some((event) => event.kind === "workflow.started")) {
    return serviceFailure("workflow-not-found", `workflow ${input.workflowId} 不存在。`);
  }
  const tasks = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, tasks.events);
  const vf = viewFailure(view);
  if (vf !== undefined) return vf;
  if (view.closed !== undefined) {
    return serviceFailure("workflow-closed", `workflow ${input.workflowId} 已关闭（${view.closed.outcome}），不再接受 basis 修正。`);
  }
  if (view.flowId !== flowId) {
    return serviceFailure("basis-amend-invalid", `flowId ${flowId} 与 workflow 记录 ${view.flowId} 不匹配。`);
  }

  const ledger = await readBasisLedger(input.projectRoot);
  const records = basisRecordList(ledger.events, input.workflowId);
  const latest = records[records.length - 1];
  if (latest === undefined) {
    return serviceFailure("basis-missing", `workflow ${input.workflowId} 没有 basis 记录（先完成 A9/B1 basis 记录）。`);
  }

  // reviewRoleId 由应用从最新 roster 派生（不采信模型自报）；roster 不可读时沿用上一 basis。
  const roster = await loadLatestRoster({ projectRoot: input.projectRoot, flowId });
  const reviewRoleId = roster.ok ? reviewRoleIdOfRoster(roster.roster) : (latest.reviewRoleId ?? DEFAULT_REVIEW_ROLE_ID);

  // 基线型 = 上一 basis 携带团队计划；否则为 path-b 只读快照型。
  const baselineStyle = latest.teamPlan !== null && latest.teamPlan !== undefined;
  let read: { ok: true; documents: BasisDocumentRef[]; teamPlan?: BasisTeamPlanRef };
  if (baselineStyle) {
    const docs = await recordBasisDocuments(input.projectRoot, flowId);
    if (!docs.ok) return serviceFailure(docs.code, docs.message);
    if (docs.teamPlan === undefined) {
      return serviceFailure("basis-amend-invalid", `基线修正缺少团队计划 docs/scheduling/${flowId}-team-vN.md（fail-closed）。`);
    }
    read = docs;
  } else {
    if (input.planPath !== undefined || input.planVersion !== undefined || input.planSha256 !== undefined) {
      return serviceFailure("basis-amend-invalid", "path-b 只读快照修正不接受团队计划声明（无团队计划）。");
    }
    const snapshot = await snapshotExistingBasisDocuments(input.projectRoot, flowId);
    if (!snapshot.ok) return serviceFailure(snapshot.code, snapshot.message);
    read = snapshot;
  }

  const planRef: BasisTeamPlanRef | null = read.teamPlan ?? null;
  if (baselineStyle && planRef !== null) {
    if (input.planPath !== undefined && input.planPath !== planRef.path) {
      return serviceFailure("basis-amend-invalid", `planPath ${input.planPath} 不是磁盘最新团队计划 ${planRef.path}（修正须显式出新 -vN）。`);
    }
    if (input.planVersion !== undefined && input.planVersion !== planRef.version) {
      return serviceFailure("basis-hash-mismatch", `planVersion=${input.planVersion} 与 ${planRef.path} 不一致。`);
    }
    if (input.planSha256 !== undefined) {
      if (!isSha256Hex(input.planSha256)) {
        return serviceFailure("basis-amend-invalid", "planSha256 形状非法（须 64 hex）。");
      }
      if (input.planSha256 !== planRef.sha256) {
        return serviceFailure("basis-hash-mismatch", `plan.sha256 声明值与实际字节不一致：${planRef.path}。`);
      }
    }
    // 团队计划结构校验（与 A9 基线同一判据）：名单/模块出新版本时必须同步出新计划。
    let planText: string;
    try {
      planText = await fs.readFile(path.join(input.projectRoot, ...planRef.path.split("/")), "utf8");
    } catch {
      return serviceFailure("basis-document-missing", `团队计划不可读：${planRef.path}。`);
    }
    if (!roster.ok) return serviceFailure("basis-amend-invalid", `基线修正需要合法名单：${roster.reason}`);
    const modules = await latestModulesRef(input.projectRoot, flowId);
    if (modules === undefined) {
      return serviceFailure("basis-document-missing", `未找到最新模块清单 docs/proposals/${flowId}-modules-vN.md。`);
    }
    const parsed = parseTeamPlan(planText, {
      flowId,
      version: planRef.version,
      modules: { path: modules.path, sha256: modules.sha256 },
      roster: { path: roster.path, sha256: roster.sha256 },
      rosterFacts: roster.roster,
    });
    if (!parsed.ok) return serviceFailure("basis-amend-invalid", parsed.reason);
  }

  const digest = sha256Of(JSON.stringify({
    documents: read.documents
      .map((doc) => ({ kind: doc.kind, path: doc.path, version: doc.version, sha256: doc.sha256, bytes: doc.bytes }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    teamPlan: planRef,
  }));
  const idempotencyKey = `amend:${input.workflowId}:${input.previousBasisId}:${digest}`;

  // 同幂等键 replay（须先于「指向最新 basis」与「无变化」判定：重试时最新已是本修正记录）。
  const existing = records.find((event) => event.idempotencyKey === idempotencyKey);
  if (existing !== undefined) {
    if (existing.kind !== "basis.amended" || existing.previousBasisId !== input.previousBasisId) {
      return serviceFailure("basis-amend-invalid", `幂等键 ${idempotencyKey} 已用于不同修正记录。`);
    }
    return {
      ok: true,
      basisId: existing.basisId,
      previousBasisId: existing.previousBasisId,
      reviewRoleId: existing.reviewRoleId ?? reviewRoleId,
      documents: basisDocumentViews(existing.documents),
      ...(existing.teamPlan !== null && existing.teamPlan !== undefined
        ? { teamPlan: { path: existing.teamPlan.path, version: existing.teamPlan.version, sha256: existing.teamPlan.sha256 } }
        : {}),
      replay: true,
    };
  }
  const priorOperation = records.find((event) =>
    event.operationId === input.operationId && event.idempotencyKey !== idempotencyKey);
  if (priorOperation !== undefined) {
    return serviceFailure(
      "baseline-operation-conflict",
      `operationId ${input.operationId} 已用于不同的 basis 内容（${priorOperation.idempotencyKey}）；请用新 operationId 重试。`,
    );
  }
  if (!records.some((event) => event.basisId === input.previousBasisId)) {
    return serviceFailure("basis-missing", `previousBasisId ${input.previousBasisId} 不存在于 workflow ${input.workflowId} 的 basis 记录。`);
  }
  if (latest.basisId !== input.previousBasisId) {
    return serviceFailure(
      "basis-amend-invalid",
      `previousBasisId ${input.previousBasisId} 不是当前最新 basis ${latest.basisId}（修正链不跳代）。`,
    );
  }

  // 「documents 实际 bytes/hash 与 previousBasisId 一致」：同路径文档必须保持旧 hash；
  // 已记录 kind 消失且无新版本 = 漂移。同路径改字节是漂移，必须出新 -vN，不得静默重记。
  const drift: { path: string; expectedSha256: string; actualSha256: string | null }[] = [];
  for (const previous of latest.documents) {
    const samePath = read.documents.find((doc) => doc.path === previous.path);
    if (samePath !== undefined) {
      if (samePath.sha256 !== previous.sha256) {
        drift.push({ path: previous.path, expectedSha256: previous.sha256, actualSha256: samePath.sha256 });
      }
      continue;
    }
    if (!read.documents.some((doc) => doc.kind === previous.kind)) {
      drift.push({ path: previous.path, expectedSha256: previous.sha256, actualSha256: null });
    }
  }
  const previousPlan = latest.teamPlan;
  if (previousPlan !== null && previousPlan !== undefined) {
    if (planRef === null) {
      drift.push({ path: previousPlan.path, expectedSha256: previousPlan.sha256, actualSha256: null });
    } else if (planRef.path === previousPlan.path && planRef.sha256 !== previousPlan.sha256) {
      drift.push({ path: previousPlan.path, expectedSha256: previousPlan.sha256, actualSha256: planRef.sha256 });
    }
  }
  if (drift.length > 0) {
    await appendBasisDriftEvents(input.projectRoot, input.workflowId, latest.basisId, drift, now);
    return serviceFailure(
      "basis-hash-mismatch",
      `修正发现同路径字节漂移（须出新 -vN，不得原地改）：${drift.map((entry) => entry.path).join("、")}（fail-closed）。`,
    );
  }

  const sameDocuments = read.documents.length === latest.documents.length
    && read.documents.every((doc) => latest.documents.some((prev) => prev.path === doc.path && prev.sha256 === doc.sha256));
  const samePlan = planRef === null
    ? previousPlan === null || previousPlan === undefined
    : previousPlan !== null && previousPlan !== undefined && previousPlan.path === planRef.path && previousPlan.sha256 === planRef.sha256;
  if (sameDocuments && samePlan) {
    return serviceFailure("basis-amend-invalid", "修正内容与当前 basis 相同（无新 -vN/无变化）；不追加记录。");
  }

  const at = now().toISOString();
  const event: BasisEvent = {
    v: 1,
    at,
    schema: BASIS_LEDGER_SCHEMA,
    kind: "basis.amended",
    basisId: basisIdFor(idempotencyKey),
    previousBasisId: latest.basisId,
    workflowId: input.workflowId,
    flowId,
    documents: read.documents.map((doc) => ({ ...doc })),
    teamPlan: planRef,
    ...(input.repo !== undefined ? { repo: input.repo } : latest.repo !== undefined ? { repo: latest.repo } : {}),
    reviewRoleId,
    operationId: input.operationId,
    idempotencyKey,
    recordedBy: "application",
  };
  const appended = await appendBasisEvent(input.projectRoot, event);
  if (!appended.ok) return serviceFailure("baseline-ledger-write-failed", `basis.amended 写入失败：${appended.message}`);
  return {
    ok: true,
    basisId: event.basisId,
    previousBasisId: event.previousBasisId,
    reviewRoleId,
    documents: basisDocumentViews(read.documents),
    ...(planRef !== null ? { teamPlan: { path: planRef.path, version: planRef.version, sha256: planRef.sha256 } } : {}),
    replay: appended.replay,
  };
}

// —————————————— 关键门 drift 校验 + basis.verified 节流（AC-19 / v1.3 §7.2 G-9） ——————————————

/**
 * 关键门阶段（v1.3 §7.2/G-9）：A11/B3 实现派发前、A12a/A12b 验收前后、A13/B4 发布前；
 * B1 为路径 B 派发准备门（既有桌面调用点）。只有这些阶段的一致校验才节流入账 `basis.verified`。
 */
export const BASIS_KEY_GATE_STAGES: readonly WorkflowStage[] = Object.freeze(["A11", "B1", "B3", "A12a", "A12b", "A13", "B4"]);

/** 关键门判定（只决定 `basis.verified` 是否入账；drift 校验本身对所有阶段一致）。 */
export function isBasisKeyGateStage(stage: WorkflowStage | undefined): boolean {
  return stage !== undefined && (BASIS_KEY_GATE_STAGES as readonly string[]).includes(stage);
}

/** 依据文档摘要（path+sha256 排序后 SHA-256；`basis.verified` 节流键：同 basis+同摘要只记一次）。 */
export function basisDocumentsDigest(documents: readonly { path: string; sha256: string }[]): string {
  return sha256Of(JSON.stringify(
    [...documents]
      .map((doc) => ({ path: doc.path, sha256: doc.sha256 }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  ));
}

export interface VerifyBasisForWorkflowInput {
  projectRoot: string;
  workflowId: string;
  /** 关键门阶段（A11/B1/B3/A12a/A12b/A13/B4）：一致时按 v1.3 §7.1 摘要节流入账 `basis.verified`。 */
  stage?: WorkflowStage;
  /** 缺省 true：drift 必写 `basis.drift`（普通读取也不隐瞒漂移）。 */
  recordDrift?: boolean;
  now?: () => Date;
}

export type VerifyBasisForWorkflowResult =
  | { ok: true; basisId: string; verifiedRecorded: boolean }
  | WorkflowServiceFailure;

/**
 * 关键门 drift 校验（A11/B3 派发前、A12a/A12b、A13/B4 发布前；AC-19）。
 * 一致时：仅关键门（且同 basis+同 documents digest 未记过）追加 `basis.verified` 摘要（G-9 节流，
 * 普通读取不逐次入账）；漂移时：追加 `basis.drift`（path/expected/actual/detectedAt）并 fail-closed。
 * `basis.verified` 只是校验记录，**不是批准/写权**。
 */
export async function verifyBasisForWorkflow(input: VerifyBasisForWorkflowInput): Promise<VerifyBasisForWorkflowResult> {
  const now = input.now ?? (() => new Date());
  const ledger = await readBasisLedger(input.projectRoot);
  const records = basisRecordList(ledger.events, input.workflowId);
  const latest = records[records.length - 1];
  if (latest === undefined) return serviceFailure("basis-missing", `workflow ${input.workflowId} 没有 basis 记录。`);
  const checked = [
    ...latest.documents.map((doc) => ({ path: doc.path, sha256: doc.sha256 })),
    ...(latest.teamPlan !== null && latest.teamPlan !== undefined ? [latest.teamPlan] : []),
  ];
  const verify = await verifyBasisDocuments(input.projectRoot, checked);
  if (!verify.ok) {
    if (input.recordDrift !== false) {
      await appendBasisDriftEvents(input.projectRoot, input.workflowId, latest.basisId, verify.drift, now);
    }
    return serviceFailure("basis-drift", `依据漂移：${verify.drift.map((entry) => entry.path).join("、")}（fail-closed）。`);
  }
  // G-9：普通读取（无 stage）不写 basis.verified，避免账本膨胀。
  if (!isBasisKeyGateStage(input.stage)) return { ok: true, basisId: latest.basisId, verifiedRecorded: false };
  const digest = basisDocumentsDigest(checked);
  const priorVerified = ledger.events.some((event) =>
    event.kind === "basis.verified" && event.basisId === latest.basisId && basisDocumentsDigest(event.documents) === digest);
  if (priorVerified) return { ok: true, basisId: latest.basisId, verifiedRecorded: false };
  const at = now().toISOString();
  const event: BasisEvent = {
    v: 1,
    at,
    schema: BASIS_LEDGER_SCHEMA,
    kind: "basis.verified",
    idempotencyKey: `basis-verified:${latest.basisId}:${digest}`,
    basisId: latest.basisId,
    checkedAt: at,
    ok: true,
    documents: checked.map((doc) => ({ path: doc.path, sha256: doc.sha256, ok: true })),
  };
  const appended = await appendBasisEvent(input.projectRoot, event);
  if (!appended.ok) return serviceFailure("baseline-ledger-write-failed", `basis.verified 写入失败：${appended.message}`);
  return { ok: true, basisId: latest.basisId, verifiedRecorded: appended.replay === false };
}

/**
 * 按阶段复核 basis（A12a/A12b 等调用方入口）：chief→verifier 直派不经 convener basis 门时，
 * 桌面在 verifier close/report 前调用本函数；drift ⇒ `basis.drift` + `basis-drift` fail-closed，
 * 阻塞 A12a/A12b 完成（不触 trunk/CAS）。关键门一致时按节流入账 `basis.verified`。
 */
export async function verifyBasisForStage(input: {
  projectRoot: string;
  workflowId: string;
  stage: WorkflowStage;
  recordDrift?: boolean;
  now?: () => Date;
}): Promise<VerifyBasisForWorkflowResult> {
  if (!isWorkflowStage(input.stage)) {
    return serviceFailure("stage-transition-invalid", `stage 非法：${String(input.stage)}。`);
  }
  return verifyBasisForWorkflow({
    projectRoot: input.projectRoot,
    workflowId: input.workflowId,
    stage: input.stage,
    ...(input.recordDrift !== undefined ? { recordDrift: input.recordDrift } : {}),
    ...(input.now !== undefined ? { now: input.now } : {}),
  });
}

// —————————————— A12 验收归档（AC-20 / G-16） ——————————————

export interface ArchiveAcceptanceInput {
  projectRoot: string;
  flowId: string;
  workflowId: string;
  criteriaPath: string;
  reportPath: string;
  conclusion: string;
  staffDecision?: string;
  now?: () => Date;
}

export type ArchiveAcceptanceResult =
  | { ok: true; path: string; sha256: string; version: number; replay: boolean }
  | WorkflowServiceFailure;

/** A12 归档幂等键（AC-20：`acceptance:<workflowId>:<reportSha>`；应用独占写）。 */
export function acceptanceIdempotencyKey(workflowId: string, reportSha256: string): string {
  return `acceptance:${workflowId}:${reportSha256}`;
}

/**
 * A12 应用归档：生成 `docs/acceptance/<flowId>-acceptance-vN.md`（N 随 report 版本）；
 * 幂等 `acceptance:<workflowId>:<reportSha>`（文件已含同一 report hash ⇒ replay，不覆盖）；
 * 归档写失败 ⇒ `acceptance-archive-failed` 阻塞 A12（不静默通过）。
 */
export async function archiveAcceptance(input: ArchiveAcceptanceInput): Promise<ArchiveAcceptanceResult> {
  const now = input.now ?? (() => new Date());
  const flowId = typeof input.flowId === "string" ? input.flowId.trim() : "";
  if (!isWorkflowSlug(flowId)) return serviceFailure("acceptance-record-invalid", `flowId 非法：${String(input.flowId)}`);
  if (!isNonEmptyText(input.workflowId)) return serviceFailure("acceptance-record-invalid", "workflowId 缺失。");
  if (!isProjectRelativePath(input.criteriaPath) || !isProjectRelativePath(input.reportPath)) {
    return serviceFailure("acceptance-record-invalid", "criteria/report 路径非法。");
  }
  const reportMatch = new RegExp(`-report-v(\\d+)\\.md$`).exec(input.reportPath);
  if (reportMatch === null) return serviceFailure("acceptance-record-invalid", `验收报告须为 <flowId>-report-vN.md：${input.reportPath}。`);
  const version = Number(reportMatch[1]);
  const criteria = await readAndHash(input.projectRoot, input.criteriaPath);
  if (!criteria.ok) return serviceFailure("acceptance-record-invalid", `criteria 不可读：${input.criteriaPath}。`);
  const report = await readAndHash(input.projectRoot, input.reportPath);
  if (!report.ok) return serviceFailure("acceptance-record-invalid", `report 不可读：${input.reportPath}。`);
  const relPath = `docs/acceptance/${flowId}-acceptance-v${version}.md`;
  const abs = path.join(input.projectRoot, ...relPath.split("/"));
  const archiveKey = acceptanceIdempotencyKey(input.workflowId, report.sha256);
  const body = [
    "---",
    `flowId: ${flowId}`,
    `workflowId: ${input.workflowId}`,
    `criteria: ${input.criteriaPath}`,
    `criteriaSha256: ${criteria.sha256}`,
    `report: ${input.reportPath}`,
    `reportSha256: ${report.sha256}`,
    `idempotencyKey: ${archiveKey}`,
    `conclusion: ${JSON.stringify(input.conclusion)}`,
    ...(input.staffDecision !== undefined ? [`staffDecision: ${JSON.stringify(input.staffDecision)}`] : []),
    `archivedAt: ${now().toISOString()}`,
    "---",
    "",
    `# 验收归档（${flowId} v${version}）`,
    "",
    `- workflowId：${input.workflowId}`,
    `- criteria：${input.criteriaPath}（sha256 ${criteria.sha256}）`,
    `- report：${input.reportPath}（sha256 ${report.sha256}）`,
    `- 结论：${input.conclusion}`,
    ...(input.staffDecision !== undefined ? [`- 幕僚决策：${input.staffDecision}`] : []),
    "",
  ].join("\n");
  try {
    const existing = await fs.readFile(abs, "utf8");
    if (existing.includes(`reportSha256: ${report.sha256}`) || existing.includes(`idempotencyKey: ${archiveKey}`)) {
      return { ok: true, path: relPath, sha256: sha256Of(Buffer.from(existing, "utf8")), version, replay: true };
    }
    return serviceFailure("acceptance-archive-failed", `归档 ${relPath} 已存在且 report hash 不同；不覆盖（fail-closed）。`);
  } catch {
    /* 不存在 ⇒ 写入 */
  }
  const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid.toString(36)}.${Date.now().toString(36)}.tmp`);
  try {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(tmp, body, "utf8");
    await fs.rename(tmp, abs);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    return serviceFailure("acceptance-archive-failed", `归档写入失败：${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: true, path: relPath, sha256: sha256Of(Buffer.from(body, "utf8")), version, replay: false };
}

// —————————————— stop 停稳确认（AC-07） ——————————————

export interface ConfirmStopInput {
  projectRoot: string;
  workflowId: string;
  /** stop 请求任务 id（由 requestStage(stop) 创建）。 */
  requestTaskId: string;
  /** `stopped`（缺省）或 `reclassified`（note 声明改道）。 */
  outcome?: "stopped" | "reclassified";
  reason: string;
  now?: () => Date;
}

export type ConfirmStopResult =
  | { ok: true; workflowId: string; outcome: WorkflowClosedOutcome; reason: string; eventId: string; replay: boolean }
  | WorkflowServiceFailure;

/**
 * stop 停稳复核（AC-07）：请求已 closed + 运营报告 + 无 open 生产任务 ⇒ `workflow.closed stopped`；
 * 任一缺失 ⇒ 记 `workflow.stop-unconfirmed`、返回 `workflow-stop-unconfirmed`（**不写 stopped**）。
 */
export async function confirmStop(input: ConfirmStopInput): Promise<ConfirmStopResult> {
  const now = input.now ?? (() => new Date());
  const outcome: WorkflowClosedOutcome = input.outcome ?? "stopped";
  if (outcome !== "stopped" && outcome !== "reclassified") {
    return serviceFailure("workflow-stop-unconfirmed", `stop 结论只允许 stopped/reclassified（收到 ${String(outcome)}）。`);
  }
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(ledger.events, input.workflowId);
  if (!wfEvents.some((event) => event.kind === "workflow.started")) {
    return serviceFailure("workflow-not-found", `workflow ${input.workflowId} 不存在。`);
  }
  const tasks = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, tasks.events);
  const vf = viewFailure(view);
  if (vf !== undefined) return vf;
  if (view.closed !== undefined) {
    if (view.closed.outcome === outcome) {
      return {
        ok: true,
        workflowId: input.workflowId,
        outcome,
        reason: view.closed.reason,
        eventId: "",
        replay: true,
      };
    }
    return serviceFailure("workflow-closed", `workflow 已关闭（${view.closed.outcome}）。`);
  }
  const stopEvent = [...wfEvents].reverse().find((event): event is Extract<WorkflowEvent, { kind: "workflow.stop-requested" }> =>
    event.kind === "workflow.stop-requested" && (input.requestTaskId === "" || event.requestTaskId === input.requestTaskId));
  if (stopEvent === undefined) {
    return serviceFailure("workflow-stop-unconfirmed", "缺少 workflow.stop-requested（先由 chief 发 stop 请求）。");
  }
  const requestRecord = tasks.records.get(stopEvent.requestTaskId);
  const requestClosed = requestRecord?.closed !== undefined;
  const operatorReported = (requestRecord?.reports.length ?? 0) > 0;
  const openProductionTaskIds = [...tasks.records.values()]
    .filter((record) => record.created?.workflowId === input.workflowId
      && record.created.taskKind !== "stage-request"
      && record.closed === undefined)
    .map((record) => record.taskId);
  const missing: string[] = [];
  if (!requestClosed) missing.push("request.closed");
  if (!operatorReported) missing.push("operator.report");
  if (openProductionTaskIds.length > 0) missing.push(`open-production-tasks:${openProductionTaskIds.join(",")}`);
  const at = now().toISOString();
  if (missing.length > 0) {
    const unconfirmed: WorkflowEvent = {
      v: 1,
      at,
      schema: WORKFLOW_LEDGER_SCHEMA,
      kind: "workflow.stop-unconfirmed",
      workflowId: input.workflowId,
      flowId: view.flowId,
      path: view.path,
      idempotencyKey: `stage-stop-unconfirmed:${input.workflowId}:${stopEvent.stage}:1`,
      stage: stopEvent.stage,
      requestTaskId: stopEvent.requestTaskId,
      missing,
    };
    const appended = await appendWorkflowEvent(input.projectRoot, unconfirmed);
    if (!appended.ok) return serviceFailure("workflow-ledger-write-failed", `workflow.stop-unconfirmed 写入失败：${appended.message}`);
    return serviceFailure("workflow-stop-unconfirmed", `停稳证据不足：${missing.join("、")}（不写 stopped）。`, missing);
  }
  const closed: WorkflowEvent = {
    v: 1,
    at,
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "workflow.closed",
    workflowId: input.workflowId,
    flowId: view.flowId,
    path: view.path,
    idempotencyKey: `workflow-close:${input.workflowId}:${outcome}:${reasonDigest(input.reason)}`,
    outcome,
    reason: input.reason,
    stopEvidence: { requestClosed, operatorReported, openProductionTaskIds },
  };
  const appended = await appendWorkflowEvent(input.projectRoot, closed);
  if (!appended.ok) return serviceFailure("workflow-ledger-write-failed", `workflow.closed 写入失败：${appended.message}`);
  return { ok: true, workflowId: input.workflowId, outcome, reason: input.reason, eventId: appended.event.idempotencyKey, replay: appended.replay };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// T3 B3：发布合并 / 验收归档查询 / 基线-路径B 准备与写集派生（2026-11-10，编排）
//
// 依据：实现级方案 v1.3 §6.4（合并 main）、§8.4（merge-main 高风险卡）、§5.1–§5.5（基线 3 件小事）、
// §4.3（路径 B 最小准备与 B3 写集派生）、§4.5（A13/B4 完成）；G-IR **MF-IR-8**（不新增
// `requestReleaseMerge`；应用自有自动呈卡/UI 动作）；B1 验收 AC-09/AC-10/AC-11/AC-14/AC-15/AC-16/
// AC-20/AC-22、T-07/T-10/T-11/T-12/T-15。
//
// 纪律：
//  · merge-main 是**应用自有非判断卡**：本段只提供应用服务（前置校验 / preview 事实 / 账本事件 /
//    客户本人确认校验 / 固定 argv 执行端口），不新增角色工具、不进 judge 分组、不提供 judge 代批。
//  · `release.confirmed.by` 只能 "customer"；judge 只能 `release.rejected`（转人工/拒绝）。
//  · 不 push / tag / 发布产物：端口只有本地 inspect/preview/mergeMain；冲突只 `merge --abort` 回任务分支，
//    不 force/reset/clean。
//  · 基线/路径 B 的真实 Git 由桌面 B3 注入 `BaselineGitPort`/`ReleaseGitPort`（固定 argv/sanitized env）；
//    服务层负责顺序、前置、幂等与账本；失败不产生客户卡。
// ══════════════════════════════════════════════════════════════════════════════════════════════════

// —————————————— 发布合并（AC-11/AC-14/AC-22/T-10；MF-IR-8） ——————————————

/** merge-main 高风险提示（preview 必含；AC-14）。 */
export const HIGH_RISK_MERGE_NOTES: readonly string[] = Object.freeze([
  "合并 main 属发布高风险动作：必须客户本人在 merge-main 卡确认；judge 只能转人工/拒绝，不得代批。",
  "只做本地合并（应用固定 argv，不经 shell）：不 push、不打 tag、不发布产物；push/tag 需客户逐次授权。",
  "合并会把任务分支变更整体带入 main；请在预览中核对 base OID、tip OID、文件数与 diff stat。",
]);

/** 任务分支名（`ans/task/<workflowId>`；v1.3 §6.1）。 */
export function taskBranchName(workflowId: string): string {
  return `ans/task/${workflowId}`;
}

/** 逻辑幂等键（v1.3 §6.4：`release:<workflowId>:<tipOid>`；重复调用返回原 release 回执）。 */
export function releaseIdempotencyKey(workflowId: string, tipOid: GitOid): string {
  return `release:${workflowId}:${tipOid.hex}`;
}

/** 发布 releaseId（确定性；无时钟/随机）。 */
export function releaseIdFor(workflowId: string, tipOid: GitOid): string {
  return `rel-${sha256Of(`release:${workflowId}:${tipOid.hex}`).slice(0, 24)}`;
}

/** 单事件幂等键（requested/confirmed/rejected/merged/failed 各一；同键重复 append ⇒ replay）。 */
export function releaseEventIdempotencyKey(
  kind: "requested" | "confirmed" | "rejected" | "merged" | "failed",
  workflowId: string,
  tipOid: GitOid,
  suffix?: string,
): string {
  return `release-${kind}:${workflowId}:${tipOid.hex}${suffix !== undefined ? `:${suffix}` : ""}`;
}

/** 仓库事实（应用 Git 端口读取；模型不可自报；不 push/tag）。 */
export interface WorkflowGitRepositoryFacts {
  /** 当前分支（发布前置要求 = `ans/task/<workflowId>`）。 */
  branch: string;
  /** 当前分支 HEAD（任务分支 tip，应用实际读取）。 */
  headOid: GitOid;
  /** main tip；main unborn ⇒ null（`mergeKind:"initial"`）。 */
  mainOid: GitOid | null;
  objectFormat: "sha1" | "sha256";
  /** tracked 修改/删除数（0 = clean；治理文档被 `.gitignore` 忽略不计）。 */
  trackedChanges: number;
  /** 非忽略 untracked 路径（`.gitignore` 过滤后）。 */
  untracked: string[];
  /** `.gitignore` 当前字节 SHA-256（不存在 ⇒ null；与 basis.repo 记录比对）。 */
  gitignoreSha256: string | null;
  /** `.gitignore` 被跟踪且有未提交修改（`baseline-gitignore-dirty`）。 */
  gitignoreTrackedDirty: boolean;
}

/** 发布合并 Git 端口（桌面 B3 注入真实实现；测试注入 fake）。**只做本地操作。** */
export interface ReleaseGitPort {
  /** 只读仓库事实（分支/HEAD/main/dirty/.gitignore hash）。 */
  inspectRepository(request: { projectRoot: string }): Promise<
    { ok: true; facts: WorkflowGitRepositoryFacts } | WorkflowServiceFailure
  >;
  /** 只读预览：base=main OID（unborn ⇒ 空树）↔ tip=任务分支 tip 的文件/diff stat。 */
  previewMerge(request: { projectRoot: string; mainOid: GitOid | null; tipOid: GitOid }): Promise<
    | { ok: true; files: ReleaseFileChange[]; fileCount: number; diffStat: string; diffDigest: string }
    | WorkflowServiceFailure
  >;
  /**
   * 本地合并（固定 argv/sanitized env；**不 push/tag**）：
   * main unborn ⇒ `git switch -c main <tipOid>`/update-ref（`mergeKind:"initial"`）；
   * main 存在 ⇒ switch main + `git merge --no-ff <branch>`；冲突 ⇒ `git merge --abort` + 切回任务分支后
   * 返回 `release-merge-conflict`（不 force/reset/clean）；占用/切换失败 ⇒ `release-main-busy`。
   */
  mergeMain(request: {
    projectRoot: string;
    workflowId: string;
    flowId: string;
    branch: string;
    baseOid: GitOid | null;
    tipOid: GitOid;
    mergeKind: ReleaseMergeKind;
  }): Promise<ReleaseGitMergeOutcome>;
}

export type ReleaseGitMergeOutcome =
  | {
      ok: true;
      mergeKind: ReleaseMergeKind;
      baseOid: GitOid | null;
      tipOid: GitOid;
      mergeOid: GitOid;
      files: ReleaseFileChange[];
      diffDigest: string;
    }
  | WorkflowServiceFailure;

/** `merge-main` preview（AC-14：workflowId/flowId、main base OID、branch tip OID、文件数、diff stat、合并方式、高风险提示）。 */
export interface ReleaseMergePreview {
  workflowId: string;
  flowId: string;
  releaseId: string;
  mainBaseOid: GitOid | null;
  branchTipOid: GitOid;
  /** 任务分支基点 OID（basis.repo.baseOid；路径 B 可能基于非 main HEAD——AC-22/G-2 披露）。 */
  branchBaseOid: string | null;
  /** 分支基点 ≠ main base ⇒ true（preview 必须标注非 main 基线；diff stat 为分支↔main）。 */
  nonMainBaseline: boolean;
  fileCount: number;
  diffStat: string;
  files: ReleaseFileChange[];
  diffDigest: string;
  mergeKind: ReleaseMergeKind;
  highRiskNotes: readonly string[];
}

export interface PrepareReleaseMergeInput {
  projectRoot: string;
  workflowId: string;
  /** 应用操作 id（审计）；同一 tip 的重复 prepare 幂等（replay）。 */
  operationId: string;
  /** 交付说明（≤4000 字符）。 */
  summary: string;
  /** 交付证据（应用逐路径重算实际字节 SHA-256 并与入参比对；不一致 ⇒ release-unauthorized，不发卡）。 */
  evidence: readonly { path: string; sha256: string }[];
  port: ReleaseGitPort;
  now?: () => Date;
}

export type PrepareReleaseMergeResult =
  | {
      ok: true;
      releaseId: string;
      releaseKey: string;
      stage: "A13" | "B4";
      preview: ReleaseMergePreview;
      replay: boolean;
    }
  | WorkflowServiceFailure;

/** 最新 basis 记录的 repo 快照（A13/B4 发布前 `.gitignore` hash 比对）。 */
async function latestBasisRepoSnapshot(projectRoot: string, workflowId: string): Promise<WorkflowRepoSnapshot | undefined> {
  const ledger = await readBasisLedger(projectRoot);
  const records = ledger.events.filter((event): event is Extract<BasisEvent, { kind: "basis.recorded" | "basis.amended" }> =>
    (event.kind === "basis.recorded" || event.kind === "basis.amended") && event.workflowId === workflowId);
  return records[records.length - 1]?.repo;
}

/** 运营报告在案（AC-11 B4）：任一本 workflow 任务上有 convener 的 done 报告（不认模型自报）。 */
function operatorReportedForWorkflow(records: Iterable<TaskRecord>, workflowId: string): boolean {
  for (const record of records) {
    if (record.created?.workflowId !== workflowId) continue;
    if (record.reports.some((report) => report.from === "convener" && report.status === "done")) return true;
  }
  return false;
}

/** A12 应用归档事实（`docs/acceptance/<flowId>-acceptance-vN.md`；应用自有、角色只读）。 */
export interface AcceptanceArchiveFacts {
  path: string;
  sha256: string;
  version: number;
  reportPath?: string;
  reportSha256?: string;
}

/**
 * 查找该 workflow 的验收归档（版本最高、且归档内 `workflowId` 匹配）。
 * 应用归档由 `archiveAcceptance` 生成；不存在/不匹配 ⇒ undefined（发布前置缺项，不猜）。
 */
export async function findAcceptanceArchive(input: {
  projectRoot: string;
  flowId: string;
  workflowId: string;
}): Promise<AcceptanceArchiveFacts | undefined> {
  const dir = path.join(input.projectRoot, "docs", "acceptance");
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return undefined;
  }
  const escaped = input.flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-acceptance-v(\\d+)\\.md$`);
  const candidates = names
    .map((name) => ({ name, version: Number(pattern.exec(name)?.[1] ?? Number.NaN) }))
    .filter((item) => Number.isSafeInteger(item.version) && item.version >= 1)
    .sort((a, b) => b.version - a.version);
  for (const candidate of candidates) {
    let text: string;
    try {
      text = await fs.readFile(path.join(dir, candidate.name), "utf8");
    } catch {
      continue;
    }
    const workflowLine = /^workflowId: (.+)$/m.exec(text);
    if (workflowLine === null || workflowLine[1]!.trim() !== input.workflowId) continue;
    const reportPath = /^report: (.+)$/m.exec(text)?.[1]?.trim();
    const reportSha = /^reportSha256: ([a-f0-9]{64})$/im.exec(text)?.[1];
    return {
      path: `docs/acceptance/${candidate.name}`,
      sha256: sha256Of(Buffer.from(text, "utf8")),
      version: candidate.version,
      ...(reportPath !== undefined && reportPath !== "" ? { reportPath } : {}),
      ...(reportSha !== undefined ? { reportSha256: reportSha } : {}),
    };
  }
  return undefined;
}

/**
 * A13/B4 发布前置 + preview + `release.requested`（应用自有 merge-main 通道的**呈卡前**服务）。
 *
 * 前置（MF-IR-8 / §6.4）：
 *  - 公共：workflow 在 A13/B4（或在 A12b→A13 / B3→B4 合法推进处）、basis 未漂移、当前分支=任务分支、
 *    工作区 clean（tracked 修改/删除=0；非忽略 untracked=0）、`.gitignore` hash = basis.repo 记录、
 *    同一 workflow 无开放 release；
 *  - A13：A12b accepted + `docs/acceptance/<flowId>-acceptance-vN.md` 归档已写入（**不要求** B3）；
 *  - B4：B3 accepted + 运营报告（**不要求 A12b**）；
 *  - 任一缺失 ⇒ `release-workflow-not-ready`（附路径与缺失项），**不发卡**。
 *
 * 返回 preview（应用据此构造 merge-main 非判断卡）；**本函数不构成客户确认**，执行须 `executeReleaseMerge`。
 */
export async function prepareReleaseMerge(input: PrepareReleaseMergeInput): Promise<PrepareReleaseMergeResult> {
  const now = input.now ?? (() => new Date());
  if (!isNonEmptyText(input.workflowId)) return serviceFailure("release-workflow-not-ready", "workflowId 缺失。");
  if (!isNonEmptyText(input.operationId)) return serviceFailure("release-workflow-not-ready", "operationId 缺失。");
  if (typeof input.summary !== "string" || input.summary.length > 4000) {
    return serviceFailure("release-workflow-not-ready", "summary 非法（须 ≤4000 字符的字符串）。");
  }
  for (const item of input.evidence) {
    if (!isProjectRelativePath(item.path) || !isSha256Hex(item.sha256)) {
      return serviceFailure("release-unauthorized", `evidence 条目形状非法（须项目相对路径 + 64 hex SHA-256）：${JSON.stringify(item)}`);
    }
    const actual = await readAndHash(input.projectRoot, item.path);
    if (!actual.ok || actual.sha256 !== item.sha256) {
      return serviceFailure("release-unauthorized", `证据字节 hash 不一致或不可读：${item.path}（呈卡前拒绝）。`);
    }
  }
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(ledger.events, input.workflowId);
  if (!wfEvents.some((event) => event.kind === "workflow.started")) {
    return serviceFailure("workflow-not-found", `workflow ${input.workflowId} 不存在。`);
  }
  const tasks = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, tasks.events);
  const vf = viewFailure(view);
  if (vf !== undefined) return vf;
  if (view.closed !== undefined) {
    // 已合并交付后重复 prepare ⇒ `release-already-merged`（no-op；AC-22），其余关闭如实回报。
    const mergedBefore = (await readReleaseLedger(input.projectRoot)).events.some((event) =>
      event.kind === "release.merged" && event.workflowId === input.workflowId);
    if (mergedBefore) {
      return serviceFailure("release-already-merged", `workflow ${input.workflowId} 已合并交付（${view.closed.outcome}）；no-op。`);
    }
    return serviceFailure("workflow-closed", `workflow ${input.workflowId} 已关闭（${view.closed.outcome}），不再接受发布。`);
  }
  if (view.stopping === true) {
    return serviceFailure("release-workflow-not-ready", "workflow 处于 stop 流程，不发布。", ["workflow-stopping"]);
  }

  const missing: string[] = [];
  let targetStage: "A13" | "B4";
  if (view.path === "A") {
    targetStage = "A13";
    // 以**投影状态**判定（返工后旧 stage.completed 事件不代表当前 accepted；不猜）。
    if (view.stages.A12b.status !== "completed") {
      missing.push("A12b-accepted");
    }
    const archive = await findAcceptanceArchive({
      projectRoot: input.projectRoot,
      flowId: view.flowId,
      workflowId: input.workflowId,
    });
    if (archive === undefined) {
      missing.push(`docs/acceptance/${view.flowId}-acceptance-vN.md`);
    } else if (archive.reportPath !== undefined && archive.reportSha256 !== undefined) {
      // AC-19/A13：发布前复核归档绑定的 report 字节（漂移 ⇒ basis-drift fail-closed）。
      const report = await readAndHash(input.projectRoot, archive.reportPath);
      if (!report.ok || report.sha256 !== archive.reportSha256) {
        return serviceFailure("basis-drift", `验收报告字节与归档记录不一致：${archive.reportPath}（发布前 fail-closed）。`);
      }
    }
    if (view.stage !== targetStage && !canRequestStage(view, targetStage)) missing.push(`stage:${targetStage}`);
  } else {
    targetStage = "B4";
    if (view.stages.B3.status !== "completed") {
      missing.push("B3-accepted");
    }
    if (!operatorReportedForWorkflow(tasks.records.values(), input.workflowId)) missing.push("operator-report");
    if (view.stage !== targetStage && !canRequestStage(view, targetStage)) missing.push(`stage:${targetStage}`);
  }
  if (missing.length > 0) {
    return serviceFailure(
      "release-workflow-not-ready",
      `发布前置不满足（路径 ${view.path}）：${missing.join("、")}（不发卡）。`,
      missing,
    );
  }

  // basis drift 在呈卡前拒绝（AC-19/A13/B4；关键门一致时按 G-9 节流入账 basis.verified）。
  const basis = await verifyBasisForWorkflow({ projectRoot: input.projectRoot, workflowId: input.workflowId, stage: targetStage, now });
  if (!basis.ok) return basis;

  const factsResult = await input.port.inspectRepository({ projectRoot: input.projectRoot });
  if (!factsResult.ok) return factsResult;
  const facts = factsResult.facts;
  if (!isGitOid(facts.headOid) || (facts.mainOid !== null && !isGitOid(facts.mainOid))) {
    return serviceFailure("release-workflow-not-ready", "Git 端口返回的 OID 形状非法（fail-closed）。");
  }
  const expectedBranch = taskBranchName(input.workflowId);
  const gitMissing: string[] = [];
  if (facts.branch !== expectedBranch) gitMissing.push(`branch:${facts.branch}!==${expectedBranch}`);
  if (facts.trackedChanges > 0) gitMissing.push(`worktree-tracked-dirty:${facts.trackedChanges}`);
  if (facts.untracked.length > 0) gitMissing.push(`worktree-untracked:${facts.untracked.join(",")}`);
  if (facts.gitignoreTrackedDirty) gitMissing.push("gitignore-tracked-dirty");
  if (gitMissing.length > 0) {
    return serviceFailure(
      "release-workflow-not-ready",
      `发布前置不满足（路径 ${view.path}）：任务分支/工作区不 clean（${gitMissing.join("；")}）。`,
      gitMissing,
    );
  }
  const basisRepo = await latestBasisRepoSnapshot(input.projectRoot, input.workflowId);
  const recordedGitignore = basisRepo?.gitignoreSha256;
  if (recordedGitignore !== undefined && facts.gitignoreSha256 !== recordedGitignore) {
    return serviceFailure(
      "basis-drift",
      `.gitignore 字节 hash 与 basis.repo 记录不一致：${facts.gitignoreSha256 ?? "missing"} != ${recordedGitignore}（发布前 fail-closed）。`,
    );
  }
  // AC-22/G-2：路径 B 分支可能基于非 main HEAD；preview 披露分支基点与分支↔main diff stat。
  const branchBaseOidHex = basisRepo?.baseOid ?? null;
  const nonMainBaseline = branchBaseOidHex !== null
    && (facts.mainOid === null || branchBaseOidHex !== facts.mainOid.hex);

  const tipOid = facts.headOid;
  const mainOid = facts.mainOid;
  const mergeKind: ReleaseMergeKind = mainOid === null ? "initial" : "merge";
  const releaseId = releaseIdFor(input.workflowId, tipOid);

  // 同一 workflow 无开放 release；已合并 ⇒ release-already-merged；同 tip 重复 prepare ⇒ replay。
  const releases = await readReleaseLedger(input.projectRoot);
  const releaseEvents = releases.events.filter((event) => event.workflowId === input.workflowId);
  const isTerminal = (id: string): boolean => releaseEvents.some((event) =>
    event.releaseId === id && (event.kind === "release.merged" || event.kind === "release.rejected" || event.kind === "release.failed"));
  const merged = releaseEvents.find((event): event is ReleaseMergedEvent =>
    event.kind === "release.merged" && event.tipOid.hex === tipOid.hex);
  if (merged !== undefined) {
    return serviceFailure("release-already-merged", `tip ${tipOid.hex} 已合并（no-op；不重复发布）。`);
  }
  const sameRequest = releaseEvents.find((event): event is ReleaseRequestedEvent =>
    event.kind === "release.requested" && event.releaseId === releaseId);
  const replay = sameRequest !== undefined && !isTerminal(releaseId);
  if (!replay) {
    const open = releaseEvents.find((event): event is ReleaseRequestedEvent =>
      event.kind === "release.requested" && !isTerminal(event.releaseId));
    if (open !== undefined) {
      return serviceFailure(
        "release-workflow-not-ready",
        `同一 workflow 已有开放 release（${open.releaseId}）；先处理（合并/拒绝）再发起新发布。`,
        [`open-release:${open.releaseId}`],
      );
    }
  }

  const previewResult = await input.port.previewMerge({ projectRoot: input.projectRoot, mainOid, tipOid });
  if (!previewResult.ok) return previewResult;
  const preview: ReleaseMergePreview = {
    workflowId: input.workflowId,
    flowId: view.flowId,
    releaseId,
    mainBaseOid: mainOid,
    branchTipOid: tipOid,
    branchBaseOid: branchBaseOidHex,
    nonMainBaseline,
    fileCount: previewResult.fileCount,
    diffStat: previewResult.diffStat,
    files: [...previewResult.files],
    diffDigest: previewResult.diffDigest,
    mergeKind,
    highRiskNotes: HIGH_RISK_MERGE_NOTES,
  };

  const at = now().toISOString();
  if (!replay) {
    if (view.stage !== targetStage) {
      const requestEvent: WorkflowEvent = {
        v: 1,
        at,
        schema: WORKFLOW_LEDGER_SCHEMA,
        kind: "stage.requested",
        workflowId: input.workflowId,
        flowId: view.flowId,
        path: view.path,
        idempotencyKey: stageRequestIdempotencyKey(input.workflowId, targetStage, 1),
        stage: targetStage,
        fromStage: view.stage,
        requestTaskId: `release-card:${releaseId}`,
        requestDigest: sha256Of(`release|${input.workflowId}|${tipOid.hex}`),
        attempt: 1,
      };
      const advanced = await appendWorkflowEvent(input.projectRoot, requestEvent);
      if (!advanced.ok) return serviceFailure("workflow-ledger-write-failed", `stage.requested ${targetStage} 写入失败：${advanced.message}`);
    }
    const requested: ReleaseRequestedEvent = {
      v: 1,
      at,
      schema: RELEASE_LEDGER_SCHEMA,
      kind: "release.requested",
      idempotencyKey: releaseEventIdempotencyKey("requested", input.workflowId, tipOid),
      releaseId,
      workflowId: input.workflowId,
      flowId: view.flowId,
      operationId: input.operationId,
      summary: input.summary,
      evidence: input.evidence.map((item) => ({ path: item.path, sha256: item.sha256 })),
      baseOid: mainOid,
      tipOid,
      mergeKind,
    };
    const appended = await appendReleaseEvent(input.projectRoot, requested);
    if (!appended.ok) return serviceFailure("release-ledger-write-failed", `release.requested 写入失败：${appended.message}`);
  }
  return {
    ok: true,
    releaseId,
    releaseKey: releaseIdempotencyKey(input.workflowId, tipOid),
    stage: targetStage,
    preview,
    replay,
  };
}

/** 客户本人确认（AC-14：`by` 只允许 customer；judge 只能转人工/拒绝，不得代批/冒充客户）。 */
export interface ReleaseConfirmation {
  by: "customer" | "judge";
  decisionId?: string;
}

export interface ExecuteReleaseMergeInput {
  projectRoot: string;
  workflowId: string;
  releaseId: string;
  /** 客户本人确认（缺失/`by:"judge"` ⇒ `release-unauthorized`，不进入执行、不写 confirmed）。 */
  confirmation?: ReleaseConfirmation;
  port: ReleaseGitPort;
  now?: () => Date;
}

export type ExecuteReleaseMergeResult =
  | {
      ok: true;
      releaseId: string;
      releaseKey: string;
      mergeKind: ReleaseMergeKind;
      baseOid: GitOid | null;
      tipOid: GitOid;
      mergeOid: GitOid;
      files: ReleaseFileChange[];
      diffDigest: string;
      replay: boolean;
      alreadyMerged: boolean;
      /** 已合并 no-op 成功时给出 `release-already-merged`。 */
      code?: "release-already-merged";
    }
  | WorkflowServiceFailure;

/** 发布失败/拒绝后记 `stage.blocked`（A13/B4 保持 blocked；不关闭 workflow）。 */
async function appendReleaseStageBlocked(input: {
  projectRoot: string;
  workflowId: string;
  stage: "A13" | "B4";
  code: string;
  summary: string;
  now: () => Date;
}): Promise<void> {
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(ledger.events, input.workflowId);
  if (wfEvents.length === 0) return;
  const tasks = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, tasks.events);
  if (view.blocked?.code === WORKFLOW_CORRUPT_CODE || view.closed !== undefined) return;
  if (view.stage !== input.stage || view.stages[input.stage].status === "completed") return;
  const attempt = Math.max(1, view.stages[input.stage].attempt ?? 1);
  const event: WorkflowEvent = {
    v: 1,
    at: input.now().toISOString(),
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "stage.blocked",
    workflowId: input.workflowId,
    flowId: view.flowId,
    path: view.path,
    idempotencyKey: `stage-block:${input.workflowId}:${input.stage}:${attempt}:${input.code}`,
    stage: input.stage,
    code: input.code,
    summary: input.summary,
    attempt,
  };
  await appendWorkflowEvent(input.projectRoot, event);
}

/** 成功合并后的 A13/B4 完成 + workflow.closed delivered（§4.5：release.merged → 交付关闭）。 */
async function completeReleaseWorkflow(input: {
  projectRoot: string;
  workflowId: string;
  stage: "A13" | "B4";
  releaseId: string;
  now: () => Date;
}): Promise<WorkflowServiceFailure | undefined> {
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(ledger.events, input.workflowId);
  const tasks = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, tasks.events);
  const vf = viewFailure(view);
  if (vf !== undefined) return vf;
  if (view.closed !== undefined) {
    return view.closed.outcome === "delivered"
      ? undefined
      : serviceFailure("workflow-closed", `workflow ${input.workflowId} 已关闭（${view.closed.outcome}）。`);
  }
  if (view.stage !== input.stage) {
    return serviceFailure(
      "release-workflow-not-ready",
      `发布完成前置不满足：当前阶段 ${view.stage}(${view.stages[view.stage].status})，要求 ${input.stage}。`,
      [`stage:${input.stage}`],
    );
  }
  const at = input.now().toISOString();
  if (view.stage === input.stage && view.stages[input.stage].status !== "completed" && canCompleteStage(view, input.stage)) {
    const completion: WorkflowEvent = {
      v: 1,
      at,
      schema: WORKFLOW_LEDGER_SCHEMA,
      kind: "stage.completed",
      workflowId: input.workflowId,
      flowId: view.flowId,
      path: view.path,
      idempotencyKey: `stage-complete:${input.workflowId}:${input.stage}:${input.releaseId}`,
      stage: input.stage,
      cause: { kind: "release-merged", ref: input.releaseId },
      artifacts: [{ path: RELEASES_STATE_REL, kind: "release-ledger" }],
    };
    const appended = await appendWorkflowEvent(input.projectRoot, completion);
    if (!appended.ok) return serviceFailure("workflow-ledger-write-failed", `stage.completed ${input.stage} 写入失败：${appended.message}`);
  }
  const reason = `release ${input.releaseId} merged`;
  const closed: WorkflowEvent = {
    v: 1,
    at,
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "workflow.closed",
    workflowId: input.workflowId,
    flowId: view.flowId,
    path: view.path,
    idempotencyKey: `workflow-close:${input.workflowId}:delivered:${reasonDigest(reason)}`,
    outcome: "delivered",
    reason,
    releaseId: input.releaseId,
  };
  const appended = await appendWorkflowEvent(input.projectRoot, closed);
  if (!appended.ok) return serviceFailure("workflow-ledger-write-failed", `workflow.closed delivered 写入失败：${appended.message}`);
  return undefined;
}

/**
 * 执行合并 main（AC-22）：**必须先有客户本人确认**（judge/缺失 ⇒ `release-unauthorized`）。
 *
 * - 应用执行固定 argv（端口实现）；main unborn ⇒ `mergeKind:"initial"`；main 存在 ⇒ `merge --no-ff`；
 * - 冲突/失败 ⇒ `release.failed` + `stage.blocked`，返回 `release-merge-conflict` 等；**不 force/reset/clean**；
 * - 成功 ⇒ `release.merged`（baseOid/tipOid/mergeOid/files/diffDigest）+ `stage.completed A13|B4` +
 *   `workflow.closed delivered`；**不 push/tag/发布产物**；
 * - 幂等 `release:<workflowId>:<tipOid>`；已合并 ⇒ no-op 成功（`release-already-merged`）。
 */
export async function executeReleaseMerge(input: ExecuteReleaseMergeInput): Promise<ExecuteReleaseMergeResult> {
  const now = input.now ?? (() => new Date());
  if (!isNonEmptyText(input.workflowId)) return serviceFailure("release-workflow-not-ready", "workflowId 缺失。");
  if (!isNonEmptyText(input.releaseId)) return serviceFailure("release-workflow-not-ready", "releaseId 缺失。");
  const releases = await readReleaseLedger(input.projectRoot);
  const releaseEvents = releases.events.filter((event) =>
    event.workflowId === input.workflowId && event.releaseId === input.releaseId);
  const mergedEvent = releaseEvents.find((event): event is ReleaseMergedEvent => event.kind === "release.merged");
  if (mergedEvent !== undefined) {
    return {
      ok: true,
      releaseId: mergedEvent.releaseId,
      releaseKey: releaseIdempotencyKey(input.workflowId, mergedEvent.tipOid),
      mergeKind: mergedEvent.mergeKind,
      baseOid: mergedEvent.baseOid,
      tipOid: mergedEvent.tipOid,
      mergeOid: mergedEvent.mergeOid,
      files: mergedEvent.files,
      diffDigest: mergedEvent.diffDigest,
      replay: true,
      alreadyMerged: true,
      code: "release-already-merged",
    };
  }
  const rejectedEvent = releaseEvents.find((event): event is ReleaseRejectedEvent => event.kind === "release.rejected");
  if (rejectedEvent !== undefined) {
    return serviceFailure("release-rejected", `release ${input.releaseId} 已被拒绝（${rejectedEvent.by}），不执行合并。`);
  }
  const requested = releaseEvents.find((event): event is ReleaseRequestedEvent => event.kind === "release.requested");
  if (requested === undefined) {
    return serviceFailure("release-workflow-not-ready", `release ${input.releaseId} 无 release.requested（先 prepare）。`, ["release.requested"]);
  }
  // AC-14/MF-IR-8：客户本人唯一有效来源；judge 不得 approve/代批/冒充客户。
  const confirmation = input.confirmation;
  if (confirmation === undefined || confirmation.by !== "customer") {
    return serviceFailure(
      "release-unauthorized",
      "合并 main 未被授权：必须由客户本人在 merge-main 高风险确认卡确认；judge 只能转人工/拒绝，不得代批。",
      ["customer-confirmation"],
    );
  }

  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(ledger.events, input.workflowId);
  if (wfEvents.length === 0) return serviceFailure("workflow-not-found", `workflow ${input.workflowId} 不存在。`);
  const tasks = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, tasks.events);
  const vf = viewFailure(view);
  if (vf !== undefined) return vf;
  if (view.closed !== undefined) {
    return serviceFailure("workflow-closed", `workflow ${input.workflowId} 已关闭（${view.closed.outcome}），不执行合并。`);
  }
  if (view.stopping === true) {
    return serviceFailure("release-workflow-not-ready", "workflow 处于 stop 流程，不执行合并。", ["workflow-stopping"]);
  }
  const targetStage: "A13" | "B4" = view.path === "A" ? "A13" : "B4";
  if (view.stage !== targetStage) {
    return serviceFailure(
      "release-workflow-not-ready",
      `发布当前阶段为 ${view.stage}(${view.stages[view.stage].status})，要求 ${targetStage}（先 prepareReleaseMerge 推进）。`,
      [`stage:${targetStage}`],
    );
  }

  // 呈卡后、执行前的最后复核：basis 漂移 / 分支或 tip 漂移 / 工作区 dirty ⇒ 拒绝（不合并）。
  const basis = await verifyBasisForWorkflow({ projectRoot: input.projectRoot, workflowId: input.workflowId, stage: targetStage, now });
  if (!basis.ok) return basis;
  const factsResult = await input.port.inspectRepository({ projectRoot: input.projectRoot });
  if (!factsResult.ok) return factsResult;
  const facts = factsResult.facts;
  const branch = taskBranchName(input.workflowId);
  const drift: string[] = [];
  if (facts.branch !== branch) drift.push(`branch:${facts.branch}!==${branch}`);
  if (facts.headOid.hex !== requested.tipOid.hex) drift.push(`tip:${facts.headOid.hex}!==${requested.tipOid.hex}`);
  if (facts.trackedChanges > 0) drift.push(`worktree-tracked-dirty:${facts.trackedChanges}`);
  if (facts.untracked.length > 0) drift.push(`worktree-untracked:${facts.untracked.join(",")}`);
  if (drift.length > 0) {
    return serviceFailure("release-workflow-not-ready", `执行前复核失败（分支/tip/工作区漂移）：${drift.join("；")}`, drift);
  }

  const at = now().toISOString();
  const confirmed: ReleaseConfirmedEvent = {
    v: 1,
    at,
    schema: RELEASE_LEDGER_SCHEMA,
    kind: "release.confirmed",
    idempotencyKey: releaseEventIdempotencyKey("confirmed", input.workflowId, requested.tipOid),
    releaseId: requested.releaseId,
    workflowId: input.workflowId,
    flowId: requested.flowId,
    by: "customer",
    ...(confirmation.decisionId !== undefined ? { decisionId: confirmation.decisionId } : {}),
  };
  const confirmedWrite = await appendReleaseEvent(input.projectRoot, confirmed);
  if (!confirmedWrite.ok) return serviceFailure("release-ledger-write-failed", `release.confirmed 写入失败：${confirmedWrite.message}`);

  const outcome = await input.port.mergeMain({
    projectRoot: input.projectRoot,
    workflowId: input.workflowId,
    flowId: requested.flowId,
    branch,
    baseOid: requested.baseOid,
    tipOid: requested.tipOid,
    mergeKind: requested.mergeKind,
  });
  if (!outcome.ok) {
    const failureCode = outcome.code !== "" ? outcome.code : "release-merge-failed";
    const failed: ReleaseFailedEvent = {
      v: 1,
      at: now().toISOString(),
      schema: RELEASE_LEDGER_SCHEMA,
      kind: "release.failed",
      idempotencyKey: releaseEventIdempotencyKey("failed", input.workflowId, requested.tipOid, failureCode),
      releaseId: requested.releaseId,
      workflowId: input.workflowId,
      flowId: requested.flowId,
      code: failureCode,
      summary: outcome.message,
      baseOid: requested.baseOid,
      tipOid: requested.tipOid,
    };
    const failedWrite = await appendReleaseEvent(input.projectRoot, failed);
    if (!failedWrite.ok) return serviceFailure("release-ledger-write-failed", `release.failed 写入失败：${failedWrite.message}`);
    await appendReleaseStageBlocked({
      projectRoot: input.projectRoot,
      workflowId: input.workflowId,
      stage: targetStage,
      code: failureCode,
      summary: outcome.message,
      now,
    });
    return serviceFailure(failureCode, outcome.message, outcome.missing);
  }
  // 端口回执 fail-closed 校验（tip/kind/base 必须与请求一致）。
  const receiptIssue = ((): string | undefined => {
    if (!isGitOid(outcome.tipOid) || !isGitOid(outcome.mergeOid) || (outcome.baseOid !== null && !isGitOid(outcome.baseOid))) {
      return "Git 端口返回的 OID 形状非法";
    }
    if (outcome.tipOid.hex !== requested.tipOid.hex) return `合并回执 tip OID 不一致（${outcome.tipOid.hex} != ${requested.tipOid.hex}）`;
    if (outcome.mergeKind !== requested.mergeKind) return `合并回执 mergeKind 不一致（${outcome.mergeKind} != ${requested.mergeKind}）`;
    if (requested.mergeKind === "initial" && outcome.baseOid !== null) return "initial 合并回执 baseOid 应为 null";
    if (requested.mergeKind === "merge" && (outcome.baseOid === null || outcome.baseOid.hex !== requested.baseOid?.hex)) {
      return "merge 合并回执 baseOid 与请求不一致";
    }
    return undefined;
  })();
  if (receiptIssue !== undefined) {
    const failed: ReleaseFailedEvent = {
      v: 1,
      at: now().toISOString(),
      schema: RELEASE_LEDGER_SCHEMA,
      kind: "release.failed",
      idempotencyKey: releaseEventIdempotencyKey("failed", input.workflowId, requested.tipOid, "release-merge-failed"),
      releaseId: requested.releaseId,
      workflowId: input.workflowId,
      flowId: requested.flowId,
      code: "release-merge-failed",
      summary: receiptIssue,
      baseOid: requested.baseOid,
      tipOid: requested.tipOid,
    };
    const failedWrite = await appendReleaseEvent(input.projectRoot, failed);
    if (!failedWrite.ok) return serviceFailure("release-ledger-write-failed", `release.failed 写入失败：${failedWrite.message}`);
    await appendReleaseStageBlocked({
      projectRoot: input.projectRoot,
      workflowId: input.workflowId,
      stage: targetStage,
      code: "release-merge-failed",
      summary: receiptIssue,
      now,
    });
    return serviceFailure("release-merge-failed", receiptIssue);
  }

  const merged: ReleaseMergedEvent = {
    v: 1,
    at: now().toISOString(),
    schema: RELEASE_LEDGER_SCHEMA,
    kind: "release.merged",
    idempotencyKey: releaseEventIdempotencyKey("merged", input.workflowId, requested.tipOid),
    releaseId: requested.releaseId,
    workflowId: input.workflowId,
    flowId: requested.flowId,
    baseOid: outcome.baseOid,
    tipOid: outcome.tipOid,
    mergeOid: outcome.mergeOid,
    mergeKind: outcome.mergeKind,
    files: outcome.files.map((file) => ({ path: file.path, status: file.status })),
    diffDigest: outcome.diffDigest,
  };
  const mergedWrite = await appendReleaseEvent(input.projectRoot, merged);
  if (!mergedWrite.ok) return serviceFailure("release-ledger-write-failed", `release.merged 写入失败：${mergedWrite.message}`);
  const completion = await completeReleaseWorkflow({
    projectRoot: input.projectRoot,
    workflowId: input.workflowId,
    stage: targetStage,
    releaseId: requested.releaseId,
    now,
  });
  if (completion !== undefined) return completion;
  return {
    ok: true,
    releaseId: requested.releaseId,
    releaseKey: releaseIdempotencyKey(input.workflowId, requested.tipOid),
    mergeKind: merged.mergeKind,
    baseOid: merged.baseOid,
    tipOid: merged.tipOid,
    mergeOid: merged.mergeOid,
    files: merged.files,
    diffDigest: merged.diffDigest,
    replay: mergedWrite.replay,
    alreadyMerged: mergedWrite.replay,
    ...(mergedWrite.replay ? { code: "release-already-merged" as const } : {}),
  };
}

export interface RejectReleaseMergeInput {
  projectRoot: string;
  workflowId: string;
  releaseId: string;
  /** 客户本人拒绝，或 judge 转人工/拒绝（judge 不得 approve/冒充客户）。 */
  by: "customer" | "judge";
  reason?: string;
  now?: () => Date;
}

export type RejectReleaseMergeResult =
  | { ok: true; releaseId: string; by: "customer" | "judge"; replay: boolean; eventId: string }
  | WorkflowServiceFailure;

/** 拒绝发布（客户本人或 judge 转人工/拒绝）：写 `release.rejected`；A13/B4 保持 blocked；不合并。 */
export async function rejectReleaseMerge(input: RejectReleaseMergeInput): Promise<RejectReleaseMergeResult> {
  const now = input.now ?? (() => new Date());
  if (input.by !== "customer" && input.by !== "judge") {
    return serviceFailure("release-unauthorized", `拒绝来源非法：${String(input.by)}（只允许 customer/judge）。`);
  }
  if (!isNonEmptyText(input.workflowId) || !isNonEmptyText(input.releaseId)) {
    return serviceFailure("release-workflow-not-ready", "workflowId/releaseId 缺失。");
  }
  const releases = await readReleaseLedger(input.projectRoot);
  const releaseEvents = releases.events.filter((event) =>
    event.workflowId === input.workflowId && event.releaseId === input.releaseId);
  const mergedEvent = releaseEvents.find((event) => event.kind === "release.merged");
  if (mergedEvent !== undefined) {
    return serviceFailure("release-already-merged", `release ${input.releaseId} 已合并，不能拒绝。`);
  }
  const requested = releaseEvents.find((event): event is ReleaseRequestedEvent => event.kind === "release.requested");
  if (requested === undefined) {
    return serviceFailure("release-workflow-not-ready", `release ${input.releaseId} 无 release.requested。`, ["release.requested"]);
  }
  const existing = releaseEvents.find((event) => event.kind === "release.rejected");
  if (existing !== undefined) {
    return { ok: true, releaseId: input.releaseId, by: input.by, replay: true, eventId: existing.idempotencyKey };
  }
  const rejected: ReleaseRejectedEvent = {
    v: 1,
    at: now().toISOString(),
    schema: RELEASE_LEDGER_SCHEMA,
    kind: "release.rejected",
    idempotencyKey: releaseEventIdempotencyKey("rejected", input.workflowId, requested.tipOid),
    releaseId: input.releaseId,
    workflowId: input.workflowId,
    flowId: requested.flowId,
    by: input.by,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
  };
  const appended = await appendReleaseEvent(input.projectRoot, rejected);
  if (!appended.ok) return serviceFailure("release-ledger-write-failed", `release.rejected 写入失败：${appended.message}`);
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(ledger.events, input.workflowId);
  const started = wfEvents.find((event) => event.kind === "workflow.started");
  const targetStage: "A13" | "B4" = started !== undefined && started.kind === "workflow.started" && started.path === "B" ? "B4" : "A13";
  await appendReleaseStageBlocked({
    projectRoot: input.projectRoot,
    workflowId: input.workflowId,
    stage: targetStage,
    code: "release-rejected",
    summary: input.reason ?? `release ${input.releaseId} 被拒绝（${input.by}）`,
    now,
  });
  return { ok: true, releaseId: input.releaseId, by: input.by, replay: appended.replay, eventId: appended.event.idempotencyKey };
}

// —————————————— 基线 / 路径 B（AC-10/AC-15/AC-16/T-07/T-12） ——————————————

/** 基线 Git 端口（桌面 B3 注入真实实现；固定 argv/sanitized env；测试注入 fake）。 */
export interface BaselineGitPort {
  /**
   * A9：`.git` 不存在 ⇒ `git init -b main`（allowInit=true）/ 路径 B ⇒ 缺失返回 `b-repository-required`
   * （allowInit=false，不自动 init）；父仓库 ⇒ `baseline-parent-repository-detected`；
   * worktree `.git` 文件 ⇒ existing（不修改）。
   */
  ensureRepository(request: { projectRoot: string; allowInit: boolean }): Promise<
    { ok: true; repository: BaselineGitRepositoryState } | WorkflowServiceFailure
  >;
  /** `.gitignore` ans-managed 块 + 仅该文件的 baseline commit；被跟踪且 dirty ⇒ `baseline-gitignore-dirty`。 */
  ensureGitignore(request: { projectRoot: string }): Promise<
    { ok: true; changed: boolean; committed: boolean; sha256: string } | WorkflowServiceFailure
  >;
  /** 工作区 dirty：tracked 修改/删除数 + 非忽略 untracked（`.gitignore` 过滤后）。 */
  inspectWorktree(request: { projectRoot: string; branch?: string }): Promise<
    { ok: true; branch: string; trackedChanges: number; untracked: string[] } | WorkflowServiceFailure
  >;
  /** 任务分支 `ans/task/<workflowId>` 创建/复用/切换（base=head|main）；同名他属分支 ⇒ `baseline-branch-exists`。 */
  prepareTaskBranch(request: { projectRoot: string; workflowId: string; base: "head" | "main"; allowReuse: boolean }): Promise<
    { ok: true; branch: string; baseOid: GitOid | null; reused: boolean } | WorkflowServiceFailure
  >;
}

export interface BaselineGitRepositoryState {
  state: "initialized" | "existing";
  branch: string;
  baseOid: GitOid | null;
  mainUnborn: boolean;
  initialBranch: string;
  objectFormat?: "sha1" | "sha256";
  identityDefaultsApplied?: boolean;
}

/** 基线 Git 准备回执（应用 `complete_team_plan` v4 回执与 basis.repo 来源）。 */
export interface BaselineGitReceipt {
  state: "initialized" | "existing";
  branch: string;
  headOid: GitOid | null;
  mainUnborn: boolean;
  gitignoreSha256: string;
  gitignoreChanged: boolean;
  gitignoreCommitted: boolean;
  branchReused: boolean;
  identityDefaultsApplied?: boolean;
}

/** 该 workflow 是否已在 basis 记录中拥有任务分支（§5.2 G-8：允许复用自有分支）。 */
async function workflowOwnsTaskBranch(projectRoot: string, workflowId: string, branch: string): Promise<boolean> {
  const ledger = await readBasisLedger(projectRoot);
  return ledger.events.some((event) =>
    (event.kind === "basis.recorded" || event.kind === "basis.amended")
    && event.workflowId === workflowId
    && event.repo?.branch === branch);
}

/** 基线/路径 B 的最小 Git 准备（§5.2/§4.3 MF-12；由 `recordBasis` 在文档校验后调用）。 */
async function prepareBaselineGit(input: {
  projectRoot: string;
  workflowId: string;
  reason: "baseline" | "path-b" | "amendment";
  port: BaselineGitPort;
}): Promise<{ ok: true; repo: WorkflowRepoSnapshot; receipt: BaselineGitReceipt } | WorkflowServiceFailure> {
  const repository = await input.port.ensureRepository({
    projectRoot: input.projectRoot,
    allowInit: input.reason === "baseline",
  });
  if (!repository.ok) return repository;
  const gitignore = await input.port.ensureGitignore({ projectRoot: input.projectRoot });
  if (!gitignore.ok) return gitignore;
  const worktree = await input.port.inspectWorktree({ projectRoot: input.projectRoot });
  if (!worktree.ok) return worktree;
  const dirty: string[] = [];
  if (worktree.trackedChanges > 0) dirty.push(`tracked:${worktree.trackedChanges}`);
  if (worktree.untracked.length > 0) dirty.push(`untracked:${worktree.untracked.join(",")}`);
  if (dirty.length > 0) {
    return serviceFailure(
      "baseline-repository-dirty",
      `工作区 dirty（${dirty.join("；")}）；不 stash/reset/clean，请人工处理（治理文档/.ans/node_modules 被 ignore 不计）。`,
      dirty,
    );
  }
  const expectedBranch = taskBranchName(input.workflowId);
  const allowReuse = await workflowOwnsTaskBranch(input.projectRoot, input.workflowId, expectedBranch);
  const branchResult = await input.port.prepareTaskBranch({
    projectRoot: input.projectRoot,
    workflowId: input.workflowId,
    base: input.reason === "baseline" ? "main" : "head",
    allowReuse,
  });
  if (!branchResult.ok) return branchResult;
  if (branchResult.branch !== expectedBranch) {
    return serviceFailure(
      "baseline-branch-exists",
      `任务分支名不一致（${branchResult.branch} != ${expectedBranch}）；不删除/不强推，要求新 workflowId 或人工核对。`,
    );
  }
  const baseOidHex = branchResult.baseOid !== null ? branchResult.baseOid.hex : null;
  const repo: WorkflowRepoSnapshot = {
    state: repository.repository.state,
    branch: branchResult.branch,
    baseOid: baseOidHex,
    headOid: baseOidHex,
    mainUnborn: repository.repository.mainUnborn,
    initialBranch: repository.repository.initialBranch,
    ignorePolicy: "ans-v1",
    gitignoreSha256: gitignore.sha256,
    ...(repository.repository.objectFormat !== undefined ? { objectFormat: repository.repository.objectFormat } : {}),
    ...(repository.repository.identityDefaultsApplied === true ? { identityDefaultsApplied: true } : {}),
  };
  const receipt: BaselineGitReceipt = {
    state: repository.repository.state,
    branch: branchResult.branch,
    headOid: branchResult.baseOid,
    mainUnborn: repository.repository.mainUnborn,
    gitignoreSha256: gitignore.sha256,
    gitignoreChanged: gitignore.changed,
    gitignoreCommitted: gitignore.committed,
    branchReused: branchResult.reused,
    ...(repository.repository.identityDefaultsApplied === true ? { identityDefaultsApplied: true } : {}),
  };
  return { ok: true, repo, receipt };
}

/** 基线失败事件：`stage.blocked` A9（带 code/summary/attempt；AC-16）。 */
async function appendBaselineBlocked(input: {
  projectRoot: string;
  workflowId: string;
  code: string;
  summary: string;
  now: () => Date;
}): Promise<void> {
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(ledger.events, input.workflowId);
  if (wfEvents.length === 0) return;
  const tasks = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, tasks.events);
  if (view.blocked?.code === WORKFLOW_CORRUPT_CODE || view.closed !== undefined) return;
  const stage: WorkflowStage = view.path === "B" ? "B1" : "A9";
  if (view.stage !== stage || view.stages[stage].status === "completed") return;
  const attempt = Math.max(1, view.stages[stage].attempt ?? 1);
  const event: WorkflowEvent = {
    v: 1,
    at: input.now().toISOString(),
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "stage.blocked",
    workflowId: input.workflowId,
    flowId: view.flowId,
    path: view.path,
    idempotencyKey: `stage-block:${input.workflowId}:${stage}:${attempt}:${input.code}`,
    stage,
    code: input.code,
    summary: input.summary,
    attempt,
  };
  await appendWorkflowEvent(input.projectRoot, event);
}

/** `complete_team_plan` v4 fixed 输入（v1.3 §5.1；运营专属；应用执行顺序编排）。 */
export interface CompleteTeamPlanFixedInput {
  projectRoot: string;
  flowId: string;
  workflowId: string;
  operationId: string;
  plan: { path: string; version?: number; sha256?: string };
  /** 真实 Git 端口（桌面 B3 注入；不注入则只做文档校验+记账，不满足基线 3 件小事）。 */
  port: BaselineGitPort;
  /** host 绑定的调用角色（complete_team_plan 为运营专属；提供且非 convener ⇒ `baseline-identity-invalid`）。 */
  actorRoleId?: string;
  /** legacy 字段：fixed 路径出现即 `baseline-legacy-field-forbidden`（§5.1）。 */
  runId?: string;
  baseDigest?: string;
  now?: () => Date;
}

export type CompleteTeamPlanFixedResult =
  | {
      ok: true;
      operationId: string;
      flowId: string;
      workflowId: string;
      basisId: string;
      plan: { path: string; version: number; sha256: string };
      git?: BaselineGitReceipt;
      documents: BasisDocumentView[];
      replay: boolean;
      stageCompleted: boolean;
    }
  | WorkflowServiceFailure;

/**
 * `complete_team_plan` v4（A9）应用服务：legacy 字段拒绝 → 文档/团队计划校验 → Git 最小准备
 * （git init -b main/.gitignore+baseline commit/任务分支/dirty）→ `basis.recorded` → `stage.completed A9`。
 * 失败写 `stage.blocked A9`（code/summary/attempt）、不产生客户卡；同幂等键 replay 返回原回执。
 */
export async function completeTeamPlanFixed(input: CompleteTeamPlanFixedInput): Promise<CompleteTeamPlanFixedResult> {
  const now = input.now ?? (() => new Date());
  const fail = async (failure: WorkflowServiceFailure): Promise<CompleteTeamPlanFixedResult> => {
    await appendBaselineBlocked({
      projectRoot: input.projectRoot,
      workflowId: input.workflowId,
      code: failure.code,
      summary: failure.message,
      now,
    });
    return failure;
  };
  if (input.runId !== undefined || input.baseDigest !== undefined) {
    return fail(serviceFailure(
      "baseline-legacy-field-forbidden",
      "fixed 路径不接受 legacy 字段 runId/baseDigest（出现即拒绝；旧字段仅 legacy 兼容）。",
      ["runId/baseDigest"],
    ));
  }
  if (input.actorRoleId !== undefined && input.actorRoleId !== "convener") {
    return fail(serviceFailure(
      "baseline-identity-invalid",
      `complete_team_plan 为运营（convener）专属；调用角色 ${input.actorRoleId} 不允许。`,
    ));
  }
  if (input.plan === undefined || !isProjectRelativePath(input.plan.path)) {
    return fail(serviceFailure("baseline-team-plan-invalid", "plan.path 非法（须项目相对 docs/scheduling/<flowId>-team-vN.md）。"));
  }
  const recorded = await recordBasis({
    projectRoot: input.projectRoot,
    flowId: input.flowId,
    workflowId: input.workflowId,
    operationId: input.operationId,
    planPath: input.plan.path,
    ...(input.plan.version !== undefined ? { planVersion: input.plan.version } : {}),
    ...(input.plan.sha256 !== undefined ? { planSha256: input.plan.sha256 } : {}),
    port: input.port,
    reason: "baseline",
    now,
  });
  if (!recorded.ok) {
    await appendBaselineBlocked({
      projectRoot: input.projectRoot,
      workflowId: input.workflowId,
      code: recorded.code,
      summary: recorded.message,
      now,
    });
    return recorded;
  }
  if (recorded.teamPlan === undefined) {
    return serviceFailure("baseline-team-plan-invalid", "团队计划发现结果缺失（baseline 必须记录 teamPlan）。");
  }
  return {
    ok: true,
    operationId: input.operationId,
    flowId: input.flowId,
    workflowId: input.workflowId,
    basisId: recorded.basisId,
    plan: recorded.teamPlan,
    ...(recorded.git !== undefined ? { git: recorded.git } : {}),
    documents: recorded.documents,
    replay: recorded.replay,
    stageCompleted: recorded.stageCompleted,
  };
}

export interface PreparePathBStartInput {
  projectRoot: string;
  flowId: string;
  workflowId: string;
  operationId: string;
  /** 既有仓库端口（路径 B 不自动 init；无仓库 ⇒ `b-repository-required`）。 */
  port: BaselineGitPort;
  now?: () => Date;
}

export type PreparePathBStartResult =
  | {
      ok: true;
      workflowId: string;
      basisId: string;
      repository: BaselineGitReceipt;
      documents: BasisDocumentView[];
      replay: boolean;
    }
  | WorkflowServiceFailure;

/**
 * 路径 B 最小准备（B1 派发时；v1.3 §4.3 MF-12）：**既有 Git 仓库**（无仓库 ⇒ `b-repository-required`，
 * 不自动 init）、`.gitignore` 托管块/baseline commit、从当前 HEAD 创建/复用 `ans/task/<workflowId>`、
 * dirty 检查，`basis.recorded(reason:"path-b")`（只读文档快照、不产生写权、不写团队计划、不弹卡）。
 */
export async function preparePathBStart(input: PreparePathBStartInput): Promise<PreparePathBStartResult> {
  const now = input.now ?? (() => new Date());
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(ledger.events, input.workflowId);
  const started = wfEvents.find((event) => event.kind === "workflow.started");
  if (started === undefined || started.kind !== "workflow.started") {
    return serviceFailure("workflow-not-found", `workflow ${input.workflowId} 不存在。`);
  }
  if (started.path !== "B") {
    return serviceFailure("stage-transition-invalid", "preparePathBStart 只适用于路径 B workflow。");
  }
  const tasks = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, tasks.events);
  const vf = viewFailure(view);
  if (vf !== undefined) return vf;
  if (view.closed !== undefined) return serviceFailure("workflow-closed", `workflow ${input.workflowId} 已关闭。`);
  if (view.stage !== "B1" && view.stage !== "B2") {
    return serviceFailure("stage-transition-invalid", `路径 B 准备非法阶段：当前 ${view.stage}；要求 B1/B2。`);
  }
  const recorded = await recordBasis({
    projectRoot: input.projectRoot,
    flowId: input.flowId,
    workflowId: input.workflowId,
    operationId: input.operationId,
    port: input.port,
    reason: "path-b",
    now,
  });
  if (!recorded.ok) {
    await appendBaselineBlocked({
      projectRoot: input.projectRoot,
      workflowId: input.workflowId,
      code: recorded.code,
      summary: recorded.message,
      now,
    });
    return recorded;
  }
  if (recorded.git === undefined) {
    return serviceFailure("b-repository-required", "路径 B 需要既有 Git 仓库与端口回执（不自动 init）。");
  }
  return {
    ok: true,
    workflowId: input.workflowId,
    basisId: recorded.basisId,
    repository: recorded.git,
    documents: recorded.documents,
    replay: recorded.replay,
  };
}

/** 每角色有效写集（B3 派发/提交门禁用；来源 = scope.files ∩ roster 模块属主 / 边界）。 */
export interface PathBWriteSet {
  roleId: string;
  paths: string[];
}

const GOVERNANCE_DOC_PREFIXES: readonly string[] = Object.freeze([
  "docs/product/", "docs/proposals/", "docs/contracts/", "docs/scheduling/", "docs/intents/",
  "docs/governance/", "docs/audit/", "docs/quality/", "docs/verification/", "docs/acceptance/",
  "docs/skills/", "docs/mcp/",
]);

function isGovernanceDocPath(candidate: string): boolean {
  return GOVERNANCE_DOC_PREFIXES.some((prefix) => candidate.startsWith(prefix));
}

function normalizeScopePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/\\/g, "/");
  if (text === "") return undefined;
  if (text.startsWith("/") || /^[a-zA-Z]:/.test(text)) return undefined;
  const segments = text.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
  return segments.join("/");
}

function moduleContainsPath(modulePath: string, candidate: string): boolean {
  if (modulePath.endsWith("/")) {
    const root = modulePath.slice(0, -1);
    return candidate === root || candidate.startsWith(modulePath);
  }
  return candidate === modulePath;
}

function boundaryContainsPath(entries: readonly BoundaryEntry[], candidate: string): boolean {
  return entries.some((entry) => {
    if (entry.root !== "project" || entry.kind === "conditional-directory") return false;
    if (entry.kind === "directory") {
      return candidate === entry.path || candidate.startsWith(`${entry.path}/`);
    }
    return candidate === entry.path;
  });
}

/** 无 roster 旧项目：从 `角色卡/<role>/boundary.yaml|md` 读取项目边界（只读）。 */
async function loadProjectRoleBoundaries(projectRoot: string): Promise<Map<string, BoundaryEntry[]>> {
  const result = new Map<string, BoundaryEntry[]>();
  let names: string[];
  try {
    names = await fs.readdir(path.join(projectRoot, "角色卡"));
  } catch {
    return result;
  }
  for (const roleId of names) {
    if (roleId === "governance-boundary.yaml" || roleId.startsWith(".")) continue;
    const yamlRel = `角色卡/${roleId}/boundary.yaml`;
    try {
      const text = await fs.readFile(path.join(projectRoot, ...yamlRel.split("/")), "utf8");
      result.set(roleId, parseBoundaryYaml(text));
      continue;
    } catch {
      /* 无 yaml ⇒ 尝试 md */
    }
    const mdRel = `角色卡/${roleId}/boundary.md`;
    try {
      const text = await fs.readFile(path.join(projectRoot, ...mdRel.split("/")), "utf8");
      result.set(roleId, parseBoundarySection1(text, "project"));
    } catch {
      /* 无边界文件 ⇒ 不列 */
    }
  }
  return result;
}

export interface DerivePathBWriteSetsInput {
  projectRoot: string;
  flowId: string;
  workflowId: string;
  /** B2 `change.scope-decided.scope.files`（候选路径；应用解析属主，不采信模型自报模块/属主）。 */
  scopeFiles: readonly string[];
}

export type DerivePathBWriteSetsResult =
  | {
      ok: true;
      writesets: PathBWriteSet[];
      source: "roster" | "boundary";
      roster?: { path: string; sha256: string };
    }
  | WorkflowServiceFailure;

/**
 * 派生 B3 每角色有效写集（v1.3 §4.3 MF-8）：
 *  - 有 roster：scope.files → 名单模块路径前缀匹配 → 模块属主角色（一模块一属主；无/多属主 ⇒
 *    `b-change-scope-invalid`）；治理文档仅允许策划/产品属主（否则 `b-change-scope-requires-rapporteur`）；
 *  - 无 roster：按 `角色卡/<role>/boundary.*` 项目边界解析（唯一属主；无法唯一归属 ⇒ `b-change-scope-invalid`，
 *    要求走路径 A）；`.ans/**`、`角色卡/**` 永不进入实现写集。
 */
export async function derivePathBWriteSets(input: DerivePathBWriteSetsInput): Promise<DerivePathBWriteSetsResult> {
  const flowId = typeof input.flowId === "string" ? input.flowId.trim() : "";
  if (!isWorkflowSlug(flowId)) return serviceFailure("b-change-scope-invalid", `flowId 非法：${String(input.flowId)}`);
  if (!isNonEmptyText(input.workflowId)) return serviceFailure("b-change-scope-invalid", "workflowId 缺失。");
  if (!Array.isArray(input.scopeFiles) || input.scopeFiles.length === 0) {
    return serviceFailure("b-change-scope-invalid", "scope.files 为空：B3 写集来源缺失（要求至少一个候选路径）。", ["scope.files"]);
  }
  const normalized: string[] = [];
  for (const raw of input.scopeFiles) {
    const candidate = normalizeScopePath(raw);
    if (candidate === undefined) return serviceFailure("b-change-scope-invalid", `scope 路径非法：${String(raw)}`);
    if (candidate === ".ans" || candidate.startsWith(".ans/")) {
      return serviceFailure("b-change-scope-invalid", `.ans/** 属应用写区，不得纳入实现写集：${candidate}`);
    }
    if (candidate === "角色卡" || candidate.startsWith("角色卡/")) {
      return serviceFailure("b-change-scope-invalid", `角色卡/** 属角色/人事写区，不得纳入实现写集：${candidate}`);
    }
    if (!normalized.includes(candidate)) normalized.push(candidate);
  }
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(ledger.events, input.workflowId);
  const started = wfEvents.find((event) => event.kind === "workflow.started");
  if (started === undefined || started.kind !== "workflow.started") {
    return serviceFailure("workflow-not-found", `workflow ${input.workflowId} 不存在。`);
  }
  if (started.path !== "B") {
    return serviceFailure("b-change-scope-invalid", "B3 写集派生只适用于路径 B workflow（A 路径用团队计划 writesets）。");
  }
  const roster = await loadLatestRoster({ projectRoot: input.projectRoot, flowId });
  if (roster.ok) {
    const byRole = new Map<string, string[]>();
    for (const candidate of normalized) {
      const owners = new Set<string>();
      let matchedModule = false;
      for (const module of roster.roster.modules) {
        if (module.paths.some((modulePath) => moduleContainsPath(modulePath, candidate))) {
          matchedModule = true;
          for (const role of roster.roster.roles) {
            if (role.modules.includes(module.id)) owners.add(role.id);
          }
        }
      }
      if (!matchedModule || owners.size !== 1) {
        return serviceFailure(
          "b-change-scope-invalid",
          `${matchedModule ? `路径属主不唯一（${[...owners].join("、") || "无"}）` : "路径不属于任何名单模块"}：${candidate}（不得猜属主）。`,
        );
      }
      const owner = [...owners][0]!;
      if (isGovernanceDocPath(candidate) && owner !== "rapporteur" && owner !== "product") {
        return serviceFailure(
          "b-change-scope-requires-rapporteur",
          `治理文档修改须由策划/产品出新 -vN 并 basis.amended（属主 ${owner}）：${candidate}。`,
        );
      }
      const list = byRole.get(owner) ?? [];
      list.push(candidate);
      byRole.set(owner, list);
    }
    const writesets = [...byRole.entries()]
      .map(([roleId, paths]) => ({ roleId, paths: [...paths].sort() }))
      .sort((a, b) => a.roleId.localeCompare(b.roleId));
    return { ok: true, writesets, source: "roster", roster: { path: roster.path, sha256: roster.sha256 } };
  }
  const boundaries = await loadProjectRoleBoundaries(input.projectRoot);
  if (boundaries.size === 0) {
    return serviceFailure(
      "b-change-scope-invalid",
      "无名单且未找到 角色卡/<role>/boundary.*：无法派生属主（要求走路径 A 补名单/团队计划）。",
    );
  }
  const byRole = new Map<string, string[]>();
  for (const candidate of normalized) {
    const owners = [...boundaries.entries()]
      .filter(([, entries]) => boundaryContainsPath(entries, candidate))
      .map(([roleId]) => roleId);
    if (owners.length !== 1) {
      return serviceFailure(
        "b-change-scope-invalid",
        `边界属主不唯一（${owners.join("、") || "无"}）：${candidate}；无法唯一归属时要求走路径 A。`,
      );
    }
    const owner = owners[0]!;
    if (isGovernanceDocPath(candidate) && owner !== "rapporteur" && owner !== "product") {
      return serviceFailure(
        "b-change-scope-requires-rapporteur",
        `治理文档修改须由策划/产品出新 -vN 并 basis.amended（属主 ${owner}）：${candidate}。`,
      );
    }
    const list = byRole.get(owner) ?? [];
    list.push(candidate);
    byRole.set(owner, list);
  }
  const writesets = [...byRole.entries()]
    .map(([roleId, paths]) => ({ roleId, paths: [...paths].sort() }))
    .sort((a, b) => a.roleId.localeCompare(b.roleId));
  return { ok: true, writesets, source: "boundary" };
}

export interface RecordChangeScopeDecisionInput {
  projectRoot: string;
  flowId: string;
  workflowId: string;
  operationId?: string;
  /** B1 影响面报告（应用重算字节 hash；不一致 ⇒ b-change-scope-invalid）。 */
  impactReport: { path: string; sha256: string };
  scope: { summary: string; files?: string[]; rationale?: string };
  /** 触发 B1/B2 的 stage-request 任务 id（审计绑定）。 */
  requestTaskId: string;
  now?: () => Date;
}

export type RecordChangeScopeDecisionResult =
  | {
      ok: true;
      workflowId: string;
      writesets: PathBWriteSet[];
      eventId: string;
      replay: boolean;
    }
  | WorkflowServiceFailure;

/**
 * B2 范围决定（`change.scope-decided`；v1.3 §4.3/§7.1）：校验影响面报告字节 hash、派生 B3 有效写集
 * （`derivePathBWriteSets`）、写账本事件（幂等 `scope:<wf>:<impactSha>:<scopeDigest>`）。
 * 投影据此完成 B2；scope 越界/无法唯一归属 ⇒ `b-change-scope-invalid`（要求走 A/新 basis）。
 */
export async function recordChangeScopeDecision(input: RecordChangeScopeDecisionInput): Promise<RecordChangeScopeDecisionResult> {
  const now = input.now ?? (() => new Date());
  if (!isNonEmptyText(input.workflowId)) return serviceFailure("b-change-scope-invalid", "workflowId 缺失。");
  if (!isNonEmptyText(input.requestTaskId)) return serviceFailure("b-change-scope-invalid", "requestTaskId 缺失。");
  if (!isProjectRelativePath(input.impactReport.path) || !isSha256Hex(input.impactReport.sha256)) {
    return serviceFailure("b-change-scope-invalid", "impactReport 形状非法（path + 64 hex sha256）。");
  }
  if (typeof input.scope.summary !== "string" || input.scope.summary.trim() === "") {
    return serviceFailure("b-change-scope-invalid", "scope.summary 缺失。");
  }
  const impact = await readAndHash(input.projectRoot, input.impactReport.path);
  if (!impact.ok || impact.sha256 !== input.impactReport.sha256) {
    return serviceFailure("b-change-scope-invalid", `影响面报告不可读或字节 hash 不一致：${input.impactReport.path}。`);
  }
  const ledger = await readWorkflowLedger(input.projectRoot);
  const wfEvents = workflowEventList(ledger.events, input.workflowId);
  const started = wfEvents.find((event) => event.kind === "workflow.started");
  if (started === undefined || started.kind !== "workflow.started") {
    return serviceFailure("workflow-not-found", `workflow ${input.workflowId} 不存在。`);
  }
  if (started.path !== "B") return serviceFailure("b-change-scope-invalid", "change.scope-decided 只适用于路径 B workflow。");
  const derived = await derivePathBWriteSets({
    projectRoot: input.projectRoot,
    flowId: input.flowId,
    workflowId: input.workflowId,
    scopeFiles: input.scope.files ?? [],
  });
  if (!derived.ok) return derived;
  const files = [...new Set((input.scope.files ?? []).map((raw) => normalizeScopePath(raw)!))].sort();
  const scopeDigest = sha256Of(JSON.stringify({
    summary: input.scope.summary,
    files,
    rationale: input.scope.rationale ?? null,
  })).slice(0, 24);
  const idempotencyKey = `scope:${input.workflowId}:${input.impactReport.sha256}:${scopeDigest}`;
  const existing = wfEvents.find((event) => event.kind === "change.scope-decided" && event.idempotencyKey === idempotencyKey);
  if (existing !== undefined && existing.kind === "change.scope-decided") {
    return {
      ok: true,
      workflowId: input.workflowId,
      writesets: existing.effectiveWritesets.map((set) => ({ roleId: set.roleId, paths: [...set.paths] })),
      eventId: existing.idempotencyKey,
      replay: true,
    };
  }
  const tasks = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, tasks.events);
  const vf = viewFailure(view);
  if (vf !== undefined) return vf;
  if (view.closed !== undefined) return serviceFailure("workflow-closed", `workflow ${input.workflowId} 已关闭。`);
  const b2Allowed = (view.stage === "B2" && canCompleteStage(view, "B2"))
    || (view.stage === "B1" && view.stages.B1.status === "completed"
      && (view.stages.B2.status === "pending" || view.stages.B2.status === "failed"));
  if (!b2Allowed) {
    return serviceFailure("stage-transition-invalid", `B2 范围决定非法：当前 ${view.stage}(${view.stages[view.stage].status})。`);
  }
  const at = now().toISOString();
  const event: WorkflowEvent = {
    v: 1,
    at,
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "change.scope-decided",
    workflowId: input.workflowId,
    flowId: view.flowId,
    path: "B",
    idempotencyKey,
    impactReport: { path: input.impactReport.path, sha256: input.impactReport.sha256 },
    scope: {
      summary: input.scope.summary,
      files,
      ...(input.scope.rationale !== undefined ? { rationale: input.scope.rationale } : {}),
    },
    effectiveWritesets: derived.writesets.map((set) => ({ roleId: set.roleId, paths: [...set.paths] })),
    decidedBy: "chief",
    requestTaskId: input.requestTaskId,
  };
  const appended = await appendWorkflowEvent(input.projectRoot, event);
  if (!appended.ok) return serviceFailure("workflow-ledger-write-failed", `change.scope-decided 写入失败：${appended.message}`);
  return {
    ok: true,
    workflowId: input.workflowId,
    writesets: derived.writesets,
    eventId: appended.event.idempotencyKey,
    replay: appended.replay,
  };
}

