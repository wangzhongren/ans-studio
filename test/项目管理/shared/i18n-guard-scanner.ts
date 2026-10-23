// test/项目管理/shared/i18n-guard-scanner.ts
// 项目管理：i18n 硬编码守卫的确定性源码扫描器（测试夹具，不进入产品代码）。
//
// 设计说明（限制如实记录）：
//  · 本仓库的 TypeScript 是 7.x 原生编译器，公开 API 是 `typescript/unstable/*` 的
//    JSON-RPC 服务进程，不适合作为离线、确定性的单测依赖；因此本守卫**不使用 AST**，
//    而使用一个自包含的词法扫描：
//      1) 按状态机去除 `//` 与 `/* ... */` 注释（字符串/模板字面量内的 `//`、`/*` 不误删；
//         模板 `${...}` 表达式内的注释也会去除）；
//      2) 在去注释后的文本中查找 Han 字符（`\p{Script=Han}`）。
//  · 因此扫描范围是目标集合（字符串/模板/JSX 文本）的**保守超集**：非注释的标识符、
//    正则字面量中的中文也会被报告。当前仓库没有中文标识符；若未来出现，应改写或把文件
//    列入 allowlist 并说明理由。
//  · 已知盲区：JSX 文本中若出现字面 `//`（如裸 URL），其行尾内容会被当作行注释跳过；
//    字符串/模板中的 URL 不受影响。正则字面量中若出现 `/*` 会被误判为块注释。
//    这两类在扫描目标中均未出现；新增时由人工复核。
//  · 守卫只读源码，不修改任何文件；allowlist 之外出现中文即失败。

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** 扫描目标：路径 + 是否单文件（目录则递归）。 */
export interface GuardTarget {
  path: string;
  file?: boolean;
}

/** B0 守卫扫描范围（方案 §4.9；团队计划 §4.3 项目管理写集）。 */
export const GUARD_TARGETS: readonly GuardTarget[] = [
  { path: "app/renderer/src" },
  { path: "app/desktop" },
  { path: "src/index.ts", file: true },
  { path: "src/interface/cli" },
  { path: "src/common/shared/runtime-settings.ts", file: true },
];

/** 扫描排除前缀（POSIX 相对路径）。 */
const EXCLUDED_PREFIXES: readonly string[] = [
  "node_modules/",
  "app/renderer/dist/",
  "src/common/shared/i18n/messages/",
];

/**
 * 扫描排除的精确文件：门禁引擎的角色卡/提示词文本不是 UI 文案（方案 §4.9）。
 * 该文件不在上述目标内，此处保留为防御性排除。
 */
const EXCLUDED_FILES: ReadonlySet<string> = new Set([
  "src/common/门禁引擎/governance-roles.ts",
]);

const TEST_FILE_PATTERN = /\.(test|spec)\.tsx?$/;
const SOURCE_EXTENSION_PATTERN = /\.tsx?$/;

export interface HanHit {
  /** 1-based 行号。 */
  line: number;
  /** 1-based 列号（UTF-16 code unit，与 TS 诊断列口径一致）。 */
  column: number;
  /** 命中的连续中文片段。 */
  text: string;
}

type Frame =
  | { kind: "code" }
  | { kind: "template" }
  | { kind: "templateExpr"; depth: number };

/**
 * 去除注释，保留字符串/模板内容与换行（行号不变）。纯函数；不修改入参。
 */
export function stripComments(source: string): string {
  const out: string[] = [];
  const stack: Frame[] = [{ kind: "code" }];
  let stringQuote: string | null = null;
  let i = 0;

  while (i < source.length) {
    const ch = source[i] as string;
    const next = source[i + 1];
    const frame = stack[stack.length - 1] as Frame;

    if (stringQuote !== null) {
      out.push(ch);
      if (ch === "\\") {
        if (i + 1 < source.length) {
          out.push(source[i + 1] as string);
          i += 2;
          continue;
        }
      } else if (ch === stringQuote || ch === "\n" || ch === "\r") {
        stringQuote = null;
      }
      i += 1;
      continue;
    }

    if (frame.kind === "template") {
      out.push(ch);
      if (ch === "\\" && i + 1 < source.length) {
        out.push(source[i + 1] as string);
        i += 2;
        continue;
      }
      if (ch === "`") {
        stack.pop();
        i += 1;
        continue;
      }
      if (ch === "$" && next === "{") {
        out.push(next);
        stack.push({ kind: "templateExpr", depth: 1 });
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    // code / templateExpr
    if (ch === "'" || ch === '"') {
      stringQuote = ch;
      out.push(ch);
      i += 1;
      continue;
    }
    if (ch === "`") {
      out.push(ch);
      stack.push({ kind: "template" });
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < source.length && source[i] !== "\n" && source[i] !== "\r") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") out.push("\n");
        i += 1;
      }
      if (i < source.length) i += 2;
      continue;
    }
    if (frame.kind === "templateExpr") {
      if (ch === "{") {
        frame.depth += 1;
      } else if (ch === "}") {
        frame.depth -= 1;
        out.push(ch);
        i += 1;
        if (frame.depth === 0) stack.pop();
        continue;
      }
    }
    out.push(ch);
    i += 1;
  }

  return out.join("");
}

const HAN_RUN = /\p{Script=Han}+/gu;

/** 查找去注释后源码中的中文片段（行/列/片段）。纯函数。 */
export function findHan(source: string): HanHit[] {
  const stripped = stripComments(source);
  const lineStarts: number[] = [0];
  for (let i = 0; i < stripped.length; i += 1) {
    if (stripped[i] === "\n") lineStarts.push(i + 1);
  }
  const hits: HanHit[] = [];
  for (const match of stripped.matchAll(HAN_RUN)) {
    const index = match.index ?? 0;
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if ((lineStarts[mid] as number) <= index) low = mid;
      else high = mid - 1;
    }
    hits.push({
      line: low + 1,
      column: index - (lineStarts[low] as number) + 1,
      text: match[0],
    });
  }
  return hits;
}

/** 相对仓库根、POSIX 分隔符的路径（allowlist 的稳定键）。 */
export function toRepoPath(repoRoot: string, file: string): string {
  return relative(repoRoot, file).split(sep).join("/");
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) walk(file, out);
    else out.push(file);
  }
}

/** 收集扫描范围内的全部源码文件（绝对路径，已排序、已应用排除规则）。 */
export function collectGuardFiles(repoRoot: string): string[] {
  const files: string[] = [];
  for (const target of GUARD_TARGETS) {
    const absolute = join(repoRoot, ...target.path.split("/"));
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      continue;
    }
    if (target.file === true) {
      if (stats.isFile()) files.push(absolute);
    } else if (stats.isDirectory()) {
      walk(absolute, files);
    }
  }

  return files
    .filter((file) => SOURCE_EXTENSION_PATTERN.test(file))
    .filter((file) => !TEST_FILE_PATTERN.test(file))
    .filter((file) => {
      const rel = toRepoPath(repoRoot, file);
      if (EXCLUDED_FILES.has(rel)) return false;
      return !EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix));
    })
    .sort((a, b) => (toRepoPath(repoRoot, a) < toRepoPath(repoRoot, b) ? -1 : 1));
}

/**
 * 守卫判定：allowlist 命中则放行；否则任何中文命中即违规。
 * 合成负例/未来收紧都走同一函数，避免测试与真实守卫判据分叉。
 */
export function evaluateGuard(
  path: string,
  source: string,
  allowlist: ReadonlySet<string>,
): { allowed: boolean; hits: HanHit[] } {
  const hits = findHan(source);
  return { allowed: hits.length === 0 || allowlist.has(path), hits };
}

/** 读取文件并判定（守卫测试的逐文件入口）。 */
export function evaluateGuardFile(
  repoRoot: string,
  file: string,
  allowlist: ReadonlySet<string>,
): { path: string; allowed: boolean; hits: HanHit[] } {
  const path = toRepoPath(repoRoot, file);
  const result = evaluateGuard(path, readFileSync(file, "utf8"), allowlist);
  return { path, ...result };
}
