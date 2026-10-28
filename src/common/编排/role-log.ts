// src/common/编排/role-log.ts
// 编排主属（B 批，2026-10-28）：每角色运行日志。
//
// 路径：`.ans/state/logs/<roleId>.jsonl`（**app-only、append-only、每个内置角色一份**）。
// 写入点为轮次开始/结束、消息摘要、工具调用/结果、任务/申请状态、错误、投递、终止/重派；
// 由应用/运行时观察器写，**不依赖角色上报**（无心跳/report_progress）。
//
// 字段白名单 = 契约家 `model/runtime.ts` 的 `RoleLogEntry`（v/at/roleId/taskId/turnId/kind/tool/summary/status/ref）。
// 脱敏纪律（B-04）：
//   · 不写密钥/令牌/`.env` 值/完整 prompt/完整命令参数/凭据；
//   · 路径项目相对（项目根前缀被剥离；项目外绝对路径整体替换为 `[absolute-path]`）；
//   · 错误只写码/摘要；摘要压平单行、≤200 字；
//   · 读取只经 `role_activity_log`/`role_status`（桌面数据源调用本模块），角色不可直接读文件。
//
// 保留：默认 5 MB/30 天，轮转保留最近 N 份（env `ANS_ROLE_LOG_MAX_BYTES`/
// `ANS_ROLE_LOG_ROTATIONS`/`ANS_ROLE_LOG_RETENTION_DAYS`）。写失败不抛——返回 false 并由调用方记诊断。

import { promises as fs } from "node:fs";
import path from "node:path";
import type { RoleLogEntry } from "../../model/runtime.ts";
import { shortenSummary } from "./task-state.ts";

export const ROLE_LOGS_REL = ".ans/state/logs";
export const ROLE_LOG_MAX_BYTES_ENV = "ANS_ROLE_LOG_MAX_BYTES";
export const ROLE_LOG_ROTATIONS_ENV = "ANS_ROLE_LOG_ROTATIONS";
export const ROLE_LOG_RETENTION_DAYS_ENV = "ANS_ROLE_LOG_RETENTION_DAYS";
export const DEFAULT_ROLE_LOG_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_ROLE_LOG_ROTATIONS = 3;
export const DEFAULT_ROLE_LOG_RETENTION_DAYS = 30;
export const ROLE_LOG_SUMMARY_MAX = 200;
export const ROLE_ACTIVITY_DEFAULT_LIMIT = 50;
export const ROLE_ACTIVITY_MAX_LIMIT = 200;

const ROLE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TOOL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function roleLogLimits(): { maxBytes: number; rotations: number; retentionDays: number } {
  return {
    maxBytes: positiveInt(process.env[ROLE_LOG_MAX_BYTES_ENV], DEFAULT_ROLE_LOG_MAX_BYTES),
    rotations: positiveInt(process.env[ROLE_LOG_ROTATIONS_ENV], DEFAULT_ROLE_LOG_ROTATIONS),
    retentionDays: positiveInt(process.env[ROLE_LOG_RETENTION_DAYS_ENV], DEFAULT_ROLE_LOG_RETENTION_DAYS),
  };
}

/** 角色 id → 日志路径；非法 id（路径分隔符/空串/超长）返回 undefined（fail-closed）。 */
export function roleLogPath(projectRoot: string, roleId: string): string | undefined {
  if (typeof roleId !== "string" || !ROLE_ID_RE.test(roleId)) return undefined;
  return path.join(projectRoot, ...ROLE_LOGS_REL.split("/"), `${roleId}.jsonl`);
}

/** 项目根 → 可在摘要中剥离的前缀（POSIX 与 Windows 两种分隔符）。 */
function projectPrefixes(projectRoot: string): string[] {
  const normalized = path.resolve(projectRoot);
  return [...new Set([normalized, normalized.replace(/\\/g, "/"), normalized.replace(/\//g, "\\")])]
    .filter((prefix) => prefix !== "" && prefix !== "/" && prefix !== "\\");
}

const SECRET_PATTERNS: readonly [RegExp, string][] = [
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/g, "[redacted]"],
  [/\bgh[pousr]_[A-Za-z0-9]{8,}\b/g, "[redacted]"],
  [/\bAKIA[0-9A-Z]{12,}\b/g, "[redacted]"],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]"],
  [/((?:api[_-]?key|token|secret|password|passwd|authorization|cookie|credential|access[_-]?key)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[redacted]"],
  [/((?:ANTHROPIC|OPENAI|DEEPSEEK|GOOGLE|GEMINI|AWS|AZURE|GITHUB|GH)[A-Z0-9_]*\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/g, "$1[redacted]"],
];

/** 摘要脱敏/压平/截断（≤200 字）。 */
export function redactRoleLogSummary(text: unknown, projectRoot?: string): string {
  let value = String(text ?? "").replace(/[\r\n\u0000]+/g, " ");
  if (projectRoot !== undefined && projectRoot !== "") {
    for (const prefix of projectPrefixes(projectRoot)) {
      value = value.split(`${prefix}/`).join("").split(`${prefix}\\`).join("");
      value = value.split(prefix).join("");
    }
    value = value.replace(/^[\\/]+/, "");
  }
  for (const [pattern, replacement] of SECRET_PATTERNS) value = value.replace(pattern, replacement);
  // 项目外绝对路径：Windows 盘符 / POSIX 多级绝对路径（单段 `/tmp` 等也按外路径处理）。
  value = value.replace(/\b[A-Za-z]:[\\/][^\s"'`]+/g, "[absolute-path]");
  value = value.replace(/(^|[\s(])\/(?:[^\s"'`/]+\/)*[^\s"'`/]+/g, "$1[absolute-path]");
  value = value.replace(/\[absolute-path\](?:[\\/][^\s"'`]+)?/g, "[absolute-path]");
  return shortenSummary(value, ROLE_LOG_SUMMARY_MAX);
}

function cleanRef(value: unknown, projectRoot: string): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const redacted = redactRoleLogSummary(value, projectRoot);
  return redacted === "" ? undefined : redacted.slice(0, 200);
}

function cleanId(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value.replace(/[\r\n\u0000]/g, "").slice(0, 200);
}

export type AppendRoleLogInput = Omit<RoleLogEntry, "v" | "at" | "roleId" | "summary"> & {
  summary: string;
  at?: string;
};

type AppendResult = { ok: true; path: string } | { ok: false; message: string };

async function rotateIfNeeded(file: string, incomingBytes: number, maxBytes: number, rotations: number): Promise<boolean> {
  let size = 0;
  try {
    size = (await fs.stat(file)).size;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
  if (size + incomingBytes <= maxBytes) return false;
  for (let i = rotations; i >= 1; i -= 1) {
    const from = i === 1 ? file : `${file}.${i - 1}`;
    const to = `${file}.${i}`;
    try {
      await fs.rename(from, to);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  try {
    await fs.unlink(`${file}.${rotations + 1}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  return true;
}

/** 轮转删除超期文件（只删 `.N`；当前文件 append-only 不重写）。 */
export async function pruneRoleLogs(projectRoot: string, roleId: string, now: number = Date.now()): Promise<number> {
  const file = roleLogPath(projectRoot, roleId);
  if (file === undefined) return 0;
  const { rotations, retentionDays } = roleLogLimits();
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (let i = 1; i <= rotations; i += 1) {
    const candidate = `${file}.${i}`;
    try {
      const st = await fs.stat(candidate);
      if (st.mtimeMs < cutoff) {
        await fs.unlink(candidate);
        removed += 1;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  return removed;
}

/** 每文件追加串行链（同进程内不交错）。 */
const appendChains = new Map<string, Promise<unknown>>();

/**
 * 追加一条运行日志。字段白名单 + 脱敏在写入前完成；写失败返回 `{ok:false}`，**不抛**。
 * `kind`/`status` 只保留短 token 形态（防自由文本夹带凭据）。
 */
export function appendRoleLog(projectRoot: string, roleId: string, input: AppendRoleLogInput): Promise<AppendResult> {
  const file = roleLogPath(projectRoot, roleId);
  if (file === undefined) return Promise.resolve({ ok: false, message: `非法角色 id：${roleId}` });
  const kind = typeof input.kind === "string" ? input.kind.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 64) : "";
  if (kind === "") return Promise.resolve({ ok: false, message: "日志 kind 为空" });
  const entry: RoleLogEntry = {
    v: 1,
    at: typeof input.at === "string" && !Number.isNaN(Date.parse(input.at)) ? input.at : new Date().toISOString(),
    roleId,
    kind,
    summary: redactRoleLogSummary(input.summary, projectRoot),
  };
  const taskId = cleanId(input.taskId);
  if (taskId !== undefined) entry.taskId = taskId;
  const turnId = cleanId(input.turnId);
  if (turnId !== undefined) entry.turnId = turnId;
  if (typeof input.tool === "string" && TOOL_NAME_RE.test(input.tool)) entry.tool = input.tool;
  const status = cleanId(input.status);
  if (status !== undefined) entry.status = status.slice(0, 40);
  const ref = cleanRef(input.ref, projectRoot);
  if (ref !== undefined) entry.ref = ref;
  const line = `${JSON.stringify(entry)}\n`;
  const previous = appendChains.get(file) ?? Promise.resolve();
  const next = previous.then(async (): Promise<AppendResult> => {
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const { maxBytes, rotations } = roleLogLimits();
      const rotated = await rotateIfNeeded(file, Buffer.byteLength(line, "utf8"), maxBytes, rotations);
      await fs.appendFile(file, line, { encoding: "utf8", flag: "a" });
      if (rotated) {
        // 轮转发生时顺带清理超过保留期（默认 30 天）的 `.N` 旧文件；失败不影响本次写入。
        void pruneRoleLogs(projectRoot, roleId).catch(() => undefined);
      }
      return { ok: true, path: file };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  });
  const settled = next.then(() => undefined, () => undefined);
  appendChains.set(file, settled);
  void settled.finally(() => {
    if (appendChains.get(file) === settled) appendChains.delete(file);
  });
  return next;
}

export interface RoleLogReadResult {
  ok: boolean;
  entries: RoleLogEntry[];
  /** 跳过的坏行数（坏行不阻塞读取）。 */
  skipped: number;
  files: string[];
  message?: string;
}

const ROLE_LOG_KINDS_RE = /^[A-Za-z0-9_.-]{1,64}$/;

function validateRoleLogEntry(value: unknown): value is RoleLogEntry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  if (rec["v"] !== 1) return false;
  if (typeof rec["at"] !== "string" || Number.isNaN(Date.parse(rec["at"]))) return false;
  if (typeof rec["roleId"] !== "string" || rec["roleId"] === "") return false;
  if (typeof rec["kind"] !== "string" || !ROLE_LOG_KINDS_RE.test(rec["kind"])) return false;
  if (typeof rec["summary"] !== "string") return false;
  if (rec["tool"] !== undefined && (typeof rec["tool"] !== "string" || !TOOL_NAME_RE.test(rec["tool"]))) return false;
  return true;
}

/**
 * 读取角色日志（`.N` 旧 → 当前新），按 `since` 过滤并取最近 `limit` 条。
 * 返回**按时间正序**的条目；坏行计入 `skipped`。文件不存在 ⇒ `ok:true` + 空（不是错误）。
 */
export async function readRoleLog(
  projectRoot: string,
  query: { roleId: string; since?: string; limit?: number },
): Promise<RoleLogReadResult> {
  const file = roleLogPath(projectRoot, query.roleId);
  if (file === undefined) return { ok: false, entries: [], skipped: 0, files: [], message: `非法角色 id：${query.roleId}` };
  const sinceMs = typeof query.since === "string" && query.since !== "" ? Date.parse(query.since) : Number.NaN;
  const requested = typeof query.limit === "number" && Number.isFinite(query.limit) ? Math.floor(query.limit) : ROLE_ACTIVITY_DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, requested), ROLE_ACTIVITY_MAX_LIMIT);
  const { rotations } = roleLogLimits();
  const files: string[] = [];
  for (let i = rotations; i >= 1; i -= 1) {
    try {
      await fs.access(`${file}.${i}`);
      files.push(`${file}.${i}`);
    } catch { /* 不存在 */ }
  }
  files.push(file);
  const entries: RoleLogEntry[] = [];
  let skipped = 0;
  for (const source of files) {
    let raw: string;
    try {
      raw = await fs.readFile(source, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      return { ok: false, entries: [], skipped, files: files.map((f) => path.basename(f)), message: err instanceof Error ? err.message : String(err) };
    }
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim() === "") continue;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        skipped += 1;
        continue;
      }
      if (!validateRoleLogEntry(value) || value.roleId !== query.roleId) {
        skipped += 1;
        continue;
      }
      if (Number.isFinite(sinceMs) && Date.parse(value.at) < sinceMs) continue;
      entries.push(value);
    }
  }
  const tail = entries.slice(Math.max(0, entries.length - limit));
  return { ok: true, entries: tail, skipped, files: files.map((f) => path.basename(f)) };
}

/** 最近活动时间（ISO）；无日志/读失败 ⇒ undefined。 */
export async function lastRoleActivityAt(projectRoot: string, roleId: string): Promise<string | undefined> {
  const read = await readRoleLog(projectRoot, { roleId, limit: 1 });
  return read.ok ? read.entries[read.entries.length - 1]?.at : undefined;
}

/** `role_activity_log` 的结构化文本（头部如实给来源/总条数/跳过坏行数）。 */
export function formatRoleActivityText(result: RoleLogReadResult, roleId: string): string {
  if (!result.ok) return `角色 ${roleId} 的运行日志**读取未完成**：${result.message ?? "未知原因"}`;
  const lines = [
    `角色 ${roleId} 的运行日志（最近 ${result.entries.length} 条；来源 ${result.files.join("、")}；跳过坏行 ${result.skipped} 条）`,
  ];
  if (result.entries.length === 0) {
    lines.push("（暂无日志）");
    return lines.join("\n");
  }
  for (const entry of result.entries) {
    const bits = [entry.at, entry.kind];
    if (entry.tool !== undefined) bits.push(entry.tool);
    if (entry.status !== undefined) bits.push(`status=${entry.status}`);
    if (entry.taskId !== undefined) bits.push(`task=${entry.taskId}`);
    lines.push(`${bits.join(" | ")} | ${entry.summary}${entry.ref !== undefined ? ` | ref=${entry.ref}` : ""}`);
  }
  return lines.join("\n");
}
