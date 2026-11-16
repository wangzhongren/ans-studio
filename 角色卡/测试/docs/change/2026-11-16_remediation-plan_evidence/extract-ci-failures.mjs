#!/usr/bin/env node
// R2 测试债治理：三平台 CI 日志失败清单提取（只读）。
//
// 输入（不入库；原始大日志放 /tmp/ci-logs）：
//   gh run view 43421603526 --job 131872698153 --log > /tmp/ci-logs/macos-arm64.log
//   gh run view 43421603526 --job 131872698562 --log > /tmp/ci-logs/macos-x64.log
//   gh run view 43421603526 --job 131872698592 --log > /tmp/ci-logs/windows.log
//   gh run download 43421603526 -n test-logs-win-x64 -D /tmp/ci-logs/artifact-win
//
// 用法：
//   node extract-ci-failures.mjs \
//     --arm64 /tmp/ci-logs/macos-arm64.log \
//     --x64 /tmp/ci-logs/macos-x64.log \
//     --win /tmp/ci-logs/windows.log \
//     --win-artifact /tmp/ci-logs/artifact-win/test-ci-output.log \
//     --outdir 角色卡/测试/docs/change/2026-11-16_remediation-plan_evidence
//
// 提取口径：
//   - spec reporter 的 `✖ <name> (<N>ms)` 行（含缩进子测试）；
//   - `✖ failing tests:` 是 section 头，不是测试名；
//   - 文件级条目 = 名称以 .test.ts(/\.test\.(ts|js|mjs)) 结尾（可带 :line:col）；
//   - 平台权威失败清单 = 顶层最大 `ℹ tests N` 汇总后的 `✖ failing tests:` section
//     （Windows 被取消时不存在该 section，退化为全日志 ✖ 并集并标注 partial）；
//   - 每个失败名的文件映射来自 section 内的 `test at <file>:line:col` 行；
//   - 挂起/超时条目 = maxDurationMs >= 100000 的失败名（本轮实际为 300000ms 级测试级条目，
//     是否文件级由 fileLevel 标志区分）。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

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
if (!args.arm64 || !args.x64 || !args.win || !args.outdir) {
  console.error('missing required args (--arm64 --x64 --win --outdir)');
  process.exit(2);
}
mkdirSync(args.outdir, { recursive: true });

const ANSI_ESC = /\x1b\[[0-9;]*m/g;
const ANSI_CARET = /\^\[\[?[0-9;]*m/g;
const GH_PREFIX = /^([^\t]*)\t([^\t]*)\t(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) ?(.*)$/;
const DURATION_TAIL = / \((\d+(?:\.\d+)?)ms\)$/;
const TEST_AT = /^\s*test at (.+?)(?::\d+:\d+)?\s*$/;
const RESULT_MARK = /^\s*(✔|✖|﹣|▶|ℹ)\s/;
const ERROR_LINE = /^\s*(AssertionError\b|Error\b|TypeError\b|RangeError\b|ReferenceError\b|SyntaxError\b|code: '[A-Z_]+')/;

function clean(s) {
  return s.replace(ANSI_ESC, '').replace(ANSI_CARET, '').replace(/^﻿/, '');
}

function parseLog(platform, path, opts = {}) {
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split(/\r?\n/);
  const out = {
    platform,
    logPath: path,
    logBytes: Buffer.byteLength(raw),
    lineCount: lines.length,
    hasTimestamps: false,
    summaries: [],
    summary: null,
    xmarkLineCount: 0,
    failingSectionStart: -1,
    finalSectionNames: [],
    allNames: [],
    fileLevelNames: [],
    timeouts: [],
    testAtLines: 0,
    lastResultTs: null,
    firstResultTs: null,
    cancelTs: null,
    resultTsGaps: [],
    notes: [],
  };
  const all = new Map(); // name -> record (whole log)
  const finalMap = new Map(); // name -> record (final failing section)
  let seq = 0;
  let lastResultTs = null;
  let currentFile = null;
  let lastTopFile = null;
  let inFinal = false;
  let lastFailure = null;
  let largestSummaryIndex = -1;
  let largestSummaryTests = -1;

  const touch = (rec, line, ts, indent, durationMs, file, errorFirst) => {
    rec.count += 1;
    rec.indents.add(indent);
    rec.seqLast = line;
    if (durationMs !== null) rec.maxDurationMs = Math.max(rec.maxDurationMs ?? 0, durationMs);
    if (ts) {
      if (!rec.firstTs) rec.firstTs = ts;
      rec.lastTs = ts;
    }
    if (file) rec.files.add(file);
    if (errorFirst && !rec.errorFirst) rec.errorFirst = errorFirst;
  };

  for (let i = 0; i < lines.length; i++) {
    let content = clean(lines[i]);
    let ts = null;
    const m = content.match(GH_PREFIX);
    if (m) {
      out.hasTimestamps = true;
      ts = m[3];
      content = m[4];
    }
    if (RESULT_MARK.test(content)) {
      if (ts) {
        if (!out.firstResultTs) out.firstResultTs = ts;
        if (lastResultTs) {
          const gapMs = Date.parse(ts) - Date.parse(lastResultTs);
          if (gapMs >= 240000) {
            out.resultTsGaps.push({ from: lastResultTs, to: ts, gapMs, nextLine: content.slice(0, 160) });
          }
        }
        lastResultTs = ts;
        out.lastResultTs = ts;
      }
    }
    if (/##\[error\]The operation was canceled\./.test(content)) out.cancelTs = ts;

    const summaryMatch = content.match(/^ℹ (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) (\d+(?:\.\d+)?)$/);
    if (summaryMatch) {
      out.summaries.push({ index: i, ts, key: summaryMatch[1], value: Number(summaryMatch[2]), rawIndent: content.match(/^\s*/)[0].length });
      if (summaryMatch[1] === 'tests') {
        const v = Number(summaryMatch[2]);
        if (v > largestSummaryTests) {
          largestSummaryTests = v;
          largestSummaryIndex = i;
        }
      }
      continue;
    }

    if (/^✖ failing tests:\s*$/.test(content) || /^\s*✖ failing tests:\s*$/.test(content)) {
      // 顶层 section 头（缩进 0）或嵌套头；顶层以缩进 0 判定。
      // 仅当已出现「大汇总」（tests >= 100）时才认作顶层收尾；Windows 被取消时不存在该汇总，
      // 日志里的 `ℹ tests 1` 与随后的 failing section 都来自测试内部 spawn 的子 runner，不能当顶层。
      if (content.match(/^\s*/)[0].length === 0) {
        if (
          out.failingSectionStart === -1 &&
          i > largestSummaryIndex &&
          largestSummaryIndex !== -1 &&
          largestSummaryTests >= 100
        ) {
          out.failingSectionStart = i;
          inFinal = true;
        }
      }
      continue;
    }

    const at = content.match(TEST_AT);
    if (at) {
      out.testAtLines += 1;
      currentFile = at[1].trim();
      lastTopFile = currentFile;
      lastFailure = null;
      continue;
    }

    const xm = content.match(/^(\s*)✖ (.*)$/);
    if (xm) {
      out.xmarkLineCount += 1;
      const indent = xm[1].length;
      let name = xm[2].trim();
      if (!name || name === 'failing tests:') continue;
      let durationMs = null;
      const dm = name.match(DURATION_TAIL);
      if (dm) {
        durationMs = Number(dm[1]);
        name = name.slice(0, dm.index).trim();
      }
      // 文件映射只信最终 failing section 的 `test at` 行；inline ✖ 行没有文件信息，
      // 若沿用上一条 `test at` 会把同名测试错误映射到别的文件（本轮已见 chief-workflow 误挂）。
      const file = inFinal ? currentFile : null;
      if (/\.test\.(ts|js|mjs)$/.test(name) || /\.test\.(ts|js|mjs):\d+:\d+$/.test(name)) {
        out.fileLevelNames.push({ name, indent, durationMs, file, line: i, ts });
      }
      const rec = all.get(name) ?? { name, count: 0, indents: new Set(), maxDurationMs: null, files: new Set(), errorFirst: null, firstTs: null, lastTs: null, seqFirst: i, seqLast: i };
      touch(rec, i, ts, indent, durationMs, file, null);
      all.set(name, rec);
      if (inFinal) {
        const frec = finalMap.get(name) ?? { name, count: 0, indents: new Set(), maxDurationMs: null, files: new Set(), errorFirst: null, firstTs: null, lastTs: null, seqFirst: i, seqLast: i };
        touch(frec, i, ts, indent, durationMs, file, null);
        finalMap.set(name, frec);
      }
      lastFailure = { name, rec, frec: inFinal ? finalMap.get(name) : null, file, indent };
      continue;
    }

    if (lastFailure && ERROR_LINE.test(content)) {
      const err = content.trim().slice(0, 300);
      if (!lastFailure.rec.errorFirst) lastFailure.rec.errorFirst = err;
      if (lastFailure.frec && !lastFailure.frec.errorFirst) lastFailure.frec.errorFirst = err;
    }
  }

  const finalSummaryLines = out.summaries.filter((s) => s.rawIndent === 0);
  if (largestSummaryTests >= 100) {
    const block = finalSummaryLines.filter((s) => Math.abs(s.index - largestSummaryIndex) <= 12);
    out.summary = {
      source: 'largest top-level summary',
      lineIndex: largestSummaryIndex,
      ts: block[0]?.ts ?? null,
      counts: Object.fromEntries(block.map((s) => [s.key, s.value])),
    };
  } else {
    out.summary = null;
    out.notes.push(
      `no top-level summary with tests>=100 (largest nested child summary tests=${largestSummaryTests}); ` +
        'run was cancelled before the top-level summary; failure list is partial (whole-log xmark union)'
    );
  }

  const serialize = (rec) => ({
    name: rec.name,
    count: rec.count,
    indents: [...rec.indents].sort((a, b) => a - b),
    maxDurationMs: rec.maxDurationMs,
    files: [...rec.files],
    errorFirst: rec.errorFirst,
    firstTs: rec.firstTs,
    lastTs: rec.lastTs,
  });

  out.allNames = [...all.values()].sort((a, b) => a.seqFirst - b.seqFirst).map(serialize);
  out.finalSectionNames = [...finalMap.values()].sort((a, b) => a.seqFirst - b.seqFirst).map(serialize);
  // 平台失败名单 = 全日志 `✖ name` 去重并集（含 inline 父测试名与最终 section 的叶子/子测试名）。
  // 与 `ℹ fail N` 的差异来自 Node 对父测试+子测试的计数方式与嵌套子 runner 输出，见 notes。
  const authoritative = out.allNames;
  out.authoritativeSource =
    out.failingSectionStart !== -1
      ? 'whole-log xmark union (top-level failing section present)'
      : 'whole-log xmark union (partial/cancelled)';
  if (out.summary && authoritative.length !== out.summary.counts.fail) {
    out.notes.push(
      `unique xmark names=${authoritative.length} vs summary fail=${out.summary.counts.fail}; ` +
        'difference is parent/subtest accounting (inline parent names such as W5/W10 are not repeated as leaf blocks) and embedded child-run output'
    );
  }
  out.authoritativeNames = authoritative;
  out.uniqueCount = authoritative.length;
  out.topLevelCount = authoritative.filter((r) => r.indents.includes(0)).length;
  out.subtestOnlyCount = authoritative.filter((r) => !r.indents.includes(0)).length;
  out.fileLevelCount = out.fileLevelNames.length;
  out.timeouts = authoritative
    .filter((r) => (r.maxDurationMs ?? 0) >= 100000)
    .map((r) => ({ name: r.name, maxDurationMs: r.maxDurationMs, count: r.count, files: r.files, fileLevel: /\.test\.(ts|js|mjs)$/.test(r.name) }));

  // Windows 取消场景：最后一行动与取消时刻的静默间隔
  if (out.cancelTs && out.lastResultTs) {
    out.stallBeforeCancelMs = Date.parse(out.cancelTs) - Date.parse(out.lastResultTs);
  }
  return out;
}

const platforms = {};
platforms.macos_arm64 = parseLog('macos-arm64', args.arm64);
platforms.macos_x64 = parseLog('macos-x64', args.x64);
platforms.windows_x64_cancelled = parseLog('windows-x64 (cancelled)', args.win);

let artifactCheck = null;
if (args['win-artifact']) {
  const a = parseLog('windows-x64 artifact', args['win-artifact']);
  artifactCheck = {
    path: args['win-artifact'],
    xmarkLineCount: a.xmarkLineCount,
    uniqueCount: a.allNames.length,
    ghLogXmarkLineCount: platforms.windows_x64_cancelled.xmarkLineCount,
    ghLogUniqueCount: platforms.windows_x64_cancelled.allNames.length,
    sameNameSet:
      a.allNames.length === platforms.windows_x64_cancelled.allNames.length &&
      a.allNames.every((r, idx) => r.name === platforms.windows_x64_cancelled.allNames[idx]?.name),
  };
}

const combined = {
  generatedAt: new Date().toISOString(),
  runId: '43421603526',
  workflow: '.github/workflows/test-ci.yml (workflow_dispatch on main @ 96cff60)',
  jobs: {
    'macos-arm64': '131872698153 (failure, ~22min)',
    'macos-x64': '131872698562 (failure, ~29min)',
    'windows-x64': '131872698592 (cancelled at 120min job timeout)',
  },
  command: 'node --test --test-concurrency=1 --test-timeout=300000 "test/**/*.test.ts"',
  platforms,
  artifactCheck,
};

const jsonPath = join(args.outdir, '01-ci-failures.json');
writeFileSync(jsonPath, JSON.stringify(combined, null, 2) + '\n', 'utf8');

const txt = (platform, recs) => {
  const rows = [...recs].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  const lines = rows.map((r) => {
    const file = r.files[0] ?? '';
    return `${r.name}\t${file}`;
  });
  const path = join(args.outdir, platform);
  writeFileSync(path, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
  return path;
};
txt('02-failnames-macos-arm64.txt', platforms.macos_arm64.authoritativeNames);
txt('03-failnames-macos-x64.txt', platforms.macos_x64.authoritativeNames);
txt('04-failnames-windows-cancelled.txt', platforms.windows_x64_cancelled.authoritativeNames);

for (const [k, p] of Object.entries(platforms)) {
  console.log(
    `${k}: summary=${p.summary ? JSON.stringify(p.summary.counts) : 'none'} | xmarkLines=${p.xmarkLineCount} | ` +
      `unique=${p.uniqueCount} (top=${p.topLevelCount}, subtest-only=${p.subtestOnlyCount}) | fileLevel=${p.fileLevelCount} | ` +
      `timeouts>=100s=${p.timeouts.length}` + (p.stallBeforeCancelMs ? ` | stallBeforeCancel=${Math.round(p.stallBeforeCancelMs / 60000)}min` : '')
  );
}
console.log(`wrote ${jsonPath}`);
if (artifactCheck) console.log(`artifact check: ${JSON.stringify(artifactCheck)}`);
