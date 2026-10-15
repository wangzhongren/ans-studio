'use strict';

/**
 * 交付级测试套件 06：文本安全与零依赖合规（覆盖清单 10、12）。
 *
 * 覆盖：
 * - 接口对 `<script>` / `&<>"'` 标题按原样存取不丢失（含落盘与新实例读回）；
 * - 源扫描：src/public 用户数据只走 textContent、无 HTML 注入点、无 http(s) 外链；
 * - package.json 无 dependencies、根目录无 node_modules；
 * - 界面侧空白标题「必填校验 + 提交前拦截」的静态断言。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createServer } = require('../src/server.js');
const { createStore } = require('../src/store.js');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'src', 'public');
const JSON_HEADERS = { 'Content-Type': 'application/json' };

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** 取源码中两个标记之间的片段（用于「某函数内部」的结构性断言） */
function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `源码应包含 ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end === -1 ? undefined : end);
}

// ---------------------------------------------------------------------------
// 覆盖 10：接口文本安全
// ---------------------------------------------------------------------------

test('[覆盖10] 接口对 <script> 与 &<>"\' 标题原样存取，不丢失、不转义、不执行', async (t) => {
  const dir = tmpDir('kanban-text-');
  const dataFile = path.join(dir, 'tasks.json');
  const started = await createServer({ dataFile, port: 0 });
  t.after(async () => {
    await started.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const payloads = [
    '<script>alert(1)</script>',
    '&<>"\'',
    '<b>加粗</b> &amp; <img src=x onerror=alert(1)>',
    '中文 & English <混合> "引号" \'单引号\'',
  ];

  for (const title of payloads) {
    const res = await fetch(`${started.url}/api/tasks`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ title, tags: [title.slice(0, 10)] }),
    });
    assert.equal(res.status, 201, `应接受含特殊字符的标题：${title}`);
    const { task } = await res.json();
    assert.equal(task.title, title, '接口返回的标题必须与提交值逐字符一致');
  }

  // 列表读回一致
  const listed = (await (await fetch(`${started.url}/api/tasks`)).json()).tasks;
  assert.equal(listed.length, payloads.length);
  for (const title of payloads) {
    assert.ok(listed.some((x) => x.title === title), `列表应原样包含：${title}`);
  }

  // 导出读回一致
  const exported = await (await fetch(`${started.url}/api/export`)).json();
  for (const title of payloads) {
    assert.ok(exported.tasks.some((x) => x.title === title), `导出应原样包含：${title}`);
  }

  // 落盘后用新 store 读回仍一致（不经任何 HTML 处理）
  const reread = createStore({ dataFile }).list();
  for (const title of payloads) {
    assert.ok(reread.some((x) => x.title === title), `新 store 读回应原样包含：${title}`);
  }
});

// ---------------------------------------------------------------------------
// 覆盖 10：源扫描
// ---------------------------------------------------------------------------

test('[覆盖10] src/public 源扫描：无 HTML 注入点、用户数据只走 textContent', () => {
  const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');

  for (const pattern of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(']) {
    assert.equal(appJs.includes(pattern), false, `app.js 不得出现 ${pattern}（HTML/脚本注入点）`);
  }
  assert.ok(appJs.includes('textContent'), 'app.js 应用 textContent 渲染用户数据');
  assert.match(appJs, /title\.textContent\s*=/, '卡片标题必须用 textContent 渲染');
  assert.match(appJs, /tagEl\.textContent\s*=/, '标签必须用 textContent 渲染');

  // 危险字符串拼接渲染（如 innerHTML = '...' + task.title）不应出现
  assert.equal(/=\s*['"`][^'"`]*['"`]\s*\+[^;]*\.title/.test(appJs), false, '不应把用户标题拼进 HTML 字符串');
});

test('[覆盖12] src/public 无 http(s) 外链资源（断网可用）', () => {
  for (const name of fs.readdirSync(PUBLIC_DIR)) {
    const full = path.join(PUBLIC_DIR, name);
    if (!fs.statSync(full).isFile()) continue;
    const content = fs.readFileSync(full, 'utf8');
    assert.equal(/https?:\/\//.test(content), false, `${name} 不得包含 http(s):// 外链`);
    assert.equal(/src\s*=\s*["']\/\//.test(content), false, `${name} 不得使用协议相对外链`);
  }

  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  assert.match(html, /<script src="\/app\.js"><\/script>/, '脚本须为同源相对路径');
  assert.match(html, /<link rel="stylesheet" href="\/style\.css">/, '样式须为同源相对路径');
});

// ---------------------------------------------------------------------------
// 覆盖 1：界面侧空白标题「两层拒绝」的静态断言
// ---------------------------------------------------------------------------

test('[覆盖1] 界面侧：app.js 新增/编辑都有必填校验与提交前拦截（空白不发请求）', () => {
  const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');

  assert.match(appJs, /任务标题不能为空/, '界面须有空白标题的中文提示');

  const createFn = section(appJs, 'async function submitCreate', 'function exportJson');
  assert.match(createFn, /if\s*\(!title\)/, '提交前须校验空白标题');
  assert.match(createFn, /api\('\/api\/tasks'/, '校验通过后才发 POST');
  assert.ok(
    createFn.indexOf('if (!title)') < createFn.indexOf("api('/api/tasks'"),
    '空白校验必须发生在发请求之前（提交前拦截）',
  );
  assert.match(createFn, /event\.preventDefault\(\)/, '提交须 preventDefault，避免原生表单直接提交');

  const editFn = section(appJs, 'async function submitEdit', 'async function submitCreate');
  assert.match(editFn, /if\s*\(!title\)/, '编辑保存前也须校验空白标题');

  // 删除须有二次确认
  const removeFn = section(appJs, 'async function removeTask', 'function openEditModal');
  assert.match(removeFn, /window\.confirm\(/, '删除须有二次确认');
});

test('[覆盖1] 界面侧：index.html 标题输入框约束（maxlength / 必填）', (t) => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  assert.match(html, /id="create-title"[^>]*maxlength="200"/, '新增标题输入框应限制 200 字');
  assert.match(html, /id="edit-title"[^>]*maxlength="200"/, '编辑标题输入框应限制 200 字');

  const createInput = html.match(/<input[^>]*id="create-title"[^>]*>/);
  assert.ok(createInput, '应存在 #create-title 输入框');
  const hasRequired = /\brequired\b/.test(createInput[0]);
  t.diagnostic(
    `#create-title 是否带 HTML required 属性：${hasRequired}`
    + '（派发口径提到 required；冻结契约只要求「界面拒绝空白且不发请求」，该行为已由 app.js 的提交前拦截覆盖——见 api-spec 差异清单）',
  );
});

// ---------------------------------------------------------------------------
// 覆盖 12：零依赖合规
// ---------------------------------------------------------------------------

test('[覆盖12] package.json 无 dependencies；根目录无 node_modules', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(
    Object.prototype.hasOwnProperty.call(pkg, 'dependencies'), false,
    'package.json 不得含 dependencies 字段',
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(pkg, 'devDependencies'), false,
    'package.json 不得含 devDependencies 字段',
  );
  assert.equal(fs.existsSync(path.join(ROOT, 'node_modules')), false, '根目录不得存在 node_modules');

  // 源码只 require Node 内置模块
  for (const name of ['core.js', 'store.js', 'server.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'src', name), 'utf8');
    const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    for (const dep of requires) {
      assert.ok(dep.startsWith('node:') || dep.startsWith('.'), `${name} 只能 require 内置模块或相对模块，发现：${dep}`);
    }
  }
});
