// src/common/编排/basis-guard.ts
// 编排主属（T3「两条固定工作流路径」B0，2026-11-10）：依据（basis）文档发现/有界读取/哈希/漂移**骨架**。
//
// 依据：实现级方案 v1.3 §5.3（文档发现、32 文件 / 单文件 4 MiB / 总 8 MiB 读取预算、SHA-256/bytes、
// `basis.recorded`）、§7.2（drift 校验时机）、§4.3（Q4 路径 B `reason:"path-b"` 只读快照）；
// B1 验收 AC-19/T-08。**B0 不实现**完整 verify 接线（A11/B3/A12/A13 关键门在 B3/B4）、
// `basis.amended` 修正流程、`basis.verified` 节流写入（B1）。
//
// 纪律：
//  · 路径 B `reason:"path-b"` 是**只读文档快照**：不产生写权、drift fail-closed、不视为基线
//    3 件小事、不弹卡（v1.3 §4.3/协调方决策 #3）。本模块只提供标记判定，不授予任何权限。
//  · 事件形状/枚举单一来源 = `model/runtime.ts`（`isBasisEvent`/`BasisDocumentRef`）；
//  · 读取预算与 trunk 已废弃的 16 MiB 清单预算不同数、不同义（G-7），码 = `basis-document-budget`。

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  BasisDocumentRef,
  BasisRecordedEvent,
  BasisTeamPlanRef,
  WorkflowRepoSnapshot,
} from "../../model/runtime.ts";
import { BASIS_LEDGER_SCHEMA, isBasisEvent } from "../../model/runtime.ts";

// —————————————— 预算 / 稳定码 ——————————————

/** 读取/哈希预算（v1.3 §5.3 G-7）：最多 32 个文件。 */
export const BASIS_MAX_FILES = 32;
/** 单文件 ≤ 4 MiB。 */
export const BASIS_MAX_FILE_BYTES = 4 * 1024 * 1024;
/** 总 ≤ 8 MiB。 */
export const BASIS_MAX_TOTAL_BYTES = 8 * 1024 * 1024;

/** 预算超限（v1.3 附录 C；与已取消的 trunk 16 MiB 清单预算不同数、不同义）。 */
export const BASIS_BUDGET_CODE = "basis-document-budget";
/** 发现出的必需依据文档缺失。 */
export const BASIS_DOCUMENT_MISSING_CODE = "basis-document-missing";
/** 文档不可读（权限/IO；缺失单独判定）。 */
export const BASIS_DOCUMENT_UNREADABLE_CODE = "basis-document-unreadable";
/** 当前字节哈希与 `basis.recorded` 不一致（消费方 fail-closed，不派实现/不发布）。 */
export const BASIS_DRIFT_CODE = "basis-drift";
/** 路径 B 只读快照标记（Q4；不产生写权）。 */
export const BASIS_REASON_PATH_B = "path-b";

/** 依据文档发现规格（kind → 目录/命名 `<flowId>-<name>-vN.md`；required 缺失即失败）。 */
export interface BasisDocumentSpec {
  kind: string;
  dir: string;
  name: string;
  required: boolean;
}

/** v1.3 §5.3 文档发现清单；团队计划（`docs/scheduling/<flowId>-team-vN.md`）单独字段。 */
export const BASIS_DOCUMENT_SPECS: readonly BasisDocumentSpec[] = Object.freeze([
  { kind: "intent", dir: "docs/product", name: "intent", required: true },
  { kind: "proposal", dir: "docs/proposals", name: "proposal", required: true },
  { kind: "modules", dir: "docs/proposals", name: "modules", required: true },
  { kind: "roster", dir: "docs/proposals", name: "roster", required: true },
  { kind: "architecture", dir: "docs/contracts", name: "architecture", required: true },
  { kind: "assets", dir: "docs/contracts", name: "assets", required: false },
]);

export const BASIS_TEAM_PLAN_SPEC: BasisDocumentSpec = Object.freeze({
  kind: "teamPlan",
  dir: "docs/scheduling",
  name: "team",
  required: false,
});

/** 已发现的依据文档（路径为项目相对 POSIX）。 */
export interface DiscoveredBasisDocument {
  kind: string;
  path: string;
  version: number;
  required: boolean;
}

export interface BasisDiscoveryResult {
  documents: DiscoveredBasisDocument[];
  /** 缺失的必需 kind（不含可选 assets/团队计划）。 */
  missing: string[];
  /** 最新团队计划（存在时；`teamPlan` 单独字段）。 */
  teamPlan?: DiscoveredBasisDocument;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 在单个目录按 `<flowId>-<name>-vN.md` 取最新版本（不依赖 run；纯发现，不读内容）。 */
async function latestVersionedInDir(
  projectRoot: string,
  flowId: string,
  spec: BasisDocumentSpec,
): Promise<{ name: string; version: number } | undefined> {
  const dirAbs = path.join(projectRoot, ...spec.dir.split("/"));
  let names: string[];
  try {
    names = await fs.readdir(dirAbs);
  } catch {
    return undefined;
  }
  const pattern = new RegExp(`^${escapeRegExp(flowId)}-${escapeRegExp(spec.name)}-v(\\d+)\\.md$`);
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
 * 按 flowId 发现最新依据文档（v1.3 §5.3；无 I/O 之外的副作用、不写盘）。
 * 缺失的必需文档只**如实列出**（`missing`），是否失败由调用方决定（`recordBasisDocuments` fail-closed）。
 */
export async function discoverBasisDocuments(projectRoot: string, flowId: string): Promise<BasisDiscoveryResult> {
  const flow = typeof flowId === "string" ? flowId.trim() : "";
  const documents: DiscoveredBasisDocument[] = [];
  const missing: string[] = [];
  if (flow === "") {
    return { documents, missing: BASIS_DOCUMENT_SPECS.filter((spec) => spec.required).map((spec) => spec.kind) };
  }
  for (const spec of BASIS_DOCUMENT_SPECS) {
    const found = await latestVersionedInDir(projectRoot, flow, spec);
    if (found === undefined) {
      if (spec.required) missing.push(spec.kind);
      continue;
    }
    documents.push({
      kind: spec.kind,
      path: `${spec.dir}/${found.name}`,
      version: found.version,
      required: spec.required,
    });
  }
  const team = await latestVersionedInDir(projectRoot, flow, BASIS_TEAM_PLAN_SPEC);
  return {
    documents,
    missing,
    ...(team !== undefined
      ? { teamPlan: { kind: "teamPlan", path: `${BASIS_TEAM_PLAN_SPEC.dir}/${team.name}`, version: team.version, required: false } }
      : {}),
  };
}

// —————————————— 有界读取 / SHA-256 / bytes ——————————————

export function sha256OfBasisBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isProjectRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  if (value.startsWith("/") || value.includes("\\") || /^[a-zA-Z]:/.test(value)) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export type BasisReadResult =
  | { ok: true; documents: BasisDocumentRef[] }
  | { ok: false; code: string; message: string };

export interface BasisReadOptions {
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
}

/**
 * 有界读取文档并计算 SHA-256/bytes（v1.3 §5.3）：
 * 文件数 ≤32、单文件 ≤4 MiB、总 ≤8 MiB；超限 `basis-document-budget`（附实际计数）。
 * 缺失 `basis-document-missing`；其他读取失败 `basis-document-unreadable`（附真实路径/错误）。
 */
export async function readBasisDocuments(
  projectRoot: string,
  refs: readonly { kind: string; path: string; version: number }[],
  options: BasisReadOptions = {},
): Promise<BasisReadResult> {
  const maxFiles = options.maxFiles ?? BASIS_MAX_FILES;
  const maxFileBytes = options.maxFileBytes ?? BASIS_MAX_FILE_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? BASIS_MAX_TOTAL_BYTES;
  if (refs.length > maxFiles) {
    return {
      ok: false,
      code: BASIS_BUDGET_CODE,
      message: `依据文档预算超限：文件数 ${refs.length} > ${maxFiles}`,
    };
  }
  const documents: BasisDocumentRef[] = [];
  let total = 0;
  for (const ref of refs) {
    if (!isProjectRelativePath(ref.path)) {
      return { ok: false, code: BASIS_DOCUMENT_UNREADABLE_CODE, message: `依据文档路径非法：${String(ref.path)}` };
    }
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(path.join(projectRoot, ...ref.path.split("/")));
    } catch (err) {
      const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
      return {
        ok: false,
        code: missing ? BASIS_DOCUMENT_MISSING_CODE : BASIS_DOCUMENT_UNREADABLE_CODE,
        message: `${missing ? "缺少" : "无法读取"}依据文档 ${ref.path}：${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (bytes.byteLength > maxFileBytes) {
      return {
        ok: false,
        code: BASIS_BUDGET_CODE,
        message: `依据文档预算超限：${ref.path} 单文件 ${bytes.byteLength} 字节 > ${maxFileBytes}`,
      };
    }
    total += bytes.byteLength;
    if (total > maxTotalBytes) {
      return {
        ok: false,
        code: BASIS_BUDGET_CODE,
        message: `依据文档预算超限：累计 ${total} 字节 > ${maxTotalBytes}（含 ${ref.path}）`,
      };
    }
    documents.push({ kind: ref.kind, path: ref.path, version: ref.version, sha256: sha256OfBasisBytes(bytes), bytes: bytes.byteLength });
  }
  return { ok: true, documents };
}

export type BasisRecordReadResult =
  | { ok: true; documents: BasisDocumentRef[]; teamPlan?: BasisTeamPlanRef }
  | { ok: false; code: string; message: string };

/**
 * 发现 + 有界读取（`basis.recorded` 的 documents/teamPlan 数据面骨架）：
 * 必需文档缺失 ⇒ `basis-document-missing`；读取/预算错误原样上抛。
 * 团队计划存在时一并入账（单独字段），并计入同一读取预算。
 */
export async function recordBasisDocuments(
  projectRoot: string,
  flowId: string,
  options: BasisReadOptions = {},
): Promise<BasisRecordReadResult> {
  const discovery = await discoverBasisDocuments(projectRoot, flowId);
  if (discovery.missing.length > 0) {
    return {
      ok: false,
      code: BASIS_DOCUMENT_MISSING_CODE,
      message: `缺少必需依据文档：${discovery.missing.join("、")}`,
    };
  }
  const refs = [
    ...discovery.documents.map((doc) => ({ kind: doc.kind, path: doc.path, version: doc.version })),
    ...(discovery.teamPlan !== undefined
      ? [{ kind: discovery.teamPlan.kind, path: discovery.teamPlan.path, version: discovery.teamPlan.version }]
      : []),
  ];
  const read = await readBasisDocuments(projectRoot, refs, options);
  if (!read.ok) return read;
  const teamPlanRef = discovery.teamPlan === undefined
    ? undefined
    : read.documents.find((doc) => doc.path === discovery.teamPlan?.path);
  const documents = read.documents.filter((doc) => doc.path !== discovery.teamPlan?.path);
  return {
    ok: true,
    documents,
    ...(teamPlanRef !== undefined
      ? { teamPlan: { path: teamPlanRef.path, version: teamPlanRef.version, sha256: teamPlanRef.sha256 } }
      : {}),
  };
}

// —————————————— drift 校验骨架（完整接线在 B3/B4） ——————————————

export interface BasisDriftEntry {
  path: string;
  expectedSha256: string;
  actualSha256: string | null;
}

export interface BasisVerifyResult {
  /** true = 无漂移；false 时消费方必须 fail-closed（`basis-drift`）。 */
  ok: boolean;
  code?: typeof BASIS_DRIFT_CODE;
  drift: BasisDriftEntry[];
}

/**
 * 重算当前字节 SHA-256 与 `basis.recorded` 记录比对（v1.3 §7.2 骨架）。
 * 文件缺失/不可读 ⇒ `actualSha256:null`（按漂移处理，不猜内容）。
 * B0 只提供纯校验；A11/B3/A12/A13 的调用时机与 `basis.drift` 记账在 B1/B3/B4。
 */
export async function verifyBasisDocuments(
  projectRoot: string,
  documents: readonly { path: string; sha256: string }[],
): Promise<BasisVerifyResult> {
  const drift: BasisDriftEntry[] = [];
  for (const doc of documents) {
    let actualSha256: string | null = null;
    if (isProjectRelativePath(doc.path)) {
      try {
        actualSha256 = sha256OfBasisBytes(await fs.readFile(path.join(projectRoot, ...doc.path.split("/"))));
      } catch {
        actualSha256 = null;
      }
    }
    if (actualSha256 !== doc.sha256) {
      drift.push({ path: doc.path, expectedSha256: doc.sha256, actualSha256 });
    }
  }
  return drift.length === 0
    ? { ok: true, drift }
    : { ok: false, code: BASIS_DRIFT_CODE, drift };
}

// —————————————— `basis.recorded` 构造/校验骨架 ——————————————

export interface BuildBasisRecordedInput {
  workflowId: string;
  flowId: string;
  documents: BasisDocumentRef[];
  teamPlan?: BasisTeamPlanRef | null;
  repo?: WorkflowRepoSnapshot;
  reviewRoleId?: string;
  operationId: string;
  idempotencyKey: string;
  reason: BasisRecordedEvent["reason"];
  /** 注入时钟（默认 `new Date()`；测试固定时间用）。 */
  now?: () => Date;
}

/** `basisId` 确定性派生（`bas-` + 幂等键 SHA-256 前 24 hex；无时钟/随机）。 */
export function basisIdFor(idempotencyKey: string): string {
  return `bas-${createHash("sha256").update(idempotencyKey, "utf8").digest("hex").slice(0, 24)}`;
}

/** 构造 `basis.recorded`（应用写入；`recordedBy:"application"`，不信任模型自报）。 */
export function buildBasisRecordedEvent(input: BuildBasisRecordedInput): BasisRecordedEvent {
  const at = (input.now ?? (() => new Date()))().toISOString();
  return {
    v: 1,
    at,
    schema: BASIS_LEDGER_SCHEMA,
    kind: "basis.recorded",
    basisId: basisIdFor(input.idempotencyKey),
    workflowId: input.workflowId,
    flowId: input.flowId,
    documents: input.documents,
    ...(input.teamPlan !== undefined ? { teamPlan: input.teamPlan } : {}),
    ...(input.repo !== undefined ? { repo: input.repo } : {}),
    ...(input.reviewRoleId !== undefined ? { reviewRoleId: input.reviewRoleId } : {}),
    operationId: input.operationId,
    idempotencyKey: input.idempotencyKey,
    reason: input.reason,
    recordedBy: "application",
  };
}

/** `basis.recorded` 形状/语义骨架校验（单一守卫 = Model `isBasisEvent` + kind 收窄）。 */
export function isBasisRecordedEvent(value: unknown): value is BasisRecordedEvent {
  return isBasisEvent(value) && value.kind === "basis.recorded";
}

/**
 * Q4 路径 B 只读快照判定：`reason:"path-b"` 表示**文档快照只读**——不产生写权、drift fail-closed、
 * 不视为基线 3 件小事、不弹卡（协调方决策 #3）。本函数只判标记，不授予任何权限。
 */
export function isBasisReadOnlySnapshot(event: BasisRecordedEvent): boolean {
  return event.reason === BASIS_REASON_PATH_B;
}
