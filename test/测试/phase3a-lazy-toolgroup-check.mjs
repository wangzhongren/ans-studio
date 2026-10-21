#!/usr/bin/env node
/**
 * test/测试/phase3a-lazy-toolgroup-check.mjs
 *
 * PM 裁定 §10.4 的正向覆盖（Phase 3A 懒挂载 DOM 契约例外）：
 *  - 同一轮 >40 个调用且默认折叠：内部活动行 0，摘要（调用数/未放行计数）可见，失败/未放行直显可见；
 *  - 展开后内部行立即挂载且内容正确（45 个合并调用行）；
 *  - 再次折叠 → 内部行回到 0；虚拟离屏/回窗后状态稳定（仍闭合、摘要完整、展开仍正常）；
 *  - ≤40 行的小工具组保持旧契约：闭合也挂载（3 行）。
 *
 * 运行（仓库根）：
 *   ./node_modules/.bin/electron test/测试/phase3a-lazy-toolgroup-check.mjs [entry.html] [outDir]
 * 默认 entry = app/renderer/dist/src/index.html；默认 outDir = /tmp/ans-lazy-toolgroup-output。
 */
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const ENTRY = process.argv[2] ? path.resolve(process.argv[2]) : path.join(REPO, "app/renderer/dist/src/index.html");
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : "/tmp/ans-lazy-toolgroup-output";
const PRELOAD = path.join(HERE, "phase3a-lazy-toolgroup-preload.cjs");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
app.setPath("userData", path.join(OUT, "user-data"));

const report = { entry: ENTRY, checks: [], metrics: {}, console: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, value, detail) {
  report.checks.push({ name, value: value === true, detail: detail === undefined ? null : detail });
  console.log(`CHECK ${name}=${JSON.stringify(value)}${detail !== undefined ? " " + JSON.stringify(detail) : ""}`);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360, height: 860, useContentSize: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: PRELOAD },
  });
  const wc = win.webContents;
  wc.on("console-message", (...args) => {
    const e = args[0];
    const level = e && typeof e === "object" && "level" in e ? e.level : args[1];
    const message = e && typeof e === "object" && "message" in e ? e.message : args[2];
    report.console.push({ level, message });
  });
  await win.loadFile(ENTRY);
  await sleep(400);
  const js = (code) => wc.executeJavaScript(code, true);
  async function waitFor(expr, timeout = 8000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      last = await js(expr).catch((e) => String(e));
      if (last) return last;
      await sleep(60);
    }
    return last;
  }

  await waitFor(`!!document.querySelector('#root > .app-shell')`);
  await js(`(async () => { await window.__ansRenderer.loadProject('/lazy'); await window.__ansRenderer.selectRole('A'); })()`);
  await sleep(350);

  // 80 行前置正文 + 同一轮 45 个调用（start+result=90 相位，另加 1 条未放行）+ settled
  const payload = await js(`(() => {
    const events = [];
    for (let i = 0; i < 160; i++) events.push({ roleId: 'A', projectRoot: '/lazy', event: { kind: 'message', summary: '前置正文 ' + i } });
    for (let k = 1; k <= 45; k++) {
      events.push({ roleId: 'A', projectRoot: '/lazy', event: { kind: 'tool_call', turnId: 'turn-lazy', summary: 'read_file：file-' + k + '.md', detail: { toolCallId: 'lazy-' + k, toolName: 'read_file', target: 'file-' + k + '.md', phase: 'start', status: 'call' } } });
      events.push({ roleId: 'A', projectRoot: '/lazy', event: { kind: 'tool_call', turnId: 'turn-lazy', summary: 'read_file 已执行：file-' + k + '.md', detail: { toolCallId: 'lazy-' + k, toolName: 'read_file', target: 'file-' + k + '.md', phase: 'result', status: 'completed', ok: true } } });
    }
    events.push({ roleId: 'A', projectRoot: '/lazy', event: { kind: 'denied', turnId: 'turn-lazy', summary: '拒绝写入：目标不在角色允许范围', detail: { toolCallId: 'lazy-7', toolName: 'write_file', path: 'outside.md', status: 'denied' } } });
    events.push({ roleId: 'A', projectRoot: '/lazy', event: { kind: 'settled', turnId: 'turn-lazy', summary: '本轮已完成', detail: { outcome: 'completed' } } });
    window.__lazy.emitEvents(events);
    return { assistants: 160, calls: 45, phases: 91 };
  })()`);
  report.metrics.payload = payload;
  await waitFor(`document.querySelectorAll('#chat .tool-records').length >= 1`);
  await sleep(500);

  const closed = await js(`(() => {
    const groups = [...document.querySelectorAll('#chat .tool-records')];
    const g = groups[groups.length - 1];
    const summary = g ? g.querySelector('summary').textContent : '';
    const denied = [...document.querySelectorAll('#chat .sys-denied')].map(x => x.textContent);
    return {
      groupCount: groups.length,
      open: g ? g.open : null,
      summary,
      internalActivities: g ? g.querySelectorAll('.tool-activity').length : -1,
      internalRecords: g ? g.querySelectorAll('.tool-call-record').length : -1,
      deniedCount: denied.length,
      deniedText: denied.join(' | ').slice(0, 200),
      mountedRows: document.querySelectorAll('#chat .chat-pane > .chat-row').length,
    };
  })()`);
  report.metrics.closed = closed;
  check("LAZY_GROUP_CLOSED_GT40", closed.groupCount === 1 && closed.open === false, { groupCount: closed.groupCount, open: closed.open });
  check("LAZY_CLOSED_INTERNAL_ZERO", closed.internalActivities === 0 && closed.internalRecords === 0, { activities: closed.internalActivities, records: closed.internalRecords });
  check("LAZY_SUMMARY_CALLS_AND_EXCEPTION", /本轮 45 个调用/.test(closed.summary) && /含 1 条未放行/.test(closed.summary), closed.summary);
  check("LAZY_DENIED_DIRECT_VISIBLE", closed.deniedCount >= 1 && /outside\.md/.test(closed.deniedText) && /拒绝写入/.test(closed.deniedText), closed.deniedText);

  const expanded = await js(`(async () => {
    const g = [...document.querySelectorAll('#chat .tool-records')].at(-1);
    g.querySelector('summary').click();
    await new Promise(r => setTimeout(r, 400));
    const activities = [...g.querySelectorAll('.tool-activity')];
    return {
      open: g.open,
      activities: activities.length,
      summary: g.querySelector('summary').textContent,
      firstTarget: activities[0] ? activities[0].textContent : '',
      lastTarget: activities.length ? activities[activities.length - 1].textContent : '',
      hasFile1: activities.some(a => a.textContent.includes('file-1.md')),
      hasFile45: activities.some(a => a.textContent.includes('file-45.md')),
      hasDeniedPhase: activities.some(a => a.textContent.includes('已拒绝')),
    };
  })()`);
  report.metrics.expanded = expanded;
  check("LAZY_EXPAND_MOUNTS_ALL", expanded.open === true && expanded.activities === 45, { open: expanded.open, activities: expanded.activities });
  check("LAZY_EXPAND_CONTENT_CORRECT", expanded.hasFile1 === true && expanded.hasFile45 === true && expanded.hasDeniedPhase === true, { hasFile1: expanded.hasFile1, hasFile45: expanded.hasFile45, hasDeniedPhase: expanded.hasDeniedPhase });

  const recollapsed = await js(`(async () => {
    const g = [...document.querySelectorAll('#chat .tool-records')].at(-1);
    g.querySelector('summary').click();
    await new Promise(r => setTimeout(r, 350));
    return { open: g.open, internal: g.querySelectorAll('.tool-activity').length, summary: g.querySelector('summary').textContent };
  })()`);
  report.metrics.recollapsed = recollapsed;
  check("LAZY_RECOLLAPSE_INTERNAL_ZERO", recollapsed.open === false && recollapsed.internal === 0, recollapsed);

  // 虚拟离屏 → 回窗稳定性（160 行前置正文 > 视口±30 缓冲，保证组可被窗口化卸载）
  const stability = await js(`(async () => {
    const chat = document.getElementById('chat');
    chat.scrollTop = 0;
    await new Promise(r => setTimeout(r, 450));
    const gone = {
      group: !!document.querySelector('#chat .tool-records'),
      mounted: document.querySelectorAll('#chat .chat-pane > .chat-row').length,
    };
    chat.scrollTop = chat.scrollHeight;
    await new Promise(r => setTimeout(r, 500));
    const g = [...document.querySelectorAll('#chat .tool-records')].at(-1);
    const back = {
      group: !!g,
      open: g ? g.open : null,
      internal: g ? g.querySelectorAll('.tool-activity').length : -1,
      summary: g ? g.querySelector('summary').textContent : '',
    };
    let expandAgain = null;
    if (g) {
      g.querySelector('summary').click();
      await new Promise(r => setTimeout(r, 400));
      expandAgain = { open: g.open, internal: g.querySelectorAll('.tool-activity').length };
    }
    return { gone, back, expandAgain };
  })()`);
  report.metrics.stability = stability;
  check("LAZY_VIRTUAL_STABILITY", stability.gone.group === false && stability.back.group === true && stability.back.open === false && stability.back.internal === 0 && /本轮 45 个调用/.test(stability.back.summary) && stability.expandAgain && stability.expandAgain.open === true && stability.expandAgain.internal === 45, stability);

  // 小工具组（≤40）闭合仍挂载
  await js(`(async () => {
    await window.__ansRenderer.selectRole('B');
    const events = [];
    for (let k = 1; k <= 3; k++) {
      events.push({ roleId: 'B', projectRoot: '/lazy', event: { kind: 'tool_call', turnId: 'turn-small', summary: 'read_file：small-' + k + '.md', detail: { toolCallId: 'small-' + k, toolName: 'read_file', target: 'small-' + k + '.md', phase: 'start', status: 'call' } } });
      events.push({ roleId: 'B', projectRoot: '/lazy', event: { kind: 'tool_call', turnId: 'turn-small', summary: 'read_file 已执行：small-' + k + '.md', detail: { toolCallId: 'small-' + k, toolName: 'read_file', target: 'small-' + k + '.md', phase: 'result', status: 'completed', ok: true } } });
    }
    events.push({ roleId: 'B', projectRoot: '/lazy', event: { kind: 'settled', turnId: 'turn-small', summary: '本轮已完成', detail: { outcome: 'completed' } } });
    window.__lazy.emitEvents(events);
  })()`);
  await waitFor(`document.querySelectorAll('#chat .tool-records').length >= 1`);
  await sleep(500);
  const small = await js(`(() => {
    const g = document.querySelector('#chat .tool-records');
    return { open: g ? g.open : null, internal: g ? g.querySelectorAll('.tool-activity').length : -1, summary: g ? g.querySelector('summary').textContent : '' };
  })()`);
  report.metrics.small = small;
  check("SMALL_GROUP_CLOSED_STILL_MOUNTED", small.open === false && small.internal === 3 && /本轮 3 个调用/.test(small.summary), small);

  const errors = report.console.filter((m) => String(m.level) === "error" || m.level === 3);
  check("NO_CONSOLE_ERRORS", errors.length === 0, errors);

  const failures = report.checks.filter((c) => !c.value);
  report.summary = { total: report.checks.length, passed: report.checks.length - failures.length, failed: failures.length };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log("LAZY_TOOLGROUP_SUMMARY " + JSON.stringify(report.summary));
  console.log(failures.length === 0 ? "LAZY_TOOLGROUP_DONE=1" : "LAZY_TOOLGROUP_DONE=0");
  win.destroy();
  app.exit(failures.length === 0 ? 0 : 1);
}).catch((err) => {
  console.error("LAZY_TOOLGROUP_FATAL", (err && err.stack) || err);
  try { fs.writeFileSync(path.join(OUT, "fatal.txt"), String((err && err.stack) || err)); } catch {}
  app.exit(2);
});
