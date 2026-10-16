import { randomUUID } from "node:crypto";
import type { SessionEvent } from "../../model/runtime.ts";
import type { createDiagnosticLogger } from "../shared/diagnostics.ts";

export type DiagnosticLog = ReturnType<typeof createDiagnosticLogger>;
export type TurnOutcome = "completed" | "failed" | "aborted" | "timed_out";

/**
 * F-3-b：截断（stopReason=length）系统行文案（事件流/replay/UI 可见；kind 仍取冻结集内的 message）。
 * 事实来源：kanban-live 事故——收尾轮回复被输出上限截断，截断事实此前只存在于 Pi native，
 * replay/UI 看不到；本行把它提到 ANS 事件流（只增不减、summary 与 outcome 语义不变）。
 */
export const LENGTH_TRUNCATION_SUMMARY = "本轮模型输出达到输出上限被截断（stopReason=length)——末条回复不完整，正式报告可能未发出。";

/** One prompt identity, shared by tools, reports and the single terminal emitter. */
export function createTurnLifecycle(emit: (event: SessionEvent) => void, diagnostics?: DiagnosticLog, suppliedTurnId?: () => string | undefined) {
  let turnId: string | undefined;
  let settled = false;
  let outcome: TurnOutcome = "completed";
  let forced = false;
  let errorCode: string | undefined;
  let startedAt = 0;
  let quarantined = false;
  let sdkSettled = false;
  let active = false;
  /** F-3-b：末条 assistant 消息的 stopReason（begin() 归零）——settled detail 与收尾补发判据用。 */
  let lastStopReason: string | undefined;
  /** F-3-b：每轮**首次**截断只发一条系统行/诊断记录（同轮再截断不重复）。 */
  let truncationNotified = false;
  return {
    currentTurnId: (): string | undefined => turnId,
    /**
     * 本轮是否已被锁定（显式 fail——abort/超时/失败路径——或已 finish 终态）。G-5 降级重发的守卫：
     * 被中断的轮次不得重发（降级只在「网关拒绝思考参数、轮次本体未被外部打断」时发生）。
     */
    isInterrupted: (): boolean => forced || settled,
    begin(): void {
      if (quarantined) throw new Error("会话中止清理未完成，请重新建立会话后重试。");
      active = true;
      turnId = suppliedTurnId?.() ?? randomUUID();
      settled = false;
      forced = false;
      sdkSettled = false;
      outcome = "completed";
      errorCode = undefined;
      lastStopReason = undefined;
      truncationNotified = false;
      startedAt = Date.now();
      diagnostics?.record("prompt.start", { turnId });
    },
    fail(next: TurnOutcome, code: string): void {
      // The first explicit interruption is authoritative; cleanup/rejection cannot relabel it.
      if (settled || forced) return;
      forced = true;
      outcome = next;
      errorCode = code;
    },
    observe(message: unknown): void {
      if (forced || message === null || typeof message !== "object") return;
      const record = message as Record<string, unknown>;
      if (record.role !== "assistant") return;
      // F-3-b：截断识别——记住末条 assistant 消息的 stopReason；stopReason=length 时对每轮**首次**截断
      // 发恰一条系统行 + 一条诊断记录（同轮再次截断不重复；被 forced 锁定的轮次在上面即忽略）。
      const stopReason = typeof record.stopReason === "string" ? record.stopReason : undefined;
      lastStopReason = stopReason;
      if (stopReason === "length" && !truncationNotified) {
        truncationNotified = true;
        emit({ kind: "message", summary: LENGTH_TRUNCATION_SUMMARY, detail: { turnId, truncation: "length" } });
        diagnostics?.record("prompt.truncated", { turnId, reasonCode: "length" });
      }
      // A successful retry replaces an intermediate error, while a hard timeout stays locked.
      outcome = record.stopReason === "error" ? "failed" : record.stopReason === "aborted" ? "aborted" : "completed";
      errorCode = outcome === "failed" ? "MODEL_ERROR" : outcome === "aborted" ? "ABORTED" : undefined;
      if (outcome === "failed") diagnostics?.record("prompt.model_error", { turnId, errorCode: "MODEL_ERROR" });
    },
    noteSdkSettled(aborted = false): void {
      sdkSettled = true;
      if (aborted && !forced) { outcome = "aborted"; errorCode = "ABORTED"; }
    },
    hasSdkSettled: (): boolean => sdkSettled,
    /**
     * F-3-a 判据（只读）：末条 assistant 消息为截断（stopReason=length）**且**轮次未被强制中断锁定。
     * abort/超时锁定优先（`fail()` 的 forced 守卫先于 observe / 也在补发判据处生效）——
     * 被中止/超时的轮次**不触发**收尾补发（提案 §4.3-4）。
     */
    wasTruncated: (): boolean => !forced && lastStopReason === "length",
    /**
     * F-3-a：封存当前 outcome。收尾补发段失败后的 abort 清理会引发**迟到**的 SDK
     * `agent_settled(aborted:true)` 或中止消息；封存后 noteSdkSettled/observe 均不改判本轮既有结果
     * （「补发失败不改变 settled 的 outcome」的机制保证——否则清理会把已完成的轮次改判 aborted）。
     */
    seal(): void {
      forced = true;
    },
    finish(aborted = false): void {
      if (settled) return;
      if (aborted && !forced) { outcome = "aborted"; errorCode = "ABORTED"; }
      settled = true;
      active = false;
      // F-3-b：settled detail 只增字段——末条 assistant 消息为截断时附 truncation:"length"
      // （outcome 枚举不变；以**原样事实**为准，即便轮次后来被 seal/forced，截断事实仍如实保留）。
      const detail = { turnId, outcome, ...(errorCode ? { errorCode } : {}), ...(lastStopReason === "length" ? { truncation: "length" as const } : {}) };
      if (outcome !== "completed") {
        emit({ kind: "denied", summary: outcome === "timed_out" ? "本轮运行超时" : outcome === "aborted" ? "本轮已中止" : "本轮模型运行失败", detail });
      }
      emit({ kind: "settled", summary: outcome === "completed" ? "会话结束" : outcome === "timed_out" ? "本轮运行超时" : outcome === "aborted" ? "本轮已中止" : "本轮运行失败", detail });
      diagnostics?.record("prompt.end", { ...detail, durationMs: startedAt ? Date.now() - startedAt : 0 });
    },
    quarantine(): void {
      quarantined = true;
      diagnostics?.record("session.quarantined", { turnId, state: "quarantined" });
    },
    isActive: (): boolean => active,
    isSettled: (): boolean => settled,
  };
}

export type TurnLifecycle = ReturnType<typeof createTurnLifecycle>;
