#!/usr/bin/env node
/**
 * 测试角色独立编写的 Phase 2 file:// 冒烟（不复用桌面UI 的脚本）。
 *
 * 配置：contextIsolation=true、nodeIntegration=false、sandbox=false、show:false，
 * 真实 app/preload.cjs，加载 app/renderer/dist/src/index.html。
 *
 * 断言：挂载、骨架、CSP/console/did-fail-load、侧栏拖宽/双击/键盘/收起展开、
 * IME 组合 Enter 不发送、抽屉 424/Esc/焦点返回、确认卡 640/默认焦点拒绝/Esc=拒绝。
 *
 * 运行：./node_modules/.bin/electron /tmp/ans-p2-independent-smoke.cjs
 */
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const REPO = "/Users/wangzhongren/code/vibeingcode/解压/ans-runtime";
const ENTRY = path.join(REPO, "app/renderer/dist/src/index.html");
const PRELOAD = path.join(REPO, "app/preload.cjs");
const OUT_DIR = "/tmp/ans-p2-smoke-output";
const USER_DATA = "/tmp/ans-p2-smoke-userdata";

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  report.versions = {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
  };
  console.log("VERSIONS", JSON.stringify(report.versions));

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    useContentSize: true,
    show: false,
    backgroundColor: "#14171a",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: PRELOAD,
    },
  });
  const wc = win.webContents;

  wc.on("console-message", (...args) => {
    // Electron 新老两种事件形状归一
    let level, message, line, sourceId;
    if (args[0] && typeof args[0] === "object" && "message" in args[0]) {
      level = args[0].level;
      message = args[0].message;
      line = args[0].lineNumber;
      sourceId = args[0].sourceId;
    } else {
      level = args[1];
      message = args[2];
      line = args[3];
      sourceId = args[4];
    }
    report.consoleMessages.push({ level, message, line, sourceId });
    console.log(`CONSOLE[${level}] ${message} (${sourceId}:${line})`);
  });
  wc.on("did-fail-load", (_e, code, description, url, isMainFrame) => {
    report.didFailLoad.push({ code, description, url, isMainFrame });
    console.log(`DID_FAIL_LOAD ${code} ${description} ${url} main=${isMainFrame}`);
  });
  wc.on("preload-error", (_e, preloadPath, error) => {
    report.preloadErrors.push({ preloadPath, error: String(error) });
    console.log(`PRELOAD_ERROR ${preloadPath} ${error}`);
  });
  wc.on("render-process-gone", (_e, details) => {
    report.renderGone.push(details);
    console.log(`RENDER_PROCESS_GONE ${JSON.stringify(details)}`);
  });

  await win.loadFile(ENTRY);
  await sleep(300);

  async function js(code) {
    return wc.executeJavaScript(code, true);
  }

  async function waitFor(name, expr, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
      try {
        last = await js(expr);
        if (last) return last;
      } catch (err) {
        last = String(err);
      }
      await sleep(60);
    }
    check(name, false, `timeout; last=${JSON.stringify(last)}`);
    return last;
  }

  // ---- 1. 挂载与骨架 ----
  const mount = await waitFor("ROOT_MOUNTED", `!!document.querySelector('#root > .app-shell') && !!document.getElementById('titlebar')`);
  if (!mount) throw new Error("root not mounted");
  check("ROOT_MOUNTED", true);

  const skeleton = await js(`(() => {
    const q = (s) => document.querySelector(s);
    const rect = (s) => { const el = q(s); return el ? el.getBoundingClientRect() : null; };
    const roles = [...document.querySelectorAll('#role-tree .tree-item[data-role-id]')];
    const title = rect('#titlebar');
    const head = rect('.chat-head');
    const side = rect('.col-left');
    const capsule = rect('#composer-capsule');
    const headInner = rect('.chat-head .head-inner');
    return {
      titlebarH: title && title.height,
      chatHeadH: head && head.height,
      sidebarW: side && side.width,
      capsuleW: capsule && capsule.width,
      headInnerW: headInner && headInner.width,
      roleCount: roles.length,
      roleIds: roles.map((el) => el.getAttribute('data-role-id')),
      hasChatRole: !!q('#chat-role'),
      chatRoleText: q('#chat-role') && q('#chat-role').textContent,
      hasChatRoleSub: !!q('#chat-role-sub'),
      hasContextState: !!q('#context-state'),
      hasChat: !!q('#chat'),
      chatState: q('#chat') && q('#chat').getAttribute('data-state'),
      hasEmpty: !!q('#chat .chat-empty'),
      hasPane: !!q('#chat .chat-pane'),
      paneRole: q('#chat .chat-pane') && q('#chat .chat-pane').getAttribute('data-role-id'),
      hasComposer: !!q('.composer'),
      hasInput: !!q('#inp-message'),
      sendDisabled: q('#btn-send') && q('#btn-send').disabled,
      haltHidden: q('#btn-halt') && q('#btn-halt').hidden,
      attachDisabled: q('#btn-attach-image') && q('#btn-attach-image').disabled,
      projectName: q('#project-name') && q('#project-name').textContent,
      projectPath: q('#project-path') && q('#project-path').textContent,
      importDisabled: q('#btn-import') && q('#btn-import').disabled,
      piDisabled: q('#tab-pi') && q('#tab-pi').disabled,
      driver: typeof window.__ansRenderer,
      driverMethods: window.__ansRenderer ? Object.keys(window.__ansRenderer).sort() : [],
      unimplementedCount: window.__ansRenderer && window.__ansRenderer.unimplemented ? window.__ansRenderer.unimplemented.length : -1,
      sendDisabledFn: window.__ansRenderer && window.__ansRenderer.send ? window.__ansRenderer.send.disabled() : null,
      composerState: window.__ansRenderer && window.__ansRenderer.composer ? window.__ansRenderer.composer.state() : null,
      demoState: window.__ansRenderer ? { demo: window.__ansRenderer.state.demo, roleBusy: window.__ansRenderer.state.roleBusy, selectedRoleId: window.__ansRenderer.state.selectedRoleId, runtime: window.__ansRenderer.state.runtime } : null,
      desktopBridge: typeof window.desktop,
      bridgeMethods: window.desktop ? ['minimizeWindow','toggleMaximize','closeWindow','isMaximized','onMaximizedChanged'].map((m) => typeof window.desktop[m]) : [],
      winMinDisabled: q('#win-min') && q('#win-min').disabled,
      winMaxDisabled: q('#win-max') && q('#win-max').disabled,
      winCloseDisabled: q('#win-close') && q('#win-close').disabled,
      titlebarNote: q('.titlebar-note') ? q('.titlebar-note').textContent : null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      styleTagCount: document.querySelectorAll('style').length,
      styleSheetCount: document.styleSheets.length,
      dragRegion: (() => {
        for (const sheet of document.styleSheets) {
          let rules; try { rules = sheet.cssRules; } catch { continue; }
          for (const rule of rules) {
            if (rule.selectorText === '.titlebar') {
              return rule.style.getPropertyValue('-webkit-app-region') || rule.style.webkitAppRegion || null;
            }
          }
        }
        return null;
      })(),
      ariaResizer: (() => { const r = q('#sidebar-resizer'); return r ? { role: r.getAttribute('role'), now: r.getAttribute('aria-valuenow'), min: r.getAttribute('aria-valuemin'), max: r.getAttribute('aria-valuemax') } : null; })(),
      storage: { width: localStorage.getItem('ans.sidebar.width'), collapsed: localStorage.getItem('ans.sidebar.collapsed') },
    };
  })()`);
  report.skeleton = skeleton;
  check("TITLEBAR_HEIGHT_36", skeleton.titlebarH === 36, skeleton.titlebarH);
  check("CHAT_HEAD_HEIGHT_64", skeleton.chatHeadH === 64, skeleton.chatHeadH);
  check("SIDEBAR_WIDTH_248", Math.round(skeleton.sidebarW) === 248, skeleton.sidebarW);
  check("CONTENT_COLUMN_900", Math.round(skeleton.capsuleW) === 900 && Math.round(skeleton.headInnerW) === 900, { capsuleW: skeleton.capsuleW, headInnerW: skeleton.headInnerW });
  check("ROLE_TREE_5_DEMO_ROLES", skeleton.roleCount === 5, skeleton.roleIds);
  check("SKELETON_HEADER_PARTS", skeleton.hasChatRole && skeleton.hasChatRoleSub && skeleton.hasContextState, skeleton.chatRoleText);
  check("CHAT_EMPTY_AND_PANE", skeleton.hasChat && skeleton.hasEmpty && skeleton.hasPane && skeleton.chatState === "idle", { paneRole: skeleton.paneRole });
  check("COMPOSER_INPUT_PRESENT", skeleton.hasComposer && skeleton.hasInput);
  check("SEND_DISABLED_HONESTLY", skeleton.sendDisabled === true && skeleton.sendDisabledFn === true);
  check("HALT_ATTACH_PLACEHOLDERS", skeleton.haltHidden === true && skeleton.attachDisabled === true);
  check("SIDEBAR_FOOT_ENTRIES_DISABLED", skeleton.importDisabled === true && skeleton.piDisabled === true);
  check("DRIVER_PRESENT", skeleton.driver === "object" && skeleton.driverMethods.includes("openConfirmDemo") && skeleton.driverMethods.includes("sidebar") && skeleton.driverMethods.includes("drawer") && skeleton.driverMethods.includes("confirmDemo"));
  check("DRIVER_UNIMPLEMENTED_DECLARED", skeleton.unimplementedCount >= 15, skeleton.unimplementedCount);
  check("DEMO_STATE_FLAGGED", skeleton.demoState && skeleton.demoState.demo === true && skeleton.demoState.runtime === "claude", skeleton.demoState);
  check("PRELOAD_BRIDGE_AVAILABLE", skeleton.desktopBridge === "object" && skeleton.bridgeMethods.every((t) => t === "function"), skeleton.bridgeMethods);
  check("WINDOW_BUTTONS_ENABLED", skeleton.winMinDisabled === false && skeleton.winMaxDisabled === false && skeleton.winCloseDisabled === false);
  check("DARK_GRAPHITE_BG", skeleton.bodyBg === "rgb(20, 23, 26)", skeleton.bodyBg);
  check("CSP_NO_STYLE_TAGS_AT_RUNTIME", skeleton.styleTagCount === 0, skeleton.styleTagCount);
  check("TITLEBAR_DRAG_REGION", skeleton.dragRegion === "drag", skeleton.dragRegion);
  check("RESIZER_ARIA_CONTRACT", skeleton.ariaResizer && skeleton.ariaResizer.role === "separator" && skeleton.ariaResizer.now === "248" && skeleton.ariaResizer.min === "208" && skeleton.ariaResizer.max === "360", skeleton.ariaResizer);

  // ---- 2. 侧栏拖宽 / 双击 / 键盘 / 收起展开 ----
  const drag = await js(`(() => {
    const resizer = document.getElementById('sidebar-resizer');
    const widthOf = () => Math.round(document.querySelector('.col-left').getBoundingClientRect().width);
    const before = widthOf();
    const opts = (x) => ({ bubbles: true, cancelable: true, clientX: x, clientY: 400, button: 0, pointerId: 7, pointerType: 'mouse', isPrimary: true });
    resizer.dispatchEvent(new PointerEvent('pointerdown', opts(300)));
    resizer.dispatchEvent(new PointerEvent('pointermove', opts(380)));
    resizer.dispatchEvent(new PointerEvent('pointerup', opts(380)));
    return { before, after: widthOf(), aria: resizer.getAttribute('aria-valuenow'), stored: localStorage.getItem('ans.sidebar.width') };
  })()`);
  await sleep(120);
  const dragSettled = await js(`Math.round(document.querySelector('.col-left').getBoundingClientRect().width)`);
  report.drag = { ...drag, settled: dragSettled };
  check("SIDEBAR_DRAG_248_TO_328", drag.before === 248 && drag.after === 328 && dragSettled === 328, report.drag);
  check("SIDEBAR_DRAG_ARIA_AND_STORAGE", drag.aria === "328" && drag.stored === "328", { aria: drag.aria, stored: drag.stored });

  const dbl = await js(`(() => {
    const resizer = document.getElementById('sidebar-resizer');
    resizer.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    return { width: Math.round(document.querySelector('.col-left').getBoundingClientRect().width), aria: resizer.getAttribute('aria-valuenow'), stored: localStorage.getItem('ans.sidebar.width') };
  })()`);
  check("SIDEBAR_DOUBLE_CLICK_RESET_248", dbl.width === 248 && dbl.aria === "248" && dbl.stored === "248", dbl);

  const kb = await js(`(() => {
    const resizer = document.getElementById('sidebar-resizer');
    resizer.focus();
    resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
    const shifted = { width: Math.round(document.querySelector('.col-left').getBoundingClientRect().width), aria: resizer.getAttribute('aria-valuenow') };
    resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    const plain = Math.round(document.querySelector('.col-left').getBoundingClientRect().width);
    resizer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    const back = Math.round(document.querySelector('.col-left').getBoundingClientRect().width);
    return { shifted, plain, back, stored: localStorage.getItem('ans.sidebar.width') };
  })()`);
  // 期望：248 +24=272；272 -8=264；264 +8=272
  check("SIDEBAR_KEYBOARD_STEP_24_AND_8", kb.shifted.width === 272 && kb.plain === 264 && kb.back === 272 && kb.stored === "272", kb);

  // 收起：panel 宽度立即归 0；.col-left 自身的 padding/opacity 有 160ms 过渡（设计值），
  // 轮询到过渡结束再判宽 0（等待是观测口径，不是放宽断言）。
  const collapse = await js(`(async () => {
    document.getElementById('sidebar-collapse').click();
    const side = document.querySelector('.col-left');
    let width = null;
    for (let i = 0; i < 80; i++) {
      width = side ? Math.round(side.getBoundingClientRect().width) : null;
      if (width === 0) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    const app = document.querySelector('.app');
    const expand = document.getElementById('sidebar-expand');
    return {
      collapsedClass: app.classList.contains('is-sidebar-collapsed'),
      sideWidth: width,
      expandHidden: expand.hidden,
      ariaExpand: expand.getAttribute('aria-expanded'),
      stored: localStorage.getItem('ans.sidebar.collapsed'),
    };
  })()`);
  check("SIDEBAR_COLLAPSE", collapse.collapsedClass === true && collapse.sideWidth === 0 && collapse.expandHidden === false && collapse.stored === "1", collapse);

  const expand = await js(`(async () => {
    document.getElementById('sidebar-expand').click();
    const side = document.querySelector('.col-left');
    let width = null;
    for (let i = 0; i < 80; i++) {
      width = side ? Math.round(side.getBoundingClientRect().width) : null;
      if (width === 272) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    const app = document.querySelector('.app');
    return {
      collapsedClass: app.classList.contains('is-sidebar-collapsed'),
      sideWidth: width,
      stored: localStorage.getItem('ans.sidebar.collapsed'),
      widthStored: localStorage.getItem('ans.sidebar.width'),
    };
  })()`);
  check("SIDEBAR_EXPAND_KEEPS_WIDTH_272", expand.collapsedClass === false && expand.sideWidth === 272 && expand.stored === "0" && expand.widthStored === "272", expand);

  // ---- 3. IME 组合期 Enter 不发送；组合后 Enter 被拦截但如实标注 ----
  const ime = await js(`(async () => {
    const inp = document.getElementById('inp-message');
    const status = document.getElementById('composer-demo-status');
    const setValue = (v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(inp, v);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const initialStatus = status.textContent;
    setValue('你好');
    await new Promise((r) => setTimeout(r, 30));
    const beforeComposition = { text: inp.value, status: status.textContent };
    inp.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '你好' }));
    const duringEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const duringNotPrevented = inp.dispatchEvent(duringEnter);
    await new Promise((r) => setTimeout(r, 30));
    const duringComposition = { text: inp.value, status: status.textContent, prevented: !duringNotPrevented };
    inp.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你好' }));
    const afterEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const afterPrevented = !inp.dispatchEvent(afterEnter);
    await new Promise((r) => setTimeout(r, 30));
    const afterComposition = { text: inp.value, status: status.textContent };
    // keyCode 229 路径（合成事件上覆写只读属性）
    const k229 = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(k229, 'keyCode', { get: () => 229 });
    const k229Prevented = !inp.dispatchEvent(k229);
    // isComposing 路径
    let isComposingPrevented = null;
    try {
      const comp = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true });
      isComposingPrevented = !inp.dispatchEvent(comp);
    } catch (e) { isComposingPrevented = 'error:' + e.message; }
    // Shift+Enter 不拦截
    const shift = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
    const shiftPrevented = !inp.dispatchEvent(shift);
    const driverState = window.__ansRenderer.composer.state();
    return { initialStatus, beforeComposition, duringComposition, afterComposition, afterPrevented, k229Prevented, isComposingPrevented, shiftPrevented, driverState, sendDisabled: window.__ansRenderer.send.disabled() };
  })()`);
  report.ime = ime;
  check("IME_COMPOSITION_ENTER_NOT_SENT", ime.duringComposition.text === '你好' && ime.duringComposition.status === ime.beforeComposition.status && ime.duringComposition.prevented === false, ime.duringComposition);
  check("IME_AFTER_COMPOSITION_ENTER_INTERCEPTED_HONEST", ime.afterPrevented === true && /本条未发送/.test(ime.afterComposition.status) && ime.afterComposition.text === '你好', { prevented: ime.afterPrevented, status: ime.afterComposition.status });
  check("IME_KEYCODE_229_GUARD", ime.k229Prevented === false, ime.k229Prevented);
  check("IME_ISCOMPOSING_GUARD", ime.isComposingPrevented === false, ime.isComposingPrevented);
  check("SHIFT_ENTER_NOT_INTERCEPTED", ime.shiftPrevented === false, ime.shiftPrevented);
  check("SEND_STILL_DISABLED_WITH_TEXT", ime.sendDisabled === true && ime.driverState.sendDisabled === true, ime.driverState);

  // ---- 4. 抽屉：424 / Esc / 焦点返回 ----
  const drawerOpen = await js(`(async () => {
    document.getElementById('tab-card').click();
    for (let i = 0; i < 60; i++) {
      if (document.getElementById('right-drawer')) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    await new Promise((r) => setTimeout(r, 220));
    const d = document.getElementById('right-drawer');
    return d ? {
      width: Math.round(d.getBoundingClientRect().width),
      role: d.getAttribute('role'),
      ariaModal: d.getAttribute('aria-modal'),
      ariaLabelledby: d.getAttribute('aria-labelledby'),
      drawerTitle: (document.getElementById('drawer-title') || {}).textContent,
      focusId: document.activeElement && document.activeElement.id,
      body: !!document.getElementById('right-body'),
      isOpen: window.__ansRenderer.drawer.isOpen(),
    } : { missing: true };
  })()`);
  check("DRAWER_424_DIALOG_FOCUS", drawerOpen.width === 424 && drawerOpen.role === "dialog" && drawerOpen.ariaModal === "true" && drawerOpen.focusId === "drawer-close" && drawerOpen.isOpen === true, drawerOpen);

  const drawerClose = await js(`(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    for (let i = 0; i < 60; i++) {
      if (!document.getElementById('right-drawer')) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    await new Promise((r) => setTimeout(r, 50));
    return { removed: !document.getElementById('right-drawer'), isOpen: window.__ansRenderer.drawer.isOpen(), focusId: document.activeElement && document.activeElement.id };
  })()`);
  check("DRAWER_ESC_CLOSES_AND_RETURNS_FOCUS", drawerClose.removed === true && drawerClose.isOpen === false && drawerClose.focusId === "tab-card", drawerClose);

  // ---- 5. 确认卡：640 / 默认焦点拒绝 / Esc=拒绝 / 放行为另一路 ----
  const confirm = await js(`(async () => {
    window.__ansRenderer.openConfirmDemo({ command: 'echo "hello world"' });
    for (let i = 0; i < 60; i++) {
      if (document.getElementById('shell-confirm')) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    await new Promise((r) => setTimeout(r, 260));
    const card = document.getElementById('shell-confirm');
    if (!card) return { missing: true };
    return {
      width: Math.round(card.getBoundingClientRect().width),
      focusId: document.activeElement && document.activeElement.id,
      commandText: (document.getElementById('sc-command') || {}).textContent,
      allowId: !!document.getElementById('sc-allow'),
      denyId: !!document.getElementById('sc-deny'),
      allowOutline: document.getElementById('sc-allow').getAttribute('data-variant') || document.getElementById('sc-allow').className,
      state: window.__ansRenderer.confirmDemo.state(),
      hasAlertDialog: !!document.querySelector('[data-slot="alert-dialog-content"]'),
    };
  })()`);
  report.confirm = confirm;
  check("CONFIRM_CARD_640", confirm.width === 640, confirm.width);
  check("CONFIRM_DEFAULT_FOCUS_DENY", confirm.focusId === "sc-deny", confirm.focusId);
  check("CONFIRM_COMMAND_VERBATIM", confirm.commandText === 'echo "hello world"', confirm.commandText);
  check("CONFIRM_OPEN_STATE_DEMO", confirm.state && confirm.state.open === true && confirm.state.payload && confirm.state.payload.id === "demo-shell-confirm-1", confirm.state && confirm.state.payload && confirm.state.payload.id);

  const esc = await js(`(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    for (let i = 0; i < 60; i++) {
      if (!document.querySelector('[data-slot="alert-dialog-content"]')) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    await new Promise((r) => setTimeout(r, 80));
    return { cardGone: !document.getElementById('shell-confirm'), state: window.__ansRenderer.confirmDemo.state() };
  })()`);
  check("CONFIRM_ESC_CLOSES_AS_DENY", esc.cardGone === true && esc.state.open === false && esc.state.lastDecision === "deny", esc.state);

  const allowPath = await js(`(async () => {
    window.__ansRenderer.openConfirmDemo();
    for (let i = 0; i < 60; i++) {
      if (document.getElementById('sc-allow')) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    await new Promise((r) => setTimeout(r, 220));
    document.getElementById('sc-allow').click();
    for (let i = 0; i < 60; i++) {
      if (!document.querySelector('[data-slot="alert-dialog-content"]')) break;
      await new Promise((r) => setTimeout(r, 30));
    }
    await new Promise((r) => setTimeout(r, 80));
    return window.__ansRenderer.confirmDemo.state();
  })()`);
  check("CONFIRM_ALLOW_IS_SEPARATE_PATH", allowPath.open === false && allowPath.lastDecision === "allow", allowPath);

  // ---- 6. CSP 违规与页面错误 ----
  const csp = await js(`(() => ({
    violations: window.__ansCspViolations || [],
    uncaughtSeen: window.__ansSmokeUncaught || 0,
  }))()`);
  report.pageCspViolations = csp.violations;
  check("PAGE_CSP_VIOLATIONS_ZERO", Array.isArray(csp.violations) && csp.violations.length === 0, csp.violations);

  const errorConsoles = report.consoleMessages.filter((m) => String(m.level) === "error" || m.level === 3);
  const cspConsoles = report.consoleMessages.filter((m) => /Content Security Policy|Refused to|CORS|Failed to load module/i.test(String(m.message)));
  check("NO_CONSOLE_ERRORS", errorConsoles.length === 0, errorConsoles);
  check("NO_CSP_OR_MODULE_CONSOLE_ERRORS", cspConsoles.length === 0, cspConsoles);
  check("NO_DID_FAIL_LOAD", report.didFailLoad.length === 0, report.didFailLoad);
  check("NO_PRELOAD_ERRORS", report.preloadErrors.length === 0, report.preloadErrors);
  check("NO_RENDER_PROCESS_GONE", report.renderGone.length === 0, report.renderGone);

  // ---- 7. 截图（show:false 下若为空则如实记录） ----
  try {
    const image = await wc.capturePage();
    if (!image.isEmpty()) {
      const p = path.join(OUT_DIR, "smoke-default.png");
      fs.writeFileSync(p, image.toPNG());
      report.screenshot = { path: p, bytes: fs.statSync(p).size };
      check("SCREENSHOT_CAPTURED", true, report.screenshot);
    } else {
      check("SCREENSHOT_CAPTURED", false, "empty image under show:false");
    }
  } catch (err) {
    check("SCREENSHOT_CAPTURED", false, String(err));
  }

  report.finishedAt = new Date().toISOString();
  const failures = report.checks.filter((c) => !c.value);
  report.summary = { total: report.checks.length, passed: report.checks.length - failures.length, failed: failures.length };
  fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`SMOKE_SUMMARY ${JSON.stringify(report.summary)}`);
  console.log(failures.length === 0 ? "SMOKE_DONE=1" : "SMOKE_DONE=0");
  win.destroy();
  app.exit(failures.length === 0 ? 0 : 1);
}

app.whenReady().then(main).catch((err) => {
  console.error("SMOKE_FATAL", err && err.stack || err);
  try {
    fs.writeFileSync(path.join(OUT_DIR, "fatal.txt"), String(err && err.stack || err));
  } catch {}
  app.exit(2);
});
