// src/common/编排/governance-migration.ts
// **V1b：`su → trio` 显式迁移**（评审 `2026-10-17_design_governance-trio-review.md` §3.2/§5.5/§5.7/§九-12）。
//
// 契约（任务书 + 评审 §5.5）：
//   · `previewGovernanceMigration({projectRoot})` **零写入**：读 `.ans/project.json`，返回
//     `{model, targetModel, writePaths, modelField, manifestLine, pinChanges, retainedFiles, snapshotDigest}`；
//   · `migrateGovernanceModel({projectRoot, confirm:true, previewDigest})`：客户确认后**只改**
//     `.ans` 的 `governanceModel:"trio"`，**保留全部既有/未知字段**（roles/source/pin/...）；
//     向 `docs/bootstrap-manifest.md` 追加一条「治理模型升级（su → trio）」留痕（时间、旧/新模型、
//     变更文件、`.ans` 新旧 SHA-256）；账本写 `governance.migrated`
//     （`decisionEvidence.action="migrate"` + `previewDigest`）。
//   · **不重写角色卡/边界/pin、不删历史、不建 `角色卡/su/`**；旧 `docs/su/**` 保留只读。
//
// 守卫（migrate）：invalid-request（projectRoot / confirm / previewDigest 形状）→ busy（与
// establish/reaccept **共用** `governance-record-lock.ts` 的进程内互斥）→ no-record →
// already-trio → blocked（`.ans` 不可解析 / 不可读 / manifest 不可读 / 门禁前置拒）→
// preview-stale（预览后盘面变化）→ 写入（`.ans` 先、manifest 后；原子写）→ write-failed（可能部分落盘）。
// guard/blocked/stale 拒绝**零写入**；账本失败只诊断、不翻转迁移结果（评审 §九-16）。
//
// 门禁：应用专用边界 `appGovernanceBoundary`（Service 公共出口再导出；**不注入任何角色会话**）。
// 哈希：对**原始字节**求 SHA-256（与 finalize/pin 同算法）。

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Acceptance } from "../../model/boundary.ts";
import type { WriteDecision } from "../../model/decision.ts";
import type { GovernanceModel } from "../../model/role.ts";
import { resolveWrite } from "../../service/gate/resolve-write.ts";
import { appGovernanceBoundary } from "../../service/boundary/resolve-boundary.ts";
import { ANS_PROJECT_FILE_NAME, ansProjectPath } from "../shared/config-loader.ts";
import { toPosix } from "../shared/path-primitives.ts";
import { resolveSkillRoot } from "../shared/runtime-shared.ts";
import { BOOTSTRAP_MANIFEST_REL } from "./finalize.ts";
import { appendGovernanceLedger } from "./governance-ledger.ts";
import {
  isGovernanceRecordBusy,
  releaseGovernanceRecordLock,
  tryAcquireGovernanceRecordLock,
} from "./governance-record-lock.ts";

/** 迁移写入的两条路径（评审 §5.5；内部硬编码，不接受调用方传入）。 */
export const GOVERNANCE_MIGRATION_WRITE_PATHS: readonly string[] = [
  `.ans/${ANS_PROJECT_FILE_NAME}`,
  BOOTSTRAP_MANIFEST_REL,
];

/** 应用专用迁移边界的 `acceptance.source`（如实记录发起动作；不写入 `.ans`）。 */
export const GOVERNANCE_MIGRATION_ACCEPTANCE_SOURCE =
  "desktop-app:操作者显式确认治理模型升级（su → trio）";

/** manifest 升级留痕的标题（评审 §5.5 逐字要求「治理模型升级（su → trio）」）。 */
export const GOVERNANCE_MIGRATION_MANIFEST_HEADING = "治理模型升级（su → trio）";

/** 迁移目标模型（V1b 只支持 su → trio；降级/回滚列 V2）。 */
export const GOVERNANCE_MIGRATION_TARGET_MODEL = "trio" as const;

const SHA256_HEX_64 = /^[0-9a-fA-F]{64}$/;

/** 预览内的一项「pin 变化」；V1b 迁移**不重算 pin**，故恒为空数组。 */
export interface GovernanceMigrationPinChange {
  path: string;
  oldSha256: string;
  newSha256: string;
}

/** 迁移预览（评审 §5.5；桌面经 IPC 原样展示）。 */
export interface GovernanceMigrationPreview {
  /** 当前有效模型（V1b 只迁移 single；already-trio 走失败分支）。 */
  model: GovernanceModel;
  /** 固定 `"trio"`。 */
  targetModel: GovernanceModel;
  /** 固定 `[".ans/project.json", "docs/bootstrap-manifest.md"]`（写入顺序）。 */
  writePaths: string[];
  /** `.ans/project.json` 中 `governanceModel` 的**原始快照**；`null` = 字段缺失（旧 single 形状）。 */
  modelField: GovernanceModel | null;
  /** 将追加到 manifest 的升级留痕标题（逐字）。 */
  manifestLine: string;
  /** pin 变化；V1b 迁移不重算 pin ⇒ 恒为 `[]`。 */
  pinChanges: GovernanceMigrationPinChange[];
  /** 迁移**不会改动**的既有文件（角色卡/边界/治理边界文档/旧 `docs/su/**`；只列出确实存在的）。 */
  retainedFiles: string[];
  /** 预览时盘面摘要（`.ans` 原始字节 + manifest 内容/缺失）；确认写入时原样回传。 */
  snapshotDigest: string;
}

export type GovernanceMigrationPreviewFailure =
  | "invalid-request"
  | "busy"
  | "no-record"
  | "already-trio"
  | "invalid-record"
  | "blocked";

export type GovernanceMigrationPreviewResult =
  | { ok: true; preview: GovernanceMigrationPreview }
  | { ok: false; code: GovernanceMigrationPreviewFailure; message: string };

/** 迁移写入状态（评审 §5.5 逐字集合；`invalid-record` 归入 `blocked`）。 */
export type GovernanceMigrationStatus =
  | "completed"
  | "already-trio"
  | "no-record"
  | "blocked"
  | "write-failed"
  | "preview-stale"
  | "busy"
  | "invalid-request";

export interface GovernanceMigrationResult {
  /** status === "completed" 时为 true。 */
  ok: boolean;
  /** guard = 未进入写入（零写入）；write = 已进入写入阶段（write-failed 可能部分落盘）。 */
  phase: "guard" | "write";
  status: GovernanceMigrationStatus;
  /** 动作结束时/尝试时的模型：completed/trio 失败为 `"trio"`；其余按当刻可判定值（缺省 single）。 */
  model: GovernanceModel;
  message: string;
}

export interface GovernanceMigrationWriteInput {
  projectRoot: string;
  confirm: true;
  previewDigest: string;
}

type NormalizedMigrationInput = { projectRoot: string; skillRoot: string };

function normalizeMigrationInput(input: unknown): NormalizedMigrationInput | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  const rawRoot = record.projectRoot;
  if (typeof rawRoot !== "string" || rawRoot.trim() === "") return undefined;
  return { projectRoot: path.resolve(rawRoot), skillRoot: resolveSkillRoot() };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isGovernanceModel(value: unknown): value is GovernanceModel {
  return value === "single" || value === "trio";
}

async function isFile(absPath: string): Promise<boolean> {
  try {
    return (await stat(absPath)).isFile();
  } catch {
    return false;
  }
}

/** 读取 manifest：不存在（ENOENT/ENOTDIR）→ null；存在但不是普通文件或读失败 → 不可读原因。 */
async function readManifest(
  projectRoot: string,
): Promise<{ ok: true; text: string | null } | { ok: false; reason: string }> {
  const abs = path.resolve(projectRoot, BOOTSTRAP_MANIFEST_REL);
  let st;
  try {
    st = await stat(abs);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { ok: true, text: null };
    return { ok: false, reason: errText(err) };
  }
  if (!st.isFile()) return { ok: false, reason: "不是普通文件" };
  try {
    return { ok: true, text: await readFile(abs, "utf8") };
  } catch (err) {
    return { ok: false, reason: errText(err) };
  }
}

/** 项目相对路径安全检查：拒绝绝对路径与 `..` 逃逸（`.ans` 内容不可信，仅用于只读展示/探测）。 */
function safeProjectRel(projectRoot: string, rel: string): string | undefined {
  const trimmed = rel.trim();
  if (trimmed === "" || path.isAbsolute(trimmed)) return undefined;
  const abs = path.resolve(projectRoot, trimmed);
  const rootWithSep = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
  if (abs !== projectRoot && !abs.startsWith(rootWithSep)) return undefined;
  return toPosix(path.relative(projectRoot, abs));
}

/** 列出目录下全部文件（项目相对、posix）；目录不存在 → 空。 */
async function listFilesUnder(projectRoot: string, relDir: string): Promise<string[]> {
  const out: string[] = [];
  await walk(path.join(projectRoot, relDir), relDir, out);
  return out;
}

async function walk(absDir: string, relDir: string, out: string[]): Promise<void> {
  let dirents;
  try {
    dirents = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of dirents) {
    const rel = `${relDir}/${d.name}`;
    if (d.isDirectory()) await walk(path.join(absDir, d.name), rel, out);
    else if (d.isFile()) out.push(rel);
  }
}

/**
 * 迁移**不会改动**的既有文件（预览展示用）：`.ans roles` 的 card/boundary、治理边界文档、
 * 现有 pin 目标，以及旧 `docs/su/**` 全部文件。只列确实存在的普通文件；去重排序。
 */
async function collectRetainedFiles(projectRoot: string, doc: Record<string, unknown>): Promise<string[]> {
  const candidates = new Set<string>();
  const roles = doc.roles;
  if (isPlainObject(roles)) {
    for (const value of Object.values(roles)) {
      if (!isPlainObject(value)) continue;
      if (typeof value.card === "string") candidates.add(value.card);
      if (typeof value.boundary === "string") candidates.add(value.boundary);
    }
  }
  const gov = doc.governanceBoundary;
  if (isPlainObject(gov)) {
    if (typeof gov.path === "string") candidates.add(gov.path);
    const acceptance = gov.acceptance;
    if (isPlainObject(acceptance) && Array.isArray(acceptance.pin)) {
      for (const pin of acceptance.pin) {
        if (isPlainObject(pin) && typeof pin.path === "string") candidates.add(pin.path);
      }
    }
  }

  const out = new Set<string>();
  for (const rel of candidates) {
    const safe = safeProjectRel(projectRoot, rel);
    if (safe === undefined) continue;
    if (await isFile(path.join(projectRoot, safe))) out.add(safe);
  }
  // 旧 `docs/su/**` 保留只读（迁移不删、不改）。
  for (const rel of await listFilesUnder(projectRoot, "docs/su")) out.add(rel);
  return [...out].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

/** 盘面摘要：`.ans` 原始字节 + manifest 内容（缺失记标记）。预览与写入必须同算法。 */
function snapshotDigestOf(ansBytes: Buffer, manifestText: string | null): string {
  const hash = createHash("sha256");
  hash.update("ans\n");
  hash.update(ansBytes);
  hash.update("\nmanifest\n");
  if (manifestText === null) hash.update("<absent>");
  else hash.update(manifestText, "utf8");
  return hash.digest("hex");
}

function sha256Bytes(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

type MigrationEvaluation =
  | {
      ok: true;
      projectRoot: string;
      skillRoot: string;
      /** `.ans` 原始字节（旧哈希与摘要来源）。 */
      rawAns: Buffer;
      /** 解析后的完整对象（写入时只增/改 `governanceModel`）。 */
      doc: Record<string, unknown>;
      /** 原始字段快照：`null` = 缺失/非法。 */
      modelField: GovernanceModel | null;
      /** 门禁前置（两写路径均已逐条求值；拒绝时 gateFailure 非空）。 */
      gate: (rel: string) => WriteDecision;
      gateFailure?: string;
      /** manifest 当刻全文；null = 不存在。 */
      manifestText: string | null;
      manifestFailure?: string;
      retainedFiles: string[];
      snapshotDigest: string;
    }
  | { ok: false; status: "no-record" | "invalid-record"; message: string };

/**
 * 预览与写入**共用**的只读求值：`.ans` 存在/可解析 → 字段快照 → manifest 可读性 →
 * 应用边界门禁前置 → 保留文件 → 盘面摘要。**不写任何文件**。
 * 守卫 1（projectRoot）与 2（互斥）由调用方在**首次 await 之前**处理。
 */
async function evaluateMigration(input: NormalizedMigrationInput): Promise<MigrationEvaluation> {
  const { projectRoot, skillRoot } = input;
  const ansAbs = ansProjectPath(projectRoot);

  if (!(await isFile(ansAbs))) {
    return {
      ok: false,
      status: "no-record",
      message: "没有治理记录（.ans/project.json 不存在），无法迁移；本次未写入任何文件。",
    };
  }

  let rawAns: Buffer;
  try {
    rawAns = await readFile(ansAbs);
  } catch (err) {
    return {
      ok: false,
      status: "invalid-record",
      message: `治理记录不可读：${errText(err)}；本次未写入任何文件。`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawAns.toString("utf8"));
  } catch (err) {
    return {
      ok: false,
      status: "invalid-record",
      message: `治理记录不可解析：${errText(err)}；本次未写入任何文件。`,
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      status: "invalid-record",
      message: "治理记录顶层不是对象；本次未写入任何文件。",
    };
  }
  const doc = parsed;
  const rawModel = doc.governanceModel;
  const modelField = isGovernanceModel(rawModel) ? rawModel : null;

  // manifest：存在则逐字节保留（写入时在文末追节）；读失败 → blocked、零写入。
  const manifest = await readManifest(projectRoot);
  const manifestFailure = manifest.ok
    ? undefined
    : `无法读取 ${BOOTSTRAP_MANIFEST_REL}：${manifest.reason}；本次未写入任何文件。`;
  const manifestText = manifest.ok ? manifest.text : null;

  // 应用专用边界（不注入任何角色会话）：两条待写路径逐条前置求值。
  const acceptance: Acceptance = {
    accepted: true,
    source: GOVERNANCE_MIGRATION_ACCEPTANCE_SOURCE,
  };
  const boundary = appGovernanceBoundary(acceptance);
  const gate = (rel: string): WriteDecision =>
    resolveWrite(rel, boundary, undefined, { skillRoot, projectRoot });
  let gateFailure: string | undefined;
  for (const rel of GOVERNANCE_MIGRATION_WRITE_PATHS) {
    const decision = gate(rel);
    if (!decision.allowed) {
      gateFailure = `治理模型迁移写入被门禁拒绝（未绕门）：${rel} —— ${decision.reason ?? ""}；本次未写入任何文件。`;
      break;
    }
  }

  const retainedFiles = await collectRetainedFiles(projectRoot, doc);
  const snapshotDigest = snapshotDigestOf(rawAns, manifestText);

  return {
    ok: true,
    projectRoot,
    skillRoot,
    rawAns,
    doc,
    modelField,
    gate,
    gateFailure,
    manifestText,
    manifestFailure,
    retainedFiles,
    snapshotDigest,
  };
}

/**
 * 预览「治理模型升级（su → trio）」。**零写入**；守卫：invalid-request → busy → no-record →
 * already-trio → invalid-record（`.ans` 不可解析）→ blocked（manifest 不可读 / 门禁前置拒）。
 */
export async function previewGovernanceMigration(input: {
  projectRoot: string;
}): Promise<GovernanceMigrationPreviewResult> {
  const normalized = normalizeMigrationInput(input);
  if (normalized === undefined) {
    return { ok: false, code: "invalid-request", message: "projectRoot 缺失或不可访问；本次未写入任何文件。" };
  }
  if (isGovernanceRecordBusy(normalized.projectRoot)) {
    return { ok: false, code: "busy", message: "上一次治理记录操作仍在进行中；本次未写入任何文件。" };
  }

  let evaluation: MigrationEvaluation;
  try {
    evaluation = await evaluateMigration(normalized);
  } catch (err) {
    return {
      ok: false,
      code: "invalid-record",
      message: `治理记录求值失败：${errText(err)}；本次未写入任何文件。`,
    };
  }
  if (!evaluation.ok) {
    return {
      ok: false,
      code: evaluation.status === "no-record" ? "no-record" : "invalid-record",
      message: evaluation.message,
    };
  }
  if (evaluation.modelField === "trio") {
    return { ok: false, code: "already-trio", message: "已是 trio 治理模型，无需迁移；本次未写入任何文件。" };
  }
  if (evaluation.manifestFailure !== undefined) {
    return { ok: false, code: "blocked", message: evaluation.manifestFailure };
  }
  if (evaluation.gateFailure !== undefined) {
    return { ok: false, code: "blocked", message: evaluation.gateFailure };
  }

  return {
    ok: true,
    preview: {
      model: "single",
      targetModel: GOVERNANCE_MIGRATION_TARGET_MODEL,
      writePaths: [...GOVERNANCE_MIGRATION_WRITE_PATHS],
      modelField: evaluation.modelField,
      manifestLine: GOVERNANCE_MIGRATION_MANIFEST_HEADING,
      pinChanges: [],
      retainedFiles: evaluation.retainedFiles,
      snapshotDigest: evaluation.snapshotDigest,
    },
  };
}

/** manifest 升级留痕条目（时间、旧/新模型、变更文件、`.ans` 新旧哈希）。 */
function renderMigrationManifestEntry(args: {
  at: string;
  oldModel: GovernanceModel;
  oldHash: string;
  newHash: string;
}): string {
  return [
    `- 时间：${args.at}`,
    `- 旧模型：${args.oldModel}`,
    `- 新模型：${GOVERNANCE_MIGRATION_TARGET_MODEL}`,
    `- 变更文件：${GOVERNANCE_MIGRATION_WRITE_PATHS.join("、")}`,
    `- .ans 旧哈希（SHA-256）：${args.oldHash}`,
    `- .ans 新哈希（SHA-256）：${args.newHash}`,
    `- 客户确认：桌面应用操作者显式确认（confirm:true）`,
  ].join("\n");
}

/** 追加「治理模型升级（su → trio）」节：既有全文逐字节保留；节不存在则文末新增。 */
function appendMigrationManifestRecord(existing: string | null, entry: string): string {
  const section = `## ${GOVERNANCE_MIGRATION_MANIFEST_HEADING}\n\n${entry}\n`;
  if (existing === null) {
    return [
      "# Bootstrap 留痕（创世 finalize）",
      "",
      "此前的 manifest 不存在；以下为治理模型升级记录。",
      "",
      section,
    ].join("\n");
  }
  const lead = existing.endsWith("\n") ? "\n" : "\n\n";
  return existing + lead + section;
}

/** 经门禁放行后**原子落盘**（同目录临时文件 + rename；写前再求一次 `resolveWrite`）。 */
async function gatedAtomicWrite(
  gate: (rel: string) => WriteDecision,
  rel: string,
  content: string,
  projectRoot: string,
): Promise<void> {
  const decision = gate(rel);
  if (!decision.allowed) {
    throw new Error(`治理模型迁移写入被门禁拒绝：${rel} —— ${decision.reason ?? ""}`);
  }
  const abs = path.resolve(projectRoot, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${randomUUID()}`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, abs);
}

function migrationFailure(
  status: GovernanceMigrationStatus,
  phase: "guard" | "write",
  model: GovernanceModel,
  message: string,
): GovernanceMigrationResult {
  return { ok: false, phase, status, model, message };
}

/**
 * 确认迁移 `single → trio`（评审 §5.5/§5.7）。只改 `.ans` 的 `governanceModel`（保留全部既有/未知
 * 字段，原子写），manifest 追加升级留痕，账本写 `governance.migrated`；**不重写角色卡/边界/pin、
 * 不删历史、不建 `角色卡/su/`**。
 *
 * 守卫顺序：invalid-request（projectRoot/confirm/previewDigest）→ busy（首次 await 前占位）→
 * no-record → already-trio → blocked（记录不可解析/manifest 不可读/门禁前置）→ preview-stale →
 * 写入 → write-failed。guard 拒绝零写入；写入阶段抛错如实返回 `phase:"write"`，不重试、不清理。
 */
export async function migrateGovernanceModel(
  input: GovernanceMigrationWriteInput,
): Promise<GovernanceMigrationResult> {
  const normalized = normalizeMigrationInput(input);
  if (normalized === undefined) {
    return migrationFailure("invalid-request", "guard", "single", "projectRoot 缺失或不可访问；本次未写入任何文件。");
  }
  if ((input as { confirm?: unknown }).confirm !== true) {
    return migrationFailure("invalid-request", "guard", "single", "confirm 必须为 true；本次未写入任何文件。");
  }
  const previewDigest = (input as { previewDigest?: unknown }).previewDigest;
  if (typeof previewDigest !== "string" || !SHA256_HEX_64.test(previewDigest.trim())) {
    return migrationFailure(
      "invalid-request",
      "guard",
      "single",
      "previewDigest 不是 64 位十六进制；本次未写入任何文件。",
    );
  }
  const { projectRoot } = normalized;

  // 2) 进程内同项目互斥：**在首次 await 之前**占位（与 establish/reaccept 共用同一份锁）。
  if (!tryAcquireGovernanceRecordLock(projectRoot)) {
    return migrationFailure("busy", "guard", "single", "上一次治理记录操作仍在进行中；本次未写入任何文件。");
  }
  try {
    let evaluation: MigrationEvaluation;
    try {
      evaluation = await evaluateMigration(normalized);
    } catch (err) {
      return migrationFailure(
        "blocked",
        "guard",
        "single",
        `治理记录求值失败：${errText(err)}；本次未写入任何文件。`,
      );
    }
    if (!evaluation.ok) {
      if (evaluation.status === "no-record") {
        return migrationFailure("no-record", "guard", "single", evaluation.message);
      }
      return migrationFailure("blocked", "guard", "single", evaluation.message);
    }

    // 3) already-trio：幂等拒绝（不重复写 manifest/账本）。
    if (evaluation.modelField === "trio") {
      return migrationFailure(
        "already-trio",
        "guard",
        "trio",
        "已是 trio 治理模型，无需迁移；本次未写入任何文件。",
      );
    }

    // 4) manifest 不可读 / 门禁前置拒绝（零写入）。
    if (evaluation.manifestFailure !== undefined) {
      return migrationFailure("blocked", "guard", "single", evaluation.manifestFailure);
    }
    if (evaluation.gateFailure !== undefined) {
      return migrationFailure("blocked", "guard", "single", evaluation.gateFailure);
    }

    // 5) 预览后盘面变化 → preview-stale（零写入）。
    if (previewDigest.trim().toLowerCase() !== evaluation.snapshotDigest) {
      return migrationFailure(
        "preview-stale",
        "guard",
        "single",
        "预览后治理记录/留痕文件有变化，已取消本次迁移；请重新预览。本次未写入任何文件。",
      );
    }

    // 6) 内存构造完整对象：只增/改 governanceModel，**保留全部既有/未知字段**。
    const newDoc: Record<string, unknown> = { ...evaluation.doc, governanceModel: GOVERNANCE_MIGRATION_TARGET_MODEL };
    const ansContent = JSON.stringify(newDoc, null, 2) + "\n";
    const oldHash = sha256Bytes(evaluation.rawAns);
    const newHash = sha256Bytes(ansContent);
    const manifestContent = appendMigrationManifestRecord(
      evaluation.manifestText,
      renderMigrationManifestEntry({
        at: new Date().toISOString(),
        oldModel: "single",
        oldHash,
        newHash,
      }),
    );

    // 7) `.ans` 先、manifest 后；均经既有原子写（写前再求一次）。
    let ansWritten = false;
    try {
      await gatedAtomicWrite(evaluation.gate, GOVERNANCE_MIGRATION_WRITE_PATHS[0], ansContent, projectRoot);
      ansWritten = true;
      await gatedAtomicWrite(evaluation.gate, GOVERNANCE_MIGRATION_WRITE_PATHS[1], manifestContent, projectRoot);
    } catch (err) {
      return migrationFailure(
        "write-failed",
        "write",
        ansWritten ? "trio" : "single",
        `写入中断：${errText(err)}；可能已写入部分文件（.ans/project.json 与 docs/bootstrap-manifest.md 不保证齐全），请核对现场。`,
      );
    }

    // 8) 账本 `governance.migrated`（评审 §5.7）：best-effort，失败只诊断、不翻转迁移结果。
    try {
      await appendGovernanceLedger(projectRoot, {
        at: new Date().toISOString(),
        kind: "governance.migrated",
        actorRoleId: "app",
        power: "app",
        decisionEvidence: {
          kind: "desktop-governance-record",
          action: "migrate",
          previewDigest: previewDigest.trim().toLowerCase(),
        },
      });
    } catch {
      /* 账本失败不翻转治理模型迁移 */
    }

    return {
      ok: true,
      phase: "write",
      status: "completed",
      model: "trio",
      message:
        "已升级治理模型（su → trio）：写入 .ans/project.json 与 docs/bootstrap-manifest.md；" +
        "未改角色卡/边界/pin，未删除历史。",
    };
  } finally {
    releaseGovernanceRecordLock(projectRoot);
  }
}
