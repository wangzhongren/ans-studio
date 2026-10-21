// test/测试/su-shell-approval-verify/card-probe.mjs
// 测试角色：su 命令审批——**离线真实 renderer 卡片渲染探针**（2026-10-17）。
//
// 真实 `app/renderer/` + preload + 受控 IPC；不启用模型/网络/凭据。断言：
//   1) su 卡标题「SU 命令审批」、档位标签、命令原文、reasonPlain + 命中原因（reasonRaw）、
//      必备警告（绕过写边界）、拒绝为默认焦点；
//   2) Esc = 回传 allow:false（默认拒绝/fail-closed），卡片收起；
//   3) 项目角色卡保持旧标题/无 su 警告/无档位标签（三层链呈现逐字不变）。
//
// 运行：node_modules/.bin/electron test/测试/su-shell-approval-verify/card-probe.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain } from "electron";
import { RUNTIME_SETTINGS } from "../../../src/common/shared/runtime-settings.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const APP = path.join(ROOT, "app");
const PROJECT = "/offline-su-shell-card-probe";
const OUT = process.env.ANS_SU_CARD_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), "ans-su-card-"));
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const reports = [];
const errors = [];
const responses = [];
let win;

const roles = [{ roleId: "A", cardPath: PROJECT + "/角色卡/A/role-card.md", cardText: "# A\n", boundary: { entries: [] }, boundaryPath: "", changelog: null, docs: [] }];
const listing = { projectRoot: PROJECT, primaryRoleId: "A", hasRoles: true, warnings: [], roles, governanceRecord: { state: "present" } };

function runtimeConfig(runtime) {
  const def = RUNTIME_SETTINGS[runtime];
  return { runtime, label: def.label, path: PROJECT + "/.env", revision: 0, application: "current", missingKeys: [], fields: def.fields.map((f) => ({ ...f, value: f.secret ? "" : "fixture", isSet: true })) };
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
  "shell:confirm-response": (_e, input) => {
    responses.push(input);
    return { ok: true };
  },
};

const js = (code) => win.webContents.executeJavaScript(code.includes("await ") ? "(async()=>{" + code + "})()" : code);
async function check(name, code) {
  const value = await js(code);
  reports.push({ name, value });
  assert.equal(value, true, name);
}

const WARNING = "批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界；请逐字核对命令原文。";
const SU_PAYLOAD = {
  id: "su-denytier-1",
  projectRoot: PROJECT,
  runtime: "pi",
  roleId: "su",
  policy: "su-approval",
  tier: "deny",
  command: 'node -e "require(\'fs\').writeFileSync(\'x\',\'y\')"',
  summary: "执行一条内联脚本",
  reasonPlain: "SU 审批档：硬拒类（deny）——须逐条客户批准才执行；批准后可能绕过 ANS 文件写边界（命令以当前 OS 用户权限运行）。拒绝/超时/通道不可用 = 拒绝；默认拒绝、无「记住」，不自动通过。",
  reasonRaw: "su-审批档[deny]：命中硬拒程序规则：interpreter-inline；批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界。",
  argvLines: ['"node"', '"-e"', '"require(\'fs\')…"'],
  cwd: "/proj",
};
const PROJECT_PAYLOAD = {
  id: "project-risky-1",
  projectRoot: PROJECT,
  runtime: "pi",
  roleId: "A",
  policy: "project",
  tier: null,
  command: "rm -rf build",
  summary: "删除构建目录",
  reasonPlain: "自动审核判定这条命令有风险——按治理规则，有风险的命令必须由你亲自确认才能执行。",
  reasonRaw: "risky: 命中危险程序规则：rm",
  argvLines: ['"rm"', '"-rf"', '"build"'],
  cwd: "/proj",
};

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
    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(PROJECT)});await window.__ansRenderer.selectRole('A');await window.__ansRenderer.selectRuntime('pi')`);
    await pause(50);

    // —— su 审批卡 ——
    win.webContents.send("shell:confirm-request", SU_PAYLOAD);
    await pause(120);
    await check("su card visible + title", `(()=>{const o=document.getElementById('shell-confirm');return !o.hidden&&document.getElementById('sc-title').textContent==='SU 命令审批'&&o.classList.contains('is-su-approval');})()`);
    await check("su card tier + command verbatim", `document.getElementById('sc-summary').textContent.includes('硬拒类（deny）')&&document.getElementById('sc-command').textContent===${JSON.stringify(SU_PAYLOAD.command)}`);
    await check("su card plain reason + visible raw hit reason", `(()=>{const r=document.getElementById('sc-reason').textContent;return r.includes('逐条客户批准')&&r.includes('可能绕过 ANS 文件写边界')&&r.includes('命中原因：'+${JSON.stringify(SU_PAYLOAD.reasonRaw)});})()`);
    await check("su card mandatory warning in hint", `document.getElementById('sc-hint').textContent.includes(${JSON.stringify(WARNING)})`);
    await check("su card default deny focus", `document.activeElement&&document.activeElement.id==='sc-deny'`);

    // Esc = 拒绝（allow:false），卡片收起。
    await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await pause(100);
    assert.equal(responses.at(-1)?.allow, false, "Esc 必须回传 allow:false");
    reports.push({ name: "Esc responds allow:false", value: true });
    await check("card closed after Esc", `document.getElementById('shell-confirm').hidden===true`);

    // —— 项目角色卡：既有呈现逐字不变 ——
    win.webContents.send("shell:confirm-request", PROJECT_PAYLOAD);
    await pause(120);
    await check("project card keeps legacy title/no warning/no tier", `(()=>{const o=document.getElementById('shell-confirm');const h=document.getElementById('sc-hint').textContent;return !o.hidden&&document.getElementById('sc-title').textContent==='shell 命令请求'&&!o.classList.contains('is-su-approval')&&!h.includes(${JSON.stringify(WARNING)})&&!document.getElementById('sc-summary').textContent.includes('硬拒类');})()`);
    await check("project card default deny focus", `document.activeElement&&document.activeElement.id==='sc-deny'`);

    assert.equal(errors.length, 0, errors.join("\n"));
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ reports, errors, responses, electron: process.versions.electron }, null, 2));
    console.log("SU_CARD_PROBE_PASS " + reports.length + " " + OUT);
    clearTimeout(watchdog);
    app.quit();
  } catch (err) {
    fs.writeFileSync(path.join(OUT, "failure.json"), JSON.stringify({ reports, errors, responses, message: String((err && err.stack) || err) }, null, 2));
    console.error(String((err && err.stack) || err));
    clearTimeout(watchdog);
    app.exit(1);
  }
});
