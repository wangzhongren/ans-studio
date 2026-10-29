// src/common/门禁引擎/versioned-doc-guard.ts
// 2026-10-29（客户追加口径 / v2.8 R6/R9）：版本化文档**只读旧版**的结构性守卫。
//
// 规则：`docs/product/<flowId>-intent-vN.md`、`docs/proposals/<flowId>-proposal-vN.md`、
// `docs/proposals/<flowId>-roster-vN.md`、`docs/proposals/<flowId>-modules-vN.md`、
// `docs/proposals/<flowId>-topology-vN.md`、`docs/contracts/<flowId>-architecture-vN.md`
// 等版本化文件一旦存在，任何通道（write_file/edit_file/cp/tee/shell 脚本）不得覆盖——只能新建 vN+1。
// 本模块只做**路径形状 + 是否存在**的机械判定；不读账本、不写盘（R9 的基线另由 session 持久化）。
import { existsSync, readdirSync } from "node:fs";
import { link, mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const VERSIONED_DOC_PATTERNS: readonly RegExp[] = [
  /^docs\/product\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-intent-v[1-9]\d*\.md$/i,
  /^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-roster-v[1-9]\d*\.md$/i,
  /^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-modules-v[1-9]\d*\.md$/i,
  /^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-topology-v[1-9]\d*\.md$/i,
  /^docs\/proposals\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-proposal-v[1-9]\d*\.md$/i,
  /^docs\/contracts\/[a-z0-9][a-z0-9-]{0,62}[a-z0-9]-architecture-v[1-9]\d*\.md$/i,
];

/** 项目相对 POSIX 路径归一化（去掉 `./`、反斜杠）；失败返回 undefined。 */
export function normalizeVersionedDocPath(relPath: string): string | undefined {
  if (typeof relPath !== "string") return undefined;
  const value = relPath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (value === "" || value.startsWith("/") || value.includes("../") || value.startsWith("..")) return undefined;
  return value;
}

export function isVersionedDocPath(relPath: string): boolean {
  const value = normalizeVersionedDocPath(relPath);
  if (value === undefined) return false;
  return VERSIONED_DOC_PATTERNS.some((pattern) => pattern.test(value));
}

/** 版本号（从文件名 -vN.md 提取）；非版本化返回 undefined。 */
export function versionedDocVersionOf(relPath: string): number | undefined {
  const value = normalizeVersionedDocPath(relPath);
  if (value === undefined) return undefined;
  const match = /-v(\d+)\.md$/i.exec(value);
  if (match === null) return undefined;
  const version = Number(match[1]);
  return Number.isInteger(version) && version >= 1 ? version : undefined;
}

export type VersionedDocDecision = { allowed: true } | { allowed: false; reason: string };

/** 覆盖既有版本化文档 ⇒ deny（不进入审批；新建 vN+1 不受影响）。 */
export function versionedDocOverwriteDecision(input: { relPath: string; exists: boolean }): VersionedDocDecision {
  const rel = normalizeVersionedDocPath(input.relPath);
  if (rel === undefined || !isVersionedDocPath(rel)) return { allowed: true };
  if (input.exists !== true) return { allowed: true };
  return {
    allowed: false,
    reason:
      `版本化文档只读：${rel} 已存在，禁止覆盖/原地修改；` +
      "请新建下一个版本（-vN+1）并在引用链中指向最新版本。",
  };
}

/** 同步存在性探测（门禁层用；调用方仍以注入的 exists 做单测）。 */
export function versionedDocExists(projectRoot: string, relPath: string, exists: (abs: string) => boolean = existsSync): boolean {
  const rel = normalizeVersionedDocPath(relPath);
  if (rel === undefined || !isVersionedDocPath(rel)) return false;
  return exists(path.join(projectRoot, rel));
}

/** 全通道统一入口：对 argv/脚本解析出的全部候选版本化路径做只读检查（任一覆盖既有版本 ⇒ deny）。 */
export function checkVersionedDocWrite(input: {
  projectRoot: string;
  relPaths: readonly string[];
  exists?: (abs: string) => boolean;
}): VersionedDocDecision {
  for (const candidate of input.relPaths) {
    const rel = normalizeVersionedDocPath(candidate);
    if (rel === undefined || !isVersionedDocPath(rel)) continue;
    const present = input.exists !== undefined ? input.exists(path.join(input.projectRoot, rel)) : existsSync(path.join(input.projectRoot, rel));
    const decision = versionedDocOverwriteDecision({ relPath: rel, exists: present });
    if (!decision.allowed) return decision;
  }
  return { allowed: true };
}

/** 受管版本化路径清单（供审批上下文/诊断；只读扫描三个目录一层）。 */
export async function protectedVersionedPaths(projectRoot: string): Promise<string[]> {
  const out: string[] = [];
  for (const dir of VERSIONED_DIRS) {
    let names: string[];
    try {
      names = await readdir(path.join(projectRoot, dir));
    } catch {
      continue;
    }
    for (const name of names) {
      const rel = `${dir}/${name}`;
      if (isVersionedDocPath(rel)) out.push(rel);
    }
  }
  return out.sort();
}

/** 同步版本（shell 守卫同步链路用）：受管版本化路径清单。 */
export function protectedVersionedPathsSync(projectRoot: string): string[] {
  const out: string[] = [];
  for (const dir of VERSIONED_DIRS) {
    let names: string[];
    try {
      names = readdirSync(path.join(projectRoot, dir));
    } catch {
      continue;
    }
    for (const name of names) {
      const rel = `${dir}/${name}`;
      if (isVersionedDocPath(rel)) out.push(rel);
    }
  }
  return out.sort();
}

/** R9：旧版 hash 基线（应用独占 .ans 状态，角色不可写）。 */
export const VERSION_BASELINE_REL = ".ans/state/versions.jsonl";
/** R9：基线与 marker 的 TOFU 边界——仅二者都不存在时才能初始化；marker 存在后一律 fail-closed。 */
export const VERSION_INITIALIZED_REL = ".ans/state/versions.initialized";
export const VERSION_LOCK_REL = ".ans/state/versions.lock";

export interface VersionBaselineRecord {
  v: 1;
  flowId: string;
  doc: "intent" | "proposal" | "roster" | "modules" | "topology" | "architecture";
  version: number;
  path: string;
  sha256: string;
  recordedAt: string;
  event: "baseline" | "version-added";
  recordedBy: string;
}

const VERSIONED_DIRS = ["docs/product", "docs/proposals", "docs/contracts"] as const;

function docKindOf(rel: string): VersionBaselineRecord["doc"] | undefined {
  if (/^docs\/product\/[^/]+-intent-v\d+\.md$/i.test(rel)) return "intent";
  if (/^docs\/proposals\/[^/]+-roster-v\d+\.md$/i.test(rel)) return "roster";
  if (/^docs\/proposals\/[^/]+-modules-v\d+\.md$/i.test(rel)) return "modules";
  if (/^docs\/proposals\/[^/]+-topology-v\d+\.md$/i.test(rel)) return "topology";
  if (/^docs\/proposals\/[^/]+-proposal-v\d+\.md$/i.test(rel)) return "proposal";
  if (/^docs\/contracts\/[^/]+-architecture-v\d+\.md$/i.test(rel)) return "architecture";
  return undefined;
}

function flowIdOf(rel: string): string {
  const base = rel.split("/").pop() ?? "";
  const match = /^(.+?)-(?:intent|roster|modules|topology|proposal|architecture)?-?v\d+\.md$/i.exec(base);
  return match?.[1] ?? "";
}

/** canonical 逻辑路径（唯一键由 flowId/doc/version 组成；path 不带 -vN）。 */
function canonicalPathFor(flowId: string, doc: VersionBaselineRecord["doc"]): string {
  if (doc === "intent") return `docs/product/${flowId}-intent`;
  if (doc === "architecture") return `docs/contracts/${flowId}-architecture`;
  return `docs/proposals/${flowId}-${doc}`;
}

/** 实际文件路径：新记录 canonical + `-vN.md`；v2.10 旧记录 path 已是实际路径时兼容。 */
function actualPathForRecord(record: VersionBaselineRecord): string {
  if (/-v\d+\.md$/i.test(record.path)) return record.path;
  return `${record.path}-v${record.version}.md`;
}

type BaselineRead =
  | { ok: true; records: VersionBaselineRecord[]; initialized: boolean }
  | { ok: false; reason: "baseline-missing" | "baseline-corrupt" | "marker-missing" };

async function readBaselines(projectRoot: string, markerExists?: (abs: string) => boolean): Promise<BaselineRead> {
  const marker = markerExists ?? existsSync;
  const markerPresent = marker(path.join(projectRoot, VERSION_INITIALIZED_REL));
  let text: string;
  try {
    text = await readFile(path.join(projectRoot, VERSION_BASELINE_REL), "utf8");
  } catch {
    if (!markerPresent) return { ok: true, records: [], initialized: false }; // 二者都不存在 ⇒ TOFU 候选
    return { ok: false, reason: "baseline-missing" };
  }
  if (!markerPresent) return { ok: false, reason: "marker-missing" };
  if (text.trim() === "") return { ok: false, reason: "baseline-corrupt" };
  const records: VersionBaselineRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return { ok: false, reason: "baseline-corrupt" };
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "baseline-corrupt" };
    const record = parsed as Partial<VersionBaselineRecord>;
    if (
      record.v !== 1 ||
      typeof record.flowId !== "string" ||
      record.flowId.trim() === "" ||
      (record.doc !== "intent" &&
        record.doc !== "proposal" &&
        record.doc !== "roster" &&
        record.doc !== "modules" &&
        record.doc !== "topology" &&
        record.doc !== "architecture") ||
      typeof record.version !== "number" ||
      !Number.isInteger(record.version) ||
      record.version < 1 ||
      typeof record.path !== "string" ||
      typeof record.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(record.sha256) ||
      typeof record.recordedAt !== "string" ||
      record.recordedAt.trim() === "" ||
      (record.event !== "baseline" && record.event !== "version-added" && (record as { event?: string }).event !== "versioned-doc-baseline") ||
      typeof record.recordedBy !== "string" ||
      record.recordedBy.trim() === ""
    ) {
      return { ok: false, reason: "baseline-corrupt" };
    }
    // v2.12：旧值只读归一化（不追加迁移记录）：event、recordedBy、旧实际 path → canonical。
    const normalized = record as VersionBaselineRecord;
    if ((normalized as { event?: string }).event === "versioned-doc-baseline") normalized.event = "baseline";
    if (normalized.event !== "baseline" && normalized.event !== "version-added") return { ok: false, reason: "baseline-corrupt" };
    if (normalized.recordedBy === "app") normalized.recordedBy = "app:session";
    const canonical = canonicalPathFor(normalized.flowId, normalized.doc);
    if (/-v\d+\.md$/i.test(normalized.path)) {
      if (normalized.path !== `${canonical}-v${normalized.version}.md`) return { ok: false, reason: "baseline-corrupt" };
      normalized.path = canonical;
    } else if (normalized.path !== canonical) {
      return { ok: false, reason: "baseline-corrupt" };
    }
    records.push(normalized);
  }
  return { ok: true, records, initialized: true };
}

/**
 * TOFU 仅一次：marker 与 versions.jsonl 都不存在时，记录当前全部版本化文档并写 marker。
 * marker 存在后：**不补齐缺失条目**（旧版缺失由 verify fail-closed）；仅为「版本号高于已记录最大值」
 * 的新版本追加基线（新版本首次出现时登记），返回新增条目数。
 */
function hasVersionRecord(text: string, version: number): boolean {
  // 新版本必须有版本头/版本记录（frontmatter `version: N` 或正文 vN 版本标记）。
  return text.includes(`version: ${version}`) || text.includes(`v${version}`);
}

async function atomicWrite(abs: string, content: string): Promise<void> {
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
  const handle = await open(tmp, "w");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync(); // v2.13：fsync 后 rename，崩溃不丢已提交基线
  } finally {
    await handle.close();
  }
  await rename(tmp, abs);
}

async function recordVersionedDocBaselinesLocked(input: {
  projectRoot: string;
  now?: () => Date;
  recordedBy?: string;
}, lockToken?: string): Promise<number> {
  const state = await readBaselines(input.projectRoot);
  if (!state.ok) return 0; // 已初始化但 baseline 缺失/坏行/marker 缺失 ⇒ 禁止重建
  const at = (input.now ?? (() => new Date()))().toISOString();
  const recordedBy = input.recordedBy ?? "app:session";
  const maxVersion = new Map<string, number>();
  for (const record of state.records) {
    const key = `${record.flowId}\u0000${record.doc}`;
    maxVersion.set(key, Math.max(maxVersion.get(key) ?? 0, record.version));
  }
  const seen = new Set(state.records.map((record) => `${record.flowId}|${record.doc}|${record.version}`));
  const candidates: Array<{ rel: string; doc: VersionBaselineRecord["doc"]; version: number; flowId: string }> = [];
  for (const dir of VERSIONED_DIRS) {
    let names: string[];
    try {
      names = await readdir(path.join(input.projectRoot, dir));
    } catch {
      continue;
    }
    for (const name of names) {
      const rel = `${dir}/${name}`;
      const candidateKey = `${flowIdOf(rel)}|${docKindOf(rel) ?? ""}|${versionedDocVersionOf(rel) ?? 0}`;
      if (!isVersionedDocPath(rel) || seen.has(candidateKey)) continue;
      const doc = docKindOf(rel);
      const version = versionedDocVersionOf(rel);
      if (doc === undefined || version === undefined) continue;
      const flowId = flowIdOf(rel);
      const known = maxVersion.get(`${flowId}\u0000${doc}`) ?? 0;
      if (state.initialized && version <= known) continue; // 旧版缺失/未记录 ⇒ 不自动补齐
      candidates.push({ rel, doc, version, flowId });
    }
  }
  if (state.initialized) {
    // 先校验旧版未改；任一旧版变化 ⇒ 不登记新版本（fail-closed）。
    const violations = await verifyVersionedDocBaselinesLocked({ projectRoot: input.projectRoot });
    if (violations.some((violation) => violation.reason === "changed" || violation.reason === "missing")) return 0;
  }
  const additions: VersionBaselineRecord[] = [];
  for (const candidate of candidates) {
    try {
      const bytes = await readFile(path.join(input.projectRoot, candidate.rel));
      const text = bytes.toString("utf8");
      if (state.initialized && !hasVersionRecord(text, candidate.version)) continue; // 非法版本头 ⇒ 不登记
      additions.push({
        v: 1,
        flowId: candidate.flowId,
        doc: candidate.doc,
        version: candidate.version,
        path: canonicalPathFor(candidate.flowId, candidate.doc),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        recordedAt: at,
        event: state.initialized ? "version-added" : "baseline",
        recordedBy,
      });
      seen.add(`${candidate.flowId}|${candidate.doc}|${candidate.version}`);
    } catch {
      /* 并发删除：跳过 */
    }
  }
  if (additions.length === 0) return 0;
  if (lockToken !== undefined && !(await ownsVersionLock(input.projectRoot, lockToken))) return 0; // fencing
  const baselineAbs = path.join(input.projectRoot, VERSION_BASELINE_REL);
  await mkdir(path.dirname(baselineAbs), { recursive: true });
  let existingText = "";
  if (state.initialized) existingText = await readFile(baselineAbs, "utf8");
  const nextText = existingText + additions.map((record) => `${JSON.stringify(record)}\n`).join("");
  await atomicWrite(baselineAbs, nextText);
  if (!state.initialized) {
    await atomicWrite(
      path.join(input.projectRoot, VERSION_INITIALIZED_REL),
      `${JSON.stringify({ v: 1, initializedAt: at })}\n`,
    );
  }
  // 先写后校验：写后重读；解析失败视为登记失败。
  const check = await readBaselines(input.projectRoot);
  if (!check.ok) return 0;
  return additions.length;
}

export interface VersionBaselineViolation {
  path: string;
  expected?: string;
  actual?: string;
  reason: "missing" | "changed" | "baseline-missing" | "baseline-corrupt" | "marker-missing" | "unrecorded";
}

/** 校验基线：初始化后 baseline 缺失/坏行/条目缺失、旧版被改/删 ⇒ 违规（fail-closed）。 */
async function verifyVersionedDocBaselinesLocked(input: { projectRoot: string }): Promise<VersionBaselineViolation[]> {
  const state = await readBaselines(input.projectRoot);
  if (!state.ok) {
    return [{ path: VERSION_BASELINE_REL, reason: state.reason }];
  }
  if (state.records.length === 0 && !state.initialized) {
    // 未初始化：项目还没有受管版本化文档 ⇒ 无物可保护（0 违规）；已有文档 ⇒ fail-closed。
    const hasVersionedDoc = (await protectedVersionedPaths(input.projectRoot)).length > 0;
    return hasVersionedDoc ? [{ path: VERSION_BASELINE_REL, reason: "baseline-missing" }] : [];
  }
  const violations: VersionBaselineViolation[] = [];
  const seen = new Set<string>();
  const maxVersion = new Map<string, number>();
  for (const record of state.records) {
    const rel = normalizeVersionedDocPath(actualPathForRecord(record));
    if (rel === undefined || !isVersionedDocPath(rel)) continue;
    seen.add(`${record.flowId}|${record.doc}|${record.version}`);
    const key = `${record.flowId}|${record.doc}`;
    maxVersion.set(key, Math.max(maxVersion.get(key) ?? 0, record.version));
    try {
      const bytes = await readFile(path.join(input.projectRoot, rel));
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== record.sha256) violations.push({ path: rel, expected: record.sha256, actual, reason: "changed" });
    } catch {
      violations.push({ path: rel, expected: record.sha256, reason: "missing" });
    }
  }

  // 旧版（版本号 ≤ 已记录最大值）存在但无 baseline 条目 ⇒ fail-closed；新版本允许等待登记。
  for (const dir of VERSIONED_DIRS) {
    let names: string[];
    try {
      names = await readdir(path.join(input.projectRoot, dir));
    } catch {
      continue;
    }
    for (const name of names) {
      const rel = `${dir}/${name}`;
      const candidateKey = `${flowIdOf(rel)}|${docKindOf(rel) ?? ""}|${versionedDocVersionOf(rel) ?? 0}`;
      if (!isVersionedDocPath(rel) || seen.has(candidateKey)) continue;
      const doc = docKindOf(rel);
      const version = versionedDocVersionOf(rel);
      if (doc === undefined || version === undefined) continue;
      const key = `${flowIdOf(rel)}|${doc}`;
      if (version <= (maxVersion.get(key) ?? 0)) violations.push({ path: rel, reason: "unrecorded" });
    }
  }
  return violations;
}

/** shell-post-audit 用：查已记录版本的 baseline sha（未记录/坏行返回 undefined，不阻断审计）。 */
export type BaselineShaResult =
  | { ok: true; sha256?: string }
  | { ok: false; reason: "baseline-missing" | "baseline-corrupt" | "marker-missing" };

/** shell-post-audit 用：baseline 缺失/坏行/字段缺失 ⇒ fail-closed（不得静默跳过）。 */
export async function baselineShaFor(projectRoot: string, relPath: string): Promise<BaselineShaResult> {
  const rel = normalizeVersionedDocPath(relPath);
  if (rel === undefined) return { ok: false, reason: "baseline-corrupt" };
  const state = await readBaselines(projectRoot);
  if (!state.ok) return { ok: false, reason: state.reason };
  return { ok: true, sha256: state.records.find((record) => actualPathForRecord(record) === rel || record.path === rel)?.sha256 };
}

// 2026-10-29（v2.12）：`versions.lock` O_EXCL 独占锁——内容 {pid,startedAt,token}。
export interface VersionLockInfo {
  pid: number;
  startedAt: string;
  token: string;
}

export class VersionLockError extends Error {
  readonly code = "version-lock-timeout";
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 获取项目级独占锁；陈旧锁（pid 不存在/超龄）凭 token 安全接管；超时 fail-closed。 */
export type VersionLockRelease = (() => Promise<void>) & { token: string };

/** 校验自己仍持有锁（fencing）：旧 holder 在接管后的写入必须无效。 */
export async function ownsVersionLock(projectRoot: string, token: string): Promise<boolean> {
  try {
    const raw = await readFile(path.join(projectRoot, VERSION_LOCK_REL), "utf8");
    const info = JSON.parse(raw) as Partial<VersionLockInfo>;
    return info.token === token;
  } catch {
    return false;
  }
}

/** 获取项目级独占锁：临时文件+link 原子创建带内容锁；活锁不被超龄接管；超时 fail-closed。 */
export async function acquireVersionLock(
  projectRoot: string,
  options: { timeoutMs?: number; staleMs?: number; now?: () => Date } = {},
): Promise<VersionLockRelease> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const now = options.now ?? (() => new Date());
  const lockPath = path.join(projectRoot, VERSION_LOCK_REL);
  await mkdir(path.dirname(lockPath), { recursive: true });
  const token = randomUUID();
  const startedAt = now().toISOString();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const tmp = `${lockPath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
    const handle = await open(tmp, "wx");
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt, token }), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    const release = (async () => {
      await releaseVersionLock(projectRoot, token);
    }) as VersionLockRelease;
    release.token = token;
    try {
      await link(tmp, lockPath); // 原子：目标已存在 ⇒ EEXIST
      await unlink(tmp).catch(() => undefined);
      return release;
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;
      if (code !== "EEXIST") {
        await unlink(tmp).catch(() => undefined);
        throw error;
      }
    }
    // 陈旧接管：仅 pid 不存在（活锁即使超龄也不接管）。
    // v2.15：带新 token 的临时锁原子 rename 覆盖，再重读确认；不是 rename 旧锁到旁路再删。
    try {
      const raw = await readFile(lockPath, "utf8");
      const info = JSON.parse(raw) as Partial<VersionLockInfo>;
      if (!pidAlive(Number(info.pid))) {
        await rename(tmp, lockPath); // 原子覆盖
        const confirm = await readFile(lockPath, "utf8").catch(() => undefined);
        if (confirm !== undefined) {
          try {
            const confirmed = JSON.parse(confirm) as Partial<VersionLockInfo>;
            if (confirmed.token === token) return release;
          } catch {
            /* 被其他接管者覆盖：继续竞争 */
          }
        }
        continue;
      }
    } catch {
      /* 空内容窗口/坏锁：不接管，重试到超时 */
    }
    await unlink(tmp).catch(() => undefined);
    if (Date.now() >= deadline) throw new VersionLockError(`版本登记锁超时（${timeoutMs}ms）；请稍后重试。`);
    await delay(25);
  }
}

/** 只释放自己 token 的锁。 */
export async function releaseVersionLock(projectRoot: string, token: string): Promise<void> {
  const lockPath = path.join(projectRoot, VERSION_LOCK_REL);
  try {
    const raw = await readFile(lockPath, "utf8");
    const info = JSON.parse(raw) as Partial<VersionLockInfo>;
    if (info.token === token) await unlink(lockPath);
  } catch {
    /* 已被接管/不存在：不报错 */
  }
}

async function withProjectVersionLock<T>(projectRoot: string, fn: (token: string) => Promise<T>): Promise<T> {
  const release = await acquireVersionLock(projectRoot);
  try {
    return await fn(release.token);
  } finally {
    await release();
  }
}

/** 属主写成功后 guard 锁内追加/回退入口：只登记本次写入的文件（不扫描补齐其他文件）。 */
export async function registerVersionedDocAfterWrite(input: {
  projectRoot: string;
  absPath: string;
  recordedBy?: string;
  now?: () => Date;
}): Promise<boolean | undefined> {
  const rel = path.relative(input.projectRoot, input.absPath).split(path.sep).join("/");
  if (!isVersionedDocPath(rel)) return; // 非版本化文档：不登记，也不阻断写入
  const doc = docKindOf(rel);
  const version = versionedDocVersionOf(rel);
  const flowId = flowIdOf(rel);
  if (doc === undefined || version === undefined || flowId === "") return false;
  const release = await acquireVersionLock(input.projectRoot);
  try {
    const token = release.token;
    const state = await readBaselines(input.projectRoot);
    if (!state.ok) return false; // marker/baseline 坏：fail-closed，不重建
    if (!state.initialized) {
      // TOFU 初始化：首次属主写成功后，把现有版本化文档整体快照为基线（之后仅单文件追加）。
      const added = await recordVersionedDocBaselinesLocked(
        { projectRoot: input.projectRoot, recordedBy: "app:session", ...(input.now !== undefined ? { now: input.now } : {}) },
        token,
      );
      return added >= 0;
    }
    let bytes: Buffer;
    try {
      bytes = await readFile(input.absPath);
    } catch {
      return false;
    }
    const text = bytes.toString("utf8");
    // v2.15：完整预检——版本头/版本记录章节/当前最大 N+1（旧版未改由 verify 兜底）。
    if (!hasVersionRecord(text, version)) return false;
    if (!state.initialized && version !== 1) return false;
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = state.records.find(
      (record) => actualPathForRecord(record) === rel || (record.flowId === flowId && record.doc === doc && record.version === version),
    );
    if (existing !== undefined) return existing.sha256 === sha256; // 已登记；变更由 verify 报 fail-closed
    if (state.initialized) {
      const violations = await verifyVersionedDocBaselinesLocked({ projectRoot: input.projectRoot });
      if (violations.some((violation) => violation.reason === "changed" || violation.reason === "missing")) return false;
      const max = Math.max(
        0,
        ...state.records.filter((record) => record.flowId === flowId && record.doc === doc).map((record) => record.version),
      );
      if (version !== max + 1) return false; // 只允许当前最大 N+1（不跳号/不回填旧版）
    }
    // fencing：写基线/rename 前重读锁，旧 holder 不得写入。
    if (!(await ownsVersionLock(input.projectRoot, token))) return false;
    const record: VersionBaselineRecord = {
      v: 1,
      flowId,
      doc,
      version,
      path: canonicalPathFor(flowId, doc),
      sha256,
      recordedAt: (input.now ?? (() => new Date()))().toISOString(),
      event: state.initialized ? "version-added" : "baseline",
      recordedBy: "app:session",
    };
    const baselineAbs = path.join(input.projectRoot, VERSION_BASELINE_REL);
    await mkdir(path.dirname(baselineAbs), { recursive: true });
    const existingText = state.initialized ? await readFile(baselineAbs, "utf8") : "";
    await atomicWrite(baselineAbs, existingText + `${JSON.stringify(record)}\n`);
    if (!state.initialized) {
      if (!(await ownsVersionLock(input.projectRoot, token))) return false;
      await atomicWrite(
        path.join(input.projectRoot, VERSION_INITIALIZED_REL),
        `${JSON.stringify({ v: 1, initializedAt: record.recordedAt })}\n`,
      );
    }
    return true;
  } finally {
    await release();
  }
}

/** 串行入口：TOFU 初始化 + 新版本登记。 */
export function recordVersionedDocBaselines(input: {
  projectRoot: string;
  now?: () => Date;
  recordedBy?: string;
}): Promise<number> {
  return withProjectVersionLock(input.projectRoot, (token) => recordVersionedDocBaselinesLocked(input, token));
}

/** 串行入口：基线校验（与登记同一锁，避免读到写一半）。 */
export function verifyVersionedDocBaselines(input: { projectRoot: string }): Promise<VersionBaselineViolation[]> {
  return withProjectVersionLock(input.projectRoot, () => verifyVersionedDocBaselinesLocked(input));
}
