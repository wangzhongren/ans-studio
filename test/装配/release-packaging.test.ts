import test from 'node:test';
import assert from 'node:assert/strict';
import { selectOverlay, SOURCE_REF, SOURCE_SHA } from '../../src/common/装配/release-policy.mjs';

test('release overlay preserves Chinese build paths and excludes private data and documentation', () => {
  const result = selectOverlay(['src/common/装配/release-prepare.mjs', 'test/装配/release-packaging.test.ts',
    'package.json', '.env', '.ans/sessions/private.jsonl', 'README.md', '角色卡/装配/docs/change/release.md']);
  assert.deepEqual(result.selected, ['src/common/装配/release-prepare.mjs', 'test/装配/release-packaging.test.ts', 'package.json']);
  assert.deepEqual(result.excluded, ['.env', '.ans/sessions/private.jsonl', 'README.md', '角色卡/装配/docs/change/release.md']);
  assert.equal(SOURCE_REF, 'v2.0.0');
  assert.equal(SOURCE_SHA, '752953cf229ef9771fb574d0972b80e73ec7c27a');
});

test('release overlay selects the v2.0.0 packaging surface', () => {
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

// v2.0.0：白名单为基础集 + 1 条发布阻断修复条目（test/桌面应用/optional-acceptance.test.ts，精确路径；
// 冻结源 tag v2.0.0 已含全部产品/测试代码）。
// v1.9.2 曾重置为基础集；v1.9.1 曾为基础集 + 1 条阻断修复条目（已随本冻结源吸收）；v1.9.0/v1.5.0 曾同样
// 重置；v1.3.0 按精确路径一次性纳入的 8 条（src/provider/codex/session.ts、6 个平台真值测试文件与
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

// v2.0.0 发布阻断修复：optional-acceptance 测试按**精确路径**入列（单文件不开目录；同目录其它测试仍
// excluded，未列名 test/ 不随构建树）。断言不放宽。
test('release overlay selects the v2.0.0 optional-acceptance blocker test by exact path only', () => {
  const result = selectOverlay(['test/桌面应用/optional-acceptance.test.ts',
    'test/桌面应用/optional-acceptance.ts', 'test/桌面应用/optional-acceptance-extra.test.ts',
    'test/桌面应用/decision-service.test.ts']);
  assert.deepEqual(result.selected, ['test/桌面应用/optional-acceptance.test.ts']);
  assert.deepEqual(result.excluded, ['test/桌面应用/optional-acceptance.ts',
    'test/桌面应用/optional-acceptance-extra.test.ts', 'test/桌面应用/decision-service.test.ts']);
});

// v2.0.0 发布阻断修复（第二批，macOS 根路径 realpath 规范化）：生产 2 条 + 测试 2 条按**精确路径**入列；
// 单文件不开目录（同目录其它测试仍 excluded，未列名 src/ 仍 fail-closed）。断言不放宽。
test('release overlay selects the v2.0.0 macOS root canonicalization blocker files by exact path only', () => {
  const result = selectOverlay([
    'src/provider/trunk/impl/git-command.ts',
    'src/service/runtime/session.ts',
    'test/runtime-core/project-root-canonicalization.test.ts',
    'test/runtime-core/write-gate-context.test.ts',
    'test/runtime-core/session.test.ts',
    'test/runtime-core/fixtures.ts',
  ]);
  assert.deepEqual(result.selected, [
    'src/provider/trunk/impl/git-command.ts',
    'src/service/runtime/session.ts',
    'test/runtime-core/project-root-canonicalization.test.ts',
    'test/runtime-core/write-gate-context.test.ts',
  ]);
  assert.deepEqual(result.excluded, ['test/runtime-core/session.test.ts', 'test/runtime-core/fixtures.ts']);
  assert.throws(() => selectOverlay(['src/provider/trunk/impl/git-command-extra.ts']), /Unreviewed production overlay/);
  assert.throws(() => selectOverlay(['src/service/runtime/session-extra.ts']), /Unreviewed production overlay/);
});

// v2.0.0 发布阻断修复（第三批，macOS 根路径规范化在编排层的第二处比较）：生产 1 条按**精确路径**
// 入列；单文件不开目录（同目录其它 src/ 文件与未列名 test/ 仍 excluded/fail-closed）。断言不放宽。
test('release overlay selects the v2.0.0 orchestration root-canonicalization blocker file by exact path only', () => {
  const result = selectOverlay([
    'src/pipeline/orchestration/run-role.ts',
    'test/编排/run-role-managed-root-alias.test.ts',
    'test/编排/run-role-fixed-b2.test.ts',
  ]);
  assert.deepEqual(result.selected, ['src/pipeline/orchestration/run-role.ts']);
  assert.deepEqual(result.excluded, ['test/编排/run-role-managed-root-alias.test.ts',
    'test/编排/run-role-fixed-b2.test.ts']);
  assert.throws(() => selectOverlay(['src/pipeline/orchestration/trunk-runtime.ts']), /Unreviewed production overlay/);
  assert.throws(() => selectOverlay(['src/pipeline/orchestration/run-role-extra.ts']), /Unreviewed production overlay/);
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
// 已随 v1.5.0 冻结源吸收、整批移出白名单：生产修复回到 src/ fail-closed，测试文件落 test/ excluded，
// 同目录未列名文件同样不随构建树；断言不放宽。
// 例外：test/桌面应用/interface.test.ts 于 v1.7.0 发布阻断修复中重新按精确路径入列，
// 其入选由下方 v1.7.0 blocking-fix 用例断言；本用例保留其余条目的 fail-closed/excluded 边界。
test('release overlay returns v1.4.0 overlay-2 entries to fail-closed or excluded', () => {
  assert.throws(() => selectOverlay(['src/common/编排/shell-command-guard.ts']), /Unreviewed production overlay/);
  const result = selectOverlay(['test/编排/shell-command-guard.test.ts',
    'test/编排/flow-service.test.ts',
    'test/桌面应用/runtime-resolution.test.ts']);
  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.excluded, ['test/编排/shell-command-guard.test.ts',
    'test/编排/flow-service.test.ts',
    'test/桌面应用/runtime-resolution.test.ts']);
});

// v1.5.0 overlay 追加（三平台 CI 前置修复）已随 v1.9.0 冻结源吸收、整批移出白名单：生产修复回到 src/
// fail-closed，7 个测试/夹具与同目录未列名 test/ 文件落 excluded、不随构建树；断言不放宽。
test('release overlay returns v1.5.0 fix entries to fail-closed or excluded', () => {
  assert.throws(() => selectOverlay(['src/common/codex-adapter/reasoning-catalog.ts']), /Unreviewed production overlay/);
  const result = selectOverlay(['test/codex-adapter/reasoning-catalog.test.ts',
    'test/codex-adapter/fixtures.ts',
    'test/桌面UI/source-guard.test.ts',
    'test/runtime-core/file-write-safety.test.ts',
    'test/测试/g5-reasoning-verify/helpers.ts',
    'test/测试/g5-reasoning-verify/compatibility-loopback.test.ts',
    'test/测试/governance-e2e-auto/c-appointment-timing.test.ts',
    'test/codex-adapter/judge-mode.test.ts',
    'test/桌面UI/anchor-view.test.ts',
    'test/runtime-core/abort-quarantine.test.ts',
    'test/测试/g5-reasoning-verify/d-codex.test.ts',
    'test/测试/governance-e2e-auto/d-dispatch-listing.test.ts']);
  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.excluded, ['test/codex-adapter/reasoning-catalog.test.ts',
    'test/codex-adapter/fixtures.ts',
    'test/桌面UI/source-guard.test.ts',
    'test/runtime-core/file-write-safety.test.ts',
    'test/测试/g5-reasoning-verify/helpers.ts',
    'test/测试/g5-reasoning-verify/compatibility-loopback.test.ts',
    'test/测试/governance-e2e-auto/c-appointment-timing.test.ts',
    'test/codex-adapter/judge-mode.test.ts',
    'test/桌面UI/anchor-view.test.ts',
    'test/runtime-core/abort-quarantine.test.ts',
    'test/测试/g5-reasoning-verify/d-codex.test.ts',
    'test/测试/governance-e2e-auto/d-dispatch-listing.test.ts']);
});

// v1.7.0 发布阻断修复（tag v1.7.0 不可移动，当时经评审走显式 overlay）已随 v1.9.0 冻结源吸收、
// 整批移出白名单：生产修复回到 src/ fail-closed，3 个测试修复与同目录未列名 test/ 文件落 excluded；
// 断言不放宽。
test('release overlay returns v1.7.0 blocking-fix entries to fail-closed or excluded', () => {
  assert.throws(() => selectOverlay(['src/common/shared/diagnostics.ts']), /Unreviewed production overlay/);
  const result = selectOverlay(['test/桌面应用/interface.test.ts',
    'test/桌面应用/project-document.test.ts',
    'test/桌面应用/acceptance-dispatch.test.ts',
    'test/桌面应用/runtime-resolution.test.ts',
    'test/桌面应用/session-rebuild-race.test.ts']);
  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.excluded, ['test/桌面应用/interface.test.ts',
    'test/桌面应用/project-document.test.ts',
    'test/桌面应用/acceptance-dispatch.test.ts',
    'test/桌面应用/runtime-resolution.test.ts',
    'test/桌面应用/session-rebuild-race.test.ts']);
  assert.throws(() => selectOverlay(['src/common/编排/flow-service.ts']), /Unreviewed production overlay/);
});

// v1.8.0 发布阻断修复（tag v1.8.0 不可移动，当时经评审走显式 overlay）已随 v1.9.0 冻结源吸收、
// 整批移出白名单：生产修复回到 app//src/ fail-closed，4 个测试修复与同目录未列名 test/ 文件落 excluded；
// 断言不放宽。
test('release overlay returns v1.8.0 blocking-fix entries to fail-closed or excluded', () => {
  assert.throws(() => selectOverlay(['app/desktop/session.ts']), /Unreviewed production overlay/);
  const result = selectOverlay(['test/桌面应用/role-log.test.ts',
    'test/测试/lightweight-permission-repairs.test.ts',
    'test/测试/t1-pipeline-integration.test.ts',
    'test/编排/workflow-preconditions.test.ts',
    'test/测试/governance-e2e-auto/i-full-chain.test.ts',
    'test/桌面应用/stuck-redispatch.test.ts']);
  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.excluded, ['test/桌面应用/role-log.test.ts',
    'test/测试/lightweight-permission-repairs.test.ts',
    'test/测试/t1-pipeline-integration.test.ts',
    'test/编排/workflow-preconditions.test.ts',
    'test/测试/governance-e2e-auto/i-full-chain.test.ts',
    'test/桌面应用/stuck-redispatch.test.ts']);
  assert.throws(() => selectOverlay(['app/desktop/interface.ts']), /Unreviewed production overlay/);
});

// v1.8.2 发布阻断修复（tag v1.8.2 不可移动，当时经评审走显式 overlay）已随 v1.9.0 冻结源吸收、
// 整批移出白名单：4 个测试文件的清理竞态修复与同目录未列名 test/ 文件落 excluded；app//src/ 未列名仍
// fail-closed。断言不放宽。
test('release overlay returns v1.8.2 test-cleanup entries to fail-closed or excluded', () => {
  const result = selectOverlay(['test/桌面应用/chain-enforcement.test.ts',
    'test/桌面应用/run-pin.test.ts',
    'test/桌面应用/application-line.test.ts',
    'test/编排/task-state.test.ts',
    'test/桌面应用/watchdog-reuse.test.ts']);
  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.excluded, ['test/桌面应用/chain-enforcement.test.ts',
    'test/桌面应用/run-pin.test.ts',
    'test/桌面应用/application-line.test.ts',
    'test/编排/task-state.test.ts',
    'test/桌面应用/watchdog-reuse.test.ts']);
  assert.throws(() => selectOverlay(['app/desktop/interface.ts']), /Unreviewed production overlay/);
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

// v1.9.1 发布阻断修复条目（allowlist 文件）已随 v1.9.2 冻结源吸收、整批移出活动白名单：该文件与同目录
// 未列名 test/ 文件落 excluded、不随构建树；app/ 未列名仍 fail-closed。断言不放宽。
test('release overlay returns the v1.9.1 blocker-fix allowlist entry to excluded', () => {
  const result = selectOverlay(['test/项目管理/shared/i18n-guard-allowlist.ts',
    'test/项目管理/shared/i18n.test.ts']);
  assert.deepEqual(result.selected, []);
  assert.deepEqual(result.excluded, ['test/项目管理/shared/i18n-guard-allowlist.ts',
    'test/项目管理/shared/i18n.test.ts']);
  assert.throws(() => selectOverlay(['app/desktop/customer-input.ts']), /Unreviewed production overlay/);
});
