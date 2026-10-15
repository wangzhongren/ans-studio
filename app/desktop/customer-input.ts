// app/desktop/customer-input.ts
// 桌面应用的**客户确认制交互通道**（设计 A-1/A-5，2026-10-12）——su 的 `request_confirmation` /
// `request_choice` 两工具挂起等客户作答时，经本模块把请求摆到界面上并取回裁决。
//
// 归属：Interface / 桌面窗口（本角色边界内）。纯逻辑，**不依赖 electron**，可在 node 下单测；
// 真正的推送/呈现由**注入的 presenter** 提供（主进程经 `session:operator-request` 推到渲染侧的交互卡）。
//
// —— 契约（**单一来源 = §4 冻结契约家** `src/model/runtime.ts`）——
// 入参 `CustomerInputRequest`（confirm：title/preview?/detail?；choice：title/question?/options/multiple?/preview?）
// 与出参 `CustomerInputOutcome`（answered / declined / unavailable 三态）**只读导入、原样转出**——
// 同一契约只许一个形状（同 operator-channel.ts 的既有惯例）。**时限（G-1，2026-10-12 客户裁定）**：
// **不按时间过期**——客户原话「没必要超时啊，就卡在这等客户同意呗」；本模块**无任何计时器**
// （无 setTimeout/setInterval，测试有钉子）。历史遗留的工具层 `withTimeout`（若仍启用）不属本模块——
// 去时限是 **Pi适配器** 的职责（见 change 文档的跨角色建议）。
//
// —— 本模块不做任何判定（硬约束：不得出现第二份判定实现）——
// 「确认后哪些路径可写」的**发行**在编排（`common/编排/confirmed-writes.ts`）；「写不写」在 gate 与文件工具。
// 本模块**只**：把请求如实呈现给客户、取回客户的选择、把「选择」**按请求快照校验**后归成冻结三态，
// 一切不确定情形（未接线 / 抛错 / 非法回包）落**未获同意**（fail-closed）。**绝不悄悄放行。**
//
// —— fail-closed 四条（设计 A-5；G-1 修订）——
//   · 未接线（无 presenter）→ `unavailable`（不挂起、不留悬案）；
//   · 窗口已关（presenter 抛错 / 通道被 rejectAll）→ `declined`（UI 侧同向：窗关 = 不同答）——**未获同意**；
//   · 客户点「不同意 / 取消」→ `declined`；**空选择/缺字段/非法回包 → 拒绝受理**（不落三态、不回挂起）；
//   · **时限：G-1 起无**——卡片可**无限期**待答；唯一的"消失"= **应用关闭/重启**（未决请求随窗口清空），
//     重启后对旧 id 的回包按**失效终态**受理（`expired:true`，文案如实指向"重启/关闭"而非超时）。

// 契约三型（请求/裁决/原始通道）的**唯一来源**（§4 冻结契约家）：只读导入、原样转出——**不逐字镜像**。
import type {
  CustomerInputRequest,
  CustomerInputOutcome,
  CustomerInputFn,
  CustomerInputMetadata,
} from "../../src/model/runtime.ts";
export type { CustomerInputRequest, CustomerInputOutcome, CustomerInputFn };
// 锚点键的**唯一算法**（真机缺陷修复 2026-10-12：已决卡切走再切回跑到聊天流最末尾——卡的（重）物化
// 须按其时序锚点落位）。请求本体（kind/title）与回放侧（session-history.ts 解析的 toolCall 块）两侧
// 各自用同一函数拼键，渲染侧据此把卡锚定回「调用工具 request_confirmation」附近。只读导入、不复制。
import { interactionAnchorKey } from "./request-anchor.ts";
import { createDiagnosticLogger } from "../../src/common/shared/diagnostics.ts";

/** 推给渲染侧的交互请求载荷（IPC `session:operator-request` 的形状，主→渲）。 */
export interface OperatorRequestPayload {
  /** 本次请求的关联 id（主进程生成；回包凭它解挂——沿用 per-window pending Map 模式）。 */
  id: string;
  /** 发起请求的角色 id（渲染侧据此把卡落到该角色的聊天流，并点亮 B-3「等待你确认」）。 */
  roleId: string;
  projectRoot?: string;
  runtime?: CustomerInputMetadata["runtime"];
  turnId?: CustomerInputMetadata["turnId"];
  toolCallId?: CustomerInputMetadata["toolCallId"];
  /** 冻结形状的请求本体（**原样透传**，不加工）。 */
  request: CustomerInputRequest;
  /**
   * 交互请求的**锚点键**（`request-anchor.ts` 的单一算法；由请求本体 kind+title 拼出）。渲染侧把它
   * 记进请求登记表，供卡的（重）物化与**回放行**（同样带 anchorKey）精确关联——卡落回它发生的位置。
   */
  anchorKey: string;
}

/**
 * 渲染侧回传的**决定**（IPC `session:operator-response` 的载荷，渲→主）。
 * 渲染进程输入**一律不可信**：本模块按**请求快照**校验后才归为冻结算式——
 * confirm ⇒ `value.confirmed`；choice ⇒ `value.selected`（**必须 ⊆ 已给选项**；单选恰一个）；
 * `cancelled:true` ⇒ declined。任何非法回包拒绝受理（`{ok:false}`，pending 保留、界面可重试）。
 */
export type OperatorDecisionPayload =
  | { kind: "confirm"; confirmed: boolean }
  | { kind: "choice"; selected?: string[]; cancelled?: boolean };

/** 主进程注入的推送端点：把请求如实送到界面（electron webContents.send；测试注入收集器）。 */
export type OperatorRequestPresenter = (payload: OperatorRequestPayload) => void;

export interface OperatorExpiredPayload { id: string; roleId: string; projectRoot?: string; runtime?: CustomerInputMetadata["runtime"]; reason: string }

export interface CreateCustomerInputChannelOptions {
  onExpired?: (payload: OperatorExpiredPayload) => void;
  /** 表现层（主进程 webContents.send）；**未配置 → 一律 unavailable**（能力缺席即 fail-closed）。 */
  presenter?: OperatorRequestPresenter;
  /** 操作者标识（随 `CustomerInputOutcome.operatorId` 交给编排，先例同 shell 闸 (a)）。空/缺失归 unknown。 */
  operatorId: string;
  /** 关联 id 生成器（缺省 `op-<n>`；注入以便测试确定性）。 */
  nextId?: () => string;
}

export interface CustomerInputChannel {
  /**
   * 交给编排的**原始客户通道**（`CustomerInputFn` 形状）。返回恒为冻结三态（绝不返回 null/undefined）；
   * 且必须**带上角色上下文**（请求本体不带 roleId——桌面经闭包绑定，见 `bindRole`）。
   */
  customerInput: DesktopCustomerInputFn;
  /**
   * 回包受理（IPC `session:operator-response` 的处理器核心）：按请求快照校验后解挂。
   * 分清两种不受理（真机语义；G-1 修订）：
   *  · **可重试**（`{ok:false, error}`，无 `expired`）：决定内容非法/与请求不符——请求仍在挂起，界面可修正后重传；
   *  · **终态**（`{ok:false, error, expired:true}`）：该 id **已无挂起请求**——G-1 起**只剩一种真实失效**：
   *    **应用关闭/重启**（未决请求随窗口清空；**不再有按时间超时**）——界面应定格并如实说明（重启/关闭、请重发起），
   *    **不得**解冻反复重试。
   */
  respond(input: { id?: unknown; decision?: unknown }): { ok: boolean; error?: string; expired?: boolean };
  /** 关闭通道：所有挂起请求归 `declined`（窗口已关——未获同意，fail-closed）。幂等。 */
  rejectAllPending(reason: string): void;
  /** 当前挂起数（测试/如实呈现用）。 */
  pendingCount(): number;
  replayPending(): number;
}

/**
 * 桌面侧的客户通道（**带角色上下文**）：与冻结家 `CustomerInputFn` 同形，但多一个 `ctx.roleId`——
 * 请求本体不携带角色标识，桌面经**每会话闭包**绑定（`SessionManager.open` 装配），
 * 之后的出参形状与冻结家逐字一致。
 */
export type DesktopCustomerInputFn = (
  req: CustomerInputRequest,
  ctx: { roleId: string; runtime?: CustomerInputMetadata["runtime"]; projectRoot?: string; sessionSignal?: AbortSignal },
  metadata?: CustomerInputMetadata,
) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined;

/**
 * 装配桌面客户交互通道。产出：`customerInput`（给编排）+ `respond`（回包受理）+ `rejectAllPending`（窗关清帐）。
 * 「恰好明确作答才算 answered」是本模块的**唯一保证**；其余一切路径都是 `declined`/`unavailable`。
 */
export function createCustomerInputChannel(opts: CreateCustomerInputChannelOptions): CustomerInputChannel {
  const operatorId =
    typeof opts.operatorId === "string" && opts.operatorId.trim() !== "" ? opts.operatorId : "unknown";
  let seq = 0;
  const pending = new Map<string, { resolve: (o: CustomerInputOutcome) => void; request: CustomerInputRequest; payload: OperatorRequestPayload; cleanup: () => void }>();
  const diagnostic = createDiagnosticLogger({ component: "desktop.customer-input" });

  const customerInput: DesktopCustomerInputFn = (req, ctx, metadata) =>
    new Promise<CustomerInputOutcome>((resolve) => {
      // 退路：通道未配置 → 不可用（能力缺席即 fail-closed；绝不当「没人问、那就放行」）。
      if (opts.presenter === undefined) {
        resolve({ outcome: "unavailable", reason: "客户交互通道未配置（无 presenter），未获同意（fail-closed）" });
        return;
      }
      const id = opts.nextId ? opts.nextId() : `op-${++seq}`;
      const payload: OperatorRequestPayload = { id, roleId: String((ctx && ctx.roleId) || ""), request: req, anchorKey: interactionAnchorKey(req.kind, req.title) };
      if (ctx.runtime !== undefined) payload.runtime = ctx.runtime;
      if (ctx.projectRoot !== undefined) payload.projectRoot = ctx.projectRoot;
      if (typeof metadata?.turnId === "string" && metadata.turnId !== "") payload.turnId = metadata.turnId;
      if (typeof metadata?.toolCallId === "string" && metadata.toolCallId !== "") payload.toolCallId = metadata.toolCallId;
      const signals = [metadata?.signal, ctx.sessionSignal].filter((signal): signal is AbortSignal => signal !== undefined);
      const cleanup = () => { for (const signal of signals) signal.removeEventListener("abort", cancel); };
      const finish = (outcome: CustomerInputOutcome) => { cleanup(); resolve(outcome); };
      const cancel = () => {
        if (!pending.delete(id)) return;
        finish({ outcome: "unavailable", reason: "本轮已停止或会话已重建，旧确认失效。" });
        try { opts.onExpired?.({ id, roleId: payload.roleId, runtime: payload.runtime, projectRoot: payload.projectRoot, reason: "本轮已停止或会话已重建，旧确认失效。" }); }
        catch (error) { diagnostic.error("interaction.expired.failed", error, { requestId: id }); }
      };
      pending.set(id, { resolve: finish, request: req, payload, cleanup });
      for (const signal of signals) signal.addEventListener("abort", cancel, { once: true });
      if (signals.some((signal) => signal.aborted)) { cancel(); return; }
      try {
        opts.presenter(payload);
        diagnostic.record("interaction.presented", { requestId: id, pendingCount: pending.size });
      } catch (err) {
        diagnostic.error("interaction.present.failed", err, { requestId: id });
        // 推不达（窗口已关等）→ 未获同意（fail-closed），不留悬案。
        pending.delete(id);
        finish({ outcome: "declined", operatorId, reason: `客户交互请求未能送达界面：${reasonOf(err)}` });
      }
    });

  function respondUnsafe(input: { id?: unknown; decision?: unknown }): { ok: boolean; error?: string; expired?: boolean } {
    const id = input && typeof input.id === "string" ? input.id : "";
    diagnostic.record("interaction.response", { requestId: id });
    const entry = pending.get(id);
    if (!entry) {
      // 终态：该 id 已无挂起请求——G-1 起只剩「应用关闭/重启清空了未决请求」这一种真实原因（无按时间超时）。
      // 界面据此**定格**，不得解冻重试；文案如实指向重启/关闭。
      return { ok: false, error: "没有待答的交互请求（轮次停止、会话重建或应用关闭会使旧请求失效）", expired: true };
    }
    const d = input.decision as OperatorDecisionPayload | undefined;
    if (!d || typeof d !== "object") {
      return { ok: false, error: "缺决定内容" };
    }
    // —— confirm：恰 `confirmed:true` ⇒ answered；`confirmed:false` ⇒ declined（客户不同意）。——
    if (d.kind === "confirm") {
      if (entry.request.kind !== "confirm") {
        return { ok: false, error: "决定与请求类型不符（请求是 choice）" };
      }
      if (d.confirmed !== true && d.confirmed !== false) {
        return { ok: false, error: "确认决定必须是布尔值" };
      }
      pending.delete(id);
      if (d.confirmed === true) {
        entry.resolve({ outcome: "answered", value: { confirmed: true }, operatorId });
      } else {
        entry.resolve({ outcome: "declined", operatorId, reason: "客户不同意" });
      }
      return { ok: true };
    }
    // —— choice：取消 ⇒ declined；作答 ⇒ selected 必须 ⊆ 已给选项、去重、单选恰一个。——
    if (d.kind === "choice") {
      if (entry.request.kind !== "choice") {
        return { ok: false, error: "决定与请求类型不符（请求是 confirm）" };
      }
      if (d.cancelled === true) {
        pending.delete(id);
        entry.resolve({ outcome: "declined", operatorId, reason: "客户取消" });
        return { ok: true };
      }
      const rawSel = d.selected;
      if (!Array.isArray(rawSel) || rawSel.some((s) => typeof s !== "string")) {
        return { ok: false, error: "选择内容必须是字符串数组" };
      }
      const selected = [...new Set(rawSel as string[])];
      if (selected.length === 0) {
        return { ok: false, error: "未选择任何选项（空选择不受理；点「取消」才是拒绝）" };
      }
      const offered = new Set(entry.request.options.map((o) => o.id));
      if (selected.some((s) => !offered.has(s))) {
        return { ok: false, error: "选项不在本次请求中（按请求快照校验拒绝）" };
      }
      if (entry.request.multiple !== true && selected.length !== 1) {
        return { ok: false, error: "单选题只能选一个" };
      }
      pending.delete(id);
      entry.resolve({ outcome: "answered", value: { selected }, operatorId });
      return { ok: true };
    }
    return { ok: false, error: "未知的决定类型" };
  }

  function rejectAllPending(reason: string): void {
    diagnostic.record("interaction.closed", { pendingCount: pending.size });
    for (const [id, entry] of pending) {
      try { opts.onExpired?.({ id, roleId: entry.payload.roleId, runtime: entry.payload.runtime, projectRoot: entry.payload.projectRoot, reason }); }
      catch (error) { diagnostic.error("interaction.expired.failed", error, { requestId: id }); }
      entry.resolve({ outcome: "declined", operatorId, reason });
    }
    pending.clear();
  }

  function respond(input: { id?: unknown; decision?: unknown }): { ok: boolean; error?: string; expired?: boolean } {
    const result = respondUnsafe(input);
    diagnostic.record("interaction.response.end", { ok: result.ok, requestId: input?.id, pendingCount: pending.size });
    return result;
  }

  function replayPending(): number {
    let count = 0;
    for (const entry of pending.values()) {
      try {
        opts.presenter?.(entry.payload);
        count += 1;
      } catch (error) {
        diagnostic.error("interaction.replay.failed", error, { requestId: entry.payload.id });
      }
    }
    diagnostic.record("interaction.replayed", { count });
    return count;
  }
  return { customerInput, respond, rejectAllPending, pendingCount: () => pending.size, replayPending };
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
