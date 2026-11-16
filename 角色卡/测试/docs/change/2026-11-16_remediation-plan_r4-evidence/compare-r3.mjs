#!/usr/bin/env node
// R4 测试债治理：R4 宇宙与 R3 / B0 / B7 集合对照、平台差异清单、Windows 首覆盖与 B0/B7 缺口闭合。
//
// 用法：
//   node compare-r3.mjs \
//     --r3 角色卡/测试/docs/change/2026-11-16_remediation-plan_r3-evidence/06-merged-universe.json \
//     --r4 角色卡/测试/docs/change/2026-11-16_remediation-plan_r4-evidence/06-merged-universe.json \
//     --r3-families 角色卡/测试/docs/change/2026-11-16_remediation-plan_r3-evidence/11-families.json \
//     --r4-families 角色卡/测试/docs/change/2026-11-16_remediation-plan_r4-evidence/11-families.json \
//     --b0 <b0-frozen-failnames-191.txt> --b7 <failnames.txt> \
//     --outdir 角色卡/测试/docs/change/2026-11-16_remediation-plan_r4-evidence
//
// 输出：
//   15-r3-comparison.json     R3 194 vs R4 188：交集/新增/消失、逐族增减、逐名详情
//   16-platform-diff.tsv      arm64/x64 差异（预期 0）、Windows-only、超时、R3→R4 平台分布变化
//   17-windows-full-coverage.tsv Windows 179 名全量对照（含是否 macOS 重叠、R3 Windows 是否出现过）
//   19-b0-b7-closure.tsv      B0 61 / B7 60 名缺口逐名现状（Windows 首覆盖后的转绿/未复现判定）

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
for (const req of ['r3', 'r4', 'r3-families', 'r4-families', 'b0', 'b7', 'outdir']) {
  if (!args[req]) { console.error(`missing --${req}`); process.exit(2); }
}

const readLines = (p) => readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
const r3 = JSON.parse(readFileSync(args.r3, 'utf8'));
const r4 = JSON.parse(readFileSync(args.r4, 'utf8'));
const r3fam = JSON.parse(readFileSync(args['r3-families'], 'utf8'));
const r4fam = JSON.parse(readFileSync(args['r4-families'], 'utf8'));
const b0 = new Set(readLines(args.b0));
const b7 = new Set(readLines(args.b7));

const r3Map = new Map(r3.map((u) => [u.name, u]));
const r4Map = new Map(r4.map((u) => [u.name, u]));
const r3Family = new Map();
for (const f of r3fam.families) for (const n of f.names) r3Family.set(n.name, f.family);
const r4Family = new Map();
for (const f of r4fam.families) for (const n of f.names) r4Family.set(n.name, f.family);

const r3Names = new Set(r3Map.keys());
const r4Names = new Set(r4Map.keys());
const sortNames = (arr) => arr.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
const common = sortNames([...r4Names].filter((n) => r3Names.has(n)));
const r4Only = sortNames([...r4Names].filter((n) => !r3Names.has(n)));
const r3Only = sortNames([...r3Names].filter((n) => !r4Names.has(n)));

const platKeys = ['macos_arm64', 'macos_x64', 'windows_x64'];
const platShort = { macos_arm64: 'arm64', macos_x64: 'x64', windows_x64: 'win' };
const platBrief = (u) => platKeys.filter((k) => u?.platforms?.[k]).map((k) => platShort[k]).join('+') || '-';
const setsBrief = (u) => u ? [u.sets?.b0 ? 'B0' : null, u.sets?.b7 ? 'B7' : null, u.sets?.kr62 ? 'KR' : null, u.sets?.triage ?? null].filter(Boolean).join('+') || '-' : '-';

const perPlatform = {};
for (const k of platKeys) {
  const s = platShort[k];
  const r3Key = k === 'windows_x64' ? 'windows_x64_cancelled' : k;
  perPlatform[s] = {
    r3: r3.filter((u) => u.platforms?.[r3Key]).length,
    r4: r4.filter((u) => u.platforms?.[k]).length,
    common: common.filter((n) => r4Map.get(n).platforms?.[k] && r3Map.get(n).platforms?.[r3Key]).length,
    onlyR3: r3Only.filter((n) => r3Map.get(n).platforms?.[r3Key]).length,
    onlyR4: r4Only.filter((n) => r4Map.get(n).platforms?.[k]).length,
  };
}

// 逐族增减
const famNames = new Map();
for (const f of r3fam.families) famNames.set(f.family, new Set(f.names.map((n) => n.name)));
const r4FamNames = new Map();
for (const f of r4fam.families) r4FamNames.set(f.family, new Set(f.names.map((n) => n.name)));
const familyDelta = {};
for (const fam of new Set([...famNames.keys(), ...r4FamNames.keys()])) {
  const a = famNames.get(fam) ?? new Set();
  const b = r4FamNames.get(fam) ?? new Set();
  familyDelta[fam] = {
    r3: a.size,
    r4: b.size,
    r4NewNames: [...b].filter((n) => !a.has(n)).length,
    disappearedFromFamily: [...a].filter((n) => !b.has(n)).length,
    stillInFamily: [...a].filter((n) => b.has(n)).length,
  };
}

// 集合对照（B0/B7/KR 命中与缺口）
const intersectionSets = {
  r4_in_b0: r4.filter((u) => u.sets.b0).length,
  r4_in_b7: r4.filter((u) => u.sets.b7).length,
  r4_in_kr62: r4.filter((u) => u.sets.kr62).length,
  r4_in_triage_any: r4.filter((u) => u.sets.triage !== null).length,
  b0_not_r4: [...b0].filter((n) => !r4Names.has(n)).length,
  b7_not_r4: [...b7].filter((n) => !r4Names.has(n)).length,
  b0_not_r3: [...b0].filter((n) => !r3Names.has(n)).length,
  b7_not_r3: [...b7].filter((n) => !r3Names.has(n)).length,
};

const comparison = {
  generatedAt: new Date().toISOString(),
  r3Universe: r3.length,
  r4Universe: r4.length,
  intersection: common.length,
  r4Only: r4Only.length,
  r3Only: r3Only.length,
  perPlatform,
  familyDelta,
  intersectionSets,
  r4OnlyNames: r4Only.map((n) => {
    const u = r4Map.get(n);
    return { name: n, platforms: u.platforms, logFiles: u.logFiles, repoFiles: u.repoFiles, sets: u.sets, r4Family: r4Family.get(n) ?? null, errorFirst: u.errorFirst };
  }),
  r3OnlyNames: r3Only.map((n) => {
    const u = r3Map.get(n);
    return {
      name: n,
      r3Platforms: u.platforms,
      sets: u.sets,
      r3Family: r3Family.get(n) ?? null,
      // R3 平台 → R4 判定提示：R3 Windows 只有 22 名（取消前），R4 Windows 完整。
      note: 'R3 消失 = R4 全平台未复现（R4 Windows 已完整覆盖，不再有「未跑到」解释）',
    };
  }),
};
writeFileSync(join(args.outdir, '15-r3-comparison.json'), JSON.stringify(comparison, null, 2) + '\n', 'utf8');

// 平台差异清单：arm64 vs x64 不同、Windows-only、超时、或 R3→R4 平台分布变化
const diffRows = [];
for (const u of r4) {
  const onArm = !!u.platforms?.macos_arm64;
  const onX64 = !!u.platforms?.macos_x64;
  const onWin = !!u.platforms?.windows_x64;
  const macDiff = onArm !== onX64;
  const winOnly = onWin && !onArm && !onX64;
  const timeoutAny = Object.values(u.platforms ?? {}).some((p) => (p.maxDurationMs ?? 0) >= 100000);
  const prev = r3Map.get(u.name);
  const prevPlats = prev ? platBrief(prev) : '(R3 无)';
  const changed = prev ? prevPlats !== platBrief(u) : true;
  if (!(macDiff || winOnly || timeoutAny || changed)) continue;
  const notes = [];
  if (!onArm && onX64) notes.push('R4 x64-only');
  if (!onX64 && onArm) notes.push('R4 arm64-only');
  if (winOnly) notes.push('R4 Windows-only');
  if (timeoutAny) {
    const where = Object.entries(u.platforms).filter(([, p]) => (p.maxDurationMs ?? 0) >= 100000).map(([k]) => platShort[k]);
    notes.push(`超时>=100s(${where.join('+')})`);
  }
  if (prev) {
    notes.push(`R3 平台=${prevPlats}`);
    if (!changed) notes.push('与 R3 平台分布相同');
    else notes.push('与 R3 平台分布不同');
  } else {
    notes.push('R3 宇宙外新增');
  }
  diffRows.push({
    name: u.name,
    platforms: platBrief(u),
    arm64: onArm ? (u.platforms.macos_arm64.maxDurationMs ?? '') : '',
    x64: onX64 ? (u.platforms.macos_x64.maxDurationMs ?? '') : '',
    win: onWin ? '1' : '',
    r3Platforms: prevPlats,
    r3Family: r3Family.get(u.name) ?? '',
    r4Family: r4Family.get(u.name) ?? '',
    sets: setsBrief(u),
    notes: notes.join('; '),
    file: u.repoFiles[0] ?? u.logFiles[0] ?? '',
  });
}
const tsv = [
  ['name', 'platforms', 'arm64Ms', 'x64Ms', 'win', 'r3Platforms', 'r3Family', 'r4Family', 'sets', 'notes', 'file'].join('\t'),
  ...diffRows.map((r) =>
    [r.name, r.platforms, r.arm64, r.x64, r.win, r.r3Platforms, r.r3Family, r.r4Family, r.sets, r.notes, r.file].join('\t')
  ),
].join('\n');
writeFileSync(join(args.outdir, '16-platform-diff.tsv'), tsv + '\n', 'utf8');

// Windows 首覆盖全量名单：179 名逐名对照
const r3WinNames = new Set(r3.filter((u) => u.platforms?.windows_x64_cancelled).map((u) => u.name));
const winRows = r4
  .filter((u) => u.platforms?.windows_x64)
  .map((u) => ({
    name: u.name,
    inMac: !!(u.platforms.macos_arm64 || u.platforms.macos_x64),
    arm64: !!u.platforms.macos_arm64,
    x64: !!u.platforms.macos_x64,
    inR3Windows22: r3WinNames.has(u.name),
    r4Family: r4Family.get(u.name) ?? '',
    r3Family: r3Family.get(u.name) ?? '(R3 无)',
    sets: setsBrief(u),
    errorFirst: (u.errorFirst ?? '').replaceAll('\t', ' '),
  }));
const winTsv = [
  ['name', 'inMac', 'arm64', 'x64', 'inR3Windows22', 'r4Family', 'r3Family', 'sets', 'errorFirst'].join('\t'),
  ...winRows.map((r) =>
    [r.name, r.inMac, r.arm64, r.x64, r.inR3Windows22, r.r4Family, r.r3Family, r.sets, r.errorFirst].join('\t')
  ),
].join('\n');
writeFileSync(join(args.outdir, '17-windows-full-coverage.tsv'), winTsv + '\n', 'utf8');

// B0 61 / B7 60 缺口闭合：B0（或 B7）有、R4 宇宙无的名字逐名现状。
// Windows 本轮完整覆盖 ⇒ 若该名也不在 R3 Windows 22 名中，则「Windows CI 未复现」可判定（B0 为 Windows 本机基线）。
const closureRows = [];
const b0Missing = sortNames([...b0].filter((n) => !r4Names.has(n)));
const b7Missing = sortNames([...b7].filter((n) => !r4Names.has(n)));
for (const [setLabel, missing] of [['B0', b0Missing], ['B7', b7Missing]]) {
  for (const n of missing) {
    const inR3 = r3Map.get(n);
    const r3Win22 = r3WinNames.has(n);
    const tr = inR3?.sets?.triage ?? null;
    // 现状判定：R4 Windows 完整覆盖下未出现；若也不在 R3 的 22 名 inline 名单，则本轮 Windows CI 未复现。
    const status = r3Win22
      ? 'R3 Windows inline 出现、R4 未复现（完整性提升后转绿/漂移）'
      : inR3
        ? 'R3 出现（macOS）、R4 未复现'
        : 'R3/R4 均未出现；R4 Windows 完整覆盖下未复现 ⇒ 本轮 CI 未红（可判非当前 CI 红，不作永久转绿）';
    closureRows.push({
      set: setLabel,
      name: n,
      inR3Universe: !!inR3,
      r3Platforms: inR3 ? platBrief(inR3) : '-',
      inR3Windows22: r3Win22,
      inR4AnyPlatform: false,
      triage: tr ?? '',
      status,
    });
  }
}
const closureTsv = [
  ['set', 'name', 'inR3Universe', 'r3Platforms', 'inR3Windows22', 'inR4AnyPlatform', 'triage', 'status'].join('\t'),
  ...closureRows.map((r) =>
    [r.set, r.name, r.inR3Universe, r.r3Platforms, r.inR3Windows22, r.inR4AnyPlatform, r.triage, r.status].join('\t')
  ),
].join('\n');
writeFileSync(join(args.outdir, '19-b0-b7-closure.tsv'), closureTsv + '\n', 'utf8');

console.log(`R3=${r3.length} R4=${r4.length} common=${common.length} r4Only=${r4Only.length} r3Only=${r3Only.length}`);
console.log('perPlatform', JSON.stringify(perPlatform));
console.log('intersectionSets', JSON.stringify(intersectionSets));
console.log('platformDiffRows', diffRows.length, 'windowsRows', winRows.length, 'b0Missing', b0Missing.length, 'b7Missing', b7Missing.length);
console.log(`wrote 15/16/17/19 to ${args.outdir}`);
