// ANS Codex适配器 G-5 wave-2 探针（2026-10-16，一次性证据脚本，不进产品路径）。
// 对上：运行时核心评估 §七 A3/A4（`角色卡/运行时核心/docs/fix/2026-10-16_assess_reasoning-and-effort.md`）。
// 环境：固定 codex 0.162.1 真 app-server 进程 + 本地 loopback 假 Responses SSE 端点；
//       无任何真实网关请求——上游面全部由本地假端点承答，凭据为假值。
// 单元格：
//   R0  控制格：无推理参数 → 上游请求体无 reasoning 键（未设＝零参数佐证）
//   R1  A3：假 SSE 注入 reasoning item（summary/content）+ 三个增量帧 → app-server 通知/item 形状逐字
//   R2  A4：-c model_reasoning_effort="high" → config/read 回读 + 上游请求体 reasoning 落点
//   R3  A4：-c model_reasoning_effort="bogus" → 回读 + 上游值 + 轮次结果（无效值钳制/放行形态）
//   R4  拒绝面：假端点对携带 reasoning 的请求回 400 → 通知逐字（error/turn-completed 文案、重试与否）、
//       轮次失败后同线程可续性（第二轮到接受模式）
//   R5  线程级覆盖：-c high + thread/start config model_reasoning_effort="low" → 上游值（线程覆盖语义）
//   R6  轮级覆盖：-c high + turn/start effort="low" → 上游值（per-turn 覆盖语义）
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../..');
const cliJs = path.join(repoRoot, 'node_modules/@openai/codex/bin/codex.js');
const { safetyConfig, safetyOverrides } = await import(pathToFileURL(path.join(repoRoot, 'src/common/codex-adapter/config.ts')).href);

const PROVIDER_TEMPLATE = 'model_providers.ans_probe={name="ANS Probe",base_url="http://127.0.0.1:PORT/v1",env_key="CODEX_API_KEY",wire_api="responses",requires_openai_auth=false}';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redactStderr = (text) => text.replaceAll('fake-reasoning-probe', '[FAKE-KEY]');

// ---------- 本地假 Responses SSE 端点（模型面；仅 loopback） ----------
let cellMode = 'message'; // 'message' | 'reasoning-item' | 'reject-reasoning'
let cellBodies = [];
let cellRejections = 0;
const httpServer = createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  let body;
  try { body = JSON.parse(raw); } catch { res.writeHead(400); res.end('invalid'); return; }
  cellBodies.push(body);
  if (cellMode === 'reject-reasoning' && Object.hasOwn(body, 'reasoning')) {
    cellRejections += 1;
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Unsupported parameter: reasoning', type: 'invalid_request_error', param: 'reasoning' } }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const response = { id: 'resp_probe', object: 'response', created_at: 1, status: 'in_progress', model: 'probe-model', output: [] };
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  send('response.created', { response });
  const message = { type: 'message', id: 'msg_probe_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'probe final message', annotations: [] }] };
  if (cellMode === 'reasoning-item') {
    const reasoningItem = { type: 'reasoning', id: 'rs_probe_1', summary: [{ type: 'summary_text', text: 'probe summary part one' }, { type: 'summary_text', text: 'probe summary part two' }], content: [{ type: 'reasoning_text', text: 'probe reasoning body' }], encrypted_content: null };
    send('response.output_item.added', { output_index: 0, item: { type: 'reasoning', id: 'rs_probe_1', summary: [], content: [] } });
    send('response.reasoning_summary_part.added', { item_id: 'rs_probe_1', output_index: 0, summary_index: 0, part: { type: 'summary_text', text: '' } });
    send('response.reasoning_summary_text.delta', { item_id: 'rs_probe_1', output_index: 0, summary_index: 0, delta: 'probe summary part one' });
    send('response.reasoning_summary_part.added', { item_id: 'rs_probe_1', output_index: 0, summary_index: 1, part: { type: 'summary_text', text: '' } });
    send('response.reasoning_summary_text.delta', { item_id: 'rs_probe_1', output_index: 0, summary_index: 1, delta: 'probe summary part two' });
    send('response.reasoning_text.delta', { item_id: 'rs_probe_1', output_index: 0, content_index: 0, delta: 'probe reasoning body' });
    send('response.output_item.done', { output_index: 0, item: reasoningItem });
    send('response.output_item.added', { output_index: 1, item: { ...message, content: [] } });
    send('response.output_item.done', { output_index: 1, item: message });
    send('response.completed', { response: { ...response, status: 'completed', output: [reasoningItem, message], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, output_tokens_details: { reasoning_tokens: 7 } } } });
  } else {
    send('response.output_item.added', { output_index: 0, item: { ...message, content: [] } });
    send('response.output_item.done', { output_index: 0, item: message });
    send('response.completed', { response: { ...response, status: 'completed', output: [message], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
  }
  res.end();
});
await new Promise((resolve, reject) => { httpServer.once('error', reject); httpServer.listen(0, '127.0.0.1', () => resolve()); });
const providerOverride = PROVIDER_TEMPLATE.replace('PORT', String(httpServer.address().port));

// ---------- app-server 客户端（分派顺序镜像 src/provider/codex/session.ts） ----------
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

const results = [];
async function runCell(name, options, steps) {
  const prepared = { overrides: [], mode: options.mode ?? 'message', threadConfig: undefined, turnEffort: undefined };
  const preparation = await options.prepare(prepared);
  const home = mkdtempSync(path.join(os.tmpdir(), 'codex-reasoning-probe-home-'));
  const work = mkdtempSync(path.join(os.tmpdir(), 'codex-reasoning-probe-work-'));
  cellMode = prepared.mode;
  cellBodies = [];
  cellRejections = 0;
  const overrides = [...safetyOverrides(work, [], false), providerOverride, 'model_provider="ans_probe"', 'model="probe-model"', ...prepared.overrides];
  const record = { name, overrides, notices: [], serverRequests: [], requests: [], preparation };
  const child = spawn(process.execPath, [cliJs, 'app-server', '--listen', 'stdio://', '--strict-config', ...overrides.flatMap((value) => ['-c', value])],
    { cwd: work, env: { PATH: process.env.PATH, CODEX_HOME: home, CODEX_API_KEY: 'fake-reasoning-probe' }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (data) => { stderr = (stderr + data).slice(-6000); });
  const client = openClient(child, record);
  const context = { work, home, record, client, prepared };
  try {
    await client.request('initialize', { clientInfo: { name: 'ans_reasoning_probe', version: '0.0.0' }, capabilities: { experimentalApi: true, explicitGatewayOauth: true } });
    client.notify('initialized', {});
    await steps(client, context);
  } catch (error) {
    record.error = String(error);
  } finally {
    record.stderrTail = redactStderr(stderr.slice(-2000));
    record.modelRequests = cellBodies.length;
    record.rejections = cellRejections;
    record.requestBodies = cellBodies.map((body) => ({ model: body.model, reasoning: body.reasoning ?? null, hasReasoningKey: Object.hasOwn(body, 'reasoning'), streamKeys: Object.keys(body).filter((key) => key.startsWith('reason') || key === 'stream').length > 0 ? { stream: body.stream ?? null } : undefined }));
    client.close();
    child.stdin.end();
    await new Promise((resolve) => { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 4000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    record.childExit = child.exitCode;
    try { rmSync(home, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }); } catch {}
  }
  results.push(record);
  return record;
}

const waitNotice = async (record, method, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !record.notices.some((notice) => notice.method === method)) await sleep(30);
  return record.notices.some((notice) => notice.method === method);
};
const startThread = (client, context, extraConfig = {}) => client.request('thread/start', { model: 'probe-model', modelProvider: 'ans_probe', cwd: context.work, sandbox: 'read-only', approvalPolicy: 'never', approvalsReviewer: 'user', config: { ...safetyConfig(context.work), ...extraConfig }, developerInstructions: 'reasoning surface probe', ephemeral: true });
const startTurn = (client, threadId, text, extra = {}) => client.request('turn/start', { threadId, input: [{ type: 'text', text, text_elements: [] }], approvalPolicy: 'never', approvalsReviewer: 'user', sandboxPolicy: { type: 'readOnly', networkAccess: false }, model: 'probe-model', ...extra });

// ---- R0：控制格（无推理参数） ----
await runCell('R0-control-no-effort', { mode: 'message', async prepare() { return null; } }, async (client, context) => {
  const readback = await client.request('config/read', { includeLayers: false, cwd: context.work });
  context.record.readbackEffort = readback.config.model_reasoning_effort ?? null;
  const thread = await startThread(client, context);
  await startTurn(client, thread.thread.id, 'control turn');
  context.record.turnCompleted = await waitNotice(context.record, 'turn/completed', 15000);
});

// ---- R1（A3）：reasoning item + 增量帧 ----
await runCell('R1-reasoning-item-frames', { mode: 'reasoning-item', async prepare() { return null; } }, async (client, context) => {
  const { record } = context;
  const thread = await startThread(client, context);
  await startTurn(client, thread.thread.id, 'reasoning turn');
  record.turnCompleted = await waitNotice(record, 'turn/completed', 15000);
  record.reasoningNotices = record.notices.filter((notice) => notice.method.includes('reasoning')).map(({ method, params }) => ({ method, params }));
  record.itemLifecycle = record.notices.filter((notice) => (notice.method === 'item/started' || notice.method === 'item/completed') && notice.params?.item?.type === 'reasoning').map(({ method, params }) => ({ method, params }));
  record.allItemMethods = [...new Set(record.notices.filter((notice) => notice.method.startsWith('item/')).map((notice) => notice.method))];
});

// ---- R2（A4）：-c high ----
await runCell('R2-effort-high', { mode: 'message', async prepare(prepared) { prepared.overrides.push('model_reasoning_effort="high"'); return null; } }, async (client, context) => {
  const readback = await client.request('config/read', { includeLayers: false, cwd: context.work });
  context.record.readbackEffort = readback.config.model_reasoning_effort ?? null;
  const thread = await startThread(client, context);
  await startTurn(client, thread.thread.id, 'high effort turn');
  context.record.turnCompleted = await waitNotice(context.record, 'turn/completed', 15000);
});

// ---- R3（A4）：-c bogus ----
await runCell('R3-effort-bogus', { mode: 'message', async prepare(prepared) { prepared.overrides.push('model_reasoning_effort="bogus"'); return null; } }, async (client, context) => {
  const readback = await client.request('config/read', { includeLayers: false, cwd: context.work });
  context.record.readbackEffort = readback.config.model_reasoning_effort ?? null;
  const thread = await startThread(client, context);
  await startTurn(client, thread.thread.id, 'bogus effort turn');
  context.record.turnCompleted = await waitNotice(context.record, 'turn/completed', 15000);
  context.record.turnOutcome = context.record.notices.find((notice) => notice.method === 'turn/completed')?.params?.turn?.status ?? null;
});

// ---- R4：400 拒绝面 + 同线程续跑 ----
await runCell('R4-rejection-surface', { mode: 'reject-reasoning', async prepare(prepared) { prepared.overrides.push('model_reasoning_effort="high"'); return null; } }, async (client, context) => {
  const { record } = context;
  const completions = () => record.notices.filter((notice) => notice.method === 'turn/completed').length;
  const waitCompletions = async (count, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && completions() < count) await sleep(30);
    return completions() >= count;
  };
  const thread = await startThread(client, context);
  record.threadId = thread.thread.id;
  await startTurn(client, thread.thread.id, 'rejected turn');
  record.turnCompleted = await waitCompletions(1, 20000);
  record.turnOutcome = record.notices.find((notice) => notice.method === 'turn/completed')?.params ?? null;
  record.errorNotices = record.notices.filter((notice) => notice.method === 'error').map((notice) => notice.params);
  record.statusChanges = record.notices.filter((notice) => notice.method === 'thread/status/changed').map((notice) => notice.params.status);
  record.rejectionsAtFirstFailure = cellRejections;
  record.modelRequestsAtFirstFailure = cellBodies.length;
  // 续跑：同线程、接受模式（首失败是否毁线程＝事实记录）
  cellMode = 'message';
  record.attemptedSecondTurn = true;
  try {
    record.secondTurnStartResult = await startTurn(client, thread.thread.id, 'after rejection turn');
  } catch (error) {
    record.secondTurnStartError = String(error);
  }
  record.secondTurnCompleted = await waitCompletions(2, 12000);
  record.completionOutcomes = record.notices.filter((notice) => notice.method === 'turn/completed').map((notice) => notice.params?.turn?.status ?? null);
  record.rejectionsTotal = cellRejections;
  record.modelRequestsTotal = cellBodies.length;
});

// ---- R5：线程级 config 覆盖 ----
await runCell('R5-thread-config-override', { mode: 'message', async prepare(prepared) { prepared.overrides.push('model_reasoning_effort="high"'); return null; } }, async (client, context) => {
  const thread = await startThread(client, context, { model_reasoning_effort: 'low' });
  await startTurn(client, thread.thread.id, 'thread override turn');
  context.record.turnCompleted = await waitNotice(context.record, 'turn/completed', 15000);
});

// ---- R6：轮级 effort 覆盖 ----
await runCell('R6-turn-effort-override', { mode: 'message', async prepare(prepared) { prepared.overrides.push('model_reasoning_effort="high"'); return null; } }, async (client, context) => {
  const thread = await startThread(client, context);
  await startTurn(client, thread.thread.id, 'turn override turn', { effort: 'low' });
  context.record.turnCompleted = await waitNotice(context.record, 'turn/completed', 15000);
});

// ---- R7：取消语义（thread config null / 轮级 effort null；-c 基线 high） ----
await runCell('R7-cancel-null-thread', { mode: 'message', async prepare(prepared) { prepared.overrides.push('model_reasoning_effort="high"'); return null; } }, async (client, context) => {
  const thread = await startThread(client, context, { model_reasoning_effort: null });
  await startTurn(client, thread.thread.id, 'null thread override turn');
  context.record.turnCompleted = await waitNotice(context.record, 'turn/completed', 15000);
});
await runCell('R7b-cancel-null-turn', { mode: 'message', async prepare(prepared) { prepared.overrides.push('model_reasoning_effort="high"'); return null; } }, async (client, context) => {
  const thread = await startThread(client, context);
  await startTurn(client, thread.thread.id, 'null turn override turn', { effort: null });
  context.record.turnCompleted = await waitNotice(context.record, 'turn/completed', 15000);
});
await runCell('R7c-cancel-empty-thread', { mode: 'message', async prepare(prepared) { prepared.overrides.push('model_reasoning_effort="high"'); return null; } }, async (client, context) => {
  const thread = await startThread(client, context, { model_reasoning_effort: '' });
  await startTurn(client, thread.thread.id, 'empty thread override turn');
  context.record.turnCompleted = await waitNotice(context.record, 'turn/completed', 15000);
});

// ---------- 自检 ----------
const byName = Object.fromEntries(results.map((record) => [record.name, record]));
const checks = [];
const check = (label, pass) => checks.push({ label, pass: Boolean(pass) });
check('R0 未设 ⇒ 上游无 effort 键（summary:"auto" 为平台缺省，随现状记录）', byName['R0-control-no-effort']?.requestBodies?.[0]?.hasReasoningKey === true && byName['R0-control-no-effort']?.requestBodies?.[0]?.reasoning?.effort === undefined);
check('R1 reasoning 通知到达', (byName['R1-reasoning-item-frames']?.reasoningNotices?.length ?? 0) > 0);
check('R1 reasoning item 完成态到达', (byName['R1-reasoning-item-frames']?.itemLifecycle?.length ?? 0) > 0);
check('R2 回读 high + 上游 high', byName['R2-effort-high']?.readbackEffort === 'high' && byName['R2-effort-high']?.requestBodies?.[0]?.reasoning?.effort === 'high');
check('R3 bogus 回读原样 + 上游原样/钳制（记录）', byName['R3-effort-bogus']?.readbackEffort === 'bogus');
check('R4 拒绝面通知捕获（error/turn-completed）', (byName['R4-rejection-surface']?.errorNotices?.length ?? 0) > 0 || byName['R4-rejection-surface']?.turnOutcome != null);
check('R4 同线程续跑事实已定格（成败均记录）', byName['R4-rejection-surface']?.secondTurnCompleted === true || byName['R4-rejection-surface']?.secondTurnStartError !== undefined || (byName['R4-rejection-surface']?.completionOutcomes?.length ?? 0) >= 1);
check('R5/R6 覆盖语义记录', byName['R5-thread-config-override'] !== undefined && byName['R6-turn-effort-override'] !== undefined);

console.log(JSON.stringify({
  probe: 'codex-reasoning-surface',
  pinnedCLI: '0.162.1',
  externalModelCalls: 0,
  credentials: 'fake only (loopback SSE; CODEX_API_KEY=fake-reasoning-probe)',
  selfChecks: checks,
  cells: results,
}, null, 1));
httpServer.closeAllConnections();
await new Promise((resolve) => httpServer.close(() => resolve()));
process.exit(checks.every((entry) => entry.pass) ? 0 : 1);
