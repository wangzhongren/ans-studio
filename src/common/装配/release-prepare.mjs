// Build a frozen tag plus a reviewable, explicit packaging overlay. Never moves the tag.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {SOURCE_REF, SOURCE_SHA, selectOverlay} from './release-policy.mjs';
const git = (...args) => execFileSync('git', ['-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const sourceRef = process.argv[2] ?? process.env.SOURCE_REF ?? SOURCE_REF;
const exactRelease = sourceRef === 'v2.2.0';
if (!exactRelease && sourceRef !== SOURCE_REF) throw new Error(`Unsupported release source ${sourceRef}`);
const overlaySha = git('rev-parse', 'HEAD');
const target = path.resolve('.release/source');
let sourceSha;
let overlayPaths = [];
let excludedChanges = [];
if (exactRelease) {
  sourceSha = process.env.RELEASE_SOURCE_SHA;
  if (!/^[0-9a-f]{40}$/.test(sourceSha ?? '') || sourceSha !== process.env.GITHUB_SHA || sourceSha !== overlaySha) {
    throw new Error('Expected release SHA, workflow SHA and checkout HEAD must match');
  }
  if (git('tag', '--list', sourceRef) && git('rev-parse', `refs/tags/${sourceRef}^{commit}`) !== sourceSha) {
    throw new Error(`Existing ${sourceRef} points to a different commit`);
  }
  validateVersions(
    JSON.parse(git('show', `${sourceSha}:package.json`)),
    JSON.parse(git('show', `${sourceSha}:package-lock.json`)),
  );
} else {
  sourceSha = git('rev-parse', `${sourceRef}^{commit}`);
  if (sourceSha !== SOURCE_SHA) throw new Error(`Frozen ${SOURCE_REF} source changed`);
  ({ selected: overlayPaths, excluded: excludedChanges } = selectOverlay(
    git('diff', '--name-only', sourceSha, overlaySha).split('\n').filter(Boolean),
  ));
}
const diff = overlayPaths.length === 0 ? Buffer.alloc(0) : execFileSync('git', ['diff', '--binary', sourceSha, overlaySha, '--', ...overlayPaths], { maxBuffer: 32 * 1024 * 1024 });
mkdirSync('.release', { recursive: true });
if (exactRelease) {
  // Project protection identifies a normal checkout by its real .git directory.
  git('clone', '--local', '--quiet', '--no-checkout', git('rev-parse', '--show-toplevel'), target);
  git('-C', target, 'config', 'core.longpaths', 'true');
  git('-C', target, 'config', 'core.autocrlf', 'false');
  git('-C', target, 'config', 'core.eol', 'lf');
  git('-C', target, 'checkout', '--detach', sourceSha);
  if (!statSync(path.join(target, '.git')).isDirectory() || git('-C', target, 'rev-parse', 'HEAD') !== sourceSha) {
    throw new Error('Prepared source is not a normal clone at the frozen commit');
  }
  validateVersions(
    JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8')),
    JSON.parse(readFileSync(path.join(target, 'package-lock.json'), 'utf8')),
  );
} else {
  execFileSync('git', ['worktree', 'add', '--detach', target, sourceSha], { stdio: 'inherit' });
}
if (diff.length) execFileSync('git', ['-C', target, 'apply', '--index', '--binary', '-'], { input: diff, stdio: ['pipe', 'inherit', 'inherit'] });
const actualTree = git('-C', target, 'write-tree');
if (exactRelease && actualTree !== git('rev-parse', `${sourceSha}^{tree}`)) {
  throw new Error('Prepared source tree differs from the frozen checkout');
}
const provenance = { sourceRef, sourceSha, overlaySha, actualTree, overlayPaths,
  overlayPatchSha256: createHash('sha256').update(diff).digest('hex'),
  excludedChanges, runUrl: process.env.GITHUB_SERVER_URL && `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` };
writeFileSync(path.join(target, 'release-provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
writeFileSync('.release/overlay.patch', diff);
console.log(JSON.stringify(provenance, null, 2));

function validateVersions(pkg, lock) {
  const version = sourceRef.slice(1);
  if (pkg.version !== version || lock.version !== version || lock.packages?.['']?.version !== version) {
    throw new Error(`Package and lockfile root versions must match ${sourceRef}`);
  }
}
