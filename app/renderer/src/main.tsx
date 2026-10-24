import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { translate, useLocaleStore } from "./i18n/index.ts";
import "./index.css";
import "./shell/shell.css";

const host = document.getElementById("root");
if (!host) {
  throw new Error(translate(useLocaleStore.getState().locale, "ui.app.missingRoot"));
}

// 诊断守卫（只读）：记录 CSP 违规，供 Phase 2 的 file:///CSP 门禁核验。
// 不改变页面行为；违规会同时出现在控制台。
declare global {
  interface Window {
    __ansCspViolations?: Array<{
      directive: string;
      blockedURI: string;
      sourceFile: string;
      line: number;
      column: number;
      sample: string;
    }>;
  }
}
window.addEventListener("securitypolicyviolation", (event) => {
  const list = (window.__ansCspViolations ??= []);
  list.push({
    directive: event.violatedDirective,
    blockedURI: event.blockedURI,
    sourceFile: event.sourceFile,
    line: event.lineNumber,
    column: event.columnNumber,
    sample: event.sample,
  });
});

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
