import { connect } from "./cdp.mjs";

const client = await connect();
try {
  const r = await client.eval(`(() => {
    const rows = [...document.querySelectorAll(".shell-judge-row, .governance-judge-row")];
    const summarize = (row) => {
      const body = row.querySelector(".sj-body") || row.querySelector(".gj-body") || row;
      const title = row.querySelector(".sj-title") || row.querySelector(".gj-head");
      const cmd = row.querySelector(".sj-cmd") || row.querySelector(".gj-command");
      const details = row.querySelector("details.sj-details") || row.querySelector("details");
      const detailText = details ? details.innerText : "";
      const full = body.innerText || "";
      const commandText = cmd ? cmd.innerText.trim() : "";
      const count = (hay, needle) => needle ? hay.split(needle).length - 1 : 0;
      return {
        classes: row.className,
        verdict: row.className.match(/is-(allow|deny)/)?.[1] || null,
        title: title ? title.innerText.replace(/\\n/g, " ").slice(0, 120) : null,
        command: commandText.slice(0, 100),
        commandOccurrencesInBody: count(full, commandText),
        commandOccurrencesInDetails: count(detailText, commandText),
        detailsOpen: details ? details.open : null,
        detailLabels: details ? [...details.querySelectorAll(".sj-d-label")].map((el) => el.innerText.trim()).slice(0, 10) : [],
        detailsSections: details ? details.querySelectorAll(".sj-detail-section").length : 0,
        evidenceItems: details ? [...details.querySelectorAll(".sj-list li")].map((el) => el.innerText.trim()).slice(0, 8) : [],
        hasTierBadge: !!row.querySelector(".sj-tier-badge"),
        hasShieldCheck: !!row.querySelector(".lucide-shield-check"),
        hasShieldX: !!row.querySelector(".lucide-shield-x"),
        visible: !!(row.offsetWidth || row.offsetHeight || row.getClientRects().length),
        rect: (() => { const b = row.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; })(),
      };
    };
    return {
      counts: {
        shellJudgeRows: document.querySelectorAll(".shell-judge-row").length,
        shellJudgeNonGovernance: document.querySelectorAll(".shell-judge-row:not(.governance-judge-row)").length,
        governanceJudgeRows: document.querySelectorAll(".governance-judge-row").length,
        sjBody: document.querySelectorAll(".sj-body").length,
      },
      rows: rows.slice(0, 8).map(summarize),
    };
  })()`);
  console.log(JSON.stringify(r, null, 2));
} finally { client.close(); }
