// T3 key-matrix probe (2026-10-16, Codex适配器 implementation round).
// Drives the pinned codex 0.162.1 app-server as a minimal JSON-RPC client against a
// local fake Responses SSE endpoint. No external network, no real credentials.
// Purpose: determine which TOML key(s) inject the built-in web_search tool into the
// outbound Responses request, and capture config/read readback + raw item notifications.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cliJs = path.resolve('node_modules/@openai/codex/bin/codex.js');
const httpRequests = [];
const server = createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  let body;
  try { body = JSON.parse(raw); } catch { res.writeHead(400); res.end('controlled invalid request'); return; }
  httpRequests.push({ url: req.url, body, auth: req.headers.authorization ?? null });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const item = { type: 'message', id: 'msg_probe', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'controlled done', annotations: [] }] };
  const response = { id: 'resp_probe', object: 'response', created_at: 1, status: 'in_progress', model: 'probe-model', output: [] };
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  send('response.created', { response });
  send('response.output_item.added', { output_index: 0, item: { ...item, content: [] } });
  send('response.output_item.done', { output_index: 0, item });
  send('response.completed', { response: { ...response, status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
  res.end();
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()); });
const port = server.address().port;

function providerDefinition(name, extraProperties = '') {
  return `model_providers.${name}={name="ANS Probe",base_url="http://127.0.0.1:${port}/v1",env_key="CODEX_API_KEY",wire_api="responses",requires_openai_auth=false${extraProperties}}`;
}

async function runCell(cell) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'codex-t3-home-'));
  const work = mkdtempSync(path.join(os.tmpdir(), 'codex-t3-work-'));
  const child = spawn(process.execPath, [
    cliJs, 'app-server', '--listen', 'stdio://', '--strict-config',
    ...cell.overrides.flatMap(value => ['-c', value]),
    '-c', providerDefinition('ans_probe', cell.providerExtra ?? ''),
    '-c', 'model_provider="ans_probe"', '-c', 'model="probe-model"',
  ], { cwd: work, env: { PATH: process.env.PATH, CODEX_HOME: home, CODEX_API_KEY: 'fake-t3-probe-only' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-2000); });
  const pending = new Map();
  const notices = [];
  let sequence = 0;
  const rl = createInterface({ input: child.stdout });
  rl.on('line', line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && pending.has(message.id)) { const entry = pending.get(message.id); pending.delete(message.id); clearTimeout(entry.timer); entry.deliver(message); }
    else if (message.method) notices.push(message);
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`probe ${method} timed out`)); }, 20000);
    pending.set(id, { timer, deliver: message => message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result) });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
  const notify = (method, params) => child.stdin.write(JSON.stringify({ method, params }) + '\n');
  const record = { name: cell.name, overrides: cell.overrides };
  const httpMark = httpRequests.length;
  try {
    await request('initialize', { clientInfo: { name: 'ans_t3_probe', version: '0.0.0' }, capabilities: { experimentalApi: true, explicitGatewayOauth: true } });
    notify('initialized', {});
    const inspected = await request('config/read', { includeLayers: false, cwd: work });
    record.configRead = { web_search: inspected.config.web_search, tools: inspected.config.tools ?? null };
    const thread = await request('thread/start', {
      model: 'probe-model', modelProvider: 'ans_probe', cwd: work, sandbox: 'read-only', approvalPolicy: 'never', approvalsReviewer: 'user',
      config: { sandbox_mode: 'read-only', approval_policy: 'never', approvals_reviewer: 'user', web_search: cell.threadWebSearch, ...(cell.threadTools === undefined ? {} : { tools: cell.threadTools }) },
      developerInstructions: 't3 probe', ephemeral: true,
    });
    record.threadStarted = true;
    const started = await request('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 't3 probe turn', text_elements: [] }], approvalPolicy: 'never', approvalsReviewer: 'user', sandboxPolicy: { type: 'readOnly', networkAccess: false }, model: 'probe-model' });
    record.turnId = started.turn.id;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !notices.some(notice => notice.method === 'turn/completed')) await new Promise(resolve => setTimeout(resolve, 20));
    const request0 = httpRequests[httpMark]?.body;
    record.outboundTools = request0?.tools ?? null;
    record.outboundToolTypes = Array.isArray(request0?.tools) ? request0.tools.map(tool => tool?.type) : null;
    record.notificationMethods = [...new Set(notices.map(notice => notice.method))];
    record.turnCompleted = notices.some(notice => notice.method === 'turn/completed');
  } catch (error) {
    record.error = String(error);
  } finally {
    record.stderrTail = stderr.slice(-500);
    child.stdin.end();
    await new Promise(resolve => { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    rl.close();
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
  return record;
}

const cells = [
  { name: 'off-baseline', overrides: ['web_search="disabled"'], threadWebSearch: 'disabled' },
  { name: 't1-top-level-live', overrides: ['web_search="live"'], threadWebSearch: 'live' },
  { name: 't2-tools-key-only', overrides: ['web_search="disabled"', 'tools.web_search=true'], threadWebSearch: 'disabled', threadTools: { web_search: true } },
  { name: 't3-both-keys', overrides: ['web_search="live"', 'tools.web_search=true'], threadWebSearch: 'live', threadTools: { web_search: true } },
  { name: 't1-cap-external-web-access', overrides: ['web_search="live"'], threadWebSearch: 'live', providerExtra: ',capabilities={external_web_access=true}' },
];
const results = [];
for (const cell of cells) results.push(await runCell(cell));
console.log(JSON.stringify({ pinnedCLI: '0.162.1', externalModelCalls: 0, credentials: 'fake only', cells: results }, null, 1));
server.closeAllConnections();
await new Promise(resolve => server.close(() => resolve()));
assert.equal(httpRequests.length > 0, true);
process.exit(0);
