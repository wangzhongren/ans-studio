'use strict';

/**
 * 交付级测试套件 03：HTTP 接口（src/server.js + src/store.js + src/core.js）。
 *
 * 覆盖清单：1（接口层）、2、3、4、5、6、7、10（接口侧）、11、12。
 * 每例自起临时端口（port:0）+ fs.mkdtemp 临时数据文件，例后 close()+清理，不留常驻进程。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const serverModule = require('../src/server.js');
const { createServer } = serverModule;

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** 超过 1 MiB 的请求体（用于 413 相关用例） */
const OVERSIZED_BODY = JSON.stringify({ title: '大任务', pad: 'x'.repeat(1024 * 1024 + 64) });

async function bootstrap(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dataFile = path.join(dir, 'tasks.json');
  const started = await createServer({ dataFile, port: 0 });
  return { started, dir, dataFile, url: started.url };
}

function teardown(t, ctx) {
  t.after(async () => {
    await ctx.started.close();
    fs.rmSync(ctx.dir, { recursive: true, force: true });
  });
}

function post(url, body) {
  return fetch(`${url}/api/tasks`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function put(url, id, body) {
  return fetch(`${url}/api/tasks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function del(url, id) {
  return fetch(`${url}/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

async function listTasks(url, query) {
  const res = await fetch(`${url}/api/tasks${query || ''}`);
  assert.equal(res.status, 200);
  return res.json();
}

// ---------------------------------------------------------------------------
// 覆盖 1：接口层空白标题
// ---------------------------------------------------------------------------

test('[覆盖1] POST /api/tasks：空白 / 缺失 / 非字符串标题一律 400 TITLE_REQUIRED', async (t) => {
  const ctx = await bootstrap('kanban-api-title-');
  teardown(t, ctx);

  const badTitles = ['', '   ', '\t\n', '\t', '\u3000', null, 123, 0, true, [], {}];
  for (const title of badTitles) {
    const res = await post(ctx.url, { title });
    assert.equal(res.status, 400, `title=${JSON.stringify(title)} 应 400`);
    const body = await res.json();
    assert.equal(body.error.code, 'TITLE_REQUIRED', `title=${JSON.stringify(title)} 应 TITLE_REQUIRED`);
    assert.equal(typeof body.error.message, 'string');
  }

  // 字段完全缺失
  const missing = await post(ctx.url, { priority: 'high' });
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error.code, 'TITLE_REQUIRED');

  // 空请求体也视为缺 title
  const emptyBody = await post(ctx.url, '');
  assert.equal(emptyBody.status, 400);
  assert.equal((await emptyBody.json()).error.code, 'TITLE_REQUIRED');

  // 拒绝后必须零副作用
  const list = await listTasks(ctx.url);
  assert.deepEqual(list.tasks, [], '被拒绝的写入不得落库');
});

test('[覆盖1] PUT /api/tasks/:id：空白 / 非字符串标题一律 400 TITLE_REQUIRED，且不改变原任务', async (t) => {
  const ctx = await bootstrap('kanban-api-put-title-');
  teardown(t, ctx);

  const created = (await (await post(ctx.url, { title: '原任务' })).json()).task;

  for (const title of ['', '   ', '\t\n', '\u3000', null, 123, [], {}]) {
    const res = await put(ctx.url, created.id, { title });
    assert.equal(res.status, 400, `title=${JSON.stringify(title)} 应 400`);
    assert.equal((await res.json()).error.code, 'TITLE_REQUIRED');
  }
  // 明确传 title 为 undefined（非法）也应拒绝
  const res = await put(ctx.url, created.id, { title: '  ', status: 'doing' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'TITLE_REQUIRED');

  const current = (await listTasks(ctx.url)).tasks.find((x) => x.id === created.id);
  assert.equal(current.title, '原任务', '被拒绝的更新不得改动标题');
  assert.equal(current.status, 'todo', '同一请求里的 status 也不得生效（原子拒绝）');
});

// ---------------------------------------------------------------------------
// 覆盖 2、3：状态切换与编辑
// ---------------------------------------------------------------------------

test('[覆盖2] 三状态 todo→doing→done→todo 可来回切换（PUT status）', async (t) => {
  const ctx = await bootstrap('kanban-api-status-');
  teardown(t, ctx);

  const task = (await (await post(ctx.url, { title: '状态机任务' })).json()).task;
  assert.equal(task.status, 'todo', '默认 todo');

  for (const next of ['doing', 'done', 'todo', 'done']) {
    const res = await put(ctx.url, task.id, { status: next });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.task.status, next, `应可切换到 ${next}`);
    assert.equal(body.task.id, task.id);
  }

  // 非法状态被拒
  const bad = await put(ctx.url, task.id, { status: 'archived' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'INVALID_STATUS');
});

test('[覆盖3] 编辑标题 / 优先级 / 标签生效，updatedAt 变化，createdAt 不变', async (t) => {
  const ctx = await bootstrap('kanban-api-edit-');
  teardown(t, ctx);

  const created = (await (await post(ctx.url, { title: '旧标题', priority: 'low', tags: ['old'] })).json()).task;
  await delay(15);

  const res = await put(ctx.url, created.id, { title: '新标题', priority: 'high', tags: ['新标签A', '新标签B'] });
  assert.equal(res.status, 200);
  const edited = (await res.json()).task;

  assert.equal(edited.title, '新标题');
  assert.equal(edited.priority, 'high');
  assert.deepEqual(edited.tags, ['新标签A', '新标签B']);
  assert.equal(edited.createdAt, created.createdAt, 'createdAt 不可变');
  assert.notEqual(edited.updatedAt, created.updatedAt, 'updatedAt 必须变化');

  // 落盘也反映了编辑
  const persisted = (await listTasks(ctx.url)).tasks.find((x) => x.id === created.id);
  assert.equal(persisted.title, '新标题');
  assert.deepEqual(persisted.tags, ['新标签A', '新标签B']);
});

// ---------------------------------------------------------------------------
// 覆盖 4：删除
// ---------------------------------------------------------------------------

test('[覆盖4] DELETE：成功返回 {ok:true}，再次删除 404 NOT_FOUND；PUT/GET 不存在同样 404', async (t) => {
  const ctx = await bootstrap('kanban-api-delete-');
  teardown(t, ctx);

  const task = (await (await post(ctx.url, { title: '待删除' })).json()).task;

  const first = await del(ctx.url, task.id);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ok: true });

  const second = await del(ctx.url, task.id);
  assert.equal(second.status, 404);
  assert.equal((await second.json()).error.code, 'NOT_FOUND');

  const putMissing = await put(ctx.url, '不存在的-id', { title: 'x' });
  assert.equal(putMissing.status, 404);
  assert.equal((await putMissing.json()).error.code, 'NOT_FOUND');

  assert.equal((await listTasks(ctx.url)).tasks.length, 0);
});

// ---------------------------------------------------------------------------
// 覆盖 5、6：筛选、排序、统计
// ---------------------------------------------------------------------------

test('[覆盖5] GET /api/tasks：status / tag / q 筛选与 createdAt / priority × asc|desc 排序', async (t) => {
  const ctx = await bootstrap('kanban-api-filter-');
  teardown(t, ctx);

  // 逐个创建并间隔，保证 createdAt 严格递增且可判定
  const made = [];
  made.push((await (await post(ctx.url, { title: '写文档', priority: 'low', tags: ['文档'] })).json()).task);
  await delay(12);
  made.push((await (await post(ctx.url, { title: '修 Login Bug', priority: 'high', tags: ['前端', '紧急'] })).json()).task);
  await delay(12);
  made.push((await (await post(ctx.url, { title: '发布版本', priority: 'medium', tags: ['前端'] })).json()).task);

  // status 筛选（注意：默认排序为 createdAt + desc，故按集合比较）
  const todoIds = (await listTasks(ctx.url, '?status=todo')).tasks.map((x) => x.id);
  assert.equal(todoIds.length, 3, 'status=todo 应命中全部 3 条');
  assert.deepEqual(todoIds.slice().sort(), made.map((x) => x.id).sort());
  await put(ctx.url, made[1].id, { status: 'doing' });
  const doing = await listTasks(ctx.url, '?status=doing');
  assert.deepEqual(doing.tasks.map((x) => x.id), [made[1].id]);
  assert.equal((await listTasks(ctx.url, '?status=all')).tasks.length, 3, 'all 不筛选');

  // tag 筛选（精确匹配）
  assert.equal((await listTasks(ctx.url, '?tag=%E5%89%8D%E7%AB%AF')).tasks.length, 2, '标签「前端」命中 2 条');
  assert.equal((await listTasks(ctx.url, '?tag=all')).tasks.length, 3);
  assert.equal((await listTasks(ctx.url, '?tag=%E4%B8%8D%E5%AD%98%E5%9C%A8')).tasks.length, 0);

  // 关键字 q（大小写不敏感、命中标题或标签）
  assert.deepEqual((await listTasks(ctx.url, '?q=login')).tasks.map((x) => x.id), [made[1].id]);
  assert.deepEqual((await listTasks(ctx.url, '?q=LOGIN')).tasks.map((x) => x.id), [made[1].id]);
  assert.deepEqual((await listTasks(ctx.url, '?q=%E7%B4%A7%E6%80%A5')).tasks.map((x) => x.id), [made[1].id], '命中标签');
  assert.equal((await listTasks(ctx.url, '?q=%E4%B8%8D%E5%AD%98%E5%9C%A8')).tasks.length, 0);

  // 组合筛选（AND）
  assert.deepEqual(
    (await listTasks(ctx.url, '?status=doing&tag=%E5%89%8D%E7%AB%AF&q=bug')).tasks.map((x) => x.id),
    [made[1].id],
  );

  // 排序：createdAt
  assert.deepEqual((await listTasks(ctx.url, '?sort=createdAt&order=asc')).tasks.map((x) => x.id), [made[0].id, made[1].id, made[2].id]);
  assert.deepEqual((await listTasks(ctx.url, '?sort=createdAt&order=desc')).tasks.map((x) => x.id), [made[2].id, made[1].id, made[0].id]);
  // 默认 createdAt + desc
  assert.deepEqual((await listTasks(ctx.url)).tasks.map((x) => x.id), [made[2].id, made[1].id, made[0].id]);

  // 排序：priority
  assert.deepEqual((await listTasks(ctx.url, '?sort=priority&order=asc')).tasks.map((x) => x.id), [made[0].id, made[2].id, made[1].id]);
  assert.deepEqual((await listTasks(ctx.url, '?sort=priority&order=desc')).tasks.map((x) => x.id), [made[1].id, made[2].id, made[0].id]);
});

test('[覆盖6] GET /api/stats：total / byStatus 三键 / byTag 计数', async (t) => {
  const ctx = await bootstrap('kanban-api-stats-');
  teardown(t, ctx);

  const a = (await (await post(ctx.url, { title: 'A', tags: ['前端'] })).json()).task;
  await post(ctx.url, { title: 'B', tags: ['前端', '后端'] });
  await post(ctx.url, { title: 'C', tags: ['后端'] });
  await put(ctx.url, a.id, { status: 'done' });

  const res = await fetch(`${ctx.url}/api/stats`);
  assert.equal(res.status, 200);
  const stats = await res.json();
  assert.equal(stats.total, 3);
  assert.deepEqual(stats.byStatus, { todo: 2, doing: 0, done: 1 });
  assert.deepEqual(stats.byTag, { 前端: 2, 后端: 2 });
});

// ---------------------------------------------------------------------------
// 覆盖 11：导出
// ---------------------------------------------------------------------------

test('[覆盖11] GET /api/export：返回全部任务 + Content-Disposition 附件头，不受筛选参数影响', async (t) => {
  const ctx = await bootstrap('kanban-api-export-');
  teardown(t, ctx);

  await post(ctx.url, { title: '导出一', tags: ['x'] });
  const second = (await (await post(ctx.url, { title: '导出二' })).json()).task;
  await put(ctx.url, second.id, { status: 'done' });

  const res = await fetch(`${ctx.url}/api/export?status=todo&tag=none`);
  assert.equal(res.status, 200);
  assert.match(
    res.headers.get('content-disposition'),
    /^attachment; filename="kanban-export-\d{8}\.json"$/,
    '附件头格式须为 attachment; filename="kanban-export-<YYYYMMDD>.json"',
  );
  const body = await res.json();
  assert.equal(body.count, 2, '导出不受筛选影响');
  assert.equal(body.tasks.length, 2);
  assert.ok(body.exportedAt && !Number.isNaN(Date.parse(body.exportedAt)), 'exportedAt 应为 ISO 时间');
  assert.deepEqual(body.tasks.map((x) => x.title).sort(), ['导出一', '导出二']);
});

// ---------------------------------------------------------------------------
// 覆盖 12 与其它：状态、绑定、静态资源、错误处理
// ---------------------------------------------------------------------------

test('[覆盖12] 只监听 127.0.0.1；/api/status 返回 ok/dataFile/warning', async (t) => {
  const ctx = await bootstrap('kanban-api-status-');
  teardown(t, ctx);

  assert.equal(ctx.started.server.address().address, '127.0.0.1', '服务只能绑定 127.0.0.1');
  assert.equal(ctx.started.port, ctx.started.server.address().port);

  const res = await fetch(`${ctx.url}/api/status`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.dataFile, ctx.dataFile);
  assert.equal(path.isAbsolute(body.dataFile), true);
  assert.equal(body.warning, null);
});

test('静态页面与资源：/ 返回中文看板页，/app.js、/style.css 可用，/favicon.ico 204', async (t) => {
  const ctx = await bootstrap('kanban-api-static-');
  teardown(t, ctx);

  const page = await fetch(`${ctx.url}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html; charset=utf-8/);
  const html = await page.text();
  assert.match(html, /离线中文任务看板/);
  assert.match(html, /id="warning-banner"/, '页面须包含告警横幅容器');

  const js = await fetch(`${ctx.url}/app.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /text\/javascript/);

  const css = await fetch(`${ctx.url}/style.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);

  const favicon = await fetch(`${ctx.url}/favicon.ico`);
  assert.equal(favicon.status, 204);
});

test('错误处理：BAD_JSON / METHOD_NOT_ALLOWED / 未知路径 404', async (t) => {
  const ctx = await bootstrap('kanban-api-errors-');
  teardown(t, ctx);

  const badJson = await fetch(`${ctx.url}/api/tasks`, { method: 'POST', headers: JSON_HEADERS, body: '{ 不是 json' });
  assert.equal(badJson.status, 400);
  assert.equal((await badJson.json()).error.code, 'BAD_JSON');

  const method = await fetch(`${ctx.url}/api/tasks`, { method: 'DELETE' });
  assert.equal(method.status, 405);
  assert.equal((await method.json()).error.code, 'METHOD_NOT_ALLOWED');

  const unknown = await fetch(`${ctx.url}/api/not-exist`);
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, 'NOT_FOUND');
});

test('超大请求体（>1MB）安全性质：无论客户端看到什么，都不得落库', async (t) => {
  const ctx = await bootstrap('kanban-api-oversize-safe-');
  teardown(t, ctx);

  try {
    await fetch(`${ctx.url}/api/tasks`, { method: 'POST', headers: JSON_HEADERS, body: OVERSIZED_BODY });
  } catch (err) {
    // 客户端可能收到连接被重置（详见下一条契约用例）；此处只关心零副作用
  }
  const list = await (await fetch(`${ctx.url}/api/tasks`)).json();
  assert.deepEqual(list.tasks, [], '超大请求体不得写入任何任务');
});

// 注：本用例标题在 KANBAN-DEF-001 修复后的复核轮更新（原为“实测为缺陷”）。
// 断言体自首版起从未改动——它现在通过，是因为实现已被修复（超限先写回 413 再 drain），
// 不再返回 ECONNRESET。详见 角色卡/测试者/docs/fix/KANBAN-DEF-001.md。
test('[README §4] 超大请求体应返回 413 PAYLOAD_TOO_LARGE（KANBAN-DEF-001 修复复核）', async (t) => {
  const ctx = await bootstrap('kanban-api-oversize-contract-');
  teardown(t, ctx);

  let status = null;
  let code = null;
  let netError = null;
  try {
    const res = await fetch(`${ctx.url}/api/tasks`, { method: 'POST', headers: JSON_HEADERS, body: OVERSIZED_BODY });
    status = res.status;
    const body = await res.json().catch(() => ({}));
    code = body && body.error ? body.error.code : null;
  } catch (err) {
    netError = err;
  }

  assert.equal(
    status, 413,
    `README §4 承诺「请求体超过 1MB 返回 413 PAYLOAD_TOO_LARGE」，实际 status=${status}`
    + `，netError=${netError ? (netError.code || netError.message) : 'null'}`,
  );
  assert.equal(code, 'PAYLOAD_TOO_LARGE');
});
