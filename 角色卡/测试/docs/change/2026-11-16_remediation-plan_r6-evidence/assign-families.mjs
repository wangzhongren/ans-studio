#!/usr/bin/env node
// R6：把 06-merged-universe.json 与 10-block-codes.json 合成互斥分族。
// **分族规则逐字沿用 R2/R3/R4/R5**（优先级、常量、正则均未调参）。
// R6 唯一差异：块码来源。R5 及以前读取 platforms.macos_arm64；本轮 arm64 无工件，
// 按 macos_arm64 → macos_x64 的回退顺序读取（两平台失败体同码的既往事实见 R3–R5）。
//
// 用法：node assign-families.mjs --universe 06-merged-universe.json --blocks 10-block-codes.json --outdir <dir>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
if (!args.universe || !args.blocks || !args.outdir) { console.error('missing args'); process.exit(2); }

const universe = JSON.parse(readFileSync(args.universe, 'utf8'));
const blocksJson = JSON.parse(readFileSync(args.blocks, 'utf8'));
const blocksPlatform = blocksJson.platforms.macos_arm64 ? 'macos_arm64' : 'macos_x64';
const blocks = blocksJson.platforms[blocksPlatform];
const codeMap = new Map(blocks.names.map((n) => [n.name, new Set(n.codes)]));
const blockFiles = new Map(blocks.names.map((n) => [n.name, n.files]));
const codes = (name) => codeMap.get(name) ?? new Set();
const primaryFile = (u) => u.repoFiles[0] ?? u.logFiles[0] ?? blockFiles.get(u.name)?.[0] ?? '(unresolved)';
const basename = (p) => p.split('/').pop() ?? p;

const VCA_FILE = /(version-change|version-decision|trunk-upgrade)/;
const DRIFT_FILE = /(stuck-redispatch|directive-input|handback-delivery|star-routing|decision-service|application-line|trio-worker-report)/;
const FLAKE_FILE = /(network-state-e2e|task-restart|download-request|f2-claim-release|interface\.test|session-rebuild-race|b-last-resort|queue-recovery-e2e)/;
const HANG_NAMES = new Set([
  '关闭全部与双角色刷新扫描交接：停止返回后没有后续重开或投递',
  'C-04 decision 开关开启（真实 channel）：judge 按唯一推荐项代选 terminate ⇒ 0 张客户卡 + 结果行 + 任务收口',
]);
const PRODUCT_CANDIDATES = new Set([
  'W19 实际Core回报与Git回调同assignment；报告续父/通知/新chat/关闭父边界',
  'requestRoleStates：客户仅chief可发；其他角色伪内部来源拒绝，停止/诊断与状态重放仍可用',
  'Q2 P2 first new project: empty public chief -> formal convener bootstrap before future planning/D3/cards',
  '范围②：MCP V2 已实施——install_mcp/uninstall_mcp 在 src（工具＋schema 可描述）；docs/mcp 预授权且被声明读取器消费；三适配器装配；能力位仅 su',
  '范围③补＋⑤：编排判据——installSkill 由能力矩阵透传（single=su / trio=Nominator）；项目角色即便误给也零注册',
]);

function familyOf(u) {
  const c = codes(u.name);
  const f = primaryFile(u);
  if (u.sets.kr62) return 'known-red-62';
  if (HANG_NAMES.has(u.name) || (Object.values(u.platforms).some((p) => (p.maxDurationMs ?? 0) >= 100000))) return 'hang-timeout';
  if (/chief-workflow\.test\.ts$/.test(f) && /^(W5|W10|W19|W29|W30|W33|W34|W35|W36|W48|commit-race|selected)\b/.test(u.name)) return 'e71501c-drift';
  if (DRIFT_FILE.test(f)) return 'e71501c-drift';
  if (c.has('git-config-executable-or-unsupported') || c.has('git-initialization-effects-pending')) return 'macos-git-config';
  if (c.has('git-file-final-guard-unproven') || /multi-runtime\.test\.ts$/.test(f) ||
      /^Q2 P2 first new project/.test(u.name) || /^Q2 real default CodexChat/.test(u.name) ||
      /^W48 /.test(u.name) || /project-root-canonicalization\.test\.ts$/.test(f)) return 'ci-path-canonical';
  if (c.has('document-planning-source-unavailable') || c.has('worker-dispatch-source-unavailable') ||
      c.has('chief-hub-flow-unavailable') || c.has('stage-request-required')) return 'source-gate';
  if (c.has('vca-channel-unavailable') || c.has('vca-role-not-allowed') || VCA_FILE.test(f)) return 'vca-flow';
  if (c.has('D1 test wait expired') || c.has('waitFor 超时') || c.has('等待实际事件超时') ||
      c.has('等待超时') || c.has('离线回交未入队') || FLAKE_FILE.test(f) || /排队|queue|timeout|B1 检查时限/i.test(u.name)) return 'flake-timing';
  if (u.sets.b0) return 'b0-existing-other';
  return 'unclassified-new';
}

const families = new Map();
for (const u of universe) {
  const fam = familyOf(u);
  const rec = families.get(fam) ?? { family: fam, names: [] };
  rec.names.push({
    name: u.name,
    file: primaryFile(u),
    platforms: Object.keys(u.platforms),
    b0: u.sets.b0,
    b7: u.sets.b7,
    kr62: u.sets.kr62,
    triage: u.sets.triage,
    codes: [...codes(u.name)],
    errorFirst: u.errorFirst,
    productCandidate: PRODUCT_CANDIDATES.has(u.name),
  });
  families.set(fam, rec);
}

const summary = [];
for (const [fam, rec] of [...families.entries()].sort((a, b) => b[1].names.length - a[1].names.length)) {
  const files = {};
  for (const n of rec.names) files[n.file] = (files[n.file] ?? 0) + 1;
  const platformCounts = {};
  for (const n of rec.names) for (const p of n.platforms) platformCounts[p] = (platformCounts[p] ?? 0) + 1;
  const codeCounts = {};
  for (const n of rec.names) for (const c of n.codes) codeCounts[c] = (codeCounts[c] ?? 0) + 1;
  summary.push({
    family: fam,
    count: rec.names.length,
    platformCounts,
    codeCounts,
    files: Object.entries(files).sort((a, b) => b[1] - a[1]).map(([file, count]) => ({ file, count })),
    known: { b0: rec.names.filter((n) => n.b0).length, b7: rec.names.filter((n) => n.b7).length, kr62: rec.names.filter((n) => n.kr62).length },
    triage: rec.names.reduce((m, n) => { m[n.triage ?? 'null'] = (m[n.triage ?? 'null'] ?? 0) + 1; return m; }, {}),
    productCandidates: rec.names.filter((n) => n.productCandidate).map((n) => n.name),
    names: rec.names,
  });
}
const out = { generatedAt: new Date().toISOString(), total: universe.length, blockCodeSource: blocksPlatform, families: summary };
writeFileSync(join(args.outdir, '11-families.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');

const tsv = summary.map((f) => `${f.family}\t${f.count}\t${f.files.slice(0, 6).map((x) => `${x.count}:${basename(x.file)}`).join(', ')}`).join('\n');
writeFileSync(join(args.outdir, '12-family-summary.tsv'), tsv + '\n', 'utf8');

for (const f of summary) console.log(`${f.family.padEnd(20)} ${String(f.count).padStart(3)} | top files: ${f.files.slice(0, 4).map((x) => `${x.count}x ${basename(x.file)}`).join(', ')}`);
console.log(`blockCodeSource=${blocksPlatform}`);
console.log(`wrote 11-families.json / 12-family-summary.tsv to ${args.outdir}`);
