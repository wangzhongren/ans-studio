#!/usr/bin/env node
// R2 测试债治理：把三平台 CI 失败名与既有基线/历史分类合并去重，并做仓库测试文件反查。
//
// 输入：
//   --ci      01-ci-failures.json（extract-ci-failures.mjs 产物）
//   --b0      B0 冻结全量基线 191 名（b0-frozen-failnames-191.txt）
//   --b7      B7 全量 190 名（failnames.txt）
//   --kr-dir  三套冻结 known-red（runtime-core-33.txt / gates-5.txt / orchestration-24.txt）
//   --triage  2026-11-12_release-blocker-triage.md（附录 A 的 [KR]/[MAC]/[NEW] 标签）
//   --tests-root test
//   --outdir  证据目录
//
// 输出：
//   06-merged-universe.json  逐名并集：平台出现、日志文件映射、仓库反查文件、基线/历史集合命中、首个错误行
//   07-by-file.tsv           按仓库/日志文件分组的名单（每行：file \t count \t names）
//   08-set-summary.json      集合交集与分族前置计数

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i];
  const v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) {
    console.error(`bad args near ${k}`);
    process.exit(2);
  }
  args[k.slice(2)] = v;
}
for (const req of ['ci', 'b0', 'b7', 'kr-dir', 'triage', 'tests-root', 'outdir']) {
  if (!args[req]) {
    console.error(`missing --${req}`);
    process.exit(2);
  }
}

const readLines = (p) => readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
const b0 = new Set(readLines(args.b0));
const b7 = new Set(readLines(args.b7));
const kr = new Set();
for (const f of ['runtime-core-33.txt', 'gates-5.txt', 'orchestration-24.txt']) {
  for (const n of readLines(join(args['kr-dir'], f))) kr.add(n);
}
const triage = new Map();
for (const line of readFileSync(args.triage, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*-\s*\[(KR|MAC|NEW)\]\s+(.+?)\s*$/);
  if (m) triage.set(m[2], m[1]);
}

const ci = JSON.parse(readFileSync(args.ci, 'utf8'));
const perPlatform = {};
for (const [key, p] of Object.entries(ci.platforms)) {
  perPlatform[key] = new Map(p.authoritativeNames.map((r) => [r.name, r]));
}

// 仓库测试文件反查（一次读入，逐名 includes）
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (extname(entry.name) === '.ts' && /\.test\.ts$/.test(entry.name)) out.push(p);
  }
  return out;
}
const testFiles = walk(args['tests-root']);
const fileTexts = testFiles.map((f) => [f.replaceAll('\\', '/'), readFileSync(f, 'utf8')]);

const allNames = new Set();
for (const map of Object.values(perPlatform)) for (const n of map.keys()) allNames.add(n);

const universe = [];
for (const name of [...allNames].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))) {
  const platforms = {};
  const logFiles = new Set();
  let errorFirst = null;
  for (const [key, map] of Object.entries(perPlatform)) {
    const rec = map.get(name);
    if (rec) {
      platforms[key] = { count: rec.count, maxDurationMs: rec.maxDurationMs, indents: rec.indents, files: rec.files };
      for (const f of rec.files) logFiles.add(f.replaceAll('\\', '/'));
      errorFirst ??= rec.errorFirst ?? null;
    }
  }
  const repoFiles = fileTexts.filter(([, text]) => text.includes(name)).map(([f]) => f);
  universe.push({
    name,
    platforms,
    logFiles: [...logFiles],
    repoFiles,
    sets: {
      b0: b0.has(name),
      b7: b7.has(name),
      kr62: kr.has(name),
      triage: triage.get(name) ?? null,
    },
    errorFirst,
  });
}

writeFileSync(join(args.outdir, '06-merged-universe.json'), JSON.stringify(universe, null, 2) + '\n', 'utf8');

// 按文件分组（优先仓库反查文件；多文件时各记一份；无仓库命中用日志文件；再不行记 unresolved）
const byFile = new Map();
for (const u of universe) {
  const files = u.repoFiles.length ? u.repoFiles : u.logFiles.length ? u.logFiles : ['(unresolved)'];
  for (const f of files) {
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(u.name);
  }
}
const tsv = [...byFile.entries()]
  .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))
  .map(([f, names]) => `${f}\t${names.length}\t${names.join(' | ')}`)
  .join('\n');
writeFileSync(join(args.outdir, '07-by-file.tsv'), tsv + '\n', 'utf8');

const count = (pred) => universe.filter(pred).length;
const summary = {
  generatedAt: new Date().toISOString(),
  totals: {
    unionCurrent: universe.length,
    macos_arm64: perPlatform.macos_arm64.size,
    macos_x64: perPlatform.macos_x64.size,
    windows_cancelled: perPlatform.windows_x64_cancelled.size,
    b0_191: b0.size,
    b7_190: b7.size,
    kr62: kr.size,
  },
  intersections: {
    current_in_b0: count((u) => u.sets.b0),
    current_in_b7: count((u) => u.sets.b7),
    current_in_kr62: count((u) => u.sets.kr62),
    current_in_triage_any: count((u) => u.sets.triage !== null),
    current_in_triage_KR: count((u) => u.sets.triage === 'KR'),
    current_in_triage_MAC: count((u) => u.sets.triage === 'MAC'),
    current_in_triage_NEW: count((u) => u.sets.triage === 'NEW'),
    b0_not_current: [...b0].filter((n) => !allNames.has(n)).length,
    b7_not_current: [...b7].filter((n) => !allNames.has(n)).length,
    kr_not_current: [...kr].filter((n) => !allNames.has(n)).length,
    current_not_in_any_baseline_or_triage: count((u) => !u.sets.b0 && !u.sets.b7 && !u.sets.kr62 && u.sets.triage === null),
    current_in_kr62_not_in_b0: count((u) => u.sets.kr62 && !u.sets.b0),
    mac_only_not_windows_log: count((u) => !u.platforms.windows_x64_cancelled && (u.platforms.macos_arm64 || u.platforms.macos_x64)),
    mac_only_not_windows_log_and_not_b0_b7: count(
      (u) => !u.platforms.windows_x64_cancelled && !u.sets.b0 && !u.sets.b7
    ),
    windows_only: count((u) => u.platforms.windows_x64_cancelled && !u.platforms.macos_arm64 && !u.platforms.macos_x64),
    unresolved_repo_file: count((u) => u.repoFiles.length === 0 && u.logFiles.length === 0),
    repo_file_unresolved_but_log_mapped: count((u) => u.repoFiles.length === 0 && u.logFiles.length > 0),
  },
  knownred_missing_on_current: [...kr].filter((n) => !allNames.has(n)),
};
writeFileSync(join(args.outdir, '08-set-summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');

console.log(JSON.stringify(summary.totals, null, 1));
console.log(JSON.stringify(summary.intersections, null, 1));
console.log(`wrote 06/07/08 to ${args.outdir}; testFiles=${testFiles.length}`);
