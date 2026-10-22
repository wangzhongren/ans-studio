import { readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { SOURCE_REF, SOURCE_SHA } from './release-policy.mjs';
const assets = path.resolve(process.argv[2] ?? 'release-assets');
const provenanceRoot = path.resolve(process.argv[3] ?? 'release-provenance');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
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
  if (m.sourceRef !== SOURCE_REF || m.sourceSha !== SOURCE_SHA || !/^[a-f0-9]{40}$/.test(m.overlaySha) || !/^[a-f0-9]{40}$/.test(m.actualTree)) throw new Error('Invalid release source identity');
  if (process.env.GITHUB_SHA && m.overlaySha !== process.env.GITHUB_SHA) throw new Error('Build overlay differs from release workflow commit');
  if (!m.smoke?.checks || ['entry','rootMounted','driver','csp','cspViolations','dom','preload','ipc','importDisabled','missingConfiguration','settingsEntryDisabled','envPathMatches','console','load'].some(key => m.smoke.checks[key] !== true)) throw new Error(`Incomplete UI checks: ${target}`);
  if (!m.smoke?.ok || !m.smoke.isPackaged || m.smoke.arch !== m.arch || m.smoke.platform !== m.platform || m.process?.code !== 0) throw new Error(`Packaged smoke not verified: ${target}`);
  if (!m.nativeDependencies?.sdkImports?.includes('PACKAGED_SDK_IMPORTS_OK') || !m.nativeDependencies.codexVersion?.includes('0.162.1') || !m.nativeDependencies.claudeVersion) throw new Error(`Native dependencies not verified: ${target}`);
  if (canonical && ['sourceRef','sourceSha','overlaySha','actualTree','lockSha256','overlayPatchSha256','builder'].some(key => canonical[key] !== m[key])) throw new Error('Cross-platform build provenance differs');
  canonical ??= m;
  const artifact = m.artifact;
  if (!artifact || path.basename(artifact.file) !== artifact.file || !artifact.file.endsWith('.zip') || expectedZips.has(artifact.file)) throw new Error('Invalid artifact name');
  expectedZips.add(artifact.file);
  const bytes = await readFile(path.join(assets, artifact.file));
  if (bytes.length !== artifact.size || hash(bytes) !== artifact.sha256) throw new Error(`Artifact hash/size mismatch: ${artifact.file}`);
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
  if (hash(patch) !== canonical.overlayPatchSha256 || ['sourceRef','sourceSha','overlaySha','actualTree','overlayPatchSha256'].some(key => candidate[key] !== canonical[key])) throw new Error('Overlay patch/provenance not bound to native build manifests');
  if (provenance && JSON.stringify(candidate) !== JSON.stringify(provenance)) throw new Error('Platform provenance artifacts differ');
  provenance = candidate; patchBytes = patch;
}
await writeFile(path.join(assets, 'overlay.patch'), patchBytes);
await writeFile(path.join(assets, 'release-provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
await writeFile(path.join(assets, 'SHA256SUMS-overlay.txt'), `${hash(patchBytes)}  overlay.patch\n${hash(await readFile(path.join(assets, 'release-provenance.json')))}  release-provenance.json\n`);
console.log('RELEASE_ASSET_SET_VERIFIED darwin-arm64 darwin-x64 win32-x64');
