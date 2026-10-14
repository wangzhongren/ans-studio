// 离线设计对齐测量夹具（只读测量，不改页面）：真实 renderer/preload + 受控 IPC 替身。
// 目的：在 1360×860 / 960×620 两档记录关键组件 rect 与计算样式，供与 UIUX v2 设计规范/原型逐项对照。
// 运行：ANS_UIUX_OUTDIR=/tmp/ans-design-audit node_modules/.bin/electron test/桌面应用/e2e/uiux-design-audit.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../../app');
const OUT = process.env.ANS_UIUX_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), 'ans-design-audit-'));
fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', path.join(OUT, 'user-data'));
const ROOT = '/offline-design-audit';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
let win;
const pause = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code.includes('await ') ? '(async()=>{' + code + '})()' : code);
const roles = ['su', '桌面应用'].map(roleId => ({ roleId, cardPath: ROOT + '/角色卡/' + roleId + '/role-card.md', cardText: '# ' + roleId + '\n\n完整角色职责与边界说明。\n\n' + ('资料内容用于检查阅读态。\n\n'.repeat(40)), boundary: { entries: [] }, boundaryPath: '', changelog: null, docs: [] }));
const listing = { projectRoot: ROOT, primaryRoleId: 'su', hasRoles: true, warnings: [], roles };
const longFull = '全文 ' + '排队消息详细内容与来源。\n'.repeat(30) + '长连续文本 ' + 'ordinaryword'.repeat(100);
const queue = [
  { id: 'msg\u0000long', kind: 'message', summary: '客户长消息：' + '超过80字的队列摘要用于核对换行、时间与操作归属。'.repeat(6), full: longFull, at: '2026-10-13T10:01:00Z' },
  { id: 'dispatch', kind: 'dispatch', sourceRoleId: '桌面应用', summary: '派发任务', full: '', at: '2026-10-13T10:02:00Z' },
  { id: 'handback', kind: 'handback', sourceRoleId: '桌面应用', summary: '回交报告', full: '', at: '2026-10-13T10:03:00Z' },
];
let activeQueue = queue.slice();
const snapshot = (busy = true) => ({ roleId: 'su', busy, summaries: activeQueue.map(x => x.summary), queue: activeQueue, running: busy ? { id: 'running', kind: 'message', summary: '正在处理当前请求', full: '', at: '2026-10-13T10:00:00Z' } : null });
const handlers = {
  'app:renderer-diagnostic': () => ({ ok: true }), 'app:recovery-state': () => ({ projectRoot: ROOT, roleId: 'su' }), 'app:recovery-ready': () => ({ ok: true }),
  'window:is-maximized': () => false, 'app:list-project': () => listing, 'app:pick-project': () => ROOT,
  'session:open': () => ({ ok: true, resumed: true, contextSource: 'resumed' }), 'session:live': () => ['su'], 'session:stop': () => ({ ok: true }),
  'session:abort': () => ({ ok: true, supported: true }),
  'session:operator-response': () => ({ ok: true }),
  'pi-config:get': () => ({ path: ROOT + '/' + ('a-very-long-path/'.repeat(12)) + '.env', fields: ['ANTHROPIC_AUTH_TOKEN', 'ANS_PI_BASE_URL', 'ANS_PI_MODEL', 'ANS_PI_CONTEXT_WINDOW'].map(key => ({ key, secret: key === 'ANTHROPIC_AUTH_TOKEN', value: key === 'ANTHROPIC_AUTH_TOKEN' ? '' : 'fixture', isSet: true })) }),
  'pi-config:save': () => ({ ok: true, appliedKeys: [] }),
  'app:pick-image': () => ({ ok: true, image: { name: 'fixture.png', mime: 'image/png', size: 68, dataBase64: PNG } }),
  'app:attach-image': (_e, input) => ({ ok: true, image: { name: input.name, mime: 'image/png', size: 68 } }),
  'session:send': () => ({ ok: true }),
  'session:withdraw': (_e) => new Promise(() => {}),
};
Object.entries(handlers).forEach(([name, fn]) => ipcMain.handle(name, fn));
const event = (kind, summary, detail) => ({ roleId: 'su', event: { kind, summary, detail } });

// 受控回放内容：用户消息、助手答复、常规活动组（含未知）、失败/拒绝。
const historyRows = [
  { kind: 'user', text: '我希望继续开发这个 SSH 工具，先看看目前的项目。', at: '' },
  { kind: 'tool', text: '调用工具 run_shell', at: '10:24', activity: { toolName: 'run_shell', target: 'ls -la src/components src/store', toolCallId: 'a1', phase: 'call', status: 'call' } },
  { kind: 'tool', text: 'run_shell 已执行：ls -la src/components src/store（exit 0）', at: '10:24', activity: { toolName: 'run_shell', target: 'ls -la src/components src/store · exit 0', toolCallId: 'a1', phase: 'result', status: 'result' } },
  { kind: 'tool', text: '调用工具 read_file', at: '10:25', activity: { toolName: 'read_file', target: 'src/App.jsx', toolCallId: 'a2', phase: 'call', status: 'call' } },
  { kind: 'tool', text: 'read_file 返回：src/App.jsx', at: '10:25', activity: { toolName: 'read_file', target: 'src/App.jsx · 读取返回', toolCallId: 'a2', phase: 'result', status: 'result' } },
  { kind: 'assistant', text: '项目已有一份可运行的实现。接下来需要先明确你想继续开发的范围，我会据此给出方案。\n\n### 当前项目\n\n- Electron 31 + React 18 + Vite 的桌面应用\n- 主界面位于 src/App.jsx\n\n请补充你要完成的工作。', at: '' },
  { kind: 'denied', text: 'read_file 执行失败：src/store/missing.md（ENOENT）\nfile not found', at: '' },
  { kind: 'denied', text: '未执行：写入被拒绝，目标不在当前角色写入白名单内', at: '' },
  { kind: 'assistant', text: '当前写入被边界拒绝。请先处理上面的确认，我会保留已有探查结果。', at: '' },
];

const measurement = `(() => {
  const q = s => document.querySelector(s);
  const rect = s => { const el = q(s); if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2), right: +b.right.toFixed(2), bottom: +b.bottom.toFixed(2) }; };
  const cs = (s, props) => { const el = q(s); if (!el) return null; const st = getComputedStyle(el); const o = {}; for (const p of props) o[p] = st.getPropertyValue(p); return o; };
  const box = ['background-color','color','border-radius','padding','font-size','line-height','font-weight','border','border-left','border-bottom','margin','max-width','display','align-items','gap','grid-template-columns','text-decoration-line','outline-color'];
  const m = {};
  m.viewport = { w: innerWidth, h: innerHeight, bodyScrollW: document.body.scrollWidth, bodyClientW: document.body.clientWidth, appScrollW: q('.app').scrollWidth, appClientW: q('.app').clientWidth, rootScrollW: document.documentElement.scrollWidth, rootClientW: document.documentElement.clientWidth };
  m.titlebar = { rect: rect('#titlebar'), style: cs('#titlebar', box), mark: cs('.titlebar-mark', ['font-size','font-weight']), sub: cs('.titlebar-sub', ['font-size','color']) };
  m.shell = { grid: cs('.app', ['grid-template-columns','grid-template-rows']), left: rect('.col-left'), mid: rect('.col-mid') };
  m.side = {
    head: rect('.side-head'), title: cs('.side-title', ['font-size','font-weight','color']),
    import: { rect: rect('#btn-import'), style: cs('#btn-import', box) },
    path: { rect: rect('#project-path'), style: cs('#project-path', ['font-size','line-height','color','font-family']) },
    treeLabel: cs('.tree-label', ['font-size','font-weight','color','padding']),
    group: cs('.tree-group', ['font-size','font-weight','color','padding']),
    item: { rect: rect('.tree-item'), style: cs('.tree-item', box) },
    itemActive: cs('.tree-item.active', ['background-color','border-radius']),
    name: cs('.ti-name', ['font-size','font-weight']),
    sub: cs('.ti-sub', ['font-size','color']),
    status: cs('.ti-status', ['font-size','color']),
    badge: cs('.ti-badge', ['font-size','padding','border-radius','background-color','color']),
  };
  m.chatHead = { rect: rect('.chat-head'), style: cs('.chat-head', box), top: rect('.chat-head-top'), role: cs('#chat-role', ['font-size','font-weight','color']), sub: { rect: rect('#chat-role-sub'), style: cs('#chat-role-sub', ['font-size','color']) }, notes: rect('.chat-head-notes'), hint: cs('#composer-hint', ['font-size','color']), note: { rect: rect('#runtime-note'), style: cs('#runtime-note', ['font-size','color','display']), ico: rect('#runtime-note .rt-ico') } };
  m.chat = { rect: rect('#chat'), style: cs('#chat', box), pane: rect('#chat .chat-pane') };
  const firstUser = q('#chat .msg-user'); if (firstUser) {
    const b = firstUser.getBoundingClientRect(); const st = getComputedStyle(firstUser);
    m.userMsg = { rect: { x:+b.x.toFixed(2), y:+b.y.toFixed(2), w:+b.width.toFixed(2), h:+b.height.toFixed(2), right:+b.right.toFixed(2) }, bg: st.backgroundColor, radius: st.borderRadius, padding: st.padding, fontSize: st.fontSize, lineHeight: st.lineHeight, maxWidth: st.maxWidth, alignSelf: st.alignSelf };
  }
  const asMsgs = [...document.querySelectorAll('#chat .msg-assistant')]; m.assistantCount = asMsgs.length;
  if (asMsgs.length) { const el = asMsgs[0]; const b = el.getBoundingClientRect(); const st = getComputedStyle(el);
    m.assistantMsg = { rect: { x:+b.x.toFixed(2), y:+b.y.toFixed(2), w:+b.width.toFixed(2), h:+b.height.toFixed(2) }, fontSize: st.fontSize, lineHeight: st.lineHeight, color: st.color, maxWidth: st.maxWidth };
    const p = el.querySelector('p'); if (p) m.assistantP = { rect: (b2 => ({ x:+b2.x.toFixed(2), w:+b2.width.toFixed(2), h:+b2.height.toFixed(2) }))(p.getBoundingClientRect()), margin: getComputedStyle(p).margin };
    const h3 = el.querySelector('h3'); if (h3) m.assistantH3 = getComputedStyle(h3).cssText ? { fontSize: getComputedStyle(h3).fontSize, fontWeight: getComputedStyle(h3).fontWeight, margin: getComputedStyle(h3).margin } : null;
  }
  m.records = { rect: rect('.tool-records'), style: cs('.tool-records', box), summary: cs('.tool-records > summary', ['font-size','color','line-height','padding']), count: cs('.tool-records .record-count', ['font-size','color','margin']), row: cs('.tool-activity', box), target: cs('.tool-activity .activity-target', ['font-size','font-family','color']), state: cs('.tool-activity .activity-state', ['font-size','color']) };
  m.denied = { rect: rect('.sys-denied'), style: cs('.sys-denied', box), summary: cs('.sys-denied > summary', ['font-size','color','line-height']), target: cs('.sys-denied .denied-target', ['font-size','font-family','color']), chev: !!q('.sys-denied .chev') };
  m.composer = { area: { rect: rect('.composer'), style: cs('.composer', box) }, capsule: { rect: rect('#composer-capsule'), style: cs('#composer-capsule', box) }, input: cs('#inp-message', ['font-size','line-height','padding','color','background-color']), send: { rect: rect('#btn-send'), style: cs('#btn-send', box) }, halt: { rect: rect('#btn-halt'), hidden: q('#btn-halt').hidden, style: cs('#btn-halt', ['border','background-color','color','border-radius']) }, attach: { rect: rect('#btn-attach-image'), style: cs('#btn-attach-image', ['color','border-radius']) } };
  m.drawer = { rect: rect('#right-drawer'), style: cs('#right-drawer', ['background-color','border-left']), open: q('#right-drawer').classList.contains('open'), head: { rect: rect('.drawer-head'), style: cs('.drawer-head', ['height','padding','border-bottom']) }, title: cs('#drawer-title', ['font-size','font-weight']), body: { rect: rect('#right-body'), style: cs('#right-body', ['padding']) } };
  m.sections = [...document.querySelectorAll('#right-body details.sec')].slice(0, 2).map(d => ({ summary: { style: { fontSize: getComputedStyle(d.querySelector('summary')).fontSize, padding: getComputedStyle(d.querySelector('summary')).padding, color: getComputedStyle(d.querySelector('summary')).color }, rect: (b => ({ x:+b.x.toFixed(2), h:+b.height.toFixed(2) }))(d.querySelector('summary').getBoundingClientRect()) }, borderBottom: getComputedStyle(d).borderBottom }));
  m.work = { body: { rect: rect('#right-queue-body'), style: cs('#right-queue-body', ['padding']) }, heading: cs('#right-queue-body .work-heading', ['font-size','font-weight']), running: cs('#right-queue-body .q-item.is-running', ['display','padding']), item: cs('#right-queue-body .q-item:not(.is-running)', ['display','grid-template-columns','column-gap','padding','border-bottom']), pos: cs('#right-queue-body .q-pos', ['font-size','min-width']), src: cs('#right-queue-body .q-src', ['font-size','color','width']), meta: cs('#right-queue-body .q-meta', ['font-size','font-family','color']), text: cs('#right-queue-body .q-text', ['font-size','line-height','color','margin']), toggleBtn: { rect: rect('#right-queue-body .q-toggle'), style: cs('#right-queue-body .q-toggle', box) }, withdrawBtn: { rect: rect('#right-queue-body .q-withdraw'), style: cs('#right-queue-body .q-withdraw', box) }, full: { rect: rect('#right-queue-body .q-full'), style: cs('#right-queue-body .q-full', box) } };
  const pi = q('#pi-panel'); m.pi = { hidden: pi.hidden, panel: { rect: pi.hidden ? null : rect('#pi-panel'), style: cs('#pi-panel', ['padding','margin','background-color','border']) }, label: cs('.pi-field-label', ['font-size','color','font-family']), input: { rect: rect('.pi-input'), style: cs('.pi-input', ['height','border','border-radius','font-size','font-family','background-color','padding']) }, pathEl: cs('#pi-panel-path', ['font-size','font-family','color']), hint: cs('.pi-panel-hint', ['font-size','color']), save: { rect: rect('#pi-save'), style: cs('#pi-save', box) }, secretTag: cs('.pi-secret-tag', ['font-size','background-color','border-radius','padding']), advanced: !!q('.pi-advanced') };
  const opReq = q('#chat .op-request'); m.pending = opReq ? { rect: (b => ({ x:+b.x.toFixed(2), w:+b.width.toFixed(2), h:+b.height.toFixed(2) }))(opReq.getBoundingClientRect()), style: cs('#chat .op-request', box), title: cs('#chat .op-request .op-title', ['font-size','font-weight']), question: cs('#chat .op-request .op-question', ['font-size','color']), confirm: { rect: rect('#chat .op-request .op-confirm'), style: cs('#chat .op-request .op-confirm', box) }, deny: { rect: rect('#chat .op-request .op-deny'), style: cs('#chat .op-request .op-deny', box) } } : null;
  const chip = q('#op-chip'); m.chip = chip && !chip.hidden ? { rect: rect('#op-chip'), style: cs('#op-chip', box) } : { hidden: true };
  m.current = { rect: rect('#chat .tool-current'), style: cs('#chat .tool-current', ['font-size','color','padding','margin']) };
  return m;
})()`;

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { fs.writeFileSync(path.join(OUT, 'watchdog.txt'), 'timeout'); app.exit(1); }, 60000);
  try {
    win = new BrowserWindow({ width: 1360, height: 860, useContentSize: true, frame: false, show: false, webPreferences: { preload: path.join(APP, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
    await win.loadFile(path.join(APP, 'renderer/index.html'));
    await pause(200);
    const push = async (ch, payload) => { win.webContents.send(ch, payload); await pause(120); };
    const shot = async name => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); };
    const report = { electron: process.versions.electron, node: process.versions.node, widths: {} };
    await push('session:role-state', snapshot(true));
    await push('session:history', { roleId: 'su', projectRoot: ROOT, rows: historyRows });
    await push('session:operator-request', { id: 'audit-pending', roleId: 'su', request: { kind: 'confirm', title: '需要你确认：是否先调整本角色的写入范围，再继续这项修改？', preview: '预览：角色卡与边界摘要（受控夹具）。\n第二行。' } });
    for (const [w, h] of [[1360, 860], [960, 620]]) {
      win.setContentSize(w, h); await pause(200);
      const entry = {};
      // A：主聊天（抽屉关）
      await js(`document.getElementById('drawer-close').click()`); await pause(150);
      entry.main = await js(measurement);
      await shot(`A${w}-chat`);
      await js(`(()=>{document.getElementById('chat').scrollTop=0;})()`); await pause(150);
      await shot(`A${w}-chat-top`);
      await js(`(()=>{let g=document.querySelector('#chat .tool-records summary'); if(g){g.parentElement.open=true;}})()`); await pause(150);
      await shot(`A${w}-chat-records-open`);
      // B：角色资料抽屉（含队列全文展开）
      await js(`document.getElementById('tab-card').click()`); await pause(200);
      await js(`(()=>{let t=document.querySelector('#right-body .q-toggle'); if(t)t.click();})()`); await pause(150);
      entry.roleDrawer = await js(measurement);
      await shot(`B${w}-role`);
      // C：Pi 抽屉
      await js(`document.getElementById('tab-pi').click()`); await pause(200);
      entry.piDrawer = await js(measurement);
      await shot(`C${w}-pi`);
      entry.piOverflow = await js(`(()=>{const b=document.getElementById('right-body'),p=document.getElementById('pi-panel');const inputs=[...document.querySelectorAll('.pi-input')];return {bodyClientW:b.clientWidth,bodyScrollW:b.scrollWidth,panelClientW:p.clientWidth,panelScrollW:p.scrollWidth,inputRights:inputs.map(i=>+i.getBoundingClientRect().right.toFixed(2)),drawerRight:+document.getElementById('right-drawer').getBoundingClientRect().right.toFixed(2)};})()`);
      await js(`document.getElementById('drawer-close').click()`); await pause(150);
      report.widths[w] = entry;
    }
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log('AUDIT_DONE ' + OUT);
    clearTimeout(watchdog);
    app.quit();
  } catch (error) {
    fs.writeFileSync(path.join(OUT, 'error.txt'), String(error && error.stack || error));
    console.error(error); clearTimeout(watchdog); app.exit(1);
  }
});
