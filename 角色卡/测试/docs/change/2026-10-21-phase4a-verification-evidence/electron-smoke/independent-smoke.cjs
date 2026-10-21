#!/usr/bin/env node
/** 测试角色独立编写的 Phase 4A 离线 IPC 冒烟（不复用桌面UI 脚本）。 */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const REPO = "/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
const ENTRY = path.join(REPO, "app/renderer/dist/src/index.html");
const PRELOAD = path.join(__dirname, "ans-p4a-smoke-preload.cjs");
const OUT = "/tmp/ans-p4a-smoke-output";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const report = { checks: [], console: [], didFail: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail === undefined ? null : detail });
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
}

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
  await sleep(450);
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
    await window.__ansRenderer.loadProject('/fixture4a');
    await window.__ansRenderer.selectRole('A');
    return { runtime: window.__ansRenderer.state.runtime, open: window.__ansRenderer.state.sessionOpenRoleId, calls: window.__smoke4a.calls() };
  })()`);
  await sleep(350);
  check("INIT_DEFAULT_CLAUDE_SESSION", init.runtime === "claude" && init.open === "A" && init.calls.openSession.slice(-1)[0].runtime === "claude" && init.calls.history.slice(-1)[0].runtime === "claude", { runtime: init.runtime, openSession: init.calls.openSession.slice(-1)[0] });

  // ---------- 引擎真实切换 / 每引擎历史 ----------
  const pi = await js(`(async () => {
    await window.__ansRenderer.selectRuntime('pi');
    await new Promise(r => setTimeout(r, 450));
    const calls = window.__smoke4a.calls();
    return { runtime: window.__ansRenderer.state.runtime, open: window.__ansRenderer.state.sessionOpenRoleId, openCall: calls.openSession.slice(-1)[0], histCall: calls.history.slice(-1)[0], chat: document.getElementById('chat').textContent };
  })()`);
  check("ENGINE_SWITCH_PI_HISTORY", pi.runtime === "pi" && pi.open === "A" && pi.openCall.runtime === "pi" && pi.histCall.runtime === "pi" && /PI-HISTORY/.test(pi.chat), { runtime: pi.runtime, open: pi.open, hist: pi.histCall.runtime });
  const codex = await js(`(async () => {
    await window.__ansRenderer.selectRuntime('codex');
    await new Promise(r => setTimeout(r, 450));
    return { runtime: window.__ansRenderer.state.runtime, chat: document.getElementById('chat').textContent };
  })()`);
  check("ENGINE_SWITCH_CODEX_HISTORY", codex.runtime === "codex" && /CODEX-HISTORY/.test(codex.chat) && !/PI-HISTORY/.test(codex.chat), { runtime: codex.runtime });
  const backPi = await js(`(async () => {
    await window.__ansRenderer.selectRuntime('pi');
    await new Promise(r => setTimeout(r, 450));
    return { runtime: window.__ansRenderer.state.runtime, chat: document.getElementById('chat').textContent };
  })()`);
  check("ENGINE_SWITCH_BACK_RESTORES_OWN_HISTORY", backPi.runtime === "pi" && /PI-HISTORY/.test(backPi.chat) && !/CODEX-HISTORY/.test(backPi.chat), { runtime: backPi.runtime });

  // ---------- 跨引擎草稿 ----------
  const drafts = await js(`(async () => {
    const inp = document.getElementById('inp-message');
    const setValue = (v) => { const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); };
    setValue('PI 草稿');
    await new Promise(r => setTimeout(r, 120));
    await window.__ansRenderer.selectRuntime('claude');
    await new Promise(r => setTimeout(r, 450));
    const atClaude = inp.value;
    setValue('CLAUDE 草稿');
    await new Promise(r => setTimeout(r, 120));
    await window.__ansRenderer.selectRuntime('pi');
    await new Promise(r => setTimeout(r, 450));
    const backPi = inp.value;
    await window.__ansRenderer.selectRuntime('claude');
    await new Promise(r => setTimeout(r, 450));
    const backClaude = inp.value;
    return { atClaude, backPi, backClaude };
  })()`);
  check("CROSS_ENGINE_DRAFT", drafts.atClaude === "" && drafts.backPi === "PI 草稿" && drafts.backClaude === "CLAUDE 草稿", drafts);

  // ---------- 迟到/异引擎事件不覆盖当前视图 ----------
  const routing = await js(`(async () => {
    window.__smoke4a.emitEvent({ roleId: 'A', projectRoot: '/fixture4a', runtime: 'pi', event: { kind: 'message', summary: 'PI-LATE' } });
    await new Promise(r => setTimeout(r, 300));
    const claudeChat = document.getElementById('chat').textContent;
    await window.__ansRenderer.selectRuntime('pi');
    await new Promise(r => setTimeout(r, 450));
    const piChat = document.getElementById('chat').textContent;
    return { claudeHasLate: /PI-LATE/.test(claudeChat), piHasLate: /PI-LATE/.test(piChat) };
  })()`);
  check("LATE_OTHER_ENGINE_EVENT_CACHED_NOT_OVERWRITE", routing.claudeHasLate === false && routing.piHasLate === true, routing);

  // ---------- 三引擎设置 ----------
  const settings = await js(`(async () => {
    await window.__ansRenderer.openPiPanel('pi');
    await new Promise(r => setTimeout(r, 500));
    const panel = document.getElementById('pi-panel');
    const tabs = [...panel.querySelectorAll('.pi-engine-tab')].map(t => ({ engine: t.getAttribute('data-engine'), selected: t.getAttribute('aria-selected') }));
    const secret = document.getElementById('pi-inp-ANTHROPIC_AUTH_TOKEN');
    const sliderRoot = document.getElementById('pi-range-ANS_PI_CONTEXT_WINDOW');
    const sliderInput = sliderRoot ? sliderRoot.querySelector('input[type="range"]') : null;
    const hidden = document.getElementById('pi-inp-ANS_PI_CONTEXT_WINDOW');
    const fallback = document.getElementById('pi-inp-ANS_PI_REASONING_EFFORT');
    const fallbackNote = document.getElementById('pi-range-note-ANS_PI_REASONING_EFFORT');
    return {
      visible: !panel.hidden,
      tabs,
      secret: secret ? { type: secret.type, value: secret.value, placeholder: secret.placeholder } : null,
      slider: sliderInput ? { min: sliderInput.getAttribute('aria-valuemin'), max: sliderInput.getAttribute('aria-valuemax'), now: sliderInput.getAttribute('aria-valuenow'), valueText: sliderInput.getAttribute('aria-valuetext'), hiddenValue: hidden && hidden.value } : null,
      fallback: fallback ? { type: fallback.type, value: fallback.value, noteVisible: fallbackNote ? getComputedStyle(fallbackNote).display !== 'none' : false } : null,
      status: document.getElementById('pi-status').textContent,
      text: panel.textContent,
    };
  })()`);
  check("SETTINGS_TABS_AND_PI_FIELDS", settings.visible === true && settings.tabs.length === 3 && settings.tabs.find(t => t.engine === "pi").selected === "true", settings.tabs);
  check("SETTINGS_SECRET_MASKED_NO_ECHO", settings.secret && settings.secret.type === "password" && settings.secret.value === "" && /已设置，留空则不修改/.test(settings.secret.placeholder) && !/https:\/\/pi\.example.*token/i.test(settings.text), settings.secret);
  check("SETTINGS_SLIDER_ARIA_AND_HIDDEN", settings.slider && settings.slider.min === "0" && settings.slider.max === "4" && settings.slider.now === "2" && settings.slider.hiddenValue === "500000", settings.slider);
  check("SETTINGS_NON_PRESET_FALLBACK", settings.fallback && settings.fallback.type === "text" && settings.fallback.value === "custom-tier" && settings.fallback.noteVisible === true, settings.fallback);

  const sliderKey = await js(`(async () => {
    const root = document.getElementById('pi-range-ANS_PI_CONTEXT_WINDOW');
    const input = root.querySelector('input[type="range"]');
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 250));
    const hidden = document.getElementById('pi-inp-ANS_PI_CONTEXT_WINDOW');
    const out = document.getElementById('pi-range-out-ANS_PI_CONTEXT_WINDOW');
    return { now: input.getAttribute('aria-valuenow'), hiddenValue: hidden && hidden.value, out: out && out.textContent };
  })()`);
  check("SETTINGS_SLIDER_KEYBOARD", sliderKey.now === "3" && sliderKey.hiddenValue === "1000000", sliderKey);

  const saveStates = await js(`(async () => {
    const base = document.getElementById('pi-inp-ANS_PI_BASE_URL');
    base.value = 'https://new.example';
    window.__smoke4a.setMode('configSave', 'delay');
    const pending = window.__ansRenderer.savePiConfigFromForm();
    await new Promise(r => setTimeout(r, 120));
    const loading = { status: document.getElementById('pi-status').textContent, disabled: document.getElementById('pi-save').disabled };
    await pending;
    await new Promise(r => setTimeout(r, 500));
    const saved = { status: document.getElementById('pi-status').textContent };
    window.__smoke4a.setMode('configSave', 'fail');
    base.value = 'https://fail.example';
    await window.__ansRenderer.savePiConfigFromForm();
    await new Promise(r => setTimeout(r, 300));
    const failed = { status: document.getElementById('pi-status').textContent };
    window.__smoke4a.setMode('configSave', 'ok');
    return { loading, saved, failed };
  })()`);
  check("SETTINGS_SAVE_LOADING_SAVED_ERROR", /正在保存/.test(saveStates.loading.status) && saveStates.loading.disabled === true && /已保存/.test(saveStates.saved.status) && /保存失败/.test(saveStates.failed.status), saveStates);

  // ---------- 缺配提示 + 设置入口 ----------
  const notice = await js(`(async () => {
    await window.__ansRenderer.selectRuntime('codex');
    await new Promise(r => setTimeout(r, 600));
    const n = document.getElementById('runtime-config-notice');
    const visible = n && !n.hidden;
    const message = document.getElementById('runtime-config-message').textContent;
    document.getElementById('runtime-config-settings').click();
    await new Promise(r => setTimeout(r, 500));
    const active = [...document.querySelectorAll('.pi-engine-tab')].find(t => t.getAttribute('aria-selected') === 'true');
    const hasKey = !!document.getElementById('pi-inp-CODEX_API_KEY');
    return { visible: !!visible, message, active: active && active.getAttribute('data-engine'), hasKey };
  })()`);
  check("SETTINGS_MISSING_NOTICE_AND_ENTRY", notice.visible === true && /Codex/.test(notice.message) && /CODEX_API_KEY|缺少/.test(notice.message) && notice.active === "codex" && notice.hasKey === true, notice);

  // ---------- 设置读取失败 + 重试 / 晚到守卫 ----------
  const readFail = await js(`(async () => {
    window.__smoke4a.setMode('configRead', 'fail');
    const tab = [...document.querySelectorAll('.pi-engine-tab')].find(t => t.getAttribute('data-engine') === 'pi');
    tab.click();
    await new Promise(r => setTimeout(r, 500));
    const status = document.getElementById('pi-status').textContent;
    const retry = document.getElementById('pi-retry-read');
    const retryVisible = retry && getComputedStyle(retry).display !== 'none' && !retry.hidden;
    window.__smoke4a.setMode('configRead', 'ok');
    if (retry) retry.click();
    await new Promise(r => setTimeout(r, 500));
    return { status, retryVisible: !!retryVisible, recovered: !!document.getElementById('pi-inp-ANS_PI_BASE_URL') };
  })()`);
  check("SETTINGS_READ_FAIL_RETRY", /读取配置失败|读取失败|无法读取/.test(readFail.status) && readFail.retryVisible === true && readFail.recovered === true, readFail);

  const lateRead = await js(`(async () => {
    window.__smoke4a.setMode('configRead', 'delay');
    [...document.querySelectorAll('.pi-engine-tab')].find(t => t.getAttribute('data-engine') === 'pi').click();
    await new Promise(r => setTimeout(r, 40));
    [...document.querySelectorAll('.pi-engine-tab')].find(t => t.getAttribute('data-engine') === 'claude').click();
    await new Promise(r => setTimeout(r, 900));
    const active = [...document.querySelectorAll('.pi-engine-tab')].find(t => t.getAttribute('aria-selected') === 'true');
    window.__smoke4a.setMode('configRead', 'ok');
    return { active: active && active.getAttribute('data-engine'), hasClaude: !!document.getElementById('pi-inp-ANS_CLAUDE_MODEL'), hasPiBase: !!document.getElementById('pi-inp-ANS_PI_BASE_URL') };
  })()`);
  check("SETTINGS_LATE_READ_GUARD", lateRead.active === "claude" && lateRead.hasClaude === true && lateRead.hasPiBase === false, lateRead);

  // ---------- 资料抽屉 / 文档只读 ----------
  await js(`(async () => { await window.__ansRenderer.selectRuntime('claude'); await new Promise(r => setTimeout(r, 500)); })()`);
  await sleep(500);
  const profile = await js(`(async () => {
    document.getElementById('tab-card').click();
    await new Promise(r => setTimeout(r, 500));
    const panel = document.querySelector('.profile-panel');
    const sections = [...document.querySelectorAll('#right-body details[data-section]')].map(d => d.getAttribute('data-section'));
    const entry = document.querySelector('.role-document-entry');
    if (entry) entry.click();
    await new Promise(r => setTimeout(r, 350));
    const list = document.querySelectorAll('.document-list li').length;
    const readBtn = document.querySelector('.document-read-button');
    if (readBtn) readBtn.click();
    await new Promise(r => setTimeout(r, 500));
    const textEl = document.getElementById('document-read-text');
    return {
      panel: !!panel, sections, list, readBtn: !!readBtn,
      content: textEl && textEl.textContent, hasScript: textEl ? !!textEl.querySelector('script') : null,
      status: document.getElementById('document-read-status').textContent,
      docCalls: window.__smoke4a.calls().docRead.length,
      title: document.getElementById('drawer-title').textContent,
    };
  })()`);
  check("PROFILE_DRAWER_REAL_SECTIONS", profile.panel === true && profile.sections.join(",") === "card,boundary,changes,docs" && /A/.test(profile.title), { sections: profile.sections, title: profile.title });
  check("DOCUMENT_LIST_READ_ONLY_SAFE", profile.list === 1 && profile.readBtn === true && /文档正文/.test(profile.content) && profile.hasScript === false && /只读文档 · 24 字节/.test(profile.status) && profile.docCalls >= 1, { list: profile.list, status: profile.status, docCalls: profile.docCalls });

  const docBack = await js(`(async () => {
    document.querySelector('[data-doc-action="back-list"]').click();
    await new Promise(r => setTimeout(r, 250));
    const inList = !!document.querySelector('.document-list');
    document.querySelector('[data-doc-action="back-role"]').click();
    await new Promise(r => setTimeout(r, 300));
    const inProfile = !!document.querySelector('.profile-panel');
    const focusInside = !!(document.activeElement && document.getElementById('right-drawer') && document.getElementById('right-drawer').contains(document.activeElement));
    window.__smoke4a.resetDocCount();
    window.__smoke4a.setMode('docRead', 'errorOnce');
    document.querySelector('.role-document-entry').click();
    await new Promise(r => setTimeout(r, 250));
    document.querySelector('.document-read-button').click();
    await new Promise(r => setTimeout(r, 450));
    const err = { status: document.getElementById('document-read-status').textContent, retry: !!document.querySelector('[data-doc-action="retry"]') };
    document.querySelector('[data-doc-action="retry"]')?.click();
    await new Promise(r => setTimeout(r, 500));
    const retried = { content: document.getElementById('document-read-text').textContent };
    window.__smoke4a.setMode('docRead', 'ok');
    return { inList, inProfile, focusInside, err, retried };
  })()`);
  check("DOCUMENT_FOCUS_RETURN_AND_ERROR_RETRY", docBack.inList === true && docBack.inProfile === true && docBack.focusInside === true && /文档不存在。/.test(docBack.err.status) && docBack.err.retry === true && /文档正文/.test(docBack.retried.content), docBack);

  // ---------- 工作概览定位 / 角标 ----------
  const work = await js(`(async () => {
    window.__ansRenderer.appendOperatorRequest({ id: 'op-locate', roleId: 'A', turnId: 'turn-x', request: { kind: 'choice', title: '待定位卡', options: [{ id: 'a', label: '选项 A' }] } });
    await new Promise(r => setTimeout(r, 300));
    document.querySelector('[data-doc-action="back-list"]')?.click();
    await new Promise(r => setTimeout(r, 150));
    document.querySelector('[data-doc-action="back-role"]')?.click();
    await new Promise(r => setTimeout(r, 150));
    document.getElementById('tab-work').click();
    await new Promise(r => setTimeout(r, 450));
    const badge = document.querySelector('#tab-work .tab-badge');
    const pendingTitle = document.querySelector('.pending-requests .pending-title')?.textContent;
    const locate = document.querySelector('.pending-locate');
    const noRoleDocs = !document.querySelector('#right-body details[data-section]');
    if (locate) locate.click();
    await new Promise(r => setTimeout(r, 400));
    const drawerOpen = window.__ansRenderer.state.drawerOpen === true;
    const focused = document.activeElement;
    return {
      badge: badge && badge.textContent,
      pendingTitle,
      hasLocate: !!locate,
      noRoleDocs,
      drawerClosed: drawerOpen === false,
      focusOnCard: !!(focused && focused.closest && focused.closest('.op-request')),
      workTitle: 'work',
    };
  })()`);
  check("WORK_OVERVIEW_PENDING_LOCATE", work.hasLocate === true && /待定位卡/.test(work.pendingTitle) && work.badge === "1" && work.noRoleDocs === true && work.drawerClosed === true && work.focusOnCard === true, work);

  // ---------- 队列抽屉 ----------
  const queue = await js(`(async () => {
    window.__smoke4a.emitRoleState({ roleId: 'A', projectRoot: '/fixture4a', runtime: 'claude', busy: true, running: { id: 'run-q', summary: '正在执行', kind: 'message', sourceRoleId: 'B' }, queue: [{ id: 'q-a', summary: '第一条', kind: 'message' }, { id: 'q-b', summary: '第二条', kind: 'system' }] });
    await new Promise(r => setTimeout(r, 350));
    document.getElementById('tab-work').click();
    await new Promise(r => setTimeout(r, 450));
    const items = [...document.querySelectorAll('#right-queue-body .q-item')].map(i => ({ text: i.textContent.replace(/\s+/g, ' ').trim(), hasWithdraw: !!i.querySelector('.q-withdraw') }));
    const btn = document.querySelector('#right-queue-body .q-withdraw');
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 500));
    const withdraw = window.__smoke4a.calls().withdraw.slice(-1)[0];
    // 成功撤回不伪造就地文案：位次由真实 role-state 快照刷新（模拟主进程新快照）
    window.__smoke4a.emitRoleState({ roleId: 'A', projectRoot: '/fixture4a', runtime: 'claude', busy: true, running: { id: 'run-q', summary: '正在执行', kind: 'message', sourceRoleId: 'B' }, queue: [{ id: 'q-b', summary: '第二条', kind: 'system' }] });
    await new Promise(r => setTimeout(r, 400));
    const afterSuccess = [...document.querySelectorAll('#right-queue-body .q-item')].map(i => i.textContent.replace(/\s+/g, ' ').trim());
    // 失败路径：就地回执
    window.__smoke4a.setMode('withdraw', 'fail');
    window.__smoke4a.emitRoleState({ roleId: 'A', projectRoot: '/fixture4a', runtime: 'claude', busy: true, running: { id: 'run-q', summary: '正在执行', kind: 'message', sourceRoleId: 'B' }, queue: [{ id: 'q-c', summary: '第三条', kind: 'message' }] });
    await new Promise(r => setTimeout(r, 400));
    const btn2 = document.querySelector('#right-queue-body .q-withdraw');
    if (btn2) btn2.click();
    await new Promise(r => setTimeout(r, 800));
    const feedback = [...document.querySelectorAll('#right-queue-body .q-feedback')].map(x => x.textContent).join(' | ');
    const allWithdraws = window.__smoke4a.calls().withdraw;
    window.__smoke4a.setMode('withdraw', 'ok');
    return { items, withdraw, afterSuccess, feedback, hasBtn2: !!btn2, allWithdraws, body: document.getElementById('right-queue-body').textContent.replace(/\s+/g, ' ').slice(0,300) };
  })()`);
  check("QUEUE_DRAWER_POSITIONS_WITHDRAW", queue.items.length >= 3 && /正在执行|进行中/.test(queue.items[0].text) && /第一条/.test(queue.items[1].text) && queue.items[1].hasWithdraw === true && /第二条/.test(queue.items[2].text) && queue.items[2].hasWithdraw === false && queue.withdraw && queue.withdraw[1] === "q-a" && queue.afterSuccess.length === 2 && !queue.afterSuccess.some(t => /第一条/.test(t)) && /撤回无效：/.test(queue.feedback), queue);

  // ---------- 失效 operator 卡：动作隐藏、原因可见 ----------
  const expired = await js(`(async () => {
    window.__smoke4a.emitOperatorExpired({ id: 'op-locate', reason: '请求已失效原因' });
    await new Promise(r => setTimeout(r, 400));
    const card = document.querySelector('.op-request[data-request-id="op-locate"]');
    const actions = card ? card.querySelector('.op-actions') : null;
    const buttons = card ? [...card.querySelectorAll('.op-actions button')].map(b => ({ hidden: b.hidden, disabled: b.disabled })) : [];
    return {
      state: card && card.getAttribute('data-state'),
      actionsHidden: actions ? actions.hidden : null,
      buttons,
      note: card && (card.querySelector('.op-note') || {}).textContent,
      container: !!card,
    };
  })()`);
  check("EXPIRED_OPERATOR_ACTIONS_HIDDEN_REASON_VISIBLE", expired.state === "expired" && expired.container === true && expired.actionsHidden === true && expired.buttons.length >= 1 && expired.buttons.every(b => b.hidden === true && b.disabled === true) && /请求已失效原因/.test(expired.note), expired);

  // ---------- 左树单计数 ----------
  const tree = await js(`(async () => {
    window.__smoke4a.emitRoleState({ roleId: 'A', projectRoot: '/fixture4a', runtime: 'claude', busy: true, running: { id: 'run-b', summary: '工作', kind: 'message' }, queue: [{ id: 'q-1', summary: '排1', kind: 'message' }, { id: 'q-2', summary: '排2', kind: 'message' }] });
    await new Promise(r => setTimeout(r, 350));
    const item = document.querySelector('#role-tree .tree-item[data-role-id="A"]');
    const count = item.querySelector('.ti-count');
    const status = item.querySelector('.ti-status');
    return { count: count && count.textContent, title: count && count.getAttribute('title'), aria: count && count.getAttribute('aria-label'), status: status && status.textContent, statusTitle: status && status.getAttribute('title') };
  })()`);
  check("TREE_SINGLE_BADGE", tree.count === "3" && /当前工作 1 项，排队 2 项/.test(tree.title || "") && /当前工作 1 项，排队 2 项/.test(tree.aria || "") && /工作中/.test(tree.status) && !/待办/.test(tree.status), tree);

  // ---------- console / CSP / 截图 ----------
  const csp = await js(`(window.__ansCspViolations || [])`);
  const errors = report.console.filter((m) => String(m.level) === "error" || m.level === 3);
  check("NO_CSP_VIOLATIONS", Array.isArray(csp) && csp.length === 0, csp.length);
  check("NO_CONSOLE_ERRORS", errors.length === 0, errors);
  check("NO_DID_FAIL_LOAD", report.didFail.length === 0);
  try {
    const img = await wc.capturePage();
    if (!img.isEmpty()) {
      const p = path.join(OUT, "phase4a.png");
      fs.writeFileSync(p, img.toPNG());
      report.screenshot = { path: p, bytes: fs.statSync(p).size };
      check("SCREENSHOT", true, report.screenshot);
    } else check("SCREENSHOT", false, "empty");
  } catch (e) { check("SCREENSHOT", false, String(e)); }

  const failures = report.checks.filter((c) => !c.value);
  report.summary = { total: report.checks.length, passed: report.checks.length - failures.length, failed: failures.length };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("SMOKE_SUMMARY " + JSON.stringify(report.summary));
  console.log(failures.length === 0 ? "SMOKE_DONE=1" : "SMOKE_DONE=0");
  win.destroy();
  app.exit(failures.length === 0 ? 0 : 1);
}
app.whenReady().then(main).catch((err) => {
  console.error("SMOKE_FATAL", (err && err.stack) || err);
  try { fs.writeFileSync(path.join(OUT, "fatal.txt"), String((err && err.stack) || err)); } catch {}
  app.exit(2);
});
