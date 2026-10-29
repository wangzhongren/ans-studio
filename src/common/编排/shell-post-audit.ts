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
import { baselineShaFor, isVersionedDocPath } from "../门禁引擎/versioned-doc-guard.ts";

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

/** 判定越界变化（与写区同一 `checkWrite`；禁写前缀先判）。 */
export function findOutOfBoundChanges(input: {
  changes: readonly ShellPostAuditChange[];
  forbiddenPrefixes: readonly string[];
  checkWrite: (relPath: string) => { allowed: boolean; reason?: string };
}): ShellPostAuditChange[] {
  const out: ShellPostAuditChange[] = [];
  for (const change of input.changes) {
    // 显式额外监视根（@outside）或防御性绝对/`..` 键：按越界记录；审计**不宣称**覆盖任意项目外写入
    // （项目外拦截由 static guard 与 judge 负责）。
    if (isOutsideSnapshotPath(change.path)) {
      out.push(change);
      continue;
    }
    const rel = change.path.toLowerCase();
    // 应用独占治理记录区：任何角色写入都越界（即使 checkWrite 被错误放宽也兜底）。
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

/** 审计记录（JSONL；字段最小、无 stdout/stderr 正文）。 */
export interface ShellPostAuditRecord {
  v: 1;
  at: string;
  toolCallId: string;
  command: string;
  outcome: ShellExecutionOutcome;
  violations: ShellPostAuditChange[];
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
}

export function createShellPostAudit(options: CreateShellPostAuditOptions): ShellPostAudit {
  const pending = new Map<string, TreeSnapshot>();
  const now = options.now ?? (() => new Date());
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
        pending.set(req.toolCallId, await snapshot({ projectRoot: options.projectRoot }));
      } catch {
        /* 快照失败 ⇒ 不审计（不阻塞执行） */
      }
    },
    async auditAfter(req, outcome) {
      const before = pending.get(req.toolCallId);
      pending.delete(req.toolCallId);
      if (before === undefined) return { violations: [] };
      let after: TreeSnapshot;
      try {
        after = await snapshot({ projectRoot: options.projectRoot });
      } catch {
        return { violations: [] };
      }
      const changes = diffTreeSnapshots(before, after);
      const violations = findOutOfBoundChanges({
        changes,
        forbiddenPrefixes: options.forbiddenPrefixes,
        checkWrite: options.checkWrite,
      });
      // R9：受管版本化文档与 baseline 比对——shell/外部写入导致旧版变化 ⇒ 越界审计。
      for (const change of changes) {
        if (!isVersionedDocPath(change.path) || violations.some((entry) => entry.path === change.path)) continue;
        const baseline = await baselineShaFor(options.projectRoot, change.path);
        if (!baseline.ok || baseline.sha256 === undefined) {
          violations.push({ path: change.path, change: change.change === "deleted" ? "deleted" : "modified" });
          continue;
        }
        if (change.change === "deleted") {
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
      if (violations.length > 0) {
        await writeRecord({
          v: 1,
          at: now().toISOString(),
          toolCallId: req.toolCallId,
          command: req.command,
          outcome,
          violations,
        });
      }
      return { violations };
    },
  };
}
