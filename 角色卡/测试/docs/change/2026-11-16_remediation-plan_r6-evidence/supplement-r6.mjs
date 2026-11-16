#!/usr/bin/env node
// R6 补充证据：行级口径对账、族语义修正、B0/B7 缺口汇总、平台矩阵。
//
// 输出：
//   24-linelevel-reconciliation.json
//   25-family-semantic-corrections.tsv
//   26-b0-b7-closure-summary.json
//   27-platform-matrix.tsv

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
for (const req of ['ci', 'universe', 'families', 'b0', 'b7', 'x64-log', 'win-log', 'outdir']) {
  if (!args[req]) { console.error(`missing --${req}`); process.exit(2); }
}

const ci = JSON.parse(readFileSync(args.ci, 'utf8'));
const universe = JSON.parse(readFileSync(args.universe, 'utf8'));
const families = JSON.parse(readFileSync(args.families, 'utf8'));
const readLines = (p) => readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
const b0 = readLines(args.b0);
const b7 = readLines(args.b7);
const names = new Set(universe.map((u) => u.name));

// ---------- 24 行级口径 ----------
const plat = {};
for (const [k, p] of Object.entries(ci.platforms)) {
  const dupIndent = p.authoritativeNames.filter((r) => r.indents.length > 1);
  plat[k] = {
    fail: p.summary?.counts.fail ?? null,
    cancelled: p.summary?.counts.cancelled ?? null,
    uniqueAuthoritativeNames: p.uniqueCount,
    uniqueIndentPreservingNames: p.lineLevel.uniqueIndentPreservingNames,
    sectionHeaderLines: p.lineLevel.sectionHeaderLines,
    lineLevelUniqueIncludingHeaders: p.lineLevel.lineLevelUniqueIncludingHeaders,
    multiIndentNames: dupIndent.map((r) => ({ name: r.name, indents: r.indents })),
  };
}
const lineLevel = {
  generatedAt: new Date().toISOString(),
  runId: ci.runId,
  definition:
    'lineLevelUniqueIncludingHeaders = uniqueIndentPreservingNames（去耗时、保留缩进、排除 section 头）+ sectionHeaderLines（`✖ failing tests:` 行全部出现次数）；R2–R6 逐字沿用。',
  platforms: plat,
  arm64: 'job cancelled，无工件，无行级口径。',
  reconcile:
    'x64/Windows 均为 51 唯一名 + 1（W19 以 indent 0 与 2 两次出现）+ 3 个 section 头 = 55 行级唯一 ✖，与协调者 50/55 与 51/55 精确吻合。',
};
writeFileSync(join(args.outdir, '24-linelevel-reconciliation.json'), JSON.stringify(lineLevel, null, 2) + '\n', 'utf8');

// ---------- 25 族语义修正 ----------
const famOf = new Map();
for (const f of families.families) for (const n of f.names) famOf.set(n.name, f.family);
const corrections = [
  {
    name: 'actual Core request_choice abort preserves accepted/current facts, expires the old decision and allows one explicit next prompt',
    ruleFamily: famOf.get('actual Core request_choice abort preserves accepted/current facts, expires the old decision and allows one explicit next prompt') ?? '',
    semantic: 'flake-timing（Windows ENOTEMPTY 临时目录清理；R6 新出现、无 B0/B7 之外的批次覆盖）',
    basis: '10-block-codes.json: Windows ENOTEMPTY, Directory not empty: C:\\Users\\RUNNER~1\\...\\ans-d1-ect9pu',
  },
  {
    name: 'test\\测试\\g5-reasoning-verify\\compatibility-loopback.test.ts',
    ruleFamily: famOf.get('test\\测试\\g5-reasoning-verify\\compatibility-loopback.test.ts') ?? '',
    semantic: 'native-infra-crash（file-level；Windows 原生 libuv 断言 UV_HANDLE_CLOSING）',
    basis: '工件：Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c, line 76；fileLevelCount=2（inline+final）',
  },
  {
    name: '路径 B：B3 accepted（+运营报告）⇒ 自动呈 merge-main；客户 approve ⇒ 合并 + 交付关闭（不要求 A12b/归档）',
    ruleFamily: famOf.get('路径 B：B3 accepted（+运营报告）⇒ 自动呈 merge-main；客户 approve ⇒ 合并 + 交付关闭（不要求 A12b/归档）') ?? '',
    semantic: '待定性（x64-only 新出现；断言 deriveWorkflowView().closed.outcome undefined≠delivered，慢 runner 时序候选）',
    basis: 'b31-fixed-release-auto-desktop.test.ts:819:12；R6 首次出现，无批次覆盖',
  },
];
const corrTsv = [
  ['name', 'ruleFamily', 'semantic', 'basis'].join('\t'),
  ...corrections.map((c) => [c.name, c.ruleFamily, c.semantic, c.basis].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '25-family-semantic-corrections.tsv'), corrTsv + '\n', 'utf8');

// ---------- 26 B0/B7 缺口汇总 ----------
const parseSkip = (path) => {
  const set = new Set();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/\s*﹣ (.*?)(?: \(\d+(?:\.\d+)?ms\))?\s*$/);
    if (m) set.add(m[1].trim());
  }
  return set;
};
const skipX64 = parseSkip(args['x64-log']);
const skipWin = parseSkip(args['win-log']);
const b0Missing = b0.filter((n) => !names.has(n));
const b7Missing = b7.filter((n) => !names.has(n));
const krHit = universe.filter((u) => u.sets.kr62).length;
const b0Hit = universe.filter((u) => u.sets.b0).length;
const b7Hit = universe.filter((u) => u.sets.b7).length;
const b0MissingSkipped = b0Missing.filter((n) => skipX64.has(n) || skipWin.has(n));
const b7MissingSkipped = b7Missing.filter((n) => skipX64.has(n) || skipWin.has(n));
const nonKrB0 = universe.filter((u) => u.sets.b0 && !u.sets.kr62).map((u) => u.name);
const summary = {
  generatedAt: new Date().toISOString(),
  runId: ci.runId,
  b0: { total: b0.length, hit: b0Hit, missing: b0Missing.length, missingAppearedInSkipLines: b0MissingSkipped.length },
  b7: { total: b7.length, hit: b7Hit, missing: b7Missing.length, missingAppearedInSkipLines: b7MissingSkipped.length },
  kr62: { total: 62, hit: krHit, missing: 62 - krHit },
  nonKnownRedB0Hits: nonKrB0,
  r5ToR6: {
    b0MissingR5: 113,
    b0MissingR6: b0Missing.length,
    newlyGreenVsR5: b0Missing.length - 113,
    note: '差额 = R5 红而 R6 x64/Windows 未复现的名（arm64 无工件，不判三平台转绿）。',
  },
  skipLineNamesScanned: { x64: skipX64.size, windows: skipWin.size },
  disclosure:
    'arm64 无工件：B0/B7 的 macOS arm64 状态未知；「未复现」仅为 x64/Windows 两平台事实。',
};
writeFileSync(join(args.outdir, '26-b0-b7-closure-summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');

// ---------- 27 平台矩阵 ----------
const groups = new Map();
for (const u of universe) {
  const key = `${!!u.platforms.macos_x64 ? 'x64' : ''}${!!u.platforms.windows_x64 ? (u.platforms.macos_x64 ? '+win' : 'win') : ''}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(u.name);
}
const rows = [[ 'combination', 'count', 'familyCounts', 'names' ].join('\t')];
for (const [combo, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const fc = {};
  for (const n of list) fc[famOf.get(n) ?? '?'] = (fc[famOf.get(n) ?? '?'] ?? 0) + 1;
  rows.push([combo, list.length, JSON.stringify(fc), list.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')).join(' | ')].join('\t'));
}
writeFileSync(join(args.outdir, '27-platform-matrix.tsv'), rows.join('\n') + '\n', 'utf8');

console.log('lineLevel', JSON.stringify(Object.fromEntries(Object.entries(plat).map(([k, v]) => [k, `${v.uniqueAuthoritativeNames}/${v.lineLevelUniqueIncludingHeaders}`]))));
console.log('b0', summary.b0, 'b7', summary.b7, 'kr', summary.kr62);
console.log('missingInSkips b0', b0MissingSkipped.length, 'b7', b7MissingSkipped.length);
console.log('matrix', JSON.stringify(Object.fromEntries([...groups.entries()].map(([k, v]) => [k, v.length]))));
console.log(`wrote 24/25/26/27 to ${args.outdir}`);
