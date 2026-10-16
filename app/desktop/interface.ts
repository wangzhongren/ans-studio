import type { PersistenceReply, PersistenceValues, PersistenceUpdated, PersistenceScope } from "./session.ts";
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
import type { ProjectConfig } from "../../src/model/role.ts";
// 会话事件流类型：编排把 `RoleSessionHandle.events()` 放宽为 `OrchestrationEvent`（既有 `SessionEvent`
// + 编排在 `settled` 时追加的 `handback` 回交事件，设计 §10.8）。外推时套上 `roleId` 信封
// （`SessionEventEnvelope`，B-2）——**类型从编排/本角色只读导入、不复制形状**。
import type { WriteGate, RuntimeAdapter, ShellGate, OperatorChannelFn, CustomerInputFn, DispatchTaskFn, PromptImage, PromptOptions } from "../../src/model/runtime.ts";

import { listProject as realListProject } from "../../src/service/role/resolve-role.ts";
import {
  openRoleSession as realOpenRoleSession,
  createPiAdapterFactory as realCreatePiAdapterFactory,
  createRuntimeAdapterFactory as realCreateRuntimeAdapterFactory,
  type RuntimeAdapterFactoryBuilder, type RuntimeAdapterFactoryOptions,
} from "../../src/pipeline/orchestration/run-role.ts";
import { createChatDemoAdapter } from "./chat-adapter.ts";

import {
  buildProjectConfig as realBuildProjectConfig,
  readRoleDocsIndex,
  projectDocumentCandidates,
  type DocsIndexEntry,
} from "./project.ts";
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
// su 只读档（客户裁定 2026-10-12：「su 也要有 shell，但是只读」）：只读档装配选项形状的**单一来源**在编排
// （`shell-arming.ts::AssembleReadonlyShellGateOptions`）——只读导入其类型（运行期擦除），本层不另立第二形状。
import type { AssembleReadonlyShellGateOptions } from "../../src/pipeline/orchestration/shell-arming.ts";
// 客户确认制交互（A-5）：桌面侧的客户通道形状（带角色上下文）——本层只透传，实现在 `customer-input.ts`。
import type { DesktopCustomerInputFn } from "./customer-input.ts";
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
import { getSessionHistory, type SessionHistoryView } from "./runtime-history.ts";
import type { RuntimeKind } from "../../src/model/runtime.ts";

export interface RoleView {
  readonly group?: string;
  readonly groupDuty?: string;
  roleId: string;
  cardPath: string;
  boundaryPath: string;
  cardText: string;
  boundary: BoundarySection1;
  /** 内置治理角色（su）：无角色目录、无 docs 索引。 */
  builtIn: boolean;
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
   * **主入口角色 id**（= 门禁引擎 `listProject` 给出的 `primaryRoleId`，内置治理角色 su）。
   * **原样转自门禁引擎**（单一来源）；渲染侧据此设主位/默认选中，**不得硬编码 "su"**（§10.7）。
   */
  primaryRoleId: string;
}

/** 选图结果（K-2）：`image.dataBase64` 供渲染侧预览；`cancelled` 表示用户取消（**不是失败**）。 */
export interface PickImageResult {
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
      project: ProjectConfig;
      taskId?: string;
      scope?: undefined;
      /** 客户确认制交互通道（A-1/A-3）：仅内置治理角色（su）会话注入（见 session.ts）。 */
      customerInput?: CustomerInputFn;
      /** 派发任务能力（H-1）：仅内置治理角色（su）会话注入（见 session.ts::routeDispatch）。 */
      dispatchTask?: DispatchTaskFn;
      /** G-2/W5（2026-10-16 客户批准）：恢复提议能力（仅 su 注入；形状＝契约家，编排 O1 透传）。 */
      proposeRecovery?: import("../../src/common/编排/watchdog.ts").ProposeRecoveryFn;
      /** G-2/W1：role_status / session_tail 数据源（仅 su 注入；形状＝契约家）。 */
      roleStatus?: import("../../src/common/编排/watchdog.ts").RoleStatusFn;
      sessionTail?: import("../../src/common/编排/watchdog.ts").SessionTailFn;
      /** G-4/I3（2026-10-16 客户批准）：技能安装/卸载能力（仅 su 注入；形状＝契约家 `model/runtime.ts`）。
       *  编排透传（`AdapterCapabilities` 同名字段）落地前被其静默忽略——桌面侧透传先就位（H-1 先例）。 */
      installSkill?: import("../../src/model/runtime.ts").InstallSkillFn;
      uninstallSkill?: import("../../src/model/runtime.ts").UninstallSkillFn;
      /** (a) 操作者确认通道（I-1 arm）：经本层透传（**仅项目角色**消费——见 session.ts）。 */
      shellOperatorChannel?: DesktopOperatorChannelFn;
      /** (c) 规则集实件（I-1 补丁，2026-10-12）：经本层透传（**仅项目角色**消费——与 (a) 同判据走三层链）。 */
      shellArming?: DesktopShellArming;
      /** **su 只读档（客户裁定 2026-10-12）**：经本层透传（**仅内置治理角色（su）**消费——session.ts
       *  复用同一份 (c) 实件给出；编排装配只读档 ShellGate，su 的 `run_shell` 只执行 (c) 只读白名单）。 */
      shellReadonly?: Omit<AssembleReadonlyShellGateOptions, "project">;
    },
    deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter },
  ) => Promise<RoleSessionHandle>;
  createRuntimeAdapterFactoryFn?: RuntimeAdapterFactoryBuilder;
  runtimeOptions?: RuntimeAdapterFactoryOptions;
  createPiAdapterFactoryFn?: (project: ProjectConfig, shellGate?: ShellGate) => (gate: WriteGate) => RuntimeAdapter;
  createDemoAdapterFn?: (opts: { gate: WriteGate; boundary: BoundarySection1 }) => RuntimeAdapter;
  buildProjectConfigFn?: typeof realBuildProjectConfig;
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
   * **(a) 操作者确认通道**（I-1，2026-10-12 arm）——交付编排装配 (c)/(b)/(a) `ShellGate`
   * （`buildShellGate` 的 `operatorChannel`）。**只对项目角色生效**（su **不接 (b)/(a)**——审读者不给自己
   * 开闸：不自审、不弹框；su 的 shell 走只读档 `shellReadonly`，见 session.ts 的 `role.builtIn` 判据）。
   * 主进程用 `createDesktopOperatorChannel`（应用内确认卡：命令原文 + 放行/拒绝，拒绝为默认与取消项）
   * 构造后注入；**测试/e2e 可注入替身**。
   */
  shellOperatorChannel?: DesktopOperatorChannelFn;
  /**
   * **(c) 规则集实件（I-1 补丁，2026-10-12 客户重发授权）**——与 `shellOperatorChannel` **同一透传面**：
   * 主进程 arm 时经 `operator-channel.ts::buildDesktopShellArming()` 构造（**只读导入**门禁引擎经 Service
   * 公开出口的 `classifyShell`/`defaultShellRules`——不复制实现）；构造/加载失败 ⇒ `undefined` ⇒
   * **不 arm**（主进程同时撤下 (a) 通道——`run_shell` 不注册，fail-closed）。**项目角色**走向上三层链；
   * **内置治理角色（su）**由 session.ts 用**同一份实件**经 `shellReadonly` 装配**只读档**
   * （客户裁定 2026-10-12——单一来源，两边永不漂移）。**测试/e2e 可注入替身（桩件）**。
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
  /** 点角色即开：直接建立/续接与该角色的会话（无确认框；B-2 起切换不再结束旧会话）。 */
  openSession(input: SessionOpenRequest): Promise<OpenResult>;
  /**
   * 发送一轮消息；开启后可反复调用（多轮聊天，不再确认）。
   * **P0-1（2026-10-13 客户批准）**：`images` 为可选图片载荷（渲染侧 base64 块）——**渲染进程报的图
   * 一律不可信**：本层按**真实字节重校验**（base64 严格解码 → 魔数嗅探定类型 → ≤5MB），全过才组
   * `PromptOptions` 下发；任一张不合格 ⇒ **整条拒发**（fail-closed：绝不「丢图发文字」让客户以为图已送达）。
   */
  sendSession(input: { text: string; images?: unknown; target?: SessionTarget; metadata?: SessionMessageMetadata }): Promise<SendResult>;
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
 * 构造桌面 Interface。持有枚举缓存供会话构造 ProjectConfig，并托管 SessionManager。
 */
export function createDesktopInterface(deps: DesktopDeps): DesktopInterface {
  const listProjectFn = deps.listProjectFn ?? realListProject;
  const openRoleSessionFn = deps.openRoleSessionFn ?? realOpenRoleSession;
  const createPiAdapterFactoryFn = deps.createPiAdapterFactoryFn ?? realCreatePiAdapterFactory;
  const createDemoAdapterFn = deps.createDemoAdapterFn ?? createChatDemoAdapter;
  const buildProjectConfigFn = deps.buildProjectConfigFn ?? realBuildProjectConfig;
  // Pi 配置面板：函数与目标路径均可注入（**测试/e2e 必须注入临时 `.env`**，绝不碰真实仓库根 `.env`）。
  const getPiConfigFn = deps.getPiConfigFn ?? realGetPiConfig;
  const savePiConfigFn = deps.savePiConfigFn ?? realSavePiConfig;
  const envFilePath = deps.envFilePath ?? resolveRepoEnvPath();

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

  // 会话事件外推：先原样转发（主进程推 `session:event`；B-2 起为**带 `roleId` 信封**的 `SessionEventEnvelope`）；
  // 再在「**主入口角色**一轮结束（`settled`）」时触发「项目可能已变」信号（→ 主进程推 `project:changed` →
  // 渲染侧重取枚举，左树随 su 建角色而长出，§10.3）。判据取**信封里的角色**（多会话并存后不能再看
  // 「默认活动的那个是谁」）。本层只转达信号，**不判定**写入是否发生（判定唯一来自门禁引擎）。
  const emitSessionEvent = (envelope: SessionEventEnvelope): void => {
    deps.emitEvent(envelope);
    if (envelope.event.kind === "settled" && isPrimaryRole(envelope.projectRoot, envelope.roleId)) {
      deps.emitProjectChanged?.();
      // O-1（2026-10-12）：su 一轮结束 = 「边界可能刚被 su 改过」的**可信时机**——扫一遍活会话的边界快照，
      // 陈旧者作废重建（内部逐会话隔离、绝不上抛；在跑的轮次跳过）。fire-and-forget，不阻塞事件外推。
      void manager.refreshStaleBoundaries();
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
      ...(deps.watchdogOptions ?? {}),
    });
  } catch (error) {
    createDiagnosticLogger({ component: "desktop.watchdog" }).error("watchdog.failed", error);
    watchdogService = undefined;
  }

  const manager = new SessionManager({
    openRoleSession: openRoleSessionFn,
    createPiAdapterFactory: createPiAdapterFactoryFn,
    createRuntimeAdapterFactory: runtimeFactory,
    runtimeOptions: deps.runtimeOptions,
    prepareRuntimeProfile: async (runtime) => {
      if (!pendingProfiles.has(runtime)) return;
      if (runtime === "pi" && manager.hasBusyRuntime("pi")) throw new Error("Pi 的旧轮次仍在执行，新配置将在其结束后应用。消息可继续排队。");
      await applyRuntimeConfig(runtime, envFilePath, deps.piConfigEnv ?? process.env);
      pendingProfiles.delete(runtime);
    },
    createDemoAdapter: createDemoAdapterFn,
    buildProjectConfig: buildProjectConfigFn,
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
    // G-2/W5：恢复确认卡通道（缺省 ⇒ 恢复提议「未接线、未获执行」如实回执——fail-closed）。
    recoveryConfirm: deps.recoveryConfirm,
    // G-2/W1：看护的观察转发（settled/命令超时/真实活动）与只读统计；看护缺席 ⇒ 不转发（一切照旧）。
    watchdogObserver: watchdogService !== undefined ? (root, observation) => watchdogService!.observe(root, observation) : undefined,
    watchdogPendingConfirmations: deps.watchdogPendingSnapshot,
    watchdogStats: watchdogService !== undefined ? (root) => watchdogService!.stats(root) : undefined,
    now: deps.watchdogOptions?.now,
    // 首轮寻址修复（2026-10-13 真机 bootstrap J-1 缺陷）：派发路由缓存 miss 时**实时重枚举一次**——
    // 与界面 listProject 同一路径（同一 listProjectFn）、刷**同一份**共享缓存（后续 openInternal 自动
    // 开会话读的也是它）。全新空项目 bootstrap 首轮：su 建好角色后同一轮内派发即可寻址。
    refreshListing: async (root: string) => {
      const fresh = await listProjectFn(root);
      listingCache.set(fresh.projectRoot, fresh);
    },
  });

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
        roles.push(roleView);
      }
      if (generation === importSequence) importedProjectRoot = listing.projectRoot;
      const documentListing = documentReader.updateListing(documentSequence, listing.projectRoot, roles.map(projectDocumentCandidates));
      for (const role of roles) role.documents = documentListing.documents[role.roleId] ?? [];
      return {
        ...(documentListing.documentScope ? { documentScope: documentListing.documentScope } : {}),
        ...(documentListing.documentReadUnavailable ? { documentReadUnavailable: documentListing.documentReadUnavailable } : {}),
        projectRoot: listing.projectRoot,
        roles,
        warnings: listing.warnings,
        // 原样转自门禁引擎（单一来源）：hasRoles 供「尚未 bootstrap」判断、primaryRoleId 供主位/默认选中。
        hasRoles: listing.hasRoles,
        primaryRoleId: listing.primaryRoleId,
      };
    },

    async openSession(input): Promise<OpenResult> {
      if (!input || typeof input.projectRoot !== "string" || typeof input.roleId !== "string" || !isRuntimeKind(input.runtime)) return { ok: false, error: "会话请求须指定项目、角色与运行时。" };
      return manager.open(input);
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
