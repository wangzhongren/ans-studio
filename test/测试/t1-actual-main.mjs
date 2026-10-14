// Actual production main, preload, renderer, Interface, Pipeline, Service and adapters.
// Only SDK engine/query, external directory dialog and env-path resolution are substituted.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog } from 'electron';
import { RUNTIME_CREDENTIAL_ENV_VARS } from '../../src/common/shared/runtime-shared.ts';
import { flushDiagnostics, disposeDiagnostics } from '../../src/common/shared/diagnostics.ts';
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scan = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(e => e.isDirectory() ? scan(path.join(directory, e.name)) : [path.join(directory, e.name)]);
const sourcePaths = [...['app', 'src', 'bin'].flatMap(d => scan(path.join(base, d))), ...['package.json', 'package-lock.json', 'tsconfig.json'].map(f => path.join(base, f))].sort();
const loaderPaths = scan(path.join(base, 'test/测试')).filter(f => path.basename(f).startsWith('t1-')).sort();
const fingerprint = paths => Object.fromEntries(paths.map(f => [path.relative(base, f), crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const startFingerprints = { production: fingerprint(sourcePaths), tests: fingerprint(loaderPaths) };
const output = process.env.ANS_T1_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'ans-t1-evidence-'));
fs.mkdirSync(output, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ans-t1-main-'));
const project = path.join(temp, 'project'); fs.mkdirSync(project);
const envPath = path.join(temp, 'fake.env');
fs.writeFileSync(envPath, 'ANTHROPIC_AUTH_TOKEN=t1-fake-pi-key\nANTHROPIC_API_KEY=t1-fake-claude-key\nCODEX_API_KEY=t1-fake-codex-key\nANS_PI_MODEL=offline-pi\nANS_CODEX_MODEL=offline-codex\nANS_CLAUDE_MODEL=offline-claude\nANS_PI_BASE_URL=http://127.0.0.1:1\nANS_CODEX_BASE_URL=http://127.0.0.1:1\nANTHROPIC_BASE_URL=http://127.0.0.1:1\n');
for (const key of Object.keys(process.env)) if (RUNTIME_CREDENTIAL_ENV_VARS.includes(key) || /^(?:ANS_|ANTHROPIC_|CLAUDE_|CODEX_|OPENAI_)/.test(key)) delete process.env[key];
process.env.ANS_T1_ENV_PATH = envPath;
process.env.ANS_T1_TRACE = path.join(output, 'main-engine-trace.jsonl');
fs.writeFileSync(process.env.ANS_T1_TRACE, '');
for (const id of ['X', 'Y']) {
  const dir = path.join(project, '角色卡', id); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'role-card.md'), `# ${id}\n\n组别：运行时接入组\n组内职责：${id === 'X' ? '组长' : '组员'}\n`);
  fs.writeFileSync(path.join(dir, 'boundary.yaml'), `role: ${id}\nentries:\n  - kind: directory\n    path: src/${id}/\n    purpose: T1 temporary output\n`);
}
app.setPath('userData', path.join(temp, 'user-data'));
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] });
await import('./t1-loader.mjs');
const observations = [], errors = [];
let win;
const pause = ms => new Promise(r => setTimeout(r, ms));
const inspect = (fn, ...args) => win.webContents.executeJavaScript('(' + fn.toString() + ')(' + args.map(a => JSON.stringify(a)).join(',') + ')');
async function check(name, fn, ...args) { const value = await inspect(fn, ...args); observations.push({ name, value }); assert.equal(value, true, name); }
async function until(fn, title, milliseconds = 7000) {
  const deadline = Date.now() + milliseconds;
  while (!(await fn())) { if (Date.now() > deadline) throw new Error('T1 wait failed: ' + title); await pause(30); }
}
async function testWindow() {
  await inspect(() => {
    window.t1 = { events: [], states: [], requests: [], expired: [] };
    desktop.onSessionEvent(p => t1.events.push(...(Array.isArray(p) ? p : [p]))); desktop.onRoleState(p => t1.states.push(p));
    desktop.onOperatorRequest(p => t1.requests.push(p)); desktop.onOperatorExpired(p => t1.expired.push(p));
  });
  await check('real preload limits renderer Node access', () => typeof desktop.openSession === 'function' && typeof require === 'undefined' && typeof process === 'undefined');
  await inspect(() => document.querySelector('#btn-import').click());
  await until(() => inspect(p => __ansRenderer.state.projectRoot === p, project), 'real dialog project import');
  await check('group parsed and forwarded from real temporary role cards', () => __ansRenderer.state.roles.find(r => r.roleId === 'X').group === '运行时接入组' && __ansRenderer.state.roles.find(r => r.roleId === 'X').groupDuty === '组长' && [...document.querySelectorAll('.tree-group')].some(e => e.textContent.includes('运行时接入组')));
  for (const runtime of ['pi', 'codex', 'claude']) {
    await inspect(async rt => { const el = document.querySelector('#runtime-select'); el.value = rt; el.dispatchEvent(new Event('change', { bubbles: true })); }, runtime);
    await until(() => inspect(rt => __ansRenderer.state.runtime === rt, runtime), 'UI runtime switch');
    await inspect(async () => __ansRenderer.selectRole('X'));
    await until(() => inspect(async (p, rt) => (await desktop.listLiveSessionViews()).some(v => v.projectRoot === p && v.roleId === 'X' && v.runtime === rt), project, runtime), 'actual selected adapter bind');
    const target = { projectRoot: project, roleId: 'X', runtime };
    const filename = `src/X/${runtime}.txt`;
    const text = 'T1:' + JSON.stringify([{ name: 'write_file', args: { path: filename, content: 'actual ' + runtime } }, { name: 'write_file', args: { path: `src/Y/forbidden-${runtime}.txt`, content: 'forbidden' } }]);
    const sent = await inspect(async (text, target) => desktop.sendSession(text, [], target), text, target);
    assert.equal(sent.ok, true, JSON.stringify(sent));
    await until(() => inspect(rt => t1.events.some(p => p.runtime === rt && p.roleId === 'X' && p.event.kind === 'settled'), runtime), 'terminal event');
    await pause(160);
    assert.equal(fs.readFileSync(path.join(project, filename), 'utf8'), 'actual ' + runtime);
    assert.equal(fs.existsSync(path.join(project, `src/Y/forbidden-${runtime}.txt`)), false);
    await check(runtime + ' event/state identity and exactly one terminal with turnId', (p, rt) => {
      const terminal = t1.events.filter(x => x.roleId === 'X' && x.runtime === rt && x.event.kind === 'settled');
      return terminal.length === 1 && terminal[0].projectRoot === p && typeof terminal[0].event.turnId === 'string' && terminal[0].event.turnId === terminal[0].event.detail.turnId && t1.states.some(x => x.projectRoot === p && x.roleId === 'X' && x.runtime === rt);
    }, project, runtime);
    await check(runtime + ' masked configuration via real main IPC', async rt => { const view = await desktop.getRuntimeConfig(rt); return view.runtime === rt && view.fields.filter(f => f.secret).every(f => f.value === '' && f.isSet) && !JSON.stringify(view).includes('t1-fake-'); }, runtime);
    const history = await inspect(async target => desktop.getSessionHistory(target), target);
    assert.equal(history.runtime, runtime); assert.equal(history.projectRoot, project); assert.equal(history.roleId, 'X');
    assert.ok(history.rows.some(row => JSON.stringify(row).includes(runtime + '.txt')), JSON.stringify(history));
    observations.push({ name: runtime + ' actual registered handler allowed/denied and isolated history', value: true });
    // Each X handback correctly auto-opens su. Close it after this source-runtime handback.
    await until(() => inspect(rt => t1.events.some(p => p.runtime === rt && p.roleId === 'su' && p.event.kind === 'settled'), runtime), 'real source-runtime handback');
    await check(runtime + ' absent formal report has truthful unreported/blocked handback', rt => t1.events.some(p => p.runtime === rt && p.roleId === 'X' && p.event.kind === 'handback' && p.event.handback.status === (rt === 'pi' ? 'unreported' : 'blocked') && p.event.handback.summary.includes('未提交正式任务报告')), runtime);
    await inspect(async target => desktop.stopSession(target), { projectRoot: project, roleId: 'su', runtime });
  }
  // Auto handback transiently needs another handle and can evict oldest X under LRU=3.
  // Reopen exact X identities once all su are closed, so the simultaneous fixture uses 3 slots.
  for (const runtime of ['pi', 'codex', 'claude']) {
    const opened = await inspect(async target => desktop.openSession(target), { projectRoot: project, roleId: 'X', runtime });
    assert.equal(opened.ok, true, JSON.stringify(opened));
  }
  await check('three independently live runtime handles', async p => (await desktop.listLiveSessionViews()).filter(v => v.projectRoot === p && v.roleId === 'X').map(v => v.runtime).sort().join(',') === 'claude,codex,pi', project);
  for (const width of [1360, 960]) {
    win.setSize(width, 860); await pause(180);
    await inspect(() => __ansRenderer.openPiPanel()); await pause(180);
    await check('runtime/group/settings visible at width ' + width, w => document.querySelector('#runtime-select').value === 'claude' && document.querySelector('#pi-panel').textContent.includes('Claude') && document.documentElement.scrollWidth <= w, width);
    fs.writeFileSync(path.join(output, 'actual-main-' + width + '.png'), (await win.webContents.capturePage()).toPNG());
  }
  await check('one actual Claude input renders one assistant response after live/history merge', () => (document.querySelector('#chat').innerText.match(/T1 claude response/g) || []).length === 1);
  // Use the actual composer so independent browser client IDs traverse real preload/main,
  // one direct invocation and one queued invocation, then the real Core turn-start ack.
  const sameText = 'T1:' + JSON.stringify([{ name: '$delay', ms: 350 }]);
  const firstEvent = await inspect(() => t1.events.length);
  async function composeIdentical() {
    await inspect(text => {
      const input = document.querySelector('#inp-message'); input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const send = document.querySelector('#btn-send');
      if (send.disabled) throw new Error('Actual composer send unexpectedly disabled');
      send.click();
    }, sameText);
  }
  await composeIdentical();
  await until(() => inspect(() => __ansRenderer.state.roleBusy.X === true), 'first real composer turn busy');
  await composeIdentical();
  await until(() => inspect(text => t1.states.some(p => p.roleId === 'X' && p.runtime === 'claude' && p.queue.some(q => q.full === text)), sameText), 'second identical client input really queued');
  await check('second identical composer input is queued in the original Claude identity', (p, text) => t1.states.some(v => v.projectRoot === p && v.roleId === 'X' && v.runtime === 'claude' && v.queue.some(q => q.full === text)), project, sameText);
  await until(() => inspect(index => t1.events.slice(index).filter(p => p.roleId === 'X' && p.runtime === 'claude' && p.event.kind === 'settled').length === 2, firstEvent), 'two independent actual composer turns finish');
  await pause(180);
  await check('direct and queued same text have different original client IDs paired with different actual turns', (index, p) => {
    const all = t1.events.slice(index).filter(e => e.roleId === 'X' && e.runtime === 'claude' && e.event.kind !== 'handback');
    const terminal = all.filter(e => e.event.kind === 'settled');
    return terminal.length === 2 && terminal.every(e => e.projectRoot === p && typeof e.clientMessageId === 'string' && e.clientMessageId && e.event.turnId === e.event.detail.turnId)
      && terminal[0].clientMessageId !== terminal[1].clientMessageId && terminal[0].event.turnId !== terminal[1].event.turnId
      && all.every(e => terminal.some(t => t.event.turnId === e.event.turnId && t.clientMessageId === e.clientMessageId));
  }, firstEvent, project);
  const sameHistory = await inspect(async p => desktop.getSessionHistory({ projectRoot: p, roleId: 'X', runtime: 'claude' }), project);
  const sameUsers = sameHistory.rows.filter(row => row.kind === 'user' && row.text === sameText);
  assert.equal(sameUsers.length, 2, JSON.stringify(sameUsers));
  assert.equal(new Set(sameUsers.map(row => row.turnId)).size, 2);
  assert.ok(sameUsers.every(row => typeof row.turnId === 'string' && row.eventKind === undefined));
  observations.push({ name: 'real history preserves both identical user inputs with their authoritative turn IDs', value: true });
  await inspect(async () => __ansRenderer.refreshProject()); await pause(200);
  await check('history refresh preserves exactly two original identical composer bubbles', text => [...document.querySelectorAll('#chat .msg-user')].filter(e => e.textContent.trim() === text).length === 2, sameText);
  await check('three actual Claude turns retain three responses after live/history refresh', () => (document.querySelector('#chat').innerText.match(/T1 claude response/g) || []).length === 3);
  win.setSize(960, 860); await pause(150);
  fs.writeFileSync(path.join(output, 'actual-main-identical-inputs-960.png'), (await win.webContents.capturePage()).toPNG());
}
const timeout = setTimeout(() => { errors.push('whole actual-main timeout'); finish(1); }, 45000);
let finishing = false;
async function finish(code) {
  if (finishing) return; finishing = true; clearTimeout(timeout);
  const endFingerprints = { production: fingerprint(sourcePaths), tests: fingerprint(loaderPaths) };
  const unchanged = JSON.stringify(startFingerprints) === JSON.stringify(endFingerprints);
  if (!unchanged) { errors.push('source fingerprint changed during actual-main run'); code = 1; }
  fs.writeFileSync(path.join(output, 'actual-main-fingerprints.json'), JSON.stringify({ start: startFingerprints, end: endFingerprints, unchanged }, null, 2));
  if (win && !win.isDestroyed()) {
    try { fs.writeFileSync(path.join(output, 'actual-main-observed-streams.json'), JSON.stringify(await inspect(() => ({ recorded: t1, runtime: __ansRenderer.state.runtime, rowModel: __ansRenderer.rowModelDebug('X'), chatText: document.querySelector('#chat').innerText, claudeResponseCount: (document.querySelector('#chat').innerText.match(/T1 claude response/g) || []).length })), null, 2)); } catch (error) { errors.push('snapshot: ' + String(error)); code = 1; }
  }
  fs.writeFileSync(path.join(output, 'actual-main-report.json'), JSON.stringify({ observations, errors, unchanged, process: { node: process.versions.node, electron: process.versions.electron, platform: process.platform }, productionMain: path.join(base, 'app/main.ts'), replacements: ['external Pi createAgentSession', 'Codex engineFactory', 'Claude query', 'temporary env path', 'external dialog selection'] }, null, 2));
  try { if (win && !win.isDestroyed()) await inspect(() => desktop.stopSession()); } catch (error) { errors.push(String(error)); }
  await flushDiagnostics(); disposeDiagnostics();
  fs.rmSync(temp, { recursive: true, force: true });
  console.log('T1_ACTUAL_MAIN_RESULT=' + code + ' checks=' + observations.length + ' output=' + output);
  app.exit(code);
}
app.on('browser-window-created', (_event, window) => {
  win = window;
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message); });
  win.webContents.once('did-finish-load', () => {
    void testWindow().then(() => finish(0)).catch(error => { errors.push(error.stack || String(error)); void finish(1); });
  });
});
await import('../../app/main.ts');
