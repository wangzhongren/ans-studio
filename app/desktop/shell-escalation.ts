// app/desktop/shell-escalation.ts
// 桌面**判拒升级卡**呈现端（2026-10-31 shell 判拒客户升级方案 v1.3 §4.3/§4.6/§6.4/§7.1/§7.2；
// T3 任务 `2026-10-31-shell-deny-customer-escalation`，节点 C1）。
//
// 归属：Interface / 桌面窗口（本角色边界内）。纯逻辑，不依赖 electron，可在 node 下单测；
// 真正的推送由**注入的 presenter** 提供（生产：主进程 `webContents.send("shell:confirm-request", …)`）。
//
// —— 它是什么 ——
// 判断 agent 主动判拒（非硬拒档）或 `manual/retry-capped` 后，角色可经 `request_shell_escalation` 对
// **这一条精确命令**申请客户确认；编排 registry 把判拒记录映射为 `ShellEscalationCardRequest`（命令逐字
// 原文、argv、cwd、judge 理由/给客户的话/替代方案、角色必要性、脚本上下文、过期时刻），本模块把它映射为
// **IPC 卡**（`kind:"escalation"`）并受理客户三选一：`allow-once` / `allow-session` / `deny`。
//
// —— 卡内容纪律（方案 §7.1/§8.1；不信任渲染/模型输入） ——
// · 命令原文/argv/cwd/judge 事实全部**逐字取自判拒记录**（registry 已保证），本模块只转抄、不加工；
// · 角色的必要性说明 `necessity` 原样携带、**不得**作为标题/选项来源——卡面由渲染侧在独立区块展示并标注
//   「由角色提供，未经验证」（i18n `ui.confirm.escalation.necessityNote`，A3 冻结）；本模块不生成任何
//   以 necessity 为来源的标题/选项；
// · 选项**固定**为三选一（`SHELL_ESCALATION_ACTIONS`），没有「允许所有/按前缀/第四决定项」。
//
// —— 回包与 fail-closed ——
// 渲染侧回包 `{kind:"escalation", id, action}`；**恰三选一合法动作**才结算，其余（未知/过期 id、重复回包、
// 非法动作）一律按失效处理（默认拒绝，绝不放行）；超时/中止/推达失败/窗口关闭 ⇒ `expired`/`unavailable`
// （方案 §4.3/§9 不变量 1）。`operatorId` 由应用注入（操作者标识），渲染侧不能自报。
//
// —— 与既有确认卡的关系（§6.4/§7.2） ——
// 复用 `confirm-card.ts` 的 pending/replay/expire 与 `shell:confirm-request`/`shell:confirm-response` 通道；
// 升级卡是同一通道上的**新卡片类型**（动作投影挂载，不动布尔 `mount/respond`）。共享呈现槽由 main.ts
// 每窗口创建并同时交给审批卡（`operator-channel.ts`）与本模块：升级卡**排他**、审批卡等待；有审批卡待答时
// 本模块返回 `{ action: "pending" }` 升级申请（不排队；E2 R2：不是默认拒绝，registry 可不消耗额度、稍后重试）。

import type {
  RuntimeKind,
  ShellApprovalContext,
  ShellEscalationAction,
  ShellEscalationCardRequest,
  ShellEscalationDecision,
  ShellEscalationPresentFn,
  ShellJudgeAlternative,
} from "../../src/model/runtime.ts";
import { normalizeArgv } from "../../src/common/shared/argv-primitives.ts";
import {
  createConfirmCardCore,
  type ConfirmCardMetadata,
  type ConfirmCardSlot,
} from "./confirm-card.ts";
import { mainT } from "./i18n.ts";
import { readConfirmTimeoutMs, renderArgvLines } from "./operator-channel.ts";

/** 升级卡三选一动作（**固定**；应用生成，角色/渲染侧不能增删或伪造）。 */
export const SHELL_ESCALATION_ACTIONS = ["allow-once", "allow-session", "deny"] as const;

/**
 * 升级卡的**IPC 数据面**（主进程 → 渲染侧 `shell:confirm-request`；只呈现，不含任何判定）。
 *
 * 字段形状（方案 v1.3 §7.1 + 本节点冻结声明）：`version`/`kind:"escalation"`/`id`/`requestId`/
 * `roleId`/`projectRoot`/`runtime`/`command`/`argv`/`cwd` 必填；judge 三字段、`necessity`、
 * `approvalContext`、`expiresAt` 可选。`id` = 桌面卡族 id（`se-<n>`，回包按它绑定）；`requestId` =
 * 编排申请 id（授权/审计的权威 id，原样透传）。
 */
export interface ShellEscalationIpcCard {
  version: 1;
  kind: "escalation";
  /** 桌面卡族 id（回包必须对 id；未知/过期 id 不放行）。 */
  id: string;
  /** 编排申请 id（授权/审计权威 id；原样透传，不用于回包绑定）。 */
  requestId: string;
  roleId: string;
  projectRoot: string;
  runtime: RuntimeKind;
  /** 判拒时的**逐字原文**（不是模型本次输入）。 */
  command: string;
  /** 规范化 argv（`splitCommand` + `normalizeArgv` 同源；registry 已规范化，本层仅转抄）。 */
  argv: string[];
  /** argv 逐项呈现行（与审批卡同一 JSON 转义口径；供折叠详情核查）。 */
  argvLines: string[];
  /** 执行工作目录（判拒记录原值）。 */
  cwd: string;
  judgeReason?: string;
  judgeCustomerMessage?: string;
  judgeAlternative?: ShellJudgeAlternative;
  /** 角色提供的一句话必要性（≤1KB/500 字符；**不可信数据**，不得作为标题/选项来源）。 */
  necessity?: string;
  /** 必要性区块的固定标注（应用生成、A3 i18n「由角色提供，未经验证」——渲染侧须在独立区块原样展示）。 */
  necessityNote?: string;
  /** 「客户手批 ≠ judge 放行」声明（应用生成、A3 i18n；渲染侧必须展示）。 */
  customerNotJudgeNote: string;
  /** 判拒时 judge 看到的同一份有界脚本上下文（如无可缺省）。 */
  approvalContext?: ShellApprovalContext;
  /** 申请过期时刻（ISO；registry 按呈现超时计算）。 */
  expiresAt?: string;
  /** 固定三选一动作（应用生成；渲染侧据此显示按钮，不得增删）。 */
  actions: readonly ShellEscalationAction[];
}

/**
 * 由 registry 的判拒卡片请求构建 IPC 卡（纯函数；只转抄 + 规范化 argv + 生成 argv 呈现行）。
 * `id` 由共享核心生成的卡族 id 传入；`requestId` 原样保留。
 */
export function buildShellEscalationIpcCard(id: string, request: ShellEscalationCardRequest): ShellEscalationIpcCard {
  const argv = normalizeArgv(request.argv);
  return {
    version: 1,
    kind: "escalation",
    id,
    requestId: request.requestId,
    roleId: request.roleId,
    projectRoot: request.projectRoot,
    runtime: request.runtime,
    command: request.command,
    argv,
    argvLines: renderArgvLines(argv),
    cwd: request.cwd,
    ...(request.judgeReason !== undefined ? { judgeReason: request.judgeReason } : {}),
    ...(request.judgeCustomerMessage !== undefined ? { judgeCustomerMessage: request.judgeCustomerMessage } : {}),
    ...(request.judgeAlternative !== undefined ? { judgeAlternative: request.judgeAlternative } : {}),
    ...(request.necessity !== undefined
      ? { necessity: request.necessity, necessityNote: mainT("ui.confirm.escalation.necessityNote") }
      : {}),
    ...(request.approvalContext !== undefined ? { approvalContext: request.approvalContext } : {}),
    ...(request.expiresAt !== undefined ? { expiresAt: request.expiresAt } : {}),
    customerNotJudgeNote: mainT("ui.confirm.escalation.customerNotJudge"),
    actions: [...SHELL_ESCALATION_ACTIONS],
  };
}

/** 升级卡呈现端（挂在主进程；渲染侧只渲染，不判定）。 */
export interface ShellEscalationPresenter {
  /** 交给编排 `openRoleSession.shellEscalationPresenter`（每会话包装后透传）。 */
  present: ShellEscalationPresentFn;
  /** 受理渲染侧决定回包（`{kind:"escalation", id, action}`）；未知/过期 id、非法动作 → expired（不放行）。 */
  respond(input: unknown): { ok: boolean; error?: string; expired?: boolean };
  /** 全部挂起 → 失效（窗口关闭等；默认拒绝，fail-closed）。 */
  rejectAllPending(reason: string): void;
  /** 当前挂起数（测试/诊断/看护「正确等待不报」）。 */
  pendingCount(): number;
  /** 按角色挂起数。 */
  pendingRoles(): Map<string, number>;
  /** 幂等重推仍挂起者（focus/show/recovery-ready 先例）；返回重推数。 */
  replayPending(): number;
  /** 共享呈现槽现在能否放行升级卡（有审批卡待答/已有升级卡 ⇒ false——申请方直接拒绝，不排队）。 */
  canPresent(): boolean;
}

export interface CreateShellEscalationPresenterOptions {
  /** 把卡推给渲染侧（主进程用 `webContents.send("shell:confirm-request", …)`；测试注入收集器）。
   *  **推达失败（窗口已关/通道异常）⇒ 抛错**——本模块归为 `unavailable`（默认拒绝）。 */
  present: (request: ShellEscalationIpcCard) => void;
  /** 共享呈现槽（与审批卡呈现端**同一实例**；缺省 ⇒ 不参与仲裁，仅供单测）。 */
  slot?: ConfirmCardSlot;
  /** 操作者标识（随 `ShellEscalationDecision.operatorId` 交给 registry；缺省/空白 ⇒ `unknown`）。 */
  operatorId?: string;
  /** 可注入环境（读取确认超时链；缺省 `process.env`）。 */
  env?: Record<string, string | undefined>;
  /** 清理兜底（毫秒；缺省 = 确认超时链 + 5000，与审批卡同口径）。 */
  cleanupAfterMs?: number;
  /** 失效通知（主进程推 `session:operator-expired`，渲染侧据此定格失效）。 */
  onExpired?: (payload: {
    id: string;
    roleId: string;
    projectRoot?: string;
    runtime?: RuntimeKind;
    reason: string;
  }) => void;
}

/** 解析回包动作：恰三选一才合法；其余（含伪造值）⇒ undefined（按失效处理，绝不放行）。 */
export function parseShellEscalationAction(value: unknown): ShellEscalationAction | undefined {
  return value === "allow-once" || value === "allow-session" || value === "deny" ? value : undefined;
}

/**
 * `shell:confirm-response` 回包路由判定（main.ts 与本模块共用；纯函数、可单测）：
 * `kind:"escalation"`，或无 `kind` 但带 `action` 字段 ⇒ 升级卡；其余（含旧渲染只发 `{id, allow}`）
 * ⇒ 既有审批卡。**无 kind 的 `{id, allow}` 绝不误路由到升级卡**（旧回包逐字兼容）。
 */
export function isShellEscalationResponse(input: unknown): boolean {
  const record = input !== null && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined;
  if (record === undefined) return false;
  if (record.kind === "escalation") return true;
  return record.kind === undefined && "action" in record;
}

/**
 * 构造升级卡呈现端。行为要点（方案 §4.3/§7.2/§9；E2 返工 R2）：
 * · 呈现前检查共享槽：有审批卡待答 / 已有升级卡 ⇒ 返回 `{ action: "pending" }`（不弹卡、不排队；
 *   **不是默认拒绝**——registry 据此不消耗申请权/额度、保持 recorded、可稍后再申请）；
 * · 客户三选一 ⇒ `{action, operatorId}`（operatorId 应用注入，渲染侧不能自报）；
 * · 超时/中止/推达失败/窗口关闭 ⇒ `expired`/`unavailable`（默认拒绝）；
 * · 未知/过期 id、重复回包、非法动作 ⇒ 不产生第二次授权（首答即终态）。
 */
export function createShellEscalationPresenter(opts: CreateShellEscalationPresenterOptions): ShellEscalationPresenter {
  const env = opts.env ?? process.env;
  const cleanupAfterMs = opts.cleanupAfterMs ?? readConfirmTimeoutMs(env) + 5000;
  const operatorId =
    typeof opts.operatorId === "string" && opts.operatorId.trim() !== "" ? opts.operatorId.trim() : "unknown";

  const core = createConfirmCardCore<ShellEscalationIpcCard>({
    idPrefix: "se-",
    eventPrefix: "shell-escalation",
    component: "desktop.shell-escalation",
    present: opts.present,
    expiredResponse: mainT("ui.confirm.escalation.expired"),
    ...(opts.slot !== undefined ? { slot: { arbitrate: opts.slot, kind: "escalation" as const } } : {}),
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

  return {
    async present(request, signal): Promise<ShellEscalationDecision> {
      // 排他检查（方案 §7.2 + E2 R2）：有审批卡待答 / 已有升级卡 ⇒ 返回 pending（不弹卡、不排队）。
      // **pending 不是默认拒绝**：registry 不得据此消耗申请权/额度/写客户决定审计；角色可稍后再申请。
      if (!core.canPresent()) {
        return { action: "pending", reason: mainT("main.operator.escalation.pending") };
      }
      const metadata: ConfirmCardMetadata = {
        roleId: request.roleId,
        projectRoot: request.projectRoot,
        runtime: request.runtime,
        ...(signal !== undefined ? { signal } : {}),
      };
      try {
        return await core.mountAction<ShellEscalationDecision>(
          (id) => buildShellEscalationIpcCard(id, request),
          (reason) => ({ action: "expired", reason }),
          (input) => {
            const action = parseShellEscalationAction(input.action);
            if (action === undefined) return undefined; // 非法动作 ⇒ 失效兜底（默认拒绝）
            return { action, operatorId };
          },
          metadata,
          {
            cleanupAfterMs,
            // 中止（超时/轮次停止/会话重建/窗口关闭）：如实「已失效」文案；语义仍是 expired（默认拒绝）。
            abortDisposition: () => ({
              reason: mainT("main.operator.expiredStopped"),
              diagnosticEvent: "shell-escalation.cancelled",
            }),
          },
        );
      } catch (error) {
        // 推达失败（窗口已关/通道异常）⇒ unavailable（fail-closed；绝不默认放行）。
        return {
          action: "unavailable",
          reason: mainT("main.operator.channelErrorRejected", {
            detail: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    },
    respond: core.respondAction,
    rejectAllPending: core.rejectAllPending,
    pendingCount: core.pendingCount,
    pendingRoles: core.pendingRoles,
    replayPending: core.replayPending,
    canPresent: core.canPresent,
  };
}
