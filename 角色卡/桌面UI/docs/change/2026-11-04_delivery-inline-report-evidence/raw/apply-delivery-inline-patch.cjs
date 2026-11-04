// 2026-11-04 delivery inline report patch (runs in delivery-inline-report-fix worktree cwd).
// Applies exact-match replacements; fails loudly if any anchor is missing or ambiguous.
const fs = require("node:fs");

let failures = 0;
function patch(file, pairs) {
  let text = fs.readFileSync(file, "utf8");
  for (const [name, oldText, newText] of pairs) {
    const first = text.indexOf(oldText);
    if (first < 0) {
      console.error(`MISS ${file} :: ${name}`);
      failures += 1;
      continue;
    }
    if (text.indexOf(oldText, first + oldText.length) >= 0) {
      console.error(`AMBIGUOUS ${file} :: ${name}`);
      failures += 1;
      continue;
    }
    text = text.slice(0, first) + newText + text.slice(first + oldText.length);
    console.log(`OK ${file} :: ${name}`);
  }
  fs.writeFileSync(file, text);
}

const reportCard = "app/renderer/src/shell/ReportCard.tsx";
patch(reportCard, [
  [
    "prop-inlineFull",
    `  /** 验收展示判定（由 ReportCard/DeliveryCard 统一计算后传入；本组件不二次判定）。 */
  acceptance?: boolean;
}`,
    `  /** 验收展示判定（由 ReportCard/DeliveryCard 统一计算后传入；本组件不二次判定）。 */
  acceptance?: boolean;
  /** 交付行内联全文：默认直接展示报告原文（不再只在折叠里给全文）。 */
  inlineFull?: boolean;
}`,
  ],
  [
    "destructure-inlineFull",
    `  scope,
  acceptance,
}: ReportBodyProps) {`,
    `  scope,
  acceptance,
  inlineFull,
}: ReportBodyProps) {`,
  ],
  [
    "showFull",
    `  const folded = preview.length < Array.from(full).length;
  const isAcceptance = acceptance === true;
  const sourceRoleId = asReportText(source.roleId);`,
    `  const folded = preview.length < Array.from(full).length;
  const isAcceptance = acceptance === true;
  const inline = inlineFull === true;
  const showFull = isAcceptance || inline;
  const sourceRoleId = asReportText(source.roleId);`,
  ],
  [
    "body-full-text",
    `      <div className={"report-body" + (isAcceptance ? " is-acceptance" : "")}>
        <div className="excerpt-label">
          {isAcceptance ? t("ui.reportCard.acceptanceReportLabel") : t("ui.reportCard.excerptLabel")}
        </div>
        <div
          className="hb-summary card-md"
          dangerouslySetInnerHTML={markdownHtml(isAcceptance ? full : preview)}
        />
        <p className="projection-flags">
          {[flags, !isAcceptance && folded ? t("ui.reportCard.folded") : ""]
            .filter(Boolean)
            .join(locale === "zh-CN" ? "；" : "; ")}
        </p>`,
    `      <div className={"report-body" + (isAcceptance ? " is-acceptance" : "")}>
        {isAcceptance || !inline ? (
          <div className="excerpt-label">
            {isAcceptance ? t("ui.reportCard.acceptanceReportLabel") : t("ui.reportCard.excerptLabel")}
          </div>
        ) : null}
        <div
          className="hb-summary card-md"
          dangerouslySetInnerHTML={markdownHtml(showFull ? full : preview)}
        />
        <p className="projection-flags">
          {[flags, !showFull && folded ? t("ui.reportCard.folded") : ""]
            .filter(Boolean)
            .join(locale === "zh-CN" ? "；" : "; ")}
        </p>`,
  ],
  [
    "inline-evidence-fold",
    `        ) : null}
        <dl className="report-facts">`,
    `        ) : null}
        {!isAcceptance && inline ? (
          <details className="report-evidence">
            <summary>{t("ui.reportCard.evidenceCount", { count: evidence.length })}</summary>
            <ul className="hb-evidence">
              {evidence.length === 0 ? (
                <li>{t("ui.reportCard.noEvidence")}</li>
              ) : (
                evidence.map((item, index) => (
                  <li key={index}>
                    {asReportText(item.text)}
                    <small className="projection-flags">{textFlags(item, locale)}</small>
                  </li>
                ))
              )}
            </ul>
          </details>
        ) : null}
        <dl className="report-facts">`,
  ],
  [
    "report-complete-showFull",
    `          {isAcceptance ? null : (
            <details
              className="report-complete"`,
    `          {showFull ? null : (
            <details
              className="report-complete"`,
  ],
  [
    "delivery-remove-leading-title",
    `    <div className={"msg msg-injected msg-delivery" + (replay ? " is-replay" : "")}>
      <p>{deliveryBatchTitle(reports.length, locale)}</p>
      <div className="persistence-state" role="status" aria-live="polite">
        <dl className="report-facts delivery-batch-facts">
          <div>
            <dt>{t("ui.reportCard.receiptHistory")}</dt>
            <dd className="persistence-message" tabIndex={-1}>
              {historyLabel}
            </dd>
          </div>
          <div>
            <dt>{t("ui.reportCard.targetInput")}</dt>
            <dd>{facts.input}</dd>
          </div>
          <div>
            <dt>{t("ui.reportCard.targetTurn")}</dt>
            <dd>{facts.outcome}</dd>
          </div>
        </dl>
        {retry ? (
          <button
            type="button"
            className="btn btn-ghost btn-mini persistence-retry"
            disabled={pending}
            onClick={() => {
              if (scope && attemptId) {
                void useReportStore.getState().retryHistory(scope, attemptId);
              }
            }}
          >
            {retryLabel(true, locale)}
          </button>
        ) : null}
        {effective.history === "failed" || (view.kind === "err" && retry) ? (
          <p className="muted small">{retryNoteText(locale)}</p>
        ) : null}
        {entry?.error ? <p className="persistence-error">{entry.error}</p> : null}
      </div>
      {reports.map((report, index) => {`,
    `    <div className={"msg msg-injected msg-delivery" + (replay ? " is-replay" : "")}>
      {reports.map((report, index) => {`,
  ],
  [
    "delivery-tail-receipt",
    `      })}
      <details className="safe-input-copy">`,
    `      })}
      <details className="delivery-receipt">
        <summary>
          <span>{t("ui.reportCard.receiptHistory")}</span>
          <span className="delivery-receipt-note">{historyLabel}</span>
        </summary>
        <div className="persistence-state" role="status" aria-live="polite">
          <p className="delivery-batch-title">{deliveryBatchTitle(reports.length, locale)}</p>
          <dl className="report-facts delivery-batch-facts">
            <div>
              <dt>{t("ui.reportCard.receiptHistory")}</dt>
              <dd className="persistence-message" tabIndex={-1}>
                {historyLabel}
              </dd>
            </div>
            <div>
              <dt>{t("ui.reportCard.targetInput")}</dt>
              <dd>{facts.input}</dd>
            </div>
            <div>
              <dt>{t("ui.reportCard.targetTurn")}</dt>
              <dd>{facts.outcome}</dd>
            </div>
          </dl>
          {retry ? (
            <button
              type="button"
              className="btn btn-ghost btn-mini persistence-retry"
              disabled={pending}
              onClick={() => {
                if (scope && attemptId) {
                  void useReportStore.getState().retryHistory(scope, attemptId);
                }
              }}
            >
              {retryLabel(true, locale)}
            </button>
          ) : null}
          {effective.history === "failed" || (view.kind === "err" && retry) ? (
            <p className="muted small">{retryNoteText(locale)}</p>
          ) : null}
          {entry?.error ? <p className="persistence-error">{entry.error}</p> : null}
        </div>
      </details>
      <details className="safe-input-copy">`,
  ],
  [
    "delivery-inlineFull-prop",
    `              includeSave={false}
              scope={scope || undefined}
              acceptance={acceptance}
            />`,
    `              includeSave={false}
              scope={scope || undefined}
              acceptance={acceptance}
              inlineFull
            />`,
  ],
]);

const css = "app/renderer/src/shell/phase4b.css";
patch(css, [
  [
    "hb-wrap-report-evidence",
    `.report-complete-body,
.hb-complete-summary,
.hb-summary,
.hb-evidence,
.hb-evidence li {`,
    `.report-complete-body,
.hb-complete-summary,
.hb-summary,
.hb-evidence,
.hb-evidence li,
.report-evidence {`,
  ],
  [
    "msg-delivery-leading-title-rules",
    `.msg-delivery > p {
  margin: 0;
  color: var(--foreground);
  font-size: 12.5px;
  font-weight: 600;
}
.msg-delivery > .persistence-state {
  padding: 0;
}`,
    `/* 交付回执（批次数量/接收历史/目标输入/目标轮次/重试）收进卡片尾部默认折叠区；
   正文是直接阅读面，回执降为附注。 */
.delivery-receipt {
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--card);
}
.delivery-receipt > summary {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 32px;
  padding: 6px 10px;
  color: var(--text-2);
  font-size: 11.5px;
  cursor: pointer;
}
.delivery-receipt-note {
  margin-left: auto;
  color: var(--text-3);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.delivery-receipt > .persistence-state {
  padding: 0 10px 10px;
}
.delivery-batch-title {
  margin: 0;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 400;
}`,
  ],
  [
    "report-evidence-style",
    `.acceptance-evidence {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}`,
    `.acceptance-evidence {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
/* 交付行普通报告：正文内联后，证据保留为只含证据的小折叠（summary 用既有计数文案）。 */
.report-evidence {
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--card);
}
.report-evidence > summary {
  min-height: 32px;
  padding: 6px 10px;
  color: var(--text-2);
  font-size: 11.5px;
  cursor: pointer;
}
.report-evidence .hb-evidence {
  margin: 0;
  padding: 0 10px 8px 26px;
}`,
  ],
]);

const smoke = "test/桌面UI/phase4b-electron-smoke.mjs";
patch(smoke, [
  [
    "smoke-received-long-text",
    `    // —————— 9. 交付批次事实 / 安全副本 / 历史重试 / 过期 ——————
    const received = {
      ...snapshot,
      reportId: "smoke-received",
      source: { roleId: "P", runtime: "pi", turnId: "received-turn" },
      summary: { text: "收到的安全摘要", redacted: false, truncated: false },
    };`,
    `    // —————— 9. 交付批次事实 / 安全副本 / 历史重试 / 过期 ——————
    const receivedFull = "DELIVERY-INLINE-PREFIX-MARKER " + "交付内联正文。".repeat(40) + "\\nDELIVERY-INLINE-TAIL-MARKER";
    const received = {
      ...snapshot,
      reportId: "smoke-received",
      source: { roleId: "P", runtime: "pi", turnId: "received-turn" },
      summary: { text: receivedFull, redacted: false, truncated: false },
    };`,
  ],
  [
    "smoke-delivery-check",
    `    check(
      "delivery batch shows receipt facts and safe copy flags",
      await js(\`(()=>{const c=document.querySelector('.msg-delivery');if(!c)return false;const p=c.querySelector(':scope > .persistence-state');return c.textContent.includes('交付 · 本批 1 份（不表示全部收齐）')&&p.querySelectorAll('.delivery-batch-facts dt').length===3&&p.textContent.includes('接收历史')&&p.textContent.includes('目标输入记录')&&p.textContent.includes('目标轮次结果')&&c.querySelector('.safe-input-copy').textContent.includes('此处未记录完整模型输入')&&c.querySelector('.safe-input-copy').textContent.includes('已净化')&&c.querySelector('.safe-input-copy').textContent.includes('显示副本已截断')&&!c.querySelector('.safe-input-copy').open;})()\`),
    );`,
    `    check(
      "delivery shows inline full report by default with demoted receipt facts and safe copy flags",
      await js(\`(()=>{const c=document.querySelector('.msg-delivery');if(!c)return false;const receipt=c.querySelector('.delivery-receipt');const p=receipt&&receipt.querySelector('.persistence-state');const body=c.querySelector('.delivery-report .hb-summary');const evidence=c.querySelector('.delivery-report .report-evidence');return !!receipt&&!receipt.open&&!c.querySelector(':scope > p')&&receipt.querySelector('.delivery-batch-title').textContent==='交付 · 本批 1 份（不表示全部收齐）'&&receipt.querySelector('summary').textContent.includes('接收历史')&&!!receipt.querySelector('.persistence-state[role="status"][aria-live="polite"]')&&p.querySelectorAll('.delivery-batch-facts dt').length===3&&p.textContent.includes('接收历史')&&p.textContent.includes('目标输入记录')&&p.textContent.includes('目标轮次结果')&&!!body&&body.textContent.includes('DELIVERY-INLINE-PREFIX-MARKER')&&body.textContent.includes('DELIVERY-INLINE-TAIL-MARKER')&&!c.querySelector('.delivery-report .report-complete')&&!c.querySelector('.delivery-report .excerpt-label')&&!!evidence&&evidence.textContent.includes('证据（1 条）')&&c.querySelector('.safe-input-copy').textContent.includes('此处未记录完整模型输入')&&c.querySelector('.safe-input-copy').textContent.includes('已净化')&&c.querySelector('.safe-input-copy').textContent.includes('显示副本已截断')&&!c.querySelector('.safe-input-copy').open;})()\`),
    );`,
  ],
  [
    "smoke-open-receipt-before-retry",
    `    await js(\`window.__smokeDelivery=document.querySelector('.msg-delivery');document.querySelector('.msg-delivery .persistence-retry').click()\`);`,
    `    await js(\`window.__smokeDelivery=document.querySelector('.msg-delivery');document.querySelector('.msg-delivery .delivery-receipt').open=true;document.querySelector('.msg-delivery .persistence-retry').click()\`);`,
  ],
  [
    "smoke-a5-delivery-inline",
    `    check("A5 delivery: acceptance sections + ordinary class unchanged (P1-ARC-02)", await js(\`(()=>{`,
    `    check("A5 delivery: acceptance sections + ordinary inline full text (P1-ARC-02)", await js(\`(()=>{`,
  ],
  [
    "smoke-a5-ordinary-inline",
    `        ordinary.querySelector('.report-title').textContent==='任务报告'&&
        !ordinary.querySelector('.report-acceptance-badge')&&
        ordinary.querySelector('.report-complete')!==null&&`,
    `        ordinary.querySelector('.report-title').textContent==='任务报告'&&
        !ordinary.querySelector('.report-acceptance-badge')&&
        ordinary.querySelector('.hb-summary').textContent.includes('A5-ORDINARY-TAIL-MARKER')&&
        ordinary.querySelector('.report-complete')===null&&
        ordinary.querySelector('.report-evidence')!==null&&`,
  ],
]);

const guard = "test/桌面UI/source-guard.test.ts";
patch(guard, [
  [
    "source-guard-report-card",
    `test("验收报告卡：全文只经 Markdown 管线；普通分支保留 report-complete 折叠", () => {
  const card = read(join(RENDERER, "shell", "ReportCard.tsx"));
  assert.match(card, /markdownHtml\\(isAcceptance \\? full : preview\\)/);
  assert.match(card, /isAcceptance \\? null : \\(/);
  assert.match(card, /!isAcceptance && folded \\? t\\("ui\\.reportCard\\.folded"\\)/);
  assert.match(card, /className="report-complete"/);
  assert.match(card, /ui\\.reportCard\\.acceptanceTitle/);
  assert.match(card, /ui\\.reportCard\\.acceptanceBadge/);
  assert.match(card, /className="acceptance-evidence"/);
  assert.match(card, /ui\\.reportCard\\.evidenceCount/);
});`,
    `test("报告卡：全文只经 Markdown 管线；交付行内联全文，普通 handback 保留 preview+report-complete", () => {
  const card = read(join(RENDERER, "shell", "ReportCard.tsx"));
  // 交付行（inlineFull）与验收报告直接展示 full；普通 handback（不传 inlineFull）仍是 preview。
  assert.match(card, /const inline = inlineFull === true;/);
  assert.match(card, /const showFull = isAcceptance \\|\\| inline;/);
  assert.match(card, /markdownHtml\\(showFull \\? full : preview\\)/);
  assert.match(card, /!showFull && folded \\? t\\("ui\\.reportCard\\.folded"\\)/);
  // 只有 DeliveryCard 的 ReportBody 使用 inlineFull；handback 的 ReportCard 不使用。
  assert.equal((card.match(/inlineFull\\s*\\n\\s*\\/>/g) || []).length, 1);
  assert.match(card, /className="report-complete"/);
  // report-complete 只在非全文（普通 handback）分支渲染。
  assert.match(card, /showFull \\? null : \\(/);
  assert.match(card, /ui\\.reportCard\\.acceptanceTitle/);
  assert.match(card, /ui\\.reportCard\\.acceptanceBadge/);
  assert.match(card, /className="acceptance-evidence"/);
  assert.match(card, /ui\\.reportCard\\.evidenceCount/);
  assert.match(card, /className="report-evidence"/);
});`,
  ],
]);

if (failures > 0) {
  console.error(`PATCH_FAILED ${failures}`);
  process.exit(1);
}
console.log("PATCH_OK");
