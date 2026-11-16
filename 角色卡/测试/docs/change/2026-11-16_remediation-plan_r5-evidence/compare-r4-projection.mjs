#!/usr/bin/env node
// R5 测试债治理：R5 实际宇宙（116）与 R4 批次投影（99）逐名偏差。
// 输入：
//   --r4-universe / --r5-universe / --r4-projection（R4 20-batch-projection.json）/ --r4-families / --r5-families
// 输出：
//   20-r4-projection-vs-r5.json   偏差分类与逐批存活
//   21-r4-projection-deviations.tsv 逐名偏差（expected/actual/kind/batch/family）
//
// 分类：
//   expected-still-red     R4 投影 99 内且 R5 仍红（符合投影）
//   expected-greened       R4 投影 99 内但 R5 已绿（好于投影）
//   batch-target-still-red 属于某批已扣除绿名，但 R5 仍红（投影偏差，批修复未在 CI 生效）
//   new-vs-r4              R4 宇宙之外的新/复现名（R3 复现或全新）
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
for (const req of ['r4-universe', 'r5-universe', 'r4-projection', 'r4-families', 'r5-families', 'outdir']) {
  if (!args[req]) { console.error(`missing --${req}`); process.exit(2); }
}

const r4u = JSON.parse(readFileSync(args['r4-universe'], 'utf8'));
const r5u = JSON.parse(readFileSync(args['r5-universe'], 'utf8'));
const proj = JSON.parse(readFileSync(args['r4-projection'], 'utf8'));
const r4fam = JSON.parse(readFileSync(args['r4-families'], 'utf8'));
const r5fam = JSON.parse(readFileSync(args['r5-families'], 'utf8'));

const r4Map = new Map(r4u.map((u) => [u.name, u]));
const r5Map = new Map(r5u.map((u) => [u.name, u]));
const r4Family = new Map();
for (const f of r4fam.families) for (const n of f.names) r4Family.set(n.name, f.family);
const r5Family = new Map();
for (const f of r5fam.families) for (const n of f.names) r5Family.set(n.name, f.family);

const expectedFamily = new Map();
for (const row of proj.familyTable) for (const n of row.projectedNames) expectedFamily.set(n, row.family);

const batchOf = new Map();
for (const [b, v] of Object.entries(proj.batches)) {
  for (const n of v.matchedNames) if (!batchOf.has(n)) batchOf.set(n, b);
}

const rows = [];
for (const [name, fam] of expectedFamily) {
  if (r5Map.has(name)) {
    rows.push({ name, expected: true, actual: true, kind: 'expected-still-red', batch: batchOf.get(name) ?? '', family: fam, r4Family: r4Family.get(name) ?? '', r5Family: r5Family.get(name) ?? fam });
  } else {
    rows.push({ name, expected: true, actual: false, kind: 'expected-greened', batch: '', family: fam, r4Family: r4Family.get(name) ?? '', r5Family: '', note: 'R5 三平台已不复现（好于投影）' });
  }
}
for (const name of r5Map.keys()) {
  if (expectedFamily.has(name)) continue;
  const kind = batchOf.has(name) ? 'batch-target-still-red' : r4Map.has(name) ? 'r4-name-not-in-projection' : 'new-vs-r4';
  rows.push({ name, expected: false, actual: true, kind, batch: batchOf.get(name) ?? '', family: r5Family.get(name) ?? '', r4Family: r4Family.get(name) ?? '(R4 无)', r5Family: r5Family.get(name) ?? '', note: kind === 'new-vs-r4' ? 'R4 宇宙外（R3 复现或全新）' : '' });
}

const byKind = {};
for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;

// 逐批存活：该批 matched 绿名在 R5 仍红者
const batchSurvival = {};
for (const [b, v] of Object.entries(proj.batches)) {
  const stillRed = v.matchedNames.filter((n) => r5Map.has(n));
  const greened = v.matchedNames.filter((n) => !r5Map.has(n));
  batchSurvival[b] = {
    matchedInR4: v.matchedNames.length,
    stillRedInR5: stillRed.length,
    greenedInR5: greened.length,
    stillRedNames: stillRed,
    // 该批绿名中 R4 即缺失（未参与投影）的名
    missingFromR4: v.missingNames,
  };
}

const out = {
  generatedAt: new Date().toISOString(),
  r4Universe: r4u.length,
  r4Projected: expectedFamily.size,
  r5Universe: r5u.length,
  byKind,
  batchSurvival,
  expectedGreened: rows.filter((r) => r.kind === 'expected-greened').map((r) => ({ name: r.name, family: r.family })),
  deviations: rows.filter((r) => r.kind !== 'expected-still-red'),
};
writeFileSync(join(args.outdir, '20-r4-projection-vs-r5.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');

const tsv = [
  ['kind', 'batch', 'r4Family', 'r5Family', 'name', 'note'].join('\t'),
  ...rows
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .map((r) => [r.kind, r.batch, r.r4Family, r.r5Family, r.name, r.note ?? ''].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '21-r4-projection-deviations.tsv'), tsv + '\n', 'utf8');

console.log('byKind', JSON.stringify(byKind));
for (const [b, s] of Object.entries(batchSurvival)) console.log(`${b}: matched=${s.matchedInR4} stillRed=${s.stillRedInR5} greened=${s.greenedInR5}`);
console.log(`wrote 20/21 to ${args.outdir}`);
