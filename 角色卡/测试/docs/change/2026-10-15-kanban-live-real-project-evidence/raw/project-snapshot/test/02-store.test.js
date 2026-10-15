'use strict';

/**
 * 交付级测试套件 02：本地 JSON 存储（src/store.js）。
 *
 * 覆盖清单：4（store 语义）、7（持久化）、8（原子写的落盘侧）、9（损坏备份的落盘侧）。
 * 每例自建 fs.mkdtemp 临时目录，例后清理，不触碰项目 data/。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const storeModule = require('../src/store.js');
const { createStore } = storeModule;

function tmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

// ---------------------------------------------------------------------------

test('[契约] store 导出形态：createStore 可用，且兼容 require(...)({...}) 直接调用', async (t) => {
  assert.equal(typeof createStore, 'function', 'createStore 应为函数');
  assert.equal(typeof storeModule, 'function', '模块本身也应可直接调用（兼容写法）');

  const dir = tmpDir('kanban-store-export-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'tasks.json');

  const viaNamed = createStore({ dataFile });
  const viaCall = storeModule({ dataFile });
  assert.equal(typeof viaNamed.list, 'function');
  assert.equal(typeof viaCall.list, 'function');
  assert.equal(viaNamed.dataFile, dataFile);
  assert.equal(path.isAbsolute(viaNamed.dataFile), true, 'dataFile 应为绝对路径');
});

test('[覆盖4] store 增删改查：list/get/create/update/remove 语义与 NOT_FOUND', async (t) => {
  const dir = tmpDir('kanban-store-crud-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'tasks.json');

  const store = createStore({ dataFile });
  assert.deepEqual(store.list(), []);
  assert.equal(store.warning, null, '正常文件无告警');
  assert.equal(store.get('不存在'), null, 'get 不存在返回 null');

  const a = store.create({ title: '任务 A', priority: 'high', tags: ['前端'] });
  const b = store.create({ title: '任务 B' });
  assert.equal(store.list().length, 2);
  assert.equal(store.get(a.id).title, '任务 A');

  store.update(a.id, { status: 'done', title: '任务 A2' });
  assert.equal(store.get(a.id).status, 'done');
  assert.equal(store.get(a.id).title, '任务 A2');

  assert.throws(() => store.update('不存在', { title: 'x' }), (err) => err.code === 'NOT_FOUND');
  assert.throws(() => store.remove('不存在'), (err) => err.code === 'NOT_FOUND');
  assert.throws(() => store.create({ title: '   ' }), (err) => err.code === 'TITLE_REQUIRED');

  const removed = store.remove(b.id);
  assert.equal(removed.id, b.id, 'remove 返回被删除任务');
  assert.equal(store.list().length, 1);
  assert.equal(store.get(b.id), null);
});

test('[覆盖4] store 返回副本：外部改动不影响内部状态（tags 深拷贝）', async (t) => {
  const dir = tmpDir('kanban-store-clone-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'tasks.json');

  const store = createStore({ dataFile });
  const created = store.create({ title: '原任务', tags: ['a'] });

  created.tags.push('被篡改');
  created.title = '被篡改';
  assert.deepEqual(store.get(created.id).tags, ['a'], 'tags 必须是副本');
  assert.equal(store.get(created.id).title, '原任务');

  const listed = store.list();
  listed[0].tags.push('列表篡改');
  assert.deepEqual(store.get(created.id).tags, ['a'], 'list() 也必须返回副本');
});

// ---------------------------------------------------------------------------
// 覆盖 7：持久化
// ---------------------------------------------------------------------------

test('[覆盖7] 持久化：新 store 实例读回任务仍在（含状态与标签）', async (t) => {
  const dir = tmpDir('kanban-store-persist-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'tasks.json');

  const store1 = createStore({ dataFile });
  const task = store1.create({ title: '持久化任务', priority: 'high', tags: ['持久'] });
  store1.update(task.id, { status: 'doing' });

  assert.equal(fs.existsSync(dataFile), true, '写入后数据文件应存在');
  const onDisk = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.equal(Array.isArray(onDisk), true, '默认落盘为任务数组');
  assert.equal(onDisk.length, 1);

  const store2 = createStore({ dataFile });
  assert.equal(store2.warning, null);
  assert.equal(store2.list().length, 1);
  assert.equal(store2.list()[0].title, '持久化任务');
  assert.equal(store2.list()[0].status, 'doing');
  assert.deepEqual(store2.list()[0].tags, ['持久']);
});

test('[覆盖7] 数据文件缺失 / 为空：视为空列表，无告警，不报错', async (t) => {
  const dir = tmpDir('kanban-store-empty-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const missing = createStore({ dataFile: path.join(dir, 'nope', 'tasks.json') });
  assert.deepEqual(missing.list(), []);
  assert.equal(missing.warning, null);

  const emptyFile = path.join(dir, 'empty.json');
  fs.writeFileSync(emptyFile, '   \n  ', 'utf8');
  const blank = createStore({ dataFile: emptyFile });
  assert.deepEqual(blank.list(), []);
  assert.equal(blank.warning, null);
});

test('[覆盖7] 兼容 {"tasks":[...]} 包装形式读取', async (t) => {
  const dir = tmpDir('kanban-store-wrapper-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'tasks.json');
  fs.writeFileSync(dataFile, JSON.stringify({
    tasks: [{ id: 'w1', title: '包装任务', status: 'done', priority: 'low', tags: ['x'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
  }), 'utf8');

  const store = createStore({ dataFile });
  assert.equal(store.warning, null);
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].title, '包装任务');
  assert.equal(store.list()[0].id, 'w1');
});

test('[覆盖7/9] 条目级不合法（缺 title）被跳过，不触发整文件备份', async (t) => {
  const dir = tmpDir('kanban-store-skip-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'tasks.json');
  fs.writeFileSync(dataFile, JSON.stringify([
    { id: 'ok', title: '有效条目', status: 'todo', priority: 'low', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'bad', status: 'todo', priority: 'low' },
    null,
    'not-an-object',
  ]), 'utf8');

  const store = createStore({ dataFile });
  assert.equal(store.warning, null, '条目级不合法不应触发整文件告警');
  assert.equal(store.list().length, 1, '仅保留合法条目');
  assert.equal(store.list()[0].id, 'ok');
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith('tasks.json.corrupt-'));
  assert.deepEqual(backups, [], '不应产生 corrupt 备份');
});
