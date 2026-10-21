#!/usr/bin/env node
/**
 * 修复后构建（34484f3）真机复核 B：genesis 项目历史回放只读检查。
 * - 加载 /Users/wangzhongren/code/vibeingcode/ans-testbed/ui-platform-genesis-demo（不发送任何消息）；
 * - 打开 convener 与 todo-app-dev 的聊天 pane，统计 [派发] 行（去重后）及 stepId；
 * - 截图 1360/960（含派发行与侧栏品牌图标）。
 * 测试角色；只写证据目录，不写 genesis 项目。不读取/打印 .env。
 *
 * usage: node genesis-replay.mjs <cdpPort> <genesisDir> <outDir>
 */
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.argv[2] || 9340);
const GEN = process.argv[3];
const OUT = process.argv[4];
if (!GEN || !OUT) throw new Error("usage: node genesis-replay.mjs <cdpPort> <genesisDir> <outDir>");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

class CDP {
  constructor(url) { this.url = url; this.ws = null; this.id = 0; this.pending = new Map(); this.events = []; }
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
      } else if (msg.method) this.events.push(msg);
    });
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    await this.send("Log.enable");
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expression, awaitPromise = true) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error("EVAL: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result?.value;
  }
  async waitFor(expression, timeoutMs = 15000, intervalMs = 250) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeoutMs) {
      try {
        last = await this.eval(expression, true);
        if (last) return { ok: true, value: last, ms: Date.now() - start };
      } catch (e) { last = String(e); }
      await sleep(intervalMs);
    }
    return { ok: false, value: last, ms: Date.now() - start };
  }
  async shot(file) {
    const r = await this.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    fs.writeFileSync(file, Buffer.from(r.data, "base64"));
    return file;
  }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

const errors = [];
function drainErrors(cdp, into) {
  for (const e of cdp.events) {
    if (e.method === "Runtime.exceptionThrown") into.push({ type: "exception", at: nowIso(), text: e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text });
    else if (e.method === "Log.entryAdded" && ["error", "warning"].includes(e.params.entry.level)) into.push({ type: "log", at: nowIso(), level: e.params.entry.level, source: e.params.entry.source, text: e.params.entry.text, url: e.params.entry.url });
    else if (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") into.push({ type: "console", at: nowIso(), text: (e.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ") });
  }
  cdp.events.length = 0;
}

const PAGE_HELPERS = String.raw`
(() => {
  if (window.__genesisE2E) return true;
  window.__realTest = window.__realTest || { errors: [], rejections: [], csp: [] };
  addEventListener('error', (e) => window.__realTest.errors.push(String(e.message || e.error || e)));
  addEventListener('unhandledrejection', (e) => window.__realTest.rejections.push(String(e.reason)));
  document.addEventListener('securitypolicyviolation', (e) => window.__realTest.csp.push({ directive: e.violatedDirective, blockedURI: e.blockedURI }));
  const chat = () => document.getElementById('chat');
  const absTop = (el) => {
    const c = chat();
    if (!el || !c) return null;
    return Math.round(el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop);
  };
  window.__genesisE2E = {
    ready: () => typeof window.__ansRenderer === 'object' && !!window.__ansRenderer.state,
    roleNames: () => [...document.querySelectorAll('#role-tree .tree-item .ti-name')].map((el) => (el.textContent || '').trim()),
    paneDebug: (role) => window.__ansRenderer.paneDebug(role),
    rowDebug: (role) => window.__ansRenderer.rowModelDebug(role),
    metrics: () => {
      const c = chat();
      return c ? {
        scrollTop: Math.round(c.scrollTop), scrollHeight: c.scrollHeight, clientHeight: c.clientHeight,
        rows: document.querySelectorAll('#chat .chat-row').length,
        dispatchRows: document.querySelectorAll('#chat .msg-injected.is-dispatch').length,
        userRows: document.querySelectorAll('#chat .msg-user').length,
      } : null;
    },
    collectVisibleDispatches: () => [...document.querySelectorAll('#chat .msg-injected.is-dispatch')].map((el) => {
      const row = el.closest('.chat-row');
      const bodyEl = el.querySelector('.mi-body');
      const body = ((bodyEl && bodyEl.innerText) || '').trim();
      const stepIds = [...body.matchAll(/stepId=([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
      return {
        rowId: row ? row.getAttribute('data-row-id') : '',
        chip: ((el.querySelector('.mi-chip') && el.querySelector('.mi-chip').innerText) || '').trim(),
        bodyFirst: body.split('\n')[0].slice(0, 300),
        bodyLen: body.length,
        stepIds: [...new Set(stepIds)],
        offsetTop: row ? absTop(row) : null,
      };
    }),
    scrollToRow: (rowId, offsetTop) => {
      const c = chat();
      if (!c) return { ok: false, reason: 'no-chat' };
      if (typeof offsetTop === 'number') c.scrollTop = Math.max(0, offsetTop - 120);
      const row = [...document.querySelectorAll('#chat .chat-row')].find((el) => el.getAttribute('data-row-id') === rowId);
      if (row) {
        const top = absTop(row);
        if (top !== null && (top < c.scrollTop + 40 || top > c.scrollTop + c.clientHeight - 80)) {
          c.scrollTop = Math.max(0, top - 120);
        }
      }
      return { ok: true, scrollTop: c.scrollTop, requested: offsetTop, rowRendered: !!row };
    },
    brand: () => {
      const info = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          tagName: el.tagName, className: el.className, alt: el.getAttribute('alt'),
          widthAttr: el.getAttribute('width'), heightAttr: el.getAttribute('height'),
          naturalWidth: el.naturalWidth ?? null, naturalHeight: el.naturalHeight ?? null,
          src: el.getAttribute('src'),
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        };
      };
      const directText = (el) => [...(el ? el.childNodes : [])].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => (n.textContent || '').trim()).filter(Boolean).join(' ');
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
  };
  return true;
})()
`;

// —— 原始回放统计（只读） ——
function rawDispatchStats(role) {
  const file = path.join(GEN, ".ans", "sessions", role, "pi", "ans", "replay.jsonl");
  const stats = { file, exists: fs.existsSync(file), lines: 0, userDispatch: 0, eventDispatch: 0, userRows: 0, eventRows: 0 };
  if (!stats.exists) return stats;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    stats.lines += 1;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.kind === "user") {
      stats.userRows += 1;
      if (typeof o.text === "string" && /^\[派发\]/.test(o.text)) stats.userDispatch += 1;
    } else if (o.kind === "event") {
      stats.eventRows += 1;
      const summary = o.event && o.event.kind === "message" && typeof o.event.summary === "string" ? o.event.summary : "";
      if (/^用户指令：\[派发\]/.test(summary) || /^\[派发\]/.test(summary)) stats.eventDispatch += 1;
    }
  }
  return stats;
}

const targets = await listTargets();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page target");
const cdp = new CDP(page.webSocketDebuggerUrl);
await cdp.open();
await cdp.eval(PAGE_HELPERS);
await cdp.waitFor(`window.__genesisE2E && window.__genesisE2E.ready()`, 45000, 500);
await sleep(400);

const result = {
  startedAt: nowIso(),
  project: GEN,
  readOnly: "不发送消息",
  steps: {},
  panes: {},
  screenshots: {},
  errors: [],
  pageErrors: null,
};

// 加载 genesis 项目（只读：不发送任何消息）
let loadReturn;
try { loadReturn = await cdp.eval(`window.__ansRenderer.loadProject(${JSON.stringify(GEN)})`, true); }
catch (e) { loadReturn = { error: String(e) }; }
const waitLoaded = await cdp.waitFor(
  `window.__ansRenderer.state.projectRoot === ${JSON.stringify(GEN)} && Array.isArray(window.__ansRenderer.state.roles) && window.__ansRenderer.state.roles.length > 0`,
  60000, 300,
);
await sleep(1000);
result.steps.load = {
  loadReturn, waitLoaded,
  state: await cdp.eval(`(() => { const s = window.__ansRenderer.state; return { projectRoot: s.projectRoot, governanceModel: s.governanceModel, runtime: s.runtime, roles: s.roles.map((r) => ({ id: r.roleId, name: r.displayName || r.roleId, builtIn: r.builtIn === true })) }; })()`),
};
result.steps.roleNames = await cdp.eval(`window.__genesisE2E.roleNames()`);
result.steps.brand = await cdp.eval(`window.__genesisE2E.brand()`);

// 顶部（角色树 + 品牌）截图 1360/960
await cdp.eval(`window.resizeTo(1360, 860)`);
await sleep(400);
try { await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1360, height: 860, deviceScaleFactor: 1, mobile: false }); await sleep(500); } catch { /* ignore */ }
result.screenshots.tree1360 = await cdp.shot(path.join(OUT, "genesis-tree-1360x860.png"));
try { await cdp.send("Emulation.setDeviceMetricsOverride", { width: 960, height: 620, deviceScaleFactor: 1, mobile: false }); await sleep(500); } catch { /* ignore */ }
result.screenshots.tree960 = await cdp.shot(path.join(OUT, "genesis-tree-960x620.png"));
try { await cdp.send("Emulation.clearDeviceMetricsOverride"); } catch { /* ignore */ }
await cdp.eval(`window.resizeTo(1360, 860)`);
await sleep(400);

async function openPane(role) {
  const select = await cdp.eval(`window.__ansRenderer.selectRole(${JSON.stringify(role)})`, true);
  const waitSession = await cdp.waitFor(`window.__ansRenderer.state.sessionOpenRoleId === ${JSON.stringify(role)}`, 60000, 300);
  // 等历史回放稳定（loading=false 且 text/rows 连续两次不变）
  let stable = 0;
  let prev = "";
  let last = null;
  const start = Date.now();
  while (Date.now() - start < 90000) {
    last = await cdp.eval(`(() => { const p = window.__ansRenderer.paneDebug(${JSON.stringify(role)}); return p ? { loading: p.loading, textLen: (p.text || '').length, rowCount: (window.__ansRenderer.rowModelDebug(${JSON.stringify(role)}) || {}).count || 0, text: p.text || '' } : null; })()`);
    if (last && last.loading === false && last.textLen > 0) {
      const sig = last.textLen + ":" + last.rowCount;
      if (sig === prev) stable += 1; else stable = 0;
      prev = sig;
      if (stable >= 3) break;
    }
    await sleep(400);
  }
  await sleep(500);
  return { select, waitSession, last };
}

async function collectPane(role) {
  const debug = await cdp.eval(`window.__genesisE2E.paneDebug(${JSON.stringify(role)})`);
  const rowDebug = await cdp.eval(`window.__genesisE2E.rowDebug(${JSON.stringify(role)})`);
  const metrics0 = await cdp.eval(`window.__genesisE2E.metrics()`);
  const chat = await cdp.eval(`(() => { const c = document.getElementById('chat'); return c ? { scrollHeight: c.scrollHeight, clientHeight: c.clientHeight } : null; })()`);
  const seen = new Map();
  if (chat) {
    const step = Math.max(160, chat.clientHeight - 40);
    let y = 0;
    let guard = 0;
    while (y <= chat.scrollHeight + step && guard < 400) {
      await cdp.eval(`(() => { const c = document.getElementById('chat'); if (c) c.scrollTop = ${y}; return true; })()`);
      await sleep(70);
      const rows = await cdp.eval(`window.__genesisE2E.collectVisibleDispatches()`);
      for (const row of rows) if (row.rowId && !seen.has(row.rowId)) seen.set(row.rowId, row);
      y += step;
      guard += 1;
    }
    await cdp.eval(`(() => { const c = document.getElementById('chat'); if (c) c.scrollTop = 0; return true; })()`);
    await sleep(200);
  }
  const dispatchRows = [...seen.values()].sort((a, b) => (a.offsetTop ?? 0) - (b.offsetTop ?? 0));
  const labelCount = (String(debug && debug.text || "").match(/派发任务 · 来自/g) || []).length;
  const duplicateFirsts = {};
  for (const row of dispatchRows) {
    const key = row.chip + "|" + row.bodyFirst;
    duplicateFirsts[key] = (duplicateFirsts[key] || 0) + 1;
  }
  const duplicated = Object.entries(duplicateFirsts).filter(([, n]) => n > 1).map(([k, n]) => ({ key: k.slice(0, 200), count: n }));
  const stepIdCounts = {};
  for (const row of dispatchRows) for (const id of row.stepIds) stepIdCounts[id] = (stepIdCounts[id] || 0) + 1;
  return {
    role,
    debug: { loading: debug && debug.loading, textLen: (debug && debug.text || "").length, rowCount: rowDebug && rowDebug.count, operators: rowDebug && rowDebug.operators, textHead: (debug && debug.text || "").slice(0, 600) },
    metrics0,
    labelCount,
    dispatchRows: dispatchRows.map((r) => ({ rowId: r.rowId, chip: r.chip, bodyFirst: r.bodyFirst, bodyLen: r.bodyLen, stepIds: r.stepIds, offsetTop: r.offsetTop })),
    dispatchRowCount: dispatchRows.length,
    duplicated,
    stepIdCounts,
  };
}

// 依次打开两个 pane（只读回放，不发送消息）
for (const role of ["convener", "todo-app-dev"]) {
  const opened = await openPane(role);
  const pane = await collectPane(role);
  const raw = rawDispatchStats(role);
  result.panes[role] = {
    opened: { select: opened.select, waitSession: opened.waitSession, stable: opened.last ? { loading: opened.last.loading, textLen: opened.last.textLen, rowCount: opened.last.rowCount } : null },
    raw,
    before: { rawDispatchProjections: raw.userDispatch + raw.eventDispatch, userDispatch: raw.userDispatch, eventDispatch: raw.eventDispatch, replayLines: raw.lines },
    after: { dispatchRows: pane.dispatchRowCount, labelCount: pane.labelCount, rowCount: pane.debug.rowCount, textLen: pane.debug.textLen, duplicated: pane.duplicated, stepIdCounts: pane.stepIdCounts },
    rows: pane.dispatchRows,
  };

  // 滚动到第一条派发行并截 1360 / 960
  const first = pane.dispatchRows[0];
  if (first) {
    await cdp.eval(`window.resizeTo(1360, 860)`);
    await sleep(300);
    try { await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1360, height: 860, deviceScaleFactor: 1, mobile: false }); await sleep(400); } catch { /* ignore */ }
    const scroll = await cdp.eval(`window.__genesisE2E.scrollToRow(${JSON.stringify(first.rowId)}, ${JSON.stringify(first.offsetTop)})`);
    await sleep(600);
    const scrollAdjust = await cdp.eval(`window.__genesisE2E.scrollToRow(${JSON.stringify(first.rowId)}, ${JSON.stringify(first.offsetTop)})`);
    await sleep(400);
    result.panes[role].scroll1360 = { first: scroll, adjust: scrollAdjust };
    result.panes[role].viewport1360 = await cdp.eval(`({ innerWidth: window.innerWidth, innerHeight: window.innerHeight })`);
    result.panes[role].visible1360 = await cdp.eval(`window.__genesisE2E.collectVisibleDispatches()`);
    result.screenshots[role + "1360"] = await cdp.shot(path.join(OUT, `${role}-dispatch-1360x860.png`));
    try { await cdp.send("Emulation.setDeviceMetricsOverride", { width: 960, height: 620, deviceScaleFactor: 1, mobile: false }); await sleep(500); } catch { /* ignore */ }
    const scroll960 = await cdp.eval(`window.__genesisE2E.scrollToRow(${JSON.stringify(first.rowId)}, ${JSON.stringify(first.offsetTop)})`);
    await sleep(600);
    const scroll960Adjust = await cdp.eval(`window.__genesisE2E.scrollToRow(${JSON.stringify(first.rowId)}, ${JSON.stringify(first.offsetTop)})`);
    await sleep(400);
    result.panes[role].scroll960 = { first: scroll960, adjust: scroll960Adjust };
    result.panes[role].viewport960 = await cdp.eval(`({ innerWidth: window.innerWidth, innerHeight: window.innerHeight })`);
    result.panes[role].visible960 = await cdp.eval(`window.__genesisE2E.collectVisibleDispatches()`);
    result.screenshots[role + "960"] = await cdp.shot(path.join(OUT, `${role}-dispatch-960x620.png`));
    try { await cdp.send("Emulation.clearDeviceMetricsOverride"); } catch { /* ignore */ }
    await cdp.eval(`window.resizeTo(1360, 860)`);
    await sleep(300);
  }
}

drainErrors(cdp, result.errors);
result.pageErrors = await cdp.eval(`window.__realTest || null`);
result.endedAt = nowIso();
fs.writeFileSync(path.join(OUT, "genesis-run.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  ok: true,
  out: path.join(OUT, "genesis-run.json"),
  roleNames: result.steps.roleNames,
  panes: Object.fromEntries(Object.entries(result.panes).map(([role, p]) => [role, {
    before: p.before, after: p.after,
    dispatchRows: p.rows.map((r) => ({ chip: r.chip, first: r.bodyFirst, steps: r.stepIds })),
    screenshots: [result.screenshots[role + "1360"], result.screenshots[role + "960"]],
  }])),
  errors: result.errors.length,
  pageErrors: result.pageErrors,
}, null, 2));
cdp.close();
