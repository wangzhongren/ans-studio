// ANS Codex适配器 MCP P0 探针（2026-10-16，一次性证据脚本，不进产品路径）。
// 对上：角色卡/运行时核心/docs/fix/2026-10-16_assess_role-mcp-install.md §九.2（Codex 六项待确认）。
// 环境：固定 codex 0.162.1（node_modules/@openai/codex）真 app-server 进程 + 本地夹具；
//       无任何真实网关请求——模型面全部由本地 loopback 假 Responses SSE 端点承答，凭据为假值。
// 沿 test/codex-adapter 先例：假 provider 定义与安全覆盖取自 src/common/codex-adapter/config.ts（真源）。
// 单元格：
//   A  root-map 完整定义注入（TOML 转义/args/env 转回放）+ 直呼工具（item 形状/通知）+ catalog + per-call timeout
//   A2 配置边界：带空格/引号的 server 名、空字符串 arg（strict-config 下的解析面）
//   C  起不来的白名单 server：startupStatus 通知 / catalog 形状 / 线程存活
//   D  elicitation：工具处理中 server→client 请求（方法名/参数/既有 cancel 应答面）
//   B  模型驱动：假 Responses SSE 返回 function_call → app-server 原生执行 MCP 工具（turn 内 item/通知全量）
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../..');
const cliJs = path.join(repoRoot, 'node_modules/@openai/codex/bin/codex.js');
const fixtureSource = path.join(here, 'fixtures/echo-mcp.mjs');
const { safetyConfig, safetyOverrides } = await import(pathToFileURL(path.join(repoRoot, 'src/common/codex-adapter/config.ts')).href);

const SERVER_NAME = 'probe-surface';
const PROVIDER_TEMPLATE = 'model_providers.ans_probe={name="ANS Probe",base_url="http://127.0.0.1:PORT/v1",env_key="CODEX_API_KEY",wire_api="responses",requires_openai_auth=false}';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (value) => JSON.stringify(value);
const redactStderr = (text) => text.replaceAll('fake-mcp-probe-only', '[FAKE-KEY]');
const stagingRoots = [];
const stage = (prefix) => { const dir = mkdtempSync(path.join(os.tmpdir(), prefix)); stagingRoots.push(dir); return dir; };

// ---------- 本地假 Responses SSE 端点（模型面；仅 loopback） ----------
let cellMode = 'message'; // 'message' | 'mcp-call'
let cellBodies = [];
let cellToolSpecs = []; // 模型请求里 mcp__ 桥工具的全量规格（供单元格 B 构造调用）
const httpServer = createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  let body;
  try { body = JSON.parse(raw); } catch { res.writeHead(400); res.end('invalid'); return; }
  cellBodies.push(body);
  if (Array.isArray(body.tools)) {
    for (const tool of body.tools) {
      if (typeof tool?.name === 'string' && tool.name.startsWith('mcp__')) cellToolSpecs.push(tool);
    }
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const response = { id: 'resp_probe', object: 'response', created_at: 1, status: 'in_progress', model: 'probe-model', output: [] };
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  send('response.created', { response });
  const seenFunctionOutput = cellBodies.some((entry) => JSON.stringify(entry).includes('function_call_output'));
  const bridge = cellMode === 'mcp-call' && !seenFunctionOutput
    ? (Array.isArray(body.tools) ? body.tools.find((tool) => typeof tool?.name === 'string' && tool.name.startsWith('mcp__')) : undefined)
    : undefined;
  if (bridge) {
    // 桥工具（type:"namespace"）调用：function_call 携带 `name`(嵌套工具名)+`namespace`(mcp__<server>) 双字段
    const nested = Array.isArray(bridge.tools) ? bridge.tools.find((tool) => tool?.name === 'echo_probe') : undefined;
    const call = { type: 'function_call', id: 'fc_probe_1', call_id: 'fc_probe_1', name: nested?.name ?? 'echo_probe', namespace: bridge.name, arguments: JSON.stringify({ text: 'from fake model' }), status: 'completed' };
    send('response.output_item.added', { output_index: 0, item: { ...call, arguments: '', status: 'in_progress' } });
    send('response.function_call_arguments.delta', { item_id: 'fc_probe_1', output_index: 0, delta: call.arguments });
    send('response.output_item.done', { output_index: 0, item: call });
    send('response.completed', { response: { ...response, status: 'completed', output: [call], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
  } else {
    const message = { type: 'message', id: 'msg_probe_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'probe final message', annotations: [] }] };
    send('response.output_item.added', { output_index: 0, item: { ...message, content: [] } });
    send('response.output_item.done', { output_index: 0, item: message });
    send('response.completed', { response: { ...response, status: 'completed', output: [message], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
  }
  res.end();
});
await new Promise((resolve, reject) => { httpServer.once('error', reject); httpServer.listen(0, '127.0.0.1', () => resolve()); });
const providerOverride = PROVIDER_TEMPLATE.replace('PORT', String(httpServer.address().port));

// ---------- app-server 客户端（分派顺序镜像 src/provider/codex/session.ts:134-166） ----------
function openClient(child, record) {
  const pending = new Map();
  let sequence = 0;
  let onServerRequest = (message) => ({ error: { code: -32601, message: `probe fail-closed: ${String(message.method)}` } });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let message;
    try { message = JSON.parse(line); } catch { record.invalidLines = (record.invalidLines ?? 0) + 1; return; }
    if (typeof message.method === 'string') {
      if (message.id !== undefined) {
        record.serverRequests.push({ method: message.method, params: message.params });
        Promise.resolve().then(() => onServerRequest(message)).then(
          (response) => child.stdin.write(JSON.stringify({ id: message.id, ...response }) + '\n'),
          (error) => child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: String(error) } }) + '\n'));
      } else {
        record.notices.push({ at: Date.now(), method: message.method, params: message.params });
      }
      return;
    }
    if (message.id !== undefined && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      entry.deliver(message);
    }
  });
  return {
    request(method, params, timeoutMs = 20000) {
      const id = ++sequence;
      record.requests.push({ method, params });
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`probe ${method} timed out after ${timeoutMs}ms`)); }, timeoutMs);
        pending.set(id, { timer, deliver: (message) => message.error ? reject(new Error(`rpc ${method} error: ${JSON.stringify(message.error)}`)) : resolve(message.result) });
        child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      });
    },
    notify(method, params) { child.stdin.write(JSON.stringify({ method, params }) + '\n'); },
    setServerRequestHandler(handler) { onServerRequest = handler; },
    close() { lines.close(); },
  };
}

// ---------- 单元格执行器（prepare 构造夹具与 override；steps 操作） ----------
const results = [];
async function runCell(name, options, steps) {
  const prepared = { overrides: [], mode: options.mode ?? 'message' };
  const preparation = await options.prepare(prepared);
  const home = mkdtempSync(path.join(os.tmpdir(), 'codex-mcp-probe-home-'));
  const work = mkdtempSync(path.join(os.tmpdir(), 'codex-mcp-probe-work-'));
  cellMode = prepared.mode;
  cellBodies = [];
  cellToolSpecs = [];
  const overrides = [...safetyOverrides(work, [], false), providerOverride, 'model_provider="ans_probe"', 'model="probe-model"', ...prepared.overrides];
  const record = { name, overrides, notices: [], serverRequests: [], requests: [], preparation };
  const appServerEnv = { PATH: process.env.PATH, CODEX_HOME: home, CODEX_API_KEY: 'fake-mcp-probe-only', ...(prepared.appServerEnv ?? {}) };
  if (prepared.dropPath) delete appServerEnv.PATH;
  const child = spawn(process.execPath, [cliJs, 'app-server', '--listen', 'stdio://', '--strict-config', ...overrides.flatMap((value) => ['-c', value])],
    { cwd: work, env: appServerEnv, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (data) => { stderr = (stderr + data).slice(-6000); });
  const client = openClient(child, record);
  const context = { work, home, record, client, prepared };
  try {
    await client.request('initialize', { clientInfo: { name: 'ans_mcp_probe', version: '0.0.0' }, capabilities: prepared.capabilities ?? { experimentalApi: true, explicitGatewayOauth: true } });
    client.notify('initialized', {});
    await steps(client, context);
  } catch (error) {
    record.error = String(error);
  } finally {
    record.toolSpecs = cellToolSpecs.map((tool) => tool);
    record.functionItems = cellBodies.flatMap((body) => Array.isArray(body.input)
      ? body.input.filter((item) => item?.type === 'function_call' || item?.type === 'function_call_output')
      : []);
    record.stderrTail = redactStderr(stderr.slice(-2000));
    record.httpBodies = cellBodies.length;
    record.modelRequestSummary = cellBodies.map((body) => ({
      tools: Array.isArray(body.tools) ? body.tools.map((tool) => tool?.name).filter(Boolean) : null,
      inputKinds: Array.isArray(body.input) ? body.input.map((item) => item?.type ?? null) : null,
      mcpBridgeTool: Array.isArray(body.tools) ? body.tools.map((tool) => tool?.name).find((toolName) => typeof toolName === 'string' && toolName.startsWith('mcp__')) ?? null : null,
    }));
    client.close();
    child.stdin.end();
    await new Promise((resolve) => { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 4000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    record.childExit = child.exitCode;
    try { rmSync(home, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }); } catch {}
  }
  results.push(record);
  return record;
}

const threadParams = (context) => ({ model: 'probe-model', modelProvider: 'ans_probe', cwd: context.work, sandbox: 'read-only', approvalPolicy: 'never', approvalsReviewer: 'user', config: safetyConfig(context.work), developerInstructions: 'mcp surface probe', ephemeral: true });
const waitNotice = async (record, method, timeoutMs = 10000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !record.notices.some((notice) => notice.method === method)) await sleep(30);
  return record.notices.some((notice) => notice.method === method);
};
const waitFile = async (file, timeoutMs = 8000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !existsSync(file)) await sleep(50);
  return existsSync(file);
};

// P2 路线 (a) 编码器镜像：全部字符串走 JSON.stringify → TOML 基本字符串
function serverOverride(definition) {
  const parts = [`command=${quote(definition.command)}`];
  if (definition.args) parts.push(`args=[${definition.args.map(quote).join(',')}]`);
  if (definition.env) parts.push(`env={${Object.entries(definition.env).map(([key, value]) => `${quote(key)}=${quote(value)}`).join(',')}}`);
  if (definition.startup_timeout_sec !== undefined) parts.push(`startup_timeout_sec=${definition.startup_timeout_sec}`);
  if (definition.tool_timeout_sec !== undefined) parts.push(`tool_timeout_sec=${definition.tool_timeout_sec}`);
  if (definition.default_tools_approval_mode !== undefined) parts.push(`default_tools_approval_mode=${quote(definition.default_tools_approval_mode)}`);
  return `mcp_servers={${quote(definition.name)}={${parts.join(',')}}}`;
}

// ---- A：健康 server（root-map 完整定义，args/env 全转义端点）+ 直呼 + catalog + hang（per-call timeout） ----
await runCell('A-root-map-live', { mode: 'message', async prepare(prepared) {
  const staging = stage('codex-mcp-probe-stage-a-');
  const trickyDir = path.join(staging, 'spaces "q" 中文');
  mkdirSync(trickyDir);
  const fixtureAt = path.join(trickyDir, 'echo "mc" 中文.mjs');
  copyFileSync(fixtureSource, fixtureAt);
  const captureFile = path.join(trickyDir, 'capture 记录.json');
  const injectedArgs = [fixtureAt, captureFile, '--label', ' value with leading space', 'quote"q', 'back\\slash', '中文值 空格', 'two  spaces'];
  prepared.fixture = { captureFile, injectedArgs };
  prepared.overrides.push(serverOverride({ name: SERVER_NAME, command: process.execPath, args: injectedArgs, env: { PROBE_ENV_ONE: 'space value', PROBE_ENV_TWO: 'quote"q back\\b' }, startup_timeout_sec: 5, tool_timeout_sec: 0.25 }));
  return null;
} }, async (client, context) => {
  const { record, prepared } = context;
  const readback = await client.request('config/read', { includeLayers: false, cwd: context.work });
  record.readbackServers = readback.config.mcp_servers;
  const thread = await client.request('thread/start', threadParams(context));
  record.thread = { id: thread.thread.id, sandbox: thread.sandbox, approvalPolicy: thread.approvalPolicy };
  record.fixtureStarted = await waitFile(prepared.fixture.captureFile);
  if (record.fixtureStarted) {
    const capture = JSON.parse(readFileSync(prepared.fixture.captureFile, 'utf8'));
    record.fixtureCapture = { argv: capture.argv, cwd: capture.cwd, envKeys: capture.envKeys, probeEnv: capture.probeEnv };
    record.argRoundTrip = { expected: prepared.fixture.injectedArgs.slice(1), actual: capture.argv };
  }
  record.catalog = await client.request('mcpServerStatus/list', { threadId: thread.thread.id, detail: 'toolsAndAuthOnly', limit: 100 });
  const before = record.notices.length;
  record.directCall = await client.request('mcpServer/tool/call', { threadId: thread.thread.id, server: SERVER_NAME, tool: 'echo_probe', arguments: { text: 'direct call' } });
  await sleep(400);
  record.callNotices = record.notices.slice(before).map(({ method, params }) => ({ method, params }));
  const hangStarted = Date.now();
  try {
    record.hang = { timedOutAtRpc: false, result: await client.request('mcpServer/tool/call', { threadId: thread.thread.id, server: SERVER_NAME, tool: 'hang_probe', arguments: {} }, 6000) };
  } catch (error) {
    record.hang = { timedOutAtRpc: true, error: String(error) };
  }
  record.hang.elapsedMs = Date.now() - hangStarted;
  await sleep(300);
  record.fixtureAfterCalls = JSON.parse(readFileSync(prepared.fixture.captureFile, 'utf8')).calls;
  record.serverRequestsAfterCall = record.serverRequests.map((request) => request.method);
});

// ---- A2a：单条 -c 内的边界键（带空格/引号的名字、空字符串 arg） ----
await runCell('A2a-single-override-edges', { mode: 'message', async prepare(prepared) {
  prepared.overrides.push(`mcp_servers={${quote('probe surface')}={command=${quote('/bin/echo')}},${quote('probe"q')}={command=${quote('/bin/echo')}},empty-args={command=${quote('/bin/echo')},args=["","x"]},dash-ok={command=${quote('/bin/echo')}}}`);
  return null;
} }, async (client, context) => {
  const readback = await client.request('config/read', { includeLayers: false, cwd: context.work });
  context.record.readbackServers = readback.config.mcp_servers;
  context.record.noticeMethods = [...new Set(context.record.notices.map((notice) => notice.method))];
});

// ---- A2b：连续两条 -c 同根键（合并 vs 覆盖） ----
await runCell('A2b-consecutive-overrides', { mode: 'message', async prepare(prepared) {
  prepared.overrides.push(`mcp_servers={first-server={command=${quote('/bin/echo')}}}`);
  prepared.overrides.push(`mcp_servers={second-server={command=${quote('/bin/echo')}}}`);
  return null;
} }, async (client, context) => {
  const readback = await client.request('config/read', { includeLayers: false, cwd: context.work });
  context.record.readbackServers = readback.config.mcp_servers;
});

// ---- A3：env 面（app-server 无 PATH；server 定义无 env） ----
await runCell('A3-env-inheritance', { mode: 'message', dropPath: true, async prepare(prepared) {
  const staging = stage('codex-mcp-probe-stage-a3-');
  const fixtureAt = path.join(staging, 'echo-mcp.mjs');
  copyFileSync(fixtureSource, fixtureAt);
  const captureFile = path.join(staging, 'capture-a3.json');
  prepared.fixture = { captureFile };
  prepared.overrides.push(serverOverride({ name: SERVER_NAME, command: process.execPath, args: [fixtureAt, captureFile], startup_timeout_sec: 5 }));
  return null;
} }, async (client, context) => {
  const { record, prepared } = context;
  await client.request('thread/start', threadParams(context));
  record.fixtureStarted = await waitFile(prepared.fixture.captureFile);
  if (record.fixtureStarted) {
    const capture = JSON.parse(readFileSync(prepared.fixture.captureFile, 'utf8'));
    record.fixtureEnvKeys = capture.envKeys;
    record.fixtureCwd = capture.cwd;
  }
});

// ---- C：起不来的白名单 server ----
await runCell('C-broken-server', { mode: 'message', async prepare(prepared) {
  prepared.overrides.push(serverOverride({ name: 'broken-server', command: '/nonexistent/ans-probe-bin-xyz', startup_timeout_sec: 1 }));
  return null;
} }, async (client, context) => {
  const { record } = context;
  const readback = await client.request('config/read', { includeLayers: false, cwd: context.work });
  record.readbackServers = readback.config.mcp_servers;
  const thread = await client.request('thread/start', threadParams(context));
  record.thread = { id: thread.thread.id };
  record.startupNoticed = await waitNotice(record, 'mcpServer/startupStatus/updated', 8000);
  record.startupNotices = record.notices.filter((notice) => notice.method === 'mcpServer/startupStatus/updated').map(({ params }) => params);
  record.catalog = await client.request('mcpServerStatus/list', { threadId: thread.thread.id, detail: 'toolsAndAuthOnly', limit: 100 });
  const started = await client.request('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'alive check', text_elements: [] }], approvalPolicy: 'never', approvalsReviewer: 'user', sandboxPolicy: { type: 'readOnly', networkAccess: false }, model: 'probe-model' });
  record.turn = { id: started.turn.id, status: started.turn.status };
  record.turnCompleted = await waitNotice(record, 'turn/completed', 15000);
  record.turnOutcome = record.notices.find((notice) => notice.method === 'turn/completed')?.params?.turn?.status ?? null;
  record.serverRequestsDuringTurn = record.serverRequests.map((request) => request.method);
});

// ---- D：elicitation（工具处理中 server→client 请求） ----
await runCell('D-elicitation', { mode: 'message', async prepare(prepared) {
  const staging = stage('codex-mcp-probe-stage-d-');
  const fixtureAt = path.join(staging, 'echo-mcp.mjs');
  copyFileSync(fixtureSource, fixtureAt);
  const captureFile = path.join(staging, 'capture-d.json');
  prepared.fixture = { captureFile };
  prepared.overrides.push(serverOverride({ name: SERVER_NAME, command: process.execPath, args: [fixtureAt, captureFile], startup_timeout_sec: 5 }));
  return null;
} }, async (client, context) => {
  const { record, prepared } = context;
  client.setServerRequestHandler((message) => {
    if (message.method === 'mcpServer/elicitation/request') return { result: { action: 'cancel', content: null } }; // 镜像 session.ts:395 既有应答
    return { error: { code: -32601, message: `probe fail-closed: ${String(message.method)}` } };
  });
  const thread = await client.request('thread/start', threadParams(context));
  record.thread = { id: thread.thread.id };
  await waitFile(prepared.fixture.captureFile);
  const before = record.notices.length;
  try {
    record.directCall = await client.request('mcpServer/tool/call', { threadId: thread.thread.id, server: SERVER_NAME, tool: 'elicit_probe', arguments: {} }, 12000);
  } catch (error) {
    record.directCallError = String(error);
  }
  await sleep(400);
  record.callNotices = record.notices.slice(before).map(({ method, params }) => ({ method, params }));
  record.elicitationRequests = record.serverRequests.filter((request) => request.method === 'mcpServer/elicitation/request').map(({ params }) => params);
  record.otherServerRequests = record.serverRequests.filter((request) => request.method !== 'mcpServer/elicitation/request').map((request) => request.method);
  record.fixtureElicitations = existsSync(prepared.fixture.captureFile) ? JSON.parse(readFileSync(prepared.fixture.captureFile, 'utf8')).elicitations : null;
});

// ---- D2：elicitation 显式声明（客户端能力位打开） ----
await runCell('D2-elicitation-optin', { mode: 'message', capabilities: { experimentalApi: true, explicitGatewayOauth: true, mcpServerOpenaiFormElicitation: true }, async prepare(prepared) {
  const staging = stage('codex-mcp-probe-stage-d2-');
  const fixtureAt = path.join(staging, 'echo-mcp.mjs');
  copyFileSync(fixtureSource, fixtureAt);
  const captureFile = path.join(staging, 'capture-d2.json');
  prepared.fixture = { captureFile };
  prepared.overrides.push(serverOverride({ name: SERVER_NAME, command: process.execPath, args: [fixtureAt, captureFile], startup_timeout_sec: 5 }));
  return null;
} }, async (client, context) => {
  const { record, prepared } = context;
  client.setServerRequestHandler((message) => {
    if (message.method === 'mcpServer/elicitation/request') return { result: { action: 'cancel', content: null } };
    return { error: { code: -32601, message: `probe fail-closed: ${String(message.method)}` } };
  });
  const thread = await client.request('thread/start', threadParams(context));
  record.thread = { id: thread.thread.id };
  await waitFile(prepared.fixture.captureFile);
  try {
    record.directCall = await client.request('mcpServer/tool/call', { threadId: thread.thread.id, server: SERVER_NAME, tool: 'elicit_probe', arguments: {} }, 12000);
  } catch (error) {
    record.directCallError = String(error);
  }
  await sleep(400);
  record.elicitationRequests = record.serverRequests.filter((request) => request.method === 'mcpServer/elicitation/request').map(({ params }) => params);
  record.otherServerRequests = record.serverRequests.filter((request) => request.method !== 'mcpServer/elicitation/request').map((request) => request.method);
  record.fixtureElicitations = existsSync(prepared.fixture.captureFile) ? JSON.parse(readFileSync(prepared.fixture.captureFile, 'utf8')).elicitations : null;
});

// ---- D3：elicitation extensions 声明（openai/form） ----
await runCell('D3-elicitation-extensions', { mode: 'message', capabilities: { experimentalApi: true, explicitGatewayOauth: true, extensions: { 'openai/form': {} } }, async prepare(prepared) {
  const staging = stage('codex-mcp-probe-stage-d3-');
  const fixtureAt = path.join(staging, 'echo-mcp.mjs');
  copyFileSync(fixtureSource, fixtureAt);
  const captureFile = path.join(staging, 'capture-d3.json');
  prepared.fixture = { captureFile };
  prepared.overrides.push(serverOverride({ name: SERVER_NAME, command: process.execPath, args: [fixtureAt, captureFile], startup_timeout_sec: 5 }));
  return null;
} }, async (client, context) => {
  const { record, prepared } = context;
  client.setServerRequestHandler((message) => {
    if (message.method === 'mcpServer/elicitation/request') return { result: { action: 'cancel', content: null } };
    return { error: { code: -32601, message: `probe fail-closed: ${String(message.method)}` } };
  });
  const thread = await client.request('thread/start', threadParams(context));
  record.thread = { id: thread.thread.id };
  await waitFile(prepared.fixture.captureFile);
  try {
    record.directCall = await client.request('mcpServer/tool/call', { threadId: thread.thread.id, server: SERVER_NAME, tool: 'elicit_probe', arguments: {} }, 12000);
  } catch (error) {
    record.directCallError = String(error);
  }
  await sleep(400);
  record.elicitationRequests = record.serverRequests.filter((request) => request.method === 'mcpServer/elicitation/request').map(({ params }) => params);
  record.fixtureElicitations = existsSync(prepared.fixture.captureFile) ? JSON.parse(readFileSync(prepared.fixture.captureFile, 'utf8')).elicitations : null;
});
await runCell('B-model-driven-turn', { mode: 'mcp-call', async prepare(prepared) {
  const staging = stage('codex-mcp-probe-stage-b-');
  const fixtureAt = path.join(staging, 'echo-mcp.mjs');
  copyFileSync(fixtureSource, fixtureAt);
  const captureFile = path.join(staging, 'capture-b.json');
  prepared.fixture = { captureFile };
  prepared.overrides.push(serverOverride({ name: SERVER_NAME, command: process.execPath, args: [fixtureAt, captureFile], startup_timeout_sec: 5, tool_timeout_sec: 5 }));
  return null;
} }, async (client, context) => {
  const { record, prepared } = context;
  const thread = await client.request('thread/start', threadParams(context));
  record.thread = { id: thread.thread.id };
  await waitFile(prepared.fixture.captureFile);
  const started = await client.request('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'call the echo probe', text_elements: [] }], approvalPolicy: 'never', approvalsReviewer: 'user', sandboxPolicy: { type: 'readOnly', networkAccess: false }, model: 'probe-model' });
  record.turn = { id: started.turn.id, status: started.turn.status };
  record.turnCompleted = await waitNotice(record, 'turn/completed', 25000);
  record.turnOutcome = record.notices.find((notice) => notice.method === 'turn/completed')?.params?.turn?.status ?? null;
  record.itemLifecycle = record.notices.filter((notice) => notice.method === 'item/started' || notice.method === 'item/completed').map(({ method, params }) => ({ method, params }));
  record.mcpItems = record.itemLifecycle.filter((entry) => entry.params?.item?.type === 'mcpToolCall');
  record.otherMcpNotices = record.notices.filter((notice) => notice.method.includes('mcpToolCall') || notice.method.includes('progress')).map(({ method, params }) => ({ method, params }));
  record.fixtureCalls = existsSync(prepared.fixture.captureFile) ? JSON.parse(readFileSync(prepared.fixture.captureFile, 'utf8')).calls : null;
  record.finalMessages = record.notices.filter((notice) => notice.params?.item?.type === 'agentMessage').map((notice) => notice.params.item.text);
  record.serverRequestsDuringTurn = record.serverRequests.map((request) => request.method);
});

// ---- E：审批请求面（非 ANS 姿态对照：policy=on-request + mode=prompt） ----
await runCell('E-approval-request-surface', { mode: 'mcp-call', async prepare(prepared) {
  const staging = stage('codex-mcp-probe-stage-e-');
  const fixtureAt = path.join(staging, 'echo-mcp.mjs');
  copyFileSync(fixtureSource, fixtureAt);
  const captureFile = path.join(staging, 'capture-e.json');
  prepared.fixture = { captureFile };
  prepared.overrides.push(serverOverride({ name: SERVER_NAME, command: process.execPath, args: [fixtureAt, captureFile], startup_timeout_sec: 5, tool_timeout_sec: 5, default_tools_approval_mode: 'prompt' }));
  return null;
} }, async (client, context) => {
  const { record, prepared } = context;
  client.setServerRequestHandler((message) => {
    if (message.method === 'item/tool/requestUserInput') return { result: { answers: {} } }; // 镜像 session.ts:396 既有应答
    if (message.method === 'mcpServer/elicitation/request') return { result: { action: 'cancel', content: null } };
    return { error: { code: -32601, message: `probe fail-closed: ${String(message.method)}` } };
  });
  const thread = await client.request('thread/start', { ...threadParams(context), approvalPolicy: 'on-request' });
  record.thread = { id: thread.thread.id };
  await waitFile(prepared.fixture.captureFile);
  const started = await client.request('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'call the echo probe', text_elements: [] }], approvalPolicy: 'on-request', approvalsReviewer: 'user', sandboxPolicy: { type: 'readOnly', networkAccess: false }, model: 'probe-model' });
  record.turn = { id: started.turn.id, status: started.turn.status };
  record.turnCompleted = await waitNotice(record, 'turn/completed', 25000);
  record.turnOutcome = record.notices.find((notice) => notice.method === 'turn/completed')?.params?.turn?.status ?? null;
  record.mcpItems = record.notices
    .filter((notice) => notice.method === 'item/started' || notice.method === 'item/completed')
    .filter((notice) => notice.params?.item?.type === 'mcpToolCall')
    .map(({ method, params }) => ({ method, params }));
  record.fixtureCalls = existsSync(prepared.fixture.captureFile) ? JSON.parse(readFileSync(prepared.fixture.captureFile, 'utf8')).calls : null;
  record.serverRequestsDuringTurn = record.serverRequests.map((request) => request.method);
});
for (const mode of ['approve', 'writes', 'never']) {
  await runCell(`B-mode-${mode}`, { mode: 'mcp-call', async prepare(prepared) {
    const staging = stage(`codex-mcp-probe-stage-bm-${mode}-`);
    const fixtureAt = path.join(staging, 'echo-mcp.mjs');
    copyFileSync(fixtureSource, fixtureAt);
    const captureFile = path.join(staging, `capture-${mode}.json`);
    prepared.fixture = { captureFile };
    prepared.overrides.push(serverOverride({ name: SERVER_NAME, command: process.execPath, args: [fixtureAt, captureFile], startup_timeout_sec: 5, tool_timeout_sec: 5, default_tools_approval_mode: mode }));
    return null;
  } }, async (client, context) => {
    const { record, prepared } = context;
    const readback = await client.request('config/read', { includeLayers: false, cwd: context.work });
    record.readbackServers = readback.config.mcp_servers;
    const thread = await client.request('thread/start', threadParams(context));
    record.thread = { id: thread.thread.id };
    await waitFile(prepared.fixture.captureFile);
    const started = await client.request('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'call the echo probe', text_elements: [] }], approvalPolicy: 'never', approvalsReviewer: 'user', sandboxPolicy: { type: 'readOnly', networkAccess: false }, model: 'probe-model' });
    record.turn = { id: started.turn.id, status: started.turn.status };
    record.turnCompleted = await waitNotice(record, 'turn/completed', 25000);
    record.turnOutcome = record.notices.find((notice) => notice.method === 'turn/completed')?.params?.turn?.status ?? null;
    record.mcpItems = record.notices
      .filter((notice) => notice.method === 'item/started' || notice.method === 'item/completed')
      .filter((notice) => notice.params?.item?.type === 'mcpToolCall')
      .map(({ method, params }) => ({ method, params }));
    record.fixtureCalls = existsSync(prepared.fixture.captureFile) ? JSON.parse(readFileSync(prepared.fixture.captureFile, 'utf8')).calls : null;
    record.serverRequestsDuringTurn = record.serverRequests.map((request) => request.method);
  });
}
await runCell('B2-model-driven-auto-approval', { mode: 'mcp-call', async prepare(prepared) {
  const staging = stage('codex-mcp-probe-stage-b2-');
  const fixtureAt = path.join(staging, 'echo-mcp.mjs');
  copyFileSync(fixtureSource, fixtureAt);
  const captureFile = path.join(staging, 'capture-b2.json');
  prepared.fixture = { captureFile };
  prepared.overrides.push(serverOverride({ name: SERVER_NAME, command: process.execPath, args: [fixtureAt, captureFile], startup_timeout_sec: 5, tool_timeout_sec: 5, default_tools_approval_mode: 'auto' }));
  return null;
} }, async (client, context) => {
  const { record, prepared } = context;
  const readback = await client.request('config/read', { includeLayers: false, cwd: context.work });
  record.readbackServers = readback.config.mcp_servers;
  const thread = await client.request('thread/start', threadParams(context));
  record.thread = { id: thread.thread.id };
  await waitFile(prepared.fixture.captureFile);
  const started = await client.request('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'call the echo probe', text_elements: [] }], approvalPolicy: 'never', approvalsReviewer: 'user', sandboxPolicy: { type: 'readOnly', networkAccess: false }, model: 'probe-model' });
  record.turn = { id: started.turn.id, status: started.turn.status };
  record.turnCompleted = await waitNotice(record, 'turn/completed', 25000);
  record.turnOutcome = record.notices.find((notice) => notice.method === 'turn/completed')?.params?.turn?.status ?? null;
  record.itemLifecycle = record.notices.filter((notice) => notice.method === 'item/started' || notice.method === 'item/completed').map(({ method, params }) => ({ method, params }));
  record.mcpItems = record.itemLifecycle.filter((entry) => entry.params?.item?.type === 'mcpToolCall');
  record.fixtureCalls = existsSync(prepared.fixture.captureFile) ? JSON.parse(readFileSync(prepared.fixture.captureFile, 'utf8')).calls : null;
  record.finalMessages = record.notices.filter((notice) => notice.params?.item?.type === 'agentMessage').map((notice) => notice.params.item.text);
  record.serverRequestsDuringTurn = record.serverRequests.map((request) => request.method);
});

// ---------- 自检（证据完整性；失败不阻断 JSON 输出） ----------
const byName = Object.fromEntries(results.map((record) => [record.name, record]));
const A = byName['A-root-map-live'];
const checks = [];
const check = (label, pass) => checks.push({ label, pass: Boolean(pass) });
check('A 无执行错误', A && A.error === undefined);
check('A 夹具已启动', A?.fixtureStarted === true);
check('A args 逐字往返', A?.argRoundTrip && JSON.stringify(A.argRoundTrip.actual) === JSON.stringify(A.argRoundTrip.expected));
check('A probeEnv 往返', A?.fixtureCapture?.probeEnv?.PROBE_ENV_ONE === 'space value' && A?.fixtureCapture?.probeEnv?.PROBE_ENV_TWO === 'quote"q back\\b');
check('A 直呼返回', typeof A?.directCall?.content?.[0]?.text === 'string');
check('A catalog 条目存在', Array.isArray(A?.catalog?.data) && A.catalog.data.length === 1);
check('A 直呼期间零 server request', Array.isArray(A?.serverRequestsAfterCall) && A.serverRequestsAfterCall.length === 0);
check('B turn 完成', byName['B-model-driven-turn']?.turnOutcome === 'completed');
check('B 模型请求中携带 MCP 桥工具', byName['B-model-driven-turn']?.modelRequestSummary?.[0]?.mcpBridgeTool != null);
check('B 产生 mcpToolCall item', (byName['B-model-driven-turn']?.mcpItems?.length ?? 0) > 0);
check('B 默认审批模式下调用被拒（approval policy is never）', (byName['B-model-driven-turn']?.mcpItems ?? []).some((entry) => entry.method === 'item/completed' && entry.params.item.error?.message?.includes('requires approval')));
check('B 调用全程零 server request', (byName['B-model-driven-turn']?.serverRequestsDuringTurn ?? ['missing']).length === 0);
const modeCells = { auto: byName['B2-model-driven-auto-approval'], approve: byName['B-mode-approve'], writes: byName['B-mode-writes'], never: byName['B-mode-never'] };
check('审批模式扫描：三合法值格执行、`never` 被 strict-config 拒启（枚举被枚举）',
  ['auto', 'approve', 'writes'].every((mode) => modeCells[mode]?.error === undefined)
  && modeCells.never?.error !== undefined
  && (modeCells.never?.stderrTail ?? '').includes('unknown variant `never`'));
check('审批模式扫描（ANS 姿态格）全程零 server request', ['auto', 'approve', 'writes'].every((mode) => (modeCells[mode]?.serverRequestsDuringTurn ?? ['missing']).length === 0));
const executableModes = ['auto', 'approve', 'writes'].filter((mode) => (modeCells[mode]?.fixtureCalls ?? []).some((call) => call.name === 'echo_probe' && call.args?.text === 'from fake model'));
check('E 非 ANS 姿态下审批请求经 mcpServer/elicitation/request 到达客户端（cancel 应答）', (byName['E-approval-request-surface']?.serverRequestsDuringTurn ?? []).includes('mcpServer/elicitation/request'));
check('C 线程存活（turn 完成）', byName['C-broken-server']?.turnOutcome === 'completed');
check('D 现状能力位下 elicitation 被 app-server 就地裁决（未达客户端）', (byName['D-elicitation']?.elicitationRequests?.length ?? 0) === 0 && (byName['D-elicitation']?.fixtureElicitations?.length ?? 0) > 0);
check('D2/D3 声明能力位后 elicitation 仍就地裁决（未达客户端）', (byName['D2-elicitation-optin']?.elicitationRequests?.length ?? 0) === 0 && (byName['D3-elicitation-extensions']?.elicitationRequests?.length ?? 0) === 0 && (byName['D3-elicitation-extensions']?.fixtureElicitations?.length ?? 0) > 0);

console.log(JSON.stringify({
  probe: 'codex-mcp-surface',
  pinnedCLI: '0.162.1',
  externalModelCalls: 0,
  credentials: 'fake only (loopback SSE; CODEX_API_KEY=fake-mcp-probe-only)',
  selfChecks: checks,
  approvalModeScan: {
    executableModes,
    outcomes: Object.entries(modeCells).map(([mode, cell]) => ({
      mode,
      initError: cell?.error ?? null,
      enumRejected: (cell?.stderrTail ?? '').includes('unknown variant'),
      completedItem: (cell?.mcpItems ?? []).find((item) => item.method === 'item/completed')?.params?.item ?? null,
      fixtureCalled: (cell?.fixtureCalls ?? []).some((call) => call.name === 'echo_probe'),
    })),
  },
  approvalRequestSurface: byName['E-approval-request-surface']?.serverRequests ?? null,
  cells: results,
}, null, 1));
httpServer.closeAllConnections();
await new Promise((resolve) => httpServer.close(() => resolve()));
for (const dir of stagingRoots) { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
process.exit(checks.every((entry) => entry.pass) ? 0 : 1);
