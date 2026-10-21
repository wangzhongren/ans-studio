// Independent external infrastructure fixtures. No production module imports this file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
export function trace(value) {
  if (process.env.ANS_T1_TRACE) fs.appendFileSync(process.env.ANS_T1_TRACE, JSON.stringify(value) + '\n');
}
export function actions(text) {
  const marker = text.indexOf('T1:');
  if (marker >= 0) return JSON.parse(text.slice(marker + 3));
  return JSON.parse(process.env.ANS_T1_ACTIONS || '[]');
}
async function run(runtime, text, call, signal) {
  trace({ kind: 'input', runtime, text });
  for (const action of actions(text)) {
    if (action.name === '$delay') { await new Promise(r => setTimeout(r, action.ms)); continue; }
    if (action.name === '$fail') throw new Error('T1 external engine failure');
    if (action.name === '$hang') { await new Promise(r => signal?.addEventListener('abort', r, { once: true })); return; }
    const result = await call(action.name, action.args || {});
    trace({ kind: 'tool', runtime, name: action.name, args: action.args, result });
    if (signal?.aborted) return;
  }
}
export async function codexEngine(input) {
  const listeners = new Set();
  let handler, nativeId = randomUUID(), turnId = '', count = 0, stopped = false;
  const notify = (method, params) => { for (const listener of listeners) listener(method, params); };
  const finished = status => notify('turn/completed', { threadId: nativeId, turn: { id: turnId, status } });
  const engine = {
    async request(method, params) {
      if (method === 'initialize') return {};
      if (method === 'config/read') return { config: {
        features: Object.fromEntries(input.configOverrides.filter(s => /^features\./.test(s)).map(s => [s.split('=')[0].slice(9), false])),
        sandbox_mode: 'read-only', approval_policy: 'never', web_search: 'disabled', mcp_servers: {},
      } };
      if (method === 'thread/start' || method === 'thread/resume') {
        if (method === 'thread/resume') nativeId = params.threadId;
        trace({ kind: 'bound', runtime: 'codex', nativeId, resumed: method === 'thread/resume', tools: params.dynamicTools?.map(t => t.name) });
        return { thread: { id: nativeId }, sandbox: { type: 'readOnly' }, approvalPolicy: 'never' };
      }
      if (method === 'mcpServerStatus/list') return { data: [], nextCursor: null };
      if (method === 'turn/start') {
        turnId = 't1-native-' + ++count; stopped = false;
        const thisTurn = turnId;
        setTimeout(async () => {
          try {
            await run('codex', params.input.find(x => x.type === 'text').text, async (name, args) => {
              assert.ok(handler, 'actual adapter installed native execution handler');
              return handler('item/tool/call', { threadId: nativeId, turnId: thisTurn, callId: randomUUID(), namespace: null, tool: 'ans_' + name, arguments: args }, { signal: new AbortController().signal });
            });
            if (!stopped) { notify('item/completed', { threadId: nativeId, turnId: thisTurn, item: { type: 'agentMessage', text: 'T1 codex response' } }); finished('completed'); }
          } catch (error) { trace({ kind: 'error', runtime: 'codex', error: String(error) }); if (!stopped) finished('failed'); }
        }, 15);
        return { turn: { id: thisTurn, status: 'inProgress' } };
      }
      if (method === 'turn/interrupt') { stopped = true; finished('interrupted'); return {}; }
      throw new Error('Unexpected T1 RPC ' + method);
    },
    notify() {},
    onNotification(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    onServerRequest(callback) { handler = callback; },
    async close() { stopped = true; listeners.clear(); },
  };
  return engine;
}
export async function claudeSdk() {
  return { createSdkMcpServer, query({ prompt, options }) {
    assert.deepEqual(options.tools, [], 'real adapter disables native tools');
    const client = new Client({ name: 'independent-t1', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const server = options.mcpServers.ans;
    const connected = (async () => { await server.instance.connect(b); await client.connect(a); })();
    const nativeId = options.resume || randomUUID();
    let closed = false;
    const iterator = (async function* () {
      await connected;
      trace({ kind: 'bound', runtime: 'claude', nativeId, resumed: !!options.resume, tools: (await client.listTools()).tools.map(t => t.name) });
      for await (const user of prompt) {
        if (closed) return;
        const text = typeof user.message.content === 'string' ? user.message.content : user.message.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
        await options.hooks.UserPromptSubmit[0].hooks[0]({ hook_event_name: 'UserPromptSubmit', prompt_id: user.uuid, prompt: text, session_id: nativeId, transcript_path: 'temp', cwd: options.cwd }, undefined, { signal: options.abortController.signal });
        let failed = false;
        try { await run('claude', text, async (name, args) => {
          const id = randomUUID();
          const outcome = await options.hooks.PreToolUse[0].hooks[0]({ hook_event_name: 'PreToolUse', prompt_id: user.uuid, tool_name: 'mcp__ans__' + name, tool_input: args, tool_use_id: id, session_id: nativeId, transcript_path: 'temp', cwd: options.cwd, mcp_server: { name: 'ans', source: 'sdk' } }, id, { signal: options.abortController.signal });
          if (outcome.hookSpecificOutput?.permissionDecision === 'deny') return { isError: true, content: [{ type: 'text', text: 'PreToolUse denied' }] };
          return client.callTool({ name, arguments: outcome.hookSpecificOutput?.updatedInput || args }, undefined, { timeout: server.timeout });
        }, options.abortController.signal); } catch (error) { failed = true; trace({ kind: 'error', runtime: 'claude', error: String(error) }); }
        if (closed) return;
        yield { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'T1 claude response' }] }, session_id: nativeId };
        yield { type: 'result', subtype: failed ? 'error_during_execution' : 'success', is_error: failed, session_id: nativeId, user_message_uuid: user.uuid };
      }
    })();
    return Object.assign(iterator, { async interrupt() {}, close() { closed = true; void connected.then(() => client.close()).catch(() => {}); } });
  } };
}
export async function piAgentSession(options) {
  assert.equal(options.noTools, 'builtin');
  const listeners = new Set(), tools = new Map(options.customTools.map(t => [t.name, t]));
  let controller = new AbortController();
  const emit = event => { for (const listener of listeners) listener(event); };
  trace({ kind: 'bound', runtime: 'pi', tools: [...tools.keys()], nativeId: options.sessionManager.getSessionId() });
  const session = {
    thinkingLevel: 'medium',
    setThinkingLevel(level) {
      assert.ok(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(level), 'Pi SDK thinking level must be valid');
      this.thinkingLevel = level;
    },
    getActiveToolNames: () => [...tools.keys()],
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async prompt(text) {
      controller = new AbortController(); emit({ type: 'agent_start' });
      await run('pi', text, async (name, args) => {
        const tool = tools.get(name); assert.ok(tool, 'only real injected tool is callable');
        return tool.execute(randomUUID(), args, controller.signal);
      }, controller.signal);
      emit({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'T1 pi response' }], stopReason: 'stop' } });
      emit({ type: 'agent_end', messages: [] });
    },
    async abort() { controller.abort(); },
    dispose() { controller.abort(); listeners.clear(); },
  };
  return { session };
}
