#!/usr/bin/env node
/**
 * 修复后构建（34484f3）真机复核 A：新 dist / 品牌图标 / 角色名 / 真实 Pi 需求确认卡。
 * 测试角色，不改产品代码、不修断言；只写证据目录。
 *
 * usage: node fixed-intent-card.mjs <cdpPort> <projectDir> <outDir> [timeoutMs]
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.argv[2] || 9340);
const PROJECT = process.argv[3];
const OUT = process.argv[4];
const TIMEOUT = Number(process.argv[5] || 480000);
if (!PROJECT || !OUT) throw new Error("usage: node intent-card-e2e.mjs <cdpPort> <projectDir> <outDir> [timeoutMs]");

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const MESSAGE = "我想做一个最简单的待办清单网页应用，请先确认需求。";

// ———————————————— CDP ————————————————
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
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

const errors = [];
function drainErrors(cdp, into) {
  for (const e of cdp.events) {
    if (e.method === "Runtime.exceptionThrown") {
      into.push({ type: "exception", at: nowIso(), text: e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text });
    } else if (e.method === "Log.entryAdded" && ["error", "warning"].includes(e.params.entry.level)) {
      into.push({ type: "log", at: nowIso(), level: e.params.entry.level, source: e.params.entry.source, text: e.params.entry.text, url: e.params.entry.url });
    } else if (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") {
      into.push({ type: "console", at: nowIso(), text: (e.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ") });
    }
  }
  cdp.events.length = 0;
}

// ———————————————— DOM 探针（页面内函数） ————————————————
const PAGE_HELPERS = String.raw`
(() => {
  if (window.__intentE2E) return true;
  window.__realTest = window.__realTest || { errors: [], rejections: [], csp: [] };
  addEventListener('error', (e) => window.__realTest.errors.push(String(e.message || e.error || e)));
  addEventListener('unhandledrejection', (e) => window.__realTest.rejections.push(String(e.reason)));
  document.addEventListener('securitypolicyviolation', (e) => window.__realTest.csp.push({ directive: e.violatedDirective, blockedURI: e.blockedURI }));
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  const text = (el) => ((el && el.innerText) || '').trim();
  const hitTest = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y);
    if (!top) return false;
    if (top === el || el.contains(top) || top.contains(el)) return true;
    const label = el.closest('label');
    return !!(label && (top === label || label.contains(top)));
  };
  const cardInfo = (el) => {
    const requestId = el.getAttribute('data-request-id') || '';
    const badgeTexts = [...el.querySelectorAll('.op-gov-badge, .op-mirror-badge')].map((b) => text(b));
    const metaLines = [...el.querySelectorAll('.op-meta p')].map((p) => text(p));
    const options = [...el.querySelectorAll('.op-options input')].map((input) => {
      const label = input.closest('label');
      const r = input.getBoundingClientRect();
      return {
        value: input.value,
        type: input.type,
        label: text(label),
        checked: input.checked === true,
        disabled: input.disabled === true,
        visible: visible(input),
        unobstructed: hitTest(input),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      };
    });
    const actions = [...el.querySelectorAll('.op-actions button')].map((b) => ({
      cls: b.className,
      text: text(b),
      visible: visible(b),
      unobstructed: hitTest(b),
      disabled: b.disabled === true,
      hiddenAttr: b.hidden === true,
      rect: (() => { const r = b.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
    }));
    const row = el.closest('.chat-row');
    const rows = [...document.querySelectorAll('#chat .chat-row')];
    const rowIndex = row ? rows.indexOf(row) : -1;
    const rowTexts = (from, to) => rows.slice(Math.max(0, from), Math.max(0, to)).map((r, i) => ({
      index: Math.max(0, from) + i,
      kind: r.getAttribute('data-row-kind') || '',
      text: (r.innerText || '').trim().slice(0, 160),
    }));
    const activities = [...document.querySelectorAll('#chat .tool-activity[data-call-id]')].map((a) => {
      const ar = a.closest('.chat-row');
      return {
        callId: a.getAttribute('data-call-id') || '',
        tool: text(a.querySelector('.activity-op')),
        target: text(a.querySelector('.activity-target')),
        state: text(a.querySelector('.activity-state')),
        rowIndex: ar ? rows.indexOf(ar) : -1,
        text: (a.innerText || '').trim().slice(0, 240),
      };
    });
    const requestActivities = activities.filter((a) => /request_choice|request_confirmation/.test(a.tool + ' ' + a.text));
    const matchingActivity = activities.find((a) => a.callId === requestId);
    const anchor = {
      cardRowIndex: rowIndex,
      requestId,
      matchingActivityByCallId: matchingActivity || null,
      requestActivityRows: requestActivities,
      distanceToNearestRequestActivity: requestActivities.length
        ? Math.min(...requestActivities.map((a) => Math.abs(a.rowIndex - rowIndex)))
        : null,
      prevRows: rowTexts(rowIndex - 3, rowIndex),
      nextRows: rowTexts(rowIndex + 1, rowIndex + 3),
    };
    const r = el.getBoundingClientRect();
    const preview = el.querySelector('.op-preview');
    return {
      requestId,
      surfaceRoleId: el.getAttribute('data-surface-role-id') || '',
      state: el.getAttribute('data-state') || '',
      badgeTexts,
      metaLines,
      title: text(el.querySelector('.op-title')),
      detail: text(el.querySelector('.op-note')),
      lifecycle: text(el.querySelector('.op-tool-lifecycle')),
      previewText: preview ? (preview.textContent || '').trim().slice(0, 6000) : '',
      options,
      actions,
      note: text(el.querySelector('.op-note:last-of-type')),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      visible: visible(el),
      anchor,
    };
  };
  window.__intentE2E = {
    ready: () => typeof window.__ansRenderer === 'object' && !!window.__ansRenderer.state,
    snapshot: () => {
      const s = window.__ansRenderer.state;
      const chat = document.getElementById('chat');
      const cards = [...document.querySelectorAll('#chat .op-request')].map(cardInfo);
      const shell = [...document.querySelectorAll('.sc-overlay')].filter((el) => !el.hidden).map((el) => ({
        id: el.getAttribute('data-request-id') || '',
        title: text(el.querySelector('.sc-title')),
        text: (el.innerText || '').trim().slice(0, 800),
      }));
      const assistants = [...document.querySelectorAll('#chat .msg-assistant')];
      const last = assistants[assistants.length - 1];
      const statusItem = [...document.querySelectorAll('#role-tree .tree-item')].find((el) =>
        ((el.querySelector('.ti-name')?.textContent || '').trim()).includes('主理'));
      return {
        at: new Date().toISOString(),
        busy: s.roleBusy?.liaison === true,
        selectedRoleId: s.selectedRoleId,
        sessionOpenRoleId: s.sessionOpenRoleId,
        runtime: s.runtime,
        hint: s.hint,
        statusText: (statusItem?.querySelector('.ti-status')?.textContent || '').trim(),
        statusClass: statusItem?.querySelector('.ti-status')?.className || '',
        assistantCount: assistants.length,
        lastAssistantText: ((last && last.innerText) || '').slice(0, 4000),
        chatTail: ((chat && chat.innerText) || '').slice(-4000),
        cards,
        shellConfirm: shell,
        viewport: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          outerWidth: window.outerWidth,
          outerHeight: window.outerHeight,
          dpr: window.devicePixelRatio,
        },
      };
    },
    scrollToCard: () => {
      const el = document.querySelector('#chat .op-request');
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      const chat = document.getElementById('chat');
      const composer = document.querySelector('.composer');
      const cr = el.getBoundingClientRect();
      const chatRect = chat.getBoundingClientRect();
      const limit = Math.min(chatRect.bottom, composer ? composer.getBoundingClientRect().top : chatRect.bottom);
      if (cr.bottom > limit) chat.scrollTop += cr.bottom - limit + 16;
      else if (cr.top < chatRect.top + 8) chat.scrollTop -= (chatRect.top + 8 - cr.top);
      const after = el.getBoundingClientRect();
      return {
        chatScrollTop: chat.scrollTop,
        cardRect: { x: Math.round(after.x), y: Math.round(after.y), w: Math.round(after.width), h: Math.round(after.height) },
        chatRect: { top: Math.round(chatRect.top), bottom: Math.round(chatRect.bottom) },
        composerTop: composer ? Math.round(composer.getBoundingClientRect().top) : null,
        fullyAboveComposer: after.bottom <= limit + 1,
      };
    },
    clickCardButton: (requestId, cls) => {
      const card = [...document.querySelectorAll('#chat .op-request')].find((el) => el.getAttribute('data-request-id') === requestId);
      if (!card) return { ok: false, reason: 'card-not-found' };
      const btn = card.querySelector(cls);
      if (!btn) return { ok: false, reason: 'button-not-found' };
      if (!visible(btn)) return { ok: false, reason: 'button-not-visible' };
      if (btn.disabled === true) return { ok: false, reason: 'button-disabled' };
      btn.click();
      return { ok: true, text: text(btn), cls: btn.className };
    },
    halt: () => {
      const btn = document.getElementById('btn-halt');
      if (!visible(btn)) return { ok: false, reason: 'halt-not-visible' };
      btn.click();
      return { ok: true };
    },
    judgeToggles: () => {
      const a = document.getElementById('auto-approve-toggle');
      const d = document.getElementById('judge-decision-toggle');
      return {
        approval: a ? { checked: a.checked, disabled: a.disabled, visible: visible(a) } : null,
        decision: d ? { checked: d.checked, disabled: d.disabled, visible: visible(d) } : null,
        decisionLabel: text(document.getElementById('judge-decision-label')),
        approvalLabel: text(document.getElementById('auto-approve-label')),
      };
    },
    clickJudge: (which) => {
      const el = document.getElementById(which === 'decision' ? 'judge-decision-toggle' : 'auto-approve-toggle');
      if (!el) return { ok: false, reason: 'not-found' };
      if (el.disabled) return { ok: false, reason: 'disabled' };
      el.click();
      return { ok: true, checkedAfterClick: el.checked };
    },
    engineMenu: () => {
      const trigger = document.getElementById('runtime-select');
      const menu = document.getElementById('runtime-options');
      return {
        triggerText: text(trigger),
        triggerTitle: trigger ? (trigger.getAttribute('title') || '') : '',
        menuVisible: visible(menu),
        menuText: menu ? (menu.innerText || '').trim() : '',
        options: menu
          ? [...menu.querySelectorAll('[role="option"], [data-runtime]')].map((o) => ({
              id: o.id || '',
              runtime: o.getAttribute('data-runtime') || '',
              text: (o.innerText || '').trim(),
            }))
          : [],
      };
    },
    roles: () => window.__ansRenderer.state.roles.map((r) => ({
      id: r.roleId, name: r.displayName || r.roleId, builtIn: r.builtIn === true,
      primary: r.primary === true,
    })),
    roleNames: () => [...document.querySelectorAll('#role-tree .tree-item .ti-name')].map((el) => (el.textContent || '').trim()),
    brand: () => {
      const info = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return {
          tagName: el.tagName,
          className: el.className,
          alt: el.getAttribute('alt'),
          widthAttr: el.getAttribute('width'),
          heightAttr: el.getAttribute('height'),
          naturalWidth: el.naturalWidth ?? null,
          naturalHeight: el.naturalHeight ?? null,
          complete: el.complete ?? null,
          src: el.getAttribute('src'),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          display: s.display,
          objectFit: s.objectFit,
          borderRadius: s.borderRadius,
        };
      };
      const directText = (el) => [...(el ? el.childNodes : [])]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent || '').trim())
        .filter(Boolean)
        .join(' ');
      const titlebar = document.querySelector('.titlebar-brand');
      const workspace = document.querySelector('.workspace-brand');
      return {
        titleMark: info(document.querySelector('img.titlebar-mark')),
        sideMark: info(document.querySelector('img.workspace-brand-mark')),
        oldTextMark: info(document.querySelector('span.titlebar-mark')),
        titlebarText: (titlebar && titlebar.innerText || '').trim(),
        titlebarDirectText: directText(titlebar),
        workspaceText: (workspace && workspace.innerText || '').trim(),
        workspaceDirectText: directText(workspace),
      };
    },
    distLinks: () => ({
      href: location.href,
      scripts: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')),
      links: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href')),
      images: [...document.querySelectorAll('img')].map((i) => ({ alt: i.getAttribute('alt'), src: i.getAttribute('src') })).slice(0, 20),
    }),
    rowDebug: () => window.__ansRenderer.rowModelDebug('liaison'),
    composer: () => window.__ansRenderer.composer.state(),
    _visible: visible,
  };
  return true;
})()
`;

// ———————————————— 写盘卡判定 ————————————————
const REL_TOKEN_RE = /^(?:\.{1,2}\/)?[\w.\-一-龥@+$]+\/[\w.\-一-龥@+$]+(?:\/[\w.\-一-龥@+$]+)*\/?$/;

function extractPathTokens(text) {
  const raw = String(text || "").replace(/\r/g, "");
  const out = new Map();
  const add = (kind, token) => {
    const key = kind + ":" + token;
    if (!out.has(key)) out.set(key, { kind, token });
  };
  const candidates = raw.split(/[\s"'`<>()[\]{}，。；：、|,]+/);
  for (const candidate of candidates) {
    const tok = candidate.trim().replace(/^[-*•]+/, "").replace(/[.;:!?，。；：！？]+$/, "");
    if (tok === "") continue;
    if (tok.startsWith("/")) {
      if (/^\/[\w./\-一-龥@+$]+$/.test(tok)) add("abs", tok);
      continue;
    }
    if (/^[A-Za-z]:[\\/]/.test(tok)) {
      add("abs", tok);
      continue;
    }
    if (tok.includes("/") && REL_TOKEN_RE.test(tok)) add("rel", tok);
  }
  return [...out.values()];
}

/** 写卡判定：全部可解析路径都在演示项目内才批准；任何越界/逃逸/无法核对 → 拒绝（fail-closed）。 */
function decideWriteCard(card) {
  const combined = [
    card.title,
    card.detail,
    ...(card.metaLines || []),
    card.previewText,
    ...(card.options || []).map((o) => o.label),
  ].join("\n");
  const tokens = extractPathTokens(combined);
  const reasons = [];
  let approve = true;
  if (tokens.length === 0) {
    approve = false;
    reasons.push("no-path-token（无法核对写入路径）");
  }
  const projectAbs = path.resolve(PROJECT);
  for (const t of tokens) {
    if (t.kind === "abs") {
      const resolved = path.resolve(t.token);
      if (!(resolved === projectAbs || resolved.startsWith(projectAbs + path.sep))) {
        approve = false;
        reasons.push("absolute-outside-demo:" + t.token);
      }
    } else {
      const norm = path.posix.normalize(t.token);
      if (norm === ".." || norm.startsWith("../") || norm.split("/").includes("..")) {
        approve = false;
        reasons.push("relative-escape:" + t.token);
      }
    }
  }
  return { approve, reasons, tokens };
}

// ———————————————— 主流程 ————————————————
const targets = await listTargets();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page target");
const cdp = new CDP(page.webSocketDebuggerUrl);
await cdp.open();

const result = {
  startedAt: nowIso(),
  port: PORT,
  project: PROJECT,
  userData: "/tmp/ans-fixed-userdata",
  message: MESSAGE,
  steps: {},
  timings: {},
  samples: [],
  writeCards: [],
  shellConfirms: [],
  screenshots: {},
  card: null,
  card960: null,
  errors: [],
  pageErrors: null,
};

await cdp.eval(PAGE_HELPERS);
await cdp.waitFor(`window.__intentE2E && window.__intentE2E.ready()`, 45000, 500);
await sleep(500);
result.steps.initial = await cdp.eval(`window.__intentE2E.snapshot()`);

// 0) 新 dist 验证：CDP 取加载中的 HTML 原文哈希 + DOM 资源名
const EXPECTED_HTML = "f779ac60c39d341db7f10d76bde343cc1424c99935bf1859679602427ca1c88b";
let htmlHash = null;
let htmlBytes = null;
try {
  const frameTree = await cdp.send("Page.getFrameTree");
  const frameId = frameTree.frameTree.frame.id;
  const docRes = await cdp.send("Page.getResourceContent", { frameId, url: page.url });
  if (docRes && typeof docRes.content === "string") {
    const buf = docRes.base64Encoded ? Buffer.from(docRes.content, "base64") : Buffer.from(docRes.content, "utf8");
    htmlHash = crypto.createHash("sha256").update(buf).digest("hex");
    htmlBytes = buf.length;
  }
} catch (e) {
  result.steps.distResourceError = String(e);
}
result.dist = {
  expectedHtmlSha256: EXPECTED_HTML,
  loadedHtmlSha256: htmlHash,
  htmlBytes,
  htmlHashMatches: htmlHash === EXPECTED_HTML,
  dom: await cdp.eval(`window.__intentE2E.distLinks()`),
};

// 1) 加载演示项目
let loadReturn;
const tLoad = Date.now();
try {
  loadReturn = await cdp.eval(`window.__ansRenderer.loadProject(${JSON.stringify(PROJECT)})`, true);
} catch (e) {
  loadReturn = { error: String(e) };
}
const waitLoaded = await cdp.waitFor(
  `window.__ansRenderer.state.projectRoot === ${JSON.stringify(PROJECT)} && Array.isArray(window.__ansRenderer.state.roles) && window.__ansRenderer.state.roles.length > 0`,
  60000,
  300,
);
await sleep(900);
result.steps.load = {
  loadReturn,
  loadMs: Date.now() - tLoad,
  waitLoaded,
  state: await cdp.eval(`(() => { const s = window.__ansRenderer.state; return {
    projectRoot: s.projectRoot, governanceModel: s.governanceModel,
    governanceRecord: s.governanceRecord, roles: window.__intentE2E.roles(),
    runtime: s.runtime, selectedRoleId: s.selectedRoleId, sessionOpenRoleId: s.sessionOpenRoleId,
  }; })()`),
};

// 1b) 角色名 + 品牌图标（1360 / 960）
result.steps.roleNames = await cdp.eval(`window.__intentE2E.roleNames()`);
result.steps.roleNamesAssert = {
  expected: ["Draft / 提案", "Crew / 组队", "Steward / 统筹"],
  present: ["Draft / 提案", "Crew / 组队", "Steward / 统筹"].filter((name) =>
    (result.steps.roleNames || []).some((text) => text.includes(name))),
  oldNames: ["报告员", "提名官", "召集人"].filter((name) =>
    (result.steps.roleNames || []).some((text) => text.includes(name))),
};
result.steps.brand = await cdp.eval(`window.__intentE2E.brand()`);
await cdp.eval(`window.resizeTo(1360, 860)`);
await sleep(500);
try {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1360, height: 860, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
} catch { /* ignore */ }
result.steps.brandSize1360 = await cdp.eval(`({ innerWidth: window.innerWidth, innerHeight: window.innerHeight })`);
result.steps.brand1360 = await cdp.eval(`window.__intentE2E.brand()`);
result.screenshots.brandRoles1360 = await cdp.shot(path.join(OUT, "brand-roles-1360x860.png"));
try {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 960, height: 620, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
} catch { /* ignore */ }
result.steps.brandSize960 = await cdp.eval(`({ innerWidth: window.innerWidth, innerHeight: window.innerHeight })`);
result.steps.brand960 = await cdp.eval(`window.__intentE2E.brand()`);
result.steps.roleNames960 = await cdp.eval(`window.__intentE2E.roleNames()`);
result.screenshots.brandRoles960 = await cdp.shot(path.join(OUT, "brand-roles-960x620.png"));
try { await cdp.send("Emulation.clearDeviceMetricsOverride"); } catch { /* ignore */ }
await cdp.eval(`window.resizeTo(1360, 860)`);
await sleep(400);

// 2) 确保 Pi
result.steps.runtimeBefore = await cdp.eval(`(() => ({ runtime: window.__ansRenderer.state.runtime, trigger: (document.getElementById('runtime-select')?.innerText || '').trim(), title: document.getElementById('runtime-select')?.getAttribute('title') || '' }))()`);
if (result.steps.runtimeBefore.runtime !== "pi") {
  result.steps.switch = { call: await cdp.eval(`window.__ansRenderer.selectRuntime('pi')`, true) };
  await cdp.waitFor(`window.__ansRenderer.state.runtime === 'pi'`, 20000, 250);
  await sleep(800);
}
result.steps.runtimeAfter = await cdp.eval(`(() => ({ runtime: window.__ansRenderer.state.runtime, trigger: (document.getElementById('runtime-select')?.innerText || '').trim(), title: document.getElementById('runtime-select')?.getAttribute('title') || '', notice: (document.getElementById('runtime-config-notice')?.innerText || '').trim() }))()`);

// 3) 引擎菜单：记录 Pi「已配置」
await cdp.eval(`document.getElementById('runtime-select')?.click()`);
await sleep(500);
result.steps.engineMenu = await cdp.eval(`window.__intentE2E.engineMenu()`);
result.screenshots.engineMenu = await cdp.shot(path.join(OUT, "engine-menu-pi.png"));
await cdp.eval(`document.getElementById('runtime-select')?.click()`);
await sleep(300);

// 4) 打开 Lead 会话
result.steps.selectLead = { call: await cdp.eval(`window.__ansRenderer.selectRole('liaison')`, true) };
const waitSession = await cdp.waitFor(
  `window.__ansRenderer.state.sessionOpenRoleId === 'liaison' && !!document.getElementById('inp-message')`,
  90000,
  300,
);
await sleep(1200);
result.steps.session = {
  waitSession,
  state: await cdp.eval(`window.__intentE2E.snapshot()`),
};

// 5) 双开关确认（必须关闭，否则需求卡可能被判断 agent 代批而不呈现）
result.steps.judgeTogglesBefore = await cdp.eval(`window.__intentE2E.judgeToggles()`);
if (result.steps.judgeTogglesBefore.decision?.checked) {
  result.steps.judgeDecisionOff = await cdp.eval(`window.__intentE2E.clickJudge('decision')`);
  await sleep(500);
}
if (result.steps.judgeTogglesBefore.approval?.checked) {
  result.steps.judgeApprovalOff = await cdp.eval(`window.__intentE2E.clickJudge('approval')`);
  await sleep(500);
}
result.steps.judgeTogglesAfter = await cdp.eval(`window.__intentE2E.judgeToggles()`);

// 6) 输入并发送
result.steps.compose = await cdp.eval(`(() => {
  const ta = document.getElementById('inp-message');
  if (!ta) return { ok: false, reason: 'no textarea' };
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, ${JSON.stringify(MESSAGE)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return { ok: true, value: ta.value, sendDisabled: document.getElementById('btn-send')?.disabled ?? null };
})()`);
await sleep(300);
const sendClick = await cdp.eval(`(() => { const b = document.getElementById('btn-send'); if (!b) return { ok: false, reason: 'no send' }; if (b.disabled) return { ok: false, reason: 'send disabled' }; b.click(); return { ok: true }; })()`);
const t0 = Date.now();
result.steps.send = { click: sendClick, t0: new Date(t0).toISOString() };
result.timings.sendAt = new Date(t0).toISOString();

let firstBusy = null;
let firstText = null;
let settled = null;
let cardSeen = null;
let last = null;
let lastSampleAt = 0;
const handledWriteIds = new Set();
const deniedWriteIds = new Set();
let writeApprovals = 0;
let intentCard = null;
let timedOut = false;
const start = Date.now();

while (Date.now() - start < TIMEOUT) {
  let snap;
  try {
    snap = await cdp.eval(`window.__intentE2E.snapshot()`);
  } catch (e) {
    result.samples.push({ atMs: Date.now() - t0, error: String(e) });
    await sleep(500);
    continue;
  }
  last = snap;
  const now = Date.now();

  for (const sc of snap.shellConfirm || []) {
    if (!result.shellConfirms.some((x) => x.id === sc.id)) {
      result.shellConfirms.push({ atMs: now - t0, ...sc });
    }
  }

  if (snap.busy && !firstBusy) {
    firstBusy = { wallMs: now - t0, statusText: snap.statusText };
    result.timings.busyAt = new Date(now).toISOString();
    result.screenshots.working = await cdp.shot(path.join(OUT, "intent-working-1360x860.png"));
  }
  if (!firstText && snap.assistantCount > 0 && (snap.lastAssistantText || "").trim() !== "") {
    firstText = { wallMs: now - t0, length: snap.lastAssistantText.length, text: snap.lastAssistantText.slice(0, 400) };
    result.timings.firstAssistantTextAt = new Date(now).toISOString();
  }

  // 需求确认卡？
  const intent = snap.cards.find((c) =>
    c.visible && (
      (c.badgeTexts || []).some((b) => b.includes("需求确认")) ||
      (c.metaLines || []).some((line) => line.includes("权力类型：需求确认"))
    )
  );
  if (intent) {
    intentCard = intent;
    cardSeen = { wallMs: now - t0, requestId: intent.requestId, state: intent.state };
    result.timings.intentCardAt = new Date(now).toISOString();
    result.samples.push({ atMs: now - t0, event: "intent-card-visible", card: intent });
    break;
  }

  // 写盘确认卡：只批准演示项目内路径；其余拒绝并记录
  for (const c of snap.cards) {
    if (!c.visible) continue;
    const isConfirmKind = (c.options || []).length === 0 && (c.actions || []).some((a) => /op-confirm/.test(a.cls));
    const isIntent = (c.badgeTexts || []).some((b) => b.includes("需求确认")) || (c.metaLines || []).some((line) => line.includes("权力类型：需求确认"));
    if (!isConfirmKind || isIntent) continue;
    const decision = decideWriteCard(c);
    const record = {
      atMs: now - t0,
      requestId: c.requestId,
      title: c.title,
      state: c.state,
      decision: decision.approve ? "approve" : "deny",
      reasons: decision.reasons,
      tokens: decision.tokens.map((t) => t.kind + ":" + t.token).slice(0, 40),
      previewHead: (c.previewText || "").slice(0, 500),
    };
    if (c.state !== "open" || handledWriteIds.has(c.requestId)) {
      if (!result.writeCards.some((x) => x.requestId === c.requestId)) result.writeCards.push(record);
      continue;
    }
    if (decision.approve && writeApprovals >= 6) {
      record.decision = "deny";
      record.reasons = [...record.reasons, "approval-cap-reached"];
      decision.approve = false;
    }
    handledWriteIds.add(c.requestId);
    const cls = decision.approve ? ".op-confirm" : ".op-deny";
    const click = await cdp.eval(`window.__intentE2E.clickCardButton(${JSON.stringify(c.requestId)}, ${JSON.stringify(cls)})`);
    if (decision.approve) writeApprovals += 1;
    else deniedWriteIds.add(c.requestId);
    record.click = click;
    result.writeCards.push(record);
    result.samples.push({ atMs: now - t0, event: decision.approve ? "write-card-approved" : "write-card-denied", requestId: c.requestId, reasons: record.reasons });
    await sleep(600);
  }

  if (!snap.busy && firstBusy && !settled && snap.assistantCount > 0) {
    settled = { wallMs: now - t0, statusText: snap.statusText, assistantCount: snap.assistantCount };
    result.timings.settledAt = new Date(now).toISOString();
  }
  if (now - lastSampleAt >= 10000) {
    lastSampleAt = now;
    result.samples.push({
      atMs: now - t0, busy: snap.busy, statusText: snap.statusText,
      assistantCount: snap.assistantCount, cards: snap.cards.length,
      lastAssistantLen: (snap.lastAssistantText || "").length,
      shellConfirm: (snap.shellConfirm || []).length,
    });
  }
  if (settled && !intentCard) {
    // 轮次已结束但卡没来：继续等一小段（历史回放/卡片物化可能滞后），最多 15s
    if (now - start > 15000 && settled.wallMs + 15000 < now - t0) break;
  }
  await sleep(400);
}
if (!intentCard) timedOut = true;

result.timings.loopEndedAt = new Date().toISOString();
result.steps.result = { cardSeen, settled, timedOut, elapsedMs: Date.now() - t0 };

// 7) 需求卡截图（1360×860 / 960×620）+ DOM 快照
if (intentCard) {
  await cdp.eval(`window.__intentE2E.scrollToCard()`);
  await sleep(500);

  await cdp.eval(`window.resizeTo(1360, 860)`);
  await sleep(800);
  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1360, height: 860, deviceScaleFactor: 1, mobile: false });
    await sleep(600);
  } catch (e) {
    result.steps.emulate1360Error = String(e);
  }
  result.steps.size1360 = await cdp.eval(`(() => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, outerWidth: window.outerWidth, outerHeight: window.outerHeight, dpr: window.devicePixelRatio }))()`);
  result.steps.scroll1360 = await cdp.eval(`window.__intentE2E.scrollToCard()`);
  await sleep(500);
  result.card = await cdp.eval(`window.__intentE2E.snapshot()`);
  result.cardRowDebug = await cdp.eval(`window.__intentE2E.rowDebug()`);
  result.screenshots.card1360 = await cdp.shot(path.join(OUT, "intent-card-1360x860.png"));

  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 960, height: 620, deviceScaleFactor: 1, mobile: false });
    await sleep(700);
  } catch (e) {
    result.steps.emulate960Error = String(e);
  }
  result.steps.size960 = await cdp.eval(`(() => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, outerWidth: window.outerWidth, outerHeight: window.outerHeight, dpr: window.devicePixelRatio }))()`);
  result.steps.scroll960 = await cdp.eval(`window.__intentE2E.scrollToCard()`);
  await sleep(500);
  result.card960 = await cdp.eval(`window.__intentE2E.snapshot()`);
  result.screenshots.card960 = await cdp.shot(path.join(OUT, "intent-card-960x620.png"));

  try {
    await cdp.send("Emulation.clearDeviceMetricsOverride");
  } catch { /* ignore */ }
  await cdp.eval(`window.resizeTo(1360, 860)`);
  await sleep(500);
  result.steps.scrollRestored = await cdp.eval(`window.__intentE2E.scrollToCard()`);
  await sleep(300);
  result.cardRestored = await cdp.eval(`window.__intentE2E.snapshot()`);
  result.screenshots.cardRestored = await cdp.shot(path.join(OUT, "intent-card-restored-1360x860.png"));

  // 8) 截图后停止本轮（不回答需求卡）
  const haltClick = await cdp.eval(`window.__intentE2E.halt()`);
  result.steps.halt = { click: haltClick };
  const waitIdle = await cdp.waitFor(`window.__ansRenderer.state.roleBusy?.liaison !== true`, 30000, 500);
  await sleep(1500);
  result.steps.afterHalt = { waitIdle, snap: await cdp.eval(`window.__intentE2E.snapshot()`) };
  result.screenshots.afterHalt = await cdp.shot(path.join(OUT, "intent-card-after-halt-1360x860.png"));
}

result.steps.final = last;
drainErrors(cdp, result.errors);
result.pageErrors = await cdp.eval(`window.__realTest || null`);
result.endedAt = nowIso();
result.elapsedMs = Date.now() - t0;
fs.writeFileSync(path.join(OUT, "model-run.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  ok: !!intentCard,
  out: path.join(OUT, "model-run.json"),
  elapsedMs: result.elapsedMs,
  cardSeen,
  writeCards: result.writeCards.map((w) => ({ id: w.requestId, decision: w.decision, reasons: w.reasons })),
  shellConfirms: result.shellConfirms.length,
  errors: result.errors.length,
  screenshots: result.screenshots,
}, null, 2));
cdp.close();
