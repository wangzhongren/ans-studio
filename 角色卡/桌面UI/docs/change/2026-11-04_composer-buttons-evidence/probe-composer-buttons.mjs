#!/usr/bin/env node
/**
 * 2026-11-04 输入区精简（移除发送按钮 / 「停止本轮」改纯图标）——真实 Electron 离线前后探针。
 * 用法（仓库根）：
 *   ./node_modules/.bin/electron "角色卡/桌面UI/docs/change/2026-11-04_composer-buttons-evidence/probe-composer-buttons.mjs" before|after <outDir>
 * before：发送按钮存在可见；停止按钮空闲隐藏、进行中可见且带「停止本轮」文字；Enter 发送生效；1200/1360 无溢出/重叠。
 * after：发送按钮已移除；停止按钮为空闲隐藏/进行中可见的纯图标（无文字、含 SVG、title/aria-label=停止本轮、28x28）；点击仍按既有 target 中止；Enter 发送生效；1200/1360 布局无回归。
 * 只读复用既有 test/桌面UI/phase4b-smoke-preload.cjs（不改动该文件）。
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");
const PHASE = process.argv[2] === "after" ? "after" : "before";
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : path.join(HERE, PHASE);
const ENTRY = path.join(REPO, "app/renderer/dist/index.html");
const PRELOAD = path.join(REPO, "test/桌面UI/phase4b-smoke-preload.cjs");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const ROOT = "/probe-composer-project";
const report = { phase: PHASE, entry: ENTRY, checks: [], console: [], failures: 0, screenshots: [], facts: {} };
const calls = { sends: [], aborts: [] };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, value, detail) {
  report.checks.push({ name: name, value: value === true, detail: detail === undefined ? null : detail });
  if (value !== true) { report.failures += 1; }
  console.log("CHECK " + name + "=" + JSON.stringify(value) + (detail !== undefined ? " " + JSON.stringify(detail) : ""));
  return value === true;
}

function listing() {
  return {
    projectRoot: ROOT,
    primaryRoleId: "P",
    hasRoles: true,
    warnings: [],
    governanceModel: "trio",
    governanceRecord: { state: "present" },
    roles: [{ roleId: "P", cardText: "# P", cardPath: ROOT + "/角色卡/P/role-card.md", boundary: { entries: [] }, boundaryPath: "", builtIn: false, changelog: null, docs: [] }]
  };
}

ipcMain.handle("app:recovery-state", () => ({}));
ipcMain.handle("app:recovery-ready", () => ({ ok: true }));
ipcMain.handle("app:list-project", () => listing());
ipcMain.handle("session:open", (_e, input) => ({ ok: true, resumed: true, contextSource: "resumed", runtime: input.runtime, projectRoot: input.projectRoot }));
ipcMain.handle("session:history-get", (_e, input) => ({ projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime, rows: [], error: null, skipped: 0 }));
ipcMain.handle("session:live-views", () => []);
ipcMain.handle("session:stop", () => ({ ok: true }));
ipcMain.handle("session:abort", (_e, input) => {
  calls.aborts.push(input);
  return { ok: true, supported: true };
});
ipcMain.handle("session:send", (_e, input) => {
  calls.sends.push(input);
  return { ok: true, turnId: "probe-turn-" + calls.sends.length, sessionCurrent: true };
});
ipcMain.handle("session:withdraw", () => ({ ok: true }));
ipcMain.handle("shell:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("decision:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("runtime-config:get", (_e, input) => ({ runtime: input.runtime, label: input.runtime, path: ROOT + "/.env", revision: 0, application: "next-session", missingKeys: [], fields: [] }));

const outer = (input, value) => ({ ok: true, version: 1, scope: { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime }, value: value });
ipcMain.handle("session:get-persistence", (_e, input) => outer(input, { mode: "enabled", reportSaveSupported: true, deliveryHistorySaveSupported: true, querySupported: true }));
ipcMain.handle("report:get-save-state", (_e, input) => outer(input, { state: "saved", reportId: input.reportId, retryAvailable: false }));
ipcMain.handle("delivery:get-receipt", (_e, input) => outer(input, { state: "known", receipt: { version: 1, deliveryId: "probe-d1", attemptId: "probe-a1", turnId: "probe-turn", inputSaved: true, history: "failed", outcome: "completed", retryHistoryAvailable: true } }));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    useContentSize: true,
    show: false,
    frame: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: PRELOAD, backgroundThrottling: false }
  });
  const wc = win.webContents;
  wc.on("console-message", (...args) => {
    const event = args[0];
    const level = event && typeof event === "object" && "level" in event ? event.level : args[1];
    const message = event && typeof event === "object" && "message" in event ? event.message : args[2];
    report.console.push({ level: level, message: message });
  });

  const js = (code) => wc.executeJavaScript(code.includes("await ") ? "(async()=>{" + code + "})()" : code, true);
  async function waitFor(expr, timeout) {
    const end = Date.now() + (timeout === undefined ? 8000 : timeout);
    let last;
    while (Date.now() < end) {
      last = await js(expr).catch((error) => String(error));
      if (last) { return last; }
      await sleep(60);
    }
    return last;
  }

  const shot = async (name) => {
    const file = path.join(OUT, name + ".png");
    wc.invalidate();
    await js("new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))").catch(() => undefined);
    await sleep(180);
    await wc.capturePage();
    await sleep(120);
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    report.screenshots.push(path.basename(file));
  };

  function emitRoleStateInPage(payload) { window.desktop.__smoke.emit("session:role-state", payload); }
  const emitRoleState = (busy) => js("(" + emitRoleStateInPage.toString() + ")(" + JSON.stringify({ projectRoot: ROOT, roleId: "P", runtime: "pi", busy: busy === true, queue: [], running: null }) + ")");

  function enterSendInPage() {
    const i = document.getElementById("inp-message");
    i.value = "探针 Enter 发送";
    i.focus();
    i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  }
  function inputClearedInPage() { return document.getElementById("inp-message").value === ""; }
  function keyboardHintInPage() { const k = document.querySelector(".composer-keyboard"); return !!k && k.textContent.includes("Enter") && k.textContent.includes("Shift + Enter"); }
  function haltHiddenInPage() { return document.getElementById("btn-halt").hidden === true; }
  function stopRowInPage() { return document.getElementById("chat").textContent.includes("已请求停止当前轮次"); }

  function factsInPage() {
    const byId = (id) => document.getElementById(id);
    const rect = (el) => { if (!el) { return null; } const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
    const send = byId("btn-send");
    const halt = byId("btn-halt");
    const controls = document.querySelector(".composer-controls");
    const capsule = document.getElementById("composer-capsule");
    const actions = document.querySelector(".composer-actions");
    const visibleKids = (el) => el ? Array.from(el.children).filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) : [];
    const kids = visibleKids(controls).map((x) => ({ id: x.id || null, cls: String(x.className || ""), rect: rect(x) }));
    const overlaps = [];
    for (let i = 0; i < kids.length; i += 1) {
      for (let j = i + 1; j < kids.length; j += 1) {
        const a = kids[i].rect;
        const b = kids[j].rect;
        const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
        if (ox > 1 && oy > 1) { overlaps.push([kids[i].id || kids[i].cls, kids[j].id || kids[j].cls]); }
      }
    }
    const cr = capsule ? capsule.getBoundingClientRect() : null;
    return {
      hasSend: !!send,
      sendVisible: !!send && send.getBoundingClientRect().width > 0,
      sendDisabled: send ? send.disabled : null,
      halt: halt ? { hidden: halt.hidden, text: String(halt.textContent || "").trim(), aria: halt.getAttribute("aria-label"), title: halt.getAttribute("title"), disabled: halt.disabled, rect: rect(halt), svg: !!halt.querySelector("svg"), tabIndex: halt.tabIndex } : null,
      attach: !!byId("btn-attach-image"),
      directive: !!byId("btn-directive-panel"),
      toggles: document.querySelectorAll("#auto-approve-toggle,#judge-decision-toggle").length,
      scope: !!byId("composer-scope"),
      keyboard: !!document.querySelector(".composer-keyboard"),
      actionsVisible: visibleKids(actions).map((x) => x.id || String(x.className || "")),
      overlaps: overlaps,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      capsuleRight: cr ? cr.right : null,
      viewport: innerWidth,
      haltInsideCapsule: !!(capsule && halt && capsule.contains(halt))
    };
  }
  const facts = () => js("(" + factsInPage.toString() + ")()");

  try {
    await win.loadFile(ENTRY);
    await sleep(400);
    await waitFor("!!document.querySelector(" + JSON.stringify("#root > .app-shell") + ")");
    await js("await window.__ansRenderer.loadProject(" + JSON.stringify(ROOT) + ")");
    await sleep(160);
    await js("await window.__ansRenderer.selectRole(" + JSON.stringify("P") + ")");
    await sleep(160);
    await js("await window.__ansRenderer.selectRuntime(" + JSON.stringify("pi") + ")");
    await sleep(180);
    await emitRoleState(false);
    await waitFor("!!document.getElementById(" + JSON.stringify("inp-message") + ")");
    await sleep(120);

    let f = await facts();
    report.facts.idleInitial = f;

    if (PHASE === "before") {
      check("before idle: send button present and enabled", f.hasSend === true && f.sendVisible === true && f.sendDisabled === false, { hasSend: f.hasSend, visible: f.sendVisible, disabled: f.sendDisabled });
      check("before idle: halt hidden", f.halt !== null && f.halt.hidden === true, f.halt);
      check("before idle: halt text is 停止本轮", f.halt !== null && f.halt.text === "停止本轮", f.halt && f.halt.text);
    } else {
      check("after: send button removed from DOM", f.hasSend === false, f.hasSend);
      check("after idle: halt hidden", f.halt !== null && f.halt.hidden === true, f.halt);
    }

    check(PHASE + ": composer keeps attach/directive/toggles/scope/keyboard", f.attach === true && f.directive === true && f.toggles === 2 && f.scope === true && f.keyboard === true, { attach: f.attach, directive: f.directive, toggles: f.toggles, scope: f.scope, keyboard: f.keyboard });
    check(PHASE + ": keyboard hint keeps Enter and Shift + Enter", await js("(" + keyboardHintInPage.toString() + ")()"));

    const sendsBefore = calls.sends.length;
    await js("(" + enterSendInPage.toString() + ")()");
    await sleep(240);
    check(PHASE + ": Enter sends and clears input", calls.sends.length === sendsBefore + 1 && (await js("(" + inputClearedInPage.toString() + ")()")), calls.sends.at(-1) && { text: calls.sends.at(-1).text, target: calls.sends.at(-1).target });

    win.setContentSize(1360, 860);
    await sleep(200);
    await emitRoleState(false);
    await sleep(120);
    f = await facts();
    report.facts.idle1360 = f;
    check(PHASE + " 1360 idle: no horizontal overflow", f.overflowX === 0, f.overflowX);
    await shot("composer-idle-1360-" + PHASE);

    win.setContentSize(1200, 860);
    await sleep(220);
    await emitRoleState(false);
    await sleep(120);
    f = await facts();
    report.facts.idle1200 = f;
    check(PHASE + " 1200 idle: no overflow, no control overlap", f.overflowX === 0 && f.overlaps.length === 0, { overflowX: f.overflowX, overlaps: f.overlaps });
    await shot("composer-idle-1200-" + PHASE);

    await emitRoleState(true);
    await waitFor("document.getElementById(" + JSON.stringify("btn-halt") + ") && !document.getElementById(" + JSON.stringify("btn-halt") + ").hidden");
    await sleep(140);
    f = await facts();
    report.facts.busy1200 = f;
    if (PHASE === "before") {
      check("before busy 1200: halt visible with text", f.halt !== null && f.halt.hidden === false && f.halt.text === "停止本轮" && f.halt.svg === true, f.halt);
      check("before busy 1200: send remains visible", f.hasSend === true && f.sendVisible === true);
    } else {
      check("after busy 1200: halt is icon-only with accessible name", f.halt !== null && f.halt.hidden === false && f.halt.text === "" && f.halt.svg === true && f.halt.aria === "停止本轮" && f.halt.title === "停止本轮" && f.halt.tabIndex === 0 && Math.abs(f.halt.rect.w - 28) <= 1 && Math.abs(f.halt.rect.h - 28) <= 1, f.halt);
      check("after busy 1200: actions holds exactly the halt icon", f.actionsVisible.length === 1 && f.actionsVisible[0] === "btn-halt", f.actionsVisible);
      check("after busy 1200: halt stays inside capsule", f.haltInsideCapsule === true);
    }
    check(PHASE + " 1200 busy: no overflow, no control overlap", f.overflowX === 0 && f.overlaps.length === 0, { overflowX: f.overflowX, overlaps: f.overlaps });
    await shot("composer-busy-1200-" + PHASE);

    win.setContentSize(1360, 860);
    await sleep(200);
    f = await facts();
    report.facts.busy1360 = f;
    check(PHASE + " 1360 busy: no overflow, no control overlap", f.overflowX === 0 && f.overlaps.length === 0, { overflowX: f.overflowX, overlaps: f.overlaps });
    await shot("composer-busy-1360-" + PHASE);

    const abortsBefore = calls.aborts.length;
    await js("document.getElementById(" + JSON.stringify("btn-halt") + ").click()");
    await sleep(200);
    check(PHASE + " busy: halt click aborts exact target", calls.aborts.length === abortsBefore + 1 && calls.aborts.at(-1)?.roleId === "P" && calls.aborts.at(-1)?.runtime === "pi" && calls.aborts.at(-1)?.projectRoot === ROOT, calls.aborts.at(-1));
    check(PHASE + " busy: stop request row shown", await js("(" + stopRowInPage.toString() + ")()"));

    await emitRoleState(false);
    await waitFor("document.getElementById(" + JSON.stringify("btn-halt") + ").hidden===true");
    check(PHASE + " idle after stop: halt hidden again", await js("(" + haltHiddenInPage.toString() + ")()"));

    const errorConsole = report.console.filter((entry) => String(entry.level) === "error");
    check(PHASE + ": zero console errors", errorConsole.length === 0, errorConsole);
  } catch (error) {
    report.console.push({ level: "probe", message: String(error && error.stack ? error.stack : error) });
    check(PHASE + ": probe completed without exception", false, String(error));
  } finally {
    fs.writeFileSync(path.join(OUT, "probe-result.json"), JSON.stringify(report, null, 2));
    console.log("COMPOSER_BUTTONS_PROBE " + (report.failures === 0 ? "PASS" : "FAIL") + " " + report.checks.length + " checks / " + report.failures + " failures " + OUT);
    app.quit();
  }
});
