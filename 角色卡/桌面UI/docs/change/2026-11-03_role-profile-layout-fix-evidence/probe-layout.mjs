#!/usr/bin/env node
/**
 * 缺陷「点击角色资料挤压中间区域、顶部显示不正常」最小复现探针。
 * 独立 userData；复用 test/桌面UI/phase4a-smoke-preload.cjs（只读，不修改既有 smoke）。
 * 离线 fixture：仅 1 个角色 A、无历史；驱动 window.__ansRenderer 加载项目并选择角色。
 *
 * 运行（仓库根）：
 *   ./node_modules/.bin/electron "角色卡/桌面UI/docs/change/2026-11-03_role-profile-layout-fix-evidence/probe-layout.mjs" <outDir>
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(HERE, "probe-out");
const ENTRY = path.join(REPO, "app/renderer/dist/index.html");
const PRELOAD = path.join(REPO, "test/桌面UI/phase4a-smoke-preload.cjs");
const ROOT = "/probe-project";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "userData"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = { entry: ENTRY, preload: PRELOAD, runs: [], console: [], errors: [] };

const roleA = {
  roleId: "A",
  cardPath: ROOT + "/角色卡/A/role-card.md",
  cardText: "# A\n\n探针用角色资料。\n\n" + "资料内容。\n\n".repeat(40),
  boundary: {
    entries: [
      { kind: "directory", root: "P", path: "app/", purpose: "渲染层" },
      { kind: "file", root: "P", path: "角色卡/A/role-card.md", purpose: "角色卡" },
    ],
  },
  boundaryPath: "角色卡/A/boundary.yaml",
  changelog: { path: "角色卡/A/changelog.md", text: "# 变更记录\n\n探针记录。\n\n" },
  docs: [],
  rootDocs: [],
  documents: [],
};

const listing = (projectRoot = ROOT) => ({
  projectRoot,
  primaryRoleId: "A",
  hasRoles: true,
  warnings: [],
  documentScope: { version: 1, projectViewId: "probe-epoch", projectRoot },
  roles: [{ ...roleA, cardPath: projectRoot + "/角色卡/A/role-card.md" }],
});

ipcMain.handle("app:recovery-state", () => ({ projectRoot: ROOT, roleId: "A", runtime: "claude" }));
ipcMain.handle("app:recovery-ready", () => ({ ok: true }));
ipcMain.handle("app:list-project", (_e, input) => listing(input?.projectRoot || ROOT));
ipcMain.handle("session:open", (_e, input) => ({ ok: true, resumed: true, runtime: input.runtime, projectRoot: input.projectRoot }));
ipcMain.handle("session:history-get", (_e, input) => ({ projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime, rows: [], error: null, skipped: 0 }));
ipcMain.handle("session:live-views", () => []);
ipcMain.handle("session:stop", () => ({ ok: true }));
ipcMain.handle("session:abort", (_e, input) => ({ ok: true, supported: true, ...input }));
ipcMain.handle("session:send", () => ({ ok: true, turnId: "probe-turn" }));
ipcMain.handle("runtime-config:get", (_e, input) => ({ runtime: input.runtime, label: input.runtime, path: "/probe/.env", revision: 0, application: "next-session", missingKeys: [], fields: [] }));
ipcMain.handle("runtime-config:save", (_e, input) => ({ ok: true, runtime: input.runtime, appliedKeys: Object.keys(input.updates || {}), revision: 1, application: "next-session" }));
ipcMain.handle("pi-config:get", () => ({ path: "/probe/.env", fields: [] }));
ipcMain.handle("pi-config:save", () => ({ ok: true, appliedKeys: [] }));
ipcMain.handle("shell:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("decision:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("app:open-external", () => ({ ok: true }));
ipcMain.handle("window:is-maximized", () => false);
ipcMain.handle("project:document-read", () => ({ ok: false, code: "NOT_FOUND", message: "probe" }));

const MEASURE = `(() => {
  const g = (s) => document.querySelector(s);
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  const box = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { rect: rect(el), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, overflowX: cs.overflowX, overflowY: cs.overflowY, flexWrap: cs.flexWrap, flexShrink: cs.flexShrink, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, display: cs.display, whiteSpace: cs.whiteSpace, minWidth: cs.minWidth, maxWidth: cs.maxWidth }; };
  const colMid = g(".col-mid"), head = g(".chat-head"), inner = g(".head-inner"), identity = g(".session-identity"), actions = g(".session-actions"), drawer = g("#right-drawer"), app = g(".app"), appBody = g(".app-body"), chat = g("#chat");
  const dr = rect(drawer), ar = rect(actions), ir = rect(inner), idr = rect(identity), cm = rect(colMid);
  const padR = colMid ? parseFloat(getComputedStyle(colMid).paddingRight) : 0;
  const open = drawer && drawer.dataset.open === "true" && dr && dr.width > 0;
  const card = rect(g("#tab-card"));
  const hit = card ? (() => { const el = document.elementFromPoint(card.left + card.width / 2, card.top + card.height / 2); if (!el) return "none"; if (el.closest("#right-drawer")) return "drawer"; if (el.closest("#tab-card")) return "tab-card"; return el.id || String(el.className).slice(0, 60); })() : null;
  return {
    viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio },
    media: { max680: matchMedia("(max-width: 680px)").matches, max1100: matchMedia("(max-width: 1100px)").matches, min1200: matchMedia("(min-width: 1200px)").matches },
    appClass: app ? app.className : null,
    drawerDataOpen: drawer ? drawer.dataset.open : null,
    drawerTitle: g("#drawer-title") ? g("#drawer-title").textContent : null,
    document: { docClientWidth: document.documentElement.clientWidth, docScrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth, appClientWidth: app ? app.clientWidth : null, appScrollWidth: app ? app.scrollWidth : null, appBodyClientWidth: appBody ? appBody.clientWidth : null, appBodyScrollWidth: appBody ? appBody.scrollWidth : null },
    colLeft: box(g(".col-left")),
    colLeftStyle: (() => { const el = g(".col-left"); if (!el) return null; const cs = getComputedStyle(el); return { opacity: cs.opacity, visibility: cs.visibility, color: cs.color, backgroundColor: cs.backgroundColor, zIndex: cs.zIndex }; })(),
    backdrop: (() => { const el = g("#drawer-backdrop"); if (!el) return null; const cs = getComputedStyle(el); return { rect: rect(el), opacity: cs.opacity, background: cs.backgroundColor, display: cs.display }; })(),
    hitSidebarCenter: (() => { const el = document.elementFromPoint(100, 120); return el ? (el.id || String(el.className).slice(0, 60)) : "none"; })(),
    texts: { chatRole: (() => { const el = g("#chat-role"); return el ? { rect: rect(el), text: el.textContent } : null; })(), contextState: (() => { const el = g("#context-state"); return el ? { rect: rect(el), text: el.textContent } : null; })() },
    colMid: box(colMid),
    colMidStyle: colMid ? { paddingRight: getComputedStyle(colMid).paddingRight, gutter: getComputedStyle(colMid).getPropertyValue("--gutter").trim(), contentMax: getComputedStyle(colMid).getPropertyValue("--content-max").trim(), drawerW: getComputedStyle(colMid).getPropertyValue("--drawer-w").trim() } : null,
    chat: box(chat),
    sessionHead: box(head),
    headInner: box(inner),
    identity: box(identity),
    actions: box(actions),
    actionChildren: [...document.querySelectorAll("#right-tabs > *")].map((el) => ({ id: el.id || null, cls: typeof el.className === "string" ? el.className.slice(0, 80) : "", box: box(el) })),
    drawer: box(drawer),
    overlaps: { actionsPastHeadInner: !!(ar && ir) && ar.right > ir.right + 0.5, actionsPastColMidContentRight: !!(ar && cm) && ar.right > cm.right - padR + 0.5, actionsUnderDrawer: !!(ar && dr && open) && ar.right > dr.left + 0.5, identityOverlapsActions: !!(idr && ar) && idr.right > ar.left + 0.5, tabCardHitDrawer: hit === "drawer" },
    headScroll: { headScrollWidth: head ? head.scrollWidth : null, headClientWidth: head ? head.clientWidth : null, innerScrollWidth: inner ? inner.scrollWidth : null, innerClientWidth: inner ? inner.clientWidth : null },
    hitTestTabCard: hit,
    roleText: g("#chat-role") ? g("#chat-role").textContent : null,
  };
})()`;

let win = null;
const watchdog = setTimeout(() => {
  report.errors.push("WATCHDOG_TIMEOUT");
  try { fs.writeFileSync(path.join(OUT, "probe-report.json"), JSON.stringify(report, null, 2)); } catch { /* 忽略 */ }
  console.log("PROBE_WATCHDOG_TIMEOUT");
  app.exit(2);
}, 120000);

app.whenReady().then(async () => {
  win = new BrowserWindow({
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
  wc.on("did-fail-load", (_e, code, description) => report.errors.push("did-fail-load " + code + " " + description));
  const js = (code) => wc.executeJavaScript(code.includes("await ") ? `(async()=>{${code}})()` : code, true);
  async function waitFor(expr, timeout = 15000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      last = await js(expr).catch((error) => String(error));
      if (last) return last;
      await sleep(60);
    }
    throw new Error("waitFor timeout: " + expr + " last=" + JSON.stringify(last));
  }
  const shot = async (name) => {
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    return path.basename(file);
  };
  const shotCrop = async (name, rect) => {
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, (await wc.capturePage(rect)).toPNG());
    return path.basename(file);
  };
  const measure = (label) => js(MEASURE).then((value) => ({ label, at: new Date().toISOString(), value }));
  try {
    await win.loadFile(ENTRY);
    await waitFor(`!!document.querySelector('#root > .app-shell')`);
    await waitFor(`window.__ansRenderer && window.__ansRenderer.state.selectedRoleId === 'A'`, 20000);
    await waitFor(`document.querySelector('#chat-role') && document.querySelector('#chat-role').textContent.trim().length > 0`);
    await sleep(500);
    for (const size of [{ label: "1360x860", width: 1360, height: 860 }, { label: "1200x800", width: 1200, height: 800 }]) {
      win.setContentSize(size.width, size.height);
      await sleep(700);
      report.runs.push({ kind: "closed", ...(await measure(size.label + ":closed")), screenshot: await shot(size.label + "-closed") });
      await js(`document.getElementById('tab-card').click()`);
      await waitFor(`document.querySelector('#right-drawer') && document.querySelector('#right-drawer').dataset.open === 'true'`);
      await sleep(450);
      const openValue = await measure(size.label + ":open-card");
      const openShot = await shot(size.label + "-open-card");
      const openCrop = await shotCrop(size.label + "-open-card-header", { x: 0, y: 36, width: Math.min(900, size.width), height: 190 });
      report.runs.push({ kind: "open-card", ...openValue, screenshot: openShot, headerScreenshot: openCrop });
      await js(`document.getElementById('tab-work').click()`);
      await sleep(450);
      report.runs.push({ kind: "open-work", ...(await measure(size.label + ":open-work")), screenshot: await shot(size.label + "-open-work") });
      await js(`document.getElementById('drawer-close').click()`);
      await waitFor(`document.querySelector('#right-drawer').dataset.open === 'false'`);
      await sleep(450);
      report.runs.push({ kind: "reclosed", ...(await measure(size.label + ":reclosed")), screenshot: await shot(size.label + "-reclosed") });
    }
    fs.writeFileSync(path.join(OUT, "probe-report.json"), JSON.stringify(report, null, 2));
    for (const run of report.runs) {
      const v = run.value;
      console.log(`RUN ${run.label} inner=${v.viewport.innerWidth}x${v.viewport.innerHeight} colMid=${v.colMid.rect.width} padR=${v.colMidStyle.paddingRight} headClient=${v.headInner.clientWidth} innerScroll=${v.headInner.scrollWidth} actionsRight=${v.actions.rect.right.toFixed(1)} drawerLeft=${v.drawer.rect.width ? v.drawer.rect.left.toFixed(1) : "-"} under=${v.overlaps.actionsUnderDrawer} pastInner=${v.overlaps.actionsPastHeadInner} hitCard=${v.hitTestTabCard}`);
    }
    console.log("PROBE_OK");
    clearTimeout(watchdog);
    app.exit(0);
  } catch (error) {
    report.errors.push(String(error && error.stack ? error.stack : error));
    try { fs.writeFileSync(path.join(OUT, "probe-report.json"), JSON.stringify(report, null, 2)); } catch { /* 忽略 */ }
    console.log("PROBE_FAILED " + String(error));
    clearTimeout(watchdog);
    app.exit(2);
  }
});
