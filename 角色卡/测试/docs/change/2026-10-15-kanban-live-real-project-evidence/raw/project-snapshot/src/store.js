'use strict';

/**
 * 本地 JSON 文件存储（零第三方依赖）。
 *
 * createStore({dataFile}) -> { list, get, create, update, remove, warning, dataFile }
 *
 * - 写入原子：同目录临时文件 + fs.rename，不会留下半截数据。
 * - 数据文件损坏：不静默清空，先把原文件改名备份为
 *   `<dataFile>.corrupt-<时间戳>`，stderr 打印中文错误，并通过 `warning` 暴露告警。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const core = require('./core');
const { createTask, updateTask, normalizeTags } = core;

const DEFAULT_DATA_FILE = path.join(process.cwd(), 'data', 'tasks.json');

/** 构造带错误码的错误（供 HTTP 层映射状态码） */
function domainError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function timestampForBackup(date) {
  // 形如 2026-10-15T21-30-00-123Z，可直接作为文件名一部分
  return date.toISOString().replace(/[:.]/g, '-');
}

/** 把文件里的原始条目修补成合法任务对象；无法修补时返回 null */
function repairTask(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!core.validateTitle(raw.title)) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    title: raw.title.trim(),
    status: core.STATUSES.includes(raw.status) ? raw.status : core.DEFAULT_STATUS,
    priority: core.normalizePriority(raw.priority),
    tags: normalizeTags(raw.tags),
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt
      ? raw.updatedAt
      : (typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date(0).toISOString()),
  };
}

function createStore(options) {
  const opts = options || {};
  const dataFile = path.resolve(opts.dataFile || DEFAULT_DATA_FILE);
  const dataDir = path.dirname(dataFile);

  let tasks = [];
  let warning = null;

  function ensureDataDir() {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  function backupCorruptFile() {
    const stamp = timestampForBackup(new Date());
    let target = `${dataFile}.corrupt-${stamp}`;
    let suffix = 0;
    while (fs.existsSync(target)) {
      suffix += 1;
      target = `${dataFile}.corrupt-${stamp}-${suffix}`;
    }
    fs.renameSync(dataFile, target);
    return target;
  }

  function reportCorrupt(reason, backupPath) {
    warning = {
      code: 'DATA_FILE_CORRUPT',
      message: `数据文件已损坏或格式非法（${reason}），已把原文件备份为 ${path.basename(backupPath)}，当前以空任务列表继续运行，未丢失原始数据。`,
      backupPath,
    };
    process.stderr.write(
      `[kanban-live] 错误：数据文件无法解析：${dataFile}\n`
      + `[kanban-live] 原因：${reason}\n`
      + `[kanban-live] 已将原文件备份为：${backupPath}\n`
      + '[kanban-live] 已以空任务列表继续运行；请检查备份文件后手工恢复数据。\n',
    );
  }

  function load() {
    let raw;
    try {
      raw = fs.readFileSync(dataFile, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        tasks = [];
        return;
      }
      throw err;
    }

    if (raw.trim() === '') {
      tasks = [];
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      reportCorrupt(`JSON 解析失败：${err.message}`, backupCorruptFile());
      tasks = [];
      return;
    }

    let candidates;
    if (Array.isArray(parsed)) {
      candidates = parsed;
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.tasks)) {
      candidates = parsed.tasks;
    } else {
      reportCorrupt('文件内容既不是任务数组，也不含 tasks 数组', backupCorruptFile());
      tasks = [];
      return;
    }

    const repaired = [];
    for (const item of candidates) {
      const task = repairTask(item);
      if (task) repaired.push(task);
    }
    tasks = repaired;
  }

  /** 原子写入：同目录临时文件 + rename */
  function persist() {
    ensureDataDir();
    const payload = `${JSON.stringify(tasks, null, 2)}\n`;
    const tmpFile = path.join(
      dataDir,
      `.${path.basename(dataFile)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );

    let fd;
    try {
      fd = fs.openSync(tmpFile, 'w');
      fs.writeFileSync(fd, payload, 'utf8');
      try {
        fs.fsyncSync(fd);
      } catch (err) {
        // 某些文件系统不支持 fsync，忽略即可（写入本身已完成）
        if (err && err.code !== 'EINVAL' && err.code !== 'ENOTSUP') throw err;
      }
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tmpFile, dataFile);
    } catch (err) {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch (_) { /* 忽略关闭失败 */ }
      }
      try { fs.unlinkSync(tmpFile); } catch (_) { /* 临时文件可能不存在 */ }
      throw err;
    }
  }

  function cloneTask(task) {
    return task ? { ...task, tags: Array.isArray(task.tags) ? task.tags.slice() : [] } : task;
  }

  function findIndex(id) {
    return tasks.findIndex((task) => task.id === id);
  }

  ensureDataDir();
  load();

  return {
    /** 全部任务（按存储顺序，返回副本） */
    list() {
      return tasks.map(cloneTask);
    },
    /** 按 id 取任务，不存在返回 null */
    get(id) {
      const index = findIndex(id);
      return index === -1 ? null : cloneTask(tasks[index]);
    },
    /** 新建任务，标题非法时抛出 TITLE_REQUIRED / TITLE_TOO_LONG */
    create(input) {
      const task = createTask(input);
      tasks.push(task);
      persist();
      return cloneTask(task);
    },
    /** 更新任务；不存在抛出 NOT_FOUND，标题非法抛出 TITLE_REQUIRED */
    update(id, patch) {
      const index = findIndex(id);
      if (index === -1) throw domainError('NOT_FOUND', `任务不存在：${id}`);
      updateTask(tasks[index], patch);
      persist();
      return cloneTask(tasks[index]);
    },
    /** 删除任务；不存在抛出 NOT_FOUND，成功返回被删除的任务 */
    remove(id) {
      const index = findIndex(id);
      if (index === -1) throw domainError('NOT_FOUND', `任务不存在：${id}`);
      const [removed] = tasks.splice(index, 1);
      persist();
      return cloneTask(removed);
    },
    /** 数据文件告警：正常为 null，损坏时为 {code, message, backupPath} */
    get warning() {
      return warning;
    },
    /** 数据文件绝对路径 */
    dataFile,
  };
}

// 兼容两种用法：`const { createStore } = require('./store')` 与 `require('./store')({...})`
module.exports = createStore;
module.exports.createStore = createStore;
module.exports.DEFAULT_DATA_FILE = DEFAULT_DATA_FILE;
