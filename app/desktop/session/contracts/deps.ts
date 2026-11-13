// app/desktop/session/contracts/deps.ts
// B1（2026-11-13，session.ts 重构；方案 §5 B1）：`SessionManagerDeps` 装配契约（L0）。
// 声明体自 app/desktop/session.ts **逐字搬移**（仅 import/导出适配；内联 `import("…")` 的相对路径随目录调整）。
// 依赖规则：contracts 只可依赖 src/model 与基础类型（含同目录 contracts 文件），不得导入 shared/feature。

import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type {
  ActivateRoleDocumentsFn, ChiefDecisionExecutionContext, CloseCreatedTaskFn, CompleteTeamPlanFn, ContractCheckFn,
  CustomerInputFn, CustomerInputMetadata, CustomerInputRequest, DecidePendingRequestFn, DispatchTaskFn, DocFormatFn,
  EvidenceCheckFn, GitCandidateFn, GitPublishFn, GitQueryFn, GovernanceJudgeFn, InstallMcpFn, InstallSkillFn,
  NetworkGate, OperatorChannelFn, ProjectNoteFn, ProjectStateFn, RequestRequirementChangeFn, RequestRequirementChangeInput,
  RequestRequirementChangeResult, RequestStableWriteFn, RequestVersionDecisionFn, RuntimeAdapter, SelectRunChangeFn,
  ShellEscalationPresentFn, ShellGate, ShellJudgeFn, SubmitRefactorFn, SubmitVersionChangeFn, UninstallMcpFn,
  UninstallSkillFn, ViewImageFn, WriteGate,
} from "../../../../src/model/runtime.ts";
import type { AssembleOperatorShellGateOptions, AssembleReadonlyShellGateOptions, RoutineShellPolicy } from "../../../../src/pipeline/orchestration/shell-arming.ts";
import type { RoleSessionHandle, RuntimeAdapterFactory, RuntimeAdapterFactoryBuilder, RuntimeAdapterFactoryOptions, TaskGitShellRuntimeInput } from "../../../../src/pipeline/orchestration/run-role.ts";
import type { createDirectiveInterpreter as realCreateDirectiveInterpreter } from "../../../../src/pipeline/orchestration/govern-session.ts";
import type { LoadConfigOptions, LoadedConfig } from "../../../../src/common/shared/config-loader.ts";
import type { ProjectConfig } from "../../../../src/model/role.ts";
import type { Acceptance } from "../../../../src/model/boundary.ts";
import type { ProjectListing } from "../../../../src/service/role/resolve-role.ts";
import type { RequestDownloadFn } from "../../../../src/model/download.ts";
import type { StableWritePermit } from "../../../../src/model/version-change.ts";
import type { TakeDownloadDirectiveFn } from "../../../../src/pipeline/orchestration/customer-directive.ts";
import type { DownloadRequestOptions, DownloadRequestRuntime } from "../../../../src/pipeline/orchestration/download-request.ts";
import type { ChiefDecisionBasis, DesktopCustomerInputFn } from "../../customer-input.ts";
import type { DesktopOperatorChannelFn, DesktopShellArming } from "../../operator-channel.ts";
import type { VersionChangeStack } from "../../version-change.ts";
import type { WatchdogObservation } from "../../watchdog.ts";
import type { RoleStatusFn, SessionTailFn } from "../../../../src/common/编排/watchdog.ts";
import type { NativeProjectRegistration } from "./tasks.ts";
import type { PersistenceUpdated } from "./persistence.ts";
import type { OpenResult, SessionEventEnvelope } from "./session-types.ts";

export interface SessionManagerDeps {
  /** Native selection + successful same-root listing only; never renderer/model metadata. */
  getRegisteredProjectLifecycle?: (projectRoot: string) => NativeProjectRegistration | undefined;
  prepareChiefDecisionEvidence?: (input: {
    projectRoot: string; originRoleId: string; request: CustomerInputRequest; metadata?: CustomerInputMetadata;
  }) => Promise<ChiefDecisionBasis>;

  /** 建会话（缺省为编排的 openRoleSession；注入以便单测）。入参形状镜像编排当前的公开输入
   *  （`customerInput`/`autoRepin`；`genesisFinalize`/`operatorChannel` 随 A-4 已删）。 */
  openRoleSession: (
    input: {
      roleId: string;
      project: ProjectConfig;
      runtime?: RuntimeKind;
      chiefDecisionContext?: ChiefDecisionExecutionContext;
      decidePendingRequest?: DecidePendingRequestFn;
      routineShellPolicy?: RoutineShellPolicy;
      taskId?: string;
      scope?: undefined;
      /**
       * **T3 B4.2（2026-11-10，AC-21 / T-09）：fixed 会话的任务级 Git 写注入位**——
       * `{ classifyShellDetailed, port }`（分类器 = 门禁引擎 Service 出口同一函数引用；端口 = 桌面真实
       * Git，`acquireCriticalSection` 与 B3 发布合并同一把项目级锁）。**仅 fixed 会话**由本层注入；
       * legacy 会话不传（字段缺席、行为逐字不变）。本层**不传** taskId/写集事实——scope 由编排从
       * `task.created` + basis/`change.scope-decided` 解析（桌面不采信模型自报）；不可解析 ⇒ 编排不注入
       * scope ⇒ Git 写一律拒（fail-closed）。
       */
      taskGit?: TaskGitShellRuntimeInput;
      /** **客户确认制交互通道**（A-1/A-3）：仅内置治理角色（su）会话注入（见 SessionManager.open）。 */
      customerInput?: CustomerInputFn;
      /** **下载申请能力**（2026-11-04 download-requests W-1）：每会话注入；未注入 ⇒ `request_download` 不注册。 */
      requestDownload?: RequestDownloadFn;
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
      /** 2026-11-02（全局任务状态）：`project_state` 只读能力；全部内置治理角色注入（含旧 su）。 */
      projectState?: ProjectStateFn;
      /** 2026-11-02：`project_note` 受控备注能力；仅 trio chief 注入。 */
      projectNote?: ProjectNoteFn;
      /** 2026-11-02：`request_version_decision` 版本决策能力；仅 trio chief 注入。 */
      requestVersionDecision?: RequestVersionDecisionFn;
      /** **role_status 数据源**（G-2/W1，仅 chief/su 注入；形状＝契约家 `RoleStatusFn`）。 */
      roleStatus?: RoleStatusFn;
      /** **contract_check 只读数据源**（3.2；所有角色注入）。 */
      contractCheck?: ContractCheckFn;
      /** **doc_format 只读数据源**（2026-11-09 文档格式权威说明；所有角色注入；`contractCheck` 相邻）。 */
      docFormat?: DocFormatFn;
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
      /** **升级卡呈现端**（2026-10-31 shell 判拒升级方案 v1.3 §6.4）：本层按每会话包装后透传；
       *  缺省 ⇒ 不传 ⇒ 编排不创建 registry、`request_shell_escalation` 不注册。 */
      shellEscalationPresenter?: ShellEscalationPresentFn;
      /**
       * **stable 写入一次性许可**（2026-11-04 trunk-amendment-model D1/F16）：run-role gate 的
       * **同步候选 permit**；`stableWriteDecision` 仍以 C2b 已安装许可快照为唯一权威。缺省 ⇒
       * 编排保留既有确认制路径（S3 分阶段接线），不新增无确认直写。
       */
      stablePermitOf?: (relPath: string) => StableWritePermit | undefined;
      /**
       * **Batch 3.5 / C1d：三提交能力**（`openRoleSession` 按会话角色门控后转交适配器；注入才注册）：
       * · `submitVersionChange`：product/rapporteur；`submitRefactor`/`requestStableWrite`：convener；
       * · 工具只提交请求，不批准/不发卡/不签发许可（客户主权）。未注入 ⇒ 工具不存在（fail-closed）。
       */
      gitQuery?: GitQueryFn;
      gitCandidate?: GitCandidateFn;
      gitPublish?: GitPublishFn;
      selectRunChange?: SelectRunChangeFn;
      completeTeamPlan?: CompleteTeamPlanFn;
      activateRoleDocuments?: ActivateRoleDocumentsFn;
      closeCreatedTask?: CloseCreatedTaskFn;
      submitVersionChange?: SubmitVersionChangeFn;
      submitRefactor?: SubmitRefactorFn;
      requestStableWrite?: RequestStableWriteFn;
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
  /**
   * **下载运行时工厂**（2026-11-04 download-requests C1/F2）：B1 冻结的每会话运行时
   * `createDownloadRequestRuntime(options)`；缺省由 Interface 注入真实实现，测试可注入桩件。
   * 每会话一份（绑定 roleId/runtime/present/takeDownloadDirective/appVersion）；不按项目缓存。
   */
  createDownloadRuntime?: (options: DownloadRequestOptions) => DownloadRequestRuntime;
  /** G8 A epoch 所需应用版本（`app/main.ts` 传 `app.getVersion()`）；缺失 ⇒ 不注入下载能力（fail-closed）。 */
  downloadAppVersion?: string;
  /**
   * **下载预授权消费者读取**（R3/F13）：由 Interface 从既有 `directiveInput` 的窄访问器取得
   * （同一项目 `CustomerDirectiveRuntime.takeDownloadDirective`，不新建第二运行时/账本）。
   * 缺省/返回 undefined ⇒ 不注入下载能力（fail-closed）。
   */
  getDownloadDirectiveConsumer?: (projectRoot: string) => TakeDownloadDirectiveFn | undefined;
  /**
   * **客户授权平面自然语言解释器工厂**（2026-11-04 客户直修）：缺省经编排 Pipeline 公共出口
   * `govern-session.ts::createDirectiveInterpreter`（桌面不直接导入私有 `common/编排/`）。
   * 与两个 judge 同一套 runtimeOptions/adapter 工厂；缺省真实实现，测试可注入桩件。
   */
  createDirectiveInterpreter?: typeof realCreateDirectiveInterpreter;
  prepareRuntimeProfile?: (runtime: RuntimeKind) => Promise<void>;
  createPiAdapterFactory: (
    project: ProjectConfig,
    shellGate?: ShellGate,
  ) => (gate: WriteGate) => RuntimeAdapter;
  createDemoAdapter: (opts: { gate: WriteGate; boundary: import("../../../../src/model/boundary.ts").BoundarySection1 }) => RuntimeAdapter;
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
     *  与入队即定格的全文 `full`——**与 summaries 同源**，不另造数据源；G-2 起 `kind` 含第四类 `system`）。
     *  P0（2026-10-30）：`ageMs` = 该条等待时长（显示「为什么没动」）。 */
    queue: { kind: string; sourceRoleId: string; summary: string; at: string; id: string; full: string; ageMs: number }[];
    /** **正在跑的那条投递**（若该轮由队列投递开跑且未结束）；null = 无（直接 send 的一轮不属于队列条目）。 */
    running: { kind: string; sourceRoleId: string; summary: string; at: string; ageMs?: number } | null;
    /** **P0 队列可见性（2026-10-30）**：队首类别（空队列 ⇒ null）、阻塞原因、当前回合 id。
     *  客户/界面据此看出「为什么没动」；`origin-missing` = 忙态无在跑回合（停止可复位）。 */
    headKind?: string | null;
    blockedReason?: "target-busy" | "origin-missing" | "session-closed" | "network" | null;
    activeTurnId?: string | null;
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
   * **升级卡呈现端**（2026-10-31 shell 判拒升级方案 v1.3 §6.4）：应用级 presenter（主进程每窗口
   * `createShellEscalationPresenter` 构造）；本层按**每会话**包装——并入会话生命周期（`lifetime`：会话
   * 终止/重建/dispose）与当前轮（`turn`：轮次停止/中止）信号后透传，使挂起升级卡即时失效（默认拒绝，
   * fail-closed）。缺省 ⇒ 不注入 ⇒ 编排不创建 registry、`request_shell_escalation` 不注册。
   */
  shellEscalationPresenter?: ShellEscalationPresentFn;
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
   * **版本变更/冻结/stable/重构/trunk 桌面栈**（2026-11-04 trunk-amendment-model D1）：
   * 由 Interface 每项目构建并注入；缺省 ⇒ 本层不注入 `stablePermitOf`/不接 appointment-write 钩子
   * （能力缺席 = fail-closed，旧行为）。本层只调用其公开方法，不做冻结/许可/trunk 判定。
   */
  getVersionChangeStack?: (projectRoot: string) => VersionChangeStack | undefined;
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
  watchdogStats?: (projectRoot: string) => import("../../watchdog.ts").WatchdogStats | undefined;
  /**
   * **投递队列持久化文件路径**（2026-10-20 客户要求：应用重启后任务自动续跑，不是只给 Lead 提示）。
   * 由 Interface 提供（`<userData>/ans/delivery-queue.json`）——**绝不写项目文件、不写 `.env`**。
   * 缺省 ⇒ 不持久化（旧行为零变化）。enqueue/claim/delivery.end/drain 时原子写（tmp+rename，失败只诊断）；
   * 启动/项目导入时用 `restorePersistedDeliveries()` 重新入队并按既有 drain 路径自动重投。
   */
  deliveryQueueStorePath?: string;
  /**
   * **演示运行时（demo）的自动投递开关**（2026-11-05 真机缺陷「又卡住」修复）。
   * demo 适配器执行内置演示脚本（对 `src/evil.ts` 的越界写，用于演示"写前被拒"）；若投递机自动为
   * 未打开的 demo 目标开会话，该回合必然被门禁拒绝，失败结果再经回交/派发级联成 blocked。
   * 生产（Interface）置 `false`：demo 会话只由用户亲手打开、只投给已存在的会话；缺省 `true`
   * （测试/演示宿主维持既有自动开启语义）。
   */
  demoRuntimeAutoDeliver?: boolean;
  /**
   * **P2 网络状态门（2026-10-30）**：主进程权威（`net.isOnline` 采样 + 渲染/power 提示）经 Interface 注入；
   * 离线期间**不认领新的模型投递**（队列保留、`blockedReason:"network"` 可见），恢复后按既有顺序 drain。
   * 缺省 ⇒ 视为在线（旧行为零变化）。
   */
  networkGate?: NetworkGate;
  /** **时钟（G-2；注入以便单测）**；缺省 `Date.now`。 */
  now?: () => number;
}
