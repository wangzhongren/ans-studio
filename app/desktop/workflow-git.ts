// app/desktop/workflow-git.ts
// T3「两条固定工作流路径」B1/B3（2026-11-10，桌面窗口）：git init / `.gitignore` / 合并 main 的
// **端口**。B1 提供骨架（fail-closed 缺省实现）；B3 追加**真实** `ReleaseGitPort`/`BaselineGitPort`
// 实现（固定 argv / sanitized env / 只本地、不 push/tag）。
//
// 依据：实现级方案 v1.3 §5.2（git init -b main / ans-managed `.gitignore` 块 / baseline commit）、
// §4.3（路径 B 既有仓库/任务分支最小准备）、§6.4（合并 main：应用执行、客户本人确认、judge 不可代批）、
// §8.4；B1 验收 AC-14/AC-22、AC-27 Q5；B3 验收 AC-10/AC-11/AC-14/AC-15/AC-16/AC-22、T-07/T-10/T-12。
//
// 纪律：
//  · B1 骨架保持：`createWorkflowGitPort()` 的缺省实现全部 fail-closed 返回
//    `workflow-git-unavailable`，零文件、零进程、零账本副作用（B1 测试逐字保留）。
//  · B3 真实实现在 `createDesktopReleaseGitPort()` / `createDesktopBaselineGitPort()`：
//    固定 argv + sanitized env（清空全部 `GIT_*` 继承值；`GIT_CONFIG_NOSYSTEM=1`、隔离
//    `HOME`/`XDG_CONFIG_HOME` 到项目内 `.ans/git-home`、`GIT_TERMINAL_PROMPT=0`、
//    `GIT_OPTIONAL_LOCKS=0`、`GIT_NO_REPLACE_OBJECTS=1` 等，沿用仓库既有 `git-command.ts` 约定）；
//    不经 shell、无模型自报参数。
//  · 合并 main **只经应用**；冲突只 `merge --abort` 并切回任务分支、不 force/reset/clean、
//    不 push/tag/发布产物；成功后工作区停在 main。项目级临界区锁（进程内）防并发。
//  · `merge-main` **必须客户本人**：`mergeMainConfirmationError` 把 judge/缺省一律判为未授权
//    （G-IR MF-IR-8：不新增 `requestReleaseMerge`；卡由应用构造）。
//  · 失败码与 v1.3 §5.5/§6.4/附录 C/AC-14/AC-22 一致；本层不发明第二套码值。

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  ensureProjectGitignore,
  taskBranchName,
} from "../../src/common/编排/workflow-service.ts";
import type {
  BaselineGitPort,
  BaselineGitRepositoryState,
  ReleaseGitPort,
  WorkflowGitRepositoryFacts,
  WorkflowServiceFailure,
} from "../../src/common/编排/workflow-service.ts";
import type { GitOid } from "../../src/model/trunk.ts";
import type { ReleaseFileChange, ReleaseMergeKind } from "../../src/model/runtime.ts";

/** 端口失败码（v1.3 §5.5/§6.4/附录 C；AC-14/AC-16/AC-22）。 */
export type WorkflowGitFailureCode =
  | "b-repository-required"
  | "baseline-git-init-failed"
  | "baseline-parent-repository-detected"
  | "baseline-repository-dirty"
  | "baseline-gitignore-dirty"
  | "baseline-branch-exists"
  | "release-workflow-not-ready"
  | "release-unauthorized"
  | "release-main-busy"
  | "release-merge-conflict"
  | "release-already-merged"
  | "release-rejected"
  | "git-command-not-ordinary"
  /** B1 端口骨架缺省实现（B3 注入真实实现前一律 fail-closed）。 */
  | "workflow-git-unavailable";

export interface WorkflowGitFailure {
  readonly ok: false;
  readonly code: WorkflowGitFailureCode;
  readonly message: string;
  readonly missing?: readonly string[];
}

function fail(code: WorkflowGitFailureCode, message: string, missing?: readonly string[]): WorkflowGitFailure {
  return { ok: false, code, message, ...(missing !== undefined ? { missing } : {}) };
}

/** `git init -b main` 或缺省 tag 的幂等结果：既有仓库（含 worktree `.git` 文件）按 existing 原样保留。 */
export type WorkflowGitRepositoryState = "initialized" | "existing";

export interface EnsureRepositoryRequest {
  readonly projectRoot: string;
}
export type EnsureRepositoryResult =
  | { readonly ok: true; readonly state: WorkflowGitRepositoryState; readonly branch: string }
  | WorkflowGitFailure;

/** ans-managed `.gitignore` 托管块（条目单一来源 = 编排 `workflow-service.ts::ANS_GITIGNORE_ENTRIES`）。 */
export interface EnsureGitignoreRequest {
  readonly projectRoot: string;
}
export type EnsureGitignoreResult =
  | { readonly ok: true; readonly changed: boolean; readonly sha256: string }
  | WorkflowGitFailure;

/** 任务分支 `ans/task/<workflowId>`：同一 workflow 可复用自有分支；同名他属分支 ⇒ `baseline-branch-exists`。 */
export interface PrepareTaskBranchRequest {
  readonly projectRoot: string;
  readonly workflowId: string;
  /** 路径 B 从当前 HEAD 创建（不强制 main）；缺省 = 当前 HEAD。 */
  readonly base?: "head" | "main";
}
export type PrepareTaskBranchResult =
  | { readonly ok: true; readonly branch: string; readonly baseOid: string; readonly reused: boolean }
  | WorkflowGitFailure;

/**
 * 合并 main 的客户确认**唯一有效来源**（AC-14/T-15）：`by` 只允许 `customer`。
 * judge/模型/指令来源一律未授权（judge 只能转人工/拒绝，不得 approve、不得冒充客户）。
 */
export interface MergeMainConfirmation {
  readonly by: "customer" | "judge";
  readonly decisionId?: string;
  readonly at?: string;
}

/**
 * 纯校验：合并执行前必须持客户本人确认。缺省/`judge`/非 customer ⇒ `release-unauthorized`
 * （fail-closed；不产生第二来源、不默认通过）。B3 在呈卡与执行前调用。
 */
export function mergeMainConfirmationError(
  confirmation: MergeMainConfirmation | undefined,
): WorkflowGitFailure | undefined {
  if (confirmation === undefined || confirmation.by !== "customer") {
    return fail(
      "release-unauthorized",
      "合并 main 未被授权：必须由客户本人在 merge-main 高风险确认卡上确认；judge 只能转人工/拒绝，不得代批。",
      ["customer-confirmation"],
    );
  }
  return undefined;
}

/** `merge-main` preview 必含字段（AC-14；应用构造，模型不可自报；B3 呈现）。 */
export interface MergeMainPreview {
  readonly workflowId: string;
  readonly flowId: string;
  /** main 当前 OID；main unborn ⇒ null（`mergeKind:"initial"`）。 */
  readonly mainBaseOid: string | null;
  readonly branchTipOid: string;
  readonly fileCount: number;
  readonly diffStat: string;
  readonly mergeKind: "merge" | "initial";
  readonly highRiskNotes: readonly string[];
}

export interface MergeMainRequest {
  readonly projectRoot: string;
  readonly workflowId: string;
  readonly flowId: string;
  readonly branch: string;
  readonly tipOid: string;
  readonly preview: MergeMainPreview;
  /** 客户本人确认（缺失/judge ⇒ `release-unauthorized`，不进入执行）。 */
  readonly confirmation?: MergeMainConfirmation;
}

export interface MergeMainFileChange {
  readonly path: string;
  readonly status: string;
}

/** `release.merged` 回执（AC-22；幂等 `release:<workflowId>:<tipOid>`；不 push/tag）。 */
export interface MergeMainResult {
  readonly ok: true;
  readonly mergeKind: "merge" | "initial";
  readonly baseOid: string | null;
  readonly tipOid: string;
  readonly mergeOid: string;
  readonly files: readonly MergeMainFileChange[];
  readonly diffDigest: string;
}

/**
 * 工作流 Git 端口（B3 注入真实实现）。B1 缺省实现 = 全 fail-closed 桩：
 * 可类型化、可被测试断言「未执行任何 git 副作用」。
 */
export interface WorkflowGitPort {
  ensureRepository(request: EnsureRepositoryRequest): Promise<EnsureRepositoryResult>;
  ensureGitignore(request: EnsureGitignoreRequest): Promise<EnsureGitignoreResult>;
  prepareTaskBranch(request: PrepareTaskBranchRequest): Promise<PrepareTaskBranchResult>;
  mergeMain(request: MergeMainRequest): Promise<MergeMainResult | WorkflowGitFailure>;
}

const unavailable = (operation: string): WorkflowGitFailure =>
  fail(
    "workflow-git-unavailable",
    `${operation} 未执行：B1 仅提供端口骨架，Git 业务由 B3 实现（fail-closed，零副作用）。`,
  );

/**
 * 构造工作流 Git 端口：B1 无实现 ⇒ 全 fail-closed；B3 以 `implementation` 注入真实业务。
 * 即使注入部分实现，未提供的操作仍 fail-closed（绝不回落 shell/默认 git）。
 */
export function createWorkflowGitPort(implementation?: Partial<WorkflowGitPort>): WorkflowGitPort {
  return {
    ensureRepository: implementation?.ensureRepository ?? (async () => unavailable("git init")),
    ensureGitignore: implementation?.ensureGitignore ?? (async () => unavailable(".gitignore")),
    prepareTaskBranch: implementation?.prepareTaskBranch ?? (async () => unavailable("任务分支准备")),
    mergeMain: implementation?.mergeMain ?? (async (request) => {
      // B1 骨架也必须先执行客户本人确认的纯校验（防止未来实现遗漏；judge/缺省 ⇒ 未授权）。
      return mergeMainConfirmationError(request.confirmation) ?? unavailable("合并 main");
    }),
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// T3 B3（2026-11-10，桌面窗口）：**真实** Git 端口实现（`ReleaseGitPort` / `BaselineGitPort`）
//
// 依据：v1.3 §5.2（git init -b main / ans-managed `.gitignore` / baseline commit / 任务分支 / dirty）、
// §4.3（路径 B：既有仓库、从当前 HEAD 建/复用任务分支）、§6.4（合并 main：initial/`merge --no-ff`/
// 冲突 abort 回任务分支/不 push/tag）、§8.4；B3 验收 AC-10/AC-11/AC-14/AC-15/AC-16/AC-22、T-07/T-10/T-12。
//
// 固定执行约定（与仓库既有 `src/provider/trunk/impl/git-command.ts` 同向）：
//  · 不经 shell（`spawn(...,{shell:false})`）、argv 固定、无模型自报；
//  · sanitized env：继承值中的全部 `GIT_*` 一律丢弃；`GIT_CONFIG_NOSYSTEM=1`、`GIT_CONFIG_GLOBAL`
//    指向项目内空文件、`HOME`/`XDG_CONFIG_HOME` 隔离到 `<projectRoot>/.ans/git-home`、
//    `GIT_TERMINAL_PROMPT=0`、`GIT_OPTIONAL_LOCKS=0`、`GIT_NO_REPLACE_OBJECTS=1`、`GIT_ATTR_NOSYSTEM=1`、
//    `GIT_CEILING_DIRECTORIES=<projectRoot>`（禁止上溯父仓库）、`LC_ALL=C`；
//  · 仓库本地身份缺省（`user.name/user.email`）只写 `.git/config`（不改用户全局配置）。
// ══════════════════════════════════════════════════════════════════════════════════════════════

const GIT_TIMEOUT_MS = 30_000;
const GIT_OUTPUT_LIMIT = 4 * 1024 * 1024;
/** Git 空树 OID（sha1/sha256）：unborn main 的 preview/merge 基线。 */
const EMPTY_TREE_OID: Readonly<Record<"sha1" | "sha256", string>> = Object.freeze({
  sha1: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
  sha256: "6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321",
});

interface GitRunSuccess {
  readonly ok: true;
  readonly stdout: string;
  readonly stderr: string;
}
interface GitRunFailure {
  readonly ok: false;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: string;
}
type GitRunResult = GitRunSuccess | GitRunFailure;

function portFailure(code: string, message: string, missing?: readonly string[]): WorkflowServiceFailure {
  return { ok: false, code, message, ...(missing !== undefined ? { missing: [...missing] } : {}) };
}

function hashSha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function asMessage(result: GitRunFailure): string {
  const detail = `${result.stderr || result.stdout}`.trim();
  return result.error !== undefined ? `${result.error}${detail !== "" ? `：${detail}` : ""}` : detail;
}

/**
 * sanitized 环境（每次调用现场构造；不在进程内缓存）。`HOME`/`XDG_CONFIG_HOME` 隔离到项目内
 * `.ans/git-home`，`GIT_CONFIG_GLOBAL` 指向该目录下的空文件——不读用户全局 config/hooks。
 */
async function sanitizedGitEnv(projectRoot: string): Promise<NodeJS.ProcessEnv> {
  const home = path.join(projectRoot, ".ans", "git-home");
  const emptyConfig = path.join(home, "gitconfig-empty");
  const hooksDir = path.join(home, "hooks-empty");
  await fs.mkdir(hooksDir, { recursive: true }).catch(() => undefined);
  try {
    const info = await fs.stat(emptyConfig);
    if (!info.isFile()) await fs.writeFile(emptyConfig, "", "utf8");
  } catch {
    await fs.writeFile(emptyConfig, "", "utf8").catch(() => undefined);
  }
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "PATHEXT", "ComSpec",
    "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS", "USERPROFILE", "PROGRAMDATA", "SYSTEMDRIVE",
  ]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  Object.assign(env, {
    HOME: home,
    XDG_CONFIG_HOME: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_NO_REPLACE_OBJECTS: "1",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_LFS_SKIP_SMUDGE: "1",
    GIT_CEILING_DIRECTORIES: projectRoot,
    LC_ALL: "C",
    LANG: "C",
    TZ: "UTC",
    GIT_AUTHOR_NAME: "ANS Application",
    GIT_AUTHOR_EMAIL: "ans@local",
    GIT_COMMITTER_NAME: "ANS Application",
    GIT_COMMITTER_EMAIL: "ans@local",
  });
  return env;
}

/** 固定 argv 的 git 执行（无 shell；输出/时限有界；永不抛错，失败如实返回）。 */
async function runGit(
  projectRoot: string,
  argv: readonly string[],
  options: { input?: string; timeoutMs?: number } = {},
): Promise<GitRunResult> {
  const env = await sanitizedGitEnv(projectRoot);
  const hooksDir = path.join(projectRoot, ".ans", "git-home", "hooks-empty");
  // `-c core.hooksPath` 把用户/仓库 hooks 关在门外（不做副作用）；其余参数由调用方固定给出。
  const args = ["-c", `core.hooksPath=${hooksDir}`, ...argv];
  return await new Promise<GitRunResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let done = false;
    let timedOut = false;
    let killedForLimit = false;
    let spawnError: string | undefined;
    const finish = (exitCode: number | null): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (timedOut) {
        resolve({ ok: false, exitCode, stdout, stderr, error: `git 命令超时（${options.timeoutMs ?? GIT_TIMEOUT_MS}ms）` });
      } else if (killedForLimit) {
        resolve({ ok: false, exitCode, stdout, stderr, error: "git 输出超出上限" });
      } else if (spawnError !== undefined) {
        resolve({ ok: false, exitCode, stdout, stderr, error: `git 无法启动：${spawnError}` });
      } else if (exitCode === 0) {
        resolve({ ok: true, stdout, stderr });
      } else {
        resolve({ ok: false, exitCode, stdout, stderr });
      }
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", args, { cwd: projectRoot, env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      resolve({ ok: false, exitCode: null, stdout: "", stderr: "", error: `git 无法启动：${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs ?? GIT_TIMEOUT_MS);
    const append = (current: string, chunk: Buffer): string => {
      if (current.length >= GIT_OUTPUT_LIMIT) return current;
      const next = current + chunk.toString("utf8");
      if (next.length > GIT_OUTPUT_LIMIT) {
        killedForLimit = true;
        child.kill();
        return next.slice(0, GIT_OUTPUT_LIMIT);
      }
      return next;
    };
    child.stdout?.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.once("error", (error: Error) => { spawnError = error.message; finish(null); });
    child.once("close", (code: number | null) => finish(code));
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(options.input ?? "");
  });
}

/** 仓库本地身份缺省（只写 `.git/config`）：返回是否应用过缺省。 */
async function ensureIdentityDefaults(projectRoot: string): Promise<boolean> {
  let applied = false;
  const defaults: ReadonlyArray<readonly [string, string]> = [["user.name", "ANS"], ["user.email", "ans@local"]];
  for (const [key, value] of defaults) {
    const current = await runGit(projectRoot, ["config", "--local", "--get", key]);
    if (!current.ok || current.stdout.trim() === "") {
      const written = await runGit(projectRoot, ["config", "--local", key, value]);
      if (written.ok) applied = true;
    }
  }
  return applied;
}

async function objectFormatOf(projectRoot: string): Promise<"sha1" | "sha256"> {
  const result = await runGit(projectRoot, ["rev-parse", "--show-object-format"]);
  const value = result.ok ? result.stdout.trim() : "";
  return value === "sha256" ? "sha256" : "sha1";
}

async function revParseOid(projectRoot: string, rev: string): Promise<GitOid | undefined> {
  const result = await runGit(projectRoot, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`]);
  const hex = result.ok ? result.stdout.trim() : "";
  if (hex === "") return undefined;
  return { objectFormat: await objectFormatOf(projectRoot), hex };
}

async function currentBranchOf(projectRoot: string): Promise<string> {
  const symbolic = await runGit(projectRoot, ["symbolic-ref", "--short", "-q", "HEAD"]);
  const symbolicName = symbolic.ok ? symbolic.stdout.trim() : "";
  if (symbolicName !== "") return symbolicName;
  const abbreviated = await runGit(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const name = abbreviated.ok ? abbreviated.stdout.trim() : "";
  return name !== "" && name !== "HEAD" ? name : "(detached)";
}

interface PorcelainEntry {
  readonly status: string;
  readonly path: string;
  readonly origPath?: string;
}

/** `git status --porcelain=v1 -z` 解析（rename/copy 的第二路径字段一并消费）。 */
function parsePorcelainZ(raw: string): PorcelainEntry[] {
  const tokens = raw.split("\0");
  const entries: PorcelainEntry[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token === "") continue;
    const status = token.slice(0, 2);
    const entryPath = token.slice(3);
    if (status.startsWith("R") || status.startsWith("C")) {
      const origPath = tokens[index + 1] ?? "";
      index += 1;
      entries.push({ status, path: entryPath, origPath });
    } else {
      entries.push({ status, path: entryPath });
    }
  }
  return entries;
}

async function statusEntriesOf(projectRoot: string): Promise<PorcelainEntry[] | undefined> {
  const result = await runGit(projectRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=normal"]);
  if (!result.ok) return undefined;
  return parsePorcelainZ(result.stdout);
}

async function readGitignoreSha256(projectRoot: string): Promise<string | null> {
  try {
    const bytes = await fs.readFile(path.join(projectRoot, ".gitignore"));
    return hashSha256(bytes);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function isGitignoreTracked(projectRoot: string): Promise<boolean> {
  const result = await runGit(projectRoot, ["ls-files", "--error-unmatch", "--", ".gitignore"]);
  return result.ok && result.stdout.trim() !== "";
}

async function gitignoreWorktreeDirty(projectRoot: string): Promise<boolean> {
  const result = await runGit(projectRoot, ["status", "--porcelain=v1", "-z", "--", ".gitignore"]);
  return result.ok && result.stdout !== "";
}

/** 只读仓库事实（发布前置与端口的共同来源）。 */
async function inspectRepositoryFacts(projectRoot: string): Promise<
  { ok: true; facts: WorkflowGitRepositoryFacts } | WorkflowServiceFailure
> {
  const headOid = await revParseOid(projectRoot, "HEAD");
  if (headOid === undefined) {
    return portFailure("release-workflow-not-ready", "当前工作区没有提交（HEAD 不可解析），无法发布。", ["head-oid"]);
  }
  const entries = await statusEntriesOf(projectRoot);
  if (entries === undefined) {
    return portFailure("release-workflow-not-ready", "git status 读取失败（fail-closed）。");
  }
  const trackedChanges = entries.filter((entry) => !entry.status.startsWith("??") && !entry.status.startsWith("!!")).length;
  const untracked = entries.filter((entry) => entry.status.startsWith("??")).map((entry) => entry.path);
  const mainOid = await revParseOid(projectRoot, "refs/heads/main");
  const gitignoreSha256 = await readGitignoreSha256(projectRoot);
  const gitignoreTrackedDirty = (await isGitignoreTracked(projectRoot)) && (await gitignoreWorktreeDirty(projectRoot));
  return {
    ok: true,
    facts: {
      branch: await currentBranchOf(projectRoot),
      headOid,
      mainOid: mainOid ?? null,
      objectFormat: headOid.objectFormat,
      trackedChanges,
      untracked,
      gitignoreSha256,
      gitignoreTrackedDirty,
    },
  };
}

interface NameStatusEntry {
  readonly status: string;
  readonly path: string;
}

/** `git diff --name-status -z` 解析（rename/copy 取新路径）。 */
function parseNameStatusZ(raw: string): NameStatusEntry[] {
  const tokens = raw.split("\0");
  const entries: NameStatusEntry[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const status = tokens[index]!;
    if (status === "") continue;
    const first = tokens[index + 1] ?? "";
    if (status.startsWith("R") || status.startsWith("C")) {
      const newPath = tokens[index + 2] ?? "";
      index += 2;
      entries.push({ status: status.charAt(0), path: newPath });
    } else {
      index += 1;
      entries.push({ status: status.charAt(0), path: first });
    }
  }
  return entries;
}

/** main OID（unborn ⇒ 空树）↔ tip 的 files/diff stat/diffDigest（diffDigest = sha256(name-status + stat)）。 */
async function previewMergeReal(
  projectRoot: string,
  mainOid: GitOid | null,
  tipOid: GitOid,
): Promise<
  | { ok: true; files: ReleaseFileChange[]; fileCount: number; diffStat: string; diffDigest: string }
  | WorkflowServiceFailure
> {
  const base = mainOid !== null ? mainOid.hex : EMPTY_TREE_OID[tipOid.objectFormat];
  const nameStatus = await runGit(projectRoot, ["diff", "--name-status", "-z", base, tipOid.hex]);
  if (!nameStatus.ok) {
    return portFailure("release-merge-failed", `读取分支↔main 变更失败：${asMessage(nameStatus)}`);
  }
  const files: ReleaseFileChange[] = parseNameStatusZ(nameStatus.stdout)
    .filter((entry) => entry.path !== "")
    .map((entry) => ({ path: entry.path, status: entry.status }));
  const stat = await runGit(projectRoot, ["diff", "--stat", "--no-color", base, tipOid.hex]);
  if (!stat.ok) {
    return portFailure("release-merge-failed", `读取 diff stat 失败：${asMessage(stat)}`);
  }
  const diffStat = stat.stdout.trim();
  const diffDigest = hashSha256(`${nameStatus.stdout}\n${diffStat}`);
  return { ok: true, files, fileCount: files.length, diffStat, diffDigest };
}

// —— 项目级 Git 临界区（进程内；B3 桌面 = 单一主进程） ——
const projectGitSections = new Map<string, string>();

/**
 * 获取项目级 Git 临界区（发布合并与后续 shell commit 门禁共用同一把锁）。
 * 已占用 ⇒ 返回 `undefined`（调用方 fail-closed，不排队）；返回的函数幂等释放。
 */
export function acquireProjectGitCriticalSection(projectRoot: string, owner: string): (() => void) | undefined {
  const key = path.resolve(projectRoot);
  if (projectGitSections.has(key)) return undefined;
  projectGitSections.set(key, owner);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (projectGitSections.get(key) === owner) projectGitSections.delete(key);
  };
}

/** 测试/诊断用只读视图：该项目的临界区当前持有者。 */
export function projectGitCriticalSectionOwner(projectRoot: string): string | undefined {
  return projectGitSections.get(path.resolve(projectRoot));
}

/** 真实发布合并（`ReleaseGitPort.mergeMain`）：固定 argv；只本地；冲突 abort + 切回任务分支。 */
async function mergeMainReal(request: {
  projectRoot: string;
  workflowId: string;
  flowId: string;
  branch: string;
  baseOid: GitOid | null;
  tipOid: GitOid;
  mergeKind: ReleaseMergeKind;
}): Promise<
  | {
      ok: true;
      mergeKind: ReleaseMergeKind;
      baseOid: GitOid | null;
      tipOid: GitOid;
      mergeOid: GitOid;
      files: ReleaseFileChange[];
      diffDigest: string;
    }
  | WorkflowServiceFailure
> {
  const release = acquireProjectGitCriticalSection(request.projectRoot, `release-main:${request.workflowId}`);
  if (release === undefined) {
    return portFailure("release-main-busy", "项目级 Git 临界区被占用（并发合并/提交）；未合并。");
  }
  try {
    const factsResult = await inspectRepositoryFacts(request.projectRoot);
    if (!factsResult.ok) return factsResult;
    const facts = factsResult.facts;
    if (facts.branch !== request.branch) {
      return portFailure("release-branch-mismatch", `当前分支 ${facts.branch} != 任务分支 ${request.branch}；未合并。`);
    }
    if (facts.headOid.hex !== request.tipOid.hex) {
      return portFailure("release-merge-failed", `任务分支 tip 已漂移（${facts.headOid.hex} != ${request.tipOid.hex}）；未合并。`);
    }
    if (facts.trackedChanges > 0 || facts.untracked.length > 0) {
      return portFailure("release-workflow-not-ready", "工作区不 clean；未合并（不 stash/reset/clean）。");
    }
    if (request.mergeKind === "initial") {
      if (facts.mainOid !== null) {
        return portFailure("release-merge-failed", "main 已存在（initial 合并前提不再成立）；未合并。");
      }
    } else if (request.baseOid === null || facts.mainOid === null || facts.mainOid.hex !== request.baseOid.hex) {
      return portFailure("release-merge-failed", "main base OID 已漂移；未合并。");
    }
    const preview = await previewMergeReal(request.projectRoot, request.baseOid, request.tipOid);
    if (!preview.ok) return preview;
    if (request.mergeKind === "initial") {
      // main unborn ⇒ `git switch -c main <tipOid>`（mergeKind:"initial"；工作区停在 main）。
      const created = await runGit(request.projectRoot, ["switch", "-c", "main", request.tipOid.hex]);
      if (!created.ok) {
        // 并发创建 main：若 main 已存在且恰为 tip ⇒ 视为 initial 成功；其余 fail-closed。
        const mainNow = await revParseOid(request.projectRoot, "refs/heads/main");
        if (mainNow === undefined || mainNow.hex !== request.tipOid.hex) {
          return portFailure("release-merge-failed", `创建 main 失败：${asMessage(created)}`);
        }
        const switched = await runGit(request.projectRoot, ["switch", "main"]);
        if (!switched.ok) {
          return portFailure("release-main-busy", `main 已存在但切换失败：${asMessage(switched)}`);
        }
      }
      return {
        ok: true,
        mergeKind: "initial",
        baseOid: null,
        tipOid: request.tipOid,
        mergeOid: request.tipOid,
        files: preview.files,
        diffDigest: preview.diffDigest,
      };
    }
    // main 已存在 ⇒ 先切 main（被其他 worktree 占用/切换失败 ⇒ release-main-busy），再 `merge --no-ff`。
    const switched = await runGit(request.projectRoot, ["switch", "main"]);
    if (!switched.ok) {
      return portFailure("release-main-busy", `切换到 main 失败（可能被其他 worktree 占用）：${asMessage(switched)}`);
    }
    const merged = await runGit(request.projectRoot, [
      "merge",
      "--no-ff",
      "-m",
      `ANS release merge ${request.branch} (${request.workflowId})`,
      request.branch,
    ]);
    if (!merged.ok) {
      const conflict = /CONFLICT|Automatic merge failed/i.test(`${merged.stdout}\n${merged.stderr}`);
      // 冲突/失败：只 `merge --abort`（不 force/reset/clean）并切回任务分支。
      if (conflict) await runGit(request.projectRoot, ["merge", "--abort"]);
      const back = await runGit(request.projectRoot, ["switch", request.branch]);
      if (conflict) {
        return portFailure(
          "release-merge-conflict",
          `合并 main 冲突：已 merge --abort 并${back.ok ? "切回" : "尝试切回（失败）"}任务分支 ${request.branch}；不 force/reset。`,
        );
      }
      return portFailure(
        "release-merge-failed",
        `合并 main 失败：${asMessage(merged)}${back.ok ? "" : `（切回任务分支失败：${asMessage(back)}）`}`,
      );
    }
    const mergeOid = await revParseOid(request.projectRoot, "HEAD");
    if (mergeOid === undefined) {
      return portFailure("release-merge-failed", "合并成功但无法解析合并提交 OID（fail-closed）。");
    }
    return {
      ok: true,
      mergeKind: "merge",
      baseOid: request.baseOid,
      tipOid: request.tipOid,
      mergeOid,
      files: preview.files,
      diffDigest: preview.diffDigest,
    };
  } finally {
    release();
  }
}

/** 上溯查找父仓库（任何祖先目录含 `.git`；不自动嵌套初始化）。 */
async function findParentRepository(projectRoot: string): Promise<string | undefined> {
  let parent = path.dirname(path.resolve(projectRoot));
  for (let depth = 0; depth < 64; depth += 1) {
    try {
      const info = await fs.stat(path.join(parent, ".git"));
      if (info !== undefined) return parent;
    } catch {
      /* 无 .git ⇒ 继续上溯 */
    }
    const next = path.dirname(parent);
    if (next === parent) return undefined;
    parent = next;
  }
  return undefined;
}

async function ensureRepositoryReal(request: {
  projectRoot: string;
  allowInit: boolean;
}): Promise<{ ok: true; repository: BaselineGitRepositoryState } | WorkflowServiceFailure> {
  const root = request.projectRoot;
  let gitEntry: Awaited<ReturnType<typeof fs.lstat>> | undefined;
  try {
    gitEntry = await fs.lstat(path.join(root, ".git"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return portFailure("baseline-git-init-failed", `读取 .git 失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (gitEntry === undefined) {
    if (!request.allowInit) {
      return portFailure("b-repository-required", "路径 B 需要既有 Git 仓库（不自动 git init）；请人工初始化或改走路径 A。");
    }
    const parent = await findParentRepository(root);
    if (parent !== undefined) {
      return portFailure("baseline-parent-repository-detected", `项目根位于其他仓库工作树内（${parent}）；不自动嵌套初始化。`);
    }
    const initialized = await runGit(root, ["init", "-b", "main"]);
    if (!initialized.ok) {
      // 旧 git 不支持 `-b`：`git init` + `git symbolic-ref HEAD refs/heads/main`（G-9：初始分支钉死 main）。
      const plain = await runGit(root, ["init"]);
      if (!plain.ok) {
        return portFailure("baseline-git-init-failed", `git init 失败：${asMessage(initialized)}`);
      }
      const symref = await runGit(root, ["symbolic-ref", "HEAD", "refs/heads/main"]);
      if (!symref.ok) {
        return portFailure("baseline-git-init-failed", `设置初始分支 main 失败：${asMessage(symref)}`);
      }
    }
    const identityDefaultsApplied = await ensureIdentityDefaults(root);
    const objectFormat = await objectFormatOf(root);
    const mainOid = await revParseOid(root, "refs/heads/main");
    return {
      ok: true,
      repository: {
        state: "initialized",
        branch: await currentBranchOf(root),
        baseOid: null,
        mainUnborn: mainOid === undefined,
        initialBranch: "main",
        objectFormat,
        ...(identityDefaultsApplied ? { identityDefaultsApplied: true } : {}),
      },
    };
  }
  // 既有仓库（目录或 worktree `.git` 文件）：原样保留，只补仓库本地身份缺省。
  const identityDefaultsApplied = await ensureIdentityDefaults(root);
  const mainOid = await revParseOid(root, "refs/heads/main");
  const branch = await currentBranchOf(root);
  return {
    ok: true,
    repository: {
      state: "existing",
      branch,
      baseOid: mainOid ?? null,
      mainUnborn: mainOid === undefined,
      initialBranch: branch,
      objectFormat: await objectFormatOf(root),
      ...(identityDefaultsApplied ? { identityDefaultsApplied: true } : {}),
    },
  };
}

/**
 * `.gitignore` ans-managed 块 + 仅 `.gitignore` 的 baseline commit。
 * 被跟踪且有未提交修改 ⇒ `baseline-gitignore-dirty`（不覆盖用户改动）；提交只含 `.gitignore`。
 */
async function ensureGitignoreReal(request: { projectRoot: string }): Promise<
  { ok: true; changed: boolean; committed: boolean; sha256: string } | WorkflowServiceFailure
> {
  const root = request.projectRoot;
  const trackedBefore = await isGitignoreTracked(root);
  if (trackedBefore && (await gitignoreWorktreeDirty(root))) {
    return portFailure("baseline-gitignore-dirty", "`.gitignore` 已被跟踪且有未提交修改（不覆盖用户改动）；交运营/人处理。");
  }
  const ensured = await ensureProjectGitignore(root);
  if (!ensured.ok) return portFailure(ensured.code, ensured.message);
  await ensureIdentityDefaults(root);
  let committed = false;
  if (ensured.changed || !trackedBefore) {
    const added = await runGit(root, ["add", "--", ".gitignore"]);
    if (!added.ok) {
      return portFailure("baseline-gitignore-write-failed", `git add .gitignore 失败：${asMessage(added)}`);
    }
    const commit = await runGit(root, ["commit", "-m", "ANS baseline: ans-managed .gitignore", "--", ".gitignore"]);
    if (!commit.ok) {
      const stillDirty = await gitignoreWorktreeDirty(root);
      if (stillDirty) {
        return portFailure("baseline-gitignore-write-failed", `baseline commit 失败：${asMessage(commit)}`);
      }
      committed = false;
    } else {
      committed = true;
    }
  }
  return { ok: true, changed: ensured.changed, committed, sha256: ensured.sha256 };
}

async function inspectWorktreeReal(request: { projectRoot: string; branch?: string }): Promise<
  { ok: true; branch: string; trackedChanges: number; untracked: string[] } | WorkflowServiceFailure
> {
  const entries = await statusEntriesOf(request.projectRoot);
  if (entries === undefined) {
    return portFailure("baseline-git-init-failed", "git status 读取失败（fail-closed）。");
  }
  const trackedChanges = entries.filter((entry) => !entry.status.startsWith("??") && !entry.status.startsWith("!!")).length;
  const untracked = entries.filter((entry) => entry.status.startsWith("??")).map((entry) => entry.path);
  return { ok: true, branch: await currentBranchOf(request.projectRoot), trackedChanges, untracked };
}

/** 复用分支时尽力给出基点（main 与分支的 merge-base；无 main/无法解析 ⇒ null）。 */
async function approximateBaseOid(projectRoot: string, branch: string): Promise<GitOid | null> {
  const mainOid = await revParseOid(projectRoot, "refs/heads/main");
  if (mainOid === undefined) return null;
  const mergeBase = await runGit(projectRoot, ["merge-base", "refs/heads/main", `refs/heads/${branch}`]);
  const hex = mergeBase.ok ? mergeBase.stdout.trim() : "";
  return hex === "" ? null : { objectFormat: mainOid.objectFormat, hex };
}

async function prepareTaskBranchReal(request: {
  projectRoot: string;
  workflowId: string;
  base: "head" | "main";
  allowReuse: boolean;
}): Promise<
  { ok: true; branch: string; baseOid: GitOid | null; reused: boolean } | WorkflowServiceFailure
> {
  const root = request.projectRoot;
  const branch = taskBranchName(request.workflowId);
  const branchRef = `refs/heads/${branch}`;
  const exists = (await runGit(root, ["show-ref", "--verify", "--quiet", branchRef])).ok;
  if (exists) {
    if (!request.allowReuse) {
      return portFailure(
        "baseline-branch-exists",
        `任务分支 ${branch} 已存在且不属于当前 workflow（不删除/不强推）；请新 workflowId 或人工核对。`,
      );
    }
    const switched = await runGit(root, ["switch", branch]);
    if (!switched.ok) {
      const message = asMessage(switched);
      if (/local changes|would be overwritten/i.test(message)) {
        return portFailure("baseline-repository-dirty", `切换到任务分支失败（工作区有本地改动）：${message}`);
      }
      return portFailure("baseline-branch-exists", `复用任务分支失败：${message}`);
    }
    return { ok: true, branch, baseOid: await approximateBaseOid(root, branch), reused: true };
  }
  const baseRef = request.base === "main" ? "refs/heads/main" : "HEAD";
  const baseOid = await revParseOid(root, baseRef);
  const created = baseOid !== undefined
    ? await runGit(root, ["switch", "-c", branch, baseRef])
    : await runGit(root, ["switch", "-c", branch]);
  if (!created.ok) {
    const message = asMessage(created);
    if (/already exists/i.test(message)) {
      return portFailure("baseline-branch-exists", `任务分支 ${branch} 已存在：${message}`);
    }
    if (/local changes|would be overwritten/i.test(message)) {
      return portFailure("baseline-repository-dirty", `创建工作区任务分支失败（工作区有本地改动）：${message}`);
    }
    return portFailure("baseline-git-init-failed", `创建任务分支 ${branch} 失败：${message}`);
  }
  return { ok: true, branch, baseOid: baseOid ?? null, reused: false };
}

/**
 * 构造**真实** `ReleaseGitPort`（桌面 B3 注入 `prepareReleaseMerge`/`executeReleaseMerge`）：
 * 只本地操作（inspect/preview/mergeMain），**无 push/tag**。确认语义（客户本人）由调用方纯校验。
 */
export function createDesktopReleaseGitPort(): ReleaseGitPort {
  return {
    inspectRepository: async ({ projectRoot }) => inspectRepositoryFacts(projectRoot),
    previewMerge: async ({ projectRoot, mainOid, tipOid }) => previewMergeReal(projectRoot, mainOid, tipOid),
    mergeMain: async (request) => mergeMainReal(request),
  };
}

/**
 * 构造**真实** `BaselineGitPort`（桌面 B3 注入 `completeTeamPlanFixed`/`preparePathBStart`）：
 * A9 `git init -b main`（allowInit=true）；路径 B 无仓库 ⇒ `b-repository-required`（不自动 init）。
 */
export function createDesktopBaselineGitPort(): BaselineGitPort {
  return {
    ensureRepository: async (request) => ensureRepositoryReal(request),
    ensureGitignore: async (request) => ensureGitignoreReal(request),
    inspectWorktree: async (request) => inspectWorktreeReal(request),
    prepareTaskBranch: async (request) => prepareTaskBranchReal(request),
  };
}
