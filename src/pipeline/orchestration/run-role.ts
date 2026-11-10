// src/pipeline/orchestration/run-role.ts
// 编排层：角色会话的编排。
//
// 两条路径：
//  1) runRole —— **一次性**路径：解析 → 建 gate → 建 adapter → bindRole → prompt 一轮 → 收事件。
//     CLI `ans role run` 用它。
//  2) openRoleSession —— **会话句柄式**多轮路径：底层只建**一个** RoleSession，send() 可反复调，
//     事件流持续，生命周期由调用方 dispose() 收口。桌面应用的聊天栏用它。
//
// 分工（契约 §5，F9）：本层只做编排——角色解析、边界解析、路径判定全部经门禁引擎导出的函数；
// 运行时工具与 SDK 调用经 Service 的中立 RuntimeAdapter 接线。
//
// ── 客户确认制收窄（A-3，2026-10-12 设计 A 组）────────────────────────────────────
// `openRoleSession` 收到 `customerInput`（前端给的客户通道）时，本会话进入**确认制**：
//   · 客户被 `request_confirmation` 预览并确认后，编排把「**已预览且校验在会话边界内**的具体路径」
//     发行进本会话的 writeSet（`common/编排/confirmed-writes.ts`）；
//   · 写入照旧经 gate——**F4 拒掉一切未确认路径**（writeSet 外 = 拒）。
//   · 通道**不可用/拒绝/未确认** → 不发行 → 该路径写入被拒（fail-closed）。
//   · **呈现前完整性闸（2026-10-19 真机 op-2）**：写盘类确认卡声明了写入路径时，preview 必须对
//     每一条路径给出可核对正文/结构；不完整 ⇒ **不发卡**、不发行任何路径，`request_confirmation`
//     直接返回失败并列出缺正文的路径（`common/编排/confirmed-writes.ts::validateConfirmPreviewCompleteness`）。
//     非写盘确认（无路径）与选择卡行为不变。
//   · **Section 1 写入预授权（客户 2026-10-25 规则，原文「写自己角色权限内的路径，直接放行。」）**：
//     角色会话**没有任务级 writeSet 收窄**（`scope === undefined`）时，其 Section 1 白名单即初始
//     可写集——内置治理五角色（trio）按注册表 Section 1 条目、项目角色按自己的边界条目（含
//     `docs/workflow.md` 这类精确文件）；写入直接经 gate 放行，不要求逐路径
//     `request_confirmation`。判定仍是同一个 resolveWrite：边界外、禁写路径、跨根/逃逸、F6 接受门
//     与治理写入（角色卡 appointment-write 等，由 trio 能力包装
//     先行判定）逐字不变。有任务 writeSet 时保持 F4 收窄（不并入 Section 1）。
//     见 scopeWithPreauthorizedWrites。
//   · **例外（客户裁定 2026-10-16）**：内置治理角色（su）的**初始** writeSet 恒含 `docs/su/**`、
//     `docs/contracts/**`、`docs/skills/**` 与 `docs/mcp/**`（预授权写目录，不经发行器、随会话初始化
//     计算；见 scopeWithPreauthorizedWrites）——对其余一切路径以上四条逐字适用。su 的卡未声明
//     2026-10-25 预授权规则，故其 Section 1 其余条目仍走确认发行（旧行为逐字不变）。
// 【已登记的残余漏洞：内容漂移】本机制只保证「**路径**已预览且已确认」；「预览内容 ≠ 写出内容」
// 关不住（O-A1 内容比对经客户 2026-10-12 裁定不采纳——如实登记，不实现）。
// 未给 `customerInput` 的会话（无客户通道）保持旧语义：scope 原样传递（可为 undefined = 不收窄）。
//
// ── A-4（同日晚）：收口删除 ─────────────────────────────────────────────────────
// `genesisFinalize`/`operatorChannel`/句柄 `finalize()` 已删——「提议+确认」不再存在；写出的产物由
// **自动收尾**（每轮 su settle 后 `repinIfBootstrapped`，含首次）完成，确认发生在写入**之前**（上节）。
//
// 退出码约定（见 ../../common/编排/exit-codes.ts）：0 = 成功，非 0 = 失败。runRole 以码返回失败；
// openRoleSession 无退出码，失败即**抛错**给调用方。
//
// scope 可选（客户端裁决）：scope === undefined 表示"没有预先存在的任务"（chat / 一次性无收窄），
// 此时**不做任务级收窄**，只用角色边界；编排把 undefined 原样传给 resolveWrite，绝不伪造全量 writeSet。
// （确认制会话例外：其 writeSet 由发行器动态持有；其中 Section 1 预授权/旧 su 预授权目录见上。）

import type { DispatchMatrixMode, GovernanceFunction, GovernanceModel, ProjectConfig, ResolvedRole } from "../../model/role.ts";
import type { BoundaryEntry } from "../../model/boundary.ts";
import { isValidConditionSlug } from "../../model/boundary.ts";
import type { TaskScope, WriteDecision } from "../../model/decision.ts";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
// C 批（方案 §6.4.1/C-06）：appointment-write 预览的 role-card 必填章节单一来源。
import { ROLE_CARD_REQUIRED_SECTIONS, cardKindsOf as governanceCardKindsOf } from "../../common/门禁引擎/governance-roles.ts";
// X-R6（E2 S2）：intent-confirm 卡纯数据（固定选项/分组/代批范围）唯一真源 = chief 角色模块。
// 本文件只消费数据做条件/默认卡判定，不复制第二份卡面数据、不构造卡、不写账本。
import { CHIEF_INTENT_CONFIRM_CARD } from "../../common/roles/chief/index.ts";
import { evaluateShellWriteTargets } from "../../common/门禁引擎/shell-write-guard.ts";
import { loadLatestRoster, nominationD3CardFacts, rosterContainsBuiltInRoleIds, rosterDirectoriesFor, rosterRoleIds, rosterTopologyText, validateAppointmentCardAgainstRoster } from "../../common/编排/workflow-preconditions.ts";
// T3 B3.1（2026-11-10，AC-08/AC-13）：fixed A10 卡在办标记（stage.requested A10）经 fixed 账本公共原语写入。
import { stageRequestIdempotencyKey } from "../../common/编排/workflow-dispatch.ts";
import { canRequestStage, deriveWorkflowView } from "../../common/编排/workflow-state.ts";
// T3 B1（2026-11-10）：fixed per-flow 模式回调输入；会话级常量模式仅单 flow 兼容。类型单源 = workflow-service。
import { readTaskState } from "../../common/编排/task-state.ts";
import type { WorkflowMode } from "../../common/编排/workflow-service.ts";
import {
  activateRoleDocumentsFixed as workflowActivateRoleDocumentsFixed,
  appendWorkflowEvent as workflowAppendEvent,
  closeTask as workflowCloseTask,
  finalizeIntent as workflowFinalizeIntent,
  prepareIntent as workflowPrepareIntent,
  readWorkflowLedger as workflowReadLedger,
  type PreparedFixedIntent,
  type WorkflowServiceFailure,
  type FixedActivateRoleDocumentsDep,
  type FixedActivateRoleDocumentsFn,
  type FixedActivateRoleDocumentsToolInput,
  type FixedCloseCreatedTaskDep,
  type FixedCloseCreatedTaskFn,
  type FixedCloseCreatedTaskToolInput,
} from "../../common/编排/workflow-service.ts";
import { createShellPostAudit } from "../../common/编排/shell-post-audit.ts";
import { buildShellApprovalContext } from "../../common/编排/shell-approval-context.ts";
import {
  stableWriteDecision,
  stableWritePathOf,
  versionedDocExists,
  versionedDocFreezeState,
  versionedDocOverwriteDecision,
} from "../../common/门禁引擎/versioned-doc-guard.ts";
import type { StableWritePermit } from "../../model/version-change.ts";
import {
  builtInRoleModuleOf,
  listProject,
  resolveRole,
  validateRoleToolDeclaration,
  type ProjectListing,
  type ProjectRoleSummary,
  type RoleToolDeclarationValidation,
} from "../../service/role/resolve-role.ts";
import { resolveBoundary, validateBoundaryYamlText, refreshAndInstallVersionedDocFreezeSnapshot, registerVersionedDocument } from "../../service/boundary/resolve-boundary.ts";
import {
  BUILT_IN_GOVERNANCE_ROLES,
  LEGACY_SU_PREAUTHORIZED_DIRS,
  appGovernanceBoundary,
  governanceCapabilitiesOf,
  governanceRoleOf,
  isBuiltInGovernanceRoleId,
  type GovernanceRoleSpec,
} from "../../service/boundary/resolve-boundary.ts";
import { resolveWrite, resolveWriteReadPreflight, resolveWriteFinal, stableWriteDecisionFromFacts } from "../../service/gate/resolve-write.ts";
import { readGitProtectionFacts, checkGitProtectionFactsCurrent, readGitHostProtectionRequirement, beginGitHostAction, endGitHostAction, inspectGitHostCoordinator, executeReadonlyGit, type GitProtectionFacts, type GitHostOpenFailureRef, type GitHostInventory } from "../../provider/trunk/public/trunk-store.ts";
// 2026-11-08（W3b，设计 P1.3 §2.4.3 / I0-4）：只读 Git matcher 经 Service 公共出口**同一函数引用**
// （门禁引擎单一实现；不复制白名单/解析逻辑）。
import { matchReadonlyGit } from "../../service/gate/shell-rules.ts";
import {
  GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS,
  GOVERNANCE_MATRIX_PROMPT_MAX_CHARS,
  GOVERNANCE_MATRIX_TOOL_MAX_CHARS,
  buildGovernanceMatrix,
  renderGovernanceMatrix,
} from "../../service/governance-matrix/public.ts";
import type {
  GovernanceMatrixFn,
  GovernanceMatrixInput,
  MatrixAcceptance,
  MatrixEntryView,
  MatrixIssueInput,
  MatrixRoleDirectories,
  WorkerRoleInput,
} from "../../model/governance-matrix.ts";
import { isChiefDecisionExecutionContext, isRuntimeSessionDrained } from "../../model/runtime.ts";
import type {
  RuntimeReplayEntry,
  RuntimeSessionRecord,
  RuntimeContextSource,
  RuntimeKind,
  FileGateFacts,
  FileGateProtectionFacts,
  WriteGateContext,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  WriteGate,
  ShellGate,
  ShellReviewRequest,
  ShellPostAuditFn,
  ReadonlyGitCapability,
  CustomerInputFn,
  CustomerInputMetadata,
  CustomerInputOutcome,
  CustomerInputRequest,
  GovernanceCardKind,
  DispatchTaskFn,
  DispatchTaskPayload,
  RequestRequirementChangeFn,
  ProjectStateFn,
  ProjectNoteFn,
  RequestVersionDecisionFn,
  ViewImageFn,
  SubmitVersionChangeFn,
  GitQueryFn, GitCandidateFn, GitPublishFn,
  ChiefDecisionExecutionContext,
  DecidePendingRequestFn,
  SelectRunChangeFn,
  CompleteTeamPlanFn,
  ActivateRoleDocumentsFn,
  CloseCreatedTaskFn,
  SubmitRefactorFn,
  RequestStableWriteFn,
  RequestStableWriteInput,
  RoleStatusFn,
  ContractCheckFn,
  DocFormatFn,
  EvidenceCheckFn,
  SessionTailFn,
  RoleActivityLogFn,
  TerminateRoleRunFn,
  RedispatchTaskFn,
  InstallSkillFn,
  UninstallSkillFn,
  InstallMcpFn,
  UninstallMcpFn,
  OperatorChannelFn,
  PromptOptions,
  PromptTurnStartedMetadata,
  ReportHandbackFn,
  ReportHandbackMetadata,
  ReportHandbackReceipt,
  ReportSaveResultV1,
  ReportSaveStateV1,
  DeliverySaveResultV1,
  DeliveryReceiptQueryV1,
  RuntimePersistenceChangeV1,
  BackgroundTaskSnapshot,
  BackgroundTaskReadOptions,
  BackgroundTaskReadResult,
  BackgroundTaskStopOptions,
  BackgroundTaskStopResult,
  RuntimeLiveReportDraftV1,
  RuntimeLegacyHistoryEntryV1,
  RuntimeLegacyHistoryProjectionV1,
  ShellJudgeToolOptions,
  GovernanceJudgeContext,
  GovernanceJudgeToolOptions,
  RequestResolvedEvent,
  WorkflowEvent,
  ShellEscalationFn,
  ShellEscalationPresentFn,
} from "../../model/runtime.ts";
import { GOVERNANCE_SLUG_PATTERN, WORKFLOW_LEDGER_SCHEMA, governanceCardGroup } from "../../model/runtime.ts";
import { createRuntimeAdapter, createBlockedRoleCapabilityCallbacks, isRuntimeEditReadProbe, inspectRuntimeFileGateContext, projectRuntimeLiveHandback, projectRuntimeLegacyHistory, inspectRuntimeConstructionFailure, recheckRuntimeConstructionFailure, discardRuntimeRolePreparation, inspectRuntimeCoreRegistry, type RuntimeSessionOptions } from "../../service/runtime/session.ts";
import { createTrunkService, type DecisionEvidenceInput, type PreparedIntentConfirmation } from "../../service/trunk/public/trunk-service.ts";
import { RUNTIME_KINDS } from "../../common/shared/runtime-shared.ts";
import {
  assembleProjectShellGate,
  assembleReadonlyShellGate,
  assembleOperatorShellGate,
  type AssembleShellGateOptions,
  type AssembleReadonlyShellGateOptions,
  type AssembleOperatorShellGateOptions,
  type RoutineShellPolicy,
  type ShellEscalationWiring,
  type ShellDirectiveWiring,
} from "./shell-arming.ts";
// 2026-11-03（客户授权平面 B1）：Pipeline 公共句柄（类型只读；运行期实例由桌面/测试注入）。
import type { CustomerDirectiveRuntime } from "./customer-directive.ts";
// 2026-10-31（shell 判拒升级方案 v1.3 §6.1）：每会话升级 registry（判拒台账/资格/状态机/授权/审计）。
import {
  createShellEscalationSession,
  shellEscalationDisabled,
  type ShellEscalationRuntimeOptions,
  type ShellEscalationSession,
} from "../../common/编排/shell-escalation.ts";
import { formatEvent } from "../../common/编排/output.ts";
import { withHandback, type OrchestrationEvent, type TaskReport, type HandbackIntent, type HandbackEvent, normalizeTaskReport } from "../../common/编排/handback.ts";
import { EXIT_OK, EXIT_USAGE, EXIT_FAILURE } from "../../common/编排/exit-codes.ts";
import type { ShellVerdictFn } from "../../common/编排/shell-gate.ts";
import { repinIfBootstrapped, DEFAULT_GOVERNANCE_BOUNDARY_REL } from "../../common/编排/finalize.ts";
import { conditionSlugsOf, declaredPathBodies, createConfirmedWriteIssuer, explicitConfirmPaths, validateConfirmPreviewCompleteness } from "../../common/编排/confirmed-writes.ts";
import {
  DECISION_CARD_MIN_OPTIONS,
  validateDecisionCardRequest,
  type DecisionCardValidation,
} from "../../common/编排/decision-card.ts";
import {
  buildGovernanceJudgeFacts,
  declaredWritePathsFromPreview,
  parseRecommendedRoleIds,
} from "../../common/编排/governance-judge-facts.ts";
import { boundedGovernanceJudgeAudit } from "../../common/编排/governance-judge-verdict.ts";
import { CLI_POSITIONING } from "../../common/编排/cli-positioning.ts";
// 2026-10-26 decision 卡结构校验：**单一共享实现**在 `common/编排/decision-card.ts`；
// 经本 Pipeline 公共出口供桌面窗口后续复用（桌面不得再复制第二份校验）。
export {
  DECISION_CARD_MIN_OPTIONS,
  validateDecisionCardRequest,
} from "../../common/编排/decision-card.ts";
export type {
  DecisionCardRejectReason,
  DecisionCardValidation,
} from "../../common/编排/decision-card.ts";
import { createDiagnosticLogger, type DiagnosticLogger } from "../../common/shared/diagnostics.ts";
import { readIntentEntryFacts, resolveIntentEntryReference } from "../../common/shared/intent-entry-contract.ts";
// 跨角色共享路径原语（**单一来源** = pm 属主 `src/common/shared/path-primitives.ts`；工程法案 §一.5
// 消费方名单已含编排；同 `confirmed-writes.ts` 先例）——用于 su 预授权目录的**词法**归属判定：
// 与 resolveWrite 同源取值规则，不从门禁引擎私有 common 另行导入/复制。
import { absRel, compareKey, isAbsoluteAny, isUnderOrEqual, normalizeLexical } from "../../common/shared/path-primitives.ts";
import type { RequestDownloadFn } from "../../model/download.ts";

/**
 * **适配器能力面**：编排构造、随 `deps.createAdapter(gate, capabilities)` 交给适配器工厂——
 * 适配器把其中的能力注册为对应工具（「注入才注册」先例），或按其选项接线。三项：
 * · `customerInput`（A-3 客户确认制交互；未注入 ⇒ `request_confirmation`/`request_choice` 不注册）。
 * · `viewImage`（2026-10-26 图片查看；未注入 ⇒ `view_image` 不注册）——**通用只读能力**：项目角色与
 *   内置治理角色在调用方提供时**都注入**（不按角色收窄）。形状单一来源＝契约家 `model/runtime.ts`
 *   （`ViewImageFn`）；工具读取项目内图片并把图片排队为**同一角色下一轮用户提示的图片附件**（两轮
 *   附件设计，本轮工具结果只回「已排队」）。不写盘、不联网、不改变任何写权，也**不改变其他能力的
 *   注入矩阵**（与 `requestAcceptance`/`requestGateReview` 等互不隐含）。
 * · `reportHandback`（C-1 交报告；未注入 ⇒ `submit_report` 不注册）——**只给项目角色会话**注入
 *   （治理角色 su 不自我回交，不注入）。能力形状 = `submit_report{ status, summary, evidence? }`
 *   的载荷（结构对齐，见 `common/编排/handback.ts::TaskReport`）。
 * · `sessionDir`（D-1 重启恢复）：本会话的**会话自持目录**，约定路径
 *   `<projectRoot>/.ans/sessions/<roleId>/<runtime>/`（带尾分隔符；旧未显式 runtime 的替身保留旧路径）。**编排只算路径、不预建目录**——
 *   **目录的创建归适配器**（在其真正落盘 SessionManager.create/open 时做）：① 保「不预建 `.ans`」
 *   的既有语义/断言（每次 `ans govern` 都预建 `.ans/sessions/` 会打破它）；② 谁落盘谁建目录，
 *   避免「编排建了目录但会话从未写」的空目录；③ 恢复 `open(path)` 不需要预建。
 *   projectRoot 为空 / roleId 不安全（空、含路径分隔符或 `..`）→ **不传**（旧行为，无持久化）。
 *   注：一次性路径 `runRole`（`ans role run`）不传（一局即止，无需恢复）。
 * · `dispatchTask`（H-1 su 派发任务；未注入 ⇒ `dispatch_task` 不注册）——**只给治理角色 su**注入
 *   （项目角色不给）。形状 = 契约家 `DispatchTaskFn`（前端路由：开/排队/去重/失败保留归前端；
 *   **派发 ≠ 授权**——能力实现方不得据此授予任何写权）。
 * · `handOffIntent` / `requestClarification`（W6-A 意图交接/澄清；未注入 ⇒ 对应工具不注册）——
 *   **只给** Liaison / Rapporteur（能力矩阵 `handOffIntent`/`requestClarification`）。编排先做文件/
 *   去重/每轮一次/两轮澄清上限与账本；能力实现方只负责投递/呈现。**交接 ≠ 客户批准；澄清 ≠ 客户已回答**。
 * · `requestRequirementChange`（2026-10-26 需求变更申请 `request_requirement_change`；未注入 ⇒ 工具不
 *   注册）——**只给内置治理角色中的报告员 Rapporteur 与统筹 Convener**（2026-10-26 客户纠正/补充；
 *   其他内置角色与项目角色不注入）；意图校验/去重/派发/账本/系统行由应用能力实现，编排**纯透传**。
 *   **提交申请 ≠ 客户批准，也不代表意图已变更**——需求变更审批卡由统筹或报告员发起、发起方不得自批，
 *   审批人只有判断 agent/客户；主理不审批、只在批准后执行意图变更；提案卡不得承载未批准的新授权。
 * · `shellGate`（I-1 开放 shell + 审批档/只读档；未注入 ⇒ `run_shell` 不注册）——**项目角色**经三层链注入
 *   （`openRoleSession` 收到 `shellOperatorChannel` 时经 `assembleProjectShellGate` 装配）；**内置治理角色**
 *   （客户 2026-10-19 新规则：五个角色＋su 的能力位统一 `shell: "operator-approve"`）经 **审批档**
 *   （`shellOperatorOnly`：只读白名单免审批、其余含 deny 逐条客户/判断 agent 批准；经
 *   `assembleOperatorShellGate` 装配）注入；旧**只读档**（`shellReadonly`）仅保留为兼容路径。
 *   比工厂第二参优先（`capabilities?.shellGate ?? shellGate`）。
 * · `shellVerdict`（R-1 shell 审读结论工具；未注入 ⇒ `report_shell_verdict` 不注册）——**审读会话专用**
 *   （由 `pm-reviewer` 注入；形状单一来源 `common/编排/shell-gate.ts`）。
 * · `roleStatus` / `sessionTail` / `proposeRecovery`（G-2 看护三工具；未注入 ⇒ 对应工具不注册）——
 *   **只给治理角色 su**注入（判据复用内置治理角色先例 `suppressHandback`，同 `dispatchTask`）。
 *   载荷/回执形状的单一来源＝契约家 `model/runtime.ts`（R1/R2 属主，同 `DispatchTaskFn` 先例；
 *   文案契约在 `common/编排/watchdog.ts`）。**提议 ≠ 执行**：三能力不得授予或改变任何写权；
 *   `role_status`/`session_tail` 纯读。
 * · `installSkill` / `uninstallSkill`（G-4 I1/I2 技能安装两工具；未注入 ⇒ 对应工具不注册）——
 *   **只给治理角色 su**注入（判据复用 `suppressHandback`，同 `dispatchTask`/看护三能力）。
 *   形状单一来源＝契约家 `model/runtime.ts`（`InstallSkillFn`/`UninstallSkillFn`/`InstallSkillReceipt`）。
 *   **安装 ≠ 授权**：工具自己不写盘，能力只做校验/激活/回执；不得据此授予或改变任何写权。
 * · `installMcp` / `uninstallMcp`（G-4 V2 MCP 安装两工具；未注入 ⇒ 对应工具不注册）——
 *   **只给治理角色 su**注入（判据复用 `suppressHandback`，同技能两能力）。
 *   形状单一来源＝契约家 `model/runtime.ts`（`InstallMcpFn`/`UninstallMcpFn`/`InstallMcpReceipt`）。
 *   **能力级授予诚实面**：外来 MCP 工具在 ANS 门禁之外执行——回执/文案不得宣称逐调用受审；
 *   **安装 ≠ 授权**：工具自己不写盘，能力只做校验/激活/回执；不得据此授予或改变任何写权。
 */
export interface AdapterCapabilities {
  protectedGitRoots?: readonly string[];
  fileGateProtocol?: "host-facts-v1";
  fileGateProtection?: FileGateProtectionFacts;
  customerInput?: CustomerInputFn;
  reportHandback?: ReportHandbackFn;
  sessionDir?: string;
  runtime?: RuntimeKind;
  persistSession?: boolean;
  /**
   * 图片查看能力（`view_image`「注入才注册」，2026-10-26 客户要求；两轮附件设计）——**通用只读能力**：
   * 项目角色与内置治理角色在调用方提供时**都注入**（不按角色收窄；与只给 su 的安装/看护类能力不同）。
   * 形状单一来源＝契约家 `model/runtime.ts`（`ViewImageFn`/`ViewImageInput`/`PromptImage`）。工具读取
   * 项目内图片（路径/类型/≤10 MB 校验在工具层）并调用本能力把图片排队为**同一角色下一轮用户提示的
   * 图片附件**；本轮工具结果只说明「已排队」。未提供 ⇒ 不注入（运行时核心据此不注册工具，结构性
   * fail-closed）。本能力不写盘、不联网、不改变任何写权，也**不改变其他能力的注入矩阵**。
   */
  viewImage?: ViewImageFn;
  dispatchTask?: DispatchTaskFn;
  /**
   * 需求变更申请能力（`request_requirement_change`「注入才注册」，2026-10-26 客户要求 + 同日纠正/补充）。
   * **只给内置治理角色中的报告员 Rapporteur 与统筹 Convener 注入**（其他内置治理角色、single 的 su 与
   * 项目角色即便调用方误给也不注入，工具不注册，结构性 fail-closed）。形状单一来源＝契约家
   * `model/runtime.ts`（`RequestRequirementChangeFn`/`RequestRequirementChangeInput`/
   * `RequestRequirementChangeResult`）。意图校验/去重/派发/账本/系统行由能力实现，本层**纯透传**。
   * **提交申请 ≠ 客户批准，也不代表意图已变更**；需求变更审批卡由统筹或提案角色发起，发起方不得自批，
   * 审批人只有独立判断 agent（「替我决策」开启时）或客户；主理不审批、只在批准后执行意图变更；
   * 提案卡不得承载未批准的新授权，也不得删除需求绕过。
   */
  requestRequirementChange?: RequestRequirementChangeFn;
  /**
   * 2026-11-04 下载申请（`request_download`「注入才注册」；方案 P1.1 §3.1.1 W-1）。
   * 与 `customerInput` 独立的能力位：未注入 ⇒ 工具不注册（能力缺席 = 最强 fail-closed）；
   * CLI 与判断会话结构性不注入。桌面 C1 把下载能力实现交给本字段，本层纯透传。
   * 形状单一来源＝`model/download.ts`（`RequestDownloadFn`）。
   */
  requestDownload?: RequestDownloadFn;
  /**
   * 2026-11-02（全局任务状态，A1）：`project_state` 只读能力（注入了才注册）。
   * 注入面：全部内置治理角色（chief 完整、其余按会话角色裁剪；含旧 su 只读）；项目 worker 不注入。
   */
  projectState?: ProjectStateFn;
  /** 2026-11-02：`project_note` 受控备注能力；**只给 trio chief** 注入，未注入 ⇒ 工具不注册。 */
  projectNote?: ProjectNoteFn;
  /** 2026-11-02：`request_version_decision` 能力；**只给 trio chief** 注入，未注入 ⇒ 工具不注册。 */
  requestVersionDecision?: RequestVersionDecisionFn;
  /**
   * Batch 3.5（C1d/S5）：三提交能力——`openRoleSession` 按角色门控后转交适配器（注入才注册）：
   * · `submitVersionChange`：仅 product（version-upgrade）/ rapporteur（detail-amendment）；
   * · `submitRefactor` / `requestStableWrite`：仅 convener。
   * 工具只提交、绝不批准/发卡/签发许可（客户主权）。
   */
  chiefDecisionContext?: ChiefDecisionExecutionContext;
  decidePendingRequest?: DecidePendingRequestFn;
  submitVersionChange?: SubmitVersionChangeFn;
  selectRunChange?: SelectRunChangeFn;
  completeTeamPlan?: CompleteTeamPlanFn;
  activateRoleDocuments?: ActivateRoleDocumentsFn;
  closeCreatedTask?: CloseCreatedTaskFn;
  /**
   * T3 B2（MF-IR-2/3）：fixed `close_created_task`/`activate_role_documents` v2 工具依赖。
   * **仅 fixed 会话注入**（legacy 会话字段缺席 = 结构性不可达；legacy `closeCreatedTask`/
   * `activateRoleDocuments` 字段语义/注入面逐字不变）。身份与项目根已由 `openRoleSession` 以
   * 会话解析结果绑定；运行时核心 B2 handler 只传模型可见字段（fixed close
   * `{operationId,taskId,outcome,note?}`；fixed activate `{operationId,flowId,workflowId,
   * proposalDecisionId,targetRoleId,roster,documents}`）。实现 = `workflowService.closeTask` /
   * `workflowService.activateRoleDocumentsFixed`（或调用方注入的应用实现，可补 evidence）。
   */
  closeCreatedTaskFixed?: FixedCloseCreatedTaskFn;
  activateRoleDocumentsFixed?: FixedActivateRoleDocumentsFn;
  gitQuery?: GitQueryFn;
  gitCandidate?: GitCandidateFn;
  gitPublish?: GitPublishFn;
  /** Ordinary host data for the current real D3-selected draft paths; never model arguments. */
  roleDraftWritePaths?: readonly string[];
  submitRefactor?: SubmitRefactorFn;
  requestStableWrite?: RequestStableWriteFn;
  /**
   * 治理权力矩阵（governance-authority-matrix，C2/C3）：`governance_matrix` 工具能力位。
   * **注入才注册**——仅 trio 六个内置治理角色（`openRoleSession` 内门控）；worker、`su`、
   * 判断会话、single 旧模型与 `runRole` 一次性 CLI 均不注入（工具不存在）。
   * 类型单一来源＝`src/model/governance-matrix.ts`（C1a 冻结）；本层只透传，不组装、不判定。
   */
  governanceMatrix?: GovernanceMatrixFn;
  /**
   * 治理权力矩阵（C3）：幕僚会话启动快照的**纯展示文本段**（当前仅 chief 非空、单段）。
   * 经 C2 `RuntimeProviderOptions.contextSections` 交给适配器；非 chief 会话字段缺席（不传
   * 空数组/空串元素）。不是能力、不是工具、不是判定输入；空/缺省 ⇒ 系统提示逐字不变。
   */
  contextSections?: readonly string[];
  shellGate?: ShellGate;
  /** 2026-10-29（§6.5）：run_shell 执行后写审计（与 shellGate 同注入；缺省不审计）。 */
  shellPostAudit?: ShellPostAuditFn;
  /**
   * 2026-11-08（W3b，设计 P1.3 §2.4.3 / I0-4）：只读 Git 固定传输能力
   * （运行时核心 `GovernedToolsOptions.readonlyGit` 同名能力位）。由 `openRoleSession` 从
   * `matchReadonlyGit`（Service 公共出口同一函数引用）+ trunk `executeReadonlyGit` 构造；
   * `run_shell` 在 gate 放行后对 `git` 只能经本能力执行（无能力/未命中 ⇒ `readonly-git-runner-unavailable`，
   * 绝不回退通用 spawn）。桌面路径经同一工厂/选项透传。
   */
  readonlyGit?: ReadonlyGitCapability;
  /**
   * 会话角色 id（2026-11-08 加法）：随适配器 capabilities 交给自定义工厂；官方工厂由 Service 按
   * `role.id` 注入工具 options（`GovernedToolsOptions.roleId`），不采用调用方值。仅用于审计/展示关联。
   */
  roleId?: string;
  shellVerdict?: ShellVerdictFn;
  /**
   * 2026-10-31（shell 判拒升级方案 v1.3 §6.1/§6.4）：`request_shell_escalation` 工具能力
   * （运行时核心 `GovernedToolsOptions.shellEscalation` 同名能力位）。**只在 shell 已 arm
   * （`shellGate` 注入）且升级通道未关闭（`ANS_SHELL_ESCALATION_DISABLED !== "1"`）时**由
   * `openRoleSession` 注入；未注入 ⇒ 工具不注册（能力缺席 = 最强 fail-closed）。
   * 工具只发起申请：不执行命令、不写盘、不创建/消费授权（授权只由客户卡回包后由编排 registry 创建）。
   */
  shellEscalation?: ShellEscalationFn;
  roleStatus?: RoleStatusFn;
  contractCheck?: ContractCheckFn;
  /**
   * 2026-11-09（文档格式权威说明，方案 P1.2 §4.1/§14 G1）：`doc_format` 只读数据源能力位
   * （与 `contractCheck` 相邻、加法可选；形状单一来源＝契约家 `model/runtime.ts` `DocFormatFn`）。
   * **只读、注入才注册、不构成放行/授权**：未注入 ⇒ 工具不存在、既有行为逐字不变；本层纯透传。
   */
  docFormat?: DocFormatFn;
  evidenceCheck?: EvidenceCheckFn;
  sessionTail?: SessionTailFn;
  /** B 批（2026-10-28）：`role_activity_log` 数据源；只给幕僚（trio chief）注入。 */
  roleActivityLog?: RoleActivityLogFn;
  /** B 批：终止动作；只给幕僚注入。 */
  terminateRoleRun?: TerminateRoleRunFn;
  /** B 批：安全重派动作；只给幕僚注入。 */
  redispatchTask?: RedispatchTaskFn;
  installSkill?: InstallSkillFn;
  uninstallSkill?: UninstallSkillFn;
  installMcp?: InstallMcpFn;
  uninstallMcp?: UninstallMcpFn;
  /**
   * 判断 agent（「替我审」）只读能力（2026-10-17 PM 评审 §6.1/§6.3）。**能力注入，不是工具注入**：
   * 给出时运行时核心走 `buildShellJudgeTools`（恰 `judge_read_file`/`judge_list_dir`/
   * `report_shell_judgement`），**不得**走 `buildGovernedTools`；`judgeMode:true` 与
   * `installedMcpServers:[]` 由 Service 自动置位。形状单一来源＝`model/runtime.ts`。
   * 只由编排的 `createShellJudge` 经 `createAdapter(gate, {persistSession:false, shellJudge})` 注入；
   * 普通角色会话不传（未注入 ⇒ 工具不注册）。
   */
  shellJudge?: ShellJudgeToolOptions;
  /**
   * 治理卡判断 agent（「替我审批」/「替我决策」）只读能力（2026-10-18 双开关评审 §7.1/§6.2）。
   * 与 `shellJudge` 同形的**能力注入**：只由编排 `createGovernanceJudge` 经
   * `createAdapter(gate, {persistSession:false, governanceJudge})` 注入；普通角色会话不传
   * （未注入 ⇒ 对应工具不注册，逐字现状）。运行时核心据此走 `buildGovernanceJudgeTools`。
   */
  governanceJudge?: GovernanceJudgeToolOptions;
}

export interface RunRoleInput {
  roleId: string;
  runtime?: RuntimeKind;
  taskId: string;
  project: ProjectConfig;
  scope?: TaskScope;
}

export interface RunRoleResult {
  code: number;
  transcript: SessionEvent[];
}

export async function runRole(
  input: RunRoleInput,
  deps: RoleSessionDeps = {}
): Promise<RunRoleResult> {
  const transcript: SessionEvent[] = [];
  const record = (ev: SessionEvent): void => {
    transcript.push(ev);
    console.log(formatEvent(ev));
  };
  // 失败路径统一出口：写 stderr（可读原因）+ 记入 transcript，返回非 0 码。
  // 注：SessionEvent.kind 是契约 §4 冻结联合（无 "error"），故 transcript 里用 "message" 承载失败说明。
  const fail = (code: number, reason: string): RunRoleResult => {
    process.stderr.write(`ans role run 失败：${reason}\n`);
    transcript.push({ kind: "message", summary: `失败：${reason}` });
    return { code, transcript };
  };

  // 角色/边界解析（未知角色、parseError 等失败由 setupRole 归类）。
  // 一次性 CLI 路径：**不允许**内置治理角色——只接受 project.roles 登记的项目角色。
  const setup = await setupRole(input.roleId, input.project, { allowBuiltInRoles: false });
  if (!setup.ok) return fail(setup.code, setup.reason);
  const role = setup.role;

  // gate：照抄契约 §5 的构造，绑定 resolveWrite；scope 可能为 undefined（无任务收窄）。
  const protectedGit = await readGitProtectionFacts(input.project.projectRoot);
  const fileProtectionScope = await readGitHostProtectionRequirement({ projectRoot: input.project.projectRoot });
  const legacyGate = buildGate(role, input.project, input.scope, protectedGit.protectedGitRoots);
  const managedBoundary = structuredClone(role.boundary), managedScope = input.scope && structuredClone(input.scope);
  const gate: WriteGate = fileProtectionScope.state === "unmanaged" ? legacyGate : (p, context) => {
    const facts = verifiedFileFacts(context, p, input.project, protectedGit);
    if (!facts) return fileFactsDenied();
    const decision = facts.stage === "final-write" ? resolveWriteFinal(p, managedBoundary, managedScope, facts)
      : resolveWriteReadPreflight(p, managedBoundary, managedScope, facts);
    if (!decision.allowed || facts.stage !== "final-write") return decision;
    const rel = projectRelativeLexical(p, input.project.projectRoot);
    if (rel !== undefined && stableWritePathOf(rel)) {
      const stable = stableWriteDecisionFromFacts({ projectRoot: input.project.projectRoot, relPath: rel, sha256: facts.contentSha256, currentFile: facts.currentFile });
      if (!stable.allowed) return stable.writeDecision;
    }
    return versionedFileDecision(input.project.projectRoot, p, facts) ?? decision;
  };

  record({
    kind: "message",
    summary: `已解析角色 ${role.id}（kind=${role.kind}），角色卡：${role.location.card}`,
  });
  record({
    kind: "message",
    summary: `已解析边界，来源：${role.boundary.boundarySource}；acceptance=${
      role.boundary.acceptance.accepted ? "accepted" : "rejected"
    }（来源：${role.boundary.acceptance.source || "缺"}）`,
  });
  record({
    kind: "message",
    summary:
      `受治理工具集已建立：write_file / edit_file 在写入前经 gate 校验；任务 ${input.taskId} ` +
      (input.scope ? `写集 ${input.scope.writeSet.length} 项` : "未声明 scope（仅按角色边界，不做任务收窄）"),
  });
  // P1-4 产品定位指路（桌面体验提案，2026-10-13 客户批准）：一次性 CLI 会话启动时如实告知能力面——
  // 轻量一行、每次会话至多一次；不改变任何能力与判定（shell 本就不 arm、会话本就不持久）。
  // 句子的单一来源见 common/编排/cli-positioning.ts（帮助输出共用同一句，防漂移）。
  record({ kind: "message", summary: CLI_POSITIONING });

  let code: number = EXIT_OK;
  let session: RoleSession | undefined;
  try {
    const createAdapter = deps.createAdapter ?? createRuntimeAdapterFactory(input.project, input.runtime ?? "demo", deps.runtimeOptions);
    if (deps.createAdapter && !officialCoreAdapterFactories.has(deps.createAdapter)) unmanagedFactoryAttempts.push({ projectRoot: input.project.projectRoot, roleId: role.id, runtime: input.runtime ?? "demo", reason: "unverified-one-shot-adapter-factory" });
    const adapter = createAdapter(gate, { protectedGitRoots: protectedGit.protectedGitRoots,
      ...(fileProtectionScope.state !== "unmanaged" ? { fileGateProtocol: "host-facts-v1" as const, fileGateProtection: protectedGit } : {}) });
    session = await bindPreparedRuntimeRole(adapter, role, input.project.projectRoot);
    await session.prompt(buildTaskPrompt(input.taskId, input.scope));
    // 事件流以 "settled" 为**终止信号**：见到即停并退出循环。
    // 关键：真实 Pi 适配器的 events() 只有在 dispose() 时才 close 队列；若在此等到流自然结束，
    // 会与随后的 dispose() 互等（死锁）——那样 main() 永不 resolve（顶层 await 不收敛）。
    for await (const ev of session.events()) {
      record(ev);
      if (ev.kind === "settled") {
        if (isFailedSettlement(ev)) code = EXIT_FAILURE;
        break;
      }
    }
  } catch (err) {
    // 会话建立（bindRole）或会话中途出错 → 非 0。
    code = EXIT_FAILURE;
    process.stderr.write(`ans role run 会话失败：${errText(err)}\n`);
    transcript.push({ kind: "message", summary: `会话异常：${errText(err)}` });
  } finally {
    // 无论成功、失败还是异常，都必须释放会话（try/finally 保证）。
    if (session) {
      try {
        await session.dispose();
      } catch (err) {
        // dispose 出错**如实报**，但不掩盖原始结果：仅在原本成功时把结果翻成失败。
        process.stderr.write(`ans role run 释放会话失败：${errText(err)}\n`);
        transcript.push({ kind: "message", summary: `释放会话失败：${errText(err)}` });
        if (code === EXIT_OK) code = EXIT_FAILURE;
      }
    }
  }

  return { code, transcript };
}

// —————————————————————— 会话句柄式（多轮）接口 ——————————————————————
// 冻结签名（桌面应用照此编写）。

/**
 * `RoleSessionHandle.abort()` 的结果（产品提案 P0-2「停当前轮次」，2026-10-13 客户批准）。
 * 三态**语义钉死**：
 * - `{ ok:true, supported:true }` —— 已向底层会话请求停止当前轮次（轮次以 `settled` 正常收尾）；
 * - `{ ok:false, supported:false, error }` —— 底层会话**不带 abort**（如 demo 替身/假适配器）：
 *   **该运行时不支持停止**，`error` 承载如实文案「当前运行时不支持停止」——绝不假装已停；
 * - `{ ok:false, supported:true, error }` —— 底层会话有 abort 但 SDK 报错：错误原文（`errText`）
 *   如实放入 `error`，不吞、不谎报已停。
 * `error` 统一承载 `ok:false` 时给人看的如实原因；`supported` 告知「该运行时有没有停止能力」。
 */
export interface RoleSessionAbortResult {
  ok: boolean;
  supported: boolean;
  error?: string;
}

/**
 * **F-5-opt1 推荐注记文案**（2026-10-16 客户批准；会话因边界更新重建后写权清零的**如实告知**，
 * **单一来源**）——由重建路径（桌面窗口 O-1）经 `RoleSessionHandle.queueModelNotice` 排入模型可见输入。
 * 措辞要点：以 `【系统通知·会话重建】` 标记开头——这是**系统注入的 notice，不是角色/客户发言**
 * （2026-10-19 客户反馈「这个应该加一个标记啊，不然谁知道啊」），避免模型把它误当用户消息；
 * 如实说明「重建」与「写权不自动保留」，指向**可行恢复路径**（`request_confirmation`）；
 * **不夹带任何授权语义**（不是授权、不承诺放行——写入仍须逐条确认后发行）。
 */
export const REBUILT_SESSION_WRITE_PERMITS_NOTICE =
  "【系统通知·会话重建】此前经确认发行的写权不会自动保留，如需写入请重新经 request_confirmation 确认。";

/** Pipeline-only prompt intent; never forwarded as a Runtime option or write authorization. */
export interface RoleSessionSendOptions extends PromptOptions {
  handback?: HandbackIntent;
}

export interface RoleSessionHandle {
  readonly sessionId?: RoleSession["sessionId"];
  inspectLifecycle?: RoleSession["inspectLifecycle"];
  inspectToolSurface?: RoleSession["inspectToolSurface"];
  stopAndInspect?: RoleSession["stopAndInspect"];
  readonly persistenceMode?: "enabled" | "disabled" | "unknown-live";
  retryReportPersistence?(reportId: string): Promise<ReportSaveResultV1>;
  getReportPersistence?(reportId: string): Promise<ReportSaveStateV1>;
  retryDeliveryHistoryPersistence?(attemptId: string): Promise<DeliverySaveResultV1>;
  getDeliveryReceipt?(attemptId: string): Promise<DeliveryReceiptQueryV1>;
  onPersistenceChange?(listener: (change: RuntimePersistenceChangeV1) => void): () => void;
  readonly runtime?: RuntimeKind;
  readonly roleId?: string;
  readonly contextSource?: RuntimeContextSource;
  readonly nativeSessionId?: string;
  readonly contextWarning?: string;
  /**
   * 发送一轮输入；可反复调用（底层同一会话，不重建）。
   * handback.required:true 标明任务，false 标明聊天并覆盖会话 taskId；缺省沿用明确的会话 taskId。
   * 真实运行时通过 Core 同步开轮 ACK 绑定本轮来源，组合并恰一次转达调用方的 ACK 回调。
   * handback 只由编排消费，不传给 Runtime；images 数组保持原引用。
   * 未标记且没有 ACK 的旧替身保留原 options 引用与单参数调用路径。
   */
  send(text: string, opts?: RoleSessionSendOptions): Promise<void>;
  /**
   * **停当前轮次（产品提案 P0-2「跑飞轮次的停」，2026-10-13 客户批准）**：向底层会话请求**中止当前
   * 进行中的 prompt 轮次**（模型生成与工具执行一并停）。契约来源 = `RoleSession.abort?`
   * （`src/model/runtime.ts`，**可选方法**；真适配器实现 = Pi SDK `session.abort()`，
   * 见 `src/common/pi-adapter/real-adapter.ts` 的 `makeRoleSession`）。
   *
   * **语义（钉死）**：
   * - **不销毁会话**——abort 后本句柄仍可继续 `send`（历史与模型上下文保留）；与 `dispose`（收口整只
   *   会话）不同；
   * - **无在飞轮次 = no-op**（底层不抛错、无副作用）；
   * - **中止后 `settled` 仍发射**——轮次以 `settled` 正常收尾，消费方不会挂起；
   * - **等待中的客户确认一并 fail-closed**（中止该轮 run 的 AbortSignal，交互工具按「未获同意」返回）；
   * - **三态如实返回**（形状见 `RoleSessionAbortResult`）：会话**不带 abort**（如 demo 替身）⇒
   *   `{ ok:false, supported:false, error:"当前运行时不支持停止" }`——**绝不假装已停**；SDK 报错 ⇒
   *   `{ ok:false, supported:true, error:<错误原文> }`——如实上抛为结果，不吞。
   * 桌面「停止」入口（何时出现按钮、点击后聊天流的如实一行）为**后环**（桌面环节）。
   *
   * **可选方法（契约演进，同契约 `RoleSession.abort?` 的「PromptOptions 先例」）**：既有替身
   * **不实现它也完全合法**；消费方以 `handle.abort?.()` 调用——**方法缺席**（旧替身）与返回
   * `supported:false` 同一处理：如实告知「当前运行时不支持停止」，绝不假装已停。
   * **`openRoleSession` 返回的句柄恒实现本方法**（三态结果即真实回答，缺席只出现在替身）。
   */
  abort?(): Promise<RoleSessionAbortResult>;
  /**
   * **F-5-opt1（编排侧）：向模型注入一行「如实注记」**（2026-10-16 客户批准；kanban-live D1——
   * 会话因边界更新**重建**后写权（已发行 writeSet）静默清零，模型上下文却被完整恢复 ⇒ 认知分叉）。
   * 语义**钉死**：
   * - 注记**排入下一次 `send()` 的输入前缀**（一行加换行分隔），**送达一次即消费**——不是用户消息、
   *   **不单独开轮**、不触任何工具与任何判定（判定与写权不受影响，纯粹是给模型的如实输入）；
   * - 该轮 `prompt` 失败且**未开轮（无 ACK）**时注记保留（下一轮重试仍带上）；开轮后失败则消费
   *   （输入已送出，重排会重复）；
   * - 推荐文本用 `REBUILT_SESSION_WRITE_PERMITS_NOTICE`（单一来源，防各写一份）。
   * **可选方法**（同 `abort?` 先例）：旧替身不实现亦完全合法；由宿主（桌面窗口 O-1 重建路径）在
   * 重建后对本会话句柄调用。**`openRoleSession` 返回的句柄恒实现本方法**。
   */
  queueModelNotice?(text: string): void;
  /**
   * **会话级后台任务访问面（2026-10-25，桌面任务面板）**：与契约
   * `RoleSession.listBackgroundTasks?` / `readBackgroundTask?` / `stopBackgroundTask?` **同名同签名**，
   * 原样转发底层会话（`src/model/runtime.ts`；任务表/日志只存在于本会话生命周期，编排不另立一套状态）。
   *
   * **三者均为可选方法**（同 `abort?` / `queueModelNotice?` 先例）：底层 `RoleSession` 未实现时，
   * 句柄上对应属性**保持缺席（undefined）**——**不伪造空实现**（伪造 `[]`/`undefined`/「已停止」会误导
   * 消费方）；`stopBackgroundTask` 的失败结果（`ok:false`，如 `unknown-task`/`closed`/`timeout`）与抛错
   * 均**原样返回**，不吞、不改写。`openRoleSession` 返回的句柄是否具备取决于底层会话。
   */
  listBackgroundTasks?(): BackgroundTaskSnapshot[];
  readBackgroundTask?(taskId: string, options?: BackgroundTaskReadOptions): BackgroundTaskReadResult | undefined;
  stopBackgroundTask?(taskId: string, options?: BackgroundTaskStopOptions): Promise<BackgroundTaskStopResult>;
  /**
   * 持续的事件流；跨多轮累积。产出 `OrchestrationEvent`（既有 `SessionEvent` + 编排在 `settled` 时
   * 追加的 `handback` 回交事件，设计 §10.8）——**治理角色（su）不自我回交**，故其会话只产出 SessionEvent。
   */
  events(): AsyncIterable<OrchestrationEvent>;
  /** 收口：释放底层会话。可重复调用（幂等）；出错如实抛出，不吞。 */
  dispose(): Promise<void>;
}
const managedCoreHandles = new Map<string, { handle: RoleSessionHandle; projectRoot: string; roleKind: ResolvedRole["kind"]; construction: "default-core" | "custom-adapter"; isDisposed: () => boolean;
  turnInput?: { turnId: string; provenance?: PromptOptions["inputProvenance"] } }>();
const officialCoreAdapterFactories = new WeakSet<RuntimeAdapterFactory>();
const unmanagedFactoryAttempts: Array<{ projectRoot: string; roleId: string; runtime: string; reason: string }> = [];
type OpenFailureRecord = { ref: GitHostOpenFailureRef; coreRef: NonNullable<ReturnType<typeof inspectRuntimeConstructionFailure>>;
  projectRoot: string; roleId: string; runtime: string; hostHandleId?: string; ambiguous: boolean };
const openFailureErrors = new WeakMap<object, OpenFailureRecord>();
const openFailureRecords = new Map<string, OpenFailureRecord>();
const sameFailureRoot = (left: string, right: string) => process.platform === "win32"
  ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase() : path.resolve(left) === path.resolve(right);
function captureRoleSessionOpenFailure(error: unknown, context: { projectRoot: string; roleId: string; runtime: string }, officialFactory: boolean): void {
  if (!error || typeof error !== "object") return;
  const previous = openFailureErrors.get(error);
  if (previous) { previous.ambiguous = true; return; }
  const coreRef = officialFactory ? inspectRuntimeConstructionFailure(error) : undefined;
  if (!coreRef) return;
  const record: OpenFailureRecord = { ...context, coreRef, ambiguous: false,
    ref: { source: "pipeline-role-open-failure", failureId: randomUUID() } };
  openFailureErrors.set(error, record); openFailureRecords.set(record.ref.failureId, record);
}
/** Claim only the real failed open's error identity, once for its actual host inventory handle. */
export async function inspectRoleSessionOpenFailure(input: { error: unknown; hostHandleId: string }): Promise<GitHostOpenFailureRef | undefined> {
  if (!input.error || typeof input.error !== "object" || typeof input.hostHandleId !== "string" || !input.hostHandleId.trim()) return undefined;
  const record = openFailureErrors.get(input.error);
  if (!record || record.ambiguous || record.hostHandleId !== undefined && record.hostHandleId !== input.hostHandleId) return undefined;
  record.hostHandleId = input.hostHandleId;
  return { ...record.ref };
}
/** Fresh same-attempt evidence, never a caller-projected safe flag or a latest-role lookup. */
export function recheckRoleSessionOpenFailure(input: { ref: GitHostOpenFailureRef; hostHandleId: string; projectRoot: string; roleId: string; runtime: string }) {
  const ref = input.ref;
  if (!ref || ref.source !== "pipeline-role-open-failure" || Object.keys(ref).sort().join(",") !== "failureId,source") return undefined;
  const record = openFailureRecords.get(ref.failureId);
  if (!record || record.ambiguous || record.hostHandleId !== input.hostHandleId || !sameFailureRoot(record.projectRoot, input.projectRoot)
    || record.roleId !== input.roleId || record.runtime !== input.runtime) return undefined;
  const construction = recheckRuntimeConstructionFailure(record.coreRef), registry = inspectRuntimeCoreRegistry();
  const entry = registry.entries.find(entry => entry.id === record.coreRef.entryId);
  if (!construction || registry.processInstanceId !== record.coreRef.processInstanceId || !entry
    || !sameFailureRoot(entry.projectRoot, record.projectRoot) || entry.roleId !== record.roleId || entry.runtime !== record.runtime
    || !construction.preparedTokensRevoked || construction.pendingContinuations !== 0) return undefined;
  if (["failed", "prepared"].includes(entry.state) && construction.status === "never-started" && !construction.factoryEntered && !construction.nativeBindEntered && entry.sessionId === undefined)
    return { status: "never-started" as const, entryId: entry.id, processInstanceId: registry.processInstanceId, registryRevision: registry.revision };
  const lifecycle = entry.lifecycle;
  // A10/C7（P1.4 §3.2）：失败打开的终止证据改用运行时中立 drain 谓词——Claude/Pi 形态
  // （status/processCoverage 为 unknown、native 覆盖不可观测）不再结构性阻塞后续 Git 动作；
  // 未知/live-work 类 reason 仍由 `isRuntimeSessionDrained` 默认阻断（I0-3）。
  if (["failed", "disposed"].includes(entry.state) && construction.status === "instance-bound" && entry.sessionId && lifecycle?.sessionId === entry.sessionId
    && isRuntimeSessionDrained(lifecycle))
    return { status: "terminated" as const, entryId: entry.id, processInstanceId: registry.processInstanceId, registryRevision: registry.revision };
  return undefined;
}
/** Inspect the complete ordinary inventory without letting one failure cover two controllers. */
export function recheckRoleSessionOpenFailureInventory(input: { projectRoot: string; sessions: GitHostInventory["sessions"] }) {
  const registry = inspectRuntimeCoreRegistry(), handles = new Set<string>(), failedEntries = new Set<string>();
  const entries: Array<{ hostHandleId: string; entryId: string; status: "never-started" | "terminated" }> = [];
  for (const session of input.sessions) {
    if (handles.has(session.hostHandleId)) return undefined;
    handles.add(session.hostHandleId);
    if (session.phase !== "open-failed") continue;
    const evidence = session.openFailureRef && recheckRoleSessionOpenFailure({ ref: session.openFailureRef, hostHandleId: session.hostHandleId,
      projectRoot: input.projectRoot, roleId: session.roleId, runtime: session.runtime });
    if (!evidence || evidence.processInstanceId !== registry.processInstanceId || evidence.registryRevision !== registry.revision || failedEntries.has(evidence.entryId)) return undefined;
    failedEntries.add(evidence.entryId); entries.push({ hostHandleId: session.hostHandleId, entryId: evidence.entryId, status: evidence.status });
  }
  return { processInstanceId: registry.processInstanceId, registryRevision: registry.revision, entries };
}
/** Actual Pipeline construction history, including controllers which never returned a Core id. */
export function inspectManagedRoleSessionInventory() {
  return structuredClone({ unknownFactoryAttempts: unmanagedFactoryAttempts,
    sessions: [...managedCoreHandles.values()].map(record => ({ projectRoot: record.projectRoot, construction: record.construction,
      disposed: record.isDisposed(), sessionId: record.handle.sessionId, roleId: record.handle.roleId, runtime: record.handle.runtime })) });
}
/** Native effects follow Core's opaque preparation, never caller-projected plan facts. */
async function bindPreparedRuntimeRole(adapter: RuntimeAdapter, role: ResolvedRole, projectRoot: string): Promise<RoleSession> {
  if (adapter.prepareRole && adapter.bindPreparedRole) {
    const prepared = await adapter.prepareRole(role);
    const requirement = await readGitHostProtectionRequirement({ projectRoot });
    // 2026-11-08（设计 P1.3 §2.2.4；退役旧门 `runtime-protected-scope-unmediated-app-execution-planned`）：
    // 受保护范围下「注册了 shell 工具」不再于创建期拒绝，改为要求审批链证据——防御性断言：
    // plan 声称注册了 shell 但未携带 `approvalChain`（理论上不可达：prepareRole 已按新算法拒绝）⇒
    // 按准入未证明 fail-closed 处理。
    if (requirement.state === "required" && prepared.plan.native?.appTools.some(tool => ["run_shell", "start_background_task"].includes(tool))
      && prepared.plan.approvalChain === undefined) {
      const error = new Error("runtime-creation-admission-unproven:protected-scope-approval-chain-unproven"); discardRuntimeRolePreparation(prepared, error); throw error;
    }
    if (prepared.token && prepared.plan.status === "observed") {
      try { return await adapter.bindPreparedRole(prepared.token); }
      catch (error) { discardRuntimeRolePreparation(prepared, error); throw error; }
    }
    if (requirement.state !== "unmanaged") {
      const error = new Error(`runtime-creation-admission-unproven:${prepared.plan.reasons.join(",")}`); discardRuntimeRolePreparation(prepared, error); throw error;
    }
  } else {
    const requirement = await readGitHostProtectionRequirement({ projectRoot });
    if (requirement.state !== "unmanaged") throw new Error("runtime-creation-prepared-api-unavailable");
  }
  // Preserve genuinely unmanaged legacy behavior; it stays unverified in the real Core registry and cannot grant Git mutation.
  return adapter.bindRole(role);
}
/** Facts come only from this module's actual constructed handles, never caller-supplied source strings. */
export function inspectManagedRoleSessionEvidence(input: { projectRoot: string; sessionId: string }) {
  const record = managedCoreHandles.get(input.sessionId);
  if (!record || path.resolve(record.projectRoot).toLowerCase() !== path.resolve(input.projectRoot).toLowerCase()) return undefined;
  try { const lifecycle = record.handle.inspectLifecycle?.(); return structuredClone({ projectRoot: record.projectRoot, construction: record.construction, disposed: record.isDisposed(),
    sessionId: record.handle.sessionId, roleId: record.handle.roleId, roleKind: record.roleKind, runtime: record.handle.runtime,
    lifecycle, toolSurface: record.handle.inspectToolSurface?.(), ...(record.turnInput?.turnId === lifecycle?.turnId ? { turnInput: record.turnInput } : {}) }); } catch { return undefined; }
}

export async function openRoleSession(
  input: {
    roleId: string;
    runtime?: RuntimeKind;
    project: ProjectConfig;
    taskId?: string;
    /**
     * T3（2026-11-10 两条固定工作流路径，B1 AC-12）：per-flow 工作流模式。
     * `workflowModeForFlow` 由桌面/CLI 注入——每次卡/任务/写门禁**按实际 flowId 解析**（不缓存项目级单值；
     * 混合项目 legacy 在飞 flow 与新 fixed flow 并存）。`workflowMode` 为单 flow/显式常量兼容；
     * 两者均缺省 ⇒ `legacy`（旧行为逐字不变）。纯选择器，不授权任何写权。
     */
    workflowMode?: WorkflowMode;
    workflowModeForFlow?: (flowId: string) => WorkflowMode | Promise<WorkflowMode>;
    scope?: TaskScope;
    /** 宿主按客户委托注入的本项目常规检查政策；项目角色三层链专用。 */
    routineShellPolicy?: RoutineShellPolicy;
    /**
     * **客户确认制交互通道（A-1/A-3）**：前端给的原始客户通道（CLI 终端 / 桌面交互卡）。
     * **给出** ⇒ 本会话进入**确认制收窄**：编排在此之上包一层「确认 → 发行 writeSet」的发行器
     * （`common/编排/confirmed-writes.ts`），并经 `deps.createAdapter(gate, {customerInput})` 注入适配器
     * ——`request_confirmation`/`request_choice` 两工具据此注册（「注入才注册」）。
     * **Section 1 预授权（2026-10-25 客户规则）**：无任务 scope 收窄时，Section 1 内写入直接放行
     * （trio 五角色与项目角色；旧 su 保留四棵预授权目录），不需要逐路径确认；边界外/F4 收窄/
     * 治理门禁照旧。发行器仍存在，用于其余既有确认流程。
     * **缺省** ⇒ 无客户通道：工具不注册、scope 原样传递（旧语义，逐字不变）。
     */
    customerInput?: CustomerInputFn;
    /**
     * 2026-11-04（trunk-amendment S3；P1 §2.6-34/F16）：stable 文件（workflow/role-card/boundary）
     * 写入的一次性许可查询（**同步**）。由宿主在许可签发/消费后安装到 C2b 同步许可快照，并在此
     * 注入同一查询（`stableWriteDecision` 内部仍要求 permit 与已安装快照逐字段一致）。缺省 ⇒
     * stable 写入被 `stable-write-permit-missing` 拒绝（fail-closed；不存在第二份许可 Map）。
     */
    stablePermitOf?: (relPath: string) => StableWritePermit | undefined;
    /**
     * **自动收尾 + 自动重 pin（§13.3 经 A-4 扩为含首次）**：每轮会话 settle 后自动调用
     * `repinIfBootstrapped`——创世态 = 首次收尾（写 `.ans` + 治理边界文档 + manifest；无可 pin 之物则
     * 零副作用）；非创世态 = 重扫并更新 `.ans` 的 pin + manifest。缺省：**内置治理角色（su）会话为
     * `true`，其余为 `false`**——收尾/重 pin 是 su 的固有职责，普通角色会话不做。
     */
    autoRepin?: boolean;
    /**
     * **su 派发任务的路由能力（H-1）**：前端提供的路由实现（把派发转成目标角色会话的一条输入；
     * 开/排队/去重/失败保留归前端）。**只对治理角色会话（su）转交**——项目角色会话即便给了也不注入
     * （`dispatch_task` 只给 su）；CLI 一次性前端无同等路由（设计已登记），不传即可（工具不注册）。
     * 校验（roleId 非本项目角色 / 指向 su 自身 → 如实回错）由该能力的实现方做，判定口径用
     * `common/编排/handback.ts::isDispatchableRoleId`（单一来源）；**派发 ≠ 授权**。
     */
    dispatchTask?: DispatchTaskFn;
    /**
     * **需求变更申请能力（`request_requirement_change`「注入才注册」，2026-10-26 客户要求 + 同日纠正/补充）**：
     * 前端（桌面窗口）提供的实现——报告员起草提案时若需要**新的客户授权/范围**（或约束/成本变化），
     * 不应把未获授权的诉求塞进提案卡「顺带获批」，而应发起需求变更申请。**只对内置治理角色中的
     * 报告员 Rapporteur 与统筹 Convener 注入**；其它内置治理角色、single 的 su 与项目角色即便调用方
     * 误给也不注入（工具不注册，结构性 fail-closed）。需求变更审批卡由统筹或报告员发起，发起方不得自批，
     * 审批人只有独立判断 agent（「替我决策」开启时）或客户；主理不审批、只在批准后执行意图变更。
     * 意图校验/去重/派发/账本/系统行全部由该能力实现；本层**纯透传**。**提交申请 ≠ 客户批准，
     * 也不代表意图已变更**。
     */
    requestRequirementChange?: RequestRequirementChangeFn;
    /**
     * 2026-11-04 下载申请能力（`request_download`「注入才注册」）：C1 桌面提供实现；
     * 未给出（CLI/旧调用方）⇒ 字段缺席、工具不注册、行为逐字不变。本层纯透传。
     */
    requestDownload?: RequestDownloadFn;
    /**
     * 2026-11-02（全局任务状态，A1）：`project_state` 只读能力（注入才注册）。
     * **只对内置治理角色（含旧 su）转交**；项目角色即便调用方误给也不注入。纯读、零写入。
     */
    projectState?: ProjectStateFn;
    /** 2026-11-02：`project_note` 受控备注能力；**只对 trio chief 转交**。 */
    projectNote?: ProjectNoteFn;
    /** 2026-11-02：`request_version_decision` 能力；**只对 trio chief 转交**。 */
    requestVersionDecision?: RequestVersionDecisionFn;
    /**
     * Batch 3.5（S5）：三提交能力（由 D1b 注入 S4/S2 实现）。`openRoleSession` 按**会话角色**
     * 门控后转交适配器：product/rapporteur → `submitVersionChange`；convener → `submitRefactor` +
     * `requestStableWrite`；其他角色（含客户/幕僚/项目角色）一律不注入（工具不注册）。
     * 工具只提交请求；批准/许可/客户卡仍在应用侧（客户本人）。
     */
    /** Trusted independent chief context. Never a model/CLI argument. */
    chiefDecisionContext?: ChiefDecisionExecutionContext;
    decidePendingRequest?: DecidePendingRequestFn;
    submitVersionChange?: SubmitVersionChangeFn;
    selectRunChange?: SelectRunChangeFn;
    completeTeamPlan?: CompleteTeamPlanFn;
    activateRoleDocuments?: ActivateRoleDocumentsFn;
    closeCreatedTask?: CloseCreatedTaskFn;
    /**
     * T3 B2（MF-IR-2/3）：fixed 收口/激活的**应用实现**（仅 fixed 会话消费；legacy 会话不触达、
     * 也不接受 legacy `closeCreatedTask`/`activateRoleDocuments` 进入 fixed 注入面）。
     * 未注入 ⇒ run-role 默认直连 `workflowService.closeTask` / `workflowService.activateRoleDocumentsFixed`
     * （默认收口不带 evidence，适合非完成型收口；A2/A5/A11/B1/B3/A12a/A12b 的完成型收口需应用实现
     * 补 artifacts/branchTipOid/acceptanceArchive 后调用同一服务）。应用实现接收 run-role 绑定的
     * 可信身份（projectRoot / actorRoleId）——身份绝不来自模型参数。
     */
    closeCreatedTaskFixed?: FixedCloseCreatedTaskDep;
    activateRoleDocumentsFixed?: FixedActivateRoleDocumentsDep;
    gitQuery?: GitQueryFn;
    gitCandidate?: GitCandidateFn;
    gitPublish?: GitPublishFn;
    submitRefactor?: SubmitRefactorFn;
    requestStableWrite?: RequestStableWriteFn;
    /**
     * **G-2 看护自查能力（R1；`role_status`「注入才注册」）**：前端提供的实现（主进程读同源快照＋
     * 诊断尾部 → 结构化文本）。**只对治理角色会话（su）转交**（判据同 `dispatchTask`）；形状单一来源
     * ＝契约家 `model/runtime.ts`（R1 属主；文案契约在 `common/编排/watchdog.ts`）。**纯读**：不写盘、
     * 不入队、不改 busy、不动任何判定链；不扩大任何写权。
     */
    roleStatus?: RoleStatusFn;
    /** 2026-10-30（3.2）：只读 contract_check 数据源；所有角色可注入。 */
    contractCheck?: ContractCheckFn;
    /**
     * 2026-11-09（文档格式权威说明，方案 P1.2 §4.1/§14 G1）：只读 `doc_format` 数据源；
     * 所有角色可注入（加法可选，与 `contractCheck` 相邻）。**只读、注入才注册、不构成放行/授权**：
     * 未注入 ⇒ 工具不存在、既有行为逐字不变；本层纯透传同一引用，不包装、不调用。
     */
    docFormat?: DocFormatFn;
    /** 3.4：只读 evidence_check 数据源；所有角色可注入。 */
    evidenceCheck?: EvidenceCheckFn;
    /**
     * **G-2 会话巡检能力（R1；`session_tail`「注入才注册」）**——**只给 su**（同上一判据）。
     * 复用受保护投影管线返回尾部规范化行（凭据清洗/display 保护已在链上）；失败如实（不抛、不猜）。
     */
    sessionTail?: SessionTailFn;
    /**
     * B 批（2026-10-28）：`role_activity_log` 数据源（每角色运行日志）。**只对幕僚（trio chief）转交**；
     * 其他角色/项目角色即便调用方误给也不注入（工具不注册）。纯读、脱敏、项目相对路径；不扩大任何写权。
     */
    roleActivityLog?: RoleActivityLogFn;
    /** B 批：终止动作；只给幕僚（trio chief）转交。 */
    terminateRoleRun?: TerminateRoleRunFn;
    /** B 批：安全重派动作；只给幕僚（trio chief）转交。 */
    redispatchTask?: RedispatchTaskFn;
    /**
     * **G-4 技能安装能力（I1/I2 工具 `install_skill`「注入才注册」）**——**只对治理角色会话（su）
     * 转交**（判据复用 `suppressHandback`，同 `dispatchTask`/看护三能力）；项目角色会话即便调用方
     * 误给也不注入（工具不注册）。形状单一来源＝契约家 `model/runtime.ts`（`InstallSkillFn`/
     * `InstallSkillReceipt`）。**工具自己不写盘**：能力只做校验（角色/登记/含角色）→ 激活（重建；
     * 在跑不打断 ⇒ `next-session`）→ 三态回执。**安装 ≠ 授权**：不得据此授予任何写权（技能是必读
     * 资料，不是边界；安装不改变任何角色的边界与写权）。
     */
    installSkill?: InstallSkillFn;
    /**
     * **G-4 技能卸载能力（I1/I2 工具 `uninstall_skill`「注入才注册」）**——**只给 su**（同上一判据）。
     * 先改登记再卸载（能力须校验登记确已撤销，未撤销如实拒绝）；**文件保留**——「效果已撤」与
     * 「字节已清」二分陈述；同不改变任何写权。
     */
    uninstallSkill?: UninstallSkillFn;
    /**
     * **G-4 V2 MCP 安装能力（工具 `install_mcp`「注入才注册」）**——**只对治理角色会话（su）
     * 转交**（判据复用 `suppressHandback`，同技能两能力）；项目角色会话即便调用方误给也不注入
     * （工具不注册）。形状单一来源＝契约家 `model/runtime.ts`（`InstallMcpFn`/`InstallMcpReceipt`）。
     * **工具自己不写盘**：能力只做校验（角色/声明/含角色；护栏：仅客户消息发起的轮次）→ 激活
     * （重建；在跑不打断 ⇒ `next-session`）→ 回执。**能力级授予诚实面**：外来 MCP 在 ANS 门禁之外
     * 执行——不得宣称逐调用受审；**安装不改变任何角色的写边界**（写权仍只来自角色边界与确认发行）。
     */
    installMcp?: InstallMcpFn;
    /**
     * **G-4 V2 MCP 卸载能力（工具 `uninstall_mcp`「注入才注册」）**——**只给 su**（同上一判据）。
     * 先改声明再卸载（能力须校验声明确已撤销，未撤销以 `registration-unchanged` 如实拒绝）；
     * **下次会话摘除**（在跑不打断）、**已发生副作用不可撤**（如实二分陈述）；同不改变任何写权。
     */
    uninstallMcp?: UninstallMcpFn;
    /**
     * **I-1 开放 shell —— (a) 前端操作者确认通道（兼 arm 开关语义）**：给出 ⇒ 本会话（**仅项目角色**；
     * 内置治理角色自身不接三层链——其 `run_shell` 走审批档 `shellOperatorOnly`）由编排装配三层链
     * （(c) 确定性硬地板 → (b) 内置治理角色模型审读 → (a) 本通道；关窗/不答/超时 = **不放行**）并注入
     * `ShellGate` ⇒ `run_shell` 注册（「注入才注册」语义未改）。不给 ⇒ 不 arm（`run_shell` 不存在）。
     * CLI 一次性前端无确认框 ⇒ 不接。
     */
    shellOperatorChannel?: OperatorChannelFn;
    /**
     * **高级注入（透传 `assembleProjectShellGate`；测试/装配用）**：(c) `classifyShell`/`rules`、
     * (b) 审读角色 id / `openSession` / 超时、`auditSink` 等。生产调用（桌面）通常只给
     * `shellOperatorChannel`——（c) 的合法注入源（门禁引擎经 service 的公开出口）就绪后在此传入。
     */
    shellArming?: Omit<AssembleShellGateOptions, "project" | "operatorChannel" | "sessionDeps" | "runtime">;
    /**
     * **只读档（旧兼容路径；客户裁定 2026-10-12「su 也要有 shell，但是只读」）**：给出 ⇒ 本会话装配
     * **只读档** `ShellGate`（`assembleReadonlyShellGate`——只接 (c)：命中只读白名单放行；
     * `risky`/`review`/`deny` 一律拒；**不接 (b) 模型审读**——不自审；**不接 (a) 客户确认**——只读外的
     * 命令直接拒，不打扰客户、不弹任何对话框）并注入 `capabilities.shellGate` ⇒ `run_shell` 注册
     * （「注入才注册」语义未改）。**2026-10-19 起内置治理角色统一走审批档**（`shellOperatorOnly`）；
     * 本选项保留给旧调用方/测试（只读档执行集严格 ⊆ 审批档，仍更严、不放宽）。对项目角色给出时
     * 同样按**更严的一档**处理。与 `shellOperatorChannel`/`shellArming` 同时出现时 **readonly 优先**
     * （见下方 arm 块注释）。装配失败 ⇒ **不 arm**（`run_shell` 不注册，fail-closed 不变）。
     * **不得为此弹任何对话框**（选项面没有 (a) 通道即是结构保证）。
     */
    shellReadonly?: Omit<AssembleReadonlyShellGateOptions, "project">;
    /**
     * **审批档（客户裁定 2026-10-17：「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」；
     * 客户 2026-10-19 新规则扩展到五个内置治理角色）**：给出 ⇒ 能力位 `shell: "operator-approve"`
     * 的内置治理角色装配 `assembleOperatorShellGate`（只接 (c)+(a)：allow 直放 0 卡；
     * risky/review/deny 一律交客户/判断 agent 逐条批准；**不接 (b)**——交付审批的角色不自审）。
     * 选项面没有 pmAsk/routineShellPolicy（type 层面保证）。
     * **能力位守卫**：`cap?.shell !== "operator-approve"`（含项目角色 cap undefined、旧能力位
     * none/readonly）时误传 ⇒ **不 arm** 并记录诊断 `shell.operatorOnly.rejected`（防止三层链被绕过）。
     * **与 `shellReadonly` 同时给出 ⇒ 不 arm**（诊断记录，不择一静默生效）。
     * 装配失败/缺件 ⇒ 不 arm（`run_shell` 不注册，fail-closed）。优先级：operatorOnly → readonly → 三层链。
     */
    shellOperatorOnly?: Omit<AssembleOperatorShellGateOptions, "project">;
    /**
     * **R-1：审读结论工具的能力**（`report_shell_verdict`「注入才注册」）——审读会话专用，由
     * `pm-reviewer` 注入；一般调用方不传。
     */
    shellVerdict?: ShellVerdictFn;
    /**
     * **2026-10-31（shell 判拒升级方案 v1.3 §4/§6）升级卡的呈现函数（由桌面窗口 C1 提供）**：
     * 给出 ⇒ 本会话构造 `shellEscalation` registry，并把 `onReviewed`/`takeGrant`/`onAuditSinkCreated`
     * 交给已 arm 的 shell 闸、把 `request` 作为 `request_shell_escalation` 工具能力交给适配器。
     * 卡内容只取自判拒记录（命令原文/argv/cwd/judge 理由/替代方案/上下文），角色只提供 ≤1KB 必要性。
     * 未给出 / `ANS_SHELL_ESCALATION_DISABLED=1` ⇒ 不创建 registry、工具不注册、`takeGrant` 不注入
     * （fail-closed；回滚开关见方案 §13.2）。presenter 的失败/超时**必须**解析为
     * `expired`/`unavailable`（默认拒绝），绝不默认放行。
     */
    shellEscalationPresenter?: ShellEscalationPresentFn;
    /**
     * 升级通道的可注入运行选项（时钟/环境/呈现超时/会话申请上限/requestId 生成；测试与装配用）。
     * 生产缺省即可。`env` 同时用于 `ANS_SHELL_ESCALATION_DISABLED` 判定（缺省取 `shellArming.env`，
     * 再缺省 `process.env`）。
     */
    shellEscalationOptions?: ShellEscalationRuntimeOptions;
    /**
     * **2026-11-03（客户授权平面 B1）**：每项目客户指令运行时（Pipeline 公共句柄）。
     * 给出 ⇒ 在 shell 已 arm 且**非只读档**时把 `takeDirective` 注入闸（项目三层链与审批档）；
     * 只读档不注入（只读拒绝不得被客户指令越过）。未给出（CLI/旧调用方）⇒ 不注入、行为逐字不变。
     * 桌面 C1 用同一实例喂 `Interface.sendSession` 与 `openRoleSession`/`govern-session`。
     */
    customerDirective?: CustomerDirectiveRuntime;
    /**
     * **图片查看能力（`view_image`「注入才注册」，2026-10-26 客户要求；两轮附件设计）**：前端（桌面）
     * 提供的实现——工具读取项目内图片并调用本能力，把图片排队为**同一角色下一轮用户提示的图片附件**
     * （本轮工具结果只回「已排队」，不依赖各引擎「工具结果附图」支持）。**通用只读能力**：项目角色与
     * 内置治理角色**都转交**（不按角色收窄）；未给出 ⇒ 不注入（工具不注册，结构性 fail-closed）。
     * 形状单一来源＝契约家 `model/runtime.ts`（`ViewImageFn`/`ViewImageInput`/`PromptImage`）。
     * 本能力不写盘、不联网、不改变任何写权；**不改变其他能力的注入矩阵**。
     */
    viewImage?: ViewImageFn;
    /**
     * **D-1 覆盖位**：`false` ⇒ 本会话**不持久化**（不传 `sessionDir`，适配器走 in-memory）。
     * 审读会话固定用 `false`（不恢复用户 su 会话的可能损坏历史、不污染其聊天记录）；缺省/`true` 行为不变。
     */
    persistSession?: boolean;
  },
  deps: RoleSessionDeps = {}
): Promise<RoleSessionHandle> {
  const chiefDecisionContext = input.chiefDecisionContext;
  if (chiefDecisionContext !== undefined && (!isChiefDecisionExecutionContext(chiefDecisionContext)
    || input.roleId !== "chief" || input.project.governanceModel !== "trio" || input.decidePendingRequest === undefined))
    throw new Error("Invalid trusted independent chief decision context");
  if (input.decidePendingRequest !== undefined && chiefDecisionContext === undefined)
    throw new Error("Chief settlement capability requires its bounded host context");
  const log = createDiagnosticLogger({ component: "orchestration.session", projectRoot: input.project.projectRoot, roleId: input.roleId });
  log.record("session.open.start");
  // 角色/边界解析：失败即抛错（句柄式接口无退出码）。
  // 会话式入口：**允许** project.builtInRoles 声明的内置治理角色（桌面聊天）。
  const setup = await setupRole(input.roleId, input.project, { allowBuiltInRoles: true });
  if (!setup.ok) {
    log.error("session.open.failed", new Error(setup.reason));
    throw new Error(setup.reason);
  }

  // 底层只建**一个**会话：多轮 send 复用同一 RoleSession，绝不每轮重建。
  //
  // 能力来源（评审 §5.6「单点」）：内置治理角色一律读门禁引擎注册表
  // `governanceCapabilitiesOf`；`su` 得到 `LEGACY_SU_CAPABILITIES`（single 旧行为逐字不变）；
  // 项目角色没有治理能力（`undefined`），保持既有「只给内置治理角色」的注入纪律。
  const builtInGovernance = setup.role.kind === "built-in-governance";
  if (chiefDecisionContext !== undefined && (!builtInGovernance || setup.role.id !== "chief"))
    throw new Error("Independent decision execution requires the resolved built-in chief");
  const trioSpec: GovernanceRoleSpec | undefined = governanceRoleOf(setup.role.id);
  const isTrio = trioSpec !== undefined;
  const governanceModel = input.project.governanceModel ?? "single";
  // 评审 §5.3：trio 下自动收尾/重 pin 的写权来自**应用专用边界**——三人的 Section 1 不含
  // `.ans/**`/`docs/bootstrap-manifest.md`，若沿用角色边界，收尾会 fail-closed、`.ans` 永不落盘。
  // single/su 逐字沿用会话边界（旧行为不变）。
  const repinBoundary =
    isTrio || governanceModel === "trio"
      ? appGovernanceBoundary(setup.role.boundary.acceptance)
      : setup.role.boundary;
  const registryCapabilities = builtInGovernance ? governanceCapabilitiesOf(setup.role.id) : undefined;
  // B 批（2026-10-28）：chief 的目标能力在运行时注入端生效（A 批未改注册表能力矩阵；D 批随目标态清理）：
  // `dispatch_task`（星形任意 worker）/`role_status`/`session_tail`。convener 的旧能力保持到 D。
  // 只叠加**新增**能力位；不改变其他角色/项目角色的注入矩阵。
  const cap = registryCapabilities !== undefined && trioSpec?.id === "chief"
    ? { ...registryCapabilities, dispatchTask: true, roleStatus: true, sessionTail: true }
    : registryCapabilities;
  // 预授权目录（评审 §5.6）：trio 按注册表；su 用既有四棵；项目角色没有预授权。
  // 2026-10-25 起 trio 的写盘预授权改由 **Section 1 条目**给出（含 `docs/workflow.md` 这类精确文件；
  // 见下方 section1PreauthorizedEntries），本表只保留 su 的四棵与 artifact 观察目录用途。
  const preauthorizedDirs: readonly string[] = builtInGovernance
    ? trioSpec?.preauthorizedDirs ??
      (setup.role.id === "su" ? LEGACY_SU_PREAUTHORIZED_DIRS : [])
    : [];

  // gate（A-3）：有 `customerInput` ⇒ 确认制动态 writeSet（发行器追加；Section 1 预授权/内置 su 预授权
  // 目录并入初始集）；无 ⇒ 原样传 input.scope（可为 undefined = 不收窄，旧语义逐字不变）。
  // W6-A（四角色评审 §4.4）：**能力矩阵收窄**——Liaison 的 `customerInput=false`，即便调用方误给
  // 通道也不进入确认制（`request_confirmation`/`request_choice` 结构性不注册；走静态边界/预授权）。
  const confirmationMode =
    input.customerInput !== undefined && (cap === undefined || cap.customerInput);
  const issued = new Set<string>();
  const conditions = conditionSlugsOf(setup.role.boundary);
  const gitProtection = await readGitProtectionFacts(input.project.projectRoot);
  const roleCapabilityProtection = await readGitHostProtectionRequirement({ projectRoot: input.project.projectRoot });
  const managedFileProtocol = roleCapabilityProtection.state !== "unmanaged";
  const managedBoundary = structuredClone(setup.role.boundary);
  const gateCtx = { skillRoot: input.project.skillRoot, projectRoot: input.project.projectRoot, protectedGitRoots: gitProtection.protectedGitRoots };
  const staticScope = input.scope === undefined ? undefined : structuredClone(input.scope);

  // **Section 1 写入预授权（客户 2026-10-25 规则）**——初始可写集覆盖角色 Section 1 白名单：
  //   · 无任务级 writeSet 收窄（`scope === undefined`，桌面聊天即此形态）：trio 五角色与项目角色
  //     都按各自 Section 1 条目预授权（含精确文件条目，如 Convener 的 `docs/workflow.md`，它不在
  //     `preauthorizedDirs` 目录清单内）。
  //   · 有任务 writeSet / 治理 scope 时：保持 F4 收窄，**不**把 Section 1 并入（不扩大）；trio 的既有
  //     `preauthorizedDirs` 子集照旧并入（2026-10-16 起的既有预授权，行为不变）。
  //   · 旧 su（single）：卡未声明该规则，保留 `preauthorizedDirs` 四棵（A-3 确认制逐字不变）。
  // 预授权只影响 F4：边界匹配、F6 接受门、F7 逃逸复核、forbiddenWritePaths 与三权治理门禁全部先行/
  // 照旧；`request_confirmation` 仍可为边界内路径发行（无副作用），治理敏感写入仍按既有规则确认。
  const section1PreauthorizedEntries: readonly BoundaryEntry[] =
    !(builtInGovernance && !isTrio) && staticScope === undefined ? setup.role.boundary.entries : [];
  const preauthorization: PreauthorizedWriteSources = {
    entries: section1PreauthorizedEntries,
    dirs: builtInGovernance ? preauthorizedDirs : [],
  };
  const hasPreauthorization = preauthorization.entries.length > 0 || preauthorization.dirs.length > 0;

  let boundSessionForEvidence: RoleSession | undefined;
  let currentFlowId: string | undefined;
  // T3 B1（AC-12）：per-flow 模式解析——**不缓存项目级单值**。无常量/回调 ⇒ legacy（旧行为逐字不变）。
  const resolveWorkflowMode = async (flowId?: string): Promise<WorkflowMode> => {
    if (input.workflowMode !== undefined) return input.workflowMode;
    const flow = typeof flowId === "string" ? flowId.trim() : "";
    if (flow === "" || input.workflowModeForFlow === undefined) return "legacy";
    try {
      return await input.workflowModeForFlow(flow);
    } catch {
      return "legacy"; // 回调失败 ⇒ fail-closed legacy（不猜 fixed）
    }
  };
  const matrixForFlow = async (flowId?: string): Promise<DispatchMatrixMode> =>
    (await resolveWorkflowMode(flowId)) === "fixed" ? "two-fixed-paths/v1" : "legacy-v1";
  // 会话级模式（上下文段/工具注入在会话打开时确定）：常量优先；否则按输入任务的真实 flowId 解析。
  let sessionWorkflowMode: WorkflowMode = input.workflowMode ?? "legacy";
  if (input.workflowMode === undefined && input.workflowModeForFlow !== undefined && input.taskId !== undefined) {
    try {
      const taskStateForMode = await readTaskState(input.project.projectRoot);
      const taskFlowId = taskStateForMode.records.get(input.taskId)?.created?.flowId;
      if (taskFlowId !== undefined) sessionWorkflowMode = await resolveWorkflowMode(taskFlowId);
    } catch {
      sessionWorkflowMode = "legacy";
    }
  }
  const roleDraftWritePaths: string[] = [];
  const refreshRoleDraftScope = async () => {
    roleDraftWritePaths.splice(0);
    if (!isTrio || setup.role.id !== "nominator") return;
    const scope = await createTrunkService({ projectRoot: input.project.projectRoot }).prepareRoleDraftScope({
      ...(currentFlowId ? { flowId: currentFlowId } : {}), ...(input.taskId ? { taskId: input.taskId } : {}) });
    if (scope.ok) roleDraftWritePaths.push(...scope.value.paths);
  };
  await refreshRoleDraftScope();
  const assignedTaskWritePaths: string[] | undefined = input.taskId && setup.role.kind !== "built-in-governance" ? [] : undefined;
  const refreshAssignedTaskScope = async () => {
    if (!assignedTaskWritePaths || !input.taskId) return;
    assignedTaskWritePaths.splice(0);
    const actual = await createTrunkService({ projectRoot: input.project.projectRoot }).prepareAssignedTaskWriteScope({ taskId: input.taskId, actorRoleId: setup.role.id });
    if (actual.ok) assignedTaskWritePaths.push(...actual.value.paths);
  };
  await refreshAssignedTaskScope();
  let assignedReview: Awaited<ReturnType<ReturnType<typeof createTrunkService>["readAssignedReviewContext"]>> | undefined;
  if (input.taskId && setup.role.kind === "built-in-governance" && setup.role.id === "verifier") {
    const task = await createTrunkService({ projectRoot: input.project.projectRoot }).inspectAssignedTask({ taskId: input.taskId, actorRoleId: setup.role.id });
    if (!task.ok) throw new Error(`review-task-assignment-unavailable:${task.message ?? task.code}`);
    if (task.value.kind === "review") {
      assignedReview = await createTrunkService({ projectRoot: input.project.projectRoot }).readAssignedReviewContext({ taskId: input.taskId, actorRoleId: setup.role.id });
      if (!assignedReview.ok) throw new Error(`review-task-context-unavailable:${assignedReview.message ?? assignedReview.code}`);
    }
  }

  // 确认制的初始动态集：**任务级 writeSet（若声明）∪ 已发行集**。任务 writeSet 即「收窄」本身
  // （客户 2026-10-25 规则只把**无任务收窄**时的 Section 1 全量并入预授权，不会扩大任务写集）；
  // 旧 su（single）不并入静态 scope（A-3 逐字不变——其写权只来自确认发行与四棵预授权目录）。
  const confinedWriteSet: readonly string[] =
    builtInGovernance && !isTrio ? [] : (staticScope?.writeSet ?? []);

  const baseGate: WriteGate = confirmationMode
    ? (p) =>
        resolveWrite(
          p,
          setup.role.boundary,
          scopeWithPreauthorizedWrites(
            { writeSet: [...confinedWriteSet, ...issued], conditions },
            p,
            input.project.projectRoot,
            preauthorization,
          ),
          gateCtx,
        )
    : hasPreauthorization && staticScope !== undefined
      ? (p) =>
          resolveWrite(
            p,
            setup.role.boundary,
            scopeWithPreauthorizedWrites(staticScope, p, input.project.projectRoot, preauthorization),
            gateCtx,
          )
      : buildGate(setup.role, input.project, input.scope, gitProtection.protectedGitRoots);

  // D 批：门禁/账本撤除；仅保留 `forbiddenWritePaths`（应用治理记录/其他治理角色资料）硬拒绝，
  // 其余写入交给 `resolveWrite` 的写区/预授权判定。
  // 2026-10-29（v2.8 R6）：版本化文档只读——任何通道覆盖既有 -vN.md 一律 deny（不进审批）。
  const gate: WriteGate = (p, context) => {
    const fileFacts = managedFileProtocol ? verifiedFileFacts(context, p, input.project, gitProtection) : undefined;
    if (managedFileProtocol && !fileFacts) return fileFactsDenied();
    if (chiefDecisionContext !== undefined) return { allowed: false, reason: "Independent chief decision has no production write authority", allowedByRoot: { skill: [], project: [] } };
    const rel = projectRelativeLexical(p, input.project.projectRoot);
    if (assignedTaskWritePaths && (rel === undefined || !assignedTaskWritePaths.some(root => root === rel || (root.endsWith("/") && rel.startsWith(root)))))
      return { allowed: false, reason: "Target is outside the actual assigned task's frozen module/current authorization intersection", allowedByRoot: { skill: [], project: [] } };
    if (trioSpec !== undefined) {
      const forbidden = forbiddenWriteDecision(trioSpec, rel);
      if (forbidden !== undefined) {
        log.record("governance.write.forbidden", { path: rel ?? p });
        return forbidden;
      }
    }
    // One immutable boundary/task intersection is used at all three genuine Provider stages.
    // Read preflight authorizes only the next bounded read, never a stable write or permit consumption.
    const stageScope = confirmationMode
      ? scopeWithPreauthorizedWrites({ writeSet: [...confinedWriteSet, ...issued], conditions }, p, input.project.projectRoot, preauthorization)
      : staticScope !== undefined ? (hasPreauthorization ? scopeWithPreauthorizedWrites(staticScope, p, input.project.projectRoot, preauthorization) : staticScope)
      : hasPreauthorization ? scopeWithPreauthorizedWrites({ writeSet: [], conditions }, p, input.project.projectRoot, preauthorization) : undefined;
    const stagedDecision = fileFacts && (fileFacts.stage === "final-write"
      ? resolveWriteFinal(p, managedBoundary, stageScope, fileFacts)
      : resolveWriteReadPreflight(p, managedBoundary, stageScope, fileFacts));
    if (stagedDecision && !stagedDecision.allowed) return stagedDecision;
    if (rel !== undefined) {
      if (isTrio && setup.role.id === "nominator" && /^角色卡\/[^/]+\/(?:role-card\.md|boundary\.md|boundary\.yaml)$/.test(rel)) {
        if (!roleDraftWritePaths.includes(rel)) return { allowed: false, reason: "Role drafts require the actual completed plan and current D3 selection; no old appointment-write card can substitute", allowedByRoot: { skill: [], project: [] } };
        return stagedDecision ?? baseGate(p);
      }
      if (fileFacts && fileFacts.stage !== "final-write") return stagedDecision!;
      // 2026-11-04（trunk-amendment S3/F13/F16/F33）：
      // · stable 文件（workflow/role-card/boundary）⇒ 一次性许可判定 `stableWriteDecision`
      //   （消费 WriteGateContext.contentSha256；无内容 hash/shell ⇒ 拒绝；denied 直接返回其
      //   `writeDecision`，allowed 继续 baseGate 取 matchedEntry）；
      // · 版本化文档 ⇒ `versionedDocFreezeState` + `versionedDocOverwriteDecision`
      //   （frozen 拒绝覆盖、draft 允许、unknown/corrupt fail-closed；operation 取上下文）。
      const stable = stableWritePathOf(rel);
      // 2026-11-04（S3）/ 2026-11-05（S6 修复）：stable 一次性许可判定。
      // · 注入 `stablePermitOf`（stable-write 集成 + C2b 许可快照已接）⇒ 正常会话**一律**严格判定
      //   （真实 write/edit 带 contentSha256；裸探测/无内容 hash 亦拒绝——shell/opaque 不得绕过）；
      // · **创世 bootstrap 会话**（`project.genesisBootstrap`）是运营授权的初始治理产物写入路径
      //   （尚无项目边界/appointment-write），回到既有 baseGate/边界路径；切回后不再带该标记 ⇒ 严格；
      // · 未注入（B-11 未接）⇒ 保留既有 appointment-write 确认制路径（客户确认发行的 writeSet 仍由
      //   baseGate 把关；不新增无确认直写）。
      const genesisBootstrapSession = input.project.genesisBootstrap !== undefined;
      if (stable !== undefined && (fileFacts !== undefined || (input.stablePermitOf !== undefined && !genesisBootstrapSession))) {
        // The genuine Provider edit-read probe authorizes only the existing path/scope read stage.
        // Its frozen object identity and exact target are checked by the actual Core, never tool JSON.
        if (isRuntimeEditReadProbe(context, p)) return baseGate(p, context);
        const permit = input.stablePermitOf?.(rel);
        const stableInput = {
          projectRoot: input.project.projectRoot,
          relPath: rel,
          sha256: fileFacts?.stage === "final-write" ? fileFacts.contentSha256 : context?.contentSha256 ?? "",
          ...(permit !== undefined ? { permit } : {}),
        };
        const decision = fileFacts?.stage === "final-write" ? stableWriteDecisionFromFacts({ ...stableInput, currentFile: fileFacts.currentFile }) : stableWriteDecision(stableInput);
        if (!decision.allowed) {
          log.record("governance.write.stable-write-denied", { path: rel, code: decision.code });
          return decision.writeDecision;
        }
      } else {
        const exists = fileFacts?.stage === "final-write" ? fileFacts.currentFile.state === "present" : versionedDocExists(input.project.projectRoot, rel);
        const frozen = versionedDocFreezeState(input.project.projectRoot, rel, exists);
        const guarded = versionedDocOverwriteDecision({
          relPath: rel,
          exists,
          frozen,
          operation: context?.operation ?? "write",
        });
        if (!guarded.allowed) {
          log.record("governance.write.versioned-doc-denied", { path: rel, code: guarded.code });
          return {
            allowed: false,
            reason: guarded.reason,
            allowedByRoot: { skill: [], project: [] },
            code: guarded.code,
            rejection: guarded.rejection,
          };
        }
      }
    }
    return stagedDecision ?? baseGate(p, context);
  };

  // 客户通道包装（A-3）：客户确认后，把「已预览且校验在边界内的具体路径」发行进 writeSet。
  // trio 追加（评审 §5.7/§5.8）：
  //   · 按角色校验 cardKind 白名单——越权**不弹卡**，直接返回 declined（fail-closed）；
  //   · 客户作出决定后，按 cardKind + 选项 id 写 `customer.decision`（同步更新内存快照并异步落盘）；
  //   · 账本只记 `CustomerInputOutcome` 与工具调用证据，不采信角色自述；unavailable 不写（无决定）。
  const governedInput: CustomerInputFn | undefined = confirmationMode
    ? (() => {
        const issue = createConfirmedWriteIssuer({
          boundary: setup.role.boundary,
          conditions,
          ctx: { skillRoot: input.project.skillRoot, projectRoot: input.project.projectRoot },
          issued,
        });
        const raw = input.customerInput!;
        return async (req, metadata) => {
          const originalMetadata = metadata === undefined ? undefined : { ...metadata };
          let cardKind = req.cardKind ?? originalMetadata?.cardKind;
          let effectiveReq = req;
          let effectiveMetadata = originalMetadata;
          // 2026-10-22 无效治理卡守卫（设计 §4.5/§4.6，N1 严格口径）：五个内置治理角色的 confirm 卡
          // 必须在**触达客户通道之前**带齐 `cardKind`（且属于该角色白名单）与合法 `flowId`。
          // 缺任何一项 ⇒ fail-closed 拒绝本次发卡：不调 raw、不计算 judgeContext、不镜像、不写账本、
          // 不发行写集/不占 pending-queued；工具回执据 `notPresented` 如实说明「卡片未发出」。
          // 2026-10-20 的 confirm `cardKind` 机械兜底已由本严格口径取代并删除（choice 兜底保持不变）。
          // 2026-10-20：choice 卡同样按内置治理角色默认（Lead 的 intent-confirm 等）；显式 cardKind 优先。
          // 2026-10-26 安全缺口（协调）：卡内出现任一 `recommended:true` ⇒ 很可能是**漏传 cardKind 的
          // decision 卡**，**不得**走 choice 默认兜底——尤其 Convener 的 appointment 默认会把材料性选择
          // 误当任命卡（发生在桌面校验之前，并可能写 appointment 账本）。识别必须在默认逻辑之前。
          if (isTrio && cardKind === undefined && req.kind === "choice" && !hasRecommendedOption(req)) {
            const defaulted = defaultGovernanceChoiceCardKind(
              trioSpec!.id,
              req.options.map((option) => option.id),
            );
            const defaultMatrix = await matrixForFlow(req.flowId ?? originalMetadata?.flowId);
            if (defaulted !== undefined && cardKindsOf(trioSpec!.id, defaultMatrix).includes(defaulted)) {
              cardKind = defaulted;
              effectiveReq = { ...req, cardKind: defaulted };
              effectiveMetadata = { ...(originalMetadata ?? {}), cardKind: defaulted };
              log.record("governance.cardKind.defaulted", {
                roleId: setup.role.id,
                cardKind: defaulted,
                kind: "choice",
              });
            }
          }
          // 2026-10-26 decision 卡 fail-closed（与桌面 `evaluateDecisionCardRequest` 的 `missing-card-kind`
          // 同向，且对 CLI 通道同样生效）：内置治理角色发出的 choice 卡带 `recommended:true` 却没有
          // `cardKind` ⇒ 卡种不明；不默认、不触达客户、不写账本，要求显式携带 cardKind（如 decision）重试。
          if (isTrio && req.kind === "choice" && cardKind === undefined && hasRecommendedOption(req)) {
            log.record("governance.card.rejected", {
              state: "not-presented",
              reasonCode: "missing-card-kind",
              ok: false,
            });
            return {
              outcome: "declined",
              notPresented: true,
              reason:
                "choice 卡包含 recommended 推荐项但缺少 cardKind，无法确定为 decision 卡" +
                "（不会默认成 appointment/提案/验收等任何卡种）；本次未向客户发卡、未写账本。" +
                "请显式携带 cardKind（如 decision）后重试。",
            };
          }
          // 2026-10-29（方案 v2.1 §5.1/M3）：招人决定卡（appointment）——legacy 只有人事可发；选项必须恰为
          // 最新名单角色（多选）；推荐集由应用从名单生成（不采信模型自报）。不满足 ⇒ 不发卡。
          // T3 B3.1（2026-11-10，AC-13/G-10）：fixed 矩阵（v1.3 §8.3）改由幕僚（chief）发起任命卡
          // （`fixedCards` 含 appointment；nominator fixedCards 为空）；选项=名单角色、multiple、推荐集=
          // 名单顺序由应用重建（`targetRoleIds`/workflowId 戳由应用通道/桌面 B3 落账）。legacy 发起人/
          // 校验/文案逐字不变。
          let appointmentRecommendedRoleIds: string[] | undefined;
          if (cardKind === "appointment") {
            const rejectAppointment = (reason: string) => {
              log.record("governance.card.rejected", {
                state: "not-presented",
                reasonCode: "appointment-invalid",
                ok: false,
              });
              return { outcome: "declined" as const, notPresented: true as const, reason };
            };
            const appointmentFlowId = effectiveReq.flowId ?? effectiveMetadata?.flowId;
            // 按本卡实际 flowId 解析矩阵（per-flow；缺省 legacy）。fixed 只允许模块 `fixedCards` 含
            // appointment 的角色（恰 chief）；legacy 仍只允许 nominator（逐字不变）。
            const appointmentMatrix = await matrixForFlow(appointmentFlowId);
            const fixedAppointment = appointmentMatrix === "two-fixed-paths/v1";
            if (fixedAppointment) {
              if (!isTrio || trioSpec === undefined || !cardKindsOf(trioSpec.id, appointmentMatrix).includes("appointment")) {
                return rejectAppointment(
                  "固定路径的任命卡（appointment）只能由幕僚（chief）发起（fixedCards 矩阵）；本次未向客户发卡、未写任何记录。",
                );
              }
            } else if (!isTrio || trioSpec?.id !== "nominator") {
              return rejectAppointment(
                "招人决定卡（appointment）只能由人事（nominator）发起；本次未向客户发卡、未写任何记录。",
              );
            }
            if (typeof appointmentFlowId !== "string" || appointmentFlowId.trim() === "") {
              return rejectAppointment("招人决定卡缺少 flowId（用于定位最新人员名单）；本次未向客户发卡。");
            }
            if (effectiveReq.kind !== "choice") {
              return rejectAppointment("招人决定卡必须是 choice 卡（多选名单角色）；本次未向客户发卡。");
            }
            const roster = await loadLatestRoster({ projectRoot: input.project.projectRoot, flowId: appointmentFlowId });
            if (!roster.ok) {
              return rejectAppointment(`招人决定卡前置不满足：${roster.reason} 请先让策划产出合法名单。`);
            }
            if (fixedAppointment) {
              // v1.3 §8.3：选项集合=名单、multiple、推荐集=名单顺序（应用从 roster 重建，不采信模型
              // 自报的选项/推荐 flags）；不得含内置角色 id。fixed 不套用 legacy D3 的 env-bootstrap/
              // 人事模块 preflight（fixed 无 D3 阶段），结构口径与桌面 B3
              // `prepareFixedAppointmentCardRequest` 一致。
              const rosterIds = rosterRoleIds(roster.roster);
              const optionIds = effectiveReq.options.map((option) => option.id);
              if (effectiveReq.multiple !== true) {
                return rejectAppointment("固定路径任命卡必须是多选（multiple=true，名单角色）；本次未向客户发卡。");
              }
              if (new Set(optionIds).size !== optionIds.length) {
                return rejectAppointment("固定路径任命卡选项 id 重复；本次未向客户发卡。");
              }
              if (rosterContainsBuiltInRoleIds(roster.roster)) {
                return rejectAppointment("固定路径任命卡名单含内置治理角色；本次未向客户发卡。");
              }
              const optionSet = new Set(optionIds);
              const rosterSet = new Set(rosterIds);
              const missing = rosterIds.filter((id) => !optionSet.has(id));
              const extra = optionIds.filter((id) => !rosterSet.has(id));
              if (missing.length > 0 || extra.length > 0) {
                return rejectAppointment(
                  `固定路径任命卡选项必须与最新名单角色完全一致（缺：${missing.join("、") || "无"}；多：${extra.join("、") || "无"}）。本次未向客户发卡。`,
                );
              }
              appointmentRecommendedRoleIds = rosterIds;
              effectiveReq = {
                ...effectiveReq,
                multiple: true,
                options: roster.roster.roles.map((role) => ({ id: role.id, label: role.displayName, recommended: true })),
              };
              // A10 在办标记（stage.requested A10；幂等）；失败 fail-closed、不发卡。
              const appointmentMarker = await markFixedAppointmentCardRequested({
                projectRoot: input.project.projectRoot,
                flowId: appointmentFlowId.trim(),
                rosterSha256: roster.sha256,
              });
              if (appointmentMarker !== undefined) {
                log.record("governance.card.rejected", {
                  state: "not-presented",
                  reasonCode: appointmentMarker.code,
                  ok: false,
                });
                return rejectAppointment(`${appointmentMarker.message}；本次未向客户发卡。`);
              }
            } else {
              const rosterCard = validateAppointmentCardAgainstRoster({
                roster: roster.roster,
                optionIds: effectiveReq.options.map((option) => option.id),
                multiple: effectiveReq.multiple === true,
              });
              if (!rosterCard.ok) {
                return rejectAppointment(`招人决定卡与最新名单不一致：${rosterCard.reason} 本次未向客户发卡。`);
              }
              appointmentRecommendedRoleIds = rosterCard.recommendedRoleIds;
              // X-R3（E2 S4）：D3 卡角色侧前置——在既有名单/选项/推荐集/env-bootstrap 校验之后调用
              // nominator 模块 `preflight.checkAction("appointment", stage:"d3-card")`。事实只取自已校验的
              // `loadLatestRoster` 产物与 `rosterCard` 结果（严格 api-spec 登记键；`intentEntryConsistent`
              // 是可选诊断事实且旧路径不校验 ⇒ 不传）。allow 不替代应用/Service 校验；deny 走既有
              // `appointment-invalid` 回执（`rejectAppointment`），不发卡、不写账本。
              const nominatorPreflight = builtInRoleModuleOf("nominator")?.preflight;
              const nominatorFacts = nominationD3CardFacts({
                roster,
                multiple: effectiveReq.multiple === true,
                optionIds: effectiveReq.options.map((option) => option.id),
                recommendedRoleIds: rosterCard.recommendedRoleIds,
              });
              if (nominatorPreflight !== undefined && nominatorFacts !== undefined) {
                const decision = nominatorPreflight.checkAction({ action: "appointment", facts: nominatorFacts });
                if (!decision.allow) {
                  return rejectAppointment(
                    `招人决定卡未通过人事角色策略前置（诊断码：${decision.code}）；本次未向客户发卡、未写任何记录。`,
                  );
                }
              }
            }
            // 2026-10-29（客户追加口径）：D3 卡 preview 必须带上「人员+模块拓扑图」（应用依据已校验名单生成）。
            const topologyText = rosterTopologyText(roster.roster);
            const existingPreview = typeof effectiveReq.preview === "string" ? effectiveReq.preview.trim() : "";
            effectiveReq = {
              ...effectiveReq,
              preview: existingPreview === "" ? topologyText : `${existingPreview}\n\n${topologyText}`,
            };
          }
          // 2026-10-26（独立验收 F2）：decision 卡结构校验的**单一共享实现**（`common/编排/decision-card.ts`）。
          // 在触达客户通道**之前**执行——CLI、single su 与项目角色没有桌面卡校验，必须由编排兜住；
          // 不通过 ⇒ declined + notPresented（不调 raw、不写账本、不带 operatorId）。桌面窗口后续经本文件
          // （Pipeline 公共出口）复用同一函数，不复制第二份。
          if (cardKind === "decision") {
            const validation = validateDecisionCardRequest({
              request: effectiveReq,
              roleId: setup.role.id,
              governanceModel,
              metadata: effectiveMetadata,
            });
            if (!validation.ok) {
              log.record("governance.card.rejected", {
                state: "not-presented",
                reasonCode: validation.reasonCode,
                ok: false,
              });
              return {
                outcome: "declined",
                notPresented: true,
                reason: decisionCardRejectionReason(setup.role.id, validation),
              };
            }
          }
          // 2026-10-20 真机：Lead 的通用 choice（如 keep-v1/do-v2/lead-decide）没有 confirm 选项，属于
          // **内部协调/工程决策**，不应呈现客户；显式 intent-confirm 缺 confirm 也同样拒绝。
          // 不发卡、不发行、不调判断、不写 customer.decision（客户只处理 intent-confirm 需求确认）。
          if (isTrio && req.kind === "choice" && isCoordinatorGovernanceSpec(trioSpec)) {
            const optionIds = req.options.map((option) => option.id);
            // X-R6（E2 S2）：intent-confirm 的卡种/必需选项 id 读 chief 模块卡数据（唯一真源）；
            // 文案保持既有口径（卡面数据不含用户文案）。
            if (!optionIds.includes(CHIEF_INTENT_CONFIRM_CARD.requiredOptionId)
              && (cardKind === undefined || cardKind === CHIEF_INTENT_CONFIRM_CARD.cardKind)) {
              const reason = cardKind === CHIEF_INTENT_CONFIRM_CARD.cardKind
                ? "intent-confirm 必须有 confirm/revise 选项；本卡缺少 confirm 选项，未向客户呈现。请补齐选项后重试。"
                : "这是内部协调/工程决策，不应要求客户选择；请幕僚自行决定，或用 dispatch_task 派给项目角色；客户只处理 intent-confirm 需求确认。";
              log.record("governance.choice.rejected", {
                roleId: setup.role.id,
                reason,
                optionIds,
              });
              return { outcome: "declined", reason };
            }
          }
          if (isTrio) {
            const flowId = effectiveReq.flowId ?? effectiveMetadata?.flowId;
            // T3 B1（AC-12）：卡种白名单按**本卡实际 flowId** 解析矩阵（per-flow，不缓存项目级单值）。
            const allowed = cardKindsOf(trioSpec!.id, await matrixForFlow(flowId));
            // C 批（方案 §6.4.1/R2）：归属键由 `flowId` 放宽为 `flowId | intentId | taskId` 至少一个；
            // 旧调用（只带 flowId）逐字仍有效。优先 flowId，其次 intentId，最后 taskId。
            const attributionId = isGovernanceFlowId(flowId)
              ? flowId
              : isGovernanceFlowId(effectiveMetadata?.intentId)
                ? effectiveMetadata!.intentId
                : isGovernanceFlowId(effectiveMetadata?.taskId)
                  ? effectiveMetadata!.taskId
                  : undefined;
            if (req.kind === "confirm") {
              // 严格口径（设计 §4.5 顺序）：1) 缺 cardKind → 拒；2) 显式 cardKind 越权 → 拒（既有文案）；
              // 3) flowId 缺失/格式非法 → 拒；此后才进入既有 preview/YAML 闸与 judgeContext 计算。
              const rejectNotPresented = (reason: string, reasonCode: string): CustomerInputOutcome => {
                // 诊断只用共享白名单字段（state/reasonCode/ok）；flowId/cardKind 不在白名单，不记录。
                log.record("governance.card.rejected", { state: "not-presented", reasonCode, ok: false });
                return { outcome: "declined", reason, notPresented: true };
              };
              const flowIdOk = attributionId !== undefined;
              const allowedConfirmKinds = confirmCardKindsOf(trioSpec!.id);
              const allowedText = allowedConfirmKinds.length > 0 ? allowedConfirmKinds.join(" / ") : "无";
              const bothHint =
                `治理角色的 request_confirmation 必须同时携带归属键（flowId / intentId / taskId 至少一个）与 cardKind（本角色允许：${allowedText}）；` +
                "本次未发行任何写入路径、未写入账本。";
              if (cardKind === undefined) {
                const missing = ["缺少 cardKind"];
                if (!flowIdOk) {
                  missing.push(`缺少合法的 flowId（或 intentId/taskId；须为非空小写 slug，匹配 ${GOVERNANCE_SLUG_PATTERN}）`);
                }
                return rejectNotPresented(
                  `${missing.join("；")}。${bothHint}`,
                  flowIdOk ? "missing-card-kind" : "missing-card-kind-and-flow-id",
                );
              }
              if (!allowed.includes(cardKind)) {
                log.record("governance.cardKind.rejected", {
                  roleId: setup.role.id,
                  cardKind,
                  allowed: [...allowed],
                });
                return { outcome: "declined", reason: cardKindNotAllowedReason(setup.role.id, cardKind, allowed) };
              }
              if (!flowIdOk) {
                return rejectNotPresented(
                  `缺少合法的 flowId（或 intentId/taskId；须为非空小写 slug，匹配 ${GOVERNANCE_SLUG_PATTERN}）。${bothHint}`,
                  "missing-flow-id",
                );
              }
              // 设计 §4.2：主入口（旧 liaison / 新 chief）的确认卡一律拒绝（其确认卡允许集为空；
              // 需求确认只走 request_choice 的 intent-confirm）。即便直接调用包装器给出白名单内的
              // choice 类 cardKind 也不放行。
              if (isCoordinatorGovernanceSpec(trioSpec)) {
                return rejectNotPresented(
                  `治理角色 ${trioSpec!.id} 不使用 request_confirmation 做治理写盘；确认卡一律不发送` +
                    "（需求确认请用 request_choice 的 intent-confirm）。本次未发行任何写入路径、未写入账本。",
                  "role-not-allowed",
                );
              }
              currentFlowId = flowId;
            } else {
              if (cardKind !== undefined && !allowed.includes(cardKind)) {
                log.record("governance.cardKind.rejected", {
                  roleId: setup.role.id,
                  cardKind,
                  allowed: [...allowed],
                });
                return { outcome: "declined", reason: cardKindNotAllowedReason(setup.role.id, cardKind, allowed) };
              }
              if (isGovernanceFlowId(flowId)) currentFlowId = flowId;
            }
          }
          // 2026-10-19 真机 op-2 修复（呈现前 fail-closed）：写盘类确认卡声明了写入路径时，preview
          // 必须对**每一条**路径给出可核对正文/结构。不完整 ⇒ **不发卡**、不发行任何写入路径，直接
          // 把缺正文的路径与重试要求如实交回模型（不让「证据完整性」依赖判断 agent/模型自觉）。
          // 非写盘确认（无路径）与 choice 卡：declaredPaths 为空 ⇒ 旧行为逐字不变。
          const completeness = validateConfirmPreviewCompleteness(effectiveReq);
          if (!completeness.ok) {
            log.record("confirmation.preview.incomplete", {
              roleId: setup.role.id,
              declaredPaths: completeness.declaredPaths,
              missingPaths: completeness.missingPaths,
            });
            return {
              outcome: "declined",
              reason:
                `确认卡未呈现：preview 未包含以下声明写入路径的可核对正文/结构：${completeness.missingPaths.join("、")}。` +
                `每条声明路径都必须以标题（如 \`## <路径>\`）或代码围栏说明（如 \`\`\`md <路径>\`\`\`）出现，` +
                `且其后紧跟该路径的完整正文/代码块（至少一行非空内容）。` +
                `请把每条路径的完整正文或明确结构放进同一个 preview 后重试，并继续在 paths 参数中逐条列出这些路径；` +
                `本次未向客户发卡，也未发行任何写入路径。`,
            };
          }
          // 2026-10-29（方案 v2.1 §5.1/M4）：名单给该角色的授权目录（boundary 条目必须 ⊆ 名单目录）。
          // 最新名单可读时强制；不可读时由 M11 的 D3 名单版本校验兜底（新链 D3 必带名单 version/hash）。
          let appointmentAllowedDirectories: string[] | undefined;
          const previewCardKind = effectiveReq.cardKind ?? effectiveMetadata?.cardKind;
          if (previewCardKind === "appointment-write") {
            const previewFlowId = effectiveReq.flowId ?? effectiveMetadata?.flowId;
            const previewTarget = typeof effectiveMetadata?.targetRoleId === "string" ? effectiveMetadata.targetRoleId.trim() : "";
            if (typeof previewFlowId === "string" && previewFlowId !== "" && previewTarget !== "") {
              const roster = await loadLatestRoster({ projectRoot: input.project.projectRoot, flowId: previewFlowId });
              if (roster.ok) {
                appointmentAllowedDirectories = rosterDirectoriesFor(roster.roster, previewTarget) ?? [];
              }
            }
          }
          // C-06（方案 §6.4.1/R2）：appointment-write 预览结构校验（新路径 targetRoleId/decisionId +
          // 角色卡目录/必需章节/boundary YAML）。旧 flow 路径（只带 flowId）不新增门槛；失败不发卡。
          const appointmentPreviewError = validateAppointmentWritePreview({
            request: effectiveReq,
            metadata: effectiveMetadata,
            declaredPaths: completeness.declaredPaths,
            ...(appointmentAllowedDirectories !== undefined ? { allowedDirectories: appointmentAllowedDirectories } : {}),
          });
          if (appointmentPreviewError !== undefined) {
            log.record("governance.card.rejected", {
              state: "not-presented",
              reasonCode: "appointment-write-structure",
              ok: false,
            });
            return { outcome: "declined", notPresented: true, reason: appointmentPreviewError };
          }
          // D 批：judgeContext 只从申请上下文构造（无账本/flow 事实）；Q4 A rubric 保留。
          // T3 B3.1（AC-13）：卡种白名单按本卡实际 flowId 的矩阵判定——fixed 会话的 chief proposal/
          // appointment 卡同样生成 judgeContext（含推荐集）；legacy 矩阵结果与旧 `cardKindsOf(roleId)`
          // 逐字一致（缺省 legacy-v1），旧卡路径零变化。
          let judgeMetadata = effectiveMetadata;
          const judgeCardFlowId = effectiveReq.flowId ?? effectiveMetadata?.flowId;
          if (isTrio && cardKind !== undefined && cardKindsOf(trioSpec!.id, await matrixForFlow(judgeCardFlowId)).includes(cardKind)) {
            const flowId = judgeCardFlowId;
            const judgeAttribution = isGovernanceFlowId(flowId)
              ? flowId
              : isGovernanceFlowId(effectiveMetadata?.intentId)
                ? effectiveMetadata!.intentId
                : isGovernanceFlowId(effectiveMetadata?.taskId)
                  ? effectiveMetadata!.taskId
                  : undefined;
            if (judgeAttribution !== undefined) {
              const targetRoleId =
                typeof effectiveMetadata?.targetRoleId === "string" ? effectiveMetadata.targetRoleId.trim() : "";
              const facts = buildGovernanceJudgeFacts({
                flowId: judgeAttribution,
                ...(cardKind === "appointment-write" && targetRoleId !== ""
                  ? { facts: { appointmentTargetRoleIds: [targetRoleId] } }
                  : {}),
              });
              // 2026-10-29（真机 BUG-3）：appointment-write 的判断事实必须带**角色可写根**与逐路径机械探测，
              // 否则证据包读到空 allowedPathRoots，会把 `角色卡/<target>/` 的合法写盘判成越界（C 批测试
              // 直接构造参数，漏了这条生产接线）。根 = 目标角色卡目录 ∪ 名单给该目标的授权目录（已按 M4
              // 校验 ⊆ 名单）；探测与真实写盘同一个 `gate`（resolveWrite + 治理禁写前缀）。
              const appointmentJudge =
                cardKind === "appointment-write" && targetRoleId !== ""
                  ? {
                      allowedPathRoots: [
                        `角色卡/${targetRoleId}/`,
                        ...(appointmentAllowedDirectories ?? []),
                      ],
                      pathProbes: completeness.declaredPaths.map((declaredPath) => {
                        const decision = gate(declaredPath);
                        return decision.allowed === true
                          ? { path: declaredPath, allowed: true }
                          : {
                              path: declaredPath,
                              allowed: false,
                              ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
                            };
                      }),
                    }
                  : {};
              // 2026-10-30（§5A/P9.3）：决策组**唯一解析器**——请求显式 → 提案 → 产品 → flow-id；
              // 冲突/非法 slug fail-closed（intentResolutionError 随证据进入判断，禁止 approve）。
              const explicitIntentId =
                typeof effectiveMetadata?.intentId === "string" ? effectiveMetadata.intentId.trim() : "";
              let judgeIntentId: string | undefined;
              let judgeIntentIdSource: "request" | "proposal" | "product" | "flow-id" | undefined;
              let judgeIntentResolutionError: { code: string; detail: string } | undefined;
              if (cardKind === "proposal" || cardKind === "appointment" || cardKind === "acceptance") {
                const intentFacts = await readIntentEntryFacts({
                  projectRoot: input.project.projectRoot,
                  flowId: judgeAttribution,
                });
                const resolution = resolveIntentEntryReference({
                  flowId: judgeAttribution,
                  ...(explicitIntentId !== "" ? { requestIntentId: explicitIntentId } : {}),
                  ...(intentFacts.proposalIntentId !== undefined && intentFacts.proposalIntentId !== "" ? { proposalIntentId: intentFacts.proposalIntentId } : {}),
                  ...(intentFacts.productIntentId !== undefined && intentFacts.productIntentId !== "" ? { productIntentId: intentFacts.productIntentId } : {}),
                });
                if (resolution.ok) {
                  judgeIntentId = resolution.intentId;
                  judgeIntentIdSource = resolution.source;
                } else {
                  judgeIntentResolutionError = { code: resolution.code, detail: resolution.detail };
                }
              }
              const judgeContext: GovernanceJudgeContext = {
                flowId: judgeAttribution,
                ...(judgeIntentId !== undefined ? { intentId: judgeIntentId, ...(judgeIntentIdSource !== undefined ? { intentIdSource: judgeIntentIdSource } : {}) } : {}),
                ...(judgeIntentResolutionError !== undefined ? { intentResolutionError: judgeIntentResolutionError } : {}),
                facts,
                ...appointmentJudge,
                ...(cardKind === "appointment" && appointmentRecommendedRoleIds !== undefined
                  ? { recommendedRoleIds: appointmentRecommendedRoleIds }
                  : {}),
                ...(effectiveMetadata?.toolCallId !== undefined ? { toolCallId: effectiveMetadata.toolCallId } : {}),
                ...(effectiveMetadata?.turnId !== undefined ? { turnId: effectiveMetadata.turnId } : {}),
                ...(effectiveReq.kind === "confirm" && effectiveReq.paths !== undefined ? { paths: [...effectiveReq.paths] } : {}),
              };
              judgeMetadata = { ...(effectiveMetadata ?? {}), judgeContext };
            }
          }
          let intentConfirmation: PreparedIntentConfirmation | undefined;
          // T3 B3.1（2026-11-10，AC-18/MF-4）：fixed 意图确认卡——run-role 调 `workflowService.prepareIntent`
          // /`finalizeIntent`（应用算 intent hash/documentRefs/marker、`docs/intents` 校验、`stage.completed`），
          // **不调用** legacy trunk `prepareIntentConfirmation/finalizeIntentConfirmation`/doc-freeze；
          // 卡事实（marker/path/sha256/正文）与 legacy 同等语义。legacy 分支逐字不变。
          let fixedIntentConfirmation: PreparedFixedIntent | undefined;
          // X-R6（E2 S2）：intent-confirm 卡种读 chief 模块卡数据（`CHIEF_INTENT_CONFIRM_CARD.cardKind`）；
          // 其余流程（prepareIntentConfirmation / 冻结 / 标记）仍按 Service 事务与真实客户回执。
          if (isTrio && setup.role.id === "chief" && cardKind === CHIEF_INTENT_CONFIRM_CARD.cardKind && effectiveReq.kind === "choice") {
            const flowId = effectiveReq.flowId ?? effectiveMetadata?.flowId;
            if ((await matrixForFlow(flowId)) === "two-fixed-paths/v1") {
              // fixed：无 trunk/run。缺 flowId ⇒ 不发卡（无法定位最新意图；fail-closed）。
              if (typeof flowId !== "string" || flowId.trim() === "") {
                log.record("governance.card.rejected", { state: "not-presented", reasonCode: "intent-decision-invalid", ok: false });
                return { outcome: "declined", notPresented: true, reason: "固定路径意图确认卡缺少 flowId（无法定位最新意图）；本次未向客户发卡。" };
              }
              const prepared = await workflowPrepareIntent({ projectRoot: input.project.projectRoot, flowId });
              if (!prepared.ok) {
                log.record("governance.card.rejected", { state: "not-presented", reasonCode: prepared.code, ok: false });
                return { outcome: "declined", notPresented: true, reason: prepared.message ?? prepared.code };
              }
              fixedIntentConfirmation = prepared;
              effectiveReq = { ...effectiveReq, question: `${effectiveReq.question ?? ""}\n\n${prepared.marker}`,
                preview: `${effectiveReq.preview ?? ""}\n\n${prepared.path}\nsha256: ${prepared.sha256}\n\n${prepared.text}` };
            } else {
              const prepared = flowId ? await createTrunkService({ projectRoot: input.project.projectRoot }).prepareIntentConfirmation(flowId) : undefined;
              if (!prepared?.ok) return { outcome: "declined", notPresented: true, reason: prepared && !prepared.ok ? prepared.message ?? prepared.code : "Intent confirmation has no actual flow" };
              intentConfirmation = prepared.value;
              effectiveReq = { ...effectiveReq, question: `${effectiveReq.question ?? ""}\n\n${prepared.value.marker}`,
                preview: `${effectiveReq.preview ?? ""}\n\n${prepared.value.path}\nsha256: ${prepared.value.sha256}\n\n${prepared.value.text}` };
            }
          }
          let out = await raw(effectiveReq, judgeMetadata);
          if (isTrio && setup.role.id === "nominator" && cardKind === "appointment") await refreshRoleDraftScope();
          if (intentConfirmation && out?.outcome === "answered" && out.value.selected?.includes("confirm")) {
            const intentBinding = { flowId: intentConfirmation.flowId, path: intentConfirmation.path, version: intentConfirmation.version,
              sha256: intentConfirmation.sha256, snapshotRef: intentConfirmation.snapshotRef, decisionId: out.decisionId,
              actionSource: out.actionSource, turnId: effectiveMetadata?.turnId, toolCallId: effectiveMetadata?.toolCallId };
            // Existing diagnostics admits metadata strings, not arbitrary object fields.
            const intentDiagnostic = { path: intentBinding.path, turnId: intentBinding.turnId, toolCallId: intentBinding.toolCallId,
              requestId: out.actionSource?.kind === "customer-decision" || out.actionSource?.kind === "chief-delegated" ? out.actionSource.requestId : undefined,
              contextSource: JSON.stringify({ flowId: intentBinding.flowId, version: intentBinding.version, sha256: intentBinding.sha256,
                snapshotRef: intentBinding.snapshotRef, decisionId: intentBinding.decisionId }) };
            log.record("intent.confirmation.freeze-start", { ...intentDiagnostic, phase: "prepared" });
            const frozen = await createTrunkService({ projectRoot: input.project.projectRoot }).finalizeIntentConfirmation(intentConfirmation, out);
            if (!frozen.ok) {
              pendingModelNotice = `The actual intent decision was recorded; its bound bytes are not yet frozen: ${frozen.message ?? frozen.code}. Direct publication remains blocked until recovery.`;
              log.record("intent.confirmation.freeze-pending", { ...intentDiagnostic, phase: "pending-recovery", errorCode: frozen.code, errorMessage: frozen.message });
              // The retained choice is real; a failed domain commit cannot issue a write permit.
              return { ...out, intentConfirmation: { status: "pending-recovery", code: frozen.code, message: frozen.message } };
            } else {
              log.record("intent.confirmation.freeze-committed", { ...intentDiagnostic, phase: "committed" });
              await refreshAndInstallVersionedDocFreezeSnapshot(input.project.projectRoot, { migrationCompleted: true });
              out = { ...out, intentConfirmation: { status: "committed" } };
            }
          }
          // T3 B3.1（AC-18/§4.2 A3/G-15）：fixed 意图确认最终化——`request.resolved` 由应用通道在裁决时
          // **一次写入**（含 documentRefs），`finalizeIntent` 只校验该事件并追加 `stage.completed A3`；
          // 不重写事件、不写 doc-freeze/trunk/CAS。事件缺失/不可读或校验失败 ⇒ 如实 pending-recovery
          // （与 legacy 冻结失败同语义：真实决定已记录，阶段完成待恢复，不发行任何写权）。
          if (fixedIntentConfirmation && out?.outcome === "answered" && out.value.selected?.includes("confirm")) {
            const delegatedRequestId = out.actionSource?.kind === "customer-decision" || out.actionSource?.kind === "chief-delegated"
              ? out.actionSource.requestId : undefined;
            const decisionRequestId = typeof out.decisionId === "string" && out.decisionId.startsWith("decision-")
              ? out.decisionId.slice("decision-".length) : undefined;
            const requestId = delegatedRequestId ?? decisionRequestId;
            let resolvedEvent: RequestResolvedEvent | undefined;
            if (requestId !== undefined) {
              try {
                const taskState = await readTaskState(input.project.projectRoot);
                resolvedEvent = taskState.events.find((event): event is RequestResolvedEvent =>
                  event.kind === "request.resolved" && event.requestId === requestId);
              } catch {
                resolvedEvent = undefined;
              }
            }
            if (resolvedEvent === undefined) {
              const message = `request.resolved（${requestId ?? "<unknown>"}）账本事件缺失或不可读`;
              pendingModelNotice = `The actual intent decision was recorded; its fixed workflow A3 completion is pending: ${message}. 请核对账本后按幂等重试。`;
              log.record("intent.confirmation.fixed-finalize-pending", { path: fixedIntentConfirmation.path, requestId, phase: "pending-recovery", errorCode: "intent-decision-invalid", errorMessage: message });
              return { ...out, intentConfirmation: { status: "pending-recovery", code: "intent-decision-invalid", message } };
            }
            log.record("intent.confirmation.fixed-finalize-start", { path: fixedIntentConfirmation.path, turnId: effectiveMetadata?.turnId, toolCallId: effectiveMetadata?.toolCallId, requestId, phase: "prepared" });
            const finalized = await workflowFinalizeIntent({
              projectRoot: input.project.projectRoot,
              event: resolvedEvent,
              ...(fixedIntentConfirmation.flowId !== "" ? { flowId: fixedIntentConfirmation.flowId } : {}),
            });
            if (!finalized.ok) {
              pendingModelNotice = `The actual intent decision was recorded; its fixed workflow A3 completion is pending: ${finalized.message ?? finalized.code}. 请按提示修复后重试（幂等）。`;
              log.record("intent.confirmation.fixed-finalize-pending", { path: fixedIntentConfirmation.path, requestId, phase: "pending-recovery", errorCode: finalized.code, errorMessage: finalized.message });
              return { ...out, intentConfirmation: { status: "pending-recovery", code: finalized.code, message: finalized.message } };
            }
            log.record("intent.confirmation.fixed-finalize-committed", { path: fixedIntentConfirmation.path, requestId, phase: "committed" });
            out = { ...out, intentConfirmation: { status: "committed" } };
          }
          // 发行「已确认且在边界内」的实际写入路径（D 批无账本；发行器仍按同一份校验）。
          issue(effectiveReq, out ?? null, effectiveMetadata);
          return out;
        };
      })()
    : undefined;

  // —————— 2026-10-29（方案 v2.1 §6.3/§6.5）：shell 写目标守卫 + 执行后写审计 ——————
  // checkWrite 与 F4 写区判定**同一实现**（gate → resolveWrite，含 forbiddenWritePaths 与任务 scope 收窄）；
  // 守卫不另写第二份真实路径判定。显式写目标越界即拒；不透明执行交客户本人（manualOnly）。
  const shellCheckWrite = (relPath: string): { allowed: boolean; reason?: string } => {
    if (isTrio && setup.role.id === "nominator" && /^角色卡\/[^/]+\/(?:role-card\.md|boundary\.md|boundary\.yaml)$/.test(relPath))
      return { allowed: false, reason: "D3 role drafts use the guarded write_file/edit_file path; opaque shell cannot write or activate role documents" };
    const decision = gate(relPath);
    return decision.allowed === true ? { allowed: true } : { allowed: false, reason: decision.reason };
  };
  const shellWriteGuard = (req: ShellReviewRequest) =>
    evaluateShellWriteTargets({
      argv: req.argv,
      cwd: req.cwd,
      // 2026-11-08（W3-G / AC-22）：真实入口——只读 Git 放行仅前台 `run_shell`；后台入口维持 Git 硬拒。
      entry: req.entry ?? "run_shell",
      projectRoot: input.project.projectRoot,
      skillRoot: input.project.skillRoot,
      boundary: setup.role.boundary,
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      conditions,
      forbiddenPrefixes: trioSpec?.forbiddenWritePaths ?? [],
      checkWrite: shellCheckWrite,
      // 2026-11-04（S3/F33）：显式目标统一走同一同步冻结判定（快照唯一实现归 C2b）；
      // shell/opaque 无内容 hash ⇒ stable 目标一律拒绝（C7），不新增 shell stable 写入路径。
      freezeStateOf: (rel) =>
        versionedDocFreezeState(
          input.project.projectRoot,
          rel,
          versionedDocExists(input.project.projectRoot, rel),
        ),
      ...(input.stablePermitOf !== undefined ? { stablePermitOf: input.stablePermitOf } : {}),
    });
  // 执行后写审计（仅在 shell 已 arm 时挂到 run_shell；缺省无副作用）。
  // 2026-10-29（客户 Q1/Q2 口径修正）：不透明执行/脚本命令的审查上下文（有界脚本内容）；
  // 内容不可读/超限/脚本在项目外 ⇒ 返回不可用（shell-gate fail-closed 拒绝）。
  const shellApprovalContextLoader = (req: ShellReviewRequest) =>
    buildShellApprovalContext({
      request: req,
      projectRoot: input.project.projectRoot,
      checkWrite: shellCheckWrite,
    });
  const shellPostAudit = createShellPostAudit({
    projectRoot: input.project.projectRoot,
    forbiddenPrefixes: trioSpec?.forbiddenWritePaths ?? [],
    checkWrite: shellCheckWrite,
    // 2026-11-04（S3/F33）：执行后审计注入同一同步冻结查询（draft 不误报 / frozen 与
    // unknown 越界 fail-closed；C2b 快照唯一实现）。
    freezeStateOf: (rel, exists) =>
      versionedDocFreezeState(input.project.projectRoot, rel, exists),
    // 2026-10-29（v2.4 P6）：显式声明的额外监视根（skillRoot）纳入执行后审计；不是项目外兜底。
    extraRoots:
      typeof input.project.skillRoot === "string" && input.project.skillRoot !== "" &&
      path.resolve(input.project.skillRoot) !== path.resolve(input.project.projectRoot)
        ? [input.project.skillRoot]
        : [],
  });

  // 回交（设计 §10.8）：角色会话 settle → 编排发 `handback` 事件，交回治理角色。
  // **星形最小系统（2026-10-29 客户实测）**：内置 worker（产品/策划/人事/运营/质检）也是幕僚的 worker，
  // 必须能经 `submit_report` 回报任务；仅幕僚本人（不自我回交）与 single/su 旧模型（非 trio）不注入。
  const suppressHandback =
    builtInGovernance && (trioSpec === undefined || trioSpec.id === "chief");

  // 交报告（C-1）：**只给回交主体（非 su）**注入 `reportHandback`——模型经 `submit_report` 交的报告
  // （`summary`/`evidence`/`status`）正常终局优先取报告值；su 不注入。无合法报告明确未报告。
  // 报告按运行时轮次保存，终局消费。无 metadata 的旧替身仅保留单轮兼容值。
  const taskReports = new Map<string, TaskReport>();
  const completedTurns = new Set<string>();
  let legacyReport: TaskReport | undefined;
  const turnIntents = new Map<string, HandbackIntent>();
  let legacyIntent: HandbackIntent | undefined;
  const reportHandback = suppressHandback
    ? undefined
    : (report: TaskReport, metadata?: ReportHandbackMetadata): ReportHandbackReceipt => {
        const turnId = metadata?.turnId;
        const normalized = normalizeTaskReport(report);
        const invalidMetadata = metadata !== undefined && (typeof turnId !== "string" || turnId === "");
        if (normalized === undefined || invalidMetadata || (turnId !== undefined && completedTurns.has(turnId))) {
          log.record("report.ignored", { turnId, reasonCode: normalized === undefined ? "invalid-report" : invalidMetadata ? "invalid-turn" : "closed-turn" });
          return { ok: false, message: "报告无效或所属轮次已关闭，未接收。" };
        }
        if (turnId !== undefined) taskReports.set(turnId, normalized);
        else legacyReport = normalized;
        log.record("report.received", { turnId, state: normalized.status, reportSource: "submit_report", count: normalized.evidence?.length ?? 0 });
        return { ok: true, state: "accepted-memory" };
      };

  // D-1：能力面携带所选角色/runtime 的路径；实际 store 由 Service 按所选 runtime 建立。
  // 编排只**算路径**、**不预建目录**（创建归适配器在真正落盘时做——理由见 AdapterCapabilities.sessionDir）。
  // projectRoot 为空 / roleId 不安全 / **`persistSession:false`（R-1 审读会话）** → 不传（in-memory）。
  const sessionDir =
    input.persistSession === false ? undefined : sessionDirFor(input.project.projectRoot, setup.role.id, input.runtime);

  // H-1 派发任务（评审 §5.6）：能力矩阵驱动——仅 `capabilities.dispatchTask`（trio=chief/convener；su 旧行为）。
  // B 批（2026-10-28）：**幕僚（trio chief）的星形派发不套旧 flow 派发门**——任务/汇报主链走
  // `tasks.jsonl`，目标由桌面星形路由校验（任意内置/项目 worker、自身除外）。convener 的旧 dispatch
  // 仍逐字走原派发范围门（保留至 D）；single/su 旧行为不变。
  const dispatchTask: DispatchTaskFn | undefined =
    cap?.dispatchTask === true && input.dispatchTask !== undefined ? input.dispatchTask : undefined;

  // G-2 看护三能力（R1/R2）：能力矩阵驱动——仅 `capabilities.roleStatus/sessionTail/proposeRecovery`
  // （trio=Convener；su 旧行为）。未注入 ⇒ 不注入（能力缺席 = 最强 fail-closed）。
  // 承载契约（字段名/形状）单一来源：`common/编排/watchdog.ts`。
  // B 批（2026-10-28）：chief 经上方能力叠加获得 roleStatus/sessionTail；`role_activity_log` 只给 chief。
  const roleStatus = cap?.roleStatus === true ? input.roleStatus : undefined;
  const sessionTail = cap?.sessionTail === true ? input.sessionTail : undefined;
  // X-R6（E2 S2）：以下三行是**旧角色门控回退值**（单/双人模型或模块未装配路径；旧源码行逐字保留，
  // 供迁移前差分 fixture 与回滚对照）。trio 下的实际注入值见下方 `effective*`：由已装配 chief 模块
  // `tools()` 的 D1 校验结果决定；模块声明缺席/校验失败 ⇒ 不注入（fail-closed，不放宽旧路径）。
  const roleActivityLog = trioSpec?.id === "chief" ? input.roleActivityLog : undefined;
  const terminateRoleRun = trioSpec?.id === "chief" ? input.terminateRoleRun : undefined;
  const redispatchTask = trioSpec?.id === "chief" ? input.redispatchTask : undefined;

  // 2026-11-02（全局任务状态/版本决策）：project_state 给全部内置治理角色（含旧 su）只读；
  // project_note / request_version_decision 只给 trio chief。未注入 ⇒ 工具不注册（fail-closed）。
  // X-R6（E2 S2）：project_note / request_version_decision 的旧门控保留为模块未装配时的回退值；
  // trio 实际注入改读 chief 模块 `tools()`（D1 校验后）。
  const projectState = builtInGovernance ? input.projectState : undefined;
  const projectNote = trioSpec?.id === "chief" ? input.projectNote : undefined;
  const requestVersionDecision = trioSpec !== undefined && canRequestVersionDecision(trioSpec.id) ? input.requestVersionDecision : undefined;

  // G-4 技能安装/卸载两能力（I1/I2）：能力矩阵驱动——仅 `capabilities.installSkill`
  // （trio=Nominator；su 旧行为）。字段名**逐字**＝契约家能力名（错一名 ⇒ 工具静默零注册）。
  const blockedRoleCapabilities = roleCapabilityProtection.state === "unmanaged" ? undefined : createBlockedRoleCapabilityCallbacks();
  const installSkill = cap?.installSkill === true && input.installSkill !== undefined ? blockedRoleCapabilities?.installSkill ?? input.installSkill : undefined;
  const uninstallSkill = cap?.installSkill === true && input.uninstallSkill !== undefined ? blockedRoleCapabilities?.uninstallSkill ?? input.uninstallSkill : undefined;

  // G-4 V2 MCP 安装/卸载两能力：能力矩阵驱动——仅 `capabilities.installMcp`
  // （trio=Nominator；su 旧行为）。**安装不改变任何角色的写边界**。
  const installMcp = cap?.installMcp === true && input.installMcp !== undefined ? blockedRoleCapabilities?.installMcp ?? input.installMcp : undefined;
  const uninstallMcp = cap?.installMcp === true && input.uninstallMcp !== undefined ? blockedRoleCapabilities?.uninstallMcp ?? input.uninstallMcp : undefined;

  // I-1 开放 shell（项目角色三层链）+ 审批档/只读档——共用同一个 `shellGate` 能力位
  // （「注入才注册」：注入了 ⇒ 适配器注册 `run_shell`；未注入/装配失败 ⇒ **不 arm**，fail-closed）。
  // 能力位按角色数据驱动（客户 2026-10-19 新规则：所有角色都有 shell 权限，含读写与任意命令，
  // 但一律经审批链；不按角色 id 硬编码）：
  //   · `shell: "operator-approve"`（五个内置治理角色 liaison/rapporteur/nominator/convener/verifier
  //     ＋ su 统一为该档）→ 审批档：只读白名单直接执行，其余（含读写与任意命令）逐条提交客户/
  //     判断 agent 审批；保留旧 `shellReadonly` 注入作为兼容路径（旧调用方/测试仍可使用；两档同时
  //     给出 ⇒ 不 arm）；
  //   · `shell: "none"` / `"readonly"` → **仅为旧数据/兼容保留**（新注册项不得再用）；`none` 即使
  //     调用方误传选项也拒绝并记诊断，`readonly` 仍可走只读档（更严，不放宽）；
  //   · 项目角色（cap undefined）→ 既有三层链/只读路径**逐字不变**。
  // 2026-10-31（shell 判拒升级方案 v1.3 §6.1）：每会话构造升级 registry（roleId/projectRoot 由闭包
  // 绑定；presenter 由调用方传 `shellEscalationPresenter`）。**回滚开关**：`ANS_SHELL_ESCALATION_DISABLED=1`
  // 或未提供 presenter ⇒ 不创建 registry；后续不注入 `takeGrant`、不注册 `request_shell_escalation`
  // （既有授权全部失效，fail-closed；方案 §13.2/AC-30）。
  const escalationEnv = input.shellEscalationOptions?.env ?? input.shellArming?.env ?? process.env;
  const shellEscalationSession: ShellEscalationSession | undefined =
    typeof input.shellEscalationPresenter === "function" && !shellEscalationDisabled(escalationEnv)
      ? createShellEscalationSession({
          roleId: setup.role.id,
          runtime: input.runtime ?? "pi",
          projectRoot: input.project.projectRoot,
          present: input.shellEscalationPresenter,
          ...(input.shellEscalationOptions ?? {}),
        })
      : undefined;
  const escalationWiring: ShellEscalationWiring =
    shellEscalationSession !== undefined
      ? {
          onReviewed: (req, outcome) => shellEscalationSession.recordReview(req, outcome),
          takeGrant: (req, context) => shellEscalationSession.takeGrant(req, context),
          onAuditSinkCreated: (sink) => shellEscalationSession.bindAudit(sink),
        }
      : {};

  // 2026-11-03（客户授权平面 B1）：审批指令消费者只在调用方注入 `customerDirective` 时接线；
  // 只读档（`shellReadonly`）**不注入**（结构上也不在只读选项面）；CLI 不传 ⇒ 空对象、行为逐字不变。
  const directiveWiring: ShellDirectiveWiring =
    input.customerDirective !== undefined
      ? { takeDirective: (req, intent) => input.customerDirective!.takeDirective(req, intent) }
      : {};

  let shellGate: ShellGate | undefined;
  if (chiefDecisionContext !== undefined) {
    // Independent real-chief contexts never construct a normal shell surface.
  } else if (input.shellOperatorOnly !== undefined) {
    if (input.shellReadonly !== undefined) {
      // 互斥：不择一静默生效（PM 评审 §3.4）。
      log.record("shell.operatorOnly.rejected", { mode: "shellOperatorOnly", outcome: "not-armed", reasonCode: "conflicts-with-shellReadonly" });
    } else if (cap?.shell !== "operator-approve") {
      // 审批档只属于能力位声明 `operator-approve` 的角色（2026-10-19 起＝五个内置治理角色＋su）；
      // 项目角色（cap undefined）/旧能力位误传不得把三层链绕成「客户全权审批」。
      log.record("shell.operatorOnly.rejected", { mode: "shellOperatorOnly", outcome: "not-armed", reasonCode: "capability-denied" });
    } else {
      try {
        shellGate = await assembleOperatorShellGate({ project: input.project, ...input.shellOperatorOnly, ...escalationWiring, ...directiveWiring, writeGuard: shellWriteGuard, snapshotBefore: (req) => shellPostAudit.snapshotBefore(req), approvalContextLoader: shellApprovalContextLoader,
          // 2026-11-08（I0-6）：受保护范围启用审批类放行 + 审计失败 ⇒ 拒绝（fail-closed）。
          auditFailurePolicy: roleCapabilityProtection.state === "required" ? "deny-non-readonly" : "observe" });
      } catch (err) {
        log.error("shell.arming.failed", err);
        shellGate = undefined; // 装配失败 ⇒ 不 arm（能力缺席 = fail-closed，run_shell 不注册）
      }
    }
  } else if (input.shellReadonly !== undefined) {
    if (cap !== undefined && cap.shell === "none") {
      // 旧能力位 `shell: "none"`（历史数据/兼容）：没有 shell 面；新注册项不得再用（2026-10-19）。
      log.record("shell.readonly.rejected", { outcome: "not-armed", reasonCode: "capability-denied" });
    } else {
      try {
        // **只读档不注入升级注入点**（尤其 `takeGrant`）：陈旧授权不得越过 `readonly-deny`。
        shellGate = await assembleReadonlyShellGate({ project: input.project, ...input.shellReadonly });
      } catch (err) {
        log.error("shell.arming.failed", err);
        shellGate = undefined; // 装配失败 ⇒ 不 arm（能力缺席 = fail-closed，run_shell 不注册）
      }
    }
  } else if (!builtInGovernance && input.shellOperatorChannel !== undefined) {
    try {
      shellGate = await assembleProjectShellGate({
        project: input.project,
        operatorChannel: input.shellOperatorChannel,
        sessionDeps: { ...deps, createAdapter: deps.createAdapter ?? createRuntimeAdapterFactory(input.project, input.runtime ?? "pi", deps.runtimeOptions) },
        ...(input.shellArming ?? {}),
        ...escalationWiring,
        ...directiveWiring,
        runtime: input.runtime,
        ...(input.routineShellPolicy !== undefined ? { routineShellPolicy: input.routineShellPolicy } : {}),
        writeGuard: shellWriteGuard,
        snapshotBefore: (req) => shellPostAudit.snapshotBefore(req),
        approvalContextLoader: shellApprovalContextLoader,
        // 2026-11-08（I0-6）：受保护范围启用审批类放行 + 审计失败 ⇒ 拒绝（fail-closed）。
        auditFailurePolicy: roleCapabilityProtection.state === "required" ? "deny-non-readonly" : "observe",
      });
    } catch (err) {
      log.error("shell.arming.failed", err);
      shellGate = undefined;
    }
  }

  // 2026-11-08（W3b，设计 P1.3 §2.4.3 / I0-4）：只读 Git 固定传输能力（注入才生效）——
  // matcher 经 Service 公共出口**同一函数引用**（门禁引擎单一实现）；执行经 trunk Provider 固定传输
  // （绝对可执行 + 固定 config/env + 规范 argv 体，不接受任意 argv）。`run_shell` 在 gate 放行后对
  // `git` 只能经本能力执行；无能力/未命中 ⇒ `readonly-git-runner-unavailable`（绝不回退通用 spawn）。
  const readonlyGit: ReadonlyGitCapability = {
    match: (argv) => matchReadonlyGit(argv),
    execute: (match, budgets) => executeReadonlyGit(input.project.projectRoot, match, budgets),
  };

  // 需求变更申请：只给内置治理角色中的报告员/统筹注入（沿用 C 批发起方规则）。
  // X-R2（E2 S2）/X-R4（E2 S2）：rapporteur/convener 分支均改读已装配角色模块 `tools()`（旧内联谓词
  // `canRequestRequirementChange` 已删除）。X-R4 收尾（E2 评审 V-7）：角色侧 requirement-change 前置
  // 由 Provider 工具层（`provider/runtime/tools.ts`）单一消费，编排不再包装、同一引用原样透传。
  // 未提供 ⇒ 不注入。
  const requestRequirementChange: RequestRequirementChangeFn | undefined =
    isTrio && trioSpec !== undefined && moduleRoleDeclaresTool(trioSpec.id, "requestRequirementChange") && input.requestRequirementChange !== undefined
      ? input.requestRequirementChange
      : undefined;

  // Batch 3.5（S5）：三提交能力的角色门控——模型自报角色不可信（会话角色 id 由解析结果给出）。
  // X-R1（E2 S2）：product 的角色专属工具声明改读已装配角色模块 `builtInRoleModuleOf("product").tools()`；
  // X-R2（E2 S2）：rapporteur 同（submitVersionChange / selectRunChange；requestRequirementChange 见上方谓词）；
  // X-R3（E2 S2）：nominator 同（activateRoleDocuments）；X-R4（E2 S2）：convener 同（completeTeamPlan /
  // closeCreatedTask / submitRefactor / requestStableWrite；requestRequirementChange 见上方谓词）；
  // X-R5（E2 S2）：verifier 同——模块 `tools()` 是**合法空声明**（14 项 RoleToolId 均不含 verifier，
  // api-spec §3），经 D1 装配表 `validateRoleToolDeclaration` 校验为 allow/[]，故不注入任何专属工具；
  // 能力位（customerInput/shell 等）仍由门面 spec（本模块同一真源）提供，不由 tools() 推导第二份。
  // X-R6（E2 S2）：chief 同——模块 `tools()` trio 声明 6 项（roleActivityLog / terminateRoleRun /
  // redispatchTask / projectNote / requestVersionDecision / closeCreatedTask；E2 C-1 补齐），经 D1
  // 校验后注入。`decidePendingRequest` **不**在本模块声明：仍只由独立决策上下文调用点装配
  // （`provider/runtime/tools.ts::buildChiefDecisionTools`；普通会话不因 tools() 获得）。
  // 均经 Service 公共出口读取，并以 D1 装配表 `validateRoleToolDeclaration` 校验 id→运行时工具名映射；
  // 只有 **trio + 模块已装配** 才走模块。single/su 与未装配模块保留旧角色 id 门控（旧路径逐字不变；
  // single+product/rapporteur 的 P-6/R-7 不可达口径亦保持）。
  // 其余角色一律不注入。
  const moduleToolsRole =
    setup.role.id === "product" || setup.role.id === "rapporteur" || setup.role.id === "nominator"
    || setup.role.id === "convener" || setup.role.id === "verifier" || setup.role.id === "chief";
  const moduleTools = moduleToolsRole ? moduleToolDeclarationOf(setup.role.id, governanceModel) : undefined;
  if (moduleTools !== undefined && !moduleTools.allow) {
    log.record("role.tools.declaration.rejected", {
      roleId: setup.role.id,
      reasons: moduleTools.reasons.map((reason) => reason.code),
    });
  }
  /** 模块路径激活时回答「模块是否声明该工具」；`undefined` = 走旧角色门控（single/su/未装配）。 */
  const moduleDeclaresTool = (toolId: string): boolean | undefined =>
    moduleTools === undefined ? undefined : moduleTools.allow && moduleTools.tools.some((binding) => binding.id === toolId);
  const directGovernance = governanceModel === "trio" && builtInGovernance && isTrio && chiefDecisionContext === undefined;
  /**
   * X-R6（E2 S2）：工具注入值的三态选择——模块声明生效（trio + D1 allow）时按模块 `tools()`；
   * 模块路径未激活（single/su/未装配）时逐字使用旧门控回退值；模块整单拒绝 ⇒ 不注入（fail-closed）。
   */
  const moduleToolValue = <T>(toolId: string, legacy: T | undefined, value: T | undefined): T | undefined => {
    const declared = moduleDeclaresTool(toolId);
    return declared === undefined ? legacy : declared ? value : undefined;
  };
  const effectiveRoleActivityLog = moduleToolValue("roleActivityLog", roleActivityLog, input.roleActivityLog);
  const effectiveTerminateRoleRun = moduleToolValue("terminateRoleRun", terminateRoleRun, input.terminateRoleRun);
  const effectiveRedispatchTask = moduleToolValue("redispatchTask", redispatchTask, input.redispatchTask);
  const effectiveProjectNote = moduleToolValue("projectNote", projectNote, input.projectNote);
  const effectiveRequestVersionDecision = moduleToolValue("requestVersionDecision", requestVersionDecision, input.requestVersionDecision);
  const moduleSubmitVersionChange = moduleDeclaresTool("submitVersionChange");
  const legacySubmitVersionChange =
    setup.role.id === "product" || setup.role.id === "rapporteur" ? input.submitVersionChange : undefined;
  const submitVersionChange = moduleSubmitVersionChange === undefined
    ? legacySubmitVersionChange
    : moduleSubmitVersionChange
      ? input.submitVersionChange
      : undefined;
  // X-R2（E2 S2/R-6）：selectRunChange 的角色声明改读模块；引擎仍保留既有 `directGovernance`
  // 会话模式门控（模块只声明最大允许集，实际注入仍由引擎决定）。
  const moduleSelectRunChange = moduleDeclaresTool("selectRunChange");
  const legacySelectRunChange = directGovernance && setup.role.id === "rapporteur" ? input.selectRunChange : undefined;
  const selectRunChange = moduleSelectRunChange === undefined
    ? legacySelectRunChange
    : moduleSelectRunChange && directGovernance
      ? input.selectRunChange
      : undefined;
  const moduleCompleteTeamPlan = moduleDeclaresTool("completeTeamPlan");
  const legacyCompleteTeamPlan = directGovernance && setup.role.id === "convener" ? input.completeTeamPlan : undefined;
  const completeTeamPlan = moduleCompleteTeamPlan === undefined
    ? legacyCompleteTeamPlan
    : moduleCompleteTeamPlan && directGovernance
      ? input.completeTeamPlan
      : undefined;
  // T3 B2（MF-IR-2/3）：fixed 会话的收口/激活走 `workflowService` 固定实现（不触 trunk/CAS/
  // appointment-write）；legacy 实现（`input.closeCreatedTask`/`input.activateRoleDocuments`）在
  // fixed 会话**不注入**（结构性不可达）。会话级模式与 `resolveWorkflowMode` 同源（不缓存项目级单值）。
  const fixedSessionTools = sessionWorkflowMode === "fixed";
  // X-R3（E2 S2）：nominator 的 activateRoleDocuments 角色声明改读模块 `tools()`（trio 声明
  // `activateRoleDocuments`；single/未装配回退旧角色 id 门控）。引擎仍保留既有 `directGovernance`
  // 会话模式门控——模块只声明最大允许集，实际注入由本层决定。
  const moduleActivateRoleDocuments = moduleDeclaresTool("activateRoleDocuments");
  const legacyActivateRoleDocuments = directGovernance && setup.role.id === "nominator" ? input.activateRoleDocuments : undefined;
  const activateRoleDocuments = moduleActivateRoleDocuments === undefined
    ? legacyActivateRoleDocuments
    : moduleActivateRoleDocuments && directGovernance
      ? input.activateRoleDocuments
      : undefined;
  // T3 B2（MF-IR-3）：fixed `activate_role_documents` v2 依赖（AC-24；项目根由本层绑定；服务层重算
  // roster/提案决定/三文档实际字节 SHA-256 并写 `role.activated`）。legacy 会话字段缺席。
  const fixedActivateRoleDocuments: FixedActivateRoleDocumentsFn | undefined = fixedSessionTools
    && directGovernance && setup.role.id === "nominator" && moduleActivateRoleDocuments !== false
    ? async (toolInput, signal) => {
        if (signal?.aborted) {
          return { ok: false, code: "activation-document-invalid", message: "本轮已中止，未执行激活。" };
        }
        const projectRoot = input.project.projectRoot;
        if (input.activateRoleDocumentsFixed !== undefined) {
          // 可信 projectRoot 放最后：模型参数即便夹带同名字段也不得覆盖宿主身份。
          return await input.activateRoleDocumentsFixed({ ...toolInput, projectRoot }, signal);
        }
        return await workflowActivateRoleDocumentsFixed({
          projectRoot,
          operationId: toolInput.operationId,
          flowId: toolInput.flowId,
          workflowId: toolInput.workflowId,
          proposalDecisionId: toolInput.proposalDecisionId,
          targetRoleId: toolInput.targetRoleId,
          roster: toolInput.roster,
          documents: toolInput.documents,
        });
      }
    : undefined;
  // X-R4（E2 S2）/X-R6（E2 S2）：closeCreatedTask 的角色声明经模块 `tools()` 复核（`moduleDeclaresTool`
  // 在 trio + D1 校验后回答；single/su 以 `undefined` 保持旧路径）。**旧合并字面量逐字保留为回退值**：
  //   · convener（X-R4）与 chief（X-R6）的模块 trio 声明均含 closeCreatedTask；
  //   · 会话模式门控仍由引擎 `directGovernance` 判定（模块只声明最大允许集，E0.3 Q2）。
  const moduleCloseCreatedTask = moduleDeclaresTool("closeCreatedTask");
  const closeCreatedTask = directGovernance && (setup.role.id === "chief" || setup.role.id === "convener") ? input.closeCreatedTask : undefined;
  const effectiveCloseCreatedTask = moduleCloseCreatedTask === undefined
    ? closeCreatedTask
    : moduleCloseCreatedTask && directGovernance
      ? input.closeCreatedTask
      : undefined;
  // T3 B2（MF-IR-2）：fixed `close_created_task` v2 依赖（AC-18）——`workflowService.closeTask` 校验
  // 真实创建者（= 会话角色）/报告/状态/幂等并写 `task.closed` + 阶段事件；**不写** `.ans/runs`/
  // `.ans/trunk`、不做 CAS/snapshot。可信身份（projectRoot/actorRoleId）由本层绑定，模型只给
  // `{operationId,taskId,outcome,note?}`；legacy 会话字段缺席（legacy 实现逐字保留在上方）。
  const fixedCloseCreatedTask: FixedCloseCreatedTaskFn | undefined = fixedSessionTools
    && directGovernance && (setup.role.id === "chief" || setup.role.id === "convener")
    && moduleCloseCreatedTask !== false
    ? async (toolInput: FixedCloseCreatedTaskToolInput, signal) => {
        if (signal?.aborted) {
          return { ok: false, code: "close-task-invalid", message: "本轮已中止，未执行收口。" };
        }
        const projectRoot = input.project.projectRoot;
        const actorRoleId = setup.role.id;
        if (input.closeCreatedTaskFixed !== undefined) {
          return await input.closeCreatedTaskFixed(
            { projectRoot, actorRoleId, operationId: toolInput.operationId, taskId: toolInput.taskId, outcome: toolInput.outcome, ...(toolInput.note !== undefined ? { note: toolInput.note } : {}) },
            signal,
          );
        }
        return await workflowCloseTask({
          projectRoot,
          actorRoleId,
          operationId: toolInput.operationId,
          taskId: toolInput.taskId,
          outcome: toolInput.outcome,
          ...(toolInput.note !== undefined ? { note: toolInput.note } : {}),
        });
      }
    : undefined;
  // X-R4（E2 S2）：submitRefactor / requestStableWrite 的角色声明改读模块 `tools()`；single/su/未装配
  // 回退旧角色 id 门控（旧谓词 `canRequestStableWrite` 已删除）。两项在旧代码中不以治理模型二次收窄，
  // 故不加 `directGovernance` 会话门控（与模块 single 声明保持一致）。
  const moduleSubmitRefactor = moduleDeclaresTool("submitRefactor");
  const legacySubmitRefactor = setup.role.id === "convener" ? input.submitRefactor : undefined;
  const submitRefactor = moduleSubmitRefactor === undefined ? legacySubmitRefactor : moduleSubmitRefactor ? input.submitRefactor : undefined;
  const moduleRequestStableWrite = moduleDeclaresTool("requestStableWrite");
  const legacyRequestStableWrite = setup.role.id === "convener" ? input.requestStableWrite : undefined;
  const declaredRequestStableWrite = moduleRequestStableWrite === undefined
    ? legacyRequestStableWrite
    : moduleRequestStableWrite
      ? input.requestStableWrite
      : undefined;
  // X-R4（E2 S4）：稳定写角色侧前置——在触达注入能力之前调用 convener 模块 `stable-write` preflight
  // （事实 = 本层将转交的 request 形状；工具 schema 已保证 kind=workflow/content 非空）。deny 映射既有
  // `stable-write-invalid` 回执、能力零调用；allow 不替代 stable-write Service 的许可/内容最终校验。
  const rawRequestStableWrite = declaredRequestStableWrite === undefined ? undefined : withConvenerStableWritePreflight(declaredRequestStableWrite);
  const requestStableWrite: RequestStableWriteFn | undefined = rawRequestStableWrite === undefined ? undefined : roleCapabilityProtection.state === "unmanaged" ? rawRequestStableWrite : async (request, signal) => {
    const result = await rawRequestStableWrite(request, signal);
    if (!result.ok || !result.requestId) return result;
    const protection = await readRoleCapabilityProtectionScope({ projectRoot: input.project.projectRoot });
    if (protection.state === "unmanaged") return result;
    const actual = session?.sessionId ? inspectManagedRoleSessionEvidence({ projectRoot: input.project.projectRoot, sessionId: session.sessionId }) : undefined;
    const inventory = inspectGitHostCoordinator({ projectRoot: input.project.projectRoot }).inventory;
    const bindings = inventory?.sessions.filter(entry => entry.phase === "live" && entry.roleId === setup.role.id && entry.coreSessionId === actual?.sessionId) ?? [];
    // A reused Desktop Core must use its current real delivery, not its construction-time task.
    // Non-Desktop hosts without an inventory retain their explicit trusted task; this never proves mutation coverage.
    const taskId = inventory ? bindings.length === 1 ? bindings[0]!.taskId : undefined : input.taskId;
    const blocked = (message: string) => ({ ...result, ok: false, errorCode: "stable-write-invalid" as const, message: `Initial workflow source was not captured; publication remains blocked: ${message}` });
    if (signal?.aborted || protection.state !== "required" || !moduleRoleDeclaresTool(setup.role.id, "requestStableWrite") || !taskId || !actual || actual.construction !== "default-core" || actual.disposed
      || actual.toolSurface?.factoryProvenance !== "default-production" || !actual.lifecycle?.activeTools.some(tool => ["request_stable_write", "ans_request_stable_write"].includes(tool.name))) return blocked("actual accepted Core tool/task binding is unproven");
    const lease = beginGitHostAction({ projectRoot: input.project.projectRoot, kind: "arm" }); if (!lease.ok) return blocked(lease.code);
    try {
      const service = createTrunkService({ projectRoot: input.project.projectRoot });
      const source = await service.bindInitialWorkflowSource?.({ requestId: result.requestId, taskId, coreSessionId: actual.sessionId!,
        ...(actual.lifecycle.turnId ? { coreTurnId: actual.lifecycle.turnId } : {}), hostLeaseId: lease.leaseId });
      return source?.ok ? result : blocked(source && !source.ok ? source.message ?? source.code : "source storage unavailable");
    } finally { endGitHostAction({ projectRoot: input.project.projectRoot, leaseId: lease.leaseId }); }
  };

  // —————— 治理权力矩阵（C3）：幕僚启动快照 + 六角色工具能力（注入才注册） ——————
  // 仅 trio + 内置治理 + 六个内置角色之一；worker/su/single 不启用。
  const governanceMatrixEnabled = chiefDecisionContext === undefined && governanceModel === "trio" && builtInGovernance && isTrio;
  const governanceMatrixSessionFlags: GovernanceMatrixSessionFlags = {
    customerInput: governedInput !== undefined,
    download: input.requestDownload !== undefined,
    shell: shellGate !== undefined,
    shellEscalation: shellGate !== undefined && shellEscalationSession !== undefined,
  };
  // 幕僚必读块：计算一次（在 bindRole 前；能力组装前以取得真实 shell/升级会话标志）。
  // 渲染不可用 ⇒ 短声明，不阻塞会话；不自动改写系统提示。
  let contextSections: readonly string[] | undefined;
  if (governanceMatrixEnabled && trioSpec?.id === "chief") {
    try {
      const matrixInput = await loadGovernanceMatrixInput({
        project: input.project,
        session: governanceMatrixSessionFlags,
        generatedAt: new Date().toISOString(),
        log,
      });
      const matrix = buildGovernanceMatrix(
        matrixInput,
        sessionWorkflowMode === "fixed" ? "two-fixed-paths/v1" : "legacy-v1",
      );
      if (matrix.status === "unavailable") {
        contextSections = [GOVERNANCE_MATRIX_UNAVAILABLE_NOTICE];
        log.record("governance.matrix.unavailable", { trigger: "session-start", status: matrix.status });
      } else {
        const text = renderGovernanceMatrix(matrix, {
          maxChars: GOVERNANCE_MATRIX_PROMPT_MAX_CHARS,
          perRoleMaxChars: GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS,
        });
        if (text !== "") contextSections = [text];
        log.record("governance.matrix.build", {
          trigger: "session-start",
          status: matrix.status,
          roles: matrix.roles.length,
          warnings: matrix.warnings.length,
          truncated: matrix.render.truncated,
        });
      }
    } catch (err) {
      contextSections = [GOVERNANCE_MATRIX_UNAVAILABLE_NOTICE];
      log.error("governance.matrix.unavailable", err, { trigger: "session-start" });
    }
  }
  // 六角色只读工具（含 chief）：注入才注册；五个非幕僚启动时不计算（闭包惰性）。
  const governanceMatrix = governanceMatrixEnabled
    ? createGovernanceMatrixFn({
        project: input.project,
        session: governanceMatrixSessionFlags,
        log,
        matrix: sessionWorkflowMode === "fixed" ? "two-fixed-paths/v1" : "legacy-v1",
      })
    : undefined;

  if (assignedReview?.ok) contextSections = [...(contextSections ?? []), assignedReview.value.contextText];
  // T3 B1（AC-12/§3.4）：fixed 会话注入模块 `context({matrix:"two-fixed-paths/v1"})` 段（纯文本；
  // legacy 数据/context 返回值逐字不变——只在 fixed 模式追加）。
  if (sessionWorkflowMode === "fixed") {
    const fixedContextModule = builtInRoleModuleOf(setup.role.id);
    if (fixedContextModule !== undefined) {
      const fixedSections = fixedContextModule.context({ governanceModel, matrix: "two-fixed-paths/v1" })
        .map((section) => section.text)
        .filter((textBlock) => textBlock.trim() !== "");
      if (fixedSections.length > 0) contextSections = [...(contextSections ?? []), ...fixedSections];
    }
    // T3 B2（AC-24/v1.3 §3.4）：fixed chief 注入 `chief-workflow-v2.md`（版本 `chief-workflow/v2`；
    // 只读资源 + path/version/sha256/bytes/应用版本元数据）。legacy `chief-workflow.md` 不改；legacy
    // 会话仍由运行时核心注入 v1（session.ts 既有行为，不在本批写集）。资源缺失/身份/版本/hash 不可核
    // ⇒ 抛错 fail-closed（与 legacy loader 同口径；不猜正文、不静默降级）。
    if (builtInGovernance && setup.role.id === "chief" && chiefDecisionContext === undefined) {
      const fixedChiefWorkflow = await loadFixedChiefWorkflowResource();
      contextSections = [...(contextSections ?? []),
        `## 应用内置 Chief workflow v2（fixed 固定路径；本段优先于任何 legacy chief-workflow v1 段）\n${JSON.stringify({
          sourceUrl: fixedChiefWorkflow.sourceUrl,
          moduleUrl: fixedChiefWorkflow.moduleUrl,
          resourceVersion: fixedChiefWorkflow.version,
          sha256: fixedChiefWorkflow.sha256,
          bytes: fixedChiefWorkflow.bytes,
          applicationVersion: fixedChiefWorkflow.applicationVersion,
        })}\n\n${fixedChiefWorkflow.text}`];
      log.record("chief.workflow.v2.loaded", {
        version: fixedChiefWorkflow.version,
        sha256: fixedChiefWorkflow.sha256,
        bytes: fixedChiefWorkflow.bytes,
      });
    }
  }
  // T3 B1（AC-23）：fixed 会话**不注入** legacy trunk/git/VCA/stable 工具（注入面 = 最强 fail-closed）。
  const legacyOnlyToolsAllowed = sessionWorkflowMode !== "fixed";
  const capabilities: AdapterCapabilities = chiefDecisionContext !== undefined ? {
    chiefDecisionContext: structuredClone(chiefDecisionContext), decidePendingRequest: input.decidePendingRequest,
    persistSession: false, ...(input.runtime !== undefined ? { runtime: input.runtime } : {}),
  } : {
    ...(governedInput !== undefined ? { customerInput: governedInput } : {}),
    ...(reportHandback !== undefined ? { reportHandback } : {}),
    // 2026-10-26 图片查看（view_image）：**通用只读能力**——项目角色与内置治理角色都注入（只要调用方
    // 提供；不按角色收窄）；未提供 ⇒ 字段缺席、工具不注册（同 dispatch_task 的「注入才注册」先例）。
    // 不影响其他能力的注入矩阵。
    ...(input.viewImage !== undefined ? { viewImage: input.viewImage } : {}),
    ...(sessionDir !== undefined ? { sessionDir } : {}),
    protectedGitRoots: gitProtection.protectedGitRoots,
    ...(managedFileProtocol ? { fileGateProtocol: "host-facts-v1" as const, fileGateProtection: gitProtection } : {}),
    ...(input.runtime !== undefined ? { runtime: input.runtime } : {}),
    ...(input.persistSession !== undefined ? { persistSession: input.persistSession } : {}),
    ...(dispatchTask !== undefined ? { dispatchTask } : {}),
    ...(requestRequirementChange !== undefined ? { requestRequirementChange } : {}),
    // 2026-11-04 下载申请：纯透传；未注入 ⇒ 字段缺席、工具不注册。
    ...(input.requestDownload !== undefined ? { requestDownload: input.requestDownload } : {}),
    ...(projectState !== undefined ? { projectState } : {}),
    ...(effectiveProjectNote !== undefined ? { projectNote: effectiveProjectNote } : {}),
    ...(legacyOnlyToolsAllowed && effectiveRequestVersionDecision !== undefined ? { requestVersionDecision: effectiveRequestVersionDecision } : {}),
    // D 批：验收产物汇报能力已撤除（不注入 reportArtifact）；
    // 未注入 ⇒ 字段缺席、工具不注册（能力缺席 = 最强 fail-closed）。本层只透传同一引用，不包装、
    // 不调用、不写盘/flow、不伪造接受或决定。
    ...(roleStatus !== undefined ? { roleStatus } : {}),
    ...(input.contractCheck !== undefined ? { contractCheck: input.contractCheck } : {}),
    // 2026-11-09（文档格式权威说明，P1.2 §14 G1）：只读 `doc_format` 数据源，与 contractCheck 同条件透传；
    // 未注入 ⇒ 字段缺席、工具不注册（能力缺席 = 最强 fail-closed）。本层纯透传同一引用。
    ...(input.docFormat !== undefined ? { docFormat: input.docFormat } : {}),
    ...(input.evidenceCheck !== undefined ? { evidenceCheck: input.evidenceCheck } : {}),
    ...(sessionTail !== undefined ? { sessionTail } : {}),
    ...(effectiveRoleActivityLog !== undefined ? { roleActivityLog: effectiveRoleActivityLog } : {}),
    ...(effectiveTerminateRoleRun !== undefined ? { terminateRoleRun: effectiveTerminateRoleRun } : {}),
    ...(effectiveRedispatchTask !== undefined ? { redispatchTask: effectiveRedispatchTask } : {}),
    ...(installSkill !== undefined ? { installSkill } : {}),
    ...(uninstallSkill !== undefined ? { uninstallSkill } : {}),
    ...(installMcp !== undefined ? { installMcp } : {}),
    ...(uninstallMcp !== undefined ? { uninstallMcp } : {}),
    ...(submitVersionChange !== undefined && legacyOnlyToolsAllowed ? { submitVersionChange } : {}),
    ...(selectRunChange !== undefined && legacyOnlyToolsAllowed ? { selectRunChange } : {}),
    ...(completeTeamPlan !== undefined ? { completeTeamPlan } : {}),
    // T3 B2（MF-IR-2/3）：fixed 会话注入 fixed 依赖（legacy 实现不触达）；legacy 会话注入面逐字不变。
    ...(activateRoleDocuments !== undefined && !fixedSessionTools ? { activateRoleDocuments } : {}),
    ...(fixedActivateRoleDocuments !== undefined ? { activateRoleDocumentsFixed: fixedActivateRoleDocuments } : {}),
    // X-R4（E2 S2）/X-R6（E2 S2）：closeCreatedTask 经模块声明 + 既有 directGovernance 会话模式门控
    // 决定是否注入；single/su 回退旧合并字面量（`effectiveCloseCreatedTask`）。fixed 会话不注入 legacy
    // 实现（B1 注入面兼容别名见下：同名能力位保留但值为 fixed 实现，供既有断言/旧 handler 路径复用）。
    ...(effectiveCloseCreatedTask !== undefined && !fixedSessionTools ? { closeCreatedTask: effectiveCloseCreatedTask } : {}),
    ...(fixedCloseCreatedTask !== undefined ? { closeCreatedTask: fixedCloseCreatedTask as unknown as CloseCreatedTaskFn } : {}),
    ...(fixedCloseCreatedTask !== undefined ? { closeCreatedTaskFixed: fixedCloseCreatedTask } : {}),
    ...(legacyOnlyToolsAllowed && input.gitQuery !== undefined ? { gitQuery: input.gitQuery } : {}),
    ...(legacyOnlyToolsAllowed && input.gitCandidate !== undefined ? { gitCandidate: input.gitCandidate } : {}),
    ...(legacyOnlyToolsAllowed && input.gitPublish !== undefined ? { gitPublish: input.gitPublish } : {}),
    ...(isTrio && setup.role.id === "nominator" ? { roleDraftWritePaths } : {}),
    ...(submitRefactor !== undefined && legacyOnlyToolsAllowed ? { submitRefactor } : {}),
    ...(requestStableWrite !== undefined && legacyOnlyToolsAllowed ? { requestStableWrite } : {}),
    // 治理权力矩阵（C3）：仅 chief 有提示段（单段、非空）；六角色有工具能力（未启用/未注入 ⇒ 缺席）。
    ...(contextSections !== undefined ? { contextSections } : {}),
    ...(governanceMatrix !== undefined ? { governanceMatrix } : {}),
    ...(shellGate !== undefined ? { shellGate } : {}),
    ...(shellGate !== undefined ? { shellPostAudit: shellPostAudit.auditAfter } : {}),
    // 2026-11-08（W3b）：只读 Git 固定传输能力 + 会话角色 id（审计/展示关联；角色身份仍以会话闭包为准）。
    readonlyGit,
    roleId: setup.role.id,
    // 2026-10-31（判拒升级）：`request_shell_escalation` 工具能力——只在 shell 已 arm 且 registry 已创建时
    // 注入（运行时核心「注入才注册」；未注入 ⇒ 工具不存在，fail-closed）。工具只发起申请，不执行命令。
    ...(shellGate !== undefined && shellEscalationSession !== undefined
      ? { shellEscalation: shellEscalationSession.request }
      : {}),
    ...(input.shellVerdict !== undefined ? { shellVerdict: input.shellVerdict } : {}),
  };
  const createAdapter = deps.createAdapter ?? createRuntimeAdapterFactory(input.project, input.runtime ?? "pi", deps.runtimeOptions);
  if (deps.createAdapter && !officialCoreAdapterFactories.has(deps.createAdapter)) unmanagedFactoryAttempts.push({ projectRoot: input.project.projectRoot, roleId: setup.role.id, runtime: input.runtime ?? "pi", reason: "unverified-role-session-adapter-factory" });
  const adapter = createAdapter(
    gate,
    Object.keys(capabilities).length > 0 ? capabilities : undefined,
  );
  let session: RoleSession;
  try {
    session = await bindPreparedRuntimeRole(adapter, setup.role, input.project.projectRoot);
  } catch (err) {
    captureRoleSessionOpenFailure(err, { projectRoot: input.project.projectRoot, roleId: setup.role.id, runtime: input.runtime ?? "pi" },
      !deps.createAdapter || officialCoreAdapterFactories.has(deps.createAdapter));
    log.error("session.open.failed", err);
    throw err;
  }
  boundSessionForEvidence = session;
  log.record("session.open.ready");
  const inspectCoreLifecycle = session.inspectLifecycle?.bind(session);
  const inspectCoreToolSurface = session.inspectToolSurface?.bind(session);
  const stopCoreAndInspect = session.stopAndInspect?.bind(session);

  // 自动收尾的授权边界 = **本会话解析出的边界**（创世态下即治理种子边界；普通角色下即其项目
  // 边界）——与 su 同一授权。治理边界文档落点：项目未声明（如桌面创世 `path` 为空串）时用默认约定路径。
  const govPath = input.project.governanceBoundary?.path || DEFAULT_GOVERNANCE_BOUNDARY_REL;

  // 自动收尾 + 自动重 pin（A-4 / §13.3）：缺省仅**内置治理角色（su）会话**开启。
  // `repinIfBootstrapped`：创世态 = **首次收尾**（无可 pin 之物 → 零副作用）；非创世态 = 重扫更新 pin。
  const autoRepinEnabled = chiefDecisionContext === undefined && (input.autoRepin ?? setup.role.kind === "built-in-governance");

  let disposed = false;
  // F-5-opt1：排入的模型可见注记（下一次 send 的输入前缀；送达一次即消费——见 queueModelNotice 文档）。
  let pendingModelNotice: string | undefined;
  const persistenceSubscriptions = new Set<() => void>();
  const boundRoleId = setup.role.id;
  const protectionContext = { credentialEnvNames: trustedCredentialNames(deps.runtimeOptions) };

  async function recordFinalHandback(event: HandbackEvent): Promise<HandbackEvent> {
    const handback = event.handback;
    const draft: RuntimeLiveReportDraftV1 = {
      source: { roleId: boundRoleId },
      taskId: handback.taskId ?? null,
      origin: handback.origin,
      status: handback.status,
      summary: handback.summary,
      evidence: handback.evidence,
      at: handback.at,
    };
    if (handback.runtime !== undefined) draft.source.runtime = handback.runtime;
    if (handback.turnId !== undefined) draft.source.turnId = handback.turnId;
    let liveReport;
    try {
      liveReport = projectRuntimeLiveHandback(draft, protectionContext);
    } catch {
      log.record("report.projection.failed", { errorCode: "INVALID" });
      return { kind: "handback", summary: "报告安全显示内容生成失败。", handback,
        reportPersistence: { state: "failed", code: "INVALID", retryAvailable: false } };
    }
    const safe: HandbackEvent = { ...event, summary: `回交 su：${liveReport.summary.text}`, liveReport };
    const persistence = session.persistence;
    if (persistence === undefined || handback.turnId === undefined) {
      safe.reportPersistence = { state: "unknown-live", retryAvailable: false };
      return safe;
    }
    if (persistence.mode === "disabled") {
      safe.reportPersistence = { state: "disabled", code: "PERSISTENCE_DISABLED", retryAvailable: false };
      return safe;
    }
    // Core owns the actual bound scope, ended-turn validation, safe snapshot and retries.
    let result: ReportSaveResultV1;
    try {
      result = await persistence.recordFinalReport({
        ...draft,
        source: { roleId: boundRoleId, runtime: persistence.scope.runtime, turnId: handback.turnId },
        origin: handback.origin ?? "terminal-fallback",
      });
    } catch {
      log.record("report.persistence.failed", { turnId: handback.turnId, errorCode: "PERSIST_FAILED" });
      safe.reportPersistence = { state: "failed", code: "PERSIST_FAILED", retryAvailable: false };
      return safe;
    }
    if (result.report !== undefined) {
      safe.report = result.report;
      safe.liveReport = { source: result.report.source, taskId: result.report.taskId, origin: result.report.origin,
        status: result.report.status, summary: result.report.summary, evidence: result.report.evidence,
        evidenceOmitted: result.report.evidenceOmitted, at: result.report.at };
      safe.summary = `回交 su：${result.report.summary.text}`;
    }
    if (result.ok) {
      safe.reportPersistence = { state: "saved", reportId: result.report.reportId, retryAvailable: false };
    } else {
      let state: NonNullable<HandbackEvent["reportPersistence"]>["state"] = "failed";
      if (result.state === "expired") state = "expired";
      safe.reportPersistence = { state, reportId: result.reportId, code: result.code, retryAvailable: result.retryAvailable };
    }
    return safe;
  }
  const base: RoleSessionHandle = {
    get sessionId() { return session.sessionId; },
    ...(inspectCoreLifecycle ? { inspectLifecycle: () => structuredClone(inspectCoreLifecycle()) } : {}),
    ...(inspectCoreToolSurface ? { inspectToolSurface: () => structuredClone(inspectCoreToolSurface()) } : {}),
    ...(stopCoreAndInspect ? { stopAndInspect: async (input: Parameters<NonNullable<RoleSession["stopAndInspect"]>>[0], signal?: AbortSignal) => structuredClone(await stopCoreAndInspect(structuredClone(input), signal)) } : {}),
    get persistenceMode() {
      if (session.persistence !== undefined) return session.persistence.mode;
      return "unknown-live";
    },
    async retryReportPersistence(reportId) {
      if (disposed) return { ok: false, state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false, message: "原会话已关闭。" };
      if (session.persistence) return session.persistence.retryReportPersistence(reportId);
      return { ok: false, state: "unsupported", code: "UNSUPPORTED", retryAvailable: false, message: "当前会话不支持报告保存。" };
    },
    async getReportPersistence(reportId) {
      if (disposed) return { state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false };
      if (session.persistence) return session.persistence.getReportPersistence(reportId);
      return { state: "unsupported", code: "UNSUPPORTED", retryAvailable: false };
    },
    async retryDeliveryHistoryPersistence(attemptId) {
      if (disposed) return { ok: false, state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false, message: "原会话已关闭。" };
      if (session.persistence) return session.persistence.retryDeliveryHistoryPersistence(attemptId);
      return { ok: false, state: "unsupported", code: "UNSUPPORTED", retryAvailable: false, message: "当前会话不支持历史补保存。" };
    },
    async getDeliveryReceipt(attemptId) {
      if (disposed) return { state: "expired", code: "SNAPSHOT_EXPIRED", retryAvailable: false };
      if (session.persistence) return session.persistence.getDeliveryReceipt(attemptId);
      return { state: "unsupported", code: "UNSUPPORTED", retryAvailable: false };
    },
    onPersistenceChange(listener) {
      if (disposed || session.persistence === undefined) return () => {};
      const unsubscribeCore = session.persistence.onPersistenceChange(change => {
        if (!disposed) listener(change);
      });
      const unsubscribe = () => {
        persistenceSubscriptions.delete(unsubscribe);
        unsubscribeCore();
      };
      persistenceSubscriptions.add(unsubscribe);
      return unsubscribe;
    },
    get runtime() { return session.runtime ?? input.runtime; },
    get roleId() { return session.roleId ?? setup.role.id; },
    get contextSource() { return session.contextSource; },
    get nativeSessionId() { return session.nativeSessionId; },
    get contextWarning() { return session.contextWarning; },
    async send(text: string, opts?: RoleSessionSendOptions): Promise<void> {
      if (assignedReview?.ok && input.taskId) {
        const current = await createTrunkService({ projectRoot: input.project.projectRoot }).readAssignedReviewContext({ taskId: input.taskId, actorRoleId: setup.role.id });
        if (!current.ok || JSON.stringify(current.value.reviewBasisRef) !== JSON.stringify(assignedReview.value.reviewBasisRef))
          throw new Error(`review-task-context-changed:${current.ok ? "Assigned final candidate/criteria changed" : current.message ?? current.code}`);
      }
      await refreshRoleDraftScope();
      await refreshAssignedTaskScope();
      legacyReport = undefined;
      // 账本快照刷新（评审 §5.7 时序边界）：每次 send 开始时重读盘面——跨会话的新客户决定在此生效；
      // 未含决定则门禁拒，绝不猜。读取失败 → 快照 errors 非空 → 门禁 fail-closed。
      // F-5-opt1：排入的模型可见注记作为**本轮输入前缀**送出（不单独开轮、不改判定；送达一次即消费）。
      const notice = pendingModelNotice;
      const outbound = notice !== undefined && notice !== "" ? `${notice}\n\n${text}` : text;
      let intent: HandbackIntent;
      if (opts?.handback !== undefined) {
        intent = { required: opts.handback.required };
        // Host-verified task identity and automatic-report duty are independent.
        // An explicit empty chat intent still clears the constructor task; no permission scope is changed here.
        if (opts.handback.taskId) intent.taskId = opts.handback.taskId;
      } else {
        intent = { required: typeof input.taskId === "string" && input.taskId !== "" };
        if (intent.required) intent.taskId = input.taskId;
      }
      legacyIntent = intent;
      let acknowledged = false;
      let promptOptions: PromptOptions | undefined = opts;
      // Unmarked legacy doubles retain their old exact-reference/single-argument path.
      // Real runtimes and explicit Pipeline intent use the Core's synchronous opening ack.
      if (session.runtime !== undefined || opts?.handback !== undefined || opts?.onTurnStarted !== undefined) {
        const onTurnStarted = (metadata: PromptTurnStartedMetadata): void => {
          if (acknowledged || disposed || metadata.roleId !== setup.role.id
            || (session.runtime !== undefined && metadata.runtime !== session.runtime)
            || typeof metadata.turnId !== "string" || metadata.turnId === ""
            || completedTurns.has(metadata.turnId)) return;
          acknowledged = true;
          const managed = session.sessionId ? managedCoreHandles.get(session.sessionId) : undefined;
          if (managed) managed.turnInput = { turnId: metadata.turnId, ...(opts?.inputProvenance ? { provenance: structuredClone(opts.inputProvenance) } : {}) };
          turnIntents.set(metadata.turnId, intent);
          if (legacyIntent === intent) legacyIntent = undefined;
          opts?.onTurnStarted?.(metadata);
        };
        const { handback: _pipelineIntent, ...runtimeOptions } = opts ?? {};
        promptOptions = { ...runtimeOptions, onTurnStarted };
      }
      log.record("session.send.start");
      try {
      // 图片原引用保留；真实开轮绑定路径组合 ACK，并剥离 Pipeline 专用来源字段。
        if (promptOptions === undefined) {
          await session.prompt(outbound);
        } else {
          await session.prompt(outbound, promptOptions);
        }
        log.record("session.send.end");
        // F-5-opt1：注记已随本轮输入送出 → 消费（期间若又排入新注记则保留新的那份）。
        if (pendingModelNotice === notice) pendingModelNotice = undefined;
      } catch (err) {
        // F-5-opt1：未开轮（无 ACK）→ 注记保留（输入未送达模型，下一轮重试仍带上）；开轮后失败 → 消费（避免重复投递）。
        if (acknowledged && pendingModelNotice === notice) pendingModelNotice = undefined;
        if (!acknowledged && legacyIntent === intent) legacyIntent = undefined;
        log.error("session.send.failed", err);
        throw err;
      }
    },
    // P0-2 停当前轮次：三态如实返回（形状与语义见 RoleSessionAbortResult 的文档注释）。
    // 消费规则 = 契约 `RoleSession.abort?`：可选方法，缺席 = 该运行时不支持停止，必须如实告知。
    async abort(): Promise<RoleSessionAbortResult> {
      log.record("session.abort.requested");
      if (session.abort === undefined) {
        return { ok: false, supported: false, error: "当前运行时不支持停止" };
      }
      try {
        await session.abort();
        return { ok: true, supported: true };
      } catch (err) {
        log.error("session.abort.failed", err);
        // SDK 报错如实转达（错误原文进 error），不吞、不谎报已停；不销毁会话。
        return { ok: false, supported: true, error: errText(err) };
      }
    },
    // F-5-opt1：排入一行**模型可见注记**（下一次 send 的输入前缀；送达一次即消费）。
    // 空串/非字符串忽略（不做一半的事）；语义与推荐文案见接口与 REBUILT_SESSION_WRITE_PERMITS_NOTICE。
    queueModelNotice(text: string): void {
      if (typeof text !== "string" || text.trim() === "") return;
      pendingModelNotice = text;
      log.record("session.notice.queued");
    },
    // 会话级后台任务访问面（2026-10-25，桌面任务面板）：**纯透传**底层 RoleSession 的三个可选方法。
    // 底层缺席 ⇒ 句柄属性缺席（条件展开，不伪造空实现——空数组/undefined/「已停止」都会误导消费方）。
    // stop 的结果与异常**原样返回**（不 catch、不改写 ok:false 的 reason/message）。不在此处另存任务状态，
    // 会话生命周期后的行为由底层实现回答（Service 实现在 dispose 后返回 []/undefined/closed）。
    ...(session.listBackgroundTasks !== undefined
      ? { listBackgroundTasks: (): BackgroundTaskSnapshot[] => session.listBackgroundTasks!() }
      : {}),
    ...(session.readBackgroundTask !== undefined
      ? {
          readBackgroundTask: (
            taskId: string,
            readOptions?: BackgroundTaskReadOptions
          ): BackgroundTaskReadResult | undefined => session.readBackgroundTask!(taskId, readOptions),
        }
      : {}),
    ...(session.stopBackgroundTask !== undefined
      ? {
          stopBackgroundTask: (
            taskId: string,
            stopOptions?: BackgroundTaskStopOptions
          ): Promise<BackgroundTaskStopResult> => session.stopBackgroundTask!(taskId, stopOptions),
        }
      : {}),
    events(): AsyncIterable<OrchestrationEvent> {
      const stream = session.events();
      const wrapped = suppressHandback
        ? stream
        : withHandback(stream, { roleId: setup.role.id, taskId: input.taskId }, {
            projectRoot: input.project.projectRoot,
            report: (turnId) => turnId !== undefined ? taskReports.get(turnId) : legacyReport,
            intent: (turnId) => {
              if (turnId !== undefined) return turnIntents.get(turnId);
              if (session.runtime === undefined) return legacyIntent;
              return undefined;
            },
            completed: (turnId) => {
              if (turnId !== undefined) {
                completedTurns.add(turnId);
                taskReports.delete(turnId);
                turnIntents.delete(turnId);
              } else {
                legacyReport = undefined;
                legacyIntent = undefined;
              }
            },
          });
      // 每轮 settle 后**自动收尾 / 自动重 pin**：创世态首次写出 `.ans`（+治理边界文档+manifest），
      // 非创世态重扫并更新 pin。best-effort：失败（如门禁拒）**不打断事件流**，如实走完本轮
      // （判定/落盘本体在 finalize.ts；失败结果由下次 settle 重试）。
      return (async function* () {
        for await (const ev of wrapped) {
          if (ev.kind === "handback") {
            yield await recordFinalHandback(ev);
            continue;
          }
          if (ev.kind === "settled") {
            if (autoRepinEnabled) {
              try {
                await repinIfBootstrapped({
                  projectRoot: input.project.projectRoot,
                  skillRoot: input.project.skillRoot,
                  boundary: repinBoundary,
                  governanceBoundaryPath: govPath,
                  // 评审 §5.5：创世态由调用方传当前模型；single 不传，旧 `.ans` 形状逐字不变。
                  ...(governanceModel === "trio" ? { governanceModel: "trio" as const } : {}),
                });
              } catch (err) {
                log.error("session.repin.failed", err);
                /* 自动收尾/重 pin 是 best-effort；失败不打断会话事件流 */
              }
            }
          }
          yield ev;
        }
      })();
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      // 2026-10-31（判拒升级）：会话结束/重建 ⇒ 清空判拒台账与授权（fail-closed；方案 §4.4/§9）。
      shellEscalationSession?.dispose();
      for (const unsubscribe of [...persistenceSubscriptions]) unsubscribe();
      taskReports.clear();
      completedTurns.clear();
      legacyReport = undefined;
      turnIntents.clear();
      legacyIntent = undefined;
      log.record("session.dispose");
      await session.dispose(); // 出错如实抛出（调用方在 finally 收口）
    },
  };
  managedCoreHandles.set(session.sessionId ?? `unidentified-${randomUUID()}`, { handle: base, projectRoot: gitProtection.projectRoot, roleKind: setup.role.kind,
    construction: !deps.createAdapter || officialCoreAdapterFactories.has(deps.createAdapter) ? "default-core" : "custom-adapter", isDisposed: () => disposed });
  return base;
}

// —————————————————————— 共用辅助 ——————————————————————

// 角色/边界解析结果：失败带退出码（Usage=未知/缺失角色；Failure=解析异常/parseError）。
type RoleSetup = { ok: true; role: ResolvedRole } | { ok: false; code: number; reason: string };

async function setupRole(
  roleId: string,
  project: ProjectConfig,
  policy: { allowBuiltInRoles: boolean }
): Promise<RoleSetup> {
  // 未知/缺失角色判定（入口意图 + 配置声明，双约束）：
  //  - runRole（CLI `ans role run`，一次性路径）：只接受 project.roles 登记的项目角色（严格）。
  //  - openRoleSession（桌面聊天，会话式入口）：额外接受 project.builtInRoles 声明的内置治理角色。
  // 注意：门禁引擎把**未登记**角色当下沉为内置治理角色（kind=built-in-governance）——那是
  // ans govern 的语义；本层用「入口意图 + 配置声明」双重约束自行判定，**绝不因配置而放宽 CLI**：
  // 内置角色仅当本次入口允许（policy.allowBuiltInRoles）且配置显式声明（project.builtInRoles）时放行。
  const registered = project.roles ? project.roles[roleId] !== undefined : false;
  const declaredBuiltIn =
    policy.allowBuiltInRoles && (project.builtInRoles?.includes(roleId) === true);
  // 未登记且不在（本次入口允许的）内置角色清单 → 用法错误。
  if (!registered && !declaredBuiltIn) {
    return { ok: false, code: EXIT_USAGE, reason: `未知角色：${roleId || "(空)"}（未登记在 project.roles）` };
  }
  try {
    const resolved = await resolveRole(roleId, project);
    const role = resolved.boundary
      ? resolved
      : { ...resolved, boundary: await resolveBoundary(roleId, project) };
    // 边界解析失败（门禁引擎以 parseError 上报）：这是配置/环境错误，命令整体失败。
    if (typeof role.boundary.parseError === "string" && role.boundary.parseError !== "") {
      return { ok: false, code: EXIT_FAILURE, reason: `边界解析失败：${role.boundary.parseError}` };
    }
    return { ok: true, role };
  } catch (err) {
    return { ok: false, code: EXIT_FAILURE, reason: `角色/边界解析失败：${errText(err)}` };
  }
}

// —————— 治理权力矩阵（governance-authority-matrix，C3：Pipeline 取数 / 注入 / 工具门控）——————
// 分层纪律：本节只做「取数 + 注入 + 门控」；组装/渲染在 C1b 纯 Service（不调用其他 Service、
// 不读盘/写盘），提示拼接在三适配器，Provider 只做工具注册与参数形状校验。
// 纯读、零写入：不写项目文件/账本/trunk/VCA/stable-write；诊断日志除外。
interface GovernanceMatrixSessionFlags {
  customerInput: boolean;
  download: boolean;
  shell: boolean;
  shellEscalation: boolean;
}

/** 幕僚提示块的矩阵不可用短声明（不含错误详情/路径；不阻塞会话）。 */
const GOVERNANCE_MATRIX_UNAVAILABLE_NOTICE =
  "# 治理权力矩阵\n> 矩阵不可用（矩阵读取失败）；不得据此推断权限。";

/**
 * 既有角色门控的单一谓词（矩阵快照与注入门控共用）。
 *
 * X-R2（E2 S2）/X-R4（E2 S2）：rapporteur 与 convener 的 `requestRequirementChange`/`requestStableWrite`
 * 声明改读**已装配角色模块** `tools()`（moduleToolDeclarationOf 只在 trio 返回结果，并经 D1 装配表校验
 * id→工具名映射）；模块未装配/校验失败 ⇒ false（fail-closed）。旧内联谓词
 * `canRequestRequirementChange`/`canRequestStableWrite` 已随两角色模块化删除。
 * 矩阵快照（仅 trio chief 构建）与注入门控（`isTrio` 前置）对该谓词的使用均为 trio 语义，
 * 故这里以 `"trio"` 读取声明，不引入第二套模型参数。
 */
function moduleRoleDeclaresTool(roleId: string, toolId: string): boolean {
  const declaration = moduleToolDeclarationOf(roleId, "trio");
  return declaration !== undefined
    && declaration.allow
    && declaration.tools.some((binding) => binding.id === toolId);
}
/**
 * 迁移前版本决策发起谓词（X-R6 起仅作**模块未装配回退**；trio 权威 = chief 模块 `tools()` 声明）。
 *
 * 旧行为：只有 trio chief 可发起 `request_version_decision`。X-R6（E2 S2）后注入与矩阵快照均改读
 * `moduleRoleDeclaresTool(..., "requestVersionDecision")`；本谓词保留给 single/su/未装配模块路径，
 * 与其余工具回退值同批（不回退第二份权限表）。
 */
function canRequestVersionDecision(roleId: string): boolean {
  return roleId === "chief";
}

/**
 * X-R4（E2 S4）：convener `request_stable_write` 的角色侧前置事实（api-spec §5.2 登记键
 * `actorRoleId`/`kind`/`content`）。导出仅供编排模块消费测试逐键核对。
 */
export function convenerStableWriteFacts(request: RequestStableWriteInput): Readonly<Record<string, unknown>> {
  return { actorRoleId: "convener", kind: request.kind, content: request.content };
}

/**
 * X-R4（E2 S4）：convener `request_stable_write` 的角色侧前置包装——事实 = 工具层将转交的
 * `{kind, content}`（工具 schema 已保证 kind=`workflow`、content 非空；模块 deny 只覆盖 schema
 * 不可达形状）。deny ⇒ 既有 `stable-write-invalid` 回执（能力零调用）；allow 不替代 stable-write
 * Service 的许可/内容最终校验。
 */
function withConvenerStableWritePreflight(fn: RequestStableWriteFn): RequestStableWriteFn {
  const preflight = builtInRoleModuleOf("convener")?.preflight;
  if (preflight === undefined) return fn;
  return async (request, signal) => {
    const decision = preflight.checkAction({ action: "stable-write", facts: convenerStableWriteFacts(request) });
    if (!decision.allow) {
      return {
        ok: false,
        errorCode: "stable-write-invalid",
        message: `stable 写入请求未通过运营角色策略前置（内部 code=${decision.code}）；未签发许可、未写入。`,
      };
    }
    return fn(request, signal);
  };
}

/**
 * X-R1/X-R2（E2 S2）：读取**已装配**角色模块的工具声明，并经 D1 装配表 `validateRoleToolDeclaration`
 * 校验 id→运行时工具名映射（未知/越权/重复 ⇒ 整单 deny、`tools: []`，不注入不静默忽略）。
 *
 * 返回 `undefined` = 该角色没有可走模块的路径（非 trio，或模块未装配——X-R4 起六角色中
 * product/rapporteur/nominator/convener 已装配）；调用方必须保留旧角色 id 门控（single/su 旧路径逐字不变）。
 * 返回校验结果 = 模块路径生效，调用方只可按 `allow`/`tools` 决定注入（fail-closed）。
 */
function moduleToolDeclarationOf(
  roleId: string,
  governanceModel: GovernanceModel,
): RoleToolDeclarationValidation | undefined {
  if (governanceModel !== "trio") return undefined;
  const module = builtInRoleModuleOf(roleId);
  if (module === undefined) return undefined;
  return validateRoleToolDeclaration(roleId, module.tools({ governanceModel }).tools);
}

/** worker 章节 → 矩阵输入（不含 title；title 单独进 displayName，R-3/G-1）。 */
function workerCardSectionsOf(row: ProjectRoleSummary): WorkerRoleInput["cardSections"] | undefined {
  const sections = row.cardSections;
  if (sections === undefined) return undefined;
  const mapped: NonNullable<WorkerRoleInput["cardSections"]> = {};
  if (sections.ability !== undefined) mapped.ability = sections.ability;
  if (sections.responsibility !== undefined) mapped.responsibility = sections.responsibility;
  if (sections.handoff !== undefined) mapped.handoff = sections.handoff;
  if (sections.workflow !== undefined) mapped.workflow = sections.workflow;
  if (sections.executionPrinciples !== undefined) mapped.executionPrinciples = sections.executionPrinciples;
  return Object.keys(mapped).length > 0 ? mapped : undefined;
}

/**
 * Pipeline 取数（P1.1 §4.2.1/§5.2）：`listProject` 一次 + 仅可解析角色的 acceptance +
 * 共享 cardSections + 卡种/发起/会话快照。**枚举失败唯一载体** = `roleDirectories.error`（G-4）；
 * `role-enumeration-failed` 只是 C1b 生成的原因码，不是第二输入字段。
 */
async function loadGovernanceMatrixInput(input: {
  project: ProjectConfig;
  session: GovernanceMatrixSessionFlags;
  generatedAt: string;
  log: DiagnosticLogger;
}): Promise<GovernanceMatrixInput> {
  const { project, session, generatedAt, log } = input;
  let listing: ProjectListing | undefined;
  let listingError: string | undefined;
  try {
    listing = await listProject(project.projectRoot);
  } catch (err) {
    listingError = errText(err);
    log.error("governance.matrix.listing.failed", err);
  }

  const workerRows = listing === undefined ? [] : listing.roles.filter((role) => role.builtIn !== true);
  const issues: MatrixIssueInput[] = [];
  for (const issue of listing?.issues ?? []) {
    issues.push({
      relDir: issue.relDir,
      ...(issue.roleId !== undefined ? { roleId: issue.roleId } : {}),
      code: issue.code,
      message: issue.message,
    });
  }

  let roleDirectories: MatrixRoleDirectories;
  if (listingError !== undefined) {
    roleDirectories = { found: false, totalDirs: 0, archivedSkips: 0, error: listingError };
  } else if (listing?.roleDirectories === undefined) {
    // 不猜测 found/计数：字段缺失是契约违约，按降级（error 非空）诚实处理。
    log.record("governance.matrix.contract-violation", { field: "roleDirectories" });
    roleDirectories = {
      found: false,
      totalDirs: 0,
      archivedSkips: 0,
      error: "listProject 未返回 roleDirectories（契约违约）",
    };
  } else {
    roleDirectories = {
      found: listing.roleDirectories.found,
      totalDirs: listing.roleDirectories.totalDirs,
      archivedSkips: listing.roleDirectories.archivedSkips,
      ...(listing.roleDirectories.error !== undefined ? { error: listing.roleDirectories.error } : {}),
    };
  }

  const workerRoles: WorkerRoleInput[] = workerRows.map((row) => {
    const displayName = row.cardSections?.title?.trim() ?? "";
    const groupText = [row.group?.trim() ?? "", row.groupDuty?.trim() ?? ""]
      .filter((part) => part !== "")
      .join(" / ");
    const cardSections = workerCardSectionsOf(row);
    return {
      roleId: row.roleId,
      ...(displayName !== "" ? { displayName } : {}),
      ...(groupText !== "" ? { group: groupText } : {}),
      ...(cardSections !== undefined ? { cardSections } : {}),
      boundary: {
        entries: row.boundary.entries.map((entry): MatrixEntryView => ({
          path: entry.path,
          kind: entry.kind,
          purpose: entry.purpose,
        })),
        boundarySource: row.boundary.boundarySource,
      },
      cardPath: row.cardPath,
      boundaryPath: row.boundaryPath,
    };
  });

  const acceptanceByRole: Record<string, MatrixAcceptance> = {};
  const resolveAcceptance = async (roleId: string): Promise<MatrixAcceptance> => {
    try {
      const boundary = await resolveBoundary(roleId, project);
      return {
        state: "known",
        accepted: boundary.acceptance.accepted,
        evidence: boundary.acceptance.source,
        basis: "runtime",
      };
    } catch (err) {
      log.error("governance.matrix.acceptance.failed", err, { roleId });
      return { state: "unknown", reason: "acceptance-unavailable", detail: errText(err) };
    }
  };
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    acceptanceByRole[spec.id] = await resolveAcceptance(spec.id);
  }
  for (const row of workerRows) {
    if (acceptanceByRole[row.roleId] !== undefined) continue;
    // 只有开会话时已在 ProjectConfig.roles 快照中的 worker 才可解析 acceptance；
    // 会话中途新增角色落到治理边界覆盖分支，不得把其 accepted 冒充为本角色接受（F5）。
    if (project.roles?.[row.roleId] === undefined) continue;
    acceptanceByRole[row.roleId] = await resolveAcceptance(row.roleId);
  }

  const cardKindsByRole: Record<string, { choice: readonly string[]; confirm: readonly string[] }> = {};
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    const kinds = cardKindsOf(spec.id);
    cardKindsByRole[spec.id] = {
      choice: kinds.filter((kind) => !GOVERNANCE_CONFIRM_CARD_KINDS.includes(kind)),
      confirm: kinds.filter((kind) => GOVERNANCE_CONFIRM_CARD_KINDS.includes(kind)),
    };
  }

  const initiationByRole: Record<string, { requirementChange: boolean; versionDecision: boolean; stableWrite: boolean }> = {};
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    initiationByRole[spec.id] = {
      requirementChange: moduleRoleDeclaresTool(spec.id, "requestRequirementChange"),
      // X-R6（E2 S2）：版本决策发起权改读已装配角色模块 `tools()`（chief trio 声明 requestVersionDecision）。
      versionDecision: moduleRoleDeclaresTool(spec.id, "requestVersionDecision"),
      stableWrite: moduleRoleDeclaresTool(spec.id, "requestStableWrite"),
    };
  }

  return {
    projectRoot: project.projectRoot,
    governanceModel: "trio",
    workerRoles,
    issues,
    warnings: [...(listing?.warnings ?? [])],
    roleDirectories,
    acceptanceByRole,
    cardKindsByRole,
    initiationByRole,
    session,
    generatedAt,
  };
}

/**
 * `governance_matrix` 注入函数（C3）：每次调用重新取数 + build/render；未知 roleId 在 C3 预检
 * （不回显、不依赖渲染器）；只读、无写盘/账本/状态事件。
 */
function createGovernanceMatrixFn(deps: {
  project: ProjectConfig;
  session: GovernanceMatrixSessionFlags;
  log: DiagnosticLogger;
  /** T3 B2（v1.3 §7.4）：fixed 会话展示 fixed 矩阵视图（只读、不判定）；缺省 `legacy-v1` 逐字不变。 */
  matrix?: DispatchMatrixMode;
}): GovernanceMatrixFn {
  return async (request = {}) => {
    const keys = Object.keys(request);
    if (keys.some((key) => key !== "roleId" && key !== "section")) {
      return { ok: false, message: "参数不受支持：只接受 roleId 与 section。" };
    }
    const section = request.section;
    if (section !== undefined && section !== "all" && section !== "roles" && section !== "routing") {
      return { ok: false, message: "section 仅支持 all / roles / routing。" };
    }
    try {
      const matrixInput = await loadGovernanceMatrixInput({
        project: deps.project,
        session: deps.session,
        generatedAt: new Date().toISOString(),
        log: deps.log,
      });
      const matrix = buildGovernanceMatrix(matrixInput, deps.matrix ?? "legacy-v1");
      if (matrix.status === "unavailable") {
        return { ok: false, message: "治理权力矩阵暂不可用；不得据此推断权限。" };
      }
      if (request.roleId !== undefined && !matrix.roles.some((role) => role.roleId === request.roleId)) {
        return { ok: false, message: "未找到该角色；请使用矩阵中已有的 roleId（可用 section 过滤）。" };
      }
      const message = renderGovernanceMatrix(matrix, {
        maxChars: GOVERNANCE_MATRIX_TOOL_MAX_CHARS,
        perRoleMaxChars: GOVERNANCE_MATRIX_PER_ROLE_MAX_CHARS,
        ...(request.roleId !== undefined ? { roleId: request.roleId } : {}),
        ...(section !== undefined ? { section } : {}),
      });
      if (message === "") {
        return { ok: false, message: "治理权力矩阵暂不可用；不得据此推断权限。" };
      }
      deps.log.record("governance.matrix.build", {
        trigger: "tool",
        status: matrix.status,
        roles: matrix.roles.length,
        warnings: matrix.warnings.length,
        truncated: matrix.render.truncated,
      });
      return { ok: true, message };
    } catch (err) {
      deps.log.error("governance.matrix.unavailable", err, { trigger: "tool" });
      return { ok: false, message: "治理权力矩阵暂不可用；不得据此推断权限。" };
    }
  };
}

function fileFactsDenied(): WriteDecision {
  return { allowed: false, reason: "file-gate-host-facts-unproven: genuine current stage, roots and Git protection basis are required", allowedByRoot: { skill: [], project: [] } };
}
function verifiedFileFacts(context: WriteGateContext | undefined, target: string, project: ProjectConfig, protection: GitProtectionFacts): FileGateFacts | undefined {
  if (!context || (context.operation !== "write" && context.operation !== "edit")
    || (context.stage !== "lexical-read" && context.stage !== "canonical-read" && context.stage !== "final-write")) return undefined;
  const facts = inspectRuntimeFileGateContext(context, target, context.operation, context.stage);
  const same = (a: string, b: string) => process.platform === "win32" ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
  if (!facts || !same(facts.projectRoot, project.projectRoot) || !same(facts.skillRoot, project.skillRoot)
    || !checkGitProtectionFactsCurrent(protection)) return undefined;
  if (facts.canonicalFacts && (facts.canonicalFacts.basisDigest !== protection.basisDigest
    || facts.canonicalFacts.coverage !== protection.coverage || facts.canonicalFacts.reasons.length !== protection.reasons.length
    || JSON.stringify(facts.canonicalFacts.protectedRoots) !== JSON.stringify(protection.protectedGitRoots))) return undefined;
  return facts;
}
function versionedFileDecision(root: string, target: string, facts: FileGateFacts): WriteDecision | undefined {
  if (facts.stage !== "final-write") return undefined;
  const rel = projectRelativeLexical(target, root);
  if (rel === undefined) return undefined;
  const exists = facts.currentFile.state === "present";
  const decision = versionedDocOverwriteDecision({ relPath: rel, exists, frozen: versionedDocFreezeState(root, rel, exists), operation: facts.operation });
  return decision.allowed ? undefined : { allowed: false, reason: decision.reason, allowedByRoot: { skill: [], project: [] }, code: decision.code, rejection: decision.rejection };
}

// Legacy unmanaged compatibility only. Managed file tools use verifiedFileFacts and the pure stage gates.
function buildGate(
  role: ResolvedRole,
  project: ProjectConfig,
  scope: TaskScope | undefined,
  protectedGitRoots?: readonly string[],
): WriteGate {
  return (p) =>
    resolveWrite(p, role.boundary, scope, {
      skillRoot: project.skillRoot,
      projectRoot: project.projectRoot,
      protectedGitRoots,
    });
}

/**
 * **会话初始预授权的路径来源**——「初始 writeSet 恒含」的写权，不经确认发行器：
 *   · `entries`：角色 Section 1 条目（2026-10-25 客户规则「写自己角色权限内的路径，直接放行」）：
 *     trio 五角色与项目角色在**无任务级 writeSet 收窄**时使用（含精确文件条目，如 Convener 的
 *     `docs/workflow.md`）；有任务 scope 时保持 F4 收窄，不并入。
 *   · `dirs`：内置治理角色的既有预授权目录——trio 注册表 `preauthorizedDirs`（2026-10-16 起；目录
 *     子集，有/无任务 scope 都生效）与旧 su（single）四棵 `docs/su`、`docs/contracts`、`docs/skills`、
 *     `docs/mcp`（客户裁定 2026-10-16；单一来源 `LEGACY_SU_PREAUTHORIZED_DIRS`），行为逐字保留。
 *
 * 语义与边界（钉死）：
 * - 它是**初始集合的一部分**——不依赖确认发行器；每次开会话/会话重建都生效。
 * - 实现口径（F4 为**精确匹配**）：求值时把「目标路径本身」的项目根相对词法路径并入本次 writeSet
 *   ——等价于该路径初始就在已发行集中。判定链其余环节（F6 接受门、F7 真实路径逃逸复核、边界条目
 *   匹配、条件激活、forbiddenWritePaths 与 trio 三道治理门禁）**逐字不变**：不在边界内/未接受/逃逸/
 *   治理门禁未放行的路径照拒，fail-closed 不放松。
 * - 其余一切路径照旧只认已发行集：未确认 = F4 拒。
 * 背景：`角色卡/编排/docs/fix/2026-10-16_fix_su-notes-preauth.md`、G-4 两批变更记录与
 * 2026-10-25 客户写入预授权规则。
 */
interface PreauthorizedWriteSources {
  /** Section 1 条目（仅 `root === "project"` 可经 writeSet 表达；见 section1EntryCovers）。 */
  entries: readonly BoundaryEntry[];
  /** 旧 su 预授权目录树（项目根相对、含子路径；按段比较）。 */
  dirs: readonly string[];
}

/** 目标路径 → **项目根相对词法路径**（取值规则与 resolveWrite 同源）；空/根外 → undefined。 */
function projectRelativeLexical(targetPath: string, projectRoot: string): string | undefined {
  const raw = typeof targetPath === "string" ? targetPath.trim() : "";
  if (raw === "") return undefined;
  const rel = isAbsoluteAny(raw) ? absRel(normalizeLexical(raw), projectRoot) : normalizeLexical(raw);
  if (rel === null || rel === "") return undefined;
  return rel;
}

/**
 * Section 1 条目是否覆盖项目根相对路径 `rel`——与 `resolveWrite` 的 `pathCovers`/`isActive` 同口径：
 * `file` 精确匹配；`directory` 按**段**前缀（`docs/mcp2` 不被 `docs/mcp` 覆盖）；`conditional-directory`
 * 还须其 slug 出现在本次 scope 的 `conditions` 中（缺 slug/非法 slug ⇒ 不激活，fail-closed）。
 * 只处理 `root === "project"` 条目：writeSet 契约为项目根相对路径，skill 根条目无法经此表达（当前
 * 可写角色边界均以项目根条目给出；skill 根条目只出现在未接受的内置回退边界）。
 */
function section1EntryCovers(e: BoundaryEntry, rel: string, conditions: readonly string[]): boolean {
  if (e.root !== "project") return false;
  if (e.kind === "conditional-directory") {
    const slug = e.condition;
    if (!isValidConditionSlug(slug) || !conditions.includes(slug)) return false;
  }
  const entryPath = normalizeLexical(e.path);
  if (e.kind === "file") return compareKey(entryPath) === compareKey(rel);
  return isUnderOrEqual(rel, entryPath);
}

/**
 * 目标路径落在预授权来源内 → 返回其项目根相对词法路径；否则 `undefined`。
 * 目录树按**段**比较（`docs/mcp2` 不被 `docs/mcp` 覆盖），大小写口径沿用共享原语。
 */
function preauthorizedRelOf(
  targetPath: string,
  projectRoot: string,
  sources: PreauthorizedWriteSources,
  conditions: readonly string[],
): string | undefined {
  const rel = projectRelativeLexical(targetPath, projectRoot);
  if (rel === undefined) return undefined;
  if (sources.dirs.some((dir) => isUnderOrEqual(rel, dir))) return rel;
  return sources.entries.some((e) => section1EntryCovers(e, rel, conditions)) ? rel : undefined;
}

/**
 * 会话 gate 求值入口：目标在预授权来源内 ⇒ 把其项目根相对路径**并入本次 writeSet**（不经发行器）；
 * 其余 ⇒ **原样返回 base**（零行为变化）。base 由调用方保证非 undefined（确认制动态集或静态 scope）；
 * `scope === undefined` 且无预授权的「不做任务收窄」会话**不经过本函数**。
 */
function scopeWithPreauthorizedWrites(
  base: TaskScope,
  targetPath: string,
  projectRoot: string,
  sources: PreauthorizedWriteSources,
): TaskScope {
  const rel = preauthorizedRelOf(targetPath, projectRoot, sources, base.conditions);
  if (rel === undefined) return base;
  return { writeSet: [...base.writeSet, rel], conditions: base.conditions };
}

/**
 * 越界写入的**归属指引**（与门禁引擎 AC3 的 Liaison 归属文案同口径；2026-10-18 协调口径）。
 * 只影响**拒绝文案**，不改变 `forbiddenWritePaths` 的放行/拒绝判定。
 * 顺序敏感：应用独占路径先于「角色卡/」等宽前缀匹配。
 */
function governanceWriteOwnerHint(rel: string): string {
  const hints: ReadonlyArray<{ prefixes: readonly string[]; guidance: string }> = [
    {
      prefixes: [".ans/", "docs/bootstrap-manifest.md", "角色卡/governance-boundary.yaml"],
      guidance: "该路径只能由应用写（治理记录/账本/边界文档/manifest），任何角色都不可写。",
    },
    {
      prefixes: ["docs/proposals/", "docs/contracts/", "docs/governance/rapporteur/"],
      guidance: "该路径属报告员 Rapporteur 的写区（提案/契约）；请把客户意图交给报告员，由报告员形成提案。",
    },
    {
      prefixes: ["docs/nominations/"],
      guidance: "该路径是旧提名文件（legacy）：仅旧流程由 Crew（Nominator）写；新流程的团队计划由 Steward（Convener）写 docs/scheduling/。",
    },
    {
      prefixes: ["角色卡/", "docs/skills/", "docs/mcp/", "docs/governance/nominator/"],
      guidance: "该路径属 Crew（Nominator）的写区（角色卡/技能/MCP，按客户任命的团队计划写卡）；请交给 Crew。",
    },
    {
      prefixes: ["docs/scheduling/", "docs/governance/convener/"],
      guidance: "该路径属运营（Convener）的写区（计划/分析/调度记录）；请交给运营。",
    },
    {
      prefixes: ["docs/quality/", "docs/verification/", "docs/governance/verifier/"],
      guidance: "该路径属质检（Verifier）的写区（质量记录/可选核对证据）；请交给质检角色。",
    },
  ];
  for (const hint of hints) {
    const hit = hint.prefixes.some((prefix) => {
      const relLower = rel.toLowerCase();
      const prefixLower = prefix.toLowerCase();
      return prefix.endsWith("/") ? relLower.startsWith(prefixLower) : relLower === prefixLower;
    });
    if (hit) return hint.guidance;
  }
  return "该路径属应用治理记录或其他治理角色，当前角色不可写。";
}

/**
 * D 批：不再有治理账本；本函数只按角色注册表的 forbiddenWritePaths 给出拒绝与归属提示。
 */
function forbiddenWriteDecision(
  spec: GovernanceRoleSpec,
  rel: string | undefined,
): WriteDecision | undefined {
  if (rel === undefined) return undefined;
  const hit = spec.forbiddenWritePaths.some((prefix) => isUnderOrEqual(rel, prefix));
  if (!hit) return undefined;
  return {
    allowed: false,
    reason: `拒绝写入 ${rel}：${governanceWriteOwnerHint(rel)}`,
    allowedByRoot: { skill: [], project: [] },
  };
}

const GOVERNANCE_SLUG_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);

function isGovernanceFlowId(value: unknown): value is string {
  return typeof value === "string" && GOVERNANCE_SLUG_RE.test(value);
}

/**
 * 2026-10-20 真机 bookmank op-1：Lead 的 `request_choice`（intent-confirm）漏带 cardKind ⇒ 无 judge 事件。
 * choice 卡的**角色默认**（仅当该 kind 在该角色 `cardKindsOf` 白名单内才生效；X-R1 起已装配角色
 * 读角色模块 `cards`）：
 *   chief → 模块卡数据 `CHIEF_INTENT_CONFIRM_CARD`（选项须含 confirm；X-R6 起）；rapporteur → proposal
 *   （须含 accept；X-R2 起改读模块 cards，decision 卡因推荐项守卫永不默认化）；convener → 模块 cards
 *   驱动（X-R4 起 `cards=["decision"]`，不默认化——旧 `appointment` 候选本就被白名单过滤）；
 *   nominator → 不默认（X-R3：卡种白名单已由模块 `cards` 提供；默认化仍保持关闭，
 *   Crew 只写卡，不再发任命卡）；verifier → 模块 cards 驱动（X-R5 起 `cards=["acceptance"]`，
 *   选项含 accept 时默认 acceptance）；product → 模块 cards（当前为空 ⇒ 不默认）；其他/项目角色不猜。
 * 选项形状守卫避免把「普通选择卡」误判为治理决定卡（沿用旧行为）。
 * **调用点前置守卫（2026-10-26）**：`hasRecommendedOption(req)` 为真（带 `recommended:true`）时
 * **不进入本函数**——缺 cardKind 的 decision 形状卡必须 fail-closed，不得默认成 appointment 等。
 */
const APPOINTMENT_RESERVED_OPTION_IDS: ReadonlySet<string> = new Set([
  "accept",
  "accept-quick",
  "revise",
  "reject",
  "confirm",
]);

/** 任命形状：非空选项、且不含任何治理卡保留选项 id（角色 id 列表）。 */
function looksLikeAppointmentChoice(optionIds: readonly string[]): boolean {
  return optionIds.length > 0 && optionIds.every((id) => !APPOINTMENT_RESERVED_OPTION_IDS.has(id));
}

/**
 * 2026-10-26 decision 卡安全识别（**默认逻辑之前**）：choice 卡是否出现任一 `recommended:true` 选项。
 * 该字段只属于 decision 卡（客户规则：每张 decision 卡恰有一个推荐项）；出现它却缺 `cardKind` ⇒
 * 卡种不明——任何 choice 默认兜底都可能把材料性选择误当 appointment/proposal/acceptance 卡。
 * 结果：不默认（调用方随后 fail-closed 拒发），旧卡种（无 recommended）零行为变化。
 */
function hasRecommendedOption(req: CustomerInputRequest): boolean {
  return req.kind === "choice" && req.options.some((option) => option.recommended === true);
}

/**
 * decision 卡校验失败的可操作文案（2026-10-26 独立验收 F2）：机器码在 `reasonCode`（诊断/桌面可映射
 * 自己的 i18n），本函数只拼给模型/CLI 看的人话；统一以「本次未向客户发卡、未写账本」收尾。
 */
function decisionCardRejectionReason(
  roleId: string,
  validation: Extract<DecisionCardValidation, { ok: false }>,
): string {
  const suffix = "本次未向客户发卡、未写账本。请修正后重试。";
  switch (validation.reasonCode) {
    case "role-not-allowed":
      return `decision 卡只能由运营/Steward（trio convener）或策划角色/Draft（trio rapporteur，仅需求变更审批）发起（当前角色：${roleId === "" ? "unknown" : roleId}）；${suffix}`;
    case "not-choice":
      return `decision 卡必须是 request_choice（choice）卡；${suffix}`;
    case "missing-flow-id":
      return `decision 卡缺少合法的 flowId（须为非空小写 slug，匹配 ${GOVERNANCE_SLUG_PATTERN}）；${suffix}`;
    case "not-enough-options":
      return `decision 卡至少需要 ${DECISION_CARD_MIN_OPTIONS} 个选项；${suffix}`;
    case "invalid-option-id":
      return `decision 卡的每个选项都必须有非空字符串 id；${suffix}`;
    case "duplicate-option-id":
      return `decision 卡的选项 id 不得重复（${validation.detail}）；${suffix}`;
    case "recommended-count":
      return `decision 卡必须恰有一个 recommended:true 的推荐项（${validation.detail}）；${suffix}`;
  }
}

function defaultGovernanceChoiceCardKind(
  roleId: GovernanceRoleSpec["id"],
  optionIds: readonly string[],
): GovernanceCardKind | undefined {
  switch (roleId) {
    case "chief":
      // X-R6（E2 S2 / D8）：默认卡种改读角色模块卡数据（`CHIEF_INTENT_CONFIRM_CARD`）：卡种
      // intent-confirm 由模块 `cards` 白名单确认；选项须含模块登记的 `requiredOptionId`（confirm），
      // 与迁移前 `has("confirm") ? "intent-confirm" : undefined` 同值。
      return optionIds.includes(CHIEF_INTENT_CONFIRM_CARD.requiredOptionId)
        && cardKindsOf("chief").includes(CHIEF_INTENT_CONFIRM_CARD.cardKind)
        ? CHIEF_INTENT_CONFIRM_CARD.cardKind
        : undefined;
    case "rapporteur":
      // X-R2（E2 S2 / D8）：默认卡种改读角色模块 `cards`（rapporteur = ["proposal","decision"]）。
      // decision 卡按客户规则含恰一 `recommended:true`，前置 `hasRecommendedOption` 守卫已阻止默认化
      // （fail-closed）；本函数对该角色只可能给出 proposal（选项含 accept 时），与迁移前逐字一致。
      return defaultChoiceKindFromModule("rapporteur", optionIds);
    case "convener":
      // X-R4（E2 S2 / D8）：默认卡种改读角色模块 `cards`（convener = ["decision"]）。迁移前的
      // `looksLikeAppointmentChoice ⇒ "appointment"` 候选从未生效（appointment 已不在 convener 白名单，
      // 调用方按 `cardKindsOf` 过滤）；模块路径下直接不默认化（decision 因推荐项守卫永不进入默认化），
      // 净行为逐字一致。
      return defaultChoiceKindFromModule("convener", optionIds);
    case "nominator":
      // X-R3（E2 S2/D8）：卡种白名单已改读模块 `cards`（`cardKindsOf`）；**默认卡种保持不默认**
      // （迁移前行为逐字保留：不得把普通角色 id 选择卡自动当 appointment）。
      return undefined;
    case "verifier":
      // X-R5（E2 S2 / D8）：默认卡种改读角色模块 `cards`（verifier = ["acceptance"]）：选项含
      // accept ⇒ acceptance，与迁移前 `has("accept") ? "acceptance" : undefined` 同值；前置
      // `hasRecommendedOption` 守卫不变（带推荐项的卡不默认化）。
      return defaultChoiceKindFromModule("verifier", optionIds);
    case "product":
      // X-R1（E2 S2 / D8）：product 的默认卡种按角色模块 `cards` 推导（当前 `cards=[]` ⇒ 不默认；
      // 与迁移前 `return undefined` 同向，零行为变化）。
      return defaultChoiceKindFromModule("product", optionIds);
  }
}

/**
 * X-R1（E2 S2 / D8）：**模块卡种驱动**的默认 choice 卡种——只在角色模块声明了对应卡种时返回既有
 * 启发式候选；模块未装配时 `cardKindsOf` 回退迁移前内联表（X-R6 后该表仅保留 product 行，供
 * product-code 源码 fixture；其余五角色已迁移、模块缺席 fail-closed）。
 * product 模块 `cards=[]` ⇒ 恒 `undefined`；rapporteur 模块 `cards=["proposal","decision"]` ⇒
 * 与迁移前 `has("accept") ? "proposal" : undefined` 同值（decision 因推荐项守卫不进入默认化）；
 * convener 模块 `cards=["decision"]` ⇒ 恒 `undefined`（旧 appointment 候选本就被白名单过滤）；
 * verifier 模块 `cards=["acceptance"]`（X-R5）⇒ 与迁移前 `has("accept") ? "acceptance" : undefined` 同值。
 */
function defaultChoiceKindFromModule(
  roleId: GovernanceRoleSpec["id"],
  optionIds: readonly string[],
): GovernanceCardKind | undefined {
  const cards = cardKindsOf(roleId);
  if (optionIds.includes("confirm") && cards.includes("intent-confirm")) return "intent-confirm";
  if (optionIds.includes("accept")) {
    if (cards.includes("proposal")) return "proposal";
    if (cards.includes("acceptance")) return "acceptance";
  }
  if (looksLikeAppointmentChoice(optionIds) && cards.includes("appointment")) return "appointment";
  return undefined;
}

/**
 * T3 B3.1（2026-11-10，AC-08/AC-13，v1.3 §4.2 A10/MF-9(a)）：fixed 任命卡在办标记。
 *
 * A10 只任命确认、不派实现：呈卡前把当前活动 fixed workflow 推进到 `stage.requested A10`
 * （幂等键 `stage-request:<wf>:A10:1`，requestDigest=名单字节 sha256，requestTaskId=
 * `appointment-card:<flowId>:<rosterSha12>`——与 `prepareIntent` 的 `stage.requested A3` 同构），
 * 使 `request.resolved`（appointment，含 `targetRoleIds`/workflowId 戳）后的 `stage.completed A10`
 * （应用通道/桌面 B3 唯一实现）可按状态机落账，之后 chief 才能发 A11 stage-request。
 *
 * **不新增客户门**：无活动 workflow、view 已关闭/blocked、当前不在「A9 已完成 → A10」窗口、
 * 或 A10 已在办/已完成 ⇒ 不写、照常呈现卡。只有真正尝试写入且失败才返回稳定失败码（fail-closed）。
 * 全部经 fixed 账本公共原语（`readWorkflowLedger`/`appendWorkflowEvent`/`deriveWorkflowView`/
 * `canRequestStage`），不复制状态机、不触 legacy trunk/run。
 */
async function markFixedAppointmentCardRequested(input: {
  projectRoot: string;
  flowId: string;
  rosterSha256: string;
  now?: () => Date;
}): Promise<WorkflowServiceFailure | undefined> {
  const ledger = await workflowReadLedger(input.projectRoot);
  const activeIds = [...new Set(ledger.events
    .filter((event) => event.kind === "workflow.started")
    .map((event) => event.workflowId))]
    .filter((workflowId) => !ledger.events.some((event) => event.workflowId === workflowId && event.kind === "workflow.closed"));
  const workflowId = activeIds.find((id) => ledger.events.some((event) => event.workflowId === id && event.flowId === input.flowId));
  if (workflowId === undefined) return undefined;
  const wfEvents = ledger.events.filter((event) => event.workflowId === workflowId);
  const taskState = await readTaskState(input.projectRoot);
  const view = deriveWorkflowView(wfEvents, taskState.events);
  if (view.closed !== undefined || view.blocked !== undefined) return undefined;
  // 已到 A10（requested/dispatched/blocked/in-progress/completed）⇒ 在办或已完成，不重复标记。
  if (view.stage === "A10") return undefined;
  if (!(view.stage === "A9" && view.stages.A9.status === "completed") || !canRequestStage(view, "A10")) return undefined;
  const now = input.now ?? (() => new Date());
  const event: WorkflowEvent = {
    v: 1,
    at: now().toISOString(),
    schema: WORKFLOW_LEDGER_SCHEMA,
    kind: "stage.requested",
    workflowId,
    flowId: input.flowId,
    path: view.path,
    idempotencyKey: stageRequestIdempotencyKey(workflowId, "A10", 1),
    stage: "A10",
    fromStage: "A9",
    requestTaskId: `appointment-card:${input.flowId}:${input.rosterSha256.slice(0, 12)}`,
    requestDigest: input.rosterSha256,
    attempt: 1,
  };
  const appended = await workflowAppendEvent(input.projectRoot, event);
  if (!appended.ok) return { ok: false, code: "workflow-ledger-write-failed", message: `stage.requested A10 写入失败：${appended.message}` };
  return undefined;
}

function serializeGovernanceTask<T>(
  state: { chain: Promise<void> },
  task: () => Promise<T>,
): Promise<T> {
  const run = state.chain.then(task, task);
  state.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * 批次 A 身份层：旧 `liaison` 与新的 `chief` 共享同一条「主入口/协调者」旧流程路径
 * （意图确认卡、意图交接、幕僚→运营 coordinate）。旧路径保留到 D 批；两者只是 id 不同。
 */
function isCoordinatorGovernanceSpec(spec: GovernanceRoleSpec | undefined): boolean {
  return spec !== undefined && spec.function === "chief";
}

/**
 * 每角色允许的 `cardKind` 白名单（评审 §5.8 表；越权不弹卡，由 customerInput 包装器直接拒绝）。
 *
 * 2026-10-26 客户新增 **decision 卡**（`request_choice(cardKind="decision")`，运行时核心已在
 * Model 契约登记）：事务性选择卡（卡内含**恰一个**推荐项；桌面「替我决策」开启时默认选中推荐项），
 * 由统筹（trio convener）发起；**需求变更审批卡**则由统筹或提案角色（trio rapporteur）发起
 * （2026-10-26 客户纠正/补充；发起方不得自批，审批人只有判断 agent/客户，主理只执行）。
 * 它与提案/任命/验收相互独立：不触发任何 gate/验收、不产生
 * appointment/proposal 决定、不进入 `latestAcceptanceDecision`、也不能充当 flow 的
 * `customer-decision` 证据；分类只写 `decisionKind:"material-choice"`，**不得被当成提案/验收批准**。
 */
const TRIO_CARD_KINDS: Readonly<Partial<Record<GovernanceRoleSpec["id"], readonly GovernanceCardKind[]>>> = {
  // C 目标态（2026-10-28）：模型可见 schema 已删除通用 `write`；本表仍保留它以让旧 direct/legacy
  // 项目与旧测试在过渡期可编译/可运行（**不向模型列出**），D 批随旧机器一并删除。
  // 2026-10-28 批次 A：幕僚（chief）承接旧主入口的 intent-confirm 需求确认卡；其它治理卡仍结构性拒绝。
  // 旧 `liaison` 是只读别名（D 批删除），行为与基线逐字一致（仅 intent-confirm）。
  // X-R6（E2 S2/D8）：chief 表项已删除——卡种唯一真源 = 角色模块 `cards`（值为 `["intent-confirm"]`）；
  // 模块意外缺席时 `cardKindsOf` 对该角色 fail-closed 空集（不静默放宽）。旧表项不保留第二份副本。
  // 产品（product）是幕僚的 worker；批次 A 只做身份层，不开放治理选择/确认卡（申请线在 C 批）。
  // X-R1（E2 S2 / D8）：trio 运行时经 `cardKindsOf("product")` 读取**角色模块** `cards`（当前为空）
  // 作为唯一真源；本字面量只为 `builtInRoleModuleOf` 不可用时的回退与迁移前源码 oracle 保留
  // （product-code 的 `test/roles/product/product-differential.test.ts` 仍读取此文本；不在编排写集）。
  product: [],
  // X-R2（E2 S2 / D8）：rapporteur 条目已删除——卡种唯一真源 = 角色模块 `cards`
  // （`["proposal","decision"]`）。迁移已完成角色不得保留第二份表；模块意外缺席时 `cardKindsOf`
  // 对该角色 fail-closed 返回空集（不静默放宽）。
  // X-R3（E2 S2/D8）：nominator 条目已删除——卡种唯一真源 = 角色模块 `cards`
  // （`["appointment","appointment-write"]`）。模块意外缺席时 `cardKindsOf` 对该角色 fail-closed
  // 返回空集（不静默放宽）。**默认卡种仍不默认化**（迁移前逐字：Crew 只写卡；模块 cards 只作白名单）。
  // X-R4（E2 S2/D8）：convener 条目已删除——卡种唯一真源 = 角色模块 `cards`（`["decision"]`；
  // 2026-10-29 起 appointment 已从白名单移除，招人卡只归人事）。模块意外缺席时 fail-closed 空集。
  // X-R5（E2 S2/D8）：verifier 条目已删除——卡种唯一真源 = 角色模块 `cards`（`["acceptance"]`）；
  // 模块意外缺席时 `cardKindsOf` fail-closed 空集。验收权归独立验收/质检，Draft / 提案不再发 acceptance。
};

/** 迁移已完成角色但模块缺席时的 fail-closed 卡种（冻结空集；不伪造第二份白名单）。 */
const NO_CARD_KINDS: readonly GovernanceCardKind[] = Object.freeze([]);

/**
 * X-R1–X-R6（E2 S2 / D8）：卡种唯一真源 = 角色模块 `cards`（经 Service 公共出口读取
 * **已装配**模块）。X-R1–X-R6 依次装配 product/rapporteur/nominator/convener/verifier/chief；
 * 迁移已完成角色的模块缺席属结构性错误 ⇒ fail-closed 空集，不回退第二份表。`TRIO_CARD_KINDS`
 * 仅保留 product 行（product-code 迁移前源码 fixture；运行期模块已装配、优先命中模块）。
 * 模块 `cards` 是冻结只读数组，直接返回同一引用，不复制第二份表。
 */
/**
 * legacy 卡种读取（X-R1–X-R6 实现**逐字保留**：先读已装配模块 `cards`，未装配回退迁移前表；
 * 两行顺序/文本不得改——module-consumption 源码锚点测试逐字断言）。
 *
 * T3 B2（MF-IR-4）：运行期 `cardKindsOf` 已改调门禁引擎门面（单一真源）；本函数与迁移前表
 * （仅 product 行）按上述锚点/迁移前 oracle 原样保留，不再参与运行期判定。
 */
function legacyCardKindsOf(roleId: GovernanceRoleSpec["id"]): readonly GovernanceCardKind[] {
  const module = builtInRoleModuleOf(roleId);
  if (module !== undefined) return module.cards;
  return TRIO_CARD_KINDS[roleId] ?? NO_CARD_KINDS;
}

function cardKindsOf(roleId: GovernanceRoleSpec["id"], matrix: DispatchMatrixMode = "legacy-v1"): readonly GovernanceCardKind[] {
  // T3 B2（MF-IR-4）：卡种唯一真源 = 门禁引擎门面 `cardKindsOf(roleId, matrix)`——legacy 只读模块
  // `cards`（逐字不变），fixed 只读模块 `fixedCards`（字段缺失/未装配 ⇒ fail-closed 空集，
  // 不回退 legacy `cards`）。本层不复制第二张表。
  return governanceCardKindsOf(roleId, matrix);
}

/**
 * 卡种 → 可发起角色（由 `cardKindsOf` 反推，单一来源；不手写第二张权限表）。
 * 遍历六内置治理角色全量（已装配读模块；未装配回退迁移前表），不依赖回退表键集。
 * 越权拒绝文案据此告诉模型「该谁做」；不改变白名单或判定顺序。
 */
const TRIO_CARD_ORIGINATORS: ReadonlyMap<GovernanceCardKind, readonly GovernanceRoleSpec["id"][]> = (() => {
  const map = new Map<GovernanceCardKind, GovernanceRoleSpec["id"][]>();
  for (const spec of BUILT_IN_GOVERNANCE_ROLES) {
    for (const kind of cardKindsOf(spec.id)) {
      const originators = map.get(kind);
      if (originators === undefined) map.set(kind, [spec.id]);
      else originators.push(spec.id);
    }
  }
  return map;
})();

/**
 * 越权卡种的可操作改派提示（文案，不是权限；权限仍只由 `cardKindsOf`（已装配读模块）/迁移前表决定）。
 * 2026-10-31 真机：运营被执行官要求「重新提交验收」，按指示发 acceptance 被结构性拒绝；
 * 旧文案只说「不允许」，没说该类卡该谁发起、下一步该怎么改派。
 *
 * 2026-11-04（trunk-amendment C2c / PM 复审 §4.5 F2）：stable 写入确认卡为应用自有卡种
 * `stable-write`（不进 `GOVERNANCE_CARD_GROUP`，永不判断/代选）。`GovernanceCardKind` 的
 * 联合成员由 C1b 追加；本表先落 route hint（运行时键已就位，类型上以可选键兼容，
 * C1b 加入联合后无需再改本文件）。
 */
const CARD_KIND_ROUTE_HINTS: Readonly<Record<GovernanceCardKind, string>> &
  Readonly<Partial<Record<"stable-write", string>>> = {
  acceptance: "请改为 dispatch_task 给 verifier 执行验收，或请幕僚调度质检",
  appointment: "请改为请幕僚调度人事（nominator）发起招人决定卡",
  "appointment-write": "请改为请幕僚调度人事（nominator）发起写卡审批",
  download: "下载卡只由 request_download 工具经应用通道发起；不得用 request_confirmation/request_choice 发下载卡",
  proposal: "请改为请幕僚调度策划（rapporteur）发起提案卡",
  decision: "请改为请幕僚调度运营（convener）或策划（rapporteur）发起 decision 卡",
  "intent-confirm": "请改为请幕僚（chief）发起需求确认卡",
  "merge-main": "merge-main 为应用合并通道发起的高风险确认卡，必须客户本人确认、judge 不可代批；不得用 request_choice/request_confirmation 发该卡",
  "stable-write": "stable 写入确认卡由应用自有通道（stable-write-runtime）发起；不得用 request_choice/request_confirmation 发 stable 写入确认卡",
};

/**
 * 越权 `cardKind` 的三段式拒绝文案：缺什么（不允许的卡种）/ 该做什么（改派提示）/
 * 谁来做（发起该卡种的角色，由 `cardKindsOf` 反推）。调用方保证不弹卡、不写账本。
 */
function cardKindNotAllowedReason(
  roleId: string,
  cardKind: GovernanceCardKind,
  allowed: readonly GovernanceCardKind[],
): string {
  const originators = TRIO_CARD_ORIGINATORS.get(cardKind);
  const initiatorClause =
    originators === undefined || originators.length === 0
      ? "（该类卡没有可发起的内置治理角色）"
      : `（该类卡由${originators
          .map((id) => {
            const displayName = governanceRoleOf(id)?.displayName;
            return displayName === undefined ? id : `${displayName} ${id}`;
          })
          .join(" / ")} 发起）`;
  const action = CARD_KIND_ROUTE_HINTS[cardKind] ?? "请检查 cardKind 是否正确，或改由有权限的治理角色发起";
  const allowedText = allowed.length > 0 ? allowed.join(" / ") : "无";
  return (
    `治理角色 ${roleId} 不允许 cardKind=${cardKind}${initiatorClause}；` +
    `允许：${allowedText}。${action}；本次未向客户发卡、未写任何记录。`
  );
}

/**
 * `request_confirmation` 的**工具级** cardKind 枚举（与运行时核心 `CONFIRM_CARD_KINDS` 同值）。
 * 本地只用于在拒绝文案里给出「本角色允许的确认卡 kind」——卡种表同时混有 choice 类，
 * 直接列出会把 `proposal`/`acceptance` 等误报成可确认卡种。
 */
const GOVERNANCE_CONFIRM_CARD_KINDS: readonly GovernanceCardKind[] = ["appointment-write"];

/** 某内置治理角色允许的**确认卡** kinds（工具枚举 ∩ 模块卡种；主入口为空）。 */
function confirmCardKindsOf(roleId: GovernanceRoleSpec["id"]): readonly GovernanceCardKind[] {
  return GOVERNANCE_CONFIRM_CARD_KINDS.filter((kind) => cardKindsOf(roleId).includes(kind));
}

/** 账本条目签名（本会话内存合并去重用；只比较能唯一识别一次决定/事件的字段）。 */
function truncateText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/**
 * 为客户决定补 `artifactPath`/`artifactVersion`/`artifactSha256`（应用算；评审 §5.7）。
 * 找不到对应候选物（如尚未写出的 flow 文件）→ 不补，不阻断、不猜。
 */
async function isRegularFileForJudge(projectRoot: string, rel: string): Promise<boolean> {
  try {
    const info = await stat(path.join(projectRoot, ...rel.split("/")));
    return info.isFile();
  } catch {
    return false;
  }
}

/** 变更包 frontmatter 的 riskTier（T0–T3）；缺失/非法 ⇒ undefined（不猜）。 */
function changePackageRiskTier(text: string): "T0" | "T1" | "T2" | "T3" | undefined {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (frontmatter === null) return undefined;
  const match = /^\s*riskTier\s*:\s*(T[0-3])\s*$/m.exec(frontmatter[1]!);
  return match === null ? undefined : (match[1] as "T0" | "T1" | "T2" | "T3");
}

/**
 * C-06（方案 §6.4.1/R2）：`appointment-write` 呈现前的**结构校验**。
 *
 * 旧 flow 路径（带合法 `flowId` 且未给 targetRoleId/decisionId）保持既有行为；新路径（无 flow，
 * 用 intentId/taskId 归属）必须携带 `targetRoleId` + `decisionId`，且：
 *  · 目标必须是非内置项目角色（`su`/六内置/旧 liaison 一律拒）；
 *  · 预览中所有 `角色卡/**` 声明路径必须位于 `角色卡/<targetRoleId>/`；
 *  · `role-card.md` 必须有 Markdown 标题与必填章节；
 *  · `boundary.yaml` 必须通过同一 YAML 解析器，且顶层 `role` 与目录 id 一致。
 * 任一不满足 ⇒ `declined + notPresented`（不发卡、不发行任何写入路径、不写账本）。
 * D3 `request.resolved`（decisionId/targetRoleIds/intentId|taskId）的**事实校验**在桌面应用层
 * （`session.ts::withRequestLifecycle`）执行；本函数只做预览结构，不读 `.ans`。
 */
export function validateAppointmentWritePreview(args: {
  request: CustomerInputRequest;
  metadata?: CustomerInputMetadata;
  declaredPaths: readonly string[];
  /** 2026-10-29（方案 v2.1 §5.1/M4）：名单给该角色的授权目录（项目相对、以 / 结尾）。
   *  给出时 boundary.yaml 的每个条目必须落在其中（`[]` = 不在名单内，任何条目都拒绝）；缺省 = 旧路径不校验。 */
  allowedDirectories?: readonly string[];
}): string | undefined {
  const cardKind = args.request.cardKind ?? args.metadata?.cardKind;
  if (cardKind !== "appointment-write") return undefined;
  const rawTarget = args.metadata?.targetRoleId;
  const rawDecision = args.metadata?.decisionId;
  const targetRoleId = typeof rawTarget === "string" ? rawTarget.trim() : "";
  const decisionId = typeof rawDecision === "string" ? rawDecision.trim() : "";
  const legacyFlow = isGovernanceFlowId(args.request.flowId ?? args.metadata?.flowId);
  if (legacyFlow && targetRoleId === "" && decisionId === "") return undefined; // 旧 flow 路径逐字不变
  const problems: string[] = [];
  if (targetRoleId === "") problems.push("缺少 targetRoleId（D3 目标项目角色，appointment-write 新路径必填）");
  if (decisionId === "") problems.push("缺少 decisionId（D3 request.resolved 的决定 id，appointment-write 新路径必填）");
  if (decisionId !== "" && (decisionId.length > 200 || /[\u0000-\u001f\u007f]/.test(decisionId))) {
    problems.push("decisionId 非法（须为不含控制字符的有界字符串）");
  }
  if (targetRoleId !== "") {
    if (targetRoleId.includes("/") || targetRoleId.includes("\\") || targetRoleId === "." || targetRoleId === "..") {
      problems.push(`targetRoleId 非法：${targetRoleId}`);
    } else if (isBuiltInGovernanceRoleId(targetRoleId)) {
      problems.push(`targetRoleId=${targetRoleId} 是内置治理角色，appointment-write 只能写项目角色`);
    }
  }
  const prefix = targetRoleId !== "" ? `角色卡/${targetRoleId}/` : "";
  for (const rel of args.declaredPaths) {
    if (prefix === "" || !rel.startsWith(prefix)) {
      problems.push(`声明路径 ${rel} 不在 角色卡/${targetRoleId || "<targetRoleId>"}/ 之内`);
    }
  }
  if (targetRoleId !== "" && !targetRoleId.includes("/") && !targetRoleId.includes("\\")) {
    for (const entry of declaredPathBodies(args.request.preview, args.declaredPaths)) {
      if (!entry.path.startsWith(prefix) || !entry.hasBody) continue;
      const body = entry.body;
      if (/\/role-card\.md$/i.test(entry.path)) {
        if (!/^#{1,6}\s/m.test(body)) problems.push(`${entry.path} 缺少 Markdown 标题`);
        for (const section of ROLE_CARD_REQUIRED_SECTIONS) {
          if (!section.test.test(body)) problems.push(`${entry.path} 缺少必需章节「${section.label}」`);
        }
      } else if (/\/boundary\.yaml$/i.test(entry.path)) {
        // preview 常把 YAML 放进代码围栏；去掉围栏行再按同一解析器校验（内容本身不变）。
        const yamlText = body.replace(/^\s*(?:```|~~~).*$/gm, "").trim();
        const validation = validateBoundaryYamlText(yamlText);
        if (!validation.ok) {
          problems.push(`${entry.path} 边界 YAML 非法：${validation.message}`);
        } else {
          try {
            const doc = parseYaml(yamlText) as unknown;
            const declaredRole =
              doc !== null && typeof doc === "object" && !Array.isArray(doc)
                ? (doc as Record<string, unknown>).role
                : undefined;
            if (declaredRole !== targetRoleId) {
              problems.push(`${entry.path} 顶层 role=${JSON.stringify(declaredRole)} 与目录 id=${targetRoleId} 不一致`);
            }
            if (args.allowedDirectories !== undefined) {
              const entries = doc !== null && typeof doc === "object" && !Array.isArray(doc)
                ? (doc as Record<string, unknown>).entries
                : undefined;
              if (Array.isArray(entries)) {
                for (const rawEntry of entries) {
                  const entryPath = rawEntry !== null && typeof rawEntry === "object" && !Array.isArray(rawEntry)
                    ? (rawEntry as Record<string, unknown>).path
                    : undefined;
                  if (typeof entryPath !== "string") continue;
                  const normalized = entryPath.replace(/\\/g, "/");
                  const allowed = args.allowedDirectories.some((allowedPath) => {
                    const modulePath = allowedPath.replace(/\\/g, "/");
                    if (modulePath.endsWith("/")) {
                      return normalized === modulePath.slice(0, -1) || normalized.startsWith(modulePath);
                    }
                    return normalized === modulePath;
                  });
                  if (!allowed) {
                    problems.push(`${entry.path} 的目录 ${normalized} 不在名单给 ${targetRoleId} 的授权目录内`);
                  }
                }
              }
            }
          } catch {
            // 语法错误已由 validateBoundaryYamlText 报出；此处只做身份检查。
          }
        }
      }
    }
  }
  if (problems.length === 0) return undefined;
  const shown = problems.slice(0, 8).join("；");
  return (
    `appointment-write 未呈现（结构校验失败）：${shown}${problems.length > 8 ? `；另有 ${problems.length - 8} 项` : ""}。` +
    "请在 preview 中按目标角色目录逐路径给出合法 role-card.md（标题 + 必填章节）与 boundary.yaml（顶层 role 与目录一致），" +
    "并在 paths 中只声明该角色目录内的实际写入路径；本次未向客户发卡、未发行任何写入路径。"
  );
}

/**
 * `judgeContext` 的唯一计算点（2026-10-18 双开关评审 §5.2/§5.4）：
 * paths/pathProbes（只取 preview 的**声明写入路径**；与散文无关，`resolveWrite` 机械探测）、
 * 写根/禁写、规范物证、推荐集、账本事实。桌面只消费，不重算、不读 `.ans`。
 * 2026-10-22：推荐集从**团队计划**解析（legacy 提名回落）；acceptance 暴露变更包档位 `facts.riskTier`。
 */
function sessionDirFor(projectRoot: string, roleId: string, runtime?: RuntimeKind): string | undefined {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") return undefined;
  if (roleId === "" || roleId.includes("/") || roleId.includes("\\") || roleId.includes("..")) return undefined;
  const dir = path.join(projectRoot, ".ans", "sessions", roleId, ...(runtime ? [runtime] : []));
  return dir.endsWith(path.sep) ? dir : dir + path.sep;
}

// 构造传给会话的任务提示：含一个**具体、可判定**的改动要求，指向该角色边界与 writeSet 内
// 真实可写的文件——使（真实模型的）会话确实发起一次写入，从而验证扩展 on("tool_call") 在运行期
// 触发，而不是只回头索要需求。目标取 writeSet 首项（按定义是角色边界的真子集，故确可写）；
// 无 scope（chat）时不给具体文件，只给边界约束。
function buildTaskPrompt(taskId: string | undefined, scope: TaskScope | undefined): string {
  const idPart = taskId !== undefined && taskId !== "" ? `任务 ${taskId}：` : "";
  const target = scope && scope.writeSet.length > 0 ? scope.writeSet[0] : undefined;
  const head =
    idPart +
    (scope
      ? "请在批准的写集内工作；越界或写集外的写入会在写入之前被门禁拒绝。"
      : "请在角色的授权边界内工作；越界写入会在写入之前被门禁拒绝。");
  if (target === undefined) return head;
  return (
    `${head}\n` +
    `具体改动要求：请编辑文件 ${target}，在其顶部新增一行注释「// [${taskId}] 受治理会话运行时确认」，` +
    `并**用 write_file 或 edit_file 实际发起这次写入**（这是本任务可判定的验收点；不要只回答计划）。`
  );
}

/** Fresh host-derived ordinary scope facts. This is not a permission or an effect capability. */
export async function readRoleCapabilityProtectionScope(input: { projectRoot: string }): Promise<{ state: "required" | "unmanaged" | "unknown"; revision: number }> {
  const { state, revision } = await readGitHostProtectionRequirement(input);
  return { state, revision };
}

/** Compatibility factory shape; capability injection still controls tool registration. */
export type RuntimeAdapterFactory = (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
/** Trusted host evidence preparation, separate from opening or scheduling a chief session. */
export async function prepareChiefDecisionEvidence(input: DecisionEvidenceInput & { projectRoot: string }): Promise<{
  baseDigest: string;
  evidenceRefs: readonly import("../../model/trunk.ts").SnapshotArtifactRef[];
  context: string;
  isCurrent(): Promise<boolean>;
}> {
  const service = createTrunkService({ projectRoot: input.projectRoot });
  const request = structuredClone(input.request);
  const metadata = input.metadata === undefined ? undefined : {
    ...input.metadata,
    judgeContext: input.metadata.judgeContext === undefined ? undefined : structuredClone(input.metadata.judgeContext),
  };
  const prepared = await service.prepareDecisionEvidence({ originRoleId: input.originRoleId, request, metadata });
  if (!prepared.ok) throw new Error(prepared.message ?? prepared.code);
  const { baseDigest, evidenceRefs, context, verification } = prepared.value;
  return { baseDigest, evidenceRefs, context, isCurrent: () => service.checkDecisionEvidence(verification) };
}
export type AdapterFactoryBuilder = (project: ProjectConfig, shellGate?: ShellGate) => RuntimeAdapterFactory;
export type RuntimeAdapterFactoryOptions = Omit<RuntimeSessionOptions, "runtime" | "gate" | "projectRoot" | "skillRoot">;
export type RuntimeAdapterFactoryBuilder = (project: ProjectConfig, runtime: RuntimeKind, options?: RuntimeAdapterFactoryOptions) => RuntimeAdapterFactory;
export interface RoleSessionDeps {
  createAdapter?: RuntimeAdapterFactory;
  runtimeOptions?: RuntimeAdapterFactoryOptions;
}

/** Host after-write observation. The G Service owns baseline I/O; this receipt grants no write authority. */
export async function registerVersionedDocumentAfterWrite(input: { projectRoot: string; absPath: string; recordedBy?: string }): Promise<boolean | undefined> {
  const relPath = projectRelativeLexical(input.absPath, input.projectRoot);
  if (relPath === undefined) return false;
  return registerVersionedDocument({ projectRoot: input.projectRoot, relPath, ...(input.recordedBy ? { recordedBy: input.recordedBy } : {}) });
}

/** fixed chief-workflow 资源（`chief-workflow-v2.md`）只读观测结果（应用资源，非授权依据）。 */
interface FixedChiefWorkflowResource {
  text: string;
  sourceUrl: string;
  moduleUrl: string;
  version: string;
  sha256: string;
  bytes: number;
  applicationVersion: string;
}

/**
 * T3 B2（AC-24/§3.4）：读取应用内置 fixed `chief-workflow-v2.md`（版本 `chief-workflow/v2`）。
 *
 * 与 legacy loader（`provider/runtime/tools.ts::loadBuiltinChiefWorkflow`）同口径：只读应用包内
 * 资源；校验 Markdown 身份、唯一版本行（**恰 `chief-workflow/v2`**）、UTF-8/NUL/体积；计算
 * SHA-256/bytes 并附应用版本。读取/校验失败 ⇒ 抛错 fail-closed（不猜正文、不静默降级）。
 * legacy `chief-workflow.md`（v1）**不读、不改**；本函数只服务 fixed 会话注入。
 */
async function loadFixedChiefWorkflowResource(): Promise<Readonly<FixedChiefWorkflowResource>> {
  const source = new URL("../../common/门禁引擎/workflows/chief/chief-workflow-v2.md", import.meta.url);
  try {
    const bytes = await readFile(source);
    if (bytes.length === 0 || bytes.length > 256 * 1024) throw new Error("empty or oversized fixed Chief workflow resource");
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.includes("\0") || !/^\uFEFF?# Chief 工作流/.test(text)) throw new Error("invalid fixed Chief workflow Markdown identity");
    const versions = [...text.matchAll(/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm)];
    if (versions.length !== 1 || versions[0]![1] !== "chief-workflow/v2") {
      throw new Error("fixed Chief workflow resource version must be chief-workflow/v2");
    }
    const application = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8")) as { version?: unknown };
    if (typeof application.version !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(application.version)) {
      throw new Error("application version unavailable");
    }
    return Object.freeze({
      text,
      sourceUrl: source.href,
      moduleUrl: import.meta.url,
      version: versions[0]![1]!,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      applicationVersion: application.version,
    });
  } catch (error) {
    throw new Error(`chief-workflow-v2-resource-unavailable: ${source.href} (${errText(error)})`, { cause: error });
  }
}

/** Fixed engine, shared governed tools, exact project roots; no fallback engine. */
export function createRuntimeAdapterFactory(
  project: ProjectConfig,
  runtime: RuntimeKind,
  options: RuntimeAdapterFactoryOptions = {},
): RuntimeAdapterFactory {
  if (!(RUNTIME_KINDS as readonly string[]).includes(runtime)) throw new Error(`未知运行时：${runtime}`);
  const factory: RuntimeAdapterFactory = (gate, capabilities) => createRuntimeAdapter({
    ...options,
    runtime, gate, projectRoot: project.projectRoot, skillRoot: project.skillRoot,
    readRoot: project.projectRoot,
    writeRoot: runtime === "demo" ? options.writeRoot : project.projectRoot,
    shellCwd: project.projectRoot,
    persistSession: capabilities?.persistSession ?? options.persistSession ?? (capabilities?.sessionDir !== undefined),
    customerInput: capabilities?.customerInput,
    // 2026-10-29（v2.13）：属主 write_file/edit_file 成功后，guard 在项目锁内登记版本基线。
    versionedDocAfterWrite: async (absPath: string) => {
      const rel = projectRelativeLexical(absPath, project.projectRoot);
      if (rel !== undefined && capabilities?.roleDraftWritePaths?.includes(rel)) return true;
      return options.versionedDocAfterWrite ? options.versionedDocAfterWrite(absPath)
        : registerVersionedDocumentAfterWrite({ projectRoot: project.projectRoot, absPath, recordedBy: "app:session" });
    },
    reportHandback: capabilities?.reportHandback,
    // 2026-10-26 图片查看（view_image）：运行时核心 `GovernedToolsOptions.viewImage` 同名能力位
    // （形状同源 `model/runtime.ts` `ViewImageFn`）；Service 以 `...options` 透传给
    // `buildGovernedTools`，`undefined` ⇒ 工具不注册（同 dispatch_task 先例）。本层纯透传——路径/
    // 类型/大小校验在工具层，能力侧只负责排队并如实回执；不改变任何写权。
    viewImage: capabilities?.viewImage,
    dispatchTask: capabilities?.dispatchTask,
    // Batch 3.5（C1d/S5）：三提交能力位（注入才注册；角色门控在 openRoleSession）。
    chiefDecisionContext: capabilities?.chiefDecisionContext,
    decidePendingRequest: capabilities?.decidePendingRequest,
    submitVersionChange: capabilities?.submitVersionChange,
    selectRunChange: capabilities?.selectRunChange,
    completeTeamPlan: capabilities?.completeTeamPlan,
    activateRoleDocuments: capabilities?.activateRoleDocuments,
    closeCreatedTask: capabilities?.closeCreatedTask,
    // T3 B2（MF-IR-2/3）：fixed 收口/激活依赖透传给运行时核心（字段名 = 本层给出的接线契约；
    // 运行时核心 B2 在 `GovernedToolsOptions` 加同名字段后由 handler 消费）。undefined ⇒ 字段缺席
    // （legacy 会话不出现；fixed 会话由 openRoleSession 注入 fixed 实现，legacy 实现不可达）。
    ...(capabilities?.closeCreatedTaskFixed !== undefined ? { closeCreatedTaskFixed: capabilities.closeCreatedTaskFixed } : {}),
    ...(capabilities?.activateRoleDocumentsFixed !== undefined ? { activateRoleDocumentsFixed: capabilities.activateRoleDocumentsFixed } : {}),
    gitQuery: capabilities?.gitQuery,
    gitCandidate: capabilities?.gitCandidate,
    gitPublish: capabilities?.gitPublish,
    protectedGitRoots: capabilities?.protectedGitRoots,
    fileGateProtocol: capabilities?.fileGateProtocol,
    fileGateProtection: capabilities?.fileGateProtection,
    submitRefactor: capabilities?.submitRefactor,
    requestStableWrite: capabilities?.requestStableWrite,
    // 治理权力矩阵（C3）：纯展示提示段（C2 `RuntimeProviderOptions.contextSections`）与只读工具
    // 能力位（C2 `GovernedToolsOptions.governanceMatrix`）。undefined ⇒ 字段缺席/工具不注册。
    contextSections: capabilities?.contextSections,
    governanceMatrix: capabilities?.governanceMatrix,
    // 2026-10-26 需求变更申请（request_requirement_change）：运行时核心 `GovernedToolsOptions` 同名
    // 能力位（形状同源 `model/runtime.ts` `RequestRequirementChangeFn`）；`undefined` ⇒ 工具不注册
    // （能力缺席 = 最强 fail-closed）。本层纯透传——意图校验/去重/
    // 派发/账本由能力实现；**提交申请 ≠ 客户批准 ≠ 意图已变更**。
    requestRequirementChange: capabilities?.requestRequirementChange,
    // 2026-11-04 下载申请：能力位逐字透传；undefined ⇒ 工具不注册（同 requestRequirementChange 先例）。
    requestDownload: capabilities?.requestDownload,
    // 2026-11-02（全局任务状态/版本决策）：能力位逐字同名透传；undefined ⇒ 工具不注册。
    projectState: capabilities?.projectState,
    projectNote: capabilities?.projectNote,
    requestVersionDecision: capabilities?.requestVersionDecision,
    // G-2/R1-R2：看护三能力并入适配器选项——**契约字段名** `roleStatus` / `sessionTail` /
    // `proposeRecovery`（运行时核心 `GovernedToolsOptions` 同名能力位，形状同源 `model/runtime.ts`）；
    // `undefined` ⇒ 对应工具不注册（能力缺席 = 最强 fail-closed，同 dispatch_task 先例）。
    roleStatus: capabilities?.roleStatus,
    contractCheck: capabilities?.contractCheck,
    // 2026-11-09（文档格式权威说明，P1.2 §14 G1）：`doc_format` 只读数据源逐字透传（运行时核心
    // `GovernedToolsOptions.docFormat` 同名能力位，形状同源 `model/runtime.ts` `DocFormatFn`）；
    // `undefined` ⇒ 工具不注册（能力缺席 = 最强 fail-closed，同 contract_check 先例）。只读、不构成放行/授权。
    docFormat: capabilities?.docFormat,
    evidenceCheck: capabilities?.evidenceCheck,
    sessionTail: capabilities?.sessionTail,
    roleActivityLog: capabilities?.roleActivityLog,
    terminateRoleRun: capabilities?.terminateRoleRun,
    redispatchTask: capabilities?.redispatchTask,
    // G-4/I1-I2：技能安装/卸载两能力并入适配器选项——**契约字段名** `installSkill` / `uninstallSkill`
    // （运行时核心 `GovernedToolsOptions` 同名能力位，形状同源 `model/runtime.ts`）；
    // `undefined` ⇒ 对应工具不注册（能力缺席 = 最强 fail-closed，同 dispatch_task 先例）。
    installSkill: capabilities?.installSkill,
    uninstallSkill: capabilities?.uninstallSkill,
    // G-4/V2：MCP 安装/卸载两能力并入适配器选项——**契约字段名** `installMcp` / `uninstallMcp`
    // （运行时核心 `GovernedToolsOptions` 同名能力位，形状同源 `model/runtime.ts`）；
    // `undefined` ⇒ 对应工具不注册（能力缺席 = 最强 fail-closed，同 install_skill 先例）。
    installMcp: capabilities?.installMcp,
    uninstallMcp: capabilities?.uninstallMcp,
    // 「替我审」判断会话：只读能力注入（运行时核心 `GovernedToolsOptions.shellJudge` 同名能力位）。
    // 注入 ⇒ Service 走 `buildShellJudgeTools` + `judgeMode:true` + 外来 MCP 置空；
    // `undefined` ⇒ 普通会话（逐字现状）。
    shellJudge: capabilities?.shellJudge ?? options.shellJudge,
    // 治理卡判断会话（「替我审批」/「替我决策」）：与 `shellJudge` 同形的只读能力注入。
    // **只由编排 `createGovernanceJudge` 使用**（judge 会话），普通角色会话不传；
    // Service 侧二者互斥（同时给出 ⇒ 抛配置错误）。
    governanceJudge: capabilities?.governanceJudge ?? options.governanceJudge,
    shellGate: capabilities?.shellGate ?? options.shellGate,
    // 2026-11-08（W3b，I0-4）：只读 Git 固定传输能力（运行时核心 `GovernedToolsOptions.readonlyGit`）；
    // capabilities 优先（每会话注入），其次 runtimeOptions（桌面/测试统一工厂透传）。缺省 ⇒ `run_shell`
    // 对 `git` 一律 `readonly-git-runner-unavailable`（零执行、绝不回退通用 spawn）。
    readonlyGit: capabilities?.readonlyGit ?? options.readonlyGit,
    // 2026-10-31（判拒升级）：`request_shell_escalation` 工具能力（运行时核心同名能力位；工具只在
    // shell 已 arm 且本能力注入时注册）。`undefined` ⇒ 工具不注册（能力缺席 = 最强 fail-closed）。
    shellEscalation: capabilities?.shellEscalation ?? options.shellEscalation,
    // 2026-10-29（方案 v2.1 §6.5）：执行后写审计钩子（能力面/选项同源透传；缺省不审计）。
    ...(capabilities?.shellPostAudit !== undefined || options.shellPostAudit !== undefined
      ? { shellPostAudit: capabilities?.shellPostAudit ?? options.shellPostAudit }
      : {}),
    shellVerdict: capabilities?.shellVerdict,
  });
  officialCoreAdapterFactories.add(factory);
  return factory;
}

export function selectAdapterFactory(
  runtime: RuntimeKind,
  project: ProjectConfig,
  deps: {
    createAdapter?: RuntimeAdapterFactory;
    piFactory?: AdapterFactoryBuilder;
    shellGate?: ShellGate;
    runtimeFactory?: RuntimeAdapterFactoryBuilder;
    runtimeOptions?: RuntimeAdapterFactoryOptions;
  } = {},
): RuntimeAdapterFactory {
  if (!(RUNTIME_KINDS as readonly string[]).includes(runtime)) throw new Error(`未知运行时：${runtime}`);
  if (deps.runtimeFactory) return deps.runtimeFactory(project, runtime, { ...deps.runtimeOptions, ...(deps.shellGate !== undefined ? { shellGate: deps.shellGate } : {}) });
  if (runtime === "pi" && deps.piFactory) return deps.piFactory(project, deps.shellGate);
  if (runtime === "demo" && deps.createAdapter && !deps.runtimeOptions) return deps.createAdapter;
  return createRuntimeAdapterFactory(project, runtime, { ...deps.runtimeOptions, ...(deps.shellGate !== undefined ? { shellGate: deps.shellGate } : {}) });
}

/** Existing Pi public name now composes the neutral Service. */
export function createPiAdapterFactory(project: ProjectConfig, shellGate?: ShellGate): RuntimeAdapterFactory {
  return createRuntimeAdapterFactory(project, "pi", { shellGate });
}

/** ANS replay only; native resume is reported by the session's dynamic getters. */
export async function readRoleSessionHistory(
  options: { projectRoot: string; roleId: string; runtime: RuntimeKind },
  context?: { credentialEnvNames?: readonly string[] },
): ReturnType<typeof import("../../service/runtime/session.ts").readRuntimeSessionHistory> {
  const service = await import("../../service/runtime/session.ts");
  return service.readRuntimeSessionHistory({ ...options, credentialEnvNames: context?.credentialEnvNames });
}

/** Host-only context: renderer text/requests never choose credential names or history entries. */
export function projectRoleLegacyHistory(
  input: { projectRoot: string; roleId: string; runtime: "pi"; readOk: boolean;
    entries: readonly RuntimeLegacyHistoryEntryV1[]; source?: string; error?: string; skipped: number },
  context?: { credentialEnvNames?: readonly string[] },
): RuntimeLegacyHistoryProjectionV1 {
  if (typeof input?.projectRoot !== "string" || input.projectRoot.trim() === ""
    || typeof input.roleId !== "string" || input.roleId.trim() === "" || input.runtime !== "pi") {
    return { ok: false, version: 1, code: "INVALID_INPUT", message: { text: "历史范围无效。", redacted: false, truncated: false }, entries: [] };
  }
  return projectRuntimeLegacyHistory({ scope: { roleId: input.roleId, runtime: input.runtime },
    readOk: input.readOk, entries: input.entries, source: input.source, error: input.error,
    skipped: input.skipped, credentialEnvNames: context?.credentialEnvNames });
}

function trustedCredentialNames(options?: RuntimeAdapterFactoryOptions): readonly string[] {
  const names = [...(options?.extraCredentialEnvVars ?? [])];
  if (options?.apiKeyEnvVar) names.push(options.apiKeyEnvVar);
  return [...new Set(names.filter(name => typeof name === "string" && name.trim() !== ""))];
}

export function isFailedSettlement(event: SessionEvent): boolean {
  if (event.kind !== "settled") return false;
  const outcome = (event.detail as { outcome?: unknown } | undefined)?.outcome;
  return outcome === "failed" || outcome === "aborted" || outcome === "timed_out";
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
