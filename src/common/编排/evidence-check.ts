// src/common/编排/evidence-check.ts
// 2026-10-30（方案 v3 §3.4 / P4；Delta-W1-3 `ans-criteria/v1`）：证据 sidecar 与应用重算、
// P0 criteria 派生、只读 evidence_check 数据层。所有失败 fail-closed；不执行项目脚本、不写 artifact/sidecar。
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { makeMechanicalRejection, type MechanicalRejection } from "./mechanical-rejection.ts";

export const EVIDENCE_META_SCHEMA = "evidence-meta/v1" as const;
export const CRITERIA_SCHEMA = "ans-criteria/v1" as const;
export type AcPriority = "P0" | "P1" | "P2" | "P3";
export type CriteriaStatus = "final" | "draft";

export interface CriteriaEntry {
  id: string;
  priority: AcPriority;
  title?: string;
}
export interface CriteriaDoc {
  schema: typeof CRITERIA_SCHEMA;
  flowId: string;
  version: number;
  status: CriteriaStatus;
  criteria: CriteriaEntry[];
  path: string;
  sha256: string;
}
export interface CriteriaRef {
  path: string;
  sha256: string;
  version: number;
}
export interface CriteriaFailure {
  ok: false;
  code: string;
  rejection: MechanicalRejection;
}
export type CriteriaResult = { ok: true; doc: CriteriaDoc } | CriteriaFailure;

export interface EvidenceMetaV1 {
  schema: typeof EVIDENCE_META_SCHEMA;
  artifact: string;
  sha256: string;
  bytes: number;
  lines: number;
  generatedAt: string;
  command?: string;
  exitCode?: number;
  metrics?: Record<string, number>;
  acIds?: string[];
  owner?: string;
  /** 旧/自报字段；解析时忽略并标记。 */
  p0?: boolean;
}
export interface EvidenceCollectionItem {
  artifact: string;
  sha256: string;
  bytes: number;
  lines: number;
  metrics?: Record<string, number>;
  acIds?: string[];
}
export interface EvidenceCollectionMeta {
  schema: typeof EVIDENCE_META_SCHEMA;
  collection: EvidenceCollectionItem[];
  generatedAt: string;
  acIds?: string[];
  p0?: boolean;
}

export interface ArtifactActual {
  path: string;
  bytes: number;
  lines: number;
  sha256: string;
  mtimeMs: number;
  text: string;
}
export interface ArtifactClaims {
  lines?: number;
  pass?: number;
  fail?: number;
}
export interface EvidenceCheckResult {
  ok: boolean;
  valid: boolean;
  priority?: AcPriority;
  unverified: boolean;
  legacy: boolean;
  p0Ignored: boolean;
  actual?: ArtifactActual;
  meta?: EvidenceMetaV1 | EvidenceCollectionMeta;
  claims?: ArtifactClaims;
  mismatch: string[];
  rejection?: MechanicalRejection;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function criteriaFailure(code: string, missing: string, docs: string[] = []): CriteriaFailure {
  return { ok: false, code, rejection: makeMechanicalRejection(code, [missing], { docs }) };
}

export const EVIDENCE_PATH_CODE = "evidence-path-invalid" as const;
export const EVIDENCE_SCOPE_CODE = "evidence-scope-denied" as const;

export type EvidencePathResult = { ok: true; path: string } | { ok: false; code: typeof EVIDENCE_PATH_CODE; reason: string };

export class EvidencePathError extends Error {
  readonly code = EVIDENCE_PATH_CODE;
  constructor(message: string) {
    super(message);
    this.name = "EvidencePathError";
  }
}

/**
 * 证据路径归一化（3.4/F3）：必须是项目内相对路径；拒绝绝对路径、`..` 越界、`.ans` 与 `.env`/`.env.*`。
 * artifact/metaPath/collection item 共用同一规则；失败 fail-closed，不落到 readFile。
 */
export function validateEvidencePath(raw: unknown): EvidencePathResult {
  if (typeof raw !== "string") return { ok: false, code: EVIDENCE_PATH_CODE, reason: "路径必须是字符串" };
  const slashed = raw.trim().replace(/\\/g, "/");
  if (slashed === "") return { ok: false, code: EVIDENCE_PATH_CODE, reason: "路径为空" };
  if (slashed.includes("\0")) return { ok: false, code: EVIDENCE_PATH_CODE, reason: "路径包含空字符" };
  if (slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed)) {
    return { ok: false, code: EVIDENCE_PATH_CODE, reason: `不允许绝对路径：${raw}` };
  }
  const segments: string[] = [];
  for (const segment of slashed.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return { ok: false, code: EVIDENCE_PATH_CODE, reason: `不允许 .. 越界：${raw}` };
    if (segment === ".ans") return { ok: false, code: EVIDENCE_PATH_CODE, reason: `不允许访问 .ans：${raw}` };
    segments.push(segment);
  }
  if (segments.length === 0) return { ok: false, code: EVIDENCE_PATH_CODE, reason: `路径为空：${raw}` };
  const base = segments[segments.length - 1]!;
  if (base === ".env" || base.startsWith(".env.")) {
    return { ok: false, code: EVIDENCE_PATH_CODE, reason: `不允许访问 .env：${raw}` };
  }
  return { ok: true, path: segments.join("/") };
}

/** 角色证据范围判定：路径等于 root 或位于 root 目录内。 */
export function isWithinEvidenceRoots(relPath: string, roots: readonly string[]): boolean {
  const target = relPath.trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  return roots.some((root) => {
    const normalized = root.trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
    return normalized !== "" && normalized !== "." && (target === normalized || target.startsWith(`${normalized}/`));
  });
}

function failureResult(code: string, missing: string[], docs: string[] = [], priority?: AcPriority): EvidenceCheckResult {
  const rejection = makeMechanicalRejection(code, missing, { docs });
  return {
    ok: false,
    valid: false,
    ...(priority !== undefined ? { priority } : {}),
    unverified: false,
    legacy: false,
    p0Ignored: false,
    mismatch: rejection.missing,
    rejection,
  };
}

/** AC canonical 归一化（NFKC/去空白/大写/去前导零）；失败返回 undefined。 */
export function normalizeAcId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.normalize("NFKC").trim().replace(/\s+/g, "").toUpperCase();
  const ac = /^AC-0*(\d{1,4})$/.exec(value);
  if (ac !== null) {
    const digits = ac[1]!;
    return `AC-${digits === "" ? "0" : String(Number(digits))}`;
  }
  const p = /^P(0*[1-9]\d{0,1})\.(0*[1-9]\d{0,1})$/.exec(value);
  if (p !== null) return `P${Number(p[1])}.${Number(p[2])}`;
  return undefined;
}

export function normalizePriority(raw: unknown): AcPriority | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.normalize("NFKC").trim().toUpperCase();
  return value === "P0" || value === "P1" || value === "P2" || value === "P3" ? value : undefined;
}

/** 解析唯一 ans-criteria fenced block；fileName 用于校验 flowId/version。 */
export function parseCriteriaText(text: string, input: { flowId: string; fileName?: string; ref?: CriteriaRef } = { flowId: "" }): CriteriaResult {
  if (typeof text !== "string") return criteriaFailure("criteria-parse-failed", "criteria 内容不是文本");
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks: Array<{ info: string; body: string; start: number }> = [];
  let i = 0;
  while (i < lines.length) {
    const match = /^```([^\s`]*)\s*$/.exec(lines[i]!);
    if (match === null) { i += 1; continue; }
    const info = match[1] ?? "";
    const start = i;
    i += 1;
    const body: string[] = [];
    let closed = false;
    while (i < lines.length) {
      if (/^```\s*$/.test(lines[i]!)) { closed = true; break; }
      body.push(lines[i]!);
      i += 1;
    }
    if (!closed) return criteriaFailure("criteria-parse-failed", "ans-criteria block 未闭合");
    if (info === "ans-criteria") blocks.push({ info, body: body.join("\n"), start });
    i += 1;
  }
  if (blocks.length === 0) return criteriaFailure("criteria-format-missing", "文件没有 ans-criteria block");
  if (blocks.length > 1) return criteriaFailure("criteria-format-ambiguous", "文件包含多个 ans-criteria block");
  const body = blocks[0]!.body;
  if (/(^|\n)\s*---\s*(\n|$)/.test(body)) return criteriaFailure("criteria-parse-failed", "ans-criteria block 不允许 YAML 文档分隔符");
  if (/(^|\n)\s*(?:&|\*|<<\s*:)/.test(body)) return criteriaFailure("criteria-parse-failed", "ans-criteria block 不允许锚点/别名/合并键");
  let parsed: unknown;
  try { parsed = parseYaml(body); } catch (error) {
    return criteriaFailure("criteria-parse-failed", `YAML 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed)) return criteriaFailure("criteria-schema-invalid", "ans-criteria block 必须是 YAML mapping");
  const allowedTop = new Set(["schema", "flowId", "version", "status", "criteria"]);
  for (const key of Object.keys(parsed)) if (!allowedTop.has(key)) return criteriaFailure("criteria-schema-invalid", `未知顶层字段：${key}`);
  const schema = typeof parsed["schema"] === "string" ? parsed["schema"].normalize("NFKC").trim() : "";
  if (schema !== CRITERIA_SCHEMA) return criteriaFailure("criteria-schema-invalid", `schema 必须为 ${CRITERIA_SCHEMA}`);
  const flowId = typeof parsed["flowId"] === "string" ? parsed["flowId"].trim() : "";
  const flowRe = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;
  if (!flowRe.test(flowId)) return criteriaFailure("criteria-schema-invalid", "flowId 非法");
  if (input.flowId !== "" && flowId !== input.flowId) return criteriaFailure("criteria-ref-mismatch", `flowId=${flowId} 与运行 flowId=${input.flowId} 不一致`);
  const version = parsed["version"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return criteriaFailure("criteria-version-mismatch", "version 必须是正整数");
  }
  let fileNameVersion: number | undefined;
  if (input.fileName !== undefined) {
    const m = /-criteria-v([1-9]\d*)\.md$/i.exec(input.fileName);
    if (m === null) return criteriaFailure("criteria-version-mismatch", `文件名不是 <flowId>-criteria-vN.md：${input.fileName}`);
    fileNameVersion = Number(m[1]);
    const nameFlow = input.fileName.replace(/-criteria-v\d+\.md$/i, "");
    if (nameFlow !== flowId) return criteriaFailure("criteria-ref-mismatch", `文件名 flowId=${nameFlow} 与 block flowId=${flowId} 不一致`);
    if (fileNameVersion !== version) return criteriaFailure("criteria-version-mismatch", `文件名 v${fileNameVersion} 与 block version=${version} 不一致`);
  }
  if (input.ref !== undefined && input.ref.version !== version) {
    return criteriaFailure("criteria-version-mismatch", `ref version=${input.ref.version} 与 block version=${version} 不一致`);
  }
  const status = parsed["status"];
  if (status !== "final" && status !== "draft") return criteriaFailure("criteria-schema-invalid", "status 必须为 final 或 draft");
  if (!Array.isArray(parsed["criteria"])) return criteriaFailure("criteria-schema-invalid", "criteria 必须是数组");
  if (parsed["criteria"].length === 0) return criteriaFailure("criteria-empty", "criteria 不能为空");
  if (parsed["criteria"].length > 500) return criteriaFailure("criteria-too-many", "criteria 超过 500 条");
  const allowedEntry = new Set(["id", "priority", "title"]);
  const seen = new Set<string>();
  const criteria: CriteriaEntry[] = [];
  for (const [index, raw] of parsed["criteria"].entries()) {
    if (!isRecord(raw)) return criteriaFailure("criteria-schema-invalid", `criteria[${index}] 不是 mapping`);
    for (const key of Object.keys(raw)) if (!allowedEntry.has(key)) return criteriaFailure("criteria-schema-invalid", `criteria[${index}] 未知字段：${key}`);
    const id = normalizeAcId(raw["id"]);
    if (id === undefined) return criteriaFailure("criteria-id-invalid", `criteria[${index}] id 非法：${String(raw["id"])}`);
    const priority = normalizePriority(raw["priority"]);
    if (priority === undefined) return criteriaFailure("criteria-priority-invalid", `criteria[${index}] priority 非法：${String(raw["priority"])}`);
    if (seen.has(id)) return criteriaFailure("criteria-duplicate-ac", `重复 canonical AC id：${id}`);
    seen.add(id);
    const title = raw["title"];
    if (title !== undefined && typeof title !== "string") {
      return criteriaFailure("criteria-schema-invalid", `criteria[${index}] title 必须是字符串`);
    }
    criteria.push({ id, priority, ...(typeof title === "string" ? { title } : {}) });
  }
  const sha256 = createHash("sha256").update(Buffer.from(normalized, "utf8")).digest("hex");
  return { ok: true, doc: { schema: CRITERIA_SCHEMA, flowId, version, status, criteria, path: input.ref?.path ?? "", sha256 } };
}

/** 按显式 ref 加载（不取 latest）；ref 的 sha 必须匹配实际文件字节。 */
export async function loadCriteria(
  projectRoot: string,
  flowId: string,
  ref: CriteriaRef | undefined,
  readFileFn: (abs: string) => Promise<Buffer | string> = readFile,
): Promise<CriteriaResult> {
  if (ref === undefined) return criteriaFailure("criteria-version-unresolved", "验收任务/事实没有显式 criteriaRef（path+sha256+version）；不取 latest");
  const rel = ref.path.replace(/\\/g, "/");
  const escaped = flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`^docs/acceptance/${escaped}-criteria-v[1-9]\\d*\\.md$`).test(rel)) {
    return criteriaFailure("criteria-ref-mismatch", `criteriaRef 路径不合法/不属于 flowId=${flowId}：${ref.path}`, [ref.path]);
  }
  let bytes: Buffer;
  try {
    const read = await readFileFn(path.join(projectRoot, rel));
    bytes = typeof read === "string" ? Buffer.from(read, "utf8") : read;
  } catch {
    return criteriaFailure("criteria-missing", `criteriaRef 文件不可读：${ref.path}`, [ref.path]);
  }
  const actualSha = createHash("sha256").update(bytes).digest("hex");
  if (actualSha !== ref.sha256) return criteriaFailure("criteria-ref-mismatch", `criteriaRef sha256 不符：${ref.path}`, [ref.path]);
  const parsed = parseCriteriaText(bytes.toString("utf8"), { flowId, fileName: path.posix.basename(rel), ref });
  if (!parsed.ok) return parsed;
  if (parsed.doc.status !== "final") return criteriaFailure("criteria-status-draft", `criteria 仍为 draft：${ref.path}`, [ref.path]);
  return { ok: true, doc: { ...parsed.doc, path: rel, sha256: actualSha } };
}

/** 读取 artifact 实际 bytes/lines/sha256/mtime（UTF-8，CRLF/LF 统一后计行；路径先做项目内校验）。 */
export async function readArtifact(projectRoot: string, relPath: string): Promise<ArtifactActual> {
  const validated = validateEvidencePath(relPath);
  if (!validated.ok) throw new EvidencePathError(validated.reason);
  const rel = validated.path;
  const abs = path.join(projectRoot, rel);
  const bytes = await readFile(abs);
  const info = await stat(abs);
  const text = bytes.toString("utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text === "" ? 0 : text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length;
  return { path: rel, bytes: bytes.byteLength, lines, sha256: createHash("sha256").update(bytes).digest("hex"), mtimeMs: info.mtimeMs, text };
}

/** 解析已知 artifact 自述（AC-28 形状；无适配器时为空）。 */
export function parseArtifactClaims(text: string): ArtifactClaims {
  const claims: ArtifactClaims = {};
  const lines = /(?:下列|合计|共)?\s*(\d+)\s*(?:行|lines?)/i.exec(text);
  if (lines !== null) claims.lines = Number(lines[1]);
  const pass = /(?:pass(?:ed)?|通过)\s*[:=]?\s*(\d+)|(\d+)\s*pass(?:ed)?/i.exec(text);
  if (pass !== null) claims.pass = Number(pass[1] ?? pass[2]);
  const fail = /(?:fail(?:ed)?|失败)\s*[:=]?\s*(\d+)/i.exec(text);
  if (fail !== null) claims.fail = Number(fail[1] ?? fail[2]);
  return claims;
}

export function parseEvidenceMeta(text: string): { ok: true; meta: EvidenceMetaV1 | EvidenceCollectionMeta; p0Ignored: boolean } | { ok: false; reason: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (error) { return { ok: false, reason: `sidecar JSON 非法：${error instanceof Error ? error.message : String(error)}` }; }
  if (!isRecord(parsed) || parsed["schema"] !== EVIDENCE_META_SCHEMA) return { ok: false, reason: `sidecar schema 必须为 ${EVIDENCE_META_SCHEMA}` };
  const p0Ignored = Object.prototype.hasOwnProperty.call(parsed, "p0");
  if (Array.isArray(parsed["collection"])) {
    if (typeof parsed["generatedAt"] !== "string") return { ok: false, reason: "collection 缺/非法字段 generatedAt" };
    const items: EvidenceCollectionItem[] = [];
    for (const [index, raw] of (parsed["collection"] as unknown[]).entries()) {
      if (!isRecord(raw)) return { ok: false, reason: `collection[${index}] 非法` };
      if (typeof raw["artifact"] !== "string" || typeof raw["sha256"] !== "string" || typeof raw["bytes"] !== "number" || typeof raw["lines"] !== "number") {
        return { ok: false, reason: `collection[${index}] 缺 artifact/sha256/bytes/lines` };
      }
      items.push({
        artifact: raw["artifact"], sha256: raw["sha256"], bytes: raw["bytes"], lines: raw["lines"],
        ...(isRecord(raw["metrics"]) ? { metrics: raw["metrics"] as Record<string, number> } : {}),
        ...(Array.isArray(raw["acIds"]) ? { acIds: raw["acIds"].filter((x): x is string => typeof x === "string") } : {}),
      });
    }
    return { ok: true, p0Ignored, meta: { schema: EVIDENCE_META_SCHEMA, collection: items, generatedAt: typeof parsed["generatedAt"] === "string" ? parsed["generatedAt"] : "", ...(Array.isArray(parsed["acIds"]) ? { acIds: parsed["acIds"].filter((x): x is string => typeof x === "string") } : {}) } };
  }
  for (const field of ["artifact", "sha256", "bytes", "lines", "generatedAt"] as const) {
    const expectedType = field === "bytes" || field === "lines" ? "number" : "string";
    if (typeof parsed[field] !== expectedType) return { ok: false, reason: `sidecar 缺/非法字段 ${field}` };
  }
  return {
    ok: true,
    p0Ignored,
    meta: {
      schema: EVIDENCE_META_SCHEMA,
      artifact: String(parsed["artifact"]),
      sha256: String(parsed["sha256"]),
      bytes: Number(parsed["bytes"]),
      lines: Number(parsed["lines"]),
      generatedAt: String(parsed["generatedAt"]),
      ...(typeof parsed["command"] === "string" ? { command: parsed["command"] } : {}),
      ...(typeof parsed["exitCode"] === "number" ? { exitCode: parsed["exitCode"] } : {}),
      ...(isRecord(parsed["metrics"]) ? { metrics: parsed["metrics"] as Record<string, number> } : {}),
      ...(Array.isArray(parsed["acIds"]) ? { acIds: parsed["acIds"].filter((x): x is string => typeof x === "string") } : {}),
      ...(typeof parsed["owner"] === "string" ? { owner: parsed["owner"] } : {}),
    },
  };
}

/** 单证据检查：criteria 决定 priority；sidecar 与实际文件/自述比对；P0 缺 sidecar/不符 fail-closed。 */
export async function checkEvidence(input: {
  projectRoot: string;
  acId: string;
  criteria: CriteriaDoc;
  artifact: string;
  metaPath?: string;
  /** 调用角色证据范围（evidence_check 注入；缺省＝数据层直用，不做角色裁剪）。 */
  scopeRoots?: string[];
}): Promise<EvidenceCheckResult> {
  const acId = normalizeAcId(input.acId);
  const entry = acId === undefined ? undefined : input.criteria.criteria.find((item) => item.id === acId);
  if (entry === undefined) {
    const rejection = makeMechanicalRejection("criteria-mismatch", [`AC ${String(input.acId)} 不在 criteria`], { docs: [input.criteria.path] });
    return { ok: false, valid: false, unverified: false, legacy: false, p0Ignored: false, mismatch: rejection.missing, rejection };
  }
  const artifactPath = validateEvidencePath(input.artifact);
  if (!artifactPath.ok) return failureResult(EVIDENCE_PATH_CODE, [artifactPath.reason], [input.criteria.path], entry.priority);
  if (input.scopeRoots !== undefined && !isWithinEvidenceRoots(artifactPath.path, input.scopeRoots)) {
    return failureResult(EVIDENCE_SCOPE_CODE, [`artifact ${artifactPath.path} 不在调用角色的模块证据范围`], [input.criteria.path], entry.priority);
  }
  const metaPath = validateEvidencePath(input.metaPath ?? `${artifactPath.path}.meta.json`);
  if (!metaPath.ok) return failureResult(EVIDENCE_PATH_CODE, [metaPath.reason], [input.criteria.path], entry.priority);
  if (input.scopeRoots !== undefined && !isWithinEvidenceRoots(metaPath.path, input.scopeRoots)) {
    return failureResult(EVIDENCE_SCOPE_CODE, [`metaPath ${metaPath.path} 不在调用角色的模块证据范围`], [input.criteria.path], entry.priority);
  }
  const metaRel = metaPath.path;
  let actual: ArtifactActual;
  try { actual = await readArtifact(input.projectRoot, artifactPath.path); }
  catch {
    const rejection = makeMechanicalRejection("criteria-missing", [`证据 artifact 不可读：${artifactPath.path}`], { docs: [input.criteria.path] });
    return { ok: false, valid: false, priority: entry.priority, unverified: false, legacy: false, p0Ignored: false, mismatch: rejection.missing, rejection };
  }
  let metaText: string;
  try { metaText = await readFile(path.join(input.projectRoot, metaRel), "utf8"); }
  catch {
    if (entry.priority === "P0") {
      const rejection = makeMechanicalRejection("evidence-mismatch", [`P0 证据缺 sidecar：${metaRel}`], { docs: [metaRel, actual.path] });
      return { ok: false, valid: false, priority: entry.priority, unverified: false, legacy: false, p0Ignored: false, actual, mismatch: rejection.missing, rejection };
    }
    return { ok: true, valid: false, priority: entry.priority, unverified: true, legacy: true, p0Ignored: false, actual, mismatch: [] };
  }
  const parsedMeta = parseEvidenceMeta(metaText);
  if (!parsedMeta.ok) {
    const rejection = makeMechanicalRejection("evidence-mismatch", [parsedMeta.reason], { docs: [metaRel] });
    return { ok: false, valid: false, priority: entry.priority, unverified: false, legacy: false, p0Ignored: false, actual, mismatch: [parsedMeta.reason], rejection };
  }
  if ("collection" in parsedMeta.meta) {
    // F1：collection sidecar 对真实路径同样生效——单证据入口自动路由到 collection 检查。
    return checkEvidenceCollection({
      projectRoot: input.projectRoot,
      acId: input.acId,
      criteria: input.criteria,
      metaPath: metaRel,
      ...(input.scopeRoots !== undefined ? { scopeRoots: input.scopeRoots } : {}),
    });
  }
  const meta = parsedMeta.meta;
  const claims = parseArtifactClaims(actual.text);
  const mismatch: string[] = [];
  if (meta.artifact !== actual.path) mismatch.push(`sidecar artifact=${meta.artifact} 与检查路径=${actual.path} 不一致`);
  if (meta.sha256 !== actual.sha256) mismatch.push("sidecar sha256 与 artifact 实际不一致");
  if (meta.bytes !== actual.bytes) mismatch.push(`sidecar bytes=${meta.bytes} 与实际 ${actual.bytes} 不一致`);
  if (meta.lines !== actual.lines) mismatch.push(`sidecar lines=${meta.lines} 与实际 ${actual.lines} 不一致`);
  if (claims.lines !== undefined && claims.lines !== actual.lines) mismatch.push(`artifact 自述行数 ${claims.lines} 与实际 ${actual.lines} 不一致`);
  if (claims.pass !== undefined && meta.metrics?.["pass"] !== undefined && claims.pass !== meta.metrics["pass"]) {
    mismatch.push(`artifact 自述 pass ${claims.pass} 与 sidecar metrics.pass ${meta.metrics["pass"]} 不一致`);
  }
  if (claims.fail !== undefined && meta.metrics?.["fail"] !== undefined && claims.fail !== meta.metrics["fail"]) {
    mismatch.push(`artifact 自述 fail ${claims.fail} 与 sidecar metrics.fail ${meta.metrics["fail"]} 不一致`);
  }
  const generated = Date.parse(meta.generatedAt);
  if (!Number.isFinite(generated)) mismatch.push("sidecar generatedAt 非 ISO 时间");
  else if (generated < actual.mtimeMs - 1000) mismatch.push("sidecar generatedAt 早于 artifact 修改时间（stale）");
  const acIds = meta.acIds ?? [];
  if (acId !== undefined && !acIds.some((id) => normalizeAcId(id) === acId)) mismatch.push(`sidecar acIds 不含 ${acId}`);
  if (mismatch.length > 0) {
    const rejection = makeMechanicalRejection("evidence-mismatch", mismatch, { docs: [metaRel, actual.path] });
    return { ok: false, valid: false, priority: entry.priority, unverified: false, legacy: false, p0Ignored: parsedMeta.p0Ignored, actual, meta, claims, mismatch, rejection };
  }
  return { ok: true, valid: true, priority: entry.priority, unverified: false, legacy: false, p0Ignored: parsedMeta.p0Ignored, actual, meta, claims, mismatch: [] };
}

/** 多文件 collection sidecar 检查（每文件 path/hash/bytes/lines + collection generatedAt/mtime + 自述）。 */
export async function checkEvidenceCollection(input: {
  projectRoot: string;
  acId: string;
  criteria: CriteriaDoc;
  metaPath: string;
  /** 调用角色证据范围（evidence_check 注入；缺省＝数据层直用，不做角色裁剪）。 */
  scopeRoots?: string[];
}): Promise<EvidenceCheckResult> {
  const acId = normalizeAcId(input.acId);
  const entry = acId === undefined ? undefined : input.criteria.criteria.find((item) => item.id === acId);
  if (entry === undefined) {
    const rejection = makeMechanicalRejection("criteria-mismatch", [`AC ${String(input.acId)} 不在 criteria`], { docs: [input.criteria.path] });
    return { ok: false, valid: false, unverified: false, legacy: false, p0Ignored: false, mismatch: rejection.missing, rejection };
  }
  const metaPath = validateEvidencePath(input.metaPath);
  if (!metaPath.ok) return failureResult(EVIDENCE_PATH_CODE, [metaPath.reason], [input.criteria.path], entry.priority);
  if (input.scopeRoots !== undefined && !isWithinEvidenceRoots(metaPath.path, input.scopeRoots)) {
    return failureResult(EVIDENCE_SCOPE_CODE, [`collection metaPath ${metaPath.path} 不在调用角色的模块证据范围`], [input.criteria.path], entry.priority);
  }
  const metaRel = metaPath.path;
  let text: string;
  try { text = await readFile(path.join(input.projectRoot, metaRel), "utf8"); }
  catch {
    if (entry.priority === "P0") {
      const rejection = makeMechanicalRejection("evidence-mismatch", [`P0 collection sidecar 缺失：${metaRel}`], { docs: [metaRel] });
      return { ok: false, valid: false, priority: entry.priority, unverified: false, legacy: false, p0Ignored: false, mismatch: rejection.missing, rejection };
    }
    return { ok: true, valid: false, priority: entry.priority, unverified: true, legacy: true, p0Ignored: false, mismatch: [] };
  }
  const parsed = parseEvidenceMeta(text);
  if (!parsed.ok || !("collection" in parsed.meta)) {
    const rejection = makeMechanicalRejection("evidence-mismatch", [parsed.ok ? "sidecar 不是 collection" : parsed.reason], { docs: [metaRel] });
    return { ok: false, valid: false, priority: entry.priority, unverified: false, legacy: false, p0Ignored: parsed.ok ? parsed.p0Ignored : false, mismatch: rejection.missing, rejection };
  }
  const mismatch: string[] = [];
  const generated = Date.parse(parsed.meta.generatedAt);
  if (!Number.isFinite(generated)) mismatch.push("collection generatedAt 非 ISO 时间");
  if (parsed.meta.collection.length === 0) mismatch.push("collection 为空（没有可校验文件）");
  if (acId !== undefined && !(parsed.meta.acIds ?? []).some((id) => normalizeAcId(id) === acId)) mismatch.push(`collection acIds 不含 ${acId}`);
  for (const item of parsed.meta.collection) {
    const itemPath = validateEvidencePath(item.artifact);
    if (!itemPath.ok) {
      return failureResult(EVIDENCE_PATH_CODE, [`collection 项路径非法：${itemPath.reason}`], [metaRel], entry.priority);
    }
    if (input.scopeRoots !== undefined && !isWithinEvidenceRoots(itemPath.path, input.scopeRoots)) {
      return failureResult(EVIDENCE_SCOPE_CODE, [`collection 项 ${itemPath.path} 不在调用角色的模块证据范围`], [metaRel], entry.priority);
    }
    try {
      const actual = await readArtifact(input.projectRoot, itemPath.path);
      if (actual.sha256 !== item.sha256) mismatch.push(`${itemPath.path}: sha256 不一致`);
      if (actual.bytes !== item.bytes) mismatch.push(`${itemPath.path}: bytes 不一致`);
      if (actual.lines !== item.lines) mismatch.push(`${itemPath.path}: lines 不一致`);
      if (Number.isFinite(generated) && generated < actual.mtimeMs - 1000) {
        mismatch.push(`${itemPath.path}: artifact 修改晚于 collection generatedAt（stale）`);
      }
      const claims = parseArtifactClaims(actual.text);
      if (claims.lines !== undefined && claims.lines !== actual.lines) mismatch.push(`${itemPath.path}: 自述行数 ${claims.lines} 与实际 ${actual.lines} 不一致`);
      if (claims.pass !== undefined && item.metrics?.["pass"] !== undefined && claims.pass !== item.metrics["pass"]) {
        mismatch.push(`${itemPath.path}: 自述 pass ${claims.pass} 与 sidecar metrics.pass ${item.metrics["pass"]} 不一致`);
      }
      if (claims.fail !== undefined && item.metrics?.["fail"] !== undefined && claims.fail !== item.metrics["fail"]) {
        mismatch.push(`${itemPath.path}: 自述 fail ${claims.fail} 与 sidecar metrics.fail ${item.metrics["fail"]} 不一致`);
      }
      if (item.acIds !== undefined && acId !== undefined && !item.acIds.some((id) => normalizeAcId(id) === acId)) mismatch.push(`${itemPath.path}: acIds 不含 ${acId}`);
    } catch {
      mismatch.push(`${itemPath.path}: 不可读`);
    }
  }
  if (mismatch.length > 0) {
    const rejection = makeMechanicalRejection("evidence-mismatch", mismatch, { docs: [metaRel] });
    return { ok: false, valid: false, priority: entry.priority, unverified: false, legacy: false, p0Ignored: parsed.p0Ignored, meta: parsed.meta, mismatch, rejection };
  }
  return { ok: true, valid: true, priority: entry.priority, unverified: false, legacy: false, p0Ignored: parsed.p0Ignored, meta: parsed.meta, mismatch: [] };
}

/** AcceptanceFact（应用派生 priority；角色自报 p0 一律忽略）。 */
export interface AcceptanceFact {
  acId: string;
  priority: AcPriority;
  artifact?: string;
  metaPath?: string;
  valid: boolean;
  unverified: boolean;
  legacy: boolean;
  mismatch: string[];
}
export function deriveAcceptanceFact(criteria: CriteriaDoc, input: { acId: string; artifact?: string; metaPath?: string }): AcceptanceFact | CriteriaFailure {
  const id = normalizeAcId(input.acId);
  const entry = id === undefined ? undefined : criteria.criteria.find((item) => item.id === id);
  if (id === undefined || entry === undefined) {
    return criteriaFailure("criteria-mismatch", `AC ${input.acId} 不在 criteria`, [criteria.path]);
  }
  return {
    acId: id,
    priority: entry.priority,
    ...(input.artifact !== undefined ? { artifact: input.artifact } : {}),
    ...(input.metaPath !== undefined ? { metaPath: input.metaPath } : {}),
    valid: false,
    unverified: true,
    legacy: false,
    mismatch: [],
  };
}
