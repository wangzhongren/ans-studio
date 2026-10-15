import { readdir, readFile, stat, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
const output = path.resolve(process.argv[2] ?? 'release-output');
const expectedArch = process.argv[3] ?? process.arch;
if (process.arch !== expectedArch) throw new Error(`Native smoke requires ${expectedArch}; actual ${process.arch}`);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const provenance = JSON.parse(await readFile('release-provenance.json', 'utf8'));
const files = await readdir(output);
const archives = files.filter(name => name.endsWith('.zip'));
if (archives.length !== 1) throw new Error(`Expected one ZIP; received ${archives.length}`);
const archive = path.join(output, archives[0]);
const temp = await mkdtemp(path.join(os.tmpdir(), 'ans-packaged-smoke-'));
const extracted = path.join(temp, 'extracted');
await mkdir(extracted);
if (process.platform === 'darwin') execFileSync('ditto', ['-x', '-k', archive, extracted]);
else if (process.platform === 'win32') execFileSync('tar', ['-xf', archive, '-C', extracted]);
else throw new Error('Run release verification on its actual target platform');
const rootNames = await readdir(extracted);
const appBundle = rootNames.find(name => name.endsWith('.app'));
const resources = process.platform === 'darwin' ? path.join(extracted, appBundle ?? '', 'Contents', 'Resources') : path.join(extracted, 'resources');
const executable = process.platform === 'darwin' ? path.join(extracted, appBundle ?? '', 'Contents', 'MacOS', 'ANS Studio') : path.join(extracted, 'ANS Studio.exe');
await stat(executable);
const application = path.join(resources, 'app');
await stat(path.join(application, 'app', 'main.ts'));
await stat(path.join(application, 'app', 'preload.cjs'));
for (const pkg of ['@earendil-works/pi-coding-agent', '@openai/codex', '@anthropic-ai/claude-agent-sdk']) await stat(path.join(application, 'node_modules', pkg, 'package.json'));
const forbidden = [];
async function scan(dir, relative = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = path.join(relative, entry.name);
    if (entry.name === '.env' || entry.name === '.ans' || entry.name === '.git' || entry.name === 'settings.local.json') forbidden.push(rel);
    if (entry.isDirectory()) await scan(path.join(dir, entry.name), rel);
  }
}
await scan(application);
if (forbidden.length) throw new Error(`Private runtime data in package: ${forbidden.join(', ')}`);
const home = path.join(temp, 'home');
await mkdir(home);
await mkdir(path.join(home, 'userdata'));
const resultFile = path.join(temp, 'smoke.json');
const env = {};
for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'DISPLAY']) if (process.env[key]) env[key] = process.env[key];
env.HOME = home; env.USERPROFILE = home; env.APPDATA = path.join(home, 'AppData', 'Roaming'); env.LOCALAPPDATA = path.join(home, 'AppData', 'Local');
await mkdir(env.APPDATA, { recursive: true }); await mkdir(env.LOCALAPPDATA, { recursive: true });
const nodeEnv = { ...env, ELECTRON_RUN_AS_NODE: '1' };
const moduleProbe = `import {createRequire} from 'node:module';import{pathToFileURL}from'node:url';const r=createRequire(pathToFileURL(process.cwd()+'/package.json'));await import(pathToFileURL(process.cwd()+'/node_modules/@earendil-works/pi-coding-agent/dist/index.js').href);await import(pathToFileURL(process.cwd()+'/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs').href);const p=r('@silvia-odwyer/photon-node');if(typeof p.PhotonImage!=='function')throw Error('Pi photon WASM missing');console.log('PACKAGED_SDK_IMPORTS_OK')`;
const sdkImports = execFileSync(executable, ['--input-type=module', '-e', moduleProbe], { cwd: application, env: nodeEnv, encoding: 'utf8', timeout: 45000 });
if (!sdkImports.includes('PACKAGED_SDK_IMPORTS_OK')) throw new Error('Packaged SDK import probe did not complete');
const codexVersion = execFileSync(executable, [path.join(application, 'node_modules/@openai/codex/bin/codex.js'), '--version'], { cwd: home, env: nodeEnv, encoding: 'utf8', timeout: 30000 }).trim();
if (!codexVersion.includes('0.162.1')) throw new Error('Unexpected packaged Codex native version: '+codexVersion);
const claudeBinary = path.join(application, 'node_modules', '@anthropic-ai', `claude-agent-sdk-${process.platform}-${process.arch}`, process.platform === 'win32' ? 'claude.exe' : 'claude');
const claudeVersion = execFileSync(claudeBinary, ['--version'], { cwd: home, env, encoding: 'utf8', timeout: 30000 }).trim();
if (!claudeVersion) throw new Error('Packaged Claude native version empty');
const startedAt = new Date().toISOString();
const run = await new Promise((resolve, reject) => {
  const child = spawn(executable, ['--ans-packaged-smoke', resultFile, '--user-data-dir=' + path.join(home, 'userdata')], { env, cwd: home, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout = (stdout + data).slice(-32000); });
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-32000); });
  const timeout = setTimeout(() => { child.kill(); reject(new Error('Packaged UI smoke timed out after 90 seconds')); }, 90000);
  child.on('error', error => { clearTimeout(timeout); reject(error); });
  child.on('exit', (code, signal) => { clearTimeout(timeout); resolve({ code, signal, stdout, stderr }); });
});
if (run.code !== 0) throw new Error(`Packaged executable failed: ${JSON.stringify(run)}`);
const smoke = JSON.parse(await readFile(resultFile, 'utf8'));
if (smoke.ok !== true || smoke.isPackaged !== true || smoke.arch !== process.arch || smoke.platform !== process.platform) throw new Error(`Packaged smoke failed: ${JSON.stringify(smoke)}`);
const bytes = await readFile(archive);
const manifest = { ...provenance, platform: process.platform, arch: process.arch, node: process.version, npm: execFileSync('npm', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim(),
  lockSha256: hash(await readFile('package-lock.json')), builder: JSON.parse(await readFile('node_modules/electron-builder/package.json', 'utf8')).version,
  startedAt, finishedAt: new Date().toISOString(), unsigned: true, smoke, nativeDependencies: {sdkImports: sdkImports.trim(), codexVersion, claudeVersion}, process: run,
  artifact: { file: archives[0], size: bytes.length, sha256: hash(bytes) } };
const suffix = `${process.platform}-${process.arch}`;
await writeFile(path.join(output, `manifest-${suffix}.json`), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(output, `SHA256SUMS-${suffix}.txt`), `${manifest.artifact.sha256}  ${archives[0]}\n`);
console.log(JSON.stringify(manifest, null, 2));
