// 受治理工具集（契约 §4 的 src/provider/pi/tools.ts）。
//
// 归属：Pi适配器角色。
// 职责边界（role-card）：本层**只**把门禁引擎的判定接到工具调用的"写入之前"，
// 并（在获准后）执行落盘。任何路径**治理判定**都不在这里进行——gate 由 Pipeline 注入并绑定 resolveWrite。
//
// 关键约定（契约 §4 / 设计 §3.1）：
// - write_file / edit_file 处理器**先调 gate(abs)**；
// - allowed:false 时**不执行任何文件系统副作用**（不建目录、不建文件、不碰既有文件），
//   返回含按根分组允许路径（F10）的可读信息；
// - allowed:true 时才真正落盘（设计 §3.1 块2）：mkdir -p 父目录 → 原子写（同目录 temp + rename）。
//
// 写根（writeRoot，设计 §3.1）：
// - 写类工具在调 gate 前把 path 解析为绝对路径
//   `abs = isAbsolute(path) ? path : resolve(writeRoot, path)`，**把 abs 传给 gate**，写入也用**同一个** abs；
// - 这与 resolveWrite 把相对路径按项目根解释的既有行为同源（resolve-write.ts 第 108–111 行）；
// - **writeRoot 必须恒等于 projectRoot**（与 readRoot 是两回事：读根≠写根，别混用，见设计 §6.2）；
// - **未配置 writeRoot 时写类工具拒绝落盘**（fail-closed：写根不明 ⇒ 不写；与 §7.5「缺审核者→能力缺席」同旨）。
//   这保证未显式声明写根的调用方（演示替身等）行为仍是"只判定、不落盘"。
//
// 安全（设计 §6，见 src/common/pi-adapter/fs-write.ts）：
// - TOCTOU / 符号链接、junction 逃逸：写入前**紧邻处**再解析一次真实父目录，复核仍在 writeRoot 内；
// - gate 抛错：发生在**任何文件系统副作用之前**，不得创建文件或目录；
// - Windows：拒绝含 `:`（ADS）、保留设备名、结尾点/空格等的路径段（能防则防）。
//
// 读能力（read_file）：
// - 模型需要能读自己的角色文档来还原验收标准，否则"瞎着"无法调查。
// - **读不经过写门禁（gate）**：角色边界是**写入边界**——它约束的是"能否改这个文件"，
//   而不是"能否看这个文件"。读不产生任何变更，因此不是边界的威胁面。
// - 代价（如实标注）：读是本进程权限内的任意路径读取，不受边界约束。
//
// 本文件**不导入任何 Pi 包**，可独立于 Pi 安装被单测加载。
//
// run_shell（V3 第一步，设计 §7.2 / §7.5 / §7.7 / §7.9）：
// - shell 的写入（`echo x > 路径`）**不经过 resolveWrite**，故它走**判据不同**的命令级闸 ShellGate：
//   判的是「这条命令是否被允许执行」，不是「路径是否在边界内」。本层**只调用** ShellGate，不含任何审核策略。
// - execute 顺序：取 command → `await shellGate(req)` → **仅当恰好 `allow:true`** 才 spawn → 收集 stdout/stderr/exit。
//   deny / undefined / 抛错 / 超时 → **绝不 spawn**（fail-closed）。
// - **未注入 ShellGate 时 run_shell 根本不被注册**（能力缺席 = 最强 fail-closed，§7.5.1）——这是结构性保证，
//   不是「注册了再在 execute 里判空」。
// - run_shell **不加入 GOVERNED_WRITE_TOOLS**（§7.7）：其 input 是 `{command}`，没有 `path`，加了等于没加；
//   它**不喂 resolveWrite**（从命令串解析路径是拿启发式当判据，制造假安全）。
// - **token 机制已删除**（设计 §7.1 第 3 条）：旧设计「审核签 token、扩展层凭 token 放行」已废弃——token 可由
//   公开输入（toolCallId + command）**确定性推导**，「token 一致」只证明「调用方会算哈希」，**证明不了审核发生过**。
//   审核整条现在位于**唯一 spawn 点 execute**（结构性保证）；扩展层退为**能力级 kill-switch**（见 shellKillSwitch）。
// - **执行环境收窄（§7.9）**：spawn 时构造**过滤后的 env**（剥离凭据变量 PI_CREDENTIAL_ENV_VARS），绝不继承
//   含凭据的 process.env。此项归「执行环境收窄」，与决定「是否允许执行」的审核层**正交**。
//
// finalize_bootstrap（设计 §13.1 / T36）：
// - su 的「主动」＝一个**受治理工具** `finalize_bootstrap`，语义是「**提议收口、挂起等客户确认**」——**不是**
//   「立即完成」（与 shell 闸 (a) 操作者确认同构：没有确认就不执行）。
// - 注册条件**照 run_shell 先例**：**未注入能力即不注册**（「是否创世态」由调用方以**是否注入**表达——
//   编排只在创世态注入）。**不是一直注册着。**
// - **本层不写盘**：真正的写（`.ans`/治理边界文档/manifest）全在**编排的 finalize** 侧、每笔先经 `resolveWrite`；
//   本层只 `await 注入的 fn()` 并把 `{ok, message}` **如实**转达模型（措辞须让模型理解「提案+等待确认」，
//   绝不把「未完成」说成「已完成」）。
// - **绝不加入 `GOVERNED_WRITE_TOOLS` 之类写类集合**：它本身不改文件，加进去等于没加（同 run_shell §7.7 的理由）。

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { WriteGate, ShellGate, ShellReviewResult, FinalizeBootstrapFn } from "./session.ts";
import type { WriteDecision } from "../../model/decision.ts";
import { formatDenialMessage } from "../../common/pi-adapter/format-denial.ts";
import {
  DEFAULT_SHELL_REVIEW_TIMEOUT_MS,
  SHELL_REVIEW_TIMEOUT_ENV,
  readTimeoutMs,
  withTimeout,
} from "../../common/pi-adapter/timeout.ts";
import { PI_CREDENTIAL_ENV_VARS } from "../../common/shared/runtime-shared.ts";
import {
  atomicWriteFile,
  ensureParentDir,
  guardWriteTarget,
  recheckParentInsideWriteRoot,
  resolveWriteAbs,
} from "../../common/pi-adapter/fs-write.ts";

/** 工具执行结果；message 面向模型与用户，拒绝时含按根分组的允许路径。 */
export interface ToolResult {
  ok: boolean;
  message: string;
}

/** run_shell 工具名（唯一 shell 入口）。扩展层据此设能力级 kill-switch，工具集据此注册。 */
export const SHELL_TOOL_NAME = "run_shell";

/**
 * finalize_bootstrap 工具名（设计 §13.1 / T36；唯一收口提议入口）。
 *
 * **它不在任何写类集合里**（**绝不**加入 `GOVERNED_WRITE_TOOLS` 之类）：它**本身不改文件**——真正的写
 * （`.ans`、治理边界文档、manifest）全在**编排的 finalize** 侧、且**每一笔先经 `resolveWrite`**。本层只
 * **注册并调用**注入的能力，不碰文件系统。故扩展层 `tool_call` 钩子对它**放行**（既非 `run_shell`、又
 * 无 `path`，`shellKillSwitch` 与写类判据都不命中）。
 */
export const FINALIZE_BOOTSTRAP_TOOL_NAME = "finalize_bootstrap";

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

/** 本角色对外提供的受治理工具定义（与 Pi 的 ToolDefinition 无关）。 */
export interface ToolDefinition {
  name: string;
  handler(call: {
    name: string;
    args: Record<string, unknown>;
    /** 本次调用的 id（Pi 在 tool_call 时生成）；run_shell 把它透传给 ShellGate 供留痕用。缺省时视为 ""。 */
    toolCallId?: string;
  }): Promise<ToolResult>;
}

/** buildGovernedTools 的可选参数（契约 §4 签名不变，仅加可选扩展）。 */
export interface GovernedToolsOptions {
  /** read_file 解析相对路径的基准目录；缺省 process.cwd()。 */
  readRoot?: string;
  /**
   * 写类工具（write_file / edit_file）解析相对路径、并据以判定落盘的安全基准。
   * **必须恒等于 projectRoot**（写根 ≠ 读根）。未配置时写类工具仅判定、不落盘（fail-closed）。
   */
  writeRoot?: string;
  /**
   * shell 命令级闸（设计 §7.2）。**未注入时 run_shell 根本不被注册**（§7.5.1 能力缺席 = 最强 fail-closed）。
   * 由编排装配后注入——本层不含任何审核策略，只调用它。它的 arm 与否同时也是扩展层 kill-switch 的判据
   * （见 shellKillSwitch）。
   */
  shellGate?: ShellGate;
  /**
   * run_shell 的固定工作目录；**必须钉在 projectRoot**（爆炸半径限制，§7.2）。缺省 process.cwd()。
   */
  shellCwd?: string;
  /** shell 审核硬超时（毫秒）；缺省读 ANS_PI_SHELL_REVIEW_TIMEOUT_MS，再缺省 120000。**超时 = 拒绝**。 */
  shellReviewTimeoutMs?: number;
  /**
   * 创世收口能力（设计 §13.1 / T36）。**未注入时 `finalize_bootstrap` 根本不被注册**
   * （**§7.5.1 同款能力缺席 = 最强 fail-closed**，与 `shellGate` 先例**逐字同构**）。
   *
   * **注册条件怎么表达「创世态」**：本层**同步**、不查文件系统，「是否创世态」由**调用方**判定——
   * 调用方（编排/装配，持 `isGenesisState`）**只在创世态才注入**本能力；非创世态**不注入** ⇒ 工具不在集合里。
   * 于是「非创世态 → 不存在」由「不注入」表达（与 `shellGate` 的 arm 判据同构）；**另有的显式守卫**
   * （非创世态调用即拒）在注入的 finalize **本身**（编排 `createFinalizeProposer` 守卫 1，返回 `not-genesis`）。
   */
  finalizeBootstrap?: FinalizeBootstrapFn;
}

/** 从工具参数里取出目标路径；容忍 path / file_path / filePath 三种命名。 */
function readTargetPath(args: Record<string, unknown>): string | undefined {
  const candidate = args["path"] ?? args["file_path"] ?? args["filePath"];
  return typeof candidate === "string" ? candidate : undefined;
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
): Promise<ToolResult> {
  // 1) 只读守卫：词法 + 名称安全 + 真实路径复核（挡 symlink/junction 逃逸）——在 mkdir 之前。
  const guarded = await guardWriteTarget(abs, writeRoot);
  if (!guarded.ok) {
    return { ok: false, message: `${name} 拒绝写入：${guarded.reason}（未写入，目标文件未被触碰）` };
  }

  // 2) 建父目录（仅 write_file 需要；edit_file 目标必已存在）。
  if (opts.createParent) {
    try {
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
    await atomicWriteFile(abs, data);
  } catch (err) {
    return { ok: false, message: `${name} 写入失败：${path}（${reasonOf(err)}）` };
  }
  return { ok: true, message: `${name} 已获准并落盘：${path}（${data.length} 字节写入 ${abs}）` };
}

/** write_file：获准后 mkdir -p 父目录 → 原子写 content（UTF-8，不加 BOM）。 */
function makeWriteFileTool(gate: WriteGate, writeRoot: string | undefined): ToolDefinition {
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
      return writeGuarded(name, path, pre.abs, writeRoot, Buffer.from(content, "utf8"), { createParent: true });
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
function makeEditFileTool(gate: WriteGate, writeRoot: string | undefined): ToolDefinition {
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

      return writeGuarded(name, path, pre.abs, writeRoot, data, { createParent: false });
    },
  };
}

/** 构造受治理的读取工具（read_file）：读不经过写门禁。 */
function makeReadTool(readRoot: string): ToolDefinition {
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
export function buildShellEnv(base: Record<string, string | undefined>): Record<string, string> {
  const denied = new Set(PI_CREDENTIAL_ENV_VARS.map((name) => name.toUpperCase()));
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
}

/**
 * 直接以 argv 启动子进程（**shell: false**，不经 shell 再解析）。
 * cwd **固定**为传入值（= projectRoot），不接受调用方指定（爆炸半径限制，§7.2）。
 * env **必须**是剥离凭据后的过滤环境（§7.9，见 buildShellEnv），**绝不**直接传 process.env。
 * 启动失败 / 得到错误 → 以 `error` 返回，绝不抛出（上层据此回 ok:false）。
 */
function runShell(argv: string[], cwd: string, env: Record<string, string>): Promise<ShellExecOutcome> {
  return new Promise((resolveOutcome) => {
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
    const settle = (outcome: ShellExecOutcome): void => resolveOutcome(outcome);
    child.stdout?.on("data", (d: Buffer) => {
      if (outLen < MAX_SHELL_OUTPUT_BYTES) {
        out.push(d);
        outLen += d.length;
      }
    });
    child.stderr?.on("data", (d: Buffer) => {
      if (errLen < MAX_SHELL_OUTPUT_BYTES) {
        errOut.push(d);
        errLen += d.length;
      }
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
function makeRunShellTool(shellGate: ShellGate, shellCwd: string, reviewTimeoutMs: number): ToolDefinition {
  const name = SHELL_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const command = readStringArg(call.args, ["command", "cmd"]);
      if (command === undefined || command.trim() === "") {
        return { ok: false, message: `${name}: 缺少 command 参数，无法审核执行` };
      }
      const argv = splitCommand(command);
      if (argv.length === 0) return { ok: false, message: `${name}: command 为空，无命令可执行` };
      const cwd = shellCwd;
      const toolCallId = typeof call.toolCallId === "string" ? call.toolCallId : "";

      // —— 唯一的命令级闸：只有恰好 allow:true 才继续（判定与执行在同一条我们的代码路径上）——
      let review: ShellReviewResult | undefined;
      try {
        review = await withTimeout(shellGate({ command, argv, cwd, toolCallId }), reviewTimeoutMs, `${name} 审核`);
      } catch (err) {
        // 审核抛错 / 超时 → **绝不 spawn**（fail-closed；超时 = 拒绝，§7.5.2）。
        return { ok: false, message: `${name} 未执行：审核未通过（${reasonOf(err)}）` };
      }
      // 恰好 allow:true 才放行；deny / undefined / 任何非明确 allow → 一律不执行（无 token 可依）。
      if (review === undefined || review === null || review.allow !== true) {
        const denied = review !== undefined && review !== null && review.allow === false ? review : undefined;
        const why = denied !== undefined ? denied.reason : "审核未返回明确的允许（缺 allow:true）";
        const by = denied !== undefined ? `，审者：${denied.by}` : "";
        return { ok: false, message: `${name} 未执行：审核拒绝（${why}${by}）` };
      }

      // —— 恰好 allow:true：构造**剥离凭据后**的 env（§7.9），随后**才**启动子进程 ——
      const outcome = await runShell(argv, cwd, buildShellEnv(process.env));
      if (outcome.error !== undefined) {
        return { ok: false, message: `${name} 执行失败（未能启动或运行）：${outcome.error}` };
      }
      const code = outcome.code;
      return {
        ok: code === 0,
        message:
          `${name} 已执行：${command}（exit ${code ?? "?"}${outcome.signal ? `，signal ${outcome.signal}` : ""}）\n` +
          `stdout:\n${outcome.stdout}\nstderr:\n${outcome.stderr}`,
      };
    },
  };
}

/**
 * finalize_bootstrap：**收口提议**工具（设计 §13.1 / T36）。调用注入的能力即「**提议收口并挂起等客户确认**」
 * （**不是「立即完成」**）——该能力**内部**走门禁、经 `OperatorChannel` 等客户确认、确认通过才落盘；
 * **本层不碰文件系统**（不 mkdir、不 open、不 write），只把结果**如实**转达给模型。
 *
 * **为何是本层职责**：与 `run_shell` 同构——本层**只调用**注入的能力，**不含任何判定/写盘策略**；真正的写
 * 与门禁在编排的 finalize 侧（`src/common/编排/finalize.ts`，已证明过 `resolveWrite`）。
 *
 * **返回给模型的措辞**（关键，T36 要求）：必须让模型理解「**提案 + 等待确认**」，**绝不**把「未完成」说成
 * 「已完成」。故：
 *   · `ok:true`（`status==="completed"`）→ 明确「**收口完成（客户已确认）**」；
 *   · `ok:false` → 明确「**收口未完成**（项目仍处于创世态，边界尚未 pin）」，并附能力自身的 `message`
 *     作为原因（如「收口未获客户确认」「通道不可用/超时」「非创世态」…）。
 */
function makeFinalizeBootstrapTool(finalizeBootstrap: FinalizeBootstrapFn): ToolDefinition {
  const name = FINALIZE_BOOTSTRAP_TOOL_NAME;
  return {
    name,
    async handler(call) {
      void call; // finalize_bootstrap 无参数：acceptanceSource/now 由编排侧决定，模型不该提供。
      let result: Awaited<ReturnType<FinalizeBootstrapFn>>;
      try {
        // 调用即「提议收口并挂起等客户确认」——能力内部完成确认与（获准时）落盘；本层不写盘。
        result = await finalizeBootstrap();
      } catch (err) {
        // 能力抛错（不应发生，编排侧以结果返回而非抛错）→ fail-closed：**未完成**。
        return {
          ok: false,
          message:
            `${name}：**收口未完成**（提案未能执行，项目仍处于创世态，边界尚未 pin）：${reasonOf(err)}。` +
            `本工具语义是「提议收口、等待客户确认」——未获确认即不完成；你可稍后再提议。`,
        };
      }
      if (result.ok) {
        return {
          ok: true,
          message: `${name}：**收口完成**（客户已确认）——项目由「创世态」进入「正式态」。${result.message ?? ""}`,
        };
      }
      return {
        ok: false,
        message:
          `${name}：**收口未完成**（项目仍处于创世态，边界尚未 pin）。${result.message ?? ""}` +
          `本工具语义是「提议收口、等待客户确认」——未获确认即不完成；你可继续完善，或稍后再提议收口。`,
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
  const tools: ToolDefinition[] = [
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
    tools.push(makeRunShellTool(shellGate, shellCwd, reviewMs));
  }

  // 结构性保证（§13.1，同 §7.5.1 先例）：**未注入 finalize 能力时 `finalize_bootstrap` 根本不存在**。
  // 「是否创世态」由调用方以**是否注入**表达（编排持 `isGenesisState`，只在创世态注入）；故非创世态 ⇒ 不注入
  // ⇒ 工具不在集合里。这不是「注册了再在 execute 里判空」，而是能力缺席——与 run_shell 逐字同构。
  const finalizeBootstrap = options?.finalizeBootstrap;
  if (finalizeBootstrap !== undefined) {
    tools.push(makeFinalizeBootstrapTool(finalizeBootstrap));
  }
  return tools;
}
