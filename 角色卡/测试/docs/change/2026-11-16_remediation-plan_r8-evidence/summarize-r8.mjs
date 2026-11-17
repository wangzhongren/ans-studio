#!/usr/bin/env node
// R8：从 01-ci-failures.json 派生三平台计数速览与超时事实。
// 沿用 R6 summarize-r6.mjs；R8 差异：arm64 工件完整（不再是 cancelled 披露）。
//
// 用法：node summarize-r8.mjs --ci 01-ci-failures.json --outdir <dir>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
if (!args.ci || !args.outdir) { console.error('missing --ci/--outdir'); process.exit(2); }

const ci = JSON.parse(readFileSync(args.ci, 'utf8'));
const platforms = ci.platforms;

const brief = (p) => ({
  logPath: p.logPath,
  logBytes: p.logBytes,
  lineCount: p.lineCount,
  hasTimestamps: p.hasTimestamps,
  summary: p.summary ? p.summary.counts : null,
  xmarkLineCount: p.xmarkLineCount,
  uniqueCount: p.uniqueCount,
  topLevelCount: p.topLevelCount,
  subtestOnlyCount: p.subtestOnlyCount,
  fileLevelCount: p.fileLevelCount,
  timeouts: p.timeouts,
  failingSectionStart: p.failingSectionStart,
  lineLevel: p.lineLevel,
  firstResultTs: p.firstResultTs,
  lastResultTs: p.lastResultTs,
  cancelTs: p.cancelTs ?? null,
  stallBeforeCancelMs: p.stallBeforeCancelMs ?? null,
  resultTsGaps: p.resultTsGaps,
  notes: p.notes,
});

const out = {
  generatedAt: new Date().toISOString(),
  runId: ci.runId,
  workflow: ci.workflow,
  jobs: ci.jobs,
  command: ci.command,
  platforms: Object.fromEntries(Object.entries(platforms).map(([k, p]) => [k, brief(p)])),
  artifactIntegrity: ci.artifactIntegrity,
};
writeFileSync(join(args.outdir, '05-platform-counts.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');

const timeoutRows = [];
for (const [k, p] of Object.entries(platforms)) {
  for (const t of p.timeouts) timeoutRows.push({ platform: k, ...t });
}
const timeoutsAndStall = {
  generatedAt: new Date().toISOString(),
  runId: ci.runId,
  timeoutEntries: timeoutRows,
  fileLevelTimeoutEntries: timeoutRows.filter((t) => t.fileLevel),
  perPlatform: Object.fromEntries(
    Object.entries(platforms).map(([k, p]) => [
      k,
      {
        lastResultTs: p.lastResultTs,
        summaryPresent: p.summary !== null,
        uniqueNames: p.uniqueCount,
        fileLevelCount: p.fileLevelCount,
        timeoutCount: p.timeouts.length,
        timeouts: p.timeouts.map((t) => ({ name: t.name, maxDurationMs: t.maxDurationMs, count: t.count })),
      },
    ])
  ),
  windowsStall: null,
  note:
    'R8 口径与 R2–R6 相同：timeouts = maxDurationMs>=100000 的失败名。三平台均有完整顶层汇总、无 canceled 标记（x64 summary.cancelled=2 来自 180s/300s 测试超时，不是 job 取消）。',
};
writeFileSync(join(args.outdir, '14-timeouts-and-stall.json'), JSON.stringify(timeoutsAndStall, null, 2) + '\n', 'utf8');

console.log(`wrote 05-platform-counts.json / 14-timeouts-and-stall.json to ${args.outdir}`);
for (const [k, p] of Object.entries(out.platforms)) {
  console.log(`${k}: unique=${p.uniqueCount} lineLevel=${p.lineLevel.lineLevelUniqueIncludingHeaders} summary=${p.summary ? JSON.stringify(p.summary) : 'none'} timeouts=${p.timeouts.length}`);
}
