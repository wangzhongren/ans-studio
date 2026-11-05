// src/common/编排/shell-post-audit.ts
// 2026-10-29（方案 v2.1 §6.5）：shell **执行后写审计**（纵深防御）——执行前轻量快照（路径+mtime+size），
// 执行后对比；任何新增/修改/删除路径不在角色写边界内 ⇒ 记录审计（`docs/audit/shell-gate.jsonl`，应用写）
// 并把越界事实返回给工具层（run_shell 以失败/需核对回执暴露，不静默）。
//
// 纪律：
//   · 默认**不自动回滚**（避免覆盖并发写入）；由客户/负责人决定修复；
//   · 快照排除 `.ans/`、`.git/`、`node_modules/`、构建产物（`dist/`、`build/`、`release-output/`）等；
//   · 只记录**越界**变化，边界内正常写入不产生噪声；
//   · 审计写失败只诊断，不改变工具回执（审计是观测，不是执行条件）。
// 纯逻辑（diff/判定）+ 注入 IO（快照/写审计），可在 node 下单测。

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { ShellExecutionOutcome, ShellPostAuditResult, ShellReviewRequest } from "../../model/runtime.ts";
import {
  baselineShaFor,
  isVersionedDocPath,
  versionedDocFreezeState,
} from "../门禁引擎/versioned-doc-guard.ts";
import type { DocFreezeLookupState } from "../../model/version-change.ts";
import { wasWrittenByTool } from "./write-journal.ts";

export interface TreeEntryFacts {
  mtimeMs: number;
  size: number;
}

export type TreeSnapshot = Map<string, TreeEntryFacts>;

/** 显式声明的额外监视根（如 skillRoot）的快照键前缀；**不是**项目外写入的兜底覆盖。 */
export const OUTSIDE_SNAPSHOT_PREFIX = "@outside:";

export function isOutsideSnapshotPath(rel: string): boolean {
  return rel.startsWith(OUTSIDE_SNAPSHOT_PREFIX) || rel.startsWith("../") ||
    rel.startsWith("/") || /^[a-zA-Z]:[\/]/.test(rel);
}

export interface ShellPostAuditChange {
  path: string;
  change: "added" | "modified" | "deleted";
}

// 2026-10-29 返工（验收 P6）：`.ans/` 不再排除——应用独占治理记录区的任何写入都必须被审计
// （角色写区永不含 `.ans/`；checkWrite/禁写前缀会把变化判为越界）。
const DEFAULT_EXCLUDED_PREFIXES = [
  ".git/",
  "node_modules/",
  "dist/",
  "build/",
  "release-output/",
  "coverage/",
  ".vite/",
  "out/",
];
const DEFAULT_MAX_ENTRIES = 20000;

/** 项目相对 POSIX 路径（快照键）。 */
function toRel(projectRoot: string, abs: string): string {
  return path.relative(projectRoot, abs).replace(/\\/g, "/");
}

async function walk(
  root: string,
  current: string,
  excluded: readonly string[],
  out: TreeSnapshot,
  limit: number,
): Promise<void> {
  if (out.size >= limit) return;
  let entries;
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.size >= limit) return;
    const abs = path.join(current, entry.name);
    const rel = toRel(root, abs);
    if (excluded.some((prefix) => rel === prefix.slice(0, -1) || rel.startsWith(prefix))) continue;
    if (entry.isSymbolicLink()) continue; // 不跟随符号链接（避免逃逸/环）
    if (entry.isDirectory()) {
      await walk(root, abs, excluded, out, limit);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const stat = await fs.stat(abs);
      out.set(rel, { mtimeMs: stat.mtimeMs, size: stat.size });
    } catch {
      /* 并发删除：忽略 */
    }
  }
}

/** 轻量快照（路径 + mtimeMs + size；排除项见 DEFAULT_EXCLUDED_PREFIXES）。 */
async function walkOutside(root: string, current: string, out: TreeSnapshot, limit: number): Promise<void> {
  if (out.size >= limit) return;
  let entries;
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.size >= limit) return;
    const abs = path.join(current, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await walkOutside(root, abs, out, limit);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const stat = await fs.stat(abs);
      out.set(`${OUTSIDE_SNAPSHOT_PREFIX}${abs.replace(/\\/g, "/")}`, { mtimeMs: stat.mtimeMs, size: stat.size });
    } catch {
      /* 并发删除：忽略 */
    }
  }
}

export async function snapshotProjectTree(input: {
  projectRoot: string;
  excludedPrefixes?: readonly string[];
  maxEntries?: number;
  /** 显式声明的额外监视根（如 skillRoot）；其变化以 @outside 键记录为越界。不是项目外兜底覆盖。 */
  extraRoots?: readonly string[];
}): Promise<TreeSnapshot> {
  const snapshot: TreeSnapshot = new Map();
  await walk(
    input.projectRoot,
    input.projectRoot,
    input.excludedPrefixes ?? DEFAULT_EXCLUDED_PREFIXES,
    snapshot,
    input.maxEntries ?? DEFAULT_MAX_ENTRIES,
  );
  for (const extra of input.extraRoots ?? []) {
    if (typeof extra !== "string" || extra.trim() === "") continue;
    if (path.resolve(extra) === path.resolve(input.projectRoot)) continue;
    await walkOutside(input.projectRoot, path.resolve(extra), snapshot, input.maxEntries ?? DEFAULT_MAX_ENTRIES);
  }
  return snapshot;
}

/** 纯 diff：新增/修改/删除（内容变化无法从 mtime+size 区分时按 mtime 变化判 modified）。 */
export function diffTreeSnapshots(before: TreeSnapshot, after: TreeSnapshot): ShellPostAuditChange[] {
  const changes: ShellPostAuditChange[] = [];
  for (const [rel, facts] of after) {
    const prev = before.get(rel);
    if (prev === undefined) changes.push({ path: rel, change: "added" });
    else if (prev.mtimeMs !== facts.mtimeMs || prev.size !== facts.size) changes.push({ path: rel, change: "modified" });
  }
  for (const rel of before.keys()) {
    if (!after.has(rel)) changes.push({ path: rel, change: "deleted" });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

/** 判定越界变化（与写区同一 `checkWrite`；禁写前缀先判）。**兼容入口**：不含应用运行态归因，
 * `.ans/**` 一律按越界（2026-10-29 P6 旧语义）；实际执行后审计使用 `classifyTreeChanges` 的新归因。 */
export function findOutOfBoundChanges(input: {
  changes: readonly ShellPostAuditChange[];
  forbiddenPrefixes: readonly string[];
  checkWrite: (relPath: string) => { allowed: boolean; reason?: string };
}): ShellPostAuditChange[] {
  const out: ShellPostAuditChange[] = [];
  for (const change of input.changes) {
    if (isOutsideSnapshotPath(change.path)) {
      out.push(change);
      continue;
    }
    const rel = change.path.toLowerCase();
    if (rel === ".ans" || rel.startsWith(".ans/")) {
      out.push(change);
      continue;
    }
    const forbidden = input.forbiddenPrefixes.some((prefix) => {
      const p = prefix.toLowerCase();
      return prefix.endsWith("/") ? rel === p.slice(0, -1) || rel.startsWith(p) : rel === p;
    });
    if (forbidden) {
      out.push(change);
      continue;
    }
    if (input.checkWrite(change.path).allowed !== true) out.push(change);
  }
  return out;
}

// —————————————— 2026-11-05 审计归因修复（回执 ANS-AUDIT-2026-11-05-001） ——————————————
//
// 背景：时间窗 diff 无法区分「shell 命令造成」与「应用自身/并发会话合法写入」。应用在命令执行期间
// 持续写会话记录与账本（`.ans/sessions/`、`.ans/state/logs` 等），bootstrap/finalize 会重写
// `docs/bootstrap-manifest.md`；多角色并发时其他会话经写门禁的合法写入也会落进窗口。若一律按越界
// 上报，每条 shell 命令都会产生结构性假阳性（真机 I3/E0 阻塞即由此引起）。
//
// 归因规则：
//  · **应用运行态路径**（默认 `.ans/**` 与 `docs/bootstrap-manifest.md`）：变化作为
//    `appStateChanges` 记入审计记录（**仍被审计、可复核**），不作为越界；
//  · **其余变化**：先查进程内写日志（`write-journal.ts`，记录经写门禁的成功落盘 路径+sha）：命中 ⇒
//    `attributed`（合法工具写入，记入审计记录），未命中 ⇒ 越界（shell/外部进程写入）；
//  · `@outside:`/绝对/`..` 键与删除操作不做写日志归因（仍按越界/审计口径处理）。

/** 应用运行态前缀（默认值；调用方可覆盖）：应用自身持续写入的治理记录/运行数据区。 */
export const DEFAULT_APP_RUNTIME_PREFIXES: readonly string[] = [".ans/"];
/** 应用运行态单文件（默认值）：bootstrap/finalize 留痕清单。 */
export const DEFAULT_APP_RUNTIME_FILES: readonly string[] = ["docs/bootstrap-manifest.md"];

function isAppRuntimePath(rel: string, prefixes: readonly string[], files: readonly string[]): boolean {
  const value = rel.toLowerCase();
  if (files.some((file) => value === file.toLowerCase())) return true;
  return prefixes.some((prefix) => {
    const p = prefix.toLowerCase();
    return prefix.endsWith("/") ? value === p.slice(0, -1) || value.startsWith(p) : value === p;
  });
}

export interface ClassifiedChanges {
  violations: ShellPostAuditChange[];
  appStateChanges: ShellPostAuditChange[];
}

/** 分类：应用运行态变化与应用越界变化分开（纯函数）。 */
export function classifyTreeChanges(input: {
  changes: readonly ShellPostAuditChange[];
  forbiddenPrefixes: readonly string[];
  checkWrite: (relPath: string) => { allowed: boolean; reason?: string };
  appRuntimePrefixes?: readonly string[];
  appRuntimeFiles?: readonly string[];
}): ClassifiedChanges {
  const appRuntimePrefixes = input.appRuntimePrefixes ?? DEFAULT_APP_RUNTIME_PREFIXES;
  const appRuntimeFiles = input.appRuntimeFiles ?? DEFAULT_APP_RUNTIME_FILES;
  const violations: ShellPostAuditChange[] = [];
  const appStateChanges: ShellPostAuditChange[] = [];
  for (const change of input.changes) {
    if (!isOutsideSnapshotPath(change.path) && isAppRuntimePath(change.path, appRuntimePrefixes, appRuntimeFiles)) {
      appStateChanges.push(change);
      continue;
    }
    // 显式额外监视根（@outside）或防御性绝对/`..` 键：按越界记录；审计**不宣称**覆盖任意项目外写入
    // （项目外拦截由 static guard 与 judge 负责）。
    if (isOutsideSnapshotPath(change.path)) {
      violations.push(change);
      continue;
    }
    const rel = change.path.toLowerCase();
    // 禁写前缀（角色边界内不可写）：即使 checkWrite 被错误放宽也兜底。
    const forbidden = input.forbiddenPrefixes.some((prefix) => {
      const p = prefix.toLowerCase();
      return prefix.endsWith("/") ? rel === p.slice(0, -1) || rel.startsWith(p) : rel === p;
    });
    if (forbidden) {
      violations.push(change);
      continue;
    }
    if (input.checkWrite(change.path).allowed !== true) violations.push(change);
  }
  return { violations, appStateChanges };
}

/** 审计记录（JSONL；字段最小、无 stdout/stderr 正文）。 */
export interface ShellPostAuditRecord {
  v: 1;
  at: string;
  toolCallId: string;
  command: string;
  outcome: ShellExecutionOutcome;
  violations: ShellPostAuditChange[];
  /** 应用运行态写入（仍被审计、可复核；不按越界处理）。 */
  appStateChanges?: ShellPostAuditChange[];
  /** 经写日志归因的合法工具写入（并发会话/应用工具写）。 */
  attributed?: ShellPostAuditChange[];
}

export interface ShellPostAudit {
  /** 执行前快照（shell 闸在最终 allow 前调用；失败不阻塞执行，退化为空快照）。 */
  snapshotBefore(req: ShellReviewRequest): Promise<void>;
  /** 执行后对比并（发现越界时）写审计；返回越界清单（工具层如实暴露）。 */
  auditAfter(req: ShellReviewRequest, outcome: ShellExecutionOutcome): Promise<ShellPostAuditResult>;
}

export interface CreateShellPostAuditOptions {
  projectRoot: string;
  forbiddenPrefixes: readonly string[];
  checkWrite: (relPath: string) => { allowed: boolean; reason?: string };
  /** 审计落盘（缺省 `docs/audit/shell-gate.jsonl`；测试可注入内存收集器）。 */
  auditWriter?: (record: ShellPostAuditRecord) => Promise<void> | void;
  /** 快照注入（测试；缺省真实文件系统）。 */
  snapshot?: (input: { projectRoot: string }) => Promise<TreeSnapshot>;
  now?: () => Date;
  excludedPrefixes?: readonly string[];
  maxEntries?: number;
  /** 显式声明的额外监视根（如 skillRoot）。 */
  extraRoots?: readonly string[];
  /**
   * 2026-11-04（trunk-amendment S3/F33）：版本化文档冻结状态查询（同步）。生产注入 C2b
   * `versionedDocFreezeState`；缺省同源调用（快照未安装 ⇒ unknown ⇒ fail-closed 审计）。
   */
  freezeStateOf?: (relPath: string, exists: boolean) => DocFreezeLookupState;
  /** 应用运行态前缀（默认 `.ans/`）；其变化记入 `appStateChanges`，不按越界处理。 */
  appRuntimePrefixes?: readonly string[];
  /** 应用运行态单文件（默认 `docs/bootstrap-manifest.md`）。 */
  appRuntimeFiles?: readonly string[];
  /** 是否用写日志归因非应用路径的变化（默认 true；测试可关）。 */
  journalAttribution?: boolean;
  /** 时间源（毫秒；写日志归因窗口起点用；缺省 Date.now）。 */
  clock?: () => number;
}

export function createShellPostAudit(options: CreateShellPostAuditOptions): ShellPostAudit {
  const pending = new Map<string, { snapshot: TreeSnapshot; since: number }>();
  const now = options.now ?? (() => new Date());
  const clock = options.clock ?? (() => Date.now());
  const snapshot = options.snapshot ?? ((input) =>
    snapshotProjectTree({
      projectRoot: input.projectRoot,
      ...(options.excludedPrefixes !== undefined ? { excludedPrefixes: options.excludedPrefixes } : {}),
      ...(options.maxEntries !== undefined ? { maxEntries: options.maxEntries } : {}),
      ...(options.extraRoots !== undefined ? { extraRoots: options.extraRoots } : {}),
    }));

  const writeRecord = async (record: ShellPostAuditRecord): Promise<void> => {
    try {
      if (options.auditWriter !== undefined) {
        await options.auditWriter(record);
        return;
      }
      const file = path.join(options.projectRoot, "docs", "audit", "shell-gate.jsonl");
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
    } catch {
      /* 审计写失败只诊断（调用方在 run_shell 层记），绝不改变回执 */
    }
  };

  return {
    async snapshotBefore(req) {
      try {
        const snapshotTree = await snapshot({ projectRoot: options.projectRoot });
        pending.set(req.toolCallId, { snapshot: snapshotTree, since: clock() });
      } catch {
        /* 快照失败 ⇒ 不审计（不阻塞执行） */
      }
    },
    async auditAfter(req, outcome) {
      const beforeEntry = pending.get(req.toolCallId);
      pending.delete(req.toolCallId);
      if (beforeEntry === undefined) return { violations: [] };
      let after: TreeSnapshot;
      try {
        after = await snapshot({ projectRoot: options.projectRoot });
      } catch {
        return { violations: [] };
      }
      const changes = diffTreeSnapshots(beforeEntry.snapshot, after);
      const classified = classifyTreeChanges({
        changes,
        forbiddenPrefixes: options.forbiddenPrefixes,
        checkWrite: options.checkWrite,
        ...(options.appRuntimePrefixes !== undefined ? { appRuntimePrefixes: options.appRuntimePrefixes } : {}),
        ...(options.appRuntimeFiles !== undefined ? { appRuntimeFiles: options.appRuntimeFiles } : {}),
      });
      const violations = classified.violations;
      const appStateChanges = classified.appStateChanges;
      // 写日志归因（2026-11-05 归因修复）：窗口内经写门禁的合法落盘（含并发会话）不算越界；
      // 删除与 @outside 键不归因；命中项记入审计记录 attributed。
      const attributed: ShellPostAuditChange[] = [];
      if (options.journalAttribution !== false) {
        for (let index = violations.length - 1; index >= 0; index -= 1) {
          const change = violations[index]!;
          if (isOutsideSnapshotPath(change.path) || change.change === "deleted") continue;
          let sha256: string;
          try {
            const bytes = await fs.readFile(path.join(options.projectRoot, change.path));
            sha256 = createHash("sha256").update(bytes).digest("hex");
          } catch {
            continue;
          }
          if (wasWrittenByTool(path.join(options.projectRoot, change.path), sha256, beforeEntry.since)) {
            attributed.push(change);
            violations.splice(index, 1);
          }
        }
        attributed.sort((a, b) => a.path.localeCompare(b.path));
      }
      // 2026-11-04（trunk-amendment S3；C2b R9/F29/F33）：受管版本化文档按冻结状态分开判定——
      // · frozen：hash 漂移/删除 ⇒ 越界（不自动修复）；
      // · draft：原位改/新增版本为合法草稿 ⇒ **不误报**；删除已登记草稿 ⇒ 越界（C8 安全收窄，
      //   与 R9 verify 的 missing fail-closed 一致，不静默）；
      // · unknown/corrupt（快照未安装/损坏）⇒ fail-closed 越界（宁多报不放行）。
      // 已按应用运行态或写日志归因的变化不进入本判定（否则会把合法草稿/工具写误报为越界）。
      const observedPaths = new Set([
        ...violations.map((entry) => entry.path),
        ...appStateChanges.map((entry) => entry.path),
        ...attributed.map((entry) => entry.path),
      ]);
      const freezeStateOf =
        options.freezeStateOf ??
        ((relPath: string, exists: boolean) => versionedDocFreezeState(options.projectRoot, relPath, exists));
      for (const change of changes) {
        if (!isVersionedDocPath(change.path) || observedPaths.has(change.path)) continue;
        const existsAfter = change.change !== "deleted";
        const state = freezeStateOf(change.path, existsAfter);
        if (state === "draft") {
          if (change.change === "deleted") violations.push({ path: change.path, change: "deleted" });
          continue;
        }
        if (state === "unknown") {
          violations.push({ path: change.path, change: existsAfter ? "modified" : "deleted" });
          continue;
        }
        // frozen：冻结为终态（latest-record-per-path 的 baseline 比对）
        const baseline = await baselineShaFor(options.projectRoot, change.path);
        if (!baseline.ok || baseline.sha256 === undefined) {
          violations.push({ path: change.path, change: existsAfter ? "modified" : "deleted" });
          continue;
        }
        if (!existsAfter) {
          violations.push({ path: change.path, change: "deleted" });
          continue;
        }
        try {
          const bytes = await fs.readFile(path.join(options.projectRoot, change.path));
          const actual = createHash("sha256").update(bytes).digest("hex");
          if (actual !== baseline.sha256) violations.push({ path: change.path, change: "modified" });
        } catch {
          violations.push({ path: change.path, change: "deleted" });
        }
      }
      if (violations.length > 0 || appStateChanges.length > 0 || attributed.length > 0) {
        await writeRecord({
          v: 1,
          at: now().toISOString(),
          toolCallId: req.toolCallId,
          command: req.command,
          outcome,
          violations,
          ...(appStateChanges.length > 0 ? { appStateChanges } : {}),
          ...(attributed.length > 0 ? { attributed } : {}),
        });
      }
      return {
        violations,
        ...(appStateChanges.length > 0 ? { appStateChanges } : {}),
        ...(attributed.length > 0 ? { attributed } : {}),
      };
    },
  };
}
