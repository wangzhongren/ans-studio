import { RuntimeDeliveryError } from "../../src/model/runtime.ts";
import type { SessionEvent, RuntimeTurnOutcome, RuntimePersistenceChangeV1, ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1, DeliveryReceiptQueryV1, RuntimeDeliveryReceiptV1, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1, RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1, GovernanceJudgeContext, BackgroundTaskSnapshot, BackgroundTaskReadOptions, BackgroundTaskReadResult, BackgroundTaskStopOptions, BackgroundTaskStopResult } from "../../src/model/runtime.ts";
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
import type { GovernanceModel, ProjectConfig } from "../../src/model/role.ts";
// 三权（评审 §5.1/§5.6）：内置治理角色 id 判定 / 注册表统一来自门禁引擎的 Service 公开出口
// （桌面**不复制**第二份 id 列表，也不直接导入 `src/common/门禁引擎/` 私有模块）。
import { governanceRoleOf, isBuiltInGovernanceRoleId, resolveBoundary, trioGovernanceSource } from "../../src/service/boundary/resolve-boundary.ts";
// O-1（2026-10-12）：边界快照的**可信信号** = 读盘内容哈希（sha256）——本层只读、不复制门禁解析。
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { RoleSessionHandle, RoleSessionAbortResult, RoleSessionSendOptions } from "../../src/pipeline/orchestration/run-role.ts";
import { createRuntimeAdapterFactory, type RuntimeAdapterFactoryBuilder, type RuntimeAdapterFactoryOptions, type RuntimeAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";
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
import { declaredConfirmPaths } from "../../src/common/编排/confirmed-writes.ts";
// B 批（2026-10-28）：任务/汇报主干与最小状态（编排单一来源，本层只接线）。
import { appendTaskEvent, classifyTaskSideEffect, findTaskByIdempotencyKey, newTaskId, readTaskState, redispatchCountOf, redispatchTaskId, renderTaskCardLines, shortenSummary, taskCardOf, taskCards, taskEvent, taskIdempotencyKey, taskReportStatusOf, type TaskCardView, type TaskReplay } from "../../src/common/编排/task-state.ts";
import { applyRunChange, buildRunChangeCard, ensureDraftRun, findActiveRun, loadPinnedRoster, listRunManifestsResult, mapRunChangeAnswer, pinRun, pinnedDocsSummary, verifyPinnedRun, RUN_PENDING_FLOW_ID, type RunManifest, type RunChangeMode } from "../../src/common/编排/run-manifest.ts";
import { appendRoleLog, formatRoleActivityText, readRoleLog } from "../../src/common/编排/role-log.ts";
import { docsForFlow, formatMechanicalRejection, humanRejection, makeMechanicalRejection, rejectionMapSnapshot, technicalRejectionCode, type MechanicalRejection } from "../../src/common/编排/mechanical-rejection.ts";
// B 批：终止/重派安全判定（单一来源；桌面只提供终止事实/执行动作）。
import { evaluateRedispatchSafety, type RedispatchSafetyDecision } from "../../src/common/编排/watchdog.ts";
import {
  ENV_BOOTSTRAP_ROLE_ID,
  evaluateDispatchPreflight,
  loadLatestRoster,
  reportTargetForTaskCreator,
  rosterRoleIds,
  type ProjectRoster,
  type RosterLoadResult,
} from "../../src/common/编排/workflow-preconditions.ts";
import { verifyVersionedDocBaselines } from "../../src/common/门禁引擎/versioned-doc-guard.ts";

/**
 * 内置来源回交→Lead 与同轮 settle 治理反馈的去重窗口（2026-10-24）：标记只在回交入队后到本轮
 * settle 之间的短窗口内有效；超出即不抑制（宁可重复一次，也不永久吞掉后续轮次的反馈）。
 */
const GOVERNANCE_HANDBACK_MIRROR_DEDUPE_MS = 5 * 60 * 1000;

/**
 * 治理反馈客户投影的登记表（2026-10-25 A3）：`queueKey + sha256(text)` → 投影。
 * 发送成功时登记；`prompt-input` 回显到达时按同一文本查表并附到事件 detail。
 * 有界 + TTL：只有运行期提示用途，不持久化（恢复/回放行回退到既有文本归类）。
 */
const GOVERNANCE_CLIENT_PROJECTION_LIMIT = 128;
const GOVERNANCE_CLIENT_PROJECTION_TTL_MS = 30 * 60 * 1000;

/** Proof settle 状态措辞（只用于「状态 + 指针」投递；不解释报告内容、不猜验收结论）。 */
const PROOF_STATUS_TEXT: Readonly<Record<RuntimeTurnOutcome, string>> = {
  completed: "本轮已完成",
  failed: "本轮失败",
  aborted: "本轮已中止",
  timed_out: "本轮超时",
};
// ↑ G-1／A2（2026-10-16 客户批准；设计 `2026-10-16_design_contract-workflow-dispatch.md` §四/§九 A2；
// 编排 A1 交回接口见 `角色卡/编排/docs/change/2026-10-16_change_contract-workflow-dispatch-a1.md` §五）：
// 派发必读块的**提取**（`extractDispatchReadPaths`）、**判据**（`planDispatchDelivery`：契约缺失 ⇒ fail-closed
// 拒投；workflow 缺失 ⇒ 降级照投）、**渲染**（`renderDispatchPrompt`，经判据产出的定格文本）都是编排的
// **单一来源**——本层**只做接线**（投递时用 `filePrint` 探测各引用、按判据拒投或入队），不得各写一份。
// 本批已删除本地副本 `renderDispatchPromptLocal`（既有登记依赖收口——落地后必须切换、不得两处并存）。
import { createDiagnosticLogger, getDiagnosticsStatus } from "../../src/common/shared/diagnostics.ts";
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
import { type RoleStatusFn, type RoleStatusPayload, type SessionTailFn, type SessionTailPayload, type WatchdogToolResult } from "../../src/common/编排/watchdog.ts";
import type { WriteGate, RuntimeAdapter, ShellGate, OperatorChannelFn, CustomerInputFn, CustomerInputRequest, CustomerInputMetadata, CustomerInputOutcome, PromptTurnStartedMetadata, ShellJudgeFn, GovernanceJudgeFn, ViewImageFn, ContractCheckFn, ContractCheckInput, EvidenceCheckFn, EvidenceCheckInput, CriteriaRef } from "../../src/model/runtime.ts";
import { checkEvidence, checkEvidenceCollection, deriveAcceptanceFact, isWithinEvidenceRoots, loadCriteria, parseEvidenceMeta, readArtifact, validateEvidencePath, EVIDENCE_META_SCHEMA } from "../../src/common/编排/evidence-check.ts";
// 2026-10-26 需求变更申请（request_requirement_change）：同源契约；仅统筹/提案会话注入。
// 申请 ≠ 批准：审批由客户/判断 agent 在发起方会话的 decision 卡完成，主理只在批准后执行意图变更。
import type { RequestRequirementChangeFn, RequestRequirementChangeInput, RequestRequirementChangeResult } from "../../src/model/runtime.ts";
// W6-B：决定卡镜像已由 C 批移除（申请/结果直达来源角色，幕僚只收系统通知）；报告指针文案在此接线。
import { governanceAcceptanceReportPath } from "./governance-advance.ts";
// H-1（2026-10-12）：派发能力的冻结契约（§4 冻结家；只读导入、不复制形状）。
import type { DispatchTaskPayload, DispatchReceipt, DispatchTaskFn, PromptOptions, TaskStateEvent, RoleActivityLogPayload, RoleActivityLogFn, TerminateRoleRunFn, RedispatchTaskFn } from "../../src/model/runtime.ts";
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
import type { DesktopCustomerInputFn } from "./customer-input.ts";
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

/**
 * 会话事件外推的**信封**（B-2，2026-10-12）：多会话并存后，事件必须携带**它属于哪个角色**
 * （渲染侧按 projectRoot/runtime/roleId 分发——不带标识会串消息）。源报告只保留公开安全投影，raw handback不进入此传输类型。
 */
export type DesktopOrchestrationEvent = SessionEvent | Omit<HandbackEvent, 'handback'>;
export type PersistenceScope = { projectRoot: string; roleId: string; runtime: RuntimeKind };
export type PersistenceReply<T> = { ok: true; version: 1; scope: PersistenceScope; value: T } | { ok: false; version: 1; scope?: PersistenceScope; code: 'INVALID_REQUEST' | 'PROJECT_NOT_ACTIVE' | 'SESSION_NOT_AVAILABLE' | 'SNAPSHOT_EXPIRED' | 'UNSUPPORTED'; message: string };
export type PersistenceCapabilities = { mode: 'enabled' | 'disabled' | 'unknown-live'; reportSaveSupported: boolean; deliveryHistorySaveSupported: boolean; querySupported: boolean };
export interface PersistenceValues { retryReportSave: ReportSaveResultV1; getReportSaveState: ReportSaveStateV1; retryDeliveryHistorySave: DeliverySaveResultV1; getDeliveryReceipt: DeliveryReceiptQueryV1; getSessionPersistence: PersistenceCapabilities }
export type PersistenceUpdated = { version: 1; scope: PersistenceScope; change: RuntimePersistenceChangeV1 };
export interface SessionEventEnvelope {
  /** Display correlation only, captured from the original client delivery. */
  clientMessageId?: string;
  roleId: string;
  projectRoot: string;
  runtime: RuntimeKind;
  event: DesktopOrchestrationEvent;
}

/**
 * 治理反馈的**客户投影**（2026-10-25 UI/UX 评审 A3/A4，设计
 * `角色卡/桌面窗口/docs/design/2026-10-25_plan_chat-panel-adjustments.md`）：
 * 附在 `prompt-input` 消息事件的 `detail.clientProjection` 上，供渲染侧只显示客户可读信息；
 * 内部原文仍在 `detail.text`（审计/可折叠），本结构**不含**内部正文。字段可选：缺失时渲染侧
 * 按既有文本归类，行为与现在一致。`fingerprint` 供 UI 合并连续同内容状态行（×N）。
 */
export interface GovernanceClientProjectionV1 {
  version: 1;
  kind: "governance-feedback";
  /** 稳定指纹：sha256(canonical{kind, sourceRoleId, statusCode, flowIds(排序), reportPath, governancePath, textHash})。 */
  fingerprint: string;
  sourceRole: { roleId: string; displayName: string };
  /** 机器可读状态：Proof 为四值终局/unknown；非 Proof 内部反馈为 internal-feedback。 */
  statusCode: "completed" | "failed" | "aborted" | "timed_out" | "unknown" | "internal-feedback";
  /** 与任务正文一致的状态文本（应用生成，非伪造）。 */
  statusText: string;
  flowIds?: string[];
  /** 仅 Proof 指针任务提供。 */
  reportPath?: string;
  governancePath?: string;
  /** 客户侧动作：报告已就绪（可打开/等待验收卡）或等待 Lead 汇总。 */
  action: "report-ready" | "await-lead-summary";
}

/**
 * 同时**保活**的会话数上限（B-2 路线 a 的 LRU 上限；设计建议 3）。超出即淘汰**最久未用**者
 * （dispose；界面侧历史由渲染层自持——切回时恢复并明示「模型上下文已重启」）。
 * 淘汰候选不含 busy 会话（P1-2），也不含各项目的主理（`primaryRoleId`，2026-10-26 客户指令）。
 */
export const MAX_LIVE_SESSIONS = 3;

/** 点角色开聊天时的参数（无任何范围/授权字段——授权来自导入项目这个动作）。 */
export interface SessionOpenRequest {
  projectRoot: string;
  roleId: string;
  runtime: RuntimeKind;
}

/**
 * 生效配置来源与接受状态（供界面**如实呈现**；界面只读此结构、不另作判定）。
 *  · kind="ans"               → 用了项目 `.ans/project.json`（accepted 时应 pin-backed）；
 *  · kind="builtin-fallback"  → 无 `.ans`，回退运行期同意（登记的非-pin 例外）；
 *  · kind="ans-invalid"       → `.ans` 存在但不可用 → fail-closed 未接受（**不回退**运行期同意）。
 */
export interface EffectiveConfigInfo {
  kind: ConfigSourceKind;
  accepted: boolean;
  /** 生效 acceptance 的来源说明（未接受时为空——如实，不留貌似有证据的说明）。 */
  acceptanceSource: string;
  /** pin 条数（如实展示：有 pin 才是 pin-backed）。 */
  pinCount: number;
  /** fail-closed 降级原因（accepted:true 无 pin；或 `.ans` 不可解析）。 */
  reason?: string;
}

export interface SessionMessageMetadata {
  clientMessageId?: string;
  /** **应用代客户推进治理流程**（2026-10-18 客户修正）：后台投递标记——不抢 `activeRoleId`/当前 pane，
   *  边界陈旧重建也按「非用户发起」处理。仅桌面主进程内部使用（渲染侧传了也不构成任何权限）。 */
  background?: boolean;
  /**
   * **投递类别**（2026-10-26 客户真机反馈）：`system` = 治理唤醒（交付核证/协调/自动推进）——入队时按
   * `DeliveryItem kind:"system"` 记类（UI 队列显示「系统」、不可撤回），不再冒充客户消息。缺省 `message`
   * （真实客户消息语义逐字不变）。仅桌面主进程内部使用；渲染侧/客户输入不构成权限。
   */
  kind?: "system";
}

export interface SessionTarget { projectRoot?: string; roleId: string; runtime?: RuntimeKind }

export interface OpenResult {
  runtime?: RuntimeKind;
  projectRoot?: string;
  profileRevision?: number;
  ok: boolean;
  error?: string;
  /** 续接等情形的说明（ok=true 时也可能有）。 */
  note?: string;
  /** 本次会话生效的配置来源与接受状态（供界面如实呈现）。 */
  config?: EffectiveConfigInfo;
  /**
   * 是否**续接**了已保活的会话（B-2）：true = 句柄与模型上下文原样保留；false = 本次新建。
   */
  resumed?: boolean;
  /** 桌面 resumed=复用活句柄；recovered=引擎确证原生恢复成功；fresh=新上下文，恢复失败时带 warning。 */
  contextSource?: "resumed" | "recovered" | "fresh";
  /** 引擎实际恢复失败或其他上下文警告。 */
  contextWarning?: string;
}

export interface SendResult {
  ok: boolean;
  /** Observed facts for this exact invocation. ACK is not input acceptance. */
  turnId?: string;
  clientMessageId?: string;
  inputAccepted?: true;
  outcome?: RuntimeTurnOutcome;
  /** Original handle is still current, not a promise that provider cleanup has finished. */
  sessionCurrent?: boolean;
  error?: string;
  /** L-1：本次消息**已入队**（角色忙）——按到达序在当前任务结束后执行；`position` 为排队位次（1 起）。 */
  queued?: boolean;
  /** 入队位次（`queued:true` 时给出）。 */
  position?: number;
  /**
   * **同一应用任务已投递/已入队，本次没有再次投递**（2026-10-25 真机重复投递修复）：
   * 仅对带稳定 `clientMessageId`（`ans-app-task:` 前缀）的应用任务成立——同文＝同一任务，
   * 重建前后至多投递一次；真实客户消息不走此判据（同文重复发送仍是两个意图）。
   */
  duplicate?: true;
}

export interface StopResult {
  ok: boolean;
  note: string;
}

/** P1-1（2026-10-13 客户裁定）：撤回一条**未投递**排队消息的结果——`summary` 供聊天流如实一行
 *  「已撤回排队消息：〈摘要〉」；失败（不在队列/已在投递中）如实给 `error`，绝不假装撤掉。 */
export interface WithdrawResult {
  ok: boolean;
  summary?: string;
  error?: string;
}

// —————————————— 会话级后台任务聚合（2026-10-25，桌面任务面板 B） ——————————————
//
// 运行时 `RoleSession` 已提供三个**可选**方法（`listBackgroundTasks?/readBackgroundTask?/stopBackgroundTask?`，
// `src/model/runtime.ts`），编排 `RoleSessionHandle` 原样透传。本层只做**按项目×引擎的聚合与精确寻址**：
//  · 任务表/日志/pid 只在各会话内存，**不缓存、不持久化、不伪造**；跨会话聚合只是一次读取的快照拼接；
//  · 会话句柄没有 `listBackgroundTasks` ⇒ 跳过该角色；该项目×引擎没有任何会话具备能力 ⇒ 空列表 +
//    `unavailable:true`（UI 据此区分「当前没有任务」与「该运行时/会话不支持」）；
//  · read/stop 一律以 `projectRoot+roleId+runtime` 精确寻址；找不到会话或能力缺席如实失败；
//  · 底层 stop 的 `{ok:false, reason:"unknown-task"|"closed"|"timeout"}` 与异常**不吞、不改写为成功**。

/** 聚合列表中的单条任务：运行时快照 + 所属角色/引擎（同一项目×引擎可聚合多个角色）。 */
export interface BackgroundTaskView extends BackgroundTaskSnapshot {
  roleId: string;
  runtime: RuntimeKind;
}

/** 列表回执：`unavailable` 区分「没有任务」与「没有具备能力的活会话」。参数非法时 `ok:false`。 */
export type BackgroundTasksListReply =
  | { ok: true; projectRoot: string; runtime: RuntimeKind; tasks: BackgroundTaskView[]; unavailable: boolean }
  | { ok: false; error: string };

/** 读取日志入参（寻址三元组与 taskId 必填；`stream`/`tailLines` 与运行时契约同名同义）。 */
export interface BackgroundTaskReadInput {
  projectRoot: string;
  runtime: RuntimeKind;
  roleId: string;
  taskId: string;
  stream?: "stdout" | "stderr" | "both";
  tailLines?: number;
}

/** 读取回执：成功包底层结果（同一引用）；未知任务（底层 `undefined`）/无会话/无能力如实失败，不伪造内容。 */
export type BackgroundTaskReadReply = { ok: true; result: BackgroundTaskReadResult } | { ok: false; error: string };

/** 停止入参（寻址同上；`force` 同 `stop_background_task`）。 */
export interface BackgroundTaskStopInput {
  projectRoot: string;
  runtime: RuntimeKind;
  roleId: string;
  taskId: string;
  force?: boolean;
}

/**
 * 停止回执：底层结果**原样**返回（成功 / `unknown-task` / `closed` / `timeout`，不改写成成功）。
 * 桌面层额外两种如实失败：找不到会话 ⇒ `reason:"closed"`（会话不可用）；句柄无能力 ⇒ `reason:"unavailable"`。
 */
export type BackgroundTaskStopReply =
  | BackgroundTaskStopResult
  | { ok: false; reason: "unavailable"; message: string };

// （A-5：finalize 面已删——提议/确认/手动收口不复存在；产物收尾由编排在 settle 后自动完成，见文件头。）

// —————————————— B 批（2026-10-28）：任务/汇报/日志的桌面数据面 ——————————————

/** 任务列表回执（只读；坏行数如实给出，不隐藏）。 */
export interface TaskListView {
  projectRoot: string;
  tasks: TaskCardView[];
  errors: number;
  unclosed: number;
}

/** 重启恢复回执（未关闭任务展示；未投递任务重新入队；失败保留/如实计数）。 */
export interface TaskRestoreReport {
  restored: number;
  skipped: number;
  taskIds: string[];
  /** C 批：重启时标记 orphaned 的未决申请数。 */
  orphanedRequests?: number;
  /** C 批：重启时标记 expired 的未决审批数。 */
  expiredApprovals?: number;
}

export interface TerminateRoleRunInput {
  projectRoot: string;
  roleId: string;
  runtime: RuntimeKind;
  taskId?: string;
  force?: boolean;
}

/** 终止回执（B-08）：子进程树/退出信号/部分写入如实；`terminationConfirmed=false` ⇒ 不自动重派。 */
export interface TerminateRoleRunResult {
  ok: boolean;
  roleId: string;
  terminationConfirmed: boolean;
  childProcesses: number;
  childProcessesStopped: number;
  /** 后台任务终止的底层结果（如实；`kill-timeout` 不得当已停止）。 */
  childResults: { taskId: string; ok: boolean; reason?: string; exitCode?: number; signal?: string }[];
  partialArtifacts: string[];
  /** B-08：已从 `temp/<role>/` 物理移入 `temp/<role>/staging/<隔离批次>/` 的产物（项目相对路径）。 */
  isolatedArtifacts: string[];
  /** B-08：隔离根（项目相对路径；无部分产物时不创建）。 */
  stagingDir?: string;
  /** B-07：是否已确保目标角色使用 fresh 会话（重建/新会话）；重派前置。 */
  sessionFresh: boolean;
  /** 轮次中止回执（运行时不支持/失败如实）。 */
  abort: { ok: boolean; supported: boolean; error?: string };
  message?: string;
}

export interface RedispatchTaskInput {
  projectRoot: string;
  taskId: string;
  /** 目标角色（缺省沿用原任务目标）。 */
  to?: string;
}

/** 重派回执（B-07/B-08）：仅 safety=safe 才产生新任务；否则如实升级、零自动重派。 */
export interface RedispatchTaskResult {
  ok: boolean;
  taskId?: string;
  retryOf?: string;
  safety: RedispatchSafetyDecision["safety"];
  autoAllowed: boolean;
  reasons: string[];
  message: string;
  /** B-07：目标是否已 fresh 会话（重建或首次自动新开）。 */
  sessionFresh?: boolean;
  /** 连续 2 次仍卡死：是否已提交应用申请/决策卡（唯一推荐）。 */
  escalated?: boolean;
  requestId?: string;
  selected?: string;
}

/** 幕僚收口任务（accepted/rework/rejected；B-03 `task.closed`）。 */
export interface CloseTaskInput {
  projectRoot: string;
  taskId: string;
  outcome: "accepted" | "rework" | "rejected";
  note?: string;
}

export interface CloseTaskResult {
  ok: boolean;
  taskId: string;
  outcome?: "accepted" | "rework" | "rejected";
  message: string;
}

export interface SessionManagerDeps {
  /** 建会话（缺省为编排的 openRoleSession；注入以便单测）。入参形状镜像编排当前的公开输入
   *  （`customerInput`/`autoRepin`；`genesisFinalize`/`operatorChannel` 随 A-4 已删）。 */
  openRoleSession: (
    input: {
      roleId: string;
      project: ProjectConfig;
      runtime?: RuntimeKind;
      routineShellPolicy?: RoutineShellPolicy;
      taskId?: string;
      scope?: undefined;
      /** **客户确认制交互通道**（A-1/A-3）：仅内置治理角色（su）会话注入（见 SessionManager.open）。 */
      customerInput?: CustomerInputFn;
      /** **派发任务能力**（H-1）：仅内置治理角色（su）会话注入（见 SessionManager.open 与 routeDispatch）。 */
      dispatchTask?: DispatchTaskFn;
      /**
       * **view_image 投递能力**（2026-10-26）：工具读取的图片作为**下一轮用户提示的图片附件**排队给
       * 同一角色（全部角色会话注入；目标在开会话时定格）。实现经既有 `SessionManager.send`：角色忙
       * （工具在本轮内）⇒ 按到达序入队，settle 后投递；失败如实回执。编排原样转交运行时核心；
       * 未注入 ⇒ `view_image` 工具不注册（结构性 fail-closed）。
       */
      viewImage?: ViewImageFn;
      /**
       * **需求变更申请能力**（2026-10-26 request_requirement_change）：仅**统筹（schedule）/提案
       * （proposal）**会话注入（客户纠正：审批卡由这两个角色发起/持有）；项目角色、其它治理角色与
       * single/su 不注入（能力缺席 = 工具不注册 = 最强 fail-closed）。编排再按治理职能收口；本层只把
       * 项目根/发起角色/引擎补入后透传。**申请 ≠ 批准**：审批在 decision 卡，主理只在批准后执行意图变更。
       */
      requestRequirementChange?: RequestRequirementChangeFn;
      /** **role_status 数据源**（G-2/W1，仅 chief/su 注入；形状＝契约家 `RoleStatusFn`）。 */
      roleStatus?: RoleStatusFn;
      /** **contract_check 只读数据源**（3.2；所有角色注入）。 */
      contractCheck?: ContractCheckFn;
      /** **evidence_check 只读数据源**（3.4；所有角色注入）。 */
      evidenceCheck?: EvidenceCheckFn;
      /** **session_tail 数据源**（G-2/W1，仅 chief/su 注入；形状＝契约家 `SessionTailFn`）。 */
      sessionTail?: SessionTailFn;
      /** **技能安装能力**（G-4/I3，仅 su 注入；形状＝契约家 `InstallSkillFn`——检验/激活/回执、不写盘）。
       *  编排透传（`AdapterCapabilities` 同名字段）落地前被静默忽略（我方透传就位，等待其承接——登记）。 */
      installSkill?: InstallSkillFn;
      /** **技能卸载能力**（G-4/I3，仅 su 注入；形状＝契约家 `UninstallSkillFn`）。 */
      uninstallSkill?: UninstallSkillFn;
      /** **外来 MCP 安装能力**（G-4 V2，仅 su 注入；形状＝契约家 `InstallMcpFn`）。编排透传落地前被静默忽略。 */
      installMcp?: InstallMcpFn;
      /** **外来 MCP 卸载能力**（G-4 V2，仅 su 注入；形状＝契约家 `UninstallMcpFn`）。 */
      uninstallMcp?: UninstallMcpFn;
      /** **(a) 操作者确认通道（I-1 arm）**：**项目角色** ⇒ 编排装配 (c)/(b)/(a) 三层链；
       *  **全部内置治理角色（`role.builtIn === true`，含 trio 五人）** ⇒ 经下方 `shellOperatorOnly` 装配审批档
       *  （客户 2026-10-19 新规则：所有角色都有 shell 权限（含读写与任意命令），一律提交审批）。判据见 `open()`。 */
      shellOperatorChannel?: OperatorChannelFn;
      /** **(c) 规则集实件（I-1 补丁，2026-10-12）**：仅**项目角色**会话注入（同判据走三层链）。 */
      shellArming?: DesktopShellArming;
      /** **内置治理角色审批档（客户 2026-10-17 裁定，2026-10-19 新规则扩至全部内置治理角色）**：
       *  仅 `role.builtIn === true` 的会话注入——(c) 只读白名单免审批，`risky`/`review`/`deny` 一律交客户/
       *  判断 agent 逐条批准（deny 也可批准）；**不接 (b)**（不自审）。shell 可读写、可执行任意命令，审批链是
       *  唯一控制（命令副作用不受文件写门禁约束）。
       *  形状＝编排 `AssembleOperatorShellGateOptions`（`Omit<…, "project">`，只读导入、不另立第二形状）。
       *  缺省/缺件 ⇒ 不传 ⇒ 不 arm（能力缺席 = fail-closed，绝不放宽）。 */
      shellOperatorOnly?: Omit<AssembleOperatorShellGateOptions, "project">;
      /** **旧只读档（客户裁定 2026-10-12）**：类型保留以兼容其他调用方/测试；**桌面自 2026-10-17 起不再注入**
       *  （全部内置治理角色改走审批档）。与 `shellOperatorOnly` 同时出现 ⇒ 编排不 arm（互斥守卫）。 */
      shellReadonly?: Omit<AssembleReadonlyShellGateOptions, "project">;
    },
    deps: { createAdapter: RuntimeAdapterFactory },
  ) => Promise<RoleSessionHandle>;
  createRuntimeAdapterFactory?: RuntimeAdapterFactoryBuilder;
  runtimeOptions?: RuntimeAdapterFactoryOptions;
  /**
   * **「替我审」每会话判断闭包工厂**（2026-10-17 PM 评审 §5.1/§十一）：缺省 ⇒ 不注入判断能力。
   * 主进程/Interface 注入真实 `createShellJudge`（经编排 Pipeline 公共出口），测试可注入桩件。
   * 会话用**与请求会话同一份** `runtimeOptions` 与 `createAdapter` 工厂构造；会话 dispose 即清。
   */
  createShellJudge?: (opts: {
    project: ProjectConfig;
    runtime: RuntimeKind;
    runtimeOptions?: RuntimeAdapterFactoryOptions;
    createAdapter: RuntimeAdapterFactory;
  }) => ShellJudgeFn;
  /**
   * **「替我决策」每会话判断闭包工厂**（2026-10-18 双开关评审 §8.2）：缺省 ⇒ 不注入判断能力。
   * 主进程/Interface 注入真实 `createGovernanceJudge`（经编排 Pipeline 公共出口），测试可注入桩件。
   * 只在 trio 且客户交互通道已注入的会话构造；用**与请求会话同一份** `runtimeOptions`/`createAdapter`，
   * 会话 dispose 即清（与 `shellJudge` 一并）。
   */
  createGovernanceJudge?: (opts: {
    project: ProjectConfig;
    runtime: RuntimeKind;
    runtimeOptions?: RuntimeAdapterFactoryOptions;
    createAdapter: RuntimeAdapterFactory;
  }) => GovernanceJudgeFn;
  prepareRuntimeProfile?: (runtime: RuntimeKind) => Promise<void>;
  createPiAdapterFactory: (
    project: ProjectConfig,
    shellGate?: ShellGate,
  ) => (gate: WriteGate) => RuntimeAdapter;
  createDemoAdapter: (opts: { gate: WriteGate; boundary: import("../../src/model/boundary.ts").BoundarySection1 }) => RuntimeAdapter;
  getListing: (projectRoot: string) => ProjectListing | undefined;
  /** 构造 ProjectConfig（真实实现 `buildProjectConfig`）。第 4 参为**项目治理边界路径**（取自 `.ans`；
   *  无则空串——见 `buildEffectiveProjectConfig`）。 */
  buildProjectConfig: (
    listing: ProjectListing,
    acceptance: Acceptance,
    env?: Record<string, string | undefined>,
    governanceBoundaryPath?: string,
  ) => ProjectConfig;
  /**
   * 载入有效配置（`.ans` 优先）。缺省为跨角色共享载入器 `loadEffectiveConfig`
   * （`src/common/shared/config-loader.ts`，pm 属主）——**只读导入、不复制**。注入以便单测。
   */
  loadEffectiveConfig?: (opts: LoadConfigOptions) => Promise<LoadedConfig>;
  /**
   * 会话事件外推（**带 roleId 信封**，B-2）：多会话并存时渲染侧按角色分发（不带标识会串消息）。
   * `event` 为编排导出的 `OrchestrationEvent`（= 既有 `SessionEvent` + 编排在 `settled` 时追加的
   * `handback` 回交事件，设计 §10.8）——**类型从编排导入，不在此另立一份**。
   */
  emitEvent: (envelope: SessionEventEnvelope) => void;
  emitPersistenceChange?: (update: PersistenceUpdated) => void;
  /**
   * **队列变化外推**（L-1 可见性）：某角色队列的**摘要快照**——主进程据此推渲染侧（该角色的队列行 +
   * 左树「N 待办」徽标）。**只在变化时**发；空数组＝清空显示。缺省 ⇒ 界面无队列行（不影响入队本身）。
   */
  emitRoleState?: (info: {
    roleId: string;
    projectRoot: string;
    runtime: RuntimeKind;
    profileRevision: number;
    contextSource?: OpenResult["contextSource"];
    contextWarning?: string;
    busy: boolean;
    summaries: string[];
    /** 结构化的排队条目（右栏「待办 / 队列」组用；来源/摘要/入队时间＋**撤回/展开定位键** `id`（= dedupKey）
     *  与入队即定格的全文 `full`——**与 summaries 同源**，不另造数据源；G-2 起 `kind` 含第四类 `system`）。 */
    queue: { kind: string; sourceRoleId: string; summary: string; at: string; id: string; full: string }[];
    /** **正在跑的那条投递**（若该轮由队列投递开跑且未结束）；null = 无（直接 send 的一轮不属于队列条目）。 */
    running: { kind: string; sourceRoleId: string; summary: string; at: string } | null;
  }) => void;
  /**
   * shell 命令级闸（设计 §7.2）——**已装配 gate** 的注入接缝（历史形状，保留）。
   *
   * I-1（2026-10-12，**客户已裁定 arm**）之后：桌面交给编排的是 **(a) 通道**（见下 `shellOperatorChannel`），
   * 由编排装配 (c)(b)(a) 后**自己把 gate 交给 pi 适配器工厂**；本字段保留给「调用方直接持有一个已装配
   * `ShellGate`」的场景（测试/将来装配形态）。**缺省 ⇒ 不传** ⇒ Pi 适配器不注册 `run_shell`（能力缺席 =
   * 最强 fail-closed，§7.5.1）。注：arm 只对 **pi 运行时**有效——demo 路径无 shell 入口。
   */
  shellGate?: ShellGate;
  /**
   * **(a) 操作者确认通道**（I-1，2026-10-12；客户裁定「现在开放 shell…如果 su 觉得危险可以让客户决定」；
   * 客户新规则 2026-10-19：所有角色都有 shell 权限（含读写与任意命令），一律提交审批）——
   * 桌面把既有「看命令原文 + 放行/拒绝」对话框（`createDesktopOperatorChannel`；拒绝为默认与取消项）交给
   * **编排**：**项目角色** ⇒ (c)/(b)/(a) 三层 `ShellGate`（`buildShellGate` 的 `operatorChannel` 即本通道）；
   * **全部内置治理角色** ⇒ 本通道作为 `shellOperatorOnly.operatorChannel` 装配**审批档**（见下）。
   * 判据 `role.builtIn`，见 `open()`。
   */
  shellOperatorChannel?: DesktopOperatorChannelFn;
  /**
   * **(c) 规则集实件（I-1 补丁，2026-10-12 客户重发授权）**——与 `shellOperatorChannel` **同一接线面**
   * 透传：编排 `openRoleSession({ shellArming })` 用它装配 (c) 层（`classifyShell` + `rules`；缺省 ⇒ 编排
   * 对「规则集未注入」一律拒绝）。**只对项目角色**传三层链字段（内置治理角色不接 (b)/(a) 三层链）。
   * 主进程用 `operator-channel.ts::buildDesktopShellArming()` 构造，**两件同备才 arm**（加载失败 ⇒ 连 (a)
   * 也不注入）。
   *
   * **同一份实件也供全部内置治理角色审批档**（客户 2026-10-17 裁定、2026-10-19 新规则扩展）：`open()` 对
   * `role.builtIn === true` 的会话经 `shellOperatorOnly` **复用本对象**交给编排装配审批档——单一来源、与
   * 项目角色永不漂移；缺省 ⇒ 内置治理角色也不 arm（能力缺席 = fail-closed）。
   */
  shellArming?: DesktopShellArming;
  /**
   * **客户交互通道**（A-1/A-3/A-5）——`request_confirmation` / `request_choice` 的呈现与裁决回传。
   * **缺省 ⇒ 不注入** ⇒ 编排侧该会话进入确认制所需的前提不存在（两工具不注册、gate 旧语义）——
   * 且本层未接通道时**绝不悄悄放行**（通道缺席即 fail-closed）。**仅内置治理角色（su）会话注入**。
   *
   * 桌面由主进程用 `app/desktop/customer-input.ts::createCustomerInputChannel`（presenter 把请求推为
   * 聊天流里的交互卡 + per-window pending Map 校验回包）构造后注入。**通道本身不含任何判定**
   * （发行 writeSet 在编排 `confirmed-writes.ts`；写不写在 gate/工具）。
   */
  customerInput?: DesktopCustomerInputFn;
  /**
   * **需求变更申请能力**（2026-10-26 `request_requirement_change`）：绑定项目的应用侧实现（`projectRoot`、
   * 发起角色 `requesterRoleId` 与会话引擎 `runtime` 由本层按会话补入；工具载荷只带
   * flowId?/intentId?/changeKind/summary/rationale/impact?/proposedIntentPatch?）。
   * 校验、同 flow 去重、票据、发起方会话审批卡通道、主理执行任务与系统行全在实现内。
   * **仅统筹/提案（`governanceFunction ∈ {schedule, proposal}`）会话注入**——项目角色与其他治理角色不注入；
   * 编排再按治理职能收口。缺省 ⇒ 不注入 ⇒ 工具不注册（结构性 fail-closed）。
   * **申请 ≠ 批准**：主理不审批、只在批准后执行意图变更。
   */
  requestRequirementChange?: (
    projectRoot: string,
    requesterRoleId: string,
    runtime: RuntimeKind,
    input: RequestRequirementChangeInput,
  ) => Promise<RequestRequirementChangeResult>;
  /**
   * **实时重枚举并刷新共享角色缓存（2026-10-13 首轮寻址修复）**：`routeDispatch` 缓存 miss 时调用一次——
   * 实现应为「与界面 `listProject` **同一路径**读盘枚举 + 更新**同一份**共享缓存」（Interface 层给出）。
   * 缺省 ⇒ miss 时按原口径如实拒绝（不重枚举；测试替身可省）。
   */
  refreshListing?: (projectRoot: string) => Promise<void>;
  /**
   * **看护观察转发（G-2/W1）**：事件消费循环里的结构化事实（settled 终局 / 命令超时限 F-1 事实 / 真实活动）
   * 同步转发给看护器（`watchdog.ts` 的 `observe`）。**缺省 ⇒ 无看护**（核心治理零依赖——一切照旧）。
   * 本层绝不因看护回调抛错而影响会话/投递（调用点自带隔离）。
   */
  watchdogObserver?: (projectRoot: string, observation: WatchdogObservation) => void;
  /**
   * **挂起确认数快照（G-2/W1）**：两确认通道（su 交互卡 / shell 卡）＋恢复卡的按角色挂起视图（主进程合并
   * 注入；静默谓词与「正确等待不报」排除用）。**缺省 ⇒ 恒 0**（测试替身可省）。
   */
  watchdogPendingConfirmations?: () => { total: number; byRole: Map<string, number> };
  /** **看护只读统计**（G-2/W1；role_status 的「看护」行数据面——`watchdog.ts` 的 `stats`）。缺省 ⇒ 该行
   *  如实记「未接线」。 */
  watchdogStats?: (projectRoot: string) => import("./watchdog.ts").WatchdogStats | undefined;
  /**
   * **投递队列持久化文件路径**（2026-10-20 客户要求：应用重启后任务自动续跑，不是只给 Lead 提示）。
   * 由 Interface 提供（`<userData>/ans/delivery-queue.json`）——**绝不写项目文件、不写 `.env`**。
   * 缺省 ⇒ 不持久化（旧行为零变化）。enqueue/claim/delivery.end/drain 时原子写（tmp+rename，失败只诊断）；
   * 启动/项目导入时用 `restorePersistedDeliveries()` 重新入队并按既有 drain 路径自动重投。
   */
  deliveryQueueStorePath?: string;
  /** **时钟（G-2；注入以便单测）**；缺省 `Date.now`。 */
  now?: () => number;
}

// —————————————— G-2/W5：恢复提议（`propose_recovery`）的载荷与回执 ——————————————
//
// **形状单一来源＝契约家 `src/model/runtime.ts`**（`ProposeRecoveryPayload` / `RecoveryReceipt` /
// `ProposeRecoveryFn` / `RoleStatusFn` / `SessionTailFn`；编排 `common/编排/watchdog.ts` 同名转发——
// 本文件从彼处只读导入，**不自立第二份形状**）。模型输入一律不可信：本层对载荷**全量重校验**。

/** `rebuild-session` 恢复动作的结果（W4 公共入口）。 */
export interface RebuildSessionResult {
  ok: boolean;
  error?: string;
  resumed?: boolean;
  contextSource?: OpenResult["contextSource"];
  contextWarning?: string;
}

/** `redeliver` 恢复动作的结果（W4 队列重试 nudge）。 */
export interface RedeliverResult {
  ok: boolean;
  message: string;
}

/** 一个**保活**中的角色会话（B-2：每角色一个句柄 + LRU）。 */
interface DeliveryOrigin {
  inputAccepted?: true;
  outcome?: RuntimeTurnOutcome;
  clientMessageId?: string;
  turnId?: string;
  settled: boolean;
  /** 本轮由哪类投递开跑（settle 后「收尾推进」据此只认回交轮）。 */
  kind?: DeliveryItem["kind"];
  /** 本轮关联的治理流程 id（dispatch/handback 条目携带；去重；多流程批次按集合处理）。 */
  flowIds?: string[];
  /** 回交轮携带的证据路径（≤10，供验收汇总任务引用）。 */
  handbackEvidence?: string[];
}

interface LiveSession {
  unsubscribePersistence?: () => void;
  readonly origins: { byTurn: Map<string, DeliveryOrigin>; running?: DeliveryOrigin };
  readonly roleId: string;
  readonly runtime: RuntimeKind;
  readonly profileRevision: number;
  readonly interactionState: { lifetime: AbortController; turn: AbortController };
  readonly handle: RoleSessionHandle;
  /** 建会话时的项目根——换项目重开同一角色前须先释放旧句柄（角色 id 可能跨项目同名）。 */
  readonly projectRoot: string;
  readonly config: EffectiveConfigInfo;
  /** LRU 使用序号（越大越近；open/续接时刷新）。 */
  lastUsed: number;
  /**
   * **本会话是否确认制**（内置治理角色 su + 客户交互通道已接线注入——见 `openInternal` 的判据）：
   * 只有确认制会话的 gate 收窄到「客户确认才发行的 writeSet」，重建才会**清零已发行写权**。
   * F-5-opt1（2026-10-16 客户批准）据此决定重建后是否向模型排「写权不自动保留」注记。
   */
  confirmGated: boolean;
  /** **是否有轮次在跑**（E-1/H-1 排队判据）：send 成功置真、收到该角色的 `settled` 事件置假。 */
  busy: boolean;
  /**
   * **本轮起始时刻**（ms epoch；G-2/W1）：busy 置真时同步定格——看护信号 #1「轮次逼近超时」的 elapsed 基准
   * （90% × 生效时限；求值与运行时核心 `resolveRuntimeTimeouts` 单一来源同源，见 watchdog.ts）。
   * 读取方一律以 `busy === true` 为先决条件（置假路径不强制清零——防漏改不引入误报）。
   */
  busySince?: number;
  /**
   * **上一轮是否被「请求中止」**（2026-10-20 链式治理推进的早失败护栏）：`abort()`（客户停止 / 看护
   * 自动中止）置真，下一轮开始置空。链式推进在「会话仍活着、不在跑、无排队投递」时允许短宽限后如实失败；
   * 但被中止的回合**不算正常结束**——继续有界轮询等下一次投递/重试（真机：看护中止后由后续投递写出 YAML）。
   */
  lastTurnAborted?: boolean;
  /**
   * **O-1（2026-10-12）：本会话持有的边界快照**——开会话时定格的参与文件（绝对路径）与各自**内容哈希**。
   * 任一处变了 ⇒ 本会话的规则集已陈旧（真机：su 改好 boundary.yaml 后，活会话仍按开会话时解析的旧边界
   * 拒写）——`boundaryDiff` 检出后**作废重建**。信号只来自读盘哈希（**不得**靠界面推测）。
   */
  boundaryPaths: string[];
  boundaryPrints: Record<string, string>;
  /**
   * **G-4 裁定⑤（2026-10-16 客户批准）**：本会话定格的「该角色已安装技能」参与文件集
   * （`docs/skills/<name>/` 的 `SKILL.md`＋`install.md` **绝对路径**；开会话/重建当刻按登记推导一次，
   * 检查时由 `boundaryDiff` 以**同一推导**重算当前集合、比对集合差——新增/移除/内容编辑 ⇒ 陈旧）。
   * **零技能＝空数组**（既有指纹语义逐字不变）。
   */
  skillPaths: string[];
  /**
   * **当前轮投递给该角色的文本**（PM 评审 §8.1：≤4KB，内存内；判断 agent 的 `turnText` 输入）。
   * 每次真实投递（直发/出队/派发/回交）写入；**不展示、不入审计**；会话销毁即清。
   */
  lastUserText?: string;
  /**
   * **W6-B 真机阻塞修复**：等待「本会话下一轮 settle」的解析器（`waitForRoleSettle` 登记）。
   * settled 到达或会话被 dispose 时逐个结算（true/false）并清空；不跨轮残留。
   */
  settleWaiters?: Set<(settled: boolean) => void>;
  /** **每会话判断闭包**（编排 `createShellJudge`；同一份 `runtimeOptions`/`createAdapter` 工厂）。
   *  会话 dispose 即清（PM 评审 §十一）。 */
  shellJudge?: ShellJudgeFn;
  /**
   * **「替我审批/决策」每会话判断闭包**（编排 `createGovernanceJudge`，2026-10-18 双开关评审 §8.2）：
   * 只在 trio + 客户交互通道已接的会话构造；与 `shellJudge` 同一份 `runtimeOptions`/`createAdapter`。
   * 会话 dispose 即清；缺失 ⇒ 通道按「判断能力缺席」回落原卡（fail-closed，绝不代批）。
   */
  governanceJudge?: GovernanceJudgeFn;
  /**
   * **需求变更审批卡通道**（2026-10-26 客户纠正）：仅**统筹（schedule）/提案（proposal）**会话构造，
   * 绑定本会话的客户卡上下文（roleId/signal/治理模型/判断闭包）与 `onPresented`。应用能力
   * `request_requirement_change` 经它呈现 `cardKind="decision"` 审批卡；decision 卡角色/结构仍由共享
   * `validateDecisionCardRequest` 单一来源校验（统筹/提案在其白名单内），发起方不能作答（作答只来自
   * 客户/独立判断 agent）。
   */
  requirementChangeCard?: (
    request: CustomerInputRequest,
    metadata?: CustomerInputMetadata,
    onPresented?: () => void,
  ) => Promise<CustomerInputOutcome> | CustomerInputOutcome;
}

/** 一次**系统投递**（E-1 回交投 su / H-1 派发投目标角色 / L-1 客户消息）——投递机的队列条目（**一套机，多调用方**）。 */
interface DeliveryItem {
  report?: RuntimeReportSnapshotV1;
  liveReport?: RuntimeLiveReportViewV1;
  liveDurability?: 'memory-only' | 'unknown-live';
  deliveryId?: string;
  safeText?: string;
  attemptId?: string;
  clientMessageId?: string;
  runtime: RuntimeKind;
  /**
   * 投递类别：`handback` 回交 / `dispatch` 派发 / `message` 客户消息 / **`system` 系统消息**
   * （G-2/W2，2026-10-16 客户批准——看护告警、收束提示与恢复回执，经**同一套投递机**真投递给 su；
   * **不可撤回**（归入治理流只读面）、去重键由看护自持命名空间（`watchdog\0…`）与 handback/dispatch 键隔离；
   * 来源标注恒空（呈现面按文首 `[系统·<子类>] ` 定格标记归类——桌面UI tool-rows.js 已在树））。
   */
  kind: "handback" | "dispatch" | "message" | "system";
  /** 目标角色 id（回交→su；派发/客户消息→被派角色）。 */
  targetRoleId: string;
  /** 治理流程 id（2026-10-18 收尾推进）：dispatch/handback 条目携带；客户消息/系统消息缺席。 */
  flowId?: string;
  /** B 批：星形任务 id（dispatch/handback 条目携带；旧 flow/客户消息缺席）。 */
  taskId?: string;
  /** 发起者（回交=产出角色；派发=派发者 su；客户消息=本端的当前角色）。 */
  sourceRoleId: string;
  /** 投递输入正文（**入队时定格**；重试用同一份，不重渲染）。 */
  text: string;
  /** 队列行用的一句摘要（L-1 可见性；**绝不**当作已执行呈现）。 */
  summary: string;
  /** 去重键（回交=`handbackKey`；派发=内容键，见 `routeDispatch` 的写明；客户消息=每次一条，独立键）。 */
  dedupKey: string;
  /** 入队时间（ISO；入队即定格——右栏「待办 / 队列」组显示用；**绝不**当作执行时间）。 */
  enqueuedAt: string;
  /**
   * **P0-1（2026-10-13 客户批准）**：随条目**入队即定格**的整包载荷（`PromptOptions`，契约单一来源
   * `src/model/runtime.ts`；投递时组合编排来源与 ACK 回调，images 数组保持原引用。
   * 缺省（undefined）= 无图片；纯文本也明确传本轮 handback.required。
   */
  opts?: PromptOptions;
  handback?: TaskHandback;
  batchItems?: readonly DeliveryItem[];
}

/**
 * **持久化投递队列的磁盘形状**（2026-10-20 客户要求：重启后任务自动续跑）。
 * 只存 **JSON 安全字段**：`opts`（含图片/回调）、活动 `batchItems`、attempt 标识不落盘——恢复时按原文本
 * 重新投递（任务文本自足，允许模型续做/重做）。`state:"in-flight"` 表示崩溃/退出时正在投递的条目，
 * 重启后按 queued 重投一次。
 */
export interface PersistedDeliveryItemV1 {
  key: { projectRoot: string; roleId: string; runtime: RuntimeKind };
  item: {
    kind: DeliveryItem["kind"];
    runtime: RuntimeKind;
    targetRoleId: string;
    sourceRoleId: string;
    text: string;
    summary: string;
    dedupKey: string;
    enqueuedAt: string;
    flowId?: string;
    /** B 批：星形任务 id（重启续投保持同一任务关联）。 */
    taskId?: string;
    deliveryId?: string;
    /** 应用任务的稳定身份（2026-10-25）：跨重启恢复后与新的同任务调用相认（「已投递」标记本身只在内存）。 */
    clientMessageId?: string;
    handback?: TaskHandback;
    report?: RuntimeReportSnapshotV1;
    liveReport?: RuntimeLiveReportViewV1;
    liveDurability?: "memory-only" | "unknown-live";
  };
  state: "queued" | "in-flight";
  enqueuedAt: string;
}

/** `restorePersistedDeliveries()` 的如实报告（Interface 据此落 Lead 系统行「已恢复 N 条并重投」）。 */
export interface DeliveryQueueRestoreReport {
  restored: number;
  skipped: number;
  items: {
    projectRoot: string;
    roleId: string;
    runtime: RuntimeKind;
    kind: DeliveryItem["kind"];
    summary: string;
  }[];
}

/** 队列摘要用的一句短句（L-1 可见性；仅呈现，不参与任何判定）。 */
function shortenText(s: string, n: number): string {
  const flat = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

/**
 * **应用任务稳定身份前缀**（2026-10-25 真机重复投递修复：「role-readiness 派发任务」在重建前后
 * 出现两条 user 消息、账本却只有一条 `dispatch.accepted`）。
 *
 * 应用派发的任务（派发/验收/协调/意图交接等）没有调用方自带的稳定 id；`sendBackground` 每次入队都用
 * 随机键时，同一任务的两次应用侧调用（两条链路/一次重试）会被当成两条独立消息重复投递。本层为这类
 * 任务生成**内容稳定键**（项目+目标角色+引擎+正文 sha256，或派发的既有内容 `dedupKey` sha256）：
 *  · 同任务同键——重建后续投、应用侧重复调用、重启后恢复的队列项都能认出来，**至多投递一次**；
 *  · 真实客户消息不生成该键（渲染侧 UUID 或缺失）——「同文重复发送是两个意图」的语义逐字不变；
 *  · 显式**重新入队**（`enqueueDelivery`，如返工后同文再派）会清除「已投递」标记——返工回路仍可用。
 *
 * 前缀只用于本层身份判别（不构成权限/授权语义）；渲染侧传来的任意 `clientMessageId` 不会命中该前缀
 * （随机 UUID），因此不会被误当成应用任务。
 */
const APP_TASK_CLIENT_MESSAGE_ID_PREFIX = "ans-app-task:";
/** 「已投递」应用任务标记的内存上界（FIFO 淘汰；防长跑进程无界增长）。 */
const MAX_DELIVERED_APP_TASK_IDS = 1024;

function isAppTaskClientMessageId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(APP_TASK_CLIENT_MESSAGE_ID_PREFIX) && value.length > APP_TASK_CLIENT_MESSAGE_ID_PREFIX.length;
}

/** 「替我审」`turnText` 上界（PM 评审 §8.1：≤4KB；超出截断，不据此 manual）。 */
const TURN_TEXT_MAX_BYTES = 4096;

/** 把投递文本收敛到 ≤4KB（UTF-8）；不切断多字节字符。 */
function boundTurnText(text: string): string {
  const raw = typeof text === "string" ? text : "";
  const buf = Buffer.from(raw, "utf8");
  if (buf.length <= TURN_TEXT_MAX_BYTES) return raw;
  let end = TURN_TEXT_MAX_BYTES;
  // 退到 UTF-8 字符边界（continuation byte 为 10xxxxxx）。
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
  return buf.subarray(0, end).toString("utf8");
}

/**
 * **有界等待（意图交接投递用）**：超时返回 `{timedOut:true}`；底层 promise 继续（不取消、不伪造结果）。
 * 与既有应用侧时限模式同口径——只保证回执必然返回。
 */
function withStageDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), Math.max(1, timeoutMs));
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([promise.then((value) => ({ timedOut: false as const, value })), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** O-1：单个文件的**内容指纹**（sha256）。
 *  **Q-1（2026-10-12）**：热路径加 **mtime+size 缓存**——未变文件只 `stat`、不重读重哈希（防读盘风暴）；
 *  文件变了（mtime/size 任一不同）才重读重哈希。不存在/读失败记 `<missing>`（清缓存——下次出现要拿到真值）。 */
const filePrintCache = new Map<string, { mtimeMs: number; size: number; print: string }>();
async function filePrint(absPath: string): Promise<string> {
  try {
    const st = await fs.promises.stat(absPath);
    const hit = filePrintCache.get(absPath);
    if (hit !== undefined && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.print;
    const print = createHash("sha256").update(await fs.promises.readFile(absPath)).digest("hex");
    filePrintCache.set(absPath, { mtimeMs: st.mtimeMs, size: st.size, print });
    return print;
  } catch {
    filePrintCache.delete(absPath);
    // `<missing>` 哨兵：G-1 必读引用同用本函数探测——非 sha256 值（含本哨兵）在 `planDispatchDelivery`
    // 判据内天然按「文件不存在」处理（fail-closed；投递侧无需再映射）。
    return "<missing>";
  }
}

/**
 * **`[系统·安装]`：能力安装/卸载完成后的定格系统行文首**（PM 冻结符号，G-4 2026-10-16）——**技能（I3）
 * 与外来 MCP（V2）两类安装动作共用同一子类**。形态契约＝「`[系统·<子类>]` ＋一个 ASCII 空格」，与
 * 桌面UI `tool-rows.js::SYSTEM_HEAD`（`[系统·` 开头、子类闭合于 `]`、≤12 字、后随空白或文末）的归类
 * 判据对齐（改形态 = 系统类静默回落普通气泡——单点在彼处注释）。该行为 `kind:"system"` 第四类投递正文
 * （G-2/W2 同一套投递机真投递给 su；不可撤回——「不可撤回面同 system kind」）。
 */
export const CAPABILITY_INSTALL_SYSTEM_PREFIX = "[系统·安装]";

/** 非 assistant 正文的 `detail.source`（系统行/投递状态/推理/工具展示/长度提示——不记入反馈镜像）。 */
const NON_ASSISTANT_DETAIL_SOURCES: ReadonlySet<string> = new Set([
  "delivery-note",
  "prompt-input",
  "delivery-receipt",
  "delivery-boundary",
  "reasoning",
  "reasoning-diagnostic",
  "tool-display-diagnostic",
  "server-tools",
  "length-followup",
  "length-degrade",
  "system",
]);

/**
 * assistant 正文判定（2026-10-18 live 修正）：`message` 且 summary 非空；`detail` 缺省或**不是**
 * 系统行/工具事件（带 `display` 的普通 assistant 文本照记）。工具事件按 `toolCallId`/`toolName`/`call`
 * 键排除；detail 结构无法确认（非对象）时不记（fail-closed，避免把系统行当正文）。
 */
function isAssistantTextEvent(ev: OrchestrationEvent): ev is Exclude<OrchestrationEvent, HandbackEvent> {
  if (ev.kind !== "message") return false;
  if (typeof ev.summary !== "string" || ev.summary.trim() === "") return false;
  const detail = ev.detail;
  if (detail === undefined) return true;
  if (typeof detail !== "object" || detail === null) return false;
  const record = detail as Record<string, unknown>;
  if (typeof record.source === "string" && NON_ASSISTANT_DETAIL_SOURCES.has(record.source)) return false;
  if ("toolCallId" in record || "toolName" in record || "call" in record) return false;
  return true;
}

/**
 * 会话管理器（B-2：**每角色一个保活句柄** + 上限 LRU）：点角色即开、多轮直发；
 * **切走不 dispose、切回直接续**；超出 `MAX_LIVE_SESSIONS` 时淘汰最久未用者。
 */
export class SessionManager {
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
  /** 2026-10-29（方案 v2.1 §5.4/M9）：任务创建者内存索引（`task.created.from`）——报告按创建者路由。 */
  private readonly taskCreators = new Map<string, "chief" | "convener">();
  /** B 批：已写入 `task.reported` 的键（`taskId\0turnId|摘要`；防同轮重复事件）。 */
  private readonly reportedTaskKeys = new Set<string>();
  /** B-07：连续卡死升级卡（按链根去重；同一链只提交一次）。 */
  private readonly escalationRequests = new Map<string, Promise<{ escalated: boolean; requestId?: string; selected?: string; message: string }>>();
  /** C 批：系统通知去重（`requestId\0event`）。 */
  private readonly requestNotifiedKeys = new Set<string>();
  /** C 批：已呈现过的申请（`requestId\0customer|judge`）。 */
  private readonly requestPresentedKeys = new Set<string>();
  /** B 批：每角色最近运行日志的内存摘要（看护巡检/日志静默用；真实日志在 `.ans/state/logs/`）。 */
  private readonly lastRoleActivity = new Map<string, { at: number; kind: string; summary: string }>();
  private readonly reportStates = new Map<string, { owner?: LiveSession; event?: HandbackEvent; state?: ReportSaveStateV1; queued: boolean }>();
  private readonly attemptStates = new Map<string, { owner?: LiveSession; receipt: RuntimeDeliveryReceiptV1 }>();
  private readonly knownReports = new Set<string>();
  private readonly knownAttempts = new Set<string>();
  private readonly persistenceInFlight = new Map<string, Promise<unknown>>();
  /** 回交去重键（`handbackKey` 单一来源；`projectRoot\0<key>`）——**一条回交只投递一次**（永不放行重投）。 */
  private readonly enqueuedHandbackKeys = new Set<string>();
  /**
   * 派发去重键——**队列期窗口去重**（投递成功即释放，见 `drainQueue`；返工可再派发同文任务）。
   * 契约的 `DispatchTaskPayload` 无 id/时间（钉死不扩），桌面无法区分「重试同一调用」与「新的一次相同文本
   * 派发」；在途窗口去重防重投，送达后放行以保返工回路可用——语义在 change 文档写明。
   */
  private readonly activeDispatchKeys = new Set<string>();
  /** 「队列受阻」（枚举不到目标）只如实提示**一次**（避免每次触发刷同一行）。 */
  private readonly suDeliveryBlockedNoted = new Set<string>();
  /**
   * **各角色最近一轮的终局**（G-2/W1「lastTurn 小状态」）：settled 时在事件消费循环里顺带落表
   * （outcome + 时刻；只记四值终局——旧来源缺事实不猜）。看护 `role_status` 的「最近一轮」行与未来
   * 其他只读消费方取用；不参与任何判定。
   */
  private readonly lastTurns = new Map<string, { outcome: RuntimeTurnOutcome; at: string }>();
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
  private deliveryPersistChain: Promise<void> = Promise.resolve();
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

  constructor(deps: SessionManagerDeps) {
    this.deps = deps;
    this.loadEffectiveConfig = deps.loadEffectiveConfig ?? defaultLoadEffectiveConfig;
    this.deliveryQueueStorePath = deps.deliveryQueueStorePath;
  }

  // —————————————— G-2（W1）：看护的观察/活动转发与时钟 ——————————————

  /** 时钟（注入以便单测；缺省 Date.now——与会话时间戳、投递入队时间同源）。 */
  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
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

  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string {
    return `${projectRoot}\u0000${roleId}\u0000${runtime}`;
  }
  private targetKey(target: string | SessionTarget): string | undefined {
    if (typeof target !== "string" && target.projectRoot && target.runtime) return this.sessionKey(target.projectRoot, target.roleId, target.runtime);
    let roleId = target;
    if (typeof target !== "string") roleId = target.roleId;
    const active = this.activeEntry();
    if (active?.roleId === roleId && this.activeRoleId !== null) return this.activeRoleId;
    const matches = [...new Set([...this.sessions.keys(), ...this.rebuildChains.keys()])].filter((key) => key.split("\u0000")[1] === roleId);
    if (matches.length === 1) return matches[0];
    return undefined;
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
  private contextInfo(handle: RoleSessionHandle): Pick<OpenResult, "contextSource" | "contextWarning"> {
    if (handle.contextSource === "resumed") return { contextSource: "recovered", contextWarning: handle.contextWarning };
    if (handle.contextSource === "recovered") return { contextSource: "fresh", contextWarning: handle.contextWarning ?? mainT("main.session.contextRecoveryFailed") };
    return { contextSource: "fresh", contextWarning: handle.contextWarning };
  }

  private beginDeliveryOrigin(entry: LiveSession, clientMessageId?: string): DeliveryOrigin {
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

  private async sendDelivery(entry: LiveSession, origin: DeliveryOrigin, text: string, opts?: PromptOptions, requiresHandback = false, handbackTaskId?: string): Promise<void> {
    // **「替我审」上下文**（PM 评审 §8.1）：当前轮投递给该角色的文本 ≤4KB，内存内（会话 dispose 即清）；
    // 超限截断但**不据此 manual**；不读转录/历史回放。写入点即真实投递（直发/出队/派发/回交同一路径）。
    entry.lastUserText = boundTurnText(text);
    // Every invocation declares its own source; chat also overrides any legacy session taskId.
    let promptOptions: RoleSessionSendOptions = {
      ...opts,
      handback: {
        required: requiresHandback,
        ...(handbackTaskId !== undefined && handbackTaskId !== "" ? { taskId: handbackTaskId } : {}),
      },
    };
    if (entry.handle.runtime !== undefined || origin.clientMessageId !== undefined || opts?.onTurnStarted !== undefined) {
      const onTurnStarted = (metadata: PromptTurnStartedMetadata): void => {
        const key = this.sessionKey(entry.projectRoot, entry.roleId, entry.runtime);
        if (this.sessions.get(key) !== entry || (origin.settled && origin.turnId === undefined)) return;
        if (metadata.runtime !== entry.runtime || metadata.roleId !== entry.roleId || typeof metadata.turnId !== "string" || metadata.turnId === "") return;
        if (origin.turnId === undefined) {
          origin.turnId = metadata.turnId;
          entry.origins.byTurn.set(metadata.turnId, origin);
          // **ACK 即已投递**（2026-10-25）：应用任务的稳定键在运行时同步开轮回执时即记「已投递」——
          // 之后即便发送 promise 因重建/收尾阶段报错，同一任务也不会被重投（at-most-once）。
          this.rememberAppTaskDelivered(origin.clientMessageId);
        }
        opts?.onTurnStarted?.(metadata);
      };
      promptOptions = { ...promptOptions, onTurnStarted };
    }
    await entry.handle.send(text, promptOptions);
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
  private async disposeEntry(roleId: string, entry: LiveSession): Promise<string | null> {
    if (this.sessions.get(roleId) !== entry) return null; // TOCTOU 防误删（见方法注释）
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
    try {
      await entry.handle.dispose();
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

  /** 该会话的边界快照**哪一处**变了（返回变化的相对路径；未变 ⇒ null）。
   *  **G-4 裁定⑤（2026-10-16 客户批准）**：第二段＝「该角色已安装技能」集合的**当刻重推导**比对——
   *  ① 冻结路径逐字节（含技能文件的内容编辑）；② 集合差（新增：新技能落盘/登记改列本角色 ⇒ 冻结集里
   *  没有的路径出现；移除：冻结集里的路径从当刻集合消失）。任一差异返回该相对路径。
   *  `currentSkillPaths` 返回 `null`（读目录防御失败）⇒ 跳过本轮集合比对（坏件跳过——绝不误重建）；
   *  零技能两侧皆空 ⇒ 无差（既有语义逐字不变）。 */
  private async boundaryDiff(entry: LiveSession): Promise<string | null> {
    for (const f of entry.boundaryPaths) {
      const rel = path.relative(entry.projectRoot, f);
      if (entry.boundaryPrints[rel] !== (await filePrint(f))) return rel;
    }
    const current = await this.currentSkillPaths(entry.projectRoot, entry.roleId);
    if (current !== null) {
      const frozen = new Set(entry.skillPaths);
      const currentSet = new Set(current);
      const first = [...currentSet].filter((f) => !frozen.has(f)).sort()[0]
        ?? [...frozen].filter((f) => !currentSet.has(f)).sort()[0];
      if (first !== undefined) return path.relative(entry.projectRoot, first);
    }
    return null;
  }

  /**
   * **G-4 裁定⑤**：**当刻重新推导**该角色「已安装技能」的参与文件集（`SKILL.md`＋`install.md` 的绝对
   * 路径）。判据与渲染器注入节**同集合**：
   * · 登记读取/解析**唯一来源**＝编排 `readSkillRegistration`（**不复制解析逻辑**）——返回 `undefined`
   *   （坏件/缺失/名非法）⇒ 跳过该条（与渲染器坏件跳过逐字同口径）；
   * · `status !== "installed"` 跳过（`uninstalled` ＝已停用）；`roles` 不含本角色跳过；
   * · `SKILL.md` 缺失**不**在此过滤：路径仍入集合（其指纹为 `<missing>`）——它后来出现即触发重建，
   *   与渲染器「补好文件 ⇒ 新会话注入」收敛一致。
   * 返回 `null`＝本轮**不可推导**（`docs/skills` 读目录失败且非 ENOENT——坏件跳过防御：绝不据此误判
   * 集合差）；`[]`＝零技能（含目录不存在＝项目从未装过技能）。
   */
  private async currentSkillPaths(projectRoot: string, roleId: string): Promise<string[] | null> {
    const skillsRoot = path.join(projectRoot, "docs", "skills");
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.promises.readdir(skillsRoot, { withFileTypes: true });
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === "ENOENT" ? [] : null;
    }
    const paths: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue; // docs/skills 下直接放的文件不是技能条目（渲染器同口径）
      const registration = readSkillRegistration(projectRoot, entry.name);
      if (registration === undefined || registration.status !== "installed" || !registration.roles.includes(roleId)) continue;
      paths.push(path.join(skillsRoot, entry.name, "SKILL.md"));
      paths.push(path.join(skillsRoot, entry.name, "install.md"));
    }
    paths.sort();
    return paths;
  }

  /** 陈旧 ⇒ 作废重建（dispose → 立即重开 + 如实记行）。返回 undefined = 未陈旧/在跑/已被并发替换（不打断）；
   *  否则返回 `{changed, reopened}`——调用方据此决定续发/续投，或按失败如实处理。
   *
   *  **按角色串行化（2026-10-13 状态机修复；同 drainChains 先例）**：同一角色的重建**至多一个在跑**——
   *  settle 触发的 `refreshStaleBoundaries` 与用户紧接的 `send`/`open` 都会查陈旧，两者**同时**判「陈旧」时：
   *  旧实现双双 dispose+重开，晚到者的 dispose 会误删对方刚建的新会话（可能已开跑轮次）并推 busy=false
   *  （真机「轮次还在跑、忙态翻假、停止钮消失 / 消息落空」的根因）。串行后第二个调用**等第一个重建完全
   *  收尾**再查——那时条目已是新会话（快照新鲜）⇒ 无陈旧 ⇒ no-op；发送/开启照常续在新会话上。
   *  **TOCTOU 重校验（纵深防御）**：每个 `await`（读盘 diff / 会话文件探测）之后再验**同一引用、仍未开跑**
   *  ——即便有人绕过串行链（防御层），也不会误删新条目/打断在跑轮次。 */
  private rebuildIfBoundaryStale(
    roleId: string,
    userInitiated: boolean,
    selectionVersion = this.selectionVersion,
  ): Promise<{ changed: string; reopened: OpenResult } | undefined> {
    const prev = this.rebuildChains.get(roleId) ?? Promise.resolve();
    const run = prev.then(() => this.rebuildIfBoundaryStaleUnsafe(roleId, userInitiated, selectionVersion));
    const tail = run.then(
      () => undefined,
      () => undefined
    );
    this.rebuildChains.set(roleId, tail);
    void tail.then(() => {
      if (this.rebuildChains.get(roleId) === tail) this.rebuildChains.delete(roleId); // 链尾清理（防泄漏）
    });
    return run;
  }

  private async rebuildIfBoundaryStaleUnsafe(
    roleId: string,
    userInitiated: boolean,
    selectionVersion: number,
  ): Promise<{ changed: string; reopened: OpenResult } | undefined> {
    const entry = this.sessions.get(roleId);
    if (!entry) return undefined;
    const wasActive = this.activeRoleId === roleId;
    if (entry.busy) return undefined; // 在跑的轮次不打断（settle 后放行/下次发言/下次投递再查）
    let changed = await this.boundaryDiff(entry);
    if (changed === null && entry.profileRevision !== this.profileRevision(entry.runtime)) changed = mainT("main.session.rebuildChangedRuntimeConfig");
    if (changed === null) return undefined;
    if (entry.profileRevision !== this.profileRevision("pi") && entry.runtime === "pi" && this.hasBusyRuntime("pi")) return undefined;
    if (this.sessions.get(roleId) !== entry || entry.busy) return undefined; // 读盘期间被替换/开跑（TOCTOU）
    const projectRoot = entry.projectRoot;
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId });
    diagnostic.record("session.rebuild.start");
    // dispose 保留 ANS 回放；模型上下文是否恢复只读新句柄实际返回。
    await this.disposeEntry(roleId, entry);
    // 如实记行（哪个文件变的直接点名）：G-4 裁定⑤ 起陈旧源还有「已安装技能」——文档面不同、措辞分开
    // （技能不是边界；既不夸大也不含糊），其余分支逐字沿用既有文案（测试已钉）。
    const isSkillChange = changed.split(path.sep).join("/").startsWith("docs/skills/");
    this.deps.emitEvent({
      roleId: entry.roleId, projectRoot, runtime: entry.runtime,
      event: {
        kind: "message",
        summary: isSkillChange
          ? mainT("main.session.rebuiltSkills", { changed })
          : mainT("main.session.rebuiltBoundary", { changed }),
      },
    });
    // 重建不自行选择角色。仅成功且用户意图未改变时恢复被 dispose 清空的活动目标。
    // **F-2-opt2 防死锁**：本重开是**持锁方（openInternal 的续接前查陈旧）所等待的那条链**内的续段——
    // 必须直调 `openInternalUnsafe`（不再入 openChains）并带 `internalReopen`（不再查陈旧/不再入 rebuild 链，
    // 防「链内等待自身尾」的自死锁）；此处旧条目已 dispose（或纯新建），不会再触发任何 reopen 预检。
    const reopened = await this.openInternalUnsafe({ projectRoot, roleId: entry.roleId, runtime: entry.runtime }, false, this.selectionVersion, true);
    if (reopened.ok) this.queueRebuildWritePermitsNotice(roleId); // 入参＝会话键（本函数参数即键）
    if (reopened.ok && (wasActive || userInitiated) && this.selectionVersion === selectionVersion) {
      const current = this.sessions.get(roleId);
      if (current && current.projectRoot === projectRoot) this.activeRoleId = roleId;
    }
    if (!reopened.ok) {
      diagnostic.error("session.rebuild.failed", new Error(reopened.error || "重开失败"));
      this.deps.emitEvent({
        roleId: entry.roleId, projectRoot, runtime: entry.runtime,
        event: { kind: "message", summary: mainT("main.session.rebuildFailed", { detail: reopened.error ?? mainT("shared.common.unknownReason") }) },
      });
    }
    diagnostic.record("session.rebuild.end", { ok: reopened.ok });
    return { changed, reopened };
  }

  /**
   * **F-5-opt1（桌面侧，2026-10-16 客户批准）**：确认制会话（su）重建 ⇒ 编排闭包内「客户确认才发行」的
   * **已发行写权集随之清零**（内存态、不随新句柄保留）——对**模型**如实可见（除既有 UI 重建行外）。
   * 经编排的 `queueModelNotice` 把注记排进**下一轮输入前缀**（送达一次即消费；不单独开轮、不改任何判定——
   * 接口与语义见 run-role.ts；文案用其**单一来源**常量，绝不在此各写一份）。**非确认制会话没有发行过任何
   * 写权**（gate 不收窄，连 request_confirmation 都未注册）⇒ 不排（绝不向模型说假话）。旧替身句柄不带该
   * 方法；如实降级，不假装已送达）。**陈旧重建（O-1）与人工重建（G-2/W4）共用本件**。
   * ⚠ 入参是 `sessions` 表的**会话键**（`sessionKey`）——不是裸 roleId（`rebuildChains` 同以键索引）。
   */
  private queueRebuildWritePermitsNotice(sessionKey: string): void {
    const rebuiltEntry = this.sessions.get(sessionKey);
    if (rebuiltEntry?.confirmGated) {
      try {
        rebuiltEntry.handle.queueModelNotice?.(REBUILT_SESSION_WRITE_PERMITS_NOTICE);
      } catch {
        // 注记只是诚实提示，不是判定链的一环：排入失败不打断重建收尾（重建本身已如实记行）。
      }
    }
  }

  /**
   * O-1：对所有**活会话**扫一遍边界快照（su 一轮结束时由 Interface 触发——「边界可能刚被 su 改过」的
   * 可信时机）。陈旧者作废重建（如实记行）；**在跑的轮次跳过**（下一时机再查）。逐会话 try/catch 隔离
   * （一个失败不影响其它；不上抛——本方法经 `void` fire-and-forget 调用）。返回重建的角色 id。
   */
  async refreshStaleBoundaries(): Promise<string[]> {
    const rebuiltIds: string[] = [];
    const refreshVersion = this.boundaryRefreshVersion;
    for (const roleId of [...this.sessions.keys()]) {
      if (this.boundaryRefreshVersion !== refreshVersion) break;
      try {
        const rebuilt = await this.rebuildIfBoundaryStale(roleId, false);
        if (rebuilt !== undefined) rebuiltIds.push(roleId.split("\u0000")[1]);
      } catch {
        // 逐会话隔离（读盘异常等）：跳过该角色，不打断事件流；下次时机再查。
      }
    }
    return rebuiltIds;
  }

  /**
   * 点角色 → 直接建立/续接会话（无确认框）。见上方类内注释：O-1 起，续接/开启前先查**边界快照**。
   */
  async open(req: SessionOpenRequest): Promise<OpenResult> {
    const selectionVersion = ++this.selectionVersion;
    const key = this.sessionKey(req.projectRoot, req.roleId, req.runtime);
    this.selectionTargetRoleId = key;
    await this.rebuildChains.get(key);
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot: req.projectRoot, roleId: req.roleId });
    diagnostic.record("session.open.start");
    const result = await this.openInternal(req, true, selectionVersion);
    diagnostic.record("session.open.end", { ok: result.ok });
    if (!result.ok) diagnostic.error("session.open.failed", new Error(result.error || "会话开启失败"));
    return result;
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
   * 本方法选择有客户卡通道的统筹/提案会话呈现；无 pinned run / 无会话 / 无通道 ⇒ fail-closed。
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
    const preferred = [this.handbackOwnerRoleId(input.projectRoot), "rapporteur"];
    let selectedEntry: LiveSession | undefined;
    for (const [key, entry] of this.sessions) {
      if (!key.startsWith(`${input.projectRoot} `)) continue;
      if (entry.projectRoot !== input.projectRoot) continue;
      if (entry.requirementChangeCard === undefined) continue;
      if (selectedEntry === undefined) selectedEntry = entry;
      if (preferred.includes(entry.roleId)) {
        selectedEntry = entry;
        if (entry.roleId === preferred[0]) break;
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
      const applied = await applyRunChange(input.projectRoot, active.manifest!, {
        decisionId: settled.decisionId ?? `decision-${requestId}`,
        requestId,
        mode,
        decidedBy: settled.operatorId !== undefined && settled.operatorId.startsWith("judge:") ? "judge" : "customer",
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
    return { ok: true, outcome, first };
  }

  /** 治理主人（回交/系统行落位；2026-10-19 验收自动派发用）：trio=Convener；single=主入口（su）；未枚举 ⇒ null。 */
  governanceOwnerRoleId(projectRoot: string): string | null {
    return this.handbackOwnerRoleId(projectRoot);
  }

  /** 派发主人最近一次开会话所用 runtime（验收检查后台开 Proof 会话时择路；无记录 ⇒ undefined）。 */
  governanceRuntimeFor(projectRoot: string): RuntimeKind | undefined {
    return this.lastGovernanceRuntime.get(projectRoot);
  }

  /**
   * **当前活动会话的 runtime**（客户正在看的那个；仅当它属于该项目）：自动验收派发/冷启动补齐的
   * 优先级 1 只读视图。无活动会话 / 活动会话属于别的项目 ⇒ undefined（调用方按解析器继续降级）。
   */
  activeRuntimeFor(projectRoot: string): RuntimeKind | undefined {
    if (typeof projectRoot !== "string" || projectRoot === "" || this.activeRoleId === null) return undefined;
    const entry = this.sessions.get(this.activeRoleId);
    return entry !== undefined && entry.projectRoot === projectRoot ? entry.runtime : undefined;
  }

  /**
   * 该 flow 是否仍有**在途**派发/回交/运行轮次（纯读；2026-10-19 验收自动派发用）。
   * 有 ⇒ 验收检查推迟到下一次事件，避免在交付完成前抢跑派 Proof；不制造第二份状态。
   */
  async refreshListingNow(projectRoot: string): Promise<boolean> {
    if (this.deps.refreshListing === undefined) return false;
    try {
      await this.deps.refreshListing(projectRoot);
      return true;
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot }).error("project.listing.refresh.failed", error);
      return false;
    }
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

  private async openInternal(req: SessionOpenRequest, userInitiated: boolean, selectionVersion = this.selectionVersion): Promise<OpenResult> {
    const key = this.sessionKey(req.projectRoot, req.roleId, req.runtime);
    const prev = this.openChains.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail: Promise<void> = prev.then(() => gate);
    this.openChains.set(key, tail);
    try {
      await prev;
      return await this.openInternalUnsafe(req, userInitiated, selectionVersion);
    } finally {
      release();
      if (this.openChains.get(key) === tail) this.openChains.delete(key); // 链尾清理（防泄漏）
    }
  }

  /** `open` 的实现（`userInitiated=false` = 投递机后台自动开启：不抢活动角色，其余逐字同）。
   *  `internalReopen=true`（G-2/W4；仅重建链内续段使用——陈旧重建与人工 `rebuildSession`）：
   *  **不再查陈旧、不再入 rebuild 链**——① 防「链内等待自身尾」的自死锁（rebuildIfBoundaryStaleUnsafe 的
   * 重开处于该角色的 rebuild 链内，再入链会等自己）；② 此时旧条目已被本链 dispose；若并发方已重建出新会话，
   *  如实按续接返回（不重复重建——重开目标已达成）。 */
  private async openInternalUnsafe(req: SessionOpenRequest, userInitiated: boolean, selectionVersion = this.selectionVersion, internalReopen = false): Promise<OpenResult> {
    if (!req.projectRoot || !req.roleId) {
      return { ok: false, error: mainT("main.session.missingProjectOrRole") };
    }
    if (!(RUNTIME_KINDS as readonly string[]).includes(req.runtime)) return { ok: false, error: mainT("main.common.unknownRuntime") };
    const key = this.sessionKey(req.projectRoot, req.roleId, req.runtime);
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
      const rebuilt = await this.rebuildIfBoundaryStale(key, userInitiated, selectionVersion);
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
    const { project, source } = await buildEffectiveProjectConfig(listing, {
      buildProjectConfig: this.deps.buildProjectConfig,
      loadEffectiveConfig: this.loadEffectiveConfig,
    });
    const config: EffectiveConfigInfo = {
      kind: source.kind,
      accepted: source.acceptance.accepted === true,
      acceptanceSource: source.acceptance.source,
      pinCount: source.acceptance.pin?.length ?? 0,
      reason: source.downgradeReason,
    };
    const boundary = role.boundary;
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
    const dispatchTask: DispatchTaskFn | undefined =
      canDispatch
        ? (d: DispatchTaskPayload) => this.routeDispatch(req.projectRoot, req.runtime, req.roleId, d) // Promise<DispatchReceipt>——契约允许（工具侧 await）
        : undefined;
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
      (input: ContractCheckInput) => this.contractCheckText(req.projectRoot, req.roleId, input);
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
            return this.terminateRoleRun({
              projectRoot: req.projectRoot,
              roleId: payload.roleId,
              runtime,
              ...(payload.taskId !== undefined ? { taskId: payload.taskId } : {}),
            });
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
    // G-4/I3（2026-10-16 客户批准；同 H-1/G-2 先例）：**技能安装/卸载能力**——评审 §5.6：仅
    // `governanceFunction === "nomination"`（Nominator）；single/su 保留旧行为。「未注入即不注册」=
    // 最强 fail-closed（项目角色零感知）。工具 handler 只把 `{roleId,name}` 载荷交进来；
    // 护栏/校验/激活/回执/系统行全在本层（`applySkillChange`）。
    const installSkill: InstallSkillFn | undefined =
      canNominate
        ? (d: InstallSkillPayload, _metadata?: ReportHandbackMetadata) => this.applySkillChange("installed", req.projectRoot, req.runtime, req.roleId, d)
        : undefined;
    const uninstallSkill: UninstallSkillFn | undefined =
      canNominate
        ? (d: InstallSkillPayload, _metadata?: ReportHandbackMetadata) => this.applySkillChange("uninstalled", req.projectRoot, req.runtime, req.roleId, d)
        : undefined;
    // G-4 V2（2026-10-16 客户批准；同处注入）：**外来 MCP 安装/卸载能力**——与技能两工具**逐字同构**
    // （仅 nomination；「未注入即不注册」）；护栏/校验（声明）/激活/回执/系统行全在本层（`applyMcpChange`）。
    const installMcp: InstallMcpFn | undefined =
      canNominate
        ? (d: InstallMcpPayload, _metadata?: ReportHandbackMetadata) => this.applyMcpChange("installed", req.projectRoot, req.runtime, req.roleId, d)
        : undefined;
    const uninstallMcp: UninstallMcpFn | undefined =
      canNominate
        ? (d: InstallMcpPayload, _metadata?: ReportHandbackMetadata) => this.applyMcpChange("uninstalled", req.projectRoot, req.runtime, req.roleId, d)
        : undefined;

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
      if (this.deps.createRuntimeAdapterFactory) {
        createAdapter = this.deps.createRuntimeAdapterFactory(project, req.runtime, { ...this.deps.runtimeOptions, shellGate: this.deps.shellGate });
      } else if (req.runtime === "pi") {
        createAdapter = this.deps.createPiAdapterFactory(project, this.deps.shellGate);
      } else if (req.runtime === "demo") {
        createAdapter = (gate) => this.deps.createDemoAdapter({ gate, boundary });
      } else {
        createAdapter = createRuntimeAdapterFactory(project, req.runtime, this.deps.runtimeOptions);
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
    let governanceJudge: GovernanceJudgeFn | undefined;
    if (governanceModel === "trio" && customerInput !== undefined && this.deps.createGovernanceJudge !== undefined) {
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
    // 客户卡通道路由上下文（客户交互通道与需求变更审批卡**共用同一份**构造）：judge 闭包与 turnText
    // 在调用当刻从活会话条目读取（会话已销毁 ⇒ 缺省，通道不判断）；`metadata` 由调用方原样透传。
    const buildCustomerInputContext = (
      request: CustomerInputRequest,
      extras?: { onPresented?: () => void },
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
        ...(typeof turnText === "string" && turnText !== "" ? { turnText } : {}),
        // 写盘确认的应用层兜底（2026-10-25 客户新规则）：本会话的 Section 1 快照 +
        // resolveWrite 的 skill 根（同一份 ProjectConfig）。缺省 ⇒ 通道不做预授权判定。
        ...(writeBoundary !== undefined ? { writeBoundary, skillRoot: project.skillRoot } : {}),
        ...(extras?.onPresented !== undefined ? { onPresented: extras.onPresented } : {}),
      };
    };
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
      handle = await this.deps.openRoleSession(
        {
          roleId: req.roleId,
          runtime: req.runtime,
          project,
          ...(routineShellPolicy ? { routineShellPolicy } : {}),
          // 客户交互通道（A-5）：仅内置治理角色（su / trio 三人）会话注入；Liaison 不注入（§4.3）。
          // **每会话闭包绑定 roleId**（请求本体不带角色标识——渲染侧据它把交互卡落到该角色的聊天流、
          // 点亮 B-3「等待你确认」）。**镜像面**（§6.1）：trio 治理决定卡额外带 `mirrorRoleId=主入口`，
          // 同一请求 id、同一份 pending、只答一次——不是第二个请求。普通角色逐字不传。
          ...(customerInput
            ? {
                customerInput: (r: CustomerInputRequest, metadata?: CustomerInputMetadata) =>
                  this.withRequestLifecycle(
                    req.projectRoot,
                    req.roleId,
                    r,
                    metadata,
                    (request, context, meta) => customerInput(request, context, meta),
                    (request, extras) => buildCustomerInputContext(request, extras),
                  ),
              }
            : {}),
          // H-1：派发能力（仅 su 会话注入；契约字段名 `dispatchTask`——编排落地后由其转发给适配器）。
          ...(dispatchTask ? { dispatchTask } : {}),
          // 2026-10-26 view_image：全部角色会话注入（目标已定格＝本会话）；编排原样转交运行时核心。
          viewImage,
          // 2026-10-26 需求变更申请（request_requirement_change，仅统筹/提案会话注入；其余角色不注入）。
          // 「未注入即不注册」——编排再按 governanceFunction 收口。提交申请 ≠ 批准（审批在 decision 卡）。
          ...(requestRequirementChange ? { requestRequirementChange } : {}),
          ...(roleStatus ? { roleStatus } : {}),
          contractCheck,
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
        },
        { createAdapter },
      );
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

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

    const entry: LiveSession = {
      handle,
      origins: { byTurn: new Map() },
      roleId: req.roleId, runtime: req.runtime, profileRevision, interactionState,
      projectRoot: req.projectRoot,
      config,
      lastUsed: ++this.lruClock,
      busy: false,
      // F-5-opt1：确认制判据与 `customerInput` 注入判据同处定格（仅内置治理角色且通道已接）。
      confirmGated: customerInput !== undefined,
      boundaryPaths,
      boundaryPrints,
      skillPaths,
      ...(shellJudge !== undefined ? { shellJudge } : {}),
      ...(governanceJudge !== undefined ? { governanceJudge } : {}),
      // 需求变更审批卡通道（2026-10-26 客户纠正）：仅统筹/提案会话构造——绑定本会话客户卡上下文
      // （roleId/signal/judge/turnText）与 `onPresented`；decision 卡结构与角色门仍由共享
      // `validateDecisionCardRequest` 单一来源校验（统筹/提案均在其白名单内）。
      ...(customerInput !== undefined && canInitiateRequirementChange
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
    };
    this.sessions.set(key, entry);
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
    void (async () => {
      try {
        for await (const ev of handle.events()) {
          if (this.sessions.get(key) !== entry) break;
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
          const legacyTerminal = sourceMatches && origin === undefined && entry.origins.running?.turnId === undefined;
          if (ev.kind === "settled" && sourceMatches && (origin === entry.origins.running || (origin?.settled === true && entry.origins.running === undefined) || legacyTerminal)) {
            // 收尾推进：旧式空 turnId 的 settled 走 legacyTerminal 时 `origin` 为 undefined，
            // 但本轮投递事实仍在 `origins.running` 上——先定格，再删除。
            const settledOrigin = origin ?? entry.origins.running;
            if (origin) origin.settled = true;
            delete entry.origins.running;
            this.trimDeliveryOrigins(entry);
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
              this.activeDeliveries.delete(this.queueKey(en.projectRoot, roleId, runtime)); // 「进行中」随本轮结束撤销
              // 2026-10-20 重启续跑：本轮结束 ⇒ 清理已完成标记并落盘（持久项已在 delivery.end 移除）。
              if (finishedDelivery !== undefined) {
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
                void this.mirrorGovernanceFeedback(projectRoot, runtime, roleId, {
                  ...(settledOrigin?.flowIds !== undefined && settledOrigin.flowIds.length > 0 ? { flowIds: settledOrigin.flowIds } : {}),
                  ...(settledOutcome !== undefined ? { outcome: settledOutcome } : {}),
                });
                if (settledOutcome !== undefined) {
                  this.lastTurns.set(this.queueKey(en.projectRoot, roleId, runtime), { outcome: settledOutcome, at: new Date(this.now()).toISOString() });
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
        }
      } catch (err) {
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
    if (entry.busy || (entry.runtime === "pi" && entry.profileRevision !== this.profileRevision("pi") && this.hasBusyRuntime("pi"))) {
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
    }
    const roleId = entry.roleId;
    // L-1 顺序修正（与投递机同款，防竞态）：**先置忙再 await**——快适配器（如演示 runtime）的事件
    // （含 `settled`）可能在 `send` 返回前就被消费循环处理完；若此刻才置忙，settled 的复位会被反向覆盖，
    // 忙态将**永不复位**（队列也永不放行）。失败 ⇒ 复位 + 外推（并没有在跑，如实）。
    const origin = this.beginDeliveryOrigin(entry, clientMessageId);
    // 直接投出的治理唤醒同样带 system 类别（与入队条目同口径；客户消息不设，既有语义不变）。
    if (deliveryKind === "system") origin.kind = "system";
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
      entry.lastTurnAborted = true;
      entry.interactionState.turn.abort();
      return await entry.handle.abort();
    } catch (err) {
      return { ok: false, supported: true, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * 关闭会话（B-2：**定向**）。给定 `roleId` 只关该角色（历史留在界面上）；缺省/`null` 关**全部**
   * （换项目/退出时用）。dispose 出错如实返回（不静默）。
   */
  async stop(target?: string | SessionTarget | null): Promise<StopResult> {
    let roleId: string | undefined;
    if (target !== undefined && target !== null) roleId = this.targetKey(target);
    if (target && roleId === undefined) return { ok: false, note: mainT("main.session.stopNoMatch") };
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
        return { ok: false, note: mainT("main.session.releaseNoSession", { roleId }) };
      }
      const err = await this.disposeEntry(roleId, entry);
      return err === null
        ? { ok: true, note: mainT("main.session.releasedRole", { roleId }) }
        : { ok: false, note: mainT("main.session.releaseError", { detail: String(err) }) };
    }
    if (this.sessions.size === 0) {
      return { ok: false, note: mainT("main.session.noOpenSessions") };
    }
    const n = this.sessions.size;
    let firstError: string | null = null;
    for (const id of [...this.sessions.keys()]) {
      const entry = this.sessions.get(id);
      if (!entry) continue;
      const err = await this.disposeEntry(id, entry);
      if (err !== null && firstError === null) firstError = err;
    }
    if (firstError !== null) return { ok: false, note: mainT("main.session.releaseError", { detail: String(firstError) }) };
    return { ok: true, note: n === 1 ? mainT("main.session.closed") : mainT("main.session.closedAll", { count: n }) };
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
    const listing = this.deps.getListing(projectRoot);
    if (!listing) return null;
    if ((listing.governanceModel ?? "single") === "trio") {
      const convener = listing.roles.find((r) => r.governanceFunction === "schedule");
      return convener !== undefined ? convener.roleId : null;
    }
    const id = typeof listing.primaryRoleId === "string" ? listing.primaryRoleId : "";
    return id !== "" ? id : null;
  }

  /** B 批：任务/汇报主链的幕僚角色 id（**只认真实 chief**，不把旧 liaison 别名算作星形主链）。 */
  /** 登记任务创建者（读盘重放/新建/重派共用；缺字段的旧记录按 chief 兼容）。 */
  private rememberTaskCreator(taskId: string, created: { from?: "chief" | "convener" } | undefined): void {
    this.taskCreators.set(taskId, created?.from === "convener" ? "convener" : "chief");
  }

  private chiefTaskRoleIdOf(projectRoot: string): string | null {
    const listing = this.deps.getListing(projectRoot);
    if (!listing || (listing.governanceModel ?? "single") !== "trio") return null;
    return listing.roles.find((r) => r.governanceFunction === "chief")?.roleId ?? null;
  }

  /** B 批：任务/汇报状态读取（坏行跳过；读失败按空状态 + 诊断，不阻塞）。 */
  private async readTasks(projectRoot: string): Promise<TaskReplay> {
    try {
      return await readTaskState(projectRoot);
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot }).error("tasks.read.failed", error);
      return { records: new Map(), events: [], errors: [], unclosed: [] };
    }
  }

  /** B 批：追加任务事件；失败只记诊断并返回 false（调用方决定是否 fail-closed）。 */
  private async appendTaskState(projectRoot: string, event: TaskStateEvent): Promise<boolean> {
    const result = await appendTaskEvent(projectRoot, event);
    if (!result.ok) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot }).error("tasks.append.failed", new Error(result.message), { taskId: (event as { taskId?: string }).taskId });
      return false;
    }
    return true;
  }

  /** B 批：每角色运行日志观察器（应用侧写，不依赖角色上报；失败只诊断、绝不打断事件循环）。 */
  private appendRoleActivity(
    projectRoot: string,
    roleId: string,
    input: { kind: string; summary: string; tool?: string; status?: string; taskId?: string; turnId?: string; ref?: string },
  ): Promise<void> {
    this.lastRoleActivity.set(`${projectRoot}\u0000${roleId}`, { at: this.now(), kind: input.kind, summary: input.summary });
    // 返回可等待的追加链：调用方若需要「返回即已落盘/可读」（如升级裁决）必须 await；
    // 其余观察器路径保持 fire-and-forget（不阻塞会话事件泵）。
    return appendRoleLog(projectRoot, roleId, input).then((result) => {
      if (!result.ok) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("role-log.append.failed", new Error(result.message));
      }
    });
  }

  /** 从会话事件提取摘要并写运行日志（消息/工具/轮次终局；不写事件 detail 原文）。 */
  private observeRoleEvent(projectRoot: string, roleId: string, event: OrchestrationEvent): void {
    if (event.kind === "handback") {
      this.appendRoleActivity(projectRoot, roleId, {
        kind: "report.received",
        summary: event.handback?.summary ?? event.summary,
        status: event.handback?.status,
        ...(event.handback?.taskId !== undefined ? { taskId: event.handback.taskId } : {}),
        ...(event.handback?.turnId !== undefined ? { turnId: event.handback.turnId } : {}),
      });
      return;
    }
    const detail = event.detail !== null && typeof event.detail === "object" ? event.detail as Record<string, unknown> : {};
    const tool = typeof detail.toolName === "string"
      ? detail.toolName
      : detail.call !== null && typeof detail.call === "object" && typeof (detail.call as { name?: unknown }).name === "string"
        ? String((detail.call as { name: unknown }).name)
        : undefined;
    const status = typeof detail.status === "string"
      ? detail.status
      : typeof detail.outcome === "string"
        ? detail.outcome
        : detail.ok === true ? "ok" : detail.ok === false ? "failed" : undefined;
    const kind = event.kind === "tool_call" ? "tool.call"
      : event.kind === "accepted" ? "tool.result"
        : event.kind === "denied" ? "tool.denied"
          : event.kind === "settled" ? "turn.end"
            : event.kind === "message" ? "message"
              : "event";
    this.appendRoleActivity(projectRoot, roleId, {
      kind,
      summary: event.summary,
      ...(tool !== undefined ? { tool } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(typeof event.turnId === "string" && event.turnId !== "" ? { turnId: event.turnId } : {}),
    });
  }

  /** `role_activity_log` 数据面（工具只读；失败如实回执）。 */
  private async roleActivityLogText(projectRoot: string, query: RoleActivityLogPayload): Promise<WatchdogToolResult> {
    const roleId = typeof query?.roleId === "string" ? query.roleId.trim() : "";
    if (roleId === "") return { ok: false, message: "role_activity_log：缺少 roleId。" };
    const result = await readRoleLog(projectRoot, {
      roleId,
      ...(typeof query.since === "string" && query.since !== "" ? { since: query.since } : {}),
      ...(typeof query.limit === "number" ? { limit: query.limit } : {}),
    });
    if (!result.ok) return { ok: false, message: `role_activity_log：${result.message ?? "读取失败"}` };
    return { ok: true, text: formatRoleActivityText(result, roleId) };
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
    const text = `[系统·申请] ${labels[event]}：角色「${sourceRoleId}」的申请「${shortenSummary(title, 80)}」（#${requestId}）${detail !== undefined && detail !== "" ? `｜${shortenSummary(detail, 120)}` : ""}。申请直达客户/应用裁决，幕僚不转发、不审批、不代选。`;
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

  private async recordRequestPresented(projectRoot: string, requestId: string, sourceRoleId: string, title: string, to: "customer" | "judge"): Promise<void> {
    const key = `${requestId}\u0000${to}`;
    if (this.requestPresentedKeys.has(key)) return;
    this.requestPresentedKeys.add(key);
    await this.appendTaskState(projectRoot, taskEvent("request.presented", { requestId, to }, () => new Date(this.now())));
    await this.notifyRequest(projectRoot, requestId, sourceRoleId, title, "presented", to === "judge" ? "判断 agent" : "客户");
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
  ): Promise<CustomerInputMetadata | undefined> {
    const flowId = request.flowId ?? metadata?.flowId;
    if (typeof flowId !== "string" || flowId.trim() === "") return metadata; // 无 flowId：上游已 fail-closed
    const activeRun = await findActiveRun(projectRoot, flowId);
    const pinnedRun = activeRun.ok && activeRun.manifest !== null && activeRun.manifest.state === "pinned" ? activeRun.manifest : undefined;
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
        proposalPath: `docs/proposals/${flowId}-v1.md`,
        acceptanceReportPath: reportRel,
      },
    };
    return { ...(metadata ?? {}), judgeContext };
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
    buildContext: (request: CustomerInputRequest, extras?: { onPresented?: () => void }) => Parameters<DesktopCustomerInputFn>[1],
    requestIdOverride?: string,
  ): Promise<CustomerInputOutcome | null | undefined> {
    // 2026-10-29（Q6 A）：验收卡的最小链事实由应用补充（产品意图/名单/D3/质检报告）。
    if (request.cardKind === "acceptance") {
      metadata = await this.enrichAcceptanceJudgeContext(projectRoot, request, metadata);
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
    const createdNotify = this.notifyRequest(projectRoot, requestId, sourceRoleId, request.title, "created", undefined, createdWrite);
    let presented = false;
    let presentedWrite: Promise<void> | null = null;
    const markPresented = (to: "customer" | "judge"): Promise<void> => {
      if (presentedWrite !== null) return presentedWrite;
      presented = true;
      presentedWrite = createdWrite.then(() => this.recordRequestPresented(projectRoot, requestId, sourceRoleId, request.title, to));
      return presentedWrite;
    };
    const context = buildContext(request, {
      onPresented: () => { void markPresented("customer"); },
    });
    let out: CustomerInputOutcome | null | undefined;
    try {
      out = await raw(request, context, metadata);
    } catch (error) {
      await createdWrite;
      await createdNotify;
      if (presentedWrite !== null) await presentedWrite;
      await this.appendTaskState(projectRoot, taskEvent("request.resolved", {
        requestId,
        by: "customer",
        choice: "unavailable",
        reason: shortenSummary(error instanceof Error ? error.message : String(error), 200),
      }, () => new Date(this.now())));
      await this.notifyRequest(projectRoot, requestId, sourceRoleId, request.title, "resolved", "通道异常（未执行）");
      throw error;
    }
    await createdWrite;
    await approvalWrite;
    await createdNotify;
    const answeredOut = out !== null && out !== undefined && out.outcome === "answered" ? out : undefined;
    const judged = answeredOut !== undefined && (answeredOut.judge !== undefined || (typeof answeredOut.operatorId === "string" && answeredOut.operatorId.startsWith("judge:")));
    if (judged && !presented && answeredOut !== undefined) await markPresented("judge");
    else if (presentedWrite !== null) await presentedWrite;
    const choice = answeredOut !== undefined
      ? (answeredOut.value.confirmed === true ? "confirmed" : answeredOut.value.confirmed === false ? "denied" : (answeredOut.value.selected ?? []).join(",") || "answered")
      : out?.outcome ?? "unavailable";
    const selected = answeredOut?.value.selected ?? [];
    const operatorId = out !== null && out !== undefined && "operatorId" in out && typeof out.operatorId === "string" ? out.operatorId : undefined;
    // 2026-10-29（方案 v2.1 §5.4/M4/M11）：裁决 id 回填给工具回执（appointment-write 的凭据）；
    // 招人卡同时记录**当前最新名单**的版本与 hash（应用计算，模型不可自报）。
    const decisionId = answeredOut !== undefined ? `decision-${requestId}` : undefined;
    if (answeredOut !== undefined && decisionId !== undefined) answeredOut.decisionId = decisionId;
    let rosterStamp: { rosterVersion?: number; rosterSha256?: string } = {};
    if (request.cardKind === "appointment" && answeredOut !== undefined) {
      const rosterFlow = request.flowId ?? metadata?.flowId;
      if (typeof rosterFlow === "string" && rosterFlow.trim() !== "") {
        const roster = await loadLatestRoster({ projectRoot, flowId: rosterFlow });
        if (roster.ok) rosterStamp = { rosterVersion: roster.version, rosterSha256: roster.sha256 };
      }
    }
    await this.appendTaskState(projectRoot, taskEvent("request.resolved", {
      requestId,
      ...(decisionId !== undefined ? { decisionId } : {}),
      ...rosterStamp,
      ...(selected.length > 0 ? { targetRoleIds: selected } : {}),
      ...(metadata?.intentId !== undefined ? { intentId: metadata.intentId } : {}),
      ...(metadata?.taskId !== undefined ? { taskId: metadata.taskId } : {}),
      by: judged ? "judge" : "customer",
      ...(operatorId !== undefined ? { operatorId } : {}),
      choice,
      ...(out?.outcome === "declined" && out.reason !== undefined ? { reason: shortenSummary(out.reason, 200) } : {}),
      ...(judged && answeredOut?.judge !== undefined ? { judge: answeredOut.judge } : {}),
    }, () => new Date(this.now())));
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
    await this.notifyRequest(projectRoot, requestId, sourceRoleId, request.title, "resolved", judged ? `判断代批：${choice}` : choice);
    return out;
  }

  /** 公开只读入口：角色运行日志（供 `role_activity_log` 工具/界面；失败如实）。 */
  async readRoleActivityLog(projectRoot: string, query: RoleActivityLogPayload): Promise<WatchdogToolResult> {
    return this.roleActivityLogText(projectRoot, query);
  }

  /** 任务列表（只读；坏行数如实；`tasks.jsonl` 不存在 ⇒ 空列表）。 */
  async listTasks(projectRoot: string): Promise<TaskListView> {
    const state = await this.readTasks(projectRoot);
    const tasks = taskCards(state);
    for (const record of state.records.values()) {
      this.starTaskIds.add(record.taskId);
      this.rememberTaskCreator(record.taskId, record.created);
    }
    return {
      projectRoot,
      tasks,
      errors: state.errors.length,
      unclosed: state.unclosed.length,
    };
  }

  /**
   * 重启恢复（B-09）：重放 `tasks.jsonl`；**未投递**的 `created` 任务重新入队（同一 taskId/去重键），
   * 已投递/已报告未收口的任务只展示（不重复执行）。投递队列自身的恢复仍由
   * `restorePersistedDeliveries` 负责；本方法不伪造投递成功，失败只计数/诊断。
   */
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

  async restoreTasks(projectRoot: string): Promise<TaskRestoreReport> {
    const state = await this.readTasks(projectRoot);
    for (const record of state.records.values()) {
      this.starTaskIds.add(record.taskId);
      this.rememberTaskCreator(record.taskId, record.created);
    }
    const report: TaskRestoreReport = { restored: 0, skipped: 0, taskIds: [] };
    const requests = await this.restoreRequestState(projectRoot, state);
    report.orphanedRequests = requests.orphaned;
    report.expiredApprovals = requests.expired;
    for (const record of state.unclosed) {
      const created = record.created;
      if (created === undefined) continue;
      if (record.delivered !== undefined || record.reports.length > 0) {
        report.skipped += 1;
        continue;
      }
      const target = this.deps.getListing(projectRoot)?.roles.find((role) => role.roleId === created.to);
      if (target === undefined) {
        report.skipped += 1;
        createDiagnosticLogger({ component: "desktop.session", projectRoot }).record("tasks.restore.target-missing", { taskId: record.taskId, roleId: created.to });
        continue;
      }
      const runtime = this.findLiveRuntime(projectRoot, created.to) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
      const dedupKey = `${projectRoot}\u0000${runtime}\u0000task\u0000${record.taskId}`;
      const queuedAlready = [...this.deliveryQueues.values()].some((items) => items.some((item) => item.dedupKey === dedupKey));
      if (queuedAlready || this.activeDeliveries.get(this.queueKey(projectRoot, created.to, runtime))?.dedupKey === dedupKey) {
        report.skipped += 1;
        continue;
      }
      const probes = new Map<string, string | undefined>();
      for (const readPath of extractDispatchReadPaths(created.text)) probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
      const plan = planDispatchDelivery(
        { roleId: created.to, task: created.text },
        probes,
        {
          sourceRoleId: this.roleDisplayName(projectRoot, "chief"),
          taskId: record.taskId,
          ...(created.expectedOutput !== undefined ? { expectedOutput: created.expectedOutput } : {}),
          ...(created.requestedEvidence !== undefined ? { requestedEvidence: created.requestedEvidence } : {}),
        },
      );
      if (plan.action === "reject") {
        report.skipped += 1;
        createDiagnosticLogger({ component: "desktop.session", projectRoot }).record("tasks.restore.delivery-rejected", { taskId: record.taskId, reasonCode: "references-missing" });
        continue;
      }
      this.enqueueDelivery(projectRoot, created.to, {
        kind: "dispatch",
        runtime,
        targetRoleId: created.to,
        sourceRoleId: "chief",
        taskId: record.taskId,
        text: plan.text,
        summary: `[任务·恢复] #${record.taskId} → ${this.roleDisplayName(projectRoot, created.to)}：${shortenText(created.text, 40)}`,
        dedupKey,
        clientMessageId: this.appDispatchClientMessageId(dedupKey),
      });
      report.restored += 1;
      report.taskIds.push(record.taskId);
      void this.drainQueue(projectRoot, created.to, runtime);
    }
    return report;
  }

  private findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined {
    for (const [key, entry] of this.sessions) {
      if (key.startsWith(`${projectRoot}\u0000${roleId}\u0000`) && entry.projectRoot === projectRoot && entry.roleId === roleId) return entry.runtime;
    }
    return undefined;
  }

  private async partialArtifactsFor(projectRoot: string, roleId: string, taskId: string | undefined, since?: string): Promise<string[]> {
    const log = await readRoleLog(projectRoot, { roleId, limit: 200, ...(since !== undefined && !Number.isNaN(Date.parse(since)) ? { since } : {}) });
    if (!log.ok) return [];
    const writeTool = /^(write_file|edit_file|write|edit)$/i;
    return log.entries
      .filter((entry) => entry.kind === "task.partial-artifacts" || (typeof entry.tool === "string" && writeTool.test(entry.tool)))
      .filter((entry) => taskId === undefined || entry.taskId === undefined || entry.taskId === taskId)
      .map((entry) => entry.ref ?? entry.summary)
      .slice(0, 20);
  }

  /** 角色临时区（项目相对 `temp/<role>/`；非法角色 id/逃逸 ⇒ undefined）。 */
  private roleTempDir(projectRoot: string, roleId: string): { abs: string; rel: string } | undefined {
    if (typeof roleId !== "string" || roleId === "" || /[\\/]/.test(roleId) || roleId === "." || roleId === "..") return undefined;
    const rel = `temp/${roleId}`;
    const abs = path.resolve(projectRoot, ...rel.split("/"));
    const root = path.resolve(projectRoot);
    if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return undefined;
    return { abs, rel };
  }

  /**
   * B-08：把 `temp/<role>/` 中属于本次任务的产物**物理隔离**到 `temp/<role>/staging/<批次>/`。
   * 只移动任务开始后修改的文件（无 createdAt 时移动当前 temp 下全部，保守）；原子 rename；跨卷失败回退 copy+unlink。
   * 失败只记诊断并保留原文件（不丢证据），不阻塞终止回执。
   */
  private async isolatePartialArtifacts(
    projectRoot: string,
    roleId: string,
    taskId: string | undefined,
    since?: string,
  ): Promise<{ artifacts: string[]; stagingDir?: string }> {
    const temp = this.roleTempDir(projectRoot, roleId);
    if (temp === undefined) return { artifacts: [] };
    const sinceMs = typeof since === "string" && !Number.isNaN(Date.parse(since)) ? Date.parse(since) : undefined;
    const candidates: { abs: string; rel: string }[] = [];
    const walk = async (dir: string, relDir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      for (const entry of entries) {
        if (relDir === temp.rel && entry.name === "staging") continue; // 隔离区不再搬
        const abs = path.join(dir, entry.name);
        const rel = `${relDir}/${entry.name}`;
        if (entry.isDirectory()) {
          await walk(abs, rel);
          continue;
        }
        if (!entry.isFile()) continue;
        try {
          const st = await fs.promises.stat(abs);
          if (sinceMs !== undefined && st.mtimeMs < sinceMs) continue;
          candidates.push({ abs, rel });
        } catch { /* 文件消失/不可读：跳过（不猜） */ }
      }
    };
    try {
      await walk(temp.abs, temp.rel);
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("role.terminate.staging.scan.failed", error);
      return { artifacts: [] };
    }
    if (candidates.length === 0) return { artifacts: [] };
    const batch = `terminated-${String(taskId ?? "unknown").replace(/[^A-Za-z0-9._-]/g, "_")}-${this.now()}`;
    const stagingRel = `${temp.rel}/staging/${batch}`;
    const stagingAbs = path.resolve(projectRoot, ...stagingRel.split("/"));
    try {
      await fs.promises.mkdir(stagingAbs, { recursive: true });
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("role.terminate.staging.mkdir.failed", error);
      return { artifacts: [] };
    }
    const isolated: string[] = [];
    for (const candidate of candidates) {
      const dest = path.join(stagingAbs, path.relative(temp.abs, candidate.abs));
      try {
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        try {
          await fs.promises.rename(candidate.abs, dest);
        } catch {
          await fs.promises.copyFile(candidate.abs, dest);
          await fs.promises.unlink(candidate.abs);
        }
        isolated.push(candidate.rel);
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("role.terminate.staging.move.failed", error, { ref: candidate.rel });
      }
    }
    return { artifacts: isolated, ...(isolated.length > 0 ? { stagingDir: stagingRel } : {}) };
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

  /** B-07：连续卡死时的替代角色（优先同项目非内置 worker；无则同角色 fresh）。 */
  private chooseRedispatchTarget(projectRoot: string, currentRoleId: string, attempts: number): string {
    if (attempts < 1) return currentRoleId;
    const listing = this.deps.getListing(projectRoot);
    const chief = this.chiefTaskRoleIdOf(projectRoot);
    const candidate = listing?.roles.find((role) => role.builtIn !== true && role.roleId !== currentRoleId && role.roleId !== chief);
    return candidate?.roleId ?? currentRoleId;
  }

  /**
   * **终止角色当前轮次 + 后台子进程树**（B-08）。失败/无法确认 ⇒ `terminationConfirmed:false`，
   * 调用方（重派）不得自动重派。记录 `role.terminated`（子进程数/退出/信号）到运行日志。
   */
  async terminateRoleRun(input: TerminateRoleRunInput): Promise<TerminateRoleRunResult> {
    const projectRoot = input.projectRoot;
    const roleId = input.roleId;
    const runtime = input.runtime;
    const entry = this.sessions.get(this.sessionKey(projectRoot, roleId, runtime));
    const base: TerminateRoleRunResult = {
      ok: false,
      roleId,
      terminationConfirmed: false,
      childProcesses: 0,
      childProcessesStopped: 0,
      childResults: [],
      partialArtifacts: [],
      isolatedArtifacts: [],
      sessionFresh: false,
      abort: { ok: false, supported: false },
    };
    if (entry === undefined) {
      return { ...base, sessionFresh: true, message: "会话未开，未执行终止。" };
    }
    const taskState = input.taskId !== undefined ? await this.readTasks(projectRoot) : undefined;
    const createdAt = input.taskId !== undefined ? taskState?.records.get(input.taskId)?.created?.at : undefined;
    const logPartials = await this.partialArtifactsFor(projectRoot, roleId, input.taskId, createdAt);
    const isolation = await this.isolatePartialArtifacts(projectRoot, roleId, input.taskId, createdAt);
    const partialArtifacts = [...new Set([...logPartials, ...isolation.artifacts])].slice(0, 50);
    let childProcesses = 0;
    let childProcessesStopped = 0;
    const childResults: TerminateRoleRunResult["childResults"] = [];
    try {
      const tasks = entry.handle.listBackgroundTasks?.() ?? [];
      const running = tasks.filter((task) => task.state === "running");
      childProcesses = running.length;
      for (const task of running) {
        if (entry.handle.stopBackgroundTask === undefined) {
          childResults.push({ taskId: task.taskId, ok: false, reason: "unavailable" });
          continue;
        }
        try {
          const stopped = await entry.handle.stopBackgroundTask(task.taskId, { force: true });
          const snapshot = stopped.ok ? stopped.task : stopped.task;
          childResults.push({
            taskId: task.taskId,
            ok: stopped.ok,
            ...(stopped.ok ? {} : { reason: stopped.reason }),
            ...(snapshot?.exitCode !== undefined ? { exitCode: snapshot.exitCode } : {}),
            ...(snapshot?.signal !== undefined ? { signal: snapshot.signal } : {}),
          });
          if (stopped.ok) childProcessesStopped += 1;
        } catch (error) {
          childResults.push({ taskId: task.taskId, ok: false, reason: error instanceof Error ? error.message : String(error) });
        }
      }
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("role.terminate.child-list.failed", error);
    }
    entry.interactionState.turn.abort();
    let abort: { ok: boolean; supported: boolean; error?: string } = { ok: false, supported: false, error: "当前运行时不支持停止" };
    if (entry.handle.abort !== undefined) {
      try {
        const result = await Promise.race([
          entry.handle.abort(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("终止等待超时")), 5000)),
        ]);
        abort = { ok: result.ok, supported: result.supported, ...(result.error !== undefined ? { error: result.error } : {}) };
      } catch (error) {
        abort = { ok: false, supported: true, error: error instanceof Error ? error.message : String(error) };
      }
    }
    const terminationConfirmed = abort.ok && childProcessesStopped === childProcesses;
    const result: TerminateRoleRunResult = {
      ok: terminationConfirmed,
      roleId,
      terminationConfirmed,
      childProcesses,
      childProcessesStopped,
      childResults,
      partialArtifacts,
      isolatedArtifacts: isolation.artifacts,
      ...(isolation.stagingDir !== undefined ? { stagingDir: isolation.stagingDir } : {}),
      sessionFresh: false,
      abort,
      ...(terminationConfirmed ? {} : { message: abort.error ?? (childProcessesStopped !== childProcesses ? "子进程未能全部确认退出。" : "终止未确认。") }),
    };
    const exits = childResults
      .map((entry) => {
        const bits: string[] = [];
        if (entry.exitCode !== undefined) bits.push(`exitCode=${entry.exitCode}`);
        if (entry.signal !== undefined) bits.push(`signal=${entry.signal}`);
        return bits.length > 0 ? `${entry.taskId}:${bits.join("/")}` : undefined;
      })
      .filter((value): value is string => value !== undefined);
    this.appendRoleActivity(projectRoot, roleId, {
      kind: "role.terminated",
      summary: `终止：子进程 ${childProcessesStopped}/${childProcesses} 已停${exits.length > 0 ? `（${exits.join("；")}）` : ""}；abort=${abort.ok ? "ok" : abort.error ?? "unsupported"}；部分写入 ${partialArtifacts.length} 项；隔离 ${isolation.artifacts.length} 项`,
      status: terminationConfirmed ? "confirmed" : "unsafe",
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(entry.origins.running?.turnId !== undefined ? { turnId: entry.origins.running.turnId } : {}),
      ref: isolation.artifacts[0] ?? partialArtifacts[0],
    });
    // B-08：把隔离事实落角色日志（后续重派/核对读同一事实，不依赖当次内存回执）。
    if (isolation.artifacts.length > 0) {
      this.appendRoleActivity(projectRoot, roleId, {
        kind: "task.partial-artifacts",
        summary: `${isolation.artifacts.length} 项部分产物已隔离到 ${isolation.stagingDir ?? "staging"}`,
        status: "needs-review",
        ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
        ...(isolation.stagingDir !== undefined ? { ref: isolation.stagingDir } : {}),
      });
    }
    // B-07：终止成功 ⇒ 标记任务失败（保留未收口，供幕僚决定重派/升级；不伪造角色提交的报告）。
    if (terminationConfirmed && input.taskId !== undefined) {
      await this.appendTaskState(projectRoot, taskEvent("task.reported", {
        taskId: input.taskId,
        from: "chief",
        status: "failed",
        summary: shortenSummary(`执行终止（stuck）：子进程 ${childProcessesStopped}/${childProcesses} 已停${exits.length > 0 ? `（${exits.join("；")}）` : ""}；部分写入 ${partialArtifacts.length} 项`),
        ...(entry.origins.running?.turnId !== undefined ? { turnId: entry.origins.running.turnId } : {}),
      }, () => new Date(this.now())));
    }
    return result;
  }

  private taskChainRootOf(state: TaskReplay, taskId: string): string {
    let cursor = taskId;
    const seen = new Set<string>();
    for (;;) {
      if (seen.has(cursor)) return cursor;
      seen.add(cursor);
      const record = state.records.get(cursor);
      if (record?.retryOf === undefined) return cursor;
      cursor = record.retryOf;
    }
  }

  /**
   * **卡死终止后的安全重派**（B-07/B-08）：先终止（若会话在跑）→ 按副作用分类/终止确认/部分写入
   * 判定安全；仅 `safe` 产生新任务（新 taskId + `retryOf` + 同 idempotencyKey，原任务 closed/rework）。
   * `external|destructive|unknown`、终止未确认、已发生外部副作用 ⇒ 零自动重派；部分写入/已有完成报告
   * ⇒ needs-review。同链最多 2 次重派（首次尝试不计）；第 3 次升级、不再自动重派。
   */
  async redispatchTask(input: RedispatchTaskInput): Promise<RedispatchTaskResult> {
    const projectRoot = input.projectRoot;
    const state = await this.readTasks(projectRoot);
    const record = state.records.get(input.taskId);
    const created = record?.created;
    if (record === undefined || created === undefined) {
      return { ok: false, safety: "unsafe", autoAllowed: false, reasons: ["任务不存在或缺少 task.created"], message: "重派未执行：任务不存在。" };
    }
    if (record.closed !== undefined) {
      return { ok: false, safety: "unsafe", autoAllowed: false, reasons: ["任务已收口"], message: "重派未执行：任务已收口。" };
    }
    const root = this.taskChainRootOf(state, record.taskId);
    const attempts = redispatchCountOf(state, root);
    const maxRaw = Number(process.env["ANS_LOG_REDISPATCH_MAX"]);
    const redispatchMax = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : 2;
    if (attempts >= redispatchMax) {
      const escalation = await this.escalateStuckTask(
        projectRoot,
        record.taskId,
        root,
        attempts,
        created.flowId,
        created.to,
        this.findLiveRuntime(projectRoot, created.to) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo",
      );
      return {
        ok: false,
        safety: "needs-review",
        autoAllowed: false,
        reasons: [`同链已重派 ${attempts} 次（上限 ${redispatchMax}）；已提交升级卡（继续/重派/换人/终止，唯一推荐）`],
        message: escalation.message,
        escalated: escalation.escalated,
        ...(escalation.requestId !== undefined ? { requestId: escalation.requestId } : {}),
        ...(escalation.selected !== undefined ? { selected: escalation.selected } : {}),
      };
    }
    const requestedTarget = typeof input.to === "string" && input.to.trim() !== "" ? input.to.trim() : undefined;
    const to = requestedTarget ?? this.chooseRedispatchTarget(projectRoot, created.to, attempts);
    const originalRuntime = this.findLiveRuntime(projectRoot, created.to) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
    const termination = await this.terminateRoleRun({ projectRoot, roleId: created.to, runtime: originalRuntime, taskId: record.taskId });
    const partialArtifacts = termination.partialArtifacts;
    const completedReport = record.reports.some((entry) => entry.status === "done");
    // B-08：应用按角色日志升类（shell/后台外部命令 ⇒ 至少 external；不得降类），并检查未完成工具调用。
    const log = await readRoleLog(projectRoot, { roleId: created.to, limit: 200, ...(created.at !== undefined ? { since: created.at } : {}) });
    const toolEntries = log.ok ? log.entries.filter((entry) => typeof entry.tool === "string") : [];
    const usedExternalTool = toolEntries.some((entry) => entry.tool === "run_shell" || entry.tool === "start_background_task");
    const sideEffect = usedExternalTool && (created.sideEffect === "read-only" || created.sideEffect === "docs" || created.sideEffect === "code")
      ? "external"
      : created.sideEffect;
    const lastToolEntry = toolEntries[toolEntries.length - 1];
    const inFlightTool = lastToolEntry?.kind === "tool.call";
    const safety = evaluateRedispatchSafety({
      sideEffect,
      terminationConfirmed: termination.terminationConfirmed,
      partialArtifacts,
      completedReport,
      inFlightTool,
    });
    if (!safety.autoAllowed) {
      this.appendRoleActivity(projectRoot, "chief", {
        kind: "task.redispatch.blocked",
        summary: `任务 #${record.taskId} 不自动重派：${safety.reasons.join("；")}`,
        taskId: record.taskId,
        status: safety.safety,
      });
      this.emitDeliveryNote(projectRoot, originalRuntime, "chief", "chief", `[系统·重派] 任务 #${record.taskId} 不自动重派（${safety.safety}）：${safety.reasons.join("；")}`);
      return { ok: false, safety: safety.safety, autoAllowed: false, reasons: safety.reasons, message: `重派未执行：${safety.reasons.join("；")}` };
    }
    const targetRuntime = this.findLiveRuntime(projectRoot, to) ?? originalRuntime;
    const fresh = await this.ensureFreshRoleSession(projectRoot, to, targetRuntime);
    if (!fresh.ok) {
      this.appendRoleActivity(projectRoot, "chief", {
        kind: "task.redispatch.fresh-session-failed",
        summary: `任务 #${record.taskId} 未能建立 fresh 会话：${fresh.error ?? "未知原因"}`,
        taskId: record.taskId,
        status: "needs-review",
      });
      return {
        ok: false,
        safety: "needs-review",
        autoAllowed: false,
        reasons: [`fresh 会话未建立：${fresh.error ?? "未知原因"}`],
        message: "重派未执行：目标角色 fresh 会话未建立（不自动重派）。",
        sessionFresh: false,
      };
    }
    const newId = redispatchTaskId(record.taskId, attempts + 1);
    this.starTaskIds.add(newId);
    this.rememberTaskCreator(newId, created);
    const now = () => new Date(this.now());
    // 原任务先收口（rework/stuck-terminated），再写重派事件与新任务；任一步写失败 ⇒ 不投递（如实失败）。
    if (!(await this.appendTaskState(projectRoot, taskEvent("task.closed", {
      taskId: record.taskId,
      by: "chief",
      outcome: "rework",
      note: "stuck-terminated:redispatch",
    }, now)))) {
      return { ok: false, safety: "unsafe", autoAllowed: false, reasons: ["任务状态写入失败"], message: "重派未执行：任务状态写入失败。" };
    }
    const redispatchEvent = taskEvent("task.redispatch", {
      taskId: newId,
      retryOf: record.taskId,
      to,
      reason: "stuck",
      safety: "safe",
    }, now);
    const newCreated = taskEvent("task.created", {
      taskId: newId,
      from: created.from,
      ...(created.flowId !== undefined ? { flowId: created.flowId } : {}),
      ...(created.stepId !== undefined ? { stepId: created.stepId } : {}),
      ...(created.moduleId !== undefined ? { moduleId: created.moduleId } : {}),
      ...(created.moduleDirectory !== undefined ? { moduleDirectory: created.moduleDirectory } : {}),
      ...(created.runId !== undefined ? { runId: created.runId } : {}),
      ...(created.runState !== undefined ? { runState: created.runState } : {}),
      ...(created.runStage !== undefined ? { runStage: created.runStage } : {}),
      to,
      // B-07：同角色重派先缩窄任务（明确先做最小可验证部分；已完成部分核对后跳过）。
      text: `${created.text}\n\n[重派] 上次执行卡死；请缩窄范围，先完成最小可验证部分；已完成部分核对后跳过，不要重复。`,
      ...(created.expectedOutput !== undefined ? { expectedOutput: created.expectedOutput } : {}),
      ...(created.requestedEvidence !== undefined ? { requestedEvidence: created.requestedEvidence } : {}),
      sideEffect: created.sideEffect,
      idempotencyKey: created.idempotencyKey,
    }, now);
    if (!(await this.appendTaskState(projectRoot, redispatchEvent)) || !(await this.appendTaskState(projectRoot, newCreated))) {
      return { ok: false, safety: "unsafe", autoAllowed: false, reasons: ["重派事件写入失败"], message: "重派未完成：事件写入失败（原任务已收口，未投递新任务）。" };
    }
    const probes = new Map<string, string | undefined>();
    for (const readPath of extractDispatchReadPaths(created.text)) probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
    const plan = planDispatchDelivery(
      { roleId: to, task: created.text, reason: "stuck" },
      probes,
      {
        sourceRoleId: this.roleDisplayName(projectRoot, "chief"),
        taskId: newId,
        ...(created.expectedOutput !== undefined ? { expectedOutput: created.expectedOutput } : {}),
        ...(created.requestedEvidence !== undefined ? { requestedEvidence: created.requestedEvidence } : {}),
      },
    );
    if (plan.action === "reject") {
      await this.appendTaskState(projectRoot, taskEvent("task.closed", {
        taskId: newId,
        by: "chief",
        outcome: "rejected",
        note: `delivery-rejected: ${shortenSummary(plan.message)}`,
      }, now));
      return { ok: false, safety: "unsafe", autoAllowed: false, reasons: [plan.message], message: plan.message };
    }
    const dedupKey = `${projectRoot}\u0000${targetRuntime}\u0000task\u0000${newId}`;
    this.activeDispatchKeys.add(dedupKey);
    this.enqueueDelivery(projectRoot, to, {
      kind: "dispatch",
      runtime: targetRuntime,
      targetRoleId: to,
      sourceRoleId: "chief",
      taskId: newId,
      text: plan.text,
      summary: `[任务·重派] #${newId}（retryOf ${record.taskId}）→ ${this.roleDisplayName(projectRoot, to)}：${shortenText(created.text, 40)}`,
      dedupKey,
      clientMessageId: this.appDispatchClientMessageId(dedupKey),
    });
    this.appendRoleActivity(projectRoot, "chief", { kind: "task.redispatch", summary: `重派任务 #${record.taskId} → #${newId}（${to}；safe）`, taskId: newId, status: "safe" });
    this.appendRoleActivity(projectRoot, to, { kind: "task.delivered", summary: `收到重派任务 #${newId}（retryOf ${record.taskId}）`, taskId: newId, status: "delivered" });
    void this.drainQueue(projectRoot, to, targetRuntime);
    return {
      ok: true,
      taskId: newId,
      retryOf: record.taskId,
      safety: "safe",
      autoAllowed: true,
      reasons: safety.reasons,
      message: `已终止并重派：新任务 #${newId}（retryOf #${record.taskId}）→ ${to}；第 ${attempts + 1} 次重派；fresh 会话=${fresh.rebuilt ? "已重建" : "新开/未开"}。`,
      sessionFresh: fresh.ok,
    };
  }

  /**
   * 幕僚收口任务（B-03 `task.closed`）：accepted/rework/rejected。已收口/不存在 ⇒ 如实失败（不重写历史）。
   * 只由幕僚动作调用（接口/任务卡）；角色不能自行收口。
   */
  async closeTask(input: CloseTaskInput): Promise<CloseTaskResult> {
    const state = await this.readTasks(input.projectRoot);
    const record = state.records.get(input.taskId);
    if (record === undefined || record.created === undefined) {
      return { ok: false, taskId: input.taskId, message: "收口未执行：任务不存在。" };
    }
    if (record.closed !== undefined) {
      return { ok: false, taskId: input.taskId, outcome: record.closed.outcome, message: "收口未执行：任务已收口（不重写历史）。" };
    }
    const note = typeof input.note === "string" && input.note.trim() !== "" ? shortenSummary(input.note) : undefined;
    const appended = await this.appendTaskState(input.projectRoot, taskEvent("task.closed", {
      taskId: input.taskId,
      by: "chief",
      outcome: input.outcome,
      ...(note !== undefined ? { note } : {}),
    }, () => new Date(this.now())));
    if (!appended) return { ok: false, taskId: input.taskId, message: "收口未执行：任务状态写入失败。" };
    this.appendRoleActivity(input.projectRoot, "chief", { kind: "task.closed", summary: `任务 #${input.taskId} 收口：${input.outcome}${note !== undefined ? `（${note}）` : ""}`, taskId: input.taskId, status: input.outcome });
    return { ok: true, taskId: input.taskId, outcome: input.outcome, message: `任务 #${input.taskId} 已收口：${input.outcome}。` };
  }

  /**
   * B-07：连续 2 次重派仍卡死 ⇒ 经应用既有客户交互/决策通道提交「继续 / 重派 / 换人 / 终止」唯一推荐卡。
   * 不伪造客户决定：通道不可用/被取消 ⇒ 如实返回未执行；同一链只提交一次（watchdog 重复 tick 不刷屏）。
   */
  private escalateStuckTask(
    projectRoot: string,
    taskId: string,
    rootTaskId: string,
    attempts: number,
    taskFlowId?: string,
    targetRoleId?: string,
    targetRuntime?: RuntimeKind,
  ): Promise<{ escalated: boolean; requestId?: string; selected?: string; message: string }> {
    const key = `${projectRoot}\u0000${rootTaskId}`;
    const existing = this.escalationRequests.get(key);
    if (existing !== undefined) return existing;
    const chiefRoleId = this.chiefTaskRoleIdOf(projectRoot);
    const runtime = this.findLiveRuntime(projectRoot, chiefRoleId ?? "") ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
    const requestId = `task-escalation-${rootTaskId}-${attempts}`;
    const promise = (async () => {
      const channel = this.deps.customerInput;
      if (channel === undefined) {
        this.appendRoleActivity(projectRoot, chiefRoleId ?? "chief", {
          kind: "task.escalation.unavailable",
          summary: `任务 #${taskId} 连续卡死升级卡未提交：客户交互/决策通道未接线`,
          taskId,
          status: "unavailable",
        });
        return { escalated: false, requestId, message: "升级未提交：客户交互/决策通道不可用（不伪造卡）。" };
      }
      const flowId = typeof taskFlowId === "string" && taskFlowId !== "" ? taskFlowId : "task-escalation";
      const request: CustomerInputRequest = {
        kind: "choice",
        cardKind: "decision",
        application: true,
        sourceRoleId: "application",
        flowId,
        title: `应用·任务升级：任务连续卡死 ${taskId}`,
        question: "任务已连续 2 次重派仍卡死。请选择处置（唯一推荐：终止）。",
        options: [
          { id: "continue", label: "继续等待/观察" },
          { id: "redispatch", label: "再重派一次（同角色 fresh 会话）" },
          { id: "replace", label: "换人执行（替代角色）" },
          { id: "terminate", label: "终止任务", recommended: true },
        ],
      };
      let outcome: CustomerInputOutcome | null | undefined;
      try {
        outcome = await this.withRequestLifecycle(
          projectRoot,
          "application",
          request,
          { taskId },
          (req, context) => channel(req, context),
          (req, extras) => ({
            roleId: "application",
            runtime,
            projectRoot,
            governanceModel: "trio",
            ...(extras?.onPresented !== undefined ? { onPresented: extras.onPresented } : {}),
          }),
          requestId,
        );
      } catch (error) {
        this.appendRoleActivity(projectRoot, chiefRoleId ?? "chief", {
          kind: "task.escalation.failed",
          summary: `任务 #${taskId} 升级卡提交失败：${error instanceof Error ? error.message : String(error)}`,
          taskId,
          status: "failed",
        });
        return { escalated: false, requestId, message: "升级卡提交失败（未获客户裁决）。" };
      }
      const selected = outcome?.outcome === "answered"
        ? (outcome.value.selected ?? []).find((id) => ["continue", "redispatch", "replace", "terminate"].includes(id))
        : undefined;
      await this.appendRoleActivity(projectRoot, chiefRoleId ?? "chief", {
        kind: "task.escalation",
        summary: `任务 #${taskId} 连续卡死升级：${outcome?.outcome ?? "unavailable"}${selected !== undefined ? `（${selected}）` : ""}`,
        taskId,
        status: selected ?? outcome?.outcome ?? "unavailable",
      });
      if (selected === "terminate") {
        if (targetRoleId !== undefined && targetRoleId !== "") {
          await this.terminateRoleRun({
            projectRoot,
            roleId: targetRoleId,
            runtime: targetRuntime ?? runtime,
            taskId,
          });
        }
        await this.appendTaskState(projectRoot, taskEvent("task.closed", {
          taskId,
          by: "chief",
          outcome: "rejected",
          note: "stuck-escalation:terminate",
        }, () => new Date(this.now())));
      } else if (selected === "continue" || selected === "redispatch" || selected === "replace") {
        // C 批（协调者放行前置）：continue/redispatch/replace 不自动执行第二条危险路径，但**必须定义并
        // 落地人工处置**——写角色日志 + 向幕僚发系统行，任务保持未收口（不伪造完成、不重复副作用）。
        const manual: Record<typeof selected, string> = {
          continue: "保持观察：不自动重派、不终止；巡检继续，需要收口时由幕僚手动终止或派新任务。",
          redispatch: "自动重派上限已到，不再自动重派；请人工核对部分产物后新建/重派任务（可先终止原任务）。",
          replace: "不自动换人；请人工选择替代角色并派新任务（必要时先终止原角色运行）。",
        };
        const text = `任务 #${taskId} 升级裁决「${selected}」：${manual[selected]}`;
        await this.appendRoleActivity(projectRoot, chiefRoleId ?? "chief", {
          kind: "task.escalation.manual",
          summary: text,
          taskId,
          status: selected,
        });
        this.emitDeliveryNote(projectRoot, runtime, chiefRoleId ?? "chief", "chief", `[系统·升级] ${text}`);
      }
      return {
        escalated: true,
        requestId,
        ...(selected !== undefined ? { selected } : {}),
        message: selected !== undefined
          ? `升级卡已提交并获得裁决：${selected}。`
          : "升级卡已提交，未获明确裁决（不代选）。",
      };
    })();
    this.escalationRequests.set(key, promise);
    // 同一链只提交一次（watchdog 重复 tick 直接返回同一结果，不重复弹卡）。
    return promise;
  }

  /**
   * **派发主人**角色 id（routeDispatch 的来源防御性校验）：trio → Convener；single → 主入口（su）。
   * 正常路径由 `open()` 的能力注入保证；此处只做防御性再校验（绝不静默换人）。
   */
  private dispatcherRoleIdOf(projectRoot: string): string | null {
    return this.handbackOwnerRoleId(projectRoot);
  }

  /** 投递进展的**系统行**（首选进目标/请求者的 pane；首选未知时退回兜底角色）——如实、不静默。 */
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    const roleId = preferredRoleId !== null && preferredRoleId !== "" ? preferredRoleId : fallbackRoleId;
    this.deps.emitEvent({ roleId, projectRoot, runtime, event: { kind: "message", summary, detail: { source: "delivery-note" } } });
  }

  /** 治理反馈客户投影的登记键：`queueKey` + 文本 sha256（回显文本需逐字一致才命中；不猜）。 */
  private governanceProjectionKey(projectRoot: string, roleId: string, runtime: RuntimeKind, text: string): string {
    return `${this.queueKey(projectRoot, roleId, runtime)}\u0000${createHash("sha256").update(text).digest("hex")}`;
  }

  /**
   * A4 稳定指纹：同来源/同状态/同流程（排序）/同报告与治理指针/同正文 ⇒ 同值；任一变化 ⇒ 新值。
   * 只用于 UI 合并连续状态行（×N），不参与任何判定。
   */
  private governanceProjectionFingerprint(input: {
    sourceRoleId: string;
    statusCode: GovernanceClientProjectionV1["statusCode"];
    flowIds: readonly string[];
    reportPath?: string;
    governancePath?: string;
    text: string;
  }): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          kind: "governance-feedback",
          sourceRoleId: input.sourceRoleId,
          statusCode: input.statusCode,
          flowIds: [...input.flowIds].sort(),
          reportPath: input.reportPath ?? null,
          governancePath: input.governancePath ?? null,
          textHash: createHash("sha256").update(input.text).digest("hex"),
        }),
      )
      .digest("hex");
  }

  /** 发送成功后登记投影（有界 FIFO；同键刷新登记时刻）。失败不登记（调用方只在 `sent.ok` 后调用）。 */
  private registerGovernanceClientProjection(
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    text: string,
    projection: GovernanceClientProjectionV1,
  ): void {
    const key = this.governanceProjectionKey(projectRoot, roleId, runtime, text);
    this.governanceClientProjections.delete(key);
    this.governanceClientProjections.set(key, { projection, at: this.now() });
    while (this.governanceClientProjections.size > GOVERNANCE_CLIENT_PROJECTION_LIMIT) {
      const oldest = this.governanceClientProjections.keys().next().value;
      if (oldest === undefined) break;
      this.governanceClientProjections.delete(oldest);
    }
  }

  /** `prompt-input` 回显查找投影：命中且未过期才返回（过期即清理）；miss ⇒ 事件保持原样。 */
  private lookupGovernanceClientProjection(
    projectRoot: string,
    roleId: string,
    runtime: RuntimeKind,
    text: string,
  ): GovernanceClientProjectionV1 | undefined {
    const key = this.governanceProjectionKey(projectRoot, roleId, runtime, text);
    const found = this.governanceClientProjections.get(key);
    if (found === undefined) return undefined;
    if (this.now() - found.at > GOVERNANCE_CLIENT_PROJECTION_TTL_MS) {
      this.governanceClientProjections.delete(key);
      return undefined;
    }
    return found.projection;
  }

  /**
   * **收尾反馈 → 主入口汇总任务**（2026-10-18 客户反馈：原文镜像 = 「直接转述」，不对）。
   * trio 的内部内置角色（Rapporteur/Nominator/Convener——改名后即 Draft/Crew/Steward/Proof）一轮结束后，
   * **不再把正文原样贴到主入口 pane**，而是经**既有投递机**给主入口（`primaryRoleId`，Lead/Liaison）
   * 投一条任务：`[系统·治理反馈]` 前缀 + 本轮正文（≤4000 码点）+「汇总后告知客户、不要逐字转述」指令。
   *  · 仅 trio；`roleId === primaryRoleId` ⇒ 不投（Lead 自己；防循环）；
   *  · 仅内置治理角色（`builtIn === true` 且有 `governanceFunction`）——项目角色不投（其回交仍走 Convener）；
   *  · 文本**取出即删**（同一轮只投一次）；trim 后非空；`displayName` 取 listing 角色显示名（无则 roleId）。
   *  · Lead 忙 ⇒ 按 `sendBackground`/投递机既有语义排队；未开 ⇒ `openBackground` 后台开启（不抢活动角色）；
   *    失败只诊断、**绝不打断 settle**。
   *  · `getListing` 在精确 miss 时做**斜杠归一兜底**（真机：事件循环 root 与枚举缓存 key 可能正/反斜杠
   *    不一致）；仅查找变体，**不改变**调用方 key。
   *  · 2026-10-24（治理协调，设计 v1 §4.3/§6.5）：**Proof（`governanceFunction === "verification"`）只投
   *    「状态 + 报告/治理路径指针」，不转述报告正文**（Proof 的权威报告给客户/应用，Lead 不能编辑/代批/改判）。
   *  · 内置来源回交若已由 `handleHandback` 防御性投给 Lead（同一轮），本函数**不再重复投**（短时标记去重）。
   *  · 每个 early-return 记一条 `governance.feedback.skip`（不记正文）；成功记 `governance.feedback.mirrored`
   *    （`targetRoleId` = Lead 的真实 roleId，不记来源）。
   */
  private async mirrorGovernanceFeedback(
    projectRoot: string,
    runtime: RuntimeKind,
    roleId: string,
    options: { flowIds?: readonly string[]; outcome?: RuntimeTurnOutcome } = {},
  ): Promise<void> {
    const diagnostic = createDiagnosticLogger({ component: "desktop.governance-feedback", projectRoot, roleId });
    const skip = (reason: "no-listing" | "non-trio" | "primary" | "not-builtin" | "no-text" | "handback-mirrored"): void => {
      // 共享白名单只落允许字段名 ⇒ 同时带 `reasonCode`（机器可读）；绝不带正文。
      diagnostic.record("governance.feedback.skip", { reason, reasonCode: reason });
    };
    try {
      const listing = this.findListingForFeedback(projectRoot);
      if (listing === undefined) return skip("no-listing");
      if ((listing.governanceModel ?? "single") !== "trio") return skip("non-trio");
      const primaryRoleId = typeof listing.primaryRoleId === "string" ? listing.primaryRoleId : "";
      if (primaryRoleId === "" || roleId === primaryRoleId) return skip("primary");
      const role = listing.roles.find((r) => r.roleId === roleId);
      if (role === undefined || role.builtIn !== true || role.governanceFunction === undefined) return skip("not-builtin");
      const key = this.queueKey(projectRoot, roleId, runtime);
      // 内置来源回交已防御性投给 Lead（同一轮）：settle 反馈与它去重（同一轮只投一条）。
      const handbackMirroredAt = this.governanceHandbackMirrored.get(key);
      if (handbackMirroredAt !== undefined) {
        this.governanceHandbackMirrored.delete(key);
        if (this.now() - handbackMirroredAt <= GOVERNANCE_HANDBACK_MIRROR_DEDUPE_MS) {
          this.lastAssistantText.delete(key);
          return skip("handback-mirrored");
        }
      }
      const last = this.lastAssistantText.get(key);
      if (last === undefined) return skip("no-text");
      this.lastAssistantText.delete(key); // 取出即删：同一轮只投一次
      const text = last.text.trim();
      if (text === "") return skip("no-text");
      // 显示名：listing 的 `displayName`（Lead / Draft / Crew / Steward / Proof），否则回退 roleId。
      const displayName = this.roleDisplayName(projectRoot, roleId);
      const isProof = role.governanceFunction === "verification";
      let body = "";
      let task: string;
      let projection: GovernanceClientProjectionV1;
      if (isProof) {
        // Proof 独立性：只发状态 + 报告/治理路径指针；正文丢弃、不转全文、不摘要替代报告。
        const flowIds = await this.resolveProofFlowIds(projectRoot, options.flowIds);
        const reportPath = flowIds.length > 0 ? governanceAcceptanceReportPath(flowIds[0]!) : "docs/acceptance/<flowId>-report-vN.md";
        const governancePath = flowIds.length > 0 ? `docs/governance/verifier/${flowIds[0]}.md` : "docs/governance/verifier/<flowId>.md";
        const statusText = options.outcome !== undefined ? PROOF_STATUS_TEXT[options.outcome] ?? options.outcome : "已结束";
        task = [
          `[系统·治理反馈] 来自 ${displayName} 的验收状态（只含状态与报告指针；不转述报告正文）：`,
          `状态：${statusText}${flowIds.length > 0 ? `（流程 ${flowIds.join("、")}）` : ""}`,
          `报告路径：${reportPath}`,
          `治理记录：${governancePath}`,
          "请只向客户说明验收复核已结束与报告位置；不要转述报告内容，不要编辑/代批/改判验收结论，也不要把报告当作客户批准。验收卡与客户决定仍由应用/客户处理。",
        ].join("\n");
        const statusCode = options.outcome ?? "unknown";
        projection = {
          version: 1,
          kind: "governance-feedback",
          fingerprint: this.governanceProjectionFingerprint({
            sourceRoleId: roleId,
            statusCode,
            flowIds,
            reportPath,
            governancePath,
            text: task,
          }),
          sourceRole: { roleId, displayName },
          statusCode,
          statusText,
          ...(flowIds.length > 0 ? { flowIds } : {}),
          reportPath,
          governancePath,
          action: "report-ready",
        };
      } else {
        const chars = Array.from(text);
        body = chars.length > 4000 ? chars.slice(0, 4000).join("") : text;
        task = [
          `[系统·治理反馈] 来自 ${displayName} 的内部反馈（内部材料，请汇总后告知客户，不要逐字转述）：`,
          body,
          "请用 1-3 句话向客户汇总：完成了什么、是否有风险/阻塞、下一步或需要客户决定什么。不要逐字转述内部报告，不要使用内部行话，不要声称客户已批准。",
        ].join("\n");
        const hintedFlowIds = [...new Set((options.flowIds ?? []).filter((id): id is string => typeof id === "string" && id !== ""))].slice(0, 3);
        projection = {
          version: 1,
          kind: "governance-feedback",
          fingerprint: this.governanceProjectionFingerprint({
            sourceRoleId: roleId,
            statusCode: "internal-feedback",
            flowIds: hintedFlowIds,
            text: task,
          }),
          sourceRole: { roleId, displayName },
          statusCode: "internal-feedback",
          statusText: "内部反馈",
          ...(hintedFlowIds.length > 0 ? { flowIds: hintedFlowIds } : {}),
          action: "await-lead-summary",
        };
      }
      const opened = await this.openBackground({ projectRoot, roleId: primaryRoleId, runtime });
      if (!opened.ok) {
        diagnostic.error("governance.feedback.open.failed", new Error(opened.error ?? "无法开启主入口会话"), { targetRoleId: primaryRoleId });
        return;
      }
      // 治理反馈是**轮次状态镜像**而非应用任务：同文可在不同轮次重复出现（既有语义不变）——
      // 不生成稳定任务键，不参与「同一应用任务至多投递一次」的去重。
      const sent = await this.sendBackground({ projectRoot, roleId: primaryRoleId, runtime, text: task, stableIdentity: false });
      if (!sent.ok) {
        diagnostic.error("governance.feedback.dispatch.failed", new Error(sent.error ?? "治理反馈投递失败"), { targetRoleId: primaryRoleId });
        return;
      }
      // 2026-10-25 A3/A4：发送成功后登记客户投影；运行时把这条输入回显为 `prompt-input` 时，
      // 由事件消费循环按同一文本附到 `detail.clientProjection`（内部原文仍保留在 `detail.text`）。
      this.registerGovernanceClientProjection(projectRoot, primaryRoleId, runtime, task, projection);
      const mirroredChars = Array.from(body).length;
      // `targetRoleId`/`count`/`busy` 是共享白名单里的允许名（chars/roleId 本身不在白名单）。
      diagnostic.record(isProof ? "governance.feedback.pointer" : "governance.feedback.mirrored", {
        targetRoleId: primaryRoleId,
        chars: mirroredChars,
        count: mirroredChars,
        ...(sent.queued === true ? { busy: true } : {}),
      });
    } catch (error) {
      // 镜像/诊断失败绝不打断 settle。
      diagnostic.error("governance.feedback.failed", error);
    }
  }

  /**
   * Proof settle 的报告指针：优先用本轮投递 origin 的 flowId；缺失时按账本 verifier 派发记录取最近的
   * flow（有界；读不到 ⇒ 空集，只给通用目录指针）。**只读**，不猜验收结论、不伪造报告版本。
   */
  private resolveProofFlowIds(_projectRoot: string, hinted?: readonly string[]): string[] {
    return [...new Set((hinted ?? []).filter((id): id is string => typeof id === "string" && id !== ""))].slice(0, 3);
  }

  /** `mirrorGovernanceFeedback` 的 listing 查找：精确命中优先；miss 时按斜杠变体再查（仅查找，不改 key）。 */
  private findListingForFeedback(projectRoot: string): ProjectListing | undefined {
    const direct = this.deps.getListing(projectRoot);
    if (direct !== undefined) return direct;
    for (const variant of [projectRoot.replace(/\\/g, "/"), projectRoot.replace(/\//g, "\\")]) {
      if (variant === projectRoot) continue;
      const found = this.deps.getListing(variant);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  /** 角色显示名（listing 的 `displayName`；无则 roleId）——用于派发正文来源与治理反馈文案。 */
  private roleDisplayName(projectRoot: string, roleId: string): string {
    const listing = this.findListingForFeedback(projectRoot);
    const role = listing?.roles.find((r) => r.roleId === roleId);
    const name = (role as { displayName?: unknown } | undefined)?.displayName;
    return typeof name === "string" && name.trim() !== "" ? name.trim() : roleId;
  }

  /** 队列键：项目 × 目标角色（一套机对多个目标；空目标=主入口暂未枚举到——每次尝试时重解析）。 */
  private queueKey(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): string {
    return `${projectRoot}\u0000${targetRoleId}\u0000${runtime}`;
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
    const key = this.queueKey(projectRoot, targetRoleId, item.runtime);
    const q = this.deliveryQueues.get(key) ?? [];
    q.push({ ...item, enqueuedAt: new Date(this.now()).toISOString() }); // 入队时间**入队即定格**（显示用，非执行时间；经注入时钟——与看护同源）
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

  /** 原子写（tmp+rename，串行链）；失败只记诊断——绝不阻塞/翻转内存投递。 */
  private persistDeliveryQueues(): void {
    const storePath = this.deliveryQueueStorePath;
    if (storePath === undefined || !this.deliveryStoreArmed) return; // 恢复前禁止写（防覆盖磁盘待恢复项）
    let items: PersistedDeliveryItemV1[];
    try {
      items = this.deliveryStoreItems();
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.delivery" }).error("delivery.queue.persist.snapshot.failed", error);
      return;
    }
    const seq = ++this.deliveryPersistSeq;
    this.deliveryPersistChain = this.deliveryPersistChain
      .then(async () => {
        const tmp = `${storePath}.tmp-${process.pid}-${seq}`;
        try {
          await fs.promises.mkdir(path.dirname(storePath), { recursive: true, mode: 0o700 });
          await fs.promises.writeFile(tmp, JSON.stringify({ version: 1, items }), "utf8");
          await fs.promises.rename(tmp, storePath);
        } catch (error) {
          createDiagnosticLogger({ component: "desktop.delivery" }).error("delivery.queue.persist.failed", error);
          try { await fs.promises.rm(tmp, { force: true }); } catch { /* tmp 清理失败不阻断 */ }
        }
      })
      .catch(() => undefined); // 链永不 reject（前后写互不影响）
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
    const item: DeliveryItem = {
      kind,
      runtime,
      targetRoleId,
      sourceRoleId: typeof rawItem.sourceRoleId === "string" ? rawItem.sourceRoleId : "",
      text: rawItem.text,
      summary: typeof rawItem.summary === "string" ? rawItem.summary : "",
      dedupKey: rawItem.dedupKey,
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
        if (this.taskCreators.get(item.taskId) === undefined) {
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
    if (targetRoleId === "") return;
    const q = this.deliveryQueues.get(this.queueKey(projectRoot, targetRoleId, runtime)) ?? [];
    const entry = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, runtime));
    const busy = entry?.busy === true;
    const running = this.activeDeliveries.get(this.queueKey(projectRoot, targetRoleId, runtime));
    const view = (i: DeliveryItem) => ({ runtime: i.runtime, kind: i.kind, sourceRoleId: i.sourceRoleId, summary: i.summary, at: i.enqueuedAt, id: i.dedupKey, full: i.kind === "handback" ? i.safeText ?? mainT("main.session.safeCopyPending") : i.text });
    let contextInfo: Pick<OpenResult, "contextSource" | "contextWarning"> = {};
    if (entry) contextInfo = this.contextInfo(entry.handle);
    this.deps.emitRoleState?.({
      ...contextInfo,
      roleId: targetRoleId, projectRoot, runtime, profileRevision: entry?.profileRevision ?? this.profileRevision(runtime),
      busy,
      summaries: q.map((i) => i.summary),
      queue: q.map(view),
      running: running !== undefined && busy ? view(running) : null,
    });
  }

  /** 界面（重）加载后请求重放全部在场会话的角色状态快照：状态只在变化时外推，晚订阅的渲染侧否则会丢失忙/闲与队列。 */
  broadcastRoleStates(): void {
    for (const entry of this.sessions.values()) {
      this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
    }
  }

  private persistenceScope(entry: LiveSession): PersistenceScope { return { projectRoot: entry.projectRoot, roleId: entry.roleId, runtime: entry.runtime }; }
  private persistenceKey(scope: PersistenceScope, id: string): string { return `${scope.projectRoot}\0${scope.roleId}\0${scope.runtime}\0${id}`; }
  private displayHandback(event: HandbackEvent): DesktopOrchestrationEvent {
    const { handback: _internal, ...safe } = event;
    return { kind: 'handback', summary: event.report || event.liveReport ? safe.summary : mainT("ui.events.handbackLegacy"), ...(safe.report ? { report: safe.report } : {}), ...(safe.liveReport ? { liveReport: safe.liveReport } : {}), ...(safe.reportPersistence ? { reportPersistence: safe.reportPersistence } : {}) };
  }
  private mergeReportState(entry: LiveSession, event?: HandbackEvent, update?: ReportSaveStateV1, updatedId?: string): void {
    const id = updatedId ?? event?.reportPersistence?.reportId ?? event?.report?.reportId;
    if (!id) {
      const state = event?.reportPersistence?.state;
      const liveCompatible = state === 'disabled' || state === 'unknown-live' || state === undefined && entry.handle.persistenceMode !== 'enabled';
      if (event && liveCompatible) void this.handleHandback(entry.projectRoot, entry.runtime, event.handback, undefined, event.liveReport, state === 'unknown-live' ? 'unknown-live' : state === 'disabled' || entry.handle.persistenceMode === 'disabled' ? 'memory-only' : 'unknown-live', this.handbackFlowId(entry, event.handback));
      return;
    }
    const key = this.persistenceKey(this.persistenceScope(entry), id);
    this.knownReports.add(key);
    const record = this.reportStates.get(key) ?? { owner: entry, queued: false };
    if (record.owner !== entry && record.owner !== undefined) return;
    record.owner = entry;
    if (event) record.event = structuredClone(event);
    if (update && (record.state?.state !== 'saved' || update.state === 'saved' || update.state === 'expired')) record.state = structuredClone(update);
    else if (!update && event?.reportPersistence && (!record.state || event.reportPersistence.state === 'saved')) record.state = { state: event.reportPersistence.state === 'unknown-live' ? 'unsupported' : event.reportPersistence.state, reportId: id, ...(event.report ? { report: event.report } : {}), retryAvailable: event.reportPersistence.retryAvailable, ...(event.reportPersistence.code ? { code: event.reportPersistence.code } : {}) };
    if (record.state?.state === 'saved' && !record.state.report && event?.report) record.state = { ...record.state, report: event.report };
    if (record.state?.state === 'expired') record.event = undefined;
    this.reportStates.set(key, record);
    if (record.event && record.state?.state === 'saved' && record.state.report && !record.queued) {
      record.queued = true; // synchronous once gate, before handleHandback's first await
      void this.handleHandback(entry.projectRoot, entry.runtime, record.event.handback, record.state.report, record.event.liveReport, undefined, this.handbackFlowId(entry, record.event.handback));
    }
  }
  private rememberReceipt(entry: LiveSession, receipt: RuntimeDeliveryReceiptV1): void {
    const key = this.persistenceKey(this.persistenceScope(entry), receipt.attemptId);
    this.knownAttempts.add(key); this.attemptStates.set(key, { owner: entry, receipt });
  }
  registerPersistenceHistory(history: import('./runtime-history.ts').SessionHistoryView): void {
    const scope = { projectRoot: history.projectRoot, roleId: history.roleId, runtime: history.runtime };
    for (const report of history.reports ?? []) this.knownReports.add(this.persistenceKey(scope, report.reportId));
    for (const row of history.rows) {
      const id = row.deliveryReceipt?.attemptId ?? row.deliveryBoundary?.attemptId ?? row.inputProvenance?.attemptId;
      if (id) this.knownAttempts.add(this.persistenceKey(scope, id));
    }
  }
  async persistenceOperation<K extends keyof PersistenceValues>(scope: PersistenceScope, operation: K, id?: string): Promise<PersistenceReply<PersistenceValues[K]>> {
    const entry = this.sessions.get(this.sessionKey(scope.projectRoot, scope.roleId, scope.runtime));
    const failed = (code: 'SESSION_NOT_AVAILABLE' | 'SNAPSHOT_EXPIRED' | 'UNSUPPORTED'): PersistenceReply<PersistenceValues[K]> => ({ ok: false, version: 1, scope, code, message: code === 'SNAPSHOT_EXPIRED' ? mainT("main.session.saveSnapshotExpired") : mainT("main.session.saveUnsupported") });
    if (!entry) {
      const key = id ? this.persistenceKey(scope, id) : undefined;
      const known = key && (operation === 'retryReportSave' || operation === 'getReportSaveState' ? this.knownReports.has(key) : this.knownAttempts.has(key));
      return failed(known ? 'SNAPSHOT_EXPIRED' : 'SESSION_NOT_AVAILABLE');
    }
    const mode = entry.handle.persistenceMode ?? 'unknown-live';
    if (operation === 'getSessionPersistence') return { ok: true, version: 1, scope, value: { mode, reportSaveSupported: mode !== 'unknown-live' && !!entry.handle.retryReportPersistence, deliveryHistorySaveSupported: mode !== 'unknown-live' && !!entry.handle.retryDeliveryHistoryPersistence, querySupported: mode !== 'unknown-live' && !!entry.handle.getReportPersistence && !!entry.handle.getDeliveryReceipt } as PersistenceValues[K] };
    const key = this.persistenceKey(scope, id!);
    const source = operation === 'retryReportSave' || operation === 'getReportSaveState';
    if (!(source ? this.knownReports : this.knownAttempts).has(key)) return failed('SNAPSHOT_EXPIRED');
    if (mode === 'unknown-live') return failed('UNSUPPORTED');
    if (operation === 'retryReportSave' && this.reportStates.get(key)?.owner !== entry || operation === 'retryDeliveryHistorySave' && this.attemptStates.get(key)?.owner !== entry) return failed('SNAPSHOT_EXPIRED');
    const isRetry = operation === 'retryReportSave' || operation === 'retryDeliveryHistorySave';
    const work = async () => {
      let value: ReportSaveResultV1 | ReportSaveStateV1 | DeliverySaveResultV1 | DeliveryReceiptQueryV1 | undefined;
      if (operation === 'retryReportSave') value = await entry.handle.retryReportPersistence?.(id!);
      else if (operation === 'getReportSaveState') value = await entry.handle.getReportPersistence?.(id!);
      else if (operation === 'retryDeliveryHistorySave') value = await entry.handle.retryDeliveryHistoryPersistence?.(id!);
      else value = await entry.handle.getDeliveryReceipt?.(id!);
      if (this.sessions.get(this.sessionKey(scope.projectRoot, scope.roleId, scope.runtime)) !== entry) return failed('SNAPSHOT_EXPIRED');
      if (!value) return failed('UNSUPPORTED');
      if (operation === 'retryReportSave') {
        const result = value as ReportSaveResultV1;
        const state: ReportSaveStateV1 = result.ok ? { state: 'saved', reportId: result.report.reportId, report: result.report, retryAvailable: false } : { state: result.state, reportId: result.reportId ?? id, report: result.report, code: result.code, retryAvailable: result.retryAvailable };
        this.mergeReportState(entry, undefined, state, id);
      }
      if (operation === 'retryDeliveryHistorySave') { const receipt = (value as DeliverySaveResultV1).receipt; if (receipt) this.rememberReceipt(entry, receipt); }
      return { ok: true, version: 1, scope, value: value as PersistenceValues[K] } as PersistenceReply<PersistenceValues[K]>;
    };
    if (!isRetry) return work().catch(() => failed("UNSUPPORTED"));
    const inflightKey = operation + '\0' + key;
    const existing = this.persistenceInFlight.get(inflightKey); if (existing) return existing as Promise<PersistenceReply<PersistenceValues[K]>>;
    const promise = work().catch(() => failed("UNSUPPORTED")).finally(() => { if (this.persistenceInFlight.get(inflightKey) === promise) this.persistenceInFlight.delete(inflightKey); });
    this.persistenceInFlight.set(inflightKey, promise); return promise;
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

  private async handleHandback(projectRoot: string, runtime: RuntimeKind, hb: TaskHandback, report?: RuntimeReportSnapshotV1, liveReport?: RuntimeLiveReportViewV1, liveDurability?: 'memory-only' | 'unknown-live', flowId?: string): Promise<void> {
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: hb?.roleId });
    diagnostic.record("report.received", { outcome: hb?.status });
    try {
      if (!hb || typeof hb !== "object" || typeof (hb as { roleId?: unknown }).roleId !== "string") {
        this.emitDeliveryNote(projectRoot, runtime,
          this.handbackOwnerRoleId(projectRoot),
          mainT("main.common.unknownRole"),
          mainT("main.session.handbackMalformed")
        );
        return;
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
      const taskCreator = starTask ? this.taskCreators.get(hb.taskId!) : undefined;
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
        if (model !== "trio") return; // single/su：内置来源（su 自身）不自我回交（旧行为逐字不变）
        const leadRoleId = typeof listing?.primaryRoleId === "string" ? listing.primaryRoleId : "";
        if (leadRoleId === "") return; // 主入口未枚举到：不猜、不改投 Steward；settle 反馈同样按无 listing 跳过
        if (hb.roleId === leadRoleId) return; // Lead 自身不自我回交（防循环）
        targetRoleId = leadRoleId;
      } else if (ownerRoleId !== null && hb.roleId === ownerRoleId) {
        return; // single su 自身等防御（trio 的 Convener 走上方内置分支）
      }
      // BUG-5：任务已完成（已报告/已收口）后的重复回交不再入队/不再产生新的报告投递。
      if (starTask && typeof hb.taskId === "string" && hb.taskId !== "") {
        const record = (await this.readTasks(projectRoot)).records.get(hb.taskId);
        if (record !== undefined && (record.closed !== undefined || record.reports.length > 0)) {
          diagnostic.record("report.suppressed.task-terminal", {
            taskId: hb.taskId,
            closed: record.closed !== undefined,
            reports: record.reports.length,
          });
          return;
        }
      }
      const key = `${projectRoot}\u0000${runtime}\u0000${handbackKey(hb)}`;
      if (this.enqueuedHandbackKeys.has(key)) {
        diagnostic.record("report.duplicate");
        return;
      }
      this.enqueuedHandbackKeys.add(key);
      // B 批：工作结果事件（`task.reported`）——按 `taskId+turnId` 去重；写失败只诊断、不丢报告
      // （报告仍入投递机；任务状态读取侧重放坏行/缺事件时如实显示「已投递未登记」）。
      if (starTask && typeof hb.taskId === "string") {
        const reportKey = `${hb.taskId}\u0000${hb.turnId ?? createHash("sha256").update(hb.summary).digest("hex").slice(0, 16)}`;
        if (!this.reportedTaskKeys.has(reportKey)) {
          this.reportedTaskKeys.add(reportKey);
          const reportedAt = Date.parse(hb.at);
          const event = taskEvent("task.reported", {
            taskId: hb.taskId,
            from: hb.roleId,
            status: taskReportStatusOf(hb.status),
            summary: shortenSummary(hb.summary),
            ...(hb.evidence.length > 0 ? { evidence: hb.evidence.slice(0, 5) } : {}),
            ...(hb.turnId !== undefined && hb.turnId !== "" ? { turnId: hb.turnId } : {}),
          }, () => Number.isFinite(reportedAt) ? new Date(reportedAt) : new Date(this.now()));
          void this.appendTaskState(projectRoot, event);
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
        return;
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
      // 内置来源回交已投 Lead ⇒ 同一轮 settle 的治理反馈不再重复投（短时标记，见 mirrorGovernanceFeedback）。
      if (builtInSource && model === "trio") {
        this.governanceHandbackMirrored.set(this.queueKey(projectRoot, hb.roleId, runtime), this.now());
        diagnostic.record("report.routed.lead", { targetRoleId: targetRoleId ?? "" });
      }
      diagnostic.record("report.enqueued");
      await this.drainQueue(projectRoot, targetRoleId, runtime);
    } catch (err) {
      diagnostic.error("report.failed", err);
      // 兜底（belt & braces）：任何意外都如实拦截为系统行——**不产生未捕获拒绝**。
      this.emitDeliveryNote(projectRoot, runtime,
        this.handbackOwnerRoleId(projectRoot),
        mainT("main.common.unknownRole"),
        mainT("main.session.handbackException", { detail: err instanceof Error ? err.message : String(err) })
      );
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
  private async routeDispatch(projectRoot: string, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload): Promise<DispatchReceipt> {
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
      // 星形任务链（`tasks.jsonl`；不套旧 flow 派发门）；前置检查在 task.created 之前（F10）。
      return this.routeStarDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task);
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

    // 最新 D3（appointment 裁决）：request.created.flowId ↔ request.resolved（roster 字段优先；旧记录按目标集兼容）。
    const state = await this.readTasks(projectRoot);
    const requestFlows = new Map<string, string | undefined>();
    for (const event of state.events) {
      if (event.kind === "request.created") requestFlows.set(event.requestId, event.flowId);
    }
    let d3: { targetRoleIds: string[]; at: string; decisionId?: string } | undefined;
    for (const event of state.events) {
      if (event.kind !== "request.resolved") continue;
      const targets = Array.isArray(event.targetRoleIds)
        ? event.targetRoleIds.filter((id): id is string => typeof id === "string" && id !== "")
        : [];
      if (targets.length === 0) continue;
      const eventFlow = requestFlows.get(event.requestId);
      if (flowId !== undefined && eventFlow !== undefined && eventFlow !== flowId) continue;
      if (event.rosterVersion === undefined && event.rosterSha256 === undefined && eventFlow === undefined) continue;
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
  private async routeStarDispatch(
    projectRoot: string,
    runtime: RuntimeKind,
    fromRoleId: string,
    d: DispatchTaskPayload,
    targetRoleId: string,
    task: string,
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
    if (targetRoleId === fromRoleId || (chiefRoleId !== null && targetRoleId === chiefRoleId)) {
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

    // —— 2026-10-29（方案 v2.1 §5.1，F10）：M1–M8 机械前置必须发生在 newTaskId / task.created **之前** ——
    // 拒绝不产生任务行、不打开目标会话（chain-enforcement 负例断言 tasks.jsonl 行数不变）。
    // 先刷一次角色枚举：写卡/D3 后同轮派发要能看到新角色（与界面 listProject 同一缓存）。
    await this.refreshListingNow(projectRoot);
    const listingForPreflight = this.deps.getListing(projectRoot);
    const targetRole = listingForPreflight?.roles.find((role) => role.roleId === targetRoleId);
    const targetBuiltIn = targetRole?.builtIn === true || isBuiltInGovernanceRoleId(targetRoleId);
    const convenerRoleId = this.handbackOwnerRoleId(projectRoot);
    if (chiefRoleId === null) {
      return fail("派发未受理：未枚举到幕僚角色，无法建立任务。", "派发未受理：未枚举到幕僚角色。");
    }
    const chainFacts = await this.chainDispatchFacts(projectRoot, d?.flowId);
    const dispatchFlowId = d?.flowId ?? chainFacts.flowId;
    // M1（幕僚→产品）允许尚未写 flowId：仍先生成 pending draft；后续真实 flow 到达时领养同一 runId。
    const runFlowId = dispatchFlowId ?? (fromRoleId === chiefRoleId && targetRoleId === "product" ? RUN_PENDING_FLOW_ID : undefined);
    const handoffDispatch = fromRoleId === chiefRoleId && convenerRoleId !== null && targetRoleId === convenerRoleId;
    const hasLegacyFlowTask = dispatchFlowId !== undefined && [...state.records.values()].some(
      (record) => record.created?.flowId === dispatchFlowId && record.created.runId === undefined,
    );
    let runManifest: RunManifest | undefined;
    let runState: "draft" | "pinned" | "legacy" | undefined;
    let runRoster = chainFacts.roster;
    let d3Selected = chainFacts.d3Selected;
    if (runFlowId !== undefined) {
      const active = await findActiveRun(projectRoot, runFlowId);
      if (!active.ok) {
        return fail(`派发未受理：run 状态读取失败（${active.reason}）；未创建任务、未投递。`, "派发未受理：run 状态读取失败。");
      }
      if (active.manifest !== null) {
        runManifest = active.manifest;
        runState = active.manifest.state === "pinned" ? "pinned" : "draft";
      } else if (handoffDispatch || targetRoleId === "product" || targetRoleId === "rapporteur" || targetRoleId === "nominator") {
        const draft = await ensureDraftRun(projectRoot, runFlowId, new Date(this.now()));
        if (!draft.ok) {
          return fail(`派发未受理：draft run 创建失败（${draft.reason}）；未创建任务、未投递。`, "派发未受理：draft run 创建失败。");
        }
        runManifest = draft.manifest;
        runState = "draft";
      }
      if (runManifest !== undefined && runManifest.state === "pinned") {
        const verified = await verifyPinnedRun(projectRoot, runManifest);
        if (!verified.ok || verified.violations.length > 0) {
          const detail = verified.ok ? verified.violations.slice(0, 3).join("；") : verified.reason;
          return fail(`派发未受理：pinned run 文档 hash 校验失败（${detail}）；未创建任务、未投递。`, "派发未受理：pinned run 文档 hash 校验失败。");
        }
        const pinnedRoster = await loadPinnedRoster(projectRoot, runManifest);
        if (!pinnedRoster.ok) {
          return fail(`派发未受理：pinned run 文档校验失败（${pinnedRoster.reason}）；未创建任务、未投递。`, "派发未受理：pinned run 文档校验失败。");
        }
        runRoster = pinnedRoster;
        d3Selected = runManifest.d3?.targetRoleIds ?? d3Selected;
      }
    }
    const preflight = evaluateDispatchPreflight({
      fromRoleId,
      targetRoleId,
      targetBuiltIn,
      chiefRoleId,
      convenerRoleId,
      ...(chainFacts.flowId !== undefined ? { flowId: chainFacts.flowId } : {}),
      intent: chainFacts.intent,
      proposalFound: chainFacts.proposalFound,
      architectureFound: chainFacts.architectureFound,
      ...(runRoster !== undefined ? { roster: runRoster } : {}),
      d3Selected,
      ...(runManifest !== undefined && runState !== undefined
        ? { run: { state: runState, runId: runManifest.runId, ...(runManifest.roles !== undefined ? { roles: runManifest.roles } : {}) } }
        : hasLegacyFlowTask
          ? { run: { state: "legacy" as const } }
          : {}),
      ...(requestedModuleId !== undefined ? { moduleId: requestedModuleId } : {}),
      ...(requestedModulePaths !== undefined && requestedModulePaths.length > 0 ? { modulePaths: requestedModulePaths } : {}),
      handoffFound: chainFacts.handoffFound,
      ...(chainFacts.missingSelectedCardIds.length > 0 ? { missingSelectedCardIds: chainFacts.missingSelectedCardIds } : {}),
      targetCardFound:
        convenerRoleId !== null && targetRoleId === convenerRoleId
          ? chainFacts.selectedCardsFound
          : targetRole !== undefined,
    });
    if (!preflight.ok) {
      return fail(`派发未受理：${preflight.message}`, preflight.message, preflight.rejection);
    }
    // R9：旧版/已记录版本化文档被外部修改（shell/手动）⇒ 拒绝派发（fail-closed）。
    const baselineViolations = await verifyVersionedDocBaselines({ projectRoot });
    if (baselineViolations.length > 0) {
      const detail = baselineViolations
        .slice(0, 3)
        .map((violation) => `${violation.path}（${violation.reason === "missing" ? "缺失" : "被修改"}）`)
        .join("、");
      const rejection = makeMechanicalRejection(
        "versioned-doc-baseline-violation",
        baselineViolations.slice(0, 5).map((violation) => `${violation.path}（${violation.reason === "missing" ? "缺失" : "被修改"}）`),
        { docs: baselineViolations.slice(0, 5).map((violation) => violation.path), owner: "app" },
      );
      return fail(
        `派发未受理：版本化文档基线校验失败：${detail}${baselineViolations.length > 3 ? " 等" : ""}；` +
          "旧版只读，请从版本记录恢复或新建下一版本后重试。",
        "派发未受理：版本化文档基线校验失败（旧版只读）。",
        rejection,
      );
    }

    if (handoffDispatch) {
      if (runManifest === undefined || dispatchFlowId === undefined) {
        return fail("派发未受理：交付运营缺少 runId（应用应在 M1 前生成 draft run）；未创建任务、未投递。", "派发未受理：缺少 runId。");
      }
      if (runManifest.state === "pinned") {
        const verified = await verifyPinnedRun(projectRoot, runManifest);
        if (!verified.ok || verified.violations.length > 0) {
          const detail = verified.ok ? verified.violations.slice(0, 3).join("；") : verified.reason;
          return fail(`派发未受理：pinned run 文档 hash 校验失败（${detail}）；未创建交接任务、未投递。`, "派发未受理：pinned run 文档 hash 校验失败。");
        }
      } else {
        const pinned = await pinRun(projectRoot, runManifest.runId, {
          ...(chainFacts.d3DecisionId !== undefined && chainFacts.d3Selected.length > 0
            ? { d3: { decisionId: chainFacts.d3DecisionId, targetRoleIds: [...chainFacts.d3Selected] } }
            : {}),
        });
        if (!pinned.ok) {
          return fail(`派发未受理：run pin 失败（${pinned.reason}）；未创建交接任务、未投递。`, "派发未受理：run pin 失败（交付前必须先冻结契约）。");
        }
        runManifest = pinned.manifest;
        runState = "pinned";
        const pinnedRoster = await loadPinnedRoster(projectRoot, pinned.manifest);
        if (!pinnedRoster.ok) {
          return fail(`派发未受理：pinned run 文档校验失败（${pinnedRoster.reason}）；未创建交接任务、未投递。`, "派发未受理：pinned run 文档校验失败。");
        }
        const verifiedAfterPin = await verifyPinnedRun(projectRoot, pinned.manifest);
        if (!verifiedAfterPin.ok || verifiedAfterPin.violations.length > 0) {
          const detail = verifiedAfterPin.ok ? verifiedAfterPin.violations.slice(0, 3).join("；") : verifiedAfterPin.reason;
          return fail(`派发未受理：pin 后 run 文档校验失败（${detail}）；未创建交接任务、未投递。`, "派发未受理：pin 后 run 文档校验失败。");
        }
        runRoster = pinnedRoster;
        d3Selected = pinned.manifest.d3?.targetRoleIds ?? d3Selected;
      }
    }
    const taskId = newTaskId(new Date(this.now()));
    const createdAt = new Date(this.now());
    // 2026-10-29（v2.6/R2）：任务模块以**名单模块**为准落盘（模型自报目录仅用于核对，不落盘）。
    const rosterForModule = runRoster !== undefined && runRoster.ok === true ? runRoster.roster : undefined;
    const taskModule =
      requestedModuleId !== undefined && rosterForModule !== undefined
        ? rosterForModule.modules.find((module) => module.id === requestedModuleId)
        : undefined;
    // 交付任务固定 stepId=project-handoff（M6/M7 的机械前置依据）；其余任务可带模型声明的 stepId。
    const dispatchStepId =
      fromRoleId === chiefRoleId && convenerRoleId !== null && targetRoleId === convenerRoleId
        ? "project-handoff"
        : typeof d?.stepId === "string" && d.stepId.trim() !== ""
          ? d.stepId.trim()
          : undefined;
    const created = taskEvent("task.created", {
      taskId,
      from: fromRoleId === convenerRoleId ? "convener" : "chief",
      ...(chainFacts.flowId !== undefined ? { flowId: chainFacts.flowId } : {}),
      ...(dispatchStepId !== undefined ? { stepId: dispatchStepId } : {}),
      ...(taskModule !== undefined ? { moduleId: taskModule.id, moduleDirectory: taskModule.path, modulePaths: [...taskModule.paths] } : {}),
      to: targetRoleId,
      text: task,
      ...(runManifest !== undefined && runState !== undefined
        ? {
            runId: runManifest.runId,
            runState,
            ...(runManifest.stage?.current !== undefined ? { runStage: runManifest.stage.current } : {}),
          }
        : {}),
      ...(expectedOutput !== undefined ? { expectedOutput } : {}),
      ...(requestedEvidence !== undefined ? { requestedEvidence } : {}),
      sideEffect,
      idempotencyKey,
    }, () => createdAt);
    if (!(await this.appendTaskState(projectRoot, created))) {
      return fail(
        "派发未受理：任务状态登记写入失败——**未投递**；请稍后重试（不自称已送达）。",
        "派发未受理：任务状态登记写入失败——**未投递**（不静默）。",
      );
    }
    this.starTaskIds.add(taskId);
    this.taskCreators.set(taskId, fromRoleId === this.handbackOwnerRoleId(projectRoot) ? "convener" : "chief");
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
      await this.appendTaskState(projectRoot, taskEvent("task.closed", {
        taskId,
        by: fromRoleId === this.handbackOwnerRoleId(projectRoot) ? "convener" : "chief",
        outcome: "rejected",
        note: `delivery-rejected: ${shortenSummary(plan.message)}`,
      }, () => new Date(this.now())));
      return fail(plan.message, plan.systemRow);
    }
    // 目标已有活会话 ⇒ 按其真实引擎投递（不让幕僚会话的引擎选择串到目标）。
    // 2026-10-29（BUG-5）：目标**无活会话**时先同步 open/resume；失败则拒发并给派发者回执，
    // 绝不再把任务静默留在队列里等一个可能永远不会出现的“下次时机”。
    let deliveryRuntime = this.findLiveRuntime(projectRoot, targetRoleId) ?? runtime;
    if (!this.sessions.has(this.sessionKey(projectRoot, targetRoleId, deliveryRuntime))) {
      const opened = await this.openInternal({ projectRoot, roleId: targetRoleId, runtime: deliveryRuntime }, false);
      if (!opened.ok) {
        await this.appendTaskState(projectRoot, taskEvent("task.closed", {
          taskId,
          by: fromRoleId === this.handbackOwnerRoleId(projectRoot) ? "convener" : "chief",
          outcome: "rejected",
          note: `delivery-target-open-failed: ${shortenSummary(opened.error ?? mainT("shared.common.unknownReason"))}`,
        }, () => new Date(this.now())));
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
    return {
      ok: true,
      message:
        mainT("main.session.acceptedTask", {
          to: this.roleDisplayName(projectRoot, targetRoleId),
          openNote,
          from: this.roleDisplayName(projectRoot, fromRoleId),
        }) + `任务编号：#${taskId}（sideEffect=${sideEffect}；受理 ≠ 完成）。`,
    };
  }

  // —————————————— G-2（2026-10-16 客户批准）：看护数据面 / 系统投递 / 恢复执行桥 ——————————————
  //
  // 设计 `2026-10-16_design_role-watchdog-and-closure.md`（W1 快照与观察、W2 system 投递、W4 恢复执行桥、
  // W5 恢复确认桥）。**一条原则**：本段全部是「读快照＋经既有投递机投文本＋（客户一键确认后）复用既有
  // 人工动作」——不写项目文件、不放行任何命令/写入、不改任何 gate/队列语义；一切失败路径 fail-closed
  // （最坏情形退化为「没有看护时的现状」）。

  /** **同源看护快照**（W1）：全部直读本层内存结构（busy/队列/在途/链/pending）——**不造第二数据源**、
   *  同步读、不引锁（JS 单线程 tick 内读完）。项目未知且无任何运行态 ⇒ undefined（看护跳过）。 */
  watchdogSnapshot(projectRoot: string): WatchdogProjectSnapshot | undefined {
    if (typeof projectRoot !== "string" || projectRoot === "") return undefined;
    const hasSessions = [...this.sessions.values()].some((entry) => entry.projectRoot === projectRoot);
    const hasQueues = [...this.deliveryQueues.entries()].some(([key, items]) => key.startsWith(`${projectRoot}\u0000`) && items.length > 0);
    const listing = this.deps.getListing(projectRoot);
    if (!listing && !hasSessions && !hasQueues) return undefined;
    const roles: WatchdogProjectSnapshot["roles"] = [];
    for (const entry of this.sessions.values()) {
      if (entry.projectRoot !== projectRoot) continue;
      const listingRole = listing?.roles.find((role) => role.roleId === entry.roleId);
      const activity = this.lastRoleActivity.get(`${projectRoot}\u0000${entry.roleId}`);
      const running = this.activeDeliveries.get(this.queueKey(projectRoot, entry.roleId, entry.runtime));
      roles.push({
        roleId: entry.roleId,
        runtime: entry.runtime,
        busy: entry.busy,
        ...(entry.busy && typeof entry.busySince === "number" ? { turnStartedAt: entry.busySince } : {}),
        ...(entry.origins.running?.turnId !== undefined ? { turnId: entry.origins.running.turnId } : {}),
        ...(listingRole?.builtIn === true ? { builtIn: true } : {}),
        ...(running?.taskId !== undefined ? { taskId: running.taskId } : {}),
        ...(activity !== undefined ? { lastActivityAt: activity.at, lastAction: `${activity.kind}：${activity.summary}` } : {}),
      });
    }
    const queues: WatchdogProjectSnapshot["queues"] = [];
    for (const [key, items] of this.deliveryQueues) {
      if (items.length === 0) continue;
      const parts = key.split("\u0000");
      if (parts[0] !== projectRoot) continue;
      queues.push({
        targetRoleId: parts[1] ?? "",
        runtime: (parts[2] as RuntimeKind) ?? "pi",
        items: items.map((item) => {
          const parsed = Date.parse(item.enqueuedAt);
          return { kind: item.kind, dedupKey: item.dedupKey, sourceRoleId: item.sourceRoleId, summary: item.summary, enqueuedAtMs: Number.isFinite(parsed) ? parsed : this.now() };
        }),
      });
    }
    let activeDeliveries = 0;
    for (const key of this.activeDeliveries.keys()) if (key.startsWith(`${projectRoot}\u0000`)) activeDeliveries += 1;
    let chainsActive = false;
    for (const key of this.openChains.keys()) if (key.startsWith(`${projectRoot}\u0000`)) { chainsActive = true; break; }
    if (!chainsActive) for (const key of this.rebuildChains.keys()) if (key.startsWith(`${projectRoot}\u0000`)) { chainsActive = true; break; }
    const pending = this.deps.watchdogPendingConfirmations?.() ?? { total: 0, byRole: new Map<string, number>() };
    return {
      projectRoot,
      // 评审 §5.6：`suRoleId` → `governanceRoleId`（值=回交主人：trio=Convener / single=主入口）。
      governanceRoleId: this.handbackOwnerRoleId(projectRoot),
      // B 批：真实幕僚（trio chief）——巡检消息由 watchdogDeliver 投它；旧 liaison 别名不算。
      chiefRoleId: this.chiefTaskRoleIdOf(projectRoot),
      roles,
      queues,
      activeDeliveries,
      chainsActive,
      pendingConfirmationsTotal: pending.total,
      pendingConfirmationsByRole: pending.byRole,
    };
  }

  /** 有运行态的项目根（活会话 ∪ 非空队列）——看护的服务对象之一（Interface 再并入已导入项目）。 */
  projectRootsWithActivity(): string[] {
    const roots = new Set<string>();
    for (const entry of this.sessions.values()) roots.add(entry.projectRoot);
    for (const [key, items] of this.deliveryQueues) if (items.length > 0) roots.add(key.split("\u0000")[0] ?? "");
    roots.delete("");
    return [...roots];
  }

  /** 某角色**最近一轮终局**（W1 的 `lastTurn` 小状态；纯读。消费方：role_status 等只读面）。 */
  lastTurnOf(projectRoot: string, roleId: string, runtime: RuntimeKind): { outcome: RuntimeTurnOutcome; at: string } | undefined {
    return this.lastTurns.get(this.queueKey(projectRoot, roleId, runtime));
  }

  /**
   * **系统消息投递**（W2）：看护的告警/收束/恢复回执经**同一套投递机**真投递给**回交主人**（评审 §5.6：
   * trio=Convener；single=su）——忙时排队、未开自动开、失败保留重试全部复用（`kind:"system"`；来源标注
   * 恒空——呈现层按文首 `[系统·<子类>] ` 定格标记归类）。主人未枚举到 ⇒ 入 `""` 目标队列（投递机既有的
   * 一次性提示 + 保留待重试；**绝不静默丢**）。
   */
  watchdogDeliver(projectRoot: string, message: { text: string; summary: string; dedupKey: string }): void {
    // B 批：看护/巡检系统消息回幕僚（trio）；无幕僚（single/旧项目）保持原主人。
    const governanceRoleId = this.chiefTaskRoleIdOf(projectRoot) ?? this.handbackOwnerRoleId(projectRoot);
    let runtime: RuntimeKind | undefined;
    if (governanceRoleId !== null) {
      for (const entry of this.sessions.values()) {
        if (entry.projectRoot === projectRoot && entry.roleId === governanceRoleId) { runtime = entry.runtime; break; }
      }
    }
    if (runtime === undefined) runtime = this.lastGovernanceRuntime.get(projectRoot) ?? "pi";
    const target = governanceRoleId ?? "";
    this.enqueueDelivery(projectRoot, target, {
      kind: "system",
      runtime,
      targetRoleId: target,
      sourceRoleId: "", // U1 已落树契约：system 来源标注恒空（「系统」非角色）——不得填假角色
      text: message.text,
      summary: message.summary,
      dedupKey: message.dedupKey,
    });
    void this.drainQueue(projectRoot, governanceRoleId, runtime);
  }

  /**
   * **`rebuild-session` 恢复动作**（W4，2026-10-16 客户批准；设计 §6.3）——新公共入口：
   * dispose＋重开（保留 ANS 回放；F-5-opt1 注记适用）；**在跑轮次不打断**（busy ⇒ 拒绝并如实回执）。
   * 与陈旧重建（O-1）同链串行（`rebuildChains` 按会话键——同一角色至多一个重建在跑）。
   */
  async rebuildSession(target: string | SessionTarget): Promise<RebuildSessionResult> {
    const key = this.targetKey(target);
    if (key === undefined) return { ok: false, error: mainT("main.session.recoveryNoMatch") };
    const prev = this.rebuildChains.get(key) ?? Promise.resolve();
    const run = prev.then(() => this.rebuildSessionUnsafe(key));
    const tail = run.then(() => undefined, () => undefined);
    this.rebuildChains.set(key, tail);
    void tail.then(() => {
      if (this.rebuildChains.get(key) === tail) this.rebuildChains.delete(key);
    });
    return await run;
  }

  /** `rebuildSession` 的链内实现（同 `rebuildIfBoundaryStaleUnsafe` 同款步骤，**去掉陈旧判据**——手动触发）。 */
  private async rebuildSessionUnsafe(key: string): Promise<RebuildSessionResult> {
    const entry = this.sessions.get(key);
    if (!entry) return { ok: false, error: mainT("main.session.recoveryNoSession") };
    if (entry.busy) return { ok: false, error: mainT("main.session.recoveryBusy") };
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
    const reopened = await this.openInternalUnsafe({ projectRoot, roleId, runtime }, true, selectionVersion, true);
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

  /**
   * ### 裁定④（G-4）：「su 当前轮次是否由**客户消息**发起」——安装/卸载护栏的唯一判据
   * （设计 §6.4：「桌面 handler 读该角色当前 `activeDeliveries` 的 kind 即可判定」）。三态：
   * · 该会话有在跑投递条目：`kind === "message"`（忙时排队的客户消息投出的一轮）⇒ 是；
   *   `handback` / `dispatch` / `system`（回交验收/派发/看护系统消息等打开的一轮）⇒ 否；
   * · 无在跑投递条目：**只有直接 `send`** 开跑的轮次如此（其唯一调用方＝客户聊天 `sendSession`）⇒ 是；
   * · 会话不在 / 不在轮次中（防御——工具只可能在轮次内被调用）⇒ 否。
   */
  private isCustomerInitiatedTurn(projectRoot: string, runtime: RuntimeKind, roleId: string): boolean {
    const entry = this.sessions.get(this.sessionKey(projectRoot, roleId, runtime));
    if (!entry || entry.busy !== true) return false;
    const active = this.activeDeliveries.get(this.queueKey(projectRoot, roleId, runtime));
    return active === undefined || active.kind === "message";
  }

  /**
   * **激活共用件**（⑥；技能与外来 MCP 两族 handler 同款）：复用既有 `rebuildSession`（串行链＋在跑
   * 拒绝＋三态），**不打断**任何在跑轮次。返回：
   * · `{effective:"rebuilt"}`＝目标 idle、已重建（即刻生效）；
   * · `{effective:"next-session", note?}`＝如实延迟态（在跑 ⇒ 无 note；**无会话** ⇒ note 说明「并非在跑
   *   轮次」——无旧上下文可重建、**绝不自动开目标会话**（激活≠开户））；
   * · `{effective:"next-session", error}`＝重开失败（调用方按各自登记面组成 `rebuild-failed` 回执——
   *   登记/声明仍在，**不假装已生效**）。竞态（检查后目标开跑一轮）按其如实延迟、不报失败。
   */
  private async activateRoleRefresh(projectRoot: string, runtime: RuntimeKind, roleId: string): Promise<{ effective: "rebuilt" | "next-session"; note?: string; error?: string }> {
    const targetSessionKey = this.sessionKey(projectRoot, roleId, runtime);
    const targetEntry = this.sessions.get(targetSessionKey);
    if (!targetEntry) {
      return { effective: "next-session", note: mainT("main.session.configNextSession") };
    }
    if (targetEntry.busy) return { effective: "next-session" }; // 在跑轮次不打断（沿 G-2 语义）；本次回执如实延迟
    const rebuilt = await this.rebuildSession({ projectRoot, roleId, runtime });
    if (rebuilt.ok) return { effective: "rebuilt" };
    if (this.sessions.get(targetSessionKey)?.busy === true) return { effective: "next-session" }; // 竞态：检查后开跑——不报失败
    return { effective: "next-session", error: rebuilt.error ?? mainT("shared.common.unknownReason") };
  }

  /**
   * `install_skill` / `uninstall_skill` 的共用实现（注入能力侧；回执形状冻结——`model/runtime.ts`）。
   * 分支顺序（一切失败都先于任何副作用）：
   * ① 护栏（`not-customer-turn`）→ ② 载荷防御 → ③ 目标角色（`role-not-found`）→ ④ 登记（`not-registered`
   * / `role-not-listed`；卸载登记未变 ⇒ `registration-unchanged`）→ ⑤ 内容件与运行期哈希（缺件 ⇒
   * `not-registered` 类如实）→ ⑥ 激活（`rebuilt` / `next-session`；重建失败 ⇒ `rebuild-failed`）→
   * ⑦ 回执 ＋ `[系统·安装]` 系统行 ＋ 诊断。
   */
  private async applySkillChange(
    action: "installed" | "uninstalled",
    projectRoot: string,
    runtime: RuntimeKind,
    callerRoleId: string,
    d: InstallSkillPayload,
  ): Promise<InstallSkillReceipt> {
    const acting = action === "installed";
    const verb = acting ? mainT("main.session.install.verbInstall") : mainT("main.session.install.verbUninstall");
    const toolName = acting ? "install_skill" : "uninstall_skill";
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: callerRoleId });
    const refuse = (reason: string, message: string): InstallSkillReceipt => {
      diagnostic.record("skill.refused", { toolName, targetRoleId: typeof d?.roleId === "string" ? d.roleId : "", reasonCode: reason });
      return { ok: false, reason, message };
    };

    // ① 裁定④ 轮次护栏（**先判**；拒绝零副作用——不触目标、不读登记、不投系统行）。
    if (!this.isCustomerInitiatedTurn(projectRoot, runtime, callerRoleId)) {
      return refuse("not-customer-turn", mainT("main.session.install.notCustomerTurn"));
    }

    // ② 载荷防御（模型输入不可信——本层全量重校验，不依赖工具层的参数校验）。
    const roleId = typeof d?.roleId === "string" ? d.roleId.trim() : "";
    const name = typeof d?.name === "string" ? d.name.trim() : "";
    if (roleId === "") return refuse("role-not-found", mainT("main.session.install.roleNotFound", { roleId }));
    if (name === "") return refuse("not-registered", mainT("main.session.install.skillNotRegistered", { name, verb }));

    // ③ 目标角色须是**本项目项目角色**（非内置治理角色 su 自身/同类）；缓存 miss ⇒ 实时重枚举一次
    //   （首轮寻址先例：`routeDispatch` / `proposeRecovery` 同款——新建角色同轮安装不误拒）。
    const findTarget = (): { builtIn?: boolean } | undefined => {
      const listing = this.deps.getListing(projectRoot);
      return listing ? listing.roles.find((r) => r.roleId === roleId) : undefined;
    };
    let target = findTarget();
    if (!target && this.deps.refreshListing) {
      try {
        await this.deps.refreshListing(projectRoot);
      } catch {
        // 重枚举失败（读盘竞态等）：按原 miss 口径如实拒绝，不上抛。
      }
      target = findTarget();
    }
    if (!target || target.builtIn === true || isBuiltInGovernanceRoleId(roleId)) {
      return refuse("role-not-found", mainT("main.session.install.roleNotFound", { roleId }));
    }

    // ④ 登记校验（**唯一来源**＝编排 `readSkillRegistration`——与渲染器坏件集逐字同口径，绝不复制解析）。
    const registration = readSkillRegistration(projectRoot, name);
    if (registration === undefined) {
      return refuse(
        "not-registered",
        acting
          ? mainT("main.session.install.skillNotRegisteredInstall", { name })
          : mainT("main.session.install.skillNotRegisteredUninstall", { name }),
      );
    }
    if (acting) {
      if (!registration.roles.includes(roleId)) {
        return refuse("role-not-listed", mainT("main.session.install.roleNotListed", { roleId }));
      }
      if (registration.status !== "installed") {
        return refuse(
          "not-registered",
          mainT("main.session.install.skillStatus", { name, status: registration.status }),
        );
      }
    } else if (registration.status === "installed" && registration.roles.includes(roleId)) {
      // 卸载专有两钉之一：**先改登记再卸载**——登记仍含角色即拒绝（防「工具说撤了、登记没变」）。
      return refuse("registration-unchanged", mainT("main.session.install.registrationUnchanged", { roleId }));
    }

    // ⑤ 内容件存在性与运行期哈希（sha256 **原始字节**——复用 `filePrint` 缓存件；与渲染器/`finalize.ts`
    //   同算法：「哈希只能由代码算」）。缺件 ⇒ 如实拒绝（回执冻形要求 `path`＋`digest`——不拿哨兵充数）。
    const skillRel = `docs/skills/${name}/SKILL.md`;
    const digest = await filePrint(path.join(projectRoot, "docs", "skills", name, "SKILL.md"));
    if (digest === "<missing>") {
      return refuse(
        "not-registered",
        acting
          ? mainT("main.session.install.skillMissing", { path: skillRel })
          : mainT("main.session.install.skillMissingUninstall", { path: skillRel }),
      );
    }

    // ⑥ 激活（共用件 `activateRoleRefresh`——复用既有 `rebuildSession` 三态，两族 handler 同款）：
    //    idle ⇒ rebuilt（即刻生效）；在跑 ⇒ next-session（如实延迟态，**不是错误**——settle 后靠既有
    //    检查点（含裁定⑤ 指纹）收敛）；无会话 ⇒ next-session（无旧上下文可重建）；重开失败 ⇒
    //    rebuild-failed（登记仍在，**不假装已生效**）。
    const activation = await this.activateRoleRefresh(projectRoot, runtime, roleId);
    if (activation.error !== undefined) {
      diagnostic.error("skill.rebuild.failed", new Error(activation.error), { toolName, targetRoleId: roleId });
      return {
        ok: false,
        reason: "rebuild-failed",
        message: mainT("main.session.install.rebuildFailed", { action: acting ? "变更" : "撤销", roleId, detail: activation.error }),
      };
    }
    const effective = activation.effective;
    const note = activation.note;

    // ⑦ 如实回执（冻形）＋ `[系统·安装]` 定格系统行（`kind:"system"` 第四类通道真投递给 su——忙时排队、
    //    未开自动开、失败保留重试全复用；不可撤回）＋诊断。**不写盘、不放行任何写入、不改任何写边界**。
    const effectivePhrase =
      effective === "rebuilt"
        ? mainT("main.session.install.effectiveRebuilt")
        : note !== undefined
          ? mainT("main.session.install.effectiveNextSession")
          : mainT("main.session.install.effectiveAfterTurn");
    const shortDigest = digest.slice(0, 12);
    const rowText = acting
      ? `${CAPABILITY_INSTALL_SYSTEM_PREFIX} ${mainT("main.session.install.installedSkill", { name, roleId, effective: effectivePhrase, path: skillRel, digest: shortDigest })}`
      : `${CAPABILITY_INSTALL_SYSTEM_PREFIX} ${mainT("main.session.install.uninstalledSkill", { name, roleId, path: skillRel, digest: shortDigest, effective: effectivePhrase })}`;
    this.watchdogDeliver(projectRoot, {
      text: rowText,
      summary: mainT("main.session.install.summarySkill", { verb, name, roleId, effectiveShort: effective === "rebuilt" ? mainT("main.session.install.effectiveShortRebuilt") : mainT("main.session.install.effectiveShortNextSession") }),
      // 命名空间同看护（`watchdog\0…`——与回交/派发键隔离）；每条动作独立（重装/重卸是合法事件，不去重）。
      dedupKey: `watchdog\u0000${projectRoot}\u0000install-row\u0000${randomUUID()}`,
    });
    diagnostic.record(acting ? "skill.installed" : "skill.uninstalled", { toolName, targetRoleId: roleId, path: skillRel, state: effective });
    return {
      ok: true,
      action,
      roleId,
      name,
      path: skillRel,
      digest,
      effective,
      ...(note !== undefined ? { note } : {}),
    };
  }

  // —————————————— G-4 V2（2026-10-16 客户批准）：外来 MCP 安装/卸载 handler ——————————————
  //
  // 与技能两工具**逐字同构**（护栏/载荷/角色/激活共用件全同；仅校验面＝MCP 声明、名词与诚实面不同）。
  // **工具不写盘**——声明落盘永远由 su 的 `write_file` 完成（「先落盘再激活」）；失败一律 fail-closed＝
  // **未执行、零副作用**。**诚实面（不得宣称逐调用受审，§5.3）**：外来 MCP 工具在 ANS 门禁之外执行
  // （server 进程内）＝**能力级授予**；安装/卸载**不改变任何角色的写边界**。卸载＝**下次会话摘除**
  // （server 进程随会话消亡、零平台残留）、**已发生的副作用不可撤**；**声明文件保留**（「效果已撤」与
  // 「文件仍在」如实二分）。

  /**
   * `install_mcp` / `uninstall_mcp` 的共用实现（注入能力侧；回执形状冻结——`model/runtime.ts`，沿技能版
   * 体格）。分支顺序同技能版：① 护栏（`not-customer-turn`）→ ② 载荷防御 → ③ 目标角色（`role-not-found`）
   * → ④ 声明（唯一来源＝运行时核心 `readMcpDeclaration`，**不复制解析逻辑**：`not-registered`／
   * `role-not-listed`；卸载声明未变 ⇒ `registration-unchanged`）→ ⑤ 声明文件与运行期哈希（缺件 ⇒
   * `not-registered` 类如实）→ ⑥ 激活（共用 `activateRoleRefresh`：`rebuilt`／`next-session`／
   * `rebuild-failed`）→ ⑦ 回执 ＋ `[系统·安装]` 系统行 ＋ 诊断。
   */
  private async applyMcpChange(
    action: "installed" | "uninstalled",
    projectRoot: string,
    runtime: RuntimeKind,
    callerRoleId: string,
    d: InstallMcpPayload,
  ): Promise<InstallMcpReceipt> {
    const acting = action === "installed";
    const verb = acting ? mainT("main.session.install.verbInstall") : mainT("main.session.install.verbUninstall");
    const toolName = acting ? "install_mcp" : "uninstall_mcp";
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: callerRoleId });
    const refuse = (reason: string, message: string): InstallMcpReceipt => {
      diagnostic.record("mcp.refused", { toolName, targetRoleId: typeof d?.roleId === "string" ? d.roleId : "", reasonCode: reason });
      return { ok: false, reason, message };
    };

    // ① 裁定④ 轮次护栏（**先判**；与技能两工具同判据同文案）。
    if (!this.isCustomerInitiatedTurn(projectRoot, runtime, callerRoleId)) {
      return refuse("not-customer-turn", mainT("main.session.install.notCustomerTurn"));
    }

    // ② 载荷防御（模型输入不可信——本层全量重校验）。
    const roleId = typeof d?.roleId === "string" ? d.roleId.trim() : "";
    const name = typeof d?.name === "string" ? d.name.trim() : "";
    if (roleId === "") return refuse("role-not-found", mainT("main.session.install.roleNotFound", { roleId }));
    if (name === "") return refuse("not-registered", mainT("main.session.install.mcpNotRegistered", { name, verb }));

    // ③ 目标角色须是**本项目项目角色**（非内置治理角色 su 自身/同类）；缓存 miss ⇒ 实时重枚举一次
    //   （与技能版同口径；首轮寻址先例）。
    const findTarget = (): { builtIn?: boolean } | undefined => {
      const listing = this.deps.getListing(projectRoot);
      return listing ? listing.roles.find((r) => r.roleId === roleId) : undefined;
    };
    let target = findTarget();
    if (!target && this.deps.refreshListing) {
      try {
        await this.deps.refreshListing(projectRoot);
      } catch {
        // 重枚举失败（读盘竞态等）：按原 miss 口径如实拒绝，不上抛。
      }
      target = findTarget();
    }
    if (!target || target.builtIn === true || isBuiltInGovernanceRoleId(roleId)) {
      return refuse("role-not-found", mainT("main.session.install.roleNotFound", { roleId }));
    }

    // ④ 声明校验（**唯一来源**＝运行时核心 `readMcpDeclaration`——与装配列表函数逐字同口径，绝不复制解析）。
    const declaration = readMcpDeclaration(projectRoot, name);
    if (declaration === undefined) {
      return refuse(
        "not-registered",
        acting
          ? mainT("main.session.install.mcpNotRegisteredInstall", { name })
          : mainT("main.session.install.mcpNotRegisteredUninstall", { name }),
      );
    }
    if (acting) {
      if (!declaration.roles.includes(roleId)) {
        return refuse("role-not-listed", mainT("main.session.install.roleNotListed", { roleId }));
      }
      if (declaration.status !== "installed") {
        return refuse(
          "not-registered",
          mainT("main.session.install.mcpStatus", { name, status: declaration.status }),
        );
      }
    } else if (declaration.status === "installed" && declaration.roles.includes(roleId)) {
      // 卸载专有两钉之一：**先改声明再卸载**——声明仍含角色即拒绝（防「工具说撤了、声明没变」）。
      return refuse("registration-unchanged", mainT("main.session.install.registrationUnchanged", { roleId }));
    }

    // ⑤ 声明文件存在性与运行期哈希（sha256 **原始字节**——复用 `filePrint`；与技能版同算法）。缺件 ⇒
    //   如实拒绝（回执冻形要求 `path`＋`digest`；卸载须能如实作「文件保留」陈述——不拿哨兵充数）。
    const declarationRel = `docs/mcp/${name}.md`; // ＝视图 `declaration.path` 同口径（回执/诊断同一路径）
    const digest = await filePrint(path.join(projectRoot, "docs", "mcp", `${name}.md`));
    if (digest === "<missing>") {
      return refuse(
        "not-registered",
        acting
          ? mainT("main.session.install.mcpDeclarationMissing", { path: declarationRel })
          : mainT("main.session.install.mcpDeclarationMissingUninstall", { path: declarationRel }),
      );
    }

    // ⑥ 激活（共用件 `activateRoleRefresh`——同技能版三态与竞态语义）。
    const activation = await this.activateRoleRefresh(projectRoot, runtime, roleId);
    if (activation.error !== undefined) {
      diagnostic.error("mcp.rebuild.failed", new Error(activation.error), { toolName, targetRoleId: roleId });
      return {
        ok: false,
        reason: "rebuild-failed",
        message: mainT("main.session.install.mcpRebuildFailed", { action: acting ? "变更" : "撤销", roleId, detail: activation.error }),
      };
    }
    const effective = activation.effective;
    const note = activation.note;

    // ⑦ 如实回执（冻形）＋ `[系统·安装]` 定格系统行（同技能版：kind:"system" 第四类通道真投递给 su——
    //    不可撤回）＋诊断。**不写盘、不放行任何写入、不改任何写边界**；诚实面（门禁之外执行＝能力级
    //    授予，**非逐调用受审**）写进系统行（不得宣称受审）。
    const effectivePhrase =
      effective === "rebuilt"
        ? mainT("main.session.install.effectiveRebuilt")
        : note !== undefined
          ? mainT("main.session.install.effectiveNextSession")
          : mainT("main.session.install.effectiveAfterTurn");
    const shortDigest = digest.slice(0, 12);
    const rowText = acting
      ? `${CAPABILITY_INSTALL_SYSTEM_PREFIX} ${mainT("main.session.install.installedMcp", { name, roleId, effective: effectivePhrase, path: declarationRel, digest: shortDigest })}`
      : `${CAPABILITY_INSTALL_SYSTEM_PREFIX} ${mainT("main.session.install.uninstalledMcp", { name, roleId, path: declarationRel, digest: shortDigest, effective: effectivePhrase })}`;
    this.watchdogDeliver(projectRoot, {
      text: rowText,
      summary: mainT("main.session.install.summaryMcp", { verb, name, roleId, effectiveShort: effective === "rebuilt" ? mainT("main.session.install.effectiveShortRebuilt") : mainT("main.session.install.effectiveShortNextSession") }),
      dedupKey: `watchdog\u0000${projectRoot}\u0000mcp-install-row\u0000${randomUUID()}`,
    });
    diagnostic.record(acting ? "mcp.installed" : "mcp.uninstalled", { toolName, targetRoleId: roleId, path: declarationRel, state: effective });
    return {
      ok: true,
      action,
      roleId,
      name,
      path: declarationRel,
      digest,
      effective,
      ...(note !== undefined ? { note } : {}),
    };
  }

  // ——————— G-2/W1：role_status / session_tail 的桌面侧数据源（契约＝`model/runtime.ts`；编排转发） ———————

  /**
   * 2026-10-30（3.4 / rework F1–F5）：`evidence_check` 只读证据检查——显式 criteriaRef、当前 run flow 绑定、
   * 角色模块证据范围、项目内路径；单文件/collection sidecar 均走真实检查；不执行项目脚本、不写盘。
   */
  private async evidenceCheckText(projectRoot: string, roleId: string, input: EvidenceCheckInput): Promise<string> {
    const ref = input.criteriaRef;
    const artifactRaw = typeof input.artifact === "string" ? input.artifact : "";
    const artifact = validateEvidencePath(artifactRaw);
    const meta = typeof input.metaPath === "string" && input.metaPath.trim() !== "" ? validateEvidencePath(input.metaPath) : undefined;
    const base = { schema: "evidence-check/v1", roleId, artifact: artifact.ok ? artifact.path : artifactRaw.trim().replace(/\\/g, "/") };
    const fail = (code: string, missing: string[], docs: string[] = []): string => {
      const rejection = makeMechanicalRejection(code, missing, { docs });
      return JSON.stringify({ ...base, ok: false, code, rejection }, null, 2);
    };
    if (!artifact.ok) return fail("evidence-path-invalid", [artifact.reason], [artifactRaw]);
    if (meta !== undefined && !meta.ok) return fail("evidence-path-invalid", [meta.reason], [input.metaPath ?? ""]);
    if (ref === undefined) {
      return fail("criteria-version-unresolved", ["缺少显式 criteriaRef（path+sha256+version）；不取 latest"]);
    }
    const flowMatch = /^docs\/acceptance\/([a-z0-9][a-z0-9-]{0,62})-criteria-v[1-9]\d*\.md$/.exec(ref.path.replace(/\\/g, "/"));
    if (flowMatch === null) {
      return fail("criteria-ref-mismatch", [`criteriaRef 路径不合法：${ref.path}`], [ref.path]);
    }
    const refFlow = flowMatch[1]!;
    // F5②：ref 的 flow 必须等于当前 run 的 flow；无 run＝legacy（不绑定），多 active flow fail-closed。
    const listed = await listRunManifestsResult(projectRoot);
    if (!listed.ok) return fail(listed.code, [listed.reason]);
    const activeRuns = listed.manifests.filter((run) => run.state === "draft" || run.state === "pinned");
    const activeFlows = [...new Set(activeRuns.map((run) => run.flowId))];
    if (activeFlows.length > 1) {
      return fail("criteria-ref-mismatch", [`存在多个 active run flow（${activeFlows.join("、")}），无法唯一绑定当前 flow；不猜`]);
    }
    const currentFlow = activeFlows[0];
    if (currentFlow !== undefined && currentFlow !== refFlow) {
      return fail("criteria-ref-mismatch", [`criteriaRef flow=${refFlow} 与当前 run flow=${currentFlow} 不一致`], [ref.path]);
    }
    const flowId = currentFlow ?? refFlow;
    const run = activeRuns.find((item) => item.flowId === flowId);
    const criteria = await loadCriteria(projectRoot, flowId, ref);
    if (!criteria.ok) return fail(criteria.code, criteria.rejection.missing, criteria.rejection.docs);
    const criteriaSummary = { path: criteria.doc.path, flowId: criteria.doc.flowId, version: criteria.doc.version, status: criteria.doc.status, sha256: criteria.doc.sha256 };
    // F2：按调用角色裁剪——只允许本角色模块目录内的证据（含 metaPath/collection item）。
    const scope = await this.evidenceScopeRoots(projectRoot, flowId, run, roleId);
    if (scope.length === 0) {
      return fail("evidence-scope-denied", [`调用角色 ${roleId} 没有可用的模块证据范围（名单模块/任务 modulePaths 均缺失）`], [criteria.doc.path]);
    }
    const metaRel = meta?.path ?? `${artifact.path}.meta.json`;
    if (!isWithinEvidenceRoots(artifact.path, scope)) {
      return fail("evidence-scope-denied", [`artifact ${artifact.path} 不在调用角色 ${roleId} 的模块证据范围（${scope.join("、")}）`], [criteria.doc.path]);
    }
    if (!isWithinEvidenceRoots(metaRel, scope)) {
      return fail("evidence-scope-denied", [`metaPath ${metaRel} 不在调用角色 ${roleId} 的模块证据范围（${scope.join("、")}）`], [criteria.doc.path]);
    }
    if (input.acId === undefined || input.acId.trim() === "") {
      try {
        const actual = await readArtifact(projectRoot, artifact.path);
        let parsedMeta: unknown;
        try { parsedMeta = parseEvidenceMeta(await fs.promises.readFile(path.join(projectRoot, metaRel), "utf8")); } catch { parsedMeta = null; }
        return JSON.stringify({ ...base, ok: true, criteria: criteriaSummary, actual: { path: actual.path, bytes: actual.bytes, lines: actual.lines, sha256: actual.sha256 }, meta: parsedMeta, note: "未给 acId，未做 criteria/P0 关联" }, null, 2);
      } catch (error) {
        return fail("criteria-missing", [`artifact 不可读：${error instanceof Error ? error.message : String(error)}`], [artifact.path]);
      }
    }
    const render = (result: Awaited<ReturnType<typeof checkEvidence>>): string => JSON.stringify({
      ...base,
      ok: result.ok && result.valid,
      valid: result.valid,
      unverified: result.unverified,
      legacy: result.legacy,
      p0Ignored: result.p0Ignored,
      priority: result.priority,
      criteria: criteriaSummary,
      actual: result.actual !== undefined ? { path: result.actual.path, bytes: result.actual.bytes, lines: result.actual.lines, sha256: result.actual.sha256 } : undefined,
      sidecar: result.meta,
      claims: result.claims,
      mismatch: result.mismatch,
      ...(result.rejection !== undefined ? { code: result.rejection.code, rejection: result.rejection } : {}),
    }, null, 2);
    // F1：真实会话/工具路径显式识别 collection sidecar 并路由 checkEvidenceCollection。
    let metaText: string | undefined;
    try { metaText = await fs.promises.readFile(path.join(projectRoot, metaRel), "utf8"); } catch { metaText = undefined; }
    const parsedMeta = metaText === undefined ? undefined : parseEvidenceMeta(metaText);
    if (parsedMeta !== undefined && parsedMeta.ok && "collection" in parsedMeta.meta) {
      const collection = await checkEvidenceCollection({
        projectRoot,
        acId: input.acId,
        criteria: criteria.doc,
        metaPath: metaRel,
        scopeRoots: scope,
      });
      return render(collection);
    }
    const result = await checkEvidence({
      projectRoot,
      acId: input.acId,
      criteria: criteria.doc,
      artifact: artifact.path,
      metaPath: metaRel,
      scopeRoots: scope,
    });
    return render(result);
  }

  /**
   * F2（3.4 rework）：调用角色的模块证据范围——pinned/latest roster 中该角色的模块 paths，
   * 加上当前 run 指派给该角色的任务的 modulePaths（治理/验收角色被派发模块任务时同样有界）。
   */
  private async evidenceScopeRoots(projectRoot: string, flowId: string, run: RunManifest | undefined, roleId: string): Promise<string[]> {
    const roots = new Set<string>();
    if (roleId === "") return [];
    let roster: ProjectRoster | undefined;
    if (run !== undefined && run.state === "pinned") {
      const pinned = await loadPinnedRoster(projectRoot, run);
      if (pinned.ok) roster = pinned.roster;
    } else {
      const latest = await loadLatestRoster({ projectRoot, flowId });
      if (latest.ok) roster = latest.roster;
    }
    if (roster !== undefined) {
      const role = roster.roles.find((item) => item.id === roleId);
      for (const moduleId of role?.modules ?? []) {
        const module = roster.modules.find((item) => item.id === moduleId);
        for (const raw of module?.paths ?? []) {
          const normalized = validateEvidencePath(raw);
          if (normalized.ok) roots.add(normalized.path);
        }
      }
    }
    const state = await this.readTasks(projectRoot);
    for (const record of state.records.values()) {
      const created = record.created;
      if (created === undefined || created.to !== roleId || created.flowId !== flowId) continue;
      if (run !== undefined && created.runId !== run.runId) continue;
      for (const raw of created.modulePaths ?? []) {
        const normalized = validateEvidencePath(raw);
        if (normalized.ok) roots.add(normalized.path);
      }
    }
    return [...roots].sort();
  }

  /**
   * 2026-10-30（3.2）：`contract_check` 只读契约速查。不写盘、不放行；只返回调用角色可见信息。
   */
  private async contractCheckText(projectRoot: string, callerRoleId: string, input: ContractCheckInput): Promise<string> {
    let listing = this.deps.getListing(projectRoot);
    if (!listing) await this.refreshListingNow(projectRoot);
    listing = this.deps.getListing(projectRoot);
    const requestedRole = typeof input.roleId === "string" && input.roleId.trim() !== "" ? input.roleId.trim() : callerRoleId;
    const roleId = callerRoleId !== "" ? callerRoleId : requestedRole;
    const role = listing?.roles.find((item) => item.roleId === roleId);
    let flowId = typeof input.flowId === "string" && input.flowId.trim() !== "" ? input.flowId.trim() : "";
    const listed = await listRunManifestsResult(projectRoot);
    let run: RunManifest | null = null;
    if (listed.ok) {
      const active = listed.manifests.filter((manifest) => manifest.state === "pinned" || manifest.state === "draft");
      if (flowId !== "") {
        run = active.find((manifest) => manifest.flowId === flowId && manifest.state === "pinned")
          ?? active.find((manifest) => manifest.flowId === flowId)
          ?? null;
      } else {
        run = active.find((manifest) => manifest.state === "pinned") ?? active[0] ?? null;
        flowId = run?.flowId ?? "";
      }
    }
    const lines: string[] = ["contract_check（只读速查；查询不构成放行/授权）"];
    if (!listed.ok) {
      lines.push(`run manifest：读取失败（${listed.reason}）——不要猜测 pin 状态。`);
    } else if (run === null) {
      lines.push(`run：legacy（未冻结）${flowId !== "" ? `｜flow ${flowId}` : ""}`);
    } else {
      lines.push(`run：${run.runId}｜flow ${run.flowId}｜state=${run.state}${run.pinnedAt !== undefined ? `｜pinnedAt ${run.pinnedAt}` : ""}`);
      for (const [kind, ref] of Object.entries(run.documents)) {
        if (ref === null || ref === undefined) lines.push(`文档 ${kind}：null（未钉）`);
        else lines.push(`文档 ${kind}：${ref.path}${ref.sha256 !== undefined ? `（sha256 ${ref.sha256.slice(0, 12)}…）` : ""}`);
      }
      if (run.execution.teamPlan !== null) lines.push(`teamPlan：${run.execution.teamPlan.path}（${run.execution.teamPlan.schema ?? "schema?"}）`);
      if (run.execution.flow !== null) lines.push(`flow：${run.execution.flow.path}（v${run.execution.flow.version}）`);
      if (run.roles !== undefined) lines.push(`项目角色：${run.roles.join("、")}`);
    }
    const roster = run !== null && run.state === "pinned"
      ? await loadPinnedRoster(projectRoot, run)
      : flowId !== "" ? await loadLatestRoster({ projectRoot, flowId }) : undefined;
    if (roster !== undefined && !roster.ok) lines.push(`roster：不可用（${roster.reason}）`);
    const roleModules = roster !== undefined && roster.ok && role !== undefined
      ? roster.roster.roles.find((entry) => entry.id === roleId)?.modules ?? []
      : [];
    const moduleId = typeof input.moduleId === "string" ? input.moduleId.trim() : "";
    const module = roster !== undefined && roster.ok && moduleId !== "" ? roster.roster.modules.find((entry) => entry.id === moduleId) : undefined;
    lines.push(`角色：${roleId || "（未指定）"}${role !== undefined ? `｜builtIn=${role.builtIn === true}` : ""}`);
    if (roleModules.length > 0) lines.push(`名下模块：${roleModules.join("、")}`);
    if (module !== undefined) lines.push(`指定模块：${module.id}｜paths=${module.paths.join("、")}｜category=${module.category}`);
    const boundaryEntries = role?.boundary?.entries ?? [];
    if (boundaryEntries.length > 0) {
      lines.push(`可写边界：${boundaryEntries.map((entry) => `${entry.path}（${entry.kind}）`).slice(0, 12).join("、")}`);
    } else {
      lines.push("可写边界：（未枚举/内置治理角色按既有拓扑与治理规则）");
    }
    lines.push("禁止：角色卡/、其他角色模块、.ans/、治理/版本化文档覆盖、docs/product|proposals|contracts|scheduling|quality|verification（越界拒绝）");
    const kind = input.taskKind;
    const required: Record<string, string[]> = {
      dispatch: ["flowId", "targetRoleId", "runId(pinned)", "moduleId(运营派实现)", "modulePaths"],
      appointment: ["flowId", "multiple=true", "options=名单角色", "D3 选中含 env-bootstrap(未省略)"],
      write: ["targetRoleId", "decisionId", "paths 全部在角色卡/<target>/", "boundary 模块路径一致"],
      acceptance: ["flowId", "runId/pinnedDocs", "moduleId/modulePaths", "证据按模块归档"],
      shell: ["command/argv", "cwd", "显式写目标在角色边界", "执行后审计"],
    };
    if (kind !== undefined) lines.push(`taskKind ${kind} 必填：${required[kind].join("；")}`);
    else lines.push("taskKind：可传 dispatch/appointment/write/acceptance/shell 获取对应必填项");
    lines.push("常见拒绝 → 下一步：");
    for (const item of rejectionMapSnapshot().slice(0, 14)) lines.push(`- ${item.code} → ${item.owner}${item.retryable ? "（可重试）" : "（不可原样重试）"}`);
    const text = lines.join("\n");
    const max = 4096;
    if (Buffer.byteLength(text, "utf8") <= max) return text;
    const marker = "\n…（已截断）";
    let truncated = text;
    while (Buffer.byteLength(truncated, "utf8") > max - Buffer.byteLength(marker, "utf8") && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    return `${truncated}${marker}`;
  }

  /** `role_status` 结构化文本（设计 §4.1：su 行 + 各角色行 + 队列明细 + 可选诊断节；**纯读**、无副作用；
   *  数据层失败以 `{ok:false, message}` 如实表达（不抛——抛错由工具层按「读取未完成」如实转达）；
   *  8 KiB 截断由工具层执行（本层不预截断）。 */
  private async roleStatusText(projectRoot: string, query: RoleStatusPayload): Promise<WatchdogToolResult> {
    try {
      const at = this.now();
      const snapshot = this.watchdogSnapshot(projectRoot);
      const lines: string[] = [`role_status（项目 ${projectRoot}，${new Date(at).toISOString()}）`];
      if (!snapshot) {
        lines.push("（尚无运行态：项目未导入，或还没有任何会话/队列——先导入项目并点开角色。）");
        return { ok: true, text: lines.join("\n") };
      }
      // 评审 §5.6：状态行的主人行数据驱动（trio=Convener；single=su）——**不让 Rapporteur 会话自称 su**。
      const governanceRoleId = snapshot.governanceRoleId;
      const pendingFor = (rid: string): number => snapshot.pendingConfirmationsByRole.get(rid) ?? 0;
      const governanceBusy = governanceRoleId !== null && snapshot.roles.some((r) => r.roleId === governanceRoleId && r.busy);
      const stats = this.deps.watchdogStats?.(projectRoot);
      const watchdogLine = stats
        ? `看护：活跃告警 ${stats.activeAlerts}，最近触发 ${stats.lastAlertAt !== null ? new Date(stats.lastAlertAt).toISOString() : "null"}，已抑制 ${stats.suppressedTotal}`
        : "看护：未接线";
      lines.push(`${governanceRoleId ?? "（未枚举）"}：busy=${governanceBusy} ｜ 待确认卡 ${governanceRoleId !== null ? pendingFor(governanceRoleId) : 0} ｜ ${watchdogLine}`);
      const wantedRoleId = typeof query?.roleId === "string" ? query.roleId.trim() : "";
      let listing = this.deps.getListing(projectRoot);
      // W6-B 真机阻塞修复：治理角色刚写入的新角色可能尚未进缓存——指定角色 miss 时强制刷新**一次**
      // 再判定（只一次；刷新失败只记诊断，仍按 miss 如实报告）。
      if (wantedRoleId !== "" && (!listing || !listing.roles.some((r) => r.roleId === wantedRoleId))) {
        await this.refreshListingNow(projectRoot);
        listing = this.deps.getListing(projectRoot);
      }
      const knownRoles = listing ? listing.roles.map((r) => r.roleId) : [...new Set([...snapshot.roles.map((r) => r.roleId), ...snapshot.queues.map((q) => q.targetRoleId)])].filter((r) => r !== "");
      const includeDiagnostics = query?.includeDiagnostics === true;
      const wanted = wantedRoleId !== "" ? [wantedRoleId] : knownRoles;
      for (const rid of wanted) {
        if (listing && !knownRoles.includes(rid)) {
          lines.push(`角色 ${rid}：不在本项目（未枚举到）。`);
          continue;
        }
        const live = snapshot.roles.find((r) => r.roleId === rid);
        const queue = snapshot.queues.find((q) => q.targetRoleId === rid);
        let liveText = "未开";
        if (live) {
          const entry = this.sessions.get(this.sessionKey(projectRoot, rid, live.runtime));
          const ctx = entry ? this.contextInfo(entry.handle).contextSource ?? "fresh" : "fresh";
          liveText = `已开（contextSource=${ctx}）`;
        }
        let runningKind: string | undefined;
        for (const [key, item] of this.activeDeliveries) if (key.startsWith(`${projectRoot}\u0000${rid}\u0000`)) { runningKind = item.kind; break; }
        const depth = queue?.items.length ?? 0;
        const busy = live?.busy === true;
        lines.push(`角色 ${rid}：busy=${busy} ｜ 会话 ${liveText} ｜ 队列 ${depth} ｜ 进行中 ${runningKind ?? "—"}`);
        // B 批：运行日志的 lastActivityAt / 最近动作（只读；读失败如实显示「不可用」，不猜）。
        const activity = await readRoleLog(projectRoot, { roleId: rid, limit: 1 });
        if (activity.ok) {
          const lastLog = activity.entries[activity.entries.length - 1];
          lines.push(`  运行日志：lastActivityAt=${lastLog?.at ?? "无"} ｜ 最近动作=${lastLog !== undefined ? `${lastLog.kind}：${lastLog.summary}` : "无"}`);
        } else {
          lines.push(`  运行日志：不可用（${activity.message ?? "读取失败"}）`);
        }
        // 呈现消歧（实机反馈 2026-10-17；时限语义随客户 2026-10-17 裁定更新）：busy=true 时「上一轮终局」
        // **不是当前轮**——必须分开写，否则 su 会把历史 timed_out 转述成「该角色超时、已中止」。当前轮事实
        // （已耗/看护检查时限/turnId）只在 busy 且有起始时刻时给出；`promptTimeoutMs` 自 2026-10-17 起是
        // **到点检查时限（不中止本轮）**，整轮最后兜底固定 1 小时（`turnLastResortMs`）。时限求值与看护/
        // 会话运行时**同一来源** `resolveRuntimeTimeouts`（不另写时长/env 解析），格式化复用 `formatDurationMs`。
        if (busy && live !== undefined && typeof live.turnStartedAt === "number") {
          const timeouts = resolveRuntimeTimeouts(
            live.runtime,
            { promptTimeoutMs: this.deps.runtimeOptions?.promptTimeoutMs },
            process.env,
          );
          const lastResortText =
            timeouts.turnLastResortMs >= 3_600_000 && timeouts.turnLastResortMs % 3_600_000 === 0
              ? `${timeouts.turnLastResortMs / 3_600_000} 小时`
              : formatDurationMs(timeouts.turnLastResortMs);
          lines.push(
            `  当前轮：进行中（已耗 ${formatDurationMs(Math.max(0, at - live.turnStartedAt))} / 看护检查时限 ${formatDurationMs(timeouts.promptTimeoutMs)}；turnId=${live.turnId ?? "—"}；${lastResortText}最后兜底）`,
          );
        }
        let last: { outcome: RuntimeTurnOutcome; at: string } | undefined;
        for (const [key, value] of this.lastTurns) if (key.startsWith(`${projectRoot}\u0000${rid}\u0000`)) { last = value; break; }
        if (last) {
          const history = `该角色近 15 分钟 failed/timed_out 计 ${stats?.failuresByRole.get(rid) ?? 0}`;
          lines.push(
            busy
              ? `  上一轮终局：${last.outcome} @ ${last.at}（不表示当前轮；${history}）`
              : `  最近一轮：${last.outcome} @ ${last.at}（${history}）`,
          );
        }
        for (const item of queue?.items ?? []) {
          lines.push(`  队列明细：- [${item.kind}] 来自 ${item.sourceRoleId === "" ? "（系统）" : item.sourceRoleId}：${shortenText(item.summary, 80)}（入队 ${new Date(item.enqueuedAtMs).toISOString()}，id=${item.dedupKey}）`);
        }
        if (includeDiagnostics && wantedRoleId !== "") lines.push(await this.diagnosticsTailText(rid));
      }
      if (includeDiagnostics && wantedRoleId === "") lines.push("（诊断节需要指定 roleId——未附。）");
      return { ok: true, text: lines.join("\n") };
    } catch (err) {
      return { ok: false, message: `role_status 数据面读取失败：${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** 该角色**近日志尾部 ≤20 条**（只读诊断文件；字段为写盘白名单内的元数据）。失败如实（不抛、不猜）。 */
  private async diagnosticsTailText(roleId: string): Promise<string> {
    try {
      const status = getDiagnosticsStatus();
      if (!status.directory) return `  [diagnostics] 不可用（诊断目录未配置${status.lastError ? `；lastError：${status.lastError}` : ""}）。`;
      const names = (await fs.promises.readdir(status.directory)).filter((n) => /^ans-diagnostics-\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort();
      const newest = names[names.length - 1];
      if (newest === undefined) return "  [diagnostics] 不可用（暂无诊断文件）。";
      const file = path.join(status.directory, newest);
      const st = await fs.promises.stat(file);
      const start = Math.max(0, st.size - 256 * 1024); // 尾读 ≤256KiB（不整读大文件）
      const fh = await fs.promises.open(file, "r");
      let chunk = "";
      try {
        const buf = Buffer.alloc(st.size - start);
        const { bytesRead } = await fh.read(buf, 0, buf.length, start);
        chunk = buf.subarray(0, bytesRead).toString("utf8");
      } finally {
        await fh.close();
      }
      const rows: string[] = [];
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (trimmed === "" || rows.length >= 20) continue;
        try {
          const row = JSON.parse(trimmed) as Record<string, unknown>;
          if (row.roleId !== roleId) continue;
          const fields = Object.entries(row)
            .filter(([k]) => k !== "at" && k !== "level" && k !== "pid" && k !== "projectRoot" && k !== "roleId")
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(" ");
          rows.push(`  [diagnostics] ${String(row.at ?? "")} ${String(row.event ?? "?")}${fields ? ` ${fields}` : ""}`);
        } catch {
          // 坏行跳过（尾读切半行也走这里）——如实不猜。
        }
      }
      return rows.length > 0 ? rows.join("\n") : "  [diagnostics] 该角色近日志无可显示条目。";
    } catch (err) {
      return `  [diagnostics] 不可用（读取失败）：${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /** `session_tail` 规范化尾行文本（设计 §4.2）：**复用受保护投影管线**（getSessionHistory 同路径——凭据
   *  清洗/display 保护已在链上）；行数由工具层归一（本层沿用其值，防御再夹一道）；「无会话历史」「读坏」
   *  以 `{ok:false, message}` 如实表达——不抛、不猜。 */
  private async sessionTailText(projectRoot: string, query: SessionTailPayload): Promise<WatchdogToolResult> {
    const rid = typeof query?.roleId === "string" ? query.roleId.trim() : "";
    if (rid === "") return { ok: false, message: "session_tail：roleId 必须非空。" };
    const n = typeof query?.lines === "number" && Number.isFinite(query.lines) ? Math.min(200, Math.max(1, Math.floor(query.lines))) : 40;
    try {
      let source = "无会话文件";
      try {
        const dir = sessionsDirFor(projectRoot, rid);
        const names = await fs.promises.readdir(dir);
        const files: { name: string; mtimeMs: number }[] = [];
        for (const name of names) {
          try {
            const st = await fs.promises.stat(path.join(dir, name));
            if (st.isFile()) files.push({ name, mtimeMs: st.mtimeMs });
          } catch {
            // 单文件 stat 失败：跳过（不阻断其它候选）
          }
        }
        const latest = pickLatestSessionFile(files);
        if (latest !== null) source = latest;
      } catch {
        // 无目录 = 无历史
      }
      let runtime: RuntimeKind = "pi";
      for (const entry of this.sessions.values()) {
        if (entry.projectRoot === projectRoot && entry.roleId === rid) { runtime = entry.runtime; break; }
      }
      const view = await getSessionHistory(
        { projectRoot, roleId: rid, runtime },
        { credentialEnvNames: [...(this.deps.runtimeOptions?.extraCredentialEnvVars ?? []), ...(this.deps.runtimeOptions?.apiKeyEnvVar ? [this.deps.runtimeOptions.apiKeyEnvVar] : [])] },
      );
      if (view.error) {
        return { ok: false, message: `会话历史读取未完成：${view.error}（来源 ${source}；跳过 ${view.skipped} 行）` };
      }
      const taken = view.rows.slice(-n);
      if (taken.length === 0) {
        return { ok: false, message: `无会话历史（来源 ${source}；规范行 0 条，跳过 ${view.skipped} 行）` };
      }
      const head = `session_tail（角色 ${rid}，runtime=${runtime}）：来源 ${source}；规范行 ${view.rows.length} 条，跳过 ${view.skipped} 行${view.rows.length > taken.length ? `（已按行数上限 ${n} 取尾部）` : ""}`;
      const body = taken.map((row) => `${row.at !== "" ? row.at : "（无时间）"} [${row.kind}] ${shortenText(row.text, 200)}`);
      return { ok: true, text: [head, ...body].join("\n") };
    } catch (err) {
      return { ok: false, message: `session_tail 读取失败（如实返回，不猜）：${err instanceof Error ? err.message : String(err)}` };
    }
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
  private async drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void> {
    const key = projectRoot;
    const prev = this.drainChains.get(key) ?? Promise.resolve();
    const next = prev
      .then(() => this.drainQueueUnsafe(projectRoot, targetRoleId, runtime))
      .catch((err) => {
        this.emitDeliveryNote(projectRoot, runtime,
          this.handbackOwnerRoleId(projectRoot),
          "(投递机)",
          `投递机异常已拦截（不产生未捕获拒绝）：${err instanceof Error ? err.message : String(err)}`
        );
      });
    this.drainChains.set(key, next);
    try {
      await next;
    } finally {
      // 链尾清理（若期间又有新链悬挂在更后面，让新链自己的 finally 收尾——防泄漏）。
      if (this.drainChains.get(key) === next) this.drainChains.delete(key);
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
  private async drainQueueUnsafe(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void> {
    const resolvedTarget =
      targetRoleId !== null && targetRoleId !== "" ? targetRoleId : (this.handbackOwnerRoleId(projectRoot) ?? "");
    const key = this.queueKey(projectRoot, resolvedTarget, runtime);
    const q = this.deliveryQueues.get(key);
    if (!q || q.length === 0) return;
    // 2026-10-20 真机（Convener 卡 1h、队列 24 条回交被 system 看护项堵住）：**回交/派发优先于 system**。
    // 认领时跳过 system 看护项、取第一个非 system 条目（回交/派发/客户消息的相对顺序不变——客户消息屏障
    // 语义保留；同类仍按到达序）。只有在队列全是 system 时才投 system。
    const priorityIndex = q.findIndex((i) => i.kind !== "system");
    const headIndex = priorityIndex >= 0 ? priorityIndex : 0;
    const item = q[headIndex];
    const diagnostic = createDiagnosticLogger({ component: "desktop.delivery", projectRoot, roleId: resolvedTarget });

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

    // **2026-10-29（BUG-5）**：任务在排队期间已完成（已报告/已收口）⇒ 该派发项不得再投递。
    // 完成后的重复投递只记诊断与丢弃队列项，不产生 task.delivered/新一轮事件；不触碰其他条目。
    if (item.kind === "dispatch" && typeof item.taskId === "string" && item.taskId !== "") {
      const record = (await this.readTasks(projectRoot)).records.get(item.taskId);
      if (record !== undefined && (record.closed !== undefined || record.reports.length > 0)) {
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

    let entry = this.sessions.get(this.sessionKey(projectRoot, resolvedTarget, runtime));
    if (!entry || entry.projectRoot !== projectRoot) {
      // 目标会话**未开**（或属于别的项目）→ 自动开启再投（su=治理主入口；派发目标=被派角色）。
      // 后台开启（`userInitiated=false`）：**不抢活动角色**——用户正在看的会话不因投递而易主。
      const opened = await this.openInternal({ projectRoot, roleId: resolvedTarget, runtime }, false);
      if (!opened.ok) {
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
    if (!entry || entry.projectRoot !== projectRoot) return; // 防御：仍不可用则保持排队
    if (entry.busy || (runtime === "pi" && entry.profileRevision !== this.profileRevision("pi") && this.hasBusyRuntime("pi"))) {
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

    // —— F-2-opt3：认领段开始（自此到 claim.end 之间的同步改动都在串行链内；随后链即释放）——
    diagnostic.record("delivery.claim.start", { state: item.kind, queueDepth: q.length });
    // 仅回交主人队首连续回交合批；客户消息/派发是屏障，正文仍由编排唯一生成。
    // B 批：幕僚的星形工作结果也合批（渲染用 `renderWorkReportBatchPrompt`，`[工作结果]` 固定字段）。
    const chiefRoleId = this.chiefTaskRoleIdOf(projectRoot);
    const handbackOwner = this.handbackOwnerRoleId(projectRoot);
    let batchCount = 1;
    if (headIndex === 0 && (resolvedTarget === handbackOwner || resolvedTarget === chiefRoleId) && item.kind === "handback" && item.handback && !item.deliveryId) {
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
    entry.busy = true;
    entry.busySince = this.now(); // G-2/W1：本轮起点定格（看护信号 #1 的 elapsed 基准）
    entry.lastTurnAborted = undefined; // 新一轮开始：上一轮的中止标记不再适用于本轮
    this.activeDeliveries.set(key, sent); // 与 busy 同时登记；settled/失败/dispose 精确撤销。
    this.persistDeliveryQueues(); // 2026-10-20：认领即记 in-flight（崩溃重启后重投；delivery.end 后移除）
    diagnostic.record("delivery.start", { count: batchCount, queueDepth: q.length, state: sent.kind });
    // G-2/W3：drain 出队投出 = 真实活动（重武装）；`kind:"system"`（看护自身投递）不记（同 enqueueDelivery 口径）。
    if (sent.kind !== "system") this.noteWatchdogActivity(projectRoot, "delivery-claim");
    this.notifyRoleState(projectRoot, resolvedTarget, runtime); // 状态准确性：投递开跑即外推「工作中」（shift 时快照尚为闲）
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
      await this.sendDelivery(entry, origin, sent.text, sendOptions, sent.kind === "dispatch", sent.taskId);
      diagnostic.record("delivery.end", { ok: true, count: batchCount, state: sent.kind });
      // 2026-10-20 重启续跑：投递成功（delivery.end）即从持久队列移除——崩溃重启不重投已完成项。
      this.deliveredDeliveryKeys.add(`${key}\u0000${sent.dedupKey}`);
      // 2026-10-25：应用任务投递成功 ⇒ 记「已投递」（重建续投/应用侧同任务调用不再发第二遍）。
      this.rememberAppTaskDelivered(sent.clientMessageId);
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
      if (sent.kind === 'handback') diagnostic.record('delivery.failed', { count: batchCount, state: sent.kind });
      else diagnostic.error("delivery.failed", err, { count: batchCount, state: sent.kind });
      const receipt = err instanceof RuntimeDeliveryError ? err.receipt : sent.attemptId ? this.attemptStates.get(this.persistenceKey(this.persistenceScope(entry), sent.attemptId))?.receipt : undefined;
      if (receipt) this.rememberReceipt(entry, receipt);
      const cAttempt = sent.kind === 'handback' && !!sent.attemptId;
      // **2026-10-25 重复投递修复：已 ACK 的不再按「未投递」重试**。
      // `origin.turnId` 由运行时**同步开轮回执**（onTurnStarted）绑定；`inputAccepted` 是 prompt-input
      // 真实回显。任一成立 ⇒ 输入已交给运行时，失败（如会话在收尾窗口被重建 dispose）不得回队重投，
      // 否则同一任务会在重建后以第二条 user 消息再出现（客户真机缺陷）。未 ACK 的失败仍按既有语义
      // 放回队首保留重试（失败重试仍允许）；回交保留 receipt 判据（providerMayHaveStarted）不变。
      const acked = origin.turnId !== undefined || origin.inputAccepted === true;
      const canRetry = cAttempt
        ? !!receipt && !receipt.providerMayHaveStarted && receipt.retryDeliveryAllowed
        : !acked;
      const mayBeActive = cAttempt && (!receipt || receipt.providerMayHaveStarted);
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
