import { readRoleSessionHistory } from "../../src/pipeline/orchestration/run-role.ts";
import type { RuntimeKind } from "../../src/model/runtime.ts";
import { readRoleSessionHistory as readLegacyPiHistory, type ReplayRow } from "./session-history.ts";
import { anchorKeyForToolCall } from "./request-anchor.ts";
import { isRuntimeKind } from "./runtime-config.ts";

export interface SessionHistoryView {
  projectRoot: string; roleId: string; runtime: RuntimeKind; rows: ReplayRow[]; error: string | null; skipped: number;
}
// Replay is display data; it never establishes native model context restoration.
export async function getSessionHistory(input: { projectRoot: string; roleId: string; runtime: RuntimeKind }): Promise<SessionHistoryView> {
  if (!input || typeof input.projectRoot !== "string" || typeof input.roleId !== "string" || !isRuntimeKind(input.runtime)) throw new Error("历史请求须指定项目、角色与运行时。");
  const base = { ...input, rows: [] as ReplayRow[], error: null as string | null, skipped: 0 };
  try {
    const history = await readRoleSessionHistory(input);
    const calls = new Map<string, { toolName: string; target: string; anchorKey?: string }>();
    for (const entry of history.entries) {
      if (entry.kind === "user" && typeof entry.text === "string") {
        const row: ReplayRow = { kind: "user", text: entry.text, at: entry.at };
        if (typeof entry.turnId === "string") row.turnId = entry.turnId;
        base.rows.push(row);
      } else if (entry.event) {
        const event = entry.event;
        if (event.kind === "settled") continue;
        let kind: ReplayRow["kind"] = "tool";
        if (event.kind === "message") kind = "assistant";
        if (event.kind === "denied") kind = "denied";
        const turnId = entry.turnId ?? event.turnId;
        const row: ReplayRow = { kind, text: event.summary, at: entry.at, eventKind: event.kind };
        if (typeof turnId === "string") row.turnId = turnId;
        const detail = event.detail as { toolName?: string; name?: string; args?: Record<string, unknown>; toolCallId?: string; ok?: boolean; call?: { name?: string; args?: Record<string, unknown>; toolCallId?: string }; result?: { ok?: boolean } } | undefined;
        const call = detail?.call ?? detail;
        const toolName = call?.name ?? detail?.toolName ?? "";
        const toolCallId = detail?.toolCallId ?? call?.toolCallId ?? "";
        const callKey = `${turnId ?? ""}\u0000${toolCallId}`;
        const previous = calls.get(callKey);
        if (event.kind !== "message" && (toolName !== "" || previous)) {
          const name = toolName || previous?.toolName || "";
          let target = previous?.target ?? "";
          if (typeof call?.args?.path === "string") target = call.args.path;
          if (typeof call?.args?.command === "string") target = call.args.command;
          let anchorKey = previous?.anchorKey;
          const anchor = anchorKeyForToolCall(name, call?.args);
          if (anchor !== null) anchorKey = anchor;
          let phase: "call" | "result" = "result";
          let status: NonNullable<ReplayRow["activity"]>["status"] = "returned";
          const ok = detail?.ok ?? detail?.result?.ok;
          if (event.kind === "tool_call") { phase = "call"; status = "call"; calls.set(callKey, { toolName: name, target, anchorKey }); }
          if (event.kind === "denied" || ok === false) status = "failed";
          if (ok === true) status = "completed";
          row.activity = { toolName: name, target, phase, status };
          if (toolCallId !== "") row.activity.toolCallId = toolCallId;
          if (typeof turnId === "string") row.activity.turnId = turnId;
          if (typeof ok === "boolean") row.activity.ok = ok;
          if (anchorKey !== undefined) {
            row.anchorKey = anchorKey;
            row.requestId = toolCallId;
            row.anchor = "conclusion";
            if (phase === "call") row.anchor = "request";
          }
        }
        base.rows.push(row);
      }
    }
    if (input.runtime === "pi" && base.rows.length === 0) {
      const legacy = await readLegacyPiHistory(input.projectRoot, input.roleId);
      base.rows = legacy.rows;
      base.error = legacy.error ?? null;
      base.skipped = legacy.skipped;
    }
    return base;
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}
