import { connect } from "./cdp.mjs";

const client = await connect();
try {
  const r = await client.eval(`(() => {
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue || "";
      if (text.includes("judge 代批")) {
        const el = node.parentElement;
        hits.push({
          tag: el.tagName,
          className: el.className,
          parentClass: el.parentElement ? el.parentElement.className : "",
          text: text.trim().slice(0, 160),
          visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
        });
      }
    }
    const summary = document.querySelector(".tool-call-record > summary");
    const sRect = summary ? summary.getBoundingClientRect() : null;
    const records = [...document.querySelectorAll(".tool-call-record")].map((el) => {
      const r = el.getBoundingClientRect();
      const s = el.querySelector("summary");
      return {
        open: el.open,
        height: Math.round(r.height * 10) / 10,
        summaryHeight: s ? Math.round(s.getBoundingClientRect().height * 10) / 10 : null,
        summary: s ? s.innerText.replace(/\\n/g, " | ").slice(0, 140) : null,
      };
    });
    const flowSection = document.querySelector(".flow-status");
    const bgSection = document.querySelector(".background-tasks");
    return {
      judgeTextHits: hits,
      toolSummary: sRect ? { width: Math.round(sRect.width), height: Math.round(sRect.height) } : null,
      records,
      panelsPresent: { flow: !!flowSection, background: !!bgSection },
      drawerButton: (() => {
        const b = document.querySelector("#tab-work");
        return b ? { exists: true, aria: b.getAttribute("aria-label") } : { exists: false };
      })(),
    };
  })()`);
  console.log(JSON.stringify(r, null, 2));
} finally { client.close(); }
