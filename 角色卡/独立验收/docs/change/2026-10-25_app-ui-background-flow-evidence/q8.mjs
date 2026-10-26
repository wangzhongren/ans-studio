import { connect } from "./cdp.mjs";

const client = await connect();
try {
  const r = await client.eval(`(() => {
    const q = (s) => document.querySelector(s);
    const text = (el) => el ? el.innerText.trim() : null;
    const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const contextState = q("#context-state");
    const projectionNote = q("#history-projection-note");
    const meta = q(".msg-meta");
    const trust = q(".composer-trust");
    const gov = q("#governance-status");
    return {
      contextState: { exists: !!contextState, text: text(contextState), role: contextState?.getAttribute("role"), live: contextState?.getAttribute("aria-live") },
      projectionNote: { exists: !!projectionNote, text: text(projectionNote), role: projectionNote?.getAttribute("role"), hidden: projectionNote ? projectionNote.hidden : null },
      duplicated: !!(contextState && projectionNote && text(contextState) && text(projectionNote) && text(contextState) === text(projectionNote)),
      assistantMeta: meta ? { text: text(meta), html: meta.innerHTML.slice(0, 300) } : null,
      composerTrust: trust ? { role: trust.getAttribute("role"), aria: trust.getAttribute("aria-label"), text: text(trust) } : null,
      governanceStatus: gov ? { text: text(gov).slice(0, 200), chip: !!gov.querySelector(".gov-chip") } : null,
      emptyWork: q(".work-empty-overview") ? text(q(".work-empty-overview")) : null,
      workButtonBadges: [...document.querySelectorAll("#tab-work .tab-badge")].map((el) => el.className + ":" + el.innerText),
    };
  })()`);
  console.log(JSON.stringify(r, null, 2));
} finally { client.close(); }
