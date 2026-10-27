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

import { type SyntheticEvent, memo, type ReactNode, useEffect, useId, useState } from "react";
import {
  AlertTriangle,
  Bot,
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
import { clientProjectionFrom } from "@/chat/events";
import { projectionStatusText } from "@/chat/projection-view";
import type { ActivityItem, ChatRow } from "@/chat/types";
import { useChatStore } from "@/chat/chat-store";
import { findRole, roleDisplayName } from "@/chat/role-view";
import {
  governanceCardMetaView,
  governanceMirrorSourceLabel,
  governanceQueueNote,
  governanceMirrorBadge,
} from "@/chat/governance-view";
import {
  operatorQueued,
  operatorSubmittingNote,
} from "@/chat/operator-view";
import {
  decisionCardView,
  decisionOptionBadge,
} from "@/chat/decision-card";
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
import {
  extractToolErrorReason,
  toolDetailsContainText,
  toolFailureFullText,
} from "@/chat/tool-error";
import {
  ToolErrorFullEntry,
  ToolErrorSummary,
} from "@/chat/tool-error-view";
import { ShellJudgeRowCard } from "@/chat/judge-row-view";
import { toolRowTextDisplay } from "@/chat/tool-row-text";
import { ToolDetailsView } from "@/chat/tool-details-view";
import {
  isSafeProjectImagePath,
  viewImagePreviewUrl,
} from "@/chat/view-image-preview";
import { useViewImageLightbox } from "@/chat/view-image-lightbox";
import { useUiStore } from "@/stores/ui-store";
import {
  reasoningEmptyNote,
  reasoningFallbackLabel,
  reasoningOmittedNote,
  reasoningPartialNote,
  reasoningUnsafeNote,
} from "@/chat/reasoning";
import { useLocaleState, useT } from "@/i18n";

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
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const data = asRecord(row.data);
  const fold = asString(data.fold);
  if (fold !== "task-request" && fold !== "reply-original") return <>{children}</>;
  const open = data.foldOpen === true;
  const flags = textFlags(data.projection, locale);
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
        {asString(data.foldLabel) ||
          (fold === "task-request"
            ? t("ui.reportView.taskRequestLabel")
            : t("ui.reportView.replyOriginalLabel"))}
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
  const locale = useLocaleState((s) => s.locale);
  const roles = useChatStore((s) => s.roles);
  const role = findRole(roles, roleId);
  const roleName = role ? roleDisplayName(role, locale) : "";
  const at = asString(data.at);
  const time = shortTime(at);
  return (
    <Folded row={row} roleId={roleId}>
      {roleName || time ? (
        <div className="msg-meta" data-turn-id={row.turnId || undefined}>
          <span className="msg-avatar" aria-hidden="true">
            {roleName.slice(0, 1)}
          </span>
          {roleName ? <span className="msg-role">{roleName}</span> : null}
          {time ? (
            <time className="msg-time" dateTime={at || undefined}>
              {time}
            </time>
          ) : null}
        </div>
      ) : null}
      <div
        className={"msg msg-assistant" + (row.replay ? " is-replay" : "")}
        data-turn-id={row.turnId || undefined}
        dangerouslySetInnerHTML={markdownHtml(asString(data.text))}
      />
    </Folded>
  );
}

function ActivityRow({
  phaseRow,
  roleId,
  projectRoot,
}: {
  phaseRow: ActivityPhaseRow;
  roleId: string;
  projectRoot: string | null;
}) {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const view = phaseRowView(phaseRow, locale);
  const running =
    view.status === "running" || view.status === "call" || view.status === "start";
  const label = phaseRow.items
    .map((item) => activityPhaseLabel(item, locale))
    .join(" → ");
  const fullTarget = view.target || t("ui.chatRow.noFileTarget");
  const targetView = toolRowTextDisplay(fullTarget);
  // view_image 兜底：若历史/旧数据仍把它归入工具组，展开后同样显示缩略图；
  // 未放行/失败的调用角色并未看到图片，不显示。
  const terminal = view.items[view.items.length - 1] || view.items[0];
  const previewable =
    view.toolName === "view_image" &&
    view.target !== "" &&
    view.status !== "denied" &&
    view.status !== "failed" &&
    view.status !== "timed-out" &&
    terminal?.denied !== true &&
    terminal?.failed !== true;
  return (
    <>
      <div
        className="tool-activity"
        data-call-id={view.callId || undefined}
        data-activity-index={phaseRow.index}
        data-activity-phases={phaseRow.phases.join(" ")}
      >
        <span className="activity-time" title={view.at || undefined}>
          {shortTime(view.at) || t("ui.chatRow.timeNotRecorded")}
        </span>
        <div>
          <span className="activity-op">{view.toolName}</span>
          <span className="activity-target" title={targetView.title}>{targetView.display}</span>
        </div>
        <span className={"activity-state " + (running ? "running" : view.status)} title={label || undefined}>
          {running ? <LoaderCircle size={12} strokeWidth={1.5} aria-hidden="true" /> : null}
          {view.status === "failed" || view.status === "timed-out" ? (
            <AlertTriangle size={12} strokeWidth={1.5} aria-hidden="true" />
          ) : null}
          {label}
        </span>
      </div>
      {previewable ? (
        <ViewImagePreview roleId={roleId} projectRoot={projectRoot} target={view.target} />
      ) : null}
    </>
  );
}

/** 大工具组默认折叠时延迟挂载明细（PM §10.4 唯一 DOM 例外）：摘要仍随时可见，点开后再建 300+ 行 DOM。
 *  判定按调用数 >40；≤40 行小工具组保持旧行为（即使折叠也挂载），避免依赖现有 DOM 的契约回退。 */
const DEFER_TOOL_ROWS_WHEN_CLOSED = 40;

function ActivitiesRow({ row, roleId }: { row: ChatRow; roleId: string }) {
  const locale = useLocaleState((s) => s.locale);
  const projectRoot = useChatStore((s) => s.projectRoot);
  const data = asRecord(row.data);
  const items = asArray<ActivityItem>(data.items);
  const open = data.open === true;
  const summary = callSummary(items, locale);
  // 契约例外按**调用数**（mergePhases 行数）判定，不是相位条目数。
  const deferClosed = !open && summary.calls > DEFER_TOOL_ROWS_WHEN_CLOSED;
  const merged = deferClosed ? [] : mergePhases(items, locale);
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
          {foldSummaryText(summary, locale)}
        </span>
      </summary>
      {merged.length > 0 ? (
        <div className="tool-activity-list">
          {merged.map((phaseRow) => (
            <ActivityRow
              key={(phaseRow.callId || "a") + ":" + phaseRow.index}
              phaseRow={phaseRow}
              roleId={roleId}
              projectRoot={projectRoot}
            />
          ))}
        </div>
      ) : null}
    </details>
  );
}

/** view_image 缩略图（2026-10-27 客户要求：看到角色查看的那张图；点击应用内放大）。
 *  只按「项目根 + 项目相对路径」构造 file URL；路径非法/项目根缺失/加载失败时
 *  不显示破图，保留工具行并按原因如实标注。点击缩略图打开 app 内 lightbox（不导航、
 *  不打开 file:// 页面、不改 CSP）；放大层是 fixed portal，不参与虚拟窗口行高。 */
function ViewImagePreview({
  roleId,
  projectRoot,
  target,
}: {
  roleId: string;
  projectRoot: string | null;
  target: string;
}) {
  const t = useT();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const ownerId = useId();
  // 缩略图卸载（虚拟窗口/切换角色）时关闭自己打开的放大层，避免弹层悬空。
  useEffect(
    () => () => {
      useViewImageLightbox.getState().close(ownerId);
    },
    [ownerId],
  );
  // 缩略图异步加载会改变行高；通知 pane 重新测量（贴底/滚动偏好仍由 VirtualPane 既有规则决定）。
  const remeasure = () => useChatStore.getState().touchPane(roleId);
  if (target === "") return null;
  if (!projectRoot) {
    return <div className="view-image-note">{t("ui.viewImage.previewNoProject")}</div>;
  }
  const src = isSafeProjectImagePath(target)
    ? viewImagePreviewUrl(projectRoot, target)
    : null;
  if (!src) {
    return <div className="view-image-note">{t("ui.viewImage.previewPathUnsafe")}</div>;
  }
  if (failedSrc === src) {
    return <div className="view-image-note">{t("ui.viewImage.previewLoadFailed")}</div>;
  }
  return (
    <div className="view-image-preview">
      <button
        type="button"
        className="view-image-preview-trigger"
        aria-label={t("ui.viewImage.openPreview", { path: target })}
        aria-haspopup="dialog"
        onClick={() =>
          useViewImageLightbox.getState().open({ src, target, ownerId })
        }
      >
        <img
          className="view-image-preview"
          src={src}
          alt={target}
          loading="lazy"
          decoding="async"
          onLoad={remeasure}
          onError={() => {
            setFailedSrc(src);
            remeasure();
          }}
        />
      </button>
    </div>
  );
}

/** 工具生命周期行（`.tool-call-record`；旧文档/探针也称 ToolCallRecord）：start/result/blocked
 *  按 callId 合并展示，`view_image` 的缩略图在该 `<details>` 之外。 */
function ToolLifecycleRow({ row, roleId }: { row: ChatRow; roleId: string }) {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const projectRoot = useChatStore((s) => s.projectRoot);
  const data = asRecord(row.data);
  const stages = asRecord(data.stages);
  const order = ["start", "blocked", "result"]
    .map((phase) => asRecord(stages[phase]) as unknown as ActivityItem)
    .filter((item) => Object.keys(item).length > 0);
  const activity = order.length > 0
    ? order[order.length - 1]
    : (asRecord(data.activity) as unknown as ActivityItem);
  const rawTarget =
    asString(activity.fullTarget) ||
    asString(asRecord(stages.start).fullTarget) ||
    asString(activity.target);
  const target = rawTarget || t("ui.chatRow.noFileTarget");
  const labelText =
    order.length > 0
      ? order.map((item) => asString(item.label) || asString(item.statusText)).join(" → ")
      : asString(activity.label) || asString(activity.statusText);
  const failed = activity.failed === true;
  const toolName = asString(activity.toolName);
  const targetView = toolRowTextDisplay(target);
  // 失败行：summary 只留工具名 + 失败徽标 + 一行原因；完整原文交给展开区。
  const fullErrorText = failed ? toolFailureFullText(activity) : "";
  const errorReason = failed
    ? extractToolErrorReason(fullErrorText, { toolName, maxLength: 48 })
    : "";
  const detailItems = order.length > 0 ? order : [activity];
  const detailsHaveFullText =
    failed && fullErrorText !== "" &&
    toolDetailsContainText(detailItems, fullErrorText, errorReason);
  const statusClass = asString(activity.status) || "recorded";
  return (
    <>
      <details
        className="tool-call-record"
        data-failed={failed ? "true" : undefined}
        {...detailProps(row, roleId, "details")}
      >
        {failed ? (
          <ToolErrorSummary
            timeText={shortTime(asString(activity.at))}
            timeTitle={asString(activity.at) || t("ui.chatRow.timeNotSaved")}
            toolName={toolName}
            target={targetView.display}
            targetTitle={targetView.title}
            statusLabel={labelText || t("ui.tool.status.failed")}
            statusClass={statusClass}
            reason={errorReason}
          />
        ) : (
          <summary>
            <span className="tool-call-time" title={asString(activity.at) || t("ui.chatRow.timeNotSaved")}>
              {shortTime(asString(activity.at))}
            </span>
            <strong>{toolName}</strong>
            <span className="tool-call-target" title={targetView.title}>{targetView.display}</span>
            <span className={"tool-call-status " + statusClass} title={labelText || undefined}>
              {labelText}
            </span>
          </summary>
        )}
        <div className="tool-call-details">
          {failed && fullErrorText !== "" && !detailsHaveFullText ? (
            <ToolErrorFullEntry label={t("ui.chatRow.error")} text={fullErrorText} />
          ) : null}
          <ToolDetailsView items={detailItems} t={t} locale={locale} />
        </div>
      </details>
      {/* 未放行/失败的调用角色并未看到图片：不显示缩略图，只保留命令行与状态。 */}
      {toolName === "view_image" && !failed && activity.denied !== true ? (
        <ViewImagePreview roleId={roleId} projectRoot={projectRoot} target={rawTarget} />
      ) : null}
    </>
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
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const data = asRecord(row.data);
  const text = asString(data.text);
  const headline = text.split(/\r?\n/)[0] || t("ui.chatRow.operationNotApproved");
  const target = asString(data.target);
  const legacyFlags = data.legacy === true
    ? [metadataLabel(data.metadataOmissions, locale), textFlags(data.projection, locale)]
        .filter(Boolean)
        .join(locale === "zh-CN" ? "；" : "; ")
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
            <span className="denied-target">{t("ui.chatRow.targetNotRecorded")}</span>
          ) : null}
        </span>
      </summary>
      <div className="sys-detail">
        {data.legacy === true ? (
          <p className="projection-flags">
            {t("ui.chatRow.legacyClassification") +
              (legacyFlags
                ? (locale === "zh-CN" ? "；" : "; ") + legacyFlags
                : "")}
          </p>
        ) : null}
        {text}
      </div>
    </details>
  );
}

function InjectedRow({ row }: { row: ChatRow }) {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const data = asRecord(row.data);
  const kind = asString(data.kind) || "system";
  if (kind === "system-notice") {
    return (
      <div className={"sys sys-notice" + (row.replay ? " is-replay" : "")}>
        <span className="sys-ico">
          <ShieldCheck size={12} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <span className="sys-notice-badge">
          {asString(data.label) || t("ui.events.systemNotice")}
        </span>
        <span className="sys-text">
          {asString(data.displayBody) || asString(data.body)}
        </span>
      </div>
    );
  }
  const label = asString(data.label);
  const body = asString(data.body);
  const projection = clientProjectionFrom(data.clientProjection);
  const projectionCount =
    typeof data.projectionCount === "number" &&
    Number.isFinite(data.projectionCount) &&
    data.projectionCount > 1
      ? Math.floor(data.projectionCount)
      : 1;
  const occurrences = asArray<Record<string, unknown>>(data.projectionOccurrences);
  const flowIds = projection?.flowIds ?? [];
  const projectionStatus = projection
    ? projectionStatusText(projection.statusCode, projection.statusText, locale)
    : "";
  // A3：有客户投影时只展示投影（状态/流程/报告路径/来源角色），内部原文默认折叠。
  // 无投影（旧事件/恢复行）保持既有渲染，不猜、不伪造字段。
  if (kind === "system" && projection) {
    return (
      <div
        className={
          "msg msg-injected is-system is-projection" + (row.replay ? " is-replay" : "")
        }
        data-projection-kind={projection.kind}
        data-projection-status={projection.statusCode}
        data-projection-action={projection.action}
      >
        <div className="mi-head">
          <span className="mi-chip">{label}</span>
          <span className="mi-source">
            {projection.sourceRole.displayName || projection.sourceRole.roleId}
          </span>
          {projectionCount > 1 ? (
            <span className="mi-count">×{projectionCount}</span>
          ) : null}
        </div>
        <div className="mi-projection">
          {projectionStatus ? (
            <p className="mi-status">{projectionStatus}</p>
          ) : null}
          {flowIds.map((flowId, index) => (
            <p className="mi-flow" key={flowId + ":" + index}>
              {t("ui.judge.flowText", { flowId })}
            </p>
          ))}
          {projection.reportPath ? (
            <p className="mi-path" title={projection.reportPath}>
              <FileText size={12} strokeWidth={1.5} aria-hidden="true" />
              <code>{projection.reportPath}</code>
            </p>
          ) : null}
          {projection.governancePath ? (
            <p className="mi-path" title={projection.governancePath}>
              <FileText size={12} strokeWidth={1.5} aria-hidden="true" />
              <code>{projection.governancePath}</code>
            </p>
          ) : null}
        </div>
        {body ? (
          <details className="mi-raw">
            <summary>
              <ChevronRight
                className="disclosure-chevron"
                size={12}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              {asString(data.foldLabel) || label}
            </summary>
            {occurrences.length > 0 ? (
              <ul className="mi-occurrences">
                {occurrences.map((occurrence, index) => (
                  <li key={index}>
                    {shortTime(asString(occurrence.at)) ||
                      t("ui.chatRow.timeNotRecorded")}
                    {asString(occurrence.turnId)
                      ? " · " + asString(occurrence.turnId)
                      : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mi-body" dangerouslySetInnerHTML={markdownHtml(body)} />
          </details>
        ) : null}
      </div>
    );
  }
  return (
    <div className={"msg msg-injected is-" + kind + (row.replay ? " is-replay" : "")}>
      <div className="mi-head">
        <span className="mi-chip">{label}</span>
      </div>
      <div className="mi-body" dangerouslySetInnerHTML={markdownHtml(body)} />
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
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
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
  const meta = governanceCardMetaView(request, locale);
  const decisionCard = decisionCardView(request, locale);
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
  const sourceName = roleDisplayName(findRole(roles, asString(payload.roleId)), locale);
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
      ? operatorSubmittingNote(locale)
      : closed
        ? finalNote || t("ui.operator.expired")
        : queued
          ? governanceQueueNote(locale)
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
      aria-label={asString(request.title) || t("ui.work.requestFallback")}
      inert={drawerOpen ? true : undefined}
    >
      {meta.governance || decisionCard.decision || isMirror ? (
        <div className="op-badges">
          {meta.governance ? <span className="op-gov-badge">{meta.badge}</span> : null}
          {decisionCard.notApprovalBadge ? (
            <span className="op-decision-badge">{decisionCard.notApprovalBadge}</span>
          ) : null}
          {isMirror ? (
            <span className="op-mirror-badge">{governanceMirrorBadge(locale)}</span>
          ) : null}
        </div>
      ) : null}
      {isMirror ? (
        <p className="op-mirror-source">
          {governanceMirrorSourceLabel(
            sourceName || asString(payload.roleId),
            locale,
          )}
        </p>
      ) : null}
      {meta.lines.length > 0 ? (
        <div className="op-meta">
          {meta.lines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
        </div>
      ) : null}
      <div className="op-title">
        {decisionCard.title ||
          asString(request.title) ||
          (kind === "choice" ? t("ui.chatRow.choose") : t("ui.chatRow.confirm"))}
      </div>
      {decisionCard.decision && (decisionCard.question || decisionCard.questionNote) ? (
        <>
          {decisionCard.question ? (
            <p className="op-question">{decisionCard.question}</p>
          ) : null}
          {decisionCard.questionNote ? (
            <p className="op-note">{decisionCard.questionNote}</p>
          ) : null}
        </>
      ) : null}
      {lifecycleText ? <div className="op-tool-lifecycle">{lifecycleText}</div> : null}
      {request.detail ? <p className="op-note">{asString(request.detail)}</p> : null}
      {preview ? (
        <details className="op-preview">
          <summary>{t("ui.chatRow.preview")}</summary>
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
            const recommendedBadge = decisionOptionBadge(decisionCard, option);
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
                {recommendedBadge ? (
                  <span className="op-recommended-badge">{recommendedBadge}</span>
                ) : null}
              </label>
            );
          })}
        </div>
      ) : null}
      {judgeNotice ? <div className="op-judge-notice">{judgeNotice}</div> : null}
      {queued ? <p className="op-queued">{governanceQueueNote(locale)}</p> : null}
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
              {t("ui.chatRow.submit")}
            </button>
            <button className="op-cancel" type="button" hidden={closed} disabled={closed || submitting} onClick={() => respond({ kind: "choice", cancelled: true })}>
              {t("shared.common.cancel")}
            </button>
          </>
        ) : (
          <>
            <button className="op-confirm" type="button" hidden={closed} disabled={closed || submitting} onClick={() => respond({ kind: "confirm", confirmed: true })}>
              {t("ui.chatRow.confirmAction")}
            </button>
            <button className="op-deny" type="button" hidden={closed} disabled={closed || submitting} onClick={() => respond({ kind: "confirm", confirmed: false })}>
              {t("ui.chatRow.rejectAction")}
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
  const t = useT();
  const data = asRecord(row.data);
  const outcome = asString(data.outcome);
  const sources = Array.isArray(data.sources)
    ? data.sources
        .map((source) => asString(asRecord(source).text))
        .filter((text) => text !== "")
    : [];
  const lines = sources.length > 0 ? sources : [asString(data.text) || t("ui.chatRow.turnEnded")];
  const primary = lines[0];
  const merged = lines.length > 1;
  return (
    <div
      className={"sys sys-call turn-terminal" + (row.replay ? " is-replay" : "") + (merged ? " is-merged" : "")}
      data-turn-id={asString(data.turnId)}
      data-outcome={outcome}
    >
      <span className="sys-ico">
        {outcome === "completed" ? <Check size={12} strokeWidth={1.5} aria-hidden="true" /> : <CircleAlert size={12} strokeWidth={1.5} aria-hidden="true" />}
      </span>
      <div className="sys-text">
        <span className="tt-primary">{primary}</span>
        {merged ? (
          <>
            <span className="tt-count">×{lines.length}</span>
            <details className="tt-sources">
              <summary>
                <ChevronRight
                  className="disclosure-chevron"
                  size={12}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                {t("ui.chatRow.evidence")}
              </summary>
              <ul>
                {lines.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </details>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ReasoningRow({ row, roleId }: { row: ChatRow; roleId: string }) {
  const locale = useLocaleState((s) => s.locale);
  const data = asRecord(row.data);
  const status = asString(data.status);
  const omitted = status === "omitted";
  // omitted 一律不呈现正文（即便载荷违规带了文本；提取层已强制为空，这里再守一道）。
  const text = omitted ? "" : asString(data.text);
  const hasText = text.trim() !== "";
  const partialOmitted = !omitted && data.partialOmitted === true;
  const note = omitted
    ? reasoningOmittedNote(locale)
    : !hasText
      ? reasoningEmptyNote(locale)
      : partialOmitted
        ? reasoningPartialNote(locale)
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
          {asString(data.label) || reasoningFallbackLabel(locale)}
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
  const t = useT();
  return <ShellJudgeRowCard view={view} t={t} />;
}

function GovernanceJudgeResultBody({
  view,
}: {
  view: import("@/chat/judge").GovernanceJudgeResultView;
}) {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const d = view.details;
  const stats: string[] = [];
  if (d.durationMs !== null) {
    stats.push(t("ui.chatRow.durationStat", { ms: d.durationMs }));
  }
  if (d.readCalls !== null) {
    stats.push(t("ui.chatRow.readCalls", { count: d.readCalls }));
  }
  if (d.readBytes !== null) {
    stats.push(t("ui.chatRow.readBytes", { bytes: d.readBytes }));
  }
  return (
    <>
      <span className="sys-ico judge-auto-ico">
        <Bot size={13} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <div
        className={"sys-text sj-body governance-judge-card is-" + view.kindClass}
        role="group"
        aria-label={view.title}
        data-auto="true"
        data-card-kind={view.cardKind || undefined}
        data-group={view.group}
      >
        <div className="gj-head">
          <span className="gj-auto-badge">
            <Bot size={11} strokeWidth={1.75} aria-hidden="true" />
            {view.title}
          </span>
          <span className="gj-source-chip">{view.sourceLabel}</span>
          {view.flowText ? <span className="gj-flow-chip">{view.flowText}</span> : null}
        </div>
        <div className="gj-headline">{view.headline}</div>
        <div className="sj-meta gj-meta">
          {[view.engineText, view.operatorText, shortTime(view.at)]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {view.lines.map((line, index) => (
          <div className="sj-line" key={index}>
            {line}
          </div>
        ))}
        <p className="gj-note">{view.customerNote}</p>
        <details className="sj-details">
          <summary>
            <ChevronRight
              className="disclosure-chevron"
              size={12}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            {t("ui.chatRow.decisionDetails")}
          </summary>
          <div className="sj-details-body">
            {d.flowId ? (
              <p className="sj-kv">{t("ui.judge.flowText", { flowId: d.flowId })}</p>
            ) : null}
            {d.reason ? (
              <p className="sj-kv">{t("ui.judge.reasonLine", { reason: d.reason })}</p>
            ) : null}
            {d.selected.length > 0 ? (
              <p className="sj-kv">
                {t("ui.judge.selectedLine", {
                  items: d.selected.join(locale === "zh-CN" ? "、" : ", "),
                })}
              </p>
            ) : null}
            {d.paths.length > 0 ? (
              <p className="sj-kv">
                {t("ui.judge.pathsLine", {
                  paths: d.paths.join(locale === "zh-CN" ? "、" : ", "),
                })}
              </p>
            ) : null}
            {d.pathDecisions.length > 0 ? (
              <>
                <p className="sj-d-label">{t("ui.chatRow.perPath")}</p>
                <ul className="sj-evidence">
                  {d.pathDecisions.map((item, index) => (
                    <li key={index}>
                      {t("ui.chatRow.pathResult", {
                        path: item.path,
                        result: item.ok
                          ? t("ui.chatRow.allowed")
                          : t("ui.chatRow.denied"),
                      })}
                      {item.reason ? "（" + item.reason + "）" : ""}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {d.evidence.length > 0 ? (
              <>
                <p className="sj-d-label">{t("ui.chatRow.evidence")}</p>
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
