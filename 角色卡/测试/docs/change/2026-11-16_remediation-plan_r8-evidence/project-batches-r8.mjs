#!/usr/bin/env node
// R8：以 R8 实际宇宙为基线，核对 R6 投影（50）偏差、已合入批次存活，并投影
// KR-29 门禁 5（kr29a）/ KR-29 编排 23（kr29b）/ 平台硬化（plat）合入后的预计剩余。
//
// 输出：
//   20-r6-projection-vs-r8.json   R6 投影 50 vs R8 实际
//   21-r6-projection-deviations.tsv
//   22-batch-projection-r8.json   已合入批次审计 + 未合入批次扣除 + 预计剩余
//   23-projected-remaining.tsv

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
for (const req of ['r8-universe', 'r8-families', 'r6-projection', 'r6-universe', 'kr-dir', 'outdir']) {
  if (!args[req]) { console.error(`missing --${req}`); process.exit(2); }
}

const readLines = (p) => readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
const universe = JSON.parse(readFileSync(args['r8-universe'], 'utf8'));
const families = JSON.parse(readFileSync(args['r8-families'], 'utf8'));
const r6proj = JSON.parse(readFileSync(args['r6-projection'], 'utf8'));
const r6names = new Set(JSON.parse(readFileSync(args['r6-universe'], 'utf8')).map((x) => x.name));
const krDir = args['kr-dir'];
const runtimeCore33 = readLines(join(krDir, 'runtime-core-33.txt'));
const gates5 = readLines(join(krDir, 'gates-5.txt'));
const orch24 = readLines(join(krDir, 'orchestration-24.txt'));

const u = new Map(universe.map((x) => [x.name, x]));
const familyOf = new Map();
for (const f of families.families) for (const n of f.names) familyOf.set(n.name, f.family);
const platShort = { macos_arm64: 'arm64', macos_x64: 'x64', windows_x64: 'win' };
const platBrief = (x) => Object.keys(x.platforms).map((k) => platShort[k]).join('+') || '-';
const sortNames = (arr) => arr.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

// ---------- A. R6 投影 50 vs R8 ----------
const projected50 = new Set(Object.values(r6proj.remainingByCategory ?? {}).flat());
const r8Names = new Set(u.keys());
const projStillRed = sortNames([...projected50].filter((n) => r8Names.has(n)));
const projGreened = sortNames([...projected50].filter((n) => !r8Names.has(n)));
const outsideProjection = sortNames([...r8Names].filter((n) => !projected50.has(n)));

const mergedBatchSurvival = {};
for (const [b, v] of Object.entries(r6proj.runningBatches ?? {})) {
  const targets = v.targets ?? [];
  const stillRed = targets.filter((n) => r8Names.has(n));
  mergedBatchSurvival[b] = {
    expectedGreen: targets.length,
    greenedInR8: targets.length - stillRed.length,
    stillRedInR8: stillRed.length,
    stillRedNames: stillRed,
  };
}

// ---------- B. 已合入批次审计（R6 → R8 之间合入）----------
const present = (names) => names.filter((n) => r8Names.has(n));
const missing = (names) => names.filter((n) => !r8Names.has(n));
const B3C9 = /^(AC-1\/AC-6\/AC-7\/P1\.2-AC-28 |AC-16 集成|AC-2 Pi actor|P1\.2-AC-27 |gate active-tool|gate H13|gate host-continuation|host-continuation：真实 rapporteur|Q16 取代)/;
const b3c9 = [...r8Names].filter((n) => B3C9.test(n)); // absent → 0 expected
const w19Targets = [...r8Names].filter((n) => /^W19 /.test(n) || /^W33 /.test(n));
const taskRestart = [...r8Names].filter((n) => /^重启恢复：未投递任务/.test(n));
const qNormalNew = [...r8Names].filter((n) => /^Q normal-new early chain/.test(n));
const fileGateTargets = [...r8Names].filter((n) => /^W29 |^W30 /.test(n) || /^Q2 P2 /.test(n));
const w34w35 = [...r8Names].filter((n) => /^W34 |^W35 /.test(n));
const misc2Targets = [...r8Names].filter((n) => /^run-pin：M1\/M2\/M3/.test(n) || /^Pipeline initial workflow/.test(n) || /^Q74 /.test(n) || /^W36 /.test(n));
const spawnFence = [...r8Names].filter((n) => /^Git final spawn fence/.test(n));
const misc3Targets = [...r8Names].filter((n) => /^路径 B：B3 accepted/.test(n) || /^actual Core request_choice abort/.test(n));
const compatLoop = [...r8Names].filter((n) => /compatibility-loopback\.test\.ts$/.test(n));
const wj5 = [...r8Names].filter((n) => /^W-J5/.test(n));

const mergedBatchAudit = {
  'w19 #122': {
    role: 'W19 close-notify 产品修复 + W33 hub 跨 run 例外',
    targets: ['W19（全平台）', 'W33（原三平台）'],
    r8: { w19Present: w19Targets.filter((n) => /^W19 /.test(n)), w33Present: w19Targets.filter((n) => /^W33 /.test(n)) },
    verdict: 'W19 全平台转绿；W33 arm64/Windows 转绿、x64 仍红（git-core-in-flight-unproven）',
  },
  'b4fu #123': { role: 'W1b 守卫 2.5s→15s', targets: [], r8: {}, verdict: 'W1b 在 R7/R8 均未入宇宙（早已绿）；不影响其他名' },
  'b3cfu #124': { role: '9 名 Windows-only git-file-final-guard 残差（realpathSync.native）', targets: [], r8: { matchedPresent: b3c9.length }, verdict: b3c9.length === 0 ? '9 名在 R7/R8 均未出现（转绿）' : '仍有残留，需核对' },
  'misc #125': {
    role: 'task-restart v2.0.0 run-bound 重写；direct-role e2e 旧名退役（Q normal-new early chain）',
    r8: { taskRestart, qNormalNew },
    verdict: 'Q normal-new early chain 旧名已退役且未再出现；task-restart 仍红：arm64 55.6s / x64 158.1s（等待超时），Windows 绿——与批内 3× 绿不符，需重开',
  },
  'KR-33 #129': {
    role: 'runtime-core 冻结 33：产品回归 1 + 测试假设 5 修复；环境 27 本已绿',
    r8: { present: present(runtimeCore33).length, total: runtimeCore33.length },
    verdict: present(runtimeCore33).length === 0 ? '33/33 未出现在三平台任何失败名（KR-33 归零）' : '仍有出现，逐名见 28-kr33-zero.json',
  },
  'macOS file-gate nlink #128': {
    role: 'W29×3/W30×2/Q2 P2 的 file-gate-host-facts-unproven 产品修复（目录 nlink 不入 digest）',
    r8: { w29w30q2Present: fileGateTargets, w34w35 },
    verdict:
      'arm64/Windows：W29×3/W30×2/Q2 P2 全部转绿，W34/W35 亦转绿；' +
      'x64：W29×3+新变体 missing-confirmation、W30×2、Q2 P2（改为 300s 超时）、W34/W35 仍红——file-gate 码已消失，后续阻塞为 chief-workflow.test.ts:1726 git-core-in-flight-unproven（Q2 P2 为超时）',
  },
  'misc2 #130': {
    role: 'run-pin M1/M2/M3、Pipeline initial workflow、Q74、W36；spawn fence 仅记录',
    r8: { present: misc2Targets, spawnFence },
    verdict: '4 个目标全部转绿（三平台/原平台均未再现）；spawn fence 如预期仍在（arm64+x64）',
  },
  'misc3 #131': {
    role: 'b31 路径 B 屏障、multi-runtime ENOTEMPTY 清理；compatibility-loopback / W-J5 仅记录',
    r8: { present: misc3Targets, compatLoop, wj5 },
    verdict: 'b31、multi-runtime ENOTEMPTY 转绿；compatibility-loopback 仍 Windows file-level 原生崩溃；W-J5 仍 x64 180s',
  },
};

// ---------- C. 未合入批次扣除 ----------
// kr29a：门禁 5 全部为冻结名（测试名逐字保留）→ 按名单扣除 R8 中出现者
const kr29aPresent = present(gates5);
// kr29b：编排 23 = orchestration-24 去掉已绿 REMOVED 的 wiring guards；按名单扣除 R8 中出现者
const orch23 = orch24.filter((n) => !/^wiring guards:/.test(n));
const kr29bPresent = present(orch23);
const platTargets = [...spawnFence, ...compatLoop, ...wj5];
const docsTargets = [];

const pendingBatches = {
  'kr29a (门禁 5)': {
    targets: gates5,
    presentInR8: kr29aPresent,
    note: 'kr29a 批记录：5 文件断言更新、门禁 577/576/0/1 3× 绿、typecheck 0；未合入 R8 CI。',
  },
  'kr29b (编排 23)': {
    targets: orch23,
    presentInR8: kr29bPresent,
    note:
      'orchestration-24 中 wiring guards 已由 B3c 修复、按 REMOVED 登记（R7/R8 均绿）；其余 23 名由 kr29b 更新（含 1 名本机 symlink 环境项，CI 本已绿）。' +
      `R8 中实际红：${kr29bPresent.length}/23（arm64/x64/Windows 三平台同红 22 + CI 已绿的 symlink 名 1 不计）。`,
  },
  'plat (平台硬化)': {
    targets: platTargets,
    presentInR8: platTargets,
    note: 'spawn fence 两路分类（macOS）、compatibility-loopback 子进程隔离+有界重试（Windows）、W-J5 预算观测（x64）；未合入 R8 CI。',
  },
  'KR-29 docs': { targets: docsTargets, note: '分类文档，不改宇宙。' },
};

const deducted = new Map();
for (const [b, v] of Object.entries(pendingBatches)) for (const n of v.targets ?? v.presentInR8 ?? []) if (r8Names.has(n)) deducted.set(n, b);

// ---------- D. 预计剩余 ----------
const remaining = universe.filter((x) => !deducted.has(x.name));
const remainingByFamily = {};
for (const x of remaining) (remainingByFamily[familyOf.get(x.name) ?? '(unknown)'] ??= []).push(x.name);
const remainingPerPlatform = {
  arm64: remaining.filter((x) => x.platforms.macos_arm64).length,
  x64: remaining.filter((x) => x.platforms.macos_x64).length,
  win: remaining.filter((x) => x.platforms.windows_x64).length,
};

const CATEGORY = (name, fam) => {
  if (/^W29 /.test(name)) return 'macOS-x64 file-gate 后续阻塞（git-core-in-flight-unproven @ chief-workflow:1726；新变体 missing-confirmation）';
  if (/^W30 /.test(name)) return 'macOS-x64 后续阻塞（同上 git-core-in-flight-unproven）';
  if (/^W33 /.test(name)) return 'macOS-x64（w19 后 Windows/arm64 已绿；x64 仍 git-core-in-flight-unproven）';
  if (/^W34 |^W35 /.test(name)) return 'macOS-x64 平台链（file-gate 码已消失；x64 仍 git-core-in-flight-unproven）';
  if (/^Q2 P2 first new project/.test(name)) return 'macOS-x64 300s 超时（原 file-gate 失败已消失，改为真实链超时）';
  if (/^重启恢复：未投递任务/.test(name)) return 'misc 未竟：arm64 55.6s / x64 158.1s 等待超时，Windows 绿';
  if (/^independent C Window/.test(name)) return 'R8 新增（arm64-only ENOTEMPTY 临时目录清理；flake 候选）';
  if (fam === 'known-red-62') return 'KR-29 目标（kr29a/kr29b 覆盖）';
  return '待定';
};
const catCounts = {};
for (const x of remaining) (catCounts[CATEGORY(x.name, familyOf.get(x.name) ?? '')] ??= []).push(x.name);

const projection = {
  generatedAt: new Date().toISOString(),
  basis: 'R8 宇宙 42（run 43867573699，main@5661a73，三平台工件齐全）',
  r6ProjectionAudit: {
    projected50: projected50.size,
    stillRedInR8: projStillRed.length,
    greenedSinceProjection: projGreened.length,
    greenedNames: projGreened,
    outsideProjection: outsideProjection.length,
    outsideProjectionNames: outsideProjection,
    batches: mergedBatchSurvival,
  },
  mergedBatchAudit,
  pendingBatches,
  deductedTotal: deducted.size,
  projectedRemaining: remaining.length,
  projectedRemainingPerPlatform: remainingPerPlatform,
  remainingByFamily: Object.fromEntries(Object.entries(remainingByFamily).map(([k, v]) => [k, sortNames(v)])),
  remainingByCategory: Object.fromEntries(Object.entries(catCounts).map(([k, v]) => [k, sortNames(v)])),
  risks: {
    fileGateX64:
      'file-gate-host-facts-unproven 在 R8 三平台均不再出现；但 x64 在 chief-workflow.test.ts:1726 出现 git-core-in-flight-unproven（400–600ms 快失败），Q2 P2 改为 300s 超时。arm64/Windows 同名全部转绿。x64 特有形态，需 owner 定性为产品守卫时序/夹具清理/runner 时序。',
    taskRestart: 'misc 批在本机 3× 绿；R8 CI arm64/x64 均红且耗时 55.6s/158.1s（等待超时），Windows 绿。需按 v2.0.0 run-bound 语义重开或标注平台候选。',
    independentCWindow: 'arm64-only ENOTEMPTY（ans-p1p7-window-report-*）——与 R6 multi-runtime ENOTEMPTY 同族；flake 候选，若复现按有界清理修复。',
    spawnFence: 'plat 未合入；R8 中 arm64 亦红（R7 已双 macOS 红），修复合入后预期 macOS 两平台回绿。',
    compatibilityLoopback: 'plat 未合入；Windows file-level 原生 libuv 崩溃 R8 再现（3.2s）。合入后预期有界重试兜底，但门禁不放松。',
    wj5: 'plat 仅加预算观测；合入后 x64 180s 是否消除未知，仍属平台/性能候选。',
    kr29: 'kr29a/kr29b 均未合入 R8 CI；批内验证为定向 3× 绿（门禁 577/576/0/1；编排 1375/1373/0/2 + 13/13），投影以名单扣除。',
  },
};
writeFileSync(join(args.outdir, '22-batch-projection-r8.json'), JSON.stringify(projection, null, 2) + '\n', 'utf8');

const tsv = [
  ['kind', 'batch', 'family', 'platforms', 'name', 'category/note'].join('\t'),
  ...remaining
    .map((x) => ({
      kind: 'remaining',
      batch: 'remaining',
      family: familyOf.get(x.name) ?? '',
      platforms: platBrief(x),
      name: x.name,
      note: CATEGORY(x.name, familyOf.get(x.name) ?? ''),
    }))
    .concat(
      [...deducted.entries()].map(([name, batch]) => ({
        kind: 'deducted',
        batch,
        family: familyOf.get(name) ?? '',
        platforms: platBrief(u.get(name)),
        name,
        note: '未合入批次目标（预计转绿）',
      }))
    )
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.batch.localeCompare(b.batch) || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .map((r) => [r.kind, r.batch, r.family, r.platforms, r.name, r.note].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '23-projected-remaining.tsv'), tsv + '\n', 'utf8');

// ---------- E. R6 投影偏差（20/21）----------
const deviationRows = [];
for (const name of projected50) {
  const still = r8Names.has(name);
  deviationRows.push({
    kind: still ? 'expected-still-red' : 'expected-greened',
    name,
    r6Family: null,
    r8Family: still ? familyOf.get(name) ?? '' : '',
    platforms: still ? platBrief(u.get(name)) : '',
    note: still ? CATEGORY(name, familyOf.get(name) ?? '') : 'R6 投影后转绿',
  });
}
for (const name of outsideProjection) {
  deviationRows.push({
    kind: r6names.has(name) ? 'r6-name-outside-projection' : 'new-vs-r6',
    name,
    r8Family: familyOf.get(name) ?? '',
    platforms: platBrief(u.get(name)),
    note: r6names.has(name) ? 'R6 宇宙内但不在 R6 投影剩余' : 'R6 宇宙外新增',
  });
}
const byKind = {};
for (const r of deviationRows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
const comparison = {
  generatedAt: new Date().toISOString(),
  r6Projection: projected50.size,
  r8Universe: universe.length,
  byKind,
  batches: mergedBatchSurvival,
  deviations: deviationRows.filter((r) => r.kind !== 'expected-still-red'),
};
writeFileSync(join(args.outdir, '20-r6-projection-vs-r8.json'), JSON.stringify(comparison, null, 2) + '\n', 'utf8');
const devTsv = [
  ['kind', 'family', 'platforms', 'name', 'note'].join('\t'),
  ...deviationRows
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .map((r) => [r.kind, r.r8Family, r.platforms ?? '', r.name, r.note ?? ''].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '21-r6-projection-deviations.tsv'), devTsv + '\n', 'utf8');

console.log('projected50', projected50.size, 'stillRed', projStillRed.length, 'greened', projGreened.length);
console.log('merged batches', JSON.stringify(Object.fromEntries(Object.entries(mergedBatchSurvival).map(([b, v]) => [b, `${v.greenedInR8}/${v.expectedGreen}`]))));
console.log('kr29a present', kr29aPresent.length, '/5; kr29b present', kr29bPresent.length, '/23; plat present', platTargets.length, '/3');
console.log('deducted', deducted.size, 'projectedRemaining', remaining.length, JSON.stringify(remainingPerPlatform));
for (const [fam, names] of Object.entries(projection.remainingByFamily)) console.log(`${fam}: ${names.length}`);
for (const [cat, v] of Object.entries(catCounts)) console.log(`${cat}: ${v.length}`);
console.log(`wrote 20/21/22/23 to ${args.outdir}`);
