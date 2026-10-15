// Build a frozen tag plus a reviewable, explicit packaging overlay. Never moves the tag.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {SOURCE_REF, SOURCE_SHA, selectOverlay} from './release-policy.mjs';
const git = (...args) => execFileSync('git', ['-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const sourceRef = process.argv[2] ?? process.env.SOURCE_REF ?? 'v1.0.0';
if (sourceRef !== SOURCE_REF) throw new Error('This release recipe only accepts v1.0.0');
const sourceSha = git('rev-parse', `${sourceRef}^{commit}`);
if (sourceSha !== SOURCE_SHA) throw new Error('Frozen v1.0.0 source changed');
const overlaySha = git('rev-parse', 'HEAD');
const target = path.resolve('.release/source');
const names = git('diff', '--name-only', sourceSha, overlaySha).split('\n').filter(Boolean);
const {selected: overlayPaths, excluded: excludedChanges} = selectOverlay(names);
const diff = overlayPaths.length === 0 ? Buffer.alloc(0) : execFileSync('git', ['diff', '--binary', sourceSha, overlaySha, '--', ...overlayPaths], { maxBuffer: 32 * 1024 * 1024 });
mkdirSync('.release', { recursive: true });
execFileSync('git', ['worktree', 'add', '--detach', target, sourceSha], { stdio: 'inherit' });
if (diff.length) execFileSync('git', ['-C', target, 'apply', '--index', '--binary', '-'], { input: diff, stdio: ['pipe', 'inherit', 'inherit'] });
const actualTree = git('-C', target, 'write-tree');
const provenance = { sourceRef, sourceSha, overlaySha, actualTree, overlayPaths,
  overlayPatchSha256: createHash('sha256').update(diff).digest('hex'),
  excludedChanges, runUrl: process.env.GITHUB_SERVER_URL && `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` };
writeFileSync(path.join(target, 'release-provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
writeFileSync('.release/overlay.patch', diff);
console.log(JSON.stringify(provenance, null, 2));
