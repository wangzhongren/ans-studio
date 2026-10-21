#!/usr/bin/env node
/**
 * 测试角色独立编写的 Phase 3A file:// 冒烟（不复用桌面UI 脚本）。
 * 离线 IPC 替身（/tmp/ans-p3a-smoke-preload.cjs），contextIsolation:true。
 *
 * 覆盖：220 事件虚拟窗口（挂载行数/spacer）、operator toolCallId 锚点、
 * 状态优先级（等待确认>工作中>错误>空闲）、Markdown XSS 负例、虚拟卸载重挂
 * 状态保持（工具组 details / choice 选中）、IME+真实发送+附件、rowModelDebug/paneDebug。
 */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const REPO = "/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
const ENTRY = path.join(REPO, "app/renderer/dist/src/index.html");
const PRELOAD = path.join(__dirname, "ans-p3a-smoke-preload.cjs");
const OUT_DIR = "/tmp/ans-p3a-smoke-output";
const USER_DATA = "/tmp/ans-p3a-smoke-userdata";

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.rmSync(USER_DATA, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
app.setPath("userData", USER_DATA);

const report = { checks: [], consoleMessages: [], didFailLoad: [], preloadErrors: [], renderGone: [], csp: null };
function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail === undefined ? null : detail });
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const win = new BrowserWindow({
    width: 1360, height: 860, useContentSize: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: PRELOAD },
  });
  const wc = win.webContents;
  wc.on("console-message", (...args) => {
    let level, message;
    if (args[0] && typeof args[0] === "object" && "message" in args[0]) { level = args[0].level; message = args[0].message; }
    else { level = args[1]; message = args[2]; }
    report.consoleMessages.push({ level, message });
    if (String(level) === "error") console.log(`CONSOLE_ERROR ${message}`);
  });
  wc.on("did-fail-load", (_e, code, description, url) => report.didFailLoad.push({ code, description, url }));
  wc.on("preload-error", (_e, p, err) => report.preloadErrors.push({ p, err: String(err) }));
  wc.on("render-process-gone", (_e, d) => report.renderGone.push(d));

  await win.loadFile(ENTRY);
  await sleep(400);
  const js = (code) => wc.executeJavaScript(code, true);
  async function waitFor(expr, timeout = 10000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      try { last = await js(expr); if (last) return last; } catch (e) { last = String(e); }
      await sleep(60);
    }
    return last;
  }

  // ---- 0. 挂载 / 桥 ----
  await waitFor(`!!document.querySelector('#root > .app-shell')`);
  const init = await js(`(() => ({
    bridge: typeof window.desktop,
    smoke: typeof window.__smoke,
    driver: typeof window.__ansRenderer,
    dark: document.documentElement.classList.contains('dark'),
    ansi: typeof window.ANSMarkdown,
    counts: window.__smoke.counts(),
  }))()`);
  check("MOUNT_AND_BRIDGE", init.bridge === "object" && init.smoke === "object" && init.driver === "object" && init.dark === true, init);
  check("ANSMARKDOWN_PRESENT", init.ansi === "object");
  check("SUBSCRIPTIONS_INSTALLED", init.counts.event >= 1 && init.counts.roleState >= 1 && init.counts.history >= 1, init.counts);

  // ---- 1. 加载项目 + 开会话 ----
  const loaded = await js(`(async () => {
    await window.__ansRenderer.loadProject('/fixture');
    return { projectRoot: window.__ansRenderer.state.projectRoot, roles: window.__ansRenderer.state.roles.map(r => r.roleId), primary: window.__ansRenderer.state.primaryRoleId };
  })()`);
  check("LOAD_PROJECT", loaded.projectRoot === "/fixture" && loaded.roles.length === 3 && loaded.primary === "A", loaded);
  const opened = await js(`(async () => {
    const ok = await window.__ansRenderer.selectRole('A');
    return { ok, open: window.__ansRenderer.state.sessionOpenRoleId, selected: window.__ansRenderer.state.selectedRoleId, pane: !!document.querySelector('#chat .chat-pane[data-role-id="A"]') };
  })()`);
  await sleep(300);
  check("SELECT_ROLE_OPENS_SESSION", opened.ok === true && opened.open === "A" && opened.selected === "A" && opened.pane === true, opened);

  // ---- 2. 220 事件虚拟窗口 ----
  await js(`(() => {
    const events = [];
    for (let i = 0; i < 220; i++) events.push({ roleId: 'A', projectRoot: '/fixture', event: { kind: 'message', summary: '第 ' + i + ' 行 **粗体**' } });
    window.__smoke.emitEvents(events);
  })()`);
  await waitFor(`window.__ansRenderer.rowModelDebug('A').count >= 220`);
  await sleep(400);
  const virt = await js(`(() => {
    const dbg = window.__ansRenderer.rowModelDebug('A');
    const pane = document.querySelector('#chat .chat-pane[data-role-id="A"]');
    const rows = pane ? [...pane.querySelectorAll(':scope > .chat-row')] : [];
    const spacers = pane ? [...pane.querySelectorAll(':scope > .virt-spacer')] : [];
    const chat = document.getElementById('chat');
    return {
      count: dbg.count, lastIndex: dbg.lastIndex, rowGap: dbg.rowGap,
      mounted: rows.length,
      spacerCount: spacers.length,
      spacerHeights: spacers.map(s => Math.round(s.getBoundingClientRect().height)),
      paneHeight: pane ? Math.round(pane.getBoundingClientRect().height) : null,
      chat: chat ? { scrollTop: Math.round(chat.scrollTop), scrollHeight: Math.round(chat.scrollHeight), clientHeight: Math.round(chat.clientHeight) } : null,
      rowKinds: [...new Set(rows.map(r => r.getAttribute('data-row-kind')))],
    };
  })()`);
  report.virtual = virt;
  check("VIRTUAL_220_ROWS", virt.count === 220 && virt.lastIndex === 219 && virt.rowGap === 16, { count: virt.count, lastIndex: virt.lastIndex, rowGap: virt.rowGap });
  check("VIRTUAL_WINDOWED_MOUNT", virt.mounted > 0 && virt.mounted < 120 && virt.spacerCount === 2 && virt.spacerHeights[0] > 0, { mounted: virt.mounted, spacers: virt.spacerHeights });
  check("VIRTUAL_TAIL_AT_BOTTOM", virt.chat && Math.abs(virt.chat.scrollHeight - virt.chat.scrollTop - virt.chat.clientHeight) <= 24, virt.chat);

  // ---- 3. operator toolCallId 锚点 ----
  const anchor = await js(`(async () => {
    window.__smoke.emitEvent({ roleId: 'A', projectRoot: '/fixture', event: { kind: 'tool_call', summary: 'run_shell：echo anchor', detail: { toolCallId: 'call-anchor', target: '/fixture/scripts/run.sh', status: 'completed' } } });
    window.__smoke.emitEvent({ roleId: 'A', projectRoot: '/fixture', event: { kind: 'message', summary: 'after-tool 标记行' } });
    await new Promise(r => setTimeout(r, 200));
    window.__ansRenderer.appendOperatorRequest({ id: 'op-anchor', roleId: 'A', toolCallId: 'call-anchor', turnId: 'turn-1', request: { kind: 'choice', title: '请选择一项', detail: '锚点测试', options: [{ id: 'a', label: '选项 A' }, { id: 'b', label: '选项 B' }] } });
    await new Promise(r => setTimeout(r, 300));
    const dbg = window.__ansRenderer.rowModelDebug('A');
    const op = document.querySelector('.op-request[data-request-id="op-anchor"]');
    const opRow = op ? op.closest('.chat-row') : null;
    const prev = opRow ? opRow.previousElementSibling : null;
    const next = opRow ? opRow.nextElementSibling : null;
    return {
      count: dbg.count, operators: dbg.operators,
      opExists: !!op, state: op && op.getAttribute('data-state'),
      prevKind: prev && prev.getAttribute('data-row-kind'),
      prevText: prev ? (prev.textContent || '').slice(0, 80) : '',
      nextKind: next && next.getAttribute('data-row-kind'),
      nextText: next ? (next.textContent || '').slice(0, 80) : '',
      options: op ? [...op.querySelectorAll('.op-options label')].map(l => ({ label: l.textContent.trim(), height: Math.round(l.getBoundingClientRect().height) })) : [],
    };
  })()`);
  report.anchor = anchor;
  const opIndex = anchor.operators && anchor.operators.find(o => o.requestId === "op-anchor");
  check("OPERATOR_TOOLCALLID_ANCHOR", anchor.opExists === true && opIndex && opIndex.index === anchor.count - 2 && anchor.prevKind === "activities" && anchor.nextKind === "assistant" && /after-tool/.test(anchor.nextText), { count: anchor.count, opIndex, prevKind: anchor.prevKind, prevText: anchor.prevText, nextKind: anchor.nextKind, nextText: anchor.nextText });
  check("OPERATOR_CHOICE_RENDER", anchor.state === "open" && anchor.options.length === 2 && anchor.options.every(o => o.height >= 39), anchor.options);

  // ---- 4. 状态优先级 ----
  const statusA1 = await js(`(async () => {
    window.__smoke.emitRoleState({ roleId: 'A', busy: true, projectRoot: '/fixture' });
    await new Promise(r => setTimeout(r, 150));
    const item = document.querySelector('#role-tree .tree-item[data-role-id="A"] .ti-status');
    return { text: item && item.textContent.trim(), className: item && item.className, chatState: document.getElementById('chat').getAttribute('data-state') };
  })()`);
  check("STATUS_AWAITING_OVER_BUSY", /等待你确认/.test(statusA1.text) && statusA1.chatState === "run", statusA1);
  const statusA2 = await js(`(async () => {
    window.__smoke.emitOperatorExpired({ id: 'op-anchor', reason: '测试失效' });
    await new Promise(r => setTimeout(r, 250));
    const item = document.querySelector('#role-tree .tree-item[data-role-id="A"] .ti-status');
    const op = document.querySelector('.op-request[data-request-id="op-anchor"]');
    return { text: item && item.textContent.trim(), opState: op && op.getAttribute('data-state'), chatState: document.getElementById('chat').getAttribute('data-state') };
  })()`);
  check("STATUS_WORKING_AFTER_EXPIRE", /工作中/.test(statusA2.text) && statusA2.opState === "expired" && statusA2.chatState === "run", statusA2);
  const statusA3 = await js(`(async () => {
    window.__smoke.emitRoleState({ roleId: 'A', busy: false, projectRoot: '/fixture' });
    await new Promise(r => setTimeout(r, 200));
    const item = document.querySelector('#role-tree .tree-item[data-role-id="A"] .ti-status');
    return { text: item && item.textContent.trim(), chatState: document.getElementById('chat').getAttribute('data-state') };
  })()`);
  check("STATUS_IDLE", /空闲/.test(statusA3.text) && statusA3.chatState === "idle", statusA3);
  const statusB = await js(`(async () => {
    await window.__ansRenderer.selectRole('B');
    await new Promise(r => setTimeout(r, 300));
    const item = document.querySelector('#role-tree .tree-item[data-role-id="B"] .ti-status');
    const text = item ? item.textContent.trim() : null;
    const sys = [...document.querySelectorAll('#chat .sys-config')].map(el => ({ text: el.textContent.trim(), color: getComputedStyle(el.querySelector('.sys-text') || el).color }));
    const state = document.getElementById('chat').getAttribute('data-state');
    window.__smoke.emitRoleState({ roleId: 'B', busy: true, projectRoot: '/fixture' });
    await new Promise(r => setTimeout(r, 200));
    const itemBusy = document.querySelector('#role-tree .tree-item[data-role-id="B"] .ti-status');
    const textBusy = itemBusy ? itemBusy.textContent.trim() : null;
    const stateBusy = document.getElementById('chat').getAttribute('data-state');
    return { text, sys, state, textBusy, stateBusy };
  })()`);
  report.statusB = statusB;
  check("STATUS_ERROR_AND_SYS_CONFIG_DANGER", /错误/.test(statusB.text) && statusB.state === "err" && statusB.sys.length > 0 && statusB.sys.some(s => /开启会话失败/.test(s.text) && s.color === "rgb(201, 122, 109)"), { text: statusB.text, state: statusB.state, sys: statusB.sys });
  check("STATUS_WORKING_OVER_PREV_ERROR", /工作中/.test(statusB.textBusy) && statusB.stateBusy === "run", { text: statusB.textBusy, state: statusB.stateBusy });
  await js(`(async () => { await window.__ansRenderer.selectRole('A'); await new Promise(r => setTimeout(r, 300)); window.__smoke.emitRoleState({ roleId: 'B', busy: false, projectRoot: '/fixture' }); })()`);
  await sleep(300);

  // ---- 5. Markdown XSS 负例 + 安全渲染 ----
  const xssText = '安全渲染 <script>window.__xss=1<\\/script> <img src=x onerror="window.__xss=2"> [bad](javascript:alert(1)) [ok](https://example.com) **粗体**';
  const xss = await js(`(async () => {
    window.__smoke.emitEvent({ roleId: 'A', projectRoot: '/fixture', event: { kind: 'message', summary: ${JSON.stringify(xssText)} } });
    await new Promise(r => setTimeout(r, 350));
    const msgs = [...document.querySelectorAll('#chat .msg-assistant')];
    const target = msgs.find(m => (m.textContent || '').includes('安全渲染'));
    const md = window.ANSMarkdown.renderMarkdown('<script>window.__xss=3<\\/script><img src=x onerror=window.__xss=4> [b](javascript:alert(1))');
    return {
      found: !!target,
      scriptCount: target ? target.querySelectorAll('script').length : -1,
      imgCount: target ? target.querySelectorAll('img').length : -1,
      iframeCount: target ? target.querySelectorAll('iframe').length : -1,
      xssFlag: window.__xss === undefined ? 'undefined' : String(window.__xss),
      jsHrefs: target ? [...target.querySelectorAll('a')].map(a => a.getAttribute('href')).filter(h => h && /^javascript:/i.test(h)) : [],
      okLink: target ? [...target.querySelectorAll('a.md-link')].map(a => ({ href: a.getAttribute('href'), rel: a.getAttribute('rel') })) : [],
      hasStrong: target ? !!target.querySelector('strong') : false,
      mdHasScript: /<script/i.test(md), mdHasImg: /<img/i.test(md), mdHasJsHref: /javascript:/i.test(md),
    };
  })()`);
  report.xss = xss;
  check("MARKDOWN_XSS_NEGATIVES", xss.found === true && xss.scriptCount === 0 && xss.imgCount === 0 && xss.iframeCount === 0 && xss.xssFlag === 'undefined' && xss.jsHrefs.length === 0 && xss.mdHasScript === false && xss.mdHasImg === false, xss);
  check("MARKDOWN_SAFE_LINK_AND_FORMAT", xss.okLink.some(l => l.href === 'https://example.com' && /noopener/.test(l.rel || '')) && xss.hasStrong === true, xss.okLink);

  // ---- 6. 虚拟卸载/重挂状态保持（工具组 details + choice 选中） ----
  const preserved = await js(`(async () => {
    const chat = document.getElementById('chat');
    window.__ansRenderer.appendOperatorRequest({ id: 'op-preserve', roleId: 'A', turnId: 'turn-2', request: { kind: 'choice', title: '保持状态', options: [{ id: 'a', label: '选项 A' }, { id: 'b', label: '选项 B' }] } });
    chat.scrollTop = chat.scrollHeight;
    await new Promise(r => setTimeout(r, 350));
    const findGroup = () => [...document.querySelectorAll('#chat .tool-records')].find(el => (el.textContent || '').includes('run_shell')) || null;
    const group = findGroup();
    const op = document.querySelector('.op-request[data-request-id="op-preserve"]');
    if (group) group.querySelector('summary').click();
    const radioB = op ? [...op.querySelectorAll('input[type=radio]')].find(i => i.value === 'b') : null;
    if (radioB) radioB.click();
    await new Promise(r => setTimeout(r, 300));
    const before = {
      groupFound: !!group,
      groupOpen: group ? group.open : null,
      opFound: !!op,
      selectedB: op ? [...op.querySelectorAll('input[type=radio]')].find(i => i.value === 'b').checked : null,
    };
    chat.scrollTop = 0;
    await new Promise(r => setTimeout(r, 450));
    const gone = {
      group: !!findGroup(),
      op: !!document.querySelector('.op-request[data-request-id="op-preserve"]'),
      mounted: document.querySelectorAll('#chat .chat-pane > .chat-row').length,
    };
    chat.scrollTop = chat.scrollHeight;
    await new Promise(r => setTimeout(r, 500));
    const group2 = findGroup();
    const op2 = document.querySelector('.op-request[data-request-id="op-preserve"]');
    const radioB2 = op2 ? [...op2.querySelectorAll('input[type=radio]')].find(i => i.value === 'b') : null;
    return { before, gone, after: { groupOpen: group2 ? group2.open : null, selectedB: radioB2 ? radioB2.checked : null, opOpen: op2 && op2.getAttribute('data-state') } };
  })()`);
  report.preserved = preserved;
  check("VIRTUAL_UNMOUNT_REMOUNT_STATE", preserved.before.groupFound === true && preserved.before.groupOpen === true && preserved.before.opFound === true && preserved.before.selectedB === true && preserved.gone.op === false && preserved.gone.group === false && preserved.after.groupOpen === true && preserved.after.selectedB === true && preserved.after.opOpen === "open", preserved);

  // ---- 7. IME + 真实发送 + 附件 ----
  const ime = await js(`(async () => {
    const inp = document.getElementById('inp-message');
    const setValue = (v) => { const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); };
    window.__smoke.clearSendCalls();
    setValue('你好');
    await new Promise(r => setTimeout(r, 60));
    inp.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '你好' }));
    const duringPrevented = !inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 150));
    const during = { prevented: duringPrevented, calls: window.__smoke.sendCalls().length, text: inp.value };
    inp.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你好' }));
    const afterPrevented = !inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 400));
    const calls = window.__smoke.sendCalls();
    const after = { prevented: afterPrevented, calls: calls.length, args: calls[0] || null, text: inp.value, userBubble: [...document.querySelectorAll('#chat .msg-user')].some(m => (m.textContent || '').includes('你好')) };
    // 附件链路
    document.getElementById('btn-attach-image').click();
    await new Promise(r => setTimeout(r, 300));
    const chip = document.querySelector('#attach-row .attach-chip');
    setValue('带图消息');
    await new Promise(r => setTimeout(r, 60));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 450));
    const calls2 = window.__smoke.sendCalls();
    const attach = { chipBeforeSend: !!chip, calls: calls2.length, args: calls2[1] || null, chipAfter: !!document.querySelector('#attach-row .attach-chip'), rowHidden: document.getElementById('attach-row').hidden };
    // 229 / isComposing / Shift 守护
    const k229 = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(k229, 'keyCode', { get: () => 229 });
    const k229Prevented = !inp.dispatchEvent(k229);
    let isCompPrevented = null;
    try { isCompPrevented = !inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true })); } catch { isCompPrevented = 'error'; }
    const shiftPrevented = !inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    return { during, after, attach, k229Prevented, isCompPrevented, shiftPrevented };
  })()`);
  report.ime = ime;
  check("IME_COMPOSITION_NO_SEND", ime.during.prevented === false && ime.during.calls === 0 && ime.during.text === '你好', ime.during);
  check("IME_SEND_ONCE_WITH_PAYLOAD", ime.after.prevented === true && ime.after.calls === 1 && ime.after.args && ime.after.args[0] === '你好' && Array.isArray(ime.after.args[1]) && ime.after.args[1].length === 0 && ime.after.args[2] && ime.after.args[2].roleId === 'A' && ime.after.args[2].projectRoot === '/fixture' && ime.after.args[3] && typeof ime.after.args[3].clientMessageId === 'string' && ime.after.text === '' && ime.after.userBubble === true, { args: ime.after.args, text: ime.after.text });
  check("ATTACHMENT_CHIP_AND_PAYLOAD", ime.attach.chipBeforeSend === true && ime.attach.calls === 2 && ime.attach.args && Array.isArray(ime.attach.args[1]) && ime.attach.args[1].length === 1 && ime.attach.args[1][0].type === 'image' && ime.attach.args[1][0].mimeType === 'image/png' && ime.attach.chipAfter === false && ime.attach.rowHidden === true, ime.attach);
  check("IME_GUARD_229_ISCOMPOSING_SHIFT", ime.k229Prevented === false && ime.isCompPrevented === false && ime.shiftPrevented === false, { k229: ime.k229Prevented, isComposing: ime.isCompPrevented, shift: ime.shiftPrevented });

  // ---- 8. rowModelDebug / paneDebug 终态 ----
  const dbg = await js(`(() => {
    const rm = window.__ansRenderer.rowModelDebug('A');
    const pd = window.__ansRenderer.paneDebug('A');
    return { rm, pd: pd ? { inChat: pd.inChat, empty: pd.empty, assistant: pd.assistant, currentWork: pd.currentWork, note: pd.note, textLength: (pd.text || '').length } : null };
  })()`);
  report.debug = dbg;
  check("ROW_MODEL_DEBUG", dbg.rm && dbg.rm.rowGap === 16 && dbg.rm.count >= 224 && Array.isArray(dbg.rm.operators), dbg.rm);
  check("PANE_DEBUG", dbg.pd && dbg.pd.inChat === true && dbg.pd.empty === false && dbg.pd.assistant >= 221, dbg.pd);

  // ---- 9. console/CSP ----
  const csp = await js(`(window.__ansCspViolations || [])`);
  report.csp = csp;
  check("PAGE_CSP_VIOLATIONS_ZERO", Array.isArray(csp) && csp.length === 0, csp.length);
  const errors = report.consoleMessages.filter(m => String(m.level) === "error" || m.level === 3);
  check("NO_CONSOLE_ERRORS", errors.length === 0, errors);
  check("NO_DID_FAIL_LOAD", report.didFailLoad.length === 0);
  check("NO_PRELOAD_ERRORS", report.preloadErrors.length === 0);
  check("NO_RENDER_GONE", report.renderGone.length === 0);

  // 截图
  try {
    const img = await wc.capturePage();
    if (!img.isEmpty()) {
      const p = path.join(OUT_DIR, "phase3a-chat.png");
      fs.writeFileSync(p, img.toPNG());
      report.screenshot = { path: p, bytes: fs.statSync(p).size };
      check("SCREENSHOT", true, report.screenshot);
    } else check("SCREENSHOT", false, "empty");
  } catch (e) { check("SCREENSHOT", false, String(e)); }

  report.headCommit = (() => { try { return require("child_process").execSync("git rev-parse HEAD", { cwd: REPO }).toString().trim(); } catch { return null; } })();
  report.finishedAt = new Date().toISOString();
  const failures = report.checks.filter(c => !c.value);
  report.summary = { total: report.checks.length, passed: report.checks.length - failures.length, failed: failures.length };
  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`SMOKE_SUMMARY ${JSON.stringify(report.summary)}`);
  console.log(failures.length === 0 ? "SMOKE_DONE=1" : "SMOKE_DONE=0");
  win.destroy();
  app.exit(failures.length === 0 ? 0 : 1);
}

app.whenReady().then(main).catch((e) => {
  console.error("SMOKE_FATAL", (e && e.stack) || e);
  try { fs.writeFileSync(path.join(OUT_DIR, "fatal.txt"), String((e && e.stack) || e)); } catch {}
  app.exit(2);
});
