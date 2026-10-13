// 项目管理主属：各运行层共用的本地诊断存储。只存元数据，固定滚动24小时。
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "./atomic-write.ts";

export const DIAGNOSTIC_RETENTION_MS = 24 * 60 * 60 * 1000;
export const DIAGNOSTIC_MAINTENANCE_MS = 60 * 1000;
const FILE_PATTERN = /^ans-diagnostics-\d{4}-\d{2}-\d{2}\.jsonl$/;
const FIELD_NAMES = new Set([
  "turnId", "toolCallId", "toolName", "path", "outcome", "durationMs", "ok",
  "errorType", "errorCode", "errorMessage", "requestId", "decision", "reasonCode",
  "state", "count", "queueDepth", "reportSource", "pid", "sourceRoleId", "targetRoleId",
  "sessionId", "phase", "mode", "replayPlan", "rowCount", "firstRow", "lastRow",
  "visibleCount", "pendingCount", "exitCode", "signal", "authorizationSource",
  "attempt", "supported", "busy", "resumed", "contextSource", "eventKind", "url",
]);

export interface DiagnosticContext { component: string; projectRoot?: string; roleId?: string }
export interface DiagnosticLogger {
  record(event: string, fields?: Record<string, unknown>): void;
  error(event: string, error: unknown, fields?: Record<string, unknown>): void;
}
interface Store {
  directory: string;
  clock: () => number;
  queue: Promise<void>;
  timer?: ReturnType<typeof setInterval>;
  lastCleanup: number;
  lastError?: string;
  closed: boolean;
}
let store: Store | undefined;

function scrub(text: string): string {
  let value = text;
  for (const [name, secret] of Object.entries(process.env)) {
    if (/token|secret|password|api_?key|auth/i.test(name) && secret && secret.length >= 4) {
      value = value.split(secret).join("[REDACTED]");
    }
  }
  value = value.replace(/\bBearer\s+[^\s,;"']+/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, "$1[REDACTED]@");
  return value.slice(0, 1024);
}

function safeFields(input?: Record<string, unknown>): Record<string, string | number | boolean> {
  const fields: Record<string, string | number | boolean> = {};
  if (!input) return fields;
  for (const name of FIELD_NAMES) {
    const value = input[name];
    if (typeof value === "string") fields[name] = scrub(value);
    else if (typeof value === "number" && Number.isFinite(value)) fields[name] = value;
    else if (typeof value === "boolean") fields[name] = value;
  }
  return fields;
}

function errorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    return {
      errorType: error.name,
      errorMessage: error.message,
      ...(typeof code === "string" || typeof code === "number" ? { errorCode: code } : {}),
    };
  }
  return { errorType: typeof error, errorMessage: typeof error === "string" ? error : "非Error异常" };
}

function enqueue(current: Store, work: () => Promise<void>): void {
  current.queue = current.queue.then(work).catch((error: unknown) => {
    const info = safeFields(errorFields(error));
    current.lastError = String(info.errorType ?? "Error") + ": " + String(info.errorMessage ?? "诊断写入失败");
    // 不能为记录日志使应用崩溃；保留可查询状态，stderr也只输出净化后的短错误。
    try { process.stderr.write("[ans-diagnostics] " + current.lastError + "\n"); } catch { /* IO已失败 */ }
  });
}

async function cleanup(current: Store, now: number): Promise<void> {
  await fs.mkdir(current.directory, { recursive: true, mode: 0o700 });
  const cutoff = now - DIAGNOSTIC_RETENTION_MS;
  const names = await fs.readdir(current.directory);
  for (const name of names) {
    if (!FILE_PATTERN.test(name)) continue;
    const file = path.join(current.directory, name);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    const original = await fs.readFile(file, "utf8");
    const lines = original.split("\n").filter((line) => line.trim() !== "");
    const kept = lines.filter((line) => {
      try {
        const row = JSON.parse(line) as { at?: unknown };
        return typeof row.at === "string" && Number.isFinite(Date.parse(row.at)) && Date.parse(row.at) >= cutoff;
      } catch { return false; }
    });
    if (kept.length === lines.length) continue;
    if (kept.length === 0) await fs.unlink(file);
    else await atomicWrite(file, kept.join("\n") + "\n", { mode: 0o600 });
  }
  current.lastCleanup = now;
}

/** 同步安装门面，启动清理串行入队；无需等IO才能启动应用。 */
export function configureDiagnostics(options: { directory: string; clock?: () => number }): void {
  const previous = store;
  if (previous) {
    previous.closed = true;
    if (previous.timer) clearInterval(previous.timer);
  }
  const current: Store = {
    directory: path.resolve(options.directory), clock: options.clock ?? Date.now,
    queue: previous?.queue ?? Promise.resolve(), lastCleanup: Number.NEGATIVE_INFINITY, closed: false,
  };
  store = current;
  enqueue(current, () => cleanup(current, current.clock()));
  current.timer = setInterval(() => {
    if (!current.closed) enqueue(current, () => cleanup(current, current.clock()));
  }, DIAGNOSTIC_MAINTENANCE_MS);
  current.timer.unref?.();
}

export function createDiagnosticLogger(context: DiagnosticContext): DiagnosticLogger {
  const record = (level: "info" | "error", event: string, fields?: Record<string, unknown>): void => {
    const current = store;
    if (!current || current.closed) return;
    try {
      const now = current.clock();
      const at = new Date(now).toISOString();
      const row = {
        at, level, pid: process.pid, component: scrub(context.component), event: scrub(event),
        ...(context.projectRoot ? { projectRoot: scrub(context.projectRoot) } : {}),
        ...(context.roleId ? { roleId: scrub(context.roleId) } : {}),
        ...safeFields(fields),
      };
      enqueue(current, async () => {
        // 写入检查维护期限。避免每条记录扫描整天日志，阻塞主进程或令日志队列二次增长。
        const writeNow = current.clock();
        if (writeNow - current.lastCleanup >= DIAGNOSTIC_MAINTENANCE_MS || writeNow < current.lastCleanup) {
          await cleanup(current, writeNow);
        }
        if (now < current.clock() - DIAGNOSTIC_RETENTION_MS) return;
        const file = path.join(current.directory, "ans-diagnostics-" + at.slice(0, 10) + ".jsonl");
        const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined;
          throw error;
        });
        if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error("诊断目标不是普通文件");
        await fs.appendFile(file, JSON.stringify(row) + "\n", { mode: 0o600 });
      });
    } catch (error) {
      current.lastError = String(safeFields(errorFields(error)).errorMessage ?? "诊断序列化失败");
    }
  };
  return {
    record(event, fields) { record("info", event, fields); },
    error(event, error, fields) { record("error", event, { ...fields, ...errorFields(error) }); },
  };
}

export function getDiagnosticsStatus(): { directory?: string; retentionMs: number; lastError?: string } {
  return { ...(store ? { directory: store.directory } : {}), retentionMs: DIAGNOSTIC_RETENTION_MS,
    ...(store?.lastError ? { lastError: store.lastError } : {}) };
}

export async function flushDiagnostics(): Promise<void> { await store?.queue; }
export async function disposeDiagnostics(): Promise<void> {
  const current = store;
  if (!current) return;
  current.closed = true;
  if (current.timer) clearInterval(current.timer);
  await current.queue;
  if (store === current) store = undefined;
}
