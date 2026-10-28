import type { PersistenceReply, PersistenceValues, PersistenceUpdated, PersistenceScope } from "./session.ts";

import { realpathSync } from "node:fs";
import { createHash } from "node:crypto";

import path from "node:path";
import { readFile, readdir, stat, mkdir } from "node:fs/promises";
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
import type { WriteGate, RuntimeAdapter, ShellGate, CustomerInputFn, CustomerInputOutcome, DispatchTaskFn, PromptImage, PromptOptions, ViewImageFn } from "../../src/model/runtime.ts";
// 2026-10-25 独立复核请求（`独立复核请求（已撤除）`）：能力回执/载荷形状唯一来源＝契约家 `model/runtime.ts`
// （只读导入，不复制形状）；flowId 形状同样复用运行时核心导出的 slug 常量（不另写正则）。
import type { RequestRequirementChangeFn, RequestRequirementChangeInput, RequestRequirementChangeResult } from "../../src/model/runtime.ts";

// 2026-10-26 边界变更请求（边界变更请求（已撤除））：确定性校验/票据/组队任务/AI 门禁请求的纯逻辑
// 在 `boundary-change.ts`（不写盘、不发会话）；本层只做 IO/派发/判断闭包装配。
import { REQUIREMENT_CHANGE_TICKET_ROOT_REL, REQUIREMENT_CHANGE_TICKET_SCHEMA, assessRequirementChangeRequest, buildRequirementChangeApprovalCard, buildRequirementChangeLeadExecutionTaskText, isPendingRequirementChangeStatus, requirementChangeApprovalSourceText, requirementChangeClientMessageId, requirementChangeDetailText, requirementChangeRequestId, requirementChangeTicketRelPath, type RequirementChangeApprovalRecord, type RequirementChangeTicketRecord } from "./requirement-change.ts";
import { atomicWrite } from "../../src/common/shared/atomic-write.ts";

import { listProject as realListProject } from "../../src/service/role/resolve-role.ts";
import { openRoleSession as realOpenRoleSession, createPiAdapterFactory as realCreatePiAdapterFactory, createRuntimeAdapterFactory as realCreateRuntimeAdapterFactory, type RuntimeAdapterFactoryBuilder, type RuntimeAdapterFactoryOptions } from "../../src/pipeline/orchestration/run-role.ts";
// I2/C1（2026-10-17 PM 评审 §四.2/§4.6）：建立治理记录的预览/建立机制。**只**经编排的 Pipeline 公共出口
// （`govern-session.ts` 薄再导出）使用——**不得**直接导入 `src/common/编排/finalize.ts`（跨角色私有 common）。
import { createShellJudge as realCreateShellJudge, createGovernanceJudge as realCreateGovernanceJudge } from "../../src/pipeline/orchestration/govern-session.ts";
import { intentArtifactPath } from "../../src/common/编排/governance-judge-intent.ts";
// 只读 pin 证据检查：**唯一实现**在门禁引擎私有模块，只经 Service 公开出口消费（跨角色边界纪律）。
// 2026-10-20：内置治理角色判定同样经该 Service 公开出口（看护自动中止按角色映射开关用；不复制 id 列表）。
import { inspectPinnedBoundaries, isBuiltInGovernanceRoleId } from "../../src/service/boundary/resolve-boundary.ts";
import { createChatDemoAdapter } from "./chat-adapter.ts";

import { buildProjectConfig as realBuildProjectConfig, buildEffectiveProjectConfig, deriveGovernanceRecord, deriveGovernanceRecordWithPins, readRoleDocsIndex, projectDocumentCandidates, type DocsIndexEntry, type GovernanceRecordStatus, type RoleRootDocEntry } from "./project.ts";
// 治理记录状态类型（PM 评审 §四.1 契约）：定义在 `project.ts`（派生函数同址，避免两处漂移），
// 此处原样再导出供 Interface 消费方（preload/渲染侧类型）引用。
export type { GovernanceRecordState, GovernanceRecordStatus } from "./project.ts";
// 载入器类型（只读导入共享组件类型；**实现**的唯一来源在 `src/common/shared/config-loader.ts`）。
import type { LoadConfigOptions, LoadedConfig } from "../../src/common/shared/config-loader.ts";
import { loadEffectiveConfig as realLoadEffectiveConfig } from "../../src/common/shared/config-loader.ts";
import { SessionManager, type SessionOpenRequest, type SessionTarget, type SessionMessageMetadata, type SessionManagerDeps, type OpenResult, type SendResult, type StopResult, type WithdrawResult, type SessionEventEnvelope, type BackgroundTasksListReply, type BackgroundTaskReadInput, type BackgroundTaskReadReply, type BackgroundTaskStopInput, type BackgroundTaskStopReply, type TaskListView, type TaskRestoreReport, type TerminateRoleRunInput, type TerminateRoleRunResult, type RedispatchTaskInput, type RedispatchTaskResult, type CloseTaskInput, type CloseTaskResult } from "./session.ts";
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
import { governanceFlowStatePath } from "./governance-advance.ts";
// 流程**机器状态**（2026-10-19 客户决定「这些全部改成yaml。」）：自动验收门读 `docs/removed/<flowId>.yaml`，
// 用编排的 `parseFlowStateYaml` + `evaluateFlowCompletion` 判定；Markdown 仅人读视图（YAML 缺失时才
// legacy 回退）。**只经 Pipeline 公共出口**消费（`src/pipeline/orchestration/流程状态（已撤除）.ts` 薄再导出），
// 不直接 import 编排私有 `src/common/编排/`；单一实现与 schema 由编排拥有。
// G-2（2026-10-16 客户批准）：恢复确认卡通道（W5——presenter/回包/关窗清帐在 main 接线，本层只透传）与
// 看护服务（W1+W3——同源快照/系统投递/观察转发都在 SessionManager，本层装配并起停 tick）。

import { createDiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
// 目录级授权（2026-10-23 v3）：计划目录 vs 边界的 same/ancestor/大小写口径复用共享路径原语
// （设计 §8.2「路径规范化/大小写/realpath 复用 path-primitives，不另写第二份」）。

// C 批（方案 §6.4.1/C-06）：角色卡必填章节的单一来源在门禁引擎；本文件只读导入、不复制第二份。

import { createWatchdogService, type WatchdogConfig } from "./watchdog.ts";
// 输入区图片附件（K-2）：校验/解码/嗅探的**纯逻辑**（渲染进程不碰文件；字节交主进程校验——内容为准）。
import { decodeImageBase64, sniffImageMime, sanitizeImageName, validateImage, ALLOWED_IMAGE_MIMES, type ImageAttachmentInfo } from "./composer-images.ts";
// Pi 配置面板逻辑（纯逻辑）：读写仓库根 `.env`（**经共享模块，只读导入、不复制**，设计 §11/T28）。
import { getPiConfig as realGetPiConfig, savePiConfig as realSavePiConfig, resolveRepoEnvPath, type PiConfigView, type PiConfigSaveResult, type PiConfigEnv } from "./pi-config.ts";

import { isRuntimeKind, getRuntimeConfig, saveRuntimeConfig, applyRuntimeConfig, type RuntimeConfigView, type RuntimeConfigSaveResult, type ProfileApplication } from "./runtime-config.ts";
import { persistProjectRuntime, readPersistedProjectRuntime, type RuntimeResolution, type RuntimeResolutionRequest } from "./runtime-resolution.ts";
import { getSessionHistory, type SessionHistoryView } from "./runtime-history.ts";
import type { RuntimeKind } from "../../src/model/runtime.ts";
// 2026-10-20 僵尸步骤自检：跨运行时检查 owner 是否有队列/在途投递（runtime 的单一来源）。

// i18n B0（2026-10-23，任务 2026-10-23-i18n）：应用级语言偏好与主进程 translator。
// 共享 i18n 只读导入（Key/Locale/白名单）；偏好读写与 translator 绑定在本角色 `app/desktop/` 内。
import { isLocale, type Locale } from "../../src/common/shared/i18n/index.ts";
import { createMainI18n, mainT, type MainI18n } from "./i18n.ts";
import { refreshRecoveryPage } from "./diagnostics.ts";
import { createPreferencesService, type PreferencesDiagnostic, type PreferencesView } from "./preferences.ts";

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
  /** 角色根目录白名单文档（项目相对路径，仅元数据；不读正文）。内置角色为 `[]`。 */
  rootDocs?: RoleRootDocEntry[];
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
      if (record === undefined) return { version: 1, ok: false, error: mainT("main.interface.toggleInvalid") };
      if (typeof record.enabled !== "boolean") return { version: 1, ok: false, error: mainT("main.interface.toggleNotBoolean") };
      if (Object.keys(record).some((key) => key !== "enabled")) return { version: 1, ok: false, error: mainT("main.interface.toggleUnknownField") };
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

// ————————————————— 2026-10-23：i18n B0 应用级语言偏好（IPC 接线） —————————————————
//
// `preferences:get` / `preferences:set-locale` 两个入站通道的**纯**注册逻辑：不依赖 electron，
// main.ts 传入 `createWindowIpcRegistrar` 的 `registerHandler`，单测可传入假 registrar 直接调用。
// 推送 `preferences:locale-changed` 由 `onLocaleChanged` 钩子在**成功回执后**执行（main.ts 更新
// 窗口标题并广播；失败只诊断，不影响切换结果）。

/** `preferences:set-locale` 回执：成功 `{ok:true, locale}`；失败 `{ok:false, locale:当前, error}`。 */
export type SetLocaleReply =
  | { ok: true; locale: Locale }
  | { ok: false; locale: Locale; error: string };

/** 偏好 IPC 的注册函数形状（与 `IpcMain["handle"]` 兼容；测试用假 registrar）。 */
export type DesktopIpcRegisterHandler = (
  channel: string,
  listener: (event: unknown, ...args: unknown[]) => unknown,
) => void;

export interface PreferencesIpcHooks {
  /**
   * 语言切换**成功**后调用：main.ts 用它更新窗口标题并广播 `preferences:locale-changed`
   * （单窗口即可；遍历全部窗口为未来多窗口留好）。抛错只诊断、不影响已成功的切换回执。
   */
  onLocaleChanged?: (locale: Locale) => void;
}

/** 注册 `preferences:get` 与 `preferences:set-locale`；失败（非法/写失败）不广播。 */
export function registerPreferencesIpc(
  registerHandler: DesktopIpcRegisterHandler,
  desktop: Pick<DesktopInterface, "getPreferences" | "setLocale">,
  hooks: PreferencesIpcHooks = {},
): void {
  registerHandler("preferences:get", () => desktop.getPreferences());
  registerHandler("preferences:set-locale", async (_event, input) => {
    const result = await desktop.setLocale(input);
    if (result.ok) {
      try {
        hooks.onLocaleChanged?.(result.locale);
      } catch {
        // 推送/标题更新失败只诊断（main.ts 的钩子内部记录），不得翻转已成功的持久化结果。
      }
    }
    return result;
  });
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
      /** 需求变更申请能力（2026-10-26 request_requirement_change）：仅统筹/提案会话注入（见 session.ts）。 */
      requestRequirementChange?: RequestRequirementChangeFn;
      /** 图片查看投递能力（2026-10-26 view_image）：全部角色会话注入（目标在开会话时定格）。 */
      viewImage?: ViewImageFn;
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
   * **C1（治理记录 pin 不符的重新接受恢复，PM 评审 §5.3）**：只读 pin 证据检查——
   * 缺省经 Service 公开出口 `src/service/boundary/resolve-boundary.ts`（门禁引擎唯一实现）。
   * 注入以便单测隔离「pin 保持一致 / 不符 / 检查抛错」三种事实；`listProject` 的 `governanceRecord`
   * 由它合入后可能为 `pin-mismatch`。
   */
  inspectPinnedBoundariesFn?: typeof inspectPinnedBoundaries;
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
   * **应用级语言偏好文件（i18n B0，2026-10-23）**：主进程传
   * `<userData>/ans/preferences.json`（`preferencesFilePath(app.getPath("userData"))`）——只写 userData，
   * **不写项目 `.ans`/`.env`/治理账本**。缺省 ⇒ 不持久化（`setLocale` 如实返回失败，不假装保存成功）；
   * 测试注入系统临时目录下的路径，绝不指向真实 userData。
   */
  preferencesPath?: string;
  /**
   * **主进程 translator（i18n B0）**：main.ts 与 Interface 共享**同一实例**（窗口/对话框/启动错误框
   * 与 IPC 错误文案同一 locale）；缺省自建 zh-CN（单测直用）。切换只影响之后新生成的文本，历史不追溯。
   */
  mainI18n?: MainI18n;
  /** 偏好读写的稳定诊断（可选注入收集器；缺省写共享诊断日志）。诊断码/原因码是机器标识，不翻译。 */
  onPreferencesDiagnostic?: (diagnostic: PreferencesDiagnostic) => void;
  /**
   * **引擎解析器（可注入）**：缺省＝本层用 `envFilePath`/`piConfigEnv` 调用真实
   * `resolveProjectRuntime`（活跃会话 → 已选/持久化 → `.ans/sessions` 磁盘证据 → 凭据可用性）。
   * 注入以便单测隔离真实 `.env`；缺省实现绝不回退 "claude"（无凭据 ⇒ 不派发 + 系统行）。
   */
  resolveRuntimeFn?: (request: RuntimeResolutionRequest) => Promise<RuntimeResolution>;
  /**
   * **需求变更申请能力**（2026-10-26 `request_requirement_change`；客户纠正）：桌面 Interface 提供的
   * 应用侧实现（按项目绑定；`requesterRoleId`/`runtime` 由会话注入端补入）。SessionManager 仅对
   * **统筹（schedule）与提案（proposal）**会话注入；其他内置治理角色、项目角色不注入（缺省不注入 ⇒
   * 工具不注册，结构性 fail-closed）。语义：载荷二次校验 → 发起方白名单 → 意图/流程存在性 → 同 flow
   * 待处理/已批准去重 → 原子写 `.ans/governance/requirement-changes/<flowId>/<requestId>.json`
   * （`requirement-change-request/v2`）→ 经**发起方会话客户卡通道**呈现 `request_choice(cardKind=
   * "decision")` 审批卡（approve/reject，恰好一个 recommended=approve）→ 票据 dispatched。
   * 审批由客户（未勾选「替我决策」）或独立判断 agent（勾选时默认推荐项）完成；发起方不得自批。
   * 批准 ⇒ 应用把「已批准执行任务」交给主理（主理不审批，只执行意图变更并通知提案修订）；
   * 拒绝/未获明确结果 ⇒ 回执给发起方。**申请 ≠ 批准**：不写 `customer.decision`/治理账本、不改写权；
   * 不向主理投原始申请任务。失败如实 `unavailable`/`rejected`（票据 failed，可重试）。
   */
  requestRequirementChange?: (
    projectRoot: string,
    requesterRoleId: string,
    runtime: RuntimeKind,
    input: RequestRequirementChangeInput,
  ) => Promise<RequestRequirementChangeResult>;
  /**
   * **需求变更审批卡/主理执行任务投递的时限**（与既有应用侧时限模式同口径）：总预算缺省 ≤60s；
   * 单阶段（主理执行任务的打开/投递、审批回执投递）缺省 ≤20s。超时如实回执/记票据，绝不无限挂起。
   */
  requestRequirementChangeLimits?: { totalMs?: number; stageMs?: number };
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
   * `proposal accept` → **先** Convener 写 `docs/removed/<flowId>.yaml`（唯一机器状态，首步提名）；应用**有界轮询**
   * 该 YAML 事实（存在且通过校验才放行；角色瞬时忙闲不作判据），合法 ⇒ 再派 Nominator（消息带 YAML 路径），
   * 缺失/非法/超时 ⇒ 系统行如实报错一次、**不循环**；
   * `accept-quick`/`appointment` → Convener 写流程状态 YAML/排程（既有逻辑）。
   * **不抢 `activeRoleId`、不切当前 pane、不自动批准/写盘、不写客户决定**；成功/失败都经既有
   * `delivery-note` 系统行落在发起卡片的角色聊天流（失败如实、不重试循环）。
   * 仅由主进程 `governance:next-step` 回调调用——**不挂 IPC、不暴露给渲染侧**。
   */
  /**
   * **judge auto-rework ⇒ 验收返工路由**（2026-10-23 验收返工路由方案 v1 §5.3.1 / Q7 A）。
   *
   * 由主进程把客户交互通道的 `onAutoRework` 回调接到本方法（与 `advanceGovernanceFlow` 同模式）：
   * 只处理 `cardKind==="acceptance"` 的 judge deny/manual 自动退回事实；读最新验收报告 +
   * `parseAcceptanceReworkReport` 结构化 items，写 `.ans/governance/acceptance/<flowId>/rework-routing.json`
   * （原子写、幂等、重启去重）并把**唯一一条**返工任务交 Convener。**不写 customer.decision**、
   * 不派 Proof 返工、不替客户验收；失败只诊断/系统行，不伪造路由。不挂 IPC、不暴露给渲染侧。
   */
  /**
   * **验收分诊呈现前闸**（2026-10-25 设计 `2026-10-25_design_removedAcceptanceTriage.md` §3.2 / §4 / §5 / §7）。
   *
   * 由主进程把客户交互通道的 `acceptanceTriage` 前闸接到本方法（与 `routeAcceptanceAutoRework` 同模式）。
   * 只对 trio + YAML 流程 + `cardKind:"acceptance"` 的请求求值：读最新验收报告 + sha256 →
   * `parseAcceptanceTriageReport` → 缺/坏结构写 `returned-to-verifier` 记录并**不呈现**验收卡；
   * `pass` ⇒ `proceed`（既有验收卡路径）；`fail/conditional` ⇒ `recommendAcceptanceTriage`；
   * 「替我决策」开且建议权威 ⇒ 按建议自动处置（judge-rule）；否则返回**客户分诊卡**。
   * 本方法不做 IO 之外的判定扩展：解析/建议/记录/路由实现全部来自编排公共出口；**不写 customer.decision**。
   * 不挂 IPC、不暴露给渲染侧。
   */
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
  /**
   * **后台任务聚合列表（2026-10-25，桌面任务面板）**：按 `projectRoot + runtime` 聚合当前所有已打开会话的
   * 后台任务——每项 = `BackgroundTaskSnapshot` + `roleId` + `runtime`。直接读各会话句柄、**不缓存/不持久化**；
   * 句柄无能力跳过该角色；没有任何具备能力的活会话 ⇒ 空列表 + `unavailable:true`（区别于「没有任务」）。
   * 参数缺失/非法 ⇒ `{ok:false, error}`（不抛）。
   */
  listBackgroundTasks(input: { projectRoot: string; runtime: RuntimeKind }): Promise<BackgroundTasksListReply>;
  /**
   * **读取后台任务日志**：以 `{projectRoot, runtime, roleId, taskId}` 精确寻址；`stream`（stdout/stderr/both）
   * 与 `tailLines` 原样透传（上限 200 行由底层钳制并如实标注 `tailClamped`）。找不到会话/句柄无能力/
   * 未知任务（底层 `undefined`）一律 `{ok:false, error}`——绝不伪造任务状态或日志内容。
   */
  readBackgroundTask(input: BackgroundTaskReadInput): Promise<BackgroundTaskReadReply>;
  /**
   * **停止后台任务**：以 `{projectRoot, runtime, roleId, taskId, force?}` 精确寻址。底层结果**原样返回**
   * （`ok:true` 或 `ok:false` 的 `unknown-task`/`closed`/`timeout`）——**不得改写为成功**；桌面层不可用
   * （无会话/无能力/底层抛错）为 `reason:"closed"`/`"unavailable"` 的如实失败。
   */
  stopBackgroundTask(input: BackgroundTaskStopInput): Promise<BackgroundTaskStopReply>;
  // —————— B 批（2026-10-28）：任务/短报/运行日志/终止重派数据面（只读或应用独占动作；不新增客户裁决卡）——————
  /** 任务列表（`tasks.jsonl` 重放；只读；坏行数如实）。 */
  listTasks(input: { projectRoot: string }): Promise<TaskListView>;
  /** 重启恢复：未投递任务重新入队（不伪造成功）；已投递/已报告未收口只展示。 */
  restoreTasks(input: { projectRoot: string }): Promise<TaskRestoreReport>;
  /** 幕僚运行日志只读（脱敏/项目相对路径；其他角色不可经此读取）。 */
  readRoleActivityLog(input: { projectRoot: string; roleId: string; since?: string; limit?: number }): Promise<{ ok: boolean; text?: string; message?: string }>;
  /** 终止当前轮次 + 后台子进程树；`terminationConfirmed=false` ⇒ 调用方不得自动重派。 */
  terminateRoleRun(input: TerminateRoleRunInput): Promise<TerminateRoleRunResult>;
  /** 卡死终止后的安全重派（仅 safe；external/destructive/unknown 0 次自动重派；≤2 次）。 */
  redispatchTask(input: RedispatchTaskInput): Promise<RedispatchTaskResult>;
  /** 幕僚收口任务（accepted/rework/rejected；写 task.closed）。 */
  closeTask(input: CloseTaskInput): Promise<CloseTaskResult>;
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
   * **应用级语言偏好视图（i18n B0，2026-10-23；`preferences:get`）**：
   * `{version:1, locale, supported:string[]}`。locale 以主进程内存为准（启动时从偏好文件读取并校验；
   * 缺失/损坏/非法 ⇒ zh-CN + 启动诊断，不阻塞启动）。
   */
  getPreferences(): Promise<PreferencesView>;
  /**
   * **切换界面语言（`preferences:set-locale`）**：只接受 `zh-CN`/`en-US` 白名单值。
   * 合法 ⇒ 共享 `atomicWrite` 原子写 `<userData>/ans/preferences.json` 后更新主进程 translator，
   * 返回 `{ok:true, locale}`；非法值/持久化不可用/写失败 ⇒ `{ok:false, locale:当前, error}`，
   * **不改内存/文件、不广播**。本层不负责推送——main.ts 在 `ok:true` 后更新窗口标题并广播
   * `preferences:locale-changed`（`registerPreferencesIpc`）。
   */
  setLocale(input: unknown): Promise<SetLocaleReply>;
  /**
   * **看护器起停（G-2/W1）**：主进程在窗口注册后 `startWatchdog()`（周期 tick＝30s，仅 env 可调）、
   * 窗口关闭时 `stopWatchdog()`。**看护缺席/故障 ⇒ 核心治理零依赖（一切照旧）**——本层绝不因看护
   * 影响任何会话/投递路径。
   */
  startWatchdog(): void;
  stopWatchdog(): void;
}

export function createDesktopInterface(deps: DesktopDeps): DesktopInterface {
  const listProjectFn = deps.listProjectFn ?? realListProject;
  const openRoleSessionFn = deps.openRoleSessionFn ?? realOpenRoleSession;
  const createPiAdapterFactoryFn = deps.createPiAdapterFactoryFn ?? realCreatePiAdapterFactory;
  const createDemoAdapterFn = deps.createDemoAdapterFn ?? createChatDemoAdapter;
  const buildProjectConfigFn = deps.buildProjectConfigFn ?? realBuildProjectConfig;
  // 治理记录状态与会话授权链共用的**同一份**共享载入器（只读导入，不复制实现）。
  const loadEffectiveConfigFn = deps.loadEffectiveConfig ?? realLoadEffectiveConfig;
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

  // i18n B0（2026-10-23）：主进程 translator（main.ts 传入同一实例）与偏好服务。
  // 启动读取由 main.ts 的 `readPreferences` 完成；本服务只持有当前 locale 与后续原子写入，
  // 不在这里再读一次盘（避免第二处读取口径）。缺省路径 ⇒ 不持久化，`setLocale` 如实失败。
  const mainI18n = deps.mainI18n ?? createMainI18n();
  // B3：恢复页按当前 locale 取词（main.ts 以 live binding 读取；locale 切换后再刷新）。
  refreshRecoveryPage();
  const preferencesLog = createDiagnosticLogger({ component: "desktop.preferences" });
  const preferencesService = createPreferencesService({
    ...(deps.preferencesPath !== undefined ? { filePath: deps.preferencesPath } : {}),
    initialLocale: mainI18n.getLocale(),
    onDiagnostic: (diagnostic) => {
      deps.onPreferencesDiagnostic?.(diagnostic);
      preferencesLog.record(diagnostic.code, {
        reasonCode: diagnostic.reasonCode,
        ...(diagnostic.errorCode !== undefined ? { errorCode: diagnostic.errorCode } : {}),
      });
    },
  });

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

  // 会话事件外推：先原样转发（主进程推 `session:event`；B-2 起为**带 `roleId` 信封**的 `SessionEventEnvelope`）；
  // 再在「**主入口角色**一轮结束（`settled`）」时触发「项目可能已变」信号（→ 主进程推 `project:changed` →
  // 渲染侧重取枚举，左树随 su 建角色而长出，§10.3）。判据取**信封里的角色**（多会话并存后不能再看
  // 「默认活动的那个是谁」）。本层只转达信号，**不判定**写入是否发生（判定唯一来自门禁引擎）。
  // 任一内置治理角色 settle 也要刷新 listing——否则任命后新写的角色卡在同一轮内不可见
  // （`role_status`/`dispatch_task` 误报「未枚举到」）。
  /** 真实会话事件留下的弱引擎提示（仅用于系统行择路兜底；应用自己的 `delivery-note` 不写）。 */
  const runtimeHintsByProject = new Map<string, RuntimeKind>();
  const emitSessionEvent = (envelope: SessionEventEnvelope): void => {
    deps.emitEvent(envelope);
    if (typeof envelope.projectRoot === "string" && envelope.projectRoot !== "") {
      // 应用自己产生的系统行（`delivery-note`）为 UI 展示常用兜底 runtime="claude"，它不代表项目
      // 真实引擎。不得把它写进弱提示，否则会覆盖项目已选的 Pi（无 ANTHROPIC_API_KEY 时直接失败）。
      const isAppNote =
        envelope.event.kind === "message" &&
        (envelope.event.detail as { source?: string } | undefined)?.source === "delivery-note";
      if (!isAppNote) runtimeHintsByProject.set(envelope.projectRoot, envelope.runtime);
    }
    if (envelope.event.kind === "settled") {
      const settledRole = listingCache
        .get(envelope.projectRoot)
        ?.roles.find((role) => role.roleId === envelope.roleId);
      if (settledRole?.builtIn === true && settledRole.governanceFunction !== undefined) {
        scheduleGovernanceListingRefresh(envelope.projectRoot);
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
      // B 批（2026-10-28；仅 env `ANS_LOG_AUTO_TERMINATE=auto-terminate` 时看护才回调）：
      // 终止当前轮次/子进程树；确认退出且任务已知 ⇒ 交给安全重派（外部/破坏性/未知副作用 0 次自动重派）。
      onStuckRole: (root, roleId, runtime, info) => {
        const diagnostic = createDiagnosticLogger({ component: "desktop.watchdog", projectRoot: root, roleId });
        void manager.terminateRoleRun({ projectRoot: root, roleId, runtime, ...(info.taskId !== undefined ? { taskId: info.taskId } : {}) })
          .then((result) => {
            diagnostic.record("watchdog.stuck.terminated", { state: info.state, confirmed: result.terminationConfirmed, childProcesses: result.childProcesses, stopped: result.childProcessesStopped });
            if (result.terminationConfirmed && info.taskId !== undefined) {
              void manager.redispatchTask({ projectRoot: root, taskId: info.taskId }).then((redispatched) => {
                diagnostic.record("watchdog.stuck.redispatch", { safety: redispatched.safety, ok: redispatched.ok, taskId: redispatched.taskId });
              });
            }
          })
          .catch((error) => diagnostic.error("watchdog.stuck.terminate.failed", error));
      },
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

  // —————— 2026-10-26 需求变更申请（`request_requirement_change`）：应用侧能力实现 ——————
  //
  // 客户纠正（2026-10-26）：**需求变更不由主理审批**。发起方（统筹/提案）调用工具后，应用经**发起方
  // 会话的客户卡通道**呈现 `request_choice(cardKind="decision")` 审批卡（选项 approve / reject，恰好
  // 一个 recommended=approve，带 flowId）；审批人＝客户（未勾选「替我决策」）或独立判断 agent（勾选时
  // 默认选推荐项）；发起方不得自批。批准后应用把「已批准需求变更执行任务」交给主理（主理不审批，只执行
  // 意图变更并通知提案修订）；拒绝/未获明确结果 ⇒ 回执给发起方。本能力的边界：
  //  · 不弹主理原始申请任务、不写 `customer.decision`、不写治理账本、不改变任何角色的文件写权；
  //  · 参数非法 / 发起角色不在白名单 / 意图或流程不存在 ⇒ `invalid` / `rejected` / `intent-not-found` /
  //    `flow-not-found`：零票据、零卡、零投递（fail-closed）；
  //  · 同一 flow 已有待处理/已批准申请（票据 `requested`/`dispatched`/`approved`）⇒ `already-dispatched`；
  //  · 审批卡未呈现（通道不可用/卡校验拒发）⇒ `unavailable`/`rejected`，票据如实 failed；
  //  · 卡片已呈现 ⇒ `dispatched`（**已提交独立审批，不是批准**）；票据先 `requested` 再 `dispatched`，
  //    审批结果异步落 `approved`/`rejected`/`failed` 并回执发起方；批准后执行任务投递主理（忙则入队）。
  /** 同 project+flow 的在途申请（并发/重复请求不重复投递；进程内，不持久化）：scopeKey → requestId。 */
  const requirementChangeInFlight = new Map<string, string>();
  const requirementChangeNow = (): string => new Date().toISOString();
  /**
   * **审批卡/执行任务投递的时限**（与既有应用侧时限模式同口径）：总预算缺省 ≤60s；单阶段
   * （呈现审批卡的前置检查由通道自身负责；主理执行任务的打开/投递）缺省 ≤20s。超时如实回执/记票据，
   * **绝不让工具或后台任务无限挂起**，也不谎称已提交/已交接。
   */
  /** 有界等待：超时返回 `{timedOut:true}`；底层 promise 继续（不取消、不伪造结果）。 */
  const withRequestAcceptanceDeadline = async <T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<{ timedOut: false; value: T } | { timedOut: true }> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<{ timedOut: true }>((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), Math.max(1, timeoutMs));
      (timer as { unref?: () => void }).unref?.();
    });
    try {
      return await Promise.race([
        promise.then((value) => ({ timedOut: false as const, value })),
        timeout,
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
  /** 项目根规范化（路径去相对/尾斜杠；realpath 解析符号链接，失败保留 resolve 结果）。 */
  const canonicalProjectRootCache = new Map<string, string>();
  const canonicalProjectRoot = (projectRoot: string): string => {
    const cached = canonicalProjectRootCache.get(projectRoot);
    if (cached !== undefined) return cached;
    let resolved = path.resolve(projectRoot);
    try {
      resolved = realpathSync(resolved);
    } catch {
      // realpath 失败（不存在/权限）保留 resolve 结果。
    }
    canonicalProjectRootCache.set(projectRoot, resolved);
    return resolved;
  };

  const requirementChangeTotalMs = (() => {
    const raw = deps.requestRequirementChangeLimits?.totalMs;
    return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 60_000;
  })();
  const requirementChangeStageMs = (() => {
    const raw = deps.requestRequirementChangeLimits?.stageMs;
    const fallback = Math.max(1, Math.min(20_000, requirementChangeTotalMs));
    return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
  })();

  /** 解析项目枚举（共享缓存；miss 时实时枚举一次——与界面 listProject 同一路径）。失败 ⇒ undefined。 */
  const requirementChangeListing = async (
    root: string,
    diagnostic: ReturnType<typeof createDiagnosticLogger>,
  ): Promise<ProjectListing | undefined> => {
    let listing = listingCache.get(root);
    if (listing !== undefined) return listing;
    try {
      listing = await listProjectFn(root);
      listingCache.set(listing.projectRoot, listing);
      return listing;
    } catch (error) {
      diagnostic.error("requirement-change.listing.failed", error);
      return undefined;
    }
  };

  /** 发起方白名单（数据驱动：仅内置治理角色且治理职能为 schedule/proposal；其他角色不可发起）。 */
  const isRequirementChangeInitiator = (listing: ProjectListing | undefined, roleId: string): boolean => {
    const role = listing?.roles.find((item) => item.roleId === roleId);
    const fn = role?.governanceFunction;
    return role?.builtIn === true && (fn === "schedule" || fn === "proposal");
  };

  /** 可见系统行（只落发起方聊天流；不弹卡、不写账本、不改写权）。 */
  const emitRequirementChangeNote = (root: string, roleId: string, runtime: RuntimeKind, summary: string): void => {
    if (roleId === "") return;
    try {
      emitSessionEvent({
        roleId,
        projectRoot: root,
        runtime,
        event: { kind: "message", summary, detail: { source: "delivery-note" } },
      });
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.requirement-change", projectRoot: root, roleId }).error(
        "requirement-change.note.failed",
        error,
      );
    }
  };

  const requirementChangeFileIsFile = async (absPath: string): Promise<boolean> => {
    try {
      const info = await stat(absPath);
      return info.isFile();
    } catch {
      return false;
    }
  };

  /**
   * 票据读取（重启恢复/幂等）：缺失 ⇒ missing；schema 不识别/IO 失败 ⇒ corrupt（调用方只记诊断，
   * **不把坏票据当已派发**——继续按新请求处理并覆盖写新票据）。
   */
  const readRequirementChangeTicket = async (
    root: string,
    relPath: string,
  ): Promise<
    | { state: "missing" }
    | { state: "corrupt"; error: string }
    | { state: "ok"; record: RequirementChangeTicketRecord }
  > => {
    try {
      const text = await readFile(path.join(root, ...relPath.split("/")), "utf8");
      const parsed = JSON.parse(text) as unknown;
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        (parsed as { schema?: unknown }).schema !== REQUIREMENT_CHANGE_TICKET_SCHEMA ||
        typeof (parsed as { requestId?: unknown }).requestId !== "string" ||
        typeof (parsed as { status?: unknown }).status !== "string"
      ) {
        return { state: "corrupt", error: "票据 schema 不识别" };
      }
      return { state: "ok", record: parsed as RequirementChangeTicketRecord };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing" };
      return { state: "corrupt", error: error instanceof Error ? error.message : String(error) };
    }
  };

  /** 原子写票据；失败抛错（调用方决定 unavailable / rejected / 如实标注）。 */
  const writeRequirementChangeTicket = async (
    root: string,
    relPath: string,
    record: RequirementChangeTicketRecord,
  ): Promise<void> => {
    const abs = path.join(root, ...relPath.split("/"));
    await mkdir(path.dirname(abs), { recursive: true });
    await atomicWrite(abs, `${JSON.stringify(record, null, 2)}\n`);
  };

  /**
   * 同一 flow（scopeKey）下**未关闭**的申请：`requested`/`dispatched`。坏票据只记诊断、不当已派发，
   * 也不阻塞新请求（fail-open 到「重新取证/重新投递」，但稳定 requestId 仍让同一请求至多投递一次）。
   */
  const findPendingRequirementChange = async (
    root: string,
    scopeKey: string,
    diagnostic: ReturnType<typeof createDiagnosticLogger>,
  ): Promise<RequirementChangeTicketRecord | undefined> => {
    const dir = path.join(root, ...`${REQUIREMENT_CHANGE_TICKET_ROOT_REL}/${scopeKey}`.split("/"));
    let names: string[];
    try {
      names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        diagnostic.error("requirement-change.ticket.list.failed", error, { scopeKey });
      }
      return undefined;
    }
    for (const name of names) {
      const read = await readRequirementChangeTicket(root, `${REQUIREMENT_CHANGE_TICKET_ROOT_REL}/${scopeKey}/${name}`);
      if (read.state === "ok" && isPendingRequirementChangeStatus(read.record.status)) return read.record;
      if (read.state === "corrupt") {
        diagnostic.error("requirement-change.ticket.corrupt", new Error(read.error), { scopeKey, file: name });
      }
    }
    return undefined;
  };

  /**
   * 独立审批结算（客户/判断 agent 在 decision 卡上的结果）：
   *  · approved ⇒ 票据 `approved` + 立即可见系统行 + 把「已批准执行任务」交给主理（有界；失败如实记票据）；
   *  · rejected ⇒ 票据 `rejected`（终态）；未获明确结果 ⇒ 票据 `failed`（终态）；
   *    两者在卡片已呈现时把回执投给发起方（agent 可见的系统消息；失败回落可见系统行）。
   * 本函数不写治理账本、不写 `customer.decision`、不改写权。
   */
  type RequirementChangeSettlement = {
    outcome: RequirementChangeApprovalRecord["outcome"];
    approval: RequirementChangeApprovalRecord;
    /** 人话 detail（rejected/no-decision 回执用；approved 为空串）。 */
    detail: string;
  };

  const deliverRequirementChangeReceipt = async (input: {
    root: string;
    requester: string;
    runtime: RuntimeKind;
    text: string;
  }): Promise<void> => {
    const diagnostic = createDiagnosticLogger({ component: "desktop.requirement-change", projectRoot: input.root, roleId: input.requester });
    const startedAt = Date.now();
    const budget = (): number => Math.min(requirementChangeStageMs, Math.max(1, requirementChangeTotalMs - (Date.now() - startedAt)));
    try {
      const openedRace = await withRequestAcceptanceDeadline(
        manager.openBackground({ projectRoot: input.root, roleId: input.requester, runtime: input.runtime }),
        budget(),
      );
      if (openedRace.timedOut) throw new Error(`打开发起方会话超时（约 ${Math.round((Date.now() - startedAt) / 1000)}s）`);
      if (!openedRace.value.ok) throw new Error(openedRace.value.error ?? mainT("shared.common.unknownReason"));
      const sentRace = await withRequestAcceptanceDeadline(
        manager.sendBackground({
          projectRoot: input.root,
          roleId: input.requester,
          runtime: input.runtime,
          text: input.text,
          kind: "system",
        }),
        budget(),
      );
      if (sentRace.timedOut) throw new Error(`投递回执超时（约 ${Math.round((Date.now() - startedAt) / 1000)}s；可能已入队/已投递）`);
      if (!sentRace.value.ok) throw new Error(sentRace.value.error ?? mainT("shared.common.unknownReason"));
      return;
    } catch (error) {
      diagnostic.error("requirement-change.receipt.failed", error);
    }
    // 后台消息不可用/超时：退回发起方聊天流的可见系统行（不谎称已送达 agent）。
    emitRequirementChangeNote(input.root, input.requester, input.runtime, input.text);
  };

  /**
   * 已批准执行任务 → 主理（`primaryRoleId`）。主理**不审批**：任务只带独立审批证据与执行范围。
   * 有界（打开/投递各 ≤ 单阶段预算）；目标忙时 `sendBackground` 入队（`queued:true` 仍成功），
   * 不等待空闲；失败/超时如实写票据 `leadDispatch.error` 并返回失败（调用方追加可见行，不谎称已交接）。
   */
  const dispatchRequirementChangeLeadExecution = async (input: {
    root: string;
    requester: string;
    runtime: RuntimeKind;
    requestId: string;
    ticketRel: string;
    baseRecord: RequirementChangeTicketRecord;
    submission: RequirementChangeTicketRecord["submission"];
    flowId: string;
    intentId: string;
    approval: RequirementChangeApprovalRecord;
  }): Promise<{ ok: true } | { ok: false; detail: string }> => {
    const diagnostic = createDiagnosticLogger({ component: "desktop.requirement-change", projectRoot: input.root, roleId: input.requester });
    const clientMessageId = requirementChangeClientMessageId(input.requestId);
    const fail = async (detail: string): Promise<{ ok: false; detail: string }> => {
      const record: RequirementChangeTicketRecord = {
        ...input.baseRecord,
        status: "approved",
        updatedAt: requirementChangeNow(),
        submission: input.submission,
        approval: input.approval,
        leadDispatch: {
          clientMessageId,
          sentAt: requirementChangeNow(),
          runtime: input.runtime,
          error: requirementChangeDetailText(detail),
        },
        error: null,
      };
      try {
        await writeRequirementChangeTicket(input.root, input.ticketRel, record);
      } catch (error) {
        diagnostic.error("requirement-change.ticket.write.failed", error, { requestId: input.requestId });
      }
      diagnostic.record("requirement-change.lead-dispatch-failed", {
        requestId: input.requestId,
        detail: requirementChangeDetailText(detail, 160),
      });
      return { ok: false, detail };
    };
    const listing = await requirementChangeListing(input.root, diagnostic);
    const leadRoleId = typeof listing?.primaryRoleId === "string" ? listing.primaryRoleId.trim() : "";
    if (leadRoleId === "") return fail("无法确定产品角色（primaryRoleId），已批准执行任务未投递");
    const text = buildRequirementChangeLeadExecutionTaskText({
      requestId: input.requestId,
      flowId: input.flowId,
      intentId: input.intentId,
      changeKind: input.baseRecord.changeKind,
      summary: input.baseRecord.summary,
      rationale: input.baseRecord.rationale,
      ...(input.baseRecord.impact !== null ? { impact: input.baseRecord.impact } : {}),
      ...(input.baseRecord.proposedIntentPatch !== null ? { proposedIntentPatch: input.baseRecord.proposedIntentPatch } : {}),
      ticketRelPath: input.ticketRel,
      approvalSource: input.approval.source,
      approvedAt: input.approval.decidedAt,
    });
    const startedAt = Date.now();
    const budget = (): number => Math.min(requirementChangeStageMs, Math.max(1, requirementChangeTotalMs - (Date.now() - startedAt)));
    let opened: Awaited<ReturnType<typeof manager.openBackground>>;
    try {
      const race = await withRequestAcceptanceDeadline(
        manager.openBackground({ projectRoot: input.root, roleId: leadRoleId, runtime: input.runtime }),
        budget(),
      );
      if (race.timedOut) return fail(`后台打开产品会话超时（约 ${Math.round((Date.now() - startedAt) / 1000)}s；可能仍在启动）`);
      opened = race.value;
    } catch (error) {
      return fail(`后台打开产品会话失败：${error instanceof Error ? error.message : String(error)}`);
    }
    if (!opened.ok) return fail(`后台打开产品会话失败：${opened.error ?? mainT("shared.common.unknownReason")}`);
    let sent: Awaited<ReturnType<typeof manager.sendBackground>>;
    try {
      const race = await withRequestAcceptanceDeadline(
        manager.sendBackground({
          projectRoot: input.root,
          roleId: leadRoleId,
          runtime: input.runtime,
          text,
          clientMessageId,
        }),
        budget(),
      );
      if (race.timedOut) return fail(`投递产品执行任务超时（约 ${Math.round((Date.now() - startedAt) / 1000)}s；可能已入队/已投递，请核对）`);
      sent = race.value;
    } catch (error) {
      return fail(`投递产品执行任务失败：${error instanceof Error ? error.message : String(error)}`);
    }
    if (!sent.ok) return fail(`投递产品执行任务失败：${sent.error ?? mainT("shared.common.unknownReason")}`);
    const record: RequirementChangeTicketRecord = {
      ...input.baseRecord,
      status: "approved",
      updatedAt: requirementChangeNow(),
      submission: input.submission,
      approval: input.approval,
      leadDispatch: {
        clientMessageId,
        sentAt: requirementChangeNow(),
        runtime: input.runtime,
        ...(sent.queued === true ? { queued: true } : {}),
        messageSha256: createHash("sha256").update(text).digest("hex"),
      },
      error: null,
    };
    try {
      await writeRequirementChangeTicket(input.root, input.ticketRel, record);
    } catch (error) {
      diagnostic.error("requirement-change.ticket.write.failed", error, { requestId: input.requestId });
    }
    diagnostic.record("requirement-change.lead-dispatched", {
      requestId: input.requestId,
      leadRoleId,
      queued: sent.queued === true,
    });
    return { ok: true };
  };

  const settleRequirementChangeDecision = async (input: {
    root: string;
    requester: string;
    runtime: RuntimeKind;
    requestId: string;
    ticketRel: string;
    baseRecord: RequirementChangeTicketRecord;
    submission: RequirementChangeTicketRecord["submission"];
    flowId: string;
    intentId: string;
    outcome: CustomerInputOutcome;
    /** 卡片已呈现（true ⇒ 审批结果需回执发起方；false ⇒ 工具回执即结果，不重复投递）。 */
    notifyInitiator: boolean;
  }): Promise<RequirementChangeSettlement> => {
    const diagnostic = createDiagnosticLogger({ component: "desktop.requirement-change", projectRoot: input.root, roleId: input.requester });
    const outcome = input.outcome;
    const selected =
      outcome.outcome === "answered" && Array.isArray(outcome.value.selected)
        ? [...outcome.value.selected]
        : [];
    // 判断代批如实归因：`judge:<engine>` 或 outcome.judge 审计出现 ⇒ `judge`；其余按客户（含旧通道）。
    const source: "customer" | "judge" =
      outcome.outcome === "answered" &&
      (outcome.judge !== undefined ||
        (typeof outcome.operatorId === "string" && outcome.operatorId.startsWith("judge:")))
        ? "judge"
        : "customer";
    const approved = outcome.outcome === "answered" && selected.includes("approve");
    const rejected = outcome.outcome === "answered" && selected.includes("reject");
    const reason =
      outcome.outcome === "answered"
        ? null
        : typeof outcome.reason === "string" && outcome.reason !== ""
          ? outcome.reason
          : null;
    const approval: RequirementChangeApprovalRecord = {
      outcome: approved ? "approved" : rejected ? "rejected" : "no-decision",
      source,
      selected,
      operatorId:
        outcome.outcome !== "unavailable" && typeof outcome.operatorId === "string" && outcome.operatorId !== ""
          ? outcome.operatorId
          : null,
      decidedAt: requirementChangeNow(),
      reason,
    };
    if (approved) {
      const record: RequirementChangeTicketRecord = {
        ...input.baseRecord,
        status: "approved",
        updatedAt: requirementChangeNow(),
        submission: input.submission,
        approval,
        leadDispatch: null,
        error: null,
      };
      try {
        await writeRequirementChangeTicket(input.root, input.ticketRel, record);
      } catch (error) {
        diagnostic.error("requirement-change.ticket.write.failed", error, { requestId: input.requestId });
      }
      diagnostic.record("requirement-change.approved", { requestId: input.requestId, source });
      const approvedText = mainT("main.requirementChange.approved", {
        flowId: input.flowId,
        intentId: input.intentId,
        requestId: input.requestId,
        source: requirementChangeApprovalSourceText(source),
      });
      emitRequirementChangeNote(input.root, input.requester, input.runtime, approvedText);
      const dispatched = await dispatchRequirementChangeLeadExecution({
        root: input.root,
        requester: input.requester,
        runtime: input.runtime,
        requestId: input.requestId,
        ticketRel: input.ticketRel,
        baseRecord: input.baseRecord,
        submission: input.submission,
        flowId: input.flowId,
        intentId: input.intentId,
        approval,
      });
      if (!dispatched.ok) {
        emitRequirementChangeNote(
          input.root,
          input.requester,
          input.runtime,
          `${approvedText}（已批准执行任务投递失败：${requirementChangeDetailText(dispatched.detail, 300)}；产品未确认收到，请核对后重试。）`,
        );
      }
      return { outcome: "approved", approval, detail: "" };
    }
    const detail = rejected
      ? `独立审批选择 reject（${requirementChangeApprovalSourceText(source)}）`
      : (reason ?? "未获明确结果（卡片取消/会话结束/通道不可用）");
    // 卡片从未呈现（应用拒发/通道不可用）：没有「审批结果」可记——票据只记失败原因；
    // 已呈现后的取消/未获结果则如实记录 no-decision（仍未批准）。
    const recordApproval = input.outcome.outcome === "answered" || input.notifyInitiator;
    const record: RequirementChangeTicketRecord = {
      ...input.baseRecord,
      status: rejected ? "rejected" : "failed",
      updatedAt: requirementChangeNow(),
      submission: input.submission,
      approval: recordApproval ? approval : null,
      leadDispatch: null,
      error: rejected ? null : requirementChangeDetailText(detail),
    };
    try {
      await writeRequirementChangeTicket(input.root, input.ticketRel, record);
    } catch (error) {
      diagnostic.error("requirement-change.ticket.write.failed", error, { requestId: input.requestId });
    }
    diagnostic.record("requirement-change.approval-failed", {
      requestId: input.requestId,
      outcome: approval.outcome,
      source,
    });
    if (input.notifyInitiator) {
      const receipt = mainT("main.requirementChange.approvalRejected", {
        flowId: input.flowId,
        intentId: input.intentId,
        requestId: input.requestId,
        detail,
      });
      void deliverRequirementChangeReceipt({
        root: input.root,
        requester: input.requester,
        runtime: input.runtime,
        text: receipt,
      });
    }
    return { outcome: approval.outcome, approval, detail };
  };

  /**
   * `request_requirement_change` 能力的项目入口（`requesterRoleId`/`runtime` 由会话注入端补入）。
   * 顺序：载荷二次校验 → 发起方白名单（统筹/提案）→ 意图/流程存在性 → 同 flow 待处理/在途去重 →
   * 票据 requested → 经发起方会话客户卡通道呈现 decision 审批卡 → 票据 dispatched + 系统行；
   * 审批结果异步结算（approved → 主理执行任务；rejected/未获结果 → 回执发起方）。
   * 任何一步失败都如实回执、不伪造；**提交 ≠ 批准**。
   */
  const requestRequirementChangeForProject = async (
    projectRoot: string,
    requesterRoleId: string,
    runtime: RuntimeKind,
    input: RequestRequirementChangeInput,
  ): Promise<RequestRequirementChangeResult> => {
    const root = typeof projectRoot === "string" ? projectRoot.trim() : "";
    const requester = typeof requesterRoleId === "string" ? requesterRoleId.trim() : "";
    const diagnostic = createDiagnosticLogger({ component: "desktop.requirement-change", projectRoot: root, roleId: requester });
    if (root === "") {
      diagnostic.record("requirement-change.invalid", { reasonCode: "missing-project-root" });
      return {
        ok: false,
        code: "unavailable",
        message: mainT("main.requirementChange.unavailable", { flowId: "?", detail: "缺少项目根，无法提交需求变更申请" }),
      };
    }
    const assessment = assessRequirementChangeRequest(input);
    if (!assessment.ok) {
      diagnostic.record("requirement-change.invalid", { reasonCode: "payload" });
      return { ok: false, code: "invalid", message: mainT("main.requirementChange.invalid", { detail: assessment.detail }) };
    }
    const flowId = assessment.flowId;
    const intentId = assessment.intentId;
    const taskId = assessment.taskId;
    // 显示/文案用有效 id（只给一个时按本仓约定互为对方；taskId-only 不伪造 intent/flow）。
    const effectiveFlowId = flowId ?? intentId ?? taskId!;
    const effectiveIntentId = intentId ?? flowId ?? taskId!;
    // 发起方白名单（客户纠正：仅统筹/提案可发起/持有审批卡；其他内置治理角色、项目角色不可）——
    // 在写任何票据/呈现任何卡之前 fail-closed（零票据、零卡、零投递）。
    const initiatorListing = await requirementChangeListing(root, diagnostic);
    if (initiatorListing === undefined) {
      diagnostic.record("requirement-change.rejected", { reasonCode: "listing-unavailable" });
      return {
        ok: false,
        code: "unavailable",
        message: mainT("main.requirementChange.unavailable", {
          flowId: effectiveFlowId,
          detail: "无法枚举项目角色，无法确认发起方；未提交、未呈现审批卡",
        }),
      };
    }
    if (!isRequirementChangeInitiator(initiatorListing, requester)) {
      diagnostic.record("requirement-change.rejected", { reasonCode: "initiator-not-allowed" });
      return {
        ok: false,
        code: "rejected",
        message: mainT("main.requirementChange.rejected", {
          flowId: effectiveFlowId,
          detail: "发起角色不在允许范围（仅运营/提案可发起需求变更审批卡）；未提交、未呈现审批卡",
        }),
      };
    }
    if (flowId !== undefined) {
      const flowRel = governanceFlowStatePath(flowId);
      if (!(await requirementChangeFileIsFile(path.join(root, ...flowRel.split("/"))))) {
        diagnostic.record("requirement-change.flow-not-found", { flowId });
        return {
          ok: false,
          code: "flow-not-found",
          message: mainT("main.requirementChange.flowNotFound", { flowId }),
          flowId,
          ...(intentId !== undefined ? { intentId } : {}),
        };
      }
    }
    if (intentId !== undefined) {
      const intentRel = intentArtifactPath(intentId);
      if (!(await requirementChangeFileIsFile(path.join(root, ...intentRel.split("/"))))) {
        diagnostic.record("requirement-change.intent-not-found", { intentId });
        return {
          ok: false,
          code: "intent-not-found",
          message: mainT("main.requirementChange.intentNotFound", { flowId: effectiveFlowId, intentId }),
          flowId: effectiveFlowId,
          intentId,
        };
      }
    }
    const requestId = requirementChangeRequestId({
      requestedBy: requester,
      ...(flowId !== undefined ? { flowId } : {}),
      ...(intentId !== undefined ? { intentId } : {}),
      ...(taskId !== undefined ? { taskId } : {}),
      changeKind: assessment.changeKind,
      summary: assessment.summary,
      rationale: assessment.rationale,
      ...(assessment.impact !== undefined ? { impact: assessment.impact } : {}),
      ...(assessment.proposedIntentPatch !== undefined ? { proposedIntentPatch: assessment.proposedIntentPatch } : {}),
    });
    const ticketRel = requirementChangeTicketRelPath(assessment.scopeKey, requestId);
    const alreadyDispatched = (existing: { requestId: string; status?: string }): RequestRequirementChangeResult => {
      diagnostic.record("requirement-change.already-dispatched", {
        requestId: existing.requestId,
        scopeKey: assessment.scopeKey,
      });
      // 已批准（主理正在执行意图变更）与仍在审批中分开说，避免「等待审批结果」误导。
      const suffix =
        existing.status === "approved"
          ? "（该申请已通过独立审批，产品正在执行意图变更；请等待修订通知，不重复提交。）"
          : "";
      return {
        ok: true,
        code: "already-dispatched",
        message:
          mainT("main.requirementChange.alreadyDispatched", {
            flowId: effectiveFlowId,
            intentId: effectiveIntentId,
            requestId: existing.requestId,
          }) + suffix,
        requestId: existing.requestId,
        flowId: effectiveFlowId,
        intentId: effectiveIntentId,
      };
    };
    const pending = await findPendingRequirementChange(root, assessment.scopeKey, diagnostic);
    if (pending !== undefined) return alreadyDispatched(pending);
    const inFlightKey = `${canonicalProjectRoot(root)}\u0000${assessment.scopeKey}`;
    const inFlightId = requirementChangeInFlight.get(inFlightKey);
    if (inFlightId !== undefined) return alreadyDispatched({ requestId: inFlightId });
    requirementChangeInFlight.set(inFlightKey, requestId);
    try {
      const existing = await readRequirementChangeTicket(root, ticketRel);
      const attempts =
        (existing.state === "ok" && typeof existing.record.attempts === "number" && Number.isFinite(existing.record.attempts)
          ? existing.record.attempts
          : 0) + 1;
      const at =
        existing.state === "ok" && typeof existing.record.at === "string" && existing.record.at !== ""
          ? existing.record.at
          : requirementChangeNow();
      const baseRecord: RequirementChangeTicketRecord = {
        schema: REQUIREMENT_CHANGE_TICKET_SCHEMA,
        requestId,
        requestedBy: requester,
        flowId: flowId ?? null,
        intentId: intentId ?? null,
        taskId: taskId ?? null,
        changeKind: assessment.changeKind,
        summary: assessment.summary,
        rationale: assessment.rationale,
        impact: assessment.impact ?? null,
        proposedIntentPatch: assessment.proposedIntentPatch ?? null,
        status: "requested",
        at,
        updatedAt: requirementChangeNow(),
        attempts,
        submission: null,
        approval: null,
        leadDispatch: null,
        error: null,
      };
      /** 审批卡/票据前置失败：写 failed 票据（可重试），如实回执；不呈现卡、不投递主理。 */
      const failBeforeCard = async (
        detail: string,
        code: "unavailable" | "rejected",
      ): Promise<RequestRequirementChangeResult> => {
        const record: RequirementChangeTicketRecord = {
          ...baseRecord,
          status: "failed",
          updatedAt: requirementChangeNow(),
          error: requirementChangeDetailText(detail),
        };
        try {
          await writeRequirementChangeTicket(root, ticketRel, record);
        } catch (error) {
          diagnostic.error("requirement-change.ticket.write.failed", error, { requestId, scopeKey: assessment.scopeKey });
        }
        diagnostic.record("requirement-change.failed", { requestId, code, scopeKey: assessment.scopeKey });
        return {
          ok: false,
          code,
          message:
            code === "rejected"
              ? mainT("main.requirementChange.rejected", { flowId: effectiveFlowId, detail })
              : mainT("main.requirementChange.unavailable", { flowId: effectiveFlowId, detail }),
          requestId,
          flowId: effectiveFlowId,
          intentId: effectiveIntentId,
        };
      };
      if (existing.state === "corrupt") {
        // 坏票据不当已提交；继续按新请求覆盖写（诊断保留原错误）。
        diagnostic.error("requirement-change.ticket.corrupt", new Error(existing.error), { requestId, scopeKey: assessment.scopeKey });
      }
      try {
        await writeRequirementChangeTicket(root, ticketRel, baseRecord);
      } catch (error) {
        diagnostic.error("requirement-change.ticket.write.failed", error, { requestId, scopeKey: assessment.scopeKey });
        return await failBeforeCard(
          `审计票据写入失败（${ticketRel}）：${error instanceof Error ? error.message : String(error)}；未提交、未呈现审批卡，可修复后重试`,
          "rejected",
        );
      }
      diagnostic.record("requirement-change.requested", {
        requestId,
        scopeKey: assessment.scopeKey,
        attempt: attempts,
      });
      const card = buildRequirementChangeApprovalCard({
        requestId,
        flowId: effectiveFlowId,
        intentId: effectiveIntentId,
        changeKind: assessment.changeKind,
        summary: assessment.summary,
        rationale: assessment.rationale,
        ...(assessment.impact !== undefined ? { impact: assessment.impact } : {}),
        ...(assessment.proposedIntentPatch !== undefined ? { proposedIntentPatch: assessment.proposedIntentPatch } : {}),
      });
      const decision = manager.requestRequirementChangeDecision({
        projectRoot: root,
        roleId: requester,
        runtime,
        request: card,
        metadata: { flowId: effectiveFlowId, cardKind: "decision", runtime, roleId: requester },
      });
      if (!decision.ok) {
        return await failBeforeCard(`需求变更审批卡通道不可用（${decision.error}）；未提交独立审批`, "unavailable");
      }
      const first = await decision.first;
      if (first.kind === "outcome") {
        // 未呈现即已结算（卡校验拒发 / 通道不可用 / 「替我决策」在呈现前代选）：工具回执即结果。
        const settlement = await settleRequirementChangeDecision({
          root,
          requester,
          runtime,
          requestId,
          ticketRel,
          baseRecord,
          submission: null,
          flowId: effectiveFlowId,
          intentId: effectiveIntentId,
          outcome: first.outcome,
          notifyInitiator: false,
        });
        if (settlement.outcome === "approved") {
          return {
            ok: true,
            code: "dispatched",
            message: mainT("main.requirementChange.approved", {
              flowId: effectiveFlowId,
              intentId: effectiveIntentId,
              requestId,
              source: requirementChangeApprovalSourceText(settlement.approval.source),
            }),
            requestId,
            flowId: effectiveFlowId,
            intentId: effectiveIntentId,
          };
        }
        const code = first.outcome.outcome === "unavailable" ? "unavailable" : "rejected";
        return {
          ok: false,
          code,
          message:
            code === "unavailable"
              ? mainT("main.requirementChange.unavailable", { flowId: effectiveFlowId, detail: settlement.detail })
              : mainT("main.requirementChange.rejected", { flowId: effectiveFlowId, detail: settlement.detail }),
          requestId,
          flowId: effectiveFlowId,
          intentId: effectiveIntentId,
        };
      }
      // 审批卡已呈现 ⇒ 进入独立审批（**不是批准**）：票据 dispatched + 系统行；审批结果异步结算。
      const submission: RequirementChangeTicketRecord["submission"] = {
        cardRoleId: requester,
        cardKind: "decision",
        options: ["approve", "reject"],
        recommended: "approve",
        submittedAt: requirementChangeNow(),
      };
      const dispatchedRecord: RequirementChangeTicketRecord = {
        ...baseRecord,
        status: "dispatched",
        updatedAt: requirementChangeNow(),
        submission,
      };
      let ticketWriteError: string | undefined;
      try {
        await writeRequirementChangeTicket(root, ticketRel, dispatchedRecord);
      } catch (error) {
        ticketWriteError = error instanceof Error ? error.message : String(error);
        diagnostic.error("requirement-change.ticket.write.failed", error, { requestId, scopeKey: assessment.scopeKey });
      }
      diagnostic.record("requirement-change.dispatched", {
        requestId,
        scopeKey: assessment.scopeKey,
        cardRoleId: requester,
      });
      // 用户可见系统行只落发起方聊天流；不弹客户卡、不写账本、不改写权。
      emitRequirementChangeNote(
        root,
        requester,
        runtime,
        mainT("main.requirementChange.systemLine", {
          flowId: effectiveFlowId,
          intentId: effectiveIntentId,
          requestId,
        }),
      );
      void decision.outcome
        .then((outcome) =>
          settleRequirementChangeDecision({
            root,
            requester,
            runtime,
            requestId,
            ticketRel,
            baseRecord,
            submission,
            flowId: effectiveFlowId,
            intentId: effectiveIntentId,
            outcome,
            notifyInitiator: true,
          }),
        )
        .catch((error) => {
          diagnostic.error("requirement-change.approval-handler.failed", error, {
            requestId,
            scopeKey: assessment.scopeKey,
          });
        });
      const dispatchedMessage = mainT("main.requirementChange.dispatched", {
        flowId: effectiveFlowId,
        intentId: effectiveIntentId,
        requestId,
      });
      return {
        ok: true,
        code: "dispatched",
        message:
          ticketWriteError !== undefined
            ? `${dispatchedMessage}（审计票据写入失败：${requirementChangeDetailText(ticketWriteError)}；审批卡已提交，请核对票据 ${ticketRel}。）`
            : dispatchedMessage,
        requestId,
        flowId: effectiveFlowId,
        intentId: effectiveIntentId,
      };
    } catch (error) {
      diagnostic.error("requirement-change.failed", error, { requestId, scopeKey: assessment.scopeKey });
      return {
        ok: false,
        code: "unavailable",
        message: mainT("main.requirementChange.unavailable", {
          flowId: effectiveFlowId,
          detail: `执行失败：${requirementChangeDetailText(error instanceof Error ? error.message : String(error))}；可能已部分执行，请核对票据 ${requestId}，不要重复请求`,
        }),
        requestId,
        flowId: effectiveFlowId,
        intentId: effectiveIntentId,
      };
    } finally {
      if (requirementChangeInFlight.get(inFlightKey) === requestId) requirementChangeInFlight.delete(inFlightKey);
    }
  };

  // 能力注入：缺省用本层实现；测试/宿主可整体替换（签名与 SessionManagerDeps 同形，项目根/发起角色/引擎由会话补入）。
  const requestRequirementChangeCapability = deps.requestRequirementChange ?? requestRequirementChangeForProject;

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
      if (runtime === "pi" && manager.hasBusyRuntime("pi")) throw new Error(mainT("main.interface.piBusy"));
      await applyRuntimeConfig(runtime, envFilePath, deps.piConfigEnv ?? process.env);
      pendingProfiles.delete(runtime);
    },
    createDemoAdapter: createDemoAdapterFn,
    buildProjectConfig: buildProjectConfigFn,
    // I1：界面 `governanceRecord` 与会话授权链共用同一载入器注入（缺省＝共享载入器真实实现）。
    loadEffectiveConfig: loadEffectiveConfigFn,
    getListing: (root) => listingCache.get(root),
    emitEvent: emitSessionEvent,
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
    // 2026-10-26 需求变更申请（request_requirement_change）：应用侧能力（SessionManager 仅对统筹/提案
    // 会话注入；其他内置治理角色、项目角色不注入；编排再按治理职能收口）。
    // **申请 ≠ 批准**：应用经发起方会话客户卡通道呈现 decision 审批卡（客户/判断 agent 审批）；
    // 主理不审批、只在批准后执行意图变更；不写 customer.decision/账本、不改写权。
    requestRequirementChange: requestRequirementChangeCapability,
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

  /** 系统行择路 runtime：显式 preferred → 活跃会话 → 本进程治理会话 → 持久化选择 → 真实事件弱提示。 */
  const resolveNoteRuntime = async (projectRoot: string, preferred?: RuntimeKind): Promise<RuntimeKind | undefined> => {
    if (preferred !== undefined) return preferred;
    const active = manager.activeRuntimeFor(projectRoot);
    if (active !== undefined) return active;
    const selected = manager.governanceRuntimeFor(projectRoot);
    if (selected !== undefined) return selected;
    const persisted = await readPersistedProjectRuntime(deps.runtimeStatePath, projectRoot);
    if (persisted !== undefined) return persisted;
    return runtimeHintsByProject.get(projectRoot);
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
            item.kind === "handback" ? mainT("main.interface.queueKind.handback") : item.kind === "dispatch" ? mainT("main.interface.queueKind.dispatch") : item.kind === "system" ? mainT("main.interface.queueKind.system") : mainT("main.interface.queueKind.message");
          group.lines.push(mainT("main.interface.queueRecoveredLine", { kind: kindLabel, summary: item.summary, roleId: item.roleId, runtime: item.runtime }));
          byProject.set(item.projectRoot, group);
        }
        for (const [projectRoot, group] of byProject) {
          const runtime = await resolveNoteRuntime(projectRoot, group.runtime);
          if (runtime === undefined) continue;
          emitLeadDeliveryNote(
            projectRoot,
            runtime,
            mainT("main.interface.queueRecovered", { count: group.lines.length, lines: group.lines.join("\n") }),
          );
        }
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.delivery" }).error("delivery.queue.restore.failed", error);
      }
    })();
    return deliveryRestorePromise;
  };

  async function persistenceCall<K extends keyof PersistenceValues>(operation: K, input: unknown): Promise<PersistenceReply<PersistenceValues[K]>> {
    const invalid = (code: 'INVALID_REQUEST' | 'PROJECT_NOT_ACTIVE'): PersistenceReply<PersistenceValues[K]> => ({ ok: false, version: 1, code, message: code === 'INVALID_REQUEST' ? mainT("shared.common.invalidSaveRequest") : mainT("main.interface.saveProjectNotActive") });
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

  /**
   * 后台任务 read/stop 共用的寻址校验（渲染进程输入不可信）：三元身份 + taskId 必须为非空字符串，
   * runtime 必须是已知引擎。缺任一 ⇒ undefined（本层合成 `invalid-request` 回执，不调会话管理器）。
   */
  const backgroundTaskTarget = (
    input: unknown,
  ): { projectRoot: string; runtime: RuntimeKind; roleId: string; taskId: string } | undefined => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
    const value = input as Record<string, unknown>;
    if (typeof value.projectRoot !== "string" || value.projectRoot === "") return undefined;
    if (typeof value.roleId !== "string" || value.roleId === "") return undefined;
    if (typeof value.taskId !== "string" || value.taskId === "") return undefined;
    if (!isRuntimeKind(value.runtime)) return undefined;
    return { projectRoot: value.projectRoot, runtime: value.runtime, roleId: value.roleId, taskId: value.taskId };
  };

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
        throw new Error(mainT("main.interface.missingProjectRoot"));
      }
      // 门禁引擎：唯一枚举来源，界面侧不重写解析。
      const generation = ++importSequence;
      const documentSequence = documentReader.beginListing(projectRoot);
      const listing = await listProjectFn(projectRoot);
      listingCache.set(listing.projectRoot, listing);
      // 2026-10-20 客户要求（重启后任务自动续跑）：启动/项目导入恢复持久投递队列并自动重投；
      // listProject 刷新后做一次**僵尸步骤自检**（有界、fire-and-forget、去重；不阻塞导入）。
      void restoreDeliveryQueuesOnce();
      // B 批（2026-10-28）：重放 tasks.jsonl——未投递任务重新入队（同 taskId/去重键；已投递/已报告只展示）。
      // 与投递队列恢复同属启动/导入时机；失败只诊断，不阻塞导入。
      void manager.restoreTasks(listing.projectRoot).then((report) => {
        if (report.restored > 0) {
          createDiagnosticLogger({ component: "desktop.interface", projectRoot: listing.projectRoot }).record("tasks.restored", { count: report.restored });
        }
      }).catch((error) => {
        createDiagnosticLogger({ component: "desktop.interface", projectRoot: listing.projectRoot }).error("tasks.restore.failed", error);
      });

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
        governanceRecord = { state: "invalid", reason: mainT("main.interface.pinCheckFailed", { detail: message }) };
      }

      const roles: RoleView[] = [];
      for (const r of listing.roles) {
        let changelog: { path: string; text: string } | null = null;
        let docs: DocsIndexEntry[] = [];
        let rootDocs: RoleRootDocEntry[] = [];
        // 内置角色没有角色目录：cardPath 为空串，读索引会误把项目根当角色目录递归。
        if (!r.builtIn && r.cardPath !== "") {
          try {
            const idx = await readRoleDocsIndex(listing.projectRoot, r.cardPath);
            changelog = idx.changelog;
            docs = idx.docs;
            rootDocs = idx.rootDocs;
          } catch {
            // 文档索引失败不致命：如实留空；只记元数据诊断（不记路径/正文）。
            createDiagnosticLogger({
              component: "desktop.interface",
              projectRoot: listing.projectRoot,
              roleId: r.roleId,
            }).record("role-docs.index.failed", { reasonCode: "exception" });
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
          rootDocs,
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
      // 根文档只作元数据装配；摘要诊断帮助定位索引/白名单问题（不记路径/正文）。
      createDiagnosticLogger({ component: "desktop.interface", projectRoot: listing.projectRoot }).record(
        "project.listing.root-docs",
        { count: roles.reduce((n, role) => n + (role.rootDocs?.length ?? 0), 0), ok: true },
      );
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

    // —— i18n B0（2026-10-23）：应用级语言偏好（preferences:get / preferences:set-locale 背后的纯逻辑）——
    async getPreferences(): Promise<PreferencesView> {
      return preferencesService.getView();
    },
    async setLocale(input: unknown): Promise<SetLocaleReply> {
      const record =
        input !== null && typeof input === "object" && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : undefined;
      const value = record?.locale;
      if (!isLocale(value)) {
        // 非法值：不改内存/文件、不广播；错误文案按**当前** locale 生成。
        return {
          ok: false,
          locale: preferencesService.getLocale(),
          error: mainI18n.t("preferences.error.invalidLocale"),
        };
      }
      const result = await preferencesService.setLocale(value);
      if (!result.ok) {
        // 非法（防御性重复校验）/持久化不可用/写失败：服务不改内存；这里如实回错误，不假装成功。
        const errorKey =
          result.error === "invalid-locale"
            ? "preferences.error.invalidLocale"
            : "preferences.error.saveFailed";
        return {
          ok: false,
          locale: result.locale,
          error: mainI18n.t(errorKey),
        };
      }
      // 先持久化成功，再更新 translator——切换后新生成文本用新语言；历史文本不追溯。
      mainI18n.setLocale(result.locale);
      refreshRecoveryPage();
      return { ok: true, locale: result.locale };
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
      if (!input || typeof input.projectRoot !== "string" || typeof input.roleId !== "string" || !isRuntimeKind(input.runtime)) return { ok: false, error: mainT("main.interface.sessionRequestInvalid") };
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
          return { ok: false, error: mainT("main.interface.imageNotSent", { detail: decoded.error }) };
        }
        const sniffed = sniffImageMime(decoded.buffer);
        if (sniffed === null) {
          return {
            ok: false,
            error: mainT("main.interface.imageNotSentUnsupported", { mimes: ALLOWED_IMAGE_MIMES.join(" / ") }),
          };
        }
        const v = validateImage(sniffed, decoded.buffer.length);
        if (!v.ok) {
          return { ok: false, error: mainT("main.interface.imageNotSent", { detail: v.error }) };
        }
        cleaned.push({ type: "image", data: typeof o.data === "string" ? o.data : "", mimeType: sniffed });
      }
      // 组**契约形状** `PromptOptions`（单一来源 `src/model/runtime.ts`）——之后整包同一引用透传。
      const opts: PromptOptions = { images: cleaned };
      return manager.send(text, opts, input?.target, input?.metadata);
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

    // —————— 会话级后台任务（2026-10-25，桌面任务面板）——————
    // 只做参数校验与转发：任务表/日志只存在于各会话内存（不缓存/不持久化），聚合与寻址在 SessionManager。
    // 错误一律回执 `{ok:false,...}`（不抛）；stop 的底层失败 reason 原样透传、绝不改写成成功。
    async listBackgroundTasks(input): Promise<BackgroundTasksListReply> {
      const projectRoot = input && typeof input.projectRoot === "string" ? input.projectRoot : "";
      if (projectRoot === "" || !isRuntimeKind(input?.runtime)) {
        return { ok: false, error: mainT("main.interface.sessionRequestInvalid") };
      }
      return manager.listBackgroundTasks(projectRoot, input.runtime);
    },

    async readBackgroundTask(input): Promise<BackgroundTaskReadReply> {
      const target = backgroundTaskTarget(input);
      if (target === undefined) return { ok: false, error: mainT("main.interface.sessionRequestInvalid") };
      const value = input as unknown as Record<string, unknown>;
      const stream = value.stream;
      if (stream !== undefined && stream !== "stdout" && stream !== "stderr" && stream !== "both") {
        return { ok: false, error: mainT("main.interface.sessionRequestInvalid") };
      }
      const tailLines = value.tailLines;
      if (
        tailLines !== undefined &&
        !(typeof tailLines === "number" && Number.isInteger(tailLines) && tailLines >= 1)
      ) {
        return { ok: false, error: mainT("main.interface.sessionRequestInvalid") };
      }
      return manager.readBackgroundTask({
        ...target,
        ...(stream !== undefined ? { stream } : {}),
        ...(tailLines !== undefined ? { tailLines } : {}),
      });
    },

    async stopBackgroundTask(input): Promise<BackgroundTaskStopReply> {
      const target = backgroundTaskTarget(input);
      if (target === undefined) {
        return { ok: false, reason: "unavailable", message: mainT("main.interface.sessionRequestInvalid") };
      }
      const force = (input as unknown as Record<string, unknown>).force;
      if (force !== undefined && typeof force !== "boolean") {
        return { ok: false, reason: "unavailable", message: mainT("main.interface.sessionRequestInvalid") };
      }
      return manager.stopBackgroundTask({ ...target, ...(force === true ? { force: true } : {}) });
    },
    // —————— B 批（2026-10-28）：任务/日志/终止重派（参数校验在本层；执行/持久化在 SessionManager）——————
    async listTasks(input): Promise<TaskListView> {
      const projectRoot = input && typeof input.projectRoot === "string" ? input.projectRoot : "";
      if (projectRoot === "") return { projectRoot: "", tasks: [], errors: 0, unclosed: 0 };
      return manager.listTasks(projectRoot);
    },
    async restoreTasks(input): Promise<TaskRestoreReport> {
      const projectRoot = input && typeof input.projectRoot === "string" ? input.projectRoot : "";
      if (projectRoot === "") return { restored: 0, skipped: 0, taskIds: [] };
      return manager.restoreTasks(projectRoot);
    },
    async readRoleActivityLog(input): Promise<{ ok: boolean; text?: string; message?: string }> {
      const projectRoot = input && typeof input.projectRoot === "string" ? input.projectRoot : "";
      const roleId = input && typeof input.roleId === "string" ? input.roleId.trim() : "";
      const since = input && typeof input.since === "string" ? input.since : undefined;
      const limit = input && typeof input.limit === "number" && Number.isInteger(input.limit) && input.limit >= 1 ? input.limit : undefined;
      if (projectRoot === "" || roleId === "") return { ok: false, message: mainT("main.interface.sessionRequestInvalid") };
      return manager.readRoleActivityLog(projectRoot, { roleId, ...(since !== undefined ? { since } : {}), ...(limit !== undefined ? { limit } : {}) });
    },
    async terminateRoleRun(input): Promise<TerminateRoleRunResult> {
      const projectRoot = input && typeof input.projectRoot === "string" ? input.projectRoot : "";
      const roleId = input && typeof input.roleId === "string" ? input.roleId : "";
      if (projectRoot === "" || roleId === "" || !isRuntimeKind(input?.runtime)) {
        return {
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
          message: mainT("main.interface.sessionRequestInvalid"),
        };
      }
      return manager.terminateRoleRun({
        projectRoot,
        roleId,
        runtime: input.runtime,
        ...(typeof input.taskId === "string" && input.taskId !== "" ? { taskId: input.taskId } : {}),
        ...(input.force === true ? { force: true } : {}),
      });
    },
    async redispatchTask(input): Promise<RedispatchTaskResult> {
      const projectRoot = input && typeof input.projectRoot === "string" ? input.projectRoot : "";
      const taskId = input && typeof input.taskId === "string" ? input.taskId : "";
      if (projectRoot === "" || taskId === "") {
        return { ok: false, safety: "unsafe", autoAllowed: false, reasons: ["参数非法"], message: mainT("main.interface.sessionRequestInvalid") };
      }
      return manager.redispatchTask({
        projectRoot,
        taskId,
        ...(typeof input.to === "string" && input.to !== "" ? { to: input.to } : {}),
      });
    },
    async closeTask(input): Promise<CloseTaskResult> {
      const projectRoot = input && typeof input.projectRoot === "string" ? input.projectRoot : "";
      const taskId = input && typeof input.taskId === "string" ? input.taskId : "";
      const outcome = input && (input.outcome === "accepted" || input.outcome === "rework" || input.outcome === "rejected") ? input.outcome : undefined;
      if (projectRoot === "" || taskId === "" || outcome === undefined) {
        return { ok: false, taskId, message: mainT("main.interface.sessionRequestInvalid") };
      }
      return manager.closeTask({
        projectRoot,
        taskId,
        outcome,
        ...(typeof input.note === "string" && input.note !== "" ? { note: input.note } : {}),
      });
    },
    async getSessionHistory(input) { const history = await getSessionHistory(input, { credentialEnvNames: [...(deps.runtimeOptions?.extraCredentialEnvVars ?? []), ...(deps.runtimeOptions?.apiKeyEnvVar ? [deps.runtimeOptions.apiKeyEnvVar] : [])] }); manager.registerPersistenceHistory(history); return history; },
    async getRuntimeConfig(runtime) {
      return getRuntimeConfig(runtime, { envPath: envFilePath, env: deps.piConfigEnv, revision: manager.profileRevision(runtime), application: application(runtime) });
    },
    async saveRuntimeConfig(input) {
      if (!input || !isRuntimeKind(input.runtime)) return { ok: false, runtime: "demo", appliedKeys: [], revision: 0, application: "current", error: mainT("main.common.unknownRuntime") };
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
        return { ok: false, error: mainT("main.interface.linkScheme") };
      }
      if (url.length > 2048) {
        return { ok: false, error: mainT("main.interface.linkTooLong") };
      }
      if (!deps.openExternalFn) {
        return { ok: false, error: mainT("main.interface.externalOpenUnwired") };
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
        return { ok: false, error: mainT("main.interface.pickImageUnwired") };
      }
      let picked: { name: string; dataBase64: string } | null;
      try {
        picked = await fn();
      } catch (err) {
        return { ok: false, error: mainT("main.interface.readImageFailed", { detail: err instanceof Error ? err.message : String(err) }) };
      }
      if (picked === null) return { ok: true, cancelled: true };
      const decoded = decodeImageBase64(picked.dataBase64);
      if (!decoded.ok) return { ok: false, error: decoded.error };
      const sniffed = sniffImageMime(decoded.buffer);
      if (sniffed === null) {
        return { ok: false, error: mainT("main.interface.imageUnsupported", { mimes: ALLOWED_IMAGE_MIMES.join(" / ") }) };
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
        return { ok: false, error: mainT("main.interface.imageUnsupportedShort", { mimes: ALLOWED_IMAGE_MIMES.join(" / ") }) };
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
