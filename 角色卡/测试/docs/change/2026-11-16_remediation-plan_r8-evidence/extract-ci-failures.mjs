#!/usr/bin/env node
// R8 测试债治理（第七轮 CI 新宇宙）：CI **上传工件**失败清单提取（只读）。
// 脚本沿用 R6 `extract-ci-failures.mjs`，差异仅元数据与三平台工件：
//   1) 数据源为 run 43867573699（main @ 5661a73，KR-33/file-gate/w19/b4fu/b3cfu/misc/misc2/misc3 合并后）的工件；
//   2) 三平台 arm64/x64/Windows 工件齐全——三平台均解析；
//   3) 工件根目录默认 /tmp/r8-art；提取口径与 R2–R6 完全一致。
//
// 提取口径（与 R2–R5 相同）：
//   - spec reporter 的 `✖ <name> (<N>ms)` 行（含缩进子测试）；
//   - `✖ failing tests:` 是 section 头，不是测试名；
//   - 平台权威失败清单 = 全日志 `✖ name` 去重并集（去缩进/耗时、排除 section 头）；
//   - 文件映射只取顶层最终 `✖ failing tests:` section 内的 `test at <file>:line:col`；
//   - 超时条目 = maxDurationMs >= 100000 的失败名。
//
// 用法：
//   node extract-ci-failures.mjs \
//     --arm64-artifact /tmp/r8-art/test-logs-mac-arm64/test-ci-output.log \
//     --x64-artifact /tmp/r8-art/test-logs-mac-x64/test-ci-output.log \
//     --win-artifact /tmp/r8-art/test-logs-win-x64/test-ci-output.log \
//     --outdir 角色卡/测试/docs/change/2026-11-16_remediation-plan_r8-evidence

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
if (!args.outdir) {
  console.error('missing required arg --outdir');
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

function parseLog(platform, path) {
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
    lineLevel: {
      sectionHeaderLines: 0,
      uniqueIndentPreservingNames: 0,
      lineLevelUniqueIncludingHeaders: 0,
      note: 'uniqueIndentPreservingNames = 去耗时、保留缩进、排除 section 头；lineLevelUniqueIncludingHeaders = 前者 + section 头行出现次数（R2–R8 口径）',
    },
    notes: [],
  };
  const all = new Map();
  const finalMap = new Map();
  const indentNames = new Set();
  let lastResultTs = null;
  let currentFile = null;
  let inFinal = false;
  let lastFailure = null;
  let largestSummaryIndex = -1;
  let largestSummaryTests = -1;

  const touch = (rec, line, ts, indent, durationMs, file) => {
    rec.count += 1;
    rec.indents.add(indent);
    rec.seqLast = line;
    if (durationMs !== null) rec.maxDurationMs = Math.max(rec.maxDurationMs ?? 0, durationMs);
    if (ts) {
      if (!rec.firstTs) rec.firstTs = ts;
      rec.lastTs = ts;
    }
    if (file) rec.files.add(file);
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

    if (/^\s*✖ failing tests:\s*$/.test(content)) {
      out.lineLevel.sectionHeaderLines += 1;
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
      lastFailure = null;
      continue;
    }

    const xm = content.match(/^(\s*)✖ (.*)$/);
    if (xm) {
      out.xmarkLineCount += 1;
      const indent = xm[1].length;
      let name = xm[2].trim();
      if (!name) continue;
      let durationMs = null;
      const dm = name.match(DURATION_TAIL);
      if (dm) {
        durationMs = Number(dm[1]);
        name = name.slice(0, dm.index).trim();
      }
      indentNames.add(`${indent}|${name}`);
      const file = inFinal ? currentFile : null;
      if (/\.test\.(ts|js|mjs)$/.test(name) || /\.test\.(ts|js|mjs):\d+:\d+$/.test(name)) {
        out.fileLevelNames.push({ name, indent, durationMs, file, line: i, ts });
      }
      const rec = all.get(name) ?? { name, count: 0, indents: new Set(), maxDurationMs: null, files: new Set(), errorFirst: null, firstTs: null, lastTs: null, seqFirst: i, seqLast: i };
      touch(rec, i, ts, indent, durationMs, file);
      all.set(name, rec);
      if (inFinal) {
        const frec = finalMap.get(name) ?? { name, count: 0, indents: new Set(), maxDurationMs: null, files: new Set(), errorFirst: null, firstTs: null, lastTs: null, seqFirst: i, seqLast: i };
        touch(frec, i, ts, indent, durationMs, file);
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
  out.lineLevel.uniqueIndentPreservingNames = indentNames.size;
  out.lineLevel.lineLevelUniqueIncludingHeaders = indentNames.size + out.lineLevel.sectionHeaderLines;

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
  const authoritative = out.allNames;
  out.authoritativeSource =
    out.failingSectionStart !== -1
      ? 'whole-log xmark union (top-level failing section present)'
      : 'whole-log xmark union (partial/cancelled)';
  if (out.summary && authoritative.length !== out.summary.counts.fail) {
    out.notes.push(
      `unique xmark names=${authoritative.length} vs summary fail=${out.summary.counts.fail}; ` +
        'difference is parent/subtest accounting (inline parent names are not repeated as leaf blocks) and embedded child-run output'
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

  if (out.cancelTs && out.lastResultTs) {
    out.stallBeforeCancelMs = Date.parse(out.cancelTs) - Date.parse(out.lastResultTs);
  }
  return out;
}

const T = process.env.R8_ART_ROOT || 'C:/Users/51054/AppData/Local/Temp/r8-art';
const platforms = {};
platforms.macos_arm64 = parseLog('macos-arm64', args['arm64-artifact'] || `${T}/test-logs-mac-arm64/test-ci-output.log`);
platforms.macos_x64 = parseLog('macos-x64', args['x64-artifact'] || `${T}/test-logs-mac-x64/test-ci-output.log`);
platforms.windows_x64 = parseLog('windows-x64 (complete)', args['win-artifact'] || `${T}/test-logs-win-x64/test-ci-output.log`);

const artifactIntegrity = {};
for (const [k, p] of Object.entries(platforms)) {
  artifactIntegrity[k] = {
    logPath: p.logPath,
    logBytes: p.logBytes,
    lineCount: p.lineCount,
    hasTopLevelSummary: p.summary !== null,
    summaryCounts: p.summary?.counts ?? null,
    finalFailingSectionFound: p.failingSectionStart !== -1,
    xmarkLineCount: p.xmarkLineCount,
    uniqueNames: p.uniqueCount,
    lineLevel: p.lineLevel,
    fileLevelCount: p.fileLevelCount,
    cancelMarkerInArtifact: p.cancelTs !== null,
  };
}

const combined = {
  generatedAt: new Date().toISOString(),
  runId: '43867573699',
  workflow:
    '.github/workflows/test-ci.yml (workflow_dispatch on main @ 5661a73, after w19/b4fu/b3cfu/misc/KR-33/file-gate/misc2/misc3 merges #122-#131)',
  jobs: {
    'macos-arm64': '(run 43867573699) artifact test-logs-mac-arm64 — complete summary',
    'macos-x64': '(run 43867573699) artifact test-logs-mac-x64 — complete summary',
    'windows-x64': '(run 43867573699) artifact test-logs-win-x64 — complete summary',
  },
  command: 'node --test --test-concurrency=1 --test-timeout=300000 --test-force-exit "test/**/*.test.ts"',
  platforms,
  artifactIntegrity,
  artifactCheck: null,
  notes: [
    'R8 数据源为 run 43867573699 的上传工件（/tmp/r8-art）：macOS arm64/x64 与 Windows x64 均完整。',
    '相对 R6：w19 #122、b4fu #123、b3cfu #124、misc #125、R6 文档 #126、KR-33 分类 #127、macOS file-gate nlink 修复 #128、KR-33 修复 #129、misc2 #130、misc3 #131 已合入 main（5661a73）。',
    'KR-29 门禁 5（kr29a）、KR-29 编排 23（kr29b）、平台硬化（plat）、KR-29 分类（docs）晚于本轮 CI，未合入。',
  ],
};

const jsonPath = join(args.outdir, '01-ci-failures.json');
writeFileSync(jsonPath, JSON.stringify(combined, null, 2) + '\n', 'utf8');

const txt = (platform, recs) => {
  const rows = [...recs].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  const lines = rows.map((r) => `${r.name}\t${r.files[0] ?? ''}`);
  const path = join(args.outdir, platform);
  writeFileSync(path, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
  return path;
};
if (platforms.macos_arm64) txt('02-failnames-macos-arm64.txt', platforms.macos_arm64.authoritativeNames);
txt('03-failnames-macos-x64.txt', platforms.macos_x64.authoritativeNames);
txt('04-failnames-windows-x64.txt', platforms.windows_x64.authoritativeNames);

for (const [k, p] of Object.entries(platforms)) {
  console.log(
    `${k}: summary=${p.summary ? JSON.stringify(p.summary.counts) : 'none'} | xmarkLines=${p.xmarkLineCount} | ` +
      `unique=${p.uniqueCount} (top=${p.topLevelCount}, subtest-only=${p.subtestOnlyCount}) | fileLevel=${p.fileLevelCount} | ` +
      `timeouts>=100s=${p.timeouts.length} | lineLevel=${p.lineLevel.lineLevelUniqueIncludingHeaders}`
  );
}
console.log(`wrote ${jsonPath}`);
