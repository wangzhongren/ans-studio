import { RuntimeDeliveryError } from "../../src/model/runtime.ts";
import type { SessionEvent, RuntimeTurnOutcome, RuntimePersistenceChangeV1, ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1, DeliveryReceiptQueryV1, RuntimeDeliveryReceiptV1, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1, RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1 } from "../../src/model/runtime.ts";
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
//    淘汰者 dispose、界面侧历史由渲染层自持）；事件外推带 **`roleId` 信封**（多会话并存不串消息）；
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
//  - **su 审批档（客户裁定 2026-10-17：「只读的免审批，其他的要客户审批」＋「deny 也走客户审批」）**：
//    内置治理角色（su）会话把 **(c) 规则集实件**（与项目角色**同一份** `deps.shellArming`——单一来源、永不漂移）
//    与 **(a) 操作者确认通道**（与项目角色同一份 `deps.shellOperatorChannel`）经 `shellOperatorOnly` 交给编排
//    `assembleOperatorShellGate` 装配**审批档** ShellGate ⇒ su 的 `run_shell` **注册**：(c) 只读白名单直接放行
//    **0 卡**；`risky`/`review`/`deny` 一律交客户**逐条批准**（deny 也可被批准）。**su 不接 (b)**（不自审）；
//    拒绝/超时/通道不可用 = 拒绝（fail-closed）。旧只读档（`shellReadonly`）桌面**不再使用**（类型保留兼容）。
//    缺省/构造失败（`deps.shellArming` 或 `deps.shellOperatorChannel` 为 undefined）⇒ **不传** ⇒ su 不 arm
//    （能力缺席 = fail-closed，绝不放宽）。

import type { Acceptance } from "../../src/model/boundary.ts";
import type { GovernanceModel, ProjectConfig } from "../../src/model/role.ts";
// 三权（评审 §5.1/§5.6）：内置治理角色 id 判定 / 注册表统一来自门禁引擎的 Service 公开出口
// （桌面**不复制**第二份 id 列表，也不直接导入 `src/common/门禁引擎/` 私有模块）。
import { isBuiltInGovernanceRoleId } from "../../src/service/boundary/resolve-boundary.ts";
// 治理账本与派发门禁（评审 §5.6/§5.7/§6.2）：只经编排的 Pipeline 公共出口（`govern-session.ts`
// 薄再导出）消费——桌面**不直接导入**编排私有 `common/`（§十一.3）。
import {
  appendGovernanceLedger,
  evaluateGovernanceGate,
  readGovernanceLedger,
} from "../../src/pipeline/orchestration/govern-session.ts";
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
import { renderHandbackPrompt, renderHandbackBatchPrompt, handbackKey, extractDispatchReadPaths, planDispatchDelivery, type TaskHandback } from "../../src/common/编排/handback.ts";
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
// 事件转发（settled/命令超时/真实活动 → 看护器）；W5 恢复回执与看护三能力的**形状单一来源**：
// 契约家 `model/runtime.ts`（编排 `common/编排/watchdog.ts` 同名转发）＋ 回执文案也收敛在编排单一来源
// （`renderRecoveryReceipt`——本层只读导入，不复制第二份）。
import { recoveryActionLabel, recoveryReceiptSummary, formatDurationMs, type WatchdogObservation, type WatchdogProjectSnapshot } from "./watchdog.ts";
import {
  renderRecoveryReceipt,
  type ProposeRecoveryFn,
  type ProposeRecoveryPayload,
  type RecoveryReceipt,
  type RoleStatusFn,
  type RoleStatusPayload,
  type SessionTailFn,
  type SessionTailPayload,
  type WatchdogToolResult,
} from "../../src/common/编排/watchdog.ts";
// G-2/W5：恢复确认卡通道（presenter 的 pending/replay/expire 与 shell 卡共享 `confirm-card.ts` 通用件）。
// 形状为**桌面侧暂定契约**（设计 §6.1 的 propose_recovery 载荷 / §6.2 的确认流）——编排 O1 透传与
// 运行时核心 R2 handler 落树后按需重定向（interface 点见 api-spec；本层不复制第二份判定）。
import { isRecoveryAction, type RecoveryConfirmPresenter } from "./recovery-channel.ts";
import type { WriteGate, RuntimeAdapter, ShellGate, OperatorChannelFn, CustomerInputFn, CustomerInputRequest, CustomerInputMetadata, PromptTurnStartedMetadata, ShellJudgeFn, GovernanceJudgeFn } from "../../src/model/runtime.ts";
// W6-B（四角色评审 §5.3/§5.4）：意图交接与澄清的冻结形状（§4 契约家）——只读导入、不复制。
// 编排（run-role）已完成校验/去重/每轮一次/两轮上限并在成功回执后写账本；本层只是**投递端**。
import type {
  HandOffIntentFn,
  HandOffIntentPayload,
  HandOffIntentReceipt,
  RequestClarificationFn,
  RequestClarificationPayload,
  RequestClarificationReceipt,
} from "../../src/model/runtime.ts";
// W6-B：决定卡镜像判据与意图交接任务文案（纯逻辑在 governance-advance.ts；本层只做接线）。
import { buildIntentHandoffMessage, isMirroredGovernanceCard } from "./governance-advance.ts";
// H-1（2026-10-12）：派发能力的冻结契约（§4 冻结家；只读导入、不复制形状）。
import type { DispatchTaskPayload, DispatchReceipt, DispatchTaskFn, PromptOptions } from "../../src/model/runtime.ts";
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
// su 只读档（客户裁定 2026-10-12：「su 也要有 shell，但是只读」）：只读档装配选项形状的**单一来源**在编排
// （`shell-arming.ts::AssembleReadonlyShellGateOptions`）——只读导入其类型（运行期擦除），据它取「只读档
// 该注入哪几件」。**不另立第二形状**（与 `DesktopShellArming` 同法，见 operator-channel.ts 注释）。
import type { AssembleOperatorShellGateOptions, AssembleReadonlyShellGateOptions, RoutineShellPolicy } from "../../src/pipeline/orchestration/shell-arming.ts";
// 桌面客户交互通道（A-5）：请求/裁决的冻结形状在 §4 冻结契约家（model/runtime.ts），
// 本模块只读导入转出；`DesktopCustomerInputFn` 是本层对「带角色上下文」的窄扩展（请求本体不带 roleId）。
import type { DesktopCustomerInputFn } from "./customer-input.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
// 跨角色共享组件：`.ans` 有效配置载入器（**属主：项目管理**；本角色**只读导入，不复制第二份**，
// 规则见 `角色卡/项目管理/docs/architecture/shared-components.md`）。它是「有 `.ans` 优先加载、
// 无则回退、有但不可用则 fail-closed」这条判定链的**唯一实现**。
import {
  loadEffectiveConfig as defaultLoadEffectiveConfig,
  type ConfigSourceKind,
  type LoadConfigOptions,
  type LoadedConfig,
} from "../../src/common/shared/config-loader.ts";
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
 * 同时**保活**的会话数上限（B-2 路线 a 的 LRU 上限；设计建议 3）。超出即淘汰**最久未用**者
 * （dispose；界面侧历史由渲染层自持——切回时恢复并明示「模型上下文已重启」）。
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

// （A-5：finalize 面已删——提议/确认/手动收口不复存在；产物收尾由编排在 settle 后自动完成，见文件头。）

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
       * **意图交接投递端**（W6-B，四角色评审 §5.3）：仅 trio 联络官（`governanceFunction === "liaison"`）
       * 会话注入。编排（run-role）先做文件/去重/每轮一次校验，成功回执后写 `intent.handed-off`；
       * 本层只负责后台开 Rapporteur + 投递唯一一条任务 + 系统行。未注入 ⇒ 工具不注册。
       */
      handOffIntent?: HandOffIntentFn;
      /**
       * **澄清送达端**（W6-B，四角色评审 §5.4）：仅 trio 报告员（`governanceFunction === "proposal"`）
       * 会话注入。编排先判两轮上限并写 `clarification.requested`；本层只在主入口落系统行。
       * 未注入 ⇒ 工具不注册。
       */
      requestClarification?: RequestClarificationFn;
      /** **恢复提议能力**（G-2/W5）：仅内置治理角色（su）会话注入（见 SessionManager.proposeRecovery；
       *  字段名/形状＝契约家 `ProposeRecoveryFn`——编排 O1 按 `suppressHandback` 判据透传、R2 落工具）。 */
      proposeRecovery?: ProposeRecoveryFn;
      /** **role_status 数据源**（G-2/W1，仅 su 注入；形状＝契约家 `RoleStatusFn`）。 */
      roleStatus?: RoleStatusFn;
      /** **session_tail 数据源**（G-2/W1，仅 su 注入；形状＝契约家 `SessionTailFn`）。 */
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
      /** **(a) 操作者确认通道（I-1 arm；2026-10-17 起 su 也构造）**：**项目角色** ⇒ 编排装配 (c)/(b)/(a)
       *  三层链；**内置治理角色（su）** ⇒ 经下方 `shellOperatorOnly` 装配审批档。角色判据见 `open()`。 */
      shellOperatorChannel?: OperatorChannelFn;
      /** **(c) 规则集实件（I-1 补丁，2026-10-12）**：仅**项目角色**会话注入（与 (a) 同判据走三层链）。 */
      shellArming?: DesktopShellArming;
      /** **su 审批档（客户裁定 2026-10-17）**：仅**内置治理角色（su）**会话注入——(c) 只读白名单免审批，
       *  `risky`/`review`/`deny` 一律交客户逐条批准（deny 也可批准）；**不接 (b)**（su 不自审）。
       *  形状＝编排 `AssembleOperatorShellGateOptions`（`Omit<…, "project">`，只读导入、不另立第二形状）。
       *  缺省/缺件 ⇒ 不传 ⇒ su 不 arm（能力缺席 = fail-closed，绝不放宽）。 */
      shellOperatorOnly?: Omit<AssembleOperatorShellGateOptions, "project">;
      /** **su 只读档（旧路径，客户裁定 2026-10-12）**：类型保留以兼容其他调用方/测试；**桌面自 2026-10-17
       *  起不再使用**（su 改走审批档）。与 `shellOperatorOnly` 同时出现 ⇒ 编排不 arm（互斥守卫）。 */
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
  /**
   * **收尾推进（2026-10-18 真机缺口）**：项目角色回交送达 Convener、且 Convener 本轮 settle 后回调。
   * 只提供事实（flowId/回交证据）；是否/如何派 Rapporteur 出验收由 Interface 检查流程单/账本后决定。
   * 失败只记诊断，绝不影响已完成的回交轮；本层不打开会话、不写账本。
   */
  onHandbackSettled?: (info: {
    projectRoot: string;
    runtime: RuntimeKind;
    roleId: string;
    flowId: string;
    evidence: string[];
  }) => void;
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
   * **(a) 操作者确认通道**（I-1，2026-10-12；客户裁定「现在开放 shell…如果 su 觉得危险可以让客户决定」）——
   * 桌面把既有「看命令原文 + 放行/拒绝」对话框（`createDesktopOperatorChannel`；拒绝为默认与取消项）作为
   * (a) 层交给**编排**装配 (c)/(b)/(a) `ShellGate`（`buildShellGate` 的 `operatorChannel` 即本通道）。
   * **只对项目角色注入**（su **不接 (b)/(a)**——审读者不给自己开闸：不自审、不弹框；su 的 shell 走
   * `shellReadonly` 只读档，见下；判据 `role.builtIn`，见 `open()`）。
   */
  shellOperatorChannel?: DesktopOperatorChannelFn;
  /**
   * **(c) 规则集实件（I-1 补丁，2026-10-12 客户重发授权）**——与 `shellOperatorChannel` **同一接线面**
   * 透传：编排 `openRoleSession({ shellArming })` 用它装配 (c) 层（`classifyShell` + `rules`；缺省 ⇒ 编排
   * 对「规则集未注入」一律拒绝）。**只对项目角色**传（三层链；su 不接 (b)/(a)）。主进程用
   * `operator-channel.ts::buildDesktopShellArming()` 构造，**两件同备才 arm**（加载失败 ⇒ 连 (a) 也不注入）。
   *
   * **同一份实件也供 su 只读档**（客户裁定 2026-10-12：「su 也要有 shell，但是只读」）：`open()` 对内置治理
   * 角色会话经 `shellReadonly` **复用本对象**交给编排装配只读档——单一来源、与项目角色永不漂移；缺省 ⇒
   * su 也不 arm（能力缺席 = fail-closed）。
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
   * **实时重枚举并刷新共享角色缓存（2026-10-13 首轮寻址修复）**：`routeDispatch` 缓存 miss 时调用一次——
   * 实现应为「与界面 `listProject` **同一路径**读盘枚举 + 更新**同一份**共享缓存」（Interface 层给出）。
   * 缺省 ⇒ miss 时按原口径如实拒绝（不重枚举；测试替身可省）。
   */
  refreshListing?: (projectRoot: string) => Promise<void>;
  /**
   * **恢复确认卡通道（G-2/W5，2026-10-16 客户批准）**——su 经 `propose_recovery` 提议恢复动作时，
   * 由本层校验载荷、把卡摆给客户（恰 allow:true 才执行）。**缺省 ⇒ 恢复提议一律「未接线、未获执行」
   * 如实回执（fail-closed，绝不「没人问就执行」）**。主进程用 `recovery-channel.ts` 构造后注入。
   */
  recoveryConfirm?: RecoveryConfirmPresenter;
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

/** 队列摘要用的一句短句（L-1 可见性；仅呈现，不参与任何判定）。 */
function shortenText(s: string, n: number): string {
  const flat = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
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
   * **回交主人**最近一次开会话所用 runtime（评审 §5.6：`lastSuRuntime` → `lastGovernanceRuntime`）：
   * trio = Convener（`schedule`），single = 主入口 su。看护向回交主人投系统消息时 queueKey 需要 runtime
   * ——优先活会话，其次本记录，最后 `"pi"`（真实产品默认；demo 是开发替身）。仅为投递择路，不改任何判定。
   */
  private readonly lastGovernanceRuntime = new Map<string, RuntimeKind>();

  constructor(deps: SessionManagerDeps) {
    this.deps = deps;
    this.loadEffectiveConfig = deps.loadEffectiveConfig ?? defaultLoadEffectiveConfig;
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
  private contextInfo(handle: RoleSessionHandle): Pick<OpenResult, "contextSource" | "contextWarning"> {
    if (handle.contextSource === "resumed") return { contextSource: "recovered", contextWarning: handle.contextWarning };
    if (handle.contextSource === "recovered") return { contextSource: "fresh", contextWarning: handle.contextWarning ?? "原生上下文恢复失败，已重建上下文。" };
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

  private async sendDelivery(entry: LiveSession, origin: DeliveryOrigin, text: string, opts?: PromptOptions, requiresHandback = false): Promise<void> {
    // **「替我审」上下文**（PM 评审 §8.1）：当前轮投递给该角色的文本 ≤4KB，内存内（会话 dispose 即清）；
    // 超限截断但**不据此 manual**；不读转录/历史回放。写入点即真实投递（直发/出队/派发/回交同一路径）。
    entry.lastUserText = boundTurnText(text);
    // Every invocation declares its own source; chat also overrides any legacy session taskId.
    let promptOptions: RoleSessionSendOptions = { ...opts, handback: { required: requiresHandback } };
    if (entry.handle.runtime !== undefined || origin.clientMessageId !== undefined || opts?.onTurnStarted !== undefined) {
      const onTurnStarted = (metadata: PromptTurnStartedMetadata): void => {
        const key = this.sessionKey(entry.projectRoot, entry.roleId, entry.runtime);
        if (this.sessions.get(key) !== entry || (origin.settled && origin.turnId === undefined)) return;
        if (metadata.runtime !== entry.runtime || metadata.roleId !== entry.roleId || typeof metadata.turnId !== "string" || metadata.turnId === "") return;
        if (origin.turnId === undefined) {
          origin.turnId = metadata.turnId;
          entry.origins.byTurn.set(metadata.turnId, origin);
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
   *  「全忙暂超限」的子情形：除它之外全忙 ⇒ 暂超限）。 */
  private async evictBeyondLimit(keepRoleId?: string): Promise<void> {
    while (this.sessions.size > MAX_LIVE_SESSIONS) {
      let oldestId: string | null = null;
      let oldestUsed = Number.POSITIVE_INFINITY;
      for (const [id, s] of this.sessions) {
        if (s.busy) continue; // 正在跑轮次的不淘汰（暂超限等它 settled——绝不静默掐断后台任务）
        if (keepRoleId !== undefined && id === keepRoleId) continue; // 正在开启的那一个也不淘汰
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
    if (changed === null && entry.profileRevision !== this.profileRevision(entry.runtime)) changed = "运行时配置";
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
          ? `该角色已安装技能已变更（${changed}），已作废旧会话，按新技能登记重开；上下文恢复结果以引擎实际返回为准。`
          : `该角色边界已更新或运行时配置已保存（${changed}），已作废旧会话，按新边界重开；上下文恢复结果以引擎实际返回为准。`,
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
        event: { kind: "message", summary: `按新边界重开会话失败：${reopened.error ?? "未知原因"}（请重试或点击左侧角色）。` },
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
   */
  async sendBackground(input: { projectRoot: string; roleId: string; runtime: RuntimeKind; text: string }): Promise<SendResult> {
    return this.send(
      input.text,
      undefined,
      { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime },
      { background: true },
    );
  }

  /** 某角色当前是否有轮次在跑（纯读；W6-B 时序修复用）。 */
  isRoleBusy(projectRoot: string, roleId: string, runtime: RuntimeKind): boolean {
    return this.sessions.get(this.sessionKey(projectRoot, roleId, runtime))?.busy === true;
  }

  /**
   * **强制刷新一次 listing 缓存**（W6-B 真机阻塞修复）：调注入的 `refreshListing`（Interface 用
   * 与界面 `listProject` 同一路径读盘枚举并更新**同一份**共享缓存）。只尝试一次、不循环；失败只记
   * 诊断并返回 false（调用方按原口径如实拒绝/降级，不崩、不假装已刷新）。
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

  /**
   * **意图交接的投递端**（W6-B，四角色评审 §5.3；`hand_off_intent` 注入 Liaison 时绑定到本方法）。
   *
   * 编排（`run-role.ts`）已完成：意图文件权威校验、slug/四要素、去重、`initial` 一次性、每轮一次、
   * 账本可读性与 `intent.handed-off` 写入；本层只做**投递**：
   *   1. 后台打开 Rapporteur（`openBackground`——不抢 `activeRoleId`、不切 pane/焦点）；
   *   2. 投递**唯一一条**任务（`sendBackground`；目标忙时进既有投递队列，`queued:true` 仍是成功）；
   *   3. 成功/失败落既有 `delivery-note` 系统行（Liaison 聊天流）。
   *
   * **纪律**：失败只回执 + 系统行，**不重试、不写成功**、不自动批准；不打开/不切换会话。
   * 回执 `message` 只给原因（编排会统一包装成「应用无法把意图交给报告员：…；未重试。」）。
   */
  private async deliverIntentHandoff(
    projectRoot: string,
    runtime: RuntimeKind,
    liaisonRoleId: string,
    payload: HandOffIntentPayload,
    metadata?: { turnId?: string },
  ): Promise<HandOffIntentReceipt> {
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: liaisonRoleId });
    diagnostic.record("governance.handoff.delivery.start", {
      intentId: payload.intentId,
      handoffKind: payload.handoffKind,
      ...(metadata?.turnId !== undefined ? { turnId: metadata.turnId } : {}),
    });
    const fail = (reason: string): HandOffIntentReceipt => {
      diagnostic.error("governance.handoff.delivery.failed", new Error(reason), {
        intentId: payload.intentId,
        handoffKind: payload.handoffKind,
      });
      // 失败如实落系统行；不重试（下一次交接必须由客户新消息触发）。
      this.emitDeliveryNote(
        projectRoot,
        runtime,
        liaisonRoleId,
        liaisonRoleId,
        `应用无法把意图交给报告员：${reason}；未重试`,
      );
      return { ok: false, message: reason };
    };
    try {
      const opened = await this.openBackground({ projectRoot, roleId: "rapporteur", runtime });
      if (!opened.ok) return fail(`无法开启报告员会话（${opened.error ?? "未知原因"}）`);
      const sent = await this.sendBackground({
        projectRoot,
        roleId: "rapporteur",
        runtime,
        text: buildIntentHandoffMessage(payload),
      });
      if (!sent.ok) return fail(`发送任务给报告员失败（${sent.error ?? "未知原因"}）`);
      this.emitDeliveryNote(
        projectRoot,
        runtime,
        liaisonRoleId,
        liaisonRoleId,
        sent.queued === true ? "报告员工作中，已排队" : "已交给报告员（工作中）",
      );
      // 审计（四角色评审 §7.2）：投递成功后写 `dispatch.accepted{actorRoleId:"app", power:"app",
      // trigger:"intent-handoff"}`——应用投递 ≠ 客户批准，**不写 customerDecision/decisionEvidence**。
      // `intent.handed-off` 由编排（run-role 的 handOffIntent 包装器）在本回执成功后写——桌面**不再
      // 重复写**，两份事件各一份。失败不写；账本失败只记诊断，不翻转投递、不重试；根不存在
      // （测试/异常根）不创建目录，按跳过记诊断。
      if (fs.existsSync(projectRoot)) {
        const appended = await appendGovernanceLedger(projectRoot, {
          at: new Date(this.now()).toISOString(),
          kind: "dispatch.accepted",
          actorRoleId: "app",
          power: "app",
          trigger: "intent-handoff",
          targetRoleId: "rapporteur",
          intentId: payload.intentId,
          ...(payload.flowId !== undefined ? { flowId: payload.flowId } : {}),
          // `messageSummary` ≤200 Unicode 码点（契约；超长截断、不静默改语义）。
          messageSummary: Array.from(payload.summary).slice(0, 200).join(""),
          runtime,
        });
        if (!appended.ok) {
          diagnostic.error("governance.handoff.append.failed", new Error(appended.message), {
            intentId: payload.intentId,
          });
        }
      } else {
        diagnostic.record("governance.handoff.append.skipped", {
          reason: "project-root-missing",
          intentId: payload.intentId,
        });
      }
      diagnostic.record("governance.handoff.delivered", {
        intentId: payload.intentId,
        handoffKind: payload.handoffKind,
        queued: sent.queued === true,
      });
      return {
        ok: true,
        message: `已把意图「${payload.intentId}」交给报告员（handoffKind=${payload.handoffKind}）——交接 ≠ 客户批准。`,
      };
    } catch (error) {
      // 防御：任何意外都如实回执 + 系统行，绝不产生未捕获拒绝、绝不重试。
      return fail(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * **澄清请求的送达端**（W6-B，四角色评审 §5.4；`request_clarification` 注入 Rapporteur 时绑定到本方法）。
   *
   * 编排已判两轮上限并写 `clarification.requested`；本层只在**主入口**（`primaryRoleId`，trio=liaison）
   * 落系统行「报告员需要澄清：<question>」。**不弹客户决定卡、不占「一项目一卡」队列、不写账本**；
   * 客户在 Liaison 回答后由 Liaison 更新意图并用 `hand_off_intent{handoffKind:"clarification"}` 再交接
   * （答案经聊天/编排回传，不走这张系统行）。
   */
  private deliverClarification(
    projectRoot: string,
    runtime: RuntimeKind,
    rapporteurRoleId: string,
    payload: RequestClarificationPayload,
  ): RequestClarificationReceipt {
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: rapporteurRoleId });
    const question = typeof payload?.question === "string" ? payload.question.trim() : "";
    if (question === "") {
      diagnostic.record("governance.clarification.rejected", { reasonCode: "empty-question" });
      return { ok: false, message: "澄清问题不能为空；未提交。" };
    }
    const listing = this.deps.getListing(projectRoot);
    const primaryRoleId =
      listing !== undefined && typeof listing.primaryRoleId === "string" && listing.primaryRoleId !== ""
        ? listing.primaryRoleId
        : rapporteurRoleId;
    try {
      this.emitDeliveryNote(projectRoot, runtime, primaryRoleId, rapporteurRoleId, `报告员需要澄清：${question}`);
    } catch (error) {
      diagnostic.error("governance.clarification.note.failed", error, {
        ...(payload.flowId !== undefined ? { flowId: payload.flowId } : {}),
        ...(payload.intentId !== undefined ? { intentId: payload.intentId } : {}),
      });
      return { ok: false, message: "无法在主入口显示澄清请求；未提交。" };
    }
    diagnostic.record("governance.clarification.noted", {
      ...(payload.flowId !== undefined ? { flowId: payload.flowId } : {}),
      ...(payload.intentId !== undefined ? { intentId: payload.intentId } : {}),
      primaryRoleId,
    });
    return { ok: true, message: `已在主入口（${primaryRoleId}）显示；客户回答后由联络官更新意图并交接。` };
  }

  /**
   * **按会话键互斥入口（F-2-opt2，2026-10-16 客户批准）**：同一会话键的 openInternal 至多一个在跑，
   * 其余按序等待——闭合「用户 open × 投递机自动开」与「两次用户 open」的既有双开窗口（见 `openChains` 注释）。
   * **防死锁**：链内重建续段直调 `openInternalUnsafe`（不再入链）——见 `rebuildIfBoundaryStaleUnsafe`。
   */
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
      return { ok: false, error: "缺少项目根或角色 id。" };
    }
    if (!(RUNTIME_KINDS as readonly string[]).includes(req.runtime)) return { ok: false, error: "未知运行时。" };
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
          note: "会话已就绪，续接当前会话。",
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
          return { ok: false, error: "会话已关闭，请重新点击角色。" };
        }
        current.lastUsed = ++this.lruClock;
        if (userInitiated && this.selectionVersion === selectionVersion) this.activeRoleId = key;
        this.notifyRoleState(req.projectRoot, req.roleId, req.runtime); // 重载/续接恢复真实busy与队列，不另推导。
        let note = "已在该角色的会话中，续接当前会话。";
        if (current.profileRevision !== this.profileRevision(req.runtime)) note = "当前轮次继续使用原配置，新配置在轮次结束后应用。";
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
        return { ok: false, error: `该角色边界已更新，但按新边界重开会话失败：${rebuilt.reopened.error ?? "未知原因"}。请重试。` };
      }
      return rebuilt.reopened;
    }
    // 同一个三元身份才可能复用；跨项目及跨引擎的句柄并存。
    if (existing) {
      await this.disposeEntry(key, existing);
    }

    let listing = this.deps.getListing(req.projectRoot);
    if (!listing) {
      return { ok: false, error: "尚未枚举该项目；请先导入项目（app:list-project）。" };
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
        return { ok: false, error: `项目 ${req.projectRoot} 下未找到角色：${req.roleId}` };
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
    // · legacyBuiltIn：single 模型下的内置治理角色（su）——保持旧能力集（派发/看护/安装/审批档）；
    // · schedule：trio 的 Convener——派发/看护/恢复提议 + 只读 shell；
    // · nomination：trio 的 Nominator——技能/MCP 安装；
    // · rapporteur：只有客户确认通道（不派发、不看护、不安装、无 shell）。
    const governanceModel: GovernanceModel = project.governanceModel ?? "single";
    const governanceFunction = role.governanceFunction;
    const legacyBuiltIn = role.builtIn === true && governanceFunction === undefined && governanceModel === "single";
    const canSchedule = governanceFunction === "schedule" || legacyBuiltIn;
    const canNominate = governanceFunction === "nomination" || legacyBuiltIn;
    // W6-B（四角色评审 §4.3）：按 governanceFunction 路由新增两能力——Liaison 只交接、Rapporteur 只澄清。
    const canLiaise = governanceFunction === "liaison";
    const canClarify = governanceFunction === "proposal";

    // ——— 客户确认制交互（A-1/A-3/A-5）：**仅内置治理角色（su 或 trio 三人）**的会话注入客户交互通道 ———
    //
    // 判据 = 「本角色是内置治理角色」（`role.builtIn`，数据驱动、**不硬编码 "su"**）。注入 ⇒ 编排把本会话
    // 置为**确认制**（`request_confirmation`/`request_choice` 注册；gate 走「客户确认才发行 writeSet」）——
    // 「客户确定了才加、才落盘」。**普通角色的会话一律不注入**（无客户通道：工具不注册、gate 旧语义逐字
    // 不变）。通道未接（deps.customerInput 缺省）⇒ 不注入——**绝不**出现「没人问就放行」。
    // 四角色评审 §4.3：Liaison **不注入** customerInput——它只用聊天问问题，不占「一项目一卡」决定队列；
    // `request_confirmation`/`request_choice` 在 Liaison 会话里结构性不存在。其余内置角色与 single/su 不变。
    // trio 下客户作出决定后的 `customer.decision` 账本写入在编排的 `customerInput` 包装器内（评审 §5.7，
    // 桌面只接线、不另写一份）。
    const customerInput =
      role.builtIn === true && governanceFunction !== "liaison" ? this.deps.customerInput : undefined;

    // W6-B（四角色评审 §6.1）：**决定卡镜像面** = 主入口（`primaryRoleId`，trio 下恒为 liaison）。
    // 仅 trio、仅治理决定卡（`isMirroredGovernanceCard`）且来源角色 ≠ 主入口时给出；single/普通写盘/
    // 无 cardKind 旧卡不镜像。镜像只是**呈现路由**：同一请求 id、同一份 pending、只结算一次。
    const mirrorRoleIdFor = (request: CustomerInputRequest): string | undefined => {
      if (governanceModel !== "trio") return undefined;
      if (!isMirroredGovernanceCard(request.cardKind)) return undefined;
      const primaryRoleId = typeof listing.primaryRoleId === "string" ? listing.primaryRoleId : "";
      if (primaryRoleId === "" || primaryRoleId === req.roleId) return undefined;
      return primaryRoleId;
    };

    // H-1：**派发能力**（契约在 §4 冻结家 `model/runtime.ts`）——评审 §5.6：仅 `governanceFunction ===
    // "schedule"`（Convener）；single/su 保留旧行为（`legacyBuiltIn`）。路由复用 E-1 投递机
    // （`routeDispatch`）；「未注入即不注册」——项目角色与 Rapporteur/Nominator 都拿不到该工具。
    const dispatchTask: DispatchTaskFn | undefined =
      canSchedule
        ? (d: DispatchTaskPayload) => this.routeDispatch(req.projectRoot, req.runtime, req.roleId, d) // Promise<DispatchReceipt>——契约允许（工具侧 await）
        : undefined;
    // W6-B（四角色评审 §5.3）：**意图交接投递端**——仅 Liaison。编排已校验/去重/每轮一次并写
    // `intent.handed-off`；本层只后台开 Rapporteur、投递唯一一条任务、落成功/失败系统行，**不重试**。
    const handOffIntent: HandOffIntentFn | undefined = canLiaise
      ? (payload: HandOffIntentPayload, metadata) =>
          this.deliverIntentHandoff(req.projectRoot, req.runtime, req.roleId, payload, metadata)
      : undefined;
    // W6-B（四角色评审 §5.4）：**澄清送达端**——仅 Rapporteur。编排已判两轮上限并写
    // `clarification.requested`；本层只在主入口（Liaison）落系统行（不弹决定卡、不占一项目一卡）。
    const requestClarification: RequestClarificationFn | undefined = canClarify
      ? (payload: RequestClarificationPayload) =>
          this.deliverClarification(req.projectRoot, req.runtime, req.roleId, payload)
      : undefined;
    // G-2/W5（2026-10-16 客户批准）：**恢复提议能力**（`propose_recovery`）——评审 §5.6：仅 schedule
    // （single/su 保留旧行为）。工具 handler 只把载荷交进来；校验/呈现/执行/如实回执全在本层。
    const proposeRecovery: ProposeRecoveryFn | undefined =
      canSchedule ? (d: ProposeRecoveryPayload) => this.proposeRecovery(req.projectRoot, req.runtime, req.roleId, d) : undefined;
    // G-2/W1（同处注入）：`role_status` / `session_tail` 两只读工具的桌面侧数据源（**仅 schedule**；
    // single/su 保留旧行为）。快照/lastTurn 都是本层同源事实，不在工具层另造。
    const roleStatus: RoleStatusFn | undefined =
      canSchedule ? (query: RoleStatusPayload) => this.roleStatusText(req.projectRoot, query) : undefined;
    const sessionTail: SessionTailFn | undefined =
      canSchedule ? (query: SessionTailPayload) => this.sessionTailText(req.projectRoot, query) : undefined;
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

    // (a) 操作者确认通道（I-1 arm；**2026-10-17 起 su 也构造**）：项目角色 → 编排装配 (c)/(b)/(a) 三层链；
    // 内置治理角色（su）→ 经下方 `shellOperatorOnly` 装配**审批档**。通道**每会话闭包绑定** roleId/
    // projectRoot/runtime 与本轮 signal（裁决与卡片都按该会话归档）。
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
    // 走三层链（su 不自审）。缺省 ⇒ 编排对「规则集未注入」一律拒绝（fail-closed，绝不放宽）。
    const shellArming = role.builtIn === true ? undefined : this.deps.shellArming;

    // **su 审批档（客户裁定 2026-10-17）**：仅 **single 模型下的内置治理角色（su）** 把 **(c) 实件 +
    // (a) 通道**（均与项目角色同一份 deps 引用——单一来源、永不漂移）经 `shellOperatorOnly` 交给编排装配审批档：
    //   · (c)=allow（只读白名单）⇒ 直接放行、**0 卡**；
    //   · `risky`/`review`/`deny` ⇒ 客户逐条批准（deny 也可被批准）；拒绝/超时/不可用 = 拒绝。
    // **缺件（deps.shellArming 或 deps.shellOperatorChannel 缺省）⇒ 不传 ⇒ 不 arm**（能力缺席 = fail-closed）。
    // 评审 §5.6：trio 三人**都不接**该审批档（治理决定与命令放行分离）；`governanceModel === "single"` 是硬条件。
    const shellOperatorOnly =
      legacyBuiltIn && this.deps.shellArming && shellOperatorChannel
        ? {
            classifyShell: this.deps.shellArming.classifyShell,
            rules: this.deps.shellArming.rules,
            operatorChannel: shellOperatorChannel,
          }
        : undefined;

    // **trio Convener 只读档（评审 §5.6）**：`governanceFunction === "schedule"` 时从**同一份**
    // `deps.shellArming`（(c) 实件）构造 `{ classifyShell, rules }`——**不带 operator channel**：
    // `(c)=allow` 直接执行；`risky`/`review`/`deny` 一律拒绝，不出客户审批卡。Rapporteur/Nominator 无 shell。
    // single/su 不传（su 走上面的审批档——旧行为逐字不变）。
    const shellReadonly =
      governanceFunction === "schedule" && this.deps.shellArming
        ? {
            classifyShell: this.deps.shellArming.classifyShell,
            rules: this.deps.shellArming.rules,
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
            ? { customerInput: (r: CustomerInputRequest, metadata?: CustomerInputMetadata) => {
                const mirrorRoleId = mirrorRoleIdFor(r);
                // **判断上下文（2026-10-18 双开关评审 §8.2）**：judge 闭包与 turnText 在调用当刻从活会话
                // 条目读取（会话已销毁 ⇒ 缺省，通道不判断）；`metadata` 原样透传（含 run-role 加的
                // `judgeContext`，桌面只消费、不重算）。governanceModel 由 open() 定格。
                const live = this.sessions.get(key);
                const judge = live?.governanceJudge ?? governanceJudge;
                const turnText = live?.lastUserText;
                return customerInput(
                  r,
                  {
                    roleId: req.roleId,
                    runtime: req.runtime,
                    projectRoot: req.projectRoot,
                    sessionSignal: interactionState.lifetime.signal,
                    governanceModel,
                    ...(mirrorRoleId !== undefined ? { mirrorRoleId } : {}),
                    ...(judge !== undefined ? { governanceJudge: judge } : {}),
                    ...(typeof turnText === "string" && turnText !== "" ? { turnText } : {}),
                  },
                  metadata,
                );
              } }
            : {}),
          // H-1：派发能力（仅 su 会话注入；契约字段名 `dispatchTask`——编排落地后由其转发给适配器）。
          ...(dispatchTask ? { dispatchTask } : {}),
          // W6-B（四角色评审 §5.3/§5.4）：意图交接投递端（仅 Liaison）与澄清送达端（仅 Rapporteur）。
          // 「未注入即不注册」——其余角色拿不到对应工具（fail-closed）。
          ...(handOffIntent ? { handOffIntent } : {}),
          ...(requestClarification ? { requestClarification } : {}),
          // G-2/W5+W1（2026-10-16 客户批准；**仅 su 会话注入**——「未注入即不注册」）：恢复提议能力与两只读
          // 工具的数据面。**待接 O1/R2**（字段名暂定，see 上方注入点注释）：编排透传落树前这些字段被静默忽略，
          // 零行为影响（fail-safe toward 现状）。
          ...(proposeRecovery ? { proposeRecovery } : {}),
          ...(roleStatus ? { roleStatus } : {}),
          ...(sessionTail ? { sessionTail } : {}),
          // G-4/I3：技能安装/卸载能力（**仅 su 会话注入**——「未注入即不注册」；编排透传字段落地前
          // 被其静默忽略，零行为影响；落地后即点亮两工具，见 change 文档的依赖登记）。
          ...(installSkill ? { installSkill } : {}),
          ...(uninstallSkill ? { uninstallSkill } : {}),
          // G-4 V2：外来 MCP 安装/卸载能力（同款注入与登记）。
          ...(installMcp ? { installMcp } : {}),
          ...(uninstallMcp ? { uninstallMcp } : {}),
          // I-1：(a) 操作者确认通道——**项目角色**走 (c)/(b)/(a) 三层链（与下方 `shellArming` 同备）。
          // su 不走此字段（其 (a) 通道在 `shellOperatorOnly` 内，见下）。
          ...(role.builtIn !== true && shellOperatorChannel ? { shellOperatorChannel } : {}),
          // I-1 补丁（2026-10-12，客户重发授权）：(c) 实件（classifyShell + defaultShellRules）——与 (a)
          // 同处装配（缺它 ⇒ 编排对「规则集未注入」一律拒绝——真机曾据此如实报「环境无 shell」）。
          ...(shellArming ? { shellArming } : {}),
          // **su 审批档（客户裁定 2026-10-17）**：仅 single/su 且 (c)+(a) 同备时给出；缺件不传 ⇒ 不 arm。
          ...(shellOperatorOnly ? { shellOperatorOnly } : {}),
          // **trio Convener 只读档（评审 §5.6）**：同一份 (c) 实件、不含 operator channel；
          // `(c)=allow` 直接执行，risky/review/deny 一律拒绝（不出客户审批卡）。
          ...(shellReadonly ? { shellReadonly } : {}),
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
    };
    this.sessions.set(key, entry);
    // 评审 §5.6：只记录**回交主人**（trio=Convener；single=su）的 runtime——看护向主人投递时择路用。
    if (canSchedule) this.lastGovernanceRuntime.set(req.projectRoot, req.runtime);
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
          if (ev.kind !== "handback" && typeof ev.turnId === "string" && ev.turnId !== "" && origin?.clientMessageId !== undefined) {
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
              // 2026-10-18 收尾推进：回交送达 Convener 且本轮 settle ⇒ 把 flowId/回交证据交给 Interface，
              // 由它检查流程单/账本后决定是否后台派 Rapporteur 出验收（本层不判断、不打开会话、不写账本）。
              if (
                settledOrigin?.kind === "handback" &&
                settledOrigin.flowIds !== undefined &&
                settledOrigin.flowIds.length > 0 &&
                this.dispatcherRoleIdOf(en.projectRoot) === roleId
              ) {
                for (const flowId of settledOrigin.flowIds) {
                  try {
                    this.deps.onHandbackSettled?.({
                      projectRoot: en.projectRoot,
                      runtime,
                      roleId,
                      flowId,
                      evidence: settledOrigin.handbackEvidence ?? [],
                    });
                  } catch (error) {
                    createDiagnosticLogger({ component: "desktop.session", projectRoot: en.projectRoot, roleId }).error(
                      "acceptance.handback-settled.failed",
                      error,
                    );
                  }
                }
              }
              const finishedDelivery = this.activeDeliveries.get(this.queueKey(en.projectRoot, roleId, runtime));
              this.activeDeliveries.delete(this.queueKey(en.projectRoot, roleId, runtime)); // 「进行中」随本轮结束撤销
              // 状态准确性：settled = 「本角色离开工作中」的**真实信号**（B-2 下切走的后台轮次结束也走这里）
              // ——先外推再放行队列（放行时 busy 复位已可见）。
              this.notifyRoleState(en.projectRoot, roleId, runtime);
              // G-2/W1：转发放行前的结构化事实（lastTurn 落表 + 看护观察；outcome 只认四值终局——缺事实不猜）。
              if (wasBusy) {
                // 2026-10-18 客户反馈：trio 内置治理角色本轮收尾正文镜像到主入口（Liaison），
                // UI-only 系统行；不 prompt、不触发新轮。取出即删 ⇒ 重复 settle 不重复镜像。
                // 用**事件循环的 projectRoot**（与 lastAssistantText 的 queueKey 同源）——不要用 en.projectRoot
                // （会话 entry 的 root 可能是斜杠变体，getListing 精确匹配会静默 miss）。
                this.mirrorGovernanceFeedback(projectRoot, runtime, roleId);
                const settledOutcomeRaw = origin?.outcome ?? (ev.detail as { outcome?: unknown } | undefined)?.outcome;
                const settledOutcome =
                  settledOutcomeRaw === "completed" || settledOutcomeRaw === "failed" || settledOutcomeRaw === "aborted" || settledOutcomeRaw === "timed_out"
                    ? settledOutcomeRaw
                    : undefined;
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
          // E-1：回交到达 ⇒ 自动投递交 su 验收（去重 + 排队 + 失败如实/保留；见 handleHandback）。
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
            if (detail?.source === 'delivery-boundary' || detail?.source === 'delivery-receipt') envelope.event = { ...ev, summary: '投递历史状态' };
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
          event: { kind: "message", summary: `会话事件流异常：${err instanceof Error ? err.message : String(err)}` },
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
    let targetRoleId = this.activeRoleId;
    if (target !== undefined) targetRoleId = this.targetKey(target) ?? null;
    const selectionVersion = this.selectionVersion;
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot: this.activeEntry()?.projectRoot, roleId: targetRoleId ?? undefined });
    diagnostic.record("session.send.start");
    // O-1（2026-10-12）：发言前先查**边界快照**——陈旧 ⇒ 先作废重建（本条发言直接落到新边界会话上；
    // 重建失败 ⇒ 如实回错、本条不发送）。在跑的轮次由 rebuild 内部跳过（不打断）。
    if (targetRoleId !== null) {
      const rebuilt = await this.rebuildIfBoundaryStale(targetRoleId, !background);
      if (rebuilt !== undefined && !rebuilt.reopened.ok) {
        diagnostic.error("session.send.failed", new Error(rebuilt.reopened.error || "重开失败"));
        return { ok: false, error: `该角色边界已更新，但按新边界重开会话失败：${rebuilt.reopened.error ?? "未知原因"}——本条消息未发送，请重试。` };
      }
    }
    const entry = targetRoleId !== null ? this.sessions.get(targetRoleId) : undefined;
    if (!entry) {
      diagnostic.record("session.send.failed", { reasonCode: "session-not-open" });
      return { ok: false, error: "会话尚未开启（点击左侧角色即可开启）。" };
    }
    // 并发重建可能把活动指针清掉（dispose 置 null、后台重开不抢位）——用户意图仍指向 targetRoleId：复位。
    // （若用户期间开了**别的**角色，activeRoleId 非 null，不动它——不抢位。）
    // **后台投递不复位活动指针**（应用代客户派发 ≠ 用户切换 pane；当前 pane 保持原样）。
    if (this.activeRoleId === null && this.selectionVersion === selectionVersion && !background) this.activeRoleId = targetRoleId;
    this.noteWatchdogActivity(entry.projectRoot, background ? "governance-advance" : "customer-send"); // G-2/W3：客户消息 = 真实活动（无论直发还是入队，都在此定格）
    if (entry.busy || (entry.runtime === "pi" && entry.profileRevision !== this.profileRevision("pi") && this.hasBusyRuntime("pi"))) {
      const roleId = entry.roleId;
      this.enqueueDelivery(entry.projectRoot, roleId, {
        kind: "message",
        clientMessageId,
        runtime: entry.runtime,
        targetRoleId: roleId,
        sourceRoleId: roleId,
        text,
        summary: `你：${shortenText(text, 40)}`,
        // 客户消息逐条独立（**不去重**——同文重复发送是两个意图）：键含自增序号+时间。
        dedupKey: `msg\u0000${++this.messageSeq}\u0000${Date.now()}`,
        // P0-1：**入队即定格**——原包存进条目；投递组合来源和 ACK，图片引用不变。
        ...(opts !== undefined ? { opts } : {}),
      });
      const q = this.deliveryQueues.get(this.queueKey(entry.projectRoot, roleId, entry.runtime));
      diagnostic.record("session.send.queued", { queueDepth: q?.length ?? 0 });
      return { ok: true, queued: true, position: q ? q.length : 1 };
    }
    const roleId = entry.roleId;
    // L-1 顺序修正（与投递机同款，防竞态）：**先置忙再 await**——快适配器（如演示 runtime）的事件
    // （含 `settled`）可能在 `send` 返回前就被消费循环处理完；若此刻才置忙，settled 的复位会被反向覆盖，
    // 忙态将**永不复位**（队列也永不放行）。失败 ⇒ 复位 + 外推（并没有在跑，如实）。
    const origin = this.beginDeliveryOrigin(entry, clientMessageId);
    entry.interactionState.turn = new AbortController();
    entry.busy = true;
    entry.busySince = this.now(); // G-2/W1：本轮起点定格（看护信号 #1 的 elapsed 基准；busy 期间才被读取）
    // P0-2 前置修正（2026-10-13，随停止入口同批）：**开跑即外推 busy=true**——与投递机同款
    //（先置忙即推快照）。旧版只在 round 结束后推：长轮次（真实 pi 一轮数分钟）期间界面根本收不到
    // 「工作中」快照——停止钮与左树徽标都无从在轮次**进行中**出现（快适配器掩盖了这条缝；停止入口
    // 把缝暴露出来）。此处开跑即推（如实）；结束后那次保留（兜底快适配器「settled 先于 send 返回
    // 被消费」的竞态）。
    this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime);
    try {
      // P0-1：组合聊天来源与 ACK；图片数组保持原引用。
      await this.sendDelivery(entry, origin, text, opts);
      this.notifyRoleState(entry.projectRoot, entry.roleId, entry.runtime); // 状态准确性：真开跑即外推「工作中」（繁忙与否以会话条目为准）
      diagnostic.record("session.send.end", { ok: true });
      return { ok: true, ...this.sendFacts(entry, origin) };
    } catch (err) {
      diagnostic.error("session.send.failed", err);
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
      return { ok: false, supported: false, error: `角色 ${roleId} 没有打开的会话——没有可停止的轮次。` };
    }
    // 契约：消费方以 `handle.abort?.()` 调用——**方法缺席**（旧替身）与返回 supported:false 同一处理。
    if (entry.handle.abort === undefined) {
      return { ok: false, supported: false, error: "当前运行时不支持停止" };
    }
    try {
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
    if (target && roleId === undefined) return { ok: false, note: "没有匹配的会话，请指定项目与运行时。" };
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
        return { ok: false, note: `角色 ${roleId} 没有打开的会话。` };
      }
      const err = await this.disposeEntry(roleId, entry);
      return err === null
        ? { ok: true, note: `已关闭与角色 ${roleId} 的会话（历史记录保留在界面上）。` }
        : { ok: false, note: `释放会话出错：${err}` };
    }
    if (this.sessions.size === 0) {
      return { ok: false, note: "当前没有打开的会话。" };
    }
    const n = this.sessions.size;
    let firstError: string | null = null;
    for (const id of [...this.sessions.keys()]) {
      const entry = this.sessions.get(id);
      if (!entry) continue;
      const err = await this.disposeEntry(id, entry);
      if (err !== null && firstError === null) firstError = err;
    }
    if (firstError !== null) return { ok: false, note: `释放会话出错：${firstError}` };
    return { ok: true, note: n === 1 ? "会话已关闭。" : `已关闭全部会话（${n} 个）。` };
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

  /**
   * **收尾反馈镜像**（2026-10-18 客户反馈「内部治理角色，应该都向联络官反馈」）：
   * trio 的内置治理角色（Rapporteur/Nominator/Convener）一轮结束后，把本轮 assistant 正文作为
   * **UI-only 系统行**投到主入口（`primaryRoleId`，Liaison）的 pane——不 prompt 主入口、不触发新轮。
   *  · 仅 trio；`roleId === primaryRoleId` ⇒ 不镜像（Liaison 自己）；
   *  · 仅内置治理角色（`builtIn === true` 且有 `governanceFunction`）——项目角色不镜像（其回交仍走 Convener）；
   *  · 文本**取出即删**（防重复 settle 重复镜像）；trim 后非空、≤2000 码点（超出加 `…`）。
   *  · `getListing` 在精确 miss 时做**斜杠归一兜底**（真机：事件循环 root 与枚举缓存 key 可能正/反斜杠
   *    不一致）；仅查找变体，**不改变**调用方 key。
   *  · 每个 early-return 记一条 `governance.feedback.skip`（不记正文）；成功记 `governance.feedback.mirrored`。
   *    **诊断/镜像任何失败都吞掉**——绝不打断 settle。
   */
  private mirrorGovernanceFeedback(projectRoot: string, runtime: RuntimeKind, roleId: string): void {
    const diagnostic = createDiagnosticLogger({ component: "desktop.governance-feedback", projectRoot, roleId });
    const skip = (reason: "no-listing" | "non-trio" | "primary" | "not-builtin" | "no-text"): void => {
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
      const last = this.lastAssistantText.get(key);
      if (last === undefined) return skip("no-text");
      this.lastAssistantText.delete(key); // 取出即删：重复 settle 不重复镜像
      const text = last.text.trim();
      if (text === "") return skip("no-text");
      const chars = Array.from(text);
      const bounded = chars.length > 2000 ? `${chars.slice(0, 2000).join("")}…` : text;
      const mirroredChars = Array.from(bounded).length;
      this.emitDeliveryNote(projectRoot, runtime, primaryRoleId, roleId, `治理反馈 · ${roleId}：${bounded}`);
      // `targetRoleId`/`count` 是共享白名单里的同义允许名（roleId/chars 本身不在白名单）。
      diagnostic.record("governance.feedback.mirrored", { roleId, targetRoleId: roleId, chars: mirroredChars, count: mirroredChars });
    } catch {
      // 镜像/诊断失败绝不打断 settle（静默降级为「没有这条系统行」）。
    }
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

  /** 队列键：项目 × 目标角色（一套机对多个目标；空目标=主入口暂未枚举到——每次尝试时重解析）。 */
  private queueKey(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): string {
    return `${projectRoot}\u0000${targetRoleId}\u0000${runtime}`;
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
      return { ok: false, error: "撤回参数不完整。" };
    }
    // ① 先查「**进行中**」：在跑条目已在 shift 后**不在队列里**（其队列键也可能已随清空删除）——
    // 直接沿 activeDeliveries 找：命中即撤回无效（如实，与「已投递完」区分开）。
    for (const [key, item] of this.activeDeliveries) {
      const target = key.split("\u0000")[1] ?? "";
      if (target === roleId && item.dedupKey === id) {
        return { ok: false, error: "该条已进入「进行中」，撤回无效（它正在被执行）。" };
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
        return { ok: false, error: "该条不是客户消息（派发/回交属治理流）——只读，不可撤回。" };
      }
      q.splice(idx, 1);
      if (q.length === 0) this.deliveryQueues.delete(key);
      this.notifyRoleState(projectRoot, roleId, item.runtime); // 位次前移/角标随之（既有快照机制；不造第二套）
      return { ok: true, summary: item.summary };
    }
    return { ok: false, error: "该条不在排队中（可能已投递或已撤回）。" };
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
    const view = (i: DeliveryItem) => ({ runtime: i.runtime, kind: i.kind, sourceRoleId: i.sourceRoleId, summary: i.summary, at: i.enqueuedAt, id: i.dedupKey, full: i.kind === "handback" ? i.safeText ?? "交接内容（安全显示副本）：等待生成" : i.text });
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

  private persistenceScope(entry: LiveSession): PersistenceScope { return { projectRoot: entry.projectRoot, roleId: entry.roleId, runtime: entry.runtime }; }
  private persistenceKey(scope: PersistenceScope, id: string): string { return `${scope.projectRoot}\0${scope.roleId}\0${scope.runtime}\0${id}`; }
  private displayHandback(event: HandbackEvent): DesktopOrchestrationEvent {
    const { handback: _internal, ...safe } = event;
    return { kind: 'handback', summary: event.report || event.liveReport ? safe.summary : '回交已收到（旧来源，安全详情未提供）', ...(safe.report ? { report: safe.report } : {}), ...(safe.liveReport ? { liveReport: safe.liveReport } : {}), ...(safe.reportPersistence ? { reportPersistence: safe.reportPersistence } : {}) };
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
    const failed = (code: 'SESSION_NOT_AVAILABLE' | 'SNAPSHOT_EXPIRED' | 'UNSUPPORTED'): PersistenceReply<PersistenceValues[K]> => ({ ok: false, version: 1, scope, code, message: code === 'SNAPSHOT_EXPIRED' ? '原保存材料已失效。' : '当前会话不支持此保存操作。' });
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
          "(未知角色)",
          "收到一条**形状不符**的回交事件（缺 handback 载荷 / 缺 roleId）——**未投递**（如实忽略；不崩、不静默）。"
        );
        return;
      }
      hb = structuredClone(hb);
      if (report) report = structuredClone(report);
      if (liveReport) liveReport = structuredClone(liveReport);
      const ownerRoleId = this.handbackOwnerRoleId(projectRoot);
      if (isBuiltInGovernanceRoleId(hb.roleId) || (ownerRoleId !== null && hb.roleId === ownerRoleId)) return; // 内置治理角色不自我回交（编排也不发；防御）
      const key = `${projectRoot}\u0000${runtime}\u0000${handbackKey(hb)}`;
      if (this.enqueuedHandbackKeys.has(key)) {
        diagnostic.record("report.duplicate");
        return;
      }
      this.enqueuedHandbackKeys.add(key);
      // 输入文案：编排的 `renderHandbackPrompt`（**单一来源**——两前端共用，本层不各写一份）；**入队即定格**。
      // 渲染失败（载荷再坏一档）→ 如实系统行 + 不入队（**绝不**把 undefined 喂进渲染函数）。
      let text: string;
      try {
        text = renderHandbackPrompt(hb);
      } catch (err) {
        this.emitDeliveryNote(projectRoot, runtime,
          ownerRoleId,
          hb.roleId,
          `回交载荷无法渲染（${err instanceof Error ? err.message : String(err)}）——**未投递**（如实忽略；不崩）。`
        );
        return;
      }
      this.enqueueDelivery(projectRoot, ownerRoleId ?? "", {
        kind: "handback",
        runtime,
        targetRoleId: ownerRoleId ?? "",
        sourceRoleId: hb.roleId,
        text,
        summary: `回交投递 · 来自 ${hb.roleId}`,
        dedupKey: key,
        handback: hb,
        ...(flowId !== undefined ? { flowId } : {}),
        ...(report ? { report } : {}),
        ...(liveReport ? { liveReport, liveDurability } : {}),
      });
      diagnostic.record("report.enqueued");
      await this.drainQueue(projectRoot, ownerRoleId, runtime);
    } catch (err) {
      diagnostic.error("report.failed", err);
      // 兜底（belt & braces）：任何意外都如实拦截为系统行——**不产生未捕获拒绝**。
      this.emitDeliveryNote(projectRoot, runtime,
        this.handbackOwnerRoleId(projectRoot),
        "(未知角色)",
        `回交处理异常已拦截（不产生未捕获拒绝）：${err instanceof Error ? err.message : String(err)}`
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
      return fail("派发未受理：roleId 与 task 都必须非空。", "派发未受理：roleId 与 task 都必须非空。");
    }
    // —— 来源防御性校验（评审 §5.6）：trio 必须是 Convener；single 必须是主入口（su）——
    // 正常路径由 `open()` 的能力注入保证（只有 schedule/legacy 注入 dispatchTask）；这里再拒一次，
    // **绝不**把「谁调用」当授权（授权=账本中的客户决定，见下方门禁）。
    const listing = this.deps.getListing(projectRoot);
    const model: GovernanceModel = listing?.governanceModel ?? "single";
    const dispatcherRoleId = this.dispatcherRoleIdOf(projectRoot);
    if (dispatcherRoleId === null) {
      return fail(
        "派发未受理：未枚举到本项目治理模型下的派发主人（trio=Convener / single=主入口）——**未投递**。",
        "派发未受理：未枚举到派发主人——**未投递**（不静默）。",
      );
    }
    if (fromRoleId !== dispatcherRoleId) {
      return fail(
        `派发未受理：来源角色 ${fromRoleId} 不是本项目派发主人 ${dispatcherRoleId}（${model === "trio" ? "Convener" : "主入口"}）。`,
        `派发未受理：来源角色 ${fromRoleId} 不是派发主人 ${dispatcherRoleId}——**未投递**（不静默）。`,
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
        `派发未受理：角色 ${targetRoleId} 不在本项目（未枚举到）。`,
        `派发未受理：角色 ${targetRoleId} 不在本项目——**未投递**（不静默）。`
      );
    }
    if (target.builtIn === true || isBuiltInGovernanceRoleId(targetRoleId)) {
      return fail(
        `派发未受理：${targetRoleId} 是内置治理角色（trio 三人与 su 均不可被派发）——派发对象应是项目角色。`,
        `派发未受理：${targetRoleId} 是内置治理角色——**未投递**（不静默）。`
      );
    }
    const reason = d && typeof d.reason === "string" ? d.reason : undefined;
    const flowId = d && typeof d.flowId === "string" ? d.flowId : undefined;
    const stepId = d && typeof d.stepId === "string" ? d.stepId : undefined;
    // —— 派发范围门（评审 §6.2 五条；门禁只读账本快照，不读 Markdown status）——
    // trio：读 `.ans/governance/ledger.jsonl` 判「已接受提案 + 任命/快捷路径 + 流程步骤 + 未派发过」；
    // single：`evaluateGovernanceGate` 不分流三权门禁（旧行为逐字不变，**不读账本**）。
    const ledgerSnapshot =
      model === "trio"
        ? await (async () => {
            const ledger = await readGovernanceLedger(projectRoot);
            return { entries: ledger.entries, errors: ledger.errors };
          })()
        : { entries: [], errors: [] };
    const gate = evaluateGovernanceGate(
      {
        projectRoot,
        model,
        roleId: fromRoleId,
        action: "dispatch",
        ...(flowId !== undefined ? { flowId } : {}),
        ...(stepId !== undefined ? { stepId } : {}),
        targetRoleId,
      },
      ledgerSnapshot,
    );
    if (!gate.allowed) {
      return fail(
        `派发被治理门禁拒绝：${gate.message}`,
        `派发未受理（治理门禁 ${gate.code}）：${gate.message}——**未投递**（不静默）。`,
      );
    }
    // —— G-1／A2：必读引用接线（提取/判据/渲染 = 编排三件套单一来源；本层只探测 + 按判据分流）——
    // 探测：逐引用算文件**当刻字节**的内容 sha256（复用 `filePrint`；缺失/读失败返回 `<missing>`——
    // `planDispatchDelivery` 判据内天然按缺失处理，无需本层再映射）。
    const probes = new Map<string, string | undefined>();
    for (const readPath of extractDispatchReadPaths(task)) {
      probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
    }
    // 判据必须**紧挨去重登记之前**（见方法注释：拒投不登记——防「键在送达才释放」被拒投项拖成残留误去重）。
    const plan = planDispatchDelivery({ roleId: targetRoleId, task, reason }, probes, { sourceRoleId: fromRoleId });
    if (plan.action === "reject") {
      // fail-closed 拒投：不入队、不登记去重键、不开目标会话；如实回执（工具）+ 系统行（主人聊天流）。
      return fail(plan.message, plan.systemRow);
    }
    // 去重键（评审 §5.6/§6.3-5）：既有 `roleId\0task\0reason` 之外增 `flowId\0stepId`（缺失为空串——
    // single 旧行为不变）。
    const dedupKey = `${projectRoot}\u0000${runtime}\u0000${targetRoleId}\u0000${task}\u0000${reason ?? ""}\u0000${flowId ?? ""}\u0000${stepId ?? ""}`;
    if (this.activeDispatchKeys.has(dedupKey)) {
      return { ok: true, message: `该派发（目标 ${targetRoleId}，同任务文本/流程步骤）已在投递队列中——已去重，不重复投递。` };
    }
    this.activeDispatchKeys.add(dedupKey);
    this.enqueueDelivery(projectRoot, targetRoleId, {
      kind: "dispatch",
      runtime,
      targetRoleId,
      sourceRoleId: fromRoleId,
      ...(flowId !== undefined ? { flowId } : {}),
      // 文本：编排 `planDispatchDelivery` 产出的定格文本（必读块已由**同一单一来源** `renderDispatchPrompt`
      // 注入；无引用 = 旧格式逐字）——本层不另写渲染（本地副本 `renderDispatchPromptLocal` 已删除）。
      text: plan.text,
      summary: `派发 · 来自 ${fromRoleId}：${shortenText(task, 40)}`,
      dedupKey,
    });
    // 账本 `dispatch.accepted`（评审 §5.6/§5.7）：**成功入队后**写；门禁/投递失败不写。
    // 仅 trio（single 旧项目不产生 `.ans/governance` 记录——行为逐字不变）。账本失败**不翻转**派发
    // （只记诊断；客户决定与队列照旧）；`messageSummary` 截断 ≤200 字。
    if (model === "trio") {
      const appended = await appendGovernanceLedger(projectRoot, {
        at: new Date(this.now()).toISOString(),
        kind: "dispatch.accepted",
        ...(flowId !== undefined ? { flowId } : {}),
        ...(stepId !== undefined ? { stepId } : {}),
        actorRoleId: fromRoleId,
        power: "schedule",
        targetRoleId,
        messageSummary: shortenText(task, 200),
        runtime,
      });
      if (!appended.ok) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: fromRoleId }).error(
          "governance.ledger.dispatch.failed",
          new Error(appended.message),
        );
      }
    }
    void this.drainQueue(projectRoot, targetRoleId, runtime);
    return {
      ok: true,
      message:
        `已受理：任务将投递给角色 ${targetRoleId} 的会话` +
        (this.sessions.get(this.sessionKey(projectRoot, targetRoleId, runtime)) ? "" : "（其会话未开——将自动开启）") +
        `；投递结果/失败会在其聊天流与 ${model === "trio" ? `Convener（${fromRoleId}）` : "su"} 的聊天流如实显示（受理≠已完成）。`,
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
      roles.push({
        roleId: entry.roleId,
        runtime: entry.runtime,
        busy: entry.busy,
        ...(entry.busy && typeof entry.busySince === "number" ? { turnStartedAt: entry.busySince } : {}),
        ...(entry.origins.running?.turnId !== undefined ? { turnId: entry.origins.running.turnId } : {}),
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
    const governanceRoleId = this.handbackOwnerRoleId(projectRoot);
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
    if (key === undefined) return { ok: false, error: "未找到匹配的会话（请指定项目与运行时）。" };
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
    if (!entry) return { ok: false, error: "该角色没有打开的会话——无可重建的会话（可先在界面点开该角色，或改用其他动作）。" };
    if (entry.busy) return { ok: false, error: "该角色有轮次在跑——不打断（可先 abort-turn 停止本轮，或等其结束后重试）。" };
    if (this.sessions.get(key) !== entry || entry.busy) return { ok: false, error: "会话状态已变化（并发开启/重建）——本次重建未执行，请核对后重试。" }; // TOCTOU
    const { projectRoot, roleId, runtime } = entry;
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId });
    diagnostic.record("session.rebuild.start", { state: "manual" });
    await this.disposeEntry(key, entry);
    this.deps.emitEvent({
      roleId, projectRoot, runtime,
      event: { kind: "message", summary: `已按要求（客户确认的恢复动作）重建角色 ${roleId} 的会话（保留 ANS 回放）；上下文恢复结果以引擎实际返回为准。` },
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
    if (key === undefined) return { ok: false, message: "未找到匹配的会话/队列（请指定项目与运行时）。" };
    const [projectRoot = "", roleId = "", runtime = "pi"] = key.split("\u0000");
    const qKey = this.queueKey(projectRoot, roleId, runtime as RuntimeKind);
    const queue = this.deliveryQueues.get(qKey) ?? [];
    const inFlight = this.activeDeliveries.get(qKey);
    if (typeof itemId === "string" && itemId !== "") {
      const idxBefore = queue.findIndex((i) => i.dedupKey === itemId);
      if (idxBefore < 0) {
        if (inFlight?.dedupKey === itemId) return { ok: true, message: "该条目已进入「进行中」（正在投递/执行）——无需重投（其收尾按既有 settled 语义）。" };
        return { ok: false, message: "条目不在排队中（可能已投出、已撤回或 id 不符）——未触发重试。" };
      }
      await this.drainQueue(projectRoot, roleId, runtime as RuntimeKind);
      const after = this.deliveryQueues.get(qKey) ?? [];
      const idxAfter = after.findIndex((i) => i.dedupKey === itemId);
      if (idxAfter >= 0) {
        return { ok: true, message: `已触发队列重试；该条目仍在队列第 ${idxAfter + 1} 位（目标忙或未开——保留待重试，下次时机自动再试）。` };
      }
      const nowInFlight = this.activeDeliveries.get(qKey);
      return nowInFlight?.dedupKey === itemId
        ? { ok: true, message: "已触发队列重试；该条目已出队投出（进行中）。" }
        : { ok: true, message: "已触发队列重试；该条目已不在队列（已在本次重试中投出，或已被处理/撤回）。" };
    }
    await this.drainQueue(projectRoot, roleId, runtime as RuntimeKind);
    const after = this.deliveryQueues.get(qKey) ?? [];
    const nowInFlight = this.activeDeliveries.get(qKey);
    if (after.length === 0) {
      return nowInFlight !== undefined
        ? { ok: true, message: "已触发队列重试；队列已清空，该角色的投递已在途（进行中）。" }
        : { ok: true, message: "已触发队列重试；该角色的投递队列已空。" };
    }
    return { ok: true, message: `已触发队列重试；仍有 ${after.length} 条在队列（目标忙或未开——保留待重试），${nowInFlight !== undefined ? "1 条在途" : "无在途"}。` };
  }

  /**
   * **恢复提议桥**（W5；注入 su 会话的 `propose_recovery` 能力——工具 handler 只把载荷交进来，见
   * `makeProposeRecoveryTool`）。流程（设计 §6.2/§6.3）：校验（角色在本项目、action 枚举、evidence 非空）
   * → 推确认卡 → 等待客户 → **恰 allow:true 才执行**（复用 `abort`/`rebuildSession`/`redeliverNudge`）→
   * 回执（契约 `RecoveryReceipt`：四值中**恰 `executed` 为已执行**）如实回拒工具侧 ＋ UI 系统行 ＋
   * **回执经既有投递机投回 su**（kind:"system"）＋ 诊断。取消/关窗/通道失效 = **未获执行**（declined，
   * fail-closed——绝不「没人问就执行」）。
   */
  private async proposeRecovery(projectRoot: string, runtime: RuntimeKind, proposerRoleId: string, d: ProposeRecoveryPayload): Promise<RecoveryReceipt> {
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: proposerRoleId });
    const operatorId = this.deps.recoveryConfirm?.operatorId ?? "unknown";
    // 回执构造（契约形状；`executed` 仅在确已执行时使用——其余一律如实未执行）。
    const receiptOf = (outcome: RecoveryReceipt["outcome"], message: string): RecoveryReceipt => ({
      outcome,
      message,
      operatorId,
      at: new Date(this.now()).toISOString(),
    });
    const refuse = (message: string, reasonCode: string): RecoveryReceipt => {
      diagnostic.record("recovery.refused", { reasonCode });
      this.emitDeliveryNote(projectRoot, runtime, proposerRoleId, proposerRoleId, `恢复提议未受理：${message}`);
      return receiptOf("error", `恢复提议未受理：${message}`);
    };
    // 模型输入一律不可信：即使契约标了必填，也按运行时值全量重校验（不靠类型吃饭）。
    const targetRoleId = typeof d?.roleId === "string" ? d.roleId.trim() : "";
    const action = d?.action as unknown;
    const evidenceRaw = typeof d?.evidence === "string" ? d.evidence : "";
    const reason = typeof d?.reason === "string" && d.reason !== "" ? d.reason : undefined;
    const itemId = typeof d?.itemId === "string" && d.itemId !== "" ? d.itemId : undefined;
    if (targetRoleId === "") return refuse("roleId 必须非空。", "missing-role");
    if (!isRecoveryAction(action)) return refuse(`action 必须是 abort-turn / rebuild-session / redeliver（收到 ${typeof action === "string" ? action : typeof action}）。`, "bad-action");
    if (evidenceRaw.trim() === "") return refuse("evidence（证据）必须非空——恢复动作必须有事实依据。", "missing-evidence");
    // 目标须是**本项目角色**且**不是内置治理角色**（沿 routeDispatch 的校验先例；缓存 miss ⇒ 实时重枚举一次）。
    const findTarget = (): { builtIn?: boolean } | undefined => {
      const listing = this.deps.getListing(projectRoot);
      return listing ? listing.roles.find((r) => r.roleId === targetRoleId) : undefined;
    };
    let target = findTarget();
    if (!target && this.deps.refreshListing) {
      try {
        await this.deps.refreshListing(projectRoot);
      } catch {
        // 重枚举失败：按原 miss 口径如实拒绝，不上抛。
      }
      target = findTarget();
    }
    if (!target) return refuse(`角色 ${targetRoleId} 不在本项目（未枚举到）——未推送任何确认卡。`, "target-missing");
    // 目标须是**本项目角色**且**不是任一内置治理角色**（评审 §5.6：三人与 su 都不可作为恢复目标；
    // 沿 routeDispatch 的校验先例；缓存 miss ⇒ 实时重枚举一次）。
    if (target.builtIn === true || isBuiltInGovernanceRoleId(targetRoleId)) {
      return refuse(`${targetRoleId} 是内置治理角色——恢复动作只针对项目角色（未推送任何确认卡）。`, "target-builtin");
    }

    const presenter = this.deps.recoveryConfirm;
    if (presenter === undefined) {
      diagnostic.record("recovery.refused", { reasonCode: "channel-unavailable" });
      return receiptOf("declined", "恢复确认通道未接线——未获执行（fail-closed），没有任何动作发生。");
    }
    const suEntry = this.sessions.get(this.sessionKey(projectRoot, proposerRoleId, runtime));
    const signal = suEntry?.interactionState.turn.signal;
    let allowed = false;
    try {
      allowed = await presenter.present(
        {
          // 渲染侧（U1 已落树）消费面：`{id, projectRoot?, runtime?, roleId, action, evidence, reason?, requestedBy?, requestedAt?, itemId?}`。
          projectRoot,
          runtime,
          roleId: targetRoleId,
          action,
          evidence: evidenceRaw, // 逐字（校验按 trim，呈现按原文——不加工、不截断）
          ...(reason !== undefined ? { reason } : {}),
          requestedBy: proposerRoleId,
          requestedAt: new Date(this.now()).toISOString(),
          ...(itemId !== undefined ? { itemId } : {}),
        },
        { roleId: proposerRoleId, projectRoot, runtime, ...(signal !== undefined ? { signal } : {}) },
      );
    } catch (err) {
      // 推达失败（窗口已关等）⇒ 未获执行（fail-closed；presenter 已记诊断）。
      diagnostic.error("recovery.present.failed", err);
      allowed = false;
    }

    let receipt: RecoveryReceipt;
    if (!allowed) {
      receipt = receiptOf("declined", `客户未确认（拒绝/取消，或确认通道失效）——「${recoveryActionLabel(action)}」没有执行，也没有任何动作发生。`);
    } else if (action === "abort-turn") {
      const res = await this.abort({ projectRoot, roleId: targetRoleId, runtime });
      receipt = res.ok
        ? receiptOf("executed", `已请求停止角色「${targetRoleId}」的当前轮次——轮次仍以既有 settled 收尾（不制造「已停止」假象）。`)
        : res.supported
          ? receiptOf("error", res.error ?? "停止失败（未知原因）——未假装已执行。")
          : receiptOf("unsupported", res.error ?? "当前运行时不支持停止。");
    } else if (action === "rebuild-session") {
      const res = await this.rebuildSession({ projectRoot, roleId: targetRoleId, runtime });
      receipt = res.ok
        ? receiptOf("executed", `角色「${targetRoleId}」的会话已重建（保留历史回放；上下文恢复结果以引擎实际返回为准）。`)
        : receiptOf("error", res.error ?? "重建失败（未知原因）——没有任何动作发生。");
    } else {
      const res = await this.redeliverNudge({ projectRoot, roleId: targetRoleId, runtime }, itemId);
      receipt = res.ok ? receiptOf("executed", res.message) : receiptOf("error", res.message);
    }

    // —— 回执三路如实落地（设计 §6.2）：工具返回（上方 return）＋ UI 系统行 ＋ **经既有投递机投回 su** ＋ 诊断 ——
    const executed = receipt.outcome === "executed";
    diagnostic.record("recovery.receipt", { targetRoleId, outcome: receipt.outcome, ok: executed, state: receipt.outcome });
    this.emitDeliveryNote(projectRoot, runtime, proposerRoleId, proposerRoleId, `恢复回执（${recoveryActionLabel(action)} · 角色 ${targetRoleId}）：${receipt.message ?? ""}`);
    this.watchdogDeliver(projectRoot, {
      text: renderRecoveryReceipt({ ...receipt, action, targetRoleId }), // 回执文案＝编排单一来源（O1）
      summary: recoveryReceiptSummary(targetRoleId, action, executed),
      dedupKey: `watchdog\u0000${projectRoot}\u0000recovery-receipt\u0000${receipt.at ?? this.now()}`,
    });
    return receipt;
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
      return { effective: "next-session", note: "该角色当前没有打开的会话（并非在跑轮次）——新会话打开即生效。" };
    }
    if (targetEntry.busy) return { effective: "next-session" }; // 在跑轮次不打断（沿 G-2 语义）；本次回执如实延迟
    const rebuilt = await this.rebuildSession({ projectRoot, roleId, runtime });
    if (rebuilt.ok) return { effective: "rebuilt" };
    if (this.sessions.get(targetSessionKey)?.busy === true) return { effective: "next-session" }; // 竞态：检查后开跑——不报失败
    return { effective: "next-session", error: rebuilt.error ?? "未知原因" };
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
    const verb = acting ? "安装" : "卸载";
    const toolName = acting ? "install_skill" : "uninstall_skill";
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: callerRoleId });
    const refuse = (reason: string, message: string): InstallSkillReceipt => {
      diagnostic.record("skill.refused", { toolName, targetRoleId: typeof d?.roleId === "string" ? d.roleId : "", reasonCode: reason });
      return { ok: false, reason, message };
    };

    // ① 裁定④ 轮次护栏（**先判**；拒绝零副作用——不触目标、不读登记、不投系统行）。
    if (!this.isCustomerInitiatedTurn(projectRoot, runtime, callerRoleId)) {
      return refuse("not-customer-turn", "本动作仅可在客户消息发起的轮次执行——未执行。");
    }

    // ② 载荷防御（模型输入不可信——本层全量重校验，不依赖工具层的参数校验）。
    const roleId = typeof d?.roleId === "string" ? d.roleId.trim() : "";
    const name = typeof d?.name === "string" ? d.name.trim() : "";
    if (roleId === "") return refuse("role-not-found", `角色「${roleId}」不是本项目项目角色（或为内置治理角色）——未执行。`);
    if (name === "") return refuse("not-registered", `技能未登记：docs/skills/${name}/install.md 不存在——先落盘再${verb}；未执行。`);

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
      return refuse("role-not-found", `角色「${roleId}」不是本项目项目角色（或为内置治理角色）——未执行。`);
    }

    // ④ 登记校验（**唯一来源**＝编排 `readSkillRegistration`——与渲染器坏件集逐字同口径，绝不复制解析）。
    const registration = readSkillRegistration(projectRoot, name);
    if (registration === undefined) {
      return refuse(
        "not-registered",
        acting
          ? `技能未登记：docs/skills/${name}/install.md 不存在——先落盘再安装；未执行。`
          : `技能未登记：docs/skills/${name}/install.md 不存在或不可解析——没有可撤销的登记；未执行。`,
      );
    }
    if (acting) {
      if (!registration.roles.includes(roleId)) {
        return refuse("role-not-listed", `登记中未包含角色「${roleId}」——未执行；如确要安装请先更新登记。`);
      }
      if (registration.status !== "installed") {
        return refuse(
          "not-registered",
          `技能未登记为已安装：docs/skills/${name}/install.md 状态为「${registration.status}」——先改登记再安装；未执行。`,
        );
      }
    } else if (registration.status === "installed" && registration.roles.includes(roleId)) {
      // 卸载专有两钉之一：**先改登记再卸载**——登记仍含角色即拒绝（防「工具说撤了、登记没变」）。
      return refuse("registration-unchanged", `登记仍含角色「${roleId}」——先改登记再卸载；未执行。`);
    }

    // ⑤ 内容件存在性与运行期哈希（sha256 **原始字节**——复用 `filePrint` 缓存件；与渲染器/`finalize.ts`
    //   同算法：「哈希只能由代码算」）。缺件 ⇒ 如实拒绝（回执冻形要求 `path`＋`digest`——不拿哨兵充数）。
    const skillRel = `docs/skills/${name}/SKILL.md`;
    const digest = await filePrint(path.join(projectRoot, "docs", "skills", name, "SKILL.md"));
    if (digest === "<missing>") {
      return refuse(
        "not-registered",
        acting
          ? `技能内容缺失：${skillRel} 不存在或不可读——先落盘再安装；未执行。`
          : `技能内容缺失：${skillRel} 不存在或不可读——无法如实回执（sha256 与「文件保留」陈述）；未执行。`,
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
        message: `技能登记已${acting ? "变更" : "撤销"}，但按新登记重建角色「${roleId}」的会话失败：${activation.error}——登记仍在、会话未重建（未假装已生效；可在该角色下一次打开会话时生效，或重试）。`,
      };
    }
    const effective = activation.effective;
    const note = activation.note;

    // ⑦ 如实回执（冻形）＋ `[系统·安装]` 定格系统行（`kind:"system"` 第四类通道真投递给 su——忙时排队、
    //    未开自动开、失败保留重试全复用；不可撤回）＋诊断。**不写盘、不放行任何写入、不改任何写边界**。
    const effectivePhrase =
      effective === "rebuilt"
        ? "已重建该角色会话、即刻生效"
        : note !== undefined
          ? "该角色当前未打开会话——新会话起生效"
          : "该角色正在运行轮次（不打断）——新会话起生效";
    const shortDigest = digest.slice(0, 12);
    const rowText = acting
      ? `${CAPABILITY_INSTALL_SYSTEM_PREFIX} 已安装技能「${name}」→ 角色「${roleId}」；${effectivePhrase}；内容：${skillRel}（sha256 ${shortDigest}）。`
      : `${CAPABILITY_INSTALL_SYSTEM_PREFIX} 已卸载技能「${name}」（角色「${roleId}」）；效果已撤，文件保留于 ${skillRel}（sha256 ${shortDigest}）；${effectivePhrase}。`;
    this.watchdogDeliver(projectRoot, {
      text: rowText,
      summary: `系统·安装 · 已${verb}技能「${name}」· 角色「${roleId}」· ${effective === "rebuilt" ? "即刻生效（已重建）" : "新会话起生效"}`,
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
    const verb = acting ? "安装" : "卸载";
    const toolName = acting ? "install_mcp" : "uninstall_mcp";
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: callerRoleId });
    const refuse = (reason: string, message: string): InstallMcpReceipt => {
      diagnostic.record("mcp.refused", { toolName, targetRoleId: typeof d?.roleId === "string" ? d.roleId : "", reasonCode: reason });
      return { ok: false, reason, message };
    };

    // ① 裁定④ 轮次护栏（**先判**；与技能两工具同判据同文案）。
    if (!this.isCustomerInitiatedTurn(projectRoot, runtime, callerRoleId)) {
      return refuse("not-customer-turn", "本动作仅可在客户消息发起的轮次执行——未执行。");
    }

    // ② 载荷防御（模型输入不可信——本层全量重校验）。
    const roleId = typeof d?.roleId === "string" ? d.roleId.trim() : "";
    const name = typeof d?.name === "string" ? d.name.trim() : "";
    if (roleId === "") return refuse("role-not-found", `角色「${roleId}」不是本项目项目角色（或为内置治理角色）——未执行。`);
    if (name === "") return refuse("not-registered", `MCP 未登记：docs/mcp/${name}.md 不存在——先落盘再${verb}；未执行。`);

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
      return refuse("role-not-found", `角色「${roleId}」不是本项目项目角色（或为内置治理角色）——未执行。`);
    }

    // ④ 声明校验（**唯一来源**＝运行时核心 `readMcpDeclaration`——与装配列表函数逐字同口径，绝不复制解析）。
    const declaration = readMcpDeclaration(projectRoot, name);
    if (declaration === undefined) {
      return refuse(
        "not-registered",
        acting
          ? `MCP 未登记：docs/mcp/${name}.md 不存在——先落盘再安装；未执行。`
          : `MCP 未登记：docs/mcp/${name}.md 不存在或不可解析——没有可撤销的声明；未执行。`,
      );
    }
    if (acting) {
      if (!declaration.roles.includes(roleId)) {
        return refuse("role-not-listed", `登记中未包含角色「${roleId}」——未执行；如确要安装请先更新登记。`);
      }
      if (declaration.status !== "installed") {
        return refuse(
          "not-registered",
          `MCP 未登记为已安装：docs/mcp/${name}.md 状态为「${declaration.status}」——先改声明再安装；未执行。`,
        );
      }
    } else if (declaration.status === "installed" && declaration.roles.includes(roleId)) {
      // 卸载专有两钉之一：**先改声明再卸载**——声明仍含角色即拒绝（防「工具说撤了、声明没变」）。
      return refuse("registration-unchanged", `登记仍含角色「${roleId}」——先改登记再卸载；未执行。`);
    }

    // ⑤ 声明文件存在性与运行期哈希（sha256 **原始字节**——复用 `filePrint`；与技能版同算法）。缺件 ⇒
    //   如实拒绝（回执冻形要求 `path`＋`digest`；卸载须能如实作「文件保留」陈述——不拿哨兵充数）。
    const declarationRel = `docs/mcp/${name}.md`; // ＝视图 `declaration.path` 同口径（回执/诊断同一路径）
    const digest = await filePrint(path.join(projectRoot, "docs", "mcp", `${name}.md`));
    if (digest === "<missing>") {
      return refuse(
        "not-registered",
        acting
          ? `MCP 未登记：${declarationRel} 不存在——先落盘再安装；未执行。`
          : `MCP 声明缺失：${declarationRel} 不存在或不可读——无法如实回执（sha256 与「文件保留」陈述）；未执行。`,
      );
    }

    // ⑥ 激活（共用件 `activateRoleRefresh`——同技能版三态与竞态语义）。
    const activation = await this.activateRoleRefresh(projectRoot, runtime, roleId);
    if (activation.error !== undefined) {
      diagnostic.error("mcp.rebuild.failed", new Error(activation.error), { toolName, targetRoleId: roleId });
      return {
        ok: false,
        reason: "rebuild-failed",
        message: `MCP 声明已${acting ? "变更" : "撤销"}，但按新声明重建角色「${roleId}」的会话失败：${activation.error}——声明仍在、会话未重建（未假装已生效；可在该角色下一次打开会话时生效，或重试）。`,
      };
    }
    const effective = activation.effective;
    const note = activation.note;

    // ⑦ 如实回执（冻形）＋ `[系统·安装]` 定格系统行（同技能版：kind:"system" 第四类通道真投递给 su——
    //    不可撤回）＋诊断。**不写盘、不放行任何写入、不改任何写边界**；诚实面（门禁之外执行＝能力级
    //    授予，**非逐调用受审**）写进系统行（不得宣称受审）。
    const effectivePhrase =
      effective === "rebuilt"
        ? "已重建该角色会话、即刻生效"
        : note !== undefined
          ? "该角色当前未打开会话——新会话起生效"
          : "该角色正在运行轮次（不打断）——新会话起生效";
    const shortDigest = digest.slice(0, 12);
    const rowText = acting
      ? `${CAPABILITY_INSTALL_SYSTEM_PREFIX} 已安装 MCP「${name}」→ 角色「${roleId}」；${effectivePhrase}；声明：${declarationRel}（sha256 ${shortDigest}）；外来 MCP 工具在 ANS 门禁之外执行（能力级授予，非逐调用受审）。`
      : `${CAPABILITY_INSTALL_SYSTEM_PREFIX} 已卸载 MCP「${name}」（角色「${roleId}」）；效果已撤，声明文件保留于 ${declarationRel}（sha256 ${shortDigest}）；已发生的副作用不可撤；${effectivePhrase}。`;
    this.watchdogDeliver(projectRoot, {
      text: rowText,
      summary: `系统·安装 · 已${verb}MCP「${name}」· 角色「${roleId}」· ${effective === "rebuilt" ? "即刻生效（已重建）" : "新会话起生效"}`,
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
    const item = q[0];
    const diagnostic = createDiagnosticLogger({ component: "desktop.delivery", projectRoot, roleId: resolvedTarget });

    if (resolvedTarget === "") {
      const noteKey = this.queueKey(projectRoot, "", runtime);
      if (!this.suDeliveryBlockedNoted.has(noteKey)) {
        this.suDeliveryBlockedNoted.add(noteKey);
        this.emitDeliveryNote(projectRoot, runtime,
          null,
          item.sourceRoleId,
          `有${item.kind === "handback" ? "回交" : "派发任务"}（来自 ${item.sourceRoleId}）待投递，但当前枚举不到目标（主入口角色）——**未投递**（已保留；下次时机自动重试）。`
        );
      }
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
            ? `有回交（来自 ${item.sourceRoleId}）待投递，但**开启 ${resolvedTarget} 会话失败**：${opened.error ?? "未知原因"}——未投递（已保留；下次时机自动重试：你打开 ${resolvedTarget}、或下一次回交/一轮结束）。`
            : `有派发任务（来自 ${item.sourceRoleId}）待投递给角色 ${resolvedTarget}，但**开启其会话失败**：${opened.error ?? "未知原因"}——未投递（已保留；下次时机自动重试：你打开该角色、或下一次派发/一轮结束）。`
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
    let batchCount = 1;
    if (resolvedTarget === this.handbackOwnerRoleId(projectRoot) && item.kind === "handback" && item.handback && !item.deliveryId) {
      while (batchCount < q.length && q[batchCount].kind === "handback" && q[batchCount].handback) batchCount += 1;
    }
    let text = item.text;
    let summary = item.summary;
    if (batchCount > 1) {
      text = renderHandbackBatchPrompt(q.slice(0, batchCount).map((queued) => queued.handback as TaskHandback));
      summary = `回交批次 · ${batchCount} 份报告 · 来自 ${q.slice(0, batchCount).map((queued) => queued.sourceRoleId).join("、")}`;
    }
    const removedItems = q.splice(0, batchCount);
    const sentItems = item.deliveryId && item.batchItems ? [...item.batchItems] : removedItems;
    const sent: DeliveryItem = item.deliveryId ? item : { ...sentItems[0], text, summary, batchItems: sentItems, ...(item.kind === 'handback' ? { deliveryId: randomUUID() } : {}) };
    if (q.length === 0) this.deliveryQueues.delete(key);
    this.notifyRoleState(projectRoot, resolvedTarget, runtime); // L-1：出队即外推（队列行/徽标随之更新）
    // 形状防御（真机崩溃修复的姊妹项）：条目坏了就**不投**——如实一行，绝不把 undefined 喂给 send。
    if (!sent || typeof sent.text !== "string" || sent.text === "") {
      this.emitDeliveryNote(projectRoot, runtime,
        sent && typeof sent.sourceRoleId === "string" ? sent.sourceRoleId : null,
        "(投递机)",
        "投递条目形状不符（缺正文/来源）——已丢弃该条并如实记行（不崩）。"
      );
      diagnostic.record("delivery.claim.end", { state: item.kind, count: batchCount });
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
    this.activeDeliveries.set(key, sent); // 与 busy 同时登记；settled/失败/dispose 精确撤销。
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
      await this.sendDelivery(entry, origin, sent.text, sendOptions, sent.kind === "dispatch");
      diagnostic.record("delivery.end", { ok: true, count: batchCount, state: sent.kind });
      this.notifyRoleState(projectRoot, resolvedTarget, runtime); // 立即外推（running 行即时可见）
      if (sent.kind === "dispatch") this.activeDispatchKeys.delete(sent.dedupKey); // 送达即释放窗口去重（返工可再派）
      if (sent.kind === "handback") {
        this.emitDeliveryNote(projectRoot, runtime, resolvedTarget, sent.sourceRoleId, `已自动投递 ${sentItems.map((queued) => queued.sourceRoleId).join("、")} 的回交给 ${resolvedTarget}（等待验收与汇总）。`);
      } else if (sent.kind === "dispatch") {
        // 派发成功：目标 pane 看得见"任务到货"，派发主人的 pane 有一条受理回执行（受理≠已完成，如实）。
        this.emitDeliveryNote(projectRoot, runtime, resolvedTarget, sent.sourceRoleId, `已接收来自 ${sent.sourceRoleId} 的派发任务——请按任务文本执行，完成后交回报告。`);
        this.emitDeliveryNote(projectRoot, runtime, sent.sourceRoleId, sent.sourceRoleId, `已派发任务给 ${resolvedTarget}（已投递到其会话；其结果/回交会回到本会话）。`);
      }
      // message 类（排队后的客户消息投递）：**不加额外文案**——消息本体随会话事件出现（真实 pi 的
      // 「用户指令：」回显走注入样式行），此前误落进派发分支（「已接收…派发任务」对消息是错口径，已修）。
    } catch (err) {
      if (sent.kind === 'handback') diagnostic.record('delivery.failed', { count: batchCount, state: sent.kind });
      else diagnostic.error("delivery.failed", err, { count: batchCount, state: sent.kind });
      const receipt = err instanceof RuntimeDeliveryError ? err.receipt : sent.attemptId ? this.attemptStates.get(this.persistenceKey(this.persistenceScope(entry), sent.attemptId))?.receipt : undefined;
      if (receipt) this.rememberReceipt(entry, receipt);
      const cAttempt = sent.kind === 'handback' && !!sent.attemptId;
      const canRetry = !cAttempt || !!receipt && !receipt.providerMayHaveStarted && receipt.retryDeliveryAllowed;
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
      const base = sent.kind === "handback" && cAttempt ? !canRetry ? "可能已经处理或保存状态未知，未自动重发；可核对历史保存状态。" : "输入尚未交给模型，未丢弃，已保留同一批次待重试。" : err instanceof Error ? err.message : String(err);
      this.emitDeliveryNote(projectRoot, runtime,
        sent.kind === "handback" ? resolvedTarget : sent.sourceRoleId,
        sent.sourceRoleId,
        sent.kind === "handback"
          ? `回交投递失败（来自 ${sent.sourceRoleId}）：${base}${!cAttempt ? "——未丢弃，已保留待重试（下次时机自动重试）。" : ""}`
          : sent.kind === "dispatch"
            ? `派发投递失败（目标 ${resolvedTarget}）：${base}——**未丢弃**，已保留待重试（下次时机自动重试）。`
            : sent.kind === "system"
              ? `系统消息投递失败（目标 ${resolvedTarget}）：${base}——**未丢弃**，已保留待重试（下次时机自动重试）。`
              : `排队消息投递失败（角色 ${resolvedTarget}）：${base}——**未丢弃**，已保留待重试（下次时机自动重试）。`
      );
    }
    })().catch((err) => {
      // 与 drainQueue 安全壳同款：续段已脱离链，其抛错必须**就地**拦截——绝不产生未捕获拒绝
      // （旧实现里该抛错由 drainQueue 的 catch 收口；F-2-M1 后续段在链外，等价物移到这里）。
      this.emitDeliveryNote(projectRoot, runtime,
        this.handbackOwnerRoleId(projectRoot),
        "(投递机)",
        `投递机异常已拦截（不产生未捕获拒绝）：${err instanceof Error ? err.message : String(err)}`
      );
    });
    diagnostic.record("delivery.claim.end", { state: sent.kind, count: batchCount });
  }
}
