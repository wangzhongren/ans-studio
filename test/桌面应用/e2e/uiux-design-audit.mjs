// 离线设计对齐测量夹具（只读测量 + v3 验收断言）：真实 renderer/preload + 受控 IPC 替身。
// 目的：在 1360×860 / 960×620 两档记录关键组件 rect 与计算样式，供与 UIUX v2 设计规范/原型逐项对照；
// 2026-10-16 追加「v3 验收段」：按视觉收敛 v3 设计 §二(d) 的 12 条数值断言 + S1–S4 结构断言（同源口径 =
// UIUX audit-v3.mjs 的 DENSITY 段；截图 v3-after-* 与 UIUX 证据的 v3-*/ind-before-* 对照）。断言失败 ⇒ 非零退出。
// 运行：ANS_UIUX_OUTDIR=/tmp/ans-design-audit node_modules/.bin/electron test/桌面应用/e2e/uiux-design-audit.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../../../app');
// Phase 5A/5B：默认构建产物入口；ANS_RENDERER_ENTRY 显式覆盖。
// 显式入口必须存在（fail-fast，不静默回退）；断言与测量口径不变。
const EXPLICIT_RENDERER_ENTRY = process.env.ANS_RENDERER_ENTRY || '';
const RENDERER_ENTRY = EXPLICIT_RENDERER_ENTRY || path.join(APP, 'renderer/dist/index.html');
if (EXPLICIT_RENDERER_ENTRY && !fs.existsSync(EXPLICIT_RENDERER_ENTRY)) {
  console.error('ANS_RENDERER_ENTRY does not exist: ' + EXPLICIT_RENDERER_ENTRY);
  process.exit(2);
}
const OUT = process.env.ANS_UIUX_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), 'ans-design-audit-'));
fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', path.join(OUT, 'user-data'));
const ROOT = '/offline-design-audit';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
let win;
let lastJs = '';
const pause = ms => new Promise(r => setTimeout(r, ms));
const js = code => { lastJs = String(code).slice(0, 160); return win.webContents.executeJavaScript(code.includes('await ') ? '(async()=>{' + code + '})()' : code); };
const roles = ['su', '示例角色'].map(roleId => ({ roleId, cardPath: ROOT + '/角色卡/' + roleId + '/role-card.md', cardText: '# ' + roleId + '\n\n完整角色职责与边界说明。\n\n' + ('资料内容用于检查阅读态。\n\n'.repeat(40)), boundary: { entries: [] }, boundaryPath: '', changelog: null, docs: [] }));
const listing = { projectRoot: ROOT, primaryRoleId: 'su', hasRoles: true, warnings: [], roles };
const longFull = '全文 ' + '排队消息详细内容与来源。\n'.repeat(30) + '长连续文本 ' + 'ordinaryword'.repeat(100);
const queue = [
  { id: 'msg\u0000long', kind: 'message', summary: '客户长消息：' + '超过80字的队列摘要用于核对换行、时间与操作归属。'.repeat(6), full: longFull, at: '2026-10-13T10:01:00Z' },
  { id: 'dispatch', kind: 'dispatch', sourceRoleId: '示例角色', summary: '派发任务', full: '', at: '2026-10-13T10:02:00Z' },
  { id: 'handback', kind: 'handback', sourceRoleId: '示例角色', summary: '回交报告', full: '', at: '2026-10-13T10:03:00Z' },
];
let activeQueue = queue.slice();
const snapshot = (busy = true) => ({ roleId: 'su', busy, summaries: activeQueue.map(x => x.summary), queue: activeQueue, running: busy ? { id: 'running', kind: 'message', summary: '正在处理当前请求', full: '', at: '2026-10-13T10:00:00Z' } : null });
// v3 验收段：可延迟的 session:open（抓取开会话 loading 行；W11 转轮）——默认路径逐字不变。
let deferOpenRole = null, deferredOpen = null;
const handlers = {
  'app:renderer-diagnostic': () => ({ ok: true }), 'app:recovery-state': () => ({ projectRoot: ROOT, roleId: 'su' }), 'app:recovery-ready': () => ({ ok: true }),
  'window:is-maximized': () => false, 'app:list-project': () => listing, 'app:pick-project': () => ROOT,
  'session:history-get':(_e,input)=>({...input,rows:[],error:null,skipped:0}), 'session:live-views':()=>[{projectRoot:ROOT,roleId:'su',runtime:'pi'}],
  // runtime-config 新形状（含 runtime/missingKeys——旧 pi-config 直出形状会被摘要校验拒绝、顶出顶部告警条，
// 挤压聊天视口；UIUX 侧亦记录过该夹具过期提示）。字段内容仍为受控替身。
  'runtime-config:get':()=>({ runtime: 'pi', label: 'Pi', path: ROOT + '/' + ('a-very-long-path/'.repeat(12)) + '.env', revision: 0, application: 'next-session', missingKeys: [], fields: ['ANTHROPIC_AUTH_TOKEN', 'ANS_PI_BASE_URL', 'ANS_PI_MODEL', 'ANS_PI_CONTEXT_WINDOW'].map(key => ({ key, secret: key === 'ANTHROPIC_AUTH_TOKEN', required: key !== 'ANS_PI_CONTEXT_WINDOW', value: key === 'ANTHROPIC_AUTH_TOKEN' ? '' : 'fixture', isSet: true, source: 'environment' })) }),
  'runtime-config:save':()=>({ok:true,appliedKeys:[]}),
  'session:open': (_e, input) => (input && input.roleId === deferOpenRole
    ? new Promise(resolve => { deferredOpen = () => resolve({ ok: true, resumed: true, contextSource: 'resumed' }); })
    : ({ ok: true, resumed: true, contextSource: 'resumed' })), 'session:live': () => ['su'], 'session:stop': () => ({ ok: true }),
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

// ————— v3 验收段模板（2026-10-16 客户批准）—————
// DENSITY：同源口径 = UIUX audit-v3.mjs 的 DENSITY 段（逐项同名）+ transcriptH（转录总高：
// 末行底 − 首个真实行顶——与设计文档「945→823」同口径）+ recordsSummary（折叠摘要文本）。
const DENSITY_V3 = `(() => {
  const q = s => document.querySelector(s);
  const pane = q('#chat .chat-pane'); const chat = q('#chat');
  const rect = el => { const b = el.getBoundingClientRect(); return { y: +b.y.toFixed(1), h: +b.height.toFixed(1), x: +b.x.toFixed(1), w: +b.width.toFixed(1), bottom: +b.bottom.toFixed(1) }; };
  const st = (el) => getComputedStyle(el);
  const m = {};
  m.viewport = { w: innerWidth, h: innerHeight, bodyScrollW: document.body.scrollWidth };
  m.paneGap = pane ? st(pane).gap : null;
  const rows = pane ? [...pane.querySelectorAll(':scope > .chat-row')] : [];
  m.rowPaddingBottom = rows[0] ? st(rows[0]).paddingBottom : null;
  m.rows = rows.map(el => ({ cls: String(el.className).slice(0, 48), kind: el.dataset.rowKind || '', text: (el.textContent || '').slice(0, 24), ...rect(el) }));
  m.gaps = [];
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i-1].getBoundingClientRect(), b = rows[i].getBoundingClientRect();
    m.gaps.push(+(b.y - a.bottom).toFixed(1));
  }
  m.transcriptH = rows.length > 1 ? +(rows[rows.length-1].getBoundingClientRect().bottom - rows[1].getBoundingClientRect().top).toFixed(1) : null;
  const view = chat.getBoundingClientRect();
  const top = view.top - 0.5, bottom = view.bottom + 0.5;
  m.chatViewportH = +view.height.toFixed(1);
  m.chatRect = { top: +view.top.toFixed(1), bottom: +view.bottom.toFixed(1) };
  m.fullyVisibleRows = rows.filter(el => { const b = el.getBoundingClientRect(); return b.top >= top && b.bottom <= bottom; }).length;
  m.msg = q('.chat-pane .msg-assistant') ? { fontSize: st(q('.chat-pane .msg-assistant')).fontSize, lineHeight: st(q('.chat-pane .msg-assistant')).lineHeight } : null;
  m.msgP = q('.chat-pane .msg-assistant p') ? { margin: st(q('.chat-pane .msg-assistant p')).margin } : null;
  m.msgH3 = q('.chat-pane .msg-assistant h3') ? { fontSize: st(q('.chat-pane .msg-assistant h3')).fontSize, margin: st(q('.chat-pane .msg-assistant h3')).margin } : null;
  m.userBubble = q('.chat-pane .msg-user') ? { rect: rect(q('.chat-pane .msg-user')), padding: st(q('.chat-pane .msg-user')).padding, lineHeight: st(q('.chat-pane .msg-user')).lineHeight } : null;
  const rec = q('.chat-pane .tool-records');
  m.records = rec ? { summaryH: +rec.querySelector('summary').getBoundingClientRect().height.toFixed(1), summaryLineHeight: st(rec.querySelector('summary')).lineHeight, open: rec.open, summary: rec.querySelector('summary').textContent } : null;
  const acts = [...document.querySelectorAll('.chat-pane .tool-activity')];
  m.activityCount = acts.length;
  m.activityAvgH = acts.length ? +(acts.reduce((s, a) => s + a.getBoundingClientRect().height, 0) / acts.length).toFixed(1) : null;
  m.activityMaxH = acts.length ? +Math.max(...acts.map(a => a.getBoundingClientRect().height)).toFixed(1) : null;
  m.activityTotalH = +acts.reduce((s, a) => s + a.getBoundingClientRect().height, 0).toFixed(1);
  m.activity = acts.length ? { text: acts[0].textContent, state: (acts[0].querySelector('.activity-state')||{}).textContent || '', unknownCls: acts[0].querySelector('.activity-state').classList.contains('is-unknown') } : null;
  const inj = q('.chat-pane .msg-injected');
  m.injected = inj ? { rect: rect(inj), bodyText: (inj.querySelector('.mi-body')||{}).textContent || '', chip: (inj.querySelector('.mi-chip')||{}).textContent || '', bodyLineHeight: st(inj.querySelector('.mi-body')).lineHeight, bodyFontSize: st(inj.querySelector('.mi-body')).fontSize } : null;
  const comp = q('.composer');
  m.composer = { rect: rect(comp), padding: st(comp).padding };
  m.capsule = q('#composer-capsule') ? { rect: rect(q('#composer-capsule')), padding: st(q('#composer-capsule')).padding, gap: st(q('#composer-capsule')).gap } : null;
  m.textarea = q('#inp-message') ? { minHeight: st(q('#inp-message')).minHeight, rect: rect(q('#inp-message')) } : null;
  m.composeNote = q('.compose-note') ? { rect: rect(q('.compose-note')), marginTop: st(q('.compose-note')).marginTop } : null;
  const chipEl = q('#op-chip');
  const paneRect = pane ? pane.getBoundingClientRect() : null;
  m.chip = (() => { const c = chipEl; if (!c || c.hidden) return { hidden: true }; const r = c.getBoundingClientRect(); return { hidden: false, x: +r.x.toFixed(1), y: +r.y.toFixed(1), right: +r.right.toFixed(1), paneRight: paneRect ? +paneRect.right.toFixed(1) : null, diffRight: paneRect ? +Math.abs(r.right - paneRect.right).toFixed(1) : null }; })();
  m.current = q('#chat .tool-current') ? { rect: rect(q('#chat .tool-current')), text: q('#chat .tool-current').textContent } : null;
  m.deniedVisible = !!q('#chat .sys-denied');
  return m;
})()`;

// INDICATORS：同源口径 = UIUX indicators 专项夹具（工作徽标 / 尾行 / loading / 零动效检查）。
const INDICATORS_V3 = `(() => {
  const anim = el => el ? getComputedStyle(el).animationName + ' ' + getComputedStyle(el).animationDuration : null;
  const ico = document.querySelector('.ti-status.st-working .ts-ico.status-spinner svg');
  const icoBox = ico ? ico.closest('.ts-ico') : null;
  const tc = document.querySelector('#chat .tool-current');
  const tcSvg = tc ? tc.querySelector('.status-spinner svg') : null;
  const tcSpin = tcSvg ? tcSvg.closest('.status-spinner') : null;
  const loadSvg = document.querySelector('#chat .sys-loading .status-spinner svg');
  const loadSpin = loadSvg ? loadSvg.closest('.status-spinner') : null;
  const opChip = document.getElementById('op-chip');
  const opCard = document.querySelector('#chat .op-request');
  return {
    workingIco: { hasSvg: !!ico, boxW: icoBox ? +icoBox.getBoundingClientRect().width.toFixed(1) : null, svgCssW: ico ? getComputedStyle(ico).width : null, svgCssH: ico ? getComputedStyle(ico).height : null, spinDuration: icoBox ? icoBox.dataset.spinDuration : null, motion: icoBox ? icoBox.dataset.spinMotion : null },
    toolCurrent: tc ? { text: tc.textContent, height: +tc.getBoundingClientRect().height.toFixed(1), hasSvg: !!tcSvg, spinDuration: tcSpin ? tcSpin.dataset.spinDuration : null, motion: tcSpin ? tcSpin.dataset.spinMotion : null } : null,
    loading: loadSvg ? { tag: loadSvg.tagName, spinDuration: loadSpin ? loadSpin.dataset.spinDuration : null, motion: loadSpin ? loadSpin.dataset.spinMotion : null } : null,
    spinnerElems: document.querySelectorAll('.spinner').length,
    spinArcTotal: document.querySelectorAll('.spin-arc').length,
    opChipAnim: opChip && !opChip.hidden ? getComputedStyle(opChip).animationName : null,
    opCardAnim: opCard ? getComputedStyle(opCard).animationName : null,
    opCardIter: opCard ? getComputedStyle(opCard).animationIterationCount : null,
  };
})()`;

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { fs.writeFileSync(path.join(OUT, 'watchdog.txt'), 'timeout'); app.exit(1); }, 120000);
  try {
    win = new BrowserWindow({ width: 1360, height: 860, useContentSize: true, frame: false, show: false, webPreferences: { preload: path.join(APP, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
    await win.loadFile(RENDERER_ENTRY);
    await pause(200);
    // Phase 5A fixture: new renderer needs explicit project/runtime/role before pushes (defaults Claude).
    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);
    await js(`await window.__ansRenderer.selectRuntime('pi')`);
    await js(`await window.__ansRenderer.selectRole('su')`);
    await pause(200);
    const push = async (ch, payload) => { win.webContents.send(ch, payload); await pause(120); };
    const shot = async (name, rect) => { const img = await win.webContents.capturePage(rect); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); };
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

    // ————————————— v3 实施验收段（2026-10-16 客户批准「按推荐批准，开始实施」）—————————————
    // 按设计 §二(d)：12 条数值断言（1360×860 同一转录滚到底；#9–#12 走 indicators 口径）+ S1–S3 结构
    // 断言。截图 v3-after-* 与 UIUX v3 证据对照（before 基准以其 canonical 截图为准）。
    const v3 = { results: {}, measures: {} };
    const v3check = (name, ok, detail) => { v3.results[name] = { ok: !!ok, detail: String(detail == null ? '' : detail) }; };
    win.setContentSize(1360, 860); await pause(250);
    // 注意：renderer 以 `app:list-project` 返回的 projectRoot 为唯一事实根——v3 段全部推达用 ROOT（勿用别名根，否则被项目门丢弃）。
    const densityRows = [
      { kind: 'user', text: '请先汇总现状。', at: '' },
      { kind: 'tool', text: '调用工具 run_shell', at: '15:02', activity: { toolName: 'run_shell', target: 'ans status --json', toolCallId: 'd1', phase: 'call', status: 'call' } },
      { kind: 'tool', text: 'run_shell 已执行：ans status --json（exit 0）', at: '15:02', activity: { toolName: 'run_shell', target: 'ans status --json · exit 0', toolCallId: 'd1', phase: 'result', status: 'result' } },
      { kind: 'tool', text: '调用工具 read_file', at: '15:03', activity: { toolName: 'read_file', target: '角色卡/编排/' + 'verylongsegment-'.repeat(10) + 'memo.md', toolCallId: 'd2', phase: 'call', status: 'call' } },
      { kind: 'tool', text: 'read_file 返回：角色卡/编排/memo.md', at: '15:03', activity: { toolName: 'read_file', target: '角色卡/编排/memo.md · 读取返回', toolCallId: 'd2', phase: 'result', status: 'result' } },
      { kind: 'assistant', text: '已核对。\n\n### 结论', at: '' },
      { kind: 'user', text: '继续核对。', at: '' },
      { kind: 'denied', text: 'read_file 执行失败：watchdog.log（ENOENT）', at: '' },
      { kind: 'assistant', text: '读取失败已记录。', at: '' },
    ];
    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)});await window.__ansRenderer.selectRole('su')`); await pause(250);
    await push('session:role-state', { roleId: 'su', busy: true, summaries: [], queue: [], running: { id: 'v3-running', kind: 'message', summary: '正在处理当前请求', full: '', at: '' } });
    // 顺序与 UIUX audit-v3 密度段同构（卡/系统行先到达、随后全量回放）：保留行（keepEl）在回放后仍在其原位置
    // （上区），回放行在下——**注意**：全量回放会重建 pane 并清空 #chat 子节点（既有行为），chip 元素随之离场；
    // 尾行按 S3「无 chip 时兜底」呈现「等待你确认」（与设计 sim 的 823px/9 行同口径）。chip 可见态的 S2/S3
    // 在下方 A2 子段用同角色重选（showPane→updateOpChip 复位）单独验证。
    await push('session:operator-request', { id: 'v3-pending', roleId: 'su', request: { kind: 'confirm', title: '需要你确认：是否按看护建议先停掉卡死的轮次？', preview: '预览：role_status 摘要（受控夹具）。\n队列 3；最近一轮 timed_out。' } });
    // 密度/S3 夹具：卡保留为已决行，chip 隐藏，busy 尾行兜底可见。
    await push('session:operator-expired', { id: 'v3-pending', roleId: 'su', projectRoot: ROOT, runtime: 'pi', reason: 'density fixture' });
    const sysAlertEvent = turn => ({ projectRoot: ROOT, roleId: 'su', runtime: 'pi', event: { turnId: turn, kind: 'message', summary: '[系统·看护] 投递排队积压', detail: { source: 'prompt-input', text: '用户指令：[系统·看护] 投递排队积压：队首已排队 12 分钟。' } } });
    await push('session:events', [sysAlertEvent('v3-alert-1')]);
    await push('session:history', { projectRoot: ROOT, roleId: 'su', runtime: 'pi', rows: densityRows, error: null, skipped: 0 });
    await push('session:events', [sysAlertEvent('v3-alert-2')]);
    await pause(250);
    await js(`document.getElementById('chat').scrollTop = 0;`); await pause(200);
    const densityClosed = await js(DENSITY_V3);
    const indicatorsA = await js(INDICATORS_V3);
    await shot('v3-after-density-bottom-1360');
    v3.measures.densityClosed = densityClosed;
    v3.measures.indicatorsA = indicatorsA;

    // ① W1 行距 16±1px
    const gapPx = parseFloat(densityClosed.rowPaddingBottom);
    v3check('1-W1-行距16±1', Math.abs(gapPx - 16) <= 1, 'rowPaddingBottom=' + densityClosed.rowPaddingBottom);
    // 960 规范化夹具（顶部 4 行）：与 chip 可见态脱钩，避免把后来新增卡片算入密度。
    win.setContentSize(960, 620); await pause(200);
    await js(`document.getElementById('chat').scrollTop = 0`); await pause(150);
    const density960Canonical = await js(DENSITY_V3);
    v3.measures.density960Canonical = density960Canonical;
    win.setContentSize(1360, 860); await pause(200);
    // ② W2 p 段距 10±1；h3 纵值 16/6（±1）——margin 简写 3 值：上/横/下。
    const pParts = ((densityClosed.msgP || {}).margin || '').split(' ');
    const pBottom = parseFloat(pParts.length === 3 ? pParts[2] : (pParts[1] || pParts[0]));
    const h3m = ((densityClosed.msgH3 || {}).margin || '').split(' ');
    v3check('2-W2-p10±1', Math.abs(pBottom - 10) <= 1, 'p margin=' + (densityClosed.msgP || {}).margin);
    v3check('2-W2-h3-16/6±1', Math.abs(parseFloat(h3m[0]) - 16) <= 1 && Math.abs(parseFloat(h3m[2] || h3m[0]) - 6) <= 1, 'h3 margin=' + (densityClosed.msgH3 || {}).margin);
    // ③ W3 单行用户气泡 ≤44（目标 42）
    const bubbleH = ((densityClosed.userBubble || {}).rect || {}).h;
    v3check('3-W3-气泡≤44', bubbleH != null && bubbleH <= 44, 'bubble h=' + bubbleH + ' pad=' + (densityClosed.userBubble || {}).padding + ' lh=' + (densityClosed.userBubble || {}).lineHeight);
    // ④ W4 输入区总高 ≤140、空输入框 ≤30（目标 137.6 / 28）
    const compH = ((densityClosed.composer || {}).rect || {}).h;
    const taH = ((densityClosed.textarea || {}).rect || {}).h;
    v3check('4-W4-输入区≤140', compH != null && compH <= 140, 'composer h=' + compH + ' pad=' + (densityClosed.composer || {}).padding);
    v3check('4-W4-空框≤30', taH != null && taH <= 30, 'textarea h=' + taH + ' minHeight=' + (densityClosed.textarea || {}).minHeight);
    // ⑤ W1–W6 汇总：转录总高 ≤850（现 945）
    v3check('5-转录总高≤850', densityClosed.transcriptH != null && densityClosed.transcriptH <= 850, 'transcriptH=' + densityClosed.transcriptH + '（基线 945）');
    // ⑥ 完整可见行 ≥9（现 7）
    v3check('6-可见行≥9', densityClosed.fullyVisibleRows >= 9, 'fullyVisibleRows=' + densityClosed.fullyVisibleRows + ' viewportH=' + densityClosed.chatViewportH);
    // ⑧ bodyScrollW == 视口宽（1360 档；960 档在后段）
    v3check('8-无横向溢出-1360', densityClosed.viewport.bodyScrollW === densityClosed.viewport.w, 'bodyScrollW=' + densityClosed.viewport.bodyScrollW + ' vs ' + densityClosed.viewport.w);
    // S3（兜底半边）：全量回放后 chip 离场（既有行为）⇒ 尾行按「无 chip 时状态词兜底」呈现「等待你确认」。
    v3check('S3-无chip时尾行兜底', densityClosed.chip && densityClosed.chip.hidden === true && densityClosed.current && densityClosed.current.text.includes('正在工作') && indicatorsA.toolCurrent && indicatorsA.toolCurrent.hasSvg, 'chip=' + JSON.stringify(densityClosed.chip) + ' current=' + JSON.stringify(densityClosed.current));
    // W6b：系统行正文无重复前缀（chip 已承载）；W6 盒内行高 1.6
    const injBody = (densityClosed.injected || {}).bodyText || '';
    v3check('W6b-系统正文去前缀', densityClosed.injected && injBody.startsWith('投递排队积压：') && !injBody.includes('[系统·看护]'), 'chip=' + (densityClosed.injected || {}).chip + ' body=' + injBody.slice(0, 40));
    const injLH = parseFloat((densityClosed.injected || {}).bodyLineHeight);
    const injFS = parseFloat((densityClosed.injected || {}).bodyFontSize);
    v3check('W6-注入盒行高1.6', Number.isFinite(injLH) && Number.isFinite(injFS) && Math.abs(injLH / injFS - 1.6) <= 0.05, 'mi-body lineHeight=' + (densityClosed.injected || {}).bodyLineHeight + ' fontSize=' + (densityClosed.injected || {}).bodyFontSize);
    // ⑨ W9（工作徽标，须 busy 且无未决 —— su 此刻是 awaiting-confirm，working 徽标用后段「示例角色」测）。

    // S1/S4：工具组展开——同调用两相位并一行（4 条活动 → 2 个调用）、行高 ≤48、总高 ≤ 现状 60%（4×53.1=212.4）
    await js(`(()=>{const g=document.querySelector('#chat .tool-records'); if(g) g.open=true;})()`); await pause(200);
    await js(`document.getElementById('chat').scrollTop = document.getElementById('chat').scrollHeight;`); await pause(150);
    const densityOpen = await js(DENSITY_V3);
    v3.measures.densityOpen = densityOpen;
    await shot('v3-after-density-records-1360');
    v3check('S1-合并为2个调用', densityOpen.activityCount === 2, 'activityCount=' + densityOpen.activityCount + '（现状 4）');
    v3check('S1-合并行高≤48', densityOpen.activityMaxH != null && densityOpen.activityMaxH <= 48, 'maxH=' + densityOpen.activityMaxH + ' avgH=' + densityOpen.activityAvgH + '（现状 53.1）');
    v3check('S1-展开组≤60%现状', densityOpen.activityTotalH <= 0.6 * 212.4, 'totalH=' + densityOpen.activityTotalH + ' vs 0.6×212.4=127.44');
    v3check('S1-相位链保留', !!densityOpen.activity && densityOpen.activity.state.includes('调用发起') && densityOpen.activity.state.includes('状态未记录'), 'state=' + (densityOpen.activity || {}).state);
    v3check('S4-口径「N个调用」', !!densityOpen.records && densityOpen.records.summary.includes('2 个调用') && densityOpen.records.summary.includes('含状态未记录'), 'summary=' + (densityOpen.records || {}).summary);
    // 折叠摘要仍可见：失败行（回放拒绝行的文字呈现）与未知标注（含状态未记录）在组折叠时同样可见
    await js(`(()=>{const g=document.querySelector('#chat .tool-records'); if(g) g.open=false;})()`); await pause(150);
    const closedCheck = await js(`(()=>{const g=document.querySelector('#chat .tool-records');return {open:g.open,summary:g.querySelector('summary').textContent,failureVisible:document.getElementById('chat').textContent.includes('read_file 执行失败')};})()`);
    v3.measures.folded = closedCheck;
    v3check('S1-折叠摘要失败/未知可见', !closedCheck.open && closedCheck.summary.includes('2 个调用') && closedCheck.summary.includes('含状态未记录') && closedCheck.failureVisible, JSON.stringify(closedCheck));

    // A2 子段（S2/S3 chip 半边）：新推一张未决卡 ⇒ chip 可见；验证「chip 可见 ⇒ 尾行让位」与右缘对齐。
    await push('session:operator-request', { id: 'v3-chip', roleId: 'su', request: { kind: 'confirm', title: 'chip 对齐夹具', preview: '预览。' } });
    await js(`await window.__ansRenderer.selectRole('su')`); await pause(250);
    await js(`document.getElementById('chat').scrollTop = document.getElementById('chat').scrollHeight;`); await pause(150);
    const chipVisible = await js(`(() => { const chip=document.getElementById('op-chip'); const pane=document.querySelector('#chat .chat-pane'); const tc=document.querySelector('#chat .tool-current'); if(!chip) return null; const a=chip.getBoundingClientRect(), b=pane.getBoundingClientRect(); return { hidden: chip.hidden, chipX:+a.x.toFixed(1), paneX:+b.x.toFixed(1), diff:+Math.abs(a.x-b.x).toFixed(1), diffRight:+Math.abs(a.right-b.right).toFixed(1), tail: tc?tc.textContent:null }; })()`);
    v3.measures.chipVisible = chipVisible;
    await shot('v3-after-chip-align-1360');
    v3check('S3-chip可见无尾行', !!chipVisible && chipVisible.hidden === false && chipVisible.tail === null, JSON.stringify(chipVisible));
    v3check('S2-chip对齐阅读列≤8', !!chipVisible && chipVisible.diffRight <= 8, JSON.stringify(chipVisible));
    const indicatorsC = await js(INDICATORS_V3);
    v3.measures.indicatorsC = indicatorsC;
    // 零动效（长期约束⑦）：chip 不得有任何动画；确认卡至多允许**定位一次性高亮**（op-flash，1 迭代、无计时器 ——
    // 系既有「点 chip 定位」机制，非忙碌动效；其间不得出现循环/忙碌类动画）。
    const cardAnimOk = indicatorsC.opCardAnim === 'none' || (indicatorsC.opCardAnim === 'op-flash' && Number(indicatorsC.opCardIter) === 1);
    v3check('零动效-chip/确认卡', indicatorsC.opChipAnim === 'none' && cardAnimOk, 'chipAnim=' + indicatorsC.opChipAnim + ' cardAnim=' + indicatorsC.opCardAnim + ' cardIter=' + indicatorsC.opCardIter);

    // ⑧（960 档）+ 960 截图对照 v3-sim-960/v3-chat-960
    win.setContentSize(960, 620); await pause(250);
    await js(`document.getElementById('chat').scrollTop = document.getElementById('chat').scrollHeight;`); await pause(150);
    const density960 = await js(DENSITY_V3);
    v3.measures.density960 = density960;
    await shot('v3-after-960');
    v3check('8-无横向溢出-960', density960.viewport.bodyScrollW === density960.viewport.w, 'bodyScrollW=' + density960.viewport.bodyScrollW + ' vs ' + density960.viewport.w);
    v3check('6-可见行≥4-960', density960Canonical.fullyVisibleRows >= 4, 'fullyVisibleRows=' + density960Canonical.fullyVisibleRows + ' viewportH=' + density960Canonical.chatViewportH);
    win.setContentSize(1360, 860); await pause(250);

    // S1 附验（截断可见，设计 §二(d)「失败/未知/截断在折叠摘要可见」的截断半边）：超长无路径目标经瘦身截断
    // （… 结尾）——同一调用两相位仍并一行、目标截断标记如实呈现，不被组摘要口径吞掉。
    await push('session:history', { projectRoot: ROOT, roleId: 'su', runtime: 'pi', rows: [
      { kind: 'tool', text: '调用工具 run_shell', at: '15:05', activity: { toolName: 'run_shell', target: 'ordinaryword'.repeat(30), toolCallId: 'd3', phase: 'call', status: 'call' } },
      { kind: 'tool', text: 'run_shell 已执行：长目标（exit 0）', at: '15:05', activity: { toolName: 'run_shell', target: 'ordinaryword'.repeat(30), toolCallId: 'd3', phase: 'result', status: 'result' } },
    ], error: null, skipped: 0 });
    await pause(200);
    const truncCheck = await js(`(()=>{const g=document.querySelector('#chat .tool-records'); if(!g) return null; g.open=true; const rows=[...g.querySelectorAll('.tool-activity')]; const target=(rows[0]&&rows[0].querySelector('.activity-target')||{}).textContent||''; const out={rows:rows.length, truncated:target.endsWith('…'), summary:g.querySelector('summary').textContent}; g.open=false; return out;})()`);
    v3.measures.truncatedTarget = truncCheck;
    v3check('S1-截断目标仍可见', !!truncCheck && truncCheck.rows === 1 && truncCheck.truncated, JSON.stringify(truncCheck));

    // ⑪ W11：开会话 loading 行 = 同一枚 SVG 转轮（全应用无第二实现；.spinner 元素退役）
    deferOpenRole = '示例角色';
    await js(`window.__ansRenderer.selectRole('示例角色');'fired';`); await pause(400);
    const loadingM = await js(INDICATORS_V3);
    v3.measures.loading = loadingM;
    const loadR = await js(`(() => { const el=document.querySelector('#chat .sys-loading'); if(!el) return null; const b=el.getBoundingClientRect(); return { x:Math.max(0,+b.x.toFixed(0)-8), y:Math.max(0,+b.y.toFixed(0)-8), width:+b.width.toFixed(0)+16, height:+b.height.toFixed(0)+16 }; })()`);
    await shot('v3-after-loading-1360', loadR || undefined);
    v3check('11-W11-loading同款转轮', !!loadingM.loading && loadingM.loading.tag === 'svg' && loadingM.loading.motion === 'true' && Math.abs(parseFloat(loadingM.loading.spinDuration) - 0.9) <= 0.2, JSON.stringify(loadingM.loading));
    v3check('11-无第二转轮实现', loadingM.spinnerElems === 0, 'spinnerElems=' + loadingM.spinnerElems + '（.spinner 已退役）');
    if (deferredOpen) { deferredOpen(); deferredOpen = null; }
    await pause(300);

    // ⑩ W10：尾行「正在工作」转轮——行高 26.6±2 不因图标增加、含转轮且动画生效（示例角色：忙碌、无请求 ⇒ chip 隐藏、尾行兜底可见）
    await push('session:role-state', { roleId: '示例角色', busy: true, summaries: [], queue: [], running: null });
    await pause(200);
    const indicatorsB = await js(INDICATORS_V3);
    v3.measures.indicatorsB = indicatorsB;
    // ⑨ W9：工作徽标（示例角色：busy、无未决 ⇒ st-working）——12px±1 SVG、动画 v3spin 0.9±0.2s
    const ico = indicatorsB.workingIco || {};

    v3check('9-W9-徽标12pxSVG', ico.hasSvg && Math.abs(ico.boxW - 12) <= 1 && ico.svgCssW === '12px' && ico.svgCssH === '12px', JSON.stringify(ico));
    v3check('9-W9-转轮0.9±0.2s', ico.motion === 'true' && Math.abs(parseFloat(ico.spinDuration) - 0.9) <= 0.2, JSON.stringify(ico));
    const sideR = await js(`(b=>({x:Math.max(0,+b.x.toFixed(0)-4),y:Math.max(0,+b.y.toFixed(0)-4),width:+b.width.toFixed(0)+8,height:+b.height.toFixed(0)+8}))(document.querySelector('.tree').getBoundingClientRect())`);
    const tcR = await js(`(() => { const el=document.querySelector('#chat .tool-current'); if(!el) return null; const b=el.getBoundingClientRect(); return { x:Math.max(0,+b.x.toFixed(0)-6), y:Math.max(0,+b.y.toFixed(0)-6), width:+b.width.toFixed(0)+12, height:+b.height.toFixed(0)+12 }; })()`);
    await shot('v3-after-sidebar-1360', sideR);
    if (tcR) await shot('v3-after-tail-1360', tcR);
    const tc = indicatorsB.toolCurrent || {};
    v3check('10-W10-尾行26.6±2', tc.height != null && Math.abs(tc.height - 26.6) <= 2, 'height=' + tc.height + ' text=' + tc.text);
    v3check('10-W10-尾行含转轮', tc.hasSvg === true && tc.motion === 'true' && Math.abs(parseFloat(tc.spinDuration) - 0.9) <= 0.2, JSON.stringify(tc));

    // ⑫ W9–W11：prefers-reduced-motion: reduce（CDP 模拟）⇒ 静止弧（animation-duration ≤0.01s 且 iteration ≤1）
    try {
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await pause(250);
      const rm = await js(`(() => { const svg = document.querySelector('.ti-status.st-working .ts-ico.status-spinner svg') || document.querySelector('#chat .tool-current .status-spinner svg'); const el = svg ? svg.closest('.status-spinner') : null; if (!el) return null; return { matchesReduce: matchMedia('(prefers-reduced-motion: reduce)').matches, reduced: el.dataset.reducedMotion, hasSvg: !!svg }; })()`);
      v3.measures.reducedMotion = rm;
      await shot('v3-after-rm-sidebar-1360', sideR);
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
      win.webContents.debugger.detach();
      v3check('12-reduced-motion静止弧', !!rm && rm.matchesReduce === true && rm.reduced === 'true' && rm.hasSvg === true, JSON.stringify(rm));
    } catch (error) {
      v3check('12-reduced-motion静止弧', false, 'CDP 模拟失败：' + String(error && error.message || error));
    }

    report.v3 = v3;
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    const v3Failed = Object.entries(v3.results).filter(([, r]) => !r.ok);
    assert.equal(v3Failed.length, 0, 'v3 验收断言未过（' + v3Failed.length + ' 条）：' + v3Failed.map(([k, r]) => k + ' ⇒ ' + r.detail).join('；'));

    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log('AUDIT_DONE ' + OUT);
    clearTimeout(watchdog);
    app.quit();
  } catch (error) {
    fs.writeFileSync(path.join(OUT, 'error.txt'), 'lastJs=' + lastJs + '\n' + String(error && error.stack || error));
    console.error(error); clearTimeout(watchdog); app.exit(1);
  }
});
