#!/usr/bin/env node
// R2 测试债治理：验证 macOS `git init` 写入的 `core.precomposeunicode = true` 是否触发
// 产品仓库配置白名单的 `git-config-executable-or-unsupported`（只读探针；不修改仓库任何文件）。
//
// 用法：node 13-precompose-probe.mjs --repo <repo-root>
// 行为：在系统临时目录 git init 一个一次性仓库 → 设置 core.precomposeunicode=true →
//       调用 src/provider/trunk/impl/git-command.ts 的 inspectGitRepository → 取消该键再调用一次。
// 期望（2026-11-16，Windows 本机 Node v24.22.1 / git 2.55）：
//   - 设置后 inspect 抛 git-config-executable-or-unsupported；
//   - 取消后 inspect 成功（objectFormat=sha1）。
// 该探针不依赖 macOS；macOS 上 `git init` 默认就会写这个键，故 CI macOS 全部真实 git 夹具命中。

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
if (!args.repo) { console.error('missing --repo'); process.exit(2); }

const modulePath = path.join(args.repo, 'src/provider/trunk/impl/git-command.ts');
const mod = await import(pathToFileURL(modulePath).href);
const root = mkdtempSync(path.join(os.tmpdir(), 'ans-precompose-probe-'));
console.log(`root=${root}`);
try {
  execFileSync('git', ['init', root]);
  console.log('--- .git/config after git init ---');
  console.log(readFileSync(path.join(root, '.git/config'), 'utf8').trim());
  execFileSync('git', ['-C', root, 'config', 'core.precomposeunicode', 'true']);
  console.log('--- .git/config after git config core.precomposeunicode true ---');
  console.log(readFileSync(path.join(root, '.git/config'), 'utf8').trim());
  try {
    const identity = await mod.inspectGitRepository(root);
    console.log(`WITH_KEY=ACCEPTED (unexpected) objectFormat=${identity.objectFormat}`);
  } catch (error) {
    console.log(`WITH_KEY=REJECTED message=${error.message}`);
  }
  execFileSync('git', ['-C', root, 'config', '--unset', 'core.precomposeunicode']);
  try {
    const identity = await mod.inspectGitRepository(root);
    console.log(`WITHOUT_KEY=ACCEPTED objectFormat=${identity.objectFormat}`);
  } catch (error) {
    console.log(`WITHOUT_KEY=REJECTED message=${error.message}`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
