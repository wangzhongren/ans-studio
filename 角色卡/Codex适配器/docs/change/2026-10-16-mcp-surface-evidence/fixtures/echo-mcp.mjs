// ANS Codex适配器 MCP P0 探针夹具（2026-10-16，证据用一次性脚本，不进产品路径）。
// 最小 stdio MCP server（原始换行分隔 JSON-RPC，不依赖任何 MCP SDK）：启动时把 argv/cwd/env 键名
// 写入 capture 文件；提供三个工具供探针定格 app-server 面：
//   echo_probe   —— 正常返回（item/通知/结果形状）
//   hang_probe   —— 永不回应（per-call timeout 探针）
//   elicit_probe —— 处理中向客户端发 elicitation/create 请求（elicitation 面探针）
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const captureFile = process.argv[2];
const log = {
  argv: process.argv.slice(2), // = [captureFile, ...probeArgs]（argv[0..1] 是 node/script）
  cwd: process.cwd(),
  envKeys: Object.keys(process.env).sort(),
  probeEnv: {
    PROBE_ENV_ONE: process.env.PROBE_ENV_ONE ?? null,
    PROBE_ENV_TWO: process.env.PROBE_ENV_TWO ?? null,
  },
  calls: [],
  elicitations: [],
  inbound: [],
};
const persist = () => { try { writeFileSync(captureFile, JSON.stringify(log, null, 1)); } catch {} };
persist();

const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');
const pendingElicitations = new Map();
let elicitationSequence = 0;

const tools = [
  { name: 'echo_probe', description: 'controlled echo', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'hang_probe', description: 'never responds (timeout probe)', inputSchema: { type: 'object', properties: {} } },
  { name: 'elicit_probe', description: 'sends an elicitation request while handling the call', inputSchema: { type: 'object', properties: {} } },
];

async function handle(message) {
  if (message.id === undefined) { log.inbound.push({ method: message.method ?? null, id: null }); persist(); return; }
  if (pendingElicitations.has(message.id)) {
    const entry = pendingElicitations.get(message.id);
    pendingElicitations.delete(message.id);
    log.elicitations.push({ id: message.id, response: message });
    persist();
    entry.resolve(message);
    return;
  }
  log.inbound.push({ method: message.method ?? null, id: message.id });
  persist();
  if (message.method === 'initialize') {
    send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'ans-probe-mcp', version: '0.0.0' } } });
    return;
  }
  if (message.method === 'ping') { send({ jsonrpc: '2.0', id: message.id, result: {} }); return; }
  if (message.method === 'tools/list') { send({ jsonrpc: '2.0', id: message.id, result: { tools } }); return; }
  if (message.method === 'tools/call') {
    const name = message.params?.name;
    const args = message.params?.arguments ?? {};
    log.calls.push({ name, args });
    persist();
    if (name === 'echo_probe') {
      send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: `echo:${JSON.stringify(args)}` }] } });
      return;
    }
    if (name === 'hang_probe') return; // 故意永不回应
    if (name === 'elicit_probe') {
      const elicitId = `fixture-elicit-${++elicitationSequence}`;
      const outcome = await new Promise((resolve) => {
        pendingElicitations.set(elicitId, { resolve });
        send({ jsonrpc: '2.0', id: elicitId, method: 'elicitation/create', params: { message: 'ANS probe elicitation', requestedSchema: { type: 'object', properties: {} } } });
        setTimeout(() => { if (pendingElicitations.delete(elicitId)) resolve({ error: { code: -32000, message: 'no client response within fixture wait' } }); }, 8000);
      });
      send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: `elicitation outcome:${JSON.stringify(outcome.result ?? outcome.error)}` }] } });
      return;
    }
    send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: `probe fixture: unknown tool ${String(name)}` }], isError: true } });
    return;
  }
  send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `probe fixture: unsupported method ${String(message.method)}` } });
}

createInterface({ input: process.stdin }).on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  void handle(message).catch(() => {});
});
