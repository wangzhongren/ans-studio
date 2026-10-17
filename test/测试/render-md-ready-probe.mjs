// test/测试/render-md-ready-probe.mjs
// 测试角色：渲染新语义独立探针（2026-10-17）——**助手消息即时 Markdown**。
//
// 独立构造：最小受控 IPC 替身 + 真实 `app/renderer/`（index.html/styles/markdown/renderer 全套），
// 不 import 任何实施方测试；不启用模型/网络/凭据。断言：
//   1) `appendAssistant` 新建行恒 `mdReady:true`（源码字面）；
//   2) 含 `##` 与 Markdown 表格的助手消息，在**未 settled** 时即渲染为 `<h2>`/`<table>`，且无
//      `is-streaming`（纯文本安全网分支不得被新行命中）；
//   3) 旧行安全网仍在位：`upgradeStreamingMarkdown` 仍只升级 `mdReady:false` 的助手行，且 settled 路径
//      仍调用它（源码字面；新渲染进程内无旧行，运行期不可达——如实记录）。
//
// 运行：node_modules/.bin/electron test/测试/render-md-ready-probe.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain } from "electron";
import { RUNTIME_SETTINGS } from "../../src/common/shared/runtime-settings.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const APP = path.join(ROOT, "app");
const PROJECT = "/offline-md-ready-probe";
const OUT = process.env.ANS_MD_PROBE_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), "ans-md-probe-"));
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const reports = [];
const errors = [];
let win;

const roles = [{ roleId: "A", cardPath: PROJECT + "/角色卡/A/role-card.md", cardText: "# A\n\n角色职责。\n", boundary: { entries: [] }, boundaryPath: "", changelog: null, docs: [] }];
const listing = { projectRoot: PROJECT, primaryRoleId: "A", hasRoles: true, warnings: [], roles, governanceRecord: { state: "present" } };

function runtimeConfig(runtime) {
  const def = RUNTIME_SETTINGS[runtime];
  return {
    runtime,
    label: def.label,
    path: PROJECT + "/.env",
    revision: 0,
    application: "current",
    missingKeys: [],
    fields: def.fields.map((f) => ({ ...f, value: f.secret ? "" : "fixture", isSet: true })),
  };
}

const handlers = {
  "app:list-project": () => listing,
  "app:pick-project": () => PROJECT,
  "app:renderer-diagnostic": () => ({ ok: true }),
  "app:recovery-state": () => ({}),
  "session:live": () => [],
  "session:live-views": () => [],
  "session:history-get": (_e, input) => ({ ...input, rows: [], error: null, skipped: 0 }),
  "session:open": (_e, input) => ({ ok: true, resumed: true, contextSource: "resumed", runtime: input.runtime, projectRoot: input.projectRoot, profileRevision: 0 }),
  "session:send": () => ({ ok: true }),
  "session:stop": () => ({ ok: true }),
  "session:abort": () => ({ ok: true, supported: true }),
  "runtime-config:get": (_e, input) => runtimeConfig(input.runtime),
  "pi-config:get": () => ({ path: PROJECT + "/.env", fields: [] }),
  "pi-config:save": () => ({ ok: true, appliedKeys: [] }),
  "window:is-maximized": () => false,
  "window:minimize": () => ({ ok: true }),
  "window:toggle-maximize": () => ({ ok: true }),
  "window:close": () => ({ ok: true }),
  "report:get-save-state": (_e, input) => ({ ok: true, version: 1, value: { state: "saved", reportId: input.reportId, retryAvailable: false } }),
  "session:get-persistence": (_e, input) => ({ ok: true, version: 1, scope: { projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime }, value: { mode: "disabled", reportSaveSupported: false, deliveryHistorySaveSupported: false, querySupported: false } }),
};

const js = (code) => win.webContents.executeJavaScript(code.includes("await ") ? "(async()=>{" + code + "})()" : code);
async function check(name, code) {
  const value = await js(code);
  reports.push({ name, value });
  assert.equal(value, true, name);
}

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => {
    fs.writeFileSync(path.join(OUT, "watchdog.txt"), "timeout");
    app.exit(1);
  }, 60000);
  try {
    for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, fn);
    win = new BrowserWindow({
      width: 1200,
      height: 800,
      useContentSize: true,
      frame: false,
      show: false,
      webPreferences: { preload: path.join(APP, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: false },
    });
    win.webContents.on("console-message", (event) => {
      if (event.level === "error") errors.push(event.message);
    });
    await win.loadFile(path.join(APP, "renderer/index.html"));
    await pause(150);
    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(PROJECT)});await window.__ansRenderer.selectRole('A')`);
    await pause(50);

    // 1) 源码字面：新建行恒 mdReady:true（且旧 roleBusy 分支已移除）。
    const src = fs.readFileSync(path.join(APP, "renderer/renderer.js"), "utf8");
    assert.match(src, /data: text, mdReady: true, turnId: turnId, assistantText: true/);
    assert.match(src, /function upgradeStreamingMarkdown\(roleId\)[\s\S]*?if \(rec\.kind !== "assistant" \|\| rec\.mdReady\) continue;/);
    assert.match(src, /upgradeStreamingMarkdown\(roleId\);/);
    reports.push({ name: "source: appendAssistant mdReady:true", value: true });
    reports.push({ name: "source: legacy safety net present", value: true });

    // 2) 运行期：未 settled 的助手消息即 Markdown（## → h2，表格 → table）。
    const md = "## 二级标题\n\n| 列A | 列B |\n| --- | --- |\n| 一 | 二 |\n";
    win.webContents.send("session:events", [
      { projectRoot: PROJECT, roleId: "A", runtime: "pi", event: { kind: "message", runtime: "pi", roleId: "A", turnId: "md-turn", summary: md } },
    ]);
    await pause(120);
    await check("assistant markdown rendered before settled", `(()=>{const a=document.querySelector('#chat .msg-assistant');return !!a&&!!a.querySelector('h2')&&a.querySelector('h2').textContent==='二级标题'&&!!a.querySelector('table')&&a.querySelectorAll('table tbody tr').length===1&&a.textContent.includes('一')&&!a.classList.contains('is-streaming');})()`);
    await check("assistant content kept verbatim after render", `(()=>{const a=document.querySelector('#chat .msg-assistant');return a.textContent.includes('二级标题')&&a.textContent.includes('列A')&&a.textContent.includes('列B')&&a.textContent.includes('一')&&a.textContent.includes('二');})()`);

    // 3) settled 后同一行不被重复插入/改写（新行不依赖安全网）。
    const before = await js(`document.querySelectorAll('#chat .msg-assistant').length`);
    win.webContents.send("session:events", [
      { projectRoot: PROJECT, roleId: "A", runtime: "pi", event: { kind: "settled", runtime: "pi", roleId: "A", turnId: "md-turn", summary: "本轮结束", detail: { outcome: "completed" } } },
    ]);
    await pause(120);
    const after = await js(`document.querySelectorAll('#chat .msg-assistant').length`);
    assert.equal(after, before, "settled 不得重复插行");
    reports.push({ name: "settled keeps single assistant row", value: after === before });
    await check("settled does not regress markdown", `(()=>{const a=document.querySelector('#chat .msg-assistant');return !!a&&!!a.querySelector('h2')&&!!a.querySelector('table');})()`);

    assert.equal(errors.length, 0, errors.join("\n"));
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ reports, errors, electron: process.versions.electron }, null, 2));
    console.log("MD_READY_PROBE_PASS " + reports.length + " " + OUT);
    clearTimeout(watchdog);
    app.quit();
  } catch (err) {
    fs.writeFileSync(path.join(OUT, "failure.json"), JSON.stringify({ reports, errors, message: String(err && err.stack || err) }, null, 2));
    console.error(String(err && err.stack || err));
    clearTimeout(watchdog);
    app.exit(1);
  }
});
