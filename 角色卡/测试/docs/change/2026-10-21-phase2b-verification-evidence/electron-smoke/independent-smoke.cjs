#!/usr/bin/env node
/**
 * 测试角色独立编写的 Phase 2b file:// 冒烟（不复用桌面UI 的脚本）。
 *
 * 覆盖：html.dark、#sc-allow 边界 --input、focus-visible 2px/3px、
 * primary hover/active 计算色（CDP forcePseudoState）、引擎 combobox/listbox/option
 * 与键盘、960 窄档 scope、IME 保护、确认卡默认焦点、侧栏 resizable、
 * 无 console/CSP 违规。
 */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const REPO = "/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
const ENTRY = path.join(REPO, "app/renderer/dist/src/index.html");
const PRELOAD = path.join(REPO, "app/preload.cjs");
const OUT_DIR = "/tmp/ans-p2b-smoke-output";
const USER_DATA = "/tmp/ans-p2b-smoke-userdata";

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.rmSync(USER_DATA, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
app.setPath("userData", USER_DATA);

const report = {
  startedAt: new Date().toISOString(),
  versions: {},
  checks: [],
  consoleMessages: [],
  didFailLoad: [],
  preloadErrors: [],
  renderGone: [],
  pageCspViolations: null,
  screenshot: null,
};

function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail === undefined ? null : detail });
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  report.versions = {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
  };
  console.log("VERSIONS", JSON.stringify(report.versions));

  const win = new BrowserWindow({
    width: 1360, height: 860, useContentSize: true, show: false,
    backgroundColor: "#14171a",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: PRELOAD },
  });
  const wc = win.webContents;
  wc.on("console-message", (...args) => {
    let level, message, line, sourceId;
    if (args[0] && typeof args[0] === "object" && "message" in args[0]) {
      level = args[0].level; message = args[0].message; line = args[0].lineNumber; sourceId = args[0].sourceId;
    } else { level = args[1]; message = args[2]; line = args[3]; sourceId = args[4]; }
    report.consoleMessages.push({ level, message, line, sourceId });
    console.log(`CONSOLE[${level}] ${message} (${sourceId}:${line})`);
  });
  wc.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
    report.didFailLoad.push({ code, description, url, isMainFrame });
  });
  wc.on("preload-error", (_e, preloadPath, error) => report.preloadErrors.push({ preloadPath, error: String(error) }));
  wc.on("render-process-gone", (_e, details) => report.renderGone.push(details));

  await win.loadFile(ENTRY);
  await sleep(350);

  const js = (code) => wc.executeJavaScript(code, true);

  // ---- CDP：强制伪类（hover/active/focus-visible） ----
  let cdpReady = false;
  try {
    wc.debugger.attach("1.3");
    await wc.debugger.sendCommand("DOM.enable");
    await wc.debugger.sendCommand("CSS.enable");
    cdpReady = true;
  } catch (err) {
    console.log("CDP_ATTACH_FAILED", String(err));
  }
  async function forcePseudo(selector, classes) {
    if (!cdpReady) return false;
    const doc = await wc.debugger.sendCommand("DOM.getDocument", { depth: 1 });
    const found = await wc.debugger.sendCommand("DOM.querySelector", { nodeId: doc.root.nodeId, selector });
    if (!found.nodeId) return false;
    await wc.debugger.sendCommand("CSS.forcePseudoState", { nodeId: found.nodeId, forcedPseudoClasses: classes });
    return true;
  }
  async function clearPseudo(selector) {
    return forcePseudo(selector, []);
  }
  async function computed(selector, props) {
    return js(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const cs = getComputedStyle(el);
      const out = {};
      for (const p of ${JSON.stringify(props)}) out[p] = cs.getPropertyValue(p);
      return out;
    })()`);
  }
  check("CDP_PSEUDO_STATE_AVAILABLE", cdpReady);

  async function waitFor(expr, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
      try { last = await js(expr); if (last) return last; } catch (err) { last = String(err); }
      await sleep(50);
    }
    return last;
  }

  // ---- 1. 挂载 / html.dark / 深色面 / 骨架 ----
  await waitFor(`!!document.querySelector('#root > .app-shell') && !!document.getElementById('titlebar')`);
  const base = await js(`(() => {
    const q = (s) => document.querySelector(s);
    const r = (s) => { const el = q(s); return el ? el.getBoundingClientRect() : null; };
    const send = q('#btn-send');
    const csSend = send ? getComputedStyle(send) : null;
    return {
      htmlClass: document.documentElement.className,
      htmlDark: document.documentElement.classList.contains('dark'),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      titlebarH: r('#titlebar') && r('#titlebar').height,
      sidebarW: r('.col-left') && Math.round(r('.col-left').width),
      capsuleW: r('#composer-capsule') && Math.round(r('#composer-capsule').width),
      roleCount: document.querySelectorAll('#role-tree .tree-item[data-role-id]').length,
      sendDisabled: send && send.disabled,
      sendBg: csSend && csSend.backgroundColor,
      sendColor: csSend && csSend.color,
      sendOpacity: csSend && csSend.opacity,
      sendFontSize: csSend && csSend.fontSize,
      driver: typeof window.__ansRenderer,
      bridge: typeof window.desktop,
      styleTags: document.querySelectorAll('style').length,
    };
  })()`);
  report.base = base;
  check("ROOT_MOUNTED", true);
  check("HTML_DARK_CLASS", base.htmlDark === true && base.colorScheme === "dark", { htmlClass: base.htmlClass, colorScheme: base.colorScheme });
  check("DARK_SURFACE", base.bodyBg === "rgb(20, 23, 26)", base.bodyBg);
  check("LAYOUT_BASELINE", base.titlebarH === 36 && base.sidebarW === 248 && base.capsuleW === 900 && base.roleCount === 5, { titlebarH: base.titlebarH, sidebarW: base.sidebarW, capsuleW: base.capsuleW, roleCount: base.roleCount });
  check("SEND_DISABLED_NEUTRAL", base.sendDisabled === true && base.sendBg === "rgb(37, 42, 48)" && base.sendColor === "rgb(167, 173, 181)" && base.sendOpacity === "1" && base.sendFontSize === "13px", { bg: base.sendBg, color: base.sendColor, opacity: base.sendOpacity, fontSize: base.sendFontSize });
  check("DRIVER_AND_BRIDGE", base.driver === "object" && base.bridge === "object");
  check("NO_STYLE_TAGS_AT_RUNTIME", base.styleTags === 0, base.styleTags);

  // ---- 2. 引擎选择器：ARIA + 键盘 ----
  const engineClosed = await js(`(() => {
    const t = document.getElementById('runtime-select');
    return {
      role: t.getAttribute('role'), haspopup: t.getAttribute('aria-haspopup'),
      controls: t.getAttribute('aria-controls'), expanded: t.getAttribute('aria-expanded'),
      activedesc: t.getAttribute('aria-activedescendant'), value: t.getAttribute('value'),
      label: t.getAttribute('aria-label'), menuRole: document.getElementById('runtime-options').getAttribute('role'),
      menuHidden: document.getElementById('runtime-options').hidden,
    };
  })()`);
  check("ENGINE_CLOSED_ARIA", engineClosed.role === "combobox" && engineClosed.haspopup === "listbox" && engineClosed.controls === "runtime-options" && engineClosed.expanded === "false" && engineClosed.activedesc === null && engineClosed.value === "claude" && /Claude/.test(engineClosed.label) && engineClosed.menuRole === "listbox" && engineClosed.menuHidden === true, engineClosed);

  const engineOpen = await js(`(async () => {
    const t = document.getElementById('runtime-select');
    t.focus();
    t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 80));
    const menu = document.getElementById('runtime-options');
    const options = [...menu.querySelectorAll('[role=option]')];
    return {
      expanded: t.getAttribute('aria-expanded'),
      activedesc: t.getAttribute('aria-activedescendant'),
      hidden: menu.hidden,
      menuRole: menu.getAttribute('role'),
      optionCount: options.length,
      options: options.map((o) => ({ id: o.id, role: o.getAttribute('role'), selected: o.getAttribute('aria-selected'), runtime: o.getAttribute('data-runtime') })),
      width: Math.round(menu.getBoundingClientRect().width),
      direction: menu.getAttribute('data-direction'),
    };
  })()`);
  report.engineOpen = engineOpen;
  check("ENGINE_OPEN_LISTBOX_OPTIONS", engineOpen.expanded === "true" && engineOpen.hidden === false && engineOpen.menuRole === "listbox" && engineOpen.optionCount === 3 && engineOpen.options.every((o) => o.role === "option" && o.runtime) && engineOpen.options.find((o) => o.runtime === "claude").selected === "true", engineOpen);
  check("ENGINE_OPEN_ARIA_ACTIVEDESC", engineOpen.activedesc === "runtime-option-claude", engineOpen.activedesc);

  const engineKeys = await js(`(async () => {
    const t = document.getElementById('runtime-select');
    const menu = document.getElementById('runtime-options');
    const key = (k) => t.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    key('ArrowUp');
    await new Promise((r) => setTimeout(r, 40));
    const afterUp = t.getAttribute('aria-activedescendant');
    key('Home');
    await new Promise((r) => setTimeout(r, 40));
    const afterHome = t.getAttribute('aria-activedescendant');
    key('End');
    await new Promise((r) => setTimeout(r, 40));
    const afterEnd = t.getAttribute('aria-activedescendant');
    key('Enter');
    await new Promise((r) => setTimeout(r, 120));
    const afterEnter = {
      runtime: window.__ansRenderer.state.runtime,
      value: t.getAttribute('value'),
      label: t.getAttribute('aria-label'),
      expanded: t.getAttribute('aria-expanded'),
      hidden: menu.hidden,
      active: document.activeElement && document.activeElement.id,
      selectedClaude: document.getElementById('runtime-option-claude').getAttribute('aria-selected'),
    };
    // Escape：重新打开后关闭并回触发器
    key('ArrowDown');
    await new Promise((r) => setTimeout(r, 60));
    const reopened = t.getAttribute('aria-expanded');
    const escPrevented = !key('Escape');
    await new Promise((r) => setTimeout(r, 80));
    const afterEsc = { expanded: t.getAttribute('aria-expanded'), hidden: menu.hidden, active: document.activeElement && document.activeElement.id, prevented: escPrevented };
    // Tab：打开后自然离开（不 preventDefault）
    key('ArrowDown');
    await new Promise((r) => setTimeout(r, 60));
    const tabNotPrevented = key('Tab');
    await new Promise((r) => setTimeout(r, 60));
    const afterTab = { expanded: t.getAttribute('aria-expanded'), hidden: menu.hidden, notPrevented: tabNotPrevented };
    // 恢复 Claude（End 打开在 claude，Enter 提交不再变更），避免影响后续断言
    t.focus();
    key('End');
    await new Promise((r) => setTimeout(r, 40));
    key('Enter');
    await new Promise((r) => setTimeout(r, 120));
    return { afterUp, afterHome, afterEnd, afterEnter, reopened, afterEsc, afterTab, restored: window.__ansRenderer.state.runtime };
  })()`);
  report.engineKeys = engineKeys;
  check("ENGINE_KEYBOARD_BROWSE", engineKeys.afterUp === "runtime-option-codex" && engineKeys.afterHome === "runtime-option-pi" && engineKeys.afterEnd === "runtime-option-claude", { up: engineKeys.afterUp, home: engineKeys.afterHome, end: engineKeys.afterEnd });
  check("ENGINE_KEYBOARD_SELECT", engineKeys.afterEnter.runtime === "claude" && engineKeys.afterEnter.value === "claude" && engineKeys.afterEnter.expanded === "false" && engineKeys.afterEnter.hidden === true && engineKeys.afterEnter.active === "runtime-select" && engineKeys.afterEnter.selectedClaude === "true", engineKeys.afterEnter);
  check("ENGINE_ESC_CLOSES_AND_FOCUS_RETURNS", engineKeys.reopened === "true" && engineKeys.afterEsc.expanded === "false" && engineKeys.afterEsc.hidden === true && engineKeys.afterEsc.active === "runtime-select", engineKeys.afterEsc);
  check("ENGINE_TAB_LEAVES_NATURALLY", engineKeys.afterTab.expanded === "false" && engineKeys.afterTab.hidden === true && engineKeys.afterTab.notPrevented === true, engineKeys.afterTab);

  // ---- 3. 侧栏 resizable ----
  const drag = await js(`(() => {
    const resizer = document.getElementById('sidebar-resizer');
    const width = () => Math.round(document.querySelector('.col-left').getBoundingClientRect().width);
    const opts = (x) => ({ bubbles: true, cancelable: true, clientX: x, clientY: 400, button: 0, pointerId: 9, pointerType: 'mouse', isPrimary: true });
    const before = width();
    resizer.dispatchEvent(new PointerEvent('pointerdown', opts(300)));
    resizer.dispatchEvent(new PointerEvent('pointermove', opts(380)));
    resizer.dispatchEvent(new PointerEvent('pointerup', opts(380)));
    return { before, after: width(), aria: resizer.getAttribute('aria-valuenow'), stored: localStorage.getItem('ans.sidebar.width') };
  })()`);
  await sleep(100);
  const dragSettled = await js(`Math.round(document.querySelector('.col-left').getBoundingClientRect().width)`);
  check("SIDEBAR_DRAG_328", drag.before === 248 && drag.after === 328 && dragSettled === 328 && drag.aria === "328" && drag.stored === "328", { ...drag, settled: dragSettled });
  const dbl = await js(`(() => { const r = document.getElementById('sidebar-resizer'); r.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })); return { w: Math.round(document.querySelector('.col-left').getBoundingClientRect().width), aria: r.getAttribute('aria-valuenow') }; })()`);
  check("SIDEBAR_DBLCLICK_248", dbl.w === 248 && dbl.aria === "248", dbl);
  const kb = await js(`(() => {
    const r = document.getElementById('sidebar-resizer'); r.focus();
    const k = (key, shiftKey=false) => r.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
    k('ArrowRight', true); const shifted = Math.round(document.querySelector('.col-left').getBoundingClientRect().width);
    k('ArrowLeft'); const plain = Math.round(document.querySelector('.col-left').getBoundingClientRect().width);
    k('ArrowRight'); const back = Math.round(document.querySelector('.col-left').getBoundingClientRect().width);
    return { shifted, plain, back };
  })()`);
  check("SIDEBAR_KEYBOARD_STEPS", kb.shifted === 272 && kb.plain === 264 && kb.back === 272, kb);
  const collapse = await js(`(async () => {
    document.getElementById('sidebar-collapse').click();
    const side = document.querySelector('.col-left');
    let width = null;
    for (let i = 0; i < 80; i++) { width = side ? Math.round(side.getBoundingClientRect().width) : null; if (width === 0) break; await new Promise((r) => requestAnimationFrame(r)); }
    return { collapsed: document.querySelector('.app').classList.contains('is-sidebar-collapsed'), width, expandHidden: document.getElementById('sidebar-expand').hidden, stored: localStorage.getItem('ans.sidebar.collapsed') };
  })()`);
  const expand = await js(`(async () => {
    document.getElementById('sidebar-expand').click();
    const side = document.querySelector('.col-left');
    let width = null;
    for (let i = 0; i < 80; i++) { width = side ? Math.round(side.getBoundingClientRect().width) : null; if (width === 272) break; await new Promise((r) => requestAnimationFrame(r)); }
    return { collapsed: document.querySelector('.app').classList.contains('is-sidebar-collapsed'), width, stored: localStorage.getItem('ans.sidebar.collapsed') };
  })()`);
  check("SIDEBAR_COLLAPSE", collapse.collapsed === true && collapse.width === 0 && collapse.expandHidden === false && collapse.stored === "1", collapse);
  check("SIDEBAR_EXPAND_KEEPS_272", expand.collapsed === false && expand.width === 272 && expand.stored === "0", expand);

  // ---- 4. 抽屉 ----
  const drawer = await js(`(async () => {
    document.getElementById('tab-card').click();
    for (let i = 0; i < 80; i++) { if (document.getElementById('right-drawer')) break; await new Promise((r) => setTimeout(r, 30)); }
    await new Promise((r) => setTimeout(r, 220));
    const d = document.getElementById('right-drawer');
    const opened = d ? { width: Math.round(d.getBoundingClientRect().width), role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), focus: document.activeElement && document.activeElement.id } : { missing: true };
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    for (let i = 0; i < 80; i++) { if (!document.getElementById('right-drawer')) break; await new Promise((r) => setTimeout(r, 30)); }
    await new Promise((r) => setTimeout(r, 60));
    return { opened, closed: !document.getElementById('right-drawer'), focusAfter: document.activeElement && document.activeElement.id };
  })()`);
  check("DRAWER_424_ESC_FOCUS", drawer.opened.width === 424 && drawer.opened.role === "dialog" && drawer.opened.modal === "true" && drawer.opened.focus === "drawer-close" && drawer.closed === true && drawer.focusAfter === "tab-card", drawer);

  // ---- 5. 确认卡：640/默认焦点/边界 --input/主按钮色 ----
  const confirm = await js(`(async () => {
    window.__ansRenderer.openConfirmDemo({ command: 'echo "phase2b"' });
    for (let i = 0; i < 80; i++) { if (document.getElementById('shell-confirm')) break; await new Promise((r) => setTimeout(r, 30)); }
    await new Promise((r) => setTimeout(r, 260));
    const card = document.getElementById('shell-confirm');
    if (!card) return { missing: true };
    const allow = document.getElementById('sc-allow');
    const deny = document.getElementById('sc-deny');
    const csAllow = getComputedStyle(allow);
    const csDeny = getComputedStyle(deny);
    return {
      width: Math.round(card.getBoundingClientRect().width),
      focus: document.activeElement && document.activeElement.id,
      command: document.getElementById('sc-command').textContent,
      allowBorder: csAllow.borderTopColor,
      allowBorderWidth: csAllow.borderTopWidth,
      allowFontSize: csAllow.fontSize,
      denyBg: csDeny.backgroundColor,
      denyColor: csDeny.color,
    };
  })()`);
  report.confirm = confirm;
  check("CONFIRM_640_DEFAULT_FOCUS_DENY", confirm.width === 640 && confirm.focus === "sc-deny", { width: confirm.width, focus: confirm.focus });
  check("CONFIRM_COMMAND_VERBATIM", confirm.command === 'echo "phase2b"', confirm.command);
  check("CONFIRM_ALLOW_BORDER_INPUT", confirm.allowBorder === "rgb(107, 117, 126)" && confirm.allowBorderWidth === "1px", { border: confirm.allowBorder, width: confirm.allowBorderWidth });
  check("CONFIRM_DENY_PRIMARY_BG", confirm.denyBg === "rgb(111, 160, 139)", confirm.denyBg);
  check("BUTTON_FONT_13", confirm.allowFontSize === "13px", confirm.allowFontSize);

  // ---- 6. focus-visible 环（CDP 强制伪类） ----
  const ringTargets = [
    ["#sc-allow", "FOCUS_RING_BUTTON_OUTLINE"],
    ["#sc-deny", "FOCUS_RING_BUTTON_DEFAULT"],
  ];
  for (const [sel, name] of ringTargets) {
    const forced = await forcePseudo(sel, ["focus-visible"]);
    await sleep(300); // transition-colors 含 outline-color（120ms），等过渡结束再读
    const cs = await computed(sel, ["outline-width", "outline-style", "outline-color", "outline-offset"]);
    await clearPseudo(sel);
    check(name, forced && cs && cs["outline-width"] === "2px" && cs["outline-style"] === "solid" && cs["outline-color"] === "rgb(111, 160, 139)" && cs["outline-offset"] === "3px", { forced, ...cs });
  }
  // 输入区 Textarea 的 focus-visible 环
  {
    const forced = await forcePseudo("#inp-message", ["focus-visible"]);
    await sleep(300);
    const cs = await computed("#inp-message", ["outline-width", "outline-style", "outline-color", "outline-offset"]);
    await clearPseudo("#inp-message");
    check("FOCUS_RING_TEXTAREA", forced && cs && cs["outline-width"] === "2px" && cs["outline-style"] === "solid" && cs["outline-color"] === "rgb(111, 160, 139)" && cs["outline-offset"] === "3px", { forced, ...cs });
  }
  // 引擎触发器（shell 自定义规则）
  {
    const forced = await forcePseudo("#runtime-select", ["focus-visible"]);
    const cs = await computed("#runtime-select", ["outline-width", "outline-style", "outline-color", "outline-offset"]);
    await clearPseudo("#runtime-select");
    check("FOCUS_RING_ENGINE_TRIGGER", forced && cs && cs["outline-width"] === "2px" && cs["outline-style"] === "solid" && cs["outline-color"] === "rgb(111, 160, 139)" && cs["outline-offset"] === "3px", { forced, ...cs });
  }
  // 确认卡默认拒绝环（静态规则）
  {
    const cs = await computed("#sc-deny", ["outline-width", "outline-style", "outline-color", "outline-offset"]);
    check("CONFIRM_DENY_STATIC_RING", cs && cs["outline-width"] === "2px" && cs["outline-style"] === "solid" && cs["outline-color"] === "rgb(111, 160, 139)" && cs["outline-offset"] === "3px", cs);
  }

  // ---- 7. primary hover/active（真实鼠标事件；transition-colors 120ms 后读数） ----
  {
    const rect = await js(`(() => { const d = document.getElementById('sc-deny'); const r = d.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
    wc.sendInputEvent({ type: "mouseMove", x: rect.x, y: rect.y });
    await sleep(200);
    const hover = await js(`(() => { const d = document.getElementById('sc-deny'); const cs = getComputedStyle(d); return { hover: d.matches(':hover'), bg: cs.backgroundColor }; })()`);
    wc.sendInputEvent({ type: "mouseDown", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    await sleep(200);
    const active = await js(`(() => { const d = document.getElementById('sc-deny'); const cs = getComputedStyle(d); return { active: d.matches(':active'), bg: cs.backgroundColor }; })()`);
    wc.sendInputEvent({ type: "mouseUp", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    await sleep(250); // mouseUp 完成点击 → close("deny")，卡片关闭
    check("PRIMARY_HOVER_SUCCESS_HOVER", hover.hover === true && hover.bg === "rgb(127, 178, 155)", hover);
    check("PRIMARY_ACTIVE_TOKEN", active.active === true && active.bg === "rgb(94, 143, 122)", active);
    const cardClosed = await js(`!document.querySelector('[data-slot="alert-dialog-content"]')`);
    check("CONFIRM_MOUSE_DENY_CLOSED", cardClosed === true);
  }

  // ---- 8. Checkbox 选中色（临时置 data-checked 读计算色后还原） ----
  {
    const res = await js(`(async () => {
      const root = document.querySelector('[data-slot="checkbox"]');
      if (!root) return { missing: true };
      const before = root.getAttribute('data-checked');
      root.setAttribute('data-checked', '');
      await new Promise((r) => setTimeout(r, 250)); // transition-colors 120ms
      const cs = getComputedStyle(root);
      const out = { bg: cs.backgroundColor, border: cs.borderTopColor, matched: root.matches('[data-checked]') };
      if (before === null) root.removeAttribute('data-checked'); else root.setAttribute('data-checked', before);
      return out;
    })()`);
    check("CHECKBOX_CHECKED_WARNING", res && res.bg === "rgb(196, 161, 95)" && res.border === "rgb(196, 161, 95)", res);
  }

  // 重新打开确认卡后测 Esc=deny（上一节鼠标点击已按拒绝关闭过一次）
  const esc = await js(`(async () => {
    window.__ansRenderer.openConfirmDemo();
    for (let i = 0; i < 80; i++) { if (document.getElementById('shell-confirm')) break; await new Promise((r) => setTimeout(r, 30)); }
    await new Promise((r) => setTimeout(r, 220));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    for (let i = 0; i < 80; i++) { if (!document.querySelector('[data-slot="alert-dialog-content"]')) break; await new Promise((r) => setTimeout(r, 30)); }
    await new Promise((r) => setTimeout(r, 60));
    return window.__ansRenderer.confirmDemo.state();
  })()`);
  check("CONFIRM_ESC_DENY", esc.open === false && esc.lastDecision === "deny", esc.lastDecision);

  // ---- 9. IME 保护 ----
  const ime = await js(`(async () => {
    const inp = document.getElementById('inp-message');
    const status = document.getElementById('composer-demo-status');
    const setValue = (v) => { const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; s.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); };
    setValue('中文候选');
    await new Promise((r) => setTimeout(r, 30));
    const before = status.textContent;
    inp.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '中文候选' }));
    const duringPrevented = !inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 30));
    const during = { prevented: duringPrevented, text: inp.value, status: status.textContent };
    inp.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文候选' }));
    const afterPrevented = !inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 30));
    const after = { prevented: afterPrevented, text: inp.value, status: status.textContent };
    const k229 = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(k229, 'keyCode', { get: () => 229 });
    const k229Prevented = !inp.dispatchEvent(k229);
    let isCompPrevented = null;
    try { isCompPrevented = !inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true })); } catch (e) { isCompPrevented = 'error'; }
    const shiftPrevented = !inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    return { before, during, after, k229Prevented, isCompPrevented, shiftPrevented, sendDisabled: window.__ansRenderer.send.disabled() };
  })()`);
  check("IME_COMPOSITION_ENTER_NOT_SENT", ime.during.prevented === false && ime.during.status === ime.before && ime.during.text === '中文候选', ime.during);
  check("IME_AFTER_COMMIT_ENTER_INTERCEPTED", ime.after.prevented === true && /本条未发送/.test(ime.after.status), ime.after);
  check("IME_GUARDS_229_ISCOMPOSING", ime.k229Prevented === false && ime.isCompPrevented === false && ime.shiftPrevented === false, { k229: ime.k229Prevented, isComposing: ime.isCompPrevented, shift: ime.shiftPrevented });
  check("SEND_STILL_DISABLED", ime.sendDisabled === true);

  // ---- 10. 960 窄档 scope（先把侧栏复位 248，排除上一步 272 的干扰） ----
  await js(`document.getElementById('sidebar-resizer').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))`);
  await sleep(120);
  win.setContentSize(960, 620);
  await sleep(450);
  const narrow = await js(`(() => {
    const scope = document.getElementById('composer-scope');
    const demo = document.querySelector('.composer-scope-demo');
    const pane = document.querySelector('.chat-pane');
    const cap = document.getElementById('composer-capsule');
    const csDemo = demo ? getComputedStyle(demo) : null;
    const csScope = scope ? getComputedStyle(scope) : null;
    return {
      inner: [window.innerWidth, window.innerHeight],
      noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      paneW: pane ? Math.round(pane.getBoundingClientRect().width) : null,
      capsuleW: cap ? Math.round(cap.getBoundingClientRect().width) : null,
      demoDisplay: csDemo && csDemo.display,
      scopeDisplay: csScope && csScope.display,
      scopeText: scope && scope.textContent.trim(),
      scopeFits: scope ? scope.scrollWidth <= scope.clientWidth : null,
      headH: Math.round(document.querySelector('.chat-head').getBoundingClientRect().height),
    };
  })()`);
  report.narrow = narrow;
  check("NARROW_960_NO_OVERFLOW", narrow.inner[0] === 960 && narrow.noOverflow === true && narrow.paneW === 664 && narrow.capsuleW === 664 && narrow.headH === 60, narrow);
  check("NARROW_SCOPE_DEMO_HIDDEN", narrow.demoDisplay === "none" && narrow.scopeDisplay !== "none" && /产品/.test(narrow.scopeText) && /Claude/.test(narrow.scopeText) && narrow.scopeFits === true, { demoDisplay: narrow.demoDisplay, scope: narrow.scopeText, fits: narrow.scopeFits });

  // ---- 11. 无 console/CSP 违规 ----
  const csp = await js(`(window.__ansCspViolations || [])`);
  report.pageCspViolations = csp;
  check("PAGE_CSP_VIOLATIONS_ZERO", Array.isArray(csp) && csp.length === 0, csp && csp.length);
  const errorConsoles = report.consoleMessages.filter((m) => String(m.level) === "error" || m.level === 3);
  const cspConsoles = report.consoleMessages.filter((m) => /Content Security Policy|Refused to|CORS|Failed to load module/i.test(String(m.message)));
  check("NO_CONSOLE_ERRORS", errorConsoles.length === 0, errorConsoles);
  check("NO_CSP_OR_MODULE_CONSOLE_ERRORS", cspConsoles.length === 0, cspConsoles);
  check("NO_DID_FAIL_LOAD", report.didFailLoad.length === 0, report.didFailLoad);
  check("NO_PRELOAD_ERRORS", report.preloadErrors.length === 0, report.preloadErrors);
  check("NO_RENDER_GONE", report.renderGone.length === 0, report.renderGone);

  // ---- 12. 截图 ----
  try {
    // 回到 1360 档再截图
    win.setContentSize(1360, 860);
    await sleep(300);
    const img = await wc.capturePage();
    if (!img.isEmpty()) {
      const p = path.join(OUT_DIR, "smoke-1360-default.png");
      fs.writeFileSync(p, img.toPNG());
      report.screenshot = { path: p, bytes: fs.statSync(p).size };
      check("SCREENSHOT_CAPTURED", true, report.screenshot);
    } else check("SCREENSHOT_CAPTURED", false, "empty image");
  } catch (err) { check("SCREENSHOT_CAPTURED", false, String(err)); }

  report.finishedAt = new Date().toISOString();
  const failures = report.checks.filter((c) => !c.value);
  report.summary = { total: report.checks.length, passed: report.checks.length - failures.length, failed: failures.length };
  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`SMOKE_SUMMARY ${JSON.stringify(report.summary)}`);
  console.log(failures.length === 0 ? "SMOKE_DONE=1" : "SMOKE_DONE=0");
  try { wc.debugger.detach(); } catch {}
  win.destroy();
  app.exit(failures.length === 0 ? 0 : 1);
}

app.whenReady().then(main).catch((err) => {
  console.error("SMOKE_FATAL", (err && err.stack) || err);
  try { fs.writeFileSync(path.join(OUT_DIR, "fatal.txt"), String((err && err.stack) || err)); } catch {}
  app.exit(2);
});
