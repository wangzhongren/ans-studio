import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { SOURCE_REF, SOURCE_SHA } from './release-policy.mjs';
const assets = path.resolve(process.argv[2] ?? 'release-assets');
const provenanceRoot = path.resolve(process.argv[3] ?? 'release-provenance');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceRef = process.env.SOURCE_REF ?? SOURCE_REF;
const exactRelease = sourceRef === 'v2.2.0';
if (!exactRelease && sourceRef !== SOURCE_REF) throw new Error(`Unsupported release source ${sourceRef}`);
const expectedVersion = sourceRef.slice(1);
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const commit = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const expectedSha = exactRelease ? process.env.RELEASE_SOURCE_SHA : SOURCE_SHA;
const git = (...args) => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 });
let expectedTree, expectedLock;
if (exactRelease) {
  if (!commit(expectedSha) || expectedSha !== process.env.GITHUB_SHA || git('rev-parse', 'HEAD').toString().trim() !== expectedSha) {
    throw new Error('Expected release SHA, workflow SHA and collection checkout must match');
  }
  expectedTree = git('rev-parse', `${expectedSha}^{tree}`).toString().trim();
  expectedLock = hash(git('show', `${expectedSha}:package-lock.json`));
}
const names = await readdir(assets);
const manifestNames = names.filter(name => /^manifest-.*\.json$/.test(name));
const targets = new Set(['darwin-arm64', 'darwin-x64', 'win32-x64']);
if (manifestNames.length !== 3) throw new Error('Exactly three platform manifests required');
const seen = new Set(), expectedZips = new Set();
let canonical;
for (const name of manifestNames) {
  const m = JSON.parse(await readFile(path.join(assets, name), 'utf8'));
  const target = `${m.platform}-${m.arch}`;
  if (!targets.has(target) || seen.has(target) || name !== `manifest-${target}.json`) throw new Error(`Unexpected/duplicate target: ${target}`);
  seen.add(target);
  if (m.sourceRef !== sourceRef || m.sourceSha !== expectedSha || !commit(m.overlaySha) || !commit(m.actualTree)) throw new Error('Invalid release source identity');
  if (process.env.GITHUB_SHA && m.overlaySha !== process.env.GITHUB_SHA) throw new Error('Build overlay differs from release workflow commit');
  if (exactRelease && (m.overlaySha !== expectedSha || m.actualTree !== expectedTree || m.lockSha256 !== expectedLock ||
    m.packageVersion !== expectedVersion || m.smoke?.version !== expectedVersion || m.overlayPatchSha256 !== hash(Buffer.alloc(0)))) {
    throw new Error(`Frozen v2.2.0 source, version or empty overlay differs: ${target}`);
  }
  if (!m.smoke?.checks || ['entry','rootMounted','driver','csp','cspViolations','dom','preload','ipc','importDisabled','missingConfiguration','settingsEntryDisabled','envPathMatches','console','load'].some(key => m.smoke.checks[key] !== true)) throw new Error(`Incomplete UI checks: ${target}`);
  if (!m.smoke?.ok || !m.smoke.isPackaged || m.smoke.arch !== m.arch || m.smoke.platform !== m.platform || m.process?.code !== 0) throw new Error(`Packaged smoke not verified: ${target}`);
  if (!m.nativeDependencies?.sdkImports?.includes('PACKAGED_SDK_IMPORTS_OK') || !m.nativeDependencies.codexVersion?.includes('0.162.1') || !m.nativeDependencies.claudeVersion) throw new Error(`Native dependencies not verified: ${target}`);
  if (exactRelease) verifyBundledWorkflow(m, target);
  if (canonical && ['sourceRef','sourceSha','overlaySha','actualTree','lockSha256','overlayPatchSha256','builder'].some(key => canonical[key] !== m[key])) throw new Error('Cross-platform build provenance differs');
  canonical ??= m;
  const artifact = m.artifact;
  if (!artifact || path.basename(artifact.file) !== artifact.file || !artifact.file.endsWith('.zip') || expectedZips.has(artifact.file)) throw new Error('Invalid artifact name');
  if (exactRelease && artifact.file !== `ANS-Studio-${expectedVersion}-${m.platform === 'win32' ? 'win' : 'mac'}-${m.arch}.zip`) {
    throw new Error(`ZIP name does not match the exact package version: ${target}`);
  }
  expectedZips.add(artifact.file);
  const artifactPath = path.join(assets, artifact.file);
  const actualHash = createHash('sha256');
  for await (const bytes of createReadStream(artifactPath)) actualHash.update(bytes);
  if ((await stat(artifactPath)).size !== artifact.size || actualHash.digest('hex') !== artifact.sha256) throw new Error(`Artifact hash/size mismatch: ${artifact.file}`);
  const sums = await readFile(path.join(assets, `SHA256SUMS-${target}.txt`), 'utf8');
  if (sums !== `${artifact.sha256}  ${artifact.file}\n`) throw new Error('Checksum file does not bind exact artifact');
}
if (names.filter(name => name.endsWith('.zip')).some(name => !expectedZips.has(name)) || expectedZips.size !== 3) throw new Error('Unexpected archive set');
const dirs = await readdir(provenanceRoot, { withFileTypes: true });
if (dirs.length !== 3 || dirs.some(dir => !dir.isDirectory())) throw new Error('Three independent provenance artifacts required');
let patchBytes, provenance;
for (const dir of dirs) {
  const candidate = JSON.parse(await readFile(path.join(provenanceRoot, dir.name, 'release-provenance.json'), 'utf8'));
  const patch = await readFile(path.join(provenanceRoot, dir.name, 'overlay.patch'));
  if (exactRelease && (patch.length !== 0 || !Array.isArray(candidate.overlayPaths) || candidate.overlayPaths.length ||
    !Array.isArray(candidate.excludedChanges) || candidate.excludedChanges.length)) {
    throw new Error('v2.2.0 provenance must originate from the unmodified frozen source tree');
  }
  if (hash(patch) !== canonical.overlayPatchSha256 || ['sourceRef','sourceSha','overlaySha','actualTree','overlayPatchSha256'].some(key => candidate[key] !== canonical[key])) throw new Error('Overlay patch/provenance not bound to native build manifests');
  if (provenance && JSON.stringify(candidate) !== JSON.stringify(provenance)) throw new Error('Platform provenance artifacts differ');
  provenance = candidate; patchBytes = patch;
}
await writeFile(path.join(assets, 'overlay.patch'), patchBytes);
await writeFile(path.join(assets, 'release-provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
await writeFile(path.join(assets, 'SHA256SUMS-overlay.txt'), `${hash(patchBytes)}  overlay.patch\n${hash(await readFile(path.join(assets, 'release-provenance.json')))}  release-provenance.json\n`);
console.log('RELEASE_ASSET_SET_VERIFIED darwin-arm64 darwin-x64 win32-x64');

function verifyBundledWorkflow(manifest, target) {
  const actual = manifest.bundled;
  const win = manifest.platform === 'win32';
  const proved = (result, minimum) => Number.isSafeInteger(result?.passed) && result.passed >= minimum &&
    result.skipped === 0 && digest(result.logSha256);
  if (actual?.daprVersion !== '1.19.1' || actual.target !== `${win ? 'win' : 'mac'}-${manifest.arch}` ||
    !digest(actual.license) || !proved(actual.host, 3) || (win && !proved(actual.desktop, 6))) {
    throw new Error(`Missing executable-level Dapr test evidence: ${target}`);
  }
  for (const name of ['daprd', 'scheduler']) {
    const entry = actual.files?.[name];
    if (entry?.file !== `${name}${win ? '.exe' : ''}` || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || !digest(entry.sha256)) {
      throw new Error(`Missing bundled ${name} evidence: ${target}`);
    }
  }
  for (const file of ['path-a.yaml', 'path-b.yaml', 'read-only-example.yaml']) {
    const source = git('show', `${expectedSha}:docs/workflows/${file}`);
    if (actual.workflows?.[file] !== hash(source)) throw new Error(`Workflow source identity differs: ${target}/${file}`);
  }
}
