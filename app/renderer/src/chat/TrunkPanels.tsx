/**
 * 「主干与版本变更」面板壳（U1，2026-11-04 trunk-amendment-model）。
 *
 * 单抽屉 tab 三分段：版本变更 / 主干 / 重构。只渲染 D1 冻结载荷与纯视图模型：
 * · 主干分段：当前主干、**F15 三类 stable 快照**（workflow/role-card/boundary）、stable
 *   确认/续接记录（无 drift）、冻结清单、升级历史（D1 未暴露历史 ⇒ 如实空态）、紧急/恢复区。
 * · 「主干升级」只用于紧急/恢复：入口禁用原因取 D1 `disables.trunkUpgrade`；请求返回
 *   preview 后由客户在本段**显式勾选高风险 + 二次确认**（`trunk:upgrade-confirm` 绑定同一
 *   previewId，一次性/过期拒绝）；不自行推断新版本、不显示为「已升级」。
 * · 恢复只显示 D1 状态/说明，不提供本地重建/解冻按钮。
 * · 不轮询；`trunk:state` 单一状态源，面板打开时经 store 拉取只读列表。
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useChatStore } from "@/chat/chat-store";
import {
  TRUNK_SEGMENT_KEYS,
  stableRecordGroupView,
  stableSnapshotRowsView,
  trunkPanelView,
  type TrunkPanelSegment,
} from "@/chat/trunk-view";
import { stableKindLabel } from "@/chat/version-change-view";
import { FrozenDocList, VersionChangePanel } from "@/chat/VersionChangePanel";
import { RefactorPanel } from "@/chat/RefactorPanel";
import { useVersionChangeStore } from "@/stores/version-change-store";
import { useLocaleState, useT } from "@/i18n";

const SEGMENTS: readonly TrunkPanelSegment[] = ["version-change", "trunk", "refactor"];

export function TrunkPanels() {
  const t = useT();
  const segment = useVersionChangeStore((s) => s.segment);
  const setSegment = useVersionChangeStore((s) => s.setSegment);
  const setPanelVisible = useVersionChangeStore((s) => s.setPanelVisible);
  const tabRefs = useRef<Partial<Record<TrunkPanelSegment, HTMLButtonElement | null>>>({});

  useEffect(() => {
    setPanelVisible(true);
    return () => setPanelVisible(false);
  }, [setPanelVisible]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = SEGMENTS.indexOf(segment);
    let next: TrunkPanelSegment | null = null;
    if (event.key === "ArrowRight") next = SEGMENTS[(current + 1) % SEGMENTS.length] ?? null;
    else if (event.key === "ArrowLeft") next = SEGMENTS[(current - 1 + SEGMENTS.length) % SEGMENTS.length] ?? null;
    else if (event.key === "Home") next = SEGMENTS[0] ?? null;
    else if (event.key === "End") next = SEGMENTS[SEGMENTS.length - 1] ?? null;
    if (next === null) return;
    event.preventDefault();
    setSegment(next);
    tabRefs.current[next]?.focus({ preventScroll: true });
  };

  return (
    <div className="trunk-panels">
      <div
        className="vc-segments"
        role="tablist"
        aria-label={t("ui.trunk.panelTitle")}
        onKeyDown={onKeyDown}
      >
        {SEGMENTS.map((id) => (
          <button
            key={id}
            ref={(element) => {
              tabRefs.current[id] = element;
            }}
            type="button"
            role="tab"
            id={`trunk-seg-${id}`}
            className={"vc-segment" + (segment === id ? " is-active" : "")}
            aria-selected={segment === id}
            aria-controls={`trunk-panel-${id}`}
            tabIndex={segment === id ? 0 : -1}
            onClick={() => setSegment(id)}
          >
            {t(TRUNK_SEGMENT_KEYS[id])}
          </button>
        ))}
      </div>
      {SEGMENTS.map((id) => (
        <div
          key={id}
          id={`trunk-panel-${id}`}
          className="vc-panel-body"
          role="tabpanel"
          aria-labelledby={`trunk-seg-${id}`}
          hidden={segment !== id}
        >
          {id === "version-change" ? <VersionChangePanel /> : null}
          {id === "trunk" ? <TrunkSection /> : null}
          {id === "refactor" ? <RefactorPanel /> : null}
        </div>
      ))}
    </div>
  );
}

function TrunkSection() {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const trunk = useVersionChangeStore((s) => s.trunkState);
  const trunkError = useVersionChangeStore((s) => s.trunkStateError);
  const stableWrites = useVersionChangeStore((s) => s.stableWrites);
  const stableWritesError = useVersionChangeStore((s) => s.stableWritesError);

  const panel = trunkPanelView(trunk, locale);
  const snapshots = stableSnapshotRowsView(trunk, locale);
  const records = stableRecordGroupView(stableWrites ?? [], locale);

  return (
    <div className="vc-panel" data-segment="trunk">
      {trunkError !== "" ? (
        <p className="vc-banner is-error" role="alert">
          {trunkError}
        </p>
      ) : null}

      <section className="vc-section" aria-labelledby="trunk-current-heading">
        <h3 id="trunk-current-heading" className="vc-heading">
          {t("ui.trunk.section.current")}
        </h3>
        <p className="vc-version">{panel.versionLine}</p>
        {panel.source !== null ? <p className="vc-note vc-mono">{panel.source}</p> : null}
        {panel.availability !== "" ? <p className="vc-note vc-mono">{panel.availability}</p> : null}
        {panel.issues.length > 0 ? (
          <ul className="vc-list vc-issues" aria-label={t("ui.trunk.section.current")}>
            {panel.issues.map((issue, index) => (
              <li className="vc-list-item" key={`issue-${index}`}>
                <span className="vc-line">{issue}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {panel.pendingReattach.length > 0 ? (
          <ul className="vc-list vc-issues">
            {panel.pendingReattach.map((entry, index) => (
              <li className="vc-list-item" key={`reattach-${index}`}>
                <span className="vc-note vc-mono">{entry}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="vc-section" aria-labelledby="trunk-stable-heading">
        <h3 id="trunk-stable-heading" className="vc-heading">
          {t("ui.trunk.section.stable")}
        </h3>
        {snapshots.length === 0 ? (
          <p className="vc-empty">{t("ui.trunk.stable.empty")}</p>
        ) : (
          <ul className="vc-list">
            {snapshots.map((row) => (
              <li className="vc-list-item" key={row.id}>
                <span className="vc-kind">{row.kindLabel}</span>
                {row.roleId !== "" ? <span className="vc-note vc-mono">{row.roleId}</span> : null}
                <span className="vc-mono vc-wrap">{row.path}</span>
                <span className="vc-mono vc-wrap">{row.sha256}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="vc-section" aria-labelledby="trunk-stable-records-heading">
        <h3 id="trunk-stable-records-heading" className="vc-heading">
          {t("ui.stableWrite.record.section")}
        </h3>
        {records.notes.map((note) => (
          <p className="vc-note" key={note}>
            {note}
          </p>
        ))}
        {stableWritesError !== "" ? (
          <p className="vc-error" role="alert">
            {stableWritesError}
          </p>
        ) : null}
        {stableWrites !== null && records.empty && stableWritesError === "" ? (
          <p className="vc-empty">{t("ui.stableWrite.record.empty")}</p>
        ) : null}
        {records.groups.map((group) => (
          <div className="vc-group" key={group.kind}>
            <p className="vc-note">{group.label}</p>
            <ul className="vc-list">
              {group.rows.map((row) => (
                <li className="vc-list-item" key={row.id}>
                  <span className="vc-mono vc-wrap">{row.line}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <FrozenDocList />

      <section className="vc-section" aria-labelledby="trunk-history-heading">
        <h3 id="trunk-history-heading" className="vc-heading">
          {t("ui.trunk.section.history")}
        </h3>
        <p className="vc-empty">{t("ui.trunk.history.empty")}</p>
      </section>

      <UpgradeSection />
    </div>
  );
}

function UpgradeSection() {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const projectRoot = useChatStore((s) => s.projectRoot);
  const trunk = useVersionChangeStore((s) => s.trunkState);
  const preview = useVersionChangeStore((s) => s.upgradePreview);
  const notice = useVersionChangeStore((s) => s.notice);
  const error = useVersionChangeStore((s) => s.error);
  const requestUpgrade = useVersionChangeStore((s) => s.requestTrunkUpgrade);
  const confirmUpgrade = useVersionChangeStore((s) => s.confirmTrunkUpgrade);
  const dismissPreview = useVersionChangeStore((s) => s.dismissUpgradePreview);
  const clearFeedback = useVersionChangeStore((s) => s.clearFeedback);
  const pendingFocus = useVersionChangeStore((s) => s.pendingFocus);
  const consumePendingFocus = useVersionChangeStore((s) => s.consumePendingFocus);

  const [reasonKind, setReasonKind] = useState<"emergency" | "recovery">("emergency");
  const [reasonText, setReasonText] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const ackRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const disabledReason = trunk?.disables.trunkUpgrade ?? null;
  const disabled = !projectRoot || trunk === null || disabledReason !== null || busy;

  useEffect(() => {
    setAck(false);
    if (preview !== null) {
      requestAnimationFrame(() => ackRef.current?.focus({ preventScroll: true }));
    }
  }, [preview?.previewId]);

  useEffect(() => {
    if (pendingFocus !== "upgrade") return;
    sectionRef.current?.focus({ preventScroll: false });
    consumePendingFocus();
  }, [pendingFocus, consumePendingFocus]);

  const request = async () => {
    if (disabled || reasonText.trim() === "" || projectRoot === null) return;
    setBusy(true);
    clearFeedback();
    await requestUpgrade(projectRoot, reasonKind, reasonText.trim());
    setBusy(false);
  };

  const confirm = async () => {
    if (!preview || !ack || busy || projectRoot === null) return;
    setBusy(true);
    clearFeedback();
    await confirmUpgrade(projectRoot, preview.previewId);
    setBusy(false);
  };

  return (
    <section
      id="trunk-emergency"
      ref={sectionRef}
      tabIndex={-1}
      className="vc-section"
      aria-labelledby="trunk-upgrade-heading"
    >
      <h3 id="trunk-upgrade-heading" className="vc-heading">
        {t("ui.trunk.section.upgrade")}
      </h3>
      <p className="vc-guidance">{t("ui.trunk.emergencyOnly")}</p>
      <p className="vc-note">{t("ui.trunk.upgrade.highRisk")}</p>
      {disabledReason !== null ? (
        <p className="vc-banner is-warn" role="status">
          {disabledReason}
        </p>
      ) : null}
      {trunk === null && disabledReason === null ? (
        <p className="vc-banner is-warn" role="status">
          {t("ui.trunk.upgrade.disabledUnknown", {
            detail: t("shared.common.unknown"),
          })}
        </p>
      ) : null}

      <div className="vc-upgrade-form">
        <div
          className="vc-radio-group"
          role="radiogroup"
          aria-label={t("ui.trunk.section.upgrade")}
        >
          {(["emergency", "recovery"] as const).map((kind) => (
            <label className="vc-radio" key={kind}>
              <input
                type="radio"
                name="trunk-upgrade-reason"
                value={kind}
                checked={reasonKind === kind}
                disabled={disabled || preview !== null}
                onChange={() => setReasonKind(kind)}
              />
              <span className="vc-mono">{kind}</span>
            </label>
          ))}
        </div>
        <label className="vc-field">
          <span>{t("ui.trunk.upgrade.reason")}</span>
          <input
            id="trunk-upgrade-reason"
            type="text"
            value={reasonText}
            disabled={disabled || preview !== null}
            onChange={(event) => setReasonText(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="vc-action"
          aria-label={t("ui.trunk.upgrade.submit")}
          aria-disabled={disabled || reasonText.trim() === "" || preview !== null}
          disabled={disabled || reasonText.trim() === "" || preview !== null}
          onClick={() => void request()}
        >
          {t("ui.trunk.upgrade.submit")}
        </button>
      </div>

      {preview !== null ? (
        <div className="vc-preview" role="group" aria-label={t("ui.trunk.upgrade.success")}>
          <p className="vc-guidance" role="status" aria-live="polite">
            {t("ui.trunk.upgrade.success")}
          </p>
          <p className="vc-line">
            {t("ui.trunk.version", { version: preview.trunkVersion })}
          </p>
          {preview.changes.length > 0 ? (
            <ul className="vc-list">
              {preview.changes.map((change, index) => (
                <li className="vc-list-item" key={`${change.kind}:${change.path}:${index}`}>
                  <span className="vc-kind">{stableKindLabel(change.kind, locale)}</span>
                  {change.roleId !== undefined ? (
                    <span className="vc-note vc-mono">{change.roleId}</span>
                  ) : null}
                  <span className="vc-mono vc-wrap">{change.path}</span>
                  <span className="vc-mono vc-wrap">
                    {change.oldSha} → {change.newSha}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {preview.expiresAt !== "" ? (
            <p className="vc-note vc-mono">{preview.expiresAt}</p>
          ) : null}
          <label className="vc-check">
            <input
              ref={ackRef}
              id="trunk-upgrade-ack"
              type="checkbox"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
            />
            <span>{t("ui.trunk.upgrade.highRisk")}</span>
          </label>
          <div className="vc-row-actions">
            <button
              type="button"
              className="vc-action"
              aria-label={t("ui.decisionDialog.secondConfirm")}
              aria-disabled={!ack || busy}
              disabled={!ack || busy}
              onClick={() => void confirm()}
            >
              {t("ui.decisionDialog.secondConfirm")}
            </button>
            <button
              type="button"
              className="vc-action"
              aria-label={t("shared.common.cancel")}
              disabled={busy}
              onClick={dismissPreview}
            >
              {t("shared.common.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {notice !== "" ? (
        <p className="vc-feedback" role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}
      {error !== "" ? (
        <p className="vc-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
