// app/desktop/confirm-card.ts
// 桌面确认卡的**共享呈现端核心**（G-2/W5，2026-10-16 客户批准；设计 `..._design_role-watchdog-and-closure.md`
// §6.2「实现建议：呈现端抽一个与 shell 卡**共享 pending/replay/expire 机制**的通用件」）。
//
// 归属：Interface / 桌面窗口（本角色边界内）。纯逻辑，不依赖 electron，可在 node 下单测。
// 三个消费方（同属本角色）：
//   · `operator-channel.ts::createShellConfirmPresenter`（shell 三层闸 (a) 层确认卡——既有行为**逐字保留**：
//     兜底清理计时、超时/中止两个来源的失效分流与诊断事件名都不变）；
//   · `recovery-channel.ts::createRecoveryConfirmPresenter`（G-2 恢复确认卡——**不设限**，裁定 4）；
//   · `shell-escalation.ts::createShellEscalationPresenter`（2026-10-31 判拒升级卡——**动作投影**挂载：
//     回包是 `{id, action}` 三选一而非布尔 allow；见方案 v1.3 §7.2）。
//
// —— 本核心只做「挂起 / 取回 / 失效 / 重推」的机械部分，不做任何判定 ——
// 「恰 allow:true 才放行」的**唯一**保证形态：`respond` 只接受 `allow === true` 为真，其余（false/缺字段/
// 非布尔）一律 false；未知/已失效 id → `{ok:false, expired:true}`（**不放行/不执行**——超时、关窗、重启后的
// 旧回包绝无真值语义）。由**消费方**把 true/false 映射到各自的语义（放行命令 / 执行恢复动作）。
// **布尔 `mount`/`respond` 的签名与语义自本文件首版起未变**（恢复卡与既有审批卡零回归）；动作投影是**新增**
// 的第二个挂载面（`mountAction`/`respondAction`），两种模式按 pending 条目的 `mode` 严格路由，互不结算。
//
// —— 失效（expire）三条来源 ——
//   · 兜底计时（可选：`cleanupAfterMs` 有限才装计时器；shell 卡沿 `readConfirmTimeoutMs(env)+5000`，
//     恢复卡**不设限**——无计时器，G-1「等待客户不设限」口径）；
//   · 组合信号中止（`metadata.signal` 中止：超时/轮次停止/会话重建——由消费方的 `abortDisposition`
//     分流文案与诊断事件名）；
//   · `rejectAllPending`（窗口关闭等）。
// 每种失效都：布尔卡 resolve(false)、动作卡 resolve(消费方给出的 fallback) + `onExpired` 如实通知
// （渲染侧据此把卡定格为失效）。
//
// —— 共享呈现槽仲裁（2026-10-31 升级方案 §7.2；**只有显式配置 `slot` 的核参与**）——
// 同一窗口 shell 卡族（审批 + 升级）同时最多 1 张待答：升级卡**排他**（待答时新审批卡在**真正推达前**
// 等待槽位——等待期间**不启动**确认超时；等待上限/中止 ⇒ 调用方按 `unavailable` fail-closed），有审批卡
// 待答时升级申请**直接拒绝**（不排队）。恢复卡不配置 slot ⇒ 不参与仲裁、等待语义逐字不变。
// `createConfirmCardSlot()` 提供 `pendingCount()` / `canPresent(kind)` / `waitForSlot(signal, timeoutMs)`；
// 核在 present 前 `enter(kind)`、在结算/失效时 `leave(kind)`，两核共享同一实例即完成跨类型仲裁。
//
// —— 诊断事件名（保持既有 shell 卡记录**逐字不变**；前缀由消费方给出）——
// `${prefix}.presented` / `.responded` / `.expired` / `.replayed` / `.replay.failed` / `.expiration.failed`；
// 中止分流事件名由 `abortDisposition` 给出（shell 卡的 `.timeout` / `.cancelled` 原样保留）。

import { createDiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
import { mainT } from "./i18n.ts";

/** 挂起卡的会话上下文（谁在等：被审/被恢复会话的角色；`signal` 为中止来源——轮次停止/会话重建/通道超时）。 */
export interface ConfirmCardMetadata {
  roleId?: string;
  projectRoot?: string;
  runtime?: RuntimeKind;
  signal?: AbortSignal;
}

/** 中止分流：由消费方按组合信号的 `reason` 给出如实失效文案与诊断事件名（shell 卡的超时/取消分流在此）。 */
export interface ConfirmCardAbortDisposition {
  reason: string;
  diagnosticEvent: string;
  fields?: Record<string, unknown>;
}

export interface ConfirmCardMountOptions {
  /** 兜底清理时限（毫秒；**只做内存清理 + resolve(false/fallback)**——语义判定由通道/调用方先到者为准）。
   *  缺省/非有限/≤0 ⇒ **不设限**（无计时器；G-2 恢复卡裁定 4）。 */
  cleanupAfterMs?: number;
  /** 组合信号中止时的失效分流；缺省 ⇒ 一律「已失效」文案 + `${prefix}.cancelled` 事件。 */
  abortDisposition?: (signalReason: unknown) => ConfirmCardAbortDisposition;
}

// —————————————————————— 共享呈现槽（升级卡排他；§7.2） ——————————————————————

/** 占用呈现槽的 shell 卡族类型（恢复卡不参与，不在此列）。 */
export type ConfirmCardSlotKind = "approval" | "escalation";

/**
 * 同一窗口 shell 卡族（审批 + 升级）的**共享呈现槽**。语义（方案 §7.2）：
 *  · 升级卡排他：升级卡待答时，新审批卡在**真正推达前**等待（`waitForSlot`）；
 *  · 有审批卡待答时升级申请**直接拒绝**（`canPresent("escalation") === false`，不排队）；
 *  · 等待本身有上限（调用方传入；超限/中止 ⇒ false，调用方按 `unavailable` fail-closed）；
 *  · `pendingCount()` 为当前占用槽位的卡数（审批 + 升级）。
 */
export interface ConfirmCardSlot {
  /** 当前占用呈现槽的 shell 卡数（审批 + 升级；恢复卡不计）。 */
  pendingCount: () => number;
  /** `kind` 类新卡现在能否推达（升级卡要求槽完全空闲；审批卡只要求无升级卡待答）。 */
  canPresent: (kind: ConfirmCardSlotKind) => boolean;
  /** 等待槽位可用（审批卡用）：true = 现在可推达；false = 等待上限/中止（调用方必须 fail-closed）。 */
  waitForSlot: (signal?: AbortSignal, timeoutMs?: number) => Promise<boolean>;
  /** 核在 present 前占用槽位（每张卡一次；由 `createConfirmCardCore` 调用）。 */
  enter: (kind: ConfirmCardSlotKind) => void;
  /** 核在结算/失效时释放槽位（与 enter 配对；由 `createConfirmCardCore` 调用）。 */
  leave: (kind: ConfirmCardSlotKind) => void;
}

export interface CreateConfirmCardSlotOptions {
  /** `waitForSlot` 未显式给 timeoutMs 时的等待上限（毫秒）；缺省 ⇒ 只能靠 signal 中止。 */
  waitTimeoutMs?: number;
}

/** 构造共享呈现槽（每个窗口一个；由 main.ts 创建并交给审批/升级两个呈现端）。 */
export function createConfirmCardSlot(options: CreateConfirmCardSlotOptions = {}): ConfirmCardSlot {
  let approvalCount = 0;
  let escalationCount = 0;
  const waiters = new Set<(granted: boolean) => void>();

  const flush = (): void => {
    const pendingWaiters = [...waiters];
    waiters.clear();
    for (const resolve of pendingWaiters) resolve(true);
  };

  return {
    pendingCount: () => approvalCount + escalationCount,
    canPresent(kind) {
      // 升级卡任何时候都要求槽空闲；审批卡只被升级卡阻塞（审批卡之间的既有并发语义不变）。
      return kind === "escalation" ? escalationCount === 0 && approvalCount === 0 : escalationCount === 0;
    },
    waitForSlot(signal, timeoutMs) {
      if (escalationCount === 0) return Promise.resolve(true);
      if (signal?.aborted === true) return Promise.resolve(false);
      const limit =
        typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : options.waitTimeoutMs;
      return new Promise<boolean>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (granted: boolean): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          if (timer !== undefined) clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          resolve(granted);
        };
        const onAbort = (): void => finish(false);
        waiters.add(finish);
        if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
          timer = setTimeout(() => finish(false), limit);
        }
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
    enter(kind) {
      if (kind === "approval") approvalCount += 1;
      else escalationCount += 1;
    },
    leave(kind) {
      if (kind === "approval") approvalCount = Math.max(0, approvalCount - 1);
      else escalationCount = Math.max(0, escalationCount - 1);
      if (escalationCount === 0) flush();
    },
  };
}

interface PendingCard<TRequest> {
  /** 结算 Promise 的唯一入口（布尔卡传 allowed，动作卡传消费方投影后的决定）。 */
  settle: (value: unknown) => void;
  /** 结算模式：`respond` 只结算 boolean，`respondAction` 只结算 action（按 id 严格路由，互不误结算）。 */
  mode: "boolean" | "action";
  /** 失效（超时/中止/关窗/非法回包）时的兜底结算值。 */
  fallback: (reason: string) => unknown;
  /** 动作卡的回包投影（非法 ⇒ undefined ⇒ 按失效兜底结算）。 */
  parse?: (input: Record<string, unknown>) => unknown;
  timer?: ReturnType<typeof setTimeout>;
  request: TRequest;
  metadata?: ConfirmCardMetadata;
  cleanup: () => void;
  /** 是否占用共享呈现槽（enter/leave 必须配对）。 */
  slotHeld: boolean;
}

export interface ConfirmCardCore<TRequest> {
  /** 挂起一张卡：`buildRequest(id)` 用本核心生成的 id 组装数据面；resolve = `恰 allow:true` 才 true。 */
  mount: (buildRequest: (id: string) => TRequest, metadata?: ConfirmCardMetadata, options?: ConfirmCardMountOptions) => Promise<boolean>;
  /** 受理渲染侧的决定回包：恰 `allow:true` 才 true；未知/已失效 id → `{ok:false, expired:true}`。 */
  respond: (input: unknown) => { ok: boolean; error?: string; expired?: boolean };
  /**
   * **动作投影**挂载（升级卡；2026-10-31 方案 §7.2）：回包经 `parse` 投影为消费方的决定值
   * （如 `{action:"allow-once"}`）；非法回包/超时/中止/关窗 ⇒ `fallback(reason)`（默认拒绝方向）。
   */
  mountAction: <TAction>(
    buildRequest: (id: string) => TRequest,
    fallback: (reason: string) => TAction,
    parse: (input: Record<string, unknown>) => TAction | undefined,
    metadata?: ConfirmCardMetadata,
    options?: ConfirmCardMountOptions,
  ) => Promise<TAction>;
  /** 受理动作卡回包；未知/已失效 id 或非动作卡 → `{ok:false, expired:true}`（不放行）。 */
  respondAction: (input: unknown) => { ok: boolean; error?: string; expired?: boolean };
  /** 全部挂起 → 失效（窗口关闭等；fail-closed）。 */
  rejectAllPending: (reason: string) => void;
  /** 当前挂起数（测试/诊断）。 */
  pendingCount: () => number;
  /** 按角色挂起数（G-2/W1 依赖项：看护「正确等待不报」的按角色 pending 视图）。 */
  pendingRoles: () => Map<string, number>;
  /** 幂等重推仍挂起者（focus/show/recovery-ready 先例）；返回重推数。 */
  replayPending: () => number;
  /** 本核所代表的卡类型现在能否推达（未配置共享槽 ⇒ 恒 true——既有语义）。 */
  canPresent: () => boolean;
  /** 等待共享呈现槽（审批卡在真正推达前调用；未配置共享槽 ⇒ 立即 true）。 */
  waitForSlot: (signal?: AbortSignal, timeoutMs?: number) => Promise<boolean>;
}

export interface CreateConfirmCardCoreOptions<TRequest> {
  /** 关联 id 前缀（`sc-` / `rp-` / `se-`——沿用既有命名，渲染侧可据此识别卡族）。 */
  idPrefix: string;
  /** 诊断事件名前缀（`shell-confirm` / `recovery-confirm` / `shell-escalation`）。 */
  eventPrefix: string;
  /** 诊断 component（`desktop.shell-confirm` / `desktop.recovery-confirm` / `desktop.shell-escalation`）。 */
  component: string;
  /** 把请求推给渲染侧（生产：`webContents.send`；测试：收集器）。**推达失败（窗口已关）⇒ 抛错**——
   *  由消费方通道归为 unavailable/未获执行（fail-closed，绝不当「没人问就放行」）。 */
  present: (request: TRequest) => void;
  onExpired?: (payload: { id: string; reason: string; metadata?: ConfirmCardMetadata }) => void;
  /** respond 收到未知/已失效 id 时的如实文案（各卡族措辞不同）。 */
  expiredResponse: string;
  /** 共享呈现槽（可选；仅 shell 卡族配置。恢复卡缺省 ⇒ 不参与仲裁、等待语义不变）。 */
  slot?: { arbitrate: ConfirmCardSlot; kind: ConfirmCardSlotKind };
}

export function createConfirmCardCore<TRequest>(opts: CreateConfirmCardCoreOptions<TRequest>): ConfirmCardCore<TRequest> {
  let seq = 0;
  const pending = new Map<string, PendingCard<TRequest>>();
  const diagnostic = createDiagnosticLogger({ component: opts.component });

  const slotKind = opts.slot?.kind;

  const releaseSlot = (entry: PendingCard<TRequest>): void => {
    if (!entry.slotHeld) return;
    entry.slotHeld = false;
    if (opts.slot !== undefined) opts.slot.arbitrate.leave(opts.slot.kind);
  };

  const finish = (id: string, value: unknown): boolean => {
    const entry = pending.get(id);
    if (entry === undefined) return false;
    pending.delete(id);
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    entry.cleanup();
    releaseSlot(entry);
    entry.settle(value);
    return true;
  };

  const expire = (id: string, reason: string): void => {
    const entry = pending.get(id);
    if (!entry) return;
    const value = entry.mode === "action" ? entry.fallback(reason) : false;
    finish(id, value);
    try {
      opts.onExpired?.({ id, reason, metadata: entry.metadata });
    } catch (error) {
      diagnostic.error(`${opts.eventPrefix}.expiration.failed`, error, { requestId: id });
    }
  };

  const mountInternal = <TValue>(
    buildRequest: (id: string) => TRequest,
    metadata: ConfirmCardMetadata | undefined,
    options: ConfirmCardMountOptions | undefined,
    mode: "boolean" | "action",
    fallback: (reason: string) => TValue,
    parse?: (input: Record<string, unknown>) => TValue | undefined,
  ): Promise<TValue> => {
    const id = `${opts.idPrefix}${++seq}`;
    const request = buildRequest(id);
    return new Promise<TValue>((resolve) => {
      const cleanupAfterMs = options?.cleanupAfterMs;
      const timer =
        typeof cleanupAfterMs === "number" && Number.isFinite(cleanupAfterMs) && cleanupAfterMs > 0
          ? setTimeout(() => {
              diagnostic.record(`${opts.eventPrefix}.expired`, { requestId: id });
              expire(id, mainT("main.confirm.expiredTimeout"));
            }, cleanupAfterMs)
          : undefined;
      const cancel = () => {
        const reason = metadata?.signal?.reason as unknown;
        const disposition = options?.abortDisposition
          ? options.abortDisposition(reason)
          : { reason: mainT("main.confirm.expiredStopped"), diagnosticEvent: `${opts.eventPrefix}.cancelled` };
        diagnostic.record(disposition.diagnosticEvent, { requestId: id, ...(disposition.fields ?? {}) });
        expire(id, disposition.reason);
      };
      const cleanup = () => metadata?.signal?.removeEventListener("abort", cancel);
      const entry: PendingCard<TRequest> = {
        settle: (value) => resolve(value as TValue),
        mode,
        fallback: fallback as (reason: string) => unknown,
        ...(parse !== undefined ? { parse: parse as (input: Record<string, unknown>) => unknown } : {}),
        ...(timer !== undefined ? { timer } : {}),
        request,
        ...(metadata !== undefined ? { metadata } : {}),
        cleanup,
        slotHeld: false,
      };
      pending.set(id, entry);
      metadata?.signal?.addEventListener("abort", cancel, { once: true });
      if (metadata?.signal?.aborted) {
        cancel();
        return;
      }
      try {
        if (opts.slot !== undefined) {
          opts.slot.arbitrate.enter(opts.slot.kind);
          entry.slotHeld = true;
        }
        opts.present(request);
        diagnostic.record(`${opts.eventPrefix}.presented`, { requestId: id, pendingCount: pending.size });
      } catch (err) {
        if (timer !== undefined) clearTimeout(timer);
        pending.delete(id);
        cleanup();
        releaseSlot(entry);
        throw err; // → 消费方通道归为 fail-closed（绝不当「没人问就放行」）
      }
    });
  };

  return {
    mount(buildRequest, metadata, options) {
      return mountInternal(buildRequest, metadata, options, "boolean", () => false);
    },
    respond(input) {
      const req = input && typeof input === "object" ? (input as { id?: unknown; allow?: unknown }) : {};
      const id = typeof req.id === "string" ? req.id : "";
      const entry = id !== "" ? pending.get(id) : undefined;
      if (entry === undefined || entry.mode !== "boolean") {
        // 未知/已失效 id，或误把动作卡回包投向布尔面：一律按失效语义回答，**不结算**动作卡（fail-closed）。
        return { ok: false, expired: true, error: opts.expiredResponse };
      }
      finish(id, req.allow === true); // 恰 allow:true 才为真；其余一律 false
      diagnostic.record(`${opts.eventPrefix}.responded`, { requestId: id, decision: req.allow === true });
      return { ok: true };
    },
    mountAction(buildRequest, fallback, parse, metadata, options) {
      return mountInternal(buildRequest, metadata, options, "action", fallback, parse);
    },
    respondAction(input) {
      const req = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined;
      const id = req !== undefined && typeof req.id === "string" ? req.id : "";
      const entry = id !== "" ? pending.get(id) : undefined;
      if (req === undefined || entry === undefined || entry.mode !== "action" || entry.parse === undefined) {
        return { ok: false, expired: true, error: opts.expiredResponse };
      }
      const value = entry.parse(req);
      if (value === undefined) {
        // 非法动作（含伪造值）：按失效结算 = 默认拒绝，绝不放行。
        expire(id, opts.expiredResponse);
        return { ok: false, expired: true, error: opts.expiredResponse };
      }
      finish(id, value);
      diagnostic.record(`${opts.eventPrefix}.responded`, {
        requestId: id,
        decision: typeof req.action === "string" ? req.action : "action",
      });
      return { ok: true };
    },
    rejectAllPending(reason) {
      for (const id of [...pending.keys()]) expire(id, reason);
    },
    pendingCount: () => pending.size,
    pendingRoles() {
      const counts = new Map<string, number>();
      for (const entry of pending.values()) {
        const roleId = entry.metadata?.roleId;
        if (typeof roleId === "string" && roleId !== "") counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
      }
      return counts;
    },
    replayPending() {
      let count = 0;
      for (const entry of pending.values()) {
        try {
          opts.present(entry.request);
          count += 1;
        } catch (error) {
          diagnostic.error(`${opts.eventPrefix}.replay.failed`, error, { requestId: (entry.request as { id?: unknown }).id as string | undefined });
        }
      }
      diagnostic.record(`${opts.eventPrefix}.replayed`, { count });
      return count;
    },
    canPresent() {
      if (opts.slot === undefined || slotKind === undefined) return true;
      return opts.slot.arbitrate.canPresent(slotKind);
    },
    waitForSlot(signal, timeoutMs) {
      if (opts.slot === undefined) return Promise.resolve(true);
      return opts.slot.arbitrate.waitForSlot(signal, timeoutMs);
    },
  };
}
