// 固定测试角色独立夹具：真实生产renderer/preload，所有IPC为内存形状；hidden、隔离userdata。
// 仅PM公布稳定候选后执行。未导入SessionManager/Pi，不访问业务项目或网络。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import { parseSessionJsonl } from '../../app/desktop/session-history.ts';

const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APP = path.join(BASE, 'app');
const OUT = process.env.ANS_TEST_UI_REACCEPTANCE_OUTDIR || fs.mkdtempSync(path.join(os.tmpdir(), 'ans-ui-reacceptance-test-'));
const ROOT = '/nonexistent-independent-ui-reacceptance-fixture';
const files = ['app/renderer/index.html', 'app/renderer/renderer.js', 'app/renderer/styles.css', 'app/renderer/tool-rows.js', 'app/renderer/ui-labels.js', 'app/preload.cjs', 'app/desktop/session-history.ts', 'test/测试/ui-reacceptance-renderer-regression.mjs'];
const hashes = () => Object.fromEntries(files.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(BASE, f))).digest('hex')]));
const startHashes = hashes();
fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', path.join(OUT, 'user-data'));
const report = [], consoleErrors = [], sends = [], responses = [], withdrawCalls = [];
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const customerId = 'own-customer\u0000one';
const longSummary = '客户独立摘要：' + '这是一条需要保留来源和操作归属的排队消息。'.repeat(6);
const longFull = '普通中文全文首段。\n' + '请逐段阅读这份普通消息，并核对右边的每一个字都能够显示。'.repeat(12) + '\nOrdinary English sentences wrap inside the drawer without losing their final words. '.repeat(15) + '\n全文末尾独立哨兵。';
const initialQueue = [
  { id: customerId, kind: 'message', summary: longSummary, full: longFull, at: '2026-10-13T08:01:00.000Z' },
  { id: 'own-dispatch', kind: 'dispatch', sourceRoleId: 'B', summary: '派发摘要独立二', full: '派发全文独立二。'.repeat(20), at: '2026-10-13T08:02:00.000Z' },
  { id: 'own-handback', kind: 'handback', sourceRoleId: 'B', summary: '回交摘要独立三', full: '回交全文独立三。'.repeat(20), at: '2026-10-13T08:03:00.000Z' },
];
const roles = ['A', 'B'].map(roleId => ({ roleId, cardPath: '', cardText: '# ' + roleId + '\n\n职责资料段落。\n'.repeat(70), boundaryPath: '', boundary: { entries: [] }, changelog: null, docs: [] }));
const listing = { projectRoot: ROOT, primaryRoleId: 'A', hasRoles: true, warnings: [], roles };
let win, deferredWithdraw, responseValue = { ok: true };
let queueA = initialQueue.slice();
const snapshot = (roleId = 'A', busy = true) => ({ roleId, busy, summaries: (roleId === 'A' ? queueA : []).map(q => q.summary), queue: roleId === 'A' ? queueA : [], running: busy ? { id: 'own-running-' + roleId, kind: 'message', summary: '当前工作独立' + roleId, full: '进行中全文'.repeat(15), at: '2026-10-13T08:00:00.000Z' } : null });
const handlers = {
  'app:renderer-diagnostic': () => ({ ok: true }), 'window:is-maximized': () => false,
  'app:recovery-state': () => ({ projectRoot: ROOT, roleId: 'A' }), 'app:recovery-ready': () => ({ ok: true }),
  'app:list-project': (_e, input) => ({ ...listing, projectRoot: input.projectRoot }), 'session:live': () => ['A', 'B'],
  'session:open': () => ({ ok: true, resumed: true, contextSource: 'resumed' }), 'session:stop': () => ({ ok: true }),
  'session:send': (_e, input) => { sends.push(input); return { ok: true }; },
  'session:abort': (_e, input) => { win.webContents.send('session:role-state', snapshot(input.roleId, false)); return { ok: true, supported: true }; },
  'session:operator-response': (_e, input) => { responses.push(input); return responseValue; },
  'session:withdraw': (_e, input) => { withdrawCalls.push(input); return new Promise((resolve, reject) => { deferredWithdraw = { resolve, reject }; }); },
  'app:pick-image': () => ({ ok: true, image: { name: 'independent.png', mime: 'image/png', size: 68, dataBase64: PNG } }),
  'pi-config:get': () => ({ path: ROOT + '/' + 'independent-long-directory/'.repeat(10) + '.env', fields: ['ANTHROPIC_AUTH_TOKEN', 'ANS_PI_BASE_URL', 'ANS_PI_MODEL', 'ANS_PI_CONTEXT_WINDOW'].map(key => ({ key, secret: key === 'ANTHROPIC_AUTH_TOKEN', value: key === 'ANTHROPIC_AUTH_TOKEN' ? '' : 'fixture', isSet: true })) }),
  'pi-config:save': () => ({ ok: true, appliedKeys: [] }),
};
Object.entries(handlers).forEach(([channel, handler]) => ipcMain.handle(channel, handler));
const pause = ms => new Promise(r => setTimeout(r, ms));
const inspect = (fn, ...args) => win.webContents.executeJavaScript('(' + fn.toString() + ')(' + args.map(a => JSON.stringify(a)).join(',') + ')');
async function check(name, fn, ...args) {
  const observation = await inspect(fn, ...args);
  report.push({ name, observation });
  assert.equal(observation.ok ?? observation, true, name + ': ' + JSON.stringify(observation));
}
async function push(channel, payload) { win.webContents.send(channel, payload); await pause(90); }
async function event(roleId, kind, summary, detail = {}) { await push('session:event', { roleId, event: { kind, summary, detail } }); }
async function click(selector) { await inspect(s => { const n = document.querySelector(s); if (!n) throw new Error('Missing ' + s); n.click(); }, selector); await pause(120); }
async function select(roleId) { await inspect(id => window.__ansRenderer.selectRole(id), roleId); await pause(120); }
async function roleClick(roleId) { await inspect(id => { const n = [...document.querySelectorAll('#role-tree .tree-item')].find(n => n.querySelector('.ti-name').textContent === id); n.click(); }, roleId); await pause(120); }
async function key(keyCode, modifiers = []) {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  if (keyCode === 'Enter' || keyCode === 'Space') win.webContents.sendInputEvent({ type: 'char', keyCode: keyCode === 'Enter' ? '\r' : ' ', modifiers });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  await pause(80);
}
// 抽屉关闭是既有的120ms clip-path动画（本候选未改）：定位激活后须等其结束，再断言「整卡可命中」。
// 否则采样点会与收拢中的抽屉残条竞态——设计对齐把未决卡加宽到整列（右缘约x=926@960），
// 卡右缘采样点落进动画中的抽屉可见残条区间。这是观测时序问题，不改断言：超时也照原断言按真实状态判定。
async function drawerSettled(label) {
  for (let i = 0; i < 100; i++) {
    if (await inspect(() => getComputedStyle(document.getElementById('right-drawer')).visibility) === 'hidden') {
      report.push({ name: 'drawer close animation settled before exposure assert ' + label, observation: { visibility: 'hidden', waits: i } });
      return;
    }
    await pause(20);
  }
  report.push({ name: 'drawer close animation did not settle before exposure assert ' + label, observation: { visibility: 'still-visible-after-2s' } });
}
async function reset(width = 1360, height = 860) {
  queueA = initialQueue.slice(); responseValue = { ok: true };
  win.setContentSize(width, height);
  await win.loadFile(path.join(APP, 'renderer/index.html')); await pause(180);
  await inspect(() => {
    // 通用观测辅助，不复制产品行为；排除隐藏details，核对实际布局和命中。
    window.QA = {
      rendered(n) {
        if (!n || !n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
        for (let p = n.parentElement; p; p = p.parentElement) {
          if (p.tagName === 'DETAILS' && !p.open && !p.querySelector(':scope > summary')?.contains(n)) return false;
        }
        return true;
      },
      box(n) { const r = n.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; },
      hit(n) {
        if (!this.rendered(n)) return false;
        const r = n.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0 || r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return false;
        // 圆角控件的bbox透明四角不属于点击区域。取四边中点与中心，同时保留完整bbox界限。
        for (const [x, y] of [[r.left + 2, (r.top + r.bottom) / 2], [r.right - 2, (r.top + r.bottom) / 2], [(r.left + r.right) / 2, r.top + 2], [(r.left + r.right) / 2, r.bottom - 2], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]]) {
          const h = document.elementFromPoint(x, y);
          if (h !== n && !n.contains(h)) return false;
        }
        return true;
      },
      text(n) {
        if (!this.rendered(n)) return '';
        const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
        let out = '', t;
        while ((t = walker.nextNode())) {
          if (this.rendered(t.parentElement)) {
            const r = document.createRange(); r.selectNodeContents(t);
            if ([...r.getClientRects()].some(b => b.width > 0 && b.height > 0)) out += t.textContent;
          }
        }
        return out;
      },
      horizontalText(n, container) {
        if (!this.rendered(n)) return false;
        const bounds = container.getBoundingClientRect();
        const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
        let t;
        while ((t = walker.nextNode())) {
          if (!this.rendered(t.parentElement)) continue;
          const r = document.createRange(); r.selectNodeContents(t);
          for (const b of r.getClientRects()) if (b.width > 0 && (b.left < bounds.left - 1 || b.right > bounds.right + 1)) return false;
        }
        return true;
      },
      item(id) { return [...document.querySelectorAll('#right-body .q-item')].find(n => decodeURIComponent(n.dataset.queueId) === id); },
    };
  });
}
async function queueSetup() {
  await push('session:role-state', snapshot());
  await click('#tab-card');
  await inspect(id => { window.QA.item(id).querySelector('.q-toggle').click(); document.querySelector('#right-body details').open = true; const i = document.getElementById('inp-message'); i.value = '原角色独立草稿'; i.dispatchEvent(new Event('input')); }, customerId);
  await pause(100);
}
async function focusByTab(selector) {
  await inspect(() => document.getElementById('inp-message').focus());
  const seen = [];
  for (let i = 0; i < 80; i++) {
    await key('Tab');
    const focused = await inspect(s => ({ matched: document.activeElement.matches(s), id: document.activeElement.id, cls: document.activeElement.className, visible: window.QA.hit(document.activeElement) }), selector);
    seen.push(focused);
    if (focused.matched) { report.push({ name: 'actual Tab reaches ' + selector, observation: seen }); assert.equal(focused.visible, true); return; }
  }
  throw new Error('Tab did not reach ' + selector + ': ' + JSON.stringify(seen));
}
function parse(messages) {
  const result = parseSessionJsonl([{ type: 'session' }, ...messages.map(message => ({ type: 'message', message }))].map(r => JSON.stringify(r)).join('\n'));
  assert.equal(result.ok, true); assert.equal(result.skipped, 0); return result.rows;
}
const toolResult = (id, name, text, extra = {}) => ({ role: 'toolResult', toolCallId: id, toolName: name, content: [{ type: 'text', text }], ...extra });
async function main() {
  for (const [width, height] of [[1360, 860], [960, 620]]) {
    await reset(width, height);
    await event('A', 'message', '正常助手答复。请补充一个普通问题？正文里提到失败也是普通文字。');
    await check('R1 one rendered governance fact ' + width, () => {
      const n = [...document.querySelectorAll('#chat-role-sub, .runtime-note')].filter(n => window.QA.rendered(n) && /写入|边界|治理引擎/.test(window.QA.text(n)));
      return { ok: n.length === 1 && document.querySelectorAll('#chat .op-request,#chat .sys-denied').length === 0, facts: n.map(n => window.QA.text(n)) };
    });
    await queueSetup();
    for (const q of initialQueue) {
      await inspect(id => { const item = window.QA.item(id); if (item.querySelector('.q-full').hidden) item.querySelector('.q-toggle').click(); item.querySelector('.q-actions').scrollIntoView({ block: 'center' }); }, q.id);
      await pause(80);
      await check('R2 queue identity geometry ' + width + ' ' + q.id, (q, index, expectedSource) => {
        const item = window.QA.item(q.id), pos = item.querySelector('.q-pos'), source = item.querySelector('.q-src'), time = item.querySelector('.q-meta'), summary = item.querySelector('.q-text'), full = item.querySelector('.q-full');
        const actions = [...item.querySelectorAll('button')], text = summary.getBoundingClientRect();
        const actionRects = actions.map(b => window.QA.box(b));
        return { ok: pos.textContent.trim() === String(index + 1) && summary.textContent.startsWith(q.summary.slice(0, 10)) && source.textContent === expectedSource && time.textContent === new Date(q.at).toLocaleTimeString() && full.textContent === q.full && actions.every(b => b.closest('.q-item') === item && window.QA.hit(b) && b.getBoundingClientRect().height >= 28) && Math.abs(full.getBoundingClientRect().left - text.left) < 1, pos: pos.textContent, source: source.textContent, time: time.textContent, actions: actionRects, summary: window.QA.box(summary), full: window.QA.box(full) };
      }, q, initialQueue.indexOf(q), ['客户消息', 'su 派发', '回交投递'][initialQueue.indexOf(q)]);
    }
    await check('R2 ordinary full no overflow or clipped text ' + width, id => {
      const body = document.getElementById('right-body'), full = window.QA.item(id).querySelector('.q-full');
      return { ok: body.scrollWidth === body.clientWidth && full.textContent.endsWith('全文末尾独立哨兵。') && window.QA.horizontalText(full, full) && window.QA.horizontalText(full, body) && full.scrollWidth <= full.clientWidth, body: { scrollWidth: body.scrollWidth, clientWidth: body.clientWidth }, full: { scrollWidth: full.scrollWidth, clientWidth: full.clientWidth } };
    }, customerId);
    await check('R2 only queued customer withdrawable ' + width, () => [...document.querySelectorAll('#right-body .q-withdraw')].length === 1 && !document.querySelector('#right-body .is-running .q-withdraw'));
    await focusByTab('#right-body .q-withdraw');
    await key('Tab', ['shift']);
    await check('R2 Shift+Tab reaches same item full action ' + width, () => document.activeElement.matches('.q-toggle') && window.QA.hit(document.activeElement));
    await reset(width, height);
    await event('A', 'denied', '没有写入权限，未执行', { toolName: 'write_file', path: 'outside/independent-denied.md' });
    await event('A', 'denied', '文件不存在（ENOENT）', { toolName: 'read_file', path: 'docs/independent-missing.md', status: 'failed', ok: false });
    await event('A', 'denied', 'run_shell 已执行：node --check independent-missing.js（exit 2）', { toolName: 'run_shell', command: 'node --check independent-missing.js', status: 'failed', ok: false });
    await event('A', 'denied', '旧记录失败，目标无法得知');
    await event('A', 'denied', 'run_shell 已执行：printf "ok"; false（exit 2）', { toolName: 'run_shell', command: 'printf "ok"; false', status: 'failed', ok: false });
    const rows = parse([toolResult('orphan', 'read_file', '读完成功但没有可靠状态')]);
    await push('session:history', { roleId: 'B', projectRoot: ROOT, rows });
    await check('R3 five independent exceptional rows ' + width, () => document.querySelectorAll('#chat .sys-denied').length === 5);
    const expectedFailures = [
      ['outside/independent-denied.md', '未执行'], ['docs/independent-missing.md', 'ENOENT'],
      ['node --check independent-missing.js', 'exit 2'], ['目标未记录', '旧记录失败'],
      ['printf "ok"; false', '（exit 2）'],
    ];
    for (let i = 0; i < expectedFailures.length; i++) {
      await inspect(index => document.querySelectorAll('#chat .sys-denied')[index].querySelector('summary').scrollIntoView({ block: 'center' }), i);
      await pause(60);
      await check('R3 collapsed reliable cause and target truly visible ' + width + ' ' + i, (index, expected) => {
        const n = document.querySelectorAll('#chat .sys-denied')[index], summary = n.querySelector('summary');
        const visible = { open: n.open, text: window.QA.text(summary), hit: window.QA.hit(summary), horizontal: window.QA.horizontalText(summary, document.getElementById('chat')) };
        return { ok: !visible.open && visible.hit && visible.horizontal && expected.every(t => visible.text.includes(t)) && (index !== 0 || !/执行失败|执行完成/.test(visible.text)), visible };
      }, i, expectedFailures[i]);
    }
    // 历史恢复保留已到达的live行；用独立新pane检查孤立历史，避免把前一组live拒绝当本例。
    await reset(width, height);
    const orphanRows = parse([
      { role: 'toolResult', toolName: 'read_file', content: [{ type: 'text', text: 'read_file 失败：lost.md（ENOENT）' }] },
      { role: 'toolResult', toolName: 'read_file', details: { path: '', target: '' }, content: [{ type: 'text', text: 'read_file 失败：lost.md（ENOENT）' }] },
      { role: 'toolResult', toolName: 'read_file', content: [{ type: 'text', text: '旧结果未记录状态\n正文：read_file 失败：private-body.md（ENOENT）' }] },
    ]);
    await push('session:history', { roleId: 'A', projectRoot: ROOT, rows: orphanRows });
    for (const i of [0, 1]) {
      await inspect(index => document.querySelectorAll('#chat .sys-denied')[index].querySelector('summary').scrollIntoView({ block: 'center' }), i);
      await pause(60);
      await check('S1 orphan own failure headline complete without unknown target ' + width + ' ' + i, index => {
        const n = document.querySelectorAll('#chat .sys-denied')[index], s = n.querySelector('summary'), text = window.QA.text(s);
        return { ok: !n.open && window.QA.hit(s) && text.includes('lost.md') && text.includes('ENOENT') && !text.includes('目标未记录') && window.QA.horizontalText(s, document.getElementById('chat')), text };
      }, i);
    }
    await check('S1 result body cannot invent failure or target ' + width, () => {
      const summaries = [...document.querySelectorAll('#chat .tool-records summary')].map(n => window.QA.text(n));
      return { ok: document.querySelectorAll('#chat .sys-denied').length === 2 && summaries.some(t => t.includes('状态未记录')) && !summaries.some(t => /private-body|ENOENT/.test(t)), summaries };
    });
    await push('session:history', { roleId: 'B', projectRoot: ROOT, rows });
    await select('B');
    await check('R3 missing reliable state remains unknown ' + width, () => window.QA.text(document.querySelector('#chat .tool-records summary')).includes('状态未记录'));
  }
  // 撤回结果：失败/无效/throw/迟到切role/成功，全部走真实preload->受控IPC。
  await reset(); await queueSetup();
  for (const [mode, value, expected] of [
    ['failed', { ok: false, error: '独立返回失败原因' }, '独立返回失败原因'],
    ['invalid', undefined, '未知原因'],
    ['throw', null, '独立通道抛错'],
    ['late-role', { ok: false, error: '原A迟到原因' }, '原A迟到原因'],
  ]) {
    await inspect(id => window.QA.item(id).querySelector('.q-withdraw').scrollIntoView({ block: 'center' }), customerId);
    await pause(70);
    const drawerReader = await inspect(id => ({ offset: window.QA.item(id).getBoundingClientRect().top - document.getElementById('right-body').getBoundingClientRect().top }), customerId);
    await inspect(id => window.QA.item(id).querySelector('.q-withdraw').click(), customerId);
    await pause(60);
    const count = withdrawCalls.length;
    await inspect(id => window.QA.item(id).querySelector('.q-withdraw').click(), customerId);
    await check('R4 pending retained and disabled ' + mode, id => { const item = window.QA.item(id); return item.querySelector('.q-withdraw').disabled && !item.querySelector('.q-full').hidden; }, customerId);
    assert.equal(withdrawCalls.length, count, 'pending cannot duplicate IPC');
    if (mode === 'late-role') {
      await select('B');
      await push('session:role-state', { ...snapshot('B', false), queue: [{ ...initialQueue[0], summary: 'B同id独立摘要', full: 'B独立全文' }], summaries: ['B同id独立摘要'] });
    }
    assert.ok(deferredWithdraw, 'real IPC pending promise exists');
    if (mode === 'throw') deferredWithdraw.reject(new Error('独立通道抛错')); else deferredWithdraw.resolve(value);
    await pause(120);
    if (mode === 'late-role') {
      await check('R4 late return does not contaminate B same id', id => !window.QA.item(id)?.querySelector('.q-feedback') && !document.getElementById('chat').textContent.includes('原A迟到原因'), customerId);
      await select('A');
    }
    await push('session:role-state', snapshot());
    await check('R4 refresh and return retain original reading anchor ' + mode, (id, before) => ({ ok: Math.abs(window.QA.item(id).getBoundingClientRect().top - document.getElementById('right-body').getBoundingClientRect().top - before.offset) < 2, before, offset: window.QA.item(id).getBoundingClientRect().top - document.getElementById('right-body').getBoundingClientRect().top }), customerId, drawerReader);
    await inspect(id => window.QA.item(id).querySelector('.q-feedback').scrollIntoView({ block: 'center' }), customerId);
    await pause(60);
    await check('R4 original item visible receipt and retained state ' + mode, (id, expected) => {
      const item = window.QA.item(id), feedback = item.querySelector('.q-feedback');
      return { ok: window.QA.hit(feedback) && window.QA.text(feedback).includes(expected) && !item.querySelector('.q-full').hidden && !item.querySelector('.q-withdraw').disabled && document.querySelector('#right-body details').open && document.getElementById('inp-message').value === '原角色独立草稿' && document.querySelectorAll('#right-body .q-item').length === 4, receipt: window.QA.text(feedback), rect: window.QA.box(feedback) };
    }, customerId, expected);
  }
  await inspect(id => window.QA.item(id).querySelector('.q-withdraw').click(), customerId); await pause(60);
  deferredWithdraw.resolve({ ok: true, summary: longSummary }); await pause(100);
  await check('R4 success return alone cannot invent queue removal', id => !!window.QA.item(id), customerId);
  queueA = initialQueue.slice(1); await push('session:role-state', snapshot());
  await check('R4 success snapshot removes only original id and renumbers', id => !window.QA.item(id) && [...document.querySelectorAll('#right-body .q-pos')].map(n => n.textContent.trim()).join(',') === '1,2', customerId);
  await click('#btn-halt');
  await check('R4 stopping preserves remaining queue', () => document.querySelectorAll('#right-body .q-item').length === 2);
  // 换项目的旧Promise必须作废，角色/id重用也不能串到新项目；项目仍只是内存快照键。
  await reset(); await queueSetup();
  await inspect(id => window.QA.item(id).querySelector('.q-withdraw').click(), customerId); await pause(60);
  const oldPromise = deferredWithdraw;
  await inspect(root => window.__ansRenderer.loadProject(root), ROOT + '-second');
  await select('A'); await push('session:role-state', snapshot());
  if (await inspect(() => window.__ansRenderer.state.rightTab !== 'card')) await click('#tab-card');
  oldPromise.resolve({ ok: false, error: '旧项目迟到结果必须作废' }); await pause(120);
  await check('R4 old project response cannot contaminate reused role and id', id => !!window.QA.item(id) && !window.QA.item(id).querySelector('.q-feedback') && !document.getElementById('chat').textContent.includes('旧项目迟到结果'), customerId);

  for (const [width, height] of [[1360, 860], [960, 620]]) {
    await reset(width, height);
    await push('session:role-state', snapshot());
    await push('session:role-state', snapshot('B'));
    const history = Array.from({ length: 180 }, (_, i) => ({ kind: 'assistant', text: '独立阅读段落' + i + ' 需要保持的历史内容。'.repeat(12), at: '' }));
    await push('session:history', { roleId: 'A', projectRoot: ROOT, rows: history });
    await click('#tab-card');
    await inspect(() => { const c = document.getElementById('chat'); c.scrollTop = c.scrollHeight * 0.45; });
    await pause(100);
    const reader = await inspect(() => { const c = document.getElementById('chat'), bounds = c.getBoundingClientRect(); const n = [...c.querySelectorAll('.msg')].find(n => n.getBoundingClientRect().bottom > bounds.top && n.getBoundingClientRect().top < bounds.bottom); return { text: n.textContent, offset: n.getBoundingClientRect().top - bounds.top }; });
    const request = { id: 'own-open-' + width, roleId: 'A', request: { kind: 'confirm', title: '独立确认标题' + width, preview: '独立完整短预览，不执行任何操作。', detail: '需要用户决定的独立资料。' } };
    await push('session:operator-request', request);
    await push('session:role-state', snapshot());
    await check('R5 ordinary arrival and update retain drawer and reader ' + width, before => {
      const c = document.getElementById('chat'), bounds = c.getBoundingClientRect(); const n = [...c.querySelectorAll('.msg')].find(n => n.getBoundingClientRect().bottom > bounds.top && n.getBoundingClientRect().top < bounds.bottom);
      return { ok: window.__ansRenderer.state.rightTab === 'card' && n.textContent === before.text && Math.abs(n.getBoundingClientRect().top - bounds.top - before.offset) < 2, after: { text: n.textContent, offset: n.getBoundingClientRect().top - bounds.top } };
    }, reader);
    await check('R5 current open prioritizes wait and role B retains busy ' + width, () => document.querySelector('#chat .tool-current').textContent === '等待你确认');
    await roleClick('B'); await check('R5 other role has no borrowed wait ' + width, () => document.querySelector('#chat .tool-current').textContent === '正在工作' && document.querySelectorAll('#chat .op-request').length === 0);
    await roleClick('A');
    await check('R5 explicit role U1 prioritizes pending card ' + width, id => { const card = document.querySelector('[data-request-id="' + id + '"]'); const r = card.getBoundingClientRect(), c = document.getElementById('chat').getBoundingClientRect(); return r.top >= c.top && r.bottom <= c.bottom; }, request.id);
    for (const tab of ['card', 'pi']) {
      if (tab === 'pi') await click('#tab-pi');
      await check('R5 complete hit-visible locator with drawer ' + width + ' ' + tab, () => { const n = document.getElementById('op-chip'); return { ok: window.QA.hit(n), box: window.QA.box(n), text: window.QA.text(n) }; });
      await check('R5 partially covered card cannot invite answer ' + width + ' ' + tab, id => {
        const card = document.querySelector('[data-request-id="' + id + '"]'), c = card.getBoundingClientRect(), d = document.getElementById('right-drawer').getBoundingClientRect();
        const covered = c.right > d.left && c.left < d.right && c.bottom > d.top && c.top < d.bottom;
        const buttons = [...card.querySelectorAll('.op-actions button')];
        return { ok: !covered || card.inert && buttons.every(b => !window.QA.hit(b) || b.disabled), covered, inert: card.inert, buttons: buttons.map(b => ({ visible: window.QA.hit(b), disabled: b.disabled })) };
      }, request.id);
      if (await inspect(id => document.querySelector('[data-request-id="' + id + '"]').inert, request.id)) {
        const answersBeforeCoveredKey = responses.length;
        // 原焦点链必须绕过受覆盖卡；直接对其原按钮focus也不得成为可激活动作。
        await inspect(id => document.querySelector('[data-request-id="' + id + '"] .op-confirm').focus(), request.id);
        await key('Enter');
        assert.equal(responses.length, answersBeforeCoveredKey, 'covered card key cannot answer');
      }
      await focusByTab('#op-chip');
      const responsesBefore = responses.length;
      await key(tab === 'card' ? 'Enter' : 'Space');
      assert.equal(responses.length, responsesBefore, 'locating never answers');
      await drawerSettled('confirm exposure ' + width + ' ' + tab);
      await check('R5 active locate exposes entire card/actions ' + width + ' ' + tab, id => {
        const card = document.querySelector('[data-request-id="' + id + '"]');
        const parts = ['.op-title', '.op-preview > summary', '.op-confirm', '.op-deny'].map(s => card.querySelector(s));
        return { ok: window.__ansRenderer.state.rightTab === null && !card.inert && parts.every(n => window.QA.hit(n)) && !card.querySelector('.op-confirm').disabled && !card.querySelector('.op-deny').disabled && document.activeElement === card, parts: parts.map(n => ({ text: window.QA.text(n), box: window.QA.box(n) })), diag: { inert: card.inert, rightTab: window.__ansRenderer.state.rightTab, drawerVisibility: getComputedStyle(document.getElementById('right-drawer')).visibility } };
      }, request.id);
      await inspect(id => document.querySelector('[data-request-id="' + id + '"] .op-preview > summary').click(), request.id);
      await pause(90);
      await check('R5 preview text readable after locate ' + width + ' ' + tab, id => { const card = document.querySelector('[data-request-id="' + id + '"]'), p = card.querySelector('.op-preview-body'); return window.QA.hit(p) && window.QA.text(p).includes('独立完整短预览') && window.QA.hit(card.querySelector('.op-confirm')) && window.QA.hit(card.querySelector('.op-deny')); }, request.id);
      // 关闭预览，再打开原抽屉。键盘返回链独立于作答。
      await inspect(id => document.querySelector('[data-request-id="' + id + '"] .op-preview > summary').click(), request.id);
      await click('#tab-' + tab); await key('Escape');
      await check('R5 Esc closes and restores launcher focus ' + width + ' ' + tab, tab => window.__ansRenderer.state.rightTab === null && document.activeElement.id === 'tab-' + tab, tab);
      await click('#tab-card');
    }
    // 显式U1导航仍优先未决；回答后的运行提示依真实busy恢复。
    await roleClick('B'); await roleClick('A'); await click('#op-chip');
    await click('[data-request-id="' + request.id + '"] .op-confirm');
    await check('R5 answer clears wait but real busy survives ' + width, () => document.querySelector('#chat .tool-current').textContent === '正在工作' && document.getElementById('op-chip').hidden);
    await push('session:role-state', snapshot('A', false));
    await check('R5 settled has no work/wait ' + width, () => !document.querySelector('#chat .tool-current'));
    await push('session:operator-request', { id: 'own-expired-' + width, roleId: 'A', request: { kind: 'confirm', title: '独立失效请求' } });
    await push('session:role-state', snapshot()); await click('#op-chip');
    responseValue = { ok: false, expired: true, error: '受控已失效' };
    await click('[data-request-id="own-expired-' + width + '"] .op-deny');
    await check('R5 expired clears wait and restores true busy ' + width, () => document.querySelector('#chat .tool-current').textContent === '正在工作' && document.getElementById('op-chip').hidden);
    responseValue = { ok: true };
    const choiceId = 'own-choice-' + width;
    await push('session:operator-request', { id: choiceId, roleId: 'A', request: { kind: 'choice', title: '独立选择标题', question: '请选择一项', preview: '独立选择预览', options: [{ id: 'x', label: '独立选项X' }, { id: 'y', label: '独立选项Y' }], multiple: false } });
    for (const tab of ['card', 'pi']) {
      await click('#tab-' + tab);
      await check('R5 choice covered state cannot expose operative partial actions ' + width + ' ' + tab, id => {
        const c = document.querySelector('[data-request-id="' + id + '"]'), r = c.getBoundingClientRect(), d = document.getElementById('right-drawer').getBoundingClientRect();
        const covered = r.right > d.left && r.left < d.right && r.bottom > d.top && r.top < d.bottom;
        return { ok: !covered || c.inert && [...c.querySelectorAll('.op-actions button')].every(n => !window.QA.hit(n) || n.disabled), covered, inert: c.inert };
      }, choiceId);
      await focusByTab('#op-chip');
      const beforeChoiceLocate = responses.length; await key('Enter');
      assert.equal(responses.length, beforeChoiceLocate, 'choice locate cannot answer');
      await drawerSettled('choice exposure ' + width + ' ' + tab);
      await check('R5 choice title preview options and all actions exposed ' + width + ' ' + tab, (id, selected) => {
        const c = document.querySelector('[data-request-id="' + id + '"]');
        const parts = [c.querySelector('.op-title'), c.querySelector('.op-question'), c.querySelector('.op-preview summary'), ...c.querySelectorAll('.op-option'), c.querySelector('.op-submit'), c.querySelector('.op-cancel')];
        return { ok: !c.inert && parts.every(n => window.QA.hit(n)) && c.querySelector('.op-submit').disabled === !selected && !c.querySelector('.op-cancel').disabled, parts: parts.map(n => ({ text: window.QA.text(n), box: window.QA.box(n) })), submitDisabled: c.querySelector('.op-submit').disabled, diag: { inert: c.inert, rightTab: window.__ansRenderer.state.rightTab, drawerVisibility: getComputedStyle(document.getElementById('right-drawer')).visibility } };
      }, choiceId, tab === 'pi');
      if (tab === 'card') {
        await inspect(id => document.querySelector('[data-request-id="' + id + '"] input[value="x"]').click(), choiceId);
        await pause(80);
      }
    }
    await focusByTab('[data-request-id="' + choiceId + '"] .op-submit');
    await key('Enter');
    assert.deepEqual(responses.at(-1), { id: choiceId, decision: { kind: 'choice', selected: ['x'] } }, 'actual keyboard submits only selected choice');
    await check('R5 choice answered returns to real busy ' + width, () => document.querySelector('#chat .tool-current').textContent === '正在工作' && document.getElementById('op-chip').hidden);
  }
  await reset();
  const handback = { roleId: 'B', taskId: 'independent-report', status: 'completed', summary: '独立回交原文', evidence: ['docs/independent-proof.md'], at: '2026-10-13T08:05:00.000Z' };
  await push('session:event', { roleId: 'B', event: { kind: 'handback', summary: handback.summary, handback } });
  await check('regression undelivered report not duplicated into main role', () => document.querySelectorAll('#chat .msg-handback,#chat .msg-injected').length === 0);
  await event('A', 'message', '[回交] 来自 B 的报告\n独立回交原文\n证据：docs/independent-proof.md');
  await event('A', 'message', '主入口独立汇总答复。');
  await check('regression one delivered report with one assistant summary', () => {
    const injected = document.querySelectorAll('#chat .msg-injected.is-handback').length;
    const summary = [...document.querySelectorAll('#chat .msg-assistant')].map(n => window.QA.text(n).trim());
    return { ok: injected === 1 && document.querySelectorAll('#chat .msg-handback').length === 0 && !document.querySelector('#chat .mi-report-detail').open && summary.filter(t => t === '主入口独立汇总答复。').length === 1, injected, summary };
  });
  await reset();
  await click('#btn-attach-image');
  await inspect(() => { const i = document.getElementById('inp-message'); i.value = '独立组合候选中文'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); });
  const sendCount = sends.length;
  for (const options of [{ key: 'Enter', isComposing: false, keyCode: 13 }, { key: 'Enter', isComposing: true, keyCode: 13 }]) {
    await inspect(options => document.getElementById('inp-message').dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...options })), options);
  }
  await inspect(() => document.getElementById('inp-message').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await inspect(() => document.getElementById('inp-message').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true })));
  await pause(100);
  assert.equal(sends.length, sendCount, 'IME cannot dispatch');
  await check('regression IME preserves draft image and bubble', () => document.getElementById('inp-message').value === '独立组合候选中文' && document.querySelectorAll('#attach-row .attach-chip').length === 1 && document.querySelectorAll('#chat .msg-user').length === 0);
  await inspect(() => document.getElementById('inp-message').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true })));
  await pause(100); assert.equal(sends.length, sendCount + 1); assert.equal(sends.at(-1).images.length, 1);
  await check('regression normal Enter sends once and clears original input', () => document.getElementById('inp-message').value === '' && document.querySelectorAll('#attach-row .attach-chip').length === 0 && document.querySelectorAll('#chat .msg-user').length === 1);
}
app.whenReady().then(async () => {
  const watchdog = setTimeout(() => { fs.writeFileSync(path.join(OUT, 'watchdog.txt'), 'timeout'); app.exit(1); }, 90000);
  let failure;
  try {
    win = new BrowserWindow({ width: 1360, height: 860, useContentSize: true, frame: false, show: false, webPreferences: { preload: path.join(APP, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
    win.webContents.on('console-message', e => { if (e.level === 'error') consoleErrors.push(e.message); });
    await main();
    assert.deepEqual(hashes(), startHashes, 'candidate changed during verification, evidence invalid');
    assert.equal(consoleErrors.length, 0, 'renderer console errors');
  } catch (error) { failure = { message: String(error), stack: error.stack }; }
  clearTimeout(watchdog);
  const endHashes = hashes();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ environment: { electron: process.versions.electron, node: process.versions.node, platform: process.platform, arch: process.arch, hidden: true }, input: { root: ROOT, widths: [1360, 960], initialQueue }, startHashes, endHashes, report, withdrawCalls, responses, sends, consoleErrors, failure }, null, 2));
  console.log((failure ? 'INDEPENDENT_REACCEPTANCE_FAIL ' : 'INDEPENDENT_REACCEPTANCE_PASS ') + report.length + ' ' + OUT);
  if (failure) console.error(failure.message);
  app.exit(failure ? 1 : 0);
});
