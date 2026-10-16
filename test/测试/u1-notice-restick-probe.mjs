// test/测试/u1-notice-restick-probe.mjs —— 独立对抗性核验：U1 提示条补滚语义（「先量后写 + 条件补滚」）
//
// 目的（不复用任何他角色断言，自建场景）：验证 app/renderer/renderer.js 的 U1 修法在**真实渲染器**下的
// 可观测契约——
//   A. U1 主路径（切回已开会话角色、提示条在贴底之后出现）：仍贴底（dist==0），且视口压缩量恰=条高（证明补滚发生）；
//   B. 「上翻者不打扰」= 提示条的**非点击写入**（drop 文件路径触发的 setHint；无角色点击）在条高
//      增大/缩小/不变时 scrollTop 逐字节不变；另设控制项 B5 证明「复点角色 ⇒ 到底部」是 U-1 显式动作
//      语义（客户 2026-10-12 裁定），与本修法无关（探针 v1 曾把它误记为违规——夹具场景错误，非产品问题）；
//   C. 在底部且条高不变：零抖动（scrollTop 不变）；
//   D. 在底部且条高缩小（提示清空）：仍贴底;
//   E. 阈值边界（STICK_THRESHOLD_PX=24，非点击触发）：dist=40（>阈值）条高变化不打扰；dist=20（≤阈值）条高增大重贴底。
//
// 运行（仓库根）：
//   ANS_U1_PROBE_OUTDIR=/private/tmp/ans-u1-probe node_modules/.bin/electron test/测试/u1-notice-restick-probe.mjs
// 退出码 0=全过；1=有 FAIL（逐条打印）。受控 IPC 替身：无模型请求、无网络、不读真实用户项目。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..', '..', 'app');
const OUT = process.env.ANS_U1_PROBE_OUTDIR || '/tmp/ans-u1-probe';
fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', path.join(OUT, 'user-data')); // 绝对路径（既有夹具经验）

const ROOT = '/offline-u1-probe';
let noteText = ''; // session:open 受控回包 note（本探针的关键控制杆）
let win;
let failures = 0;
const report = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (line) => { console.log(line); report.push(line); };
const check = (name, ok, detail) => { log((ok ? 'PASS ' : 'FAIL ') + name + (detail == null ? '' : ' | ' + detail)); if (!ok) failures += 1; };

const roles = ['su', 'B'].map((roleId) => ({ roleId, cardPath: ROOT + '/角色卡/' + roleId + '/role-card.md', cardText: '# ' + roleId, boundary: { entries: [] }, boundaryPath: '', changelog: null, docs: [] }));
const listing = { projectRoot: ROOT, primaryRoleId: 'su', hasRoles: true, warnings: [], roles };
const handlers = {
  'app:renderer-diagnostic': () => ({ ok: true }),
  'app:recovery-state': () => ({ projectRoot: ROOT, roleId: 'su' }),
  'app:recovery-ready': () => ({ ok: true }),
  'window:is-maximized': () => false,
  'app:list-project': () => listing,
  'app:pick-project': () => ROOT,
  'session:history-get': (_e, input) => ({ ...input, rows: [], error: null, skipped: 0 }),
  'session:live-views': () => [],
  'session:open': () => ({ ok: true, resumed: true, contextSource: 'resumed', note: noteText }),
  'session:live': () => [],
  'session:stop': () => ({ ok: true }),
  'session:abort': () => ({ ok: true, supported: true }),
  'session:operator-response': () => ({ ok: true }),
  'session:send': () => ({ ok: true }),
  'app:attach-image': (_e, input) => ({ ok: true, image: { name: input && input.name || 'a.png', mime: 'image/png', size: 1 } }),
};
Object.entries(handlers).forEach(([name, fn]) => ipcMain.handle(name, fn));

const METRICS = `(() => {
  const chat = document.getElementById('chat');
  const bar = document.querySelector('.session-notice');
  const hint = document.getElementById('composer-hint');
  const pane = chat.querySelector('.chat-pane');
  return {
    st: chat.scrollTop,
    sh: chat.scrollHeight,
    ch: chat.clientHeight,
    dist: Math.round(chat.scrollHeight - chat.scrollTop - chat.clientHeight),
    barH: bar ? +bar.getBoundingClientRect().height.toFixed(2) : null,
    hint: hint ? hint.textContent : null,
    mounted: pane ? [...pane.children].filter((e) => !e.classList.contains('virt-spacer')).length : null,
  };
})()`;

const BAD_EVENT = { roleId: 'su', event: { kind: 'handback', summary: '坏报告', report: { version: 1, reportId: 'probe-hb-bad', source: { roleId: 'su', runtime: 'pi' }, origin: 'terminal-fallback', status: 'unreported', summary: { text: 'bad' }, evidence: 'invalid', at: '2026-10-13T00:00:00Z' } } };
const ERROR_HINT = '一条事件无法显示，其余消息继续接收。';
const DROP_ALERT = '只支持图片文件（png / jpeg / webp / gif）。';

app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { fs.writeFileSync(path.join(OUT, 'watchdog.txt'), 'timeout'); app.exit(1); }, 180000);
  try {
    win = new BrowserWindow({ width: 1360, height: 860, useContentSize: true, frame: false, show: false, webPreferences: { preload: path.join(APP, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
    await win.loadFile(path.join(APP, 'renderer', 'index.html'));
    await pause(250);
    const js = (code) => win.webContents.executeJavaScript(code.includes('await ') ? '(async()=>{' + code + '})()' : code);
    const metrics = () => js(METRICS);
    const waitHint = async (want, tries = 500) => { for (let i = 0; i < tries; i += 1) { const m = await metrics(); if (m.hint === want) return true; await pause(20); } return false; };
    const scrollTo = async (expr) => { await js(`(() => { const c=document.getElementById('chat'); c.scrollTop=${expr}; })()`); await pause(220); };
    const removeAttachments = async () => { await js(`(() => { document.querySelectorAll('#attach-row .attach-rm').forEach(b => b.click()); return true; })()`); await pause(120); };
    // 非点击（无角色点击、无 U-1 stick 语义）的提示写入触发：
    //  · drop 非图片 → setHint("只支持图片文件…")（增高或同高重写）
    //  · drop 图片 → attachBrowserFile 成功尾 setHint("")（缩矮/清空；附带一张缩略图，随后移除）
    const dropFile = async (type, name) => {
      await js(`(() => {
        const dt = new DataTransfer();
        dt.items.add(new File(['x'], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} }));
        document.getElementById('composer-capsule').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
        return true;
      })()`);
      await pause(120);
    };

    // —— 0) 建场：导入项目 → 开 su 会话 → 填充 ≥160 行（窗口化现场，与 U1 缺陷同条件；形状=顶层 turnId+detail）——
    await js(`await window.__ansRenderer.loadProject(${JSON.stringify(ROOT)})`);
    await pause(300);
    noteText = '';
    await js(`await window.__ansRenderer.selectRole('su')`);
    await pause(500);
    for (let i = 0; i < 162; i += 1) {
      win.webContents.send('session:event', { roleId: 'su', event: { turnId: 'fill-' + i, kind: 'tool_call', summary: '调用工具 read_file', detail: { toolName: 'read_file', path: 'docs/f-' + i + '.md', turnId: 'fill-' + i, toolCallId: 'call-fill-' + i } } });
    }
    let rowCount = 0;
    for (let i = 0; i < 600; i += 1) { const m = await js(`window.__ansRenderer.rowModelDebug('su')`); rowCount = m ? m.count : 0; if (rowCount >= 160) break; await pause(20); }
    await pause(300);
    check('setup-窗口化行数≥160', rowCount >= 160, 'rowCount=' + rowCount);
    await scrollTo('c.scrollHeight');
    const m0 = await metrics();
    check('setup-提示条为空（barH=0）', m0.barH === 0, 'barH=' + m0.barH + ' hint=' + JSON.stringify(m0.hint));
    check('setup-初始贴底', m0.dist === 0, 'dist=' + m0.dist);
    check('setup-窗口化生效（挂载行<总行数）', m0.mounted != null && m0.mounted < rowCount, 'mounted=' + m0.mounted + ' total=' + rowCount);

    // —— A) U1 主路径：切到 B 再切回 su；提示条在贴底之后出现（缺陷形状：尾部 setHint(res.note)）——
    noteText = '';
    await js(`await window.__ansRenderer.selectRole('B')`);
    await pause(500);
    noteText = '已在该角色的会话中，续接当前会话。';
    await js(`window.__ansRenderer.selectRole('su')`); // 不 await：轮询等提示落定
    const sawA = await waitHint(noteText);
    await pause(300); // 窗口化 rAF 刷新落定
    const mA = await metrics();
    check('A1-提示落定且条高>0', sawA && mA.barH > 4, 'barH=' + mA.barH + ' saw=' + sawA);
    check('A2-切回后仍贴底 dist==0（U1 修复核心）', mA.dist === 0, 'dist=' + mA.dist + ' st=' + mA.st + ' sh=' + mA.sh + ' ch=' + mA.ch);
    check('A3-视口压缩量恰=条高（证明补滚=条高补偿）', Math.abs((m0.ch - mA.ch) - mA.barH) < 2, 'ch0=' + m0.ch + ' ch1=' + mA.ch + ' barH=' + mA.barH + ' Δ=' + (m0.ch - mA.ch).toFixed(2));

    // —— B) 上翻者不打扰（**非点击**写入：drop 文件路径；无角色点击 ⇒ 无 U-1 stick 语义介入）——
    // 先清空提示条（drop 图片 → attach 成功尾 setHint("")；在底部缩小=合法补滚），再移除缩略图。
    await dropFile('image/png', 'prep.png');
    check('B0-预备：提示条已清空', await waitHint(''), 'hint=' + JSON.stringify((await metrics()).hint));
    await removeAttachments();
    await scrollTo('Math.max(0, c.scrollHeight - c.clientHeight - 320)');
    const mB0 = await metrics();
    check('B1-已在底部之外（dist>24）', mB0.dist > 24, 'dist=' + mB0.dist + ' hint=' + JSON.stringify(mB0.hint));
    await dropFile('text/plain', 'a.txt'); // 0 → 单行提示（增高）
    const sawB2 = await waitHint(DROP_ALERT);
    await pause(250);
    const mB2 = await metrics();
    check('B2-上翻·条高增大（非点击）→ scrollTop 逐字节不变', sawB2 && mB2.st === mB0.st, 'st0=' + mB0.st + ' st1=' + mB2.st + ' barH=' + mB0.barH + '→' + mB2.barH);
    check('B3-对照：条高确已增大且未触底（仍在底部之外）', mB2.barH > mB0.barH && mB2.dist > 24, 'barH=' + mB2.barH + ' dist=' + mB2.dist);
    await dropFile('image/png', 'b.png'); // 单行提示 → ""（缩矮）
    const sawB4 = await waitHint('');
    await pause(250);
    const mB4 = await metrics();
    check('B4-上翻·条高缩矮（非点击）→ scrollTop 逐字节不变', sawB4 && mB4.st === mB2.st, 'st1=' + mB2.st + ' st2=' + mB4.st + ' barH=' + mB2.barH + '→' + mB4.barH);
    await removeAttachments();
    await dropFile('text/plain', 'c.txt'); // 0 → 单行（增高，上翻态）
    await waitHint(DROP_ALERT);
    await pause(200);
    const mB5 = await metrics();
    win.webContents.send('session:event', BAD_EVENT); // 单行 → 单行（高度不变）
    const sawB6 = await waitHint(ERROR_HINT);
    await pause(250);
    const mB6 = await metrics();
    check('B5-上翻·同高重写（非点击）→ scrollTop 逐字节不变', sawB6 && mB6.st === mB5.st, 'st=' + mB5.st + '→' + mB6.st + ' barH=' + mB5.barH + '→' + mB6.barH);
    // 控制项（对照，非本修法面）：**复点角色** = U-1 显式动作 ⇒ 强制到底部（客户 2026-10-12 裁定）。
    noteText = '';
    await js(`await window.__ansRenderer.selectRole('su')`);
    await pause(400);
    const mB7 = await metrics();
    check('B6-控制项：复点角色 ⇒ 到底部（U-1 显式动作语义，与提示修法无关）', mB7.dist === 0, 'dist=' + mB7.dist + ' st=' + mB7.st);

    // —— C) 在底部·条高不变 → 零抖动（错误事件单写路径）——
    win.webContents.send('session:event', BAD_EVENT); // 从 "" → 错误单行（增高；底部 ⇒ 合法补滚)
    await waitHint(ERROR_HINT);
    await pause(250);
    const mC0 = await metrics();
    check('C0-底部·错误提示落定且贴底', mC0.dist === 0, 'dist=' + mC0.dist + ' barH=' + mC0.barH);
    win.webContents.send('session:event', BAD_EVENT); // 同文本同高重写
    await pause(400);
    const mC1 = await metrics();
    check('C1-底部·同高重写 → scrollTop 不变（零抖动）', mC1.st === mC0.st, 'st0=' + mC0.st + ' st1=' + mC1.st + ' sh0=' + mC0.sh + ' sh1=' + mC1.sh);
    check('C2-底部·仍贴底', mC1.dist === 0, 'dist=' + mC1.dist);

    // —— D) 在底部·条高缩小 → 仍贴底 ——
    // D1（点击路径，U1 记录同款）：复点角色（预分支同高写 → 尾部 setHint("") 缩小）——底部缩小 ⇒ 仍贴底。
    noteText = '';
    await js(`await window.__ansRenderer.selectRole('su')`);
    const sawD = await waitHint('');
    await pause(300);
    const mD = await metrics();
    check('D1-提示清空落定', sawD, 'hint=' + JSON.stringify(mD.hint));
    check('D2-底部·条高缩小（复点路径）→ 仍贴底 dist==0', mD.dist === 0 && mD.barH === 0, 'dist=' + mD.dist + ' barH=' + mD.barH);
    // D3（非点击路径，drop 图片 → attach 成功尾 setHint("")）：**同时**引入 composer 附件行增高（范围外面的
    // 同族布局变化，U1 记录已声明未覆盖）。断言 = ①st 不动（无滚动副作用）；②条已清空；③余距与
    // 「附件行增高 − 条高」算术闭合（写时判据看到 dist=Δcomposer>24 ⇒ 正确不补滚，非违规）。
    await js(`window.__ansRenderer.selectRole('su')`); // 先确保在底部（复点显式动作）
    noteText = '已在该角色的会话中，续接当前会话。';
    await js(`await window.__ansRenderer.selectRole('su')`);
    await waitHint(noteText);
    await pause(250);
    await scrollTo('c.scrollHeight');
    const mD3a = await metrics();
    const compA = await js(`+document.querySelector('.composer').getBoundingClientRect().height.toFixed(2)`);
    await dropFile('image/png', 'd.png');
    await waitHint('');
    await pause(250);
    const mD3b = await metrics();
    const compB = await js(`+document.querySelector('.composer').getBoundingClientRect().height.toFixed(2)`);
    const dComposer = +(compB - compA).toFixed(2);
    check('D3-非点击清空·无滚动副作用（st 不变）', mD3a.dist === 0 && mD3b.st === mD3a.st && mD3b.barH === 0, 'st0=' + mD3a.st + ' st1=' + mD3b.st + ' barH=' + mD3b.barH);
    check('D3b-余距=附件行增高−条高（算术闭合，非补滚失守）', Math.abs(mD3b.dist - (dComposer - mD3a.barH)) <= 2, 'dist=' + mD3b.dist + ' Δcomposer=' + dComposer + ' barH0=' + mD3a.barH + ' expect≈' + (dComposer - mD3a.barH).toFixed(2));
    await removeAttachments();

    // —— E) 阈值边界（STICK_THRESHOLD_PX=24；全部非点击触发）——
    await scrollTo('c.scrollHeight - c.clientHeight - 40'); // dist=40 > 24
    const mE0 = await metrics();
    await dropFile('text/plain', 'e.txt'); // "" → 单行（增高）；dist=40 ⇒ 不打扰
    const sawE1 = await waitHint(DROP_ALERT);
    await pause(250);
    const mE1 = await metrics();
    check('E1-dist=40(>阈值)·条高增大（非点击）→ 不打扰（scrollTop 不变）', sawE1 && mE0.dist >= 38 && mE1.st === mE0.st, 'dist0=' + mE0.dist + ' st0=' + mE0.st + ' st1=' + mE1.st);
    await dropFile('image/png', 'e2.png'); // 单行 → ""（缩矮）；dist≈40+ ⇒ 不打扰
    await waitHint('');
    await pause(250);
    const mE2 = await metrics();
    check('E2-dist>阈值·条高缩矮（非点击）→ 不打扰（scrollTop 不变）', mE2.st === mE1.st, 'st1=' + mE1.st + ' st2=' + mE2.st);
    await removeAttachments();
    await scrollTo('c.scrollHeight - c.clientHeight - 20'); // dist=20 ≤ 24 ⇒「在底部附近」
    const mE3 = await metrics();
    await dropFile('text/plain', 'e3.txt'); // "" → 单行（增高）⇒ 应重贴底
    const sawE4 = await waitHint(DROP_ALERT);
    await pause(300);
    const mE4 = await metrics();
    check('E3-dist=20(≤阈值)·条高增大（非点击）→ 重贴底 dist==0', sawE4 && mE3.dist >= 18 && mE3.dist <= 24 && mE4.dist === 0, 'dist_before=' + mE3.dist + ' dist_after=' + mE4.dist + ' barH=' + mE4.barH);

    // —— 收尾 ——
    log('PROBE_DONE failures=' + failures);
    fs.writeFileSync(path.join(OUT, 'probe-report.txt'), report.join('\n') + '\n');
    clearTimeout(watchdog);
    app.exit(failures === 0 ? 0 : 1);
  } catch (error) {
    log('PROBE_ERROR ' + String(error && error.stack || error));
    fs.writeFileSync(path.join(OUT, 'probe-report.txt'), report.join('\n') + '\n');
    clearTimeout(watchdog);
    app.exit(1);
  }
});
