// app/desktop/interface.ts
// 桌面应用的 Interface 层：IPC 通道背后的处理器（纯逻辑，不依赖 electron，可在 node 下单测）。
//
// 分层纪律（设计稿 §4、硬约束）：
//  - 主进程只持 Interface 句柄：本层调用门禁引擎（listProject）与编排（openRoleSession），不重实现判定/解析；
//  - 渲染进程不接触 Node/文件系统：一切经本层；
//  - 「导入项目 = 授权；点角色即开聊天」由 SessionManager 强制：无确认弹窗，多轮 send 直发。

import type { BoundarySection1 } from "../../src/model/boundary.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
// 会话事件流类型：编排把 `RoleSessionHandle.events()` 放宽为 `OrchestrationEvent`（既有 `SessionEvent`
// + 编排在 `settled` 时追加的 `handback` 回交事件，设计 §10.8）。**从编排的模块只读导入、不复制形状。**
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { WriteGate, RuntimeAdapter, ShellGate, OperatorChannelFn } from "../../src/provider/pi/session.ts";

import { listProject as realListProject } from "../../src/service/role/resolve-role.ts";
import {
  openRoleSession as realOpenRoleSession,
  createPiAdapterFactory as realCreatePiAdapterFactory,
} from "../../src/pipeline/orchestration/run-role.ts";
import { createChatDemoAdapter } from "./chat-adapter.ts";

import {
  buildProjectConfig as realBuildProjectConfig,
  readRoleDocsIndex,
  type DocsIndexEntry,
} from "./project.ts";
import {
  SessionManager,
  type SessionOpenRequest,
  type OpenResult,
  type SendResult,
  type StopResult,
  type BootstrapState,
  type FinalizeResult,
} from "./session.ts";
// Pi 配置面板逻辑（纯逻辑）：读写仓库根 `.env`（**经共享模块，只读导入、不复制**，设计 §11/T28）。
import {
  getPiConfig as realGetPiConfig,
  savePiConfig as realSavePiConfig,
  resolveRepoEnvPath,
  type PiConfigView,
  type PiConfigSaveResult,
  type PiConfigEnv,
} from "./pi-config.ts";

export interface RoleView {
  roleId: string;
  cardPath: string;
  boundaryPath: string;
  cardText: string;
  boundary: BoundarySection1;
  /** 内置治理角色（su）：无角色目录、无 docs 索引。 */
  builtIn: boolean;
  changelog: { path: string; text: string } | null;
  docs: DocsIndexEntry[];
}

export interface ListProjectResult {
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

export interface DesktopDeps {
  /** 系统文件夹选择器（由主进程用 electron dialog 注入；测试可注入假实现）。 */
  pickDirectory: () => Promise<string | null>;
  /** 会话事件外推（主进程用它 webContents.send; 测试可注入收集器）。**入参为编排导出的
   *  `OrchestrationEvent`**（既有 `SessionEvent` + `handback` 回交事件，§10.8）——与 `RoleSessionHandle.events()`
   *  同型；**类型从编排导入，不在此另立一份**。 */
  emitEvent: (ev: OrchestrationEvent) => void;
  // —— 可注入的下游实现（默认用真实实现；单测可替换以隔离）——
  listProjectFn?: (root: string) => Promise<ProjectListing>;
  openRoleSessionFn?: (
    input: {
      roleId: string;
      project: ProjectConfig;
      taskId?: string;
      scope?: undefined;
      genesisFinalize?: boolean;
      operatorChannel?: OperatorChannelFn;
      confirmTimeoutMs?: number;
    },
    deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter },
  ) => Promise<RoleSessionHandle>;
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
   * shell 命令级闸（设计 §7.2）——**arm 接缝**。**V1 桌面不 arm**：缺省（不提供）⇒ 不注入 ⇒
   * Pi 适配器不注册 `run_shell`（能力缺席 = 最强 fail-closed，§7.5.1）。仅当客户拍板 arm、且编排（T8）
   * 用桌面操作者通道 (a) 装配好 `ShellGate` 后，才由主进程在此传入。**当前无调用方提供它**（如实标注）。
   */
  shellGate?: ShellGate;
  /**
   * **客户确认通道（T38）**——finalize 收口时把「su 提议收口」摆给客户确认（**复用既有 (a)
   * `OperatorChannelFn` 通道、不造第二套**）。缺省 ⇒ 不注入 ⇒ 收口时「未接入客户确认通道」→ **不完成**
   * （fail-closed，§13.1）。桌面由主进程用 `createDesktopOperatorChannel`（presenter 把提议渲染为聊天流里
   * 一张确认卡）构造后传入。**测试/e2e 可注入替身**（避免弹系统对话框）。
   */
  operatorChannel?: OperatorChannelFn;
  /** 客户确认硬超时（毫秒）；缺省 120000。**超时 = 不完成**。 */
  confirmTimeoutMs?: number;
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
}

export interface DesktopInterface {
  pickProject(): Promise<string | null>;
  listProject(input: { projectRoot: string }): Promise<ListProjectResult>;
  /** 点角色即开：直接建立与该角色的会话（无确认框）。 */
  openSession(input: SessionOpenRequest): Promise<OpenResult>;
  sendSession(input: { text: string }): Promise<SendResult>;
  stopSession(): Promise<StopResult>;
  /**
   * 「完成 bootstrap」动作的**可见性/就绪状态**（T36）。**仅创世 su 会话**（未 bootstrap 项目上开启的内置
   * 治理角色会话）可能 `available`；`settled` 供界面提示「该不该现在点」。纯读、无副作用。
   */
  getBootstrapState(): Promise<BootstrapState>;
  /**
   * **显式完成 bootstrap**（T36）：由代码算 SHA-256、写 `.ans/project.json`（pin）+ `docs/bootstrap-manifest.md`
   * （逐路径留痕）。**显式触发**（不自动跑）；**失败如实返回** `{ok:false, reason}`（未 settle / 无可 pin 之物 /
   * 门禁拒绝），**不静默、不假装成功**。仅创世 su 会话可达。
   */
  finalizeBootstrap(): Promise<FinalizeResult>;
  /** 读取 Pi 配置面板视图（机密键值**不外发**，见 `pi-config.ts`）。 */
  getPiConfig(): Promise<PiConfigView>;
  /** 保存 Pi 配置到 `.env`（只改面板键、原子；成功后重载 env，下一会话生效）。 */
  savePiConfig(input: { updates: Record<string, string> }): Promise<PiConfigSaveResult>;
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

  const listingCache = new Map<string, ProjectListing>();

  /** 当前打开的角色是否为主入口角色（据门禁引擎给的 `primaryRoleId`，**不硬编码 "su"**）。 */
  const isPrimaryRoleOpen = (): boolean => {
    const openId = manager.openForRoleId();
    if (!openId) return false;
    for (const l of listingCache.values()) {
      if (l.primaryRoleId === openId) return true;
    }
    return false;
  };

  // 会话事件外推：先原样转发（主进程推 `session:event`）；再在「**主入口角色**一轮结束（`settled`）」时
  // 触发「项目可能已变」信号（→ 主进程推 `project:changed` → 渲染侧重取枚举，左树随 su 建角色而长出，§10.3）。
  // 本层只转达信号，**不判定**写入是否发生（判定唯一来自门禁引擎）。
  const emitSessionEvent = (ev: OrchestrationEvent): void => {
    deps.emitEvent(ev);
    if (ev.kind === "settled" && isPrimaryRoleOpen()) {
      deps.emitProjectChanged?.();
    }
  };

  const manager = new SessionManager({
    openRoleSession: openRoleSessionFn,
    createPiAdapterFactory: createPiAdapterFactoryFn,
    createDemoAdapter: createDemoAdapterFn,
    buildProjectConfig: buildProjectConfigFn,
    getListing: (root) => listingCache.get(root),
    emitEvent: emitSessionEvent,
    shellGate: deps.shellGate,
    // 客户确认通道（T38）：finalize 收口时经它把提议摆给客户确认（仅创世 finalize 会话消费）。
    operatorChannel: deps.operatorChannel,
    confirmTimeoutMs: deps.confirmTimeoutMs,
  });

  return {
    async pickProject(): Promise<string | null> {
      return deps.pickDirectory();
    },

    async listProject(input): Promise<ListProjectResult> {
      const projectRoot = input.projectRoot;
      if (typeof projectRoot !== "string" || projectRoot.trim() === "") {
        throw new Error("缺少项目根路径。");
      }
      // 门禁引擎：唯一枚举来源，界面侧不重写解析。
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
        roles.push({
          roleId: r.roleId,
          cardPath: r.cardPath,
          boundaryPath: r.boundaryPath,
          cardText: r.cardText,
          boundary: r.boundary,
          builtIn: r.builtIn === true,
          changelog,
          docs,
        });
      }
      return {
        projectRoot: listing.projectRoot,
        roles,
        warnings: listing.warnings,
        // 原样转自门禁引擎（单一来源）：hasRoles 供「尚未 bootstrap」判断、primaryRoleId 供主位/默认选中。
        hasRoles: listing.hasRoles,
        primaryRoleId: listing.primaryRoleId,
      };
    },

    async openSession(input): Promise<OpenResult> {
      return manager.open(input);
    },

    async sendSession(input: { text: string }): Promise<SendResult> {
      return manager.send(input.text);
    },

    async stopSession(): Promise<StopResult> {
      return manager.stop();
    },

    // —— 创世 finalize（T36）：由界面「完成 bootstrap」动作显式触发（不自动跑）——
    // 逻辑全在 SessionManager：本层只透传；判定/落盘的唯一实现在编排 `openRoleSession` 附带的 finalize 能力
    // （经 `createSessionFinalizer`），写入同样经门禁 `resolveWrite`（不绕门，被拒即零副作用）。
    async getBootstrapState(): Promise<BootstrapState> {
      return manager.bootstrapState();
    },

    async finalizeBootstrap(): Promise<FinalizeResult> {
      return manager.finalizeBootstrap();
    },

    // —— Pi 配置面板（设计 §11/T28）——
    // 读写 **仓库根 `.env`**（路径经 `envFilePath` 注入；默认 `resolveRepoEnvPath()`）。
    // 逻辑全在 `pi-config.ts`（**经共享 `env-file` 模块，只读导入、不复制**）：本层只透传。
    // 机密键的值**绝不外发**（`getPiConfig` 对其恒返回空串）；保存回报**只含键名**。
    async getPiConfig(): Promise<PiConfigView> {
      return getPiConfigFn(envFilePath);
    },

    async savePiConfig(input: { updates: Record<string, string> }): Promise<PiConfigSaveResult> {
      const updates = input && typeof input.updates === "object" && input.updates !== null ? input.updates : {};
      // 保存成功后由 `savePiConfig` 内部重载 env（下一会话用新值）；`piConfigEnv` 可注入以隔离单测。
      return savePiConfigFn({ envPath: envFilePath, updates, env: deps.piConfigEnv });
    },
  };
}
