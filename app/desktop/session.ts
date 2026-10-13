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
//    的会话（文本 = 编排 `renderDispatchPrompt`；未落地前见 `renderDispatchPromptLocal` 的登记，**不得两处并存**）。
//    两者**共用一套投递机**：去重（回交=handbackKey 永不重投；派发=**队列期**窗口去重、送达即释放以保返工）+
//    忙时排队（按序、绝不并发 send）+ 目标未开**自动开启** + 失败**如实系统行 + 保留待重试**（绝不静默丢）。
//    校验：`routeDispatch` 拒非本项目角色与内置治理角色（含 su 自身）——**如实回执给工具**，绝不静默。
//    CLI 前端的同等投递**不做**（一次性会话，另议——登记）。
//  - **会话上下文来源（D-1 契约，pm 2026-10-12 钉死）**：dispose / LRU 淘汰**不擦除**会话文件，重开 = 适配器
//    从文件恢复——`open()` 以「文件在/不在/坏」分类 `contextSource`（resumed/recovered/fresh），供渲染侧出文案。
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
//  - **su 只读 shell（客户裁定 2026-10-12：「su 也要有 shell，但是只读」）**：内置治理角色（su）会话把
//    **(c) 规则集实件**（与项目角色**同一份** `deps.shellArming`——单一来源、永不漂移）经 `shellReadonly`
//    交给编排 `assembleReadonlyShellGate` 装配**只读档** ShellGate ⇒ su 的 `run_shell` **注册**，但**只执行
//    (c) 只读白名单命令**（`risky`/`review`/`deny` 一律拒）。**su 不接 (b)/(a)**（「审读者不给自己开闸」：
//    自己就是审读者、不自审；只读外的命令直接拒、**不弹任何对话框、不打扰客户**）。**给出即 arm**（编排
//    只读档分支不带 `suppressHandback` 前缀——su 会话恒 `suppressHandback === true`，见 `run-role.ts`）；
//    缺省/构造失败（`deps.shellArming` 为 undefined）⇒ **不传** ⇒ su 不 arm（能力缺席 = fail-closed，绝不放宽）。

import type { Acceptance } from "../../src/model/boundary.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
// O-1（2026-10-12）：边界快照的**可信信号** = 读盘内容哈希（sha256）——本层只读、不复制门禁解析。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { RoleSessionHandle, RoleSessionAbortResult } from "../../src/pipeline/orchestration/run-role.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
// 会话事件流的类型：编排把 `RoleSessionHandle.events()` 放宽为 `OrchestrationEvent`（既有 `SessionEvent`
// + 编排在 `settled` 时追加的 `handback` 回交事件，设计 §10.8）。**类型从编排的模块只读导入、不复制形状**
// （单一来源：`src/common/编排/handback.ts`，也是 `run-role.ts` 导入它的位置）。
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
// E-1（2026-10-12）：「回交后的 su 验收」的两件**单一来源**（编排提供，只读导入、不复制）——
// `renderHandbackPrompt`（投递给 su 的输入文案）与 `handbackKey`（去重键）。**两前端共用、不得各写一份**。
import { renderHandbackPrompt, handbackKey, type TaskHandback } from "../../src/common/编排/handback.ts";
import type { WriteGate, RuntimeAdapter, ShellGate, OperatorChannelFn, CustomerInputFn, CustomerInputRequest } from "../../src/provider/pi/session.ts";
// H-1（2026-10-12）：派发能力的冻结契约（§4 冻结家；只读导入、不复制形状）。
import type { DispatchTaskPayload, DispatchReceipt, DispatchTaskFn, PromptOptions } from "../../src/provider/pi/session.ts";
// D-1/E-1：会话文件粗探（「在/不在/坏」）——打开会话时分类 `contextSource`（文案分支的事实来源）。
import { probeSessionFile } from "./session-history.ts";
// I-1 补丁（2026-10-12 客户重发授权）：(c) 规则集实件的形状（**只读转自** operator-channel.ts——它 `Omit`
// 自编排的 `AssembleShellGateOptions`；同一契约只许一个形状，本模块不另立第二份）。
import type { DesktopShellArming } from "./operator-channel.ts";
// su 只读档（客户裁定 2026-10-12：「su 也要有 shell，但是只读」）：只读档装配选项形状的**单一来源**在编排
// （`shell-arming.ts::AssembleReadonlyShellGateOptions`）——只读导入其类型（运行期擦除），据它取「只读档
// 该注入哪几件」。**不另立第二形状**（与 `DesktopShellArming` 同法，见 operator-channel.ts 注释）。
import type { AssembleReadonlyShellGateOptions } from "../../src/pipeline/orchestration/shell-arming.ts";
// 桌面客户交互通道（A-5）：请求/裁决的冻结形状在 §4 冻结契约家（provider/pi/session.ts），
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
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
// 桌面授权链的**唯一实现**（会话语义与界面只读判定共用；采纳 `.ans` 的项目治理边界路径——见 project.ts）。
import { buildEffectiveProjectConfig } from "./project.ts";

// T22：`RuntimeKind` 的**单一来源**为 `src/common/shared/runtime-shared.ts`——此处删去本地副本、
// 改从共享模块**只读导入**并**原样转出**（公开面 `RuntimeKind` 不变、行为逐字不变）。
export type { RuntimeKind };

/**
 * 会话事件外推的**信封**（B-2，2026-10-12）：多会话并存后，事件必须携带**它属于哪个角色**
 * （渲染侧按此分发到该角色的聊天流——不带标识会串消息）。`event` 的类型从编排只读导入、不复制。
 */
export interface SessionEventEnvelope {
  roleId: string;
  event: OrchestrationEvent;
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

export interface OpenResult {
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
  /**
   * **会话上下文来源**（D-1 契约，pm 2026-10-12 钉死）——渲染侧文案分支的**事实输入**：
   *  · "resumed"   —— 句柄仍在（同运行内续接）；
   *  · "recovered" —— 本次新建、但**本地会话文件在**（适配器按「目录内有最近会话就恢复」一并恢复上下文——
   *                   dispose 后、LRU 淘汰后、应用重启后皆如此）；
   *  · "fresh"     —— 本地会话文件**不存在或损坏** ⇒ **真·新会话**（唯一「不会记得」的情形；
   *                   损坏时 `contextWarning` 载如实说明）。
   */
  contextSource?: "resumed" | "recovered" | "fresh";
  /** "fresh" 且文件损坏时的如实说明；其余情况缺省。 */
  contextWarning?: string;
}

export interface SendResult {
  ok: boolean;
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

// （A-5：finalize 面已删——提议/确认/手动收口不复存在；产物收尾由编排在 settle 后自动完成，见文件头。）

export interface SessionManagerDeps {
  /** 建会话（缺省为编排的 openRoleSession；注入以便单测）。入参形状镜像编排当前的公开输入
   *  （`customerInput`/`autoRepin`；`genesisFinalize`/`operatorChannel` 随 A-4 已删）。 */
  openRoleSession: (
    input: {
      roleId: string;
      project: ProjectConfig;
      taskId?: string;
      scope?: undefined;
      /** **客户确认制交互通道**（A-1/A-3）：仅内置治理角色（su）会话注入（见 SessionManager.open）。 */
      customerInput?: CustomerInputFn;
      /** **派发任务能力**（H-1）：仅内置治理角色（su）会话注入（见 SessionManager.open 与 routeDispatch）。 */
      dispatchTask?: DispatchTaskFn;
      /** **(a) 操作者确认通道（I-1 arm）**：仅**项目角色**会话注入（su **不接 (b)/(a)**——审读者不给自己开闸；
       *  编排据此装配 (c)/(b)/(a) ShellGate 并注册 `run_shell`；装配落地前被静默忽略——登记）。 */
      shellOperatorChannel?: OperatorChannelFn;
      /** **(c) 规则集实件（I-1 补丁，2026-10-12）**：仅**项目角色**会话注入（与 (a) 同判据）。 */
      shellArming?: DesktopShellArming;
      /** **su 只读档（客户裁定 2026-10-12：「su 也要有 shell，但是只读」）**：仅**内置治理角色（su）**会话
       *  注入（判据 `role.builtIn`，见 SessionManager.open）——**复用同一份 (c) 实件 `DesktopShellArming`**
       *  （单一来源、与项目角色永不漂移）。编排据此装配**只读档** ShellGate（只接 (c)：命中只读白名单放行；
       *  `risky`/`review`/`deny` 一律拒；**不接 (b)/(a)**——不打扰客户、不弹框）⇒ `run_shell` 注册。
       *  **给出即 arm**（su 会话恒 `suppressHandback === true`，编排只读档分支不带该前缀——别被旧注释误导）；
       *  缺省/构造失败 ⇒ 不传 ⇒ 不 arm（能力缺席 = fail-closed，绝不放宽）。 */
      shellReadonly?: Omit<AssembleReadonlyShellGateOptions, "project">;
    },
    deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter },
  ) => Promise<RoleSessionHandle>;
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
   * **队列变化外推**（L-1 可见性）：某角色队列的**摘要快照**——主进程据此推渲染侧（该角色的队列行 +
   * 左树「N 待办」徽标）。**只在变化时**发；空数组＝清空显示。缺省 ⇒ 界面无队列行（不影响入队本身）。
   */
  emitRoleState?: (info: {
    roleId: string;
    busy: boolean;
    summaries: string[];
    /** 结构化的排队条目（右栏「待办 / 队列」组用；来源/摘要/入队时间——**与 summaries 同源**，不另造数据源）。 */
    queue: { kind: string; sourceRoleId: string; summary: string; at: string }[];
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
  shellOperatorChannel?: OperatorChannelFn;
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
}

/** 一个**保活**中的角色会话（B-2：每角色一个句柄 + LRU）。 */
interface LiveSession {
  readonly handle: RoleSessionHandle;
  /** 建会话时的项目根——换项目重开同一角色前须先释放旧句柄（角色 id 可能跨项目同名）。 */
  readonly projectRoot: string;
  readonly config: EffectiveConfigInfo;
  /** LRU 使用序号（越大越近；open/续接时刷新）。 */
  lastUsed: number;
  /** **是否有轮次在跑**（E-1/H-1 排队判据）：send 成功置真、收到该角色的 `settled` 事件置假。 */
  busy: boolean;
  /**
   * **O-1（2026-10-12）：本会话持有的边界快照**——开会话时定格的参与文件（绝对路径）与各自**内容哈希**。
   * 任一处变了 ⇒ 本会话的规则集已陈旧（真机：su 改好 boundary.yaml 后，活会话仍按开会话时解析的旧边界
   * 拒写）——`boundaryDiff` 检出后**作废重建**。信号只来自读盘哈希（**不得**靠界面推测）。
   */
  boundaryPaths: string[];
  boundaryPrints: Record<string, string>;
}

/** 一次**系统投递**（E-1 回交投 su / H-1 派发投目标角色 / L-1 客户消息）——投递机的队列条目（**一套机，多调用方**）。 */
interface DeliveryItem {
  kind: "handback" | "dispatch" | "message";
  /** 目标角色 id（回交→su；派发/客户消息→被派角色）。 */
  targetRoleId: string;
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
   * `src/provider/pi/session.ts`；投递时**整包同一引用**透传 `handle.send(text, opts)`——排队后到投递
   * 都带原图）。缺省（undefined）= 纯文本，投递调用形态与旧版逐字一致（不传第二参）。
   */
  opts?: PromptOptions;
}

/**
 * H-1 派发输入文案的**临时**实现——**单一来源应为编排的 `renderDispatchPrompt`**（设计 H-1；
 * 本层届时只读导入、删掉本函数）。编排尚未落地该导出（本次实现时点：`src/**` 无此符号），
 * 先按设计 H-1 的模板逐字内置；**依赖已登记**（见 change 文档）——落地后必须切换，**不得两处并存**。
 */
function renderDispatchPromptLocal(fromRoleId: string, d: DispatchTaskPayload): string {
  const reason = d.reason !== undefined && d.reason !== "" ? `（原因：${d.reason}）` : "";
  return `[派发] 来自 ${fromRoleId} 的任务：${d.task}${reason}——完成后请交回报告`;
}

/** 队列摘要用的一句短句（L-1 可见性；仅呈现，不参与任何判定）。 */
function shortenText(s: string, n: number): string {
  const flat = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
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
    return "<missing>";
  }
}

/**
 * 会话管理器（B-2：**每角色一个保活句柄** + 上限 LRU）：点角色即开、多轮直发；
 * **切走不 dispose、切回直接续**；超出 `MAX_LIVE_SESSIONS` 时淘汰最久未用者。
 */
export class SessionManager {
  private readonly deps: SessionManagerDeps;
  private readonly loadEffectiveConfig: (opts: LoadConfigOptions) => Promise<LoadedConfig>;
  /** 保活中的会话：roleId → 句柄（上限见 `MAX_LIVE_SESSIONS`）。 */
  private readonly sessions = new Map<string, LiveSession>();
  /** 客户消息计数（L-1：逐条独立入队键——客户消息**不去重**）。 */
  private messageSeq = 0;
  /** LRU 时钟（单调递增）。 */
  private lruClock = 0;
  /** 最近一次 open 的角色（`send` 的目标）。 */
  private activeRoleId: string | null = null;
  /** 最近一次 open 用的运行时（自动开启会话时沿用——渲染侧现实里恒为 "pi"）。 */
  private lastRuntime: RuntimeKind = "pi";
  // —— 投递机（E-1 回交投 su + H-1 派发投目标角色；**同一套**，不造第二套）——
  /** 待投递队列：`${projectRoot}\0${targetRoleId}` → 条目（**按到达序**；目标忙时积压，其 settled 后按序放行）。 */
  private readonly deliveryQueues = new Map<string, DeliveryItem[]>();
  /**
   * 投递机**串行链**（每项目一条，2026-10-12 L-1 修正）：多触发点（入队/开尾/settled/派发/回交）可能
   * **并发**调 `drainQueue`——不串行则同一队列会被两个 drain 同时 shift/open（真机缺陷：su 被**重复开启**
   * 两个会话、坏条目误报「形状不符」）。串行后每个 `drainQueueUnsafe` 都在前一个跑完后才开始（各自重读队列）。
   */
  private readonly drainChains = new Map<string, Promise<void>>();
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

  constructor(deps: SessionManagerDeps) {
    this.deps = deps;
    this.loadEffectiveConfig = deps.loadEffectiveConfig ?? defaultLoadEffectiveConfig;
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
    this.sessions.delete(roleId);
    if (this.activeRoleId === roleId) this.activeRoleId = null;
    this.activeDeliveries.delete(this.queueKey(entry.projectRoot, roleId)); // 会话没了，「进行中」不再成立
    // 状态准确性：dispose 即真实信号（会话已移出保活表，busy 判据随之恒 false）——外推快照，
    // 徽标/队列行随之转「已停止」；**不删其投递队列**（未投的待办仍如实保留可见）。
    this.notifyRoleState(entry.projectRoot, roleId);
    try {
      await entry.handle.dispose();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  /** LRU 淘汰：保活数超出 `MAX_LIVE_SESSIONS` 时，从**最久未用**者起 dispose（直到回到上限）。 */
  private async evictBeyondLimit(): Promise<void> {
    while (this.sessions.size > MAX_LIVE_SESSIONS) {
      let oldestId: string | null = null;
      let oldestUsed = Number.POSITIVE_INFINITY;
      for (const [id, s] of this.sessions) {
        if (s.lastUsed < oldestUsed) {
          oldestUsed = s.lastUsed;
          oldestId = id;
        }
      }
      if (oldestId === null) return;
      const entry = this.sessions.get(oldestId);
      if (!entry) return;
      await this.disposeEntry(oldestId, entry);
    }
  }

  // —————— O-1（2026-10-12）：边界快照检查与作废重建 ——————
  // 真机现象：su 按流程改好角色的 boundary.yaml（盘上已含目标路径、pin 一致），但该角色的**活会话**仍在用
  // 开会话时解析的旧边界 ⇒ 写入被拒（「目标路径未匹配任何边界条目」）。信号只取**读盘内容哈希**
  // （可信信号，不用界面推测）；检出陈旧 ⇒ **作废重建**（dispose → 立即按新边界重开）并如实记一行。

  /** 该会话的边界快照**哪一处**变了（返回变化的相对路径；未变 ⇒ null）。 */
  private async boundaryDiff(entry: LiveSession): Promise<string | null> {
    for (const f of entry.boundaryPaths) {
      const rel = path.relative(entry.projectRoot, f);
      if (entry.boundaryPrints[rel] !== (await filePrint(f))) return rel;
    }
    return null;
  }

  /** 边界已变时的**如实一行**（按 D-1：会话文件在 ⇒ 说「恢复」；缺失/损坏 ⇒ 说「新建」——不套旧文案）。 */
  private boundaryRebuiltLine(changedRel: string, probe: "ok" | "missing" | "corrupt"): string {
    const head = `该角色边界已更新（${changedRel}）——旧会话已作废，按新边界重开。`;
    return probe === "ok"
      ? head + "历史已从本地会话文件恢复（模型上下文一并恢复）。"
      : head + "本地无可用会话文件（新建会话）——模型不会记得以上历史，请重新说明需求。";
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
  ): Promise<{ changed: string; reopened: OpenResult } | undefined> {
    const prev = this.rebuildChains.get(roleId) ?? Promise.resolve();
    const run = prev.then(() => this.rebuildIfBoundaryStaleUnsafe(roleId, userInitiated));
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
  ): Promise<{ changed: string; reopened: OpenResult } | undefined> {
    const entry = this.sessions.get(roleId);
    if (!entry) return undefined;
    if (entry.busy) return undefined; // 在跑的轮次不打断（settle 后放行/下次发言/下次投递再查）
    const changed = await this.boundaryDiff(entry);
    if (changed === null) return undefined;
    if (this.sessions.get(roleId) !== entry || entry.busy) return undefined; // 读盘期间被替换/开跑（TOCTOU）
    const projectRoot = entry.projectRoot;
    // D-1：dispose **不擦除**会话文件——先探「在/不在/坏」，重开后会按它恢复（措辞据此如实）。
    const probe = await probeSessionFile(projectRoot, roleId);
    if (this.sessions.get(roleId) !== entry || entry.busy) return undefined; // 探测期间被替换/开跑（TOCTOU）
    await this.disposeEntry(roleId, entry);
    this.deps.emitEvent({ roleId, event: { kind: "message", summary: this.boundaryRebuiltLine(changed, probe) } });
    const reopened = await this.openInternal({ projectRoot, roleId, runtime: this.lastRuntime }, userInitiated);
    if (!reopened.ok) {
      this.deps.emitEvent({
        roleId,
        event: { kind: "message", summary: `按新边界重开会话失败：${reopened.error ?? "未知原因"}（请重试或点击左侧角色）。` },
      });
    }
    return { changed, reopened };
  }

  /**
   * O-1：对所有**活会话**扫一遍边界快照（su 一轮结束时由 Interface 触发——「边界可能刚被 su 改过」的
   * 可信时机）。陈旧者作废重建（如实记行）；**在跑的轮次跳过**（下一时机再查）。逐会话 try/catch 隔离
   * （一个失败不影响其它；不上抛——本方法经 `void` fire-and-forget 调用）。返回重建的角色 id。
   */
  async refreshStaleBoundaries(): Promise<string[]> {
    const rebuiltIds: string[] = [];
    for (const roleId of [...this.sessions.keys()]) {
      try {
        const rebuilt = await this.rebuildIfBoundaryStale(roleId, false);
        if (rebuilt !== undefined) rebuiltIds.push(roleId);
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
    return this.openInternal(req, true);
  }

  /** `open` 的实现（`userInitiated=false` = 投递机后台自动开启：不抢活动角色，其余逐字同）。 */
  private async openInternal(req: SessionOpenRequest, userInitiated: boolean): Promise<OpenResult> {
    if (!req.projectRoot || !req.roleId) {
      return { ok: false, error: "缺少项目根或角色 id。" };
    }
    this.lastRuntime = req.runtime; // E-1：自动开启 su 时沿用最近一次运行时
    // B-2：该角色已有**同项目**的保活会话 → 续接（句柄与模型上下文原样保留）。
    const existing = this.sessions.get(req.roleId);
    if (existing && existing.projectRoot === req.projectRoot) {
      // O-1（2026-10-12）：续接前先查**边界快照**——陈旧 ⇒ 作废并按下方**新建**路径重开（历史按 D-1 恢复）；
      // 未陈旧 ⇒ 逐字续接（**绝不**误重开丢上下文）。在跑的轮次不打断（busy 时跳过，下一时机再查）。
      const rebuilt = await this.rebuildIfBoundaryStale(req.roleId, userInitiated);
      if (rebuilt === undefined) {
        existing.lastUsed = ++this.lruClock;
        if (userInitiated) this.activeRoleId = req.roleId;
        return {
          ok: true,
          note: "已在该角色的会话中，续接当前会话。",
          config: existing.config,
          resumed: true,
          contextSource: "resumed",
        };
      }
      if (!rebuilt.reopened.ok) {
        return { ok: false, error: `该角色边界已更新，但按新边界重开会话失败：${rebuilt.reopened.error ?? "未知原因"}。请重试。` };
      }
      return rebuilt.reopened;
    }
    // 同角色但**换了项目**：先释放旧句柄（角色 id 跨项目可能同名，不能拿旧项目的句柄顶新项目）。
    if (existing) {
      await this.disposeEntry(req.roleId, existing);
    }

    const listing = this.deps.getListing(req.projectRoot);
    if (!listing) {
      return { ok: false, error: "尚未枚举该项目；请先导入项目（app:list-project）。" };
    }
    const role = listing.roles.find((r) => r.roleId === req.roleId);
    if (!role) {
      return { ok: false, error: `项目 ${req.projectRoot} 下未找到角色：${req.roleId}` };
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

    // ——— 客户确认制交互（A-1/A-3/A-5）：**仅内置治理角色（su）**的会话注入客户交互通道 ———
    //
    // 判据 = 「本角色是内置治理角色」（`role.builtIn`，数据驱动、**不硬编码 "su"**）。注入 ⇒ 编排把本会话
    // 置为**确认制**（`request_confirmation`/`request_choice` 注册；gate 走「客户确认才发行 writeSet」）——
    // 「客户确定了才加、才落盘」。**普通角色的会话一律不注入**（无客户通道：工具不注册、gate 旧语义逐字
    // 不变）。通道未接（deps.customerInput 缺省）⇒ 不注入——**绝不**出现「没人问就放行」。
    const customerInput = role.builtIn === true ? this.deps.customerInput : undefined;

    // H-1：**仅内置治理角色（su）**会话注入**派发能力**（数据驱动；契约在 §4 冻结家 `provider/pi/session.ts`）。
    // 路由复用 E-1 投递机（`routeDispatch`）；工具「未注入即不注册」——项目角色会话**不注入**（su 才有派发权）。
    // ⚠ 依赖登记：`openRoleSession` 的入参字段名 `dispatchTask` 以钉死契约为准；编排侧接线落地前，
    //   真实 run-role 会静默忽略本字段（我方透传就位，等待其承接——见 change 文档）。
    const dispatchTask: DispatchTaskFn | undefined =
      role.builtIn === true
        ? (d: DispatchTaskPayload): DispatchReceipt => this.routeDispatch(req.projectRoot, req.roleId, d)
        : undefined;

    // I-1（2026-10-12，客户裁定 arm）：**只对项目角色**把 (a) 操作者确认通道交给编排装配 (c)/(b)/(a)
    // `ShellGate`（判据 `role.builtIn`，数据驱动）。「审读者不给自己开闸」仍成立：su **不接 (b)/(a)**
    // （自己就是审读者、不自审；只读外的命令直接拒、不弹框、不打扰客户）——su 的 shell 走下方**只读档**。
    const shellOperatorChannel = role.builtIn === true ? undefined : this.deps.shellOperatorChannel;

    // I-1 补丁（2026-10-12，客户重发授权）：**(c) 规则集实件**（`classifyShell` + `rules`）——与 (a) 通道
    // **同判据**（只对项目角色走三层链；su 不接 (b)/(a)）。两件均由主进程构造（`buildDesktopShellArming`）；
    // 缺省 ⇒ 编排对「规则集未注入」一律拒绝（fail-closed，绝不放宽）。
    const shellArming = role.builtIn === true ? undefined : this.deps.shellArming;

    // **su 只读 shell（客户裁定 2026-10-12：「su 也要有 shell，但是只读」）**：内置治理角色（su）会话把
    // **(c) 规则集实件**——**复用同一份 `this.deps.shellArming`**（`buildDesktopShellArming` 产出的
    // `{classifyShell, rules}`；单一来源、与项目角色永不漂移）——经 `shellReadonly` 交给编排
    // `assembleReadonlyShellGate` 装配**只读档** ShellGate ⇒ su 的 `run_shell` 注册、但只执行 (c) 只读
    // 白名单命令（risky/review/deny 一律拒；**不接 (b)/(a)**——不弹框）。
    // **给出即 arm**：su 的会话恒 `suppressHandback === true`（`run-role.ts` 的 suppressHandback 判据），
    // 而只读档分支**不带**该前缀——判据就是「给出即 arm」，别被旧注释的 `!suppressHandback` 联想误导。
    // 缺省/构造失败（`deps.shellArming` 为 undefined）⇒ 不传 ⇒ su 不 arm（能力缺席 = fail-closed，绝不放宽）。
    const shellReadonly = role.builtIn === true ? this.deps.shellArming : undefined;

    // pi 路径把 arm 接缝（shellGate，缺省 undefined = 不 arm）透传给编排的真实适配器工厂
    // （`createPiAdapterFactory(project, shellGate?)` 是编排已冻结的签名，此处不发明新形状）。
    // undefined ⇒ Pi 适配器不注册 run_shell（§7.5.1）。demo 路径无 shell 入口，与本接缝无关。
    const createAdapter: (gate: WriteGate) => RuntimeAdapter =
      req.runtime === "pi"
        ? this.deps.createPiAdapterFactory(project, this.deps.shellGate)
        : (gate) => this.deps.createDemoAdapter({ gate, boundary });

    // D-1 契约（pm 2026-10-12 钉死）：本次是**新建**——按「会话文件在/不在/坏」分类上下文来源：
    //  · 文件在（header 合法）→ "recovered"：适配器按「目录内有最近会话就恢复」一并恢复上下文
    //    （dispose / LRU 淘汰**不擦除**会话文件——重开即恢复；应用重启同理）；
    //  · 缺失/损坏 → "fresh"：真·新会话（损坏时带如实说明）——**唯一**「模型不会记得」的情形；
    //    B-2 时期那句一概而论的「模型上下文已重启」在 D-1 契约下已失真，已退役（文案映射在渲染侧纯函数）。
    const probe = await probeSessionFile(req.projectRoot, req.roleId);
    const contextSource: "recovered" | "fresh" = probe === "ok" ? "recovered" : "fresh";
    const contextWarning = probe === "corrupt" ? "本地会话文件损坏（头不合法），未能恢复" : undefined;

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
          project,
          // 客户交互通道（A-5）：仅内置治理角色（su）会话注入；**每会话闭包绑定 roleId**（请求本体不带
          // 角色标识——渲染侧据它把交互卡落到该角色的聊天流、点亮 B-3「等待你确认」）。普通角色逐字不传。
          ...(customerInput
            ? { customerInput: (r: CustomerInputRequest) => customerInput(r, { roleId: req.roleId }) }
            : {}),
          // H-1：派发能力（仅 su 会话注入；契约字段名 `dispatchTask`——编排落地后由其转发给适配器）。
          ...(dispatchTask ? { dispatchTask } : {}),
          // I-1：(a) 操作者确认通道（仅项目角色；编排据它装配 (c)/(b)/(a) ShellGate 并注册 run_shell——
          // 装配接线落地前本字段被静默忽略，登记在案）。
          ...(shellOperatorChannel ? { shellOperatorChannel } : {}),
          // I-1 补丁（2026-10-12，客户重发授权）：(c) 实件（classifyShell + defaultShellRules）——与 (a)
          // 同处装配（缺它 ⇒ 编排对「规则集未注入」一律拒绝——真机曾据此如实报「环境无 shell」）。
          ...(shellArming ? { shellArming } : {}),
          // su 只读档（客户裁定 2026-10-12）：「su 也要有 shell，但是只读」——**仅内置治理角色**会话给出
          // （同一份 (c) 实件，供编排 `assembleReadonlyShellGate` 装配只读档）；**给出即 arm**。
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

    const entry: LiveSession = {
      handle,
      projectRoot: req.projectRoot,
      config,
      lastUsed: ++this.lruClock,
      busy: false,
      boundaryPaths,
      boundaryPrints,
    };
    this.sessions.set(req.roleId, entry);
    if (userInitiated) this.activeRoleId = req.roleId; // 后台自动开启不抢活动角色（见 open 头注）
    // 状态准确性 / L-1：开好即外推**真实状态快照**（busy=false + 该角色既有队列摘要）——徽标/队列行据此准确。
    this.notifyRoleState(req.projectRoot, req.roleId);
    this.consume(req.roleId, handle, req.projectRoot);
    // LRU：超出上限先淘汰**最久未用**者（dispose；其界面历史由渲染层自持、切回时恢复并如实提示）。
    await this.evictBeyondLimit();
    // 客户裁定（2026-10-13）：**常规「已开启与角色 X 的会话…」欢迎提示删除**——聊天流不摆常规提示
    // （真机每次开会话/切角色都出现，被客户点名）。**异常提示保留**：contextWarning（渲染侧按
    // contextSource 如实分支）、O-1 边界重建行、投递失败/受阻行等均不受影响。
    // 投递机（E-1/H-1）：本会话开好后，尝试放行积压的投递（目标=本角色的队列；为空则 no-op）。
    void this.drainQueue(req.projectRoot, req.roleId);
    return { ok: true, config, resumed: false, contextSource, ...(contextWarning ? { contextWarning } : {}) };
  }

  /**
   * 事件消费循环（**每会话一个，后台持续拉取**，B-2）：切走不停拉——重 pin/回交/适配器队列消费都依赖
   * 拉取（事件流是拉驱动的）；事件带 `roleId` 信封外推，渲染侧按角色分发（多会话并存不会串消息）。
   */
  private consume(roleId: string, handle: RoleSessionHandle, projectRoot: string): void {
    void (async () => {
      try {
        for await (const ev of handle.events()) {
          // E-1/H-1：settled ⇒ 该会话离开「忙」，并尝试按序放行**本项目各队列**的积压投递。
          // 投递触发**不挑目标**（历史上单队列按项目存放时就是如此）：一轮结束=下一次放行时机（E-1 的
          // 重试时机之一），各队列在 drainQueue 里各自检查「目标忙/未开」后再决定是否真投。
          if (ev.kind === "settled") {
            const en = this.sessions.get(roleId);
            if (en) {
              en.busy = false;
              this.activeDeliveries.delete(this.queueKey(en.projectRoot, roleId)); // 「进行中」随本轮结束撤销
              // 状态准确性：settled = 「本角色离开工作中」的**真实信号**（B-2 下切走的后台轮次结束也走这里）
              // ——先外推再放行队列（放行时 busy 复位已可见）。
              this.notifyRoleState(en.projectRoot, roleId);
              void this.drainAllQueuesFor(en.projectRoot);
            }
          }
          // E-1：回交到达 ⇒ 自动投递交 su 验收（去重 + 排队 + 失败如实/保留；见 handleHandback）。
          if (ev.kind === "handback") {
            void this.handleHandback(projectRoot, ev.handback);
          }
          try {
            this.deps.emitEvent({ roleId, event: ev });
          } catch {
            // 外推失败（如窗口已关）不得影响会话本身。
          }
        }
      } catch (err) {
        this.deps.emitEvent({
          roleId,
          event: { kind: "message", summary: `会话事件流异常：${err instanceof Error ? err.message : String(err)}` },
        });
      }
    })();
  }

  /** 发送一轮消息给**当前活动会话**（最近一次 open 的角色）；可反复调用。
   *  **L-1（2026-10-12 客户裁定「每个角色…有个队列的概念」）**：角色**忙时不再直接失败**（旧行为＝直转 SDK、
   *  被回 "already processing" 报错给客户）——客户消息作为**第三类**并入**同一条**投递队列（E-1/H-1 共用），
   *  按到达序在当前任务结束后执行；空闲路径**逐字不变**。返回 `queued:true + position`（界面据此如实提示）。
   *  **P0-1（2026-10-13 客户批准）**：`opts`（图片载荷）为**可选**——忙时**入队即定格**（排队后到投递都带
   *  原图）；空闲直发**整包同一引用**透传 `handle.send(text, opts)`。不传 `opts` 时调用形态与旧版逐字一致。 */
  async send(text: string, opts?: PromptOptions): Promise<SendResult> {
    // **目标角色在入口定格（2026-10-13 状态机修复）**：并发作废重建（settle 触发的 refreshStaleBoundaries
    // 与本次 send 各自的重建赛跑）会在窗口里清空/替换 `activeRoleId`——按「当下的 activeRoleId」取条目会让
    // 本条消息**落空**（旧实现会回「会话尚未开启」且消息丢失）。用户的意图是入口那一刻的活动角色，照它走。
    const targetRoleId = this.activeRoleId;
    // O-1（2026-10-12）：发言前先查**边界快照**——陈旧 ⇒ 先作废重建（本条发言直接落到新边界会话上；
    // 重建失败 ⇒ 如实回错、本条不发送）。在跑的轮次由 rebuild 内部跳过（不打断）。
    if (targetRoleId !== null) {
      const rebuilt = await this.rebuildIfBoundaryStale(targetRoleId, true);
      if (rebuilt !== undefined && !rebuilt.reopened.ok) {
        return { ok: false, error: "该角色边界已更新，但按新边界重开会话失败——本条消息未发送，请重试。" };
      }
    }
    const entry = targetRoleId !== null ? this.sessions.get(targetRoleId) : undefined;
    if (!entry) {
      return { ok: false, error: "会话尚未开启（点击左侧角色即可开启）。" };
    }
    // 并发重建可能把活动指针清掉（dispose 置 null、后台重开不抢位）——用户意图仍指向 targetRoleId：复位。
    // （若用户期间开了**别的**角色，activeRoleId 非 null，不动它——不抢位。）
    if (this.activeRoleId === null) this.activeRoleId = targetRoleId;
    if (entry.busy) {
      const roleId = targetRoleId as string;
      this.enqueueDelivery(entry.projectRoot, roleId, {
        kind: "message",
        targetRoleId: roleId,
        sourceRoleId: roleId,
        text,
        summary: `你：${shortenText(text, 40)}`,
        // 客户消息逐条独立（**不去重**——同文重复发送是两个意图）：键含自增序号+时间。
        dedupKey: `msg\u0000${++this.messageSeq}\u0000${Date.now()}`,
        // P0-1：**入队即定格**——整包同一引用存进条目，投递时原样透传（排队不变形）。
        ...(opts !== undefined ? { opts } : {}),
      });
      const q = this.deliveryQueues.get(this.queueKey(entry.projectRoot, roleId));
      return { ok: true, queued: true, position: q ? q.length : 1 };
    }
    const roleId = targetRoleId as string;
    // L-1 顺序修正（与投递机同款，防竞态）：**先置忙再 await**——快适配器（如演示 runtime）的事件
    // （含 `settled`）可能在 `send` 返回前就被消费循环处理完；若此刻才置忙，settled 的复位会被反向覆盖，
    // 忙态将**永不复位**（队列也永不放行）。失败 ⇒ 复位 + 外推（并没有在跑，如实）。
    entry.busy = true;
    // P0-2 前置修正（2026-10-13，随停止入口同批）：**开跑即外推 busy=true**——与投递机同款
    //（先置忙即推快照）。旧版只在 round 结束后推：长轮次（真实 pi 一轮数分钟）期间界面根本收不到
    // 「工作中」快照——停止钮与左树徽标都无从在轮次**进行中**出现（快适配器掩盖了这条缝；停止入口
    // 把缝暴露出来）。此处开跑即推（如实）；结束后那次保留（兜底快适配器「settled 先于 send 返回
    // 被消费」的竞态）。
    this.notifyRoleState(entry.projectRoot, roleId);
    try {
      // P0-1：整包同一引用透传；**不传 opts 时调用形态与旧版逐字一致**（不构造空包）。
      if (opts === undefined) {
        await entry.handle.send(text);
      } else {
        await entry.handle.send(text, opts);
      }
      this.notifyRoleState(entry.projectRoot, roleId); // 状态准确性：真开跑即外推「工作中」（繁忙与否以会话条目为准）
      return { ok: true };
    } catch (err) {
      entry.busy = false;
      this.notifyRoleState(entry.projectRoot, roleId);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
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
  async abort(roleId: string): Promise<RoleSessionAbortResult> {
    const entry = typeof roleId === "string" && roleId !== "" ? this.sessions.get(roleId) : undefined;
    if (!entry) {
      return { ok: false, supported: false, error: `角色 ${roleId} 没有打开的会话——没有可停止的轮次。` };
    }
    // 契约：消费方以 `handle.abort?.()` 调用——**方法缺席**（旧替身）与返回 supported:false 同一处理。
    if (entry.handle.abort === undefined) {
      return { ok: false, supported: false, error: "当前运行时不支持停止" };
    }
    try {
      return await entry.handle.abort();
    } catch (err) {
      return { ok: false, supported: true, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * 关闭会话（B-2：**定向**）。给定 `roleId` 只关该角色（历史留在界面上）；缺省/`null` 关**全部**
   * （换项目/退出时用）。dispose 出错如实返回（不静默）。
   */
  async stop(roleId?: string | null): Promise<StopResult> {
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
    return this.activeRoleId;
  }

  /** 保活中的角色 id 列表（B-3 状态徽标「空闲/已停止」派生据它 + 渲染侧的数据源）。 */
  liveRoleIds(): string[] {
    return [...this.sessions.keys()];
  }

  // —————— 投递机（E-1 回交投 su + H-1 派发投目标角色；**同一套**，不造第二套） ——————

  /** 主入口角色（su）id：**数据驱动**（门禁引擎枚举给的 `primaryRoleId`，不硬编码）；枚举不到 → null。 */
  private suRoleIdOf(projectRoot: string): string | null {
    const listing = this.deps.getListing(projectRoot);
    const id = listing && typeof listing.primaryRoleId === "string" ? listing.primaryRoleId : "";
    return id !== "" ? id : null;
  }

  /** 投递进展的**系统行**（首选进目标/请求者的 pane；首选未知时退回兜底角色）——如实、不静默。 */
  private emitDeliveryNote(preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    const roleId = preferredRoleId !== null && preferredRoleId !== "" ? preferredRoleId : fallbackRoleId;
    this.deps.emitEvent({ roleId, event: { kind: "tool_call", summary } });
  }

  /** 队列键：项目 × 目标角色（一套机对多个目标；空目标=主入口暂未枚举到——每次尝试时重解析）。 */
  private queueKey(projectRoot: string, targetRoleId: string): string {
    return `${projectRoot}\u0000${targetRoleId}`;
  }

  private enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void {
    const key = this.queueKey(projectRoot, targetRoleId);
    const q = this.deliveryQueues.get(key) ?? [];
    q.push({ ...item, enqueuedAt: new Date().toISOString() }); // 入队时间**入队即定格**（显示用，非执行时间）
    this.deliveryQueues.set(key, q);
    this.notifyRoleState(projectRoot, targetRoleId); // L-1：入队即外推（队列行/徽标如实可见）
  }

  /** L-1/状态准确性 + 右栏「待办 / 队列」：**真实状态快照**外推（忙/闲 × 队列；变化时）——徽标/队列行/
   *  右栏待办组**都只信它**（同一通道、**不造第二套数据源**）。含：结构化的排队条目（来源/摘要/入队时间）
   *  与**正在跑的那条投递**（若有；标注「进行中」——排队 ≠ 已执行）。目标为空（主入口未枚举到）不外推。 */
  private notifyRoleState(projectRoot: string, targetRoleId: string): void {
    if (targetRoleId === "") return;
    const q = this.deliveryQueues.get(this.queueKey(projectRoot, targetRoleId)) ?? [];
    const busy = this.sessions.get(targetRoleId)?.busy === true;
    const running = this.activeDeliveries.get(this.queueKey(projectRoot, targetRoleId));
    const view = (i: DeliveryItem) => ({ kind: i.kind, sourceRoleId: i.sourceRoleId, summary: i.summary, at: i.enqueuedAt });
    this.deps.emitRoleState?.({
      roleId: targetRoleId,
      busy,
      summaries: q.map((i) => i.summary),
      queue: q.map(view),
      running: running !== undefined && busy ? view(running) : null,
    });
  }

  /** 回交到达（E-1）：**去重登记**（`handbackKey` 单一来源——一条回交只投递一次）→ 入队 → 尝试投递。
   *  **真机崩溃修复（2026-10-12）**：本函数经 `void` fire-and-forget 调用（consume 的事件循环），**任何上抛
   *  都会变成未捕获拒绝**——故：(1) 形状防御（缺 `handback` 载荷 / 缺 `roleId`）先拦；(2) `renderHandbackPrompt`
   *  渲染包 try/catch（坏形状绝不喂给它）；(3) 整体再包一层 catch——一切都落**如实系统行**，绝不上抛。 */
  private async handleHandback(projectRoot: string, hb: TaskHandback): Promise<void> {
    try {
      if (!hb || typeof hb !== "object" || typeof (hb as { roleId?: unknown }).roleId !== "string") {
        this.emitDeliveryNote(
          this.suRoleIdOf(projectRoot),
          "(未知角色)",
          "收到一条**形状不符**的回交事件（缺 handback 载荷 / 缺 roleId）——**未投递**（如实忽略；不崩、不静默）。"
        );
        return;
      }
      const suRoleId = this.suRoleIdOf(projectRoot);
      if (suRoleId !== null && hb.roleId === suRoleId) return; // su 不自我回交（编排也不发；防御）
      const key = `${projectRoot}\u0000${handbackKey(hb)}`;
      if (this.enqueuedHandbackKeys.has(key)) return; // 去重：重放/重渲染不得重复投递
      this.enqueuedHandbackKeys.add(key);
      // 输入文案：编排的 `renderHandbackPrompt`（**单一来源**——两前端共用，本层不各写一份）；**入队即定格**。
      // 渲染失败（载荷再坏一档）→ 如实系统行 + 不入队（**绝不**把 undefined 喂进渲染函数）。
      let text: string;
      try {
        text = renderHandbackPrompt(hb);
      } catch (err) {
        this.emitDeliveryNote(
          suRoleId,
          hb.roleId,
          `回交载荷无法渲染（${err instanceof Error ? err.message : String(err)}）——**未投递**（如实忽略；不崩）。`
        );
        return;
      }
      this.enqueueDelivery(projectRoot, suRoleId ?? "", {
        kind: "handback",
        targetRoleId: suRoleId ?? "",
        sourceRoleId: hb.roleId,
        text,
        summary: `回交投递 · 来自 ${hb.roleId}`,
        dedupKey: key,
      });
      await this.drainQueue(projectRoot, suRoleId);
    } catch (err) {
      // 兜底（belt & braces）：任何意外都如实拦截为系统行——**不产生未捕获拒绝**。
      this.emitDeliveryNote(
        this.suRoleIdOf(projectRoot),
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
   */
  private routeDispatch(projectRoot: string, fromRoleId: string, d: DispatchTaskPayload): DispatchReceipt {
    const targetRoleId = d && typeof d.roleId === "string" ? d.roleId.trim() : "";
    const task = d && typeof d.task === "string" ? d.task : "";
    const fail = (message: string, row: string): DispatchReceipt => {
      this.emitDeliveryNote(fromRoleId, fromRoleId, row);
      return { ok: false, message };
    };
    if (targetRoleId === "" || task.trim() === "") {
      return fail("派发未受理：roleId 与 task 都必须非空。", "派发未受理：roleId 与 task 都必须非空。");
    }
    const listing = this.deps.getListing(projectRoot);
    const target = listing ? listing.roles.find((r) => r.roleId === targetRoleId) : undefined;
    if (!target) {
      return fail(
        `派发未受理：角色 ${targetRoleId} 不在本项目（未枚举到）。`,
        `派发未受理：角色 ${targetRoleId} 不在本项目——**未投递**（不静默）。`
      );
    }
    if (target.builtIn === true) {
      return fail(
        `派发未受理：${targetRoleId} 是内置治理角色（su 自身或同类）——派发对象应是项目角色。`,
        `派发未受理：${targetRoleId} 是内置治理角色——**未投递**（不静默）。`
      );
    }
    const reason = d && typeof d.reason === "string" ? d.reason : undefined;
    const dedupKey = `${targetRoleId}\u0000${task}\u0000${reason ?? ""}`;
    if (this.activeDispatchKeys.has(dedupKey)) {
      return { ok: true, message: `该派发（目标 ${targetRoleId}，同任务文本）已在投递队列中——已去重，不重复投递。` };
    }
    this.activeDispatchKeys.add(dedupKey);
    this.enqueueDelivery(projectRoot, targetRoleId, {
      kind: "dispatch",
      targetRoleId,
      sourceRoleId: fromRoleId,
      // 文案单一来源应为编排 `renderDispatchPrompt`（未落地，见 `renderDispatchPromptLocal` 的登记）。
      text: renderDispatchPromptLocal(fromRoleId, { roleId: targetRoleId, task, reason }),
      summary: `派发 · 来自 ${fromRoleId}：${shortenText(task, 40)}`,
      dedupKey,
    });
    void this.drainQueue(projectRoot, targetRoleId);
    return {
      ok: true,
      message:
        `已受理：任务将投递给角色 ${targetRoleId} 的会话` +
        (this.sessions.get(targetRoleId) ? "" : "（其会话未开——将自动开启）") +
        `；投递结果/失败会在其聊天流与 su 的聊天流如实显示（受理≠已完成）。`,
    };
  }

  /** 某项目**全部**队列的放行尝试（settled 触发的重试时机——投递触发不挑目标，各队列自判忙/开）。 */
  private async drainAllQueuesFor(projectRoot: string): Promise<void> {
    const prefix = `${projectRoot}\u0000`;
    const targets: string[] = [];
    for (const k of [...this.deliveryQueues.keys()]) {
      if (k.startsWith(prefix)) targets.push(k.slice(prefix.length));
    }
    for (const t of targets) {
      await this.drainQueue(projectRoot, t);
    }
  }

  /**
   * 投递机的**安全壳 + 串行门**（真机崩溃修复 + L-1 并发修正）：本方法经 `void` fire-and-forget 调用，
   * **绝不允许上抛**（上抛＝未捕获拒绝）；且同项目的多次调用**串行**（见 `drainChains`）——真正的投递
   * 逻辑在 `drainQueueUnsafe`（逐字保留，串行门保证其不会被并发重入）。
   */
  private async drainQueue(projectRoot: string, targetRoleId: string | null): Promise<void> {
    const key = projectRoot;
    const prev = this.drainChains.get(key) ?? Promise.resolve();
    const next = prev
      .then(() => this.drainQueueUnsafe(projectRoot, targetRoleId))
      .catch((err) => {
        this.emitDeliveryNote(
          this.suRoleIdOf(projectRoot),
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
   */
  private async drainQueueUnsafe(projectRoot: string, targetRoleId: string | null): Promise<void> {
    const resolvedTarget =
      targetRoleId !== null && targetRoleId !== "" ? targetRoleId : (this.suRoleIdOf(projectRoot) ?? "");
    const key = this.queueKey(projectRoot, resolvedTarget);
    const q = this.deliveryQueues.get(key);
    if (!q || q.length === 0) return;
    const item = q[0];

    if (resolvedTarget === "") {
      const noteKey = this.queueKey(projectRoot, "");
      if (!this.suDeliveryBlockedNoted.has(noteKey)) {
        this.suDeliveryBlockedNoted.add(noteKey);
        this.emitDeliveryNote(
          null,
          item.sourceRoleId,
          `有${item.kind === "handback" ? "回交" : "派发任务"}（来自 ${item.sourceRoleId}）待投递，但当前枚举不到目标（主入口角色）——**未投递**（已保留；下次时机自动重试）。`
        );
      }
      return;
    }

    let entry = this.sessions.get(resolvedTarget);
    if (!entry || entry.projectRoot !== projectRoot) {
      // 目标会话**未开**（或属于别的项目）→ 自动开启再投（su=治理主入口；派发目标=被派角色）。
      // 后台开启（`userInitiated=false`）：**不抢活动角色**——用户正在看的会话不因投递而易主。
      const opened = await this.openInternal({ projectRoot, roleId: resolvedTarget, runtime: this.lastRuntime }, false);
      if (!opened.ok) {
        this.emitDeliveryNote(
          item.kind === "handback" ? resolvedTarget : item.sourceRoleId,
          item.sourceRoleId,
          item.kind === "handback"
            ? `有回交（来自 ${item.sourceRoleId}）待投递，但**开启 su 会话失败**：${opened.error ?? "未知原因"}——未投递（已保留；下次时机自动重试：你打开 su、或下一次回交/一轮结束）。`
            : `有派发任务（来自 ${item.sourceRoleId}）待投递给角色 ${resolvedTarget}，但**开启其会话失败**：${opened.error ?? "未知原因"}——未投递（已保留；下次时机自动重试：你打开该角色、或下一次派发/一轮结束）。`
        );
        return;
      }
      entry = this.sessions.get(resolvedTarget);
      this.suDeliveryBlockedNoted.delete(this.queueKey(projectRoot, ""));
    }
    if (!entry || entry.projectRoot !== projectRoot) return; // 防御：仍不可用则保持排队
    if (entry.busy) return; // 目标忙（有轮次在跑）：排队等 settled（绝不并发 send）

    // O-1：投递前查边界快照——陈旧 ⇒ 先作废重建（投递落到新边界会话上；失败则队列保留待重试）。
    const rebuilt = await this.rebuildIfBoundaryStale(resolvedTarget, false);
    if (rebuilt !== undefined) {
      if (!rebuilt.reopened.ok) return; // 队列保留（下次时机自动重试；失败已有如实一行）
      entry = this.sessions.get(resolvedTarget);
      if (!entry || entry.projectRoot !== projectRoot) return; // 防御：重开后仍不可用
    }

    const sent = q.shift() as DeliveryItem;
    if (q.length === 0) this.deliveryQueues.delete(key);
    this.notifyRoleState(projectRoot, resolvedTarget); // L-1：出队即外推（队列行/徽标随之更新）
    // 形状防御（真机崩溃修复的姊妹项）：条目坏了就**不投**——如实一行，绝不把 undefined 喂给 send。
    if (!sent || typeof sent.text !== "string" || sent.text === "") {
      this.emitDeliveryNote(
        sent && typeof sent.sourceRoleId === "string" ? sent.sourceRoleId : null,
        "(投递机)",
        "投递条目形状不符（缺正文/来源）——已丢弃该条并如实记行（不崩）。"
      );
      return;
    }
    // 先置忙再 await（防「open 尾部放行」与本次调用竞态导致并发 send）；失败则复位。
    entry.busy = true;
    this.notifyRoleState(projectRoot, resolvedTarget); // 状态准确性：投递开跑即外推「工作中」（shift 时快照尚为闲）
    try {
      // P0-1：**入队即定格**的整包载荷原样透传（整包同一引用；不传时调用形态与旧版逐字一致）。
      if (sent.opts === undefined) {
        await entry.handle.send(sent.text);
      } else {
        await entry.handle.send(sent.text, sent.opts);
      }
      this.activeDeliveries.set(key, sent); // 右栏「进行中」：投递已开跑（settled/失败/dispose 时清除）
      this.notifyRoleState(projectRoot, resolvedTarget); // 立即外推（running 行即时可见）
      if (sent.kind === "dispatch") this.activeDispatchKeys.delete(sent.dedupKey); // 送达即释放窗口去重（返工可再派）
      if (sent.kind === "handback") {
        this.emitDeliveryNote(resolvedTarget, sent.sourceRoleId, `已自动投递 ${sent.sourceRoleId} 的回交给 su（请其验收：确认通过 / 要求返工 / 上报客户）。`);
      } else {
        // 派发成功：目标 pane 看得见"任务到货"，su 的 pane 有一条受理回执行（受理≠已完成，如实）。
        this.emitDeliveryNote(resolvedTarget, sent.sourceRoleId, `已接收来自 ${sent.sourceRoleId} 的派发任务——请按任务文本执行，完成后交回报告。`);
        this.emitDeliveryNote(sent.sourceRoleId, sent.sourceRoleId, `已派发任务给 ${resolvedTarget}（已投递到其会话；其结果/回交会回到本会话）。`);
      }
    } catch (err) {
      // 投递失败：**如实提示 + 放回队首**（保持顺序）待重试——绝不静默丢。
      const en = this.sessions.get(resolvedTarget);
      if (en) en.busy = false;
      this.activeDeliveries.delete(key); // 「进行中」撤销（并没有在跑）
      q.unshift(sent);
      this.deliveryQueues.set(key, q);
      this.notifyRoleState(projectRoot, resolvedTarget); // 放回队首：队列快照恢复（如实）
      const base = err instanceof Error ? err.message : String(err);
      this.emitDeliveryNote(
        sent.kind === "handback" ? resolvedTarget : sent.sourceRoleId,
        sent.sourceRoleId,
        sent.kind === "handback"
          ? `回交投递失败（来自 ${sent.sourceRoleId}）：${base}——**未丢弃**，已保留待重试（下次时机自动重试）。`
          : sent.kind === "dispatch"
            ? `派发投递失败（目标 ${resolvedTarget}）：${base}——**未丢弃**，已保留待重试（下次时机自动重试）。`
            : `排队消息投递失败（角色 ${resolvedTarget}）：${base}——**未丢弃**，已保留待重试（下次时机自动重试）。`
      );
    }
  }
}
