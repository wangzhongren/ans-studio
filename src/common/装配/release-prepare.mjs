// Build a frozen tag plus a reviewable, explicit packaging overlay. Never moves the tag.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {SOURCE_REF, SOURCE_SHA, selectOverlay} from './release-policy.mjs';
const git = (...args) => execFileSync('git', ['-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const sourceRef = process.argv[2] ?? process.env.SOURCE_REF ?? SOURCE_REF;
if (sourceRef !== SOURCE_REF) throw new Error(`This release recipe only accepts ${SOURCE_REF}`);
const sourceSha = git('rev-parse', `${sourceRef}^{commit}`);
if (sourceSha !== SOURCE_SHA) throw new Error(`Frozen ${SOURCE_REF} source changed`);
const overlaySha = git('rev-parse', 'HEAD');
const target = path.resolve('.release/source');
const names = git('diff', '--name-only', sourceSha, overlaySha).split('\n').filter(Boolean);
const {selected: overlayPaths, excluded: excludedChanges} = selectOverlay(names);
const diff = overlayPaths.length === 0 ? Buffer.alloc(0) : execFileSync('git', ['diff', '--binary', sourceSha, overlaySha, '--', ...overlayPaths], { maxBuffer: 32 * 1024 * 1024 });
mkdirSync('.release', { recursive: true });
// v2.1.0 发布阻断修复（R10 归因）：冻结源装配曾用 `git worktree add --detach`，`.release/source/.git`
// 因此是链接工作树文件（gitdir 指针）而不是目录；产品 protection scope 探测到 `.git` 非真实目录即判
// unknown 并 fail-closed（`runtime-creation-prepared-api-unavailable` / run-role.ts:844
// `requirement.state !== "unmanaged"`、`runtime-protection-scope-unknown`），在该冻结树内跑测试必然红。
// 实证：同一提交 59a5e1a 同机 A/B——linked worktree 内 `test/测试/real-entry.test.ts` 11/16（5 失败，
// 与发布 CI run 44024770189 arm64 Regression 26 名同因）；普通 clone（`.git` 为目录）16/16 全绿。
// 因此改为普通本地 clone：冻结内容、overlay 应用方式、provenance 字段与写出物逐项不变——只是给冻结树
// 一个真实 `.git` 目录，不放宽任何产品门禁或测试断言。旧实现的 `git worktree add` 会在来源仓库注册
// 工作树，重跑前须清理旧状态：已注册的 worktree 用 `git worktree remove --force` 移除，非注册残留
// （中断的 clone 等）直接删除；随后 `git worktree prune` 清掉失效注册。
if (existsSync(target)) {
  const canonical = p => { try { return realpathSync.native(path.resolve(p)); } catch { return path.resolve(p); } };
  const registered = git('worktree', 'list', '--porcelain').split('\n')
    .filter(line => line.startsWith('worktree ')).map(line => line.slice('worktree '.length))
    .some(p => canonical(p) === canonical(target));
  if (registered) execFileSync('git', ['worktree', 'remove', '--force', target], { stdio: 'inherit' });
  else rmSync(target, { recursive: true, force: true });
}
git('worktree', 'prune');
execFileSync('git', ['clone', '--local', '--no-checkout', '--quiet', git('rev-parse', '--show-toplevel'), target], { stdio: 'inherit' });
// 新 clone 只有自己的本地配置；发布 CI 以 `git config --global core.longpaths true` 跨平台打开长路径，
// 本机首发汇编依赖来源仓库的本地配置。给冻结点显式同一设置，保证本机与 CI checkout/overlay 路径一致。
git('-C', target, 'config', 'core.longpaths', 'true');
execFileSync('git', ['-C', target, 'checkout', '--detach', sourceSha], { stdio: 'inherit' });
if (diff.length) execFileSync('git', ['-C', target, 'apply', '--index', '--binary', '-'], { input: diff, stdio: ['pipe', 'inherit', 'inherit'] });
const actualTree = git('-C', target, 'write-tree');
const provenance = { sourceRef, sourceSha, overlaySha, actualTree, overlayPaths,
  overlayPatchSha256: createHash('sha256').update(diff).digest('hex'),
  excludedChanges, runUrl: process.env.GITHUB_SERVER_URL && `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` };
writeFileSync(path.join(target, 'release-provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
writeFileSync('.release/overlay.patch', diff);
console.log(JSON.stringify(provenance, null, 2));
