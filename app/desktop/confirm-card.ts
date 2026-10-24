// app/desktop/confirm-card.ts
// 桌面确认卡的**共享呈现端核心**（G-2/W5，2026-10-16 客户批准；设计 `..._design_role-watchdog-and-closure.md`
// §6.2「实现建议：呈现端抽一个与 shell 卡**共享 pending/replay/expire 机制**的通用件」）。
//
// 归属：Interface / 桌面窗口（本角色边界内）。纯逻辑，不依赖 electron，可在 node 下单测。
// 两个消费方（同属本角色）：
//   · `operator-channel.ts::createShellConfirmPresenter`（shell 三层闸 (a) 层确认卡——既有行为**逐字保留**：
//     兜底清理计时、超时/中止两个来源的失效分流与诊断事件名都不变）；
//   · `recovery-channel.ts::createRecoveryConfirmPresenter`（G-2 恢复确认卡——**不设限**，裁定 4）。
//
// —— 本核心只做「挂起 / 取回 / 失效 / 重推」的机械部分，不做任何判定 ——
// 「恰 allow:true 才放行」的**唯一**保证形态：`respond` 只接受 `allow === true` 为真，其余（false/缺字段/
// 非布尔）一律 false；未知/已失效 id → `{ok:false, expired:true}`（**不放行/不执行**——超时、关窗、重启后的
// 旧回包绝无真值语义）。由**消费方**把 true/false 映射到各自的语义（放行命令 / 执行恢复动作）。
//
// —— 失效（expire）三条来源 ——
//   · 兜底计时（可选：`cleanupAfterMs` 有限才装计时器；shell 卡沿 `readConfirmTimeoutMs(env)+5000`，
//     恢复卡**不设限**——无计时器，G-1「等待客户不设限」口径）；
//   · 组合信号中止（`metadata.signal` 中止：超时/轮次停止/会话重建——由消费方的 `abortDisposition`
//     分流文案与诊断事件名）；
//   · `rejectAllPending`（窗口关闭等）。
// 每种失效都：resolve(false) + `onExpired` 如实通知（渲染侧据此把卡定格为失效）。
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
  /** 兜底清理时限（毫秒；**只做内存清理 + resolve(false)**——语义判定由通道/调用方先到者为准）。
   *  缺省/非有限/≤0 ⇒ **不设限**（无计时器；G-2 恢复卡裁定 4）。 */
  cleanupAfterMs?: number;
  /** 组合信号中止时的失效分流；缺省 ⇒ 一律「已失效」文案 + `${prefix}.cancelled` 事件。 */
  abortDisposition?: (signalReason: unknown) => ConfirmCardAbortDisposition;
}

export interface ConfirmCardCore<TRequest> {
  /** 挂起一张卡：`buildRequest(id)` 用本核心生成的 id 组装数据面；resolve = `恰 allow:true` 才 true。 */
  mount: (buildRequest: (id: string) => TRequest, metadata?: ConfirmCardMetadata, options?: ConfirmCardMountOptions) => Promise<boolean>;
  /** 受理渲染侧的决定回包：恰 `allow:true` 才 true；未知/已失效 id → `{ok:false, expired:true}`。 */
  respond: (input: unknown) => { ok: boolean; error?: string; expired?: boolean };
  /** 全部挂起 → false（窗口关闭等；fail-closed）。 */
  rejectAllPending: (reason: string) => void;
  /** 当前挂起数（测试/诊断）。 */
  pendingCount: () => number;
  /** 按角色挂起数（G-2/W1 依赖项：看护「正确等待不报」的按角色 pending 视图）。 */
  pendingRoles: () => Map<string, number>;
  /** 幂等重推仍挂起者（focus/show/recovery-ready 先例）；返回重推数。 */
  replayPending: () => number;
}

export interface CreateConfirmCardCoreOptions<TRequest> {
  /** 关联 id 前缀（`sc-` / `rp-`——沿用既有命名，渲染侧可据此识别卡族）。 */
  idPrefix: string;
  /** 诊断事件名前缀（`shell-confirm` / `recovery-confirm`——既有事件名逐字保留）。 */
  eventPrefix: string;
  /** 诊断 component（`desktop.shell-confirm` / `desktop.recovery-confirm`）。 */
  component: string;
  /** 把请求推给渲染侧（生产：`webContents.send`；测试：收集器）。**推达失败（窗口已关）⇒ 抛错**——
   *  由消费方通道归为 unavailable/未获执行（fail-closed，绝不当「没人问就放行」）。 */
  present: (request: TRequest) => void;
  onExpired?: (payload: { id: string; reason: string; metadata?: ConfirmCardMetadata }) => void;
  /** respond 收到未知/已失效 id 时的如实文案（各卡族措辞不同）。 */
  expiredResponse: string;
}

export function createConfirmCardCore<TRequest>(opts: CreateConfirmCardCoreOptions<TRequest>): ConfirmCardCore<TRequest> {
  let seq = 0;
  const pending = new Map<
    string,
    {
      resolve: (allowed: boolean) => void;
      timer?: ReturnType<typeof setTimeout>;
      request: TRequest;
      metadata?: ConfirmCardMetadata;
      cleanup: () => void;
    }
  >();
  const diagnostic = createDiagnosticLogger({ component: opts.component });

  const finish = (id: string, allowed: boolean): boolean => {
    const entry = pending.get(id);
    if (entry === undefined) return false;
    pending.delete(id);
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    entry.cleanup();
    entry.resolve(allowed);
    return true;
  };

  const expire = (id: string, reason: string): void => {
    const entry = pending.get(id);
    if (!entry) return;
    finish(id, false);
    try {
      opts.onExpired?.({ id, reason, metadata: entry.metadata });
    } catch (error) {
      diagnostic.error(`${opts.eventPrefix}.expiration.failed`, error, { requestId: id });
    }
  };

  return {
    mount(buildRequest, metadata, options) {
      const id = `${opts.idPrefix}${++seq}`;
      const request = buildRequest(id);
      return new Promise<boolean>((resolve) => {
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
        pending.set(id, { resolve, ...(timer !== undefined ? { timer } : {}), request, metadata, cleanup });
        metadata?.signal?.addEventListener("abort", cancel, { once: true });
        if (metadata?.signal?.aborted) {
          cancel();
          return;
        }
        try {
          opts.present(request);
          diagnostic.record(`${opts.eventPrefix}.presented`, { requestId: id, pendingCount: pending.size });
        } catch (err) {
          if (timer !== undefined) clearTimeout(timer);
          pending.delete(id);
          cleanup();
          throw err; // → 消费方通道归为 fail-closed（绝不当「没人问就放行」）
        }
      });
    },
    respond(input) {
      const req = input && typeof input === "object" ? (input as { id?: unknown; allow?: unknown }) : {};
      const id = typeof req.id === "string" ? req.id : "";
      if (id === "" || !pending.has(id)) {
        return { ok: false, expired: true, error: opts.expiredResponse };
      }
      finish(id, req.allow === true); // 恰 allow:true 才为真；其余一律 false
      diagnostic.record(`${opts.eventPrefix}.responded`, { requestId: id, decision: req.allow === true });
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
  };
}
