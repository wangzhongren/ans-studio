// 判断 agent（「替我审」）只读路径策略。Owner: 运行时核心。
//
// 硬策略在此层、**不靠模型自觉**：真实路径解析（realpath）＋项目根前缀（win32 大小写不敏感）＋
// 敏感文件/目录排除（请求路径与真实路径都查）＋二进制拒绝＋单文件/总读取预算。
//
// **不得复用** `provider/runtime/tools.ts::makeReadTool`：它只做 `resolve(readRoot, path)`，没有项目根
// 校验、没有敏感排除、绝对路径原样读（PM 评审 §三「明确返工点」）。
//
// 除登记的跨角色只读契约 `ShellJudgeBudget` / `resolveShellJudgeBudget` 外（编排只读导入，把实际生效
// 预算注入判断提示），本模块只给运行时核心的 judge 工具内部消费，不跨角色导出为公共契约。

import { lstat, open, readdir, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { JudgePathClass, JudgeReadCode, ShellJudgeBudget, ShellJudgeReadStats } from "../../../model/runtime.ts";

// 中立契约家（`model/runtime.ts`）是 `JudgeReadCode`/`JudgePathClass`/`ShellJudgeBudget` 的定义来源
// （`ShellJudgeReadStats.deniedPaths` 需要引用；`ShellJudgeBudget` 是 2026-10-19 登记的跨角色只读契约）。
// 本模块保持原来的导出面，旧 import 路径不变、**不保留第二份定义**（single source of truth）。
export type { JudgePathClass, JudgeReadCode, ShellJudgeBudget };

/**
 * 缺省预算（2026-10-19 真机放宽）：12 次调用、单文件 128KiB、总读取 512KiB。
 *
 * PM 评审 §五/§七原定 8 次 / 64KiB / 192KiB；真机 Proof 复核时判断 agent 连续读几个
 * 验证文件（curl 输出、日志、源文件）即报「读取预算已用尽」回落手动，判断无法完成。
 * 新默认覆盖一次典型验证的读取量（约 4 个满额文件或 12 次小范围抽查），仍是**有限值**：
 * 超过即 fail-closed 转手动。宿主/部署可用 `ANS_SHELL_JUDGE_MAX_*` 环境变量在上下限内覆盖
 * （见 `resolveShellJudgeBudget`）；不接受无限预算。
 */
export const SHELL_JUDGE_DEFAULT_BUDGET = Object.freeze({
  maxCalls: 12,
  maxBytes: 512 * 1024,
  maxFileBytes: 128 * 1024,
  /** 行范围定位扫描上限（2026-10-19 定点抽查）：找 startLine 最多扫描 8MiB，超出如实拒绝。 */
  maxScanBytes: 8 * 1024 * 1024,
});

// `ShellJudgeBudget` 定义在 `../../../model/runtime.ts`（跨角色只读契约，本模块 re-export 同一符号）。

/** 单次列表最多展示条目数（PM 评审 §7.1）。 */
export const SHELL_JUDGE_MAX_LIST_ENTRIES = 200;

/** `ShellJudgeReadStats.readPaths` 上限（2026-10-18 双开关评审 §5.4：去重、最多 16 条）。 */
export const SHELL_JUDGE_MAX_READ_PATHS = 16;

/** `ShellJudgeReadStats.deniedPaths` 上限（2026-10-18 客户反馈：诊断去重、最多 16 条）。 */
export const SHELL_JUDGE_MAX_DENIED_PATHS = 16;

/**
 * 判断 agent 在 `.ans/**` 中**只读开放**的精确文件（2026-10-18 客户裁定）：
 * 仅 `.ans/project.json`。其余 `.ans` 内容（含 `.ans/sessions/**` 会话转录与治理运行数据）继续
 * `app-private` 拒绝。D 批已撤除治理账本，不再对任何账本文件开放读取。
 */
const JUDGE_ANS_READ_ALLOW = new Set([".ans/project.json"]);

function segmentsKey(segments: readonly string[]): string {
  return segments.map((segment) => segment.toLowerCase()).join("/");
}

function isAnsReadAllowed(segments: readonly string[]): boolean {
  return JUDGE_ANS_READ_ALLOW.has(segmentsKey(segments));
}

/** 二进制探测窗口（PM 评审 §7.2：前 8KB 含 NUL 即拒绝）。 */
const BINARY_PROBE_BYTES = 8 * 1024;

export type JudgeReadResolution =
  | {
      ok: true;
      abs: string;
      rel: string;
      truncated: boolean;
      text: string;
      bytes: number;
      /** 文件总字节数（供范围标注；无范围读取也返回，旧读者忽略）。 */
      totalBytes: number;
      /** 本次实际返回的范围（2026-10-19 定点抽查）；未带范围参数时缺省。 */
      range?: JudgeReadRangeSummary | undefined;
    }
  | { ok: false; code: JudgeReadCode; pathClass: JudgePathClass };

/**
 * 实际返回范围的事实（2026-10-19 定点抽查）。工具据此如实标注「读了哪一段」；
 * **不参与**敏感/越界判定（判定在读取前完成）。
 */
export type JudgeReadRangeSummary =
  | {
      kind: "bytes";
      /** 实际返回的起始字节（0 基）。 */
      offset: number;
      /** 实际返回的结束字节（不含）。 */
      end: number;
      /** 文件总字节数。 */
      totalBytes: number;
    }
  | {
      kind: "lines";
      /** 实际返回的起始行（1 基）。 */
      startLine: number;
      /** 实际返回的末行（1 基，含）；被预算截断时缺省（末行可能不完整）。 */
      endLine?: number;
      /** 文件总行数（扫描到 EOF 时可知；请求范围在 EOF 前结束则缺省）。 */
      totalLines?: number;
      /** 请求的结束行（含）；缺省＝至文件末尾/预算上限。 */
      requestedEndLine?: number;
      /** 请求的结束行超出文件末尾，实际范围已收敛到文件末行（不是预算截断）。 */
      clampedToEof?: boolean;
    };

export type JudgeListResolution =
  | { ok: true; abs: string; rel: string; entries: string[]; truncated: boolean }
  | { ok: false; code: JudgeReadCode; pathClass: JudgePathClass };

/**
 * `judge_read_file` 的可选范围参数（2026-10-19 客户反馈：判断 agent 应「定点抽查」，
 * 而不是把全部文件灌进上下文）。原始值以 `unknown` 传入，由本层**硬校验**：
 * - 字节模式：`offset`（0 基，≥0）＋`limit`（≥1，可选；缺省＝预算上限）；
 * - 行模式：`startLine`/`endLine`（1 基、含端点，≥1）；
 * - 两种模式**互斥**；字段缺省＝未指定。
 */
export interface JudgeReadRangeInput {
  offset?: unknown;
  limit?: unknown;
  startLine?: unknown;
  endLine?: unknown;
}

export interface JudgeReadInput {
  projectRoot: string;
  path: string;
  stats: ShellJudgeReadStats;
  budget?: Partial<ShellJudgeBudget> | undefined;
  /**
   * 单次判断会话内的读取缓存（2026-10-19）：同一请求路径＋同一范围重复读取复用首次结果，
   * 不再重复读盘；预算/统计口径与真实读取一致（仍计调用与字节）。缺省＝不缓存。
   */
  cache?: JudgeReadCache | undefined;
  /** 可选范围参数；缺省＝既有整文件读取（行为与上限逐字不变）。 */
  range?: JudgeReadRangeInput | undefined;
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

/** 预算环境变量（2026-10-19 真机放宽）：只由工厂在**构造判断会话时**读取，不进模型可见能力。 */
export const SHELL_JUDGE_MAX_CALLS_ENV = "ANS_SHELL_JUDGE_MAX_CALLS";
export const SHELL_JUDGE_MAX_BYTES_ENV = "ANS_SHELL_JUDGE_MAX_BYTES";
export const SHELL_JUDGE_MAX_FILE_BYTES_ENV = "ANS_SHELL_JUDGE_MAX_FILE_BYTES";

/**
 * env 覆盖的上下限（2026-10-19）：非法（非纯十进制正整数/越界）一律回落缺省，**不静默夹取**，
 * 也不接受无限预算——误配成 `999999999` 不能让判断会话获得无界读取能力。
 */
export const SHELL_JUDGE_BUDGET_LIMITS = Object.freeze({
  maxCalls: Object.freeze({ min: 1, max: 64 }),
  maxBytes: Object.freeze({ min: 1024, max: 16 * 1024 * 1024 }),
  maxFileBytes: Object.freeze({ min: 1024, max: 4 * 1024 * 1024 }),
});

function positiveFloor(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

export function resolveBudget(budget?: Partial<ShellJudgeBudget> | undefined): ShellJudgeBudget {
  return {
    maxCalls: positiveFloor(budget?.maxCalls) ?? SHELL_JUDGE_DEFAULT_BUDGET.maxCalls,
    maxBytes: positiveFloor(budget?.maxBytes) ?? SHELL_JUDGE_DEFAULT_BUDGET.maxBytes,
    maxFileBytes: positiveFloor(budget?.maxFileBytes) ?? SHELL_JUDGE_DEFAULT_BUDGET.maxFileBytes,
    maxScanBytes: positiveFloor(budget?.maxScanBytes) ?? SHELL_JUDGE_DEFAULT_BUDGET.maxScanBytes,
  };
}

/** env 值解析：只接受纯十进制正整数且在 [min,max]；其余（空串/符号/小数/科学计数/越界）返回 undefined。 */
function envBoundedInt(
  env: Record<string, string | undefined>,
  name: string,
  limits: { readonly min: number; readonly max: number },
): number | undefined {
  const raw = env[name];
  if (raw === undefined) return undefined;
  const text = raw.trim();
  if (!/^[0-9]+$/.test(text)) return undefined;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < limits.min || value > limits.max) return undefined;
  return value;
}

/**
 * 判断会话的生效预算：显式字段（宿主/测试注入）> 环境变量 > 缺省。
 *
 * 2026-10-19 真机缺陷：验证场景读几个文件即耗尽固定预算，判断 agent 只能报 manual。
 * 三个环境变量允许部署侧按场景放宽（例如 CI 验证机），仍受 `SHELL_JUDGE_BUDGET_LIMITS`
 * 上下限约束；非法值回落缺省（不是夹取），保持 fail-closed 可预测。
 * 该函数只在工厂（`buildShellJudgeTools`）构造时调用一次，不进入工具 schema/模型上下文。
 *
 * **跨角色只读契约（2026-10-19 登记，所有权＝运行时核心）**：编排
 * `src/common/编排/shell-judge.ts` 只读导入本函数与 `ShellJudgeBudget`，把**本次实际生效**的预算
 * 注入判断提示（提示数值与工具实际值同源；编排不复制第二份 env/默认值解析）。
 * 导出路径、名称与签名冻结；语义/默认值变更须同步编排提示文案与 `test/runtime-core` 契约用例。
 */
export function resolveShellJudgeBudget(
  explicit?: Partial<ShellJudgeBudget> | undefined,
  env: Record<string, string | undefined> = process.env,
): ShellJudgeBudget {
  return {
    maxCalls:
      positiveFloor(explicit?.maxCalls) ??
      envBoundedInt(env, SHELL_JUDGE_MAX_CALLS_ENV, SHELL_JUDGE_BUDGET_LIMITS.maxCalls) ??
      SHELL_JUDGE_DEFAULT_BUDGET.maxCalls,
    maxBytes:
      positiveFloor(explicit?.maxBytes) ??
      envBoundedInt(env, SHELL_JUDGE_MAX_BYTES_ENV, SHELL_JUDGE_BUDGET_LIMITS.maxBytes) ??
      SHELL_JUDGE_DEFAULT_BUDGET.maxBytes,
    maxFileBytes:
      positiveFloor(explicit?.maxFileBytes) ??
      envBoundedInt(env, SHELL_JUDGE_MAX_FILE_BYTES_ENV, SHELL_JUDGE_BUDGET_LIMITS.maxFileBytes) ??
      SHELL_JUDGE_DEFAULT_BUDGET.maxFileBytes,
    maxScanBytes: positiveFloor(explicit?.maxScanBytes) ?? SHELL_JUDGE_DEFAULT_BUDGET.maxScanBytes,
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

/** 记录一次被拒读取的诊断（项目相对路径；去重、≤16；根外由调用方传 `""`，只留类别）。 */
function recordDeniedPath(stats: ShellJudgeReadStats, path: string, code: JudgeReadCode, pathClass: JudgePathClass): void {
  const normalized = path.replace(/\\/g, "/");
  const list = (stats.deniedPaths ??= []);
  if (list.some((entry) => entry.path === normalized && entry.code === code && entry.pathClass === pathClass)) return;
  if (list.length >= SHELL_JUDGE_MAX_DENIED_PATHS) return;
  list.push({ path: normalized, code, pathClass });
}

/**
 * 信息性读取结果（2026-10-18 真机：judge 探测尚不存在的物证路径，`not-found` 被计入 `deniedReads`
 * ⇒ 驱动误判 read-denied、把 allow 降级）。路径不存在/类型不符是正常探测，不是策略拒绝：
 * 仍写入 `deniedPaths`（诊断），但**不增加** `deniedReads`，也不影响 damageCode。
 */
const INFORMATIONAL_DENIAL_CODES: ReadonlySet<JudgeReadCode> = new Set([
  "not-found",
  "not-a-file",
  "not-a-directory",
  // 范围调用错误/越界（2026-10-19 定点抽查）：不是策略拒绝，也不构成「读取受损」。
  "range-invalid",
  "out-of-range",
]);

function denied(
  code: JudgeReadCode,
  pathClass: JudgePathClass,
  stats: ShellJudgeReadStats,
  requestedPath = "",
): { ok: false; code: JudgeReadCode; pathClass: JudgePathClass } {
  if (!INFORMATIONAL_DENIAL_CODES.has(code)) stats.deniedReads += 1;
  recordDeniedPath(stats, requestedPath, code, pathClass);
  return { ok: false, code, pathClass };
}

/**
 * 敏感类拒绝：`.ans/**` 白名单外内容（app-private）用独立原因码与独立计数——**不计入 `deniedReads`**
 * （2026-10-18 真机：账本已在 facts 里，读不到 `.ans` 不应让驱动的 allow 降级为 read-denied）；
 * 其余仍 `sensitive` 并计入 `deniedReads`。两者都把请求的项目相对路径记入 `deniedPaths`（诊断用）。
 */
function deniedSensitive(
  pathClass: JudgePathClass,
  stats: ShellJudgeReadStats,
  requestedPath = "",
): { ok: false; code: JudgeReadCode; pathClass: JudgePathClass } {
  if (pathClass === "app-private") {
    stats.appPrivateDeniedReads = (stats.appPrivateDeniedReads ?? 0) + 1;
    recordDeniedPath(stats, requestedPath, "app-private", pathClass);
    return { ok: false, code: "app-private", pathClass };
  }
  return denied("sensitive", pathClass, stats, requestedPath);
}

/** 请求路径的敏感检查只看项目根内的相对段；根外路径交给前缀校验（不把用户名/盘符当敏感名）。 */
function requestedSegments(projectRoot: string, requested: string): string[] {
  return segmentsOf(requestedProjectRel(projectRoot, requested));
}

/** 请求路径的项目相对形式（posix）；根外/无法安全表示 ⇒ `""`（诊断只留类别，不记绝对路径）。 */
function requestedProjectRel(projectRoot: string, requested: string): string {
  try {
    const root = resolve(projectRoot);
    const rel = relative(root, requested);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return "";
    return slashPath(rel);
  } catch {
    return "";
  }
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

/** 范围参数硬校验结果（2026-10-19 定点抽查）。 */
type ParsedJudgeReadRange =
  | { ok: true; kind: "none" }
  | { ok: true; kind: "bytes"; offset: number; limit?: number }
  | { ok: true; kind: "lines"; startLine: number; endLine?: number }
  | { ok: false };

function isRangeInt(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min;
}

/**
 * 解析并校验可选范围参数：字节模式（offset/limit）与行模式（startLine/endLine）**互斥**；
 * 任何非法参数（负数/非整数/limit=0/endLine<startLine/混用/类型不符）一律 `range-invalid`，
 * **不静默降级**为整文件读取。字段缺省＝未指定。
 */
function parseJudgeReadRange(range: JudgeReadRangeInput | undefined): ParsedJudgeReadRange {
  if (range === undefined) return { ok: true, kind: "none" };
  const offset = range.offset;
  const limit = range.limit;
  const startLine = range.startLine;
  const endLine = range.endLine;
  const hasBytes = offset !== undefined || limit !== undefined;
  const hasLines = startLine !== undefined || endLine !== undefined;
  if (!hasBytes && !hasLines) return { ok: true, kind: "none" };
  if (hasBytes && hasLines) return { ok: false };
  if (hasBytes) {
    if (offset !== undefined && !isRangeInt(offset, 0)) return { ok: false };
    if (limit !== undefined && !isRangeInt(limit, 1)) return { ok: false };
    return { ok: true, kind: "bytes", offset: offset ?? 0, ...(limit !== undefined ? { limit } : {}) };
  }
  if (startLine !== undefined && !isRangeInt(startLine, 1)) return { ok: false };
  if (endLine !== undefined && !isRangeInt(endLine, 1)) return { ok: false };
  const start = startLine ?? 1;
  if (endLine !== undefined && endLine < start) return { ok: false };
  return { ok: true, kind: "lines", startLine: start, ...(endLine !== undefined ? { endLine } : {}) };
}

/**
 * 单次判断会话内的读取缓存（2026-10-19 真机缺陷）。
 *
 * 同一请求路径＋同一范围重复读取时复用首次成功结果，避免模型反复读同一文件时重复
 * realpath/open/read 与二进制探测。缓存**只在一次判断内**有效（由工厂按会话创建，
 * 不跨请求/不跨角色），且：
 * - 只缓存**成功且已完成路径/敏感/realpath/二进制检查**的结果；拒绝不缓存（fail-closed，
 *   也避免负缓存掩盖会话中途新建的文件）；
 * - **预算与统计口径不变**：命中仍经过调用计数，并按首次读取的字节数计入 `readBytes`、
 *   截断数计入 `truncatedReads`——重复读取不会变成免费读取，既有验收断言不被放宽；
 * - 剩余总预算不足以容纳缓存结果时**不使用缓存**，回落到真实读取路径按 `remaining` 截断，
 *   保证总预算上限不可被缓存绕过。
 *
 * 已知取舍：会话内文件被外部改写/链接被重定向时，同键重复读取返回首次内容（判断会话通常
 * 只持续数秒，且内容已在首次读取时通过全部策略检查）。
 */
export interface JudgeReadCache {
  entries: Map<string, Extract<JudgeReadResolution, { ok: true }>>;
  cachedBytes: number;
}

/** 缓存条目/字节上限：防止长判断会话把读过的文件无限留在内存（超出按插入顺序淘汰）。 */
export const SHELL_JUDGE_READ_CACHE_MAX_ENTRIES = 24;
export const SHELL_JUDGE_READ_CACHE_MAX_BYTES = 4 * 1024 * 1024;

export function createJudgeReadCache(): JudgeReadCache {
  return { entries: new Map(), cachedBytes: 0 };
}

/** 缓存键：请求路径的项目相对形式＋规范化后的范围参数（不同范围是不同读取）。 */
function judgeReadCacheKey(rel: string, range: Extract<ParsedJudgeReadRange, { ok: true }>): string {
  if (range.kind === "none") return `${rel}\u0000none`;
  if (range.kind === "bytes") return `${rel}\u0000bytes:${range.offset}:${range.limit ?? ""}`;
  return `${rel}\u0000lines:${range.startLine}:${range.endLine ?? ""}`;
}

function storeJudgeReadCache(
  cache: JudgeReadCache,
  key: string,
  result: Extract<JudgeReadResolution, { ok: true }>,
): void {
  if (result.bytes > SHELL_JUDGE_READ_CACHE_MAX_BYTES) return;
  // 同键覆盖：先移除旧条目，避免无谓淘汰其他键。
  const previous = cache.entries.get(key);
  if (previous !== undefined) {
    cache.entries.delete(key);
    cache.cachedBytes -= previous.bytes;
  }
  while (
    cache.entries.size >= SHELL_JUDGE_READ_CACHE_MAX_ENTRIES ||
    cache.cachedBytes + result.bytes > SHELL_JUDGE_READ_CACHE_MAX_BYTES
  ) {
    const oldest = cache.entries.keys().next();
    if (oldest.done === true) break;
    const evicted = cache.entries.get(oldest.value);
    cache.entries.delete(oldest.value);
    if (evicted !== undefined) cache.cachedBytes -= evicted.bytes;
  }
  cache.entries.set(key, result);
  cache.cachedBytes += result.bytes;
}

/**
 * 缓存命中：按与真实读取**相同**的口径累加统计；返回 `undefined` 表示未命中或当前剩余
 * 总预算不足（调用方回落真实读取，不得返回超出剩余预算的内容）。
 */
function hitJudgeReadCache(
  cache: JudgeReadCache,
  key: string,
  stats: ShellJudgeReadStats,
  budget: ShellJudgeBudget,
  remaining: number,
): Extract<JudgeReadResolution, { ok: true }> | undefined {
  const entry = cache.entries.get(key);
  if (entry === undefined) return undefined;
  if (entry.bytes > remaining) return undefined;
  stats.readBytes += entry.bytes;
  if (entry.truncated) stats.truncatedReads += 1;
  const budgetLimited = entry.range === undefined
    ? stats.readBytes >= budget.maxBytes && entry.totalBytes > entry.bytes
    : entry.truncated && remaining < budget.maxFileBytes;
  if (budgetLimited) stats.budgetExceeded = true;
  recordReadPath(stats, entry.rel);
  return entry;
}

/** 定位读取（不改变文件位置；短读续读直到长度满足或 EOF）。 */
async function readAt(handle: FileHandle, offset: number, length: number): Promise<Buffer> {
  if (length <= 0) return Buffer.alloc(0);
  const buffer = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const { bytesRead } = await handle.read(buffer, filled, length - filled, offset + filled);
    if (bytesRead === 0) break;
    filled += bytesRead;
  }
  return buffer.subarray(0, filled);
}

const LINE_SCAN_CHUNK_BYTES = 64 * 1024;

interface LineRangeScan {
  /** 起始行首字节的绝对偏移。 */
  startByte: number;
  /** 可返回范围的结束位置（不含）；最多 `startByte + cap`。 */
  endByte: number;
  /** 请求范围是否在单次预算内完整（false＝被单文件/总预算截断）。 */
  complete: boolean;
  /** 扫描到 EOF 时的文件总行数；提前停止（找到结束行/预算截断）时缺省。 */
  totalLines?: number;
  /** 请求结束行超出 EOF，实际范围已收敛到末行（不是预算截断）。 */
  clampedToEof: boolean;
}

/**
 * 行范围定位扫描（2026-10-19 定点抽查）：从文件头逐块扫描（内存恒定），找到起始行首字节
 * 与请求末行的结束位置；`maxScanBytes` 只约束「找行号」的 I/O（不计入 `readBytes`）。
 * 起始行不存在/超出扫描上限 ⇒ `undefined`（调用方按 `out-of-range` 如实拒绝，不猜测）。
 */
async function scanLineRange(
  handle: FileHandle,
  fileSize: number,
  startLineWanted: number,
  endLineWanted: number | undefined,
  cap: number,
  maxScanBytes: number,
): Promise<LineRangeScan | undefined> {
  const chunk = Buffer.alloc(Math.min(LINE_SCAN_CHUNK_BYTES, Math.max(1, fileSize)));
  let position = 0;
  let line = 1;
  let lineStart = 0;
  let startByte: number | undefined;
  let endByte: number | undefined;
  let totalLines: number | undefined;
  let clampedToEof = false;
  let complete = false;
  let lastByteWasNewline = false;

  while (endByte === undefined) {
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
    if (bytesRead === 0) break;
    let stopped = false;
    for (let index = 0; index < bytesRead; index++) {
      const absolute = position + index;
      if (startByte === undefined && absolute >= maxScanBytes) return undefined;
      if (startByte === undefined && line === startLineWanted) startByte = lineStart;
      const isNewline = chunk[index] === 0x0a;
      if (isNewline) {
        if (startByte !== undefined && endLineWanted !== undefined && line === endLineWanted) {
          // 请求末行结束（含换行符）：范围完整。
          endByte = absolute + 1;
          complete = true;
          stopped = true;
          break;
        }
        line += 1;
        lineStart = absolute + 1;
      }
      lastByteWasNewline = isNewline;
      if (startByte !== undefined && endByte === undefined && absolute + 1 - startByte >= cap) {
        // 已凑满单次可返回预算；文件在此之后仍有内容才构成截断。
        endByte = startByte + cap;
        if (absolute + 1 >= fileSize) {
          // 恰好在预算边界读到文件末尾：范围完整；行数此时可知。
          complete = true;
          totalLines = isNewline ? line - 1 : line;
          clampedToEof = endLineWanted !== undefined && endLineWanted > totalLines;
        } else {
          complete = false;
        }
        stopped = true;
        break;
      }
    }
    position += bytesRead;
    if (stopped) break;
  }

  if (startByte === undefined) return undefined; // 起始行不存在（含空文件/越过扫描上限）
  if (endByte === undefined) {
    // EOF：请求范围自然结束（末行缺省或超出文件末尾）。
    endByte = position;
    totalLines = lastByteWasNewline ? line - 1 : line;
    complete = true;
    clampedToEof = endLineWanted !== undefined && endLineWanted > totalLines;
  }
  return {
    startByte,
    endByte,
    complete,
    ...(totalLines !== undefined ? { totalLines } : {}),
    clampedToEof,
  };
}

/**
 * `judge_read_file` 的解析与读取（PM 评审 §7.3 钉死顺序）。
 * 成功返回 `{ok:true, abs, rel, truncated, text, bytes, totalBytes, range?}`；失败返回
 * `{ok:false, code, pathClass}`（**不回显绝对路径**）。读取/拒绝统计累加进 `input.stats`。
 *
 * 2026-10-19（客户反馈：判断 agent 定点抽查）：可带可选范围参数，只返回指定片段；
 * **不带范围时行为与上限逐字不变**。范围只影响「读哪一段」——路径/敏感/realpath/项目根/
 * 二进制检查全部在读取前完成，不能被范围绕过。
 */
export async function resolveJudgeRead(input: JudgeReadInput): Promise<JudgeReadResolution> {
  const budget = resolveBudget(input.budget);
  const stats = input.stats;
  const raw = checkRawPath(input.path);
  if (!raw.ok) return denied(raw.code, raw.pathClass, stats);

  const requested = isAbsolute(input.path) ? input.path : resolve(input.projectRoot, input.path);
  const requestedRel = requestedProjectRel(input.projectRoot, requested);

  // 范围参数硬校验：与 `empty`/`invalid-path` 同口径——非法参数不消耗调用预算，不计入 deniedReads。
  const rangeSpec = parseJudgeReadRange(input.range);
  if (!rangeSpec.ok) return denied("range-invalid", "unknown", stats, requestedRel);

  if (!consumeCall(stats, budget)) return budgetDenied(stats);

  // 请求路径本身也做敏感检查（防「真实路径别名」在解析前就被当成普通文件）；
  // `.ans/project.json` 是唯一只读白名单。
  const requestedSegmentList = requestedSegments(input.projectRoot, requested);
  const requestedSensitive = sensitiveClass(requestedSegmentList);
  if (requestedSensitive !== undefined && !isAnsReadAllowed(requestedSegmentList)) {
    return deniedSensitive(requestedSensitive, stats, requestedRel);
  }

  // 单次判断会话内缓存：同一请求路径＋同一范围命中即复用首次成功结果（预算已计入）。
  // 只跳过 realpath/open/read；敏感检查在上面每次仍执行（请求路径的敏感性是静态的）。
  if (input.cache !== undefined && requestedRel !== "") {
    const cached = hitJudgeReadCache(
      input.cache,
      judgeReadCacheKey(requestedRel, rangeSpec),
      stats,
      budget,
      budget.maxBytes - stats.readBytes,
    );
    if (cached !== undefined) return cached;
  }

  let rootReal: string;
  let real: string;
  try {
    rootReal = await realpath(input.projectRoot);
    real = await realpath(requested);
  } catch {
    return denied("not-found", "unknown", stats, requestedRel);
  }
  if (!compareRoot(real, rootReal)) return denied("outside-root", "outside-root", stats);

  const rel = relative(rootReal, real);
  if (rel === "") return denied("not-a-file", "non-regular", stats, requestedRel);
  // 真实路径的每一段再查（防 `.env` 被链接成 `config.txt`；白名单文件按真实路径放行）。
  const realSegments = segmentsOf(rel);
  const realSensitive = sensitiveClass(realSegments);
  if (realSensitive !== undefined && !isAnsReadAllowed(realSegments)) {
    return deniedSensitive(realSensitive, stats, requestedRel);
  }

  let info;
  try {
    info = await lstat(real);
  } catch {
    return denied("not-found", "unknown", stats, requestedRel);
  }
  if (!info.isFile()) return denied("not-a-file", "non-regular", stats, requestedRel);

  const remaining = budget.maxBytes - stats.readBytes;
  const cap = Math.min(budget.maxFileBytes, remaining);
  if (cap <= 0) return budgetDenied(stats);

  let data: Buffer;
  let truncated: boolean;
  let range: JudgeReadRangeSummary | undefined;
  let budgetLimited = false;
  try {
    const handle = await open(real, "r");
    try {
      if (rangeSpec.kind === "none") {
        // 既有整文件路径**逐字不变**：从 0 读 cap，二进制探针只看返回数据前 8KB。
        data = await readAt(handle, 0, cap);
        if (data.subarray(0, Math.min(BINARY_PROBE_BYTES, data.length)).includes(0)) {
          return denied("binary", "binary", stats, requestedRel);
        }
        truncated = info.size > data.length || (data.length === cap && info.size > cap);
        range = undefined;
      } else {
        // 定点抽查：仍先探测文件头 8KB（不得借 offset/startLine 绕过二进制拒绝）。
        const probe = await readAt(handle, 0, Math.min(BINARY_PROBE_BYTES, info.size));
        if (probe.includes(0)) return denied("binary", "binary", stats, requestedRel);

        if (rangeSpec.kind === "bytes") {
          const offset = rangeSpec.offset;
          // 空文件的 offset 0 允许（返回空片段）；其余 offset 到达/越过末尾一律如实拒绝。
          if (offset > info.size || (offset === info.size && offset > 0)) {
            return denied("out-of-range", "unknown", stats, requestedRel);
          }
          const requestedLimit = rangeSpec.limit ?? cap;
          const want = Math.min(requestedLimit, cap);
          data = await readAt(handle, offset, want);
          // 返回数据本身也查 NUL（防文件头是文本、片段内含二进制内容）。
          if (data.includes(0)) return denied("binary", "binary", stats, requestedRel);
          const available = info.size - offset;
          // 请求的字节数没给够、且文件在返回片段之后还有内容 ⇒ 被单文件/总预算截断。
          truncated = data.length < requestedLimit && data.length < available;
          budgetLimited = truncated && remaining < budget.maxFileBytes;
          range = { kind: "bytes", offset, end: offset + data.length, totalBytes: info.size };
        } else {
          const scan = await scanLineRange(
            handle,
            info.size,
            rangeSpec.startLine,
            rangeSpec.endLine,
            cap,
            budget.maxScanBytes,
          );
          if (scan === undefined) return denied("out-of-range", "unknown", stats, requestedRel);
          data = await readAt(handle, scan.startByte, scan.endByte - scan.startByte);
          if (data.includes(0)) return denied("binary", "binary", stats, requestedRel);
          truncated = !scan.complete;
          budgetLimited = truncated && remaining < budget.maxFileBytes;
          const actualEndLine = scan.clampedToEof
            ? scan.totalLines
            : scan.complete
              ? (rangeSpec.endLine ?? scan.totalLines)
              : undefined;
          range = {
            kind: "lines",
            startLine: rangeSpec.startLine,
            ...(actualEndLine !== undefined ? { endLine: actualEndLine } : {}),
            ...(scan.totalLines !== undefined ? { totalLines: scan.totalLines } : {}),
            ...(rangeSpec.endLine !== undefined ? { requestedEndLine: rangeSpec.endLine } : {}),
            ...(scan.clampedToEof ? { clampedToEof: true } : {}),
          };
        }
      }
    } finally {
      await handle.close();
    }
  } catch {
    return denied("read-failed", "unknown", stats, requestedRel);
  }

  stats.readBytes += data.length;
  if (truncated) stats.truncatedReads += 1;
  // 总预算被本次读取吃满（cap 被 remaining 限制）⇒ 后续读取一律预算拒绝（PM 评审 §7.2）。
  if (rangeSpec.kind === "none") {
    if (stats.readBytes >= budget.maxBytes && info.size > data.length) stats.budgetExceeded = true;
  } else if (budgetLimited) {
    stats.budgetExceeded = true;
  }

  const relSlash = slashPath(rel);
  recordReadPath(stats, relSlash);
  const resolution: Extract<JudgeReadResolution, { ok: true }> = {
    ok: true,
    abs: real,
    rel: relSlash,
    truncated,
    text: utf8Prefix(data),
    bytes: data.length,
    totalBytes: info.size,
    ...(range !== undefined ? { range } : {}),
  };
  if (input.cache !== undefined && requestedRel !== "") {
    storeJudgeReadCache(input.cache, judgeReadCacheKey(requestedRel, rangeSpec), resolution);
  }
  return resolution;
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
  const requestedRel = requestedProjectRel(input.projectRoot, requested);
  const requestedSegmentList = requestedSegments(input.projectRoot, requested);
  const requestedSensitive = sensitiveClass(requestedSegmentList);
  // `.ans/**` 整体是应用私有数据；D 批撤除账本后不再开放 `.ans/governance/` 目录。
  if (requestedSensitive !== undefined) {
    return deniedSensitive(requestedSensitive, stats, requestedRel);
  }

  let rootReal: string;
  let real: string;
  try {
    rootReal = await realpath(input.projectRoot);
    real = await realpath(requested);
  } catch {
    return denied("not-found", "unknown", stats, requestedRel);
  }
  if (!compareRoot(real, rootReal)) return denied("outside-root", "outside-root", stats);

  const rel = relative(rootReal, real);
  const relSegments = segmentsOf(rel);
  const realSensitive = sensitiveClass(relSegments);
  if (realSensitive !== undefined) {
    return deniedSensitive(realSensitive, stats, requestedRel);
  }

  let info;
  try {
    info = await lstat(real);
  } catch {
    return denied("not-found", "unknown", stats, requestedRel);
  }
  if (!info.isDirectory()) return denied("not-a-directory", "non-regular", stats, requestedRel);

  let names: string[];
  try {
    const all = await readdir(real);
    names = all.filter((name) => !sensitiveEntry(relSegments, name)).sort((a, b) => a.localeCompare(b));
  } catch {
    return denied("read-failed", "unknown", stats, requestedRel);
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
