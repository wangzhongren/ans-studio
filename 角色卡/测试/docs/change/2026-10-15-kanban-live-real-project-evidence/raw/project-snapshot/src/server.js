'use strict';

/**
 * HTTP 服务（零第三方依赖，仅 Node 内置模块）。
 *
 * createServer({dataFile, port}) -> Promise<{server, port, url, close, store, dataFile}>
 * `node src/server.js` 可直接启动：默认端口 4173，仅监听 127.0.0.1。
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const storeModule = require('./store');
const core = require('./core');

const { createStore, DEFAULT_DATA_FILE } = storeModule;

const DEFAULT_PORT = 4173;
const HOST = '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB：请求体上限（语义不变）
// 超限后最多再「读掉丢弃」的字节数，之后才断连（防止畸形客户端无限灌数据）。
const MAX_DRAIN_BYTES = 8 * 1024 * 1024; // 8 MiB

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** 错误码 -> HTTP 状态码 */
const ERROR_STATUS = {
  TITLE_REQUIRED: 400,
  TITLE_TOO_LONG: 400,
  INVALID_STATUS: 400,
  INVALID_TASK: 400,
  BAD_JSON: 400,
  BAD_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL_ERROR: 500,
};

function sendJson(res, statusCode, payload, extraHeaders) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...(extraHeaders || {}),
  });
  res.end(body);
}

function sendError(res, code, message, statusCode) {
  sendJson(res, statusCode || ERROR_STATUS[code] || 500, { error: { code, message } });
}

function httpError(code, message) {
  return { code, message };
}

/**
 * 读取请求体；超过 MAX_BODY_BYTES 时以 PAYLOAD_TOO_LARGE 拒绝，返回空串占位。
 *
 * 修复 KANBAN-DEF-001：超限时**不再 `req.destroy()`**。若带着未读数据直接销毁 socket，
 * 客户端只会收到 ECONNRESET，永远看不到 413 响应（契约未兑现）。
 * 现在的做法是：超限后立刻置位并让调用方写回 413，同时继续把剩余字节读完丢弃（drain），
 * 让连接自然收尾（keep-alive 下 socket 不会被强行重置），客户端因此能观测到 413。
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    let drained = 0;

    const fail = (code, message) => {
      if (settled) return;
      settled = true;
      reject(httpError(code, message));
    };

    req.on('data', (chunk) => {
      if (settled) {
        // 已经拒绝（超限或读取出错）：继续消费并丢弃剩余字节，避免
        // 「未读数据 + 提前关连接」把响应变成 ECONNRESET；仅对超大滥用输入兜底断连。
        drained += chunk.length;
        if (drained > MAX_DRAIN_BYTES) req.destroy();
        return;
      }
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail('PAYLOAD_TOO_LARGE', '请求体过大，最大允许 1MB');
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => fail('BAD_REQUEST', `读取请求体失败：${err.message}`));
  });
}

/** 读取并解析 JSON 请求体；空 body 视为 {}；解析失败抛 BAD_JSON */
async function readJsonBody(req) {
  const raw = await readBody(req);
  if (raw.trim() === '') return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw httpError('BAD_JSON', `请求体不是合法的 JSON：${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw httpError('BAD_JSON', '请求体必须是 JSON 对象');
  }
  return parsed;
}

function sendStaticFile(res, filePath) {
  let data;
  try {
    data = fs.readFileSync(filePath);
  } catch (err) {
    sendError(res, 'NOT_FOUND', '页面资源不存在');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function todayStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

async function handleRequest(req, res, store) {
  const parsedUrl = new URL(req.url, 'http://127.0.0.1');
  let pathname = parsedUrl.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch (err) {
    pathname = parsedUrl.pathname;
  }
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.replace(/\/+$/, '');
  const method = (req.method || 'GET').toUpperCase();

  // ---------- 静态页面 ----------
  if (pathname === '/' || pathname === '/index.html') {
    if (method !== 'GET' && method !== 'HEAD') return sendError(res, 'METHOD_NOT_ALLOWED', '该方法不被支持');
    return sendStaticFile(res, path.join(PUBLIC_DIR, 'index.html'));
  }
  if (pathname === '/app.js' || pathname === '/style.css') {
    if (method !== 'GET' && method !== 'HEAD') return sendError(res, 'METHOD_NOT_ALLOWED', '该方法不被支持');
    return sendStaticFile(res, path.join(PUBLIC_DIR, path.basename(pathname)));
  }
  if (pathname === '/favicon.ico') {
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    return res.end();
  }

  // ---------- /api/tasks ----------
  if (pathname === '/api/tasks') {
    if (method === 'GET') {
      const status = parsedUrl.searchParams.get('status') || '';
      const tag = parsedUrl.searchParams.get('tag') || '';
      const q = parsedUrl.searchParams.get('q') || '';
      const sort = parsedUrl.searchParams.get('sort') || 'createdAt';
      const order = parsedUrl.searchParams.get('order') || 'desc';
      const tasks = core.sortTasks(
        core.filterTasks(store.list(), { status, tag, q }),
        { sort, order },
      );
      return sendJson(res, 200, { tasks, warning: store.warning || null });
    }
    if (method === 'POST') {
      const body = await readJsonBody(req);
      const task = store.create({ title: body.title, priority: body.priority, tags: body.tags });
      return sendJson(res, 201, { task, warning: store.warning || null });
    }
    return sendError(res, 'METHOD_NOT_ALLOWED', '该方法不被支持');
  }

  // ---------- /api/tasks/:id ----------
  if (pathname.startsWith('/api/tasks/')) {
    const id = pathname.slice('/api/tasks/'.length);
    if (!id) return sendError(res, 'NOT_FOUND', '任务不存在');

    if (method === 'PUT') {
      const body = await readJsonBody(req);
      const task = store.update(id, body);
      return sendJson(res, 200, { task });
    }
    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      const task = store.update(id, body);
      return sendJson(res, 200, { task });
    }
    if (method === 'DELETE') {
      store.remove(id);
      return sendJson(res, 200, { ok: true });
    }
    if (method === 'GET') {
      const task = store.get(id);
      if (!task) return sendError(res, 'NOT_FOUND', '任务不存在');
      return sendJson(res, 200, { task });
    }
    return sendError(res, 'METHOD_NOT_ALLOWED', '该方法不被支持');
  }

  // ---------- 其它 API ----------
  if (pathname === '/api/stats') {
    if (method !== 'GET') return sendError(res, 'METHOD_NOT_ALLOWED', '该方法不被支持');
    return sendJson(res, 200, core.computeStats(store.list()));
  }

  if (pathname === '/api/export') {
    if (method !== 'GET') return sendError(res, 'METHOD_NOT_ALLOWED', '该方法不被支持');
    const tasks = store.list();
    return sendJson(
      res,
      200,
      { exportedAt: new Date().toISOString(), count: tasks.length, tasks },
      { 'Content-Disposition': `attachment; filename="kanban-export-${todayStamp()}.json"` },
    );
  }

  if (pathname === '/api/status') {
    if (method !== 'GET') return sendError(res, 'METHOD_NOT_ALLOWED', '该方法不被支持');
    return sendJson(res, 200, { ok: true, dataFile: store.dataFile, warning: store.warning || null });
  }

  return sendError(res, 'NOT_FOUND', '接口或页面不存在');
}

/**
 * 创建并启动服务。
 * @param {{dataFile?:string, port?:number|string}} [options]
 * @returns {Promise<{server:import('node:http').Server, port:number, url:string, close:()=>Promise<void>, store:object, dataFile:string}>}
 */
function createServer(options) {
  const opts = options || {};
  const dataFile = path.resolve(opts.dataFile || DEFAULT_DATA_FILE);
  const requestedPort = opts.port === undefined || opts.port === null || opts.port === ''
    ? DEFAULT_PORT
    : Number(opts.port);

  return new Promise((resolve, reject) => {
    if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
      reject(new Error(`端口不合法：${opts.port}`));
      return;
    }

    let store;
    try {
      store = createStore({ dataFile });
    } catch (err) {
      reject(err);
      return;
    }

    const server = http.createServer((req, res) => {
      handleRequest(req, res, store).catch((err) => {
        const code = err && err.code && ERROR_STATUS[err.code] ? err.code : 'INTERNAL_ERROR';
        const message = code === 'INTERNAL_ERROR'
          ? `服务器内部错误：${err && err.message ? err.message : '未知错误'}`
          : err.message;
        if (!res.headersSent) {
          sendError(res, code, message);
        } else {
          res.end();
        }
      });
    });

    const onListenError = (err) => {
      if (err && err.code === 'EADDRINUSE') {
        reject(new Error(`端口 ${requestedPort} 已被占用，请换一个端口（PORT=<其它端口> node src/server.js）`));
      } else if (err && err.code === 'EACCES') {
        reject(new Error(`没有权限监听端口 ${requestedPort}`));
      } else {
        reject(err);
      }
    };
    server.once('error', onListenError);

    server.listen(requestedPort, HOST, () => {
      server.removeListener('error', onListenError);
      server.on('error', (err) => {
        process.stderr.write(`[kanban-live] 服务错误：${err.message}\n`);
      });
      const actualPort = server.address().port;
      const url = `http://${HOST}:${actualPort}`;
      resolve({
        server,
        port: actualPort,
        url,
        store,
        dataFile: store.dataFile,
        close() {
          return new Promise((res2, rej2) => {
            if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
            server.close((err) => (err ? rej2(err) : res2()));
          });
        },
      });
    });
  });
}

module.exports = createServer;
module.exports.createServer = createServer;
module.exports.DEFAULT_PORT = DEFAULT_PORT;
module.exports.DEFAULT_DATA_FILE = DEFAULT_DATA_FILE;

// ---------- 直接运行：node src/server.js ----------
if (require.main === module) {
  const envDataFile = process.env.KANBAN_DATA_FILE || DEFAULT_DATA_FILE;
  const envPort = process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT;

  createServer({ dataFile: envDataFile, port: envPort })
    .then(({ url, dataFile, store, close }) => {
      console.log('离线中文任务看板已启动');
      console.log(`访问地址：${url}`);
      console.log(`数据文件：${dataFile}`);
      if (store.warning) {
        console.log(`数据告警：${store.warning.message}`);
      }
      console.log('按 Ctrl+C 退出。');

      let closing = false;
      const shutdown = (signal) => {
        if (closing) return;
        closing = true;
        console.log(`\n收到 ${signal}，正在关闭服务……`);
        close()
          .then(() => process.exit(0))
          .catch(() => process.exit(0));
      };
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      console.error(`启动失败：${err && err.message ? err.message : err}`);
      process.exit(1);
    });
}
