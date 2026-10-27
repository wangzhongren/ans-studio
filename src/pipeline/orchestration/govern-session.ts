// src/pipeline/orchestration/govern-session.ts
// 编排层：**唯一的治理会话引擎**（设计 §10.5：CLI `ans govern` 与桌面 su 收敛到同一入口）。
//
// ── 一个引擎，两个前端（§10.5，项目硬规矩「杜绝两份实现」）──────────────────────
// 客户只废 `ans init`，**未动 `ans govern`**。裁决：**保留 `ans govern`**，并明确它与**桌面 su 聊天**
// **是同一个治理会话机制的两个前端**——
//   · **一个引擎**：`openGovernanceSession`（本文件）——CLI 与桌面**都调它**；
//   · **两个前端**：CLI `ans govern`（终端，经 `runGovernSession` 一次性驱动）；桌面 su 聊天（UI，
//     直接持有 `GovernanceSessionHandle` 多轮 send）。
// 二者 gate 与写集**同源**（治理边界 / 冷启动创世授权），**无第二份装配实现**。
//
// ── 会话主体与边界 ─────────────────────────────────────────────────────────
//  1) 会话主体是**内置治理角色**（su）——其 id 由门禁引擎的 `listProject` **枚举**得到
//     （`builtIn===true`），编排**不硬编码** `"su"`（权限以数据表达）；经**会话式入口**
//     `openRoleSession` 开启（runRole 的 CLI 一次性路径结构性拒绝内置角色）。
//  2) 其 gate 求值的边界是**项目治理边界**（`resolveBoundarySection` 对「不在 `project.roles` 的
//     角色」解析得到），判定**唯一复用** `resolveWrite`（编排不另写判定）。
//  3) `scope` 按治理边界的**条件目录**给出（`conditions` = 所有条件目录 slug；`writeSet` = 目标角色
//     在 `角色卡/<id>/` 下的**精确文件**——F4 是精确匹配，放目录不覆盖子路径）。
//
// ── 不再预建骨架（T32，设计 §12.4/§12.7）─────────────────────────────────────
// 客户「不预建，全由 su 对话决定」直接否定了固定的 `SCAFFOLD_ROLES`/`writeGovernanceSkeleton` 骨架。
// 故本引擎**不再**在开会话前落盘任何骨架（原 `bootstrap` 选项已退役）：角色由 su 在会话里**用工具
// 按对话决定逐个写出**，门禁只在旁约束「允许写什么」。引擎自身只负责「发现治理角色 → 解析治理边界
// → 造 scope → 打开内置治理角色会话」。
//
// ── 客户确认制（A-3，2026-10-12）与创世自动收尾（A-4）────────────────────────────
// A-3：`GovernSessionInput.customerInput` 给出时，会话进入**确认制收窄**（见 `run-role.ts`）——
//   写盘前 su 必须先用 `request_confirmation` 把预览摆给客户；客户确认后**编排**把「已预览且校验在
//   边界内的具体路径」发行进 writeSet，F4 拒掉一切未确认路径。CLI 缺省补终端通道
//   （`createCliCustomerInput`：确认 y/n、勾选数字序号）。
//   2026-10-25 客户规则（「写自己角色权限内的路径，直接放行」）：trio 五角色在**无任务级 scope 收窄**
//   时 Section 1 全量预授权（与 `run-role.ts` 的 gate 同口径）；旧 su 的卡未声明该规则，本段确认制
//   行为逐字不变；有任务 scope 时仍按既有确认制/预授权目录，不并入 Section 1。
// A-4：**「提议 + 确认」的收口已删**（客户：「客户确定了才加，不要有个收口，收口去掉」）——
//   `finalizeBootstrap`/`operatorChannel`/句柄 `finalize()` 均不存在。写出 `.ans`(pin) +
//   `角色卡/governance-boundary.yaml` + `docs/bootstrap-manifest.md` 的**自动收尾**由
//   `openRoleSession` 在每轮 su settle 后自动执行（`repinIfBootstrapped` 含首次），
//   仍**逐笔先经 `resolveWrite`**，见 `src/common/编排/finalize.ts`。

import type { GovernanceFunction, ProjectConfig } from "../../model/role.ts";
import type { TaskScope } from "../../model/decision.ts";
import type { Acceptance, BoundarySection1 } from "../../model/boundary.ts";
import type {
  RuntimeKind,
  CustomerInputFn,
  SessionEvent,
  BackgroundTaskSnapshot,
  BackgroundTaskReadOptions,
  BackgroundTaskReadResult,
  BackgroundTaskStopOptions,
  BackgroundTaskStopResult,
} from "../../model/runtime.ts";
import { openRoleSession, isFailedSettlement, type RoleSessionDeps, type RoleSessionHandle, type RoleSessionSendOptions } from "./run-role.ts";
import { listProject, resolveGovernanceRole, resolveRole } from "../../service/role/resolve-role.ts";
import {
  LEGACY_SU_PREAUTHORIZED_DIRS,
  governanceRoleOf,
  type BuiltInGovernanceRoleSpec,
} from "../../service/boundary/resolve-boundary.ts";
import { formatEvent } from "../../common/编排/output.ts";
import type { OrchestrationEvent } from "../../common/编排/handback.ts";
import { EXIT_FAILURE, EXIT_OK } from "../../common/编排/exit-codes.ts";
import { createCliCustomerInput } from "../../common/编排/operator-channel.ts";

// ── W2（2026-10-17）：治理账本与三道门禁的 Pipeline 公共出口 ─────────────────────────────
// 桌面窗口只依赖 Pipeline 公共出口，**不直接导入**编排私有 `common/`（评审 §5.7/§6.2/§十一.3）。
// 薄再导出：不改变 `openGovernanceSession` 既有行为。
export {
  GOVERNANCE_LEDGER_REL,
  ACCEPTANCE_TRIAGE_DECISION_SCHEMA,
  appendGovernanceLedger,
  readGovernanceLedger,
  refreshGovernanceLedgerSnapshot,
  governanceLedgerPath,
  flushGovernanceLedger,
  EMPTY_GOVERNANCE_LEDGER_SNAPSHOT,
} from "../../common/编排/governance-ledger.ts";
export type {
  GovernanceLedgerEntry,
  GovernanceLedgerSnapshot,
  GovernanceLedgerAppendResult,
  GovernancePower,
  GovernanceDecisionKind,
  AcceptanceTriageLedgerDecision,
} from "../../common/编排/governance-ledger.ts";
export { evaluateGovernanceGate, parseFlowStepIds } from "../../common/编排/governance-gate.ts";
export type {
  GovernanceGateAction,
  GovernanceGateDecision,
  GovernanceGateInput,
} from "../../common/编排/governance-gate.ts";

// ── 2026-10-19：Flow YAML 契约（`docs/flows/<flowId>.yaml` 唯一机器状态）的 Pipeline 公共出口 ──
// 桌面只依赖 Pipeline 公共出口，**不直接导入**编排私有 `common/`。单一实现仍在
// `src/common/编排/flow-state.ts`；此处为薄再导出（与 `src/pipeline/orchestration/flow-state.ts` 同源）。
export {
  parseFlowStateYaml,
  evaluateFlowCompletion,
  flowCompletionIssue,
  validateFlowEvidence,
  flowStatePath,
  isReservedAcceptanceStepId,
  FLOW_QUALITY_TIERS,
  FLOW_STEP_KINDS,
  FLOW_STEP_STATUSES,
  FLOW_EVIDENCE_KINDS,
  RESERVED_ACCEPTANCE_STEP_IDS,
} from "../../common/编排/flow-state.ts";
export type {
  FlowState,
  FlowStateStep,
  FlowStepEvidence,
  FlowStepKind,
  FlowStepStatus,
  FlowEvidenceKind,
  FlowQualityTier,
  FlowStateError,
  FlowEvidenceIssue,
  FlowLedgerInput,
  ParseFlowStateResult,
  ValidateFlowEvidenceResult,
  EvaluateFlowCompletionResult,
} from "../../common/编排/flow-state.ts";

// 2026-10-24 P0-1：flow 回执视图的 release 标记（`FlowToolView` + release；桌面只经公共出口消费）。
// 2026-10-24 修订：release 仅可选发布元数据，不是独立验收的启动条件（门禁语义见 governance-gate.ts）。
export type {
  FlowToolViewWithRelease,
  ReleaseExtensionValidation,
} from "../../common/编排/flow-service.ts";
// 2026-10-26：意图交接时由应用创建通用流程骨架（客户反馈：提案前 flow 文件不应缺失）。
export { ensureFlowSkeleton, FLOW_SKELETON_STATUS } from "../../common/编排/flow-service.ts";
export type { EnsureFlowSkeletonInput, EnsureFlowSkeletonResult } from "../../common/编排/flow-service.ts";

// ── W6-A（2026-10-18）：意图交接/澄清的 Pipeline 公共出口 ──────────────────────────────────
// 四角色评审 §5.2：桌面窗口只依赖 Pipeline 公共出口，**不直接导入**编排私有 `common/`。
// 薄再导出：`validateIntentHandoff`/`intentHandoffDedupeKey`/澄清轮次计数与上限。
export {
  INTENT_DIR_REL,
  GOVERNANCE_SLUG_PATTERN,
  INTENT_SUMMARY_MAX_CHARS,
  CLARIFICATION_MAX_ROUNDS,
  intentArtifactPath,
  intentHandoffDedupeKey,
  validateIntentHandoff,
  parseIntentFrontmatter,
  countClarificationRounds,
} from "../../common/编排/governance-handoff.ts";
export type {
  IntentHandoffValidationInput,
  IntentHandoffValidationContext,
  IntentHandoffValidation,
  ClarificationRoundTarget,
  ClarificationRoundCount,
} from "../../common/编排/governance-handoff.ts";

// ── B2（2026-10-17）：I3「建立治理记录」的 Pipeline 公共出口 ─────────────────────────────
// 桌面只依赖 Pipeline 公共出口，**不直接导入** `src/common/编排/` 私有模块（PM 评审 §五.1 边界纪律）。
// 薄再导出：不改变 `openGovernanceSession` 任何既有行为。
export {
  previewGovernanceRecord,
  establishGovernanceRecord,
  GOVERNANCE_RECORD_ACCEPTANCE_SOURCE,
} from "../../common/编排/finalize.ts";
export type {
  GovernancePreview,
  GovernancePreviewResult,
  GovernancePreviewErrorCode,
  EstablishGovernanceResult,
  GovernanceRecordInput,
} from "../../common/编排/finalize.ts";

// ── B2（2026-10-17）：治理记录 pin 不符「重新接受」的 Pipeline 公共出口 ─────────────────────
// 契约见 PM 评审 `2026-10-17_design_governance-pin-recovery-review.md` §5.2。桌面只依赖 Pipeline
// 公共出口，不直接导入 `src/common/编排/` 私有模块；薄再导出不改变 `openGovernanceSession` 行为。
export {
  previewGovernanceReacceptance,
  reacceptGovernancePins,
  GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE,
} from "../../common/编排/finalize.ts";
export type {
  GovernanceReacceptInput,
  GovernanceReacceptWriteInput,
  GovernanceReacceptPreview,
  GovernanceReacceptPreviewResult,
  GovernanceReacceptPreviewFailure,
  GovernanceReacceptBlocker,
  GovernanceReacceptStatus,
  ReacceptGovernancePinsResult,
} from "../../common/编排/finalize.ts";

// ── V1b（2026-10-17）：治理模型 `su → trio` 显式迁移的 Pipeline 公共出口 ───────────────────
// 契约见 PM 评审 `2026-10-17_design_governance-trio-review.md` §3.2/§5.5。桌面只依赖 Pipeline
// 公共出口，不直接导入 `src/common/编排/` 私有模块；薄再导出不改变 `openGovernanceSession` 行为。
export {
  previewGovernanceMigration,
  migrateGovernanceModel,
  GOVERNANCE_MIGRATION_ACCEPTANCE_SOURCE,
  GOVERNANCE_MIGRATION_MANIFEST_HEADING,
  GOVERNANCE_MIGRATION_TARGET_MODEL,
  GOVERNANCE_MIGRATION_WRITE_PATHS,
} from "../../common/编排/governance-migration.ts";
export type {
  GovernanceMigrationPreview,
  GovernanceMigrationPreviewResult,
  GovernanceMigrationPreviewFailure,
  GovernanceMigrationResult,
  GovernanceMigrationStatus,
  GovernanceMigrationWriteInput,
  GovernanceMigrationPinChange,
} from "../../common/编排/governance-migration.ts";

// ── 2026-10-17：「替我审」判断 agent 驱动的 Pipeline 公共出口 ─────────────────────────────
// 桌面只依赖 Pipeline 公共出口，**不直接导入** `src/common/编排/` 私有模块（PM 评审 §5.1/§十一）。
// 薄再导出：不新增 pipeline 单文件、不改变 `openGovernanceSession` 任何既有行为。
export { createShellJudge, SHELL_JUDGE_SUPPORTED_RUNTIMES } from "../../common/编排/shell-judge.ts";
export type {
  CreateShellJudgeOptions,
  ShellJudgeFn,
  ShellJudgeOutcome,
} from "../../common/编排/shell-judge.ts";

// ── 2026-10-18：「替我审批」/「替我决策」治理卡判断 agent 驱动的 Pipeline 公共出口 ─────────────
// 桌面只依赖 Pipeline 公共出口，**不直接导入** `src/common/编排/` 私有模块（PM 评审 §7.6）。
// 薄再导出：不新增 pipeline 单文件、不改变 `openGovernanceSession` 任何既有行为。
export {
  createGovernanceJudge,
  GOVERNANCE_JUDGE_SUPPORTED_RUNTIMES,
} from "../../common/编排/governance-judge.ts";
export type { CreateGovernanceJudgeOptions } from "../../common/编排/governance-judge.ts";

/** 角色目录名（与 `listProject` 口径一致：项目角色的目录 `角色卡/<id>/`）。 */
const ROLE_CARD_DIR = "角色卡";

/** 治理职能 → 权力文案（唯一文案表；Liaison 是沟通权而非决定权）。 */
const GOVERNANCE_FUNCTION_LABEL: Record<GovernanceFunction, string> = {
  liaison: "沟通权",
  proposal: "提案权",
  nomination: "提名权",
  schedule: "编排权",
  verification: "验收权",
};

/**
 * 治理会话创建角色时写入的标准文件（role-card / boundary / memo）。
 * 它们的父目录是 `角色卡/<id>/`——即治理边界 `角色卡/`（condition `role-restructuring`）之内。
 * 注：文件**内容**由 su 在会话里按对话决定（不再有固定模板骨架，设计 §12.4）。
 */
export const ROLE_SCAFFOLD_FILES: readonly string[] = ["role-card.md", "boundary.yaml", "memo.md"];

export interface GovernSessionInput {
  taskId: string;
  runtime?: RuntimeKind;
  persistSession?: boolean;
  /** 装配注入的 project（配置单一来源在装配，契约 §6）。 */
  project: ProjectConfig;
  /** 本次治理会话要创建/重构的角色 id 列表（给出可写集）；缺省 = 无可写文件（仅按边界只读）。 */
  targetRoleIds?: string[];
  /** 覆盖内置治理角色 id；缺省经 `listProject` 枚举 `builtIn` 得到（不硬编码）。 */
  governanceRoleId?: string;
  /**
   * 治理职能（评审 §5.6；四角色评审 §4.5）：trio 下选择会话角色——`liaison`→liaison、
   * `proposal`→rapporteur（缺省）、`nomination`→nominator、`schedule`→convener。single 下传本字段
   * **明确拒绝**（旧治理模型只有 su；`resolveGovernanceRole` 给明确文案）。
   * 与显式 `governanceRoleId` 同时给出时必须一致，否则抛错。
   */
  governanceFunction?: GovernanceFunction;
  /** 覆盖默认任务提示（测试/自定义用）。 */
  prompt?: string;
  /** 目标项目目录（设计 §12.3，`ans govern <目录>`）：**诊断/透传**用——真正的 `projectRoot` 由**装配**
   *  据它设入 `project.projectRoot`（T34）；此处仅原样带出，供前端如实呈现与后续 finalize（T33）取用。 */
  targetDir?: string;
  /**
   * **客户确认制交互通道（A-1/A-3）**：前端给的原始客户通道（CLI 终端 / 桌面交互卡），原样透传给
   * `openRoleSession`——**给出** ⇒ 会话进入确认制收窄（`request_confirmation`/`request_choice` 注册；
   * 未确认路径被 F4 拒）；**缺省** ⇒ `runGovernSession`（CLI 前端）自动补 `createCliCustomerInput()`；
   * 直调本引擎时缺省 = 无客户通道（工具不注册、旧语义）。无人值守（stdin EOF）→ `unavailable` → 未获同意。
   */
  customerInput?: CustomerInputFn;
  /**
   * **自动重 pin（T37，§13.3）**：每轮 su 会话 settle 后，若项目处于**非创世态**（`.ans/project.json`
   * 已存在），自动重扫边界 → 更新 `.ans` 的 pin + manifest（**不重写治理边界文档**）。缺省 `true`
   * ——本引擎即 su 治理会话引擎，重 pin 是其固有职责。创世态为 **no-op**（首次 pin 只在客户确认时写）。
   */
  autoRepin?: boolean;
}

/** 治理会话句柄（**唯一引擎**的产物；两前端只驱动它，不各自实现装配）。 */
export interface GovernanceSessionHandle extends RoleSessionHandle {
  /** 治理角色 id（经 `listProject` 枚举，非硬编码）。 */
  governanceRoleId: string;
  /** 治理职能（trio 四人之一：liaison/proposal/nomination/schedule；single/su 为 undefined）。 */
  governanceFunction?: GovernanceFunction;
  /** 边界来源（项目治理边界，或冷启动创世种子）。 */
  boundarySource: string;
  /** 生效的 acceptance 证据（供前端如实呈现）。 */
  acceptance: Acceptance;
  /** 本次会话的**静态** scope（按治理边界与目标角色给出，供呈现）；**创世（普通目录边界）无目标角色时为
   *  `undefined`**（设计 §12.2）。注：A-3 起，带 `customerInput` 的会话在 gate 层走**确认制动态 writeSet**
   *  （初始为空、经确认发行）——本字段只是呈现用的静态口径，不再是该会话的可写上界。 */
  scope: TaskScope | undefined;
  /** 目标项目目录（透传自输入；缺省 undefined = 装配默认 ans-cli 自身）。 */
  targetDir?: string;
  /** 发送一轮输入；可反复调用（同一会话，不重建）。 */
  send(text: string, opts?: RoleSessionSendOptions): Promise<void>;
  /** 持续的事件流（含 settle 时的 handback 事件）；跨多轮累积。 */
  events(): AsyncIterable<OrchestrationEvent>;
  /** 收口：释放底层会话（幂等）；出错如实抛出。 */
  dispose(): Promise<void>;
}

export interface GovernSessionResult {
  code: number;
  transcript: SessionEvent[];
  /** 目标项目目录（透传；供 CLI 前端/测试如实观察「目标目录经 deps 传递」）。 */
  targetDir?: string;
}

/**
 * **唯一的治理会话引擎**（设计 §10.5）：CLI 与桌面**都经此**开启治理会话。失败即**抛错**
 * （句柄式接口无退出码）——CLI 前端（`runGovernSession`）捕获后以非 0 码返回。
 */
export async function openGovernanceSession(
  input: GovernSessionInput,
  deps: RoleSessionDeps = {},
): Promise<GovernanceSessionHandle> {
  // 1) 发现/校验内置治理角色：数据驱动（同桌面应用），**不硬编码** "su"。
  //    解析顺序（评审 §5.6）：显式 `governanceRoleId` → `governanceFunction` 对应 id →
  //    trio 缺省 rapporteur / single 缺省 su。非法组合由 `resolveGovernanceRole` 抛明确文案。
  const resolvedGov = await discoverGovernanceRole(input.project, {
    function: input.governanceFunction,
    roleId: input.governanceRoleId,
  });
  const govId = resolvedGov.roleId;
  const spec = governanceRoleOf(govId);

  // 2) 解析**项目治理边界**（对不在 project.roles 的治理角色，resolveBoundarySection 走 gov.path）。
  const resolved = await resolveRole(govId, input.project);
  const boundary: BoundarySection1 = resolved.boundary;
  // 边界解析失败 / pin 失配（parseError 非空）→ 整体失败（对齐 §5.2「改边界致 pin 失配 → 拒一切写」）。
  if (typeof boundary.parseError === "string" && boundary.parseError !== "") {
    throw new Error(`治理边界解析失败：${boundary.parseError}`);
  }

  // 3) scope：按治理边界的条件目录给出可写集（见文件头「为何给精确文件」）。
  //    注（A-3）：带 `customerInput` 的会话在 openRoleSession 内走**确认制动态 writeSet**（本处的静态
  //    scope 不参与 gate，仅随句柄呈现）；无通道的直调保持旧语义。
  const roleIds = input.targetRoleIds ?? [];
  const scope = buildGovernScope(boundary, roleIds);
  // §12.2：**普通目录边界（创世种子）在无目标角色时，scope 应为 `undefined`**（普通聊天、不做 F4 收窄）。
  // 若照旧传 `{writeSet:[], conditions:[]}`，F4 会「空 writeSet = 拒一切」→ su 一个字也写不了
  // （与 §12.2「su 的 scope 保持 undefined」相悖）。此收窄**只**在 `conditions` 与 `writeSet` 均空时生效，
  // 不会放宽任何既有 project-mode（含条件目录 / 有目标角色）的判定。
  const effectiveScope: TaskScope | undefined =
    scope.conditions.length === 0 && scope.writeSet.length === 0 ? undefined : scope;

  // 4) 经会话式入口开启内置治理角色（builtInRoles 数据来自枚举；不硬编码 id）。
  //    `customerInput`（A-3）：原样透传——有通道 ⇒ 确认制收窄（未确认路径被 F4 拒）；缺省 ⇒ 旧语义。
  //    `autoRepin`（A-4）：透传给会话式入口——**每轮 su settle 后**自动收尾/重 pin（判据/写入都在
  //    `openRoleSession` 一处，两前端共用；未显式给则按其缺省 = su 会话开启）。
  const sessionProject = withGovernanceRole(input.project, govId);
  const handle = await openRoleSession(
    {
      roleId: govId,
      runtime: input.runtime,
      persistSession: input.persistSession,
      project: sessionProject,
      taskId: input.taskId,
      scope: effectiveScope,
      customerInput: input.customerInput,
      autoRepin: input.autoRepin,
    },
    deps,
  );

  return {
    get runtime() { return handle.runtime; },
    get roleId() { return handle.roleId; },
    get contextSource() { return handle.contextSource; },
    get nativeSessionId() { return handle.nativeSessionId; },
    get contextWarning() { return handle.contextWarning; },
    get persistenceMode() { return handle.persistenceMode; },
    retryReportPersistence: (id) => handle.retryReportPersistence!(id),
    getReportPersistence: (id) => handle.getReportPersistence!(id),
    retryDeliveryHistoryPersistence: (id) => handle.retryDeliveryHistoryPersistence!(id),
    getDeliveryReceipt: (id) => handle.getDeliveryReceipt!(id),
    onPersistenceChange: (listener) => handle.onPersistenceChange!(listener),
    abort: () => handle.abort!(),
    // 会话级后台任务访问面（2026-10-25，桌面任务面板）：与底层句柄同一**纯透传**口径——
    // 底层缺席 ⇒ 本句柄属性缺席（不伪造空实现）；stop 的结果/异常原样返回（不吞 ok:false）。
    ...(handle.listBackgroundTasks !== undefined
      ? { listBackgroundTasks: (): BackgroundTaskSnapshot[] => handle.listBackgroundTasks!() }
      : {}),
    ...(handle.readBackgroundTask !== undefined
      ? {
          readBackgroundTask: (
            taskId: string,
            readOptions?: BackgroundTaskReadOptions
          ): BackgroundTaskReadResult | undefined => handle.readBackgroundTask!(taskId, readOptions),
        }
      : {}),
    ...(handle.stopBackgroundTask !== undefined
      ? {
          stopBackgroundTask: (
            taskId: string,
            stopOptions?: BackgroundTaskStopOptions
          ): Promise<BackgroundTaskStopResult> => handle.stopBackgroundTask!(taskId, stopOptions),
        }
      : {}),
    governanceRoleId: govId,
    ...(spec !== undefined ? { governanceFunction: spec.function } : {}),
    boundarySource: resolved.boundarySource,
    acceptance: boundary.acceptance,
    scope: effectiveScope,
    targetDir: input.targetDir,
    send: (text, opts) => handle.send(text, opts),
    events: () => handle.events(),
    dispose: () => handle.dispose(),
  };
}

/**
 * 发现/校验内置治理角色 id：经门禁引擎 `listProject` 枚举 + Service 的 `resolveGovernanceRole`
 * 统一判定（评审 §5.6；编排不另写一份模型/职能映射）。
 *
 * `ProjectConfig.governanceModel` 显式给出时优先于磁盘枚举——装配（config-loader）注入的模型是
 * 本次会话的权威；未给出则用 `listProject` 的推断（旧项目 single / 新空项目 trio）。
 */
async function discoverGovernanceRole(
  project: ProjectConfig,
  opts: { function?: GovernanceFunction; roleId?: string },
): Promise<{ roleId: string; function: GovernanceFunction | null }> {
  const listing = await listProject(project.projectRoot);
  const effective =
    project.governanceModel !== undefined
      ? { ...listing, governanceModel: project.governanceModel }
      : listing;
  const resolved = resolveGovernanceRole(effective, opts);
  // 兜底：resolveGovernanceRole 已保证 trio 四人之一 / single su；此处只防御空 id。
  if (typeof resolved.roleId !== "string" || resolved.roleId === "") {
    throw new Error(`未解析出治理角色（listProject 未枚举到 builtIn 角色）；项目根：${project.projectRoot}`);
  }
  return { roleId: resolved.roleId, function: resolved.function };
}

/**
 * CLI 一次性前端（保留既有形状）：开启治理会话 → 记录元信息 → 发一轮 → 以 `settled` 收口 → dispose。
 * **装配/驱动逻辑全部在 `openGovernanceSession`**；本函数只是它之上的一层「跑一轮」的壳。
 * A-4 起**没有收口步骤**——su 经客户确认写出的产物，由每轮 settle 后的**自动收尾**写盘（见 run-role.ts）。
 */
export async function runGovernSession(
  input: GovernSessionInput,
  deps: RoleSessionDeps = {},
): Promise<GovernSessionResult> {
  const transcript: SessionEvent[] = [];
  const record = (ev: OrchestrationEvent): void => {
    // 治理角色（su）不自我回交（回交主体是**其他角色**）；防御性忽略。
    if (ev.kind === "handback") return;
    transcript.push(ev);
    console.log(formatEvent(ev));
  };
  const fail = (code: number, reason: string): GovernSessionResult => {
    process.stderr.write(`ans govern 失败：${reason}\n`);
    transcript.push({ kind: "message", summary: `失败：${reason}` });
    return { code, transcript, targetDir: input.targetDir };
  };

  // CLI 端默认客户通道（A-1/A-5）：确认 y/n、勾选数字序号（单选 `1`、多选 `1,3`）。**仅在未注入时**补——
  // 桌面/测试注入自己的通道。惰性 attach stdin（仅真被调用时）；无人值守（EOF）→ unavailable → 未获同意
  // （fail-closed：不发行 writeSet ⇒ 未确认路径的写入照旧被 F4 拒）。
  const effectiveInput: GovernSessionInput =
    input.customerInput !== undefined ? input : { ...input, customerInput: createCliCustomerInput() };

  // 开启引擎（发现治理角色 / 解析边界，失败即抛错 → 非 0）。
  let handle: GovernanceSessionHandle;
  try {
    handle = await openGovernanceSession(effectiveInput, deps);
  } catch (err) {
    return fail(EXIT_FAILURE, errText(err));
  }

  // 文案数据驱动（评审 §5.6）：角色显示名/预授权目录/职能一律读注册表，**不再把 su 写死**；
  // 单人旧模型（su）的显示名回退为「内置治理角色」，行为不变。
  const roleSpec = governanceRoleOf(handle.governanceRoleId);
  const roleLabel = roleSpec?.displayName ?? "内置治理角色";
  const preauthorizedDirs = roleSpec?.preauthorizedDirs ?? LEGACY_SU_PREAUTHORIZED_DIRS;
  // 2026-10-25 客户规则（「写自己角色权限内的路径，直接放行」）：**无任务级 scope 收窄**时，trio
  // 五角色的写盘预授权来源是 **Section 1 条目**（含 `docs/workflow.md` 这类精确文件，不再是
  // preauthorizedDirs 的目录子集）；有 scope 时保留既有 preauthorizedDirs 子集（不并入 Section 1，
  // 与 openRoleSession 的 gate 同口径）。旧 su 仍是四棵预授权目录（2026-10-16 裁定，A-3 逐字不变）。
  const section1Preauthorized = roleSpec !== undefined && handle.scope === undefined;
  const preauthorizedWrites: readonly string[] =
    section1Preauthorized ? roleSpec!.entries.map((entry) => entry.path) : preauthorizedDirs;
  const preauthorizedLabel = section1Preauthorized ? "Section 1 预授权" : "预授权目录";
  // 治理职能 → 权力文案（数据驱动；Liaison 是沟通权，不是决定权）。
  const functionLabel =
    roleSpec !== undefined
      ? `；治理职能 ${roleSpec.function}（${GOVERNANCE_FUNCTION_LABEL[roleSpec.function]}，不拥有最终批准权）`
      : "";
  record({
    kind: "message",
    summary:
      `治理会话：${roleLabel}（${handle.governanceRoleId}${functionLabel}），边界来源 ${handle.boundarySource}；acceptance=${
        handle.acceptance.accepted ? "accepted" : "rejected"
      }（来源：${handle.acceptance.source || "缺"}）` +
      (handle.targetDir ? `；目标目录 ${handle.targetDir}` : ""),
  });
  const roleIds = input.targetRoleIds ?? [];
  // 与 `openRoleSession` 的 gate 同口径（W6-A）：能力矩阵 `customerInput=false` 的角色（Liaison）
  // 即便前端给了客户通道也不进入确认制——`request_confirmation`/`request_choice` 结构性不注册。
  const confirmationMode =
    effectiveInput.customerInput !== undefined &&
    (roleSpec === undefined || roleSpec.capabilities.customerInput);
  record({
    kind: "message",
    summary: confirmationMode
      ? `客户确认制：${roleLabel} 写盘前须先经 request_confirmation（预览）获客户确认；未确认路径的写入会被门禁在写入前拒绝` +
        `（${preauthorizedLabel} ${preauthorizedWrites.map((dir) => `\`${dir}\``).join("、")} 属初始写集、无需逐次确认可直接写；` +
        "治理敏感写入仍由治理门禁要求既有客户决定卡）。" +
        (roleIds.length > 0 ? `（目标角色：${roleIds.join("、")}）` : "")
      : handle.scope
        ? `治理边界条件目录已声明：conditions=[${handle.scope.conditions.join(", ")}]；` +
          `可写集 ${handle.scope.writeSet.length} 项` +
          (roleIds.length > 0 ? `（目标角色：${roleIds.join("、")}）` : "（未指定目标角色：无可写文件，仅按边界只读）")
        : "未声明 scope（创世/普通目录边界：仅按边界，不做任务收窄）",
  });

  let code: number = EXIT_OK;
  try {
    await handle.send(
      input.prompt ??
        buildGovernPrompt(input.taskId, roleIds, {
          canWrite: confirmationMode || handle.scope === undefined,
          confirmFirst: confirmationMode,
          spec: roleSpec,
          section1Preauthorized,
          preauthorizedDirs,
        }),
    );
    for await (const ev of handle.events()) {
      record(ev);
      if (ev.kind === "settled") {
        if (isFailedSettlement(ev)) code = EXIT_FAILURE;
        break;
      }
    }
    // A-4：不再有 finalize 步骤——su 在本轮经客户确认写出的产物，已由 settle 触发的**自动收尾**
    // （openRoleSession 内的 repinIfBootstrapped 含首次）写出 `.ans` + 治理边界文档 + manifest。
  } catch (err) {
    code = EXIT_FAILURE;
    process.stderr.write(`ans govern 会话失败：${errText(err)}\n`);
    transcript.push({ kind: "message", summary: `会话异常：${errText(err)}` });
  } finally {
    try {
      await handle.dispose();
    } catch (err) {
      process.stderr.write(`ans govern 释放会话失败：${errText(err)}\n`);
      transcript.push({ kind: "message", summary: `释放会话失败：${errText(err)}` });
      if (code === EXIT_OK) code = EXIT_FAILURE;
    }
  }

  return { code, transcript, targetDir: handle.targetDir };
}

/**
 * 由治理边界与目标角色构造 scope：
 *  - conditions = 边界里所有 conditional-directory 的 slug（激活治理区域；缺 slug 的条目跳过，fail-closed）；
 *  - writeSet   = 每个目标角色在 `角色卡/<id>/` 下的标准文件（F4 为精确匹配，故须枚举具体文件）。
 */
export function buildGovernScope(boundary: BoundarySection1, roleIds: string[]): TaskScope {
  const conditions = boundary.entries
    .filter((e) => e.kind === "conditional-directory" && typeof e.condition === "string")
    .map((e) => e.condition as string);
  const writeSet = roleIds.flatMap((id) => ROLE_SCAFFOLD_FILES.map((f) => `${ROLE_CARD_DIR}/${id}/${f}`));
  return { writeSet, conditions };
}

/** 派生配置：把治理角色 id 并入 builtInRoles（会话式入口据此允许开启它；id 来自枚举，非硬编码）。 */
function withGovernanceRole(project: ProjectConfig, govId: string): ProjectConfig {
  const builtInRoles = [...new Set([...(project.builtInRoles ?? []), govId])];
  return { ...project, builtInRoles };
}

/**
 * shell 面统一口径（客户 2026-10-19 新规则：所有角色都有运行 shell 的权限，包括读写与任意需要
 * 命令的权限，但一律提交审批、按原有流程审批）。与门禁引擎角色卡 `SHELL_APPROVAL_CARD_LINE` 同义，
 * 此处按**治理会话提示词**单独表述（不导入角色卡文案；措辞侧重行为约束：审批 ≠ 写边界扩张）。
 */
const SHELL_APPROVAL_PROMPT_LINE =
  "**shell 审批档（所有内置治理角色统一）**：你的 shell 可读取、写入并执行任意命令；" +
  "只读白名单命令直接执行，其余命令（含读写与任何需要命令的权限）逐条提交客户/判断 agent 审批。" +
  "拒绝、超时、通道不可用一律不放行。**审批不等于写边界扩张**：审批只针对当次命令，不改变你的职责与 " +
  "Section 1 写边界；写文件仍优先用 `write_file` 并经写盘确认（shell 命令的文件副作用不经写入门禁，" +
  "审批卡是唯一控制）。";

/**
 * 工程质量基线（客户 2026-10-19 批准，原话「可以，按你说的改」）。
 *
 * 与门禁引擎五张内置治理角色卡里的同一基线**逐字一致**——其单一来源在
 * `src/common/门禁引擎/governance-roles.ts` 的角色卡文案常量。编排不得导入其他角色的私有 common，
 * 故在本层**逐字复制**一份；**改文案时两处必须同步**（门禁引擎角色卡 / 本治理会话提示词）。
 *
 * 默认生产级；客户明确选择原型档才可放宽。治理会话在**意图、提案、流程、验收**各阶段都受同一
 * 基线约束——single/su 由 `ENGINEERING_QUALITY_STAGE_REQUIREMENTS` 覆盖，trio 由
 * `governanceFunctionDiscipline` 分角色承载。
 *
 * 客户 2026-10-19 新批评（原话「这个感觉也没有啥架构的啊，提案角色应该也要考虑到扩展性，给出一个
 * 架构方案啊。」）：基线新增「架构与可扩展性」一条；本层与门禁引擎基线**同批同步**。
 */
const ENGINEERING_QUALITY_BASELINE = [
  "工程质量基线（默认生产级；客户明确选原型档才可放宽）：",
  "- 正确性：验收标准逐条可演示；无 TODO/占位/假数据；边界与非法输入有明确行为。",
  "- 健壮性：输入校验与上限、错误码一致、失败不破坏已有数据；持久化原子写与重启恢复；并发/重入有明确策略。",
  "- 安全：认证/授权即使简化也要写清边界；防注入/XSS/路径穿越/CSRF；不记录密钥与敏感数据；零第三方依赖时说明理由。",
  "- 可维护性：模块边界清晰、命名一致、只在约束处注释；README 含启动、架构、API、权限、状态机、已知限制与权衡。",
  "- 架构与可扩展性：模块分解与职责、依赖方向（无环）、数据流清晰；扩展点明确（新增状态/角色/导出格式/统计维度时改哪里、不改哪里）；数据 schema 与 API 契约有版本/迁移/兼容/弃用策略；横切关注点（配置/错误/日志/鉴权/测试缝）有归属；变更类提案必须附架构影响分析（模块/边界/兼容/回滚）。",
  "- 可观测性：关键失败可诊断（结构化日志/错误信息），不静默吞错。",
  "- 性能与容量：分页/上限/超时明确；不无限增长；给出已知容量边界。",
  "- 前端：加载/空/错误态齐备；键盘可用、标签与对比度等基本可访问性；窄屏可用。",
  "- 测试：单元+集成+端到端矩阵；权限与非法路径必须有负例；测试独立于实现；不得为保绿弱化断言。",
  "- 交付：验收前必须真实启动应用并演示（启动命令、访问地址或截图/录屏）；未真实运行不得建议验收通过。",
].join("\n");

/**
 * 架构与可扩展性阶段要求（客户 2026-10-19 新批评原文：「这个感觉也没有啥架构的啊，提案角色应该也要
 * 考虑到扩展性，给出一个架构方案啊。」）。
 *
 * 与门禁引擎 `src/common/门禁引擎/governance-roles.ts` 的「架构与可扩展性」基线条及五张内置治理
 * 角色卡的架构职责**成对同步**：同一份口径的两份物理副本（分层禁止导入其他角色私有 common），
 * 任一侧改文案必须同批同步。single/su 一份提示覆盖全部治理阶段，故在本块给出 Draft/Steward/Proof
 * 各阶段职责；trio 同样追加本块（与质量基线并列），角色纪律再补充各自工序。
 */
const ARCHITECTURE_EXTENSIBILITY_REQUIREMENTS = [
  "**架构与可扩展性要求（提案 / 流程 / 验收三阶段）**：",
  "- Draft（提案）：新项目提案必须含「架构方案」章节，既有项目的变更提案必须含「架构影响分析」章节；",
  "  内容覆盖模块分解与职责、依赖方向（无环）、数据流、扩展点（新增状态/角色/导出格式/统计维度时改哪里、",
  "  不改哪里）、数据 schema 与 API 契约的版本/迁移/兼容/弃用策略、横切关注点（配置/错误/日志/鉴权/",
  "  测试缝）归属、权衡与备选；章节缺失或只有标题/空话 ⇒ 不得建议 accept。",
  "- Steward（流程 / 派发）：流程单与派发任务必须引用架构方案或架构影响分析中的模块与边界；",
  "  跨模块/改契约的步骤须安排契约冻结与集成/端到端验证；扩展点必须有覆盖步骤。",
  "- Proof（验收）：逐项核对实现与架构声明一致——模块边界与依赖方向未被破坏、schema/API 版本与迁移",
  "  按声明落地、扩展点可用；提案缺架构章节或实现偏离声明 ⇒ 不得建议 accept，只能退回或要求补充证据。",
].join("\n");

/**
 * 标准工作流（客户 2026-10-19 反馈，原话：「这个独立核准应该是标准流程，而不是我在发给他。」
 * 「内置角色应该有自己的工作流。」）——阶段流转与独立核准都属于应用的**标准流程**，不是客户
 * 逐次手动转交/触发的动作。
 *
 * 与门禁引擎五张内置治理角色卡（Lead / Draft / Crew / Steward / Proof）的「标准工作流」章节
 * **成对同步**：单一来源在 `src/common/门禁引擎/governance-roles.ts` 的角色卡文案。分层规则禁止
 * 导入其他角色的私有 common，故在本层**复制**一份并注明来源；任一侧改文案必须同批同步。
 * 本块是治理会话提示（CLI `ans govern` 与经 `runGovernSession` 的前端）的行为约束，不改变任何
 * 门禁判定：2026-10-24 客户修订（撤销「仅发布版本」口径）——**所有变更（含非发布）**在流程齐备后，
 * 应用都按验收门派 Proof / 验收；`release` 仅可选发布元数据，不是启动条件。内置角色状态/回交向
 * 主理汇总，主理只协调不批准；提示**不承诺**未实现的自动推进（步骤 done 不会自动派下一步）。
 * 验收仍由 Proof 核对 + 客户/判断 agent 决定。
 *
 * 2026-10-24 后续收紧：验收标准门对所有声明 `acceptance-criteria` 步骤的新契约 flow 生效（含非发布），
 * 读取 `-criteria-vN` 最新版本（v1 不再硬编码）；
 * P1-7 `dispatched → delivered` 只能由步骤 owner 标记，Steward/Lead 不代标 delivered，worker 不能 done；
 * P1-6 revision 冲突由应用只读预检后单次重试（`flow.conflict.retry`），提示仍要求冲突时先重读。
 * 2026-10-26 客户规则：主理收到 `[系统·治理协调]`、gate pass/fail 系统行、交付/阻塞通知等**系统消息**时
 * 只向客户汇报，不得据此给统筹（Steward）发任务/`dispatch_task`、不得改写成协调任务；客户明确要求或由
 * 客户消息触发的协调仍按原规则。门禁角色卡文本由门禁引擎属主同步（本角色不改卡）。
 * 2026-10-26 流程骨架：应用在意图交接时可能已创建 `status: skeleton` 的通用骨架；本提示的单行与门禁引擎
 * 运营卡「流程骨架与完整流程（仅初始创建 / 骨架替换）」成对（物理副本，改文案须同批）。
 */
const STANDARD_WORKFLOW_PROMPT = [
  "**标准工作流（阶段流转由应用负责）**：内置角色按标准工作流执行——意图确认 → 提案与契约 → 团队计划与客户任命 → Crew 写角色卡与角色就绪 → 流程与派发 → 独立验收（所有变更，含非发布）；",
  "trio 依次由 产品 / Lead、策划 / Draft、运营 / Steward、人事 / Crew、质检 / Proof 承担（Steward 先写团队计划并发任命卡，客户任命后由 Crew 按计划写卡），single/su 由同一治理角色按同一顺序推进。**两层执行与汇报**：Draft/Steward/Crew/Proof 的状态与回交向 产品 / Lead 汇总，项目 worker 的回交仍归 Steward；**产品只做治理协调，不批准提案/任命/验收，不直接派 Crew/Proof，不写验收报告**；项目 worker 仍由 Steward 派。",
  "**流程状态唯一机器状态**：`docs/flows/<flowId>.yaml`（同名 `.md` 仅人读视图，不得承载门禁状态）；步骤必须显式写 `kind` / `evidence` / `supersedes`；新流程使用 step id `team-plan` / `appointment` / `role-cards` / `role-readiness` / `acceptance-criteria` / `change-package`（kind 仍为现有 dispatch / customer-decision / artifact / acceptance）；保留 id `verification` / `acceptance`（`kind: acceptance`，初始 `status: pending`，由应用在流程齐备后按验收门派 Proof（所有变更，含非发布；`release` 不是启动条件），不得占用、不得标 `done`）。",
  "**流程骨架与一次性替换（2026-10-26）**：应用可能在意图交接时已创建 `status: skeleton` 的通用流程骨架（只含 contract-freeze / team-plan / appointment / role-cards / role-readiness / acceptance-criteria / change-package / verification，不含项目角色与交付步骤）；运营 / Steward 写团队计划后，用一次 `request_confirmation`（`cardKind=schedule-write`）把骨架**一次性替换**为完整流程（含项目角色、交付步骤与 gate；保留 contract-freeze 已登记证据）；没有骨架时用同一确认初始创建；替换后改用 flow 工具推进，其他角色不得直接写流程 YAML。",
  "**团队计划（2026-10-22 第 1 项）**：Steward 先写 `docs/scheduling/<flowId>-team-v1.md`（frontmatter flowId/version/riskTier/`recommended: [role-a, role-b]` 与每个角色的职责目标/能力要求/写集/依赖行），再发 `request_choice(cardKind=appointment)`；计划不完整/flowId 不一致/推荐集为空或含内置角色/选项不覆盖推荐集时，应用**不向客户发卡**并退回 Steward。客户任命后由 Crew 读取计划写卡；Crew 不选角色、不改计划。",
  "**团队计划 v2（角色粒度 / MapReduce）**：新流程写 `teamPlanSchema: 2`、frontmatter `modules: [module-a, module-b]`（内联数组、ASCII slug、非空无重复）与「模块清单」表（module/职责/公开契约/架构来源）；角色表 14 列 roleId/类型/module/职责目标/能力要求/唯一写集/公开契约/测试面/依赖/dependsOn/并行组/组别/apiSpec/粒度理由。默认一个模块一个角色、写集跨角色两两不相交（精确路径/目录，不用通配符）、dependsOn 无环、同 map 组无依赖、Reduce 覆盖全部 Map；整层名/多模块必须写「粒度理由」并交 readiness 例外复核。旧计划（无 `teamPlanSchema: 2`）按 v1 兼容，不强制迁移。",
  "**团队计划 v3（目录级授权，2026-10-23）**：新流程优先写 `teamPlanSchema: 3`（v2 字段全部保留）与 frontmatter `directories: [dir-a/, dir-b/]`（非空内联数组；项目相对、以 `/` 结尾、无通配符/`..`/绝对路径、无重复；不得与治理关键路径重叠）。模块清单每个 module 必须写非空 `实现目录`（Q9 A；不得写 `—`），角色 implementation/tests/docs 目录必须在对应模块实现目录内或等于模块目录；角色表用 `授权目录` + `精确写集` 两列（`唯一写集` 仅作 v3 兼容别名并带 warning；`边界` 列名在 v3 不再接受）；正文必须有「目录规范」表（目录/owner/类型/用途/命名/允许子目录/允许文件类型/公开契约/测试面/依赖/禁写区/共享），每个目录恰好一个 owner、目录不得相同/互为祖先或子目录；共享目录用 none/read-only/split（split 父目录本身不分配、子目录各有 owner）；治理关键路径（`.ans/`、`角色卡/`、`docs/scheduling|acceptance|communication|flows|nominations|verification/`、`src/common/shared/`、release/packaging、`.env`/密钥、`src/model/` 根单例契约）只能精确文件授权，不得作为普通 `授权目录`。执行角色可在规范允许的命名/子目录/文件类型内自行新建文件/子目录；不得跨目录、不得改规范、不得写他人目录。应用只做 V-D1–V-D9 确定性校验；目录是否内聚、规范是否合理、共享是否必要、契约/测试面是否真实由 readiness 逐目录复核（结构通过不等于语义正确）。旧 v1/v2 计划保持原行为，不强制迁移。",
  "**Map/Reduce 与 flow（方案 A）**：flow step 可选 `parallelGroup: map-<slug> | reduce` 与 `dependsOn: [step-id]`（不新增 `kind`）；Map 交付步骤 id 用 `delivery-<module>` 并先依赖 `contract-freeze`；Reduce 步骤等全部 Map `done` 后再跑契约/集成/e2e。dispatch 门禁会硬拦前置未 `done` 的派发，不改变派发权归属；旧 flow 不填字段行为不变。",
  "**测试分片与证据（Reduce）**：测试角色按模块并行分片，每分片使用独立临时项目根/端口/输出目录/日志并留原始证据；不得共享可变夹具、不得并发写同一文件。Reduce 合并 manifest（候选哈希/分片清单/命令/日志路径/结果/环境）后跑契约/集成/e2e 与真实启动演示，`verification-evidence` 步骤指向 manifest。",
  "**客户不做内部调度**：阶段流转与门禁由应用负责；**应用不承诺自动推进下一步**（步骤 done 不会自动触发下一步派发），内置角色用 `flow_get` / `flow_step_update` / `flow_step_supersede` 与 `dispatch_task` 按门禁推进，产品只协调不批准；客户只在需要客户决定的事项（提案接受、任命、写盘确认、验收动作）上做决定，不需要逐阶段手动转交或触发。",
  "**产品收到系统消息时只向客户汇报（2026-10-26 客户规则）**：`[系统·治理协调]`、gate pass/fail 系统行、交付/阻塞通知等由应用投递的**系统消息不是客户指令**——产品（Lead / liaison）只向客户如实汇报，**不得据此给运营（Steward）发任务、不得 `dispatch_task`（也不得派项目 worker）、不得把系统通知改写成协调任务**；只有客户明确要求、或由客户消息触发的协调，才按原规则协调/派发。系统消息不代表客户批准、不构成新任务。",
  "**验收标准（2026-10-22 第 3 项；2026-10-24 修订：所有变更）**：所有**声明了 `acceptance-criteria` 步骤的新契约 flow YAML**（含非发布；`release` 不是前提）在实施派发前要求 `docs/acceptance/<flowId>-criteria-vN.md` 的**最新版本**（扫描取最高 N）存在且结构合格（验收表/风险档位/判定规则/证据计划）；`proposal-accept-quick` 快捷路径保持既有豁免；legacy（无 YAML 或无 `acceptance-criteria` 步骤）没有可定位标准的机器状态，保留原放行。应用在流程准备阶段为所有（含非发布）新契约 flow 自动派 verifier 写标准并复核。",
  "**步骤交付纪律（2026-10-24 P1-7）**：`dispatched → delivered` 只能由**步骤 owner**（项目角色 / worker）标记；Steward / Lead 等 manager **不得代标 `delivered`**，只能在 owner 交付 `delivered` 后核对证据再标 `delivered → done`，或标 `failed` / `blocked`；项目 worker 已注入既有 `flow_get` / `flow_step_update`，只能更新 owner=自己的步骤（delivered / failed / blocked），不能标 `done`；派发时在任务文本写明「完成后用 `flow_get` / `flow_step_update` 标自己的 `delivered`，不要标 `done`」；`failed` / `blocked` 迁移保持既有语义。",
  "**Proof 的标准复核流程（独立核准是标准流程，不是客户手动转交）**：收到验收任务后按序执行：",
  "① 读证据（流程状态 YAML `docs/flows/<flowId>.yaml`、提案/契约、团队计划、变更包 `docs/scheduling/<flowId>-change-v1.md`、交付与回交报告、演示证据路径）；",
  "② 用审批档 shell 跑测试（逐条执行提案声明的单元/集成/端到端测试，命令逐条提交审批并记录输出）；",
  "③ 真实启动演示（执行启动命令、确认可访问，形成截图/录屏证据）；",
  "④ 质量/架构核对（按工程质量基线逐项核对，并核对实现与架构方案/影响分析一致：模块边界、依赖方向、扩展点、schema/API 版本迁移）；",
  "⑤ 验收报告与验收卡（报告写入 `docs/acceptance/<flowId>-report-v1.md`，**首行五项**：风险档位｜判定依据｜选定检查｜复用证据｜全量回归；判定/详细证据附件写 `docs/verification/`；再发 request_choice：cardKind=acceptance、选项 accept/reject）。",
  "**档位纪律**：变更包标 T0–T3，团队计划档位为下限；Proof 可升档、不能降档；报告档位不得低于变更包档位；全量回归只在 T3 或证据不足时执行；T0–T3 定义以技能 `references/testing.md` 为唯一口径（`qualityTier` 不是风险档位）。",
  "**独立验收门（2026-10-24 修订：所有变更）**：流程齐备（执行步骤全部 done 且按显式 `kind` 与账本证据对账、无未结算决定、验收步骤 pending）后，应用对**所有变更（含非发布）**按验收门派发 质检 / Proof 并复核实施前标准；`release` 仅可选发布元数据，**不是独立验收的启动条件**。需要标注发布版本时，由 Steward 用既有 `request_confirmation`（`cardKind=schedule-write`）写一份只把 `release` 从 false/缺省改为 true、其余字段/步骤不变的 flow YAML，经客户/判断 agent 确认；产品不得代批、不得直接派 Proof。",
  "验收派发不是验收决定——验收卡仍由 Proof 核对后发出，由客户/判断 agent 决定；应用不承诺自动推进下一步。",
].join("\n");

/**
 * single/su 的阶段要求（su 一份提示覆盖全部治理阶段；trio 由 `governanceFunctionDiscipline` 分角色
 * 承载同一约束）。与基线一起追加，确保模型在意图/提案/流程/验收各阶段都受约束。
 */
const ENGINEERING_QUALITY_STAGE_REQUIREMENTS =
  "**质量阶段要求（同一基线贯穿全程）**：意图阶段先与客户确认质量档位（默认生产级；只有客户明确选择" +
  "原型档才可放宽，并写明放宽项）；提案须含质量基线与证据计划；派发/流程须写清质量与演示要求；" +
  "验收未真实启动并演示时不得建议 accept。";

/** 默认任务提示：给出明确、可判定的变更要求（在治理边界内创建目标角色）。
 *  `canWrite`：本次会话是否**真能写**（`scope` 未声明 = 创世/普通目录边界，命中治理产物目录即放行）。
 *  创世下 su 需**据对话决定**建哪些角色，故给出「可直接写治理产物」的指引——**不**误报「不写盘」。
 *  `confirmFirst`（A-3）：**客户确认制**会话——写明「先把预览（角色卡全文 + 边界摘要 + **将要写出的
 *  具体路径**）经 request_confirmation 请客户确认，拿到 confirmed:true 后才写；未确认路径会被门禁拒」。
 *
 *  trio（评审 §5.6）：按 `governanceFunction` 追加提案/提名/编排各自纪律；文案**不写「已批准/已授权」**，
 *  只说「等待客户决定」。single/su 的旧文案逐字保留（旧项目行为不变），仅按客户 2026-10-19 新规则
 *  在两类提示后统一追加 `SHELL_APPROVAL_PROMPT_LINE`（所有内置治理角色 shell 审批档）。
 *  客户 2026-10-19 批准（「可以，按你说的改」）：两类提示同时追加 `ENGINEERING_QUALITY_BASELINE`
 *  （与门禁引擎角色卡逐字一致）；single/su 另加 `ENGINEERING_QUALITY_STAGE_REQUIREMENTS`，trio 由各
 *  角色纪律分别给出意图档位 / 提案证据计划 / 流程演示要求 / 验收不得未演示建议 accept。
 *  客户 2026-10-19 新批评（「提案角色应该也要考虑到扩展性，给出一个架构方案」）：两类提示在基线之后
 *  追加 `ARCHITECTURE_EXTENSIBILITY_REQUIREMENTS`（与门禁引擎基线「架构与可扩展性」条成对同步），
 *  明确 Draft（架构方案/影响分析）、Steward（流程/派发引用架构边界）、Proof（验收核对实现与声明一致）
 *  各阶段职责；提案缺架构章节或空洞时不得建议 accept。
 *  客户 2026-10-19 新反馈（「这个独立核准应该是标准流程，而不是我在发给他。」「内置角色应该有自己的
 *  工作流。」）：两类提示在角色纪律/任务要求之前追加 `STANDARD_WORKFLOW_PROMPT`——阶段流转由应用负责、
 *  内置角色按标准工作流执行、客户不做内部调度；Proof 按「读证据 → 审批档 shell 跑测试 → 真实启动演示
 *  → 质量/架构核对 → 验收卡」标准复核。2026-10-24 修订（撤销「仅发布版本」口径）：所有变更（含非发布）
 *  在流程齐备后都由应用按验收门派 Proof / 验收，`release` 仅可选发布元数据、不是启动条件；内置状态/
 *  回交向主理汇总，主理只协调不批准；提示不承诺自动推进。
 *  该块与门禁引擎角色卡「标准工作流」章节成对同步（单一来源在其注册表卡文本）。 */
function buildGovernPrompt(
  taskId: string,
  roleIds: string[],
  opts: {
    canWrite: boolean;
    confirmFirst: boolean;
    spec?: BuiltInGovernanceRoleSpec;
    /** 无任务级 scope 收窄 ⇒ Section 1 全量预授权（与编排 gate 同口径）。 */
    section1Preauthorized: boolean;
    /** 有任务 scope 时仍免确认的既有预授权目录（trio 注册表；su 分支不用本项）。 */
    preauthorizedDirs: readonly string[];
  },
): string {
  // —— single/su：旧文案逐字保留（旧项目行为不变；末行追加 2026-10-19 shell 审批档口径）——
  if (opts.spec === undefined) {
    const confirmRule = opts.confirmFirst
      ? "\n**客户确认制**：写盘前必须先用 `request_confirmation` 把预览（角色卡全文 + 边界摘要，" +
        "**并列出将要写出的具体路径**——路径是发行凭据，没列出的路径写不进去）请客户确认；" +
        "拿到明确同意（confirmed:true）后才写；未获同意/通道不可用 → 不写盘、如实告知。" +
        "（例外：`docs/su/`、`docs/contracts/`、`docs/skills/`、`docs/mcp/` 为预授权目录——属初始写集，可直接写、无需确认。）"
      : "";
    const head =
      `任务 ${taskId}：以治理身份在**项目治理边界**内工作。` +
      "越出治理边界（`角色卡/`、`docs/`、`.ans/` 之外，如项目的 `src/`，或项目根以外）的写入会在写入之前被门禁拒绝。" +
      "\n" + SHELL_APPROVAL_PROMPT_LINE;
    // 客户 2026-10-19 批准：同一工程质量基线贯穿单/三权治理会话；single/su 另附阶段要求与架构要求。
    const quality =
      "\n" + ENGINEERING_QUALITY_BASELINE + "\n" + ENGINEERING_QUALITY_STAGE_REQUIREMENTS +
      "\n" + ARCHITECTURE_EXTENSIBILITY_REQUIREMENTS;
    // 客户 2026-10-19 反馈：标准工作流与自动派发同样是应用的标准流程，不是客户逐阶段手动调度。
    const workflow = "\n" + STANDARD_WORKFLOW_PROMPT;
    if (roleIds.length === 0) {
      return opts.canWrite
        ? head + confirmRule + workflow +
            "\n未指定目标角色：请**据对话决定要建哪些角色**，逐一向客户确认后写出治理产物——" +
            "`角色卡/<角色>/role-card.md`、`角色卡/<角色>/boundary.yaml`、`角色卡/<角色>/memo.md`。" +
            "项目治理边界文档 `角色卡/governance-boundary.yaml` 由编排的自动收尾写出，无需你写。" +
            quality
        : head + workflow + "\n本次未指定目标角色（--role）：可写集为空，会话只做调查/规划，不写盘。" + quality;
    }
    const targets = roleIds.map((id) => `角色卡/${id}/（role-card.md / boundary.yaml / memo.md）`).join("；");
    return (
      `${head}${confirmRule}${workflow}\n具体改动要求：请为角色 ${roleIds.join("、")} 建出标准骨架文件：${targets}。` +
      (opts.confirmFirst
        ? "先经 request_confirmation 预览（含这些路径）获客户确认，再写；未确认路径会被拒。"
        : "用 write_file 写出上述文件（越界或可写集外的写入会被拒）。") +
      quality
    );
  }

  // —— trio：注册表驱动的角色纪律（不写「已批准」；不自我回执客户决定）——
  const spec = opts.spec;
  const writable = spec.entries.map((entry) => `\`${entry.path}\``).join("、");
  // 2026-10-25 客户规则（原文「写自己角色权限内的路径，直接放行」）：**无任务 scope 收窄**时
  // Section 1 内写入是预授权，直接写、不逐次确认；`request_confirmation` 只保留给治理敏感写入
  // （角色卡 / 边界变更、他人写集、`docs/flows/**` 流程 YAML / 治理账本、发布 / 变更包等）与需要
  // 客户拍板的事项——这些仍由治理门禁在写盘前要求既有客户决定卡，预授权不绕过任何门禁。
  // 有任务 scope 时保持旧确认制口径（既有 `preauthorizedDirs` 子集照旧免确认，其余须确认）。
  const preauth = opts.preauthorizedDirs.map((dir) => `\`${dir}\``).join("、");
  const confirmRule = opts.confirmFirst
    ? opts.section1Preauthorized
      ? "\n**写入预授权（客户 2026-10-25 规则）**：你的 Section 1 边界内写入是预授权的——直接用 " +
        "`write_file` / `edit_file` 写，**不需要逐次发 `request_confirmation` 写卡**；写权上界仍由 WriteGate " +
        "的边界判定保证（边界外照旧拒绝）。`request_confirmation` 只保留给治理敏感写入与需要客户决定的动作：" +
        "角色卡 / 边界变更、共享目录或他人写集、`docs/flows/**` 流程 YAML / 治理账本、发布 / 变更包等仍按" +
        "既有禁止与审批规则处理（如 appointment-write / schedule-write 仍须对应客户决定卡）。"
      : "\n**客户确认制**：写盘前必须先用 `request_confirmation` 把预览（内容摘要 + **将要写出的具体路径**）" +
        "请客户确认；拿到 confirmed:true 后才写；未获同意/通道不可用 → 不写盘、如实告知。" +
        (preauth.length > 0
          ? `（既有预授权目录 ${preauth} 属初始写集，可直接写、无需确认；其余路径未确认 = 拒绝。）`
          : "（本角色没有预授权目录：所有写盘都须先确认。）")
    : "";
  const head =
    `任务 ${taskId}：你是内置治理角色「${spec.displayName}」，在注册表的 Section 1 内工作（可写：${writable}）。` +
    "越界写入（含 `.ans/**`、其他治理角色资料、`角色卡/governance-boundary.yaml`、`docs/bootstrap-manifest.md`）" +
    "会在写入之前被门禁拒绝；治理账本对你是只读的。";
  const targets =
    roleIds.length > 0
      ? `\n本次指定目标角色：${roleIds.join("、")}；写这些角色的任何路径仍须先取得客户决定（见下）。`
      : "";
  return (
    `${head}${confirmRule}${targets}\n${STANDARD_WORKFLOW_PROMPT}\n${governanceFunctionDiscipline(spec)}\n` +
    `${ENGINEERING_QUALITY_BASELINE}\n${ARCHITECTURE_EXTENSIBILITY_REQUIREMENTS}\n${SHELL_APPROVAL_PROMPT_LINE}`
  );
}

/**
 * 五角色各自纪律（评审 §5.6/§6.1 + 四角色评审 §4.3）：只描述「怎么产出候选物、需要哪张客户决定卡、
 * 不能做什么」，**绝不写成「已批准/已授权」**——客户决定只由应用签发的确认卡 + 账本表达。
 * 角色名称/职能来自注册表 spec（**不写死 su/rapporteur**）。
 */
function governanceFunctionDiscipline(spec: BuiltInGovernanceRoleSpec): string {
  switch (spec.function) {
    case "proposal":
      return (
        `**提案权纪律（${spec.displayName}，不拥有最终批准权）**：` +
        "提案写入 `docs/proposals/<flowId>-v1.md`（frontmatter: flowId/version/author/status: draft），" +
        "契约写入 `docs/contracts/**`，工作记录写入 `docs/governance/rapporteur/**`。\n" +
        "**质量与证据**：提案必须含「工程质量基线」与「证据计划」——逐条说明基线如何落实、如何验证" +
        "（单元+集成+端到端与真实启动演示），不得只写功能描述；证据计划缺失的策划不得建议 accept。\n" +
        "**架构方案/影响分析**：新项目提案必须含「架构方案」，既有项目的变更提案必须含「架构影响分析」；" +
        "覆盖模块分解与职责、依赖方向（无环）、数据流、扩展点（新增状态/角色/导出格式/统计维度时改哪里、" +
        "不改哪里）、数据 schema 与 API 契约的版本/迁移/兼容/弃用策略、横切关注点归属、权衡与备选；" +
        "章节缺失或只有标题/空话的策划不得建议 accept。\n" +
        "若由联络官交接了客户意图（`docs/intents/<intentId>.md`），以文件为准形成提案；信息不足用 " +
        "`request_clarification` 把问题送到主入口（同一 flow 最多 2 轮），不反复追问客户。\n" +
        "向客户请求决定用 `request_choice`，`cardKind=proposal`，`flowId` 必填，选项 id 固定为 " +
        "`accept` / `accept-quick` / `revise` / `reject`；验收用 `cardKind=acceptance`，选项 id " +
        "`accept` / `reject`。非标准 id 不会解锁任何门禁。\n" +
        "你不批准、不任命、不排程、不派发；不得把自己的推荐写成客户决定，不得把 Markdown 的 `status` " +
        "当作客户决定。"
      );
    case "nomination":
      return (
        `**人事/写卡纪律（${spec.displayName}，不拥有最终批准权）**：` +
        "2026-10-22 第 1 项起，Crew **不再选择角色、不再组建团队、不再发任命卡、不再写 `docs/nominations/`**；" +
        "团队判断与团队计划归 Steward（Convener），计划写入 `docs/scheduling/<flowId>-team-vN.md`。\n" +
        "**你的工作**：客户 appointment 决定后，读取团队计划，按任命名单逐角色 `request_confirmation`" +
        "（`cardKind=appointment-write`，逐文件列出将写路径）取得写盘确认，再写 `角色卡/<id>/**` 与配套工作文档" +
        "（`role-card.md`、`boundary.yaml`、`feature-map.md`、`functional-description.md`、`memo.md`、`api-spec.md` 或 `not-applicable` + 理由）；" +
        "boundary 内容严格按团队计划写集，不自行增删；技能/MCP 声明写入 `docs/skills/**`、`docs/mcp/**`，工作记录写入 `docs/governance/nominator/**`。\n" +
        "**v2 读计划**：逐行读取角色的 module/bounded context、公开契约、测试面、dependsOn/依赖、并行组与粒度理由；" +
        "角色卡写清 bounded context、公开契约、独立测试面与上下游依赖；boundary 按计划写集精确落条目；" +
        "不写整层（前端/后端等）或纳米（函数级/单文件/按钮/端点级）角色；计划缺能力细节或粒度理由时停止写卡并报告 Steward，不自行补计划。\n" +
        "**v3 按目录写边界（目录级授权）**：读计划的 `授权目录`/`精确写集`/「目录规范」——每个 `授权目录` 在 boundary 写为 " +
        "`directory` 条目（或条件已声明的 `conditional-directory`），每个 `精确写集` 文件写为 `file` 条目；`new` 角色的边界目录" +
        "（排除 `角色卡/<roleId>/` 角色根）必须与计划 `授权目录` 集合一致、不得更宽；`changed`/`existing` 计划目录必须被边界覆盖，" +
        "更宽部分只能落在该角色模块实现目录/既有职责内；计划目录未被边界覆盖时停止并报告 Steward，不改计划、不改目录规范、不跨目录。" +
        "V12（计划→边界覆盖）在写卡后由应用校验。\n" +
        "**计划缺能力细节**：停止写卡并报告 Steward 补充团队计划，**不自行扩大职责/改边界/发明计划外角色**。\n" +
        "你不批准方案、不排程、不派发；不得声称已获客户批准。"
      );
    case "schedule":
      return (
        `**编排权纪律（${spec.displayName}，不拥有最终批准权）**：` +
        "流程状态写入 `docs/flows/<flowId>.yaml`（**唯一机器状态**；同名 `.md` 仅人读视图），" +
        "步骤必须显式写 `kind` / `evidence` / `supersedes`；新流程使用 step id `team-plan` / `appointment` / " +
        "`role-cards` / `role-readiness` / `acceptance-criteria` / `change-package`（kind 仍为现有 dispatch / " +
        "customer-decision / artifact / acceptance）；保留 id `verification` / `acceptance` " +
        "（`kind: acceptance`，初始 pending，由应用在流程齐备后按验收门派 Proof（所有变更，含非发布）；" +
        "你不占用、不派发、不标 done）；" +
        "项目工作流写入 `docs/workflow.md`，治理工作记录写入 `docs/governance/convener/**`。\n" +
        "**团队计划（2026-10-22 第 1 项，你的新增职责）**：写 `docs/scheduling/<flowId>-team-v1.md`" +
        "（frontmatter `flowId`/`version`/`riskTier`/`recommended: [role-a, role-b]`；角色表含 roleId/职责目标/" +
        "能力要求/唯一写集/依赖），再 `request_choice`（`cardKind=appointment`，`flowId`，选项 id = 推荐角色 id，" +
        "推荐多个时 `multiple:true`）取得客户任命；计划缺项/flowId 不符/推荐集为空或含内置角色/选项不覆盖推荐集时" +
        "应用不会发卡。客户任命后由应用派 Crew 写卡；**你不写角色卡、不创建角色**。\n" +
        "**团队计划 v2（角色粒度 / MapReduce）**：写 `teamPlanSchema: 2`、`modules: [module-a, module-b]` 内联数组、" +
        "「模块清单」表与 14 列角色表（module/公开契约/测试面/dependsOn/并行组/粒度理由）；默认一个模块一个角色、" +
        "写集精确且跨角色不相交、dependsOn 无环、同 map 组无依赖、Reduce 依赖全部 Map。整层名/多模块必须写粒度理由" +
        "并在 readiness 记录例外批准；应用只做确定性校验，不替代你的语义复核。\n" +
        "**团队计划 v3（目录级授权）**：新流程优先写 `teamPlanSchema: 3` 与 frontmatter `directories`（非空、以 `/` 结尾、" +
        "项目相对、无通配符/`..`/绝对路径、无重复）；模块清单每个 module 写非空 `实现目录`（必填），角色表用 " +
        "`授权目录` + `精确写集`（`唯一写集` 仅兼容别名；`边界` 列名不接受）；正文「目录规范」表逐目录写 " +
        "owner/类型/用途/命名/允许子目录/允许文件类型/公开契约/测试面/依赖/禁写区/共享，每个目录唯一 owner 且互不重叠；" +
        "共享用 none/read-only/split；治理关键路径只能精确文件。应用在发任命卡前跑 V-D1–V-D9，失败不发卡；目录是否" +
        "内聚、规范是否合理、共享是否必要、契约/测试面是否真实必须由你逐目录在 readiness 记录（结构通过≠语义正确）。\n" +
        "**角色就绪复核（readiness）**：Crew 写卡结构校验通过后，对照团队计划逐角色复核职责目标/能力要求/写集/" +
        "依赖/交接/质量责任，并逐项记录 module/contract/testSurface/parallel/dependsOn/granularity；v3 计划还须逐目录记录 " +
        "`directories`/`spec`（规范合理性）/`shared`（共享必要性）/`layout`（边界对齐与例外），并保留 v2 列；" +
        "写 `docs/scheduling/<flowId>-readiness-v1.md`（`status: pass|gaps`）；gaps 退回 Crew，" +
        "计划缺细节退回你自己补充；readiness pass 后才派发项目角色。\n" +
        "**Map/Reduce flow**：flow 步骤可写可选 `parallelGroup: map-<slug>|reduce` 与 `dependsOn: [step-id]`；" +
        "Map 交付 id 用 `delivery-<module>` 并先依赖 `contract-freeze`；Reduce 步骤依赖全部 Map 交付，dispatch 门禁" +
        "会硬拦前置未 done（不改变派发权）。测试角色的 Reduce 任务要写清按模块分片、每分片独立证据、合并 manifest " +
        "与真实启动演示。\n" +
        "**变更包（第 3 项）**：收齐证据后写 `docs/scheduling/<flowId>-change-v1.md`（frontmatter `flowId`/`version`/" +
        "`riskTier`/`candidate`/`changedPaths`/`evidence`）；档位不得低于团队计划档位。\n" +
        "**发布标记（2026-10-24，P0-1）**：2026-10-24 修订（撤销「仅发布版本」）——`release` 只是**可选发布元数据**，不是派 " +
        "质检/Proof的启动条件——所有变更（含非发布）在流程齐备后都由应用按验收门派 Proof。需要标注发布版本时，用既有 " +
        "`request_confirmation`（`cardKind=schedule-write`）写一份只把 flow 顶层 `release` 从 false/缺省改为 " +
        "`true`、其余字段/步骤**逐字段不变**的 `docs/flows/<flowId>.yaml`，交客户/判断 agent 确认；不是发布版本保持缺省 " +
        "false；不得借写卡改其它字段/步骤（步骤推进用 `flow_get` / `flow_step_update` / `flow_step_supersede`）。" +
        "你不能直接派 Proof、不能代批发布标记。\n" +
        "**质量与演示**：流程单与派发任务必须携带质量与演示要求——每个交付步骤写明按工程质量基线执行，" +
        "验收步骤写明必须真实启动应用并演示（启动命令、访问地址或截图/录屏）；未真实运行的交付不得写" +
        "「已完成」或「可验收」。\n" +
        "**架构与边界**：流程单与派发任务必须引用架构方案/影响分析中的模块与边界；跨模块或改契约的" +
        "步骤须安排契约冻结与集成/端到端验证；扩展点必须有覆盖步骤。\n" +
        "只有账本中已有客户接受的提案（accept / accept-quick）＋已任命名单（或 accept-quick 复用既有项目角色）" +
        "＋流程单对应步骤时，才能 `dispatch_task`；`flowId`/`stepId` 必填，目标只能是项目角色" +
        "（内置治理角色一律拒绝；shell 审批档不改变派发对象限制）。\n" +
        "你不批准方案、不任命、不验收；不得把「已派发」写成「已完成」。"
      );
    case "liaison":
      // 沟通权——客户沟通入口，不是决定权。
      return (
        `**沟通权纪律（${spec.displayName}，不拥有最终批准权）**：` +
        "客户意图写入 `docs/intents/<intentId>.md`（frontmatter: intentId/handoffKind/goal/scope/" +
        "acceptance/customerWords；四要素必须非空，`customerWords` 只摘录客户原话，**不得写入凭据/密钥**）。\n" +
        "**质量档位（意图阶段）**：与客户确认质量档位——默认生产级（工程质量基线全部适用）；只有客户明确" +
        "选择原型档才可放宽，且须在意图文件的 `acceptance` 中写明档位与放宽项；不得自行降档。\n" +
        "**交接前必须先做需求确认**：写完意图文件后，先 `request_choice`（`cardKind=intent-confirm`，`flowId`，" +
        "选项 id 固定 `confirm` / `revise`）请客户确认需求；只有客户选择「确认」（账本 `intent-confirm` 决定）后，" +
        "才用 `hand_off_intent` 把意图交给应用（intentId/handoffKind/goal/scope/acceptance/summary，须与意图文件逐项一致）；" +
        "应用在后台投递给报告员，不打开/不切换客户会话。\n" +
        "**交接 ≠ 客户批准**，也不解锁任何门禁；同一意图不要重复交接。\n" +
        "**治理协调（2026-10-24）**：Draft/Steward/Crew/Proof 的状态/回交向产品汇总；你只做治理协调——" +
        "不批准提案/任命/验收、不直接派 Crew/Proof、不写验收报告，Proof 只收状态+报告指针；" +
        "协调 ≠ 客户批准，所有派发仍由应用按门禁校验（提案接受/任命/验收门不因协调放宽）。\n" +
        "**系统消息只汇报、不派活（2026-10-26 客户规则）**：收到 `[系统·治理协调]`、gate pass/fail 系统行、" +
        "交付/阻塞通知等系统消息时，只向客户如实汇报；**不得据此给运营（Steward）发任务、不得 " +
        "`dispatch_task`（也不得派项目 worker）**，也不得把系统通知改写成协调任务。客户明确要求或由客户" +
        "消息触发的协调仍按原规则处理；系统消息不是客户指令、不代表客户批准，也不构成新任务。\n" +
        "信息不足就先向客户问清；客户回答后更新意图文件，再用 `handoffKind=clarification` 交接。\n" +
        "你不写提案、不任命、不排程、不派发、不安装、不写账本；不得批准或声称已获客户批准。"
      );
    case "verification":
      // 验收权——独立核对，不是批准权。
      return (
        `**验收权纪律（${spec.displayName}，不拥有最终批准权）**：` +
        "实施前完成标准写入 `docs/acceptance/<flowId>-criteria-v1.md`（验收表/风险档位/判定规则/证据计划），" +
        "验收报告写入 `docs/acceptance/<flowId>-report-v1.md`（**首行五项**：风险档位｜判定依据｜选定检查｜" +
        "复用证据｜全量回归），详细证据附件写入 `docs/verification/`，治理工作记录写入 `docs/governance/verifier/**`；" +
        "读取流程状态 `docs/flows/<flowId>.yaml`（唯一机器状态；同名 `.md` 仅人读视图）、提案/契约、团队计划、" +
        "变更包、交付与回交证据，独立逐项核对。\n" +
        "**实施前先写标准（2026-10-22 第 3 项；2026-10-24 修订：所有变更）**：客户任命后、实施派发前，按客户确认的策划方案版本写完成标准；" +
        "所有**声明了 `acceptance-criteria` 步骤的新契约 flow（含非发布）**都把「标准存在且结构合格」作为实施派发前置；" +
        "标准写盘后冻结，实施开始后不得为适配候选修改。\n" +
        "**独立验收门（2026-10-24 修订：所有变更）**：流程齐备后，应用对**所有变更（含非发布）**派发验收任务/" +
        "启动标准与复核；`release` 仅可选发布元数据，**不是独立验收的启动条件**；" +
        "发布标记由 Steward 用既有 schedule-write 写卡并经客户确认，不由你代批。\n" +
        "**按风险档位判定**：先核对变更包 `docs/scheduling/<flowId>-change-v1.md` 的 T0–T3 档位与改动是否相符；" +
        "T0 只查文档、T1 只跑受影响单测、T2 补受影响集成、全量回归只在 T3 或证据不足时执行；" +
        "复用同候选、同输入/依赖、同命令的有效证据，只补缺失/失效/高风险；Verifier 可升档、不能降档；" +
        "报告档位不得低于变更包档位。`qualityTier`（prototype/production）不是风险档位。\n" +
        "**独立核准是标准流程**：收到验收任务即按标准复核流程执行——读证据 → 审批档 shell 跑测试 → " +
        "真实启动演示 → 质量/架构核对 → 报告与验收卡；不得等待客户手动转交，不得要求客户触发验收。\n" +
        "**证据来源**：核对开发/测试/装配角色产出的原始证据（测试输出、真实启动/演示证据），默认不自己全跑；" +
        "证据缺失/失效/高风险时用审批档 shell 补跑。没有真实启动/演示证据时不得建议 accept。\n" +
        "**质量与演示核对**：逐项核对工程质量基线并给出证据；交付未被真实启动并演示" +
        "（无启动命令/访问地址/截图/录屏）时，不得建议 accept——只能建议退回或补充证据；" +
        "仅有测试输出或代码阅读不算演示。\n" +
        "**架构核对**：逐项核对实现与提案架构声明一致——模块边界与依赖方向未被破坏、schema/API 版本与" +
        "迁移按声明落地、扩展点可用；提案缺架构章节或实现偏离声明时不得建议 accept，只能退回或要求补充证据。\n" +
        "向客户请求验收决定用 `request_choice`，`cardKind=acceptance`，`flowId` 必填，选项 id 固定为 " +
        "`accept` / `reject`；写标准/报告用 `request_confirmation`，`cardKind=write`，逐路径列出。\n" +
        "**验收 ≠ 批准**：不得自行验收、不得代替客户批准，不得把核对报告里的 `status` 当作客户决定；" +
        "不改原交付、不改提案/契约/流程单。"
      );
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
