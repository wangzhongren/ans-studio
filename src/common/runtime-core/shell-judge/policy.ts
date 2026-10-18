// 判断 agent（「替我审」）只读路径策略。Owner: 运行时核心。
//
// 硬策略在此层、**不靠模型自觉**：真实路径解析（realpath）＋项目根前缀（win32 大小写不敏感）＋
// 敏感文件/目录排除（请求路径与真实路径都查）＋二进制拒绝＋单文件/总读取预算。
//
// **不得复用** `provider/runtime/tools.ts::makeReadTool`：它只做 `resolve(readRoot, path)`，没有项目根
// 校验、没有敏感排除、绝对路径原样读（PM 评审 §三「明确返工点」）。
//
// 本模块只给运行时核心的 judge 工具内部消费，不跨角色导出为公共契约。

import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ShellJudgeReadStats } from "../../../model/runtime.ts";

/** 缺省预算（PM 评审 §五/§七钉死）：8 次调用、单文件 64KB、总读取 192KB。 */
export const SHELL_JUDGE_DEFAULT_BUDGET = Object.freeze({
  maxCalls: 8,
  maxBytes: 192 * 1024,
  maxFileBytes: 64 * 1024,
});

export interface ShellJudgeBudget {
  maxCalls: number;
  maxBytes: number;
  maxFileBytes: number;
}

/** 单次列表最多展示条目数（PM 评审 §7.1）。 */
export const SHELL_JUDGE_MAX_LIST_ENTRIES = 200;

/** `ShellJudgeReadStats.readPaths` 上限（2026-10-18 双开关评审 §5.4：去重、最多 16 条）。 */
export const SHELL_JUDGE_MAX_READ_PATHS = 16;

/** 二进制探测窗口（PM 评审 §7.2：前 8KB 含 NUL 即拒绝）。 */
const BINARY_PROBE_BYTES = 8 * 1024;

/** 拒绝原因码（工具层据此给模型人话；**不回显绝对路径**）。 */
export type JudgeReadCode =
  | "empty"
  | "invalid-path"
  | "outside-root"
  | "sensitive"
  /** 应用私有数据（整棵 `.ans/**`）：与普通敏感文件区分，便于审计/诊断（评审 §6.3）。 */
  | "app-private"
  | "not-found"
  | "not-a-file"
  | "not-a-directory"
  | "binary"
  | "budget"
  | "read-failed";

/** 路径类别（诊断/文案用；**不携带原路径**）。 */
export type JudgePathClass =
  | "env"
  | "key-material"
  | "credential"
  | "credential-dir"
  | "vcs"
  | "audit"
  /** 历史值：`.ans/sessions` 曾为独立类别；现整棵 `.ans/**` 一律 `app-private`（保留联合成员兼容旧读者）。 */
  | "session"
  /** 应用私有数据（整棵 `.ans/**`：账本/会话/应用文件；2026-10-18 双开关评审 §6.3 硬排除）。 */
  | "app-private"
  | "outside-root"
  | "binary"
  | "non-regular"
  | "budget"
  | "unknown";

export type JudgeReadResolution =
  | { ok: true; abs: string; rel: string; truncated: boolean; text: string; bytes: number }
  | { ok: false; code: JudgeReadCode; pathClass: JudgePathClass };

export type JudgeListResolution =
  | { ok: true; abs: string; rel: string; entries: string[]; truncated: boolean }
  | { ok: false; code: JudgeReadCode; pathClass: JudgePathClass };

export interface JudgeReadInput {
  projectRoot: string;
  path: string;
  stats: ShellJudgeReadStats;
  budget?: Partial<ShellJudgeBudget> | undefined;
}

export interface JudgeListInput {
  projectRoot: string;
  path?: string | undefined;
  stats: ShellJudgeReadStats;
  budget?: Partial<ShellJudgeBudget> | undefined;
}

const KEY_EXTENSIONS = new Set([".key", ".pem", ".p12", ".pfx", ".jks", ".keystore"]);
const CREDENTIAL_NAME = /(credential|secret|token|password|passwd|api[-_]?key|apikey)/i;
const CREDENTIAL_DIRS = new Set([".ssh", ".aws", ".azure", ".gnupg"]);

export function resolveBudget(budget?: Partial<ShellJudgeBudget> | undefined): ShellJudgeBudget {
  const positive = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  return {
    maxCalls: positive(budget?.maxCalls, SHELL_JUDGE_DEFAULT_BUDGET.maxCalls),
    maxBytes: positive(budget?.maxBytes, SHELL_JUDGE_DEFAULT_BUDGET.maxBytes),
    maxFileBytes: positive(budget?.maxFileBytes, SHELL_JUDGE_DEFAULT_BUDGET.maxFileBytes),
  };
}

/**
 * 敏感 basename / 目录段判定（大小写不敏感）。
 * 覆盖：`.env`/`.env.*`/`.envrc`、私钥/证书扩展名、凭据/令牌文件名、凭据目录、`.git/`、
 * `docs/audit/`、**整棵 `.ans/`（任何 `.ans` 段 ⇒ `app-private`；含账本/会话/应用文件）**、
 * `.config/gcloud/`、`.kube/config`、`.docker/config.json`。
 * **宁可误排除，也不漏读凭据**（PM 评审 §7.2 硬要求）。
 *
 * 2026-10-18 双开关评审 §6.3 收紧：`.ans` 由「只排除 `.ans/sessions`」改为**整体硬排除**
 * （判断 agent 不读账本/会话/应用文件；shell judge 同受益，属更严不属回归）。
 */
export function sensitiveClass(segments: readonly string[]): JudgePathClass | undefined {
  const lower = segments.map((segment) => segment.toLowerCase());
  for (let index = 0; index < lower.length; index++) {
    const name = lower[index]!;
    if (name === ".env" || name.startsWith(".env.") || name === ".envrc") return "env";
    if (KEY_EXTENSIONS.has(name.slice(name.lastIndexOf(".")))) return "key-material";
    if (name === ".git") return "vcs";
    if (CREDENTIAL_DIRS.has(name)) return "credential-dir";
    if (CREDENTIAL_NAME.test(name)) return "credential";
    const next = lower[index + 1];
    if (name === "docs" && next === "audit") return "audit";
    // 任何 `.ans` 段即应用私有数据（整棵 `.ans/**`；先于历史 `.ans/sessions` 判断）。
    if (name === ".ans") return "app-private";
    if (name === ".config" && next === "gcloud") return "credential-dir";
    if (name === ".kube" && next === "config") return "credential";
    if (name === ".docker" && next === "config.json") return "credential";
  }
  return undefined;
}

/** 单个目录项是否敏感（用于 `judge_list_dir` 不列名；`parent` 为项目根内相对段）。 */
export function sensitiveEntry(parent: readonly string[], name: string): boolean {
  return sensitiveClass([...parent, name]) !== undefined;
}

type RawPathCheck = { ok: true } | { ok: false; code: JudgeReadCode; pathClass: JudgePathClass };

/** 第一步：原始路径拒绝集（空串/NUL/`..`/win32 盘符相对、ADS）。 */
function checkRawPath(raw: unknown): RawPathCheck {
  if (typeof raw !== "string" || raw.trim() === "") return { ok: false, code: "empty", pathClass: "unknown" };
  if (raw.includes("\u0000")) return { ok: false, code: "invalid-path", pathClass: "unknown" };
  // `..` 段一律拒绝（即便解析后仍在根内——减少绕过面；PM 评审 §7.2）。
  if (raw.replaceAll("\\", "/").split("/").some((segment) => segment === "..")) {
    return { ok: false, code: "outside-root", pathClass: "outside-root" };
  }
  if (process.platform === "win32") {
    const driveAbsolute = /^[A-Za-z]:[\\/]/.test(raw);
    const rest = driveAbsolute ? raw.slice(2) : raw;
    // 盘符相对（`C:foo`）、ADS（`file.txt:stream`）均含裸冒号 → 拒绝。
    if (rest.includes(":")) return { ok: false, code: "invalid-path", pathClass: "unknown" };
    if (!driveAbsolute && /^[A-Za-z]:/.test(raw)) return { ok: false, code: "invalid-path", pathClass: "unknown" };
  }
  return { ok: true };
}

function slashPath(value: string): string {
  return value.split(sep).join("/");
}

function segmentsOf(value: string): string[] {
  return value.split(/[\\/]+/).filter((segment) => segment.length > 0);
}

function compareRoot(real: string, rootReal: string): boolean {
  const left = process.platform === "win32" ? real.toLowerCase() : real;
  const right = process.platform === "win32" ? rootReal.toLowerCase() : rootReal;
  const rel = relative(right, left);
  return !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

function denied(code: JudgeReadCode, pathClass: JudgePathClass, stats: ShellJudgeReadStats): { ok: false; code: JudgeReadCode; pathClass: JudgePathClass } {
  stats.deniedReads += 1;
  return { ok: false, code, pathClass };
}

/** 敏感类拒绝：`.ans/**`（app-private）用独立原因码，其余仍 `sensitive`（评审 §6.3）。 */
function deniedSensitive(pathClass: JudgePathClass, stats: ShellJudgeReadStats): { ok: false; code: JudgeReadCode; pathClass: JudgePathClass } {
  return denied(pathClass === "app-private" ? "app-private" : "sensitive", pathClass, stats);
}

/** 请求路径的敏感检查只看项目根内的相对段；根外路径交给前缀校验（不把用户名/盘符当敏感名）。 */
function requestedSegments(projectRoot: string, requested: string): string[] {
  const root = resolve(projectRoot);
  const rel = relative(root, requested);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return [];
  return segmentsOf(rel);
}

/** 预算耗尽＝**独立原因码 `budget`**（不并入 `deniedReads`＝read-denied 统计）；编排以 `budgetExceeded` 优先判 `budget`。 */
function budgetDenied(stats: ShellJudgeReadStats): { ok: false; code: "budget"; pathClass: "budget" } {
  stats.budgetExceeded = true;
  return { ok: false, code: "budget", pathClass: "budget" };
}

function consumeCall(stats: ShellJudgeReadStats, budget: ShellJudgeBudget): boolean {
  stats.readCalls += 1;
  if (stats.readCalls > budget.maxCalls || stats.readBytes >= budget.maxBytes) return false;
  return true;
}

/**
 * 记录一次成功读取的项目相对路径（去重；上限 `SHELL_JUDGE_MAX_READ_PATHS`）。
 * 只记录成功读取（被拒/预算/二进制不记录）——治理 judge 的 required-read 门槛依赖这份事实。
 * 字段可选：调用方没初始化时在此按需创建（不改变旧读者的既有统计语义）。
 */
function recordReadPath(stats: ShellJudgeReadStats, rel: string): void {
  const list = (stats.readPaths ??= []);
  if (list.includes(rel) || list.length >= SHELL_JUDGE_MAX_READ_PATHS) return;
  list.push(rel);
}

function utf8Prefix(data: Buffer): string {
  if (data.length === 0) return "";
  // 截断可能切在多字节序列中间：回退到最近的可解码前缀（不产生替换字符糊）。
  let end = data.length;
  let continuation = 0;
  while (end > 0 && (data[end - 1]! & 0xc0) === 0x80) {
    end -= 1;
    continuation += 1;
  }
  if (end > 0 && (data[end - 1]! & 0x80) !== 0) {
    const lead = data[end - 1]!;
    const expected = lead >= 0xf0 ? 3 : lead >= 0xe0 ? 2 : lead >= 0xc0 ? 1 : 0;
    if (continuation < expected) end -= 1;
  }
  return data.subarray(0, end).toString("utf8");
}

/**
 * `judge_read_file` 的解析与读取（PM 评审 §7.3 钉死顺序）。
 * 成功返回 `{ok:true, abs, rel, truncated, text, bytes}`；失败返回 `{ok:false, code, pathClass}`
 * （**不回显绝对路径**）。读取/拒绝统计累加进 `input.stats`。
 */
export async function resolveJudgeRead(input: JudgeReadInput): Promise<JudgeReadResolution> {
  const budget = resolveBudget(input.budget);
  const stats = input.stats;
  const raw = checkRawPath(input.path);
  if (!raw.ok) return denied(raw.code, raw.pathClass, stats);
  if (!consumeCall(stats, budget)) return budgetDenied(stats);

  const requested = isAbsolute(input.path) ? input.path : resolve(input.projectRoot, input.path);
  // 请求路径本身也做敏感检查（防「真实路径别名」在解析前就被当成普通文件）。
  const requestedSensitive = sensitiveClass(requestedSegments(input.projectRoot, requested));
  if (requestedSensitive !== undefined) return deniedSensitive(requestedSensitive, stats);

  let rootReal: string;
  let real: string;
  try {
    rootReal = await realpath(input.projectRoot);
    real = await realpath(requested);
  } catch {
    return denied("not-found", "unknown", stats);
  }
  if (!compareRoot(real, rootReal)) return denied("outside-root", "outside-root", stats);

  const rel = relative(rootReal, real);
  if (rel === "") return denied("not-a-file", "non-regular", stats);
  // 真实路径的每一段再查（防 `.env` 被链接成 `config.txt`）。
  const realSensitive = sensitiveClass(segmentsOf(rel));
  if (realSensitive !== undefined) return deniedSensitive(realSensitive, stats);

  let info;
  try {
    info = await lstat(real);
  } catch {
    return denied("not-found", "unknown", stats);
  }
  if (!info.isFile()) return denied("not-a-file", "non-regular", stats);

  const remaining = budget.maxBytes - stats.readBytes;
  const cap = Math.min(budget.maxFileBytes, remaining);
  if (cap <= 0) return budgetDenied(stats);

  let data: Buffer;
  try {
    const handle = await open(real, "r");
    try {
      const buffer = Buffer.alloc(cap);
      const { bytesRead } = await handle.read(buffer, 0, cap, 0);
      data = buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    return denied("read-failed", "unknown", stats);
  }
  if (data.subarray(0, Math.min(BINARY_PROBE_BYTES, data.length)).includes(0)) {
    return denied("binary", "binary", stats);
  }

  const truncated = info.size > data.length || (data.length === cap && info.size > cap);
  stats.readBytes += data.length;
  if (truncated) stats.truncatedReads += 1;
  // 总预算被本次读取吃满（cap 被 remaining 限制）⇒ 后续读取一律预算拒绝（PM 评审 §7.2）。
  if (stats.readBytes >= budget.maxBytes && info.size > data.length) stats.budgetExceeded = true;

  const relSlash = slashPath(rel);
  recordReadPath(stats, relSlash);
  return { ok: true, abs: real, rel: relSlash, truncated, text: utf8Prefix(data), bytes: data.length };
}

/**
 * `judge_list_dir` 的解析与单层列举：只列一层、敏感项**不列名**、目录加 `/`、最多 200 项。
 * 统计与预算同 `resolveJudgeRead`（共用 `readCalls` 计数）。
 */
export async function resolveJudgeList(input: JudgeListInput): Promise<JudgeListResolution> {
  const budget = resolveBudget(input.budget);
  const stats = input.stats;
  const rawPath = input.path === undefined || input.path.trim() === "" ? "." : input.path;
  const raw = checkRawPath(rawPath);
  if (!raw.ok) return denied(raw.code, raw.pathClass, stats);
  if (!consumeCall(stats, budget)) return budgetDenied(stats);

  const requested = isAbsolute(rawPath) ? rawPath : resolve(input.projectRoot, rawPath);
  const requestedSensitive = sensitiveClass(requestedSegments(input.projectRoot, requested));
  if (requestedSensitive !== undefined) return deniedSensitive(requestedSensitive, stats);

  let rootReal: string;
  let real: string;
  try {
    rootReal = await realpath(input.projectRoot);
    real = await realpath(requested);
  } catch {
    return denied("not-found", "unknown", stats);
  }
  if (!compareRoot(real, rootReal)) return denied("outside-root", "outside-root", stats);

  const rel = relative(rootReal, real);
  const relSegments = segmentsOf(rel);
  const realSensitive = sensitiveClass(relSegments);
  if (realSensitive !== undefined) return deniedSensitive(realSensitive, stats);

  let info;
  try {
    info = await lstat(real);
  } catch {
    return denied("not-found", "unknown", stats);
  }
  if (!info.isDirectory()) return denied("not-a-directory", "non-regular", stats);

  let names: string[];
  try {
    names = (await readdir(real)).filter((name) => !sensitiveEntry(relSegments, name)).sort((a, b) => a.localeCompare(b));
  } catch {
    return denied("read-failed", "unknown", stats);
  }

  const truncated = names.length > SHELL_JUDGE_MAX_LIST_ENTRIES;
  const visible = names.slice(0, SHELL_JUDGE_MAX_LIST_ENTRIES);
  const entries: string[] = [];
  for (const name of visible) {
    let isDirectory = false;
    try {
      isDirectory = (await lstat(resolve(real, name))).isDirectory();
    } catch {
      // 读不到的条目（竞态/坏链接）不猜测，按普通名列出（读取时仍会被策略拦截）。
    }
    entries.push(isDirectory ? `${name}/` : name);
  }

  return { ok: true, abs: real, rel: rel === "" ? "." : slashPath(rel), entries, truncated };
}
