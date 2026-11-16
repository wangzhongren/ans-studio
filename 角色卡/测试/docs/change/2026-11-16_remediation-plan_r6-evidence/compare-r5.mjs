#!/usr/bin/env node
// R6：R6 宇宙与 R5 / B0 / B7 集合对照、平台差异清单、B0/B7 缺口现状。
// 结构沿用 R5 `compare-r4.mjs`，对比对象 R4→R5 改为 R5→R6；R6 平台键为 x64/win（arm64 无工件）。
//
// 用法：
//   node compare-r5.mjs \
//     --r5 <R5 06-merged-universe.json> --r6 <R6 06-merged-universe.json> \
//     --r5-families <R5 11-families.json> --r6-families <R6 11-families.json> \
//     --b0 <b0-frozen-failnames-191.txt> --b7 <failnames.txt> \
//     --outdir <R6 evidence>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
for (const req of ['r5', 'r6', 'r5-families', 'r6-families', 'b0', 'b7', 'outdir']) {
  if (!args[req]) { console.error(`missing --${req}`); process.exit(2); }
}

const readLines = (p) => readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
const r5 = JSON.parse(readFileSync(args.r5, 'utf8'));
const r6 = JSON.parse(readFileSync(args.r6, 'utf8'));
const r5fam = JSON.parse(readFileSync(args['r5-families'], 'utf8'));
const r6fam = JSON.parse(readFileSync(args['r6-families'], 'utf8'));
const b0 = new Set(readLines(args.b0));
const b7 = new Set(readLines(args.b7));

const r5Map = new Map(r5.map((u) => [u.name, u]));
const r6Map = new Map(r6.map((u) => [u.name, u]));
const r5Family = new Map();
for (const f of r5fam.families) for (const n of f.names) r5Family.set(n.name, f.family);
const r6Family = new Map();
for (const f of r6fam.families) for (const n of f.names) r6Family.set(n.name, f.family);

const r5Names = new Set(r5Map.keys());
const r6Names = new Set(r6Map.keys());
const sortNames = (arr) => arr.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
const common = sortNames([...r6Names].filter((n) => r5Names.has(n)));
const r6Only = sortNames([...r6Names].filter((n) => !r5Names.has(n)));
const r5Only = sortNames([...r5Names].filter((n) => !r6Names.has(n)));

const platKeys = ['macos_arm64', 'macos_x64', 'windows_x64'];
const platShort = { macos_arm64: 'arm64', macos_x64: 'x64', windows_x64: 'win' };
const platBrief = (u) => platKeys.filter((k) => u?.platforms?.[k]).map((k) => platShort[k]).join('+') || '-';
const setsBrief = (u) => u ? [u.sets?.b0 ? 'B0' : null, u.sets?.b7 ? 'B7' : null, u.sets?.kr62 ? 'KR' : null, u.sets?.triage ?? null].filter(Boolean).join('+') || '-' : '-';

const perPlatform = {};
for (const k of platKeys) {
  const s = platShort[k];
  perPlatform[s] = {
    r5: r5.filter((u) => u.platforms?.[k]).length,
    r6: r6.filter((u) => u.platforms?.[k]).length,
    common: common.filter((n) => r6Map.get(n).platforms?.[k] && r5Map.get(n).platforms?.[k]).length,
    onlyR5: r5Only.filter((n) => r5Map.get(n).platforms?.[k]).length,
    onlyR6: r6Only.filter((n) => r6Map.get(n).platforms?.[k]).length,
  };
}

const famNames = new Map();
for (const f of r5fam.families) famNames.set(f.family, new Set(f.names.map((n) => n.name)));
const r6FamNames = new Map();
for (const f of r6fam.families) r6FamNames.set(f.family, new Set(f.names.map((n) => n.name)));
const familyDelta = {};
for (const fam of new Set([...famNames.keys(), ...r6FamNames.keys()])) {
  const a = famNames.get(fam) ?? new Set();
  const b = r6FamNames.get(fam) ?? new Set();
  familyDelta[fam] = {
    r5: a.size,
    r6: b.size,
    r6NewNames: [...b].filter((n) => !a.has(n)),
    disappearedFromFamily: [...a].filter((n) => !b.has(n)),
    stillInFamily: [...a].filter((n) => b.has(n)),
  };
}

const intersectionSets = {
  r6_in_b0: r6.filter((u) => u.sets.b0).length,
  r6_in_b7: r6.filter((u) => u.sets.b7).length,
  r6_in_kr62: r6.filter((u) => u.sets.kr62).length,
  r6_in_triage_any: r6.filter((u) => u.sets.triage !== null).length,
  b0_not_r6: [...b0].filter((n) => !r6Names.has(n)).length,
  b7_not_r6: [...b7].filter((n) => !r6Names.has(n)).length,
  b0_not_r5: [...b0].filter((n) => !r5Names.has(n)).length,
  b7_not_r5: [...b7].filter((n) => !r5Names.has(n)).length,
};

const comparison = {
  generatedAt: new Date().toISOString(),
  r5Universe: r5.length,
  r6Universe: r6.length,
  intersection: common.length,
  r6Only: r6Only.length,
  r5Only: r5Only.length,
  arm64Disclosure: 'R6 arm64 job cancelled（无工件）；R5→R6 “消失”仅在 x64/Windows 两平台未复现，非三平台证据。',
  perPlatform,
  familyDelta,
  intersectionSets,
  r6OnlyNames: r6Only.map((n) => {
    const u = r6Map.get(n);
    return { name: n, platforms: u.platforms, logFiles: u.logFiles, repoFiles: u.repoFiles, sets: u.sets, r6Family: r6Family.get(n) ?? null, errorFirst: u.errorFirst };
  }),
  r5OnlyNames: r5Only.map((n) => {
    const u = r5Map.get(n);
    return {
      name: n,
      r5Platforms: u.platforms,
      sets: u.sets,
      r5Family: r5Family.get(n) ?? null,
      note: 'R6 x64/Windows 未复现（arm64 无工件，不能判三平台转绿）',
    };
  }),
};
writeFileSync(join(args.outdir, '15-r5-comparison.json'), JSON.stringify(comparison, null, 2) + '\n', 'utf8');

const diffRows = [];
for (const u of r6) {
  const onX64 = !!u.platforms?.macos_x64;
  const onWin = !!u.platforms?.windows_x64;
  const winOnly = onWin && !onX64;
  const macOnly = !onWin && onX64;
  const timeoutAny = Object.values(u.platforms ?? {}).some((p) => (p.maxDurationMs ?? 0) >= 100000);
  const prev = r5Map.get(u.name);
  const prevPlats = prev ? platBrief(prev) : '(R5 无)';
  const changed = prev ? prevPlats !== platBrief(u) : true;
  if (!(winOnly || macOnly || timeoutAny || changed)) continue;
  const notes = [];
  if (winOnly) notes.push('R6 Windows-only（macOS 仅有 x64 工件）');
  if (macOnly) notes.push('R6 macOS-x64-only');
  if (timeoutAny) {
    const where = Object.entries(u.platforms).filter(([, p]) => (p.maxDurationMs ?? 0) >= 100000).map(([k]) => platShort[k]);
    notes.push(`超时>=100s(${where.join('+')})`);
  }
  if (prev) {
    notes.push(`R5 平台=${prevPlats}`);
    notes.push(changed ? '与 R5 平台分布不同' : '与 R5 平台分布相同');
  } else {
    notes.push('R5 宇宙外新增');
  }
  diffRows.push({
    name: u.name,
    platforms: platBrief(u),
    x64Ms: onX64 ? (u.platforms.macos_x64.maxDurationMs ?? '') : '',
    win: onWin ? '1' : '',
    r5Platforms: prevPlats,
    r5Family: r5Family.get(u.name) ?? '',
    r6Family: r6Family.get(u.name) ?? '',
    sets: setsBrief(u),
    notes: notes.join('; '),
    file: u.repoFiles[0] ?? u.logFiles[0] ?? '',
  });
}
const tsv = [
  ['name', 'platforms', 'x64Ms', 'win', 'r5Platforms', 'r5Family', 'r6Family', 'sets', 'notes', 'file'].join('\t'),
  ...diffRows.map((r) =>
    [r.name, r.platforms, r.x64Ms, r.win, r.r5Platforms, r.r5Family, r.r6Family, r.sets, r.notes, r.file].join('\t')
  ),
].join('\n');
writeFileSync(join(args.outdir, '16-platform-diff.tsv'), tsv + '\n', 'utf8');

const r5WinNames = new Set(r5.filter((u) => u.platforms?.windows_x64).map((u) => u.name));
const winRows = r6
  .filter((u) => u.platforms?.windows_x64)
  .map((u) => ({
    name: u.name,
    inMacX64: !!u.platforms.macos_x64,
    inR5Windows: r5WinNames.has(u.name),
    r6Family: r6Family.get(u.name) ?? '',
    r5Family: r5Family.get(u.name) ?? '(R5 无)',
    sets: setsBrief(u),
    errorFirst: (u.errorFirst ?? '').replaceAll('\t', ' '),
  }));
const winTsv = [
  ['name', 'inMacX64', 'inR5Windows', 'r6Family', 'r5Family', 'sets', 'errorFirst'].join('\t'),
  ...winRows.map((r) =>
    [r.name, r.inMacX64, r.inR5Windows, r.r6Family, r.r5Family, r.sets, r.errorFirst].join('\t')
  ),
].join('\n');
writeFileSync(join(args.outdir, '17-windows-coverage.tsv'), winTsv + '\n', 'utf8');

const closureRows = [];
const b0Missing = sortNames([...b0].filter((n) => !r6Names.has(n)));
const b7Missing = sortNames([...b7].filter((n) => !r6Names.has(n)));
for (const [setLabel, missing] of [['B0', b0Missing], ['B7', b7Missing]]) {
  for (const n of missing) {
    const inR5 = r5Map.get(n);
    const tr = inR5?.sets?.triage ?? null;
    const status = inR5
      ? 'R5 出现、R6 x64/Windows 未复现（可判本轮两平台 CI 非红，不作永久转绿；arm64 无工件）'
      : 'R3/R4/R5/R6 均未出现（本轮 CI 未红，永久转绿由 B7 重冻结裁定）';
    closureRows.push({
      set: setLabel,
      name: n,
      inR5Universe: !!inR5,
      r5Platforms: inR5 ? platBrief(inR5) : '-',
      inR6AnyPlatform: false,
      triage: tr ?? '',
      status,
    });
  }
}
const closureTsv = [
  ['set', 'name', 'inR5Universe', 'r5Platforms', 'inR6AnyPlatform', 'triage', 'status'].join('\t'),
  ...closureRows.map((r) =>
    [r.set, r.name, r.inR5Universe, r.r5Platforms, r.inR6AnyPlatform, r.triage, r.status].join('\t')
  ),
].join('\n');
writeFileSync(join(args.outdir, '19-b0-b7-closure.tsv'), closureTsv + '\n', 'utf8');

console.log(`R5=${r5.length} R6=${r6.length} common=${common.length} r6Only=${r6Only.length} r5Only=${r5Only.length}`);
console.log('perPlatform', JSON.stringify(perPlatform));
console.log('intersectionSets', JSON.stringify(intersectionSets));
console.log('platformDiffRows', diffRows.length, 'windowsRows', winRows.length, 'b0Missing', b0Missing.length, 'b7Missing', b7Missing.length);
console.log(`wrote 15/16/17/19 to ${args.outdir}`);
