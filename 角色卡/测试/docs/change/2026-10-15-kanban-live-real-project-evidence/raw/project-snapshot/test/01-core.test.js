'use strict';

/**
 * 交付级测试套件 01：领域逻辑（src/core.js）。
 *
 * 覆盖清单：1（两层的「核心校验」层）、2、3、5、6（核心层）。
 * 只依赖 README 冻结契约与 src/core.js 的导出名；不依赖实现者自我判断。
 * 运行：node --test（自动发现 test/**\/*.test.js）
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../src/core.js');

const {
  validateTitle,
  normalizeTags,
  normalizePriority,
  createTask,
  updateTask,
  filterTasks,
  sortTasks,
  computeStats,
} = core;

// ---------------------------------------------------------------------------
// 覆盖 1：标题校验
// ---------------------------------------------------------------------------

test('[覆盖1] validateTitle：空 / 全空白 / 非字符串一律非法，1–200 字符合法', () => {
  assert.equal(validateTitle('任务'), true);
  assert.equal(validateTitle('  边界任务  '), true);
  assert.equal(validateTitle('a'.repeat(200)), true, '200 字符应合法（上界含）');

  assert.equal(validateTitle(''), false);
  assert.equal(validateTitle('   '), false);
  assert.equal(validateTitle('\t'), false);
  assert.equal(validateTitle('\n'), false);
  assert.equal(validateTitle('\t\n\r'), false);
  assert.equal(validateTitle('\u3000'), false, '全角空格 trim 后也应视为空白');

  assert.equal(validateTitle('a'.repeat(201)), false, '201 字符应非法（上界外）');

  assert.equal(validateTitle(null), false);
  assert.equal(validateTitle(undefined), false);
  assert.equal(validateTitle(123), false);
  assert.equal(validateTitle({}), false);
  assert.equal(validateTitle([]), false);
  assert.equal(validateTitle(true), false);
  assert.equal(validateTitle(Symbol('x')), false, 'Symbol 不能抛异常');
});

test('[覆盖1] createTask：空白 / 缺失 / 非字符串标题抛 TITLE_REQUIRED，超长抛 TITLE_TOO_LONG', () => {
  for (const bad of [{}, { title: '' }, { title: '   ' }, { title: '\t\n' }, { title: null },
    { title: 123 }, { title: [] }, { title: {} }, { title: true }]) {
    assert.throws(
      () => createTask(bad),
      (err) => err.code === 'TITLE_REQUIRED',
      `输入 ${JSON.stringify(bad)} 应抛 TITLE_REQUIRED`,
    );
  }
  assert.throws(
    () => createTask({ title: 'a'.repeat(201) }),
    (err) => err.code === 'TITLE_TOO_LONG',
  );
  // 纯字符串入参视为标题
  assert.throws(() => createTask('   '), (err) => err.code === 'TITLE_REQUIRED');
});

// ---------------------------------------------------------------------------
// 覆盖 1：标签 / 优先级规整
// ---------------------------------------------------------------------------

test('[覆盖1] normalizeTags：trim / 去空 / 去重 / 单标签≤30 截断 / 最多 10 个', () => {
  assert.deepEqual(normalizeTags([' 前端 ', '', '前端', '后端']), ['前端', '后端']);
  assert.deepEqual(normalizeTags('前端, 后端 ，前端'), ['前端', '后端'], '兼容中英文逗号');
  assert.deepEqual(normalizeTags(undefined), []);
  assert.deepEqual(normalizeTags(null), []);
  assert.deepEqual(normalizeTags(42), []);
  assert.deepEqual(normalizeTags('   '), []);
  assert.deepEqual(normalizeTags(['字'.repeat(31)]), ['字'.repeat(30)], '>30 截断到 30');
  assert.deepEqual(normalizeTags(['字'.repeat(30)]), ['字'.repeat(30)], '=30 保留');
  assert.equal(normalizeTags(Array.from({ length: 20 }, (_, i) => 't' + i)).length, 10, '最多 10 个');
  assert.deepEqual(normalizeTags([1, 'a', {}, 'b', null]), ['a', 'b'], '非字符串项丢弃');
});

test('[覆盖1] normalizePriority：忽略大小写与空白，非法一律回落 medium', () => {
  assert.equal(normalizePriority('high'), 'high');
  assert.equal(normalizePriority(' LOW '), 'low');
  assert.equal(normalizePriority('Medium'), 'medium');
  assert.equal(normalizePriority('urgent'), 'medium');
  assert.equal(normalizePriority(''), 'medium');
  assert.equal(normalizePriority(undefined), 'medium');
  assert.equal(normalizePriority(null), 'medium');
  assert.equal(normalizePriority(3), 'medium');
});

// ---------------------------------------------------------------------------
// 覆盖 2、3：创建与更新
// ---------------------------------------------------------------------------

test('[覆盖2/3] createTask：默认值、trim、id/时间戳形态正确', () => {
  const task = createTask({ title: '  写文档  ', tags: '前端, 前端, 后端' });

  assert.equal(task.title, '写文档', '标题应 trim');
  assert.equal(task.status, 'todo', '默认状态 todo');
  assert.equal(task.priority, 'medium', '默认优先级 medium');
  assert.deepEqual(task.tags, ['前端', '后端']);
  assert.match(task.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'id 应为 UUID');
  assert.equal(task.createdAt, task.updatedAt, '创建时两个时间戳相同');
  assert.equal(new Date(task.createdAt).toISOString(), task.createdAt, 'createdAt 应为 ISO8601');

  const fixed = createTask({ title: 'x', priority: 'high', status: 'doing' }, new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(fixed.priority, 'high');
  assert.equal(fixed.status, 'doing');
  assert.equal(fixed.createdAt, '2026-01-01T00:00:00.000Z', 'now 可注入');
});

test('[覆盖3] updateTask：就地更新、返回同一引用、只识别四个白名单字段、刷新 updatedAt', () => {
  const task = createTask({ title: '原标题', priority: 'low', tags: ['a'] }, new Date('2026-01-01T00:00:00.000Z'));
  const originalId = task.id;
  const originalCreatedAt = task.createdAt;

  const returned = updateTask(
    task,
    { title: '新标题', priority: 'high', tags: 'x, y', status: 'doing', id: 'hack', createdAt: '1999' },
    new Date('2026-02-02T00:00:00.000Z'),
  );

  assert.equal(returned, task, 'updateTask 就地更新并返回同一对象引用');
  assert.equal(task.title, '新标题');
  assert.equal(task.priority, 'high');
  assert.deepEqual(task.tags, ['x', 'y']);
  assert.equal(task.status, 'doing');
  assert.equal(task.id, originalId, 'id 不可被覆盖');
  assert.equal(task.createdAt, originalCreatedAt, 'createdAt 不可被覆盖');
  assert.equal(task.updatedAt, '2026-02-02T00:00:00.000Z', 'updatedAt 应用注入时间刷新');
  assert.notEqual(task.updatedAt, task.createdAt, 'updatedAt 应变化');
});

test('[覆盖3] updateTask：空白标题抛 TITLE_REQUIRED，非法状态抛 INVALID_STATUS，非法任务对象抛 INVALID_TASK', () => {
  const task = createTask({ title: '有效标题' });
  assert.throws(() => updateTask(task, { title: '   ' }), (err) => err.code === 'TITLE_REQUIRED');
  assert.throws(() => updateTask(task, { title: 42 }), (err) => err.code === 'TITLE_REQUIRED');
  assert.throws(() => updateTask(task, { title: 'a'.repeat(201) }), (err) => err.code === 'TITLE_TOO_LONG');
  assert.throws(() => updateTask(task, { status: 'xx' }), (err) => err.code === 'INVALID_STATUS');
  assert.throws(() => updateTask(task, { status: 3 }), (err) => err.code === 'INVALID_STATUS');
  assert.throws(() => updateTask(null, { status: 'doing' }), (err) => err.code === 'INVALID_TASK');

  // 未提供 title 时不应因 title 报错（patch 为空对象也允许）
  assert.doesNotThrow(() => updateTask(task, {}));
});

// ---------------------------------------------------------------------------
// 覆盖 5：筛选与排序
// ---------------------------------------------------------------------------

function fixtureTasks() {
  return [
    { id: '1', title: '写 README', status: 'todo', priority: 'low', tags: ['文档'], createdAt: '2026-01-01T00:00:00.000Z' },
    { id: '2', title: '修 Bug', status: 'doing', priority: 'high', tags: ['前端'], createdAt: '2026-01-02T00:00:00.000Z' },
    { id: '3', title: '发布 <b>版本</b>', status: 'done', priority: 'medium', tags: ['前端', '发布'], createdAt: '2026-01-03T00:00:00.000Z' },
  ];
}

test('[覆盖5] filterTasks：按 status / tag / q（大小写不敏感、命中标题或标签），空值不筛选', () => {
  const tasks = fixtureTasks();

  assert.equal(filterTasks(tasks, { status: 'doing' }).length, 1);
  assert.equal(filterTasks(tasks, { status: 'all' }).length, 3, 'all 等同不筛选');
  assert.equal(filterTasks(tasks, { tag: '前端' }).length, 2);
  assert.equal(filterTasks(tasks, { tag: 'all' }).length, 3);
  assert.equal(filterTasks(tasks, { tag: '不存在' }).length, 0);
  assert.equal(filterTasks(tasks, { q: 'bug' }).length, 1, '大小写不敏感');
  assert.equal(filterTasks(tasks, { q: 'BUG' }).length, 1);
  assert.equal(filterTasks(tasks, { q: '版本' }).length, 1, '可命中标题中的子串');
  assert.equal(filterTasks(tasks, { q: '发布' }).length, 1, '可命中标签');
  assert.equal(filterTasks(tasks, { q: '前端' }).length, 2, '标签命中');
  assert.equal(filterTasks(tasks, {}).length, 3);
  assert.equal(filterTasks(tasks, { status: 'done', tag: '前端', q: 'version' }).length, 0, '多条件为 AND');

  const out = filterTasks(tasks, { status: 'todo' });
  assert.notEqual(out, tasks, '应返回新数组');
  assert.deepEqual(tasks.map((t) => t.id), ['1', '2', '3'], '不应改动入参');
});

test('[覆盖5] sortTasks：createdAt / priority × asc / desc，稳定且不改动入参', () => {
  const tasks = fixtureTasks();

  assert.deepEqual(sortTasks(tasks, { sort: 'createdAt', order: 'asc' }).map((t) => t.id), ['1', '2', '3']);
  assert.deepEqual(sortTasks(tasks, { sort: 'createdAt', order: 'desc' }).map((t) => t.id), ['3', '2', '1']);
  assert.deepEqual(sortTasks(tasks, { sort: 'priority', order: 'asc' }).map((t) => t.id), ['1', '3', '2']);
  assert.deepEqual(sortTasks(tasks, { sort: 'priority', order: 'desc' }).map((t) => t.id), ['2', '3', '1']);

  // 默认：createdAt + desc
  assert.deepEqual(sortTasks(tasks).map((t) => t.id), ['3', '2', '1']);
  // 不可识别值回落默认
  assert.deepEqual(sortTasks(tasks, { sort: 'nope', order: 'nope' }).map((t) => t.id), ['3', '2', '1']);

  const out = sortTasks(tasks, { sort: 'priority', order: 'asc' });
  assert.notEqual(out, tasks, '应返回新数组');
  assert.deepEqual(tasks.map((t) => t.id), ['1', '2', '3'], '不应改动入参顺序');
});

test('[覆盖5] sortTasks：同优先级时按 createdAt 再按 id 确定性排序', () => {
  const list = [
    { id: 'b', title: 'b', priority: 'high', createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 'a', title: 'a', priority: 'high', createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 'c', title: 'c', priority: 'high', createdAt: '2026-01-01T00:00:00.000Z' },
  ];
  assert.deepEqual(sortTasks(list, { sort: 'priority', order: 'asc' }).map((t) => t.id), ['c', 'a', 'b']);
  assert.deepEqual(sortTasks(list, { sort: 'priority', order: 'desc' }).map((t) => t.id), ['b', 'a', 'c']);
});

// ---------------------------------------------------------------------------
// 覆盖 6：统计
// ---------------------------------------------------------------------------

test('[覆盖6] computeStats：total / byStatus 恒含三键 / byTag 计数正确', () => {
  const tasks = fixtureTasks();
  const stats = computeStats(tasks);

  assert.equal(stats.total, 3);
  assert.deepEqual(stats.byStatus, { todo: 1, doing: 1, done: 1 });
  assert.deepEqual(stats.byTag, { 文档: 1, 前端: 2, 发布: 1 });

  const empty = computeStats([]);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.byStatus, { todo: 0, doing: 0, done: 0 }, '无任务时三键仍在且为 0');
  assert.deepEqual(empty.byTag, {});

  assert.deepEqual(computeStats(null).byStatus, { todo: 0, doing: 0, done: 0 }, '非数组入参安全');
});
