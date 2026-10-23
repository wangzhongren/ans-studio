// src/common/编排/directory-conformance.ts
// **实际布局核对纯函数**（2026-10-23 目录级授权；策划方案
// `docs/planning/2026-10-23_design_directory-ownership.md` §6/§8.2，Q12 A）。
//
// 纪律：
//   · 纯函数：输入候选改动路径 + v3 目录规范（`DirectorySpec`），输出逐路径核对行；
//     **不读 git、不写报告、不调用模型**（调用方负责取 `git status`/`diff` 并保存报告）。
//   · 单一路径口径：复用 `src/common/shared/path-primitives.ts`（项目管理属主）的
//     posix 规范化 / 大小写比较 / realpath 语义；不另写第二份。
//   · 跳过管理记录（顶层 `docs/communication|planning|scheduling|acceptance`）与角色根工作文档
//     （`角色卡/<roleId>/...`）：它们不是产品候选，由角色卡/边界与治理流程管理。
//   · 删除按原路径核对（必须在自己目录内）；重命名按新路径核对（git `old -> new` 取新路径）。
//   · 输出是**证据**，不是授权：报告 pass 不改变任何写入权。

import { join as joinPath } from "node:path";
import {
  compareKey,
  isWithinReal,
  normalizeLexical,
  realResolve,
  toPosix,
} from "../shared/path-primitives.ts";
import type { DirectorySpec } from "./team-plan.ts";

/** 布局核对输入（设计 §8.2）。 */
export interface LayoutCheckInput {
  /**
   * 候选改动路径。接受纯路径，或 `git status --short` 行（如 ` M path`、`?? path`、`D  path`、
   * `R  old -> new`）；重命名取新路径，删除取原路径。调用方应把含未跟踪文件的原始清单传入。
   */
  changedPaths: string[];
  /** v3 目录规范（来自 `parseTeamPlan().directorySpecs`）。 */
  specs: DirectorySpec[];
  /** roleId → 授权目录（图省事的一致性核对；缺 key 时不额外判 fail）。 */
  roleDirs: Map<string, string[]>;
  /**
   * 项目根（可选；只读）：给出时对候选路径已存在祖先做 realpath 逃逸核对（V-D9 口径）。
   * 未给出时只做词法路径安全核对。
   */
  projectRoot?: string;
  /**
   * 本次核对角色（可选；Map 角色自检/按角色出证据时用）：给出时，命中目录的 owner 必须等于该角色，
   * 否则判 fail（“他人目录”）。不给出时只按目录规范归属报告 owner（供 Reduce/Verifier 复核）。
   */
  roleId?: string;
}

export interface LayoutCheckChecks {
  /** 扩展名在 `允许文件类型` 内（`*` 仅 docs/evidence）。 */
  type: boolean;
  /** 子目录符合 `允许子目录`（`—`/显式列表/`*` 一层/`**` 任意层）。 */
  subdir: boolean;
  /** 目录名/文件名符合 `命名`。 */
  naming: boolean;
  /** 未命中 `禁写区`。 */
  forbidden: boolean;
  /** 无 `..`/绝对路径/盘符/UNC/尾随空格或点；给出 projectRoot 时 realpath 不逃逸。 */
  pathSafe: boolean;
}

export interface LayoutCheckRow {
  /** 原始候选路径（展示用；重命名已取新路径）。 */
  path: string;
  owner?: string;
  /** 命中的目录规范 `dir`。 */
  dir?: string;
  checks: LayoutCheckChecks;
  result: "pass" | "fail";
  reason?: string;
  /** 管理记录/角色根工作文档：不参与布局核对（result 恒 pass）。 */
  skipped?: boolean;
  /** 该路径来自删除（按原路径核对）。 */
  deleted?: boolean;
}

export interface LayoutCheckResult {
  rows: LayoutCheckRow[];
  ok: boolean;
}

/** 顶层管理记录目录（不是产品候选；设计 §6.1）。 */
const MANAGEMENT_DIRS: readonly string[] = [
  "docs/communication",
  "docs/planning",
  "docs/scheduling",
  "docs/acceptance",
];

/** 角色根工作文档根（`角色卡/<roleId>/...`；由角色卡/边界规则管理）。 */
const ROLE_ROOT_DIR = "角色卡";

interface ChangeEntry {
  path: string;
  deleted: boolean;
}

/** 解析 `git status --short` 行 / `old -> new` / 纯路径。 */
function parseChangeEntry(raw: string): ChangeEntry | undefined {
  let line = raw.trim();
  if (line === "") return undefined;
  if (/^".*"$/.test(line)) line = line.slice(1, -1).trim();
  let deleted = false;
  // git status --short：两列状态 + 空白 + 路径（如 ` M path`、`?? path`、`D  path`）。
  const statusMatch = /^([ MADRCU?!]{1,2})\s+(.+)$/.exec(line);
  if (statusMatch !== null) {
    deleted = statusMatch[1]!.includes("D");
    line = statusMatch[2]!.trim();
  }
  // 重命名：取新路径（设计 §6.1「重命名按新路径核对」）。
  const arrow = line.indexOf(" -> ");
  if (arrow !== -1) line = line.slice(arrow + 4).trim();
  if (/^".*"$/.test(line)) line = line.slice(1, -1).trim();
  if (line === "") return undefined;
  return { path: line, deleted };
}

function relOf(prefix: string): string {
  return toPosix(prefix).replace(/\/+$/, "");
}

function isManagementRecord(path: string): boolean {
  const key = compareKey(relOf(path));
  return MANAGEMENT_DIRS.some((dir) => key === compareKey(dir) || key.startsWith(`${compareKey(dir)}/`));
}

function isRoleRootDocument(path: string): boolean {
  const key = compareKey(relOf(path));
  const root = compareKey(ROLE_ROOT_DIR);
  return key === root || key.startsWith(`${root}/`);
}

/** 词法路径安全（不触碰文件系统；`..`/空段/盘符/UNC/尾随空格点）。 */
function lexicalPathIssues(path: string): string[] {
  const text = toPosix(path);
  const issues: string[] = [];
  if (text.startsWith("//")) issues.push("UNC 路径");
  else if (text.startsWith("/")) issues.push("绝对路径");
  else if (/^[A-Za-z]:/.test(text)) issues.push("盘符路径");
  const segments = text.replace(/\/+$/, "").split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    issues.push("空段/./..");
  }
  if (segments.some((segment) => /[ .]$/.test(segment))) issues.push("路径段以空格或点结尾");
  return issues;
}

/** 目录规范命名匹配。 */
function matchesNaming(naming: string, name: string, isFile: boolean): boolean {
  const spec = naming.trim();
  if (spec === "" || spec === "any") return true;
  if (spec === "kebab-case") return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
  if (spec === "camelCase") return /^[a-z][a-zA-Z0-9]*$/.test(name);
  if (spec === "snake_case") return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(name);
  if (spec === "PascalCase") return /^[A-Z][a-zA-Z0-9]*$/.test(name);
  if (/^\*\.[A-Za-z0-9._-]+$/.test(spec)) return isFile && globMatch(spec, name);
  const regexMatch = /^\/(.+)\/([a-z]*)$/.exec(spec);
  if (regexMatch !== null) {
    try {
      return new RegExp(regexMatch[1]!, regexMatch[2]!).test(name);
    } catch {
      return false;
    }
  }
  return false;
}

function globMatch(pattern: string, name: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`).test(name);
}

function fileStem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

/** 子目录约束核对。 */
function subdirsAllowed(spec: DirectorySpec, subdirs: string[]): boolean {
  if (subdirs.length === 0) return true;
  if (spec.subdirs === "—") return false;
  if (spec.subdirs === "*") return subdirs.length <= 1;
  if (spec.subdirs === "**") return true;
  return subdirs.every((segment) => spec.subdirs.includes(segment));
}

/** 禁写区核对（相对目录的前缀/文件名/`*.ext`）。 */
function forbiddenHit(spec: DirectorySpec, rel: string): string | undefined {
  const basename = rel.replace(/\/+$/, "").split("/").pop() ?? "";
  for (const item of spec.forbidden) {
    if (/^\*\.[A-Za-z0-9._-]+$/.test(item)) {
      if (globMatch(item, basename)) return item;
      continue;
    }
    const normalized = toPosix(item);
    if (normalized.endsWith("/")) {
      if (isUnder(rel, normalized)) return item;
      continue;
    }
    if (normalized.includes("/")) {
      if (rel === normalized || isUnder(rel, normalized)) return item;
      continue;
    }
    if (basename === normalized) return item;
  }
  return undefined;
}

function isUnder(path: string, dir: string): boolean {
  const p = compareKey(relOf(path));
  const d = compareKey(relOf(dir));
  return p === d || p.startsWith(`${d}/`);
}

function longestPrefixSpecs(specs: readonly DirectorySpec[], path: string): DirectorySpec[] {
  let bestLength = -1;
  let matches: DirectorySpec[] = [];
  for (const spec of specs) {
    if (!isUnder(path, spec.dir)) continue;
    const length = relOf(spec.dir).length;
    if (length > bestLength) {
      bestLength = length;
      matches = [spec];
    } else if (length === bestLength) {
      matches.push(spec);
    }
  }
  return matches;
}

function passRow(row: Omit<LayoutCheckRow, "checks" | "result"> & Partial<LayoutCheckRow>): LayoutCheckRow {
  return {
    ...row,
    checks: { type: true, subdir: true, naming: true, forbidden: true, pathSafe: true },
    result: "pass",
  };
}

/**
 * 核对一条改动路径：管理记录/角色根工作文档跳过；其余按最长前缀匹配 owner，
 * 逐项检查扩展名/子目录/命名/禁写区/路径安全。删除按原路径、重命名按新路径（调用方传入的已是目标路径）。
 */
export function checkDirectoryLayout(input: LayoutCheckInput): LayoutCheckResult {
  const rows: LayoutCheckRow[] = [];
  for (const raw of input.changedPaths) {
    const entry = parseChangeEntry(raw);
    if (entry === undefined) continue;
    const displayPath = entry.path;
    if (isManagementRecord(displayPath)) {
      rows.push(passRow({ path: displayPath, skipped: true, reason: "管理记录，跳过布局核对" }));
      continue;
    }
    if (isRoleRootDocument(displayPath)) {
      rows.push(passRow({ path: displayPath, skipped: true, reason: "角色根工作文档，跳过布局核对" }));
      continue;
    }
    const lexicalIssues = lexicalPathIssues(displayPath);
    if (lexicalIssues.length > 0) {
      rows.push({
        path: displayPath,
        checks: { type: false, subdir: false, naming: false, forbidden: false, pathSafe: false },
        result: "fail",
        reason: `路径不安全：${lexicalIssues.join("、")}`,
        ...(entry.deleted ? { deleted: true } : {}),
      });
      continue;
    }
    const normalized = normalizeLexical(toPosix(displayPath).replace(/^\.\//, ""));
    const matches = longestPrefixSpecs(input.specs, normalized);
    if (matches.length === 0) {
      rows.push({
        path: displayPath,
        checks: { type: false, subdir: false, naming: false, forbidden: false, pathSafe: true },
        result: "fail",
        reason: "路径不在任何授权目录内",
        ...(entry.deleted ? { deleted: true } : {}),
      });
      continue;
    }
    const distinctDirs = [...new Set(matches.map((spec) => compareKey(spec.dir)))];
    const distinctOwners = [...new Set(matches.map((spec) => spec.owner))];
    if (distinctDirs.length > 1 || distinctOwners.length > 1) {
      rows.push({
        path: displayPath,
        checks: { type: false, subdir: false, naming: false, forbidden: false, pathSafe: true },
        result: "fail",
        reason: `匹配到多个目录/owner（${matches.map((spec) => `${spec.dir}@${spec.owner}`).join("、")}；目录重叠应被 V-D4 拒绝）`,
        ...(entry.deleted ? { deleted: true } : {}),
      });
      continue;
    }
    const spec = matches[0]!;
    if (input.roleId !== undefined && spec.owner !== input.roleId) {
      rows.push({
        path: displayPath,
        owner: spec.owner,
        dir: spec.dir,
        checks: { type: false, subdir: false, naming: false, forbidden: false, pathSafe: true },
        result: "fail",
        reason: `路径属于角色 ${spec.owner} 的目录（非本次角色 ${input.roleId}）`,
        ...(entry.deleted ? { deleted: true } : {}),
      });
      continue;
    }
    if (spec.shared === "split") {
      rows.push({
        path: displayPath,
        owner: spec.owner,
        dir: spec.dir,
        checks: { type: false, subdir: false, naming: false, forbidden: false, pathSafe: true },
        result: "fail",
        reason: `「${spec.dir}」是 shared: split 父目录，本身不可直接写入（须落在子目录规范内）`,
        ...(entry.deleted ? { deleted: true } : {}),
      });
      continue;
    }
    const ownerDirs = input.roleDirs.get(spec.owner);
    if (ownerDirs !== undefined && !ownerDirs.some((dir) => compareKey(relOf(dir)) === compareKey(relOf(spec.dir)))) {
      rows.push({
        path: displayPath,
        owner: spec.owner,
        dir: spec.dir,
        checks: { type: false, subdir: false, naming: false, forbidden: false, pathSafe: true },
        result: "fail",
        reason: `目录规范 owner「${spec.owner}」的 roleDirs 未包含「${spec.dir}」`,
        ...(entry.deleted ? { deleted: true } : {}),
      });
      continue;
    }

    const dirPrefix = relOf(spec.dir);
    const rel = normalized.endsWith("/")
      ? normalized.slice(dirPrefix.length + 1).replace(/\/+$/, "")
      : normalized.slice(dirPrefix.length + 1);
    const relSegments = rel === "" ? [] : rel.split("/");
    const isDirectoryChange = normalized.endsWith("/");
    const subdirs = isDirectoryChange ? relSegments : relSegments.slice(0, -1);
    const fileName = isDirectoryChange ? "" : relSegments[relSegments.length - 1] ?? "";
    const reasons: string[] = [];

    let typeOk = true;
    if (!isDirectoryChange) {
      const extension = fileExtension(fileName);
      const wildcardAllowed = spec.kind === "docs" || spec.kind === "evidence";
      typeOk = spec.extensions.includes("*")
        ? wildcardAllowed
        : extension !== "" && spec.extensions.includes(extension);
      if (!typeOk) {
        reasons.push(
          `扩展名「${extension === "" ? "无" : extension}」不在允许文件类型（${spec.extensions.join(";")}）内`,
        );
      }
    }

    const subdirOk = subdirsAllowed(spec, subdirs);
    if (!subdirOk) reasons.push(`子目录「${subdirs.join("/")}」超出「允许子目录」`);

    let namingOk = subdirs.every((segment) => matchesNaming(spec.naming, segment, false));
    if (!namingOk) reasons.push(`目录名不符合命名规范「${spec.naming}」`);
    if (!isDirectoryChange && fileName !== "") {
      const isGlob = /^\*\./.test(spec.naming);
      const usesFullName = isGlob || spec.naming.startsWith("/");
      const target = usesFullName ? fileName : fileStem(fileName);
      if (!matchesNaming(spec.naming, target, true)) {
        namingOk = false;
        reasons.push(`文件名「${fileName}」不符合命名规范「${spec.naming}」`);
      }
    }

    const forbidden = forbiddenHit(spec, rel);
    const forbiddenOk = forbidden === undefined;
    if (!forbiddenOk) reasons.push(`命中禁写区「${forbidden}」`);

    let pathSafeOk = true;
    if (input.projectRoot !== undefined && input.projectRoot !== "") {
      const rootReal = realResolve(input.projectRoot);
      const target = realResolve(joinPath(input.projectRoot, ...normalized.replace(/\/+$/, "").split("/")));
      if (!isWithinReal(rootReal, target)) {
        pathSafeOk = false;
        reasons.push(`realpath 解析后逃出项目根「${target}」`);
      }
    }

    const checks: LayoutCheckChecks = {
      type: typeOk,
      subdir: subdirOk,
      naming: namingOk,
      forbidden: forbiddenOk,
      pathSafe: pathSafeOk,
    };
    const failed = !checks.type || !checks.subdir || !checks.naming || !checks.forbidden || !checks.pathSafe;
    rows.push({
      path: displayPath,
      owner: spec.owner,
      dir: spec.dir,
      checks,
      result: failed ? "fail" : "pass",
      ...(failed ? { reason: reasons.join("；") } : {}),
      ...(entry.deleted ? { deleted: true } : {}),
    });
  }
  return { rows, ok: rows.every((row) => row.result === "pass") };
}

/** 核对结果是否全部 pass（跳过行按 pass 计）。 */
export function layoutCheckPassed(result: LayoutCheckResult | LayoutCheckRow[]): boolean {
  const rows = Array.isArray(result) ? result : result.rows;
  return rows.every((row) => row.result === "pass");
}
