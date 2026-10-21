#!/usr/bin/env node
/** 测试角色独立编写的 Phase 4B 离线 IPC 冒烟（不复用桌面UI 脚本）。 */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const REPO = "/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
const ENTRY = path.join(REPO, "app/renderer/dist/src/index.html");
const PRELOAD = path.join(__dirname, "ans-p4b-smoke-preload.cjs");
const OUT = path.join(__dirname, "out");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const report = { checks: [], console: [], didFail: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail === undefined ? null : detail });
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
}
function finish(code) {
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  app.exit(code);
}

const R1 = {
  version: 1, reportId: "r1", status: "completed", origin: "submitted-report",
  summary: { text: "A".repeat(200) + "\nSECOND-LINE\nTHIRD-LINE\nFOURTH-LINE\nFIFTH-LINE" },
  source: { roleId: "A", runtime: "claude", turnId: "t1" },
  evidence: [{ title: "证据一", text: "证据正文" }],
};
const R2 = {
  version: 1, reportId: "r2", status: "completed", origin: "submitted-report",
  summary: { text: "SECOND-REPORT" },
  source: { roleId: "B", runtime: "claude", turnId: "t2" },
  evidence: [],
};

async function main() {
  const win = new BrowserWindow({
    width: 1360, height: 860, useContentSize: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: PRELOAD },
  });
  const wc = win.webContents;
  wc.on("console-message", (...args) => {
    const e = args[0];
    const level = e && typeof e === "object" && "level" in e ? e.level : args[1];
    const message = e && typeof e === "object" && "message" in e ? e.message : args[2];
    report.console.push({ level, message });
    if (String(level) === "error") console.log("CONSOLE_ERROR " + message);
  });
  wc.on("did-fail-load", (_e, code, desc, url) => report.didFail.push({ code, desc, url }));
  await win.loadFile(ENTRY);
  await sleep(500);
  const js = (code) => wc.executeJavaScript(code, true);
  async function waitFor(expr, timeout = 9000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      last = await js(expr).catch((e) => String(e));
      if (last) return last;
      await sleep(60);
    }
    return last;
  }
  await waitFor(`!!document.querySelector('#root > .app-shell')`);
  const init = await js(`(async () => {
    await window.__ansRenderer.loadProject('/fixture4b');
    await window.__ansRenderer.selectRole('A');
    await new Promise(r => setTimeout(r, 250));
    return { state: window.__ansRenderer.state, unimplemented: window.__ansRenderer.unimplemented,
      gov: typeof window.__ansRenderer.governance, anchor: typeof window.__ansRenderer.replayAnchorDebug };
  })()`);
  check("DRIVER_SURFACE_4B", init.unimplemented.length === 0 && init.gov === "object" && init.anchor === "function",
    { unimplemented: init.unimplemented, gov: init.gov, anchor: init.anchor });
  check("INIT_TRIO_FIVE_ROLES", init.state.governanceModel === "trio" && init.state.roles.length === 5 && init.state.primaryRoleId === "A",
    { model: init.state.governanceModel, roles: init.state.roles.length, primary: init.state.primaryRoleId });

  // ---------- operator 排队聚合 ----------
  const queue1 = await js(`(async () => {
    const S = window.__smoke4b;
    S.emitOperatorQueued({ id: 'q1', roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude' });
    S.emitOperatorQueued({ id: 'q2', roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude' });
    await new Promise(r => setTimeout(r, 250));
    const rows = [...document.querySelectorAll('#chat .op-queue-aggregate')];
    return { count: rows.length, text: rows[0] ? rows[0].textContent : '', queued: window.__ansRenderer.queuedDebug(),
      buttons: rows[0] ? rows[0].querySelectorAll('button,a,input').length : -1,
      focusable: rows[0] ? rows[0].getAttribute('tabindex') : null, role: rows[0] ? rows[0].getAttribute('role') : null };
  })()`);
  check("QUEUE_AGGREGATE_SINGLE_ROW_TWO", queue1.count === 1 && /2/.test(queue1.text) && queue1.queued.join(",") === "q1,q2", queue1);
  check("QUEUE_AGGREGATE_NOT_INTERACTIVE", queue1.buttons === 0 && (queue1.focusable === null || Number(queue1.focusable) < 0) && queue1.role === "status", queue1);

  const queue2 = await js(`(async () => {
    const S = window.__smoke4b;
    S.emitOperatorQueued({ id: 'q2', roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude' });
    await new Promise(r => setTimeout(r, 200));
    const row = document.querySelector('#chat .op-queue-aggregate');
    return { text: row ? row.textContent : '', queued: window.__ansRenderer.queuedDebug() };
  })()`);
  check("QUEUE_REPUSH_SAME_ID_DEDUP", /2/.test(queue2.text) && queue2.queued.join(",") === "q1,q2", queue2);

  const queue3 = await js(`(async () => {
    const S = window.__smoke4b;
    S.emitOperatorRequest({ id: 'q1', roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude', request: { kind: 'confirm', title: '治理决定一', cardKind: 'acceptance', flowId: 'f1', stepId: 's1', paths: ['docs/a.md'] } });
    await new Promise(r => setTimeout(r, 300));
    const row = document.querySelector('#chat .op-queue-aggregate');
    return { text: row ? row.textContent : '', queued: window.__ansRenderer.queuedDebug(),
      cards: document.querySelectorAll('#chat .op-request[data-request-id="q1"]').length };
  })()`);
  check("QUEUE_PRESENTED_REMOVED_FROM_AGGREGATE", queue3.cards === 1 && /1/.test(queue3.text) && !/2/.test(queue3.text) && queue3.queued.join(",") === "q2", queue3);

  const queue4 = await js(`(async () => {
    const S = window.__smoke4b;
    S.emitOperatorExpired({ id: 'q2', reason: '超时' });
    await new Promise(r => setTimeout(r, 250));
    return { aggregate: document.querySelectorAll('#chat .op-queue-aggregate').length, queued: window.__ansRenderer.queuedDebug() };
  })()`);
  check("QUEUE_EXPIRED_REMOVES_AGGREGATE", queue4.aggregate === 0 && queue4.queued.length === 0, queue4);

  const queue5 = await js(`(async () => {
    const S = window.__smoke4b;
    S.emitOperatorQueued({ id: 'q3', roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude' });
    await new Promise(r => setTimeout(r, 200));
    const before = document.querySelector('#chat .op-queue-aggregate') ? document.querySelector('#chat .op-queue-aggregate').textContent : '';
    await window.__ansRenderer.selectRuntime('pi');
    await new Promise(r => setTimeout(r, 450));
    await window.__ansRenderer.selectRuntime('claude');
    await new Promise(r => setTimeout(r, 450));
    const after = document.querySelector('#chat .op-queue-aggregate');
    return { before, after: after ? after.textContent : '', queued: window.__ansRenderer.queuedDebug(), runtime: window.__ansRenderer.state.runtime };
  })()`);
  check("QUEUE_RUNTIME_SWITCH_CLEARS_NOT_REVIVED", /1/.test(queue5.before) && queue5.after === "" && queue5.queued.length === 0 && queue5.runtime === "claude", queue5);

  const queue6 = await js(`(async () => {
    const S = window.__smoke4b;
    S.emitOperatorQueued({ id: 'q4', roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude' });
    await new Promise(r => setTimeout(r, 250));
    const row = document.querySelector('#chat .op-queue-aggregate');
    return { text: row ? row.textContent : '', queued: window.__ansRenderer.queuedDebug(), rows: document.querySelectorAll('#chat .op-queue-aggregate').length };
  })()`);
  check("QUEUE_REPUSH_AFTER_CLEAR_REBUILDS", queue6.rows === 1 && /1/.test(queue6.text) && queue6.queued.join(",") === "q4", queue6);

  // ---------- 镜像面 ----------
  const mirror1 = await js(`(async () => {
    const S = window.__smoke4b;
    S.emitOperatorRequest({ id: 'm1', roleId: 'A', mirrorRoleId: 'C', projectRoot: '/fixture4b', runtime: 'claude',
      request: { kind: 'confirm', title: '镜像治理决定', cardKind: 'proposal', flowId: 'f2', stepId: 's2', paths: ['docs/b.md'] } });
    await new Promise(r => setTimeout(r, 300));
    await window.__ansRenderer.selectRole('C');
    await new Promise(r => setTimeout(r, 300));
    const c = document.querySelector('#chat .op-request[data-request-id="m1"]');
    const cView = c ? { mirror: c.classList.contains('is-mirror'), surface: c.getAttribute('data-surface-role-id'),
      badge: c.querySelector('.op-mirror-badge') ? c.querySelector('.op-mirror-badge').textContent : '',
      source: c.querySelector('.op-mirror-source') ? c.querySelector('.op-mirror-source').textContent : '' } : null;
    await window.__ansRenderer.selectRole('A');
    await new Promise(r => setTimeout(r, 300));
    const a = document.querySelector('#chat .op-request[data-request-id="m1"]');
    return { cView, a: a ? { mirror: a.classList.contains('is-mirror'), badge: !!a.querySelector('.op-mirror-badge') } : null,
      cCount: document.querySelectorAll('#chat .op-request[data-request-id="m1"]').length };
  })()`);
  check("MIRROR_TWO_SURFACES_SAME_ID", mirror1.cView && mirror1.cView.mirror === true && mirror1.cView.surface === "C" && /镜像 · 主入口/.test(mirror1.cView.badge) && /来自/.test(mirror1.cView.source) && /客户最终批准/.test(mirror1.cView.source) && mirror1.a && mirror1.a.mirror === false && mirror1.a.badge === false && mirror1.cCount === 1, mirror1);

  const mirror2 = await js(`(async () => {
    const S = window.__smoke4b;
    S.emitOperatorRequest({ id: 'm2', roleId: 'A', mirrorRoleId: 'C', queued: true, projectRoot: '/fixture4b', runtime: 'claude',
      request: { kind: 'confirm', title: '排队镜像', cardKind: 'proposal' } });
    await new Promise(r => setTimeout(r, 250));
    await window.__ansRenderer.selectRole('C');
    await new Promise(r => setTimeout(r, 250));
    const c = document.querySelector('#chat .op-request[data-request-id="m2"]');
    const actions = c ? c.querySelector('.op-actions') : null;
    return { queued: c && c.querySelector('.op-queued') ? c.querySelector('.op-queued').textContent : '',
      actionsHidden: actions ? actions.hidden : null, enabledButtons: c ? [...c.querySelectorAll('button')].filter(b => !b.disabled && !b.hidden && b.getClientRects().length > 0).length : -1 };
  })()`);
  check("MIRROR_QUEUED_DEFENSIVE_NO_ACTIONS", /等待前一个决定/.test(mirror2.queued) && mirror2.actionsHidden === true && mirror2.enabledButtons === 0, mirror2);

  const mirror3 = await js(`(async () => {
    await window.__ansRenderer.selectRole('A');
    await new Promise(r => setTimeout(r, 250));
    const card = document.querySelector('#chat .op-request[data-request-id="m1"]');
    const btn = card ? card.querySelector('.op-confirm') : null;
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 400));
    await window.__ansRenderer.selectRole('C');
    await new Promise(r => setTimeout(r, 250));
    const c = document.querySelector('#chat .op-request[data-request-id="m1"]');
    const cState = c ? { state: c.getAttribute('data-state'), hidden: c.querySelector('.op-actions').hidden, note: c.querySelector('.op-note') ? c.querySelector('.op-note').textContent : '' } : null;
    await window.__ansRenderer.selectRole('A');
    await new Promise(r => setTimeout(r, 250));
    const a = document.querySelector('#chat .op-request[data-request-id="m1"]');
    return { calls: window.__smoke4b.calls().operatorRespond.filter(x => x && x.id === 'm1'),
      cState, aState: a ? { state: a.getAttribute('data-state'), hidden: a.querySelector('.op-actions').hidden } : null };
  })()`);
  check("MIRROR_ONE_ANSWER_FREEZES_BOTH", mirror3.calls.length === 1 && mirror3.calls[0].decision && mirror3.calls[0].decision.confirmed === true && mirror3.cState && mirror3.cState.state === "decided" && mirror3.cState.hidden === true && mirror3.aState.state === "decided" && mirror3.aState.hidden === true, mirror3);

  const mirror4 = await js(`(async () => {
    const S = window.__smoke4b;
    S.setMode('operatorRespond', 'delay');
    S.emitOperatorRequest({ id: 'm3', roleId: 'A', mirrorRoleId: 'C', projectRoot: '/fixture4b', runtime: 'claude', request: { kind: 'confirm', title: '双击测试', cardKind: 'proposal' } });
    await new Promise(r => setTimeout(r, 250));
    const card = document.querySelector('#chat .op-request[data-request-id="m3"]');
    const btn = card ? card.querySelector('.op-confirm') : null;
    if (btn) { btn.click(); btn.click(); }
    await new Promise(r => setTimeout(r, 600));
    S.setMode('operatorRespond', 'ok');
    return { calls: window.__smoke4b.calls().operatorRespond.filter(x => x && x.id === 'm3').length };
  })()`);
  check("MIRROR_DOUBLE_SUBMIT_SINGLE_CALL", mirror4.calls === 1, mirror4);

  // ---------- 治理状态 / 预览 / 建立 / 重新接受 / 迁移 ----------
  const govStatus = await js(`(async () => {
    const el = document.getElementById('governance-status');
    const action = el ? el.querySelector('[data-governance-establish]') : null;
    return { visible: el && !el.hidden, text: el ? el.textContent : '', action: !!action };
  })()`);
  check("GOV_STATUS_AND_ESTABLISH_ACTION", govStatus.visible === true && /尚无治理记录/.test(govStatus.text) && govStatus.action === true, govStatus);

  const govEsc = await js(`(async () => {
    const trigger = document.querySelector('#governance-status [data-governance-establish]');
    trigger.click();
    await new Promise(r => setTimeout(r, 350));
    const panel = document.getElementById('governance-preview');
    const modal = panel ? { ariaModal: panel.getAttribute('aria-modal'), role: panel.getAttribute('role'),
      backdrop: !!document.querySelector('.modal-backdrop'), count: document.querySelectorAll('#governance-preview').length,
      title: panel.querySelector('.gp-title') ? panel.querySelector('.gp-title').textContent : '' } : null;
    const active = document.activeElement;
    active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 250));
    return { modal, open: window.__ansRenderer.governance.state().open,
      focusBack: document.activeElement === trigger, writes: window.__smoke4b.calls().establish.length };
  })()`);
  check("GOV_PREVIEW_UNIQUE_NONMODAL_FOCUS_ESC", govEsc.modal && govEsc.modal.backdrop === false && govEsc.modal.ariaModal === null && govEsc.modal.role === null && govEsc.modal.count === 1 && /建立治理记录（预览）/.test(govEsc.modal.title) && govEsc.open === false && govEsc.focusBack === true && govEsc.writes === 0, govEsc);

  const govCancel = await js(`(async () => {
    document.querySelector('#governance-status [data-governance-establish]').click();
    await new Promise(r => setTimeout(r, 350));
    const cancel = document.querySelector('#governance-preview [data-governance-cancel]');
    if (cancel) cancel.click();
    await new Promise(r => setTimeout(r, 200));
    return { open: window.__ansRenderer.governance.state().open, hint: window.__ansRenderer.state.hint, writes: window.__smoke4b.calls().establish.length };
  })()`);
  check("GOV_CANCEL_ZERO_WRITE_HINT", govCancel.open === false && /已取消，未写入任何文件/.test(govCancel.hint) && govCancel.writes === 0, govCancel);

  const govEstablish = await js(`(async () => {
    await window.__ansRenderer.governance.open('establish');
    await new Promise(r => setTimeout(r, 350));
    await window.__ansRenderer.governance.selectModel('trio');
    await new Promise(r => setTimeout(r, 350));
    const st = window.__ansRenderer.governance.state();
    const panelText = document.getElementById('governance-preview').textContent;
    await window.__ansRenderer.governance.confirm();
    await new Promise(r => setTimeout(r, 350));
    const after = window.__ansRenderer.governance.state();
    const resultText = document.getElementById('governance-preview').textContent;
    const calls = window.__smoke4b.calls().establish;
    return { canConfirm: st.canConfirm, callsPreview: window.__smoke4b.calls().establishPreview.length,
      panelHas: { write: panelText.includes('将写入：.ans/project.json'), pin: /将重算|pin 条目/.test(panelText) || /2/.test(panelText), declare: /不扩大任何角色写边界/.test(panelText) },
      calls, after, resultText };
  })()`);
  check("GOV_ESTABLISH_PREVIEW_TRIO_CONFIRM_ONCE", govEstablish.canConfirm === true && govEstablish.calls.length === 1 && govEstablish.calls[0].options && govEstablish.calls[0].options.governanceModel === "trio" && govEstablish.after.result && govEstablish.after.result.kind === "success" && /治理记录已建立/.test(govEstablish.resultText) && /下一轮发送前按新边界重建/.test(govEstablish.resultText), govEstablish);

  const govFail = await js(`(async () => {
    const S = window.__smoke4b;
    const close = document.querySelector('#governance-preview [data-governance-close]');
    if (close) close.click();
    await new Promise(r => setTimeout(r, 200));
    S.setMode('establish', 'fail-write');
    await window.__ansRenderer.governance.open('establish');
    await new Promise(r => setTimeout(r, 300));
    await window.__ansRenderer.governance.confirm();
    await new Promise(r => setTimeout(r, 350));
    const writeText = document.getElementById('governance-preview').textContent;
    const cancel = document.querySelector('#governance-preview [data-governance-cancel]');
    if (cancel) cancel.click();
    await new Promise(r => setTimeout(r, 200));
    S.setMode('establish', 'fail-guard');
    await window.__ansRenderer.governance.open('establish');
    await new Promise(r => setTimeout(r, 300));
    await window.__ansRenderer.governance.confirm();
    await new Promise(r => setTimeout(r, 350));
    const guardText = document.getElementById('governance-preview').textContent;
    return { writeText, guardText, calls: window.__smoke4b.calls().establish.length };
  })()`);
  check("GOV_ESTABLISH_FAIL_WRITE_HONEST", /写入阶段失败测试/.test(govFail.writeText) && /错误码：IO_ERROR/.test(govFail.writeText) && !/未写入任何文件/.test(govFail.writeText), govFail);
  check("GOV_ESTABLISH_FAIL_GUARD_ZERO_WRITE", /治理记录已存在；本次未写入任何文件/.test(govFail.guardText) && !/已建立/.test(govFail.guardText) && govFail.calls === 3, govFail);

  const govReaccept = await js(`(async () => {
    const S = window.__smoke4b;
    const cancel = document.querySelector('#governance-preview [data-governance-cancel]');
    if (cancel) cancel.click();
    await new Promise(r => setTimeout(r, 200));
    S.setGovernance('trio', { state: 'pin-mismatch', pinCount: 3, reason: '' });
    await window.__ansRenderer.loadProject('/fixture4b');
    await new Promise(r => setTimeout(r, 350));
    const trigger = document.querySelector('#governance-status [data-governance-reaccept]');
    if (trigger) trigger.click();
    await new Promise(r => setTimeout(r, 350));
    const panel = document.getElementById('governance-preview');
    const text = panel ? panel.textContent : '';
    const st = window.__ansRenderer.governance.state();
    const primary = panel ? panel.querySelector('.gp-primary') : null;
    if (primary) primary.click();
    await new Promise(r => setTimeout(r, 400));
    const afterText = document.getElementById('governance-preview').textContent;
    const calls = window.__smoke4b.calls().reaccept;
    return { text, canConfirm: st.canConfirm, digest: st.previewDigest, calls, afterText,
      trigger: !!trigger, noCancelWrite: true };
  })()`);
  check("GOV_REACCEPT_PREVIEW_AND_CONFIRM_ONCE", govReaccept.trigger === true && govReaccept.canConfirm === true && /^[0-9a-f]{64}$/.test(govReaccept.digest) && /内容已变更/.test(govReaccept.text) && /文件缺失/.test(govReaccept.text) && /文件不可读/.test(govReaccept.text) && /不认识这些改动/.test(govReaccept.text) && govReaccept.calls.length === 1 && govReaccept.calls[0].digest === govReaccept.digest && /已重新接受/.test(govReaccept.afterText), govReaccept);

  const govMigrate = await js(`(async () => {
    const S = window.__smoke4b;
    const close = document.querySelector('#governance-preview [data-governance-close]');
    if (close) close.click();
    await new Promise(r => setTimeout(r, 200));
    S.setGovernance('single', null);
    await window.__ansRenderer.loadProject('/fixture4b');
    await new Promise(r => setTimeout(r, 350));
    const box = document.getElementById('governance-migration');
    const btn = box ? box.querySelector('[data-governance-migrate]') : null;
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 350));
    return { visible: box && !box.hidden, label: btn ? btn.textContent : '', text: document.getElementById('governance-preview').textContent,
      migrateCalls: window.__smoke4b.calls().migrate.length };
  })()`);
  check("GOV_MIGRATION_NOT_AVAILABLE_HONEST", govMigrate.visible === true && /查看差异 \/ 升级/.test(govMigrate.label) && /迁移预览尚未在本版接线/.test(govMigrate.text) && /本次未写入任何文件/.test(govMigrate.text) && govMigrate.migrateCalls === 0, govMigrate);

  const govNext = await js(`(async () => {
    const S = window.__smoke4b;
    const cancel = document.querySelector('#governance-preview [data-governance-cancel]');
    if (cancel) cancel.click();
    await new Promise(r => setTimeout(r, 200));
    const before = { role: window.__ansRenderer.state.selectedRoleId, drawer: window.__ansRenderer.state.drawerOpen };
    S.emitGovernanceNext({ version: 1, flowId: 'f9', cardKind: 'proposal', nextFunction: 'proposal', roleId: 'B' });
    await new Promise(r => setTimeout(r, 250));
    const el = document.getElementById('governance-status');
    return { text: el ? el.textContent : '', before, after: { role: window.__ansRenderer.state.selectedRoleId, drawer: window.__ansRenderer.state.drawerOpen } };
  })()`);
  check("GOV_NEXT_STEP_STATUS_ONLY", /下一步：proposal/.test(govNext.text) && /f9/.test(govNext.text) && govNext.before.role === govNext.after.role && govNext.before.drawer === govNext.after.drawer, govNext);

  // ---------- 报告全文 / 持久化 / 交付 ----------
  const report1 = await js(`(async () => {
    const S = window.__smoke4b;
    S.setGovernance('trio', null);
    await window.__ansRenderer.loadProject('/fixture4b');
    await window.__ansRenderer.selectRole('A');
    await new Promise(r => setTimeout(r, 300));
    S.emitEvent({ roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude', event: { kind: 'handback', turnId: 't1', report: ${JSON.stringify(R1)}, reportPersistence: { state: 'failed', retryAvailable: true } } });
    await new Promise(r => setTimeout(r, 500));
    const card = document.querySelector('#chat .msg-handback');
    const summary = card ? card.querySelector('.hb-summary') : null;
    const text = card ? card.textContent : '';
    return { cards: document.querySelectorAll('#chat .msg-handback').length, summary: summary ? summary.textContent : '',
      declaration: /报告声明：已完成/.test(text), disclaimer: /不等于独立验收通过/.test(text),
      retry: card && card.querySelector('.persistence-retry') ? card.querySelector('.persistence-retry').textContent : '',
      facts: card ? card.querySelector('.report-facts') ? card.querySelector('.report-facts').textContent : '' : '' };
  })()`);
  check("REPORT_FULLTEXT_DECLARATION_NOT_ACCEPTANCE", report1.cards === 1 && report1.declaration && report1.disclaimer && report1.summary.indexOf("FIFTH-LINE") < 0 && report1.summary.length <= 200, report1);
  check("REPORT_PERSISTENCE_FAILED_RETRY_VISIBLE", /重试保存报告/.test(report1.retry) && /报告尚未保存/.test(report1.facts), report1);

  const report2 = await js(`(async () => {
    const card = document.querySelector('#chat .msg-handback');
    const btn = card ? card.querySelector('.persistence-retry') : null;
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 450));
    const text = card ? card.textContent : '';
    const calls = window.__smoke4b.calls().reportRetry.length;
    window.__smoke4b.emitReportUpdate({ version: 1, scope: { projectRoot: '/fixture4b', roleId: 'A', runtime: 'claude' },
      change: { kind: 'report-save', reportId: 'r1', state: { state: 'failed', retryAvailable: true } } });
    await new Promise(r => setTimeout(r, 250));
    const afterLate = card ? card.textContent : '';
    return { calls, saved: /报告已保存/.test(text), retryGone: !card.querySelector('.persistence-retry'), afterLateSaved: /报告已保存/.test(afterLate), afterLateRetry: !!card.querySelector('.persistence-retry') };
  })()`);
  check("REPORT_RETRY_SAVED_NOT_OVERWRITTEN_BY_LATE_FAILED", report2.calls === 1 && report2.saved && report2.retryGone && report2.afterLateSaved && report2.afterLateRetry === false, report2);

  const delivery1 = await js(`(async () => {
    const S = window.__smoke4b;
    S.emitEvent({ roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude', event: { kind: 'message', turnId: 't2', summary: '交付',
      detail: { inputProvenance: { attemptId: 'att1', reports: [${JSON.stringify(R1)}, ${JSON.stringify(R2)}] },
        inputPresentation: { attemptId: 'att1' }, text: '交付安全副本', inputTextProjection: { redacted: true, truncated: false } } } });
    await new Promise(r => setTimeout(r, 550));
    const card = document.querySelector('#chat .msg-delivery');
    const text = card ? card.textContent : '';
    return { cards: document.querySelectorAll('#chat .msg-delivery').length,
      title: /回交投递 · 本批 2 份（不表示全部收齐）/.test(text), reports: card ? card.querySelectorAll('.delivery-report').length : 0,
      facts: card ? card.querySelector('.delivery-batch-facts') ? card.querySelector('.delivery-batch-facts').textContent : '' : '',
      retry: card && card.querySelector('.persistence-retry') ? card.querySelector('.persistence-retry').textContent : '',
      safe: card && card.querySelector('.projection-flags') ? card.querySelector('.projection-flags').textContent : '',
      safeCopy: card ? (card.querySelector('.safe-input-copy') ? card.querySelector('.safe-input-copy').textContent : '') : '' };
  })()`);
  check("DELIVERY_BATCH_TITLE_AND_TWO_REPORTS", delivery1.cards === 1 && delivery1.title && delivery1.reports === 2, delivery1);
  check("DELIVERY_FAILED_RETRY_AND_SAFE_COPY", /重试保存历史/.test(delivery1.retry) && /本次接收历史未保存/.test(delivery1.facts) && /此处未记录完整模型输入 · 已净化/.test(delivery1.safeCopy) && /不能显示完整模型输入/.test(delivery1.safeCopy), delivery1);

  const delivery2 = await js(`(async () => {
    const card = document.querySelector('#chat .msg-delivery');
    const btn = card ? card.querySelector('.persistence-retry') : null;
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 450));
    const text = card ? card.textContent : '';
    window.__smoke4b.emitDeliveryUpdate({ version: 1, scope: { projectRoot: '/fixture4b', roleId: 'A', runtime: 'claude' },
      change: { kind: 'delivery-history-save', attemptId: 'att1', state: 'failed', retryHistoryAvailable: true } });
    await new Promise(r => setTimeout(r, 250));
    const after = card ? card.textContent : '';
    return { calls: window.__smoke4b.calls().deliveryRetry.length, saved: /接收历史已保存/.test(text), afterSaved: /接收历史已保存/.test(after), retry: !!card.querySelector('.persistence-retry') };
  })()`);
  check("DELIVERY_RETRY_SAVED_STABLE", delivery2.calls === 1 && delivery2.saved && delivery2.afterSaved && delivery2.retry === false, delivery2);

  const delivery3 = await js(`(async () => {
    const S = window.__smoke4b;
    S.setMode('delivery', 'expired');
    S.emitEvent({ roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude', event: { kind: 'message', turnId: 't3', summary: '交付二',
      detail: { inputProvenance: { attemptId: 'att2', reports: [${JSON.stringify(R2)}] }, text: '交付二正文', inputTextProjection: {} } } });
    await new Promise(r => setTimeout(r, 550));
    const cards = [...document.querySelectorAll('#chat .msg-delivery')];
    const card = cards[cards.length - 1];
    return { text: card ? card.textContent : '', retry: card ? !!card.querySelector('.persistence-retry') : null };
  })()`);
  check("DELIVERY_EXPIRED_NO_FAKE_RETRY", /可补存的会话材料已失效/.test(delivery3.text) && delivery3.retry === false, delivery3);

  // ---------- 菜单配置状态 ----------
  const menu = await js(`(async () => {
    const before = window.__smoke4b.calls().configRead.length;
    document.getElementById('runtime-select').click();
    const end = Date.now() + 2500;
    let checking = true;
    while (Date.now() < end && checking) {
      await new Promise(r => setTimeout(r, 80));
      checking = [...document.querySelectorAll('#runtime-options .engine-option-status')].some(el => /检查中/.test(el.textContent));
    }
    const opts = [...document.querySelectorAll('#runtime-options .engine-option')].map(el => ({
      runtime: el.getAttribute('data-runtime'),
      status: el.querySelector('.engine-option-status') ? el.querySelector('.engine-option-status').textContent : '',
      kind: el.querySelector('.engine-option-status') ? el.querySelector('.engine-option-status').getAttribute('data-menu-status') : '',
      height: el.getBoundingClientRect().height,
    }));
    const width = document.getElementById('runtime-options').getBoundingClientRect().width;
    const afterFirst = window.__smoke4b.calls().configRead.length;
    document.getElementById('runtime-select').click();
    await new Promise(r => setTimeout(r, 150));
    document.getElementById('runtime-select').click();
    await new Promise(r => setTimeout(r, 700));
    const afterSecond = window.__smoke4b.calls().configRead.length;
    const extraReads = window.__smoke4b.calls().configRead.slice(afterFirst);
    document.getElementById('runtime-select').click();
    return { before, opts, width, afterFirst, afterSecond, extraReads };
  })()`);
  const menuMap = Object.fromEntries((menu.opts || []).map((o) => [o.runtime, o]));
  check("ENGINE_MENU_CONFIG_STATUS_TEXT", menuMap.claude && menuMap.claude.status === "已配置" && menuMap.pi && menuMap.pi.status === "缺配置" && menuMap.codex && menuMap.codex.status === "配置未知", menu.opts);
  check("ENGINE_MENU_WIDTH_208_TWO_LINE", Math.round(menu.width) === 208 && menu.opts.length === 3 && menu.opts.every(o => o.height >= 40), { width: menu.width, heights: menu.opts.map(o => o.height) });
  check("ENGINE_MENU_READ_COUNTS_CACHED", menu.afterFirst > menu.before && menu.afterSecond === menu.afterFirst + 1 && menu.extraReads.length === 1 && menu.extraReads[0] === "codex", { before: menu.before, first: menu.afterFirst, second: menu.afterSecond, extra: menu.extraReads });

  // ---------- queueView 顶层 tab 切换 ----------
  const queueView = await js(`(async () => {
    window.__smoke4b.emitRoleState({ roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude', busy: false,
      queue: [{ id: 'u1', kind: 'message', summary: '排队一' }, { id: 'u2', kind: 'message', summary: '排队二' }, { id: 'u3', kind: 'message', summary: '排队三' }, { id: 'u4', kind: 'message', summary: '排队四' }], running: null });
    await new Promise(r => setTimeout(r, 300));
    document.getElementById('tab-work').click();
    await new Promise(r => setTimeout(r, 350));
    const more = document.querySelector('.queue-view-all');
    if (more) more.click();
    await new Promise(r => setTimeout(r, 350));
    const opened = !!document.querySelector('.queue-subview') && !!document.getElementById('right-queue-body');
    document.getElementById('tab-card').click();
    await new Promise(r => setTimeout(r, 350));
    const clearedByCard = !document.querySelector('.queue-subview');
    document.getElementById('tab-work').click();
    await new Promise(r => setTimeout(r, 300));
    const more2 = document.querySelector('.queue-view-all');
    if (more2) more2.click();
    await new Promise(r => setTimeout(r, 300));
    const reopened = !!document.querySelector('.queue-subview');
    document.getElementById('tab-work').click();
    await new Promise(r => setTimeout(r, 300));
    return { opened, clearedByCard, reopened, clearedByWork: !document.querySelector('.queue-subview'), more: !!more };
  })()`);
  check("QUEUE_SUBVIEW_CLEARED_BY_TAB_SWITCH", queueView.more && queueView.opened && queueView.clearedByCard && queueView.reopened && queueView.clearedByWork, queueView);

  // ---------- single 警告刷新 ----------
  const single = await js(`(async () => {
    const S = window.__smoke4b;
    const toggle = document.getElementById('judge-decision-toggle');
    const initial = { disabled: toggle.disabled, checked: toggle.checked };
    toggle.click();
    await new Promise(r => setTimeout(r, 300));
    const on = { checked: toggle.checked, warning: !document.getElementById('shell-judge-warning').hidden,
      warningText: document.getElementById('shell-judge-warning-text').textContent };
    document.getElementById('shell-judge-warning-close').click();
    await new Promise(r => setTimeout(r, 200));
    S.setGovernance('single', null);
    await window.__ansRenderer.loadProject('/fixture4b');
    await new Promise(r => setTimeout(r, 350));
    const singleState = { disabled: toggle.disabled, checked: toggle.checked,
      label: document.getElementById('judge-decision-label').textContent,
      warning: !document.getElementById('shell-judge-warning').hidden };
    S.setGovernance('trio', null);
    await window.__ansRenderer.loadProject('/fixture4b');
    await new Promise(r => setTimeout(r, 400));
    const back = { disabled: toggle.disabled, warning: !document.getElementById('shell-judge-warning').hidden,
      warningText: document.getElementById('shell-judge-warning-text').textContent };
    document.getElementById('shell-judge-warning-close').click();
    toggle.click();
    await new Promise(r => setTimeout(r, 250));
    const off = { checked: toggle.checked, warning: !document.getElementById('shell-judge-warning').hidden };
    toggle.click();
    await new Promise(r => setTimeout(r, 300));
    const reOn = { checked: toggle.checked, warning: !document.getElementById('shell-judge-warning').hidden };
    document.getElementById('shell-judge-warning-close').click();
    return { initial, on, singleState, back, off, reOn, calls: window.__smoke4b.calls().configRead.length };
  })()`);
  check("SINGLE_SWITCH_WARNING_REFRESH_ON_MODEL_CHANGE", single.initial.disabled === false && single.on.checked === true && single.on.warning === true && /替我决策/.test(single.on.warningText) && single.singleState.disabled === true && single.singleState.checked === false && single.singleState.warning === false && single.back.warning === false && single.back.disabled === false && single.off.warning === false && single.reOn.warning === true, single);

  // ---------- judge 跨引擎重放 ----------
  const judge = await js(`(async () => {
    const S = window.__smoke4b;
    await window.__ansRenderer.selectRuntime('claude');
    await new Promise(r => setTimeout(r, 400));
    S.emitShellJudge({ roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude', verdict: 'deny', engine: 'claude', summary: 'SHELL-CLAUDE-ONLY', reason: '测试', tier: 'risky' });
    S.emitOperatorJudge({ roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude', group: 'decision', cardKind: 'proposal', engine: 'claude', selected: ['accept'], flowId: 'f1', reason: '测试' });
    await new Promise(r => setTimeout(r, 300));
    const claudeText = document.getElementById('chat').textContent;
    await window.__ansRenderer.selectRuntime('pi');
    await new Promise(r => setTimeout(r, 450));
    const piText = document.getElementById('chat').textContent;
    S.emitShellJudge({ roleId: 'A', projectRoot: '/fixture4b', runtime: 'pi', verdict: 'deny', engine: 'pi', summary: 'SHELL-PI-ONLY', reason: '测试', tier: 'risky' });
    await new Promise(r => setTimeout(r, 300));
    const piAfter = document.getElementById('chat').textContent;
    await window.__ansRenderer.selectRuntime('claude');
    await new Promise(r => setTimeout(r, 450));
    const back = document.getElementById('chat').textContent;
    return { claudeHas: /SHELL-CLAUDE-ONLY/.test(claudeText) && /接受提案/.test(claudeText),
      piHasClaude: /SHELL-CLAUDE-ONLY/.test(piText), piHasPi: /SHELL-PI-ONLY/.test(piAfter),
      backHasClaude: /SHELL-CLAUDE-ONLY/.test(back), backHasPi: /SHELL-PI-ONLY/.test(back),
      backClaudeCount: (back.match(/SHELL-CLAUDE-ONLY/g) || []).length, backPiCount: (back.match(/SHELL-PI-ONLY/g) || []).length };
  })()`);
  check("JUDGE_RESULT_ROWS_REPLAY_PER_RUNTIME", judge.claudeHas && judge.piHasClaude === false && judge.piHasPi && judge.backHasClaude && judge.backHasPi === false && judge.backClaudeCount === 1, judge);

  // ---------- replayAnchorDebug / 锚点插入 ----------
  const anchor = await js(`(async () => {
    const S = window.__smoke4b;
    S.emitHistory({ roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude',
      rows: [{ kind: 'assistant', text: 'PRE-ANCHOR', turnId: 't9' },
        { kind: 'user', text: 'TASK-AK1', turnId: 't9', anchorKey: 'ak1', anchor: 'request' },
        { kind: 'assistant', text: 'REPLY-AK1', turnId: 't9', anchorKey: 'ak1', anchor: 'conclusion' }],
      reports: [] });
    await new Promise(r => setTimeout(r, 450));
    const before = window.__ansRenderer.replayAnchorDebug('A');
    S.emitOperatorRequest({ id: 'anchor-card', roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude', anchorKey: 'ak1',
      request: { kind: 'confirm', title: 'ANCHOR-CARD', cardKind: 'proposal' } });
    await new Promise(r => setTimeout(r, 350));
    const after = window.__ansRenderer.replayAnchorDebug('A');
    const text = document.getElementById('chat').textContent;
    const iTask = text.indexOf('TASK-AK1'); const iCard = text.indexOf('ANCHOR-CARD'); const iReply = text.indexOf('REPLY-AK1');
    S.emitHistory({ roleId: 'A', projectRoot: '/fixture4b', runtime: 'claude',
      rows: [{ kind: 'assistant', text: 'PRE-ANCHOR', turnId: 't9' },
        { kind: 'user', text: 'TASK-AK1', turnId: 't9', anchorKey: 'ak1', anchor: 'request' },
        { kind: 'assistant', text: 'REPLY-AK1', turnId: 't9', anchorKey: 'ak1', anchor: 'conclusion' }],
      reports: [] });
    await new Promise(r => setTimeout(r, 450));
    const rebuilt = window.__ansRenderer.replayAnchorDebug('A');
    const rebuiltText = document.getElementById('chat').textContent;
    return { before, after, order: [iTask, iCard, iReply], rebuilt,
      cards: document.querySelectorAll('#chat .op-request[data-request-id="anchor-card"]').length,
      rebuiltOrder: [rebuiltText.indexOf('TASK-AK1'), rebuiltText.indexOf('ANCHOR-CARD'), rebuiltText.indexOf('REPLY-AK1')] };
  })()`);
  const a0 = (anchor.before || []).find((e) => e.anchorKey === 'ak1');
  const a1 = (anchor.after || []).find((e) => e.anchorKey === 'ak1');
  const a2 = (anchor.rebuilt || []).find((e) => e.anchorKey === 'ak1');
  check("REPLAY_ANCHOR_DEBUG_SAME_FIELDS", a0 && a0.requestIndex === 1 && a0.conclusionIndex === 2 && a0.rowsAtReplay === 3 && a1 && a1.requestIndex === 1 && a1.conclusionIndex === 3 && a1.rowsAtReplay === 3, { before: anchor.before, after: anchor.after });
  check("ANCHOR_CARD_INSERTED_BETWEEN_AND_REBUILD_PRESERVED", anchor.order[0] < anchor.order[1] && anchor.order[1] < anchor.order[2] && a2 && a2.conclusionIndex === 3 && anchor.cards === 1 && anchor.rebuiltOrder[0] < anchor.rebuiltOrder[1] && anchor.rebuiltOrder[1] < anchor.rebuiltOrder[2], { order: anchor.order, rebuilt: anchor.rebuiltOrder, card: a2 });

  const errors = report.console.filter((entry) => String(entry.level) === "error");
  check("ZERO_CONSOLE_ERRORS", errors.length === 0 && report.didFail.length === 0, { errors, didFail: report.didFail });
  const failed = report.checks.filter((c) => !c.value);
  console.log("PHASE4B_SMOKE " + (failed.length === 0 ? "PASS" : "FAIL") + " " + report.checks.length + " checks / " + failed.length + " failures");
  finish(failed.length === 0 ? 0 : 1);
}

app.whenReady().then(() => main().catch((error) => {
  console.log("SMOKE_CRASH " + (error && error.stack ? error.stack : String(error)));
  report.checks.push({ name: "SMOKE_CRASH", value: false, detail: String(error) });
  finish(2);
}));
