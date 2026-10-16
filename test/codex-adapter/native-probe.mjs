// No model, login, MCP discovery, or remote API calls. Run after assembly installs the pinned CLI.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { safetyOverrides, effectiveConfig } from '../../src/common/codex-adapter/config.ts';

const override = process.argv[2];
const expectedVersion = process.argv[3] ?? '0.162.1';
const cli = override ? { command: override, prefix: [] } : {
  command: process.execPath,
  prefix: [path.join(path.dirname(createRequire(import.meta.url).resolve('@openai/codex/package.json')), 'bin/codex.js')],
};
const root = await mkdtemp(path.join(os.tmpdir(), 'ans-codex-native-probe-'));
const nativeHome = path.join(root, 'native');
const work = path.join(root, 'work');
const marker = path.join(root, 'foreign-was-launched');
const fakeServer = path.join(root, 'foreign.mjs');
const environment = { PATH: process.env.PATH, CODEX_HOME: nativeHome };

async function execute(args) {
  const child = spawn(cli.command, [...cli.prefix, ...args], { cwd: work, env: environment });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', value => { stdout += value; });
  child.stderr.on('data', value => { stderr += value; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  try {
    await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`native probe command failed: ${stderr}`))); });
    return stdout;
  } finally { clearTimeout(timer); }
}

async function readConfiguration(disabledServers, installed = []) {
  const child = spawn(cli.command, [...cli.prefix, 'app-server', '--listen', 'stdio://', '--strict-config', ...safetyOverrides(work, disabledServers, false, installed).flatMap(value => ['-c', value])], { cwd: work, env: environment });
  const pending = new Map(); let sequence = 0;
  const lines = createInterface({ input: child.stdout });
  child.stderr.resume();
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  lines.on('line', line => {
    const message = JSON.parse(line);
    const request = pending.get(message.id);
    if (request) { pending.delete(message.id); if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result); }
  });
  const failed = error => { for (const request of pending.values()) request.reject(error); pending.clear(); };
  child.on('error', failed); child.on('exit', () => failed(new Error('probe transport exited')));
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
  try {
    await request('initialize', { clientInfo: { name: 'ans_native_config_probe', version: '2.0.0' }, capabilities: { experimentalApi: true, explicitGatewayOauth: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    return effectiveConfig(await request('config/read', { includeLayers: false, cwd: work }));
  } finally { clearTimeout(timer); child.kill(); lines.close(); }
}

try {
  await mkdir(nativeHome); await mkdir(path.join(work, '.codex'), { recursive: true });
  await writeFile(fakeServer, `import { writeFileSync } from 'node:fs';writeFileSync(${JSON.stringify(marker)}, 'unexpected');`);
  await writeFile(path.join(nativeHome, 'config.toml'), `[mcp_servers.foreign_user]\ncommand=${JSON.stringify(process.execPath)}\nargs=[${JSON.stringify(fakeServer)}]\n[projects.${JSON.stringify(work)}]\ntrust_level="trusted"\n`);
  await writeFile(path.join(work, '.codex', 'config.toml'), `[mcp_servers.foreign_project]\ncommand=${JSON.stringify(process.execPath)}\nargs=[${JSON.stringify(fakeServer)}]\n`);
  const version = (await execute(['--version'])).trim();
  assert.equal(version, `codex-cli ${expectedVersion}`);
  const first = await readConfiguration([]);
  assert.equal(first.enabled.includes('foreign_user'), true);
  assert.equal(first.servers.foreign_project, undefined);
  const second = await readConfiguration(Object.keys(first.servers));
  assert.deepEqual(second.enabled, []);
  let launched = false;
  try { await access(marker); launched = true; } catch {}
  assert.equal(launched, false);
  // G-4 V2（P2）：生产编码器（白名单定义＋禁用集**合并单条** root map）的真 CLI 校验——定义携带
  // approve/tool_timeout_sec，readback 逐字往返；任何转义/解析破损 ⇒ --strict-config 拒启（进程非零退出）。
  const installed = [{ name: 'ans_probe_whitelist', command: process.execPath, args: [fakeServer, ' arg with spaces', 'quote"q', 'back\\slash'], env: { PROBE_LIT: 'lit"v' } }];
  const third = await readConfiguration(Object.keys(first.servers), installed);
  assert.deepEqual(third.enabled, [installed[0].name]);
  const entry = third.servers[installed[0].name];
  assert.equal(entry.command, process.execPath);
  assert.deepEqual(entry.args, [fakeServer, ' arg with spaces', 'quote"q', 'back\\slash']);
  assert.equal(entry.env.PROBE_LIT, 'lit"v');
  assert.equal(entry.default_tools_approval_mode, 'approve');
  assert.equal(entry.tool_timeout_sec, 300);
  assert.equal(third.servers.foreign_user.enabled, false);
  let whitelistLaunched = false;
  try { await access(marker); whitelistLaunched = true; } catch {}
  assert.equal(whitelistLaunched, false, 'config 面不启动白名单 server（应在线程期）；夹具未被 spawn');
  const schema = path.join(root, 'schema');
  await execute(['app-server', 'generate-ts', '--experimental', '--out', schema]);
  const fields = await readFile(path.join(schema, 'v2/DynamicToolCallParams.ts'), 'utf8');
  for (const name of ['threadId', 'turnId', 'callId', 'tool', 'arguments']) assert.match(fields, new RegExp(`${name}:`));
  const functionSpec = await readFile(path.join(schema, 'v2/DynamicToolFunctionSpec.ts'), 'utf8');
  for (const name of ['name', 'description', 'inputSchema']) assert.match(functionSpec, new RegExp(`${name}:`));
  assert.match(await readFile(path.join(schema, 'v2/DynamicToolSpec.ts'), 'utf8'), /"type": "function"/);
  assert.match(await readFile(path.join(schema, 'InitializeCapabilities.ts'), 'utf8'), /experimentalApi: boolean/);
  console.log(JSON.stringify({ version, mode: 'no model or auth calls', nativeMcpEnabled: second.enabled, projectConfigExcluded: true, foreignMcpStarted: launched, sandbox: second.config.sandbox_mode, approval: second.config.approval_policy, shellTool: second.config.features.shell_tool, dynamicRequestIdentities: ['threadId', 'turnId', 'callId'], experimentalApi: 'initialize accepted and schema verified', whitelistMap: { enabledAfter: third.enabled, disabledForeign: third.servers.foreign_user.enabled, approvalMode: entry.default_tools_approval_mode, toolTimeoutSec: entry.tool_timeout_sec, argsRoundTrip: entry.args.length } }));
} finally { await rm(root, { recursive: true, force: true }); }
