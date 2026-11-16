#!/usr/bin/env node
// R5 测试债治理：R5 实际宇宙（116）在在跑批次（B3a 残差 / B5 / B6a / B6b / W19）合入后的预计剩余。
// 只用于规划；批次分支均未合入 R5 CI。口径来自各批记录（截至 2026-11-16 晚间）：
//   B3a 残差（b3ar，裁定按当前语义更新期望）：R5 source-gate 14 名全部转绿（run-pin 10 / run-change 2 / i-full-chain 2）；
//     `selected` 伪影在 R5 已不存在。
//   B5（b5new）：flake 16 + 有界 hang 2 中 16 名绿；task-restart 1 名产品/夹具候选保持红；
//     f-handler F3 1 名转 B6b；C-04 旧名退役（新名不在 R5 宇宙）。
//   B6a（未归类 12 / 5 文件）：R4 unclassified 12 名（R5 全部仍红）；按批次完成假设全部转绿（尚无批次证据）。
//   B6b（B0 其他 18 / 12 文件）：R5 b0-existing-other 17 名（`required` 伪影已绿）+ B5 移交 f-handler F3 1 名
//     = 18 名；按批次完成假设全部转绿（尚无批次证据）。
//   W19（w19）：W19 产品修复转绿 1 名；W33 消费侧待裁决保持红。
//   W19 合并风险：direct-role-capabilities.test.ts 3 个旧语义用例将新增红（若不同步更新），单列 risk。
// 输出：
//   22-batch-projection-r5.json
//   23-projected-remaining.tsv

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
for (const req of ['universe', 'families', 'r4-families', 'r4-projection', 'b3a-dispositions', 'outdir']) {
  if (!args[req]) { console.error(`missing --${req}`); process.exit(2); }
}

const universe = JSON.parse(readFileSync(args.universe, 'utf8'));
const families = JSON.parse(readFileSync(args.families, 'utf8'));
const r4fam = JSON.parse(readFileSync(args['r4-families'], 'utf8'));
const r4proj = JSON.parse(readFileSync(args['r4-projection'], 'utf8'));

const u = new Map(universe.map((x) => [x.name, x]));
const familyOf = new Map();
for (const f of families.families) for (const n of f.names) familyOf.set(n.name, f.family);
const r4Family = new Map();
for (const f of r4fam.families) for (const n of f.names) r4Family.set(n.name, f.family);

const namesByFamily = (fam) => families.families.find((f) => f.family === fam)?.names.map((n) => n.name) ?? [];

// B3a 残差：从 b3ar dispositions.tsv 读 GREEN 名单（第 1 列 file，第 2 列 name，处置列含 GREEN/绿）
const b3aGreen = [];
for (const line of readFileSync(args['b3a-dispositions'], 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const cols = line.split('\t');
  if (cols.length < 4) continue;
  if (/GREEN|绿/.test(cols[2] ?? '') || /GREEN|绿/.test(cols[3] ?? '')) b3aGreen.push(cols[1]);
}
const b3aResidualR5 = namesByFamily('source-gate').filter((n) => u.has(n));

// B5：R5 flake 16 中除 task-restart、f-handler F3 外全绿；hang 2（关闭全部 / C-04）命中即绿/退役；W-J5 不在 B5 范围
const flakeR5 = namesByFamily('flake-timing');
const b5Green = flakeR5.filter((n) => !/重启恢复：未投递任务/.test(n) && !/^F3 护栏矩阵/.test(n));
const b5Hang = namesByFamily('hang-timeout').filter((n) => /^关闭全部与双角色刷新扫描交接/.test(n) || /^C-04 decision 开关开启/.test(n));
const b5AllDeduct = [...b5Green, ...b5Hang];
const b5StillRed = flakeR5.filter((n) => /重启恢复：未投递任务/.test(n));
const b5MovedToB6b = flakeR5.filter((n) => /^F3 护栏矩阵/.test(n));

// B6a：R4 unclassified 12 名中 R5 仍存在者
const r4Unclassified = new Set((r4fam.families.find((f) => f.family === 'unclassified-new')?.names ?? []).map((n) => n.name));
const b6aNames = [...r4Unclassified].filter((n) => u.has(n));

// B6b：R5 b0-existing-other 17 名 + B5 移交 f-handler 1 名
const b6bNames = [...namesByFamily('b0-existing-other'), ...b5MovedToB6b];

// W19 / W33
const w19Names = [...u.keys()].filter((n) => /^W19 /.test(n));
const w33Names = [...u.keys()].filter((n) => /^W33 /.test(n));

const deducted = new Map(); // name -> batch
const addBatch = (batch, names) => { for (const n of names) if (u.has(n) && !deducted.has(n)) deducted.set(n, batch); };
addBatch('B3a-residual', b3aResidualR5);
addBatch('B5', b5AllDeduct);
addBatch('B6a', b6aNames);
addBatch('B6b', b6bNames);
addBatch('W19', w19Names);

const remaining = universe.filter((x) => !deducted.has(x.name));
const remainingByFamily = {};
for (const x of remaining) {
  const fam = familyOf.get(x.name) ?? '(unknown)';
  (remainingByFamily[fam] ??= []).push(x.name);
}

const CATEGORY = (name, fam) => {
  if (fam === 'known-red-62') return 'B7 重冻结（冻结基线，不排修）';
  if (fam === 'e71501c-drift' && /^W33 /.test(name)) return 'W33 消费侧裁决（apply-journal 跨 run hub 例外 vs 更新期望）';
  if (fam === 'e71501c-drift' && /^W29 |^W30 |^W34 |^W35 /.test(name)) return 'B4 残差（macOS-only 复发；owner 裁定 B4 期望是否按 macOS 再更新）';
  if (fam === 'e71501c-drift' && /^W36 /.test(name)) return 'x64-only 复现（B5 本机 3× 绿；平台/性能候选）';
  if (fam === 'hang-timeout' && /^W-J5/.test(name)) return 'x64-only 180s 挂起复现（R3 同款；runner 性能/flake 候选）';
  if (fam === 'ci-path-canonical') return 'Q2 P2 macOS-only 产品候选（host facts/protection）';
  if (fam === 'unclassified-new' && /^W1b /.test(name)) return '新 Windows-only 失败（W1b chief-workflow；待定性）';
  if (fam === 'unclassified-new') return 'B3c Windows-only 残差（Windows CI 仍触发 git-file-final-guard-unproven；需重开 B3c/Windows 根因）';
  if (fam === 'flake-timing') return 'task-restart 产品/夹具候选（v2.0.0 来源门 vs restore 语义）';
  return '待定';
};
const catCounts = {};
for (const x of remaining) {
  const cat = CATEGORY(x.name, familyOf.get(x.name) ?? '');
  (catCounts[cat] ??= []).push(x.name);
}

// 逐批扣除明细
const batchReport = {
  'B3a-residual': { description: 'b3ar 裁定后按当前语义更新期望；R5 source-gate 14 名预计全绿', expectedGreen: 14, matchedInR5: b3aResidualR5.length, names: b3aResidualR5 },
  'B5': { description: 'flake 16 + hang 2：16 绿（含 C-04 旧名退役）；task-restart 红；f-handler 移交 B6b', expectedGreen: 16, matchedInR5: b5AllDeduct.length, names: b5AllDeduct, stillRed: b5StillRed, movedToB6b: b5MovedToB6b },
  'B6a': { description: '未归类 12（R4 名单；批次进行中，按全部转绿假设）', expectedGreen: 12, matchedInR5: b6aNames.length, names: b6aNames, assumption: true },
  'B6b': { description: 'B0 其他 17（R5；required 伪影已绿）+ f-handler F3 1 = 18（批次进行中，按全部转绿假设）', expectedGreen: 18, matchedInR5: b6bNames.length, names: b6bNames, assumption: true },
  'W19': { description: 'W19 产品修复 5× 绿；W33 保持红', expectedGreen: 1, matchedInR5: w19Names.length, names: w19Names, w33StillRed: w33Names },
};

const projection = {
  generatedAt: new Date().toISOString(),
  basis: 'R5 宇宙 116（run 43829367008，main@a0baea2，含 B3a/B3b/B3c/B4 合并）',
  batches: batchReport,
  deductedTotal: deducted.size,
  projectedRemaining: remaining.length,
  remainingByFamily: Object.fromEntries(Object.entries(remainingByFamily).map(([k, v]) => [k, v.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))])),
  remainingByCategory: Object.fromEntries(Object.entries(catCounts).map(([k, v]) => [k, v.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))])),
  risks: {
    w19DirectRoleConflicts: {
      count: 3,
      note: 'W19 合并后 direct-role-capabilities.test.ts 的 3 个旧语义用例（:63 noticeRecipients、:711-717 两个 missingSink 用例）若不同步更新将新增红；不计入 55。',
    },
    b6Assumptions: 'B6a/B6b 尚无批次证据；若未全部转绿，每未完成 1 名 +1。',
    b4NoChange: 'B4 6 名 no-change（W29×3/W30×2/W35）与 W34（改期望后 macOS 仍红）= 7 名未在 R5 解决。',
  },
};
writeFileSync(join(args.outdir, '22-batch-projection-r5.json'), JSON.stringify(projection, null, 2) + '\n', 'utf8');

const tsv = [
  ['batch', 'family', 'platforms', 'name', 'category/note'].join('\t'),
  ...remaining
    .map((x) => ({
      batch: 'remaining',
      family: familyOf.get(x.name) ?? '',
      platforms: Object.keys(x.platforms).map((k) => ({ macos_arm64: 'arm64', macos_x64: 'x64', windows_x64: 'win' }[k])).join('+'),
      name: x.name,
      note: CATEGORY(x.name, familyOf.get(x.name) ?? ''),
    }))
    .sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .map((r) => [r.batch, r.family, r.platforms, r.name, r.note].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '23-projected-remaining.tsv'), tsv + '\n', 'utf8');

console.log('deducted', JSON.stringify(Object.fromEntries(Object.entries(batchReport).map(([k, v]) => [k, v.matchedInR5]))), 'total', deducted.size);
console.log('projectedRemaining', remaining.length);
for (const [fam, names] of Object.entries(projection.remainingByFamily)) console.log(`${fam}: ${names.length}`);
console.log('categories:'); for (const [c, names] of Object.entries(projection.remainingByCategory)) console.log(`  ${c}: ${names.length}`);
console.log(`wrote 22/23 to ${args.outdir}`);
