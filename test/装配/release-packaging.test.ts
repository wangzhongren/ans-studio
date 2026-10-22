import test from 'node:test';
import assert from 'node:assert/strict';
import { selectOverlay, SOURCE_REF, SOURCE_SHA } from '../../src/common/装配/release-policy.mjs';

test('release overlay preserves Chinese build paths and excludes private data and documentation', () => {
  const result = selectOverlay(['src/common/装配/release-prepare.mjs', 'test/装配/release-packaging.test.ts',
    'package.json', '.env', '.ans/sessions/private.jsonl', 'README.md', '角色卡/装配/docs/change/release.md']);
  assert.deepEqual(result.selected, ['src/common/装配/release-prepare.mjs', 'test/装配/release-packaging.test.ts', 'package.json']);
  assert.deepEqual(result.excluded, ['.env', '.ans/sessions/private.jsonl', 'README.md', '角色卡/装配/docs/change/release.md']);
  assert.equal(SOURCE_REF, 'v1.5.0');
  assert.equal(SOURCE_SHA, '35cca0bd2ed373c8ed5984dea45a76a608f4e502');
});

test('release overlay selects the v1.5.0 packaging surface', () => {
  const result = selectOverlay(['.github/workflows/release.yml',
    'src/common/装配/release-policy.mjs', 'src/common/装配/release-policy.d.mts',
    'test/装配/release-packaging.test.ts', 'package.json', 'package-lock.json', 'README.md']);
  assert.deepEqual(result.selected, ['.github/workflows/release.yml',
    'src/common/装配/release-policy.mjs', 'src/common/装配/release-policy.d.mts',
    'test/装配/release-packaging.test.ts', 'package.json', 'package-lock.json']);
  assert.deepEqual(result.excluded, ['README.md']);
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

// v1.5.0：白名单**重置为基础集**（打包/版本/发布面——冻结源 tag v1.5.0 已含全部产品代码）。
// v1.3.0 曾按精确路径一次性纳入的 8 条（src/provider/codex/session.ts、6 个平台真值测试文件与
// test/桌面应用/session-rebuild-race.test.ts）均已随冻结源吸收、整批移除，回到 fail-closed/excluded。
// 未列名 test/ 文件（test/runtime-core/**、test/codex-adapter/** 等）一律 excluded、不随构建树分发。
// 本用例锁死 test/ 排除面总边界。
test('release overlay keeps the packaging surface exact: unreviewed test files stay excluded', () => {
  const result = selectOverlay(['package.json', 'test/测试/kanban-fixes-verify/f1-timeout.test.ts',
    'test/runtime-core/shell-exec-timeout.test.ts', 'test/runtime-core/fixtures.ts', 'test/codex-adapter/session.test.ts']);
  assert.deepEqual(result.selected, ['package.json']);
  assert.deepEqual(result.excluded, ['test/测试/kanban-fixes-verify/f1-timeout.test.ts',
    'test/runtime-core/shell-exec-timeout.test.ts', 'test/runtime-core/fixtures.ts', 'test/codex-adapter/session.test.ts']);
});

// v1.5.0 白名单重置后，v1.3.0 的一次性条目回到基础规则：生产修复落 src/ 即 fail-closed，
// 7 个测试文件（6 个平台真值分支 + session-rebuild-race 夹具修复）落 test/ excluded，不随构建树。
test('release overlay returns v1.3.0 one-off entries to fail-closed or excluded', () => {
  assert.throws(() => selectOverlay(['src/provider/codex/session.ts']), /Unreviewed production overlay/);
  const result = selectOverlay(['test/pi-adapter/installed-mcp-servers.test.ts',
    'test/测试/g4-skill-verify/b-render-double-check.test.ts',
    'test/测试/g4-skill-verify/f-fingerprint.test.ts',
    'test/测试/g4v2-mcp-verify/g-claude-launcher.test.ts', 'test/测试/g4v2-mcp-verify/j-pi.test.ts',
    'test/测试/g5-reasoning-verify/h-scope-audit.test.ts',
    'test/桌面应用/session-rebuild-race.test.ts']);
  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.excluded, ['test/pi-adapter/installed-mcp-servers.test.ts',
    'test/测试/g4-skill-verify/b-render-double-check.test.ts',
    'test/测试/g4-skill-verify/f-fingerprint.test.ts',
    'test/测试/g4v2-mcp-verify/g-claude-launcher.test.ts', 'test/测试/g4v2-mcp-verify/j-pi.test.ts',
    'test/测试/g5-reasoning-verify/h-scope-audit.test.ts',
    'test/桌面应用/session-rebuild-race.test.ts']);
});

// v1.4.0 overlay-2（首跑 run 39389502551 后按精确路径列入的 1 项产品修复 + 4 项测试/夹具修复）
// 已随 v1.5.0 冻结源吸收、整批移出白名单：生产修复回到 src/ fail-closed，4 个测试文件落 test/ excluded，
// 同目录未列名文件同样不随构建树；断言不放宽。
test('release overlay returns v1.4.0 overlay-2 entries to fail-closed or excluded', () => {
  assert.throws(() => selectOverlay(['src/common/编排/shell-command-guard.ts']), /Unreviewed production overlay/);
  const result = selectOverlay(['test/编排/shell-command-guard.test.ts',
    'test/编排/flow-service.test.ts',
    'test/桌面应用/interface.test.ts',
    'test/桌面应用/runtime-resolution.test.ts']);
  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.excluded, ['test/编排/shell-command-guard.test.ts',
    'test/编排/flow-service.test.ts',
    'test/桌面应用/interface.test.ts',
    'test/桌面应用/runtime-resolution.test.ts']);
});

// v1.5.0 overlay 追加（三平台 CI 前置修复）：1 项产品修复 + 6 项测试/夹具，按精确路径入选、不开目录；
// 同目录未列名 test/ 仍 excluded，未列名 src/ 仍 fail-closed。断言不放宽。
test('release overlay includes exactly the reviewed v1.5.0 fix batch by exact path', () => {
  const result = selectOverlay(['package.json',
    'src/common/codex-adapter/reasoning-catalog.ts',
    'test/codex-adapter/reasoning-catalog.test.ts',
    'test/codex-adapter/fixtures.ts',
    'test/桌面UI/source-guard.test.ts',
    'test/runtime-core/file-write-safety.test.ts',
    'test/测试/g5-reasoning-verify/helpers.ts',
    'test/测试/g5-reasoning-verify/compatibility-loopback.test.ts',
    'test/codex-adapter/judge-mode.test.ts',
    'test/桌面UI/anchor-view.test.ts',
    'test/runtime-core/abort-quarantine.test.ts',
    'test/测试/g5-reasoning-verify/d-codex.test.ts']);
  assert.deepEqual(result.selected, ['package.json',
    'src/common/codex-adapter/reasoning-catalog.ts',
    'test/codex-adapter/reasoning-catalog.test.ts',
    'test/codex-adapter/fixtures.ts',
    'test/桌面UI/source-guard.test.ts',
    'test/runtime-core/file-write-safety.test.ts',
    'test/测试/g5-reasoning-verify/helpers.ts',
    'test/测试/g5-reasoning-verify/compatibility-loopback.test.ts']);
  assert.deepEqual(result.excluded, ['test/codex-adapter/judge-mode.test.ts',
    'test/桌面UI/anchor-view.test.ts',
    'test/runtime-core/abort-quarantine.test.ts',
    'test/测试/g5-reasoning-verify/d-codex.test.ts']);
  assert.throws(() => selectOverlay(['src/common/codex-adapter/config.ts']), /Unreviewed production overlay/);
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
  const checks = {entry:true,rootMounted:true,driver:true,csp:true,cspViolations:true,dom:true,preload:true,ipc:true,importDisabled:true,missingConfiguration:true,settingsEntryDisabled:true,envPathMatches:true,console:true,load:true};
  const common = { sourceRef: SOURCE_REF, sourceSha: SOURCE_SHA, overlaySha: 'a'.repeat(40), actualTree: 'b'.repeat(40), lockSha256: 'c'.repeat(64), overlayPatchSha256: hash(patch), builder: '26.15.3' };
  const manifests: { name: string; value: any }[] = [];
  for (const target of ['darwin-arm64','darwin-x64','win32-x64']) {
    const [platform, arch] = target.split('-');
    const file = `${target}.zip`, bytes = Buffer.from(`fixture ${target}`);
    const artifact = { file, size: bytes.length, sha256: hash(bytes) };
    const value = { ...common, platform, arch, smoke: {ok: true, isPackaged: true, platform, arch, checks}, process: {code: 0}, nativeDependencies: {sdkImports: 'PACKAGED_SDK_IMPORTS_OK', codexVersion: 'codex-cli 0.162.1', claudeVersion: 'native fixture'}, artifact };
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
    for (const change of [{actualTree:'f'.repeat(40)},
      {smoke:{ok:true,isPackaged:false,platform:'darwin',arch:'arm64',checks}},
      {platform:'win32',arch:'x64'},
      {smoke:{ok:true,isPackaged:true,platform:'darwin',arch:'arm64',checks:{...checks,settingsEntryDisabled:false}}},
      {smoke:{ok:true,isPackaged:true,platform:'darwin',arch:'arm64',checks:{...checks,console:false}}}]) {
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
