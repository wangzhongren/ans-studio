'use strict';

/**
 * 实现者自查（草稿区，非交付物）：用真实 curl 客户端确认 KANBAN-DEF-001 已修复。
 *
 * 修复前：curl 对 >1MB 请求体收不到任何 HTTP 响应（连接被重置）。
 * 修复后：curl 应打印 status=413 且 body 为 {"error":{"code":"PAYLOAD_TOO_LARGE",...}}。
 *
 * 运行：node temp/实现者/selfcheck-413.js
 * 说明：本环境 run_shell 不支持管道/重定向，故请求体先落盘、再用 curl --data-binary @file 发送。
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { createServer } = require('../../src/server.js');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-curl-413-'));
  const dataFile = path.join(dir, 'tasks.json');
  const bodyFile = path.join(dir, 'big.json');
  const body = JSON.stringify({ title: '大任务', pad: 'x'.repeat(1024 * 1024 + 64) });
  fs.writeFileSync(bodyFile, body, 'utf8');
  console.log('请求体字节数 =', Buffer.byteLength(body), '（上限 1 MiB = 1048576）');

  const app = await createServer({ dataFile, port: 0 });
  try {
    const out = spawnSync('curl', [
      '-s', '-w', '\nHTTP %{http_code}',
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '--data-binary', '@' + bodyFile,
      `${app.url}/api/tasks`,
    ], { encoding: 'utf8' });

    console.log('curl 退出码 =', out.status, '｜signal =', out.signal, '｜error =', out.error ? out.error.message : 'null');
    console.log('curl stdout =');
    console.log(out.stdout.trim());
    if (out.stderr) console.log('curl stderr =', out.stderr.trim());

    const list = await (await fetch(`${app.url}/api/tasks`)).json();
    console.log('超限请求后任务总数 =', list.tasks.length, '（应为 0，拒绝即零副作用）');

    const ok = out.stdout.includes('HTTP 413') && out.stdout.includes('PAYLOAD_TOO_LARGE');
    console.log(ok ? '结论：PASS（curl 可观测 413 PAYLOAD_TOO_LARGE）' : '结论：FAIL');
    process.exitCode = ok ? 0 : 1;
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})();
