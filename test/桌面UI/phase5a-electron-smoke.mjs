#!/usr/bin/env node
/**
 * test/桌面UI/phase5a-electron-smoke.mjs
 *
 * E 批（2026-10-28）真实 Electron 离线冒烟（无模型/网络/.env）：
 *  - 六角色左树/主入口 chief；
 *  - 客户决定独立模态对话框：一次一卡/优先级/「还有 N 张」/稍后处理/待办面板/聊天流无卡；
 *  - 任务与日志独立面板入口；
 *  - 200% 窄屏无横向溢出、无 console.error/CSP 违规；截图证据。
 *
 * 运行（仓库根）：
 *   ./node_modules/.bin/electron test/桌面UI/phase5a-electron-smoke.mjs [entry.html] [outDir]
 */
import { app, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const ENTRY = process.argv[2] ? path.resolve(process.argv[2]) : path.join(REPO, "app/renderer/dist/index.html");
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : "/tmp/ans-phase5a-smoke";
const PRELOAD = path.join(HERE, "phase4b-smoke-preload.cjs");
const ROOT = "/phase5a-project";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const report = { entry: ENTRY, checks: [], console: [], csp: [], screenshots: [], failures: 0 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail === undefined ? null : detail });
  if (value !== true) report.failures += 1;
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
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
  roles: [
    govRole("chief", "chief"),
    govRole("product", "product"),
    govRole("rapporteur", "proposal"),
    govRole("nominator", "nomination"),
    govRole("convener", "schedule"),
    govRole("verifier", "verification"),
    projectRole("A"),
    projectRole("B"),
  ],
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

ipcMain.handle("app:recovery-state", () => null);
ipcMain.handle("app:recovery-ready", () => ({ ok: true }));
ipcMain.handle("app:list-project", (_e, input) => ({ ...listing(), projectRoot: input?.projectRoot || ROOT }));
ipcMain.handle("app:pick-project", () => ROOT);
ipcMain.handle("app:open-external", () => ({ ok: true }));
ipcMain.handle("window:is-maximized", () => false);
ipcMain.handle("session:open", (_e, input) => ({ ok: true, resumed: true, contextSource: "resumed", runtime: input.runtime, projectRoot: input.projectRoot }));
ipcMain.handle("session:history-get", (_e, input) => ({ projectRoot: input.projectRoot, roleId: input.roleId, runtime: input.runtime, rows: [], error: null, skipped: 0 }));
ipcMain.handle("session:live-views", () => []);
ipcMain.handle("session:stop", () => ({ ok: true }));
ipcMain.handle("session:abort", (_e, input) => ({ ok: true, supported: true, ...input }));
ipcMain.handle("session:send", () => ({ ok: true }));
ipcMain.handle("session:withdraw", () => ({ ok: true }));
ipcMain.handle("session:operator-response", () => ({ ok: true }));
ipcMain.handle("shell:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("shell:judge-set", (_e, input) => ({ version: 1, ok: true, enabled: input?.enabled === true }));
ipcMain.handle("decision:judge-get", () => ({ version: 1, ok: true, enabled: false }));
ipcMain.handle("decision:judge-set", (_e, input) => ({ version: 1, ok: true, enabled: input?.enabled === true }));
ipcMain.handle("runtime-config:get", (_e, input) => runtimeConfig(input.runtime));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    useContentSize: true,
    show: false,
    frame: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: PRELOAD, backgroundThrottling: false },
  });
  const wc = win.webContents;
  wc.on("console-message", (...args) => {
    const event = args[0];
    const level = event && typeof event === "object" && "level" in event ? event.level : args[1];
    const message = event && typeof event === "object" && "message" in event ? event.message : args[2];
    report.console.push({ level, message });
  });
  wc.on("did-fail-load", (_event, code, description) => report.console.push({ level: "did-fail-load", message: code + " " + description }));
  const js = (code) => wc.executeJavaScript(code.includes("await ") ? `(async()=>{${code}})()` : code, true);
  async function waitFor(expr, timeout = 8000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      last = await js(expr).catch((error) => String(error));
      if (last) return last;
      await sleep(60);
    }
    return last;
  }
  const shot = async (name) => {
    const file = path.join(OUT, name + ".png");
    fs.writeFileSync(file, (await wc.capturePage()).toPNG());
    report.screenshots.push(path.basename(file));
  };
  const push = async (channel, payload) => {
    await js(`window.desktop.__smoke.emit(${JSON.stringify(channel)}, ${JSON.stringify(payload)})`);
    await sleep(160);
  };

  try {
    await win.loadFile(ENTRY);
    await sleep(500);
    await waitFor(`!!document.querySelector('#root > .app-shell')`);
    await js(`window.__smokeCsp=[];document.addEventListener('securitypolicyviolation',(event)=>{window.__smokeCsp.push(event.violatedDirective+' '+event.blockedURI)})`);
    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);
    await sleep(260);
    await js(`await window.__ansRenderer.selectRole('chief')`);
    await sleep(240);
    check("六角色左树/主入口 chief", await js(`(() => { const s=window.__ansRenderer.state; return s.roles.length===8 && s.primaryRoleId==='chief' && !!document.querySelector('#role-tree .tree-item.primary[data-role-id="chief"]') && !document.querySelector('#role-tree .ti-badge'); })()`));
    check("决策/任务入口在会话头", await js(`!!document.getElementById('tab-decisions') && !!document.getElementById('tab-tasks')`));
    await shot("01-six-roles");

    await js(`window.__ansRenderer.appendOperatorRequest({ id: 'e-low', roleId: 'chief', request: { kind: 'confirm', title: 'E 低风险确认' } })`);
    await sleep(180);
    await js(`window.__ansRenderer.appendOperatorRequest({ id: 'e-high', roleId: 'chief', risk: 'high', request: { kind: 'confirm', title: 'E 高风险审批' } })`);
    await sleep(260);
    check("一次一卡：仅一个决策对话框", await js(`document.querySelectorAll('#decision-dialog').length === 1`));
    check("优先级：高风险先弹", await js(`(document.querySelector('#decision-dialog .dd-title')||{textContent:''}).textContent.includes('E 高风险审批')`));
    check("聊天流无卡片、仅有系统通知", await js(`!document.querySelector('#chat .op-request') && !!document.querySelector('#chat .sys-operator-note')`));
    check("还有 N 张待处理", await js(`(document.querySelector('#decision-dialog .dd-more')||{textContent:''}).textContent.includes('还有 1 张待处理')`));
    check("默认焦点不在确认", await js(`document.activeElement && document.activeElement.classList.contains('dd-later')`));
    await shot("02-decision-dialog");

    await js(`document.querySelector('#decision-dialog .dd-later').click()`);
    await sleep(200);
    check("稍后处理推进下一张", await js(`(document.querySelector('#decision-dialog .dd-title')||{textContent:''}).textContent.includes('E 低风险确认')`));
    await js(`document.querySelector('#decision-dialog .dd-later').click()`);
    await sleep(200);
    check("稍后处理关闭对话框、不代答", await js(`!document.querySelector('#decision-dialog')`));
    await js(`document.getElementById('tab-decisions').click()`);
    await sleep(260);
    check("待办面板列出稍后项", await js(`(() => { const p=document.getElementById('decision-center-pending'); return !!p && p.textContent.includes('E 低风险确认') && p.textContent.includes('E 高风险审批') && p.textContent.includes('稍后处理'); })()`));
    await js(`document.querySelector('#decision-center-pending .dc-open').click()`);
    await sleep(200);
    check("待办可重新打开", await js(`!!document.querySelector('#decision-dialog')`));
    await js(`document.querySelector('#decision-dialog .dd-later').click()`);
    await sleep(180);
    await js(`document.getElementById('tab-decisions').click()`);
    await sleep(180);
    check("历史面板存在", await js(`!!document.getElementById('decision-center-history')`));
    await shot("03-decision-center");
    await js(`document.getElementById('tab-tasks').click()`);
    await sleep(300);
    check("任务/日志面板存在", await js(`!!document.querySelector('.task-center .tc-title')`));
    check("角色日志徽标/视图存在", await js(`!!document.querySelector('.role-log-badge') && !!document.querySelector('.role-log-view')`));
    await shot("04-task-center");

    // 200% 窄屏：对话框/面板不产生横向滚动。
    wc.setZoomFactor(2);
    win.setContentSize(960, 620);
    await sleep(300);
    await js(`window.dispatchEvent(new Event('resize'))`);
    await sleep(200);
    check("200% 无横向溢出", await js(`document.documentElement.scrollWidth <= innerWidth + 1`));
    await shot("05-200pct");
    wc.setZoomFactor(1);

    const badConsole = report.console.filter((item) => String(item.level) === "error" || item.level === 3);
    const csp = await js(`window.__smokeCsp || []`);
    report.csp = csp;
    check("no console errors", badConsole.length === 0, badConsole);
    check("no CSP violations", csp.length === 0, csp);
  } catch (error) {
    report.failures += 1;
    report.error = String(error && error.stack ? error.stack : error);
    console.error("PHASE5A_SMOKE_ERROR", report.error);
  } finally {
    report.finished = true;
    report.at = new Date().toISOString();
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    console.log("PHASE5A_SMOKE_DONE failures=" + report.failures + " checks=" + report.checks.length + " out=" + OUT);
    app.exit(report.failures === 0 ? 0 : 1);
  }
});
