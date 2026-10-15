'use strict';

/**
 * 核心领域逻辑（零第三方依赖，仅使用 Node 内置模块）。
 *
 * 导出（名称已冻结，不得改名）：
 *   validateTitle / normalizeTags / normalizePriority / createTask /
 *   updateTask / filterTasks / sortTasks / computeStats
 */

const crypto = require('node:crypto');

const STATUSES = Object.freeze(['todo', 'doing', 'done']);
const PRIORITIES = Object.freeze(['low', 'medium', 'high']);

const STATUS_LABELS = Object.freeze({ todo: '待办', doing: '进行中', done: '已完成' });
const PRIORITY_LABELS = Object.freeze({ low: '低', medium: '中', high: '高' });

const DEFAULT_STATUS = 'todo';
const DEFAULT_PRIORITY = 'medium';

const TITLE_MIN_LENGTH = 1;
const TITLE_MAX_LENGTH = 200;
const TAG_MAX_LENGTH = 30;
const TAGS_MAX_COUNT = 10;

const PRIORITY_RANK = Object.freeze({ low: 1, medium: 2, high: 3 });

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** 构造带错误码的错误对象（错误码供 HTTP 层映射状态码） */
function domainError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function titleRequiredError() {
  return domainError('TITLE_REQUIRED', '任务标题必填，不能为空或全为空白字符');
}

function titleTooLongError() {
  return domainError('TITLE_TOO_LONG', `任务标题过长，最多 ${TITLE_MAX_LENGTH} 个字符`);
}

/**
 * 校验标题：trim 后长度必须为 1–200 字符。
 * @param {unknown} title
 * @returns {boolean} 合法返回 true，否则返回 false
 */
function validateTitle(title) {
  if (typeof title !== 'string') return false;
  const trimmed = title.trim();
  return trimmed.length >= TITLE_MIN_LENGTH && trimmed.length <= TITLE_MAX_LENGTH;
}

/** 标题输入不合法时抛出带错误码的异常，用于 create/update */
function assertTitle(title) {
  if (typeof title !== 'string' || title.trim().length < TITLE_MIN_LENGTH) {
    throw titleRequiredError();
  }
  if (title.trim().length > TITLE_MAX_LENGTH) {
    throw titleTooLongError();
  }
  return title.trim();
}

/**
 * 规整标签：接受数组或逗号分隔字符串；trim、去空、去重、单个截断到 30 字符、最多 10 个。
 * @param {unknown} tags
 * @returns {string[]}
 */
function normalizeTags(tags) {
  let input;
  if (Array.isArray(tags)) {
    input = tags;
  } else if (typeof tags === 'string') {
    input = tags.split(/[,，]/);
  } else {
    input = [];
  }

  const result = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    let tag = raw.trim();
    if (!tag) continue;
    if (tag.length > TAG_MAX_LENGTH) tag = tag.slice(0, TAG_MAX_LENGTH);
    if (result.includes(tag)) continue;
    result.push(tag);
    if (result.length >= TAGS_MAX_COUNT) break;
  }
  return result;
}

/**
 * 规整优先级：只接受 low/medium/high（忽略大小写与首尾空白），其它一律回落到 medium。
 * @param {unknown} priority
 * @returns {'low'|'medium'|'high'}
 */
function normalizePriority(priority) {
  if (typeof priority === 'string') {
    const value = priority.trim().toLowerCase();
    if (PRIORITIES.includes(value)) return value;
  }
  return DEFAULT_PRIORITY;
}

/** 规整状态：只接受 todo/doing/done（忽略大小写与首尾空白），其它返回 null */
function normalizeStatusStrict(status) {
  if (typeof status === 'string') {
    const value = status.trim().toLowerCase();
    if (STATUSES.includes(value)) return value;
  }
  return null;
}

function toIsoString(now) {
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'number' || typeof now === 'string') return new Date(now).toISOString();
  return new Date().toISOString();
}

/**
 * 创建任务对象。
 * @param {{title?:string, priority?:string, tags?:unknown, status?:string}|string} input 传字符串时视为标题
 * @param {Date|number|string} [now] 可注入时间（便于测试）
 * @returns {{id:string,title:string,status:string,priority:string,tags:string[],createdAt:string,updatedAt:string}}
 */
function createTask(input, now) {
  const source = typeof input === 'string'
    ? { title: input }
    : (input && typeof input === 'object' ? input : {});

  const title = assertTitle(source.title);
  const status = normalizeStatusStrict(source.status) || DEFAULT_STATUS;
  const timestamp = toIsoString(now);

  return {
    id: crypto.randomUUID(),
    title,
    status,
    priority: normalizePriority(source.priority),
    tags: normalizeTags(source.tags),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * 更新任务（就地更新并返回同一个对象引用）。
 * patch 中只识别 title / priority / tags / status；id、createdAt 不可被覆盖。
 * @param {object} task
 * @param {object} [patch]
 * @param {Date|number|string} [now]
 */
function updateTask(task, patch, now) {
  if (!task || typeof task !== 'object') {
    throw domainError('INVALID_TASK', '待更新的任务对象不合法');
  }
  const next = patch && typeof patch === 'object' ? patch : {};

  if (hasOwn(next, 'title')) {
    task.title = assertTitle(next.title);
  }
  if (hasOwn(next, 'priority')) {
    task.priority = normalizePriority(next.priority);
  }
  if (hasOwn(next, 'tags')) {
    task.tags = normalizeTags(next.tags);
  }
  if (hasOwn(next, 'status')) {
    const status = normalizeStatusStrict(next.status);
    if (!status) {
      throw domainError('INVALID_STATUS', '任务状态只能是 待办/进行中/已完成（todo/doing/done）');
    }
    task.status = status;
  }

  task.updatedAt = toIsoString(now);
  return task;
}

/**
 * 筛选任务。
 * @param {object[]} tasks
 * @param {{status?:string, tag?:string, q?:string, keyword?:string}|string} [options]
 */
function filterTasks(tasks, options) {
  const list = Array.isArray(tasks) ? tasks : [];
  const opts = typeof options === 'string' ? { status: options } : (options || {});

  const status = typeof opts.status === 'string' ? opts.status.trim() : '';
  const tag = typeof opts.tag === 'string' ? opts.tag.trim() : '';
  const rawQ = typeof opts.q === 'string' ? opts.q : (typeof opts.keyword === 'string' ? opts.keyword : '');
  const q = rawQ.trim().toLowerCase();

  return list.filter((task) => {
    if (!task || typeof task !== 'object') return false;
    if (status && status !== 'all' && task.status !== status) return false;
    if (tag && tag !== 'all') {
      const tags = Array.isArray(task.tags) ? task.tags : [];
      if (!tags.includes(tag)) return false;
    }
    if (q) {
      const title = String(task.title == null ? '' : task.title).toLowerCase();
      const tagsText = (Array.isArray(task.tags) ? task.tags : []).join(' ').toLowerCase();
      if (!title.includes(q) && !tagsText.includes(q)) return false;
    }
    return true;
  });
}

/**
 * 排序任务（返回新数组，不改动入参）。
 * @param {object[]} tasks
 * @param {{sort?:'createdAt'|'priority', order?:'asc'|'desc'}|string} [options]
 * @param {'asc'|'desc'} [orderArg] 当 options 为字符串时作为 order
 */
function sortTasks(tasks, options, orderArg) {
  const list = (Array.isArray(tasks) ? tasks : []).slice();
  const opts = typeof options === 'string'
    ? { sort: options, order: orderArg }
    : (options || {});

  const sort = opts.sort === 'priority' ? 'priority' : 'createdAt';
  const order = opts.order === 'asc' ? 'asc' : (opts.order === 'desc' ? 'desc' : 'desc');
  const direction = order === 'asc' ? 1 : -1;

  const priorityRank = (task) => PRIORITY_RANK[normalizePriority(task && task.priority)] || 0;
  const createdAt = (task) => String((task && task.createdAt) || '');

  list.sort((a, b) => {
    let cmp = 0;
    if (sort === 'priority') {
      cmp = priorityRank(a) - priorityRank(b);
    } else {
      cmp = createdAt(a).localeCompare(createdAt(b));
    }
    if (cmp === 0) cmp = createdAt(a).localeCompare(createdAt(b));
    if (cmp === 0) cmp = String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
    return cmp * direction;
  });

  return list;
}

/**
 * 统计：总数、各状态数量、按标签数量。
 * @param {object[]} tasks
 * @returns {{total:number, byStatus:{todo:number,doing:number,done:number}, byTag:Object<string,number>}}
 */
function computeStats(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const byStatus = { todo: 0, doing: 0, done: 0 };
  const byTag = {};

  for (const task of list) {
    if (!task || typeof task !== 'object') continue;
    const status = normalizeStatusStrict(task.status) || DEFAULT_STATUS;
    byStatus[status] += 1;
    for (const tag of normalizeTags(task.tags)) {
      byTag[tag] = (byTag[tag] || 0) + 1;
    }
  }

  return { total: list.length, byStatus, byTag };
}

module.exports = {
  // 冻结导出（测试依赖）
  validateTitle,
  normalizeTags,
  normalizePriority,
  createTask,
  updateTask,
  filterTasks,
  sortTasks,
  computeStats,
  // 辅助导出（供服务端/前端常量共享）
  STATUSES,
  PRIORITIES,
  STATUS_LABELS,
  PRIORITY_LABELS,
  DEFAULT_STATUS,
  DEFAULT_PRIORITY,
  TITLE_MAX_LENGTH,
  TAG_MAX_LENGTH,
  TAGS_MAX_COUNT,
};
