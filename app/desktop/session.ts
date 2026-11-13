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
import { Delivery, type DrainClaimRecord } from "./session/delivery/queue.ts";
// B5（2026-11-13）：卡片决策（43 方法 → `./session/cards/` 三文件：cards / version-decisions /
// acceptance-facts）与 run-change（9 方法 → `./session/run-change.ts`）；端口形状在
// `./session/card-gateway.ts`（CardGateway / FixedCardHooks / ControllerStopPort）。
// 类内保留同名同签名同可见性的**薄委托**；cards/run-change 的 17 个实例状态按方案 §3.6 由模块单 owner
// 持有并创建，门面仅保留同一实例访问器；未迁出的门面方法经端口回调注入（参数逐位原样转发）。
import { Cards } from "./session/cards/cards.ts";
import { VersionDecisions } from "./session/cards/version-decisions.ts";
import { AcceptanceFacts } from "./session/cards/acceptance-facts.ts";
import { RunChange } from "./session/run-change.ts";
import type { CardGateway, ControllerStopPort } from "./session/card-gateway.ts";
// B6（2026-11-13）：回交（4 方法 → `./session/handback.ts`）、派发（5 → `./session/dispatch.ts`）、
// 固定工作流（16 → `./session/fixed-workflow/` 四文件）与 Git runtime/lease/信号端口装配
// （`./session/git-ports.ts`）；`FixedDispatchPort`/`HandbackSink` 端口形状在 `./session/contracts/ports.ts`。
import { Handback } from "./session/handback.ts";
import { Dispatch } from "./session/dispatch.ts";
import { FixedWorkflowRoute, type FixedWorkflowPorts, type FixedWorkflowRefs } from "./session/fixed-workflow/route.ts";
import { FixedWorkflowCards } from "./session/fixed-workflow/cards.ts";
import { FixedWorkflowRelease } from "./session/fixed-workflow/release-merge.ts";
import { FixedWorkflowPanel } from "./session/fixed-workflow/panel.ts";
import type { FixedDispatchPort, HandbackSink } from "./session/contracts/ports.ts";
import { beginSessionDisposeLease, buildFixedTaskGitSurface, createTurnGitRuntime, endSessionDisposeLease, gitContextFailure, noteSessionDisposeInterruption } from "./session/git-ports.ts";

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
  // —— B5（2026-11-13）：run-change 状态（方案 §3.6 的 10 个字段）由 `./session/run-change.ts` 的
  // `RunChange` **单 owner 持有并创建**；门面仅保留**同一实例**访问器（方案 §4.3 兼容面：测试 cast 与
  // 尚未迁出的生命周期/停止方法按原名访问），不造第二份状态。 ——
  private get runStopGeneration(): number { return this.runChange.state.runStopGeneration; }
  private set runStopGeneration(value: number) { this.runChange.state.runStopGeneration = value; }
  private get fencedRunTasks(): Map<string, Set<string>> { return this.runChange.state.fencedRunTasks; }
  private get fencedRuns(): Map<string, Set<string>> { return this.runChange.state.fencedRuns; }
  private get runStopFacts(): Map<string, { projectRoot: string; fact: DesktopRunStopFact }> { return this.runChange.state.runStopFacts; }
  private get controllerStopFacts(): Map<string, { projectRoot: string; fact: DesktopControllerStopFact }> { return this.runChange.state.controllerStopFacts; }
  private get controllerDisposalOwners(): Set<ControllerDisposalLease> { return this.runChange.state.controllerDisposalOwners; }
  private get deferredRunChanges(): Map<string, { plan: RunChangeHostPlan; entry: LiveSession; origin: DeliveryOrigin; controller: AbortController }> { return this.runChange.state.deferredRunChanges; }
  private get runChangeOperations(): Map<string, { plan: RunChangeHostPlan; controller: AbortController }> { return this.runChange.state.runChangeOperations; }
  private readonly observedHandles = new Map<string, { fact: DesktopSessionInventoryFact; handle?: RoleSessionHandle }>();
  private readonly observedHandleIds = new WeakMap<RoleSessionHandle, string>();
  private get inventoryPublicationErrors(): Map<string, string> { return this.runChange.state.inventoryPublicationErrors; }
  private get observedInventoryRoots(): Set<string> { return this.runChange.state.observedInventoryRoots; }
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

  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private runTaskIsFenced(projectRoot: string, taskId?: string, runId?: string): boolean {
    return this.runChange.runTaskIsFenced(projectRoot, taskId, runId);
  }

  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private async selectRunChangeForHandle(projectRoot: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined,
    request: Parameters<SelectRunChangeFn>[0], signal?: AbortSignal): Promise<Awaited<ReturnType<SelectRunChangeFn>>> {
    return this.runChange.selectRunChangeForHandle(projectRoot, runtime, handle, request, signal);
  }

  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private async completeTeamPlanForHandle(projectRoot: string, runtime: RuntimeKind, handle: RoleSessionHandle | undefined,
    request: Parameters<CompleteTeamPlanFn>[0], direct: { completeTeamPlan: CompleteTeamPlanFn },
    signal?: AbortSignal): Promise<Awaited<ReturnType<CompleteTeamPlanFn>>> {
    return this.runChange.completeTeamPlanForHandle(projectRoot, runtime, handle, request, direct, signal);
  }

  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private ownedRunStopMembers(plan: Pick<RunChangeHostPlan, "projectRoot" | "handles">) {
    return this.runChange.ownedRunStopMembers(plan);
  }

  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private async executeOwnedRunStop(plan: RunChangeHostPlan, signal: AbortSignal): Promise<Awaited<ReturnType<SelectRunChangeFn>>> {
    return this.runChange.executeOwnedRunStop(plan, signal);
  }

  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private resumeDeferredRunChanges(entry: LiveSession, origin: DeliveryOrigin): void {
    return this.runChange.resumeDeferredRunChanges(entry, origin);
  }

  /** 库存变更（薄委托 → `shared/inventory.ts`；observedRoots/发布失败表经显式状态面传入）。 */
  private inventoryChanged(projectRoot: string, reason: string): void {
    inventoryChanged(projectRoot, reason, this.inventoryState);
  }
  private publishDeliveryInventory(reason: string): void {
    publishDeliveryInventory(reason, this.inventoryState);
  }
  /** 库存函数的显式状态面（同一 Set/Map 实例；方案 §3.6 归属 run-change，由模块单 owner 持有）。 */
  private get inventoryState(): SessionInventoryState {
    return this.runChange.inventoryState;
  }
  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  executionInventoryFacts(projectRoot: string): Pick<DesktopProjectExecutionInventory, "sessions" | "pendingOpens" | "queuedDispatches" | "activeDeliveries" | "deliveryQueuePersistence" | "runStops" | "controllerStops"> {
    return this.runChange.executionInventoryFacts(projectRoot);
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
    const lease = root && !heldLease ? beginSessionDisposeLease(root) : undefined;
    if (root && lease && !lease.ok) noteSessionDisposeInterruption(root, handle.sessionId);
    if (record) { record.fact.phase = "disposing"; this.inventoryChanged(record.fact.projectRoot, "session-disposing"); }
    try { await handle.dispose(); if (record) record.fact.phase = "disposed"; }
    catch (error) { if (record) { record.fact.phase = "dispose-failed"; record.fact.errors.push("disposal-unproven"); } throw error; }
    finally {
      if (record) this.inventoryChanged(record.fact.projectRoot, "session-dispose-observed");
      if (root && lease?.ok) {
        const ended = endSessionDisposeLease(root, lease.leaseId);
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
  // —— B4（2026-11-13）：投递机状态（方案 §3.6 的 19 个字段）由 `./session/delivery/queue.ts` 的
  // `Delivery` **单 owner 持有并创建**；门面仅保留**同一实例**的访问器（方案 §4.3 兼容面：测试 cast 与
  // 尚未迁出的生命周期/卡片方法按原名访问），不造第二份状态。同名访问器直接转发同一对象。 ——
  private get deliveryQueues(): Map<string, DeliveryItem[]> { return this.delivery.state.deliveryQueues; }
  private get drainChains(): Map<string, Promise<void>> { return this.delivery.state.drainChains; }
  private get drainClaimRecords(): Set<DrainClaimRecord> { return this.delivery.state.drainClaimRecords; }
  private get deliveryStopVersion(): number { return this.delivery.state.deliveryStopVersion; }
  private set deliveryStopVersion(value: number) { this.delivery.state.deliveryStopVersion = value; }
  private get deliveryStoppedAll(): boolean { return this.delivery.state.deliveryStoppedAll; }
  private set deliveryStoppedAll(value: boolean) { this.delivery.state.deliveryStoppedAll = value; }
  private get stoppedDeliveryKeys(): Set<string> { return this.delivery.state.stoppedDeliveryKeys; }
  private get resumedDeliveryKeys(): Set<string> { return this.delivery.state.resumedDeliveryKeys; }
  private get deliveryKeyStopVersions(): Map<string, number> { return this.delivery.state.deliveryKeyStopVersions; }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private deliveryIsStopped(key: string): boolean {
    return this.delivery.deliveryIsStopped(key);
  }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private deliveryLifecycle(key: string): string {
    return this.delivery.deliveryLifecycle(key);
  }
  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private resumeDelivery(key: string): void {
    this.delivery.resumeDelivery(key);
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
  /** **正在跑的那条投递**（方案 §3.6 delivery；同一实例访问器，语义见 `session/delivery/queue.ts`）。 */
  private get activeDeliveries(): Map<string, DeliveryItem> { return this.delivery.state.activeDeliveries; }
  /** B 批：星形任务 id（内存索引；派发/恢复/列表时登记——回交路由用同步判定，保持事件顺序）。 */
  private readonly starTaskIds = new Set<string>();
  /** 2026-10-29（方案 v2.1 §5.4/M9）：任务创建者内存索引（`task.created.from`）——报告按创建者路由。
   *  B1 提交 2/2：状态随 `rememberTaskCreator` 迁入 `./session/shared/tasks-store.ts`（模块单例，见导入）。 */
  /** B 批：已写入 `task.reported` 的键（`taskId\0turnId|摘要`；防同轮重复事件）。 */
  private readonly reportedTaskKeys = new Set<string>();
  /** B-07：连续卡死升级卡（按链根去重；同一链只提交一次）。 */
  private readonly escalationRequests = new Map<string, Promise<{ escalated: boolean; requestId?: string; selected?: string; message: string }>>();
  /** B5：在途方案升级卡（`projectRoot\0flowId` 去重；同一 flow 至多一张）——状态由
   *  `./session/cards/cards.ts` 的 `Cards` 单 owner 持有（同一实例访问器）。 */
  private get planEscalations(): Map<string, Promise<void>> { return this.cards.state.planEscalations; }
  /** B5：已向 convener 发过「是否自己调用 report_plan_escalation」提示的 flow（状态由 `Cards` 单 owner
   *  持有；首次 blocked 即提示，同一 flow 在 done/failed/aborted 或升级卡成功提交后清除标记）。 */
  private get planEscalationPrompted(): Set<string> { return this.cards.state.planEscalationPrompted; }
  /** C 批：系统通知去重（`requestId\0event`）——状态由 `Cards` 单 owner 持有。 */
  private get requestNotifiedKeys(): Set<string> { return this.cards.state.requestNotifiedKeys; }
  /** 2026-11-02（版本决策）：同进程未决请求（subjectKey -> requestId）——状态由 `Cards` 单 owner 持有；
   *  跨重启由账本结构化扫描兜底，只用于 `decision-pending` 的 check-then-set，不当作第二份持久状态。 */
  private get versionDecisionPending(): Map<string, string> { return this.cards.state.versionDecisionPending; }
  /** 版本决策 check-then-set 的 per-project 串行链（状态由 `Cards` 单 owner 持有；不持有到卡裁决/执行）。 */
  private get versionDecisionChains(): Map<string, Promise<void>> { return this.cards.state.versionDecisionChains; }
  /** C 批：已呈现过的申请（`requestId\0customer|judge`）——状态由 `Cards` 单 owner 持有。 */
  private get requestPresentedKeys(): Set<string> { return this.cards.state.requestPresentedKeys; }
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
  /** B4：投递机（27 方法 → `./session/delivery/queue.ts` + `store.ts`；方案 §3.6 的 19 个状态字段由模块
   *  单 owner 持有（`Delivery.state`）；门面仅保留同一实例访问器，见上方同名访问器组）。 */
  private readonly delivery: Delivery;
  /** B5：run-change 栅栏/控制器停止/执行库存事实（9 方法 → `./session/run-change.ts`；方案 §3.6 的 10 个
   *  状态字段由模块单 owner 持有（`RunChange.state`）；门面仅保留同一实例访问器）。 */
  private readonly runChange: RunChange;
  /** B5：应用卡呈现/申请生命周期/方案升级/任命/stable/run-change 卡（21 方法 →
   *  `./session/cards/cards.ts`；方案 §3.6 的 7 个 cards 状态字段由模块单 owner 持有）。 */
  private readonly cards: Cards;
  /** B5：版本决策全链与恢复（17 方法 → `./session/cards/version-decisions.ts`）。 */
  private readonly versionDecisions: VersionDecisions;
  /** B5：验收 judge 事实与 appointment-write 校验（5 方法 → `./session/cards/acceptance-facts.ts`）。 */
  private readonly acceptanceFacts: AcceptanceFacts;
  /** B5：卡片通道端口实例（门面构造注入；fixed-workflow/lifecycle 经此使用，不导入 cards/**）。 */
  private readonly cardGateway: CardGateway;
  /** B5：精确控制器停止端口实例（门面构造注入）。 */
  private readonly controllerStopPort: ControllerStopPort;
  /** B6：回交提交、回交主人路由与回交展示（4 方法 → `./session/handback.ts`；§3.6 handback 2 字段由模块单 owner 持有）。 */
  private readonly handback: Handback;
  /** B6：星形/legacy 派发路由与幕僚控制器恢复（5 方法 → `./session/dispatch.ts`）。 */
  private readonly dispatch: Dispatch;
  /** B6：fixed 派发路由 + 路径 B 写集/启动门（3 方法 → `./session/fixed-workflow/route.ts`）。 */
  private readonly fixedWorkflowRoute: FixedWorkflowRoute;
  /** B6：固定卡请求/裁决/阶段推进 + fixed 收口/复核/回交子任务校验（6 方法 → `./session/fixed-workflow/cards.ts`）。 */
  private readonly fixedWorkflowCards: FixedWorkflowCards;
  /** B6：merge-main 卡/发布合并/自动呈卡（5 方法 → `./session/fixed-workflow/release-merge.ts`）。 */
  private readonly fixedWorkflowRelease: FixedWorkflowRelease;
  /** B6：fixed 面板只读投影 + advisory 摘要（2 方法 → `./session/fixed-workflow/panel.ts`）。 */
  private readonly fixedWorkflowPanel: FixedWorkflowPanel;
  /** B6：`FixedDispatchPort`（dispatch → fixed-workflow；构造注入箭头、运行期调用、参数逐位转发）。 */
  private readonly fixedDispatchPort: FixedDispatchPort;
  /** B6：`HandbackSink`（persistence → handback；构造注入箭头、运行期调用、参数逐位转发）。 */
  private readonly handbackSink: HandbackSink;
  /** B6（2026-11-13）：回交去重键（`handbackKey` 单一来源；`projectRoot\0<key>`——**一条回交只投递一次**，
   *  永不放行重投）。状态由 `./session/handback.ts` 的 `Handback` **单 owner 持有并创建**；门面仅保留
   *  **同一实例**访问器（方案 §4.3 兼容面：delivery/store 恢复路径按原名写同一 Set），不造第二份状态。 */
  private get enqueuedHandbackKeys(): Set<string> { return this.handback.state.enqueuedHandbackKeys; }
  private get pendingHandbackKeys(): Set<string> { return this.handback.state.pendingHandbackKeys; }
  /** 回交/派发提交屏障（方案 §3.6 delivery；同一实例访问器，语义见 `session/delivery/queue.ts`）。 */
  private get taskHandbackCommits(): Map<string, Promise<void>> { return this.delivery.state.taskHandbackCommits; }
  /** Only an already-started delivery observation; Core.send never awaits the detached report consumer. */
  private get taskDeliveryCommits(): Map<string, { done: Promise<void>; finish: () => void }> { return this.delivery.state.taskDeliveryCommits; }
  /**
   * 派发去重键——**队列期窗口去重**（投递成功即释放，见 `drainQueue`；返工可再派发同文任务）。
   * 契约的 `DispatchTaskPayload` 无 id/时间（钉死不扩），桌面无法区分「重试同一调用」与「新的一次相同文本
   * 派发」；在途窗口去重防重投，送达后放行以保返工回路可用——语义在 change 文档写明。
   */
  private readonly activeDispatchKeys = new Set<string>();
  /** 2026-10-31（run-change 触发缺陷）：**自动**呈现 run-change 卡的去重键（`projectRoot\0runId`；状态由
   *  `Cards` 单 owner 持有）。同一 pinned run 只自动弹一次——客户已决定/已呈现后，后续冻结冲突只回
   *  结构化拒绝（走显式入口），不刷屏、不重复替客户要决定。显式入口（会话头按钮/IPC）不受此集合限制。 */
  private get runChangeAutoPrompted(): Set<string> { return this.cards.state.runChangeAutoPrompted; }
  /** 「队列受阻」（枚举不到目标）只如实提示**一次**（方案 §3.6 delivery；同一实例访问器）。 */
  private get suDeliveryBlockedNoted(): Set<string> { return this.delivery.state.suDeliveryBlockedNoted; }
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
   * **投递队列持久化状态（方案 §3.6 delivery；同一实例访问器）**：存储路径、串行原子写链、
   * 「delivery.end 已完成」键与应用任务「已投递」标记/武装标志（19 字段单 owner 在 delivery 模块；
   * 语义/JSDoc 见 `./session/delivery/store.ts` 与 `./session/delivery/queue.ts`）。
   */
  private get deliveryQueueStorePath(): string | undefined { return this.delivery.state.deliveryQueueStorePath; }
  private get deliveryPersistOutcome(): DeliveryQueuePersistenceOutcome { return this.delivery.state.deliveryPersistOutcome; }
  private get deliveryPersistChain(): Promise<DeliveryQueuePersistenceOutcome> { return this.delivery.state.deliveryPersistChain; }
  private get deliveryPersistSeq(): number { return this.delivery.state.deliveryPersistSeq; }
  private get deliveredDeliveryKeys(): Set<string> { return this.delivery.state.deliveredDeliveryKeys; }
  private get deliveredAppTaskIds(): Set<string> { return this.delivery.state.deliveredAppTaskIds; }
  private get deliveryStoreArmed(): boolean { return this.delivery.state.deliveryStoreArmed; }
  private set deliveryStoreArmed(value: boolean) { this.delivery.state.deliveryStoreArmed = value; }
  /**
   * **P2 网络状态（2026-10-30）**：最近一次主进程网络快照（monitor 经 Interface 推入）。
   * `null` = 尚未收到（按在线处理；不误判离线）。离线期间队列保留、不认领新投递；恢复后按既有 drain 继续。
   */
  private networkState: NetworkState | null = null;

  constructor(deps: SessionManagerDeps) {
    this.deps = deps;
    this.loadEffectiveConfig = deps.loadEffectiveConfig ?? defaultLoadEffectiveConfig;
    // B2 两阶段装配：模块构造时注入只读端口/状态引用；端口方法只在运行期调用（不改变构造期语义）。
    this.evidence = new Evidence(deps);
    // B6（2026-11-13）两阶段装配：`FixedDispatchPort`/`HandbackSink` 端口实例（箭头回调 → 门面同名薄委托；
    // 运行期调用、参数逐位转发；构造期不触发任何端口方法）。
    this.handbackSink = {
      handleHandback: (projectRoot, runtime, hb, report, liveReport, liveDurability, flowId) =>
        this.handleHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId),
      handbackFlowId: (entry, hb) => this.handbackFlowId(entry, hb),
    };
    this.persistence = new Persistence(
      {
        sessions: this.sessions,
        reportStates: this.reportStates,
        attemptStates: this.attemptStates,
        knownReports: this.knownReports,
        knownAttempts: this.knownAttempts,
        persistenceInFlight: this.persistenceInFlight,
      },
      this.handbackSink,
    );
    // B6（2026-11-13）两阶段装配：回交状态由 ./session/handback.ts 的 Handback 单 owner 持有并创建
    // （方案 §3.6 的 2 个字段）；其余簇状态/未迁出方法经 refs 访问器与端口箭头延迟取值（构造期不触发）。
    this.handback = new Handback(
      {
        starTaskIds: this.starTaskIds,
        reportedTaskKeys: this.reportedTaskKeys,
        governanceHandbackMirrored: this.governanceHandbackMirrored,
        lastGovernanceRuntime: this.lastGovernanceRuntime,
        taskHandbackCommits: () => this.taskHandbackCommits,
        taskDeliveryCommits: () => this.taskDeliveryCommits,
        planEscalations: () => this.planEscalations,
        planEscalationPrompted: () => this.planEscalationPrompted,
      },
      {
        findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId),
        activeRuntimeFor: (projectRoot) => this.activeRuntimeFor(projectRoot),
        enqueueDelivery: (projectRoot, targetRoleId, item) => this.enqueueDelivery(projectRoot, targetRoleId, item),
        drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime),
      },
      deps,
    );
    // B3 两阶段装配：模块构造时注入只读端口/状态引用；端口方法只在运行期调用（不改变构造期语义）。
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
    // B5（2026-11-13）两阶段装配：run-change 状态由 `./session/run-change.ts` 的 `RunChange` **单 owner 持有**
    // （方案 §3.6 的 10 个字段；inventory 两项与 Delivery 共享同一 Set/Map 实例）；投递方法经端口箭头回调
    // 注入，只在运行期调用（构造期不触发）。必须在 Delivery 之前构造：Delivery 的库存状态引用取自本对象。
    this.runChange = new RunChange(
      {
        sessions: this.sessions,
        observedHandles: this.observedHandles,
        openChains: this.openChains,
        lastRoleActivity: this.lastRoleActivity,
        managerId: this.managerId,
        deliveryQueues: () => this.deliveryQueues,
        activeDeliveries: () => this.activeDeliveries,
        drainClaimRecords: () => this.drainClaimRecords,
        taskDeliveryCommits: () => this.taskDeliveryCommits,
        taskHandbackCommits: () => this.taskHandbackCommits,
      },
      { deliveryQueuePersistenceFacts: () => this.deliveryQueuePersistenceFacts() },
      deps,
    );
    // B4（2026-11-13）两阶段装配：投递机状态由 `./session/delivery/queue.ts` 的 `Delivery` **单 owner 持有**
    // （方案 §3.6 的 19 个字段）；未迁出的发送/生命周期方法经端口箭头回调注入，只在运行期调用（构造期不触发）。
    this.delivery = new Delivery(
      {
        sessions: this.sessions,
        lastGovernanceRuntime: this.lastGovernanceRuntime,
        activeDispatchKeys: this.activeDispatchKeys,
        starTaskIds: this.starTaskIds,
        enqueuedHandbackKeys: this.enqueuedHandbackKeys,
        openChains: this.openChains,
        attemptStates: this.attemptStates,
        lastRoleActivity: this.lastRoleActivity,
        observedInventoryRoots: this.observedInventoryRoots,
        inventoryPublicationErrors: this.inventoryPublicationErrors,
      },
      {
        deliver: (entry, origin, text, opts, requiresHandback, handbackTaskId, reportedChildren, queuedSystemAssignment, applicationNotice, controllerResume) =>
          this.sendDelivery(entry, origin, text, opts, requiresHandback, handbackTaskId, reportedChildren, queuedSystemAssignment, applicationNotice, controllerResume),
        openInternal: (req, userInitiated) => this.openInternal(req, userInitiated),
        healStaleOrigin: (entry, reasonCode) => this.healStaleOrigin(entry, reasonCode),
        beginDeliveryOrigin: (entry, clientMessageId) => this.beginDeliveryOrigin(entry, clientMessageId),
        trimDeliveryOrigins: (entry) => this.trimDeliveryOrigins(entry),
        failDeliveryOrigin: (entry, origin) => this.failDeliveryOrigin(entry, origin),
        hasBusyRuntime: (runtime) => this.hasBusyRuntime(runtime),
        profileRevision: (runtime) => this.profileRevision(runtime),
        findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId),
        noteWatchdogActivity: (projectRoot, reason) => this.noteWatchdogActivity(projectRoot, reason),
        inspectFixedHandbackChild: (projectRoot, handback, recipientRoleId, expectedFlowId) => this.inspectFixedHandbackChild(projectRoot, handback, recipientRoleId, expectedFlowId),
        runTaskIsFenced: (projectRoot, taskId, runId) => this.runTaskIsFenced(projectRoot, taskId, runId),
        isNetworkOffline: () => this.isNetworkOffline(),
        rememberReceipt: (entry, receipt) => this.rememberReceipt(entry, receipt),
        persistenceScope: (entry) => this.persistenceScope(entry),
        persistenceKey: (scope, id) => this.persistenceKey(scope, id),
        targetKey: (target) => this.targetKey(target),
        managerId: () => this.managerId,
        inventoryState: () => this.inventoryState,
      },
      deps,
      this.sessionEnv,
      deps.deliveryQueueStorePath,
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
    // B5（2026-11-13）两阶段装配：cards 簇（方案 §3.6 的 7 个状态字段由 `Cards` 单 owner 持有并创建；
    // version-decisions 经同一实例引用读写 versionDecisionPending/versionDecisionChains）；
    // fixed 卡钩子（prepareFixedAppointmentCardRequest/recordFixedCardWorkflowResolution）经门面箭头注入。
    this.acceptanceFacts = new AcceptanceFacts(deps);
    this.cards = new Cards(
      {
        sessions: this.sessions,
        lastGovernanceRuntime: this.lastGovernanceRuntime,
        lastRoleActivity: this.lastRoleActivity,
        loadEffectiveConfig: this.loadEffectiveConfig,
      },
      {
        findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId),
        activeRuntimeFor: (projectRoot) => this.activeRuntimeFor(projectRoot),
        enqueueDelivery: (projectRoot, targetRoleId, item) => this.enqueueDelivery(projectRoot, targetRoleId, item),
        drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime),
      },
      deps,
      this.evidence,
      this.acceptanceFacts,
      {
        prepareFixedAppointmentCardRequest: (projectRoot, flowId, request) => this.prepareFixedAppointmentCardRequest(projectRoot, flowId, request),
        recordFixedCardWorkflowResolution: (input) => this.recordFixedCardWorkflowResolution(input),
      },
    );
    this.versionDecisions = new VersionDecisions(
      this.cards,
      { sessions: this.sessions, lastGovernanceRuntime: this.lastGovernanceRuntime },
      { findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId) },
      deps,
      this.acceptanceFacts,
    );
    // B5 端口实例（方案 §3.3：由门面构造注入、运行期调用；B6/B7 的 fixed-workflow/lifecycle 经 CardGateway 发卡）。
    this.cardGateway = {
      presentAppCard: (input) => this.cards.presentAppCard(input),
      withRequestLifecycle: (projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride, lifecycle) =>
        this.cards.withRequestLifecycle(projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride, lifecycle),
      offerRunChangeOnFrozenContract: (input) => this.cards.offerRunChangeOnFrozenContract(input),
      reportPlanEscalation: (projectRoot, input, signal) => this.cards.reportPlanEscalation(projectRoot, input, signal),
    };
    this.controllerStopPort = { stopExactController: (input, caller) => this.runChange.stopExactController(input, caller) };
    // B6（2026-11-13）两阶段装配：fixed-workflow 模块（L5；白名单 card-gateway/evidence/run-change/git-ports）
    // 与 dispatch 模块（L4；fixed 经 FixedDispatchPort 端口）。模块构造器零副作用（只存引用/箭头）；
    // 端口只在运行期调用（两阶段装配）。构造顺序沿用 B3–B5 口径：全部下游模块实例先于本段就绪。
    this.fixedDispatchPort = {
      routeFixedPathDispatch: (projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId) =>
        this.routeFixedPathDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId),
      dispatchAdvisorySummary: (advisories) => this.dispatchAdvisorySummary(advisories),
    };
    const fixedWorkflowRefs: FixedWorkflowRefs = {
      sessions: this.sessions,
      activeDispatchKeys: this.activeDispatchKeys,
      starTaskIds: this.starTaskIds,
      lastGovernanceRuntime: this.lastGovernanceRuntime,
      lastRoleActivity: this.lastRoleActivity,
      runChange: this.runChange,
      evidence: this.evidence,
      cardGateway: this.cardGateway,
    };
    const fixedWorkflowPorts: FixedWorkflowPorts = {
      openInternal: (req, userInitiated) => this.openInternal(req, userInitiated),
      findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId),
      drainAllQueuesFor: (projectRoot) => this.drainAllQueuesFor(projectRoot),
      enqueueDelivery: (projectRoot, targetRoleId, item) => this.enqueueDelivery(projectRoot, targetRoleId, item),
      drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime),
      appDispatchClientMessageId: (dedupKey) => this.appDispatchClientMessageId(dedupKey),
    };
    this.fixedWorkflowRoute = new FixedWorkflowRoute(fixedWorkflowRefs, fixedWorkflowPorts, deps);
    this.fixedWorkflowRelease = new FixedWorkflowRelease(fixedWorkflowRefs, fixedWorkflowPorts, deps);
    this.fixedWorkflowCards = new FixedWorkflowCards(fixedWorkflowRefs, fixedWorkflowPorts, this.fixedWorkflowRelease, deps);
    this.fixedWorkflowPanel = new FixedWorkflowPanel();
    this.dispatch = new Dispatch(
      {
        sessions: this.sessions,
        activeDispatchKeys: this.activeDispatchKeys,
        starTaskIds: this.starTaskIds,
        deliveredAppTaskIds: this.deliveredAppTaskIds,
        deliveredDeliveryKeys: this.deliveredDeliveryKeys,
        deliveryQueues: () => this.deliveryQueues,
        activeDeliveries: () => this.activeDeliveries,
        lastRoleActivity: this.lastRoleActivity,
      },
      {
        openInternal: (req, userInitiated) => this.openInternal(req, userInitiated),
        findLiveRuntime: (projectRoot, roleId) => this.findLiveRuntime(projectRoot, roleId),
        enqueueDelivery: (projectRoot, targetRoleId, item) => this.enqueueDelivery(projectRoot, targetRoleId, item),
        drainQueue: (projectRoot, targetRoleId, runtime) => this.drainQueue(projectRoot, targetRoleId, runtime),
        appDispatchClientMessageId: (dedupKey) => this.appDispatchClientMessageId(dedupKey),
        appTaskClientMessageIdFromSeed: (seed) => this.appTaskClientMessageIdFromSeed(seed),
        deliveryIsStopped: (key) => this.deliveryIsStopped(key),
        runTaskIsFenced: (projectRoot, taskId, runId) => this.runTaskIsFenced(projectRoot, taskId, runId),
        routeStarDispatch: (projectRoot, runtime, fromRoleId, d, targetRoleId, task, source) =>
          this.routeStarDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source),
      },
      this.fixedDispatchPort,
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

  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  async interpretDirective(request: DirectiveInterpretRequest): Promise<DirectiveInterpretResult> {
    return this.cards.interpretDirective(request);
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

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  async queueDirectNotification(projectRoot: string, input: { key: string; recipientRoleId: string; message: string;
    source: Extract<import("../../src/model/trunk.ts").DirectActionSource, { kind: "role-direct" }> }): Promise<void> {
    return this.delivery.queueDirectNotification(projectRoot, input);
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

  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
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
    return this.cards.requestRequirementChangeDecision(input);
  }

  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
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
    return this.cards.requestRunChangeDecision(input);
  }

  // —————————————— 2026-11-04 trunk-amendment-model D1：应用自有客户卡（VCA/逐项/stable） ——————————————

  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private pickGovernedCardEntry(projectRoot: string): LiveSession | undefined {
    return this.cards.pickGovernedCardEntry(projectRoot);
  }

  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async presentAppCard(input: {
    projectRoot: string;
    request: CustomerInputRequest;
    metadata?: CustomerInputMetadata;
    requestId: string;
    signal?: AbortSignal;
  }): Promise<CustomerInputOutcome | undefined> {
    return this.cards.presentAppCard(input);
  }

  /** VCA 批准/拒绝卡（application-owned decision；客户本人；无通道 ⇒ unavailable/保持 submitted）。 */
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  async presentVersionChangeCard(input: {
    projectRoot: string;
    record: VersionChangeRecord;
    signal?: AbortSignal;
  }): Promise<VcaCardOutcome> {
    return this.cards.presentVersionChangeCard(input);
  }

  /** 修正案逐项确认卡（只对实际变更项；acknowledgments 必选结算）。 */
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  async presentAmendmentItemCard(
    input: AmendmentItemPresentation & { projectRoot: string; signal?: AbortSignal },
  ): Promise<AmendmentItemOutcome> {
    return this.cards.presentAmendmentItemCard(input);
  }

  /** stable workflow 轻量确认卡（app-owned `stable-write`；独立结构校验；不签发许可）。 */
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  async presentStableWriteCard(input: {
    projectRoot: string;
    record: StableWriteRecord;
    preview: StableWritePreview;
    signal?: AbortSignal;
  }): Promise<StableWriteCardOutcome> {
    return this.cards.presentStableWriteCard(input);
  }

  /** 幕僚/运营通知（只通知、无批准权；诚实行，不冒充客户决定）。 */
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  noteVersionChange(projectRoot: string, summary: string): void {
    return this.cards.noteVersionChange(projectRoot, summary);
  }

  /** 客户决定结果返回发起角色（如 product/rapporteur；只通知，不触发模型/门禁/派发）。 */
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  noteVersionChangeInitiator(projectRoot: string, roleId: string, summary: string): void {
    return this.cards.noteVersionChangeInitiator(projectRoot, roleId, summary);
  }

  // —————————————— 2026-11-05：方案升级报告卡（convener 提交 → 客户主权裁决） ——————————————

  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  async reportPlanEscalation(projectRoot: string, input: PlanEscalationInput, signal?: AbortSignal): Promise<PlanEscalationResult> {
    return this.cards.reportPlanEscalation(projectRoot, input, signal);
  }

  /** 方案升级卡决策后的如实通报与（仅「修订方案」时向策划 rapporteur 的）重做方案投递；不代客户决定、不改需求。 */
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async afterPlanEscalation(
    projectRoot: string,
    input: { requestId: string; flowId: string },
    outcome: CustomerInputOutcome | null | undefined,
  ): Promise<void> {
    return this.cards.afterPlanEscalation(projectRoot, input, outcome);
  }

  /** 薄委托 → `session/cards/acceptance-facts.ts`（JSDoc/方法体见模块）。 */
  private async afterStableWrite(
    stack: VersionChangeStack,
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    absPath: string,
  ): Promise<void> {
    return this.acceptanceFacts.afterStableWrite(stack, projectRoot, roleId, runtime, absPath);
  }

  /** 薄委托 → `session/cards/acceptance-facts.ts`（JSDoc/方法体见模块）。 */
  private async enrichAppointmentWriteBoundaryCard(
    stack: VersionChangeStack,
    projectRoot: string,
    request: CustomerInputRequest,
  ): Promise<{ kind: "pass"; request: CustomerInputRequest } | { kind: "reject"; reason: string }> {
    return this.acceptanceFacts.enrichAppointmentWriteBoundaryCard(stack, projectRoot, request);
  }

  /** 薄委托 → `session/cards/acceptance-facts.ts`（JSDoc/方法体见模块）。 */
  private async afterAppointmentWriteApproved(
    stack: VersionChangeStack,
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    request: CustomerInputRequest,
    outcome: CustomerInputOutcome | null | undefined,
  ): Promise<void> {
    return this.acceptanceFacts.afterAppointmentWriteApproved(stack, projectRoot, roleId, runtime, request, outcome);
  }

  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  async activeRunViews(projectRoot: string): Promise<{ ok: true; runs: ActiveRunView[] } | { ok: false; error: string }> {
    return this.cards.activeRunViews(projectRoot);
  }

  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async proposalCardFrozenRejection(
    projectRoot: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    sourceRoleId?: string,
  ): Promise<{ rejection: MechanicalRejection; presented: boolean } | undefined> {
    return this.cards.proposalCardFrozenRejection(projectRoot, request, metadata, sourceRoleId);
  }

  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async pendingVersionChangesFor(
    projectRoot: string,
  ): Promise<{ ok: true; pending: Array<{ applicationId: string; status: string }> } | { ok: false; reason: string }> {
    return this.cards.pendingVersionChangesFor(projectRoot);
  }

  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
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
    return this.cards.offerRunChangeOnFrozenContract(input);
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
    // B6（2026-11-13）：Git runtime 装配片段迁入 `session/git-ports.ts`（同一判定顺序/失败码/装配入参；
    // 上下文字段为原闭包自由变量，回调保持原求值时机与次数）。
    const currentGitRuntime = createTurnGitRuntime({
      key,
      gitBinding,
      projectRoot: req.projectRoot,
      roleId: req.roleId,
      sessions: this.sessions,
      deliveryIsStopped: (leaseKey) => this.deliveryIsStopped(leaseKey),
      runTaskIsFenced: (projectRoot, taskId, runId) => this.runTaskIsFenced(projectRoot, taskId, runId),
    });
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
            ? { taskGit: buildFixedTaskGitSurface(req.projectRoot) }
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

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private forceResetDeliveryState(entry: LiveSession, reasonCode: string): void {
    this.delivery.forceResetDeliveryState(entry, reasonCode);
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

  /** 薄委托 → `session/fixed-workflow/cards.ts`（JSDoc/方法体见模块）。 */
  private async inspectFixedHandbackChild(
    projectRoot: string,
    handback: TaskHandback,
    recipientRoleId: string,
    expectedFlowId: string | undefined,
  ): Promise<{ ok: true; taskId: string; workflowId: string; closed: boolean } | { ok: false; message: string }> {
    return this.fixedWorkflowCards.inspectFixedHandbackChild(projectRoot, handback, recipientRoleId, expectedFlowId);
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
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private requestIdFor(projectRoot: string, sourceRoleId: string, request: CustomerInputRequest, metadata?: CustomerInputMetadata): string {
    return this.cards.requestIdFor(projectRoot, sourceRoleId, request, metadata);
  }

  /** C 批：系统通知幕僚（按 requestId+event 去重；系统行不是客户卡/不是决定）。返回可等待的落盘链。 */
  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private notifyRequest(
    projectRoot: string,
    requestId: string,
    sourceRoleId: string,
    title: string,
    event: "created" | "presented" | "resolved",
    detail?: string,
    after?: Promise<unknown>,
  ): Promise<void> {
    return this.cards.notifyRequest(projectRoot, requestId, sourceRoleId, title, event, detail, after);
  }

  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async recordRequestPresented(projectRoot: string, requestId: string, sourceRoleId: string, title: string, to: "customer" | "judge" | "chief", notify = true): Promise<void> {
    return this.cards.recordRequestPresented(projectRoot, requestId, sourceRoleId, title, to, notify);
  }

  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
  private async appointmentWriteApplicationRejection(
    projectRoot: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
  ): Promise<string | undefined> {
    return this.cards.appointmentWriteApplicationRejection(projectRoot, request, metadata);
  }

  /** 薄委托 → `session/cards/acceptance-facts.ts`（JSDoc/方法体见模块）。 */
  private async enrichAcceptanceJudgeContext(
    projectRoot: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    sourceRoleId: string,
  ): Promise<{ metadata: CustomerInputMetadata | undefined; display?: AcceptanceReportDisplayV1 }> {
    return this.acceptanceFacts.enrichAcceptanceJudgeContext(projectRoot, request, metadata, sourceRoleId);
  }

  /** 薄委托 → `session/cards/cards.ts`（JSDoc/方法体见模块）。 */
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
    return this.cards.withRequestLifecycle(projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride, lifecycle);
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

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private versionDecisionSubjectKey(projectRoot: string, subject: VersionDecisionRequestSubject): string {
    return this.versionDecisions.versionDecisionSubjectKey(projectRoot, subject);
  }

  /** 与 A1 `versionDecisionAttempt` 同口径的结构化匹配（runId/flowId 前缀碰撞防护）。 */
  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private isVersionDecisionRequestIdForSubject(requestId: string, subject: VersionDecisionRequestSubject): boolean {
    return this.versionDecisions.isVersionDecisionRequestIdForSubject(requestId, subject);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private findPendingVersionDecision(events: readonly TaskStateEvent[], flowId: string, subject: VersionDecisionRequestSubject): string | undefined {
    return this.versionDecisions.findPendingVersionDecision(events, flowId, subject);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private pendingRequestIdsForFlow(events: readonly TaskStateEvent[], flowId: string): string[] {
    return this.versionDecisions.pendingRequestIdsForFlow(events, flowId);
  }

  /** 薄委托 → `session/cards/acceptance-facts.ts`（JSDoc/方法体见模块）。 */
  private countAcceptanceRejections(events: readonly TaskStateEvent[], flowId: string): number {
    return this.acceptanceFacts.countAcceptanceRejections(events, flowId);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private countPriorVersionDecisions(events: readonly TaskStateEvent[], flowId: string, runId?: string): number {
    return this.versionDecisions.countPriorVersionDecisions(events, flowId, runId);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private buildVersionDecisionFacts(view: ProjectStateView, events: readonly TaskStateEvent[], subject: VersionDecisionRequestSubject): VersionDecisionFacts {
    return this.versionDecisions.buildVersionDecisionFacts(view, events, subject);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private versionDecisionCardLabels(facts: VersionDecisionFacts, flowId: string): VersionDecisionCardLabels {
    return this.versionDecisions.versionDecisionCardLabels(facts, flowId);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private decidedByText(decidedBy: VersionDecisionDecidedBy): string {
    return this.versionDecisions.decidedByText(decidedBy);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private formatTargetVersions(targets: Record<string, number>): string {
    return this.versionDecisions.formatTargetVersions(targets);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private stripVersionDecisionPrefix(text: string): string {
    return this.versionDecisions.stripVersionDecisionPrefix(text);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private nextVersionFlowId(oldFlowId: string, existing: ReadonlySet<string>): string | undefined {
    return this.versionDecisions.nextVersionFlowId(oldFlowId, existing);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private mapVersionDecisionRawOutcome(outcome: CustomerInputOutcome | null | undefined): CustomerInputOutcome | null | undefined {
    return this.versionDecisions.mapVersionDecisionRawOutcome(outcome);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private appendVersionDecisionAudit(projectRoot: string, fields: Omit<VersionDecisionEvent, "v" | "kind" | "at">): Promise<boolean> {
    return this.versionDecisions.appendVersionDecisionAudit(projectRoot, fields);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private async emitVersionDecisionResolved(projectRoot: string, runtime: RuntimeKind, roleId: string, requestId: string, detail: string): Promise<void> {
    return this.versionDecisions.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, detail);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  async requestVersionDecision(input: {
    projectRoot: string;
    roleId: string;
    runtime: RuntimeKind;
    request: VersionDecisionRequest;
    signal?: AbortSignal;
  }): Promise<VersionDecisionResult> {
    return this.versionDecisions.requestVersionDecision(input);
  }

  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private async restoreVersionDecisions(projectRoot: string, state: TaskReplay): Promise<{ reconciled: number; uncertain: number }> {
    return this.versionDecisions.restoreVersionDecisions(projectRoot, state);
  }


  /** 薄委托 → `session/cards/version-decisions.ts`（JSDoc/方法体见模块）。 */
  private async restoreRequestState(
    projectRoot: string,
    state: TaskReplay,
  ): Promise<{ orphaned: number; expired: number }> {
    return this.versionDecisions.restoreRequestState(projectRoot, state);
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

  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private controllerProducerFacts(projectRoot: string, taskId: string, caller: ActualDispatchSource): DesktopControllerStopFact["knownProducers"] | undefined {
    return this.runChange.controllerProducerFacts(projectRoot, taskId, caller);
  }

  /** 薄委托 → `session/run-change.ts`（JSDoc/方法体见模块）。 */
  private async stopExactController(input: TerminateRoleRunInput, caller?: ActualDispatchSource): Promise<TerminateRoleRunResult> {
    return this.runChange.stopExactController(input, caller);
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

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private appTaskClientMessageId(projectRoot: string, roleId: string, runtime: RuntimeKind, text: string): string {
    return this.delivery.appTaskClientMessageId(projectRoot, roleId, runtime, text);
  }

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private appTaskClientMessageIdFromSeed(seed: string): string {
    return this.delivery.appTaskClientMessageIdFromSeed(seed);
  }

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private appDispatchClientMessageId(dedupKey: string): string {
    return this.delivery.appDispatchClientMessageId(dedupKey);
  }

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private rememberAppTaskDelivered(clientMessageId: string | undefined): void {
    this.delivery.rememberAppTaskDelivered(clientMessageId);
  }

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private pendingAppTaskDelivery(
    projectRoot: string,
    targetRoleId: string,
    runtime: RuntimeKind,
    clientMessageId: string,
  ): { queued: boolean; position?: number } | undefined {
    return this.delivery.pendingAppTaskDelivery(projectRoot, targetRoleId, runtime, clientMessageId);
  }

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void {
    this.delivery.enqueueDelivery(projectRoot, targetRoleId, item);
  }

  // —————— 2026-10-20 客户要求：投递队列持久化 + 重启自动续跑（不写项目文件；路径由 Interface 提供） ——————

  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  private persistableDeliveryItem(item: DeliveryItem): PersistedDeliveryItemV1["item"] | undefined {
    return this.delivery.persistableDeliveryItem(item);
  }

  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  private deliveryStoreItems(): PersistedDeliveryItemV1[] {
    return this.delivery.deliveryStoreItems();
  }

  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  private deliveryQueuePersistenceFacts(): DeliveryQueuePersistenceFacts {
    return this.delivery.deliveryQueuePersistenceFacts();
  }

  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  private async finishStopPersistence(result: StopResult): Promise<StopResult> {
    return this.delivery.finishStopPersistence(result);
  }

  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  private persistDeliveryQueues(): void {
    this.delivery.persistDeliveryQueues();
  }

  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  private parsePersistedDeliveryItem(raw: unknown): { projectRoot: string; roleId: string; runtime: RuntimeKind; item: DeliveryItem } | undefined {
    return this.delivery.parsePersistedDeliveryItem(raw);
  }

  /** 薄委托 → `session/delivery/store.ts`（JSDoc/方法体见模块）。 */
  async restorePersistedDeliveries(): Promise<DeliveryQueueRestoreReport> {
    return this.delivery.restorePersistedDeliveries();
  }

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  withdraw(targetInput: string | SessionTarget, id: string): WithdrawResult {
    return this.delivery.withdraw(targetInput, id);
  }

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private notifyRoleState(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): void {
    this.delivery.notifyRoleState(projectRoot, targetRoleId, runtime);
  }

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  broadcastRoleStates(): void {
    this.delivery.broadcastRoleStates();
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
  /** 薄委托 → `session/handback.ts`（JSDoc/方法体见模块）。 */
  private displayHandback(event: HandbackEvent): DesktopOrchestrationEvent {
    return this.handback.displayHandback(event);
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
  /** 薄委托 → `session/handback.ts`（JSDoc/方法体见模块）。 */
  private handbackFlowId(entry: LiveSession, hb: TaskHandback | undefined): string | undefined {
    return this.handback.handbackFlowId(entry, hb);
  }


  /** 薄委托 → `session/handback.ts`（JSDoc/方法体见模块）。 */
  private handleHandback(projectRoot: string, runtime: RuntimeKind, hb: TaskHandback, report?: RuntimeReportSnapshotV1, liveReport?: RuntimeLiveReportViewV1, liveDurability?: 'memory-only' | 'unknown-live', flowId?: string): Promise<boolean> {
    return this.handback.handleHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId);
  }

  /** 薄委托 → `session/handback.ts`（JSDoc/方法体见模块）。 */
  private async commitHandback(projectRoot: string, runtime: RuntimeKind, hb: TaskHandback, report?: RuntimeReportSnapshotV1, liveReport?: RuntimeLiveReportViewV1, liveDurability?: 'memory-only' | 'unknown-live', flowId?: string): Promise<boolean> {
    return this.handback.commitHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId);
  }

  /** 薄委托 → `session/dispatch.ts`（JSDoc/方法体见模块）。 */
  private async routeDispatch(projectRoot: string, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload, source?: ActualDispatchSource): Promise<DispatchReceipt> {
    return this.dispatch.routeDispatch(projectRoot, runtime, fromRoleId, d, source);
  }

  /** 薄委托 → `session/dispatch.ts`（JSDoc/方法体见模块）。 */
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
    return this.dispatch.chainDispatchFacts(projectRoot, flowHint);
  }

  /** 薄委托 → `session/dispatch.ts`（JSDoc/方法体见模块）。 */
  private captureChiefDispatchSource(projectRoot: string, runtime: RuntimeKind, source?: ActualDispatchSource) {
    return this.dispatch.captureChiefDispatchSource(projectRoot, runtime, source);
  }

  /** 薄委托 → `session/dispatch.ts`（JSDoc/方法体见模块）。 */
  private async resumeChiefController(projectRoot: string, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload, source?: ActualDispatchSource): Promise<DispatchReceipt> {
    return this.dispatch.resumeChiefController(projectRoot, runtime, fromRoleId, d, source);
  }

  /** 薄委托 → `session/dispatch.ts`（JSDoc/方法体见模块）。 */
  private async routeStarDispatch(
    projectRoot: string,
    runtime: RuntimeKind,
    fromRoleId: string,
    d: DispatchTaskPayload,
    targetRoleId: string,
    task: string,
    source?: ActualDispatchSource,
  ): Promise<DispatchReceipt> {
    return this.dispatch.routeStarDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source);
  }

  /** 薄委托 → `session/fixed-workflow/route.ts`（JSDoc/方法体见模块）。 */
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
    return this.fixedWorkflowRoute.routeFixedPathDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId);
  }

  // —————————————— T3 B3（2026-11-10 两条固定工作流路径）：fixed 应用接线 ——————————————
  //
  // 依据：v1.3 §4.2 A9/A12、§4.3 路径 B、§5（基线）、§6.4/§8.4（merge-main）、§7.1/§7.4；
  // B3 验收 AC-09/AC-10/AC-11/AC-14/AC-15/AC-16/AC-20/AC-22、T-07/T-10/T-11/T-12。
  // 纪律：桌面只做**应用接线**（可信身份绑定、证据收集、卡通道），业务校验/幂等/账本在编排服务；
  // legacy 分支逐字保留；fixed 失败不产生客户卡（merge-main 除外，按高风险动作出卡）。

  /** 薄委托 → `session/fixed-workflow/cards.ts`（JSDoc/方法体见模块）。 */
  private async completeTeamPlanFixedForHandle(
    projectRoot: string,
    runtime: RuntimeKind,
    handle: RoleSessionHandle | undefined,
    request: Parameters<CompleteTeamPlanFn>[0],
    signal?: AbortSignal,
  ): Promise<CompleteTeamPlanFixedResult> {
    return this.fixedWorkflowCards.completeTeamPlanFixedForHandle(projectRoot, runtime, handle, request, signal);
  }

  /** 薄委托 → `session/fixed-workflow/cards.ts`（JSDoc/方法体见模块）。 */
  private async closeCreatedTaskFixedForSession(
    projectRoot: string,
    actorRoleId: string,
    input: FixedCloseCreatedTaskToolInput,
    signal?: AbortSignal,
  ): Promise<Awaited<ReturnType<typeof closeFixedWorkflowTask>>> {
    return this.fixedWorkflowCards.closeCreatedTaskFixedForSession(projectRoot, actorRoleId, input, signal);
  }

  /** 薄委托 → `session/fixed-workflow/cards.ts`（JSDoc/方法体见模块）。 */
  private async verifyFixedReviewCloseBasis(
    projectRoot: string,
    input: FixedCloseCreatedTaskToolInput,
  ): Promise<{ ok: true } | WorkflowServiceFailure> {
    return this.fixedWorkflowCards.verifyFixedReviewCloseBasis(projectRoot, input);
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

  /** 薄委托 → `session/fixed-workflow/cards.ts`（JSDoc/方法体见模块）。 */
  private async prepareFixedAppointmentCardRequest(
    projectRoot: string,
    flowId: string,
    request: CustomerInputRequest,
  ): Promise<
    | { ok: true; request: CustomerInputRequest; rosterRef: WorkflowDocumentRef }
    | WorkflowServiceFailure
  > {
    return this.fixedWorkflowCards.prepareFixedAppointmentCardRequest(projectRoot, flowId, request);
  }

  /** 薄委托 → `session/fixed-workflow/cards.ts`（JSDoc/方法体见模块）。 */
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
    return this.fixedWorkflowCards.recordFixedCardWorkflowResolution(input);
  }

  /** 路径 B 最小准备（B1/B3 派发前；幂等）：非 B 路径直接放行；已有 basis 记录 ⇒ no-op。 */
  /** 薄委托 → `session/fixed-workflow/route.ts`（JSDoc/方法体见模块）。 */
  private async ensurePathBStartForDispatch(
    projectRoot: string,
    workflowId: string,
    flowId: string,
  ): Promise<{ ok: true } | WorkflowServiceFailure> {
    return this.fixedWorkflowRoute.ensurePathBStartForDispatch(projectRoot, workflowId, flowId);
  }

  /** 薄委托 → `session/fixed-workflow/route.ts`（JSDoc/方法体见模块）。 */
  private async checkPathBWriteSetForDispatch(
    projectRoot: string,
    workflowId: string,
    _flowId: string,
    targetRoleId: string,
    modulePaths: readonly string[] | undefined,
  ): Promise<{ ok: true } | WorkflowServiceFailure> {
    return this.fixedWorkflowRoute.checkPathBWriteSetForDispatch(projectRoot, workflowId, _flowId, targetRoleId, modulePaths);
  }

  /** merge-main 卡呈现（应用自有非判断卡；客户本人；judge 不可代批）。无通道 ⇒ undefined（调用方 fail-closed）。 */
  /** 薄委托 → `session/fixed-workflow/release-merge.ts`（JSDoc/方法体见模块）。 */
  private async presentMergeMainCard(input: {
    projectRoot: string;
    preview: ReleaseMergePreview;
    signal?: AbortSignal;
  }): Promise<CustomerInputOutcome | undefined> {
    return this.fixedWorkflowRelease.presentMergeMainCard(input);
  }

  /** 薄委托 → `session/fixed-workflow/release-merge.ts`（JSDoc/方法体见模块）。 */
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
    return this.fixedWorkflowRelease.runFixedReleaseMerge(input);
  }

  /** 薄委托 → `session/fixed-workflow/release-merge.ts`（JSDoc/方法体见模块）。 */
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
    return this.fixedWorkflowRelease.settleMergeMainCard(input);
  }

  /** 薄委托 → `session/fixed-workflow/release-merge.ts`（JSDoc/方法体见模块）。 */
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
    return this.fixedWorkflowRelease.autoPresentFixedReleaseMerge(input);
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
  /** 薄委托 → `session/fixed-workflow/release-merge.ts`（JSDoc/方法体见模块）。 */
  private noteFixedReleaseAutoTrigger(projectRoot: string, workflowId: string, summary: string): void {
    return this.fixedWorkflowRelease.noteFixedReleaseAutoTrigger(projectRoot, workflowId, summary);
  }

  /** 薄委托 → `session/fixed-workflow/panel.ts`（JSDoc/方法体见模块）。 */
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
    return this.fixedWorkflowPanel.fixedPanelState(projectRoot, flowId);
  }

  /** B1：advisory 摘要（最多 3 条 + 其余计数）；只用人话，技术 code 只进诊断。 */
  /** 薄委托 → `session/fixed-workflow/panel.ts`（JSDoc/方法体见模块）。 */
  private dispatchAdvisorySummary(advisories: readonly DispatchAdvisory[]): string {
    return this.fixedWorkflowPanel.dispatchAdvisorySummary(advisories);
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

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  async redeliverNudge(target: string | SessionTarget, itemId?: string): Promise<RedeliverResult> {
    return this.delivery.redeliverNudge(target, itemId);
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

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private async drainAllQueuesFor(projectRoot: string): Promise<void> {
    return this.delivery.drainAllQueuesFor(projectRoot);
  }

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private async drainPiQueuesAcrossProjects(): Promise<void> {
    return this.delivery.drainPiQueuesAcrossProjects();
  }

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  async waitForRunStopDeliveryClaims(input: { projectRoot: string; taskIds: readonly string[]; signal?: AbortSignal; caller?: ActualDispatchSource }): Promise<{ status: "wait-complete"; count: number } | { status: "blocked"; code: string }> {
    return this.delivery.waitForRunStopDeliveryClaims(input);
  }

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块）。 */
  private async drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void> {
    return this.delivery.drainQueue(projectRoot, targetRoleId, runtime);
  }

  /** 薄委托 → `session/delivery/queue.ts`（JSDoc/方法体见模块；R2 认领段顺序钉在模块内）。 */
  private async drainQueueUnsafe(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind, claim: { taskIds?: readonly string[]; owner?: ActualDispatchSource }): Promise<void> {
    return this.delivery.drainQueueUnsafe(projectRoot, targetRoleId, runtime, claim);
  }
}
