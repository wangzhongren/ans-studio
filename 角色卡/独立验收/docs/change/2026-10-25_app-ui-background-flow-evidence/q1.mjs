import { connect } from "./cdp.mjs";

const client = await connect();
try {
  const r = await client.eval(`(() => {
    const text = document.body.innerText;
    const cssRules = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules) {
        if (rule.selectorText && (
          rule.selectorText.includes(".tool-call-target") ||
          rule.selectorText.includes(".tool-call-status") ||
          rule.selectorText.includes(".tool-error-summary") ||
          rule.selectorText.includes(".tree-item.is-working") ||
          rule.selectorText.includes(".ti-avatar.is-working") ||
          rule.selectorText.includes(".role-status-chip") ||
          rule.selectorText.includes(".capsule:focus-within") ||
          rule.selectorText.includes(".sj-")
        )) cssRules.push(rule.cssText.slice(0, 600));
      }
    }
    const toolSummary = document.querySelector(".tool-call-record > summary");
    const target = document.querySelector(".tool-call-record .tool-call-target");
    const status = document.querySelector(".tool-call-record .tool-call-status");
    const rect = (el) => el ? el.getBoundingClientRect() : null;
    const cs = (el, props) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return Object.fromEntries(props.map(p => [p, s.getPropertyValue(p)]));
    };
    return {
      mentionsJudge: /judge|代批|放行|未放行/.test(text),
      judgeSnippet: (text.match(/.{0,80}(judge|代批|放行|未放行).{0,120}/) || [null])[0],
      toolSummaryRect: rect(toolSummary),
      toolTarget: target ? { text: target.textContent.slice(0,120), style: cs(target, ["white-space","overflow","text-overflow","max-width","display"]) } : null,
      toolStatus: status ? { text: status.textContent, style: cs(status, ["white-space","flex-wrap"]) } : null,
      cssRules,
    };
  })()`);
  console.log(JSON.stringify(r, null, 2));
} finally { client.close(); }
