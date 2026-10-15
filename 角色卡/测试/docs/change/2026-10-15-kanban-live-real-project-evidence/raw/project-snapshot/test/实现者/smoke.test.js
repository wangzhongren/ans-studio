'use strict';

/**
 * 实现者自查 smoke 测试（不替代交付测试套件）。
 * 运行：node --test test/实现者/
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const core = require('../../src/core.js');
const storeModule = require('../../src/store.js');
const serverModule = require('../../src/server.js');

const { createStore } = storeModule;
const { createServer } = serverModule;

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ---------------- core ----------------

test('core.validateTitle：空白拒绝、正常通过', () => {
  assert.equal(core.validateTitle('写文档'), true);
  assert.equal(core.validateTitle('  写文档  '), true);
  assert.equal(core.validateTitle(''), false);
  assert.equal(core.validateTitle('   '), false);
  assert.equal(core.validateTitle('\n\t'), false);
  assert.equal(core.validateTitle(null), false);
  assert.equal(core.validateTitle(123), false);
  assert.equal(core.validateTitle('字'.repeat(201)), false);
});

test('core.normalizeTags：trim、去空、去重、限长限量', () => {
  assert.deepEqual(core.normalizeTags([' 前端 ', '', '前端', '后端']), ['前端', '后端']);
  assert.deepEqual(core.normalizeTags('前端, 后端 ，前端'), ['前端', '后端']);
  assert.deepEqual(core.normalizeTags(undefined), []);
  assert.deepEqual(core.normalizeTags(['字'.repeat(40)]), ['字'.repeat(30)]);
  assert.equal(core.normalizeTags(Array.from({ length: 20 }, (_, i) => 't' + i)).length, 10);
});

test('core.normalizePriority：非法回落 medium', () => {
  assert.equal(core.normalizePriority('high'), 'high');
  assert.equal(core.normalizePriority(' LOW '), 'low');
  assert.equal(core.normalizePriority('urgent'), 'medium');
  assert.equal(core.normalizePriority(undefined), 'medium');
});

test('core.createTask / updateTask', () => {
  const task = core.createTask({ title: '  测试任务  ', tags: ['a', 'a', 'b'] });
  assert.equal(task.title, '测试任务');
  assert.equal(task.status, 'todo');
  assert.equal(task.priority, 'medium');
  assert.deepEqual(task.tags, ['a', 'b']);
  assert.match(task.id, /^[0-9a-f-]{36}$/);
  assert.equal(task.createdAt, task.updatedAt);

  assert.throws(() => core.createTask({ title: '   ' }), (err) => err.code === 'TITLE_REQUIRED');

  const updated = core.updateTask(task, { title: '改名', priority: 'high', status: 'doing' });
  assert.equal(updated.id, task.id);
  assert.equal(updated.title, '改名');
  assert.equal(updated.priority, 'high');
  assert.equal(updated.status, 'doing');
  assert.throws(() => core.updateTask(task, { title: '  ' }), (err) => err.code === 'TITLE_REQUIRED');
  assert.throws(() => core.updateTask(task, { status: 'xx' }), (err) => err.code === 'INVALID_STATUS');
});

test('core.filterTasks / sortTasks / computeStats', () => {
  const tasks = [
    { id: '1', title: '写 README', status: 'todo', priority: 'low', tags: ['文档'], createdAt: '2026-01-01T00:00:00.000Z' },
    { id: '2', title: '修 bug', status: 'doing', priority: 'high', tags: ['前端'], createdAt: '2026-01-02T00:00:00.000Z' },
    { id: '3', title: '发布 <b>版本</b>', status: 'done', priority: 'medium', tags: ['前端', '发布'], createdAt: '2026-01-03T00:00:00.000Z' },
  ];

  assert.equal(core.filterTasks(tasks, { status: 'doing' }).length, 1);
  assert.equal(core.filterTasks(tasks, { tag: '前端' }).length, 2);
  assert.equal(core.filterTasks(tasks, { q: 'bug' }).length, 1);
  assert.equal(core.filterTasks(tasks, { q: '版本' }).length, 1);
  assert.equal(core.filterTasks(tasks, {}).length, 3);

  assert.deepEqual(core.sortTasks(tasks, { sort: 'priority', order: 'desc' }).map((t) => t.id), ['2', '3', '1']);
  assert.deepEqual(core.sortTasks(tasks, { sort: 'createdAt', order: 'asc' }).map((t) => t.id), ['1', '2', '3']);
  assert.deepEqual(core.sortTasks(tasks, { sort: 'createdAt', order: 'desc' }).map((t) => t.id), ['3', '2', '1']);
  assert.deepEqual(tasks.map((t) => t.id), ['1', '2', '3'], 'sortTasks 不应改动入参顺序');

  const stats = core.computeStats(tasks);
  assert.equal(stats.total, 3);
  assert.deepEqual(stats.byStatus, { todo: 1, doing: 1, done: 1 });
  assert.deepEqual(stats.byTag, { 文档: 1, 前端: 2, 发布: 1 });
});

// ---------------- store ----------------

test('store：增删改查 + 持久化 + 原子写', () => {
  const dir = tmpDir('kanban-store-');
  const dataFile = path.join(dir, 'tasks.json');

  const store = createStore({ dataFile });
  assert.equal(store.dataFile, dataFile);
  assert.equal(store.warning, null);

  const created = store.create({ title: '买菜', priority: 'high', tags: ['生活'] });
  assert.equal(store.list().length, 1);
  assert.equal(store.get(created.id).title, '买菜');
  assert.equal(store.get('不存在'), null);

  store.update(created.id, { status: 'done' });
  assert.equal(store.get(created.id).status, 'done');
  assert.throws(() => store.update('不存在', { title: 'x' }), (err) => err.code === 'NOT_FOUND');
  assert.throws(() => store.remove('不存在'), (err) => err.code === 'NOT_FOUND');

  // 重新打开同一文件，数据仍在（持久化）
  const store2 = createStore({ dataFile });
  assert.equal(store2.list().length, 1);
  assert.equal(store2.list()[0].status, 'done');

  // 目录里不应残留临时文件（原子写只留正式文件）
  const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp-'));
  assert.deepEqual(leftovers, []);

  store2.remove(created.id);
  assert.equal(createStore({ dataFile }).list().length, 0);
});

test('store：数据文件损坏 -> 备份 + 告警，不静默清空', () => {
  const dir = tmpDir('kanban-corrupt-');
  const dataFile = path.join(dir, 'tasks.json');
  fs.writeFileSync(dataFile, '{ 这不是 JSON ', 'utf8');

  const store = createStore({ dataFile });
  assert.equal(store.warning.code, 'DATA_FILE_CORRUPT');
  assert.match(store.warning.message, /备份/);
  assert.equal(store.list().length, 0);

  const backups = fs.readdirSync(dir).filter((f) => f.startsWith('tasks.json.corrupt-'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, backups[0]), 'utf8'), '{ 这不是 JSON ', '备份文件必须保留原始内容');

  // 用合法的空数据继续写
  store.create({ title: '损坏后继续' });
  assert.equal(createStore({ dataFile }).list().length, 1);
});

test('store：结构损坏（JSON 合法但不是任务数组）同样备份', () => {
  const dir = tmpDir('kanban-shape-');
  const dataFile = path.join(dir, 'tasks.json');
  fs.writeFileSync(dataFile, JSON.stringify({ hello: 'world' }), 'utf8');

  const store = createStore({ dataFile });
  assert.equal(store.warning.code, 'DATA_FILE_CORRUPT');
  assert.equal(fs.readdirSync(dir).filter((f) => f.startsWith('tasks.json.corrupt-')).length, 1);
});

// ---------------- HTTP ----------------

test('HTTP：完整链路 新增 -> 改状态 -> 筛选/排序 -> 统计 -> 导出 -> 删除', async () => {
  const dir = tmpDir('kanban-http-');
  const dataFile = path.join(dir, 'tasks.json');
  const started = await createServer({ dataFile, port: 0 });
  const base = started.url;
  assert.equal(started.server.address().address, '127.0.0.1', '只应监听 127.0.0.1');

  try {
    const pageRes = await fetch(base + '/');
    assert.equal(pageRes.status, 200);
    assert.match(pageRes.headers.get('content-type'), /text\/html/);
    const pageHtml = await pageRes.text();
    assert.match(pageHtml, /离线中文任务看板/);

    // 空白标题：接口层拒绝
    const badRes = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });
    assert.equal(badRes.status, 400);
    assert.equal((await badRes.json()).error.code, 'TITLE_REQUIRED');

    // 非法 JSON
    const badJson = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ 不是 json',
    });
    assert.equal(badJson.status, 400);
    assert.equal((await badJson.json()).error.code, 'BAD_JSON');

    // 新增
    const createRes = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '<script>alert(1)</script>', priority: 'high', tags: ['安全', '安全', ' x '] }),
    });
    assert.equal(createRes.status, 201);
    const { task } = await createRes.json();
    assert.equal(task.title, '<script>alert(1)</script>');
    assert.deepEqual(task.tags, ['安全', 'x']);
    assert.equal(task.priority, 'high');
    assert.equal(task.status, 'todo');

    const second = await (await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '普通任务', tags: ['安全'] }),
    })).json();

    // 改状态
    const putRes = await fetch(base + '/api/tasks/' + task.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'doing' }),
    });
    assert.equal(putRes.status, 200);
    assert.equal((await putRes.json()).task.status, 'doing');

    // 不存在
    const notFound = await fetch(base + '/api/tasks/不存在', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
    assert.equal(notFound.status, 404);
    assert.equal((await notFound.json()).error.code, 'NOT_FOUND');

    // 列表 + 筛选 + 排序
    const listRes = await fetch(base + '/api/tasks');
    const listBody = await listRes.json();
    assert.equal(listBody.tasks.length, 2);
    assert.equal(listBody.warning, null);

    const filtered = await (await fetch(base + '/api/tasks?status=doing&tag=安全&q=script&sort=priority&order=desc')).json();
    assert.equal(filtered.tasks.length, 1);
    assert.equal(filtered.tasks[0].id, task.id);

    const sorted = await (await fetch(base + '/api/tasks?sort=createdAt&order=asc')).json();
    assert.equal(sorted.tasks[0].title, '<script>alert(1)</script>');

    // 统计
    const stats = await (await fetch(base + '/api/stats')).json();
    assert.equal(stats.total, 2);
    assert.deepEqual(stats.byStatus, { todo: 1, doing: 1, done: 0 });
    assert.deepEqual(stats.byTag, { 安全: 2, x: 1 });

    // 导出
    const exportRes = await fetch(base + '/api/export');
    assert.equal(exportRes.status, 200);
    assert.match(exportRes.headers.get('content-disposition'), /attachment; filename="kanban-export-\d{8}\.json"/);
    const exported = await exportRes.json();
    assert.equal(exported.count, 2);
    assert.equal(exported.tasks.length, 2);
    assert.ok(exported.exportedAt);

    // 状态
    const status = await (await fetch(base + '/api/status')).json();
    assert.equal(status.ok, true);
    assert.equal(status.dataFile, dataFile);
    assert.equal(status.warning, null);

    // 未知路径
    const unknown = await fetch(base + '/api/not-exist');
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).error.code, 'NOT_FOUND');

    // 删除
    const delRes = await fetch(base + '/api/tasks/' + second.task.id, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    assert.deepEqual(await delRes.json(), { ok: true });
    assert.equal((await (await fetch(base + '/api/tasks')).json()).tasks.length, 1);

    // 删除不存在
    assert.equal((await fetch(base + '/api/tasks/不存在', { method: 'DELETE' })).status, 404);
  } finally {
    await started.close();
  }

  // 重启服务后数据仍在
  const again = createStore({ dataFile });
  assert.equal(again.list().length, 1);
});

test('HTTP：损坏数据文件经 /api/status 与 /api/tasks 暴露告警', async () => {
  const dir = tmpDir('kanban-http-corrupt-');
  const dataFile = path.join(dir, 'tasks.json');
  fs.writeFileSync(dataFile, '坏了', 'utf8');

  const started = await createServer({ dataFile, port: 0 });
  try {
    const status = await (await fetch(started.url + '/api/status')).json();
    assert.equal(status.warning.code, 'DATA_FILE_CORRUPT');
    assert.ok(status.warning.backupPath);

    const list = await (await fetch(started.url + '/api/tasks')).json();
    assert.deepEqual(list.tasks, []);
    assert.equal(list.warning.code, 'DATA_FILE_CORRUPT');

    const page = await (await fetch(started.url + '/')).text();
    assert.match(page, /warning-banner/, '页面须有红色告警横幅容器');
  } finally {
    await started.close();
  }
});

test('HTTP：超大请求体（>1MB）返回 413 PAYLOAD_TOO_LARGE 且不落库（KANBAN-DEF-001 回归）', async () => {
  const dir = tmpDir('kanban-413-');
  const dataFile = path.join(dir, 'tasks.json');
  const started = await createServer({ dataFile, port: 0 });
  try {
    const oversized = JSON.stringify({ title: '大任务', pad: 'x'.repeat(1024 * 1024 + 64) });
    assert.ok(Buffer.byteLength(oversized) > 1024 * 1024);

    // 原始 node:http 客户端：修复前只会拿到 ECONNRESET，现在必须能观测到 413
    const seen = await new Promise((resolve) => {
      const req = http.request({
        host: '127.0.0.1',
        port: started.port,
        path: '/api/tasks',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(oversized) },
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', (err) => resolve({ error: err.code || err.message }));
      req.end(oversized);
    });
    assert.equal(seen.error, undefined, `客户端不应收到连接错误，实际：${seen.error}`);
    assert.equal(seen.status, 413);
    assert.equal(JSON.parse(seen.body).error.code, 'PAYLOAD_TOO_LARGE');

    // fetch 客户端同样应拿到 413（而不是 fetch failed / ECONNRESET）
    const res = await fetch(started.url + '/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: oversized,
    });
    assert.equal(res.status, 413);
    assert.equal((await res.json()).error.code, 'PAYLOAD_TOO_LARGE');

    // 拒绝即零副作用：超限请求体一律不落库
    assert.deepEqual((await (await fetch(started.url + '/api/tasks')).json()).tasks, []);

    // 1MB 上限语义不变：恰好 1MB 的请求体仍被接受
    const prefix = '{"title":"边界任务","pad":"';
    const suffix = '"}';
    const boundary = prefix + 'y'.repeat(1024 * 1024 - Buffer.byteLength(prefix) - Buffer.byteLength(suffix)) + suffix;
    assert.equal(Buffer.byteLength(boundary), 1024 * 1024);
    const boundaryRes = await fetch(started.url + '/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: boundary,
    });
    assert.equal(boundaryRes.status, 201, '恰好 1MB 不应被判超限');
    assert.equal((await (await fetch(started.url + '/api/tasks')).json()).tasks.length, 1);
  } finally {
    await started.close();
  }
});

test('前端资源：无外链、无 HTML 字符串注入用户数据', () => {
  const publicDir = path.join(__dirname, '..', '..', 'src', 'public');
  for (const name of fs.readdirSync(publicDir)) {
    const content = fs.readFileSync(path.join(publicDir, name), 'utf8');
    assert.equal(/https?:\/\//.test(content), false, `${name} 不得包含 http(s) 外链`);
  }
  const appJs = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');
  assert.equal(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(appJs), false, 'app.js 不得做 HTML 字符串注入');
});
