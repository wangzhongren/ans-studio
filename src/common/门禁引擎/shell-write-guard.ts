// src/common/门禁引擎/shell-write-guard.ts
// 2026-10-29（方案 v2.1 §6.3/§6.4；客户 Q1 A；返工按独立验收 P6 收紧）：
// shell **写目标守卫**——确定性同步判定 + 注入 `checkWrite`（同一 resolveWrite，realpath/F4/scope 口径）。
//
// 返工要点（P6）：**不枚举已知 flag**。凡「写能力命令」：
//   · 目标可被**完整静态解析**且全部落在角色写区内 ⇒ pass（继续既有审批链）；
//   · 解析出目标但任一越界/命中禁写/逃逸 ⇒ deny（直接拒绝，不弹卡）；
//   · **无法静态解析出全部写目标**（未知/歧义选项、`-t/--target-directory` 等目标型选项、
//     `find -delete/-exec`、`xargs`、`git clean/checkout`、`rsync`、`tar` 解包、`install` 等）⇒
//     `opaque`（manualOnly：必须客户本人审批，「替我审批」不代批）。
//   · 解释器脚本/构建包脚本（node 脚本、npm run 等）同样 `opaque`。
// 该口径对新增程序/新 flag 天然 fail-closed：不认识 ⇒ 交客户本人，不自动放行。

import type { BoundarySection1 } from "../../model/boundary.ts";
import type { TaskScope } from "../../model/decision.ts";
import path from "node:path";
import { inlineCodeOf, isOpaqueShellExecution, isShortInlineCode } from "./classify-shell.ts";
import { checkVersionedDocWrite, protectedVersionedPathsSync, versionedDocExists, versionedDocOverwriteDecision } from "./versioned-doc-guard.ts";

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
}

/** 守卫三态（2026-10-29 R2 对齐）：pass / deny / script（进入脚本内容审查）。 */
export type ShellWriteGuardDecision =
  | { kind: "pass" }
  | { kind: "deny"; reason: string; targets: string[] }
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

const READONLY_GIT_SUBCOMMANDS = new Set([
  "status", "log", "diff", "show", "blame", "ls-files", "ls-tree", "shortlog",
  "whatchanged", "describe", "rev-parse", "rev-list", "merge-base", "cat-file",
  "grep", "show-ref", "name-rev", "for-each-ref", "var", "count-objects", "fsck",
]);

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
    case "git": {
      const subcommand = args.find((arg) => !arg.startsWith("-"));
      if (subcommand === undefined || READONLY_GIT_SUBCOMMANDS.has(subcommand)) return undefined;
      return `git ${subcommand} 可能写工作树/索引/.git（含 clean/checkout/restore），无法静态确认目标`;
    }
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
  const argv = Array.isArray(input.argv) ? input.argv.map((arg) => String(arg)) : [];
  const program = argv.length > 0 ? baseName(argv[0]!) : "";
  const args = argv.slice(1);
  // 2026-10-29（v2.10）：脚本/argv 全通道——命令文本触及受管版本化路径时，写能力命令一律 deny。
  const protectedPathMention = (): string | undefined => {
    const text = argv.join(" ");
    return protectedVersionedPathsSync(input.projectRoot).find((rel) => text.includes(rel));
  };

  if (program !== "") {
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
        return { kind: "deny", reason: `版本化文档只读：命令触及 ${protectedPath}（已存在，禁止覆盖）。`, targets: [protectedPath] };
      }
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
        // 2026-10-29（v2.8 R6）：既有版本化文档只读——任何通道覆盖一律 deny（不进审批）。
        if (versionedDocExists(input.projectRoot, rel)) {
          const guarded = versionedDocOverwriteDecision({ relPath: rel, exists: true });
          if (!guarded.allowed) return { kind: "deny", reason: guarded.reason, targets: [rel] };
        }
      }
      const protectedPath = protectedPathMention();
      if (protectedPath !== undefined) {
        return { kind: "deny", reason: `版本化文档只读：命令触及 ${protectedPath}（已存在，禁止覆盖）。`, targets: [protectedPath] };
      }
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
        // 2026-10-29（v2.8 R6）：既有版本化文档只读——任何通道覆盖一律 deny（不进审批）。
        if (versionedDocExists(input.projectRoot, rel)) {
          const guarded = versionedDocOverwriteDecision({ relPath: rel, exists: true });
          if (!guarded.allowed) return { kind: "deny", reason: guarded.reason, targets: [rel] };
        }
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
    return {
      kind: "script",
      reason:
        `${opaque.reason ?? "该命令可执行任意代码或写任意文件"}。` +
        "无法按角色写区校验，交由审批判断（开关开启时由判断 agent 审查脚本/上下文，关闭时客户本人确认）。",
    };
  }
  return { kind: "pass" };
}
