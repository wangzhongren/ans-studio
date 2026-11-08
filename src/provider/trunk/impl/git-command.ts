// Fixed local Git transport. No public argv/env/config entry; no import-time I/O.
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, readdir, realpath, mkdir } from "node:fs/promises";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import type { GitProcessFacts, GitRepositoryIdentity, GitQueryPort, GitProtectionFacts, GitRefJournal, GitOperationRecord, GitInitializationFacts, GitInitializationRecord, GitHostInventory, GitHostActionKind } from "../abstract/trunk-store.ts";
import { isGitOid, isGitBasis, isGitLiteralPath, TRUNK_APPLY_JOURNAL_SCHEMA, TRUNK_APPLY_JOURNAL_PHASES, isDirectActionSource, isSnapshotRef, type TrunkApplyJournal } from "../../../model/trunk.ts";
import type { GitQueryRequest, ReadonlyGitExecutionFacts } from "../../../model/runtime.ts";
// 2026-11-08（W3b，设计 P1.3 §2.4.3 / I0-4/§4.1）：只读 Git 规范体**单一来源**（门禁引擎纯函数，
// 经 Service 公共出口同一函数引用）。本 Provider 只做固定传输，不复制 matcher/规范体逻辑。
import { buildReadonlyGitBody, type ReadonlyGitMatch } from "../../../service/gate/shell-rules.ts";
import { atomicWrite } from "../../../common/shared/atomic-write.ts";
import { acquireVersionLock, ownsVersionLock } from "../../version-change/public/version-change-store.ts";

export const GIT_EXECUTABLE = process.platform === "win32" ? "C:/Program Files/Git/cmd/git.exe" : "/usr/bin/git";
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const emptyFile = process.platform === "win32" ? "NUL" : "/dev/null";
const fixedConfig = ["core.fsmonitor=false", "core.hooksPath=" + emptyFile, "core.untrackedCache=false", "core.excludesFile=" + emptyFile,
  "core.pager=cat", "pager.status=false", "pager.diff=false", "maintenance.auto=false", "gc.auto=0", "protocol.allow=never", "diff.external=", "core.attributesFile=" + emptyFile];
const commandArgs = (argv: readonly string[]) => ["--no-pager", "--no-optional-locks", "--literal-pathspecs", ...fixedConfig.flatMap(value => ["-c", value]), ...argv];
export const gitCommandArgv = commandArgs;
/** Only an explicitly persisted cancellation before the synchronous spawn boundary proves no process launched. */
export function isGitProcessNotStarted(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const fact = value as Record<string, unknown>;
  return fact.launch === "cancelled-before-spawn" && fact.termination === "unknown" && fact.pid === undefined
    && fact.aborted === true && fact.exitCode === null && fact.signal === null && fact.timedOut === false && fact.outputTruncated === false
    && typeof fact.processId === "string" && /^[a-f0-9-]{36}$/.test(fact.processId) && typeof fact.operationId === "string" && !!fact.operationId
    && typeof fact.endedAt === "string" && Number.isFinite(Date.parse(fact.endedAt));
}
const gitRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export function isTrunkApplyJournalShape(value: unknown): value is TrunkApplyJournal {
  if (!gitRecord(value) || value.v !== 1 || value.schema !== TRUNK_APPLY_JOURNAL_SCHEMA) return false;
  if (![value.journalId, value.flowId, value.startedAt, value.updatedAt].every(value => typeof value === "string" && value.trim() !== "")) return false;
  if (typeof value.phase !== "string" || !(TRUNK_APPLY_JOURNAL_PHASES as readonly string[]).includes(value.phase) || !gitRecord(value.target) || !gitRecord(value.before)) return false;
  if (value.operationId !== undefined && !(typeof value.operationId === "string" && value.operationId.trim())) return false;
  return (value.actionSource === undefined || isDirectActionSource(value.actionSource)) && (value.targetSnapshot === undefined || isSnapshotRef(value.targetSnapshot))
    && (value.beforeSnapshot === undefined || isSnapshotRef(value.beforeSnapshot));
}
function canonicalGitRecord(value: unknown): unknown { return Array.isArray(value) ? value.map(canonicalGitRecord) : gitRecord(value)
  ? Object.fromEntries(Object.entries(value).filter(([, value]) => value !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [key, canonicalGitRecord(value)])) : value; }
export function gitBusinessRequestDigest(journal: TrunkApplyJournal): string {
  const { phase, updatedAt, result, ...binding } = journal; void phase; void updatedAt; void result;
  return digest(JSON.stringify(canonicalGitRecord(binding)));
}
function validCandidateSource(value: unknown, contributor = false): boolean {
  if (!gitRecord(value) || !["assigned-run-task", "run-integration", "run-revert"].includes(String(value.kind))
    || ![value.taskId, value.runId, value.flowId, value.roleId].every(value => typeof value === "string" && value.trim() !== "")
    || ![value.pinDigest, value.taskDigest, value.runRecordSha256, value.scopeDigest].every(value => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value))
    || !isGitBasis(value.base) || value.base.oid === null || !Array.isArray(value.files) || !value.files.length || value.files.length > 128
    || !value.files.every(value => gitRecord(value) && isGitLiteralPath(value.path) && (value.sha256 === null || typeof value.sha256 === "string" && /^[a-f0-9]{64}$/i.test(value.sha256)))) return false;
  if (value.kind === "assigned-run-task") return typeof value.moduleId === "string" && value.moduleId.trim() !== "";
  if (value.kind === "run-revert") return !contributor && value.roleId === "convener" && isGitOid(value.target)
    && (value.mainline === undefined || Number.isSafeInteger(value.mainline) && typeof value.mainline === "number" && value.mainline >= 1 && value.mainline <= 65)
    && gitRecord(value.revertBasis) && value.revertBasis.complete === true && Array.isArray(value.revertBasis.conflicts) && value.revertBasis.conflicts.length === 0
    && Array.isArray(value.ownerGrants) && value.ownerGrants.length > 0 && value.ownerGrants.length <= 64
    && value.ownerGrants.every(grant => gitRecord(grant) && typeof grant.ownerRoleId === "string" && grant.ownerRoleId.trim() !== ""
      && Array.isArray(grant.paths) && grant.paths.length > 0 && grant.paths.length <= 128 && grant.paths.every(isGitLiteralPath)
      && typeof grant.evidenceDigest === "string" && /^[a-f0-9]{64}$/i.test(grant.evidenceDigest));
  return !contributor && value.roleId === "convener" && Array.isArray(value.contributors) && value.contributors.length > 0 && value.contributors.length <= 64
    && value.contributors.every(row => gitRecord(row) && typeof row.operationId === "string" && isGitOid(row.candidate)
      && [row.closeOperationId, row.closeEventId].every(text => typeof text === "string" && text.trim() !== "") && typeof row.reportSha256 === "string" && /^[a-f0-9]{64}$/i.test(row.reportSha256)
      && validCandidateSource(row.source, true));
}
function validDeliverySource(value: unknown): boolean {
  const hex = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
  const refs = (v: unknown) => Array.isArray(v) && v.length > 0 && v.length <= 128 && v.every(ref => gitRecord(ref)
    && Object.keys(ref).length === 3 && isGitOid(ref.oid) && isGitLiteralPath(ref.path) && hex(ref.sha256));
  return gitRecord(value) && value.kind === "verified-run-delivery" && value.roleId === "convener"
    && [value.taskId, value.runId, value.flowId, value.candidateOperationId, value.qualityTaskId, value.creatorCloseOperationId, value.creatorCloseEventId].every(v => typeof v === "string" && !!v.trim())
    && [value.candidateJournalSha256, value.pinDigest, value.runRecordSha256, value.taskDigest, value.ledgerDigest, value.qualityDigest, value.qualityReportSha256].every(hex)
    && refs(value.criteria) && refs(value.evidence) && Array.isArray(value.liveFiles) && value.liveFiles.length > 0
    && value.liveFiles.every(file => gitRecord(file) && isGitLiteralPath(file.path) && hex(file.sha256));
}
export function isGitRefJournal(value: unknown): value is GitRefJournal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return item.media === "git-ref/v1" && typeof item.operationId === "string" && item.operationId.length > 0
    && typeof item.repoId === "string" && /^[a-f0-9]{64}$/.test(item.repoId) && typeof item.ref === "string"
    && (item.oldOid === null || isGitOid(item.oldOid)) && isGitOid(item.newOid) && isGitOid(item.tree)
    && Array.isArray(item.parents) && item.parents.every(isGitOid) && typeof item.requestDigest === "string" && /^[a-f0-9]{64}$/.test(item.requestDigest)
    && ["prepared", "published", "conflict", "unknown"].includes(String(item.phase))
    && (item.businessJournal === undefined || (isTrunkApplyJournalShape(item.businessJournal) && item.businessJournal.operationId === item.operationId && gitBusinessRequestDigest(item.businessJournal) === item.requestDigest))
    && (item.legacyManifestSha256 === undefined || (typeof item.legacyManifestSha256 === "string" && /^[a-f0-9]{64}$/.test(item.legacyManifestSha256)))
    && (item.candidateSource === undefined || validCandidateSource(item.candidateSource))
    && (item.publicationTask === undefined || (gitRecord(item.publicationTask) && Object.keys(item.publicationTask).length === 3
      && [item.publicationTask.taskId, item.publicationTask.runId].every(value => typeof value === "string" && !!value && !/[\x00-\x1f\x7f]/.test(value))
      && typeof item.publicationTask.ledgerSha256 === "string" && /^[a-f0-9]{64}$/.test(item.publicationTask.ledgerSha256)))
    && (item.deliverySource === undefined || validDeliverySource(item.deliverySource))
    && (item.process === undefined || (!!item.process && typeof item.process === "object" && "termination" in item.process && ["exited", "unknown"].includes(String(item.process.termination))));
}
export function isGitOperationRecord(value: unknown): value is GitOperationRecord {
  return isGitRefJournal(value) || (gitRecord(value) && value.media === "git-ref/v1" && value.phase === "business-prepared" && typeof value.operationId === "string"
    && typeof value.repoId === "string" && /^[a-f0-9]{64}$/.test(value.repoId) && isTrunkApplyJournalShape(value.businessJournal)
    && value.businessJournal.operationId === value.operationId && value.requestDigest === gitBusinessRequestDigest(value.businessJournal));
}
function isGitInitializationRecord(value: unknown): value is GitInitializationRecord {
  return gitRecord(value) && value.media === "git-initialization/v1" && typeof value.operationId === "string" && value.operationId.length > 0
    && [value.requestDigest, value.sourceSha256, value.qualificationDigest].every(v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v))
    && [value.projectRoot, value.taskId, value.runId, value.flowId, value.sourceId].every(v => typeof v === "string" && v.length > 0)
    && Array.isArray(value.expectedFiles) && value.expectedFiles.every(f => gitRecord(f) && typeof f.path === "string" && typeof f.sha256 === "string" && /^[a-f0-9]{64}$/.test(f.sha256))
    && ["prepared", "repository-created", "candidate-created"].includes(String(value.stage))
    && (value.repoId === undefined || typeof value.repoId === "string" && /^[a-f0-9]{64}$/.test(value.repoId))
    && (value.stage !== "candidate-created" || isGitOid(value.candidate) && isGitOid(value.tree) && Array.isArray(value.parents) && value.parents.every(isGitOid));
}
export async function readGitInitializationRecord(root: string, operationId: string): Promise<GitInitializationRecord | null> {
  const absolute = path.join(await realpath(root), ".ans/trunk/operations", digest(operationId), "init.json");
  try {
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 128 * 1024 || await realpath(absolute) !== absolute) throw new Error("git-init-journal-unsafe");
    const value: unknown = JSON.parse(await readFile(absolute, "utf8"));
    if (!isGitInitializationRecord(value) || value.operationId !== operationId) throw new Error("git-init-journal-invalid");
    if (await exists(path.join(root, ".ans/trunk/operations", `${digest(operationId)}.json`)) || await exists(path.join(root, ".ans/trunk/operations", digest(operationId), "git.json"))) throw new Error("operation-bound-to-two-media");
    return value;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function listGitInitializationRecords(root: string): Promise<readonly GitInitializationRecord[]> {
  const base = path.join(root, ".ans/trunk/operations");
  let names: string[]; try { names = await readdir(base); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  if (names.length > 2048) throw new Error("git-operation-budget");
  const records: GitInitializationRecord[] = [];
  for (const name of names.filter(v => /^[a-f0-9]{64}$/.test(v))) {
    const file = path.join(base, name, "init.json"); if (!await exists(file)) continue;
    const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 128 * 1024) throw new Error("git-init-journal-unsafe");
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!isGitInitializationRecord(value) || digest(value.operationId) !== name) throw new Error("git-init-journal-invalid");
    const verified = await readGitInitializationRecord(root, value.operationId); if (!verified) throw new Error("git-init-journal-disappeared"); records.push(verified);
  }
  return records;
}
export async function writeGitInitializationRecord(root: string, value: GitInitializationRecord, heldLockToken?: string): Promise<void> {
  if (!isGitInitializationRecord(value)) throw new Error("git-init-journal-invalid");
  const release = heldLockToken ? undefined : await acquireVersionLock(root), lockToken = heldLockToken ?? release!.token;
  try {
    if (!await ownsVersionLock(root, lockToken)) throw new Error("git-init-journal-fence-lost");
    const canonicalRoot = await realpath(root); let dir = canonicalRoot;
    for (const part of [".ans", "trunk", "operations", digest(value.operationId)]) {
      dir = path.join(dir, part); await mkdir(dir, { recursive: true }); const info = await lstat(dir);
      if (!info.isDirectory() || info.isSymbolicLink() || await realpath(dir) !== dir) throw new Error("git-init-journal-directory-invalid");
    }
    if (await exists(path.join(canonicalRoot, ".ans/trunk/operations", `${digest(value.operationId)}.json`)) || await exists(path.join(dir, "git.json"))) throw new Error("operation-bound-to-other-media");
    const prior = await readGitInitializationRecord(root, value.operationId);
    if (prior) {
      const binding = ({ stage, repoId, candidate, tree, parents, ...record }: GitInitializationRecord) => { void stage; void repoId; void candidate; void tree; void parents; return record; };
      if (JSON.stringify(binding(prior)) !== JSON.stringify(binding(value))) throw new Error("git-init-operation-conflict");
      const ranks = ["prepared", "repository-created", "candidate-created"];
      if (ranks.indexOf(value.stage) < ranks.indexOf(prior.stage) || prior.repoId && prior.repoId !== value.repoId
        || prior.candidate && JSON.stringify([prior.candidate, prior.tree, prior.parents]) !== JSON.stringify([value.candidate, value.tree, value.parents])) throw new Error("git-init-operation-regression");
    }
    if (!await ownsVersionLock(root, lockToken)) throw new Error("git-init-journal-fence-lost");
    await atomicWrite(path.join(dir, "init.json"), JSON.stringify(value));
  } finally { await release?.(); }
}
/** Both storage adapters use the same journal reader; no cyclic Provider construction. */
export async function listGitOperationJournals(root: string): Promise<readonly GitOperationRecord[]> {
  const base = path.join(root, ".ans/trunk/operations");
  let names: string[]; try { names = await readdir(base); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  if (names.length > 2048) throw new Error("git-operation-budget");
  const result: GitOperationRecord[] = [];
  for (const name of names.filter(name => /^[a-f0-9]{64}$/.test(name))) {
    const dir = path.join(base, name), file = path.join(dir, "git.json"), info = await lstat(dir);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(dir) !== dir) throw new Error("git-journal-directory-invalid");
    const sourceFile = path.join(dir, "stable-source.json");
    if (await exists(path.join(dir, "init.json"))) { if (await exists(file) || await exists(sourceFile)) throw new Error("operation-bound-to-two-media"); continue; }
    if (await exists(sourceFile)) {
      const sourceInfo = await lstat(sourceFile);
      if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink() || sourceInfo.nlink !== 1 || sourceInfo.size > 64 * 1024 || await realpath(sourceFile) !== sourceFile) throw new Error("stable-work-source-file-unsafe");
      const source: unknown = JSON.parse(await readFile(sourceFile, "utf8"));
      if (!gitRecord(source) || source.schema !== "stable-initial-workflow-source/v1" || source.kind !== "stable-initial-workflow"
        || typeof source.operationId !== "string" || digest(source.operationId) !== name) throw new Error("stable-work-source-corrupt");
      if (await exists(path.join(base, `${name}.json`))) throw new Error("operation-bound-to-two-requests");
      if (!await exists(file)) { if ((await readdir(dir)).some(entry => entry !== "stable-source.json")) throw new Error("stable-work-source-directory-unknown"); continue; }
    }
    const fileInfo = await lstat(file);
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || fileInfo.nlink > 1 || fileInfo.size > 2 * 1024 * 1024) throw new Error("git-journal-file-unsafe");
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!isGitOperationRecord(value) || digest(value.operationId) !== name) throw new Error("git-journal-corrupt");
    try { await lstat(path.join(base, `${name}.json`)); throw new Error("operation-bound-to-two-media"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    result.push(value);
  }
  return result;
}

export function literalGitPath(value: string): string {
  if (!value || value.length > 1024 || value.startsWith("/") || /[\\:\x00-\x1f\x7f]/.test(value)
    || value.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) throw new Error("git-path-invalid");
  return value;
}
export function fullGitOid(value: { objectFormat: "sha1" | "sha256"; hex: string }, format: GitRepositoryIdentity["objectFormat"]): string {
  if (value.objectFormat !== format || !(format === "sha1" ? /^[a-f0-9]{40}$/i : /^[a-f0-9]{64}$/i).test(value.hex)) throw new Error("git-oid-invalid");
  return value.hex.toLowerCase();
}
const exists = async (file: string) => { try { await lstat(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; } };
function configFormat(text: string): GitRepositoryIdentity["objectFormat"] {
  let section = "", format: GitRepositoryIdentity["objectFormat"] = "sha1";
  const allowed: Record<string, readonly string[]> = { core: ["repositoryformatversion", "filemode", "bare", "logallrefupdates", "ignorecase", "symlinks", "longpaths"], extensions: ["objectformat"] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || /^[#;]/.test(line)) continue;
    const heading = /^\[([a-z]+)\]$/i.exec(line);
    if (heading) { section = heading[1]!.toLowerCase(); if (!allowed[section]) throw new Error("git-config-section-unsupported"); continue; }
    const entry = /^([a-z]+)\s*=\s*([a-z0-9]+)$/i.exec(line);
    if (!entry || !allowed[section]?.includes(entry[1]!.toLowerCase())) throw new Error("git-config-executable-or-unsupported");
    const key = entry[1]!.toLowerCase(), value = entry[2]!.toLowerCase();
    if (key === "objectformat") { if (value !== "sha1" && value !== "sha256") throw new Error("git-object-format-unsupported"); format = value; }
    else if (key === "repositoryformatversion") { if (value !== "0" && value !== "1") throw new Error("git-repository-format-unsupported"); }
    else if (value !== "true" && value !== "false") throw new Error("git-config-value-invalid");
    if (key === "bare" && value !== "false") throw new Error("git-bare-unsupported");
  }
  return format;
}

/** Reject unsupported indirection before any Git command can consume repository config. */
export async function inspectGitRepository(projectRoot: string): Promise<GitRepositoryIdentity> {
  const root = await realpath(projectRoot), requested = path.resolve(projectRoot);
  if (root.toLowerCase() !== requested.toLowerCase() || (await lstat(requested)).isSymbolicLink()) throw new Error("git-root-link-unsupported");
  const gitDir = path.join(root, ".git"), gitStat = await lstat(gitDir);
  if (!gitStat.isDirectory() || gitStat.isSymbolicLink() || await realpath(gitDir) !== gitDir) throw new Error("git-gitfile-or-link-unsupported");
  if (await exists(path.join(root, ".gitmodules"))) throw new Error("git-submodules-unsupported");
  for (const rel of ["commondir", "worktrees", "config.worktree", "objects/info/alternates", "objects/info/http-alternates", "info/grafts", "shallow", "refs/replace", "modules"])
    if (await exists(path.join(gitDir, rel))) throw new Error(`git-indirection-unsupported:${rel}`);
  let visited = 0;
  async function noLinks(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (++visited > 8192) throw new Error("git-identity-file-budget");
      const file = path.join(dir, entry.name), info = await lstat(file);
      if (info.isSymbolicLink() || (!info.isDirectory() && info.nlink > 1)) throw new Error("git-metadata-link-unsupported");
      if (info.isDirectory()) await noLinks(file);
      else if (!info.isFile()) throw new Error("git-metadata-kind-unsupported");
      // Symbolic application refs are never a CAS target.
      else if (path.relative(gitDir, file).replaceAll("\\", "/").startsWith("refs/") && (await readFile(file, "utf8")).startsWith("ref:")) throw new Error("git-symbolic-ref-unsupported");
    }
  }
  await noLinks(gitDir);
  const config = await readFile(path.join(gitDir, "config"));
  if (config.length > 32 * 1024) throw new Error("git-config-budget");
  const objectFormat = configFormat(config.toString("utf8"));
  const head = await readFile(path.join(gitDir, "HEAD"), "utf8");
  if (!/^(?:ref: refs\/heads\/[A-Za-z0-9][A-Za-z0-9_/-]*\r?\n?|[a-f0-9]{40}(?:[a-f0-9]{24})?\r?\n?)$/i.test(head)) throw new Error("git-head-invalid");
  return { root, gitDir, commonDir: gitDir, objectFormat, configDigest: digest(config),
    repoId: digest(JSON.stringify([root, gitDir, gitDir, objectFormat, gitStat.dev, gitStat.ino, gitStat.birthtimeMs])) };
}

const protectionFreshness = new WeakMap<GitProtectionFacts, { facts: string; topology: string }>();
/** Known absence is file-protection coverage, never a repository identity or Git mutation permit. */
function absentProtectionTopology(root: string): string {
  const entries: unknown[] = [];
  let dir = root;
  for (let depth = 0; depth < 64; depth++) {
    const info = lstatSync(dir);
    if (!info.isDirectory() || info.isSymbolicLink() || realpathSync(dir) !== dir) throw new Error("absent-git-root-link-unproven");
    entries.push([dir, info.dev, info.ino, info.birthtimeMs]);
    const bare = ["HEAD", "objects"].map(name => {
      try { const entry = lstatSync(path.join(dir, name)); return [entry.dev, entry.ino, entry.birthtimeMs, entry.isDirectory(), entry.isSymbolicLink()]; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    });
    if (bare.every(value => value !== null)) throw new Error("absent-git-bare-association-unsupported");
    entries.push(bare);
    for (const target of [path.join(dir, ".git"), ...(dir === root ? [path.join(dir, ".gitmodules")] : [])]) {
      try { lstatSync(target); throw new Error("absent-git-association-changed"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    const parent = path.dirname(dir); if (parent === dir) return digest(JSON.stringify(entries)); dir = parent;
  }
  throw new Error("absent-git-ancestor-budget");
}
/** Bounded identity/topology fence; object/ref contents do not change the protected filesystem roots. */
function protectionTopology(root: string): string {
  try { lstatSync(path.join(root, ".git")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return absentProtectionTopology(root); throw error; }
  const describe = (file: string) => {
    try {
      const info = lstatSync(file);
      return [realpathSync(file), info.dev, info.ino, info.birthtimeMs, info.isDirectory(), info.isSymbolicLink(), info.nlink];
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  };
  const gitDir = path.join(root, ".git"), config = path.join(gitDir, "config"), info = lstatSync(config);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 32 * 1024) throw new Error("git-protection-config-unsafe");
  const sentinels = [path.join(root, ".gitmodules"), ...["commondir", "worktrees", "config.worktree", "objects/info/alternates", "objects/info/http-alternates", "info/grafts", "shallow", "refs/replace", "modules"].map(rel => path.join(gitDir, rel))];
  const values = sentinels.map(describe);
  if (values.some(value => value !== null)) throw new Error("git-protection-topology-unsupported");
  if (realpathSync(root) !== root || realpathSync(gitDir) !== gitDir || lstatSync(root).isSymbolicLink() || lstatSync(gitDir).isSymbolicLink()) throw new Error("git-protection-root-changed");
  return digest(JSON.stringify([describe(root), describe(gitDir), describe(config), digest(readFileSync(config)), values]));
}
/** Only the actual issued complete observation can be checked; copied/self-reported snapshots are not authority. */
export function checkGitProtectionFactsCurrent(facts: GitProtectionFacts): boolean {
  const issued = protectionFreshness.get(facts);
  if (!issued || issued.facts !== JSON.stringify(facts) || facts.coverage !== "complete") return false;
  try { return issued.topology === protectionTopology(facts.projectRoot); } catch { return false; }
}

/** Read-only protection discovery also reports unsupported linked layouts; unknown is never an empty safe set. */
export async function readGitProtectionFacts(projectRoot: string): Promise<GitProtectionFacts> {
  const root = await realpath(projectRoot), roots = new Set<string>([path.join(root, ".git")]), reasons: string[] = [];
  try {
    await lstat(path.join(root, ".git"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      try {
        const topology = absentProtectionTopology(root), protectedGitRoots = [...roots];
        const facts: GitProtectionFacts = { projectRoot: root, protectedGitRoots, coverage: "complete", reasons: [],
          basisDigest: digest(JSON.stringify([root, protectedGitRoots, "no-repository", topology])) };
        if (topology !== absentProtectionTopology(root)) throw new Error("absent-git-observation-raced");
        protectionFreshness.set(facts, { facts: JSON.stringify(facts), topology }); return facts;
      } catch (absentError) { reasons.push(String(absentError)); }
    } else reasons.push(String(error));
  }
  const metadata: Array<[string, string]> = [];
  const boundedText = async (file: string) => { const info = await lstat(file); if (!info.isFile() || info.size > 4096) throw new Error("git-protection-metadata-invalid");
    const text = await readFile(file, "utf8"); metadata.push([file, digest(text)]); return text.trim(); };
  try {
    const entry = path.join(root, ".git"), info = await lstat(entry); let gitDir: string;
    if (info.isDirectory()) gitDir = await realpath(entry);
    else { const match = /^gitdir: ([^\r\n]+)$/.exec(await boundedText(entry)); if (!match) throw new Error("git-protection-gitfile-invalid"); gitDir = await realpath(path.resolve(root, match[1]!)); reasons.push("Gitfile/shared layout is not a supported mutation surface"); }
    roots.add(gitDir); let commonDir = gitDir;
    if (await exists(path.join(gitDir, "commondir"))) { commonDir = await realpath(path.resolve(gitDir, await boundedText(path.join(gitDir, "commondir")))); roots.add(commonDir); reasons.push("Shared common-dir mutation coverage is unknown"); }
    const worktrees = path.join(commonDir, "worktrees");
    if (await exists(worktrees)) {
      const entries = await readdir(worktrees); if (entries.length > 128) throw new Error("git-protection-worktree-budget");
      for (const name of entries) { const gitfile = await realpath(await boundedText(path.join(worktrees, name, "gitdir"))); const worktreeRoot = path.dirname(gitfile); if (worktreeRoot !== root) roots.add(worktreeRoot); }
      reasons.push("Other worktree roots were found; shared execution coverage is unknown");
    }
  } catch (error) { reasons.push(String(error)); }
  let identity: GitRepositoryIdentity | undefined;
  try { identity = await inspectGitRepository(root); } catch (error) { reasons.push(String(error)); }
  const protectedGitRoots = [...roots].sort();
  const facts: GitProtectionFacts = { projectRoot: root, protectedGitRoots, coverage: identity && !reasons.length ? "complete" : "unknown", ...(identity ? { identity } : {}), reasons,
    basisDigest: digest(JSON.stringify([root, protectedGitRoots, identity?.repoId, identity?.configDigest, metadata])) };
  if (facts.coverage === "complete") {
    try {
      const topology = protectionTopology(root);
      const currentGit = lstatSync(path.join(root, ".git"));
      const repoId = identity && digest(JSON.stringify([root, identity.gitDir, identity.commonDir, identity.objectFormat, currentGit.dev, currentGit.ino, currentGit.birthtimeMs]));
      if (repoId !== identity?.repoId || digest(readFileSync(path.join(root, ".git/config"))) !== identity?.configDigest
        || topology !== protectionTopology(root)) throw new Error("git-protection-observation-raced");
      protectionFreshness.set(facts, { facts: JSON.stringify(facts), topology });
    } catch (error) { facts.coverage = "unknown"; facts.reasons = [...facts.reasons, String(error)]; }
  }
  return facts;
}

/** Host-bound new-root facts, not a model bootstrap flag or permission to import existing content. */
export async function readGitInitializationFacts(projectRoot: string): Promise<GitInitializationFacts> {
  const root = await realpath(projectRoot), reasons: string[] = [], parentRepositories: string[] = [], files: GitInitializationFacts["files"][number][] = [];
  let state: GitInitializationFacts["state"] = await exists(path.join(root, ".git")) ? "existing" : "absent", bytes = 0, visited = 0;
  if (root.toLowerCase() !== path.resolve(projectRoot).toLowerCase() || (await lstat(projectRoot)).isSymbolicLink()) { state = "unsupported"; reasons.push("Project root is not a canonical host root"); }
  let parent = path.dirname(root);
  for (let n = 0; n < 64; n++) { if (await exists(path.join(parent, ".git"))) parentRepositories.push(parent); const next = path.dirname(parent); if (next === parent) break; parent = next; }
  if (parentRepositories.length) reasons.push("Nested/parent Git association needs explicit host handling");
  async function visit(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name), rel = path.relative(root, absolute).replaceAll("\\", "/"); if (rel === ".git") continue;
      if (++visited > 2048) throw new Error("git-init-inventory-budget"); const info = await lstat(absolute);
      if (info.isSymbolicLink() || (!info.isDirectory() && info.nlink > 1)) throw new Error("git-init-inventory-link-unsupported");
      if (info.isDirectory()) await visit(absolute);
      else { if (!info.isFile() || info.size > 4 * 1024 * 1024 || (bytes += info.size) > 16 * 1024 * 1024) throw new Error("git-init-inventory-byte-budget");
        const raw = await readFile(absolute); files.push({ path: rel, sha256: digest(raw), bytes: raw.length, source: rel.startsWith(".ans/") ? "application-state" : "unattributed-existing-content" }); }
    }
  }
  try { await visit(root); } catch (error) { state = "unsupported"; reasons.push(String(error)); }
  let applicationStatePresent = false; try { const info = await lstat(path.join(root, ".ans")); applicationStatePresent = info.isDirectory() && !info.isSymbolicLink(); } catch { /* true absence */ }
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { projectRoot: root, state, applicationStatePresent, parentRepositories, files, reasons,
    qualificationDigest: digest(JSON.stringify([root, state, applicationStatePresent, parentRepositories, files.filter(file => file.source !== "application-state"), reasons])),
    basisDigest: digest(JSON.stringify([root, state, applicationStatePresent, parentRepositories, files])) };
}

/** Internal transport, imported only by the same Provider's fixed template implementations. */
export async function executeGit(root: string, argv: readonly string[], options: { input?: Buffer; signal?: AbortSignal; timeoutMs?: number; outputLimit?: number; initializing?: boolean; operationId?: string; hostLeaseId?: string; timestamp?: string } = {}): Promise<GitProcessFacts> {
  const identity = options.initializing ? undefined : await inspectGitRepository(root);
  const executable = await realpath(GIT_EXECUTABLE), processId = randomUUID(), startedAt = new Date().toISOString();
  const args = commandArgs(argv);
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"]) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { PATH: path.dirname(executable), HOME: path.join(root, ".ans/git-home"), XDG_CONFIG_HOME: path.join(root, ".ans/git-home"),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: emptyFile, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1",
    GIT_CEILING_DIRECTORIES: root, GIT_ATTR_NOSYSTEM: "1", GIT_LFS_SKIP_SMUDGE: "1", LC_ALL: "C", LANG: "C", TZ: "UTC",
    GIT_AUTHOR_NAME: "ANS Application", GIT_AUTHOR_EMAIL: "ans@localhost", GIT_COMMITTER_NAME: "ANS Application", GIT_COMMITTER_EMAIL: "ans@localhost" });
  if (options.timestamp !== undefined) {
    const seconds = Math.floor(Date.parse(options.timestamp) / 1000);
    if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error("git-object-timestamp-invalid");
    env.GIT_AUTHOR_DATE = env.GIT_COMMITTER_DATE = `@${seconds} +0000`;
  }
  const facts: GitProcessFacts = { processId, executable, argv: args, startedAt, exitCode: null, signal: null, timedOut: false, aborted: false, outputTruncated: false, termination: "unknown", stdout: "", stderr: "" };
  if (options.operationId) facts.operationId = options.operationId; if (identity) facts.repoId = identity.repoId;
  if (options.signal?.aborted) return { ...facts, aborted: true, endedAt: new Date().toISOString() };
  const mutating = ["init", "hash-object", "mktree", "commit-tree", "update-ref"].includes(argv[0] ?? "");
  let processFile: string | undefined;
  if (mutating) {
    if (options.hostLeaseId && !checkGitHostAction({ projectRoot: root, leaseId: options.hostLeaseId, kind: "git-mutation" }).ok) throw new Error("git-host-lease-invalid-before-command");
    if (!facts.operationId) throw new Error("git-mutation-operation-required");
    const initFile = path.join(root, ".ans/git-init-process.json");
    if (await exists(initFile)) {
      const info = await lstat(initFile);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 128 * 1024 || await realpath(initFile) !== initFile) throw new Error("git-init-process-evidence-unsafe");
      const initial: unknown = JSON.parse(await readFile(initFile, "utf8"));
      if (!isGitProcessNotStarted(initial) && (!initial || typeof initial !== "object" || !("termination" in initial) || initial.termination !== "exited")) throw new Error("git-init-process-unresolved");
    }
    if (options.initializing) processFile = initFile;
    else {
      const dir = path.join(root, ".git/ans/processes"); await mkdir(dir, { recursive: true });
      const names = await readdir(dir); if (names.length > 2048) throw new Error("git-process-evidence-budget");
      for (const name of names) {
        if (!/^[a-f0-9-]{36}\.json$/.test(name)) throw new Error("git-process-evidence-corrupt");
        const previous: unknown = JSON.parse(await readFile(path.join(dir, name), "utf8"));
        if (!isGitProcessNotStarted(previous) && (!previous || typeof previous !== "object" || !("termination" in previous) || previous.termination !== "exited")) throw new Error("git-owned-process-unresolved");
      }
      processFile = path.join(dir, `${processId}.json`);
    }
    // Persist unknown before spawn: a crash/forced timeout cannot silently release the mutation fence.
    facts.launch = "pending";
    await atomicWrite(processFile, JSON.stringify(facts));
  }
  // No await may separate this final host check from the actual spawn. A cancelled pending record is not an exit receipt.
  if (options.signal?.aborted || mutating && options.hostLeaseId && !checkGitHostAction({ projectRoot: root, leaseId: options.hostLeaseId, kind: "git-mutation" }).ok) {
    facts.aborted = true; facts.launch = "cancelled-before-spawn"; facts.endedAt = new Date().toISOString();
    if (processFile) await atomicWrite(processFile, JSON.stringify(facts));
    return facts;
  }
  const limit = Math.min(options.outputLimit ?? 1024 * 1024, 4 * 1024 * 1024), timeout = Math.min(Math.max(options.timeoutMs ?? 5000, 1), 30000);
  return new Promise(resolve => {
    let done = false, count = 0; const buffers: { stdout: Buffer[]; stderr: Buffer[] } = { stdout: [], stderr: [] };
    const child = spawn(executable, args, { cwd: root, env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    facts.launch = "started";
    facts.pid = child.pid;
    let forcedWait: ReturnType<typeof setTimeout> | undefined;
    const finish = async () => { if (done) return; done = true; clearTimeout(timer); if (forcedWait) clearTimeout(forcedWait); options.signal?.removeEventListener("abort", abort);
      const output = Buffer.concat(buffers.stdout); facts.stdout = output.toString("utf8"); facts.stdoutBase64 = output.toString("base64"); facts.stderr = Buffer.concat(buffers.stderr).toString("utf8");
      if (processFile) try { await atomicWrite(processFile, JSON.stringify(facts)); } catch (error) { facts.termination = "unknown"; facts.error = `git-process-evidence-write:${String(error)}`; }
      resolve(facts); };
    const stop = () => { child.kill(); forcedWait ??= setTimeout(finish, 500); };
    const abort = () => { facts.aborted = true; stop(); };
    const timer = setTimeout(() => { facts.timedOut = true; stop(); }, timeout);
    options.signal?.addEventListener("abort", abort, { once: true });
    for (const stream of ["stdout", "stderr"] as const) child[stream].on("data", (chunk: Buffer) => {
      const available = Math.max(0, limit - count); if (available) buffers[stream].push(chunk.subarray(0, available)); count += chunk.length;
      if (count > limit) { facts.outputTruncated = true; stop(); }
    });
    child.once("error", error => { facts.error = error.message; facts.endedAt = new Date().toISOString(); finish(); });
    child.once("close", (code, signal) => { facts.exitCode = code; facts.signal = signal; facts.endedAt = new Date().toISOString();
      // Root close after forced cancellation is not proof of the whole owned tree.
      if (!facts.timedOut && !facts.aborted && !facts.outputTruncated && !facts.error) facts.termination = "exited"; finish(); });
    child.stdin.on("error", () => {}); child.stdin.end(options.input);
  });
}
export function requireGitSuccess(facts: GitProcessFacts): string {
  if (facts.termination !== "exited" || facts.exitCode !== 0 || facts.outputTruncated) throw new Error(`git-command-failed:${facts.exitCode}:${facts.termination}:${facts.stderr}`);
  return facts.stdout;
}
/** Read-only exact bootstrap transport plan; this does not allocate a worktree/index or authorize execution. */
export async function planGitRepositoryInitialization(root: string, format: GitRepositoryIdentity["objectFormat"] = "sha1"): Promise<import("../abstract/trunk-store.ts").GitInitializationPlan> {
  const facts = await readGitInitializationFacts(root);
  if (facts.state !== "absent" || facts.reasons.length) throw new Error("git-init-root-qualification-unavailable");
  const templateDir = path.join(facts.projectRoot, ".ans/git-empty-template");
  if (await exists(templateDir)) {
    const info = await lstat(templateDir);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(templateDir) !== templateDir || (await readdir(templateDir)).length) throw new Error("git-init-template-unsafe");
  }
  return { projectRoot: facts.projectRoot, objectFormat: format, templateDir, qualificationDigest: facts.qualificationDigest,
    worksite: { kind: "raw-object-plumbing", index: "not-used", checkout: "not-used" },
    argv: commandArgs(["init", `--template=${templateDir}`, `--object-format=${format}`, "--initial-branch=ans-unpublished", "--", facts.projectRoot]) };
}

export async function initializeGitRepository(root: string, format: GitRepositoryIdentity["objectFormat"] = "sha1", fence?: {
  operationId: string; hostLeaseId?: string; heldLockToken?: string; qualificationDigest: string; expectedFiles: readonly { path: string; sha256: string }[];
}, signal?: AbortSignal): Promise<GitRepositoryIdentity> {
  const release = fence && !fence.heldLockToken ? await acquireVersionLock(root) : undefined, lockToken = fence?.heldLockToken ?? release?.token;
  try {
  if (fence) {
    if (fence.hostLeaseId && !checkGitHostAction({ projectRoot: root, leaseId: fence.hostLeaseId, kind: "git-mutation" }).ok) throw new Error("git-host-lease-invalid-before-init");
    const current = await readGitInitializationFacts(root);
    if (current.state !== "absent" || current.reasons.length || current.qualificationDigest !== fence.qualificationDigest) throw new Error("git-init-root-basis-stale");
    for (const expected of fence.expectedFiles) {
      if (!expected.path.startsWith(".ans/") || expected.path.split("/").some(part => !part || part === "." || part === "..") || /[\\:\x00-\x1f]/.test(expected.path)) throw new Error("git-init-binding-path-invalid");
      const absolute = path.join(current.projectRoot, expected.path), info = await lstat(absolute);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 2 * 1024 * 1024 || await realpath(absolute) !== absolute
        || digest(await readFile(absolute)) !== expected.sha256) throw new Error("git-init-binding-stale");
    }
    if (signal?.aborted || !lockToken || !await ownsVersionLock(root, lockToken)) throw new Error("git-init-fence-lost");
  }
  const canonical = await realpath(root); if (canonical.toLowerCase() !== path.resolve(root).toLowerCase() || await exists(path.join(root, ".git"))) throw new Error("git-init-target-not-empty");
  const ans = path.join(root, ".ans");
  if (await exists(ans) && ((await lstat(ans)).isSymbolicLink() || await realpath(ans) !== ans)) throw new Error("git-init-control-path-unsafe");
  const template = path.join(ans, "git-empty-template");
  if (await exists(template) && ((await lstat(template)).isSymbolicLink() || await realpath(template) !== template)) throw new Error("git-init-template-unsafe");
  await mkdir(template, { recursive: true });
  if ((await readdir(template)).length) throw new Error("git-init-template-not-empty");
  if (signal?.aborted || lockToken && !await ownsVersionLock(root, lockToken)) throw new Error("git-init-fence-lost");
  requireGitSuccess(await executeGit(canonical, ["init", `--template=${template}`, `--object-format=${format}`, "--initial-branch=ans-unpublished", "--", canonical], { initializing: true, signal, hostLeaseId: fence?.hostLeaseId, operationId: fence?.operationId ?? `init-${digest(canonical)}` }));
  return inspectGitRepository(canonical);
  } finally { await release?.(); }
}

export function createGitQueryPort(root: string, budgets: { timeoutMs?: number; outputLimit?: number } = {}): GitQueryPort {
  async function build(input: GitQueryRequest) {
    const identity = await inspectGitRepository(root), paths = (input.paths ?? []).map(literalGitPath);
    if (paths.length > 64 || (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100))) throw new Error("git-query-budget");
    const target = input.target ? fullGitOid(input.target, identity.objectFormat) : undefined, other = input.other ? fullGitOid(input.other, identity.objectFormat) : undefined;
    let argv: string[];
    switch (input.template) {
      case "status": argv = ["status", "--porcelain=v1", "-z", "--untracked-files=normal", "--ignore-submodules=all", "--", ...paths]; break;
      case "diff": argv = ["diff", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", ...(target ? [target] : []), ...(other ? [other] : []), "--", ...paths]; break;
      case "log": argv = ["log", `-${input.limit ?? 20}`, "--format=%H%x00%P%x00%s", ...(target ? [target] : ["--all"]), "--", ...paths]; break;
      case "show": if (!target || paths.length !== 1) throw new Error("git-show-needs-one-literal-path"); argv = ["cat-file", "blob", `${target}:${paths[0]}`]; break;
      case "rev-parse": if (!target) throw new Error("git-target-required"); argv = ["rev-parse", "--verify", `${target}^{commit}`]; break;
      case "ls-files": argv = ["ls-files", "--stage", "-z", "--", ...paths]; break;
      case "ls-tree": if (!target) throw new Error("git-target-required"); argv = ["ls-tree", "-r", "-z", "--full-tree", target, "--", ...paths]; break;
      case "merge-base": if (!target || !other) throw new Error("git-two-targets-required"); argv = ["merge-base", target, other]; break;
      case "branch-list": argv = ["for-each-ref", `--count=${input.limit ?? 20}`, "--format=%(refname)%00%(objectname)", "refs/heads/"]; break;
      case "worktree-list": argv = ["worktree", "list", "--porcelain", "-z"]; break;
      default: throw new Error("git-template-invalid");
    }
    return { identity, body: argv };
  }
  return { inspect: () => inspectGitRepository(root), async plan(input) { const { identity, body } = await build(input); return { identity, argv: commandArgs(body) }; },
    async query(input, signal) { const { identity, body } = await build(input); return executeGit(identity.root, body, { signal, operationId: input.operationId, ...budgets }); } };
}

// —————————————————————— 只读 Git 固定传输（2026-11-08 W3b） ——————————————————————
// 设计 P1.3 §2.4.3 / 派发接口评审 I0-4：`run_shell` 命中只读 Git 白名单后的**唯一执行入口**。
// - **不接受任意 argv**：只接受 `matchReadonlyGit` 的受限描述（结构校验后经单一来源
//   `buildReadonlyGitBody` 构造规范体；matcher/规范体逻辑不在本文件复制）；
// - **固定传输**：复用 `executeGit`——绝对可执行文件（`GIT_EXECUTABLE` realpath，不按 PATH/cwd 解析）、
//   `--no-pager --no-optional-locks --literal-pathspecs` + 12 项固定 `-c` 前缀、重建 env
//   （SystemRoot/WINDIR/TEMP/TMP、PATH=git dir、HOME/XDG、GIT_* 固定、LC_ALL/LANG/TZ），
//   `spawn(executable, args, { cwd: root, shell: false })`；
// - **预算有界**：`executeGit` 内 clamp（timeout 1..30000ms、输出 1B..4MiB；缺省 5000ms/1MiB）；
// - 返回映射为运行时核心 `ReadonlyGitExecutionFacts`（与 `run_shell` 的 spawn 回执同形）。

const READONLY_GIT_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  "status", "log", "diff", "show", "rev-parse", "ls-files", "ls-tree", "merge-base", "blame", "cat-file",
]);
const READONLY_GIT_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const READONLY_GIT_TARGET = /^(?:[0-9a-f]{40}|[0-9a-f]{64}|HEAD)$/;
const READONLY_GIT_CAT_FILE_MODES: ReadonlySet<string> = new Set(["-t", "-s", "-e", "-p", "blob", "commit", "tree", "tag"]);
const READONLY_GIT_DISPLAY: ReadonlySet<string> = new Set(["stat", "name-only", "name-status"]);

/**
 * 校验受限描述形状（只做字段/类型/取值域检查——**不是**第二份 matcher：白名单解析与规范体
 * 构造仍唯一在门禁引擎；此处只拒绝形状不合法的对象，防调用方把任意对象当 argv 注入）。
 */
function assertReadonlyGitMatch(value: object): ReadonlyGitMatch {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("readonly-git-match-invalid");
  const rec = value as Record<string, unknown>;
  const template = rec.template;
  if (typeof template !== "string" || !READONLY_GIT_TEMPLATE_IDS.has(template) || rec.id !== template) throw new Error("readonly-git-match-invalid");
  if (!Array.isArray(rec.paths) || rec.paths.some((entry) => typeof entry !== "string")) throw new Error("readonly-git-match-invalid");
  const paths = rec.paths as readonly string[];
  const target = rec.target;
  const other = rec.other;
  if (target !== undefined && (typeof target !== "string" || !READONLY_GIT_TARGET.test(target))) throw new Error("readonly-git-match-invalid");
  if (other !== undefined && (typeof other !== "string" || !READONLY_GIT_TARGET.test(other))) throw new Error("readonly-git-match-invalid");
  if (rec.limit !== undefined && (typeof rec.limit !== "number" || !Number.isInteger(rec.limit) || rec.limit < 1 || rec.limit > 100)) throw new Error("readonly-git-match-invalid");
  if (rec.oneline !== undefined && typeof rec.oneline !== "boolean") throw new Error("readonly-git-match-invalid");
  if (rec.display !== undefined && !READONLY_GIT_DISPLAY.has(String(rec.display))) throw new Error("readonly-git-match-invalid");
  if (rec.catFileMode !== undefined && !READONLY_GIT_CAT_FILE_MODES.has(String(rec.catFileMode))) throw new Error("readonly-git-match-invalid");
  if (rec.lineStart !== undefined || rec.lineEnd !== undefined) {
    if (typeof rec.lineStart !== "number" || typeof rec.lineEnd !== "number"
      || !Number.isInteger(rec.lineStart) || !Number.isInteger(rec.lineEnd)
      || rec.lineStart < 1 || rec.lineEnd < rec.lineStart || rec.lineEnd > 2000 || rec.lineEnd - rec.lineStart + 1 > 2000) throw new Error("readonly-git-match-invalid");
  }
  switch (template) {
    case "show":
      if (typeof target !== "string" || !READONLY_GIT_OID.test(target) || paths.length !== 1) throw new Error("readonly-git-match-invalid");
      break;
    case "rev-parse":
      if (typeof target !== "string") throw new Error("readonly-git-match-invalid");
      break;
    case "merge-base":
      if (typeof target !== "string" || typeof other !== "string") throw new Error("readonly-git-match-invalid");
      break;
    case "cat-file":
      if (typeof target !== "string" || typeof rec.catFileMode !== "string") throw new Error("readonly-git-match-invalid");
      break;
    case "blame":
      if (paths.length !== 1) throw new Error("readonly-git-match-invalid");
      break;
    case "status":
    case "ls-files":
      if (target !== undefined || other !== undefined) throw new Error("readonly-git-match-invalid");
      break;
    default:
      break;
  }
  return value as ReadonlyGitMatch;
}

/**
 * 只读 Git 固定传输（公共出口经 `src/provider/trunk/public/trunk-store.ts` 导出；I0-4）。
 * 只接受 matcher 的受限描述；内部经 `buildReadonlyGitBody` 构造规范体后交 `executeGit`。
 */
export async function executeReadonlyGit(
  projectRoot: string,
  match: object,
  budgets: { timeoutMs?: number; outputLimit?: number } = {},
): Promise<ReadonlyGitExecutionFacts> {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") throw new Error("readonly-git-root-invalid");
  const body = buildReadonlyGitBody(assertReadonlyGitMatch(match));
  const timeoutMs = typeof budgets.timeoutMs === "number" && Number.isFinite(budgets.timeoutMs) ? budgets.timeoutMs : undefined;
  const outputLimit = typeof budgets.outputLimit === "number" && Number.isFinite(budgets.outputLimit) ? budgets.outputLimit : undefined;
  const facts = await executeGit(projectRoot, body, {
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(outputLimit !== undefined ? { outputLimit } : {}),
  });
  return {
    ...(facts.exitCode !== null ? { exitCode: facts.exitCode } : {}),
    ...(facts.signal !== null ? { signal: facts.signal } : {}),
    stdout: facts.stdout,
    stderr: facts.stderr,
    ...(facts.error !== undefined ? { error: facts.error } : {}),
    ...(facts.timedOut ? { timedOut: true } : {}),
    ...(facts.outputTruncated ? { stdoutTruncated: true } : {}),
  };
}

interface HostCoordinator { revision: number; inventory?: GitHostInventory; lease?: { id: string; kind: GitHostActionKind; interrupted?: string };
  protection?: { state: "required" | "unmanaged" | "unknown"; revision: number; digest: string; everRequired: boolean } }
const hostCoordinators = new Map<string, HostCoordinator>();
const hostProjectKey = (root: string) => process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root);
function stableInventory(value: unknown): unknown { if (Array.isArray(value)) return value.map(stableInventory);
  return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "observedAt").map(([key, val]) => [key, stableInventory(val)])) : value; }
const hostCoordinator = (root: string) => { const key = hostProjectKey(root); let state = hostCoordinators.get(key);
  if (!state) { state = { revision: 0 }; hostCoordinators.set(key, state); } return state; };
/** Derived admission requirement, not a configurable permission. Missing/corrupt evidence never clears an observed managed scope. */
export async function readGitHostProtectionRequirement(input: { projectRoot: string }): Promise<{
  state: "required" | "unmanaged" | "unknown"; revision: number; reasons: readonly string[];
}> {
  const coordinator = hostCoordinator(input.projectRoot), reasons: string[] = [], evidence: string[] = [];
  let state: "required" | "unmanaged" | "unknown" = "unmanaged";
  try {
    const root = await realpath(input.projectRoot);
    if (hostProjectKey(root) !== hostProjectKey(input.projectRoot) || (await lstat(input.projectRoot)).isSymbolicLink()) throw new Error("noncanonical-project-root");
    const gitEntry = path.join(root, ".git");
    if (await exists(gitEntry)) { const info = await lstat(gitEntry);
      if (!info.isDirectory() || info.isSymbolicLink() || await realpath(gitEntry) !== gitEntry) throw new Error("git-association-protection-requirement-unknown"); }
    let dir = root;
    for (const part of [".ans", "trunk"]) { dir = path.join(dir, part); if (!await exists(dir)) break;
      const info = await lstat(dir); if (!info.isDirectory() || info.isSymbolicLink() || await realpath(dir) !== dir) throw new Error("unsafe-git-control-root"); }
    const mode = path.join(root, ".ans/trunk/git-mode.json");
    if (await exists(mode)) { state = "required"; evidence.push("git-mode-present"); }
    const sources = path.join(root, ".ans/trunk/initialization-sources");
    if (await exists(sources)) {
      const info = await lstat(sources); if (!info.isDirectory() || info.isSymbolicLink() || await realpath(sources) !== sources) throw new Error("unsafe-initialization-source-root");
      const names = await readdir(sources); if (names.length > 2048) throw new Error("initialization-source-budget");
      for (const name of names) {
        if (!/^init-source-[a-f0-9]{64}\.json$/.test(name)) throw new Error("invalid-initialization-source-name");
        const file = path.join(sources, name), stat = await lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 128 * 1024 || await realpath(file) !== file) throw new Error("unsafe-initialization-source");
        const bytes = await readFile(file), source: unknown = JSON.parse(bytes.toString("utf8"));
      if (!gitRecord(source) || source.schema !== "repository-work-source/v1" || (source.kind !== "customer-turn" && source.kind !== "creator-report")
          || source.sourceId !== name.slice(0, -5) || source.projectRoot !== root) throw new Error("invalid-initialization-source");
        state = "required"; evidence.push(`${name}:${digest(bytes)}`);
      }
    }
    for (const record of await listGitInitializationRecords(root)) { state = "required"; evidence.push(`init:${record.operationId}:${record.requestDigest}`); }
    if (await exists(path.join(root, ".git/refs/ans/trunk"))) { state = "required"; evidence.push("app-ref-present"); }
    const packed = path.join(root, ".git/packed-refs");
    if (await exists(packed)) { const info = await lstat(packed); if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024) throw new Error("packed-ref-discovery-unknown");
      if (/^[a-f0-9]+ refs\/ans\/trunk$/m.test(await readFile(packed, "utf8"))) { state = "required"; evidence.push("packed-app-ref-present"); } }
  } catch (error) { state = "unknown"; reasons.push(String(error)); }
  if (coordinator.protection?.everRequired && state !== "required") { state = "required"; reasons.push("Previously observed managed scope cannot be cleared by missing/invalid evidence"); }
  const binding = digest(JSON.stringify([state, evidence.sort(), reasons]));
  const prior = coordinator.protection;
  if (!prior || binding !== prior.digest) {
    coordinator.protection = { state, revision: (prior?.revision ?? 0) + 1, digest: binding, everRequired: state === "required" || !!prior?.everRequired };
    coordinator.revision++;
  }
  return { state, revision: coordinator.protection!.revision, reasons };
}
/** Captures ordinary host facts; this never upgrades unknown coverage to a mutation permit. */
export function recordGitHostInventory(inventory: GitHostInventory): { ok: true; coordinatorRevision: number } | { ok: false; code: string } {
  const state = hostCoordinator(inventory.projectRoot);
  if (state.inventory && typeof inventory.revision === "number" && typeof state.inventory.revision === "number" && inventory.revision < state.inventory.revision)
    return { ok: false, code: "git-host-inventory-stale" };
  if (state.inventory?.revision === inventory.revision && JSON.stringify(stableInventory(state.inventory)) !== JSON.stringify(stableInventory(inventory))) return { ok: false, code: "git-host-inventory-revision-conflict" };
  if (state.inventory?.revision !== inventory.revision) {
    state.inventory = structuredClone(inventory); state.revision++;
    // No registered actor has OS confinement: an admission change in another project can affect this repository too.
    for (const coordinator of hostCoordinators.values()) if (coordinator.lease?.kind === "git-mutation") coordinator.lease.interrupted = "application-inventory-changed";
  }
  return { ok: true, coordinatorRevision: state.revision };
}
/** No callbacks enter Service. Caller performs one host action, then ends this exact lease. */
export function beginGitHostAction(input: { projectRoot: string; kind: GitHostActionKind; expectedCoordinatorRevision?: number }):
  { ok: true; leaseId: string; coordinatorRevision: number } | { ok: false; code: string } {
  const state = hostCoordinator(input.projectRoot);
  if (state.lease) return { ok: false, code: "git-host-coordinator-busy" };
  if ([...hostCoordinators.values()].some(other => other !== state && other.lease && (input.kind === "git-mutation" || other.lease.kind === "git-mutation")))
    return { ok: false, code: "git-host-cross-project-coordinator-busy" };
  if (input.expectedCoordinatorRevision !== undefined && state.revision !== input.expectedCoordinatorRevision) return { ok: false, code: "git-host-inventory-stale" };
  state.lease = { id: randomUUID(), kind: input.kind }; state.revision++;
  return { ok: true, leaseId: state.lease.id, coordinatorRevision: state.revision };
}
export function endGitHostAction(input: { projectRoot: string; leaseId: string; inventory?: GitHostInventory }): { ok: true; coordinatorRevision: number } | { ok: false; code: string } {
  const state = hostCoordinator(input.projectRoot);
  if (state.lease?.id !== input.leaseId) return { ok: false, code: "git-host-lease-mismatch" };
  if (input.inventory) { if (hostProjectKey(input.inventory.projectRoot) !== hostProjectKey(input.projectRoot)) return { ok: false, code: "git-host-project-mismatch" };
    const recorded = recordGitHostInventory(input.inventory); if (!recorded.ok) return recorded; }
  state.lease = undefined; state.revision++; return { ok: true, coordinatorRevision: state.revision };
}
/** Emergency stop is never held behind a normal admission lease. This invalidates proof, not the owned process or lease. */
export function recordGitHostInterruption(input: { projectRoot: string; reason: string; coreSessionId?: string }): { coordinatorRevision: number } {
  const state = hostCoordinator(input.projectRoot);
  state.revision++;
  if (state.lease) state.lease.interrupted = `${input.reason}:${input.coreSessionId ?? "unknown-session"}`;
  for (const other of hostCoordinators.values()) if (other !== state && other.lease?.kind === "git-mutation") {
    other.revision++; other.lease.interrupted = `application-interruption:${input.reason}:${input.coreSessionId ?? "unknown-session"}`;
  }
  return { coordinatorRevision: state.revision };
}
export function inspectGitHostCoordinator(input: { projectRoot: string }) {
  const state = hostCoordinator(input.projectRoot);
  return structuredClone({ coordinatorRevision: state.revision, activeAction: state.lease?.kind, inventory: state.inventory,
    coverage: "unknown" as const, reasons: ["Actual complete team protection/authorization closure has not yet been proven"] });
}

/** Checks the exact held infrastructure lease; never upgrades a tool surface to safe. */
export function checkGitHostAction(input: { projectRoot: string; leaseId: string; kind?: GitHostActionKind }):
  { ok: true; coordinatorRevision: number } | { ok: false; code: string } {
  const state = hostCoordinator(input.projectRoot), lease = state.lease;
  if (!lease || lease.id !== input.leaseId || input.kind !== undefined && lease.kind !== input.kind) return { ok: false, code: "git-host-lease-mismatch" };
  if (lease.interrupted) return { ok: false, code: "git-host-lease-interrupted" };
  return { ok: true, coordinatorRevision: state.revision };
}
