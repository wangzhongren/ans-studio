// 只读测量：把 UIUX v2 单文件原型载入 Electron，在 1360×860 与 960×620 两档记录关键组件 rect 与计算样式，
// 供桌面实现与设计逐项对照。不修改原型、不发网络请求、不写任何业务数据。
// 运行：ANS_UIUX_OUTDIR=/tmp/ans-prototype-measure node_modules/.bin/electron test/桌面应用/e2e/uiux-prototype-measure.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const PROTOTYPE = path.join(REPO, '角色卡/UIUX设计师/docs/design/2026-10-13_design_ans-uiux-prototype-v1.html');
const OUT = process.env.ANS_UIUX_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), 'ans-prototype-measure-'));
fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', path.join(OUT, 'user-data'));
let win;
const pause = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code.includes('await ') ? '(async()=>{' + code + '})()' : code);

const measure = `(() => {
  const q = s => document.querySelector(s);
  const rect = s => { const el = q(s); if (!el) return null; const b = el.getBoundingClientRect(); const scale = window.__invScale || 1; return { x: +(b.x*scale).toFixed(2), y: +(b.y*scale).toFixed(2), w: +(b.width*scale).toFixed(2), h: +(b.height*scale).toFixed(2) }; };
  const cs = (s, props) => { const el = q(s); if (!el) return null; const st = getComputedStyle(el); const o = {}; for (const p of props) o[p] = st.getPropertyValue(p); return o; };
  const box = ['background-color','color','border-radius','padding','font-size','line-height','font-weight','border','border-left','border-top','border-bottom','margin','max-width','display','align-items','justify-content','gap','grid-template-columns','grid-template-rows','width','height','text-align','overflow-wrap','white-space','flex-wrap'];
  const m = {};
  m.app = { rect: rect('#app'), grid: cs('#app', ['grid-template-columns','grid-template-rows','width','height']) };
  m.titlebar = { rect: rect('.titlebar'), style: cs('.titlebar', box), brand: cs('.brand', ['font-size','font-weight','color']), brandSub: cs('.brand span', ['font-size','color','margin']), iconButton: { rect: rect('.icon-button'), style: cs('.icon-button', box) } };
  m.sidebar = { rect: rect('.sidebar'), style: cs('.sidebar', box), sectionLabel: cs('.section-label', ['font-size','font-weight','margin']), switchBtn: { rect: rect('.switch'), style: cs('.switch', box) }, projectName: cs('.project-name', ['font-size','font-weight','margin']), projectPath: cs('.project-path', ['font-size','color','margin','line-height']), roleCaption: cs('.role-caption', ['font-size','color','padding','margin']), roleButton: { rect: rect('.role-button'), style: cs('.role-button', box) }, roleName: cs('.role-name', ['font-size','font-weight']), roleSub: cs('.role-sub', ['font-size','color']), roleState: cs('.role-state', ['font-size','color']) };
  m.chatHead = { rect: rect('.chat-head'), style: cs('.chat-head', box), title: cs('.chat-title', ['font-size','font-weight']), note: cs('.governance-note', ['font-size','color','margin']), pendingLink: { rect: rect('.pending-link'), style: cs('.pending-link', box) } };
  m.chatScroll = { rect: rect('.chat-scroll'), style: cs('.chat-scroll', box) };
  m.conversation = { rect: rect('.conversation'), style: cs('.conversation', ['max-width','margin','width']) };
  m.userBubble = { rect: rect('.user-bubble'), style: cs('.user-bubble', box) };
  m.speaker = cs('.speaker', ['font-size','font-weight','color','margin']);
  m.assistant = { rect: rect('.assistant'), style: cs('.assistant', ['font-size','line-height','color']), p: cs('.assistant p', ['margin','font-size','line-height']), h3: cs('.assistant h3', ['font-size','font-weight','margin']), ul: cs('.assistant ul', ['padding','margin']), code: cs('.assistant code', ['font-size','background-color','padding','border-radius','font-family']) };
  m.records = { rect: rect('.records'), style: cs('.records', box), summary: cs('.records summary', ['font-size','color','line-height','display','gap']), count: cs('.record-count', ['font-size','color']), row: cs('.record-row', box), op: cs('.record-op', ['font-family','color']), target: cs('.record-target', ['font-family','font-size','color','margin']), status: cs('.record-status', ['font-size','color']) };
  m.exception = { rect: rect('.exception'), style: cs('.exception', box), strong: cs('.exception strong', ['font-size','color','display','margin']), target: cs('.exception .target', ['font-size','color','font-family']) };
  m.pending = { rect: rect('.pending'), style: cs('.pending', box), strong: cs('.pending strong', ['font-size','display','margin']), p: cs('.pending p', ['margin']), row: cs('.button-row', ['display','gap','flex-wrap']), primary: { rect: rect('.primary'), style: cs('.primary', box) }, secondary: { rect: rect('.secondary'), style: cs('.secondary', box) } };
  m.composerArea = { rect: rect('.composer-area'), style: cs('.composer-area', box) };
  m.composer = { rect: rect('.composer'), style: cs('.composer', box), textarea: cs('.composer textarea', ['font-size','line-height','height','padding','color']), send: { rect: rect('.send'), style: cs('.send', box) }, stop: { rect: rect('.stop'), style: cs('.stop', ['width','height','color','border-radius']) }, img: rect('.composer .icon-button') };
  m.drawer = { rect: rect('.drawer'), style: cs('.drawer', ['background-color','border-left','position','display']) };
  m.drawerPresent = !document.querySelector('.drawer').hidden;
  if (m.drawerPresent) {
    m.drawer = { rect: rect('.drawer'), style: cs('.drawer', ['background-color','border-left']) };
    m.drawerHead = { rect: rect('.drawer-head'), style: cs('.drawer-head', ['height','padding','border-bottom']) };
    m.drawerTitle = cs('.drawer-head h2', ['font-size','font-weight']);
    m.drawerScroll = { rect: rect('.drawer-scroll'), style: cs('.drawer-scroll', ['padding']) };
    m.drawerEyebrow = cs('.drawer-eyebrow', ['font-size','color','margin']);
    m.workHeading = cs('.work-heading', ['font-size','font-weight','margin']);
    m.workItem = { rect: rect('.work-item'), style: cs('.work-item', box) };
    m.workItemP = cs('.work-item p', ['font-size','line-height','margin']);
    m.meta = cs('.meta', ['font-size','color','display','gap']);
    m.queueItem = { rect: rect('.queue-item'), style: cs('.queue-item', box) };
    m.queueIndex = cs('.queue-index', ['font-size','color','padding']);
    m.queueBodyP = cs('.queue-body p', ['font-size','line-height','margin']);
    m.itemActions = cs('.item-actions', ['display','gap','align-items']);
    m.textButton = { rect: rect('.text-button'), style: cs('.text-button', ['font-size','color','padding','text-decoration-line']) };
    m.fullText = { rect: rect('.full-text'), style: cs('.full-text', box) };
    m.resource = { rect: rect('.resource'), style: cs('.resource', box), summary: cs('.resource summary', ['font-size','font-weight','display','gap','padding']), subcount: cs('.subcount', ['font-size','color','margin']), body: cs('.resource-body', ['padding','font-size','line-height','color']), pre: cs('.resource-body pre', ['font-size','line-height','background-color','padding','overflow']) };
    m.field = { rect: rect('.field'), style: cs('.field', box), input: { rect: rect('.field input'), style: cs('.field input', box) } };
    m.secretLine = cs('.secret-line', ['display','gap']);
    m.secretTag = cs('.secret-tag', ['font-size','background-color','padding','border-radius','margin']);
    m.pathBlock = { rect: rect('.path'), style: cs('.path', box) };
    m.piInfo = cs('.pi-info', ['font-size','line-height','color','margin']);
    m.saveRow = { rect: rect('.save-row'), style: cs('.save-row', ['display','gap','align-items','margin']) };
    m.saveStatus = cs('.save-status', ['font-size','color']);
    m.badge = cs('.badge', ['font-size','background-color','color','line-height','min-width','border-radius','border']);
  }
  return m;
})()`;

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { fs.writeFileSync(path.join(OUT, 'watchdog.txt'), 'timeout'); app.exit(1); }, 60000);
  try {
    win = new BrowserWindow({ width: 1560, height: 1000, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    await win.loadFile(PROTOTYPE);
    await pause(250);
    // 记录原型画布缩放系数（stage 用 transform scale 呈现）；窗口足够宽时 scale=1。
    await js(`(()=>{const a=document.getElementById('app');const s=a.getBoundingClientRect().width/Number(a.dataset.width);window.__invScale=1/s;return s;})()`);
    const report = { widths: {} };
    const shot = async name => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); };
    for (const [w, label] of [[1360, '1360'], [960, '960']]) {
      const entry = {};
      await js(`(()=>{const s=document.getElementById('size');s.value='${w}';s.dispatchEvent(new Event('change'));})()`); await pause(150);
      await js(`(()=>{document.getElementById('chatState').value='settled';document.getElementById('chatState').dispatchEvent(new Event('change'));document.getElementById('queueState').value='empty';document.getElementById('queueState').dispatchEvent(new Event('change'));})()`); await pause(150);
      entry.main = await js(measure);
      await shot(`${label}-main`);
      await js(`document.getElementById('roleToggle').click()`); await pause(120);
      await js(`(()=>{const s=document.getElementById('queueState');s.value='full';s.dispatchEvent(new Event('change'));})()`); await pause(150);
      entry.roleDrawer = await js(measure);
      await shot(`${label}-role-full`);
      await js(`document.getElementById('piToggle').click()`); await pause(120);
      entry.piDrawer = await js(measure);
      await shot(`${label}-pi`);
      await js(`document.getElementById('piToggle').click()`); await pause(80);
      await js(`(()=>{document.getElementById('chatState').value='exceptions';document.getElementById('chatState').dispatchEvent(new Event('change'));})()`); await pause(150);
      entry.exceptions = await js(measure);
      await shot(`${label}-exceptions`);
      report.widths[label] = entry;
    }
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log('PROTO_MEASURE_DONE ' + OUT);
    clearTimeout(watchdog); app.quit();
  } catch (error) {
    fs.writeFileSync(path.join(OUT, 'error.txt'), String(error && error.stack || error));
    console.error(error); clearTimeout(watchdog); app.exit(1);
  }
});
