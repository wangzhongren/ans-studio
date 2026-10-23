#!/usr/bin/env node
/**
 * B4 布局收口证据：真实 Electron（临时 userData）验证设置面板保存条可达。
 *
 * 覆盖 I9 P6 失败场景：960×620 物理窗口 @200% zoom（CSS 480×310）下，
 * `#pi-save` 必须可见且中心命中；设置面板可滚动、保存条 sticky 贴底。
 * 同时回归 960×620（zoom 1）zh/en 原布局不变（flex、无强制滚动条、保存条 static）。
 *
 * 运行（仓库根；zh/en 各自独立启动，避免同页切语言的截图旧帧）：
 *   TAG=zh INIT_LOCALE=zh-CN ./node_modules/.bin/electron "角色卡/桌面UI/docs/change/2026-10-23_change_i18n-b4-evidence/layout-200pct-electron-smoke.mjs"
 *   TAG=en INIT_LOCALE=en-US ./node_modules/.bin/electron "角色卡/桌面UI/docs/change/2026-10-23_change_i18n-b4-evidence/layout-200pct-electron-smoke.mjs"
 * 可选输出目录（默认同目录 layout-200pct/<TAG>/）：
 *   ... layout-200pct-electron-smoke.mjs <outDir>
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUNTIME_SETTINGS } from "../../../../../src/common/shared/runtime-settings.ts";
import { translate } from "../../../../../src/common/shared/i18n/index.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");
const ENTRY = path.join(REPO, "app", "renderer", "dist", "index.html");
const PRELOAD = path.join(REPO, "app", "preload.cjs");
const OUT = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(HERE, "layout-200pct", process.env.TAG || "");
const ROOT = "C:/ans-b4-layout-project";
const INIT_LOCALE = process.env.INIT_LOCALE === "en-US" ? "en-US" : "zh-CN";
const SHORT = INIT_LOCALE === "en-US" ? "en" : "zh";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "ans-b4-layout-userdata-")));

const report = { entry: ENTRY, locale: INIT_LOCALE, checks: [], console: [], screenshots: [], failures: 0 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let win = null;
let currentLocale = INIT_LOCALE;

function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail === undefined ? null : detail });
  if (value !== true) report.failures += 1;
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
  return value === true;
}

const role = (roleId) => ({
  roleId,
  cardText: "# " + roleId,
  cardPath: "",
  boundary: { entries: [] },
  boundaryPath: "",
  builtIn: false,
  governanceFunction: null,
  changelog: null,
  docs: [],
});
const listing = () => ({
  projectRoot: ROOT,
  primaryRoleId: "liaison",
  hasRoles: true,
  warnings: [],
  governanceModel: "trio",
  governanceRecord: { state: "present" },
  roles: [{ ...role("liaison"), builtIn: true, governanceFunction: "liaison" }, role("B")],
});

function runtimeConfig(runtime) {
  const definition = RUNTIME_SETTINGS[runtime];
  return {
    runtime,
    label: definition.label,
    path: ROOT + "/.env",
    revision: 0,
    application: "next-session",
    missingKeys: [],
    fields: definition.fields.map((field) => ({
      key: field.key,
      label: translate(currentLocale, field.labelKey),
      ...(field.helpKey ? { help: translate(currentLocale, field.helpKey) } : {}),
      ...(field.choiceLabelKeys
        ? { choiceLabels: field.choiceLabelKeys.map((key) => translate(currentLocale, key)) }
        : {}),
      required: field.required,
      secret: field.secret,
      ...(field.fallbackKeys ? { fallbackKeys: field.fallbackKeys } : {}),
      ...(field.choices ? { choices: field.choices } : {}),
      ...(field.control ? { control: field.control } : {}),
      ...(field.integer ? { integer: field.integer } : {}),
      value: "",
      isSet: field.required === true,
      source: field.required === true ? "environment" : "default",
    })),
  };
}

ipcMain.handle("app:recovery-state", () => null);
ipcMain.handle("app:recovery-ready", () => ({ ok: true }));
ipcMain.handle("app:list-project", () => listing());
ipcMain.handle("app:pick-project", () => ROOT);
ipcMain.handle("app:renderer-diagnostic", () => ({ ok: true }));
ipcMain.handle("window:is-maximized", () => false);
ipcMain.handle("preferences:get", () => ({
  version: 1,
  locale: currentLocale,
  supported: ["zh-CN", "en-US"],
}));
ipcMain.handle("preferences:set-locale", (_event, input) => {
  const locale = input?.locale;
  console.log("IPC preferences:set-locale", locale, "current", currentLocale);
  if (locale !== "zh-CN" && locale !== "en-US") {
    return { ok: false, locale: currentLocale, error: "unsupported-locale" };
  }
  currentLocale = locale;
  if (win && !win.isDestroyed()) {
    win.webContents.send("preferences:locale-changed", { locale });
  }
  return { ok: true, locale };
});
ipcMain.handle("runtime-config:get", (_event, input) => {
  console.log("IPC runtime-config:get", input.runtime, "locale", currentLocale);
  return runtimeConfig(input.runtime);
});
ipcMain.handle("runtime-config:save", (_event, input) => ({
  ok: true,
  runtime: input.runtime,
  appliedKeys: Object.keys(input.updates || {}),
  revision: 1,
  application: "next-session",
}));
ipcMain.handle("session:open", (_event, input) => ({
  ok: true,
  resumed: true,
  contextSource: "resumed",
  runtime: input.runtime,
  projectRoot: input.projectRoot,
}));
ipcMain.handle("session:history-get", (_event, input) => ({
  projectRoot: input.projectRoot,
  roleId: input.roleId,
  runtime: input.runtime,
  rows: [],
  error: null,
  skipped: 0,
}));
ipcMain.handle("session:live-views", () => []);
ipcMain.handle("session:live", () => []);
ipcMain.handle("session:stop", () => ({ ok: true }));
ipcMain.handle("session:abort", (_event, input) => ({ ok: true, supported: true, ...input }));
ipcMain.handle("session:send", () => ({ ok: true }));
ipcMain.handle("session:withdraw", () => ({ ok: true }));
ipcMain.handle("session:get-persistence", (_event, input) => ({
  ok: true,
  version: 1,
  scope: { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime },
  value: { mode: "enabled", reportSaveSupported: true, deliveryHistorySaveSupported: true, querySupported: true },
}));
ipcMain.handle("report:get-save-state", () => ({ ok: false, code: "DISABLED" }));
ipcMain.handle("delivery:get-receipt", () => ({ ok: false, code: "DISABLED" }));
ipcMain.handle("shell:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("decision:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("project:document-read", () => ({ ok: false, code: "NOT_LISTED" }));

app.whenReady().then(async () => {
  win = new BrowserWindow({
    width: 960,
    height: 620,
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
  // 隐藏窗口的 capturePage 可能返回旧帧（尤其切语言/缩放后）；无焦点显示以保证截图与几何一致。
  win.showInactive();
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
      await sleep(80);
    }
    return last;
  }
  const shot = async (name) => {
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    report.screenshots.push(path.basename(file));
  };

  const measure = () =>
    js(`(() => {
      const info = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return { sel, missing: true };
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          sel, rect: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2), top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2) },
          display: cs.display, position: cs.position, overflowY: cs.overflowY,
          scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
          scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
        };
      };
      const save = document.getElementById('pi-save');
      const sr = save ? save.getBoundingClientRect() : null;
      const center = sr ? { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 } : null;
      const hit = center && center.x >= 0 && center.y >= 0 && center.x <= innerWidth && center.y <= innerHeight
        ? document.elementFromPoint(center.x, center.y) : null;
      return {
        lang: document.documentElement.lang,
        viewport: { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio },
        sidebar: info('#sidebar'), titlebar: info('#titlebar'),
        drawer: info('#right-drawer'), panel: info('#pi-panel'),
        language: info('#pi-language-section'), tabs: info('.pi-engine-tabs'),
        tabpanel: info('.pi-tabpanel'), scroll: info('.pi-scroll'), savebar: info('.pi-save-bar'),
        save: save ? {
          rect: { x: +sr.x.toFixed(2), y: +sr.y.toFixed(2), w: +sr.width.toFixed(2), h: +sr.height.toFixed(2), bottom: +sr.bottom.toFixed(2) },
          centerInsideViewport: !!(center && center.x >= 0 && center.y >= 0 && center.x <= innerWidth && center.y <= innerHeight),
          hit: !!(hit && (save === hit || save.contains(hit))),
        } : null,
        doc: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
      };
    })()`);

  const measureAfterScroll = async () => {
    await js(`(() => {
      const panel = document.getElementById('pi-panel');
      if (panel) panel.scrollTop = panel.scrollHeight;
      return panel ? panel.scrollTop : null;
    })()`);
    await sleep(250);
    return js(`(() => {
      const panel = document.getElementById('pi-panel');
      const save = document.getElementById('pi-save');
      const sr = save ? save.getBoundingClientRect() : null;
      const center = sr ? { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 } : null;
      const hit = center && center.x >= 0 && center.y >= 0 && center.x <= innerWidth && center.y <= innerHeight
        ? document.elementFromPoint(center.x, center.y) : null;
      return {
        panelScrollTop: panel ? panel.scrollTop : null,
        panelScrollMax: panel ? panel.scrollHeight - panel.clientHeight : null,
        saveHit: !!(hit && save && (save === hit || save.contains(hit))),
      };
    })()`);
  };

  const layoutCheck = (name, m, mode) => {
    const saveHit = m.save?.hit === true && m.save?.centerInsideViewport === true;
    const noHorizontal = m.doc.sw <= m.doc.cw + 1;
    if (mode === "960") {
      return check(name, saveHit && noHorizontal
        && m.panel.display === "flex"
        && m.panel.overflowY === "visible"
        && m.savebar.position === "static"
        && m.sidebar.rect.w === 208
        && m.viewport.vw === 960 && m.viewport.vh === 620, m);
    }
    return check(name, saveHit && noHorizontal
      && m.panel.display === "block"
      && m.panel.overflowY === "auto"
      && m.panel.scrollHeight > m.panel.clientHeight
      && m.savebar.position === "sticky"
      && m.sidebar.rect.w === 208
      && m.viewport.vw === 480 && m.viewport.vh === 310, m);
  };

  try {
    await win.loadFile(ENTRY);
    await sleep(600);
    await waitFor(`!!document.querySelector('#root > .app-shell')`);
    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);
    await sleep(500);
    await js(`window.__ansRenderer.sidebar.setWidth(208)`);
    await js(`await window.__ansRenderer.selectRole('B')`);
    await sleep(250);
    await js(`await window.__ansRenderer.openPiPanel('pi')`);
    await sleep(900);

    // 1. 960×620：原 flex 布局不变，保存按钮中心可点。
    const base = await measure();
    layoutCheck(`960x620 ${INIT_LOCALE} settings save reachable; layout unchanged`, base, "960");
    await shot(`settings-960-${SHORT}`);

    // 2. 200%（CSS 480×310）：面板自身可滚、保存条 sticky 贴底、按钮中心命中。
    wc.setZoomFactor(2);
    await sleep(700);
    const zoomed = await measure();
    layoutCheck(`200pct (480x310) ${INIT_LOCALE} save reachable; panel scrolls; savebar sticky`, zoomed, "200");
    await shot(`settings-200-${SHORT}`);
    const zoomedAfter = await measureAfterScroll();
    check(`200pct ${INIT_LOCALE} save still reachable after scrolling to bottom`,
      zoomedAfter.saveHit === true && zoomedAfter.panelScrollMax > 0, zoomedAfter);
    await shot(`settings-200-${SHORT}-bottom`);

    const badConsole = report.console.filter((item) => String(item.level) === "error" || item.level === 3);
    check("no console errors", badConsole.length === 0, badConsole);
  } catch (error) {
    report.failures += 1;
    report.error = String(error && error.stack ? error.stack : error);
    console.error("LAYOUT_SMOKE_ERROR", report.error);
  } finally {
    report.finished = true;
    report.at = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log("LAYOUT_SMOKE_DONE failures=" + report.failures + " checks=" + report.checks.length + " out=" + OUT);
    app.exit(report.failures === 0 ? 0 : 1);
  }
});
