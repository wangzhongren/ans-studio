'use strict';

/**
 * 交付级测试套件 05：原子写入（覆盖清单 8）。
 *
 * 依据 README 第 5 节：写入先落同目录临时文件 `.tasks.json.tmp-<pid>-<时间>-<随机>`，
 * fsync 后 rename 覆盖；因此（a）并发读写不会读到半截 JSON，（b）rename 失败时原文件不变，
 * （c）目录内不残留临时文件。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createStore } = require('../src/store.js');
const { createServer } = require('../src/server.js');

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function tmpLeftovers(dir) {
  return fs.readdirSync(dir).filter((f) => f.includes('.tmp-'));
}

// ---------------------------------------------------------------------------

test('[覆盖8] 模拟 fs.rename 失败：原文件内容不变，且清理临时文件', async (t) => {
  const dir = tmpDir('kanban-atomic-rename-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'tasks.json');

  const store = createStore({ dataFile });
  const task = store.create({ title: '原始任务', priority: 'high' });

  const before = fs.readFileSync(dataFile, 'utf8');
  const beforeSize = fs.statSync(dataFile).size;

  t.mock.method(fs, 'renameSync', () => {
    const err = new Error('EACCES: 模拟 rename 失败');
    err.code = 'EACCES';
    throw err;
  });

  assert.throws(
    () => store.update(task.id, { title: '这个改名不应落盘' }),
    /模拟 rename 失败/,
    'rename 失败应向上抛出',
  );

  assert.equal(fs.readFileSync(dataFile, 'utf8'), before, 'rename 失败时原文件内容必须逐字节不变');
  assert.equal(fs.statSync(dataFile).size, beforeSize);
  assert.deepEqual(tmpLeftovers(dir), [], '失败路径必须清理临时文件');
});

test('[覆盖8] 模拟 fs.rename 失败（新建路径）：数据文件不被创建为空/半截，且无临时文件残留', async (t) => {
  const dir = tmpDir('kanban-atomic-rename-create-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'tasks.json');

  const store = createStore({ dataFile });
  t.mock.method(fs, 'renameSync', () => {
    const err = new Error('EIO: 模拟 rename 失败');
    err.code = 'EIO';
    throw err;
  });

  assert.throws(() => store.create({ title: '写不进去' }), /模拟 rename 失败/);
  assert.equal(fs.existsSync(dataFile), false, 'rename 失败时不应留下半截/空数据文件');
  assert.deepEqual(tmpLeftovers(dir), [], '失败路径必须清理临时文件');
});

test('[覆盖8] 并发写入 + 持续读取：永远读到完整 JSON，不出现半截文件，且无临时文件残留', async (t) => {
  const dir = tmpDir('kanban-atomic-concurrent-');
  const dataFile = path.join(dir, 'tasks.json');
  const started = await createServer({ dataFile, port: 0 });
  t.after(async () => {
    await started.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const post = (title) => fetch(`${started.url}/api/tasks`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ title }),
  });

  // 先写一条，保证数据文件存在
  assert.equal((await post('基线任务')).status, 201);

  const parseErrors = [];
  let reads = 0;
  const reader = (async () => {
    for (let i = 0; i < 200; i += 1) {
      try {
        if (fs.existsSync(dataFile)) {
          const text = fs.readFileSync(dataFile, 'utf8');
          reads += 1;
          if (text.trim() !== '') {
            const parsed = JSON.parse(text); // 半截 JSON 会在此抛错
            assert.ok(Array.isArray(parsed), '数据文件应始终是完整 JSON 数组');
          }
        }
      } catch (err) {
        parseErrors.push(err);
      }
      await delay(1);
    }
  })();

  const N = 30;
  const results = await Promise.all(Array.from({ length: N }, (_, i) => post(`并发任务 ${i}`)));
  for (const res of results) assert.equal(res.status, 201, '并发 POST 应全部成功');
  await reader;

  assert.deepEqual(parseErrors.map((e) => e.message), [], '并发读写期间不得读到半截 / 非法 JSON');
  assert.ok(reads > 0, '读取循环应至少真正读到一次文件');

  const finalTasks = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.equal(finalTasks.length, N + 1, '全部并发写入都应落盘');
  assert.deepEqual(tmpLeftovers(dir), [], '正常路径不残留临时文件');
});

test('[覆盖8] 连续增删改后：数据文件始终是合法 JSON，目录内无 .tmp- 残留', async (t) => {
  const dir = tmpDir('kanban-atomic-steady-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dataFile = path.join(dir, 'tasks.json');

  const store = createStore({ dataFile });
  const ids = [];
  for (let i = 0; i < 10; i += 1) ids.push(store.create({ title: `任务 ${i}`, tags: ['t'] }).id);
  for (const id of ids) store.update(id, { status: 'doing' });
  for (const id of ids.slice(0, 5)) store.remove(id);

  const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.equal(parsed.length, 5);
  assert.deepEqual(tmpLeftovers(dir), []);
  assert.equal(createStore({ dataFile }).list().length, 5);
});
