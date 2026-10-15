// Shared ANS tool execution. Owner: 运行时核心. SDK adapters receive handlers by injection.
import { coreToolTarget } from "../../common/runtime-core/tool-display.ts";
import { createEventQueue } from "../../common/runtime-core/event-queue.ts";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type {
  WriteGate,
  ShellGate,
  ShellReviewResult,
  CustomerInputFn,
  CustomerInputRequest,
  CustomerInputOutcome,
  CustomerInputOption,
  CustomerInputMetadata,
  ReportHandbackFn,
  ReportHandbackPayload,
  DispatchTaskFn,
  DispatchTaskPayload,
  ShellVerdictFn,
  ShellVerdictPayload,
  InteractionGate,
  PromptInputEventDetail, RuntimeAdapter, RuntimeProviderOptions, SessionEvent, ToolCall,
  ToolDefinition, ToolResult, GovernedToolsOptions,
} from "../../model/runtime.ts";
import type { WriteDecision } from "../../model/decision.ts";
import type { DiagnosticLog } from "../../model/runtime.ts";
import { describeTool } from "./schema.ts";
import { formatDenialMessage } from "../../common/runtime-core/format-denial.ts";
import {
  CUSTOMER_INPUT_TIMEOUT_ENV,
  DEFAULT_SHELL_REVIEW_TIMEOUT_MS,
  SHELL_REVIEW_TIMEOUT_ENV,
  raceAbort,
  readOptionalTimeoutMs,
  readTimeoutMs,
  withTimeout,
} from "../../common/runtime-core/timeout.ts";
import { PI_CREDENTIAL_ENV_VARS, RUNTIME_CREDENTIAL_ENV_VARS } from "../../common/shared/runtime-shared.ts";
import {
  atomicWriteFile,
  ensureParentDir,
  guardWriteTarget,
  recheckParentInsideWriteRoot,
  resolveWriteAbs,
} from "../../common/runtime-core/fs-write.ts";

/** run_shell 工具名（唯一 shell 入口）。扩展层据此设能力级 kill-switch，工具集据此注册。 */
export const SHELL_TOOL_NAME = "run_shell";

/** request_confirmation 工具名（设计 A-1；交互工具族之一：请求客户确认，可带预览）。 */
export const REQUEST_CONFIRMATION_TOOL_NAME = "request_confirmation";

/** request_choice 工具名（设计 A-1；交互工具族之一：请求客户勾选/单选，options）。 */
export const REQUEST_CHOICE_TOOL_NAME = "request_choice";

/** submit_report 工具名（设计 C-1；交报告——角色完成时回交 su 汇总）。 */
export const SUBMIT_REPORT_TOOL_NAME = "submit_report";

/** dispatch_task 工具名（设计 H-1；su 派发任务给项目角色——派发 ≠ 授权）。 */
export const DISPATCH_TASK_TOOL_NAME = "dispatch_task";

/** report_shell_verdict 工具名（R-1；审读会话交回结构化审读结论；与编排 shell-gate.ts:206 同串）。 */
export const SHELL_VERDICT_TOOL_NAME = "report_shell_verdict";

/** 扩展层对 run_shell 的能力级判定结果：非 undefined 即阻断（默认拒绝）。 */
export interface ShellKillSwitchDecision {
  block: true;
  reason: string;
}

/**
 * 扩展层对 `run_shell` 的**能力级 kill-switch**（设计 §7.5 第 4 条）。
 *
 * **这不是「第二道每调用审」**——票据（token）机制已废（§7.1 第 3 条），此处**不做任何每调用校验**，
 * 也**不喂 resolveWrite**（§7.7）。它只做**同步粗判**：
 * - 非 `run_shell` → 返回 `undefined`（不由本判据处理，交回既有写类逻辑）；
 * - `run_shell` 且**未 arm**（`shellArmed === false`，即未注入 `ShellGate`）→ `{block:true}`；
 * - `run_shell` 且**已 arm** → `undefined`（放行，交 `execute` 做每调用细审——审核与 spawn 同址的唯一处）。
 *
 * V1 说明：「策略禁 shell」与「未 arm」在本模型下**收敛为同一判据**——是否注入 `ShellGate` 就是编排的策略决定。
 * 因「唯一 shell 入口 = 我们的自定义工具 `run_shell`」，扩展层**不再是独立的第二道审**，独立价值仅剩本 kill-switch；
 * **真正的每调用保证在 `execute`**（未返回 `allow` 绝不 spawn）。
 */
export function shellKillSwitch(input: { toolName: string; shellArmed: boolean }): ShellKillSwitchDecision | undefined {
  if (input.toolName !== SHELL_TOOL_NAME) return undefined;
  if (input.shellArmed) return undefined;
  return { block: true, reason: "run_shell 未 arm（未注入 ShellGate），已在执行前阻断（能力级 kill-switch）" };
}

type ExecutableTool = Pick<ToolDefinition, "name" | "handler">;
export type { ToolDefinition, ToolResult, GovernedToolsOptions } from "../../model/runtime.ts";

/** 从工具参数里取出目标路径；容忍 path / file_path / filePath 三种命名。 */
function readTargetPath(args: Record<string, unknown>): string | undefined {
  return coreToolTarget("core-path-v1", args);
}

/** 从工具参数里按候选键名取字符串。 */
function readStringArg(args: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function handbackMetadata(turnId: string, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">) {
  return { turnId, ...(scope?.roleId ? { roleId: scope.roleId } : {}), ...(scope?.runtime ? { runtime: scope.runtime } : {}) };
}

function customerMetadata(signal: AbortSignal | undefined, turnId: string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">, toolCallId?: string): CustomerInputMetadata {
  return { ...(signal ? { signal } : {}), ...(turnId !== undefined ? { turnId } : {}), ...(scope?.roleId ? { roleId: scope.roleId } : {}), ...(scope?.runtime ? { runtime: scope.runtime } : {}), ...(toolCallId !== undefined ? { toolCallId } : {}) };
}

/**
 * 写类工具的公共前置：解析 abs → 调 gate（唯一治理判定点）。
 * gate 抛错或拒绝都在**任何文件系统副作用之前**返回。
 */
type Prologue =
  | { proceed: true; abs: string | undefined }
  | { proceed: false; result: ToolResult };

function govern(gate: WriteGate, name: string, path: string, writeRoot: string | undefined): Prologue {
  // 解析为绝对路径（纯词法，不碰文件系统），把 abs 传给 gate；写入也用同一个 abs。
  // writeRoot 未配置时沿用原样 path 传给 gate（保持既有判定语义），且后续不落盘。
  const resolved = writeRoot !== undefined ? resolveWriteAbs(path, writeRoot) : path;

  let decision: WriteDecision;
  try {
    decision = gate(resolved);
  } catch (err) {
    // gate 抛错 —— 此时尚未触碰文件系统（无 mkdir / 无 open）→ fail-closed，不写。
    return { proceed: false, result: { ok: false, message: `${name} 门禁判定异常，未写入：${path}（${reasonOf(err)}）` } };
  }
  if (!decision.allowed) {
    return { proceed: false, result: { ok: false, message: formatDenialMessage(decision) } };
  }
  return { proceed: true, abs: writeRoot !== undefined ? resolved : undefined };
}

/** 落盘前守卫 + mkdir + 二次复核 + 原子写；任一步失败返回可读错误（可能已建目录但未写文件）。 */
async function writeGuarded(
  name: string,
  path: string,
  abs: string,
  writeRoot: string,
  data: Buffer,
  opts: { createParent: boolean },
  signal?: AbortSignal,
): Promise<ToolResult> {
  if (signal?.aborted) return { ok: false, message: `${name}：会话已中止，未写入` };
  // 1) 只读守卫：词法 + 名称安全 + 真实路径复核（挡 symlink/junction 逃逸）——在 mkdir 之前。
  const guarded = await guardWriteTarget(abs, writeRoot);
  if (!guarded.ok) {
    return { ok: false, message: `${name} 拒绝写入：${guarded.reason}（未写入，目标文件未被触碰）` };
  }

  // 2) 建父目录（仅 write_file 需要；edit_file 目标必已存在）。
  if (opts.createParent) {
    try {
      signal?.throwIfAborted();
      await ensureParentDir(guarded.target.parentAbs);
    } catch (err) {
      return { ok: false, message: `${name} 写入失败（建目录）：${path}（${reasonOf(err)}）` };
    }
  }

  // 3) 紧邻写入前的二次复核（TOCTOU：弥补 mkdir 与 rename 之间的时间窗）。
  const recheck = await recheckParentInsideWriteRoot(writeRoot, guarded.target.parentAbs);
  if (!recheck.ok) {
    return { ok: false, message: `${name} 拒绝写入：${recheck.reason}` };
  }

  // 4) 原子写（同目录 temp + rename）。
  try {
    signal?.throwIfAborted();
    await atomicWriteFile(abs, data, signal);
  } catch (err) {
    return { ok: false, message: `${name} 写入失败：${path}（${reasonOf(err)}）` };
  }
  return { ok: true, message: `${name} 已获准并落盘：${path}（${data.length} 字节写入 ${abs}）` };
}

/** write_file：获准后 mkdir -p 父目录 → 原子写 content（UTF-8，不加 BOM）。 */
function makeWriteFileTool(gate: WriteGate, writeRoot: string | undefined): ExecutableTool {
  const name = "write_file";
  return {
    name,
    async handler(call) {
      const path = readTargetPath(call.args);
      if (path === undefined) return { ok: false, message: `${name}: 缺少 path 参数，无法判定写入目标` };
      const content = readStringArg(call.args, ["content", "text"]);
      if (content === undefined) return { ok: false, message: `${name}: 缺少 content 参数，无法写入` };

      const pre = govern(gate, name, path, writeRoot);
      if (!pre.proceed) return pre.result;
      if (pre.abs === undefined || writeRoot === undefined) {
        return { ok: true, message: `${name} 已获准（写入）：${path}（本次构造未配置 writeRoot，已判定但未落盘）` };
      }
      if (call.signal?.aborted) return { ok: false, message: `${name}：会话已中止，未写入` };
      return writeGuarded(name, path, pre.abs, writeRoot, Buffer.from(content, "utf8"), { createParent: true }, call.signal);
    },
  };
}

/**
 * edit_file 的编码策略（明确写出，不留给他人猜）：
 * - 仅支持 UTF-8 文本；UTF-16（含 BOM）→ 直接拒绝，绝不尝试改写以免损坏。
 * - **BOM 原样保留**：若原文件带 UTF-8 BOM，匹配时剥离、写回时重新加回。
 * - **EOL 不归一化**：不做换行换算；old_string 必须与文件**逐字节**匹配（含 CRLF）。
 * - 仅替换**首个**匹配（indexOf）；未命中 → ok:false 且不写。
 */
function decodeForEdit(raw: Buffer): { ok: true; text: string; bom: boolean } | { ok: false; reason: string } {
  if (
    raw.length >= 2 &&
    ((raw[0] === 0xff && raw[1] === 0xfe) || (raw[0] === 0xfe && raw[1] === 0xff))
  ) {
    return { ok: false, reason: "目标为 UTF-16 编码，edit_file 仅支持 UTF-8，为免损坏已拒绝" };
  }
  const bom = raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
  let text = raw.toString("utf8");
  if (bom && text.startsWith("\uFEFF")) text = text.slice(1);
  return { ok: true, text, bom };
}

/** edit_file：获准后读原文件 → old_string 替换（未命中不写）→ 原子写回。 */
function makeEditFileTool(gate: WriteGate, writeRoot: string | undefined): ExecutableTool {
  const name = "edit_file";
  return {
    name,
    async handler(call) {
      const path = readTargetPath(call.args);
      if (path === undefined) return { ok: false, message: `${name}: 缺少 path 参数，无法判定写入目标` };
      const oldString = readStringArg(call.args, ["old_string", "oldString"]);
      const newString = readStringArg(call.args, ["new_string", "newString"]);
      if (oldString === undefined || newString === undefined) {
        return { ok: false, message: `${name}: 缺少 old_string / new_string 参数` };
      }

      const pre = govern(gate, name, path, writeRoot);
      if (!pre.proceed) return pre.result;
      if (pre.abs === undefined || writeRoot === undefined) {
        return { ok: true, message: `${name} 已获准（编辑）：${path}（本次构造未配置 writeRoot，已判定但未落盘）` };
      }

      // 读原文件（只读；发生在 gate 之后，不构成副作用）。
      let raw: Buffer;
      try {
        raw = await readFile(pre.abs);
      } catch (err) {
        return { ok: false, message: `${name} 失败：无法读取目标 ${path}（${reasonOf(err)}）` };
      }
      const decoded = decodeForEdit(raw);
      if (!decoded.ok) return { ok: false, message: `${name} 拒绝编辑：${decoded.reason}` };

      const idx = decoded.text.indexOf(oldString);
      if (idx === -1) {
        // 未命中 old_string —— ok:false 且**文件保持不变**。
        return { ok: false, message: `${name}：未找到 old_string，未写入（文件保持不变）：${path}` };
      }
      const next = decoded.text.slice(0, idx) + newString + decoded.text.slice(idx + oldString.length);
      const data = Buffer.from((decoded.bom ? "\uFEFF" : "") + next, "utf8");

      return writeGuarded(name, path, pre.abs, writeRoot, data, { createParent: false }, call.signal);
    },
  };
}

/** 构造受治理的读取工具（read_file）：读不经过写门禁。 */
function makeReadTool(readRoot: string): ExecutableTool {
  return {
    name: "read_file",
    async handler(call) {
      const path = readTargetPath(call.args);
      if (path === undefined) {
        return { ok: false, message: "read_file: 缺少 path 参数" };
      }
      const absolute = isAbsolute(path) ? path : resolve(readRoot, path);
      try {
        const content = await readFile(absolute, "utf8");
        return { ok: true, message: `read_file: ${path}\n\n${content}` };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return { ok: false, message: `read_file 失败：${path}（${reason}）` };
      }
    },
  };
}

/** 单条流的输出上限（1 MiB）；超出即截断，避免内存被大输出撑爆。 */
const MAX_SHELL_OUTPUT_BYTES = 1_048_576;

/**
 * 把命令串拆成 argv（best-effort）。
 *
 * **这是信息性拆分**：仅供 ShellGate 参考（设计 §7 的 `classifyShell(argv)`）；**执行层不经 shell**
 * （见 runShell 的 `shell: false`），故即便拆分与真实语义有偏差，也不会造成 shell 元字符注入——
 * `echo x > f`、`$(...)`、管道等在此只是**普通参数**，没有 shell 去解释它们。
 * 拆分规则：按空白切分，单/双引号内不切分（引号本身移除）；不做变量展开、不做转义解释。
 */
function splitCommand(command: string): string[] {
  const tokens: string[] = [];
  let cur: string | null = null;
  let quote: string | null = null;
  for (const ch of command) {
    if (quote !== null) {
      if (ch === quote) quote = null;
      else cur = (cur ?? "") + ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur = cur ?? "";
    } else if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      if (cur !== null) {
        tokens.push(cur);
        cur = null;
      }
    } else {
      cur = (cur ?? "") + ch;
    }
  }
  if (cur !== null) tokens.push(cur);
  return tokens;
}

/**
 * 凭据环境变量名（设计 §7.9）。**spawn 时必须从子进程 env 中剥离**。
 *
 * **单一来源（T20）**：名单由跨角色共享模块 `src/common/shared/runtime-shared.ts`（属主：项目管理）定义，
 * 本层**只读导入**（工程法案 §一.5「不得复制第二份」）。这样「装配判有没有凭据」与「Pi适配器 spawn 时剥离」
 * 引用**同一常量**，不会分叉——**安全相关**（§7.9）。此处再导出（`export`），保持本模块既有导出表面不变，
 * 供 `test/项目管理/shared/` 收敛窗口期的一致性用例继续核对（单一实现，非第二份）。
 */
export { PI_CREDENTIAL_ENV_VARS };

/**
 * 构造**剥离凭据后**的子进程环境（设计 §7.9）。
 *
 * **V1 做到：黑名单剥离**——从 `process.env` 出发，**删除** `PI_CREDENTIAL_ENV_VARS`（大小写不敏感，
 * 兼容 Windows 环境变量名不区分大小写），其余原样透传。
 *
 * **为何 V1 取黑名单而非「收窄白名单」（如实说明取舍）**：白名单（只透传 PATH/HOME/TEMP/SystemRoot/
 * PATHEXT/ComSpec 等构建最小子集）是**目标态**，理论上泄漏面最小；但跨平台（Windows 与 POSIX 所需变量
 * 集不同，且 node/构建工具会读许多零散变量）极易漏项，一旦漏项即**打断正常命令**——用一个高概率「坏掉
 * 一切」的机制去换边际安全，风险收益不划算。黑名单**直接对准威胁面（凭据外泄）**，且**不改变**非凭据命令
 * 的行为，是 V1 更稳的一步。**收窄白名单列为后续（目标态）**，届时须逐平台列出必需变量并配套回归测试。
 */
export function buildShellEnv(base: Record<string, string | undefined>, extraCredentialEnvVars: readonly string[] = []): Record<string, string> {
  const denied = new Set([...RUNTIME_CREDENTIAL_ENV_VARS, ...extraCredentialEnvVars].map((name) => name.toUpperCase()));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (denied.has(key.toUpperCase())) continue;
    env[key] = value;
  }
  return env;
}

interface ShellExecOutcome {
  code?: number;
  signal?: string | null;
  stdout: string;
  stderr: string;
  error?: string;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
}

/**
 * 直接以 argv 启动子进程（**shell: false**，不经 shell 再解析）。
 * cwd **固定**为传入值（= projectRoot），不接受调用方指定（爆炸半径限制，§7.2）。
 * env **必须**是剥离凭据后的过滤环境（§7.9，见 buildShellEnv），**绝不**直接传 process.env。
 * 启动失败 / 得到错误 → 以 `error` 返回，绝不抛出（上层据此回 ok:false）。
 */
function runShell(argv: string[], cwd: string, env: Record<string, string>, signal?: AbortSignal): Promise<ShellExecOutcome> {
  return new Promise((resolveOutcome) => {
    if (signal?.aborted) { resolveOutcome({ stdout: "", stderr: "", error: "会话已中止，命令未执行" }); return; }
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(argv[0], argv.slice(1), { cwd, shell: false, windowsHide: true, env });
    } catch (err) {
      resolveOutcome({ stdout: "", stderr: "", error: reasonOf(err) });
      return;
    }
    const out: Buffer[] = [];
    const errOut: Buffer[] = [];
    let outLen = 0;
    let errLen = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;
    let aborted = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    const settle = (outcome: ShellExecOutcome): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (killTimer) clearTimeout(killTimer);
      if (cleanupTimer) clearTimeout(cleanupTimer);
      const observed = { ...outcome, stdoutTruncated, stderrTruncated };
      resolveOutcome(aborted ? { ...observed, error: outcome.error ?? "会话已中止，命令已请求终止" } : observed);
    };
    const abort = (): void => {
      aborted = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => { if (!settled) child.kill("SIGKILL"); }, 250);
      cleanupTimer = setTimeout(() => settle({ stdout: "", stderr: "", error: "命令中止清理超时" }), 1000);
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout?.on("data", (d: Buffer) => {
      if (outLen < MAX_SHELL_OUTPUT_BYTES) {
        out.push(d);
        outLen += d.length;
      } else { stdoutTruncated = true; }
    });
    child.stderr?.on("data", (d: Buffer) => {
      if (errLen < MAX_SHELL_OUTPUT_BYTES) {
        errOut.push(d);
        errLen += d.length;
      } else { stderrTruncated = true; }
    });
    child.on("error", (e) => settle({ stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(errOut).toString("utf8"), error: reasonOf(e) }));
    child.on("close", (code, signal) =>
      settle({
        code: code ?? undefined,
        signal,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(errOut).toString("utf8"),
      }),
    );
  });
}

/**
 * run_shell：命令级闸工具（设计 §7.2）。顺序**必须**是：
 *   取 command → `await shellGate(req)`（超时包装）→ **仅当恰好 `allow:true`** 才 spawn → 收集结果。
 * `allow:false` / `undefined` / 抛错 / 超时 → **在任何 spawn 之前返回**，子进程**从不启动**（§7.5.2）。
 *
 * **审核与 spawn 同址**（§7.1 第 3 条）：这是**唯一** spawn 点，且**没有 token**——不再「登记票据交扩展层」，
 * 因为票据可由公开输入重算、证明不了审核发生过。此处就是每调用保证的唯一落点。
 */
function makeRunShellTool(shellGate: ShellGate, shellCwd: string, reviewTimeoutMs: number, gate?: InteractionGate, diagnostics?: DiagnosticLog, currentTurnId?: () => string | undefined, extraCredentialEnvVars?: readonly string[]): ExecutableTool {
  const name = SHELL_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const command = coreToolTarget("core-command-v1", call.args);
      if (command === undefined || command.trim() === "") {
        return { ok: false, message: `${name}: 缺少 command 参数，无法审核执行` };
      }
      const argv = splitCommand(command);
      if (argv.length === 0) return { ok: false, message: `${name}: command 为空，无命令可执行` };
      const cwd = shellCwd;
      const toolCallId = typeof call.toolCallId === "string" ? call.toolCallId : "";

      // —— 唯一的命令级闸：只有恰好 allow:true 才继续（判定与执行在同一条我们的代码路径上）——
      let review: ShellReviewResult | undefined;
      const turnId = currentTurnId?.();
      const began = Date.now();
      gate?.begin();
      diagnostics?.record("shell.review.start", { turnId, toolCallId, toolName: name });
      try {
        review = await withTimeout(raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return shellGate({ command, argv, cwd, toolCallId }); }), call.signal, `${name} 审核`), reviewTimeoutMs, `${name} 审核`);
      } catch (err) {
        diagnostics?.error("shell.review.failed", err, { turnId, toolCallId, toolName: name });
        // 审核抛错 / 超时 → **绝不 spawn**（fail-closed；超时 = 拒绝，§7.5.2）。
        return { ok: false, message: `${name} 未执行：审核未通过（${reasonOf(err)}）` };
      } finally {
        gate?.end();
        diagnostics?.record("shell.review.end", { turnId, toolCallId, toolName: name, durationMs: Date.now() - began, decision: review?.allow === true ? "allow" : "deny" });
      }
      if (call.signal?.aborted) return { ok: false, message: `${name} 未执行：会话已中止` };
      // 恰好 allow:true 才放行；deny / undefined / 任何非明确 allow → 一律不执行（无 token 可依）。
      if (review === undefined || review === null || review.allow !== true) {
        const denied = review !== undefined && review !== null && review.allow === false ? review : undefined;
        const why = denied !== undefined ? denied.reason : "审核未返回明确的允许（缺 allow:true）";
        const by = denied !== undefined ? `，审者：${denied.by}` : "";
        return { ok: false, message: `${name} 未执行：审核拒绝（${why}${by}）` };
      }

      // —— 恰好 allow:true：构造**剥离凭据后**的 env（§7.9），随后**才**启动子进程 ——
      const outcome = await runShell(argv, cwd, buildShellEnv(process.env, extraCredentialEnvVars), call.signal);
      if (outcome.error !== undefined) {
        return { ok: false, message: `${name} 执行失败（未能启动或运行）：${outcome.error}`, execution: { error: outcome.error, ...(outcome.code !== undefined ? { exitCode:outcome.code } : {}), ...(outcome.signal ? {signal:outcome.signal} : {}) } };
      }
      const code = outcome.code;
      return {
        ok: code === 0,
        execution: { ...(code !== undefined ? {exitCode:code} : {}), ...(outcome.signal ? {signal:outcome.signal} : {}), stdout:outcome.stdout, stderr:outcome.stderr, stdoutTruncated:outcome.stdoutTruncated === true, stderrTruncated:outcome.stderrTruncated === true },
        message:
          `${name} 已执行：${command}（exit ${code ?? "?"}${outcome.signal ? `，signal ${outcome.signal}` : ""}）\n` +
          `stdout:\n${outcome.stdout}\nstderr:\n${outcome.stderr}`,
      };
    },
  };
}

// —————————————— 交互工具族（设计 A-1；请求确认 / 请求勾选） ——————————————

/** 失败文案（设计 A-1 **逐字**规定；核心纪律：**绝不说成已同意**）。 */
function notConsented(name: string, reason: string): ToolResult {
  return { ok: false, message: `${name}：未获客户同意（原因：${reason}）→ 不要写盘；如实告知客户，不得假设同意。` };
}

function abortedToolResult(name: string): ToolResult {
  if (name === REQUEST_CONFIRMATION_TOOL_NAME || name === REQUEST_CHOICE_TOOL_NAME) return notConsented(name, "会话已中止");
  if (name === SUBMIT_REPORT_TOOL_NAME) return { ok: false, message: `${name}：报告**未能交回**（原因：会话已中止）` };
  if (name === SHELL_VERDICT_TOOL_NAME) return { ok: false, message: `${name}：审读结论**未能交回**（原因：会话已中止）` };
  if (name === DISPATCH_TASK_TOOL_NAME) return { ok: false, message: `${name}：任务**未能派发**（原因：会话已中止）` };
  return { ok: false, message: `${name}：会话已中止，未执行` };
}

/** 操作者标识（审计用；`operatorId` 形状取自 `OperatorOutcome` 先例）。 */
function operatorTag(operatorId: string | undefined): string {
  return operatorId !== undefined && operatorId !== "" ? `操作者：${operatorId}` : "操作者：未知";
}

/**
 * 交互工具族的公共等待路径（设计 A-6）：调注入的 `CustomerInputFn` → 套 `raceAbort`（**会话中止 =
 * 立即 fail-closed 返回，防悬挂**）→ 外套 `withTimeout`（**超时 = 未获同意**）。
 * 任何异常（含 fn 同步抛错）都**不抛给上层**，一律转成「未获同意」结果（fail-closed；同 run_shell 的
 * 「审核抛错绝不 spawn」纪律）。
 */
async function askCustomer(
  name: string,
  req: CustomerInputRequest,
  fn: CustomerInputFn,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined,
  gate: InteractionGate | undefined,
  metadata: CustomerInputMetadata,
): Promise<CustomerInputOutcome | ToolResult> {
  const label = `${name} 等待客户回应`;
  // 挂起活动闸（G-1）：等待全程通知外部（每轮硬超时据此暂停计时）；引用计数，可重入。
  gate?.begin();
  try {
    // 组合顺序：raceAbort **在内**（中止最先兑现）、时限 **在外**（若配置了时限，它是地板保证）。
    // Promise.resolve().then(…) 归一「同步返回 / 同步抛错 / 异步返回」三种注入 fn 形态。
    const work = raceAbort(Promise.resolve().then(() => { signal?.throwIfAborted(); return fn(req, metadata); }), signal, label);
    // **缺省不设限（G-1）**：timeoutMs 未配置（undefined）→ 一直等客户作答。
    const out = timeoutMs === undefined ? await work : await withTimeout(work, timeoutMs, label);
    if (out === undefined || out === null) {
      return notConsented(name, "客户通道不可用（未返回结果，无人值守？）");
    }
    return out;
  } catch (err) {
    return notConsented(name, reasonOf(err));
  } finally {
    gate?.end();
  }
}

/**
 * request_confirmation：**请求客户确认**（设计 A-1）。调用即向客户呈现 `title`（+可选 `preview`/`detail`）
 * 并**挂起**等其裁决；本层不写盘、不做治理判定，只把裁决**如实**转达模型。
 *
 * 返回给模型的语义（关键，同 `run_shell` 如实转达审核结果的纪律——**绝不谎报**）：
 * - `ok:true` 且措辞「客户已确认」＝**拿到明确同意**（`confirmed:true`）——模型此时才可据此继续（如落盘）；
 * - `ok:false` 且措辞「未获客户同意」＝ 拒绝 / 明确选「否」/ 超时 / 通道不可用 / 出错——**不要写盘**。
 */
function makeRequestConfirmationTool(
  fn: CustomerInputFn,
  timeoutMs: number | undefined,
  gate: InteractionGate | undefined,
  currentTurnId?: () => string | undefined,
  scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">,
): ExecutableTool {
  const name = REQUEST_CONFIRMATION_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const metadata = customerMetadata(call.signal, currentTurnId?.(), scope, call.toolCallId);
      const title = readStringArg(call.args, ["title"]);
      if (title === undefined || title.trim() === "") {
        return { ok: false, message: `${name}: 缺少 title 参数，无法向客户发起确认` };
      }
      const preview = readStringArg(call.args, ["preview"]);
      const detail = readStringArg(call.args, ["detail"]);
      const req: CustomerInputRequest = {
        kind: "confirm",
        title,
        ...(preview !== undefined ? { preview } : {}),
        ...(detail !== undefined ? { detail } : {}),
      };

      const out = await askCustomer(name, req, fn, timeoutMs, call.signal, gate, metadata);
      if ("ok" in out) return out; // 通道故障 / 超时 / 中止 → 未获同意
      if (out.outcome === "declined") {
        return notConsented(name, `客户拒绝${out.reason !== undefined ? `（${out.reason}）` : ""}`);
      }
      if (out.outcome === "unavailable") {
        return notConsented(name, out.reason ?? "客户通道不可用");
      }
      if (out.value.confirmed === true) {
        return {
          ok: true,
          message:
            `${name}：客户已确认「${title}」（confirmed:true；${operatorTag(out.operatorId)}）——已获明确同意。` +
            `可按已同意的内容继续（如写盘，写入须与向客户预览的内容一致）。`,
        };
      }
      return notConsented(name, "客户明确未同意（选择了「否」）");
    },
  };
}

/** 校验并读出 options：非空数组、每项含**非空且唯一**的 id 与非空 label、可选字符串 description。非法 → undefined。 */
function readOptions(args: Record<string, unknown>): CustomerInputOption[] | undefined {
  const raw = args["options"];
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const options: CustomerInputOption[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") return undefined;
    const rec = entry as Record<string, unknown>;
    const id = rec["id"];
    const label = rec["label"];
    if (typeof id !== "string" || id.trim() === "" || seen.has(id)) return undefined;
    if (typeof label !== "string" || label.trim() === "") return undefined;
    const description = typeof rec["description"] === "string" ? rec["description"] : undefined;
    seen.add(id);
    options.push({ id, label, ...(description !== undefined ? { description } : {}) });
  }
  return options;
}

/**
 * request_choice：**请求客户选择**（单选/多选勾选，设计 A-1）。与 request_confirmation 同构：
 * 挂起等裁决、如实转达、本层不写盘。
 *
 * 额外守卫（fail-closed）：通道返回的 `selected` 若含**未提供过的选项 id** → 视为**未获同意**
 * （宁拒勿猜；子集校验在桌面侧另有一道，见设计 A-5）。
 */
function makeRequestChoiceTool(
  fn: CustomerInputFn,
  timeoutMs: number | undefined,
  gate: InteractionGate | undefined,
  currentTurnId?: () => string | undefined,
  scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">,
): ExecutableTool {
  const name = REQUEST_CHOICE_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const metadata = customerMetadata(call.signal, currentTurnId?.(), scope, call.toolCallId);
      const title = readStringArg(call.args, ["title"]);
      if (title === undefined || title.trim() === "") {
        return { ok: false, message: `${name}: 缺少 title 参数，无法向客户发起选择` };
      }
      const options = readOptions(call.args);
      if (options === undefined) {
        return {
          ok: false,
          message: `${name}: options 参数非法（应为非空数组，每项含非空且唯一的 id 与非空 label）`,
        };
      }
      const question = readStringArg(call.args, ["question"]);
      const preview = readStringArg(call.args, ["preview"]);
      const multipleRaw = call.args["multiple"];
      const multiple = typeof multipleRaw === "boolean" ? multipleRaw : undefined;
      const req: CustomerInputRequest = {
        kind: "choice",
        title,
        options,
        ...(question !== undefined ? { question } : {}),
        ...(multiple !== undefined ? { multiple } : {}),
        ...(preview !== undefined ? { preview } : {}),
      };

      const out = await askCustomer(name, req, fn, timeoutMs, call.signal, gate, metadata);
      if ("ok" in out) return out; // 通道故障 / 超时 / 中止 → 未获同意
      if (out.outcome === "declined") {
        return notConsented(name, `客户拒绝${out.reason !== undefined ? `（${out.reason}）` : ""}`);
      }
      if (out.outcome === "unavailable") {
        return notConsented(name, out.reason ?? "客户通道不可用");
      }
      const selected = out.value.selected;
      if (!Array.isArray(selected)) {
        return notConsented(name, "客户通道未返回选择结果（selected 缺失）");
      }
      const known = new Set(options.map((o) => o.id));
      const unknown = selected.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        return notConsented(name, `客户通道返回了未提供过的选项 id：${unknown.join("、")}（视为未获同意）`);
      }
      const labels = selected.map((id) => {
        const opt = options.find((o) => o.id === id);
        return opt !== undefined ? `${opt.id}（${opt.label}）` : id;
      });
      return {
        ok: true,
        message:
          `${name}：客户已选择（${operatorTag(out.operatorId)}）：` +
          `${labels.length > 0 ? labels.join("、") : "（未选择任何项）"}。` +
          `请按客户的选择继续；**未选中的项不得擅自代选**。`,
      };
    },
  };
}

// —————————————— 交报告工具（设计 C-1；submit_report） ——————————————

/** 校验并读出 evidence（可选）：字符串数组、每条非空。非法 → undefined；未提供 → []。 */
function readEvidence(args: Record<string, unknown>): string[] | undefined {
  const raw = args["evidence"];
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || entry.trim() === "") return undefined;
    out.push(entry);
  }
  return out;
}

/**
 * submit_report：**交报告**工具（设计 C-1）。本轮任务完成（或确认无法完成）时，把**模型自己写的**
 * 报告（status + summary + evidence）交回编排（回交 su 汇总）；前端渲染成回交卡。
 *
 * 纪律（与交互工具同）：**本层不写盘、不做治理判定、不进 `GOVERNED_WRITE_TOOLS`**——handler 只把载荷
 * 交给注入的能力并**如实**转达回执：
 * - 交回成功（回执 `ok:true`，或**无回执**——`null`/`undefined` 视为已接收）→ 明确「报告已交回」+ status；
 * - 交回被拒（回执 `ok:false`）/ 能力抛错 → `ok:false`，明确「**未能交回**」+ 原因，**绝不**说成「已交回」。
 * 本工具**不改变任何写盘权限**（写入仍经 write_file/edit_file 与门禁判定）。
 *
 * 悬挂防护（A-6 纪律）：用 `raceAbort`——会话中止即立即返回；本工具是**本地回交**、非交互等待，
 * 故**不设等待超时**（无可配项；不作为会以回执/抛错如实暴露）。
 */
function makeSubmitReportTool(fn: ReportHandbackFn, currentTurnId?: () => string | undefined, diagnostics?: DiagnosticLog, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = SUBMIT_REPORT_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const turnId = currentTurnId?.();
      const statusRaw = call.args["status"];
      if (statusRaw !== "completed" && statusRaw !== "blocked") {
        return { ok: false, message: `${name}: status 参数非法（应为 "completed" 或 "blocked"）` };
      }
      const summary = readStringArg(call.args, ["summary"]);
      if (summary === undefined || summary.trim() === "") {
        return { ok: false, message: `${name}: 缺少 summary 参数（一句话写清改了什么/产出了什么）` };
      }
      const evidence = readEvidence(call.args);
      if (evidence === undefined) {
        return { ok: false, message: `${name}: evidence 参数非法（应为字符串数组，每条非空）` };
      }
      const report: ReportHandbackPayload = {
        status: statusRaw,
        summary,
        ...(evidence.length > 0 ? { evidence } : {}),
      };

      const label = `${name} 交回报告`;
      let receipt: Awaited<ReturnType<ReportHandbackFn>>;
      try {
        diagnostics?.record("report.submit.start", { turnId, toolCallId: call.toolCallId, toolName: name });
        receipt = await raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return turnId === undefined ? fn(report) : fn(report, handbackMetadata(turnId, scope)); }), call.signal, label);
      } catch (err) {
        diagnostics?.error("report.submit.failed", err, { turnId, toolCallId: call.toolCallId, toolName: name });
        return {
          ok: false,
          message: `${name}：报告**未能交回**（原因：${reasonOf(err)}）——请如实向客户说明，修正后可再次交回。`,
        };
      }
      if (receipt === undefined || receipt === null || receipt.ok) {
        diagnostics?.record("report.submit.accepted", { turnId, toolCallId: call.toolCallId, toolName: name, ok: true });
        const detail =
          receipt !== undefined && receipt !== null && receipt.message !== undefined ? ` ${receipt.message}` : "";
        return {
          ok: true,
          message: receipt?.state === "accepted-memory" ? `${name}：候选报告已收到（status: ${statusRaw}），最终保存与投递待本轮收口。${detail}` : `${name}：报告已交回（status: ${statusRaw}）——已把你要说的话交给编排汇总。${detail}`,
        };
      }
      diagnostics?.record("report.submit.rejected", { turnId, toolCallId: call.toolCallId, toolName: name, ok: false });
      return {
        ok: false,
        message: `${name}：报告**未能交回**（回执：${receipt.message ?? "被拒"}）——请如实向客户说明，修正后可再次交回。`,
      };
    },
  };
}

// —————————————— 派发任务工具（设计 H-1；dispatch_task） ——————————————

/**
 * dispatch_task：**派发任务**工具（设计 H-1，**只给 su**）。把「任务与上下文」交给注入的能力
 * （编排路由成目标角色会话的一条输入，前端负责自动开/排队/去重——不在本层）。
 *
 * 纪律（与交互/交报告工具同）：**本层不写盘、不做治理判定、不进 `GOVERNED_WRITE_TOOLS`**——
 * handler 只把载荷交给注入的能力并**如实**转达回执：
 * - 受理成功（回执 `ok:true`，或**无回执**——`null`/`undefined`/`void` 视为已受理）→ 「任务已派发给 <roleId>」，
 *   并**重申「派发 ≠ 授权」**（防模型把派发当成替对方获准写盘）；
 * - 被拒（回执 `ok:false`，如「roleId 不是本项目角色 / 指向 su 自身」）/ 能力抛错 → `ok:false`，
 *   明确「**未能派发**」+ 原因，**绝不**说成「已派发」。
 * 悬挂防护：`raceAbort`（会话中止即立即返回；本地调用，不设等待超时）。
 */
function makeDispatchTaskTool(fn: DispatchTaskFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = DISPATCH_TASK_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const turnId = currentTurnId?.();
      const roleId = readStringArg(call.args, ["roleId", "role_id", "role"]);
      if (roleId === undefined || roleId.trim() === "") {
        return { ok: false, message: `${name}: 缺少 roleId 参数（目标角色 id），无法派发` };
      }
      const task = readStringArg(call.args, ["task"]);
      if (task === undefined || task.trim() === "") {
        return { ok: false, message: `${name}: 缺少 task 参数（自足的任务文本），无法派发` };
      }
      const reason = readStringArg(call.args, ["reason"]);
      const payload: DispatchTaskPayload = {
        roleId,
        task,
        ...(reason !== undefined ? { reason } : {}),
      };

      const label = `${name} 派发`;
      let receipt: Awaited<ReturnType<DispatchTaskFn>>;
      try {
        receipt = await raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return turnId === undefined ? fn(payload) : fn(payload, handbackMetadata(turnId, scope)); }), call.signal, label);
      } catch (err) {
        return {
          ok: false,
          message: `${name}：任务**未能派发**（原因：${reasonOf(err)}）——请如实向客户说明；**不要当它成功、不要宣称已送达**。`,
        };
      }
      if (receipt === undefined || receipt === null || receipt.ok) {
        const detail = receipt !== undefined && receipt !== null && receipt.message !== undefined ? ` ${receipt.message}` : "";
        return {
          ok: true,
          message:
            `${name}：任务已派发给「${roleId}」（status 由对方经回交报告回报）。${detail}` +
            `注意：**派发 ≠ 授权**——对方只在自己已接受边界内执行已授权任务，普通操作无需逐次确认；新建或扩张边界、治理写集仍由 su 请求客户确认；` +
            `你不得代为授权，也不能承诺对方一定会写。`,
        };
      }
      return {
        ok: false,
        message: `${name}：任务**未能派发**（回执：${receipt.message ?? "被拒"}）——请如实向客户说明；**不要当它成功、不要宣称已送达**。`,
      };
    },
  };
}

// —————————————— 审读结论工具（R-1；report_shell_verdict） ——————————————

/**
 * report_shell_verdict：**审读结论**工具（R-1，**只给审读会话**）。把 `{verdict, reason?}` 结构化结论
 * 交给注入的能力（编排捕获后按既有审读链使用）；**结论只以本工具调用为准**——正文里写结论不算
 * （真机根因：助手正文恒为空 ⇒ 旧解析路径恒不可解析）。
 *
 * 纪律：**本层不写盘、不做判定、不执行/不放行任何命令、不改变任何权限**——handler 只转交载荷并**如实**转达：
 * 成功（能力不抛错）→ 「审读结论已交回（verdict: …）」；能力抛错 / 中止 → `ok:false`「**未能交回**」+ 原因，
 * **绝不**说成「已交回」。参数校验：verdict 必须恰为三值枚举（非法 → 拒绝且**不调用能力**）。
 * 悬挂防护：`raceAbort`；本地交回、不设等待超时。
 */
function makeReportShellVerdictTool(fn: ShellVerdictFn): ExecutableTool {
  const name = SHELL_VERDICT_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const verdictRaw = call.args["verdict"];
      if (verdictRaw !== "allow" && verdictRaw !== "deny" && verdictRaw !== "unsure") {
        return { ok: false, message: `${name}: verdict 参数非法（应为 "allow" / "deny" / "unsure" 之一）` };
      }
      const reason = readStringArg(call.args, ["reason"]);
      const payload: ShellVerdictPayload = {
        verdict: verdictRaw,
        ...(reason !== undefined ? { reason } : {}),
      };

      const label = `${name} 交回审读结论`;
      try {
        await raceAbort(Promise.resolve().then(() => { call.signal?.throwIfAborted(); return fn(payload); }), call.signal, label);
      } catch (err) {
        return {
          ok: false,
          message:
            `${name}：审读结论**未能交回**（原因：${reasonOf(err)}）——结论**只**以本工具调用为准` +
            `（正文里写不算）；请修正后重试。`,
        };
      }
      return {
        ok: true,
        message:
          `${name}：审读结论已交回（verdict: ${verdictRaw}）。编排将按既有审读链使用该结论；` +
          `本工具本身**不执行、不放行任何命令**。`,
      };
    },
  };
}

/**
 * 构造受治理工具集：
 * - 写入类 write_file / edit_file（先 gate，获准且配置了 writeRoot 时落盘）；
 * - 读取类 read_file（不过 gate）；
 * - 命令级 run_shell——**仅当注入了 `shellGate` 时才注册**（§7.5.1 的结构性 fail-closed）。
 * gate / shellGate 均由调用方（Pipeline/编排）注入并绑定各自的判定源。
 */
export function buildGovernedTools(gate: WriteGate, options?: GovernedToolsOptions): ToolDefinition[] {
  const readRoot = options?.readRoot ?? process.cwd();
  const writeRoot = options?.writeRoot;
  const tools: ExecutableTool[] = [
    makeWriteFileTool(gate, writeRoot),
    makeEditFileTool(gate, writeRoot),
    makeReadTool(readRoot),
  ];

  // 结构性保证（设计 §7.5.1）：**未注入 ShellGate 时 run_shell 根本不存在**。
  // 「能力缺席」是最强的 fail-closed——不是「注册了再在 execute 里判空」，而是工具压根不在集合里，
  // 模型无法请求、扩展层也无需守它。这是与本模式（写类工具在 execute 内判空）刻意的不同处理。
  const shellGate = options?.shellGate;
  if (shellGate !== undefined) {
    const shellCwd = options?.shellCwd ?? process.cwd();
    const reviewMs =
      options?.shellReviewTimeoutMs ?? readTimeoutMs(process.env, SHELL_REVIEW_TIMEOUT_ENV, DEFAULT_SHELL_REVIEW_TIMEOUT_MS);
    tools.push(makeRunShellTool(shellGate, shellCwd, reviewMs, options?.interactionGate, options?.diagnostics, options?.currentTurnId, options?.extraCredentialEnvVars));
  }

  // 结构性保证（设计 A-1，同 run_shell 先例）：**未注入客户通道时两交互工具根本不存在**。
  // 「有无客户通道」由调用方以**是否注入**表达——判据是「有客户通道」。
  // 工具不存在 ⇒ 模型无法请求确认 ⇒ 也就无从「假设同意」（能力缺席 = 最强 fail-closed，§7.5.1 同款）。
  const customerInput = options?.customerInput;
  if (customerInput !== undefined) {
    // **缺省不设限（G-1）**：仅显式配置（option 或环境变量）才计时。
    const inputMs = options?.customerInputTimeoutMs ?? readOptionalTimeoutMs(process.env, CUSTOMER_INPUT_TIMEOUT_ENV);
    tools.push(makeRequestConfirmationTool(customerInput, inputMs, options?.interactionGate, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
    tools.push(makeRequestChoiceTool(customerInput, inputMs, options?.interactionGate, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  }

  // 结构性保证（设计 C-1，同 run_shell / customerInput 先例）：**未注入回交能力时 `submit_report` 不存在**。
  // 只给项目角色——su 不注入即不注册（能力缺席 = 最强 fail-closed，§7.5.1 同款）。
  const reportHandback = options?.reportHandback;
  if (reportHandback !== undefined) {
    tools.push(makeSubmitReportTool(reportHandback, options?.currentTurnId, options?.diagnostics, { roleId: options?.roleId, runtime: options?.runtime }));
  }

  // 结构性保证（设计 H-1，同 run_shell / customerInput / reportHandback 先例）：
  // **未注入派发能力时 `dispatch_task` 不存在**。只给 su——编排对项目角色不注入即不注册。
  const dispatchTask = options?.dispatchTask;
  if (dispatchTask !== undefined) {
    tools.push(makeDispatchTaskTool(dispatchTask, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  }

  // 结构性保证（R-1，同 run_shell / customerInput 等先例）：**未注入审读结论能力时
  // `report_shell_verdict` 不存在**。只给审读会话——由调用方以是否注入表达。
  const shellVerdict = options?.shellVerdict;
  if (shellVerdict !== undefined) {
    tools.push(makeReportShellVerdictTool(shellVerdict));
  }
  // Observe customer waits without storing titles, previews or selected values.
  return tools.map((tool) => {
    const { parameters, ...description } = describeTool(tool.name);
    const defined: ToolDefinition = { ...tool, ...description, displayInputRule: ["read_file","write_file","edit_file"].includes(tool.name) ? "core-path-v1" : tool.name === "run_shell" ? "core-command-v1" : "none", inputSchema: parameters, async handler(call) {
      if (call.signal?.aborted) return abortedToolResult(tool.name);
      const result = await tool.handler(call);
      return call.signal?.aborted && result.ok ? abortedToolResult(tool.name) : result;
    } };
    if (tool.name !== REQUEST_CONFIRMATION_TOOL_NAME && tool.name !== REQUEST_CHOICE_TOOL_NAME) return defined;
    return { ...defined, async handler(call) {
      const turnId = options?.currentTurnId?.();
      const began = Date.now();
      options?.diagnostics?.record("interaction.wait.start", { turnId, toolCallId: call.toolCallId, toolName: tool.name });
      try {
        const result = await defined.handler(call);
        options?.diagnostics?.record("interaction.wait.end", { turnId, toolCallId: call.toolCallId, toolName: tool.name, ok: result.ok, durationMs: Date.now() - began });
        return result;
      } catch (error) {
        options?.diagnostics?.error("interaction.wait.failed", error, { turnId, toolCallId: call.toolCallId, toolName: tool.name, durationMs: Date.now() - began });
        throw error;
      }
    } };
  });
}

/** SDK-free demo Provider-compatible double; uses only the exact injected tool handlers. */
export function createDemoRuntimeAdapter(options: RuntimeProviderOptions, script: ToolCall[] = []): RuntimeAdapter {
  if (options.toolDisplayMode === "required-v1" && (typeof options.projectToolEvent !== "function" || typeof options.registerToolDisplayProfile !== "function")) throw new Error("Core-managed demo requires tool display projection");
  return {
    async composeContext(role) { return { systemPrompt: role.cardText }; },
    async bindRole(role) {
      options.registerToolDisplayProfile?.({ credentials:[] });
      const queue = createEventQueue<SessionEvent>();
      let disposed = false;
      return {
        contextSource: "in-memory",
        async prompt(text, promptOptions) {
          if (disposed) throw new Error("会话已关闭");
          // A real Core turn already publishes the canonical input. Direct demo use retains its echo.
          if (options.currentTurnId() === undefined) {
            const imageCount = promptOptions?.images?.length ?? 0;
            const input: PromptInputEventDetail = { source: "prompt-input", text, ...(imageCount > 0 ? { imageCount } : {}) };
            queue.push({ kind: "message", summary: `用户指令：${text}`, detail: input });
          }
          for (const call of script) {
            const tool = options.tools.find((candidate) => candidate.name === call.name);
            const source = { toolName:call.name, toolCallId: (call as {toolCallId?:string}).toolCallId, turnId:options.currentTurnId(), runtime:options.runtime, roleId:role.id, input:{rule:tool?.displayInputRule,args:call.args} };
            queue.push(options.projectToolEvent ? options.projectToolEvent({...source,phase:"start",origin:"handler-start"}) : { kind: "tool_call", summary: `模型请求调用 ${call.name}`, detail: call });
            const result = tool ? await tool.handler(call) : { ok: false, message: `未知工具：${call.name}` };
            queue.push(options.projectToolEvent ? options.projectToolEvent({...source,phase:"result",origin:"handler-result",result}) : { kind: result.ok ? "accepted" : "denied", summary: result.message, detail: { call, result } });
          }
          queue.push({ kind: "settled", summary: "会话结束", detail: { outcome: "completed" } });
        },
        events: () => queue.stream,
        async abort() { /* Service cancels the injected handlers. */ },
        async dispose() { disposed = true; queue.close(); },
        roleId: role.id,
      };
    },
  };
}

