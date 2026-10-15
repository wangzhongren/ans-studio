import { readRoleSessionHistory, projectRoleLegacyHistory } from "../../src/pipeline/orchestration/run-role.ts";
import type { RuntimeKind, PromptInputEventDetail, ToolEventDetailV1, RuntimeReportSnapshotV1, RuntimeDeliveryReceiptV1 } from "../../src/model/runtime.ts";
import { readRoleSessionHistory as readLegacyPiHistory, toRuntimeLegacyEntries, type ReplayRow } from "./session-history.ts";
import { isRuntimeKind } from "./runtime-config.ts";

export interface SessionHistoryView {
  projectRoot: string; roleId: string; runtime: RuntimeKind; rows: ReplayRow[]; error: string | null; skipped: number;
  reports?: RuntimeReportSnapshotV1[]; reportErrors?: { reportId?: string; code: string }[];
  projection?: { invalidEntries: number; omittedEntries: number; truncated: boolean };
}
// All IPC text is obtained through the public Pipeline's protected history projection.
export async function getSessionHistory(input: { projectRoot: string; roleId: string; runtime: RuntimeKind }, context?: { credentialEnvNames?: readonly string[] }): Promise<SessionHistoryView> {
  if (!input || typeof input.projectRoot !== "string" || typeof input.roleId !== "string" || !isRuntimeKind(input.runtime)) throw new Error("历史请求须指定项目、角色与运行时。");
  const base: SessionHistoryView = { ...input, rows: [], error: null, skipped: 0 };
  try {
    const history = await readRoleSessionHistory(input, context);
    base.reports = history.reports;
    base.reportErrors = history.reportErrors;
    const calls = new Map<string, { toolName: string; target: string }>();
    const users = new Map<string, ReplayRow>(), echoes = new Map<string, ReplayRow>();
    for (const entry of history.entries) {
      if (entry.kind === 'user' && typeof entry.text === 'string') {
        const row: ReplayRow = { kind: 'user', text: entry.text, at: entry.at };
        if (entry.turnId) row.turnId = entry.turnId;
        if (entry.inputProvenance) row.inputProvenance = entry.inputProvenance;
        if (entry.inputTextProjection) row.inputTextProjection = entry.inputTextProjection;
        if (row.turnId) {
          const echo = echoes.get(row.turnId);
          if (echo) { echo.text = row.text; echo.at = row.at; echo.inputProvenance = row.inputProvenance; echo.inputTextProjection = row.inputTextProjection; echoes.delete(row.turnId); users.set(row.turnId, echo); continue; }
          users.set(row.turnId, row);
        }
        base.rows.push(row); continue;
      }
      const event = entry.event;
      if (!event || event.kind === 'settled') continue;
      const turnId = entry.turnId ?? event.turnId;
      const row: ReplayRow = { kind: event.kind === 'message' ? 'assistant' : event.kind === 'denied' ? 'denied' : 'tool', text: event.summary, at: entry.at, eventKind: event.kind, ...(turnId ? { turnId } : {}) };
      const detail = event.detail as Partial<PromptInputEventDetail> & Partial<ToolEventDetailV1> & { receipt?: RuntimeDeliveryReceiptV1; version?: number; deliveryId?: string; attemptId?: string; turnId?: string; stage?: 'provider-may-start' } | undefined;
      if (detail?.source === 'delivery-receipt' as string && detail?.receipt) { row.kind = 'tool'; row.text = '投递历史状态'; row.deliveryReceipt = detail.receipt; base.rows.push(row); continue; }
      if (detail?.source === 'delivery-boundary' as string) {
        row.kind = 'tool'; row.text = '投递可能已开始';
        if (detail.version === 1 && detail.deliveryId && detail.attemptId && detail.turnId && detail.stage === 'provider-may-start') row.deliveryBoundary = { version: 1, deliveryId: detail.deliveryId, attemptId: detail.attemptId, turnId: detail.turnId, stage: detail.stage };
        base.rows.push(row); continue;
      }
      if (event.kind === 'message' && detail?.source === 'prompt-input' && typeof detail.text === 'string'
        && (event.runtime === undefined || event.runtime === input.runtime) && (event.roleId === undefined || event.roleId === input.roleId)) {
        row.kind = 'user'; row.text = detail.text;
        row.input = { source: 'prompt-input', text: detail.text, ...(detail.imageCount !== undefined ? { imageCount: detail.imageCount } : {}), ...(detail.inputTextProjection ? { inputTextProjection: detail.inputTextProjection } : {}), ...(detail.inputProvenance ? { inputProvenance: detail.inputProvenance } : {}), ...(detail.inputPresentation ? { inputPresentation: detail.inputPresentation } : {}) };
        row.inputTextProjection = detail.inputTextProjection; row.inputProvenance = detail.inputProvenance; row.inputPresentation = detail.inputPresentation;
        if (turnId) {
          const user = users.get(turnId);
          if (user) { user.input = row.input; user.eventKind = event.kind; user.inputTextProjection = row.inputTextProjection; user.inputProvenance = row.inputProvenance; user.inputPresentation = row.inputPresentation; continue; }
          if (echoes.has(turnId)) continue;
          echoes.set(turnId, row);
        }
        base.rows.push(row); continue;
      }
      const name = detail?.toolName ?? '';
      const callId = detail?.toolCallId;
      const key = turnId && callId ? `${turnId}\0${callId}` : undefined;
      const previous = key ? calls.get(key) : undefined;
      if (event.kind !== 'message' && (name || previous)) {
        const phase = detail?.phase ?? (event.kind === 'tool_call' ? 'start' : event.kind === 'denied' ? 'blocked' : 'result');
        const target = detail?.display?.target?.value.text ?? previous?.target ?? '';
        const toolName = name || previous!.toolName;
        if (event.kind === 'tool_call' && key) calls.set(key, { toolName, target });
        row.activity = { toolName, target, phase, status: phase === 'start' ? 'call' : event.kind === 'denied' || detail?.ok === false ? 'failed' : detail?.ok === true ? 'completed' : 'returned', ...(callId ? { toolCallId: callId } : {}), ...(turnId ? { turnId } : {}), ...(detail?.ok !== undefined ? { ok: detail.ok } : {}), ...(detail?.display ? { display: detail.display } : {}) };
        if (turnId && callId && ['request_confirmation','request_choice'].includes(toolName)) { row.requestId = callId; row.anchor = phase === 'start' ? 'request' : 'conclusion'; }
      }
      base.rows.push(row);
    }
    if (input.runtime === 'pi' && base.rows.length === 0) {
      const legacy = await readLegacyPiHistory(input.projectRoot, input.roleId);
      const protectedHistory = projectRoleLegacyHistory({ ...input, runtime: 'pi', readOk: legacy.ok, entries: toRuntimeLegacyEntries(legacy.rows), source: legacy.source, error: legacy.error, skipped: legacy.skipped }, context);
      if (!protectedHistory.ok) { base.error = protectedHistory.message.text; return base; }
      base.error = protectedHistory.reader.ok ? null : protectedHistory.reader.error?.text ?? '旧历史读取失败。'; base.skipped = protectedHistory.reader.skipped; base.projection = protectedHistory.projection;
      base.rows = protectedHistory.entries.map(entry => {
        const row: ReplayRow = { kind: entry.kind === 'user-text' ? 'user' : entry.kind === 'tool-record' ? entry.tool.reportedStatus === 'failed' ? 'denied' : 'tool' : 'assistant', text: entry.text.text, textProjection: entry.text, at: entry.at ?? '', metadataOmissions: entry.metadataOmissions };
        if (entry.anchor) { row.anchorKey = entry.anchor.token; row.anchor = entry.anchor.position; row.requestId = entry.anchor.nativeCallId; }
        if (entry.kind === 'tool-record') { const t = entry.tool; if (t.statusSource !== undefined) row.legacyStatusSource = t.statusSource; if (t.target) row.legacyTargetSource = t.target.source; row.activity = { toolName: t.toolName, target: t.target?.value.text ?? '', phase: t.phase === 'start' ? 'call' : 'result', status: t.phase === 'start' ? 'call' : t.reportedStatus ?? 'unknown', ...(t.toolCallId ? { toolCallId: t.toolCallId } : {}), ...(t.turnId ? { turnId: t.turnId } : {}), ...(t.ok !== undefined ? { ok: t.ok } : {}), ...(t.display ? { display: t.display } : {}) }; }
        return row;
      });
    }
    return base;
  } catch { return { ...base, rows: [], error: '历史读取或安全投影失败。' }; }
}
