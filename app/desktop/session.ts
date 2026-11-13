import { isDirectActionSource } from "../../src/model/trunk.ts";
import { RuntimeDeliveryError, REQUEST_TIMEOUT_ERROR_CODES, MODEL_REQUEST_RETRY_EXHAUSTED, GOVERNANCE_SLUG_PATTERN, WORKFLOW_LEDGER_SCHEMA, isRuntimeSessionDrained, isTaskWorkSourceRef, isDispatchTaskResumeController, isWorkflowPath, isWorkflowStage } from "../../src/model/runtime.ts";
import { isRequestFailureCode } from "../../src/common/runtime-core/request-timeout.ts";
import { isNetworkOfflineFailureCode } from "../../src/common/runtime-core/network-gate.ts";
import { createToolDisplayContext } from "../../src/common/runtime-core/tool-display.ts";
import type { SessionEvent, RuntimeTurnOutcome, RuntimePersistenceChangeV1, ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1, DeliveryReceiptQueryV1, RuntimeDeliveryReceiptV1, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1, RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1, GovernanceJudgeContext, BackgroundTaskSnapshot, BackgroundTaskReadOptions, BackgroundTaskReadResult, BackgroundTaskStopOptions, BackgroundTaskStopResult, NetworkGate, NetworkState, DocFormatFn, DocFormatInput } from "../../src/model/runtime.ts";
// app/desktop/session.ts
// 桌面应用的「会话」装配（纯逻辑，不依赖 electron，可在 node 下单测）。
//
// 模型（客户最终定稿 + 设计稿 §5.3）：
//  - **导入项目即授权**：用户经系统文件夹选择器导入项目，即为该项目下的角色授权；
//    之后左树点一个角色 → 立即开启与该角色的会话，**没有任何确认弹窗**。
//  - 用户对边界/acceptance **无感**：边界由门禁引擎静默执行，越界写入在聊天流里内联提示（不弹窗）。
//  - **授权来源分档（T13）**：项目带可用的 `.ans/project.json` → 优先用其 **pin-backed acceptance**
//    （pin 生效、受 pin 约束）；**无** `.ans` → 回退运行期同意（导入即授权，登记的非-pin 例外）；
//    `.ans` **存在但不可用** → fail-closed 未接受（**不回退**运行期同意），界面如实呈现。判定链的
//    唯一实现在共享模块 `src/common/shared/config-loader.ts`（只读导入，不复制）。
//  - 聊天是多轮的：会话经编排 openRoleSession 建立，send 反复调；同一角色重复点击 = 续接当前会话（不重建）。
//  - **切换保留历史（B-2，2026-10-12 设计：路线 a「并存会话」）**：每角色各持一个保活句柄（`sessions` Map）,
//    **切走不 stop、切回直接续**（句柄与模型上下文天然保留）；同时保活数上限 `MAX_LIVE_SESSIONS`（LRU，
//    淘汰者 dispose、界面侧历史由渲染层自持；**跳过 busy 与各项目主理 `primaryRoleId`**——主理会话不关闭）；
//    事件外推带 **`roleId` 信封**（多会话并存不串消息）；
//    `stop(roleId)` **定向**关闭（缺省=全部，供换项目/退出）。
//  - **回交自动投递 su 验收 + su 派发任务路由（E-1 / H-1，2026-10-12 设计；客户裁定全自动、无开关）**：
//    E-1——某角色（≠su）的回交事件到达时，经编排的 `renderHandbackPrompt`（**单一来源**）自动投递进 su 的
//    会话；H-1——su 经适配器 `dispatch_task` 能力（`dispatchTask`，**仅 su 会话注入**）把任务路由进**目标角色**
//    的会话（文本 = 编排 `renderDispatchPrompt`（**单一来源**——G-1/A2 已收口删除本地副本）；G-1 必读块由
//    编排三件套（`extractDispatchReadPaths`/`planDispatchDelivery`/`renderDispatchPrompt`）产出，本层只接线）。
//    两者**共用一套投递机**：去重（回交=handbackKey 永不重投；派发=**队列期**窗口去重、送达即释放以保返工）+
//    忙时排队（按序、绝不并发 send）+ 目标未开**自动开启** + 失败**如实系统行 + 保留待重试**（绝不静默丢）。
//    校验：`routeDispatch` 拒非本项目角色与内置治理角色（含 su 自身）——**如实回执给工具**，绝不静默。
//    CLI 前端的同等投递**不做**（一次性会话，另议——登记）。
//  - **上下文来源（ANS-RUNTIME-V2r1）**：live reuse 是桌面 resumed；只有 handle 的实际原生恢复成功
//    才是桌面 recovered。恢复失败重建是 fresh + warning。ANS 回放/任意文件不能证明模型上下文恢复。
//
//  - scope 传 undefined（聊天无任务收窄）；判定仍由门禁引擎负责——写入照样实时被拦。
//  - **冷启动创世（设计 §10.1 / §12.2，任务 T30）**：未 bootstrap 的空项目上，`buildProjectConfig`
//    会按 `hasRoles === false` **带上 `genesisBootstrap`**；本层照常经 `openRoleSession` 以 `scope: undefined`
//    开启内置治理角色（su）——门禁引擎据 `genesisBootstrap` 对其返回「项目根」治理种子边界，于是 su 能写出
//    治理产物（`角色卡/…` / `docs/…` / `.ans/…`），而 `src/**` 仍被拒。**项目一有角色即不再带该字段**
//    （切换在 `buildProjectConfig`，不在此处），su 随即回到普通聊天（项目边界治理）。
//  - **客户确认制交互（A-1/A-3/A-5，2026-10-12）**：**仅内置治理角色（su，`role.builtIn`，数据驱动）**的会话
//    注入**客户交互通道**（`customer-input.ts` → 编排 `openRoleSession` 的入参 `customerInput`）：该会话进入
//    **确认制**——`request_confirmation` / `request_choice` 两工具注册、gate 走「**客户确认才发行 writeSet**」
//    （发行在编排 `common/编排/confirmed-writes.ts`，本层不复制）；**「客户确定了才加、才落盘」取代了旧收口**
//    ——收口提议/确认/手动 finalize 已删，产物收尾由编排在 settle 后**自动**完成（本层不再有 finalize 面）。
//    普通角色会话**不注入**（无客户通道：两工具不注册、gate 旧语义逐字不变）。
//  - **内置治理角色审批档（客户裁定 2026-10-17「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」；
//    客户新规则 2026-10-19「所有的角色，都应该有运行 shell 的权限，包括读写，以及任何的需要命令的权限，
//    只不过都要提交审批，按照原有的流程审批。」）**：
//    **全部内置治理角色**（`role.builtIn === true`——single 的 su 与 trio 五人 liaison/rapporteur/nominator/
//    convener/verifier）会话把 **(c) 规则集实件**（与项目角色**同一份** `deps.shellArming`——单一来源、永不漂移）
//    与 **(a) 操作者确认通道**（与项目角色同一份 `deps.shellOperatorChannel`）经 `shellOperatorOnly` 交给编排
//    `assembleOperatorShellGate` 装配**审批档** ShellGate ⇒ 内置治理角色的 `run_shell` **注册**：
//    (c) 只读白名单直接放行 **0 卡**；`risky`/`review`/`deny` 一律交客户/判断 agent **逐条审批**
//    （deny 也可被批准）。**不接 (b)**（不自审）；拒绝/超时/通道不可用 = 拒绝（fail-closed）。
//    shell 可读写、可执行任意命令，但其副作用**不受文件写门禁约束**——审批链是**唯一控制**。
//    旧只读档（`shellReadonly`）桌面**不再使用**（类型保留兼容；内置治理角色**绝不**注入只读档）。
//    缺件（`deps.shellArming` 或 `deps.shellOperatorChannel` 为 undefined）⇒ **不传** ⇒ 不 arm
//    （能力缺席 = fail-closed，绝不放宽）。

import type { Acceptance, BoundarySection1 } from "../../src/model/boundary.ts";
import type { GovernanceModel, ProjectConfig, RoleDispatchPurpose } from "../../src/model/role.ts";
// 三权（评审 §5.1/§5.6）：内置治理角色 id 判定 / 注册表统一来自门禁引擎的 Service 公开出口
// （桌面**不复制**第二份 id 列表，也不直接导入 `src/common/门禁引擎/` 私有模块）。
import { governanceRoleOf, isBuiltInGovernanceRoleId, resolveBoundary, trioGovernanceSource } from "../../src/service/boundary/resolve-boundary.ts";
// T3 B4.2（2026-11-10，AC-21/T-09）：任务级 Git 写出明细分类器——Service 公开出口同一函数引用
// （fixed 会话经 `openRoleSession({taskGit})` 注入；本层不复制规则、不建第二份判定）。
import { classifyShellDetailed } from "../../src/service/gate/shell-rules.ts";
// O-1（2026-10-12）：边界快照的**可信信号** = 读盘内容哈希（sha256）——本层只读、不复制门禁解析。
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { ChiefDecisionExecutionContext, DecidePendingRequestFn, SelectRunChangeFn, CompleteTeamPlanFn, ActivateRoleDocumentsFn, CloseCreatedTaskFn, FixedCloseCreatedTaskFn, GitQueryFn, GitCandidateFn, GitPublishFn, RuntimeSessionLifecycleFacts, RuntimeSessionToolSurfaceFacts, TaskWorkSourceRef } from "../../src/model/runtime.ts";
import type { RoleSessionHandle, RoleSessionAbortResult, RoleSessionSendOptions, TaskGitShellRuntimeInput } from "../../src/pipeline/orchestration/run-role.ts";
import { readRoleCapabilityProtectionScope, inspectRoleSessionOpenFailure, registerVersionedDocumentAfterWrite } from "../../src/pipeline/orchestration/run-role.ts";
import type { GitHostOpenFailureRef } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createGitRoleRuntime, createDirectRoleRuntime, recordTaskObservation, prepareCreatedTaskClose, freezeExecutionRun, readRunRoleContext, prepareRoleDispatch, beginGitHostAction, endGitHostAction, inspectAssignedTask, recordGitHostInterruption, prepareAssignedTaskWriteScope, prepareParentTaskRef, collectDispatchBaselineFacts, resolveDeliveryAssignment, classifyClosedTaskNotice, prepareRunChange, finalizeRunChange, prepareControllerResume, inspectQueuedControllerResume, prepareControllerStop, finalizeControllerStop, type ControllerStopHostPlan, type RunChangeHostPlan } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createRuntimeAdapterFactory, type RuntimeAdapterFactoryBuilder, type RuntimeAdapterFactoryOptions, type RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
import {
  createDirectiveInterpreter as realCreateDirectiveInterpreter,
  DIRECTIVE_INTERPRET_SUPPORTED_RUNTIMES,
} from "../../src/pipeline/orchestration/govern-session.ts";
import type {
  DirectiveInterpretRequest,
  DirectiveInterpretResult,
} from "../../src/model/directive.ts";
// 2026-11-04 下载申请（download-requests C1）：A1 能力契约 + B1 每会话运行时/卡片 presenter 冻结形状。
import type { RequestDownloadFn } from "../../src/model/download.ts";import type {
  DownloadApprovalOutcome,
  DownloadApprovalPresenter,
  DownloadApprovalRequest,
  DownloadRequestOptions,
  DownloadRequestRuntime,
} from "../../src/pipeline/orchestration/download-request.ts";
import type { TakeDownloadDirectiveFn } from "../../src/pipeline/orchestration/customer-directive.ts";
import { buildDownloadCardRequest, createRequestDownloadCapability, toDownloadApprovalOutcome } from "./download-request.ts";
// F-5-opt1（2026-10-16 客户批准）：确认制会话重建后写权清零的**模型可见注记文案**——**单一来源在编排**
// （`run-role.ts` 的 `RoleSessionHandle.queueModelNotice` 配套文案）；本层只读导入、绝不各写一份。
import { REBUILT_SESSION_WRITE_PERMITS_NOTICE } from "../../src/pipeline/orchestration/run-role.ts";
// 会话事件流的类型：编排把 `RoleSessionHandle.events()` 放宽为 `OrchestrationEvent`（既有 `SessionEvent`
// + 编排在 `settled` 时追加的 `handback` 回交事件，设计 §10.8）。**类型从编排的模块只读导入、不复制形状**
// （单一来源：`src/common/编排/handback.ts`，也是 `run-role.ts` 导入它的位置）。
import type { OrchestrationEvent, HandbackEvent } from "../../src/common/编排/handback.ts";
// E-1（2026-10-12）：「回交后的 su 验收」的两件**单一来源**（编排提供，只读导入、不复制）——
// `renderHandbackPrompt`（投递给 su 的输入文案）与 `handbackKey`（去重键）。**两前端共用、不得各写一份**。
import { renderHandbackPrompt, renderHandbackBatchPrompt, renderWorkReportPrompt, renderWorkReportBatchPrompt, handbackKey, extractDispatchReadPaths, planDispatchDelivery, type TaskHandback } from "../../src/common/编排/handback.ts";
// C 批（方案 §6.4.1/C-06）：appointment-write 的应用侧结构/D3 校验使用编排出品的声明路径单一实现。
import { declaredConfirmPaths, declaredPathBodies } from "../../src/common/编排/confirmed-writes.ts";
// B 批（2026-10-28）：任务/汇报主干与最小状态（编排单一来源，本层只接线）。
import { appendTaskEvent, classifyTaskSideEffect, findTaskByIdempotencyKey, newTaskId, readTaskState, redispatchCountOf, redispatchTaskId, renderTaskCardLines, shortenSummary, taskCardOf, taskCards, taskEvent, taskIdempotencyKey, taskReportStatusOf, type TaskCardView, type TaskReplay } from "../../src/common/编排/task-state.ts";
// T3（2026-11-10 两条固定工作流路径，B1 AC-01/02/04/12/23）：fixed 派发矩阵 + 工作流服务/投影
// （**只读导入**；桌面只做 per-flow 路由、可信事实透传与能力过滤，不复制编排业务/状态机）。
import { evaluateFixedPathDispatchAuthorization, stageRequestIdempotencyKey, stageStopIdempotencyKey } from "../../src/common/编排/workflow-dispatch.ts";
import {
  appendWorkflowEvent,
  closeTask as closeFixedWorkflowTask,
  completeTeamPlanFixed,
  executeReleaseMerge,
  finalizeIntent as finalizeFixedIntent,
  inspectAssignedTask as inspectWorkflowAssignedTask,
  prepareIntent as prepareFixedIntent,
  preparePathBStart as prepareFixedPathBStart,
  prepareReleaseMerge,
  readBasisLedger,
  readWorkflowLedger,
  rejectReleaseMerge,
  requestStage,
  verifyBasisForStage,
  verifyBasisForWorkflow,
  workflowIdFor,
  type CompleteTeamPlanFixedResult,
  type FixedCloseCreatedTaskToolInput,
  type ReleaseMergePreview,
  type WorkflowServiceFailure,
} from "../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView, canCompleteStage, type WorkflowView } from "../../src/common/编排/workflow-state.ts";
import { deriveFixedModuleWriteSet, loadLatestRoster as loadLatestWorkflowRoster, reviewRoleIdOfRoster } from "../../src/common/编排/workflow-preconditions.ts";
// 桌面侧薄层：per-flow 模式解析（单一实现仍在编排 workflow-service；本层只委托/注入/常量）。
import {
  activeFixedWorkflowIdFor,
  dispatchFlowIdOf,
  ensureFixedPathStarted,
  isFixedPathEnabledForFlow,
  isFixedReleaseTriggerStage,
  markFixedProposalCardRequested,
  recordFixedPathBScopeDecisionForDispatch,
  recordFixedStageDispatchForTask,
  resolveFixedPathMode,
  resolveProjectFixedPanelMode,
  sessionWorkflowModeForChat,
  sessionWorkflowModeForTask,
  shouldRecordFixedStageDispatch,
  workflowModeForFlowResolver,
  type FixedReleaseTriggerStage,
  type WorkflowMode,
} from "./workflow.ts";
import { createDesktopBaselineGitPort, createDesktopReleaseGitPort, createDesktopTaskGitShellPort } from "./workflow-git.ts";
import { buildMergeMainCardRequest, mergeMainCardRequestId, toMergeMainCardDecision } from "./customer-input.ts";
import { applyRunChange, buildRunChangeCard, closeRun, ensureDraftRun, findActiveRun, findNewerContractDocs, loadPinnedRoster, listRunManifestsResult, mapRunChangeAnswer, pinRun, pinnedDocsSummary, readRunManifest, validateRunManifest, verifyPinnedRun, RUN_PENDING_FLOW_ID, type NewerContractDoc, type RunManifest, type RunChangeMode } from "../../src/common/编排/run-manifest.ts";
// 2026-11-02（全局任务状态/版本决策，A2）：只读复用 A1 的派生/纯逻辑；不复制 flow/run/账本状态机。
import {
  buildProjectStateView,
  deriveActiveRunFromManifests,
  renderProjectStateSummary,
  scanRunManifestsForState,
  scanVersionedDocsForFlow,
} from "../../src/common/编排/project-state.ts";
import {
  buildVersionDecisionCard,
  collectResolvedWithoutExecution,
  computeTargetVersions,
  mapVersionDecisionAnswer,
  planVersionDecisionExecution,
  supersededCloseReason,
  validateVersionDecisionContext,
  validateVersionDecisionRequest,
  versionDecisionAttempt,
  versionDecisionCardToRequest,
  versionDecisionRequestId,
  type VersionDecisionCardLabels,
  type VersionDecisionRequestSubject,
} from "../../src/common/编排/version-decision.ts";
import { validateDecisionCardRequest } from "../../src/common/编排/decision-card.ts";
import {
  PROJECT_NOTE_BLOCKER_TEXT_MAX,
  PROJECT_NOTE_KEY_MAX,
  PROJECT_NOTE_NEXT_STEP_DEFAULT_KEY,
  PROJECT_NOTE_NEXT_STEP_TEXT_MAX,
  PROJECT_NOTE_REFS_MAX,
  PROJECT_STATE_SCHEMA,
  VERSION_DECISION_SCHEMA,
  type ProjectNoteInput,
  type ProjectNoteResult,
  type ProjectStateDocKind,
  type ProjectStateToolResult,
  type ProjectStateView,
  type VersionDecisionErrorCode,
  type VersionDecisionDecidedBy,
  type VersionDecisionFacts,
  type VersionDecisionRequest,
  type VersionDecisionResult,
} from "../../src/model/project-state.ts";
import { formatRoleActivityText, readRoleLog } from "../../src/common/编排/role-log.ts";
import { docsForFlow, formatMechanicalRejection, humanRejection, makeMechanicalRejection, technicalRejectionCode, type MechanicalRejection } from "../../src/common/编排/mechanical-rejection.ts";
// B 批：终止/重派安全判定（单一来源；桌面只提供终止事实/执行动作）。
import { evaluateRedispatchSafety, type RedispatchSafetyDecision } from "../../src/common/编排/watchdog.ts";
import {
  ENV_BOOTSTRAP_ROLE_ID,
  evaluateDispatchAuthorization,
  loadLatestRoster,
  reportTargetForTaskCreator,
  rosterRoleIds,
  type DispatchPreflightInput,
  type ProjectRoster,
  type RosterLoadResult,
} from "../../src/common/编排/workflow-preconditions.ts";
import { collectDispatchAdvisories, type DispatchAdvisory } from "../../src/common/编排/dispatch-advisories.ts";
import { stableWritePathOf } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import type { StableWritePermit, StableWriteRecord, VersionChangeRecord } from "../../src/model/version-change.ts";
import type {
  AmendmentItemOutcome,
  VcaCardOutcome,
} from "../../src/pipeline/orchestration/version-change-runtime.ts";
import type { StableWriteCardOutcome } from "../../src/pipeline/orchestration/stable-write-runtime.ts";
import {
  appointmentStableWriteInputs,
  buildAmendmentItemCard,
  buildStableBoundaryRisk,
  buildStableWriteCard,
  buildVersionChangeCard,
  mergeAcknowledgements,
  toAmendmentItemOutcome,
  toStableWriteOutcome,
  toVersionChangeOutcome,
  validateStableWriteCardShape,
  type AmendmentItemPresentation,
  type StableWritePreview,
  type VersionChangeStack,
} from "./version-change.ts";

/** 2026-11-02（版本决策）：slug 校验（与 model/runtime.ts 单一来源一致）。 */
const GOVERNANCE_SLUG_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);
const VERSION_DECISION_SYSTEM_PREFIX = "[系统·版本决策] ";

// ↑ G-1／A2（2026-10-16 客户批准；设计 `2026-10-16_design_contract-workflow-dispatch.md` §四/§九 A2；
// 编排 A1 交回接口见 `角色卡/编排/docs/change/2026-10-16_change_contract-workflow-dispatch-a1.md` §五）：
// 派发必读块的**提取**（`extractDispatchReadPaths`）、**判据**（`planDispatchDelivery`：契约缺失 ⇒ fail-closed
// 拒投；workflow 缺失 ⇒ 降级照投）、**渲染**（`renderDispatchPrompt`，经判据产出的定格文本）都是编排的
// **单一来源**——本层**只做接线**（投递时用 `filePrint` 探测各引用、按判据拒投或入队），不得各写一份。
// 本批已删除本地副本 `renderDispatchPromptLocal`（既有登记依赖收口——落地后必须切换、不得两处并存）。
import { createDiagnosticLogger, getDiagnosticsStatus } from "../../src/common/shared/diagnostics.ts";
import { readIntentEntryFacts } from "../../src/common/shared/intent-entry-contract.ts";
// 整轮硬超时求值的**单一来源**（与看护 signal #1、会话运行时同一函数；本层不另写时长/env 解析）。
import { resolveRuntimeTimeouts } from "../../src/common/runtime-core/timeout.ts";
// G-2/W1：role_status 的会话尾部数据面**复用受保护投影管线**（`getSessionHistory` 同路径——凭据清洗、
// display 保护已在链上；su 不直接读裸 JSONL）。
import { getSessionHistory } from "./runtime-history.ts";
// F-8-b（2026-10-16 客户批准）：`display.process` 结构化事实的行分类——G-2/W1 信号 #3「命令超时限」
// （F-1 事实）复用**同一判据实现**（session-history.ts 导出；与运行时核心投影/桌面UI 行分类同源）——
// 不在本层另写第二份 timedOut 判定。
import { classifyProcessOutcome, pickLatestSessionFile, sessionsDirFor } from "./session-history.ts";
// G-2（2026-10-16 客户批准；设计 `2026-10-16_design_role-watchdog-and-closure.md`）：W1 看护观察的形状与
// 事件转发（settled/命令超时/真实活动 → 看护器）；看护工具形状单一来源＝契约家 `model/runtime.ts`
// （编排 `common/编排/watchdog.ts` 同名转发）。
import { formatDurationMs, type WatchdogObservation, type WatchdogProjectSnapshot } from "./watchdog.ts";
import { mainT } from "./i18n.ts";
// 客户授权平面 Q9 A（2026-11-03）：`operatorId:"directive:<id>"` 的唯一解析（不信任其他字段）。
import { directiveIdFromOperatorId } from "./directive-input.ts";
import { type RoleStatusFn, type RoleStatusPayload, type SessionTailFn, type SessionTailPayload, type WatchdogToolResult } from "../../src/common/编排/watchdog.ts";
import type { WriteGate, RuntimeAdapter, ShellGate, OperatorChannelFn, CustomerInputFn, CustomerInputRequest, CustomerInputMetadata, CustomerInputOutcome, PromptTurnStartedMetadata, ShellJudgeFn, GovernanceJudgeFn, ViewImageFn, ContractCheckFn, ContractCheckInput, EvidenceCheckFn, EvidenceCheckInput, CriteriaRef, GovernanceCardKind, ShellEscalationPresentFn, ShellEscalationCardRequest, ProjectStateFn, ProjectNoteFn, RequestVersionDecisionFn, VersionDecisionEvent, SubmitVersionChangeFn, SubmitVersionChangeInput, SubmitVersionChangeResult, SubmitRefactorFn, SubmitRefactorInput, SubmitRefactorResult, RequestStableWriteFn, RequestStableWriteInput, RequestStableWriteResult, WorkflowDocumentRef, WorkflowStage } from "../../src/model/runtime.ts";
import { checkEvidence, deriveAcceptanceFact, loadCriteria } from "../../src/common/编排/evidence-check.ts";
// 2026-10-26 需求变更申请（request_requirement_change）：同源契约；仅统筹/提案会话注入。
// 申请 ≠ 批准：审批由客户/判断 agent 在发起方会话的 decision 卡完成，主理只在批准后执行意图变更。
import type { RequestRequirementChangeFn, RequestRequirementChangeInput, RequestRequirementChangeResult } from "../../src/model/runtime.ts";
// 2026-11-05：方案升级报告卡（convener → 客户主权卡；修订方案/提供环境/继续/终止）。
import { PLAN_ESCALATION_CATEGORIES } from "../../src/model/runtime.ts";
import type { PlanEscalationFn, PlanEscalationInput, PlanEscalationResult } from "../../src/model/runtime.ts";
import { buildPlanEscalationCard } from "./plan-escalation.ts";
// W6-B：决定卡镜像已由 C 批移除（申请/结果直达来源角色，幕僚只收系统通知）；报告指针文案在此接线。
import { governanceAcceptanceReportPath } from "./governance-advance.ts";
// H-1（2026-10-12）：派发能力的冻结契约（§4 冻结家；只读导入、不复制形状）。
import type { DispatchTaskPayload, DispatchReceipt, DispatchTaskFn, PromptOptions, TaskStateEvent, RoleActivityLogPayload, RoleActivityLogFn, TerminateRoleRunFn, RedispatchTaskFn, WorkflowEvent, WorkflowArtifactRef, BasisEvent } from "../../src/model/runtime.ts";
// G-4/I3（2026-10-16 客户批准）：技能安装/卸载能力的冻结契约（设计 §3.2 冻结家 `src/model/runtime.ts`；
// 只读导入、不复制形状——字段名即契约，任一侧改名/改形 = 工具静默零注册或 fail-closed）。
import type { InstallSkillFn, InstallSkillPayload, InstallSkillReceipt, UninstallSkillFn, ReportHandbackMetadata } from "../../src/model/runtime.ts";
// G-4 V2（2026-10-16 客户批准）：外来 MCP 安装/卸载能力的冻结契约（沿技能版体格；同冻结家）。
import type { InstallMcpFn, InstallMcpPayload, InstallMcpReceipt, UninstallMcpFn } from "../../src/model/runtime.ts";
// G-4/I3：登记解析**唯一来源**（编排属主 `common/编排/installed-skills.ts`）——handler 的「登记存在/
// 含角色/状态」校验面与 O-1 指纹集重推导共用它；**绝不复制解析逻辑**（逐字同渲染器口径）。
import { readSkillRegistration } from "../../src/common/编排/installed-skills.ts";
// G-4 V2：MCP 声明解析**唯一来源**（运行时核心属主 `common/runtime-core/mcp-declarations.ts`——
// `loadDeclaration` 单一解析，配置侧不得复制；`uninstalled`/角色不命中非坏件、原样返回视图）。
import { readMcpDeclaration } from "../../src/common/runtime-core/mcp-declarations.ts";
// D-1/E-1：会话文件粗探（「在/不在/坏」）——打开会话时分类 `contextSource`（文案分支的事实来源）。
// I-1 补丁（2026-10-12 客户重发授权）：(c) 规则集实件的形状（**只读转自** operator-channel.ts——它 `Omit`
// 自编排的 `AssembleShellGateOptions`；同一契约只许一个形状，本模块不另立第二份）。
import type { DesktopOperatorChannelFn, DesktopShellArming } from "./operator-channel.ts";
// 审批档/旧只读档的装配选项形状：**单一来源**在编排（`shell-arming.ts::AssembleOperatorShellGateOptions` /
// `AssembleReadonlyShellGateOptions`）——只读导入其类型（运行期擦除）。审批档自 2026-10-19 起适用于**全部内置
// 治理角色**；旧只读档**桌面不再注入**（类型保留以兼容其他调用方/测试，见 `openRoleSession` 入参注释）。
// **不另立第二形状**（与 `DesktopShellArming` 同法，见 operator-channel.ts 注释）。
import type { AssembleOperatorShellGateOptions, AssembleReadonlyShellGateOptions, RoutineShellPolicy } from "../../src/pipeline/orchestration/shell-arming.ts";
// 桌面客户交互通道（A-5）：请求/裁决的冻结形状在 §4 冻结契约家（model/runtime.ts），
// 本模块只读导入转出；`DesktopCustomerInputFn` 是本层对「带角色上下文」的窄扩展（请求本体不带 roleId）。
import type { AcceptanceReportDisplayV1, DesktopCustomerInputFn, ChiefDecisionBasis, ChiefDecisionHost } from "./customer-input.ts";
// 2026-10-26 view_image：工具读取的图片 → 下一轮同角色后台提示（投递经既有投递机）。契约形状
// （`ViewImageFn`/`ViewImageInput`）只读导入契约家；桌面本地只保留投递工厂与提示文本。
import { createViewImageDelivery } from "./view-image.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
// 跨角色共享组件：`.ans` 有效配置载入器（**属主：项目管理**；本角色**只读导入，不复制第二份**，
// 规则见 `角色卡/项目管理/docs/architecture/shared-components.md`）。它是「有 `.ans` 优先加载、
// 无则回退、有但不可用则 fail-closed」这条判定链的**唯一实现**。
import { loadEffectiveConfig as defaultLoadEffectiveConfig, type ConfigSourceKind, type LoadConfigOptions, type LoadedConfig } from "../../src/common/shared/config-loader.ts";
// 跨角色共享运行时原语（**单一来源**，pm 属主 `src/common/shared/`）：`RuntimeKind`（"demo" | "pi"）。
import { RUNTIME_KINDS, type RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
// 桌面授权链的**唯一实现**（会话语义与界面只读判定共用；采纳 `.ans` 的项目治理边界路径——见 project.ts）。
import { buildEffectiveProjectConfig } from "./project.ts";

// T22：`RuntimeKind` 的**单一来源**为 `src/common/shared/runtime-shared.ts`——此处删去本地副本、
// 改从共享模块**只读导入**并**原样转出**（公开面 `RuntimeKind` 不变、行为逐字不变）。
export type { RuntimeKind };

// ——————————————— B1（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md §5 B1） ———————————————
// 顶层类型/接口已**逐字迁入** `./session/contracts/**`（session-types / persistence / tasks / deps），
// 11 个顶层纯函数迁入 `./session/shared/text.ts` 与 `./session/shared/inventory.ts`；
// 22 个类方法（B1 提交 2/2）迁入 `./session/shared/{keys,clock,roles,session-views,notifier,tasks-store,inventory}.ts`，
// 类内保留同名同签名同可见性的薄委托。本文件保留 barrel + `SessionManager`。
// 导出面 51 符号（值 6 + 类型 45）与既有导入路径逐字不变；搬移审计证据见
// 角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b1-contracts-shared-text_evidence/ 与
// 角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b1-shared-methods_evidence/。
import type {
  DesktopOrchestrationEvent, SessionEventEnvelope, GovernanceClientProjectionV1, SessionOpenRequest,
  InternalSessionOpenRequest, ActiveRunView, EffectiveConfigInfo, SessionMessageMetadata, SessionTarget,
  OpenResult, SendResult, DeliveryQueuePersistenceOutcome, DeliveryQueuePersistenceFacts, StopResult,
  WithdrawResult, RebuildSessionResult, RedeliverResult, DeliveryAssignment, DeliveryOrigin,
  ActualDispatchSource, ControllerDisposalLease, LiveSession, ControllerResumeDelivery, DeliveryItem,
  PersistedDeliveryItemV1, DeliveryQueueRestoreReport, InstallationCapabilityTool,
  InstallationEffectRefusalObservation, DesktopSessionInventoryFact, DesktopRunStopFact,
  DesktopControllerStopFact, DesktopProjectExecutionInventory,
} from "./session/contracts/session-types.ts";
import type {
  PersistenceScope, PersistenceReply, PersistenceCapabilities, PersistenceValues, PersistenceUpdated,
} from "./session/contracts/persistence.ts";
import type {
  BackgroundTaskView, BackgroundTasksListReply, BackgroundTaskReadInput, BackgroundTaskReadReply,
  BackgroundTaskStopInput, BackgroundTaskStopReply, TaskListView, TaskRestoreReport, TerminateRoleRunInput,
  TerminateRoleRunResult, RedispatchTaskInput, RedispatchTaskResult, CloseTaskInput, CloseTaskResult,
  NativeProjectRegistration,
} from "./session/contracts/tasks.ts";
import type { SessionManagerDeps } from "./session/contracts/deps.ts";
import {
  shortenText, isAppTaskClientMessageId, APP_TASK_CLIENT_MESSAGE_ID_PREFIX, boundTurnText, filePrint,
  isAssistantTextEvent, shouldSuppressStarTaskReport,
} from "./session/shared/text.ts";
import {
  desktopProjectExecutionInventory, registerDesktopSessionManager, inventoryChanged, publishDeliveryInventory,
  desktopSessionManagers as inventorySessionManagers,
  type SessionInventoryState,
} from "./session/shared/inventory.ts";
// B1 提交 2/2（2026-11-13）：22 个类方法已**逐字迁入** `./session/shared/*`（keys/clock/roles/session-views/
// notifier/tasks-store/inventory），类内保留同名同签名同可见性的**薄委托**（私有方法名仍是实例物理面，
// 供测试结构化 cast 访问）。shared 模块只导入 contracts/其他 shared/既有 src 依赖，不导入 feature 模块。
import { sessionKey, targetKey, queueKey, type TargetKeyState } from "./session/shared/keys.ts";
import { now } from "./session/shared/clock.ts";
import {
  handbackOwnerRoleId, chiefTaskRoleIdOf, dispatcherRoleIdOf, resolveProofFlowIds,
  findListingForFeedback, roleDisplayName, refreshListingNow,
} from "./session/shared/roles.ts";
import { contextInfo } from "./session/shared/session-views.ts";
import { emitDeliveryNote } from "./session/shared/notifier.ts";
import {
  taskCreators, rememberTaskCreator, readTasks, isFixedTask, appendTaskStateResult, appendTaskState,
  recordTaskFailure, appendRoleActivity,
} from "./session/shared/tasks-store.ts";
// B2（2026-11-13）：证据/契约/文档格式检查（9 方法）→ `./session/evidence.ts`；
// 报告/投递持久化状态与回执操作（6 方法）→ `./session/persistence.ts`。
// 类内保留同名同签名同可见性的**薄委托**；persistence 的五个实例状态按方案 §3.6 暂留本类，
// 以同一 Map/Set 实例引用经 `PersistenceState` 注入；`handleHandback`/`handbackFlowId`（B2 未迁出）
// 经 `PersistenceHandbackPort` 回调注入（参数逐位原样转发）。模块均只导入 contracts/shared 与外部 src。
import { Evidence } from "./session/evidence.ts";
import { Persistence } from "./session/persistence.ts";
// B3（2026-11-13）：任务账本业务/重派/终止/升级（17 方法）→ `./session/tasks.ts`；看护状态/诊断尾部/治理投影/
// 网络状态（17 方法）→ `./session/diagnostics.ts`；边界/画像重建、技能/MCP 安装卸载、激活刷新（11 方法）→
// `./session/session-env.ts`。类内保留同名同签名同可见性的**薄委托**；各模块读取的实例状态按方案 §3.6
// 暂留本类，以同一 Map/Set 实例引用（get/set 回调）经状态面注入；未迁出的门面方法经端口回调注入
// （参数逐位原样转发）。模块均只导入 contracts/shared 与外部 src。
import { Tasks } from "./session/tasks.ts";
import { Diagnostics } from "./session/diagnostics.ts";
import { SessionEnv } from "./session/session-env.ts";

// —— 51 导出面（方案附录 B）：值 6 + 类型 45。既有导入路径（src/model 等）的转出保持原位置（见上下）。 ——
export { shouldSuppressStarTaskReport } from "./session/shared/text.ts";
export { desktopProjectExecutionInventory, subscribeDesktopExecutionInventory } from "./session/shared/inventory.ts";
export type {
  DesktopOrchestrationEvent, SessionEventEnvelope, GovernanceClientProjectionV1, SessionOpenRequest,
  ActiveRunView, EffectiveConfigInfo, SessionMessageMetadata, SessionTarget, OpenResult, SendResult,
  DeliveryQueuePersistenceOutcome, DeliveryQueuePersistenceFacts, StopResult, WithdrawResult,
  RebuildSessionResult, RedeliverResult, PersistedDeliveryItemV1, DeliveryQueueRestoreReport,
  InstallationCapabilityTool, InstallationEffectRefusalObservation, DesktopSessionInventoryFact,
  DesktopProjectExecutionInventory,
} from "./session/contracts/session-types.ts";
export type {
  PersistenceScope, PersistenceReply, PersistenceCapabilities, PersistenceValues, PersistenceUpdated,
} from "./session/contracts/persistence.ts";
export type {
  BackgroundTaskView, BackgroundTasksListReply, BackgroundTaskReadInput, BackgroundTaskReadReply,
  BackgroundTaskStopInput, BackgroundTaskStopReply, TaskListView, TaskRestoreReport, TerminateRoleRunInput,
  TerminateRoleRunResult, RedispatchTaskInput, RedispatchTaskResult, CloseTaskInput, CloseTaskResult,
  NativeProjectRegistration,
} from "./session/contracts/tasks.ts";
export type { SessionManagerDeps } from "./session/contracts/deps.ts";

/**
 * 同时**保活**的会话数上限（B-2 路线 a 的 LRU 上限；设计建议 3）。超出即淘汰**最久未用**者
 * （dispose；界面侧历史由渲染层自持——切回时恢复并明示「模型上下文已重启」）。
 * 淘汰候选不含 busy 会话（P1-2），也不含各项目的主理（`primaryRoleId`，2026-10-26 客户指令）。
 */
export const MAX_LIVE_SESSIONS = 3;

/** run-change 三模式的**类型**再导出（形状唯一来源仍是 `run-manifest.ts`；界面/conftest 不复制形状）。 */
export type { RunChangeMode } from "../../src/common/编排/run-manifest.ts";

// `[系统·安装]` 文首常量随 B3 的 applySkillChange/applyMcpChange 迁入 `./session/session-env.ts`，
// 此处仅原样转出（公开面/冻结值不变；51 导出面快照由结构测试钉住）。
export { CAPABILITY_INSTALL_SYSTEM_PREFIX } from "./session/session-env.ts";

/** 「已投递」应用任务标记的内存上界（FIFO 淘汰；防长跑进程无界增长）。 */
const MAX_DELIVERED_APP_TASK_IDS = 1024;

/** 会话管理器注册表：最小公共面（`executionInventoryFacts`）由 `./session/shared/inventory.ts` 定义并持有
 *  单例（登记经 `registerDesktopSessionManager`）；门面保留 `SessionManager` 强类型视图，用于跨实例只读访问
 *  `observedHandles`/`controllerDisposalOwners`/`runChangeOperations` 等私有面。
 *  运行时是**同一 Set 实例**（注册与库存聚合共享单例语义）。 */
const desktopSessionManagers = inventorySessionManagers as unknown as Set<SessionManager>;

/**
 * 会话管理器（B-2：**每角色一个保活句柄** + 上限 LRU）：点角色即开、多轮直发；
 * **切走不 dispose、切回直接续**；超出 `MAX_LIVE_SESSIONS` 时淘汰最久未用者。
 */
export class SessionManager {
  private readonly inventoryRegistration = (() => { registerDesktopSessionManager(this); return true; })();
  private readonly managerId = randomUUID();
  private runStopGeneration = 0;
  private readonly fencedRunTasks = new Map<string, Set<string>>();
  private readonly fencedRuns = new Map<string, Set<string>>();
  private readonly runStopFacts = new Map<string, { projectRoot: string; fact: DesktopRunStopFact }>();
  private readonly controllerStopFacts = new Map<string, { projectRoot: string; fact: DesktopControllerStopFact }>();
  private readonly controllerDisposalOwners = new Set<ControllerDisposalLease>();
  private readonly deferredRunChanges = new Map<string, { plan: RunChangeHostPlan; entry: LiveSession; origin: DeliveryOrigin; controller: AbortController }>();
  private readonly runChangeOperations = new Map<string, { plan: RunChangeHostPlan; controller: AbortController }>();
  private readonly observedHandles = new Map<string, { fact: DesktopSessionInventoryFact; handle?: RoleSessionHandle }>();
  private readonly observedHandleIds = new WeakMap<RoleSessionHandle, string>();
  private readonly inventoryPublicationErrors = new Map<string, string>();
  private readonly observedInventoryRoots = new Set<string>();
  private readonly installationRefusals: InstallationEffectRefusalObservation[] = [];
  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  installationEffectObservations(projectRoot: string): InstallationEffectRefusalObservation[] {
    return this.sessionEnv.installationEffectObservations(projectRoot);
  }
  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private refuseUnprovenInstallation(bindingId: string, toolName: InstallationCapabilityTool, projectRoot: string,
    actorRoleId: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined, metadata?: ReportHandbackMetadata): InstallSkillReceipt {
    return this.sessionEnv.refuseUnprovenInstallation(bindingId, toolName, projectRoot, actorRoleId, runtime, handle, metadata);
  }

  private runTaskIsFenced(projectRoot: string, taskId?: string, runId?: string): boolean {
    return !!(taskId && this.fencedRunTasks.get(projectRoot)?.has(taskId) || runId && this.fencedRuns.get(projectRoot)?.has(runId));
  }

  private async selectRunChangeForHandle(projectRoot: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined,
    request: Parameters<SelectRunChangeFn>[0], signal?: AbortSignal): Promise<Awaited<ReturnType<SelectRunChangeFn>>> {
    const blocked = (errorCode: string, message: string): Awaited<ReturnType<SelectRunChangeFn>> => ({ ok: false, status: "blocked",
      operationId: request.operationId, runId: request.runId, baseDigest: request.expectedPinDigest, targetDigest: null, errorCode, message });
    const key = this.sessionKey(projectRoot, "rapporteur", runtime), entry = this.sessions.get(key), origin = entry?.origins.running;
    const current = () => !!entry && !!origin && entry.handle === handle && this.sessions.get(key) === entry && entry.origins.running === origin &&
      entry.busy && !origin.settled && !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted;
    if (!current() || !origin?.taskId || !origin.turnId || !handle?.sessionId || signal?.aborted)
      return blocked("run-change-source-unavailable", "缺少当前真实受派策划回合，未改变运行状态。");
    const pendingKey = `${handle.sessionId}\u0000${origin.turnId}\u0000${request.operationId}`;
    if (this.deferredRunChanges.has(pendingKey)) return blocked("run-stop-deferred", "同一运行变更正在等待本轮真实结束，未重复执行。");
    const prepared = await prepareRunChange({ projectRoot, request, requesterTaskId: origin.taskId });
    if (!prepared.ok) return blocked(prepared.code, prepared.message);
    if (!current() || signal?.aborted || prepared.value.requesterCoreSessionId !== handle.sessionId || prepared.value.requesterTurnId !== origin.turnId)
      return blocked("run-change-source-changed", "准备期间真实发起回合已变化，未停止运行。");
    const plan = prepared.value, owners = this.ownedRunStopMembers(plan);
    if (!owners.ok) return blocked(owners.code, owners.message);
    const controller = new AbortController(); this.runChangeOperations.set(plan.planId, { plan, controller });
    // Fence exact old task/run producers before allowing another dispatch or prompt; no other run is suspended.
    for (const [manager, members] of owners.groups) {
      const tasks = manager.fencedRunTasks.get(projectRoot) ?? new Set<string>();
      for (const taskId of plan.taskIds) tasks.add(taskId);
      manager.fencedRunTasks.set(projectRoot, tasks);
      const runs = manager.fencedRuns.get(projectRoot) ?? new Set<string>(); runs.add(plan.runId); manager.fencedRuns.set(projectRoot, runs);
      const fact: DesktopRunStopFact = { managerId: manager.managerId, operationId: plan.operationId, runId: plan.runId, requestDigest: plan.requestDigest,
        generation: ++manager.runStopGeneration, state: "fenced", hostHandleIds: members.map(row => row.member.hostHandleId), targetSeq: manager.deliveryPersistSeq };
      manager.runStopFacts.set(`${projectRoot}\u0000${plan.operationId}`, { projectRoot, fact });
      manager.inventoryChanged(projectRoot, "run-stop-producers-fenced");
    }
    if (plan.deferred) {
      this.deferredRunChanges.set(pendingKey, { plan, entry: entry!, origin, controller });
      return blocked("run-stop-deferred", "已保留同一操作；本轮真实结束后由宿主继续停止，当前尚未提交运行变更。");
    }
    try { return await this.executeOwnedRunStop(plan, signal ? AbortSignal.any([signal, controller.signal]) : controller.signal); }
    finally { this.runChangeOperations.delete(plan.planId); }
  }

  /**
   * W6（团队计划登记 run 绑定，B1 AC-6/P-12）：与 `selectRunChangeForHandle` 同款「当前真实回合」校验——
   * 只信当前 busy 的受派 convener 回合的 `origin.taskId`，经 `inspectAssignedTask` 取该任务的实际 run
   * 并注入 `runId`；模型自报 runId 只作断言（不一致 ⇒ 既有 service 码 `plan-run-conflict`）。
   * inspect 失败直通其原码（`trunk-item-invalid`，不重写）；仅宿主本地前置用 host-local 码
   * （`plan-task-unavailable`/`plan-task-changed`/`plan-flow-conflict`——沿用 run-change-source-* 先例，
   * 不登记共享稳定码，S2）。
   */
  private async completeTeamPlanForHandle(projectRoot: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined,
    request: Parameters<CompleteTeamPlanFn>[0], direct: { completeTeamPlan: CompleteTeamPlanFn },
    signal?: AbortSignal): Promise<Awaited<ReturnType<CompleteTeamPlanFn>>> {
    const blocked = (errorCode: string, message: string): Awaited<ReturnType<CompleteTeamPlanFn>> => ({ ok: false, status: "blocked",
      operationId: request.operationId, baseDigest: request.baseDigest ?? null, targetDigest: null, errorCode, message });
    const key = this.sessionKey(projectRoot, "convener", runtime), entry = this.sessions.get(key), origin = entry?.origins.running;
    const current = () => !!entry && !!origin && entry.handle === handle && this.sessions.get(key) === entry && entry.origins.running === origin &&
      entry.busy && !origin.settled && !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted;
    if (!current() || !origin?.taskId || signal?.aborted)
      return blocked("plan-task-unavailable", "缺少当前真实受派运营回合或任务，未登记团队计划。");
    const assigned = await inspectAssignedTask({ projectRoot, actorRoleId: "convener", taskId: origin.taskId });
    if (!assigned.ok) return blocked(assigned.code, assigned.message ?? assigned.code);
    if (assigned.value.flowId !== request.flowId)
      return blocked("plan-flow-conflict", "团队计划 flow 与实际受派任务不一致，未登记团队计划。");
    if (request.runId !== undefined && request.runId !== assigned.value.runId)
      return blocked("plan-run-conflict", "Plan task refers to a different or unavailable real run");
    if (!current() || signal?.aborted)
      return blocked("plan-task-changed", "核验期间真实受派回合已变化，未登记团队计划。");
    return direct.completeTeamPlan({ ...request, runId: assigned.value.runId }, signal);
  }

  private ownedRunStopMembers(plan: Pick<RunChangeHostPlan, "projectRoot" | "handles">) {
    const groups = new Map<SessionManager, { member: RunChangeHostPlan["handles"][number]; handle: RoleSessionHandle }[]>();
    const invalid = (message: string) => ({ ok: false as const, code: "run-stop-host-instance-unproven", message });
    if (!plan.handles.length) return invalid("实际停止句柄集合不可用。");
    try {
      for (const member of plan.handles) {
        const owners = [...desktopSessionManagers].filter(manager => manager.observedHandles.has(member.hostHandleId));
        if (owners.length !== 1) return invalid("实际句柄没有唯一宿主，未停止运行。");
        const manager = owners[0]!, observed = manager.observedHandles.get(member.hostHandleId)!;
        const fact = manager.executionInventoryFacts(plan.projectRoot).sessions.find(row => row.hostHandleId === member.hostHandleId);
        const lifecycle = observed.handle?.inspectLifecycle?.();
        // P1.4 §3.2 C8 / I0-5 / Q8：native instance 为可选证据——absent 允许；
        // present-but-changed（instance/role 不符）拒绝。Core session/role/task/project 身份与宿主就绪检查不变。
        if (!fact || !observed.handle?.stopAndInspect || observed.handle.sessionId !== member.coreSessionId || fact.taskId !== member.taskId ||
            fact.roleId !== member.roleId || fact.projectRoot !== plan.projectRoot || !["live", "disposed"].includes(fact.phase) ||
            lifecycle?.sessionId !== member.coreSessionId ||
            (lifecycle.native !== undefined && member.nativeInstanceId !== undefined &&
              (lifecycle.native.instanceId !== member.nativeInstanceId || lifecycle.native.roleId !== member.roleId)))
          return invalid("原任务、Core 或 native 实例已变化，未停止运行。");
        if (!manager.deliveryStoreArmed || manager.openChains.size) return invalid("队列持久化或仍在创建的宿主尚未就绪，未停止运行。");
        const members = groups.get(manager) ?? []; members.push({ member, handle: observed.handle }); groups.set(manager, members);
      }
      return { ok: true as const, groups };
    } catch { return invalid("真实句柄生命周期无法读取，未停止运行。"); }
  }

  private async executeOwnedRunStop(plan: RunChangeHostPlan, signal: AbortSignal): Promise<Awaited<ReturnType<SelectRunChangeFn>>> {
    const blocked = (errorCode: string, message: string): Awaited<ReturnType<SelectRunChangeFn>> => ({ ok: false, status: "blocked",
      operationId: plan.operationId, runId: plan.runId, baseDigest: null, targetDigest: null, errorCode, message });
    const owned = this.ownedRunStopMembers(plan); if (!owned.ok) return blocked(owned.code, owned.message);
    try {
      for (const [manager, members] of owned.groups) for (const { member, handle } of members) {
        if (signal.aborted) return blocked("run-change-cancelled", "宿主运行变更已取消，未提交。");
        const fresh = handle.inspectLifecycle?.();
        const stopped = await handle.stopAndInspect!({ expectedSessionId: member.coreSessionId,
          ...(fresh?.turnId ? { expectedTurnId: fresh.turnId } : {}), timeoutMs: 5000 }, signal);
        // P1.4 §3.2 C8 / §3.7：终止判定=运行时中立 drain 谓词（status/processCoverage 仅证据、
        // native 可选：absent 允许、present-but-changed 拒绝）；5s 仅上限（W1 已 drain 即返回）。
        if (stopped.sessionId !== member.coreSessionId ||
            (stopped.native !== undefined && member.nativeInstanceId !== undefined &&
              (stopped.native.instanceId !== member.nativeInstanceId || stopped.native.roleId !== member.roleId)) ||
            !isRuntimeSessionDrained(stopped))
          return blocked("run-stop-lifecycle-unproven", "同一真实实例尚未排空，运行变更未提交。");
        const entry = [...manager.sessions.entries()].find(([, value]) => value.handle === handle);
        // Close the actual SDK stream while its original W consumer still owns the entry:
        // terminal reports must be consumed before removing their handback/persistence owner.
        if (entry) {
          await manager.disposeObservedHandle(handle);
          await entry[1].eventConsumerDone;
          if (entry[1].eventConsumerFailed) return blocked("run-stop-event-consumer-unproven", "原实例事件消费失败，未提交运行变更。");
          const error = await manager.disposeEntry(entry[0], entry[1]); if (error) return blocked("run-stop-dispose-failed", error);
        }
      }
      for (const [manager] of owned.groups) {
        const taskIds = new Set(plan.taskIds), rootPrefix = `${plan.projectRoot}\u0000`;
        const claimed = await manager.waitForRunStopDeliveryClaims({ projectRoot: plan.projectRoot, taskIds: plan.taskIds, signal });
        if (claimed.status !== "wait-complete") return blocked(claimed.code, "投递认领归属或结束状态尚未核实，未提交运行变更。");
        // Capture detached producers after affected claims have finished their actual send handoff.
        const deliveries = [...manager.taskDeliveryCommits.entries()].filter(([key]) => key.startsWith(rootPrefix) && taskIds.has(key.slice(rootPrefix.length))).map(([, row]) => row.done);
        const handbacks = [...manager.taskHandbackCommits.entries()].filter(([key]) => key.startsWith(rootPrefix) && taskIds.has(key.slice(rootPrefix.length))).map(([, promise]) => promise);
        await Promise.all([...deliveries, ...handbacks]);
        const cutoff = await manager.finishStopPersistence({ ok: true, note: "" });
        if (!cutoff.ok || !cutoff.deliveryQueuePersistence) return blocked("run-stop-persistence-unproven", cutoff.note);
        const row = manager.runStopFacts.get(`${plan.projectRoot}\u0000${plan.operationId}`);
        if (!row || row.fact.requestDigest !== plan.requestDigest) return blocked("run-stop-host-fence-unproven", "真实运行暂停来源已变化。");
        row.fact = { ...row.fact, targetSeq: cutoff.deliveryQueuePersistence.targetSeq };
        manager.inventoryChanged(plan.projectRoot, "run-stop-cutoff-completed");
        if (manager.inventoryPublicationErrors.has(plan.projectRoot)) return blocked("run-stop-inventory-unavailable", "停止事实发布失败，未提交运行变更。");
      }
      if (signal.aborted) return blocked("run-change-cancelled", "宿主运行变更已取消，未提交。");
      return await finalizeRunChange({ projectRoot: plan.projectRoot, planId: plan.planId, requestDigest: plan.requestDigest }, signal);
    } catch (error) { return blocked("run-stop-host-failed", error instanceof Error ? error.message : String(error)); }
  }

  private resumeDeferredRunChanges(entry: LiveSession, origin: DeliveryOrigin): void {
    for (const [key, held] of this.deferredRunChanges) {
      if (held.entry !== entry || held.origin !== origin || held.plan.requesterTurnId !== origin.turnId) continue;
      this.deferredRunChanges.delete(key);
      if (origin.outcome !== "completed" || entry.interactionState.lifetime.signal.aborted || held.controller.signal.aborted) {
        held.controller.abort(); this.runChangeOperations.delete(held.plan.planId); continue;
      }
      void Promise.resolve().then(() => this.executeOwnedRunStop(held.plan, held.controller.signal)).then(receipt => {
        this.emitDeliveryNote(entry.projectRoot, entry.runtime, entry.roleId, entry.roleId,
          receipt.message ?? (receipt.ok ? "原运行已停止。" : `运行变更尚未提交：${receipt.errorCode ?? receipt.status}`));
      }).catch(error => {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: entry.projectRoot, roleId: entry.roleId }).error("run-change.continuation.failed", error);
      }).finally(() => { this.runChangeOperations.delete(held.plan.planId); });
    }
  }

  /** 库存变更（薄委托 → `shared/inventory.ts`；observedRoots/发布失败表经显式状态面传入）。 */
  private inventoryChanged(projectRoot: string, reason: string): void {
    inventoryChanged(projectRoot, reason, this.inventoryState);
  }
  private publishDeliveryInventory(reason: string): void {
    publishDeliveryInventory(reason, this.inventoryState);
  }
  /** 库存函数的显式状态面（同一 Set/Map 实例；方案 §3.6 归属 run-change，B1 不搬状态）。 */
  private get inventoryState(): SessionInventoryState {
    return { observedInventoryRoots: this.observedInventoryRoots, inventoryPublicationErrors: this.inventoryPublicationErrors };
  }
  executionInventoryFacts(projectRoot: string): Pick<DesktopProjectExecutionInventory, "sessions" | "pendingOpens" | "queuedDispatches" | "activeDeliveries" | "deliveryQueuePersistence" | "runStops" | "controllerStops"> {
    const sessions: DesktopSessionInventoryFact[] = [];
    for (const { fact, handle } of this.observedHandles.values()) {
      if (fact.projectRoot !== projectRoot) continue;
      const current = structuredClone(fact);
      const entry = [...this.sessions.values()].find(entry => entry.handle === handle);
      const assignment = entry?.origins.running ? entry.origins.running.assignment : entry?.boundAssignment;
      const taskId = entry ? (entry.origins.running ? entry.origins.running.taskId : assignment?.taskId ?? entry.assignedTaskId) : current.taskId;
      if (taskId !== undefined) current.taskId = taskId; else if (entry) delete current.taskId;
      if (assignment?.runId) current.runId = assignment.runId;
      if (handle !== undefined) {
        if (handle.sessionId !== undefined) current.coreSessionId = handle.sessionId;
        try { if (handle.inspectToolSurface) current.toolSurface = structuredClone(handle.inspectToolSurface());
          else current.errors.push("tool-surface-observation-unavailable"); } catch { current.errors.push("tool-surface-observation-failed"); }
        try { if (handle.inspectLifecycle) current.lifecycle = structuredClone(handle.inspectLifecycle());
          else current.errors.push("lifecycle-observation-unavailable"); } catch { current.errors.push("lifecycle-observation-failed"); }
      }
      sessions.push(current);
    }
    return { sessions, deliveryQueuePersistence: [this.deliveryQueuePersistenceFacts()],
      controllerStops: [...this.controllerStopFacts.values()].filter(row => row.projectRoot === projectRoot).map(row => structuredClone(row.fact)),
      runStops: [...this.runStopFacts.values()].filter(row => row.projectRoot === projectRoot).map(row => structuredClone(row.fact)), pendingOpens: [...this.openChains.keys()].filter(key => key.startsWith(`${projectRoot}\u0000`)),
      queuedDispatches: [...this.deliveryQueues.entries()].filter(([key]) => key.startsWith(`${projectRoot}\u0000`)).flatMap(([, items]) => items.map(item => ({ queueEntryId: item.queueEntryId ?? "unknown", roleId: item.targetRoleId, runtime: item.runtime,
        taskId: item.taskId, kind: item.kind, sourceRoleId: item.sourceRoleId || "unknown",
        notificationSourceState: item.notificationSource ? "recorded" as const : "unknown" as const,
        ...(item.notificationSource ? { notificationSource: structuredClone(item.notificationSource), operationId: item.notificationSource.operationId } : {}),
        systemAssignmentState: item.kind !== "system" ? "not-system" as const : item.systemAssignment === undefined ? "unknown" as const : item.systemAssignment === null ? "unassigned" as const : "bound" as const,
        ...(item.systemAssignment ? { systemAssignmentTaskId: item.systemAssignment.taskId } : {}),
        lastAttempt: item.lastAttempt ? { ...item.lastAttempt } : { state: "unknown" as const } }))),
      activeDeliveries: [...this.activeDeliveries.entries()].filter(([key]) => key.startsWith(`${projectRoot}\u0000`)).map(([, item]) => ({ roleId: item.targetRoleId, runtime: item.runtime, taskId: item.taskId, kind: item.kind })) };
  }
  private async openObservedRoleSession(input: Parameters<SessionManagerDeps["openRoleSession"]>[0], deps: Parameters<SessionManagerDeps["openRoleSession"]>[1]): Promise<RoleSessionHandle> {
    const hostHandleId = randomUUID();
    const fact: DesktopSessionInventoryFact = { hostHandleId, projectRoot: input.project.projectRoot, roleId: input.roleId,
      runtime: input.runtime ?? "demo", kind: input.chiefDecisionContext ? "bounded-chief" : "role", phase: "creating", errors: [],
      ...(input.taskId ? { taskId: input.taskId } : {}), ...(input.project.documentContext?.runId ? { runId: input.project.documentContext.runId } : {}) };
    const record: { fact: DesktopSessionInventoryFact; handle?: RoleSessionHandle } = { fact };
    // Core's prepared bind is the sole owner of the native session-open admission lease.
    // Publish pending construction before entering Pipeline; this row is not a safety permit.
    this.observedHandles.set(hostHandleId, record); this.inventoryChanged(fact.projectRoot, "session-creating");
    try {
      if (this.inventoryPublicationErrors.has(fact.projectRoot)) throw new Error("会话库存登记失败，会话尚未创建。请检查诊断后重试。");
      const handle = await this.deps.openRoleSession(input, deps); record.handle = handle; fact.phase = "live";
      this.observedHandleIds.set(handle, hostHandleId); this.inventoryChanged(fact.projectRoot, "session-created");
      if (this.inventoryPublicationErrors.has(fact.projectRoot)) throw new Error("会话库存登记失败，无法接纳该会话。请检查诊断。");
      return handle;
    } catch (error) {
      fact.phase = "open-failed"; fact.errors.push("partial-construction-closure-unproven");
      try {
        const ref = await inspectRoleSessionOpenFailure({ error, hostHandleId });
        if (ref !== undefined) fact.openFailureRef = ref;
      } catch {
        // Evidence lookup failure must not replace the actual failed-open error or create authority.
        try { createDiagnosticLogger({ component: "desktop.session", projectRoot: fact.projectRoot, roleId: fact.roleId })
          .record("session.open.failure-ref.unavailable", { reasonCode: "pipeline-lookup-failed" }); } catch { /* preserve the original error */ }
      }
      if (record.handle) {
        try { await record.handle.dispose(); fact.phase = "disposed"; }
        catch { fact.phase = "dispose-failed"; fact.errors.push("failed-admission-disposal-unproven"); }
      }
      this.inventoryChanged(fact.projectRoot, "session-open-failed"); throw error;
    }
  }
  private ownsControllerDisposal(handle: RoleSessionHandle, lease: ControllerDisposalLease): boolean {
    const id = this.observedHandleIds.get(handle), fact = id ? this.observedHandles.get(id)?.fact : undefined;
    return !!id && !!fact && lease.projectRoot === fact.projectRoot && lease.kind === "session-dispose" && !!lease.operationId && lease.hostHandleIds.includes(id) &&
      [...desktopSessionManagers].some(manager => manager.controllerDisposalOwners.has(lease));
  }
  private async disposeObservedHandle(handle: RoleSessionHandle, heldLease?: ControllerDisposalLease): Promise<void> {
    const id = this.observedHandleIds.get(handle), record = id === undefined ? undefined : this.observedHandles.get(id);
    const root = record?.fact.projectRoot;
    if (heldLease && !this.ownsControllerDisposal(handle, heldLease)) throw new Error("controller-stop-dispose-owner-unproven");
    const lease = root && !heldLease ? beginGitHostAction({ projectRoot: root, kind: "session-dispose" }) : undefined;
    if (root && lease && !lease.ok) recordGitHostInterruption({ projectRoot: root, reason: "session-dispose-during-host-action", coreSessionId: handle.sessionId });
    if (record) { record.fact.phase = "disposing"; this.inventoryChanged(record.fact.projectRoot, "session-disposing"); }
    try { await handle.dispose(); if (record) record.fact.phase = "disposed"; }
    catch (error) { if (record) { record.fact.phase = "dispose-failed"; record.fact.errors.push("disposal-unproven"); } throw error; }
    finally {
      if (record) this.inventoryChanged(record.fact.projectRoot, "session-dispose-observed");
      if (root && lease?.ok) {
        const ended = endGitHostAction({ projectRoot: root, leaseId: lease.leaseId });
        if (!ended.ok) throw new Error("会话处置协调未能完成，请检查诊断。");
      }
    }
  }

  private readonly deps: SessionManagerDeps;
  private readonly loadEffectiveConfig: (opts: LoadConfigOptions) => Promise<LoadedConfig>;
  /** 保活中的会话：project × role × runtime → 句柄（上限见 `MAX_LIVE_SESSIONS`）。 */
  private readonly sessions = new Map<string, LiveSession>();
  /** 客户消息计数（L-1：逐条独立入队键——客户消息**不去重**）。 */
  private messageSeq = 0;
  /** LRU 时钟（单调递增）。 */
  private lruClock = 0;
  /** 最近一次 open 的角色（`send` 的目标）。 */
  private activeRoleId: string | null = null;
  /** 用户显式选择/关闭的版本：后台重建只能恢复同一选择，不能抢回用户的新目标。 */
  private selectionVersion = 0;
  private selectionTargetRoleId: string | null = null;
  /** 关闭全部使旧扫描尚未开始的重建步骤失效；选角色不取消后台扫描。 */
  private boundaryRefreshVersion = 0;
  /** 保存成功才递增的配置版本；活句柄记录它创建时的版本。 */
  private readonly profileRevisions = new Map<RuntimeKind, number>();
  // —— 投递机（E-1 回交投 su + H-1 派发投目标角色；**同一套**，不造第二套）——
  /** 待投递队列：`${projectRoot}\0${targetRoleId}` → 条目（**按到达序**；目标忙时积压，其 settled 后按序放行）。 */
  private readonly deliveryQueues = new Map<string, DeliveryItem[]>();
  /**
   * 投递机**串行链**（每项目一条，2026-10-12 L-1 修正）：多触发点（入队/开尾/settled/派发/回交）可能
   * **并发**调 `drainQueue`——不串行则同一队列会被两个 drain 同时 shift/open（真机缺陷：su 被**重复开启**
   * 两个会话、坏条目误报「形状不符」）。串行后每个 `drainQueueUnsafe` 都在前一个跑完后才开始（各自重读队列）。
   * **F-2-M1（2026-10-16 客户批准）**：链防的仍正是「同一队列的并发 shift/open 与认领竞态」；**持有已收窄到
   * 认领段**——`drainQueueUnsafe` 在认领段（shift → 置忙 → 登记 → 调 `sendDelivery` 取 promise）后**立即释放链**，
   * 不再覆盖目标**整轮**（旧实现链持有贯穿 `await sendDelivery` 完成＝把 send promise 挂到整轮结束——真机实测
   * 单链持有 16 分 55 秒，同项目其他角色的投递/回交/客户消息全被迫串行等待）。
   */
  private readonly drainChains = new Map<string, Promise<void>>();
  private readonly drainClaimRecords = new Set<{ projectRoot: string; taskIds?: readonly string[]; owner?: ActualDispatchSource; done: Promise<void> }>();
  /** Explicit stop fences automatic work, including late callbacks; only an explicit resume reopens its key. */
  private deliveryStopVersion = 0;
  private deliveryStoppedAll = false;
  private readonly stoppedDeliveryKeys = new Set<string>();
  private readonly resumedDeliveryKeys = new Set<string>();
  private readonly deliveryKeyStopVersions = new Map<string, number>();
  private deliveryIsStopped(key: string): boolean {
    return this.stoppedDeliveryKeys.has(key) || this.deliveryStoppedAll && !this.resumedDeliveryKeys.has(key);
  }
  private deliveryLifecycle(key: string): string {
    return `${this.deliveryStopVersion}:${this.deliveryKeyStopVersions.get(key) ?? 0}`;
  }
  private resumeDelivery(key: string): void {
    this.stoppedDeliveryKeys.delete(key); this.resumedDeliveryKeys.add(key);
  }
  /**
   * **`openInternal` 的按会话键互斥链（F-2-opt2，2026-10-16 客户批准）**：同一会话键的 `openInternal` 至多
   * 一个在跑（其余按序等待）——闭合既有双开窗口（① 用户 open × 投递机自动开；② 两次用户 open）：旧实现
   * 两方并发穿过 `sessions.get(key)` 的存在性检查后各自开会话，先建者被后建者覆盖（句柄泄漏）。
   * **防死锁（与 rebuildChains 的关系）**：持锁方「续接前查陈旧」要等 `rebuildChains`；重建的**重开续段**
   * （同一逻辑流）因此必须直调 `openInternalUnsafe`（**不再入本链**）——否则「持锁等 rebuild 链 ← rebuild
   * 链等锁」成环。重建链内的重开与持锁方并发是安全的：持锁方此时必然正阻塞在等待该重建链（或旧条目已被
   * dispose、重建链内重开走纯新建路径、不再触发任何 rebuild 检查）。
   */
  private readonly openChains = new Map<string, Promise<void>>();
  /**
   * **作废重建的按角色串行链（2026-10-13 状态机修复）**：`rebuildIfBoundaryStale` 经它串行化——
   * 同一角色任一时刻至多一个重建在跑（并发触发方按序等待，各自重查陈旧；见该方法注释）。
   */
  private readonly rebuildChains = new Map<string, Promise<void>>();
  /**
   * **正在跑的那条投递**（`queueKey(projectRoot, roleId)` → 条目，2026-10-12 右栏「待办 / 队列」追加需求）：
   * 投递成功（`handle.send` 已开跑）即登记、该角色 `settled` / 投递失败 / dispose 时清除——右栏据此把
   * 该条如实标注「进行中」（**排队 ≠ 已执行**；直接 send 开跑的一轮不入本表——它不是队列条目）。
   */
  private readonly activeDeliveries = new Map<string, DeliveryItem>();
  /** B 批：星形任务 id（内存索引；派发/恢复/列表时登记——回交路由用同步判定，保持事件顺序）。 */
  private readonly starTaskIds = new Set<string>();
  /** 2026-10-29（方案 v2.1 §5.4/M9）：任务创建者内存索引（`task.created.from`）——报告按创建者路由。
   *  B1 提交 2/2：状态随 `rememberTaskCreator` 迁入 `./session/shared/tasks-store.ts`（模块单例，见导入）。 */
  /** B 批：已写入 `task.reported` 的键（`taskId\0turnId|摘要`；防同轮重复事件）。 */
  private readonly reportedTaskKeys = new Set<string>();
  /** B-07：连续卡死升级卡（按链根去重；同一链只提交一次）。 */
  private readonly escalationRequests = new Map<string, Promise<{ escalated: boolean; requestId?: string; selected?: string; message: string }>>();
  /** 2026-11-05：在途方案升级卡（`projectRoot\0flowId` 去重；同一 flow 至多一张）。 */
  private readonly planEscalations = new Map<string, Promise<void>>();
  /**
   * 2026-11-05（客户最终口径）：已向 convener 发过「是否自己调用 report_plan_escalation」提示的 flow。
   * 首次 blocked 即提示，同一 flow 在 done/failed/aborted 或升级卡成功提交后清除标记（下一次 blocked 可再提示）。
   */
  private readonly planEscalationPrompted = new Set<string>();
  /** C 批：系统通知去重（`requestId\0event`）。 */
  private readonly requestNotifiedKeys = new Set<string>();
  /**
   * 2026-11-02（版本决策）：同进程未决请求（subjectKey -> requestId）；跨重启由账本结构化扫描兜底。
   * 只用于 `decision-pending` 的 check-then-set，不当作第二份持久状态。
   */
  private readonly versionDecisionPending = new Map<string, string>();
  /** 版本决策 check-then-set 的 per-project 串行链（不持有到卡裁决/执行，避免阻塞第二请求的超时）。 */
  private readonly versionDecisionChains = new Map<string, Promise<void>>();
  /** C 批：已呈现过的申请（`requestId\0customer|judge`）。 */
  private readonly requestPresentedKeys = new Set<string>();
  /** B 批：每角色最近运行日志的内存摘要（看护巡检/日志静默用；真实日志在 `.ans/state/logs/`）。 */
  private readonly lastRoleActivity = new Map<string, { at: number; kind: string; summary: string }>();
  private readonly reportStates = new Map<string, { owner?: LiveSession; event?: HandbackEvent; state?: ReportSaveStateV1; queued: boolean; inFlight?: boolean }>();
  private readonly attemptStates = new Map<string, { owner?: LiveSession; receipt: RuntimeDeliveryReceiptV1 }>();
  private readonly knownReports = new Set<string>();
  private readonly knownAttempts = new Set<string>();
  private readonly persistenceInFlight = new Map<string, Promise<unknown>>();
  /** B2：证据/契约/文档格式检查（9 方法 → `./session/evidence.ts`；构造见 constructor）。 */
  private readonly evidence: Evidence;
  /** B2：报告/投递持久化状态与回执操作（6 方法 → `./session/persistence.ts`）。
   *  五个状态 Map/Set 按方案 §3.6 **暂留本类**，构造时以同一实例引用注入（B1 同款口径）。 */
  private readonly persistence: Persistence;
  /** B3：任务账本业务/重派/终止/升级（17 方法 → `./session/tasks.ts`）。状态
   *  starTaskIds/activeDispatchKeys/escalationRequests/lastRoleActivity 按方案 §3.6 暂留本类，
   *  构造时以同一实例引用注入（B1/B2 同款口径）。 */
  private readonly tasks: Tasks;
  /** B3：看护/状态文本/诊断尾部/治理投影/网络状态（17 方法 → `./session/diagnostics.ts`）。
   *  lastTurns/lastAssistantText/governanceHandbackMirrored/governanceClientProjections/networkState
   *  按方案 §3.6 归属本模块，B3 暂留本类（同一实例引用；networkState 经 get/set 回调接回字段）。 */
  private readonly diagnostics: Diagnostics;
  /** B3：边界/画像重建、技能/MCP 安装卸载、激活刷新（11 方法 → `./session/session-env.ts`）。
   *  boundaryRefreshVersion/profileRevisions/rebuildChains/installationRefusals 按方案 §3.6 归属本模块，
   *  B3 暂留本类（同一实例引用；selectionVersion/activeRoleId 经 get/set 回调接回字段）。 */
  private readonly sessionEnv: SessionEnv;
  /** 回交去重键（`handbackKey` 单一来源；`projectRoot\0<key>`）——**一条回交只投递一次**（永不放行重投）。 */
  private readonly enqueuedHandbackKeys = new Set<string>();
  private readonly pendingHandbackKeys = new Set<string>();
  private readonly taskHandbackCommits = new Map<string, Promise<void>>();
  /** Only an already-started delivery observation; Core.send never awaits the detached report consumer. */
  private readonly taskDeliveryCommits = new Map<string, { done: Promise<void>; finish: () => void }>();
  /**
   * 派发去重键——**队列期窗口去重**（投递成功即释放，见 `drainQueue`；返工可再派发同文任务）。
   * 契约的 `DispatchTaskPayload` 无 id/时间（钉死不扩），桌面无法区分「重试同一调用」与「新的一次相同文本
   * 派发」；在途窗口去重防重投，送达后放行以保返工回路可用——语义在 change 文档写明。
   */
  private readonly activeDispatchKeys = new Set<string>();
  /**
   * 2026-10-31（run-change 触发缺陷）：**自动**呈现 run-change 卡的去重键（`projectRoot\0runId`）。
   * 同一 pinned run 只自动弹一次——客户已决定/已呈现后，后续冻结冲突只回结构化拒绝（走显式入口），
   * 不刷屏、不重复替客户要决定。显式入口（会话头按钮/IPC）不受此集合限制。
   */
  private readonly runChangeAutoPrompted = new Set<string>();
  /** 「队列受阻」（枚举不到目标）只如实提示**一次**（避免每次触发刷同一行）。 */
  private readonly suDeliveryBlockedNoted = new Set<string>();
  /**
   * **各角色最近一轮的终局**（G-2/W1「lastTurn 小状态」）：settled 时在事件消费循环里顺带落表
   * （outcome + 时刻；只记四值终局——旧来源缺事实不猜）。看护 `role_status` 的「最近一轮」行与未来
   * 其他只读消费方取用；不参与任何判定。
   */
  private readonly lastTurns = new Map<string, { outcome: RuntimeTurnOutcome; at: string; errorCode?: string }>();
  /**
   * **各角色本轮 assistant 正文累积**（2026-10-18 客户反馈「内部治理角色，应该都向联络官反馈」）：
   * 只记 `kind:"message"` 且**无结构化 detail** 的普通助手消息（delivery-note/prompt-input/receipt/
   * reasoning 等系统行一律不记）。Claude 一条回复可能拆成多个 text block（各发一条 message）——
   * 同一键 + 同一 `turnId` 用 `\n` 追加；`turnId` 变化即重置；总长上限 4000 码点（超出保留最新，
   * 前置 `…`）。settle 时由 `mirrorGovernanceFeedback` 取出即删。不参与任何判定。
   */
  private readonly lastAssistantText = new Map<string, { turnId?: string; text: string }>();
  /**
   * **内置来源回交已投 Lead 的短时标记**（2026-10-24 治理协调，设计 v1 §6.2/§6.3）：
   * `queueKey` → 入队时刻。内置角色回交在编排侧被 `suppressHandback` 抑制，正常不会出现；
   * `handleHandback` 仍需对「防御性出现」的内置回交路由到 Lead，并与同一轮 settle 的
   * `mirrorGovernanceFeedback` **去重**（同一轮只向 Lead 投一条）。只在内存、短时有效；不参与任何判定。
   */
  private readonly governanceHandbackMirrored = new Map<string, number>();
  /**
   * **治理反馈客户投影登记表**（2026-10-25 A3/A4）：`queueKey + \0 + sha256(text)` → 投影 + 登记时刻。
   * `mirrorGovernanceFeedback` 发送成功后登记；事件消费循环对 `prompt-input` 回显按同一文本查表，
   * 命中则把 `clientProjection` 附到外推事件的 `detail`（内部原文 `detail.text` 原样保留）。
   * 有界（128，FIFO）+ 30 分钟 TTL；只在内存、不持久化、不参与任何判定。
   */
  private readonly governanceClientProjections = new Map<string, { projection: GovernanceClientProjectionV1; at: number }>();
  /**
   * **回交主人**最近一次开会话所用 runtime（评审 §5.6：`lastSuRuntime` → `lastGovernanceRuntime`）：
   * trio = Convener（`schedule`），single = 主入口 su。看护向回交主人投系统消息时 queueKey 需要 runtime
   * ——优先活会话，其次本记录，最后 `"pi"`（真实产品默认；demo 是开发替身）。仅为投递择路，不改任何判定。
   */
  private readonly lastGovernanceRuntime = new Map<string, RuntimeKind>();
  /**
   * **投递队列持久化（2026-10-20 客户要求：重启后任务自动续跑）**：存储路径（缺省 ⇒ 不持久化）、
   * 串行原子写链、以及「delivery.end 已完成」键（`queueKey\0dedupKey`——in-flight 快照据此排除，
   * 崩溃重启只重投**未完成**的投递）。
   */
  private readonly deliveryQueueStorePath: string | undefined;
  private deliveryPersistOutcome: DeliveryQueuePersistenceOutcome = { completedSeq: 0, committedSeq: 0, failureCount: 0 };
  private deliveryPersistChain: Promise<DeliveryQueuePersistenceOutcome> = Promise.resolve(this.deliveryPersistOutcome);
  private deliveryPersistSeq = 0;
  private readonly deliveredDeliveryKeys = new Set<string>();
  /**
   * **应用任务「已投递」标记（2026-10-25 真机重复投递修复；只在内存）**：稳定 `clientMessageId`
   * （`ans-app-task:` 前缀）→ 本进程内已 ACK/投递成功。判据：
   *  · **ACK 即已投递**（`sendDelivery` 的 onTurnStarted 同步回执）或发送成功——之后同一任务的重建续投/
   *    应用侧重复调用**一律不再发送**；失败但从未 ACK 的仍按既有语义保留重试；
   *  · **跨重启语义**：标记不落盘。重启后持久队列里的 in-flight/queued 项仍按既有「重启续跑」重投
   *    一次（无法证明上一进程已投递）；但同一应用任务的**内容稳定键**会随队列项持久化，重启后新的
   *    同任务调用可与恢复项相认（不重复入队）。
   *  · **显式重新入队**（返工同文再派）清除对应键——送达后同文再派仍放行（既有返工回路不变）。
   *  · 有界 FIFO（`MAX_DELIVERED_APP_TASK_IDS`）防长跑进程无界增长；淘汰最旧键只影响极旧同文的去重。
   */
  private readonly deliveredAppTaskIds = new Set<string>();
  /**
   * 持久化**武装**标志：只有在 `restorePersistedDeliveries()` 读过磁盘（或确认文件不存在）后才允许写——
   * 防止启动早期（恢复之前）的一次入队用空内存快照覆盖磁盘上的待恢复条目。
   */
  private deliveryStoreArmed = false;
  /**
   * **P2 网络状态（2026-10-30）**：最近一次主进程网络快照（monitor 经 Interface 推入）。
   * `null` = 尚未收到（按在线处理；不误判离线）。离线期间队列保留、不认领新投递；恢复后按既有 drain 继续。
   */
  private networkState: NetworkState | null = null;

  constructor(deps: SessionManagerDeps) {
    this.deps = deps;
    this.loadEffectiveConfig = deps.loadEffectiveConfig ?? defaultLoadEffectiveConfig;
    this.deliveryQueueStorePath = deps.deliveryQueueStorePath;
    // B2 两阶段装配：模块构造时注入只读端口/状态引用；端口方法只在运行期调用（不改变构造期语义）。
    this.evidence = new Evidence(deps);
    this.persistence = new Persistence(
      {
        sessions: this.sessions,
        reportStates: this.reportStates,
        attemptStates: this.attemptStates,
        knownReports: this.knownReports,
        knownAttempts: this.knownAttempts,
        persistenceInFlight: this.persistenceInFlight,
      },
      {
        handleHandback: (projectRoot, runtime, hb, report, liveReport, liveDurability, flowId) =>
          this.handleHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId),
        handbackFlowId: (entry, hb) => this.handbackFlowId(entry, hb),
      },
    );
    // B3 两阶段装配：模块构造时注入只读端口/状态引用；端口方法只在运行期调用（不改变构造期语义）。
    this.tasks = new Tasks(
      {
        sessions: this.sessions,
        deliveryQueues: this.deliveryQueues,
        activeDeliveries: this.activeDeliveries,
        lastGovernanceRuntime: this.lastGovernanceRuntime,
        starTaskIds: this.starTaskIds,
        activeDispatchKeys: this.activeDispatchKeys,
        escalationRequests: this.escalationRequests,
        lastRoleActivity: this.lastRoleActivity,
      },
      {
        restoreRequestState: (projectRoot, state) => this.restoreRequestState(projectRoot, state),
        restoreVersionDecisions: (projectRoot, state) => this.restoreVersionDecisions(projectRoot, state),
        findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId),
        enqueueDelivery: (projectRoot, targetRoleId, item) => this.enqueueDelivery(projectRoot, targetRoleId, item),
        drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime),
        appDispatchClientMessageId: (dedupKey) => this.appDispatchClientMessageId(dedupKey),
        stopExactController: (input, caller) => this.stopExactController(input, caller),
        ensureFreshRoleSession: (projectRoot, roleId, runtime) => this.ensureFreshRoleSession(projectRoot, roleId, runtime),
        withRequestLifecycle: (projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride, lifecycle) =>
          this.withRequestLifecycle(projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride, lifecycle),
      },
      deps,
    );
    this.diagnostics = new Diagnostics(
      {
        sessions: this.sessions,
        deliveryQueues: this.deliveryQueues,
        activeDeliveries: this.activeDeliveries,
        openChains: this.openChains,
        rebuildChains: this.rebuildChains,
        lastGovernanceRuntime: this.lastGovernanceRuntime,
        lastRoleActivity: this.lastRoleActivity,
        lastTurns: this.lastTurns,
        lastAssistantText: this.lastAssistantText,
        governanceHandbackMirrored: this.governanceHandbackMirrored,
        governanceClientProjections: this.governanceClientProjections,
        getNetworkState: () => this.networkState,
        setNetworkState: (state) => { this.networkState = state; },
        getActiveRoleId: () => this.activeRoleId,
      },
      {
        openBackground: (req) => this.openBackground(req),
        sendBackground: (input) => this.sendBackground(input),
        notifyRoleState: (projectRoot, targetRoleId, runtime) => this.notifyRoleState(projectRoot, targetRoleId, runtime),
        drainAllQueuesFor: (projectRoot) => this.drainAllQueuesFor(projectRoot),
        drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime),
        enqueueDelivery: (projectRoot, targetRoleId, item) => this.enqueueDelivery(projectRoot, targetRoleId, item),
      },
      deps,
    );
    this.sessionEnv = new SessionEnv(
      {
        sessions: this.sessions,
        rebuildChains: this.rebuildChains,
        installationRefusals: this.installationRefusals,
        getSelectionVersion: () => this.selectionVersion,
        getBoundaryRefreshVersion: () => this.boundaryRefreshVersion,
        getActiveRoleId: () => this.activeRoleId,
        setActiveRoleId: (roleId) => { this.activeRoleId = roleId; },
      },
      {
        disposeEntry: (roleId, entry) => this.disposeEntry(roleId, entry),
        hasBusyRuntime: (runtime) => this.hasBusyRuntime(runtime),
        openInternalUnsafe: (req, userInitiated, selectionVersion, internalReopen) => this.openInternalUnsafe(req, userInitiated, selectionVersion, internalReopen),
        profileRevision: (runtime) => this.profileRevision(runtime),
        rebuildSession: (target, beforeDispose) => this.rebuildSession(target, beforeDispose),
        isCustomerInitiatedTurn: (projectRoot, runtime, roleId) => this.isCustomerInitiatedTurn(projectRoot, runtime, roleId),
        watchdogDeliver: (projectRoot, message) => this.watchdogDeliver(projectRoot, message),
      },
      deps,
    );
  }

  // —————————————— G-2（W1）：看护的观察/活动转发与时钟 ——————————————

  /** 时钟（薄委托 → `shared/clock.ts`；注入以便单测；缺省 Date.now——与会话时间戳、投递入队时间同源）。 */
  private now(): number {
    return now(this.deps);
  }

  /** 转发一条结构化事件给看护器（隔离：看护回调抛错绝不影响会话/投递——看护永不阻断判定链）。 */
  private observeWatchdog(projectRoot: string, observation: WatchdogObservation): void {
    try {
      this.deps.watchdogObserver?.(projectRoot, observation);
    } catch {
      // 看护观察失败 = 无看护（fail-safe toward 现状），不记录也不上抛（回调自身已带诊断）。
    }
  }

  /** 记一次**真实活动**（W3 滞回重武装信号；由本层判定后转发——`kind:"system"` 投递相关一律不记，防骚扰回路）。 */
  private noteWatchdogActivity(projectRoot: string, reason: string): void {
    if (!projectRoot) return;
    this.observeWatchdog(projectRoot, { kind: "activity", reason });
  }

  /** 会话键（薄委托 → `shared/keys.ts`）。 */
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string {
    return sessionKey(projectRoot, roleId, runtime);
  }
  /** 目标键（薄委托 → `shared/keys.ts`；只读状态回调保持原求值时机与次数）。 */
  private targetKey(target: string | SessionTarget): string | undefined {
    const state: TargetKeyState = {
      activeEntry: () => this.activeEntry(),
      activeRoleId: () => this.activeRoleId,
      sessionKeys: () => this.sessions.keys(),
      rebuildChainKeys: () => this.rebuildChains.keys(),
    };
    return targetKey(target, state);
  }
  profileRevision(runtime: RuntimeKind): number { return this.profileRevisions.get(runtime) ?? 0; }
  profileChanged(runtime: RuntimeKind): number {
    const revision = this.profileRevision(runtime) + 1;
    this.profileRevisions.set(runtime, revision);
    return revision;
  }
  hasBusyRuntime(runtime: RuntimeKind): boolean { return [...this.sessions.values()].some((entry) => entry.runtime === runtime && entry.busy); }
  hasStaleProfile(runtime: RuntimeKind): boolean { return [...this.sessions.values()].some((entry) => entry.runtime === runtime && entry.profileRevision !== this.profileRevision(runtime)); }
  liveSessionViews(): { projectRoot: string; roleId: string; runtime: RuntimeKind; profileRevision: number }[] {
    return [...this.sessions.values()].map((entry) => ({ projectRoot: entry.projectRoot, roleId: entry.roleId, runtime: entry.runtime, profileRevision: entry.profileRevision }));
  }

  /**
   * 聚合当前已打开会话的后台任务（2026-10-25）：按 `projectRoot + runtime` 过滤，直接读各句柄的
   * `listBackgroundTasks()`，**不缓存、不持久化**（任务只存在于会话内存）。句柄无该方法 ⇒ 跳过该角色；
   * 没有任何具备能力的活会话 ⇒ 空列表 + `unavailable:true`（「没有任务」与「不支持」必须可区分）。
   */
  listBackgroundTasks(projectRoot: string, runtime: RuntimeKind): BackgroundTasksListReply {
    const tasks: BackgroundTaskView[] = [];
    let capable = 0;
    for (const entry of this.sessions.values()) {
      if (entry.projectRoot !== projectRoot || entry.runtime !== runtime) continue;
      const list = entry.handle.listBackgroundTasks;
      if (list === undefined) continue;
      capable += 1;
      try {
        for (const task of list.call(entry.handle)) {
          // 快照只读复制：加来源角色/引擎；不缓存、不跨会话记忆。
          tasks.push({ ...task, roleId: entry.roleId, runtime: entry.runtime });
        }
      } catch (error) {
        // 单会话读取异常不拖垮整个列表、也不伪造任务：如实记诊断，其余角色照常返回。
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: entry.roleId }).error(
          "background-tasks.list.failed",
          error,
          { runtime: entry.runtime },
        );
      }
    }
    return { ok: true, projectRoot, runtime, tasks, unavailable: capable === 0 };
  }

  /**
   * 读取某会话内后台任务的状态与日志尾部（默认 both/40 行、上限 200 由底层钳制）。
   * 找不到会话/句柄无能力如实失败；未知/已过期任务由底层返回 `undefined`——本层按失败回执，不造任务、不造日志。
   */
  readBackgroundTask(input: BackgroundTaskReadInput): BackgroundTaskReadReply {
    const entry = this.sessions.get(this.sessionKey(input.projectRoot, input.roleId, input.runtime));
    if (entry === undefined) {
      return { ok: false, error: mainT("main.session.releaseNoSession", { roleId: input.roleId }) };
    }
    const read = entry.handle.readBackgroundTask;
    if (read === undefined) {
      return { ok: false, error: mainT("main.backgroundTasks.unavailable") };
    }
    const options: BackgroundTaskReadOptions = {
      ...(input.stream !== undefined ? { stream: input.stream } : {}),
      ...(input.tailLines !== undefined ? { tailLines: input.tailLines } : {}),
    };
    const hasOptions = input.stream !== undefined || input.tailLines !== undefined;
    try {
      const result = read.call(entry.handle, input.taskId, hasOptions ? options : undefined);
      if (result === undefined) {
        // 未知/已过期任务：底层如实返回 undefined。本层不猜状态、不伪造日志，按失败回执。
        return { ok: false, error: mainT("main.backgroundTasks.unavailable") };
      }
      return { ok: true, result };
    } catch (error) {
      // 契约上 read 不抛；真抛了也如实回执（不静默、不伪造空结果）。
      createDiagnosticLogger({ component: "desktop.session", projectRoot: input.projectRoot, roleId: input.roleId }).error(
        "background-tasks.read.failed",
        error,
        { runtime: input.runtime, taskId: input.taskId },
      );
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 停止某会话内的后台任务：底层结果（含 `unknown-task`/`closed`/`timeout`，以及成功）**原样返回**，
   * 绝不改写成成功。找不到会话 ⇒ `closed`（会话不可用）；句柄无能力 ⇒ `unavailable`；
   * 底层抛错 ⇒ 如实失败并带原始消息（不吞异常、不假装已停止）。
   */
  async stopBackgroundTask(input: BackgroundTaskStopInput): Promise<BackgroundTaskStopReply> {
    const entry = this.sessions.get(this.sessionKey(input.projectRoot, input.roleId, input.runtime));
    if (entry === undefined) {
      return { ok: false, reason: "closed", message: mainT("main.session.releaseNoSession", { roleId: input.roleId }) };
    }
    const stop = entry.handle.stopBackgroundTask;
    if (stop === undefined) {
      return { ok: false, reason: "unavailable", message: mainT("main.backgroundTasks.unavailable") };
    }
    const options: BackgroundTaskStopOptions | undefined = input.force === true ? { force: true } : undefined;
    try {
      return await stop.call(entry.handle, input.taskId, options);
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot: input.projectRoot, roleId: input.roleId }).error(
        "background-tasks.stop.failed",
        error,
        { runtime: input.runtime, taskId: input.taskId },
      );
      return { ok: false, reason: "unavailable", message: error instanceof Error ? error.message : String(error) };
    }
  }
  /** 上下文来源投影（薄委托 → `shared/session-views.ts`；纯投影）。 */
  private contextInfo(handle: RoleSessionHandle): Pick<OpenResult, "contextSource" | "contextWarning"> {
    return contextInfo(handle);
  }

  /**
   * **P0 收尾不变量（2026-10-30 现场）**：`busy` 已复位但 `origins.running` 仍残留的陈旧投递归属——
   * 标记 settled 并移除，记 `turn.origin-missing`。**只处理投递层状态，不伪造 turn**。
   * 返回是否做了清理。
   */
  private healStaleOrigin(entry: LiveSession, reasonCode: string): boolean {
    const stale = entry.origins.running;
    if (entry.busy || stale === undefined) return false;
    stale.settled = true;
    delete entry.origins.running;
    this.trimDeliveryOrigins(entry);
    createDiagnosticLogger({ component: "desktop.session", projectRoot: entry.projectRoot, roleId: entry.roleId }).record(
      "turn.origin-missing",
      {
        reasonCode,
        ...(stale.turnId !== undefined ? { turnId: stale.turnId } : {}),
        queueDepth: (this.deliveryQueues.get(this.queueKey(entry.projectRoot, entry.roleId, entry.runtime)) ?? []).length,
      },
    );
    return true;
  }

  /**
   * **turn lease**（P0：收尾不变量）：只有「未忙且没有正在跑的 origin」才能开跑新轮。
   * 拿不到 lease ⇒ `undefined`（调用方入队/保留队首）——**绝不覆盖** `origins.running`（失败投递不得
   * 删/盖另一个正在运行回合的归属）。
   */
  private beginDeliveryOrigin(entry: LiveSession, clientMessageId?: string): DeliveryOrigin | undefined {
    if (entry.busy || entry.origins.running !== undefined) return undefined;
    const origin: DeliveryOrigin = { settled: false };
    if (clientMessageId !== undefined) origin.clientMessageId = clientMessageId;
    entry.origins.running = origin;
    return origin;
  }

  private captureDeliveryOrigin(entry: LiveSession, event: OrchestrationEvent): DeliveryOrigin | undefined {
    if (event.kind === "handback") return undefined;
    if (event.runtime !== undefined && event.runtime !== entry.runtime) return undefined;
    if (event.roleId !== undefined && event.roleId !== entry.roleId) return undefined;
    if (typeof event.turnId !== "string" || event.turnId === "") return undefined;
    return entry.origins.byTurn.get(event.turnId); // Only the original prompt's real ack creates this mapping.
  }

  private async sendDelivery(entry: LiveSession, origin: DeliveryOrigin, text: string, opts?: PromptOptions, requiresHandback = false, handbackTaskId?: string,
    reportedChildren?: readonly { childTaskId: string; childRoleId: string; flowId?: string }[], queuedSystemAssignment?: DeliveryAssignment | null, applicationNotice = false, controllerResume?: ControllerResumeDelivery): Promise<void> {
    const key = this.sessionKey(entry.projectRoot, entry.roleId, entry.runtime);
    const current = () => this.sessions.get(key) === entry && entry.origins.running === origin && !origin.settled &&
      !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted && !this.deliveryIsStopped(key);
    if (!current()) throw new Error("delivery-assignment-source-changed:当前会话或投递来源已变化");
    let assignment: DeliveryAssignment | undefined;
    const resolve = async (source: Parameters<typeof resolveDeliveryAssignment>[0]["source"], flowId?: string, runId?: string) => {
      const result = await resolveDeliveryAssignment({ projectRoot: entry.projectRoot, recipientRoleId: entry.roleId, source,
        ...(flowId ? { expectedFlowId: flowId } : {}), ...(runId ? { expectedRunId: runId } : {}) });
      if (!current()) throw new Error("delivery-assignment-source-changed:核验期间当前会话或投递来源已变化");
      if (!result.ok) { origin.assignmentRejectionCode = result.code; throw new Error(`${result.code}:${result.message}`); }
      if (assignment && (assignment.taskId !== result.value.taskId || assignment.flowId !== result.value.flowId || assignment.runId !== result.value.runId))
        throw new Error("delivery-assignment-mixed:不同父任务的回交不能共用一次任务回合");
      assignment = result.value;
    };
    if (requiresHandback && handbackTaskId) {
      // T3 B1（AC-12/AC-23）：fixed 任务（task.created 携带 workflowId）不是 trunk run assignment——
      // 跳过 legacy 的 assigned-task 绑定解析（否则无 runId 的 fixed 任务必然
      // `delivery-assignment-unavailable` 而无法投递）。legacy 任务路径逐字不变。
      // T3 B8.2（2026-11-11，RR3 根因 2）：但 fixed 派发**必须把本轮 origin 绑定到真实任务 id/flow**
      // （task.created 账本事实，无 run/assignment）——否则运营回合的 `dispatch_task` 拿不到
      // `source.origin.taskId`，生产派发无法自动绑定 workflowId（B8.2 的绑定证据恰在此）。
      const fixedTaskRecord = (await this.readTasks(entry.projectRoot)).records.get(handbackTaskId);
      const fixedCreated = fixedTaskRecord?.created;
      if (fixedCreated?.workflowId !== undefined) {
        origin.taskId = handbackTaskId;
        if (typeof fixedCreated.flowId === "string" && fixedCreated.flowId !== "") origin.flowIds = [fixedCreated.flowId];
      } else {
        await resolve({ kind: "assigned-task", taskId: handbackTaskId }, origin.flowIds?.length === 1 ? origin.flowIds[0] : undefined);
      }
    } else if (origin.kind === "handback" && entry.roleId === "convener") {
      if (!reportedChildren?.length) throw new Error("delivery-child-source-invalid:缺少真实报告child来源，未按旧任务续投");
      for (const child of reportedChildren) {
        // T3 B8.2（2026-11-11，RR3/B8.1 披露）：fixed 子任务回交已在 drain 的
        // `inspectHandbackAssignment` 按 tasks/workflows 账本事实校验（child 无 legacy `parentTaskRef`/run），
        // 这里**跳过** legacy `resolveDeliveryAssignment`（否则 fixed 回交会在发送前被误判
        // `delivery-child-source-invalid`）；legacy 子任务逐字走旧解析（旧行为不变）。
        if (await this.isFixedTask(entry.projectRoot, child.childTaskId)) continue;
        await resolve({ kind: "child-report", childTaskId: child.childTaskId, childRoleId: child.childRoleId }, child.flowId);
      }
    } else if (origin.kind === "system") {
      const bound = queuedSystemAssignment === undefined ? entry.boundAssignment : queuedSystemAssignment;
      if (bound) await resolve({ kind: "assigned-task", taskId: bound.taskId }, bound.flowId, bound.runId);
    } else if (origin.kind === "message") {
      delete entry.boundAssignment; // A new customer chat explicitly clears any older assignment, including constructor taskId.
    }
    if (!current()) throw new Error("delivery-assignment-source-changed:发送前当前投递已失效");
    if (assignment && this.runTaskIsFenced(entry.projectRoot, assignment.taskId, assignment.runId)) {
      origin.assignmentRejectionCode = "run-stop-host-fenced"; throw new Error("run-stop-host-fenced:原运行正在停止，未重新投递。");
    }
    entry.lastUserText = boundTurnText(text);
    if (assignment) { origin.taskId = assignment.taskId; origin.assignment = assignment; origin.flowIds = [assignment.flowId]; }
    const acceptAssignment = () => { if (assignment && this.sessions.get(key) === entry && !entry.interactionState.lifetime.signal.aborted) {
      entry.boundAssignment = assignment;
      const id = this.observedHandleIds.get(entry.handle), observed = id ? this.observedHandles.get(id) : undefined;
      if (observed) { observed.fact.taskId = assignment.taskId; if (assignment.runId) observed.fact.runId = assignment.runId; }
    } };
    // Task identity remains fresh for explicit reports/tools. An application receipt notice is not
    // another assigned work round; its acknowledgement alone must not manufacture a fallback report.
    // Ordinary system continuations and real child reports retain their work/report obligation.
    // T3 B10.1（2026-11-11，RR5 根因 `report-task-link-broken`）：fixed 派发按 B1 不解析 legacy
    // assignment——但本轮 origin 已由 B8.2 绑定真实 fixed 任务（`origin.taskId`，task.created 账本事实）。
    // handback intent 必须带上该 taskId：run-role 的 `withHandback` 只用 intent.taskId 构造回交事件，
    // 缺它时 convener/product/verifier 的 `submit_report` 一律以「任务关联未知」到达、`task.reported`
    // 不写、close accepted 报 `close-report-missing`（RR5 实测）。legacy 路径中 `origin.taskId` 恒等于
    // `assignment.taskId`，行为逐字不变；无任务聊天/回交条目不带 taskId（沿用旧语义）。
    // fixed 回交回合（worker→convener 等）：目标会话自身已绑定真实受派任务（`assignedTaskId`）时，
    // 创建者在该回合向幕僚的进度/阻塞报告同样关联到自己的任务（否则又会是「任务关联未知」）。
    // 该回合 intent.required=false（无自动回交）；只有模型显式 submit_report 才会产生关联报告。
    const handbackIntentTaskId = assignment?.taskId
      ?? (typeof origin.taskId === "string" && origin.taskId !== "" ? origin.taskId
        : origin.kind === "handback" && entry.sessionWorkflowMode === "fixed"
          && typeof entry.assignedTaskId === "string" && entry.assignedTaskId !== "" ? entry.assignedTaskId : undefined);
    let promptOptions: RoleSessionSendOptions = { ...opts, handback: { required: requiresHandback || assignment !== undefined && !applicationNotice,
      ...(handbackIntentTaskId !== undefined ? { taskId: handbackIntentTaskId } : {}) } };
    const handbackInput = origin.kind === "handback" && opts?.inputProvenance?.kind === "handback" ? opts.inputProvenance : undefined;
    const creatorReports = handbackInput?.target.roleId === entry.roleId && handbackInput.target.runtime === entry.runtime &&
      handbackInput.reports.length > 0 && handbackInput.reports.length <= 16 && handbackInput.reports.every(report =>
        typeof report.taskId === "string" && report.taskId !== "" && report.reportId !== "" && report.source.roleId !== "" && report.source.turnId !== "")
      ? handbackInput.reports.map(report => ({ taskId: report.taskId!, roleId: report.source.roleId, reportId: report.reportId, turnId: report.source.turnId })) : undefined;
    if (entry.handle.runtime !== undefined || origin.clientMessageId !== undefined || opts?.onTurnStarted !== undefined) {
      const onTurnStarted = (metadata: PromptTurnStartedMetadata): void => {
        const key = this.sessionKey(entry.projectRoot, entry.roleId, entry.runtime);
        if (this.sessions.get(key) !== entry || (origin.settled && origin.turnId === undefined)) return;
        if (metadata.runtime !== entry.runtime || metadata.roleId !== entry.roleId || typeof metadata.turnId !== "string" || metadata.turnId === "") return;
        if (origin.turnId === undefined) {
          origin.turnId = metadata.turnId;
          if (creatorReports) origin.creatorReports = structuredClone(creatorReports);
          acceptAssignment();
          entry.origins.byTurn.set(metadata.turnId, origin);
          // **ACK 即已投递**（2026-10-25）：应用任务的稳定键在运行时同步开轮回执时即记「已投递」——
          // 之后即便发送 promise 因重建/收尾阶段报错，同一任务也不会被重投（at-most-once）。
          this.rememberAppTaskDelivered(origin.clientMessageId);
          // **P0 队列可见性（2026-10-30）**：ACK 绑定 turnId 后立刻外推一次快照——
          // `activeTurnId` 才能如实到达界面（claim 时的快照早于 ACK，会显示空）。
          this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
        }
        opts?.onTurnStarted?.(metadata);
      };
      promptOptions = { ...promptOptions, onTurnStarted };
    }
    if (controllerResume) {
      const inspected = await inspectQueuedControllerResume({ projectRoot: entry.projectRoot, resumeController: controllerResume.expected, resumeKey: controllerResume.resumeKey, basisDigest: controllerResume.basisDigest });
      if (!inspected.ok) { origin.assignmentRejectionCode = inspected.code; throw new Error(`${inspected.code}:${inspected.message ?? inspected.code}`); }
      if (!current() || assignment?.taskId !== inspected.value.taskId || assignment.runId !== inspected.value.runId || assignment.flowId !== inspected.value.flowId)
        { origin.assignmentRejectionCode = "controller-resume-source-changed"; throw new Error("controller-resume-source-changed:实际运营输入身份已变化"); }
    }
    await entry.handle.send(text, promptOptions);
    acceptAssignment();
  }

  private sendFacts(entry: LiveSession, origin: DeliveryOrigin): Pick<SendResult, 'turnId' | 'clientMessageId' | 'inputAccepted' | 'outcome' | 'sessionCurrent'> {
    return {
      ...(origin.turnId !== undefined ? { turnId: origin.turnId } : {}),
      ...(origin.clientMessageId !== undefined ? { clientMessageId: origin.clientMessageId } : {}),
      ...(origin.inputAccepted ? { inputAccepted: true } : {}),
      ...(origin.outcome !== undefined ? { outcome: origin.outcome } : {}),
      sessionCurrent: this.sessions.get(this.sessionKey(entry.projectRoot, entry.roleId, entry.runtime)) === entry,
    };
  }

  private trimDeliveryOrigins(entry: LiveSession): void {
    if (entry.origins.byTurn.size <= 128) return;
    for (const [turnId, origin] of entry.origins.byTurn) {
      if (!origin.settled || origin === entry.origins.running) continue;
      entry.origins.byTurn.delete(turnId);
      if (entry.origins.byTurn.size <= 128) break;
    }
  }

  private failDeliveryOrigin(entry: LiveSession, origin: DeliveryOrigin): void {
    // A bound real turn keeps its original ID for the delayed failed/aborted terminal.
    origin.settled = true;
    if (entry.origins.running === origin) delete entry.origins.running;
    this.trimDeliveryOrigins(entry);
  }

  /** 当前活动会话条目（无则 undefined）。 */
  private activeEntry(): LiveSession | undefined {
    return this.activeRoleId !== null ? this.sessions.get(this.activeRoleId) : undefined;
  }

  /** 释放一个保活会话；dispose 抛错如实返回原因（条目仍移出，不留半死项）。
   *  **身份守卫（2026-10-13 状态机修复）**：只释放**仍在表中的这一条**（`get(roleId) === entry` 同一引用）——
   *  并发路径（settle 触发的 refreshStaleBoundaries 与用户下一次 send/open 各自的作废重建）在各自 `await`
   *  期间可能已被对方替换/重建；照删会把**新会话（可能正在跑轮次）**误删并推 busy=false（真机「轮次还在跑
   *  但忙态翻假」的根因一类）。已被替换 ⇒ 本调用 no-op（新条目的处置归它自己的路径）。 */
  private async disposeEntry(roleId: string, entry: LiveSession, heldLease?: ControllerDisposalLease): Promise<string | null> {
    if (heldLease && !this.ownsControllerDisposal(entry.handle, heldLease)) return "controller-stop-dispose-owner-unproven";
    if (!heldLease) recordGitHostInterruption({ projectRoot: entry.projectRoot, reason: "desktop-session-revoked", coreSessionId: entry.handle.sessionId });
    this.inventoryChanged(entry.projectRoot, "session-revocation-requested");
    if (this.sessions.get(roleId) !== entry) return null; // TOCTOU 防误删（见方法注释）
    for (const [id, deferred] of this.deferredRunChanges) if (deferred.entry === entry) {
      deferred.controller.abort(); this.deferredRunChanges.delete(id); this.runChangeOperations.delete(deferred.plan.planId);
    }
    try { entry.unsubscribePersistence?.(); } catch { /* closing a presenter cannot retain a stale handle */ }
    for (const [key, state] of this.reportStates) if (state.owner === entry) {
      if (state.state?.retryAvailable) {
        const reportId = key.slice(key.lastIndexOf('\0') + 1);
        state.state = { state: 'expired', reportId, code: 'SNAPSHOT_EXPIRED', retryAvailable: false };
        try { this.deps.emitPersistenceChange?.({ version: 1, scope: this.persistenceScope(entry), change: { kind: 'report-save', scope: { roleId: entry.roleId, runtime: entry.runtime }, reportId, state: state.state } }); } catch { /* display observers do not prevent disposal */ }
      }
      state.owner = undefined; state.event = undefined;
    }
    for (const state of this.attemptStates.values()) if (state.owner === entry) {
      if (state.receipt.retryHistoryAvailable) {
        state.receipt = { ...state.receipt, retryHistoryAvailable: false };
        try { this.deps.emitPersistenceChange?.({ version: 1, scope: this.persistenceScope(entry), change: { kind: 'delivery-history-save', scope: { roleId: entry.roleId, runtime: entry.runtime }, attemptId: state.receipt.attemptId, state: 'expired', receipt: state.receipt, retryAvailable: false, code: 'SNAPSHOT_EXPIRED' } }); } catch { /* display observers do not prevent disposal */ }
      }
      state.owner = undefined;
    }
    this.sessions.delete(roleId);
    // W6-B：会话被释放 ⇒ 等待者按「未等到 settle」结算（不悬挂、不误判为写入完成）。
    const settleWaiters = entry.settleWaiters;
    entry.settleWaiters = undefined;
    for (const finish of settleWaiters ?? []) finish(false);
    if (this.activeRoleId === roleId) this.activeRoleId = null;
    this.activeDeliveries.delete(this.queueKey(entry.projectRoot, entry.roleId, entry.runtime)); // 会话没了，「进行中」不再成立
    // 2026-10-20 重启续跑：会话释放后内存态变化同步落盘（未投的队列项仍如实保留）。
    this.persistDeliveryQueues();
    // 状态准确性：dispose 即真实信号（会话已移出保活表，busy 判据随之恒 false）——外推快照，
    // 徽标/队列行随之转「已停止」；**不删其投递队列**（未投的待办仍如实保留可见）。
    this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
    this.noteWatchdogActivity(entry.projectRoot, "session-close"); // G-2/W3：会话关 = 真实活动
    entry.origins.byTurn.clear();
    delete entry.origins.running;
    // **「替我审」会话级上下文销毁即清**（PM 评审 §8.1/§十一）：turnText 与判断闭包都不跨会话残留。
    entry.lastUserText = undefined;
    entry.shellJudge = undefined;
    entry.governanceJudge = undefined;
    entry.interactionState.lifetime.abort();
    entry.interactionState.turn.abort();
    // 2026-11-04 下载申请（F2/R2）：会话结束 await B1 每会话运行时 dispose（幂等；中止在途下载、
    // 释放本项目执行槽）。失败只记诊断，不阻断会话释放。
    if (entry.downloadRuntime !== undefined) {
      const downloadRuntime = entry.downloadRuntime;
      entry.downloadRuntime = undefined;
      try {
        await downloadRuntime.dispose();
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: entry.projectRoot, roleId: entry.roleId }).error(
          "download.runtime.dispose.failed",
          error,
        );
      }
    }
    try {
      await this.disposeObservedHandle(entry.handle, heldLease);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  /** LRU 淘汰：保活数超出 `MAX_LIVE_SESSIONS` 时，从**最久未用**者起 dispose（直到回到上限）。
   *  **P1-2（2026-10-13 客户裁定，提案首选方案）**：挑选判据加 `!busy`——**跳过正在跑轮次的会话**
   *  （后台在跑的同样计入 busy，B-2 下切走不停跑）；**全忙则允许暂时超限**（不掐断任何在跑任务），
   *  待某会话 settled（下一时机＝consume 的 settled 收口处）再收。切回被淘汰者的提示链路（D-1
   *  recovered/rebuilt 文案）逐字未动——不出现第二套文案。
   *  `keepRoleId`：本次**正在开启**的那个不淘汰（用户刚点的会话不能被自己的开启动作回收——
   *  「全忙暂超限」的子情形：除它之外全忙 ⇒ 暂超限）。
   *  **2026-10-26 客户指令：主理（Lead，`primaryRoleId`）的会话不按容量淘汰**——主理会话设计为不关闭，
   *  即使它是最久未用者。主理 id **逐会话按其所属项目**经 `deps.getListing` 解析（single/su 同口径；
   *  多项目并存时各认各的主理，不硬编码角色 id）。显式生命周期（项目关闭/切换、边界陈旧重建、定向 stop）
   *  不经本方法，行为不变；其余角色仍按既有 busy/LRU 规则淘汰。 */
  private async evictBeyondLimit(keepRoleId?: string): Promise<void> {
    while (this.sessions.size > MAX_LIVE_SESSIONS) {
      let oldestId: string | null = null;
      let oldestUsed = Number.POSITIVE_INFINITY;
      for (const [id, s] of this.sessions) {
        if (s.busy) continue; // 正在跑轮次的不淘汰（暂超限等它 settled——绝不静默掐断后台任务）
        if (keepRoleId !== undefined && id === keepRoleId) continue; // 正在开启的那一个也不淘汰
        if (this.isPrimarySession(s)) continue; // 产品（Lead）常驻：不按容量淘汰
        if (s.lastUsed < oldestUsed) {
          oldestUsed = s.lastUsed;
          oldestId = id;
        }
      }
      if (oldestId === null) return; // 无可回收者（全忙 / 只剩刚开启的）：暂超限（settled 后下一时机再收）
      const entry = this.sessions.get(oldestId);
      if (!entry) return;
      await this.disposeEntry(oldestId, entry);
    }
  }

  /**
   * 该会话是否为其**所属项目**的主入口（主理 Lead；single/su 同口径，`primaryRoleId` 由门禁枚举给出，
   * 不硬编码角色 id）。多项目并存时逐会话按各自 `projectRoot` 解析——A 项目的主理不会被 B 项目误 pin。
   * listing 精确 miss 时按斜杠变体兜底（同 `findListingForFeedback` 先例）；listing 暂不可得 ⇒ false
   * （无主理信息，维持既有淘汰语义）。
   */
  private isPrimarySession(entry: LiveSession): boolean {
    const listing = this.findListingForFeedback(entry.projectRoot);
    return typeof listing?.primaryRoleId === "string" && listing.primaryRoleId !== "" && entry.roleId === listing.primaryRoleId;
  }

  // —————— O-1（2026-10-12）：边界快照检查与作废重建 ——————
  // 真机现象：su 按流程改好角色的 boundary.yaml（盘上已含目标路径、pin 一致），但该角色的**活会话**仍在用
  // 开会话时解析的旧边界 ⇒ 写入被拒（「目标路径未匹配任何边界条目」）。信号只取**读盘内容哈希**
  // （可信信号，不用界面推测）；检出陈旧 ⇒ **作废重建**（dispose → 立即按新边界重开）并如实记一行。

  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private async boundaryDiff(entry: LiveSession): Promise<string | null> {
    return this.sessionEnv.boundaryDiff(entry);
  }

  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private async currentSkillPaths(projectRoot: string, roleId: string): Promise<string[] | null> {
    return this.sessionEnv.currentSkillPaths(projectRoot, roleId);
  }

  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private rebuildIfBoundaryStale(
    roleId: string,
    userInitiated: boolean,
    selectionVersion = this.selectionVersion,
    // T3 B8.1：由 fixed 派发/投递的 forced 打开透传——陈旧重建后的会话仍按 fixed 重开（不会被聊天解析
    // 在混合项目里换回 legacy）。settle 扫描/手动重建等调用不传，行为逐字不变。
    forcedWorkflowMode?: WorkflowMode,
  ): Promise<{ changed: string; reopened: OpenResult } | undefined> {
    return this.sessionEnv.rebuildIfBoundaryStale(roleId, userInitiated, selectionVersion, forcedWorkflowMode);
  }

  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private async rebuildIfBoundaryStaleUnsafe(
    roleId: string,
    userInitiated: boolean,
    selectionVersion: number,
    forcedWorkflowMode?: WorkflowMode,
  ): Promise<{ changed: string; reopened: OpenResult } | undefined> {
    return this.sessionEnv.rebuildIfBoundaryStaleUnsafe(roleId, userInitiated, selectionVersion, forcedWorkflowMode);
  }

  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private queueRebuildWritePermitsNotice(sessionKey: string): void {
    this.sessionEnv.queueRebuildWritePermitsNotice(sessionKey);
  }

  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  async refreshStaleBoundaries(): Promise<string[]> {
    return this.sessionEnv.refreshStaleBoundaries();
  }

  /**
   * 点角色 → 直接建立/续接会话（无确认框）。见上方类内注释：O-1 起，续接/开启前先查**边界快照**。
   */
  async open(req: SessionOpenRequest): Promise<OpenResult> {
    const selectionVersion = ++this.selectionVersion;
    const key = this.sessionKey(req.projectRoot, req.roleId, req.runtime);
    this.selectionTargetRoleId = key;
    this.resumeDelivery(key);
    await this.rebuildChains.get(key);
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId });
    diagnostic.record("session.open.start");
    const result = await this.openInternal(req, true, selectionVersion);
    diagnostic.record("session.open.end", { ok: result.ok });
    if (!result.ok) diagnostic.error("session.open.failed", new Error(result.error || "会话开启失败"));
    return result;
  }

  /**
   * 客户授权平面（2026-11-04 客户直修）：`@审批`/`@决策` 自然语言的**判断 AI 纯理解**入口。
   *
   * 只构造一次性只读解释会话（与「替我审批」/「替我决策」两个 judge 同一套 `runtimeOptions`/adapter
   * 工厂），不打开角色会话、不写聊天/账本、不改变任何权限；失败一律 `{ok:false}`（调用方回退现有面板）。
   * 引擎：请求显式 runtime > 该角色活会话引擎 > 本项目最近治理引擎；demo/未知 ⇒ unsupported-engine。
   */
  async interpretDirective(request: DirectiveInterpretRequest): Promise<DirectiveInterpretResult> {
    const diagnostic = createDiagnosticLogger({ component: "desktop.session.directive-interpreter" });
    if (request === null || typeof request !== "object") {
      return { ok: false, reasonCode: "context-missing", reason: "解释请求形状非法。" };
    }
    if (request.target !== "approval" && request.target !== "decision") {
      return { ok: false, reasonCode: "context-missing", reason: "解释请求缺少合法 target。" };
    }
    if (typeof request.body !== "string" || request.body.trim() === "") {
      return { ok: false, reasonCode: "context-missing", reason: "解释请求缺少正文。" };
    }
    const projectRoot = typeof request.projectRoot === "string" ? request.projectRoot.trim() : "";
    if (projectRoot === "") {
      return { ok: false, reasonCode: "context-missing", reason: "解释请求缺少项目根。" };
    }
    const explicitRuntime: RuntimeKind | undefined =
      typeof request.runtime === "string" && (RUNTIME_KINDS as readonly string[]).includes(request.runtime)
        ? (request.runtime as RuntimeKind)
        : undefined;
    const roleId = typeof request.roleId === "string" ? request.roleId : "";
    const runtime = explicitRuntime ?? this.findLiveRuntime(projectRoot, roleId) ?? this.lastGovernanceRuntime.get(projectRoot);
    if (runtime === undefined) {
      return { ok: false, reasonCode: "unavailable", reason: "没有可用的请求会话引擎，保持手动确认。" };
    }
    if (!DIRECTIVE_INTERPRET_SUPPORTED_RUNTIMES.has(runtime)) {
      return { ok: false, reasonCode: "unsupported-engine", reason: `当前引擎（${runtime}）不支持自动理解，保持手动确认。` };
    }
    const listing = this.deps.getListing(projectRoot);
    if (listing === undefined) {
      return { ok: false, reasonCode: "context-missing", reason: "项目尚未枚举（角色清单不可用），保持手动确认。" };
    }
    try {
      const { project } = await buildEffectiveProjectConfig(listing, {
        buildProjectConfig: this.deps.buildProjectConfig,
        loadEffectiveConfig: this.loadEffectiveConfig,
      });
      await this.deps.prepareRuntimeProfile?.(runtime);
      const runtimeOptions = this.deps.runtimeOptions;
      const adapterOptions = {
        ...runtimeOptions,
        ...(this.deps.shellGate !== undefined ? { shellGate: this.deps.shellGate } : {}),
      };
      const createAdapter = this.deps.createRuntimeAdapterFactory !== undefined
        ? this.deps.createRuntimeAdapterFactory(project, runtime, adapterOptions)
        : createRuntimeAdapterFactory(project, runtime, adapterOptions);
      const createInterpreter = this.deps.createDirectiveInterpreter ?? realCreateDirectiveInterpreter;
      const interpreter = createInterpreter({
        project,
        runtime,
        ...(runtimeOptions !== undefined ? { runtimeOptions } : {}),
        createAdapter,
      });
      return await interpreter({ ...request, projectRoot, roleId: roleId !== "" ? roleId : request.roleId, runtime });
    } catch (error) {
      diagnostic.error("directive-interpret.failed", error, { target: request.target, runtime });
      return { ok: false, reasonCode: "unavailable", reason: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * **后台开启**（2026-10-18 客户修正）：应用代客户推进治理流程时打开目标治理角色会话。
   * 与 `open` 同一会话键/续接/重建路径，但 `userInitiated=false`——**不抢 `activeRoleId`、不切当前 pane**，
   * 也不动 `selectionTargetRoleId`/`selectionVersion`。失败如实返回，不自动重试。
   */
  async openBackground(req: SessionOpenRequest): Promise<OpenResult> {
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId });
    diagnostic.record("session.open-background.start");
    let result: OpenResult;
    try {
      result = await this.openInternal(req, false);
    } catch (error) {
      diagnostic.error("session.open-background.failed", error);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    diagnostic.record("session.open-background.end", { ok: result.ok });
    if (!result.ok) diagnostic.error("session.open-background.failed", new Error(result.error || "后台会话开启失败"));
    return result;
  }

  /**
   * **后台投递**（2026-10-18 客户修正）：与 `send` 共用同一投递机/队列/忙态/真实状态外推，
   * 但**不抢活动角色**（边界陈旧重建按非用户发起；即使 `activeRoleId` 为空也不因本消息复位）。
   * 返回 `send` 的如实结果（失败不吞、不重试循环）。
   *
   * **2026-10-25 真机重复投递修复**：本方法是**应用代客户推进**的唯一入口，默认给任务生成
   * **内容稳定 `clientMessageId`**（见 `APP_TASK_CLIENT_MESSAGE_ID_PREFIX`）——同一任务在重建
   * 前后、或两条应用链路各发一次时**至多投递一次**（已投递/已入队 ⇒ 回 `duplicate:true`）。
   * `identitySeed`：调用方已有**语义去重键**（如 flow revision/交付集合指纹）时传入——同 content
   * 但新 revision 的任务仍会作为新任务投递（文本未带 revision 的场景，如 delivered 唤醒）。
   * `stableIdentity:false` 只用于非任务的治理反馈镜像（同文可在不同轮次重复，保持既有语义）。
   * 真实客户消息不经本方法，不受影响（同文重复发送仍是两个意图）。
   * `kind:"system"`（2026-10-26）：仅**治理唤醒**使用——目标忙时入队为 `DeliveryItem kind:"system"`
   * （UI 显示「系统」、不可撤回）；缺省是客户消息类别（既有语义逐字不变）。
   */
  async sendBackground(input: { projectRoot: string; roleId: string; runtime: RuntimeKind; text: string; clientMessageId?: string; identitySeed?: string; stableIdentity?: boolean; kind?: "system" }): Promise<SendResult> {
    const clientMessageId =
      input.clientMessageId ??
      (input.stableIdentity === false
        ? undefined
        : input.identitySeed !== undefined
          ? this.appTaskClientMessageIdFromSeed(input.identitySeed)
          : this.appTaskClientMessageId(input.projectRoot, input.roleId, input.runtime, input.text));
    return this.send(
      input.text,
      undefined,
      { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime },
      { background: true, ...(input.kind !== undefined ? { kind: input.kind } : {}), ...(clientMessageId !== undefined ? { clientMessageId } : {}) },
    );
  }

  /** Idempotent host notification: enqueue acknowledgement never waits for the recipient's current turn. */
  async queueDirectNotification(projectRoot: string, input: { key: string; recipientRoleId: string; message: string;
    source: Extract<import("../../src/model/trunk.ts").DirectActionSource, { kind: "role-direct" }> }): Promise<void> {
    const allowed = ["chief", "convener", input.source.actorRoleId];
    if (!input.key || !allowed.includes(input.recipientRoleId)) throw new Error("Invalid direct notification recipient");
    const runtime = this.findLiveRuntime(projectRoot, input.recipientRoleId) ?? this.lastGovernanceRuntime.get(projectRoot);
    if (runtime === undefined) throw new Error("No actual runtime is selected for the notification recipient");
    const clientMessageId = this.appTaskClientMessageIdFromSeed(input.key);
    const key = this.queueKey(projectRoot, input.recipientRoleId, runtime);
    if (this.deliveredAppTaskIds.has(clientMessageId)
      || this.deliveryQueues.get(key)?.some(item => item.clientMessageId === clientMessageId)
      || this.activeDeliveries.get(key)?.clientMessageId === clientMessageId) return;
    this.enqueueDelivery(projectRoot, input.recipientRoleId, { kind: "system", runtime, targetRoleId: input.recipientRoleId,
      sourceRoleId: input.source.actorRoleId, text: `[应用·文档更新] ${input.message}`, summary: shortenSummary(input.message),
      dedupKey: input.key, clientMessageId, notificationSource: structuredClone(input.source) });
    // Do not await drain: the publisher may itself be waiting inside the current recipient turn.
    void this.drainQueue(projectRoot, input.recipientRoleId, runtime);
  }

  /** 某角色当前是否有轮次在跑（纯读；W6-B 时序修复用）。 */
  isRoleBusy(projectRoot: string, roleId: string, runtime: RuntimeKind): boolean {
    return this.sessions.get(this.sessionKey(projectRoot, roleId, runtime))?.busy === true;
  }

  /** 该角色当前是否有**活会话**（纯读；链式推进的事实轮询护栏——会话被释放时不能断言「已 settled」）。 */
  hasLiveSession(projectRoot: string, roleId: string, runtime: RuntimeKind): boolean {
    return this.sessions.has(this.sessionKey(projectRoot, roleId, runtime));
  }

  /** 上一轮是否被请求中止（纯读；链式推进的早失败护栏——中止 ≠ 正常结束，继续等下一次投递/重试）。 */
  wasLastTurnAborted(projectRoot: string, roleId: string, runtime: RuntimeKind): boolean {
    return this.sessions.get(this.sessionKey(projectRoot, roleId, runtime))?.lastTurnAborted === true;
  }

  /** 该角色是否仍有排队/进行中的投递（纯读；链式推进的早失败护栏——有后续投递就不能断言「本轮即终局」）。 */
  hasPendingDelivery(projectRoot: string, roleId: string, runtime: RuntimeKind): boolean {
    const key = this.queueKey(projectRoot, roleId, runtime);
    const queue = this.deliveryQueues.get(key);
    return (queue !== undefined && queue.length > 0) || this.activeDeliveries.has(key);
  }

  /**
   * **应用发起的需求变更审批卡**（2026-10-26 客户纠正）：把 `decision` 卡经**发起方会话的客户卡通道**
   * 呈现给客户/判断 agent（统筹与提案会话才有该通道）。返回：
   *  · `outcome`：卡片的最终结算（answered / declined / unavailable）——调用方据它更新票据/回执；
   *  · `first`：`{kind:"presented"}`（presenter 已成功推达，卡片进入独立审批）或
   *    `{kind:"outcome"}`（未呈现即已结算，如卡校验拒发/通道不可用/「替我决策」在呈现前代选）。
   * 工具回执据此区分「已提交独立审批」与「未提交」——绝不谎称已提交。
   * **发起方不能作答**：本方法只呈现；作答只来自客户（未勾选「替我决策」）或独立判断 agent。
   */
  requestRequirementChangeDecision(input: {
    projectRoot: string;
    roleId: string;
    runtime: RuntimeKind;
    request: CustomerInputRequest;
    metadata?: CustomerInputMetadata;
  }): {
    ok: true;
    outcome: Promise<CustomerInputOutcome>;
    first: Promise<{ kind: "presented" } | { kind: "outcome"; outcome: CustomerInputOutcome }>;
  } | { ok: false; error: string } {
    const entry = this.sessions.get(this.sessionKey(input.projectRoot, input.roleId, input.runtime));
    if (entry === undefined) {
      return { ok: false, error: "发起角色会话未开启，无法呈现需求变更审批卡" };
    }
    const channel = entry.requirementChangeCard;
    if (channel === undefined) {
      return { ok: false, error: "本会话未接入客户确认通道，无法呈现需求变更审批卡" };
    }
    let settleFirst: ((signal: { kind: "presented" } | { kind: "outcome"; outcome: CustomerInputOutcome }) => void) | undefined;
    let firstSettled = false;
    const first = new Promise<{ kind: "presented" } | { kind: "outcome"; outcome: CustomerInputOutcome }>((resolve) => {
      settleFirst = (signal) => {
        if (firstSettled) return;
        firstSettled = true;
        resolve(signal);
      };
    });
    const onPresented = (): void => settleFirst?.({ kind: "presented" });
    let outcome: Promise<CustomerInputOutcome>;
    try {
      outcome = Promise.resolve(channel(input.request, input.metadata, onPresented));
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    outcome.then(
      (settled) => settleFirst?.({ kind: "outcome", outcome: settled }),
      (error) => settleFirst?.({
        kind: "outcome",
        outcome: { outcome: "unavailable", reason: error instanceof Error ? error.message : String(error) },
      }),
    );
    return { ok: true, outcome, first };
  }

  /**
   * 2026-10-30（方案 v3 §3.1）：应用发起 run-change 卡（复用 decision，不新增 cardKind）。
   * 只由 app 发行；客户/judge 选择 continue-frozen/stop-and-restart/stop（或 approve/reject/cancel 回退）。
   * 2026-10-31（触发缺陷）：会话选择顺序扩展为 convener → rapporteur → chief（均需有客户卡通道）；
   * 无 pinned run / 无可呈现会话 / 无通道 ⇒ fail-closed（调用方回 `run-change-required` 结构化拒绝）。
   */
  async requestRunChangeDecision(input: {
    projectRoot: string;
    flowId: string;
    requestedBy?: "convener" | "planner" | "product";
    reason?: string;
    proposed?: { documents: Record<string, string>; schemas: Record<string, string> };
  }): Promise<
    | {
        ok: true;
        runId: string;
        outcome: Promise<CustomerInputOutcome>;
        first: Promise<{ kind: "presented" } | { kind: "outcome"; outcome: CustomerInputOutcome }>;
      }
    | { ok: false; error: string }
  > {
    const active = await findActiveRun(input.projectRoot, input.flowId);
    if (!active.ok) return { ok: false, error: active.reason };
    if (active.manifest === null || active.manifest.state !== "pinned") {
      return { ok: false, error: "当前 flow 没有 pinned run，不能发起 run-change" };
    }
    const preferred = [this.handbackOwnerRoleId(input.projectRoot), "rapporteur", this.chiefTaskRoleIdOf(input.projectRoot)]
      .filter((id): id is string => id !== null && id !== "");
    let selectedEntry: LiveSession | undefined;
    let bestRank = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.sessions) {
      if (!key.startsWith(`${input.projectRoot} `)) continue;
      if (entry.projectRoot !== input.projectRoot) continue;
      if (entry.requirementChangeCard === undefined) continue;
      if (selectedEntry === undefined) selectedEntry = entry;
      const rank = preferred.indexOf(entry.roleId);
      if (rank >= 0 && rank < bestRank) {
        bestRank = rank;
        selectedEntry = entry;
      }
    }
    if (selectedEntry === undefined || selectedEntry.requirementChangeCard === undefined) {
      return { ok: false, error: "没有可呈现 run-change 卡的统筹/提案会话（需先打开会话）" };
    }
    const currentDocs: Record<string, string> = {};
    for (const [kind, ref] of Object.entries(active.manifest.documents)) {
      if (ref !== null && ref !== undefined) currentDocs[kind] = ref.path;
    }
    const requestId = `run-change-${active.manifest.runId}`;
    const card = buildRunChangeCard({
      runId: active.manifest.runId,
      flowId: input.flowId,
      requestId,
      ...(input.requestedBy !== undefined ? { requestedBy: input.requestedBy } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      current: { state: active.manifest.state, documents: currentDocs, schemas: active.manifest.schemas },
      ...(input.proposed !== undefined ? { proposed: input.proposed } : {}),
    });
    const channel = selectedEntry.requirementChangeCard;
    let settleFirst: ((signal: { kind: "presented" } | { kind: "outcome"; outcome: CustomerInputOutcome }) => void) | undefined;
    let firstSettled = false;
    const first = new Promise<{ kind: "presented" } | { kind: "outcome"; outcome: CustomerInputOutcome }>((resolve) => {
      settleFirst = (signal) => {
        if (firstSettled) return;
        firstSettled = true;
        resolve(signal);
      };
    });
    const onPresented = (): void => settleFirst?.({ kind: "presented" });
    let rawOutcome: Promise<CustomerInputOutcome>;
    try {
      rawOutcome = Promise.resolve(channel(card.request, undefined, onPresented));
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    const outcome = rawOutcome.then(async (settled) => {
      if (settled.outcome !== "answered") {
        settleFirst?.({ kind: "outcome", outcome: settled });
        return settled;
      }
      const mode: RunChangeMode | undefined = mapRunChangeAnswer({
        ...(settled.value?.selected !== undefined ? { selected: settled.value.selected } : {}),
      });
      if (mode === undefined) {
        const unavailable: CustomerInputOutcome = { outcome: "unavailable", reason: "run-change 选择无法映射到唯一模式（fail-closed）" };
        settleFirst?.({ kind: "outcome", outcome: unavailable });
        return unavailable;
      }
      const newHashes: Record<string, string> = {};
      for (const [kind, rel] of Object.entries(input.proposed?.documents ?? {})) {
        try {
          newHashes[kind] = createHash("sha256").update(await fs.promises.readFile(path.join(input.projectRoot, rel))).digest("hex");
        } catch {
          /* 新文档不可读：不伪造 hash；apply 记录只带可读者。 */
        }
      }
      // Q9 A（2026-11-03）：三值归属——`directive:<id>` 先于 judge/customer；指令 id 只从 operatorId 解析。
      const runChangeDirectiveId = directiveIdFromOperatorId(settled.operatorId);
      const runChangeDecidedBy: VersionDecisionDecidedBy =
        runChangeDirectiveId !== undefined
          ? "directive"
          : settled.operatorId !== undefined && settled.operatorId.startsWith("judge:")
            ? "judge"
            : "customer";
      const applied = await applyRunChange(input.projectRoot, active.manifest!, {
        decisionId: settled.decisionId ?? `decision-${requestId}`,
        requestId,
        mode,
        decidedBy: runChangeDecidedBy,
        ...(runChangeDirectiveId !== undefined ? { directiveId: runChangeDirectiveId } : {}),
        ...(Object.keys(newHashes).length > 0 ? { newHashes } : {}),
      });
      if (!applied.ok) {
        const unavailable: CustomerInputOutcome = { outcome: "unavailable", reason: applied.reason };
        settleFirst?.({ kind: "outcome", outcome: unavailable });
        return unavailable;
      }
      settleFirst?.({ kind: "outcome", outcome: settled });
      return settled;
    });
    outcome.catch((error) => settleFirst?.({
      kind: "outcome",
      outcome: { outcome: "unavailable", reason: error instanceof Error ? error.message : String(error) },
    }));
    return { ok: true, runId: active.manifest.runId, outcome, first };
  }

  // —————————————— 2026-11-04 trunk-amendment-model D1：应用自有客户卡（VCA/逐项/stable） ——————————————

  /**
   * 治理会话客户卡通道选择（convener → rapporteur → chief；需本会话已构造 `governedCardContext`）。
   * 与 run-change 的会话选择同一顺序/同一呈现面；只选**已打开的治理会话**，不自动开会话。
   */
  private pickGovernedCardEntry(projectRoot: string): LiveSession | undefined {
    const preferred = [this.handbackOwnerRoleId(projectRoot), "rapporteur", this.chiefTaskRoleIdOf(projectRoot)]
      .filter((id): id is string => id !== null && id !== "");
    let selected: LiveSession | undefined;
    let bestRank = Number.POSITIVE_INFINITY;
    for (const [key, candidate] of this.sessions) {
      if (!key.startsWith(`${projectRoot}\u0000`)) continue;
      if (candidate.projectRoot !== projectRoot) continue;
      if (candidate.governedCardContext === undefined) continue;
      if (selected === undefined) selected = candidate;
      const rank = preferred.indexOf(candidate.roleId);
      if (rank >= 0 && rank < bestRank) {
        bestRank = rank;
        selected = candidate;
      }
    }
    return selected;
  }

  /**
   * 应用自有卡的统一呈现（**客户本人**；`notify:"none"`；会话生命周期并入中止信号）：
   * · 只呈现，不代选/不改业务状态；无通道/无治理会话 ⇒ 返回 undefined（调用方 fail-closed）；
   * · `sourceRoleId:"application"`；`request.resolved.by` 只可能是 customer（主权卡在通道层排除
   *   judge/委托/`@决策`，`to*Outcome` 再做 operatorId/judge 二次校验）；
   * · 客户卡批准/拒绝**只经** `session:operator-response`，本方法不提供渲→主捷径。
   */
  private async presentAppCard(input: {
    projectRoot: string;
    request: CustomerInputRequest;
    metadata?: CustomerInputMetadata;
    requestId: string;
    signal?: AbortSignal;
  }): Promise<CustomerInputOutcome | undefined> {
    const entry = this.pickGovernedCardEntry(input.projectRoot);
    if (entry === undefined || entry.governedCardContext === undefined || this.deps.customerInput === undefined) {
      return undefined;
    }
    const signals: AbortSignal[] = [entry.interactionState.lifetime.signal];
    if (input.signal !== undefined) signals.push(input.signal);
    try {
      const outcome = await this.withRequestLifecycle(
        input.projectRoot,
        "application",
        input.request,
        input.metadata,
        async (request, context, metadata) => this.deps.customerInput!(request, context, metadata),
        (request, extras) => entry.governedCardContext!(request, extras),
        input.requestId,
        { notify: "none", signal: AbortSignal.any(signals) },
      );
      return outcome ?? { outcome: "unavailable", reason: mainT("main.customerInput.presenterMissing") };
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot: input.projectRoot }).error("app-card.failed", error, {
        requestId: input.requestId,
      });
      return undefined;
    }
  }

  /** VCA 批准/拒绝卡（application-owned decision；客户本人；无通道 ⇒ unavailable/保持 submitted）。 */
  async presentVersionChangeCard(input: {
    projectRoot: string;
    record: VersionChangeRecord;
    signal?: AbortSignal;
  }): Promise<VcaCardOutcome> {
    const built = buildVersionChangeCard({ record: input.record });
    if (built === undefined) return { outcome: "unavailable" };
    const outcome = await this.presentAppCard({
      projectRoot: input.projectRoot,
      request: built.request,
      metadata: built.metadata,
      requestId: `vc-${input.record.applicationId}`,
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
    return toVersionChangeOutcome(outcome);
  }

  /** 修正案逐项确认卡（只对实际变更项；acknowledgments 必选结算）。 */
  async presentAmendmentItemCard(
    input: AmendmentItemPresentation & { projectRoot: string; signal?: AbortSignal },
  ): Promise<AmendmentItemOutcome> {
    const built = buildAmendmentItemCard({
      record: input.record,
      item: input.item,
      index: input.index,
      total: input.total,
      ...(input.acknowledgments !== undefined ? { acknowledgments: input.acknowledgments } : {}),
    });
    if (built === undefined) return { outcome: "unavailable" };
    const outcome = await this.presentAppCard({
      projectRoot: input.projectRoot,
      request: built.request,
      metadata: built.metadata,
      requestId: `vc-item-${input.applicationId}-${input.item.itemId}`,
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
    return toAmendmentItemOutcome(outcome, built.request);
  }

  /** stable workflow 轻量确认卡（app-owned `stable-write`；独立结构校验；不签发许可）。 */
  async presentStableWriteCard(input: {
    projectRoot: string;
    record: StableWriteRecord;
    preview: StableWritePreview;
    signal?: AbortSignal;
  }): Promise<StableWriteCardOutcome> {
    const built = buildStableWriteCard({ record: input.record, preview: input.preview });
    if (built === undefined) return { outcome: "unavailable" };
    const shape = validateStableWriteCardShape(built.request, input.preview);
    if (!shape.ok) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot: input.projectRoot }).record(
        "stable-write.card.invalid",
        { requestId: input.record.requestId, reason: shape.reason },
      );
      return { outcome: "unavailable" };
    }
    const outcome = await this.presentAppCard({
      projectRoot: input.projectRoot,
      request: built.request,
      metadata: built.metadata,
      requestId: `sw-card-${input.record.requestId}`,
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
    return toStableWriteOutcome(outcome);
  }

  /** 幕僚/运营通知（只通知、无批准权；诚实行，不冒充客户决定）。 */
  noteVersionChange(projectRoot: string, summary: string): void {
    const chief = this.chiefTaskRoleIdOf(projectRoot);
    const runtime =
      (chief !== null ? this.findLiveRuntime(projectRoot, chief) : undefined) ??
      this.lastGovernanceRuntime.get(projectRoot) ??
      this.activeRuntimeFor(projectRoot) ??
      "demo";
    this.emitDeliveryNote(projectRoot, runtime, chief, chief ?? "chief", `[${mainT("ui.trunk.panelTitle")}] ${summary}`);
  }

  /** 客户决定结果返回发起角色（如 product/rapporteur；只通知，不触发模型/门禁/派发）。 */
  noteVersionChangeInitiator(projectRoot: string, roleId: string, summary: string): void {
    const runtime =
      this.findLiveRuntime(projectRoot, roleId) ??
      this.lastGovernanceRuntime.get(projectRoot) ??
      this.activeRuntimeFor(projectRoot) ??
      "demo";
    this.emitDeliveryNote(projectRoot, runtime, roleId, roleId, `[${mainT("ui.trunk.panelTitle")}] ${summary}`);
  }

  // —————————————— 2026-11-05：方案升级报告卡（convener 提交 → 客户主权裁决） ——————————————

  /**
   * 方案升级报告（`report_plan_escalation` 落地）：只做校验/去重/发卡，**不派发、不改需求或验收标准**；
   * 卡由应用发行（application-owned decision），客户本人裁决；同一 flow 至多一张在途卡。
   * 返回 `presented` 只代表**已呈现/已发起呈现**，不代表客户结论（申请≠批准）。
   */
  async reportPlanEscalation(projectRoot: string, input: PlanEscalationInput, signal?: AbortSignal): Promise<PlanEscalationResult> {
    const roleId = typeof input?.roleId === "string" ? input.roleId : "";
    const flowId = typeof input?.flowId === "string" ? input.flowId.trim() : "";
    const summary = typeof input?.summary === "string" ? input.summary.trim() : "";
    const category = input?.category;
    if (roleId !== "convener") {
      return { ok: false, errorCode: "plan-escalation-role-not-allowed", message: "方案升级报告只能由 convener 会话提交。" };
    }
    if (flowId === "" || !GOVERNANCE_SLUG_RE.test(flowId) || summary === "" || !PLAN_ESCALATION_CATEGORIES.includes(category)) {
      return { ok: false, errorCode: "plan-escalation-invalid", message: "flowId/category/summary 非法（不猜测参数，未发卡）。" };
    }
    const key = `${projectRoot}\u0000${flowId}`;
    if (this.planEscalations.has(key)) {
      return { ok: false, errorCode: "plan-escalation-conflict", message: `flow ${flowId} 已有在途方案升级卡；客户未裁定前不重复提交。` };
    }
    const built = buildPlanEscalationCard({ flowId, category, summary });
    if (built === undefined) {
      return { ok: false, errorCode: "plan-escalation-invalid", message: "卡面字段缺失，未发卡。" };
    }
    const entry = this.pickGovernedCardEntry(projectRoot);
    if (entry === undefined || entry.governedCardContext === undefined || this.deps.customerInput === undefined) {
      return { ok: false, errorCode: "plan-escalation-channel-unavailable", message: "无客户卡通道（无已打开的治理会话）：方案升级卡未呈现；稍后可重试。" };
    }
    const requestId = `plan-escalation-${flowId}`;
    // 发卡与决策处理分离：工具调用立即返回 presented；决策经 afterPlanEscalation 如实回到运营/幕僚。
    const pending = this.presentAppCard({
      projectRoot,
      request: built.request,
      metadata: built.metadata,
      requestId,
      ...(signal !== undefined ? { signal } : {}),
    })
      .then((outcome) => this.afterPlanEscalation(projectRoot, { requestId, flowId }, outcome))
      .catch((error) => {
        createDiagnosticLogger({ component: "desktop.session", projectRoot }).error("plan-escalation.card.failed", error, { requestId });
      })
      .finally(() => {
        this.planEscalations.delete(key);
      });
    this.planEscalations.set(key, pending);
    // 升级卡已成功提交 ⇒ 清除该 flow 的「已提示」标记（下一次 blocked 可再提示；裁定前由在途卡节流）。
    this.planEscalationPrompted.delete(key);
    return { ok: true, requestId, status: "presented" };
  }

  /** 方案升级卡决策后的如实通报与（仅「修订方案」时向策划 rapporteur 的）重做方案投递；不代客户决定、不改需求。 */
  private async afterPlanEscalation(
    projectRoot: string,
    input: { requestId: string; flowId: string },
    outcome: CustomerInputOutcome | null | undefined,
  ): Promise<void> {
    const convener = this.handbackOwnerRoleId(projectRoot) ?? "convener";
    const chief = this.chiefTaskRoleIdOf(projectRoot) ?? "chief";
    const notify = (roleId: string, text: string): void => {
      const runtime =
        this.findLiveRuntime(projectRoot, roleId) ??
        this.lastGovernanceRuntime.get(projectRoot) ??
        this.activeRuntimeFor(projectRoot) ??
        "demo";
      this.emitDeliveryNote(projectRoot, runtime, roleId, roleId, `[${mainT("ui.planEscalation.title")}] ${text}`);
    };
    if (outcome === null || outcome === undefined || outcome.outcome !== "answered") {
      const reason = outcome === null || outcome === undefined ? "unavailable" : outcome.outcome;
      notify(convener, mainT("main.planEscalation.notAnswered", { flowId: input.flowId, reason: String(reason) }));
      return;
    }
    const selected = Array.isArray(outcome.value?.selected) ? String(outcome.value.selected[0] ?? "") : "";
    let resultText: string;
    switch (selected) {
      case "escalation-revise":
        resultText = mainT("main.planEscalation.result.revise", { flowId: input.flowId });
        break;
      case "escalation-environment":
        resultText = mainT("main.planEscalation.result.environment", { flowId: input.flowId });
        break;
      case "escalation-continue":
        resultText = mainT("main.planEscalation.result.continue", { flowId: input.flowId });
        break;
      case "escalation-stop":
        resultText = mainT("main.planEscalation.result.stop", { flowId: input.flowId });
        break;
      default:
        resultText = mainT("main.planEscalation.result.unknown", { flowId: input.flowId, selected });
        break;
    }
    notify(convener, resultText);
    if (chief !== convener) notify(chief, resultText);
    if (selected === "escalation-revise") {
      // 「修订方案」⇒ 请策划（rapporteur）按客户裁定重做方案（投一条消息；不自动改方案/文档/验收标准）。
      const planner = "rapporteur";
      const runtime =
        this.findLiveRuntime(projectRoot, planner) ??
        this.lastGovernanceRuntime.get(projectRoot) ??
        this.activeRuntimeFor(projectRoot);
      if (runtime !== undefined) {
        // 运行时的投递政策（如生产宿主 `demoRuntimeAutoDeliver:false` 不自动开 demo 会话）由投递机统一裁决——
        // 本层不按 runtime 种类静默丢弃客户裁定；消息入队保留，不伪造已投递。
        const decisionKey = typeof outcome.decisionId === "string" && outcome.decisionId !== "" ? outcome.decisionId : input.requestId;
        const text = mainT("main.planEscalation.revisePrompt", { flowId: input.flowId, requestId: input.requestId });
        this.enqueueDelivery(projectRoot, planner, {
          kind: "message",
          runtime,
          targetRoleId: planner,
          sourceRoleId: convener,
          text,
          summary: shortenSummary(text, 120),
          dedupKey: `${projectRoot}\u0000plan-escalation\u0000${input.flowId}\u0000${decisionKey}`,
        });
        void this.drainQueue(projectRoot, planner, runtime);
      }
    }
  }

  /**
   * stable 写入的 post-write 复核（D1/F16）：**只在运行时核心 write/edit 成功后**由
   * `versionedDocAfterWrite` 接缝调用；桌面不写盘、不缓存许可、不复算 target hash。
   * 失败只系统行/诊断（写入已成事实；许可由 S2 作废，trunk 快照不更新——无 drift 状态）。
   */
  private async afterStableWrite(
    stack: VersionChangeStack,
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    absPath: string,
  ): Promise<void> {
    try {
      const rel = path.relative(projectRoot, absPath);
      if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return;
      const posix = rel.split(path.sep).join("/");
      const actual = createHash("sha256").update(await fs.promises.readFile(absPath)).digest("hex");
      const result = await stack.completeStableWriteAfterWrite(posix, actual, new Date(this.now()).toISOString());
      if (!result.ok) {
        this.emitDeliveryNote(
          projectRoot,
          runtime,
          roleId,
          roleId,
          `${mainT("ui.stableWrite.record.section")} · ${posix} · ${mainT("shared.common.failed")}${result.code !== undefined ? ` (${result.code})` : ""}`,
        );
      }
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("stable-write.complete.failed", error);
    }
  }

  /**
   * AC-13（D2）：stable boundary 确认卡扩大检测与 ack 注入。
   * 只读调用 S7 `detectStableBoundaryExpansion`（preview body → 条目级扩大）；
   * role-card/boundary 的 appointment-write 语义不变（只增预览横幅/required acknowledgments）。
   */
  private async enrichAppointmentWriteBoundaryCard(
    stack: VersionChangeStack,
    projectRoot: string,
    request: CustomerInputRequest,
  ): Promise<{ kind: "pass"; request: CustomerInputRequest } | { kind: "reject"; reason: string }> {
    if (request.kind !== "confirm") return { kind: "pass", request };
    const paths = declaredConfirmPaths(request);
    const boundaryPaths = paths.filter((rel) => stableWritePathOf(rel)?.kind === "boundary");
    if (boundaryPaths.length === 0) return { kind: "pass", request };
    const bodies = new Map(declaredPathBodies(request.preview, boundaryPaths).map((entry) => [entry.path, entry]));
    const expansions: string[] = [];
    for (const relPath of boundaryPaths) {
      const info = stableWritePathOf(relPath);
      if (info === undefined || info.kind !== "boundary" || info.roleId === undefined) continue;
      const body = bodies.get(relPath) ?? bodies.get(info.path);
      if (body === undefined || body.hasBody !== true) {
        return { kind: "reject", reason: mainT("main.interface.boundaryParseFailed", { detail: relPath }) };
      }
      const detected = await stack.detectStableBoundaryExpansion({
        roleId: info.roleId,
        fromPath: info.path,
        toYamlText: body.body,
      });
      expansions.push(...detected.expansions);
    }
    if (expansions.length === 0) return { kind: "pass", request };
    const risk = buildStableBoundaryRisk(expansions);
    if (risk.unparseable) {
      return {
        kind: "reject",
        reason: mainT("main.interface.boundaryParseFailed", { detail: expansions.join("；") }),
      };
    }
    return {
      kind: "pass",
      request: {
        ...request,
        preview: `${risk.banner}\n\n${request.preview ?? ""}`,
        acknowledgments: mergeAcknowledgements(request.acknowledgments, risk.acknowledgments),
      },
    };
  }

  /**
   * appointment-write 确认后的 stable 许可签发（role-card/boundary；**不写盘**）：
   * 正文取自确认卡 preview 的逐路径正文；真实写入由角色 write_file/edit_file 经 run-role gate 执行。
   * 失败只系统行（写入会被门禁拒绝——fail-closed，不伪造成功）。
   * AC-13：扩大检测要求的 required acknowledgments 未齐 ⇒ **不签发任何许可**（最后防线）。
   */
  private async afterAppointmentWriteApproved(
    stack: VersionChangeStack,
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    request: CustomerInputRequest,
    outcome: CustomerInputOutcome | null | undefined,
  ): Promise<void> {
    if (outcome === null || outcome === undefined || outcome.outcome !== "answered" || outcome.value.confirmed !== true) return;
    const requiredBoundaryAcks = (request.acknowledgments ?? [])
      .filter((entry) => entry.required === true && entry.id.startsWith("boundary-expansion-"))
      .map((entry) => entry.id);
    if (requiredBoundaryAcks.length > 0) {
      const acknowledged = Array.isArray(outcome.acknowledged) ? outcome.acknowledged : [];
      if (requiredBoundaryAcks.some((id) => !acknowledged.includes(id))) {
        this.emitDeliveryNote(
          projectRoot,
          runtime,
          roleId,
          roleId,
          `${mainT("ui.stableWrite.record.section")} · ${mainT("ui.stableWrite.kind.boundary")} · ${mainT("shared.common.failed")} (boundary-ack-missing)`,
        );
        return;
      }
    }
    const confirmationId =
      typeof outcome.decisionId === "string" && outcome.decisionId.trim() !== "" ? outcome.decisionId : undefined;
    if (confirmationId === undefined) return;
    const inputs = appointmentStableWriteInputs(request);
    for (const input of inputs) {
      try {
        const result = await stack.onAppointmentWriteApproved({
          roleId: input.roleId,
          kind: input.kind,
          content: input.content,
          confirmationId,
          ...(input.diffPreview !== undefined ? { diffPreview: input.diffPreview } : {}),
          at: new Date(this.now()).toISOString(),
        });
        if (!result.ok) {
          this.emitDeliveryNote(
            projectRoot,
            runtime,
            roleId,
            roleId,
            `${mainT("ui.stableWrite.record.section")} · ${mainT("ui.stableWrite.kind.roleCard")}/${mainT("ui.stableWrite.kind.boundary")} · ${mainT("shared.common.failed")}${result.code !== undefined ? ` (${result.code})` : ""}`,
          );
        }
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error(
          "stable-write.appointment.failed",
          error,
        );
      }
    }
  }

  /**
   * 2026-10-31（run-change 触发缺陷）：当前项目的 active run（draft/pinned）只读摘要——供桌面
   * 「契约变更 · 重开 run」入口判断是否可用（无 pinned run 时禁用并给原因）。
   * 只读 manifest；不读正文、不改状态、不伪装 pinned。
   */
  async activeRunViews(projectRoot: string): Promise<{ ok: true; runs: ActiveRunView[] } | { ok: false; error: string }> {
    const listed = await listRunManifestsResult(projectRoot);
    if (!listed.ok) return { ok: false, error: listed.reason };
    return {
      ok: true,
      runs: listed.manifests
        .filter((manifest) => manifest.state === "draft" || manifest.state === "pinned")
        .map((manifest) => ({
          runId: manifest.runId,
          flowId: manifest.flowId,
          state: manifest.state === "pinned" ? "pinned" : "draft",
          ...(manifest.pinnedAt !== undefined ? { pinnedAt: manifest.pinnedAt } : {}),
          ...(manifest.rosterVersion !== undefined ? { rosterVersion: manifest.rosterVersion } : {}),
          ...(manifest.roles !== undefined ? { roles: [...manifest.roles] } : {}),
          documents: pinnedDocsSummary(manifest),
        })),
    };
  }

  /**
   * 冻结 run 上出现**比 pin 更新的提案卡**时的识别（`cardKind=proposal`）：提案卡意味着要对新版本
   * 提案作答，而冻结语义规定 active run 不激活新版本 ⇒ 先尝试 run-change 卡，本提案卡以
   * `run-change-required` 三段式拒发（`notPresented`，不冒充客户拒绝）。
   * 无 pinned run / 提案版本不高于 pin ⇒ undefined（零行为变化）。
   */
  private async proposalCardFrozenRejection(
    projectRoot: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    sourceRoleId?: string,
  ): Promise<{ rejection: MechanicalRejection; presented: boolean } | undefined> {
    if (request.cardKind !== "proposal") return undefined;
    const flowId = request.flowId ?? metadata?.flowId;
    if (typeof flowId !== "string" || flowId.trim() === "") return undefined;
    const active = await findActiveRun(projectRoot, flowId);
    if (!active.ok || active.manifest === null || active.manifest.state !== "pinned") return undefined;
    const newer = await findNewerContractDocs(projectRoot, active.manifest);
    const proposalDoc = newer.find((doc) => doc.kind === "proposal");
    if (proposalDoc === undefined) return undefined;
    return this.offerRunChangeOnFrozenContract({
      projectRoot,
      flowId,
      manifest: active.manifest,
      newer,
      reason: `提案卡引用了比 pin 更新的提案（${proposalDoc.path}，v${proposalDoc.version} > pin v${proposalDoc.pinnedVersion ?? "?"}）；当前 run 已冻结，新版本不激活`,
      missing: `当前 run 冻结基线内的提案版本（磁盘 ${proposalDoc.path} v${proposalDoc.version} > pin v${proposalDoc.pinnedVersion ?? "?"}）`,
      requestedBy: "planner",
      ...(sourceRoleId !== undefined ? { noteRoleId: sourceRoleId } : {}),
    });
  }

  /**
   * AC-17（D2）：当前项目在途 VCA（submitted/approved）。查询失败 ⇒ fail-closed（调用方抑制自动
   * run-change）；无版本变更栈（未接）⇒ 空（旧行为零变化）。
   */
  private async pendingVersionChangesFor(
    projectRoot: string,
  ): Promise<{ ok: true; pending: Array<{ applicationId: string; status: string }> } | { ok: false; reason: string }> {
    const stack = this.deps.getVersionChangeStack?.(projectRoot);
    if (stack === undefined) return { ok: true, pending: [] };
    try {
      const records = await stack.listVersionChanges();
      return {
        ok: true,
        pending: records
          .filter((record) => record.status === "submitted" || record.status === "approved")
          .map((record) => ({ applicationId: record.applicationId, status: record.status })),
      };
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot }).error(
        "version-change.pending.read.failed",
        error,
      );
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * 2026-10-31：呈现 run-change 卡（同一 run 自动仅一次）+ 组装 `run-change-required` 三段式。
   * 冻结语义不变——调用方仍拒绝原操作；客户决定后按 continue-frozen / stop-and-restart / stop 继续。
   * AC-17（D2）：修订/VCA 在途（submitted/approved）⇒ **抑制自动 offer**（不占用自动提示名额，
   * 不弹 run-change 卡；显式低层入口 `requestRunChangeDecision` 不受影响）；VCA 结束后下一次
   * 冻结冲突自动 offer 恢复。
   */
  private async offerRunChangeOnFrozenContract(input: {
    projectRoot: string;
    flowId: string;
    manifest: RunManifest;
    newer: NewerContractDoc[];
    reason: string;
    /** 三段式 missing 用（「拒绝：缺少 …」通顺的名词短语）；缺省回退 reason。 */
    missing?: string;
    requestedBy?: "convener" | "planner" | "product";
    /** AC-17：系统行落位（来源角色；缺省 chief）。 */
    noteRoleId?: string;
  }): Promise<{ rejection: MechanicalRejection; presented: boolean }> {
    // AC-17（D2）：在途 VCA 抑制自动 run-change offer；不写 `runChangeAutoPrompted`，VCA 结束后可恢复。
    const inFlight = await this.pendingVersionChangesFor(input.projectRoot);
    if (!inFlight.ok || inFlight.pending.length > 0) {
      const detail = inFlight.ok
        ? inFlight.pending
            .map(
              (entry) =>
                `${entry.applicationId} (${mainT(
                  entry.status === "approved"
                    ? "ui.versionChange.status.approved"
                    : "ui.versionChange.status.submitted",
                )})`,
            )
            .join("、")
        : inFlight.reason;
      const reason = inFlight.ok
        ? `${mainT("ui.versionChange.entry")} · ${detail} — ${mainT("ui.versionChange.submitGuidance")}`
        : mainT("ui.versionChange.disabledUnknown", { detail });
      const runtime =
        (input.noteRoleId !== undefined ? this.findLiveRuntime(input.projectRoot, input.noteRoleId) : undefined) ??
        this.lastGovernanceRuntime.get(input.projectRoot) ??
        "demo";
      this.emitDeliveryNote(
        input.projectRoot,
        runtime,
        input.noteRoleId ?? null,
        "chief",
        `[${mainT("ui.trunk.panelTitle")}] ${reason}`,
      );
      return {
        rejection: makeMechanicalRejection("run-change-required", [reason], {
          action: `${mainT("ui.versionChange.entry")}: ${mainT("ui.versionChange.submitGuidance")}`,
          docs: input.newer.map((doc) => doc.path).slice(0, 5),
        }),
        presented: false,
      };
    }
    const key = `${input.projectRoot}\u0000${input.manifest.runId}`;
    const proposedDocs: Record<string, string> = {};
    for (const doc of input.newer) proposedDocs[doc.kind] = doc.path;
    let presented = false;
    if (!this.runChangeAutoPrompted.has(key)) {
      this.runChangeAutoPrompted.add(key);
      const started = await this.requestRunChangeDecision({
        projectRoot: input.projectRoot,
        flowId: input.flowId,
        ...(input.requestedBy !== undefined ? { requestedBy: input.requestedBy } : {}),
        reason: input.reason,
        ...(Object.keys(proposedDocs).length > 0 ? { proposed: { documents: proposedDocs, schemas: {} } } : {}),
      });
      if (!started.ok) {
        // 没有可呈现会话 ⇒ 不占用「已自动提示」名额：打开统筹/提案/幕僚会话后，下次冻结冲突仍可自动弹。
        this.runChangeAutoPrompted.delete(key);
      } else {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
          timer = setTimeout(() => resolve({ kind: "timeout" }), 1500);
        });
        const first = await Promise.race([started.first, timeout]);
        if (timer !== undefined) clearTimeout(timer);
        presented = first.kind === "presented" || (first.kind === "outcome" && first.outcome.outcome === "answered");
      }
    }
    const pinnedRosterPath = input.manifest.documents.roster !== null && input.manifest.documents.roster !== undefined
      ? input.manifest.documents.roster.path
      : undefined;
    const docs = [
      ...input.newer.map((doc) => doc.path),
      ...(pinnedRosterPath !== undefined ? [pinnedRosterPath] : []),
    ].slice(0, 5);
    const rejection = makeMechanicalRejection("run-change-required", [input.missing ?? input.reason], {
      action: presented
        ? "应用已向客户呈现 run-change 卡（继续冻结 / 停止并重开 run / 停止）；由客户选择模式，决定后按新模式继续。"
        : "客户可在会话头点击「契约变更 · 重开 run」发起 run-change（继续冻结 / 停止并重开 run / 停止）；若无可呈现会话，先打开统筹/提案/幕僚会话再重试。",
      docs,
    });
    return { rejection, presented };
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  governanceOwnerRoleId(projectRoot: string): string | null {
    return this.diagnostics.governanceOwnerRoleId(projectRoot);
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  governanceRuntimeFor(projectRoot: string): RuntimeKind | undefined {
    return this.diagnostics.governanceRuntimeFor(projectRoot);
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  activeRuntimeFor(projectRoot: string): RuntimeKind | undefined {
    return this.diagnostics.activeRuntimeFor(projectRoot);
  }

  /**
   * 该 flow 是否仍有**在途**派发/回交/运行轮次（纯读；2026-10-19 验收自动派发用）。
   * 有 ⇒ 验收检查推迟到下一次事件，避免在交付完成前抢跑派 Proof；不制造第二份状态。
   */
  async refreshListingNow(projectRoot: string): Promise<boolean> {
    return refreshListingNow(projectRoot, this.deps);
  }

  /**
   * **等待某角色下一轮 settle**（W6-B 真机阻塞修复；只等一次、有上限）：客户决定卡是在来源角色
   * **本轮中途**作答的，来源本轮可能还在写角色卡/提案——先等它收尾（settle），再让应用推进下一步。
   * · 无会话 / 当前不忙 ⇒ 立即 true（无需等）；
   * · 超时（缺省 60s）⇒ false（调用方记诊断后**照常继续**，绝不循环重试）；
   * · 会话被 dispose ⇒ false（解析，不悬挂）。
   */
  waitForRoleSettle(
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    timeoutMs = 60_000,
  ): Promise<boolean> {
    const entry = this.sessions.get(this.sessionKey(projectRoot, roleId, runtime));
    if (!entry || entry.busy !== true) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (settled: boolean): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        entry.settleWaiters?.delete(finish);
        if (entry.settleWaiters !== undefined && entry.settleWaiters.size === 0) entry.settleWaiters = undefined;
        resolve(settled);
      };
      const timer = setTimeout(() => finish(false), Math.max(1, timeoutMs));
      (entry.settleWaiters ??= new Set()).add(finish);
    });
  }

  /**
   * **等待角色真正空闲**（链式治理推进用，2026-10-18 真机修正）：`busy !== true` **且**该角色的投递队列为空。
   *
   * 与 `waitForRoleSettle` 的差别：后者只等「下一轮 settle」——若目标在收到任务前正忙、任务经既有投递机
   * 排队，第一次 settle 只结束**上一轮**，本次任务尚未跑完。链式检查「Convener 是否写出了流程单」必须等
   * 本次任务真正结束。**只等待、不重投、不重试**；超时或会话释放 ⇒ false（调用方如实报错、不循环）。
   *
   * **注意（2026-10-20 真机）**：本方法以「会话条目存在 + 不忙 + 队列空」判空闲——刚投递（会话可能被
   * 并发重建/释放）时会立即返回 false，真机因此产生 5ms 假错误。**链式治理推进已改用目标事实轮询**
   * （`interface.ts::advanceGovernanceFlow`，读流程 YAML / 角色卡枚举）；新调用方不要再用它断定
   * 「某个任务是否完成」。保留仅为既有 API 兼容。
   */
  waitForRoleIdle(
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    timeoutMs = 60_000,
  ): Promise<boolean> {
    const key = this.sessionKey(projectRoot, roleId, runtime);
    const queueKey = this.queueKey(projectRoot, roleId, runtime);
    const deadline = Date.now() + Math.max(1, timeoutMs);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (idle: boolean): void => {
        if (done) return;
        done = true;
        clearInterval(timer);
        resolve(idle);
      };
      const check = (): void => {
        const entry = this.sessions.get(key);
        if (!entry) {
          finish(false); // 会话被释放：没有可等待的轮次，如实失败。
          return;
        }
        const queue = this.deliveryQueues.get(queueKey);
        const idle = entry.busy !== true && (queue === undefined || queue.length === 0);
        if (idle) {
          finish(true);
          return;
        }
        if (Date.now() >= deadline) finish(false);
      };
      const timer = setInterval(check, 50);
      check();
    });
  }

  private async openInternal(req: InternalSessionOpenRequest, userInitiated: boolean, selectionVersion = this.selectionVersion): Promise<OpenResult> {
    if (req.taskId && this.runTaskIsFenced(req.projectRoot, req.taskId)) return { ok: false, error: "run-stop-host-fenced:原运行任务已暂停，未重新开启。" };
    const key = this.sessionKey(req.projectRoot, req.roleId, req.runtime);
    const lifecycle = this.deliveryLifecycle(key);
    const prev = this.openChains.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail: Promise<void> = prev.then(() => gate);
    this.openChains.set(key, tail);
    this.inventoryChanged(req.projectRoot, "session-open-chain-queued");
    try {
      await prev;
      return await this.openInternalUnsafe(req, userInitiated, selectionVersion, false, lifecycle);
    } finally {
      release();
      if (this.openChains.get(key) === tail) this.openChains.delete(key); // 链尾清理（防泄漏）
      this.inventoryChanged(req.projectRoot, "session-open-chain-settled");
    }
  }

  /** `open` 的实现（`userInitiated=false` = 投递机后台自动开启：不抢活动角色，其余逐字同）。
   *  `internalReopen=true`（G-2/W4；仅重建链内续段使用——陈旧重建与人工 `rebuildSession`）：
   *  **不再查陈旧、不再入 rebuild 链**——① 防「链内等待自身尾」的自死锁（rebuildIfBoundaryStaleUnsafe 的
   * 重开处于该角色的 rebuild 链内，再入链会等自己）；② 此时旧条目已被本链 dispose；若并发方已重建出新会话，
   *  如实按续接返回（不重复重建——重开目标已达成）。 */
  private async openInternalUnsafe(req: InternalSessionOpenRequest, userInitiated: boolean, selectionVersion = this.selectionVersion, internalReopen = false,
    lifecycle = this.deliveryLifecycle(this.sessionKey(req.projectRoot, req.roleId, req.runtime))): Promise<OpenResult> {
    if (!req.projectRoot || !req.roleId) {
      return { ok: false, error: mainT("main.session.missingProjectOrRole") };
    }
    if (!(RUNTIME_KINDS as readonly string[]).includes(req.runtime)) return { ok: false, error: mainT("main.common.unknownRuntime") };
    const key = this.sessionKey(req.projectRoot, req.roleId, req.runtime);
    const stopped = () => this.deliveryIsStopped(key) || this.deliveryLifecycle(key) !== lifecycle;
    const stoppedResult = (): OpenResult => ({ ok: false, error: "会话已停止，待投递消息已保留；请显式打开会话或重试投递。" });
    if (stopped()) return stoppedResult();
    // T3 B1（AC-12/AC-23）：会话级 workflow 模式按**输入任务的真实 flowId** 解析（与 run-role 同源；
    // single/su 不参与）。fixed 任务不使用 legacy trunk 的 assigned-task 绑定——否则在 fixed 任务
    // （无 runId）上会 fail-closed 为 `delivery-assignment-unavailable` 且永远到不了 fixed 注入面。
    // legacy/空任务路径逐字不变（模式解析失败 ⇒ legacy，不猜 fixed）。
    // T3 B6.1（2026-11-11）：**真实聊天入口**（无 taskId 的 trio 幕僚聊天）不再硬编码 legacy——按项目
    // 状态解析（空项目/纯新项目 ⇒ fixed；legacy 项目/在飞 run/显式 legacy/v1 ⇒ legacy；fail-closed）。
    // 依据 RR 失败根因 `fixed-path-not-activated-from-chief-chat`；有 taskId 仍按任务 flow（`sessionWorkflowModeForTask`）。
    // T3 B8.1（2026-11-11，RR3 根因 `fixed-dispatch-target-opened-legacy`）：固定派发/投递机在内部打开
    // 目标会话时可携带 `forcedWorkflowMode:"fixed"`——不再依赖聊天入口按项目状态的现场解析（混合项目
    // 「在飞 legacy run + fixed workflow」时聊天解析为 legacy；RR3 实测 convener 会话以 legacy 打开并
    // 收到 `request_stable_write`）。强制只在 trio 生效（固定路径为 trio 产品流程）；未携带时下面
    // task/chat 逻辑逐字不变。
    const listingGovernanceModel = this.deps.getListing(req.projectRoot)?.governanceModel ?? "single";
    const forcedSessionWorkflowMode: WorkflowMode | undefined =
      req.forcedWorkflowMode === "fixed" && listingGovernanceModel === "trio" ? "fixed" : undefined;
    const requestedSessionMode: WorkflowMode =
      forcedSessionWorkflowMode ??
      (listingGovernanceModel === "trio"
        ? req.taskId !== undefined
          ? await sessionWorkflowModeForTask(req.projectRoot, req.taskId)
          : await sessionWorkflowModeForChat(req.projectRoot)
        : "legacy");
    let requestedAssignment: DeliveryAssignment | undefined;
    if (req.taskId && requestedSessionMode !== "fixed") {
      const actual = await resolveDeliveryAssignment({ projectRoot: req.projectRoot, recipientRoleId: req.roleId, source: { kind: "assigned-task", taskId: req.taskId } });
      if (!actual.ok) return { ok: false, error: `${actual.code}:${actual.message}` };
      if (stopped()) return stoppedResult();
      requestedAssignment = actual.value;
    }
    // A worker's frozen document context and task-directory gate belong to one real assigned child.
    const previousTaskSession = this.sessions.get(key);
    if (req.taskId && (req.roleId === "verifier" || !isBuiltInGovernanceRoleId(req.roleId)) && previousTaskSession && previousTaskSession.assignedTaskId !== req.taskId) {
      if (previousTaskSession.busy || previousTaskSession.origins.running !== undefined)
        return { ok: false, error: "worker-task-session-busy：目标正在执行另一真实任务，保持排队。" };
      const disposed = await this.disposeEntry(key, previousTaskSession);
      if (disposed !== null) return { ok: false, error: disposed };
    }
    // T3 B8.1（2026-11-11，RR3）：fixed 任务的目标会话必须是 **fixed 会话**。既有条目若为 legacy 注入
    // （混合项目聊天解析/早期自动打开等），先安全关闭再按 fixed 新建；busy（含在跑 origin）或关闭失败 ⇒
    // fail-closed `fixed-session-rebind-blocked`——**绝不把 fixed 投递进 legacy 会话**（RR3 的 legacy
    // stable-write 卡）。该重绑只发生在 forced fixed 的内部打开上；用户/legacy 打开路径逐字不变。
    // T3 B10.1（2026-11-11，RR5 根因 `report-task-link-broken`）：fixed 任务的目标会话还必须绑定
    // **本次真实任务**（`assignedTaskId`）——否则 run-role 的 handback intent 没有 taskId，
    // `submit_report` 以「任务关联未知」到达、`task.reported` 缺失、`close_created_task accepted`
    // 报 `close-report-missing`（RR5 实测 convener/product 全中）。既有 fixed 条目未绑定本次任务
    // （聊天打开/上一任务）时同样按 B8.1 口径安全重开；busy/关闭失败 ⇒ fail-closed。O-1 重建续段
    // （`internalReopen`）不参与任务重绑：其 taskId 取自被重建条目自身，不能反过来打断并发新会话。
    const forcedExisting = this.sessions.get(key);
    const fixedTaskRebindPending = forcedSessionWorkflowMode === "fixed" && !internalReopen
      && typeof req.taskId === "string" && req.taskId !== ""
      && forcedExisting !== undefined && forcedExisting.projectRoot === req.projectRoot
      && forcedExisting.sessionWorkflowMode === "fixed"
      && forcedExisting.assignedTaskId !== req.taskId;
    if (forcedSessionWorkflowMode === "fixed" && forcedExisting && forcedExisting.projectRoot === req.projectRoot
        && (forcedExisting.sessionWorkflowMode !== "fixed" || fixedTaskRebindPending)) {
      const rebindDiagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId });
      if (forcedExisting.busy || forcedExisting.origins.running !== undefined) {
        rebindDiagnostic.record("session.fixed-rebind.blocked", { reasonCode: "target-busy", previousWorkflowMode: forcedExisting.sessionWorkflowMode, taskBinding: fixedTaskRebindPending ? "different-task" : "not-fixed" });
        return { ok: false, error: "fixed-session-rebind-blocked：目标会话正在执行轮次，无法以本次固定任务重开（未向该会话投递，待其空闲后重试）。" };
      }
      const rebound = await this.disposeEntry(key, forcedExisting);
      if (rebound !== null) {
        rebindDiagnostic.record("session.fixed-rebind.blocked", { reasonCode: "close-failed", detail: rebound });
        return { ok: false, error: `fixed-session-rebind-blocked：目标旧会话关闭失败（${rebound}），未以固定模式重开。` };
      }
      rebindDiagnostic.record("session.fixed-rebind", { previousWorkflowMode: forcedExisting.sessionWorkflowMode, taskRebind: fixedTaskRebindPending });
    }
    // B-2：该角色已有**同项目**的保活会话 → 续接（句柄与模型上下文原样保留）。
    const existing = this.sessions.get(key);
    if (existing && existing.projectRoot === req.projectRoot) {
      if (internalReopen) {
        // 重建链内的重开（见方法头注）：当前条目即并发方刚建好的新会话（或本链尚未 dispose 的防御路径）——
        // 按续接如实返回，不再触发任何 reopen 预检。
        existing.lastUsed = ++this.lruClock;
        if (userInitiated && this.selectionVersion === selectionVersion) this.activeRoleId = key;
        this.notifyRoleState(req.projectRoot, req.roleId, req.runtime);
        this.noteWatchdogActivity(req.projectRoot, "session-open");
        return {
          ok: true,
          note: mainT("main.session.readyContinue"),
          config: existing.config,
          resumed: true,
          contextSource: "resumed",
          runtime: req.runtime, projectRoot: req.projectRoot, profileRevision: existing.profileRevision,
        };
      }
      // O-1（2026-10-12）：续接前先查**边界快照**——陈旧 ⇒ 作废并按下方**新建**路径重开（历史按 D-1 恢复）；
      // 未陈旧 ⇒ 逐字续接（**绝不**误重开丢上下文）。在跑的轮次不打断（busy 时跳过，下一时机再查）。
      const rebuilt = await this.rebuildIfBoundaryStale(key, userInitiated, selectionVersion, forcedSessionWorkflowMode);
      if (rebuilt === undefined) {
        // 串行等待期间后台可能已替换旧条目，续接必须取当前句柄。
        const current = this.sessions.get(key);
        if (!current || current.projectRoot !== req.projectRoot) {
          return { ok: false, error: mainT("main.session.closedClickRole") };
        }
        current.lastUsed = ++this.lruClock;
        if (userInitiated && this.selectionVersion === selectionVersion) this.activeRoleId = key;
        this.notifyRoleState(req.projectRoot, req.roleId, req.runtime); // 重载/续接恢复真实busy与队列，不另推导。
        let note = mainT("main.session.continuing");
        if (current.profileRevision !== this.profileRevision(req.runtime)) note = mainT("main.session.configAfterTurn");
        return {
          ok: true,
          note,
          config: current.config,
          resumed: true,
          contextSource: "resumed",
          runtime: req.runtime, projectRoot: req.projectRoot, profileRevision: current.profileRevision,
        };
      }
      if (!rebuilt.reopened.ok) {
        return { ok: false, error: mainT("main.session.boundaryRebuildFailed", { detail: rebuilt.reopened.error ?? mainT("shared.common.unknownReason") }) };
      }
      return rebuilt.reopened;
    }
    // 同一个三元身份才可能复用；跨项目及跨引擎的句柄并存。
    if (existing) {
      await this.disposeEntry(key, existing);
    }

    let listing = this.deps.getListing(req.projectRoot);
    if (!listing) {
      return { ok: false, error: mainT("main.session.projectNotEnumerated") };
    }
    let role = listing.roles.find((r) => r.roleId === req.roleId);
    if (!role) {
      // **2026-10-18 真机竞态**：任命写卡后 `.ans`/角色表刷新期间，旧 listing 缓存可能还没有目标内置角色
      // （Convener 按新边界重建时 `open()` 报「未找到角色：convener」）。这里**强制刷新一次**共享缓存
      // （与界面 `listProject` 同一 `listProjectFn`）再查；仍找不到才如实报错。**只刷新一次、不循环**。
      const refreshed = await this.refreshListingNow(req.projectRoot);
      if (refreshed) {
        listing = this.deps.getListing(req.projectRoot);
        role = listing?.roles.find((r) => r.roleId === req.roleId);
      }
      if (!role || !listing) {
        return { ok: false, error: mainT("main.session.roleNotFound", { projectRoot: req.projectRoot, roleId: req.roleId }) };
      }
      createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId }).record(
        "session.open.stale-listing-refreshed",
        { refreshed },
      );
    }

    // ——— 授权模型：**有 `.ans` 优先用它（pin 生效）；无 `.ans` 才回退运行期同意** ———
    //
    // 判定链的**唯一实现在共享载入器** `src/common/shared/config-loader.ts`（pm 属主，本角色只读导入、
    // 不复制），并经 `project.ts::buildEffectiveProjectConfig` 收敛为**一处**（会话语义与界面只读判定共用，
    // 杜绝两处漂移）。三分支（载入器恒返回、不抛）：
    //  ① 有可用的 `.ans/project.json` → 用其 **pin-backed acceptance**（pin 生效、受 pin 约束，篡改即由
    //     门禁 `verifyPins` 判未接受 → 拒写）；
    //  ② **无** `.ans` → 载入器原样回退入参 fallback，即**运行期同意**（`DESKTOP_RUNTIME_CONSENT`，
    //     设计 §3.3 登记的两个非-pin 例外之一——理由见 project.ts 该常量注释）；
    //  ③ `.ans` 存在但**不可用** → 载入器 **fail-closed** 置为未接受、**绝不**回退运行期同意。
    //
    // ⚠️ 本函数随 `buildEffectiveProjectConfig` **一并采纳载入器给出的**项目治理边界路径
    // （`loaded.project.governanceBoundary.path`）——这是「**已 bootstrap 的项目里 su 按项目治理边界工作**」
    // 的前提；此前该路径被丢弃（恒空串）⇒ su 掉回内置未接受、拒一切写。修复后三条路径都正确：
    // 无 `.ans` 回退运行期同意 / 未 bootstrap（`!hasRoles`）走创世 / 已 bootstrap（`.ans` 有效）按项目治理边界。
    //
    // 角色表仍取门禁引擎的枚举结果（本层不另写解析，与左树同源）——载入器的 `project.roles` 只是 `.ans`
    // 分支的产物（`ans-invalid` 分支为空），桌面有意以**枚举角色**为准。
    const { project: baseProject, source } = await buildEffectiveProjectConfig(listing, {
      buildProjectConfig: this.deps.buildProjectConfig,
      loadEffectiveConfig: this.loadEffectiveConfig,
    });
    let project = baseProject;
    if (req.taskId && role.builtIn !== true && requestedSessionMode !== "fixed") {
      // legacy 项目角色的真实执行任务上下文（trunk run/冻结名单）；fixed 任务作用域属 B3（此处不猜）。
      const assigned = await inspectAssignedTask({ projectRoot: req.projectRoot, taskId: req.taskId, actorRoleId: req.roleId });
      if (!assigned.ok) return { ok: false, error: `${assigned.code}：${assigned.message ?? assigned.code}` };
      if (assigned.value.kind !== "execution") return { ok: false, error: "worker-task-context-unavailable：缺少实际执行任务绑定。" };
      const context = await readRunRoleContext({ projectRoot: req.projectRoot, runId: assigned.value.runId, roleId: req.roleId });
      if (!context.ok) return { ok: false, error: `${context.code}：${context.message}` };
      const taskScope = await prepareAssignedTaskWriteScope({ projectRoot: req.projectRoot, taskId: req.taskId, actorRoleId: req.roleId });
      if (!taskScope.ok) return { ok: false, error: `${taskScope.code}：${taskScope.message ?? taskScope.code}` };
      project = { ...project, documentContext: context.documentContext };
    }
    const config: EffectiveConfigInfo = {
      kind: source.kind,
      accepted: source.acceptance.accepted === true,
      acceptanceSource: source.acceptance.source,
      pinCount: source.acceptance.pin?.length ?? 0,
      reason: source.downgradeReason,
    };
    const boundary = role.boundary;
    const gitBinding: { handle?: RoleSessionHandle } = {};
    const currentGitRuntime = async () => {
      const entry = this.sessions.get(key), origin = entry?.origins.running;
      const current = () => !!entry && this.sessions.get(key) === entry && entry.handle === gitBinding.handle && entry.origins.running === origin &&
        !!origin && !origin.settled && !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted && !this.deliveryIsStopped(key);
      if (!current()) return { ok: false as const, code: "git-delivery-source-changed", message: "没有当前真实工具回合" };
      let assignment = origin?.assignment;
      if (assignment) {
        const fresh = await resolveDeliveryAssignment({ projectRoot: req.projectRoot, recipientRoleId: req.roleId,
          source: { kind: "assigned-task", taskId: assignment.taskId }, expectedFlowId: assignment.flowId,
          ...(assignment.runId ? { expectedRunId: assignment.runId } : {}) });
        if (!current()) return { ok: false as const, code: "git-delivery-source-changed", message: "核验期间工具回合已变化" };
        if (!fresh.ok) return fresh;
        assignment = fresh.value;
        if (this.runTaskIsFenced(req.projectRoot, assignment.taskId, assignment.runId)) return { ok: false as const, code: "run-stop-host-fenced", message: "原运行的工具来源已暂停" };
      }
      return { ok: true as const, runtime: createGitRoleRuntime({ projectRoot: req.projectRoot, context: { actorRoleId: req.roleId, readPaths: ["."],
        ...(assignment ? { taskId: assignment.taskId, ...(assignment.runId ? { runId: assignment.runId } : {}) } : {}) } }) };
    };
    const gitContextFailure = (operationId: string, failure: { code: string; message: string }) => ({ operationId, repoId: "unavailable",
      status: "blocked" as const, code: failure.code, message: failure.message });
    let routineShellPolicy: RoutineShellPolicy | undefined;
    if (role.builtIn !== true && config.accepted) {
      routineShellPolicy = { enabled: true, projectRoot: req.projectRoot, authorizationSource: "customer-delegated-routine-checks" };
    }

    // ——— 三权（评审 §5.6）：能力按 `governanceFunction` 路由；single/su 旧行为逐字不变 ———
    //
    // 唯一数据来源＝门禁引擎注册表（经 `role.governanceFunction`/`builtIn` 表达，**不硬编码角色 id**）。
    // · legacyBuiltIn：single 模型下的内置治理角色（su）——保持旧能力集（派发/看护/安装）；
    // · schedule：trio 的 Convener——派发/看护/恢复提议；
    // · nomination：trio 的 Nominator——技能/MCP 安装；
    // · liaison：trio 的 Liaison——意图交接；proposal：Rapporteur——澄清 + 需求变更申请；
    // · verification：trio 的 Verifier——无附加能力。
    // **shell 不再按职能分档**（客户 2026-10-19 新规则）：全部内置治理角色统一审批档，见下方 `shellOperatorOnly`。
    const governanceModel: GovernanceModel = project.governanceModel ?? "single";
    const governanceFunction = role.governanceFunction;
    // T3（2026-11-10 两条固定工作流路径，B1 AC-12/AC-23）：会话级 workflow 模式（与 run-role 同口径：
    // 输入任务的真实 flowId ⇒ `workflowMode`；B6.1 起无任务的 trio 聊天按项目状态解析）。fixed 会话
    // **不注入** legacy 治理型 Git/流程能力（下方注入 gate）；single/su 与 legacy 会话的注入集合/顺序逐字不变。
    // 复用本函数前段的同一个解析结果（同一任务/项目事实；不引入项目级缓存）。
    const sessionWorkflowMode: WorkflowMode = governanceModel === "trio" ? requestedSessionMode : "legacy";
    const legacyOnlyCapabilitiesAllowed = sessionWorkflowMode !== "fixed";
    const legacyBuiltIn = role.builtIn === true && governanceFunction === undefined && governanceModel === "single";
    const canSchedule = governanceFunction === "schedule" || legacyBuiltIn;
    const canNominate = governanceFunction === "nomination" || legacyBuiltIn;

    // ——— 客户确认制交互（A-1/A-3/A-5）：**仅内置治理角色（su 或 trio 五人）**的会话注入客户交互通道 ———
    //
    // 判据 = 「本角色是内置治理角色」（`role.builtIn`，数据驱动、**不硬编码 "su"**）。注入 ⇒ 编排把本会话
    // 置为**确认制**（`request_confirmation`/`request_choice` 注册；gate 走「客户确认才发行 writeSet」）——
    // 「客户确定了才加、才落盘」。**普通角色的会话一律不注入**（无客户通道：工具不注册、gate 旧语义逐字
    // 不变）。通道未接（deps.customerInput 缺省）⇒ 不注入——**绝不**出现「没人问就放行」。
    // 2026-10-18 Lead 需求确认，2026-10-20 客户修正：Liaison（Lead / 主理）**需要** customerInput 发
    // `intent-confirm` 需求确认卡——**客户决策卡**；「替我决策」开关开启时判断 agent 可代批 `confirm`，
    // `revise` 仍交回客户。隔离由编排 `TRIO_CARD_KINDS.liaison = ["intent-confirm"]` 保证：
    // 其他治理卡在 Liaison 会话里**结构性拒绝**（不弹卡、declined），不占「一项目一卡」决定队列。
    // `intent-confirm` 不镜像（由 Lead 本人发）；single/su 旧行为不变。
    // trio 下客户作出决定后的 `customer.decision` 账本写入在编排的 `customerInput` 包装器内（评审 §5.7，
    // 桌面只接线、不另写一份）。
    const customerInput = role.builtIn === true ? this.deps.customerInput : undefined;

    // ——— 写盘确认的应用层兜底（客户 2026-10-25 新规则：「写自己角色权限内的路径，直接放行」）———
    // 预解析本会话的 Section 1 边界快照（含接受证据）：与 `openRoleSession` 内部的 `setupRole`
    // **同一解析源**（Service `resolveBoundary` → 门禁 `resolveBoundarySection`；入参是本会话同一份
    // `ProjectConfig`，`governanceBoundary` 的接受证据与开会话时一致）。customer-input 只在**呈现卡片/
    // 调用判断之前**用它对写盘确认做边界判定（`write-preauthorization.ts`；边界判定唯一来源仍是
    // 门禁 `resolveWrite`）。解析失败/非确认制会话 ⇒ 缺省 ⇒ 预授权不生效（保持既有卡片/判断路径；
    // fail-closed 方向不变——绝不「不知道边界就放行」）。
    let writeBoundary: BoundarySection1 | undefined;
    if (customerInput !== undefined) {
      try {
        writeBoundary = await resolveBoundary(req.roleId, project);
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId }).error(
          "write-preauthorization.boundary.unavailable",
          error,
        );
        writeBoundary = undefined;
      }
    }

    // C 批（2026-10-28）：**删除决定卡镜像面**——申请卡只在来源角色会话/客户通道呈现，
    // 幕僚只收 `request.notified` 系统通知（不呈现第二张卡、不代答、不代决）。
    const mirrorRoleIdFor = (_request: CustomerInputRequest): string | undefined => undefined;

    // 2026-10-29（方案 v2.1/Topology v4.1）：派发能力给幕僚（主链/验收调度）、运营（实现任务/验收核对）
    // 与 single/su；目标矩阵由 `routeDispatch` → `evaluateDispatchPreflight` 机械执行。
    const canDispatch = governanceFunction === "chief" || governanceFunction === "schedule" || legacyBuiltIn;
    const dispatchBinding: { handle?: RoleSessionHandle } = {};
    // W6（B1 AC-6）：团队计划登记的宿主 run 绑定——handle 在开会话成功处与 gitBinding/dispatchBinding 同源定格。
    const planBinding: { handle?: RoleSessionHandle } = {};
    const dispatchTask: DispatchTaskFn | undefined = canDispatch ? (d, metadata) => {
      const entry = this.sessions.get(key), origin = entry?.origins.running;
      const source = entry?.handle === dispatchBinding.handle && origin &&
        (!metadata || metadata.turnId === origin.turnId && (!metadata.roleId || metadata.roleId === req.roleId) &&
          (!metadata.runtime || metadata.runtime === req.runtime)) ? { entry, origin } : undefined;
      return this.routeDispatch(req.projectRoot, req.runtime, req.roleId, d, source);
    } : undefined;
    // 2026-10-26 `view_image`（全部角色）：工具读取的图片作为**下一轮用户提示的图片附件**排队给**同一角色**。
    // 目标在开会话时定格（不认 `activeRoleId`，也不接受调用方改投）；投递经既有 `send` → 同一投递机——
    // 工具本轮内角色必然 busy ⇒ 按到达序入队，settle 后投递；直发失败/会话不可用如实回执。
    // 后台系统提示（`background:true`+`kind:"system"`）：不冒充客户消息、不抢 pane；`images` 原引用。
    const viewImage: ViewImageFn = createViewImageDelivery({
      target: { projectRoot: req.projectRoot, roleId: req.roleId, runtime: req.runtime },
      send: (text, opts, target, metadata) => this.send(text, opts, target, metadata),
    });
    // 2026-10-26 需求变更申请（request_requirement_change）：**仅统筹（schedule）与报告员（proposal）**
    // 会话注入（2026-10-26 客户纠正：审批卡由这两个角色发起/持有；其他内置治理角色、项目角色与
    // single/su 不注入——能力缺席 = 工具不注册 = 最强 fail-closed）。编排再按治理职能收口；本层只把
    // 项目根/发起角色/引擎补入后透传。**提交申请 ≠ 批准**：审批由客户/判断 agent 在 decision 卡上完成，
    // 主理不审批、只在批准后执行意图变更。
    const canInitiateRequirementChange = governanceFunction === "proposal" || governanceFunction === "schedule";
    // 2026-10-31（run-change 触发）：应用自有的 run-change 卡可经统筹/提案/幕僚任一在场的客户卡通道呈现
    // （会话选择顺序 convener → rapporteur → chief）。这只扩大**应用内**的发卡呈现面，不新增模型工具：
    // `request_requirement_change` 仍只注入 proposal/schedule（上面 canInitiateRequirementChange 未变）。
    const canPresentAppRunChange = canInitiateRequirementChange || governanceFunction === "chief";
    // 2026-11-04 trunk-amendment-model D1：每项目版本变更/冻结/stable 栈（Interface 注入；缺省 ⇒
    // 不注入 `stablePermitOf`、不接 appointment-write 钩子——旧行为，能力缺席 = fail-closed）。
    const versionChangeStack = this.deps.getVersionChangeStack?.(req.projectRoot);
    const direct = governanceModel === "trio" ? createDirectRoleRuntime({ projectRoot: req.projectRoot, actorRoleId: req.roleId, notifyDirect: input => this.queueDirectNotification(req.projectRoot, input) }) : undefined;
    const closeCreatedTask: CloseCreatedTaskFn | undefined = direct !== undefined && (req.roleId === "chief" || req.roleId === "convener")
      ? async (input, signal) => {
          const result = await direct.closeCreatedTask(input, signal);
          if (result.ok) void this.drainAllQueuesFor(req.projectRoot);
          return result;
        } : undefined;
    // T3 B3（AC-18/AC-20）：fixed 会话的 close_created_task v2 应用实现（身份由 run-role 绑定；
    // 证据由应用补入；legacy 会话不注入本键——run-role 只在 fixed 会话消费）。
    const closeCreatedTaskFixed: FixedCloseCreatedTaskFn | undefined =
      sessionWorkflowMode === "fixed" && direct !== undefined && (req.roleId === "chief" || req.roleId === "convener")
        ? async (input, signal) => this.closeCreatedTaskFixedForSession(req.projectRoot, req.roleId, input, signal)
        : undefined;

    // Batch 3.5（C1d/S5）：三提交能力的桌面实现——**只提交**，不批准/不发卡/不签发许可。
    // 角色门控：product/rapporteur → submitVersionChange；convener → submitRefactor + requestStableWrite；
    // 其他角色不注入（run-role 仍二次门控；工具不存在 = fail-closed）。身份以 req.roleId 强制，
    // 不信任模型/tool 载荷自报。
    const submitVersionChangeCapability: SubmitVersionChangeFn | undefined =
      versionChangeStack !== undefined && (req.roleId === "product" || req.roleId === "rapporteur")
        ? async (input, signal) => {
            try {
              return await versionChangeStack.submitVersionChange(
                { ...input, initiatorRoleId: req.roleId as "product" | "rapporteur" },
                signal,
              );
            } catch (error) {
              return {
                ok: false,
                errorCode: "vca-invalid",
                message: error instanceof Error ? error.message : String(error),
              };
            }
          }
        : undefined;
    const submitRefactorCapability: SubmitRefactorFn | undefined =
      versionChangeStack !== undefined && req.roleId === "convener"
        ? async (input, signal) => {
            try {
              return await versionChangeStack.submitRefactor({ ...input, roleId: req.roleId }, signal);
            } catch (error) {
              return {
                ok: false,
                errorCode: "refactor-invalid",
                message: error instanceof Error ? error.message : String(error),
              };
            }
          }
        : undefined;
    // 2026-11-05：方案升级报告（仅 convener；应用发行客户主权卡；不派发/不改需求或验收标准）。
    const reportPlanEscalationCapability: PlanEscalationFn | undefined =
      req.roleId === "convener"
        ? async (input, signal) => {
            try {
              return await this.reportPlanEscalation(req.projectRoot, { ...input, roleId: req.roleId }, signal);
            } catch (error) {
              return {
                ok: false,
                errorCode: "plan-escalation-invalid" as const,
                message: error instanceof Error ? error.message : String(error),
              };
            }
          }
        : undefined;
    const requestStableWriteCapability: RequestStableWriteFn | undefined =
      versionChangeStack !== undefined && req.roleId === "convener"
        ? async (input, signal) => {
            try {
              return await versionChangeStack.requestStableWrite({ ...input, roleId: req.roleId }, signal);
            } catch (error) {
              return {
                ok: false,
                errorCode: "stable-write-write-failed",
                message: error instanceof Error ? error.message : String(error),
              };
            }
          }
        : undefined;
    const requestRequirementChange: RequestRequirementChangeFn | undefined =
      canInitiateRequirementChange && this.deps.requestRequirementChange !== undefined
        ? (input: RequestRequirementChangeInput) =>
            this.deps.requestRequirementChange!(req.projectRoot, req.roleId, req.runtime, input)
        : undefined;
    // G-2/W1（同处注入）：`role_status` / `session_tail` 两只读工具的桌面侧数据源。
    // B 批（2026-10-28）：chief 获得 role_status/session_tail（星形主链）与 role_activity_log。
    // D 批：运营不再有 role_status/session_tail；single/su 旧行为保留。
    const canObserve = legacyBuiltIn || governanceFunction === "chief";
    const roleStatus: RoleStatusFn | undefined =
      canObserve ? (query: RoleStatusPayload) => this.roleStatusText(req.projectRoot, query) : undefined;
    const contractCheck: ContractCheckFn | undefined =
      // B7.1：契约速查按**本会话**的 workflow 模式分流（fixed 视图不含 legacy run/pin 口径；
      // legacy/single 模式参数缺省路径逐字不变）。
      (input: ContractCheckInput) => this.contractCheckText(req.projectRoot, req.roleId, input, sessionWorkflowMode);
    // 2026-11-09（文档格式权威说明，方案 P1.2 §3.1/§4.1；B1 AC-9/AC-10）：`doc_format` 只读数据源——
    // **所有角色会话**（6 个内置治理角色 + 项目角色）与 `contractCheck` 同位无条件注入（项目角色走同一条
    // `openRoleSession` 路径，不依赖技能安装/动态 id 登记）。数据源 `docFormatText` 第一条语句静态早退到
    // 注册表（纯文本、零磁盘 IO、不读 run/项目/角色事实、不含角色差异）；`{ok,message}` 信封与 8 KiB
    // 防御性截断由运行时核心工具包装层统一生成（S1，与 `contract_check` 同型）。judge 会话（「替我审」/
    // 「替我决策」）与有界 Chief 决策会话**不经过**本输入对象（见各自独立构造），工具集逐字不变。
    const docFormat: DocFormatFn =
      (input: DocFormatInput) => this.docFormatText(req.projectRoot, req.roleId, input);
    const evidenceCheck: EvidenceCheckFn | undefined =
      (input: EvidenceCheckInput) => this.evidenceCheckText(req.projectRoot, req.roleId, input);
    const sessionTail: SessionTailFn | undefined =
      canObserve ? (query: SessionTailPayload) => this.sessionTailText(req.projectRoot, query) : undefined;
    const roleActivityLog: RoleActivityLogFn | undefined =
      governanceFunction === "chief"
        ? (query: RoleActivityLogPayload) => this.roleActivityLogText(req.projectRoot, query)
        : undefined;
    // B 批：终止/安全重派动作（只给幕僚）。工具层只转达载荷/回执；校验/执行/安全分类在本层。
    const terminateRoleRun: TerminateRoleRunFn | undefined =
      governanceFunction === "chief"
        ? async (payload) => {
            const runtime = this.findLiveRuntime(req.projectRoot, payload.roleId) ?? req.runtime;
            const caller = this.sessions.get(this.sessionKey(req.projectRoot, req.roleId, req.runtime));
            const callerOrigin = caller?.origins.running;
            return this.terminateRoleRun({
              projectRoot: req.projectRoot,
              roleId: payload.roleId,
              runtime,
              ...(payload.taskId !== undefined ? { taskId: payload.taskId } : {}),
            }, caller && caller.handle === handle && callerOrigin ? { entry: caller, origin: callerOrigin } : undefined);
          }
        : undefined;
    const redispatchTaskCapability: RedispatchTaskFn | undefined =
      governanceFunction === "chief"
        ? async (payload) => this.redispatchTask({
            projectRoot: req.projectRoot,
            taskId: payload.taskId,
            ...(payload.to !== undefined ? { to: payload.to } : {}),
          })
        : undefined;
    // 2026-11-02（全局任务状态/版本决策）：project_state 给全部内置治理角色（含旧 su）只读；
    // project_note / request_version_decision 只给 trio chief。未注入 ⇒ 工具不注册（fail-closed）。
    const projectStateCapability: ProjectStateFn | undefined =
      role.builtIn === true
        ? (query) => this.projectStateTool(req.projectRoot, req.roleId, query)
        : undefined;
    const projectNoteCapability: ProjectNoteFn | undefined =
      governanceFunction === "chief"
        ? (noteInput) => this.projectNote({ projectRoot: req.projectRoot, roleId: req.roleId, input: noteInput })
        : undefined;
    const requestVersionDecisionCapability: RequestVersionDecisionFn | undefined =
      governanceFunction === "chief"
        ? (versionInput, signal) => this.requestVersionDecision({
            projectRoot: req.projectRoot,
            roleId: req.roleId,
            runtime: req.runtime,
            request: versionInput,
            ...(signal !== undefined ? { signal } : {}),
          })
        : undefined;
    // G-4/I3（2026-10-16 客户批准；同 H-1/G-2 先例）：**技能安装/卸载能力**——评审 §5.6：仅
    // `governanceFunction === "nomination"`（Nominator）；single/su 保留旧行为。「未注入即不注册」=
    // 最强 fail-closed（项目角色零感知）。工具 handler 只把 `{roleId,name}` 载荷交进来；
    // 护栏/校验/激活/回执/系统行全在本层（`applySkillChange`）。
    const installationBinding: { handle?: RoleSessionHandle } = {};
    const scopedInstallation = (toolName: InstallationCapabilityTool): InstallSkillFn => {
      const bindingId = randomUUID();
      return async (payload, metadata) => {
        const boundHandle = installationBinding.handle;
        const entry = this.sessions.get(key);
        const origin = boundHandle && entry?.handle === boundHandle ? entry.origins.running : undefined;
        const stillCurrent = () => !!entry && !!origin && entry.handle === boundHandle && this.sessions.get(key) === entry &&
          entry.busy && entry.origins.running === origin && !origin.settled &&
          !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted &&
          (!metadata || metadata.turnId === origin.turnId && (!metadata.roleId || metadata.roleId === req.roleId) &&
            (!metadata.runtime || metadata.runtime === req.runtime));
        const stillUnmanaged = async () => {
          if (!stillCurrent()) return false;
          try {
            const scope = await readRoleCapabilityProtectionScope({ projectRoot: req.projectRoot });
            return scope.state === "unmanaged" && stillCurrent();
          } catch { return false; }
        };
        const refuse = () => this.refuseUnprovenInstallation(bindingId, toolName, req.projectRoot, req.roleId,
          req.runtime, boundHandle, metadata);
        if (!(await stillUnmanaged())) return refuse();
        const action = toolName === "uninstall_skill" || toolName === "uninstall_mcp" ? "uninstalled" : "installed";
        const result = toolName === "install_skill" || toolName === "uninstall_skill"
          ? await this.applySkillChange(action, req.projectRoot, req.runtime, req.roleId, payload, stillUnmanaged)
          : await this.applyMcpChange(action, req.projectRoot, req.runtime, req.roleId, payload, stillUnmanaged);
        return !result.ok && result.reason === "effect-scope-unproven" ? refuse() : result;
      };
    };
    // Fresh scope is only a compatibility selector; protected/unknown effects use Core's identity-bound gate.
    // Ordinary desktop observations never substitute for that authoritative callback binding.
    const installSkill: InstallSkillFn | undefined = canNominate ? scopedInstallation("install_skill") : undefined;
    const uninstallSkill: UninstallSkillFn | undefined = canNominate ? scopedInstallation("uninstall_skill") : undefined;
    // G-4 V2（2026-10-16 客户批准；同处注入）：**外来 MCP 安装/卸载能力**——与技能两工具**逐字同构**
    // （仅 nomination；「未注入即不注册」）；护栏/校验（声明）/激活/回执/系统行全在本层（`applyMcpChange`）。
    const installMcp: InstallMcpFn | undefined = canNominate ? scopedInstallation("install_mcp") : undefined;
    const uninstallMcp: UninstallMcpFn | undefined = canNominate ? scopedInstallation("uninstall_mcp") : undefined;

    // (a) 操作者确认通道（I-1 arm）：项目角色 → 编排装配 (c)/(b)/(a) 三层链；
    // **全部内置治理角色**（`role.builtIn === true`）→ 经下方 `shellOperatorOnly` 装配**审批档**。
    // 通道**每会话闭包绑定** roleId/projectRoot/runtime 与本轮 signal（裁决与卡片都按该会话归档）。
    const interactionState = { lifetime: new AbortController(), turn: new AbortController() };
    let shellOperatorChannel: OperatorChannelFn | undefined;
    if (this.deps.shellOperatorChannel) {
      const channel = this.deps.shellOperatorChannel;
      // **「替我审」metadata（PM 评审 §5.2/§6.5）**：`turnText` 与 `judge` 在**调用当刻**从活会话条目读取
      // （开关开/关由通道的 `isEnabled` 决定；这里只提供事实）。会话已销毁 ⇒ 两者皆缺省，通道回原 present。
      shellOperatorChannel = (prompt) => {
        const live = this.sessions.get(key);
        return channel(prompt, {
          roleId: req.roleId,
          projectRoot: req.projectRoot,
          runtime: req.runtime,
          signal: interactionState.turn.signal,
          ...(live?.lastUserText !== undefined ? { turnText: live.lastUserText } : {}),
          ...(live?.shellJudge !== undefined ? { judge: live.shellJudge } : {}),
        });
      };
    }

    // I-1 补丁（2026-10-12，客户重发授权）：**(c) 规则集实件**（`classifyShell` + `rules`）——仅**项目角色**
    // 走三层链（内置治理角色不自审）。缺省 ⇒ 编排对「规则集未注入」一律拒绝（fail-closed，绝不放宽）。
    const shellArming = role.builtIn === true ? undefined : this.deps.shellArming;

    // 2026-10-31（shell 判拒升级方案 v1.3 §4.6/§6.4）：**升级卡呈现端**——应用级 presenter（每窗口一个）+
    // **每会话信号包装**：并入会话生命周期（dispose/重建）与当前轮（stop/abort）中止信号，
    // 会话终止/重建/轮次中止时挂起升级卡即时失效（默认拒绝，fail-closed；方案 §9 不变量 1/AC-06）。
    // 缺省 ⇒ 不传 ⇒ 编排不创建 registry、升级工具不注册（能力缺席 = fail-closed）。
    const escalationPresenter = this.deps.shellEscalationPresenter;
    const shellEscalationPresenter: ShellEscalationPresentFn | undefined =
      escalationPresenter === undefined
        ? undefined
        : (request: ShellEscalationCardRequest, signal?: AbortSignal) => {
            const parts: AbortSignal[] = [interactionState.lifetime.signal, interactionState.turn.signal];
            if (signal !== undefined) parts.push(signal);
            return escalationPresenter(request, AbortSignal.any(parts));
          };

    // **内置治理角色审批档（客户裁定 2026-10-17；2026-10-19 新规则「所有角色都有 shell 权限，包括读写，
    // 以及任何需要命令的权限，只不过都要提交审批」扩至全部内置治理角色）**：**全部 `role.builtIn === true`
    // 的会话**（single 的 su 与 trio 五人）把 **(c) 实件 + (a) 通道**（均与项目角色同一份 deps 引用——单一
    // 来源、永不漂移）经 `shellOperatorOnly` 交给编排装配审批档：
    //   · (c)=allow（只读白名单）⇒ 直接放行、**0 卡**；
    //   · `risky`/`review`/`deny` ⇒ 客户/判断 agent 逐条审批（deny 也可被批准）；拒绝/超时/不可用 = 拒绝。
    // **缺件（deps.shellArming 或 deps.shellOperatorChannel 缺省）⇒ 不传 ⇒ 不 arm**（能力缺席 = fail-closed）。
    // 内置治理角色**绝不**同时注入旧只读档（`shellReadonly`）——编排对两档并存互斥拒绝；只读档桌面不再注入。
    const shellOperatorOnly =
      role.builtIn === true && this.deps.shellArming && shellOperatorChannel
        ? {
            classifyShell: this.deps.shellArming.classifyShell,
            rules: this.deps.shellArming.rules,
            operatorChannel: shellOperatorChannel,
          }
        : undefined;

    // pi 路径把 arm 接缝（shellGate，缺省 undefined = 不 arm）透传给编排的真实适配器工厂
    // （`createPiAdapterFactory(project, shellGate?)` 是编排已冻结的签名，此处不发明新形状）。
    // undefined ⇒ Pi 适配器不注册 run_shell（§7.5.1）。demo 路径无 shell 入口，与本接缝无关。
    let createAdapter: RuntimeAdapterFactory;
    let profileRevision = this.profileRevision(req.runtime);
    try {
      await this.deps.prepareRuntimeProfile?.(req.runtime);
      profileRevision = this.profileRevision(req.runtime);
      // 2026-11-04 trunk-amendment-model D1：stable 写入的 **post-write 复核钩子**（F16）。
      // write/edit 成功后由运行时核心调用（同一 `versionedDocAfterWrite` 接缝，先保留既有 R9 登记语义）：
      // · 版本登记返回 false ⇒ 维持原回退语义；
      // · stable 路径且存在候选许可 ⇒ `completeWrite(actualSha)` 复核/消费/mini re-pin（桌面不写盘）。
      const baseAfterWrite = this.deps.runtimeOptions?.versionedDocAfterWrite;
      const stableAfterWrite =
        versionChangeStack === undefined
          ? undefined
          : async (absPath: string): Promise<boolean | void> => {
              if (baseAfterWrite !== undefined) {
                const registered = await baseAfterWrite(absPath);
                if (registered === false) return false;
              } else {
                const registered = await registerVersionedDocumentAfterWrite({
                  projectRoot: req.projectRoot,
                  absPath,
                  recordedBy: "app:session",
                });
                if (registered === false) return false;
              }
              await this.afterStableWrite(versionChangeStack, req.projectRoot, req.roleId, req.runtime, absPath);
              return true;
            };
      const sessionRuntimeOptions =
        stableAfterWrite === undefined
          ? this.deps.runtimeOptions
          : { ...this.deps.runtimeOptions, versionedDocAfterWrite: stableAfterWrite };
      if (this.deps.createRuntimeAdapterFactory) {
        createAdapter = this.deps.createRuntimeAdapterFactory(project, req.runtime, { ...sessionRuntimeOptions, shellGate: this.deps.shellGate });
      } else if (req.runtime === "pi") {
        createAdapter = this.deps.createPiAdapterFactory(project, this.deps.shellGate);
      } else if (req.runtime === "demo") {
        createAdapter = (gate) => this.deps.createDemoAdapter({ gate, boundary });
      } else {
        createAdapter = createRuntimeAdapterFactory(project, req.runtime, sessionRuntimeOptions);
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    // **「替我审」每会话判断闭包（PM 评审 §5.1/§6.3）**：用**同一份** `runtimeOptions` 与上面已构造的
    // `createAdapter` 工厂交给编排 `createShellJudge`（判断跟随请求会话引擎，不跨引擎）。构造失败 ⇒ 不注入
    // （能力缺席，通道回原 present——fail-closed，绝不擅自放行）。闭包随会话条目销毁一并清除。
    let shellJudge: ShellJudgeFn | undefined;
    if (this.deps.createShellJudge !== undefined) {
      try {
        shellJudge = this.deps.createShellJudge({
          project,
          runtime: req.runtime,
          runtimeOptions: this.deps.runtimeOptions,
          createAdapter,
        });
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId }).error("shell-judge.driver.failed", error);
        shellJudge = undefined;
      }
    }
    // **「替我审批/决策」每会话判断闭包（2026-10-18 双开关评审 §8.2）**：只在 trio 且本会话确实接入
    // 客户交互通道时构造（single/su 与 Liaison 不注入——不判断、不产生模型调用）。用**同一份**
    // `runtimeOptions` 与 `createAdapter`（判断跟随请求会话引擎，不跨引擎）。构造失败 ⇒ 不注入
    // （能力缺席，通道回落原卡——fail-closed）。闭包随会话条目销毁一并清除。
    // 2026-11-04（download-requests W-2）：下载能力可用的**项目角色**也要构造 judge 闭包（下载卡可到
    // 判断器），但**不改变** `customerInput` 注入判据——项目角色仍无 request_confirmation/request_choice。
    const takeDownloadDirective = this.deps.getDownloadDirectiveConsumer?.(req.projectRoot);
    const downloadCapable =
      this.deps.createDownloadRuntime !== undefined &&
      this.deps.downloadAppVersion !== undefined &&
      this.deps.customerInput !== undefined &&
      takeDownloadDirective !== undefined;
    let governanceJudge: GovernanceJudgeFn | undefined;
    if (governanceModel === "trio" && (customerInput !== undefined || downloadCapable) && this.deps.createGovernanceJudge !== undefined) {
      try {
        governanceJudge = this.deps.createGovernanceJudge({
          project,
          runtime: req.runtime,
          runtimeOptions: this.deps.runtimeOptions,
          createAdapter,
        });
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId }).error("governance-judge.driver.failed", error);
        governanceJudge = undefined;
      }
    }
    const chiefDecision: ChiefDecisionHost | undefined = governanceModel !== "trio" ? undefined : {
      prepare: async (request, metadata) => {
        if (this.deps.prepareChiefDecisionEvidence === undefined) throw new Error("幕僚决策材料准备能力不可用；保留请求等待接管");
        return this.deps.prepareChiefDecisionEvidence({ projectRoot: req.projectRoot, originRoleId: req.roleId, request, metadata });
      },
      execute: async (context, evidence, decidePendingRequest, signal) => {
        if (signal.aborted || interactionState.lifetime.signal.aborted) throw new Error("幕僚委托已撤销");
        // Independent handle, same trusted project/runtime adapter. Never enters the busy chief's queue.
        const boundedSignal = AbortSignal.any([signal, interactionState.lifetime.signal, AbortSignal.timeout(context.limits.timeoutMs)]);
        let handle: RoleSessionHandle | undefined;
        const stop = () => { void handle?.abort?.().catch(() => undefined); };
        let cancelled: (() => void) | undefined;
        const aborted = new Promise<never>((_, reject) => {
          cancelled = () => { stop(); reject(new Error("幕僚独立决策已取消或达到预算")); };
          boundedSignal.addEventListener("abort", cancelled, { once: true });
          if (boundedSignal.aborted) cancelled();
        });
        const opening = this.openObservedRoleSession({ roleId: "chief", project, runtime: req.runtime,
          chiefDecisionContext: context, decidePendingRequest }, { createAdapter });
        void opening.then(late => { if (boundedSignal.aborted && handle !== late) void this.disposeObservedHandle(late).catch(() => undefined); }, () => undefined);
        try {
          handle = await Promise.race([opening, aborted]);
          if (boundedSignal.aborted) throw new Error("幕僚委托已撤销");
          const consume = (async () => { for await (const _event of handle!.events()) { /* isolated decision stream */ } })();
          void consume.catch(() => undefined);
          await Promise.race([handle.send(JSON.stringify({ request: context.request, evidence })), aborted]);
        } finally {
          if (cancelled !== undefined) boundedSignal.removeEventListener("abort", cancelled);
          if (handle !== undefined) await this.disposeObservedHandle(handle);
        }
      },
    };
    // 客户卡通道路由上下文（客户交互通道与需求变更审批卡**共用同一份**构造）：judge 闭包与 turnText
    // 在调用当刻从活会话条目读取（会话已销毁 ⇒ 缺省，通道不判断）；`metadata` 由调用方原样透传。
    const buildCustomerInputContext = (
      request: CustomerInputRequest,
      extras?: { onPresented?: () => void; acceptanceReport?: AcceptanceReportDisplayV1; judgeNotice?: string },
    ): Parameters<DesktopCustomerInputFn>[1] => {
      const mirrorRoleId = mirrorRoleIdFor(request);
      const live = this.sessions.get(key);
      const judge = live?.governanceJudge ?? governanceJudge;
      const turnText = live?.lastUserText;
      return {
        roleId: req.roleId,
        runtime: req.runtime,
        projectRoot: req.projectRoot,
        sessionSignal: interactionState.lifetime.signal,
        governanceModel,
        ...(mirrorRoleId !== undefined ? { mirrorRoleId } : {}),
        ...(judge !== undefined ? { governanceJudge: judge } : {}),
        ...(chiefDecision !== undefined ? { chiefDecision } : {}),
        ...(typeof turnText === "string" && turnText !== "" ? { turnText } : {}),
        // 写盘确认的应用层兜底（2026-10-25 客户新规则）：本会话的 Section 1 快照 +
        // resolveWrite 的 skill 根（同一份 ProjectConfig）。缺省 ⇒ 通道不做预授权判定。
        ...(writeBoundary !== undefined ? { writeBoundary, skillRoot: project.skillRoot } : {}),
        ...(extras?.onPresented !== undefined ? { onPresented: extras.onPresented } : {}),
        ...(extras?.acceptanceReport !== undefined ? { acceptanceReport: extras.acceptanceReport } : {}),
        ...(extras?.judgeNotice !== undefined ? { judgeNotice: extras.judgeNotice } : {}),
      };
    };
    // 2026-11-04 下载申请（download-requests C1/F2）：每会话一份 B1 运行时；presenter 复用窗口级
    // 原始客户通道 + `withRequestLifecycle`（request.* 只在卡片路径），`downloadId` 由 B1 生成。
    let downloadRuntime: DownloadRequestRuntime | undefined;
    let requestDownload: RequestDownloadFn | undefined;
    if (downloadCapable && this.deps.customerInput !== undefined && takeDownloadDirective !== undefined) {
      const windowCustomerInput = this.deps.customerInput;
      const manager = this;
      const presenter: DownloadApprovalPresenter = {
        async present(downloadRequest: DownloadApprovalRequest, hooks): Promise<DownloadApprovalOutcome> {
          const card = buildDownloadCardRequest(downloadRequest);
          const requestId = manager.requestIdFor(req.projectRoot, req.roleId, card.request, card.metadata);
          let presentedNotified = false;
          const notifyPresented = (): void => {
            if (presentedNotified) return;
            presentedNotified = true;
            try {
              hooks.onPresented({ requestId });
            } catch (error) {
              createDiagnosticLogger({ component: "desktop.download", projectRoot: req.projectRoot, roleId: req.roleId }).error(
                "download.presented-callback.failed",
                error,
              );
            }
          };
          const signals: AbortSignal[] = [];
          if (downloadRequest.signal !== undefined) signals.push(downloadRequest.signal);
          signals.push(interactionState.lifetime.signal);
          const signal = AbortSignal.any(signals);
          let outcome: CustomerInputOutcome | null | undefined;
          try {
            outcome = await manager.withRequestLifecycle(
              req.projectRoot,
              req.roleId,
              card.request,
              card.metadata,
              (request, context, metadata) => windowCustomerInput(request, context, metadata),
              (request, extras) => buildCustomerInputContext(request, extras),
              requestId,
              {
                signal,
                ...(card.judgeNotice !== undefined ? { judgeNotice: card.judgeNotice } : {}),
                onPresented: notifyPresented,
              },
            );
          } catch (error) {
            createDiagnosticLogger({ component: "desktop.download", projectRoot: req.projectRoot, roleId: req.roleId }).error(
              "download.card.failed",
              error,
            );
            return { decision: "unavailable", reason: "download-card-failed" };
          }
          return toDownloadApprovalOutcome(outcome);
        },
      };
      try {
        downloadRuntime = this.deps.createDownloadRuntime!({
          projectRoot: req.projectRoot,
          roleId: req.roleId,
          runtime: req.runtime,
          appVersion: this.deps.downloadAppVersion!,
          present: presenter,
          takeDownloadDirective,
        });
        requestDownload = createRequestDownloadCapability({
          runtime: downloadRuntime,
          runtimeKind: req.runtime,
          roleId: req.roleId,
          lifetimeSignal: interactionState.lifetime.signal,
          emitNotice: (summary) => this.emitDeliveryNote(req.projectRoot, req.runtime, req.roleId, req.roleId, summary),
        });
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId }).error(
          "download.runtime.failed",
          error,
        );
        downloadRuntime = undefined;
        requestDownload = undefined;
      }
    }
    let handle: RoleSessionHandle;
    try {
      // scope 传 undefined：聊天无预先任务，授权上界 = 角色边界本身（门禁引擎据此不做 F4 收窄）。
      //
      // **会话路径裁决（T30）：沿用 `openRoleSession` + `scope: undefined`，不改走 `openGovernanceSession`。**
      // 理由（§12.2）：创世的门口放在**边界选择层**（`genesisBootstrap`，由 `buildProjectConfig` 按
      // `hasRoles` 设），`scope` 保持 `undefined`（普通聊天）——本层只把「未 bootstrap」这一授权事实经
      // `genesisBootstrap` 交给门禁引擎。`openRoleSession` 本就是 `openGovernanceSession` 内部**同样经其
      // 开启会话**的**同一底层会话入口**（`govern-session.ts:170`），**不是第二套会话机制**。
      //
      // 更正（2026-10-12）：原 T30 理由已过时——「对空项目产出 `writeSet: []`、F4 精确匹配拒一切写，
      // 要让它表达 `scope: undefined` 须改它本身；且开会话前先经 `writeGovernanceSkeleton` 落骨架
      // （属 T32 待退役面）」**已全部失效**：预建骨架随 T32 退役（模块 `src/common/编排/bootstrap.ts`
      // 已删），引擎现于 `conditions`/`writeSet` 均空时把 scope 收窄为 `undefined`（权威表述见
      // `src/pipeline/orchestration/govern-session.ts` 的 `effectiveScope` 处，本层不复制）。
      // 桌面是否统一改走该入口：另行评估（更正记录见
      // `角色卡/桌面应用/docs/change/2026-10-12_change_session-comment-refresh.md`）。
      if (stopped()) return stoppedResult();
      handle = await this.openObservedRoleSession(
        {
          roleId: req.roleId,
          ...(req.taskId ? { taskId: req.taskId } : {}),
          runtime: req.runtime,
          project,
          // T3（2026-11-10 两条固定工作流路径，B1 AC-12）：run-role 在每次卡/任务/写门禁按实际 flowId
          // 现场解析模式（回调不缓存项目级单值；fixed 会话的模块 context/工具注入由 run-role 同源执行）。
          // single/su 会话不注入（旧行为逐字不变；固定路径为 trio 产品流程）。
          ...(governanceModel === "trio" ? { workflowModeForFlow: workflowModeForFlowResolver(req.projectRoot) } : {}),
          // T3 B6.1（2026-11-11）：fixed 会话另传**会话级常量**（run-role 的 `workflowMode` 优先级最高）——
          // 无 taskId 的 fixed 聊天（空项目首条客户消息）也能注入 fixed 模块 context/`chief-workflow-v2.md`/
          // fixed 工具面（RR 根因修复）。legacy/single 不传本键：per-flow `workflowModeForFlow` 现场解析与
          // 旧注入面逐字不变（常量 legacy 会吞掉混合项目的 per-flow 判定，故不做无条件传入）。
          ...(sessionWorkflowMode === "fixed" ? { workflowMode: sessionWorkflowMode } : {}),
          // T3 B4.2（2026-11-10，AC-21/T-09）：fixed 会话注入任务级 Git 写（分类器 + 真实端口）。
          // 仅「trio 项目 + 该任务真实 flow 解析为 fixed + 带真实 taskId」时注入；legacy/single 会话
          // 不传本字段（注入面/行为逐字不变）。桌面只给「实现」——**不传 scope/taskId 事实**：scope 由
          // 编排从 task.created + basis/`change.scope-decided` 解析（桌面不采信模型自报），不可解析 ⇒
          // 编排不注入 scope ⇒ `git add`/`git commit` 一律拒（fail-closed）。端口 `acquireCriticalSection`
          // 与 B3 发布合并共用同一把项目级锁（`acquireProjectGitCriticalSection` 同一实现）。
          ...(sessionWorkflowMode === "fixed" && req.taskId !== undefined
            ? { taskGit: { classifyShellDetailed, port: createDesktopTaskGitShellPort(req.projectRoot) } }
            : {}),
          ...(routineShellPolicy ? { routineShellPolicy } : {}),
          // 客户交互通道（A-5）：仅内置治理角色（su / trio 三人）会话注入；Liaison 不注入（§4.3）。
          // **每会话闭包绑定 roleId**（请求本体不带角色标识——渲染侧据它把交互卡落到该角色的聊天流、
          // 点亮 B-3「等待你确认」）。**镜像面**（§6.1）：trio 治理决定卡额外带 `mirrorRoleId=主入口`，
          // 同一请求 id、同一份 pending、只答一次——不是第二个请求。普通角色逐字不传。
          ...(customerInput
            ? {
                customerInput: async (r: CustomerInputRequest, metadata?: CustomerInputMetadata) => {
                  // AC-13（D2）：stable boundary 确认卡——用 S7 API 检测 preview 正文扩大；
                  // 扩大 ⇒ 卡面横幅 + required acknowledgments；不可解析 ⇒ 不呈现、结构化拒绝。
                  let effectiveRequest = r;
                  if (versionChangeStack !== undefined && r.cardKind === "appointment-write") {
                    const enriched = await this.enrichAppointmentWriteBoundaryCard(
                      versionChangeStack,
                      req.projectRoot,
                      r,
                    );
                    if (enriched.kind === "reject") {
                      void this.appendRoleActivity(req.projectRoot, req.roleId, {
                        kind: "request.rejected",
                        summary: shortenSummary(enriched.reason, 200),
                        status: "not-presented",
                      });
                      this.emitDeliveryNote(req.projectRoot, req.runtime, req.roleId, req.roleId, enriched.reason);
                      return { outcome: "declined", notPresented: true, reason: enriched.reason };
                    }
                    effectiveRequest = enriched.request;
                  }
                  const outcome = await this.withRequestLifecycle(
                    req.projectRoot,
                    req.roleId,
                    effectiveRequest,
                    metadata,
                    (request, context, meta) => customerInput(request, context, meta),
                    (request, extras) => buildCustomerInputContext(request, extras),
                  );
                  // 2026-11-04 trunk-amendment-model D1 / F16 + D2/AC-13：appointment-write 确认后
                  // **只签发** role-card/boundary 的一次性 stable 许可（正文取自确认卡 preview 的逐路径正文）；
                  // 真实写入仍由角色 write_file/edit_file 经 run-role gate 执行——桌面无直接写盘路径。
                  // 扩大检测要求的 acknowledgments 未齐 ⇒ 不签发任何许可（fail-closed）。
                  if (versionChangeStack !== undefined && r.cardKind === "appointment-write") {
                    await this.afterAppointmentWriteApproved(
                      versionChangeStack,
                      req.projectRoot,
                      req.roleId,
                      req.runtime,
                      effectiveRequest,
                      outcome,
                    );
                  }
                  return outcome;
                },
              }
            : {}),
          // 2026-11-04 trunk-amendment-model D1：run-role gate 的同步候选许可（C2b 快照仍为判定权威）。
          // T3 B1（AC-23）：fixed 会话不注入 stable 许可（stable-write 机制 compat-only，默认路径不触达）。
          ...(versionChangeStack !== undefined && legacyOnlyCapabilitiesAllowed
            ? { stablePermitOf: (rel: string) => versionChangeStack.stablePermitOf(rel) }
            : {}),
          // Batch 3.5（C1d/S5）：三提交能力（角色门控在本层；run-role 二次门控；只提交不批准）。
          // T3 B1（AC-23）：fixed 会话不注入 legacy Git 治理三段式能力（注入面 = 最强 fail-closed）。
          ...(legacyOnlyCapabilitiesAllowed
            ? {
                gitQuery: async (input, signal) => { const current = await currentGitRuntime(); return current.ok ? current.runtime.gitQuery(input, signal) : gitContextFailure(input.operationId, current); },
                gitCandidate: async (input, signal) => { const current = await currentGitRuntime(); return current.ok ? current.runtime.gitCandidate(input, signal) : gitContextFailure(input.operationId, current); },
                gitPublish: async (input, signal) => { const current = await currentGitRuntime(); return current.ok ? current.runtime.gitPublish(input, signal) : gitContextFailure(input.operationId, current); },
              }
            : {}),
          ...(legacyOnlyCapabilitiesAllowed && direct !== undefined && req.roleId === "rapporteur" ? { selectRunChange: (input, signal) => input.mode === "continue-frozen"
            ? direct.selectRunChange(input, signal) : this.selectRunChangeForHandle(req.projectRoot, req.runtime, gitBinding.handle, input, signal) } : {}),
          // T3 B3（AC-15/AC-16）：fixed 会话的 `complete_team_plan` v4 走应用服务
          // （completeTeamPlanFixed + 真实 BaselineGitPort；git init/.gitignore/任务分支/dirty/basis）；
          // legacy 会话逐字保留 direct 实现（runId 绑定不变）。
          // B29（2026-11-11）：fixed 注入实现返回 **fixed 服务形状**（工具层按入参 workflowId+plan 分流到
          // B25 `fixedCompleteTeamPlanReceiptResult`）；注入位类型仍是 legacy `CompleteTeamPlanFn`（共享
          // 同一能力位），运行时形状由工具层校验——故此处显式断言，legacy 分支零改动。
          ...(direct !== undefined && req.roleId === "convener" ? {
            completeTeamPlan: sessionWorkflowMode === "fixed"
              ? ((input: Parameters<CompleteTeamPlanFn>[0], planSignal?: AbortSignal) =>
                  this.completeTeamPlanFixedForHandle(req.projectRoot, req.runtime, planBinding.handle, input, planSignal)) as unknown as CompleteTeamPlanFn
              : (input, signal) => this.completeTeamPlanForHandle(req.projectRoot, req.runtime, planBinding.handle, input, direct, signal),
          } : {}),
          ...(direct !== undefined && req.roleId === "nominator" ? { activateRoleDocuments: direct.activateRoleDocuments } : {}),
          ...(closeCreatedTask !== undefined ? { closeCreatedTask } : {}),
          // T3 B3（AC-18/AC-20）：fixed 会话的 `close_created_task` v2 应用实现（补 artifacts/branchTipOid/
          // acceptanceArchive 证据；A12b accepted 时应用生成 `docs/acceptance/*`）；legacy 不注入本键。
          ...(closeCreatedTaskFixed !== undefined ? { closeCreatedTaskFixed } : {}),
          ...(legacyOnlyCapabilitiesAllowed && submitVersionChangeCapability ? { submitVersionChange: submitVersionChangeCapability } : {}),
          ...(legacyOnlyCapabilitiesAllowed && submitRefactorCapability ? { submitRefactor: submitRefactorCapability } : {}),
          ...(reportPlanEscalationCapability ? { reportPlanEscalation: reportPlanEscalationCapability } : {}),
          ...(legacyOnlyCapabilitiesAllowed && requestStableWriteCapability ? { requestStableWrite: requestStableWriteCapability } : {}),
          // 2026-11-04 下载申请（W-1）：每会话能力；未注入 ⇒ 编排/运行时核心不注册 `request_download`。
          ...(requestDownload ? { requestDownload } : {}),
          // H-1：派发能力（仅 su 会话注入；契约字段名 `dispatchTask`——编排落地后由其转发给适配器）。
          ...(dispatchTask ? { dispatchTask } : {}),
          // 2026-10-26 view_image：全部角色会话注入（目标已定格＝本会话）；编排原样转交运行时核心。
          viewImage,
          // 2026-10-26 需求变更申请（request_requirement_change，仅统筹/提案会话注入；其余角色不注入）。
          // 「未注入即不注册」——编排再按 governanceFunction 收口。提交申请 ≠ 批准（审批在 decision 卡）。
          ...(requestRequirementChange ? { requestRequirementChange } : {}),
          // 2026-11-02（全局任务状态/版本决策）：三能力均「注入才注册」；project_state 给全部内置治理角色，
          // project_note / request_version_decision 仅 chief（编排 run-role 再按 trioSpec 收口）。
          ...(projectStateCapability ? { projectState: projectStateCapability } : {}),
          ...(projectNoteCapability ? { projectNote: projectNoteCapability } : {}),
          ...(legacyOnlyCapabilitiesAllowed && requestVersionDecisionCapability ? { requestVersionDecision: requestVersionDecisionCapability } : {}),
          ...(roleStatus ? { roleStatus } : {}),
          contractCheck,
          // 2026-11-09（文档格式权威说明）：`doc_format` 只读数据源（与 `contractCheck` 相邻、无条件注入——
          // 内置治理角色与项目角色全员可读；编排按 `contractCheck` 同条件透传，未注入 ⇒ 工具不注册）。
          docFormat,
          evidenceCheck,
          ...(sessionTail ? { sessionTail } : {}),
          // B 批（2026-10-28）：幕僚的运行日志只读数据面（仅 chief 注入；其余角色拿不到 role_activity_log）。
          ...(roleActivityLog ? { roleActivityLog } : {}),
          // B 批：终止/安全重派动作（仅 chief；「未注入即不注册」）。
          ...(terminateRoleRun ? { terminateRoleRun } : {}),
          ...(redispatchTaskCapability ? { redispatchTask: redispatchTaskCapability } : {}),
          // G-4/I3：技能安装/卸载能力（**仅 su 会话注入**——「未注入即不注册」；编排透传字段落地前
          // 被其静默忽略，零行为影响；落地后即点亮两工具，见 change 文档的依赖登记）。
          ...(installSkill ? { installSkill } : {}),
          ...(uninstallSkill ? { uninstallSkill } : {}),
          // G-4 V2：外来 MCP 安装/卸载能力（同款注入与登记）。
          ...(installMcp ? { installMcp } : {}),
          ...(uninstallMcp ? { uninstallMcp } : {}),
          // I-1：(a) 操作者确认通道——**项目角色**走 (c)/(b)/(a) 三层链（与下方 `shellArming` 同备）。
          // 内置治理角色不走此字段（其 (a) 通道在 `shellOperatorOnly` 内，见下）。
          ...(role.builtIn !== true && shellOperatorChannel ? { shellOperatorChannel } : {}),
          // I-1 补丁（2026-10-12，客户重发授权）：(c) 实件（classifyShell + defaultShellRules）——与 (a)
          // 同处装配（缺它 ⇒ 编排对「规则集未注入」一律拒绝——真机曾据此如实报「环境无 shell」）。
          ...(shellArming ? { shellArming } : {}),
          // **内置治理角色审批档（客户 2026-10-17 裁定、2026-10-19 扩至全部内置治理角色）**：
          // `role.builtIn === true` 且 (c)+(a) 同备时给出；缺件不传 ⇒ 不 arm（fail-closed，绝不放宽）。
          ...(shellOperatorOnly ? { shellOperatorOnly } : {}),
          // **旧只读档（`shellReadonly`）桌面不再注入**：内置治理角色统一走上方审批档，两档并存编排互斥拒绝。
          // 2026-10-31（判拒升级方案 v1.3 §6.4）：升级卡 presenter（每会话信号包装；缺省不传）。
          ...(shellEscalationPresenter ? { shellEscalationPresenter } : {}),
        },
        { createAdapter },
      );
      installationBinding.handle = handle;
      dispatchBinding.handle = handle;
      gitBinding.handle = handle;
      planBinding.handle = handle;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    if (stopped()) { await this.disposeObservedHandle(handle); return stoppedResult(); }

    // O-1：**边界快照指纹**定格（角色边界文件 + 项目治理边界文件（若有）+ `.ans/project.json`）——
    // 这些文件都参与**开会话时**的边界解析（`buildEffectiveProjectConfig` + 门禁 `resolveBoundarySection`）；
    // 任一处内容哈希变化 ⇒ 本会话持有的规则集已陈旧（`boundaryDiff` 检出后作废重建，绝不让活会话用旧边界）。
    const boundaryPaths: string[] = [];
    if (typeof role.boundaryPath === "string" && role.boundaryPath !== "") {
      boundaryPaths.push(path.resolve(req.projectRoot, role.boundaryPath));
    }
    const govRel =
      project.governanceBoundary && typeof project.governanceBoundary.path === "string" ? project.governanceBoundary.path : "";
    if (govRel !== "") boundaryPaths.push(path.isAbsolute(govRel) ? govRel : path.resolve(req.projectRoot, govRel));
    boundaryPaths.push(path.resolve(req.projectRoot, ".ans", "project.json")); // 恒查（缺失记 `<missing>`——pin 刷新即变）
    const boundaryPrints: Record<string, string> = {};
    for (const f of boundaryPaths) boundaryPrints[path.relative(req.projectRoot, f)] = await filePrint(f);
    // **G-4 裁定⑤（2026-10-16 客户批准）**：该角色「已安装技能」参与文件（`SKILL.md`＋`install.md`）纳入
    // 同一快照——安装/卸载/编辑技能后，本会话在**既有检查点**（发言/续接/投递/su settle 扫描）检出
    // 「已安装技能集合」变化 ⇒ 作废重建（在跑不打断）——`next-session` 语义由此收敛为 settle 即生效。
    // 零技能 ⇒ 空集（无新增路径；既有指纹语义逐字不变）；推导防御失败（读目录异常）⇒ 按零处理不入表
    // （检查时还会重推导——彼时若可读，集合差照常触发重建）。
    const skillPaths = (await this.currentSkillPaths(req.projectRoot, req.roleId)) ?? [];
    for (const f of skillPaths) boundaryPaths.push(f);
    for (const f of skillPaths) boundaryPrints[path.relative(req.projectRoot, f)] = await filePrint(f);

    if (stopped()) { await this.disposeObservedHandle(handle); return stoppedResult(); }
    const entry: LiveSession = {
      handle,
      // T3 B10.1（2026-11-11，RR5）：fixed 任务会话（convener/product/verifier 等内置角色同样）必须记录
      // 真实受派任务 id——目标会话重绑判定、投递机同任务判定与执行清单的会话任务事实都依赖它。
      // legacy 条件的旧语义逐字不变（内置治理角色仅 verifier 记录；fixed 会话例外）。
      ...(req.taskId && (role.builtIn !== true || req.roleId === "verifier" || sessionWorkflowMode === "fixed") ? { assignedTaskId: req.taskId } : {}),
      ...(requestedAssignment ? { boundAssignment: requestedAssignment } : {}),
      origins: { byTurn: new Map() },
      roleId: req.roleId, runtime: req.runtime, profileRevision, interactionState,
      projectRoot: req.projectRoot,
      config,
      sessionWorkflowMode,
      lastUsed: ++this.lruClock,
      busy: false,
      // F-5-opt1：确认制判据与 `customerInput` 注入判据同处定格（仅内置治理角色且通道已接）。
      confirmGated: customerInput !== undefined,
      boundaryPaths,
      boundaryPrints,
      skillPaths,
      ...(shellJudge !== undefined ? { shellJudge } : {}),
      ...(governanceJudge !== undefined ? { governanceJudge } : {}),
      ...(downloadRuntime !== undefined ? { downloadRuntime } : {}),
      // 需求变更审批卡通道（2026-10-26 客户纠正；2026-10-31 run-change 触发扩展）：绑定本会话客户卡上下文
      // （roleId/signal/judge/turnText）与 `onPresented`；`application:true` 的 run-change 卡不借用角色发行槽位，
      // 但呈现面按治理会话收口（统筹/提案/幕僚），其他角色/项目角色不构造该通道。
      ...(customerInput !== undefined && canPresentAppRunChange
        ? {
            requirementChangeCard: async (
              request: CustomerInputRequest,
              metadata?: CustomerInputMetadata,
              onPresented?: () => void,
            ): Promise<CustomerInputOutcome> =>
              (await customerInput(
                request,
                buildCustomerInputContext(request, {
                  ...(onPresented !== undefined ? { onPresented } : {}),
                }),
                metadata,
              )) ?? { outcome: "unavailable", reason: "客户卡通道未返回结果（fail-closed）" },
          }
        : {}),
      // 2026-11-02（版本决策）：chief 的**原始**客户卡上下文（不含 request.* 生命周期）——
      // 只由 `requestVersionDecision` 经 `withRequestLifecycle` 包装使用，避免第二套审计链。
      // 2026-11-04 trunk-amendment D1：应用自有的 VCA/逐项/stable 卡同样经它 + `withRequestLifecycle`
      // 呈现（与 run-change 同一会话选择面 convener→rapporteur→chief；客户本人，不进判断器/委托/指令）。
      ...(customerInput !== undefined && canPresentAppRunChange
        ? { governedCardContext: buildCustomerInputContext }
        : {}),
    };
    this.sessions.set(key, entry);
    // 2026-11-04 trunk-amendment D1：会话打开即预加载冻结快照/重建许可快照（best-effort；
    // 失败只诊断，`trunk:state`/`doc-freeze:list` 会如实给出 cacheHealth，不阻塞会话）。
    if (versionChangeStack !== undefined) {
      void versionChangeStack.ensureInitialized().catch((error) => {
        createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId }).error(
          "version-change.init.failed",
          error,
        );
      });
    }
    // 评审 §5.6：只记录**回交主人**（trio=Convener；single=su）的 runtime——看护向主人投递时择路用。
    if (canSchedule || governanceFunction === "chief") this.lastGovernanceRuntime.set(req.projectRoot, req.runtime);
    entry.unsubscribePersistence = entry.handle.onPersistenceChange?.(change => {
      if (this.sessions.get(key) !== entry || change.scope.roleId !== entry.roleId || change.scope.runtime !== entry.runtime) return;
      if (change.kind === 'report-save') this.mergeReportState(entry, undefined, change.state, change.reportId);
      else if (change.receipt) this.rememberReceipt(entry, change.receipt);
      this.deps.emitPersistenceChange?.({ version: 1, scope: this.persistenceScope(entry), change });
    });
    if (userInitiated && this.selectionVersion === selectionVersion) this.activeRoleId = key; // 后台自动开启不抢活动角色
    // 状态准确性 / L-1：开好即外推**真实状态快照**（busy=false + 该角色既有队列摘要）——徽标/队列行据此准确。
    this.notifyRoleState(req.projectRoot, req.roleId, req.runtime);
    this.consume(key, entry);
    // LRU：超出上限先淘汰**最久未用**者（dispose；其界面历史由渲染层自持、切回时恢复并如实提示）。
    await this.evictBeyondLimit(key); // 正在开启的这一个不淘汰（见方法注释）
    // 客户裁定（2026-10-13）：**常规「已开启与角色 X 的会话…」欢迎提示删除**——聊天流不摆常规提示
    // （真机每次开会话/切角色都出现，被客户点名）。**异常提示保留**：contextWarning（渲染侧按
    // contextSource 如实分支）、O-1 边界重建行、投递失败/受阻行等均不受影响。
    // 投递机（E-1/H-1）：本会话开好后，尝试放行积压的投递（目标=本角色的队列；为空则 no-op）。
    this.noteWatchdogActivity(req.projectRoot, "session-open"); // G-2/W3：会话开 = 真实活动
    void this.drainQueue(req.projectRoot, req.roleId, req.runtime);
    return { ok: true, config, resumed: false, runtime: req.runtime, projectRoot: req.projectRoot, profileRevision: entry.profileRevision, ...this.contextInfo(handle) };
  }

  /**
   * 事件消费循环（**每会话一个，后台持续拉取**，B-2）：切走不停拉——重 pin/回交/适配器队列消费都依赖
   * 拉取（事件流是拉驱动的）；事件带 `roleId` 信封外推，渲染侧按角色分发（多会话并存不会串消息）。
   */
  private consume(key: string, entry: LiveSession): void {
    const { roleId, handle, projectRoot, runtime } = entry;
    entry.eventConsumerDone = (async () => {
      try {
        for await (const ev of handle.events()) {
          if (this.sessions.get(key) !== entry) break;
          this.inventoryChanged(projectRoot, "runtime-event-observed");
          const origin = this.captureDeliveryOrigin(entry, ev);
          if (origin && ev.kind === 'message') {
            const detail = ev.detail as { source?: unknown; text?: unknown } | undefined;
            if (detail?.source === 'prompt-input' && typeof detail.text === 'string') origin.inputAccepted = true;
          }
          if (origin && ev.kind === 'settled') {
            const outcome = (ev.detail as { outcome?: unknown } | undefined)?.outcome;
            if (outcome === 'completed' || outcome === 'failed' || outcome === 'aborted' || outcome === 'timed_out') origin.outcome ??= outcome;
          }
          const envelope: SessionEventEnvelope = { roleId, projectRoot, runtime, event: ev.kind === 'handback' ? this.displayHandback(ev) : ev };
          // B 批（2026-10-28）：应用侧运行日志观察器（摘要 ≤200、脱敏；失败只诊断，不影响事件流）。
          // 非持久会话（persistSession=false）不创建 `.ans/state`——保留「纯内存会话零项目写入」既有契约。
          if (entry.handle.persistenceMode !== "disabled") this.observeRoleEvent(projectRoot, roleId, ev);
          // `clientMessageId` 的对外语义是**客户消息显示关联**（渲染侧乐观行 ACK 用）；应用任务的稳定
          // 身份（`ans-app-task:`）只在投递层去重使用，不冒充客户消息 ID 外推（匿名派发的事件仍匿名）。
          if (
            ev.kind !== "handback" &&
            typeof ev.turnId === "string" &&
            ev.turnId !== "" &&
            origin?.clientMessageId !== undefined &&
            !isAppTaskClientMessageId(origin.clientMessageId)
          ) {
            envelope.clientMessageId = origin.clientMessageId;
          }
          // E-1/H-1：settled ⇒ 该会话离开「忙」，并尝试按序放行**本项目各队列**的积压投递。
          // 投递触发**不挑目标**（历史上单队列按项目存放时就是如此）：一轮结束=下一次放行时机（E-1 的
          // 重试时机之一），各队列在 drainQueue 里各自检查「目标忙/未开」后再决定是否真投。
          const sourceMatches = ev.kind !== "handback" && (ev.runtime === undefined || ev.runtime === runtime) && (ev.roleId === undefined || ev.roleId === roleId);
          // **P0 收尾不变量（2026-10-30 现场）**：settled 按 turnId 兜底清 busy——即便 origin 精确匹配
          // 不成立（origin 缺失/被失败投递删掉/事件缺 turnId），也不得让 busy 永久残留（现场 turn.end 后
          // 无 delivery.end、busy 不复位、target-busy 冻结队列）。唯一例外：**两个已知 turnId 明确不同**
          // ——迟到旧回合的 settled 不得清掉正在跑的新回合（多 runtime 既有语义）。
          const runningOrigin = entry.origins.running;
          const eventTurnId = ev.kind !== "handback" && typeof ev.turnId === "string" && ev.turnId !== "" ? ev.turnId : undefined;
          const trackedTurnId = runningOrigin?.turnId;
          const differentKnownTurn = trackedTurnId !== undefined && eventTurnId !== undefined && trackedTurnId !== eventTurnId;
          const originMatchesRunning = origin !== undefined && origin === runningOrigin;
          if (ev.kind === "settled" && sourceMatches && !differentKnownTurn) {
            // 收尾推进：`origin` 可能为 undefined（旧式空 turnId / origin 已缺失），本轮投递事实仍在
            // `origins.running` 上——先定格，再删除。
            const settledOrigin = origin ?? runningOrigin;
            if (origin) origin.settled = true;
            delete entry.origins.running;
            this.trimDeliveryOrigins(entry);
            const originMissing = !originMatchesRunning;
            const settledDiagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId });
            if (entry.busy || originMatchesRunning) {
              const settledDetail = ev.detail as { outcome?: unknown; errorCode?: unknown; attempts?: unknown; replaySafe?: unknown } | undefined;
              const settledOutcomeRaw = settledDetail?.outcome;
              const settledErrorCodeRaw = settledDetail?.errorCode;
              settledDiagnostic.record("turn.settled", {
                ...(eventTurnId !== undefined ? { turnId: eventTurnId } : {}),
                state: originMissing ? "origin-missing" : "origin-matched",
                busy: entry.busy,
                ...(typeof settledOutcomeRaw === "string" ? { outcome: settledOutcomeRaw } : {}),
                ...(typeof settledErrorCodeRaw === "string" ? { errorCode: settledErrorCodeRaw } : {}),
                // P3：诊断沿用既有白名单字段承载 attempts/replaySafe（attempt←attempts、replayPlan←replaySafe）。
                ...(typeof settledDetail?.attempts === "number" && Number.isFinite(settledDetail.attempts) ? { attempt: settledDetail.attempts } : {}),
                ...(typeof settledDetail?.replaySafe === "boolean" ? { replayPlan: settledDetail.replaySafe ? "safe" : "unsafe" } : {}),
              });
            }
            if (originMissing && entry.busy) {
              settledDiagnostic.record("turn.origin-missing", {
                reasonCode: eventTurnId === undefined ? "settled-without-turn-id" : trackedTurnId === undefined ? "settled-before-turn-ack" : "settled-origin-mismatch",
                ...(eventTurnId !== undefined ? { turnId: eventTurnId } : {}),
              });
            }
            entry.interactionState.turn.abort();
            const en = this.sessions.get(key);
            if (en) {
              const wasBusy = en.busy; // G-2：只有真实「忙→闲」翻转才产生看护观察（重复/迟到的 settled 不重复计数）
              en.busy = false;
              en.busySince = undefined;
              // W6-B 真机阻塞修复：settle = 来源本轮写入完成——结算所有「等这一轮收尾」的等待者
              // （`advanceGovernanceFlow` 的 appointment 时序），再放行队列。
              const settleWaiters = en.settleWaiters;
              en.settleWaiters = undefined;
              for (const finish of settleWaiters ?? []) finish(true);
              // G-2/W1+W3：先读「进行中」条目再撤销——本轮是否由 `kind:"system"` 投递持有（看护自身的告警/
              // 收束/恢复回执）决定该 settle 是否算**真实活动**（刻意排除 ⇒ 防「总结完→又被立即催」的骚扰
              // 回路；静默阈值默认 30s＝一个 tick 的最小防抖——客户 2026-10-16 run-5 裁定，隔离更须严格）。
              const finishedDelivery = this.activeDeliveries.get(this.queueKey(en.projectRoot, roleId, runtime));
              // **P0（2026-10-30）：settle 收尾补 delivery 终态**。回合已经跑完 ⇒ 该投递的输入已被运行时接收；
              // 若 send promise 尚未记账（快适配器/挂起续段），由 settle 关闭并落**恰一次** `delivery.end`
              // （现场「turn.end 后无 delivery.end」的对账缺口）；随后续段不再重复记账。
              if (finishedDelivery !== undefined && finishedDelivery.terminalRecorded !== true) {
                finishedDelivery.terminalRecorded = true;
                this.deliveredDeliveryKeys.add(`${this.queueKey(en.projectRoot, roleId, runtime)}\u0000${finishedDelivery.dedupKey}`);
                this.rememberAppTaskDelivered(finishedDelivery.clientMessageId);
                createDiagnosticLogger({ component: "desktop.delivery", projectRoot, roleId }).record("delivery.end", {
                  ok: true,
                  count: 1,
                  state: finishedDelivery.kind,
                  phase: "turn-settled",
                });
              }
              this.activeDeliveries.delete(this.queueKey(en.projectRoot, roleId, runtime)); // 「进行中」随本轮结束撤销
              // 2026-10-20 重启续跑：本轮结束 ⇒ 清理已完成标记并落盘（持久项已在 delivery.end 移除）。
              // P0：由 settle 补记账的条目**保留**「已投递」标记（防写盘竞态后重启重投）。
              if (finishedDelivery !== undefined && finishedDelivery.terminalRecorded !== true) {
                this.deliveredDeliveryKeys.delete(`${this.queueKey(en.projectRoot, roleId, runtime)}\u0000${finishedDelivery.dedupKey}`);
              }
              this.persistDeliveryQueues();
              // 状态准确性：settled = 「本角色离开工作中」的**真实信号**（B-2 下切走的后台轮次结束也走这里）
              // ——先外推再放行队列（放行时 busy 复位已可见）。
              this.notifyRoleState(en.projectRoot, roleId, runtime);
              // G-2/W1：转发放行前的结构化事实（lastTurn 落表 + 看护观察；outcome 只认四值终局——缺事实不猜）。
              if (wasBusy) {
                // 2026-10-18 客户反馈：trio 内部内置角色的收尾正文经投递机转成**[系统·治理反馈] 汇总任务**
                // 投给主入口（Lead）——由 Lead 向客户汇总，不再原文贴到 pane。取出即删 ⇒ 同一轮只投一次。
                // 用**事件循环的 projectRoot**（与 lastAssistantText 的 queueKey 同源）——不要用 en.projectRoot
                // （会话 entry 的 root 可能是斜杠变体，getListing 精确匹配会静默 miss）。
                // 2026-10-24（治理协调）：带本轮 flowId/终局——Proof 只发状态+报告指针（不转全文）。
                const settledOutcomeRaw = origin?.outcome ?? (ev.detail as { outcome?: unknown } | undefined)?.outcome;
                const settledOutcome =
                  settledOutcomeRaw === "completed" || settledOutcomeRaw === "failed" || settledOutcomeRaw === "aborted" || settledOutcomeRaw === "timed_out"
                    ? settledOutcomeRaw
                    : undefined;
                // P1（2026-10-30）：请求超时/请求失败的结构化 errorCode（来自 Service settled.detail）——
                // 只用于人话系统行 + lastTurn 小状态；**不**进入客户可见文案（不显示技术 code/堆栈/URL）。
                // P2：网络离线超窗（`network-offline-timeout`）同口径，用网络人话文案。
                const settledErrorCodeRaw = (ev.detail as { errorCode?: unknown } | undefined)?.errorCode;
                const settledErrorCode = typeof settledErrorCodeRaw === "string" && (isRequestFailureCode(settledErrorCodeRaw) || isNetworkOfflineFailureCode(settledErrorCodeRaw)) ? settledErrorCodeRaw : undefined;
                void this.mirrorGovernanceFeedback(projectRoot, runtime, roleId, {
                  ...(settledOrigin?.flowIds !== undefined && settledOrigin.flowIds.length > 0 ? { flowIds: settledOrigin.flowIds } : {}),
                  ...(settledOutcome !== undefined ? { outcome: settledOutcome } : {}),
                });
                if (settledOutcome !== undefined) {
                  this.lastTurns.set(this.queueKey(en.projectRoot, roleId, runtime), { outcome: settledOutcome, at: new Date(this.now()).toISOString(), ...(settledErrorCode !== undefined ? { errorCode: settledErrorCode } : {}) });
                }
                if (settledOutcome === "failed" && settledErrorCode !== undefined) {
                  // 人话系统行（客户卡不出现技术模板/code）：来源 i18n；delivery-note 只呈现，不触发模型/门禁。
                  const human = isNetworkOfflineFailureCode(settledErrorCode)
                    ? mainT("main.networkStatus.offlineTimeout")
                    : settledErrorCode === MODEL_REQUEST_RETRY_EXHAUSTED
                      ? mainT("main.requestStatus.retryExhausted")
                      : settledErrorCode === REQUEST_TIMEOUT_ERROR_CODES["first-byte"]
                        ? mainT("main.requestStatus.timeoutFirstByte")
                        : settledErrorCode === REQUEST_TIMEOUT_ERROR_CODES.idle
                          ? mainT("main.requestStatus.timeoutIdle")
                          : mainT("main.requestStatus.failed");
                  this.emitDeliveryNote(en.projectRoot, runtime, roleId, roleId, human);
                }
                this.observeWatchdog(en.projectRoot, {
                  kind: "settled",
                  roleId,
                  ...(settledOutcome !== undefined ? { outcome: settledOutcome } : {}),
                  at: this.now(),
                  fromSystemDelivery: finishedDelivery?.kind === "system",
                });
                if (finishedDelivery?.kind !== "system") this.noteWatchdogActivity(en.projectRoot, "settled");
              }
              void this.drainAllQueuesFor(en.projectRoot);
              if (runtime === "pi") void this.drainPiQueuesAcrossProjects();
              // P1-2：某会话离开 busy = LRU 回收的「下一时机」（暂超限的账在这里还——只收非 busy 者）。
              void this.evictBeyondLimit();
            }
          }
          // E-1：回交到达 ⇒ 自动投递主人（去重 + 排队 + 失败如实/保留；见 handleHandback）。
          if (ev.kind === "handback") {
            this.mergeReportState(entry, ev);
          }
          // 2026-10-18 客户反馈「内部治理角色，应该都向联络官反馈」：只记**普通 assistant 正文**
          // （系统行/投递状态/推理/工具事件不记；live 的正文可能带 `display`，照记）。
          // 同一回复可能拆多个 text block ⇒ 同 turnId 用 "\n" 累积（turnId 变化重置；总长 ≤4000 码点）。
          if (isAssistantTextEvent(ev)) {
            const textKey = this.queueKey(projectRoot, roleId, runtime);
            const prev = this.lastAssistantText.get(textKey);
            const accumulated = prev !== undefined && prev.turnId === ev.turnId ? `${prev.text}\n${ev.summary}` : ev.summary;
            const chars = Array.from(accumulated);
            this.lastAssistantText.set(textKey, {
              turnId: ev.turnId,
              text: chars.length > 4000 ? `…${chars.slice(chars.length - 3999).join("")}` : accumulated,
            });
          }
          if (ev.kind === 'message') {
            const detail = ev.detail as { source?: string; text?: string; inputProvenance?: RuntimeInputProvenanceV1; inputPresentation?: RuntimeLiveHandbackPresentationV1; receipt?: RuntimeDeliveryReceiptV1 } | undefined;
            if (detail?.source === 'prompt-input' && (detail.inputProvenance || detail.inputPresentation)) {
              const attemptId = detail.inputProvenance?.attemptId ?? detail.inputPresentation?.attemptId;
              const active = this.activeDeliveries.get(this.queueKey(projectRoot, roleId, runtime));
              if (active && attemptId === active.attemptId) active.safeText = detail.text;
            }
            if (detail?.source === 'delivery-receipt' && detail.receipt) this.rememberReceipt(entry, detail.receipt);
            if (detail?.source === 'delivery-boundary' || detail?.source === 'delivery-receipt') envelope.event = { ...ev, summary: mainT("main.history.deliveryState") };
            // 2026-10-25 A3/A4：治理反馈的输入回显 → 附带客户投影（找到才附加；miss 时事件逐字不变）。
            if (detail?.source === 'prompt-input' && typeof detail.text === 'string') {
              const projection = this.lookupGovernanceClientProjection(projectRoot, roleId, runtime, detail.text);
              if (projection !== undefined) {
                envelope.event = {
                  ...ev,
                  detail: { ...(detail as unknown as Record<string, unknown>), clientProjection: projection },
                };
              }
            }
          }
          // G-2/W1 信号 #3：命令超时限（F-1 事实）——只认 `display.process` 结构化投影（`timedOut === true`），
          // 判据复用 session-history.ts 的同一实现（不解析文本、不另写一份）；低频高信号 ⇒ 看护侧单次即报。
          if ((ev.kind === "accepted" || ev.kind === "denied") && classifyProcessOutcome((ev.detail as { display?: unknown } | undefined)?.display) === "timed-out") {
            this.observeWatchdog(projectRoot, { kind: "command-timed-out", roleId, at: this.now() });
          }
          try {
            this.deps.emitEvent(envelope);
          } catch {
            // 外推失败（如窗口已关）不得影响会话本身。
          }
          if (ev.kind === "settled" && origin && origin.settled) this.resumeDeferredRunChanges(entry, origin);
        }
      } catch (err) {
        entry.eventConsumerFailed = true;
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("session.events.failed", err);
        if (this.sessions.get(key) !== entry) return;
        entry.interactionState.turn.abort();
        entry.busy = false;
        entry.busySince = undefined;
        this.notifyRoleState(projectRoot, roleId, runtime);
        this.deps.emitEvent({
          roleId, projectRoot, runtime,
          event: { kind: "message", summary: mainT("main.session.eventStreamError", { detail: err instanceof Error ? err.message : String(err) }) },
        });
      }
    })();
    void entry.eventConsumerDone.catch(error => {
      entry.eventConsumerFailed = true;
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("session.events.completion.failed", error);
    });
  }

  /** 发送一轮消息给**当前活动会话**（最近一次 open 的角色）；可反复调用。
   *  **L-1（2026-10-12 客户裁定「每个角色…有个队列的概念」）**：角色**忙时不再直接失败**（旧行为＝直转 SDK、
   *  被回 "already processing" 报错给客户）——客户消息作为**第三类**并入**同一条**投递队列（E-1/H-1 共用），
   *  按到达序在当前任务结束后执行；空闲路径同样声明聊天来源。返回 `queued:true + position`（界面据此如实提示）。
   *  **P0-1（2026-10-13 客户批准）**：`opts`（图片载荷）为**可选**——忙时**入队即定格**（排队后到投递都带
   *  原图）；空闲直发与出队均组合本轮来源和 ACK，images 数组保持原引用。 */
  async send(text: string, opts?: PromptOptions, target?: SessionTarget, metadata?: SessionMessageMetadata): Promise<SendResult> {
    // **目标角色在入口定格（2026-10-13 状态机修复）**：并发作废重建（settle 触发的 refreshStaleBoundaries
    // 与本次 send 各自的重建赛跑）会在窗口里清空/替换 `activeRoleId`——按「当下的 activeRoleId」取条目会让
    // 本条消息**落空**（旧实现会回「会话尚未开启」且消息丢失）。用户的意图是入口那一刻的活动角色，照它走。
    let clientMessageId: string | undefined;
    if (typeof metadata?.clientMessageId === "string" && metadata.clientMessageId !== "") clientMessageId = metadata.clientMessageId;
    // 应用代客户推送（2026-10-18）：后台投递——不抢 activeRoleId、不把「当前为空」复位成目标角色。
    const background = metadata?.background === true;
    // 2026-10-26 客户真机：治理唤醒按 `system` 入队（UI 显示「系统」、不可撤回）；缺省仍是客户消息类别。
    // 只认可 `background` 投递上的 system 标记——渲染侧即便伪造 metadata 也不会把客户消息伪装成系统条目。
    const deliveryKind: "message" | "system" = background && metadata?.kind === "system" ? "system" : "message";
    let targetRoleId = this.activeRoleId;
    if (target !== undefined) targetRoleId = this.targetKey(target) ?? null;
    const selectionVersion = this.selectionVersion;
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot: this.activeEntry()?.projectRoot, roleId: targetRoleId ?? undefined });
    diagnostic.record("session.send.start");
    // **2026-10-25 重复投递修复**：应用任务的稳定键已投递过（ACK/成功）⇒ 本次调用不再发送。
    // 判据只认应用后台投递（`sendBackground`）生成的 `ans-app-task:` 键；真实客户消息（渲染侧 UUID、
    // 无 background 标记）不会命中——「同文重复发送是两个意图」的语义不受影响。
    const appTaskId = background && isAppTaskClientMessageId(clientMessageId) ? clientMessageId : undefined;
    if (appTaskId !== undefined && this.deliveredAppTaskIds.has(appTaskId)) {
      diagnostic.record("session.send.duplicate", { reasonCode: "delivered" });
      return { ok: true, clientMessageId: appTaskId, duplicate: true };
    }
    // O-1（2026-10-12）：发言前先查**边界快照**——陈旧 ⇒ 先作废重建（本条发言直接落到新边界会话上；
    // 重建失败 ⇒ 如实回错、本条不发送）。在跑的轮次由 rebuild 内部跳过（不打断）。
    if (targetRoleId !== null) {
      const rebuilt = await this.rebuildIfBoundaryStale(targetRoleId, !background);
      if (rebuilt !== undefined && !rebuilt.reopened.ok) {
        diagnostic.error("session.send.failed", new Error(rebuilt.reopened.error || "重开失败"));
        return { ok: false, error: mainT("main.session.rebuildFailedNoSend", { detail: rebuilt.reopened.error ?? mainT("shared.common.unknownReason") }) };
      }
    }
    const entry = targetRoleId !== null ? this.sessions.get(targetRoleId) : undefined;
    if (!entry) {
      diagnostic.record("session.send.failed", { reasonCode: "session-not-open" });
      return { ok: false, error: mainT("main.session.notOpen") };
    }
    // **同一应用任务已在队列/在途（含直接 send 开跑的那一轮）⇒ 不重复入队/发送**——重建前后、两条应用
    // 链路各调一次时，客户侧只看到一条 user 消息（重复调用方拿到 `duplicate:true`，仍视为已受理）。
    if (appTaskId !== undefined) {
      const pending =
        this.pendingAppTaskDelivery(entry.projectRoot, entry.roleId, entry.runtime, appTaskId) ??
        (entry.origins.running?.clientMessageId === appTaskId ? { queued: false } : undefined);
      if (pending !== undefined) {
        diagnostic.record("session.send.duplicate", { reasonCode: pending.queued ? "queued" : "in-flight" });
        return {
          ok: true,
          clientMessageId: appTaskId,
          duplicate: true,
          ...(pending.queued ? { queued: true, ...(pending.position !== undefined ? { position: pending.position } : {}) } : {}),
        };
      }
    }
    // 并发重建可能把活动指针清掉（dispose 置 null、后台重开不抢位）——用户意图仍指向 targetRoleId：复位。
    // （若用户期间开了**别的**角色，activeRoleId 非 null，不动它——不抢位。）
    // **后台投递不复位活动指针**（应用代客户派发 ≠ 用户切换 pane；当前 pane 保持原样）。
    if (this.activeRoleId === null && this.selectionVersion === selectionVersion && !background) this.activeRoleId = targetRoleId;
    this.noteWatchdogActivity(entry.projectRoot, background ? "governance-advance" : "customer-send"); // G-2/W3：客户消息 = 真实活动（无论直发还是入队，都在此定格）
    // P0（2026-10-30）：先自愈「busy 已复位但 origin 残留」的陈旧归属；忙/已有 origin 一律入队（不覆盖）。
    this.healStaleOrigin(entry, "stale-origin-before-send");
    const queueBecauseBusy = (): SendResult => {
      const roleId = entry.roleId;
      this.enqueueDelivery(entry.projectRoot, roleId, {
        kind: deliveryKind,
        clientMessageId,
        runtime: entry.runtime,
        targetRoleId: roleId,
        sourceRoleId: roleId,
        text,
        // 系统条目摘要不写「你：」（队列行已按 kind 显示「系统」）；客户消息文案逐字不变。
        summary: deliveryKind === "system" ? shortenText(text, 40) : mainT("main.session.youMessage", { text: shortenText(text, 40) }),
        // 客户消息逐条独立（**不去重**——同文重复发送是两个意图）：键含自增序号+时间。
        dedupKey: `msg\u0000${++this.messageSeq}\u0000${Date.now()}`,
        // P0-1：**入队即定格**——原包存进条目；投递组合来源和 ACK，图片引用不变。
        ...(opts !== undefined ? { opts } : {}),
      });
      const q = this.deliveryQueues.get(this.queueKey(entry.projectRoot, roleId, entry.runtime));
      diagnostic.record("session.send.queued", { queueDepth: q?.length ?? 0 });
      return { ok: true, queued: true, position: q ? q.length : 1, ...(clientMessageId !== undefined ? { clientMessageId } : {}) };
    };
    if (entry.busy || entry.origins.running !== undefined || (entry.runtime === "pi" && entry.profileRevision !== this.profileRevision("pi") && this.hasBusyRuntime("pi"))) {
      return queueBecauseBusy();
    }
    const roleId = entry.roleId;
    // L-1 顺序修正（与投递机同款，防竞态）：**先置忙再 await**——快适配器（如演示 runtime）的事件
    // （含 `settled`）可能在 `send` 返回前就被消费循环处理完；若此刻才置忙，settled 的复位会被反向覆盖，
    // 忙态将**永不复位**（队列也永不放行）。失败 ⇒ 复位 + 外推（并没有在跑，如实）。
    const origin = this.beginDeliveryOrigin(entry, clientMessageId);
    if (origin === undefined) return queueBecauseBusy(); // turn lease 争用（同步段不可达；防御：入队不覆盖）
    // Direct and queued inputs retain the same actual source kind, including customer messages.
    origin.kind = deliveryKind;
    entry.interactionState.turn = new AbortController();
    entry.busy = true;
    entry.busySince = this.now(); // G-2/W1：本轮起点定格（看护信号 #1 的 elapsed 基准；busy 期间才被读取）
    entry.lastTurnAborted = undefined; // 新一轮开始：上一轮的中止标记不再适用于本轮
    // P0-2 前置修正（2026-10-13，随停止入口同批）：**开跑即外推 busy=true**——与投递机同款
    //（先置忙即推快照）。旧版只在 round 结束后推：长轮次（真实 pi 一轮数分钟）期间界面根本收不到
    // 「工作中」快照——停止钮与左树徽标都无从在轮次**进行中**出现（快适配器掩盖了这条缝；停止入口
    // 把缝暴露出来）。此处开跑即推（如实）；结束后那次保留（兜底快适配器「settled 先于 send 返回
    // 被消费」的竞态）。
    this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
    try {
      // P0-1：组合聊天来源与 ACK；图片数组保持原引用。
      await this.sendDelivery(entry, origin, text, opts);
      this.rememberAppTaskDelivered(clientMessageId); // 投递成功 ⇒ 应用任务记「已投递」（同任务不再重发）
      this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime); // 状态准确性：真开跑即外推「工作中」（繁忙与否以会话条目为准）
      diagnostic.record("session.send.end", { ok: true });
      return { ok: true, ...this.sendFacts(entry, origin) };
    } catch (err) {
      diagnostic.error("session.send.failed", err);
      // **已 ACK（turnId 已绑定）后再失败：输入已交给运行时，不再当未投递**——记「已投递」标记，
      // 应用侧同一任务的重试调用会被 `duplicate` 拦下（at-most-once；失败重试只对未 ACK 的成立）。
      if (origin.turnId !== undefined) this.rememberAppTaskDelivered(clientMessageId);
      const ownsRunningDelivery = entry.origins.running === origin;
      this.failDeliveryOrigin(entry, origin);
      if (ownsRunningDelivery) {
        entry.interactionState.turn.abort();
        entry.busy = false;
        entry.busySince = undefined;
      }
      this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
      return { ok: false, error: err instanceof Error ? err.message : String(err), ...this.sendFacts(entry, origin) };
    }
  }

  /**
   * **停当前轮次（P0-2 UI，2026-10-13 客户批准）**：向指定角色的会话句柄请求中止当前进行中的轮次。
   * **三态如实回传**（契约形状 `RoleSessionAbortResult`，语义钉死在编排 run-role.ts）：
   * - `{ok:true, supported:true}` —— 已请求停止（轮次仍以既有 `settled` 收尾——**不做乐观「已停止」假象**）；
   * - `{ok:false, supported:false, error}` —— 句柄方法缺席（旧替身）或底层会话不带 abort（如 demo 替身）
   *   ——「当前运行时不支持停止」，**绝不假装已停**；
   * - `{ok:false, supported:true, error}` —— 底层 abort 报错：错误原文如实上抛，不吞。
   * 幂等：无在飞轮次 = no-op（底层不抛错、无副作用——abort 语义已在适配器环测试钉死）。
   */
  async abort(target: string | SessionTarget): Promise<RoleSessionAbortResult> {
    const key = this.targetKey(target);
    let entry: LiveSession | undefined;
    if (key !== undefined) entry = this.sessions.get(key);
    const roleId = entry?.roleId ?? "";
    if (!entry) {
      return { ok: false, supported: false, error: mainT("main.session.stopNoSession", { roleId }) };
    }
    // 契约：消费方以 `handle.abort?.()` 调用——**方法缺席**（旧替身）与返回 supported:false 同一处理。
    if (entry.handle.abort === undefined) {
      return { ok: false, supported: false, error: mainT("main.session.stopUnsupported") };
    }
    try {
      // 中止标记（链式治理推进的早失败护栏）：被请求中止 ≠ 正常结束——链路继续轮询等下一次投递/重试。
      recordGitHostInterruption({ projectRoot: entry.projectRoot, reason: "desktop-turn-abort-requested", coreSessionId: entry.handle.sessionId });
      this.inventoryChanged(entry.projectRoot, "turn-abort-requested");
      entry.lastTurnAborted = true;
      entry.interactionState.turn.abort();
      const result = await entry.handle.abort();
      // **P0 手动停止解楔（2026-10-30 现场：10+ 次停止 ~1ms ok 但零变化）**：停止入口必须能强制复位
      // 投递层楔死（origin/busy/activeDeliveries）并让队列继续；`handle.abort` 已如实返回成功才能这样做
      // （不支持/失败 ⇒ 不假装已停）。这里**不伪造 turn**：只复位投递层状态并记 `turn.abort.forced`。
      if (result.ok === true) this.forceResetDeliveryState(entry, "abort-requested");
      return result;
    } catch (err) {
      return { ok: false, supported: true, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * **强制复位投递层状态（P0，2026-10-30）**：仅在「停止已成功请求」后由 `abort` 调用——
   * 复位 `origins.running`/`busy`/`activeDeliveries`，为被放弃的在途投递落**恰一次**终态（`delivery.end`
   * `mode:"aborted"`，at-most-once，不重投），结算 settle 等待者并放行队列。**不伪造回合终局**：
   * 运行时若稍后仍发 settled，按既有幂等路径处理（busy 已复位，不产生第二次收尾）。
   * 无忙态/无 origin/无在途 ⇒ no-op（幂等，不产生噪声）。
   */
  private forceResetDeliveryState(entry: LiveSession, reasonCode: string): void {
    const key = this.queueKey(entry.projectRoot, entry.roleId, entry.runtime);
    const origin = entry.origins.running;
    const active = this.activeDeliveries.get(key);
    const wasBusy = entry.busy;
    if (!wasBusy && origin === undefined && active === undefined) return;
    if (origin !== undefined) {
      origin.settled = true;
      delete entry.origins.running;
      this.trimDeliveryOrigins(entry);
    }
    let activeClosed = 0;
    if (active !== undefined && active.terminalRecorded !== true) {
      active.terminalRecorded = true;
      activeClosed = 1;
      this.deliveredDeliveryKeys.add(`${key}\u0000${active.dedupKey}`);
      this.rememberAppTaskDelivered(active.clientMessageId);
      createDiagnosticLogger({ component: "desktop.delivery", projectRoot: entry.projectRoot, roleId: entry.roleId }).record("delivery.end", {
        ok: true,
        count: 1,
        state: active.kind,
        mode: "aborted",
        reasonCode,
      });
    }
    if (active !== undefined) this.activeDeliveries.delete(key);
    entry.busy = false;
    entry.busySince = undefined;
    const settleWaiters = entry.settleWaiters;
    entry.settleWaiters = undefined;
    for (const finish of settleWaiters ?? []) finish(true);
    createDiagnosticLogger({ component: "desktop.session", projectRoot: entry.projectRoot, roleId: entry.roleId }).record(
      "turn.abort.forced",
      {
        reasonCode,
        ...(origin?.turnId !== undefined ? { turnId: origin.turnId } : {}),
        mode: "forced",
        count: activeClosed,
        queueDepth: (this.deliveryQueues.get(key) ?? []).length,
        busy: wasBusy,
      },
    );
    this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
    this.persistDeliveryQueues();
    void this.drainAllQueuesFor(entry.projectRoot);
    if (entry.runtime === "pi") void this.drainPiQueuesAcrossProjects();
  }

  /**
   * 关闭会话（B-2：**定向**）。给定 `roleId` 只关该角色（历史留在界面上）；缺省/`null` 关**全部**
   * （换项目/退出时用）。dispose 出错如实返回（不静默）。
   */
  async stop(target?: string | SessionTarget | null): Promise<StopResult> {
    let roleId: string | undefined;
    if (target !== undefined && target !== null) roleId = this.targetKey(target);
    if (target && roleId === undefined) return this.finishStopPersistence({ ok: false, note: mainT("main.session.stopNoMatch") });
    for (const manager of desktopSessionManagers) for (const operation of manager.runChangeOperations.values()) {
      const members = operation.plan.handles.filter(member => this.observedHandles.has(member.hostHandleId));
      if (manager !== this && !members.length) continue;
      if (!roleId || members.some(member => { const row = this.observedHandles.get(member.hostHandleId)!;
        return this.sessionKey(operation.plan.projectRoot, member.roleId, row.fact.runtime) === roleId; })) operation.controller.abort();
    }
    // Fence before the first await, even if no live entry remains after a failed open.
    if (roleId) {
      this.stoppedDeliveryKeys.add(roleId); this.resumedDeliveryKeys.delete(roleId);
      this.deliveryKeyStopVersions.set(roleId, (this.deliveryKeyStopVersions.get(roleId) ?? 0) + 1);
    } else {
      ++this.deliveryStopVersion; this.deliveryStoppedAll = true; this.resumedDeliveryKeys.clear();
    }
    createDiagnosticLogger({ component: "desktop.session", roleId: roleId ?? undefined }).record("session.stop", { count: this.sessions.size });
    if (typeof roleId !== "string" || roleId === "" || roleId === this.selectionTargetRoleId) {
      ++this.selectionVersion;
      this.selectionTargetRoleId = null;
    }
    // 重建会暂时移出条目。等已在途的链收尾后再释放，避免关闭遗漏重建中的句柄。
    if (typeof roleId === "string" && roleId !== "") {
      await this.rebuildChains.get(roleId);
    } else {
      ++this.boundaryRefreshVersion;
      await Promise.all([...this.rebuildChains.values()]);
    }
    if (typeof roleId === "string" && roleId !== "") {
      const entry = this.sessions.get(roleId);
      if (!entry) {
        return this.finishStopPersistence({ ok: false, note: mainT("main.session.releaseNoSession", { roleId }) });
      }
      const err = await this.disposeEntry(roleId, entry);
      return this.finishStopPersistence(err === null
        ? { ok: true, note: mainT("main.session.releasedRole", { roleId }) }
        : { ok: false, note: mainT("main.session.releaseError", { detail: String(err) }) });
    }
    if (this.sessions.size === 0) {
      return this.finishStopPersistence({ ok: false, note: mainT("main.session.noOpenSessions") });
    }
    const n = this.sessions.size;
    let firstError: string | null = null;
    for (const id of [...this.sessions.keys()]) {
      const entry = this.sessions.get(id);
      if (!entry) continue;
      const err = await this.disposeEntry(id, entry);
      if (err !== null && firstError === null) firstError = err;
    }
    if (firstError !== null) return this.finishStopPersistence({ ok: false, note: mainT("main.session.releaseError", { detail: String(firstError) }) });
    return this.finishStopPersistence({ ok: true, note: n === 1 ? mainT("main.session.closed") : mainT("main.session.closedAll", { count: n }) });
  }

  /** 是否还有**任何**保活会话（B-2：不再是「唯一句柄」语义）。 */
  isOpen(): boolean {
    return this.sessions.size > 0;
  }

  /** 当前**活动**（最近一次**用户发起**的 open）的角色 id；无则 null（后台自动开启不改变它）。 */
  openForRoleId(): string | null {
    return this.activeEntry()?.roleId ?? null;
  }

  /** 保活中的角色 id 列表（B-3 状态徽标「空闲/已停止」派生据它 + 渲染侧的数据源）。 */
  liveRoleIds(): string[] {
    return [...new Set([...this.sessions.values()].map((entry) => entry.roleId))];
  }

  // —————— 投递机（E-1 回交投 su + H-1 派发投目标角色；**同一套**，不造第二套） ——————

  /**
   * **回交主人**角色 id（评审 §5.6，数据驱动、不硬编码）：
   *  · trio → `governanceFunction === "schedule"` 的角色（Convener）；
   *  · single → 门禁枚举给的 `primaryRoleId`（旧 su）。
   * 回交、看护系统消息、恢复回执、投递失败系统行全部用它；`primaryRoleId` 只用于主入口/客户镜像。
   * 枚举不到 → null（投递机按既有「目标未枚举」路径保留待重试，绝不静默丢）。
   */
  private handbackOwnerRoleId(projectRoot: string): string | null {
    return handbackOwnerRoleId(projectRoot, this.deps);
  }

  /** B 批：任务/汇报主链的幕僚角色 id（**只认真实 chief**，不把旧 liaison 别名算作星形主链）。 */
  /** 登记任务创建者（读盘重放/新建/重派共用；缺字段的旧记录按 chief 兼容）。 */
  private rememberTaskCreator(taskId: string, created: { from?: "chief" | "convener" } | undefined): void {
    rememberTaskCreator(taskId, created);
  }

  private chiefTaskRoleIdOf(projectRoot: string): string | null {
    return chiefTaskRoleIdOf(projectRoot, this.deps);
  }

  /** B 批：任务/汇报状态读取（坏行跳过；读失败按空状态 + 诊断，不阻塞）。 */
  private async readTasks(projectRoot: string): Promise<TaskReplay> {
    return readTasks(projectRoot);
  }

  /** T3 B1：该任务是否为 fixed 任务（`task.created.workflowId` 命名空间；固定路径无 legacy run 绑定）。 */
  private async isFixedTask(projectRoot: string, taskId: string | undefined): Promise<boolean> {
    return isFixedTask(projectRoot, taskId);
  }

  /**
   * T3 B8.2（2026-11-11，RR3/B8.1 披露）：fixed 子任务回交到运营（convener）的**账本校验**。
   * 只认 tasks 账本 + workflows 账本事实（**不调用** legacy `resolveDeliveryAssignment`——后者要求
   * child `parentTaskRef`/run，会把 fixed 生产任务的回交误判 `delivery-child-source-invalid`）：
   * child 真实存在且带 `workflowId`、回交角色 = 受派人、创建者 = 回交目标、workflow 存在且未关闭。
   * 任一项不满足 ⇒ 不可投递（调用方 fail-closed 诊断，不误投）。
   *
   * T3 B11.1（2026-11-11，RR6 根因「已封口 child 的回交仍排队并反复阻塞」）：child **已收口**
   * （`record.closed !== undefined`）是**可判定的终态**，不是「不可核验」——返回 `ok:true, closed:true`，
   * 由调用方丢弃该回交成员并继续 drain（不投递、不阻塞后续回交；也不伪造 task.delivered/report）。
   * 其余校验（存在性/角色/创建者/flowId/workflow 账本）逐字不变。
   */
  private async inspectFixedHandbackChild(
    projectRoot: string,
    handback: TaskHandback,
    recipientRoleId: string,
    expectedFlowId: string | undefined,
  ): Promise<{ ok: true; taskId: string; workflowId: string; closed: boolean } | { ok: false; message: string }> {
    const taskId = typeof handback.taskId === "string" ? handback.taskId.trim() : "";
    if (taskId === "") return { ok: false, message: "回交缺少任务 id（无法按任务账本核对）" };
    const state = await this.readTasks(projectRoot);
    const record = state.records.get(taskId);
    if (record?.created === undefined) {
      return { ok: false, message: `任务 ${taskId} 不在 tasks 账本（无 task.created）` };
    }
    const created = record.created;
    if (typeof created.workflowId !== "string" || created.workflowId === "") {
      return { ok: false, message: `任务 ${taskId} 未绑定 workflowId（非 fixed 任务）` };
    }
    const roleId = typeof handback.roleId === "string" ? handback.roleId.trim() : "";
    if (created.to !== roleId) {
      return { ok: false, message: `回交角色 ${roleId === "" ? "（空）" : roleId} 与任务 ${taskId} 的受派人 ${created.to} 不一致` };
    }
    if (created.from !== recipientRoleId) {
      return { ok: false, message: `任务 ${taskId} 的创建者 ${created.from} 不是回交目标 ${recipientRoleId}` };
    }
    if (expectedFlowId !== undefined && expectedFlowId !== "" && created.flowId !== expectedFlowId) {
      return { ok: false, message: `任务 ${taskId} 的 flow（${created.flowId ?? "（无）"}）与投递条目（${expectedFlowId}）不一致` };
    }
    if (record.closed !== undefined) {
      // T3 B11.1（RR6）：已收口固定子任务 = 可判定终态（丢弃该回交成员），不得误判为「不可投递」反复阻塞队列。
      return { ok: true, taskId, workflowId: created.workflowId, closed: true };
    }
    const ledger = await readWorkflowLedger(projectRoot);
    const scoped = ledger.events.filter((event) => event.workflowId === created.workflowId);
    if (scoped.length === 0) {
      return { ok: false, message: `任务 ${taskId} 的 workflow ${created.workflowId} 在账本不存在` };
    }
    const view = deriveWorkflowView(scoped, state.events);
    if (view.blocked?.code === "workflow-corrupt") {
      return { ok: false, message: `任务 ${taskId} 的 workflow 账本损坏：${view.blocked.summary}` };
    }
    if (view.closed !== undefined) {
      return { ok: false, message: `任务 ${taskId} 的 workflow ${created.workflowId} 已关闭（${view.closed.outcome}）` };
    }
    return { ok: true, taskId, workflowId: created.workflowId, closed: false };
  }

  /** B 批：追加任务事件；失败只记诊断并返回 false（调用方决定是否 fail-closed）。 */
  private async appendTaskStateResult(projectRoot: string, event: TaskStateEvent): ReturnType<typeof recordTaskObservation> {
    return appendTaskStateResult(projectRoot, event);
  }
  private async appendTaskState(projectRoot: string, event: TaskStateEvent): Promise<boolean> {
    return appendTaskState(projectRoot, event);
  }

  private async recordTaskFailure(projectRoot: string, taskId: string, summary: string): Promise<boolean> {
    return recordTaskFailure(projectRoot, taskId, summary, () => this.now());
  }

  /** B 批：每角色运行日志观察器（应用侧写，不依赖角色上报；失败只诊断、绝不打断事件循环）。 */
  private appendRoleActivity(
    projectRoot: string,
    roleId: string,
    input: { kind: string; summary: string; tool?: string; status?: string; taskId?: string; turnId?: string; ref?: string },
  ): Promise<void> {
    return appendRoleActivity(projectRoot, roleId, input, { lastRoleActivity: this.lastRoleActivity, now: () => this.now() });
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private observeRoleEvent(projectRoot: string, roleId: string, event: OrchestrationEvent): void {
    this.tasks.observeRoleEvent(projectRoot, roleId, event);
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private async roleActivityLogText(projectRoot: string, query: RoleActivityLogPayload): Promise<WatchdogToolResult> {
    return this.tasks.roleActivityLogText(projectRoot, query);
  }

  // —————————————— B 批：任务列表 / 重启恢复 / 终止 / 重派（界面与专项测试入口） ——————————————

  /** C 批：申请 id（稳定：来源/轮次/工具调用/卡片内容；同一调用重放同 id）。 */
  private requestIdFor(projectRoot: string, sourceRoleId: string, request: CustomerInputRequest, metadata?: CustomerInputMetadata): string {
    const options = request.kind === "choice" ? request.options.map((option) => `${option.id}:${option.label}:${option.recommended === true ? "1" : "0"}`).join("|") : "";
    const digest = createHash("sha256")
      .update([
        projectRoot,
        sourceRoleId,
        metadata?.turnId ?? "",
        metadata?.toolCallId ?? "",
        request.kind,
        request.title,
        options,
      ].join("\u0000"))
      .digest("hex")
      .slice(0, 16);
    return `req-${digest}`;
  }

  /** C 批：系统通知幕僚（按 requestId+event 去重；系统行不是客户卡/不是决定）。返回可等待的落盘链。 */
  private notifyRequest(
    projectRoot: string,
    requestId: string,
    sourceRoleId: string,
    title: string,
    event: "created" | "presented" | "resolved",
    detail?: string,
    after?: Promise<unknown>,
  ): Promise<void> {
    const key = `${requestId}\u0000${event}`;
    if (this.requestNotifiedKeys.has(key)) return Promise.resolve();
    this.requestNotifiedKeys.add(key);
    if (this.requestNotifiedKeys.size > 5000) {
      const oldest = this.requestNotifiedKeys.values().next().value;
      if (oldest !== undefined) this.requestNotifiedKeys.delete(oldest);
    }
    const write = after !== undefined
      ? after.then(() => this.appendTaskState(projectRoot, taskEvent("request.notified", { requestId, to: "chief", event }, () => new Date(this.now()))))
      : this.appendTaskState(projectRoot, taskEvent("request.notified", { requestId, to: "chief", event }, () => new Date(this.now())));
    const labels: Record<typeof event, string> = { created: "已提交", presented: "已呈现", resolved: "已裁决" };
    const text = `[系统·申请] ${labels[event]}：角色「${sourceRoleId}」的申请「${shortenSummary(title, 80)}」（#${requestId}）${detail !== undefined && detail !== "" ? `｜${shortenSummary(detail, 120)}` : ""}。申请保持原发起者与回报链；裁决者以结果来源为准。`;
    try {
      const target = this.chiefTaskRoleIdOf(projectRoot) ?? this.handbackOwnerRoleId(projectRoot) ?? "";
      const targetRuntime = this.findLiveRuntime(projectRoot, target) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
      this.deps.emitEvent({
        roleId: target,
        projectRoot,
        runtime: targetRuntime,
        event: { kind: "message", summary: text, detail: { source: "request-notified" } },
      });
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: sourceRoleId }).error("request.notify.failed", error);
    }
    return write.then(() => undefined, () => undefined);
  }

  private async recordRequestPresented(projectRoot: string, requestId: string, sourceRoleId: string, title: string, to: "customer" | "judge" | "chief", notify = true): Promise<void> {
    const key = `${requestId}\u0000${to}`;
    if (this.requestPresentedKeys.has(key)) return;
    this.requestPresentedKeys.add(key);
    await this.appendTaskState(projectRoot, taskEvent("request.presented", { requestId, to }, () => new Date(this.now())));
    if (notify) await this.notifyRequest(projectRoot, requestId, sourceRoleId, title, "presented", to === "chief" ? "幕僚委托" : to === "judge" ? "判断 agent" : "客户");
  }

  /**
   * C-06（方案 §6.4.1/R2）：`appointment-write` 的**应用侧**事实校验（新路径）。
   *
   * 旧 flow 路径（带合法 `flowId` 且未给 targetRoleId/decisionId）逐字保持既有行为（D 批收敛）。
   * 新路径（无 flow，用 intentId/taskId 归属）必须满足：
   *  · `targetRoleId` 为非内置项目角色、`decisionId` 非空；
   *  · 声明写入路径全部位于 `角色卡/<targetRoleId>/`；
   *  · `.ans/state/tasks.jsonl` 存在对应 D3 `request.resolved`：`decisionId` 相符、`targetRoleIds`
   *    含目标、且 `intentId|taskId` 与本次申请至少一项相符（D3 记录至少带一项）。
   * 任一不满足 ⇒ 返回拒绝原因；调用方**不发卡、不写请求事件、不发行写入路径**（fail-closed）。
   * 本函数只读 `.ans/state/tasks.jsonl`（app-only），不读账本、不写账本。
   */
  private async appointmentWriteApplicationRejection(
    projectRoot: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
  ): Promise<string | undefined> {
    if (request.cardKind !== "appointment-write") return undefined;
    const targetRoleId = typeof metadata?.targetRoleId === "string" ? metadata.targetRoleId.trim() : "";
    const decisionId = typeof metadata?.decisionId === "string" ? metadata.decisionId.trim() : "";
    const rawFlowId = request.flowId ?? metadata?.flowId;
    const legacyFlow = typeof rawFlowId === "string" && rawFlowId.trim() !== "";
    if (legacyFlow && targetRoleId === "" && decisionId === "") return undefined;
    // 新路径必须至少带一个归属键（run-role 同样 fail-closed；应用层在此再兜一次，避免直调包装器绕过）。
    if (!legacyFlow && metadata?.intentId === undefined && metadata?.taskId === undefined) {
      return "appointment-write 新路径缺少归属键（flowId / intentId / taskId 至少一个）；未向客户发卡、未发行任何写入路径。";
    }
    if (targetRoleId === "") {
      return "appointment-write 新路径缺少 targetRoleId（D3 目标项目角色）；未向客户发卡、未发行任何写入路径。";
    }
    if (targetRoleId.includes("/") || targetRoleId.includes("\\") || targetRoleId === "." || targetRoleId === "..") {
      return `appointment-write 的 targetRoleId 非法：${targetRoleId}；未向客户发卡、未发行任何写入路径。`;
    }
    if (isBuiltInGovernanceRoleId(targetRoleId)) {
      return `appointment-write 的 targetRoleId=${targetRoleId} 是内置治理角色/su（禁止）；未向客户发卡、未发行任何写入路径。`;
    }
    if (decisionId === "") {
      return "appointment-write 新路径缺少 decisionId（D3 request.resolved 决定 id）；未向客户发卡、未发行任何写入路径。";
    }
    const paths = declaredConfirmPaths(request);
    if (paths.length === 0) {
      return "appointment-write 必须声明至少一个实际写入路径（paths 或 preview 路径锚点）；未向客户发卡。";
    }
    const prefix = `角色卡/${targetRoleId}/`;
    const outside = paths.filter((rel) => !rel.startsWith(prefix));
    if (outside.length > 0) {
      return (
        `appointment-write 声明路径不在 角色卡/${targetRoleId}/ 之内：${outside.slice(0, 4).join("、")}` +
        `${outside.length > 4 ? ` 等 ${outside.length} 条` : ""}；未向客户发卡、未发行任何写入路径。`
      );
    }
    const state = await this.readTasks(projectRoot);
    // 归属匹配也接受 **flowId**（D3 request.created.flowId）：真实链的人事卡只带 flowId 时，
    // appointment-write 仅凭 flowId+decisionId+targetRoleId 也能对上（不强迫模型猜 intentId/taskId）。
    const requestFlows = new Map<string, string | undefined>();
    for (const event of state.events) {
      if (event.kind === "request.created") requestFlows.set(event.requestId, event.flowId);
    }
    const resolvedEvent = state.events.find((event) => {
      if (event.kind !== "request.resolved") return false;
      const record = event as unknown as {
        decisionId?: unknown;
        targetRoleIds?: unknown;
        intentId?: unknown;
        taskId?: unknown;
      };
      if (record.decisionId !== decisionId) return false;
      if (!Array.isArray(record.targetRoleIds) || !record.targetRoleIds.includes(targetRoleId)) return false;
      const resolvedIntent = typeof record.intentId === "string" ? record.intentId : undefined;
      const resolvedTask = typeof record.taskId === "string" ? record.taskId : undefined;
      const eventFlow = requestFlows.get(event.requestId);
      if (rawFlowId !== undefined && eventFlow !== undefined && eventFlow !== rawFlowId) return false;
      if (metadata?.taskId !== undefined) return resolvedTask === metadata.taskId;
      if (metadata?.intentId !== undefined) return resolvedIntent === metadata.intentId;
      return eventFlow !== undefined || resolvedIntent !== undefined || resolvedTask !== undefined;
    });
    if (resolvedEvent === undefined) {
      return (
        `appointment-write 未找到匹配的 D3 裁决：request.resolved（decisionId=${decisionId}、` +
        `targetRoleIds 含 ${targetRoleId}、intentId/taskId 一致）不存在；未向客户发卡、未发行任何写入路径。` +
        "请先由人事发起 D3 并取得客户/判断裁决后，再逐次写卡。"
      );
    }
    // 2026-10-29（方案 v2.1 §5.4/M11）：D3 若是新链记录（带名单版本/hash），必须与**当前最新名单**一致；
    // 名单已变 ⇒ 旧 D3 作废（需重新发起 D3）。旧记录（无字段）保持既有行为（兼容/回滚测试）。
    if (resolvedEvent.kind === "request.resolved") {
      const stamped = resolvedEvent as { rosterVersion?: unknown; rosterSha256?: unknown };
      if (stamped.rosterVersion !== undefined || stamped.rosterSha256 !== undefined) {
        const rosterFlow = rawFlowId ?? (typeof metadata?.flowId === "string" ? metadata.flowId : undefined) ?? request.flowId;
        if (typeof rosterFlow !== "string" || rosterFlow.trim() === "") {
          return "appointment-write 无法定位最新名单（缺 flowId）；未向客户发卡、未发行任何写入路径。";
        }
        const roster = await loadLatestRoster({ projectRoot, flowId: rosterFlow });
        if (!roster.ok) {
          return (
            `appointment-write 无法读取最新名单（${roster.reason}）；未向客户发卡、未发行任何写入路径。` +
            "请先让策划产出合法名单并重新发起 D3。"
          );
        }
        if (stamped.rosterVersion !== roster.version || stamped.rosterSha256 !== roster.sha256) {
          return (
            `appointment-write 的 D3 对应名单与当前最新名单不一致（D3 v${String(stamped.rosterVersion ?? "?")} / ` +
            `最新 v${roster.version}），旧 D3 已作废；未向客户发卡、未发行任何写入路径。请重新发起 D3 后再写卡。`
          );
        }
        // 2026-10-29（v2.18）：名单未省略 env-bootstrap 时，D3 不得取消它；取消须先出新名单版本并移除 env/entry 模块。
        const rosterHasEnv = roster.roster.roles.some((role) => role.id === ENV_BOOTSTRAP_ROLE_ID);
        const targets = Array.isArray((resolvedEvent as { targetRoleIds?: unknown }).targetRoleIds)
          ? ((resolvedEvent as { targetRoleIds?: unknown[] }).targetRoleIds ?? []).filter((id): id is string => typeof id === "string")
          : [];
        if (
          rosterHasEnv &&
          roster.roster.envBootstrap?.omitted !== true &&
          !targets.includes(ENV_BOOTSTRAP_ROLE_ID)
        ) {
          return (
            `appointment-write 被拒：D3 未选中标准角色 ${ENV_BOOTSTRAP_ROLE_ID}，但当前名单未声明省略理由；` +
            "取消 env-bootstrap 须先出带 envBootstrapOmittedReason 的新名单版本并移除 env/entry 模块，再重新发起 D3。"
          );
        }
      }
    }
    return undefined;
  }

  /**
   * 2026-10-29（方案 v2.1 §5.1/Q6 A）：验收卡最小链事实（应用侧补充 judgeContext.facts）。
   * 只读：产品意图文档 / 最新名单 / 最新 D3 裁决 / 质检报告；任一缺失 ⇒ unavailableReason（judge 回落手动）。
   * 不伪造事实、不改变客户/判断的最终验收权。
   */
  private async enrichAcceptanceJudgeContext(
    projectRoot: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    sourceRoleId: string,
  ): Promise<{ metadata: CustomerInputMetadata | undefined; display?: AcceptanceReportDisplayV1 }> {
    const flowId = request.flowId ?? metadata?.flowId;
    if (typeof flowId !== "string" || flowId.trim() === "") return { metadata }; // 无 flowId：沿用既有早退；不构造/不读取/不显示
    // 2026-11-02 acceptance-return-card（P1-ARC-04/N1）：构造 docs/quality 路径前先做本地 slug 校验；
    // 非法非空 flowId 不构造/不读取任何项目路径，返回 fail-closed judgeContext。
    if (!new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: sourceRoleId }).record(
        "acceptance.card.report.display",
        { ok: false, reasonCode: "flow-id-invalid" },
      );
      return {
        metadata: {
          ...(metadata ?? {}),
          judgeContext: {
            flowId,
            facts: {
              governanceModel: "trio",
              flowId,
              ledgerErrors: 0,
              unresolvedClarificationCount: 0,
              latestDecisionKinds: [],
            },
            unavailableReason: "验收最小链事实缺失：质检报告（flowId 不合法，未读取报告）",
          },
        },
      };
    }
    const activeRun = await findActiveRun(projectRoot, flowId);
    const pinnedRun = activeRun.ok && activeRun.manifest !== null && activeRun.manifest.state === "pinned" ? activeRun.manifest : undefined;
    // 2026-11-01（acceptance-evidence-path，方案 P1.2 §2.2/§3.1）：验收判断的提案物证路径。
    // pinned run 以 manifest `documents.proposal.path`（trim 后非空）为唯一路径；pinned 但无 proposal ⇒ 缺失，不回退扫描。
    // 无 pin 复用共享解析 `readIntentEntryFacts` 取最新 `docs/proposals/<flowId>-proposal-vN.md`（别名不参与）；不另写扫描。
    const pinnedProposalPath = pinnedRun?.documents.proposal?.path?.trim();
    const proposalRel =
      pinnedRun !== undefined
        ? (pinnedProposalPath !== undefined && pinnedProposalPath !== "" ? pinnedProposalPath : undefined)
        : (await readIntentEntryFacts({ projectRoot, flowId })).proposalPath;
    const intentRel = pinnedRun?.documents.intent?.path ?? `docs/product/${flowId}-intent-v1.md`;
    const reportRel = `docs/quality/${flowId}-report-v1.md`;
    const readText = async (rel: string): Promise<string | undefined> => {
      try {
        return await fs.promises.readFile(path.join(projectRoot, rel), "utf8");
      } catch {
        return undefined;
      }
    };
    const intentText = await readText(intentRel);
    const intentOk = intentText !== undefined && intentText.trim() !== "" && /^#/m.test(intentText);
    const roster = pinnedRun !== undefined ? await loadPinnedRoster(projectRoot, pinnedRun) : await loadLatestRoster({ projectRoot, flowId });
    // 2026-10-29（v2.6/R2）：验收卡可引用模块（moduleId）；应用按最新名单核对并把模块事实放进 facts。
    const acceptanceModuleId = typeof metadata?.moduleId === "string" ? metadata.moduleId.trim() : "";
    const acceptanceModule =
      acceptanceModuleId !== "" && roster.ok ? roster.roster.modules.find((module) => module.id === acceptanceModuleId) : undefined;
    const acceptanceModuleOwner =
      acceptanceModule !== undefined && roster.ok
        ? roster.roster.roles.find((role) => role.modules.includes(acceptanceModule.id))?.id
        : undefined;
    const acceptanceModulePaths =
      acceptanceModule !== undefined
        ? acceptanceModule.paths
        : Array.isArray(metadata?.modulePaths)
          ? metadata.modulePaths
          : undefined;
    const reportText = await readText(reportRel);
    const reportOk = reportText !== undefined && reportText.trim() !== "";
    // 2026-11-02 acceptance-return-card（C2/C3）：复用上面已有读取，只做 16 KiB 安全投影；
    // 投影失败/报告缺失只省略 display，不影响卡片呈现与判断。诊断只记白名单元数据，不记正文/凭据。
    const displayDiagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: sourceRoleId });
    let display: AcceptanceReportDisplayV1 | undefined;
    if (reportOk && reportText !== undefined) {
      try {
        const credentialEnvNames = [
          ...(this.deps.runtimeOptions?.extraCredentialEnvVars ?? []),
          ...(this.deps.runtimeOptions?.apiKeyEnvVar ? [this.deps.runtimeOptions.apiKeyEnvVar] : []),
        ];
        const text = createToolDisplayContext({ credentialEnvNames }).protectText(reportText, 16384);
        display = { version: 1, path: reportRel, text };
        displayDiagnostic.record("acceptance.card.report.display", {
          ok: true,
          path: reportRel,
          bytes: Buffer.byteLength(reportText, "utf8"),
          state: text.truncated
            ? (text.redacted ? "truncated+redacted" : "truncated")
            : (text.redacted ? "redacted" : "plain"),
        });
      } catch {
        display = undefined;
        displayDiagnostic.record("acceptance.card.report.display", { ok: false, path: reportRel, reasonCode: "projection-failed" });
      }
    } else {
      displayDiagnostic.record("acceptance.card.report.display", { ok: false, path: reportRel, reasonCode: "report-missing" });
    }
    // 最新 D3（appointment 裁决）及 decisionId。
    const state = await this.readTasks(projectRoot);
    const requestFlows = new Map<string, string | undefined>();
    for (const event of state.events) {
      if (event.kind === "request.created") requestFlows.set(event.requestId, event.flowId);
    }
    let d3: { decisionId?: string; at: string } | undefined;
    for (const event of state.events) {
      if (event.kind !== "request.resolved") continue;
      const eventFlow = requestFlows.get(event.requestId);
      if (eventFlow !== undefined && eventFlow !== flowId) continue;
      if (event.decisionId === undefined) continue;
      if (event.rosterVersion === undefined && event.rosterSha256 === undefined) continue; // 仅新链 D3
      if (d3 === undefined || event.at > d3.at) d3 = { decisionId: event.decisionId, at: event.at };
    }
    const hasLegacyFlowTask = [...state.records.values()].some(
      (record) => record.created?.flowId === flowId && record.created.runId === undefined,
    );
    const criteriaRef = metadata?.criteriaRef;
    const factInputs = Array.isArray(metadata?.acceptanceFacts) ? metadata.acceptanceFacts : [];
    let criteriaDoc: Awaited<ReturnType<typeof loadCriteria>> | undefined;
    const evidenceFacts: import("../../src/model/runtime.ts").AcceptanceFact[] = [];
    const evidenceMismatch: string[] = [];
    if (criteriaRef !== undefined) {
      criteriaDoc = await loadCriteria(projectRoot, flowId, criteriaRef);
      if (!criteriaDoc.ok) {
        evidenceMismatch.push(`${criteriaDoc.code}：${criteriaDoc.rejection.missing.join("；")}`);
      } else {
        for (const factInput of factInputs) {
          const derived = deriveAcceptanceFact(criteriaDoc.doc, {
            acId: factInput.acId,
            ...(factInput.artifact !== undefined ? { artifact: factInput.artifact } : {}),
            ...(factInput.metaPath !== undefined ? { metaPath: factInput.metaPath } : {}),
          });
          if ("ok" in derived) {
            evidenceMismatch.push(`${derived.code}：${derived.rejection.missing.join("；")}`);
            continue;
          }
          if (factInput.artifact !== undefined) {
            const checked = await checkEvidence({
              projectRoot,
              acId: factInput.acId,
              criteria: criteriaDoc.doc,
              artifact: factInput.artifact,
              ...(factInput.metaPath !== undefined ? { metaPath: factInput.metaPath } : {}),
            });
            evidenceFacts.push({
              ...derived,
              valid: checked.valid,
              unverified: checked.unverified,
              legacy: checked.legacy,
              mismatch: checked.mismatch,
            });
            if (checked.mismatch.length > 0) evidenceMismatch.push(...checked.mismatch);
          } else {
            evidenceFacts.push(derived);
          }
        }
      }
    }
    const missing: string[] = [
      ...(intentOk ? [] : ["产品意图文档"]),
      ...(roster.ok ? [] : ["人员名单"]),
      ...(d3?.decisionId !== undefined ? [] : ["D3 裁决"]),
      ...(reportOk ? [] : ["质检报告"]),
      ...(acceptanceModuleId !== "" && acceptanceModule === undefined ? ["模块（最新名单未找到）"] : []),
      ...(criteriaRef === undefined && factInputs.length > 0 ? ["criteriaRef（验收 criteria 未显式引用，P0 未机器校验）"] : []),
      ...(criteriaDoc !== undefined && !criteriaDoc.ok ? [`criteria（${criteriaDoc.code}）`] : []),
      ...(evidenceMismatch.length > 0 ? ["证据自洽（evidence-mismatch）"] : []),
    ];
    const baseContext = metadata?.judgeContext;
    const facts = {
      ...(baseContext?.facts ?? {
        governanceModel: "trio" as const,
        flowId,
        ledgerErrors: 0,
        unresolvedClarificationCount: 0,
        latestDecisionKinds: [] as string[],
      }),
      ...(intentOk ? { intentDocumentPath: intentRel } : {}),
      ...(roster.ok ? { rosterVersion: roster.version, rosterSha256: roster.sha256 } : {}),
      ...(pinnedRun?.d3?.decisionId !== undefined
        ? { appointmentDecisionId: pinnedRun.d3.decisionId }
        : d3?.decisionId !== undefined
          ? { appointmentDecisionId: d3.decisionId }
          : {}),
      ...(reportOk ? { qualityReportPath: reportRel } : {}),
      ...(pinnedRun !== undefined
        ? { runId: pinnedRun.runId, runState: "pinned" as const, pinnedDocs: pinnedDocsSummary(pinnedRun) }
        : hasLegacyFlowTask
          ? { runState: "legacy" as const }
          : {}),
      ...(criteriaRef !== undefined ? { criteriaRef } : {}),
      ...(evidenceFacts.length > 0 ? { acceptanceFacts: evidenceFacts } : {}),
      ...(evidenceMismatch.length > 0 ? { evidenceMismatch } : {}),
      ...(acceptanceModule !== undefined
        ? {
            moduleId: acceptanceModule.id,
            moduleDirectory: acceptanceModule.path,
            ...(acceptanceModulePaths !== undefined ? { modulePaths: [...acceptanceModulePaths] } : {}),
            ...(acceptanceModuleOwner !== undefined ? { moduleOwnerRoleId: acceptanceModuleOwner } : {}),
          }
        : {}),
    };
    const judgeContext: GovernanceJudgeContext = {
      ...(baseContext ?? { flowId }),
      flowId,
      facts,
      ...(missing.length > 0
        ? { unavailableReason: `验收最小链事实缺失：${missing.join("、")}${roster.ok ? "" : `（${roster.reason}）`}` }
        : {}),
      artifacts: {
        ...(baseContext?.artifacts ?? {}),
        // 显式覆盖继承的旧值；`proposalRel === undefined` 时也不得保留旧值（证据包按缺失 fail-closed）。
        proposalPath: proposalRel,
        acceptanceReportPath: reportRel,
      },
    };
    return {
      metadata: { ...(metadata ?? {}), judgeContext },
      ...(display !== undefined ? { display } : {}),
    };
  }

  /**
   * C 批：申请生命周期（created → presented(customer|judge) → resolved → notified 幕僚）。
   * 只记录/通知，不改变通道裁决；工具调用结束后结果仍原样返回发起角色。
   */
  private async withRequestLifecycle(
    projectRoot: string,
    sourceRoleId: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    raw: (request: CustomerInputRequest, context: Parameters<DesktopCustomerInputFn>[1], metadata?: CustomerInputMetadata) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined,
    buildContext: (request: CustomerInputRequest, extras?: { onPresented?: () => void; acceptanceReport?: AcceptanceReportDisplayV1; judgeNotice?: string }) => Parameters<DesktopCustomerInputFn>[1],
    requestIdOverride?: string,
    lifecycle?: {
      notify?: "default" | "resolved-only" | "none";
      signal?: AbortSignal;
      /** 下载卡事实不可用时附在客户卡上的提示（其他卡种不传）。 */
      judgeNotice?: string;
      /** 卡片实际呈现（客户或 judge）后回调一次（下载 presenter 用它上报 requestId）。 */
      onPresented?: () => void;
    },
  ): Promise<CustomerInputOutcome | null | undefined> {
    // 2026-10-29（Q6 A）：验收卡的最小链事实由应用补充（产品意图/名单/D3/质检报告）。
    // 2026-11-02 acceptance-return-card（C2）：同一次读取的 16 KiB 安全投影随 ctx 送渲染层。
    let acceptanceReport: AcceptanceReportDisplayV1 | undefined;
    if (request.cardKind === "acceptance") {
      const enriched = await this.enrichAcceptanceJudgeContext(projectRoot, request, metadata, sourceRoleId);
      metadata = enriched.metadata;
      acceptanceReport = enriched.display;
    }
    // T3 B3（AC-13/§8.1–§8.3）：fixed 卡的应用绑定——`documentRefs`（应用计算 path+sha256[+version]）、
    // `workflowId`/`stage` 戳、任命卡选项=名单/multiple/推荐集=名单顺序、验收卡抑制。模式按本卡实际
    // flowId 现场解析（per-flow，不缓存）；绑定失败 ⇒ notPresented（不发卡、不写账本、不冒充客户拒绝）。
    // **只对 3 张 fixed 卡 + acceptance 卡**做模式解析：其他卡种（decision/download/stable-write/
    // merge-main/appointment-write 等）保持既有呈现时序（零新增 await；legacy 卡路径逐字不变）。
    let fixedCardBinding: { workflowId?: string; stage?: WorkflowStage; documentRefs?: WorkflowDocumentRef[] } | undefined;
    const cardFlowId = request.flowId ?? metadata?.flowId;
    const fixedCardKind = request.cardKind === "intent-confirm" || request.cardKind === "proposal"
      || request.cardKind === "appointment" || request.cardKind === "acceptance";
    const cardFixed = fixedCardKind
      && typeof cardFlowId === "string" && cardFlowId.trim() !== ""
      && (await resolveFixedPathMode(projectRoot, cardFlowId.trim())) === "fixed";
    if (cardFixed) {
      const fixedFlowId = cardFlowId!.trim();
      const rejectFixedCard = (code: string, message: string): CustomerInputOutcome => {
        this.appendRoleActivity(projectRoot, sourceRoleId, {
          kind: "request.rejected",
          summary: shortenSummary(`${code}：${message}`, 200),
          status: "not-presented",
        });
        return { outcome: "declined", notPresented: true, reason: `${code}：${message}` };
      };
      if (request.cardKind === "acceptance") {
        // Q1：固定路径**不发** acceptance 卡（legacy 保留；验收 = 独立质检 + 幕僚决策 + 应用归档）。
        return rejectFixedCard("acceptance-card-suppressed", "固定路径不发验收卡：验收报告由验收角色提交，应用生成 docs/acceptance 归档。");
      }
      const fixedWorkflowId = await activeFixedWorkflowIdFor(projectRoot, fixedFlowId);
      if (request.cardKind === "intent-confirm") {
        const prepared = await prepareFixedIntent({ projectRoot, flowId: fixedFlowId });
        if (!prepared.ok) return rejectFixedCard(prepared.code, prepared.message);
        fixedCardBinding = {
          ...(fixedWorkflowId !== undefined ? { workflowId: fixedWorkflowId } : {}),
          stage: "A3",
          documentRefs: prepared.documentRefs,
        };
        // T3 B3.1（去重）：run-role 已在 fixed intent-confirm 调用同一个 `prepareIntent` 并把 marker
        // 追加到 `question`（同一 marker 字符串）。桌面只在卡面尚未携带该 marker 时补一次——
        // `prepareIntent` 本身幂等（A3 在办即跳过 `stage.requested`），但 marker 不得重复追加。
        const requestQuestion = (request as { question?: unknown }).question;
        const cardText = `${typeof requestQuestion === "string" ? requestQuestion : ""}\n${request.preview ?? ""}`;
        if (!cardText.includes(prepared.marker)) {
          const priorPreview = request.preview ?? "";
          request = { ...request, preview: `${priorPreview}${priorPreview !== "" ? "\n\n" : ""}${prepared.marker}` };
        }
      } else if (request.cardKind === "proposal") {
        const refs = await this.collectFixedProposalDocumentRefs(projectRoot, fixedFlowId);
        if (!refs.ok) return rejectFixedCard(refs.code, refs.message);
        // T3 B5.1/B15.2（G-B5-3，AC-08/AC-13；v1.3 §4.2 A6）：**呈卡前**写 `stage.requested A6`
        // （幂等 `stage-request:<wf>:A6:<attempt>`，requestDigest=方案依据（proposal）字节 sha256）。
        // B15.2（RR10）：fail-closed——无活动 workflow、A5 未 completed、A6 在办/已完成均拒绝发卡；
        // 否则客户 accept 后 `stage.completed A6`（要求 view.stage==="A6"）无法落账，且会重复弹卡。
        const proposalRef = refs.refs.find((ref) => ref.kind === "proposal");
        if (proposalRef?.sha256 === undefined) {
          return rejectFixedCard("proposal-document-missing", "方案卡绑定缺少 proposal sha256（不发卡）。");
        }
        if (fixedWorkflowId === undefined) {
          return rejectFixedCard("workflow-not-found", "方案卡不可呈：flow 没有活动 fixed workflow（不发卡）。");
        }
        const marker = await markFixedProposalCardRequested({
          projectRoot,
          flowId: fixedFlowId,
          workflowId: fixedWorkflowId,
          proposalSha256: proposalRef.sha256,
        });
        if (marker !== undefined) return rejectFixedCard(marker.code, marker.message);
        fixedCardBinding = {
          workflowId: fixedWorkflowId,
          stage: "A6",
          documentRefs: refs.refs,
        };
      } else if (request.cardKind === "appointment") {
        const appointment = await this.prepareFixedAppointmentCardRequest(projectRoot, fixedFlowId, request);
        if (!appointment.ok) return rejectFixedCard(appointment.code, appointment.message);
        request = appointment.request;
        fixedCardBinding = {
          ...(fixedWorkflowId !== undefined ? { workflowId: fixedWorkflowId } : {}),
          stage: "A10",
          documentRefs: [appointment.rosterRef],
        };
        // T3 B3.1（A10 在办标记单一写入方）：`stage.requested A10` 由 run-role 在呈卡前经
        // `stage-request:<wf>:A10:1` 幂等写入（编排 B3.1）；桌面**不重复写**任何 stage/事件——
        // 这里只做卡面绑定，裁决后的 `stage.completed A10` 由 `recordFixedCardWorkflowResolution` 唯一追加。
      }
    }
    // 2026-10-31（run-change 触发）：冻结 run 上出现比 pin 更新的提案卡 ⇒ 先尝试 run-change 卡，
    // 本提案卡以 run-change-required 三段式拒发（未呈现；不冒充客户拒绝、不改冻结语义）。
    // T3 B3：fixed 路径**不调用** legacy `proposalCardFrozenRejection`（run pin 不存在；由 documentRefs 绑定替代）。
    if (request.cardKind === "proposal" && !cardFixed) {
      const frozen = await this.proposalCardFrozenRejection(projectRoot, request, metadata, sourceRoleId);
      if (frozen !== undefined) {
        const formatted = formatMechanicalRejection(frozen.rejection);
        this.appendRoleActivity(projectRoot, sourceRoleId, {
          kind: "request.rejected",
          summary: shortenSummary(`run-change-required：${frozen.rejection.missing.join("；")}`, 200),
          status: "not-presented",
        });
        return { outcome: "declined", notPresented: true, reason: formatted };
      }
    }
    const requestId = requestIdOverride ?? this.requestIdFor(projectRoot, sourceRoleId, request, metadata);
    const options = request.kind === "choice"
      ? request.options.map((option) => ({ id: option.id, label: option.label, ...(option.recommended === true ? { recommended: true } : {}) }))
      : [];
    // C-06：appointment-write 先在应用层校验 D3 事实；失败**不创建请求事件/不呈现卡片**（fail-closed）。
    if (request.cardKind === "appointment-write") {
      const rejection = await this.appointmentWriteApplicationRejection(projectRoot, request, metadata);
      if (rejection !== undefined) {
        this.appendRoleActivity(projectRoot, sourceRoleId, {
          kind: "request.rejected",
          summary: rejection,
          status: "not-presented",
        });
        return { outcome: "declined", notPresented: true, reason: rejection };
      }
    }
    // **呈现不得等待落盘**（D1「调用即呈现」+ 同一轮 signal 身份）：事件写入先发起、后串行收口，
    // 但 `raw`（客户卡通道）在首次 await 前同步调用——否则调用方会在卡片出现前看到 pending 空档，
    // 会话被释放时还会把原本有效的轮次 signal 误判为已中止。落盘顺序仍为
    // created → approval.created → presented → resolved（每一步 `.then` 接力）。
    const createdWrite = this.appendTaskState(projectRoot, taskEvent("request.created", {
      requestId,
      ...(request.flowId !== undefined ? { flowId: request.flowId } : {}),
      // 2026-10-31（D3 卡种收口）：卡种由应用从 request 对象落账（不信任模型/judge 自报）。
      ...(request.cardKind !== undefined ? { cardKind: request.cardKind } : {}),
      // T3 B3（AC-13）：fixed 卡的应用绑定（documentRefs 由应用计算；workflowId/stage 戳）。
      ...(fixedCardBinding?.documentRefs !== undefined ? { documentRefs: fixedCardBinding.documentRefs } : {}),
      ...(fixedCardBinding?.workflowId !== undefined ? { workflowId: fixedCardBinding.workflowId } : {}),
      ...(fixedCardBinding?.stage !== undefined ? { stage: fixedCardBinding.stage } : {}),
      ...(metadata?.intentId !== undefined ? { intentId: metadata.intentId } : {}),
      ...(metadata?.taskId !== undefined ? { taskId: metadata.taskId } : {}),
      sourceRoleId,
      title: request.title,
      ...(request.kind === "choice" && request.question !== undefined ? { context: request.question } : {}),
      options,
      ...(options.some((option) => option.recommended === true) ? { recommended: options.filter((option) => option.recommended === true).map((option) => option.id) } : {}),
    }, () => new Date(this.now())));
    const approvalWrite = request.cardKind === "appointment-write"
      ? createdWrite.then(() => this.appendTaskState(projectRoot, taskEvent("approval.created", {
          approvalId: requestId,
          sourceRoleId,
          approvalKind: "appointment-write",
          summary: shortenSummary(request.title, 200),
          ...(request.kind === "confirm" && request.paths !== undefined ? { declaredPaths: [...request.paths] } : {}),
          ...(metadata?.toolCallId !== undefined ? { toolCallId: metadata.toolCallId } : {}),
          ...(metadata?.turnId !== undefined ? { turnId: metadata.turnId } : {}),
        }, () => new Date(this.now()))))
      : Promise.resolve(true);
    const notifyMode = lifecycle?.notify ?? "default";
    const notifyCreated = notifyMode === "default";
    const notifyResolved = notifyMode !== "none";
    const abortSignal = lifecycle?.signal;
    let aborted = abortSignal?.aborted === true;
    let abortListener: (() => void) | undefined;
    const abortPromise: Promise<"aborted"> | undefined = abortSignal === undefined
      ? undefined
      : new Promise<"aborted">((resolve) => {
          if (abortSignal.aborted) {
            aborted = true;
            resolve("aborted");
            return;
          }
          abortListener = () => {
            aborted = true;
            resolve("aborted");
          };
          abortSignal.addEventListener("abort", abortListener, { once: true });
        });
    const createdNotify = notifyCreated
      ? this.notifyRequest(projectRoot, requestId, sourceRoleId, request.title, "created", undefined, createdWrite)
      : Promise.resolve();
    let presented = false;
    let presentedWrite: Promise<void> | null = null;
    let presentedNotified = false;
    const notifyPresented = (): void => {
      if (presentedNotified) return;
      presentedNotified = true;
      try {
        lifecycle?.onPresented?.();
      } catch {
        // 呈现回调只服务审计/下载 presenter 的 requestId 上报；异常不得影响已完成的呈现/结算。
      }
    };
    const markPresented = (to: "customer" | "judge" | "chief"): Promise<void> => {
      if (aborted) return Promise.resolve();
      if (presentedWrite !== null) return presentedWrite;
      presented = true;
      presentedWrite = createdWrite.then(() => this.recordRequestPresented(projectRoot, requestId, sourceRoleId, request.title, to, notifyCreated));
      return presentedWrite;
    };
    const context = buildContext(request, {
      onPresented: () => {
        void markPresented("customer");
        notifyPresented();
      },
      ...(acceptanceReport !== undefined ? { acceptanceReport } : {}),
      ...(lifecycle?.judgeNotice !== undefined ? { judgeNotice: lifecycle.judgeNotice } : {}),
    });
    context.requestId = requestId;
    const abortedOutcome: CustomerInputOutcome = {
      outcome: "declined",
      operatorId: "system:initiator-aborted",
      reason: "initiator-aborted",
      notPresented: true,
    };
    const appendAborted = async (): Promise<void> => {
      await createdWrite;
      if (presentedWrite !== null) await presentedWrite;
      if (await createdWrite) {
        await this.appendTaskState(projectRoot, taskEvent("request.orphaned", { requestId, reason: "initiator-aborted" }, () => new Date(this.now())));
      }
    };
    let out: CustomerInputOutcome | null | undefined;
    let abortedBeforeSettle = false;
    try {
      let rawPromise: Promise<CustomerInputOutcome | null | undefined>;
      try {
        rawPromise = Promise.resolve(raw(request, context, metadata));
      } catch (error) {
        rawPromise = Promise.reject(error);
      }
      if (abortPromise !== undefined) {
        const winner = await Promise.race([
          rawPromise.then((value) => ({ kind: "outcome" as const, value })),
          abortPromise.then(() => ({ kind: "aborted" as const })),
        ]);
        if (winner.kind === "aborted") {
          abortedBeforeSettle = true;
          // 晚到答案只进诊断；不等待、不写 resolved、不执行。
          void rawPromise.catch(() => undefined);
          createDiagnosticLogger({ component: "desktop.session", projectRoot }).record("request.aborted", { requestId, sourceRoleId });
        } else {
          out = winner.value;
        }
      } else {
        out = await rawPromise;
      }
    } catch (error) {
      if (aborted || abortSignal?.aborted === true) {
        await appendAborted();
        throw error;
      }
      await createdWrite;
      await createdNotify;
      if (presentedWrite !== null) await presentedWrite;
      await this.appendTaskState(projectRoot, taskEvent("request.resolved", {
        requestId,
        ...(request.cardKind !== undefined ? { cardKind: request.cardKind } : {}),
        by: "customer",
        choice: "unavailable",
        reason: shortenSummary(error instanceof Error ? error.message : String(error), 200),
      }, () => new Date(this.now())));
      if (notifyResolved) await this.notifyRequest(projectRoot, requestId, sourceRoleId, request.title, "resolved", "通道异常（未执行）");
      throw error;
    } finally {
      if (abortListener !== undefined) abortSignal?.removeEventListener("abort", abortListener);
    }
    if (abortedBeforeSettle) {
      await appendAborted();
      return abortedOutcome;
    }
    await createdWrite;
    await approvalWrite;
    await createdNotify;
    if (aborted || abortSignal?.aborted === true) {
      await appendAborted();
      return abortedOutcome;
    }
    const chiefSource = out !== null && out !== undefined && out.outcome !== "unavailable"
      && out.actionSource?.kind === "chief-delegated" ? out.actionSource : undefined;
    const answeredOut = out !== null && out !== undefined && out.outcome === "answered" ? out : undefined;
    const operatorId = out !== null && out !== undefined && "operatorId" in out && typeof out.operatorId === "string" ? out.operatorId : undefined;
    // Q9 A（2026-11-03）：指令归属只从 `operatorId:"directive:<id>"` 解析；不伪造 `request.presented.to`
    // （W-6：presented 仍仅 customer/judge；指令代选/拒绝在呈现之前完成）。
    const directiveId = directiveIdFromOperatorId(operatorId);
    const judgeOrigin =
      directiveId === undefined && typeof operatorId === "string" && operatorId.startsWith("judge:");
    const judged =
      directiveId === undefined &&
      answeredOut !== undefined &&
      (answeredOut.judge !== undefined || judgeOrigin);
    // 2026-11-04 下载申请（AC-21）：下载卡的 judge **deny** 也是 judge 归属（declined 路径原先只认
    // answered，会误写成 customer 且不记 presented）。限定 cardKind==="download"，其他卡种行为不变。
    const downloadJudge = request.cardKind === "download" && judgeOrigin;
    const resolvedByJudge = judged || downloadJudge;
    if (chiefSource !== undefined && !presented) {
      await markPresented("chief");
      notifyPresented();
    } else if (resolvedByJudge && !presented && (answeredOut !== undefined || downloadJudge)) {
      await markPresented("judge");
      notifyPresented();
    } else if (presentedWrite !== null) await presentedWrite;
    const choice = answeredOut !== undefined
      ? (answeredOut.value.confirmed === true ? "confirmed" : answeredOut.value.confirmed === false ? "denied" : (answeredOut.value.selected ?? []).join(",") || "answered")
      : out?.outcome ?? "unavailable";
    const selected = answeredOut?.value.selected ?? [];
    // 2026-10-29（方案 v2.1 §5.4/M4/M11）：裁决 id 回填给工具回执（appointment-write 的凭据）；
    // 招人卡同时记录**当前最新名单**的版本与 hash（应用计算，模型不可自报）。
    const decisionId = answeredOut !== undefined && chiefSource === undefined ? `decision-${requestId}` : undefined;
    if (answeredOut !== undefined && chiefSource !== undefined) delete answeredOut.decisionId;
    if (answeredOut !== undefined && decisionId !== undefined) answeredOut.decisionId = decisionId;
    let rosterStamp: { rosterVersion?: number; rosterSha256?: string } = {};
    if (request.cardKind === "appointment" && answeredOut !== undefined) {
      const rosterFlow = request.flowId ?? metadata?.flowId;
      if (typeof rosterFlow === "string" && rosterFlow.trim() !== "") {
        const roster = await loadLatestRoster({ projectRoot, flowId: rosterFlow });
        if (roster.ok) rosterStamp = { rosterVersion: roster.version, rosterSha256: roster.sha256 };
      }
    }
    const resolvedEvent = taskEvent("request.resolved", {
      requestId,
      ...(decisionId !== undefined ? { decisionId } : {}),
      // T3 B3：fixed appointment 决议**不带 legacy roster 戳**（结构性不可被 legacy D3 reader 当作 D3
      // 证据）；固定 Appointment 以 `workflowId`/`stage:"A10"` 标记（AC-13/G-10）。
      ...(request.cardKind === "appointment" && !cardFixed ? rosterStamp : {}),
      // 2026-10-31（D3 卡种收口）：只有 appointment（D3 招人）卡的选中项是角色集；其他 choice 卡
      // （decision/intent-confirm/proposal/acceptance/普通卡）只写审计字段 selectedOptionIds，
      // 防止选项 id（如 customer-local）污染 targetRoleIds 而被 D3 扫描误读。
      ...(request.cardKind !== undefined ? { cardKind: request.cardKind } : {}),
      ...(fixedCardBinding?.documentRefs !== undefined ? { documentRefs: fixedCardBinding.documentRefs } : {}),
      ...(fixedCardBinding?.workflowId !== undefined ? { workflowId: fixedCardBinding.workflowId } : {}),
      ...(fixedCardBinding?.stage !== undefined ? { stage: fixedCardBinding.stage } : {}),
      // T3 B3.1（AC-13/§8.3；运行时核心 B3.1 类型）：fixed 任命决议**原样**落 `source:"stage-a10"`。
      // 应用写入（不信任模型/判断自报）；legacy 任命决议无此字段——legacy D3 读取方不接受该来源
      // （`chainDispatchFacts` 显式排除；固定决议另有 `workflowId` 戳与省略 roster 戳双重隔离）。
      ...(cardFixed && request.cardKind === "appointment" ? { source: "stage-a10" as const } : {}),
      ...(selected.length > 0 && request.cardKind === "appointment" ? { targetRoleIds: selected } : {}),
      ...(selected.length > 0 && request.cardKind !== "appointment" ? { selectedOptionIds: selected } : {}),
      ...(metadata?.intentId !== undefined ? { intentId: metadata.intentId } : {}),
      ...(metadata?.taskId !== undefined ? { taskId: metadata.taskId } : {}),
      by: chiefSource !== undefined ? "chief-delegated" : directiveId !== undefined ? "directive" : resolvedByJudge ? "judge" : "customer",
      ...(chiefSource !== undefined ? { actionSource: chiefSource } : {}),
      ...(directiveId !== undefined ? { directiveId } : {}),
      ...(operatorId !== undefined ? { operatorId } : {}),
      choice,
      ...(out?.outcome === "declined" && out.reason !== undefined ? { reason: shortenSummary(out.reason, 200) } : {}),
      ...(judged && answeredOut?.judge !== undefined ? { judge: answeredOut.judge } : {}),
    }, () => new Date(this.now()));
    await this.appendTaskState(projectRoot, resolvedEvent);
    // T3 B3（AC-08/AC-13）：fixed 卡裁决 → 工作流阶段事件（A3/A6/A10；应用唯一实现）。
    // 失败只诊断/系统行（不重写 request.resolved、不阻塞已完成的客户决定）。
    if (cardFixed && fixedCardBinding?.workflowId !== undefined) {
      await this.recordFixedCardWorkflowResolution({
        projectRoot,
        sourceRoleId,
        flowId: cardFlowId!.trim(),
        workflowId: fixedCardBinding.workflowId,
        requestId,
        resolvedEvent,
        answered: answeredOut !== undefined,
        judged: resolvedByJudge,
        documentRefs: fixedCardBinding.documentRefs ?? [],
      });
    }
    if (request.cardKind === "appointment-write") {
      await this.appendTaskState(projectRoot, taskEvent("approval.resolved", {
        approvalId: requestId,
        by: judged ? "judge" : "customer",
        ...(operatorId !== undefined ? { operatorId } : {}),
        decision: choice,
        ...(out?.outcome === "declined" && out.reason !== undefined ? { reason: shortenSummary(out.reason, 200) } : {}),
        ...(judged && answeredOut?.judge !== undefined ? { judge: answeredOut.judge } : {}),
      }, () => new Date(this.now())));
    }
    if (notifyResolved) await this.notifyRequest(projectRoot, requestId, sourceRoleId, request.title, "resolved", resolvedByJudge ? `判断代批：${choice}` : choice);
    return out;
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async readRoleActivityLog(projectRoot: string, query: RoleActivityLogPayload): Promise<WatchdogToolResult> {
    return this.tasks.readRoleActivityLog(projectRoot, query);
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async listTasks(projectRoot: string): Promise<TaskListView> {
    return this.tasks.listTasks(projectRoot);
  }

  // —————————————— 2026-11-02：全局任务状态 / 版本决策（A2） ——————————————

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async projectStateView(projectRoot: string, scope: { roleId?: string; viewerRoleId?: string; full?: boolean; flowId?: string; now?: Date } = {}): Promise<ProjectStateView> {
    return this.tasks.projectStateView(projectRoot, scope);
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private async projectStateTool(projectRoot: string, roleId: string, query: { flowId?: string }): Promise<ProjectStateToolResult> {
    return this.tasks.projectStateTool(projectRoot, roleId, query);
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async projectNote(input: { projectRoot: string; roleId: string; input: ProjectNoteInput }): Promise<ProjectNoteResult> {
    return this.tasks.projectNote(input);
  }

  private versionDecisionSubjectKey(projectRoot: string, subject: VersionDecisionRequestSubject): string {
    return `${projectRoot}\u0000${subject.flowId}\u0000${subject.runId ?? ""}`;
  }

  /** 与 A1 `versionDecisionAttempt` 同口径的结构化匹配（runId/flowId 前缀碰撞防护）。 */
  private isVersionDecisionRequestIdForSubject(requestId: string, subject: VersionDecisionRequestSubject): boolean {
    const prefix = subject.runId !== undefined
      ? `version-decision-${subject.runId}-`
      : `version-decision-flow-${subject.flowId}-`;
    if (!requestId.startsWith(prefix)) return false;
    const parts = requestId.slice(prefix.length).split("-");
    return parts.length === 2 && /^[a-z0-9]+$/.test(parts[0]!) && /^[0-9a-f]{8}$/.test(parts[1]!);
  }

  private findPendingVersionDecision(events: readonly TaskStateEvent[], flowId: string, subject: VersionDecisionRequestSubject): string | undefined {
    const resolved = new Set<string>();
    const orphaned = new Set<string>();
    for (const event of events) {
      if (event.kind === "request.resolved") resolved.add(event.requestId);
      else if (event.kind === "request.orphaned") orphaned.add(event.requestId);
    }
    for (const event of events) {
      if (event.kind !== "request.created" || event.flowId !== flowId) continue;
      if (!this.isVersionDecisionRequestIdForSubject(event.requestId, subject)) continue;
      if (resolved.has(event.requestId) || orphaned.has(event.requestId)) continue;
      return event.requestId;
    }
    return undefined;
  }

  private pendingRequestIdsForFlow(events: readonly TaskStateEvent[], flowId: string): string[] {
    const created = new Set<string>();
    const done = new Set<string>();
    for (const event of events) {
      if (event.kind === "request.created" && event.flowId === flowId) created.add(event.requestId);
      else if (event.kind === "request.resolved" || event.kind === "request.orphaned") done.add(event.requestId);
    }
    return [...created].filter((requestId) => !done.has(requestId));
  }

  private countAcceptanceRejections(events: readonly TaskStateEvent[], flowId: string): number {
    const acceptance = new Set<string>();
    for (const event of events) {
      if (event.kind === "request.created" && event.cardKind === "acceptance" && event.flowId === flowId) acceptance.add(event.requestId);
    }
    let count = 0;
    for (const event of events) {
      if (event.kind !== "request.resolved" || !acceptance.has(event.requestId)) continue;
      const selected = event.selectedOptionIds ?? [];
      if (event.choice === "reject" || selected.includes("reject") || selected.includes("rework")) count += 1;
    }
    return count;
  }

  private countPriorVersionDecisions(events: readonly TaskStateEvent[], flowId: string, runId?: string): number {
    let count = 0;
    for (const event of events) {
      if (event.kind !== "version.decision" || event.flowId !== flowId) continue;
      if (runId !== undefined && event.runId !== runId) continue;
      count += 1;
    }
    return count;
  }

  private buildVersionDecisionFacts(view: ProjectStateView, events: readonly TaskStateEvent[], subject: VersionDecisionRequestSubject): VersionDecisionFacts {
    const flow = view.flows.find((candidate) => candidate.flowId === subject.flowId);
    const run = subject.runId !== undefined ? flow?.runs.find((candidate) => candidate.runId === subject.runId) : undefined;
    const versions = view.versions.filter((version) => version.flowId === subject.flowId);
    const latestDocs = versions
      .filter((version) => version.latest !== undefined)
      .map((version) => ({
        docKind: version.docKind,
        version: version.latest!.version,
        path: version.latest!.path,
        ...(version.latest!.sha256 !== undefined ? { sha256: version.latest!.sha256 } : {}),
      }));
    const pinnedDocs = versions
      .filter((version) => version.pinned !== undefined)
      .map((version) => ({
        docKind: version.docKind,
        ...(version.pinned!.version !== undefined ? { version: version.pinned!.version } : {}),
        ...(version.pinned!.path !== undefined ? { path: version.pinned!.path } : {}),
        ...(version.pinned!.sha256 !== undefined ? { sha256: version.pinned!.sha256 } : {}),
      }));
    return {
      flowId: subject.flowId,
      ...(subject.runId !== undefined ? { runId: subject.runId } : {}),
      runState: run?.state === "draft" ? "draft" : run?.state === "pinned" ? "pinned" : "legacy",
      ...(run?.stage !== undefined ? { stage: run.stage } : {}),
      unclosedCount: flow?.taskCounts.unclosed ?? 0,
      blockedCount: flow?.taskCounts.blocked ?? 0,
      failedCount: flow?.taskCounts.failed ?? 0,
      pendingRequestCount: this.pendingRequestIdsForFlow(events, subject.flowId).length,
      acceptanceRejectedCount: this.countAcceptanceRejections(events, subject.flowId),
      priorVersionDecisionCount: this.countPriorVersionDecisions(events, subject.flowId, subject.runId),
      latestDocs,
      ...(pinnedDocs.length > 0 ? { pinnedDocs } : {}),
      newerThanPinned: versions.filter((version) => version.newerThanPinned).map((version) => version.docKind),
    };
  }

  private versionDecisionCardLabels(facts: VersionDecisionFacts, flowId: string): VersionDecisionCardLabels {
    const question = [
      mainT("ui.versionDecision.question"),
      "",
      mainT("ui.versionDecision.fact.header"),
      `- ${mainT("ui.versionDecision.fact.unclosed", { count: facts.unclosedCount })}`,
      `- ${mainT("ui.versionDecision.fact.blockedFailed", { blocked: facts.blockedCount, failed: facts.failedCount })}`,
      `- ${mainT("ui.versionDecision.fact.pendingRequests", { count: facts.pendingRequestCount })}`,
      `- ${mainT("ui.versionDecision.fact.acceptanceReworks", { count: facts.acceptanceRejectedCount })}`,
      `- ${mainT("ui.versionDecision.fact.latestVsPinned")}`,
      `- ${mainT("ui.versionDecision.fact.previousDecisions", { count: facts.priorVersionDecisionCount })}`,
    ].join("\n");
    return {
      title: mainT("ui.versionDecision.title", { flowId }),
      question,
      disclaimer: mainT("ui.versionDecision.disclaimer"),
      optionVersionModify: mainT("ui.versionDecision.option.versionModify"),
      optionNewVersionDevelopment: mainT("ui.versionDecision.option.newVersionDevelopment"),
    };
  }

  private decidedByText(decidedBy: VersionDecisionDecidedBy): string {
    if (decidedBy === "directive") return mainT("ui.versionDecision.decidedBy.directive");
    return decidedBy === "judge" ? mainT("ui.versionDecision.decidedBy.judge") : mainT("ui.versionDecision.decidedBy.customer");
  }

  private formatTargetVersions(targets: Record<string, number>): string {
    return Object.entries(targets).map(([kind, version]) => `${kind}:${version}`).join(", ");
  }

  private stripVersionDecisionPrefix(text: string): string {
    return text.startsWith(VERSION_DECISION_SYSTEM_PREFIX) ? text.slice(VERSION_DECISION_SYSTEM_PREFIX.length) : text;
  }

  private nextVersionFlowId(oldFlowId: string, existing: ReadonlySet<string>): string | undefined {
    const free = (candidate: string): boolean =>
      candidate.length <= 64 && GOVERNANCE_SLUG_RE.test(candidate) && !existing.has(candidate);
    const base = `${oldFlowId}-next`;
    if (free(base)) return base;
    for (let index = 2; index <= 99; index += 1) {
      const candidate = `${oldFlowId}-next${index}`;
      if (candidate.length > 64) break;
      if (free(candidate)) return candidate;
    }
    for (let index = 2; index <= 99; index += 1) {
      const candidate = `${oldFlowId}-n${index}`;
      if (candidate.length > 64) break;
      if (free(candidate)) return candidate;
    }
    return undefined;
  }

  private mapVersionDecisionRawOutcome(outcome: CustomerInputOutcome | null | undefined): CustomerInputOutcome | null | undefined {
    if (outcome === null || outcome === undefined || outcome.outcome !== "answered") return outcome;
    const selected = Array.isArray(outcome.value.selected) ? outcome.value.selected : [];
    const action = selected[0];
    if (selected.length === 1 && (action === "version-modify" || action === "new-version-development")) return outcome;
    return {
      outcome: "declined",
      ...(outcome.operatorId !== undefined ? { operatorId: outcome.operatorId } : {}),
      reason: "invalid-selection",
      ...(outcome.judge !== undefined ? { judge: outcome.judge } : {}),
    };
  }

  private appendVersionDecisionAudit(projectRoot: string, fields: Omit<VersionDecisionEvent, "v" | "kind" | "at">): Promise<boolean> {
    return this.appendTaskState(projectRoot, taskEvent("version.decision", fields, () => new Date(this.now())));
  }

  private async emitVersionDecisionResolved(projectRoot: string, runtime: RuntimeKind, roleId: string, requestId: string, detail: string): Promise<void> {
    const appended = await this.appendTaskState(projectRoot, taskEvent("request.notified", { requestId, to: "chief", event: "resolved" }, () => new Date(this.now())));
    if (!appended) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).record("version-decision.notified.write-failed", { requestId });
    }
    const line = mainT("main.versionDecision.notifiedResolved", { result: this.stripVersionDecisionPrefix(detail) });
    this.emitDeliveryNote(projectRoot, runtime, roleId, "chief", line);
  }

  /**
   * 幕僚发起版本决策：校验 → 发 application-owned decision 卡（客户/判断 agent）→ 执行机器部分。
   * 申请≠批准、路线≠内容批准；不写文档、不派角色、不创建任务。失败一律结构化返回，不抛到工具层。
   */
  async requestVersionDecision(input: {
    projectRoot: string;
    roleId: string;
    runtime: RuntimeKind;
    request: VersionDecisionRequest;
    signal?: AbortSignal;
  }): Promise<VersionDecisionResult> {
    const { projectRoot, roleId, runtime, signal } = input;
    const fail = (code: VersionDecisionErrorCode, message: string, extra: Partial<VersionDecisionResult> = {}): VersionDecisionResult => ({
      ok: false,
      code,
      message,
      ...extra,
    });
    try {
      const listing = this.deps.getListing(projectRoot);
      const role = listing?.roles.find((candidate) => candidate.roleId === roleId);
      if (role === undefined || role.builtIn !== true || role.governanceFunction !== "chief") {
        return fail("channel-unavailable", mainT("main.versionDecision.error.channelUnavailable"));
      }
      const entry = this.sessions.get(this.sessionKey(projectRoot, roleId, runtime));
      if (entry === undefined || entry.governedCardContext === undefined || this.deps.customerInput === undefined) {
        return fail("channel-unavailable", mainT("main.versionDecision.error.channelUnavailable"));
      }
      const validation = validateVersionDecisionRequest(input.request);
      if (!validation.ok) return fail(validation.code, mainT("main.versionDecision.error.versionDecisionInvalid"));
      const req = validation.request;
      if (signal?.aborted) return fail("initiator-aborted", mainT("main.versionDecision.aborted"));
      const now = new Date(this.now());
      const view = await buildProjectStateView(projectRoot, { full: true, now });
      if (!view.flows.some((flow) => flow.flowId === req.flowId)) {
        return fail("flow-not-found", mainT("main.versionDecision.error.flowNotFound", { flowId: req.flowId }));
      }
      const scan = await scanRunManifestsForState(projectRoot);
      const derivation = deriveActiveRunFromManifests(scan.manifests, req.flowId);
      const preliminary = validateVersionDecisionContext({
        derivation,
        ...(req.runId !== undefined ? { requestedRunId: req.runId } : {}),
        hasPending: false,
      });
      if (!preliminary.ok) {
        const runs = derivation.activeRuns.map((run) => run.runId).join("、");
        const message = preliminary.code === "run-ambiguous"
          ? mainT("main.versionDecision.error.runAmbiguous", { runs })
          : preliminary.code === "run-change-required"
            ? mainT("main.versionDecision.error.runChangeRequired")
            : preliminary.message;
        return fail(preliminary.code, message);
      }
      const subject: VersionDecisionRequestSubject = {
        flowId: req.flowId,
        ...(preliminary.runId !== undefined ? { runId: preliminary.runId } : {}),
      };
      const pendingKey = this.versionDecisionSubjectKey(projectRoot, subject);
      const requestId = versionDecisionRequestId(subject, now);
      const previous = this.versionDecisionChains.get(projectRoot) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const tail = previous.then(() => gate);
      this.versionDecisionChains.set(projectRoot, tail);
      await previous;
      let attempt = 1;
      const state = await this.readTasks(projectRoot);
      try {
        const ledgerPending = this.findPendingVersionDecision(state.events, req.flowId, subject);
        const memoryPending = this.versionDecisionPending.get(pendingKey);
        if (ledgerPending !== undefined || memoryPending !== undefined) {
          return fail("decision-pending", mainT("main.versionDecision.error.decisionPending", { requestId: ledgerPending ?? memoryPending ?? requestId }));
        }
        attempt = versionDecisionAttempt(state.events, subject);
        this.versionDecisionPending.set(pendingKey, requestId);
      } finally {
        release();
        void tail.finally(() => {
          if (this.versionDecisionChains.get(projectRoot) === tail) this.versionDecisionChains.delete(projectRoot);
        });
      }
      try {
        const facts = this.buildVersionDecisionFacts(view, state.events, subject);
        const card = buildVersionDecisionCard({
          requestId,
          flowId: req.flowId,
          ...(subject.runId !== undefined ? { runId: subject.runId } : {}),
          action: req.action,
          reason: req.reason,
          facts,
          labels: this.versionDecisionCardLabels(facts, req.flowId),
        });
        const request = versionDecisionCardToRequest(card);
        const cardCheck = validateDecisionCardRequest({
          request,
          roleId: "application",
          governanceModel: "trio",
          metadata: { cardKind: "decision", flowId: req.flowId },
        });
        if (!cardCheck.ok) return fail("version-decision-invalid", mainT("main.versionDecision.error.versionDecisionInvalid"));
        let outcome: CustomerInputOutcome | null | undefined;
        try {
          outcome = await this.withRequestLifecycle(
            projectRoot,
            "application",
            request,
            undefined,
            async (req2, context, metadata) => this.mapVersionDecisionRawOutcome(await this.deps.customerInput!(req2, context, metadata)),
            (req2, extras) => entry.governedCardContext!(req2, extras),
            requestId,
            { notify: "none", ...(signal !== undefined ? { signal } : {}) },
          );
        } catch (error) {
          if (signal?.aborted) return fail("initiator-aborted", mainT("main.versionDecision.aborted"));
          // 通道抛错：withRequestLifecycle 已按「通道异常」写 request.resolved(unavailable)（不写 version.decision）。
          // 若 ledger 确实有该 resolved，按 decision-unavailable 回执；否则才是执行/审计失败。
          const afterError = await this.readTasks(projectRoot);
          const resolvedAfterError = afterError.events.some((event) =>
            event.kind === "request.resolved" && event.requestId === requestId,
          );
          if (resolvedAfterError) {
            await this.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, mainT("main.versionDecision.unavailable"));
            return fail("decision-unavailable", mainT("main.versionDecision.unavailable"));
          }
          return fail("execution-failed", mainT("main.versionDecision.error.executionFailed", { detail: error instanceof Error ? error.message : String(error) }));
        }
        if (outcome?.outcome === "declined" && outcome.reason === "initiator-aborted") {
          return fail("initiator-aborted", mainT("main.versionDecision.aborted"));
        }
        if (signal?.aborted) return fail("initiator-aborted", mainT("main.versionDecision.aborted"));
        const answeredOutcome = outcome !== null && outcome !== undefined && outcome.outcome === "answered" ? outcome : undefined;
        const operatorId = outcome !== null && outcome !== undefined && "operatorId" in outcome && typeof outcome.operatorId === "string" ? outcome.operatorId : undefined;
        // Q9 A（2026-11-03）：指令归属只从 `operatorId:"directive:<id>"` 解析（先于 judge/customer）。
        const directiveId = directiveIdFromOperatorId(operatorId);
        const judged = (answeredOutcome !== undefined && answeredOutcome.judge !== undefined) ||
          (typeof operatorId === "string" && operatorId.startsWith("judge:"));
        const decidedBy: VersionDecisionDecidedBy = directiveId !== undefined ? "directive" : judged ? "judge" : "customer";
        const answerOutcome: "answered" | "declined" | "unavailable" =
          answeredOutcome !== undefined ? "answered" : outcome !== null && outcome !== undefined && outcome.outcome === "declined" ? "declined" : "unavailable";
        const answerPlan = mapVersionDecisionAnswer({
          outcome: answerOutcome,
          by: decidedBy,
          ...(answeredOutcome !== undefined ? { selected: answeredOutcome.value.selected } : {}),
          ...(outcome !== null && outcome !== undefined && outcome.outcome === "declined" && outcome.reason !== undefined ? { reason: outcome.reason } : {}),
        });
        if (answerPlan.kind === "late" || answerPlan.kind === "orphan") {
          return fail("initiator-aborted", mainT("main.versionDecision.aborted"));
        }
        if (answerPlan.kind === "resolve-declined") {
          await this.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, mainT("main.versionDecision.declined"));
          return fail("decision-declined", mainT("main.versionDecision.declined"));
        }
        if (answerPlan.kind === "resolve-unavailable") {
          await this.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, mainT("main.versionDecision.unavailable"));
          return fail("decision-unavailable", mainT("main.versionDecision.unavailable"));
        }
        const decisionId = answeredOutcome?.decisionId !== undefined ? answeredOutcome.decisionId : `decision-${requestId}`;
        const baseAudit: Omit<VersionDecisionEvent, "v" | "kind" | "at" | "status"> = {
          schema: VERSION_DECISION_SCHEMA,
          decisionId,
          requestId,
          attempt,
          flowId: req.flowId,
          ...(subject.runId !== undefined ? { runId: subject.runId } : {}),
          action: answerPlan.action,
          recommendedBy: "chief",
          recommendedAction: req.action,
          decidedBy: answerPlan.decidedBy,
          ...(directiveId !== undefined ? { directiveId } : {}),
          ...(operatorId !== undefined ? { operatorId } : {}),
          reason: req.reason,
          oldFlowId: req.flowId,
          ...(subject.runId !== undefined ? { oldRunId: subject.runId } : {}),
        };
        const recordFailure = async (status: "failed" | "uncertain", message: string, extras: Partial<Omit<VersionDecisionEvent, "v" | "kind" | "at">> = {}): Promise<void> => {
          const appended = await this.appendVersionDecisionAudit(projectRoot, { ...baseAudit, status, message, ...extras });
          if (appended) await this.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, mainT("main.versionDecision.partialFailed", { detail: message }));
        };
        if (!(await this.appendVersionDecisionAudit(projectRoot, { ...baseAudit, status: "executing" }))) {
          return fail("execution-uncertain", mainT("main.versionDecision.error.executionUncertain", { detail: "executing audit write failed" }), { decisionId, action: answerPlan.action, flowId: req.flowId });
        }
        const freshScan = await scanRunManifestsForState(projectRoot);
        const freshDerivation = deriveActiveRunFromManifests(freshScan.manifests, req.flowId);
        const freshState = await this.readTasks(projectRoot);
        const pendingRequestIds = this.pendingRequestIdsForFlow(freshState.events, req.flowId);
        const latestVersions: Partial<Record<Exclude<ProjectStateDocKind, "topology">, number>> = {};
        if (answerPlan.action === "version-modify") {
          const docs = await scanVersionedDocsForFlow(projectRoot, req.flowId);
          for (const [kind, pointer] of Object.entries(docs.docs)) {
            if (kind === "topology") continue;
            latestVersions[kind as Exclude<ProjectStateDocKind, "topology">] = pointer.version;
          }
        }
        const executionPlan = planVersionDecisionExecution({
          action: answerPlan.action,
          flowId: req.flowId,
          derivation: freshDerivation,
          ...(req.runId !== undefined ? { requestedRunId: req.runId } : {}),
          hasPending: false,
          latestVersions,
          pendingRequestIds,
        });
        if (executionPlan.kind === "fail") {
          await recordFailure("failed", executionPlan.audit !== undefined ? "run-change-required" : executionPlan.message);
          return fail(executionPlan.code, executionPlan.audit !== undefined
            ? mainT("main.versionDecision.error.runChangeRequired")
            : executionPlan.message);
        }
        if (executionPlan.kind === "version-modify") {
          let effectiveRunId = executionPlan.runId;
          let runAnchor: "created" | "existing" | "unavailable" | undefined;
          if (executionPlan.needsRunAnchor) {
            const draft = await ensureDraftRun(projectRoot, req.flowId, new Date(this.now()));
            if (draft.ok) {
              effectiveRunId = draft.manifest.runId;
              runAnchor = draft.created ? "created" : "existing";
            } else {
              runAnchor = "unavailable";
            }
          }
          const executed = await this.appendVersionDecisionAudit(projectRoot, {
            ...baseAudit,
            ...(effectiveRunId !== undefined ? { runId: effectiveRunId, oldRunId: effectiveRunId } : {}),
            status: "executed",
            targetVersions: executionPlan.targetVersions,
          });
          const detail = this.stripVersionDecisionPrefix(mainT("main.versionDecision.executed.versionModify", {
            flowId: req.flowId,
            targets: this.formatTargetVersions(executionPlan.targetVersions),
          }));
          if (!executed) {
            return fail("execution-uncertain", mainT("main.versionDecision.error.executionUncertain", { detail: "executed audit write failed" }), {
              decisionId,
              action: "version-modify",
              flowId: req.flowId,
              ...(effectiveRunId !== undefined ? { runId: effectiveRunId } : {}),
              targetVersions: executionPlan.targetVersions,
              ...(runAnchor !== undefined ? { runAnchor } : {}),
            });
          }
          await this.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, `${this.decidedByText(answerPlan.decidedBy)}；${detail}`);
          return {
            ok: true,
            message: runAnchor === "unavailable" ? `${detail}（run 锚点不可用）` : detail,
            decisionId,
            action: "version-modify",
            flowId: req.flowId,
            ...(effectiveRunId !== undefined ? { runId: effectiveRunId } : {}),
            targetVersions: executionPlan.targetVersions,
            ...(runAnchor !== undefined ? { runAnchor } : {}),
          };
        }
        // new-version-development
        const freshView = await buildProjectStateView(projectRoot, { full: true, now: new Date(this.now()) });
        const newFlowId = this.nextVersionFlowId(req.flowId, new Set(freshView.flows.map((flow) => flow.flowId)));
        if (newFlowId === undefined) {
          await recordFailure("failed", "new-flow-name-unavailable");
          return fail("execution-failed", mainT("main.versionDecision.error.executionFailed", { detail: "新 flow 命名不可用" }), { decisionId, action: "new-version-development", flowId: req.flowId });
        }
        const draft = await ensureDraftRun(projectRoot, newFlowId, new Date(this.now()));
        if (!draft.ok) {
          await recordFailure("failed", `new-run-create-failed:${draft.reason}`);
          return fail("execution-failed", mainT("main.versionDecision.error.executionFailed", { detail: draft.reason }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId });
        }
        const newRunId = draft.manifest.runId;
        // 崩溃对账用：创建成功后立即补一条带 newFlowId/newRunId 的 executing（仍先于关闭旧 run 的机器效果）。
        if (!(await this.appendVersionDecisionAudit(projectRoot, {
          ...baseAudit,
          status: "executing",
          newFlowId,
          newRunId,
        }))) {
          await recordFailure("uncertain", "executing-ids-audit-write-failed", { newFlowId, newRunId });
          return fail("execution-uncertain", mainT("main.versionDecision.error.executionUncertain", { detail: "executing ids audit write failed" }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId });
        }
        const closedRunIds: string[] = [];
        for (const runId of executionPlan.oldActiveRunIds) {
          const current = await readRunManifest(projectRoot, runId);
          if (!current.ok) {
            await recordFailure("failed", `close-read-failed:${runId}`, { newFlowId, newRunId, closedRunIds: [...closedRunIds] });
            return fail("execution-failed", mainT("main.versionDecision.error.executionFailed", { detail: current.reason }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId, closedRunIds: [...closedRunIds] });
          }
          if (current.manifest.state === "pinned") {
            await recordFailure("failed", "run-change-required", { newFlowId, newRunId, closedRunIds: [...closedRunIds] });
            return fail("run-change-required", mainT("main.versionDecision.error.runChangeRequired"), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId, closedRunIds: [...closedRunIds] });
          }
          const closed = await closeRun(projectRoot, runId, "closed", supersededCloseReason(newFlowId, newRunId));
          if (!closed.ok) {
            await recordFailure("failed", `close-failed:${runId}`, { newFlowId, newRunId, closedRunIds: [...closedRunIds] });
            return fail("execution-failed", mainT("main.versionDecision.error.executionFailed", { detail: closed.reason }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId, closedRunIds: [...closedRunIds] });
          }
          closedRunIds.push(runId);
        }
        const orphanedRequestIds: string[] = [];
        for (const requestIdToOrphan of executionPlan.orphanRequestIds) {
          const appended = await this.appendTaskState(projectRoot, taskEvent("request.orphaned", { requestId: requestIdToOrphan, reason: "superseded" }, () => new Date(this.now())));
          if (!appended) {
            await recordFailure("uncertain", `orphan-failed:${requestIdToOrphan}`, { newFlowId, newRunId, closedRunIds: [...closedRunIds], orphanedRequestIds: [...orphanedRequestIds] });
            return fail("execution-uncertain", mainT("main.versionDecision.error.executionUncertain", { detail: `orphan failed: ${requestIdToOrphan}` }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId, closedRunIds: [...closedRunIds], orphanedRequestIds: [...orphanedRequestIds] });
          }
          orphanedRequestIds.push(requestIdToOrphan);
        }
        const focusAppended = await this.appendTaskState(projectRoot, taskEvent("project.focus", {
          flowId: newFlowId,
          runId: newRunId,
          roleId: "application",
          sourceDecisionId: decisionId,
          note: `superseded-by:${newFlowId}/${newRunId}`,
        }, () => new Date(this.now())));
        if (!focusAppended) {
          await recordFailure("uncertain", "focus-switch-failed", { newFlowId, newRunId, closedRunIds: [...closedRunIds], orphanedRequestIds: [...orphanedRequestIds] });
          return fail("execution-uncertain", mainT("main.versionDecision.error.executionUncertain", { detail: "focus switch failed" }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId, closedRunIds: [...closedRunIds], orphanedRequestIds: [...orphanedRequestIds] });
        }
        const executed = await this.appendVersionDecisionAudit(projectRoot, {
          ...baseAudit,
          status: "executed",
          newFlowId,
          newRunId,
          closedRunIds,
          orphanedRequestIds,
        });
        const detail = this.stripVersionDecisionPrefix(mainT("main.versionDecision.executed.newVersion", {
          oldFlowId: req.flowId,
          newFlowId,
          newRunId,
        }));
        if (!executed) {
          return fail("execution-uncertain", mainT("main.versionDecision.error.executionUncertain", { detail: "executed audit write failed" }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId, closedRunIds, orphanedRequestIds });
        }
        await this.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, `${this.decidedByText(answerPlan.decidedBy)}；${detail}`);
        return {
          ok: true,
          message: detail,
          decisionId,
          action: "new-version-development",
          flowId: req.flowId,
          ...(req.runId !== undefined ? { runId: req.runId } : {}),
          newFlowId,
          newRunId,
          closedRunIds,
          orphanedRequestIds,
        };
      } finally {
        this.versionDecisionPending.delete(pendingKey);
      }
    } catch (error) {
      return fail("execution-failed", mainT("main.versionDecision.error.executionFailed", { detail: error instanceof Error ? error.message : String(error) }));
    }
  }

  /**
   * 重启对账（AC-8.3/R3）：executing → executed/uncertain；F5「resolved 无执行记录」→ uncertain + 通知。
   * 排除已 request.orphaned；不自动执行、不重复创建 flow/run。
   */
  private async restoreVersionDecisions(projectRoot: string, state: TaskReplay): Promise<{ reconciled: number; uncertain: number }> {
    let reconciled = 0;
    let uncertain = 0;
    const latest = new Map<string, VersionDecisionEvent>();
    for (const event of state.events) {
      if (event.kind === "version.decision") latest.set(event.decisionId, event);
    }
    const chiefRoleId = this.chiefTaskRoleIdOf(projectRoot) ?? "chief";
    const runtime = this.findLiveRuntime(projectRoot, chiefRoleId) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
    for (const event of latest.values()) {
      if (event.status !== "executing") continue;
      let status: "executed" | "uncertain" = "executed";
      let message: string | undefined;
      if (event.action === "new-version-development") {
        if (event.newFlowId === undefined || event.newRunId === undefined) {
          status = "uncertain";
          message = "new-flow-run-unrecorded";
        } else {
          const newRun = await readRunManifest(projectRoot, event.newRunId);
          if (!newRun.ok || newRun.manifest.flowId !== event.newFlowId) {
            status = "uncertain";
            message = "new-run-unavailable";
          } else {
            const scan = await scanRunManifestsForState(projectRoot);
            const remaining = deriveActiveRunFromManifests(scan.manifests, event.oldFlowId ?? event.flowId).activeRuns;
            if (remaining.length > 0) {
              status = "uncertain";
              message = `old-runs-still-active:${remaining.map((run) => run.runId).join(",")}`;
            } else if (!state.events.some((candidate) =>
              candidate.kind === "project.focus" &&
              candidate.sourceDecisionId === event.decisionId &&
              candidate.flowId === event.newFlowId &&
              candidate.runId === event.newRunId,
            )) {
              status = "uncertain";
              message = "focus-not-switched";
            } else {
              for (const oldRunId of event.closedRunIds ?? []) {
                const oldRun = await readRunManifest(projectRoot, oldRunId);
                if (!oldRun.ok || (oldRun.manifest.state !== "closed" && oldRun.manifest.state !== "cancelled")) {
                  status = "uncertain";
                  message = `old-run-not-closed:${oldRunId}`;
                  break;
                }
              }
            }
          }
        }
      }
      const { v: _v, kind: _kind, at: _at, ...fields } = event;
      const appended = await this.appendVersionDecisionAudit(projectRoot, {
        ...fields,
        status,
        ...(message !== undefined ? { message } : {}),
      });
      if (!appended) continue;
      if (status === "executed") reconciled += 1;
      else uncertain += 1;
      await this.emitVersionDecisionResolved(
        projectRoot,
        runtime,
        chiefRoleId,
        event.requestId,
        status === "executed"
          ? mainT("ui.versionDecision.status.executed")
          : mainT("main.versionDecision.uncertain", { detail: message ?? "reconciliation" }),
      );
    }
    for (const pending of collectResolvedWithoutExecution(state.events)) {
      if (latest.has(pending.decisionId) || pending.flowId === undefined) continue;
      const subject: VersionDecisionRequestSubject = { flowId: pending.flowId };
      const appended = await this.appendVersionDecisionAudit(projectRoot, {
        schema: VERSION_DECISION_SCHEMA,
        decisionId: pending.decisionId,
        requestId: pending.requestId,
        attempt: versionDecisionAttempt(state.events, subject),
        flowId: pending.flowId,
        action: pending.action,
        recommendedBy: "chief",
        recommendedAction: pending.action,
        decidedBy: pending.decidedBy,
        reason: "restart-recovery:resolved-without-execution-record",
        status: "uncertain",
        message: "resolved-without-execution-record",
      });
      if (!appended) continue;
      uncertain += 1;
      await this.emitVersionDecisionResolved(
        projectRoot,
        runtime,
        chiefRoleId,
        pending.requestId,
        mainT("main.versionDecision.uncertain", { detail: "resolved-without-execution-record" }),
      );
    }
    return { reconciled, uncertain };
  }


  /**
   * C-08：重启重放申请/审批——未决 `request.created` 标 `request.orphaned`（不自动执行原动作，系统通知幕僚）；
   * 未决 `approval.created` 标 `approval.expired`（命令/写盘不重放）。已结算/已标记幂等跳过。
   */
  private async restoreRequestState(
    projectRoot: string,
    state: TaskReplay,
  ): Promise<{ orphaned: number; expired: number }> {
    const resolved = new Set<string>();
    const orphaned = new Set<string>();
    const approvalDone = new Set<string>();
    const createdRequests = new Map<string, { sourceRoleId: string; title: string }>();
    const createdApprovals = new Map<string, { sourceRoleId: string; summary: string }>();
    for (const event of state.events) {
      if (event.kind === "request.resolved") resolved.add(event.requestId);
      else if (event.kind === "request.orphaned") orphaned.add(event.requestId);
      else if (event.kind === "request.created") createdRequests.set(event.requestId, { sourceRoleId: event.sourceRoleId, title: event.title });
      else if (event.kind === "approval.created") createdApprovals.set(event.approvalId, { sourceRoleId: event.sourceRoleId, summary: event.summary });
      else if (event.kind === "approval.resolved" || event.kind === "approval.expired") approvalDone.add(event.approvalId);
    }
    let orphanedCount = 0;
    for (const [requestId, info] of createdRequests) {
      if (resolved.has(requestId) || orphaned.has(requestId)) continue;
      const appended = await this.appendTaskState(projectRoot, taskEvent("request.orphaned", { requestId, reason: "restart" }, () => new Date(this.now())));
      if (!appended) continue;
      orphanedCount += 1;
      // C-08：原 tool call 已不存在——结果只作系统通知/任务回投发起角色，**不自动执行原动作**。
      const sourceRuntime = this.findLiveRuntime(projectRoot, info.sourceRoleId) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
      this.emitDeliveryNote(
        projectRoot,
        sourceRuntime,
        info.sourceRoleId,
        "chief",
        `[系统·申请] 重启后申请 #${requestId}「${shortenSummary(info.title, 80)}」未决，已标记 orphaned；不会自动执行原动作，请重新发起或人工处理。`,
      );
      if (info.sourceRoleId !== "application") {
        this.notifyRequest(projectRoot, requestId, info.sourceRoleId, info.title, "resolved", "重启后未决（orphaned；不自动执行原动作）");
      }
    }
    let expiredCount = 0;
    for (const [approvalId, info] of createdApprovals) {
      if (approvalDone.has(approvalId)) continue;
      const appended = await this.appendTaskState(projectRoot, taskEvent("approval.expired", { approvalId, reason: "restart" }, () => new Date(this.now())));
      if (!appended) continue;
      expiredCount += 1;
      // C-08：命令/写盘不重放；如实通知发起角色。
      const sourceRuntime = this.findLiveRuntime(projectRoot, info.sourceRoleId) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
      this.emitDeliveryNote(
        projectRoot,
        sourceRuntime,
        info.sourceRoleId,
        "chief",
        `[系统·审批] 重启后审批 #${approvalId}「${shortenSummary(info.summary, 80)}」未决，已标记 expired；命令/写盘不重放，请重新发起并逐次确认。`,
      );
    }
    return { orphaned: orphanedCount, expired: expiredCount };
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async restoreTasks(projectRoot: string): Promise<TaskRestoreReport> {
    return this.tasks.restoreTasks(projectRoot);
  }

  private findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined {
    for (const [key, entry] of this.sessions) {
      if (key.startsWith(`${projectRoot}\u0000${roleId}\u0000`) && entry.projectRoot === projectRoot && entry.roleId === roleId) return entry.runtime;
    }
    return undefined;
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private async partialArtifactsFor(projectRoot: string, roleId: string, taskId: string | undefined, since?: string): Promise<string[]> {
    return this.tasks.partialArtifactsFor(projectRoot, roleId, taskId, since);
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private roleTempDir(projectRoot: string, roleId: string): { abs: string; rel: string } | undefined {
    return this.tasks.roleTempDir(projectRoot, roleId);
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private async isolatePartialArtifacts(
    projectRoot: string,
    roleId: string,
    taskId: string | undefined,
    since?: string,
  ): Promise<{ artifacts: string[]; stagingDir?: string }> {
    return this.tasks.isolatePartialArtifacts(projectRoot, roleId, taskId, since);
  }

  /** B-07：确保目标角色使用 fresh 会话（现有会话重建；无会话则交由投递自动新开）。 */
  private async ensureFreshRoleSession(projectRoot: string, roleId: string, runtime: RuntimeKind): Promise<{ ok: boolean; rebuilt: boolean; error?: string }> {
    const key = this.sessionKey(projectRoot, roleId, runtime);
    const entry = this.sessions.get(key);
    if (entry === undefined) return { ok: true, rebuilt: false };
    const deadline = this.now() + 5000;
    while (entry.busy && this.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    if (this.sessions.get(key) !== entry) return { ok: true, rebuilt: false };
    if (entry.busy) return { ok: false, rebuilt: false, error: "目标会话仍在运行，未能建立 fresh 会话" };
    const rebuilt = await this.rebuildSession({ projectRoot, roleId, runtime });
    return rebuilt.ok ? { ok: true, rebuilt: true } : { ok: false, rebuilt: false, error: rebuilt.error ?? "fresh 会话重建失败" };
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private chooseRedispatchTarget(projectRoot: string, currentRoleId: string, attempts: number): string {
    return this.tasks.chooseRedispatchTarget(projectRoot, currentRoleId, attempts);
  }

  /**
   * **终止角色当前轮次 + 后台子进程树**（B-08）。失败/无法确认 ⇒ `terminationConfirmed:false`，
   * 调用方（重派）不得自动重派。记录 `role.terminated`（子进程数/退出/信号）到运行日志。
   */
  private controllerProducerFacts(projectRoot: string, taskId: string, caller: ActualDispatchSource): DesktopControllerStopFact["knownProducers"] | undefined {
    const claims = [...this.drainClaimRecords].filter(row => row.projectRoot === projectRoot &&
      !(row.owner?.entry === caller.entry && row.owner.origin === caller.origin));
    if (claims.some(row => !row.taskIds?.length)) return undefined;
    const key = `${projectRoot}\u0000${taskId}`;
    return { openChains: [...this.openChains.keys()].filter(key => key.startsWith(`${projectRoot}\u0000convener\u0000`)).length,
      deliveryClaims: claims.filter(row => row.taskIds?.includes(taskId)).length + (this.taskDeliveryCommits.has(key) ? 1 : 0),
      handbackCommits: this.taskHandbackCommits.has(key) ? 1 : 0 };
  }

  private async stopExactController(input: TerminateRoleRunInput, caller?: ActualDispatchSource): Promise<TerminateRoleRunResult> {
    const base: TerminateRoleRunResult = { ok: false, roleId: input.roleId, terminationConfirmed: false, childProcesses: 0, childProcessesStopped: 0,
      childResults: [], partialArtifacts: [], isolatedArtifacts: [], sessionFresh: false, abort: { ok: false, supported: false } };
    const blocked = (code: string, message: string): TerminateRoleRunResult => ({ ...base, message: `${code}：${message}` });
    const current = () => !!caller && caller.entry.roleId === "chief" && caller.entry.projectRoot === input.projectRoot &&
      this.sessions.get(this.sessionKey(input.projectRoot, "chief", caller.entry.runtime)) === caller.entry && caller.entry.origins.running === caller.origin &&
      caller.entry.busy && !caller.origin.settled && !caller.entry.interactionState.lifetime.signal.aborted && !caller.entry.interactionState.turn.signal.aborted;
    if (!input.taskId) return blocked("controller-stop-task-required", "受管运营停止必须明确真实任务，未按角色猜测当前目标。");
    if (!caller?.entry.handle.sessionId || !caller.origin.turnId || !current()) return blocked("controller-stop-caller-unproven", "缺少当前真实幕僚终止调用，未停止。");
    const prepared = await prepareControllerStop({ projectRoot: input.projectRoot, taskId: input.taskId, chiefCoreSessionId: caller.entry.handle.sessionId, chiefTurnId: caller.origin.turnId });
    if (!current()) return blocked("controller-stop-source-changed", "准备期间发起回合已变化。");
    if (!prepared.ok) return blocked(prepared.code, prepared.message);
    const plan = prepared.value;
    if (plan.scope.taskId !== input.taskId || plan.scope.actorRoleId !== "convener" || plan.scope.creatorRoleId !== "chief" ||
        plan.requesterCoreSessionId !== caller.entry.handle.sessionId || plan.requesterTurnId !== caller.origin.turnId)
      return blocked("controller-stop-target-mismatch", "公开停止计划与真实目标不一致。");
    const owned = this.ownedRunStopMembers(plan); if (!owned.ok) return blocked(owned.code, owned.message);
    for (const [manager, members] of owned.groups) {
      if (!manager.controllerProducerFacts(input.projectRoot, input.taskId, caller)) return blocked("controller-stop-producer-unknown", "目标投递认领归属尚未核实。");
      if (members.some(({ member }) => manager.executionInventoryFacts(input.projectRoot).sessions.find(row => row.hostHandleId === member.hostHandleId)?.runId !== plan.scope.runId))
        return blocked("controller-stop-target-mismatch", "目标当前任务或运行已变化。");
    }
    const lease = beginGitHostAction({ projectRoot: input.projectRoot, kind: "session-dispose" });
    if (!lease.ok) return blocked(lease.code, "项目正在进行另一真实宿主动作，未停止。");
    const heldLease: ControllerDisposalLease = { projectRoot: input.projectRoot, leaseId: lease.leaseId, operationId: plan.operationId, kind: "session-dispose", hostHandleIds: plan.handles.map(member => member.hostHandleId) };
    this.controllerDisposalOwners.add(heldLease);
    let activeLease: { projectRoot: string; leaseId: string } | undefined = heldLease;
    const signal = AbortSignal.any([caller.entry.interactionState.lifetime.signal, caller.entry.interactionState.turn.signal]);
    let outcome: TerminateRoleRunResult = blocked("controller-stop-incomplete", "停止未完成。");
    try {
      outcome = await (async (): Promise<TerminateRoleRunResult> => {
        for (const [manager, members] of owned.groups) {
          const tasks = manager.fencedRunTasks.get(input.projectRoot) ?? new Set<string>(); tasks.add(plan.scope.taskId); manager.fencedRunTasks.set(input.projectRoot, tasks);
          const producers = manager.controllerProducerFacts(input.projectRoot, plan.scope.taskId, caller); if (!producers) return blocked("controller-stop-producer-unknown", "目标归属已变化。");
          manager.controllerStopFacts.set(`${input.projectRoot}\u0000${plan.operationId}`, { projectRoot: input.projectRoot, fact: {
            managerId: manager.managerId, operationId: plan.operationId, taskId: plan.scope.taskId, runId: plan.scope.runId, requestDigest: plan.requestDigest,
            generation: ++manager.runStopGeneration, state: "fenced", hostHandleIds: members.map(row => row.member.hostHandleId), targetSeq: manager.deliveryPersistSeq, knownProducers: producers } });
          manager.inventoryChanged(input.projectRoot, "controller-stop-producers-fenced");
        }
        for (const [manager, members] of owned.groups) for (const { member, handle } of members) {
          if (!current() || signal.aborted) return blocked("controller-stop-cancelled", "发起回合已取消。");
          const before = handle.inspectLifecycle?.();
          if (before?.sessionId !== member.coreSessionId || before.native?.instanceId !== member.nativeInstanceId)
            return blocked("controller-stop-instance-changed", "原Core或native实例已变化，未停止错误实例。");
          const stopped = await handle.stopAndInspect!({ expectedSessionId: member.coreSessionId, ...(before.turnId ? { expectedTurnId: before.turnId } : {}), timeoutMs: 5000 }, signal);
          if (stopped.sessionId !== member.coreSessionId || stopped.native?.instanceId !== member.nativeInstanceId || stopped.status !== "quiescent" || !stopped.providerFinished || stopped.activeTools.length)
            return blocked("controller-stop-terminal-unproven", "原实例尚未排空，未确认停止。");
          const entry = [...manager.sessions.entries()].find(([, value]) => value.handle === handle);
          if (entry) {
            await manager.disposeObservedHandle(handle, heldLease); await entry[1].eventConsumerDone;
            if (entry[1].eventConsumerFailed) return blocked("controller-stop-event-consumer-unproven", "原实例事件消费失败。");
            const error = await manager.disposeEntry(entry[0], entry[1], heldLease); if (error) return blocked("controller-stop-dispose-failed", error);
          }
        }
        for (const [manager] of owned.groups) {
          const claims = await manager.waitForRunStopDeliveryClaims({ projectRoot: input.projectRoot, taskIds: [plan.scope.taskId], signal, caller });
          if (claims.status !== "wait-complete") return blocked(claims.code, "目标认领尚未结束。");
          const key = `${input.projectRoot}\u0000${plan.scope.taskId}`;
          await Promise.all([manager.taskDeliveryCommits.get(key)?.done, manager.taskHandbackCommits.get(key)]);
          const producers = manager.controllerProducerFacts(input.projectRoot, plan.scope.taskId, caller);
          if (!producers || Object.values(producers).some(count => count !== 0)) return blocked("controller-stop-producers-unproven", "目标仍有在途生产者，未确认停止。");
          const cutoff = await manager.finishStopPersistence({ ok: true, note: "" });
          if (!cutoff.ok || !cutoff.deliveryQueuePersistence) return blocked("controller-stop-cutoff-unproven", cutoff.note);
          const row = manager.controllerStopFacts.get(`${input.projectRoot}\u0000${plan.operationId}`)!;
          row.fact = { ...row.fact, targetSeq: cutoff.deliveryQueuePersistence.targetSeq, knownProducers: producers };
          manager.inventoryChanged(input.projectRoot, "controller-stop-cutoff-completed");
          if (manager.inventoryPublicationErrors.has(input.projectRoot)) return blocked("controller-stop-inventory-unavailable", "真实停止事实发布失败。");
        }
        const expectedHandles = plan.handles.map(member => member.hostHandleId).sort();
        if (!current() || signal.aborted || !this.controllerDisposalOwners.has(heldLease) || heldLease.projectRoot !== plan.projectRoot ||
            heldLease.operationId !== plan.operationId || heldLease.kind !== "session-dispose" || heldLease.leaseId !== lease.leaseId ||
            JSON.stringify([...heldLease.hostHandleIds].sort()) !== JSON.stringify(expectedHandles) ||
            [...owned.groups].some(([manager, members]) => members.some(({ handle }) => !manager.ownsControllerDisposal(handle, heldLease))))
          return blocked("controller-stop-disposal-owner-changed", "原停止操作或精确句柄归属已变化。");
        // Core stop/dispose truthfully interrupted the effect lease. End only our own lease, then
        // acquire an inspection-only lease in this synchronous stack; this is not OS/process atomicity.
        const endedEffects = endGitHostAction({ projectRoot: heldLease.projectRoot, leaseId: heldLease.leaseId });
        if (!endedEffects.ok) return blocked(endedEffects.code, "原停止动作的协调未能结束，不能进行最终核验。");
        const inspection = beginGitHostAction({ projectRoot: input.projectRoot, kind: "session-dispose", expectedCoordinatorRevision: endedEffects.coordinatorRevision });
        activeLease = inspection.ok ? { projectRoot: input.projectRoot, leaseId: inspection.leaseId } : undefined;
        this.controllerDisposalOwners.delete(heldLease);
        if (!inspection.ok) return blocked(inspection.code, "最终停止核验尚未取得当前协调边界。");
        const finalized = await finalizeControllerStop({ projectRoot: input.projectRoot, plan, hostLeaseId: inspection.leaseId }, signal);
        if (!finalized.ok) return blocked(finalized.code, finalized.message);
        this.appendRoleActivity(input.projectRoot, "convener", { kind: "role.terminated", taskId: plan.scope.taskId, status: "confirmed",
          summary: `原运营任务已精确停止：${finalized.operationId}；未关闭任务、未取消整run、未批准质量或发布。` });
        return { ...base, ok: true, terminationConfirmed: true, childProcesses: finalized.childProcesses, childProcessesStopped: finalized.childProcessesStopped,
          sessionFresh: true, abort: { ok: true, supported: true }, message: finalized.message };
      })();
    } catch (error) { outcome = blocked("controller-stop-host-failed", error instanceof Error ? error.message : String(error)); }
    finally {
      const ended = activeLease ? endGitHostAction(activeLease) : undefined; this.controllerDisposalOwners.delete(heldLease);
      if (ended && !ended.ok) outcome = blocked(ended.code, "原停止动作的宿主协调尚未完成，不能确认停止。");
    }
    return outcome;
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async terminateRoleRun(input: TerminateRoleRunInput, chiefSource?: ActualDispatchSource): Promise<TerminateRoleRunResult> {
    return this.tasks.terminateRoleRun(input, chiefSource);
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private taskChainRootOf(state: TaskReplay, taskId: string): string {
    return this.tasks.taskChainRootOf(state, taskId);
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async redispatchTask(input: RedispatchTaskInput): Promise<RedispatchTaskResult> {
    return this.tasks.redispatchTask(input);
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  async closeTask(input: CloseTaskInput): Promise<CloseTaskResult> {
    return this.tasks.closeTask(input);
  }

  /** 薄委托 → `session/tasks.ts`（JSDoc/方法体见模块）。 */
  private escalateStuckTask(
    projectRoot: string,
    taskId: string,
    rootTaskId: string,
    attempts: number,
    taskFlowId?: string,
    targetRoleId?: string,
    targetRuntime?: RuntimeKind,
  ): Promise<{ escalated: boolean; requestId?: string; selected?: string; message: string }> {
    return this.tasks.escalateStuckTask(projectRoot, taskId, rootTaskId, attempts, taskFlowId, targetRoleId, targetRuntime);
  }

  /**
   * **派发主人**角色 id（routeDispatch 的来源防御性校验）：trio → Convener；single → 主入口（su）。
   * 正常路径由 `open()` 的能力注入保证；此处只做防御性再校验（绝不静默换人）。
   */
  private dispatcherRoleIdOf(projectRoot: string): string | null {
    return dispatcherRoleIdOf(projectRoot, this.deps);
  }

  /** 投递进展的**系统行**（首选进目标/请求者的 pane；首选未知时退回兜底角色）——如实、不静默。 */
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private governanceProjectionKey(projectRoot: string, roleId: string, runtime: RuntimeKind, text: string): string {
    return this.diagnostics.governanceProjectionKey(projectRoot, roleId, runtime, text);
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private governanceProjectionFingerprint(input: {
    sourceRoleId: string;
    statusCode: GovernanceClientProjectionV1["statusCode"];
    flowIds: readonly string[];
    reportPath?: string;
    governancePath?: string;
    text: string;
  }): string {
    return this.diagnostics.governanceProjectionFingerprint(input);
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private registerGovernanceClientProjection(
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    text: string,
    projection: GovernanceClientProjectionV1,
  ): void {
    this.diagnostics.registerGovernanceClientProjection(projectRoot, roleId, runtime, text, projection);
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private lookupGovernanceClientProjection(
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    text: string,
  ): GovernanceClientProjectionV1 | undefined {
    return this.diagnostics.lookupGovernanceClientProjection(projectRoot, roleId, runtime, text);
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private async mirrorGovernanceFeedback(
    projectRoot: string,
    runtime: RuntimeKind,
    roleId: string,
    options: { flowIds?: readonly string[]; outcome?: RuntimeTurnOutcome } = {},
  ): Promise<void> {
    return this.diagnostics.mirrorGovernanceFeedback(projectRoot, runtime, roleId, options);
  }

  /**
   * Proof settle 的报告指针：优先用本轮投递 origin 的 flowId；缺失时按账本 verifier 派发记录取最近的
   * flow（有界；读不到 ⇒ 空集，只给通用目录指针）。**只读**，不猜验收结论、不伪造报告版本。
   */
  private resolveProofFlowIds(_projectRoot: string, hinted?: readonly string[]): string[] {
    return resolveProofFlowIds(_projectRoot, hinted);
  }

  /** `mirrorGovernanceFeedback` 的 listing 查找：精确命中优先；miss 时按斜杠变体再查（仅查找，不改 key）。 */
  private findListingForFeedback(projectRoot: string): ProjectListing | undefined {
    return findListingForFeedback(projectRoot, this.deps);
  }

  /** 角色显示名（listing 的 `displayName`；无则 roleId）——用于派发正文来源与治理反馈文案。 */
  private roleDisplayName(projectRoot: string, roleId: string): string {
    return roleDisplayName(projectRoot, roleId, this.deps);
  }

  /** 队列键：项目 × 目标角色（一套机对多个目标；空目标=主入口暂未枚举到——每次尝试时重解析）。 */
  private queueKey(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): string {
    return queueKey(projectRoot, targetRoleId, runtime);
  }

  /** 应用任务的**内容稳定键**（2026-10-25）：同项目×目标×引擎×正文 ⇒ 同键；任一变化 ⇒ 新键。 */
  private appTaskClientMessageId(projectRoot: string, roleId: string, runtime: RuntimeKind, text: string): string {
    const digest = createHash("sha256")
      .update(`${projectRoot}\u0000${roleId}\u0000${runtime}\u0000${text}`, "utf8")
      .digest("hex");
    return `${APP_TASK_CLIENT_MESSAGE_ID_PREFIX}${digest}`;
  }

  /** 调用方自带**语义去重键**（如 flow revision 指纹）时的稳定键：同键同任务，键变 ⇒ 新任务。 */
  private appTaskClientMessageIdFromSeed(seed: string): string {
    const digest = createHash("sha256").update(`seed\u0000${seed}`, "utf8").digest("hex");
    return `${APP_TASK_CLIENT_MESSAGE_ID_PREFIX}${digest}`;
  }

  /** 派发条目的稳定键：既有内容 `dedupKey`（含 project/runtime/target/正文/reason/flowId/stepId）的 sha256。 */
  private appDispatchClientMessageId(dedupKey: string): string {
    const digest = createHash("sha256").update(`dispatch\u0000${dedupKey}`, "utf8").digest("hex");
    return `${APP_TASK_CLIENT_MESSAGE_ID_PREFIX}${digest}`;
  }

  /** 记「已投递」标记（仅应用任务；有界 FIFO）。重复记录只刷新存在性（不重排）。 */
  private rememberAppTaskDelivered(clientMessageId: string | undefined): void {
    if (!isAppTaskClientMessageId(clientMessageId) || this.deliveredAppTaskIds.has(clientMessageId)) return;
    this.deliveredAppTaskIds.add(clientMessageId);
    while (this.deliveredAppTaskIds.size > MAX_DELIVERED_APP_TASK_IDS) {
      const oldest = this.deliveredAppTaskIds.values().next().value;
      if (oldest === undefined) break;
      this.deliveredAppTaskIds.delete(oldest);
    }
  }

  /** 同一应用任务是否已在内存队列/在途（队列键内）——返回排队位次（1 起；在途 ⇒ queued:false）。 */
  private pendingAppTaskDelivery(
    projectRoot: string,
    targetRoleId: string,
    runtime: RuntimeKind,
    clientMessageId: string,
  ): { queued: boolean; position?: number } | undefined {
    const key = this.queueKey(projectRoot, targetRoleId, runtime);
    const queue = this.deliveryQueues.get(key);
    if (queue !== undefined) {
      const idx = queue.findIndex((item) => item.clientMessageId === clientMessageId);
      if (idx >= 0) return { queued: true, position: idx + 1 };
    }
    if (this.activeDeliveries.get(key)?.clientMessageId === clientMessageId) return { queued: false };
    return undefined;
  }

  private enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void {
    this.inventoryChanged(projectRoot, "delivery-enqueue-requested");
    const key = this.queueKey(projectRoot, targetRoleId, item.runtime);
    const q = this.deliveryQueues.get(key) ?? [];
    const entry = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, item.runtime));
    const activeAssignment = entry?.origins.running ? entry.origins.running.assignment : entry?.boundAssignment;
    const systemAssignment = item.kind === "system" ? (item.systemAssignment !== undefined ? item.systemAssignment : activeAssignment ?? null) : undefined;
    q.push({ ...item, queueEntryId: item.queueEntryId ?? randomUUID(), ...(item.kind === "system" ? { systemAssignment: systemAssignment ? structuredClone(systemAssignment) : null } : {}), enqueuedAt: new Date(this.now()).toISOString() }); // 入队时间**入队即定格**（显示用，非执行时间；经注入时钟——与看护同源）
    this.deliveryQueues.set(key, q);
    // G-2/W3：派发/回交/客户消息**入队** = 真实活动（重武装）；`kind:"system"`（看护自身投递）**不记**——
    // 否则「告警/收束投递本身」会把静默窗口反复重置或反过来触发骚扰回路。
    if (item.kind !== "system") this.noteWatchdogActivity(projectRoot, `enqueue-${item.kind}`);
    this.notifyRoleState(projectRoot, targetRoleId, item.runtime); // L-1：入队即外推（队列行/徽标如实可见）
    // 2026-10-20 重启续跑：入队即持久化（原子写；失败只诊断，不影响内存投递）。
    this.deliveredDeliveryKeys.delete(`${this.queueKey(projectRoot, targetRoleId, item.runtime)}\u0000${item.dedupKey}`);
    // 2026-10-25：显式重新入队＝新的一次派发意图（返工同文再派仍放行）——清除该应用任务的「已投递」标记；
    // 重建续投/应用侧重复调用不经本函数（它们在发送前被 stable id 去重拦下），所以不会被这一次清除误放行。
    if (item.clientMessageId !== undefined) this.deliveredAppTaskIds.delete(item.clientMessageId);
    this.persistDeliveryQueues();
  }

  // —————— 2026-10-20 客户要求：投递队列持久化 + 重启自动续跑（不写项目文件；路径由 Interface 提供） ——————

  /** 一条投递条目的 JSON 安全快照；不可序列化（含用户载荷里塞了怪对象）⇒ undefined（该条不落盘）。 */
  private persistableDeliveryItem(item: DeliveryItem): PersistedDeliveryItemV1["item"] | undefined {
    try {
      const snapshot: PersistedDeliveryItemV1["item"] = {
        kind: item.kind,
        runtime: item.runtime,
        targetRoleId: item.targetRoleId,
        sourceRoleId: item.sourceRoleId,
        text: item.text,
        summary: item.summary,
        dedupKey: item.dedupKey,
        enqueuedAt: item.enqueuedAt,
        ...(typeof item.flowId === "string" && item.flowId !== "" ? { flowId: item.flowId } : {}),
        ...(typeof item.taskId === "string" && item.taskId !== "" ? { taskId: item.taskId } : {}),
        ...(item.queueEntryId ? { queueEntryId: item.queueEntryId } : {}),
        ...(item.kind === "system" && item.systemAssignment !== undefined ? { systemAssignment: item.systemAssignment } : {}),
        ...(item.notificationSource ? { notificationSource: structuredClone(item.notificationSource) } : {}),
        ...(item.controllerResume ? { controllerResume: structuredClone(item.controllerResume) } : {}),
        ...(typeof item.deliveryId === "string" ? { deliveryId: item.deliveryId } : {}),
        ...(isAppTaskClientMessageId(item.clientMessageId) ? { clientMessageId: item.clientMessageId } : {}),
        ...(item.handback !== undefined ? { handback: item.handback } : {}),
        ...(item.report !== undefined ? { report: item.report } : {}),
        ...(item.liveReport !== undefined ? { liveReport: item.liveReport } : {}),
        ...(item.liveDurability !== undefined ? { liveDurability: item.liveDurability } : {}),
      };
      JSON.stringify(snapshot); // 验证可序列化（坏载荷 ⇒ 该条不落盘，绝不拖垮其余条目）
      return snapshot;
    } catch {
      return undefined;
    }
  }

  /** 当前内存态的持久化快照：排队项（queued）＋ 未完成在途项（in-flight；delivery.end 已完成的排除）。 */
  private deliveryStoreItems(): PersistedDeliveryItemV1[] {
    const items: PersistedDeliveryItemV1[] = [];
    for (const [key, queue] of this.deliveryQueues) {
      const [projectRoot = "", roleId = "", runtimeRaw = ""] = key.split("\u0000");
      const runtime = runtimeRaw as RuntimeKind;
      for (const item of queue) {
        const snapshot = this.persistableDeliveryItem(item);
        if (snapshot === undefined) continue;
        items.push({ key: { projectRoot, roleId, runtime }, item: snapshot, state: "queued", enqueuedAt: item.enqueuedAt });
      }
    }
    for (const [key, item] of this.activeDeliveries) {
      if (this.deliveredDeliveryKeys.has(`${key}\u0000${item.dedupKey}`)) continue; // delivery.end 已完成：不重投
      const snapshot = this.persistableDeliveryItem(item);
      if (snapshot === undefined) continue;
      const [projectRoot = "", roleId = "", runtimeRaw = ""] = key.split("\u0000");
      items.push({ key: { projectRoot, roleId, runtime: runtimeRaw as RuntimeKind }, item: snapshot, state: "in-flight", enqueuedAt: item.enqueuedAt });
    }
    return items;
  }

  private deliveryQueuePersistenceFacts(): DeliveryQueuePersistenceFacts {
    return { managerId: this.managerId, ...structuredClone(this.deliveryPersistOutcome), ...(this.deliveryQueueStorePath ? { path: this.deliveryQueueStorePath } : {}),
      armed: this.deliveryStoreArmed, enqueuedSeq: this.deliveryPersistSeq,
      pending: this.deliveryPersistSeq - this.deliveryPersistOutcome.completedSeq,
      knownProducers: { openChains: this.openChains.size, deliveryClaims: this.drainClaimRecords.size, handbackCommits: this.taskHandbackCommits.size } };
  }

  private async finishStopPersistence(result: StopResult): Promise<StopResult> {
    // Capture both before awaiting: new external queue events remain legal and are not this stop's writes.
    const targetSeq = this.deliveryPersistSeq, chain = this.deliveryPersistChain, armed = this.deliveryStoreArmed;
    const outcome = await chain;
    const deliveryQueuePersistence = { managerId: this.managerId, ...structuredClone(outcome), targetSeq, armed, pending: targetSeq - outcome.completedSeq,
      ...(this.deliveryQueueStorePath ? { path: this.deliveryQueueStorePath } : {}) };
    if (outcome.committedSeq !== targetSeq) return { ...result, ok: false,
      note: `${result.note} ${mainT("main.session.releaseError", { detail: `delivery-queue-persistence-failed:${outcome.lastError?.code ?? "unknown"}` })}`,
      deliveryQueuePersistence };
    return { ...result, deliveryQueuePersistence };
  }

  /** Atomic writes stay asynchronous during delivery; stop awaits only its captured finite chain. */
  private persistDeliveryQueues(): void {
    const storePath = this.deliveryQueueStorePath;
    if (storePath === undefined || !this.deliveryStoreArmed) return;
    const seq = ++this.deliveryPersistSeq;
    this.publishDeliveryInventory("delivery-persistence-enqueued");
    let items: PersistedDeliveryItemV1[] | undefined, snapshotError: unknown, snapshotFailed = false;
    try { items = this.deliveryStoreItems(); } catch (error) { snapshotError = error; snapshotFailed = true; }
    this.deliveryPersistChain = this.deliveryPersistChain.then(async previous => {
      const tmp = `${storePath}.tmp-${process.pid}-${seq}`;
      let outcome: DeliveryQueuePersistenceOutcome;
      try {
        if (snapshotFailed) throw snapshotError;
        await fs.promises.mkdir(path.dirname(storePath), { recursive: true, mode: 0o700 });
        await fs.promises.writeFile(tmp, JSON.stringify({ version: 1, items }), "utf8");
        await fs.promises.rename(tmp, storePath);
        outcome = { ...previous, completedSeq: seq, committedSeq: seq };
      } catch (error) {
        const code = error !== null && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "unknown";
        outcome = { ...previous, completedSeq: seq, failureCount: previous.failureCount + 1, lastError: { seq, code, path: storePath } };
        try { createDiagnosticLogger({ component: "desktop.delivery" }).error("delivery.queue.persist.failed", error); } catch { /* error observation cannot erase the failed write */ }
        try { await fs.promises.rm(tmp, { force: true }); } catch { /* preserve original write failure */ }
      }
      this.deliveryPersistOutcome = outcome;
      this.publishDeliveryInventory("delivery-persistence-settled");
      return outcome;
    });
  }

  /** 读回一条持久条目（模型输入一律不可信：全量重校验；坏条 ⇒ undefined）。 */
  private parsePersistedDeliveryItem(raw: unknown): { projectRoot: string; roleId: string; runtime: RuntimeKind; item: DeliveryItem } | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const record = raw as Record<string, unknown>;
    const keyRaw = record.key;
    if (keyRaw === null || typeof keyRaw !== "object" || Array.isArray(keyRaw)) return undefined;
    const key = keyRaw as Record<string, unknown>;
    if (typeof key.projectRoot !== "string" || key.projectRoot === "") return undefined;
    if (typeof key.roleId !== "string") return undefined;
    if (typeof key.runtime !== "string" || !(RUNTIME_KINDS as readonly string[]).includes(key.runtime)) return undefined;
    const itemRaw = record.item;
    if (itemRaw === null || typeof itemRaw !== "object" || Array.isArray(itemRaw)) return undefined;
    const rawItem = itemRaw as Record<string, unknown>;
    const kind = rawItem.kind;
    if (kind !== "handback" && kind !== "dispatch" && kind !== "message" && kind !== "system") return undefined;
    if (typeof rawItem.text !== "string" || rawItem.text === "") return undefined;
    if (typeof rawItem.dedupKey !== "string" || rawItem.dedupKey === "") return undefined;
    const runtime = key.runtime as RuntimeKind;
    const targetRoleId =
      key.roleId !== "" ? key.roleId : typeof rawItem.targetRoleId === "string" ? rawItem.targetRoleId : "";
    let systemAssignment: DeliveryAssignment | null = null;
    if (rawItem.systemAssignment !== undefined && rawItem.systemAssignment !== null) {
      const value = rawItem.systemAssignment;
      if (typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, "taskId") || !Object.hasOwn(value, "actorRoleId") || !Object.hasOwn(value, "flowId")) return;
      const fields = value as Record<string, unknown>;
      if (typeof fields.taskId !== "string" || !fields.taskId || fields.actorRoleId !== targetRoleId || typeof fields.flowId !== "string" || !fields.flowId ||
          fields.runId !== undefined && (typeof fields.runId !== "string" || !fields.runId)) return;
      systemAssignment = { taskId: fields.taskId, actorRoleId: targetRoleId, flowId: fields.flowId, ...(typeof fields.runId === "string" ? { runId: fields.runId } : {}) };
    }
    let controllerResume: ControllerResumeDelivery | undefined;
    if (rawItem.controllerResume !== undefined) {
      const rawResume = rawItem.controllerResume;
      if (!rawResume || typeof rawResume !== "object" || Array.isArray(rawResume)) return;
      const fields = rawResume as Record<string, unknown>;
      if (Object.keys(fields).some(key => !["expected", "resumeKey", "basisDigest"].includes(key)) || !isDispatchTaskResumeController(fields.expected) ||
          typeof fields.resumeKey !== "string" || !fields.resumeKey || fields.resumeKey.length > 1000 || typeof fields.basisDigest !== "string" || !/^[a-f0-9]{64}$/i.test(fields.basisDigest) ||
          kind !== "dispatch" || targetRoleId !== "convener" || rawItem.sourceRoleId !== "chief" || rawItem.taskId !== fields.expected.taskId || rawItem.flowId !== fields.expected.flowId) return;
      controllerResume = { expected: structuredClone(fields.expected), resumeKey: fields.resumeKey, basisDigest: fields.basisDigest };
    } else if (rawItem.dedupKey.startsWith("hub-resume:")) return;
    const notificationSource = isDirectActionSource(rawItem.notificationSource) && rawItem.notificationSource.kind === "role-direct" ? rawItem.notificationSource : undefined;
    const item: DeliveryItem = {
      kind,
      runtime,
      targetRoleId,
      sourceRoleId: typeof rawItem.sourceRoleId === "string" ? rawItem.sourceRoleId : "",
      text: rawItem.text,
      summary: typeof rawItem.summary === "string" ? rawItem.summary : "",
      dedupKey: rawItem.dedupKey,
      queueEntryId: typeof rawItem.queueEntryId === "string" && /^[a-f0-9-]{36}$/i.test(rawItem.queueEntryId) ? rawItem.queueEntryId : randomUUID(),
      ...(rawItem.kind === "system" && rawItem.systemAssignment !== undefined ? { systemAssignment } : {}),
      ...(notificationSource ? { notificationSource } : {}),
      ...(controllerResume ? { controllerResume } : {}),
      enqueuedAt:
        typeof rawItem.enqueuedAt === "string" && rawItem.enqueuedAt !== ""
          ? rawItem.enqueuedAt
          : new Date(this.now()).toISOString(),
      ...(typeof rawItem.flowId === "string" && rawItem.flowId !== "" ? { flowId: rawItem.flowId } : {}),
      ...(typeof rawItem.taskId === "string" && rawItem.taskId !== "" ? { taskId: rawItem.taskId } : {}),
      ...(typeof rawItem.deliveryId === "string" ? { deliveryId: rawItem.deliveryId } : {}),
      ...(isAppTaskClientMessageId(rawItem.clientMessageId) ? { clientMessageId: rawItem.clientMessageId } : {}),
      ...(rawItem.handback !== undefined && rawItem.handback !== null && typeof rawItem.handback === "object"
        ? { handback: rawItem.handback as TaskHandback }
        : {}),
      ...(rawItem.report !== undefined && rawItem.report !== null && typeof rawItem.report === "object"
        ? { report: rawItem.report as RuntimeReportSnapshotV1 }
        : {}),
      ...(rawItem.liveReport !== undefined && rawItem.liveReport !== null && typeof rawItem.liveReport === "object"
        ? { liveReport: rawItem.liveReport as RuntimeLiveReportViewV1 }
        : {}),
      ...(rawItem.liveDurability === "memory-only" || rawItem.liveDurability === "unknown-live"
        ? { liveDurability: rawItem.liveDurability }
        : {}),
    };
    return { projectRoot: key.projectRoot, roleId: key.roleId, runtime, item };
  }

  /**
   * **启动/项目导入时恢复上次运行的投递队列并自动重投**（2026-10-20 客户要求「重启后任务自动续跑」）。
   * - `queued` 与 `in-flight` 一律按 queued 重新入内存队列（崩溃时在途回合会重新开始；任务文本自足，
   *   允许模型续做/重做）；
   * - 同一 `dedupKey` 已在内存队列/在途/已投递成功 ⇒ 跳过（重启后至多重投一次）；
   * - 复用既有 `enqueueDelivery` + `drainQueue`（不新造投递逻辑）；投递成功后由既有成功路径移除持久项；
   * - 损坏/不可读的存储文件 ⇒ 只记诊断、返回 0，不阻塞启动、不猜内容。
   */
  async restorePersistedDeliveries(): Promise<DeliveryQueueRestoreReport> {
    const storePath = this.deliveryQueueStorePath;
    const report: DeliveryQueueRestoreReport = { restored: 0, skipped: 0, items: [] };
    if (storePath === undefined) return report;
    const diagnostic = createDiagnosticLogger({ component: "desktop.delivery" });
    let text: string;
    try {
      text = await fs.promises.readFile(storePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.deliveryStoreArmed = true; // 无历史文件：从现在起正常持久化
      } else {
        diagnostic.error("delivery.queue.restore.failed", error); // 读失败：本次不武装（不覆盖可能仍可读的文件）
      }
      return report;
    }
    // 已读到磁盘内容（无论是否合法）：此后允许写——坏文件会被新状态替换（不阻塞启动，不猜内容）。
    this.deliveryStoreArmed = true;
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch (error) {
      diagnostic.error("delivery.queue.restore.failed", error);
      return report;
    }
    const rawItems =
      doc !== null && typeof doc === "object" && !Array.isArray(doc)
        ? (doc as Record<string, unknown>).items
        : undefined;
    if (
      doc === null ||
      typeof doc !== "object" ||
      (doc as Record<string, unknown>).version !== 1 ||
      !Array.isArray(rawItems)
    ) {
      diagnostic.record("delivery.queue.restore.invalid-shape");
      return report;
    }
    const seen = new Set<string>();
    const drainKeys = new Set<string>();
    for (const raw of rawItems as unknown[]) {
      const parsed = this.parsePersistedDeliveryItem(raw);
      if (parsed === undefined) {
        report.skipped += 1;
        continue;
      }
      const { projectRoot, roleId, runtime, item } = parsed;
      const queueKey = this.queueKey(projectRoot, roleId, runtime);
      const identity = `${queueKey}\u0000${item.dedupKey}`;
      if (seen.has(identity)) {
        report.skipped += 1;
        continue;
      }
      seen.add(identity);
      if (this.deliveredDeliveryKeys.has(identity)) {
        report.skipped += 1; // 本次运行已投递成功（防御：同 manager 重复恢复）
        continue;
      }
      if (isAppTaskClientMessageId(item.clientMessageId) && this.deliveredAppTaskIds.has(item.clientMessageId)) {
        report.skipped += 1; // 同一应用任务本次运行已 ACK/投递成功：恢复不重投（2026-10-25）
        continue;
      }
      if (this.activeDeliveries.get(queueKey)?.dedupKey === item.dedupKey) {
        report.skipped += 1;
        continue;
      }
      if ((this.deliveryQueues.get(queueKey) ?? []).some((queued) => queued.dedupKey === item.dedupKey)) {
        report.skipped += 1;
        continue;
      }
      if (item.kind === "dispatch" && this.activeDispatchKeys.has(item.dedupKey)) {
        report.skipped += 1;
        continue;
      }
      if (item.kind === "handback") this.enqueuedHandbackKeys.add(item.dedupKey);
      if (item.kind === "dispatch") this.activeDispatchKeys.add(item.dedupKey);
      if (typeof item.taskId === "string" && item.taskId !== "") {
        this.starTaskIds.add(item.taskId);
        if (taskCreators.get(item.taskId) === undefined) {
          const restored = (await this.readTasks(projectRoot)).records.get(item.taskId)?.created;
          if (restored !== undefined) this.rememberTaskCreator(item.taskId, restored);
        }
      }
      this.enqueueDelivery(projectRoot, roleId, {
        kind: item.kind,
        runtime,
        targetRoleId: item.targetRoleId,
        sourceRoleId: item.sourceRoleId,
        text: item.text,
        summary: item.summary || mainT("main.session.recoveryDelivery", { role: item.sourceRoleId }),
        dedupKey: item.dedupKey,
        ...(item.flowId !== undefined ? { flowId: item.flowId } : {}),
        ...(item.taskId !== undefined ? { taskId: item.taskId } : {}),
        ...(item.clientMessageId !== undefined ? { clientMessageId: item.clientMessageId } : {}),
        ...(item.handback !== undefined ? { handback: item.handback } : {}),
        ...(item.report !== undefined ? { report: item.report } : {}),
        ...(item.liveReport !== undefined ? { liveReport: item.liveReport } : {}),
        ...(item.liveDurability !== undefined ? { liveDurability: item.liveDurability } : {}),
        ...(item.controllerResume !== undefined ? { controllerResume: structuredClone(item.controllerResume) } : {}),
      });
      drainKeys.add(queueKey);
      report.restored += 1;
      report.items.push({ projectRoot, roleId, runtime, kind: item.kind, summary: item.summary });
    }
    diagnostic.record("delivery.queue.restored", { count: report.restored });
    // 自动重投（复用既有串行投递机；目标未开会自动开启，忙则排队——与正常运行完全同一条路径）。
    for (const queueKey of drainKeys) {
      const [projectRoot = "", roleId = "", runtimeRaw = ""] = queueKey.split("\u0000");
      void this.drainQueue(projectRoot, roleId === "" ? null : roleId, runtimeRaw as RuntimeKind);
    }
    return report;
  }

  /**
   * **撤回一条未投递的排队消息（P1-1，2026-10-13 客户裁定）**：`id` = 快照条目视图给出的 `id`
   * （即 `dedupKey`，单一来源）。语义钉死：
   * - **仅未投递者可撤**：条目仍在队列里 ⇒ 删除，`notifyRoleState` 快照外推（位次自然前移）；返回 `summary`
   *   供聊天流如实一行「已撤回排队消息：〈摘要〉」；
   * - **已进「进行中」（drain 已 shift、正投递）⇒ 撤回无效**：如实回错，**绝不**从执行里抽掉已在跑的东西；
   * - 不在队列（已投递完/已撤回/不存在）⇒ 如实回错；
   * - **仅「客户消息」类可撤**（客户自己的话）：派发/回交条目属治理流（单方面撤会破坏 su 验收/派发的
   *   因果）——本层拒绝非 message 条目，界面侧派发/回交**不给撤回钮**（呈现与语义同口径）。
   * 界面不碰内部结构：只凭快照的 `id` 说话（**不造第二套数据源**）。
   */
  withdraw(targetInput: string | SessionTarget, id: string): WithdrawResult {
    let roleId: string;
    if (typeof targetInput === "string") roleId = targetInput;
    else roleId = targetInput.roleId;
    if (typeof roleId !== "string" || roleId === "" || typeof id !== "string" || id === "") {
      return { ok: false, error: mainT("main.session.withdrawIncomplete") };
    }
    // ① 先查「**进行中**」：在跑条目已在 shift 后**不在队列里**（其队列键也可能已随清空删除）——
    // 直接沿 activeDeliveries 找：命中即撤回无效（如实，与「已投递完」区分开）。
    for (const [key, item] of this.activeDeliveries) {
      const target = key.split("\u0000")[1] ?? "";
      if (target === roleId && item.dedupKey === id) {
        return { ok: false, error: mainT("main.session.withdrawRunning") };
      }
    }
    // ② 再查排队中的条目：仅「客户消息」类可撤（派发/回交属治理流——只读）；找到即删 + 快照外推位次前移。
    for (const [key, q] of this.deliveryQueues) {
      const parts = key.split("\u0000");
      const projectRoot = parts[0] ?? "";
      const target = parts[1] ?? "";
      if (typeof targetInput !== "string" && ((targetInput.projectRoot && parts[0] !== targetInput.projectRoot) || (targetInput.runtime && parts[2] !== targetInput.runtime))) continue;
      if (target !== roleId) continue; // 只看该角色的队列（一套机多目标）
      const idx = q.findIndex((i) => i.dedupKey === id);
      if (idx < 0) continue;
      const item = q[idx];
      if (item.kind !== "message") {
        // G-2/W2：`system`（看护告警/收束/恢复回执）与派发/回交同归**治理流只读**面——本判据已覆盖第四类，
        // 不可撤回（呈现与语义同口径：界面侧对非 message 条目不给撤回钮）；文案保持原文（渲染侧源码钉在
        // 桌面UI 的 test/桌面应用/renderer.test.ts，本角色不改动他角色断言）。
        return { ok: false, error: mainT("main.session.withdrawNotCustomer") };
      }
      q.splice(idx, 1);
      if (q.length === 0) this.deliveryQueues.delete(key);
      this.notifyRoleState(projectRoot, roleId, item.runtime); // 位次前移/角标随之（既有快照机制；不造第二套）
      this.persistDeliveryQueues(); // 2026-10-20 重启续跑：撤回同步持久化
      return { ok: true, summary: item.summary };
    }
    return { ok: false, error: mainT("main.session.withdrawNotQueued") };
  }

  /** L-1/状态准确性 + 右栏「待办 / 队列」：**真实状态快照**外推（忙/闲 × 队列；变化时）——徽标/队列行/
   *  右栏待办组**都只信它**（同一通道、**不造第二套数据源**）。含：结构化的排队条目（来源/摘要/入队时间）
   *  与**正在跑的那条投递**（若有；标注「进行中」——排队 ≠ 已执行）。
   *  **P1-1（2026-10-13 客户裁定）**：条目视图增 `id`（= `dedupKey`，撤回的定位键）与 `full`（入队即定格的
   *  **全文**——抽屉内「展开看全文」用；摘要字段照旧只作列表显示）。 */
  private notifyRoleState(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): void {
    this.inventoryChanged(projectRoot, "role-state-observed");
    if (targetRoleId === "") return;
    const q = this.deliveryQueues.get(this.queueKey(projectRoot, targetRoleId, runtime)) ?? [];
    const entry = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, runtime));
    const busy = entry?.busy === true;
    const running = this.activeDeliveries.get(this.queueKey(projectRoot, targetRoleId, runtime));
    const now = this.now();
    /** **P0 队列可见性（2026-10-30）**：每条排队项的等待时长（ms；入队时刻定格，显示用）。 */
    const ageOf = (i: DeliveryItem): number => {
      const parsed = Date.parse(i.enqueuedAt);
      return Number.isFinite(parsed) ? Math.max(0, now - parsed) : 0;
    };
    const view = (i: DeliveryItem) => ({ runtime: i.runtime, kind: i.kind, sourceRoleId: i.sourceRoleId, summary: i.summary, at: i.enqueuedAt, id: i.dedupKey, full: i.kind === "handback" ? i.safeText ?? mainT("main.session.safeCopyPending") : i.text, ageMs: ageOf(i) });
    let contextInfo: Pick<OpenResult, "contextSource" | "contextWarning"> = {};
    if (entry) contextInfo = this.contextInfo(entry.handle);
    // **为什么没动**（单一来源＝会话内存态，不造第二套）：队首类别 / 阻塞原因 / 当前回合 id。
    // `origin-missing` = 忙态但无对应在跑回合（收尾异常，可用「停止本轮」复位）；
    // `target-busy` = 正常等待上一轮；`session-closed` = 目标会话未开且没有自动开启链；
    // `network`（P2）= 主进程网络离线，队列安全暂停（恢复后按既有顺序继续）。
    const runningOrigin = entry?.origins.running;
    const headKind = q.length > 0 ? q[0].kind : null;
    const blockedReason: "target-busy" | "origin-missing" | "session-closed" | "network" | null =
      q.length === 0
        ? null
        : this.deliveryIsStopped(this.queueKey(projectRoot, targetRoleId, runtime))
          ? "session-closed"
          : this.isNetworkOffline()
          ? "network"
          : busy
            ? (runningOrigin === undefined || runningOrigin.settled === true ? "origin-missing" : "target-busy")
            : entry === undefined
              ? (this.drainChains.has(projectRoot) ? null : "session-closed")
              : null;
    this.deps.emitRoleState?.({
      ...contextInfo,
      roleId: targetRoleId, projectRoot, runtime, profileRevision: entry?.profileRevision ?? this.profileRevision(runtime),
      busy,
      summaries: q.map((i) => i.summary),
      queue: q.map(view),
      running: running !== undefined && busy ? view(running) : null,
      headKind,
      blockedReason,
      activeTurnId: runningOrigin?.turnId ?? null,
    });
  }

  /** 界面（重）加载后请求重放全部在场会话的角色状态快照：状态只在变化时外推，晚订阅的渲染侧否则会丢失忙/闲与队列。 */
  broadcastRoleStates(): void {
    for (const entry of this.sessions.values()) {
      this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
    }
  }

  // —————————————— P2（2026-10-30）：网络状态 → 队列/状态快照 ——————————————

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private isNetworkOffline(): boolean {
    return this.diagnostics.isNetworkOffline();
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  applyNetworkState(state: NetworkState): void {
    this.diagnostics.applyNetworkState(state);
  }

  /** 持久化 scope（薄委托 → `session/persistence.ts`；方法体见模块）。 */
  private persistenceScope(entry: LiveSession): PersistenceScope { return this.persistence.persistenceScope(entry); }
  /** 持久化键（薄委托 → `session/persistence.ts`；方法体见模块）。 */
  private persistenceKey(scope: PersistenceScope, id: string): string { return this.persistence.persistenceKey(scope, id); }
  private displayHandback(event: HandbackEvent): DesktopOrchestrationEvent {
    const { handback: _internal, ...safe } = event;
    return { kind: 'handback', summary: event.report || event.liveReport ? safe.summary : mainT("ui.events.handbackLegacy"), ...(safe.report ? { report: safe.report } : {}), ...(safe.liveReport ? { liveReport: safe.liveReport } : {}), ...(safe.reportPersistence ? { reportPersistence: safe.reportPersistence } : {}) };
  }
  /** 合并报告保存状态（薄委托 → `session/persistence.ts`；方法体见模块）。 */
  private mergeReportState(entry: LiveSession, event?: HandbackEvent, update?: ReportSaveStateV1, updatedId?: string): void {
    this.persistence.mergeReportState(entry, event, update, updatedId);
  }
  /** 登记投递回执（薄委托 → `session/persistence.ts`；方法体见模块）。 */
  private rememberReceipt(entry: LiveSession, receipt: RuntimeDeliveryReceiptV1): void {
    this.persistence.rememberReceipt(entry, receipt);
  }
  /** 登记历史报告/回执 id（薄委托 → `session/persistence.ts`；方法体见模块）。 */
  registerPersistenceHistory(history: import('./runtime-history.ts').SessionHistoryView): void {
    this.persistence.registerPersistenceHistory(history);
  }
  /** 持久化操作（薄委托 → `session/persistence.ts`；方法体见模块）。 */
  async persistenceOperation<K extends keyof PersistenceValues>(scope: PersistenceScope, operation: K, id?: string): Promise<PersistenceReply<PersistenceValues[K]>> {
    return this.persistence.persistenceOperation(scope, operation, id);
  }

  /** 回交到达（E-1）：**去重登记**（`handbackKey` 单一来源——一条回交只投递一次）→ 入队 → 尝试投递。
   *  **真机崩溃修复（2026-10-12）**：本函数经 `void` fire-and-forget 调用（consume 的事件循环），**任何上抛
   *  都会变成未捕获拒绝**——故：(1) 形状防御（缺 `handback` 载荷 / 缺 `roleId`）先拦；(2) `renderHandbackPrompt`
   *  渲染包 try/catch（坏形状绝不喂给它）；(3) 整体再包一层 catch——一切都落**如实系统行**，绝不上抛。 */
  /**
   * 回交所归属的治理流程 id（收尾推进用）：取该回交真实轮次 origin 上的 `flowIds`——该 origin 由
   * Convener 派发的 `dispatch` 条目带入 flowId。多流程批次/旧调用/无 flowId ⇒ 返回 undefined（不猜、不派）。
   */
  private handbackFlowId(entry: LiveSession, hb: TaskHandback | undefined): string | undefined {
    if (hb === undefined || hb === null || typeof hb !== "object") return undefined; // 坏形状交给 handleHandback 的防御分支
    const origin = typeof hb.turnId === "string" && hb.turnId !== ""
      ? entry.origins.byTurn.get(hb.turnId)
      : entry.origins.running;
    const flowIds = origin?.flowIds ?? [];
    return flowIds.length === 1 ? flowIds[0] : undefined;
  }

  /** **坏形状防御（v2.0.0 B8 回归修复）**：按 `TaskHandback` 契约校验必要字段类型。
   *  真机形态是事件载荷缺失（`handback: undefined`）——修复前 `handleHandback` 先读 `hb.taskId` ⇒
   *  TypeError 被事件消费环兜底为通用「会话事件流异常」，专用「形状不符」防线失效。
   *  `roleId`/`status`/`summary`/`evidence`/`at` 是 `handbackKey`/渲染/落账的最小必要面；
   *  可选字段若出现也按契约校验类型。坏形状一律交给 `commitHandback` 既有 fail-closed 分支。 */
  private isTaskHandbackShape(value: unknown): value is TaskHandback {
    if (value === null || typeof value !== "object") return false;
    const hb = value as Partial<Record<keyof TaskHandback, unknown>>;
    if (typeof hb.roleId !== "string") return false;
    if (hb.status !== "completed" && hb.status !== "blocked" && hb.status !== "unreported" && hb.status !== "failed" && hb.status !== "aborted") return false;
    if (typeof hb.summary !== "string") return false;
    if (!Array.isArray(hb.evidence) || !hb.evidence.every((item) => typeof item === "string")) return false;
    if (typeof hb.at !== "string") return false;
    if (hb.taskId !== undefined && typeof hb.taskId !== "string") return false;
    if (hb.turnId !== undefined && typeof hb.turnId !== "string") return false;
    if (hb.round !== undefined && typeof hb.round !== "number") return false;
    return true;
  }

  private handleHandback(projectRoot: string, runtime: RuntimeKind, hb: TaskHandback, report?: RuntimeReportSnapshotV1, liveReport?: RuntimeLiveReportViewV1, liveDurability?: 'memory-only' | 'unknown-live', flowId?: string): Promise<boolean> {
    // 形状防御必须在读 `hb.taskId` **之前**（v2.0.0 B8：此前坏载荷会抛 TypeError，退化为事件流异常）。
    if (!this.isTaskHandbackShape(hb)) return this.commitHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId);
    if (!hb.taskId) return this.commitHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId);
    const key = `${projectRoot}\u0000${hb.taskId}`;
    // Consecutive real turns of one task can finish before the prior detached report is registered.
    // Order those existing observations; never retry a rejected business operation or wait for the creator's model turn.
    const prior = this.taskHandbackCommits.get(key) ?? Promise.resolve();
    const attempt = prior.then(() => this.commitHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId));
    const committed = attempt.then(() => undefined, () => undefined);
    this.taskHandbackCommits.set(key, committed);
    void committed.then(() => { if (this.taskHandbackCommits.get(key) === committed) this.taskHandbackCommits.delete(key); });
    return attempt;
  }

  private async commitHandback(projectRoot: string, runtime: RuntimeKind, hb: TaskHandback, report?: RuntimeReportSnapshotV1, liveReport?: RuntimeLiveReportViewV1, liveDurability?: 'memory-only' | 'unknown-live', flowId?: string): Promise<boolean> {
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: hb?.roleId });
    diagnostic.record("report.received", { outcome: hb?.status });
    let pendingKey: string | undefined;
    try {
      if (!this.isTaskHandbackShape(hb)) {
        this.emitDeliveryNote(projectRoot, runtime,
          this.handbackOwnerRoleId(projectRoot),
          mainT("main.common.unknownRole"),
          mainT("main.session.handbackMalformed")
        );
        return false;
      }
      hb = structuredClone(hb);
      if (report) report = structuredClone(report);
      if (liveReport) liveReport = structuredClone(liveReport);
      const ownerRoleId = this.handbackOwnerRoleId(projectRoot);
      // 2026-10-29（方案 v2.1 §5.1/M9，F1）：任务绑定报告**按 `task.created.from` 回创建者**——
      // 项目 worker/质检 → 发起者（运营或幕僚）；产品/策划/人事/运营由幕僚派发 → 幕僚。
      // 无任务绑定的内置 worker → 幕僚（下方既有防御分支）。用同步内存索引，避免读盘改变并发回交顺序。
      const starTask = typeof hb.taskId === "string" && hb.taskId !== "" && this.starTaskIds.has(hb.taskId);
      const chiefRoleId = this.chiefTaskRoleIdOf(projectRoot);
      const convenerRoleId = this.handbackOwnerRoleId(projectRoot);
      const taskCreator = starTask ? taskCreators.get(hb.taskId!) : undefined;
      // 2026-10-24（治理协调，设计 v1 §6.2/§6.3）：**按来源**选回交目标——
      //  · 内置治理角色（Draft/Steward/Crew/Proof；编排 `suppressHandback` 正常不发，这里只做防御路由）
      //    → Lead（`primaryRoleId`），Lead 自身不自我回交；single/su 保持旧行为（内置来源不自我回交）。
      //  · 项目 worker → Steward（`handbackOwnerRoleId` 不变；single 仍是 su）。
      // 不解除编排的 `suppressHandback`、不新增工具/账本 kind；只是消息路由。
      const listing = this.findListingForFeedback(projectRoot);
      const model: GovernanceModel = listing?.governanceModel ?? "single";
      const builtInSource = isBuiltInGovernanceRoleId(hb.roleId);
      let targetRoleId: string | null = ownerRoleId;
      if (starTask && hb.roleId !== chiefRoleId) {
        // 任务绑定：按创建者路由（creator 缺失的旧记录按 chief 兼容，保持既有主链行为）。
        targetRoleId = reportTargetForTaskCreator({ creator: taskCreator ?? "chief", chiefRoleId, convenerRoleId });
      } else if (builtInSource) {
        if (model !== "trio") return false; // single/su：内置来源（su 自身）不自我回交（旧行为逐字不变）
        const leadRoleId = typeof listing?.primaryRoleId === "string" ? listing.primaryRoleId : "";
        if (leadRoleId === "") return false; // 主入口未枚举到：不猜、不改投 Steward；settle 反馈同样按无 listing 跳过
        if (hb.roleId === leadRoleId) return false; // Lead 自身不自我回交（防循环）
        targetRoleId = leadRoleId;
      } else if (ownerRoleId !== null && hb.roleId === ownerRoleId) {
        return false; // single su 自身等防御（trio 的 Convener 走上方内置分支）
      }
      const key = `${projectRoot}\u0000${runtime}\u0000${handbackKey(hb)}`;
      let alreadyReported = false;
      // BUG-5（2026-11-05 精化）：任务已收口或**同一回合**已报告 ⇒ 重复回交不再入队；
      // blocked 之后的新回合真实报告必须投递（详见 shouldSuppressStarTaskReport 注释）。
      let closedStageRequestObservation = false;
      if (starTask && typeof hb.taskId === "string" && hb.taskId !== "") {
        const record = (await this.readTasks(projectRoot)).records.get(hb.taskId);
        // B19（2026-11-11，RR14）：已收口 **stage-request** 的最终报告不能按普通 task.reported
        // 观察写入（closed 任务的 task observation 会被 `task-observation-invalid` 拒绝），但
        // 报告本身仍须投递给 chief。标记后跳过 observation，直接进入投递队列。
        closedStageRequestObservation = record?.closed !== undefined && record.created?.taskKind === "stage-request";
        // B19：已收口 **stage-request** 的任务收口抑制不适用——幕僚通常在
        // 运营交最终报告前关闭调度请求；该报告是阶段完成/下一阶段的唯一唤醒来源，必须入队投递。
        // 生产任务的 closed/同回合抑制保持 BUG-5 原语义（重复回交不入队）。
        const suppressed = record !== undefined && !closedStageRequestObservation
          && shouldSuppressStarTaskReport({
            closed: record.closed !== undefined,
            priorTurnIds: record.reports.map((entry) => entry.turnId),
            ...(hb.turnId !== undefined ? { turnId: hb.turnId } : {}),
          });
        if (suppressed) {
          diagnostic.record("report.suppressed.task-terminal", {
            taskId: hb.taskId,
            closed: record?.closed !== undefined,
            reports: record?.reports.length ?? 0,
          });
          if (record?.closed !== undefined) return false;
          if (this.enqueuedHandbackKeys.has(key)) return true;
          alreadyReported = true; // Durable prior report without a delivery: resume only its informational handback.
        }
      }
      if (this.enqueuedHandbackKeys.has(key)) {
        diagnostic.record("report.duplicate");
        return true;
      }
      if (this.pendingHandbackKeys.has(key)) return false;
      this.pendingHandbackKeys.add(key); pendingKey = key;
      // B 批：工作结果事件（`task.reported`）——按 `taskId+turnId` 去重；写失败只诊断、不丢报告
      // （失败保 saved snapshot，可在真实新事实或显式保存/投递操作后重核；不假称已登记/已投递）。
      if (starTask && typeof hb.taskId === "string" && !closedStageRequestObservation) {
        const reportKey = `${hb.taskId}\u0000${hb.turnId ?? createHash("sha256").update(hb.summary).digest("hex").slice(0, 16)}`;
        if (!this.reportedTaskKeys.has(reportKey) && !alreadyReported) {
          // Delivery's own post-send ledger writer is independent of this detached consumer.
          const delivery = this.taskDeliveryCommits.get(`${projectRoot}\u0000${hb.taskId}`);
          if (delivery) await delivery.done;
          const reportedAt = Date.parse(hb.at);
          const event = taskEvent("task.reported", {
            taskId: hb.taskId,
            from: hb.roleId,
            status: taskReportStatusOf(hb.status),
            summary: shortenSummary(hb.summary),
            ...(hb.evidence.length > 0 ? { evidence: hb.evidence.slice(0, 5) } : {}),
            ...(hb.turnId !== undefined && hb.turnId !== "" ? { turnId: hb.turnId } : {}),
          }, () => Number.isFinite(reportedAt) ? new Date(reportedAt) : new Date(this.now()));
          const registered = await this.appendTaskStateResult(projectRoot, event);
          if (!registered.ok) {
            this.emitDeliveryNote(projectRoot, runtime, targetRoleId, hb.roleId,
              `任务报告已保存但状态登记失败，尚未投递给原创建者：${registered.code}：${registered.message}`);
            return false;
          }
          this.reportedTaskKeys.add(reportKey);
        }
      }
      // 2026-11-05（客户最终口径：不是自动发卡，是让运营自己选择）：star 任务报告 blocked（trio、flowId 可解析）
      // 时**首次即**给 convener 一条 delivery-note 提示——是否调用 `report_plan_escalation`
      // （category 选 scheme/environment/authority/evidence）向客户发方案升级卡，或继续核查/派重做，由运营自行判断。
      // 应用**不自动发卡、不替运营或客户做决定**。节流：同 flow 有在途升级卡 ⇒ 不提示；已提示且未 done ⇒ 不重复；
      // done/failed/aborted 或升级卡成功提交 ⇒ 清除标记（下一次 blocked 可再提示）。
      if (model === "trio" && starTask && typeof hb.taskId === "string" && hb.taskId !== "") {
        const promptRecord = (await this.readTasks(projectRoot)).records.get(hb.taskId);
        const promptFlowId = flowId ?? promptRecord?.created?.flowId;
        if (promptFlowId !== undefined && promptFlowId !== "") {
          const promptKey = `${projectRoot}\u0000${promptFlowId}`;
          const reportStatus = taskReportStatusOf(hb.status);
          if (reportStatus === "blocked") {
            if (!this.planEscalations.has(promptKey) && !this.planEscalationPrompted.has(promptKey)) {
              if (this.deps.customerInput !== undefined) {
                this.planEscalationPrompted.add(promptKey);
                const convener = this.handbackOwnerRoleId(projectRoot) ?? "convener";
                const runtimeForNote =
                  this.findLiveRuntime(projectRoot, convener) ??
                  this.lastGovernanceRuntime.get(projectRoot) ??
                  this.activeRuntimeFor(projectRoot) ??
                  "demo";
                this.emitDeliveryNote(
                  projectRoot,
                  runtimeForNote,
                  convener,
                  "convener",
                  mainT("main.planEscalation.blockedPrompt", {
                    flowId: promptFlowId,
                    summary: shortenSummary(hb.summary, 160),
                  }),
                );
              } else {
                // 无客户卡通道 ⇒ 只记诊断；不提示、不影响报告路由、不伪造裁定。
                createDiagnosticLogger({ component: "desktop.session", projectRoot }).record("plan-escalation.prompt.skipped", {
                  requestId: `plan-escalation-${promptFlowId}`,
                  reasonCode: "customer-card-channel-unavailable",
                });
              }
            }
          } else {
            // done/failed/aborted 都清除「已提示」标记——避免陈旧标记阻断后续新的 blocked（取舍见变更记录）。
            this.planEscalationPrompted.delete(promptKey);
          }
        }
      }
      // 输入文案：编排的 `renderHandbackPrompt`（**单一来源**——两前端共用，本层不各写一份）；**入队即定格**。
      // B 批：星形任务回交用 `renderWorkReportPrompt`（`[工作结果]` 固定字段）；旧 flow 回交逐字不变。
      // 渲染失败（载荷再坏一档）→ 如实系统行 + 不入队（**绝不**把 undefined 喂进渲染函数）。
      let text: string;
      try {
        text = starTask ? renderWorkReportPrompt(hb) : renderHandbackPrompt(hb);
      } catch (err) {
        this.emitDeliveryNote(projectRoot, runtime,
          targetRoleId,
          hb.roleId,
          mainT("main.session.handbackRenderFailed", { detail: err instanceof Error ? err.message : String(err) })
        );
        return false;
      }
      if (starTask && hb.taskId !== undefined && (targetRoleId === "chief" || targetRoleId === "convener")) {
        const closing = await prepareCreatedTaskClose({ projectRoot, actorRoleId: targetRoleId, taskId: hb.taskId });
        text += closing.ok
          ? `\n\n[应用绑定的原创建者收口依据]\n${JSON.stringify(closing)}\n由原创建者核对报告后调用 close_created_task；报告返回不等于任务已收口。`
          : `\n\n[收口依据尚不可用] ${closing.message}`;
      }
      this.enqueueDelivery(projectRoot, targetRoleId ?? "", {
        kind: "handback",
        runtime,
        targetRoleId: targetRoleId ?? "",
        sourceRoleId: hb.roleId,
        text,
        summary: mainT("ui.events.handbackDeliveryWithRole", { role: hb.roleId }),
        dedupKey: key,
        handback: hb,
        ...(starTask && hb.taskId !== undefined ? { taskId: hb.taskId } : {}),
        ...(flowId !== undefined ? { flowId } : {}),
        ...(report ? { report } : {}),
        ...(liveReport ? { liveReport, liveDurability } : {}),
      });
      this.enqueuedHandbackKeys.add(key);
      // 内置来源回交已投 Lead ⇒ 同一轮 settle 的治理反馈不再重复投（短时标记，见 mirrorGovernanceFeedback）。
      if (builtInSource && model === "trio") {
        this.governanceHandbackMirrored.set(this.queueKey(projectRoot, hb.roleId, runtime), this.now());
        diagnostic.record("report.routed.lead", { targetRoleId: targetRoleId ?? "" });
      }
      diagnostic.record("report.enqueued");
      await this.drainQueue(projectRoot, targetRoleId, runtime);
      return true;
    } catch (err) {
      diagnostic.error("report.failed", err);
      // 兜底（belt & braces）：任何意外都如实拦截为系统行——**不产生未捕获拒绝**。
      this.emitDeliveryNote(projectRoot, runtime,
        this.handbackOwnerRoleId(projectRoot),
        mainT("main.common.unknownRole"),
        mainT("main.session.handbackException", { detail: err instanceof Error ? err.message : String(err) })
      );
      return false;
    } finally {
      if (pendingKey) this.pendingHandbackKeys.delete(pendingKey);
    }
  }

  /**
   * H-1：su 派发任务的路由（注入 su 会话的 `dispatch_task` 能力；**复用 E-1 投递机**）。
   * 校验（**如实回执**，绝不静默）：目标须是**本项目角色**且**不是内置治理角色**（含 su 自身）。
   * 回执语义：**入队即回 `{ok:true,"已受理…"}`**（受理≠已完成——目标收到/失败会在两边聊天流如实显示）；
   * 失败原因进回执（工具如实转达 su）并同步放系统行。去重：`roleId\0task\0reason`——**队列期**窗口去重
   * （载荷无 id/时间，契约钉死不扩；投递成功即释放，**返工可再派发同文任务**）；一条派发**只在在途窗口**受限。
   *
   * **首轮寻址修复（2026-10-13 真机 bootstrap J-1 缺陷）**：角色表是**导入项目时枚举的缓存**——全新空项目
   * bootstrap 首轮里，su 建好角色后**同一轮内**就派发，缓存里还没有新角色（那时 `角色卡/` 不存在）
   * ⇒ 旧实现如实回「不在本项目（未枚举到）」——J-1「落盘后自动开工」首轮必失败。现：缓存 miss 时经
   * `deps.refreshListing` **实时重枚举一次**（与界面 `listProject` 同一路径、刷**同一份**共享缓存——
   * 后续 `openInternal` 自动开会话读的也是它）再判；重枚举失败/仍无 ⇒ 按原口径如实拒绝（不静默、不重试风暴）。
   * 异步回执：契约 `DispatchTaskFn` 本就允许 `Promise<DispatchReceipt>`（工具侧 await）。
   *
   * **G-1／A2（2026-10-16 客户批准；设计 `2026-10-16_design_contract-workflow-dispatch.md` §四/§八；编排 A1
   * 接口交回 §五）——必读块接线**：提取/判据/渲染的**单一来源** = 编排 `extractDispatchReadPaths` /
   * `planDispatchDelivery` / `renderDispatchPrompt`（只读导入，本层**只做接线**）。投递时对任务文本提取的
   * 引用路径逐个 `filePrint` 探测（复用带缓存的 sha256 指纹；`<missing>` 原样传入——判据天然按缺失处理）；
   * **判据紧挨去重登记（`activeDispatchKeys.add`）之前**：拒投**不登记、不入队、不开目标会话**（登记在
   * 「送达」时才释放——若先登记后拒投，键永不释放 ⇒ 契约修好后重派同一任务文本会被误去重）；**契约缺失
   * ⇒ fail-closed 拒投**（`fail(plan.message, plan.systemRow)`：回执给工具 + 系统行进 su 聊天流，绝不静默）；
   * **workflow 缺失 ⇒ 降级标注（照投）**；无引用 ⇒ 文本 = 单一来源 `renderDispatchPrompt` 旧格式逐字。
   * 放行文本**入队即定格**（重试复用同一份——绑定「派发那一刻的契约版本」）。回交与客户消息**不经过**本段
   * （不受必读块影响）。
   */
  private async routeDispatch(projectRoot: string, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload, source?: ActualDispatchSource): Promise<DispatchReceipt> {
    const targetRoleId = d && typeof d.roleId === "string" ? d.roleId.trim() : "";
    const task = d && typeof d.task === "string" ? d.task : "";
    const fail = (message: string, row: string): DispatchReceipt => {
      this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, row);
      return { ok: false, message };
    };
    if (targetRoleId === "" || task.trim() === "") {
      return fail(mainT("main.session.dispatchRejectedEmpty"), mainT("main.session.dispatchRejectedEmpty"));
    }
    // —— 来源防御性校验 ——
    // trio：只有幕僚（chief）可派发（星形主链）；single：主入口（su）。正常路径由 `open()` 的能力注入
    // 保证；这里再拒一次（绝不把「谁调用」当授权）。
    const listing = this.deps.getListing(projectRoot);
    const model: GovernanceModel = listing?.governanceModel ?? "single";
    const starChiefRoleId = this.chiefTaskRoleIdOf(projectRoot);
    if (model === "trio") {
      // 2026-10-29（方案 v2.1/Topology v4.1）：幕僚（主链/验收调度）与运营（实现/验收核对）都可派发；
      // 具体目标矩阵由 `evaluateDispatchPreflight`（M5–M8）机械执行，来源只做身份判断。
      const convenerCandidate = this.handbackOwnerRoleId(projectRoot);
      const isChiefSource = starChiefRoleId !== null && fromRoleId === starChiefRoleId;
      const isConvenerSource = convenerCandidate !== null && fromRoleId === convenerCandidate;
      if (!isChiefSource && !isConvenerSource) {
        return fail(
          mainT("main.session.dispatchWrongSource", {
            from: this.roleDisplayName(projectRoot, fromRoleId),
            dispatcher: starChiefRoleId !== null ? this.roleDisplayName(projectRoot, starChiefRoleId) : fromRoleId,
            modelNote: mainT("main.session.dispatchModelNote"),
          }),
          mainT("main.session.dispatchWrongSourceShort", { from: fromRoleId, dispatcher: fromRoleId }),
        );
      }
      // T3（2026-11-10 两条固定工作流路径，B1 AC-12）：trio 下按**被派任务的 flowId** 现场解析
      // 工作流模式（不缓存项目级单值；混合项目按 flow 分别路由）。`fixed` ⇒ 新固定路径路由；
      // 空 flowId / `legacy` / B1 启用闸未开（项目未显式 fixed 且该 flow 无 fixed workflow）⇒ 现有
      // 星形路由**逐字不变**（旧谓词/旧内联拒绝全部保留）。
      // T3 B3（AC-12/v1.3 §4.1 第 4 条）：**首次 fixed 启动顺序**——幕僚的首个 stage-request 携带
      // `workflowPath` 且启用闸未开时，先经 `ensureFixedPathStarted` 原子写 `.ans/project.json
      // workflowSchema:"two-fixed-paths/v1"`（显式 legacy/v1 不覆盖；写失败 ⇒ `project-config-write-failed`
      // fail-closed、不弹卡），再按复核后的模式路由。其余派发路径不写配置（旧项目/旧夹具零变化）。
      // T3 B7.1（2026-11-11，RR2 根因 `fixed-stage-request-fail-open`）：fixed 聊天会话**先按会话模式
      // fail-closed**——缺 `flowId/workflowPath/stage/workflowAction/roleId` 的 stage-request 与无
      // `workflowId/stage` 的普通派发一律拒绝：不创建任务、不写 `.ans/runs`/`.ans/trunk`、绝不回落
      // legacy 星形派发（RR2 实测 legacy 受理写盘的偏航路径就此关闭）。
      // legacy 聊天会话（旧项目/在飞 legacy run/显式 legacy/v1）的既有 flowId→fixed/星形路径逐字不变。
      const chatMode = await sessionWorkflowModeForChat(projectRoot);
      const dispatchFlowId = dispatchFlowIdOf(d);
      if (chatMode === "fixed") {
        if (d.taskKind === "stage-request") {
          const convenerRoleId = this.handbackOwnerRoleId(projectRoot) ?? "convener";
          const invalid: string[] = [];
          if (dispatchFlowId === "") invalid.push("flowId");
          if (!isWorkflowPath(d.workflowPath)) invalid.push('workflowPath:"A"|"B"');
          if (!isWorkflowStage(d.stage)) invalid.push("stage（A1–A13 含 A12a/A12b，或 B1–B4）");
          if (d.workflowAction !== "advance") invalid.push('workflowAction:"advance"');
          if (targetRoleId !== convenerRoleId) invalid.push(`roleId（运营 ${convenerRoleId}）`);
          if (invalid.length > 0) {
            const detail = `固定路径的 stage-request 缺少或非法：${invalid.join("、")}。stage-request 必须同时给出非空 flowId、workflowPath:"A"|"B"、合法 stage、workflowAction:"advance"、roleId（运营 ${convenerRoleId}）；本次未创建任务、未写 legacy 账本。`;
            return fail(`stage-request-invalid：${detail}`, `stage-request-invalid：${detail}`);
          }
          // 首个 stage-request 的 fixed 启动顺序（B3 既有逻辑）：启用闸未开先原子写 workflowSchema；
          // 失败 fail-closed。启动后仍不是 fixed（如该 flow 有在飞 legacy run）⇒ 拒绝，不回落星形。
          let dispatchMode: WorkflowMode;
          if (await isFixedPathEnabledForFlow(projectRoot, dispatchFlowId)) {
            dispatchMode = await resolveFixedPathMode(projectRoot, dispatchFlowId);
          } else {
            const started = await ensureFixedPathStarted(projectRoot, dispatchFlowId);
            if (!started.ok) {
              return fail(`${started.code}：${started.message}`, started.message);
            }
            dispatchMode = started.mode;
          }
          if (dispatchMode !== "fixed") {
            const detail = "固定会话的 stage-request 未能解析为 fixed workflow（该 flow 仍为 legacy）；按 fail-closed 拒绝，不回落 legacy 星形派发。";
            return fail(`stage-request-invalid：${detail}`, `stage-request-invalid：${detail}`);
          }
          return this.routeFixedPathDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId);
        }
        // A12a/A12b/verifier 直派等 fixed 任务：必须携带账本绑定证据（workflowId+stage）。
        const fixedWorkflowId = typeof d.workflowId === "string" ? d.workflowId.trim() : "";
        if (fixedWorkflowId !== "" && d.stage !== undefined) {
          return this.routeFixedPathDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId);
        }
        // T3 B8.2（2026-11-11，RR3 根因 2）：**运营（convener）的生产派发不要求模型自报 workflowId/stage**——
        // 由 `routeFixedPathDispatch` 从当前真实受派 stage-request 任务自动绑定（运营在真实任务文本里
        // 无法获知 workflowId；RR3 的 9 次合法派发就是在这一步被 `stage-request-required` 拒绝后回落
        // legacy stable-write）。绑定失败/不一致在路由内 fail-closed（`workflow-binding-unavailable` /
        // `stage-request-invalid`），仍不回落 legacy 星形派发。幕僚（chief）的缺字段派发照旧拒绝。
        const convenerRouteId = this.handbackOwnerRoleId(projectRoot) ?? "convener";
        if (fromRoleId === convenerRouteId) {
          return this.routeFixedPathDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId);
        }
        const requiredDetail = "固定路径的幕僚派发必须是 stage-request（taskKind/workflowPath/stage/flowId）或带 workflowId/stage 的 fixed 任务。";
        return fail(
          `stage-request-required：${requiredDetail}`,
          `stage-request-required：已拒绝 legacy 星形派发（${targetRoleId}）；${requiredDetail}`,
        );
      }
      if (dispatchFlowId !== "") {
        let dispatchMode = await resolveFixedPathMode(projectRoot, dispatchFlowId);
        if (
          dispatchMode === "legacy"
          && isChiefSource
          && d.taskKind === "stage-request"
          && d.workflowPath !== undefined
          && d.workflowAction !== "stop"
          && !(await isFixedPathEnabledForFlow(projectRoot, dispatchFlowId))
        ) {
          const started = await ensureFixedPathStarted(projectRoot, dispatchFlowId);
          if (!started.ok) {
            return fail(`${started.code}：${started.message}`, started.message);
          }
          dispatchMode = started.mode;
        }
        if (dispatchMode === "fixed") {
          return this.routeFixedPathDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId);
        }
      }
      // 星形任务链（`tasks.jsonl`；不套旧 flow 派发门）；前置检查在 task.created 之前（F10）。
      return this.routeStarDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source);
    }
    const dispatcherRoleId = this.dispatcherRoleIdOf(projectRoot);
    if (dispatcherRoleId === null) {
      return fail(
        mainT("main.session.dispatchNoDispatcher"),
        mainT("main.session.dispatchNoDispatcherShort"),
      );
    }
    if (fromRoleId !== dispatcherRoleId) {
      return fail(
        mainT("main.session.dispatchWrongSource", {
          from: this.roleDisplayName(projectRoot, fromRoleId),
          dispatcher: this.roleDisplayName(projectRoot, dispatcherRoleId),
          modelNote: "",
        }),
        mainT("main.session.dispatchWrongSourceShort", { from: fromRoleId, dispatcher: dispatcherRoleId }),
      );
    }
    const findTarget = (): { builtIn?: boolean } | undefined => {
      const current = this.deps.getListing(projectRoot);
      return current ? current.roles.find((r) => r.roleId === targetRoleId) : undefined;
    };
    let target = findTarget();
    if (!target) {
      // 缓存 miss ⇒ 实时重枚举**一次**再重试（bootstrap 首轮 / Nominator 刚写出的角色卡：缓存来自
      // 导入时点或上一轮——W6-B 真机阻塞修复）。仍 miss ⇒ 按原口径如实拒绝，不循环、不上抛。
      await this.refreshListingNow(projectRoot);
      target = findTarget();
    }
    if (!target) {
      return fail(
        mainT("main.session.dispatchUnknownTarget", { roleId: targetRoleId }),
        mainT("main.session.dispatchUnknownTargetShort", { roleId: targetRoleId })
      );
    }
    // single：内置治理角色默认拒绝（目标须是项目角色）。
    if (target.builtIn === true || isBuiltInGovernanceRoleId(targetRoleId)) {
      return fail(
        mainT("main.session.dispatchBuiltinTarget", { roleId: targetRoleId }),
        mainT("main.session.dispatchBuiltinTargetShort", { roleId: targetRoleId })
      );
    }
    const reason = d && typeof d.reason === "string" ? d.reason : undefined;
    const flowId = d && typeof d.flowId === "string" ? d.flowId : undefined;
    const stepId = d && typeof d.stepId === "string" ? d.stepId : undefined;
    // —— G-1／A2：必读引用接线（提取/判据/渲染 = 编排三件套单一来源；本层只探测 + 按判据分流）——
    // 探测：逐引用算文件**当刻字节**的内容 sha256（复用 `filePrint`；缺失/读失败返回 `<missing>`——
    // `planDispatchDelivery` 判据内天然按缺失处理，无需本层再映射）。
    const probes = new Map<string, string | undefined>();
    for (const readPath of extractDispatchReadPaths(task)) {
      probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
    }
    // 判据必须**紧挨去重登记之前**（见方法注释：拒投不登记——防「键在送达才释放」被拒投项拖成残留误去重）。
    const plan = planDispatchDelivery({ roleId: targetRoleId, task, reason }, probes, { sourceRoleId: this.roleDisplayName(projectRoot, fromRoleId) });
    if (plan.action === "reject") {
      // fail-closed 拒投：不入队、不登记去重键、不开目标会话；如实回执（工具）+ 系统行（主人聊天流）。
      return fail(plan.message, plan.systemRow);
    }
    // 去重键（评审 §5.6/§6.3-5）：既有 `roleId\0task\0reason` 之外增 `flowId\0stepId`（缺失为空串——
    // single 旧行为不变）。2026-10-20：Lead→Steward 协调消息**不套用项目步骤的 duplicate-dispatch 去重**
    // （coordinate 门已跳过该规则），这里仍按内容/在途窗口正常去重（送达即释放，同文可再次协调）。
    const dedupKey = `${projectRoot}\u0000${runtime}\u0000${targetRoleId}\u0000${task}\u0000${reason ?? ""}\u0000${flowId ?? ""}\u0000${stepId ?? ""}`;
    if (this.activeDispatchKeys.has(dedupKey)) {
      return { ok: true, message: mainT("main.session.dispatchDuplicate", { roleId: targetRoleId }) };
    }
    this.activeDispatchKeys.add(dedupKey);
    // 2026-10-29（BUG-5）：无活会话时先同步 open/resume；失败 ⇒ 释放去重键并如实拒发（不入队）。
    if (!this.sessions.has(this.sessionKey(projectRoot, targetRoleId, runtime))) {
      const opened = await this.openInternal({ projectRoot, roleId: targetRoleId, runtime }, false);
      if (!opened.ok) {
        this.activeDispatchKeys.delete(dedupKey);
        return fail(
          mainT("main.session.dispatchTargetOpenFailed", {
            target: this.roleDisplayName(projectRoot, targetRoleId),
            detail: opened.error ?? mainT("shared.common.unknownReason"),
          }),
          "派发未投递：目标会话无法打开（未入队；已如实回执）。",
        );
      }
    }
    this.enqueueDelivery(projectRoot, targetRoleId, {
      kind: "dispatch",
      runtime,
      targetRoleId,
      sourceRoleId: fromRoleId,
      ...(flowId !== undefined ? { flowId } : {}),
      // 文本：编排 `planDispatchDelivery` 产出的定格文本（必读块已由**同一单一来源** `renderDispatchPrompt`
      // 注入；无引用 = 旧格式逐字）——本层不另写渲染（本地副本 `renderDispatchPromptLocal` 已删除）。
      text: plan.text,
      summary: mainT("main.session.dispatchSummary", { from: this.roleDisplayName(projectRoot, fromRoleId), text: shortenText(task, 40) }),
      dedupKey,
      // 2026-10-25：派发任务的**内容稳定身份**（含 project/runtime/target/正文/reason/flowId/stepId）——
      // 重建续投/恢复项与新的同任务调用相认；ACK/送达后记「已投递」。显式重新入队（返工同文再派）
      // 由 `enqueueDelivery` 清除标记 ⇒ 返工回路不受影响。
      clientMessageId: this.appDispatchClientMessageId(dedupKey),
    });
    void this.drainQueue(projectRoot, targetRoleId, runtime);
    const openNote = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, runtime)) ? "" : mainT("main.session.sessionWillAutoOpen");
    return {
      ok: true,
      message: mainT("main.session.acceptedTask", { to: this.roleDisplayName(projectRoot, targetRoleId), openNote, from: "su" }),
    };
  }

  /**
   * 2026-10-29（方案 v2.1 §5.1）：五步链派发所需的机械事实（只读；不写盘、不猜）。
   * 读盘失败一律按「未满足」处理（fail-closed）。
   */
  private async chainDispatchFacts(projectRoot: string, flowHint: string | undefined): Promise<{
    flowId?: string;
    intent: { found: boolean; candidates: number };
    proposalFound: boolean;
    architectureFound: boolean;
    roster?: RosterLoadResult;
    d3Selected: string[];
    d3DecisionId?: string;
    handoffFound: boolean;
    selectedCardsFound: boolean;
    missingSelectedCardIds: string[];
  }> {
    const readNames = async (rel: string): Promise<string[]> => {
      try {
        return await fs.promises.readdir(path.join(projectRoot, rel));
      } catch {
        return [];
      }
    };
    const intentPattern = /^(.+)-intent-v\d+\.md$/;
    const rosterPattern = /^(.+)-roster-v\d+\.md$/;
    const flowsOf = (names: readonly string[], pattern: RegExp): string[] => {
      const flows = new Set<string>();
      for (const name of names) {
        const match = pattern.exec(name);
        if (match !== null) flows.add(match[1]!);
      }
      return [...flows];
    };
    const intentNames = await readNames(path.posix.join("docs", "product"));
    const rosterNames = await readNames(path.posix.join("docs", "proposals"));
    const contractNames = await readNames(path.posix.join("docs", "contracts"));
    const intentFlows = flowsOf(intentNames, intentPattern);
    const rosterFlows = flowsOf(rosterNames, rosterPattern);
    const flowId = flowHint
      ?? (intentFlows.length === 1 ? intentFlows[0] : undefined)
      ?? (rosterFlows.length === 1 ? rosterFlows[0] : undefined);
    // 2026-10-29（客户追加口径）：文档版本化——链路只认最新版本文件（旧版只读，不原地改）。
    const latestVersionedName = (names: readonly string[], pattern: RegExp): string | undefined => {
      let best = 0;
      let file: string | undefined;
      for (const name of names) {
        const match = pattern.exec(name);
        if (match === null) continue;
        const version = Number(match[1]);
        if (Number.isInteger(version) && version > best) {
          best = version;
          file = name;
        }
      }
      return file;
    };
    const escapedFlow = flowId !== undefined ? flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : undefined;
    const latestIntentName =
      escapedFlow !== undefined ? latestVersionedName(intentNames, new RegExp(`^${escapedFlow}-intent-v(\\d+)\\.md$`)) : undefined;
    const latestProposalName =
      escapedFlow !== undefined ? latestVersionedName(rosterNames, new RegExp(`^${escapedFlow}-proposal-v(\\d+)\\.md$`)) : undefined;
    const latestArchitectureName =
      escapedFlow !== undefined
        ? latestVersionedName(contractNames, new RegExp(`^${escapedFlow}-architecture-v(\\d+)\\.md$`))
        : undefined;
    const existsFile = async (rel: string): Promise<boolean> => {
      try {
        return (await fs.promises.stat(path.join(projectRoot, rel))).isFile();
      } catch {
        return false;
      }
    };
    let intentFound = false;
    if (latestIntentName !== undefined) {
      try {
        const text = await fs.promises.readFile(path.join(projectRoot, "docs", "product", latestIntentName), "utf8");
        intentFound = text.trim() !== "" && /^#/m.test(text);
      } catch {
        intentFound = false;
      }
    }
    const proposalFound =
      latestProposalName !== undefined && (await existsFile(`docs/proposals/${latestProposalName}`));
    const architectureFound =
      latestArchitectureName !== undefined && (await existsFile(`docs/contracts/${latestArchitectureName}`));
    const roster = flowId !== undefined ? await loadLatestRoster({ projectRoot, flowId }) : undefined;

    // 最新 D3（appointment 裁决）：request.created.flowId ↔ request.resolved。
    // 2026-10-31（卡种收口）：**只接受 appointment 卡**的裁决——
    //   优先 `request.created.cardKind === "appointment"`（新事件）；resolved 自身 `cardKind === "appointment"` 亦可；
    //   两者皆缺（旧事件）时，仅当带 appointment 专属 `rosterVersion`/`rosterSha256` 戳才接受；
    //   其他 choice 卡（decision/intent-confirm/…）的裁决一律忽略——flow 匹配或仅有 targetRoleIds 都不是接受条件。
    const state = await this.readTasks(projectRoot);
    const requestFlows = new Map<string, string | undefined>();
    const requestCardKinds = new Map<string, GovernanceCardKind | undefined>();
    for (const event of state.events) {
      if (event.kind === "request.created") {
        requestFlows.set(event.requestId, event.flowId);
        requestCardKinds.set(event.requestId, event.cardKind);
      }
    }
    let d3: { targetRoleIds: string[]; at: string; decisionId?: string } | undefined;
    for (const event of state.events) {
      if (event.kind !== "request.resolved") continue;
      // T3 B3（AC-13/G-10）：fixed 议程的任命决议（带 `workflowId` 戳）不是 legacy D3 证据——
      // legacy D3 读取方只接受旧 roster 戳/无 `workflowId` 的裁决；fixed 决议不得被当作 D3。
      if (event.workflowId !== undefined) continue;
      // T3 B3.1：fixed appointment 决议的 `source:"stage-a10"`（运行时核心 B3.1 冻结字面）同属
      // fixed 来源——legacy D3 读取方不接受；即便异常缺 `workflowId` 也不得退化为 D3 证据。
      if (event.source === "stage-a10") continue;
      const targets = Array.isArray(event.targetRoleIds)
        ? event.targetRoleIds.filter((id): id is string => typeof id === "string" && id !== "")
        : [];
      if (targets.length === 0) continue;
      const createdKind = requestCardKinds.get(event.requestId);
      const resolvedKind = event.cardKind;
      const appointment = createdKind === "appointment" || resolvedKind === "appointment";
      const legacyAppointment =
        createdKind === undefined &&
        resolvedKind === undefined &&
        (event.rosterVersion !== undefined || event.rosterSha256 !== undefined);
      if (!appointment && !legacyAppointment) continue;
      const eventFlow = requestFlows.get(event.requestId);
      if (flowId !== undefined && eventFlow !== undefined && eventFlow !== flowId) continue;
      if (d3 === undefined || event.at > d3.at) {
        d3 = { targetRoleIds: targets, at: event.at, ...(event.decisionId !== undefined ? { decisionId: event.decisionId } : {}) };
      }
    }
    const convenerRoleId = this.handbackOwnerRoleId(projectRoot);
    const handoffFound = state.unclosed.some((record) => {
      const created = record.created;
      if (created === undefined) return false;
      if (created.from !== "chief" || convenerRoleId === null || created.to !== convenerRoleId) return false;
      if (created.stepId === "project-handoff") return true;
      // 旧记录无 stepId ⇒ flowId + 受限文本标记等价判定（F3 兼容口径）。
      return flowId !== undefined && created.flowId === flowId && /交付|handoff|运营/.test(created.text);
    });
    const listing = this.deps.getListing(projectRoot);
    const selected = d3?.targetRoleIds ?? [];
    const missingSelectedCardIds = selected.filter(
      (roleId) => !listing?.roles.some((role) => role.roleId === roleId && role.builtIn !== true),
    );
    const selectedCardsFound = selected.length > 0 && missingSelectedCardIds.length === 0;
    return {
      ...(flowId !== undefined ? { flowId } : {}),
      intent: { found: intentFound, candidates: intentFlows.length },
      proposalFound,
      architectureFound,
      ...(roster !== undefined ? { roster } : {}),
      d3Selected: selected,
      ...(d3?.decisionId !== undefined ? { d3DecisionId: d3.decisionId } : {}),
      handoffFound,
      selectedCardsFound,
      missingSelectedCardIds,
    };
  }

  /**
   * B 批（2026-10-28）：**幕僚星形派发**——新任务链（不套旧 flow 派发门）。
   * 校验：目标须在本项目角色表（含内置角色），不能是幕僚自身；内置目标允许（B-05：任意内置/项目 worker）。
   * 持久化：先写 `task.created`（失败 ⇒ 不投递、如实回执），送达成功再写 `task.delivered`。
   * 去重：`tasks.jsonl` 中同 `idempotencyKey` 且未 closed ⇒ 不重复派发；已 closed 允许返工再派。
   * 副作用：幕僚声明 + 应用按任务文本**只升不降**（缺填/非法 ⇒ unknown）。
   * 投递复用既有投递机（自动开会话/排队/失败保留/重启续投）；回交意图携带 `taskId`。
   */
  private captureChiefDispatchSource(projectRoot: string, runtime: RuntimeKind, source?: ActualDispatchSource) {
    const registration = this.deps.getRegisteredProjectLifecycle?.(projectRoot), entry = source?.entry, origin = source?.origin;
    const creatorReports = origin?.kind === "handback" ? origin.creatorReports : undefined;
    const current = () => !!entry && !!origin && this.sessions.get(this.sessionKey(projectRoot, "chief", runtime)) === entry &&
      entry.roleId === "chief" && entry.projectRoot === projectRoot && entry.busy && entry.origins.running === origin && !origin.settled &&
      !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted &&
      !this.runTaskIsFenced(projectRoot, origin.taskId, origin.assignment?.runId);
    if (!registration || !entry?.handle.sessionId || !origin?.turnId || origin.inputAccepted !== true || !current() ||
        (origin.kind !== undefined && origin.kind !== "message" && !creatorReports?.length)) return undefined;
    const hostInitialization: NonNullable<Parameters<typeof prepareRoleDispatch>[0]["hostInitialization"]> = { registration,
      parent: { roleId: "chief", runtime, sessionId: entry.handle.sessionId, turnId: origin.turnId, inputAccepted: true, settled: false,
        ...(origin.kind ? { kind: origin.kind } : {}), ...(origin.clientMessageId ? { clientMessageId: origin.clientMessageId } : {}) },
      ...(creatorReports ? { creatorReports: structuredClone(creatorReports) } : {}) };
    const isCurrent = () => { const selected = this.deps.getRegisteredProjectLifecycle?.(projectRoot);
      return current() && (!creatorReports || origin.creatorReports === creatorReports) && selected?.selectionId === registration.selectionId && selected.listingGeneration === registration.listingGeneration; };
    return { hostInitialization, isCurrent, expectedKind: creatorReports ? "chief-creator-report" : "chief-customer-turn" };
  }

  private async resumeChiefController(projectRoot: string, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload, source?: ActualDispatchSource): Promise<DispatchReceipt> {
    const reject = (code: string, message: string): DispatchReceipt => ({ ok: false, message: `${code}：${message}` });
    if (fromRoleId !== "chief" || d.roleId !== "convener" || !d.resumeController || d.reviewTarget)
      return reject("controller-resume-source-invalid", "续接只允许幕僚明确指向原运营任务，未创建任务。");
    const host = this.captureChiefDispatchSource(projectRoot, runtime, source);
    if (!host) return reject("controller-resume-source-unavailable", "缺少当前幕僚实际输入来源。");
    const input = { projectRoot, resumeController: d.resumeController, hostInitialization: host.hostInitialization };
    const prepared = await prepareControllerResume(input);
    if (!host.isCurrent()) return reject("controller-resume-source-changed", "核验期间来源已变化。");
    if (!prepared.ok) return reject(prepared.code, prepared.message ?? prepared.code);
    const value = prepared.value, deliveryRuntime = this.findLiveRuntime(projectRoot, "convener") ?? runtime;
    const key = this.queueKey(projectRoot, "convener", deliveryRuntime), dedupKey = `hub-resume:${value.resumeKey}:${value.basisDigest}`;
    const clientMessageId = this.appTaskClientMessageIdFromSeed(dedupKey);
    if (this.deliveredAppTaskIds.has(clientMessageId) || this.deliveredDeliveryKeys.has(`${key}\u0000${dedupKey}`) ||
        this.deliveryQueues.get(key)?.some(item => item.clientMessageId === clientMessageId) || this.activeDeliveries.get(key)?.clientMessageId === clientMessageId)
      return { ok: true, message: "同一运营续接已受理或已ACK，未重复投递、未创建任务。" };
    if (this.deliveryIsStopped(key) || this.runTaskIsFenced(projectRoot, value.taskId, value.runId)) return reject("controller-resume-stopped", "原任务已停止，未重新打开。");
    const lease = beginGitHostAction({ projectRoot, kind: "dispatch" });
    if (!lease.ok) return reject(lease.code, "项目状态正在变化，续接未入队。");
    let endFailure: string | undefined;
    try {
      const fresh = await prepareControllerResume(input);
      if (!fresh.ok) return reject(fresh.code, fresh.message ?? fresh.code);
      if (!host.isCurrent() || fresh.value.resumeKey !== value.resumeKey || fresh.value.basisDigest !== value.basisDigest ||
          fresh.value.taskId !== value.taskId || fresh.value.runId !== value.runId || fresh.value.flowId !== value.flowId ||
          fresh.value.reviewTaskId !== value.reviewTaskId || fresh.value.reviewCloseOperationId !== value.reviewCloseOperationId)
        return reject("controller-resume-basis-changed", "入队前运营任务或质量依据已变化。");
      if (this.deliveryIsStopped(key) || this.runTaskIsFenced(projectRoot, value.taskId, value.runId)) return reject("controller-resume-stopped", "原任务已停止，续接未入队。");
      this.enqueueDelivery(projectRoot, "convener", { kind: "dispatch", runtime: deliveryRuntime, targetRoleId: "convener", sourceRoleId: "chief",
        taskId: value.taskId, flowId: value.flowId, text: d.task, summary: `续接 #${value.taskId}：${shortenSummary(d.task)}`, dedupKey, clientMessageId,
        controllerResume: { expected: structuredClone(d.resumeController), resumeKey: value.resumeKey, basisDigest: value.basisDigest } });
    } finally {
      const ended = endGitHostAction({ projectRoot, leaseId: lease.leaseId, inventory: desktopProjectExecutionInventory(projectRoot) });
      if (!ended.ok) endFailure = ended.code;
    }
    if (endFailure) return reject(endFailure, "续接消息已保留，但项目协调未完成，尚未投递；请核对后明确恢复。");
    void this.drainQueue(projectRoot, "convener", deliveryRuntime);
    return { ok: true, message: `已受理：续接原运营任务 #${value.taskId}，未创建任务；送达/ACK或失败另行报告，受理不等于已执行。` };
  }

  private async routeStarDispatch(
    projectRoot: string,
    runtime: RuntimeKind,
    fromRoleId: string,
    d: DispatchTaskPayload,
    targetRoleId: string,
    task: string,
    source?: ActualDispatchSource,
  ): Promise<DispatchReceipt> {
    const fail = (message: string, row: string, rejection?: MechanicalRejection): DispatchReceipt => {
      if (rejection !== undefined) {
        this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, `${humanRejection(rejection)} ${technicalRejectionCode(rejection)}`);
        const formatted = formatMechanicalRejection(rejection);
        return { ok: false, message: formatted.includes(message) ? formatted : `${message}
${formatted}` };
      }
      this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, row);
      return { ok: false, message };
    };
    const chiefRoleId = this.chiefTaskRoleIdOf(projectRoot);
    if (d.resumeController !== undefined) return this.resumeChiefController(projectRoot, runtime, fromRoleId, d, source);
    // P1-R-05：会话层只拦自派；「target=幕僚且来源非幕僚」交给硬授权矩阵（convener-target-forbidden）。
    if (targetRoleId === fromRoleId) {
      return fail("派发未受理：不能派发给幕僚自己。", "派发未受理：不能派发给幕僚自己——未投递。");
    }
    const reason = d && typeof d.reason === "string" ? d.reason : undefined;
    const expectedOutput = d && typeof d.expectedOutput === "string" && d.expectedOutput.trim() !== "" ? d.expectedOutput.trim() : undefined;
    const requestedEvidence = d && Array.isArray(d.requestedEvidence)
      ? d.requestedEvidence.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 5)
      : undefined;
    const requestedModuleId = d && typeof d.moduleId === "string" && d.moduleId.trim() !== "" ? d.moduleId.trim() : undefined;
    const requestedModulePaths = d && Array.isArray(d.modulePaths)
      ? [...new Set(d.modulePaths.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()))].slice(0, 20)
      : undefined;
    const sideEffect = classifyTaskSideEffect(d?.sideEffect, task);
    const idempotencyKey = taskIdempotencyKey({
      from: fromRoleId,
      to: targetRoleId,
      text: task,
      ...(typeof d?.idempotencyKey === "string" ? { idempotencyKey: d.idempotencyKey } : {}),
      ...(requestedModuleId !== undefined ? { moduleId: requestedModuleId } : {}),
    });
    const state = await this.readTasks(projectRoot);
    // 2026-10-29（BUG-5）：同一幂等键的**已报告/已收口**任务也抑制重复派发——完成后的重复调用
    // 不得再创建 task.created 或产生新的 task.delivered。显式返工须使用新的任务文本或新的
    // `idempotencyKey`（重派走 redispatchTask，不重复本路径）。
    const duplicate = findTaskByIdempotencyKey(state, idempotencyKey);
    if (duplicate !== undefined) {
      const terminal = duplicate.closed !== undefined || duplicate.reports.length > 0;
      if (terminal) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: targetRoleId }).record(
          "tasks.dispatch.duplicate-terminal",
          { taskId: duplicate.taskId, closed: duplicate.closed !== undefined, reports: duplicate.reports.length },
        );
      }
      return {
        ok: true,
        message: terminal
          ? `已受理：任务 #${duplicate.taskId} 已${duplicate.closed !== undefined ? "收口" : "报告"}，重复派发已抑制（未创建新任务、未投递）；如需返工请使用新的任务文本或幂等键。`
          : `已受理：同一任务已存在（#${duplicate.taskId}），未重复派发；受理 ≠ 完成。`,
      };
    }

    // —— B1/R1：目标事实 + 硬授权（必须在任何 run 账本写入之前）——
    await this.refreshListingNow(projectRoot);
    const listingForPreflight = this.deps.getListing(projectRoot);
    const targetRole = listingForPreflight?.roles.find((role) => role.roleId === targetRoleId);
    const targetBuiltIn = targetRole?.builtIn === true || isBuiltInGovernanceRoleId(targetRoleId);
    const targetExists = targetRole !== undefined || isBuiltInGovernanceRoleId(targetRoleId);
    const convenerRoleId = this.handbackOwnerRoleId(projectRoot);
    const authorization = evaluateDispatchAuthorization({
      fromRoleId,
      targetRoleId,
      targetBuiltIn,
      targetExists,
      chiefRoleId,
      convenerRoleId,
    });
    if (!authorization.ok) {
      return fail(authorization.message, authorization.message, authorization.rejection);
    }
    if (fromRoleId === convenerRoleId && targetRoleId === "verifier")
      return fail("chief-hub-review-owner-required：新的质检任务须由幕僚创建，未登记任务。", "新的质检任务须由幕僚创建，未登记任务。");
    if (d.reviewTarget !== undefined && targetRoleId !== "verifier")
      return fail("review-target-invalid：只有真实质检目标可申请候选评审，未派发。", "只有真实质检目标可申请候选评审，未派发。");
    const mandatoryReview = d.reviewTarget !== undefined;
    if (mandatoryReview && targetRole?.builtIn !== true)
      return fail("review-target-unproven：当前登记的真实内置质检目标不可用，未派发。", "当前登记的真实内置质检目标不可用，未派发。");
    const workerDispatch = !targetBuiltIn;
    const hubPreparation = fromRoleId === chiefRoleId && targetRole?.builtIn === true &&
      ["product", "rapporteur", "nominator", "convener", "verifier"].includes(targetRoleId) && !mandatoryReview;
    if (hubPreparation && !d.flowId)
      return fail("chief-hub-flow-unavailable：缺少明确任务流程，未创建裸任务。", "缺少明确任务流程，未创建任务。");
    const documentPlanningRole = fromRoleId === chiefRoleId && targetRole?.builtIn === true && (targetRoleId === "product" || targetRoleId === "rapporteur");
    const rolePreparation = fromRoleId === chiefRoleId && targetRole?.builtIn === true && targetRoleId === "nominator";
    const expectedPreparationPurpose = hubPreparation ? "builtin-preparation" : rolePreparation ? "role-preparation" : "document-preparation";
    if (rolePreparation && !d.flowId) return fail("role-preparation-source-unavailable：人事准备缺少明确流程，未登记任务。", "人事准备缺少明确流程，未登记任务。");
    const sourceIsCurrent = () => !!source && this.sessions.get(this.sessionKey(projectRoot, fromRoleId, runtime)) === source.entry &&
      source.entry.busy && source.entry.origins.running === source.origin && !source.origin.settled &&
      !this.runTaskIsFenced(projectRoot, source.origin.taskId, source.origin.assignment?.runId) &&
      !source.entry.interactionState.lifetime.signal.aborted && !source.entry.interactionState.turn.signal.aborted;
    let parentTaskId: string | undefined;
    let executionRunId: string | undefined, executionFlowId: string | undefined;
    let executionPaths: string[] | undefined, executionModuleId: string | undefined;
    if (workerDispatch || fromRoleId === convenerRoleId) {
      if (fromRoleId !== convenerRoleId || !sourceIsCurrent() || !source?.origin.taskId)
        return fail("worker-dispatch-source-unavailable：缺少当前运营真实受派任务，未派发。", "缺少当前运营真实受派任务，未派发。");
      parentTaskId = source.origin.taskId;
      const parent = await inspectAssignedTask({ projectRoot, taskId: parentTaskId, actorRoleId: fromRoleId });
      if (!sourceIsCurrent()) return fail("worker-dispatch-source-changed：发起轮次已变化，未派发。", "发起轮次已变化，未派发。");
      if (!parent.ok) return fail(`${parent.code}：${parent.message ?? parent.code}`, `${parent.message ?? parent.code}`);
      if (d.flowId !== undefined && d.flowId !== parent.value.flowId)
        return fail("worker-dispatch-flow-mismatch：派发flow与当前真实父任务不一致。", "派发flow与当前真实父任务不一致。");
      executionRunId = parent.value.runId; executionFlowId = parent.value.flowId;
    }
    // An explicit target or actual convener-to-built-in-verifier route is mandatory immutable review,
    // never an optional legacy run anchor. Missing target material must reject before task creation.
    let preparedReview: Extract<Awaited<ReturnType<typeof prepareRoleDispatch>>, { ok: true }>["value"] | undefined;
    let workSourceRef: TaskWorkSourceRef | undefined;
    let reviewHost: ReturnType<SessionManager["captureChiefDispatchSource"]>;
    if (mandatoryReview) {
      reviewHost = this.captureChiefDispatchSource(projectRoot, runtime, source);
      if (fromRoleId !== chiefRoleId || targetRoleId !== "verifier" || !d.flowId || !reviewHost)
        return fail("review-source-unavailable：缺少当前幕僚真实输入及评审流程，未登记任务。", "缺少当前幕僚真实输入及评审流程，未登记任务。");
      if (requestedModuleId || requestedModulePaths?.length)
        return fail("review-module-scope-forbidden：评审不接受实现模块写区，未派发。", "评审不接受实现模块写区，未派发。");
      const review = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: d.flowId,
        hostInitialization: reviewHost.hostInitialization, reviewTarget: d.reviewTarget });
      if (!reviewHost.isCurrent()) return fail("review-source-changed：核验期间发起输入已变化。", "核验期间发起输入已变化。");
      if (!review.ok) return fail(`${review.code}：${review.message}`, review.message);
      const value = review.value, ref = value.initializationSource;
      const sourceRef = ref ? { sourceId: ref.sourceId, path: ref.path, sha256: ref.sha256, kind: ref.kind ?? "chief-customer-turn" } : undefined;
      if (value.kind !== "review" || value.hubRouting !== "chief-hub-v1" || !value.reviewBasisRef || !value.reviewControllerRef ||
          value.parentTaskRef || !value.runId || value.flowId !== d.flowId || !isTaskWorkSourceRef(sourceRef) || sourceRef.kind !== reviewHost.expectedKind)
        return fail("review-source-unavailable：正式评审未返回真实独立controller和完整来源。", "正式评审未返回真实独立controller和完整来源。");
      preparedReview = value; workSourceRef = sourceRef;
    }
    const chainFacts = await this.chainDispatchFacts(projectRoot, d?.flowId);
    const dispatchFlowId = executionFlowId ?? d?.flowId ?? chainFacts.flowId;
    // M1（幕僚→产品）允许尚未写 flowId：仍先生成 pending draft；后续真实 flow 到达时领养同一 runId。
    const runFlowId = dispatchFlowId ?? (fromRoleId === chiefRoleId && targetRoleId === "product" ? RUN_PENDING_FLOW_ID : undefined);
    const handoffDispatch = !hubPreparation && fromRoleId === chiefRoleId && convenerRoleId !== null && targetRoleId === convenerRoleId;
    let initializationIsCurrent: (() => boolean) | undefined;
    let initializationSelectionIsCurrent: (() => boolean) | undefined;
    let preparedTeamPlanning: Extract<Awaited<ReturnType<typeof prepareRoleDispatch>>, { ok: true }>["value"] | undefined;
    let teamPlanningHostSource: NonNullable<Parameters<typeof prepareRoleDispatch>[0]["hostInitialization"]> | undefined;
    const initializationChanged = "项目选择或发起输入已变化，初始化未派发。请在当前项目重新发起。";
    if (handoffDispatch) {
      if (dispatchFlowId === undefined) return fail("规划协调缺少明确flowId，未派发。", "请先明确当前规划所属项目。");
      const registration = this.deps.getRegisteredProjectLifecycle?.(projectRoot);
      const parentEntry = this.sessions.get(this.sessionKey(projectRoot, fromRoleId, runtime));
      const parentOrigin = parentEntry?.origins.running;
      const creatorReports = parentOrigin?.kind === "handback" ? parentOrigin.creatorReports : undefined;
      const hostInitialization = registration && parentEntry?.busy === true && parentEntry.handle.sessionId &&
        parentOrigin?.inputAccepted === true && parentOrigin.turnId && !parentOrigin.settled && sourceIsCurrent() &&
        (parentOrigin.kind === undefined || parentOrigin.kind === "message" || creatorReports?.length)
        ? { registration, parent: { roleId: "chief" as const, sessionId: parentEntry.handle.sessionId,
            turnId: parentOrigin.turnId, runtime, settled: false as const, inputAccepted: true as const,
            ...(parentOrigin.clientMessageId ? { clientMessageId: parentOrigin.clientMessageId } : {}),
            ...(parentOrigin.kind ? { kind: parentOrigin.kind } : {}) },
            ...(creatorReports ? { creatorReports: structuredClone(creatorReports) } : {}) }
        : undefined;
      const planning = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: dispatchFlowId,
        ...(hostInitialization ? { hostInitialization } : {}) });
      if (!planning.ok || planning.value.kind !== "planning") return fail(planning.ok ? "规划上下文不匹配。" : planning.message,
        planning.ok ? "规划上下文不匹配。" : planning.message);
      if (!hostInitialization || !parentEntry || !parentOrigin || !planning.value.initializationSource)
        return fail("planning-source-unavailable：未取得当前实际工作来源，未登记团队任务。", "未取得当前实际工作来源，未登记团队任务。");
      {
        const isInitialization = planning.value.purpose === "repository-initialization";
        if (isInitialization && creatorReports) return fail(initializationChanged, initializationChanged);
        if (!isInitialization && (!planning.value.runId || planning.value.flowId !== dispatchFlowId))
          return fail("planning-scope-unavailable：团队规划尚无真实独立草稿范围，未登记任务。", "团队规划尚无真实独立草稿范围，未登记任务。");
        const receipt = planning.value.initializationSource;
        const expectedKind = creatorReports ? "chief-creator-report" : "chief-customer-turn";
        const sourceRef = { kind: receipt.kind ?? "chief-customer-turn", sourceId: receipt.sourceId, path: receipt.path, sha256: receipt.sha256 };
        if (!isTaskWorkSourceRef(sourceRef) || sourceRef.kind !== expectedKind) return fail(initializationChanged, initializationChanged);
        workSourceRef = sourceRef;
        if (!isInitialization) { preparedTeamPlanning = planning.value; teamPlanningHostSource = hostInitialization; }
        initializationSelectionIsCurrent = () => {
          const current = this.deps.getRegisteredProjectLifecycle?.(projectRoot);
          return current?.selectionId === registration?.selectionId && current?.listingGeneration === registration?.listingGeneration;
        };
        initializationIsCurrent = () => {
          return initializationSelectionIsCurrent!() &&
            this.sessions.get(this.sessionKey(projectRoot, fromRoleId, runtime)) === parentEntry &&
            parentEntry.busy && parentEntry.origins.running === parentOrigin && !parentOrigin.settled &&
            (!creatorReports || parentOrigin.creatorReports === creatorReports) && sourceIsCurrent() &&
            parentOrigin.turnId === hostInitialization.parent.turnId && !parentEntry.interactionState.turn.signal.aborted;
        };
        if (!initializationIsCurrent()) return fail(initializationChanged, initializationChanged);
      }
    }

    const hasLegacyFlowTask = dispatchFlowId !== undefined && [...state.records.values()].some(
      (record) => record.created?.flowId === dispatchFlowId && record.created.runId === undefined,
    );
    // —— B1/R2：run 只读/记账 best-effort；失败只记 runFacts，不阻断派发 ——
    const runFacts: NonNullable<DispatchPreflightInput["runFacts"]> = {};
    let runManifest: RunManifest | undefined;
    let runState: "draft" | "pinned" | undefined;
    let pinnedRoster: ProjectRoster | undefined;
    let preparedDocumentPlanning: Extract<Awaited<ReturnType<typeof prepareRoleDispatch>>, { ok: true }>["value"] | undefined;
    let documentHostSource: NonNullable<Parameters<typeof prepareRoleDispatch>[0]["hostInitialization"]> | undefined;
    let documentSourceIsCurrent: (() => boolean) | undefined;
    const prepareDocumentScope = async (oldRunId?: string): Promise<DispatchReceipt | undefined> => {
        // Existing-project authoring is a new planning scope, not reuse of an old execution pin.
        const registration = this.deps.getRegisteredProjectLifecycle?.(projectRoot);
        const entry = source?.entry, origin = source?.origin;
        const customerSource = origin?.kind === undefined || origin.kind === "message";
        const creatorSource = origin?.kind === "handback" ? origin.creatorReports : undefined;
        if (!d.flowId || !registration || !entry?.handle.sessionId || !origin?.turnId || origin.inputAccepted !== true ||
            (!customerSource && !creatorSource?.length) || !sourceIsCurrent())
          return fail("document-planning-source-unavailable：缺少当前客户输入与真实项目选择，未登记文档任务。", "缺少当前客户输入与真实项目选择，未登记文档任务。");
        if (requestedModuleId || requestedModulePaths?.length)
          return fail("document-planning-module-forbidden：文档准备不授实现模块写区。", "文档准备不授实现模块写区。");
        documentHostSource = { registration, parent: { roleId: "chief", sessionId: entry.handle.sessionId, turnId: origin.turnId,
          runtime, inputAccepted: true, settled: false, ...(origin.clientMessageId ? { clientMessageId: origin.clientMessageId } : {}),
          ...(origin.kind ? { kind: origin.kind } : {}) }, ...(creatorSource ? { creatorReports: structuredClone(creatorSource) } : {}) };
        documentSourceIsCurrent = () => {
          const currentRegistration = this.deps.getRegisteredProjectLifecycle?.(projectRoot);
          return sourceIsCurrent() && (!creatorSource || origin.creatorReports === creatorSource) && currentRegistration?.selectionId === registration.selectionId && currentRegistration.listingGeneration === registration.listingGeneration;
        };
        const planning = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: d.flowId, hostInitialization: documentHostSource });
        if (!documentSourceIsCurrent()) return fail("document-planning-source-changed：准备期间客户或项目来源已变化，未登记任务。", "准备期间客户或项目来源已变化，未登记任务。");
        if (!planning.ok) return fail(`${planning.code}：${planning.message}`, planning.message);
        const executionSelection = planning.value.kind === "execution" && hubPreparation && fromRoleId === chiefRoleId && targetRoleId === "convener" && creatorSource?.length;
        if ((planning.value.kind !== "planning" && !executionSelection) || planning.value.purpose !== expectedPreparationPurpose || (hubPreparation && planning.value.hubRouting !== "chief-hub-v1") || !planning.value.runId ||
            (oldRunId !== undefined && planning.value.runId === oldRunId) || planning.value.flowId !== d.flowId || !planning.value.initializationSource)
          return fail("document-planning-basis-unavailable：缺少真实独立规划来源，未登记任务。", "缺少真实独立规划来源，未登记任务。");
        const expectedKind = creatorSource ? "chief-creator-report" : "chief-customer-turn";
        const ref = { ...planning.value.initializationSource, kind: planning.value.initializationSource.kind ?? "chief-customer-turn" };
        if (ref.kind !== expectedKind) return fail("document-planning-source-invalid：真实工作来源类型与当前输入不一致。", "真实工作来源类型与当前输入不一致。");
        if (!isTaskWorkSourceRef(ref)) return fail("document-planning-source-invalid：实际工作来源形状无效。", "实际工作来源形状无效。");
        preparedDocumentPlanning = planning.value; workSourceRef = ref;
        return undefined;
    };
    // A prior executable pin is never an authoring grant for the next customer change.
    // A fresh customer source must still be current on the original NEW draft path.
    if ((hubPreparation || documentPlanningRole || rolePreparation) && d.flowId && (source?.origin.kind === undefined || source.origin.kind === "message") &&
        (!this.deps.getRegisteredProjectLifecycle?.(projectRoot) || !sourceIsCurrent()))
      return fail("document-planning-source-unavailable：缺少当前客户输入与真实项目选择，未登记文档任务。", "缺少当前客户输入与真实项目选择，未登记文档任务。");
    // The original NEW draft/report path remains separate until it has a real document baseline.
    if ((hubPreparation || documentPlanningRole || rolePreparation) && d.flowId && sourceIsCurrent() &&
        (source?.origin.kind === undefined || source.origin.kind === "message" || source.origin.kind === "handback")) {
      const protection = await readRoleCapabilityProtectionScope({ projectRoot });
      if (!sourceIsCurrent()) return fail("document-planning-source-changed：读取保护范围期间来源已变化。", "读取保护范围期间来源已变化。");
      // This fresh observation selects compatibility only; the public planning call proves the actual scope.
      // A genuine initialized empty Git media is distinguished from corrupt/missing authority by Pipeline.
      if (hubPreparation || rolePreparation || protection.state !== "unmanaged") { const failure = await prepareDocumentScope(); if (failure) return failure; }
    }
    if (workerDispatch && executionRunId && executionFlowId && parentTaskId) {
      const operationId = `freeze-dispatch-${createHash("sha256").update(JSON.stringify([executionRunId, parentTaskId, idempotencyKey])).digest("hex").slice(0, 40)}`;
      const frozen = await freezeExecutionRun({ projectRoot, runId: executionRunId, flowId: executionFlowId, operationId });
      if (!sourceIsCurrent()) return fail("worker-dispatch-source-changed：冻结期间发起轮次已变化，未派发。", "冻结期间发起轮次已变化，未派发。");
      if (!frozen.ok) return fail(`worker-freeze stage=${frozen.stage} code=${frozen.code} parentTaskId=${parentTaskId} runId=${executionRunId}：${frozen.message}`, frozen.message);
      const execution = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: executionFlowId,
        runId: executionRunId, ...(requestedModuleId ? { moduleId: requestedModuleId } : {}) });
      if (!sourceIsCurrent()) return fail("worker-dispatch-source-changed：核验期间发起轮次已变化，未派发。", "核验期间发起轮次已变化，未派发。");
      if (!execution.ok) return fail(`${execution.code}：${execution.message}`, execution.message);
      if (execution.value.kind !== "execution" || !execution.value.moduleId || !execution.value.modulePaths?.length)
        return fail("worker-module-scope-unavailable：真实执行模块写区不可用，未派发。", "真实执行模块写区不可用，未派发。");
      const frozenShape = validateRunManifest(frozen.run);
      if (!frozenShape.ok)
        return fail(`worker-freeze-return-invalid code=${frozenShape.code} reason=${frozenShape.reason} parentTaskId=${parentTaskId} runId=${executionRunId} flowId=${executionFlowId}：实际冻结run回执形状无效，未派发。`, "实际冻结run回执形状无效，未派发。");
      if (frozenShape.manifest.state !== "pinned" || frozenShape.manifest.runId !== executionRunId || frozenShape.manifest.flowId !== executionFlowId)
        return fail(`worker-freeze-return-invalid state=${frozenShape.manifest.state} actualRunId=${frozenShape.manifest.runId} actualFlowId=${frozenShape.manifest.flowId} expectedRunId=${executionRunId} expectedFlowId=${executionFlowId}：实际冻结run回执身份不匹配，未派发。`, "实际冻结run回执身份不匹配，未派发。");
      runManifest = frozenShape.manifest; runState = "pinned";
      executionModuleId = execution.value.moduleId; executionPaths = [...execution.value.modulePaths];
      const roster = await loadPinnedRoster(projectRoot, runManifest);
      if (!roster.ok) return fail("worker-pinned-roster-unavailable：真实冻结名单不可读，未派发。", "真实冻结名单不可读，未派发。");
      pinnedRoster = roster.roster;
    } else if (!mandatoryReview && !preparedDocumentPlanning && !preparedTeamPlanning && runFlowId !== undefined) {
      const active = executionRunId ? await readRunManifest(projectRoot, executionRunId) : await findActiveRun(projectRoot, runFlowId);
      if (!active.ok) {
        runFacts.ledgerUnavailable = true;
      } else if (active.manifest !== null) {
        runManifest = active.manifest;
        runState = active.manifest.state === "pinned" ? "pinned" : "draft";
      } else {
        const draft = await ensureDraftRun(projectRoot, runFlowId, new Date(this.now()));
        if (!draft.ok) {
          runFacts.ledgerUnavailable = true;
        } else {
          runManifest = draft.manifest;
          runState = "draft";
        }
      }
      if (runManifest !== undefined && runState === "pinned" && (hubPreparation || documentPlanningRole || rolePreparation)) {
        const failure = await prepareDocumentScope(runManifest.runId); if (failure) return failure;
        runManifest = undefined; runState = undefined;
      } else if (runManifest !== undefined && runState === "pinned") {
        const verified = await verifyPinnedRun(projectRoot, runManifest);
        if (!verified.ok || verified.violations.length > 0) {
          runFacts.documentHashMismatch = true;
          runManifest = undefined;
          runState = undefined;
        } else {
          const pinnedRosterResult = await loadPinnedRoster(projectRoot, runManifest);
          if (!pinnedRosterResult.ok) {
            runFacts.pinnedRosterInvalid = true;
            runManifest = undefined;
            runState = undefined;
          } else {
            pinnedRoster = pinnedRosterResult.roster;
          }
        }
      }
    }

    // Planning coordination must not require future D3, active role documents or workflow.
    // Worker execution obtains a complete immutable pin through the separate execution preflight.

    const { baselineViolations } = await collectDispatchBaselineFacts({ projectRoot });

    // —— B1/P1 §5.4：advisory 只由 A1 collector 产出；B1 只收集事实 ——
    const targetCardFound =
      convenerRoleId !== null && targetRoleId === convenerRoleId
        ? chainFacts.selectedCardsFound
        : targetRole !== undefined;
    const advisoryRun = hasLegacyFlowTask
      ? { state: "legacy" as const }
      : runManifest !== undefined && runState !== undefined
        ? {
            state: runState,
            runId: runManifest.runId,
            ...(runManifest.roles !== undefined ? { roles: runManifest.roles } : {}),
            ...(runState === "pinned" && pinnedRoster !== undefined
              ? { modules: pinnedRoster.modules.map((module) => module.id) }
              : {}),
          }
        : undefined;
    const advisories = collectDispatchAdvisories({
      fromRoleId,
      targetRoleId,
      targetBuiltIn,
      targetExists,
      chiefRoleId,
      convenerRoleId,
      ...(chainFacts.flowId !== undefined ? { flowId: chainFacts.flowId } : {}),
      intent: chainFacts.intent,
      proposalFound: chainFacts.proposalFound,
      architectureFound: chainFacts.architectureFound,
      ...(chainFacts.roster !== undefined ? { roster: chainFacts.roster } : {}),
      d3Selected: chainFacts.d3Selected,
      ...(requestedModuleId !== undefined ? { moduleId: requestedModuleId } : {}),
      ...(requestedModulePaths !== undefined && requestedModulePaths.length > 0 ? { modulePaths: requestedModulePaths } : {}),
      handoffFound: chainFacts.handoffFound,
      ...(chainFacts.missingSelectedCardIds.length > 0 ? { missingSelectedCardIds: chainFacts.missingSelectedCardIds } : {}),
      targetCardFound,
      ...(advisoryRun !== undefined ? { run: advisoryRun } : {}),
      ...(Object.keys(runFacts).length > 0 ? { runFacts } : {}),
      ...(baselineViolations.length > 0 ? { versionedDocBaselineViolations: baselineViolations.map((violation) => violation.path) } : {}),
    });

    // —— R2 锚点：draft 直接锚定；pinned 仅在 verify+roster+目标/模块覆盖时锚定 ——
    let anchorState: "draft" | "pinned" | undefined;
    let anchorRunId: string | undefined;
    let anchorRunStage: string | undefined;
    let anchorFlowId: string | undefined;
    if (runManifest !== undefined && runState !== undefined) {
      const targetCovered = targetBuiltIn || (runManifest.roles !== undefined && runManifest.roles.includes(targetRoleId));
      const moduleCovered =
        requestedModuleId === undefined ||
        (pinnedRoster !== undefined && pinnedRoster.modules.some((module) => module.id === requestedModuleId));
      if (runState === "draft" || (targetCovered && moduleCovered)) {
        anchorState = runState;
        anchorRunId = runManifest.runId;
        anchorRunStage = runManifest.stage?.current;
        anchorFlowId = runManifest.flowId;
      }
    }

    if (preparedReview) {
      anchorState = "pinned"; // Proven by the immutable review preflight, not inferred from a role or task label.
      anchorRunId = preparedReview.runId;
      anchorFlowId = preparedReview.flowId;
    }

    if (preparedDocumentPlanning) {
      anchorState = preparedDocumentPlanning.kind === "execution" ? "pinned" : "draft"; anchorRunId = preparedDocumentPlanning.runId; anchorFlowId = preparedDocumentPlanning.flowId;
      anchorRunStage = undefined;
    }
    if (preparedTeamPlanning) {
      anchorState = "draft"; anchorRunId = preparedTeamPlanning.runId; anchorFlowId = preparedTeamPlanning.flowId;
      anchorRunStage = undefined;
    }
    // An optional legacy advisory must not erase a supplied flow and still accept a naked task.
    if (d.flowId !== undefined && anchorFlowId !== d.flowId)
      return fail("dispatch-scope-unavailable：未取得与请求一致的真实任务范围，未登记或投递任务。", "未取得与请求一致的真实任务范围，未登记或投递任务。");

    // —— 模块字段：适用名单=锚定 pinned roster，否则最新 roster（§5.3.3）——
    const applicableRoster =
      anchorState === "pinned" && pinnedRoster !== undefined
        ? pinnedRoster
        : chainFacts.roster !== undefined && chainFacts.roster.ok === true
          ? chainFacts.roster.roster
          : undefined;
    const taskModule =
      requestedModuleId !== undefined && applicableRoster !== undefined
        ? applicableRoster.modules.find((module) => module.id === requestedModuleId)
        : undefined;
    const moduleOwnerId =
      taskModule !== undefined && applicableRoster !== undefined
        ? applicableRoster.roles.find((role) => role.modules.includes(taskModule.id))?.id
        : undefined;
    const writeModule =
      taskModule !== undefined && (targetBuiltIn || targetRoleId === "verifier" || moduleOwnerId === targetRoleId);
    const taskId = newTaskId(new Date(this.now()));
    const createdAt = new Date(this.now());
    // 交付任务固定 stepId=project-handoff（M6/M7 的机械前置依据）；其余任务可带模型声明的 stepId。
    const dispatchStepId =
      fromRoleId === chiefRoleId && convenerRoleId !== null && targetRoleId === convenerRoleId
        ? "project-handoff"
        : typeof d?.stepId === "string" && d.stepId.trim() !== ""
          ? d.stepId.trim()
          : undefined;
    let created = taskEvent("task.created", {
      taskId,
      from: fromRoleId === convenerRoleId ? "convener" : "chief",
      ...(anchorState !== undefined && anchorFlowId !== undefined ? { flowId: anchorFlowId } : {}),
      ...(dispatchStepId !== undefined ? { stepId: dispatchStepId } : {}),
      ...(workerDispatch && executionModuleId && executionPaths
        ? { moduleId: executionModuleId, modulePaths: executionPaths,
            ...(taskModule?.id === executionModuleId && taskModule.path.endsWith("/") ? { moduleDirectory: taskModule.path } : {}) }
        : writeModule && taskModule !== undefined
        ? {
            moduleId: taskModule.id,
            ...(taskModule.path.endsWith("/") ? { moduleDirectory: taskModule.path } : {}),
            modulePaths: [...taskModule.paths],
          }
        : {}),
      to: targetRoleId,
      text: task,
      ...(anchorState !== undefined && anchorRunId !== undefined
        ? {
            runId: anchorRunId,
            runState: anchorState,
            ...(anchorRunStage !== undefined ? { runStage: anchorRunStage } : {}),
          }
        : {}),
      ...(expectedOutput !== undefined ? { expectedOutput } : {}),
      ...(requestedEvidence !== undefined ? { requestedEvidence } : {}),
      ...(workSourceRef ? { workSourceRef } : {}),
      ...(preparedDocumentPlanning?.hubRouting === "chief-hub-v1" ? { hubRouting: "chief-hub-v1" as const } : {}),
      ...(preparedReview ? { reviewBasisRef: preparedReview.reviewBasisRef, reviewControllerRef: preparedReview.reviewControllerRef, hubRouting: "chief-hub-v1" as const } : {}),
      sideEffect,
      idempotencyKey,
    }, () => createdAt);
    let sourceLease: { projectRoot: string; leaseId: string } | undefined;
    if (initializationIsCurrent || documentSourceIsCurrent || reviewHost) {
      const lease = beginGitHostAction({ projectRoot, kind: "dispatch" });
      if (!lease.ok) return fail("项目状态正在变更，初始化尚未派发。请稍后重试。", "项目状态正在变更，初始化尚未派发。请稍后重试。");
      sourceLease = { projectRoot, leaseId: lease.leaseId };
    }
    try {
      if (initializationIsCurrent && !initializationIsCurrent()) return fail(initializationChanged, initializationChanged);
      if (preparedReview) {
        if (!reviewHost?.isCurrent()) return fail("review-source-changed", "当前幕僚评审来源已变化。");
        const fresh = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: preparedReview.flowId, reviewTarget: d.reviewTarget, hostInitialization: reviewHost.hostInitialization });
        if (!fresh.ok) return fail(`${fresh.code}：${fresh.message}`, fresh.message);
        if (!reviewHost.isCurrent() || fresh.value.kind !== "review" || fresh.value.runId !== created.runId || fresh.value.flowId !== created.flowId ||
            fresh.value.basisDigest !== preparedReview.basisDigest || JSON.stringify(fresh.value.reviewBasisRef) !== JSON.stringify(created.reviewBasisRef) ||
            JSON.stringify(fresh.value.reviewControllerRef) !== JSON.stringify(created.reviewControllerRef) || fresh.value.initializationSource?.sourceId !== workSourceRef?.sourceId ||
            fresh.value.initializationSource?.sha256 !== workSourceRef?.sha256 || fresh.value.initializationSource?.path !== workSourceRef?.path ||
            (fresh.value.initializationSource?.kind ?? "chief-customer-turn") !== workSourceRef?.kind)
          return fail("review-basis-changed：提交前评审对象或来源已变化。", "提交前评审对象或来源已变化。");
      }
      if (preparedTeamPlanning) {
        if (!teamPlanningHostSource || !initializationIsCurrent?.()) return fail(initializationChanged, initializationChanged);
        const fresh = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: preparedTeamPlanning.flowId, hostInitialization: teamPlanningHostSource });
        if (!fresh.ok) return fail(`${fresh.code}：${fresh.message}`, fresh.message);
        const receipt = fresh.value.initializationSource;
        if (!initializationIsCurrent() || fresh.value.kind !== "planning" || fresh.value.flowId !== created.flowId ||
            fresh.value.runId !== created.runId || fresh.value.basisDigest !== preparedTeamPlanning.basisDigest ||
            receipt?.sourceId !== workSourceRef?.sourceId || receipt?.path !== workSourceRef?.path || receipt?.sha256 !== workSourceRef?.sha256 ||
            (receipt?.kind ?? "chief-customer-turn") !== workSourceRef?.kind)
          return fail("planning-source-changed：提交前团队规划依据或来源已变化，未登记任务。", "提交前团队规划依据或来源已变化，未登记任务。");
      }
      if (preparedDocumentPlanning) {
        if (!documentHostSource || !documentSourceIsCurrent?.()) return fail("document-planning-source-changed：当前客户或项目来源已变化。", "当前客户或项目来源已变化。");
        const fresh = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: preparedDocumentPlanning.flowId, hostInitialization: documentHostSource });
        if (!fresh.ok) return fail(`${fresh.code}：${fresh.message}`, fresh.message);
        if (!documentSourceIsCurrent() || fresh.value.kind !== preparedDocumentPlanning.kind ||
            created.runState !== (preparedDocumentPlanning.kind === "execution" ? "pinned" : "draft") || fresh.value.purpose !== expectedPreparationPurpose || fresh.value.hubRouting !== preparedDocumentPlanning.hubRouting ||
            fresh.value.flowId !== created.flowId || fresh.value.runId !== created.runId || fresh.value.basisDigest !== preparedDocumentPlanning.basisDigest ||
            fresh.value.initializationSource?.sourceId !== workSourceRef?.sourceId || fresh.value.initializationSource?.sha256 !== workSourceRef?.sha256 ||
            fresh.value.initializationSource?.path !== workSourceRef?.path || (fresh.value.initializationSource?.kind ?? "chief-customer-turn") !== workSourceRef?.kind)
          return fail("document-planning-source-changed：提交前真实规划依据已变化，未登记任务。", "提交前真实规划依据已变化，未登记任务。");
      }
      // Keep the lease across all ledger awaits. Cancellation does not prematurely release an in-flight append.
      if (mandatoryReview && (!preparedReview || !created.flowId || !created.runId || !created.reviewBasisRef || !created.reviewControllerRef || created.hubRouting !== "chief-hub-v1"))
        return fail("review-source-unavailable：评审来源未完整绑定，未登记任务。", "评审来源未完整绑定，未登记任务。");
      if (created.from === "convener" && created.flowId !== undefined) {
        if (!parentTaskId || created.runId !== executionRunId || created.flowId !== executionFlowId)
          return fail("task-parent-unavailable：子任务与当前实际父任务run/flow不一致，未登记任务。", "子任务与当前实际父任务run/flow不一致，未登记任务。");
        if (!sourceIsCurrent()) return fail("worker-dispatch-source-changed：发起轮次已变化，未登记任务。", "发起轮次已变化，未登记任务。");
        // A built-in target does not turn an execution dispatch into planning authorization.
        if (!workerDispatch && created.runId) {
          const checked = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: created.flowId, runId: created.runId,
            parentTaskId, ...(d.reviewTarget ? { reviewTarget: d.reviewTarget } : {}), ...(requestedModuleId ? { moduleId: requestedModuleId } : {}) });
          if (!checked.ok) return fail(`${checked.code}：${checked.message}`, checked.message);
          if (!sourceIsCurrent()) return fail("worker-dispatch-source-changed：预检期间发起轮次已变化，未登记任务。", "预检期间发起轮次已变化，未登记任务。");
          if (checked.value.kind === "review") {
            if (!checked.value.reviewBasisRef || !checked.value.parentTaskRef || checked.value.runId !== created.runId ||
                checked.value.flowId !== created.flowId || created.runState !== "pinned")
              return fail("review-source-unavailable：实际评审来源或已冻结run不匹配，未派发。", "实际评审来源或已冻结run不匹配，未派发。");
            if (requestedModuleId || requestedModulePaths?.length)
              return fail("review-module-scope-forbidden：评审不接受实现模块写区，未派发。", "评审不接受实现模块写区，未派发。");
            const { moduleId, modulePaths, moduleDirectory, ...withoutModule } = created;
            created = { ...withoutModule, reviewBasisRef: checked.value.reviewBasisRef, parentTaskRef: checked.value.parentTaskRef };
          } else if (checked.value.kind === "execution") created = { ...created, moduleId: checked.value.moduleId, modulePaths: checked.value.modulePaths };
        }
        if (!executionRunId || !executionFlowId) return fail("task-parent-unavailable：缺少实际父任务run/flow，未登记任务。", "缺少实际父任务run/flow，未登记任务。");
        if (!created.reviewBasisRef) {
          const parent = await prepareParentTaskRef({ projectRoot, actorRoleId: "convener", taskId: parentTaskId,
            flowId: executionFlowId, runId: executionRunId });
          if (!parent.ok) return fail(`${parent.code}：${parent.message}`, parent.message);
          created = { ...created, parentTaskRef: parent.parentTaskRef };
        }
        if (!sourceIsCurrent())
          return fail("worker-dispatch-source-changed：父任务绑定已变化，未登记任务。", "父任务绑定已变化，未登记任务。");
      }
      const appended = await this.appendTaskStateResult(projectRoot, created);
      if (!appended.ok) return fail(`任务未登记、未投递：${appended.code}：${appended.message}`, `任务未登记、未投递：${appended.message}`);
      if (appended.replay) return { ok: true, message: `任务 #${taskId} 的同一登记已存在，未重新打开会话或投递；登记重放不授权执行。` };
      if (workerDispatch) createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: fromRoleId })
        .record("worker.dispatch.parent-observed", { taskId, parentTaskId, runId: executionRunId, flowId: executionFlowId });
      // Recheck the source-selection invariant after every ledger await, before releasing this exact lease.
      if (initializationSelectionIsCurrent && !initializationSelectionIsCurrent())
        throw new Error("子任务来源在提交期间发生变化，尚未投递，请检查诊断后重试。");
      // This committed child now owns its durable source; later parent settlement/focus changes do not revoke it.
    } finally {
      if (sourceLease) {
        const ended = endGitHostAction(sourceLease);
        if (!ended.ok) throw new Error("项目状态协调未能完成，请检查诊断后重试。");
      }
    }
    this.starTaskIds.add(taskId);
    taskCreators.set(taskId, fromRoleId === this.handbackOwnerRoleId(projectRoot) ? "convener" : "chief");
    this.appendRoleActivity(projectRoot, fromRoleId, {
      kind: "task.created",
      summary: `派发任务 #${taskId} → ${targetRoleId}：${shortenSummary(task)}`,
      taskId,
      status: sideEffect,
    });
    const probes = new Map<string, string | undefined>();
    for (const readPath of extractDispatchReadPaths(task)) {
      probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
    }
    const plan = planDispatchDelivery(
      { roleId: targetRoleId, task, ...(reason !== undefined ? { reason } : {}) },
      probes,
      {
        sourceRoleId: this.roleDisplayName(projectRoot, fromRoleId),
        taskId,
        ...(expectedOutput !== undefined ? { expectedOutput } : {}),
        ...(requestedEvidence !== undefined ? { requestedEvidence } : {}),
      },
    );
    if (plan.action === "reject") {
      await this.recordTaskFailure(projectRoot, taskId, `delivery-rejected: ${shortenSummary(plan.message)}`);
      return fail(plan.message, plan.systemRow);
    }
    // 目标已有活会话 ⇒ 按其真实引擎投递（不让幕僚会话的引擎选择串到目标）。
    // 2026-10-29（BUG-5）：目标**无活会话**时先同步 open/resume；失败则拒发并给派发者回执，
    // 绝不再把任务静默留在队列里等一个可能永远不会出现的“下次时机”。
    if (workSourceRef || created.parentTaskRef || workerDispatch) {
      const assigned = await inspectAssignedTask({ projectRoot, taskId, actorRoleId: targetRoleId });
      if (!assigned.ok) return fail(`${assigned.code}：${assigned.message ?? assigned.code}`, assigned.message ?? assigned.code);
    }
    const taskBoundDispatch = workerDispatch || created.reviewBasisRef !== undefined || created.hubRouting === "chief-hub-v1";
    let deliveryRuntime = this.findLiveRuntime(projectRoot, targetRoleId) ?? runtime;
    const existingWorker = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, deliveryRuntime));
    if (!existingWorker || taskBoundDispatch && !existingWorker.busy && existingWorker.origins.running === undefined) {
      const opened = await this.openInternal({ projectRoot, roleId: targetRoleId, runtime: deliveryRuntime,
        ...(taskBoundDispatch ? { taskId } : {}) }, false);
      if (!opened.ok) {
        await this.recordTaskFailure(projectRoot, taskId, `delivery-target-open-failed: ${shortenSummary(opened.error ?? mainT("shared.common.unknownReason"))}`);
        return fail(
          mainT("main.session.dispatchTargetOpenFailed", {
            target: this.roleDisplayName(projectRoot, targetRoleId),
            detail: opened.error ?? mainT("shared.common.unknownReason"),
          }),
          "派发未投递：目标会话无法打开（未入队；已如实回执）。",
        );
      }
      deliveryRuntime = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, deliveryRuntime))?.runtime ?? deliveryRuntime;
    }
    if (workSourceRef || created.parentTaskRef || workerDispatch) {
      const assigned = await inspectAssignedTask({ projectRoot, taskId, actorRoleId: targetRoleId });
      if (!assigned.ok || workSourceRef && (assigned.value.workSourceRef?.sourceId !== workSourceRef.sourceId ||
          assigned.value.workSourceRef.sha256 !== workSourceRef.sha256)) {
        const code = assigned.ok ? "assigned-child-work-source-mismatch" : assigned.code;
        const detail = assigned.ok ? `expectedSourceId=${workSourceRef?.sourceId} actualSourceId=${assigned.value.workSourceRef?.sourceId ?? "missing"} expectedSha256=${workSourceRef?.sha256} actualSha256=${assigned.value.workSourceRef?.sha256 ?? "missing"}` : assigned.message ?? assigned.code;
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: fromRoleId }).record("dispatch.child.before-enqueue-rejected", { taskId, errorCode: code, errorMessage: detail });
        await this.recordTaskFailure(projectRoot, taskId, `assigned-child-unavailable-before-enqueue:${code}:${detail}`);
        return fail(`assigned-child-unavailable-before-enqueue code=${code}：${detail}。子任务尚未投递。`, "子任务当前来源或授权已失效，尚未投递。");
      }
    }
    // The committed child's durable work source survives its parent turn settling and UI focus changes.
    // Actual child cancellation, root/basis and execution authorization are rechecked by Pipeline/Service.
    const deliveryDedupKey = `${projectRoot}\u0000${deliveryRuntime}\u0000task\u0000${taskId}`;
    this.activeDispatchKeys.add(deliveryDedupKey);
    this.enqueueDelivery(projectRoot, targetRoleId, {
      kind: "dispatch",
      runtime: deliveryRuntime,
      targetRoleId,
      sourceRoleId: fromRoleId,
      taskId,
      text: plan.text,
      summary: `[任务] #${taskId} → ${this.roleDisplayName(projectRoot, targetRoleId)}：${shortenText(task, 40)}`,
      dedupKey: deliveryDedupKey,
      clientMessageId: this.appDispatchClientMessageId(deliveryDedupKey),
    });
    // 幕僚 pane 的任务卡系统行（固定字段；受理 ≠ 完成）。
    const card = taskCardOf(state.records.get(taskId) ?? { taskId, created, reports: [], redispatches: [] });
    if (card !== undefined) {
      this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, renderTaskCardLines(card).join("；"));
    }
    void this.drainQueue(projectRoot, targetRoleId, deliveryRuntime);
    const openNote = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, deliveryRuntime)) ? "" : mainT("main.session.sessionWillAutoOpen");
    const advisorySummary = this.dispatchAdvisorySummary(advisories);
    if (advisories.length > 0) {
      const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: targetRoleId });
      for (const advisory of advisories) {
        diagnostic.record("tasks.dispatch.advisory", {
          sourceRoleId: fromRoleId,
          targetRoleId,
          reasonCode: advisory.code,
          phase: "dispatch",
          mode: "authorization-only",
        });
      }
      this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, `状态提示（未阻断）：${advisorySummary}`);
    }
    return {
      ok: true,
      message:
        mainT("main.session.acceptedTask", {
          to: this.roleDisplayName(projectRoot, targetRoleId),
          openNote,
          from: this.roleDisplayName(projectRoot, fromRoleId),
        }) +
        `任务编号：#${taskId}（sideEffect=${sideEffect}；受理 ≠ 完成）。` +
        (advisories.length > 0 ? `状态提示（未阻断）：${advisorySummary}` : ""),
    };
  }

  /**
   * T3（2026-11-10 两条固定工作流路径，B1）：fixed 派发路由（`matrix:"two-fixed-paths/v1"`）。
   *
   * 依据：v1.3 §3.1/§3.2（fixed 矩阵）、§3.3（stage-request 原语）、§3.6（Q6 父门替代证据 fail-closed）、
   * §4.1（per-flow）；B1 验收 AC-01/AC-02/AC-04/AC-05/AC-12、T-01/T-05。
   *
   * 与 `routeStarDispatch` 的差异（**不调用** legacy 机制）：不调用 `prepareRoleDispatch`/
   * `freezeExecutionRun`/run-manifest pin/roster、`evaluateDispatchPreflight` advisories、`chainDispatchFacts`、
   * `versioned-doc-baseline` 收集、`hubPreparation` 五内置判断；不写 `.ans/runs`/`.ans/trunk`。
   * 复用：目标枚举刷新、`sourceIsCurrent` 口径、幂等查重、投递队列、`sideEffect` 分类、报告回交
   * （`task.created.from` 路由，后续链共用）。
   *
   * 硬授权（**fail-closed**，不得默认通过）：`evaluateFixedPathDispatchAuthorization` +
   * Q6 证据（live-turn `sourceIsCurrent` + convener 生产派发的 `inspectAssignedTask` 绑定 + identity/target +
   * 应用计算幂等键）。证据缺失/不匹配 ⇒ `dispatch-evidence-missing`/`dispatch-source-changed`/
   * `stage-request-required`。本方法**不写入** workflow 状态/授权：stage-request 的阶段账本事件只由编排
   * `workflowService.requestStage` 写（单一实现），桌面只透传宿主捕获事实与投递。
   */
  private async routeFixedPathDispatch(
    projectRoot: string,
    runtime: RuntimeKind,
    fromRoleId: string,
    d: DispatchTaskPayload,
    targetRoleId: string,
    task: string,
    source: ActualDispatchSource | undefined,
    dispatchFlowId: string,
  ): Promise<DispatchReceipt> {
    const reject = (code: string, message: string): DispatchReceipt => {
      this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, `${code}：${message}`);
      return { ok: false, message: `${code}：${message}` };
    };
    const chiefRoleId = this.chiefTaskRoleIdOf(projectRoot);
    const convenerRoleId = this.handbackOwnerRoleId(projectRoot);
    const chiefId = chiefRoleId ?? "chief";
    const convenerId = convenerRoleId ?? "convener";
    // 旧候选评审绑定（reviewTarget）＝ trunk/candidate 机制；fixed 路径不使用（验收按任务分支/reviewRoleId，B3）。
    if (d.reviewTarget !== undefined) {
      return reject("review-target-invalid", "fixed 路径不使用旧候选评审绑定（reviewTarget）；验收按 workflow/reviewRoleId 直接派发。");
    }
    const reason = typeof d.reason === "string" ? d.reason : undefined;
    const expectedOutput = typeof d.expectedOutput === "string" && d.expectedOutput.trim() !== "" ? d.expectedOutput.trim() : undefined;
    const requestedEvidence = Array.isArray(d.requestedEvidence)
      ? d.requestedEvidence.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 5)
      : undefined;
    const requestedModuleId = typeof d.moduleId === "string" && d.moduleId.trim() !== "" ? d.moduleId.trim() : undefined;
    const requestedModulePaths = Array.isArray(d.modulePaths)
      ? [...new Set(d.modulePaths.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()))].slice(0, 20)
      : undefined;
    const isStageRequest = d.taskKind === "stage-request";
    if (d.workflowPath !== undefined && !isStageRequest) {
      return reject("workflow-path-not-stage-request", "workflowPath 只允许出现在 taskKind=stage-request 的任务上。");
    }
    if (d.reworkOf !== undefined && !isStageRequest) {
      return reject("stage-request-invalid", "reworkOf 只允许出现在 taskKind=stage-request 的请求上。");
    }
    // 幂等键（应用计算；显式 idempotencyKey 仍按既有 `taskIdempotencyKey` 规则使用；重复抑制同 legacy 口径）。
    const idempotencyKey = taskIdempotencyKey({
      from: fromRoleId,
      to: targetRoleId,
      text: task,
      ...(typeof d.idempotencyKey === "string" ? { idempotencyKey: d.idempotencyKey } : {}),
      ...(requestedModuleId !== undefined ? { moduleId: requestedModuleId } : {}),
    });
    const state = await this.readTasks(projectRoot);
    const duplicate = findTaskByIdempotencyKey(state, idempotencyKey);
    if (duplicate !== undefined) {
      const terminal = duplicate.closed !== undefined || duplicate.reports.length > 0;
      return {
        ok: true,
        message: terminal
          ? `已受理：任务 #${duplicate.taskId} 已${duplicate.closed !== undefined ? "收口" : "报告"}，重复派发已抑制（未创建新任务、未投递）；如需返工请使用新的任务文本或幂等键。`
          : `已受理：同一任务已存在（#${duplicate.taskId}），未重复派发；受理 ≠ 完成。`,
      };
    }
    // 目标事实（缓存 miss ⇒ 实时重枚举一次再判；与 legacy 同一依赖路径）。
    await this.refreshListingNow(projectRoot);
    const listingForPreflight = this.deps.getListing(projectRoot);
    const targetRole = listingForPreflight?.roles.find((role) => role.roleId === targetRoleId);
    const targetBuiltIn = targetRole?.builtIn === true || isBuiltInGovernanceRoleId(targetRoleId);
    const targetExists = targetRole !== undefined || isBuiltInGovernanceRoleId(targetRoleId);
    const isChiefSource = fromRoleId === chiefId;
    // T3 B8.2（2026-11-11，RR3 根因 2：运营无法获知 workflowId、9 次生产派发被 B7.1 证据门拒绝后回落
    // legacy stable-write）：运营（convener）的**生产派发**由应用从**来源真实受派任务**（`source.origin.taskId`
    // 的 `task.created`）自动绑定 workflowId/stage/flowId——不要求模型自报。显式 `workflowId` 仍须与父任务
    // 一致（不一致 ⇒ `stage-request-invalid`）；flowId 不是可信事实（按父任务账本为准）；显式 `stage` 是本次
    // 生产派发的目标阶段（如 A7 stage-request 之后派 A8），允许与父任务 stage 不同，缺失时才从父任务绑定。
    // 绑定失败（无受派任务/非 open fixed stage-request/缺 workflowId·stage·flowId/workflow 不在账本）
    // ⇒ `workflow-binding-unavailable` fail-closed：不创建任务、不写 trunk/run、**不回落 legacy 星形派发**。
    // 绑定值用于 workflow 事实/任务创建/stage.dispatched（单一事实来源 = 账本）。
    let effectiveStage: NonNullable<WorkflowView["stage"]> | undefined = d.stage;
    let effectiveFlowId = dispatchFlowId;
    let workflowId = typeof d.workflowId === "string" && d.workflowId.trim() !== "" ? d.workflowId.trim() : undefined;
    // convener 生产派发必须绑定当前真实受派的 open stage-request 任务（只认 tasks 账本；不采信自报）。
    let assignedTaskEvidence: {
      taskId?: string; from?: string; to?: string; taskKind?: string; workflowId?: string;
      stage?: NonNullable<WorkflowView["stage"]>; open?: boolean; stopped?: boolean;
    } | undefined;
    let assignedTaskFlowId: string | undefined;
    const assignedTaskId = !isStageRequest && fromRoleId === convenerId && typeof source?.origin.taskId === "string"
      ? source.origin.taskId.trim()
      : "";
    if (assignedTaskId !== "") {
      const assigned = await inspectWorkflowAssignedTask({ projectRoot, taskId: assignedTaskId, actorRoleId: fromRoleId });
      if (assigned.ok) {
        assignedTaskEvidence = {
          taskId: assigned.task.taskId,
          from: assigned.task.from,
          to: assigned.task.to,
          ...(assigned.task.taskKind !== undefined ? { taskKind: assigned.task.taskKind } : {}),
          ...(assigned.task.workflowId !== undefined ? { workflowId: assigned.task.workflowId } : {}),
          ...(assigned.task.stage !== undefined ? { stage: assigned.task.stage } : {}),
          open: assigned.task.open,
          stopped: assigned.task.stopped,
        };
        assignedTaskFlowId = assigned.task.flowId;
      }
    }
    if (!isStageRequest && fromRoleId === convenerId) {
      const assignedReady = assignedTaskEvidence !== undefined
        && assignedTaskEvidence.open === true
        && assignedTaskEvidence.stopped !== true
        && assignedTaskEvidence.from === "chief"
        && assignedTaskEvidence.to === convenerId
        && assignedTaskEvidence.taskKind === "stage-request"
        && typeof assignedTaskEvidence.workflowId === "string" && assignedTaskEvidence.workflowId !== ""
        && assignedTaskEvidence.stage !== undefined;
      const needsBinding = workflowId === undefined || effectiveStage === undefined || effectiveFlowId === "";
      if (needsBinding) {
        if (!assignedReady) {
          const why = assignedTaskId === ""
            ? "缺少当前真实受派任务（source.origin.taskId）"
            : assignedTaskEvidence === undefined
              ? "当前受派任务不可读"
              : "当前受派任务不是 open 的 fixed stage-request（须 chief→convener、taskKind=stage-request、workflowId/stage 齐全）";
          return reject(
            "workflow-binding-unavailable",
            `运营生产派发无法从受派任务自动绑定 workflowId/stage：${why}。未创建任务、未写 trunk/run，且不回落 legacy 星形派发。`,
          );
        }
        const boundWorkflowId = assignedTaskEvidence?.workflowId;
        const boundStage = assignedTaskEvidence?.stage;
        if (boundWorkflowId === undefined || boundWorkflowId === "" || boundStage === undefined
          || assignedTaskFlowId === undefined || assignedTaskFlowId === "") {
          return reject("workflow-binding-unavailable", `受派任务 ${assignedTaskId} 缺少 workflowId/stage/flowId，无法绑定 fixed 生产派发。`);
        }
        if (workflowId !== undefined && workflowId !== boundWorkflowId) {
          return reject("stage-request-invalid", `显式 workflowId ${workflowId} 与当前受派任务（${boundWorkflowId}）不一致；不采信模型自报、不回落 legacy。`);
        }
        // flowId 不是可信事实：模型可能按 legacy 口径记错（RR3 的 `flow snake-game`）——绑定路径下
        // **以受派任务的账本 flowId 为准**（不因自报 flowId 不同而拒绝合法派发；任务创建用绑定值）。
        // 显式 stage 是本次生产派发的目标阶段（A7 请求之后派 A8 等），允许与父任务 stage 不同；仅缺失时绑定。
        const bindingLedger = await readWorkflowLedger(projectRoot);
        if (!bindingLedger.events.some((event) => event.workflowId === boundWorkflowId)) {
          return reject("workflow-binding-unavailable", `受派任务 ${assignedTaskId} 绑定的 workflow ${boundWorkflowId} 在账本不存在（不猜、不伪造视图）。`);
        }
        workflowId = boundWorkflowId;
        if (effectiveStage === undefined) effectiveStage = boundStage;
        effectiveFlowId = assignedTaskFlowId;
      } else if (assignedReady) {
        // 模型显式 workflowId 仍须与父任务一致（不一致 ⇒ 拒绝，不静默改写；v1.3 §3.3 第 6 条）。
        if (workflowId !== assignedTaskEvidence?.workflowId) {
          return reject("stage-request-invalid", `显式 workflowId ${workflowId} 与当前受派任务（${assignedTaskEvidence?.workflowId}）不一致；不采信模型自报、不回落 legacy。`);
        }
        // flowId 以父任务账本为准（不采信自报）；stage 保留模型给出的目标阶段（仍受账本状态机约束）。
        if (assignedTaskFlowId !== undefined && assignedTaskFlowId !== "") effectiveFlowId = assignedTaskFlowId;
      }
    }
    // workflow 事实（`workflowId` 来自父任务自动绑定或宿主透传字段；存在即须在账本真实存在且未关闭——不猜、不伪造视图）。
    let workflowView: WorkflowView | undefined;
    let scopedWorkflowEvents: readonly WorkflowEvent[] = [];
    let basisReviewRoleId: string | undefined;
    if (workflowId !== undefined) {
      const ledger = await readWorkflowLedger(projectRoot);
      scopedWorkflowEvents = ledger.events.filter((event) => event.workflowId === workflowId);
      if (scopedWorkflowEvents.length === 0) {
        return reject("workflow-not-found", `workflow ${workflowId} 不存在（账本无记录）。`);
      }
      const view = deriveWorkflowView(scopedWorkflowEvents, state.events);
      if (view.blocked?.code === "workflow-corrupt") {
        return reject("workflow-corrupt", `工作流账本损坏：${view.blocked.summary}（不猜、不自动推进）。`);
      }
      if (view.closed !== undefined) {
        return reject("workflow-closed", `workflow ${workflowId} 已关闭（${view.closed.outcome}），不再接受派发。`);
      }
      workflowView = view;
      const basis = await readBasisLedger(projectRoot);
      const basisEvents = basis.events
        .filter((event): event is Extract<BasisEvent, { kind: "basis.recorded" | "basis.amended" }> =>
          event.kind === "basis.recorded" || event.kind === "basis.amended")
        .filter((event) => event.workflowId === workflowId);
      const latestBasis = basisEvents[basisEvents.length - 1];
      basisReviewRoleId = latestBasis?.reviewRoleId;
    }
    // purpose 由**可信路由事实**派生（不信任模型自报）：stage-request＝stage-request；chief→内置 verifier＝
    // review；chief→项目角色仅当目标是本 workflow 的 `reviewRoleId`（MF-10 窄例外；唯一可信来源 =
    // `basis.recorded.reviewRoleId`，不取模型自报/投影未派生字段）＝review，其余按生产派发拒绝
    // （提示交运营；仍由谓词判定，桌面只透传事实）；convener＝production。
    const workflowReviewRoleId = basisReviewRoleId;
    let purpose: RoleDispatchPurpose = isStageRequest ? "stage-request" : isChiefSource ? "review" : "production";
    let rosterReviewRoleId: string | undefined;
    if (!targetBuiltIn && isChiefSource && !isStageRequest) {
      if (workflowReviewRoleId !== undefined && workflowReviewRoleId === targetRoleId) {
        purpose = "review";
        const roster = await loadLatestWorkflowRoster({ projectRoot, flowId: dispatchFlowId });
        if (roster.ok) rosterReviewRoleId = reviewRoleIdOfRoster(roster.roster);
      } else {
        purpose = "production";
      }
    }
    const targetActivated = workflowView?.activatedRoleIds?.includes(targetRoleId) === true;
    // Q6 live-turn 证据（与 routeStarDispatch 同口径；只读本会话真实条目/轮次，不采信模型自报）。
    const sourceIsCurrent = (): boolean => !!source && this.sessions.get(this.sessionKey(projectRoot, fromRoleId, runtime)) === source.entry &&
      source.entry.busy && source.entry.origins.running === source.origin && !source.origin.settled &&
      !this.runTaskIsFenced(projectRoot, source.origin.taskId, source.origin.assignment?.runId) &&
      !source.entry.interactionState.lifetime.signal.aborted && !source.entry.interactionState.turn.signal.aborted;
    // stage-request 的 sourceTaskId = host 捕获的 chief 当前真实客户轮次（不可模型自报）。
    const stageRequestSourceTaskId = isStageRequest && typeof source?.origin.turnId === "string" ? source.origin.turnId.trim() : "";
    // 应用计算的幂等证据键（stage-request：与 workflow-service 同源 helper；attempt 按账本推导，
    // 服务层仍为权威并独立复核）。
    const requestDigest = createHash("sha256").update(task).digest("hex");
    let evidenceIdempotencyKey: string | undefined = idempotencyKey;
    if (isStageRequest) {
      evidenceIdempotencyKey = undefined;
      const action = d.workflowAction ?? "advance";
      if (workflowId !== undefined && d.stage !== undefined) {
        const attempts = scopedWorkflowEvents
          .filter((event): event is Extract<WorkflowEvent, { kind: "stage.requested" }> =>
            event.kind === "stage.requested" && event.stage === d.stage)
          .map((event) => event.attempt);
        const stops = scopedWorkflowEvents.filter((event) => event.kind === "workflow.stop-requested").length;
        const attempt = action === "stop" ? stops + 1 : attempts.length === 0 ? 1 : Math.max(...attempts) + 1;
        evidenceIdempotencyKey = action === "stop"
          ? stageStopIdempotencyKey(workflowId, d.stage, attempt)
          : stageRequestIdempotencyKey(workflowId, d.stage, attempt);
      } else if (d.workflowPath !== undefined && d.stage !== undefined && stageRequestSourceTaskId !== "") {
        const computed = workflowIdFor(dispatchFlowId, d.workflowPath, stageRequestSourceTaskId, requestDigest);
        evidenceIdempotencyKey = stageRequestIdempotencyKey(computed, d.stage, 1);
      }
    }
    // convener 生产派发的受派任务证据与 workflowId/stage/flowId 自动绑定已在 workflow 事实之前完成
    // （B8.2；绑定失败的 fail-closed 拒绝发生在那一步，不落到此处）。
    const authorization = evaluateFixedPathDispatchAuthorization({
      sourceRoleId: fromRoleId,
      chiefRoleId: chiefId,
      convenerRoleId: convenerId,
      targetRoleId,
      targetKind: targetBuiltIn ? "built-in-governance" : "project",
      targetExists,
      purpose,
      ...(workflowId !== undefined || workflowView !== undefined
        ? {
            workflow: {
              ...(workflowId !== undefined ? { workflowId } : {}),
              ...(workflowReviewRoleId !== undefined ? { reviewRoleId: workflowReviewRoleId } : {}),
              ...(workflowView?.stage !== undefined ? { stage: workflowView.stage } : {}),
            },
          }
        : {}),
      ...(workflowReviewRoleId !== undefined ? { reviewRoleId: workflowReviewRoleId } : {}),
      ...(rosterReviewRoleId !== undefined ? { rosterReviewRoleId } : {}),
      ...(basisReviewRoleId !== undefined ? { basisReviewRoleId } : {}),
      ...(targetActivated ? { targetActivated } : {}),
      ...(isStageRequest
        ? {
            stageRequest: {
              taskKind: d.taskKind,
              ...(d.workflowAction !== undefined ? { workflowAction: d.workflowAction } : {}),
              sideEffect: "read-only" as const,
              ...(requestedModuleId !== undefined ? { moduleId: requestedModuleId } : {}),
              ...(requestedModulePaths !== undefined ? { modulePaths: requestedModulePaths } : {}),
            },
          }
        : {}),
      evidence: {
        sourceIsCurrent: sourceIsCurrent(),
        ...(evidenceIdempotencyKey !== undefined ? { idempotencyKey: evidenceIdempotencyKey } : {}),
        identity: { sourceRoleId: fromRoleId, targetRoleId },
        ...(assignedTaskEvidence !== undefined ? { assignedTask: assignedTaskEvidence } : {}),
        ...(stageRequestSourceTaskId !== "" ? { sourceTaskId: stageRequestSourceTaskId } : {}),
      },
    });
    if (!authorization.ok) {
      const missingNote = authorization.missing !== undefined && authorization.missing.length > 0
        ? `（缺失/不一致：${authorization.missing.join("、")}）`
        : "";
      return reject(authorization.code, `${authorization.message}${missingNote}`);
    }
    if (!isStageRequest && workflowId === undefined) {
      // fixed 生产任务必须携带 workflowId（v1.3 §3.3 第 6 条；无 workflowId 会落到 legacy run-required）。
      return reject("dispatch-evidence-missing", "fixed 生产派发必须携带 workflowId（工作流绑定证据）。");
    }
    if (!isStageRequest && effectiveStage === undefined) {
      return reject("dispatch-evidence-missing", "fixed 生产派发必须携带目标 stage（账本绑定证据）。");
    }
    // T3 B3（AC-10/v1.3 §4.3 MF-12）：路径 B 在 B1/B3 生产派发前完成最小仓库/分支准备
    // （既有仓库；无仓库 ⇒ `b-repository-required`，不自动 init；basis.recorded(reason:"path-b")）。
    // 幂等：已有 basis 记录 ⇒ no-op。非 B 路径 workflow 直接放行（零行为）。B8.2：flow 取自动绑定值。
    if (!isStageRequest && workflowId !== undefined && (effectiveStage === "B1" || effectiveStage === "B3")) {
      const pathB = await this.ensurePathBStartForDispatch(projectRoot, workflowId, effectiveFlowId);
      if (!pathB.ok) return reject(pathB.code, pathB.message);
    }
    // T3 B3（AC-19/§7.2）：A11/B1/B3 实现派发前复核 basis（文档/计划 hash 漂移 ⇒ `basis-drift`，
    // `basis-missing`；不派实现）。B1 由上面的路径 B 准备先写 basis，再复核。
    // T3 B2.1（AC-19/T-08；MF-B2-02）：补 `stage` ⇒ 关键门一致时按 v1.3 §7.2 G-9 节流入账
    // `basis.verified`（同 basis+同文档摘要只记一次）；drift/缺失仍 fail-closed 拒绝派发。
    if (!isStageRequest && workflowId !== undefined && fromRoleId === convenerId
      && (effectiveStage === "A11" || effectiveStage === "B1" || effectiveStage === "B3")) {
      const basis = await verifyBasisForWorkflow({ projectRoot, workflowId, stage: effectiveStage });
      if (!basis.ok) return reject(basis.code, basis.message);
    }
    // T3 B3（AC-10/§4.3 MF-8）：B3 写集 = B2 `change.scope-decided.scope.files` ∩ roster/边界派生；
    // 派发任务声明的模块路径必须落在该角色有效写集内（越界 ⇒ `b-change-scope-invalid`）。
    if (!isStageRequest && workflowId !== undefined && effectiveStage === "B3") {
      const writeSet = await this.checkPathBWriteSetForDispatch(projectRoot, workflowId, effectiveFlowId, targetRoleId, requestedModulePaths);
      if (!writeSet.ok) return reject(writeSet.code, writeSet.message);
    }
    // B21（2026-11-11，RR16 失败修复）：fixed A11 实现任务的模块写集以 `moduleId` 为权威——应用从
    // 最新名单模块表派生该模块路径并写入任务；模型 `modulePaths` 仅作断言，跨模块/未知 moduleId
    // ⇒ `module-paths-mismatch` fail-closed（不把空交集留到 worker 写门）。一模块一任务。
    let effectiveModulePaths = requestedModulePaths;
    if (!isStageRequest && fromRoleId === convenerId && effectiveStage === "A11"
      && requestedModuleId !== undefined && workflowId !== undefined) {
      const roster = await loadLatestWorkflowRoster({ projectRoot, flowId: effectiveFlowId });
      if (!roster.ok) {
        return reject("module-paths-mismatch", `A11 模块授权无法核验：最新名单不可读（${roster.reason}）。`);
      }
      const moduleWriteSet = deriveFixedModuleWriteSet(roster.roster, requestedModuleId, requestedModulePaths);
      if (!moduleWriteSet.ok) return reject(moduleWriteSet.code, moduleWriteSet.message);
      effectiveModulePaths = moduleWriteSet.paths;
    }
    // 核验期间来源变化 ⇒ 不创建（fail-closed；与 legacy worker-dispatch 同方向）。
    if (!sourceIsCurrent()) return reject("dispatch-source-changed", "核验期间来源轮次已变化，未创建任务。");
    const sideEffect = isStageRequest ? "read-only" as const : classifyTaskSideEffect(d?.sideEffect, task);
    let taskId: string;
    if (isStageRequest) {
      if (d.stage === undefined) return reject("stage-request-invalid", "stage-request 必须给出目标阶段（stage）。");
      const requestedAction = d.workflowAction ?? "advance";
      // T3 B5.1（G-B5-2，AC-10；v1.3 §4.3 B2）：路径 B 的 B3 advance 请求受理**之前**，由应用校验
      // 影响面报告字节 hash 并记录 B2 `change.scope-decided`（候选路径优先取 `requestedEvidence`，其次
      // B1 生产任务 modulePaths；属主/有效写集由编排按名单/边界派生——不采信模型自报写集）。
      // 失败 fail-closed：B3 请求不受理、不创建任务；B2 已记录 ⇒ 幂等 replay 不重复写。
      if (requestedAction === "advance" && d.stage === "B3" && workflowId !== undefined) {
        const scope = await recordFixedPathBScopeDecisionForDispatch({
          projectRoot,
          flowId: dispatchFlowId,
          workflowId,
          ...(requestedEvidence !== undefined ? { candidateFiles: requestedEvidence } : {}),
        });
        if (!scope.ok) return reject(scope.code, `B2 范围决定未记录：${scope.message}（B3 请求未受理）。`);
      }
      const stageRequest = await requestStage({
        projectRoot,
        flowId: dispatchFlowId,
        stage: d.stage,
        ...(requestedAction !== "advance" ? { workflowAction: requestedAction } : {}),
        ...(d.workflowPath !== undefined ? { workflowPath: d.workflowPath } : {}),
        ...(workflowId !== undefined ? { workflowId } : {}),
        ...(d.reworkOf !== undefined ? { reworkOf: d.reworkOf } : {}),
        requestDigest,
        ...(stageRequestSourceTaskId !== "" ? { sourceTaskId: stageRequestSourceTaskId } : {}),
        text: task,
        ...(reason !== undefined ? { reason } : {}),
      });
      if (!stageRequest.ok) return reject(stageRequest.code, stageRequest.message);
      taskId = stageRequest.taskId;
      if (stageRequest.replay) {
        return { ok: true, message: `已受理：同一 stage-request 已存在（#${taskId}），未重复投递；受理 ≠ 完成。` };
      }
      if (!sourceIsCurrent()) {
        return reject("dispatch-source-changed", "stage-request 已登记，但来源轮次在投递前已变化（未投递）。");
      }
    } else {
      const newId = newTaskId(new Date(this.now()));
      const createdAt = new Date(this.now());
      const created = taskEvent("task.created", {
        taskId: newId,
        from: fromRoleId === convenerId ? "convener" : "chief",
        flowId: effectiveFlowId,
        ...(workflowId !== undefined ? { workflowId } : {}),
        ...(workflowId !== undefined && effectiveStage !== undefined ? { stage: effectiveStage } : {}),
        to: targetRoleId,
        text: task,
        ...(expectedOutput !== undefined ? { expectedOutput } : {}),
        ...(requestedEvidence !== undefined ? { requestedEvidence } : {}),
        ...(requestedModuleId !== undefined ? { moduleId: requestedModuleId } : {}),
        ...(effectiveModulePaths !== undefined && effectiveModulePaths.length > 0 ? { modulePaths: effectiveModulePaths } : {}),
        sideEffect,
        idempotencyKey,
      }, () => createdAt);
      const appended = await appendTaskEvent(projectRoot, created);
      if (!appended.ok) return reject(appended.code ?? "task-ledger-write-failed", `任务未登记、未投递：${appended.message}`);
      taskId = newId;
    }
    // T3 B5.1（G-B5-1，AC-08/AC-09；v1.3 §4.5）：非 stage-request 的 fixed 任务创建 ⇒ 按真实
    // task.created 记 `stage.dispatched`（A1/A4/A7 完成于任务创建；A8/A12a/A12b 在办；A11 已由
    // `requestStage` 记录、B3 无此语义——集合单一来源 = `shouldRecordFixedStageDispatch`）。
    // 状态机窗口外（既有 review 直派夹具）不写也不阻断；账本/服务失败 fail-closed：不回滚已创建任务、
    // 不投递、如实回报（绝不伪造 stage.dispatched）。
    if (!isStageRequest && workflowId !== undefined && shouldRecordFixedStageDispatch(effectiveStage)) {
      const dispatched = await recordFixedStageDispatchForTask({
        projectRoot,
        workflowId,
        stage: effectiveStage,
        taskId,
        targetRoleId,
        ...(requestedModuleId !== undefined ? { moduleId: requestedModuleId } : {}),
      });
      if (!dispatched.ok) {
        await this.recordTaskFailure(projectRoot, taskId, `stage-dispatch-record-failed: ${dispatched.code}: ${shortenSummary(dispatched.message)}`);
        return reject(
          dispatched.code,
          `stage.dispatched ${effectiveStage} 未记录：${dispatched.message}；任务 #${taskId} 已创建但未投递（不伪造派发，请运营/幕僚核对账本）。`,
        );
      }
    }
    this.starTaskIds.add(taskId);
    taskCreators.set(taskId, fromRoleId === convenerId ? "convener" : "chief");
    this.appendRoleActivity(projectRoot, fromRoleId, {
      kind: "task.created",
      summary: `派发任务 #${taskId} → ${targetRoleId}：${shortenSummary(task)}`,
      taskId,
      status: sideEffect,
    });
    const probes = new Map<string, string | undefined>();
    for (const readPath of extractDispatchReadPaths(task)) {
      probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
    }
    const plan = planDispatchDelivery(
      { roleId: targetRoleId, task, ...(reason !== undefined ? { reason } : {}) },
      probes,
      {
        sourceRoleId: this.roleDisplayName(projectRoot, fromRoleId),
        taskId,
        ...(expectedOutput !== undefined ? { expectedOutput } : {}),
        ...(requestedEvidence !== undefined ? { requestedEvidence } : {}),
      },
    );
    if (plan.action === "reject") {
      await this.recordTaskFailure(projectRoot, taskId, `delivery-rejected: ${shortenSummary(plan.message)}`);
      return reject("dispatch-delivery-rejected", plan.message);
    }
    let deliveryRuntime = this.findLiveRuntime(projectRoot, targetRoleId) ?? runtime;
    // T3 B10.1（2026-11-11，RR5 根因 `report-task-link-broken`）：固定派发必须让目标会话绑定**本次真实
    // 任务**——open 入参携带 `taskId`（→ `openRoleSession` 的 input.taskId 与 `LiveSession.assignedTaskId`）。
    // 否则 run-role 的 handback intent 无任务事实：convener/product/verifier 的 `submit_report` 以
    // 「任务关联未知」到达、`task.reported` 缺失、`close_created_task accepted` 报
    // `close-report-missing`（RR5 实测，A1/A2 调度请求被 rework 收口并重复派发）。
    // B8.1（RR3）的强制 fixed 语义保留：目标未开、非 fixed、或 fixed 但未绑定本次任务（聊天打开/上一
    // 任务）⇒ 以 taskId+`forcedWorkflowMode:"fixed"` 打开。`openInternalUnsafe` 对空闲的既有 fixed
    // 会话安全 dispose 重开；busy/不可关闭 ⇒ `fixed-session-rebind-blocked` fail-closed（不清理在跑轮次）。
    // 唯一例外 = 目标已是 fixed 且忙：本段不打开（避免把正常的「忙时入队」变成拒绝），任务入队保留，
    // 由 drain 在目标空闲后按 taskId+forced 重绑再投——无论哪条路径，**未绑定本次任务的会话绝不会收到
    // 该任务**（不投递、不伪造投递成功）。
    const existingTarget = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, deliveryRuntime));
    const existingTargetFixed = existingTarget !== undefined && existingTarget.projectRoot === projectRoot
      && existingTarget.sessionWorkflowMode === "fixed";
    const targetBoundToTask = existingTargetFixed && existingTarget.assignedTaskId === taskId;
    // 忙时入队不丢（角色卡会话纪律）：fixed 目标忙时不在受理段强开/重绑——条目保留，drain 在目标空闲后
    // 按 taskId+forced 安全重绑再投（`openInternalUnsafe` 对 busy 会话本身 fail-closed，绝不清掉在跑轮次）。
    // 非 fixed（legacy 风险面）仍立即打开走 B8.1 的 fail-closed 拒绝（绝不把 fixed 任务留在 legacy 队列里）。
    const targetBusy = existingTarget !== undefined && (existingTarget.busy || existingTarget.origins.running !== undefined);
    if (!targetBoundToTask && !(existingTargetFixed && targetBusy)) {
      const opened = await this.openInternal({ projectRoot, roleId: targetRoleId, runtime: deliveryRuntime, taskId, forcedWorkflowMode: "fixed" }, false);
      if (!opened.ok) {
        await this.recordTaskFailure(projectRoot, taskId, `delivery-target-open-failed: ${shortenSummary(opened.error ?? mainT("shared.common.unknownReason"))}`);
        if (opened.error !== undefined && (opened.error.startsWith("fixed-session-rebind-blocked") || opened.error.startsWith("worker-task-session-busy"))) {
          return reject("fixed-session-rebind-blocked", `${opened.error}（fixed 任务未投递；目标会话保持原状，待其空闲后重试。）`);
        }
        return reject(
          "dispatch-target-open-failed",
          mainT("main.session.dispatchTargetOpenFailed", {
            target: this.roleDisplayName(projectRoot, targetRoleId),
            detail: opened.error ?? mainT("shared.common.unknownReason"),
          }),
        );
      }
      deliveryRuntime = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, deliveryRuntime))?.runtime ?? deliveryRuntime;
    }
    const deliveryDedupKey = `${projectRoot}\u0000${deliveryRuntime}\u0000task\u0000${taskId}`;
    this.activeDispatchKeys.add(deliveryDedupKey);
    this.enqueueDelivery(projectRoot, targetRoleId, {
      kind: "dispatch",
      runtime: deliveryRuntime,
      targetRoleId,
      sourceRoleId: fromRoleId,
      taskId,
      text: plan.text,
      summary: `[任务] #${taskId} → ${this.roleDisplayName(projectRoot, targetRoleId)}：${shortenText(task, 40)}`,
      dedupKey: deliveryDedupKey,
      clientMessageId: this.appDispatchClientMessageId(deliveryDedupKey),
    });
    const cardRecord = (await this.readTasks(projectRoot)).records.get(taskId);
    const card = cardRecord !== undefined ? taskCardOf(cardRecord) : undefined;
    if (card !== undefined) {
      this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, renderTaskCardLines(card).join("；"));
    }
    void this.drainQueue(projectRoot, targetRoleId, deliveryRuntime);
    const openNote = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, deliveryRuntime)) ? "" : mainT("main.session.sessionWillAutoOpen");
    return {
      ok: true,
      message:
        mainT("main.session.acceptedTask", {
          to: this.roleDisplayName(projectRoot, targetRoleId),
          openNote,
          from: this.roleDisplayName(projectRoot, fromRoleId),
        }) +
        `任务编号：#${taskId}（sideEffect=${sideEffect}；受理 ≠ 完成）。`,
    };
  }

  // —————————————— T3 B3（2026-11-10 两条固定工作流路径）：fixed 应用接线 ——————————————
  //
  // 依据：v1.3 §4.2 A9/A12、§4.3 路径 B、§5（基线）、§6.4/§8.4（merge-main）、§7.1/§7.4；
  // B3 验收 AC-09/AC-10/AC-11/AC-14/AC-15/AC-16/AC-20/AC-22、T-07/T-10/T-11/T-12。
  // 纪律：桌面只做**应用接线**（可信身份绑定、证据收集、卡通道），业务校验/幂等/账本在编排服务；
  // legacy 分支逐字保留；fixed 失败不产生客户卡（merge-main 除外，按高风险动作出卡）。

  /**
   * fixed `complete_team_plan` v4（A9）桌面适配：可信身份由宿主绑定（projectRoot / actorRoleId=convener /
   * 当前真实受派任务的 workflowId）；模型只给 `{operationId,flowId,plan}`。
   * 真实 Git 由 `BaselineGitPort` 执行；B29（2026-11-11，RR22/RR25/RR26）：成功与失败都**原样返回 fixed
   * 服务形状**——成功 `{ok:true,operationId,flowId,workflowId,basisId,plan,documents,replay,
   * stageCompleted}`，失败 `{ok:false,code,message}`（含桌面级前置 blocked）。工具层按入参形状
   * （workflowId+plan）路由 B25 `fixedCompleteTeamPlanReceiptResult`；**不再套 legacy
   * `DirectActionReceipt`**（其成功回执要求 `targetDigest` 为 64-hex，`bas-…` basisId 永远不合形 ⇒
   * 回执恒被降级为「结果未知或回执不完整」）。失败不弹客户卡。
   */
  private async completeTeamPlanFixedForHandle(
    projectRoot: string,
    runtime: RuntimeKind,
    handle: RoleSessionHandle | undefined,
    request: Parameters<CompleteTeamPlanFn>[0],
    signal?: AbortSignal,
  ): Promise<CompleteTeamPlanFixedResult> {
    const blocked = (code: string, message: string): CompleteTeamPlanFixedResult => ({ ok: false, code, message });
    const key = this.sessionKey(projectRoot, "convener", runtime);
    const entry = this.sessions.get(key);
    const origin = entry?.origins.running;
    const current = (): boolean => !!entry && !!origin && entry.handle === handle && this.sessions.get(key) === entry
      && entry.origins.running === origin && entry.busy && !origin.settled
      && !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted;
    if (!current() || !origin?.taskId || signal?.aborted) {
      return blocked("plan-task-unavailable", "缺少当前真实受派运营回合或任务，未登记团队计划。");
    }
    const assigned = await inspectWorkflowAssignedTask({ projectRoot, actorRoleId: "convener", taskId: origin.taskId });
    if (!assigned.ok) return blocked(assigned.code, assigned.message ?? assigned.code);
    if (assigned.task.flowId !== request.flowId) {
      return blocked("plan-flow-conflict", "团队计划 flow 与实际受派任务不一致，未登记团队计划。");
    }
    if (assigned.task.workflowId === undefined) {
      return blocked("plan-task-unavailable", "fixed A9 需要受派任务绑定 workflowId（应用绑定，不采信模型自报）。");
    }
    if (!current() || signal?.aborted) {
      return blocked("plan-task-changed", "核验期间真实受派回合已变化，未登记团队计划。");
    }
    const completed = await completeTeamPlanFixed({
      projectRoot,
      flowId: request.flowId,
      workflowId: assigned.task.workflowId,
      operationId: request.operationId,
      plan: request.plan,
      port: createDesktopBaselineGitPort(),
      actorRoleId: "convener",
      ...(request.runId !== undefined ? { runId: request.runId } : {}),
      ...(request.baseDigest !== undefined ? { baseDigest: request.baseDigest } : {}),
    });
    // B29：成功/失败都**原样返回 fixed 服务形状**——成功 `{ok:true,operationId,flowId,workflowId,
    // basisId,plan,documents,replay,stageCompleted}`；失败 `{ok:false,code,message[,missing]}`。
    // 不再包装成 legacy `DirectActionReceipt`（工具层 B25 校验要求 fixed 形状；包装后的 `bas-…`
    // targetDigest 永远不被 legacy 64-hex 校验接受，回执恒被降级为「结果未知」）。
    return completed;
  }

  /**
   * fixed `close_created_task` v2 桌面适配：身份（projectRoot/actorRoleId）由 run-role 绑定；
   * **应用补证据**（绝不模型自报）：报告证据文件 path+sha256、A11/B3 分支 tip OID、
   * A12b 验收归档（应用 `archiveAcceptance` 生成；失败 ⇒ `acceptance-archive-failed` 阻塞 A12）。
   */
  private async closeCreatedTaskFixedForSession(
    projectRoot: string,
    actorRoleId: string,
    input: FixedCloseCreatedTaskToolInput,
    signal?: AbortSignal,
  ): Promise<Awaited<ReturnType<typeof closeFixedWorkflowTask>>> {
    if (signal?.aborted) {
      return { ok: false, code: "close-task-invalid", message: "本轮已中止，未执行收口。" };
    }
    // T3 B2.1（AC-19/T-08；MF-B2-02）：fixed verifier 的 A12a/A12b accepted 收口（criteria/report
    // 收口，含 A12b 应用验收归档）前 basis drift 复核——A12a/A12b 为 chief→verifier 直派，
    // 不经 convener 派发 basis 门。drift/缺失 ⇒ `basis-drift`/`basis-missing` fail-closed：
    // 拒绝收口/完成（不写 task.closed、不生成归档、不伪造 verified）；一致 ⇒ 按节流入账 basis.verified。
    const basisGate = await this.verifyFixedReviewCloseBasis(projectRoot, input);
    if (!basisGate.ok) return basisGate;
    const evidence = input.outcome === "accepted"
      ? await this.buildFixedCloseEvidence(projectRoot, input.taskId, input.note)
      : { ok: true as const, evidence: undefined };
    if (!evidence.ok) return evidence;
    const closed = await closeFixedWorkflowTask({
      projectRoot,
      actorRoleId,
      operationId: input.operationId,
      taskId: input.taskId,
      outcome: input.outcome,
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(evidence.evidence !== undefined ? { evidence: evidence.evidence } : {}),
    });
    if (closed.ok) {
      void this.drainAllQueuesFor(projectRoot);
      // T3 B3.1（AC-11/AC-14/AC-22；MF-IR-8）：fixed **A12b accepted（A13 前）/ B3 accepted（B4 前）**
      // ⇒ 应用自动调用 `prepareReleaseMerge` 并呈 merge-main 客户卡（不新增工具/客户门）。
      // 异步执行：收口工具立即返回；前置不满足 ⇒ 只回运营/幕僚（不弹注定失败卡）；同一 workflow/tip 幂等。
      if (input.outcome === "accepted" && closed.stageCompleted && isFixedReleaseTriggerStage(closed.stage)
        && closed.workflowId !== undefined) {
        const triggerStage: FixedReleaseTriggerStage = closed.stage;
        const triggerWorkflowId = closed.workflowId;
        void this.autoPresentFixedReleaseMerge({
          projectRoot,
          workflowId: triggerWorkflowId,
          stage: triggerStage,
          taskId: input.taskId,
        }).catch((error: unknown) => {
          createDiagnosticLogger({ component: "desktop.workflow", projectRoot }).error(
            "workflow.release.auto-present.unhandled",
            error,
            { workflowId: triggerWorkflowId, stage: triggerStage },
          );
        });
      }
    }
    return closed;
  }

  /**
   * T3 B2.1（AC-19/T-08；MF-B2-02）：A12a/A12b accepted 收口前 basis 复核（`verifyBasisForStage`）。
   * - 只对真实任务的 fixed A12a/A12b 收口生效（按 `task.created` 的 workflowId/stage 判定，不认自报）；
   * - 仅 `accepted` 收口会触发阶段完成/归档 ⇒ 只在 accepted 时复核（rework/rejected 不推进完成）；
   * - 同 operationId 已收口的重试交给 `closeTask` 原样 replay（不在 replay 上重复复核）；
   * - 服务返回 `basis-drift`/`basis-missing` 等原样透传：拒绝收口/完成，如实回报（不伪造 verified）。
   */
  private async verifyFixedReviewCloseBasis(
    projectRoot: string,
    input: FixedCloseCreatedTaskToolInput,
  ): Promise<{ ok: true } | WorkflowServiceFailure> {
    if (input.outcome !== "accepted") return { ok: true };
    const state = await readTaskState(projectRoot);
    const record = state.records.get(input.taskId);
    const created = record?.created;
    if (created === undefined || created.workflowId === undefined || created.stage === undefined) {
      return { ok: true }; // 非 fixed 任务/形状不全：交给 closeTask 的既有校验如实失败
    }
    if (created.stage !== "A12a" && created.stage !== "A12b") return { ok: true };
    if (record?.closed?.operationId === input.operationId) return { ok: true }; // closeTask replay 语义
    const basis = await verifyBasisForStage({
      projectRoot,
      workflowId: created.workflowId,
      stage: created.stage,
    });
    if (!basis.ok) return basis;
    return { ok: true };
  }

  /** fixed 复核产物回退（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async findFixedReviewArtifact(
    projectRoot: string,
    flowId: string | undefined,
    stage: "A12a" | "A12b",
  ): Promise<WorkflowArtifactRef | undefined> {
    return this.evidence.findFixedReviewArtifact(projectRoot, flowId, stage);
  }

  /** fixed 收口证据（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async buildFixedCloseEvidence(
    projectRoot: string,
    taskId: string,
    note: string | undefined,
  ): Promise<
    | { ok: true; evidence: { artifacts?: WorkflowArtifactRef[]; branchTipOid?: string; acceptanceArchive?: { path: string; sha256: string } } | undefined }
    | WorkflowServiceFailure
  > {
    return this.evidence.buildFixedCloseEvidence(projectRoot, taskId, note);
  }

  /** 固定方案卡 documentRefs（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async collectFixedProposalDocumentRefs(
    projectRoot: string,
    flowId: string,
  ): Promise<{ ok: true; refs: WorkflowDocumentRef[] } | WorkflowServiceFailure> {
    return this.evidence.collectFixedProposalDocumentRefs(projectRoot, flowId);
  }

  /**
   * 固定任命卡（A10；v1.3 §8.3）：选项**必须恰为**最新名单角色（多选）、推荐集 = 名单顺序（应用生成、
   * 不采信模型自报）；不满足 ⇒ `appointment-invalid`（不发卡）。返回规范化后的请求 + roster 引用。
   */
  private async prepareFixedAppointmentCardRequest(
    projectRoot: string,
    flowId: string,
    request: CustomerInputRequest,
  ): Promise<
    | { ok: true; request: CustomerInputRequest; rosterRef: WorkflowDocumentRef }
    | WorkflowServiceFailure
  > {
    if (request.kind !== "choice") {
      return { ok: false, code: "appointment-invalid", message: "任命卡必须是 choice 卡（多选名单角色）；未发卡。" };
    }
    const roster = await loadLatestWorkflowRoster({ projectRoot, flowId });
    if (!roster.ok) {
      return { ok: false, code: "appointment-roster-mismatch", message: `任命卡前置不满足：${roster.reason}（未发卡）。` };
    }
    const rosterIds = roster.roster.roles.map((role) => role.id);
    const optionIds = request.options.map((option) => option.id);
    const sameSet = optionIds.length === rosterIds.length
      && rosterIds.every((id) => optionIds.includes(id))
      && optionIds.every((id) => rosterIds.includes(id));
    if (request.multiple !== true || !sameSet) {
      return {
        ok: false,
        code: "appointment-invalid",
        message: "任命卡选项必须恰为最新名单角色且 multiple=true（不得发明名单外选项）；未发卡。",
      };
    }
    return {
      ok: true,
      request: {
        ...request,
        options: roster.roster.roles.map((role) => ({ id: role.id, label: role.displayName, recommended: true })),
      },
      rosterRef: { kind: "roster", path: roster.path, sha256: roster.sha256, version: roster.roster.version },
    };
  }

  /**
   * fixed 卡裁决 → 工作流阶段事件（AC-08/§4.5；应用唯一实现）：
   * - intent-confirm：`confirm` ⇒ 编排 `finalizeIntent`（校验 docs/intents 入口 + hash 后 `stage.completed A3`）；
   *   `revise` ⇒ `stage.reworked A2`（reworkOf A3，attempt+1）；其他不动。
   * - proposal：`accept` ⇒ `stage.completed A6`（artifacts=documentRefs）；`revise` ⇒ `stage.reworked A5`；
   *   `reject`/拒绝 ⇒ `stage.blocked A6`（proposal-rejected）。
   * - appointment：客户选定（`targetRoleIds` 非空）⇒ `stage.completed A10`（A10 仅任命确认，不派实现）。
   * 不重写 `request.resolved`；失败只诊断 + 系统行，不阻塞已完成的客户决定、不猜。
   */
  private async recordFixedCardWorkflowResolution(input: {
    projectRoot: string;
    sourceRoleId: string;
    flowId: string;
    workflowId: string;
    requestId: string;
    resolvedEvent: Extract<TaskStateEvent, { kind: "request.resolved" }>;
    answered: boolean;
    judged: boolean;
    documentRefs: readonly WorkflowDocumentRef[];
  }): Promise<void> {
    const noteFailure = (code: string, message: string): void => {
      createDiagnosticLogger({ component: "desktop.workflow", projectRoot: input.projectRoot, roleId: input.sourceRoleId })
        .record("workflow.card.stage-event.failed", { workflowId: input.workflowId, requestId: input.requestId, errorCode: code, errorMessage: message });
      this.emitDeliveryNote(
        input.projectRoot,
        this.lastGovernanceRuntime.get(input.projectRoot) ?? "pi",
        input.sourceRoleId,
        input.sourceRoleId,
        `[工作流] ${input.requestId} 的阶段事件未写入（${code}）：${message}（客户决定已保存；请运营/幕僚核对后重试）`,
      );
    };
    try {
      const ledger = await readWorkflowLedger(input.projectRoot);
      const wfEvents = ledger.events.filter((event) => event.workflowId === input.workflowId);
      if (wfEvents.length === 0) return;
      const view = deriveWorkflowView(wfEvents, (await readTaskState(input.projectRoot)).events);
      if (view.closed !== undefined) return;
      const choice = input.resolvedEvent.choice;
      const cardKind = input.resolvedEvent.cardKind;
      const at = new Date(this.now()).toISOString();
      const append = async (event: WorkflowEvent): Promise<void> => {
        const appended = await appendWorkflowEvent(input.projectRoot, event);
        if (!appended.ok) noteFailure("workflow-ledger-write-failed", appended.message);
      };
      if (cardKind === "intent-confirm") {
        if (choice === "confirm") {
          const finalized = await finalizeFixedIntent({
            projectRoot: input.projectRoot,
            event: input.resolvedEvent,
            workflowId: input.workflowId,
            flowId: input.flowId,
          });
          if (!finalized.ok) noteFailure(finalized.code, finalized.message);
          return;
        }
        if (choice === "revise" && view.stage === "A3") {
          const attempt = Math.max(1, view.stages.A2.attempt ?? 1) + 1;
          await append({
            v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.reworked",
            workflowId: input.workflowId, flowId: view.flowId, path: view.path,
            idempotencyKey: `stage-rework:${input.workflowId}:A2:${attempt}`,
            stage: "A2", reworkOf: "A3", reason: `intent revise（${input.requestId}）`, attempt,
          });
        }
        return;
      }
      if (cardKind === "proposal") {
        if (!input.answered || input.judged) return;
        if (choice.includes("accept") && !choice.includes("reject") && view.stage === "A6") {
          if (!canCompleteStage(view, "A6")) return;
          await append({
            v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.completed",
            workflowId: input.workflowId, flowId: view.flowId, path: view.path,
            idempotencyKey: `stage-complete:${input.workflowId}:A6:${input.requestId}`,
            stage: "A6",
            cause: { kind: "request-resolved", ref: input.requestId },
            artifacts: input.documentRefs.map((ref) => ({
              path: ref.path,
              ...(ref.sha256 !== undefined ? { sha256: ref.sha256 } : {}),
              ...(ref.kind !== undefined ? { kind: ref.kind } : {}),
            })),
          });
          return;
        }
        if (choice === "revise" && view.stage === "A6") {
          const attempt = Math.max(1, view.stages.A5.attempt ?? 1) + 1;
          await append({
            v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.reworked",
            workflowId: input.workflowId, flowId: view.flowId, path: view.path,
            idempotencyKey: `stage-rework:${input.workflowId}:A5:${attempt}`,
            stage: "A5", reworkOf: "A6", reason: `proposal revise（${input.requestId}）`, attempt,
          });
          return;
        }
        if ((choice.includes("reject") || !input.answered) && view.stage === "A6" && view.stages.A6.status !== "completed") {
          await append({
            v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.blocked",
            workflowId: input.workflowId, flowId: view.flowId, path: view.path,
            idempotencyKey: `stage-block:${input.workflowId}:A6:${Math.max(1, view.stages.A6.attempt ?? 1)}:proposal-rejected`,
            stage: "A6", code: "proposal-rejected",
            summary: input.resolvedEvent.reason ?? `方案卡被拒绝（${input.requestId}）`,
            attempt: Math.max(1, view.stages.A6.attempt ?? 1),
          });
        }
        return;
      }
      if (cardKind === "appointment") {
        const targets = input.resolvedEvent.targetRoleIds ?? [];
        if (!input.answered || input.judged || targets.length === 0) return;
        if (view.stage !== "A10" || view.stages.A10.status === "completed" || !canCompleteStage(view, "A10")) return;
        await append({
          v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.completed",
          workflowId: input.workflowId, flowId: view.flowId, path: view.path,
          idempotencyKey: `stage-complete:${input.workflowId}:A10:${input.requestId}`,
          stage: "A10",
          cause: { kind: "appointment-confirmed", ref: input.requestId },
          artifacts: [],
        });
      }
    } catch (error) {
      noteFailure("workflow-card-stage-event-error", error instanceof Error ? error.message : String(error));
    }
  }

  /** 路径 B 最小准备（B1/B3 派发前；幂等）：非 B 路径直接放行；已有 basis 记录 ⇒ no-op。 */
  private async ensurePathBStartForDispatch(
    projectRoot: string,
    workflowId: string,
    flowId: string,
  ): Promise<{ ok: true } | WorkflowServiceFailure> {
    const ledger = await readWorkflowLedger(projectRoot);
    const started = ledger.events.find((event) => event.kind === "workflow.started" && event.workflowId === workflowId);
    if (started === undefined || started.kind !== "workflow.started" || started.path !== "B") return { ok: true };
    const basis = await readBasisLedger(projectRoot);
    const hasBasis = basis.events.some((event) =>
      (event.kind === "basis.recorded" || event.kind === "basis.amended") && event.workflowId === workflowId);
    if (hasBasis) return { ok: true };
    const prepared = await prepareFixedPathBStart({
      projectRoot,
      flowId,
      workflowId,
      operationId: `path-b:${workflowId}`,
      port: createDesktopBaselineGitPort(),
    });
    if (!prepared.ok) return prepared;
    return { ok: true };
  }

  /**
   * B3 写集门（v1.3 §4.3 MF-8）：派发任务的 modulePaths 必须落在该角色由
   * `change.scope-decided.scope.files` 派生的有效写集内；越界/来源缺失 ⇒ `b-change-scope-invalid`。
   * 非 B 路径 workflow 直接放行（A 路径写集由团队计划在别处校验）。
   */
  private async checkPathBWriteSetForDispatch(
    projectRoot: string,
    workflowId: string,
    _flowId: string,
    targetRoleId: string,
    modulePaths: readonly string[] | undefined,
  ): Promise<{ ok: true } | WorkflowServiceFailure> {
    const ledger = await readWorkflowLedger(projectRoot);
    const events = ledger.events.filter((event) => event.workflowId === workflowId);
    const started = events.find((event) => event.kind === "workflow.started");
    if (started === undefined || started.kind !== "workflow.started" || started.path !== "B") return { ok: true };
    const scope = [...events].reverse().find(
      (event): event is Extract<WorkflowEvent, { kind: "change.scope-decided" }> => event.kind === "change.scope-decided",
    );
    if (scope === undefined) {
      return { ok: false, code: "b-change-scope-invalid", message: "B3 写集来源缺失：B2 change.scope-decided 不存在（不派发）。" };
    }
    const writeset = scope.effectiveWritesets.find((entry) => entry.roleId === targetRoleId);
    if (writeset === undefined || writeset.paths.length === 0) {
      return { ok: false, code: "b-change-scope-invalid", message: `scope 未给角色 ${targetRoleId} 任何有效写集（不派发）。` };
    }
    if (modulePaths === undefined || modulePaths.length === 0) {
      return { ok: false, code: "dispatch-evidence-missing", message: "B3 派发必须携带模块路径（modulePaths）以核对 scope 派生写集。" };
    }
    const covers = (prefix: string, candidate: string): boolean => {
      const root = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
      const target = candidate.endsWith("/") ? candidate.slice(0, -1) : candidate;
      return target === root || target.startsWith(`${root}/`);
    };
    const scopeCoveredByModules = writeset.paths.every((scopePath) => modulePaths.some((modulePath) => covers(modulePath, scopePath)));
    const modulesMappedToScope = modulePaths.every((modulePath) =>
      writeset.paths.some((scopePath) => covers(scopePath, modulePath) || covers(modulePath, scopePath)));
    if (!scopeCoveredByModules || !modulesMappedToScope) {
      return {
        ok: false,
        code: "b-change-scope-invalid",
        message: `派发模块路径与 scope 派生写集不一致（越界）：modules=${modulePaths.join(",")} writeset=${writeset.paths.join(",")}。`,
      };
    }
    return { ok: true };
  }

  /** merge-main 卡呈现（应用自有非判断卡；客户本人；judge 不可代批）。无通道 ⇒ undefined（调用方 fail-closed）。 */
  private async presentMergeMainCard(input: {
    projectRoot: string;
    preview: ReleaseMergePreview;
    signal?: AbortSignal;
  }): Promise<CustomerInputOutcome | undefined> {
    const request = buildMergeMainCardRequest({
      workflowId: input.preview.workflowId,
      flowId: input.preview.flowId,
      releaseId: input.preview.releaseId,
      mainBaseOid: input.preview.mainBaseOid !== null ? input.preview.mainBaseOid.hex : null,
      branchTipOid: input.preview.branchTipOid.hex,
      branchBaseOid: input.preview.branchBaseOid,
      nonMainBaseline: input.preview.nonMainBaseline,
      fileCount: input.preview.fileCount,
      diffStat: input.preview.diffStat,
      mergeKind: input.preview.mergeKind,
      highRiskNotes: input.preview.highRiskNotes,
    });
    return this.presentAppCard({
      projectRoot: input.projectRoot,
      request,
      requestId: mergeMainCardRequestId(input.preview.releaseId),
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
  }

  /**
   * 固定路径发布合并的**应用入口**（A13/B4；MF-IR-8：不新增 `requestReleaseMerge` 工具）：
   * 1. `prepareReleaseMerge`（前置/漂移/preview；不满足 ⇒ `release-workflow-not-ready`，不发卡）；
   * 2. 应用构造并呈现 `merge-main` 非判断卡（客户本人）；
   * 3. 客户本人 approve ⇒ `executeReleaseMerge`（fixed argv、只本地、不 push/tag）；
   *     客户拒绝 ⇒ `release.rejected`（by customer）；judge 转人工/拒绝或超时（应用中止）⇒ `release.rejected`
   *     （by judge；judge 不可 approve/冒充客户）；无通道/无效裁决 ⇒ 保持等待、不合并（fail-closed）。
   *
   * B3.1 起「A12b/B3 accepted ⇒ 自动呈卡」复用本入口的呈现/结算段（`settleMergeMainCard`）：唯一差异是
   * 自动触发先做触发窗口/幂等守卫；发布前置仍由 `prepareReleaseMerge` 单点判定。
   */
  async runFixedReleaseMerge(input: {
    projectRoot: string;
    workflowId: string;
    operationId: string;
    summary: string;
    evidence: readonly { path: string; sha256: string }[];
    signal?: AbortSignal;
  }): Promise<{
    ok: boolean;
    code?: string;
    message: string;
    releaseId?: string;
    merged?: boolean;
    mergeOid?: string;
  }> {
    const port = createDesktopReleaseGitPort();
    const prepared = await prepareReleaseMerge({
      projectRoot: input.projectRoot,
      workflowId: input.workflowId,
      operationId: input.operationId,
      summary: input.summary,
      evidence: input.evidence,
      port,
    });
    if (!prepared.ok) return { ok: false, code: prepared.code, message: prepared.message };
    return this.settleMergeMainCard({
      projectRoot: input.projectRoot,
      workflowId: input.workflowId,
      preview: prepared.preview,
      port,
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
  }

  /**
   * merge-main 卡的呈现 + 裁决结算（应用自有通道；**客户本人唯一授权**）：
   * approve ⇒ `executeReleaseMerge`；reject ⇒ `release.rejected by customer`；
   * judge 转人工/拒绝/超时 ⇒ `release.rejected by judge`（绝不写成客户确认）；无效裁决/无通道 ⇒ 保持等待。
   * 不含 `prepareReleaseMerge`（调用方负责前置与幂等）；release 终态只由本方法落账。
   */
  private async settleMergeMainCard(input: {
    projectRoot: string;
    workflowId: string;
    preview: ReleaseMergePreview;
    port: ReturnType<typeof createDesktopReleaseGitPort>;
    signal?: AbortSignal;
  }): Promise<{
    ok: boolean;
    code?: string;
    message: string;
    releaseId?: string;
    merged?: boolean;
    mergeOid?: string;
  }> {
    const releaseId = input.preview.releaseId;
    const presented = await this.presentMergeMainCard({
      projectRoot: input.projectRoot,
      preview: input.preview,
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
    if (presented === undefined) {
      return {
        ok: false,
        code: "release-card-unavailable",
        message: "客户卡通道不可用（merge-main 未呈现）；保持等待、不合并（不默认通过）。",
        releaseId,
      };
    }
    const decision = toMergeMainCardDecision(presented);
    if (decision.kind === "approve") {
      const executed = await executeReleaseMerge({
        projectRoot: input.projectRoot,
        workflowId: input.workflowId,
        releaseId,
        confirmation: { by: "customer", ...(decision.decisionId !== undefined ? { decisionId: decision.decisionId } : {}) },
        port: input.port,
      });
      if (!executed.ok) return { ok: false, code: executed.code, message: executed.message, releaseId };
      return {
        ok: true,
        message: `已合并 main（${executed.mergeKind}；mergeOid ${executed.mergeOid.hex}）；工作区停在 main；不 push/tag。`,
        releaseId,
        merged: true,
        mergeOid: executed.mergeOid.hex,
      };
    }
    if (decision.kind === "reject") {
      const rejected = await rejectReleaseMerge({
        projectRoot: input.projectRoot,
        workflowId: input.workflowId,
        releaseId,
        by: "customer",
        ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
      });
      return {
        ok: false,
        code: rejected.ok ? "release-rejected" : rejected.code,
        message: rejected.ok ? `客户拒绝合并（release.rejected；${rejected.replay ? "replay" : "已记账"}）。` : rejected.message,
        releaseId,
      };
    }
    if (decision.kind === "judge-reject" || decision.kind === "timeout") {
      // judge 只能转人工/拒绝；超时（应用中止/窗口关闭）按非客户关闭记 release.rejected（by judge），
      // 绝不写成客户确认（release.confirmed.by 恒为 customer，由服务双检）。
      const rejected = await rejectReleaseMerge({
        projectRoot: input.projectRoot,
        workflowId: input.workflowId,
        releaseId,
        by: "judge",
        reason: decision.kind === "timeout" ? "timeout：客户未完成确认（转人工/未合并）" : decision.reason ?? "judge 转人工/拒绝",
      });
      return {
        ok: false,
        code: rejected.ok ? "release-rejected" : rejected.code,
        message: rejected.ok ? "合并未获客户本人确认（release.rejected；不合并）。" : rejected.message,
        releaseId,
      };
    }
    return {
      ok: false,
      code: "release-unauthorized",
      message: `merge-main 裁决无效（${decision.reason ?? "fail-closed"}）；保持等待、不合并、不默认通过。`,
      releaseId,
    };
  }

  /**
   * T3 B3.1（AC-11/AC-14/AC-22；MF-IR-8）：fixed **A12b/B3 accepted 后自动呈 merge-main 卡**。
   *
   * - 触发窗口：A12b completed 且 A13 未完成（路径 A）/ B3 completed 且 B4 未完成（路径 B）；
   * - 证据由应用构造（不采信模型自报）：A12b ⇒ 应用验收归档 path+sha256；B3 ⇒ 该任务 done 报告证据
   *   的真实文件（逐路径重算字节 SHA-256）；
   * - `prepareReleaseMerge` 判定全部发布前置；不满足 ⇒ **不呈卡**，如实回运营/幕僚
   *   （`release-workflow-not-ready` 等），不弹注定失败卡；
   * - 幂等：同一 workflow/tip（`releaseId` 确定性派生）已呈过卡 ⇒ 不重复弹卡；已合并/已关闭 ⇒ no-op；
   * - 客户卡经应用自有通道（客户本人）；approve ⇒ `executeReleaseMerge`；judge 只能转人工/拒绝。
   */
  private async autoPresentFixedReleaseMerge(input: {
    projectRoot: string;
    workflowId: string;
    stage: FixedReleaseTriggerStage;
    taskId: string;
  }): Promise<{
    status: "skipped" | "not-ready" | "already-merged" | "channel-unavailable" | "presented";
    code?: string;
    message: string;
    releaseId?: string;
    merged?: boolean;
  }> {
    const { projectRoot, workflowId, stage } = input;
    const port = createDesktopReleaseGitPort();
    try {
      const ledger = await readWorkflowLedger(projectRoot);
      const wfEvents = ledger.events.filter((event) => event.workflowId === workflowId);
      if (wfEvents.length === 0) {
        return { status: "skipped", message: `workflow ${workflowId} 不存在（不呈卡）。` };
      }
      const view = deriveWorkflowView(wfEvents, (await readTaskState(projectRoot)).events);
      const expectedPath = stage === "A12b" ? "A" : "B";
      const triggerCompleted = stage === "A12b"
        ? view.stages.A12b.status === "completed"
        : view.stages.B3.status === "completed";
      const releaseCompleted = stage === "A12b"
        ? view.stages.A13.status === "completed"
        : view.stages.B4.status === "completed";
      if (view.path !== expectedPath || view.closed !== undefined || view.stopping === true
        || !triggerCompleted || releaseCompleted) {
        return { status: "skipped", message: `workflow ${workflowId} 不在 ${stage} accepted 后的发布窗口（不呈卡）。` };
      }
      // 应用证据（A12b 归档 / B3 报告真实文件）；缺失 ⇒ 不呈卡、回运营/幕僚。
      const evidence = await this.fixedReleaseAutoEvidence(projectRoot, workflowId, stage, input.taskId);
      if (!evidence.ok) {
        this.noteFixedReleaseAutoTrigger(projectRoot, workflowId, `merge-main 未呈卡（${evidence.code}）：${evidence.message}`);
        return { status: "not-ready", code: evidence.code, message: evidence.message };
      }
      // `prepareReleaseMerge`：前置/漂移/preview + `release.requested`（同 tip 重放幂等）。
      const prepared = await prepareReleaseMerge({
        projectRoot,
        workflowId,
        operationId: `auto-release:${workflowId}:${stage}`,
        summary: `fixed ${stage} 任务已 accepted：应用自动呈 merge-main 发布确认（workflow ${workflowId}）。`,
        evidence: evidence.evidence,
        port,
      });
      if (!prepared.ok) {
        if (prepared.code === "release-already-merged" || prepared.code === "workflow-closed") {
          return { status: "already-merged", code: prepared.code, message: prepared.message };
        }
        // 前置缺失/漂移：如实回运营/幕僚，不弹注定失败卡。
        this.noteFixedReleaseAutoTrigger(projectRoot, workflowId, `merge-main 未呈卡（${prepared.code}）：${prepared.message}`);
        return { status: "not-ready", code: prepared.code, message: prepared.message };
      }
      // 幂等（同一 workflow/tip 不重复卡）：requestId 由 releaseId 确定性派生；已有任何 request 事件 ⇒ 不再弹。
      const requestId = mergeMainCardRequestId(prepared.releaseId);
      const latest = await readTaskState(projectRoot);
      const already = latest.events.some((event) =>
        (event.kind === "request.created" || event.kind === "request.presented"
          || event.kind === "request.resolved" || event.kind === "request.orphaned")
        && event.requestId === requestId);
      if (already) {
        return {
          status: "skipped",
          message: `同一 workflow/tip 的 merge-main 卡已呈过（${requestId}）；不重复。`,
          releaseId: prepared.releaseId,
        };
      }
      const settled = await this.settleMergeMainCard({
        projectRoot,
        workflowId,
        preview: prepared.preview,
        port,
      });
      if (settled.code === "release-card-unavailable") {
        this.noteFixedReleaseAutoTrigger(projectRoot, workflowId, settled.message);
        return { status: "channel-unavailable", code: settled.code, message: settled.message, releaseId: prepared.releaseId };
      }
      return {
        status: "presented",
        ...(settled.code !== undefined ? { code: settled.code } : {}),
        message: settled.message,
        releaseId: prepared.releaseId,
        ...(settled.merged !== undefined ? { merged: settled.merged } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      createDiagnosticLogger({ component: "desktop.workflow", projectRoot }).error(
        "workflow.release.auto-present.failed",
        error,
        { workflowId, stage },
      );
      this.noteFixedReleaseAutoTrigger(projectRoot, workflowId, `merge-main 自动呈卡失败：${message}（未合并；请运营/幕僚核对）。`);
      return { status: "not-ready", code: "release-auto-present-failed", message };
    }
  }

  /** 自动呈卡的应用证据（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async fixedReleaseAutoEvidence(
    projectRoot: string,
    workflowId: string,
    stage: FixedReleaseTriggerStage,
    taskId: string,
  ): Promise<{ ok: true; evidence: { path: string; sha256: string }[] } | WorkflowServiceFailure> {
    return this.evidence.fixedReleaseAutoEvidence(projectRoot, workflowId, stage, taskId);
  }

  /** 自动呈卡失败/未呈卡时如实回运营（convener）与幕僚（chief）：只通知、不改状态、不伪造客户决定。 */
  private noteFixedReleaseAutoTrigger(projectRoot: string, workflowId: string, summary: string): void {
    const targets = new Set<string>([
      this.handbackOwnerRoleId(projectRoot) ?? "convener",
      this.chiefTaskRoleIdOf(projectRoot) ?? "chief",
    ]);
    for (const roleId of targets) {
      const runtime = this.findLiveRuntime(projectRoot, roleId) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
      this.emitDeliveryNote(projectRoot, runtime, roleId, roleId, `[工作流发布] ${workflowId}：${summary}`);
    }
  }

  /**
   * fixed 面板只读投影（v1.3 §6.5/§7.4；AC-23）：fixed 项目 ⇒ VCA/trunk/stable 面板**只读**
   * （mutation IPC 由 Interface 拒绝），并给出 workflow 状态；legacy 项目逐字不变（panel:"full"）。
   * 纯读、零写入；不做 UI 改版（渲染层显示切换不在本批）。
   */
  async fixedPanelState(
    projectRoot: string,
    flowId?: string,
  ): Promise<{
    ok: true;
    mode: WorkflowMode;
    panel: "read-only" | "full";
    mutationAllowed: boolean;
    workflow?: {
      workflowId: string;
      flowId: string;
      path: "A" | "B";
      stage: WorkflowView["stage"];
      status: string;
      closed?: string;
      blocked?: { code: string; summary: string };
    };
  }> {
    const mode = await resolveProjectFixedPanelMode(projectRoot);
    let workflow: {
      workflowId: string;
      flowId: string;
      path: "A" | "B";
      stage: WorkflowView["stage"];
      status: string;
      closed?: string;
      blocked?: { code: string; summary: string };
    } | undefined;
    try {
      const ledger = await readWorkflowLedger(projectRoot);
      const started = [...ledger.events].reverse().find(
        (event): event is Extract<WorkflowEvent, { kind: "workflow.started" }> =>
          event.kind === "workflow.started" && (flowId === undefined || event.flowId === flowId),
      );
      if (started !== undefined) {
        const view = deriveWorkflowView(
          ledger.events.filter((event) => event.workflowId === started.workflowId),
          (await readTaskState(projectRoot)).events,
        );
        workflow = {
          workflowId: view.workflowId,
          flowId: view.flowId,
          path: view.path,
          stage: view.stage,
          status: view.stages[view.stage]?.status ?? view.status,
          ...(view.closed !== undefined ? { closed: view.closed.outcome } : {}),
          ...(view.blocked !== undefined ? { blocked: { code: view.blocked.code, summary: view.blocked.summary } } : {}),
        };
      }
    } catch {
      workflow = undefined;
    }
    return {
      ok: true,
      mode,
      panel: mode === "fixed" ? "read-only" : "full",
      mutationAllowed: mode !== "fixed",
      ...(workflow !== undefined ? { workflow } : {}),
    };
  }

  /** B1：advisory 摘要（最多 3 条 + 其余计数）；只用人话，技术 code 只进诊断。 */
  private dispatchAdvisorySummary(advisories: readonly DispatchAdvisory[]): string {
    const shown = advisories.slice(0, 3);
    const more = advisories.length - shown.length;
    const numbered = shown.map((advisory, index) => `${index + 1}. ${advisory.message}`).join("；");
    return `${numbered}${more > 0 ? `；另有 ${more} 项，见诊断记录` : ""}`;
  }

  // —————————————— G-2（2026-10-16 客户批准）：看护数据面 / 系统投递 / 恢复执行桥 ——————————————
  //
  // 设计 `2026-10-16_design_role-watchdog-and-closure.md`（W1 快照与观察、W2 system 投递、W4 恢复执行桥、
  // W5 恢复确认桥）。**一条原则**：本段全部是「读快照＋经既有投递机投文本＋（客户一键确认后）复用既有
  // 人工动作」——不写项目文件、不放行任何命令/写入、不改任何 gate/队列语义；一切失败路径 fail-closed
  // （最坏情形退化为「没有看护时的现状」）。

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  watchdogSnapshot(projectRoot: string): WatchdogProjectSnapshot | undefined {
    return this.diagnostics.watchdogSnapshot(projectRoot);
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  projectRootsWithActivity(): string[] {
    return this.diagnostics.projectRootsWithActivity();
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  lastTurnOf(projectRoot: string, roleId: string, runtime: RuntimeKind): { outcome: RuntimeTurnOutcome; at: string; errorCode?: string } | undefined {
    return this.diagnostics.lastTurnOf(projectRoot, roleId, runtime);
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  watchdogDeliver(projectRoot: string, message: { text: string; summary: string; dedupKey: string; uiOnlyWhenBusy?: boolean }): void {
    this.diagnostics.watchdogDeliver(projectRoot, message);
  }

  /**
   * **`rebuild-session` 恢复动作**（W4，2026-10-16 客户批准；设计 §6.3）——新公共入口：
   * dispose＋重开（保留 ANS 回放；F-5-opt1 注记适用）；**在跑轮次不打断**（busy ⇒ 拒绝并如实回执）。
   * 与陈旧重建（O-1）同链串行（`rebuildChains` 按会话键——同一角色至多一个重建在跑）。
   */
  async rebuildSession(target: string | SessionTarget, beforeDispose?: (entry: LiveSession) => Promise<boolean>): Promise<RebuildSessionResult> {
    const key = this.targetKey(target);
    if (key === undefined) return { ok: false, error: mainT("main.session.recoveryNoMatch") };
    const prev = this.rebuildChains.get(key) ?? Promise.resolve();
    const run = prev.then(() => this.rebuildSessionUnsafe(key, beforeDispose));
    const tail = run.then(() => undefined, () => undefined);
    this.rebuildChains.set(key, tail);
    void tail.then(() => {
      if (this.rebuildChains.get(key) === tail) this.rebuildChains.delete(key);
    });
    return await run;
  }

  /** `rebuildSession` 的链内实现（同 `rebuildIfBoundaryStaleUnsafe` 同款步骤，**去掉陈旧判据**——手动触发）。 */
  private async rebuildSessionUnsafe(key: string, beforeDispose?: (entry: LiveSession) => Promise<boolean>): Promise<RebuildSessionResult> {
    const entry = this.sessions.get(key);
    if (!entry) return { ok: false, error: mainT("main.session.recoveryNoSession") };
    if (entry.busy) return { ok: false, error: mainT("main.session.recoveryBusy") };
    if (beforeDispose && !(await beforeDispose(entry))) return { ok: false, error: "调用来源或执行范围已变化，未刷新目标会话。" };
    if (this.sessions.get(key) !== entry || entry.busy) return { ok: false, error: mainT("main.session.recoveryConcurrent") }; // TOCTOU
    const { projectRoot, roleId, runtime } = entry;
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId });
    diagnostic.record("session.rebuild.start", { state: "manual" });
    await this.disposeEntry(key, entry);
    this.deps.emitEvent({
      roleId, projectRoot, runtime,
      event: { kind: "message", summary: mainT("main.session.rebuiltByRecovery", { roleId }) },
    });
    const selectionVersion = this.selectionVersion;
    const reopened = await this.openInternalUnsafe({ projectRoot, roleId, runtime, ...((entry.boundAssignment?.taskId ?? entry.assignedTaskId) ? { taskId: entry.boundAssignment?.taskId ?? entry.assignedTaskId } : {}) }, true, selectionVersion, true);
    if (reopened.ok) {
      this.queueRebuildWritePermitsNotice(key); // 入参＝会话键
      void this.drainQueue(projectRoot, roleId, runtime);
    }
    diagnostic.record("session.rebuild.end", { ok: reopened.ok, state: "manual" });
    if (!reopened.ok) return { ok: false, error: reopened.error ?? "重开失败" };
    return {
      ok: true,
      resumed: reopened.resumed,
      ...(reopened.contextSource !== undefined ? { contextSource: reopened.contextSource } : {}),
      ...(reopened.contextWarning !== undefined ? { contextWarning: reopened.contextWarning } : {}),
    };
  }

  /**
   * **`redeliver` 恢复动作**（W4）——队列重试 nudge：包装既有 `drainQueue`（不新造投递路径）。
   * 给 `itemId` 时针对该排队条目：**条目已投出/不存在 ⇒ 如实回执**；触发后按**触发后的真实队列状态**
   * 如实回报（仍排队 ⇒ 目标忙/未开，保留待重试——绝不把「已触发重试」写成「已投出」）。
   */
  async redeliverNudge(target: string | SessionTarget, itemId?: string): Promise<RedeliverResult> {
    const key = this.targetKey(target);
    if (key === undefined) return { ok: false, message: mainT("main.session.redeliverNoMatch") };
    const [projectRoot = "", roleId = "", runtime = "pi"] = key.split("\u0000");
    const qKey = this.queueKey(projectRoot, roleId, runtime as RuntimeKind);
    const queue = this.deliveryQueues.get(qKey) ?? [];
    const inFlight = this.activeDeliveries.get(qKey);
    if (typeof itemId === "string" && itemId !== "") {
      const idxBefore = queue.findIndex((i) => i.dedupKey === itemId);
      if (idxBefore < 0) {
        if (inFlight?.dedupKey === itemId) return { ok: true, message: mainT("main.session.redeliverInFlight") };
        return { ok: false, message: mainT("main.session.redeliverNotQueued") };
      }
      await this.drainQueue(projectRoot, roleId, runtime as RuntimeKind);
      const after = this.deliveryQueues.get(qKey) ?? [];
      const idxAfter = after.findIndex((i) => i.dedupKey === itemId);
      if (idxAfter >= 0) {
        return { ok: true, message: mainT("main.session.redeliverQueued", { position: idxAfter + 1 }) };
      }
      const nowInFlight = this.activeDeliveries.get(qKey);
      return nowInFlight?.dedupKey === itemId
        ? { ok: true, message: mainT("main.session.redeliverSent") }
        : { ok: true, message: mainT("main.session.redeliverGone") };
    }
    await this.drainQueue(projectRoot, roleId, runtime as RuntimeKind);
    const after = this.deliveryQueues.get(qKey) ?? [];
    const nowInFlight = this.activeDeliveries.get(qKey);
    if (after.length === 0) {
      return nowInFlight !== undefined
        ? { ok: true, message: mainT("main.session.redeliverCleared") }
        : { ok: true, message: mainT("main.session.redeliverEmpty") };
    }
    return { ok: true, message: mainT("main.session.redeliverRemaining", { count: after.length, inflight: nowInFlight !== undefined ? mainT("main.session.redeliverInFlightOne") : mainT("main.session.redeliverNoInflight") }) };
  }

  // —————————————— G-4（2026-10-16 客户批准）：技能安装/卸载 handler（I3） ——————————————
  //
  // 设计 `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` §3.2/§3.3/§4.3/§4.4/§6.4；
  // PM 裁定④（轮次护栏：仅**客户消息**发起的轮次可执行，先判）与⑤（O-1 指纹集扩展——见 `boundaryDiff` /
  // `currentSkillPaths`）。**工具不写盘**——落盘永远由 su 的 `write_file` 完成（「先落盘再激活」＝
  // G-1「先落盘再派发」的镜像）；本层只 **护栏 → 校验（角色/登记/含角色/状态）→ 激活（复用既有重建；
  // 在跑不打断 ⇒ `next-session`）→ 如实回执** ＋ `[系统·安装]` 系统行（`kind:"system"` 第四类通道
  // 真投递给 su——不可撤回、与看护/恢复回执同一套投递机）＋ 诊断事件。失败一律 fail-closed＝**未执行、
  // 零副作用**（登记不动、不重建、不投系统行）。**安装/卸载不改变任何角色的写边界**（技能是必读资料，
  // 不是权限）。

  /** Installation's existing customer-turn rule follows the actual running origin.
   * Direct system inputs and dispatch/handback rounds are not customer messages;
   * absence of an active-delivery row is never evidence of customer intent. */
  private isCustomerInitiatedTurn(projectRoot: string, runtime: RuntimeKind, roleId: string): boolean {
    const entry = this.sessions.get(this.sessionKey(projectRoot, roleId, runtime));
    if (!entry || entry.busy !== true) return false;
    const origin = entry.origins.running;
    return origin !== undefined && !origin.settled && origin.kind === "message";
  }

  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private async activateRoleRefresh(projectRoot: string, runtime: RuntimeKind, roleId: string, beforeEffect?: () => Promise<boolean>): Promise<{ effective: "rebuilt" | "next-session"; note?: string; error?: string }> {
    return this.sessionEnv.activateRoleRefresh(projectRoot, runtime, roleId, beforeEffect);
  }

  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private async applySkillChange(
    action: "installed" | "uninstalled",
    projectRoot: string,
    runtime: RuntimeKind,
    callerRoleId: string,
    d: InstallSkillPayload,
    beforeActivation?: () => Promise<boolean>,
  ): Promise<InstallSkillReceipt> {
    return this.sessionEnv.applySkillChange(action, projectRoot, runtime, callerRoleId, d, beforeActivation);
  }

  // —————————————— G-4 V2（2026-10-16 客户批准）：外来 MCP 安装/卸载 handler ——————————————
  //
  // 与技能两工具**逐字同构**（护栏/载荷/角色/激活共用件全同；仅校验面＝MCP 声明、名词与诚实面不同）。
  // **工具不写盘**——声明落盘永远由 su 的 `write_file` 完成（「先落盘再激活」）；失败一律 fail-closed＝
  // **未执行、零副作用**。**诚实面（不得宣称逐调用受审，§5.3）**：外来 MCP 工具在 ANS 门禁之外执行
  // （server 进程内）＝**能力级授予**；安装/卸载**不改变任何角色的写边界**。卸载＝**下次会话摘除**
  // （server 进程随会话消亡、零平台残留）、**已发生的副作用不可撤**；**声明文件保留**（「效果已撤」与
  // 「文件仍在」如实二分）。

  /** 薄委托 → `session/session-env.ts`（JSDoc/方法体见模块）。 */
  private async applyMcpChange(
    action: "installed" | "uninstalled",
    projectRoot: string,
    runtime: RuntimeKind,
    callerRoleId: string,
    d: InstallMcpPayload,
    beforeActivation?: () => Promise<boolean>,
  ): Promise<InstallMcpReceipt> {
    return this.sessionEnv.applyMcpChange(action, projectRoot, runtime, callerRoleId, d, beforeActivation);
  }

  // ——————— G-2/W1：role_status / session_tail 的桌面侧数据源（契约＝`model/runtime.ts`；编排转发） ———————

  /** `evidence_check` 只读证据检查（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async evidenceCheckText(projectRoot: string, roleId: string, input: EvidenceCheckInput): Promise<string> {
    return this.evidence.evidenceCheckText(projectRoot, roleId, input);
  }

  /** 调用角色的模块证据范围（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async evidenceScopeRoots(projectRoot: string, flowId: string, run: RunManifest | undefined, roleId: string): Promise<string[]> {
    return this.evidence.evidenceScopeRoots(projectRoot, flowId, run, roleId);
  }

  /** `contract_check` 只读契约速查（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async contractCheckText(projectRoot: string, callerRoleId: string, input: ContractCheckInput, mode: WorkflowMode = "legacy"): Promise<string> {
    return this.evidence.contractCheckText(projectRoot, callerRoleId, input, mode);
  }

  /** fixed 会话的契约速查（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async contractCheckTextFixed(projectRoot: string, callerRoleId: string, input: ContractCheckInput): Promise<string> {
    return this.evidence.contractCheckTextFixed(projectRoot, callerRoleId, input);
  }

  /** `doc_format` 只读数据源（薄委托 → `session/evidence.ts`；JSDoc/方法体见模块）。 */
  private async docFormatText(projectRoot: string, callerRoleId: string, input: DocFormatInput): Promise<string> {
    return this.evidence.docFormatText(projectRoot, callerRoleId, input);
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private async roleStatusText(projectRoot: string, query: RoleStatusPayload): Promise<WatchdogToolResult> {
    return this.diagnostics.roleStatusText(projectRoot, query);
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private async diagnosticsTailText(roleId: string): Promise<string> {
    return this.diagnostics.diagnosticsTailText(roleId);
  }

  /** 薄委托 → `session/diagnostics.ts`（JSDoc/方法体见模块）。 */
  private async sessionTailText(projectRoot: string, query: SessionTailPayload): Promise<WatchdogToolResult> {
    return this.diagnostics.sessionTailText(projectRoot, query);
  }

  /** 某项目**全部**队列的放行尝试（settled 触发的重试时机——投递触发不挑目标，各队列自判忙/开）。 */
  private async drainAllQueuesFor(projectRoot: string): Promise<void> {
    const prefix = `${projectRoot}\u0000`;
    const targets: string[] = [];
    for (const k of [...this.deliveryQueues.keys()]) {
      if (k.startsWith(prefix)) targets.push(k.slice(prefix.length));
    }
    for (const t of targets) {
      const [target, runtime] = t.split("\u0000");
      await this.drainQueue(projectRoot, target, runtime as RuntimeKind);
    }
  }

  private async drainPiQueuesAcrossProjects(): Promise<void> {
    if (this.hasBusyRuntime("pi")) return;
    const projects = new Set<string>();
    for (const key of this.deliveryQueues.keys()) {
      const [projectRoot, , runtime] = key.split("\u0000");
      if (runtime === "pi") projects.add(projectRoot);
    }
    for (const projectRoot of projects) await this.drainAllQueuesFor(projectRoot);
  }

  /**
   * 投递机的**安全壳 + 串行门**（真机崩溃修复 + L-1 并发修正）：本方法经 `void` fire-and-forget 调用，
   * **绝不允许上抛**（上抛＝未捕获拒绝）；且同项目的多次调用**串行**（见 `drainChains`）——真正的投递
   * 逻辑在 `drainQueueUnsafe`。**F-2-M1 起串行只覆盖「认领段」**：投递开跑（`sendDelivery` 取到 promise）
   * 后链即释放，成功/失败记账在**分离续段**执行（其自身带同款拦截——见 `drainQueueUnsafe` 尾部）。
   */
  /** Host transport barrier only: completion is not native-stop evidence or execution permission. */
  async waitForRunStopDeliveryClaims(input: { projectRoot: string; taskIds: readonly string[]; signal?: AbortSignal; caller?: ActualDispatchSource }): Promise<{ status: "wait-complete"; count: number } | { status: "blocked"; code: string }> {
    const blocked = (code: string) => ({ status: "blocked" as const, code });
    if (input.signal?.aborted) return blocked("run-stop-claim-wait-cancelled");
    if (!input.taskIds.length || input.taskIds.some(taskId => !taskId)) return blocked("run-stop-claim-source-unproven");
    const taskIds = new Set(input.taskIds), current = () => [...this.drainClaimRecords].filter(row => row.projectRoot === input.projectRoot &&
      !(input.caller && row.owner?.entry === input.caller.entry && row.owner.origin === input.caller.origin));
    const observed = current();
    if (observed.some(row => !row.taskIds?.length)) return blocked("run-stop-claim-source-unproven");
    const claims = observed.filter(row => row.taskIds!.some(taskId => taskIds.has(taskId)));
    if (claims.length) {
      const completed = await new Promise<boolean>(resolve => {
        const abort = () => { input.signal?.removeEventListener("abort", abort); resolve(false); };
        input.signal?.addEventListener("abort", abort, { once: true });
        if (input.signal?.aborted) { abort(); return; }
        void Promise.all(claims.map(row => row.done)).then(() => { input.signal?.removeEventListener("abort", abort); resolve(true); });
      });
      if (!completed || input.signal?.aborted) return blocked("run-stop-claim-wait-cancelled");
    }
    const fresh = current();
    if (fresh.some(row => !row.taskIds?.length)) return blocked("run-stop-claim-source-unproven");
    if (fresh.some(row => row.taskIds!.some(taskId => taskIds.has(taskId)))) return blocked("run-stop-claim-source-changed");
    return { status: "wait-complete", count: claims.length };
  }

  private async drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void> {
    const key = projectRoot;
    let completeClaim!: () => void;
    const claim: { projectRoot: string; taskIds?: readonly string[]; owner?: ActualDispatchSource; done: Promise<void> } = { projectRoot, done: new Promise<void>(resolve => { completeClaim = resolve; }) };
    this.drainClaimRecords.add(claim);
    const prev = this.drainChains.get(key) ?? Promise.resolve();
    const next = prev
      .then(() => this.drainQueueUnsafe(projectRoot, targetRoleId, runtime, claim))
      .catch((err) => {
        this.emitDeliveryNote(projectRoot, runtime,
          this.handbackOwnerRoleId(projectRoot),
          "(投递机)",
          `投递机异常已拦截（不产生未捕获拒绝）：${err instanceof Error ? err.message : String(err)}`
        );
      });
    this.drainChains.set(key, next);
    this.publishDeliveryInventory("delivery-claim-queued");
    try {
      await next;
    } finally {
      // 链尾清理（若期间又有新链悬挂在更后面，让新链自己的 finally 收尾——防泄漏）。
      if (this.drainChains.get(key) === next) this.drainChains.delete(key);
      this.drainClaimRecords.delete(claim); completeClaim(); this.publishDeliveryInventory("delivery-claim-settled");
    }
  }

  /**
   * 尝试投递队首：目标 **忙** → 排队（settled 后按序放行，**绝不并发 send**）；目标 **未开** → **自动开启**再投；
   * 开启/投递失败 → **如实系统行 + 放回队首保留待重试**（下次时机：目标打开 / 下一次入队 / 一轮结束）。
   * 目标为空（回交入队时主入口暂未枚举到）→ 每次尝试重解析主入口；仍无 → 提示一次并保留。
   *
   * **F-2-M1（2026-10-16 客户批准）——链持有收窄到「认领段」**：本方法在**认领段**（读队首/合批 → shift →
   * 形状防御 → 置忙 + 登记 `activeDeliveries` + `delivery.start` → 组装发送载荷 → **调用** `sendDelivery`
   * 取得 promise）内同步完成全部队列/归属改动，随后**立即返回**（链释放）。成功/失败的全部记账
   * （`delivery.end`/`delivery.failed`、去重键释放、失败回队首、忙态复位、如实系统行）移入**分离续段**
   * ——IIFE 内的 try/catch 与旧代码**逐字同体**（含「成功支抛错也落失败支」的逐支语义）；旧实现把链持有
   * 贯穿 `await sendDelivery` 完成＝目标**整轮**结束（真机实测：单链持有 16 分 55 秒，实现者一轮把同项目
   * 测试者的投递整段压住）。续段整段**同步、无 await 断点**，不会与后续认领交错；其内共享状态改动均带
   * 同一性守卫（settled 可能先于 send promise 的续段到达）。**防护逐条保真**（同队列不并发双 drain/双 shift
   * ——认领段仍全在链上；不并发 send 同一会话——`busy=true` 在释放链**之前**同步置位；自动开目标不双开
   * ——`openInternal` 调用仍在认领段内且另有 F-2-opt2 按会话键互斥；失败回队首 + 忙态复位——续段在同一
   * settle 微任务链里同步完成，无中间窗口）。
   *
   * **F-2-opt3（2026-10-16 客户批准）**：认领段起止各记一条诊断（`delivery.claim.start/end`）——下一轮真机
   * 可一眼区分「认领耗时」vs「轮次时长」（本轮 F-2 破案正是靠既有 `delivery.start/end`）。
   */
  private async drainQueueUnsafe(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind, claim: { taskIds?: readonly string[]; owner?: ActualDispatchSource }): Promise<void> {
    const resolvedTarget =
      targetRoleId !== null && targetRoleId !== "" ? targetRoleId : (this.handbackOwnerRoleId(projectRoot) ?? "");
    const key = this.queueKey(projectRoot, resolvedTarget, runtime);
    if (this.deliveryIsStopped(key)) return;
    const lifecycle = this.deliveryLifecycle(key);
    const stopped = () => this.deliveryIsStopped(key) || this.deliveryLifecycle(key) !== lifecycle;
    const q = this.deliveryQueues.get(key);
    if (!q || q.length === 0) return;
    // 2026-10-20 真机（Convener 卡 1h、队列 24 条回交被 system 看护项堵住）：**回交/派发优先于 system**。
    // 认领时跳过 system 看护项、取第一个非 system 条目（回交/派发/客户消息的相对顺序不变——客户消息屏障
    // 语义保留；同类仍按到达序）。只有在队列全是 system 时才投 system。
    const priorityIndex = q.findIndex((i) => i.kind !== "system");
    const headIndex = priorityIndex >= 0 ? priorityIndex : 0;
    const item = q[headIndex];
    // These identities come from the selected transport item, never from the latest role/task.
    const claimTaskId = item.kind === "dispatch" ? item.taskId : item.kind === "system" ? item.systemAssignment?.taskId : undefined;
    claim.taskIds = claimTaskId ? [claimTaskId] : undefined;
    this.publishDeliveryInventory("delivery-claim-assigned");
    const diagnostic = createDiagnosticLogger({ component: "desktop.delivery", projectRoot, roleId: resolvedTarget });
    if (this.runTaskIsFenced(projectRoot, item.kind === "dispatch" ? item.taskId : item.kind === "system" ? item.systemAssignment?.taskId : undefined, item.kind === "system" ? item.systemAssignment?.runId : undefined)) {
      item.lastAttempt = { state: "blocked", code: "run-stop-host-fenced", at: new Date(this.now()).toISOString() }; return;
    }

    if (resolvedTarget === "") {
      const noteKey = this.queueKey(projectRoot, "", runtime);
      if (!this.suDeliveryBlockedNoted.has(noteKey)) {
        this.suDeliveryBlockedNoted.add(noteKey);
        this.emitDeliveryNote(projectRoot, runtime,
          null,
          item.sourceRoleId,
          mainT("main.session.delivery.noTarget", { kind: item.kind === "handback" ? mainT("main.watchdog.kind.handback") : mainT("ui.events.dispatchTask"), sourceRoleId: item.sourceRoleId })
        );
      }
      return;
    }

    const inspectResume = async (): Promise<boolean> => {
      if (!item.controllerResume) return true;
      const sealed = item.controllerResume;
      const actual = await inspectQueuedControllerResume({ projectRoot, resumeController: sealed.expected, resumeKey: sealed.resumeKey, basisDigest: sealed.basisDigest });
      if (stopped()) return false;
      if (actual.ok && item.taskId === actual.value.taskId && item.flowId === actual.value.flowId && resolvedTarget === "convener") return true;
      const code = actual.ok ? "controller-resume-identity-changed" : actual.code;
      const detail = actual.ok ? "队列任务身份与原运营不一致" : actual.message ?? actual.code;
      item.lastAttempt = { state: "failed", code, at: new Date(this.now()).toISOString() };
      const index = q.indexOf(item); if (index !== -1) q.splice(index, 1); if (!q.length) this.deliveryQueues.delete(key);
      this.activeDispatchKeys.delete(item.dedupKey);
      diagnostic.record("controller.resume.delivery-rejected", { errorCode: code, errorMessage: detail });
      this.emitDeliveryNote(projectRoot, runtime, item.sourceRoleId, "convener", `运营续接未投递：${code}：${detail}。原任务事实保留，请幕僚核对后明确重试；此结果不证明旧执行已停止。`);
      this.notifyRoleState(projectRoot, resolvedTarget, runtime); this.persistDeliveryQueues(); void this.drainQueue(projectRoot, resolvedTarget, runtime);
      return false;
    };
    if (!await inspectResume()) return;
    // Only the exact persisted close receipt can retire its original assignment's notice.
    // This is information already committed by the creator, never another model turn or assignment.
    if (item.kind === "system" && item.systemAssignment && item.notificationSource) {
      const closed = await classifyClosedTaskNotice({ projectRoot, recipientRoleId: resolvedTarget,
        boundTaskId: item.systemAssignment.taskId, operationId: item.notificationSource.operationId,
        source: item.notificationSource });
      if (stopped()) return;
      if (closed.ok) {
        const index = q.indexOf(item); if (index !== -1) q.splice(index, 1);
        if (q.length === 0) this.deliveryQueues.delete(key);
        this.deliveredDeliveryKeys.add(`${key}\u0000${item.dedupKey}`);
        this.rememberAppTaskDelivered(item.clientMessageId);
        diagnostic.record("delivery.notice.information-only", { taskId: closed.value.taskId, operationId: closed.value.operationId });
        this.notifyRoleState(projectRoot, resolvedTarget, runtime); this.persistDeliveryQueues();
        void this.drainQueue(projectRoot, resolvedTarget, runtime);
        return;
      }
    }

    // P2（2026-10-30）：离线期间**不认领新的模型投递**——队列保留并标 `blockedReason:"network"`
    // （数据面可见）；恢复后由 `applyNetworkState` 走同一 `drainAllQueuesFor` 继续（不把离线当完成/丢弃）。
    if (this.isNetworkOffline()) {
      diagnostic.record("delivery.blocked", { reasonCode: "network", queueDepth: q.length });
      this.notifyRoleState(projectRoot, resolvedTarget, runtime);
      return;
    }

    let childRequiresCurrentAssignment = false, taskBoundReview = false;
    // **2026-10-29（BUG-5）**：任务在排队期间已完成（已报告/已收口）⇒ 该派发项不得再投递。
    // 完成后的重复投递只记诊断与丢弃队列项，不产生 task.delivered/新一轮事件；不触碰其他条目。
    if (item.kind === "dispatch" && typeof item.taskId === "string" && item.taskId !== "") {
      const record = (await this.readTasks(projectRoot)).records.get(item.taskId);
      childRequiresCurrentAssignment = !!(record?.created?.parentTaskRef || record?.created?.workSourceRef);
      taskBoundReview = record?.created?.reviewBasisRef !== undefined;
      if (record !== undefined && (record.closed !== undefined || !item.controllerResume && record.reports.length > 0)) {
        q.splice(headIndex, 1);
        if (q.length === 0) this.deliveryQueues.delete(key);
        diagnostic.record("delivery.skip.task-terminal", {
          taskId: item.taskId,
          closed: record.closed !== undefined,
          reports: record.reports.length,
        });
        this.notifyRoleState(projectRoot, resolvedTarget, runtime);
        this.persistDeliveryQueues();
        void this.drainQueue(projectRoot, resolvedTarget, runtime); // 继续处理后续条目（不因丢弃一条而停滞）
        return;
      }
    }

    // **2026-10-25 重复投递修复——重建后续投只重发未投递成功的消息**：同一应用任务（稳定
    // `clientMessageId`）已 ACK/投递成功 ⇒ 队列里残留的同键条目直接丢弃（不重开会话、不再发第二遍）。
    // 显式重新入队（返工同文再派）已在 `enqueueDelivery` 清掉标记，不会走到这里。
    if (isAppTaskClientMessageId(item.clientMessageId) && this.deliveredAppTaskIds.has(item.clientMessageId)) {
      q.splice(headIndex, 1);
      if (q.length === 0) this.deliveryQueues.delete(key);
      diagnostic.record("delivery.skip.delivered", { state: item.kind, queueDepth: q.length });
      this.notifyRoleState(projectRoot, resolvedTarget, runtime);
      this.persistDeliveryQueues();
      return;
    }

    let pendingControllerAssignment: DeliveryAssignment | undefined;
    const inspectHandbackAssignment = async () => {
      if (item.kind !== "handback" || resolvedTarget !== "convener") return true;
      const members = item.batchItems ?? [item];
      let selected: DeliveryAssignment | undefined;
      let sawFixedChild = false;
      let sawLegacyChild = false;
      let droppedClosedFixed = 0;
      const deliverable: DeliveryItem[] = [];
      // T3 B8.2（2026-11-11，RR3/B8.1 披露）：fixed 子任务回交（`task.created.workflowId` 命名空间）只按
      // tasks/workflows 账本事实校验并投递，**不调用** legacy `resolveDeliveryAssignment`（后者要求 child
      // `parentTaskRef`/run，会把 fixed 生产任务回交误判 `delivery-child-source-invalid`）。legacy 子任务
      // （无 workflowId）逐字走下方原解析（旧行为不变）。fixed 校验不通过 ⇒ fail-closed 诊断、不误投。
      // T3 B11.1（2026-11-11，RR6 根因）：fixed 子任务**已收口**（`task.closed`）⇒ 该回交成员是确定终态，
      // 丢弃并继续 drain（诊断 `delivery.skip.fixed-child-closed`；不投递、不阻塞后续条目、不伪造
      // task.delivered/report）。open fixed child 照常投递；legacy 路径逐字不变。
      const childState = await this.readTasks(projectRoot);
      for (const member of members) {
        if (!member.handback?.taskId) {
          diagnostic.record("delivery.blocked", { reasonCode: "delivery-child-source-invalid" });
          return false;
        }
        const childRecord = childState.records.get(member.handback.taskId);
        if (childRecord?.created?.workflowId !== undefined) {
          const verified = await this.inspectFixedHandbackChild(projectRoot, member.handback, resolvedTarget, member.flowId);
          if (stopped()) return false;
          if (!verified.ok) {
            item.lastAttempt = { state: "blocked", code: "fixed-handback-unverifiable", at: new Date(this.now()).toISOString() };
            diagnostic.record("delivery.blocked", { reasonCode: "fixed-handback-unverifiable", taskId: member.handback.taskId, message: verified.message });
            this.emitDeliveryNote(projectRoot, runtime, resolvedTarget, member.handback.roleId,
              `固定任务回交未投递（安全校验未通过，消息已保留）：${verified.message}。`);
            return false;
          }
          if (verified.closed) {
            // B19（2026-11-11，RR14）：已收口 **stage-request** 的回交仍须投递给 chief——幕僚通常在
            // 运营交最终报告前就关闭调度请求；该最终报告是阶段完成/下一阶段的唯一唤醒来源，
            // 丢弃会让工作流停在 A2→A3（RR14 实测）。
            if (childRecord.created.taskKind === "stage-request") {
              diagnostic.record("delivery.deliver.fixed-stage-request-closed", { taskId: verified.taskId, workflowId: verified.workflowId });
            } else {
              // B11.1：已收口 **生产** fixed 子任务 ⇒ 跳过该成员（不投递、不写任何任务事件），
              // 继续处理其余成员/后续队列（RR6 行为不变）。
              droppedClosedFixed += 1;
              diagnostic.record("delivery.skip.fixed-child-closed", { taskId: verified.taskId, workflowId: verified.workflowId });
              continue;
            }
          }
          sawFixedChild = true;
          deliverable.push(member);
          continue;
        }
        sawLegacyChild = true;
        const actual = await resolveDeliveryAssignment({ projectRoot, recipientRoleId: resolvedTarget,
          source: { kind: "child-report", childTaskId: member.handback.taskId, childRoleId: member.handback.roleId },
          ...(member.flowId ? { expectedFlowId: member.flowId } : {}) });
        if (stopped()) return false;
        if (!actual.ok) {
          item.lastAttempt = { state: "blocked", code: actual.code, at: new Date(this.now()).toISOString() };
          diagnostic.record("delivery.blocked", { reasonCode: actual.code, message: actual.message });
          this.emitDeliveryNote(projectRoot, runtime, resolvedTarget, member.handback.roleId,
            `回交当前任务来源不可用，未打开或续投，消息已保留：${actual.code}：${actual.message}`);
          return false;
        }
        if (selected && (selected.taskId !== actual.value.taskId || selected.flowId !== actual.value.flowId || selected.runId !== actual.value.runId)) {
          diagnostic.record("delivery.blocked", { reasonCode: "delivery-assignment-mixed" });
          return false;
        }
        selected = actual.value;
        deliverable.push(member);
      }
      if (droppedClosedFixed > 0) {
        if (deliverable.length === 0) {
          // 整条回交的成员全部是已收口 fixed 子任务 ⇒ 丢弃队列项并继续 drain（不阻塞后续回交）。
          const index = q.indexOf(item); if (index !== -1) q.splice(index, 1);
          if (q.length === 0) this.deliveryQueues.delete(key);
          this.notifyRoleState(projectRoot, resolvedTarget, runtime);
          this.persistDeliveryQueues();
          void this.drainQueue(projectRoot, resolvedTarget, runtime); // 继续处理后续条目（不因丢弃一条而停滞）
          return false;
        }
        // 同一批 batchItems 混有 closed/open：只丢 closed 成员，open 成员继续投递（不整批阻塞、不误投）。
        item.batchItems = deliverable;
        const [only] = deliverable;
        if (deliverable.length === 1 && only !== undefined) {
          // 单条剩余：用该成员**入队时定格**的正文/摘要（已收口成员的正文绝不投出）。
          if (typeof only.text === "string" && only.text !== "") item.text = only.text;
          if (typeof only.summary === "string" && only.summary !== "") item.summary = only.summary;
        } else {
          const batchHandbacks = deliverable.map((member) => member.handback).filter((hb): hb is TaskHandback => hb !== undefined);
          if (batchHandbacks.length === deliverable.length) {
            item.text = renderHandbackBatchPrompt(batchHandbacks);
            item.summary = mainT("main.session.delivery.handbackBatch", { count: deliverable.length, roles: deliverable.map((member) => member.sourceRoleId).join("、") });
          }
        }
      }
      if (!sawLegacyChild) {
        // 全部（剩余）成员都是 fixed 子任务：无 legacy assignment（不绑定 run/candidate；目标会话按 B8.1/下方 fixed 重绑）。
        pendingControllerAssignment = undefined;
        return sawFixedChild;
      }
      pendingControllerAssignment = selected;
      return selected !== undefined;
    };
    if (!await inspectHandbackAssignment()) return;
    let entry = this.sessions.get(this.sessionKey(projectRoot, resolvedTarget, runtime));
    const taskBoundWorker = item.kind === "dispatch" && !!item.taskId && !isBuiltInGovernanceRoleId(resolvedTarget);
    const taskBoundSession = taskBoundWorker || taskBoundReview || pendingControllerAssignment !== undefined;
    const assignedDeliveryId = pendingControllerAssignment?.taskId ?? item.taskId;
    const boundTaskOf = (current: LiveSession | undefined) => current?.boundAssignment?.taskId ?? current?.assignedTaskId;
    const inspectQueuedChild = async () => {
      if (!(taskBoundWorker || childRequiresCurrentAssignment) || !item.taskId) return true;
      // T3 B1（AC-12/AC-23）：fixed 任务（workflowId 命名空间）只认编排 tasks 账本事实
      // （`workflowService.inspectAssignedTask`），不经 legacy trunk 的 run/candidate 绑定；
      // legacy 任务仍走下方原检查（逐字不变）。
      if (await this.isFixedTask(projectRoot, item.taskId)) {
        const fixedAssigned = await inspectWorkflowAssignedTask({ projectRoot, taskId: item.taskId, actorRoleId: resolvedTarget });
        if (fixedAssigned.ok && fixedAssigned.task.open && !fixedAssigned.task.stopped) return true;
        const index = q.indexOf(item); if (index !== -1) q.splice(index, 1);
        if (q.length === 0) this.deliveryQueues.delete(key);
        diagnostic.record("delivery.skip.task-unavailable", {
          taskId: item.taskId,
          reasonCode: fixedAssigned.ok ? "task-not-open" : fixedAssigned.code,
          ...(fixedAssigned.ok ? {} : { message: fixedAssigned.message }),
        });
        this.notifyRoleState(projectRoot, resolvedTarget, runtime); this.persistDeliveryQueues();
        return false;
      }
      const assigned = await inspectAssignedTask({ projectRoot, taskId: item.taskId, actorRoleId: resolvedTarget });
      if (assigned.ok) {
        if (!taskBoundWorker) {
          const created = (await this.readTasks(projectRoot)).records.get(item.taskId)?.created;
          if (created?.from === "convener" && !created.reviewBasisRef && created.flowId && created.runId) {
            const checked = await prepareRoleDispatch({ projectRoot, fromRoleId: "convener", targetRoleId: resolvedTarget,
              flowId: created.flowId, runId: created.runId, ...(created.moduleId ? { moduleId: created.moduleId } : {}) });
            if (!checked.ok) { diagnostic.record("delivery.blocked", { taskId: item.taskId, reasonCode: checked.code, message: checked.message }); return false; }
          }
        }
        return true;
      }
      const index = q.indexOf(item); if (index !== -1) q.splice(index, 1);
      if (q.length === 0) this.deliveryQueues.delete(key);
      diagnostic.record("delivery.skip.task-unavailable", { taskId: item.taskId, reasonCode: assigned.code, message: assigned.message });
      this.notifyRoleState(projectRoot, resolvedTarget, runtime); this.persistDeliveryQueues();
      return false;
    };
    if (!await inspectQueuedChild()) return;
    // T3 B8.1（2026-11-11，RR3）：投递**固定任务**时自动开启的目标会话同样强制 fixed（与
    // `routeFixedPathDispatch` 同口径：任务账本 `task.created.workflowId` 命名空间）；legacy 任务
    // 不传（旧路径逐字不变）。既有非 fixed 条目也走安全重绑（busy/不可关闭 ⇒
    // `fixed-session-rebind-blocked`，条目保留待重试——绝不把 fixed 任务投进 legacy 会话）。
    // T3 B8.2：回交条目同样按 `handback.taskId` 判定 fixed（重启恢复条目/未登记 `starTaskIds` 时
    // `item.taskId` 可能缺席，回交载荷仍在）——worker→convener 的 fixed 回交目标会话同样 forced fixed。
    const deliveryFixedTaskId = item.taskId !== undefined && item.taskId !== ""
      ? item.taskId
      : item.kind === "handback" ? item.handback?.taskId : undefined;
    const forcedDeliveryMode: WorkflowMode | undefined =
      deliveryFixedTaskId !== undefined && await this.isFixedTask(projectRoot, deliveryFixedTaskId) ? "fixed" : undefined;
    // T3 B10.1（2026-11-11，RR5 根因 `report-task-link-broken`）：fixed **派发**条目（dispatch）的
    // `taskId` 是目标角色本次真实受派任务——自动打开/重绑时传入（会话 `assignedTaskId` 与 run-role
    // `input.taskId`，`submit_report` 关联的来源）。已打开但未绑定本次任务（聊天/上一任务）⇒ 安全重绑。
    // 回交条目的 `taskId` 是**子任务**（创建者要收口的对象，不是目标会话自己的受派任务），不用于会话
    // 绑定（误绑会让创建者自己的报告关联到子任务）；B8.2 的 forced fixed 重绑照旧。
    const fixedOpenTaskId = forcedDeliveryMode === "fixed" && item.kind === "dispatch"
      && typeof item.taskId === "string" && item.taskId !== "" ? item.taskId : undefined;
    const needsFixedRebind = forcedDeliveryMode === "fixed" && entry !== undefined && entry.projectRoot === projectRoot &&
      entry.sessionWorkflowMode !== "fixed";
    const needsFixedTaskBind = fixedOpenTaskId !== undefined && entry !== undefined && entry.projectRoot === projectRoot
      && entry.sessionWorkflowMode === "fixed" && boundTaskOf(entry) !== fixedOpenTaskId;
    // 目标忙且尚未绑定本次任务 ⇒ 保持排队（settle 后重试再安全重开）；绝不把任务投进未绑定/别的任务的会话。
    if (entry?.busy && (taskBoundSession && boundTaskOf(entry) !== assignedDeliveryId || needsFixedTaskBind)) return;
    if (stopped()) return;
    if (!entry || entry.projectRoot !== projectRoot || taskBoundSession && boundTaskOf(entry) !== assignedDeliveryId || needsFixedRebind || needsFixedTaskBind) {
      // 2026-11-05（真机缺陷「又卡住」）：生产宿主（Interface）把 `demoRuntimeAutoDeliver` 置 false ⇒
      // **演示运行时（demo）不自动开会话**。demo 适配器执行内置演示脚本（对 `src/evil.ts` 的越界写，
      // 用于演示"写前被拒"），自动唤醒只会得到被门禁拒绝的回合，失败结果再经回交/派发级联成 blocked
      // （重启后持久队列里的历史 demo 项会连锁触发）。demo 仅供用户显式体验：只投给已打开的 demo 会话；
      // 未打开则保持排队（不丢消息、不自动开启）。缺省 true 保持测试/演示宿主既有语义。
      if (runtime === "demo" && this.deps.demoRuntimeAutoDeliver === false) {
        diagnostic.record("delivery.skip.demo-not-opened", { state: item.kind, targetRoleId: resolvedTarget, queueDepth: q.length });
        return;
      }
      // 目标会话**未开**（或属于别的项目/需 fixed 重绑/未绑定本次任务）→ 自动开启再投（su=治理主入口；
      // 派发目标=被派角色）。后台开启（`userInitiated=false`）：**不抢活动角色**。
      // B8.1/B10.1：固定派发条目携带 taskId + forced fixed（legacy 任务不传）。
      const openTaskId = taskBoundSession ? assignedDeliveryId : fixedOpenTaskId;
      const opened = await this.openInternal({ projectRoot, roleId: resolvedTarget, runtime,
        ...(openTaskId !== undefined ? { taskId: openTaskId } : {}),
        ...(forcedDeliveryMode !== undefined ? { forcedWorkflowMode: forcedDeliveryMode } : {}) }, false);
      if (!opened.ok) {
        item.lastAttempt = { state: "blocked", code: "unknown", at: new Date(this.now()).toISOString() };
        this.emitDeliveryNote(projectRoot, runtime,
          item.kind === "handback" ? resolvedTarget : item.sourceRoleId,
          item.sourceRoleId,
          item.kind === "handback"
            ? mainT("main.session.delivery.openFailedHandback", { sourceRoleId: item.sourceRoleId, target: resolvedTarget, detail: opened.error ?? mainT("shared.common.unknownReason") })
            : mainT("main.session.delivery.openFailedDispatch", { sourceRoleId: item.sourceRoleId, target: resolvedTarget, detail: opened.error ?? mainT("shared.common.unknownReason") })
        );
        return;
      }
      entry = this.sessions.get(this.sessionKey(projectRoot, resolvedTarget, runtime));
      this.suDeliveryBlockedNoted.delete(this.queueKey(projectRoot, "", runtime));
    }
    if (stopped() || !entry || entry.projectRoot !== projectRoot) return; // 停止或仍不可用：保持排队
    this.healStaleOrigin(entry, "stale-origin-before-drain");
    if (entry.busy || entry.origins.running !== undefined || (runtime === "pi" && entry.profileRevision !== this.profileRevision("pi") && this.hasBusyRuntime("pi"))) {
      diagnostic.record("delivery.blocked", { reasonCode: "target-busy", queueDepth: q.length });
      return;
    }

    // O-1：投递前查边界快照——陈旧 ⇒ 先作废重建（投递落到新边界会话上；失败则队列保留待重试）。
    const rebuilt = await this.rebuildIfBoundaryStale(this.sessionKey(projectRoot, resolvedTarget, runtime), false);
    if (rebuilt !== undefined) {
      if (!rebuilt.reopened.ok) return; // 队列保留（下次时机自动重试；失败已有如实一行）
      entry = this.sessions.get(this.sessionKey(projectRoot, resolvedTarget, runtime));
      if (!entry || entry.projectRoot !== projectRoot) return; // 防御：重开后仍不可用
    }
    // **P0 turn lease 复核（2026-10-30）**：上面的忙判据在 `await rebuildIfBoundaryStale` 之前读取——
    // 该 await 期间另一条路径可能已开跑（busy/origin 置位）。认领前必须**再验一次**，否则会覆盖
    // 正在运行回合的 origins.running（现场「失败回交覆盖 origin → turn.end 后 busy 不复位」根因类）。
    this.healStaleOrigin(entry, "stale-origin-after-rebuild");
    if (entry.busy || entry.origins.running !== undefined) {
      diagnostic.record("delivery.blocked", { reasonCode: "target-busy", queueDepth: q.length });
      return;
    }

    if (!await inspectQueuedChild() || !await inspectHandbackAssignment() || !await inspectResume()) return;
    if (stopped() || this.sessions.get(this.sessionKey(projectRoot, resolvedTarget, runtime)) !== entry || entry.busy || entry.origins.running !== undefined ||
        entry.interactionState.lifetime.signal.aborted) return;

    // —— F-2-opt3：认领段开始（自此到 claim.end 之间的同步改动都在串行链内；随后链即释放）——
    diagnostic.record("delivery.claim.start", { state: item.kind, queueDepth: q.length });
    // 仅回交主人队首连续回交合批；客户消息/派发是屏障，正文仍由编排唯一生成。
    // B 批：幕僚的星形工作结果也合批（渲染用 `renderWorkReportBatchPrompt`，`[工作结果]` 固定字段）。
    const chiefRoleId = this.chiefTaskRoleIdOf(projectRoot);
    const handbackOwner = this.handbackOwnerRoleId(projectRoot);
    let batchCount = 1;
    // v2.0.0 B8 回归修复：合批目标 = **回交主人**（single=`primaryRoleId`/trio=Convener）**或**幕僚
    // chief——与 `e71501c` 之前一致；该提交把 `handbackOwner` 分支误删为仅 chief（注释与渲染分支仍按
    // 两者写），导致单模型（su）队首连续回交逐条投递、队列不清空。owner 未枚举到 ⇒ 只按 chief 判。
    const batchesForHandbackOwner = handbackOwner !== null && resolvedTarget === handbackOwner;
    if (headIndex === 0 && (batchesForHandbackOwner || resolvedTarget === chiefRoleId) && item.kind === "handback" && item.handback && !item.deliveryId) {
      while (batchCount < q.length && q[batchCount].kind === "handback" && q[batchCount].handback) batchCount += 1;
    }
    let text = item.text;
    let summary = item.summary;
    if (batchCount > 1) {
      const batchHandbacks = q.slice(0, batchCount).map((queued) => queued.handback as TaskHandback);
      text = resolvedTarget === chiefRoleId && chiefRoleId !== null
        ? renderWorkReportBatchPrompt(batchHandbacks)
        : renderHandbackBatchPrompt(batchHandbacks);
      summary = mainT("main.session.delivery.handbackBatch", { count: batchCount, roles: q.slice(0, batchCount).map((queued) => queued.sourceRoleId).join("、") });
    }
    const removedItems = q.splice(headIndex, batchCount);
    const sentItems = item.deliveryId && item.batchItems ? [...item.batchItems] : removedItems;
    const selectedClaimTasks = sentItems.map(row => row.kind === "dispatch" ? row.taskId : row.kind === "system" ? row.systemAssignment?.taskId : row.kind === "handback" ? row.handback?.taskId : undefined);
    claim.taskIds = selectedClaimTasks.every((taskId): taskId is string => typeof taskId === "string" && taskId.length > 0) ? [...new Set(selectedClaimTasks)] : undefined;
    this.publishDeliveryInventory("delivery-claim-selected");
    const sent: DeliveryItem = item.deliveryId ? item : { ...sentItems[0], text, summary, batchItems: sentItems, ...(item.kind === 'handback' ? { deliveryId: randomUUID() } : {}) };
    if (q.length === 0) this.deliveryQueues.delete(key);
    this.notifyRoleState(projectRoot, resolvedTarget, runtime); // L-1：出队即外推（队列行/徽标随之更新）
    // 形状防御（真机崩溃修复的姊妹项）：条目坏了就**不投**——如实一行，绝不把 undefined 喂给 send。
    if (!sent || typeof sent.text !== "string" || sent.text === "") {
      this.emitDeliveryNote(projectRoot, runtime,
        sent && typeof sent.sourceRoleId === "string" ? sent.sourceRoleId : null,
        "(投递机)",
        mainT("main.session.delivery.malformedItem")
      );
      diagnostic.record("delivery.claim.end", { state: item.kind, count: batchCount });
      this.persistDeliveryQueues(); // 2026-10-20：坏条目已丢弃，持久态同步（不留幽灵 in-flight）
      return;
    }
    // 先置忙再 await（防「open 尾部放行」与本次调用竞态导致并发 send）；失败则复位。
    const origin = this.beginDeliveryOrigin(entry, sent.clientMessageId);
    if (origin === undefined) {
      // turn lease 争用（防御分支：同步段内不应发生）——**放回队首**，绝不覆盖正在运行的 origin。
      q.unshift(...removedItems);
      this.deliveryQueues.set(key, q);
      diagnostic.record("delivery.blocked", { reasonCode: "turn-lease-busy", queueDepth: q.length });
      diagnostic.record("delivery.claim.end", { state: item.kind, count: batchCount });
      this.notifyRoleState(projectRoot, resolvedTarget, runtime);
      this.persistDeliveryQueues();
      return;
    }
    // 收尾推进（2026-10-18）：把本轮的投递类别/流程 id/回交证据定格在 origin 上——settle 后据此决定
    // 是否请 Interface 检查「流程全部完成」。多流程批次保留集合；客户消息/系统消息无 flowId。
    origin.kind = sent.kind;
    const originFlows = [...new Set(sentItems.map((queued) => queued.flowId).filter((id): id is string => typeof id === "string" && id !== ""))];
    if (originFlows.length > 0) origin.flowIds = originFlows;
    if (sent.kind === "handback") {
      origin.handbackEvidence = [
        ...new Set(sentItems.flatMap((queued) => queued.handback?.evidence ?? []).filter((item): item is string => typeof item === "string" && item !== "")),
      ].slice(0, 10);
    }
    entry.interactionState.turn = new AbortController();
    claim.owner = { entry, origin };
    entry.busy = true;
    entry.busySince = this.now(); // G-2/W1：本轮起点定格（看护信号 #1 的 elapsed 基准）
    entry.lastTurnAborted = undefined; // 新一轮开始：上一轮的中止标记不再适用于本轮
    this.activeDeliveries.set(key, sent); // 与 busy 同时登记；settled/失败/dispose 精确撤销。
    this.persistDeliveryQueues(); // 2026-10-20：认领即记 in-flight（崩溃重启后重投；delivery.end 后移除）
    diagnostic.record("delivery.start", { count: batchCount, queueDepth: q.length, state: sent.kind });
    // G-2/W3：drain 出队投出 = 真实活动（重武装）；`kind:"system"`（看护自身投递）不记（同 enqueueDelivery 口径）。
    if (sent.kind !== "system") this.noteWatchdogActivity(projectRoot, "delivery-claim");
    this.notifyRoleState(projectRoot, resolvedTarget, runtime); // 状态准确性：投递开跑即外推「工作中」（shift 时快照尚为闲）
    let deliveryCommit: { key: string; value: { done: Promise<void>; finish: () => void } } | undefined;
    if (sent.kind === "dispatch" && sent.taskId) {
      let finish!: () => void;
      const value = { done: new Promise<void>(resolve => { finish = resolve; }), finish: () => finish() };
      const taskKey = `${projectRoot}\u0000${sent.taskId}`;
      this.taskDeliveryCommits.set(taskKey, value); deliveryCommit = { key: taskKey, value };
    }
    // —— F-2-M1：分离续段（**不再持有串行链**）——IIFE 同步执行到 `await this.sendDelivery(...)` 即挂起，
    // 本方法随后返回（链释放）。try/await/catch 与旧实现**逐字同体**：成功支抛错同样落失败支（逐支等价）。
    void (async () => {
      try {
      // P0-1：入队定格载荷与真实条目来源一起投递；图片数组保持原引用。
      let sendOptions = sent.opts;
      if (sent.kind === 'handback') {
        const members = sent.batchItems ?? [sent];
        const snapshots = members.map(m => m.report);
        const liveViews = members.map(m => m.liveReport ?? (m.report ? { source: m.report.source, taskId: m.report.taskId, origin: m.report.origin, status: m.report.status, summary: m.report.summary, evidence: m.report.evidence, evidenceOmitted: m.report.evidenceOmitted, at: m.report.at } : undefined));
        if (snapshots.every((r): r is RuntimeReportSnapshotV1 => !!r) || liveViews.every((r): r is RuntimeLiveReportViewV1 => !!r)) {
          sent.attemptId = randomUUID();
          const identity = { deliveryId: sent.deliveryId!, attemptId: sent.attemptId, target: { roleId: resolvedTarget, runtime } };
          sendOptions = { ...sent.opts,
            ...(snapshots.every((r): r is RuntimeReportSnapshotV1 => !!r) ? { inputProvenance: { version: 1, kind: 'handback', ...identity, reports: snapshots } as RuntimeInputProvenanceV1 } : { inputPresentation: { version: 1, kind: 'handback-live', durability: members.some(m => m.liveDurability === 'unknown-live') ? 'unknown-live' : 'memory-only', ...identity, reports: liveViews } as RuntimeLiveHandbackPresentationV1 }),
            onDeliveryProgress: progress => {
              if (this.sessions.get(key) === entry) this.rememberReceipt(entry!, progress.receipt);
              sent.opts?.onDeliveryProgress?.(progress);
            } };
        }
      }
      await this.sendDelivery(entry, origin, sent.text, sendOptions, sent.kind === "dispatch", sent.taskId,
        sent.kind === "handback" ? sentItems.flatMap(member => member.handback?.taskId ? [{ childTaskId: member.handback.taskId,
          childRoleId: member.handback.roleId, ...(member.flowId ? { flowId: member.flowId } : {}) }] : []) : undefined,
        sent.kind === "system" ? sent.systemAssignment ?? null : undefined,
        sent.kind === "system" && sent.notificationSource !== undefined, sent.controllerResume);
      // P0（2026-10-30）：settle 收尾可能已先行记账（`terminalRecorded`）——终态诊断恰一次。
      if (sent.terminalRecorded !== true) {
        sent.terminalRecorded = true;
        diagnostic.record("delivery.end", { ok: true, count: batchCount, state: sent.kind });
        // 2026-10-20 重启续跑：投递成功（delivery.end）即从持久队列移除——崩溃重启不重投已完成项。
        this.deliveredDeliveryKeys.add(`${key}\u0000${sent.dedupKey}`);
        // 2026-10-25：应用任务投递成功 ⇒ 记「已投递」（重建续投/应用侧同任务调用不再发第二遍）。
        this.rememberAppTaskDelivered(sent.clientMessageId);
      }
      this.persistDeliveryQueues();
      this.notifyRoleState(projectRoot, resolvedTarget, runtime); // 立即外推（running 行即时可见）
      if (sent.kind === "dispatch") this.activeDispatchKeys.delete(sent.dedupKey); // 送达即释放窗口去重（返工可再派）
      // B 批：任务送达事件（仅星形任务携带 taskId；旧 flow 派发不写 tasks.jsonl）。
      if (sent.kind === "dispatch" && typeof sent.taskId === "string" && sent.taskId !== "") {
        // BUG-5：发送期间任务已完成（已报告/已收口）⇒ 不再补写 delivered（重复投递只留诊断）。
        const latest = (await this.readTasks(projectRoot)).records.get(sent.taskId);
        const terminal = latest !== undefined && (latest.closed !== undefined || latest.reports.length > 0);
        if (terminal) {
          diagnostic.record("tasks.delivered.suppressed-terminal", {
            taskId: sent.taskId,
            closed: latest?.closed !== undefined,
            reports: latest?.reports.length ?? 0,
          });
        } else {
          // durability（发布竞态修复）：投递成功后先落盘 task.delivered，再继续通知/收尾——
          // 观察者读到「适配器已接收」时，任务的已投递状态应已可读（不改变“投递异步”的队列语义）。
          await this.appendTaskState(projectRoot, taskEvent("task.delivered", {
            taskId: sent.taskId,
            to: resolvedTarget,
          }, () => new Date(this.now())));
          await this.appendRoleActivity(projectRoot, resolvedTarget, {
            kind: "task.delivered",
            summary: `收到任务 #${sent.taskId}`,
            taskId: sent.taskId,
            status: "delivered",
          });
        }
      }
      deliveryCommit?.value.finish();
      if (sent.kind === "handback") {
        this.emitDeliveryNote(projectRoot, runtime, resolvedTarget, sent.sourceRoleId, mainT("main.session.delivery.autoDelivered", { roles: sentItems.map((queued) => queued.sourceRoleId).join("、"), target: resolvedTarget }));
      } else if (sent.kind === "dispatch") {
        // 派发成功：目标 pane 看得见"任务到货"，派发主人的 pane 有一条受理回执行（受理≠已完成，如实）。
        this.emitDeliveryNote(projectRoot, runtime, resolvedTarget, sent.sourceRoleId, mainT("main.session.delivery.receivedDispatch", { role: this.roleDisplayName(projectRoot, sent.sourceRoleId) }));
        this.emitDeliveryNote(projectRoot, runtime, sent.sourceRoleId, sent.sourceRoleId, mainT("main.session.delivery.dispatchedNote", { target: this.roleDisplayName(projectRoot, resolvedTarget) }));
      }
      // message 类（排队后的客户消息投递）：**不加额外文案**——消息本体随会话事件出现（真实 pi 的
      // 「用户指令：」回显走注入样式行），此前误落进派发分支（「已接收…派发任务」对消息是错口径，已修）。
    } catch (err) {
      const lastAttempt = { state: "failed" as const, code: origin.assignmentRejectionCode ?? "unknown", at: new Date(this.now()).toISOString() };
      sent.lastAttempt = lastAttempt;
      for (const member of sentItems) member.lastAttempt = lastAttempt;
      // P0（2026-10-30）：终态已由 settle 收尾记账（`delivery.end` phase:"turn-settled"）⇒ 本续段不再重复
      // delivery.failed、也不再回队重投（at-most-once；回合已真实跑完）。
      const terminalRecorded = sent.terminalRecorded === true;
      if (!terminalRecorded) {
        if (sent.kind === 'handback') diagnostic.record('delivery.failed', { count: batchCount, state: sent.kind });
        else diagnostic.error("delivery.failed", err, { count: batchCount, state: sent.kind });
      }
      const receipt = err instanceof RuntimeDeliveryError ? err.receipt : sent.attemptId ? this.attemptStates.get(this.persistenceKey(this.persistenceScope(entry), sent.attemptId))?.receipt : undefined;
      if (receipt) this.rememberReceipt(entry, receipt);
      const cAttempt = sent.kind === 'handback' && !!sent.attemptId;
      // **2026-10-25 重复投递修复：已 ACK 的不再按「未投递」重试**。
      // `origin.turnId` 由运行时**同步开轮回执**（onTurnStarted）绑定；`inputAccepted` 是 prompt-input
      // 真实回显。任一成立 ⇒ 输入已交给运行时，失败（如会话在收尾窗口被重建 dispose）不得回队重投，
      // 否则同一任务会在重建后以第二条 user 消息再出现（客户真机缺陷）。未 ACK 的失败仍按既有语义
      // 放回队首保留重试（失败重试仍允许）；回交保留 receipt 判据（providerMayHaveStarted）不变。
      // P0：settle 已记 `delivery.end` ⇒ 视为已处理（更不允许重投）。
      const acked = origin.turnId !== undefined || origin.inputAccepted === true || terminalRecorded;
      const canRetry = terminalRecorded || sent.controllerResume && origin.assignmentRejectionCode ? false : cAttempt
        ? !!receipt && !receipt.providerMayHaveStarted && receipt.retryDeliveryAllowed
        : !acked;
      const mayBeActive = terminalRecorded ? false : cAttempt && (!receipt || receipt.providerMayHaveStarted);
      const ownsRunningDelivery = entry.origins.running === origin;
      if (!mayBeActive) this.failDeliveryOrigin(entry, origin);
      // 投递失败：**如实提示 + 放回队首**（保持顺序）待重试——绝不静默丢。
      const en = this.sessions.get(this.sessionKey(projectRoot, resolvedTarget, runtime));
      if (en === entry && ownsRunningDelivery && !mayBeActive) {
        en.interactionState.turn.abort();
        en.busy = false;
        en.busySince = undefined;
      }
      if (this.activeDeliveries.get(key) === sent && !mayBeActive) this.activeDeliveries.delete(key);
      const waiting = this.deliveryQueues.get(key) ?? q;
      if (canRetry) {
        waiting.unshift(...(sent.kind === 'handback' ? [sent] : sentItems));
        this.deliveryQueues.set(key, waiting);
      }
      this.notifyRoleState(projectRoot, resolvedTarget, runtime); // 放回队首：队列快照恢复（如实）
      // 2026-10-20 重启续跑：失败重试项保持 queued（下次重启可再重投）；清除可能残留的「已完成」标记。
      // 2026-10-25：已 ACK 的失败**不重投** ⇒ 记「已完成」键（持久快照排除该在途项；重启也不重投）。
      if (canRetry) {
        this.deliveredDeliveryKeys.delete(`${key}\u0000${sent.dedupKey}`);
      } else if (acked) {
        this.deliveredDeliveryKeys.add(`${key}\u0000${sent.dedupKey}`);
        this.rememberAppTaskDelivered(sent.clientMessageId);
      }
      this.persistDeliveryQueues();
      if (terminalRecorded) {
        // 回合已完成、终态已记账：不再向 pane 发「投递失败/保留重试」的错误口径系统行。
        return;
      }
      const base = sent.kind === "handback" && cAttempt ? !canRetry ? mainT("main.session.delivery.maybeProcessed") : mainT("main.session.delivery.retained") : err instanceof Error ? err.message : String(err);
      // 已 ACK 的非回交失败：如实说明「可能已处理，未自动重发」——绝不沿用「已保留待重试」的假话。
      const ackedNote = `${base}——${mainT("main.session.delivery.maybeProcessed")}`;
      this.emitDeliveryNote(projectRoot, runtime,
        sent.kind === "handback" ? resolvedTarget : sent.sourceRoleId,
        sent.sourceRoleId,
        sent.kind === "handback"
          ? (cAttempt
              ? mainT("main.session.delivery.handbackFailedShort", { sourceRoleId: sent.sourceRoleId, detail: base })
              : mainT("main.session.delivery.handbackFailed", { sourceRoleId: sent.sourceRoleId, detail: base }))
          : acked
            ? ackedNote
            : sent.kind === "dispatch"
              ? mainT("main.session.delivery.dispatchFailed", { target: resolvedTarget, detail: base })
              : sent.kind === "system"
                ? mainT("main.session.delivery.systemFailed", { target: resolvedTarget, detail: base })
                : mainT("main.session.delivery.queuedFailed", { target: resolvedTarget, detail: base })
      );
    } finally {
      if (deliveryCommit) {
        deliveryCommit.value.finish();
        if (this.taskDeliveryCommits.get(deliveryCommit.key) === deliveryCommit.value) this.taskDeliveryCommits.delete(deliveryCommit.key);
      }
    }
    })().catch((err) => {
      // 与 drainQueue 安全壳同款：续段已脱离链，其抛错必须**就地**拦截——绝不产生未捕获拒绝
      // （旧实现里该抛错由 drainQueue 的 catch 收口；F-2-M1 后续段在链外，等价物移到这里）。
      this.emitDeliveryNote(projectRoot, runtime,
        this.handbackOwnerRoleId(projectRoot),
        "(投递机)",
        mainT("main.session.delivery.machineryException", { detail: err instanceof Error ? err.message : String(err) })
      );
    });
    diagnostic.record("delivery.claim.end", { state: sent.kind, count: batchCount });
  }
}
