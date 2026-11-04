/**
 * 「版本变更」面板（U1，2026-11-04 trunk-amendment-model）。
 *
 * 只读展示 D1 冻结载荷：待批/历史 VCA、冻结清单、产品/策划**只读提交指引**（F10：
 * 提交只经发起角色能力工具，无表单/无渲→主提交 IPC）。批准/拒绝只在决策卡完成；
 * 面板只提供「在决策面板处理」跳转与 `submitted` 的重发卡（D1 幂等）。
 *
 * 无 drift 区；不本地统计、不重算哈希、不判定冻结/许可。
 */

import { useChatStore } from "@/chat/chat-store";
import { findRole, roleDisplayName } from "@/chat/role-view";
import {
  freezeDocRowView,
  freezeHealthNotice,
  vcaSectionViews,
  vcaSubmitGuidanceView,
  type CacheHealth,
  type PresentReceiptView,
  type VcaRowView,
} from "@/chat/version-change-view";
import { useDrawerStore } from "@/stores/drawer-store";
import { useUiStore } from "@/stores/ui-store";
import { useVersionChangeStore } from "@/stores/version-change-store";
import { useLocaleState, useT } from "@/i18n";

function VcaRow({
  row,
  feedback,
  actionsDisabled,
  onPresent,
}: {
  row: VcaRowView;
  feedback: PresentReceiptView | undefined;
  actionsDisabled: boolean;
  onPresent: (applicationId: string) => void;
}) {
  const t = useT();
  return (
    <article className="vc-row" data-application-id={row.id}>
      <div className="vc-row-head">
        <span className="vc-kind">{row.kindLabel}</span>
        <span className="vc-status">{row.statusLabel}</span>
      </div>
      <p className="vc-line">{row.initiatorLine}</p>
      <p className="vc-line">{row.flowLine}</p>
      {row.targetLines.map((line) => (
        <p className="vc-line vc-mono" key={line}>
          {line}
        </p>
      ))}
      {row.moreLine !== null ? <p className="vc-note">{row.moreLine}</p> : null}
      {row.summaryLine !== "" ? <p className="vc-line">{row.summaryLine}</p> : null}
      {row.semantics !== "" ? <p className="vc-note">{row.semantics}</p> : null}
      {row.decisionLine !== null ? <p className="vc-note">{row.decisionLine}</p> : null}
      {row.resultTrunkLine !== null ? <p className="vc-note">{row.resultTrunkLine}</p> : null}
      {row.canOpenCard || row.canPresent ? (
        <div className="vc-row-actions">
          {row.canOpenCard ? (
            <button
              type="button"
              className="vc-action"
              aria-label={t("ui.versionChange.openCard")}
              onClick={() => useDrawerStore.getState().openTab("decisions")}
            >
              {t("ui.versionChange.openCard")}
            </button>
          ) : null}
          {row.canPresent ? (
            <button
              type="button"
              className="vc-action"
              aria-label={t("ui.versionChange.presentAction")}
              aria-disabled={actionsDisabled}
              disabled={actionsDisabled}
              onClick={() => onPresent(row.id)}
            >
              {t("ui.versionChange.presentAction")}
            </button>
          ) : null}
        </div>
      ) : null}
      {feedback !== undefined ? (
        <p
          className={"vc-feedback" + (feedback.kind === "error" ? " is-error" : "")}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.text}
        </p>
      ) : null}
    </article>
  );
}

/** 冻结清单（版本变更分段与主干分段共用同一实现，避免第二套视图）。 */
export function FrozenDocList({ heading = true }: { heading?: boolean }) {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const freezes = useVersionChangeStore((s) => s.freezes);
  const freezesError = useVersionChangeStore((s) => s.freezesError);
  const freezeHealth = useVersionChangeStore((s) => s.freezeHealth);
  const trunk = useVersionChangeStore((s) => s.trunkState);
  const health: CacheHealth | null = freezeHealth ?? trunk?.freezes.cacheHealth ?? null;
  const healthNotice = freezeHealthNotice(health, locale);
  return (
    <section className="vc-section" aria-labelledby="vc-frozen-heading">
      {heading ? (
        <h3 id="vc-frozen-heading" className="vc-heading">
          {t("ui.versionChange.tabFrozen")}
        </h3>
      ) : null}
      {healthNotice !== "" ? (
        <p className="vc-banner is-warn" role="status">
          {healthNotice}
        </p>
      ) : null}
      {freezesError !== "" ? (
        <p className="vc-error" role="alert">
          {freezesError}
        </p>
      ) : null}
      {freezes !== null && freezes.length === 0 && freezesError === "" ? (
        <p className="vc-empty">{t("ui.freeze.empty")}</p>
      ) : null}
      {freezes !== null && freezes.length > 0 ? (
        <ul className="vc-list">
          {freezes.map((doc) => {
            const row = freezeDocRowView(doc, locale);
            return (
              <li className="vc-list-item" key={row.id}>
                <span className="vc-status">{row.statusLabel}</span>
                <span className="vc-mono vc-wrap">{row.line}</span>
                {row.migrationLabel !== "" ? (
                  <span className="vc-note">{row.migrationLabel}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export function VersionChangePanel() {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const roles = useChatStore((s) => s.roles);
  const projectRoot = useChatStore((s) => s.projectRoot);
  const selectedRoleId = useUiStore((s) => s.selectedRoleId);
  const trunk = useVersionChangeStore((s) => s.trunkState);
  const trunkError = useVersionChangeStore((s) => s.trunkStateError);
  const versionChanges = useVersionChangeStore((s) => s.versionChanges);
  const versionChangesError = useVersionChangeStore((s) => s.versionChangesError);
  const loading = useVersionChangeStore((s) => s.loading);
  const presentFeedback = useVersionChangeStore((s) => s.presentFeedback);
  const presentVersionChange = useVersionChangeStore((s) => s.presentVersionChange);

  const selectedRole = findRole(roles, selectedRoleId || null);
  const guidance = vcaSubmitGuidanceView(
    { governanceFunction: selectedRole?.governanceFunction },
    locale,
  );
  const sections = vcaSectionViews(versionChanges ?? [], locale, (roleId) => {
    const role = findRole(roles, roleId);
    return role ? roleDisplayName(role, locale) : roleId;
  });
  const actionsDisabled =
    !projectRoot || trunk === null || trunk.disables.versionChange !== null;

  return (
    <div className="vc-panel" data-segment="version-change">
      {trunkError !== "" ? (
        <p className="vc-banner is-error" role="alert">
          {trunkError}
        </p>
      ) : null}
      {trunk !== null && trunk.disables.versionChange !== null ? (
        <p className="vc-banner is-warn" role="status">
          {trunk.disables.versionChange}
        </p>
      ) : null}

      <section className="vc-section" aria-labelledby="vc-pending-heading">
        <h3 id="vc-pending-heading" className="vc-heading">
          {t("ui.versionChange.tabPending")}
        </h3>
        {loading && versionChanges === null ? (
          <p className="vc-empty">{t("ui.versionChange.loading")}</p>
        ) : null}
        {versionChangesError !== "" ? (
          <p className="vc-error" role="alert">
            {versionChangesError}
          </p>
        ) : null}
        {versionChanges !== null && sections.pending.length === 0 && versionChangesError === "" ? (
          <p className="vc-empty">{t("ui.versionChange.empty")}</p>
        ) : null}
        {sections.pending.map((row) => (
          <VcaRow
            key={row.id}
            row={row}
            feedback={presentFeedback[row.id]}
            actionsDisabled={actionsDisabled}
            onPresent={(applicationId) => {
              if (!projectRoot) return;
              void presentVersionChange(projectRoot, applicationId);
            }}
          />
        ))}
      </section>

      <section className="vc-section" aria-labelledby="vc-history-heading">
        <h3 id="vc-history-heading" className="vc-heading">
          {t("ui.versionChange.tabHistory")}
        </h3>
        {versionChanges !== null && sections.history.length === 0 && versionChangesError === "" ? (
          <p className="vc-empty">{t("ui.versionChange.empty")}</p>
        ) : null}
        {sections.history.map((row) => (
          <VcaRow
            key={row.id}
            row={row}
            feedback={presentFeedback[row.id]}
            actionsDisabled={actionsDisabled}
            onPresent={(applicationId) => {
              if (!projectRoot) return;
              void presentVersionChange(projectRoot, applicationId);
            }}
          />
        ))}
      </section>

      <FrozenDocList />

      {guidance.visible ? (
        <section className="vc-section" aria-labelledby="vc-guidance-heading">
          <h3 id="vc-guidance-heading" className="vc-heading">
            {t("ui.versionChange.entry")}
          </h3>
          <p className="vc-guidance">{guidance.text}</p>
        </section>
      ) : null}
    </div>
  );
}
