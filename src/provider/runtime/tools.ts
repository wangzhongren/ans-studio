// Shared ANS tool execution. Owner: 运行时核心. SDK adapters receive handlers by injection.
import { coreToolTarget, utf8Prefix } from "../../common/runtime-core/tool-display.ts";
import { createEventQueue } from "../../common/runtime-core/event-queue.ts";
import { resolveProjectList } from "../../common/runtime-core/list-dir.ts";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, realpath, stat, lstat, unlink } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, join } from "node:path";
import type {
  WriteGate,
  WriteGateContext,
  WriteGateOperation,
  FileGateStage, FileGateFacts, FileGateProtectionFacts, CanonicalWriteFacts, CurrentFileFacts,
  ShellGate,
  ShellPostAuditFn,
  ShellExecutionOutcome,
  ShellReviewResult,
  ShellEscalationFn,
  ReadonlyGitCapability,
  ReadonlyGitExecutionFacts,
  CustomerInputFn,
  CustomerInputRequest,
  CustomerInputOutcome,
  CustomerInputOption,
  CustomerInputMetadata,
  ReportHandbackFn,
  ReportHandbackPayload,
  DispatchTaskFn,
  DispatchTaskPayload,
  RoleStatusFn,
  RoleStatusPayload,
  SessionTailFn,
  InstallSkillFn,
  InstallSkillPayload,
  InstallSkillReceipt,
  UninstallSkillFn,
  InstallMcpFn,
  InstallMcpPayload,
  UninstallMcpFn,
  RequestRequirementChangeFn,
  RequestRequirementChangeInput,
  RequestRequirementChangeResult,
  ShellVerdictFn,
  ShellVerdictPayload,
  InteractionGate,
  PromptInputEventDetail, RuntimeAdapter, RuntimeProviderOptions, SessionEvent, ToolCall,
  ToolDefinition, ToolResult, GovernedToolsOptions,
  GovernanceCardKind, GovernanceCardMetadata, GovernanceChoiceCardKind, GovernanceConfirmCardKind, GovernanceFlowMetadata,
  BackgroundTaskCapability, BackgroundTaskSnapshot,
  ViewImageFn, ViewImageInput, PromptImage, ViewImageReceipt, ViewImageDeliveryMode, RuntimeViewImagePolicy,
  RoleActivityLogFn, RoleActivityLogPayload, TaskSideEffect,
  TerminateRoleRunFn, TerminateRoleRunPayload, RedispatchTaskFn, RedispatchTaskPayload,
  ContractCheckFn, ContractCheckInput, EvidenceCheckFn, EvidenceCheckInput, CriteriaRef,
  DocFormatFn, DocFormatInput,
  ProjectStateFn, ProjectNoteFn, RequestVersionDecisionFn,
  SubmitVersionChangeFn, SubmitRefactorFn, RequestStableWriteFn,
  SubmitVersionChangeInput, SubmitRefactorInput, RequestStableWriteInput,
  PlanEscalationFn, PlanEscalationInput,
  VersionChangeTargetSubmission,
  SelectRunChangeInput, CompleteTeamPlanInput, ActivateRoleDocumentsInput, CloseCreatedTaskInput,
  FixedCloseCreatedTaskInput, FixedActivateRoleDocumentsInput, TaskClosedOutcome,
  DecidePendingRequestInput, DecidePendingRequestFn, ChiefDecisionExecutionContext,
  WorkflowAction, WorkflowStage, WorkflowPath,
  RuntimeActiveToolFact, RuntimeOwnedProcessFact,
  GitQueryRequest, GitCandidateRequest, GitPublishRequest,
} from "../../model/runtime.ts";
import { isDirectActionReceipt, isDirectActionSource, isGitOid, isGitBasis, isGitLiteralPath, isGitCapabilityResult } from "../../model/trunk.ts";
import { isWorkflowPath, isWorkflowStage } from "../../model/runtime.ts";
import {
  PLAN_ESCALATION_CATEGORIES,
  PLAN_ESCALATION_SUMMARY_MAX,
  PLAN_ESCALATION_ERROR_CODES,
  PLAN_ESCALATION_REQUEST_ID_PATTERN,
} from "../../model/runtime.ts";
import {
  DOWNLOAD_ERROR_CODES,
  DOWNLOAD_FILENAME_MAX_CHARS,
  DOWNLOAD_PURPOSE_MAX_BYTES,
  DOWNLOAD_URL_MAX_BYTES,
  type DownloadApprovalSource,
  type DownloadRequestInput,
  type DownloadRequestMetadata,
  type DownloadRequestResult,
  type RequestDownloadFn,
} from "../../model/download.ts";
import {
  PROJECT_NOTE_BLOCKER_TEXT_MAX,
  PROJECT_NOTE_NEXT_STEP_DEFAULT_KEY,
  PROJECT_NOTE_NEXT_STEP_TEXT_MAX,
  PROJECT_NOTE_REFS_MAX,
  PROJECT_STATE_TOOL_MAX_BYTES,
  VERSION_DECISION_ACTIONS,
  VERSION_DECISION_ERROR_CODES,
  VERSION_DECISION_REASON_MAX,
  VERSION_DECISION_REFS_MAX,
} from "../../model/project-state.ts";
import type { ProjectNoteInput, ProjectNoteOp, ProjectStateQuery, VersionDecisionRequest } from "../../model/project-state.ts";
import type { GovernanceMatrixFn } from "../../model/governance-matrix.ts";
import {
  CONTRACT_SCHEMA_TOPICS,
  GOVERNANCE_SLUG_PATTERN,
  REFACTOR_SCOPE_ITEMS_MAX,
  STABLE_WRITE_CONTENT_MAX_CHARS,
  VCA_SUBMISSION_PATH_MAX_CHARS,
  VCA_SUBMISSION_TARGETS_MAX,
  isChiefDecisionExecutionContext,
  isDispatchTaskReviewTarget,
  isDispatchTaskResumeController,
} from "../../model/runtime.ts";
import {
  AMENDMENT_ID_PATTERN,
  REFACTOR_ERROR_CODES,
  REFACTOR_REQUESTED_BY,
  REFACTOR_REQUEST_ID_PATTERN,
  REFACTOR_REQUEST_STATUSES,
  REFACTOR_REASON_MAX,
  STABLE_WRITE_ERROR_CODES,
  STABLE_WRITE_REQUEST_ID_PATTERN,
  STABLE_WRITE_STATUSES,
  VERSION_CHANGE_ERROR_CODES,
  VERSION_CHANGE_ID_PATTERN,
  VERSION_CHANGE_INITIATOR_BY_KIND,
  VERSION_CHANGE_KINDS,
  VERSION_CHANGE_STATUSES,
  VERSION_CHANGE_SUMMARY_MAX,
  VERSION_CHANGE_TARGET_ACTIONS,
} from "../../model/version-change.ts";
import type { RefactorRequestScope, VersionChangeKind } from "../../model/version-change.ts";
import type { WriteDecision } from "../../model/decision.ts";
import type { DiagnosticLog } from "../../model/runtime.ts";
import { DEFAULT_LOCALE, translate } from "../../common/shared/i18n/index.ts";
import type { MessageKey } from "../../common/shared/i18n/keys.ts";
import { describeTool } from "./schema.ts";
// E2 X-R2/X-R4（rapporteur / convener）：requirement-change 动作前置的角色模块 public entry。
// E0.3 §2 依赖方向：engines（含 Provider）只经角色模块 `index.ts` 只读消费；本前置不经 Service，
// 也不 import 角色模块内部文件/门禁引擎私有 common。模块为纯数据/纯策略（无 I/O、无状态）。
import type { RolePolicyDecision } from "../../model/role.ts";
import { convenerRoleModule } from "../../common/roles/convener/index.ts";
import { rapporteurRoleModule } from "../../common/roles/rapporteur/index.ts";
import { formatDenialMessage } from "../../common/runtime-core/format-denial.ts";
import { formatMechanicalRejection, makeMechanicalRejection, type MechanicalRejection } from "../../common/编排/mechanical-rejection.ts";
import { recordToolWrite } from "../../common/编排/write-journal.ts";
import { validateEvidencePath } from "../../common/编排/evidence-check.ts";
import { docFormatKnownIds } from "../../common/编排/doc-format-specs.ts";
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
import {
  BACKGROUND_TASK_DEFAULT_TAIL_LINES,
  BACKGROUND_TASK_MAX_RUNNING,
  BACKGROUND_TASK_MAX_TAIL_LINES,
} from "../../common/runtime-core/background-tasks.ts";
import { killProcessTree } from "../../common/runtime-core/process-tree.ts";
import { PI_CREDENTIAL_ENV_VARS, RUNTIME_CREDENTIAL_ENV_VARS } from "../../common/shared/runtime-shared.ts";
import { isAbsoluteAny, isWithinReal } from "../../common/shared/path-primitives.ts";
import {
  atomicWriteFile,
  ensureParentDir,
  guardWriteTarget,
  recheckParentInsideWriteRoot,
  resolveWriteAbs,
} from "../../common/runtime-core/fs-write.ts";

/** run_shell 工具名（唯一 shell 入口）。扩展层据此设能力级 kill-switch，工具集据此注册。 */
export const SHELL_TOOL_NAME = "run_shell";

/** Application resource observation only. No project path, write capability or fallback prompt is accepted. */
export async function loadBuiltinChiefWorkflow(): Promise<Readonly<{
  text: string; sourceUrl: string; moduleUrl: string; version: string; sha256: string; bytes: number; applicationVersion: string;
}>> {
  const source = new URL("../../common/门禁引擎/workflows/chief/chief-workflow.md", import.meta.url);
  try {
    const bytes = await readFile(source);
    if (bytes.length === 0 || bytes.length > 256 * 1024) throw new Error("empty or oversized Chief workflow resource");
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.includes("\0") || !/^\uFEFF?# Chief 工作流\r?\n/.test(text)) throw new Error("invalid Chief workflow Markdown identity");
    const versions = [...text.matchAll(/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm)];
    if (versions.length !== 1) throw new Error("missing or ambiguous Chief workflow resource version");
    const application = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8")) as { version?: unknown };
    if (typeof application.version !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(application.version)) throw new Error("application version unavailable");
    return Object.freeze({ text, sourceUrl: source.href, moduleUrl: import.meta.url, version: versions[0]![1]!,
      sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, applicationVersion: application.version });
  } catch (error) { throw new Error(`chief-workflow-resource-unavailable: ${source.href} (${reasonOf(error)})`, { cause: error }); }
}

/** start_background_task 工具名（2026-10-22 后台任务 B1；会话级后台启动，复用 run_shell 审核链）。 */
export const START_BACKGROUND_TASK_TOOL_NAME = "start_background_task";
/** request_shell_escalation 工具名（2026-10-31 shell 判拒升级方案 v1.3；注入才注册，且 shell 必须已 arm）。 */
export const REQUEST_SHELL_ESCALATION_TOOL_NAME = "request_shell_escalation";

/** 角色必要性说明上限（方案 §4.3：UTF-8 ≤ 1KB / 500 字符；工具层超限拒绝、不截断）。 */
const SHELL_ESCALATION_NECESSITY_MAX_CHARS = 500;
const SHELL_ESCALATION_NECESSITY_MAX_BYTES = 1024;
/** list_background_tasks 工具名（B1；只读列出当前会话保留的后台任务）。 */
export const LIST_BACKGROUND_TASKS_TOOL_NAME = "list_background_tasks";
/** read_background_task 工具名（B1；读取任务状态与 stdout/stderr 尾部）。 */
export const READ_BACKGROUND_TASK_TOOL_NAME = "read_background_task";
/** stop_background_task 工具名（B1；按终止预算停止任务）。 */
export const STOP_BACKGROUND_TASK_TOOL_NAME = "stop_background_task";

/** request_confirmation 工具名（设计 A-1；交互工具族之一：请求客户确认，可带预览）。 */
export const REQUEST_CONFIRMATION_TOOL_NAME = "request_confirmation";

/** request_choice 工具名（设计 A-1；交互工具族之一：请求客户勾选/单选，options）。 */
export const REQUEST_CHOICE_TOOL_NAME = "request_choice";

/** request_download 工具名（2026-11-04 下载申请；注入 `requestDownload` 能力才注册）。 */
export const REQUEST_DOWNLOAD_TOOL_NAME = "request_download";

/** submit_report 工具名（设计 C-1；交报告——角色完成时回交 su 汇总）。 */
export const SUBMIT_REPORT_TOOL_NAME = "submit_report";

/** dispatch_task 工具名（设计 H-1；su 派发任务给项目角色——派发 ≠ 授权）。 */
export const DISPATCH_TASK_TOOL_NAME = "dispatch_task";

/** report_shell_verdict 工具名（R-1；审读会话交回结构化审读结论；与编排 shell-gate.ts:206 同串）。 */
export const SHELL_VERDICT_TOOL_NAME = "report_shell_verdict";

/** role_status 工具名（G-2/R1；su 只读状态查询——看护回路自查入口，纯读无副作用）。 */
export const ROLE_STATUS_TOOL_NAME = "role_status";

/** contract_check 工具名（2026-10-30 / 方案 v3 §3.2；只读契约速查，不改变任何门禁）。 */
export const CONTRACT_CHECK_TOOL_NAME = "contract_check";
const CONTRACT_CHECK_MAX_BYTES = 4096;

/** doc_format 工具名（2026-11-09 文档格式权威说明；注入 `docFormat` 能力才注册）。 */
export const DOC_FORMAT_TOOL_NAME = "doc_format";
/** doc_format 输出上限（索引/详情均为 8 KiB；数据源已按预算渲染，本层再防御性截断）。 */
const DOC_FORMAT_MAX_BYTES = 8 * 1024;
const DOC_FORMAT_TRUNCATED_MARKER = "\n…（已截断；用 part=fields|example|errors 缩小范围）";
/** 未知 format 的回显上限（与注册表未知-id 提示同口径；AC-8：回显 ≤40 字符）。 */
const DOC_FORMAT_ECHO_MAX = 40;

/** evidence_check 工具名（3.4；只读证据重算，不执行项目脚本、不授予写权）。 */
export const EVIDENCE_CHECK_TOOL_NAME = "evidence_check";
const EVIDENCE_CHECK_MAX_BYTES = 4096;

/** session_tail 工具名（G-2/R1；su 只读会话尾线——受保护投影后的规范化行，纯读无副作用）。 */
export const SESSION_TAIL_TOOL_NAME = "session_tail";

/** role_activity_log 工具名（B 批；幕僚只读每角色运行日志——纯读、脱敏、项目相对路径）。 */
export const ROLE_ACTIVITY_LOG_TOOL_NAME = "role_activity_log";

/** terminate_role_run 工具名（B 批；幕僚确认卡死后终止当前轮次 + 子进程树）。 */
export const TERMINATE_ROLE_RUN_TOOL_NAME = "terminate_role_run";

/** redispatch_task 工具名（B 批；卡死终止后按副作用安全分类重派，仅 safe 自动执行）。 */
export const REDISPATCH_TASK_TOOL_NAME = "redispatch_task";

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

/** request_requirement_change 工具名（2026-10-26；报告员提交需求变更审批（提案/统筹 decision 卡）——申请≠批准，发起方不得自批）。 */
export const REQUEST_REQUIREMENT_CHANGE_TOOL_NAME = "request_requirement_change";

/** project_state 工具名（2026-11-02；全局任务状态只读摘要——与 UI 同一 builder，注入才注册）。 */
export const PROJECT_STATE_TOOL_NAME = "project_state";

/** project_note 工具名（2026-11-02；幕僚受控备注（focus/blocker/next-step），append-only，注入才注册）。 */
export const PROJECT_NOTE_TOOL_NAME = "project_note";

/** request_version_decision 工具名（2026-11-02；幕僚版本决策申请——申请≠批准，注入才注册）。 */
export const REQUEST_VERSION_DECISION_TOOL_NAME = "request_version_decision";


/** view_image 工具名（2026-10-26；读取项目内图片并按运行时策略交付——同轮附图优先 / 下一轮附件回退；注入才注册）。 */
export const VIEW_IMAGE_TOOL_NAME = "view_image";

/** `view_image` 单文件大小上限（10 MB，按字节；超过即拒绝，不截断、不缩图）。 */
export const VIEW_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** 工具层缺省策略（未注入 `viewImagePolicy` 时）：下一轮附件 + 全局 10 MB——与 2026-10-26 行为零变化。 */
export const VIEW_IMAGE_DEFAULT_POLICY: RuntimeViewImagePolicy = Object.freeze({
  delivery: "next-turn",
  maxImageBytes: VIEW_IMAGE_MAX_BYTES,
});

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
// 2026-10-18：`intent-confirm`（客户需求确认卡）加入 choice 白名单。
// 2026-10-20 客户拍板「勾了替我决策就不用我管」：它进入 `GOVERNANCE_CARD_GROUP` 的 decision 组——
// 判断 agent 可代批 `confirm`；`revise` 仍交回客户/发起角色（不替客户修改）。
// 2026-10-22 治理分工第 1 项：`appointment` 语义改为「任命」（由 Convener 依客户确认的团队计划发起；
// Crew 收到任命后才写卡）。角色→允许卡种的映射由编排判定（本层不硬编码角色 id）；白名单形状不变、不新增卡种。
// 2026-10-26 客户要求：`decision`（材料性选择卡，仅统筹使用；卡内恰一个 `recommended: true`）加入
// choice 白名单。本层只做 enumerate 校验——不另立卡种表、不校验推荐项个数（应用/角色侧校验）。
const CHOICE_CARD_KINDS: readonly GovernanceChoiceCardKind[] = ["proposal", "appointment", "acceptance", "intent-confirm", "decision"];
// C 批：`write` 已从 schema 枚举删除；工具层保留 legacy 字符串解析以兼容旧调用/旧项目，
// 新会话模型看不到该枚举；D 批随旧工具面清理。
const CONFIRM_CARD_KINDS: readonly GovernanceConfirmCardKind[] = ["appointment-write"];

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
 * write 首次及最终复核均传真实最终字节；edit 首次只读 probe 必须由宿主身份验证，最终才传字节 hash。
 */
type Prologue =
  | { proceed: true; abs: string | undefined }
  | { proceed: false; result: ToolResult };

const editReadProbes = new WeakMap<object, string>();
function makeEditReadProbe(target: string): WriteGateContext {
  const context: WriteGateContext = Object.freeze({ phase: "edit-read", operation: "edit" });
  editReadProbes.set(context, target); return context;
}
/** Private issued-object/path identity, never a caller's phase string or a write permit. */
export function isFileEditReadProbe(context: unknown, target: string): boolean {
  return context !== null && typeof context === "object" && editReadProbes.get(context) === target;
}
type FileGateHost = {
  projectRoot: string; skillRoot: string; protection?: FileGateProtectionFacts;
  protectedRoots: readonly string[];
  isCurrent(): boolean;
};
type FileInvocation = {
  active: boolean; gateActive: boolean; context?: WriteGateContext;
  invocationId: string; operationId: string; target: string; operation: WriteGateOperation;
  host: FileGateHost; canonical?: CanonicalWriteFacts; currentFile?: CurrentFileFacts;
};
const fileGateContexts = new WeakMap<object, { invocation: FileInvocation; facts: FileGateFacts; inspected: boolean }>();
function copyFileFacts(facts: FileGateFacts): FileGateFacts {
  return { ...facts, ...(facts.canonicalFacts ? { canonicalFacts: { ...facts.canonicalFacts,
    protectedRoots: [...facts.canonicalFacts.protectedRoots], reasons: [...facts.canonicalFacts.reasons] } } : {}),
    ...(facts.stage === "final-write" ? { currentFile: { ...facts.currentFile } } : {}) } as FileGateFacts;
}
/** Only live, exact issued identity inside this synchronous gate call. Returns data, no effect capability. */
export function inspectFileGateContext(context: unknown, target: string, operation: WriteGateOperation, stage: FileGateStage): FileGateFacts | undefined {
  if (!context || typeof context !== "object") return undefined;
  const issued = fileGateContexts.get(context);
  if (!issued) return undefined;
  const { invocation, facts } = issued;
  if (!invocation.active || !invocation.gateActive || invocation.context !== context || !invocation.host.isCurrent()
    || invocation.target !== target || facts.targetPath !== target || invocation.operation !== operation
    || facts.operation !== operation || facts.stage !== stage || facts.invocationId !== invocation.invocationId
    || facts.operationId !== invocation.operationId || facts.projectRoot !== invocation.host.projectRoot
    || facts.skillRoot !== invocation.host.skillRoot) return undefined;
  issued.inspected = true;
  return copyFileFacts(facts);
}
function stagedFileGate(gate: WriteGate, name: string, invocation: FileInvocation, stage: FileGateStage, data?: Buffer): Prologue {
  const facts = { stage, invocationId: invocation.invocationId, operationId: invocation.operationId,
    targetPath: invocation.target, operation: invocation.operation, projectRoot: invocation.host.projectRoot,
    skillRoot: invocation.host.skillRoot, ...(invocation.canonical ? { canonicalFacts: invocation.canonical } : {}),
    ...(stage === "final-write" ? { currentFile: Object.freeze({ ...invocation.currentFile! }), contentSha256: sha256Hex(data!) } : {}) } as FileGateFacts;
  Object.freeze(facts);
  const context: WriteGateContext = Object.freeze({ stage, fileFacts: facts, operation: invocation.operation,
    ...(stage === "final-write" ? { contentSha256: sha256Hex(data!) } : {}),
    ...(stage === "canonical-read" && invocation.operation === "edit" ? { phase: "edit-read" as const } : {}) });
  const issued = { invocation, facts, inspected: false };
  fileGateContexts.set(context, issued);
  if (context.phase === "edit-read") editReadProbes.set(context, invocation.target);
  invocation.context = context; invocation.gateActive = true;
  try {
    const result = govern(gate, name, invocation.target, invocation.host.projectRoot, context);
    if (!result.proceed) return result;
    if (!issued.inspected || !invocation.host.isCurrent()) return { proceed: false,
      result: { ok: false, message: `${name}: host-facts-v1 stage not inspected or host configuration changed; no read/write` } };
    return result;
  } finally {
    invocation.gateActive = false; invocation.context = undefined;
    fileGateContexts.delete(context); editReadProbes.delete(context);
  }
}
function fileGateHost(options?: GovernedToolsOptions): FileGateHost | undefined {
  if (options?.fileGateProtocol === undefined) return undefined;
  const projectRoot = options.projectRoot ?? "", skillRoot = options.skillRoot ?? "";
  const source = options.fileGateProtection;
  const capture = () => { try { return JSON.stringify({ projectRoot: options.projectRoot ?? "", skillRoot: options.skillRoot ?? "",
    protection: options.fileGateProtection, roots: options.protectedGitRoots }); } catch { return undefined; } };
  const signature = capture();
  const protection = source && Object.freeze({ ...source,
    protectedGitRoots: Object.freeze(Array.isArray(source.protectedGitRoots) ? [...source.protectedGitRoots] : []),
    coverage: Array.isArray(source.protectedGitRoots) && Array.isArray(source.reasons) ? source.coverage : "unknown" as const,
    reasons: Object.freeze(Array.isArray(source.reasons) ? [...source.reasons] : ["invalid-host-protection-reasons"]) });
  const protectedRoots = Object.freeze([...new Set([...(protection?.protectedGitRoots ?? []), ...(Array.isArray(options.protectedGitRoots) ? options.protectedGitRoots : [])])]);
  return { projectRoot, skillRoot, protection, protectedRoots,
    isCurrent: () => signature !== undefined && options.fileGateProtocol === "host-facts-v1" && signature === capture() };
}
function rejectFileHostArguments(args: Record<string, unknown>, name: string): ToolResult | undefined {
  const key = ["protectedGitRoots", "context", "phase", "contentSha256", "operation", "editReadProbe", "stage", "fileFacts", "invocationId", "operationId",
    "projectRoot", "skillRoot", "canonicalFacts", "currentFile", "fileGateProtocol", "fileGateProtection",
    "targetPath", "canonical", "protectedRoots", "coverage", "basisDigest", "reasons", "roots"].find(key => Object.hasOwn(args, key));
  return key === undefined ? undefined : { ok: false, message: `${name}: ${key} is host-only` };
}

function govern(
  gate: WriteGate,
  name: string,
  path: string,
  writeRoot: string | undefined,
  context?: WriteGateContext,
): Prologue {
  // 解析为绝对路径（纯词法，不碰文件系统），把 abs 传给 gate；写入也用同一个 abs。
  // writeRoot 未配置时沿用原样 path 传给 gate（保持既有判定语义），且后续不落盘。
  const resolved = writeRoot !== undefined ? resolveWriteAbs(path, writeRoot) : path;

  let decision: WriteDecision;
  try {
    // 首次（无上下文）真正以单参数调用，保持旧 gate/arguments 语义逐字不变。
    decision = context === undefined ? gate(resolved) : gate(resolved, context);
  } catch (err) {
    // gate 抛错 —— 此时尚未触碰文件系统（无 mkdir / 无 open）→ fail-closed，不写。
    return { proceed: false, result: { ok: false, message: `${name} 门禁判定异常，未写入：${path}（${reasonOf(err)}）` } };
  }
  if (!decision.allowed) {
    const legacy = formatDenialMessage(decision);
    const structured = decision.rejection !== undefined ? formatMechanicalRejection(decision.rejection as unknown as MechanicalRejection) : "";
    return { proceed: false, result: { ok: false, message: structured !== "" ? `${structured}
${legacy}` : legacy } };
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

/** 写前最终字节 sha256（hex；F6 内容上下文；只读、无副作用）。 */
function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Strict nearest-existing-ancestor resolution: unreadable paths never fall back to lexical allow. */
async function canonicalProtectionPath(path: string): Promise<string> {
  let current = resolve(path);
  const missing: string[] = [];
  for (let depth = 0; depth < 4096; depth++) {
    try { return join(await realpath(current), ...missing.reverse()); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missing.push(relative(parent, current)); current = parent;
    }
  }
  throw new Error("path ancestor resolution budget exceeded");
}
/** Provider defense in depth, not an OS sandbox or evidence that host root discovery is complete. */
async function finalFileProtection(abs: string, protectedGitRoots?: readonly string[]): Promise<{ ok: true } | { ok: false; reason: string }> {
  const rejected = (reason: string) => ({ ok: false as const, reason: `[file-write-protection] ${reason}` });
  try {
    if (protectedGitRoots !== undefined && !Array.isArray(protectedGitRoots)) return rejected("protected roots unavailable");
    const roots = protectedGitRoots ?? [];
    if (roots.some(root => typeof root !== "string" || !isAbsolute(root))) return rejected("protected root must be an absolute host path");
    const lexical = resolve(abs);
    if (lexical.replace(/\\/g, "/").split("/").some(part => part.toLowerCase() === ".git")) return rejected("Git metadata target");
    if (roots.some(root => isWithinReal(resolve(root), lexical))) return rejected("target is within a host protected Git/worktree root");
    let targetStat: Awaited<ReturnType<typeof lstat>> | undefined;
    try { targetStat = await lstat(abs); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (targetStat?.isSymbolicLink()) return rejected("symbolic-link target");
    if (targetStat?.isFile() && (!Number.isSafeInteger(targetStat.nlink) || targetStat.nlink !== 1)) return rejected("hardlink or unknown link count (requires nlink=1)");
    const canonical = await canonicalProtectionPath(abs);
    if (canonical.replace(/\\/g, "/").split("/").some(part => part.toLowerCase() === ".git")) return rejected("canonical Git metadata target");
    for (const root of roots) if (isWithinReal(await canonicalProtectionPath(root), canonical)) return rejected("canonical target is within a host protected Git/worktree root");
    return { ok: true };
  } catch (error) { return rejected(`canonical identity unavailable; no write (${reasonOf(error)})`); }
}

async function canonicalFileFacts(invocation: FileInvocation): Promise<CanonicalWriteFacts> {
  const { host, target } = invocation;
  const protection = host.protection;
  const reasons = [...(protection?.reasons ?? ["host-protection-facts-missing"])];
  let projectRoot = host.projectRoot, skillRoot = host.skillRoot, canonicalTarget = target;
  const protectedRoots: string[] = [];
  try {
    if (!host.isCurrent() || !isAbsolute(projectRoot) || !isAbsolute(skillRoot)
      || !protection || protection.coverage !== "complete" || resolve(protection.projectRoot) !== resolve(projectRoot)
      || !/^[a-f0-9]{64}$/i.test(protection.basisDigest) || !Array.isArray(protection.protectedGitRoots)
      || !Array.isArray(protection.reasons) || protection.reasons.length > 0) throw Error("host-protection-coverage-unproven");
    projectRoot = await canonicalProtectionPath(projectRoot); skillRoot = await canonicalProtectionPath(skillRoot);
    canonicalTarget = await canonicalProtectionPath(target);
    for (const root of host.protectedRoots) {
      if (typeof root !== "string" || !isAbsolute(root)) throw Error("invalid-host-protected-root");
      protectedRoots.push(await canonicalProtectionPath(root));
    }
    if (!host.isCurrent()) throw Error("host-protection-facts-changed");
  } catch (error) { reasons.push(reasonOf(error)); }
  return Object.freeze({ projectRoot, skillRoot, target: canonicalTarget,
    protectedRoots: Object.freeze(protectedRoots), coverage: reasons.length === 0 ? "complete" : "unknown",
    basisDigest: protection?.basisDigest ?? "", reasons: Object.freeze(reasons) });
}
async function observeCurrentFile(abs: string): Promise<{ facts: CurrentFileFacts; raw?: Buffer }> {
  try {
    const raw = await readFile(abs);
    return { facts: Object.freeze({ state: "present", sha256: sha256Hex(raw) }), raw };
  } catch (error) {
    return { facts: Object.freeze((error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing" } : { state: "unknown", reason: reasonOf(error) }) };
  }
}
async function beginFileInvocation(gate: WriteGate, name: string, abs: string, operation: WriteGateOperation,
  host: FileGateHost, writeRoot: string, roots?: readonly string[], signal?: AbortSignal): Promise<
    { ok: true; invocation: FileInvocation; raw?: Buffer } | { ok: false; result: ToolResult }> {
  const invocation: FileInvocation = { active: true, gateActive: false, invocationId: randomUUID(), operationId: randomUUID(), target: abs, operation, host };
  const reject = (result: ToolResult) => { invocation.active = false; return { ok: false as const, result }; };
  if (signal?.aborted || !host.isCurrent() || !isAbsolute(host.projectRoot) || !isAbsolute(host.skillRoot))
    return reject({ ok: false, message: `${name}: host roots/protocol unavailable or invocation aborted` });
  const lexical = stagedFileGate(gate, name, invocation, "lexical-read");
  if (!lexical.proceed) return reject(lexical.result);
  invocation.canonical = await canonicalFileFacts(invocation);
  const canonical = stagedFileGate(gate, name, invocation, "canonical-read");
  if (!canonical.proceed) return reject(canonical.result);
  // Even a permissive consumer cannot upgrade unknown metadata to a read permit.
  if (invocation.canonical.coverage !== "complete") return reject({ ok: false, message: `${name}: canonical/host coverage unknown; no content read` });
  const protection = await finalFileProtection(abs, roots);
  if (!protection.ok) return reject({ ok: false, message: `${name}: ${protection.reason}` });
  const guarded = await guardWriteTarget(abs, writeRoot);
  if (!guarded.ok) return reject({ ok: false, message: `${name}: ${guarded.reason}` });
  if (signal?.aborted || !host.isCurrent() || JSON.stringify(await canonicalFileFacts(invocation)) !== JSON.stringify(invocation.canonical))
    return reject({ ok: false, message: `${name}: canonical/host facts drift before content read` });
  const current = await observeCurrentFile(abs);
  invocation.currentFile = current.facts;
  if (current.facts.state === "unknown") return reject({ ok: false, message: `${name}: current file unknown (${current.facts.reason}); no write` });
  return { ok: true, invocation, ...(current.raw ? { raw: current.raw } : {}) };
}
async function recheckFileInvocation(invocation: FileInvocation): Promise<string | undefined> {
  if (!invocation.active || !invocation.host.isCurrent()) return "file invocation/host facts expired";
  if (JSON.stringify(await canonicalFileFacts(invocation)) !== JSON.stringify(invocation.canonical)) return "canonical/host facts changed";
  const current = await observeCurrentFile(invocation.target);
  if (JSON.stringify(current.facts) !== JSON.stringify(invocation.currentFile)) return "current file changed or became unknown";
  return undefined;
}

/** 落盘前守卫 + mkdir + 二次复核 + 原子写；任一步失败返回可读错误（可能已建目录但未写文件）。 */
async function writeGuarded(
  gate: WriteGate,
  name: string,
  path: string,
  abs: string,
  writeRoot: string,
  data: Buffer,
  opts: { createParent: boolean },
  operation: WriteGateOperation,
  signal?: AbortSignal,
  onWrite?: (abs: string) => boolean | void | Promise<boolean | void>,
  protectedGitRoots?: readonly string[],
  invocation?: FileInvocation,
): Promise<ToolResult> {
  if (signal?.aborted) return { ok: false, message: `${name}：会话已中止，未写入` };
  const protectedBefore = await finalFileProtection(abs, protectedGitRoots);
  if (!protectedBefore.ok) return { ok: false, message: `${name} 拒绝写入：${protectedBefore.reason}` };
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

  // 3) mkdir 后复用同一个门禁重新判定（角色/真实目标授权仍由 gate 负责）。
  //    F6：本次为写前复核，携带最终字节 sha256 与操作类型；首次调用（无上下文）语义不变。
  const changed = invocation ? await recheckFileInvocation(invocation) : undefined;
  if (changed) return { ok: false, message: `${name}: ${changed}; no write` };
  const reauthorized = invocation ? stagedFileGate(gate, name, invocation, "final-write", data) : govern(gate, name, abs, writeRoot, {
    contentSha256: sha256Hex(data),
    operation,
  });
  if (!reauthorized.proceed) {
    return { ok: false, message: `${name} 写入前复核未通过：${reauthorized.result.message}（未写入目标文件；可能已创建父目录）` };
  }
  // 再复核真实父目录与先前一致，仅缩小并发替换窗口，不声称消除全部 TOCTOU。
  const recheck = await recheckParentInsideWriteRoot(writeRoot, guarded.target.parentAbs, guarded.target.parentReal);
  if (!recheck.ok) {
    return { ok: false, message: `${name} 拒绝写入：${recheck.reason}` };
  }
  const protectedFinal = await finalFileProtection(abs, protectedGitRoots);
  if (!protectedFinal.ok) return { ok: false, message: `${name} 拒绝写入：${protectedFinal.reason}` };
  const finalChanged = invocation ? await recheckFileInvocation(invocation) : undefined;
  if (finalChanged) return { ok: false, message: `${name}: ${finalChanged}; no write` };

  // 4) 原子写（同目录 temp + rename）。
  try {
    signal?.throwIfAborted();
    await atomicWriteFile(abs, data, signal);
  } catch (err) {
    return { ok: false, message: `${name} 写入失败：${path}（${reasonOf(err)}）` };
  }
  if (onWrite !== undefined) {
    try {
      const registered = await onWrite(abs);
      if (registered === false) {
        // v2.15：guard 预检/登记失败 ⇒ 新建版本文件回退（仅 write_file 新建场景；edit 旧版已被 guard 拒绝）。
        if (opts.createParent) await unlink(abs).catch(() => undefined);
        return { ok: false, message: `${name}  wrote ${path} 但版本登记预检失败，已回退（不留下未登记的新版本）。` };
      }
    } catch (err) {
      if (opts.createParent) await unlink(abs).catch(() => undefined);
      return { ok: false, message: `${name} 已写入 ${path}，但版本登记失败：${reasonOf(err)}（已尝试回退新版本）` };
    }
  }
  // 2026-11-05（审计归因修复，回执 ANS-AUDIT-2026-11-05-001）：登记写日志，供 shell 执行后审计
  // 把本次合法落盘（含并发会话）与 shell/外部进程写入区分开；不改变任何写权限。
  recordToolWrite(abs, sha256Hex(data));
  return { ok: true, message: `${name} 已获准并落盘：${path}（${data.length} 字节写入 ${abs}）` };
}

/** write_file：获准后 mkdir -p 父目录 → 原子写 content（UTF-8，不加 BOM）。 */
function makeWriteFileTool(gate: WriteGate, writeRoot: string | undefined, onWrite?: (abs: string) => boolean | void | Promise<boolean | void>, protectedGitRoots?: readonly string[], host?: FileGateHost): ExecutableTool {
  const name = "write_file";
  return {
    name,
    async handler(call) {
      const invalidHost = rejectFileHostArguments(call.args, name); if (invalidHost) return invalidHost;
      const path = readTargetPath(call.args);
      if (path === undefined) return { ok: false, message: `${name}: 缺少 path 参数，无法判定写入目标` };
      const content = readStringArg(call.args, ["content", "text"]);
      if (content === undefined) return { ok: false, message: `${name}: 缺少 content 参数，无法写入` };

      // 写前内容校验（仅角色 boundary.yaml）：非法 ⇒ 拒绝，任何文件系统副作用之前返回。
      const invalidBoundary = rejectInvalidBoundaryWrite(name, path, content, writeRoot);
      if (invalidBoundary !== undefined) return invalidBoundary;

      const data = Buffer.from(content, "utf8");
      if (host) {
        if (writeRoot === undefined) return { ok: false, message: `${name}: staged protocol requires actual writeRoot` };
        const staged = await beginFileInvocation(gate, name, resolveWriteAbs(path, writeRoot), "write", host, writeRoot, protectedGitRoots, call.signal);
        if (!staged.ok) return staged.result;
        try { return await writeGuarded(gate, name, path, staged.invocation.target, writeRoot, data,
          { createParent: true }, "write", call.signal, onWrite, protectedGitRoots, staged.invocation); }
        finally { staged.invocation.active = false; }
      }
      const pre = govern(gate, name, path, writeRoot, { contentSha256: sha256Hex(data), operation: "write" });
      if (!pre.proceed) return pre.result;
      if (pre.abs === undefined || writeRoot === undefined) {
        return { ok: true, message: `${name} 已获准（写入）：${path}（本次构造未配置 writeRoot，已判定但未落盘）` };
      }
      if (call.signal?.aborted) return { ok: false, message: `${name}：会话已中止，未写入` };
      return writeGuarded(gate, name, path, pre.abs, writeRoot, data, { createParent: true }, "write", call.signal, onWrite, protectedGitRoots);
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
function makeEditFileTool(gate: WriteGate, writeRoot: string | undefined, onWrite?: (abs: string) => boolean | void | Promise<boolean | void>, protectedGitRoots?: readonly string[], host?: FileGateHost): ExecutableTool {
  const name = "edit_file";
  return {
    name,
    async handler(call) {
      const invalidHost = rejectFileHostArguments(call.args, name); if (invalidHost) return invalidHost;
      const path = readTargetPath(call.args);
      if (path === undefined) return { ok: false, message: `${name}: 缺少 path 参数，无法判定写入目标` };
      const oldString = readStringArg(call.args, ["old_string", "oldString"]);
      const newString = readStringArg(call.args, ["new_string", "newString"]);
      if (oldString === undefined || newString === undefined) {
        return { ok: false, message: `${name}: 缺少 old_string / new_string 参数` };
      }

      if (host && writeRoot === undefined) return { ok: false, message: `${name}: staged protocol requires actual writeRoot` };
      const staged = host ? await beginFileInvocation(gate, name, resolveWriteAbs(path, writeRoot!), "edit", host, writeRoot!, protectedGitRoots, call.signal) : undefined;
      if (staged && !staged.ok) return staged.result;
      const invocation = staged?.ok ? staged.invocation : undefined;
      try {
      const pre: Prologue = invocation ? { proceed: true, abs: invocation.target } : govern(gate, name, path, writeRoot,
        writeRoot === undefined ? undefined : makeEditReadProbe(resolveWriteAbs(path, writeRoot)));
      if (!pre.proceed) return pre.result;
      if (pre.abs === undefined || writeRoot === undefined) {
        return { ok: true, message: `${name} 已获准（编辑）：${path}（本次构造未配置 writeRoot，已判定但未落盘）` };
      }

      const protectedRead = await finalFileProtection(pre.abs, protectedGitRoots);
      if (!protectedRead.ok) return { ok: false, message: `${name} 拒绝编辑：${protectedRead.reason}` };
      const readTarget = await guardWriteTarget(pre.abs, writeRoot);
      if (!readTarget.ok) return { ok: false, message: `${name} 拒绝编辑：${readTarget.reason}` };
      // 读原文件（只读；发生在 gate 和真实目标保护之后）。
      let raw: Buffer;
      try {
        if (staged?.ok) {
          if (staged.raw === undefined) return { ok: false, message: `${name}: target is missing; no edit` };
          raw = staged.raw;
        } else raw = await readFile(pre.abs);
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
      const readParent = await recheckParentInsideWriteRoot(writeRoot, readTarget.target.parentAbs, readTarget.target.parentReal);
      if (!readParent.ok) return { ok: false, message: `${name} 拒绝编辑：${readParent.reason}` };

      return await writeGuarded(gate, name, path, pre.abs, writeRoot, data, { createParent: false }, "edit", call.signal, onWrite, protectedGitRoots, invocation);
      } finally { if (invocation) invocation.active = false; }
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

// —————————————— 图片查看：同轮工具结果附图优先 + 下一轮附件回退（2026-10-26/2026-10-27；view_image） ——————————————
//
// 2026-10-26 客户要求「让角色能看项目里的图片」。因各引擎对**工具结果附图**的支持不一致，先落地**两轮附件**：
// 工具只读取/校验图片，并调用注入的 `ViewImageFn` 把图片排队为同一角色下一轮用户提示的图片附件。
// 2026-10-27 客户要求并授权「同轮看图修复」：工具结果可直接携带模型可见图片（`ToolResult.images`），
// 交付方式由 `viewImagePolicy.delivery` 单一决定（Service 按 `RUNTIME_VIEW_IMAGE_POLICY` 注入）；工具层
// **不写引擎分支**，适配器负责把 `ToolResult.images` 映射为各引擎原生工具结果内容。
//
// 两阶段共同纪律：
// - 能力未注入 ⇒ 工具不注册（结构性 fail-closed）；路径句法/realpath 根内/普通文件/扩展名/≤10 MB/
//   回读字节复核全部在触达交付前完成，非法 ⇒ 工具失败且**不调用能力**、不交付任何图片。
// - 回执必须如实：`ok:false`/抛错/契约外回执/交付方式与策略不一致 ⇒ fail-closed（无图，明确「未提供
//   图片，不要假装已看到」）；成功文案逐字区分同轮附图与下一轮排队。
// - 审计只记 path/mime/bytes/delivery/reason 等元数据，**绝不**记录 base64、`data:` URL 或图片字节。
// - 本工具不写盘、不联网、不过写门禁，也不改变 read_file / 其它工具的任何行为。

/** `view_image` 支持的扩展名 → MIME（匹配时小写化；按**真实文件**扩展名判定）。 */
const VIEW_IMAGE_MIME: Readonly<Record<string, string>> = Object.freeze({
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
});

/**
 * `view_image` 的路径句法拒绝集（与 `read_file` 同一 `readTargetPath`/`readRoot` 口径，但更严格）：
 * 空串、NUL、绝对路径/盘符路径（含盘符相对 `C:foo`）与任何 `..` 段 ⇒ 在触碰文件系统前拒绝。
 * 真实路径越界（符号链接/junction 逃逸）由 `isWithinReal` 在 realpath 之后复核。
 */
function viewImagePathSyntaxError(path: string): string | undefined {
  if (path.trim() === "") return "path 为空";
  if (path.includes("\u0000")) return "path 含 NUL 字符";
  if (isAbsolute(path) || isAbsoluteAny(path) || /^[A-Za-z]:/.test(path)) return "必须是项目相对路径（不得为绝对路径/盘符路径）";
  if (path.replace(/\\/g, "/").split("/").some((segment) => segment === "..")) return "不得包含 `..` 路径段";
  return undefined;
}

/**
 * 能力回执归一（契约外 → undefined，由调用方按「未提供图片」fail-closed，不把不明结果当成功）。
 * `mode` 只接受 `"tool-result"` / `"next-turn"`；其它值＝契约外回执（不猜测交付方式）。
 * `mode` 缺省＝`"next-turn"`（旧能力实现零破坏）。
 */
function viewImageReceiptOf(value: unknown): ViewImageReceipt | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record["ok"] !== true && record["ok"] !== false) return undefined;
  const mode = record["mode"];
  if (mode !== undefined && mode !== "tool-result" && mode !== "next-turn") return undefined;
  const message = typeof record["message"] === "string" && record["message"].trim() !== "" ? record["message"] : undefined;
  return {
    ok: record["ok"] === true,
    ...(mode !== undefined ? { mode: mode as ViewImageDeliveryMode } : {}),
    ...(message !== undefined ? { message } : {}),
  };
}

/** i18n 共享 key（同轮附图成功文案；项目管理在 `src/common/shared/i18n/messages/*.ts` 添加，本角色只引用）。 */
const VIEW_IMAGE_SAME_TURN_KEY_NAME: string = "main.viewImage.sameTurn";

/** 同轮附图成功文案：共享 i18n key 单一来源；key 缺失时 `translate` 按既有缺失语义回退为 key 本身。 */
function viewImageSameTurnMessage(path: string): string {
  return translate(DEFAULT_LOCALE, VIEW_IMAGE_SAME_TURN_KEY_NAME as MessageKey, { path });
}

/** 策略数值防御：非有限正数回落缺省（Service 是唯一生产注入方；坏策略 fail-closed，不放大预算）。 */
function viewImagePolicyLimit(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * view_image：读取项目内一张图片并按运行时策略交付（`tool-result` 同轮附图 / `next-turn` 下一轮附件）。
 *
 * 顺序：取 path（`readTargetPath`，与 read_file 同口径）→ 路径句法校验 → realpath 根内复核（拒绝越界/
 * 符号链接逃逸）→ 必须是普通文件（目录明确指路 list_dir）→ 扩展名/MIME（.png/.jpg/.jpeg/.webp/.gif）→
 * 大小 ≤ min(10 MB, policy.maxImageBytes) → 读二进制并 base64 →
 * 调用注入能力（tool-result 时为 Service 注入的内联受理回执）→ 按回执归一交付。
 * 任一校验失败都不触达交付、不写盘、不联网；失败一律 fail-closed（不交付图片，文案如实）。
 */
function makeViewImageTool(fn: ViewImageFn, readRoot: string, options?: GovernedToolsOptions): ExecutableTool {
  const name = VIEW_IMAGE_TOOL_NAME;
  const policy = options?.viewImagePolicy ?? VIEW_IMAGE_DEFAULT_POLICY;
  const delivery = policy.delivery;
  const maxImageBytes = Math.min(VIEW_IMAGE_MAX_BYTES, Math.floor(viewImagePolicyLimit(policy.maxImageBytes, VIEW_IMAGE_MAX_BYTES)));
  /** 结构化审计（只记元数据，绝不落 base64/图片字节/`data:` URL）。 */
  const record = (fields: { ok: boolean; turnId?: string; path?: string; mimeType?: string; bytes?: number; delivery?: ViewImageDeliveryMode; reasonCode?: string }): void => {
    try {
      options?.diagnostics?.record("view_image.result", {
        toolName: name,
        ok: fields.ok,
        ...(fields.turnId !== undefined ? { turnId: fields.turnId } : {}),
        ...(fields.path !== undefined ? { path: fields.path } : {}),
        // 说明：共享诊断落盘白名单（`src/common/shared/diagnostics.ts`，项目管理属主）当前只保留
        // path/ok/mode/reasonCode/turnId 等字段；mimeType/bytes 待其扩白名单后才会真正落盘。此处按设计
        // §6.2/§6.7 如实组装，且不含任何图片字节。
        ...(fields.mimeType !== undefined ? { mimeType: fields.mimeType } : {}),
        ...(fields.bytes !== undefined ? { bytes: fields.bytes } : {}),
        ...(fields.delivery !== undefined ? { mode: fields.delivery } : {}),
        ...(fields.reasonCode !== undefined ? { reasonCode: fields.reasonCode } : {}),
      });
    } catch { /* 诊断是观测，绝不能改变执行 */ }
  };
  const limitNote = maxImageBytes === VIEW_IMAGE_MAX_BYTES ? `${VIEW_IMAGE_MAX_BYTES} 字节（10 MB）` : `${maxImageBytes} 字节`;
  return {
    name,
    async handler(call) {
      const turnId = options?.currentTurnId?.();
      // 失败文案：next-turn 逐字保持 2026-10-26 原文（零行为变化）；tool-result 如实写「未提供图片」。
      const notQueued = delivery === "tool-result" ? "未提供图片" : "未排队";
      const notReadNotQueued = delivery === "tool-result" ? "未读取、未提供图片" : "未读取、未排队";
      const fail = (reasonCode: string, message: string, extra?: { path?: string; mimeType?: string; bytes?: number }): ToolResult => {
        record({ ok: false, turnId, reasonCode, delivery, ...extra });
        return { ok: false, message };
      };
      const path = readTargetPath(call.args);
      if (path === undefined) {
        return fail("missing-path", `${name}: 缺少 path 参数（项目内图片路径），无法读取`);
      }
      const syntax = viewImagePathSyntaxError(path);
      if (syntax !== undefined) {
        return fail("path-syntax", `${name} 拒绝读取：${syntax}——${notReadNotQueued}`, { path });
      }

      let rootReal: string;
      try {
        rootReal = await realpath(readRoot);
      } catch (err) {
        return fail("root-unavailable", `${name} 读取失败：读取根不可用（${reasonOf(err)}）——${notQueued}`);
      }
      let real: string;
      try {
        real = await realpath(resolve(readRoot, path));
      } catch (err) {
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        const why = code === "ENOENT" ? "不存在或不可访问" : reasonOf(err);
        return fail("read-failed", `${name} 读取失败：${path} ${why}——${notReadNotQueued}`, { path });
      }
      if (!isWithinReal(rootReal, real)) {
        return fail("outside-root", `${name} 拒绝读取：${path} 在读取根之外（已拒绝）——${notReadNotQueued}`, { path });
      }

      let info;
      try {
        info = await stat(real);
      } catch (err) {
        return fail("read-failed", `${name} 读取失败：${path}（${reasonOf(err)}）——${notReadNotQueued}`, { path });
      }
      if (info.isDirectory()) {
        return fail("not-a-file", `${name} 拒绝读取：${path} 是目录——请用 list_dir 定位后选择图片文件；${notReadNotQueued}`, { path });
      }
      if (!info.isFile()) {
        return fail("not-a-file", `${name} 拒绝读取：${path} 不是普通文件——${notReadNotQueued}`, { path });
      }

      const ext = extname(real).toLowerCase();
      const mimeType = VIEW_IMAGE_MIME[ext];
      if (mimeType === undefined) {
        return fail("unsupported-type", `${name} 拒绝读取：不支持的图片类型「${ext === "" ? "无扩展名" : ext}」（仅支持 .png / .jpg / .jpeg / .webp / .gif）——${notReadNotQueued}`, { path });
      }
      if (info.size > maxImageBytes) {
        return fail("too-large", `${name} 拒绝读取：${path} 大小 ${info.size} 字节，超过上限 ${limitNote}——${notReadNotQueued}`, { path, mimeType, bytes: info.size });
      }

      let raw: Buffer;
      try {
        raw = await readFile(real);
      } catch (err) {
        return fail("read-failed", `${name} 读取失败：${path}（${reasonOf(err)}）——${notQueued}`, { path, mimeType });
      }
      // 读取与 stat 之间文件可能被替换/增长：以实际字节数复核，绝不超限交付。
      if (raw.length > maxImageBytes) {
        return fail("too-large", `${name} 拒绝读取：${path} 实际读取 ${raw.length} 字节，超过上限 ${limitNote}——${notReadNotQueued}`, { path, mimeType, bytes: raw.length });
      }
      if (call.signal?.aborted) {
        return fail("aborted", delivery === "tool-result"
          ? `${name}：本轮已中止，图片未提供——不要当它已提供；本轮不要假装已看到。`
          : `${name}：本轮已中止，图片附件未排队——不要当它已提供；本轮不要假装已看到。`, { path, mimeType, bytes: raw.length });
      }

      const image: PromptImage = { type: "image", data: raw.toString("base64"), mimeType };
      const input: ViewImageInput = { path, image, ...(turnId !== undefined ? { turnId } : {}) };

      let receipt: unknown;
      try {
        receipt = await raceAbort(
          Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return fn(input); }),
          call.signal,
          `${name} ${delivery === "tool-result" ? "确认图片交付" : "排队图片附件"}`,
        );
      } catch (err) {
        // 中止时能力可能已经受理（raceAbort 不取消底层 promise）——不谎称失败，也不谎称已提供。
        if (call.signal?.aborted) {
          return fail("aborted", delivery === "tool-result"
            ? `${name}：本轮已中止，图片交付**未获确认**——**不要当它已提供**；本轮不要假装已看到。`
            : `${name}：本轮已中止，图片附件排队**未获确认**——**不要当它已提供**；下一轮是否收到图片以系统为准，本轮不要假装已看到。`, { path, mimeType, bytes: raw.length });
        }
        return fail("capability-error", delivery === "tool-result"
          ? `${name}：图片**未提供**（原因：${reasonOf(err)}）——本轮不要假装已看到。`
          : `${name}：图片**未能排队**（原因：${reasonOf(err)}）——下一轮不会收到该图片附件；本轮不要假装已看到。`, { path, mimeType, bytes: raw.length });
      }
      const normalized = viewImageReceiptOf(receipt);
      if (normalized === undefined) {
        return fail("invalid-receipt", delivery === "tool-result"
          ? `${name}：能力未返回明确回执（回执缺失或非法）——按**未提供图片**处理；本轮不要假装已看到。`
          : `${name}：能力未返回明确回执（回执缺失或非法）——按**未排队**处理；下一轮不会收到该图片附件；本轮不要假装已看到。`, { path, mimeType, bytes: raw.length });
      }
      if (!normalized.ok) {
        return fail("capability-rejected", delivery === "tool-result"
          ? `${name}：图片**未提供**（回执：${normalized.message ?? "能力侧被拒且未提供原因"}）——本轮不要假装已看到。`
          : `${name}：图片**未能排队**（回执：${normalized.message ?? "能力侧被拒且未提供原因"}）——下一轮不会收到该图片附件；本轮不要假装已看到。`, { path, mimeType, bytes: raw.length });
      }
      const receiptMode = normalized.mode ?? "next-turn";
      if (receiptMode === "tool-result" && delivery !== "tool-result") {
        // 契约不一致（能力声称同轮附图，但运行时策略仍是下一轮附件）⇒ fail-closed：不交付、不谎称。
        return fail("delivery-mismatch", `${name}：能力回执声明同轮附图，但当前运行时策略为下一轮附件（交付契约不一致）——按**未提供图片**处理；本轮不要假装已看到。`, { path, mimeType, bytes: raw.length });
      }
      if (receiptMode === "tool-result") {
        record({ ok: true, turnId, path, mimeType, bytes: raw.length, delivery: "tool-result" });
        return { ok: true, message: viewImageSameTurnMessage(path), images: [image], imageDelivery: "tool-result" };
      }
      // 回退为下一轮附件（或策略本就是 next-turn）：本轮不交付图片。
      record({ ok: true, turnId, path, mimeType, bytes: raw.length, delivery: "next-turn" });
      return {
        ok: true,
        message: `${name}: ${path} 已读取并排队；下一轮以图片附件提供；本轮不要假装已看到。${normalized.message !== undefined ? ` ${normalized.message}` : ""}`,
        imageDelivery: "next-turn",
      };
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
function runShell(argv: string[], cwd: string, env: Record<string, string>, signal: AbortSignal | undefined, execTimeoutMs: number, lifecycle?: RuntimeToolLifecycle): Promise<ShellExecOutcome> {
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
    observeOwnedShell(lifecycle, child, useProcessGroup, () => {
      if (child.exitCode === null && child.signalCode === null) killProcessTree(child, "SIGKILL", useProcessGroup, env);
    });
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

/** 授权放行结果说明（`ShellReviewResult.grant`；2026-10-31 升级方案 v1.3 §6.3/§7.1）。无 grant ⇒ 空串。 */
function shellGrantNote(review: ShellReviewResult): string {
  if (review.allow !== true || review.grant === undefined) return "";
  const { grant } = review;
  const operator = grant.operatorId !== undefined && grant.operatorId !== "" ? `；operator ${grant.operatorId}` : "";
  return grant.scope === "once"
    ? `\n说明：本次放行来自客户升级授权——客户已允许一次（allow-once；requestId ${grant.requestId}${operator}）。该授权已用于本次调用，同一命令下次回到正常审核。`
    : `\n说明：本次放行来自客户升级授权——客户已允许本会话执行该精确命令（allow-session；requestId ${grant.requestId}${operator}）。`;
}

/**
 * request_shell_escalation：对一条**刚被判断 agent 判拒**（或 `manual/retry-capped`）的精确命令申请客户确认
 * （2026-10-31 客户确认方案 v1.3 §4.3/§6.3）。
 *
 * **只申请、不执行命令、不写盘、不创建/消费授权**：资格判定（只读已记录审核结果）、每命令每会话一次、
 * 会话上限、卡片仲裁、客户决定与授权存储全部由编排 registry 实现；本层只校验参数形状、用本文件唯一
 * `splitCommand` 生成 `argv`（模型不提供 argv，也不接受任何授权字段），并原样转达回执（不伪造批准）。
 */
function makeRequestShellEscalationTool(fn: ShellEscalationFn): ExecutableTool {
  const name = REQUEST_SHELL_ESCALATION_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const command = coreToolTarget("core-command-v1", call.args);
      if (command === undefined || command.trim() === "") {
        return { ok: false, message: `${name}: 缺少 command 参数，无法申请客户确认（未执行任何命令）` };
      }
      const split = splitCommand(command);
      if (split.argv.length === 0) return { ok: false, message: `${name}: command 为空，无命令可申请（未执行任何命令）` };
      const rawNecessity = call.args["necessity"];
      if (rawNecessity !== undefined && rawNecessity !== null && typeof rawNecessity !== "string") {
        return { ok: false, message: `${name}: necessity 参数非法（须为字符串；可省略）——未提交申请` };
      }
      const necessity = typeof rawNecessity === "string" && rawNecessity.trim() !== "" ? rawNecessity : undefined;
      if (necessity !== undefined) {
        const chars = Array.from(necessity).length;
        const bytes = new TextEncoder().encode(necessity).length;
        if (chars > SHELL_ESCALATION_NECESSITY_MAX_CHARS || bytes > SHELL_ESCALATION_NECESSITY_MAX_BYTES) {
          return {
            ok: false,
            message:
              `${name}: necessity 超过上限（当前 ${chars} 字符 / ${bytes} 字节；上限 ${SHELL_ESCALATION_NECESSITY_MAX_CHARS} 字符且 ${SHELL_ESCALATION_NECESSITY_MAX_BYTES} 字节）` +
              `——超限拒绝、不截断；未提交申请`,
          };
        }
      }
      let result: { ok: boolean; message: string; state?: string };
      try {
        result = await raceAbort(
          Promise.resolve().then(() => {
            if (call.signal?.aborted) throw new Error("会话已中止");
            return fn({ command, argv: split.argv, ...(necessity !== undefined ? { necessity } : {}) }, call.signal);
          }),
          call.signal,
          `${name} 升级申请`,
        );
      } catch (err) {
        return { ok: false, message: `${name}: 申请未完成（${reasonOf(err)}）——**未获客户允许**，命令未执行；不要假设已批准。` };
      }
      // 回执原样转达；契约外回执按「未获明确结果」处理，绝不写成已批准（fail-closed）。
      if (result === null || typeof result !== "object" || typeof result.ok !== "boolean" || typeof result.message !== "string") {
        return { ok: false, message: `${name}: 应用未返回明确结果（回执缺失或非法）——按**未获客户允许**处理；不要假设已批准。` };
      }
      return { ok: result.ok, message: result.message };
    },
  };
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
/**
 * 只读 Git 路由的程序名判据（2026-11-08 W4-R，设计 P1.3 §2.4.3 / I0-4）：
 * basename（去目录）、去 `.exe`/`.cmd`/`.bat`、小写后为 `git`。
 *
 * 仅用于**路由决定**；实际执行必须经注入的 `readonlyGit` 固定传输能力（绝对可执行 + 固定 config/env），
 * **绝不回退通用 spawn**（N12：执行层不按 PATH/cwd 解析，防项目内同名程序劫持）。
 */
function isReadonlyGitProgram(argv: readonly string[]): boolean {
  const program = argv[0];
  if (typeof program !== "string" || program === "") return false;
  const base = program.split(/[\\/]/).pop() ?? "";
  return base.toLowerCase().replace(/\.(exe|cmd|bat)$/, "") === "git";
}

function makeRunShellTool(shellGate: ShellGate, shellCwd: string, reviewTimeoutMs: number, execTimeoutMs: number, gate?: InteractionGate, diagnostics?: DiagnosticLog, currentTurnId?: () => string | undefined, extraCredentialEnvVars?: readonly string[], shellPostAudit?: ShellPostAuditFn, lifecycle?: RuntimeToolLifecycle, roleId?: string, readonlyGit?: ReadonlyGitCapability): ExecutableTool {
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
      // 2026-10-29（方案 v2.1 §6.5）：执行后写审计——越界写入如实附在工具结果里（不静默）。
      const auditNote = async (outcome: ShellExecutionOutcome): Promise<{ note: string; violated: boolean }> => {
        if (shellPostAudit === undefined) return { note: "", violated: false };
        try {
          const result = await shellPostAudit({ command, argv, cwd, toolCallId, entry: "run_shell", ...(roleId !== undefined ? { roleId } : {}) }, outcome);
          if (result.violations.length === 0) return { note: "", violated: false };
          const shown = result.violations.slice(0, 8).map((v) => `${v.change}:${v.path}`).join("、");
          const more = result.violations.length > 8 ? ` 等 ${result.violations.length} 项` : "";
          return {
            note:
              `\n写审计：检测到越界写入（${shown}${more}）——已记录 docs/audit/shell-gate.jsonl；` +
              "请如实向客户/幕僚报告并核对（不自动回滚）。",
            violated: true,
          };
        } catch {
          return { note: "", violated: false };
        }
      };

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
        review = await withTimeout(raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return shellGate({ command, argv, cwd, toolCallId, entry: "run_shell", ...(roleId !== undefined ? { roleId } : {}) }); }), call.signal, `${name} 审核`), reviewTimeoutMs, `${name} 审核`);
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

      // 客户升级授权放行说明（2026-10-31 方案 v1.3 §6.3）：只按 `ShellReviewResult.grant` 如实附注；
      // 无 grant ⇒ 空串，既有结果文案逐字不变。
      const grantNote = shellGrantNote(review);

      // —— 恰好 allow:true：构造**剥离凭据后**的 env（§7.9），随后**才**启动子进程 ——
      //     观测（F-1-d）：`shell.exec.start` 携带**生效**的时限值，供观测与测试快速断言解析链（不必真等分钟级）。
      const execBegan = Date.now();
      diagnostics?.record("shell.exec.start", { turnId, toolCallId, toolName: name, timeoutMs: execTimeoutMs });
      // 2026-11-08（W4-R，设计 P1.3 §2.4.3 / I0-4）：只读 Git 固定传输路由。审核已 allow，但程序名为
      // `git` 时**不得**回退通用 spawn（N12）：有能力且 `match(argv)` 命中 ⇒ `execute`；无能力/未命中
      // ⇒ `readonly-git-runner-unavailable` 且零执行。非 git 命令维持现状 spawn。
      let outcome: ShellExecOutcome;
      let gitRouted = false;
      if (isReadonlyGitProgram(argv)) {
        const match = readonlyGit?.match(argv);
        if (readonlyGit === undefined || match === undefined || match === null) {
          diagnostics?.record("shell.exec.readonly-git.unavailable", { turnId, toolCallId, toolName: name, reasonCode: "readonly-git-runner-unavailable" });
          return {
            ok: false,
            message: `${name} 未执行：只读 Git 路由不可用（readonly-git-runner-unavailable）——本次未启动任何进程，也不会回退通用 spawn。` +
              `只读 Git 需应用注入固定传输能力；写/发布请使用结构化 git_candidate / git_publish，查询请使用 git_query。` + grantNote,
          };
        }
        gitRouted = true;
        diagnostics?.record("shell.exec.readonly-git.start", { turnId, toolCallId, toolName: name });
        let facts: ReadonlyGitExecutionFacts;
        try {
          facts = await readonlyGit.execute(match, { timeoutMs: execTimeoutMs, outputLimit: MAX_SHELL_OUTPUT_BYTES });
        } catch (err) {
          return { ok: false, message: `${name} 执行失败（只读 Git 固定传输）：${reasonOf(err)}` + grantNote };
        }
        if (!facts || typeof facts !== "object" || typeof facts.stdout !== "string" || typeof facts.stderr !== "string") {
          return { ok: false, message: `${name} 执行失败（只读 Git 固定传输返回的执行事实非法，按未执行处理）` + grantNote };
        }
        outcome = {
          ...(facts.exitCode !== undefined ? { code: facts.exitCode } : {}),
          signal: facts.signal ?? null,
          stdout: facts.stdout,
          stderr: facts.stderr,
          ...(facts.error !== undefined ? { error: facts.error } : {}),
          ...(facts.timedOut !== undefined ? { timedOut: facts.timedOut } : {}),
          ...(facts.timeoutMs !== undefined ? { timeoutMs: facts.timeoutMs } : {}),
          stdoutTruncated: facts.stdoutTruncated === true,
          stderrTruncated: facts.stderrTruncated === true,
        };
      } else {
        outcome = await runShell(argv, cwd, buildShellEnv(process.env, extraCredentialEnvVars), call.signal, execTimeoutMs, lifecycle);
      }
      const transportNote = gitRouted ? "\n说明：本次为只读 Git 白名单命令，经应用固定 Git 传输执行（不按 PATH 查找程序）。" : "";
      // —— 命令级超时（F-1-a）：如实返回「超时已终止（N ms）」+ 已收集的部分输出；**轮次继续**
      //    （模型可重试/换脚本/如实报告）——与「停止本轮」的 ABORTED 语义明确区分。 ——
      if (outcome.timedOut === true) {
        const timeoutMs = outcome.timeoutMs ?? execTimeoutMs;
        diagnostics?.record("shell.exec.timeout", { turnId, toolCallId, toolName: name, timeoutMs, durationMs: Date.now() - execBegan });
        const audited = await auditNote({ ...(outcome.code !== undefined ? { exitCode: outcome.code } : {}), ...(outcome.signal ? { signal: outcome.signal } : {}), timedOut: true });
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
          message: `${head}\nstdout:\n${outcome.stdout}\nstderr:\n${outcome.stderr}\n提示：可重试、拆分命令，或把逻辑写成脚本文件后执行；本轮可继续。` + audited.note + grantNote + transportNote,
        };
      }
      if (outcome.error !== undefined) {
        const audited = await auditNote({ error: outcome.error, ...(outcome.code !== undefined ? { exitCode: outcome.code } : {}), ...(outcome.signal ? { signal: outcome.signal } : {}) });
        return { ok: false, message: `${name} 执行失败（未能启动或运行）：${outcome.error}` + audited.note + grantNote + transportNote, execution: { error: outcome.error, ...(outcome.code !== undefined ? { exitCode:outcome.code } : {}), ...(outcome.signal ? {signal:outcome.signal} : {}) } };
      }
      const code = outcome.code;
      const audited = await auditNote({ ...(code !== undefined ? { exitCode: code } : {}), ...(outcome.signal ? { signal: outcome.signal } : {}) });
      return {
        ok: code === 0 && !audited.violated,
        execution: { ...(code !== undefined ? {exitCode:code} : {}), ...(outcome.signal ? {signal:outcome.signal} : {}), stdout:outcome.stdout, stderr:outcome.stderr, stdoutTruncated:outcome.stdoutTruncated === true, stderrTruncated:outcome.stderrTruncated === true },
        message:
          `${name} 已执行：${command}（exit ${code ?? "?"}${outcome.signal ? `，signal ${outcome.signal}` : ""}）\n` +
          `stdout:\n${outcome.stdout}\nstderr:\n${outcome.stderr}` + audited.note + grantNote + transportNote,
      };
    },
  };
}

// —————————————— 会话级后台任务（2026-10-22 客户确认设计 B1–B4） ——————————————
//
// 四个工具只在「注入 ShellGate（与 run_shell 同判据）＋ Service 注入管理器」时一起注册（注入才注册）。
// 启动工具**复用 run_shell 同一条审核链**：空命令 → `splitCommand` → F-7 守卫 → **并发检查**
// （su 核对点 CC1：F-7 之后、ShellGate 之前）→ `ShellGate`（同一 reviewTimeout/raceAbort/活动闸）→
// `buildShellEnv` 剥离凭据 → cwd=会话 `shellCwd` → 管理器 `start`（唯一 spawn 入口）。
// 审核拒绝/超时/异常/非明确 allow ⇒ **零 spawn**。判断会话不经过 `buildGovernedTools`，结构上看不到四工具。

/** 命令摘要（list/read 展示用；UTF-8 安全截断，不切坏多字节字符）。 */
function backgroundCommandSummary(command: string): string {
  const normalized = command.replace(/\s+/g, " ").trim();
  const capped = utf8Prefix(normalized, 160);
  return capped === normalized ? capped : `${capped}…`;
}

/** 工具结果里的向后兼容结构化事实（不用于诊断落盘——taskId 不在共享白名单）。 */
function backgroundTaskFactsOf(task: BackgroundTaskSnapshot) {
  return {
    taskId: task.taskId,
    state: task.state,
    ...(task.pid !== undefined ? { pid: task.pid } : {}),
    ...(task.exitCode !== undefined ? { exitCode: task.exitCode } : {}),
    ...(task.signal !== undefined ? { signal: task.signal } : {}),
  };
}

/** 单任务摘要行（list 用）。 */
function backgroundSnapshotLine(task: BackgroundTaskSnapshot): string {
  const parts = [
    `- ${task.taskId}`,
    task.state,
    task.pid !== undefined ? `pid ${task.pid}` : "pid 未知",
    `启动于 ${task.startedAt}`,
    `命令：${backgroundCommandSummary(task.command)}`,
  ];
  if (task.exitCode !== undefined) parts.push(`exitCode ${task.exitCode}`);
  if (task.signal !== undefined) parts.push(`signal ${task.signal}`);
  if (task.error !== undefined) parts.push(`error：${truncateUtf8(task.error, 240).text}`);
  return parts.join("  ");
}

/**
 * start_background_task：启动一个**会话级后台任务**并立即返回任务号与 pid。
 * 审核与 spawn 同址：只有 `shellGate` 恰返回 `allow:true` 才调用管理器 `start`；并发上限检查在审核**之前**。
 */
function makeStartBackgroundTaskTool(
  shellGate: ShellGate,
  shellCwd: string,
  reviewTimeoutMs: number,
  manager: BackgroundTaskCapability,
  gate?: InteractionGate,
  diagnostics?: DiagnosticLog,
  currentTurnId?: () => string | undefined,
  extraCredentialEnvVars?: readonly string[],
  roleId?: string,
): ExecutableTool {
  const name = START_BACKGROUND_TASK_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const command = coreToolTarget("core-command-v1", call.args);
      if (command === undefined || command.trim() === "") {
        return { ok: false, message: `${name}: 缺少 command 参数，无命令可执行（未启动）` };
      }
      const split = splitCommand(command);
      if (split.argv.length === 0) return { ok: false, message: `${name}: command 为空，无命令可执行（未启动）` };
      const argv = split.argv;
      const cwd = shellCwd;
      const toolCallId = typeof call.toolCallId === "string" ? call.toolCallId : "";
      const turnId = currentTurnId?.();

      // —— F-7 执行层守卫（在审核与并发检查之前）：命中 ⇒ 不调 gate、不 spawn、不建任务。——
      const guardHit = detectUnsupportedShellSyntax(split);
      if (guardHit !== undefined) {
        diagnostics?.record("shell.guard.blocked", { turnId, toolCallId, toolName: name, reasonCode: guardHit.token });
        return { ok: false, message: shellGuardMessage(name, guardHit) };
      }

      // —— 并发上限（su 核对点 CC1）：F-7 之后、ShellGate 之前；超限零 spawn、无审核请求。——
      if (manager.runningCount >= BACKGROUND_TASK_MAX_RUNNING) {
        diagnostics?.record("background.limit", { reasonCode: "concurrency-limit", count: manager.runningCount });
        return {
          ok: false,
          message:
            `${name} 未启动：当前会话运行中的后台任务已达上限（${BACKGROUND_TASK_MAX_RUNNING} 个）。` +
            `请先用 stop_background_task 停止不需要的任务后重试；本次未调用审核、未启动任何进程。`,
        };
      }

      // —— 唯一的命令级闸：与 run_shell 同一审核时限/raceAbort/交互挂起闸；只有恰好 allow:true 才继续。——
      let review: ShellReviewResult | undefined;
      const began = Date.now();
      gate?.begin();
      diagnostics?.record("shell.review.start", { turnId, toolCallId, toolName: name });
      try {
        review = await withTimeout(raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return shellGate({ command, argv, cwd, toolCallId, entry: "start_background_task", ...(roleId !== undefined ? { roleId } : {}) }); }), call.signal, `${name} 审核`), reviewTimeoutMs, `${name} 审核`);
      } catch (err) {
        diagnostics?.error("shell.review.failed", err, { turnId, toolCallId, toolName: name });
        return { ok: false, message: `${name} 未启动：审核未通过（${reasonOf(err)}）——未执行任何进程` };
      } finally {
        gate?.end();
        diagnostics?.record("shell.review.end", { turnId, toolCallId, toolName: name, durationMs: Date.now() - began, decision: review?.allow === true ? "allow" : "deny" });
      }
      if (call.signal?.aborted) return { ok: false, message: `${name} 未启动：会话已中止` };
      if (review === undefined || review === null || review.allow !== true) {
        const denied = review !== undefined && review !== null && review.allow === false ? review : undefined;
        const why = denied !== undefined ? denied.reason : "审核未返回明确的允许（缺 allow:true）";
        const by = denied !== undefined ? `，审者：${denied.by}` : "";
        return { ok: false, message: `${name} 未启动：审核拒绝（${why}${by}）——未执行任何进程` };
      }

      // —— 恰好 allow:true：与 run_shell 同源的凭据剥离环境 + 会话 shellCwd；管理器的 start 是唯一 spawn 入口。——
      // 客户升级授权说明同 run_shell 口径；v1 升级只允许 `run_shell` 入口（后台判拒不入可申请台账、
      // 不消费前台授权），此处只按类型契约如实附注 `review.grant`（正常不会出现）。
      const grantNote = shellGrantNote(review);
      const env = buildShellEnv(process.env, extraCredentialEnvVars);
      const started = await manager.start({ command, argv, cwd, env });
      if (!started.ok) {
        // 审核通过后才发现并发已满（并行竞态）：同样零 spawn，并如实记录 limit。
        if (started.reason === "limit") diagnostics?.record("background.limit", { reasonCode: "concurrency-limit", count: manager.runningCount });
        return { ok: false, message: `${name} 未启动：${started.message}` + grantNote };
      }
      const task = started.task;
      diagnostics?.record("background.start", { turnId, toolCallId, toolName: name, pid: task.pid, state: task.state });
      const stateText = task.state === "running"
        ? "运行中"
        : `已结束（${task.state}${task.exitCode !== undefined ? `，exitCode ${task.exitCode}` : ""}）`;
      return {
        ok: true,
        backgroundTask: backgroundTaskFactsOf(task),
        message:
          `${name}：已启动任务 ${task.taskId}（pid ${task.pid ?? "?"}，${stateText}）。` +
          `任务只属于当前会话、不跨重启，日志只在内存；可用 list_background_tasks / read_background_task / stop_background_task 管理。` +
          `轮次结束或停止本轮**不会**终止它；只有 stop_background_task 或关闭会话才会清理。` + grantNote,
      };
    },
  };
}

/** list_background_tasks：列出当前会话保留的任务摘要（不猜测已过期任务）。 */
function makeListBackgroundTasksTool(manager: BackgroundTaskCapability): ExecutableTool {
  const name = LIST_BACKGROUND_TASKS_TOOL_NAME;
  return {
    name,
    async handler(call) {
      if (call.signal?.aborted) return { ok: false, message: `${name}：本轮已中止，未读取` };
      const tasks = manager.list();
      if (tasks.length === 0) {
        return { ok: true, message: `${name}：当前会话没有后台任务。任务只属于当前会话、不跨重启，会话关闭后列表会清空。` };
      }
      return {
        ok: true,
        message:
          `${name}：当前会话共 ${tasks.length} 个后台任务（运行中 ${manager.runningCount} 个；最多保留 32 个，运行中不淘汰）：\n` +
          `${tasks.map(backgroundSnapshotLine).join("\n")}\n` +
          `任务只属于当前会话、不跨重启；轮次结束或停止本轮不会终止任务。`,
      };
    },
  };
}

/** read_background_task：读取任务状态与 stdout/stderr 尾部（默认 both / 40 行；上限 200 行）。 */
function makeReadBackgroundTaskTool(manager: BackgroundTaskCapability): ExecutableTool {
  const name = READ_BACKGROUND_TASK_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const taskId = readStringArg(call.args, ["taskId", "task_id"]);
      if (taskId === undefined || taskId.trim() === "") {
        return { ok: false, message: `${name}: 缺少 taskId 参数（任务号，如 bg-1），无法读取` };
      }
      const streamRaw = call.args["stream"];
      if (streamRaw !== undefined && streamRaw !== null && streamRaw !== "stdout" && streamRaw !== "stderr" && streamRaw !== "both") {
        return { ok: false, message: `${name}: stream 参数非法（应为 "stdout" / "stderr" / "both"；缺省 both）` };
      }
      const stream = streamRaw === "stdout" || streamRaw === "stderr" ? streamRaw : "both";
      const tailRaw = call.args["tailLines"];
      if (tailRaw !== undefined && tailRaw !== null && (typeof tailRaw !== "number" || !Number.isInteger(tailRaw) || tailRaw < 1)) {
        return { ok: false, message: `${name}: tailLines 参数非法（应为 ≥1 的整数；缺省 ${BACKGROUND_TASK_DEFAULT_TAIL_LINES}，上限 ${BACKGROUND_TASK_MAX_TAIL_LINES}）` };
      }
      const requested = typeof tailRaw === "number" ? tailRaw : BACKGROUND_TASK_DEFAULT_TAIL_LINES;
      const result = manager.read(taskId, { stream, tailLines: Math.min(requested, BACKGROUND_TASK_MAX_TAIL_LINES) });
      if (result === undefined) {
        return { ok: false, message: `${name}：未知任务「${taskId}」（可能来自其他会话或已过期）——不要假设它运行过。` };
      }
      const task = result.task;
      const status = [
        `${name}：任务 ${task.taskId} 当前状态 ${task.state}`,
        task.pid !== undefined ? `pid ${task.pid}` : "pid 未知",
        `启动于 ${task.startedAt}`,
        `已运行 ${task.durationMs} ms`,
        ...(task.exitCode !== undefined ? [`exitCode ${task.exitCode}`] : []),
        ...(task.signal !== undefined ? [`signal ${task.signal}`] : []),
        ...(requested > BACKGROUND_TASK_MAX_TAIL_LINES ? [`请求 ${requested} 行已按上限 ${BACKGROUND_TASK_MAX_TAIL_LINES} 行返回`] : []),
      ].join("，");
      const parts = [status];
      const sections: Array<[string, { text: string; truncated: boolean } | undefined]> = [
        ["stdout", result.stdout],
        ["stderr", result.stderr],
      ];
      for (const [label, value] of sections) {
        if (value === undefined) continue;
        const note = value.truncated ? `，truncated：输出超过 256 KiB 缓冲，仅保留尾部，更早内容已丢弃` : "";
        parts.push(`${label}（尾部 ${result.tailLines} 行${note}）：\n${value.text === "" ? "（无输出）" : value.text}`);
      }
      return { ok: true, backgroundTask: backgroundTaskFactsOf(task), message: parts.join("\n") };
    },
  };
}

/** stop_background_task：按终止预算停止任务；对已结束任务如实返回原状态（不谎报「刚刚停止」）。 */
function makeStopBackgroundTaskTool(manager: BackgroundTaskCapability): ExecutableTool {
  const name = STOP_BACKGROUND_TASK_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const taskId = readStringArg(call.args, ["taskId", "task_id"]);
      if (taskId === undefined || taskId.trim() === "") {
        return { ok: false, message: `${name}: 缺少 taskId 参数（任务号，如 bg-1），无法停止` };
      }
      const forceRaw = call.args["force"];
      if (forceRaw !== undefined && forceRaw !== null && typeof forceRaw !== "boolean") {
        return { ok: false, message: `${name}: force 参数非法（应为布尔值；缺省 false）` };
      }
      const result = await manager.stop(taskId, { force: forceRaw === true });
      if (!result.ok) {
        if (result.reason === "unknown-task") {
          return { ok: false, message: `${name}：未知任务「${taskId}」（可能来自其他会话或已过期）——不要假设它运行过。` };
        }
        if (result.reason === "closed") {
          return { ok: false, message: `${name}：会话已关闭，未执行停止（未知任务）——不要假设它运行过。` };
        }
        return {
          ok: false,
          ...(result.task !== undefined ? { backgroundTask: backgroundTaskFactsOf(result.task) } : {}),
          message:
            `${name}：停止任务 ${taskId} **未完成**——终止预算（SIGTERM→250ms→SIGKILL→1s）内未观察到进程退出，` +
            `状态 kill-timeout；**进程可能仍在运行，请如实告知客户**，不要声称已停止。`,
        };
      }
      const task = result.task;
      if (result.alreadyEnded) {
        return {
          ok: true,
          backgroundTask: backgroundTaskFactsOf(task),
          message:
            `${name}：任务 ${task.taskId} 早已结束（state: ${task.state}` +
            `${task.exitCode !== undefined ? `，exitCode ${task.exitCode}` : ""}` +
            `${task.signal !== undefined ? `，signal ${task.signal}` : ""}）——本次未发送终止信号，不声称刚刚停止。`,
        };
      }
      return {
        ok: true,
        backgroundTask: backgroundTaskFactsOf(task),
        message:
          `${name}：已停止任务 ${task.taskId}（state: ${task.state}` +
          `${task.pid !== undefined ? `，pid ${task.pid}` : ""}` +
          `${task.exitCode !== undefined ? `，exitCode ${task.exitCode}` : ""}` +
          `${task.signal !== undefined ? `，signal ${task.signal}` : ""}；已在终止预算内观察到进程退出）。`,
      };
    },
  };
}

// —————————————— 交互工具族（设计 A-1；请求确认 / 请求勾选） ——————————————

/** 失败文案（设计 A-1 **逐字**规定；核心纪律：**绝不说成已同意**）。 */
function notConsented(name: string, reason: string): ToolResult {
  return { ok: false, message: `${name}：未获客户同意（原因：${reason}）→ 不要写盘；如实告知客户，不得假设同意。` };
}

/**
 * 治理确认卡**未发出**回执（2026-10-22 无效治理卡守卫设计 §4.6）：`declined + notPresented:true`
 * 表示应用**在触达客户通道之前**拒绝了本次发卡——卡片从未呈现给客户。此时**不得**套用
 * `notConsented` 的「未获客户同意」，否则模型容易误报「客户拒绝/客户不同意」。
 * `reason` 为具体缺项（编排侧给出，可为空）；回执仍为 `ok:false`，并明确要求补齐后重新调用。
 */
function cardNotPresented(name: string, reason: string | undefined): ToolResult {
  const detail = reason !== undefined && reason.trim() !== "" ? reason : "未提供";
  return {
    ok: false,
    message:
      `${name}：治理确认卡未发出（未向客户呈现；原因：${detail}）→ 未获任何同意；` +
      `请补齐后重新调用。不要写盘，也不要向客户声称其拒绝或同意。`,
  };
}

/** `outcome.operatorId` 是否来自判断 agent（`judge:<engine>`；与桌面结算同源）。 */
function isJudgeOperator(operatorId: string | undefined): boolean {
  return operatorId !== undefined && operatorId.startsWith("judge:");
}

/**
 * `outcome.operatorId` 是否来自**系统裁决**（`system:<机制>`，如 `system:write-preauthorization`）。
 * 系统预授权不是客户手批、不是判断代批：回执必须按此前缀分流，不得套用客户确认/拒绝措辞。
 */
function isSystemOperator(operatorId: string | undefined): boolean {
  return operatorId !== undefined && operatorId.startsWith("system:");
}

/**
 * 判断 agent 自动退回回执（2026-10-23 验收返工路由方案 §5.3.3 / Q7 A）：judge 的 `declined`
 * **不是客户拒绝**，不得套用「客户拒绝」措辞。只有验收卡（`request_choice` +
 * `cardKind:"acceptance"`）走应用返工路由，才写 Convener/重新提交验收；其余 judge 退回
 * （写盘/任命/日程等）用通用文案，不承诺返工路由。客户/通道来源仍走 `notConsented` 既有语义。
 */
function judgeDeclined(name: string, reason: string | undefined, acceptanceRework: boolean): ToolResult {
  const detail = reason !== undefined && reason.trim() !== "" ? `（原因：${reason}）` : "";
  const handling = acceptanceRework
    ? `应用会把本次退回交 运营/Steward（Convener）组织返工；请等待返工后重新提交验收。`
    : `应用会按治理规则处理本次退回。`;
  return {
    ok: false,
    message: `${name}：自动决策未通过/未完成${detail}；这不是客户拒绝；${handling}`,
  };
}

/**
 * 系统预授权**放行**回执（2026-10-25 边界内写入预授权）：应用在触达客户通道之前直接放行
 * 边界内写盘——没有呈现确认卡，也没有判断 agent 参与。**不得**说成「客户已确认」；
 * `confirmed:true` 保留为技术凭据（唯一凭据契约不变），但来源必须如实标注为系统预授权。
 */
function systemPreauthorizationAccepted(name: string, title: string, operatorId: string | undefined): ToolResult {
  return {
    ok: true,
    message:
      `${name}：系统预授权已直接放行（边界内写入；confirmed:true；${operatorTag(operatorId)}；「${title}」）——` +
      `这是系统预授权，不是客户确认，也不是判断 agent 代批。` +
      `可按已放行的内容继续（如写盘，写入须与向客户预览的内容一致）；` +
      `向客户汇报时说明这是系统预授权放行，不要说成客户确认。`,
  };
}

/**
 * 系统预授权**拒绝**回执（边界外/不可写）：应用在未呈现确认卡、未调用判断 agent 的情况下直接
 * 拒绝。它不是客户拒绝、不是客户未同意；原因也不是「发卡缺项」——**不得**引导模型「补齐后重新
 * 调用」，边界外写入不会因重试而获准（2026-10-25 边界内写入预授权）。
 */
function systemPreauthorizationDeclined(name: string, reason: string | undefined): ToolResult {
  const detail = reason !== undefined && reason.trim() !== "" ? reason : "未提供";
  return {
    ok: false,
    message:
      `${name}：系统预授权拒绝（边界外或不可写；原因：${detail}）——` +
      `这是系统预授权判定，不是客户拒绝，也不是客户未同意。` +
      `不要改写参数或重复调用本工具重试：边界外写入不会因重试而获准。` +
      `请如实告知客户该写入被系统预授权拒绝（不要声称客户拒绝或同意）。`,
  };
}

function abortedToolResult(name: string, viewImageDelivery?: ViewImageDeliveryMode): ToolResult {
  if (name === REQUEST_CONFIRMATION_TOOL_NAME || name === REQUEST_CHOICE_TOOL_NAME) return notConsented(name, "会话已中止");
  if (name === SUBMIT_REPORT_TOOL_NAME) return { ok: false, message: `${name}：报告**未能交回**（原因：会话已中止）` };
  if (name === SHELL_VERDICT_TOOL_NAME) return { ok: false, message: `${name}：审读结论**未能交回**（原因：会话已中止）` };
  if (name === DISPATCH_TASK_TOOL_NAME) return { ok: false, message: `${name}：任务**未能派发**（原因：会话已中止）` };
  // G-2/R2：中止时**不假设已执行**——等待被中止的提议其结果以系统回执为准（确认卡可能仍被处理）。
  if (name === PROPOSE_RECOVERY_TOOL_NAME) return { ok: false, message: `${name}：本次提议**未获结果**（原因：会话已中止）——**不要假设已执行**；如实告知客户。` };
  // G-4/I2：中止时**不假设已安装/已卸载**（零副作用面如实）。
  if (name === INSTALL_SKILL_TOOL_NAME) return { ok: false, message: `${name}：技能**未能安装**（原因：会话已中止）——**不要当它已安装**；如实告知客户。` };
  if (name === UNINSTALL_SKILL_TOOL_NAME) return { ok: false, message: `${name}：技能**未能卸载**（原因：会话已中止）——**不要当它已卸载**；如实告知客户。` };
  // G-4 V2：中止时**不假设已安装/已卸载**（同技能版口径；零副作用面如实）。
  if (name === INSTALL_MCP_TOOL_NAME) return { ok: false, message: `${name}：MCP**未能安装**（原因：会话已中止）——**不要当它已安装**；如实告知客户。` };
  if (name === UNINSTALL_MCP_TOOL_NAME) return { ok: false, message: `${name}：MCP**未能卸载**（原因：会话已中止）——**不要当它已卸载**；如实告知客户。` };
  // 需求变更申请（2026-10-26）：中止时**不假设已提交/已获批准**（零副作用面如实）。
  if (name === REQUEST_REQUIREMENT_CHANGE_TOOL_NAME) {
    return { ok: false, message: `${name}：需求变更申请**未获结果**（原因：会话已中止）——**不要当已提交/已获批准**；如实告知客户。` };
  }
  // 下载申请（2026-11-04）：中止时**不假设已下载/未下载**（可能已落盘、可能已清理）。
  if (name === REQUEST_DOWNLOAD_TOOL_NAME) {
    return { ok: false, message: `${name}：本轮已中止，下载申请**未获最终结果**——不要假设已下载或未下载；以应用审计/系统行为为准。` };
  }
  // 图片查看（2026-10-26；2026-10-27 同轮设计）：中止时不谎称「已提供/未提供」。
  // 文案按当前交付方式分支：next-turn 保持「排队未获确认；下一轮以系统为准」原意；
  // tool-result 不得声称排队或下一轮附件，只如实说交付未获确认。
  if (name === VIEW_IMAGE_TOOL_NAME) {
    return viewImageDelivery === "tool-result"
      ? { ok: false, message: `${name}：本轮已中止，图片交付**未获确认**——**不要当它已提供**；本轮不要假装已看到。` }
      : { ok: false, message: `${name}：本轮已中止，图片附件排队**未获确认**——**不要当它已提供**；下一轮是否收到图片以系统为准，本轮不要假装已看到。` };
  }
  // 2026-10-22 后台任务（B1）：中止时**不假设已启动/已停止**（零副作用面如实）。
  if (name === START_BACKGROUND_TASK_TOOL_NAME) {
    return { ok: false, message: `${name}：任务**未能启动**（原因：本轮已中止）——**不要当它已启动**；如实告知客户。` };
  }
  if (name === LIST_BACKGROUND_TASKS_TOOL_NAME || name === READ_BACKGROUND_TASK_TOOL_NAME) {
    return { ok: false, message: `${name}：后台任务读取**未完成**（原因：本轮已中止）——不要据此推断任务状态或日志。` };
  }
  if (name === STOP_BACKGROUND_TASK_TOOL_NAME) {
    return { ok: false, message: `${name}：停止**未获明确结果**（原因：本轮已中止）——**不要当它已停止**；请重试或用 list_background_tasks 查看当前状态。` };
  }
  // 2026-11-02 全局任务状态/版本决策：中止时**不假设已读/已写/已提交**（零副作用面如实）。
  if (name === PROJECT_STATE_TOOL_NAME) {
    return { ok: false, message: `${name}：项目状态读取**未完成**（原因：会话已中止）——没有拿到快照就**不要推断项目状态**。` };
  }
  if (name === PROJECT_NOTE_TOOL_NAME) {
    return { ok: false, message: `${name}：备注**未写入**（原因：会话已中止）——不要假设已生效；如实告知客户。` };
  }
  if (name === REQUEST_VERSION_DECISION_TOOL_NAME) {
    return { ok: false, message: `${name}：发起轮次已中止——未发卡、未执行；不要假设已提交或已获批准。` };
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

/** Presentation only: consume the committed source, never today's delegation switch.
 * Preserve the complete typed outcome so the original author sees revision reasons and provenance.
 */
function chiefDelegatedInputReceipt(name: string, req: CustomerInputRequest, out: CustomerInputOutcome): ToolResult | undefined {
  if (out.outcome === "unavailable" || out.actionSource === undefined) return undefined;
  const source = out.actionSource;
  const raw = `\n原始回执：${JSON.stringify(out)}`;
  if (!isDirectActionSource(source) || source.kind === "role-direct") return {
    ok: false, message: `${name}：交互回执来源无效或不适用，不能视为批准；请核对原请求。${raw}`,
  };
  if (source.kind !== "chief-delegated") return undefined;
  const detail = out.outcome === "declined" && out.reason !== undefined ? out.reason : source.reason;
  if (out.outcome === "declined") {
    const action = source.disposition === "revise" ? "幕僚要求修订"
      : source.disposition === "reject" ? "幕僚拒绝" : "幕僚选择未同意";
    return { ok: false, message: `${name}：${action}（chief-delegated；原因：${detail}）。`
      + (source.disposition === "revise" ? "本次退修未获批准；原发起角色应按理由修订并重新提交。" : "本次未获批准；按原请求回报链处理。") + raw };
  }
  const malformed = (): ToolResult => ({ ok: false,
    message: `${name}：幕僚决定回执与选择结果不一致，不能视为批准；请核对原请求。${raw}` });
  if (source.disposition !== "select") return malformed();
  if (req.kind === "confirm") {
    const expected = out.value.confirmed === true ? "confirm" : "reject";
    if (source.selected?.length !== 1 || source.selected[0] !== expected) return malformed();
    return { ok: out.value.confirmed === true,
      message: `${name}：幕僚${out.value.confirmed === true ? "已确认" : "未同意"}「${req.title}」`
        + `（chief-delegated；confirmed:${out.value.confirmed === true}；理由：${source.reason}）。` + raw };
  }
  const selected = out.value.selected;
  if (!Array.isArray(selected) || selected.length === 0 || (req.multiple !== true && selected.length !== 1)
    || new Set(selected).size !== selected.length || selected.some(id => !req.options.some(option => option.id === id))
    || JSON.stringify(selected) !== JSON.stringify(source.selected)) return malformed();
  const selection = selected.map(id => { const option = req.options.find(option => option.id === id)!; return `${id}（${option.label}）`; }).join("、");
  return { ok: true, message: `${name}：幕僚已选择（chief-delegated）：${selection}。理由：${source.reason}。`
    + "请按该决定及原有执行权限继续；未选中的项不得擅自代选。" + raw };
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
 * - `ok:false` 且措辞「未获客户同意」＝ 拒绝 / 明确选「否」/ 超时 / 通道不可用 / 出错——**不要写盘**；
 * - `ok:false` 且措辞「治理确认卡未发出」＝ 应用在**呈现前**拒绝发卡（`declined + notPresented:true`，
 *   如治理角色缺归属键（flowId/intentId/taskId）或 `cardKind`）——客户**从未看到**卡片：不要写盘，也不要声称客户拒绝或同意；
 *   按回执补齐参数后重新调用（2026-10-22 无效治理卡守卫设计 §4.6）。
 * - `operatorId` 以 `system:` 开头（如 `system:write-preauthorization`，2026-10-25 边界内写入预授权）：
 *   `answered + confirmed:true` ＝ 系统预授权**直接放行**（边界内写入；**不是客户确认**）；
 *   `declined` ＝ 系统预授权**拒绝**（边界外/不可写；**不是客户拒绝、不是客户未同意**，边界外写入
 *   不会因重试而获准）。该分支按 `operatorId` 先于 `notPresented` 判定——系统拒绝也会置
 *   `notPresented:true`，但原因不是「发卡缺项」，不能套用「卡未发出/请补齐后重新调用」的文案。
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
      const baseMetadata = customerMetadata(call.signal, currentTurnId?.(), scope, call.toolCallId);
      const taskId = readStringArg(call.args, ["taskId", "task_id"]);
      const intentId = readStringArg(call.args, ["intentId", "intent_id"]);
      // C 批（方案 §6.4.1/R2）：appointment-write 的目标角色与 D3 决定 id——只透传给应用校验，
      // 字段本身不发行任何写权（应用按 D3 `request.resolved` 校验失败即不发卡）。
      const targetRoleId = readStringArg(call.args, ["targetRoleId", "target_role_id"]);
      const decisionId = readStringArg(call.args, ["decisionId", "decision_id"]);
      // 2026-10-29（v2.8/R8）：卡片引用的模块 id（验收/写卡）；文件夹地址由应用从名单派生，不接受自报。
      const moduleId = readStringArg(call.args, ["moduleId", "module_id"]);
      const rawModulePaths = call.args["modulePaths"] ?? call.args["module_paths"];
      const metadataModulePaths = Array.isArray(rawModulePaths)
        ? rawModulePaths.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 20)
        : undefined;
      const metadata: CustomerInputMetadata = {
        ...baseMetadata,
        ...(taskId !== undefined && taskId !== "" ? { taskId } : {}),
        ...(intentId !== undefined && intentId !== "" ? { intentId } : {}),
        ...(targetRoleId !== undefined && targetRoleId !== "" ? { targetRoleId } : {}),
        ...(decisionId !== undefined && decisionId !== "" ? { decisionId } : {}),
        ...(moduleId !== undefined && moduleId !== "" ? { moduleId } : {}),
        ...(metadataModulePaths !== undefined && metadataModulePaths.length > 0 ? { modulePaths: metadataModulePaths } : {}),
      };
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
      const delegated = chiefDelegatedInputReceipt(name, req, out);
      if (delegated !== undefined) return delegated;
      if (out.outcome === "declined") {
        // 系统预授权拒绝（2026-10-25 边界内写入预授权）：`system:` 前缀且同时带 `notPresented:true`；
        // 必须在 notPresented 分支之前识别——它是边界判定，不是「发卡缺项」，不得引导模型补齐重发。
        if (isSystemOperator(out.operatorId)) return systemPreauthorizationDeclined(name, out.reason);
        // 应用在触达客户通道之前拒绝发卡（治理字段不齐等）：卡片**未呈现**，不得说成客户拒绝。
        if (out.notPresented === true) return cardNotPresented(name, out.reason);
        // 判断 agent 自动退回：不是客户拒绝；确认卡不走验收返工路由，用通用文案。
        if (isJudgeOperator(out.operatorId)) return judgeDeclined(name, out.reason, false);
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
        // 系统预授权放行（2026-10-25）：不说成「客户已确认」；judge 路径已在上方逐字保留。
        if (isSystemOperator(out.operatorId)) {
          return systemPreauthorizationAccepted(name, title, out.operatorId);
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

// —————————————— 下载申请（2026-11-04 download-requests；request_download） ——————————————
//
// 角色提交结构化下载申请；应用先做确定性安全检查与 `@审批` 预授权匹配，未命中才进入
// 判断器/客户确认卡；批准后由应用下载到项目 `download/`。本层只做**参数形状校验**
// （非法 ⇒ 未发卡、未联网、不落盘）并**如实转达**注入能力的回执；安全检查/审批/执行/
// 审计全部在能力与下层——本工具不联网、不写盘、不做治理判定、不改变任何写权。
// 未注入能力 ⇒ 工具不注册（能力缺席 = 最强 fail-closed）；判断会话/CLI 结构性不可见。
// `projectRoot` 不经工具参数：下载根由注入能力的闭包绑定，模型不能指定根/子目录。

const REQUEST_DOWNLOAD_ARG_KEYS: ReadonlySet<string> = new Set(["url", "filename", "purpose"]);
const DOWNLOAD_ERROR_CODE_SET: ReadonlySet<string> = new Set(DOWNLOAD_ERROR_CODES);
const DOWNLOAD_SHA256_HEX = /^[0-9a-f]{64}$/;

/** 下载参数形状错误：在触达能力前拒绝；明确「未发卡、未联网」。 */
function downloadArgumentError(name: string, detail: string): ToolResult {
  return {
    ok: false,
    message: `${name}: ${detail}——未发卡、未联网，请更正后重试（不要猜测参数） [技术 code：download-invalid-arguments]`,
  };
}

type DownloadInputResult = { ok: true; value: DownloadRequestInput } | { ok: false; result: ToolResult };

/**
 * 读取并校验 `request_download` 的三参数（只做形状）：
 * - `url`：非空、UTF-8 ≤2048 字节、可被 `new URL` 解析、仅 http/https、host 非空、无 userinfo；
 * - `purpose`：非空、UTF-8 ≤1024 字节；
 * - `filename`（可选）：字符串、Unicode 码点 ≤128、不含 NUL/控制字符/路径分隔符；纯空白视作未提供。
 * 更深 URL/IP/文件名净化在能力与下层（B1）；未知参数一律拒绝。
 */
function readDownloadInput(args: Record<string, unknown>, name: string): DownloadInputResult {
  for (const key of Object.keys(args)) {
    if (!REQUEST_DOWNLOAD_ARG_KEYS.has(key)) {
      return { ok: false, result: downloadArgumentError(name, `未知参数 ${key}`) };
    }
  }
  const urlRaw = args["url"];
  if (typeof urlRaw !== "string" || urlRaw.trim() === "") {
    return { ok: false, result: downloadArgumentError(name, "缺少或非法的 url 参数（须为非空字符串）") };
  }
  const url = urlRaw.trim();
  if (Buffer.byteLength(url, "utf8") > DOWNLOAD_URL_MAX_BYTES) {
    return { ok: false, result: downloadArgumentError(name, `url 超过 ${DOWNLOAD_URL_MAX_BYTES} 字节（有界文本）`) };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, result: downloadArgumentError(name, "url 不能被解析为合法 URL") };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, result: downloadArgumentError(name, "url 协议只允许 http/https") };
  }
  if (parsed.hostname === "") {
    return { ok: false, result: downloadArgumentError(name, "url 主机不能为空") };
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, result: downloadArgumentError(name, "url 不得包含 userinfo（user:pass@）") };
  }
  const purposeRaw = args["purpose"];
  if (typeof purposeRaw !== "string" || purposeRaw.trim() === "") {
    return { ok: false, result: downloadArgumentError(name, "缺少或非法的 purpose 参数（须为非空字符串）") };
  }
  const purpose = purposeRaw.trim();
  if (Buffer.byteLength(purpose, "utf8") > DOWNLOAD_PURPOSE_MAX_BYTES) {
    return { ok: false, result: downloadArgumentError(name, `purpose 超过 ${DOWNLOAD_PURPOSE_MAX_BYTES} 字节（有界文本）`) };
  }
  const filenameRaw = args["filename"];
  let filename: string | undefined;
  if (filenameRaw !== undefined && filenameRaw !== null) {
    if (typeof filenameRaw !== "string") {
      return { ok: false, result: downloadArgumentError(name, "filename 参数非法（须为字符串；可省略）") };
    }
    if (filenameRaw.trim() !== "") {
      if (Array.from(filenameRaw).length > DOWNLOAD_FILENAME_MAX_CHARS) {
        return { ok: false, result: downloadArgumentError(name, `filename 超过 ${DOWNLOAD_FILENAME_MAX_CHARS} 字符（有界文本）`) };
      }
      if (/[\u0000-\u001F\u007F]/.test(filenameRaw)) {
        return { ok: false, result: downloadArgumentError(name, "filename 不得包含 NUL/控制字符") };
      }
      if (filenameRaw.includes("/") || filenameRaw.includes("\\")) {
        return { ok: false, result: downloadArgumentError(name, "filename 不得包含路径分隔符（/ 或 \\）") };
      }
      filename = filenameRaw;
    }
  }
  return {
    ok: true,
    value: { url, purpose, ...(filename !== undefined ? { filename } : {}) },
  };
}

/** 成功回执的 `path` 必须是项目相对的单个文件名：`download/<name>`（无目录段/穿越/绝对路径）。 */
function isProjectDownloadPath(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("download/")) return false;
  const name = value.slice("download/".length);
  return (
    name !== "" &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("\u0000")
  );
}

/** 审批来源三形状（归属如实；未知形状按契约外 fail-closed）。 */
function isDownloadApprovalSource(value: unknown): value is DownloadApprovalSource {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record["by"] === "customer") return true;
  if (record["by"] === "judge") {
    return typeof record["engine"] === "string" && (record["model"] === undefined || typeof record["model"] === "string");
  }
  if (record["by"] === "directive") {
    return typeof record["directiveId"] === "string" && record["directiveId"].trim() !== "";
  }
  return false;
}

/**
 * 回执 → 工具结果：**按判别联合做运行时复核**并如实转达。
 * 成功只在 `ok:true` 且路径/字节/sha256/最终 URL/审批来源齐全时返回 `{ok:true,message}`；
 * 失败必须带属于 `DOWNLOAD_ERROR_CODES` 的 code（消息缺 code 时追加）；
 * 契约外回执（缺字段/坏形状/未知 code）一律 fail-closed——**绝不伪装成功**。
 */
function downloadReceiptMessage(name: string, value: unknown): ToolResult {
  const contractExternal = (): ToolResult => ({
    ok: false,
    message: `${name}：应用未返回明确结果（回执缺失或非法）——**不要当已下载**；以应用审计/系统行为为准，如实告知客户。`,
  });
  if (value === null || typeof value !== "object" || Array.isArray(value)) return contractExternal();
  const receipt = value as Partial<DownloadRequestResult> & Record<string, unknown>;
  if (typeof receipt.message !== "string" || receipt.message.trim() === "") return contractExternal();
  if (receipt.ok === true) {
    const path = receipt.path;
    const bytes = receipt.bytes;
    const sha256 = receipt.sha256;
    const finalUrl = receipt.finalUrl;
    if (
      !isProjectDownloadPath(path) ||
      typeof bytes !== "number" ||
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      typeof sha256 !== "string" ||
      !DOWNLOAD_SHA256_HEX.test(sha256) ||
      typeof finalUrl !== "string" ||
      finalUrl.trim() === "" ||
      !isDownloadApprovalSource(receipt.approval)
    ) {
      return contractExternal();
    }
    return { ok: true, message: receipt.message };
  }
  if (receipt.ok === false) {
    const code = receipt.code;
    if (typeof code !== "string" || !DOWNLOAD_ERROR_CODE_SET.has(code)) return contractExternal();
    const message = receipt.message.includes(code) ? receipt.message : `${receipt.message} [技术 code：${code}]`;
    return { ok: false, message };
  }
  return contractExternal();
}

/** `request_download` 工具：形状校验 → 调注入能力一次 → 如实转达（不重试、不伪造成功）。 */
function makeRequestDownloadTool(
  fn: RequestDownloadFn,
  scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">,
  currentTurnId?: () => string | undefined,
): ExecutableTool {
  const name = REQUEST_DOWNLOAD_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const parsed = readDownloadInput(call.args, name);
      if (!parsed.ok) return parsed.result;
      const turnId = currentTurnId?.();
      const metadata: DownloadRequestMetadata = {
        ...(call.signal ? { signal: call.signal } : {}),
        ...(scope?.roleId !== undefined ? { roleId: scope.roleId } : {}),
        ...(scope?.runtime !== undefined ? { runtime: scope.runtime } : {}),
        ...(turnId !== undefined ? { turnId } : {}),
        ...(call.toolCallId !== undefined ? { toolCallId: call.toolCallId } : {}),
      };
      let result: unknown;
      try {
        result = await fn(parsed.value, metadata);
      } catch {
        // 不携带原始异常文本（避免 URL/路径/凭据进入模型消息）；语义固定为「未下载、未产生文件」。
        return {
          ok: false,
          message: `${name}：未下载（下载能力异常，未产生文件）。下一步：稍后重试或反馈。谁来做：应用（app）。[技术 code：download-unavailable]`,
        };
      }
      return downloadReceiptMessage(name, result);
    },
  };
}

/**
 * 校验并读出 options：非空数组、每项含**非空且唯一**的 id 与非空 label、可选字符串 description、
 * 可选布尔 recommended（decision 卡推荐项；**只透传**——不代选、不补默认值、不校验推荐项个数，
 * 卡种语义在应用/角色侧）。非法 → undefined。
 */
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
    const recommendedRaw = rec["recommended"];
    if (recommendedRaw !== undefined && typeof recommendedRaw !== "boolean") return undefined;
    const recommended = typeof recommendedRaw === "boolean" ? recommendedRaw : undefined;
    seen.add(id);
    options.push({
      id,
      label,
      ...(description !== undefined ? { description } : {}),
      ...(recommended !== undefined ? { recommended } : {}),
    });
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
/** Choice remains a fact even if the separate domain apply has not completed. Never infer apply from answered. */
function intentConfirmationReceipt(result: ToolResult, out: CustomerInputOutcome): ToolResult {
  if (out.outcome !== "answered" || out.intentConfirmation === undefined) return result;
  const apply = out.intentConfirmation;
  if (!apply || typeof apply !== "object" || Array.isArray(apply) || !Object.hasOwn(apply, "status")
    || !["committed", "pending-recovery"].includes(apply.status)
    || Object.keys(apply).some(key => !["status", "code", "message"].includes(key))
    || (apply.code !== undefined && typeof apply.code !== "string") || (apply.message !== undefined && typeof apply.message !== "string")) {
    return { ...result, ok: false, message: `${result.message}\n意图确认应用结果未知（host intentConfirmation 回执无效）；不能视为已完成或生效，须核对原操作。` };
  }
  const detail = `${apply.code !== undefined ? ` [${apply.code}]` : ""}${apply.message !== undefined ? `：${apply.message}` : ""}`;
  return { ...result, ok: result.ok && apply.status === "committed", message: result.message
    + (apply.status === "pending-recovery"
      ? `\n意图确认应用状态：pending-recovery${detail}。真实选择已保留，应用尚未完成；不能视为意图确认已完成或生效。请核对/恢复原操作；本回执不产生后续授权。`
      : `\n意图确认应用状态：committed${detail}。原Service已完成本次应用；后续操作仍须通过原有授权校验。`) };
}

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
      const hostResult = ["intentConfirmation", "domainApply"].find(key => Object.hasOwn(call.args, key));
      if (hostResult !== undefined) return { ok: false, message: `${name}: ${hostResult} is host-only；未发起选择请求` };
      const baseMetadata = customerMetadata(call.signal, currentTurnId?.(), scope, call.toolCallId);
      const taskId = readStringArg(call.args, ["taskId", "task_id"]);
      const intentId = readStringArg(call.args, ["intentId", "intent_id"]);
      const moduleId = readStringArg(call.args, ["moduleId", "module_id"]);
      const rawModulePaths = call.args["modulePaths"] ?? call.args["module_paths"];
      const metadataModulePaths = Array.isArray(rawModulePaths)
        ? rawModulePaths.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 20)
        : undefined;
      const metadata: CustomerInputMetadata = {
        ...baseMetadata,
        ...(taskId !== undefined && taskId !== "" ? { taskId } : {}),
        ...(intentId !== undefined && intentId !== "" ? { intentId } : {}),
        ...(moduleId !== undefined && moduleId !== "" ? { moduleId } : {}),
        ...(metadataModulePaths !== undefined && metadataModulePaths.length > 0 ? { modulePaths: metadataModulePaths } : {}),
      };
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
      const delegated = chiefDelegatedInputReceipt(name, req, out);
      if (delegated !== undefined) return intentConfirmationReceipt(delegated, out);
      if (out.outcome === "declined") {
        // 应用在触达客户通道之前结算：卡片未呈现，不得说成客户拒绝。
        if (out.notPresented === true) return cardNotPresented(name, out.reason);
        // 判断 agent 自动退回：不是客户拒绝。仅验收卡（cardKind:"acceptance"）走应用返工路由
        // （2026-10-23 验收返工路由 §5.3.3）；其他卡种/未给 cardKind 用通用文案。
        if (isJudgeOperator(out.operatorId)) {
          return judgeDeclined(name, out.reason, governance.value.cardKind === "acceptance");
        }
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
      // 2026-10-29（方案 v2.1 §5.4/M4）：D3 裁决 id 随回执交给模型（appointment-write 的必要凭据；
      // 只由应用写入 `out.decisionId`，模型不可自报）。非 D3 卡也如实透传，行为无害。
      const decisionNote = out.decisionId !== undefined && out.decisionId !== ""
        ? `\nD3 裁决 id（decisionId）：${out.decisionId}——appointment-write 必须原样携带。`
        : "";
      if (out.judge !== undefined) {
        // 判断 agent 代批：不得说成客户本人选择（评审 §7.5）。
        return intentConfirmationReceipt({
          ok: true,
          message: judgeReceipt(name, out.judge, `已选择：${selection}`) + decisionNote,
        }, out);
      }
      return intentConfirmationReceipt({
        ok: true,
        message:
          `${name}：客户已选择（${operatorTag(out.operatorId)}）：` +
          `${selection}。` +
          `请按客户的选择继续；**未选中的项不得擅自代选**。` + decisionNote,
      }, out);
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
      const hostRef = ["workSourceRef", "parentTaskRef", "reviewBasisRef", "reviewControllerRef", "hubRouting", "criteria", "ref", "approved", "approval", "passed"].find(key => Object.hasOwn(call.args, key));
      if (hostRef !== undefined) {
        return { ok: false, message: `${name}: ${hostRef} is host-only（仅应用可生成真实工作来源引用）；未派发任务` };
      }
      const reviewTarget = call.args.reviewTarget;
      if (Object.hasOwn(call.args, "reviewTarget") && !isDispatchTaskReviewTarget(reviewTarget)) {
        return { ok: false, message: `${name}: reviewTarget 非法（仅 operationId 与完整 candidate OID）；未派发任务` };
      }
      const expectedReview = isDispatchTaskReviewTarget(reviewTarget)
        ? { operationId: reviewTarget.operationId, candidate: { ...reviewTarget.candidate } } : undefined;
      const resume = call.args.resumeController;
      if (Object.hasOwn(call.args, "resumeController") && !isDispatchTaskResumeController(resume)) {
        return { ok: false, message: `${name}: resumeController 非法（须完整指定原controller/flow/run/reviewTask/close operation）；未续接任务` };
      }
      const expectedResume = isDispatchTaskResumeController(resume) ? { ...resume } : undefined;
      if (expectedResume && (scope?.roleId !== "chief" || Object.hasOwn(call.args, "reviewTarget") || Object.hasOwn(call.args, "sourceTaskId"))) {
        return { ok: false, message: `${name}: resumeController 仅由真实Chief明确续接，不与reviewTarget/sourceTaskId混用；未续接任务` };
      }
      const turnId = currentTurnId?.();
      const roleId = readStringArg(call.args, ["roleId", "role_id", "role"]);
      if (roleId === undefined || roleId.trim() === "") {
        return { ok: false, message: `${name}: 缺少 roleId 参数（目标角色 id），无法派发` };
      }
      if (expectedResume && roleId !== "convener") return { ok: false, message: `${name}: resumeController 接收者必须为原Convener；未续接任务` };
      const task = readStringArg(call.args, ["task"]);
      if (task === undefined || task.trim() === "") {
        return { ok: false, message: `${name}: 缺少 task 参数（自足的任务文本），无法派发` };
      }
      const governance = readGovernanceFlowArgs(call.args, name);
      if (!governance.ok) return governance.result;
      if (expectedResume && governance.value.flowId !== undefined && governance.value.flowId !== expectedResume.flowId)
        return { ok: false, message: `${name}: resumeController flowId不一致；未续接任务` };
      const reason = readStringArg(call.args, ["reason"]);
      // B 批（2026-10-28）：任务卡字段。缺填/非法副作用**不拒绝**——按契约交给应用归一为 unknown
      // （B-08：幕僚声明但应用强制校验；工具层只做形状校验，不做安全分类）。
      const sideEffectRaw = call.args["sideEffect"] ?? call.args["side_effect"];
      if (sideEffectRaw !== undefined && sideEffectRaw !== null && typeof sideEffectRaw !== "string") {
        return { ok: false, message: `${name}: sideEffect 参数非法（应为 read-only/docs/code/external/destructive/unknown）` };
      }
      const SIDE_EFFECTS = ["read-only", "docs", "code", "external", "destructive", "unknown"] as const;
      const sideEffect: TaskSideEffect | undefined = typeof sideEffectRaw === "string"
        ? (SIDE_EFFECTS as readonly string[]).includes(sideEffectRaw) ? sideEffectRaw as TaskSideEffect : "unknown"
        : undefined;
      const expectedOutput = readStringArg(call.args, ["expectedOutput", "expected_output"]);
      const requestedEvidenceRaw = call.args["requestedEvidence"] ?? call.args["requested_evidence"];
      let requestedEvidence: string[] | undefined;
      if (requestedEvidenceRaw !== undefined && requestedEvidenceRaw !== null) {
        if (!Array.isArray(requestedEvidenceRaw) || !requestedEvidenceRaw.every((item) => typeof item === "string" && item.trim() !== "")) {
          return { ok: false, message: `${name}: requestedEvidence 参数非法（应为非空字符串数组，≤5 条）` };
        }
        requestedEvidence = (requestedEvidenceRaw as string[]).slice(0, 5);
      }
      const idempotencyKey = readStringArg(call.args, ["idempotencyKey", "idempotency_key"]);
      if (idempotencyKey !== undefined && idempotencyKey.trim() === "") {
        return { ok: false, message: `${name}: idempotencyKey 不能为空字符串` };
      }
      // 2026-10-29（v2.8 R8）：模块 id（实现/验收任务）；文件夹地址由应用从名单派生，工具不接受自报目录。
      const moduleId = readStringArg(call.args, ["moduleId", "module_id"]);
      if (moduleId !== undefined && moduleId.trim() === "") {
        return { ok: false, message: `${name}: moduleId 不能为空字符串` };
      }
      const modulePathsRaw = call.args["modulePaths"] ?? call.args["module_paths"];
      let modulePaths: string[] | undefined;
      if (modulePathsRaw !== undefined && modulePathsRaw !== null) {
        if (!Array.isArray(modulePathsRaw) || modulePathsRaw.length < 1 || modulePathsRaw.length > 20 || !modulePathsRaw.every((item) => typeof item === "string" && item.trim() !== "")) {
          return { ok: false, message: `${name}: modulePaths 参数非法（应为 1–20 个非空字符串）` };
        }
        modulePaths = modulePathsRaw.map((item) => item.trim());
      }
      // T3（2026-11-10，v1.3 §3.3）：stage-request 载荷骨架——本层只做形状校验与透传，
      // **不做**来源/目标/阶段转移/副作用等业务校验（由应用 handler/编排按实际工作流模式执行）。
      // 缺省 = 旧行为；未知/非法值 fail-closed（不猜、不放宽）。
      const taskKind = readStringArg(call.args, ["taskKind", "task_kind"]);
      if (taskKind !== undefined && taskKind.trim() === "") {
        return { ok: false, message: `${name}: taskKind 不能为空字符串` };
      }
      const workflowActionRaw = call.args["workflowAction"] ?? call.args["workflow_action"];
      if (workflowActionRaw !== undefined && workflowActionRaw !== null && workflowActionRaw !== "advance" && workflowActionRaw !== "stop") {
        return { ok: false, message: `${name}: workflowAction 参数非法（应为 advance/stop）` };
      }
      const workflowAction: WorkflowAction | undefined = workflowActionRaw === "advance" || workflowActionRaw === "stop" ? workflowActionRaw : undefined;
      const workflowPathRaw = call.args["workflowPath"] ?? call.args["workflow_path"];
      if (workflowPathRaw !== undefined && workflowPathRaw !== null && !isWorkflowPath(workflowPathRaw)) {
        return { ok: false, message: `${name}: workflowPath 参数非法（应为 A/B）` };
      }
      const workflowPath: WorkflowPath | undefined = isWorkflowPath(workflowPathRaw) ? workflowPathRaw : undefined;
      const workflowId = readStringArg(call.args, ["workflowId", "workflow_id"]);
      if (workflowId !== undefined && (workflowId.trim() === "" || workflowId.length > 200)) {
        return { ok: false, message: `${name}: workflowId 参数非法（应为 1–200 字符的非空字符串）` };
      }
      const stageRaw = call.args["stage"];
      if (stageRaw !== undefined && stageRaw !== null && !isWorkflowStage(stageRaw)) {
        return { ok: false, message: `${name}: stage 参数非法（应为 A1–A13（含 A12a/A12b）或 B1–B4）` };
      }
      const stage: WorkflowStage | undefined = isWorkflowStage(stageRaw) ? stageRaw : undefined;
      const reworkOfRaw = call.args["reworkOf"] ?? call.args["rework_of"];
      if (reworkOfRaw !== undefined && reworkOfRaw !== null && !isWorkflowStage(reworkOfRaw)) {
        return { ok: false, message: `${name}: reworkOf 参数非法（应为被打回的具体阶段 A1–A13（含 A12a/A12b）或 B1–B4）` };
      }
      const reworkOf: WorkflowStage | undefined = isWorkflowStage(reworkOfRaw) ? reworkOfRaw : undefined;
      const payload: DispatchTaskPayload = {
        ...(expectedResume ? { resumeController: expectedResume } : {}),
        ...(expectedReview !== undefined ? { reviewTarget: expectedReview } : {}),
        roleId,
        task,
        ...(reason !== undefined ? { reason } : {}),
        ...(sideEffect !== undefined ? { sideEffect } : {}),
        ...(expectedOutput !== undefined ? { expectedOutput } : {}),
        ...(requestedEvidence !== undefined ? { requestedEvidence } : {}),
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
        ...(moduleId !== undefined ? { moduleId } : {}),
        ...(modulePaths !== undefined ? { modulePaths } : {}),
        ...(taskKind !== undefined ? { taskKind } : {}),
        ...(workflowAction !== undefined ? { workflowAction } : {}),
        ...(workflowPath !== undefined ? { workflowPath } : {}),
        ...(workflowId !== undefined ? { workflowId } : {}),
        ...(stage !== undefined ? { stage } : {}),
        ...(reworkOf !== undefined ? { reworkOf } : {}),
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
        if (expectedResume) {
          if (receipt?.ok !== true) return { ok: false, message: `${name}：续接请求未取得明确回执；不能视为已投递原任务，须核对原controller。` };
          return { ok: true, message: `${name}：既有运营任务「${expectedResume.taskId}」的续接请求已接收。${receipt.message ?? ""}`
            + "请按实际队列/turn回执跟进；本次目标请求不改变任务身份、创建关系或执行授权。" };
        }
        const detail = receipt !== undefined && receipt !== null && receipt.message !== undefined ? ` ${receipt.message}` : "";
        return {
          ok: true,
          message:
            `${name}：任务已派发给「${roleId}」（status 由对方经回交报告回报）。${detail}` +
            `注意：**派发 ≠ 授权**——对方只在自己已接受边界内执行已授权任务，普通操作无需逐次确认；新建或扩张边界、治理写集仍由内置治理角色请求客户确认；` +
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

// —————————————— 需求变更申请等治理工具的严格参数面 ——————————————

/** 严格参数面：不接受未声明参数（schema `additionalProperties:false` 的 handler 同款守卫）。 */
function unknownGovernanceArg(args: Record<string, unknown>, allowed: ReadonlySet<string>, toolName: string): ToolResult | undefined {
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) {
      return { ok: false, message: `${toolName}: 未知参数 ${key}（本工具不接受该参数）——未执行；请更正后重试` };
    }
  }
  return undefined;
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
function criteriaRefOf(args: Record<string, unknown>): CriteriaRef | undefined {
  const raw = args["criteriaRef"] ?? args["criteria_ref"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  if (typeof record["path"] !== "string" || typeof record["sha256"] !== "string" || typeof record["version"] !== "number") return undefined;
  return { path: record["path"], sha256: record["sha256"], version: record["version"] };
}

/**
 * evidence_check：只读证据自洽检查（3.4/P4.4；rework F2/F3）。本层只做参数归一（artifact/metaPath/acId/criteriaRef）
 * → 项目内路径与调用角色裁剪（伪数据源也不放行越界/越权查询）→ 调注入数据源（`raceAbort`）→ 如实转达（≤4 KiB）。
 * **绝无副作用**：不执行项目脚本、不写盘、不改 artifact/sidecar、不授予写权；数据源缺席/失败如实回报，
 * 不得据此宣称证据通过。
 */
function makeEvidenceCheckTool(fn: EvidenceCheckFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = EVIDENCE_CHECK_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const artifactRaw = readStringArg(call.args, ["artifact", "path", "artifactPath"]);
      if (artifactRaw === undefined || artifactRaw.trim() === "") return { ok: false, message: `${name}: artifact 参数必填（项目相对路径）。` };
      const artifact = validateEvidencePath(artifactRaw);
      if (!artifact.ok) {
        return { ok: false, message: `${name}: ${formatMechanicalRejection(makeMechanicalRejection("evidence-path-invalid", [artifact.reason]))}` };
      }
      const metaRaw = readStringArg(call.args, ["metaPath", "meta_path"]);
      const metaPath = metaRaw !== undefined && metaRaw.trim() !== "" ? validateEvidencePath(metaRaw) : undefined;
      if (metaPath !== undefined && !metaPath.ok) {
        return { ok: false, message: `${name}: ${formatMechanicalRejection(makeMechanicalRejection("evidence-path-invalid", [metaPath.reason]))}` };
      }
      const requestedRole = readStringArg(call.args, ["roleId", "role_id"]);
      if (requestedRole !== undefined && requestedRole.trim() !== "" && scope?.roleId !== undefined && requestedRole.trim() !== scope.roleId) {
        return {
          ok: false,
          message: `${name}: ${formatMechanicalRejection(makeMechanicalRejection("evidence-scope-denied", [`只允许查询本角色（${scope.roleId}）的证据；请求角色=${requestedRole.trim()}`]))}`,
        };
      }
      const acId = readStringArg(call.args, ["acId", "ac_id"]);
      const criteriaRef = criteriaRefOf(call.args);
      if (criteriaRef === undefined) return { ok: false, message: `${name}: criteriaRef 必填（{path,sha256,version}；不取 latest）。` };
      const input: EvidenceCheckInput = {
        artifact: artifact.path,
        ...(metaPath !== undefined ? { metaPath: metaPath.path } : {}),
        ...(acId !== undefined && acId.trim() !== "" ? { acId: acId.trim() } : {}),
        criteriaRef,
      };
      let text: string | null | undefined | void;
      try {
        const turnId = currentTurnId?.();
        text = await raceAbort(Promise.resolve().then(() => fn(input, {
          ...(scope?.roleId !== undefined ? { roleId: scope.roleId } : {}),
          ...(turnId !== undefined ? { turnId } : {}),
          ...(scope?.runtime !== undefined ? { runtime: scope.runtime } : {}),
        })), call.signal, `${name} 证据检查`);
      } catch (err) {
        return { ok: false, message: `${name}: 证据检查未完成（${reasonOf(err)}）；不要据此判断证据通过。` };
      }
      if (typeof text !== "string" || text.trim() === "") return { ok: false, message: `${name}: 数据源未返回检查结果（结果不明）。` };
      const marker = "\n…（已截断）";
      return { ok: true, message: Buffer.byteLength(text, "utf8") <= EVIDENCE_CHECK_MAX_BYTES ? text : `${truncateUtf8(text, EVIDENCE_CHECK_MAX_BYTES - Buffer.byteLength(marker, "utf8")).text}${marker}` };
    },
  };
}

function makeContractCheckTool(fn: ContractCheckFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = CONTRACT_CHECK_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const flowId = readStringArg(call.args, ["flowId", "flow_id"]);
      const requestedRole = readStringArg(call.args, ["roleId", "role_id", "role"]);
      if (requestedRole !== undefined && requestedRole !== "" && scope?.roleId !== undefined && requestedRole !== scope.roleId) {
        return { ok: false, message: `${name}：只允许查询本角色（${scope.roleId}）的契约；未返回任何其他角色信息。` };
      }
      // topic 模式：读原始参数值（readStringArg 会吞掉非字符串，导致 topic:123 静默走 legacy，违反 AC-6）。
      // null/undefined/空串/仅空白串视为缺省（legacy）；非字符串与未知值拒绝且不调用数据源（AC-5/AC-6/AC-16）。
      const topicRaw = call.args["topic"];
      let topic: ContractCheckInput["topic"];
      if (topicRaw !== undefined && topicRaw !== null) {
        if (typeof topicRaw !== "string") {
          return { ok: false, message: `${name}：topic 参数非法（应为字符串：${CONTRACT_SCHEMA_TOPICS.join("|")}）。` };
        }
        const trimmed = topicRaw.trim();
        if (trimmed !== "") {
          if (!(CONTRACT_SCHEMA_TOPICS as readonly string[]).includes(trimmed)) {
            return { ok: false, message: `${name}：未知 topic=${JSON.stringify(trimmed.slice(0, 40))}；可用 topic：${CONTRACT_SCHEMA_TOPICS.join("|")}（只读 schema 查询）。` };
          }
          topic = trimmed as ContractCheckInput["topic"];
        }
      }
      const taskKindRaw = readStringArg(call.args, ["taskKind", "task_kind"]);
      const taskKind = taskKindRaw === "dispatch" || taskKindRaw === "appointment" || taskKindRaw === "write" || taskKindRaw === "acceptance" || taskKindRaw === "shell" || taskKindRaw === "stage-request"
        ? taskKindRaw
        : undefined;
      const moduleId = readStringArg(call.args, ["moduleId", "module_id"]);
      const input: ContractCheckInput = {
        ...(flowId !== undefined && flowId.trim() !== "" ? { flowId: flowId.trim() } : {}),
        ...(scope?.roleId !== undefined && scope.roleId !== "" ? { roleId: scope.roleId } : requestedRole !== undefined && requestedRole !== "" ? { roleId: requestedRole } : {}),
        ...(taskKind !== undefined ? { taskKind } : {}),
        ...(moduleId !== undefined && moduleId.trim() !== "" ? { moduleId: moduleId.trim() } : {}),
        ...(topic !== undefined ? { topic } : {}),
      };
      let text: string | null | undefined | void;
      try {
        const turnId = currentTurnId?.();
        text = await raceAbort(
          Promise.resolve().then(() => fn(input, {
            ...(scope?.roleId !== undefined ? { roleId: scope.roleId } : {}),
            ...(turnId !== undefined ? { turnId } : {}),
            ...(scope?.runtime !== undefined ? { runtime: scope.runtime } : {}),
          })),
          call.signal,
          `${name} 读取契约`,
        );
      } catch (err) {
        return { ok: false, message: `${name}：契约读取未完成（原因：${reasonOf(err)}）——不要据此猜测 pin/写区；可稍后重试。` };
      }
      if (typeof text !== "string" || text.trim() === "") {
        return { ok: false, message: `${name}：数据源未返回契约摘要（结果不明）——不要据此猜测。` };
      }
      const marker = input.topic !== undefined
        ? "\n…（已截断）"
        : "\n…（已截断，完整规则见 run manifest）";
      return {
        ok: true,
        message: Buffer.byteLength(text, "utf8") <= CONTRACT_CHECK_MAX_BYTES
          ? text
          : `${truncateUtf8(text, CONTRACT_CHECK_MAX_BYTES - Buffer.byteLength(marker, "utf8")).text}${marker}`,
      };
    },
  };
}

/**
 * `doc_format` 只读格式说明（2026-11-09 文档格式权威说明，方案 P1.2 §4.1；B1 TM-11 / AC-8）。
 * 模式对齐 `makeContractCheckTool`：参数形状/未知 id/非字符串在**本层**拒绝（不猜、不读盘）；
 * 数据源只提供纯文本，本层统一 `{ok:true,message}`/`{ok:false,message}` 信封并按 8 KiB 防御性截断。
 * 数据源契约（`DocFormatFn`）：纯读、静态公开文本、零磁盘 I/O；缺省 `format` ⇒ 索引。
 */
function makeDocFormatTool(fn: DocFormatFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = DOC_FORMAT_TOOL_NAME;
  return {
    name,
    async handler(call) {
      // format：null/undefined/空串/仅空白串视为缺省（索引模式）；非字符串拒绝且不调用数据源
      // （readStringArg 会吞掉非字符串，导致 format:123 静默走索引，故直接读原始值）。
      const formatRaw = call.args["format"];
      let format: string | undefined;
      if (formatRaw !== undefined && formatRaw !== null) {
        if (typeof formatRaw !== "string") {
          return { ok: false, message: `${name}：format 参数非法（应为字符串格式 id；缺省＝格式索引）。` };
        }
        const trimmed = formatRaw.trim();
        if (trimmed !== "") {
          // 未知 id 在本层 fail-closed 拒绝，消息与注册表未知-id 纯文本同口径（B1 AC-8-3：
          // 「未知格式 …；可用：…」、回显 ≤40 字符）；数据源仍对未知 id 防御性返回同一文本（B1 TM-1）。
          const known = docFormatKnownIds();
          if (!known.includes(trimmed)) {
            const chars = Array.from(trimmed);
            const echo = chars.length <= DOC_FORMAT_ECHO_MAX ? trimmed : `${chars.slice(0, DOC_FORMAT_ECHO_MAX).join("")}…`;
            return { ok: false, message: `未知格式 ${echo}；可用：${known.join("、")}` };
          }
          format = trimmed;
        }
      }
      // part：null/undefined/空串视为缺省（全部）；非字符串/未知值拒绝且不调用数据源。
      const partRaw = call.args["part"];
      let part: DocFormatInput["part"];
      if (partRaw !== undefined && partRaw !== null) {
        if (typeof partRaw !== "string") {
          return { ok: false, message: `${name}：part 参数非法（应为字符串：fields|example|errors）。` };
        }
        const trimmed = partRaw.trim();
        if (trimmed !== "") {
          if (trimmed !== "fields" && trimmed !== "example" && trimmed !== "errors") {
            return { ok: false, message: `${name}：未知 part=${JSON.stringify(trimmed.slice(0, DOC_FORMAT_ECHO_MAX))}；可用 part：fields|example|errors。` };
          }
          part = trimmed;
        }
      }
      const input: DocFormatInput = {
        ...(format !== undefined ? { format } : {}),
        ...(part !== undefined ? { part } : {}),
      };
      let text: string | null | undefined | void;
      try {
        const turnId = currentTurnId?.();
        text = await raceAbort(
          Promise.resolve().then(() => fn(input, {
            ...(scope?.roleId !== undefined ? { roleId: scope.roleId } : {}),
            ...(turnId !== undefined ? { turnId } : {}),
            ...(scope?.runtime !== undefined ? { runtime: scope.runtime } : {}),
          })),
          call.signal,
          `${name} 读取格式说明`,
        );
      } catch (err) {
        return { ok: false, message: `${name}：格式说明读取未完成（原因：${reasonOf(err)}）——不要据此猜测格式；可稍后重试。` };
      }
      if (typeof text !== "string" || text.trim() === "") {
        return { ok: false, message: `${name}：数据源未返回格式说明（结果不明）——不要据此猜测。` };
      }
      return {
        ok: true,
        message: Buffer.byteLength(text, "utf8") <= DOC_FORMAT_MAX_BYTES
          ? text
          : `${truncateUtf8(text, DOC_FORMAT_MAX_BYTES - Buffer.byteLength(DOC_FORMAT_TRUNCATED_MARKER, "utf8")).text}${DOC_FORMAT_TRUNCATED_MARKER}`,
      };
    },
  };
}

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

/** role_activity_log 行数：缺省 50、上限 200（工具层归一后传给数据源）。 */
const ROLE_ACTIVITY_DEFAULT_LIMIT = 50;
const ROLE_ACTIVITY_MAX_LIMIT = 200;

/**
 * role_activity_log：幕僚的**只读**运行日志查询（B 批，2026-10-28）。本层只做形状校验/归一
 * （roleId 必填、since 可解析、limit 1..200）→ 调注入数据源 → 如实转达（≤8 KiB，超限标注）。
 * **绝无副作用**：不写盘、不入队、不改任务/会话状态；数据源失败如实回报，不编造日志。
 */
function makeRoleActivityLogTool(fn: RoleActivityLogFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = ROLE_ACTIVITY_LOG_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const turnId = currentTurnId?.();
      const roleId = readStringArg(call.args, ["roleId", "role_id", "role"]);
      if (roleId === undefined || roleId.trim() === "") {
        return { ok: false, message: `${name}: 缺少 roleId 参数（目标角色 id），无法读取运行日志` };
      }
      const sinceRaw = call.args["since"];
      if (sinceRaw !== undefined && sinceRaw !== null && (typeof sinceRaw !== "string" || sinceRaw.trim() === "" || Number.isNaN(Date.parse(sinceRaw)))) {
        return { ok: false, message: `${name}: since 参数非法（应为可解析的 ISO 时间；缺省不限）` };
      }
      const limitRaw = call.args["limit"];
      if (limitRaw !== undefined && limitRaw !== null && (typeof limitRaw !== "number" || !Number.isInteger(limitRaw) || limitRaw < 1)) {
        return { ok: false, message: `${name}: limit 参数非法（应为 ≥1 的整数；缺省 ${ROLE_ACTIVITY_DEFAULT_LIMIT}，上限 ${ROLE_ACTIVITY_MAX_LIMIT}）` };
      }
      const requested = typeof limitRaw === "number" ? limitRaw : ROLE_ACTIVITY_DEFAULT_LIMIT;
      const query: RoleActivityLogPayload = {
        roleId,
        ...(typeof sinceRaw === "string" ? { since: sinceRaw } : {}),
        limit: Math.min(requested, ROLE_ACTIVITY_MAX_LIMIT),
      };
      let result: unknown;
      try {
        result = await raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return turnId === undefined ? fn(query) : fn(query, handbackMetadata(turnId, scope)); }), call.signal, `${name} 读取日志`);
      } catch (err) {
        return { ok: false, message: `${name}：运行日志读取**未完成**（原因：${reasonOf(err)}）——不要凭空推断该角色活动。` };
      }
      const receipt = watchdogResultOf(result);
      if (receipt === undefined) return { ok: false, message: `${name}：数据源未返回明确结果（回执缺失或非法）——不要据此判断任何状态。` };
      if (!receipt.ok) return { ok: false, message: watchdogFailureMessage(name, receipt.message) };
      if (typeof receipt.text !== "string" || receipt.text === "") return { ok: false, message: `${name}：数据源未返回文本（结果不明）——不要据此判断任何状态。` };
      const text = receipt.text;
      if (Buffer.byteLength(text, "utf8") <= ROLE_STATUS_MAX_BYTES) return { ok: true, message: text };
      const capped = truncateUtf8(text, ROLE_STATUS_MAX_BYTES - Buffer.byteLength(ROLE_STATUS_TRUNCATED_MARKER, "utf8"));
      return { ok: true, message: `${capped.text}${ROLE_STATUS_TRUNCATED_MARKER}` };
    },
  };
}

/**
 * terminate_role_run：幕僚的终止动作（B-07/B-08）。本层只做形状校验并如实转达回执：
 * `terminationConfirmed:false` / 子进程未全部停止 ⇒ 明确「未确认」——**不得**当已终止/可重派。
 */
function makeTerminateRoleRunTool(fn: TerminateRoleRunFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = TERMINATE_ROLE_RUN_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const turnId = currentTurnId?.();
      const roleId = readStringArg(call.args, ["roleId", "role_id", "role"]);
      if (roleId === undefined || roleId.trim() === "") return { ok: false, message: `${name}: 缺少 roleId 参数（目标角色 id），无法终止` };
      const taskId = readStringArg(call.args, ["taskId", "task_id"]);
      const payload: TerminateRoleRunPayload = { roleId, ...(taskId !== undefined ? { taskId } : {}) };
      let result: unknown;
      try {
        result = await raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return turnId === undefined ? fn(payload) : fn(payload, handbackMetadata(turnId, scope)); }), call.signal, `${name} 终止`);
      } catch (err) {
        return { ok: false, message: `${name}：终止**未完成**（原因：${reasonOf(err)}）——不得当作已终止或可重派。` };
      }
      const rec = result !== null && typeof result === "object" ? result as Record<string, unknown> : undefined;
      if (rec === undefined || typeof rec.ok !== "boolean") return { ok: false, message: `${name}：终止结果不明（回执缺失或非法）——不得当作已终止。` };
      const confirmed = rec.terminationConfirmed === true;
      const children = typeof rec.childProcesses === "number" ? rec.childProcesses : 0;
      const stopped = typeof rec.childProcessesStopped === "number" ? rec.childProcessesStopped : 0;
      const partial = Array.isArray(rec.partialArtifacts) ? rec.partialArtifacts.filter((item): item is string => typeof item === "string") : [];
      const detail = typeof rec.message === "string" ? ` ${rec.message}` : "";
      if (rec.ok === true && confirmed) {
        return {
          ok: true,
          message: `${name}：已终止角色「${roleId}」当前轮次；子进程 ${stopped}/${children} 已停止。${partial.length > 0 ? `发现部分写入 ${partial.length} 项——重派前须核对/隔离，不得自动重派。` : ""}${detail}`,
        };
      }
      return {
        ok: false,
        message: `${name}：终止**未确认**（子进程 ${stopped}/${children} 已停止；回执 ok=${String(rec.ok)}）。${partial.length > 0 ? `部分写入 ${partial.length} 项。` : ""}${detail} 不得自动重派；如实告知幕僚/客户。`,
      };
    },
  };
}

/**
 * redispatch_task：幕僚的安全重派动作（B-08）。本层只转达回执：`safety!=="safe"` / `autoAllowed!==true`
 * ⇒ 明确「未重派」及原因（external/destructive/unknown 0 次自动重派）。
 */
function makeRedispatchTaskTool(fn: RedispatchTaskFn, currentTurnId?: () => string | undefined, scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">): ExecutableTool {
  const name = REDISPATCH_TASK_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const turnId = currentTurnId?.();
      const taskId = readStringArg(call.args, ["taskId", "task_id"]);
      if (taskId === undefined || taskId.trim() === "") return { ok: false, message: `${name}: 缺少 taskId 参数，无法重派` };
      const to = readStringArg(call.args, ["to", "roleId", "role_id"]);
      const payload: RedispatchTaskPayload = { taskId, ...(to !== undefined ? { to } : {}) };
      let result: unknown;
      try {
        result = await raceAbort(Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return turnId === undefined ? fn(payload) : fn(payload, handbackMetadata(turnId, scope)); }), call.signal, `${name} 重派`);
      } catch (err) {
        return { ok: false, message: `${name}：重派**未完成**（原因：${reasonOf(err)}）——不得当作已重派。` };
      }
      const rec = result !== null && typeof result === "object" ? result as Record<string, unknown> : undefined;
      if (rec === undefined || typeof rec.ok !== "boolean") return { ok: false, message: `${name}：重派结果不明（回执缺失或非法）——不得当作已重派。` };
      const safety = rec.safety === "safe" || rec.safety === "unsafe" || rec.safety === "needs-review" ? rec.safety : "unsafe";
      const reasons = Array.isArray(rec.reasons) ? rec.reasons.filter((item): item is string => typeof item === "string").join("；") : "";
      const message = typeof rec.message === "string" ? rec.message : "";
      if (rec.ok === true && safety === "safe" && rec.autoAllowed === true) {
        return { ok: true, message: `${name}：已重派：新任务 #${String(rec.taskId ?? "?")}（retryOf #${String(rec.retryOf ?? taskId)}）。${message}` };
      }
      return { ok: false, message: `${name}：**未重派**（safety=${safety}；autoAllowed=${String(rec.autoAllowed)}）。${reasons !== "" ? `原因：${reasons}。` : ""}${message} 不得当作已重派。` };
    },
  };
}

/** 恢复动作三值（G-2 §6.3，客户批准）。工具层严格校验（非法 → 拒绝且**不调用能力**，沿 report_shell_verdict 先例）。 */

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

/** 参数形状错误：触达能力前拒绝，明确「未执行」。 */
function governanceArgumentError(name: string, detail: string): ToolResult {
  return { ok: false, message: `${name}: ${detail}——未执行；请更正后重试（不要猜测参数）` };
}

// —————————————— 需求变更申请（2026-10-26 客户要求；request_requirement_change） ——————————————
//
// 背景：报告员（Draft/rapporteur）起草提案时若发现需要新的客户授权/范围/约束/成本变化，不应把
// 未获授权的诉求塞进提案卡「顺带获批」，而应提交需求变更审批。**审批不由主理完成**（2026-10-26
// 客户纠正）：申请由**提案角色（Rapporteur）或统筹**发起；审批卡由应用在申请成功后自动经发起方会话呈现
// （decision 卡）——「替我决策」开启时由判断 agent 按推荐项决定、未开启时由客户手选；**发起方不得自批、
// 不得重复发卡**；主理不审批，只在批准后执行意图变更。本层只做两件事：**参数形状校验**（flowId/intentId 至少一个；changeKind
// 枚举；summary/rationale 非空有界；impact/proposedIntentPatch 可选有界；未知参数拒绝；非法在触达
// 能力前拒绝，不猜测、不截断、不静默丢弃）＋**调用注入能力并如实转达回执**（`ok`/`code`/`message`；
// 失败不伪装成功）。意图记录校验、去重/派发、账本/系统行与 decision 卡触发全部在**应用注入的能力**
// 侧——本工具不写盘、不弹客户卡、不做治理判定、不改变任何写权。
// 纪律：**申请≠批准，也不代表意图已变更**；`dispatched` 只表示已提交、不代表通过；
// 不要把新授权写进提案卡；`proposedIntentPatch` 只是建议。
// 未注入能力 ⇒ 工具不注册（沿 独立复核请求 先例，能力缺席＝最强 fail-closed）。

const REQUEST_REQUIREMENT_CHANGE_ARG_KEYS: ReadonlySet<string> = new Set([
  "flowId",
  "intentId",
  "taskId",
  "changeKind",
  "summary",
  "rationale",
  "impact",
  "proposedIntentPatch",
]);

/** `request_requirement_change` 回执 code 的冻结枚举（与 `RequestRequirementChangeResult` 同一契约；契约外回执 fail-closed）。 */
const REQUEST_REQUIREMENT_CHANGE_CODES: readonly RequestRequirementChangeResult["code"][] = Object.freeze([
  "dispatched",
  "already-dispatched",
  "invalid",
  "intent-not-found",
  "flow-not-found",
  "unavailable",
  "rejected",
]);
const REQUEST_REQUIREMENT_CHANGE_CODE_SET: ReadonlySet<string> = new Set(REQUEST_REQUIREMENT_CHANGE_CODES);

/** changeKind 冻结枚举（与 Model 同一契约；非法值在触达能力前拒绝）。 */
const REQUEST_REQUIREMENT_CHANGE_KINDS: readonly RequestRequirementChangeInput["changeKind"][] = Object.freeze([
  "scope",
  "authorization",
  "constraint",
  "cost",
  "other",
]);

/** 有界文本上限（按 Unicode 码点计；超长拒绝、绝不静默截断；数值在 schema 描述中公开）。 */
const REQUEST_REQUIREMENT_CHANGE_LIMITS = Object.freeze({
  summary: 500,
  rationale: 4000,
  impact: 2000,
  proposedIntentPatch: 4000,
});
type RequirementChangeTextField = keyof typeof REQUEST_REQUIREMENT_CHANGE_LIMITS;

/** 必填有界文本：非空字符串且 ≤ 该字段上限（超长拒绝，不截断）。不改写载荷值。 */
function readRequirementChangeRequiredText(
  args: Record<string, unknown>,
  key: RequirementChangeTextField,
  name: string,
): { ok: true; value: string } | { ok: false; result: ToolResult } {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, result: governanceArgumentError(name, `缺少或非法的 ${key} 参数（须为非空字符串）`) };
  }
  const length = Array.from(value).length;
  const max = REQUEST_REQUIREMENT_CHANGE_LIMITS[key];
  if (length > max) {
    return { ok: false, result: governanceArgumentError(name, `${key} 超过 ${max} 字（${length} 字；有界文本）`) };
  }
  return { ok: true, value };
}

/** 可选有界文本：缺席/`null` 保持缺席（不造键）；给出时须为非空字符串且 ≤ 该字段上限（超长拒绝，不截断）。 */
function readRequirementChangeOptionalText(
  args: Record<string, unknown>,
  key: RequirementChangeTextField,
  name: string,
): { ok: true; value: string | undefined } | { ok: false; result: ToolResult } {
  const value = args[key];
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, result: governanceArgumentError(name, `${key} 参数非法（须为非空字符串；可省略）`) };
  }
  const length = Array.from(value).length;
  const max = REQUEST_REQUIREMENT_CHANGE_LIMITS[key];
  if (length > max) {
    return { ok: false, result: governanceArgumentError(name, `${key} 超过 ${max} 字（${length} 字；有界文本）`) };
  }
  return { ok: true, value };
}

/**
 * 回执 → 工具结果：**原样**转达 `ok`/`code`/`message`（可选 `flowId`/`intentId`/`requestId` 一并如实呈现）。
 * 契约外回执（缺失/非对象/缺 ok/code/message/未知 code）⇒ fail-closed「未获明确结果」，按未提交处理，
 * **绝不说成已提交**。`dispatched` 只表示已提交、不代表通过，申请≠批准（见文案纪律）。
 */
function requestRequirementChangeResultMessage(name: string, value: unknown): ToolResult {
  const contractExternal = (): ToolResult => ({
    ok: false,
    message: `${name}：应用未返回明确结果（回执缺失或非法）——按**未提交**处理；**不要当已提交/已获批准**，如实告知客户。`,
  });
  if (value === null || typeof value !== "object" || Array.isArray(value)) return contractExternal();
  const receipt = value as Partial<RequestRequirementChangeResult>;
  if (
    typeof receipt.ok !== "boolean" ||
    typeof receipt.code !== "string" ||
    !REQUEST_REQUIREMENT_CHANGE_CODE_SET.has(receipt.code) ||
    typeof receipt.message !== "string" ||
    receipt.message.trim() === ""
  ) {
    return contractExternal();
  }
  const parts = [`ok=${receipt.ok}`, `code=${receipt.code}`];
  if (typeof receipt.flowId === "string" && receipt.flowId !== "") parts.push(`flowId=${receipt.flowId}`);
  if (typeof receipt.intentId === "string" && receipt.intentId !== "") parts.push(`intentId=${receipt.intentId}`);
  if (typeof receipt.requestId === "string" && receipt.requestId !== "") parts.push(`requestId=${receipt.requestId}`);
  const detail = `（${parts.join("；")}）：${receipt.message}`;
  if (receipt.ok) {
    // 2026-10-26 客户纠正：审批**不由主理完成**——需求变更审批卡可由**提案角色（Rapporteur）或统筹**
    // 发起/持有：decision 卡上「替我决策」开启时由判断 agent 按推荐项决定、未开启时由客户手选；
    // **发起方不得自批**；主理不审批，只在批准后执行意图变更。`dispatched` 只表示已提交，申请≠批准。
    const headline =
      receipt.code === "dispatched"
        ? "已提交需求变更审批（应用自动呈现 decision 卡；替我决策→判断 agent，未开启→客户手选）；申请≠批准；产品只在批准后执行意图变更，不审批；发起方不得自批、不得再调用 request_choice 重复发卡"
        : receipt.code === "already-dispatched"
          ? "此前已提交需求变更审批，未重复提交（应用自动呈现 decision 卡；替我决策→判断 agent，未开启→客户手选）；申请≠批准；产品只在批准后执行意图变更，不审批；发起方不得自批、不得再调用 request_choice 重复发卡"
          : "请求已受理（需求变更审批由应用自动呈现 decision 卡；申请≠批准；产品只在批准后执行意图变更，不审批；发起方不得自批、不得再调用 request_choice 重复发卡）";
    return {
      ok: true,
      message: `${name}：${headline}${detail}。\`proposedIntentPatch\` 只是建议，不要宣称意图已改。`,
    };
  }
  // 应用在派发前退回（如去重/归属/形状校验不通过）：**不代表客户拒绝**——如实转达原因，不要粉饰。
  if (receipt.code === "rejected") {
    return {
      ok: false,
      message:
        `${name}：需求变更申请被应用**退回**（rejected）${detail}——**不代表客户拒绝**；` +
        `**不要当已提交/已获批准**，按 message 修正后如实告知客户。`,
    };
  }
  return { ok: false, message: `${name}：需求变更申请**未成功**${detail}——**不要当已提交/已获批准**；如实告知客户。` };
}

/**
 * E2 X-R2/X-R4（rapporteur / convener）：`request_requirement_change` 的工具层角色前置事实投影。
 *
 * 事实来源：handler 已完成形状校验、尚未触达注入能力的 `input`；只投影各角色 api-spec 登记的键：
 * - rapporteur（api-spec §5.5）：`initiatorRoleId`；`claimsApproved`/`selfApproval` **不由模型参数
 *   提供**（参数面排除，见 `REQUEST_REQUIREMENT_CHANGE_ARG_KEYS`）——工具不得替发起方声明任何批准事实。
 * - convener（api-spec §5.3）：`actorRoleId`；模块键集不含批准声明键（给出即 `facts-unknown`）。
 *
 * 返回 `undefined` ⇒ 该角色不在 preflight 接线面（保持旧行为，不新增拒绝条件）。
 *
 * 依赖边界（E0.3 §2）：Provider 属 engines，只经角色模块 public entry 只读消费纯策略；不 import
 * Service/门禁引擎私有实现。`allow` 只表示角色侧策略不反对，**不是权限票**：归属/去重/派发/账本/
 * 审批卡仍由注入的应用能力与 Service 最终校验完成（本层不复制、不省略）。
 */
function requirementChangePreflightFacts(
  roleId: "rapporteur" | "convener",
  input: RequestRequirementChangeInput,
): Readonly<Record<string, unknown>> {
  return {
    ...(roleId === "rapporteur" ? { initiatorRoleId: "rapporteur" } : { actorRoleId: "convener" }),
    changeKind: input.changeKind,
    ...(input.flowId !== undefined ? { flowId: input.flowId } : {}),
    ...(input.intentId !== undefined ? { intentId: input.intentId } : {}),
    ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
    summary: input.summary,
    rationale: input.rationale,
    ...(input.impact !== undefined ? { impact: input.impact } : {}),
    ...(input.proposedIntentPatch !== undefined ? { proposedIntentPatch: input.proposedIntentPatch } : {}),
  };
}

/**
 * E2 X-R2/X-R4：按真实会话角色选择 requirement-change 前置（纯函数）。
 *
 * - `rapporteur`（X-R2）与 `convener`（X-R4）各自调用本角色模块的 `requirement-change` 策略；
 *   `facts` 必须是该角色 api-spec 登记的事实投影（上方的 `requirementChangePreflightFacts`）。
 * - 缺省/其他角色返回 `undefined` ⇒ 调用方保持旧行为（不会因本单元新增拒绝条件）。
 * - 角色 id 来自可信 scope（`GovernedToolsOptions.roleId`，由编排注入真实会话角色），不是模型参数。
 * - 导出供契约测试直接覆盖 allow / 缺事实 / 未知键；生产调用点只有 handler 一处。
 */
export function requirementChangePreflight(
  roleId: string | undefined,
  facts: Readonly<Record<string, unknown>>,
): RolePolicyDecision | undefined {
  if (roleId === "rapporteur") return rapporteurRoleModule.preflight?.checkAction({ action: "requirement-change", facts });
  if (roleId === "convener") return convenerRoleModule.preflight?.checkAction({ action: "requirement-change", facts });
  return undefined;
}

/**
 * E2 X-R2/X-R4：角色前置 deny ⇒ 既有 `{ok:false,message}` 工具回执形状（能力零调用）。
 * 内部 code 只作模型侧诊断；不写客户文案、不冒充应用回执 code、不改 Service 最终校验/拒绝顺序。
 */
export function requirementChangePreflightRejection(
  name: string,
  roleId: "rapporteur" | "convener",
  decision: Extract<RolePolicyDecision, { readonly allow: false }>,
): ToolResult {
  return {
    ok: false,
    message: `${name}: ${roleId} 角色前置策略拒绝（内部 code=${decision.code}）——未提交；申请≠批准，不要当已提交/已获批准；如实告知客户。`,
  };
}

/** request_requirement_change：把需求变更要点提交给应用（归属/去重/派发/账本由应用实现；回执如实转达）。 */
function makeRequestRequirementChangeTool(fn: RequestRequirementChangeFn, scope?: Pick<GovernedToolsOptions, "roleId">): ExecutableTool {
  const name = REQUEST_REQUIREMENT_CHANGE_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const unknown = unknownGovernanceArg(call.args, REQUEST_REQUIREMENT_CHANGE_ARG_KEYS, name);
      if (unknown !== undefined) return unknown;
      // flowId/intentId 均按治理 slug 校验（intentId 对应 docs/intents/<intentId>.md）；至少一个。
      const flowId = readGovernanceSlugArg(call.args, "flowId", name);
      if (!flowId.ok) return flowId.result;
      const intentId = readGovernanceSlugArg(call.args, "intentId", name);
      if (!intentId.ok) return intentId.result;
      const taskId = readStringArg(call.args, ["taskId", "task_id"]);
      if (taskId !== undefined && taskId.trim() === "") {
        return governanceArgumentError(name, "taskId 不能为空字符串");
      }
      if (flowId.value === undefined && intentId.value === undefined && (taskId === undefined || taskId.trim() === "")) {
        return governanceArgumentError(name, "缺少 flowId/intentId/taskId 参数（至少给出一个，用于归属校验/去重）");
      }
      const changeKind = call.args["changeKind"];
      if (typeof changeKind !== "string" || !(REQUEST_REQUIREMENT_CHANGE_KINDS as readonly string[]).includes(changeKind)) {
        return governanceArgumentError(name, `changeKind 参数非法（须为 ${REQUEST_REQUIREMENT_CHANGE_KINDS.join(" / ")} 之一）`);
      }
      const summary = readRequirementChangeRequiredText(call.args, "summary", name);
      if (!summary.ok) return summary.result;
      const rationale = readRequirementChangeRequiredText(call.args, "rationale", name);
      if (!rationale.ok) return rationale.result;
      const impact = readRequirementChangeOptionalText(call.args, "impact", name);
      if (!impact.ok) return impact.result;
      const proposedIntentPatch = readRequirementChangeOptionalText(call.args, "proposedIntentPatch", name);
      if (!proposedIntentPatch.ok) return proposedIntentPatch.result;
      const input: RequestRequirementChangeInput = {
        ...(flowId.value !== undefined ? { flowId: flowId.value } : {}),
        ...(intentId.value !== undefined ? { intentId: intentId.value } : {}),
        ...(taskId !== undefined && taskId.trim() !== "" ? { taskId } : {}),
        changeKind: changeKind as RequestRequirementChangeInput["changeKind"],
        summary: summary.value,
        rationale: rationale.value,
        ...(impact.value !== undefined ? { impact: impact.value } : {}),
        ...(proposedIntentPatch.value !== undefined ? { proposedIntentPatch: proposedIntentPatch.value } : {}),
      };
      // E2 X-R2/X-R4（rapporteur / convener）：角色侧前置——在形状校验之后、触达注入能力之前。
      // 只对真实会话角色 rapporteur/convener 生效（缺省角色保持旧行为）；deny ⇒ 既有
      // `{ok:false,message}` 回执、能力零调用；allow 不替代 Service 最终校验。
      const preflightRole = scope?.roleId === "rapporteur" || scope?.roleId === "convener" ? scope.roleId : undefined;
      if (preflightRole !== undefined) {
        const preflight = requirementChangePreflight(preflightRole, requirementChangePreflightFacts(preflightRole, input));
        if (preflight !== undefined && !preflight.allow) return requirementChangePreflightRejection(name, preflightRole, preflight);
      }
      let result: unknown;
      try {
        result = await raceAbort(
          Promise.resolve().then(() => { if (call.signal?.aborted) throw new Error("会话已中止"); return fn(input); }),
          call.signal,
          `${name} 提交需求变更申请`,
        );
      } catch (err) {
        return { ok: false, message: `${name}：需求变更申请**未完成**（原因：${reasonOf(err)}）——**不要当已提交/已获批准**；如实告知客户。` };
      }
      return requestRequirementChangeResultMessage(name, result);
    },
  };
}

// —————————————— 全局任务状态 / 版本决策工具（2026-11-02，A0；注入才注册） ——————————————
//
// 三工具均沿 `dispatch_task`/`role_status` 的「注入才注册」先例：能力缺席 ⇒ 工具不存在（最强 fail-closed）；
// 本层不硬编码角色 id（注入面由编排/桌面注入端决定：`project_state` 给全部内置治理角色，chief 完整、
// 其余裁剪；`project_note`/`request_version_decision` 仅 trio chief；项目 worker 不注入）。
// 纪律：`project_state` 纯读；`project_note` 只提交受控备注（不改机器事实）；`request_version_decision`
// 只发起申请（**申请≠批准、路线≠内容批准**；不写文档、不派角色、不创建任务、不执行）。

const PROJECT_STATE_ARG_KEYS: ReadonlySet<string> = new Set(["flowId"]);
const PROJECT_STATE_TRUNCATED_MARKER = "\n[truncated：项目状态输出超过 8 KiB 上限，已按 UTF-8 字节截断]";

/** `project_note` 的严格 op 参数面（未知参数/与 op 不符的参数在触达能力前拒绝）。 */
const PROJECT_NOTE_OP_ARG_KEYS: Readonly<Record<ProjectNoteOp, ReadonlySet<string>>> = {
  "set-focus": new Set(["op", "flowId", "runId", "note", "cleared"]),
  blocker: new Set(["op", "noteKey", "text", "active", "refs"]),
  "next-step": new Set(["op", "noteKey", "text", "active", "refs"]),
};

const REQUEST_VERSION_DECISION_ARG_KEYS: ReadonlySet<string> = new Set(["flowId", "runId", "action", "reason", "refs"]);
const VERSION_DECISION_ACTION_SET: ReadonlySet<string> = new Set(VERSION_DECISION_ACTIONS);
const VERSION_DECISION_ERROR_CODE_SET: ReadonlySet<string> = new Set(VERSION_DECISION_ERROR_CODES);

/** 必填有界文本：非空、字符数 ≤ maxChars；超限拒绝（不截断）。 */
function boundedTextArg(
  args: Record<string, unknown>,
  key: string,
  maxChars: number,
  toolName: string,
): { ok: true; value: string } | { ok: false; result: ToolResult } {
  const raw = args[key];
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, result: governanceArgumentError(toolName, `缺少 ${key} 参数（须为非空字符串）`) };
  }
  const chars = Array.from(raw).length;
  if (chars > maxChars) {
    return { ok: false, result: governanceArgumentError(toolName, `${key} 超过上限（当前 ${chars} 字符；上限 ${maxChars}）——超限拒绝、不截断`) };
  }
  return { ok: true, value: raw };
}

/** 可选非空字符串（给出但非法 ⇒ 拒绝；缺席 ⇒ undefined）。 */
function optionalNonEmptyStringArg(
  args: Record<string, unknown>,
  key: string,
  toolName: string,
): { ok: true; value?: string } | { ok: false; result: ToolResult } {
  const raw = args[key];
  if (raw === undefined || raw === null) return { ok: true };
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, result: governanceArgumentError(toolName, `${key} 参数非法（须为非空字符串）`) };
  }
  return { ok: true, value: raw };
}

/** refs：≤maxItems 项非空字符串；空数组视作未提供。 */
function projectRefsArg(
  args: Record<string, unknown>,
  key: string,
  maxItems: number,
  toolName: string,
): { ok: true; value?: string[] } | { ok: false; result: ToolResult } {
  const raw = args[key];
  if (raw === undefined || raw === null) return { ok: true };
  if (!Array.isArray(raw)) {
    return { ok: false, result: governanceArgumentError(toolName, `${key} 参数非法（须为字符串数组，≤${maxItems} 项）`) };
  }
  if (raw.length > maxItems) {
    return { ok: false, result: governanceArgumentError(toolName, `${key} 超过上限（${raw.length} 项；上限 ${maxItems}）——超限拒绝`) };
  }
  const refs: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || item.trim() === "") {
      return { ok: false, result: governanceArgumentError(toolName, `${key} 参数非法（每项须为非空字符串）`) };
    }
    refs.push(item);
  }
  return { ok: true, value: refs.length > 0 ? refs : undefined };
}

/**
 * project_state：全局任务状态**只读**摘要（与 UI `project-state:get` 同一 builder 的文本投影）。
 * 本层只做查询形状校验（仅可选 flowId）、截断防御（≤8 KiB）与如实转达；数据源失败不编造状态。
 */
function makeProjectStateTool(
  fn: ProjectStateFn,
  currentTurnId?: () => string | undefined,
  scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">,
): ExecutableTool {
  const name = PROJECT_STATE_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const unknown = unknownGovernanceArg(call.args, PROJECT_STATE_ARG_KEYS, name);
      if (unknown !== undefined) return unknown;
      const flowId = readGovernanceSlugArg(call.args, "flowId", name);
      if (!flowId.ok) return flowId.result;
      const query: ProjectStateQuery = { ...(flowId.value !== undefined ? { flowId: flowId.value } : {}) };
      const turnId = currentTurnId?.();
      let result: unknown;
      try {
        result = await raceAbort(
          Promise.resolve().then(() => {
            if (call.signal?.aborted) throw new Error("会话已中止");
            return turnId === undefined ? fn(query) : fn(query, handbackMetadata(turnId, scope));
          }),
          call.signal,
          `${name} 读取项目状态`,
        );
      } catch (err) {
        return { ok: false, message: `${name}：项目状态读取**未完成**（原因：${reasonOf(err)}）——没有拿到快照就**不要推断项目状态**；如实告知客户。` };
      }
      const receipt = watchdogResultOf(result);
      if (receipt === undefined) return { ok: false, message: `${name}：数据源未返回明确结果（回执缺失或非法）——**不要据此判断任何状态**。` };
      if (!receipt.ok) return { ok: false, message: watchdogFailureMessage(name, receipt.message) };
      if (typeof receipt.text !== "string" || receipt.text === "") {
        return { ok: false, message: `${name}：数据源未返回文本（结果不明）——**不要据此判断任何状态**。` };
      }
      const text = receipt.text;
      if (Buffer.byteLength(text, "utf8") <= PROJECT_STATE_TOOL_MAX_BYTES) return { ok: true, message: text };
      const capped = truncateUtf8(text, PROJECT_STATE_TOOL_MAX_BYTES - Buffer.byteLength(PROJECT_STATE_TRUNCATED_MARKER, "utf8"));
      return { ok: true, message: `${capped.text}${PROJECT_STATE_TRUNCATED_MARKER}` };
    },
  };
}

// —————————————— 治理权力矩阵只读工具（governance-authority-matrix，C2，2026-11-05） ——————————————

export const GOVERNANCE_MATRIX_TOOL_NAME = "governance_matrix";
const GOVERNANCE_MATRIX_ARG_KEYS: ReadonlySet<string> = new Set(["roleId", "section"]);
const GOVERNANCE_MATRIX_SECTIONS = ["all", "roles", "routing"] as const;

/**
 * governance_matrix：治理权力矩阵**只读**摘要（注入才注册；角色门控在编排注入端）。
 * 本层只做参数形状校验（仅 roleId/section）并调用注入函数，**原样转达** ok/message：
 * 不读项目文件、不组装矩阵、不写盘/账本、不缓存、不产生状态事件。
 * `ok:false` 表示矩阵不可用，**不是「没有权限」**；抛错/回执畸形如实报告，绝不编造权限。
 * `roleId` 由注入函数做精确匹配（本层只 trim 首尾空白）；`section` 缺省由注入函数按 all 处理。
 */
function makeGovernanceMatrixTool(fn: GovernanceMatrixFn): ExecutableTool {
  const name = GOVERNANCE_MATRIX_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const unknown = unknownGovernanceArg(call.args, GOVERNANCE_MATRIX_ARG_KEYS, name);
      if (unknown !== undefined) return unknown;
      const roleIdRaw = call.args["roleId"];
      let roleId: string | undefined;
      if (roleIdRaw !== undefined && roleIdRaw !== null) {
        if (typeof roleIdRaw !== "string") {
          return { ok: false, message: `${name}：roleId 应为字符串（本工具只接受矩阵中已有的精确角色 id）——未执行` };
        }
        const trimmedRoleId = roleIdRaw.trim();
        if (trimmedRoleId === "") {
          return { ok: false, message: `${name}：roleId 不能为空——未执行` };
        }
        roleId = trimmedRoleId;
      }
      const sectionRaw = call.args["section"];
      let section: "all" | "roles" | "routing" | undefined;
      if (sectionRaw !== undefined && sectionRaw !== null) {
        if (typeof sectionRaw !== "string") {
          return { ok: false, message: `${name}：section 应为字符串（${GOVERNANCE_MATRIX_SECTIONS.join("|")}）——未执行` };
        }
        const trimmedSection = sectionRaw.trim();
        if (!(GOVERNANCE_MATRIX_SECTIONS as readonly string[]).includes(trimmedSection)) {
          return { ok: false, message: `${name}：section 非法（应为 ${GOVERNANCE_MATRIX_SECTIONS.join("|")}）——未执行` };
        }
        section = trimmedSection as "all" | "roles" | "routing";
      }
      const input = {
        ...(roleId !== undefined ? { roleId } : {}),
        ...(section !== undefined ? { section } : {}),
      };
      let result: unknown;
      try {
        result = await raceAbort(
          Promise.resolve().then(() => {
            if (call.signal?.aborted) throw new Error("会话已中止");
            return fn(input);
          }),
          call.signal,
          `${name} 读取治理权力矩阵`,
        );
      } catch (err) {
        return { ok: false, message: `${name}：矩阵读取**未完成**（原因：${reasonOf(err)}）——没有拿到摘要就**不要推断任何权限**，如实告知客户。` };
      }
      if (result === null || typeof result !== "object") {
        return { ok: false, message: `${name}：数据源未返回明确结果（回执缺失或非法）——**不要据此判断权限**。` };
      }
      const receipt = result as Record<string, unknown>;
      const ok = receipt["ok"];
      const message = receipt["message"];
      if (typeof ok !== "boolean") {
        return { ok: false, message: `${name}：数据源未返回明确结果（回执缺失或非法）——**不要据此判断权限**。` };
      }
      if (typeof message !== "string" || message === "") {
        return { ok: false, message: `${name}：数据源未返回文本（结果不明）——**不要据此判断权限**。` };
      }
      // ok:true / ok:false 均原样转达；ok:false 表示矩阵不可用，不是「没有权限」。
      return { ok, message };
    },
  };
}

/**
 * project_note：幕僚**受控备注**（set-focus / blocker / next-step）。本层做严格参数形状与长度校验，
 * 再调注入能力（应用校验 flow 存在性并 append-only 写事件）。备注**不是机器事实、不是批准/验收证据**；
 * 本工具不改任务 status/closed、run state/pin、manifest 或文档。
 */
function makeProjectNoteTool(
  fn: ProjectNoteFn,
  currentTurnId?: () => string | undefined,
  scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">,
): ExecutableTool {
  const name = PROJECT_NOTE_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const opRaw = call.args["op"];
      if (opRaw !== "set-focus" && opRaw !== "blocker" && opRaw !== "next-step") {
        return governanceArgumentError(name, 'op 参数非法（应为 "set-focus" / "blocker" / "next-step" 之一）');
      }
      const op: ProjectNoteOp = opRaw;
      const allowed = PROJECT_NOTE_OP_ARG_KEYS[op];
      for (const key of Object.keys(call.args)) {
        if (!allowed.has(key)) return governanceArgumentError(name, `op=${op} 不接受参数 ${key}`);
      }

      let input: ProjectNoteInput;
      if (op === "set-focus") {
        const clearedRaw = call.args["cleared"];
        if (clearedRaw !== undefined && clearedRaw !== null && typeof clearedRaw !== "boolean") {
          return governanceArgumentError(name, "cleared 参数非法（应为布尔值）");
        }
        const cleared = clearedRaw === true;
        const flowId = readGovernanceSlugArg(call.args, "flowId", name);
        if (!flowId.ok) return flowId.result;
        if (!cleared && flowId.value === undefined) {
          return governanceArgumentError(name, "set-focus 需要 flowId（或 cleared:true 清除 focus）");
        }
        const runId = optionalNonEmptyStringArg(call.args, "runId", name);
        if (!runId.ok) return runId.result;
        const noteRaw = call.args["note"];
        if (noteRaw !== undefined && noteRaw !== null && typeof noteRaw !== "string") {
          return governanceArgumentError(name, "note 参数非法（应为字符串）");
        }
        if (typeof noteRaw === "string" && Array.from(noteRaw).length > PROJECT_NOTE_BLOCKER_TEXT_MAX) {
          return governanceArgumentError(
            name,
            `note 超过上限（当前 ${Array.from(noteRaw).length} 字符；上限 ${PROJECT_NOTE_BLOCKER_TEXT_MAX}）——超限拒绝、不截断`,
          );
        }
        input = {
          op,
          ...(flowId.value !== undefined ? { flowId: flowId.value } : {}),
          ...(runId.value !== undefined ? { runId: runId.value } : {}),
          ...(typeof noteRaw === "string" ? { note: noteRaw } : {}),
          ...(cleared ? { cleared: true } : {}),
        };
      } else if (op === "blocker") {
        const noteKey = readGovernanceSlugArg(call.args, "noteKey", name);
        if (!noteKey.ok) return noteKey.result;
        if (noteKey.value === undefined) return governanceArgumentError(name, "blocker 需要 noteKey（slug，≤64 字符）");
        const text = boundedTextArg(call.args, "text", PROJECT_NOTE_BLOCKER_TEXT_MAX, name);
        if (!text.ok) return text.result;
        const activeRaw = call.args["active"];
        if (typeof activeRaw !== "boolean") return governanceArgumentError(name, "blocker 需要布尔参数 active（true 生效 / false 解除）");
        const refs = projectRefsArg(call.args, "refs", PROJECT_NOTE_REFS_MAX, name);
        if (!refs.ok) return refs.result;
        input = {
          op,
          noteKey: noteKey.value,
          text: text.value,
          active: activeRaw,
          ...(refs.value !== undefined ? { refs: refs.value } : {}),
        };
      } else {
        const noteKey = readGovernanceSlugArg(call.args, "noteKey", name);
        if (!noteKey.ok) return noteKey.result;
        const text = boundedTextArg(call.args, "text", PROJECT_NOTE_NEXT_STEP_TEXT_MAX, name);
        if (!text.ok) return text.result;
        const activeRaw = call.args["active"];
        if (typeof activeRaw !== "boolean") return governanceArgumentError(name, "next-step 需要布尔参数 active（true 生效 / false 解除）");
        const refs = projectRefsArg(call.args, "refs", PROJECT_NOTE_REFS_MAX, name);
        if (!refs.ok) return refs.result;
        input = {
          op,
          noteKey: noteKey.value ?? PROJECT_NOTE_NEXT_STEP_DEFAULT_KEY,
          text: text.value,
          active: activeRaw,
          ...(refs.value !== undefined ? { refs: refs.value } : {}),
        };
      }

      const turnId = currentTurnId?.();
      let result: unknown;
      try {
        result = await raceAbort(
          Promise.resolve().then(() => {
            if (call.signal?.aborted) throw new Error("会话已中止");
            return turnId === undefined ? fn(input) : fn(input, handbackMetadata(turnId, scope));
          }),
          call.signal,
          `${name} 写入备注`,
        );
      } catch (err) {
        return { ok: false, message: `${name}：备注**未写入**（原因：${reasonOf(err)}）——不要假设已生效；如实告知客户。` };
      }
      if (result === null || typeof result !== "object") {
        return { ok: false, message: `${name}：应用未返回明确结果（回执缺失或非法）——按**未写入**处理；不要假设已生效。` };
      }
      const record = result as Record<string, unknown>;
      if (typeof record["ok"] !== "boolean" || typeof record["message"] !== "string" || record["message"].trim() === "") {
        return { ok: false, message: `${name}：应用未返回明确结果（回执缺失或非法）——按**未写入**处理；不要假设已生效。` };
      }
      return { ok: record["ok"], message: record["message"] };
    },
  };
}

/**
 * request_version_decision：幕僚**发起版本决策**（version-modify / new-version-development）。
 * **只发起申请**：应用校验后发 application-owned decision 卡，客户或「替我决策」判断 agent 决定；
 * 申请≠批准、路线≠内容批准。`signal` 走第二位置参数（发起轮次中止 ⇒ 不执行、orphan），
 * 调用前先查 aborted；回执只原样转达 `ok/code/message`，失败不伪装成功。
 */
function makeRequestVersionDecisionTool(fn: RequestVersionDecisionFn): ExecutableTool {
  const name = REQUEST_VERSION_DECISION_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const unknown = unknownGovernanceArg(call.args, REQUEST_VERSION_DECISION_ARG_KEYS, name);
      if (unknown !== undefined) return unknown;
      const flowId = readGovernanceSlugArg(call.args, "flowId", name);
      if (!flowId.ok) return flowId.result;
      if (flowId.value === undefined) return governanceArgumentError(name, "缺少 flowId 参数（须为治理 slug）");
      const runId = optionalNonEmptyStringArg(call.args, "runId", name);
      if (!runId.ok) return runId.result;
      const actionRaw = call.args["action"];
      if (typeof actionRaw !== "string" || !VERSION_DECISION_ACTION_SET.has(actionRaw)) {
        return governanceArgumentError(name, `action 参数非法（应为 ${VERSION_DECISION_ACTIONS.join(" / ")} 之一）`);
      }
      const reason = boundedTextArg(call.args, "reason", VERSION_DECISION_REASON_MAX, name);
      if (!reason.ok) return reason.result;
      const refs = projectRefsArg(call.args, "refs", VERSION_DECISION_REFS_MAX, name);
      if (!refs.ok) return refs.result;

      const input: VersionDecisionRequest = {
        flowId: flowId.value,
        ...(runId.value !== undefined ? { runId: runId.value } : {}),
        action: actionRaw as VersionDecisionRequest["action"],
        reason: reason.value,
        ...(refs.value !== undefined ? { refs: refs.value } : {}),
      };

      // PM A0-6：调用前先查发起轮次是否已中止——不发卡、不调能力、不执行。
      if (call.signal?.aborted) {
        return { ok: false, message: `${name}：发起轮次已中止——未发卡、未执行；不要假设已提交或已获批准。` };
      }

      let result: unknown;
      try {
        result = await raceAbort(Promise.resolve().then(() => fn(input, call.signal)), call.signal, `${name} 申请版本决策`);
      } catch (err) {
        return { ok: false, message: `${name}：版本决策申请**未完成**（原因：${reasonOf(err)}）——未发卡/未执行；不要假设已获批准或已提交。` };
      }
      if (result === null || typeof result !== "object") {
        return { ok: false, message: `${name}：应用未返回明确结果（回执缺失或非法）——按**未提交**处理；不要假设已获批准。` };
      }
      const record = result as Record<string, unknown>;
      if (typeof record["ok"] !== "boolean" || typeof record["message"] !== "string" || record["message"].trim() === "") {
        return { ok: false, message: `${name}：应用未返回明确结果（回执缺失或非法）——按**未提交**处理；不要假设已获批准。` };
      }
      const code = record["code"];
      if (code !== undefined && (typeof code !== "string" || !VERSION_DECISION_ERROR_CODE_SET.has(code))) {
        return { ok: false, message: `${name}：应用回执错误码不在冻结集合内（契约外回执）——按**未提交**处理；不要假设已获批准。` };
      }
      return { ok: record["ok"], message: record["message"] };
    },
  };
}

// —————————————— Batch 3.5 提交能力工具（C1d；注入才注册、只提交不批准） ——————————————
//
// 客户主权：三工具只把请求交给注入能力（S5 编排 / D1b 桌面）；批准/拒绝/许可/发卡全在客户卡与
// 应用侧。工具层只做**参数形状校验 + 角色门控 + 恰好一次调用 + 如实转达结构化回执**；不重试、
// 不伪造成功、不写账本/项目文件、不改变任何写权。角色 id 从 `scope.roleId` 取（模型不可自报）。

/** 工具名（注入对应能力才注册；能力缺席 = 最强 fail-closed）。 */
export const SUBMIT_VERSION_CHANGE_TOOL_NAME = "submit_version_change";
export const SUBMIT_REFACTOR_TOOL_NAME = "submit_refactor";
export const REQUEST_STABLE_WRITE_TOOL_NAME = "request_stable_write";
export const REPORT_PLAN_ESCALATION_TOOL_NAME = "report_plan_escalation";
export const SELECT_RUN_CHANGE_TOOL_NAME = "select_run_change";
export const COMPLETE_TEAM_PLAN_TOOL_NAME = "complete_team_plan";
export const ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME = "activate_role_documents";
export const CLOSE_CREATED_TASK_TOOL_NAME = "close_created_task";
export const DECIDE_PENDING_REQUEST_TOOL_NAME = "decide_pending_request";
const DIRECT_CAPABILITY_NAMES = new Set([
  SELECT_RUN_CHANGE_TOOL_NAME, COMPLETE_TEAM_PLAN_TOOL_NAME, ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME,
  CLOSE_CREATED_TASK_TOOL_NAME, DECIDE_PENDING_REQUEST_TOOL_NAME,
]);
function directHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value);
}
function directRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Validate only the fixed narrow schemas supported above; no coercion or business policy. */
function directShapeError(value: unknown, schema: Record<string, unknown>, path = "args"): string | undefined {
  const kinds = Array.isArray(schema.type) ? schema.type : [schema.type];
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (!kinds.includes(kind) && !(kinds.includes("integer") && Number.isSafeInteger(value))) return `${path}: type`;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return `${path}: enum`;
  if (typeof value === "string") {
    if (!value.trim() || value.includes("\0") || (typeof schema.maxLength === "number" && Array.from(value).length > schema.maxLength)
      || (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value))) return `${path}: string`;
  }
  if (typeof value === "number" && (!Number.isSafeInteger(value) || (typeof schema.minimum === "number" && value < schema.minimum))) return `${path}: integer`;
  if (typeof value === "number" && typeof schema.maximum === "number" && value > schema.maximum) return `${path}: maximum`;
  if (Array.isArray(value)) {
    if ((typeof schema.minItems === "number" && value.length < schema.minItems)
      || (typeof schema.maxItems === "number" && value.length > schema.maxItems)
      || (schema.uniqueItems === true && new Set(value).size !== value.length)) return `${path}: array`;
    for (let index = 0; index < value.length; index++) {
      const error = directShapeError(value[index], schema.items as Record<string, unknown>, `${path}[${index}]`);
      if (error) return error;
    }
  }
  if (directRecord(value)) {
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    for (const key of (schema.required ?? []) as string[]) if (!Object.hasOwn(value, key)) return `${path}.${key}: required`;
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(properties, key)) return `${path}.${key}: unknown`;
      const error = directShapeError(value[key], properties[key]!, `${path}.${key}`);
      if (error) return error;
    }
  }
  return undefined;
}
function directUnknownResult(name: string): ToolResult {
  return { ok: false, message: `${name}: 结果未知或回执不完整；请按原operation/request核对恢复，不要假设未提交、旧版未变或重复执行。` };
}
function directReceiptResult(name: string, value: unknown, operationId: unknown): ToolResult {
  if (!isDirectActionReceipt(value) || value.operationId !== operationId) return directUnknownResult(name);
  return { ok: value.ok, message: `${name}: ${JSON.stringify(value)}` };
}
/** Await the single invocation even if cancellation arrives: only the capability knows the commit point. */
async function invokeDirectCapability(name: string, signal: AbortSignal | undefined, invoke: () => Promise<unknown>): Promise<ToolResult | { value: unknown }> {
  if (signal?.aborted) return { ok: false, message: `${name}: 本轮已中止，未调用能力。` };
  try { return { value: await invoke() }; }
  catch { return directUnknownResult(name); }
}
// T3 B2（MF-IR-2/3 / AC-18 / AC-24）：close_created_task / activate_role_documents 的 fixed v2 模式。
// 共享 schema 的 `required` 只保留两模式交集（见 schema.ts）；legacy 的完整必填仍在此按模式
// fail-closed 核验——错误消息与 B2 前逐字一致（`invalid-arguments args.<field>: required`）。
const LEGACY_MODE_REQUIRED: Record<string, readonly string[]> = {
  [ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME]: ["operationId", "flowId", "planRef", "d3DecisionId", "rosterRef", "targetRoleId", "documents"],
  [CLOSE_CREATED_TASK_TOOL_NAME]: ["operationId", "taskId", "runId", "basisDigest", "reportRef", "outcome"],
};
const FIXED_MODE_REQUIRED: Record<string, readonly string[]> = {
  [ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME]: ["operationId", "flowId", "workflowId", "proposalDecisionId", "targetRoleId", "roster", "documents"],
  [CLOSE_CREATED_TASK_TOOL_NAME]: ["operationId", "taskId", "outcome"],
};
/** 同一共享 schema，按实际模式套用该模式的完整 required（其它工具 = schema 原样）。 */
function modeShapeSchema(name: string, fixedMode: boolean): Record<string, unknown> {
  const parameters = describeTool(name).parameters;
  // B17（2026-11-11，RR12）：fixed 激活允许 path-only（roster/documents 文件的 sha256 可省略），
  // hash 由应用在激活前按实际字节计算并回填；legacy 仍要求 sha256（共享 schema 原样）。
  if (fixedMode && name === ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME) {
    const cloned = structuredClone(parameters) as {
      properties?: Record<string, Record<string, unknown>>;
      required?: string[];
    };
    const props = cloned.properties;
    const relaxFile = (rel: Record<string, unknown> | undefined): void => {
      if (rel !== undefined && Array.isArray(rel.required)) {
        rel.required = (rel.required as string[]).filter((key) => key !== "sha256");
      }
    };
    if (props !== undefined) {
      relaxFile(props["roster"]);
      const documents = props["documents"];
      const docProps = documents?.["properties"] as Record<string, Record<string, unknown>> | undefined;
      if (docProps !== undefined) for (const key of ["card", "boundaryMd", "boundaryYaml"]) relaxFile(docProps[key]);
    }
    const required = FIXED_MODE_REQUIRED[name];
    return required !== undefined ? { ...cloned, required } : cloned;
  }
  const required = (fixedMode ? FIXED_MODE_REQUIRED : LEGACY_MODE_REQUIRED)[name];
  return required !== undefined ? { ...parameters, required } : parameters;
}
/** fixed 分支只透传 v2 字段；legacy `runId/basisDigest/reportRef` 不采信、不透传（不触 trunk/CAS）。 */
function fixedCloseInput(args: Record<string, unknown>): FixedCloseCreatedTaskInput {
  return {
    operationId: args.operationId as string,
    taskId: args.taskId as string,
    outcome: args.outcome as TaskClosedOutcome,
    ...(args.note !== undefined ? { note: args.note as string } : {}),
  };
}
function fixedActivateInput(args: Record<string, unknown>): FixedActivateRoleDocumentsInput {
  return {
    operationId: args.operationId as string,
    flowId: args.flowId as string,
    workflowId: args.workflowId as string,
    proposalDecisionId: args.proposalDecisionId as string,
    targetRoleId: args.targetRoleId as string,
    roster: args.roster as FixedActivateRoleDocumentsInput["roster"],
    documents: args.documents as FixedActivateRoleDocumentsInput["documents"],
  };
}
function fixedFailureResult(name: string, value: Record<string, unknown>): ToolResult {
  if (typeof value.code !== "string" || !value.code.trim() || typeof value.message !== "string" || !value.message.trim()) return directUnknownResult(name);
  if (value.missing !== undefined && (!Array.isArray(value.missing) || value.missing.some(item => typeof item !== "string" || !item.trim()))) return directUnknownResult(name);
  return { ok: false, message: `${name}: ${JSON.stringify(value)}` };
}
/** fixed close v2 回执独立校验：不复用 legacy `isDirectActionReceipt`/`taskStatus`；身份必须匹配输入。 */
function fixedCloseReceiptResult(args: Record<string, unknown>, value: unknown): ToolResult {
  const name = CLOSE_CREATED_TASK_TOOL_NAME;
  if (!directRecord(value) || typeof value.ok !== "boolean") return directUnknownResult(name);
  if (!value.ok) return fixedFailureResult(name, value);
  if (value.operationId !== args.operationId || value.taskId !== args.taskId || value.outcome !== args.outcome
    || typeof value.eventId !== "string" || !value.eventId.trim()
    || typeof value.replay !== "boolean" || typeof value.stageCompleted !== "boolean"
    || (value.workflowId !== undefined && (typeof value.workflowId !== "string" || !value.workflowId.trim()))
    || (value.stage !== undefined && !isWorkflowStage(value.stage))) return directUnknownResult(name);
  return { ok: true, message: `${name}: ${JSON.stringify(value)}` };
}
/** B25（2026-11-11，RR22 失败修复）：fixed `complete_team_plan` v4 回执独立校验——不复用 legacy
 * `isDirectActionReceipt`（服务成功回执是 `{ok, operationId, flowId, workflowId, basisId, plan,
 * documents, replay, stageCompleted}`）。身份/形状不符仍 unknown（fail-closed），失败回执透出
 * code/message；legacy 回执路径不经过本函数。 */
function fixedCompleteTeamPlanReceiptResult(args: Record<string, unknown>, value: unknown): ToolResult {
  const name = COMPLETE_TEAM_PLAN_TOOL_NAME;
  if (!directRecord(value) || typeof value.ok !== "boolean") return directUnknownResult(name);
  if (!value.ok) return fixedFailureResult(name, value);
  const plan = value.plan;
  if (value.operationId !== args.operationId || value.flowId !== args.flowId
    || value.workflowId !== args.workflowId
    || typeof value.basisId !== "string" || !value.basisId.trim()
    || typeof value.replay !== "boolean" || typeof value.stageCompleted !== "boolean"
    || !Array.isArray(value.documents)
    || !directRecord(plan) || typeof plan.path !== "string" || !plan.path.trim()
    || !Number.isSafeInteger(plan.version) || !directHash(plan.sha256)) return directUnknownResult(name);
  return { ok: true, message: `${name}: ${JSON.stringify(value)}` };
}
/** fixed activate v2 回执独立校验：workflow/role 与输入一致；B17 起 rosterSha256 由应用计算（形状校验，
 * 不再与模型入参比较——模型不采信自报 hash）。不回退 legacy activationDigest。 */
function fixedActivateReceiptResult(args: Record<string, unknown>, value: unknown): ToolResult {
  const name = ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME;
  if (!directRecord(value) || typeof value.ok !== "boolean") return directUnknownResult(name);
  if (!value.ok) return fixedFailureResult(name, value);
  if (value.workflowId !== args.workflowId || value.roleId !== args.targetRoleId
    || !directHash(value.rosterSha256)
    || typeof value.activationKey !== "string" || !value.activationKey.trim()
    || typeof value.replay !== "boolean" || typeof value.stageCompleted !== "boolean") return directUnknownResult(name);
  return { ok: true, message: `${name}: ${JSON.stringify(value)}` };
}
function makeDirectCapabilityTools(options: GovernedToolsOptions, decisionContext?: ChiefDecisionExecutionContext): ExecutableTool[] {
  type DirectInvoke = (input: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;
  const entries: { name: string; roles: readonly string[]; legacy?: DirectInvoke; fixed?: DirectInvoke }[] = [
    { name: SELECT_RUN_CHANGE_TOOL_NAME, roles: ["rapporteur"], ...(options.selectRunChange && { legacy: (input, signal) => options.selectRunChange!(input as unknown as SelectRunChangeInput, signal) }) },
    // T3 B3.1（v1.3 §5.1 `complete_team_plan` v4）：fixed 形状 `{operationId,flowId,workflowId,plan}` 与
    // legacy 形状共用同一注入位；本层只按共享 schema 做形状校验并**原样透传**（不派生/不改写 workflowId，
    // 不代做 runId/baseDigest 的 fixed 拒绝——权威 workflowId 绑定与 `baseline-legacy-field-forbidden`
    // 均由应用服务/编排按实际模式执行）。legacy 输入面（required/旧字段/回执）逐字不变。
    { name: COMPLETE_TEAM_PLAN_TOOL_NAME, roles: ["convener"], ...(options.completeTeamPlan && { legacy: (input, signal) => options.completeTeamPlan!(input as unknown as CompleteTeamPlanInput, signal) }) },
    // T3 B2（MF-IR-3）：fixed 依赖存在时以 fixed 为准（纵深防御；legacy 会话不注入 fixed）。
    { name: ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME, roles: ["nominator"],
      ...(options.activateRoleDocuments && { legacy: (input, signal) => options.activateRoleDocuments!(input as unknown as ActivateRoleDocumentsInput, signal) }),
      ...(options.activateRoleDocumentsFixed && { fixed: (input, signal) => options.activateRoleDocumentsFixed!(fixedActivateInput(input), signal) }) },
    // T3 B2（MF-IR-2）：fixed 优先；legacy 字段路径/回执校验逐字保留于下方。
    { name: CLOSE_CREATED_TASK_TOOL_NAME, roles: ["chief", "convener"],
      ...(options.closeCreatedTask && { legacy: (input, signal) => options.closeCreatedTask!(input as unknown as CloseCreatedTaskInput, signal) }),
      ...(options.closeCreatedTaskFixed && { fixed: (input, signal) => options.closeCreatedTaskFixed!(fixedCloseInput(input), signal) }) },
    { name: DECIDE_PENDING_REQUEST_TOOL_NAME, roles: ["chief"], ...(options.decidePendingRequest && { legacy: (input, signal) => options.decidePendingRequest!(input as unknown as DecidePendingRequestInput, signal) }) },
  ];
  return entries.filter(entry => entry.legacy !== undefined || entry.fixed !== undefined).map(entry => ({ name: entry.name, async handler(call) {
    if (!entry.roles.includes(options.roleId ?? "")) return { ok: false, message: `${entry.name}: role-not-allowed（身份来自可信scope）。` };
    const fixedMode = entry.fixed !== undefined;
    const error = directShapeError(call.args, modeShapeSchema(entry.name, fixedMode));
    if (error) return { ok: false, message: `${entry.name}: invalid-arguments ${error}` };
    if (entry.name === DECIDE_PENDING_REQUEST_TOOL_NAME) {
      const selected = call.args.selected;
      if (call.args.disposition === "select" ? !Array.isArray(selected) : selected !== undefined)
        return { ok: false, message: `${entry.name}: invalid-arguments disposition/selected` };
    }
    const invoke = fixedMode ? entry.fixed! : entry.legacy!;
    const invoked = await invokeDirectCapability(entry.name, call.signal, () => invoke(call.args, call.signal));
    if (!("value" in invoked)) return invoked;
    const value = invoked.value;
    if (entry.name === DECIDE_PENDING_REQUEST_TOOL_NAME) {
      if (!directRecord(value) || typeof value.ok !== "boolean" || value.requestId !== call.args.requestId) return directUnknownResult(entry.name);
      if (value.ok) {
        const source = value.source;
        if (value.status !== "settled" || !isDirectActionSource(source) || source.kind !== "chief-delegated"
          || source.requestId !== call.args.requestId || source.baseDigest !== call.args.baseDigest
          || source.delegationRevision !== call.args.delegationRevision || source.disposition !== call.args.disposition
          || (decisionContext !== undefined && source.originRoleId !== decisionContext.request.originRoleId)
          || JSON.stringify(source.selected) !== JSON.stringify(call.args.selected)) return directUnknownResult(entry.name);
      } else if (!["pending", "stale", "rejected"].includes(String(value.status))
        || typeof value.errorCode !== "string" || !value.errorCode.trim() || typeof value.message !== "string" || !value.message.trim()) return directUnknownResult(entry.name);
      return { ok: value.ok, message: `${entry.name}: ${JSON.stringify(value)}` };
    }
    // B25（2026-11-11，RR22）：fixed `complete_team_plan` 与 legacy 共用注入位，按入参形状
    // （workflowId + plan）路由到 fixed 回执校验；legacy 回执路径逐字不变。
    if (entry.name === COMPLETE_TEAM_PLAN_TOOL_NAME
      && typeof call.args.workflowId === "string" && directRecord(call.args.plan)) {
      return fixedCompleteTeamPlanReceiptResult(call.args, value);
    }
    // fixed v2 回执走独立校验（legacy direct 回执形状不适用）；结果如实直出。
    if (fixedMode) return entry.name === CLOSE_CREATED_TASK_TOOL_NAME
      ? fixedCloseReceiptResult(call.args, value)
      : fixedActivateReceiptResult(call.args, value);
    if (directRecord(value) && value.ok === true) {
      if (entry.name === ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME && !directHash(value.activationDigest)) return directUnknownResult(entry.name);
      if (entry.name === CLOSE_CREATED_TASK_TOOL_NAME && (value.taskId !== call.args.taskId
        || typeof value.eventId !== "string" || !value.eventId.trim() || typeof value.taskStatus !== "string" || !value.taskStatus.trim())) return directUnknownResult(entry.name);
    }
    if (isDirectActionReceipt(value) && value.source !== undefined
      && (value.source.kind !== "role-direct" || value.source.actorRoleId !== options.roleId
        || value.source.action !== entry.name.replaceAll("_", "-"))) return directUnknownResult(entry.name);
    return directReceiptResult(entry.name, value, call.args.operationId);
  } }));
}
/** Separate real-chief session: no normal governed tools, writes, dispatch, close or MCP. */
export function buildChiefDecisionTools(fn: DecidePendingRequestFn, context: ChiefDecisionExecutionContext): ToolDefinition[] {
  if (!isChiefDecisionExecutionContext(context)) throw new Error("Invalid chief decision context");
  let attempts = 0;
  const [tool] = makeDirectCapabilityTools({ roleId: "chief", decidePendingRequest: fn }, context);
  return [{ ...describeTool(DECIDE_PENDING_REQUEST_TOOL_NAME), name: DECIDE_PENDING_REQUEST_TOOL_NAME,
    inputSchema: describeTool(DECIDE_PENDING_REQUEST_TOOL_NAME).parameters, displayInputRule: "none", async handler(call) {
      if (call.args.requestId !== context.request.requestId || call.args.baseDigest !== context.request.baseDigest
        || call.args.delegationRevision !== context.request.delegationRevision) return { ok: false, message: "decide_pending_request: stale request/basis/revision" };
      if (call.args.disposition === "select" && Array.isArray(call.args.selected)
        && call.args.selected.some(id => !context.request.options.some(option => option.id === id))) return { ok: false, message: "decide_pending_request: invalid selected option" };
      if (attempts >= context.limits.maxAttempts) return { ok: false, message: "decide_pending_request: decision attempt budget exhausted; inspect the existing request state" };
      attempts++;
      return tool!.handler(call);
    } }];
}

export const GIT_QUERY_TOOL_NAME = "git_query";
export const GIT_CANDIDATE_TOOL_NAME = "git_candidate";
export const GIT_PUBLISH_TOOL_NAME = "git_publish";
const GIT_CAPABILITY_TOOL_NAMES = new Set([GIT_QUERY_TOOL_NAME, GIT_CANDIDATE_TOOL_NAME, GIT_PUBLISH_TOOL_NAME]);
function gitValueError(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(gitValueError);
  if (!directRecord(value)) return false;
  if (Object.hasOwn(value, "objectFormat") && !isGitOid(value)) return true;
  if (Object.hasOwn(value, "ref") && !isGitBasis(value)) return true;
  if (Object.hasOwn(value, "path") && !isGitLiteralPath(value.path)) return true;
  return Object.values(value).some(gitValueError);
}
function makeGitCapabilityTools(options: GovernedToolsOptions): ExecutableTool[] {
  const specs = [
    { name: GIT_QUERY_TOOL_NAME, expected: "observed", invoke: options.gitQuery
      ? (input: Record<string, unknown>, signal?: AbortSignal) => options.gitQuery!(input as unknown as GitQueryRequest, signal) : undefined },
    { name: GIT_CANDIDATE_TOOL_NAME, expected: "prepared", invoke: options.gitCandidate
      ? (input: Record<string, unknown>, signal?: AbortSignal) => options.gitCandidate!(input as unknown as GitCandidateRequest, signal) : undefined },
    { name: GIT_PUBLISH_TOOL_NAME, expected: "published", invoke: options.gitPublish
      ? (input: Record<string, unknown>, signal?: AbortSignal) => options.gitPublish!(input as unknown as GitPublishRequest, signal) : undefined },
  ];
  return specs.filter(spec => spec.invoke !== undefined).map(spec => ({ name: spec.name, async handler(call) {
    const actor = options.roleId;
    if (!actor?.trim() || ["su", "single", "judge"].includes(actor)) return { ok: false, message: `${spec.name}: role-not-allowed` };
    if (spec.name === GIT_CANDIDATE_TOOL_NAME && call.args.action !== "commit" && actor !== "convener") return { ok: false, message: `${spec.name}: role-not-allowed (init/integrate/revert require convener)` };
    if (spec.name === GIT_PUBLISH_TOOL_NAME && (call.args.target === "delivery" ? actor !== "convener"
      : !["product", "rapporteur", "nominator", "convener"].includes(actor))) return { ok: false, message: `${spec.name}: role-not-allowed` };
    let schema = describeTool(spec.name).parameters;
    if (spec.name === GIT_CANDIDATE_TOOL_NAME) schema = (schema.oneOf as Record<string, unknown>[]).find(branch => {
      const properties = branch.properties as Record<string, { enum?: unknown[] }>;
      return properties.action?.enum?.includes(call.args.action);
    }) ?? {};
    const error = directShapeError(call.args, schema);
    if (error || gitValueError(call.args) || (Array.isArray(call.args.paths) && call.args.paths.some(path => !isGitLiteralPath(path))))
      return { ok: false, message: `${spec.name}: invalid-arguments ${error ?? "Git OID/ref/literal path"}` };
    const invoked = await invokeDirectCapability(spec.name, call.signal, () => spec.invoke!(call.args, call.signal));
    if (!("value" in invoked)) return invoked;
    const result = invoked.value;
    if (!isGitCapabilityResult(result) || result.operationId !== call.args.operationId) return directUnknownResult(spec.name);
    if (["observed", "prepared", "published"].includes(result.status) && result.status !== spec.expected) return directUnknownResult(spec.name);
    if (result.status === "published") {
      const expected = call.args.expected as GitPublishRequest["expected"];
      const candidate = call.args.candidate as GitPublishRequest["candidate"];
      if (result.published?.ref !== expected.ref || result.published.oid?.objectFormat !== candidate.objectFormat
        || result.published.oid.hex.toLowerCase() !== candidate.hex.toLowerCase()) return directUnknownResult(spec.name);
    }
    return { ok: result.status === spec.expected, message: `${spec.name}: ${JSON.stringify(result)}` };
  } }));
}

const SUBMIT_VERSION_CHANGE_ARG_KEYS: ReadonlySet<string> = new Set([
  "kind",
  "flowId",
  "summary",
  "targets",
  "amendmentId",
  "amendmentDocPath",
  "bootstrap",
  "operationId", "baseTrunk", "supersedesApplicationId",
]);
const VERSION_CHANGE_TARGET_ARG_KEYS: ReadonlySet<string> = new Set(["kind", "path", "action", "from", "roleId", "expectedFromSha256"]);
const SUBMIT_REFACTOR_ARG_KEYS: ReadonlySet<string> = new Set(["flowId", "title", "reason", "scope"]);
const REFACTOR_SCOPE_ARG_KEYS: ReadonlySet<string> = new Set(["modules", "paths", "roles"]);
const REQUEST_STABLE_WRITE_ARG_KEYS: ReadonlySet<string> = new Set(["content"]);
const REPORT_PLAN_ESCALATION_ARG_KEYS: ReadonlySet<string> = new Set(["flowId", "category", "summary"]);
const PLAN_ESCALATION_CATEGORY_SET: ReadonlySet<string> = new Set(PLAN_ESCALATION_CATEGORIES);

const VERSION_CHANGE_KIND_SET: ReadonlySet<string> = new Set(VERSION_CHANGE_KINDS);
const VERSION_CHANGE_TARGET_ACTION_SET: ReadonlySet<string> = new Set(VERSION_CHANGE_TARGET_ACTIONS);
const VERSION_CHANGE_ERROR_CODE_SET: ReadonlySet<string> = new Set(VERSION_CHANGE_ERROR_CODES);
const REFACTOR_ERROR_CODE_SET: ReadonlySet<string> = new Set(REFACTOR_ERROR_CODES);
const STABLE_WRITE_ERROR_CODE_SET: ReadonlySet<string> = new Set(STABLE_WRITE_ERROR_CODES);
const VERSION_CHANGE_STATUS_SET: ReadonlySet<string> = new Set(VERSION_CHANGE_STATUSES);
const REFACTOR_STATUS_SET: ReadonlySet<string> = new Set(REFACTOR_REQUEST_STATUSES);
const STABLE_WRITE_STATUS_SET: ReadonlySet<string> = new Set(STABLE_WRITE_STATUSES);
const VERSION_CHANGE_ID_RE = new RegExp(VERSION_CHANGE_ID_PATTERN);
const REFACTOR_REQUEST_ID_RE = new RegExp(REFACTOR_REQUEST_ID_PATTERN);
const STABLE_WRITE_REQUEST_ID_RE = new RegExp(STABLE_WRITE_REQUEST_ID_PATTERN);
const AMENDMENT_ID_RE = new RegExp(AMENDMENT_ID_PATTERN);

type SubmissionRead<T> = { ok: true; value: T } | { ok: false; result: ToolResult };

function submissionArgumentError(name: string, code: string, detail: string): ToolResult {
  return {
    ok: false,
    message: `${name}: ${detail} [技术 code：${code}]——未提交；请更正后重试（不要猜测参数）`,
  };
}

/** 严格参数面（未知参数在触达能力前拒绝，并带冻结 code）。 */
function unknownSubmissionArg(
  args: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  name: string,
  code: string,
): ToolResult | undefined {
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) {
      return submissionArgumentError(name, code, `未知参数 ${key}（本工具不接受该参数）`);
    }
  }
  return undefined;
}

function submissionRoleError(
  name: string,
  code: string,
  roleId: string | undefined,
  expected: string,
  guide: string,
): ToolResult {
  const actual = roleId === undefined || roleId.trim() === "" ? "（未注入）" : roleId;
  return {
    ok: false,
    message: `${name}: 当前角色 ${actual} 不能提交该请求（仅 ${expected}）[技术 code：${code}]——未提交；${guide}`,
  };
}

/** 可选有界文本（给出但非法 ⇒ 拒绝；缺席 ⇒ undefined；不截断）。 */
function optionalSubmissionText(
  args: Record<string, unknown>,
  key: string,
  name: string,
  code: string,
  maxChars: number,
): SubmissionRead<string | undefined> {
  const raw = args[key];
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== "string" || raw.trim() === "" || raw.includes("\u0000")) {
    return { ok: false, result: submissionArgumentError(name, code, `${key} 参数非法（须为非空字符串；可省略）`) };
  }
  const chars = Array.from(raw).length;
  if (chars > maxChars) {
    return { ok: false, result: submissionArgumentError(name, code, `${key} 超过上限（当前 ${chars} 字符；上限 ${maxChars}）——超限拒绝、不截断`) };
  }
  return { ok: true, value: raw };
}

/** 必填有界文本（非空、≤maxChars；超限拒绝、不截断），错误带冻结 code。 */
function requiredSubmissionText(
  args: Record<string, unknown>,
  key: string,
  maxChars: number,
  name: string,
  code: string,
): SubmissionRead<string> {
  const raw = args[key];
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, result: submissionArgumentError(name, code, `缺少 ${key} 参数（须为非空字符串）`) };
  }
  const chars = Array.from(raw).length;
  if (chars > maxChars) {
    return { ok: false, result: submissionArgumentError(name, code, `${key} 超过上限（当前 ${chars} 字符；上限 ${maxChars}）——超限拒绝、不截断`) };
  }
  return { ok: true, value: raw };
}

/** 必填治理 slug（匹配 `GOVERNANCE_SLUG_PATTERN`），错误带冻结 code。 */
function requiredSubmissionSlug(
  args: Record<string, unknown>,
  key: string,
  name: string,
  code: string,
): SubmissionRead<string> {
  const raw = args[key];
  if (typeof raw !== "string" || !GOVERNANCE_SLUG.test(raw)) {
    return {
      ok: false,
      result: submissionArgumentError(name, code, `缺少或非法的 ${key} 参数（须匹配 ${GOVERNANCE_SLUG_PATTERN}）`),
    };
  }
  return { ok: true, value: raw };
}

/** VCA targets：结构/类型/上界校验；语义（允许 kind、写区、targets↔items）归 C2c Service。 */
function readVersionChangeTargets(
  args: Record<string, unknown>,
  name: string,
): SubmissionRead<VersionChangeTargetSubmission[]> {
  const raw = args["targets"];
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, result: submissionArgumentError(name, "vca-invalid", "targets 参数非法（须为非空数组）") };
  }
  if (raw.length > VCA_SUBMISSION_TARGETS_MAX) {
    return {
      ok: false,
      result: submissionArgumentError(name, "vca-invalid", `targets 超过上限（${raw.length} 项；上限 ${VCA_SUBMISSION_TARGETS_MAX}）——超限拒绝`),
    };
  }
  const targets: VersionChangeTargetSubmission[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, result: submissionArgumentError(name, "vca-invalid", `targets[${index}] 须为对象`) };
    }
    const record = item as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!VERSION_CHANGE_TARGET_ARG_KEYS.has(key)) {
        return { ok: false, result: submissionArgumentError(name, "vca-invalid", `targets[${index}] 未知参数 ${key}`) };
      }
    }
    const kind = record["kind"];
    if (typeof kind !== "string" || kind.trim() === "") {
      return { ok: false, result: submissionArgumentError(name, "vca-invalid", `targets[${index}].kind 须为非空字符串`) };
    }
    const path = record["path"];
    if (
      typeof path !== "string" ||
      path.trim() === "" ||
      path.includes("\u0000") ||
      Array.from(path).length > VCA_SUBMISSION_PATH_MAX_CHARS
    ) {
      return {
        ok: false,
        result: submissionArgumentError(
          name,
          "vca-invalid",
          `targets[${index}].path 非法（须为非空字符串、不含 NUL、≤${VCA_SUBMISSION_PATH_MAX_CHARS} 字符）`,
        ),
      };
    }
    const action = record["action"];
    if (typeof action !== "string" || !VERSION_CHANGE_TARGET_ACTION_SET.has(action)) {
      return {
        ok: false,
        result: submissionArgumentError(name, "vca-invalid", `targets[${index}].action 非法（应为 ${VERSION_CHANGE_TARGET_ACTIONS.join(" / ")} 之一）`),
      };
    }
    const from = record["from"];
    if (from !== undefined && (typeof from !== "string" || from.trim() === "")) {
      return { ok: false, result: submissionArgumentError(name, "vca-invalid", `targets[${index}].from 非法（须为非空字符串；可省略）`) };
    }
    const targetRoleId = record["roleId"];
    if (targetRoleId !== undefined && (typeof targetRoleId !== "string" || targetRoleId.trim() === "")) {
      return { ok: false, result: submissionArgumentError(name, "vca-invalid", `targets[${index}].roleId 非法（须为非空字符串；可省略）`) };
    }
    const expectedFromSha256 = record["expectedFromSha256"];
    if (expectedFromSha256 !== undefined && expectedFromSha256 !== null && !directHash(expectedFromSha256)) {
      return { ok: false, result: submissionArgumentError(name, "vca-invalid", `targets[${index}].expectedFromSha256 须为SHA256或null`) };
    }
    targets.push({
      kind,
      path,
      action: action as VersionChangeTargetSubmission["action"],
      ...(from !== undefined ? { from: from as string } : {}),
      ...(targetRoleId !== undefined ? { roleId: targetRoleId as string } : {}),
      ...(expectedFromSha256 !== undefined ? { expectedFromSha256: expectedFromSha256 as string | null } : {}),
    });
  }
  return { ok: true, value: targets };
}

/** refactor scope：三组字符串数组 + 项数上界；路径/越界语义归 C2c `validateRefactorSubmit`。 */
function readRefactorScope(args: Record<string, unknown>, name: string): SubmissionRead<RefactorRequestScope> {
  const raw = args["scope"];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, result: submissionArgumentError(name, "refactor-invalid", "scope 参数非法（须为对象：modules/paths/roles）") };
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!REFACTOR_SCOPE_ARG_KEYS.has(key)) {
      return { ok: false, result: submissionArgumentError(name, "refactor-invalid", `scope 未知参数 ${key}`) };
    }
  }
  const scope: RefactorRequestScope = { modules: [], paths: [], roles: [] };
  for (const key of ["modules", "paths", "roles"] as const) {
    const list = record[key];
    if (!Array.isArray(list)) {
      return { ok: false, result: submissionArgumentError(name, "refactor-invalid", `scope.${key} 须为字符串数组`) };
    }
    if (list.length > REFACTOR_SCOPE_ITEMS_MAX) {
      return {
        ok: false,
        result: submissionArgumentError(name, "refactor-invalid", `scope.${key} 超过上限（${list.length} 项；上限 ${REFACTOR_SCOPE_ITEMS_MAX}）——超限拒绝`),
      };
    }
    for (const entry of list) {
      if (typeof entry !== "string" || entry.trim() === "") {
        return { ok: false, result: submissionArgumentError(name, "refactor-invalid", `scope.${key} 每项须为非空字符串`) };
      }
      scope[key].push(entry);
    }
  }
  return { ok: true, value: scope };
}

/** 结构化回执运行时复核（契约外 ⇒ fail-closed，绝不伪装成功/批准）。 */
interface SubmissionReceiptSpec {
  name: string;
  idKey: "applicationId" | "requestId";
  idPattern: RegExp;
  okStatus: string;
  statusSet: ReadonlySet<string>;
  errorCodeSet: ReadonlySet<string>;
  successHint: string;
}

function submissionReceiptMessage(value: unknown, spec: SubmissionReceiptSpec): ToolResult {
  const contractExternal = (): ToolResult => ({
    ok: false,
    message: `${spec.name}：应用未返回明确结果（回执缺失或非法）——按**未提交**处理；不要假设已提交或已获批准。`,
  });
  if (value === null || typeof value !== "object" || Array.isArray(value)) return contractExternal();
  const receipt = value as Record<string, unknown>;
  const ok = receipt["ok"];
  if (typeof ok !== "boolean") return contractExternal();
  const message = receipt["message"];
  if (message !== undefined && typeof message !== "string") return contractExternal();
  const errorCode = receipt["errorCode"];
  if (ok) {
    const id = receipt[spec.idKey];
    const status = receipt["status"];
    if (typeof id !== "string" || !spec.idPattern.test(id)) return contractExternal();
    if (typeof status !== "string" || status !== spec.okStatus) return contractExternal();
    if (errorCode !== undefined) return contractExternal();
    return {
      ok: true,
      message: `${spec.name}：已提交 ${spec.idKey}=${id}，status=${status}。${spec.successHint}`,
    };
  }
  if (errorCode !== undefined && (typeof errorCode !== "string" || !spec.errorCodeSet.has(errorCode))) {
    return contractExternal();
  }
  const status = receipt["status"];
  if (status !== undefined && (typeof status !== "string" || !spec.statusSet.has(status))) {
    return contractExternal();
  }
  const detail = message !== undefined && message.trim() !== "" ? message : "应用拒绝或未能提交";
  const suffix = errorCode !== undefined && !detail.includes(errorCode) ? ` [技术 code：${errorCode}]` : "";
  return {
    ok: false,
    message: `${spec.name}：未提交——${detail}${suffix}；申请≠批准，不要假设已获批准。`,
  };
}

/** 恰好调用一次注入能力；中止/异常如实返回未提交（不重试、不伪造）。 */
async function invokeSubmissionCapability(
  name: string,
  signal: AbortSignal | undefined,
  invoke: () => Promise<unknown>,
): Promise<{ ok: true; value: unknown } | { ok: false; result: ToolResult }> {
  if (signal?.aborted) {
    return {
      ok: false,
      result: { ok: false, message: `${name}：发起轮次已中止——未提交；不要假设已提交或已获批准。` },
    };
  }
  try {
    return { ok: true, value: await raceAbort(Promise.resolve().then(invoke), signal, `${name} 提交`) };
  } catch (err) {
    return {
      ok: false,
      result: { ok: false, message: `${name}：提交**未完成**（原因：${reasonOf(err)}）——不要假设已提交或已获批准。` },
    };
  }
}

const VCA_RECEIPT_SPEC: SubmissionReceiptSpec = {
  name: SUBMIT_VERSION_CHANGE_TOOL_NAME,
  idKey: "applicationId",
  idPattern: VERSION_CHANGE_ID_RE,
  okStatus: "submitted",
  statusSet: VERSION_CHANGE_STATUS_SET,
  errorCodeSet: VERSION_CHANGE_ERROR_CODE_SET,
  successHint:
    "申请≠批准：批准/拒绝由客户卡决定；无已落盘主干时应用已按 bootstrap 提交（批准后以现有 pinned 基线建立 t1 并回绑 run）。不要视为已批准，也不要重复提交。",
};

const REFACTOR_RECEIPT_SPEC: SubmissionReceiptSpec = {
  name: SUBMIT_REFACTOR_TOOL_NAME,
  idKey: "requestId",
  idPattern: REFACTOR_REQUEST_ID_RE,
  okStatus: "requested",
  statusSet: REFACTOR_STATUS_SET,
  errorCodeSet: REFACTOR_ERROR_CODE_SET,
  successHint: "应用调度层机械管理；本工具不派发任务、不写代码、不产生 trunk 版本。",
};

const STABLE_WRITE_RECEIPT_SPEC: SubmissionReceiptSpec = {
  name: REQUEST_STABLE_WRITE_TOOL_NAME,
  idKey: "requestId",
  idPattern: STABLE_WRITE_REQUEST_ID_RE,
  okStatus: "requested",
  statusSet: STABLE_WRITE_STATUS_SET,
  errorCodeSet: STABLE_WRITE_ERROR_CODE_SET,
  successHint: "等待客户 stable-write 确认；尚未生成许可、尚未写入。",
};

const PLAN_ESCALATION_RECEIPT_SPEC: SubmissionReceiptSpec = {
  name: REPORT_PLAN_ESCALATION_TOOL_NAME,
  idKey: "requestId",
  idPattern: new RegExp(PLAN_ESCALATION_REQUEST_ID_PATTERN),
  okStatus: "presented",
  statusSet: new Set(["presented"]),
  errorCodeSet: new Set(PLAN_ESCALATION_ERROR_CODES),
  successHint:
    "申请≠批准：客户裁决在客户卡上完成（修订方案/验收要求｜客户提供环境｜继续核查｜终止）；工具不派发、不改需求或验收标准。不要视为已裁定，也不要重复提交。",
};

/**
 * submit_version_change：product/rapporteur 提交 VCA（version-upgrade=product、detail-amendment=rapporteur）。
 * **只提交**：能力负责 create+submit；工具绝不批准/发卡/写文档。回执 `{ok, applicationId, status, errorCode?}`。
 */
function makeSubmitVersionChangeTool(
  fn: SubmitVersionChangeFn,
  scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">,
): ExecutableTool {
  const name = SUBMIT_VERSION_CHANGE_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const unknown = unknownSubmissionArg(call.args, SUBMIT_VERSION_CHANGE_ARG_KEYS, name, "vca-invalid");
      if (unknown !== undefined) return unknown;
      const kindRaw = call.args["kind"];
      if (typeof kindRaw !== "string" || !VERSION_CHANGE_KIND_SET.has(kindRaw)) {
        return submissionArgumentError(name, "vca-invalid", `kind 参数非法（应为 ${VERSION_CHANGE_KINDS.join(" / ")} 之一）`);
      }
      const kind = kindRaw as VersionChangeKind;
      const flowId = requiredSubmissionSlug(call.args, "flowId", name, "vca-invalid");
      if (!flowId.ok) return flowId.result;
      const summary = requiredSubmissionText(call.args, "summary", VERSION_CHANGE_SUMMARY_MAX, name, "vca-invalid");
      if (!summary.ok) return summary.result;
      const targets = readVersionChangeTargets(call.args, name);
      if (!targets.ok) return targets.result;
      const amendmentId = optionalSubmissionText(call.args, "amendmentId", name, "vca-invalid", 64);
      if (!amendmentId.ok) return amendmentId.result;
      if (amendmentId.value !== undefined && !AMENDMENT_ID_RE.test(amendmentId.value)) {
        return submissionArgumentError(name, "vca-invalid", `amendmentId 非法（须匹配 ${AMENDMENT_ID_PATTERN}）`);
      }
      const supersedesApplicationId = call.args.supersedesApplicationId;
      if (supersedesApplicationId !== undefined && (typeof supersedesApplicationId !== "string"
        || !VERSION_CHANGE_ID_RE.test(supersedesApplicationId))) return submissionArgumentError(name, "vca-invalid", "supersedesApplicationId须为显式合法VCA id");
      const amendmentDocPath = optionalSubmissionText(
        call.args,
        "amendmentDocPath",
        name,
        "vca-invalid",
        VCA_SUBMISSION_PATH_MAX_CHARS,
      );
      if (!amendmentDocPath.ok) return amendmentDocPath.result;
      const bootstrapRaw = call.args["bootstrap"];
      if (bootstrapRaw !== undefined && typeof bootstrapRaw !== "boolean") {
        return submissionArgumentError(name, "vca-invalid", "bootstrap 参数非法（须为布尔值；可省略）");
      }
      const directSubmission = Object.hasOwn(call.args, "operationId") || Object.hasOwn(call.args, "baseTrunk")
        || targets.value.some(target => Object.hasOwn(target, "expectedFromSha256"));
      if (directSubmission) {
        const properties = describeTool(name).parameters.properties as Record<string, Record<string, unknown>>;
        const error = directShapeError(call.args.operationId, properties.operationId!)
          ?? directShapeError(call.args.baseTrunk, properties.baseTrunk!)
          ?? directShapeError(call.args.targets, properties.targets!);
        if (error || targets.value.some(target => !Object.hasOwn(target, "expectedFromSha256")))
          return submissionArgumentError(name, "vca-invalid", error ?? "直接提交每目标须有expectedFromSha256");
      }

      const expectedRole = VERSION_CHANGE_INITIATOR_BY_KIND[kind];
      if (scope?.roleId !== expectedRole) {
        return submissionRoleError(
          name,
          "vca-role-not-allowed",
          scope?.roleId,
          expectedRole,
          expectedRole === "product"
            ? "版本升级只能由 product 提交；其他角色/客户请走对应通道。"
            : "修正案只能由 rapporteur 提交；其他角色/客户请走对应通道。",
        );
      }

      const input: SubmitVersionChangeInput = {
        kind,
        initiatorRoleId: expectedRole,
        flowId: flowId.value,
        summary: summary.value,
        targets: targets.value,
        ...(amendmentId.value !== undefined ? { amendmentId: amendmentId.value } : {}),
        ...(amendmentDocPath.value !== undefined ? { amendmentDocPath: amendmentDocPath.value } : {}),
        ...(bootstrapRaw !== undefined ? { bootstrap: bootstrapRaw } : {}),
        ...(supersedesApplicationId !== undefined ? { supersedesApplicationId: supersedesApplicationId as string } : {}),
        ...(directSubmission ? { operationId: call.args.operationId as string,
          baseTrunk: call.args.baseTrunk as SubmitVersionChangeInput["baseTrunk"] } : {}),
      };
      if (directSubmission) {
        const invoked = await invokeDirectCapability(name, call.signal, () => fn(input, call.signal));
        if (!("value" in invoked)) return invoked;
        const value = invoked.value;
        const receipt = directRecord(value) && value.receipt !== undefined ? value.receipt : value;
        if (!isDirectActionReceipt(receipt) || receipt.operationId !== input.operationId
          || (directRecord(value) && (value.ok !== receipt.ok || (value.status !== undefined && value.status !== receipt.status)))) return directUnknownResult(name);
        if (receipt.source !== undefined && (receipt.source.kind !== "role-direct"
          || receipt.source.actorRoleId !== expectedRole || receipt.source.action !== kind)) return directUnknownResult(name);
        return { ok: receipt.ok, message: `${name}: ${JSON.stringify(value)}` };
      }
      const invoked = await invokeSubmissionCapability(name, call.signal, () => fn(input, call.signal));
      if (!invoked.ok) return invoked.result;
      return submissionReceiptMessage(invoked.value, VCA_RECEIPT_SPEC);
    },
  };
}

/**
 * submit_refactor：**仅 convener** 提交轻量重构申请（refactor.request）。
 * 应用调度层机械管理；工具不派发/不写代码/无客户卡/不产生 trunk 版本。
 */
function makeSubmitRefactorTool(
  fn: SubmitRefactorFn,
  scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">,
): ExecutableTool {
  const name = SUBMIT_REFACTOR_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const unknown = unknownSubmissionArg(call.args, SUBMIT_REFACTOR_ARG_KEYS, name, "refactor-invalid");
      if (unknown !== undefined) return unknown;
      const flowId = requiredSubmissionSlug(call.args, "flowId", name, "refactor-invalid");
      if (!flowId.ok) return flowId.result;
      const title = requiredSubmissionText(call.args, "title", REFACTOR_REASON_MAX, name, "refactor-invalid");
      if (!title.ok) return title.result;
      const reason = requiredSubmissionText(call.args, "reason", REFACTOR_REASON_MAX, name, "refactor-invalid");
      if (!reason.ok) return reason.result;
      const refactorScope = readRefactorScope(call.args, name);
      if (!refactorScope.ok) return refactorScope.result;

      if (scope?.roleId !== REFACTOR_REQUESTED_BY) {
        return submissionRoleError(
          name,
          "refactor-role-not-allowed",
          scope?.roleId,
          REFACTOR_REQUESTED_BY,
          "重构只能由 convener 会话提交；客户侧无重构入口、无客户卡。",
        );
      }

      const input: SubmitRefactorInput = {
        roleId: REFACTOR_REQUESTED_BY,
        flowId: flowId.value,
        title: title.value,
        reason: reason.value,
        scope: refactorScope.value,
      };
      const invoked = await invokeSubmissionCapability(name, call.signal, () => fn(input, call.signal));
      if (!invoked.ok) return invoked.result;
      return submissionReceiptMessage(invoked.value, REFACTOR_RECEIPT_SPEC);
    },
  };
}

/**
 * report_plan_escalation：**仅 convener** 提交「方案升级报告」，由应用发行客户主权卡
 * （修订方案/验收要求｜客户提供环境｜继续核查｜终止）。工具不派发、不写文档、不改需求或
 * 验收标准；申请≠批准——客户裁定后由应用按对应治理路径通知/唤醒相关角色。
 */
function makeReportPlanEscalationTool(
  fn: PlanEscalationFn,
  scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">,
): ExecutableTool {
  const name = REPORT_PLAN_ESCALATION_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const unknown = unknownSubmissionArg(call.args, REPORT_PLAN_ESCALATION_ARG_KEYS, name, "plan-escalation-invalid");
      if (unknown !== undefined) return unknown;
      const flowId = requiredSubmissionSlug(call.args, "flowId", name, "plan-escalation-invalid");
      if (!flowId.ok) return flowId.result;
      const categoryRaw = call.args["category"];
      if (typeof categoryRaw !== "string" || !PLAN_ESCALATION_CATEGORY_SET.has(categoryRaw)) {
        return submissionArgumentError(
          name,
          "plan-escalation-invalid",
          `category 参数非法（应为 ${PLAN_ESCALATION_CATEGORIES.join(" / ")} 之一）`,
        );
      }
      const summary = requiredSubmissionText(call.args, "summary", PLAN_ESCALATION_SUMMARY_MAX, name, "plan-escalation-invalid");
      if (!summary.ok) return summary.result;
      if (scope?.roleId !== REFACTOR_REQUESTED_BY) {
        return submissionRoleError(
          name,
          "plan-escalation-role-not-allowed",
          scope?.roleId,
          REFACTOR_REQUESTED_BY,
          "方案升级报告只能由 convener（运营）会话提交；其他角色/客户请走对应通道。",
        );
      }
      const input: PlanEscalationInput = {
        roleId: REFACTOR_REQUESTED_BY,
        flowId: flowId.value,
        category: categoryRaw as PlanEscalationInput["category"],
        summary: summary.value,
      };
      const invoked = await invokeSubmissionCapability(name, call.signal, () => fn(input, call.signal));
      if (!invoked.ok) return invoked.result;
      return submissionReceiptMessage(invoked.value, PLAN_ESCALATION_RECEIPT_SPEC);
    },
  };
}

/**
 * request_stable_write：**仅 convener** 提交 `docs/workflow.md` 写入请求（等待 stable-write 客户确认卡）。
 * 工具不签发许可、不批准、不直接写入；role-card/boundary 仍走 appointment-write。
 */
function makeRequestStableWriteTool(
  fn: RequestStableWriteFn,
  scope?: Pick<GovernedToolsOptions, "roleId" | "runtime">,
): ExecutableTool {
  const name = REQUEST_STABLE_WRITE_TOOL_NAME;
  return {
    name,
    async handler(call) {
      const unknown = unknownSubmissionArg(call.args, REQUEST_STABLE_WRITE_ARG_KEYS, name, "stable-write-invalid");
      if (unknown !== undefined) return unknown;
      const content = call.args["content"];
      if (typeof content !== "string" || content === "" || content.includes("\u0000")) {
        return submissionArgumentError(name, "stable-write-invalid", "content 参数非法（须为非空字符串，不含 NUL）");
      }
      const chars = Array.from(content).length;
      if (chars > STABLE_WRITE_CONTENT_MAX_CHARS) {
        return submissionArgumentError(
          name,
          "stable-write-invalid",
          `content 超过上限（当前 ${chars} 字符；上限 ${STABLE_WRITE_CONTENT_MAX_CHARS}）——超限拒绝、不截断`,
        );
      }
      if (scope?.roleId !== REFACTOR_REQUESTED_BY) {
        return submissionRoleError(
          name,
          "stable-write-invalid",
          scope?.roleId,
          REFACTOR_REQUESTED_BY,
          "workflow stable 写入只能由 convener 提交；role-card/boundary 走 appointment-write。",
        );
      }
      const input: RequestStableWriteInput = { roleId: REFACTOR_REQUESTED_BY, kind: "workflow", content };
      const invoked = await invokeSubmissionCapability(name, call.signal, () => fn(input, call.signal));
      if (!invoked.ok) return invoked.result;
      return submissionReceiptMessage(invoked.value, STABLE_WRITE_RECEIPT_SPEC);
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
export interface RuntimeToolLifecycle {
  beginTool(name: string, turnId?: string): () => void;
  snapshot(): { activeTools: RuntimeActiveToolFact[]; processes: RuntimeOwnedProcessFact[] };
  stopOwnedProcesses(): void;
}
type OwnedShell = { fact: RuntimeOwnedProcessFact; child: ReturnType<typeof spawn>; group: boolean; stop: () => void };
const lifecycleShells = new WeakMap<RuntimeToolLifecycle, Map<string, OwnedShell>>();
/** Per-Service-instance evidence, never a registry of arbitrary processes or persisted PIDs. */
export function createRuntimeToolLifecycle(): RuntimeToolLifecycle {
  const active = new Map<string, RuntimeActiveToolFact>();
  const children = new Map<string, OwnedShell>();
  const lifecycle: RuntimeToolLifecycle = {
    beginTool(name, turnId) {
      const id = randomUUID(); active.set(id, { id, name, ...(turnId ? { turnId } : {}) });
      return () => { active.delete(id); };
    },
    snapshot() {
      for (const { fact, group } of children.values()) {
        if (fact.state === "exited" && fact.treeStatus !== "verified" && group && fact.pid !== undefined) {
          try { process.kill(-fact.pid, 0); } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ESRCH") fact.treeStatus = "verified";
          }
        }
      }
      return { activeTools: [...active.values()].map(value => ({ ...value })), processes: [...children.values()].map(value => ({ ...value.fact })) };
    },
    stopOwnedProcesses() {
      for (const process of children.values()) if (process.fact.state !== "exited") {
        try { process.stop(); } catch { process.fact.state = "unknown"; }
      }
    },
  };
  lifecycleShells.set(lifecycle, children);
  return lifecycle;
}
function observeOwnedShell(lifecycle: RuntimeToolLifecycle | undefined, child: ReturnType<typeof spawn>, group: boolean, stop: () => void): void {
  const children = lifecycle && lifecycleShells.get(lifecycle);
  if (!children) return;
  const id = randomUUID();
  const fact: RuntimeOwnedProcessFact = { id, kind: "shell", state: "running", treeStatus: "unknown", ...(child.pid !== undefined ? { pid: child.pid } : {}) };
  children.set(id, { fact, child, group, stop });
  child.once("spawn", () => { if (child.pid !== undefined) fact.pid = child.pid; });
  child.once("error", () => { fact.state = "unknown"; });
  child.once("close", (exitCode, signal) => {
    fact.state = "exited";
    if (exitCode !== null) fact.exitCode = exitCode;
    if (signal) fact.signal = signal;
    // No PID means spawn failed; otherwise only a POSIX group absence can verify descendants here.
    if (fact.pid === undefined) fact.treeStatus = "verified";
  });
}
/** A raced handler can finish before its injected async work; retain that actual promise separately. */
function observeInjectedCapabilities<T extends object>(value: T, lifecycle: RuntimeToolLifecycle, currentTurnId: () => string | undefined): T {
  return new Proxy(value, { get(target, key, receiver) {
    const capability = Reflect.get(target, key, receiver);
    if (typeof capability !== "function") return capability;
    return (...args: unknown[]) => {
      const end = lifecycle.beginTool(`capability:${String(key)}`, key === "currentTurnId" ? undefined : currentTurnId());
      try {
        const result = Reflect.apply(capability, target, args);
        if (result && typeof result.then === "function") void Promise.resolve(result).then(end, end);
        else end();
        return result;
      } catch (error) { end(); throw error; }
    };
  } });
}
export function buildGovernedTools(gate: WriteGate, options?: GovernedToolsOptions, lifecycle?: RuntimeToolLifecycle): ToolDefinition[] {
  if (lifecycle && options) {
    const original = options;
    const currentTurnId = () => original.currentTurnId?.();
    const backgroundTasks = original.backgroundTasks
      ? observeInjectedCapabilities(original.backgroundTasks, lifecycle, currentTurnId) : undefined;
    options = observeInjectedCapabilities({ ...original, ...(backgroundTasks ? { backgroundTasks } : {}) }, lifecycle, currentTurnId);
  }
  const readRoot = options?.readRoot ?? process.cwd();
  const writeRoot = options?.writeRoot;
  const host = fileGateHost(options);
  const protectedGitRoots = host?.protectedRoots ?? (Array.isArray(options?.protectedGitRoots) ? Object.freeze([...options.protectedGitRoots]) : options?.protectedGitRoots);
  const tools: ExecutableTool[] = [
    makeWriteFileTool(gate, writeRoot, options?.versionedDocAfterWrite, protectedGitRoots, host),
    makeEditFileTool(gate, writeRoot, options?.versionedDocAfterWrite, protectedGitRoots, host),
    makeReadTool(readRoot),
    makeListDirTool(readRoot),
  ];

  // 结构性保证（2026-10-26 图片查看，沿 dispatch_task 先例）：**未注入 viewImage 能力时
  // `view_image` 不存在**（能力缺席 = 最强 fail-closed；即便 policy 为 tool-result 也不注册）。
  // 工具层负责路径/类型/大小校验与 PromptImage 转换；交付方式由注入的
  // `viewImagePolicy`（Service 按 `RUNTIME_VIEW_IMAGE_POLICY` 注入）单一决定，工具层不写引擎分支。
  const viewImage = options?.viewImage;
  if (viewImage !== undefined) tools.push(makeViewImageTool(viewImage, readRoot, options));

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
    tools.push(makeRunShellTool(shellGate, shellCwd, reviewMs, execMs, options?.interactionGate, options?.diagnostics, options?.currentTurnId, options?.extraCredentialEnvVars, options?.shellPostAudit, lifecycle, options?.roleId, options?.readonlyGit));

    // 结构性保证（2026-10-31 升级方案 v1.3 §6.4，「注入才注册」）：`request_shell_escalation`
    // **只在 shell 已 arm（注入了 ShellGate）且注入了 `shellEscalation` 能力时**注册；能力缺席 ⇒
    // 工具压根不在集合里（fail-closed），模型无法请求。判断会话不经过本函数，天然不可见。
    const shellEscalation = options?.shellEscalation;
    if (shellEscalation !== undefined) {
      tools.push(makeRequestShellEscalationTool(shellEscalation));
    }

    // 结构性保证（B1，同 run_shell 判据）：**只有 ShellGate 与后台任务管理器同时注入时**四工具才一起注册。
    // 判断会话不经过本函数（走 buildShellJudgeTools / buildGovernanceJudgeTools），因此天然不可见。
    // 未注入管理器 ⇒ 四工具不存在（fail-closed）；未注入 ShellGate ⇒ 连 run_shell 都不存在。
    const backgroundTasks = options?.backgroundTasks;
    if (backgroundTasks !== undefined) {
      tools.push(
        makeStartBackgroundTaskTool(shellGate, shellCwd, reviewMs, backgroundTasks, options?.interactionGate, options?.diagnostics, options?.currentTurnId, options?.extraCredentialEnvVars, options?.roleId),
        makeListBackgroundTasksTool(backgroundTasks),
        makeReadBackgroundTaskTool(backgroundTasks),
        makeStopBackgroundTaskTool(backgroundTasks),
      );
    }
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

  // 结构性保证（2026-11-04 下载申请，沿 customerInput 先例）：**未注入 requestDownload 能力时
  // `request_download` 不存在**（能力缺席 = 最强 fail-closed）；判断会话不经过本函数，天然不可见。
  const requestDownload = options?.requestDownload;
  if (requestDownload !== undefined) {
    tools.push(makeRequestDownloadTool(requestDownload, { roleId: options?.roleId, runtime: options?.runtime }, options?.currentTurnId));
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
  if (options?.contractCheck !== undefined) {
    tools.push(makeContractCheckTool(options.contractCheck, options?.currentTurnId, { ...(options.roleId !== undefined ? { roleId: options.roleId } : {}), ...(options.runtime !== undefined ? { runtime: options.runtime } : {}) }));
  }
  // 结构性保证（2026-11-09 文档格式权威说明，同 contract_check 先例）：**未注入 docFormat 能力时
  // `doc_format` 不存在**（能力缺席 = 最强 fail-closed；未注入 ⇒ 既有行为逐字不变）。只读：数据源
  // 提供静态公开文本；本层只做参数形状/已知 id 校验、8 KiB 预算截断与 `{ok,message}` 信封。
  if (options?.docFormat !== undefined) {
    tools.push(makeDocFormatTool(options.docFormat, options?.currentTurnId, { ...(options.roleId !== undefined ? { roleId: options.roleId } : {}), ...(options.runtime !== undefined ? { runtime: options.runtime } : {}) }));
  }
  if (options?.evidenceCheck !== undefined) {
    tools.push(makeEvidenceCheckTool(options.evidenceCheck, options?.currentTurnId, { ...(options.roleId !== undefined ? { roleId: options.roleId } : {}), ...(options.runtime !== undefined ? { runtime: options.runtime } : {}) }));
  }
  const sessionTail = options?.sessionTail;
  if (sessionTail !== undefined) tools.push(makeSessionTailTool(sessionTail, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  // B 批（2026-10-28）：role_activity_log 同属「注入才注册」；只由编排给幕僚注入，
  // 其他角色/项目角色未注入 ⇒ 工具不存在（结构性 fail-closed）。
  const roleActivityLog = options?.roleActivityLog;
  if (roleActivityLog !== undefined) tools.push(makeRoleActivityLogTool(roleActivityLog, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  // B 批：终止/重派动作同属「注入才注册」；只由编排给幕僚注入。
  const terminateRoleRun = options?.terminateRoleRun;
  if (terminateRoleRun !== undefined) tools.push(makeTerminateRoleRunTool(terminateRoleRun, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  const redispatchTask = options?.redispatchTask;
  if (redispatchTask !== undefined) tools.push(makeRedispatchTaskTool(redispatchTask, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));

  // 结构性保证（G-2/R2，同 dispatch_task 先例）：**未注入恢复提议能力时 `propose_recovery` 不存在**。

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
  // 三能力各自独立「注入才注册」；权限/迁移/证据/revision 冲突/Steward/Lead 权限裁决在编排 编排层，
  // 本层只做参数形状校验并如实转达回执（不做第二份裁决）。
  // 结构性保证（2026-10-25 独立复核请求，沿 流程读取 先例）：**未注入能力时 `独立复核请求` 不存在**。
  // 只给内置治理角色——由调用方（编排/桌面注入端）决定注入；未注入 ⇒ 模型无法请求
  // （能力缺席 = 最强 fail-closed）。派发/校验/flow/账本由能力实现，本层只路由并如实转达回执。
  // 结构性保证（2026-10-26 gate 复核请求，沿既有先例）：**未注入能力时
  // `gate 复核请求` 不存在**。只给统筹（convener）——由调用方（编排/桌面注入端）决定注入；
  // 未注入 ⇒ 模型无法请求（能力缺席 = 最强 fail-closed）。gate 校验/派发/记录/账本由能力实现，
  // 本层只做参数形状校验并如实转达回执——gate 复核 ≠ 验收通过 ≠ 客户批准。
  // 结构性保证（2026-10-26 边界变更请求，沿既有先例）：**未注入能力时
  // `边界变更请求` 不存在**。只给内置治理角色——由调用方（编排/桌面注入端）决定注入；
  // 未注入 ⇒ 模型无法请求（能力缺席 = 最强 fail-closed）。派发/appointment-write/客户确认/写盘
  // 由能力实现，本层只校验精确增删路径与理由并如实转达回执。
  // 结构性保证（2026-10-26 需求变更申请，沿既有先例）：**未注入能力时
  // `request_requirement_change` 不存在**。只给报告员（Draft/rapporteur）——由调用方（编排/桌面注入端）
  // 决定注入；未注入 ⇒ 模型无法请求（能力缺席 = 最强 fail-closed）。意图校验/去重/派发/账本/系统行
  // 由能力实现，本层只做参数形状校验并如实转达回执——申请≠批准；审批卡可由提案角色（Rapporteur）或
  // 统筹发起/持有（decision 卡；判断 agent 按推荐项或客户手选），**发起方不得自批**；主理不审批，
  // 只在批准后执行意图变更。
  const requestRequirementChange = options?.requestRequirementChange;
  if (requestRequirementChange !== undefined) {
    tools.push(makeRequestRequirementChangeTool(requestRequirementChange, { roleId: options?.roleId }));
  }
  // 结构性保证（2026-11-02 全局任务状态/版本决策，A0）：三能力各自「注入才注册」；
  // 未注入 ⇒ 工具不存在（能力缺席 = 最强 fail-closed）。本层不硬编码角色 id——注入面由编排/桌面
  // 注入端决定：project_state 给全部内置治理角色（chief 完整、其余裁剪），project_note/
  // request_version_decision 仅 trio chief，项目 worker 不注入。
  const projectState = options?.projectState;
  if (projectState !== undefined) {
    tools.push(makeProjectStateTool(projectState, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  }
  // 治理权力矩阵（2026-11-05 C2）：**注入才注册**——未注入 ⇒ 工具不存在（能力缺席 = 最强 fail-closed）。
  // 角色门控在编排（C3）注入端：仅 trio 六个内置治理角色；worker/`su`/判断会话/single 不注入。
  // 本层不硬编码角色 id、不读项目文件、不组装矩阵；handler 只调用注入函数并原样转达回执。
  const governanceMatrix = options?.governanceMatrix;
  if (governanceMatrix !== undefined) {
    tools.push(makeGovernanceMatrixTool(governanceMatrix));
  }
  const projectNote = options?.projectNote;
  if (projectNote !== undefined) {
    tools.push(makeProjectNoteTool(projectNote, options?.currentTurnId, { roleId: options?.roleId, runtime: options?.runtime }));
  }
  const requestVersionDecision = options?.requestVersionDecision;
  if (requestVersionDecision !== undefined) {
    tools.push(makeRequestVersionDecisionTool(requestVersionDecision));
  }
  // Batch 3.5（C1d）：三提交能力各自「注入才注册」（能力缺席 = 最强 fail-closed）；
  // 角色门控在 handler 内按 `scope.roleId` 执行（product/rapporteur/convener），模型不可自报身份。
  const submitVersionChange = options?.submitVersionChange;
  if (submitVersionChange !== undefined) {
    tools.push(makeSubmitVersionChangeTool(submitVersionChange, { roleId: options?.roleId, runtime: options?.runtime }));
  }
  tools.push(...makeDirectCapabilityTools(options ?? {}));
  tools.push(...makeGitCapabilityTools(options ?? {}));
  const submitRefactor = options?.submitRefactor;
  if (submitRefactor !== undefined) {
    tools.push(makeSubmitRefactorTool(submitRefactor, { roleId: options?.roleId, runtime: options?.runtime }));
  }
  const reportPlanEscalation = options?.reportPlanEscalation;
  if (reportPlanEscalation !== undefined) {
    tools.push(makeReportPlanEscalationTool(reportPlanEscalation, { roleId: options?.roleId, runtime: options?.runtime }));
  }
  const requestStableWrite = options?.requestStableWrite;
  if (requestStableWrite !== undefined) {
    tools.push(makeRequestStableWriteTool(requestStableWrite, { roleId: options?.roleId, runtime: options?.runtime }));
  }
  // 结构性保证（2026-10-27 验收标准产物汇报，沿既有先例）：**未注入能力时
  // `产物汇报` 不存在**。只给质检（内置 verifier）——由调用方（编排/桌面注入端）决定注入；
  // 未注入 ⇒ 模型无法请求（能力缺席 = 最强 fail-closed）。工具只转交载荷并如实转达回执：不写盘、
  // 不写 flow、不假装应用已接受；**汇报成功 ≠ 自动完成**，是否收口由应用校验后决定。
  // Observe customer waits without storing titles, previews or selected values.
  // 中止兜底文案需要知道 view_image 的交付方式（tool-result 不得声称排队/下一轮附件）。
  const viewImageDelivery = (options?.viewImagePolicy ?? VIEW_IMAGE_DEFAULT_POLICY).delivery;
  return tools.map((tool) => {
    const { parameters, ...description } = describeTool(tool.name);
    // B17（2026-11-11，RR15 实测）：fixed activate 的 **MCP 可见 inputSchema** 也必须允许 path-only；
    // 否则模型按提示只传 path 时会在 MCP 输入校验层被 `sha256 expected string` 拒绝（工具 handler
    // 的 modeShapeSchema 放宽不足以覆盖 schema 暴露面）。legacy 注入面仍用共享 schema。
    const inputSchema = tool.name === ACTIVATE_ROLE_DOCUMENTS_TOOL_NAME && options?.activateRoleDocumentsFixed !== undefined
      ? modeShapeSchema(tool.name, true)
      : parameters;
    const defined: ToolDefinition = { ...tool, ...description, displayInputRule: ["read_file","write_file","edit_file",VIEW_IMAGE_TOOL_NAME].includes(tool.name) ? "core-path-v1" : tool.name === "run_shell" || tool.name === START_BACKGROUND_TASK_TOOL_NAME ? "core-command-v1" : "none", inputSchema, async handler(call) {
      if (call.signal?.aborted) return abortedToolResult(tool.name, viewImageDelivery);
      const result = await tool.handler(call);
      // 后台任务成功结果带结构化事实（任务已启动/已停止是已发生的真实事件）：即使信号在 handler 返回前
      // 恰好中止，也不能把它改写成「未启动/未停止」的谎言（B4 诚实面）。
      return call.signal?.aborted && result.ok && result.backgroundTask === undefined
        && !DIRECT_CAPABILITY_NAMES.has(tool.name) && tool.name !== SUBMIT_VERSION_CHANGE_TOOL_NAME
        && !GIT_CAPABILITY_TOOL_NAMES.has(tool.name)
        ? abortedToolResult(tool.name, viewImageDelivery) : result;
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

