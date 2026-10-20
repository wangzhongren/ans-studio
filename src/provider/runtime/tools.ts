// Shared ANS tool execution. Owner: 运行时核心. SDK adapters receive handlers by injection.
import { coreToolTarget } from "../../common/runtime-core/tool-display.ts";
import { createEventQueue } from "../../common/runtime-core/event-queue.ts";
import { resolveProjectList } from "../../common/runtime-core/list-dir.ts";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
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
  HandOffIntentFn,
  HandOffIntentKind,
  HandOffIntentPayload,
  RequestClarificationFn,
  RequestClarificationPayload,
  RoleStatusFn,
  RoleStatusPayload,
  SessionTailFn,
  ProposeRecoveryFn,
  ProposeRecoveryPayload,
  RecoveryAction,
  InstallSkillFn,
  InstallSkillPayload,
  InstallSkillReceipt,
  UninstallSkillFn,
  InstallMcpFn,
  InstallMcpPayload,
  UninstallMcpFn,
  FlowGetFn,
  FlowStepUpdateFn,
  FlowStepSupersedeFn,
  FlowToolEvidence,
  FlowToolResult,
  FlowToolStatus,
  FlowToolStepKind,
  FlowToolView,
  FlowToolStepView,
  ShellVerdictFn,
  ShellVerdictPayload,
  InteractionGate,
  PromptInputEventDetail, RuntimeAdapter, RuntimeProviderOptions, SessionEvent, ToolCall,
  ToolDefinition, ToolResult, GovernedToolsOptions,
  GovernanceCardKind, GovernanceCardMetadata, GovernanceChoiceCardKind, GovernanceConfirmCardKind, GovernanceFlowMetadata,
} from "../../model/runtime.ts";
import { GOVERNANCE_SLUG_PATTERN, FLOW_TOOL_STATUSES, FLOW_TOOL_STEP_KINDS } from "../../model/runtime.ts";
import type { WriteDecision } from "../../model/decision.ts";
import type { DiagnosticLog } from "../../model/runtime.ts";
import { describeTool } from "./schema.ts";
import { formatDenialMessage } from "../../common/runtime-core/format-denial.ts";
// 2026-10-18 真机修复：写前校验角色 boundary.yaml 内容（**只经 Service 公共出口**——Provider 不直接
// import 门禁引擎私有 `common/门禁引擎/boundary-yaml.ts`；该出口再导出**同一函数引用**，单一来源不变，
// 与运行时边界解析同一实现，避免「写得进、枚举不了」）。
import { validateBoundaryYamlText } from "../../service/boundary/resolve-boundary.ts";
import {
  CUSTOMER_INPUT_TIMEOUT_ENV,
  DEFAULT_SHELL_EXEC_TIMEOUT_MS,
  DEFAULT_SHELL_REVIEW_TIMEOUT_MS,
  SHELL_EXEC_TIMEOUT_ENV,
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

/** hand_off_intent 工具名（W6-A；联络官把客户意图交接给报告员——交接 ≠ 客户批准）。 */
export const HAND_OFF_INTENT_TOOL_NAME = "hand_off_intent";

/** request_clarification 工具名（W6-A；报告员把澄清问题送到主入口——不弹决定卡）。 */
export const REQUEST_CLARIFICATION_TOOL_NAME = "request_clarification";

/** report_shell_verdict 工具名（R-1；审读会话交回结构化审读结论；与编排 shell-gate.ts:206 同串）。 */
export const SHELL_VERDICT_TOOL_NAME = "report_shell_verdict";

/** role_status 工具名（G-2/R1；su 只读状态查询——看护回路自查入口，纯读无副作用）。 */
export const ROLE_STATUS_TOOL_NAME = "role_status";

/** session_tail 工具名（G-2/R1；su 只读会话尾线——受保护投影后的规范化行，纯读无副作用）。 */
export const SESSION_TAIL_TOOL_NAME = "session_tail";

/** propose_recovery 工具名（G-2/R2；su 恢复提议——只提议，客户一键确认后由应用执行）。 */
export const PROPOSE_RECOVERY_TOOL_NAME = "propose_recovery";

/** install_skill 工具名（G-4/I2；su 技能安装——校验＋激活＋回执，工具不写盘）。 */
export const INSTALL_SKILL_TOOL_NAME = "install_skill";

/** uninstall_skill 工具名（G-4/I2；su 技能卸载——校验＋激活＋回执，工具不写盘）。 */
export const UNINSTALL_SKILL_TOOL_NAME = "uninstall_skill";

/** install_mcp 工具名（G-4 V2；su 外来 MCP 安装——校验＋激活＋回执，工具不写盘）。 */
export const INSTALL_MCP_TOOL_NAME = "install_mcp";

/** uninstall_mcp 工具名（G-4 V2；su 外来 MCP 卸载——校验＋激活＋回执，工具不写盘）。 */
export const UNINSTALL_MCP_TOOL_NAME = "uninstall_mcp";

/** flow_get 工具名（2026-10-20 flow 文件方法化；只读流程结构化视图）。 */
export const FLOW_GET_TOOL_NAME = "flow_get";

/** flow_step_update 工具名（2026-10-20；推进单个步骤状态——迁移/权限/证据裁决在编排 flow-service）。 */
export const FLOW_STEP_UPDATE_TOOL_NAME = "flow_step_update";

/** flow_step_supersede 工具名（2026-10-20；新步骤取代旧步骤，Steward/Lead（工作流管理者）——服务端校验）。 */
export const FLOW_STEP_SUPERSEDE_TOOL_NAME = "flow_step_supersede";

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

// —————————————— 治理流程元数据（2026-10-17 PM 评审 §5.8；只做形状校验，不做治理判定） ——————————————
//
// flowId/stepId/cardKind 全部可选：缺席＝旧调用形状、零行为变化。给出时按 slug/枚举**严格**校验——
// 非法格式返回 ok:false 并说明（不猜测、不截断、不静默丢弃）；**不调用客户通道/派发能力**。
// 本层只把合法字段原样并入卡片请求与 metadata / 派发载荷；是否构成治理决定由编排按账本判定。

const GOVERNANCE_SLUG = new RegExp(GOVERNANCE_SLUG_PATTERN);
// 2026-10-18：`intent-confirm`（客户需求确认卡，主理在 hand_off_intent 前发出）加入 choice 白名单。
// 2026-10-20 客户拍板「勾了替我决策就不用我管」：它进入 `GOVERNANCE_CARD_GROUP` 的 decision 组——
// 判断 agent 可代批 `confirm`；`revise` 仍交回客户/发起角色（不替客户修改）。
const CHOICE_CARD_KINDS: readonly GovernanceChoiceCardKind[] = ["proposal", "appointment", "acceptance", "intent-confirm"];
const CONFIRM_CARD_KINDS: readonly GovernanceConfirmCardKind[] = ["write", "appointment-write", "schedule-write"];

type GovernanceArgs<T> = { ok: true; value: T } | { ok: false; result: ToolResult };

/** 读取可选 slug 字段：缺席＝合法；非字符串/不匹配 pattern ⇒ ok:false（不猜测、不截断）。 */
function readGovernanceSlugArg(args: Record<string, unknown>, key: string, toolName: string): GovernanceArgs<string | undefined> {
  const value = args[key];
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "string" || !GOVERNANCE_SLUG.test(value)) {
    return { ok: false, result: { ok: false, message: `${toolName}: 参数 ${key} 非法（须为匹配 ${GOVERNANCE_SLUG_PATTERN} 的字符串）——未执行；请更正后重试` } };
  }
  return { ok: true, value };
}

function readGovernanceFlowArgs(args: Record<string, unknown>, toolName: string): GovernanceArgs<GovernanceFlowMetadata> {
  const flowId = readGovernanceSlugArg(args, "flowId", toolName);
  if (!flowId.ok) return flowId;
  const stepId = readGovernanceSlugArg(args, "stepId", toolName);
  if (!stepId.ok) return stepId;
  return {
    ok: true,
    value: {
      ...(flowId.value !== undefined ? { flowId: flowId.value } : {}),
      ...(stepId.value !== undefined ? { stepId: stepId.value } : {}),
    },
  };
}

function readGovernanceCardArgs(args: Record<string, unknown>, toolName: string, allowed: readonly GovernanceCardKind[]): GovernanceArgs<GovernanceCardMetadata> {
  const flow = readGovernanceFlowArgs(args, toolName);
  if (!flow.ok) return flow;
  const cardKind = args["cardKind"];
  if (cardKind !== undefined && (typeof cardKind !== "string" || !(allowed as readonly string[]).includes(cardKind))) {
    return { ok: false, result: { ok: false, message: `${toolName}: 参数 cardKind 非法（本工具允许：${allowed.join(" / ")}）——未向客户发卡；请更正后重试` } };
  }
  return {
    ok: true,
    value: { ...flow.value, ...(cardKind !== undefined ? { cardKind: cardKind as GovernanceCardKind } : {}) },
  };
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

/** 角色边界文档路径（写前内容校验只针对它；role-card.md 等不校验内容）。 */
const ROLE_BOUNDARY_WRITE_RE = /^(?:\.\/)?角色卡\/[^/]+\/boundary\.yaml$/i;

function projectRelForWrite(path: string, writeRoot: string | undefined): string | undefined {
  const raw = path.replace(/\\/g, "/");
  if (writeRoot === undefined) return raw;
  try {
    const abs = resolveWriteAbs(path, writeRoot);
    const rel = relative(writeRoot, abs).replace(/\\/g, "/");
    if (rel === "" || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) return raw;
    return rel;
  } catch {
    return raw;
  }
}

/**
 * 写前内容校验（2026-10-18 真机：Nominator 写出顶层含 version/roleId/root 的非法 boundary.yaml，
 * 应用照单写入后新角色无法枚举）。用门禁引擎 Service 公共出口 `validateBoundaryYamlText`（与运行时
 * 边界解析同一实现）；非法 ⇒ **拒绝写入、零文件副作用**，回执给出原因与顶层键约束。
 * 只对 `角色卡/<id>/boundary.yaml` 生效；`role-card.md` 与其他路径不校验内容。
 */
function rejectInvalidBoundaryWrite(
  name: string,
  path: string,
  content: string,
  writeRoot: string | undefined,
): ToolResult | undefined {
  const rel = projectRelForWrite(path, writeRoot);
  if (rel === undefined || !ROLE_BOUNDARY_WRITE_RE.test(rel)) return undefined;
  const validation = validateBoundaryYamlText(content);
  if (validation.ok) return undefined;
  return {
    ok: false,
    message:
      `${name} 拒绝写入 ${path}：boundary.yaml 格式非法：${validation.message}；` +
      `顶层只允许 role / entries / archived，请按模板重写（未写入，目标文件未被触碰）`,
  };
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

      // 写前内容校验（仅角色 boundary.yaml）：非法 ⇒ 拒绝，任何文件系统副作用之前返回。
      const invalidBoundary = rejectInvalidBoundaryWrite(name, path, content, writeRoot);
      if (invalidBoundary !== undefined) return invalidBoundary;

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
      // 编辑后的 boundary.yaml 也必须能通过同一校验（拒绝时文件保持不变）。
      const invalidBoundary = rejectInvalidBoundaryWrite(name, path, next, writeRoot);
      if (invalidBoundary !== undefined) return invalidBoundary;
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
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        // 真机噪声修复：目录不能用 read_file 读——明确指路 list_dir，避免继续猜文件名。
        if (code === "EISDIR") {
          return { ok: false, message: `read_file 失败：${path} 是目录——请改用 list_dir 列出目录后再读文件` };
        }
        const reason = err instanceof Error ? err.message : String(err);
        return { ok: false, message: `read_file 失败：${path}（${reason}）` };
      }
    },
  };
}

/** 普通角色只读目录工具名（与 judge 的 `judge_list_dir` 名字独立）。 */
export const LIST_DIR_TOOL_NAME = "list_dir";

const LIST_DIR_ERROR_TEXT: Record<string, string> = {
  "invalid-path": "路径非法（已拒绝）",
  "outside-root": "路径在项目根之外（已拒绝）",
  sensitive: "该路径属于敏感文件/目录（已拒绝）",
  "not-found": "路径不存在或不可访问",
  "not-a-directory": "目标不是目录（读取文件请用 read_file）",
  "read-failed": "目录读取失败",
};

/**
 * 构造只读目录列举工具（list_dir）：项目根内、只列一层、目录名以 `/` 结尾、最多 200 项，
 * `.env`/密钥/凭据类文件与 `.git/` 等敏感项**不列名**；不写盘、不执行、不过写门禁。
 */
function makeListDirTool(projectRoot: string): ExecutableTool {
  return {
    name: LIST_DIR_TOOL_NAME,
    async handler(call) {
      if (call.signal?.aborted) return { ok: false, message: "list_dir：本轮已中止，未执行" };
      const raw = call.args?.path;
      if (raw !== undefined && typeof raw !== "string") {
        return { ok: false, message: "list_dir: path 必须是字符串" };
      }
      const result = await resolveProjectList({ projectRoot, ...(raw !== undefined ? { path: raw } : {}) });
      if (!result.ok) {
        const text = LIST_DIR_ERROR_TEXT[result.code] ?? "目录列举失败";
        return { ok: false, message: `list_dir：${text}。不要据此假设目录内容。` };
      }
      const body = result.entries.length > 0 ? result.entries.join("\n") : "（空目录或无可列条目）";
      return { ok: true, message: `list_dir: ${result.rel}\n\n${body}${result.truncated ? "\n\n[已截断：条目超过上限]" : ""}` };
    },
  };
}

/** 单条流的输出上限（1 MiB）；超出即截断，避免内存被大输出撑爆。 */
const MAX_SHELL_OUTPUT_BYTES = 1_048_576;

/**
 * 把命令串拆成 argv 与「未加引号片段」（best-effort，口径**唯一**）。
 *
 * **这是信息性拆分**：`argv` 仅供 ShellGate 参考（设计 §7 的 `classifyShell(argv)`）与执行；
 * **执行层不经 shell**（见 runShell 的 `shell: false`），故即便拆分与真实语义有偏差，也不会造成
 * shell 元字符注入——`echo x > f`、`$(...)`、管道等在此只是**普通参数**，没有 shell 去解释它们。
 * 拆分规则：按空白切分，单/双引号内不切分（引号本身移除）；不做变量展开、不做转义解释。
 *
 * `unquoted[i]` = argv[i] 中出现在**引号之外**的字符按序拼接——只服务于 F-7 执行层守卫的
 * 「独立操作符 token」判定（引号内内容永不在其中 ⇒ 引号包裹的 `\|`、`|` 等字面量不被误杀）。
 * 判定与执行**同源**：两者都来自本次拆分，不会各算各的。
 */
interface CommandTokenization {
  /** 执行用 argv（与历史 splitCommand 的输出逐字一致）。 */
  argv: string[];
  /** argv[i] 的「未加引号片段」（引号内与引号本身不计）。 */
  unquoted: string[];
}

function splitCommand(command: string): CommandTokenization {
  const argv: string[] = [];
  const unquoted: string[] = [];
  let cur: string | null = null;
  let raw: string | null = null;
  let quote: string | null = null;
  const push = (): void => {
    if (cur === null) return;
    argv.push(cur);
    unquoted.push(raw ?? "");
    cur = null;
    raw = null;
  };
  for (const ch of command) {
    if (quote !== null) {
      if (ch === quote) quote = null;
      else cur = (cur ?? "") + ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur = cur ?? "";
    } else if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      push();
    } else {
      cur = (cur ?? "") + ch;
      raw = (raw ?? "") + ch;
    }
  }
  push();
  return { argv, unquoted };
}

// —————————————— F-7：执行层 shell 语法 UX 守卫（不触碰门禁引擎的 classify-shell 立场） ——————————————
//
// 背景（kanban-live 真机轮）：命令串→argv 在本文件唯一发生，`find . | head -50` 的 `|` 会变成
// 普通参数喂给 find，报出误导性的 `unknown primary or operator`。门禁侧（门禁引擎
// classify-shell.ts）明确设计为 argv-noshell 不扫元字符（避免假安全感与误杀正常参数）——
// 本守卫**不是**门禁判定，而是 spawn 之前的**执行层 UX 兜底**：仅当 token 的**未加引号片段**
// 以「独立操作符」或「变量展开/命令替换」形态出现时，**不调 gate、不 spawn**，直接以明确文案拒绝。
// 口径与 splitCommand 同源；引号内内容永不明中；反斜杠前导的操作符字符视为字面量（与
// `grep a\|b` 当前实际可用行为一致——BRE 里 `\|` 是 alternation，不能被误杀）。

/** 「必需级」独立操作符 token：未加引号片段恰为其中之一 → 拒绝（F-7 本体）。 */
const SHELL_OPERATOR_TOKENS: ReadonlySet<string> = new Set([
  "|", "||", "&&", "&", ";", ">", ">>", "<", "<<", "2>", "2>>", "2>&1", "&>", "&>>", "1>", "1>>", ">&",
]);

interface ShellGuardHit {
  /** 命中的 argv token 原文（如实回显给模型）。 */
  token: string;
  /** operator＝独立操作符/紧贴重定向（F-7 本体）；embedded＝内嵌操作符（opt1）；expansion＝变量展开（opt2）。 */
  kind: "operator" | "embedded" | "expansion";
}

/** fragment[i] 是否被反斜杠前导（视作字面量，不判）。 */
function isBackslashEscaped(fragment: string, index: number): boolean {
  return index > 0 && fragment[index - 1] === "\\";
}

/** 「可选 & + 可选数字 + 重定向符号」开头且紧跟目标（紧贴形态：>out.txt、>>log、2>err.log、&>log、<in.txt）。 */
function startsWithAttachedRedirection(fragment: string): boolean {
  // 反斜杠前导（如 `\>x`）首字符即不匹配本形态，天然按字面量放行；`>` 等裸符号由 SHELL_OPERATOR_TOKENS 兜住。
  return /^&?[0-9]?(?:>>?|<<?)./.test(fragment);
}

/** opt1：未加引号片段**内嵌**未转义的 `|`/`;`/反引号，或**结尾**未转义 `&`（词中 `&` 如 URL 查询串不判）。 */
function hasEmbeddedOperator(fragment: string): boolean {
  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i];
    if ((ch === "|" || ch === ";" || ch === "`") && !isBackslashEscaped(fragment, i)) return true;
  }
  const last = fragment.length - 1;
  return last >= 0 && fragment[last] === "&" && !isBackslashEscaped(fragment, last);
}

/** opt2：未加引号片段含未转义的 `$(`、`${`、反引号、或 `$NAME` 词法（变量展开/命令替换）。 */
function hasExpansionSyntax(fragment: string): boolean {
  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i];
    if (ch === "`" && !isBackslashEscaped(fragment, i)) return true;
    if (ch !== "$" || isBackslashEscaped(fragment, i)) continue;
    const next = fragment[i + 1];
    if (next === "(" || next === "{") return true;
    if (next !== undefined && /[A-Za-z_]/.test(next)) return true;
  }
  return false;
}

/**
 * 扫描拆分结果，返回首个命中的守卫项；无命中 → undefined。
 * 必需级（F-7-a）：独立操作符 token / 紧贴重定向形态（仅未加引号时判中）。
 * opt1（内嵌操作符）与 opt2（变量展开）为批准启用的加固项。
 */
function detectUnsupportedShellSyntax(split: CommandTokenization): ShellGuardHit | undefined {
  for (let i = 0; i < split.argv.length; i++) {
    const fragment = split.unquoted[i];
    if (fragment === "") continue;
    if (SHELL_OPERATOR_TOKENS.has(fragment) || startsWithAttachedRedirection(fragment)) {
      return { token: split.argv[i], kind: "operator" };
    }
    if (hasEmbeddedOperator(fragment)) return { token: split.argv[i], kind: "embedded" };
    if (hasExpansionSyntax(fragment)) return { token: split.argv[i], kind: "expansion" };
  }
  return undefined;
}

/** 守卫拒绝文案（必需文案逐字；内嵌/展开类附「加引号或拆分」指引）。 */
function shellGuardMessage(name: string, hit: ShellGuardHit): string {
  const head = `${name} 未执行：本环境命令未经 shell 解释，不支持管道/重定向/变量展开（检测到 "${hit.token}"）。`;
  return hit.kind === "operator"
    ? `${head}请拆分为多条命令，或把逻辑写成脚本文件后执行。`
    : `${head}若这些符号是字面量，请加引号或改用等价写法（如 grep -e a -e b）；确需管道/重定向/变量展开，请拆分为多条命令，或把逻辑写成脚本文件后执行。`;
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
  /** 命令因**命令级执行时限**被终止（F-1；与「停止本轮」的 ABORTED 语义区分）。 */
  timedOut?: boolean;
  /** 触发终止的**生效**时限（毫秒）。 */
  timeoutMs?: number;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
}

/**
 * 平台分支的**进程树终止**（F-1-opt1）。
 * - POSIX：spawn 时 `detached:true` 使子进程成为**进程组组长**，按 `-pid` 向整组发信号
 *   （`npm test` 等派生的孙进程一并收掉，不留占端口/CPU 的孤儿）；组不可达（已退出/竞态）回退 `child.kill`。
 * - Windows：`taskkill /pid <pid> /T /F` 终止整棵树；taskkill 不可用时回退 `child.kill`。
 * 任何失败都不抛出——收口交由 close / 清理计时器（既有两条路径语义不变）。
 */
function killProcessTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals, useProcessGroup: boolean, env: Record<string, string>): void {
  if (process.platform === "win32") {
    const pid = child.pid;
    if (pid !== undefined) {
      try {
        const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", env });
        killer.on("error", () => { try { child.kill(signal); } catch { /* 已退出 */ } });
        return;
      } catch { /* 回退直接子进程 */ }
    }
    try { child.kill(signal); } catch { /* 已退出 */ }
    return;
  }
  if (useProcessGroup && child.pid !== undefined) {
    try { process.kill(-child.pid, signal); return; } catch { /* 组不可达 → 回退 */ }
  }
  try { child.kill(signal); } catch { /* 已退出 */ }
}

/**
 * 直接以 argv 启动子进程（**shell: false**，不经 shell 再解析）。
 * cwd **固定**为传入值（= projectRoot），不接受调用方指定（爆炸半径限制，§7.2）。
 * env **必须**是剥离凭据后的过滤环境（§7.9，见 buildShellEnv），**绝不**直接传 process.env。
 * 启动失败 / 得到错误 → 以 `error` 返回，绝不抛出（上层据此回 ok:false）。
 *
 * **命令级执行时限（F-1）**：spawn 成功后按 `execTimeoutMs` 挂**一次性 deadline 定时器**；
 * 到期经共享的 `terminate()` 终止命令——与 AbortSignal 的「停止本轮」路径**共用同一终止函数**，
 * 幂等（`settled` 或 `terminating` 后直接返回，先到先收口），SIGTERM→250ms→SIGKILL→1000ms
 * 清理上限的**预算不变**。`settle()` 清除 deadline 定时器，并把 `timedOut/timeoutMs` 带进 outcome；
 * 两路径竞争时结果只发一次、事件只发一次。
 */
function runShell(argv: string[], cwd: string, env: Record<string, string>, signal: AbortSignal | undefined, execTimeoutMs: number): Promise<ShellExecOutcome> {
  return new Promise((resolveOutcome) => {
    if (signal?.aborted) { resolveOutcome({ stdout: "", stderr: "", error: "会话已中止，命令未执行" }); return; }
    let child: ReturnType<typeof spawn>;
    const useProcessGroup = process.platform !== "win32";
    try {
      child = spawn(argv[0], argv.slice(1), { cwd, shell: false, windowsHide: true, env, ...(useProcessGroup ? { detached: true } : {}) });
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
    let terminating: "abort" | "timeout" | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const collectOut = (): string => Buffer.concat(out).toString("utf8");
    const collectErr = (): string => Buffer.concat(errOut).toString("utf8");
    const settle = (outcome: ShellExecOutcome): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (killTimer) clearTimeout(killTimer);
      if (cleanupTimer) clearTimeout(cleanupTimer);
      const observed: ShellExecOutcome = {
        ...outcome,
        stdoutTruncated,
        stderrTruncated,
        ...(terminating === "timeout" ? { timedOut: true, timeoutMs: execTimeoutMs } : {}),
      };
      resolveOutcome(terminating === "abort" ? { ...observed, error: outcome.error ?? "会话已中止，命令已请求终止" } : observed);
    };
    // 共享终止路径（F-1-b）：超时与「停止本轮」共用；`settled`/`terminating` 后直接返回（幂等，先到先收口）。
    const terminate = (origin: "abort" | "timeout"): void => {
      if (settled || terminating !== undefined) return;
      terminating = origin;
      killProcessTree(child, "SIGTERM", useProcessGroup, env);
      killTimer = setTimeout(() => { if (!settled) killProcessTree(child, "SIGKILL", useProcessGroup, env); }, 250);
      cleanupTimer = setTimeout(() => settle(origin === "timeout"
        ? { stdout: collectOut(), stderr: collectErr(), error: "命令超时清理超时" }
        : { stdout: "", stderr: "", error: "命令中止清理超时" }), 1000);
    };
    const abort = (): void => terminate("abort");
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    if (Number.isFinite(execTimeoutMs) && execTimeoutMs > 0) {
      deadlineTimer = setTimeout(() => terminate("timeout"), execTimeoutMs);
    }
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
    child.on("error", (e) => settle({ stdout: collectOut(), stderr: collectErr(), error: reasonOf(e) }));
    child.on("close", (code, signal) =>
      settle({
        code: code ?? undefined,
        signal,
        stdout: collectOut(),
        stderr: collectErr(),
      }),
    );
  });
}

/**
 * run_shell：命令级闸工具（设计 §7.2）。顺序**必须**是：
 *   取 command → `splitCommand` → **F-7 执行层守卫**（未加引号的操作符/展开 token → 直接以明确文案拒绝，
 *   不调 gate、不 spawn）→ `await shellGate(req)`（超时包装）→ **仅当恰好 `allow:true`** 才 spawn → 收集结果。
 * `allow:false` / `undefined` / 抛错 / 超时 → **在任何 spawn 之前返回**，子进程**从不启动**（§7.5.2）。
 *
 * **审核与 spawn 同址**（§7.1 第 3 条）：这是**唯一** spawn 点，且**没有 token**——不再「登记票据交扩展层」，
 * 因为票据可由公开输入重算、证明不了审核发生过。此处就是每调用保证的唯一落点。
 */
function makeRunShellTool(shellGate: ShellGate, shellCwd: string, reviewTimeoutMs: number, execTimeoutMs: number, gate?: InteractionGate, diagnostics?: DiagnosticLog, currentTurnId?: () => string | undefined, extraCredentialEnvVars?: readonly string[]): ExecutableTool {
  const name = SHELL_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const command = coreToolTarget("core-command-v1", call.args);
      if (command === undefined || command.trim() === "") {
        return { ok: false, message: `${name}: 缺少 command 参数，无法审核执行` };
      }
      const split = splitCommand(command);
      if (split.argv.length === 0) return { ok: false, message: `${name}: command 为空，无命令可执行` };
      const argv = split.argv;
      const cwd = shellCwd;
      const toolCallId = typeof call.toolCallId === "string" ? call.toolCallId : "";
      const turnId = currentTurnId?.();

      // —— F-7 执行层守卫（在 ShellGate 审核**之前**）：独立操作符 token（含内嵌/展开加固项）
      //    命中 → **不调 gate、不 spawn**，以明确文案拒绝；被拒命令本就什么都不会执行，
      //    治理判定链不变（是否对「被守卫拦截的尝试」留 shell-gate 审计属编排侧语义，本层只记 diagnostics）。
      const guardHit = detectUnsupportedShellSyntax(split);
      if (guardHit !== undefined) {
        diagnostics?.record("shell.guard.blocked", { turnId, toolCallId, toolName: name, reasonCode: guardHit.token, excerpt: command.slice(0, 240) });
        return { ok: false, message: shellGuardMessage(name, guardHit) };
      }

      // —— 唯一的命令级闸：只有恰好 allow:true 才继续（判定与执行在同一条我们的代码路径上）——
      let review: ShellReviewResult | undefined;
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
      //     观测（F-1-d）：`shell.exec.start` 携带**生效**的时限值，供观测与测试快速断言解析链（不必真等分钟级）。
      const execBegan = Date.now();
      diagnostics?.record("shell.exec.start", { turnId, toolCallId, toolName: name, timeoutMs: execTimeoutMs });
      const outcome = await runShell(argv, cwd, buildShellEnv(process.env, extraCredentialEnvVars), call.signal, execTimeoutMs);
      // —— 命令级超时（F-1-a）：如实返回「超时已终止（N ms）」+ 已收集的部分输出；**轮次继续**
      //    （模型可重试/换脚本/如实报告）——与「停止本轮」的 ABORTED 语义明确区分。 ——
      if (outcome.timedOut === true) {
        const timeoutMs = outcome.timeoutMs ?? execTimeoutMs;
        diagnostics?.record("shell.exec.timeout", { turnId, toolCallId, toolName: name, timeoutMs, durationMs: Date.now() - execBegan });
        const head = outcome.error === undefined
          ? `${name} 超时已终止（${timeoutMs} ms）：命令超过本次执行时限，已被终止。`
          : `${name} 超时已触发（${timeoutMs} ms），但终止清理未在预算内完成（${outcome.error}）——进程可能仍在运行，请如实向客户说明。`;
        return {
          ok: false,
          execution: {
            timedOut: true,
            timeoutMs,
            ...(outcome.code !== undefined ? { exitCode: outcome.code } : {}),
            ...(outcome.signal ? { signal: outcome.signal } : {}),
            stdout: outcome.stdout,
            stderr: outcome.stderr,
            stdoutTruncated: outcome.stdoutTruncated === true,
            stderrTruncated: outcome.stderrTruncated === true,
          },
          message: `${head}\nstdout:\n${outcome.stdout}\nstderr:\n${outcome.stderr}\n提示：可重试、拆分命令，或把逻辑写成脚本文件后执行；本轮可继续。`,
        };
      }
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
  // W6-A：交接/澄清中止时**不假设已投递/已提交**（零副作用面如实）。
  if (name === HAND_OFF_INTENT_TOOL_NAME) return { ok: false, message: `${name}：意图**未能交接**（原因：会话已中止）——**不要当它已交接**；如实告知客户。` };
  if (name === REQUEST_CLARIFICATION_TOOL_NAME) return { ok: false, message: `${name}：澄清请求**未能提交**（原因：会话已中止）——**不要当客户已看到该问题**；如实告知客户。` };
  // G-2/R2：中止时**不假设已执行**——等待被中止的提议其结果以系统回执为准（确认卡可能仍被处理）。
  if (name === PROPOSE_RECOVERY_TOOL_NAME) return { ok: false, message: `${name}：本次提议**未获结果**（原因：会话已中止）——**不要假设已执行**；如实告知客户。` };
  // G-4/I2：中止时**不假设已安装/已卸载**（零副作用面如实）。
  if (name === INSTALL_SKILL_TOOL_NAME) return { ok: false, message: `${name}：技能**未能安装**（原因：会话已中止）——**不要当它已安装**；如实告知客户。` };
  if (name === UNINSTALL_SKILL_TOOL_NAME) return { ok: false, message: `${name}：技能**未能卸载**（原因：会话已中止）——**不要当它已卸载**；如实告知客户。` };
  // G-4 V2：中止时**不假设已安装/已卸载**（同技能版口径；零副作用面如实）。
  if (name === INSTALL_MCP_TOOL_NAME) return { ok: false, message: `${name}：MCP**未能安装**（原因：会话已中止）——**不要当它已安装**；如实告知客户。` };
  if (name === UNINSTALL_MCP_TOOL_NAME) return { ok: false, message: `${name}：MCP**未能卸载**（原因：会话已中止）——**不要当它已卸载**；如实告知客户。` };
  // flow 方法化：中止时**不假设已读/已变更**（以服务端 revision 为准）。
  if (name === FLOW_GET_TOOL_NAME) return { ok: false, message: `${name}：流程读取**未完成**（原因：会话已中止）——不要据此推断流程状态。` };
  if (name === FLOW_STEP_UPDATE_TOOL_NAME || name === FLOW_STEP_SUPERSEDE_TOOL_NAME) {
    return { ok: false, message: `${name}：变更**未完成**（原因：会话已中止）——**不要当它已生效**；如确需，先 flow_get 看最新 revision 再重试。` };
  }
  return { ok: false, message: `${name}：会话已中止，未执行` };
}

/** 操作者标识（审计用；`operatorId` 形状取自 `OperatorOutcome` 先例）。 */
function operatorTag(operatorId: string | undefined): string {
  return operatorId !== undefined && operatorId !== "" ? `操作者：${operatorId}` : "操作者：未知";
}

/**
 * 判断 agent 代批回执（2026-10-18 双开关评审 §7.5）：**不得**说成客户本人点击/批准。
 * `judge.group` 决定「代审批/代决策」文案；`operator:judge:<engine>` 与桌面结算的 operatorId 同源。
 */
function judgeReceipt(
  name: string,
  judge: { group: "approval" | "decision"; engine: string },
  conclusion: string,
): string {
  const mode = judge.group === "approval" ? "替我审批" : "替我决策";
  const groupLabel = judge.group === "approval" ? "代审批" : "代决策";
  return (
    `${name}：客户委托的判断 agent（${mode}）已代批（${groupLabel}；operator:judge:${judge.engine}）：${conclusion}。` +
    `这不是客户本人点击，请在向客户汇报时说明是判断 agent 代批。`
  );
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
 * 写盘类卡片的呈现前完整性闸（2026-10-19 编排侧）：声明了写入路径（显式 `paths` 或 preview 声明）时，
 * preview 必须为**每一条**路径给出可核对正文/结构（路径作为标题/围栏说明，锚点后跟非空正文/代码）。
 * 缺失时编排在**呈现前**拒绝该卡（`common/编排/confirmed-writes.ts::validateConfirmPreviewCompleteness`），
 * 本层收到 `declined` 并把原因如实转达——不会先给客户看半张卡。组卡指引见 `describeTool` 的文案。
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
      const governance = readGovernanceCardArgs(call.args, name, CONFIRM_CARD_KINDS);
      if (!governance.ok) return governance.result;
      // 显式写入路径（可选）：非法 ⇒ 在触达客户通道之前失败，让模型修正；合法 ⇒ 原样并入卡片与 metadata。
      const writePaths = readConfirmationPaths(call.args, name);
      if (!writePaths.ok) return writePaths.result;
      const preview = readStringArg(call.args, ["preview"]);
      const detail = readStringArg(call.args, ["detail"]);
      const req: CustomerInputRequest = {
        kind: "confirm",
        title,
        ...(preview !== undefined ? { preview } : {}),
        ...(detail !== undefined ? { detail } : {}),
        ...(writePaths.value !== undefined ? { paths: writePaths.value } : {}),
        ...governance.value,
      };

      const out = await askCustomer(name, req, fn, timeoutMs, call.signal, gate, {
        ...metadata,
        ...governance.value,
        ...(writePaths.value !== undefined ? { paths: writePaths.value } : {}),
      });
      if ("ok" in out) return out; // 通道故障 / 超时 / 中止 → 未获同意
      if (out.outcome === "declined") {
        return notConsented(name, `客户拒绝${out.reason !== undefined ? `（${out.reason}）` : ""}`);
      }
      if (out.outcome === "unavailable") {
        return notConsented(name, out.reason ?? "客户通道不可用");
      }
      if (out.value.confirmed === true) {
        // 判断 agent 代批：口径必须是「代批」，不得说成客户本人点击（评审 §7.5）。
        if (out.judge !== undefined) {
          return {
            ok: true,
            message: judgeReceipt(name, out.judge, `已确认「${title}」（confirmed:true）`),
          };
        }
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

/** 确认卡显式写入路径上限（2026-10-18 真机修复：预览引用路径与写入目标混在一起，文本提取歧义）。 */
const MAX_CONFIRMATION_PATHS = 64;

type ConfirmationPathsResult = { ok: true; value?: string[] } | { ok: false; result: ToolResult };

/**
 * 读取确认卡的显式写入路径（可选）。缺席 ⇒ `{ok:true}`（旧卡零变化）。
 * 每项必须是非空、项目相对、无 `..`/NUL、非绝对/盘符、非目录（不以 `/` 结尾）的文件路径；
 * 合法项 posix 化（`\`→`/`）后原样返回。非法 ⇒ 工具错误且**不向客户发卡**（让模型修正）。
 */
function readConfirmationPaths(args: Record<string, unknown>, toolName: string): ConfirmationPathsResult {
  const raw = args["paths"];
  if (raw === undefined) return { ok: true };
  const fail = (reason: string): ConfirmationPathsResult => ({
    ok: false,
    result: {
      ok: false,
      message:
        `${toolName}: 参数 paths ${reason}——未向客户发卡；paths 应逐文件给出确认后将实际写入的项目相对路径` +
        `（≤${MAX_CONFIRMATION_PATHS} 项，不得含仅引用的文件），请更正后重试`,
    },
  });
  if (!Array.isArray(raw)) return fail("必须是字符串数组");
  if (raw.length === 0) return fail("不能为空数组（不需要请省略该参数）");
  if (raw.length > MAX_CONFIRMATION_PATHS) return fail(`最多 ${MAX_CONFIRMATION_PATHS} 项（当前 ${raw.length} 项）`);
  const out: string[] = [];
  for (let index = 0; index < raw.length; index++) {
    const item = raw[index];
    if (typeof item !== "string" || item.trim() === "") return fail(`[${index}] 必须是非空字符串`);
    if (item.includes("\u0000")) return fail(`[${index}] 含 NUL 字符`);
    const normalized = item.replace(/\\/g, "/");
    if (isAbsolute(item) || /^[A-Za-z]:/.test(normalized)) return fail(`[${index}] 必须是项目相对路径（不得为绝对路径/盘符路径）`);
    if (normalized.split("/").some((segment) => segment === "..")) return fail(`[${index}] 不得包含 .. 路径段`);
    if (normalized.endsWith("/")) return fail(`[${index}] 必须是文件路径（不得以 / 结尾或指向目录）`);
    out.push(normalized);
  }
  return { ok: true, value: out };
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
      const governance = readGovernanceCardArgs(call.args, name, CHOICE_CARD_KINDS);
      if (!governance.ok) return governance.result;
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
        ...governance.value,
      };

      const out = await askCustomer(name, req, fn, timeoutMs, call.signal, gate, { ...metadata, ...governance.value });
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
      const selection = labels.length > 0 ? labels.join("、") : "（未选择任何项）";
      if (out.judge !== undefined) {
        // 判断 agent 代批：不得说成客户本人选择（评审 §7.5）。
        return {
          ok: true,
          message: judgeReceipt(name, out.judge, `已选择：${selection}`),
        };
      }
      return {
        ok: true,
        message:
          `${name}：客户已选择（${operatorTag(out.operatorId)}）：` +
          `${selection}。` +
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
 * dispatch_task：**派发任务**工具（设计 H-1，**只给内置治理角色**）。把「任务与上下文」交给注入的能力
 * （编排路由成目标角色会话的一条输入，前端负责自动开/排队/去重——不在本层）。
 *
 * 纪律（与交互/交报告工具同）：**本层不写盘、不做治理判定、不进 `GOVERNED_WRITE_TOOLS`**——
 * handler 只把载荷交给注入的能力并**如实**转达回执：
 * - 受理成功（回执 `ok:true`，或**无回执**——`null`/`undefined`/`void` 视为已受理）→ 「任务已派发给 <roleId>」，
 *   并**重申「派发 ≠ 授权」**（防模型把派发当成替对方获准写盘）；
 * - 被拒（回执 `ok:false`，如「roleId 不是本项目角色 / 指向内置治理角色」）/ 能力抛错 → `ok:false`，
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
      const governance = readGovernanceFlowArgs(call.args, name);
      if (!governance.ok) return governance.result;
      const reason = readStringArg(call.args, ["reason"]);
      const payload: DispatchTaskPayload = {
        roleId,
        task,
        ...(reason !== undefined ? { reason } : {}),
        ...governance.value,
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

// —————————————— 治理四角色：意图交接与澄清（W6-A；hand_off_intent / request_clarification） ——————————————
//
// 依据：`角色卡/项目管理/docs/design/2026-10-18_design_governance-liaison-review.md` §5.1/§5.4
// （四角色 liaison → rapporteur → nominator → convener；治理模型仍 `trio`）。两工具均**由能力注入面
// 决定可用性**：`hand_off_intent` 只给联络官、`request_clarification` 只给报告员（判据在编排/桌面
// 注入端，本层不硬编码角色 id）；未注入 ⇒ 工具不存在（沿 dispatch_task 先例，最强 fail-closed）。
// 本层纪律：**不读文件、不写账本、不投递、不做治理判定**——handler 只做**严格参数校验**（非法值
// 在触达注入能力前拒绝，不猜测、不截断、不静默丢弃）并把载荷原样交给能力，随后**如实**转达回执：
// 交接 ≠ 客户批准；澄清 ≠ 客户已回答；契约外回执一律按未交接/未提交 fail-closed。

const HAND_OFF_INTENT_KINDS: readonly HandOffIntentKind[] = ["initial", "clarification", "revision"];
const HAND_OFF_INTENT_ARG_KEYS: ReadonlySet<string> = new Set(["intentId", "handoffKind", "goal", "scope", "acceptance", "summary", "flowId"]);
const REQUEST_CLARIFICATION_ARG_KEYS: ReadonlySet<string> = new Set(["flowId", "intentId", "question", "summary"]);
/** 摘要长度上限（评审 §5.1/§5.4：200 字；按 Unicode 码点计——超长拒绝，不静默截断）。 */
const SUMMARY_MAX_CHARS = 200;

/** 严格参数面：不接受未声明参数（schema `additionalProperties:false` 的 handler 同款守卫）。 */
function unknownGovernanceArg(args: Record<string, unknown>, allowed: ReadonlySet<string>, toolName: string): ToolResult | undefined {
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) {
      return { ok: false, message: `${toolName}: 未知参数 ${key}（本工具不接受该参数）——未执行；请更正后重试` };
    }
  }
  return undefined;
}

/** 必填非空字符串（只做空串判定，**不改写**载荷值——文件为权威，比较在编排侧）。 */
function readRequiredTextArg(args: Record<string, unknown>, key: string, toolName: string): { ok: true; value: string } | { ok: false; result: ToolResult } {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, result: { ok: false, message: `${toolName}: 缺少或非法的 ${key} 参数（须为非空字符串）——未执行；请更正后重试` } };
  }
  return { ok: true, value };
}

/** 可选摘要校验：给出时必须是非空字符串且 ≤200 字；缺席保持缺席（不凭空生成键）。 */
function readOptionalSummaryArg(args: Record<string, unknown>, toolName: string): { ok: true; value: string | undefined } | { ok: false; result: ToolResult } {
  const value = args["summary"];
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "string") {
    return { ok: false, result: { ok: false, message: `${toolName}: summary 参数非法（须为字符串）——未执行；请更正后重试` } };
  }
  const length = Array.from(value).length;
  if (length > SUMMARY_MAX_CHARS) {
    return { ok: false, result: { ok: false, message: `${toolName}: summary 超过 ${SUMMARY_MAX_CHARS} 字（${length} 字）——未执行；请压缩后重试` } };
  }
  return { ok: true, value };
}

/** 交接/澄清共用的两态回执归一：契约外（缺失/非对象/ok 非布尔）→ undefined，由调用方 fail-closed。 */
function simpleReceiptOf(value: unknown): { ok: boolean; message?: string } | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record["ok"] !== true && record["ok"] !== false) return undefined;
  const message = typeof record["message"] === "string" && record["message"].trim() !== "" ? record["message"] : undefined;
  return { ok: record["ok"] === true, ...(message !== undefined ? { message } : {}) };
}

/**
 * hand_off_intent：**意图交接**工具（W6-A，**只给联络官注入**）。把 `HandOffIntentPayload` 原样交给
 * 注入的能力（编排/桌面窗口执行文件校验、去重、`initial` 仅一次、每轮一次与后台投递）。
 *
 * 行为钉点（评审 §5.1/§5.2）：非法参数（slug/枚举/四要素/summary 超长/未知参数）在**触达能力前**拒绝；
 * 合法载荷原样透传（含可选 flowId，缺席不造键）；metadata 沿 dispatch_task 先例（turnId/roleId/runtime）；
 * 成功 → 「已交接」并重申**交接 ≠ 客户批准**；`ok:false` / 抛错 / 契约外回执 → 明确「**未能交接**」，
 * **绝不**说成已交接。悬挂防护：`raceAbort`（会话中止即立即返回；本地调用，不设等待超时）。
 */
function makeHandOffIntentTool(fn: HandOffIntentFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = HAND_OFF_INTENT_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const turnId = currentTurnId?.();
      const unknown = unknownGovernanceArg(call.args, HAND_OFF_INTENT_ARG_KEYS, name);
      if (unknown !== undefined) return unknown;
      const intentId = readGovernanceSlugArg(call.args, "intentId", name);
      if (!intentId.ok) return intentId.result;
      if (intentId.value === undefined) {
        return { ok: false, message: `${name}: 缺少 intentId 参数（意图记录 slug，对应 docs/intents/<intentId>.md）——未交接` };
      }
      const handoffKind = call.args["handoffKind"];
      if (typeof handoffKind !== "string" || !HAND_OFF_INTENT_KINDS.includes(handoffKind as HandOffIntentKind)) {
        return { ok: false, message: `${name}: handoffKind 参数非法（应为 "initial" / "clarification" / "revision" 之一）——未交接` };
      }
      const goal = readRequiredTextArg(call.args, "goal", name);
      if (!goal.ok) return goal.result;
      const intentScope = readRequiredTextArg(call.args, "scope", name);
      if (!intentScope.ok) return intentScope.result;
      const acceptance = readRequiredTextArg(call.args, "acceptance", name);
      if (!acceptance.ok) return acceptance.result;
      const summary = readRequiredTextArg(call.args, "summary", name);
      if (!summary.ok) return summary.result;
      const summaryLength = Array.from(summary.value).length;
      if (summaryLength > SUMMARY_MAX_CHARS) {
        return { ok: false, message: `${name}: summary 超过 ${SUMMARY_MAX_CHARS} 字（${summaryLength} 字）——未交接；请压缩后重试` };
      }
      const flowId = readGovernanceSlugArg(call.args, "flowId", name);
      if (!flowId.ok) return flowId.result;
      const payload: HandOffIntentPayload = {
        intentId: intentId.value,
        handoffKind: handoffKind as HandOffIntentKind,
        goal: goal.value,
        scope: intentScope.value,
        acceptance: acceptance.value,
        summary: summary.value,
        ...(flowId.value !== undefined ? { flowId: flowId.value } : {}),
      };

      let receipt: unknown;
      try {
        receipt = await raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return turnId === undefined ? fn(payload) : fn(payload, handbackMetadata(turnId, scope)); }), call.signal, `${name} 交接意图`);
      } catch (err) {
        return { ok: false, message: `${name}：意图**未能交接**（原因：${reasonOf(err)}）——请如实向客户说明；**不要当它已交接、不要重复派发**。` };
      }
      const normalized = simpleReceiptOf(receipt);
      if (normalized === undefined) {
        return { ok: false, message: `${name}：能力未返回明确回执（回执缺失或非法）——按**未交接**处理；**不要当它已交接**，如实告知客户。` };
      }
      const detail = normalized.message !== undefined ? ` ${normalized.message}` : "";
      if (normalized.ok) {
        return {
          ok: true,
          message:
            `${name}：意图「${payload.intentId}」已交接（handoffKind: ${payload.handoffKind}）——应用已把一条任务交给报告员。${detail}` +
            `注意：**交接 ≠ 客户批准**——它不是客户决定，不能据此宣称提案已被接受或已获授权；不要重复交接。`,
        };
      }
      return { ok: false, message: `${name}：意图**未能交接**（回执：${normalized.message ?? "能力侧被拒且未提供原因"}）——请如实向客户说明；**不要当它已交接、不要重复派发**。` };
    },
  };
}

/**
 * request_clarification：**澄清请求**工具（W6-A，**只给报告员注入**）。把 `RequestClarificationPayload`
 * 原样交给注入的能力（账本 `clarification.requested` 与主入口系统行在能力侧）。
 *
 * 行为钉点（评审 §5.4）：`question` 必填非空；`flowId`/`intentId` **至少一个**（皆缺→拒绝，不猜测归属）；
 * 可选 `summary` ≤200 字；未知参数拒绝；非法值在**触达能力前**拒绝；合法载荷原样透传（缺席键不凭空出现）。
 * 成功 → 「已提交」并重申「不弹决定卡、不改变任何权力/写权、同一 flow 最多 2 轮」；失败/抛错/契约外
 * 回执 → 明确「**未能提交**」，**绝不**说成客户已看到。悬挂防护：`raceAbort`（不设等待超时）。
 */
function makeRequestClarificationTool(fn: RequestClarificationFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = REQUEST_CLARIFICATION_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const turnId = currentTurnId?.();
      const unknown = unknownGovernanceArg(call.args, REQUEST_CLARIFICATION_ARG_KEYS, name);
      if (unknown !== undefined) return unknown;
      const flowId = readGovernanceSlugArg(call.args, "flowId", name);
      if (!flowId.ok) return flowId.result;
      const intentId = readGovernanceSlugArg(call.args, "intentId", name);
      if (!intentId.ok) return intentId.result;
      if (flowId.value === undefined && intentId.value === undefined) {
        return { ok: false, message: `${name}: 缺少 flowId/intentId 参数（至少给出一个，用于同一 flow 的澄清轮次计数）——未提交` };
      }
      const question = readRequiredTextArg(call.args, "question", name);
      if (!question.ok) return question.result;
      const summary = readOptionalSummaryArg(call.args, name);
      if (!summary.ok) return summary.result;
      const payload: RequestClarificationPayload = {
        ...(flowId.value !== undefined ? { flowId: flowId.value } : {}),
        ...(intentId.value !== undefined ? { intentId: intentId.value } : {}),
        question: question.value,
        ...(summary.value !== undefined ? { summary: summary.value } : {}),
      };

      let receipt: unknown;
      try {
        receipt = await raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return turnId === undefined ? fn(payload) : fn(payload, handbackMetadata(turnId, scope)); }), call.signal, `${name} 提交澄清`);
      } catch (err) {
        return { ok: false, message: `${name}：澄清请求**未能提交**（原因：${reasonOf(err)}）——请如实向客户说明；**不要当客户已看到该问题**。` };
      }
      const normalized = simpleReceiptOf(receipt);
      if (normalized === undefined) {
        return { ok: false, message: `${name}：能力未返回明确回执（回执缺失或非法）——按**未提交**处理；**不要当客户已看到该问题**，如实告知客户。` };
      }
      const detail = normalized.message !== undefined ? ` ${normalized.message}` : "";
      const target = [flowId.value !== undefined ? `flowId: ${flowId.value}` : undefined, intentId.value !== undefined ? `intentId: ${intentId.value}` : undefined].filter((part): part is string => part !== undefined).join("、");
      if (normalized.ok) {
        return {
          ok: true,
          message:
            `${name}：澄清请求已提交（${target}）——应用已记录并在主入口显示。${detail}` +
            `注意：本工具**不弹客户决定卡、不改变任何权力或写权**；同一 flow 最多 2 轮，超过后请在提案卡上请客户决定（带假设/备选）。`,
        };
      }
      return { ok: false, message: `${name}：澄清请求**未能提交**（回执：${normalized.message ?? "能力侧被拒且未提供原因"}）——请如实向客户说明；**不要当客户已看到该问题**。` };
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

// —————————————— 看护只读工具 + 恢复提议（G-2；role_status / session_tail / propose_recovery） ——————————————
//
// 依据：客户 2026-10-16 批准 G-2（设计 `角色卡/产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md`
// §四/§六；PM 派发「运行时核心＝R1/R2」）。三工具均**只给内置治理角色**——由调用方（编排注入端，判据沿
// dispatch_task 的 suppressHandback 先例）决定**注入才注册**（未注入 ⇒ 工具不存在 = 最强 fail-closed）。
// 本层纪律：role_status / session_tail **纯读**（无任何副作用；数据源由桌面窗口按同源快照/受保护投影提供）；
// propose_recovery **只提交载荷、如实转达三态回执**——提议 ≠ 执行、执行以客户确认为准、不得承诺。

/** role_status 输出上限（G-2 §4.1：8 KiB；超限按字节截断并如实标注 truncated）。 */
const ROLE_STATUS_MAX_BYTES = 8 * 1024;

/** 截断标注（含设计规定的 `truncated` 字样；按字节预留后保证总输出 ≤ 8 KiB）。 */
const ROLE_STATUS_TRUNCATED_MARKER = "\n[truncated：状态输出超过 8 KiB 上限，已按 UTF-8 字节截断]";

/** 按 UTF-8 **字节**上限截断（不劈开多字节码点与代理对）；未超限原样返回。 */
function truncateUtf8(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return { text, truncated: false };
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Buffer.byteLength(text.slice(0, mid), "utf8") <= maxBytes) lo = mid;
    else hi = mid - 1;
  }
  let cut = lo;
  if (cut > 0) {
    const last = text.charCodeAt(cut - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut -= 1; // 不劈开代理对
  }
  return { text: text.slice(0, cut), truncated: true };
}

/**
 * 读类回执归一（G-2/R1）：接受契约 `WatchdogToolResult` 形状；**契约外**（null/非对象/ok 非布尔）
 * → `undefined`，由调用方按「未获明确结果」fail-closed 如实转达——**绝不把不明结果当成功或编造内容**。
 */
function watchdogResultOf(value: unknown): { ok: true; text: unknown } | { ok: false; message: unknown } | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record["ok"] === true) return { ok: true, text: record["text"] };
  if (record["ok"] === false) return { ok: false, message: record["message"] };
  return undefined;
}

/** 读类 ok:false 的如实转达（数据源 message 原样；未提供原因则如实标注）。 */
function watchdogFailureMessage(name: string, message: unknown): string {
  return typeof message === "string" && message.trim() !== "" ? message : `${name}：数据源如实报告失败（未提供原因）`;
}

/**
 * role_status：su 的**只读**状态查询（G-2 §4.1）。本层只做三件事：归一查询 → 调注入数据源
 * （`raceAbort`：会话中止即立即返回，不挂起）→ 如实转达（≤8 KiB；超限截断并标注 truncated）。
 * **绝无副作用**：不写盘、不入队、不改任何状态、不动任何判定链；数据源抛错/回执缺失如实回报
 * 「读取未完成/结果不明」，**绝不编造状态**。
 */
function makeRoleStatusTool(fn: RoleStatusFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = ROLE_STATUS_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const turnId = currentTurnId?.();
      const roleId = readStringArg(call.args, ["roleId", "role_id", "role"]);
      // 给了 roleId 键但值不是字符串 → 拒绝（本工具「缺省＝概览」意味着静默丢弃会给 su 错误的全景）；
      // 空字符串视作缺省（＝概览，无副作用无歧义）。
      if (roleId === undefined && ["roleId", "role_id", "role"].some((key) => call.args[key] !== undefined && call.args[key] !== null)) {
        return { ok: false, message: `${name}: roleId 参数非法（应为字符串；缺省＝全项目概览）` };
      }
      const includeRaw = call.args["includeDiagnostics"];
      // 空字符串 roleId 视作缺省（＝概览）；includeDiagnostics 非布尔视作未提供（沿 request_choice
      // `multiple` 先例：辅助布尔不猜、不因类型不合就打断查询）。
      const query: RoleStatusPayload = {
        ...(roleId !== undefined && roleId.trim() !== "" ? { roleId } : {}),
        ...(includeRaw === true ? { includeDiagnostics: true } : {}),
      };
      let result: unknown;
      try {
        result = await raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return turnId === undefined ? fn(query) : fn(query, handbackMetadata(turnId, scope)); }), call.signal, `${name} 读取状态`);
      } catch (err) {
        return { ok: false, message: `${name}：状态读取**未完成**（原因：${reasonOf(err)}）——没有拿到快照就**不要推断项目状态**；如确需，可稍后重试。` };
      }
      const receipt = watchdogResultOf(result);
      if (receipt === undefined) {
        return { ok: false, message: `${name}：数据源未返回明确结果（回执缺失或非法）——**不要据此判断任何状态**。` };
      }
      if (!receipt.ok) return { ok: false, message: watchdogFailureMessage(name, receipt.message) };
      if (typeof receipt.text !== "string" || receipt.text === "") {
        return { ok: false, message: `${name}：数据源未返回文本（结果不明）——**不要据此判断任何状态**。` };
      }
      const text = receipt.text;
      if (Buffer.byteLength(text, "utf8") <= ROLE_STATUS_MAX_BYTES) return { ok: true, message: text };
      const capped = truncateUtf8(text, ROLE_STATUS_MAX_BYTES - Buffer.byteLength(ROLE_STATUS_TRUNCATED_MARKER, "utf8"));
      return { ok: true, message: `${capped.text}${ROLE_STATUS_TRUNCATED_MARKER}` };
    },
  };
}

/** session_tail 行数（G-2 §4.2）：缺省 40、上限 200（工具层归一后传给数据源）。 */
const SESSION_TAIL_DEFAULT_LINES = 40;
const SESSION_TAIL_MAX_LINES = 200;

/**
 * session_tail：su 的**只读**会话尾线（G-2 §4.2）。行数归一（缺省 40、上限 200——超上限按上限取并
 * 如实标注）→ 调注入数据源（受保护投影链上产出）→ 原样转达。**绝无副作用**：不重放、不恢复、不修改
 * 任何会话；数据源抛错/回执缺失如实回报，不编造会话内容。
 */
function makeSessionTailTool(fn: SessionTailFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = SESSION_TAIL_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const turnId = currentTurnId?.();
      const roleId = readStringArg(call.args, ["roleId", "role_id", "role"]);
      if (roleId === undefined || roleId.trim() === "") {
        return { ok: false, message: `${name}: 缺少 roleId 参数（目标角色 id），无法读取会话尾部` };
      }
      const linesRaw = call.args["lines"];
      if (linesRaw !== undefined && linesRaw !== null && (typeof linesRaw !== "number" || !Number.isInteger(linesRaw) || linesRaw < 1)) {
        return { ok: false, message: `${name}: lines 参数非法（应为 ≥1 的整数；缺省 ${SESSION_TAIL_DEFAULT_LINES}，上限 ${SESSION_TAIL_MAX_LINES}）` };
      }
      const requested = typeof linesRaw === "number" ? linesRaw : SESSION_TAIL_DEFAULT_LINES;
      const lines = Math.min(requested, SESSION_TAIL_MAX_LINES);
      let result: unknown;
      try {
        result = await raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return turnId === undefined ? fn({ roleId, lines }) : fn({ roleId, lines }, handbackMetadata(turnId, scope)); }), call.signal, `${name} 读取会话尾部`);
      } catch (err) {
        return { ok: false, message: `${name}：会话尾部读取**未完成**（原因：${reasonOf(err)}）——不要凭空推断该角色会话内容。` };
      }
      const receipt = watchdogResultOf(result);
      if (receipt === undefined) {
        return { ok: false, message: `${name}：数据源未返回明确结果（回执缺失或非法）——不要据此判断会话内容。` };
      }
      if (!receipt.ok) return { ok: false, message: watchdogFailureMessage(name, receipt.message) };
      if (typeof receipt.text !== "string" || receipt.text === "") {
        return { ok: false, message: `${name}：数据源未返回文本（结果不明）——不要据此判断会话内容。` };
      }
      const clampNote = requested > SESSION_TAIL_MAX_LINES ? `[已按上限取尾：请求 ${requested} 行 → 取 ${SESSION_TAIL_MAX_LINES} 行]\n` : "";
      return { ok: true, message: `${clampNote}${receipt.text}` };
    },
  };
}

/** 恢复动作三值（G-2 §6.3，客户批准）。工具层严格校验（非法 → 拒绝且**不调用能力**，沿 report_shell_verdict 先例）。 */
const RECOVERY_ACTIONS: readonly RecoveryAction[] = ["abort-turn", "rebuild-session", "redeliver"];

/**
 * propose_recovery：**恢复提议**工具（G-2 §6，**只给内置治理角色**）。把 `{roleId, action, evidence, reason?, itemId?}`
 * 交给注入的能力（桌面路由：校验 → 恢复确认卡 →（恰 allow:true 才）执行 → 三态回执）。
 *
 * 纪律（与 dispatch_task 同）：**本层不执行任何动作、不做治理判定、不改变任何权限/写权**——handler 只把
 * 载荷交给注入的能力并**如实**转达**回执**（契约 `RecoveryOutcome`，恰四值、**后三值一律未执行**）：
 * - `executed` →「客户已确认，恢复动作已执行」——**唯一**可称已执行的路径；
 * - `declined` → `ok:false`「**未获执行**」（取消/关窗/通道关闭，fail-closed，零执行），**绝不当成功**；
 * - `unsupported` → `ok:false`「**未执行**——当前运行时不支持」（绝不假装已执行）；
 * - `error` → `ok:false`「**未执行**——执行失败/前提不满足」（原因在 message，绝不假装已执行）；
 * - 契约外（无回执/未知 outcome）→ `ok:false`「未获明确结果」——fail-closed，**绝不**当已执行。
 * 等待客户期间挂**活动闸**（G-1 语义适用，§6.2）：su 的等待轮次不吃整轮硬超时；会话中止用 `raceAbort`
 * 即刻返回「未获结果」——不承诺执行与否（确认卡可能仍被处理，最终结果以系统回执为准）。
 */
function makeProposeRecoveryTool(fn: ProposeRecoveryFn, currentTurnId?: () => string | undefined, gate?: InteractionGate, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = PROPOSE_RECOVERY_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const turnId = currentTurnId?.();
      const roleId = readStringArg(call.args, ["roleId", "role_id", "role"]);
      if (roleId === undefined || roleId.trim() === "") {
        return { ok: false, message: `${name}: 缺少 roleId 参数（目标角色 id），无法提议恢复` };
      }
      const actionRaw = call.args["action"];
      if (typeof actionRaw !== "string" || !RECOVERY_ACTIONS.includes(actionRaw as RecoveryAction)) {
        return { ok: false, message: `${name}: action 参数非法（应为 "abort-turn" / "rebuild-session" / "redeliver" 之一——本工具不提议任何其他动作）` };
      }
      const evidence = readStringArg(call.args, ["evidence"]);
      if (evidence === undefined || evidence.trim() === "") {
        return { ok: false, message: `${name}: 缺少 evidence 参数（支撑提议的事实：状态快照/时间线/会话行）——无证据不提议` };
      }
      const reason = readStringArg(call.args, ["reason"]);
      const itemId = readStringArg(call.args, ["itemId", "item_id"]);
      const payload: ProposeRecoveryPayload = {
        roleId,
        action: actionRaw as RecoveryAction,
        evidence,
        ...(reason !== undefined ? { reason } : {}),
        ...(itemId !== undefined ? { itemId } : {}),
      };

      gate?.begin();
      try {
        let receipt: unknown;
        try {
          receipt = await raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return turnId === undefined ? fn(payload) : fn(payload, handbackMetadata(turnId, scope)); }), call.signal, `${name} 等待客户确认`);
        } catch (err) {
          return { ok: false, message: `${name}：本次提议**未获结果**（原因：${reasonOf(err)}）——**不要假设已执行**；如实告知客户。` };
        }
        const record = receipt !== null && typeof receipt === "object" ? receipt as { outcome?: unknown; message?: unknown; operatorId?: unknown } : undefined;
        const outcome = record?.outcome;
        const detail = typeof record?.message === "string" ? record.message : undefined;
        if (outcome === "executed") {
          const operator = typeof record?.operatorId === "string" ? record.operatorId : undefined;
          return {
            ok: true,
            message:
              `${name}：客户已确认（${operatorTag(operator)}），恢复动作已执行：${payload.action} → 角色「${roleId}」。` +
              `${detail !== undefined ? ` ${detail}` : ""}请据回执继续处理（既有回交/重派路径）。`,
          };
        }
        if (outcome === "declined") {
          return { ok: false, message: `${name}：**未获执行**——客户未确认（取消/关闭/通道不可用，fail-closed，零执行）。${detail !== undefined ? `${detail} ` : ""}**不要当它已执行**；如实告知客户。` };
        }
        if (outcome === "unsupported") {
          return { ok: false, message: `${name}：恢复动作**未执行**——当前运行时**不支持**该动作（unsupported）。${detail !== undefined ? `${detail} ` : ""}**不要当它已执行**；如实告知客户。` };
        }
        if (outcome === "error") {
          return { ok: false, message: `${name}：恢复动作**未执行**——执行失败或前提不满足（error）。${detail ?? "原因未提供"} **不要当它已执行**；如实告知客户。` };
        }
        return { ok: false, message: `${name}：能力未返回明确的回执结果（回执缺失或四值之外）——按**未获明确结果**处理；**不要当它已执行**，如实告知客户。` };
      } finally {
        gate?.end();
      }
    },
  };
}

// —————————————— 角色能力安装（G-4；install_skill / uninstall_skill） ——————————————
//
// 依据：客户 2026-10-16 批准 G-4 V1（设计 `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md`
// §3.2/§3.3；PM 派发「运行时核心＝I1/I2」）。两工具均**只给内置治理角色**——由调用方（注入端判据沿
// dispatch_task 的 suppressHandback 先例）决定**注入才注册**（未注入 ⇒ 工具不存在 = 最强 fail-closed）。
// 本层纪律：**工具不写盘**——落盘永远由 su 的 `write_file` 完成（「先落盘再激活」＝G-1「先落盘再派发」
// 的镜像）；校验（角色/登记/含角色、卸前登记确已撤销、客户轮次护栏）与激活（复用既有重建；在跑
// 不打断）都在注入能力侧（桌面 handler）；本层只**路由载荷**并**如实转达回执**（契约两态：
// ok:true[rebuilt|next-session] / ok:false[reason+message]；契约外一律 fail-closed）。

/** 技能安装/卸载 receipt 合法形状的字段归一（契约外套 fail-closed 的判据；两工具共用）。 */
function skillReceiptOf(
  value: unknown,
  expectedAction: "installed" | "uninstalled",
): { ok: true; action: "installed" | "uninstalled"; roleId: string; name: string; path: string; digest: string; effective: "rebuilt" | "next-session"; note?: string } | { ok: false; reason?: string; message?: string } | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record["ok"] === true) {
    const action = record["action"];
    const effective = record["effective"];
    const path = typeof record["path"] === "string" && record["path"] !== "" ? record["path"] : undefined;
    const digest = typeof record["digest"] === "string" && record["digest"] !== "" ? record["digest"] : undefined;
    const roleId = typeof record["roleId"] === "string" && record["roleId"] !== "" ? record["roleId"] : undefined;
    const name = typeof record["name"] === "string" && record["name"] !== "" ? record["name"] : undefined;
    if ((action !== "installed" && action !== "uninstalled") || action !== expectedAction || (effective !== "rebuilt" && effective !== "next-session") || path === undefined || digest === undefined || roleId === undefined || name === undefined) return undefined;
    const note = typeof record["note"] === "string" && record["note"].trim() !== "" ? record["note"] : undefined;
    return { ok: true, action, roleId, name, path, digest, effective, ...(note !== undefined ? { note } : {}) };
  }
  if (record["ok"] === false) {
    const reason = typeof record["reason"] === "string" && record["reason"].trim() !== "" ? record["reason"] : undefined;
    const message = typeof record["message"] === "string" && record["message"].trim() !== "" ? record["message"] : undefined;
    return { ok: false, ...(reason !== undefined ? { reason } : {}), ...(message !== undefined ? { message } : {}) };
  }
  return undefined;
}

/**
 * install_skill / uninstall_skill 的共用 handler：两工具同名同形，仅动词/期望 action/呈现细节不同。
 * 纪律（与 dispatch_task 同）：**本层不写盘、不做治理判定、不改变任何权限/写权**——handler 只把
 * `{roleId, name}` 交给注入的能力并**如实**转达回执：
 * - `ok:true`（rebuilt/next-session）→ 如实「已安装/已卸载」＋ path/digest/生效态，并重申
 *   「本次未改变任何角色的写边界」（防模型把安装当成替角色扩权）；
 * - `ok:false`（含护栏拒绝 `not-customer-turn`、卸载「登记未变」等）→ `ok:false` 如实报因（reason＋
 *   message 原样），明确**未执行、零副作用**；
 * - 能力抛错 / 契约外回执（缺失/形状非法/action 与工具不符）→ `ok:false`「未能安装/未获明确结果」
 *   ——**绝不**说成已安装/已卸载。
 * 悬挂防护：`raceAbort`（会话中止即立即返回；本地调用，不设等待超时）。
 */
function makeSkillReceiptTool(kind: "install" | "uninstall", fn: InstallSkillFn | UninstallSkillFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = kind === "install" ? INSTALL_SKILL_TOOL_NAME : UNINSTALL_SKILL_TOOL_NAME;
  const verb = kind === "install" ? "安装" : "卸载";
  const expectedAction = kind === "install" ? ("installed" as const) : ("uninstalled" as const);
  return {
    name,
    async handler(call) {
      const turnId = currentTurnId?.();
      const roleId = readStringArg(call.args, ["roleId", "role_id", "role"]);
      if (roleId === undefined || roleId.trim() === "") {
        return { ok: false, message: `${name}: 缺少 roleId 参数（目标角色 id），无法${verb}技能` };
      }
      const skillName = readStringArg(call.args, ["name"]);
      if (skillName === undefined || skillName.trim() === "") {
        return { ok: false, message: `${name}: 缺少 name 参数（技能名，稳定短 slug），无法${verb}技能` };
      }
      const payload: InstallSkillPayload = { roleId, name: skillName };

      let receipt: unknown;
      try {
        receipt = await raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return turnId === undefined ? fn(payload) : fn(payload, handbackMetadata(turnId, scope)); }), call.signal, `${name} ${verb}技能`);
      } catch (err) {
        return { ok: false, message: `${name}：技能**未能${verb}**（原因：${reasonOf(err)}）——**不要当它已${verb}**；如实向客户说明。` };
      }
      const normalized = skillReceiptOf(receipt, expectedAction);
      if (normalized === undefined) {
        return { ok: false, message: `${name}：能力未返回明确回执（回执缺失、形状非法或 action 与工具不符）——按**未执行**处理；**不要当它已${verb}**，如实告知客户。` };
      }
      if (normalized.ok === true) {
        const detail = kind === "install"
          ? `内容：${normalized.path}（sha256 ${normalized.digest.slice(0, 12)}）`
          : `效果已撤；文件保留于 ${normalized.path}（sha256 ${normalized.digest.slice(0, 12)}）`;
        const effectiveText = normalized.effective === "rebuilt" ? "已重建该角色会话、即刻生效" : "该角色正在运行轮次（不打断）——新会话起生效";
        return {
          ok: true,
          message:
            `${name}：技能「${normalized.name}」已${verb} → 角色「${normalized.roleId}」。${detail}；生效：${effectiveText}。` +
            `${normalized.note !== undefined ? ` ${normalized.note}` : ""}` +
            `注意：本次${verb}**未改变任何角色的写边界**——技能是必读资料，不是权限。`,
        };
      }
      return {
        ok: false,
        message: `${name}：技能${verb}**未执行**（${normalized.reason !== undefined ? `reason: ${normalized.reason}；` : ""}回执：${normalized.message ?? "能力侧未提供原因"}）——零副作用；**不要当它已${verb}**，如实告知客户。`,
      };
    },
  };
}

/** install_skill：**技能安装**工具（G-4，**只给内置治理角色**；见 `makeSkillReceiptTool` §纪律）。 */
function makeInstallSkillTool(fn: InstallSkillFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  return makeSkillReceiptTool("install", fn, currentTurnId, scope);
}

/** uninstall_skill：**技能卸载**工具（G-4，**只给内置治理角色**；见 `makeSkillReceiptTool` §纪律）。 */
function makeUninstallSkillTool(fn: UninstallSkillFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  return makeSkillReceiptTool("uninstall", fn, currentTurnId, scope);
}

// —————————————— 角色能力安装（G-4 V2；install_mcp / uninstall_mcp） ——————————————
//
// 依据：客户 2026-10-16「按推荐批准，开始实施」＝V2（外来 MCP 按角色安装）分批实施（设计
// `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` §五/§九；本波＝wave A
// 契约层）。纪律与技能版**逐字同构**：两工具**只给内置治理角色**（调用方注入才注册，未注入 ⇒ 不存在）、
// **不写盘**（落盘＝su 的 `write_file`，「先落盘再激活」）、只**路由载荷 `{roleId,name}`** 并
// **如实转达回执**（契约两态：ok:true[rebuilt|next-session] / ok:false[reason+message]；契约外一律
// fail-closed）。回执形状归一同技能版**共用 `skillReceiptOf`**（InstallMcpReceipt **沿
// InstallSkillReceipt 体格**冻结——同一形状，不另立归一逻辑）。
// MCP 专有如实面（回执与 schema 文案同口径；§5.3 诚实面）：**外来 MCP 工具在 ANS 门禁之外执行
// ＝能力级授予**（非逐调用受审，不得宣称）；卸载＝下次会话摘除、**已发生的副作用不可撤**。

/**
 * install_mcp / uninstall_mcp 的共用 handler（与 `makeSkillReceiptTool` 逐字体格同构，仅名词与
 * MCP 专有如实面不同）。纪律（与 dispatch_task 同）：**本层不写盘、不做治理判定、不改变任何
 * 权限/写权**——handler 只把 `{roleId, name}` 交给注入的能力并**如实**转达回执：
 * - `ok:true`（rebuilt/next-session）→ 如实「已安装/已卸载」＋声明 path/digest/生效态，并重申
 *   「本次未改变任何角色的写边界」＋「外来 MCP 工具在 ANS 门禁之外执行（能力级授予），不是逐调用
 *   受审」（防模型把安装当成替角色扩门禁内写权，也防把门禁外执行面说成受审）；
 * - `ok:false`（含护栏拒绝 `not-customer-turn`、卸载「声明未变」等）→ `ok:false` 如实报因（reason＋
 *   message 原样），明确**未执行、零副作用**；
 * - 能力抛错 / 契约外回执（缺失/形状非法/action 与工具不符）→ `ok:false`「未能安装/未获明确结果」
 *   ——**绝不**说成已安装/已卸载。
 * 悬挂防护：`raceAbort`（会话中止即立即返回；本地调用，不设等待超时）。
 */
function makeMcpReceiptTool(kind: "install" | "uninstall", fn: InstallMcpFn | UninstallMcpFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = kind === "install" ? INSTALL_MCP_TOOL_NAME : UNINSTALL_MCP_TOOL_NAME;
  const verb = kind === "install" ? "安装" : "卸载";
  const expectedAction = kind === "install" ? ("installed" as const) : ("uninstalled" as const);
  return {
    name,
    async handler(call) {
      const turnId = currentTurnId?.();
      const roleId = readStringArg(call.args, ["roleId", "role_id", "role"]);
      if (roleId === undefined || roleId.trim() === "") {
        return { ok: false, message: `${name}: 缺少 roleId 参数（目标角色 id），无法${verb}MCP` };
      }
      const mcpName = readStringArg(call.args, ["name"]);
      if (mcpName === undefined || mcpName.trim() === "") {
        return { ok: false, message: `${name}: 缺少 name 参数（MCP 名，稳定短 slug），无法${verb}MCP` };
      }
      const payload: InstallMcpPayload = { roleId, name: mcpName };

      let receipt: unknown;
      try {
        receipt = await raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return turnId === undefined ? fn(payload) : fn(payload, handbackMetadata(turnId, scope)); }), call.signal, `${name} ${verb}MCP`);
      } catch (err) {
        return { ok: false, message: `${name}：MCP**未能${verb}**（原因：${reasonOf(err)}）——**不要当它已${verb}**；如实向客户说明。` };
      }
      const normalized = skillReceiptOf(receipt, expectedAction);
      if (normalized === undefined) {
        return { ok: false, message: `${name}：能力未返回明确回执（回执缺失、形状非法或 action 与工具不符）——按**未执行**处理；**不要当它已${verb}**，如实告知客户。` };
      }
      if (normalized.ok === true) {
        const detail = kind === "install"
          ? `声明：${normalized.path}（sha256 ${normalized.digest.slice(0, 12)}）`
          : `效果已撤；声明保留于 ${normalized.path}（sha256 ${normalized.digest.slice(0, 12)}）`;
        const effectiveText = normalized.effective === "rebuilt" ? "已重建该角色会话、即刻生效" : "该角色正在运行轮次（不打断）——新会话起生效";
        return {
          ok: true,
          message:
            `${name}：MCP「${normalized.name}」已${verb} → 角色「${normalized.roleId}」。${detail}；生效：${effectiveText}。` +
            `${normalized.note !== undefined ? ` ${normalized.note}` : ""}` +
            `注意：本次${verb}**未改变任何角色的写边界**——外来 MCP 工具在 ANS 门禁之外执行（能力级授予），不是逐调用受审` +
            `${kind === "uninstall" ? "；**已发生的副作用不可撤**" : ""}。`,
        };
      }
      return {
        ok: false,
        message: `${name}：MCP${verb}**未执行**（${normalized.reason !== undefined ? `reason: ${normalized.reason}；` : ""}回执：${normalized.message ?? "能力侧未提供原因"}）——零副作用；**不要当它已${verb}**，如实告知客户。`,
      };
    },
  };
}

/** install_mcp：**MCP 安装**工具（G-4 V2，**只给内置治理角色**；见 `makeMcpReceiptTool` §纪律）。 */
function makeInstallMcpTool(fn: InstallMcpFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  return makeMcpReceiptTool("install", fn, currentTurnId, scope);
}

/** uninstall_mcp：**MCP 卸载**工具（G-4 V2，**只给内置治理角色**；见 `makeMcpReceiptTool` §纪律）。 */
function makeUninstallMcpTool(fn: UninstallMcpFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  return makeMcpReceiptTool("uninstall", fn, currentTurnId, scope);
}

// —————————————— Flow 文件方法化（2026-10-20 客户拍板；最小闭环） ——————————————
//
// 三工具只做两件事：**参数形状校验**（非法在触达能力前拒绝，不猜测、不静默丢弃）＋**调用注入能力
// 并如实转达回执**。权限/状态迁移合法性/证据完整性/revision 冲突/Steward/Lead 权限等**一律由编排
// flow-service 裁决**——本层不读写 flow 文件、不写账本、不做第二份裁决。
// 未注入对应能力 ⇒ 工具不注册（沿 dispatch_task 先例，能力缺席＝最强 fail-closed）。
//
// 诚实面：步骤推进 ≠ 客户批准——需要客户决定的步骤仍须走 request_confirmation/request_choice；
// 回执 `ok:true` 只表示服务端接受了变更（`idempotent:true`＝同一 idempotencyKey 重放、未重复变更）。

const FLOW_TOOL_STATUS_SET: ReadonlySet<string> = new Set(FLOW_TOOL_STATUSES);
const FLOW_TOOL_STEP_KIND_SET: ReadonlySet<string> = new Set(FLOW_TOOL_STEP_KINDS);

/** 参数形状错误：触达能力前拒绝，明确「未执行」。 */
function flowArgumentError(name: string, detail: string): ToolResult {
  return { ok: false, message: `${name}: ${detail}——未执行；请更正后重试（不要猜测参数）` };
}

/** 必填非空字符串（不改写载荷值）。 */
function readFlowRequiredText(args: Record<string, unknown>, key: string, name: string): { ok: true; value: string } | { ok: false; result: ToolResult } {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, result: flowArgumentError(name, `缺少或非法的 ${key} 参数（须为非空字符串）`) };
  }
  return { ok: true, value };
}

/** 可选非空字符串：缺席保持缺席（不造键）；给出时必须是字符串。 */
function readFlowOptionalText(args: Record<string, unknown>, key: string, name: string): { ok: true; value: string | undefined } | { ok: false; result: ToolResult } {
  const value = args[key];
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, result: flowArgumentError(name, `${key} 参数非法（须为非空字符串；可省略）`) };
  }
  return { ok: true, value };
}

/** 可选证据 `{kind, ref}`：形状校验（枚举/非空 ref）在工具层；存在性与完整性在 flow-service。 */
function readFlowEvidence(args: Record<string, unknown>, name: string): { ok: true; value: FlowToolEvidence | undefined } | { ok: false; result: ToolResult } {
  const raw = args["evidence"];
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, result: flowArgumentError(name, "evidence 参数非法（须为 {kind, ref} 对象）") };
  }
  const record = raw as Record<string, unknown>;
  if (typeof record["kind"] !== "string" || !FLOW_TOOL_STEP_KIND_SET.has(record["kind"])) {
    return { ok: false, result: flowArgumentError(name, `evidence.kind 非法（须为 ${FLOW_TOOL_STEP_KINDS.join("/")} 之一）`) };
  }
  if (typeof record["ref"] !== "string" || record["ref"].trim() === "") {
    return { ok: false, result: flowArgumentError(name, "evidence.ref 非法（须为非空字符串）") };
  }
  return { ok: true, value: { kind: record["kind"] as FlowToolStepKind, ref: record["ref"] } };
}

/** 服务端回执里的 issues：只转达非空字符串项（其它类型忽略，不猜）。 */
function flowIssuesOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const issues = value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  return issues.length > 0 ? issues : undefined;
}

/** 结构化流程视图 → 可读文本（原样投影字段，不重算状态；格式异常只跳过，不抛）。 */
function renderFlowView(flow: unknown): string {
  if (flow === null || typeof flow !== "object" || Array.isArray(flow)) return "";
  const record = flow as Partial<FlowToolView>;
  const lines: string[] = [];
  const header: string[] = [];
  if (typeof record.flowId === "string") header.push(`flowId=${record.flowId}`);
  if (typeof record.revision === "string") header.push(`revision=${record.revision}`);
  if (typeof record.qualityTier === "string") header.push(`qualityTier=${record.qualityTier}`);
  if (header.length > 0) lines.push(`流程：${header.join("；")}`);
  const canUpdate = Array.isArray(record.canUpdate) ? record.canUpdate.filter((id): id is string => typeof id === "string") : [];
  lines.push(`当前角色可更新步骤：${canUpdate.length > 0 ? canUpdate.join(", ") : "（无）"}`);
  const steps = Array.isArray(record.steps) ? record.steps : [];
  if (steps.length > 0) {
    lines.push("步骤：");
    for (const rawStep of steps) {
      if (rawStep === null || typeof rawStep !== "object") continue;
      const step = rawStep as Partial<FlowToolStepView>;
      const text = `- ${String(step.id ?? "?")}：${String(step.title ?? "")}（owner=${String(step.owner ?? "?")}；kind=${String(step.kind ?? "?")}；status=${String(step.status ?? "?")}）`;
      const extras: string[] = [];
      const evidence = step.evidence as Partial<FlowToolEvidence> | undefined;
      if (evidence !== undefined && typeof evidence.kind === "string" && typeof evidence.ref === "string") {
        extras.push(`evidence=${evidence.kind}:${evidence.ref}`);
      }
      if (Array.isArray(step.supersedes) && step.supersedes.length > 0) {
        extras.push(`supersedes=${step.supersedes.filter((id): id is string => typeof id === "string").join(",")}`);
      }
      if (typeof step.supersededBy === "string") extras.push(`supersededBy=${step.supersededBy}`);
      lines.push(extras.length > 0 ? `${text} ${extras.join(" ")}` : text);
    }
  }
  return `\n${lines.join("\n")}`;
}

/**
 * flow 回执 → 工具结果：**原样**转达 `ok/code/revision/error/issues`（含 idempotent 与 flow 视图）。
 * 契约外回执（缺失/非对象/ok 非布尔）⇒ fail-closed「未获明确结果」，绝不当成功。
 */
function flowResultMessage(name: string, value: unknown): ToolResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: `${name}：flow 服务未返回明确结果（回执缺失或非法）——不要据此推断流程状态。` };
  }
  const receipt = value as Partial<FlowToolResult>;
  if (typeof receipt.ok !== "boolean") {
    return { ok: false, message: `${name}：flow 服务未返回明确结果（缺少 ok 布尔）——不要据此推断流程状态。` };
  }
  const parts: string[] = [`ok=${receipt.ok}`];
  if (typeof receipt.code === "string" && receipt.code !== "") parts.push(`code=${receipt.code}`);
  if (typeof receipt.revision === "string" && receipt.revision !== "") parts.push(`revision=${receipt.revision}`);
  if (receipt.idempotent === true) parts.push("idempotent=true");
  if (typeof receipt.error === "string" && receipt.error !== "") parts.push(`error=${receipt.error}`);
  const issues = flowIssuesOf(receipt.issues);
  if (issues !== undefined) parts.push(`issues=${issues.join("；")}`);
  const detail = `（${parts.join("；")}）`;
  if (!receipt.ok) {
    return {
      ok: false,
      message: `${name}：操作**未完成**${detail}——请如实向客户说明；按 code/error/issues 修正后重试，最新状态以服务端 revision 为准。`,
    };
  }
  return {
    ok: true,
    message: `${name}：操作成功${detail}${renderFlowView(receipt.flow)}\n注意：步骤推进 ≠ 客户批准；需要客户决定的步骤仍须走客户交互工具。`,
  };
}

/** flow_get：只读流程结构化视图（`flowId` 可选；缺省＝当前/默认 flow，由服务端归一）。 */
function makeFlowGetTool(fn: FlowGetFn): ExecutableTool {
  const name = FLOW_GET_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const raw = call.args["flowId"];
      if (raw !== undefined && raw !== null && typeof raw !== "string") {
        return flowArgumentError(name, "flowId 参数非法（应为字符串；可省略＝当前流程）");
      }
      const flowId = typeof raw === "string" && raw.trim() !== "" ? raw : undefined;
      let result: unknown;
      try {
        result = await raceAbort(
          Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return fn(flowId !== undefined ? { flowId } : {}); }),
          call.signal,
          `${name} 读取流程`,
        );
      } catch (err) {
        return { ok: false, message: `${name}：流程读取**未完成**（原因：${reasonOf(err)}）——没有拿到视图就**不要推断流程状态**；如确需，可稍后重试。` };
      }
      return flowResultMessage(name, result);
    },
  };
}

/** flow_step_update：推进单个步骤状态（迁移/权限/证据/revision 裁决在 flow-service）。 */
function makeFlowStepUpdateTool(fn: FlowStepUpdateFn): ExecutableTool {
  const name = FLOW_STEP_UPDATE_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const flowId = readFlowRequiredText(call.args, "flowId", name);
      if (!flowId.ok) return flowId.result;
      const stepId = readFlowRequiredText(call.args, "stepId", name);
      if (!stepId.ok) return stepId.result;
      const statusRaw = call.args["status"];
      if (typeof statusRaw !== "string" || !FLOW_TOOL_STATUS_SET.has(statusRaw)) {
        return flowArgumentError(name, `status 参数非法（须为 ${FLOW_TOOL_STATUSES.join("/")} 之一）`);
      }
      const expectedRevision = readFlowRequiredText(call.args, "expectedRevision", name);
      if (!expectedRevision.ok) return expectedRevision.result;
      const evidence = readFlowEvidence(call.args, name);
      if (!evidence.ok) return evidence.result;
      const idempotencyKey = readFlowOptionalText(call.args, "idempotencyKey", name);
      if (!idempotencyKey.ok) return idempotencyKey.result;
      const note = readFlowOptionalText(call.args, "note", name);
      if (!note.ok) return note.result;
      const input: Parameters<FlowStepUpdateFn>[0] = {
        flowId: flowId.value,
        stepId: stepId.value,
        status: statusRaw as FlowToolStatus,
        expectedRevision: expectedRevision.value,
        ...(evidence.value !== undefined ? { evidence: evidence.value } : {}),
        ...(idempotencyKey.value !== undefined ? { idempotencyKey: idempotencyKey.value } : {}),
        ...(note.value !== undefined ? { note: note.value } : {}),
      };
      let result: unknown;
      try {
        result = await raceAbort(
          Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return fn(input); }),
          call.signal,
          `${name} 更新步骤`,
        );
      } catch (err) {
        return { ok: false, message: `${name}：步骤更新**未完成**（原因：${reasonOf(err)}）——**不要当它已生效**；如确需，先 flow_get 看最新 revision 再重试。` };
      }
      return flowResultMessage(name, result);
    },
  };
}

/** flow_step_supersede：新步骤取代旧步骤（Steward/Lead——服务端按调用角色校验）。 */
function makeFlowStepSupersedeTool(fn: FlowStepSupersedeFn): ExecutableTool {
  const name = FLOW_STEP_SUPERSEDE_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const flowId = readFlowRequiredText(call.args, "flowId", name);
      if (!flowId.ok) return flowId.result;
      const oldStepId = readFlowRequiredText(call.args, "oldStepId", name);
      if (!oldStepId.ok) return oldStepId.result;
      const newStepId = readFlowRequiredText(call.args, "newStepId", name);
      if (!newStepId.ok) return newStepId.result;
      const title = readFlowRequiredText(call.args, "title", name);
      if (!title.ok) return title.result;
      const owner = readFlowRequiredText(call.args, "owner", name);
      if (!owner.ok) return owner.result;
      const kindRaw = call.args["kind"];
      if (typeof kindRaw !== "string" || !FLOW_TOOL_STEP_KIND_SET.has(kindRaw)) {
        return flowArgumentError(name, `kind 参数非法（须为 ${FLOW_TOOL_STEP_KINDS.join("/")} 之一）`);
      }
      const expectedRevision = readFlowRequiredText(call.args, "expectedRevision", name);
      if (!expectedRevision.ok) return expectedRevision.result;
      const reason = readFlowOptionalText(call.args, "reason", name);
      if (!reason.ok) return reason.result;
      const idempotencyKey = readFlowOptionalText(call.args, "idempotencyKey", name);
      if (!idempotencyKey.ok) return idempotencyKey.result;
      const input: Parameters<FlowStepSupersedeFn>[0] = {
        flowId: flowId.value,
        oldStepId: oldStepId.value,
        newStepId: newStepId.value,
        title: title.value,
        owner: owner.value,
        kind: kindRaw as FlowToolStepKind,
        expectedRevision: expectedRevision.value,
        ...(reason.value !== undefined ? { reason: reason.value } : {}),
        ...(idempotencyKey.value !== undefined ? { idempotencyKey: idempotencyKey.value } : {}),
      };
      let result: unknown;
      try {
        result = await raceAbort(
          Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return fn(input); }),
          call.signal,
          `${name} 替代步骤`,
        );
      } catch (err) {
        return { ok: false, message: `${name}：步骤替代**未完成**（原因：${reasonOf(err)}）——**不要当它已生效**；如确需，先 flow_get 看最新 revision 再重试。` };
      }
      return flowResultMessage(name, result);
    },
  };
}

/**
 * 构造受治理工具集：
 * - 写入类 write_file / edit_file（先 gate，获准且配置了 writeRoot 时落盘）；
 * - 读取类 read_file + 只读目录列举 list_dir（均不过 gate）；
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
    makeListDirTool(readRoot),
  ];

  // 结构性保证（设计 §7.5.1）：**未注入 ShellGate 时 run_shell 根本不存在**。
  // 「能力缺席」是最强的 fail-closed——不是「注册了再在 execute 里判空」，而是工具压根不在集合里，
  // 模型无法请求、扩展层也无需守它。这是与本模式（写类工具在 execute 内判空）刻意的不同处理。
  const shellGate = options?.shellGate;
  if (shellGate !== undefined) {
    const shellCwd = options?.shellCwd ?? process.cwd();
    const reviewMs =
      options?.shellReviewTimeoutMs ?? readTimeoutMs(process.env, SHELL_REVIEW_TIMEOUT_ENV, DEFAULT_SHELL_REVIEW_TIMEOUT_MS);
    // 命令级执行时限（F-1-c）：显式选项 > env > 默认；非法/空缺回退默认（readTimeoutMs 语义，**不可禁用**）。
    // 与 reviewMs 同址在构建时解析一次；`RuntimeSessionOptions` 以 `...options` 透传，桌面端经 env 即可起效。
    const execMs =
      options?.shellExecTimeoutMs ?? readTimeoutMs(process.env, SHELL_EXEC_TIMEOUT_ENV, DEFAULT_SHELL_EXEC_TIMEOUT_MS);
    tools.push(makeRunShellTool(shellGate, shellCwd, reviewMs, execMs, options?.interactionGate, options?.diagnostics, options?.currentTurnId, options?.extraCredentialEnvVars));
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
  // **未注入派发能力时 `dispatch_task` 不存在**。只给内置治理角色——编排对项目角色不注入即不注册。
  const dispatchTask = options?.dispatchTask;
  if (dispatchTask !== undefined) {
    tools.push(makeDispatchTaskTool(dispatchTask, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  }

  // 结构性保证（W6-A，同 dispatch_task 先例）：**未注入交接/澄清能力时对应工具不存在**。
  // 只给联络官/报告员——由能力注入面（编排/桌面窗口）决定「注入才注册」；本层不硬编码角色 id。
  // 未注入 ⇒ 模型无法请求（能力缺席 = 最强 fail-closed）。两能力各自独立、互不隐含。
  const handOffIntent = options?.handOffIntent;
  if (handOffIntent !== undefined) {
    tools.push(makeHandOffIntentTool(handOffIntent, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  }
  const requestClarification = options?.requestClarification;
  if (requestClarification !== undefined) {
    tools.push(makeRequestClarificationTool(requestClarification, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  }

  // 结构性保证（R-1，同 run_shell / customerInput 等先例）：**未注入审读结论能力时
  // `report_shell_verdict` 不存在**。只给审读会话——由调用方以是否注入表达。
  const shellVerdict = options?.shellVerdict;
  if (shellVerdict !== undefined) {
    tools.push(makeReportShellVerdictTool(shellVerdict));
  }

  // 结构性保证（G-2/R1，同 run_shell / dispatchTask 先例）：**未注入数据源时看护只读工具不存在**。
  // 只给内置治理角色——由调用方（编排注入端，判据沿 dispatch_task 的 suppressHandback 先例）决定注入；
  // 未注入 ⇒ 模型无法请求（能力缺席 = 最强 fail-closed）。metadata 同 dispatch_task 先例（turnId 捕获）。
  const roleStatus = options?.roleStatus;
  if (roleStatus !== undefined) tools.push(makeRoleStatusTool(roleStatus, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  const sessionTail = options?.sessionTail;
  if (sessionTail !== undefined) tools.push(makeSessionTailTool(sessionTail, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));

  // 结构性保证（G-2/R2，同 dispatch_task 先例）：**未注入恢复提议能力时 `propose_recovery` 不存在**。
  const proposeRecovery = options?.proposeRecovery;
  if (proposeRecovery !== undefined) {
    tools.push(makeProposeRecoveryTool(proposeRecovery, options?.currentTurnId, options?.interactionGate, { roleId: options?.roleId, runtime: options?.runtime }));
  }

  // 结构性保证（G-4/I2，同 dispatch_task 先例）：**未注入安装/卸载能力时对应工具不存在**。
  // 只给内置治理角色——由调用方（注入端判据沿 dispatch_task 的 suppressHandback 先例）决定注入；
  // 未注入 ⇒ 模型无法请求（能力缺席 = 最强 fail-closed）。两能力各自独立「注入才注册」。
  const installSkill = options?.installSkill;
  if (installSkill !== undefined) {
    tools.push(makeInstallSkillTool(installSkill, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  }
  const uninstallSkill = options?.uninstallSkill;
  if (uninstallSkill !== undefined) {
    tools.push(makeUninstallSkillTool(uninstallSkill, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  }
  // 结构性保证（G-4 V2，同技能对先例）：**未注入 MCP 安装/卸载能力时对应工具不存在**。
  // 只给内置治理角色——由调用方（注入端判据沿 dispatch_task 的 suppressHandback 先例）决定注入；
  // 未注入 ⇒ 模型无法请求（能力缺席 = 最强 fail-closed）。两能力各自独立「注入才注册」。
  const installMcp = options?.installMcp;
  if (installMcp !== undefined) {
    tools.push(makeInstallMcpTool(installMcp, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  }
  const uninstallMcp = options?.uninstallMcp;
  if (uninstallMcp !== undefined) {
    tools.push(makeUninstallMcpTool(uninstallMcp, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  }
  // 结构性保证（2026-10-20 flow 文件方法化，同 dispatch_task 先例）：**未注入对应能力时三工具不存在**。
  // 三能力各自独立「注入才注册」；权限/迁移/证据/revision 冲突/Steward/Lead 权限裁决在编排 flow-service，
  // 本层只做参数形状校验并如实转达回执（不做第二份裁决）。
  const flowGet = options?.flowGet;
  if (flowGet !== undefined) tools.push(makeFlowGetTool(flowGet));
  const flowStepUpdate = options?.flowStepUpdate;
  if (flowStepUpdate !== undefined) tools.push(makeFlowStepUpdateTool(flowStepUpdate));
  const flowStepSupersede = options?.flowStepSupersede;
  if (flowStepSupersede !== undefined) tools.push(makeFlowStepSupersedeTool(flowStepSupersede));
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

