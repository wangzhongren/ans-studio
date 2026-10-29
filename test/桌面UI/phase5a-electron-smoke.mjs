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
const operatorResponses = [];
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
ipcMain.handle("session:operator-response", (_e, input) => {
  operatorResponses.push(input);
  if (input?.id === "e-expire") return { ok: false, expired: true, error: "E2E 过期探针" };
  return { ok: true };
});
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
    // 2026-10-29 客户缺陷：Composer 两开关曾把输入区撑出页面。结构 + 1360 实测（不溢出）。
    check("Composer 两行结构：提示行/控件行", await js(`(() => { const line=document.querySelector('.composer-trust-line'), ctr=document.querySelector('.composer-controls'); if(!line||!ctr) return false; return line.textContent.trim().length>0 && !!line.querySelector('#judge-switch-hint') && !!ctr.querySelector('#btn-attach-image') && !!ctr.querySelector('#auto-approve-toggle') && !!ctr.querySelector('#judge-decision-toggle') && !!ctr.querySelector('#composer-scope'); })()`));
    check("Composer 控件同一行（1360）", await js(`(() => { const ctr=document.querySelector('.composer-controls'); if(!ctr) return false; const r=ctr.getBoundingClientRect(); const boxes=[...ctr.children].filter(el=>el.offsetParent!==null).map(el=>el.getBoundingClientRect()); return boxes.length>=4 && Math.max(...boxes.map(b=>b.bottom))-Math.min(...boxes.map(b=>b.top)) <= 36 && r.bottom-r.top <= 36; })()`));
    check("Composer 无横向溢出（1360）", await js(`(() => { const bottom=document.querySelector('.composer-bottom'); if(!bottom) return false; const r=bottom.getBoundingClientRect(); const pills=[...document.querySelectorAll('.composer-auto-approve')].map(el=>el.getBoundingClientRect()); return document.documentElement.scrollWidth<=innerWidth+1 && r.right<=innerWidth+1 && pills.every(p=>p.left>=-0.5&&p.right<=innerWidth+1) && bottom.scrollWidth<=bottom.clientWidth+1; })()`));
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

    // F-E2：输入中仅高风险打断；已有对话框低风险/decision 新卡不替换；停止输入后空闲推进。
    operatorResponses.length = 0;
    await js(`window.__ansRenderer.drawer.close()`);
    await sleep(180);
    await js(`document.getElementById('inp-message').focus(); document.getElementById('inp-message').dispatchEvent(new Event('input', { bubbles: true }))`);
    await js(`window.__ansRenderer.appendOperatorRequest({ id: 'e-typing-decision', roleId: 'chief', request: { kind: 'choice', cardKind: 'proposal', title: 'E 输入中 decision', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } })`);
    await sleep(220);
    check("输入中 decision 不打断", await js(`!(document.querySelector('#decision-dialog .dd-title')||{textContent:''}).textContent.includes('E 输入中 decision')`));
    await js(`window.__ansRenderer.appendOperatorRequest({ id: 'e-typing-high', roleId: 'chief', risk: 'high', request: { kind: 'confirm', title: 'E 输入中高风险' } })`);
    await sleep(220);
    check("输入中高风险可打断", await js(`(document.querySelector('#decision-dialog .dd-title')||{textContent:''}).textContent.includes('E 输入中高风险')`));
    await js(`document.querySelector('#decision-dialog .dd-later').click()`);
    await sleep(1600);
    check("停止输入后空闲推进 decision", await js(`(document.querySelector('#decision-dialog .dd-title')||{textContent:''}).textContent.includes('E 输入中 decision')`));
    await js(`window.__ansRenderer.appendOperatorRequest({ id: 'e-new-decision', roleId: 'chief', request: { kind: 'choice', cardKind: 'decision', title: 'E 新 decision 不替换', options: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }] } })`);
    await sleep(220);
    check("已有对话框：decision 新卡排队不替换", await js(`(document.querySelector('#decision-dialog .dd-title')||{textContent:''}).textContent.includes('E 输入中 decision')`));
    await js(`document.querySelector('#decision-dialog .dd-later').click()`);
    await sleep(150);
    await js(`document.querySelector('#decision-dialog .dd-later')?.click()`);
    await sleep(150);

    // F-E1/F-E3/F-E4：真实 Electron 运行时行为（拒绝/Esc/焦点/二次确认/双击/过期历史）。
    operatorResponses.length = 0;
    await js(`window.__ansRenderer.appendOperatorRequest({ id: 'e-choice-reject', roleId: 'chief', request: { kind: 'choice', title: 'E 选择题拒绝', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } })`);
    await sleep(180);
    await js(`document.querySelector('#decision-dialog .dd-reject').click()`);
    await sleep(180);
    check("choice 未选择时拒绝可提交 cancelled", operatorResponses.some((item) => item?.id === 'e-choice-reject' && item?.decision?.kind === 'choice' && item?.decision?.cancelled === true));
    check("choice 拒绝后对话框关闭", await js(`!document.querySelector('#decision-dialog')`));

    operatorResponses.length = 0;
    await js(`window.__ansRenderer.appendOperatorRequest({ id: 'e-esc', roleId: 'chief', request: { kind: 'confirm', title: 'E Esc 稍后' } })`);
    await sleep(180);
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await sleep(180);
    check("Esc=稍后、不确认不拒绝", await js(`!document.querySelector('#decision-dialog')`) && operatorResponses.length === 0);

    await js(`window.__ansRenderer.appendOperatorRequest({ id: 'e-destructive', roleId: 'chief', risk: 'high', request: { kind: 'confirm', title: 'E 破坏性二次确认' } })`);
    await sleep(180);
    await js(`document.querySelector('#decision-dialog .dd-confirm').click()`);
    await sleep(100);
    check("破坏性第一次点击不提交", operatorResponses.length === 0);
    check("破坏性显示二次确认", await js(`(document.querySelector('#decision-dialog .dd-confirm')||{textContent:''}).textContent.includes('再次确认')`));
    await js(`document.querySelector('#decision-dialog .dd-confirm').click(); document.querySelector('#decision-dialog .dd-confirm')?.click();`);
    await sleep(220);
    check("破坏性二次点击仅提交一次", operatorResponses.filter((item) => item?.id === 'e-destructive').length === 1);
    await js(`document.querySelector('#decision-dialog .dd-later')?.click()`);
    await sleep(120);

    await js(`window.__ansRenderer.appendOperatorRequest({ id: 'e-expire', roleId: 'chief', request: { kind: 'confirm', title: 'E 过期历史' } })`);
    await sleep(180);
    const aria = await js(`(() => { const d=document.querySelector('#decision-dialog'); return d ? { modal:d.getAttribute('aria-modal'), labelled:d.getAttribute('aria-labelledby'), described:d.getAttribute('aria-describedby'), role:d.getAttribute('role') } : null; })()`);
    check("ARIA 模态/标题/描述", !!aria && aria.role === 'dialog' && aria.modal === 'true' && aria.labelled === 'dd-title' && aria.described === 'dd-source dd-risk', aria);
    const trapped = await js(`(() => { const d=document.querySelector('#decision-dialog'); if (!d) return false; const f=[...d.querySelectorAll('button:not([disabled])')]; if (f.length < 2) return false; const first=f[0], last=f[f.length-1]; last.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); return document.activeElement === first && first !== d.querySelector('.dd-confirm'); })()`);
    check("焦点陷阱：Tab 从末项回到首项且不在确认", trapped);
    await js(`document.querySelector('#decision-dialog .dd-confirm').click()`);
    await sleep(500);
    await js(`document.getElementById('tab-decisions').click()`);
    await sleep(250);
    check("过期申请进入历史", await js(`(() => { const h=document.getElementById('decision-center-history'); return !!h && h.textContent.includes('E 过期历史') && h.textContent.includes('已失效'); })()`));
    await js(`document.getElementById('tab-work').click()`);
    await sleep(150);

    // 200% 窄屏：对话框/面板不产生横向滚动。
    wc.setZoomFactor(2);
    win.setContentSize(960, 620);
    await sleep(300);
    await js(`window.dispatchEvent(new Event('resize'))`);
    await sleep(200);
    check("200% 无横向溢出", await js(`document.documentElement.scrollWidth <= innerWidth + 1`));
    // 2026-10-29：窄屏（200% / 960 物理 ≈ 480 CSS 像素）下 Composer 两开关也不得把页面撑开。
    check("200% Composer 控件不溢出", await js(`(() => { const bottom=document.querySelector('.composer-bottom'), ctr=document.querySelector('.composer-controls'); if(!bottom||!ctr) return false; const r=bottom.getBoundingClientRect(), c=ctr.getBoundingClientRect(); const pills=[...document.querySelectorAll('.composer-auto-approve')].map(el=>el.getBoundingClientRect()); return c.right<=innerWidth+1 && r.right<=innerWidth+1 && pills.every(p=>p.left>=-0.5&&p.right<=innerWidth+1) && ctr.scrollWidth<=ctr.clientWidth+1; })()`));
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
