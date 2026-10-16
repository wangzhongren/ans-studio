// test/测试/g3-search-verify/fold-probe.mjs —— 独立对抗性核验：工具行折叠（客户 2026-10-16 批准口径）
//
// 目的（不复用任何他角色断言，自建场景，驱动**真实 renderer**）：
//   S1 运行中不折叠：live + 未 settled + busy ⇒ 组展开、逐条行使实时可见；
//   S2 摘要口径：恰「本轮 N 个调用：<分解>」＋「含 X 条未放行」（未放行相位并入同轮同 callId 组行、
//      组不切断；独立未放行行直显且不折叠）；
//   S3 轮结束（settled）折叠成一行：摘要不变、独立未放行行仍在；展开后**逐条零丢失**（下标/相位/文本全等）；
//   S4 手动开合优先：运行中手工收起后，追加与 settled 都不自动展开；摘要照常更新；
//   S5 焦点在组内 ⇒ settled 不吞焦点（不自动收起）；
//   S6 失败相位标「含 1 条失败」；无 callId 的独立未放行行切断组并直显（不发明身份）。
//
// 运行（仓库根）：
//   ANS_G3_FOLD_OUTDIR=/private/tmp/ans-g3-fold node_modules/.bin/electron test/测试/g3-search-verify/fold-probe.mjs
// 退出码 0=全过；1=有 FAIL（逐条打印）。受控 IPC 替身：无模型请求、无网络、不读真实用户项目。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..', '..', '..', 'app');
const OUT = process.env.ANS_G3_FOLD_OUTDIR || '/tmp/ans-g3-fold';
fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', path.join(OUT, 'user-data')); // 绝对路径（既有夹具经验）

const ROOT = '/offline-g3-fold-probe';
let win;
let failures = 0;
const report = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (line) => { console.log(line); report.push(line); };
const check = (name, ok, detail) => { log((ok ? 'PASS ' : 'FAIL ') + name + (detail == null ? '' : ' | ' + detail)); if (!ok) failures += 1; };

const roles = ['A', 'B'].map((roleId) => ({ roleId, cardPath: ROOT + '/角色卡/' + roleId + '/role-card.md', cardText: '# ' + roleId, boundary: { entries: [] }, boundaryPath: '', changelog: null, docs: [] }));
const listing = { projectRoot: ROOT, primaryRoleId: 'A', hasRoles: true, warnings: [], roles };
const handlers = {
  'app:renderer-diagnostic': () => ({ ok: true }),
  'app:recovery-state': () => ({ projectRoot: ROOT, roleId: 'A' }),
  'app:recovery-ready': () => ({ ok: true }),
  'window:is-maximized': () => false,
  'app:list-project': () => listing,
  'app:pick-project': () => ROOT,
  'session:history-get': (_e, input) => ({ ...input, rows: [], error: null, skipped: 0 }),
  'session:live-views': () => [],
  'session:open': () => ({ ok: true, resumed: true, contextSource: 'resumed' }),
  'session:live': () => [],
  'session:stop': () => ({ ok: true }),
  'session:abort': () => ({ ok: true, supported: true }),
  'session:operator-response': () => ({ ok: true }),
  'session:send': () => ({ ok: true }),
  'runtime-config:get': (_e, input) => ({ runtime: input.runtime, label: input.runtime, path: ROOT + '/.env', revision: 0, application: 'next-session', missingKeys: [], fields: [] }),
  'app:attach-image': (_e, input) => ({ ok: true, image: { name: (input && input.name) || 'a.png', mime: 'image/png', size: 1 } }),
};
Object.entries(handlers).forEach(([name, fn]) => ipcMain.handle(name, fn));

const payload = (event, roleId = 'A') => ({ projectRoot: ROOT, roleId, runtime: 'pi', event: { ...event, roleId, runtime: 'pi' } });
const start = (turn, id, tool, args = {}) => ({ kind: 'tool_call', turnId: turn, summary: '调用工具 ' + tool, detail: { toolName: tool, toolCallId: id, phase: 'start', ...args } });
const result = (turn, id, tool, extra = {}) => ({ kind: 'accepted', turnId: turn, summary: tool + ' 执行完成', detail: { toolName: tool, toolCallId: id, phase: 'result', ok: true, status: 'completed', ...extra } });
const settled = (turn) => ({ kind: 'settled', turnId: turn, summary: '本轮已完成', detail: { outcome: 'completed' } });

const groups = (js) => js(`[...document.querySelectorAll('#chat .tool-records')].map(g=>({open:g.open, summary:g.querySelector('summary').textContent}))`);
const rowsMap = (js) => js(`[...document.querySelectorAll('#chat .tool-activity')].map(x=>({idx:x.dataset.activityIndex,ph:x.dataset.activityPhases,text:x.textContent}))`);
const deniedTexts = (js) => js(`[...document.querySelectorAll('#chat .sys-denied')].map(x=>x.textContent)`);

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { fs.writeFileSync(path.join(OUT, 'watchdog.txt'), 'timeout'); app.exit(1); }, 120000);
  try {
    win = new BrowserWindow({ width: 1360, height: 860, useContentSize: true, frame: false, show: false, webPreferences: { preload: path.join(APP, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
    await win.loadFile(path.join(APP, 'renderer', 'index.html'));
    await pause(250);
    const js = (code) => win.webContents.executeJavaScript(code.includes('await ') ? '(async()=>{' + code + '})()' : code);
    const push = async (channel, data) => { win.webContents.send(channel, data); await pause(90); };

    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRole('A')`);
    await pause(60);
    await push('session:role-state', { projectRoot: ROOT, roleId: 'A', runtime: 'pi', busy: true, summaries: [], queue: [] });

    // —— S1/S2：运行中不折叠 + 摘要口径 + 未放行相位并入（组不切断）+ 独立未放行行直显 ——
    await push('session:events', [
      payload(start('g3-t1', 'g1', 'role_status')),
      payload(result('g3-t1', 'g1', 'role_status')),
      payload(start('g3-t1', 'g2', 'run_shell', { args: { command: 'ans status' } })),
      payload({ kind: 'denied', turnId: 'g3-t1', summary: '未执行：命令被拒绝（原因：g3 探针受控拒绝）', detail: { toolName: 'run_shell', toolCallId: 'g2', phase: 'blocked' } }),
    ]);
    let gs = await groups(js);
    check('S1 运行中不折叠：恰一组且展开', gs.length === 1 && gs[0].open === true, JSON.stringify(gs));
    check('S2 摘要：恰「本轮 2 个调用：role_status / run_shell」＋「含 1 条未放行」', gs[0].summary === '本轮 2 个调用：role_status / run_shell · 含 1 条未放行', JSON.stringify(gs[0].summary));
    let rows = await rowsMap(js);
    check('S2 未放行相位并入：行 2 同时含「调用发起」与「已拒绝」（组未切断、仍 2 行）', rows.length === 2 && rows[1].text.includes('调用发起') && rows[1].text.includes('已拒绝') && rows[0].text.includes('执行完成'));
    let denied = await deniedTexts(js);
    check('S2 独立未放行行直显（治理信号不折叠）', denied.length === 1 && denied[0].includes('g3 探针受控拒绝'), JSON.stringify(denied));
    fs.writeFileSync(path.join(OUT, 'fold-probe-1-running.png'), (await win.webContents.capturePage()).toPNG());
    const runningSnapshot = JSON.stringify(rows.map((r) => [r.idx, r.ph, r.text]));

    // —— S3：settled 折叠 + 展开零丢失 ——
    await push('session:events', [payload(settled('g3-t1'))]);
    gs = await groups(js);
    check('S3 轮结束折叠成一行：open=false、摘要不变', gs.length === 1 && gs[0].open === false && gs[0].summary === '本轮 2 个调用：role_status / run_shell · 含 1 条未放行', JSON.stringify(gs));
    denied = await deniedTexts(js);
    check('S3 折叠后独立未放行行仍在', denied.length === 1 && denied[0].includes('g3 探针受控拒绝'));
    fs.writeFileSync(path.join(OUT, 'fold-probe-2-settled.png'), (await win.webContents.capturePage()).toPNG());
    await js(`document.querySelector('#chat .tool-records').open=true`); await pause(120);
    rows = await rowsMap(js);
    check('S3 手动展开：逐条零丢失（下标/相位/文本全等）', rows.length === 2 && JSON.stringify(rows.map((r) => [r.idx, r.ph, r.text])) === runningSnapshot, JSON.stringify(rows));
    fs.writeFileSync(path.join(OUT, 'fold-probe-3-expanded.png'), (await win.webContents.capturePage()).toPNG());

    // —— S4：手动开合优先（运行中收起后追加与 settled 均不自动展开；摘要照常更新）——
    await push('session:events', [
      payload(start('g3-t2', 'g3', 'role_status')), payload(result('g3-t2', 'g3', 'role_status')),
      payload(start('g3-t2', 'g4', 'read_file', { args: { path: 'README.md' } })), payload(result('g3-t2', 'g4', 'read_file')),
    ]);
    gs = await groups(js);
    check('S4 新轮自成一组且运行中展开', gs.length === 2 && gs[1].open === true, JSON.stringify(gs));
    await js(`document.querySelectorAll('#chat .tool-records')[1].open=false`); await pause(80);
    await push('session:events', [payload(start('g3-t2', 'g5', 'session_tail'))]);
    gs = await groups(js);
    check('S4 运行中手工收起：追加后不自动展开、摘要更新为 3 个调用', gs[1].open === false && gs[1].summary.startsWith('本轮 3 个调用：role_status / read_file / session_tail'), JSON.stringify(gs[1]));
    await push('session:events', [payload(settled('g3-t2'))]);
    gs = await groups(js);
    check('S4 settled 后手工收起仍被尊重（不自动展开）', gs[1].open === false, JSON.stringify(gs[1]));

    // —— S5：焦点在组内 ⇒ settled 不吞焦点（不自动收起）——
    await push('session:events', [payload(start('g3-t3', 'g6', 'role_status')), payload(result('g3-t3', 'g6', 'role_status'))]);
    await js(`(() => { const g=[...document.querySelectorAll('#chat .tool-records')].at(-1); g.querySelector('summary').focus(); return document.activeElement===g.querySelector('summary'); })()`);
    const focused = await js(`document.activeElement && document.activeElement.tagName==='SUMMARY'`);
    check('S5 前置：焦点确在组摘要上（场景为真）', focused === true);
    await push('session:events', [payload(settled('g3-t3'))]);
    gs = await groups(js);
    check('S5 焦点在组内：settled 不自动折叠（自动动作不吞焦点）', gs.at(-1).open === true, JSON.stringify(gs.at(-1)));
    await js(`document.activeElement && document.activeElement.blur()`);

    // —— S6：失败相位标「含 1 条失败」；无 callId 独立未放行切断组并直显 ——
    await push('session:events', [
      payload(start('g3-t4', 'g7', 'write_file', { args: { path: 'README.md' } })),
      payload({ kind: 'accepted', turnId: 'g3-t4', summary: 'write_file 执行失败：README.md（G3-EACCES）', detail: { toolName: 'write_file', toolCallId: 'g7', phase: 'result', ok: false, status: 'failed' } }),
    ]);
    gs = await groups(js);
    const failGroup = gs.at(-1);
    check('S6 失败相位并入并在摘要标注「含 1 条失败」', failGroup.open === true && failGroup.summary.startsWith('本轮 1 个调用：write_file') && failGroup.summary.includes('含 1 条失败'), JSON.stringify(failGroup));
    denied = await deniedTexts(js);
    check('S6 失败相位独立行直显（含失败文本）', denied.some((text) => text.includes('G3-EACCES')));
    const groupsBefore = (await groups(js)).length;
    await push('session:events', [
      payload({ kind: 'denied', turnId: 'g3-t4', summary: '未执行：无法关联的独立拒绝（g3-orphan）', detail: { toolName: 'run_shell', phase: 'blocked' } }),
      payload(start('g3-t4', 'g8', 'role_status')),
    ]);
    gs = await groups(js);
    check('S6 无 callId 独立未放行：不发明身份、切断组（后续调用另起一组）并直显', gs.length === groupsBefore + 1 && gs.at(-1).summary.startsWith('本轮 1 个调用：role_status'), JSON.stringify(gs));
    denied = await deniedTexts(js);
    check('S6 独立未放行行直显（g3-orphan 文本在）', denied.some((text) => text.includes('g3-orphan')));
    await push('session:events', [payload(settled('g3-t4'))]);

    fs.writeFileSync(path.join(OUT, 'fold-probe-report.json'), JSON.stringify({ reports: report }, null, 2));
    console.log((failures === 0 ? 'G3_FOLD_PROBE_PASS ' : 'G3_FOLD_PROBE_FAIL ') + report.filter((line) => line.startsWith('PASS') || line.startsWith('FAIL')).length + ' ' + OUT);
    clearTimeout(watchdog);
    app.exit(failures === 0 ? 0 : 1);
  } catch (error) {
    fs.writeFileSync(path.join(OUT, 'crash.txt'), String(error && error.stack || error));
    console.error('G3_FOLD_PROBE_CRASH', error);
    clearTimeout(watchdog);
    app.exit(1);
  }
});
