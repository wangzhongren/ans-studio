#!/usr/bin/env node
// R5 测试债治理：R5 宇宙与 R4 / B0 / B7 集合对照、平台差异清单、B0/B7 缺口现状。
// 结构沿用 R4 `compare-r3.mjs`，差异：对比对象 R3→R4 改为 R4→R5；R5 平台键三平台完整。
//
// 用法：
//   node compare-r4.mjs \
//     --r4 角色卡/测试/docs/change/2026-11-16_remediation-plan_r4-evidence/06-merged-universe.json \
//     --r5 角色卡/测试/docs/change/2026-11-16_remediation-plan_r5-evidence/06-merged-universe.json \
//     --r4-families 角色卡/测试/docs/change/2026-11-16_remediation-plan_r4-evidence/11-families.json \
//     --r5-families 角色卡/测试/docs/change/2026-11-16_remediation-plan_r5-evidence/11-families.json \
//     --b0 <b0-frozen-failnames-191.txt> --b7 <failnames.txt> \
//     --outdir 角色卡/测试/docs/change/2026-11-16_remediation-plan_r5-evidence
//
// 输出：
//   15-r4-comparison.json     R4 188 vs R5 116：交集/新增/消失、逐族增减、逐名详情
//   16-platform-diff.tsv      平台差异（arm64/x64/win）、超时、R4→R5 平台分布变化
//   17-windows-coverage.tsv   R5 Windows 104 名全量对照
//   19-b0-b7-closure.tsv      B0 / B7 中不在 R5 宇宙的缺口逐名现状（含 R4 是否出现过）

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
for (const req of ['r4', 'r5', 'r4-families', 'r5-families', 'b0', 'b7', 'outdir']) {
  if (!args[req]) { console.error(`missing --${req}`); process.exit(2); }
}

const readLines = (p) => readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
const r4 = JSON.parse(readFileSync(args.r4, 'utf8'));
const r5 = JSON.parse(readFileSync(args.r5, 'utf8'));
const r4fam = JSON.parse(readFileSync(args['r4-families'], 'utf8'));
const r5fam = JSON.parse(readFileSync(args['r5-families'], 'utf8'));
const b0 = new Set(readLines(args.b0));
const b7 = new Set(readLines(args.b7));

const r4Map = new Map(r4.map((u) => [u.name, u]));
const r5Map = new Map(r5.map((u) => [u.name, u]));
const r4Family = new Map();
for (const f of r4fam.families) for (const n of f.names) r4Family.set(n.name, f.family);
const r5Family = new Map();
for (const f of r5fam.families) for (const n of f.names) r5Family.set(n.name, f.family);

const r4Names = new Set(r4Map.keys());
const r5Names = new Set(r5Map.keys());
const sortNames = (arr) => arr.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
const common = sortNames([...r5Names].filter((n) => r4Names.has(n)));
const r5Only = sortNames([...r5Names].filter((n) => !r4Names.has(n)));
const r4Only = sortNames([...r4Names].filter((n) => !r5Names.has(n)));

const platKeys = ['macos_arm64', 'macos_x64', 'windows_x64'];
const platShort = { macos_arm64: 'arm64', macos_x64: 'x64', windows_x64: 'win' };
const platBrief = (u) => platKeys.filter((k) => u?.platforms?.[k]).map((k) => platShort[k]).join('+') || '-';
const setsBrief = (u) => u ? [u.sets?.b0 ? 'B0' : null, u.sets?.b7 ? 'B7' : null, u.sets?.kr62 ? 'KR' : null, u.sets?.triage ?? null].filter(Boolean).join('+') || '-' : '-';

const perPlatform = {};
for (const k of platKeys) {
  const s = platShort[k];
  perPlatform[s] = {
    r4: r4.filter((u) => u.platforms?.[k]).length,
    r5: r5.filter((u) => u.platforms?.[k]).length,
    common: common.filter((n) => r5Map.get(n).platforms?.[k] && r4Map.get(n).platforms?.[k]).length,
    onlyR4: r4Only.filter((n) => r4Map.get(n).platforms?.[k]).length,
    onlyR5: r5Only.filter((n) => r5Map.get(n).platforms?.[k]).length,
  };
}

// 逐族增减
const famNames = new Map();
for (const f of r4fam.families) famNames.set(f.family, new Set(f.names.map((n) => n.name)));
const r5FamNames = new Map();
for (const f of r5fam.families) r5FamNames.set(f.family, new Set(f.names.map((n) => n.name)));
const familyDelta = {};
for (const fam of new Set([...famNames.keys(), ...r5FamNames.keys()])) {
  const a = famNames.get(fam) ?? new Set();
  const b = r5FamNames.get(fam) ?? new Set();
  familyDelta[fam] = {
    r4: a.size,
    r5: b.size,
    r5NewNames: [...b].filter((n) => !a.has(n)),
    disappearedFromFamily: [...a].filter((n) => !b.has(n)),
    stillInFamily: [...a].filter((n) => b.has(n)),
  };
}

// 集合对照（B0/B7/KR 命中与缺口）
const intersectionSets = {
  r5_in_b0: r5.filter((u) => u.sets.b0).length,
  r5_in_b7: r5.filter((u) => u.sets.b7).length,
  r5_in_kr62: r5.filter((u) => u.sets.kr62).length,
  r5_in_triage_any: r5.filter((u) => u.sets.triage !== null).length,
  b0_not_r5: [...b0].filter((n) => !r5Names.has(n)).length,
  b7_not_r5: [...b7].filter((n) => !r5Names.has(n)).length,
  b0_not_r4: [...b0].filter((n) => !r4Names.has(n)).length,
  b7_not_r4: [...b7].filter((n) => !r4Names.has(n)).length,
};

const comparison = {
  generatedAt: new Date().toISOString(),
  r4Universe: r4.length,
  r5Universe: r5.length,
  intersection: common.length,
  r5Only: r5Only.length,
  r4Only: r4Only.length,
  perPlatform,
  familyDelta,
  intersectionSets,
  r5OnlyNames: r5Only.map((n) => {
    const u = r5Map.get(n);
    return { name: n, platforms: u.platforms, logFiles: u.logFiles, repoFiles: u.repoFiles, sets: u.sets, r5Family: r5Family.get(n) ?? null, errorFirst: u.errorFirst };
  }),
  r4OnlyNames: r4Only.map((n) => {
    const u = r4Map.get(n);
    return {
      name: n,
      r4Platforms: u.platforms,
      sets: u.sets,
      r4Family: r4Family.get(n) ?? null,
      note: 'R4 消失 = R5 三平台均未复现（R5 三平台均完整跑完）',
    };
  }),
};
writeFileSync(join(args.outdir, '15-r4-comparison.json'), JSON.stringify(comparison, null, 2) + '\n', 'utf8');

// 平台差异清单：任一平台独有、超时、或 R4→R5 平台分布变化
const diffRows = [];
for (const u of r5) {
  const onArm = !!u.platforms?.macos_arm64;
  const onX64 = !!u.platforms?.macos_x64;
  const onWin = !!u.platforms?.windows_x64;
  const macDiff = onArm !== onX64;
  const winOnly = onWin && !onArm && !onX64;
  const macOnly = !onWin && (onArm || onX64);
  const timeoutAny = Object.values(u.platforms ?? {}).some((p) => (p.maxDurationMs ?? 0) >= 100000);
  const prev = r4Map.get(u.name);
  const prevPlats = prev ? platBrief(prev) : '(R4 无)';
  const changed = prev ? prevPlats !== platBrief(u) : true;
  if (!(macDiff || winOnly || macOnly || timeoutAny || changed)) continue;
  const notes = [];
  if (!onArm && onX64) notes.push('R5 x64-only');
  if (!onX64 && onArm) notes.push('R5 arm64-only');
  if (winOnly) notes.push('R5 Windows-only');
  if (macOnly) notes.push('R5 mac-only');
  if (timeoutAny) {
    const where = Object.entries(u.platforms).filter(([, p]) => (p.maxDurationMs ?? 0) >= 100000).map(([k]) => platShort[k]);
    notes.push(`超时>=100s(${where.join('+')})`);
  }
  if (prev) {
    notes.push(`R4 平台=${prevPlats}`);
    if (!changed) notes.push('与 R4 平台分布相同');
    else notes.push('与 R4 平台分布不同');
  } else {
    notes.push('R4 宇宙外新增');
  }
  diffRows.push({
    name: u.name,
    platforms: platBrief(u),
    arm64Ms: onArm ? (u.platforms.macos_arm64.maxDurationMs ?? '') : '',
    x64Ms: onX64 ? (u.platforms.macos_x64.maxDurationMs ?? '') : '',
    win: onWin ? '1' : '',
    r4Platforms: prevPlats,
    r4Family: r4Family.get(u.name) ?? '',
    r5Family: r5Family.get(u.name) ?? '',
    sets: setsBrief(u),
    notes: notes.join('; '),
    file: u.repoFiles[0] ?? u.logFiles[0] ?? '',
  });
}
const tsv = [
  ['name', 'platforms', 'arm64Ms', 'x64Ms', 'win', 'r4Platforms', 'r4Family', 'r5Family', 'sets', 'notes', 'file'].join('\t'),
  ...diffRows.map((r) =>
    [r.name, r.platforms, r.arm64Ms, r.x64Ms, r.win, r.r4Platforms, r.r4Family, r.r5Family, r.sets, r.notes, r.file].join('\t')
  ),
].join('\n');
writeFileSync(join(args.outdir, '16-platform-diff.tsv'), tsv + '\n', 'utf8');

// Windows 全量名单：R5 Windows 104 名逐名对照
const r4WinNames = new Set(r4.filter((u) => u.platforms?.windows_x64).map((u) => u.name));
const winRows = r5
  .filter((u) => u.platforms?.windows_x64)
  .map((u) => ({
    name: u.name,
    inMac: !!(u.platforms.macos_arm64 || u.platforms.macos_x64),
    arm64: !!u.platforms.macos_arm64,
    x64: !!u.platforms.macos_x64,
    inR4Windows: r4WinNames.has(u.name),
    r5Family: r5Family.get(u.name) ?? '',
    r4Family: r4Family.get(u.name) ?? '(R4 无)',
    sets: setsBrief(u),
    errorFirst: (u.errorFirst ?? '').replaceAll('\t', ' '),
  }));
const winTsv = [
  ['name', 'inMac', 'arm64', 'x64', 'inR4Windows', 'r5Family', 'r4Family', 'sets', 'errorFirst'].join('\t'),
  ...winRows.map((r) =>
    [r.name, r.inMac, r.arm64, r.x64, r.inR4Windows, r.r5Family, r.r4Family, r.sets, r.errorFirst].join('\t')
  ),
].join('\n');
writeFileSync(join(args.outdir, '17-windows-coverage.tsv'), winTsv + '\n', 'utf8');

// B0 / B7 缺口：B0（或 B7）有、R5 宇宙无的名字逐名现状（含 R4 是否出现过）。
const closureRows = [];
const b0Missing = sortNames([...b0].filter((n) => !r5Names.has(n)));
const b7Missing = sortNames([...b7].filter((n) => !r5Names.has(n)));
for (const [setLabel, missing] of [['B0', b0Missing], ['B7', b7Missing]]) {
  for (const n of missing) {
    const inR4 = r4Map.get(n);
    const tr = inR4?.sets?.triage ?? null;
    const status = inR4
      ? 'R4 出现、R5 三平台未复现（可判本轮 CI 非红，不作永久转绿）'
      : 'R3/R4/R5 均未出现（本轮 CI 未红，永久转绿由 B7 重冻结裁定）';
    closureRows.push({
      set: setLabel,
      name: n,
      inR4Universe: !!inR4,
      r4Platforms: inR4 ? platBrief(inR4) : '-',
      inR5AnyPlatform: false,
      triage: tr ?? '',
      status,
    });
  }
}
const closureTsv = [
  ['set', 'name', 'inR4Universe', 'r4Platforms', 'inR5AnyPlatform', 'triage', 'status'].join('\t'),
  ...closureRows.map((r) =>
    [r.set, r.name, r.inR4Universe, r.r4Platforms, r.inR5AnyPlatform, r.triage, r.status].join('\t')
  ),
].join('\n');
writeFileSync(join(args.outdir, '19-b0-b7-closure.tsv'), closureTsv + '\n', 'utf8');

console.log(`R4=${r4.length} R5=${r5.length} common=${common.length} r5Only=${r5Only.length} r4Only=${r4Only.length}`);
console.log('perPlatform', JSON.stringify(perPlatform));
console.log('intersectionSets', JSON.stringify(intersectionSets));
console.log('platformDiffRows', diffRows.length, 'windowsRows', winRows.length, 'b0Missing', b0Missing.length, 'b7Missing', b7Missing.length);
console.log(`wrote 15/16/17/19 to ${args.outdir}`);
