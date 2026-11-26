import { readdir, readFile, stat, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
const output = path.resolve(process.argv[2] ?? 'release-output');
const expectedArch = process.argv[3] ?? process.arch;
if (process.arch !== expectedArch) throw new Error(`Native smoke requires ${expectedArch}; actual ${process.arch}`);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function fileSha256(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
// Windows ZIP extraction: prefer 7-Zip (bundled on GitHub Windows runners), then PowerShell Expand-Archive.
// The ZIP is produced by electron-builder and extracts fine with macOS ditto; GNU tar on Windows chokes on
// some entry names emitted by the archiver, so tar is not used on win32.
function extractWindowsZip(zip, destination) {
  const errors = [];
  for (const sevenZip of ['7z', 'C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe']) {
    try {
      execFileSync(sevenZip, ['x', '-y', `-o${destination}`, zip], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      return;
    } catch (error) {
      errors.push(`${sevenZip}: ${error.code ?? error.message}`);
    }
  }
  const quote = value => `'${String(value).replace(/'/g, "''")}'`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath ${quote(zip)} -DestinationPath ${quote(destination)} -Force`],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    return;
  } catch (error) {
    errors.push(`Expand-Archive: ${error.code ?? error.message}`);
  }
  throw new Error(`Windows ZIP extraction failed: ${errors.join(' | ')}`);
}
const provenance = JSON.parse(await readFile('release-provenance.json', 'utf8'));
const exactRelease = provenance.sourceRef === 'v2.2.0';
const expectedVersion = provenance.sourceRef.slice(1);
const suffix = `${process.platform}-${process.arch}`;
const files = await readdir(output);
const archives = files.filter(name => name.endsWith('.zip'));
if (archives.length !== 1) throw new Error(`Expected one ZIP; received ${archives.length}`);
const archive = path.join(output, archives[0]);
const temp = await mkdtemp(path.join(os.tmpdir(), 'ans-packaged-smoke-'));
const extracted = path.join(temp, 'extracted');
await mkdir(extracted);
if (process.platform === 'darwin') execFileSync('ditto', ['-x', '-k', archive, extracted]);
else if (process.platform === 'win32') extractWindowsZip(archive, extracted);
else throw new Error('Run release verification on its actual target platform');
const rootNames = await readdir(extracted);
const appBundle = rootNames.find(name => name.endsWith('.app'));
const resources = process.platform === 'darwin' ? path.join(extracted, appBundle ?? '', 'Contents', 'Resources') : path.join(extracted, 'resources');
const executable = process.platform === 'darwin' ? path.join(extracted, appBundle ?? '', 'Contents', 'MacOS', 'ANS Studio') : path.join(extracted, 'ANS Studio.exe');
await stat(executable);
const application = path.join(resources, 'app');
if (exactRelease) {
  const platform = process.platform === 'win32' ? 'win' : 'mac';
  const packaged = JSON.parse(await readFile(path.join(application, 'package.json'), 'utf8'));
  if (packaged.version !== expectedVersion || archives[0] !== `ANS-Studio-${expectedVersion}-${platform}-${process.arch}.zip`) {
    throw new Error('Extracted package and ZIP name must match the frozen release version');
  }
}
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
if (exactRelease && smoke.version !== expectedVersion) throw new Error('Running app version differs from the frozen release');
const bundled = exactRelease ? await verifyBundledWorkflow(resources) : undefined;
const manifest = { ...provenance, platform: process.platform, arch: process.arch, node: process.version, npm: execFileSync('npm', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim(),
  lockSha256: hash(await readFile('package-lock.json')), builder: JSON.parse(await readFile('node_modules/electron-builder/package.json', 'utf8')).version,
  startedAt, finishedAt: new Date().toISOString(), unsigned: true, smoke, nativeDependencies: {sdkImports: sdkImports.trim(), codexVersion, claudeVersion}, process: run,
  ...(exactRelease ? { packageVersion: expectedVersion, bundled } : {}),
  artifact: { file: archives[0], size: (await stat(archive)).size, sha256: await fileSha256(archive) } };
await writeFile(path.join(output, `manifest-${suffix}.json`), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(output, `SHA256SUMS-${suffix}.txt`), `${manifest.artifact.sha256}  ${archives[0]}\n`);
console.log(JSON.stringify(manifest, null, 2));

async function verifyBundledWorkflow(resources) {
  const daprRoot = path.join(resources, 'dapr-runtime');
  const sourceManifest = JSON.parse(await readFile(path.join(daprRoot, 'manifest.json'), 'utf8'));
  const win = process.platform === 'win32';
  const target = `${win ? 'win' : 'mac'}-${process.arch}`;
  if (sourceManifest.target !== target || sourceManifest.daprRuntime !== '1.19.1') {
    throw new Error('Packaged Dapr version or architecture differs from the release configuration');
  }
  const files = {};
  for (const name of ['daprd', 'scheduler']) {
    const file = win ? `${name}.exe` : name;
    const expected = sourceManifest.runtime?.[name];
    const absolute = path.join(daprRoot, file);
    const bytes = (await stat(absolute)).size;
    const sha256 = await fileSha256(absolute);
    if (expected?.file !== file || expected.bytes !== bytes || expected.sha256 !== sha256) {
      throw new Error(`Packaged Dapr binary does not match its manifest: ${file}`);
    }
    files[name] = { file, bytes, sha256 };
  }
  const license = await fileSha256(path.join(daprRoot, 'DAPR-LICENSE'));
  if (sourceManifest.license?.file !== 'DAPR-LICENSE' || sourceManifest.license.sha256 !== license) {
    throw new Error('Packaged Dapr license does not match its manifest');
  }
  const workflows = {};
  for (const file of ['path-a.yaml', 'path-b.yaml', 'read-only-example.yaml']) {
    const relative = path.join('docs', 'workflows', file);
    const packaged = await fileSha256(path.join(resources, 'app', relative));
    if (packaged !== await fileSha256(relative)) throw new Error(`Packaged workflow differs from frozen source: ${file}`);
    workflows[file] = packaged;
  }
  const host = await nativeSuite('dapr-host', 'test/装配/dapr-host.test.ts', [
    'native Dapr locks its data, recovers a due Workflow timer after Scheduler loss and preserves a competing listener',
    'native supervisor reaps Scheduler and daprd when its application process is forcibly terminated',
  ], { ANS_DAPR_TEST_RESOURCE_ROOT: resources });
  const desktop = win ? await nativeSuite('desktop-path-b', 'test/测试/durable-workflow/desktop-native.test.ts', [
    'Native Windows Desktop Path B normal',
    'Native Windows Desktop Path B pending-card-restart',
    'Native Windows Desktop Path B daprd-loss-during-handback',
    'Native Windows Desktop Path B simulated-offline-before-dispatch',
  ], { ANS_W5_DAPR_ROOT: resources, ANS_W5_APP_RESOURCES: resources }) : undefined;
  return { daprVersion: sourceManifest.daprRuntime, target, files, license, workflows, host, ...(desktop ? { desktop } : {}) };
}

async function nativeSuite(name, file, required, extraEnv) {
  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
    env: { ...process.env, ...extraEnv }, encoding: 'utf8', windowsHide: true, timeout: 8 * 60_000, maxBuffer: 32 * 1024 * 1024,
  });
  const outputText = run.stdout ?? '';
  const logName = `native-${name}-${suffix}.tap`;
  await writeFile(path.join(output, logName), outputText);
  if (run.status !== 0 || run.error) {
    throw new Error(`Packaged ${name} native tests did not succeed (${run.error?.message ?? run.status}); see ${logName}`);
  }
  const lines = outputText.split(/\r?\n/);
  const successful = new Set(lines.flatMap(line => {
    const result = /^ok \d+ - ([^#]+)$/.exec(line);
    return result ? [result[1].trim()] : [];
  }));
  if (!lines.includes('# skipped 0') || required.some(test => !successful.has(test))) {
    throw new Error(`Packaged ${name} did not execute every required native test; see ${logName}`);
  }
  console.log(`Verified extracted ${suffix} ${name} (${successful.size} passed)`);
  return { passed: successful.size, skipped: 0, logSha256: hash(outputText) };
}
