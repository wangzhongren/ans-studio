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

import type { ProjectConfig } from "../../model/role.ts";
import type { BasisEvent, ReleaseEvent, WorkflowEvent } from "../../model/runtime.ts";
import {
  BASIS_LEDGER_SCHEMA,
  RELEASE_LEDGER_SCHEMA,
  WORKFLOW_LEDGER_SCHEMA,
  isBasisEvent,
  isReleaseEvent,
  isWorkflowEvent,
} from "../../model/runtime.ts";
import { TRUNK_MANIFEST_SCHEMA } from "../../model/trunk.ts";
import {
  DEFAULT_JSONL_MAX_BYTES,
  DEFAULT_JSONL_ROTATIONS,
  appendJsonlLine,
  readJsonlLedger,
  type JsonlReadError,
} from "../shared/jsonl-ledger.ts";
import { ANS_DIR_NAME, ansProjectPath, loadEffectiveConfig } from "../shared/config-loader.ts";

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
