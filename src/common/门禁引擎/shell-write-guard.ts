// src/common/门禁引擎/shell-write-guard.ts
// 2026-10-29（方案 v2.1 §6.3/§6.4；客户 Q1 A；返工按独立验收 P6 收紧）：
// shell **写目标守卫**——确定性同步判定 + 注入 `checkWrite`（同一 resolveWrite，realpath/F4/scope 口径）。
//
// 返工要点（P6）：**不枚举已知 flag**。凡「写能力命令」：
//   · 目标可被**完整静态解析**且全部落在角色写区内 ⇒ pass（继续既有审批链）；
//   · 解析出目标但任一越界/命中禁写/逃逸 ⇒ deny（直接拒绝，不弹卡）；
//   · **无法静态解析出全部写目标**（未知/歧义选项、`-t/--target-directory` 等目标型选项、
//     `find -delete/-exec`、`xargs`、`rsync`、`tar` 解包、`install` 等）⇒
//     `opaque`（manualOnly：必须客户本人审批，「替我审批」不代批）。
//   · 解释器脚本/构建包脚本（node 脚本、npm run 等）同样 `opaque`。
// 该口径对新增程序/新 flag 天然 fail-closed：不认识 ⇒ 交客户本人，不自动放行。
//
// 2026-11-08（W3-G，设计 P1.3 §2.4.2/§2.4.3）：裸 Git 从「一律硬拒」收窄为——
//   `matchReadonlyGit` 命中**且**入口不是 `start_background_task` ⇒ pass；其余 Git 维持硬拒
//   （`shell-write-hard-deny`）。本守卫与分类器**共用同一 matcher 函数引用**（防「只改分类器、
//   写守卫仍拒」的经典陷阱）。
//   2026-11-10（B4/v5）：同一原则延伸至任务级 Git 写——`matchTaskGit` 命中（需应用注入
//   `taskGitScope`）且前台 ⇒ pass（形状级）；staged ⊆ writeSet 与提交由 `task-git-gate.ts::
//   runTaskGitCommit` 在同一项目级临界区内复核。无 scope 的 add/commit 仍硬拒。
//   ★ 硬地板依赖：**接 (a) 的装配路径（项目三层链 / 内置角色审批档）必须注入本守卫**——因为
//     classifier 的 `deny` 在 advisory/operatorOnly+approveDeny 模式下会交 (a) 审批，不能当硬地板；
//     只读档不接 (a)、classifier `c=deny` 即终结，不依赖本守卫（R5/AC-30）。
//   ★ 后台入口不享受只读/任务级 Git 放行（AC-22）；`entry` 缺省按前台处理（既有调用方兼容）。

import type { BoundarySection1 } from "../../model/boundary.ts";
import type { TaskScope } from "../../model/decision.ts";
import type { DocFreezeLookupState, StableWritePermit } from "../../model/version-change.ts";
import path from "node:path";
import { inlineCodeOf, isOpaqueShellExecution, isShortInlineCode, matchReadonlyGit, matchRoutineShellCommand, matchTaskGit, type TaskGitScope } from "./classify-shell.ts";
import {
  isVersionedDocPath,
  protectedVersionedPathsSync,
  stableWritePathOf,
  versionedDocExists,
  versionedDocOverwriteDecision,
  type VersionedDocOperation,
} from "./versioned-doc-guard.ts";
import { formatMechanicalRejection, makeMechanicalRejection, type MechanicalRejection } from "../编排/mechanical-rejection.ts";

export interface ShellWriteGuardInput {
  argv: readonly string[];
  cwd: string;
  projectRoot: string;
  skillRoot: string;
  boundary: BoundarySection1;
  /** 任务级写集（派发时存在则收窄；缺省 = Section 1）。 */
  scope?: TaskScope;
  conditions?: readonly string[];
  /** 禁写前缀（`.ans/`、`角色卡/` 等；命中即 deny）。 */
  forbiddenPrefixes: readonly string[];
  /**
   * 注入：与 F4/写区**同一实现**（resolveWrite）。`relPath` 为项目相对 POSIX 路径；
   * realResolve/boundary/scope/skillRoot 封在本闭包内——不得另写第二份路径判定。
   */
  checkWrite: (relPath: string) => { allowed: boolean; reason?: string };
  /**
   * 注入：C2b 生产唯一同步冻结查询 `versionedDocFreezeState(projectRoot, rel, exists)`（编排 S3 注入，
   * 不自建第二份 Map）。缺省 ⇒ 版本化既有目标按旧口径「存在即拒」保护；提供后 frozen ⇒ 拒绝、
   * draft ⇒ 允许（仍先过 `checkWrite`）、unknown ⇒ fail-closed。
   */
  freezeStateOf?: (relPath: string) => DocFreezeLookupState;
  /**
   * 预留（C2c 契约形状）：shell 无法预知写入内容 hash，stable 目标**一律拒绝**（C7）——
   * 该查询不用于放行，只允许调度层按同一形状注入。
   */
  stablePermitOf?: (relPath: string) => StableWritePermit | undefined;
  /**
   * 调用入口（2026-11-08，W3-G / AC-22）：`run_shell` | `start_background_task`。
   * 只读 Git 放行**仅前台**；后台入口一律维持 Git 硬拒。可选：缺省按前台处理
   * （既有调用方不传 `entry` 仍可编译/行为不变；装配方应在 run_shell 与
   * start_background_task 两条路径分别传入真实入口）。
   */
  entry?: "run_shell" | "start_background_task";
  /**
   * v5（2026-11-10，B4；T3 方案 §6.2/§6.3）：固定路径**任务级 Git 写事实**（应用注入，
   * 模型不可自报；A 路径 = 团队计划 writesets，B 路径 = B2 派生写集）。
   * 命中 `matchTaskGit`（`git add <literal ⊆ writeSet>` / `git commit -m`）且入口非后台 ⇒ pass
   * （形状级；staged ⊆ writeSet 与提交仍由 `task-git-gate.ts::runTaskGitCommit` 在临界区内复核）。
   * 缺省/非法 ⇒ 裸 Git 写维持硬拒（v4 行为不变）。
   */
  taskGitScope?: TaskGitScope;
}

/** stable 文件路径出现在命令文本（opaque/ambiguous/脚本审查前）——写能力命令提及即拒（C7）。 */
const STABLE_PATH_MENTION_PATTERN = /(docs[\\/]workflow\.md|角色卡[\\/][^\\/\s"'`]+[\\/](?:role-card\.md|boundary\.yaml))/i;

function stablePathMention(text: string): string | undefined {
  return STABLE_PATH_MENTION_PATTERN.exec(text)?.[1];
}

function stableTargetDenial(rel: string): ShellWriteGuardDecision {
  const info = stableWritePathOf(rel);
  const owner = info?.kind === "workflow" ? "convener" : info?.kind === undefined ? "app" : "nominator";
  const rejection = makeMechanicalRejection(
    "stable-write-permit-missing",
    [`stable 文件（workflow/角色卡/边界）写入必须走 stable-write 确认卡或 appointment-write：${rel}（shell 无法提供内容 hash）`],
    { owner, action: "改走 stable-write/appointment-write 确认通道；shell 不得写 stable 文件。", retryable: true, docs: [rel] },
  );
  return { kind: "deny", reason: formatMechanicalRejection(rejection), targets: [rel], code: rejection.code, rejection };
}

function stableMentionDenial(mentioned: string): ShellWriteGuardDecision {
  const rejection = makeMechanicalRejection(
    "stable-write-permit-missing",
    [`命令触及 stable 文件（workflow/角色卡/边界）：${mentioned}；opaque/无法解析的命令不得写 stable 文件（无内容 hash/无许可）`],
    { owner: "app", action: "改为精确的 stable-write/appointment-write 确认通道；不要用脚本/cp/tee 绕过。", retryable: true, docs: [mentioned] },
  );
  return { kind: "deny", reason: formatMechanicalRejection(rejection), targets: [mentioned], code: rejection.code, rejection };
}

/** 守卫三态（2026-10-29 R2 对齐）：pass / deny / script（进入脚本内容审查）。 */
export type ShellWriteGuardDecision =
  | { kind: "pass" }
  | { kind: "deny"; reason: string; targets: string[]; code?: string; rejection?: MechanicalRejection }
  | { kind: "script"; reason: string };

const EXE_SUFFIX = /\.(exe|cmd|bat|ps1|com)$/i;

function baseName(raw: string): string {
  const value = raw.trim().replace(/^["']|["']$/g, "");
  const segments = value.split(/[\\/]/).filter((segment) => segment !== "");
  const base = segments.length > 0 ? segments[segments.length - 1]! : value;
  return base.replace(EXE_SUFFIX, "").toLowerCase();
}

/** 项目相对化：cwd 相对项目根 → 目标相对 cwd；拒绝逃出项目根/绝对外部路径。 */
function resolveTarget(projectRoot: string, cwd: string, target: string): { rel: string } | { error: string } {
  const raw = target.trim().replace(/^["']|["']$/g, "").replace(/\\/g, "/");
  if (raw === "") return { error: "空路径" };
  const isAbsolute = raw.startsWith("/") || /^[a-zA-Z]:\//.test(raw);
  const projectAbs = path.resolve(projectRoot);
  let cwdAbs = path.isAbsolute(cwd) ? path.resolve(cwd) : path.resolve(projectAbs, cwd);
  // 防御：执行 cwd 由适配器钉在项目根；若调用方传入的项目外/不可解析 cwd（旧测试/桩），
  // 以项目根为基准（绝不把目标按外部目录解释后放行）。
  const cwdRel = path.relative(projectAbs, cwdAbs);
  if (cwdRel.startsWith("..") || path.isAbsolute(cwdRel)) cwdAbs = projectAbs;
  const abs = isAbsolute ? path.resolve(raw) : path.resolve(cwdAbs, raw);
  const rel = path.relative(projectAbs, abs);
  if (rel === "") return { rel: "." };
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { error: `目标在项目根之外：${target}` };
  }
  return { rel: rel.replace(/\\/g, "/") };
}

/** 拆选项：`--` 终止；`-abc` 按布尔短选项逐字符（任一未知 ⇒ ambiguous）。 */
function splitOptions(
  args: readonly string[],
  allowedBooleanShort: ReadonlySet<string>,
  allowedBooleanLong: ReadonlySet<string>,
): { positionals: string[]; ambiguousOption?: string } {
  const positionals: string[] = [];
  let terminated = false;
  for (const raw of args) {
    if (terminated) {
      positionals.push(raw);
      continue;
    }
    if (raw === "--") {
      terminated = true;
      continue;
    }
    if (raw.startsWith("--")) {
      const name = raw.split("=")[0]!;
      if (raw.includes("=")) return { positionals, ambiguousOption: raw };
      if (!allowedBooleanLong.has(name)) return { positionals, ambiguousOption: raw };
      continue;
    }
    if (raw.startsWith("-") && raw !== "-") {
      for (const flag of raw.slice(1)) {
        if (!allowedBooleanShort.has(flag)) return { positionals, ambiguousOption: raw };
      }
      continue;
    }
    positionals.push(raw);
  }
  return { positionals };
}

type ExplicitParse =
  | { kind: "targets"; targets: string[] }
  /** 目标可静态判定（若有）但命令本身仍会写无法穷举的路径 ⇒ 交判断 agent（内容/上下文审查）。
   *  `targets` = 写目标（按角色写区判定）；`paths` = 仅需项目根判定（如 find 起始读路径）。 */
  | { kind: "review"; reason: string; targets?: string[]; paths?: string[] }
  | { kind: "none" }
  | { kind: "ambiguous"; reason: string };

/** 解析 `-t DIR` / `--target-directory DIR` / `--target-directory=DIR`（cp/mv/ln/install）。 */
function splitTargetDirectory(
  args: readonly string[],
  allowedBooleanShort: ReadonlySet<string>,
  allowedBooleanLong: ReadonlySet<string>,
): { positionals: string[]; targetDir?: string; ambiguousOption?: string } {
  const positionals: string[] = [];
  let targetDir: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const raw = args[i]!;
    if (raw === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (raw === "-t" || raw === "--target-directory") {
      targetDir = args[i + 1];
      i += 1;
      continue;
    }
    if (raw.startsWith("--target-directory=")) {
      targetDir = raw.slice("--target-directory=".length);
      continue;
    }
    if (raw.startsWith("--")) {
      if (!allowedBooleanLong.has(raw)) return { positionals, targetDir, ambiguousOption: raw };
      continue;
    }
    if (raw.startsWith("-") && raw !== "-") {
      if (raw.includes("t")) return { positionals, targetDir, ambiguousOption: raw };
      for (const flag of raw.slice(1)) {
        if (!allowedBooleanShort.has(flag)) return { positionals, targetDir, ambiguousOption: raw };
      }
      continue;
    }
    positionals.push(raw);
  }
  return { positionals, ...(targetDir !== undefined ? { targetDir } : {}) };
}

const CP_BOOL_SHORT = new Set("afinpRrulsLPHdTv".split(""));
const CP_BOOL_LONG = new Set([
  "--archive", "--force", "--interactive", "--no-clobber", "--no-target-directory",
  "--preserve", "--recursive", "--update", "--verbose", "--link", "--symbolic-link",
  "--dereference", "--parents", "--remove-destination", "--strip-trailing-slashes",
]);
const MV_LN_BOOL_SHORT = new Set("finuvsLPHdT".split(""));
const MV_LN_BOOL_LONG = new Set([
  "--force", "--interactive", "--no-clobber", "--update", "--verbose", "--symbolic-link",
  "--no-dereference", "--no-target-directory", "--strip-trailing-slashes",
]);
const RM_BOOL_SHORT = new Set("firRdv".split(""));
const RM_BOOL_LONG = new Set(["--force", "--interactive", "--recursive", "--verbose", "--dir", "--preserve-root", "--no-preserve-root"]);
const TOUCH_BOOL_SHORT = new Set("amcfh".split(""));
const TOUCH_BOOL_LONG = new Set(["--no-create", "--no-dereference"]);
const MKDIR_BOOL_SHORT = new Set("pv".split(""));
const MKDIR_BOOL_LONG = new Set(["--parents", "--verbose"]);
const TEE_BOOL_SHORT = new Set("ai".split(""));
const TEE_BOOL_LONG = new Set(["--append", "--ignore-interrupts"]);

/**
 * 明确可解析的写目标类命令（plain 形态）。任何未知/目标型选项 ⇒ ambiguous（→ opaque）。
 * `-t/--target-directory` 有意列为 ambiguous（客户验收 P6 的已知绕过形态）。
 */
function parseExplicitWriteTargets(program: string, args: string[]): ExplicitParse {
  switch (program) {
    case "cp":
    case "copy": {
      const parsed = splitTargetDirectory(args, CP_BOOL_SHORT, CP_BOOL_LONG);
      if (parsed.ambiguousOption !== undefined) {
        return { kind: "ambiguous", reason: `cp 选项 ${parsed.ambiguousOption} 可能改变写入目标，无法静态确认` };
      }
      if (parsed.targetDir !== undefined) return { kind: "targets", targets: [parsed.targetDir] };
      if (parsed.positionals.length < 2) return { kind: "none" };
      return { kind: "targets", targets: [parsed.positionals[parsed.positionals.length - 1]!] };
    }
    case "mv":
    case "move":
    case "ren":
    case "rename": {
      const parsed = splitTargetDirectory(args, MV_LN_BOOL_SHORT, MV_LN_BOOL_LONG);
      if (parsed.ambiguousOption !== undefined) {
        return { kind: "ambiguous", reason: `${program} 选项 ${parsed.ambiguousOption} 可能改变写入目标，无法静态确认` };
      }
      if (parsed.targetDir !== undefined) {
        // mv -t DIR 会移动**并删除源**：源与目标全部校验（源在项目外/写区外同样 deny）。
        return { kind: "targets", targets: [parsed.targetDir, ...parsed.positionals] };
      }
      if (parsed.positionals.length === 0) return { kind: "none" };
      return { kind: "targets", targets: parsed.positionals };
    }
    case "ln":
    case "mklink": {
      const parsed = splitTargetDirectory(args, MV_LN_BOOL_SHORT, MV_LN_BOOL_LONG);
      if (parsed.ambiguousOption !== undefined) {
        return { kind: "ambiguous", reason: `ln 选项 ${parsed.ambiguousOption} 可能改变写入目标，无法静态确认` };
      }
      if (parsed.targetDir !== undefined) return { kind: "targets", targets: [parsed.targetDir] };
      if (parsed.positionals.length === 0) return { kind: "none" };
      return { kind: "targets", targets: [parsed.positionals[parsed.positionals.length - 1]!] };
    }
    case "install": {
      const parsed = splitTargetDirectory(args, new Set("Ddpvm".split("")), new Set(["--directory", "--preserve-timestamps", "--verbose"]));
      if (parsed.ambiguousOption !== undefined) {
        return { kind: "ambiguous", reason: `install 选项 ${parsed.ambiguousOption} 无法静态确认写目标` };
      }
      if (parsed.targetDir !== undefined) return { kind: "targets", targets: [parsed.targetDir] };
      if (args.some((arg) => arg === "-d" || arg === "--directory")) {
        return parsed.positionals.length > 0 ? { kind: "targets", targets: parsed.positionals } : { kind: "none" };
      }
      if (parsed.positionals.length < 2) return { kind: "none" };
      return { kind: "targets", targets: [parsed.positionals[parsed.positionals.length - 1]!] };
    }
    case "rsync": {
      // 目标为最后一个位置参数（源只读）：目标可静态判定 ⇒ 越界即 deny；其余（同步删除/过滤等）交审查。
      const positionals = args.filter((arg) => !arg.startsWith("-"));
      if (positionals.length === 0) return { kind: "none" };
      return {
        kind: "review",
        reason: "rsync 同步/删除会写目标目录，无法静态穷举全部写目标",
        targets: [positionals[positionals.length - 1]!],
      };
    }
    case "tar": {
      const dirIndex = args.findIndex((arg) => arg === "-C" || arg === "--directory");
      const eq = args.find((arg) => arg.startsWith("--directory="));
      const targetDir = dirIndex >= 0 ? args[dirIndex + 1] : eq !== undefined ? eq.slice("--directory=".length) : undefined;
      const listOnly = args.some(
        (arg) =>
          arg === "--list" ||
          arg.startsWith("--list=") ||
          (/^-[a-zA-Z]+$/.test(arg) && arg.includes("t") && !/[xcur]/.test(arg)),
      );
      if (listOnly) return { kind: "none" };
      return {
        kind: "review",
        reason: "tar 解包/打包会写目录（含 -C 指定的目录），无法静态穷举全部写目标",
        ...(targetDir !== undefined ? { targets: [targetDir] } : {}),
      };
    }
    case "curl":
    case "wget": {
      // 输出文件/目录可静态判定 ⇒ 交边界判定；-O/--remote-name 目标由 URL 决定 ⇒ opaque。
      const idx = args.findIndex((arg) => arg === "-o" || arg === "--output" || arg === "-P" || arg === "--directory-prefix");
      const eq = args.find((arg) => arg.startsWith("--output=") || arg.startsWith("--output-document=") || arg.startsWith("--directory-prefix="));
      const target = idx >= 0 ? args[idx + 1] : eq !== undefined ? eq.slice(eq.indexOf("=") + 1) : undefined;
      if (target !== undefined) {
        return { kind: "review", reason: `${program} 输出文件可静态判定，但下载内容与行为需审查`, targets: [target] };
      }
      return { kind: "none" };
    }
    case "sort": {
      const idx = args.findIndex((arg) => arg === "-o" || arg === "--output");
      const eq = args.find((arg) => arg.startsWith("--output="));
      const target = idx >= 0 ? args[idx + 1] : eq !== undefined ? eq.slice("--output=".length) : undefined;
      return target !== undefined ? { kind: "targets", targets: [target] } : { kind: "none" };
    }
    case "dd": {
      const of = args.find((arg) => arg.startsWith("of="));
      return of !== undefined
        ? { kind: "review", reason: "dd 可直接写块设备/任意文件（含 seek 等），需审查", targets: [of.slice(3)] }
        : { kind: "none" };
    }
    case "truncate":
    case "shred": {
      const parsed = splitOptions(args, new Set("csvzun".split("")), new Set(["--no-create", "--remove", "--zero"]));
      if (parsed.ambiguousOption !== undefined) {
        return { kind: "ambiguous", reason: `${program} 选项 ${parsed.ambiguousOption} 带值/未知，无法静态确认目标` };
      }
      return parsed.positionals.length > 0 ? { kind: "targets", targets: parsed.positionals } : { kind: "none" };
    }
    case "rm":
    case "rmdir":
    case "del":
    case "erase": {
      const parsed = splitOptions(args, RM_BOOL_SHORT, RM_BOOL_LONG);
      if (parsed.ambiguousOption !== undefined) {
        return { kind: "ambiguous", reason: `${program} 选项 ${parsed.ambiguousOption} 无法静态确认（删除类命令）` };
      }
      if (parsed.positionals.length === 0) return { kind: "none" };
      return { kind: "targets", targets: parsed.positionals };
    }
    case "touch": {
      const parsed = splitOptions(args, TOUCH_BOOL_SHORT, TOUCH_BOOL_LONG);
      if (parsed.ambiguousOption !== undefined) {
        return { kind: "ambiguous", reason: `touch 选项 ${parsed.ambiguousOption} 带值/未知，无法静态确认目标` };
      }
      if (parsed.positionals.length === 0) return { kind: "none" };
      return { kind: "targets", targets: parsed.positionals };
    }
    case "mkdir":
    case "md": {
      const parsed = splitOptions(args, MKDIR_BOOL_SHORT, MKDIR_BOOL_LONG);
      if (parsed.ambiguousOption !== undefined) {
        return { kind: "ambiguous", reason: `mkdir 选项 ${parsed.ambiguousOption} 带值/未知，无法静态确认目标` };
      }
      if (parsed.positionals.length === 0) return { kind: "none" };
      return { kind: "targets", targets: parsed.positionals };
    }
    case "tee": {
      const parsed = splitOptions(args, TEE_BOOL_SHORT, TEE_BOOL_LONG);
      if (parsed.ambiguousOption !== undefined) {
        return { kind: "ambiguous", reason: `tee 选项 ${parsed.ambiguousOption} 未知，无法静态确认目标` };
      }
      if (parsed.positionals.length === 0) return { kind: "none" };
      return { kind: "targets", targets: parsed.positionals };
    }
    case "chmod":
    case "chown":
    case "chgrp":
    case "attrib":
    case "icacls": {
      // 选项面复杂（模式/属主/递归/引用）：含任何未知选项即交客户；plain 形态：第一个位置参数是模式/属主。
      const knownShort = new Set("Rvhcf".split(""));
      const knownLong = new Set(["--recursive", "--verbose", "--silent", "--quiet", "--changes", "--reference", "--dereference"]);
      const parsed = splitOptions(args, knownShort, knownLong);
      if (parsed.ambiguousOption !== undefined) {
        return { kind: "ambiguous", reason: `${program} 选项 ${parsed.ambiguousOption} 带值/未知，无法静态确认目标` };
      }
      if (parsed.positionals.length < 2) return { kind: "none" };
      return { kind: "targets", targets: parsed.positionals.slice(1) };
    }
    case "sed": {
      const inPlace = args.some((arg) => arg === "-i" || arg.startsWith("-i") || arg === "--in-place" || arg.startsWith("--in-place="));
      if (!inPlace) return { kind: "none" };
      const parsed = splitOptions(args, new Set("inEr".split("")), new Set(["--quiet", "--silent", "--regexp-extended"]));
      if (parsed.ambiguousOption !== undefined) {
        return { kind: "ambiguous", reason: `sed -i 选项 ${parsed.ambiguousOption} 无法静态确认目标` };
      }
      // 第一个位置参数是脚本表达式，其余是文件。
      if (parsed.positionals.length < 2) return { kind: "none" };
      return { kind: "targets", targets: parsed.positionals.slice(1) };
    }
    case "perl": {
      const inPlace = args.some((arg) => arg === "-i" || arg.startsWith("-i"));
      if (!inPlace) return { kind: "none" };
      const parsed = splitOptions(args, new Set("inplw".split("")), new Set());
      if (parsed.ambiguousOption !== undefined) {
        return { kind: "ambiguous", reason: `perl -i 选项 ${parsed.ambiguousOption} 无法静态确认目标` };
      }
      if (parsed.positionals.length < 2) return { kind: "none" };
      return { kind: "targets", targets: parsed.positionals.slice(1) };
    }
    case "find": {
      // 起始路径（表达式前）可静态判定；含 -delete/-exec/-fprint 时写目标不可完全静态解析 ⇒ opaque。
      const starts: string[] = [];
      let i = 0;
      for (; i < args.length; i += 1) {
        const arg = args[i]!;
        if (arg === "-" || arg.startsWith("-") || arg === "(" || arg === "!" || arg === ",") break;
        starts.push(arg);
      }
      const destructive = args.slice(i).some((arg) =>
        arg === "-delete" || arg === "-exec" || arg === "-execdir" || arg === "-ok" || arg === "-okdir" ||
        arg === "-fprint" || arg === "-fprint0" || arg === "-fprintf" || arg === "-fls",
      );
      if (destructive) {
        return {
          kind: "review",
          reason: "find 带 -delete/-exec/-fprint 等会写文件系统，写目标无法完全静态解析",
          ...(starts.length > 0 ? { paths: starts } : {}),
        };
      }
      return { kind: "none" };
    }
    default:
      return { kind: "none" };
  }
}

/** 写能力但无法（或未）完整静态解析目标的命令 → opaque（manualOnly）。 */
function opaqueWriteCapableReason(program: string, args: string[]): string | undefined {
  const hasOutputFlag = (flags: readonly string[]): boolean =>
    args.some((arg) => flags.some((flag) => arg === flag || arg.startsWith(`${flag}=`)));
  switch (program) {
    case "install":
      return "install 可写任意目标目录（含 -t/--target-directory），无法静态确认全部写目标";
    case "rsync":
      return "rsync 可写任意目标目录（多源/多目标/删除选项），无法静态确认全部写目标";
    case "xargs":
      return "xargs 会执行任意子命令，无法静态确认写目标";
    case "tar": {
      // 仅 list 形态是纯读（`-t`/`--list`，含 `-tf` 等短选项组合）；其余（x/c/u/r 等）会写文件系统。
      const listOnly = args.some(
        (arg) =>
          arg === "--list" ||
          arg.startsWith("--list=") ||
          (/^-[a-zA-Z]+$/.test(arg) && arg.includes("t") && !/[xcur]/.test(arg)),
      );
      return listOnly ? undefined : "tar 解包/打包可写任意目录（含 -C），无法静态确认写目标";
    }
    case "unzip":
    case "zip":
    case "7z":
    case "cpio":
    case "robocopy":
      return `${program} 会写文件系统（可指定任意目标目录），无法静态确认全部写目标`;
    case "dd":
    case "patch":
    case "shred":
    case "truncate":
    case "split":
    case "csplit":
      return `${program} 可写任意文件（目标由内部语法/选项决定），无法静态确认`;
    case "sort":
      return hasOutputFlag(["-o", "--output"]) ? "sort -o 会写任意输出文件" : undefined;
    case "curl":
    case "wget":
      return hasOutputFlag(["-o", "-O", "--output", "--output-document", "-P", "--directory-prefix"])
        ? `${program} 带输出选项会写任意文件`
        : undefined;
    case "find": {
      const destructive = args.some((arg) =>
        arg === "-delete" || arg === "-exec" || arg === "-execdir" || arg === "-ok" || arg === "-okdir" ||
        arg === "-fprint" || arg === "-fprint0" || arg === "-fprintf" || arg === "-fls",
      );
      return destructive ? "find 带 -delete/-exec/-fprint 等会写文件系统，无法静态确认目标" : undefined;
    }
    // git 不在此列：2026-11-08（W3-G）起由上方 `program === "git"` 分支统一终结
    // （只读白名单 pass / 其余硬拒），不会落到本函数。
    default:
      return undefined;
  }
}

function underForbiddenPrefix(rel: string, prefix: string): boolean {
  const r = rel.toLowerCase();
  const p = prefix.toLowerCase();
  return prefix.endsWith("/") ? r === p.slice(0, -1) || r.startsWith(p) : r === p;
}

/**
 * 判定一次 shell 调用的写目标安全性（确定性、同步）。
 * 顺序：显式写目标（deny 优先）→ 写能力但无法解析（opaque）→ 解释器/构建 opaque → pass。
 */
export function evaluateShellWriteTargets(input: ShellWriteGuardInput): ShellWriteGuardDecision {
  const decision = evaluateShellWriteTargetsUnsafe(input);
  if (decision.kind !== "deny") return decision;
  if (decision.rejection !== undefined) return decision;
  const code = decision.reason.includes("版本化文档") ? "versioned-doc-overwrite"
    : decision.reason.includes("硬拒") ? "shell-write-hard-deny"
      : "shell-write-outside";
  const rejection = makeMechanicalRejection(code, [decision.reason], { docs: decision.targets.slice(0, 5) });
  return { ...decision, code, rejection, reason: formatMechanicalRejection(rejection) };
}

function evaluateShellWriteTargetsUnsafe(input: ShellWriteGuardInput): ShellWriteGuardDecision {
  const argv = Array.isArray(input.argv) ? input.argv.map((arg) => String(arg)) : [];
  const program = argv.length > 0 ? baseName(argv[0]!) : "";
  const args = argv.slice(1);
  // 2026-10-29（v2.10）：脚本/argv 全通道——命令文本触及受管版本化路径时，写能力命令一律 deny。
  const protectedPathMention = (): string | undefined => {
    const text = argv.join(" ");
    return protectedVersionedPathsSync(input.projectRoot).find((rel) => text.includes(rel));
  };
  // 2026-11-04（C2b/C7）：stable 文件（workflow/role-card/boundary）不提供内容 hash ⇒ shell 写入一律拒绝。
  const stableMention = (): string | undefined => stablePathMention(argv.join(" "));
  const shellOperation: VersionedDocOperation =
    program === "rm" || program === "rmdir" || program === "del" || program === "erase" || program === "shred" || program === "truncate"
      ? "delete"
      : program === "mv" || program === "move" || program === "ren" || program === "rename"
        ? "rename"
        : "write";
  /**
   * C2b 全调用点：stable 目标一律拒绝（C7）；版本化目标统一走唯一同步判定
   * `versionedDocOverwriteDecision`（frozen 由注入的 `freezeStateOf` 提供；缺省保留旧「存在即拒」）。
   */
  const guardResolvedTarget = (rel: string): ShellWriteGuardDecision | undefined => {
    if (stableWritePathOf(rel) !== undefined) return stableTargetDenial(rel);
    if (!isVersionedDocPath(rel)) return undefined;
    const exists = versionedDocExists(input.projectRoot, rel);
    let frozen: DocFreezeLookupState | undefined;
    if (input.freezeStateOf !== undefined) {
      try {
        frozen = input.freezeStateOf(rel);
      } catch {
        frozen = "unknown"; // 查询失败 ⇒ fail-closed（拒绝版本化路径变更）
      }
    }
    const guarded = versionedDocOverwriteDecision({
      relPath: rel,
      exists,
      operation: shellOperation,
      ...(frozen !== undefined ? { frozen } : {}),
    });
    if (guarded.allowed) return undefined;
    return { kind: "deny", reason: guarded.reason, targets: [rel], code: guarded.code, rejection: guarded.rejection };
  };

  if (program !== "") {
    if (program === "git") {
      // 2026-11-08（W3-G）/ 2026-11-10（v5）：只读 Git 精确白名单命中（与分类器同一函数引用）且**非后台入口**
      // ⇒ pass；v5 追加固定路径任务级写（`matchTaskGit`，同样与分类器同一函数引用）——
      // `git add <literal ⊆ writeSet>` / `git commit -m` 形状级放行（staged 内容与临界区由
      // `task-git-gate.ts::runTaskGitCommit` 复核）。其余 Git（push/merge/reset/…）一律硬拒。
      // 接 (a) 的装配路径必须注入本守卫（classifier deny 在 advisory/operatorOnly 下可交 (a)，不是硬地板）；
      // 只读档不接 (a)、c=deny 即终结（R5）。
      const readonlyGit = matchReadonlyGit(argv);
      if (readonlyGit !== undefined && input.entry !== "start_background_task") return { kind: "pass" };
      const taskGit = matchTaskGit(argv, input.taskGitScope);
      if (taskGit !== undefined && input.entry !== "start_background_task") return { kind: "pass" };
      const taskGitShaped = taskGit !== undefined || (argv[1] === "add" || argv[1] === "commit");
      return { kind: "deny", code: "shell-write-hard-deny", targets: [],
        reason: readonlyGit !== undefined || taskGit !== undefined
          ? "只读/任务级 Git 仅允许经 run_shell 前台执行；start_background_task 入口一律硬拒，请改用前台命令（legacy 受控入口 git_query 不承接 shell 写）。"
          : taskGitShaped
            ? "任务级 Git 写被硬拒：需应用注入有效 taskGitScope（taskId/workflowId/branch/writeSet）且路径 ⊆ 写集；裸 Git 写不得绕过任务写事实（fail-closed；legacy git_query 不承接 fixed shell 写）。"
            : "裸 Git 硬拒：只读精确白名单与任务级 add/commit 之外一律拒绝（push/merge/reset/checkout/update-ref 等）；legacy git_query / git_candidate / git_publish 工具 fixed 不注入，shell 批准不能覆盖 Git 角色拒绝。" };
    }
    // 2026-10-29（v2.3 §6.4 / 复验 F1）：re-shell/内联求值仍是硬拒（不进入脚本审查）。
    const inlineEvalPrograms = new Set(["eval", "exec", "source", "command", "."]);
    if (inlineEvalPrograms.has(program)) {
      return { kind: "deny", reason: `内联求值/命令包装（${program}）硬拒：无法按写区校验`, targets: [] };
    }
    const awkPrograms = new Set(["awk", "gawk", "mawk", "nawk"]);
    if (awkPrograms.has(program)) {
      return { kind: "deny", reason: "awk 可执行 system()/重定向，硬拒", targets: [] };
    }
    // 2026-10-29（复验 F6）：短内联代码（bounds 内）⇒ script（approvalContext 携带代码原文）；
    // 长内联/超界 ⇒ deny（与 preblock inline-too-large 同口径）。
    const interpreterInlineFlags: Record<string, readonly string[]> = {
      node: ["-e", "--eval", "-p", "--print"],
      python: ["-c"],
      python2: ["-c"],
      python3: ["-c"],
      perl: ["-e", "-E"],
      ruby: ["-e"],
      php: ["-r"],
      lua: ["-e"],
      rscript: ["-e"],
      bun: ["-e", "--eval"],
      "ts-node": ["-e", "--eval"],
    };
    const inlineFlags = interpreterInlineFlags[program];
    if (inlineFlags !== undefined) {
      const code = inlineCodeOf([program, ...args], inlineFlags);
      if (code !== undefined) {
        if (isShortInlineCode(code)) {
          return {
            kind: "script",
            reason: "短内联代码（bounds 内）：代码原文进入审查（开关开启时由判断 agent 核对，关闭时客户本人确认）。",
          };
        }
        return { kind: "deny", reason: "长内联/超界代码硬拒（请改为落盘脚本后走脚本审查）", targets: [] };
      }
    }
    const shellPrograms = new Set(["sh", "bash", "zsh", "dash", "ash", "ksh", "csh", "tcsh", "fish"]);
    if (shellPrograms.has(program)) {
      const hasInline = args.some((arg) => arg === "-c" || arg === "--command");
      if (hasInline) {
        return { kind: "deny", reason: `shell 内联求值（${program} -c）硬拒：真命令藏在字符串里，无法按写区校验`, targets: [] };
      }
      const firstNonOption = args.find((arg) => arg !== "--" && !arg.startsWith("-"));
      if (firstNonOption !== undefined) {
        return {
          kind: "script",
          reason: "shell 执行脚本文件：脚本内容进入审查（开关开启时由判断 agent 核对，关闭时客户本人确认）。",
        };
      }
    }
    // find 的 -exec/-execdir/-ok/-okdir 会执行任意命令 ⇒ 硬拒；-delete/-fprint 仅写文件 ⇒ script。
    if (program === "find" && args.some((arg) => arg === "-exec" || arg === "-execdir" || arg === "-ok" || arg === "-okdir")) {
      return { kind: "deny", reason: "find -exec/-execdir/-ok 会执行任意命令，硬拒", targets: [] };
    }
    // 2026-10-31（方案 v1.3 §5.3）：例行命令确定性白名单——与分类器**共用同一纯函数引用**，
    // 位于程序名解析后、`node --test`/npm 脚本分支**之前**：命中 ⇒ pass（不进脚本审查）。
    // 否则下面的脚本分支会先返回 script，把 (c) 的确定性放行抢先吃掉（"只改 classify 不会产生 0 卡"的关键陷阱）。
    // 不命中的形态（npm install / 任意脚本名 / 裸 tsc / 越界或带 flag 的 node --test…）照旧进入脚本审查。
    if (matchRoutineShellCommand(argv) !== undefined) return { kind: "pass" };
    // 2026-10-29（R2）：`node --test <file...>` 运行测试文件 ⇒ 脚本审查（内容随上下文提供）。
    if (program === "node" && args.some((arg) => arg === "--test" || arg === "--test-only")) {
      return {
        kind: "script",
        reason: "node --test 运行测试文件：测试文件内容进入审查（开关开启时由判断 agent 核对，关闭时客户本人确认）。",
      };
    }
    // 2026-10-29（v2.3）：npm test/install/ci 等包命令同样进入脚本审查（提取 package.json/锁定文件/脚本内容）。
    if (program === "npm" || program === "pnpm" || program === "yarn") {
      const sub = args.find((arg) => !arg.startsWith("-"))?.toLowerCase();
      if (sub !== undefined && ["test", "t", "tst", "install", "i", "ci", "it", "add", "run", "run-script"].includes(sub)) {
        return {
          kind: "script",
          reason: `${program} ${sub} 会运行包脚本/安装依赖：读取 package.json、锁定文件与测试脚本内容进入审查。`,
        };
      }
    }
    const explicit = parseExplicitWriteTargets(program, args);
    if (explicit.kind === "ambiguous") {
      const protectedPath = protectedPathMention();
      if (protectedPath !== undefined) {
        return (() => {
          const rejection = makeMechanicalRejection("versioned-doc-overwrite", [`版本化文档只读：命令触及 ${protectedPath}（已存在，禁止覆盖）`], { docs: [protectedPath] });
          return { kind: "deny" as const, reason: formatMechanicalRejection(rejection), targets: [protectedPath], code: "versioned-doc-overwrite" as const, rejection };
        })();
      }
      const mentionedStable = stableMention();
      if (mentionedStable !== undefined) return stableMentionDenial(mentionedStable);
      return {
        kind: "script",
        reason: `${explicit.reason}；写目标无法静态解析，交由审批判断（开关开启时由判断 agent 审查脚本/上下文，关闭时客户本人确认）。`,
      };
    }
    if (explicit.kind === "review") {
      // 先做可静态判定的越界检查：
      //   · `paths`（find 起始路径等）只需在项目根内（起始路径不是写目标）；
      //   · `targets`（写目标）必须在角色写区内。
      // 任一越界 ⇒ 直接 deny（不进判断）。
      for (const target of explicit.paths ?? []) {
        const resolved = resolveTarget(input.projectRoot, input.cwd, target);
        if ("error" in resolved) {
          return { kind: "deny", reason: `命令路径越界：${resolved.error}`, targets: [target] };
        }
      }
      for (const target of explicit.targets ?? []) {
        const resolved = resolveTarget(input.projectRoot, input.cwd, target);
        if ("error" in resolved) {
          return { kind: "deny", reason: `写目标越界：${resolved.error}`, targets: [target] };
        }
        const rel = resolved.rel;
        const forbidden = input.forbiddenPrefixes.find((prefix) => underForbiddenPrefix(rel, prefix));
        const decision = forbidden !== undefined ? undefined : input.checkWrite(rel);
        if (forbidden !== undefined || decision?.allowed !== true) {
          return {
            kind: "deny",
            reason:
              forbidden !== undefined
                ? `写目标命中禁写路径（${forbidden}）：${rel}——治理记录/他人写区只能由对应角色或应用写。`
                : `写目标不在你的写边界内：${rel}（${decision?.reason ?? "未匹配任何边界条目"}）。`,
            targets: [rel],
          };
        }
        // 2026-10-29（v2.8 R6）→ 2026-11-04（C2b）：stable 一律拒绝；版本化统一冻结判定
        // （frozen ⇒ deny；draft ⇒ allow；unknown/缺省既有 ⇒ fail-closed/旧口径）。
        const guarded = guardResolvedTarget(rel);
        if (guarded !== undefined) return guarded;
      }
      const protectedPath = protectedPathMention();
      if (protectedPath !== undefined) {
        return (() => {
          const rejection = makeMechanicalRejection("versioned-doc-overwrite", [`版本化文档只读：命令触及 ${protectedPath}（已存在，禁止覆盖）`], { docs: [protectedPath] });
          return { kind: "deny" as const, reason: formatMechanicalRejection(rejection), targets: [protectedPath], code: "versioned-doc-overwrite" as const, rejection };
        })();
      }
      const mentionedStable = stableMention();
      if (mentionedStable !== undefined) return stableMentionDenial(mentionedStable);
      return { kind: "script", reason: `${explicit.reason}；交由审批判断（开关开启时由判断 agent 审查，关闭时客户本人确认）。` };
    }
    if (explicit.kind === "targets") {
      const resolvedTargets: string[] = [];
      for (const target of explicit.targets) {
        const resolved = resolveTarget(input.projectRoot, input.cwd, target);
        if ("error" in resolved) {
          return { kind: "deny", reason: `写目标越界：${resolved.error}`, targets: [target] };
        }
        const rel = resolved.rel;
        const forbidden = input.forbiddenPrefixes.find((prefix) => underForbiddenPrefix(rel, prefix));
        if (forbidden !== undefined) {
          return {
            kind: "deny",
            reason: `写目标命中禁写路径（${forbidden}）：${rel}——治理记录/他人写区只能由对应角色或应用写。`,
            targets: [rel],
          };
        }
        const decision = input.checkWrite(rel);
        if (decision.allowed !== true) {
          return {
            kind: "deny",
            reason:
              `写目标不在你的写边界内：${rel}（${decision.reason ?? "未匹配任何边界条目"}）。` +
              "请改写到自己的可写区，或交有权限的角色执行。",
            targets: [rel],
          };
        }
        // 2026-10-29（v2.8 R6）→ 2026-11-04（C2b）：stable 一律拒绝；版本化统一冻结判定
        // （frozen ⇒ deny；draft ⇒ allow；unknown/缺省既有 ⇒ fail-closed/旧口径）。
        const guarded = guardResolvedTarget(rel);
        if (guarded !== undefined) return guarded;
        resolvedTargets.push(rel);
      }
      if (resolvedTargets.length > 0) return { kind: "pass" };
    }
    const opaqueWrite = opaqueWriteCapableReason(program, args);
    if (opaqueWrite !== undefined) {
      return { kind: "script", reason: `${opaqueWrite}；写目标无法静态解析，交由审批判断（开关开启时由判断 agent 审查，关闭时客户本人确认）。` };
    }
  }

  const opaque = isOpaqueShellExecution(argv);
  if (opaque.opaque) {
    const protectedPath = protectedPathMention();
    if (protectedPath !== undefined) {
      return { kind: "deny", reason: `版本化文档只读：命令触及 ${protectedPath}（已存在，禁止覆盖）。`, targets: [protectedPath] };
    }
    const mentionedStable = stableMention();
    if (mentionedStable !== undefined) return stableMentionDenial(mentionedStable);
    return {
      kind: "script",
      reason:
        `${opaque.reason ?? "该命令可执行任意代码或写任意文件"}。` +
        "无法按角色写区校验，交由审批判断（开关开启时由判断 agent 审查脚本/上下文，关闭时客户本人确认）。",
    };
  }
  return { kind: "pass" };
}
