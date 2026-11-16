#!/usr/bin/env node
// R4 测试债治理：批次投影（B3a/B3b/B3c/B4 已转绿名扣除后的剩余宇宙与族）+ 下一批 B5/B6 清单。
//
// 输入：
//   --universe   R4 06-merged-universe.json
//   --families   R4 11-families.json
//   --r3-families R3 11-families.json（取 B3b/B3c/B4 目标族原名单）
//   --b3a-family-vs-local fix-test-debt-b3a 的 02-family-vs-local.tsv（GREEN(3x) 行 = B3a 已转绿 8 名）
//   --outdir
//
// 口径（协调者简报）：
//   B3a：source 门 23 → 已转绿 8，剩余 15（run-pin 10 / run-change 2 / i-full-chain 2 / 1 伪影），停手待裁定。
//   B3b：VCA 13 → 全部转绿。
//   B3c：ci-path 42 → 本地可复现 40 转绿；Q2 P2（CI macOS-only 产品候选）与 W48（Windows inline，本地绿）不扣。
//   B4：drift 32 → 30 转绿（W19/W33 产品候选不扣）。
//
// 投影 = R4 宇宙 − （各批已转绿名 ∩ R4 宇宙）。批次分支未合入 R4 CI，投影仅用于规划。

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
for (const req of ['universe', 'families', 'r3-families', 'b3a-family-vs-local', 'outdir']) {
  if (!args[req]) { console.error(`missing --${req}`); process.exit(2); }
}

const universe = JSON.parse(readFileSync(args.universe, 'utf8'));
const families = JSON.parse(readFileSync(args.families, 'utf8'));
const r3families = JSON.parse(readFileSync(args['r3-families'], 'utf8'));

const r4Names = new Set(universe.map((u) => u.name));
const r4ForName = new Map(universe.map((u) => [u.name, u]));
const r4Family = new Map();
for (const f of families.families) for (const n of f.names) r4Family.set(n.name, f.family);
const r3FamilyNames = new Map();
for (const f of r3families.families) r3FamilyNames.set(f.family, f.names.map((n) => n.name));

// B3a 已转绿 8 名：来自批次证据 TSV 的 GREEN(3x) 行
const b3aGreen = [];
for (const line of readFileSync(args['b3a-family-vs-local'], 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const cols = line.split('\t');
  if (cols.length < 4) continue;
  if (/^GREEN/.test(cols[3])) b3aGreen.push(cols[1]);
}
// B3b：R3 vca-flow 13 全部
const b3bGreen = r3FamilyNames.get('vca-flow') ?? [];
// B3c：R3 ci-path-canonical 42 去掉 Q2 P2 / W48
const b3cAll = r3FamilyNames.get('ci-path-canonical') ?? [];
const b3cExcluded = b3cAll.filter((n) => /^Q2 P2 first new project/.test(n) || /^W48 /.test(n));
const b3cGreen = b3cAll.filter((n) => !b3cExcluded.includes(n));
// B4：R3 e71501c-drift 32 去掉 W19 / W33
const b4All = r3FamilyNames.get('e71501c-drift') ?? [];
const b4Excluded = b4All.filter((n) => /^W19 /.test(n) || /^W33 /.test(n));
const b4Green = b4All.filter((n) => !b4Excluded.includes(n));

const batches = {
  B3a: { greens: b3aGreen, excluded: [], expected: 8 },
  B3b: { greens: b3bGreen, excluded: [], expected: 13 },
  B3c: { greens: b3cGreen, excluded: b3cExcluded, expected: 40 },
  B4: { greens: b4Green, excluded: b4Excluded, expected: 30 },
};
const batchReport = {};
const deducted = new Set();
for (const [b, v] of Object.entries(batches)) {
  const matched = v.greens.filter((n) => r4Names.has(n));
  const missing = v.greens.filter((n) => !r4Names.has(n));
  for (const n of matched) deducted.add(n);
  batchReport[b] = {
    greenCount: v.greens.length,
    expectedGreenCount: v.expected,
    matchedInR4: matched.length,
    missingFromR4: missing.length,
    notDeductedBecauseExcluded: v.excluded,
    missingNames: missing,
    matchedNames: matched,
  };
}

const projected = universe.filter((u) => !deducted.has(u.name));
const projectedByFamily = {};
for (const u of projected) {
  const fam = r4Family.get(u.name) ?? '(unknown)';
  (projectedByFamily[fam] ??= []).push(u.name);
}
const r4ByFamily = {};
for (const u of universe) {
  const fam = r4Family.get(u.name) ?? '(unknown)';
  (r4ByFamily[fam] ??= []).push(u.name);
}
const familyTable = [];
for (const fam of Object.keys(r4ByFamily).sort((a, b) => (projectedByFamily[b]?.length ?? 0) - (projectedByFamily[a]?.length ?? 0))) {
  familyTable.push({
    family: fam,
    r4Count: r4ByFamily[fam].length,
    deductedByBatches: r4ByFamily[fam].length - (projectedByFamily[fam]?.length ?? 0),
    projectedCount: projectedByFamily[fam]?.length ?? 0,
    projectedNames: (projectedByFamily[fam] ?? []).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
  });
}

const projection = {
  generatedAt: new Date().toISOString(),
  basis: 'R4 宇宙 188（run 43812832566，main@8d6a35e，B3a/B3b/B3c/B4 分支未合入）',
  batches: batchReport,
  deductedTotal: deducted.size,
  projectedUniverse: projected.length,
  familyTable,
};
writeFileSync(join(args.outdir, '20-batch-projection.json'), JSON.stringify(projection, null, 2) + '\n', 'utf8');

const tsv = [
  ['family', 'r4Count', 'deductedByBatches', 'projectedCount', 'projectedNames'].join('\t'),
  ...familyTable.map((r) => [r.family, r.r4Count, r.deductedByBatches, r.projectedCount, r.projectedNames.join(' | ')].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '21-batch-projection.tsv'), tsv + '\n', 'utf8');

// 下一批 B5/B6 清单（逐名 + 文件 + 平台 + 优先级 + 备注）
const PRIORITY = {
  'flake-timing': 'B5-P2',
  'hang-timeout': 'B5-P1',
  'b0-existing-other': 'B6-P2',
  'unclassified-new': 'B6-P1',
  'source-gate': 'B3a-residual-P1（需 owner 裁定后按 B4 类更新期望）',
  'e71501c-drift': 'product-candidate',
  'ci-path-canonical': 'product-candidate',
  'known-red-62': 'frozen-known-red（B7 重冻结）',
  'vca-flow': 'B3b（已完成，投影扣除）',
};
const nextRows = [];
for (const fam of Object.keys(projectedByFamily)) {
  for (const name of projectedByFamily[fam].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))) {
    const u = r4ForName.get(name);
    const platforms = Object.keys(u?.platforms ?? {}).map((k) => ({ macos_arm64: 'arm64', macos_x64: 'x64', windows_x64: 'win' }[k]));
    nextRows.push({
      batch: PRIORITY[fam] ?? '待定',
      family: fam,
      file: u?.repoFiles?.[0] ?? u?.logFiles?.[0] ?? '(unresolved)',
      platforms: platforms.join('+'),
      name,
      productCandidate: /^(W19 |W33 |Q2 P2 )/.test(name),
      note: fam === 'source-gate' && /^(selected)$/.test(name)
        ? 'B3a 伪影：实为 chief-workflow 子测试，按 e71501c 漂移族处理'
        : '',
    });
  }
}
const nextTsv = [
  ['batch', 'family', 'file', 'platforms', 'productCandidate', 'name', 'note'].join('\t'),
  ...nextRows.map((r) => [r.batch, r.family, r.file, r.platforms, r.productCandidate, r.name, r.note].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '22-next-batches.tsv'), nextTsv + '\n', 'utf8');

console.log('batches', JSON.stringify(Object.fromEntries(Object.entries(batchReport).map(([k, v]) => [k, { green: v.greenCount, matched: v.matchedInR4, missing: v.missingFromR4 }]))));
console.log('deductedTotal=' + deducted.size + ' projectedUniverse=' + projected.length);
for (const r of familyTable) console.log(`${r.family}: r4=${r.r4Count} -${r.deductedByBatches} => ${r.projectedCount}`);
console.log(`wrote 20/21/22 to ${args.outdir}`);
