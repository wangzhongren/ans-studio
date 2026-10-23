import type { PersistenceReply, PersistenceValues, PersistenceUpdated, PersistenceScope } from "./session.ts";
import { existsSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import path from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import { createProjectDocumentReader } from "../../src/pipeline/project-document/read-project-document.ts";
import type { ProjectDocumentRef, ProjectDocumentScope, DocumentReadErrorCode, ReadProjectDocumentResult } from "../../src/model/project-document.ts";
// app/desktop/interface.ts
// 桌面应用的 Interface 层：IPC 通道背后的处理器（纯逻辑，不依赖 electron，可在 node 下单测）。
//
// 分层纪律（设计稿 §4、硬约束）：
//  - 主进程只持 Interface 句柄：本层调用门禁引擎（listProject）与编排（openRoleSession），不重实现判定/解析；
//  - 渲染进程不接触 Node/文件系统：一切经本层；
//  - 「导入项目 = 授权；点角色即开聊天」由 SessionManager 强制：无确认弹窗，多轮 send 直发。

import type { BoundarySection1 } from "../../src/model/boundary.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle, RoleSessionAbortResult } from "../../src/pipeline/orchestration/run-role.ts";
import type { GovernanceFunction, GovernanceModel, ProjectConfig } from "../../src/model/role.ts";
// 会话事件流类型：编排把 `RoleSessionHandle.events()` 放宽为 `OrchestrationEvent`（既有 `SessionEvent`
// + 编排在 `settled` 时追加的 `handback` 回交事件，设计 §10.8）。外推时套上 `roleId` 信封
// （`SessionEventEnvelope`，B-2）——**类型从编排/本角色只读导入、不复制形状**。
import type { WriteGate, RuntimeAdapter, ShellGate, OperatorChannelFn, CustomerInputFn, DispatchTaskFn, PromptImage, PromptOptions, FinalizeResult } from "../../src/model/runtime.ts";

import { listProject as realListProject } from "../../src/service/role/resolve-role.ts";
import {
  openRoleSession as realOpenRoleSession,
  createPiAdapterFactory as realCreatePiAdapterFactory,
  createRuntimeAdapterFactory as realCreateRuntimeAdapterFactory,
  // 2026-10-22 角色粒度/MapReduce（方案 Q9 A）：团队计划 v2 **唯一**解析/校验实现由编排私有
  // `common/编排/team-plan.ts` 提供，桌面**只经** pipeline 公共出口 `run-role.ts` 消费；
  // 不直接 import 私有 common，也不保留第二份 v2 解析。
  parseTeamPlan,
  teamPlanIssueMessages,
  writesetsOverlap,
  type TeamPlanModule,
  type TeamPlanParseResult,
  type TeamPlanRoleRow as OrchestrationTeamPlanRoleRow,
  type WritesetEntry,
  type RuntimeAdapterFactoryBuilder, type RuntimeAdapterFactoryOptions,
} from "../../src/pipeline/orchestration/run-role.ts";
// I2/C1（2026-10-17 PM 评审 §四.2/§4.6）：建立治理记录的预览/建立机制。**只**经编排的 Pipeline 公共出口
// （`govern-session.ts` 薄再导出）使用——**不得**直接导入 `src/common/编排/finalize.ts`（跨角色私有 common）。
import {
  previewGovernanceRecord as realPreviewGovernanceRecord,
  establishGovernanceRecord as realEstablishGovernanceRecord,
  previewGovernanceReacceptance as realPreviewGovernanceReacceptance,
  reacceptGovernancePins as realReacceptGovernancePins,
  // V1b（评审 §5.5）：迁移预览/写入——编排 Pipeline 公共出口（薄再导出），桌面只接线。
  previewGovernanceMigration as realPreviewGovernanceMigration,
  migrateGovernanceModel as realMigrateGovernanceModel,
  createShellJudge as realCreateShellJudge,
  // 2026-10-18 双开关评审 §7.6/§8.2：「替我审批/决策」判断闭包——同样只经编排 Pipeline 公共出口。
  createGovernanceJudge as realCreateGovernanceJudge,
  // 2026-10-18 收尾推进：只经 Pipeline 公共出口读账本（不直接导入编排私有 `common/编排/`）。
  readGovernanceLedger,
  // W6-B（四角色评审 §7.2）：应用后台推进成功后写 `dispatch.accepted(app, trigger=customer-decision)`——
  // 账本只经 Pipeline 公共出口（薄再导出）使用，不直接导入编排私有 `common/`。
  appendGovernanceLedger,
  type GovernancePreviewResult,
  type EstablishGovernanceResult,
  type GovernanceRecordInput,
  type GovernanceReacceptInput,
  type GovernanceReacceptWriteInput,
  type GovernanceReacceptPreviewResult,
  type ReacceptGovernancePinsResult,
  type GovernanceMigrationPreviewResult,
  type GovernanceMigrationResult,
  type GovernanceMigrationWriteInput,
  type GovernanceLedgerEntry,
} from "../../src/pipeline/orchestration/govern-session.ts";
export type { GovernanceMigrationPreviewResult, GovernanceMigrationResult } from "../../src/pipeline/orchestration/govern-session.ts";
// 只读 pin 证据检查：**唯一实现**在门禁引擎私有模块，只经 Service 公开出口消费（跨角色边界纪律）。
// 2026-10-20：内置治理角色判定同样经该 Service 公开出口（看护自动中止按角色映射开关用；不复制 id 列表）。
import { inspectPinnedBoundaries, isBuiltInGovernanceRoleId, validateBoundaryYamlText } from "../../src/service/boundary/resolve-boundary.ts";
import { createChatDemoAdapter } from "./chat-adapter.ts";

import {
  buildProjectConfig as realBuildProjectConfig,
  buildEffectiveProjectConfig,
  deriveGovernanceRecord,
  deriveGovernanceRecordWithPins,
  readRoleDocsIndex,
  projectDocumentCandidates,
  type DocsIndexEntry,
  type GovernanceRecordStatus,
} from "./project.ts";
// 治理记录状态类型（PM 评审 §四.1 契约）：定义在 `project.ts`（派生函数同址，避免两处漂移），
// 此处原样再导出供 Interface 消费方（preload/渲染侧类型）引用。
export type { GovernanceRecordState, GovernanceRecordStatus } from "./project.ts";
// 载入器类型（只读导入共享组件类型；**实现**的唯一来源在 `src/common/shared/config-loader.ts`）。
import type { LoadConfigOptions, LoadedConfig } from "../../src/common/shared/config-loader.ts";
import { loadEffectiveConfig as realLoadEffectiveConfig } from "../../src/common/shared/config-loader.ts";
import {
  SessionManager,
  type SessionOpenRequest,
  type SessionTarget,
  type SessionMessageMetadata,
  type SessionManagerDeps,
  type OpenResult,
  type SendResult,
  type StopResult,
  type WithdrawResult,
  type SessionEventEnvelope,
} from "./session.ts";
// I-1 补丁（2026-10-12 客户重发授权）：(c) 规则集实件的形状与构造（**只读转出**——形状 `Omit` 自编排
// `AssembleShellGateOptions`，见 operator-channel.ts；本层不另立第二份）。
import type { DesktopOperatorChannelFn, DesktopShellArming } from "./operator-channel.ts";
// 内置治理角色审批档（客户裁定 2026-10-17；2026-10-19 新规则扩至全部内置治理角色）：审批档装配选项形状的
// **单一来源**同样在编排（`shell-arming.ts::AssembleOperatorShellGateOptions`）——只读导入其类型，本层不另立
// 第二形状。旧只读档（2026-10-12）类型保留兼容；桌面自 2026-10-17 起不再注入 `shellReadonly`。
import type { AssembleOperatorShellGateOptions, AssembleReadonlyShellGateOptions } from "../../src/pipeline/orchestration/shell-arming.ts";
// 客户确认制交互（A-5）：桌面侧的客户通道形状（带角色上下文）——本层只透传，实现在 `customer-input.ts`。
// 判断代批结果行的结构化载荷与人话摘要（2026-10-18 双开关评审 §8.1/§9.3）同源，不在这里另写一份。
import { judgeResultSummary, type DesktopCustomerInputFn, type OperatorJudgeResultPayload } from "./customer-input.ts";
// 治理下一步（2026-10-18 客户修正）：客户决定成功后的**后台派发**。推导/文案纯逻辑在 governance-advance.ts；
// 本层负责打开目标治理角色会话、投递**唯一一条**任务，并把成功/失败经既有 delivery-note 系统行如实落流。
import {
  acceptanceDispatchRecorded,
  acceptanceLastDispatchAtMs,
  buildAcceptanceCriteriaTaskMessage,
  buildAcceptanceTaskMessage,
  buildGovernanceAdvanceMessage,
  buildNominationAlreadyDoneMessage,
  buildRoleReadinessTaskMessage,
  flowCompletionIssue,
  governanceAcceptanceAdvanceNote,
  governanceAcceptanceBlockedNote,
  governanceAcceptanceCriteriaNote,
  governanceAcceptanceCriteriaPath,
  governanceAcceptanceReportPath,
  governanceAdvanceSuccessNote,
  governanceChangePackagePath,
  governanceFlowPath,
  governanceFlowStatePath,
  governanceNominationAlreadyDoneNote,
  governanceNominationFollowUpNote,
  governanceReadinessNote,
  governanceTeamPlanPath,
  type GovernanceAdvanceResult,
  type GovernanceNextStepContext,
  type GovernanceNextStepPayload,
  type GovernanceRiskTier,
} from "./governance-advance.ts";
// 流程**机器状态**（2026-10-19 客户决定「这些全部改成yaml。」）：自动验收门读 `docs/flows/<flowId>.yaml`，
// 用编排的 `parseFlowStateYaml` + `evaluateFlowCompletion` 判定；Markdown 仅人读视图（YAML 缺失时才
// legacy 回退）。**只经 Pipeline 公共出口**消费（`src/pipeline/orchestration/flow-state.ts` 薄再导出），
// 不直接 import 编排私有 `src/common/编排/`；单一实现与 schema 由编排拥有。
import {
  completeAcceptanceStep as realCompleteAcceptanceStep,
  evaluateFlowCompletion,
  flowStatePath,
  observeFlowArtifacts as realObserveFlowArtifacts,
  parseFlowStateYaml,
} from "../../src/pipeline/orchestration/flow-state.ts";
// G-2（2026-10-16 客户批准）：恢复确认卡通道（W5——presenter/回包/关窗清帐在 main 接线，本层只透传）与
// 看护服务（W1+W3——同源快照/系统投递/观察转发都在 SessionManager，本层装配并起停 tick）。
import type { RecoveryConfirmPresenter } from "./recovery-channel.ts";
import { createDiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
import { createWatchdogService, type WatchdogConfig } from "./watchdog.ts";
// 输入区图片附件（K-2）：校验/解码/嗅探的**纯逻辑**（渲染进程不碰文件；字节交主进程校验——内容为准）。
import {
  decodeImageBase64,
  sniffImageMime,
  sanitizeImageName,
  validateImage,
  ALLOWED_IMAGE_MIMES,
  type ImageAttachmentInfo,
} from "./composer-images.ts";
// Pi 配置面板逻辑（纯逻辑）：读写仓库根 `.env`（**经共享模块，只读导入、不复制**，设计 §11/T28）。
import {
  getPiConfig as realGetPiConfig,
  savePiConfig as realSavePiConfig,
  resolveRepoEnvPath,
  type PiConfigView,
  type PiConfigSaveResult,
  type PiConfigEnv,
} from "./pi-config.ts";

import { isRuntimeKind, getRuntimeConfig, saveRuntimeConfig, applyRuntimeConfig, type RuntimeConfigView, type RuntimeConfigSaveResult, type ProfileApplication } from "./runtime-config.ts";
import {
  RUNTIME_UNRESOLVED_MESSAGE,
  persistProjectRuntime,
  readPersistedProjectRuntime,
  resolveProjectRuntime,
  type RuntimeResolution,
  type RuntimeResolutionRequest,
} from "./runtime-resolution.ts";
import { getSessionHistory, type SessionHistoryView } from "./runtime-history.ts";
import type { RuntimeKind } from "../../src/model/runtime.ts";
// 2026-10-20 僵尸步骤自检：跨运行时检查 owner 是否有队列/在途投递（runtime 的单一来源）。
import { RUNTIME_KINDS } from "../../src/common/shared/runtime-shared.ts";

export interface RoleView {
  readonly group?: string;
  readonly groupDuty?: string;
  roleId: string;
  cardPath: string;
  boundaryPath: string;
  cardText: string;
  boundary: BoundarySection1;
  /** 内置治理角色（su / trio 三人）：无角色目录、无 docs 索引。 */
  builtIn: boolean;
  /** 仅 trio 的三个内置治理角色携带（`proposal`/`nomination`/`schedule`）；原样转自门禁引擎枚举。 */
  governanceFunction?: GovernanceFunction;
  changelog: { path: string; text: string } | null;
  docs: DocsIndexEntry[];
  documents?: ProjectDocumentRef[];
}

export interface ListProjectResult {
  documentScope?: ProjectDocumentScope;
  documentReadUnavailable?: DocumentReadErrorCode;
  projectRoot: string;
  roles: RoleView[];
  warnings: string[];
  /**
   * 项目是否已 bootstrap（枚举到**项目角色**）。**原样转自门禁引擎 `listProject` 的 `hasRoles`**
   * （单一来源，本层不重判），供渲染侧据它显示「项目尚未 bootstrap：与 su 对话，让它创建角色」（§10.3）。
   */
  hasRoles: boolean;
  /**
   * **主入口角色 id**（= 门禁引擎 `listProject` 给出的 `primaryRoleId`：single → su；trio → rapporteur）。
   * **原样转自门禁引擎**（单一来源）；渲染侧据此设主位/默认选中，**不得硬编码 "su"**（§10.7）。
   * 注（评审 §5.6）：三权下它只用于主入口/客户镜像；回交/看护/系统行的主人见 `governanceModel` 对应的
   * Convener——本结果不另立第二套路由判据。
   */
  primaryRoleId: string;
  /**
   * **治理模型**（评审 §5.4/§5.6）：原样转自门禁引擎（single/trio）。渲染侧据它显示三权/旧模型提示、
   * 分组内置治理角色；**不得**改用 `docs/proposals` 等产物目录猜测模型。
   */
  governanceModel: GovernanceModel;
  /**
   * **治理记录状态（I1，PM 评审 §四.1）**：由共享载入器事实（`source.kind`/`accepted`/
   * `downgradeReason`）与 `governanceBoundary.path` 经 `deriveGovernanceRecord` 纯派生。
   * - `missing`：无 `.ans/project.json`（与 `hasRoles` **相互独立**——「有角色但无治理记录」= S1）。
   * - `invalid`：记录存在但不可解析、未接受或治理边界路径为空；`reason` 为载入器降级原文。
   * - `present`：记录存在且结构上可用；**不声明 pin 逐文件匹配**（V1 无 `unverified` 态）。
   * 本层只读派生：`listProject` 不写文件、不建目录、不触发 finalize。
   */
  governanceRecord: GovernanceRecordStatus;
}

// —————————————— V1b 迁移入口（评审 §5.5/§11.2；编排侧已就绪） ——————————————
//
// 「su → trio」显式迁移：预览零写入 → 客户确认 → 写 `.ans` + manifest 留痕。机制与结果形状全部在
// 编排 Pipeline 公共出口（`govern-session.ts` 薄再导出）；本层只做「当前导入项目 / confirm /
// previewDigest 64hex」守卫与成功后的收尾，**不重写判定、不接受调用方提供的路径/模型/写路径**。

/** 选图结果（K-2）：`image.dataBase64` 供渲染侧预览；`cancelled` 表示用户取消（**不是失败**）。 */export interface PickImageResult {
  ok: boolean;
  cancelled?: boolean;
  error?: string;
  image?: ImageAttachmentInfo & { dataBase64: string };
}

/** 粘贴/拖入图片的校验结果（K-2）：只**收下与校验**（发送时另经 sendSession 真实字节重校验——P0-1 已接线）。 */
export interface AttachImageResult {
  ok: boolean;
  error?: string;
  image?: ImageAttachmentInfo;
}

// ————————————————— 2026-10-17：「替我审」开关（主进程权威，PM 评审 §6.6/§10.3） —————————————————
//
// 状态**只在主进程内存**：默认 false；启动/渲染重载复位；变化经 `shell:judge-state` 推送；**不写 localStorage/
// `.env`/项目文件**。渲染侧只发意图（`shell:judge-set`），状态以主进程接受为准。开关**只影响之后新到的
// `(a)` 请求**（通道在调用当刻读取 `isEnabled()`）；已挂起卡不受切换影响。

/** 开关应答（§6.6 钉死 `{version:1,...}`；2026-10-18 评审 §3.3 增可选 `available`）。 */
export interface ShellJudgeStateReply {
  version: 1;
  ok: boolean;
  enabled?: boolean;
  error?: string;
  /**
   * 判断能力是否可用（主进程未接 judge 驱动时 false）。本版本恒接真实驱动 ⇒ 恒 true；
   * 渲染侧只在**明确 false** 时禁用并显示「当前版本不支持自动判断」，**不得显示假开启态**。
   */
  available?: boolean;
}

/** 主进程权威的开关状态机（纯内存；由 main.ts 创建并与通道/Interface 共享**同一实例**）。 */
export interface ShellJudgeSwitch {
  isEnabled(): boolean;
  get(): ShellJudgeStateReply & { ok: true; enabled: boolean };
  /** 校验 `{enabled:boolean}`；**失败不改状态**。 */
  set(input: unknown): ShellJudgeStateReply;
  /** 启动/渲染重载复位（默认 false）。 */
  reset(): void;
}

/** 构造开关。主进程（`main.ts`）与 Interface 共持同一实例——两处永不漂移。 */
export function createShellJudgeSwitch(): ShellJudgeSwitch {
  let enabled = false;
  return {
    isEnabled: () => enabled,
    get: () => ({ version: 1, ok: true, enabled }),
    set(input: unknown): ShellJudgeStateReply {
      const record = input !== null && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined;
      if (record === undefined) return { version: 1, ok: false, error: "开关请求无效（需 {enabled:boolean}）。" };
      if (typeof record.enabled !== "boolean") return { version: 1, ok: false, error: "enabled 必须为布尔值。" };
      if (Object.keys(record).some((key) => key !== "enabled")) return { version: 1, ok: false, error: "开关请求含未知字段。" };
      enabled = record.enabled;
      return { version: 1, ok: true, enabled };
    },
    reset() {
      enabled = false;
    },
  };
}

/**
 * `shell:judge-*` 两个 handler 内的来源校验（§6.6：不依赖通用 registrar）。
 * 纯同一性比较（`event.sender === win.webContents`）——单元测试可直接钉住；主进程 handler 只调它。
 */
export function isShellJudgeIpcSender(sender: unknown, expected: unknown): boolean {
  return sender !== undefined && sender !== null && sender === expected;
}

export interface DesktopDeps {
  /** 系统文件夹选择器（由主进程用 electron dialog 注入；测试可注入假实现）。 */
  pickDirectory: () => Promise<string | null>;
  /** 会话事件外推（主进程用它 webContents.send; 测试可注入收集器）。**入参为带 `roleId` 信封的
   *  `SessionEventEnvelope`**（B-2：多会话并存须按角色分发，防串消息）；`envelope.event` 为编排导出的
   *  `OrchestrationEvent`（既有 `SessionEvent` + `handback` 回交事件，§10.8）——类型从编排导入、不复制。 */
  emitEvent: (envelope: SessionEventEnvelope) => void;
  emitPersistenceChange?: (update: PersistenceUpdated) => void;
  // —— 可注入的下游实现（默认用真实实现；单测可替换以隔离）——
  listProjectFn?: (root: string) => Promise<ProjectListing>;
  openRoleSessionFn?: (
    input: {
      roleId: string;
      /** 会话引擎（`SessionManager` 按请求 runtime 传入；与编排 `openRoleSession` 同名字段，缺省＝未指定）。 */
      runtime?: RuntimeKind;
      project: ProjectConfig;
      taskId?: string;
      scope?: undefined;
      /** 客户确认制交互通道（A-1/A-3）：仅内置治理角色（su）会话注入（见 session.ts）。 */
      customerInput?: CustomerInputFn;
      /** 派发任务能力（H-1）：仅内置治理角色（su）会话注入（见 session.ts::routeDispatch）。 */
      dispatchTask?: DispatchTaskFn;
      /** W6-B：意图交接投递端（仅 Liaison 注入；编排已校验/写账本，桌面只后台投递）。 */
      handOffIntent?: import("../../src/model/runtime.ts").HandOffIntentFn;
      /** W6-B：澄清送达端（仅 Rapporteur 注入；编排已判两轮上限/写账本，桌面只落主入口系统行）。 */
      requestClarification?: import("../../src/model/runtime.ts").RequestClarificationFn;
      /** G-2/W5（2026-10-16 客户批准）：恢复提议能力（仅 su 注入；形状＝契约家，编排 O1 透传）。 */
      proposeRecovery?: import("../../src/common/编排/watchdog.ts").ProposeRecoveryFn;
      /** G-2/W1：role_status / session_tail 数据源（仅 su 注入；形状＝契约家）。 */
      roleStatus?: import("../../src/common/编排/watchdog.ts").RoleStatusFn;
      sessionTail?: import("../../src/common/编排/watchdog.ts").SessionTailFn;
      /** G-4/I3（2026-10-16 客户批准）：技能安装/卸载能力（仅 su 注入；形状＝契约家 `model/runtime.ts`）。
       *  编排透传（`AdapterCapabilities` 同名字段）落地前被其静默忽略——桌面侧透传先就位（H-1 先例）。 */
      installSkill?: import("../../src/model/runtime.ts").InstallSkillFn;
      uninstallSkill?: import("../../src/model/runtime.ts").UninstallSkillFn;
      /** G-4 V2：外来 MCP 安装/卸载能力（仅 su 注入；形状＝契约家）。同款透传与登记。 */
      installMcp?: import("../../src/model/runtime.ts").InstallMcpFn;
      uninstallMcp?: import("../../src/model/runtime.ts").UninstallMcpFn;
      /** (a) 操作者确认通道（I-1 arm）：项目角色走三层链；**全部内置治理角色**经 `shellOperatorOnly`
       *  装配审批档（通道对象作为其 `operatorChannel` 字段）。 */
      shellOperatorChannel?: DesktopOperatorChannelFn;
      /** (c) 规则集实件：仅项目角色走三层链（与 (a) 同判据）。 */
      shellArming?: DesktopShellArming;
      /** **内置治理角色审批档（客户裁定 2026-10-17；2026-10-19 新规则扩至全部内置治理角色）**：
       *  形状＝编排 `AssembleOperatorShellGateOptions` 的 `Omit<…, "project">`（只读导入、不另立第二形状）。
       *  只读白名单免审批，其余（含 deny）逐条审批；缺件 ⇒ 不传 ⇒ 不 arm。 */
      shellOperatorOnly?: Omit<AssembleOperatorShellGateOptions, "project">;
      /** **旧只读档（旧路径，类型保留兼容）**：桌面自 2026-10-17 起不再注入（内置治理角色统一改走审批档）。 */
      shellReadonly?: Omit<AssembleReadonlyShellGateOptions, "project">;
    },
    deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter },
  ) => Promise<RoleSessionHandle>;
  createRuntimeAdapterFactoryFn?: RuntimeAdapterFactoryBuilder;
  runtimeOptions?: RuntimeAdapterFactoryOptions;
  /**
   * **「替我审」判断闭包工厂（2026-10-17 PM 评审 §十一）**：缺省经编排 Pipeline 公共出口
   * `govern-session.ts::createShellJudge`（桌面不直接导入私有 `common/编排/`）。测试可注入桩件。
   */
  createShellJudgeFn?: typeof realCreateShellJudge;
  /**
   * **「替我审」开关状态机（主进程权威）**：main.ts 创建**同一实例**并传给通道与 Interface；
   * 缺省自建（默认 false）以便单测直用。开关**只影响之后新到的请求**，不自动打开会话、不持久化。
   */
  shellJudgeSwitch?: ShellJudgeSwitch;
  /**
   * **「替我决策」判断闭包工厂（2026-10-18 双开关评审 §8.2）**：缺省经编排 Pipeline 公共出口
   * `govern-session.ts::createGovernanceJudge`（桌面不直接导入私有 `common/编排/`）。测试可注入桩件。
   */
  createGovernanceJudgeFn?: typeof realCreateGovernanceJudge;
  /**
   * **「替我决策」开关状态机（主进程权威）**：与 approval 同形、**互不影响**；main.ts 创建**同一实例**
   * 并传给客户交互通道与 Interface。缺省自建（默认 false）；只在主进程内存、重载复位、不持久化。
   */
  decisionJudgeSwitch?: ShellJudgeSwitch;
  createPiAdapterFactoryFn?: (project: ProjectConfig, shellGate?: ShellGate) => (gate: WriteGate) => RuntimeAdapter;
  createDemoAdapterFn?: (opts: { gate: WriteGate; boundary: BoundarySection1 }) => RuntimeAdapter;
  buildProjectConfigFn?: typeof realBuildProjectConfig;
  /**
   * 载入有效配置（`.ans` 优先）——**共享载入器**（`src/common/shared/config-loader.ts`，pm 属主；
   * 只读导入、不复制实现）。缺省真实实现；注入以便单测隔离 `governanceRecord` 的三种来源事实。
   * 同时透传给 `SessionManager`，保证界面派生与会话授权链在同一注入下一致。
   */
  loadEffectiveConfig?: (opts: LoadConfigOptions) => Promise<LoadedConfig>;
  /**
   * **I2/C1（existing-project-compat V1，PM 评审 §4.3/§4.4）**：建立治理记录的预览与建立机制——
   * 缺省经编排 Pipeline 公共出口 `src/pipeline/orchestration/govern-session.ts`（薄再导出）调用。
   * 注入以便单测断言透传、guard 拒绝时**不调用机制**、机制错误（busy/already-established…）原样透传。
   * 本层只做 §4.6 的 1–3 号守卫（当前导入项目 / confirm / 不另造互斥）；边界构造、`.ans` 判定与写入
   * 全部在机制内部。
   */
  previewGovernanceRecordFn?: (input: GovernanceRecordInput) => Promise<GovernancePreviewResult>;
  establishGovernanceRecordFn?: (input: GovernanceRecordInput) => Promise<EstablishGovernanceResult>;
  /**
   * **C1（治理记录 pin 不符的重新接受恢复，PM 评审 §5.3）**：只读 pin 证据检查——
   * 缺省经 Service 公开出口 `src/service/boundary/resolve-boundary.ts`（门禁引擎唯一实现）。
   * 注入以便单测隔离「pin 保持一致 / 不符 / 检查抛错」三种事实；`listProject` 的 `governanceRecord`
   * 由它合入后可能为 `pin-mismatch`。
   */
  inspectPinnedBoundariesFn?: typeof inspectPinnedBoundaries;
  /**
   * **C2（同一评审 §5.3）**：重新接受的预览与写入机制——缺省经编排 Pipeline 公共出口
   * `src/pipeline/orchestration/govern-session.ts`（薄再导出）调用。
   * 注入以便单测断言透传、guard 拒绝时**不调用机制**、机制结果原样返回与成功后的刷新/清缓存/通知。
   */
  previewGovernanceReacceptanceFn?: (input: GovernanceReacceptInput) => Promise<GovernanceReacceptPreviewResult>;
  reacceptGovernancePinsFn?: (input: GovernanceReacceptWriteInput) => Promise<ReacceptGovernancePinsResult>;
  /**
   * **V1b 迁移（评审 §5.5）**：预览/写入机制——缺省经编排 Pipeline 公共出口
   * `src/pipeline/orchestration/govern-session.ts`（薄再导出）调用。注入以便单测断言透传、
   * guard 拒绝时**不调用机制**、成功/失败后的收尾分流。
   */
  previewGovernanceMigrationFn?: (input: { projectRoot: string }) => Promise<GovernanceMigrationPreviewResult>;
  migrateGovernanceModelFn?: (input: GovernanceMigrationWriteInput) => Promise<GovernanceMigrationResult>;
  /**
   * 「项目内容可能已变」信号（§10.3）——**主入口角色（su）的一轮结束**时由本层触发，主进程据此向
   * 渲染侧推 `project:changed`，渲染侧重取枚举让左树随 su 建角色而**长出**。缺省无操作（测试可注入收集器）。
   *
   * 触发点见 createDesktopInterface 内的 `emitSessionEvent`：仅当事件是 `settled`（会话一轮结束的终止信号，
   * 真实 Pi 适配器 `agent_settled` 即发此）**且**当前打开的是主入口角色时触发。本层只发「可能变了，去重取」
   * 的提示，**不判定**写入是否发生（那是门禁引擎的事）。
   */
  emitProjectChanged?: () => void;
  /**
   * shell 命令级闸（设计 §7.2）——**已装配 gate** 的历史接缝（保留：调用方直接持有一个已装配 `ShellGate`
   * 时从此传入）。**缺省（不提供）⇒ 不注入** ⇒ Pi 适配器不注册 `run_shell`（能力缺席 = 最强 fail-closed）。
   * I-1（2026-10-12，客户已裁定 arm）起，桌面的常规路径改为交 **(a) 通道**（见下 `shellOperatorChannel`）
   * 给编排装配——本字段不再是 arm 的必经之路。
   */
  shellGate?: ShellGate;
  /**
   * **(a) 操作者确认通道**（I-1，2026-10-12 arm）——交付编排装配：
   * **项目角色** ⇒ (c)/(b)/(a) 三层 `ShellGate`；**全部内置治理角色**（`role.builtIn === true`，含 trio 五人）
   * ⇒ **审批档**（`shellOperatorOnly`）。客户裁定 2026-10-17：只读白名单免审批，其余含 deny 逐条客户/判断
   * agent 批准；**不接 (b)**——不自审。客户新规则 2026-10-19：所有角色都有 shell 权限（含读写与任意命令），
   * 一律提交审批、按原有流程审批；审批链是 shell 副作用的唯一控制。
   * 主进程用 `createDesktopOperatorChannel`（应用内确认卡：命令原文 + 放行/拒绝，拒绝为默认与取消项）
   * 构造后注入；**测试/e2e 可注入替身**。
   */
  shellOperatorChannel?: DesktopOperatorChannelFn;
  /**
   * **(c) 规则集实件（I-1 补丁，2026-10-12 客户重发授权）**——与 `shellOperatorChannel` **同一透传面**：
   * 主进程 arm 时经 `operator-channel.ts::buildDesktopShellArming()` 构造（**只读导入**门禁引擎经 Service
   * 公开出口的 `classifyShell`/`defaultShellRules`——不复制实现）；构造/加载失败 ⇒ `undefined` ⇒
   * **不 arm**（主进程同时撤下 (a) 通道——`run_shell` 不注册，fail-closed）。**项目角色**走向上三层链；
   * **全部内置治理角色**由 session.ts 用**同一份实件**经 `shellOperatorOnly` 装配**审批档**
   * （客户裁定 2026-10-17、2026-10-19 新规则——单一来源，两边永不漂移）。**测试/e2e 可注入替身（桩件）**。
   */
  shellArming?: DesktopShellArming;
  /**
   * 外部浏览器打开（B-1，2026-10-12）：Markdown 链接**外开**（渲染进程不碰 Node——一切经本层）。
   * 由主进程用 electron `shell.openExternal` 注入；**仅 http/https** 在 Interface 层校验
   * （渲染进程传来的 URL 一律视为不可信输入）。缺省 ⇒ 未接线（返回失败，fail-closed——不假装打开成功）。
   */
  openExternalFn?: (url: string) => Promise<void>;
  /**
   * **客户交互通道**（A-1/A-3/A-5，2026-10-12）——su 的 `request_confirmation` / `request_choice`
   * 挂起等客户作答时，经它把请求摆到界面上并取回裁决（**取代了旧 T38 收口确认通道**）。
   * 缺省 ⇒ 不注入 ⇒ **su 的确认制不成立**（两工具不注册）——且**绝不悄悄放行**（无确认制 = 无发行 = 被拒）。
   * 桌面由主进程用 `customer-input.ts::createCustomerInputChannel`（presenter 把请求推为聊天流里的
   * 交互卡 + per-window pending Map + 按请求快照校验回包）构造后传入。**测试/e2e 可注入替身**。
   */
  customerInput?: DesktopCustomerInputFn;
  /**
   * 系统图片选择器（K-2）：由主进程注入（electron dialog + fs 读——**渲染进程不碰文件**）。
   * 返回 `{name, dataBase64}` 或 `null`（用户取消）；抛错 → 本层归为如实失败。测试/e2e 注入替身。
   */
  pickImageFileFn?: () => Promise<{ name: string; dataBase64: string } | null>;
  /**
   * **角色状态外推**（L-1 + 状态准确性；2026-10-12 追加右栏「待办 / 队列」）：某角色的**真实状态快照**——
   * `busy`（会话是否有一轮在跑；后台轮次同样计入）+ `summaries`（既有；徽标/队列行用）+ `queue`
   * （结构化排队条目：来源/摘要/入队时间——**与 summaries 同源**） + `running`（正在跑的那条投递，若有）。
   * 变化时（开/停/开跑/一轮结束/入队/出队）推送；主进程原样透传 `session:role-state`。缺省 ⇒ 界面无队列/忙态显示。
   * 测试可注入收集器。
   */
  emitRoleState?: SessionManagerDeps["emitRoleState"];
  /**
   * Pi 配置面板的目标 `.env` 路径（设计 §11.2）——**可注入**。缺省 = 仓库根 `.env`
   * （`resolveRepoEnvPath()`，与 CLI `--env-file=.env` 同一文件）。**测试/e2e 必须注入系统临时目录下的
   * 假 `.env`**，**绝不指向真实的仓库根 `.env`**（那会改掉客户真实凭据）。
   */
  envFilePath?: string;
  /** 读取面板视图（缺省真实实现；注入以便单测隔离）。 */
  getPiConfigFn?: (envPath: string) => Promise<PiConfigView>;
  /** 保存面板提交（缺省真实实现；注入以便单测隔离）。 */
  savePiConfigFn?: (opts: { envPath: string; updates: Record<string, string>; env?: PiConfigEnv }) => Promise<PiConfigSaveResult>;
  /** 保存后重载所用的环境目标（缺省 `process.env`；注入以便单测不污染真实进程环境）。 */
  piConfigEnv?: PiConfigEnv;
  /**
   * **自动验收派发 / 冷启动补齐的 per-project 引擎选择持久化文件**（2026-10-19 真机缺陷修复）：
   * 主进程传 user-data 下的独立 JSON（如 `<userData>/ans/runtime-selection.json`）——**不写项目 `.ans`、
   * 不碰治理账本**。缺省 ⇒ 持久化关闭（解析器仍按活跃会话/磁盘证据/凭据解析；只是不跨重启记住选择）。
   */
  runtimeStatePath?: string;
  /**
   * **投递队列持久化文件**（2026-10-20 客户要求：应用重启后任务自动续跑）：缺省从 `runtimeStatePath`
   * 同目录派生 `<...>/ans/delivery-queue.json`（仍是 user-data，**不写项目文件、不写 `.env`**）；
   * 测试可显式注入临时路径。未提供 `runtimeStatePath` 时缺省 ⇒ 不持久化（旧行为）。
   */
  deliveryQueueStorePath?: string;
  /**
   * **引擎解析器（可注入）**：缺省＝本层用 `envFilePath`/`piConfigEnv` 调用真实
   * `resolveProjectRuntime`（活跃会话 → 已选/持久化 → `.ans/sessions` 磁盘证据 → 凭据可用性）。
   * 注入以便单测隔离真实 `.env`；缺省实现绝不回退 "claude"（无凭据 ⇒ 不派发 + 系统行）。
   */
  resolveRuntimeFn?: (request: RuntimeResolutionRequest) => Promise<RuntimeResolution>;
  /**
   * **验收通过后的流程收口**（2026-10-20 真机：验收卡代批 accept 后 flow 的 verification 仍 pending，
   * 且又多派了一次 verifier）：缺省经 Pipeline 公共出口 `flow-state.ts::completeAcceptanceStep` 调用；
   * 测试可注入。语义：accepted ⇒ 把保留验收步骤标 done + `evidence:{kind:"acceptance",ref:"acceptance"}`
   * （幂等、原子写、未 accepted 拒绝）。桌面**不写客户决定账本**、不伪造批准。
   */
  completeAcceptanceStepFn?: (input: { projectRoot: string; flowId: string }) => Promise<{
    ok?: boolean;
    error?: string;
    message?: string;
  }>;
  /**
   * **flow artifact 证据补登**（2026-10-20 真机：旧扫描规则写下的证据文件在重启后不会被补
   * `artifact.observed`，Steward 无法把 delivered 步骤标 done）：缺省经 Pipeline 公共出口
   * `flow-state.ts::observeFlowArtifacts` 调用（幂等补登 flow 里 `kind:"artifact"` 步骤的 evidence.ref
   * 文件观察记录）；测试可注入。补登是应用观察文件（owner/power/sha），**不写客户决定账本、不伪造 done**。
   */
  observeFlowArtifactsFn?: (input: { projectRoot: string; flowId: string }) => Promise<{
    ok?: boolean;
    backfilled?: number;
    observed?: number;
    skipped?: number;
    error?: string;
    message?: string;
  }>;
  /**
   * **恢复确认卡通道（G-2/W5，2026-10-16 客户批准）**：主进程用 `recovery-channel.ts` 构造后注入
   * （`present` 推 `recovery:confirm-request`、回包 `recovery:confirm-response` 走 `respond`）。
   * **缺省 ⇒ 恢复提议一律「未接线、未获执行」如实回执（fail-closed）**。
   */
  recoveryConfirm?: RecoveryConfirmPresenter;
  /**
   * **挂起确认数合并视图（G-2/W1）**：主进程把 su 交互卡 / shell 卡 / 恢复卡三通道的按角色挂起数合并后注入
   * （看护静默谓词与「正确等待不报」排除用）。**缺省 ⇒ 恒 0**。
   */
  watchdogPendingSnapshot?: () => { total: number; byRole: Map<string, number> };
  /**
   * **看护服务的注入项（G-2/W1；测试用）**：时钟与配置覆盖（生产走 env＋默认常量——tick 30s、
   * 静默 30s〔客户 2026-10-16 run-5 裁定：5min → 30s〕仅 env 可调）。看护的服务对象＝listing 已导入
   * 项目 ∪ 有会话语/队列的项目。
   */
  watchdogOptions?: { now?: () => number; config?: Partial<WatchdogConfig> };
  /**
   * **链式治理推进的目标事实轮询（2026-10-20 真机假错误修复；测试可缩短）**：
   * `advanceGovernanceFlow` 的 followUp 链不再用「角色当前是否 idle」判完成（刚投递/会话被释放时会立即
   * 假失败——真机 5ms 误报），改为**有界轮询目标事实**：流程状态 YAML 落盘且可解析 / 任命目标角色卡出现。
   * 缺省 500ms 轮询、最长 15min（内部等待上限，不是回合自动中止时限）；`settledGraceMs` 是「角色已 settled」
   * 的短宽限（会话活着、不忙、无后续投递、未被中止——期间仍持续探测事实；会话被释放或被中止不算 settled，
   * 继续等下一次投递/重试）。生产不传，走默认常量。
   */
  governanceChainOptions?: { pollIntervalMs?: number; timeoutMs?: number; settledGraceMs?: number };
}

export interface DesktopInterface {
  retryReportSave(input: unknown): Promise<PersistenceReply<PersistenceValues['retryReportSave']>>;
  getReportSaveState(input: unknown): Promise<PersistenceReply<PersistenceValues['getReportSaveState']>>;
  retryDeliveryHistorySave(input: unknown): Promise<PersistenceReply<PersistenceValues['retryDeliveryHistorySave']>>;
  getDeliveryReceipt(input: unknown): Promise<PersistenceReply<PersistenceValues['getDeliveryReceipt']>>;
  getSessionPersistence(input: unknown): Promise<PersistenceReply<PersistenceValues['getSessionPersistence']>>;
  pickProject(): Promise<string | null>;
  readProjectDocument(input: unknown): Promise<ReadProjectDocumentResult>;
  disposeProjectDocuments(): void;
  listProject(input: { projectRoot: string }): Promise<ListProjectResult>;
  /**
   * **I2/C1（existing-project-compat V1）**：预览「建立治理记录」——**只读**（不写文件、不建目录）。
   * 守卫：`projectRoot` 非空且等于当前导入项目；否则 `invalid-request`（本层合成，不调用机制）。
   * 其余状态/门禁错误（`busy`/`already-established`/`invalid-record`/`no-roles`/`nothing-to-pin`/
   * `unparseable-governance-doc`/`blocked`）由机制原样透传。
   */
  previewGovernanceRecord(input: { projectRoot: string; governanceModel?: GovernanceModel }): Promise<GovernancePreviewResult>;
  /**
   * **I2/C1**：显式建立治理记录（仅操作者在预览面板确认后触发）。守卫（PM 评审 §4.6 本层负责 1–3）：
   * `projectRoot` 必须是当前导入项目、`confirm === true`；`governanceModel`（若给）必须是 `single`/`trio`
   * ——缺省 `single`（旧行为逐字不变），显式 `trio` 才由机制写入 `.ans`。按项目的在途互斥由机制内部负责
   * （`busy`），本层**不造第二份**。成功后清该项目的列举缓存、调用既有陈旧边界刷新入口
   * （`refreshStaleBoundaries`），并复用既有主→渲染信号 `emitProjectChanged` 让渲染侧重新 `listProject`。
   */
  establishGovernanceRecord(input: { projectRoot: string; confirm: true; governanceModel?: GovernanceModel }): Promise<EstablishGovernanceResult>;
  /**
   * **C2（治理记录 pin 不符的重新接受恢复，PM 评审 §5.3）**：预览重新接受——**只读**（不写文件）。
   * 守卫：`projectRoot` 非空且严格等于当前导入项目；否则 `invalid-request`（本层合成，不调用机制）。
   * 其余状态（busy/no-record/invalid-record/not-needed/blocked）由机制原样透传。
   */
  previewGovernanceReacceptance(input: { projectRoot: string }): Promise<GovernanceReacceptPreviewResult>;
  /**
   * **C2**：显式重新接受现有 pin（仅操作者在预览面板确认后触发）。守卫（本层只做 1–3）：
   * `projectRoot` 是当前导入项目、`confirm === true`、`previewDigest` 为非空 64 位十六进制；
   * 机制层负责其余守卫（仅 pin-mismatch、只写两路径、写前重新求值、互斥与原子写）。
   * `status === "completed"` 或 `"write-failed"`（已进入写入阶段）后：先调用既有
   * `refreshStaleBoundaries`（失败吞掉）→ 清该项目的列举缓存 → 复用 `emitProjectChanged` 让渲染侧
   * 重新 `listProject`。**不自动打开会话**。
   */
  reacceptGovernancePins(input: {
    projectRoot: string;
    confirm: true;
    previewDigest: string;
  }): Promise<ReacceptGovernancePinsResult>;
  /**
   * **V1b 迁移预览**（评审 §5.5）：零写入；先守卫当前导入项目，再透传 `{projectRoot}` 给编排机制。
   * 调用方不得提供路径/模型/写路径。
   */
  previewGovernanceMigration(input: { projectRoot: string }): Promise<GovernanceMigrationPreviewResult>;
  /**
   * **V1b 显式迁移**（评审 §5.5）：守卫当前导入项目、`confirm:true`、`previewDigest` 64 hex；
   * 透传 `{projectRoot, confirm:true, previewDigest}`。`completed`/`write-failed` 后（已进入写入阶段）：
   * 先 `refreshStaleBoundaries()`（沿用既有教训：重建路径要经 `getListing` 取角色表）→ 清列举缓存 →
   * `emitProjectChanged`。**不自动打开会话**；失败不清缓存。
   */
  migrateGovernanceModel(input: { projectRoot: string; confirm: true; previewDigest: string }): Promise<GovernanceMigrationResult>;
  /**
   * **「替我审」开关读取**（PM 评审 §6.6）：主进程权威、默认 false。返回 `{version:1, ok:true, enabled}`。
   * 只读，不改变任何会话或请求状态。
   */
  getShellJudgeState(): ShellJudgeStateReply & { ok: true; enabled: boolean };
  /**
   * **「替我审」开关设置**：仅接受 `{enabled:boolean}`；失败返回 `{ok:false, error}` 且**不改状态**。
   * 成功后**只影响之后新到的 `(a)` 请求**（已挂起卡不受影响）；不打开会话、不写盘。
   */
  setShellJudgeEnabled(input: unknown): ShellJudgeStateReply;
  /** 启动/渲染重载复位（默认 false；PM 评审 §10.3，由 main.ts 在 `loadInterface()` 前调用）。 */
  resetShellJudgeState(): void;
  /**
   * **「替我决策」开关读取**（2026-10-18 双开关评审 §3.3）：与 approval 同形、**互不影响**；
   * 主进程权威、默认 false、重载复位、不持久化。返回 `{version:1, ok:true, enabled, available}`。
   */
  getDecisionJudgeState(): ShellJudgeStateReply & { ok: true; enabled: boolean };
  /** **「替我决策」开关设置**：仅接受 `{enabled:boolean}`；失败不改状态；只影响之后新到的卡。 */
  setDecisionJudgeEnabled(input: unknown): ShellJudgeStateReply;
  /** 启动/渲染重载复位（默认 false；与 approval 各自复位、互不影响）。 */
  resetDecisionJudgeState(): void;
  /**
   * **判断代批结果行落主入口进度行**（§8.3，best-effort）：`approve` 结算后由主进程调用；
   * 经既有 `emitSessionEvent` 的 `message`（`detail.source:"judge-decision"`）落在主入口 Liaison 的角色流。
   * 不造第二张可作答卡、失败只诊断；主入口与来源角色相同（或项目未列举）时不重复发。
   */
  emitJudgeProgress(payload: OperatorJudgeResultPayload): void;
  /** 点角色即开：直接建立/续接与该角色的会话（无确认框；B-2 起切换不再结束旧会话）。 */
  openSession(input: SessionOpenRequest): Promise<OpenResult>;
  /**
   * 发送一轮消息；开启后可反复调用（多轮聊天，不再确认）。
   * **P0-1（2026-10-13 客户批准）**：`images` 为可选图片载荷（渲染侧 base64 块）——**渲染进程报的图
   * 一律不可信**：本层按**真实字节重校验**（base64 严格解码 → 魔数嗅探定类型 → ≤5MB），全过才组
   * `PromptOptions` 下发；任一张不合格 ⇒ **整条拒发**（fail-closed：绝不「丢图发文字」让客户以为图已送达）。
   */
  sendSession(input: { text: string; images?: unknown; target?: SessionTarget; metadata?: SessionMessageMetadata }): Promise<SendResult>;
  /**
   * **应用代客户推进治理流程（2026-10-18 客户修正；同日真机修正为四角色闭环）**：客户决定成功后
   * （`governance:next-step` 回调），在**后台**打开目标治理角色（Nominator/Convener）会话并投递**唯一一条**任务——
   * `proposal accept` → **先** Convener 写 `docs/flows/<flowId>.yaml`（唯一机器状态，首步提名）；应用**有界轮询**
   * 该 YAML 事实（存在且通过校验才放行；角色瞬时忙闲不作判据），合法 ⇒ 再派 Nominator（消息带 YAML 路径），
   * 缺失/非法/超时 ⇒ 系统行如实报错一次、**不循环**；
   * `accept-quick`/`appointment` → Convener 写流程状态 YAML/排程（既有逻辑）。
   * **不抢 `activeRoleId`、不切当前 pane、不自动批准/写盘、不写客户决定**；成功/失败都经既有
   * `delivery-note` 系统行落在发起卡片的角色聊天流（失败如实、不重试循环）。
   * 仅由主进程 `governance:next-step` 回调调用——**不挂 IPC、不暴露给渲染侧**。
   */
  advanceGovernanceFlow(input: { payload: GovernanceNextStepPayload; context?: GovernanceNextStepContext }): Promise<GovernanceAdvanceResult>;
  /** 关闭会话（B-2 **定向**：给定 `roleId` 只关它、历史留在界面上；缺省/`null` 关全部，供换项目/退出）。 */
  stopSession(input?: { roleId?: string | null; projectRoot?: string; runtime?: RuntimeKind }): Promise<StopResult>;
  /**
   * **撤回一条未投递的排队消息（P1-1，2026-10-13 客户裁定）**：`id` = role-state 快照条目视图的 `id`。
   * 仅「客户消息」类、仅在队列中（未投递）者可撤；已「进行中」/派发/回交/不存在 ⇒ 如实回错
   * （`WithdrawResult`）。成功返回 `summary` 供聊天流如实一行「已撤回排队消息：〈摘要〉」。
   */
  withdrawQueued(input: { roleId: string; id: string; projectRoot?: string; runtime?: RuntimeKind }): Promise<WithdrawResult>;
  /**
   * **停当前轮次（P0-2 UI，2026-10-13 客户批准）**：向该角色的会话句柄请求中止当前进行中的轮次。
   * **三态如实回传**（`RoleSessionAbortResult`：已请求停止 / 当前运行时不支持停止 / 停止失败）——
   * 轮次仍以既有 `settled` 收尾，本层不制造「已停止」假象；重复点击幂等（无在飞轮次 = no-op）。
   */
  abortSession(input: SessionTarget): Promise<RoleSessionAbortResult>;
  /** 保活中的角色 id 列表（B-2：左树「有活动会话」小圆点的数据源；纯读、无副作用）。 */
  listLiveSessions(): Promise<string[]>;
  listLiveSessionViews(): Promise<{ projectRoot: string; roleId: string; runtime: RuntimeKind; profileRevision: number }[]>;
  getSessionHistory(input: SessionOpenRequest): Promise<SessionHistoryView>;
  getRuntimeConfig(runtime: RuntimeKind): Promise<RuntimeConfigView>;
  saveRuntimeConfig(input: { runtime: RuntimeKind; updates: unknown }): Promise<RuntimeConfigSaveResult>;
  /**
   * 外部浏览器打开一个链接（B-1：Markdown 链接外开）。**仅 http/https**（Interface 层校验——
   * 渲染进程输入不可信）；成功与否如实返回，不假装成功。
   */
  openExternal(input: { url: string }): Promise<{ ok: boolean; error?: string }>;
  /**
   * **选图**（K-2）：主进程系统文件选择器 + fs 读 → 本层**以真实字节**校验（魔数嗅探定类型、≤5MB）——
   * 渲染进程不碰文件。取消 → `cancelled:true`；失败（超限/非图片/读取失败）→ `ok:false,error` **如实**。
   */
  pickImage(): Promise<PickImageResult>;
  /**
   * **粘贴/拖入的图片**（K-2）：渲染侧经 File API 读出的 base64 交本层——**声明值（name/mime/尺寸）不可信**：
   * 本层按真实字节嗅探类型与判尺寸，只收下与校验；**发送**经 `sendSession`（本层按真实字节**重校验**后
   * 组 `PromptOptions` 送模型——P0-1 已接线）。
   */
  attachImage(input: { name?: unknown; mime?: unknown; dataBase64?: unknown }): Promise<AttachImageResult>;
  /** 读取 Pi 配置面板视图（机密键值**不外发**，见 `pi-config.ts`）。 */
  getPiConfig(): Promise<PiConfigView>;
  /** 保存 Pi 配置到 `.env`（只改面板键、原子；成功后重载 env，下一会话生效）。 */
  savePiConfig(input: { updates: Record<string, string> }): Promise<PiConfigSaveResult>;
  /**
   * **看护器起停（G-2/W1）**：主进程在窗口注册后 `startWatchdog()`（周期 tick＝30s，仅 env 可调）、
   * 窗口关闭时 `stopWatchdog()`。**看护缺席/故障 ⇒ 核心治理零依赖（一切照旧）**——本层绝不因看护
   * 影响任何会话/投递路径。
   */
  startWatchdog(): void;
  stopWatchdog(): void;
}

/**
 * guard 回执里的固定相对路径：与编排 `finalizeRelPaths` 的固定输出**同值**。本层 guard 分支**不写文件**，
 * 这两个字段只是 `EstablishGovernanceResult.finalize` 的形状字段（PM 评审 §4.4）。
 */
const GOVERNANCE_GUARD_PROJECT_JSON_REL = ".ans/project.json";
const GOVERNANCE_GUARD_MANIFEST_REL = "docs/bootstrap-manifest.md";

/** establish 的本层守卫拒绝（阶段固定 `guard`；零调用机制、零写入）。 */
function governanceGuardResult(message: string): EstablishGovernanceResult {
  return {
    ok: false,
    phase: "guard",
    code: "invalid-request",
    finalize: {
      ok: false,
      status: "blocked",
      message,
      reason: message,
      wrote: [],
      pins: [],
      roles: [],
      projectJsonRel: GOVERNANCE_GUARD_PROJECT_JSON_REL,
      manifestRel: GOVERNANCE_GUARD_MANIFEST_REL,
    },
  };
}

/** reaccept 的本层守卫拒绝（阶段固定 `guard`；零调用机制、零写入）。 */
function reacceptGuardResult(message: string): ReacceptGovernancePinsResult {
  return { ok: false, status: "invalid-request", phase: "guard", message, wrote: [] };
}

/** 预览摘要形状：非空 64 位十六进制（`GovernanceReacceptPreview.previewDigest`）。 */
const PREVIEW_DIGEST_HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * 链式治理推进（`advanceGovernanceFlow` 两段式）的**目标事实轮询**参数（2026-10-20 真机修复）。
 * 旧实现用 `waitForRoleIdle` 判「Convener 本轮结束」：刚投递时会话可能尚未标记 busy、也可能被并发重建/
 * 释放——真机在 `advance.dispatched` 后 5ms 就误报「本轮未在时限内结束」。完成条件是**目标事实**
 * （`docs/flows/<flowId>.yaml` 落盘且通过 `parseFlowStateYaml`），不是角色的瞬时忙闲。
 */
const GOVERNANCE_CHAIN_POLL_INTERVAL_MS = 500;
/** 目标事实的最长等待：15min（内部等待上限，留出一次重试/修复落盘的时间；不是回合自动中止时限）。 */
const GOVERNANCE_CHAIN_TIMEOUT_MS = 15 * 60 * 1000;
/** 角色 settled（会话仍活着、不忙、无排队投递、未被中止）后的短宽限：期间继续探测事实，仍不落定才如实失败。 */
const GOVERNANCE_CHAIN_SETTLED_GRACE_MS = 2_000;

/** 流程状态 YAML 的一次探测结果（链式推进的事实轮询用；只读）。 */
type FlowStateProbe =
  | { state: "valid"; nominationDone: boolean }
  | { state: "missing" }
  | { state: "invalid"; error: string }
  | { state: "unreadable"; message: string };

/** 治理模型封闭值域（评审 §5.1/§5.5；缺省 `single`）。 */
function isGovernanceModelValue(value: unknown): value is GovernanceModel {
  return value === "single" || value === "trio";
}

// —————————————— 2026-10-22 治理分工第 1/3/5 项：调度/验收产物定位与团队计划结构读取 ——————————————
//
// 边界纪律：**版本扫描的唯一实现**在编排（`run-role.ts::latestVersionedArtifact`）；本层只在桌面侧
// 读取团队计划/标准/变更包做**确定性结构校验与任务文案**，不写第二套门禁判定、不复制推荐集解析器
// （推荐集仍以编排卡前守卫为准）。这里只做目录列举 + 文件名字版本匹配（与设计方案 §5.1/§7.1 的
// `<flowId>-<kind>-vN.md` 约定一致），读不到即返回 undefined（不猜目录、不静默回落）。

/** 新流程契约的步骤 id（方案 §5.4）：出现任一 ⇒ 该 flow 按新契约校验（legacy flow 保持原行为）。 */
const NEW_CONTRACT_FLOW_STEP_IDS: ReadonlySet<string> = new Set([
  "team-plan",
  "role-cards",
  "role-readiness",
  "acceptance-criteria",
  "change-package",
]);

interface VersionedArtifact {
  relPath: string;
  version: number;
}

type VersionedArtifactVariant = "default" | "team" | "criteria" | "report" | "change";

/**
 * 在 `dirRel` 中找 `<flowId>[-<variant>]-v<N>.md` 的最高版本（只读、只按文件名）。
 * 与编排 `latestVersionedArtifact` 同口径（`default` 还接受 `<flowId>.proposal|nomination-vN.md`）；
 * 本层消费的是**团队计划/标准/报告/变更包**，不用于绑定账本（绑定由编排做）。
 */
async function findLatestVersionedArtifact(
  projectRoot: string,
  dirRel: string,
  flowId: string,
  variant: VersionedArtifactVariant = "default",
): Promise<VersionedArtifact | undefined> {
  if (typeof flowId !== "string" || flowId.trim() === "") return undefined;
  let names: string[];
  try {
    names = await readdir(path.join(projectRoot, ...dirRel.split("/")));
  } catch {
    return undefined;
  }
  const escaped = flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern =
    variant === "default"
      ? new RegExp(`^${escaped}(?:\\.(?:proposal|nomination))?-v(\\d+)\\.md$`)
      : new RegExp(`^${escaped}-${variant}-v(\\d+)\\.md$`);
  let best: { name: string; version: number } | undefined;
  for (const name of names) {
    const match = pattern.exec(name);
    if (match === null) continue;
    const version = Number(match[1]);
    if (!Number.isInteger(version) || version < 1) continue;
    if (best === undefined || version > best.version) best = { name, version };
  }
  return best === undefined ? undefined : { relPath: `${dirRel}/${best.name}`, version: best.version };
}

/**
 * 团队计划角色行的可机械读取部分。
 * · v2（`teamPlanSchema: 2`）：全部字段来自编排单一解析器（经 pipeline 公共出口），含模块/契约/测试面/
 *   dependsOn/并行组/粒度理由/写集条目；桌面只做读取与 V12 覆盖核对，不重解析 v2 语法。
 * · legacy（缺省/`teamPlanSchema: 1`）：只保留 v1 旧行为所需的类型 + 四列；不强制模块/契约/测试面字段。
 */
interface TeamPlanRoleRow {
  roleId: string;
  roleType?: "new" | "changed" | "existing";
  duty: string;
  ability: string;
  writes: string;
  deps: string;
  /** v2：module 原始单元格（可能是 `a+b` 或 `reduce`）。 */
  module?: string;
  modules: string[];
  primaryModule?: string;
  writesets: WritesetEntry[];
  contracts: string[];
  testSurface: string[];
  dependsOn: string[];
  parallelGroup: string;
  granularityRationale?: string;
  isMap: boolean;
  isReduce: boolean;
}

interface TeamPlanInfo {
  relPath: string;
  version: number;
  frontmatterFlowId?: string;
  riskTier?: GovernanceRiskTier;
  recommended?: string[];
  rows: Map<string, TeamPlanRoleRow>;
  /** 计划级结构问题（frontmatter/角色表/V1–V10 等）——来源＝Convener。 */
  planIssues: string[];
  /** 非阻断提醒（legacy 迁移、v2 warning/exception-review）；只记诊断，不派任务。 */
  warnings: string[];
  legacy: boolean;
  teamPlanSchema: 1 | 2;
  modules: string[];
  moduleList: TeamPlanModule[];
}

function cleanTeamPlanCell(cell: string): string {
  return cell.replace(/^[`*_]+/, "").replace(/[`*_]+$/, "").trim();
}

function splitTeamPlanRow(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return undefined;
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function teamPlanRoleType(raw: string): "new" | "changed" | "existing" | undefined {
  const value = raw.toLowerCase();
  if (value === "new" || value === "新增") return "new";
  if (value === "changed" || value === "修改") return "changed";
  if (value === "existing" || value === "既有") return "existing";
  return undefined;
}

/**
 * legacy v1 角色行读取（**仅为桌面旧门控保留类型 + 四列**；v1 的表格语法检查仍由编排单一实现
 * `legacyTeamPlanRoleRowIssues` 负责，本函数不重复其结论，也不解析任何 v2 字段）。
 */
function parseLegacyTeamPlanRows(text: string): { rows: Map<string, TeamPlanRoleRow>; issues: string[] } {
  const rows = new Map<string, TeamPlanRoleRow>();
  const issues: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let headerIndex = -1;
  let header: string[] | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const cells = splitTeamPlanRow(lines[index]!);
    if (cells === undefined) continue;
    if (cells.some((cell) => /^(roleId|role-id|角色id|角色 id)$/i.test(cleanTeamPlanCell(cell)))) {
      headerIndex = index;
      header = cells.map(cleanTeamPlanCell);
      break;
    }
  }
  if (headerIndex === -1 || header === undefined) return { rows, issues };
  const columnOf = (pattern: RegExp): number => header!.findIndex((cell) => pattern.test(cell));
  const roleColumn = columnOf(/^(roleId|role-id|角色id|角色 id)$/i);
  const typeColumn = columnOf(/类型|type/i);
  const dutyColumn = columnOf(/职责/);
  const abilityColumn = columnOf(/能力/);
  const writesColumn = columnOf(/写集|边界/);
  const depsColumn = columnOf(/依赖/);
  if (dutyColumn === -1 || abilityColumn === -1 || writesColumn === -1 || depsColumn === -1) {
    // 缺四列由共享 legacy 校验报出（单一实现），这里不再重复。
    return { rows, issues };
  }
  if (typeColumn === -1) {
    issues.push("团队计划角色表缺少「类型」列（须标 new / changed / existing）");
  }
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = splitTeamPlanRow(lines[index]!);
    if (cells === undefined) break; // 表格结束
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()))) continue;
    const roleId = cleanTeamPlanCell(cells[roleColumn] ?? "");
    if (roleId === "" || rows.has(roleId)) continue;
    const roleType = typeColumn === -1 ? undefined : teamPlanRoleType(cleanTeamPlanCell(cells[typeColumn] ?? ""));
    rows.set(roleId, {
      roleId,
      ...(roleType !== undefined ? { roleType } : {}),
      duty: cleanTeamPlanCell(cells[dutyColumn] ?? ""),
      ability: cleanTeamPlanCell(cells[abilityColumn] ?? ""),
      writes: cleanTeamPlanCell(cells[writesColumn] ?? ""),
      deps: cleanTeamPlanCell(cells[depsColumn] ?? ""),
      modules: [],
      writesets: [],
      contracts: [],
      testSurface: [],
      dependsOn: [],
      parallelGroup: "",
      isMap: false,
      isReduce: false,
    });
  }
  return { rows, issues };
}

function governanceRiskTierOf(value: string | undefined): GovernanceRiskTier | undefined {
  return value === "T0" || value === "T1" || value === "T2" || value === "T3" ? value : undefined;
}

function teamPlanRoleRowOf(row: OrchestrationTeamPlanRoleRow): TeamPlanRoleRow {
  const roleType = teamPlanRoleType(row.roleType);
  return {
    roleId: row.roleId,
    ...(roleType !== undefined ? { roleType } : {}),
    duty: row.duty,
    ability: row.ability,
    writes: row.writeset,
    deps: row.deps,
    module: row.module,
    modules: row.modules,
    ...(row.primaryModule !== undefined ? { primaryModule: row.primaryModule } : {}),
    writesets: row.writesets,
    contracts: row.contracts,
    testSurface: row.testSurface,
    dependsOn: row.dependsOn,
    parallelGroup: row.parallelGroup,
    ...(row.granularityRationale !== undefined ? { granularityRationale: row.granularityRationale } : {}),
    isMap: row.isMap,
    isReduce: row.isReduce,
  };
}

/**
 * 解析团队计划（frontmatter + 模块清单 + 角色表）；只做确定性读取，不判断语义、不写文件。
 * v2 解析/校验的**唯一实现**在编排 `team-plan.ts`（经 pipeline 公共出口）；本函数只把结果适配成桌面
 * 消费形状。legacy 分支保持 v1 旧行为（表头/推荐集/四列非空），只记一条迁移 warning、不阻塞旧流程。
 */
function parseTeamPlanInfo(relPath: string, version: number, text: string): TeamPlanInfo {
  const parsed: TeamPlanParseResult = parseTeamPlan(text);
  const planIssues = new Set<string>(teamPlanIssueMessages(parsed));
  const warnings = new Set<string>();
  const rows = new Map<string, TeamPlanRoleRow>();
  if (parsed.legacy) {
    warnings.add("团队计划未声明 teamPlanSchema: 2：按 v1 兼容校验（不强制模块/公开契约/测试面等 v2 字段；建议迁移团队计划 v2）");
    const legacy = parseLegacyTeamPlanRows(text);
    for (const [roleId, row] of legacy.rows) rows.set(roleId, row);
    for (const issue of legacy.issues) planIssues.add(issue);
    // 桌面 v1 旧门槛中共享 legacy 校验未覆盖的部分（frontmatter/推荐集）——保持旧行为。
    if (!/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(text)) {
      planIssues.add("团队计划缺少 frontmatter（须含 flowId/version/riskTier/recommended）");
    }
    if (parsed.flowId === undefined || parsed.flowId === "") {
      planIssues.add("团队计划 frontmatter 缺少 flowId");
    }
    if (parsed.recommended.length === 0) {
      planIssues.add("团队计划缺少唯一的机器可读推荐集（recommended 内联数组或「推荐：」行；空集/重复/歧义不接受）");
    }
  } else {
    for (const issue of parsed.issues) {
      if (issue.severity !== "error") warnings.add(issue.message);
    }
    for (const row of parsed.roleRows) rows.set(row.roleId, teamPlanRoleRowOf(row));
  }
  const riskTier = governanceRiskTierOf(parsed.riskTier) ?? parseRiskTierFromText(text);
  return {
    relPath,
    version,
    ...(parsed.flowId !== undefined && parsed.flowId !== "" ? { frontmatterFlowId: parsed.flowId } : {}),
    ...(riskTier !== undefined ? { riskTier } : {}),
    ...(parsed.recommended.length > 0 ? { recommended: parsed.recommended } : {}),
    rows,
    planIssues: [...planIssues],
    warnings: [...warnings],
    legacy: parsed.legacy,
    teamPlanSchema: parsed.teamPlanSchema,
    modules: parsed.modules,
    moduleList: parsed.moduleList,
  };
}

/** V12 覆盖判定：计划写集（精确文件或目录）是否被角色 boundary.yaml 的 project 条目覆盖。 */
function boundaryCoversPlanWriteset(
  writeset: WritesetEntry,
  entries: readonly { path: string; kind: string; root?: string }[],
): boolean {
  for (const entry of entries) {
    if (entry.root !== undefined && entry.root !== "project") continue;
    const boundaryPath = entry.path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (boundaryPath === "") continue;
    if (entry.kind === "file") {
      // 文件边界只能覆盖精确同路径的**文件**计划写集；不覆盖同名目录（目录需逐文件授权）。
      if (writeset.directory) continue;
      if (writesetsOverlap(writeset, { raw: boundaryPath, path: boundaryPath, directory: false })) return true;
      continue;
    }
    // directory / conditional-directory：覆盖目录本身及其中任何计划写集（复用共享重叠函数）。
    if (writesetsOverlap(writeset, { raw: boundaryPath, path: `${boundaryPath}/`, directory: true })) return true;
  }
  return false;
}

/**
 * 定位并读取该 flow 的最新团队计划（`docs/scheduling/<flowId>-team-vN.md`）。
 * `preferredRel`（账本 `artifactPath`）优先：若它确为团队计划文件且存在，用之；否则按版本扫描。
 * 找不到/不可读 ⇒ undefined（调用方按 legacy/缺失分支处理，不猜）。
 */
async function readTeamPlanInfo(
  projectRoot: string,
  flowId: string,
  preferredRel?: string,
): Promise<TeamPlanInfo | undefined> {
  let located: VersionedArtifact | undefined;
  if (
    typeof preferredRel === "string" &&
    preferredRel.startsWith("docs/scheduling/") &&
    new RegExp(`^docs/scheduling/${flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-team-v(\\d+)\\.md$`).test(preferredRel)
  ) {
    const version = Number(/team-v(\d+)\.md$/.exec(preferredRel)![1]);
    located = { relPath: preferredRel, version };
  } else {
    located = await findLatestVersionedArtifact(projectRoot, "docs/scheduling", flowId, "team");
  }
  if (located === undefined) return undefined;
  let text: string;
  try {
    text = await readFile(path.join(projectRoot, ...located.relPath.split("/")), "utf8");
  } catch {
    return undefined;
  }
  return parseTeamPlanInfo(located.relPath, located.version, text);
}

/** 从流程/变更包/团队计划的文本中读 `riskTier: T0–T3`（frontmatter 优先，其次全文首现）。 */
function parseRiskTierFromText(text: string): GovernanceRiskTier | undefined {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  const scopes = frontmatter !== null ? [frontmatter[1]!, text] : [text];
  for (const scope of scopes) {
    const match = /(?:^|[^A-Za-z0-9])(T[0-3])(?:[^A-Za-z0-9]|$)/.exec(scope);
    if (match !== null) return match[1] as GovernanceRiskTier;
  }
  return undefined;
}

/** 读变更包（`<flowId>-change-vN.md`）文本与其风险档位；缺失/不可读 ⇒ undefined。 */
async function readChangePackageInfo(
  projectRoot: string,
  flowId: string,
): Promise<{ relPath: string; version: number; text: string; riskTier?: GovernanceRiskTier } | undefined> {
  const located = await findLatestVersionedArtifact(projectRoot, "docs/scheduling", flowId, "change");
  if (located === undefined) return undefined;
  let text: string;
  try {
    text = await readFile(path.join(projectRoot, ...located.relPath.split("/")), "utf8");
  } catch {
    return undefined;
  }
  const riskTier = parseRiskTierFromText(text);
  return { ...located, text, ...(riskTier !== undefined ? { riskTier } : {}) };
}

/** 读实施前标准（`<flowId>-criteria-vN.md`）；缺失/不可读 ⇒ undefined。 */
async function readAcceptanceCriteriaInfo(
  projectRoot: string,
  flowId: string,
): Promise<{ relPath: string; version: number; text: string } | undefined> {
  const located = await findLatestVersionedArtifact(projectRoot, "docs/acceptance", flowId, "criteria");
  if (located === undefined) return undefined;
  try {
    const text = await readFile(path.join(projectRoot, ...located.relPath.split("/")), "utf8");
    return { ...located, text };
  } catch {
    return undefined;
  }
}

/** 账本 `messageSummary` 截断（≤200 Unicode 码点；与编排 `truncateText` 同口径，不静默改语义）。 */
function ledgerSummary(text: string): string {
  const chars = Array.from(text);
  return chars.length <= 200 ? text : chars.slice(0, 200).join("");
}

/**
 * 构造桌面 Interface。持有枚举缓存供会话构造 ProjectConfig，并托管 SessionManager。
 */
export function createDesktopInterface(deps: DesktopDeps): DesktopInterface {
  const listProjectFn = deps.listProjectFn ?? realListProject;
  const openRoleSessionFn = deps.openRoleSessionFn ?? realOpenRoleSession;
  const createPiAdapterFactoryFn = deps.createPiAdapterFactoryFn ?? realCreatePiAdapterFactory;
  const createDemoAdapterFn = deps.createDemoAdapterFn ?? createChatDemoAdapter;
  const buildProjectConfigFn = deps.buildProjectConfigFn ?? realBuildProjectConfig;
  // 治理记录状态与会话授权链共用的**同一份**共享载入器（只读导入，不复制实现）。
  const loadEffectiveConfigFn = deps.loadEffectiveConfig ?? realLoadEffectiveConfig;
  // I2/C1：预览/建立机制（缺省＝编排 Pipeline 公共出口；不直接导入 `src/common/编排/`）。
  const previewGovernanceRecordFn = deps.previewGovernanceRecordFn ?? realPreviewGovernanceRecord;
  const establishGovernanceRecordFn = deps.establishGovernanceRecordFn ?? realEstablishGovernanceRecord;
  // C2：重新接受的预览/写入机制（缺省＝编排 Pipeline 公共出口；不直接导入 `src/common/编排/`）。
  const previewGovernanceReacceptanceFn = deps.previewGovernanceReacceptanceFn ?? realPreviewGovernanceReacceptance;
  const reacceptGovernancePinsFn = deps.reacceptGovernancePinsFn ?? realReacceptGovernancePins;
  // V1b：迁移预览/写入（缺省＝编排 Pipeline 公共出口；不直接导入私有 `common/编排/`）。
  const previewGovernanceMigrationFn = deps.previewGovernanceMigrationFn ?? realPreviewGovernanceMigration;
  const migrateGovernanceModelFn = deps.migrateGovernanceModelFn ?? realMigrateGovernanceModel;
  // C1：pin 证据检查（缺省＝Service 公开出口；门禁引擎唯一实现）。
  const inspectPinnedBoundariesFn = deps.inspectPinnedBoundariesFn ?? inspectPinnedBoundaries;
  // 「替我审」（2026-10-17）：开关状态机（主进程权威）与判断闭包工厂（缺省＝编排 Pipeline 公共出口）。
  const shellJudgeSwitch = deps.shellJudgeSwitch ?? createShellJudgeSwitch();
  const createShellJudgeFn = deps.createShellJudgeFn ?? realCreateShellJudge;
  // 「替我决策」（2026-10-18 双开关评审 §3.3/§8.2）：同形第二套开关（互不影响）与治理判断闭包工厂。
  const decisionJudgeSwitch = deps.decisionJudgeSwitch ?? createShellJudgeSwitch();
  const createGovernanceJudgeFn = deps.createGovernanceJudgeFn ?? realCreateGovernanceJudge;
  // Pi 配置面板：函数与目标路径均可注入（**测试/e2e 必须注入临时 `.env`**，绝不碰真实仓库根 `.env`）。
  const getPiConfigFn = deps.getPiConfigFn ?? realGetPiConfig;
  const savePiConfigFn = deps.savePiConfigFn ?? realSavePiConfig;
  const envFilePath = deps.envFilePath ?? resolveRepoEnvPath();
  // 2026-10-20 客户要求（重启后任务自动续跑）：投递队列持久化文件——user-data 下的独立 JSON；
  // 缺省与引擎选择文件同目录（`<userData>/ans/delivery-queue.json`）；测试可显式注入。
  const deliveryQueueStorePath =
    deps.deliveryQueueStorePath ??
    (typeof deps.runtimeStatePath === "string" && deps.runtimeStatePath !== ""
      ? path.join(path.dirname(deps.runtimeStatePath), "delivery-queue.json")
      : undefined);

  const pendingProfiles = new Set<RuntimeKind>();
  const application = (runtime: RuntimeKind): ProfileApplication => {
    if (pendingProfiles.has(runtime) || manager.hasStaleProfile(runtime)) {
      if (manager.hasBusyRuntime(runtime)) return "after-active-turn";
      return "next-session";
    }
    return "current";
  };
  const listingCache = new Map<string, ProjectListing>();
  const documentReader = createProjectDocumentReader();
  let importedProjectRoot: string | undefined;
  let importSequence = 0;

  /** 某角色是否为主入口角色（据门禁引擎给的 `primaryRoleId`，**不硬编码 "su"**）。 */
  const isPrimaryRole = (projectRoot: string, roleId: string): boolean => listingCache.get(projectRoot)?.primaryRoleId === roleId;

  /**
   * **内置治理角色 settle 后刷新 listing 缓存**（W6-B 真机阻塞修复）：Nominator 任命/写角色卡、
   * Rapporteur 写提案、Convener 写流程、Liaison 写意图——都可能让**同一轮内**的角色表变化；界面/
   * 会话缓存的旧 listing 会误报「角色不在本项目」。settled 后异步 `listProjectFn` → `listingCache.set`
   * → `emitProjectChanged`（渲染侧重取左树）。
   * 纪律：**同项目串行 + 突发合并**（运行中再来的 settled 只标 dirty，结束后补跑一次）；失败只记诊断，
   * 绝不打断会话/事件外推；不自动开会话、不判定写入是否发生。
   */
  const governanceListingRefresh = new Map<string, { running: boolean; dirty: boolean }>();
  const scheduleGovernanceListingRefresh = (projectRoot: string): void => {
    if (typeof projectRoot !== "string" || projectRoot === "") return;
    const state = governanceListingRefresh.get(projectRoot) ?? { running: false, dirty: false };
    if (state.running) {
      state.dirty = true; // 合并本窗口内的后续 settled：结束后只补跑一次
      return;
    }
    state.running = true;
    governanceListingRefresh.set(projectRoot, state);
    void (async () => {
      do {
        state.dirty = false;
        try {
          const fresh = await listProjectFn(projectRoot);
          listingCache.set(fresh.projectRoot, fresh);
          createDiagnosticLogger({ component: "desktop.interface", projectRoot }).record("project.listing.refreshed", {
            reason: "governance-settle",
          });
          try {
            deps.emitProjectChanged?.();
          } catch (error) {
            createDiagnosticLogger({ component: "desktop.interface", projectRoot }).error("project.changed.emit.failed", error);
          }
        } catch (error) {
          // 刷新失败：保留旧缓存，如实记诊断；下一次 settled/显式刷新再试。绝不打断会话。
          createDiagnosticLogger({ component: "desktop.interface", projectRoot }).error("project.listing.refresh.failed", error);
        }
      } while (state.dirty);
      state.running = false;
      governanceListingRefresh.delete(projectRoot);
    })();
  };

  // —————— 验收完成检查调度（2026-10-19 客户反馈：「独立核准应该是标准流程」）——————
  // 触发面：任一角色 settle（含 Convener 的流程状态 YAML/账本更新轮）、回交到达、桌面侧治理账本追加
  // （dispatch.accepted）、导入项目/应用启动后的一次性补齐。调度是**事件 + 有界 tick**：同一项目在
  // 一个 40ms 窗口内最多跑一次检查（后续事件合并不顺延），不是无界轮询。
  const ACCEPTANCE_CHECK_DELAY_MS = 40;
  const acceptanceCheckTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** 合并窗口内首个触发来源（只用于诊断；先到者为准，后续事件不覆盖）。 */
  const acceptanceCheckReasons = new Map<string, "settle" | "ledger" | "import">();
  /** 最近一次真实会话事件的运行时（自动派发时作为优先级 1 候选；重启无记录 ⇒ 交给解析器按后续优先级判定）。 */
  const acceptanceRuntimeHints = new Map<string, RuntimeKind>();
  /** 每 flow 的已知回交证据路径（通用 settle 触发没有回交载荷，用先到的回交事件补齐任务文本）。 */
  const acceptanceEvidenceByFlow = new Map<string, string[]>();
  /**
   * 每 flow 每个 **flow YAML 版本（mtime）** 只派一次（运行期）；持久化去重见账本 `acceptanceLastDispatchAtMs`
   * 与 flow mtime 的比较（2026-10-20 真机：flow 更新后旧永久去重会挡住重派）。值 `-1`＝无 YAML/不可读
   * （legacy 语义：每进程一次）。
   */
  const acceptanceDispatchedFlows = new Map<string, number>();
  /**
   * 每 flow 最近一次**已告知**的收尾门阻塞原因（`flowCompletionIssue` 原文）。同一 flow + 同一原因只发
   * 一次（见 `governanceAcceptanceBlockedNote`），避免每个 settle 刷屏；原因变化才再发。门通过时清除 ⇒
   * 「已解决后再次阻塞」（即使原因文本相同）也会重新告知。运行期记忆：不写账本、不改门禁判定。
   */
  const acceptanceBlockedNotified = new Map<string, string>();
  /** 2026-10-22 第 3 项：实施前标准派发的运行期去重（`projectRoot\0flowId`；跨重启靠账本 stepId=acceptance-criteria）。 */
  const acceptanceCriteriaDispatched = new Set<string>();
  /** 标准/变更包门槛的阻塞提示去重：`projectRoot\0flowId` → 原因（同原因只提示一次；原因变化再提示）。 */
  const acceptanceArtifactBlockedNotified = new Map<string, string>();
  /** 每项目最多一条「无法确定项目引擎」系统行（后续真实事件只记诊断；不循环重试、不刷屏）。 */
  const acceptanceRuntimeUnresolvedNotified = new Set<string>();
  let runAcceptanceCheck: ((projectRoot: string, trigger: "settle" | "ledger" | "import") => Promise<void>) | undefined;

  // —————— 写卡后推进检查（2026-10-19 真机第二缺陷：Crew 已写出角色卡但应用不重新枚举/不自动推进）——————
  // 触发：`appointment-write` answered（含判断代批确认）后、任意内置治理角色 settle 后。先强制刷新 listing，
  // 再按账本 appointment 决定核对目标角色是否全部枚举；齐备且尚无 appointment 之后的 convener
  // dispatch.accepted ⇒ 复用既有 appointment 任务自动派 Convener（每 flow+convener 运行期一次；
  // 持久化去重看账本）。刷新失败/角色仍缺/派发失败**只记诊断**，不发系统行、不循环。
  let runPostWriteAdvanceCheck: ((projectRoot: string) => Promise<void>) | undefined;
  /** 事件突发合并窗口；`roles-missing` 的**有界**重试延迟（写卡落盘/枚举可能滞后）。 */
  const POST_WRITE_ADVANCE_DELAY_MS = 40;
  const POST_WRITE_ADVANCE_RETRY_DELAYS = [100, 300, 600] as const;
  const postWriteAdvanceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /**
   * **appointment → Convener 的共享运行期去重键**（2026-10-19 真机：新检查与原 appointment 链路
   * 都派了 Convener）。两条链路共用同一 Set：投递前先占位、成功保留、失败释放；账本是跨重启的
   * best-effort 持久化去重（append 异步，不能作为进程内唯一判据）。
   *
   * 键的 projectRoot 先**规范化**：`path.resolve` 去相对路径/尾斜杠，`realpath` 解析 `/var`→`/private/var`
   * 等符号链接（best-effort，失败保留 resolve 结果；按输入字符串缓存，项目根在进程内不变）。
   */
  const canonicalProjectRootCache = new Map<string, string>();
  const canonicalProjectRoot = (projectRoot: string): string => {
    const cached = canonicalProjectRootCache.get(projectRoot);
    if (cached !== undefined) return cached;
    let canonical = path.resolve(projectRoot);
    try {
      canonical = realpathSync.native(canonical);
    } catch {
      /* 根不存在/权限不足：保留 path.resolve 结果（键仍可退化为同一字面量比较） */
    }
    canonicalProjectRootCache.set(projectRoot, canonical);
    return canonical;
  };
  const postWriteAdvanceDispatched = new Set<string>();
  /** 账本写入侧的**第二道去重**（同 project+flow+target）：即使两条链路都走到发送，也只产生一条 app 审计。 */
  const applicationDispatchCommitted = new Set<string>();
  const applicationConvenerDispatchKey = (projectRoot: string, flowId: string): string =>
    `${canonicalProjectRoot(projectRoot)}\u0000${flowId}\u0000convener`;
  /** 同一项目串行检查；运行中到达的事件/重试记入 pending——结束后按更早的延迟补跑，不吞信号。 */
  const postWriteAdvanceRunning = new Set<string>();
  const postWriteAdvancePending = new Map<string, { delayMs: number; mode: "event" | "retry" }>();
  /** `roles-missing` 的有界重试计数（外部真实事件重置；成功/无需推进时清除）。 */
  const postWriteAdvanceRetries = new Map<string, number>();
  const schedulePostWriteAdvanceCheck = (
    projectRoot: string,
    runtime?: RuntimeKind,
    delayMs: number = POST_WRITE_ADVANCE_DELAY_MS,
    mode: "event" | "retry" = "event",
  ): void => {
    if (typeof projectRoot !== "string" || projectRoot === "") return;
    if (runtime !== undefined) acceptanceRuntimeHints.set(projectRoot, runtime);
    if (mode === "event") postWriteAdvanceRetries.delete(projectRoot); // 真实事件 = 新一轮有界重试
    if (postWriteAdvanceRunning.has(projectRoot)) {
      // 运行中到达：不丢信号；保留更早的一次补跑（事件 40ms 优先于重试延迟）。
      const pending = postWriteAdvancePending.get(projectRoot);
      if (pending === undefined || delayMs < pending.delayMs) {
        postWriteAdvancePending.set(projectRoot, { delayMs, mode });
      }
      return;
    }
    if (postWriteAdvanceTimers.has(projectRoot)) return; // 已有窗口：合并，窗口后的检查会看到最新状态
    const timer = setTimeout(() => {
      postWriteAdvanceTimers.delete(projectRoot);
      void (runPostWriteAdvanceCheck?.(projectRoot) ?? Promise.resolve());
    }, delayMs);
    (timer as { unref?: () => void }).unref?.();
    postWriteAdvanceTimers.set(projectRoot, timer);
  };

  /**
   * **解析自动派发/冷启动补齐要用的引擎**（2026-10-19 真机缺陷修复）。优先级全部在
   * `runtime-resolution.ts`：活跃会话 → 应用内已选/持久化 → `.ans/sessions/<role>/<runtime>` 磁盘证据 →
   * 配置凭据可用性 → 无法确定（明确失败，**绝不**回退桌面默认 "claude"）。只读；失败不猜。
   */
  const resolveAcceptanceRuntime = async (
    projectRoot: string,
    activeRuntime?: RuntimeKind,
  ): Promise<RuntimeResolution> => {
    const persistedRuntime = await readPersistedProjectRuntime(deps.runtimeStatePath, projectRoot);
    const selectedRuntime = manager.governanceRuntimeFor(projectRoot);
    const request: RuntimeResolutionRequest = {
      projectRoot,
      ...(activeRuntime !== undefined ? { activeRuntime } : {}),
      ...(selectedRuntime !== undefined ? { selectedRuntime } : {}),
      ...(persistedRuntime !== undefined ? { persistedRuntime } : {}),
    };
    if (deps.resolveRuntimeFn !== undefined) return deps.resolveRuntimeFn(request);
    return resolveProjectRuntime({
      ...request,
      envPath: envFilePath,
      env: deps.piConfigEnv ?? process.env,
    });
  };

  const acceptanceFlowKey = (projectRoot: string, flowId: string): string => `${projectRoot}\u0000${flowId}`;
  /** 已同意的 appointment 决定取值（`appointed` 为新流程；`accepted` 兼容旧账本）。 */
  const RESOLVED_APPOINTMENT_DECISIONS: ReadonlySet<string> = new Set(["appointed", "accepted"]);

  const rememberAcceptanceEvidence = (projectRoot: string, flowId: string, evidence: readonly string[]): void => {
    const key = acceptanceFlowKey(projectRoot, flowId);
    const merged = [...(acceptanceEvidenceByFlow.get(key) ?? []), ...evidence.filter((item) => typeof item === "string" && item.trim() !== "")];
    acceptanceEvidenceByFlow.set(key, [...new Set(merged)].slice(0, 10));
  };

  function scheduleAcceptanceCheck(projectRoot: string, reason: "settle" | "ledger" | "import" = "settle"): void {
    if (typeof projectRoot !== "string" || projectRoot.trim() === "") return;
    if (acceptanceCheckTimers.has(projectRoot)) return; // 有界：一个窗口至多一次（后到事件合并不顺延）
    acceptanceCheckReasons.set(projectRoot, reason);
    const timer = setTimeout(() => {
      acceptanceCheckTimers.delete(projectRoot);
      const trigger = acceptanceCheckReasons.get(projectRoot) ?? "settle";
      acceptanceCheckReasons.delete(projectRoot);
      void (runAcceptanceCheck?.(projectRoot, trigger) ?? Promise.resolve());
    }, ACCEPTANCE_CHECK_DELAY_MS);
    (timer as { unref?: () => void }).unref?.();
    acceptanceCheckTimers.set(projectRoot, timer);
  }

  /**
   * 应用动作审计的**唯一写入口**：`dispatch.accepted{actorRoleId:"app",power:"app"}`——应用推进
   * **不是客户批准**（不写 customerDecision/decisionEvidence）。仅 trio 且项目根存在时写；失败只记诊断、
   * 不翻转已完成的投递、不重试。`advanceGovernanceFlow` 与「写卡后推进检查」共用，不造第二套写法。
   */
  const appendApplicationDispatch = async (input: {
    projectRoot: string;
    flowId?: string;
    targetRoleId: "nominator" | "convener";
    text: string;
    stepId?: string;
    runtime: RuntimeKind;
    trigger?: "customer-decision" | "settle";
    /**
     * 账本写入侧去重键（同 project+flow+target）。发送侧已占位的链路也传同一键：
     * 即使两条链路都走到发送，也只产生一条 app 审计；append 失败释放，允许后续事件补写。
     */
    dedupeKey?: string;
  }): Promise<boolean> => {
    const diagnostic = createDiagnosticLogger({
      component: "desktop.governance-advance",
      projectRoot: input.projectRoot,
      roleId: input.targetRoleId,
    });
    if (input.dedupeKey !== undefined && applicationDispatchCommitted.has(input.dedupeKey)) return true;
    const ledgerModel = listingCache.get(input.projectRoot)?.governanceModel ?? "single";
    if (ledgerModel !== "trio") return false;
    if (!existsSync(input.projectRoot)) {
      diagnostic.record("advance.ledger.skipped", { reason: "project-root-missing", targetRoleId: input.targetRoleId });
      return false;
    }
    if (input.dedupeKey !== undefined) applicationDispatchCommitted.add(input.dedupeKey);
    const appended = await appendGovernanceLedger(input.projectRoot, {
      at: new Date().toISOString(),
      kind: "dispatch.accepted",
      ...(input.flowId !== undefined ? { flowId: input.flowId } : {}),
      actorRoleId: "app",
      power: "app",
      trigger: input.trigger ?? "customer-decision",
      targetRoleId: input.targetRoleId,
      ...(input.stepId !== undefined ? { stepId: input.stepId } : {}),
      messageSummary: ledgerSummary(input.text),
      runtime: input.runtime,
    });
    if (!appended.ok) {
      if (input.dedupeKey !== undefined) applicationDispatchCommitted.delete(input.dedupeKey);
      diagnostic.error("advance.ledger.failed", new Error(appended.message), {
        flowId: input.flowId,
        targetRoleId: input.targetRoleId,
      });
      return false;
    }
    // 账本发生变更（dispatch.accepted 追加）⇒ 触发一次有界验收检查（在途工作由检查器自行推迟）。
    scheduleAcceptanceCheck(input.projectRoot, "ledger");
    return true;
  };

  /**
   * 项目内可检查的流程：`docs/flows/*.yaml`（机器状态，2026-10-19 客户决定）∪ `docs/flows/*.md`
   * （legacy 回退与人读视图）。YAML 是唯一机器状态；Markdown 仅用于发现「尚无 YAML」的 legacy 流程。
   * 两者都没有的 flowId 无从机械核对。
   */
  async function listGovernanceFlowIds(projectRoot: string): Promise<string[]> {
    try {
      const names = await readdir(`${projectRoot}/docs/flows`);
      const ids = names
        .filter((name) => name.endsWith(".yaml") || name.endsWith(".md"))
        .map((name) => name.replace(/\.(?:yaml|md)$/, ""))
        .filter((id) => id !== "");
      return [...new Set(ids)];
    } catch {
      return [];
    }
  }

  /**
   * **verifier settle ⇒ Lead 可见性**（2026-10-20 真机：验收结果没回 Lead——verifier 会话空闲、旧报告停在
   * 盘上，客户看不到复核已结束）。只要该 flow 有**最近一次验收派发**（账本 verifier dispatch），就向 Lead
   * （主入口）落一条去重系统行：报告路径 + 「验收卡/客户决定由应用继续」。**不伪造结论**、不把报告当客户
   * 批准。去重：同 flow + 报告文件 mtime（版本）只提示一次；报告未落盘也提示一次（版本记 missing）。
   */
  const verifierSettleNotified = new Map<string, string>();
  const noteVerifierSettle = async (projectRoot: string, runtime: RuntimeKind): Promise<void> => {
    const diagnostic = createDiagnosticLogger({ component: "desktop.governance-acceptance", projectRoot, roleId: "verifier" });
    try {
      const listing = listingCache.get(projectRoot);
      if (listing?.governanceModel !== "trio") return;
      const primaryRoleId = listing.primaryRoleId;
      if (typeof primaryRoleId !== "string" || primaryRoleId === "") return;
      const ledger = await readGovernanceLedger(projectRoot);
      if (ledger.errors.length > 0) return;
      const flowIds = [
        ...new Set(
          ledger.entries
            .map((entry) => entry.flowId)
            .filter((id): id is string => typeof id === "string" && id !== ""),
        ),
      ];
      for (const flowId of flowIds) {
        if (acceptanceLastDispatchAtMs(flowId, ledger) === undefined) continue; // 该 flow 没有验收派发记录
        // 2026-10-22 第 3 项（方案 §7.1/§7.6）：验收报告在 docs/acceptance/；详细证据附件仍在 docs/verification/。
        const reportRel = governanceAcceptanceReportPath(flowId);
        const governanceRel = `docs/governance/verifier/${flowId}.md`;
        let reportVersion = "missing";
        try {
          reportVersion = String((await stat(path.join(projectRoot, reportRel))).mtimeMs);
        } catch {
          // 报告尚未落盘：仍提示一次（版本记 missing），不猜结论。
        }
        const dedupeKey = `${projectRoot}\u0000${flowId}`;
        if (verifierSettleNotified.get(dedupeKey) === reportVersion) continue; // 同 flow+报告版本不刷屏
        try {
          emitSessionEvent({
            roleId: primaryRoleId,
            projectRoot,
            runtime,
            event: {
              kind: "message",
              summary:
                `Proof / 验收复核已结束（flowId=${flowId}）；报告见 ${reportRel}（附件见 docs/verification/）与 ${governanceRel}；` +
                `验收卡/客户决定由应用继续（本行不构成验收结论或客户批准）。`,
              detail: { source: "delivery-note" },
            },
          });
        } catch (error) {
          diagnostic.error("acceptance.verifier-settle.note.failed", error, { flowId });
          continue; // 未投出：不记去重，下次 settle 可再试
        }
        verifierSettleNotified.set(dedupeKey, reportVersion);
        diagnostic.record("acceptance.verifier-settle.noted", { flowId });
      }
    } catch (error) {
      diagnostic.error("acceptance.verifier-settle.failed", error);
    }
  };

  // 会话事件外推：先原样转发（主进程推 `session:event`；B-2 起为**带 `roleId` 信封**的 `SessionEventEnvelope`）；
  // 再在「**主入口角色**一轮结束（`settled`）」时触发「项目可能已变」信号（→ 主进程推 `project:changed` →
  // 渲染侧重取枚举，左树随 su 建角色而长出，§10.3）。判据取**信封里的角色**（多会话并存后不能再看
  // 「默认活动的那个是谁」）。本层只转达信号，**不判定**写入是否发生（判定唯一来自门禁引擎）。
  // W6-B：**任一内置治理角色**（liaison/rapporteur/nominator/convener）settle 也要刷新 listing——
  // 否则任命后新写的角色卡在同一轮内不可见（`role_status`/`dispatch_task` 误报「未枚举到」）。
  const emitSessionEvent = (envelope: SessionEventEnvelope): void => {
    deps.emitEvent(envelope);
    if (typeof envelope.projectRoot === "string" && envelope.projectRoot !== "") {
      acceptanceRuntimeHints.set(envelope.projectRoot, envelope.runtime);
    }
    if (envelope.event.kind === "settled") {
      // 2026-10-19：任意角色 settle 都是流程可能推进的真实时机（治理步骤不产生回交，旧挂点永远等不到）。
      scheduleAcceptanceCheck(envelope.projectRoot);
      const settledRole = listingCache
        .get(envelope.projectRoot)
        ?.roles.find((role) => role.roleId === envelope.roleId);
      if (settledRole?.builtIn === true && settledRole.governanceFunction !== undefined) {
        scheduleGovernanceListingRefresh(envelope.projectRoot);
        // 2026-10-19 真机第二缺陷：治理角色（尤其 Crew 写完角色卡）settle 后先强制刷新枚举，再由
        // 写卡后推进检查兜底派 Convener（有界、去重；与既有 appointment 链路共用同一任务文本）。
        schedulePostWriteAdvanceCheck(envelope.projectRoot, envelope.runtime);
      }
      // 2026-10-20 真机：Proof / 验收 settle 后把「复核已结束 + 报告路径」如实给 Lead（去重、不伪造结论）。
      if (settledRole?.builtIn === true && settledRole.governanceFunction === "verification") {
        void noteVerifierSettle(envelope.projectRoot, envelope.runtime);
      }
      if (isPrimaryRole(envelope.projectRoot, envelope.roleId)) {
        deps.emitProjectChanged?.();
        // O-1（2026-10-12）：su 一轮结束 = 「边界可能刚被 su 改过」的**可信时机**——扫一遍活会话的边界快照，
        // 陈旧者作废重建（内部逐会话隔离、绝不上抛；在跑的轮次跳过）。fire-and-forget，不阻塞事件外推。
        void manager.refreshStaleBoundaries();
      }
    }
  };

  let runtimeFactory = deps.createRuntimeAdapterFactoryFn;
  if (runtimeFactory === undefined && deps.createPiAdapterFactoryFn === undefined && deps.createDemoAdapterFn === undefined) runtimeFactory = realCreateRuntimeAdapterFactory;

  // —————— G-2/W1+W3：看护服务（纯逻辑；快照/投递都在 SessionManager——本层只装配与起停 tick） ——————
  // **看护不可用 ⇒ 核心治理零依赖**：构造失败只记诊断，watchdogService 保持 undefined（下方各注入点随之
  // 缺席——观察不转发、stats 不提供、tick 不起）；会话/投递/判定链完全不受影响（＝没有看护时的现状）。
  let watchdogService: ReturnType<typeof createWatchdogService> | undefined;
  try {
    watchdogService = createWatchdogService({
      // 看护对象 = 已导入（listProject 见过）的项目 ∪ 有活会话/非空队列的项目。
      projects: () => [...new Set([...listingCache.keys(), ...manager.projectRootsWithActivity()])],
      snapshot: (root) => manager.watchdogSnapshot(root),
      deliver: (root, message) => manager.watchdogDeliver(root, message),
      // 2026-10-20 真机（Convener 卡 1h、队列 24）：看护覆盖**所有角色**（含内置治理角色）——
      // 自动开关按角色映射：内置治理角色 ↑「替我决策」、项目角色 ↑「替我审批」；关闭或未配置自动中止时限 ⇒ 只告警。
      autoRecoveryEnabled: (root, roleId) => {
        const builtIn =
          listingCache.get(root)?.roles.find((role) => role.roleId === roleId)?.builtIn === true ||
          isBuiltInGovernanceRoleId(roleId);
        return builtIn ? decisionJudgeSwitch.isEnabled() : shellJudgeSwitch.isEnabled();
      },
      // 自动中止（**默认禁用**，仅显式配置正时限时由看护调用）：请求停止该回合，成功后按既有投递机再
      // drain 一次（settled 前 drain 自判忙并保留；settled 后由既有路径放行）。失败只记诊断、不循环。
      onTurnDeadline: (root, roleId, runtime) => {
        const diagnostic = createDiagnosticLogger({ component: "desktop.watchdog", projectRoot: root, roleId });
        void manager
          .abort({ projectRoot: root, roleId, runtime })
          .then((res) => {
            if (!res.ok) {
              diagnostic.record("watchdog.auto-abort.failed", { reasonCode: res.supported === false ? "unsupported" : "abort-error" });
              return;
            }
            diagnostic.record("watchdog.auto-abort.executed", { state: "requested" });
            return manager.redeliverNudge({ projectRoot: root, roleId, runtime }).catch((err) => {
              diagnostic.error("watchdog.auto-abort.nudge.failed", err);
            });
          })
          .catch((err) => diagnostic.error("watchdog.auto-abort.failed", err));
      },
      ...(deps.watchdogOptions ?? {}),
    });
  } catch (error) {
    createDiagnosticLogger({ component: "desktop.watchdog" }).error("watchdog.failed", error);
    watchdogService = undefined;
  }

  // —————— 2026-10-20 真机：验收通过（accepted）⇒ 调编排 `completeAcceptanceStep` 收口，绝不再派 verifier ——————
  //
  // 现场：verifier 第二轮复核完成、验收卡被判断 agent 代批 accept（账本 04:56:18
  // `customer.decision{decisionKind:"acceptance",customerDecision:"accepted",flowId:"bookmark-manager"}`），
  // flow YAML 的 `verification` 仍 pending；`evaluateFlowCompletion` 已判「已有验收决定，流程已收口」，
  // 但 04:56:55 又多派了一次 verifier。收口动作由编排落地（`completeAcceptanceStep`：标 done +
  // `evidence:{kind:"acceptance",ref:"acceptance"}`，幂等、原子写、未 accepted 拒绝）；桌面只消费。
  /** 验收收口提示去重：`projectRoot\0flowId` → 验收决定身份（at）/失败原因。 */
  const acceptanceClosedNotified = new Map<string, string>();
  const acceptanceCloseFailureNotified = new Map<string, string>();

  /** 账本里该 flow **最近一条验收通过**决定（customer.decision{decisionKind:"acceptance", accepted}）。 */
  const latestAcceptedAcceptanceDecision = (
    ledger: { entries: ReadonlyArray<{ kind?: string; flowId?: string; decisionKind?: string; customerDecision?: string; at?: string }> },
    flowId: string,
  ): { at?: string } | undefined => {
    let latest: { at?: string } | undefined;
    for (const entry of ledger.entries) {
      if (entry.kind !== "customer.decision" || entry.flowId !== flowId || entry.decisionKind !== "acceptance") continue;
      if (entry.customerDecision !== "accepted") continue;
      latest = entry; // 账本按 append 顺序：取最后一条（先拒绝后接受也能正确收口）
    }
    return latest;
  };

  /**
   * 调编排的流程收口（经 Pipeline 公共出口 `flow-state.ts::completeAcceptanceStep`；测试可注入）。
   * 编排契约：幂等（已 done ⇒ ok:true,idempotent）、原子写、未 accepted ⇒ `acceptance-not-accepted`、
   * 账本坏行 ⇒ `ledger-unavailable`。任何失败都返回 `{ok:false,error}`，由调用方如实提示、不循环。
   */
  const callCompleteAcceptanceStep = async (
    projectRoot: string,
    flowId: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const result: { ok?: boolean; error?: string; message?: string } =
        deps.completeAcceptanceStepFn !== undefined
          ? await deps.completeAcceptanceStepFn({ projectRoot, flowId })
          : await realCompleteAcceptanceStep({ projectRoot, flowId });
      return result.ok === true ? { ok: true } : { ok: false, error: result.error ?? result.message ?? "未知原因" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };

  /** 验收已通过 ⇒ 收口（幂等）+ Lead 去重系统行；失败只诊断/一条系统行，不派 verifier、不循环。 */
  const closeAcceptedFlow = async (
    projectRoot: string,
    flowId: string,
    decision: { at?: string },
    note: (summary: string) => void,
    diagnostic: ReturnType<typeof createDiagnosticLogger>,
  ): Promise<void> => {
    const key = acceptanceFlowKey(projectRoot, flowId);
    const identity = typeof decision.at === "string" && decision.at !== "" ? decision.at : "accepted";
    // 验收步骤已 done ⇒ 幂等：不重复调用收口，只按决定去重提示。
    let alreadyDone = false;
    try {
      const text = await readFile(path.join(projectRoot, governanceFlowStatePath(flowId)), "utf8");
      const parsed = parseFlowStateYaml(text, flowId);
      if (parsed.ok) alreadyDone = parsed.flow.steps.some((step) => step.kind === "acceptance" && step.status === "done");
    } catch {
      // YAML 缺失/不可读：交给 completeAcceptanceStep 判断（失败则如实提示）；不派 verifier。
    }
    if (!alreadyDone) {
      const result = await callCompleteAcceptanceStep(projectRoot, flowId);
      if (!result.ok) {
        const message = result.error ?? "未知原因";
        diagnostic.record("acceptance.close.failed", { flowId });
        if (acceptanceCloseFailureNotified.get(key) !== message) {
          acceptanceCloseFailureNotified.set(key, message);
          note(`验收已通过但流程收口失败（流程 ${flowId}）：${message}；未派 verifier，流程保持待收口（请核对 flow YAML）。`);
        }
        return; // 失败不循环；仍不派 verifier（验收已由客户/判断决定）
      }
      acceptanceCloseFailureNotified.delete(key);
      diagnostic.record("acceptance.close.completed", { flowId });
    }
    acceptanceBlockedNotified.delete(key);
    if (acceptanceClosedNotified.get(key) !== identity) {
      acceptanceClosedNotified.set(key, identity);
      // 不伪造客户批准：以账本 customer.decision 为准；本层不写客户决定账本。
      note(`验收已通过（判断代批或客户手批，以账本 customer.decision 为准），流程 ${flowId} 已收口（保留验收步骤已标 done）。`);
    }
  };

  // —————— 2026-10-20 真机：flow artifact 证据补登（旧扫描规则写下的 evidence.ref 文件）——————
  //
  // 现场：integration-e2e / verification-evidence 的 evidence.ref 文件（.js/README.md）是旧扫描规则下写的，
  // 重启后新扫描当基线、不补 `artifact.observed`，Steward 的 flow_step_update done 会被 insufficient-evidence
  // 挡住。编排新增 `observeFlowArtifacts({projectRoot,flowId})`（幂等补登 flow artifact 证据）；桌面在
  // delivered 唤醒和验收判定**之前**调用。补登是应用观察文件（owner/power/sha），不写客户决定账本、不伪造 done。
  type FlowArtifactBackfillOutcome = { ok: boolean; backfilled: number; skipped: number; error?: string };
  /** 编排返回 `observed: string[]` / `skipped: {path,reason}[]`（旧桩可能是数字）——统一折算成数量。 */
  const backfillCountOf = (value: unknown): number =>
    Array.isArray(value) ? value.length : typeof value === "number" && Number.isFinite(value) ? value : 0;
  const callObserveFlowArtifacts = async (projectRoot: string, flowId: string): Promise<FlowArtifactBackfillOutcome> => {
    try {
      const result: {
        ok?: boolean;
        observed?: unknown;
        backfilled?: unknown;
        skipped?: unknown;
        error?: string;
        message?: string;
      } =
        deps.observeFlowArtifactsFn !== undefined
          ? await deps.observeFlowArtifactsFn({ projectRoot, flowId })
          : await realObserveFlowArtifacts({ projectRoot, flowId });
      if (result.ok === false) {
        return { ok: false, backfilled: 0, skipped: 0, error: result.error ?? result.message ?? "未知原因" };
      }
      return {
        ok: true,
        backfilled: backfillCountOf(result.backfilled ?? result.observed),
        skipped: backfillCountOf(result.skipped),
      };
    } catch (error) {
      return { ok: false, backfilled: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
    }
  };

  /** 有 `kind:"artifact"` 且带 evidence.ref 的步骤 ⇒ 调补登；成功/部分成功只记诊断，失败不阻断后续判定。 */
  const backfillFlowArtifacts = async (
    projectRoot: string,
    flowId: string,
    diagnostic: ReturnType<typeof createDiagnosticLogger>,
  ): Promise<void> => {
    try {
      const text = await readFile(path.join(projectRoot, governanceFlowStatePath(flowId)), "utf8");
      const parsed = parseFlowStateYaml(text, flowId);
      if (!parsed.ok) return;
      const hasArtifactRef = parsed.flow.steps.some(
        (step) => step.kind === "artifact" && typeof step.evidence?.ref === "string" && step.evidence.ref.trim() !== "",
      );
      if (!hasArtifactRef) return;
      const outcome = await callObserveFlowArtifacts(projectRoot, flowId);
      if (!outcome.ok) {
        diagnostic.record("acceptance.artifacts.backfill-failed", { flowId, count: 0 });
        return; // 不阻断 subsequent 判定（Steward/验收门会给出证据不足原因）
      }
      diagnostic.record("acceptance.artifacts.backfilled", { flowId, count: outcome.backfilled });
      if (outcome.skipped > 0) diagnostic.record("acceptance.artifacts.backfill-skipped", { flowId, count: outcome.skipped });
    } catch {
      // flow 不可读/解析失败/补登异常：不阻断后续判定。
    }
  };

  // —————— 2026-10-20 真机：步骤 `delivered` 后唤醒 Steward 核证（应用没有「delivered 后核证」触发器）——————
  //
  // 现场：flow 的 integration-e2e / verification-evidence 已 delivered，但 Steward 空闲——没人叫它核证。
  // 本层在 acceptance check（settle/ledger/导入同一入口）里读 flow YAML：delivered 且 owner 无活会话/
  // busy/队列/在途投递、且 flow 没有已接受的验收决定 ⇒ 向 Convener 后台投一条去重核证任务 + Lead 一条
  // 去重系统行。**不伪造 done、不自动改 flow、不弹客户卡**；Steward 用 flow 工具自行核证。
  /** 步骤 delivered 唤醒去重：`projectRoot\0flowId` → revision+delivered ids 排序哈希。 */
  const deliveredWakeNotified = new Map<string, string>();
  const wakeStewardForDeliveredSteps = async (
    projectRoot: string,
    flowId: string,
    note: (summary: string) => void,
    diagnostic: ReturnType<typeof createDiagnosticLogger>,
  ): Promise<void> => {
    const key = acceptanceFlowKey(projectRoot, flowId);
    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(projectRoot, governanceFlowStatePath(flowId)));
    } catch {
      return; // 无 YAML/不可读：不在此处理（验收门另有 reason）
    }
    const parsed = parseFlowStateYaml(bytes.toString("utf8"), flowId);
    if (!parsed.ok) return; // 解析失败交给验收门，不猜
    const delivered = parsed.flow.steps.filter(
      (step) => step.status === "delivered" && typeof step.owner === "string" && step.owner.trim() !== "",
    );
    if (delivered.length === 0) {
      deliveredWakeNotified.delete(key); // 状态已变化：清除，允许后续真实 delivered 再唤醒
      return;
    }
    // owner 有活会话/busy/队列/在途投递 ⇒ 等下一次事件（不抢跑）。
    const waitingForOwner = delivered.some((step) => {
      const owner = step.owner.trim();
      const liveViews = manager.liveSessionViews().filter((view) => view.projectRoot === projectRoot && view.roleId === owner);
      if (liveViews.length > 0) return true;
      for (const runtime of RUNTIME_KINDS) {
        if (manager.hasPendingDelivery(projectRoot, owner, runtime)) return true;
      }
      return false;
    });
    if (waitingForOwner) return;
    const revision = createHash("sha256").update(bytes).digest("hex");
    const deliveredIds = delivered.map((step) => step.id).sort();
    const notifyHash = createHash("sha256").update(`${revision}\u0000${deliveredIds.join("\u0000")}`).digest("hex");
    if (deliveredWakeNotified.get(key) === notifyHash) return; // 同 revision+同一 delivered 集合只派/提示一次
    const runtime = await resolveNoteRuntime(projectRoot);
    if (runtime === undefined) {
      diagnostic.record("acceptance.delivered-wake.runtime-unresolved", { flowId });
      return;
    }
    const task = [
      `流程 ${flowId}：以下步骤已 delivered，等待 Steward / 统筹 核证：`,
      ...delivered.map(
        (step) =>
          `- 步骤 ${step.id} 已 delivered（owner=${step.owner}），请核对账本/产物证据，用 flow_step_update 标 done 或退回修正；不要直接写 flow YAML。`,
      ),
      "核证要求：先核对账本与产物证据再更新步骤状态；未达 done 条件请退回修正；不要直接 write_file 流程 YAML。",
    ].join("\n");
    const opened = await manager.openBackground({ projectRoot, roleId: "convener", runtime });
    if (!opened.ok) {
      diagnostic.error("acceptance.delivered-wake.open.failed", new Error(opened.error ?? "unknown"), { flowId });
      return; // 失败只诊断（下一次真实事件可再试；不循环）
    }
    const sent = await manager.sendBackground({ projectRoot, roleId: "convener", runtime, text: task });
    if (!sent.ok) {
      diagnostic.error("acceptance.delivered-wake.send.failed", new Error(sent.error ?? "unknown"), { flowId });
      return;
    }
    deliveredWakeNotified.set(key, notifyHash);
    diagnostic.record("acceptance.delivered-wake.sent", { flowId, count: delivered.length });
    note(`流程 ${flowId}：步骤 ${deliveredIds.join("、")} 已 delivered，等待 Steward / 统筹 核证（已投核证任务）。`);
  };

  // —————— 收尾推进（2026-10-18 真机缺口；2026-10-19 客户反馈「独立核准应该是标准流程」）——————
  // 触发面：**任意角色 settle**、回交到达/settle、桌面侧治理账本追加（dispatch.accepted）、导入项目/启动
  // 后的补齐检查。本层只读流程状态与账本做**触发门**检查，全部完成且证据按步骤类型齐备才后台派 Proof /
  // 验收（verifier）一条复核任务；不自动验收、不代批（验收卡仍走决策开关/客户手批）。
  // 机器状态（2026-10-19 客户决定「这些全部改成yaml。」）：优先 `docs/flows/<flowId>.yaml`
  // （`parseFlowStateYaml` + `evaluateFlowCompletion`，证据按显式 kind 对账）；同名 `.md` 只是人读视图，
  // 不参与判定。仅 YAML **不存在**时回退 legacy Markdown `flowCompletionIssue`（诊断标注 legacy）。
  // 去重：运行期每 flow 一次 + 账本 `dispatch.accepted{targetRoleId:verifier}` 持久化（重启不重派）；
  // 失败如实落 Lead（主入口）系统行，不循环重试。
  const dispatchAcceptanceForFlow = async (info: {
    projectRoot: string;
    flowId: string;
    runtime?: RuntimeKind;
    evidence: readonly string[];
    /** 回交 settle 是确定性完成信号：不因该回交自身仍在 `activeDeliveries` 而推迟。 */
    force?: boolean;
    trigger: "handback" | "settle" | "ledger" | "import";
  }): Promise<void> => {
    const listing = listingCache.get(info.projectRoot);
    if (listing?.governanceModel !== "trio") return; // single/旧项目不产生验收推进
    const key = acceptanceFlowKey(info.projectRoot, info.flowId);
    // 2026-10-19 客户决定（经项目管理转达）：自动验收门的反馈**统一发给 Lead（主入口）**，不再发
    // Convener——包括「未派发 + 具体原因 + superseded/新 stepId 建议」「已自动派发验收复核给 Proof」
    // 以及既有失败/引擎无法确定行。落位只取 `listProject` 的 `primaryRoleId`（真实 trio = liaison），
    // 不硬编码角色 id、不按 `governanceFunction` 另行推导。
    const noteRoleId = listing.primaryRoleId;
    const diagnostic = createDiagnosticLogger({ component: "desktop.governance-acceptance", projectRoot: info.projectRoot, roleId: noteRoleId });
    // 系统行的呈现路由：冷启动解析出引擎后改用**实际引擎**（否则 Pi 视图会过滤掉落给默认 claude 的行）；
    // 解析失败时仍用已知提示或桌面默认（保证「无法确定项目引擎」这条行可见）。
    let noteRuntime: RuntimeKind | undefined = info.runtime ?? acceptanceRuntimeHints.get(info.projectRoot);
    const note = (summary: string): void => {
      try {
        emitSessionEvent({ roleId: noteRoleId, projectRoot: info.projectRoot, runtime: noteRuntime ?? "claude", event: { kind: "message", summary, detail: { source: "delivery-note" } } });
      } catch (error) {
        diagnostic.error("acceptance.note.failed", error);
      }
    };
    try {
      // 2026-10-20 真机（验收卡代批 accept 后 flow 仍 pending，且 04:56:55 又多派一次 verifier）：
      // **先把账本读进来**——「已有验收决定 ⇒ 收口/不再派」不能被运行期 mtime 去重提前 return 挡住。
      const ledger = await readGovernanceLedger(info.projectRoot);
      const acceptedDecision = ledger.errors.length === 0 ? latestAcceptedAcceptanceDecision(ledger, info.flowId) : undefined;
      if (acceptedDecision !== undefined) {
        // 验收已通过（客户手批或判断代批）：调编排 `completeAcceptanceStep` 收口（标 done + acceptance
        // 证据；幂等、原子、未 accepted 拒绝），随后**直接 return**，不再派 verifier。
        await closeAcceptedFlow(info.projectRoot, info.flowId, acceptedDecision, note, diagnostic);
        return;
      }
      // 2026-10-20 真机：先把 flow artifact 证据补登（幂等；旧扫描规则写下的 evidence.ref 文件），
      // 再唤醒 Steward / 跑验收判定——Steward 的 flow_step_update done 才能通过 insufficient-evidence。
      await backfillFlowArtifacts(info.projectRoot, info.flowId, diagnostic);
      // 2026-10-20 真机：步骤 delivered 后唤醒 Steward 核证（无活会话/队列才投；同 revision+集合去重）。
      // 放在 verifier 去重之前——即使本次不派 verifier，也必须评估 delivered 核证。
      await wakeStewardForDeliveredSteps(info.projectRoot, info.flowId, note, diagnostic);
      // ———— 2026-10-22 第 3 项：新流程的「实施前标准 → 变更包 → 验收判定」门槛（方案 §7.2/§7.3/§7.6） ————
      // 只作用于**新契约流程**（flow YAML 含 team-plan/role-cards/role-readiness/acceptance-criteria/change-package
      // 任一 step id）；legacy flow 保持原行为（G4/O4 迁移兼容）。标准缺失 ⇒ 派 Verifier 写标准
      // （stepId=acceptance-criteria；账本+运行期去重、不循环）并阻塞验收判定；变更包缺失/缺 riskTier ⇒ 阻塞
      // 验收判定 + Lead 系统行（去重）。判定时把标准/变更包/档位带进任务文案（不猜、不把「待补」当通过）。
      let acceptanceTaskOptions: {
        riskTier?: GovernanceRiskTier;
        criteriaPath?: string;
        changePackagePath?: string;
      } = {};
      let newContractFlow = false;
      try {
        const flowStateProbeText = await readFile(path.join(info.projectRoot, flowStatePath(info.flowId)), "utf8");
        const parsedFlowState = parseFlowStateYaml(flowStateProbeText, info.flowId);
        if (parsedFlowState.ok) {
          newContractFlow = parsedFlowState.flow.steps.some((step) => NEW_CONTRACT_FLOW_STEP_IDS.has(step.id));
        }
      } catch {
        newContractFlow = false; // 无 YAML：legacy 门（Markdown 回退）按原逻辑。
      }
      if (newContractFlow) {
        let appointmentEntry: GovernanceLedgerEntry | undefined;
        let latestProposalKind: string | undefined;
        for (const entry of ledger.entries) {
          if (entry.kind !== "customer.decision" || entry.flowId !== info.flowId) continue;
          if (entry.decisionKind === "appointment") appointmentEntry = entry;
          else if (entry.decisionKind === "proposal-accept" || entry.decisionKind === "proposal-accept-quick") {
            latestProposalKind = entry.decisionKind;
          }
        }
        const appointmentConfirmed =
          appointmentEntry !== undefined &&
          (appointmentEntry.customerDecision === undefined || RESOLVED_APPOINTMENT_DECISIONS.has(appointmentEntry.customerDecision));
        if (appointmentConfirmed && latestProposalKind !== "proposal-accept-quick") {
          const criteria = await readAcceptanceCriteriaInfo(info.projectRoot, info.flowId);
          if (criteria === undefined || criteria.text.trim() === "") {
            // 派 Verifier 写实施前标准（若尚未派过）：账本 stepId=acceptance-criteria 是跨重启去重依据。
            const ledgerCriteriaDispatched = ledger.entries.some(
              (entry) =>
                entry.kind === "dispatch.accepted" &&
                entry.flowId === info.flowId &&
                entry.targetRoleId === "verifier" &&
                entry.stepId === "acceptance-criteria",
            );
            if (!acceptanceCriteriaDispatched.has(key) && !ledgerCriteriaDispatched) {
              const changeForRisk = await readChangePackageInfo(info.projectRoot, info.flowId);
              const planForRisk = await readTeamPlanInfo(info.projectRoot, info.flowId);
              const riskTier = changeForRisk?.riskTier ?? planForRisk?.riskTier;
              const activeRuntime =
                info.runtime ?? acceptanceRuntimeHints.get(info.projectRoot) ?? manager.activeRuntimeFor(info.projectRoot);
              let resolution: RuntimeResolution | undefined;
              try {
                resolution = await resolveAcceptanceRuntime(info.projectRoot, activeRuntime);
              } catch (error) {
                diagnostic.error("acceptance.criteria.runtime.failed", error, { flowId: info.flowId });
              }
              if (resolution !== undefined && resolution.ok) {
                noteRuntime = resolution.runtime;
                const criteriaMessage = buildAcceptanceCriteriaTaskMessage(info.flowId, {
                  ...(planForRisk !== undefined ? { teamPlanPath: planForRisk.relPath } : {}),
                  ...(riskTier !== undefined ? { riskTier } : {}),
                });
                const opened = await manager.openBackground({ projectRoot: info.projectRoot, roleId: "verifier", runtime: resolution.runtime });
                if (!opened.ok) {
                  diagnostic.error("acceptance.criteria.open.failed", new Error(opened.error ?? "unknown"), { flowId: info.flowId });
                } else {
                  const sent = await manager.sendBackground({
                    projectRoot: info.projectRoot,
                    roleId: "verifier",
                    runtime: resolution.runtime,
                    text: criteriaMessage,
                  });
                  if (!sent.ok) {
                    diagnostic.error("acceptance.criteria.send.failed", new Error(sent.error ?? "unknown"), { flowId: info.flowId });
                  } else {
                    acceptanceCriteriaDispatched.add(key);
                    note(governanceAcceptanceCriteriaNote(info.flowId));
                    const appendedCriteria = await appendGovernanceLedger(info.projectRoot, {
                      at: new Date().toISOString(),
                      kind: "dispatch.accepted",
                      flowId: info.flowId,
                      stepId: "acceptance-criteria",
                      actorRoleId: "app",
                      power: "app",
                      trigger: "customer-decision",
                      targetRoleId: "verifier",
                      messageSummary: ledgerSummary(criteriaMessage),
                      runtime: resolution.runtime,
                    });
                    if (!appendedCriteria.ok) {
                      diagnostic.error("acceptance.criteria.ledger.failed", new Error(appendedCriteria.message), { flowId: info.flowId });
                    }
                    diagnostic.record("acceptance.criteria.dispatched", { flowId: info.flowId, queued: sent.queued === true });
                  }
                }
              } else {
                diagnostic.record("acceptance.criteria.runtime-unresolved", { flowId: info.flowId });
              }
            }
            const criteriaReason = `实施前验收标准缺失或为空（${governanceAcceptanceCriteriaPath(info.flowId)}）；未派验收判定`;
            if (acceptanceArtifactBlockedNotified.get(key) !== criteriaReason) {
              acceptanceArtifactBlockedNotified.set(key, criteriaReason);
              note(criteriaReason);
              diagnostic.record("acceptance.criteria.blocked", { flowId: info.flowId });
            }
            acceptanceDispatchedFlows.delete(key);
            return;
          }
          const changePackage = await readChangePackageInfo(info.projectRoot, info.flowId);
          if (changePackage === undefined || changePackage.text.trim() === "" || changePackage.riskTier === undefined) {
            const changeReason =
              changePackage === undefined || changePackage.text.trim() === ""
                ? `变更包缺失（${governanceChangePackagePath(info.flowId)}）；未派验收判定`
                : `变更包缺少 riskTier（T0–T3）：${changePackage.relPath}；未派验收判定`;
            if (acceptanceArtifactBlockedNotified.get(key) !== changeReason) {
              acceptanceArtifactBlockedNotified.set(key, changeReason);
              note(changeReason);
              diagnostic.record("acceptance.change-package.blocked", { flowId: info.flowId });
            }
            acceptanceDispatchedFlows.delete(key);
            return;
          }
          acceptanceTaskOptions = {
            riskTier: changePackage.riskTier,
            criteriaPath: criteria.relPath,
            changePackagePath: changePackage.relPath,
          };
          acceptanceArtifactBlockedNotified.delete(key); // 门槛已满足：允许后续回归再报
        }
      }
      // 2026-10-20 真机（04:06 派过 verifier；12:11 flow YAML 更新后仍被旧去重挡住、验收结果没回 Lead）：
      // 运行期去重带 **flow YAML 版本（mtime）**——每 flow 同版本只派一次；flow 更新 ⇒ 旧占位作废、允许重派。
      // 无 YAML（legacy/不可读）维持旧「每进程一次」语义。
      let flowStateMtimeMs: number | undefined;
      try {
        flowStateMtimeMs = (await stat(path.join(info.projectRoot, governanceFlowStatePath(info.flowId)))).mtimeMs;
      } catch {
        flowStateMtimeMs = undefined;
      }
      let flowUpdatedSinceReview = false;
      const recordedMtime = acceptanceDispatchedFlows.get(key);
      if (recordedMtime !== undefined) {
        if (flowStateMtimeMs === undefined || recordedMtime === flowStateMtimeMs) return; // 同版本已派
        acceptanceDispatchedFlows.delete(key);
        flowUpdatedSinceReview = true; // flow 在上次复核后有更新：本次为重派，任务文案注明
      }
      acceptanceDispatchedFlows.set(key, flowStateMtimeMs ?? -1); // 先占位：防同一 settle 批次/并发重复派
      // 2026-10-20 真机修复：账本不再「一旦有 verifier 派发就永久去重」——与 flow YAML mtime 比较：
      // 最后一次 verifier 派发 >= flow 更新时间 ⇒ 同版本已派（重启后同样成立）；flow 比派发新 ⇒ stale，
      // 允许再派一次。无 YAML/不可读 ⇒ 维持旧行为（有记录即不派）。
      const lastVerifierAtMs = acceptanceLastDispatchAtMs(info.flowId, ledger);
      if (lastVerifierAtMs !== undefined) {
        if (flowStateMtimeMs === undefined || lastVerifierAtMs >= flowStateMtimeMs) {
          diagnostic.record("acceptance.ledger.dedup", { flowId: info.flowId });
          return; // 保留运行期占位（本进程同版本也不再检查）
        }
        flowUpdatedSinceReview = true;
        diagnostic.record("acceptance.ledger.stale", { flowId: info.flowId, lastVerifierAtMs });
      } else if (acceptanceDispatchRecorded(info.flowId, ledger)) {
        // 旧记录缺 `at`/不可解析：无法做版本比较 ⇒ 维持旧行为（有记录即不派），不猜、不重派。
        diagnostic.record("acceptance.ledger.dedup-legacy", { flowId: info.flowId });
        return;
      }
      // 该 flow 仍有在途派发/回交/运行轮次 ⇒ 推迟到下一次事件（避免在交付完成前抢跑派 Proof）。
      if (info.force !== true && manager.hasActiveWorkForFlow(info.projectRoot, info.flowId)) {
        acceptanceDispatchedFlows.delete(key);
        diagnostic.record("acceptance.deferred.active-work", { flowId: info.flowId });
        return;
      }
      // —————— 机器状态判定：YAML 优先，Markdown 仅 legacy 回退 ——————
      // `docs/flows/<flowId>.yaml` 存在 ⇒ 它是**唯一机器状态**：语法/形状/保留 id 校验失败、或证据不足，
      // 一律不派并把**具体错误**作为 Lead 系统行（去重）——绝不因 Markdown 表好看而放行。
      // 仅 YAML **不存在**（ENOENT）时回退既有 Markdown 门，并标注 legacy 诊断（迁移提示，不改变行为）。
      const flowStateRel = flowStatePath(info.flowId);
      const flowRel = governanceFlowPath(info.flowId);
      let flowStateText: string | undefined;
      try {
        flowStateText = await readFile(`${info.projectRoot}/${flowStateRel}`, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          // 存在但不可读（权限/IO）：按不可读处理，不落 legacy 猜测；后续事件可再检查。
          diagnostic.error("acceptance.flow-state.unreadable", error, { path: flowStateRel });
          acceptanceDispatchedFlows.delete(key);
          return;
        }
      }
      let issue: string | undefined;
      let issueMode: "yaml" | "legacy" = "yaml";
      let issuePath = flowStateRel;
      if (flowStateText !== undefined) {
        const parsed = parseFlowStateYaml(flowStateText, info.flowId);
        if (!parsed.ok) {
          // 校验错误逐条带 YAML 文档路径（如 steps[2].status），系统行/诊断里给具体错误。
          const detail = parsed.errors.slice(0, 10).map((item) => `${item.path}: ${item.message}`).join("；");
          issue = `流程状态 YAML 校验失败：${detail}`;
          diagnostic.record("acceptance.flow-state.invalid", {
            path: flowStateRel,
            count: parsed.errors.length,
            mode: "yaml",
          });
        } else {
          // 账本坏行/不可读由编排判定同一实现 fail-closed（`FlowLedgerInput` 接受 {entries, errors}）。
          const evaluation = evaluateFlowCompletion(parsed.flow, ledger);
          if (!evaluation.ready) issue = evaluation.issues.slice(0, 10).join("；");
        }
      } else {
        issueMode = "legacy";
        issuePath = flowRel;
        diagnostic.record("acceptance.flow-state.missing", { path: flowRel, mode: "legacy" });
        let markdown: string;
        try {
          markdown = await readFile(`${info.projectRoot}/${flowRel}`, "utf8");
        } catch (error) {
          diagnostic.record("acceptance.flow.unreadable", { path: flowRel, mode: "legacy" });
          acceptanceDispatchedFlows.delete(key); // 流程单未落盘：保持现状，后续事件可再检查
          return;
        }
        issue = flowCompletionIssue(info.flowId, markdown, ledger);
      }
      if (issue !== undefined) {
        diagnostic.record("acceptance.flow.incomplete", { flowId: info.flowId, reason: issue, mode: issueMode });
        // 2026-10-19 客户反馈「这个难道不是bug吗」：门 fail-closed 正确，但原因只进诊断日志 ⇒
        // Steward/客户看不到，只能由操作者手动复算转告——**静默本身是缺陷**。把具体原因 + 可操作建议
        // 作为系统行发给 Lead（主入口；2026-10-19 客户决定：统一发 Lead，不再发 Convener）。
        // 去重：同一 flow + 同一原因只发一次；原因变化再发；不循环重试、不改门禁判定
        // （不自动把 failed/aborted 当 superseded、不自动派 Proof）。建议路径随模式指向 YAML/legacy MD。
        if (acceptanceBlockedNotified.get(key) !== issue) {
          acceptanceBlockedNotified.set(key, issue);
          note(governanceAcceptanceBlockedNote(info.flowId, issue, issuePath));
          diagnostic.record("acceptance.flow.incomplete.notified", { flowId: info.flowId, reason: issue, mode: issueMode, roleId: noteRoleId });
        }
        acceptanceDispatchedFlows.delete(key); // 未完成/证据不足：不派；后续事件可再检查（不是循环）
        return;
      }
      // 门已通过（本次判定）：清除阻塞告知记忆——若之后再次被挡（即使原因文本相同）会重新告知。
      acceptanceBlockedNotified.delete(key);
      const evidence =
        info.evidence.length > 0 ? info.evidence : acceptanceEvidenceByFlow.get(key) ?? [];
      // 引擎选择（2026-10-19 真机缺陷修复）：活跃会话/真实事件 → 应用内已选/持久化 → `.ans/sessions`
      // 磁盘证据 → 凭据可用性。无法确定 ⇒ **不派发**、落一条明确系统行 + 诊断（不循环重试）；
      // 绝不回退桌面默认 "claude"（项目实际用 Pi 时会在无 ANTHROPIC_API_KEY 下失败）。
      const activeRuntime =
        info.runtime ?? acceptanceRuntimeHints.get(info.projectRoot) ?? manager.activeRuntimeFor(info.projectRoot);
      let resolution: RuntimeResolution;
      try {
        resolution = await resolveAcceptanceRuntime(info.projectRoot, activeRuntime);
      } catch (error) {
        diagnostic.error("acceptance.runtime.resolve.failed", error, { flowId: info.flowId });
        resolution = { ok: false, message: RUNTIME_UNRESOLVED_MESSAGE, skipped: [] };
      }
      if (!resolution.ok) {
        // 释放运行期占位：客户选定引擎后的真实事件可以再检查一次；没有事件就不会重试（非循环）。
        acceptanceDispatchedFlows.delete(key);
        diagnostic.error("acceptance.runtime.unresolved", new Error(resolution.message), { flowId: info.flowId });
        if (!acceptanceRuntimeUnresolvedNotified.has(info.projectRoot)) {
          acceptanceRuntimeUnresolvedNotified.add(info.projectRoot);
          note(resolution.message);
        }
        return;
      }
      const runtime = resolution.runtime;
      noteRuntime = runtime; // 之后的开/发/系统行都按实际引擎路由（Pi 视图可见）
      const message = buildAcceptanceTaskMessage(info.flowId, evidence, {
        flowUpdatedSinceReview,
        ...acceptanceTaskOptions,
        reportPath: governanceAcceptanceReportPath(info.flowId),
      });
      const opened = await manager.openBackground({ projectRoot: info.projectRoot, roleId: "verifier", runtime });
      if (!opened.ok) {
        acceptanceDispatchedFlows.delete(key);
        diagnostic.error("acceptance.open.failed", new Error(opened.error ?? "unknown"), { flowId: info.flowId });
        note(`收尾推进失败：无法开启 Proof / 验收 会话：${opened.error ?? "未知原因"}；未自动重试。`);
        return;
      }
      const sent = await manager.sendBackground({ projectRoot: info.projectRoot, roleId: "verifier", runtime, text: message });
      if (!sent.ok) {
        acceptanceDispatchedFlows.delete(key);
        diagnostic.error("acceptance.send.failed", new Error(sent.error ?? "unknown"), { flowId: info.flowId });
        note(`收尾推进失败：发送验收任务给 Proof / 验收 失败：${sent.error ?? "未知原因"}；未自动重试。`);
        return;
      }
      // 系统行在**投递成功即发**（不等审计落盘）：可见性不依赖持久化 I/O 的完成时序；账本写失败只记诊断，
      // 不翻转「已派发」这个事实（既有语义不变，只是更早呈现）。
      note(governanceAcceptanceAdvanceNote(info.flowId));
      // 成功派发后记住该项目实际使用的引擎（user-data 独立 JSON）——下次冷启动补齐检查据此选路；
      // 写失败只记诊断，不影响已完成的派发/审计。
      const persisted = await persistProjectRuntime(deps.runtimeStatePath, info.projectRoot, runtime);
      if (!persisted.ok) {
        diagnostic.error("acceptance.runtime.persist.failed", new Error(persisted.error ?? "unknown"), { flowId: info.flowId });
      }
      // 持久化去重 + 审计：应用自动派发 ≠ 客户批准（不写 customerDecision/decisionEvidence）。
      const appended = await appendGovernanceLedger(info.projectRoot, {
        at: new Date().toISOString(),
        kind: "dispatch.accepted",
        flowId: info.flowId,
        stepId: "verification",
        actorRoleId: "app",
        power: "app",
        trigger: "settle",
        targetRoleId: "verifier",
        messageSummary: ledgerSummary(message),
        runtime,
      });
      if (!appended.ok) {
        diagnostic.error("acceptance.ledger.failed", new Error(appended.message), { flowId: info.flowId });
      }
      diagnostic.record("acceptance.dispatched", { flowId: info.flowId, queued: sent.queued === true, trigger: info.trigger, mode: issueMode });
    } catch (error) {
      acceptanceDispatchedFlows.delete(key);
      diagnostic.error("acceptance.advance.failed", error, { flowId: info.flowId });
    }
  };

  const manager = new SessionManager({
    openRoleSession: openRoleSessionFn,
    createPiAdapterFactory: createPiAdapterFactoryFn,
    createRuntimeAdapterFactory: runtimeFactory,
    runtimeOptions: deps.runtimeOptions,
    // 「替我审」：每会话判断闭包工厂（会话用同一份 runtimeOptions/createAdapter 构造；缺省真实实现）。
    createShellJudge: createShellJudgeFn,
    // 「替我决策」（2026-10-18 双开关评审 §8.2）：每会话治理判断闭包工厂（仅 trio + 通道已接时构造）。
    createGovernanceJudge: createGovernanceJudgeFn,
    prepareRuntimeProfile: async (runtime) => {
      if (!pendingProfiles.has(runtime)) return;
      if (runtime === "pi" && manager.hasBusyRuntime("pi")) throw new Error("Pi 的旧轮次仍在执行，新配置将在其结束后应用。消息可继续排队。");
      await applyRuntimeConfig(runtime, envFilePath, deps.piConfigEnv ?? process.env);
      pendingProfiles.delete(runtime);
    },
    createDemoAdapter: createDemoAdapterFn,
    buildProjectConfig: buildProjectConfigFn,
    // I1：界面 `governanceRecord` 与会话授权链共用同一载入器注入（缺省＝共享载入器真实实现）。
    loadEffectiveConfig: loadEffectiveConfigFn,
    getListing: (root) => listingCache.get(root),
    emitEvent: emitSessionEvent,
    // 收尾推进（2026-10-18；2026-10-19 扩展）：回交送达 Steward / 统筹 且其本轮 settle 后，检查流程完成度
    // 并（仅全部完成时）派 Proof / 验收。回交 settle 是确定性信号 ⇒ `force` 跳过在途守卫。
    onHandbackSettled: (info) => {
      rememberAcceptanceEvidence(info.projectRoot, info.flowId, info.evidence);
      void dispatchAcceptanceForFlow({ ...info, evidence: info.evidence, force: true, trigger: "handback" });
    },
    // 回交到达（尚未 settle）：先记住证据路径并登记一次检查——通用 settle 触发也能带上报告路径。
    onHandbackReceived: (info) => {
      if (info.flowId !== undefined) rememberAcceptanceEvidence(info.projectRoot, info.flowId, info.evidence);
      scheduleAcceptanceCheck(info.projectRoot);
    },
    // 桌面侧治理账本追加（dispatch.accepted 等）：账本变更后重新检查（有界合并）。
    onGovernanceLedgerAppended: (info) => { scheduleAcceptanceCheck(info.projectRoot, "ledger"); },
    emitPersistenceChange: update => { if (update.scope.projectRoot === importedProjectRoot) deps.emitPersistenceChange?.(update); },
    // L-1 + 状态准确性：真实状态快照外推（变化时；缺省 ⇒ 界面无队列行/忙态——入队本身不受影响）。
    emitRoleState: deps.emitRoleState,
    shellGate: deps.shellGate,
    shellOperatorChannel: deps.shellOperatorChannel,
    // I-1 补丁（2026-10-12 客户重发授权）：(c) 规则集实件——与 (a) 同处透传（仅项目角色消费；见 session.ts）。
    shellArming: deps.shellArming,
    // 客户交互通道（A-5）：su 的 request_confirmation/request_choice 经它摆到界面并取回裁决
    // （仅内置治理角色会话消费；缺省未接 ⇒ 不注入 ⇒ 无确认制——绝不悄悄放行）。
    customerInput: deps.customerInput,
    // G-2/W5：恢复确认卡通道（缺省 ⇒ 恢复提议「未接线、未获执行」如实回执——fail-closed）。
    recoveryConfirm: deps.recoveryConfirm,
    // 2026-10-20（客户总原则「我勾选了替我决策就不用我来管了」）：决策开关开启 ⇒ 恢复提议不弹客户卡、
    // 直接执行并如实回执；关闭 ⇒ 旧行为逐字不变（推卡、未确认零执行）。
    autoDecisionEnabled: () => decisionJudgeSwitch.isEnabled(),
    // G-2/W1：看护的观察转发（settled/命令超时/真实活动）与只读统计；看护缺席 ⇒ 不转发（一切照旧）。
    watchdogObserver: watchdogService !== undefined ? (root, observation) => watchdogService!.observe(root, observation) : undefined,
    watchdogPendingConfirmations: deps.watchdogPendingSnapshot,
    watchdogStats: watchdogService !== undefined ? (root) => watchdogService!.stats(root) : undefined,
    // 2026-10-20 客户要求：投递队列持久化（重启自动续跑；userData，不写项目文件）。缺省 undefined ⇒ 旧行为。
    ...(deliveryQueueStorePath !== undefined ? { deliveryQueueStorePath } : {}),
    now: deps.watchdogOptions?.now,
    // 首轮寻址修复（2026-10-13 真机 bootstrap J-1 缺陷）：派发路由缓存 miss 时**实时重枚举一次**——
    // 与界面 listProject 同一路径（同一 listProjectFn）、刷**同一份**共享缓存（后续 openInternal 自动
    // 开会话读的也是它）。全新空项目 bootstrap 首轮：su 建好角色后同一轮内派发即可寻址。
    refreshListing: async (root: string) => {
      const fresh = await listProjectFn(root);
      listingCache.set(fresh.projectRoot, fresh);
    },
  });

  // 验收检查的执行体（由 `scheduleAcceptanceCheck` 的有界 tick 调用）：枚举项目流程状态文件 → 逐 flow 过同一道
  // 触发门。`dispatch.accepted` 的账本去重保证导入/重启后的补齐检查不会重复派 Proof。
  runAcceptanceCheck = async (projectRoot: string, trigger: "settle" | "ledger" | "import"): Promise<void> => {
    const listing = listingCache.get(projectRoot);
    if (listing?.governanceModel !== "trio") return;
    const flowIds = await listGovernanceFlowIds(projectRoot);
    if (flowIds.length === 0) return;
    // 引擎在 `dispatchAcceptanceForFlow` 内按统一解析器选择（冷启动时没有活跃会话 ⇒ 走持久化/磁盘证据/凭据；
    // 无法确定则该 flow 不派并落系统行）。
    for (const flowId of flowIds) {
      await dispatchAcceptanceForFlow({ projectRoot, flowId, evidence: [], trigger });
    }
  };

  // —————— 2026-10-20 客户要求：写卡产物（appointment-write）的**确定性门控** ——————
  //
  // 客户原话：「写角色的角色写完角色卡/边界后要有一个确定性门控——核对卡的格式和文件是否都存在；
  // 有问题把具体问题反馈给 Crew 修正，不能继续推进，也不弹客户卡。」
  // 解析口径与 `listProject` 同一份：边界 YAML 走 Service 公开出口 `validateBoundaryYamlText`
  // （与运行时加载器同一个 `parseBoundaryYamlDoc`），role/entries 形状与 `listProject` 的 warnings 互证；
  // 本层**不另写第二份 boundary 解析器**（顶层 `role` 身份检查用同一 `yaml` 包的解析结果）。
  /**
   * 一条写卡产物问题（角色 / 项目相对路径 / 具体原因 / 来源 / 是否仅提醒）。
   * 2026-10-22 第 5 项：问题按来源分流——`crew`（角色卡/边界/工作文档）反馈 Crew 修正；
   * `convener`（团队计划缺行/缺职责·能力·写集·依赖/类型不可识别）反馈 Convener 补充计划。
   * `warning:true` = 不阻塞（迁移策略 Q9/Q11 A：existing 角色只做存在/格式检查并记录提醒）。
   */
  type AppointmentArtifactIssue = {
    roleId: string;
    path: string;
    issue: string;
    source?: "crew" | "convener";
    warning?: boolean;
  };
  /** 反馈去重：`projectRoot\0flowId` → 最近一次已反馈的问题哈希（同哈希不刷屏；修正后重新校验再报）。 */
  const appointmentArtifactFeedback = new Map<string, string>();

  /** 新/变更角色的 role-card 必填章节（方案 §6.1 第 1–9 项；等价标题即可）。 */
  const REQUIRED_ROLE_CARD_SECTIONS: ReadonlyArray<{ label: string; test: RegExp }> = [
    { label: "组别", test: /组别|group/i },
    { label: "工作立场", test: /工作立场/ },
    { label: "能力描述", test: /能力描述|职责与能力/ },
    { label: "职责与功能导航", test: /系统功能导航|职责与功能导航/ },
    { label: "必读资料", test: /必读资料/ },
    { label: "交接输入输出", test: /交接/ },
    { label: "执行原则", test: /执行原则/ },
    { label: "质量职责", test: /质量/ },
    { label: "标准工作流", test: /工作流/ },
    { label: "交付物清单", test: /交付物/ },
  ];
  /** 角色根工作文档（新/变更角色必填；existing 只做存在检查并记提醒）。 */
  const ROLE_WORK_DOC_FILES = ["feature-map.md", "functional-description.md", "memo.md", "api-spec.md"] as const;

  /**
   * **写卡产物确定性校验**（2026-10-20 客户要求；2026-10-22 第 5 项扩展）。
   *
   * 结构最低门槛（方案 §6.1/§6.2）：role-card.md 必需章节；boundary.yaml 现有 schema + 角色根工作文档条目
   * + 实际写集；feature-map/functional-description/memo/api-spec（或 not-applicable + 非空理由）。
   * **强制范围**：读取团队计划，`new`/`changed` 角色应用完整清单；`existing` 只做存在/格式检查并记 warning
   * （迁移策略 Q9/Q11 A——不一次性重写历史角色卡）。团队计划缺角色行/类型/四列内容 ⇒ 来源 Convener。
   * 无团队计划的 legacy 流程只做最低结构检查（O4/G4 迁移兼容），并记一条 warning。
   * 只做结构判定，**不宣称能力描述已完成**（语义由 Convener readiness 复核）。
   */
  const validateAppointmentArtifacts = async (
    projectRoot: string,
    roleIds: readonly string[],
    listing: ProjectListing | undefined,
    options: { flowId?: string; appointmentArtifactPath?: string } = {},
  ): Promise<AppointmentArtifactIssue[]> => {
    const issues: AppointmentArtifactIssue[] = [];
    const seen = new Set<string>();
    const push = (
      roleId: string,
      relPath: string,
      issue: string,
      extra: { source?: "crew" | "convener"; warning?: boolean } = {},
    ): void => {
      const source = extra.source ?? "crew";
      const warning = extra.warning === true;
      const key = `${roleId}\u0000${relPath}\u0000${source}\u0000${warning ? "w" : "b"}\u0000${issue}`;
      if (seen.has(key)) return;
      seen.add(key);
      issues.push({ roleId, path: relPath, issue, source, ...(warning ? { warning: true } : {}) });
    };
    const readDoc = async (relPath: string): Promise<{ text?: string; error?: string }> => {
      try {
        return { text: await readFile(path.join(projectRoot, ...relPath.split("/")), "utf8") };
      } catch (error) {
        return {
          error: (error as NodeJS.ErrnoException).code === "ENOENT" ? "文件不存在" : `读取失败：${(error as Error).message}`,
        };
      }
    };

    const flowId = options.flowId;
    const plan = flowId !== undefined ? await readTeamPlanInfo(projectRoot, flowId, options.appointmentArtifactPath) : undefined;
    const planBoundButMissing =
      plan === undefined &&
      typeof options.appointmentArtifactPath === "string" &&
      options.appointmentArtifactPath.startsWith("docs/scheduling/");
    if (plan !== undefined) {
      // 计划级问题（frontmatter/角色表/V1–V10）来源＝Convener：Crew 不自行补计划。
      for (const issue of plan.planIssues) {
        push("团队计划", plan.relPath, issue, { source: "convener" });
      }
      // 非阻断提醒（legacy 迁移 / v2 warning/exception-review）：只记诊断，不派任务、不阻塞推进。
      for (const warning of plan.warnings) {
        push("团队计划", plan.relPath, warning, { source: "convener", warning: true });
      }
      if (flowId !== undefined && plan.frontmatterFlowId !== undefined && plan.frontmatterFlowId !== flowId) {
        push("团队计划", plan.relPath, `frontmatter flowId="${plan.frontmatterFlowId}" 与流程 ${flowId} 不一致`, {
          source: "convener",
        });
      }
    } else if (planBoundButMissing) {
      push(
        "团队计划",
        options.appointmentArtifactPath!,
        "团队计划缺失或不可读（账本 appointment 已绑定该计划）；请 Steward / 统筹 重新写出计划后再校验",
        { source: "convener" },
      );
    } else if (flowId !== undefined) {
      push(
        "团队计划",
        governanceTeamPlanPath(flowId),
        "团队计划缺失：按 legacy 流程只做最低结构检查（建议迁移 team-plan / role-cards 流程）",
        { warning: true },
      );
    }

    for (const roleId of roleIds) {
      const dir = `角色卡/${roleId}`;
      const cardRel = `${dir}/role-card.md`;
      const boundaryRel = `${dir}/boundary.yaml`;
      const row = plan?.rows.get(roleId);
      // 计划角色行问题（来源 Convener）：缺行；legacy 额外保留 v1 的类型/四列检查。
      // v2 的类型/module/职责/能力/写集/契约/测试面/dependsOn/并行组等已由编排单一解析器报入 planIssues，
      // 此处不重复。V12（计划写集 vs boundary）在 boundary 解析后单独核对。
      if (plan !== undefined) {
        if (row === undefined) {
          push("团队计划", plan.relPath, `团队计划缺少推荐/任命角色 ${roleId} 的角色行`, { source: "convener" });
        } else if (plan.legacy) {
          if (row.roleType === undefined) {
            push("团队计划", plan.relPath, `团队计划角色 ${roleId} 的类型缺失或不可识别（须为 new / changed / existing）`, {
              source: "convener",
            });
          }
          const columns: Array<[string, string]> = [
            ["职责目标", row.duty],
            ["能力要求", row.ability],
            ["写集", row.writes],
            ["依赖", row.deps],
          ];
          for (const [label, value] of columns) {
            if (value === "" || value === "-" || value === "—") {
              push("团队计划", plan.relPath, `团队计划角色 ${roleId} 的「${label}」为空（计划缺细节）`, { source: "convener" });
            }
          }
        }
      }
      // 强制范围：new/changed 应用完整清单；existing / legacy 只做存在/格式检查并记 warning。
      const fullCheck = plan !== undefined && (row === undefined || row.roleType === undefined || row.roleType !== "existing");
      // ① role-card.md：存在、可读、非空、至少一个 Markdown 标题。
      const card = await readDoc(cardRel);
      if (card.error !== undefined) push(roleId, cardRel, card.error);
      if (card.text !== undefined) {
        if (card.text.trim() === "") push(roleId, cardRel, "文件为空（需要角色卡正文）");
        else if (!/^#{1,6}\s/m.test(card.text)) push(roleId, cardRel, "缺少 Markdown 标题（至少一行以 # 开头）");
        else if (fullCheck) {
          for (const section of REQUIRED_ROLE_CARD_SECTIONS) {
            if (!section.test.test(card.text)) {
              push(roleId, cardRel, `缺少「${section.label}」章节或等价内容（第 5 项必填）`);
            }
          }
        }
      }
      // ② boundary.yaml：存在、可读、非空；与 listProject 同一解析器；顶层 role 与目录 id 一致；entries 非空。
      let boundaryEntries: readonly { path: string; kind: string; root?: string }[] | undefined;
      const boundary = await readDoc(boundaryRel);
      if (boundary.error !== undefined) push(roleId, boundaryRel, boundary.error);
      if (boundary.text !== undefined) {
        if (boundary.text.trim() === "") {
          push(roleId, boundaryRel, "文件为空（需要 role + entries 的边界 YAML）");
        } else {
          const validation = validateBoundaryYamlText(boundary.text); // 与运行时加载器同一实现
          if (!validation.ok) {
            push(roleId, boundaryRel, `边界 YAML 解析失败：${validation.message}`);
          } else {
            boundaryEntries = validation.entries;
            if (validation.entries.length === 0) push(roleId, boundaryRel, "entries 为空（Section 1 至少需要一条条目）");
            let declaredRole: unknown;
            try {
              const doc = parseYaml(boundary.text) as unknown;
              declaredRole =
                doc !== null && typeof doc === "object" && !Array.isArray(doc)
                  ? (doc as Record<string, unknown>).role
                  : undefined;
            } catch {
              // YAML 语法错误已由 validateBoundaryYamlText 报出（此处只做身份检查）。
            }
            if (declaredRole !== roleId) {
              push(
                roleId,
                boundaryRel,
                `顶层 role 与目录 id 不一致（YAML role=${declaredRole === undefined ? "未提供" : JSON.stringify(declaredRole)}，目录=${roleId}）`,
              );
            }
          }
        }
      }
      // ②b boundary 必填条目（新/变更角色）：角色根工作文档 + 实际写集。
      if (fullCheck && boundaryEntries !== undefined && boundaryEntries.length > 0) {
        const paths = new Set(
          boundaryEntries.filter((entry) => entry.kind === "file").map((entry) => entry.path.replace(/\\/g, "/")),
        );
        for (const file of ROLE_WORK_DOC_FILES) {
          const required = `${dir}/${file}`;
          if (!paths.has(required)) {
            push(roleId, boundaryRel, `entries 缺少角色根工作文档条目 ${required}（第 5 项必填）`);
          }
        }
        if (boundaryEntries.length === ROLE_WORK_DOC_FILES.length) {
          push(roleId, boundaryRel, "entries 仅含角色根工作文档条目，未见团队计划的实际写集条目（请核对计划写集）", {
            warning: true,
          });
        }
      }
      // ②c V12（团队计划 v2；写卡后校验）：计划写集必须被该角色 boundary.yaml entries 覆盖。
      // 覆盖判定用编排单一解析器给出的写集条目（不复制 v2 写集语法）。问题来源＝Crew 文件；
      // existing 角色只 warning（迁移策略：不强制重写历史边界），new/changed 阻塞并退回 Crew，
      // 并在文案中提示「若计划写集本身有误则报告 Convener 修正计划」。
      if (
        plan !== undefined &&
        !plan.legacy &&
        row !== undefined &&
        row.writesets.length > 0 &&
        boundaryEntries !== undefined &&
        boundaryEntries.length > 0
      ) {
        const existing = row.roleType === "existing";
        for (const writeset of row.writesets) {
          if (boundaryCoversPlanWriteset(writeset, boundaryEntries)) continue;
          push(
            roleId,
            boundaryRel,
            existing
              ? `计划写集「${writeset.path}」未被 boundary.yaml entries 覆盖（existing：仅提醒，不阻塞；下次实质变更时补齐）`
              : `计划写集「${writeset.path}」未被 boundary.yaml entries 覆盖（Crew：按团队计划把该路径加入 Section 1；若计划写集本身有误，报告 Convener 修正计划）`,
            existing ? { source: "crew", warning: true } : { source: "crew" },
          );
        }
      }
      // ③ 角色根工作文档（feature-map/functional-description/memo/api-spec）。
      for (const file of ROLE_WORK_DOC_FILES) {
        const rel = `${dir}/${file}`;
        const doc = await readDoc(rel);
        const missingExtra = fullCheck ? {} : { warning: true };
        if (doc.error !== undefined) {
          push(roleId, rel, fullCheck ? doc.error : `${doc.error}（existing/legacy：仅提醒）`, missingExtra);
          continue;
        }
        const text = doc.text ?? "";
        if (text.trim() === "") {
          push(roleId, rel, fullCheck ? "文件为空（需要正文）" : "文件为空（existing/legacy：仅提醒）", missingExtra);
          continue;
        }
        if (!/^#{1,6}\s/m.test(text)) {
          push(roleId, rel, fullCheck ? "缺少 Markdown 标题（至少一行以 # 开头）" : "缺少 Markdown 标题（existing/legacy：仅提醒）", missingExtra);
        }
        if (file === "feature-map.md") {
          const hasRows = /^\s*\|.+\|\s*$/m.test(text) || /^\s*[-*]\s+\S/m.test(text);
          const declaresNone = /无直接(?:负责的)?系统功能|无系统功能|不直接负责/.test(text);
          if (!hasRows && !declaresNone) {
            push(roleId, rel, "既无功能表/列表行，也未声明无直接负责的系统功能");
          }
        } else if (file === "functional-description.md") {
          if (!/(职责|交接|代码位置|文档位置)/.test(text)) {
            push(roleId, rel, "缺少职责/交接/代码位置或等价内容");
          }
        } else if (file === "memo.md") {
          if (!/(?:^|\n)\s*(?:[-*]\s*)?\d{4}-\d{2}-\d{2}/.test(text)) {
            push(roleId, rel, "至少需要一行 YYYY-MM-DD 的续接记录");
          }
        } else if (file === "api-spec.md") {
          const notApplicable = /not-applicable/i.test(text);
          const hasInterface = /(接口|API|导出|IPC|方法|契约|通道)/i.test(text);
          if (!hasInterface) {
            if (!notApplicable) {
              push(roleId, rel, "未包含接口/导出/契约说明，也未写 not-applicable + 非空理由");
            } else {
              // not-applicable 必须带非空理由（去掉标记行后的正文非空）。
              const reason = text.replace(/^.*not-applicable.*$/gim, "").trim();
              if (reason === "") push(roleId, rel, "api-spec.md 标为 not-applicable 但未给出非空理由");
            }
          }
        }
      }
      // ④ listProject 刷新后的 warnings 辅助定位（缺文件/解析失败/重复/冲突等）——已由直接检查覆盖的
      //    同类问题不再重复；warning 文本原样保留原因。
      for (const warning of listing?.warnings ?? []) {
        if (!warning.startsWith(`${dir}：`)) continue;
        const relPath = warning.includes("role-card.md") ? cardRel : /boundary|边界/.test(warning) ? boundaryRel : dir;
        if (issues.some((issue) => issue.roleId === roleId && issue.path === relPath)) continue;
        push(roleId, relPath, `listProject 警告：${warning.slice(dir.length + 1)}`);
      }
    }
    return issues;
  };

  /** Crew 修正任务文本（逐文件列出 Crew 来源问题；要求重发 appointment-write 卡完成写卡）。 */
  const buildAppointmentArtifactFeedback = (flowId: string, issues: readonly AppointmentArtifactIssue[]): string => {
    const crewIssues = issues.filter((issue) => issue.source !== "convener");
    const blocking = crewIssues.filter((issue) => issue.warning !== true);
    const warnings = crewIssues.filter((issue) => issue.warning === true);
    return [
      `流程 ${flowId}：写卡产物未通过校验（appointment 步骤不能继续；未派 Steward / 统筹 做 role-readiness，也未把步骤标为 done）。`,
      "具体问题：",
      ...blocking.map((issue) => `- ${issue.path}：${issue.issue}`),
      ...(warnings.length > 0 ? ["提醒（不阻塞，existing/legacy 角色）：", ...warnings.map((issue) => `- ${issue.path}：${issue.issue}`)] : []),
      "请修正上述文件后**重新发 appointment-write 确认卡**完成写卡（role-card.md 需含第 5 项必填章节；boundary.yaml 需为合法 YAML，顶层 role 与目录 id 一致，entries 含角色根工作文档与实际写集；工作文档按 feature-map/functional-description/memo/api-spec 补齐，api-spec 不适用时写 not-applicable + 非空理由）。",
    ].join("\n");
  };

  /** Convener 修正任务文本（团队计划缺细节/缺行/类型不可识别；Crew 暂停、不自行补计划）。 */
  const buildAppointmentPlanFeedback = (flowId: string, issues: readonly AppointmentArtifactIssue[]): string => {
    const planIssues = issues.filter((issue) => issue.source === "convener");
    return [
      `流程 ${flowId}：团队计划未通过结构校验（任命的写卡步骤暂停；Crew 不自行补计划，应用未派 role-readiness、未把步骤标为 done）。`,
      "具体问题：",
      ...planIssues.map((issue) => `- ${issue.path}：${issue.issue}`),
      "请修正/补充团队计划（frontmatter flowId/version/riskTier/recommended；角色表逐角色含类型 new/changed/existing、职责目标、能力要求、唯一写集、依赖），必要时递增为 v2 并重发任命卡；修正后应用会重新校验。",
    ].join("\n");
  };

  /**
   * 把写卡产物问题**按来源分流**反馈（后台投递，不弹客户卡），并落一条 Lead 系统行：
   *  - Crew 来源（role-card/boundary/工作文档）⇒ 反馈 Crew 修正（重发 appointment-write）；
   *  - Convener 来源（团队计划缺行/缺职责·能力·写集·依赖/类型不可识别）⇒ 反馈 Convener 补充计划；
   *  - 仅 warning（existing/legacy 的最低检查提醒）⇒ 只记诊断，不派任务、不发系统行（避免噪音）。
   * 去重：同 flow+问题哈希只反馈一次（修正后问题哈希变化才再次反馈；通过后清除，回归可再报）。
   * 运行时无法确定/开或发失败 ⇒ 只记诊断，下一次真实事件重试（不循环）。
   */
  const reportAppointmentArtifactIssues = async (
    projectRoot: string,
    flowId: string,
    issues: readonly AppointmentArtifactIssue[],
    listing: ProjectListing | undefined,
    options: { runtime?: RuntimeKind } = {},
  ): Promise<void> => {
    if (issues.length === 0) return;
    const diagnostic = createDiagnosticLogger({ component: "desktop.governance-advance", projectRoot, roleId: "nominator" });
    const blocking = issues.filter((issue) => issue.warning !== true);
    if (blocking.length === 0) {
      diagnostic.record("advance.appointment.artifacts-warning", { flowId, count: issues.length });
      return; // 只有提醒：不阻塞、不派任务（迁移策略：existing/legacy 仅记录 warning）
    }
    const hash = createHash("sha256")
      .update(
        issues
          .map((issue) => `${issue.roleId}\u0000${issue.path}\u0000${issue.source ?? "crew"}\u0000${issue.warning === true ? "w" : "b"}\u0000${issue.issue}`)
          .sort()
          .join("\n"),
      )
      .digest("hex");
    const dedupeKey = `${projectRoot}\u0000${flowId}`;
    if (appointmentArtifactFeedback.get(dedupeKey) === hash) return; // 同 flow+issuesHash：不刷屏
    let runtime: RuntimeKind | undefined =
      options.runtime ?? acceptanceRuntimeHints.get(projectRoot) ?? manager.activeRuntimeFor(projectRoot);
    if (runtime === undefined) {
      try {
        const resolution = await resolveAcceptanceRuntime(projectRoot);
        if (resolution.ok) runtime = resolution.runtime;
      } catch (error) {
        diagnostic.error("advance.appointment.artifacts.runtime.failed", error, { flowId });
      }
    }
    if (runtime === undefined) {
      diagnostic.record("advance.appointment.artifacts.runtime-unresolved", { flowId });
      return;
    }
    const crewIssues = issues.filter((issue) => issue.source !== "convener");
    const crewBlocking = blocking.filter((issue) => issue.source !== "convener");
    const planBlocking = blocking.filter((issue) => issue.source === "convener");
    let dispatchedAny = false;
    if (crewBlocking.length > 0) {
      const text = buildAppointmentArtifactFeedback(flowId, crewIssues);
      const opened = await manager.openBackground({ projectRoot, roleId: "nominator", runtime });
      if (!opened.ok) {
        diagnostic.error("advance.appointment.artifacts.open.failed", new Error(opened.error ?? "unknown"), { flowId });
        return;
      }
      const sent = await manager.sendBackground({ projectRoot, roleId: "nominator", runtime, text });
      if (!sent.ok) {
        diagnostic.error("advance.appointment.artifacts.send.failed", new Error(sent.error ?? "unknown"), { flowId });
        return;
      }
      dispatchedAny = true;
    }
    if (planBlocking.length > 0) {
      const text = buildAppointmentPlanFeedback(flowId, issues);
      const opened = await manager.openBackground({ projectRoot, roleId: "convener", runtime });
      if (!opened.ok) {
        diagnostic.error("advance.appointment.plan.open.failed", new Error(opened.error ?? "unknown"), { flowId });
        return;
      }
      const sent = await manager.sendBackground({ projectRoot, roleId: "convener", runtime, text });
      if (!sent.ok) {
        diagnostic.error("advance.appointment.plan.send.failed", new Error(sent.error ?? "unknown"), { flowId });
        return;
      }
      dispatchedAny = true;
    }
    if (!dispatchedAny) return;
    appointmentArtifactFeedback.set(dedupeKey, hash);
    diagnostic.record("advance.appointment.artifacts-rejected", { flowId, count: blocking.length });
    // Lead 系统行（去重随哈希）：如实说明未推进、已按来源退回。
    const primaryRoleId = listing?.primaryRoleId;
    if (typeof primaryRoleId === "string" && primaryRoleId !== "") {
      const routed = [
        crewBlocking.length > 0 ? `Crew / 组队 修正 ${crewBlocking.length} 个` : "",
        planBlocking.length > 0 ? `Steward / 统筹 补充计划 ${planBlocking.length} 个` : "",
      ].filter((part) => part !== "").join("、");
      try {
        emitSessionEvent({
          roleId: primaryRoleId,
          projectRoot,
          runtime,
          event: {
            kind: "message",
            summary:
              `写卡产物未通过校验（流程 ${flowId}）：${blocking.length} 个问题——已反馈 ${routed}；` +
              `未派 Steward / 统筹 做 role-readiness、未把 appointment 步骤标为 done。首个问题：${blocking[0]!.path}：${blocking[0]!.issue}`,
            detail: { source: "delivery-note" },
          },
        });
      } catch (error) {
        diagnostic.error("advance.appointment.artifacts.note.failed", error, { flowId });
      }
    }
  };

  // —————— 2026-10-20 客户要求：重启后任务自动续跑（持久队列重投）＋ 僵尸步骤自检（兜底提示） ——————
  //
  // 真机：重启把在途回合与内存队列丢掉，但 flow YAML 仍标 dispatched ⇒ 应用以为任务在途、静默卡住。
  // 主路径：投递队列持久化（session.ts），启动/项目导入时恢复并**自动重投**（复用既有 delivery/drain）；
  // 兜底：持久队列无对应项、flow YAML 标 dispatched/delivered 且 owner 无会话/队列/在途时，给 Lead 一条
  // 去重系统行（不自动派发、不弹客户卡、不把步骤标 done）。
  let deliveryRestorePromise: Promise<void> | undefined;
  /** 僵尸步骤提示去重：`projectRoot\0flowId` → revision+stale ids 哈希（同集合只提示一次；不再 stale 清除）。 */
  const zombieCheckNotified = new Map<string, string>();
  const zombieCheckTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** 系统行落 Lead（主入口；listing 未知/无 primaryRoleId ⇒ 不落——不猜角色）。 */
  const emitLeadDeliveryNote = (projectRoot: string, runtime: RuntimeKind, summary: string): void => {
    const primaryRoleId = listingCache.get(projectRoot)?.primaryRoleId;
    if (typeof primaryRoleId !== "string" || primaryRoleId === "") return;
    try {
      emitSessionEvent({
        roleId: primaryRoleId,
        projectRoot,
        runtime,
        event: { kind: "message", summary, detail: { source: "delivery-note" } },
      });
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.governance-advance", projectRoot }).error("advance.note.failed", error);
    }
  };

  /** 系统行择路 runtime：提示/活跃/治理会话 → 持久化/磁盘/凭据解析；无法确定 ⇒ undefined（不猜）。 */
  const resolveNoteRuntime = async (projectRoot: string, preferred?: RuntimeKind): Promise<RuntimeKind | undefined> => {
    if (preferred !== undefined) return preferred;
    const hinted =
      acceptanceRuntimeHints.get(projectRoot) ?? manager.activeRuntimeFor(projectRoot) ?? manager.governanceRuntimeFor(projectRoot);
    if (hinted !== undefined) return hinted;
    try {
      const resolution = await resolveAcceptanceRuntime(projectRoot);
      return resolution.ok ? resolution.runtime : undefined;
    } catch {
      return undefined;
    }
  };

  /** 启动/项目导入时恢复上次运行的投递队列并自动重投（幂等：每个进程只跑一次）。 */
  const restoreDeliveryQueuesOnce = (): Promise<void> => {
    if (deliveryRestorePromise !== undefined) return deliveryRestorePromise;
    if (deliveryQueueStorePath === undefined) {
      deliveryRestorePromise = Promise.resolve();
      return deliveryRestorePromise;
    }
    deliveryRestorePromise = (async () => {
      try {
        const report = await manager.restorePersistedDeliveries();
        if (report.restored === 0) return;
        const byProject = new Map<string, { runtime: RuntimeKind; lines: string[] }>();
        for (const item of report.items) {
          const group = byProject.get(item.projectRoot) ?? { runtime: item.runtime, lines: [] };
          const kindLabel =
            item.kind === "handback" ? "回交" : item.kind === "dispatch" ? "派发" : item.kind === "system" ? "系统" : "消息";
          group.lines.push(`- [${kindLabel}] ${item.summary}（角色 ${item.roleId} · ${item.runtime}）`);
          byProject.set(item.projectRoot, group);
        }
        for (const [projectRoot, group] of byProject) {
          const runtime = await resolveNoteRuntime(projectRoot, group.runtime);
          if (runtime === undefined) continue;
          emitLeadDeliveryNote(
            projectRoot,
            runtime,
            `已从上次运行恢复 ${group.lines.length} 条任务并重投（应用重启/崩溃后续跑；不弹客户卡、不把步骤标 done）：\n${group.lines.join("\n")}`,
          );
        }
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.delivery" }).error("delivery.queue.restore.failed", error);
      }
    })();
    return deliveryRestorePromise;
  };

  /** 僵尸步骤自检（有界、fire-and-forget；等待持久队列恢复完成后再判定，避免把「待恢复」误报为僵尸）。 */
  const runZombieStepCheck = async (projectRoot: string): Promise<void> => {
    const diagnostic = createDiagnosticLogger({ component: "desktop.governance-advance", projectRoot });
    try {
      await restoreDeliveryQueuesOnce();
      const listing = listingCache.get(projectRoot);
      if (listing?.governanceModel !== "trio") return; // 旧 single 不做 flow 僵尸检查
      const flowsDir = path.join(projectRoot, "docs", "flows");
      let names: string[];
      try {
        names = await readdir(flowsDir);
      } catch {
        return; // 没有 flow 目录 ⇒ 不提示（另有验收门处理）
      }
      const flowIds = [
        ...new Set(
          names
            .filter((name) => /\.ya?ml$/i.test(name))
            .map((name) => name.replace(/\.ya?ml$/i, ""))
            .filter((id) => id !== ""),
        ),
      ];
      for (const flowId of flowIds) {
        let bytes: Buffer;
        try {
          bytes = await readFile(path.join(flowsDir, `${flowId}.yaml`));
        } catch {
          continue; // 无 YAML/读失败 ⇒ 不提示
        }
        const parsed = parseFlowStateYaml(bytes.toString("utf8"), flowId);
        if (!parsed.ok) {
          diagnostic.record("advance.zombie.invalid-flow", { flowId }); // 解析失败交给验收门，不在此猜
          continue;
        }
        const staleSteps = parsed.flow.steps.filter((step) => {
          if (step.status !== "dispatched" && step.status !== "delivered") return false;
          const owner = typeof step.owner === "string" ? step.owner.trim() : "";
          if (owner === "") return false;
          // owner 有活会话 / busy / 队列 / 在途投递 ⇒ 不提示（可能只是在跑或待投）。
          const liveViews = manager.liveSessionViews().filter((view) => view.projectRoot === projectRoot && view.roleId === owner);
          if (liveViews.length > 0) return false;
          for (const runtime of RUNTIME_KINDS) {
            if (manager.hasPendingDelivery(projectRoot, owner, runtime)) return false;
          }
          return true;
        });
        const dedupeKey = `${projectRoot}\u0000${flowId}`;
        if (staleSteps.length === 0) {
          zombieCheckNotified.delete(dedupeKey); // 不再 stale ⇒ 清除，允许下次真实丢失再提示
          continue;
        }
        const revision = createHash("sha256").update(bytes).digest("hex");
        const staleIds = staleSteps.map((step) => step.id).sort();
        const notifyHash = createHash("sha256").update(`${revision}\u0000${staleIds.join("\u0000")}`).digest("hex");
        if (zombieCheckNotified.get(dedupeKey) === notifyHash) continue; // 同 flow+revision+stale 集合只提示一次
        const runtime = await resolveNoteRuntime(projectRoot);
        if (runtime === undefined) {
          diagnostic.record("advance.zombie.runtime-unresolved", { flowId });
          continue;
        }
        const facts = staleSteps.map((step) => `- 步骤 ${step.id}（owner: ${step.owner}，status: ${step.status}）`).join("\n");
        emitLeadDeliveryNote(
          projectRoot,
          runtime,
          `流程 ${flowId}：检测到 ${staleSteps.length} 个步骤可能因应用重启/崩溃丢失（flow YAML 标记为已派发，但 owner 无会话/队列/在途投递）：\n${facts}\n` +
            `请用 flow_get 核对当前 revision，必要时用 flow_step_supersede 换新步骤并 dispatch_task 重派；不要重复使用已派 stepId。`,
        );
        zombieCheckNotified.set(dedupeKey, notifyHash);
        diagnostic.record("advance.zombie.reported", { flowId, count: staleSteps.length });
      }
    } catch (error) {
      diagnostic.error("advance.zombie.failed", error);
    }
  };

  const scheduleZombieStepCheck = (projectRoot: string, delayMs = 40): void => {
    if (typeof projectRoot !== "string" || projectRoot === "") return;
    if (zombieCheckTimers.has(projectRoot)) return; // 合并窗口：有界、fire-and-forget，不阻塞导入
    const timer = setTimeout(() => {
      zombieCheckTimers.delete(projectRoot);
      void runZombieStepCheck(projectRoot);
    }, delayMs);
    (timer as { unref?: () => void }).unref?.();
    zombieCheckTimers.set(projectRoot, timer);
  };

  /**
   * **写卡后推进检查**（2026-10-19 真机第二缺陷）：Crew 已写出角色卡/边界，但应用没有重新枚举角色、
   * 也没有自动派下一步，流程停住（真机需重新导入项目才看到 backend/frontend/tester）。
   *
   * 判定（仅 trio；纯读 + 一次强制刷新）：
   *  1. 写卡来源（Nominator）仍忙 ⇒ 先等其本轮 settle（有界 8s），避免在角色卡落盘前抢跑；
   *  2. `manager.refreshListingNow` 强制刷新**共享** listing，并 `emitProjectChanged`（左树立即可见）；
   *  3. 读账本；对每个 flow 的**最新 appointment 决定**取 `targetRoleIds`；
   *  4. 目标角色必须**全部**出现在最新 listing；缺 ⇒ 只记诊断，并按 100/300/600ms **有界重试**（最多 3 次）；
   *     （2026-10-20）重试耗尽仍缺 ⇒ 把具体问题（缺文件/解析失败等）反馈 Crew 修正；
   *  4b.（2026-10-20 客户要求）**写卡产物确定性门控**：role-card.md / boundary.yaml 存在、可读、非空；
   *     role-card 至少一个 Markdown 标题；boundary 按与 `listProject` 同一解析器通过、顶层 role 与目录一致、
   *     entries 非空。任一问题 ⇒ **不派 Convener、不把 appointment 步骤标 done、不弹客户卡**，把逐文件
   *     问题反馈 Crew（同 flow+问题哈希去重；修正后重新校验）；
   *  5. appointment 之后已有到 convener 的 `dispatch.accepted`、或已有验收决定 ⇒ 既有链路已推进/已收口，不派；
   *  6. 否则复用既有 appointment 任务文本（`buildGovernanceAdvanceMessage`）派 Convener，并写同形
   *     `dispatch.accepted{actorRoleId:"app",power:"app",trigger:"customer-decision"}`。
   *
   * 去重：运行期 Set（同 project+flow+convener 一次，canonical root）+ 账本持久化；失败只记诊断并释放
   * 占位（下一次真实事件可再试，不循环）。运行中到达的事件/重试记入 pending，结束后补跑一次（不吞信号）。
   * **不伪造客户决定、不绕过门禁**。
   */
  runPostWriteAdvanceCheck = async (projectRoot: string): Promise<void> => {
    if (postWriteAdvanceRunning.has(projectRoot)) return;
    postWriteAdvanceRunning.add(projectRoot);
    const diagnostic = createDiagnosticLogger({ component: "desktop.governance-advance", projectRoot });
    try {
      if ((listingCache.get(projectRoot)?.governanceModel ?? "single") !== "trio") return;
      // 写卡来源可能仍在跑（appointment-write 刚作答）：先等 Nominator 本轮 settle（有界 8s）。
      // 角色卡通常在同一轮内写出；超时也继续（由 roles-missing 有界重试兜底）。
      const nominatorRuntime =
        manager.liveSessionViews().find((view) => view.projectRoot === projectRoot && view.roleId === "nominator")?.runtime ??
        acceptanceRuntimeHints.get(projectRoot) ??
        manager.activeRuntimeFor(projectRoot);
      if (nominatorRuntime !== undefined && manager.isRoleBusy(projectRoot, "nominator", nominatorRuntime)) {
        const settled = await manager.waitForRoleSettle(projectRoot, "nominator", nominatorRuntime, 8000);
        diagnostic.record("advance.post-write.source-settle", { busy: true, settled, count: settled ? 1 : 0 });
      }
      const refreshed = await manager.refreshListingNow(projectRoot);
      if (!refreshed) {
        diagnostic.record("advance.post-write.refresh-failed", { projectRoot });
        return;
      }
      // 左树立即可见新写出的角色卡（真机：不重新导入看不到 backend/frontend/tester）。
      try {
        deps.emitProjectChanged?.();
      } catch (error) {
        diagnostic.error("project.changed.emit.failed", error);
      }
      const listing = listingCache.get(projectRoot);
      if (listing?.governanceModel !== "trio") return;
      const ledger = await readGovernanceLedger(projectRoot);
      if (ledger.errors.length > 0) {
        diagnostic.record("advance.post-write.ledger-unreadable", { count: ledger.errors.length });
        return;
      }
      const latestAppointment = new Map<string, { entry: GovernanceLedgerEntry; index: number }>();
      ledger.entries.forEach((entry, index) => {
        if (
          entry.kind === "customer.decision" &&
          entry.decisionKind === "appointment" &&
          typeof entry.flowId === "string" &&
          entry.flowId !== ""
        ) {
          latestAppointment.set(entry.flowId, { entry, index });
        }
      });
      let missingSeen = false;
      for (const [flowId, { entry: appointment, index }] of latestAppointment) {
        const targets = (appointment.targetRoleIds ?? []).filter(
          (id): id is string => typeof id === "string" && id.trim() !== "",
        );
        if (targets.length === 0) continue;
        const missing = targets.filter((roleId) => !listing.roles.some((role) => role.roleId === roleId));
        if (missing.length > 0) {
          // 角色仍缺：只记诊断；本轮结束后统一按 100/300/600ms 有界重试（不派、不发系统行）。
          diagnostic.record("advance.post-write.roles-missing", { flowId, count: missing.length });
          missingSeen = true;
          continue;
        }
        // 2026-10-20 客户要求：写卡产物的**确定性门控**——目标角色已在 listing，但 role-card/boundary
        // 格式或内容不合格 ⇒ **不派 Convener、不把 appointment 步骤标 done、不弹客户卡**；把每个文件的
        // 具体问题按来源反馈 Crew/Convener 修正（重发 appointment-write 卡 / 补充团队计划），同 flow+问题哈希不刷屏。
        // 2026-10-22 第 5 项：读取团队计划按 new/changed/existing 决定强制范围；计划问题来源＝Convener。
        const plan = await readTeamPlanInfo(projectRoot, flowId, appointment.artifactPath);
        const artifactIssues = await validateAppointmentArtifacts(projectRoot, targets, listing, {
          flowId,
          ...(typeof appointment.artifactPath === "string" ? { appointmentArtifactPath: appointment.artifactPath } : {}),
        });
        const artifactBlockers = artifactIssues.filter((issue) => issue.warning !== true);
        if (artifactBlockers.length > 0) {
          diagnostic.record("advance.appointment.artifacts-invalid", { flowId, count: artifactBlockers.length });
          await reportAppointmentArtifactIssues(projectRoot, flowId, artifactIssues, listing);
          continue;
        }
        // 仅 warning（existing/legacy 的最低检查提醒）：不阻塞推进；report 只记诊断、不派任务。
        if (artifactIssues.length > 0) {
          await reportAppointmentArtifactIssues(projectRoot, flowId, artifactIssues, listing);
        }
        appointmentArtifactFeedback.delete(`${projectRoot}\u0000${flowId}`); // 已通过：后续回归可再报
        const afterwards = ledger.entries.slice(index + 1);
        if (
          afterwards.some(
            (entry) =>
              entry.kind === "dispatch.accepted" &&
              entry.flowId === flowId &&
              entry.targetRoleId === "convener" &&
              // 2026-10-20：Lead→Steward 协调消息也记 dispatch.accepted（power:"liaison"），
              // 但它不是步骤派发——不得据此跳过 appointment → Convener 的补齐推进。
              entry.power !== "liaison",
          )
        ) {
          continue; // 既有 appointment 链路已派过 Convener（含重启前）
        }
        if (
          afterwards.some(
            (entry) => entry.kind === "customer.decision" && entry.flowId === flowId && entry.decisionKind === "acceptance",
          )
        ) {
          continue; // 流程已收口，不再补派
        }
        const key = applicationConvenerDispatchKey(projectRoot, flowId);
        if (postWriteAdvanceDispatched.has(key)) continue;
        // 2026-10-22 第 1 项：新流程（团队计划存在）⇒ 派 Convener 做 **role-readiness**；
        // legacy 流程（无团队计划）保持旧「写流程 YAML 并派发已批准步骤」文案（迁移兼容）。
        const payload: GovernanceNextStepPayload = {
          version: 1,
          flowId,
          cardKind: "appointment",
          nextFunction: "schedule",
          roleId: "convener",
        };
        // 2026-10-20 真机：YAML 已存在时派给 Convener 的必须是「用 flow_get / flow_step_update /
        // flow_step_supersede 推进」，不是「请先写流程状态 YAML」——否则它照旧去写文件、不调 flow 工具。
        const readinessStepId = plan !== undefined ? "role-readiness" : undefined;
        const message =
          plan !== undefined
            ? buildRoleReadinessTaskMessage(flowId, targets, plan.relPath, plan.version, {
                teamPlanSchema: plan.teamPlanSchema,
                modules: plan.modules,
              })
            : buildGovernanceAdvanceMessage(payload, targets, {
                flowStateExists: existsSync(path.join(projectRoot, governanceFlowStatePath(flowId))),
              });
        if (message === null) continue;
        // **先占位，再跨 await**（2026-10-19 全仓回归：原链路与新检查在引擎解析 await 窗口内互相
        // 看不到对方的登记，各派一次）。占位后任何失败都释放，允许下一次真实事件重试。
        postWriteAdvanceDispatched.add(key);
        // 引擎：**优先真实会话提示/活跃会话**（与既有链路同一 runtime，避免为同项目另开第二 runtime
        // 会话——那会触发 LRU 驱逐正在等待的角色会话，造成原链路误判超时）；两者都缺失（冷启动）才用
        // 凭据感知解析器；无法确定 ⇒ 不派（绝不默认 claude）。
        let runtime: RuntimeKind | undefined =
          acceptanceRuntimeHints.get(projectRoot) ?? manager.activeRuntimeFor(projectRoot);
        if (runtime === undefined) {
          let resolution: RuntimeResolution;
          try {
            resolution = await resolveAcceptanceRuntime(projectRoot);
          } catch (error) {
            postWriteAdvanceDispatched.delete(key);
            diagnostic.error("advance.post-write.runtime.failed", error, { flowId });
            continue;
          }
          if (!resolution.ok) {
            postWriteAdvanceDispatched.delete(key);
            diagnostic.record("advance.post-write.runtime-unresolved", { flowId });
            continue;
          }
          runtime = resolution.runtime;
        }
        const opened = await manager.openBackground({ projectRoot, roleId: "convener", runtime });
        if (!opened.ok) {
          postWriteAdvanceDispatched.delete(key);
          diagnostic.error("advance.post-write.open.failed", new Error(opened.error ?? "unknown"), { flowId });
          continue;
        }
        const sent = await manager.sendBackground({ projectRoot, roleId: "convener", runtime, text: message });
        if (!sent.ok) {
          postWriteAdvanceDispatched.delete(key);
          diagnostic.error("advance.post-write.send.failed", new Error(sent.error ?? "unknown"), { flowId });
          continue;
        }
        // 成功系统行落 Lead（主入口）：自动推进 ≠ 客户批准（与既有推进系统行同文案）。
        try {
          emitSessionEvent({
            roleId: listing.primaryRoleId,
            projectRoot,
            runtime,
            event: {
              kind: "message",
              summary: plan !== undefined ? governanceReadinessNote() : governanceAdvanceSuccessNote(payload),
              detail: { source: "delivery-note" },
            },
          });
        } catch (error) {
          diagnostic.error("advance.post-write.note.failed", error, { flowId });
        }
        await appendApplicationDispatch({
          projectRoot,
          flowId,
          targetRoleId: "convener",
          text: message,
          ...(readinessStepId !== undefined ? { stepId: readinessStepId } : {}),
          runtime,
          trigger: "customer-decision",
          dedupeKey: key,
        });
        diagnostic.record("advance.post-write.dispatched", { flowId, queued: sent.queued === true });
        postWriteAdvanceRetries.delete(projectRoot); // 已推进：重试计数归零
      }
      // roles-missing：**有界重试**（100/300/600ms，最多 3 次）——写卡落盘与 listing 缓存可能滞后；
      // 仍缺则停止并记诊断（下一次真实事件会重置计数）。不依赖下一条 settle 才继续。
      if (missingSeen) {
        const attempt = postWriteAdvanceRetries.get(projectRoot) ?? 0;
        if (attempt < POST_WRITE_ADVANCE_RETRY_DELAYS.length) {
          postWriteAdvanceRetries.set(projectRoot, attempt + 1);
          diagnostic.record("advance.post-write.roles-missing.retry", { count: attempt + 1 });
          schedulePostWriteAdvanceCheck(projectRoot, undefined, POST_WRITE_ADVANCE_RETRY_DELAYS[attempt]!, "retry");
        } else {
          postWriteAdvanceRetries.delete(projectRoot);
          diagnostic.record("advance.post-write.roles-missing.final", { count: attempt });
          // 2026-10-20 确定性门控：有界重试耗尽仍有缺角色 ⇒ 把具体问题反馈 Crew 修正
          // （不派 Convener、不把 appointment 步骤标 done、不弹客户卡）。
          for (const [flowId, { entry: appointment }] of latestAppointment) {
            const retryTargets = (appointment.targetRoleIds ?? []).filter(
              (id): id is string => typeof id === "string" && id.trim() !== "",
            );
            if (retryTargets.length === 0) continue;
            const issues = await validateAppointmentArtifacts(projectRoot, retryTargets, listing, {
              flowId,
              ...(typeof appointment.artifactPath === "string" ? { appointmentArtifactPath: appointment.artifactPath } : {}),
            });
            if (issues.length === 0) continue;
            diagnostic.record("advance.appointment.artifacts-invalid", { flowId, count: issues.length });
            await reportAppointmentArtifactIssues(projectRoot, flowId, issues, listing);
          }
        }
      } else {
        postWriteAdvanceRetries.delete(projectRoot);
      }
    } catch (error) {
      diagnostic.error("advance.post-write.failed", error);
    } finally {
      postWriteAdvanceRunning.delete(projectRoot);
      // 运行中到达的事件/重试：**不吞信号**；按 pending 的最早延迟补跑一次。
      const pending = postWriteAdvancePending.get(projectRoot);
      if (pending !== undefined) {
        postWriteAdvancePending.delete(projectRoot);
        schedulePostWriteAdvanceCheck(projectRoot, undefined, pending.delayMs, pending.mode);
      }
    }
  };

  async function persistenceCall<K extends keyof PersistenceValues>(operation: K, input: unknown): Promise<PersistenceReply<PersistenceValues[K]>> {
    const invalid = (code: 'INVALID_REQUEST' | 'PROJECT_NOT_ACTIVE'): PersistenceReply<PersistenceValues[K]> => ({ ok: false, version: 1, code, message: code === 'INVALID_REQUEST' ? '保存请求无效。' : '该项目不是当前导入项目。' });
    if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('INVALID_REQUEST');
    const r = input as Record<string, unknown>;
    const idKey = operation === 'retryReportSave' || operation === 'getReportSaveState' ? 'reportId' : operation === 'getSessionPersistence' ? undefined : 'attemptId';
    if (r.version !== 1 || typeof r.projectRoot !== 'string' || typeof r.roleId !== 'string' || !r.roleId || !isRuntimeKind(r.runtime) || Object.keys(r).some(k => !['version','projectRoot','roleId','runtime',...(idKey ? [idKey] : [])].includes(k)) || idKey && (typeof r[idKey] !== 'string' || !r[idKey])) return invalid('INVALID_REQUEST');
    if (r.projectRoot !== importedProjectRoot || !listingCache.get(r.projectRoot)?.roles.some(role => role.roleId === r.roleId)) return invalid('PROJECT_NOT_ACTIVE');
    const scope: PersistenceScope = { projectRoot: r.projectRoot, roleId: r.roleId, runtime: r.runtime };
    const result = await manager.persistenceOperation(scope, operation, idKey ? r[idKey] as string : undefined);
    if (importedProjectRoot !== scope.projectRoot) return invalid('PROJECT_NOT_ACTIVE');
    return result;
  }

  return {
    retryReportSave: input => persistenceCall('retryReportSave', input),
    getReportSaveState: input => persistenceCall('getReportSaveState', input),
    retryDeliveryHistorySave: input => persistenceCall('retryDeliveryHistorySave', input),
    getDeliveryReceipt: input => persistenceCall('getDeliveryReceipt', input),
    getSessionPersistence: input => persistenceCall('getSessionPersistence', input),
    async pickProject(): Promise<string | null> {
      const root = await deps.pickDirectory();
      if (root !== null) await documentReader.grantNativeSelection(root);
      else documentReader.cancelNativeSelection();
      return root;
    },
    readProjectDocument(input) { return documentReader.read(input); },
    disposeProjectDocuments() { documentReader.dispose(); },

    async listProject(input): Promise<ListProjectResult> {
      const projectRoot = input.projectRoot;
      if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
        throw new Error("缺少项目根路径。");
      }
      // 门禁引擎：唯一枚举来源，界面侧不重写解析。
      const generation = ++importSequence;
      const documentSequence = documentReader.beginListing(projectRoot);
      const listing = await listProjectFn(projectRoot);
      listingCache.set(listing.projectRoot, listing);
      // 2026-10-20 客户要求（重启后任务自动续跑）：启动/项目导入恢复持久投递队列并自动重投；
      // listProject 刷新后做一次**僵尸步骤自检**（有界、fire-and-forget、去重；不阻塞导入）。
      void restoreDeliveryQueuesOnce();
      scheduleZombieStepCheck(listing.projectRoot);

      // ——— I1 治理记录状态（PM 评审 §四.1）———
      // **只读**：走**既有单一授权链** `buildEffectiveProjectConfig`（`.ans` 优先、无则运行期同意回退、
      // 不可用则 fail-closed），不另写第二份 `.ans` 读取逻辑；派生只用载入器事实与采纳的治理边界路径。
      // 本段不写文件、不建目录、不触发 finalize（显式建立动作属下一组 C1）。
      const effective = await buildEffectiveProjectConfig(listing, {
        buildProjectConfig: buildProjectConfigFn,
        loadEffectiveConfig: loadEffectiveConfigFn,
      });
      const governanceRecordBase = deriveGovernanceRecord({
        source: effective.source,
        governanceBoundaryPath: effective.project.governanceBoundary?.path,
      });
      // C1：仅在 `present` 上做逐文件 pin 证据（missing/invalid 不哈希、形状逐字不变）。
      // pin 检查**永不抛错**（`deriveGovernanceRecordWithPins` 内部兜底）；此处再兜一层，pin 证据
      // 检查的任何意外都不得让 `listProject` 崩——如实降级为 invalid。
      let governanceRecord: GovernanceRecordStatus;
      try {
        governanceRecord = await deriveGovernanceRecordWithPins({
          projectRoot: listing.projectRoot,
          record: governanceRecordBase,
          pins: effective.source.acceptance?.pin,
          governanceBoundaryPath: effective.project.governanceBoundary?.path,
          inspectPinnedBoundariesFn,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        governanceRecord = { state: "invalid", reason: `pin 证据检查失败：${message}` };
      }

      const roles: RoleView[] = [];
      for (const r of listing.roles) {
        let changelog: { path: string; text: string } | null = null;
        let docs: DocsIndexEntry[] = [];
        // 内置角色没有角色目录：cardPath 为空串，读索引会误把项目根当角色目录递归。
        if (!r.builtIn && r.cardPath !== "") {
          try {
            const idx = await readRoleDocsIndex(listing.projectRoot, r.cardPath);
            changelog = idx.changelog;
            docs = idx.docs;
          } catch {
            // 文档索引失败不致命：如实留空。
          }
        }
        let roleView: RoleView = {
          roleId: r.roleId,
          cardPath: r.cardPath,
          boundaryPath: r.boundaryPath,
          cardText: r.cardText,
          boundary: r.boundary,
          builtIn: r.builtIn === true,
          changelog,
          docs,
        };
        if (r.group !== undefined) roleView = { ...roleView, group: r.group };
        if (r.groupDuty !== undefined) roleView = { ...roleView, groupDuty: r.groupDuty };
        // 三权（评审 §5.1/§5.6）：`governanceFunction` 原样透传（仅 trio 内置角色携带；su/项目角色不出现）。
        if (r.governanceFunction !== undefined) roleView = { ...roleView, governanceFunction: r.governanceFunction };
        roles.push(roleView);
      }
      if (generation === importSequence) importedProjectRoot = listing.projectRoot;
      const documentListing = documentReader.updateListing(documentSequence, listing.projectRoot, roles.map(projectDocumentCandidates));
      for (const role of roles) role.documents = documentListing.documents[role.roleId] ?? [];
      // 2026-10-19 客户反馈：导入项目 / 应用启动后做一次**补齐检查**——流程已齐备但尚未派 Proof 时自动补派。
      // 走同一道门 + 账本持久化去重；事件驱动（40ms 合并窗口），不是轮询。
      if (generation === importSequence && (listing.governanceModel ?? "single") === "trio") {
        scheduleAcceptanceCheck(listing.projectRoot, "import");
      }
      return {
        ...(documentListing.documentScope ? { documentScope: documentListing.documentScope } : {}),
        ...(documentListing.documentReadUnavailable ? { documentReadUnavailable: documentListing.documentReadUnavailable } : {}),
        projectRoot: listing.projectRoot,
        roles,
        warnings: listing.warnings,
        // 原样转自门禁引擎（单一来源）：hasRoles 供「尚未 bootstrap」判断、primaryRoleId 供主位/默认选中、
        // governanceModel 供三权/旧模型提示（评审 §5.4/§5.6）。
        hasRoles: listing.hasRoles,
        primaryRoleId: listing.primaryRoleId,
        governanceModel: listing.governanceModel ?? "single",
        governanceRecord,
      };
    },

    // —————— I2/C1（existing-project-compat V1，2026-10-17 PM 评审 §二 I2 / §四.2 / §4.6）——————
    // 机制（预览/建立、一次性边界、finalize、按项目互斥）全部在编排侧；本层只做守卫 1–3 与成功后的收尾。
    async previewGovernanceRecord(input: { projectRoot: string; governanceModel?: GovernanceModel }): Promise<GovernancePreviewResult> {
      const record = input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {};
      const rawRoot = record.projectRoot;
      // 守卫 1：projectRoot 非空且等于桌面当前导入项目（渲染侧不能传任意路径）。
      if (typeof rawRoot !== "string" || rawRoot.trim() === "" || rawRoot !== importedProjectRoot) {
        return { ok: false, code: "invalid-request", message: "项目不是当前导入项目；本次未写入任何文件。" };
      }
      // 守卫 2（W4/S1）：治理模型若给出必须是封闭值域；缺省＝single（旧行为逐字不变）。
      const governanceModel = record.governanceModel;
      if (governanceModel !== undefined && !isGovernanceModelValue(governanceModel)) {
        return { ok: false, code: "invalid-request", message: "governanceModel 必须是 single 或 trio；本次未写入任何文件。" };
      }
      // 只把 projectRoot（与可选模型）透传：边界/授权来源/写路径由机制内部构造，调用方不得提供。
      return previewGovernanceRecordFn({
        projectRoot: rawRoot,
        ...(governanceModel !== undefined ? { governanceModel } : {}),
      });
    },

    async establishGovernanceRecord(input: { projectRoot: string; confirm: true; governanceModel?: GovernanceModel }): Promise<EstablishGovernanceResult> {
      const record = input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {};
      const rawRoot = record.projectRoot;
      // 守卫 1：当前导入项目。
      if (typeof rawRoot !== "string" || rawRoot.trim() === "" || rawRoot !== importedProjectRoot) {
        return governanceGuardResult("项目不是当前导入项目；本次未写入任何文件。");
      }
      // 守卫 2：操作者已看过预览并确认（意图标记，不是密码学证据）。
      if (record.confirm !== true) {
        return governanceGuardResult("缺少操作者确认（confirm:true）；本次未写入任何文件。");
      }
      // 守卫 3（W4/S1）：治理模型若给出必须是封闭值域；缺省＝single（旧行为逐字不变）。
      const governanceModel = record.governanceModel;
      if (governanceModel !== undefined && !isGovernanceModelValue(governanceModel)) {
        return governanceGuardResult("governanceModel 必须是 single 或 trio；本次未写入任何文件。");
      }
      // 守卫 4：按项目的在途互斥**由机制内部负责**（并发第二次得到 `busy`）——本层不另造第二份。
      const result = await establishGovernanceRecordFn({
        projectRoot: rawRoot,
        ...(governanceModel !== undefined ? { governanceModel } : {}),
      });

      // 成功（`phase === "write"` 且 finalize 完成）后：
      //  ① 调用**既有**陈旧边界刷新入口（O-1，`SessionManager.refreshStaleBoundaries`）：空闲的活会话
      //     按新边界作废重建（在跑的轮次跳过，等下一时机；不新造机制）。**先于清缓存**——重建路径要经
      //     `getListing` 取得角色表，缓存先删会让重建以「尚未枚举」失败。逐会话失败已在方法内隔离，
      //     这里再兜一层，绝不让刷新异常改写已成功的建立回执。
      //  ② 清该项目的列举缓存——界面不得继续读建立前的旧 listing；
      //  ③ 复用**既有**主→渲染信号 `emitProjectChanged`（main.ts 推 `project:changed`）：渲染侧据既有
      //     消费面重新 `listProject`，状态随 `.ans` 变为 present、动作隐藏。
      if (result.ok === true && result.phase === "write" && result.finalize.status === "completed") {
        try {
          await manager.refreshStaleBoundaries();
        } catch {
          // 刷新失败不影响建立结果（建立已落盘；下次发言/投递的既有检查点会再查陈旧）。
        }
        listingCache.delete(rawRoot);
        deps.emitProjectChanged?.();
      }
      return result;
    },

    // —————— C2（治理记录 pin 不符的重新接受恢复，2026-10-17 PM 评审 §5.3）——————
    // 机制（重新求值、只写两路径、写前 digest 比对、按项目互斥、原子写）全部在编排侧；
    // 本层只做守卫 1（当前导入项目）/ 2（confirm）/ 3（previewDigest 形状）与写入后的收尾。
    async previewGovernanceReacceptance(input: { projectRoot: string }): Promise<GovernanceReacceptPreviewResult> {
      const rawRoot = input !== null && typeof input === "object" ? input.projectRoot : undefined;
      // 守卫 1：projectRoot 非空且严格等于桌面当前导入项目（渲染侧不能传任意路径）。
      if (typeof rawRoot !== "string" || rawRoot.trim() === "" || rawRoot !== importedProjectRoot) {
        return { ok: false, status: "invalid-request", message: "项目不是当前导入项目；本次未写入任何文件。" };
      }
      // 只把 projectRoot 透传：边界/来源/pin 列表/写路径由机制内部构造，调用方不得提供。
      return previewGovernanceReacceptanceFn({ projectRoot: rawRoot });
    },

    async reacceptGovernancePins(input: {
      projectRoot: string;
      confirm: true;
      previewDigest: string;
    }): Promise<ReacceptGovernancePinsResult> {
      const record = input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {};
      const rawRoot = record.projectRoot;
      // 守卫 1：当前导入项目。
      if (typeof rawRoot !== "string" || rawRoot.trim() === "" || rawRoot !== importedProjectRoot) {
        return reacceptGuardResult("项目不是当前导入项目；本次未写入任何文件。");
      }
      // 守卫 2：操作者已看过预览并确认（意图标记，不是密码学证据）。
      if (record.confirm !== true) {
        return reacceptGuardResult("缺少操作者确认（confirm:true）；本次未写入任何文件。");
      }
      // 守卫 3：预览摘要必须是非空 64 位十六进制（机制写入前据此比对 G4；形状不对不进入机制）。
      const previewDigest = record.previewDigest;
      if (typeof previewDigest !== "string" || !PREVIEW_DIGEST_HEX_64.test(previewDigest)) {
        return reacceptGuardResult("缺少有效的预览摘要（previewDigest 必须为 64 位十六进制）；本次未写入任何文件。");
      }
      // 其余守卫（仅 pin-mismatch、缺失/不可读阻断、写前重新求值、互斥、原子写）由机制负责；
      // 本层不透传边界/来源/pin 列表/写路径。
      const result = await reacceptGovernancePinsFn({ projectRoot: rawRoot, confirm: true, previewDigest });

      // `completed` = 写入成功；`write-failed` = 已进入写入阶段，可能部分落盘——两者都让界面
      // 如实反映盘面（刷新陈旧边界 → 清列举缓存 → 通知渲染侧重新 listProject）。**不自动打开会话**。
      if (result.status === "completed" || result.status === "write-failed") {
        // 先刷新再清缓存：重建路径要经 `getListing` 取得角色表，缓存先删会让重建以「尚未枚举」失败。
        try {
          await manager.refreshStaleBoundaries();
        } catch {
          // 刷新失败不影响回执（写入结果已如实返回；下次发言/投递的既有检查点会再查陈旧）。
        }
        listingCache.delete(rawRoot);
        deps.emitProjectChanged?.();
      }
      return result;
    },

    // —————— V1b 迁移（评审 §5.5）：预览零写入 / 客户确认后写 `.ans` + manifest 留痕 ——————
    // 机制（模型读取、快照摘要、原子写、互斥、留痕）全部在编排侧；本层只做守卫与成功后的收尾，
    // 不接受调用方提供的路径/模型/写路径，也不重写任何判定。
    async previewGovernanceMigration(input: { projectRoot: string }): Promise<GovernanceMigrationPreviewResult> {
      const rawRoot = input !== null && typeof input === "object" ? input.projectRoot : undefined;
      // 守卫：projectRoot 非空且严格等于桌面当前导入项目（渲染侧不能传任意路径）。
      if (typeof rawRoot !== "string" || rawRoot.trim() === "" || rawRoot !== importedProjectRoot) {
        return { ok: false, code: "invalid-request", message: "项目不是当前导入项目；本次未写入任何文件。" };
      }
      // 只透传 projectRoot：模型/写路径/摘要均由机制内部构造。
      return previewGovernanceMigrationFn({ projectRoot: rawRoot });
    },

    async migrateGovernanceModel(input: {
      projectRoot: string;
      confirm: true;
      previewDigest: string;
    }): Promise<GovernanceMigrationResult> {
      const record = input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {};
      const rawRoot = record.projectRoot;
      const model: GovernanceModel = (typeof rawRoot === "string" ? listingCache.get(rawRoot)?.governanceModel : undefined) ?? "single";
      // 守卫 1：当前导入项目。
      if (typeof rawRoot !== "string" || rawRoot.trim() === "" || rawRoot !== importedProjectRoot) {
        return { ok: false, phase: "guard", status: "invalid-request", model, message: "项目不是当前导入项目；本次未写入任何文件。" };
      }
      // 守卫 2：操作者已看过预览并确认（意图标记，不是密码学证据）。
      if (record.confirm !== true) {
        return { ok: false, phase: "guard", status: "invalid-request", model, message: "缺少操作者确认（confirm:true）；本次未写入任何文件。" };
      }
      // 守卫 3：预览摘要必须是非空 64 位十六进制（机制写入前据此比对快照；形状不对不进入机制）。
      const previewDigest = record.previewDigest;
      if (typeof previewDigest !== "string" || !PREVIEW_DIGEST_HEX_64.test(previewDigest)) {
        return { ok: false, phase: "guard", status: "invalid-request", model, message: "缺少有效的预览摘要（previewDigest 必须为 64 位十六进制）；本次未写入任何文件。" };
      }
      // 其余守卫（仅 single→trio、记录可用、写前重新求值、互斥、原子写与 manifest 留痕）由机制负责；
      // 本层不透传路径/模型/写路径。
      const result = await migrateGovernanceModelFn({ projectRoot: rawRoot, confirm: true, previewDigest });

      // `completed` = 写入成功；`write-failed` = 已进入写入阶段，可能部分落盘——两者都让界面如实反映盘面。
      // 顺序沿用既有教训：**先** refreshStaleBoundaries（重建路径要经 `getListing` 取角色表）→ 清缓存 →
      // project:changed。失败（busy/preview-stale/blocked/...）**不清缓存**、不改动任何状态。不自动开会话。
      if (result.status === "completed" || result.status === "write-failed") {
        try {
          await manager.refreshStaleBoundaries();
        } catch {
          // 刷新失败不影响迁移回执（写入结果已如实返回；下次发言/投递的既有检查点会再查陈旧）。
        }
        listingCache.delete(rawRoot);
        deps.emitProjectChanged?.();
      }
      return result;
    },

    getShellJudgeState(): ShellJudgeStateReply & { ok: true; enabled: boolean } {
      // `available`：本版本恒接真实判断驱动；渲染侧只在明确 false 时禁用（§3.3）。
      return { ...shellJudgeSwitch.get(), available: true };
    },
    setShellJudgeEnabled(input: unknown): ShellJudgeStateReply {
      // 校验在状态机内完成；失败**不改状态**（§6.6）。主进程 handler 负责 `event.sender` 校验与推送。
      return { ...shellJudgeSwitch.set(input), available: true };
    },
    resetShellJudgeState(): void {
      shellJudgeSwitch.reset();
    },

    // 「替我决策」（2026-10-18 双开关评审 §3.3）：同形第二套；与 approval **互不影响**。
    getDecisionJudgeState(): ShellJudgeStateReply & { ok: true; enabled: boolean } {
      return { ...decisionJudgeSwitch.get(), available: true };
    },
    setDecisionJudgeEnabled(input: unknown): ShellJudgeStateReply {
      return { ...decisionJudgeSwitch.set(input), available: true };
    },
    resetDecisionJudgeState(): void {
      decisionJudgeSwitch.reset();
    },

    /**
     * 代批结果行落主入口进度行（§8.3，best-effort）：只经既有事件流落系统 `message` 行
     * （`detail.source:"judge-decision"`），**不造第二张可作答卡**；失败只记诊断，不影响已完成的决定。
     */
    emitJudgeProgress(payload: OperatorJudgeResultPayload): void {
      const projectRoot =
        typeof payload.projectRoot === "string" && payload.projectRoot !== "" ? payload.projectRoot : importedProjectRoot;
      if (projectRoot === undefined || projectRoot === "") return;
      const primaryRoleId = listingCache.get(projectRoot)?.primaryRoleId;
      if (typeof primaryRoleId !== "string" || primaryRoleId === "") return;
      if (primaryRoleId === payload.roleId) return; // 来源即主入口：结果行已在该角色流中，不重复
      try {
        emitSessionEvent({
          roleId: primaryRoleId,
          projectRoot,
          runtime: payload.runtime ?? payload.engine,
          event: { kind: "message", summary: judgeResultSummary(payload), detail: { source: "judge-decision" } },
        });
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.interface", projectRoot }).error("governance-judge.progress.failed", error, {
          requestId: payload.requestId,
          group: payload.group,
          cardKind: payload.cardKind,
        });
      }
    },

    async openSession(input): Promise<OpenResult> {
      if (!input || typeof input.projectRoot !== "string" || typeof input.roleId !== "string" || !isRuntimeKind(input.runtime)) return { ok: false, error: "会话请求须指定项目、角色与运行时。" };
      const result = await manager.open(input);
      // 客户在界面上选定的引擎也是「应用内已选」的事实：成功开会话后记住（per-project；demo 不参与自动派发）。
      if (result.ok) {
        void persistProjectRuntime(deps.runtimeStatePath, input.projectRoot, input.runtime).catch(() => undefined);
      }
      return result;
    },

    async sendSession(input: { text: string; images?: unknown; target?: SessionTarget; metadata?: SessionMessageMetadata }): Promise<SendResult> {
      const text = input && typeof input.text === "string" ? input.text : "";
      // —— P0-1：**主进程重校验**（渲染侧报的图一律不可信；以真实字节为准——K-2 同一口径）——
      // 逐张：严格 base64 解码 → 魔数嗅探定类型（声明 mime 不作数）→ ≤5MB；**全过才放行**，
      // 任一张不合格 ⇒ 整条拒发（fail-closed：绝不「丢图发文字」让客户以为图已送达）。
      const rawImages = input && Array.isArray(input.images) ? input.images : [];
      if (rawImages.length === 0) {
        return manager.send(text, undefined, input?.target, input?.metadata);
      }
      const cleaned: PromptImage[] = [];
      for (const it of rawImages) {
        const o = it && typeof it === "object" ? (it as Record<string, unknown>) : {};
        const decoded = decodeImageBase64(o.data);
        if (!decoded.ok) {
          return { ok: false, error: `图片未发送（${decoded.error}）——本条消息未发出，请移除该图后重试。` };
        }
        const sniffed = sniffImageMime(decoded.buffer);
        if (sniffed === null) {
          return {
            ok: false,
            error: `图片未发送（内容不是受支持的图片——真实格式不在 ${ALLOWED_IMAGE_MIMES.join(" / ")} 之内，扩展名/声明类型不作数）。本条消息未发出，请移除该图后重试。`,
          };
        }
        const v = validateImage(sniffed, decoded.buffer.length);
        if (!v.ok) {
          return { ok: false, error: `图片未发送（${v.error}）——本条消息未发出，请移除该图后重试。` };
        }
        cleaned.push({ type: "image", data: typeof o.data === "string" ? o.data : "", mimeType: sniffed });
      }
      // 组**契约形状** `PromptOptions`（单一来源 `src/model/runtime.ts`）——之后整包同一引用透传。
      const opts: PromptOptions = { images: cleaned };
      return manager.send(text, opts, input?.target, input?.metadata);
    },

    // 应用代客户推进治理流程（2026-10-18 客户修正）：后台打开目标治理角色 + 投递唯一一条任务。
    // 纪律：不抢活动角色/当前 pane；成功/失败经既有 delivery-note 系统行如实落发起卡片的聊天流；
    // 不自动批准、不写 `.ans`/账本（只记诊断）；失败不重试循环，也绝不影响当前会话。
    async advanceGovernanceFlow(input): Promise<GovernanceAdvanceResult> {
      const payload = input?.payload;
      // 写卡确认（客户手批或判断代批）answered 后：先登记一次有界的「写卡后推进检查」——
      // 即使本卡片推导出的 nextFunction=null（appointment-write 在推导表中就是无下一步），
      // 也要在角色卡真正写出后刷新枚举并兜底派 Convener。检查去重、不循环。
      if (payload?.cardKind === "appointment-write") {
        const earlyContext = input?.context ?? {};
        const earlyRoot =
          typeof earlyContext.projectRoot === "string" && earlyContext.projectRoot !== ""
            ? earlyContext.projectRoot
            : importedProjectRoot;
        if (earlyRoot !== undefined) {
          schedulePostWriteAdvanceCheck(
            earlyRoot,
            isRuntimeKind(earlyContext.runtime) ? earlyContext.runtime : undefined,
          );
        }
      }
      if (!payload || payload.nextFunction === null || payload.roleId === null) {
        return { ok: true, dispatched: false }; // 明确无下一步（验收收口/写盘/修订/拒绝）：不发任务。
      }
      const context = input.context ?? {};
      const targetRoleId = payload.roleId; // 已排除 null（上面的早退）——闭包内保持非空类型。
      const projectRoot =
        typeof context.projectRoot === "string" && context.projectRoot !== ""
          ? context.projectRoot
          : importedProjectRoot;
      const sourceRoleId =
        typeof context.sourceRoleId === "string" && context.sourceRoleId !== ""
          ? context.sourceRoleId
          : payload.roleId;
      let runtime: RuntimeKind | undefined = isRuntimeKind(context.runtime) ? context.runtime : undefined;
      if (runtime === undefined && projectRoot !== undefined) {
        // 旧调用可能不带 runtime：以发起卡片的**真实活会话**为准（只读视图，不猜默认引擎）。
        runtime = manager.liveSessionViews().find((view) => view.projectRoot === projectRoot && view.roleId === sourceRoleId)?.runtime;
      }
      const diagnostic = createDiagnosticLogger({ component: "desktop.governance-advance", projectRoot, roleId: payload.roleId });
      const targetLabel = targetRoleId === "nominator" ? "Crew / 组队" : "Steward / 统筹";
      const note = (summary: string): void => {
        if (projectRoot === undefined || runtime === undefined || sourceRoleId === "") return;
        try {
          emitSessionEvent({ roleId: sourceRoleId, projectRoot, runtime, event: { kind: "message", summary, detail: { source: "delivery-note" } } });
        } catch (error) {
          diagnostic.error("advance.note.failed", error);
        }
      };
      const fail = (error: string): GovernanceAdvanceResult => {
        diagnostic.error("advance.failed", new Error(error), { flowId: payload.flowId, cardKind: payload.cardKind, targetRoleId });
        note(`自动推进失败：${error}`);
        return { ok: false, dispatched: false, targetRoleId, error };
      };
      /** 两段式第一段已投递、但第二段无法继续（流程状态 YAML 缺失/非法/角色未写出等）：如实报错、**不重试**。 */
      const chainFail = (error: string, dispatchedTarget: "nominator" | "convener" = targetRoleId): GovernanceAdvanceResult => {
        diagnostic.error("advance.chain.failed", new Error(error), { flowId: payload.flowId, cardKind: payload.cardKind, targetRoleId: dispatchedTarget });
        note(`自动推进停住：${error}`);
        return { ok: false, dispatched: true, targetRoleId: dispatchedTarget, error };
      };
      if (projectRoot === undefined) return fail("缺少项目根，无法后台派发");
      if (runtime === undefined) return fail("缺少运行时，无法后台派发");
      /** 后台开目标会话并投递一条任务；成功/失败都如实（不重试）。 */
      const dispatchTo = async (
        target: "nominator" | "convener",
        text: string,
      ): Promise<{ ok: true; queued?: boolean } | { ok: false; error: string }> => {
        const label = target === "nominator" ? "Crew / 组队" : "Steward / 统筹";
        const opened = await manager.openBackground({ projectRoot, roleId: target, runtime });
        if (!opened.ok) return { ok: false, error: `无法开启 ${label} 会话：${opened.error ?? "未知原因"}` };
        const sent = await manager.sendBackground({ projectRoot, roleId: target, runtime, text });
        if (!sent.ok) return { ok: false, error: `发送任务给 ${label} 失败：${sent.error ?? "未知原因"}` };
        return { ok: true, ...(sent.queued === true ? { queued: true } : {}) };
      };
      /** 投递成功后的应用动作审计（trio；失败只诊断、不翻转）——复用唯一写入口 `appendApplicationDispatch`。 */
      const appendDispatchAccepted = async (
        ledgerTarget: "nominator" | "convener",
        text: string,
        ledgerStepId?: string,
        dedupeKey?: string,
      ): Promise<void> => {
        await appendApplicationDispatch({
          projectRoot,
          ...(payload.flowId !== undefined ? { flowId: payload.flowId } : {}),
          targetRoleId: ledgerTarget,
          text,
          ...(ledgerStepId !== undefined ? { stepId: ledgerStepId } : {}),
          ...(dedupeKey !== undefined ? { dedupeKey } : {}),
          runtime,
          trigger: "customer-decision",
        });
      };
      // —— 2026-10-20 真机假错误修复：链式推进的完成判据＝**目标事实**（有界轮询），不是角色瞬时忙闲 ——
      // 真机证据：`advance.dispatched` 后 5ms 就 `advance.chain.convener-idle` + `chain.failed`
      // （`waitForRoleIdle` 在会话刚被释放/尚未标记 busy 时立即 false），而 Convener 随后正常写出 YAML。
      // 新判据：每 `chainPollIntervalMs` 读一次 `docs/flows/<flowId>.yaml`（存在且 `parseFlowStateYaml`
      // 通过＝放行；首步 nomination 已 done 时记诊断），或每轮强制刷新 listing 直到任命目标角色全部出现。
      // 角色忙/队列变化**不打断**轮询；会话被释放/被看护中止时**不**断言 settled（继续等下一次投递/重试）；
      // 只有「会话仍活着、已 settled 且无后续投递」再给一次短宽限仍不落定，或到 15min 时限，才如实失败（一次）。
      const chainPollIntervalMs = Math.max(1, deps.governanceChainOptions?.pollIntervalMs ?? GOVERNANCE_CHAIN_POLL_INTERVAL_MS);
      const chainTimeoutMs = Math.max(1, deps.governanceChainOptions?.timeoutMs ?? GOVERNANCE_CHAIN_TIMEOUT_MS);
      const chainSettledGraceMs = Math.max(0, deps.governanceChainOptions?.settledGraceMs ?? GOVERNANCE_CHAIN_SETTLED_GRACE_MS);
      // 轮询定时器 unref：主进程常驻不受影响；测试子进程在用例结束/失败后不会被 15min 定时器拖住不退。
      const chainSleep = (ms: number): Promise<void> => new Promise((resolve) => {
        const timer = setTimeout(resolve, Math.max(1, ms));
        (timer as { unref?: () => void }).unref?.();
      });
      // —————— 2026-10-22 第 1/3 项：账本决定读取（派发回路的事实来源） ——————
      // 事件（customer-input 结算 → onNextStep）与编排的账本 append 有微任务竞态：这里做**有界短轮询**
      // （≤300ms），仍未读到就回落卡片上下文（客户实际选择），绝不猜名单、不伪造决定。
      /** 账本最新 appointment 决定（含索引与整份账本；坏行/无记录 ⇒ undefined）。 */
      const readLatestAppointmentLedger = async (
        flowId: string,
      ): Promise<{ entry: GovernanceLedgerEntry; index: number; ledger: { entries: readonly GovernanceLedgerEntry[] } } | undefined> => {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const ledger = await readGovernanceLedger(projectRoot);
          if (ledger.errors.length === 0) {
            let found: { entry: GovernanceLedgerEntry; index: number; ledger: { entries: readonly GovernanceLedgerEntry[] } } | undefined;
            ledger.entries.forEach((entry, index) => {
              if (entry.kind === "customer.decision" && entry.decisionKind === "appointment" && entry.flowId === flowId) {
                found = { entry, index, ledger };
              }
            });
            if (found !== undefined) return found;
          }
          if (attempt < 3) await chainSleep(75);
        }
        return undefined;
      };
      /** 最新提案决定类型（accept / accept-quick）；账本不可读/无记录 ⇒ undefined（文案走旧快捷分支）。 */
      const readLatestProposalDecisionKind = async (flowId: string): Promise<"accept" | "accept-quick" | undefined> => {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const ledger = await readGovernanceLedger(projectRoot);
          if (ledger.errors.length === 0) {
            let kind: "accept" | "accept-quick" | undefined;
            for (const entry of ledger.entries) {
              if (entry.kind !== "customer.decision" || entry.flowId !== flowId) continue;
              if (entry.decisionKind === "proposal-accept") kind = "accept";
              else if (entry.decisionKind === "proposal-accept-quick") kind = "accept-quick";
            }
            return kind;
          }
          if (attempt < 3) await chainSleep(75);
        }
        return undefined;
      };
      /** 名单集合相等（顺序无关；用于「客户手选 ≠ 推荐集」提示）。 */
      const sameRoleSet = (a: readonly string[], b: readonly string[]): boolean => {
        const left = new Set(a);
        const right = new Set(b);
        if (left.size !== right.size) return false;
        for (const id of left) if (!right.has(id)) return false;
        return true;
      };
      /**
       * 流程状态 YAML 的一次探测（只读；不写、不猜）：
       * `valid`（解析通过；顺带给出首步 nomination 是否 done）/ `missing` / `invalid`（带具体 path+message）/
       * `unreadable`（ENOENT 以外的读错——可能瞬时，轮询期间不立即判死）。
       */
      const probeFlowStateYaml = async (flowId: string): Promise<FlowStateProbe> => {
        const flowStatePath = governanceFlowStatePath(flowId);
        let flowStateText: string;
        try {
          flowStateText = await readFile(`${projectRoot}/${flowStatePath}`, "utf8");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing" };
          return { state: "unreadable", message: error instanceof Error ? error.message : String(error) };
        }
        const parsedFlowState = parseFlowStateYaml(flowStateText, flowId);
        if (!parsedFlowState.ok) {
          const detail = parsedFlowState.errors.slice(0, 10).map((item) => `${item.path}: ${item.message}`).join("；");
          return { state: "invalid", error: detail };
        }
        // 首步提名（`nomination*`；无同名步骤时退回第一步）：done 是「可继续」的强信号，但**不**作为放行前提——
        // 合法 YAML + 可解析步骤表即可继续（与旧行为一致，避免把状态字面值当成第二道门）。
        const nominationStep =
          parsedFlowState.flow.steps.find((step) => /^nomination(?:$|[-_.])/i.test(step.id)) ?? parsedFlowState.flow.steps[0];
        return { state: "valid", nominationDone: nominationStep?.status === "done" };
      };
      /**
       * **角色已 settled 的肯定证据**（早失败护栏，2026-10-20）：
       * 会话仍活着 + 不在跑 + 无排队/进行中的投递 + 上一轮不是被请求中止（客户停止/看护自动中止）。
       * 会话缺失（真机 5ms 误报：会话被 LRU/并发重建释放）**不算** settled——继续等目标事实，绝不提前判死；
       * 被中止的回合也不算正常结束——继续等下一次投递/重试（有界）。
       */
      const settledEvidence = (roleId: string): boolean =>
        manager.hasLiveSession(projectRoot, roleId, runtime) &&
        !manager.isRoleBusy(projectRoot, roleId, runtime) &&
        !manager.hasPendingDelivery(projectRoot, roleId, runtime) &&
        !manager.wasLastTurnAborted(projectRoot, roleId, runtime);
      /** 有界轮询流程状态 YAML 落盘；角色 settled 后给一次短宽限（再探），仍不落定才允许提前如实失败。 */
      const waitForFlowStateYamlFact = async (
        flowId: string,
      ): Promise<{ last: FlowStateProbe; outcome: "valid" | "settled" | "timeout"; waitedMs: number }> => {
        const startedAt = Date.now();
        const deadline = startedAt + chainTimeoutMs;
        let last: FlowStateProbe = { state: "missing" };
        let settledSince: number | undefined;
        for (;;) {
          last = await probeFlowStateYaml(flowId);
          if (last.state === "valid") return { last, outcome: "valid", waitedMs: Date.now() - startedAt };
          if (settledEvidence(targetRoleId)) {
            settledSince ??= Date.now();
            if (Date.now() - settledSince >= chainSettledGraceMs) {
              return { last, outcome: "settled", waitedMs: Date.now() - startedAt };
            }
          } else {
            settledSince = undefined;
          }
          const remaining = deadline - Date.now();
          if (remaining <= 0) return { last, outcome: "timeout", waitedMs: Date.now() - startedAt };
          await chainSleep(Math.min(chainPollIntervalMs, remaining));
        }
      };
      // W6-B 真机阻塞修复（任命后的派发时序）：客户决定卡是在来源角色本轮**中途**作答的——Nominator
      // 可能还在写角色卡。先等来源本轮 settle（`waitForRoleSettle`：只等一次、有上限；无会话/不忙立即
      // 返回；超时或会话释放只记诊断后继续），再强制刷新 listing，然后才派发。**绝不循环重试**。
      if (sourceRoleId !== "" && manager.isRoleBusy(projectRoot, sourceRoleId, runtime)) {
        const settled = await manager.waitForRoleSettle(projectRoot, sourceRoleId, runtime);
        diagnostic.record("advance.source-settle", { sourceRoleId, settled });
      }
      const listingFresh = await manager.refreshListingNow(projectRoot);
      if (!listingFresh) diagnostic.record("advance.listing-refresh.failed", { projectRoot });
      // ———— 2026-10-22 第 1 项：appointment 决定 ⇒ 应用派 Crew 写卡（主路径，**不是** Convener） ————
      // 回路：客户 appointment 决定 → 账本 customer.decision(appointment) → 本方法派 Crew（写卡任务，
      // stepId=role-cards）→ Crew settle/应用检查 → 结构校验通过 → 派 Convener 做 role-readiness。
      // 去重（双重）：运行期 Set `<root>\0<flowId>\0appointment-crew`（投递前占位、成功保留、失败释放）
      // ＋账本 `dispatch.accepted{targetRoleId:"nominator"}`（appointment 之后，跨重启）；重复事件/重启不重派。
      if (payload.cardKind === "appointment") {
        const flowId = payload.flowId;
        if (flowId === undefined) return fail("缺少流程信息（flowId），未派发写卡任务");
        const latest = await readLatestAppointmentLedger(flowId);
        if (
          latest !== undefined &&
          typeof latest.entry.customerDecision === "string" &&
          !RESOLVED_APPOINTMENT_DECISIONS.has(latest.entry.customerDecision)
        ) {
          // 拒绝/取消（账本 unclassified/none 等）：不派 Crew、不猜客户意图。
          return fail(`账本最新任命决定为 ${latest.entry.customerDecision}（未获客户同意），未派发写卡任务`);
        }
        const ledgerTargets = (latest?.entry.targetRoleIds ?? []).filter(
          (id): id is string => typeof id === "string" && id.trim() !== "",
        );
        const contextTargets = (Array.isArray(context.targetRoleIds) ? context.targetRoleIds : []).filter(
          (id): id is string => typeof id === "string" && id.trim() !== "",
        );
        // 名单：账本决定优先（客户实际选择的持久记录）；竞态未读到账本时回落卡片上下文。
        const targets = [...new Set(ledgerTargets.length > 0 ? ledgerTargets : contextTargets)];
        if (targets.length === 0) return fail("缺少任命名单，未派发写卡任务");
        // 团队计划：账本 artifactPath 优先 → 卡片显式 context → 按 flowId 扫描最新 -team-vN.md；
        // 仅 legacy（无团队计划但有提名文件）才回落提名——绝不猜目录。
        const preferredPlan = latest?.entry.artifactPath ?? context.teamPlanPath;
        const plan = await readTeamPlanInfo(projectRoot, flowId, preferredPlan);
        const legacyNomination =
          plan === undefined ? await findLatestVersionedArtifact(projectRoot, "docs/nominations", flowId) : undefined;
        if (plan === undefined && legacyNomination === undefined) {
          const boundHint =
            typeof preferredPlan === "string" && preferredPlan !== ""
              ? `（账本 appointment 绑定 ${preferredPlan}）`
              : "";
          emitLeadDeliveryNote(
            projectRoot,
            runtime,
            `流程 ${flowId}：团队计划缺失（docs/scheduling/${flowId}-team-vN.md）${boundHint}；未派 Crew 写卡、未继续推进。请 Steward / 统筹 先写团队计划。`,
          );
          return fail(`团队计划缺失${boundHint}；未派 Crew 写卡（不猜计划、不自行扩大职责）`);
        }
        const crewKey = `${canonicalProjectRoot(projectRoot)}\u0000${flowId}\u0000appointment-crew`;
        if (postWriteAdvanceDispatched.has(crewKey)) {
          diagnostic.record("advance.appointment.crew-dedup", { flowId });
          return { ok: true, dispatched: false };
        }
        if (latest !== undefined) {
          // 账本去重（跨重启）：appointment 决定之后已有 app→nominator 的派发（stepId=role-cards；旧版无 stepId）
          // ⇒ 不重派；写运行期占位，同进程后续事件同样跳过。
          const alreadyDispatched = latest.ledger.entries
            .slice(latest.index + 1)
            .some(
              (entry) =>
                entry.kind === "dispatch.accepted" &&
                entry.flowId === flowId &&
                entry.targetRoleId === "nominator" &&
                entry.power !== "liaison",
            );
          if (alreadyDispatched) {
            postWriteAdvanceDispatched.add(crewKey);
            diagnostic.record("advance.appointment.crew-ledger-dedup", { flowId });
            return { ok: true, dispatched: false };
          }
        }
        postWriteAdvanceDispatched.add(crewKey); // 先占位（失败释放）
        const crewPayload: GovernanceNextStepPayload = {
          version: 1,
          flowId,
          cardKind: "appointment",
          nextFunction: "role-card-write",
          roleId: "nominator",
        };
        const crewMessage = buildGovernanceAdvanceMessage(crewPayload, targets, {
          ...(plan !== undefined
            ? {
                teamPlanPath: plan.relPath,
                teamPlanVersion: plan.version,
                teamPlanSchema: plan.teamPlanSchema,
                teamPlanModules: plan.modules,
              }
            : {}),
          ...(legacyNomination !== undefined ? { nominationPath: legacyNomination.relPath } : {}),
        });
        if (crewMessage === null) {
          postWriteAdvanceDispatched.delete(crewKey);
          return fail("缺少团队计划/任命名单，未派发写卡任务");
        }
        const crewDispatch = await dispatchTo("nominator", crewMessage);
        if (!crewDispatch.ok) {
          postWriteAdvanceDispatched.delete(crewKey);
          return fail(crewDispatch.error);
        }
        note(governanceAdvanceSuccessNote(crewPayload));
        await appendDispatchAccepted("nominator", crewMessage, "role-cards", crewKey);
        diagnostic.record("advance.appointment.crew-dispatched", {
          flowId,
          count: targets.length,
          queued: crewDispatch.queued === true,
          mode: plan !== undefined ? "team-plan" : "legacy-nomination",
        });
        // 客户手选与推荐集不同：按实际名单派 Crew；提示 Convener 修订计划 v2（避免计划与名单长期不一致）。
        if (plan?.recommended !== undefined && !sameRoleSet(plan.recommended, targets)) {
          note(
            `客户实际任命名单（${targets.join("、")}）与团队计划推荐集（${plan.recommended.join("、")}）不同；` +
              `请 Steward / 统筹 修订团队计划为 v2 以反映实际任命（Crew 只按实际名单写卡）。`,
          );
          diagnostic.record("advance.appointment.selection-mismatch", { flowId });
        }
        // 写卡后推进检查：Crew settle 也会触发；这里先排一次（会话被释放/重启也不漏派）。
        schedulePostWriteAdvanceCheck(projectRoot, runtime);
        return {
          ok: true,
          dispatched: true,
          targetRoleId: "nominator",
          ...(crewDispatch.queued === true ? { queued: true } : {}),
        };
      }
      // —— proposal / legacy 提名链路（followUp 两段式保留迁移兼容）——
      const proposalDecision =
        payload.cardKind === "proposal" && payload.flowId !== undefined
          ? await readLatestProposalDecisionKind(payload.flowId)
          : undefined;
      const proposalPlan =
        payload.cardKind === "proposal" && payload.flowId !== undefined
          ? await findLatestVersionedArtifact(projectRoot, "docs/scheduling", payload.flowId, "team")
          : undefined;
      const message = buildGovernanceAdvanceMessage(payload, context.targetRoleIds, {
        // 2026-10-20 真机：流程状态 YAML 已存在 ⇒ Convener 任务改用 flow 工具推进（不直接写 YAML）。
        flowStateExists:
          typeof payload.flowId === "string" &&
          payload.flowId !== "" &&
          existsSync(path.join(projectRoot, governanceFlowStatePath(payload.flowId))),
        ...(proposalDecision !== undefined ? { proposalDecision } : {}),
        ...(proposalPlan !== undefined ? { teamPlanPath: proposalPlan.relPath } : {}),
      });
      if (message === null) return fail("缺少流程信息（flowId/任命名单），未自动派发");
      const opened = await manager.openBackground({ projectRoot, roleId: targetRoleId, runtime });
      if (!opened.ok) {
        return fail(`无法开启 ${targetLabel} 会话：${opened.error ?? "未知原因"}`);
      }
      const sent = await manager.sendBackground({ projectRoot, roleId: targetRoleId, runtime, text: message });
      if (!sent.ok) {
        return fail(`发送任务给 ${targetLabel} 失败：${sent.error ?? "未知原因"}`);
      }
      note(governanceAdvanceSuccessNote(payload));
      // 审计步骤 id（AC19）：只认卡片/上下文**显式给出**的 stepId；拿不到就如实记诊断，不伪造。
      const stepId = typeof context.stepId === "string" && context.stepId !== "" ? context.stepId : undefined;
      if (stepId === undefined) {
        diagnostic.record("advance.ledger.step-missing", { flowId: payload.flowId, targetRoleId });
      }
      diagnostic.record("advance.dispatched", {
        flowId: payload.flowId,
        cardKind: payload.cardKind,
        targetRoleId,
        stepId: stepId ?? null,
        queued: sent.queued === true,
      });
      // W6-B（四角色评审 §7.2 / AC19）：**投递成功后**写账本 `dispatch.accepted{actorRoleId:"app",
      // power:"app", trigger:"customer-decision"}`——应用推进 ≠ 客户批准，**不写 customerDecision/
      // decisionEvidence**。仅 trio（single 旧项目不产生 `.ans/governance` 记录）；账本失败只记诊断，
      // 不翻转已完成的投递结果、不重试。`stepId` 不在 `governance:next-step` 契约里（payload 未携带），
      // 故不臆造。根不存在（测试/异常调用）时不创建目录：按账本失败处理（记诊断、结果不变）。
      await appendDispatchAccepted(targetRoleId, message, stepId);
      // —— 2026-10-18 真机修正；2026-10-19 客户决定「这些全部改成yaml。」 ——
      // 两段式闭环：客户接受提案后先派 Convener 写 `docs/flows/<flowId>.yaml`（唯一机器状态）。
      // **有界轮询 YAML 事实**（2026-10-20 真机假错误修复）：存在且通过 `parseFlowStateYaml` 校验 ⇒ 再派
      // Nominator；角色忙/队列变化不打断轮询，会话释放/被看护中止不算 settled（继续等下一次投递/重试）；
      // 只有角色**确实 settled**（会话活着、不忙、无后续投递、未被中止）再给一次短宽限仍不落定，或到 15min
      // 时限，才如实报**具体原因**（系统行只发一次），**不循环重试**。
      // 同名 `.md` 人读视图**不是**放行条件（只认 YAML；只有 .md 视为未落盘）。
      if (payload.followUp === "nomination-after-flow") {
        const flowId = payload.flowId;
        if (flowId === undefined) return chainFail("缺少流程信息（flowId），未派发提名任务");
        const flowStatePath = governanceFlowStatePath(flowId);
        const flowWait = await waitForFlowStateYamlFact(flowId);
        diagnostic.record("advance.chain.flow-state-wait", {
          flowId,
          state: flowWait.last.state,
          outcome: flowWait.outcome,
          waitedMs: flowWait.waitedMs,
          ...(flowWait.last.state === "valid" ? { nominationDone: flowWait.last.nominationDone } : {}),
          roleBusy: manager.isRoleBusy(projectRoot, targetRoleId, runtime),
        });
        if (flowWait.last.state !== "valid") {
          if (flowWait.last.state === "missing") {
            return chainFail(
              manager.isRoleBusy(projectRoot, targetRoleId, runtime)
                ? `Steward / 统筹 本轮未在时限内结束，流程状态 YAML ${flowStatePath} 未确认；未派发提名任务`
                : `Steward / 统筹 未写出流程状态 YAML ${flowStatePath}；未派发提名任务（同名 .md 人读视图不算落盘）`,
            );
          }
          if (flowWait.last.state === "invalid") {
            return chainFail(`流程状态 YAML 校验失败（${flowStatePath}）：${flowWait.last.error}；未派发提名任务`);
          }
          return chainFail(
            `流程状态 YAML ${flowStatePath} 不可读：${flowWait.last.message}；未派发提名任务`,
          );
        }
        // 2026-10-20 真机（flow 工具已注册但 Steward 没调用）：若流程状态 YAML 的**提名步骤已是 done**，
        // **不再重复派 Nominator**（那只会重复劳动）；改为让 Steward / 统筹 继续下一步。两段式契约不破坏：
        // 第一段已投、第二段在这里有据可查地收口。
        if (flowWait.last.nominationDone === true) {
          diagnostic.record("advance.nomination.already-done", { flowId });
          const continueMessage = buildNominationAlreadyDoneMessage(flowId);
          const continued = await dispatchTo("convener", continueMessage);
          if (!continued.ok) return chainFail(continued.error);
          note(governanceNominationAlreadyDoneNote());
          return {
            ok: true,
            dispatched: true,
            targetRoleId,
            followUpRoleId: "convener",
            ...(continued.queued === true ? { queued: true } : {}),
          };
        }
        const nominationPayload: GovernanceNextStepPayload = {
          version: 1,
          flowId,
          cardKind: "proposal",
          nextFunction: "nomination",
          roleId: "nominator",
          ...(payload.proposalPath !== undefined ? { proposalPath: payload.proposalPath } : {}),
        };
        const nominationMessage = buildGovernanceAdvanceMessage(nominationPayload);
        if (nominationMessage === null) return chainFail("缺少流程信息，未派发提名任务");
        const openedNomination = await manager.openBackground({ projectRoot, roleId: "nominator", runtime });
        if (!openedNomination.ok) {
          return chainFail(`无法开启 Crew / 组队 会话：${openedNomination.error ?? "未知原因"}`);
        }
        const sentNomination = await manager.sendBackground({ projectRoot, roleId: "nominator", runtime, text: nominationMessage });
        if (!sentNomination.ok) {
          return chainFail(`发送提名任务给 Crew / 组队 失败：${sentNomination.error ?? "未知原因"}`);
        }
        note(governanceNominationFollowUpNote());
        diagnostic.record("advance.chain.nomination-dispatched", { flowId, queued: sentNomination.queued === true });
        // 第二段派发同样记 app 动作（无 stepId 可伪造；验收只读带 stepId 的 dispatch 步骤）。
        if ((listingCache.get(projectRoot)?.governanceModel ?? "single") === "trio" && existsSync(projectRoot)) {
          const appendedNomination = await appendGovernanceLedger(projectRoot, {
            at: new Date().toISOString(),
            kind: "dispatch.accepted",
            flowId,
            actorRoleId: "app",
            power: "app",
            trigger: "customer-decision",
            targetRoleId: "nominator",
            messageSummary: ledgerSummary(nominationMessage),
            runtime,
          });
          if (!appendedNomination.ok) {
            diagnostic.error("advance.ledger.failed", new Error(appendedNomination.message), { flowId, targetRoleId: "nominator" });
          } else {
            scheduleAcceptanceCheck(projectRoot, "ledger");
          }
        }
        return {
          ok: true,
          dispatched: true,
          targetRoleId,
          followUpRoleId: "nominator",
          ...(sentNomination.queued === true ? { queued: true } : {}),
        };
      }
      return { ok: true, dispatched: true, targetRoleId, ...(sent.queued === true ? { queued: true } : {}) };
    },

    async stopSession(input?: { roleId?: string | null; projectRoot?: string; runtime?: RuntimeKind }): Promise<StopResult> {
      const roleId = input && typeof input.roleId === "string" ? input.roleId : null;
      if (roleId === null) return manager.stop(null);
      return manager.stop({ ...input, roleId });
    },

    async withdrawQueued(input: { roleId: string; id: string; projectRoot?: string; runtime?: RuntimeKind }): Promise<WithdrawResult> {
      const roleId = input && typeof input.roleId === "string" ? input.roleId : "";
      const id = input && typeof input.id === "string" ? input.id : "";
      return manager.withdraw({ ...input, roleId }, id);
    },

    async abortSession(input: SessionTarget): Promise<RoleSessionAbortResult> {
      const roleId = input && typeof input.roleId === "string" ? input.roleId : "";
      return manager.abort({ ...input, roleId });
    },

    async listLiveSessionViews() { return manager.liveSessionViews(); },
    async getSessionHistory(input) { const history = await getSessionHistory(input, { credentialEnvNames: [...(deps.runtimeOptions?.extraCredentialEnvVars ?? []), ...(deps.runtimeOptions?.apiKeyEnvVar ? [deps.runtimeOptions.apiKeyEnvVar] : [])] }); manager.registerPersistenceHistory(history); return history; },
    async getRuntimeConfig(runtime) {
      return getRuntimeConfig(runtime, { envPath: envFilePath, env: deps.piConfigEnv, revision: manager.profileRevision(runtime), application: application(runtime) });
    },
    async saveRuntimeConfig(input) {
      if (!input || !isRuntimeKind(input.runtime)) return { ok: false, runtime: "demo", appliedKeys: [], revision: 0, application: "current", error: "未知运行时。" };
      const result = await saveRuntimeConfig(input, { envPath: envFilePath, revision: manager.profileRevision(input.runtime) });
      if (result.ok && result.appliedKeys.length > 0) {
        result.revision = manager.profileChanged(input.runtime);
        pendingProfiles.add(input.runtime);
      }
      result.application = application(input.runtime);
      return result;
    },

    async listLiveSessions(): Promise<string[]> {
      return manager.liveRoleIds();
    },

    // G-2/W1：看护器的起停（主进程窗口注册后启动、窗关停止；看护缺席 ⇒ 两个方法都是 no-op）。
    startWatchdog() { watchdogService?.start(); },
    stopWatchdog() { watchdogService?.stop(); },

    async openExternal(input: { url: string }): Promise<{ ok: boolean; error?: string }> {
      const url = input && typeof input.url === "string" ? input.url.trim() : "";
      // 渲染进程传来的任何内容都视为**不可信输入**：只放行 http/https（挡 javascript:/file:/data: 等）。
      if (!/^https?:\/\//i.test(url)) {
        return { ok: false, error: "只允许打开 http/https 链接。" };
      }
      if (url.length > 2048) {
        return { ok: false, error: "链接过长，已拒绝。" };
      }
      if (!deps.openExternalFn) {
        return { ok: false, error: "外部打开未接线（fail-closed）。" };
      }
      try {
        await deps.openExternalFn(url);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    // —— 输入区图片（K-2）：**渲染进程不碰文件**——选图走主进程（dialog+fs），字节在**本层**按真实内容校验。
    // 发送路径见 sendSession（P0-1：真实字节重校验 → 组载荷随消息送模型）。
    async pickImage(): Promise<PickImageResult> {
      const fn = deps.pickImageFileFn;
      if (!fn) {
        return { ok: false, error: "选图未接线（fail-closed）。" };
      }
      let picked: { name: string; dataBase64: string } | null;
      try {
        picked = await fn();
      } catch (err) {
        return { ok: false, error: `读取图片失败：${err instanceof Error ? err.message : String(err)}` };
      }
      if (picked === null) return { ok: true, cancelled: true };
      const decoded = decodeImageBase64(picked.dataBase64);
      if (!decoded.ok) return { ok: false, error: decoded.error };
      const sniffed = sniffImageMime(decoded.buffer);
      if (sniffed === null) {
        return { ok: false, error: `内容不是受支持的图片（真实格式不在 ${ALLOWED_IMAGE_MIMES.join(" / ")} 之内）——扩展名不作数。` };
      }
      const v = validateImage(sniffed, decoded.buffer.length);
      if (!v.ok) return { ok: false, error: v.error };
      return {
        ok: true,
        image: { name: sanitizeImageName(picked.name), mime: sniffed, size: decoded.buffer.length, dataBase64: picked.dataBase64 },
      };
    },

    async attachImage(input): Promise<AttachImageResult> {
      // 渲染侧声明值一律不可信：只信**解码后的真实字节**（嗅探类型 + 判尺寸）。
      const decoded = decodeImageBase64(input ? input.dataBase64 : undefined);
      if (!decoded.ok) return { ok: false, error: decoded.error };
      const sniffed = sniffImageMime(decoded.buffer);
      if (sniffed === null) {
        return { ok: false, error: `内容不是受支持的图片（真实格式不在 ${ALLOWED_IMAGE_MIMES.join(" / ")} 之内）。` };
      }
      const v = validateImage(sniffed, decoded.buffer.length);
      if (!v.ok) return { ok: false, error: v.error };
      return { ok: true, image: { name: sanitizeImageName(input ? input.name : undefined), mime: sniffed, size: decoded.buffer.length } };
    },

    // —— Pi 配置面板（设计 §11/T28）——
    // 读写 **仓库根 `.env`**（路径经 `envFilePath` 注入；默认 `resolveRepoEnvPath()`）。
    // 逻辑全在 `pi-config.ts`（**经共享 `env-file` 模块，只读导入、不复制**）：本层只透传。
    // 机密键的值**绝不外发**（`getPiConfig` 对其恒返回空串）；保存回报**只含键名**。
    async getPiConfig(): Promise<PiConfigView> {
      if (deps.getPiConfigFn) return getPiConfigFn(envFilePath);
      return getRuntimeConfig("pi", { envPath: envFilePath, env: deps.piConfigEnv });
    },

    async savePiConfig(input: { updates: Record<string, string> }): Promise<PiConfigSaveResult> {
      const updates = input && typeof input.updates === "object" && input.updates !== null ? input.updates : {};
      // 保存成功后由 `savePiConfig` 内部重载 env（下一会话用新值）；`piConfigEnv` 可注入以隔离单测。
      if (deps.savePiConfigFn) return savePiConfigFn({ envPath: envFilePath, updates, env: deps.piConfigEnv });
      const result = await saveRuntimeConfig({ runtime: "pi", updates }, { envPath: envFilePath });
      if (result.ok && result.appliedKeys.length > 0) {
        result.revision = manager.profileChanged("pi");
        pendingProfiles.add("pi");
        if (!manager.hasBusyRuntime("pi")) {
          await applyRuntimeConfig("pi", envFilePath, deps.piConfigEnv ?? process.env);
          pendingProfiles.delete("pi");
        }
      }
      result.application = application("pi");
      return result;
    },
  };
}
