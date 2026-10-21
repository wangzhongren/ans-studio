#!/usr/bin/env node
/**
 * 真机 CDP 驱动：打包应用 + 空项目 S0/五角色/交互/截图/只读检查。
 * 运行：node packaged-empty-cdp.mjs <cdpPort> <projectPath> <outDir>
 * 仅测试角色证据目录；不修改产品/项目。
 */
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.argv[2] || 9333);
const PROJECT = process.argv[3];
const OUT = process.argv[4];
if (!PROJECT || !OUT) throw new Error("usage: node packaged-empty-cdp.mjs <port> <project> <outdir>");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

class CDP {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
  }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    await this.send("Log.enable");
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression, awaitPromise = true) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error("EVAL: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result?.value;
  }
  async waitFor(expression, timeoutMs = 15000, intervalMs = 250) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeoutMs) {
      try {
        last = await this.eval(expression, true);
        if (last) return { ok: true, value: last, ms: Date.now() - start };
      } catch (e) {
        last = String(e);
      }
      await sleep(intervalMs);
    }
    return { ok: false, value: last, ms: Date.now() - start };
  }
  async shot(file) {
    const r = await this.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    fs.writeFileSync(file, Buffer.from(r.data, "base64"));
    return file;
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

const errors = [];
function collect(cdp) {
  for (const e of cdp.events) {
    if (e.method === "Runtime.exceptionThrown") {
      errors.push({ type: "exception", text: e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text });
    } else if (e.method === "Log.entryAdded" && ["error", "warning"].includes(e.params.entry.level)) {
      errors.push({ type: "log", level: e.params.entry.level, source: e.params.entry.source, text: e.params.entry.text, url: e.params.entry.url });
    } else if (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") {
      errors.push({ type: "console", text: (e.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ") });
    }
  }
  cdp.events.length = 0;
}

const targets = await listTargets();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page target");
const cdp = new CDP(page.webSocketDebuggerUrl);
await cdp.open();

const result = {
  startedAt: new Date().toISOString(),
  targetUrl: page.url,
  project: PROJECT,
  screenshots: {},
  steps: {},
  errors: [],
};

// 页面级错误/CSP 收集器（初始加载后的增量）
await cdp.eval(`(() => {
  window.__realTest = window.__realTest || { errors: [], rejections: [], csp: [] };
  addEventListener('error', (e) => window.__realTest.errors.push(String(e.message || e.error || e)));
  addEventListener('unhandledrejection', (e) => window.__realTest.rejections.push(String(e.reason)));
  document.addEventListener('securitypolicyviolation', (e) => window.__realTest.csp.push({ directive: e.violatedDirective, blockedURI: e.blockedURI }));
  return true;
})()`);

result.steps.initial = await cdp.eval(`(() => ({
  href: location.href,
  title: document.title,
  readyState: document.readyState,
  preload: { desktop: typeof window.desktop, listProject: typeof window.desktop?.listProject, pickProject: typeof window.desktop?.pickProject },
  driver: typeof window.__ansRenderer,
  cspMeta: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
  bodyText: (document.body.innerText || '').slice(0, 500)
}))()`);

// 加载空项目（真实 IPC 等价通道）
const t0 = Date.now();
let loadReturn;
try {
  loadReturn = await cdp.eval(`window.__ansRenderer.loadProject(${JSON.stringify(PROJECT)})`, true);
} catch (e) {
  loadReturn = { error: String(e) };
}
const loadMs = Date.now() - t0;
const waitLoaded = await cdp.waitFor(
  `window.__ansRenderer.state.projectRoot === ${JSON.stringify(PROJECT)} && Array.isArray(window.__ansRenderer.state.roles)`,
  30000,
  200,
);
await sleep(800);
result.steps.load = { loadReturn, loadMs, waitLoaded };

result.steps.state = await cdp.eval(`(() => {
  const s = window.__ansRenderer.state;
  const pickRole = (r) => ({
    roleId: r.roleId, name: r.name, displayName: r.displayName, kind: r.kind,
    readonly: r.readonly, status: r.status, statusText: r.statusText,
    model: r.model, governance: r.governance, error: r.error,
  });
  return {
    projectRoot: s.projectRoot, hasRoles: s.hasRoles, primaryRoleId: s.primaryRoleId,
    selectedRoleId: s.selectedRoleId, governanceModel: s.governanceModel,
    governanceRecord: s.governanceRecord,
    roleCount: s.roles.length, roles: s.roles.map(pickRole),
    rightTab: s.rightTab, drawerOpen: s.drawerOpen, hint: s.hint,
    sessionOpenRoleId: s.sessionOpenRoleId, runtime: s.runtime,
  };
})()`);

result.steps.dom = await cdp.eval(`(() => {
  const text = (el) => (el?.textContent || '').trim();
  const innermostMentions = (() => {
    const ph = '项目尚未 bootstrap';
    const hits = [...document.querySelectorAll('body *')].filter((el) => el.textContent.includes(ph));
    return hits.filter((el) => ![...el.children].some((c) => c.textContent.includes(ph))).map((el) => ({ tag: el.tagName, cls: el.className, text: text(el) }));
  })();
  return {
    titlebar: text(document.getElementById('titlebar')),
    treeNames: [...document.querySelectorAll('#role-tree .ti-name')].map(text),
    treeGroups: [...document.querySelectorAll('#role-tree .tree-group')].map(text),
    treeItems: [...document.querySelectorAll('#role-tree .tree-item')].map((el) => ({
      name: text(el.querySelector('.ti-name')),
      badges: [...el.querySelectorAll('.ti-badge')].map(text),
      status: text(el.querySelector('.ti-status')),
      statusClass: el.querySelector('.ti-status')?.className || '',
      aria: el.getAttribute('aria-description') || '',
    })),
    empty: {
      title: text(document.querySelector('#chat .chat-empty .empty-title')),
      sub: text(document.querySelector('#chat .chat-empty .empty-sub')),
      cta: text(document.querySelector('#chat .chat-empty #btn-start-primary')),
      governanceCTA: !!document.querySelector('#btn-governance-empty-action'),
      count: document.querySelectorAll('#chat .chat-empty').length,
    },
    boilerplateMentions: innermostMentions,
    bodyHasTriad: (document.body.innerText || '').includes('三权 · 五角色'),
    bodyHasGovernanceMissing: /尚无治理记录|治理记录.*(缺失|未接受)/.test(document.body.innerText || ''),
    bodyExcerpt: (document.body.innerText || '').slice(0, 1200),
  };
})()`);

// 1360 截图
result.screenshots.w1360 = await cdp.shot(path.join(OUT, "empty-1360.png"));

// 960：优先真实窗口 resize，失败则用 Emulation 视口
let resizeMethod = "window.resizeTo";
let resized = await cdp.eval(`(() => { window.resizeTo(960, 800); return { innerWidth: window.innerWidth, innerHeight: window.innerHeight, outerWidth: window.outerWidth, outerHeight: window.outerHeight }; })()`);
await sleep(700);
let afterResize = await cdp.eval(`({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, outerWidth: window.outerWidth, outerHeight: window.outerHeight, dpr: devicePixelRatio })`);
if (afterResize.innerWidth > 1000) {
  resizeMethod = "Emulation.setDeviceMetricsOverride";
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 960, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  afterResize = await cdp.eval(`({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, outerWidth: window.outerWidth, outerHeight: window.outerHeight, dpr: devicePixelRatio })`);
}
result.steps.resize = { resizeMethod, resized, afterResize };
result.screenshots.w960 = await cdp.shot(path.join(OUT, "empty-960.png"));
if (resizeMethod === "Emulation.setDeviceMetricsOverride") {
  await cdp.send("Emulation.clearDeviceMetricsOverride");
} else {
  await cdp.eval(`window.resizeTo(1360, 860)`);
}
await sleep(500);
result.steps.resizeRestored = await cdp.eval(`({ innerWidth: window.innerWidth, innerHeight: window.innerHeight })`);

// 点击 Lead 角色（真实 DOM click）
const lead = (result.steps.state.roles || []).find((r) => /liaison|lead|主理/i.test(String(r.roleId) + " " + String(r.name) + " " + String(r.displayName)));
if (lead) {
  const clicked = await cdp.eval(`(() => {
    const name = ${JSON.stringify(lead.displayName || lead.name)};
    const item = [...document.querySelectorAll('#role-tree .tree-item')].find((el) => (el.querySelector('.ti-name')?.textContent || '').trim() === name);
    if (!item) return { ok: false, reason: 'tree item not found', name };
    item.click();
    return { ok: true, name };
  })()`);
  await sleep(1200);
  result.steps.leadClick = {
    lead,
    clicked,
    state: await cdp.eval(`(() => { const s = window.__ansRenderer.state; return { selectedRoleId: s.selectedRoleId, sessionOpenRoleId: s.sessionOpenRoleId, rightTab: s.rightTab, roleBusy: s.roleBusy, hint: s.hint }; })()`),
    chat: await cdp.eval(`(() => {
      const chat = document.getElementById('chat');
      return {
        exists: !!chat,
        empty: !!chat?.querySelector('.chat-empty'),
        msgCount: chat?.querySelectorAll('.msg').length ?? 0,
        text: (chat?.innerText || '').slice(0, 1000),
        composer: !!document.getElementById('inp-message'),
        sendDisabled: document.getElementById('btn-send')?.disabled ?? null,
      };
    })()`),
  };
  result.screenshots.lead = await cdp.shot(path.join(OUT, "lead-chat.png"));
}

// 打开设置（Pi 侧栏入口）
const settingsClick = await cdp.eval(`(() => { const b = document.getElementById('tab-pi'); if (!b) return false; b.click(); return true; })()`);
await sleep(900);
result.steps.settings = {
  clicked: settingsClick,
  state: await cdp.eval(`(() => { const s = window.__ansRenderer.state; return { drawerOpen: s.drawerOpen, rightTab: s.rightTab, hint: s.hint }; })()`),
  dom: await cdp.eval(`(() => {
    const d = document.getElementById('right-drawer');
    return { title: (document.getElementById('drawer-title')?.textContent || '').trim(), open: d?.classList.contains('open') ?? null, text: (d?.innerText || '').slice(0, 1200) };
  })()`),
};
result.screenshots.settings = await cdp.shot(path.join(OUT, "settings.png"));
await cdp.eval(`document.getElementById('drawer-close')?.click()`);
await sleep(400);
result.steps.settingsClose = await cdp.eval(`(() => ({ active: document.activeElement?.id || document.activeElement?.className || '', drawerOpen: window.__ansRenderer.state.drawerOpen, rightTab: window.__ansRenderer.state.rightTab }))()`);

// 工作概览
await cdp.eval(`document.getElementById('tab-work')?.click()`);
await sleep(900);
result.steps.work = {
  state: await cdp.eval(`(() => { const s = window.__ansRenderer.state; return { drawerOpen: s.drawerOpen, rightTab: s.rightTab }; })()`),
  dom: await cdp.eval(`(() => {
    const d = document.getElementById('right-drawer');
    return { title: (document.getElementById('drawer-title')?.textContent || '').trim(), text: (d?.innerText || '').slice(0, 1500), queueBody: (document.getElementById('right-queue-body')?.innerText || '').slice(0, 800) };
  })()`),
};
result.screenshots.work = await cdp.shot(path.join(OUT, "work-overview.png"));

// 角色资料
await cdp.eval(`document.getElementById('tab-card')?.click()`);
await sleep(800);
result.steps.profile = {
  state: await cdp.eval(`(() => { const s = window.__ansRenderer.state; return { drawerOpen: s.drawerOpen, rightTab: s.rightTab }; })()`),
  dom: await cdp.eval(`(() => { const d = document.getElementById('right-drawer'); return { title: (document.getElementById('drawer-title')?.textContent || '').trim(), text: (d?.innerText || '').slice(0, 1200) }; })()`),
};
result.screenshots.profile = await cdp.shot(path.join(OUT, "role-profile.png"));

// Esc 关闭抽屉
await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));`);
await sleep(500);
result.steps.escape = await cdp.eval(`(() => ({ drawerOpen: window.__ansRenderer.state.drawerOpen, rightTab: window.__ansRenderer.state.rightTab, active: document.activeElement?.id || '' }))()`);

collect(cdp);
result.errors = errors;
result.pageErrors = await cdp.eval(`window.__realTest || null`);
result.endedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, "empty-project.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ok: true, out: path.join(OUT, "empty-project.json"), loadMs, roleCount: result.steps.state.roleCount, errors: errors.length }, null, 2));
cdp.close();
