/**
 * 「重构审计」面板（U1，2026-11-04 trunk-amendment-model）。
 *
 * 客户只读审计（AC-20）：重构由应用调度层机械管理、不产生主干版本、客户不批准；
 * 无批准/拒绝/关闭按钮、无申请表单、不接受渲染侧自报身份。
 * 运营（schedule）只看到「在运营会话中经能力工具提交」的只读指引（F10/F17：
 * D1 不提供 `refactor:request` 渲→主通道）。越界拒绝原文由 D1 返回/账本呈现，U1 不判 scope。
 */

import { useChatStore } from "@/chat/chat-store";
import { findRole } from "@/chat/role-view";
import { refactorGuidanceView, refactorRowView } from "@/chat/version-change-view";
import { useUiStore } from "@/stores/ui-store";
import { useVersionChangeStore } from "@/stores/version-change-store";
import { useLocaleState, useT } from "@/i18n";

export function RefactorPanel() {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const roles = useChatStore((s) => s.roles);
  const selectedRoleId = useUiStore((s) => s.selectedRoleId);
  const refactors = useVersionChangeStore((s) => s.refactors);
  const refactorsError = useVersionChangeStore((s) => s.refactorsError);
  const trunk = useVersionChangeStore((s) => s.trunkState);

  const selectedRole = findRole(roles, selectedRoleId || null);
  const guidance = refactorGuidanceView(
    { governanceFunction: selectedRole?.governanceFunction },
    locale,
  );

  return (
    <div className="vc-panel" data-segment="refactor">
      <p className="vc-guidance" role="note">
        {t("ui.refactor.auditOnly")}
      </p>
      <p className="vc-note">{t("ui.refactor.boundaryHint")}</p>
      {trunk !== null && trunk.disables.refactor !== null ? (
        <p className="vc-banner is-warn" role="status">
          {trunk.disables.refactor}
        </p>
      ) : null}
      {guidance.visible ? <p className="vc-guidance">{guidance.text}</p> : null}

      <section className="vc-section" aria-labelledby="vc-refactor-heading">
        <h3 id="vc-refactor-heading" className="vc-heading">
          {t("ui.refactor.panelTitle")}
        </h3>
        {refactorsError !== "" ? (
          <p className="vc-error" role="alert">
            {refactorsError}
          </p>
        ) : null}
        {refactors !== null && refactors.length === 0 && refactorsError === "" ? (
          <p className="vc-empty">{t("ui.refactor.empty")}</p>
        ) : null}
        {refactors !== null && refactors.length > 0 ? (
          <ul className="vc-list">
            {refactors.map((item) => {
              const row = refactorRowView(item, locale);
              return (
                <li className="vc-list-item" key={row.id}>
                  <div className="vc-row-head">
                    <span className="vc-kind">{row.title}</span>
                    <span className="vc-status">{row.statusLabel}</span>
                  </div>
                  <span className="vc-note vc-mono">{row.id}</span>
                  {row.flowId !== "" ? <span className="vc-note vc-mono">{row.flowId}</span> : null}
                  <span className="vc-line">{row.scopeLine}</span>
                  {row.summaryLine !== "" ? (
                    <span className="vc-line">{row.summaryLine}</span>
                  ) : null}
                  <span className="vc-note vc-mono">{row.at}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
