import { readRoleSessionHistory, projectRoleLegacyHistory } from "../../src/pipeline/orchestration/run-role.ts";
import type { RuntimeKind, PromptInputEventDetail, ToolEventDetailV1, RuntimeReportSnapshotV1, RuntimeDeliveryReceiptV1 } from "../../src/model/runtime.ts";
import { readRoleSessionHistory as readLegacyPiHistory, toRuntimeLegacyEntries, classifyProcessOutcome, type ReplayRow } from "./session-history.ts";
import { isRuntimeKind } from "./runtime-config.ts";
import { mainT } from "./i18n.ts";

export interface SessionHistoryView {
  projectRoot: string; roleId: string; runtime: RuntimeKind; rows: ReplayRow[]; error: string | null; skipped: number;
  reports?: RuntimeReportSnapshotV1[]; reportErrors?: { reportId?: string; code: string }[];
  projection?: { invalidEntries: number; omittedEntries: number; truncated: boolean };
}
// All IPC text is obtained through the public Pipeline's protected history projection.
export async function getSessionHistory(input: { projectRoot: string; roleId: string; runtime: RuntimeKind }, context?: { credentialEnvNames?: readonly string[] }): Promise<SessionHistoryView> {
  if (!input || typeof input.projectRoot !== "string" || typeof input.roleId !== "string" || !isRuntimeKind(input.runtime)) throw new Error(mainT("main.history.invalidRequest"));
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
      const detail = event.detail as Partial<PromptInputEventDetail> & Partial<ToolEventDetailV1> & { receipt?: RuntimeDeliveryReceiptV1; version?: number; deliveryId?: string; attemptId?: string; turnId?: string; stage?: 'provider-may-start' } | undefined;
      // F-8-b（2026-10-16 客户批准）：`display.process` 结构化事实（冻结接口，见 classifyProcessOutcome）——
      // 「进程跑完+退出码非零」与「超时终止」两类**不归 kind='denied'**（事件 kind/status/ok 契约原样不变，
      // 只调**行分类**；桌面UI 的行样式按其 display.process 同判据块处理，两处口径一致）。
      const processClass = classifyProcessOutcome(detail?.display);
      const row: ReplayRow = { kind: event.kind === 'message' ? 'assistant' : event.kind === 'denied' && processClass === null ? 'denied' : 'tool', text: event.summary, at: entry.at, eventKind: event.kind, ...(turnId ? { turnId } : {}) };
      // G-5 wave 2（PM 补派）：**推理行的回放载体**——`detail.source==="reasoning"` 的 message 事件，行携带
      // **投影形**子对象 `row.reasoning`（逐字 `{text: DisplayTextV1, status, durationMs?}`＝
      // `RuntimeReasoningDisplayDetailV1.reasoning`，`model/runtime.ts` 冻结；脱敏/预算已在 Service 投影
      // 单点发生——本层**只透传、不重投影、不碰内容**）。桌面UI 已按「行有该字段 ⇒ 推理折叠行」接入回放
      // 分支（实时/回放同解）；缺该字段（旧数据/坏件——Service 读取侧对坏件归投影为 reasoning-diagnostic）
      // ⇒ 下落图况逐字回落既有「已思考」assistant 文本行。**其余行字段（kind/text/at/turnId…）逐字不变**。
      const reasoningCarrier = detail as { source?: unknown; reasoning?: unknown } | undefined;
      if (event.kind === 'message' && reasoningCarrier?.source === 'reasoning'
        && typeof reasoningCarrier.reasoning === 'object' && reasoningCarrier.reasoning !== null) {
        row.reasoning = reasoningCarrier.reasoning as ReplayRow['reasoning'];
      }
      if (detail?.source === 'delivery-receipt' as string && detail?.receipt) { row.kind = 'tool'; row.text = mainT("main.history.deliveryState"); row.deliveryReceipt = detail.receipt; base.rows.push(row); continue; }
      if (detail?.source === 'delivery-boundary' as string) {
        row.kind = 'tool'; row.text = mainT("main.history.deliveryMaybeStarted");
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
        const phase = detail?.phase ?? (event.kind === 'tool_call' ? 'start' : event.kind === 'denied' && processClass === null ? 'blocked' : 'result');
        const target = detail?.display?.target?.value.text ?? previous?.target ?? '';
        const toolName = name || previous!.toolName;
        if (event.kind === 'tool_call' && key) calls.set(key, { toolName, target });
        // F-8-b：`exited-nonzero`（进程跑完、退出码非零）⇒ status='returned'（**不归 failed**；ok 字段照旧如实为 false，
        // 详情/样式判据在 display.process）；`timed-out` 保持 failed（异常终止，显著）；其余逐字不变。
        row.activity = { toolName, target, phase, status: phase === 'start' ? 'call' : processClass === 'exited-nonzero' ? 'returned' : event.kind === 'denied' || detail?.ok === false ? 'failed' : detail?.ok === true ? 'completed' : 'returned', ...(callId ? { toolCallId: callId } : {}), ...(turnId ? { turnId } : {}), ...(detail?.ok !== undefined ? { ok: detail.ok } : {}), ...(detail?.display ? { display: detail.display } : {}) };
        if (turnId && callId && ['request_confirmation','request_choice'].includes(toolName)) { row.requestId = callId; row.anchor = phase === 'start' ? 'request' : 'conclusion'; }
      }
      base.rows.push(row);
    }
    if (input.runtime === 'pi' && base.rows.length === 0) {
      const legacy = await readLegacyPiHistory(input.projectRoot, input.roleId);
      const protectedHistory = projectRoleLegacyHistory({ ...input, runtime: 'pi', readOk: legacy.ok, entries: toRuntimeLegacyEntries(legacy.rows), source: legacy.source, error: legacy.error, skipped: legacy.skipped }, context);
      if (!protectedHistory.ok) { base.error = protectedHistory.message.text; return base; }
      base.error = protectedHistory.reader.ok ? null : protectedHistory.reader.error?.text ?? mainT("main.history.legacyReadFailed"); base.skipped = protectedHistory.reader.skipped; base.projection = protectedHistory.projection;
      base.rows = protectedHistory.entries.map(entry => {
        // F-8-b：**同一结构化判据**在旧历史投影路径上防御式复读——当前核心投影不携带 `display.process`
        // （旧文本永不变成执行事实，见 multi-runtime 的钉子），`processClass` 恒为 null、行为逐字不变；
        // 将来若该投影携带事实，本路径与新版路径口径一致、无需再改。
        const legacyProcessClass = entry.kind === 'tool-record' ? classifyProcessOutcome(entry.tool.display) : null;
        const row: ReplayRow = { kind: entry.kind === 'user-text' ? 'user' : entry.kind === 'tool-record' ? entry.tool.reportedStatus === 'failed' && legacyProcessClass === null ? 'denied' : 'tool' : 'assistant', text: entry.text.text, textProjection: entry.text, at: entry.at ?? '', metadataOmissions: entry.metadataOmissions };
        if (entry.anchor) { row.anchorKey = entry.anchor.token; row.anchor = entry.anchor.position; row.requestId = entry.anchor.nativeCallId; }
        if (entry.kind === 'tool-record') { const t = entry.tool; if (t.statusSource !== undefined) row.legacyStatusSource = t.statusSource; if (t.target) row.legacyTargetSource = t.target.source; row.activity = { toolName: t.toolName, target: t.target?.value.text ?? '', phase: t.phase === 'start' ? 'call' : 'result', status: t.phase === 'start' ? 'call' : legacyProcessClass === 'exited-nonzero' ? 'returned' : t.reportedStatus ?? 'unknown', ...(t.toolCallId ? { toolCallId: t.toolCallId } : {}), ...(t.turnId ? { turnId: t.turnId } : {}), ...(t.ok !== undefined ? { ok: t.ok } : {}), ...(t.display ? { display: t.display } : {}) }; }
        return row;
      });
    }
    return base;
  } catch { return { ...base, rows: [], error: mainT("main.history.readOrProjectionFailed") }; }
}
