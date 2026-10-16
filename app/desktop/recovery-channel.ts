// app/desktop/recovery-channel.ts
// 桌面**恢复确认卡**（G-2/W5，2026-10-16 客户批准；设计 `..._design_role-watchdog-and-closure.md` §六）。
//
// 归属：Interface / 桌面窗口（本角色边界内）。纯逻辑，不依赖 electron，可在 node 下单测；
// 真正的推送由**注入的 presenter** 提供（生产：主进程 `webContents.send("recovery:confirm-request", …)`）。
//
// —— 它是什么 ——
// su 经 `propose_recovery` 工具**提议**恢复动作（停止本轮 / 重建会话 / 重投任务，带证据）——工具 handler
// 把载荷交给桌面（本角色 W5 桥，见 session.ts::proposeRecovery）。桌面校验后**把卡摆给客户**：客户看
// 「角色 / 动作 / 证据逐字 / 执行或取消（默认取消）」——**恰 `allow:true` 才执行**；拒绝/取消/关窗/通道
// 失效一律 = **未获执行**（fail-closed，如实回执 su，绝不「没人问就执行」）。
//
// —— 时限：不设限（裁定 4）——
// 沿 G-1「等待客户不设限」：本卡**无任何兜底计时器**；唯一的「失效」= 应用关闭/窗口关闭（`rejectAllPending`）
// 或 su 那一轮停止/会话重建（组合信号中止）。关窗 = 未获执行（fail-closed 方向）。
//
// —— 机制复用 ——
// pending/replay/expire 与 shell 确认卡**共享同一通用件**（`confirm-card.ts`；同角色内共享，无跨角色问题
// ——设计 §6.2「实现建议」）。渲染侧复用既有确认卡组件族（桌面UI/U1 的活）。

import { createConfirmCardCore, type ConfirmCardMetadata } from "./confirm-card.ts";
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";

/** G-2 恢复动作集（V1 钉死三项；PM 已按提案采纳）。 */
export const RECOVERY_ACTIONS = ["abort-turn", "rebuild-session", "redeliver"] as const;
export type RecoveryAction = (typeof RECOVERY_ACTIONS)[number];

export function isRecoveryAction(value: unknown): value is RecoveryAction {
  return typeof value === "string" && (RECOVERY_ACTIONS as readonly string[]).includes(value);
}

/** 一张恢复确认卡的**数据面**（主进程 → 渲染侧 `recovery:confirm-request`；只呈现，不含任何判定）。
 *  形状与桌面UI（U1）已落树消费面**逐字段对齐**（renderer.js::onRecoveryConfirm 注释即契约）：
 *  `{ id, projectRoot?, runtime?, roleId, action, evidence, reason?, requestedBy?, requestedAt?, itemId? }`
 *  ——`evidence` 逐字；`requestedBy`/`requestedAt`/`itemId` 可选（缺省则渲染侧对应位隐藏，不假装有值）；
 *  `projectRoot`/`runtime` **建议随带**（沿 `shell:confirm-request` 先例——否则异引擎视图经 `Rt.matchesView`
 *  会被丢弃）。动作的人话标签由渲染侧 `UiLabels.recoveryActionView` 映射（本侧不下发人话字段）。 */
export interface RecoveryConfirmRequest {
  id: string;
  /** 卡所属项目/引擎（随带——渲染侧按当前视图过滤，异视图不打扰）。 */
  projectRoot?: string;
  runtime?: RuntimeKind;
  /** 被恢复的**目标角色** id（卡的主对象——不是提议者）。 */
  roleId: string;
  action: RecoveryAction;
  /** su 提交的**证据**（逐字、不加工、不截断——它是客户判断的依据）。 */
  evidence: string;
  /** 可选原因（同逐字纪律；无则缺省）。 */
  reason?: string;
  /** 提议者（su）的角色 id（呈现「由 su 提议、客户一键确认」）。 */
  requestedBy?: string;
  /** 提议时刻（ISO——渲染侧本地化展示；解析不了则不显示，不假装有时间）。 */
  requestedAt?: string;
  /** `redeliver` 可选的针对条目 id（= 队列条目视图的 `id`）；无则缺省。 */
  itemId?: string;
}

/** 挂起时的入参（id 由呈现端生成——调用方不见 id）。 */
export type RecoveryConfirmRequestInput = Omit<RecoveryConfirmRequest, "id">;

export interface RecoveryConfirmPresenter {
  /** 挂起一张恢复确认卡：**恰 `allow:true` 才 resolve(true)**；拒绝/关窗/失效 ⇒ false（未获执行）。 */
  present: (request: RecoveryConfirmRequestInput, metadata?: ConfirmCardMetadata) => Promise<boolean>;
  /** 受理渲染侧的决定回包（`{id, allow}`）：恰 allow:true 才为真；未知/已失效 → expired（绝不当执行）。 */
  respond: (input: unknown) => { ok: boolean; error?: string; expired?: boolean };
  /** 全部挂起 → 未获执行（窗口关闭等；fail-closed）。 */
  rejectAllPending: (reason: string) => void;
  /** 当前挂起数（测试/诊断）。 */
  pendingCount: () => number;
  /** 按角色挂起数（W1「正确等待不报」的按角色 pending 视图；恢复卡挂在 su 轮内 ⇒ 归提议者角色）。 */
  pendingRoles: () => Map<string, number>;
  /** 幂等重推仍挂起者（focus/show/app:recovery-ready 先例）。 */
  replayPending: () => number;
  /** 展示操作者标识（回执「确认者」栏用；主进程注入 `desktopOperatorId()`）。 */
  operatorId: string;
}

export interface CreateRecoveryConfirmPresenterOptions {
  /** 把卡推给渲染侧（主进程用 `webContents.send("recovery:confirm-request", …)`；测试注入收集器）。
   *  **推达失败（窗口已关/通道异常）⇒ 抛错**——调用方（恢复桥）归为「未获执行」，fail-closed。 */
  present: (request: RecoveryConfirmRequest) => void;
  onExpired?: (payload: { id: string; roleId: string; projectRoot?: string; runtime?: RuntimeKind; reason: string }) => void;
  /** 操作者标识（缺省 unknown；主进程应注入 `os.userInfo().username`）。 */
  operatorId?: string;
}

export function createRecoveryConfirmPresenter(opts: CreateRecoveryConfirmPresenterOptions): RecoveryConfirmPresenter {
  const core = createConfirmCardCore<RecoveryConfirmRequest>({
    idPrefix: "rp-",
    eventPrefix: "recovery-confirm",
    component: "desktop.recovery-confirm",
    present: opts.present,
    expiredResponse: "此恢复确认已失效（应用关闭或会话已重建），**未获执行**——可让 su 重新提议。",
    onExpired: (payload) => {
      opts.onExpired?.({
        id: payload.id,
        roleId: payload.metadata?.roleId ?? "",
        ...(payload.metadata?.projectRoot !== undefined ? { projectRoot: payload.metadata.projectRoot } : {}),
        ...(payload.metadata?.runtime !== undefined ? { runtime: payload.metadata.runtime } : {}),
        reason: payload.reason,
      });
    },
  });
  const operatorId = typeof opts.operatorId === "string" && opts.operatorId.trim() !== "" ? opts.operatorId : "unknown";
  return {
    present: (request, metadata) => core.mount((id) => ({ id, ...request }), metadata), // **不设限**：无 cleanupAfterMs（裁定 4）
    respond: core.respond,
    rejectAllPending: core.rejectAllPending,
    pendingCount: core.pendingCount,
    pendingRoles: core.pendingRoles,
    replayPending: core.replayPending,
    operatorId,
  };
}
