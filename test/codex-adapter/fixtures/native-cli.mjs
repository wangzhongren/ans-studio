#!/usr/bin/env node
// Native-process double: JSON-RPC only; never connects to a model or external service.
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
const lines = createInterface({ input: process.stdin });
const output = value => process.stdout.write(JSON.stringify(value) + '\n');
let turn = 0;
const features = {};
let webSearch = 'disabled';
for (const arg of process.argv) {
  const match = /^features\.([a-z_0-9]+)=false$/.exec(arg);
  if (match) features[match[1]] = false;
  const search = /^web_search="([^"]*)"$/.exec(arg);
  if (search) webSearch = search[1];
}
let task = '';
const completed = status => output({ method: 'turn/completed', params: { threadId: 'process-thread', turn: { id: `process-turn-${turn}`, status } } });
lines.on('line', raw => {
  const input = JSON.parse(raw);
  if (!input.method) { if (input.id === 9000) completed('completed'); return; }
  if (input.id === undefined) return;
  const reply = result => output({ id: input.id, result });
  if (input.method === 'initialize') return reply({});
  if (input.method === 'config/read') return reply({ config: { features, sandbox_mode: 'read-only', approval_policy: 'never', web_search: webSearch, mcp_servers: {} } });
  if (input.method === 'thread/start') return reply({ thread: { id: 'process-thread' }, sandbox: { type: 'readOnly' }, approvalPolicy: 'never' });
  if (input.method === 'mcpServerStatus/list') return reply({ data: [], nextCursor: null });
  if (input.method === 'turn/start') {
    turn++; task = input.params.input[0].text;
    let childPid;
    if (task.startsWith('owned-tree:')) {
      process.on('SIGTERM', () => {});
      const marker = task.slice('owned-tree:'.length);
      const ownedChild = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setTimeout(()=>require('fs').writeFileSync(process.argv[1],'orphan write'),900);setInterval(()=>{},100);", marker], { stdio: 'ignore' });
      childPid = ownedChild.pid;
    }
    reply({ turn: { id: `process-turn-${turn}` } });
    output({ id: 9000, method: 'item/tool/call', params: { threadId: 'process-thread', turnId: `process-turn-${turn}`, callId: `process-call-${turn}`, namespace: null, tool: 'ans_probe', arguments: childPid ? { childPid } : {} } });
    if (task === 'cancel-upstream') setTimeout(() => output({ method: 'serverRequest/resolved', params: { threadId: 'process-thread', requestId: 9000 } }), 20);
    return;
  }
  if (input.method === 'turn/interrupt') { reply({}); completed('interrupted'); return; }
  output({ id: input.id, error: { message: 'unexpected fake native RPC' } });
});
