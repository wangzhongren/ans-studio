// T3②/T3③ probe (2026-10-16, Codex适配器 implementation round).
// Pinned codex 0.162.1 app-server as a minimal JSON-RPC client against a local fake
// Responses SSE endpoint that returns a web_search_call item. Captures the raw
// app-server item notifications (ThreadItem webSearch shape) and tests whether an
// unknown `response.web_search_call.in_progress` SSE frame is tolerated.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cliJs = path.resolve('node_modules/@openai/codex/bin/codex.js');
let childEventMode = false;
const httpBodies = [];
const server = createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  let body;
  try { body = JSON.parse(raw); } catch { res.writeHead(400); res.end('controlled invalid request'); return; }
  httpBodies.push(body);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const searchItem = { type: 'web_search_call', id: 'ws_probe_1', status: 'completed', action: { type: 'search', query: 'controlled probe query' } };
  const messageItem = { type: 'message', id: 'msg_probe_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'controlled result text', annotations: [] }] };
  const response = { id: 'resp_probe', object: 'response', created_at: 1, status: 'in_progress', model: 'probe-model', output: [] };
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  send('response.created', { response });
  if (childEventMode) send('response.web_search_call.in_progress', { item_id: 'ws_probe_1', output_index: 0 });
  send('response.output_item.added', { output_index: 0, item: { ...searchItem } });
  send('response.output_item.done', { output_index: 0, item: searchItem });
  send('response.output_item.added', { output_index: 1, item: { ...messageItem, content: [] } });
  send('response.output_item.done', { output_index: 1, item: messageItem });
  send('response.completed', { response: { ...response, status: 'completed', output: [searchItem, messageItem], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
  res.end();
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()); });
const port = server.address().port;

async function runCell(name, withChildEvent) {
  childEventMode = withChildEvent;
  const home = mkdtempSync(path.join(os.tmpdir(), 'codex-t3b-home-'));
  const work = mkdtempSync(path.join(os.tmpdir(), 'codex-t3b-work-'));
  const provider = `model_providers.ans_probe={name="ANS Probe",base_url="http://127.0.0.1:${port}/v1",env_key="CODEX_API_KEY",wire_api="responses",requires_openai_auth=false}`;
  const child = spawn(process.execPath, [cliJs, 'app-server', '--listen', 'stdio://', '--strict-config', '-c', 'web_search="live"', '-c', provider, '-c', 'model_provider="ans_probe"', '-c', 'model="probe-model"'],
    { cwd: work, env: { PATH: process.env.PATH, CODEX_HOME: home, CODEX_API_KEY: 'fake-t3-probe-only' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-3000); });
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
  const record = { name, childEventFrame: withChildEvent };
  try {
    await request('initialize', { clientInfo: { name: 'ans_t3b_probe', version: '0.0.0' }, capabilities: { experimentalApi: true, explicitGatewayOauth: true } });
    notify('initialized', {});
    const thread = await request('thread/start', { model: 'probe-model', modelProvider: 'ans_probe', cwd: work, sandbox: 'read-only', approvalPolicy: 'never', approvalsReviewer: 'user', config: { sandbox_mode: 'read-only', approval_policy: 'never', approvals_reviewer: 'user', web_search: 'live' }, developerInstructions: 't3b probe', ephemeral: true });
    const started = await request('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 't3b probe turn', text_elements: [] }], approvalPolicy: 'never', approvalsReviewer: 'user', sandboxPolicy: { type: 'readOnly', networkAccess: false }, model: 'probe-model' });
    record.turnId = started.turn.id;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !notices.some(notice => notice.method === 'turn/completed')) await new Promise(resolve => setTimeout(resolve, 20));
    record.turnCompleted = notices.some(notice => notice.method === 'turn/completed');
    record.completedStatus = notices.find(notice => notice.method === 'turn/completed')?.params?.turn?.status ?? null;
    record.itemNotifications = notices.filter(notice => notice.method === 'item/started' || notice.method === 'item/completed').map(notice => ({ method: notice.method, params: notice.params }));
    record.errorNotifications = notices.filter(notice => notice.method === 'error').map(notice => notice.params);
    record.otherMethods = [...new Set(notices.map(notice => notice.method))].filter(method => !method.startsWith('item/') && method !== 'turn/completed' && method !== 'error');
  } catch (error) {
    record.error = String(error);
  } finally {
    record.stderrTail = stderr.slice(-800);
    child.stdin.end();
    await new Promise(resolve => { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    rl.close();
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
  return record;
}

const results = [await runCell('websearch-call-item', false), await runCell('child-event-in-progress', true)];
console.log(JSON.stringify({ pinnedCLI: '0.162.1', externalModelCalls: 0, credentials: 'fake only', httpRequests: httpBodies.length, cells: results }, null, 1));
server.closeAllConnections();
await new Promise(resolve => server.close(() => resolve()));
assert.equal(httpBodies.length > 0, true);
process.exit(0);
