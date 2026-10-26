import { connect, reload } from "./cdp.mjs";

const client = await connect();
try {
  const info = await client.eval(`(() => {
    const q = (s) => document.querySelector(s);
    const qa = (s) => [...document.querySelectorAll(s)];
    const style = (el, props) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
    };
    const active = q(".tree-item.active");
    const working = q(".tree-item[data-status='working']");
    const workingAvatar = q(".ti-avatar.is-working");
    const workingChip = q(".role-status-chip.is-working");
    const failed = q(".tool-call-record[data-failed='true']");
    const judge = q(".shell-judge-row");
    return {
      title: document.title,
      visibility: document.visibilityState,
      size: { w: innerWidth, h: innerHeight },
      counts: {
        treeItems: qa(".tree-item").length,
        treeActive: qa(".tree-item.active").length,
        workingRows: qa(".tree-item.is-working").length,
        awaitingRows: qa(".tree-item.is-awaiting").length,
        workingAvatars: qa(".ti-avatar.is-working").length,
        workingChips: qa(".role-status-chip.is-working").length,
        chatWorkingChips: qa(".chat-role-working").length,
        judgeCards: qa(".governance-judge-card").length,
        shellJudgeRows: qa(".shell-judge-row").length,
        toolCallRecords: qa(".tool-call-record").length,
        failedToolRecords: qa(".tool-call-record[data-failed='true']").length,
        toolErrorSummaries: qa(".tool-error-summary").length,
        toolErrorFull: qa(".tool-error-full").length,
        toolDetailsStructured: qa(".tool-details-structured").length,
        backgroundSections: qa(".background-tasks").length,
        flowSections: qa(".flow-status").length,
        flowBadges: qa(".tab-badge.is-flow").length,
        backgroundBadges: qa(".tab-badge.is-background").length,
        drawerOpen: !!q(".app.drawer-open"),
      },
      activeRowStyle: style(active, ["box-shadow", "background-color"]),
      workingRowStyle: style(working, ["box-shadow", "background-color"]),
      workingAvatarStyle: style(workingAvatar, ["border-color", "box-shadow", "animation-name"]),
      workingChipStyle: style(workingChip, ["color", "background-color", "border-color", "font-size"]),
      failedSummary: failed ? {
        html: failed.innerHTML.slice(0, 900),
        summaryHeight: failed.querySelector("summary")?.getBoundingClientRect().height,
        summaryWhiteSpace: failed.querySelector("summary") ? getComputedStyle(failed.querySelector("summary")).whiteSpace : null,
      } : null,
      judgeHtml: judge ? judge.innerHTML.slice(0, 1600) : null,
      bodyText: document.body.innerText.slice(0, 1200),
    };
  })()`);
  console.log(JSON.stringify(info, null, 2));
  await client.screenshot(
    "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/角色卡/独立验收/docs/change/2026-10-25_app-ui-background-flow-evidence/00_initial.png",
  );
} finally {
  client.close();
}
