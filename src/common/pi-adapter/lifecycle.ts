import { randomUUID } from "node:crypto";
import type { SessionEvent } from "../../model/runtime.ts";
import type { createDiagnosticLogger } from "../shared/diagnostics.ts";

export type DiagnosticLog = ReturnType<typeof createDiagnosticLogger>;
export type TurnOutcome = "completed" | "failed" | "aborted" | "timed_out";

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
  return {
    currentTurnId: (): string | undefined => turnId,
    begin(): void {
      if (quarantined) throw new Error("会话中止清理未完成，请重新建立会话后重试。");
      active = true;
      turnId = suppliedTurnId?.() ?? randomUUID();
      settled = false;
      forced = false;
      sdkSettled = false;
      outcome = "completed";
      errorCode = undefined;
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
    finish(aborted = false): void {
      if (settled) return;
      if (aborted && !forced) { outcome = "aborted"; errorCode = "ABORTED"; }
      settled = true;
      active = false;
      const detail = { turnId, outcome, ...(errorCode ? { errorCode } : {}) };
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
