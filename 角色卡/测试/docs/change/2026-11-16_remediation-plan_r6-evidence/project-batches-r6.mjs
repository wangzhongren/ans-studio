#!/usr/bin/env node
// R6：R6 实际宇宙（63 = x64 51 / Windows 51，合并 63）在四批在跑批次合入后的预计剩余；
// 同时对 R5 批次投影（55）与六个已合入批次（B3a残差/B5/B6a/B6b；W19 与 cife 不在本轮）做逐批核对。
//
// 口径：
//   - 已合入批次（R6 CI 含）：B3a-residual(#116)、B5(#117)、B6a(#119)、B6b(#120)、cife(#121，workflow 止血，不改变宇宙)。
//     R5 文档 #118 无代码改动。
//   - 在跑未合入批次（晚于本轮 CI）：
//       w19  = a469a83（W19/W33 close-notify 产品修复 + hub 跨 run 例外 + direct-role-capabilities 三处旧语义更新）
//       b4fu = 84c4a3c（W1b 挂起守卫 2.5s→15s；W29/W30/W34/W35/W36 明确不改，保持平台/产品候选）
//       b3cfu= 99adf94（9 名 Windows-only 残差：夹具 realpathSync.native）
//       misc = 2c323ff（task-restart 按 v2.0.0 run-bound 重写；direct-role e2e fixed A1→A2→A3 重写；
//               W-J5/Q2 P2/spawn fence 仅分类不改）
//   - 目标名取自各批记录；不在 R6 宇宙的名字计 0（例如 W1b 本轮已绿）。
//
// 输出：
//   20-r5-projection-vs-r6.json   R5 投影 55 vs R6 63 偏差与四个已合入批次存活
//   22-batch-projection-r6.json   四批扣除与预计剩余
//   23-projected-remaining.tsv    预计剩余逐名（族/平台/裁决类别）

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
for (const req of ['r6-universe', 'r6-families', 'r5-projection', 'r5-universe', 'outdir']) {
  if (!args[req]) { console.error(`missing --${req}`); process.exit(2); }
}

const universe = JSON.parse(readFileSync(args['r6-universe'], 'utf8'));
const families = JSON.parse(readFileSync(args['r6-families'], 'utf8'));
const r5proj = JSON.parse(readFileSync(args['r5-projection'], 'utf8'));
const r5Names = new Set(JSON.parse(readFileSync(args['r5-universe'], 'utf8')).map((x) => x.name));

const u = new Map(universe.map((x) => [x.name, x]));
const familyOf = new Map();
for (const f of families.families) for (const n of f.names) familyOf.set(n.name, f.family);
const namesByFamily = (fam) => families.families.find((f) => f.family === fam)?.names.map((n) => n.name) ?? [];
const platShort = { macos_arm64: 'arm64', macos_x64: 'x64', windows_x64: 'win' };
const platBrief = (x) => Object.keys(x.platforms).map((k) => platShort[k]).join('+') || '-';

// ---------- A. R5 投影 55 vs R6 63 ----------
const projected55 = new Set(Object.values(r5proj.remainingByFamily).flat());
const r6Names = new Set(u.keys());
const projStillRed = [...projected55].filter((n) => r6Names.has(n));
const projGreened = [...projected55].filter((n) => !r6Names.has(n));
const outsideProjection = [...r6Names].filter((n) => !projected55.has(n));

// 已合入批次的 R5 投影绿名存活（R5 projection batches 的 matched names）
const mergedBatchSurvival = {};
for (const [b, v] of Object.entries(r5proj.batches)) {
  if (b === 'W19') continue; // W19 批次未合入本轮
  const stillRed = v.names.filter((n) => r6Names.has(n));
  mergedBatchSurvival[b] = {
    expectedGreen: v.names.length,
    greenedInR6: v.names.length - stillRed.length,
    stillRedInR6: stillRed.length,
    stillRedNames: stillRed,
  };
}

// ---------- B. 四批在跑批次目标名 ----------
// w19（W19/W33）
const w19Names = [...r6Names].filter((n) => /^W19 /.test(n) || /^W33 /.test(n));
// b4fu（W1b；W29/W30/W34/W35/W36 明确不改）
const b4fuW1b = [...r6Names].filter((n) => /^W1b 真实无退修选项/.test(n));
const b4fuPlatformCarry = [...r6Names].filter((n) => /^W29 |^W30 |^W34 |^W35 |^W36 /.test(n));
// b3cfu（9 名 Windows-only git-file-final-guard-unproven；与批记录 §一 逐名一致）
const B3C9 = /^(AC-1\/AC-6\/AC-7\/P1\.2-AC-28 |AC-16 集成|AC-2 Pi actor|P1\.2-AC-27 |gate active-tool|gate H13|gate host-continuation|host-continuation：真实 rapporteur|Q16 取代)/;
const b3c9 = [...r6Names].filter((n) => B3C9.test(n));
// misc（task-restart + direct-role e2e 旧名）
const miscTaskRestart = [...r6Names].filter((n) => /^重启恢复：未投递任务重新入队一次/.test(n));
const miscDirectRole = [...r6Names].filter((n) => /^Q normal-new early chain:/.test(n));
// misc 明确不改的平台候选（仅分类）
const miscPlatformCandidates = [...r6Names].filter((n) =>
  /^Q2 P2 first new project/.test(n) || /^Git final spawn fence/.test(n) || /^W-J5/.test(n)
);

const batchReport = {
  'W19/W33 (w19@a469a83)': {
    description: 'close-notify 产品修复 + hub 跨 run information-only 例外 + direct-role-capabilities 三处旧语义更新（批内已解决，无 +3 风险）',
    targets: w19Names,
    presentInR6: w19Names.length,
  },
  'B4-fu (b4fu@84c4a3c)': {
    description: 'W1b 挂起守卫 2.5s→15s；W29/W30/W34/W35/W36 不改（产品/平台候选）',
    targets: b4fuW1b,
    presentInR6: b4fuW1b.length,
    note: 'W1b 未在 R6 宇宙（Windows 本轮已绿）；平台残差保留：' + b4fuPlatformCarry.length + ' 名',
    platformCarry: b4fuPlatformCarry,
  },
  'B3c-fu (b3cfu@99adf94)': {
    description: '9 名 Windows-only 残差（8.3 短名 TEMP → 夹具 realpathSync.native）',
    targets: b3c9,
    presentInR6: b3c9.length,
    note: b3c9.length === 9 ? '恰好 9 名，与批记录逐名一致' : `选择面 ${b3c9.length} 名，需人工核对批次记录`,
  },
  'misc (misc@2c323ff)': {
    description: 'task-restart 按 v2.0.0 run-bound 重写；direct-role e2e 按 fixed A1→A2→A3 重写（旧名退役）',
    targets: [...miscTaskRestart, ...miscDirectRole],
    presentInR6: miscTaskRestart.length + miscDirectRole.length,
    note: 'W-J5 / Q2 P2 / spawn fence 仅分类不改，保留：' + miscPlatformCandidates.length + ' 名',
    unchangedCandidates: miscPlatformCandidates,
  },
};

const deducted = new Map();
for (const [b, v] of Object.entries(batchReport)) for (const n of v.targets) if (!deducted.has(n)) deducted.set(n, b);

// ---------- C. 预计剩余 ----------
const remaining = universe.filter((x) => !deducted.has(x.name));
const remainingByFamily = {};
for (const x of remaining) (remainingByFamily[familyOf.get(x.name) ?? '(unknown)'] ??= []).push(x.name);
const remainingX64 = remaining.filter((x) => x.platforms.macos_x64).length;
const remainingWin = remaining.filter((x) => x.platforms.windows_x64).length;

const CATEGORY = (name, fam) => {
  if (fam === 'known-red-62') return 'B7 重冻结（冻结基线，不排修）';
  if (/^W29 |^W30 /.test(name)) return 'macOS 产品 file-gate（file-gate-host-facts-unproven；W29/W30，与 Q2 P2 同源）';
  if (/^W34 |^W35 /.test(name)) return 'macOS 平台链（file-gate + W33 遗留 active 条目；B4-fu 已定性不改）';
  if (/^W36 /.test(name)) return 'x64 平台候选（tools 形状 TypeError；本机 4× 绿）';
  if (/^W-J5/.test(name)) return 'x64 180s 挂起（R3/R5/R6 三度 x64-only；平台/性能候选）';
  if (/^Q2 P2 first new project/.test(name)) return 'macOS 产品 file-gate（host facts/protection）';
  if (/^Git final spawn fence/.test(name)) return 'macOS FSEvents 时序候选（B6a 归因；两路 fail-closed）';
  if (/^W1b /.test(name)) return 'B4-fu 目标（本轮已绿；守卫加固为回归保险）';
  if (/^重启恢复：未投递任务/.test(name)) return 'misc 目标（v2.0.0 run-bound 重写）';
  if (/^Q normal-new early chain/.test(name)) return 'misc 目标（fixed A1→A2→A3 重写，旧名退役）';
  if (/^W19 |^W33 /.test(name)) return 'w19 目标（close-notify/hub 跨 run 例外）';
  if (/^run-pin：M1\/M2\/M3/.test(name)) return 'B3a-residual 未竟（重复派发抑制断言 true!==false）；需 B3a 重开或更新期望';
  if (/^Q74 owned Git metadata observer/.test(name)) return 'B6b 未竟（/已获准并落盘/ 文案断言）；需 B6b 跟进';
  if (/^Pipeline initial workflow source/.test(name)) return 'B6a 未竟（ENOENT realpath stable-source；Windows-only）';
  if (/^路径 B：B3 accepted/.test(name)) return 'R6 新增（b31 fixed-release delivery 断言 undefined!==delivered；x64-only，待定性）';
  if (/^actual Core request_choice abort/.test(name)) return 'R6 新增（Windows ENOTEMPTY 临时目录清理；flake 候选）';
  if (/compatibility-loopback\.test\.ts$/.test(name)) return 'R6 新增（Windows 原生 libuv 断言崩溃 UV_HANDLE_CLOSING；file-level）';
  if (/^AC-16|^P1\.2-AC-27|^AC-1\/AC-6|^AC-2 Pi|^gate |^host-continuation：|^Q16 取代/.test(name)) return 'B3c-fu 目标（Windows-only git-file-final-guard-unproven）';
  return '待定';
};

const catCounts = {};
for (const x of remaining) (catCounts[CATEGORY(x.name, familyOf.get(x.name) ?? '')] ??= []).push(x.name);

const projection = {
  generatedAt: new Date().toISOString(),
  basis: 'R6 宇宙 63（run 43848313583，main@82dc180，含 B3a残差/B5/B6a/B6b/cife；arm64 job cancelled 无工件）',
  mergedBatchesAudit: {
    projection55: projected55.size,
    stillRedInR6: projStillRed.length,
    greenedSinceProjection: projGreened.length,
    greenedNames: projGreened,
    outsideProjection: outsideProjection.length,
    batches: mergedBatchSurvival,
  },
  runningBatches: batchReport,
  deductedTotal: deducted.size,
  projectedRemaining: remaining.length,
  projectedRemainingPerPlatform: { x64: remainingX64, windows: remainingWin },
  remainingByFamily: Object.fromEntries(Object.entries(remainingByFamily).map(([k, v]) => [k, v.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))])),
  remainingByCategory: Object.fromEntries(Object.entries(catCounts).map(([k, v]) => [k, v.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))])),
  risks: {
    w19Merge: 'w19 批内已同步 direct-role-capabilities 三处旧语义更新（§8.2）；R5 记录的 +3 风险已随批次内更新消除。产品面新增 close 通知与 hub 跨 run 白名单，需在 R7 三平台复核。',
    b4fuW1b: 'W1b 在 R6 已绿（未入宇宙）；b4fu 的 15s 守卫为回归保险。W29/W30/W34/W35/W36 不改，仍是 macOS/x64 平台候选。',
    b3cfu: '9 名按 8.3 短名 TEMP 本地复现并 3 口径 × 3× 绿；Windows CI 等价性依赖 runner TEMP 短名（已从工件取证 RUNNER~1）。',
    misc: 'task-restart 45–50s/次（真实 Git 链），direct-role e2e ~0.6s；均 3× 自然退出绿。direct-role 旧名退役，R7 宇宙中应出现新名且为绿。',
    newNames: 'b31 路径 B（x64）、multi-runtime request_choice abort ENOTEMPTY（win）、compatibility-loopback 原生崩溃（win）均无批次覆盖；若 R7 复现需排修/定性。',
    arm64Gap: 'arm64 job 级 cancelled（无步骤/工件），macOS-only 名在 arm64 上的状态未知；R7 必须优先恢复 arm64 并以三平台复跑为准。',
  },
};
writeFileSync(join(args.outdir, '22-batch-projection-r6.json'), JSON.stringify(projection, null, 2) + '\n', 'utf8');

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
        note: '四批目标（预计转绿）',
      }))
    )
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.batch.localeCompare(b.batch) || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .map((r) => [r.kind, r.batch, r.family, r.platforms, r.name, r.note].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '23-projected-remaining.tsv'), tsv + '\n', 'utf8');

// ---------- D. R5 投影偏差（20/21）----------
const deviationRows = [];
for (const name of projected55) {
  const still = r6Names.has(name);
  deviationRows.push({
    kind: still ? 'expected-still-red' : 'expected-greened',
    name,
    r5Family: null,
    r6Family: still ? familyOf.get(name) ?? '' : '',
    platforms: still ? platBrief(u.get(name)) : '',
  });
}
for (const name of outsideProjection) {
  const mergedStill = Object.entries(mergedBatchSurvival).find(([, v]) => v.stillRedNames.includes(name));
  const kind = mergedStill
    ? 'merged-batch-target-still-red'
    : r5Names.has(name)
      ? 'r5-name-outside-projection'
      : 'new-vs-r6';
  deviationRows.push({
    kind,
    name,
    batch: mergedStill ? mergedStill[0] : '',
    r6Family: familyOf.get(name) ?? '',
    platforms: platBrief(u.get(name)),
  });
}
const byKind = {};
for (const r of deviationRows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
const comparison = {
  generatedAt: new Date().toISOString(),
  r5Projection: projected55.size,
  r6Universe: universe.length,
  byKind,
  mergedBatchSurvival,
  deviations: deviationRows.filter((r) => r.kind !== 'expected-still-red'),
};
writeFileSync(join(args.outdir, '20-r5-projection-vs-r6.json'), JSON.stringify(comparison, null, 2) + '\n', 'utf8');
const devTsv = [
  ['kind', 'batch', 'family', 'platforms', 'name'].join('\t'),
  ...deviationRows
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .map((r) => [r.kind, r.batch ?? '', r.r6Family, r.platforms ?? '', r.name].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '21-r5-projection-deviations.tsv'), devTsv + '\n', 'utf8');

console.log('projected55 stillRed', projStillRed.length, 'greened', projGreened.length, JSON.stringify(projGreened));
console.log('merged batches', JSON.stringify(Object.fromEntries(Object.entries(mergedBatchSurvival).map(([b, v]) => [b, `${v.greenedInR6}/${v.expectedGreen}`]))));
console.log('four batches present', JSON.stringify(Object.fromEntries(Object.entries(batchReport).map(([b, v]) => [b, v.presentInR6]))));
console.log('deducted', deducted.size, 'projectedRemaining', remaining.length, 'x64', remainingX64, 'win', remainingWin);
for (const [fam, names] of Object.entries(projection.remainingByFamily)) console.log(`${fam}: ${names.length}`);
console.log('byKind', JSON.stringify(byKind));
console.log(`wrote 20/21/22/23 to ${args.outdir}`);
