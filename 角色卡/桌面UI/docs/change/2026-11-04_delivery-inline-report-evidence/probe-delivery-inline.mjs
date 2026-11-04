#!/usr/bin/env node
/**
 * 2026-11-04 交付行默认内联正文——前后对比探针（真实 Electron 离线渲染）。
 *
 * 用法（仓库根）：
 *   ./node_modules/.bin/electron "角色卡/桌面UI/docs/change/2026-11-04_delivery-inline-report-evidence/probe-delivery-inline.mjs" before|after <outDir>
 *
 * 场景：一条 delivery 行，含一份 >180 字的普通报告（prefix/tail 标记）与一条证据。
 * before 断言：批次标题是卡首 <p>；正文为预览（无 tail）；全文只在 .report-complete 折叠里。
 * after  断言：无卡首批次标题；正文默认含 tail（无点击）；无 .report-complete；
 *              批次标题/三列回执事实/重试/aria-live/安全副本/证据折叠仍在。
 * 只读使用既有 test/桌面UI/phase4b-smoke-preload.cjs（不改动该文件）。
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");
const PHASE = process.argv[2] === "after" ? "after" : "before";
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : path.join(HERE, PHASE);
const ENTRY = path.join(REPO, "app/renderer/dist/index.html");
const PRELOAD = path.join(REPO, "test/桌面UI/phase4b-smoke-preload.cjs");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const ROOT = "/probe-delivery-project";
const report = { phase: PHASE, entry: ENTRY, checks: [], console: [], failures: 0, screenshots: [] };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail === undefined ? null : detail });
  if (value !== true) report.failures += 1;
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
  return value === true;
}

function listing() {
  return {
    projectRoot: ROOT,
    primaryRoleId: "P",
    hasRoles: true,
    warnings: [],
    governanceModel: "trio",
    governanceRecord: { state: "present" },
    roles: [
      {
        roleId: "P",
        cardText: "# P",
        cardPath: ROOT + "/角色卡/P/role-card.md",
        boundary: { entries: [] },
        boundaryPath: "",
        builtIn: false,
        changelog: null,
        docs: [],
      },
    ],
  };
}

ipcMain.handle("app:recovery-state", () => ({}));
ipcMain.handle("app:recovery-ready", () => ({ ok: true }));
ipcMain.handle("app:list-project", () => listing());
ipcMain.handle("session:open", (_e, input) => ({
  ok: true,
  resumed: true,
  contextSource: "resumed",
  runtime: input.runtime,
  projectRoot: input.projectRoot,
}));
ipcMain.handle("session:history-get", (_e, input) => ({
  projectRoot: input.projectRoot,
  roleId: input.roleId,
  runtime: input.runtime,
  rows: [],
  error: null,
  skipped: 0,
}));
ipcMain.handle("session:live-views", () => []);
ipcMain.handle("session:stop", () => ({ ok: true }));
ipcMain.handle("session:abort", (_e, input) => ({ ok: true, supported: true, ...input }));
ipcMain.handle("session:send", () => ({ ok: true }));
ipcMain.handle("shell:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("decision:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("runtime-config:get", (_e, input) => ({
  runtime: input.runtime,
  label: input.runtime,
  path: ROOT + "/.env",
  revision: 0,
  application: "next-session",
  missingKeys: [],
  fields: [],
}));

const outer = (input, value) => ({
  ok: true,
  version: 1,
  scope: { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime },
  value,
});
ipcMain.handle("session:get-persistence", (_e, input) =>
  outer(input, {
    mode: "enabled",
    reportSaveSupported: true,
    deliveryHistorySaveSupported: true,
    querySupported: true,
  }),
);
ipcMain.handle("report:get-save-state", (_e, input) =>
  outer(input, { state: "saved", reportId: input.reportId, retryAvailable: false }),
);
ipcMain.handle("delivery:get-receipt", (_e, input) =>
  outer(input, {
    state: "known",
    receipt: {
      version: 1,
      deliveryId: "probe-d1",
      attemptId: "probe-a1",
      turnId: "probe-delivery-turn",
      inputSaved: true,
      history: "failed",
      outcome: "completed",
      retryHistoryAvailable: true,
    },
  }),
);

const reportText =
  "PROBE-DELIVERY-PREFIX-MARKER " +
  "交付报告正文段落，客户应无需展开即可阅读。".repeat(24) +
  "\nPROBE-DELIVERY-TAIL-MARKER";
const probeReport = {
  version: 1,
  reportId: "probe-report-1",
  source: { roleId: "P", runtime: "pi", turnId: "probe-report-turn" },
  taskId: null,
  origin: "submitted-report",
  status: "completed",
  summary: { text: reportText, redacted: true, truncated: true },
  evidence: [{ text: "PROBE-EVIDENCE-MARKER", redacted: false, truncated: true }],
  evidenceOmitted: 0,
  at: "2026-11-04T00:00:00Z",
};
const deliveryInput = {
  source: "prompt-input",
  text: "PROBE-SAFE-COPY-MARKER [REDACTED]",
  inputProvenance: {
    version: 1,
    kind: "handback",
    deliveryId: "probe-d1",
    attemptId: "probe-a1",
    target: { roleId: "P", runtime: "pi" },
    reports: [probeReport],
  },
  inputTextProjection: {
    version: 1,
    source: "trusted-handback-display",
    modelInputRecorded: false,
    redacted: true,
    truncated: true,
    summaryTruncated: true,
  },
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    useContentSize: true,
    show: false,
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: PRELOAD,
      backgroundThrottling: false,
    },
  });
  const wc = win.webContents;
  wc.on("console-message", (...args) => {
    const event = args[0];
    const level = event && typeof event === "object" && "level" in event ? event.level : args[1];
    const message = event && typeof event === "object" && "message" in event ? event.message : args[2];
    report.console.push({ level, message });
  });

  const js = (code) =>
    wc.executeJavaScript(code.includes("await ") ? `(async()=>{${code}})()` : code, true);
  async function waitFor(expr, timeout = 8000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      last = await js(expr).catch((error) => String(error));
      if (last) return last;
      await sleep(60);
    }
    return last;
  }
  const shot = async (name) => {
    const file = path.join(OUT, name + ".png");
    // show:false 窗口的首张 capturePage 常返回重绘前旧帧（空壳/旧滚动位置）：
    // 先请求完整重绘，等两个渲染帧后丢弃一张预热帧，再取真实帧。
    wc.invalidate();
    await js("new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))").catch(() => undefined);
    await sleep(180);
    await wc.capturePage();
    await sleep(120);
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    report.screenshots.push(path.basename(file));
  };

  try {
    await win.loadFile(ENTRY);
    await sleep(400);
    await waitFor(`!!document.querySelector('#root > .app-shell')`);
    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);
    await sleep(160);
    await js(`await window.__ansRenderer.selectRole("P")`);
    await sleep(140);
    await js(`await window.__ansRenderer.selectRuntime("pi")`);
    await sleep(160);

    await js(
      `window.desktop.__smoke.emit("session:events", ${JSON.stringify([
        {
          projectRoot: ROOT,
          roleId: "P",
          runtime: "pi",
          event: {
            kind: "message",
            turnId: "probe-delivery-turn",
            summary: "探针交付",
            detail: deliveryInput,
          },
        },
      ])})`,
    );
    await waitFor(
      `[...document.querySelectorAll('#chat .msg-delivery')].some(x=>x.textContent.includes('PROBE-DELIVERY-PREFIX-MARKER'))`,
    );
    await sleep(200);

    const facts = await js(`(()=>{
      const c=[...document.querySelectorAll('#chat .msg-delivery')].find(x=>x.textContent.includes('PROBE-DELIVERY-PREFIX-MARKER'));
      if(!c) return null;
      const receipt=c.querySelector('.delivery-receipt');
      const topP=c.querySelector(':scope > p');
      const summary=c.querySelector('.delivery-report .hb-summary');
      const complete=c.querySelector('.delivery-report .report-complete');
      const completeBody=c.querySelector('.delivery-report .hb-complete-summary');
      const evidence=c.querySelector('.delivery-report .report-evidence');
      const factsDl=c.querySelector('.delivery-batch-facts');
      const status=c.querySelector('.persistence-state[role="status"][aria-live="polite"]');
      const safe=c.querySelector('.safe-input-copy');
      const excerpt=c.querySelector('.delivery-report .excerpt-label');
      const batchTitle=receipt&&receipt.querySelector('.delivery-batch-title');
      return {
        topLevelParagraph: topP?topP.textContent:null,
        receiptPresent: !!receipt,
        receiptOpen: receipt?receipt.open:null,
        receiptSummary: receipt?receipt.querySelector('summary').textContent:null,
        batchTitleInReceipt: batchTitle?batchTitle.textContent:null,
        reportSummaryText: summary?summary.textContent:null,
        reportSummaryLength: summary?Array.from(summary.textContent).length:null,
        hasPrefixInSummary: summary?summary.textContent.includes('PROBE-DELIVERY-PREFIX-MARKER'):null,
        hasTailInSummary: summary?summary.textContent.includes('PROBE-DELIVERY-TAIL-MARKER'):null,
        reportCompletePresent: !!complete,
        reportCompleteOpen: complete?complete.open:null,
        reportCompleteHasTail: completeBody?completeBody.textContent.includes('PROBE-DELIVERY-TAIL-MARKER'):null,
        reportEvidencePresent: !!evidence,
        reportEvidenceOpen: evidence?evidence.open:null,
        reportEvidenceSummary: evidence?evidence.querySelector('summary').textContent:null,
        reportEvidenceHasItem: evidence?evidence.textContent.includes('PROBE-EVIDENCE-MARKER'):null,
        reportEvidenceItemFlags: evidence?evidence.textContent.includes('已截断'):null,
        deliveryReportFlags: (c.querySelector('.delivery-report .projection-flags')||{}).textContent||'',
        excerptLabel: excerpt?excerpt.textContent:null,
        batchFactColumns: factsDl?factsDl.querySelectorAll('dt').length:0,
        batchFactLabels: factsDl?[...factsDl.querySelectorAll('dt')].map(x=>x.textContent):[],
        retryButtonText: (c.querySelector('.persistence-retry')||{}).textContent||null,
        statusRole: !!status,
        statusInsideReceipt: !!(receipt&&receipt.querySelector('.persistence-state[role="status"][aria-live="polite"]')),
        safeCopyPresent: !!safe,
        safeCopyOpen: safe?safe.open:null,
        reportSections: c.querySelectorAll('.delivery-report').length,
      };
    })()`);
    check("delivery card rendered", facts !== null, facts);

    if (facts) {
      if (PHASE === "before") {
        check(
          "before: batch title is the card-leading paragraph",
          facts.topLevelParagraph === "交付 · 本批 1 份（不表示全部收齐）",
          facts.topLevelParagraph,
        );
        check(
          "before: default body is preview only (tail hidden)",
          facts.hasPrefixInSummary === true && facts.hasTailInSummary === false,
          { length: facts.reportSummaryLength, tail: facts.hasTailInSummary },
        );
        check(
          "before: full text only inside closed report-complete fold",
          facts.reportCompletePresent === true &&
            facts.reportCompleteOpen === false &&
            facts.reportCompleteHasTail === true,
          { present: facts.reportCompletePresent, open: facts.reportCompleteOpen, tail: facts.reportCompleteHasTail },
        );
        check(
          "before: no receipt details (facts are primary)",
          facts.receiptPresent === false && facts.batchFactColumns === 3,
          { receipt: facts.receiptPresent, columns: facts.batchFactColumns },
        );
      } else {
        check(
          "after: no card-leading batch title paragraph",
          facts.topLevelParagraph === null,
          facts.topLevelParagraph,
        );
        check(
          "after: receipt details present and collapsed at card tail",
          facts.receiptPresent === true && facts.receiptOpen === false,
          { receipt: facts.receiptPresent, open: facts.receiptOpen },
        );
        check(
          "after: batch title demoted inside receipt details",
          facts.batchTitleInReceipt === "交付 · 本批 1 份（不表示全部收齐）" &&
            (facts.receiptSummary || "").includes("接收历史"),
          { title: facts.batchTitleInReceipt, summary: facts.receiptSummary },
        );
        check(
          "after: report body contains full text by default (no click)",
          facts.hasPrefixInSummary === true && facts.hasTailInSummary === true,
          { length: facts.reportSummaryLength, tail: facts.hasTailInSummary },
        );
        check(
          "after: no report-complete fold inside delivery report",
          facts.reportCompletePresent === false,
          facts.reportCompletePresent,
        );
        check(
          "after: no misleading excerpt label on inline full text",
          facts.excerptLabel === null,
          facts.excerptLabel,
        );
        check(
          "after: evidence fold kept with existing count label",
          facts.reportEvidencePresent === true &&
            facts.reportEvidenceSummary === "证据（1 条）" &&
            facts.reportEvidenceHasItem === true &&
            facts.reportEvidenceItemFlags === true,
          {
            summary: facts.reportEvidenceSummary,
            item: facts.reportEvidenceHasItem,
            flags: facts.reportEvidenceItemFlags,
          },
        );
        check(
          "after: projection flags (redacted/truncated) preserved on body",
          (facts.deliveryReportFlags || "").includes("已净化") &&
            (facts.deliveryReportFlags || "").includes("已截断"),
          facts.deliveryReportFlags,
        );
        check(
          "after: three-column delivery facts retained",
          facts.batchFactColumns === 3 &&
            facts.batchFactLabels.includes("接收历史") &&
            facts.batchFactLabels.includes("目标输入记录") &&
            facts.batchFactLabels.includes("目标轮次结果"),
          facts.batchFactLabels,
        );
        check(
          "after: retry button retained",
          facts.retryButtonText === "重试保存历史",
          facts.retryButtonText,
        );
        check(
          "after: aria-live status role retained inside receipt",
          facts.statusRole === true && facts.statusInsideReceipt === true,
          { role: facts.statusRole, insideReceipt: facts.statusInsideReceipt },
        );
        check(
          "after: safe input copy retained and closed by default",
          facts.safeCopyPresent === true && facts.safeCopyOpen === false,
          { present: facts.safeCopyPresent, open: facts.safeCopyOpen },
        );
      }
    }

    await js(`(()=>{
      const chat=document.getElementById('chat');
      const c=[...document.querySelectorAll('#chat .msg-delivery')].find(x=>x.textContent.includes('PROBE-DELIVERY-PREFIX-MARKER'));
      if(chat&&c){chat.scrollTop += c.getBoundingClientRect().top - chat.getBoundingClientRect().top - 8;}
    })()`);
    await sleep(160);
    await shot("delivery-default-" + PHASE);
    await js(`document.querySelector('#chat .msg-delivery .delivery-report .hb-summary').scrollIntoView({block:'end'})`);
    await sleep(160);
    await shot("delivery-report-bottom-" + PHASE);
    if (PHASE === "after") {
      await js(`(()=>{const r=document.querySelector('#chat .msg-delivery .delivery-receipt');if(r){r.open=true;}})()`);
      await sleep(160);
      await js(`document.querySelector('#chat .msg-delivery .delivery-receipt').scrollIntoView({block:'center'})`);
      await sleep(160);
      await shot("delivery-receipt-open-after");
    }

    const errorConsole = report.console.filter((entry) => String(entry.level) === "error");
    check("zero console errors", errorConsole.length === 0, errorConsole);
  } catch (error) {
    report.console.push({ level: "probe", message: String(error && error.stack ? error.stack : error) });
    check("probe completed without exception", false, String(error));
  } finally {
    fs.writeFileSync(path.join(OUT, "probe-result.json"), JSON.stringify(report, null, 2));
    console.log(`DELIVERY_INLINE_PROBE ${report.failures === 0 ? "PASS" : "FAIL"} ${report.checks.length} checks / ${report.failures} failures ${OUT}`);
    app.quit();
  }
});
