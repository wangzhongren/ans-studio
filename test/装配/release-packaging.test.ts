import test from 'node:test';
import assert from 'node:assert/strict';
import { selectOverlay, SOURCE_REF, SOURCE_SHA } from '../../src/common/装配/release-policy.mjs';

test('release overlay preserves Chinese build paths and excludes private data and documentation', () => {
  const result = selectOverlay(['src/common/装配/release-prepare.mjs', 'test/装配/release-packaging.test.ts',
    'package.json', '.env', '.ans/sessions/private.jsonl', 'README.md', '角色卡/装配/docs/change/release.md']);
  assert.deepEqual(result.selected, ['src/common/装配/release-prepare.mjs', 'test/装配/release-packaging.test.ts', 'package.json']);
  assert.deepEqual(result.excluded, ['.env', '.ans/sessions/private.jsonl', 'README.md', '角色卡/装配/docs/change/release.md']);
  assert.equal(SOURCE_REF, 'v1.2.0');
  assert.equal(SOURCE_SHA, 'ecca2d38500c8626cf2833eecb9d85d59f26c680');
});

test('release refuses unreviewed production changes and similarly named private directories', () => {
  assert.throws(() => selectOverlay(['app/desktop/interface.ts']), /Unreviewed production overlay/);
  assert.throws(() => selectOverlay(['src/common/装配-other/secret.mjs']), /Unreviewed production overlay/);
  assert.throws(() => selectOverlay(['src/provider/claude/session.ts']), /Unreviewed production overlay/);
  assert.throws(() => selectOverlay(['app/main.ts']), /Unreviewed production overlay/);
  assert.deepEqual(selectOverlay(['package.json', 'test/装配/release-packaging.test.ts', 'test/codex-adapter/electron-launch.test.ts']).selected,
    ['package.json', 'test/装配/release-packaging.test.ts']);
});

// v1.2.0 发布前 CI 检查（overlay-3，归因更正 2026-10-16）：CI（run 38881759770）macos-15-intel 两条 F-1
// 计时用例红——逐字落点为 test/测试/kanban-fixes-verify/f1-timeout.test.ts:40/:76 的镜像用例（慢 runner
// 微小时限未适配，非产品缺陷）；「测试」对该文件的同口径时序健壮化（不放松断言）经评审随本版 overlay
// 进构建树——按精确路径列入 files（单文件路径、不开目录）。未列名的 test/ 文件（同目录 f2~f8、
// test/runtime-core/**、test/codex-adapter/** 含 session.test.ts）一律 excluded、不随构建树分发；
// 本用例锁死「按精确路径入选、不开目录」边界。
test('release overlay includes exactly the reviewed f1-timeout slow-runner test by exact path', () => {
  const result = selectOverlay(['package.json', 'test/测试/kanban-fixes-verify/f1-timeout.test.ts',
    'test/测试/kanban-fixes-verify/f2-claim-release.test.ts', 'test/runtime-core/tools.test.ts', 'test/codex-adapter/electron-launch.test.ts']);
  assert.deepEqual(result.selected, ['package.json', 'test/测试/kanban-fixes-verify/f1-timeout.test.ts']);
  assert.deepEqual(result.excluded, ['test/测试/kanban-fixes-verify/f2-claim-release.test.ts', 'test/runtime-core/tools.test.ts', 'test/codex-adapter/electron-launch.test.ts']);
});

// 归因更正（2026-10-16）：上一版曾把 intel 2 红错误归属给 test/runtime-core/shell-exec-timeout.test.ts 并据此
// 列入——该文件在同 run 7/7 全绿，本次核实后从 files 移除；其同口径硬化调用 fixtures.ts 新增的可选第二参
// （只列测试不列夹具则构建树「新测试配旧夹具」、第二参被静默忽略），两文件随发布后 main 常规批次提交、
// 不入本 overlay。本用例锁死「已移除」：该文件与 fixtures.ts 一并仍 excluded（精确集合、不开目录）。
test('release overlay keeps the runtime-core hardened pair out after the attribution correction', () => {
  const result = selectOverlay(['package.json', 'test/runtime-core/shell-exec-timeout.test.ts',
    'test/runtime-core/fixtures.ts', 'test/runtime-core/tools.test.ts']);
  assert.deepEqual(result.selected, ['package.json']);
  assert.deepEqual(result.excluded, ['test/runtime-core/shell-exec-timeout.test.ts', 'test/runtime-core/fixtures.ts', 'test/runtime-core/tools.test.ts']);
});

// v1.2.0 发布前 CI 追加：v1.2.0 CI（run 38879484184）Windows 仅 1 红——test/codex-adapter/session.test.ts 的
// EBUSY 清理竞态；根因在产品清理路径（workRoot 删除早于进程 stdio 全闭、Windows 瞬时句柄占用）。「Codex适配器」
// 经评审的随版修复落在 src/provider/codex/session.ts（等 stdio close ＋ rm 瞬时重试 retryOnTransient；测试健壮性
// 同源：真机进程清理更稳），按 v1.0.0 先例（旧白名单本就精确含此文件）精确列入 files——单文件授权、不开目录。
// 锁定：该文件按精确路径入选；测试面零改动（该测试文件仍 excluded、不随构建树）；同目录其余路径仍 fail-closed。
test('release overlay includes exactly the reviewed codex session production fix by exact path', () => {
  const result = selectOverlay(['package.json', 'src/provider/codex/session.ts', 'test/codex-adapter/session.test.ts']);
  assert.deepEqual(result.selected, ['package.json', 'src/provider/codex/session.ts']);
  assert.deepEqual(result.excluded, ['test/codex-adapter/session.test.ts']);
  assert.throws(() => selectOverlay(['src/provider/codex/client.ts']), /Unreviewed production overlay/);
});

import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('release collection accepts three bound native results and rejects tampering or cross-platform drift', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ans-release-assets-contract-'));
  const assets = path.join(dir, 'assets'), proofs = path.join(dir, 'proofs');
  await mkdir(assets); await mkdir(proofs);
  const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
  const patch = 'reviewed packaging overlay\n';
  const common = { sourceRef: SOURCE_REF, sourceSha: SOURCE_SHA, overlaySha: 'a'.repeat(40), actualTree: 'b'.repeat(40), lockSha256: 'c'.repeat(64), overlayPatchSha256: hash(patch), builder: '26.15.3' };
  const manifests: { name: string; value: any }[] = [];
  for (const target of ['darwin-arm64','darwin-x64','win32-x64']) {
    const [platform, arch] = target.split('-');
    const file = `${target}.zip`, bytes = Buffer.from(`fixture ${target}`);
    const artifact = { file, size: bytes.length, sha256: hash(bytes) };
    const value = { ...common, platform, arch, smoke: {ok: true, isPackaged: true, platform, arch, checks: {dom:true,preload:true,ipc:true,importDisabled:true,missingConfiguration:true,settings:true,envPathMatches:true}}, process: {code: 0}, nativeDependencies: {sdkImports: 'PACKAGED_SDK_IMPORTS_OK', codexVersion: 'codex-cli 0.162.1', claudeVersion: 'native fixture'}, artifact };
    const name = `manifest-${target}.json`;
    manifests.push({name,value});
    await writeFile(path.join(assets,file),bytes);
    await writeFile(path.join(assets,name),JSON.stringify(value));
    await writeFile(path.join(assets,`SHA256SUMS-${target}.txt`),`${artifact.sha256}  ${file}\n`);
    const proof = path.join(proofs,target); await mkdir(proof);
    await writeFile(path.join(proof,'overlay.patch'),patch);
    await writeFile(path.join(proof,'release-provenance.json'),JSON.stringify(common));
  }
  const script = fileURLToPath(new URL('../../src/common/装配/release-assets.mjs', import.meta.url));
  const run = () => spawnSync(process.execPath, [script, assets, proofs], {encoding:'utf8',env:{...process.env,GITHUB_SHA:common.overlaySha}});
  try {
    assert.equal(run().status,0);
    const original = manifests[0];
    for (const change of [{actualTree:'f'.repeat(40)}, {smoke:{ok:true,isPackaged:false,platform:'darwin',arch:'arm64'}}, {platform:'win32',arch:'x64'}]) {
      await writeFile(path.join(assets,original.name),JSON.stringify({...original.value,...change}));
      assert.notEqual(run().status,0,JSON.stringify(change));
    }
    await writeFile(path.join(assets,original.name),JSON.stringify(original.value));
    await writeFile(path.join(assets,original.value.artifact.file),'tampered archive');
    assert.notEqual(run().status,0);
    await writeFile(path.join(assets,original.value.artifact.file),Buffer.from('fixture darwin-arm64'));
    await writeFile(path.join(proofs,'win32-x64','overlay.patch'),'tampered overlay');
    assert.notEqual(run().status,0);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
