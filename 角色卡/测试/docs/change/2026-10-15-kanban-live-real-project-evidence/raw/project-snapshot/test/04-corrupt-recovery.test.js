'use strict';

/**
 * 交付级测试套件 04：损坏数据文件的告警 / 备份 / 不静默清空（覆盖清单 9）。
 *
 * 依据 README 第 6 节：非法 JSON 或结构非法时，原文件改名备份为
 * `<dataFile>.corrupt-<时间戳>`，内容逐字节保留，stderr 打印中文错误，
 * 服务以空列表继续运行，告警经 /api/status 与 /api/tasks 的 warning 暴露。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createStore } = require('../src/store.js');
const { createServer } = require('../src/server.js');

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function corruptBackups(dir) {
  return fs.readdirSync(dir).filter((f) => f.startsWith('tasks.json.corrupt-'));
}

// ---------------------------------------------------------------------------
// 覆盖 9：store 层
// ---------------------------------------------------------------------------

test('[覆盖9] 非法 JSON：明确告警 + 改名备份 + 内容逐字节保留 + 不静默清空', async (t) => {
  const dir = tmpDir('kanban-corrupt-json-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'tasks.json');
  const original = '{ 这不是合法 JSON "title": "遗留数据" ';
  fs.writeFileSync(dataFile, original, 'utf8');

  const store = createStore({ dataFile });

  assert.ok(store.warning, '损坏文件必须产生 warning');
  assert.equal(store.warning.code, 'DATA_FILE_CORRUPT');
  assert.match(store.warning.message, /备份/, '告警文案应说明已备份');
  assert.equal(path.isAbsolute(store.warning.backupPath), true, 'backupPath 应为绝对路径');
  assert.deepEqual(store.list(), [], '损坏后以空列表继续运行');

  const backups = corruptBackups(dir);
  assert.equal(backups.length, 1, '应恰好产生 1 个 corrupt 备份');
  assert.match(backups[0], /^tasks\.json\.corrupt-/, '备份名须为 tasks.json.corrupt-*');

  const backupPath = path.join(dir, backups[0]);
  assert.equal(fs.readFileSync(backupPath, 'utf8'), original, '备份内容必须与原文件逐字节一致（不得静默清空）');
  assert.equal(fs.existsSync(dataFile), false, '原文件应被改名（而非被清空覆盖）');

  const stat = fs.statSync(backupPath);
  assert.ok(stat.size > 0, '备份文件不能是空的');
});

test('[覆盖9] 结构非法（JSON 合法但不是任务数组）：同样备份并告警', async (t) => {
  const cases = [
    JSON.stringify({ hello: 'world' }),
    JSON.stringify({ tasks: '不是数组' }),
    JSON.stringify('一个字符串'),
    JSON.stringify(123),
    JSON.stringify(true),
  ];
  for (const content of cases) {
    const dir = tmpDir('kanban-corrupt-shape-');
    const dataFile = path.join(dir, 'tasks.json');
    fs.writeFileSync(dataFile, content, 'utf8');

    const store = createStore({ dataFile });
    assert.equal(store.warning && store.warning.code, 'DATA_FILE_CORRUPT', `内容 ${content} 应触发告警`);
    assert.deepEqual(store.list(), []);

    const backups = corruptBackups(dir);
    assert.equal(backups.length, 1, `内容 ${content} 应产生备份`);
    assert.equal(fs.readFileSync(path.join(dir, backups[0]), 'utf8'), content, '备份内容须完整保留');
    assert.equal(fs.existsSync(dataFile), false);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('[覆盖9] 多次损坏：备份文件名不覆盖（追加序号）', async (t) => {
  const dir = tmpDir('kanban-corrupt-twice-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'tasks.json');

  fs.writeFileSync(dataFile, '坏文件一', 'utf8');
  const first = createStore({ dataFile });
  assert.equal(first.warning.code, 'DATA_FILE_CORRUPT');

  fs.writeFileSync(dataFile, '坏文件二', 'utf8');
  const second = createStore({ dataFile });
  assert.equal(second.warning.code, 'DATA_FILE_CORRUPT');

  const backups = corruptBackups(dir);
  assert.equal(backups.length, 2, '两次损坏应留下两个备份，互不覆盖');
  const contents = backups.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).sort();
  assert.deepEqual(contents, ['坏文件一', '坏文件二'], '两个备份的原始内容都必须完整保留');
});

// ---------------------------------------------------------------------------
// 覆盖 9：HTTP 层
// ---------------------------------------------------------------------------

test('[覆盖9] 启动时损坏：/api/status 与 /api/tasks 的 warning 暴露，且不静默清空；告警在进程内保持', async (t) => {
  const dir = tmpDir('kanban-corrupt-http-');
  const dataFile = path.join(dir, 'tasks.json');
  const original = '彻底坏掉的内容 <<< >>>\n第二行\n';
  fs.writeFileSync(dataFile, original, 'utf8');

  const started = await createServer({ dataFile, port: 0 });
  t.after(async () => {
    await started.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // 只读接口不得触发任何写入：原文件应处于「已被改名」的状态
  assert.equal(fs.existsSync(dataFile), false, '损坏文件应被改名，而不是被静默清空为 []');

  const statusRes = await fetch(`${started.url}/api/status`);
  assert.equal(statusRes.status, 200);
  const status = await statusRes.json();
  assert.equal(status.ok, true, '实现口径：ok 表示服务可用，恒为 true（见 api-spec 差异说明）');
  assert.equal(status.warning.code, 'DATA_FILE_CORRUPT');
  assert.equal(path.isAbsolute(status.warning.backupPath), true);

  const listRes = await fetch(`${started.url}/api/tasks`);
  const list = await listRes.json();
  assert.deepEqual(list.tasks, []);
  assert.equal(list.warning && list.warning.code, 'DATA_FILE_CORRUPT');

  // 页面含红色告警横幅容器（前端据此渲染）
  const page = await (await fetch(`${started.url}/`)).text();
  assert.match(page, /id="warning-banner"/);

  // 备份内容完整保留
  const backups = corruptBackups(dir);
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, backups[0]), 'utf8'), original, '备份必须逐字节保留原始内容');

  // 后续写入成功后，告警在本次进程生命周期内仍保持
  const created = await fetch(`${started.url}/api/tasks`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ title: '损坏后新建' }),
  });
  assert.equal(created.status, 201);
  const after = await (await fetch(`${started.url}/api/tasks`)).json();
  assert.equal(after.tasks.length, 1);
  assert.equal(after.warning && after.warning.code, 'DATA_FILE_CORRUPT', '告警不因后续写入成功而消失');
});
