/**
 * 聊天行渲染（Phase 3A / 4B）。
 *
 * 行类型：user/assistant/activities/injected/delivery/handback/operator/
 * queue-aggregate/tool-lifecycle/system/denied/turn-terminal/reasoning/judge。
 * 用户/模型文本统一经 `chat/markdown` 的受控渲染（html:false、链接白名单、图片原文）。
 *
 * 4B：治理卡元信息/镜像/排队、排队聚合行、报告全文/持久化/交付回执、
 * task-request/reply-original 折叠。不改变虚拟窗口/行高口径。
 */

import { type SyntheticEvent, memo, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  CircleAlert,
  Clock,
  FileText,
  Info,
  LoaderCircle,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import {
  renderMarkdown,
} from "@/chat/markdown";
import type { ActivityItem, ChatRow } from "@/chat/types";
import { useChatStore } from "@/chat/chat-store";
import { findRole, roleDisplayName } from "@/chat/role-view";
import {
  governanceCardMetaView,
  governanceMirrorSourceLabel,
  GOVERNANCE_MIRROR_BADGE,
  GOVERNANCE_QUEUE_NOTE,
} from "@/chat/governance-view";
import {
  operatorQueued,
  OPERATOR_SUBMITTING_NOTE,
} from "@/chat/operator-view";
import { metadataLabel, textFlags } from "@/chat/report-view";
import { ReportCard, DeliveryCard } from "@/shell/ReportCard";
import {
  activityPhaseLabel,
  callSummary,
  foldSummaryText,
  mergePhases,
  phaseRowView,
  shortTime,
  type ActivityPhaseRow,
} from "@/chat/tool-summary";
import { useUiStore } from "@/stores/ui-store";
import {
  REASONING_EMPTY_NOTE,
  REASONING_FALLBACK_LABEL,
  REASONING_OMITTED_NOTE,
  REASONING_PARTIAL_NOTE,
} from "@/chat/reasoning";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function markdownHtml(text: string): { __html: string } {
  return { __html: renderMarkdown(text) };
}

/** `<details>` 开合状态按行身份存到 store（虚拟卸载/重挂后保持）。 */
function detailProps(row: ChatRow, roleId: string, key: string) {
  const open = asRecord(asRecord(row.data).detailsOpen)[key] === true;
  return {
    open,
    onToggle: (event: SyntheticEvent<HTMLDetailsElement>) => {
      const next = event.currentTarget.open;
      if (next === open) return;
      useChatStore.getState().setRowDetailOpen(roleId, row.id, key, next);
    },
  };
}

function SystemIcon({ cls }: { cls: string }) {
  const size = 12;
  const strokeWidth = 1.5;
  if (cls.includes("sys-denied")) return <ShieldAlert size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
  if (cls.includes("sys-delivery-note")) return <FileText size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
  if (cls.includes("sys-config")) return <CircleAlert size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
  if (cls.includes("sys-call")) return <Terminal size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
  if (cls.includes("sys-queue")) return <Clock size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
  return <Info size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
}

/** task-request / reply-original 折叠（同一行内容不复制；展开状态跨重建保持）。 */
function Folded({ row, roleId, children }: { row: ChatRow; roleId: string; children: ReactNode }) {
  const data = asRecord(row.data);
  const fold = asString(data.fold);
  if (fold !== "task-request" && fold !== "reply-original") return <>{children}</>;
  const open = data.foldOpen === true;
  const flags = textFlags(data.projection);
  return (
    <details
      className={fold}
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next === open) return;
        useChatStore.getState().setRowDetailOpen(roleId, row.id, "fold", next);
      }}
    >
      <summary>
        {asString(data.foldLabel) || (fold === "task-request" ? "任务请求原文" : "本轮角色回复原文（展开）")}
        {flags ? <small className="original-flags projection-flags">{flags}</small> : null}
      </summary>
      <div className="task-request-body">{children}</div>
    </details>
  );
}

function UserRow({ row, roleId }: { row: ChatRow; roleId: string }) {
  const data = asRecord(row.data);
  return (
    <Folded row={row} roleId={roleId}>
      <div
        className={"msg msg-user" + (row.replay ? " is-replay" : "")}
        data-turn-id={row.turnId || undefined}
        dangerouslySetInnerHTML={markdownHtml(asString(data.text))}
      />
    </Folded>
  );
}

function AssistantRow({ row, roleId }: { row: ChatRow; roleId: string }) {
  const data = asRecord(row.data);
  return (
    <Folded row={row} roleId={roleId}>
      <div
        className={"msg msg-assistant" + (row.replay ? " is-replay" : "")}
        data-turn-id={row.turnId || undefined}
        dangerouslySetInnerHTML={markdownHtml(asString(data.text))}
      />
    </Folded>
  );
}

function ActivityRow({ phaseRow }: { phaseRow: ActivityPhaseRow }) {
  const view = phaseRowView(phaseRow);
  const running =
    view.status === "running" || view.status === "call" || view.status === "start";
  const label = phaseRow.items.map(activityPhaseLabel).join(" → ");
  const fullTarget = view.target || "无文件目标";
  const shownTarget = fullTarget.length > 72 ? fullTarget.slice(0, 72) + "…" : fullTarget;
  return (
    <div
      className="tool-activity"
      data-call-id={view.callId || undefined}
      data-activity-index={phaseRow.index}
      data-activity-phases={phaseRow.phases.join(" ")}
    >
      <span className="activity-time" title={view.at || undefined}>
        {shortTime(view.at) || "未记录"}
      </span>
      <div>
        <span className="activity-op">{view.toolName}</span>
        <span className="activity-target" title={fullTarget}>{shownTarget}</span>
      </div>
      <span className={"activity-state " + (running ? "running" : view.status)}>
        {running ? <LoaderCircle size={12} strokeWidth={1.5} aria-hidden="true" /> : null}
        {label}
      </span>
    </div>
  );
}

/** 大工具组默认折叠时延迟挂载明细（PM §10.4 唯一 DOM 例外）：摘要仍随时可见，点开后再建 300+ 行 DOM。
 *  判定按调用数 >40；≤40 行小工具组保持旧行为（即使折叠也挂载），避免依赖现有 DOM 的契约回退。 */
const DEFER_TOOL_ROWS_WHEN_CLOSED = 40;

function ActivitiesRow({ row, roleId }: { row: ChatRow; roleId: string }) {
  const data = asRecord(row.data);
  const items = asArray<ActivityItem>(data.items);
  const open = data.open === true;
  const summary = callSummary(items);
  // 契约例外按**调用数**（mergePhases 行数）判定，不是相位条目数。
  const deferClosed = !open && summary.calls > DEFER_TOOL_ROWS_WHEN_CLOSED;
  const merged = deferClosed ? [] : mergePhases(items);
  return (
    <details
      className="tool-records"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next === open) return;
        useChatStore.getState().setActivityGroupOpen(roleId, row.id, next, true);
      }}
    >
      <summary>
        <ChevronRight
          className="disclosure-chevron"
          size={12}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <Terminal size={12} strokeWidth={1.5} aria-hidden="true" />
        <span className={"record-count" + (summary.denied > 0 || summary.failed > 0 ? " has-exception" : "")}>
          {foldSummaryText(summary)}
        </span>
      </summary>
      {merged.length > 0 ? (
        <div className="tool-activity-list">
          {merged.map((phaseRow) => (
            <ActivityRow
              key={(phaseRow.callId || "a") + ":" + phaseRow.index}
              phaseRow={phaseRow}
            />
          ))}
        </div>
      ) : null}
    </details>
  );
}

function DisplayField({ label, value }: { label: string; value: unknown }) {
  const record = asRecord(value);
  if (typeof record.text !== "string") return null;
  return (
    <section className="tool-detail-field">
      <strong>{label}</strong>
      <span className="projection-flags">{textFlags(record)}</span>
      <pre>{record.text}</pre>
    </section>
  );
}

function ToolDetails({ activity }: { activity: ActivityItem }) {
  const display = asRecord(activity.display);
  const notes = [
    activity.legacyStatusSource === "legacy-classifier"
      ? "状态来源：旧文本分类，不是新机器执行事实"
      : "",
    metadataLabel(activity.metadataOmissions),
    textFlags(activity.legacyTextProjection),
  ]
    .filter(Boolean)
    .join("；");
  const metadata = notes ? <p className="projection-flags">{notes}</p> : null;
  if (activity.displayUnsupported) {
    return (
      <>
        {metadata}
        <p className="muted">不支持此详情版本。</p>
      </>
    );
  }
  if (!activity.hasDisplay || Object.keys(display).length === 0) {
    return (
      <>
        {metadata}
        <p className="muted">这条历史没有保存更多目标和错误详情。</p>
      </>
    );
  }
  const target = asRecord(display.target);
  const process = asRecord(display.process);
  const omissions = Array.isArray(display.omissions) ? display.omissions : [];
  return (
    <>
      {metadata}
      {Object.keys(target).length > 0 ? (
        <DisplayField label={target.kind === "command" ? "实际命令" : "目标文件"} value={target.value} />
      ) : (
        <p className="muted">本次调用无文件目标（交互/派发类工具）</p>
      )}
      <DisplayField label={activity.status === "exited-nonzero" ? "消息" : "错误"} value={display.error} />
      <DisplayField label="结果" value={display.resultText} />
      {typeof process.exitCode === "number" ? <p>退出码：{process.exitCode}</p> : null}
      {typeof process.signal === "string" && process.signal ? <p>信号：{process.signal}</p> : null}
      <DisplayField label="标准输出" value={process.stdout} />
      <DisplayField label="标准错误" value={process.stderr} />
      {typeof display.durationMs === "number" ? <p>耗时：{display.durationMs} ms</p> : null}
      {omissions.length > 0 ? (
        <p className="muted">
          {omissions
            .map((reason) =>
              reason === "budget"
                ? "部分展示内容因预算省略"
                : reason === "unsupported-content"
                  ? "非文本结果未展示"
                  : "未支持的输入未展示",
            )
            .join("；")}
        </p>
      ) : null}
    </>
  );
}

function ToolLifecycleRow({ row, roleId }: { row: ChatRow; roleId: string }) {
  const data = asRecord(row.data);
  const stages = asRecord(data.stages);
  const order = ["start", "blocked", "result"]
    .map((phase) => asRecord(stages[phase]) as unknown as ActivityItem)
    .filter((item) => Object.keys(item).length > 0);
  const activity = order.length > 0
    ? order[order.length - 1]
    : (asRecord(data.activity) as unknown as ActivityItem);
  const target =
    asString(activity.fullTarget) ||
    asString(asRecord(stages.start).fullTarget) ||
    asString(activity.target) ||
    "无文件目标";
  const labelText =
    order.length > 0
      ? order.map((item) => asString(item.label) || asString(item.statusText)).join(" → ")
      : asString(activity.label) || asString(activity.statusText);
  return (
    <details className="tool-call-record" {...detailProps(row, roleId, "details")}>
      <summary>
        <span className="tool-call-time" title={asString(activity.at) || "时间未保存"}>
          {shortTime(asString(activity.at))}
        </span>
        <strong>{asString(activity.toolName)}</strong>
        <span className="tool-call-target">{target}</span>
        <span className={"tool-call-status " + (asString(activity.status) || "recorded")}>
          {labelText}
        </span>
        {activity.failed && asString(activity.visibleSummary) ? (
          <span className="tool-call-error">
            {asString(activity.visibleSummary).slice(0, 180)}
          </span>
        ) : null}
      </summary>
      <div className="tool-call-details">
        {order.length > 0
          ? order.map((item, index) => (
              <div className="tool-call-stage" key={index}>
                <h4>{asString(item.label) || asString(item.statusText)}</h4>
                <ToolDetails activity={item} />
              </div>
            ))
          : <ToolDetails activity={activity} />}
      </div>
    </details>
  );
}

function SystemRow({ row }: { row: ChatRow }) {
  const data = asRecord(row.data);
  const cls = asString(data.cls) || "sys-call";
  return (
    <div className={"sys " + cls + (row.replay ? " is-replay" : "")}>
      <span className="sys-ico">
        <SystemIcon cls={cls} />
      </span>
      <span className="sys-text">{asString(data.text)}</span>
    </div>
  );
}

function DeniedRow({ row, roleId }: { row: ChatRow; roleId: string }) {
  const data = asRecord(row.data);
  const text = asString(data.text);
  const headline = text.split(/\r?\n/)[0] || "操作未放行";
  const target = asString(data.target);
  const legacyFlags = data.legacy === true
    ? [metadataLabel(data.metadataOmissions), textFlags(data.projection)].filter(Boolean).join("；")
    : "";
  return (
    <details
      className={"sys-denied" + (row.replay ? " is-replay" : "")}
      {...detailProps(row, roleId, "details")}
    >
      <summary>
        <ChevronRight
          className="disclosure-chevron"
          size={12}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="denied-copy">
          <span>{headline}</span>
          {target && !headline.includes(target) ? (
            <span className="denied-target">{target}</span>
          ) : !target ? (
            <span className="denied-target">目标未记录</span>
          ) : null}
        </span>
      </summary>
      <div className="sys-detail">
        {data.legacy === true ? (
          <p className="projection-flags">
            {"旧文本分类，不是新机器执行事实" + (legacyFlags ? "；" + legacyFlags : "")}
          </p>
        ) : null}
        {text}
      </div>
    </details>
  );
}

function InjectedRow({ row }: { row: ChatRow }) {
  const data = asRecord(row.data);
  const kind = asString(data.kind) || "system";
  if (kind === "system-notice") {
    return (
      <div className={"sys sys-notice" + (row.replay ? " is-replay" : "")}>
        <span className="sys-ico">
          <ShieldCheck size={12} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <span className="sys-notice-badge">{asString(data.label) || "系统通知"}</span>
        <span className="sys-text">
          {asString(data.displayBody) || asString(data.body)}
        </span>
      </div>
    );
  }
  return (
    <div className={"msg msg-injected is-" + kind + (row.replay ? " is-replay" : "")}>
      <div className="mi-head">
        <span className="mi-chip">{asString(data.label)}</span>
      </div>
      <div className="mi-body" dangerouslySetInnerHTML={markdownHtml(asString(data.body))} />
    </div>
  );
}

function DeliveryRow({ row, roleId }: { row: ChatRow; roleId: string }) {
  const data = asRecord(row.data);
  return <DeliveryCard data={data} roleId={roleId} replay={row.replay} />;
}

function HandbackRow({ row, roleId }: { row: ChatRow; roleId: string }) {
  const data = asRecord(row.data);
  const open = asRecord(data.detailsOpen)["report-complete"] === true;
  return (
    <ReportCard
      report={data.report}
      roleId={roleId}
      data={data}
      detailsOpen={open}
      onDetailsToggle={(next) => {
        useChatStore.getState().setRowDetailOpen(roleId, row.id, "report-complete", next);
      }}
    />
  );
}

function OperatorRow({ row, roleId }: { row: ChatRow; roleId: string }) {
  const data = asRecord(row.data);
  const payload = asRecord(data.payload);
  const request = asRecord(payload.request);
  const id = asString(payload.id) || row.requestId || "";
  const state = asString(data.state) || "open";
  const finalNote = asString(data.finalNote);
  const retryError = asString(data.retryError);
  const kind = asString(request.kind);
  const options = asArray<Record<string, unknown>>(request.options);
  const selected = asArray<string>(data.selected);
  const judgeNotice = asString(payload.judgeNotice);
  const isMirror = data.isMirror === true;
  const surfaceRoleId = asString(data.surfaceRoleId) || roleId;
  const queued = data.queued === true || operatorQueued(payload);
  const meta = governanceCardMetaView(request);
  const toolLifecycle = asRecord(data.toolLifecycle);
  const lifecycleStages = asRecord(toolLifecycle.stages);
  const lifecycleText = ["start", "blocked", "result"]
    .map((phase) => asRecord(lifecycleStages[phase]) as unknown as ActivityItem)
    .filter((item) => Object.keys(item).length > 0)
    .map((item) => asString(item.label) || asString(item.statusText))
    .filter((text) => text !== "")
    .join(" → ");
  const roles = useChatStore((s) => s.roles);
  const drawerOpen = useUiStore((s) => s.drawerOpen);
  const sourceName = roleDisplayName(findRole(roles, asString(payload.roleId)));
  const setSelected = (next: string[]) => {
    useChatStore.getState().setOperatorSelected(roleId, row.id, next);
  };
  const submitting = state === "submitting";
  const closed = state === "decided" || state === "expired";
  const preview = asString(request.preview);
  const respond = (decision: unknown) => {
    if (closed || submitting || queued) return;
    void useChatStore.getState().respondOperator(id, decision);
  };
  const note = retryError
    ? retryError
    : submitting
      ? OPERATOR_SUBMITTING_NOTE
      : closed
        ? finalNote || "请求已失效，未获同意。"
        : queued
          ? GOVERNANCE_QUEUE_NOTE
          : "";
  const noteClass =
    state === "expired" || retryError ? "op-note op-note-err" : "op-note";
  return (
    <div
      className={"op-request" + (isMirror ? " is-mirror" : "")}
      data-request-id={id}
      data-surface-role-id={surfaceRoleId}
      data-state={state}
      role="group"
      aria-label={asString(request.title) || "交互请求"}
      inert={drawerOpen ? true : undefined}
    >
      {meta.governance || isMirror ? (
        <div className="op-badges">
          {meta.governance ? <span className="op-gov-badge">{meta.badge}</span> : null}
          {isMirror ? <span className="op-mirror-badge">{GOVERNANCE_MIRROR_BADGE}</span> : null}
        </div>
      ) : null}
      {isMirror ? (
        <p className="op-mirror-source">
          {governanceMirrorSourceLabel(sourceName || asString(payload.roleId))}
        </p>
      ) : null}
      {meta.lines.length > 0 ? (
        <div className="op-meta">
          {meta.lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      ) : null}
      <div className="op-title">{asString(request.title) || (kind === "choice" ? "请选择" : "请确认")}</div>
      {lifecycleText ? <div className="op-tool-lifecycle">{lifecycleText}</div> : null}
      {request.detail ? <p className="op-note">{asString(request.detail)}</p> : null}
      {preview ? (
        <details className="op-preview">
          <summary>预览内容</summary>
          <div
            className="op-preview-body card-md"
            dangerouslySetInnerHTML={markdownHtml(preview)}
          />
        </details>
      ) : null}
      {kind === "choice" && options.length > 0 ? (
        <div className="op-options">
          {options.map((option, index) => {
            const optionId = asString(option.id) || String(index);
            return (
              <label
                key={optionId}
                className={selected.includes(optionId) ? "is-selected" : undefined}
              >
                <input
                  type={request.multiple === true ? "checkbox" : "radio"}
                  name={"op-" + id}
                  value={optionId}
                  disabled={closed || submitting}
                  checked={selected.includes(optionId)}
                  onChange={() => {
                    if (request.multiple === true) {
                      setSelected(
                        selected.includes(optionId)
                          ? selected.filter((value) => value !== optionId)
                          : [...selected, optionId],
                      );
                    } else {
                      setSelected([optionId]);
                    }
                  }}
                />
                <span>{asString(option.label) || optionId}</span>
              </label>
            );
          })}
        </div>
      ) : null}
      {judgeNotice ? <div className="op-judge-notice">{judgeNotice}</div> : null}
      {queued ? <p className="op-queued">{GOVERNANCE_QUEUE_NOTE}</p> : null}
      {/* PM §十三 最小例外（2026-10-21）：失效/已答卡（closed）收起全部动作按钮，
          保留 disabled、finalNote、aria 与卡片容器（旧 freezeOperatorCard 同义）；
          只此一处，不改其它行渲染。排队卡不提供可操作按钮。 */}
      <div className="op-actions" hidden={closed || queued}>
        {kind === "choice" ? (
          <>
            <button
              className="op-submit"
              type="button"
              hidden={closed}
              disabled={closed || submitting || selected.length === 0 || (request.multiple !== true && selected.length !== 1)}
              onClick={() => respond({ kind: "choice", selected })}
            >
              提交
            </button>
            <button className="op-cancel" type="button" hidden={closed} disabled={closed || submitting} onClick={() => respond({ kind: "choice", cancelled: true })}>
              取消
            </button>
          </>
        ) : (
          <>
            <button className="op-confirm" type="button" hidden={closed} disabled={closed || submitting} onClick={() => respond({ kind: "confirm", confirmed: true })}>
              确认
            </button>
            <button className="op-deny" type="button" hidden={closed} disabled={closed || submitting} onClick={() => respond({ kind: "confirm", confirmed: false })}>
              拒绝
            </button>
          </>
        )}
      </div>
      {note ? <p className={noteClass} role={submitting ? "status" : undefined}>{note}</p> : null}
    </div>
  );
}

function QueueAggregateRow({ row }: { row: ChatRow }) {
  const data = asRecord(row.data);
  return (
    <div className="sys sys-queue op-queue-aggregate" role="status" aria-live="polite">
      <span className="sys-ico">
        <SystemIcon cls="sys-queue" />
      </span>
      <span className="sys-text">{asString(data.text)}</span>
    </div>
  );
}

function TurnTerminalRow({ row }: { row: ChatRow }) {
  const data = asRecord(row.data);
  const outcome = asString(data.outcome);
  const sources = Array.isArray(data.sources)
    ? data.sources
        .map((source) => asString(asRecord(source).text))
        .filter((text) => text !== "")
    : [];
  const lines = sources.length > 0 ? sources : [asString(data.text) || "本轮结束"];
  return (
    <div
      className={"sys sys-call turn-terminal" + (row.replay ? " is-replay" : "")}
      data-turn-id={asString(data.turnId)}
      data-outcome={outcome}
    >
      <span className="sys-ico">
        {outcome === "completed" ? <Check size={12} strokeWidth={1.5} aria-hidden="true" /> : <CircleAlert size={12} strokeWidth={1.5} aria-hidden="true" />}
      </span>
      <div className="sys-text">
        {lines.map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
    </div>
  );
}

function ReasoningRow({ row, roleId }: { row: ChatRow; roleId: string }) {
  const data = asRecord(row.data);
  const status = asString(data.status);
  const omitted = status === "omitted";
  // omitted 一律不呈现正文（即便载荷违规带了文本；提取层已强制为空，这里再守一道）。
  const text = omitted ? "" : asString(data.text);
  const hasText = text.trim() !== "";
  const partialOmitted = !omitted && data.partialOmitted === true;
  const note = omitted
    ? REASONING_OMITTED_NOTE
    : !hasText
      ? REASONING_EMPTY_NOTE
      : partialOmitted
        ? REASONING_PARTIAL_NOTE
        : "";
  return (
    <details
      className="tool-records reasoning-row"
      data-turn-id={row.turnId || undefined}
      {...detailProps(row, roleId, "details")}
    >
      <summary>
        <ChevronRight
          className="disclosure-chevron"
          size={12}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="tool-title">
          {asString(data.label) || REASONING_FALLBACK_LABEL}
        </span>
      </summary>
      {hasText ? <pre className="reasoning-text">{text}</pre> : null}
      {note ? <p className="reasoning-note">{note}</p> : null}
    </details>
  );
}

/**
 * 判断结果行内容（shell:judge-result / session:operator-judge）。
 * 外层 `.chat-row` 在 VirtualPane 里同时带 `.sys .shell-judge-row` 类（e2e 直接取 pane 子元素）；
 * 这里只产 `.sys-ico` + `.sys-text.sj-body`。所有动态文本经 React 文本节点（等价 esc）。
 */
function ShellJudgeResultBody({ view }: { view: import("@/chat/judge").ShellJudgeResultView }) {
  const d = view.details;
  return (
    <>
      <span className="sys-ico">
        {view.verdict === "allow" ? (
          <Check size={12} strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <ShieldAlert size={12} strokeWidth={1.5} aria-hidden="true" />
        )}
      </span>
      <div className="sys-text sj-body">
        <div className="sj-head">
          <span className="sj-title">{view.title}</span>
          {view.denyOverride ? <span className="sj-badge">{view.label}</span> : null}
        </div>
        <div className="sj-cmd">{view.summary}</div>
        <div className="sj-meta">
          {[view.tierText, view.engineText, view.operatorText, shortTime(view.at)]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {view.lines.map((line, index) => (
          <div className="sj-line" key={index}>
            {line}
          </div>
        ))}
        {view.retryHint ? <div className="sj-exit">{view.retryHint}</div> : null}
        <details className="sj-details">
          <summary>
            <ChevronRight
              className="disclosure-chevron"
              size={12}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            详情（命令原文 / 理由 / 证据）
          </summary>
          <div className="sj-details-body">
            {d.command ? (
              <>
                <p className="sj-d-label">命令原文</p>
                <pre className="sj-pre">{d.command}</pre>
              </>
            ) : null}
            {d.cwd ? <p className="sj-kv">cwd：{d.cwd}</p> : null}
            {d.reason ? <p className="sj-kv">判断理由：{d.reason}</p> : null}
            {d.alternative ? <p className="sj-kv">{d.alternative}</p> : null}
            {d.customerMessage ? (
              <p className="sj-kv">客户说明：{d.customerMessage}</p>
            ) : null}
            {d.customerMessageSynthesized ? (
              <p className="sj-note">客户说明由系统整理。</p>
            ) : null}
            {d.evidence.length > 0 ? (
              <>
                <p className="sj-d-label">证据</p>
                <ul className="sj-evidence">
                  {d.evidence.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {d.hardDenyOverride ? (
              <p className="sj-note">hardDenyOverride：true（deny 档被判断 agent 放行）。</p>
            ) : null}
            {d.toolCallId ? <p className="sj-note">toolCallId：{d.toolCallId}</p> : null}
          </div>
        </details>
      </div>
    </>
  );
}

function GovernanceJudgeResultBody({
  view,
}: {
  view: import("@/chat/judge").GovernanceJudgeResultView;
}) {
  const d = view.details;
  const stats: string[] = [];
  if (d.durationMs !== null) stats.push("耗时 " + d.durationMs + "ms");
  if (d.readCalls !== null) stats.push("读取 " + d.readCalls + " 次");
  if (d.readBytes !== null) stats.push(d.readBytes + " 字节");
  return (
    <>
      <span className="sys-ico">
        <Check size={12} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <div className="sys-text sj-body">
        <div className="sj-head">
          <span className="sj-title">{view.title}</span>
          <span className="sj-badge">{view.badge}</span>
        </div>
        <div className="sj-cmd">{view.headline}</div>
        <div className="sj-meta">
          {[view.engineText, view.operatorText, view.flowText, shortTime(view.at)]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {view.lines.map((line, index) => (
          <div className="sj-line" key={index}>
            {line}
          </div>
        ))}
        <details className="sj-details">
          <summary>
            <ChevronRight
              className="disclosure-chevron"
              size={12}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            详情（判断理由 / 选中项 / 证据）
          </summary>
          <div className="sj-details-body">
            {d.flowId ? <p className="sj-kv">流程：{d.flowId}</p> : null}
            {d.reason ? <p className="sj-kv">判断理由：{d.reason}</p> : null}
            {d.selected.length > 0 ? (
              <p className="sj-kv">选中项：{d.selected.join("、")}</p>
            ) : null}
            {d.paths.length > 0 ? (
              <p className="sj-kv">路径：{d.paths.join("、")}</p>
            ) : null}
            {d.pathDecisions.length > 0 ? (
              <>
                <p className="sj-d-label">逐路径结论</p>
                <ul className="sj-evidence">
                  {d.pathDecisions.map((item, index) => (
                    <li key={index}>
                      {item.path}：{item.ok ? "允许" : "拒绝"}
                      {item.reason ? "（" + item.reason + "）" : ""}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {d.evidence.length > 0 ? (
              <>
                <p className="sj-d-label">证据</p>
                <ul className="sj-evidence">
                  {d.evidence.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {stats.length > 0 ? <p className="sj-kv">{stats.join(" · ")}</p> : null}
            {d.toolCallId ? <p className="sj-note">toolCallId：{d.toolCallId}</p> : null}
            {d.requestId ? <p className="sj-note">requestId：{d.requestId}</p> : null}
          </div>
        </details>
      </div>
    </>
  );
}

export interface ChatRowViewProps {
  row: ChatRow;
  roleId: string;
  /** 行数据引用（row.data）；用于 memo 比较同一行对象的增量更新。 */
  dataVersion: unknown;
}

function ChatRowViewInner({ row, roleId }: ChatRowViewProps) {
  switch (row.kind) {
    case "user":
      return <UserRow row={row} roleId={roleId} />;
    case "assistant":
      return <AssistantRow row={row} roleId={roleId} />;
    case "activities":
      return <ActivitiesRow row={row} roleId={roleId} />;
    case "tool-lifecycle":
      return <ToolLifecycleRow row={row} roleId={roleId} />;
    case "system":
      return <SystemRow row={row} />;
    case "denied":
      return <DeniedRow row={row} roleId={roleId} />;
    case "injected":
      return <InjectedRow row={row} />;
    case "delivery":
      return <DeliveryRow row={row} roleId={roleId} />;
    case "handback":
      return <HandbackRow row={row} roleId={roleId} />;
    case "operator":
      return <OperatorRow row={row} roleId={roleId} />;
    case "queue-aggregate":
      return <QueueAggregateRow row={row} />;
    case "turn-terminal":
      return <TurnTerminalRow row={row} />;
    case "reasoning":
      return <ReasoningRow row={row} roleId={roleId} />;
    case "judge-result":
      return (
        <ShellJudgeResultBody
          view={(row.data as { view: import("@/chat/judge").ShellJudgeResultView }).view}
        />
      );
    case "governance-judge-result":
      return (
        <GovernanceJudgeResultBody
          view={
            (row.data as { view: import("@/chat/judge").GovernanceJudgeResultView }).view
          }
        />
      );
    default:
      return <SystemRow row={row} />;
  }
}

export const ChatRowView = memo(
  ChatRowViewInner,
  (previous, next) =>
    previous.row === next.row &&
    previous.roleId === next.roleId &&
    previous.dataVersion === next.dataVersion,
);
