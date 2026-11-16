#!/usr/bin/env node
// R6：从 01-ci-failures.json 派生计数速览与超时事实。
// 沿用 R5 summarize-r5.mjs；R6 差异：arm64 为 cancelled/无工件，平台计数为两平台 + arm64 状态披露。
//
// 用法：node summarize-r6.mjs --ci 01-ci-failures.json --outdir <dir>

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
  cancelledPlatform: ci.artifactIntegrity.macos_arm64 ?? null,
};
writeFileSync(join(args.outdir, '05-platform-counts.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');

const timeoutRows = [];
for (const [k, p] of Object.entries(platforms)) {
  for (const t of p.timeouts) timeoutRows.push({ platform: k, ...t });
}
const win = platforms.windows_x64;
const timeoutsAndStall = {
  generatedAt: new Date().toISOString(),
  runId: ci.runId,
  timeoutEntries: timeoutRows,
  fileLevelTimeoutEntries: timeoutRows.filter((t) => t.fileLevel),
  windowsStall: win
    ? {
        lastResultTs: win.lastResultTs,
        cancelTs: win.cancelTs,
        stallBeforeCancelMs: win.stallBeforeCancelMs ?? null,
        stallMinutes: win.stallBeforeCancelMs != null ? Number((win.stallBeforeCancelMs / 60000).toFixed(3)) : null,
        lastTopLevelSummaryFound: win.summary !== null,
        uniqueNames: win.uniqueCount,
        fileLevelCount: win.fileLevelCount,
        note: 'R6 Windows 完整跑完（有顶层汇总，无取消标记）',
      }
    : null,
  cancelledPlatform: {
    platform: 'macos-arm64',
    conclusion: 'cancelled',
    startedAt: '2026-11-16T10:22:57Z',
    completedAt: '2026-11-16T10:37:57Z',
    steps: 0,
    artifact: null,
    note: 'job 级 cancelled，无步骤记录与工件；无测试失败信息，不计入超时/挂起统计。',
  },
  note:
    'R6 口径与 R2–R5 相同：timeouts = maxDurationMs>=100000 的失败名；两个有工件的平台均有完整顶层汇总。' +
    'arm64 无工件，平台超时面未知（披露为覆盖缺口）。',
};
writeFileSync(join(args.outdir, '14-timeouts-and-stall.json'), JSON.stringify(timeoutsAndStall, null, 2) + '\n', 'utf8');

console.log(`wrote 05-platform-counts.json / 14-timeouts-and-stall.json to ${args.outdir}`);
for (const [k, p] of Object.entries(out.platforms)) {
  console.log(`${k}: unique=${p.uniqueCount} lineLevel=${p.lineLevel.lineLevelUniqueIncludingHeaders} summary=${p.summary ? JSON.stringify(p.summary) : 'none'} timeouts=${p.timeouts.length}`);
}
console.log(`arm64: ${out.cancelledPlatform?.jobConclusion} steps=${out.cancelledPlatform?.steps?.length ?? '?'} artifact=${out.cancelledPlatform?.artifact ?? 'none'}`);
