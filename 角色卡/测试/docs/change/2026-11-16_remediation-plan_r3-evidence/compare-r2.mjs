#!/usr/bin/env node
// R3 测试债治理：新宇宙与 R2 宇宙对照 + arm64/x64 平台差异清单。
//
// 用法：
//   node compare-r2.mjs \
//     --r2 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/06-merged-universe.json \
//     --r3 角色卡/测试/docs/change/2026-11-16_remediation-plan_r3-evidence/06-merged-universe.json \
//     --r2-families 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence/11-families.json \
//     --r3-families 角色卡/测试/docs/change/2026-11-16_remediation-plan_r3-evidence/11-families.json \
//     --outdir 角色卡/测试/docs/change/2026-11-16_remediation-plan_r3-evidence
//
// 输出：
//   15-r2-comparison.json  289（R2）vs 194（R3）集合对照、逐族增减、R3 新进/消失名单
//   16-platform-diff.tsv   arm64/x64/win 平台差异逐名清单（含 R2 平台分布、族、flake 标注线索）

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
for (const req of ['r2', 'r3', 'r2-families', 'r3-families', 'outdir']) {
  if (!args[req]) { console.error(`missing --${req}`); process.exit(2); }
}

const r2 = JSON.parse(readFileSync(args.r2, 'utf8'));
const r3 = JSON.parse(readFileSync(args.r3, 'utf8'));
const r2fam = JSON.parse(readFileSync(args['r2-families'], 'utf8'));
const r3fam = JSON.parse(readFileSync(args['r3-families'], 'utf8'));

const r2Map = new Map(r2.map((u) => [u.name, u]));
const r3Map = new Map(r3.map((u) => [u.name, u]));
const r2Family = new Map();
for (const f of r2fam.families) for (const n of f.names) r2Family.set(n.name, f.family);
const r3Family = new Map();
for (const f of r3fam.families) for (const n of f.names) r3Family.set(n.name, f.family);

const r2Names = new Set(r2Map.keys());
const r3Names = new Set(r3Map.keys());
const common = [...r3Names].filter((n) => r2Names.has(n)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
const r3Only = [...r3Names].filter((n) => !r2Names.has(n)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
const r2Only = [...r2Names].filter((n) => !r3Names.has(n)).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

const platKeys = ['macos_arm64', 'macos_x64', 'windows_x64_cancelled'];
const platShort = { macos_arm64: 'arm64', macos_x64: 'x64', windows_x64_cancelled: 'win' };
const platBrief = (u) => platKeys.filter((k) => u?.platforms?.[k]).map((k) => platShort[k]).join('+') || '-';
const setsBrief = (u) => u ? [u.sets?.b0 ? 'B0' : null, u.sets?.b7 ? 'B7' : null, u.sets?.kr62 ? 'KR' : null, u.sets?.triage ?? null].filter(Boolean).join('+') || '-' : '-';

const perPlatform = {};
for (const k of platKeys) {
  const s = platShort[k];
  perPlatform[s] = {
    r2: r2.filter((u) => u.platforms?.[k]).length,
    r3: r3.filter((u) => u.platforms?.[k]).length,
    common: common.filter((n) => r3Map.get(n).platforms?.[k] && r2Map.get(n).platforms?.[k]).length,
    onlyR2: r2Only.filter((n) => r2Map.get(n).platforms?.[k]).length,
    onlyR3: r3Only.filter((n) => r3Map.get(n).platforms?.[k]).length,
  };
}

// 逐族增减
const famNames = new Map();
for (const f of r2fam.families) famNames.set(f.family, new Set(f.names.map((n) => n.name)));
const r3FamNames = new Map();
for (const f of r3fam.families) r3FamNames.set(f.family, new Set(f.names.map((n) => n.name)));
const familyDelta = {};
for (const fam of new Set([...famNames.keys(), ...r3FamNames.keys()])) {
  const a = famNames.get(fam) ?? new Set();
  const b = r3FamNames.get(fam) ?? new Set();
  familyDelta[fam] = {
    r2: a.size,
    r3: b.size,
    appeared: [...b].filter((n) => !a.has(n)).length,
    disappeared: [...a].filter((n) => !b.has(n)).length,
    still: [...a].filter((n) => b.has(n)).length,
    r3OnlyFromR2Absent: [...b].filter((n) => !a.has(n) && !r2Names.has(n)).length,
  };
}

const comparison = {
  generatedAt: new Date().toISOString(),
  r2Universe: r2.length,
  r3Universe: r3.length,
  intersection: common.length,
  r3Only: r3Only.length,
  r2Only: r2Only.length,
  perPlatform,
  familyDelta,
  r3OnlyNames: r3Only.map((n) => {
    const u = r3Map.get(n);
    return {
      name: n,
      platforms: u.platforms,
      logFiles: u.logFiles,
      repoFiles: u.repoFiles,
      sets: u.sets,
      r3Family: r3Family.get(n) ?? null,
      errorFirst: u.errorFirst,
    };
  }),
  r2OnlyNames: r2Only.map((n) => {
    const u = r2Map.get(n);
    return {
      name: n,
      r2Platforms: u.platforms,
      sets: u.sets,
      r2Family: r2Family.get(n) ?? null,
    };
  }),
};
writeFileSync(join(args.outdir, '15-r2-comparison.json'), JSON.stringify(comparison, null, 2) + '\n', 'utf8');

// 平台差异清单：只列 arm64 vs x64 不同、任平台超时、或 Windows-only 的名字；
// 172 名 mac-only（Windows 取消前未跑到）不是平台差异，不逐名展开（计入 08-set-summary）。
const diffRows = [];
for (const u of r3) {
  const onArm = !!u.platforms?.macos_arm64;
  const onX64 = !!u.platforms?.macos_x64;
  const onWin = !!u.platforms?.windows_x64_cancelled;
  const macDiff = onArm !== onX64;
  const winOnly = onWin && !onArm && !onX64;
  const timeoutAny = Object.values(u.platforms ?? {}).some((p) => (p.maxDurationMs ?? 0) >= 100000);
  if (!(macDiff || winOnly || timeoutAny)) continue;
  const prev = r2Map.get(u.name);
  const prevPlats = prev ? platBrief(prev) : '(R2 无)';
  const prevFam = r2Family.get(u.name) ?? '(R2 无族)';
  const notes = [];
  if (!onArm && onX64) notes.push('R3 x64-only');
  if (!onX64 && onArm) notes.push('R3 arm64-only');
  if (onWin && !onArm && !onX64) notes.push('R3 Windows-only');
  if (timeoutAny) {
    const where = Object.entries(u.platforms).filter(([, p]) => (p.maxDurationMs ?? 0) >= 100000).map(([k]) => platShort[k]);
    notes.push(`超时>=100s(${where.join('+')})`);
  }
  if (prev) {
    notes.push(`R2 平台=${prevPlats}`);
    if (prevPlats === platBrief(u)) notes.push('与 R2 平台分布相同');
    else notes.push('与 R2 平台分布不同');
    if ((prev.platforms?.macos_arm64 && !onArm) || (prev.platforms?.macos_x64 && !onX64)) notes.push('R2 mac 曾出现，本轮该平台转绿→漂移线索');
    if (u.sets?.b0 || u.sets?.b7) notes.push('B0/B7 本机曾出现');
    if (u.sets?.kr62) notes.push('冻结 known-red');
  } else {
    notes.push('R2 宇宙外新增');
  }
  diffRows.push({
    name: u.name,
    platforms: platBrief(u),
    arm64: onArm ? (u.platforms.macos_arm64.maxDurationMs ?? '') : '',
    x64: onX64 ? (u.platforms.macos_x64.maxDurationMs ?? '') : '',
    win: onWin ? '1' : '',
    r2Platforms: prevPlats,
    r2Family: prevFam,
    r3Family: r3Family.get(u.name) ?? '',
    sets: setsBrief(u),
    notes: notes.join('; '),
    file: u.repoFiles[0] ?? u.logFiles[0] ?? '',
  });
}
const tsv = [
  ['name', 'platforms', 'arm64Ms', 'x64Ms', 'win', 'r2Platforms', 'r2Family', 'r3Family', 'sets', 'notes', 'file'].join('\t'),
  ...diffRows.map((r) =>
    [r.name, r.platforms, r.arm64, r.x64, r.win, r.r2Platforms, r.r2Family, r.r3Family, r.sets, r.notes, r.file].join('\t')
  ),
].join('\n');
writeFileSync(join(args.outdir, '16-platform-diff.tsv'), tsv + '\n', 'utf8');

// Windows 取消前 22 名的全量对照（含是否同时在 macOS 集合中）
const winRows = r3
  .filter((u) => u.platforms?.windows_x64_cancelled)
  .map((u) => ({
    name: u.name,
    inMac: !!(u.platforms.macos_arm64 || u.platforms.macos_x64),
    arm64: !!u.platforms.macos_arm64,
    x64: !!u.platforms.macos_x64,
    r3Family: r3Family.get(u.name) ?? '',
    r2Family: r2Family.get(u.name) ?? '(R2 无)',
    sets: setsBrief(u),
    errorFirst: u.errorFirst,
  }));
const winTsv = [
  ['name', 'inMac', 'arm64', 'x64', 'r3Family', 'r2Family', 'sets', 'errorFirst'].join('\t'),
  ...winRows.map((r) => [r.name, r.inMac, r.arm64, r.x64, r.r3Family, r.r2Family, r.sets, r.errorFirst ?? ''].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '17-windows-names.tsv'), winTsv + '\n', 'utf8');

console.log(`R2=${r2.length} R3=${r3.length} common=${common.length} r3Only=${r3Only.length} r2Only=${r2Only.length}`);
console.log('perPlatform', JSON.stringify(perPlatform));
console.log('platformDiffRows', diffRows.length);
console.log(`wrote 15-r2-comparison.json / 16-platform-diff.tsv to ${args.outdir}`);
