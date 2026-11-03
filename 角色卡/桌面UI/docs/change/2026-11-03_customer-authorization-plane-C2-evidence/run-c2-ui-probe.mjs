#!/usr/bin/env node
/**
 * C2 supplementary real-Electron probe (evidence only; not a product/test source file).
 *
 * Verifies the AC-22 card entry + directive confirm dialog + directive panel against the
 * real renderer bundle:
 *   - shell card footer entry default-collapsed / deny keeps default focus;
 *   - card entry sends through sendSession with the card payload target (no shell respond);
 *   - Esc collapses the input only; directive:confirm-request opens the z90 dialog;
 *   - high-risk confirm disabled until acknowledged; confirm posts frozen values;
 *   - panel opens above the still-pending shell card (z95 badge) and revoke uses card data.
 *
 * Run from repo root:
 *   ./node_modules/.bin/electron <this-file> app/renderer/dist/index.html
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");
const ENTRY = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(REPO, "app", "renderer", "dist", "index.html");
const OUT = path.join(HERE, "probe-run");
const USER_DATA = path.join(os.tmpdir(), "ans-c2-probe-" + process.pid);
const PRELOAD = path.join(HERE, "c2-probe-preload.cjs");
const ROOT = "/c2-probe-project";

const report = { entry: ENTRY, checks: [], screenshots: [], failures: 0, console: [], csp: [] };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
console.log("C2_PROBE_BOOT entry=" + ENTRY);
setTimeout(() => {
  console.error("C2_PROBE_TIMEOUT");
  app.exit(2);
}, 60000);

function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail ?? null });
  if (value !== true) report.failures += 1;
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail === undefined ? "" : " " + JSON.stringify(detail)}`);
  return value === true;
}

const govRole = (roleId, fn) => ({
  roleId,
  cardText: "# " + roleId,
  cardPath: "",
  boundary: { entries: [] },
  boundaryPath: "",
  builtIn: true,
  governanceFunction: fn,
  changelog: null,
  docs: [],
});
const projectRole = (roleId) => ({
  roleId,
  cardText: "# " + roleId,
  cardPath: ROOT + "/角色卡/" + roleId + "/role-card.md",
  boundary: { entries: [] },
  boundaryPath: "",
  changelog: null,
  docs: [],
});
const listing = () => ({
  projectRoot: ROOT,
  primaryRoleId: "chief",
  hasRoles: true,
  warnings: [],
  governanceModel: "trio",
  governanceRecord: { state: "present" },
  roles: [govRole("chief", "chief"), projectRole("A")],
});
const runtimeConfig = (runtime) => ({
  runtime,
  label: runtime,
  path: ROOT + "/.env",
  revision: 0,
  application: "next-session",
  missingKeys: [],
  fields: [],
});

const directiveState = () => ({
  version: 1,
  directivesEnabled: true,
  projectRoot: ROOT,
  approval: {
    active: [
      {
        id: "d-1",
        target: "approval",
        action: { kind: "allow", resource: { type: "shell", command: "npm test", cwd: ROOT } },
        scope: {},
        until: "once",
        status: "active",
        createdAt: "2026-11-03T00:00:00.000Z",
        consumer: "shell-gate",
      },
    ],
    consumed: [],
    revoked: [],
    expired: [],
  },
  decision: { active: [], consumed: [], revoked: [], expired: [] },
  ledgerErrors: 0,
});

const sends = [];
const shellResponses = [];
const directiveResponses = [];
const revokes = [];
let win = null;

ipcMain.handle("app:recovery-state", () => null);
ipcMain.handle("app:recovery-ready", () => ({ ok: true }));
ipcMain.handle("app:list-project", (_e, input) => ({ ...listing(), projectRoot: input?.projectRoot || ROOT }));
ipcMain.handle("app:pick-project", () => ROOT);
ipcMain.handle("app:open-external", () => ({ ok: true }));
ipcMain.handle("window:is-maximized", () => false);
ipcMain.handle("window:minimize", () => ({ ok: true }));
ipcMain.handle("window:toggle-maximize", () => ({ ok: true }));
ipcMain.handle("window:close", () => ({ ok: true }));
ipcMain.handle("session:open", (_e, input) => ({ ok: true, resumed: true, contextSource: "resumed", runtime: input.runtime, projectRoot: input.projectRoot }));
ipcMain.handle("session:history-get", (_e, input) => ({ projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime, rows: [], error: null, skipped: 0 }));
ipcMain.handle("session:live-views", () => []);
ipcMain.handle("session:stop", () => ({ ok: true }));
ipcMain.handle("session:abort", (_e, input) => ({ ok: true, supported: true, ...input }));
ipcMain.handle("session:withdraw", () => ({ ok: true }));
ipcMain.handle("session:operator-response", () => ({ ok: true }));
ipcMain.handle("shell:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("shell:judge-set", (_e, input) => ({ version: 1, ok: true, enabled: input?.enabled === true }));
ipcMain.handle("decision:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("decision:judge-set", (_e, input) => ({ version: 1, ok: true, enabled: input?.enabled === true }));
ipcMain.handle("runtime-config:get", (_e, input) => runtimeConfig(input.runtime));

ipcMain.handle("session:send", (_e, input) => {
  sends.push(input);
  const text = typeof input?.text === "string" ? input.text : "";
  if (text.startsWith("@审批")) {
    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("directive:confirm-request", {
          version: 1,
          request: {
            id: "req-c2-probe",
            target: "approval",
            rawText: text,
            projectRoot: ROOT,
            roleId: "A",
            runtime: "claude",
            prefill: {
              action: { kind: "allow", resource: { type: "shell", command: "npm test", cwd: ROOT } },
              scope: {},
              until: "once",
              unrecognized: [],
            },
            highRisk: { reasons: ["wide-command"] },
            confirmable: true,
            decisionGroupEnabled: true,
          },
        });
      }
    }, 20);
    return { ok: true, directive: { id: "d-2", target: "approval" } };
  }
  return { ok: true };
});

ipcMain.handle("directive:list", () => ({ ok: true, ...directiveState() }));
ipcMain.handle("directive:revoke", (_e, input) => {
  revokes.push(input);
  return { ok: true, id: input.id, target: input.target };
});
ipcMain.handle("directive:confirm-response", (_e, input) => {
  directiveResponses.push(input);
  return { ok: true };
});
ipcMain.handle("shell:confirm-response", (_e, input) => {
  shellResponses.push(input);
  return { ok: true };
});
ipcMain.handle("recovery:confirm-response", () => ({ ok: true }));

fs.rmSync(USER_DATA, { recursive: true, force: true });
fs.mkdirSync(USER_DATA, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", USER_DATA);

app.whenReady().then(async () => {
  console.log("C2_PROBE_READY");
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    useContentSize: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      preload: PRELOAD,
    },
  });
  const wc = win.webContents;
  wc.on("console-message", (...args) => {
    const event = args[0];
    const level = event && typeof event === "object" && "level" in event ? event.level : args[1];
    const message = event && typeof event === "object" && "message" in event ? event.message : args[2];
    report.console.push({ level, message: String(message ?? "") });
  });
  const js = (code) =>
    wc.executeJavaScript(code.includes("await ") ? `(async()=>{${code}})()` : code, true);
  const waitFor = async (code, timeout = 3000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await js(code)) return true;
      await sleep(50);
    }
    return false;
  };
  const shot = async (name) => {
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    report.screenshots.push(path.basename(file));
  };

  try {
    await wc.loadFile(ENTRY);
    await sleep(300);
    await js(`window.__smokeCsp = []; window.addEventListener('securitypolicyviolation', (e) => window.__smokeCsp.push(e.violatedDirective)); 0`);
    check("MOUNT", await waitFor(`!!document.querySelector('#root > .app-shell') && !!document.getElementById('shell-confirm')`));
    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)}); await window.__ansRenderer.selectRole('A')`);
    await sleep(200);

    // 能力位先行 handshake（真实主→渲 IPC，与生产 preload 的 ipcRenderer.on 同路径）。
    wc.send("directive:state", directiveState());
    await sleep(150);
    const ipcSeen = await js(`window.desktop.__smoke.ipcSeen()`);
    console.log("IPC_SEEN", JSON.stringify(ipcSeen));
    check(
      "FIVE_DIRECTIVE_METHODS",
      await js(`['onDirectiveConfirmRequest','directiveConfirmRespond','listDirectives','revokeDirective','onDirectiveState'].every((k)=>typeof window.desktop[k]==='function')`),
    );
    check(
      "DIRECTIVE_STATE_APPLIED",
      await js(`!document.getElementById('btn-directive-panel').disabled`),
    );
    if (await js(`document.getElementById('btn-directive-panel').disabled`)) {
      await js(`window.desktop.__smoke.emit('directive:state', ${JSON.stringify(directiveState())})`);
      await sleep(120);
      console.log("DIRECT_EMIT_APPLIED", await js(`!document.getElementById('btn-directive-panel').disabled`));
    }

    // shell 卡到达；入口默认折叠、拒绝按钮保持默认焦点。
    wc.send("shell:confirm-request", {
      projectRoot: ROOT,
      runtime: "claude",
      roleId: "A",
      id: "sc-c2-probe",
      policy: "project",
      command: "echo hi",
      summary: "执行 shell 命令",
      reasonPlain: "原因",
      cwd: ROOT,
      argvLines: ["echo", "hi"],
    });
    await sleep(150);
    check(
      "ENTRY_COLLAPSED_DENY_FOCUS",
      await js(`(()=>{const o=document.getElementById('shell-confirm');const b=document.getElementById('sc-directive-entry');return !o.hidden&&!!b&&!b.disabled&&b.getAttribute('aria-expanded')==='false'&&document.activeElement===document.getElementById('sc-deny')&&document.getElementById('sc-directive-input')===null;})()`),
    );
    await shot("01-shell-card-entry");

    // 展开后 Esc 只折叠输入区，不回答 shell 卡。
    await js(`document.getElementById('sc-directive-entry').click()`);
    await sleep(120);
    check(
      "ENTRY_EXPANDED_INPUT_FOCUS",
      await js(`(()=>{const i=document.getElementById('sc-directive-input');return !!i&&document.activeElement===i;})()`),
    );
    await js(`(()=>{const el=document.getElementById('sc-directive-input');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(el,'@审批 允许 npm test');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await sleep(80);
    await wc.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    await wc.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    await sleep(120);
    check(
      "ENTRY_ESC_COLLAPSES_ONLY",
      await js(`(()=>{const o=document.getElementById('shell-confirm');return !o.hidden&&document.getElementById('sc-directive-input')===null;})()`) &&
        shellResponses.length === 0,
      { shellResponses: shellResponses.length },
    );

    // 重新展开、输入并提交：同一 sendSession；target 只取卡载荷。
    await js(`document.getElementById('sc-directive-entry').click()`);
    await sleep(100);
    await js(`(()=>{const el=document.getElementById('sc-directive-input');const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;set.call(el,'@审批 允许 npm test');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await sleep(80);
    check(
      "ENTRY_SUBMIT_ENABLED",
      await js(`!document.getElementById('sc-directive-submit').disabled`),
    );
    await js(`document.getElementById('sc-directive-submit').click()`);
    await sleep(250);
    check(
      "ENTRY_SEND_CARD_TARGET_ONLY",
      sends.length === 1 &&
        sends[0].text === "@审批 允许 npm test" &&
        sends[0].target?.projectRoot === ROOT &&
        sends[0].target?.roleId === "A" &&
        sends[0].target?.runtime === "claude" &&
        shellResponses.length === 0,
      { sends: sends.length, shellResponses: shellResponses.length, target: sends[0]?.target },
    );

    // 确认对话框：原文/高危横幅/未勾选禁用/确认回包 values。
    check("CONFIRM_DIALOG_OPEN", await waitFor(`!!document.getElementById('directive-dialog')`, 3000));
    await sleep(150);
    console.log(
      "DIALOG_DEBUG",
      JSON.stringify(
        await js(`(()=>{const raw=document.getElementById('directive-raw-text');const hr=document.getElementById('directive-high-risk');const c=document.getElementById('directive-confirm');const x=document.getElementById('directive-cancel');const o=document.getElementById('shell-confirm');const d=document.getElementById('directive-dialog');const ds=d&&getComputedStyle(d);const r=d&&d.getBoundingClientRect();return {raw:raw&&raw.textContent,highRisk:!!hr,confirmDisabled:c&&c.disabled,cancelDisabled:x&&x.disabled,active:document.activeElement&&document.activeElement.id,shellHidden:o&&o.hidden,dialogDisplay:ds&&ds.display,dialogZ:ds&&ds.zIndex,dialogPosition:ds&&ds.position,dialogRect:r&&{x:r.x,y:r.y,w:r.width,h:r.height},bodyChildren:document.body.children.length};})()`),
      ),
    );
    check(
      "CONFIRM_DIALOG_CONTENT",
      await js(`(()=>{const raw=document.getElementById('directive-raw-text');const hr=document.getElementById('directive-high-risk');const c=document.getElementById('directive-confirm');return !!raw&&raw.textContent==='@审批 允许 npm test'&&!!hr&&c.disabled&&document.activeElement===document.getElementById('directive-cancel')&&!document.getElementById('shell-confirm').hidden;})()`),
    );
    await shot("02-confirm-dialog-high-risk");
    await js(`document.getElementById('directive-highrisk-ack').click()`);
    await sleep(100);
    check("CONFIRM_ENABLED_AFTER_ACK", await js(`!document.getElementById('directive-confirm').disabled`));
    await js(`document.getElementById('directive-confirm').click()`);
    await sleep(250);
    check(
      "CONFIRM_POSTS_FROZEN_VALUES",
      directiveResponses.length === 1 &&
        directiveResponses[0].id === "req-c2-probe" &&
        directiveResponses[0].decision === "confirm" &&
        directiveResponses[0].values?.acknowledged === true &&
        directiveResponses[0].values?.until === "once",
      directiveResponses[0],
    );
    check("SHELL_CARD_STILL_PENDING_AFTER_CONFIRM", await js(`!document.getElementById('shell-confirm').hidden`));

    // 面板：z95、shell 待答徽标、active 行撤销。确认后卡内入口已收起（状态清空），重新展开。
    if (!(await js(`!!document.getElementById('sc-directive-panel-open')`))) {
      await js(`document.getElementById('sc-directive-entry').click()`);
      await sleep(100);
    }
    await js(`document.getElementById('sc-directive-panel-open').click()`);
    check("PANEL_OPEN", await waitFor(`!!document.getElementById('directive-panel')`, 2000));
    check(
      "PANEL_BADGE_AND_ROW",
      await js(`(()=>{const p=document.getElementById('directive-panel');const b=document.getElementById('directive-panel-shell-badge');const r=document.getElementById('directive-row-d-1');const v=document.getElementById('directive-revoke-d-1');return !!p&&!!b&&!!r&&!!v&&p.textContent.includes('d-1')&&!document.getElementById('shell-confirm').hidden;})()`),
    );
    await shot("03-directive-panel");
    await js(`document.getElementById('directive-revoke-d-1').click()`);
    await sleep(200);
    check(
      "PANEL_REVOKE_USES_ROW_DATA",
      revokes.length === 1 &&
        revokes[0].id === "d-1" &&
        revokes[0].target === "approval" &&
        revokes[0].projectRoot === ROOT,
      revokes[0],
    );
    await js(`document.getElementById('directive-panel-close').click()`);
    await sleep(120);
    check("PANEL_CLOSES_SHELL_STILL_PENDING", await js(`!document.getElementById('directive-panel') && !document.getElementById('shell-confirm').hidden`));

    // 项目切换：面板/未决状态清空（C1 侧取消；渲染侧列表/入口清空）。
    await js(`window.__ansRenderer.loadProject('/c2-probe-project-2')`);
    await sleep(200);
    check("PROJECT_SWITCH_CLEARS_OVERLAYS", await js(`!document.getElementById('directive-panel') && !document.getElementById('directive-dialog')`));

    const badConsole = report.console.filter((item) => String(item.level) === "error" || item.level === 3);
    report.csp = await js(`window.__smokeCsp || []`);
    check("NO_CONSOLE_ERRORS", badConsole.length === 0, badConsole);
    check("NO_CSP_VIOLATIONS", report.csp.length === 0, report.csp);
  } catch (error) {
    report.failures += 1;
    report.error = String(error && error.stack ? error.stack : error);
    console.error("C2_PROBE_ERROR", report.error);
  } finally {
    report.finished = true;
    report.at = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log(`C2_PROBE_DONE failures=${report.failures} checks=${report.checks.length} out=${OUT}`);
    app.exit(report.failures === 0 ? 0 : 1);
  }
}).catch((error) => {
  console.error("C2_PROBE_READY_ERROR", String(error && error.stack ? error.stack : error));
  app.exit(3);
});
