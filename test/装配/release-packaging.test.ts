import test from 'node:test';
import assert from 'node:assert/strict';
import { selectOverlay, SOURCE_REF, SOURCE_SHA } from '../../src/common/装配/release-policy.mjs';

test('release overlay preserves Chinese build paths and excludes private data and documentation', () => {
  const result = selectOverlay(['src/common/装配/release-prepare.mjs', 'test/装配/release-packaging.test.ts',
    'package.json', '.env', '.ans/sessions/private.jsonl', 'README.md', '角色卡/装配/docs/change/release.md']);
  assert.deepEqual(result.selected, ['src/common/装配/release-prepare.mjs', 'test/装配/release-packaging.test.ts', 'package.json']);
  assert.deepEqual(result.excluded, ['.env', '.ans/sessions/private.jsonl', 'README.md', '角色卡/装配/docs/change/release.md']);
  assert.equal(SOURCE_REF, 'v1.3.0');
  assert.equal(SOURCE_SHA, '16963ee3f59acc1f812141709858690f1a24501b');
});

test('release refuses unreviewed production changes and similarly named private directories', () => {
  assert.throws(() => selectOverlay(['app/desktop/interface.ts']), /Unreviewed production overlay/);
  assert.throws(() => selectOverlay(['src/common/装配-other/secret.mjs']), /Unreviewed production overlay/);
  assert.throws(() => selectOverlay(['src/provider/claude/session.ts']), /Unreviewed production overlay/);
  assert.throws(() => selectOverlay(['src/provider/codex/client.ts']), /Unreviewed production overlay/);
  assert.throws(() => selectOverlay(['app/main.ts']), /Unreviewed production overlay/);
  assert.deepEqual(selectOverlay(['package.json', 'test/装配/release-packaging.test.ts', 'test/codex-adapter/electron-launch.test.ts']).selected,
    ['package.json', 'test/装配/release-packaging.test.ts']);
});

// v1.3.0：白名单**重置为基础集**（打包/版本/发布面——冻结源 tag v1.3.0 已含全部产品代码）。
// v1.2.0 曾按精确路径一次性纳入的两项均已随冻结源吸收、整批移除（src/provider/codex/session.ts 随后因
// overlay-2 平台修复**再次**精确列入——见下用例）；test/测试/kanban-fixes-verify/f1-timeout.test.ts 及其余
// 未列名 test/ 文件（test/runtime-core/** 硬化对等、test/codex-adapter/**）一律 excluded、不随构建树分发。
// 本用例锁死 test/ 排除面总边界（overlay-2 增列 7 条为精确白名单，不影响未列名文件）。
test('release overlay keeps the packaging surface exact: unreviewed test files stay excluded', () => {
  const result = selectOverlay(['package.json', 'test/测试/kanban-fixes-verify/f1-timeout.test.ts',
    'test/runtime-core/shell-exec-timeout.test.ts', 'test/runtime-core/fixtures.ts', 'test/codex-adapter/session.test.ts']);
  assert.deepEqual(result.selected, ['package.json']);
  assert.deepEqual(result.excluded, ['test/测试/kanban-fixes-verify/f1-timeout.test.ts',
    'test/runtime-core/shell-exec-timeout.test.ts', 'test/runtime-core/fixtures.ts', 'test/codex-adapter/session.test.ts']);
});

// overlay-2（首跑 Windows CI run 38924209553 的 8 红处置）：仅 1 处产品修复——src/provider/codex/session.ts
// （win32 taskkill 清收上界 120ms→2000ms，仍为有界；姊妹用例峰值负载 212ms 通过为证）；其余 6 条为验证套件
// 平台真值分支（Windows libuv 十键豁免/路径分隔符原生形/POSIX 信号无面/控制字符名不可建盘；断言本体零放宽）。
// 7 条均按精确路径列入、不开目录——本用例同时锁死入选面与**同目录排除面**（未列名的同目录文件仍 excluded）。
test('release overlay includes exactly the reviewed Windows-platform fix batch by exact path', () => {
  const result = selectOverlay(['package.json', 'src/provider/codex/session.ts',
    'test/pi-adapter/installed-mcp-servers.test.ts', 'test/pi-adapter/installed-skills-injection.test.ts',
    'test/测试/g4-skill-verify/b-render-double-check.test.ts', 'test/测试/g4-skill-verify/c-preauth.test.ts',
    'test/测试/g4-skill-verify/f-fingerprint.test.ts',
    'test/测试/g4v2-mcp-verify/g-claude-launcher.test.ts', 'test/测试/g4v2-mcp-verify/j-pi.test.ts',
    'test/测试/g5-reasoning-verify/h-scope-audit.test.ts', 'test/测试/g5-reasoning-verify/a-contract.test.ts']);
  assert.deepEqual(result.selected, ['package.json', 'src/provider/codex/session.ts',
    'test/pi-adapter/installed-mcp-servers.test.ts',
    'test/测试/g4-skill-verify/b-render-double-check.test.ts', 'test/测试/g4-skill-verify/f-fingerprint.test.ts',
    'test/测试/g4v2-mcp-verify/g-claude-launcher.test.ts', 'test/测试/g4v2-mcp-verify/j-pi.test.ts',
    'test/测试/g5-reasoning-verify/h-scope-audit.test.ts']);
  assert.deepEqual(result.excluded, ['test/pi-adapter/installed-skills-injection.test.ts',
    'test/测试/g4-skill-verify/c-preauth.test.ts', 'test/测试/g5-reasoning-verify/a-contract.test.ts']);
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
