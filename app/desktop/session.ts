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
//  - 聊天是多轮的：会话经编排 openRoleSession 建立（**只建一次**），send 反复调；
//    同一角色重复点击 = 续接当前会话（不重建）；切换角色 = 先 dispose 旧会话再开新会话。
//  - scope 传 undefined（聊天无任务收窄）；判定仍由门禁引擎负责——写入照样实时被拦。
//  - **冷启动创世（设计 §10.1 / §12.2，任务 T30）**：未 bootstrap 的空项目上，`buildProjectConfig`
//    会按 `hasRoles === false` **带上 `genesisBootstrap`**；本层照常经 `openRoleSession` 以 `scope: undefined`
//    开启内置治理角色（su）——门禁引擎据 `genesisBootstrap` 对其返回「项目根」治理种子边界，于是 su 能写出
//    治理产物（`角色卡/…` / `docs/…` / `.ans/…`），而 `src/**` 仍被拒。**项目一有角色即不再带该字段**
//    （切换在 `buildProjectConfig`，不在此处），su 随即回到普通聊天（项目边界治理）。
//  - **创世 finalize（T36）**：su 建角色**可多轮**，「settle 就 finalize」会在第 1 轮后 pin 出**半成品**，
//    故 finalize **显式触发**——**仅**创世 su 会话（`!hasRoles` 的内置治理角色）经 `openRoleSession` 开
//    `genesisFinalize: true`，句柄附带 `settled` + `finalize()`；由界面「完成 bootstrap」动作显式调（不自动跑）。
//    有角色的普通聊天**不开**，其句柄没有 `finalize`。

import type { Acceptance } from "../../src/model/boundary.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
// 会话事件流的类型：编排把 `RoleSessionHandle.events()` 放宽为 `OrchestrationEvent`（既有 `SessionEvent`
// + 编排在 `settled` 时追加的 `handback` 回交事件，设计 §10.8）。**类型从编排的模块只读导入、不复制形状**
// （单一来源：`src/common/编排/handback.ts`，也是 `run-role.ts` 导入它的位置）。
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { WriteGate, RuntimeAdapter, ShellGate, OperatorChannelFn } from "../../src/provider/pi/session.ts";
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
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export interface StopResult {
  ok: boolean;
  note: string;
}

/**
 * **创世 finalize 能力**（T36 接线）：会话句柄上的 `finalize()` 只在创世 su 会话上存在；其返回形状
 * **从编排的公开句柄类型派生**（`RoleSessionHandle["finalize"]` 的返回）——**不导入编排私有
 * `src/common/编排/finalize.ts`**（工程法案 §6 禁跨角色导入他人私有 `common/`）。故形状由编排的**公开面**
 * 唯一决定，本层不自造第二份定义。
 */
export type FinalizeResult = Awaited<ReturnType<NonNullable<RoleSessionHandle["finalize"]>>>;

/**
 * 「完成 bootstrap」动作的可见性/就绪状态（供界面**如实呈现**该入口；界面只读此结构、不另作判定）。
 *  · `available` —— 当前会话是否**应**提供「完成 bootstrap」动作：**仅创世 su 会话**（未 bootstrap 项目上
 *    开启的内置治理角色会话，`genesisFinalize` 已开）**且尚未 finalize 过**时为真。**有角色的普通聊天
 *    恒为假**（那些会话的句柄根本没有 `finalize`）。
 *  · `settled` —— 会话是否已 settle **至少一轮**（su 是否说过话）：界面据它提示「该不该现在点」——
 *    未 settle 时点会被拒（无可 pin 之物）。
 *  · `finalized` —— 本会话是否**已成功** finalize 过（成功后界面应隐藏该动作）。
 */
export interface BootstrapState {
  available: boolean;
  settled: boolean;
  finalized: boolean;
}

export interface SessionManagerDeps {
  /** 建会话（缺省为编排的 openRoleSession；注入以便单测）。`genesisFinalize` 为本层新接入的**可选**开关
   *  （T36）——仅对创世 su 会话置真；编排的 `openRoleSession` 接受它并据此给句柄附带 `settled`/`finalize()`。 */
  openRoleSession: (
    input: {
      roleId: string;
      project: ProjectConfig;
      taskId?: string;
      scope?: undefined;
      /** **创世 finalize 开关**（可选，T36）：仅创世 su 会话置真（见 SessionManager.open）。 */
      genesisFinalize?: boolean;
      /**
       * **客户确认通道**（可选，T38）：提议收口时经它挂起问客户（**复用 shell 闸 (a) 通道、不造第二套**）。
       * 缺省/不可用/超时/拒绝 → **不完成**（fail-closed）。仅创世 finalize 会话消费。
       */
      operatorChannel?: OperatorChannelFn;
      /** 客户确认硬超时（毫秒）；缺省 120000。**超时 = 不完成**。 */
      confirmTimeoutMs?: number;
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
   * 会话事件外推。**入参为编排导出的 `OrchestrationEvent`**（= 既有 `SessionEvent` + 编排在 `settled`
   * 时追加的 `handback` 回交事件，设计 §10.8）——与 `RoleSessionHandle.events()` 同为编排的 `OrchestrationEvent`，
   * 二者类型匹配；渲染侧据此呈现「回交 su」卡片。**类型从编排导入，不在此另立一份。**
   */
  emitEvent: (ev: OrchestrationEvent) => void;
  /**
   * shell 命令级闸（设计 §7.2）——**arm 接缝**。
   *
   * **V1 桌面不 arm**（`DESKTOP_SHELL_GATE_ARMED === false`，见 `app/desktop/operator-channel.ts`）：
   * 缺省（忽略此字段）⇒ 不传 ⇒ Pi 适配器**不注册 `run_shell`**（能力缺席 = 最强 fail-closed，§7.5.1）。
   * 此字段只为「**可对接**」而存在——一旦客户拍板 arm、且**编排**（T8）用桌面操作者通道 (a)
   * 装配好 (c)(b)(a) 的 `ShellGate`，把该 gate 从这里注入即可合闸；**当前无调用方提供它**，
   * 故通道就绪但**未被消费**（如实标注，不假装在用）。
   *
   * 注：arm 只对 **pi 运行时**有效——demo 路径经 `createDemoAdapter`（无 shell 入口，只判不写）。
   */
  shellGate?: ShellGate;
  /**
   * **客户确认通道（T38）**——finalize 收口时经它把「su 提议收口」摆给客户确认（**复用既有 (a)
   * `OperatorChannelFn` 通道、不造第二套**）。缺省 ⇒ 不注入 ⇒ finalize 收口时「未接入客户确认通道」→
   * **不完成**（fail-closed，§13.1）。仅**创世 finalize 会话**消费（普通聊天不使用）。
   *
   * 桌面由主进程用 `app/desktop/operator-channel.ts::createDesktopOperatorChannel`（presenter 把提议渲染为
   * 聊天流里的一张确认卡）构造后注入。**通道本身不含任何判定**（它只呈现提议、取回客户选择）。
   */
  operatorChannel?: OperatorChannelFn;
  /** 客户确认硬超时（毫秒）；缺省 120000（`DEFAULT_CONFIRM_TIMEOUT_MS`）。**超时 = 不完成**。 */
  confirmTimeoutMs?: number;
}

/** 会话管理器：持有枚举缓存与当前打开的会话句柄；点角色即开，多轮直发。 */
export class SessionManager {
  private readonly deps: SessionManagerDeps;
  private readonly loadEffectiveConfig: (opts: LoadConfigOptions) => Promise<LoadedConfig>;
  private handle: RoleSessionHandle | null = null;
  private openRoleId: string | null = null;
  /** 当前会话生效的配置来源（续接时随 OpenResult 一并如实带回）。 */
  private openConfig: EffectiveConfigInfo | undefined;
  /** 当前会话是否由「创世 su 会话」开启（句柄带 `finalize` 能力，T36）——决定「完成 bootstrap」入口是否可给。 */
  private usesFinalize = false;
  /** 当前会话是否已**成功** finalize 过（成功后界面隐藏该动作）。 */
  private finalized = false;

  constructor(deps: SessionManagerDeps) {
    this.deps = deps;
    this.loadEffectiveConfig = deps.loadEffectiveConfig ?? defaultLoadEffectiveConfig;
  }

  /**
   * 点角色 → 直接建立会话（无确认框）。
   *  - 同一角色重复点击：续接当前会话（不重建，消息继续在此会话中发送）；
   *  - 不同角色：先 dispose 当前会话，再开新会话（一个会话只服务一个角色）。
   */
  async open(req: SessionOpenRequest): Promise<OpenResult> {
    if (!req.projectRoot || !req.roleId) {
      return { ok: false, error: "缺少项目根或角色 id。" };
    }
    if (this.handle && this.openRoleId === req.roleId) {
      return { ok: true, note: "已在该角色的会话中，续接当前会话。", config: this.openConfig };
    }
    if (this.handle) {
      const stopped = await this.stop();
      if (!stopped.ok) {
        return { ok: false, error: `关闭上一个会话失败：${stopped.note}` };
      }
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

    // ——— 创世 finalize 开关（T36）：**仅**未 bootstrap 项目上的**内置治理角色（su）**会话置真 ———
    //
    // 判据 = 「项目未 bootstrap」（门禁引擎枚举给出的 `!hasRoles`）**且**「本角色是内置治理角色」
    // （`role.builtIn`，数据驱动、**不硬编码 "su"**）。**有角色的普通聊天一律不置真**——普通角色（含回到
    // 普通边界后的 su）的会话**不该**开 finalize：它们不是「创世建角色」的写入者，其句柄本就不带
    // `finalize()`。置真后编排 `openRoleSession` 给句柄附带 `settled` + `finalize()`（与 su 同一授权边界，
    // 写入同样经 `resolveWrite`；**不自动跑**，时机由界面显式触发）。
    const genesisFinalize = listing.hasRoles === false && role.builtIn === true;

    // pi 路径把 arm 接缝（shellGate，缺省 undefined = 不 arm）透传给编排的真实适配器工厂
    // （`createPiAdapterFactory(project, shellGate?)` 是编排已冻结的签名，此处不发明新形状）。
    // undefined ⇒ Pi 适配器不注册 run_shell（§7.5.1）。demo 路径无 shell 入口，与本接缝无关。
    const createAdapter: (gate: WriteGate) => RuntimeAdapter =
      req.runtime === "pi"
        ? this.deps.createPiAdapterFactory(project, this.deps.shellGate)
        : (gate) => this.deps.createDemoAdapter({ gate, boundary });

    try {
      // scope 传 undefined：聊天无预先任务，授权上界 = 角色边界本身（门禁引擎据此不做 F4 收窄）。
      //
      // **会话路径裁决（T30）：沿用 `openRoleSession` + `scope: undefined`，不改走 `openGovernanceSession`。**
      // 理由（§12.2）：创世的门口放在**边界选择层**（`genesisBootstrap`，由 `buildProjectConfig` 按
      // `hasRoles` 设），`scope` 保持 `undefined`（普通聊天）。而 `openGovernanceSession` 现仍在**内部**
      // 用 `buildGovernScope(boundary, roleIds)` 造 scope（且开会话前先经 `writeGovernanceSkeleton` 落骨架，
      // 属 T32 待退役面）——对空项目它会产出 `writeSet: []`，F4 精确匹配下**拒一切写**，与 §12.2
      // 「`scope: undefined`」相悖；要让它表达 `scope: undefined` 须改它本身，而它属**编排**边界
      // （`src/pipeline/orchestration/`），非本角色可动。故：本层**沿用既有的 `openRoleSession`**——
      // 它本就是 `openGovernanceSession` 内部**同样经其开启会话**的**同一底层会话入口**（govern-session.ts:121），
      // **不是第二套会话机制**；此处只把「未 bootstrap」这一授权事实经 `genesisBootstrap` 交给门禁引擎。
      this.handle = await this.deps.openRoleSession(
        {
          roleId: req.roleId,
          project,
          ...(genesisFinalize ? { genesisFinalize: true } : {}),
          // 客户确认通道（T38）：**仅创世 finalize 会话**注入——finalize 收口时经它把「su 提议收口」摆给
          // 客户确认（复用既有 (a) 通道、不造第二套）。有角色的普通聊天逐字不传（不消费该通道）。
          ...(genesisFinalize && this.deps.operatorChannel
            ? {
                operatorChannel: this.deps.operatorChannel,
                ...(this.deps.confirmTimeoutMs !== undefined ? { confirmTimeoutMs: this.deps.confirmTimeoutMs } : {}),
              }
            : {}),
        },
        { createAdapter },
      );
    } catch (err) {
      this.handle = null;
      this.openRoleId = null;
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    this.openRoleId = req.roleId;
    this.openConfig = config;
    // finalize 能力随新会话重置：句柄是否带 `finalize`（创世 su 会话才有），以及本会话是否已 finalize 过。
    this.usesFinalize = typeof this.handle.finalize === "function";
    this.finalized = false;
    this.consume();
    this.deps.emitEvent({
      kind: "message",
      summary: `已开启与角色 ${req.roleId} 的会话（运行时 ${req.runtime}）。直接发消息即可；写入由门禁在后台把关。`,
    });
    return { ok: true, config };
  }

  /** 事件消费循环：把句柄的事件流持续外推到渲染侧，直到会话收口。 */
  private consume(): void {
    const handle = this.handle;
    if (!handle) return;
    void (async () => {
      try {
        for await (const ev of handle.events()) {
          try {
            this.deps.emitEvent(ev);
          } catch {
            // 外推失败（如窗口已关）不得影响会话本身。
          }
        }
      } catch (err) {
        this.deps.emitEvent({ kind: "message", summary: `会话事件流异常：${err instanceof Error ? err.message : String(err)}` });
      }
    })();
  }

  /** 发送一轮消息；可反复调用。 */
  async send(text: string): Promise<SendResult> {
    if (!this.handle) {
      return { ok: false, error: "会话尚未开启（点击左侧角色即可开启）。" };
    }
    try {
      await this.handle.send(text);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** 关闭会话（切换角色或关闭窗口时调用）。 */
  async stop(): Promise<StopResult> {
    if (!this.handle) {
      return { ok: false, note: "当前没有打开的会话。" };
    }
    const handle = this.handle;
    this.handle = null;
    this.openRoleId = null;
    this.openConfig = undefined;
    this.usesFinalize = false;
    this.finalized = false;
    try {
      await handle.dispose();
    } catch (err) {
      return { ok: false, note: `释放会话出错：${err instanceof Error ? err.message : String(err)}` };
    }
    return { ok: true, note: "会话已关闭。" };
  }

  isOpen(): boolean {
    return this.handle !== null;
  }

  openForRoleId(): string | null {
    return this.openRoleId;
  }

  /**
   * 「完成 bootstrap」动作的**当前状态**（T36；供界面如实呈现入口）。纯读、无副作用。
   *  · 非创世 su 会话（普通聊天 / 未开会话）→ `available:false`（那些会话没有 finalize 能力）；
   *  · 创世 su 会话且尚未 finalize 过 → `available:true`，`settled` 据句柄的活取值（su 是否说过话）。
   */
  bootstrapState(): BootstrapState {
    const handle = this.handle;
    if (!handle || !this.usesFinalize || typeof handle.finalize !== "function") {
      return { available: false, settled: false, finalized: this.finalized };
    }
    return { available: !this.finalized, settled: handle.settled === true, finalized: this.finalized };
  }

  /**
   * **完成 bootstrap**（T36/T38）：把当前创世 su 会话的 `finalize()` 转调出去。**T37 语义**：`finalize()`
   * **不再「调用即完成」**——它是「**su 提议收口 → 挂起等客户确认 → 确认通过才落盘**」（经注入的
   * `operatorChannel`，复用 shell 闸 (a) 通道）：确认通过后由代码（非模型）算各边界文件的 SHA-256、
   * 写 `.ans/project.json`（pin）+ `docs/bootstrap-manifest.md`（逐路径留痕）+ 项目治理边界文档。
   * **fail-closed**：未接确认通道 / 客户拒绝 / 超时 / 通道不可用 → **不完成**（`ok:false`）。
   *
   * **显式触发**（不自动跑）。**失败路径如实转达**：被拒（未 settle / 无可 pin 之物 / 门禁拒绝 /
   * 客户拒绝 / 超时）时返回 `ok:false` + `reason`，**不静默、不假装成功**。成功后记 `finalized`
   * （界面据此把入口读作「项目已转正」——su 仍可继续加/改角色）。
   *
   * 仅创世 su 会话可达：其它会话的句柄没有 `finalize`，此时如实返回一个 `ok:false` 结果（不假装具备能力）。
   */
  async finalizeBootstrap(): Promise<FinalizeResult> {
    const handle = this.handle;
    if (!handle || typeof handle.finalize !== "function") {
      return {
        ok: false,
        reason:
          "当前会话不支持 finalize：仅「未 bootstrap 项目上开启的内置治理角色（su）会话」可完成 bootstrap。",
        wrote: [],
        pins: [],
        roles: [],
        projectJsonRel: "",
        manifestRel: "",
      };
    }
    try {
      const result = await handle.finalize();
      if (result.ok) this.finalized = true;
      return result;
    } catch (err) {
      return {
        ok: false,
        reason: `finalize 异常：${err instanceof Error ? err.message : String(err)}`,
        wrote: [],
        pins: [],
        roles: [],
        projectJsonRel: "",
        manifestRel: "",
      };
    }
  }
}
