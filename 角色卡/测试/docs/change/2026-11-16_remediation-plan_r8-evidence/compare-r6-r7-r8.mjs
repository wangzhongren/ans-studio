#!/usr/bin/env node
// R8：R8 宇宙（三平台）与 R6 第五轮宇宙（63，docs）及 R7 第六轮工件（名称级重新提取）对照。
// 结构沿用 R6 compare-r5.mjs；R8 差异：三平台、双基线（R6 文档宇宙 + R7 工件宇宙）。
//
// 用法：
//   node compare-r6-r7-r8.mjs \
//     --r8-universe <06-merged-universe.json> --r8-families <11-families.json> \
//     --r6-universe <R6 06-merged-universe.json> --r6-families <R6 11-families.json> \
//     --r7-ci <r7-artifacts/01-ci-failures.json> \
//     --b0 <b0-frozen-failnames-191.txt> --b7 <failnames.txt> --outdir <R8 evidence>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
for (const req of ['r8-universe', 'r8-families', 'r6-universe', 'r6-families', 'r7-ci', 'b0', 'b7', 'outdir']) {
  if (!args[req]) { console.error(`missing --${req}`); process.exit(2); }
}

const readLines = (p) => readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
const r8 = JSON.parse(readFileSync(args['r8-universe'], 'utf8'));
const r8fam = JSON.parse(readFileSync(args['r8-families'], 'utf8'));
const r6 = JSON.parse(readFileSync(args['r6-universe'], 'utf8'));
const r6fam = JSON.parse(readFileSync(args['r6-families'], 'utf8'));
const r7ci = JSON.parse(readFileSync(args['r7-ci'], 'utf8'));
const b0 = new Set(readLines(args.b0));
const b7 = new Set(readLines(args.b7));

const r6Map = new Map(r6.map((u) => [u.name, u]));
const r8Map = new Map(r8.map((u) => [u.name, u]));
const r6Family = new Map();
for (const f of r6fam.families) for (const n of f.names) r6Family.set(n.name, f.family);
const r8Family = new Map();
for (const f of r8fam.families) for (const n of f.names) r8Family.set(n.name, f.family);

// R7 universe from three-platform artifacts
const r7Platforms = {};
const r7Names = new Set();
for (const [key, p] of Object.entries(r7ci.platforms)) {
  r7Platforms[key] = new Map(p.authoritativeNames.map((r) => [r.name, r]));
  for (const n of r7Platforms[key].keys()) r7Names.add(n);
}
const r7Summary = Object.fromEntries(
  Object.entries(r7ci.platforms).map(([k, p]) => [k, { summary: p.summary?.counts ?? null, unique: p.uniqueCount, lineLevel: p.lineLevel.lineLevelUniqueIncludingHeaders }])
);

const sortNames = (arr) => arr.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
const namesOf = (map) => new Set(map.keys());
const compare = (baseMap, curMap) => {
  const a = namesOf(baseMap), b = namesOf(curMap);
  return {
    base: a.size,
    cur: b.size,
    common: sortNames([...b].filter((n) => a.has(n))),
    disappeared: sortNames([...a].filter((n) => !b.has(n))),
    added: sortNames([...b].filter((n) => !a.has(n))),
  };
};

const platKeys = ['macos_arm64', 'macos_x64', 'windows_x64'];
const platShort = { macos_arm64: 'arm64', macos_x64: 'x64', windows_x64: 'win' };
const platBrief = (u) => platKeys.filter((k) => u?.platforms?.[k]).map((k) => platShort[k]).join('+') || '-';
const setsBrief = (u) => u ? [u.sets?.b0 ? 'B0' : null, u.sets?.b7 ? 'B7' : null, u.sets?.kr62 ? 'KR' : null, u.sets?.triage ?? null].filter(Boolean).join('+') || '-' : '-';

// ---- R8 vs R6 ----
const c6 = compare(r6Map, r8Map);
const perPlatformR6vsR8 = {};
for (const k of platKeys) {
  const s = platShort[k];
  perPlatformR6vsR8[s] = {
    r6: r6.filter((u) => u.platforms?.[k]).length,
    r8: r8.filter((u) => u.platforms?.[k]).length,
    common: c6.common.filter((n) => r8Map.get(n).platforms?.[k] && r6Map.get(n).platforms?.[k]).length,
    onlyR6: c6.disappeared.filter((n) => r6Map.get(n).platforms?.[k]).length,
    onlyR8: c6.added.filter((n) => r8Map.get(n).platforms?.[k]).length,
  };
}
const famNamesR6 = new Map();
for (const f of r6fam.families) famNamesR6.set(f.family, new Set(f.names.map((n) => n.name)));
const r8FamNames = new Map();
for (const f of r8fam.families) r8FamNames.set(f.family, new Set(f.names.map((n) => n.name)));
const familyDelta = {};
for (const fam of new Set([...famNamesR6.keys(), ...r8FamNames.keys()])) {
  const a = famNamesR6.get(fam) ?? new Set();
  const b = r8FamNames.get(fam) ?? new Set();
  familyDelta[fam] = {
    r6: a.size,
    r8: b.size,
    r8NewNames: [...b].filter((n) => !a.has(n)),
    disappearedFromFamily: [...a].filter((n) => !b.has(n)),
    stillInFamily: [...a].filter((n) => b.has(n)),
  };
}
const intersectionSets = {
  r8_in_b0: r8.filter((u) => u.sets.b0).length,
  r8_in_b7: r8.filter((u) => u.sets.b7).length,
  r8_in_kr62: r8.filter((u) => u.sets.kr62).length,
  r8_in_triage_any: r8.filter((u) => u.sets.triage !== null).length,
  b0_not_r8: [...b0].filter((n) => !r8Map.has(n)).length,
  b7_not_r8: [...b7].filter((n) => !r8Map.has(n)).length,
  b0_not_r7: [...b0].filter((n) => !r7Names.has(n)).length,
  b7_not_r7: [...b7].filter((n) => !r7Names.has(n)).length,
};

const r6Comparison = {
  generatedAt: new Date().toISOString(),
  r6Universe: r6.length,
  r8Universe: r8.length,
  intersection: c6.common.length,
  r8Only: c6.added.length,
  r6Only: c6.disappeared.length,
  r6R8PerPlatform: perPlatformR6vsR8,
  familyDelta,
  intersectionSets,
  r8OnlyNames: c6.added.map((n) => {
    const u = r8Map.get(n);
    return { name: n, platforms: u.platforms, logFiles: u.logFiles, repoFiles: u.repoFiles, sets: u.sets, r8Family: r8Family.get(n) ?? null, errorFirst: u.errorFirst };
  }),
  r6OnlyNames: c6.disappeared.map((n) => {
    const u = r6Map.get(n);
    return {
      name: n,
      r6Platforms: u.platforms,
      sets: u.sets,
      r6Family: r6Family.get(n) ?? null,
      inR7Universe: r7Names.has(n),
      note: 'R8 三平台工件均未出现',
    };
  }),
};
writeFileSync(join(args.outdir, '15-r6-comparison.json'), JSON.stringify(r6Comparison, null, 2) + '\n', 'utf8');

// ---- R8 vs R7 ----
const c7 = compare(new Map([...r7Names].map((n) => [n, r7ci])), r8Map);
const perPlatformR7vsR8 = {};
for (const k of platKeys) {
  const s = platShort[k];
  perPlatformR7vsR8[s] = {
    r7: r7Platforms[k]?.size ?? 0,
    r8: r8.filter((u) => u.platforms?.[k]).length,
    common: c7.common.filter((n) => r8Map.get(n).platforms?.[k] && r7Platforms[k]?.has(n)).length,
    onlyR7: c7.disappeared.filter((n) => r7Platforms[k]?.has(n)).length,
    onlyR8: c7.added.filter((n) => r8Map.get(n).platforms?.[k]).length,
  };
}
const r7Comparison = {
  generatedAt: new Date().toISOString(),
  r7Source:
    'R7 第六轮 = GitHub Actions run 43859105048（main @ d1f256f，2026-11-16T11:35:36Z，三平台工件 /tmp/r10-art 重新提取；汇总 fail 46/47/46 与协调者口径一致）。R7 分析文档/证据目录未在本工作树，名称级数据仅由工件提取。',
  r7Summary,
  r7Universe: r7Names.size,
  r8Universe: r8.length,
  intersection: c7.common.length,
  r8Only: c7.added.length,
  r7Only: c7.disappeared.length,
  r7R8PerPlatform: perPlatformR7vsR8,
  r8OnlyNames: c7.added.map((n) => {
    const u = r8Map.get(n);
    return { name: n, platforms: u.platforms, sets: u.sets, r8Family: r8Family.get(n) ?? null, r6: r6Map.has(n), errorFirst: u.errorFirst };
  }),
  r7OnlyNames: c7.disappeared.map((n) => {
    const p = {};
    for (const k of platKeys) if (r7Platforms[k]?.has(n)) p[k] = r7Platforms[k].get(n).maxDurationMs;
    return {
      name: n,
      r7Platforms: p,
      r6: r6Map.has(n),
      sets: r6Map.get(n)?.sets ?? { b0: b0.has(n), b7: b7.has(n) },
      r8Family: r8Family.get(n) ?? null,
      r6Family: r6Family.get(n) ?? null,
      note: 'R8 三平台工件均未出现（转绿或退役）',
    };
  }),
};
writeFileSync(join(args.outdir, '15b-r7-comparison.json'), JSON.stringify(r7Comparison, null, 2) + '\n', 'utf8');

// ---- 16 platform diff ----
const diffRows = [];
for (const u of r8) {
  const onA = !!u.platforms?.macos_arm64, onX = !!u.platforms?.macos_x64, onW = !!u.platforms?.windows_x64;
  const combo = [onA ? 'arm64' : '', onX ? 'x64' : '', onW ? 'win' : ''].filter(Boolean).join('+');
  const timeoutAny = Object.values(u.platforms ?? {}).some((p) => (p.maxDurationMs ?? 0) >= 100000);
  const prev6 = r6Map.get(u.name);
  const r7p = platKeys.filter((k) => r7Platforms[k]?.has(u.name)).map((k) => platShort[k]).join('+') || '(R7 无)';
  const notes = [];
  if (!onA && (onX || onW)) notes.push('arm64 绿');
  if (!onW && (onA || onX)) notes.push('Windows 绿');
  if (timeoutAny) {
    const where = Object.entries(u.platforms).filter(([, p]) => (p.maxDurationMs ?? 0) >= 100000).map(([k, p]) => `${platShort[k]}:${Math.round(p.maxDurationMs)}ms`);
    notes.push(`超时>=100s(${where.join(',')})`);
  }
  notes.push(prev6 ? `R6 平台=${platBrief(prev6)}` : 'R6 宇宙外');
  notes.push(`R7 平台=${r7p}`);
  diffRows.push({
    name: u.name,
    platforms: combo,
    arm64Ms: onA ? (u.platforms.macos_arm64.maxDurationMs ?? '') : '',
    x64Ms: onX ? (u.platforms.macos_x64.maxDurationMs ?? '') : '',
    winMs: onW ? (u.platforms.windows_x64.maxDurationMs ?? '') : '',
    r6Platforms: prev6 ? platBrief(prev6) : '(R6 无)',
    r7Platforms: r7p,
    r6Family: r6Family.get(u.name) ?? '',
    r8Family: r8Family.get(u.name) ?? '',
    sets: setsBrief(u),
    notes: notes.join('; '),
    file: u.repoFiles[0] ?? u.logFiles[0] ?? '',
  });
}
const diffTsv = [
  ['name', 'platforms', 'arm64Ms', 'x64Ms', 'winMs', 'r6Platforms', 'r7Platforms', 'r6Family', 'r8Family', 'sets', 'notes', 'file'].join('\t'),
  ...diffRows.map((r) => [r.name, r.platforms, r.arm64Ms, r.x64Ms, r.winMs, r.r6Platforms, r.r7Platforms, r.r6Family, r.r8Family, r.sets, r.notes, r.file].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '16-platform-diff.tsv'), diffTsv + '\n', 'utf8');

// ---- 17 windows coverage ----
const r7Win = r7Platforms.windows_x64 ?? new Set();
const winRows = r8
  .filter((u) => u.platforms?.windows_x64)
  .map((u) => ({
    name: u.name,
    inMacArm64: !!u.platforms.macos_arm64,
    inMacX64: !!u.platforms.macos_x64,
    inR7Windows: r7Win.has(u.name),
    inR6: r6Map.has(u.name),
    r8Family: r8Family.get(u.name) ?? '',
    sets: setsBrief(u),
    errorFirst: (u.errorFirst ?? '').replaceAll('\t', ' '),
  }));
const winTsv = [
  ['name', 'inMacArm64', 'inMacX64', 'inR7Windows', 'inR6', 'r8Family', 'sets', 'errorFirst'].join('\t'),
  ...winRows.map((r) => [r.name, r.inMacArm64, r.inMacX64, r.inR7Windows, r.inR6, r.r8Family, r.sets, r.errorFirst].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '17-windows-coverage.tsv'), winTsv + '\n', 'utf8');

// ---- 18 artifact/count crosscheck (coordinator vs extracted) ----
const coord = { macos_arm64: { fail: 30, unique: 31 }, macos_x64: { fail: 38, unique: 41 }, windows_x64: { fail: 28, unique: 29 } };
const cross = { generatedAt: new Date().toISOString(), runId: '43867573699', platforms: {} };
// summaries/counts from the R8 extraction artifact (same evidence dir)
const r8ci = JSON.parse(readFileSync(join(args.outdir, '01-ci-failures.json'), 'utf8'));
for (const k of platKeys) {
  const p = r8ci.platforms[k];
  cross.platforms[k] = {
    summary: p.summary?.counts ?? null,
    uniqueAuthoritativeNames: p.uniqueCount,
    lineLevelUniqueIncludingHeaders: p.lineLevel.lineLevelUniqueIncludingHeaders,
    coordinator: coord[k],
    matchUnique: p.lineLevel.lineLevelUniqueIncludingHeaders === coord[k].unique,
    matchFail: (p.summary?.counts.fail ?? null) === coord[k].fail,
  };
}
writeFileSync(join(args.outdir, '18-artifact-crosscheck.json'), JSON.stringify(cross, null, 2) + '\n', 'utf8');

// ---- 19 B0/B7 closure ----
const closureRows = [];
const b0Missing = sortNames([...b0].filter((n) => !r8Map.has(n)));
const b7Missing = sortNames([...b7].filter((n) => !r8Map.has(n)));
for (const [setLabel, missing] of [['B0', b0Missing], ['B7', b7Missing]]) {
  for (const n of missing) {
    const in6 = r6Map.get(n);
    const in7 = r7Names.has(n);
    closureRows.push({
      set: setLabel,
      name: n,
      inR6Universe: !!in6,
      r6Platforms: in6 ? platBrief(in6) : '-',
      inR7Universe: in7,
      triage: in6?.sets?.triage ?? '',
      status: in7
        ? 'R7 出现、R8 三平台未复现（本轮 CI 非红；永久转绿由 B7 重冻结裁定）'
        : 'R8 未出现（R7 也未出现则候选 REMOVED/长期未复现）',
    });
  }
}
const closureTsv = [
  ['set', 'name', 'inR6Universe', 'r6Platforms', 'inR7Universe', 'triage', 'status'].join('\t'),
  ...closureRows.map((r) => [r.set, r.name, r.inR6Universe, r.r6Platforms, r.inR7Universe, r.triage, r.status].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '19-b0-b7-closure.tsv'), closureTsv + '\n', 'utf8');

console.log(`R6=${r6.length} R8=${r8.length} common=${c6.common.length} r8Only=${c6.added.length} r6Only=${c6.disappeared.length}`);
console.log(`R7=${r7Names.size} R8=${r8.length} common=${c7.common.length} r8Only=${c7.added.length} r7Only=${c7.disappeared.length}`);
console.log('platform R6vsR8', JSON.stringify(perPlatformR6vsR8));
console.log('platform R7vsR8', JSON.stringify(perPlatformR7vsR8));
console.log('intersectionSets', JSON.stringify(intersectionSets));
console.log('r8Only vs R6:', JSON.stringify(c6.added));
console.log('r7Only:', JSON.stringify(c7.disappeared));
console.log('b0Missing', b0Missing.length, 'b7Missing', b7Missing.length);
console.log(`wrote 15/15b/16/17/18/19 to ${args.outdir}`);
