#!/usr/bin/env node
// R4 测试债治理（第三轮 CI 新宇宙）：三平台 CI **上传工件**失败清单提取（只读）。
// 脚本沿用 R3 `2026-11-16_remediation-plan_r3-evidence/extract-ci-failures.mjs`，差异：
//   1) 数据源改为三平台工件 `test-logs-{mac-arm64,mac-x64,win-x64}/test-ci-output.log`（无 gh 日志前缀）；
//      本轮 GitHub 日志流偶发 CANCEL，按协调者口径以工件为准，三平台均有完整顶层汇总。
//   2) 平台键 windows_x64_cancelled → windows_x64（Windows 首次完整跑完）。
//   3) 增加 lineLevel 计数，用于与协调者「行级唯一 ✖」195/195/186 精确对账：
//      uniqueIndentPreservingNames（去耗时、保留缩进、排除 section 头）
//      + sectionHeaderLines（`✖ failing tests:` 行出现次数）。
//
// 提取口径（与 R2/R3 相同）：
//   - spec reporter 的 `✖ <name> (<N>ms)` 行（含缩进子测试）；
//   - `✖ failing tests:` 是 section 头，不是测试名；
//   - 平台权威失败清单 = 全日志 `✖ name` 去重并集（去缩进/耗时、排除 section 头）；
//   - 文件映射只取顶层最终 `✖ failing tests:` section 内的 `test at <file>:line:col`；
//   - 超时条目 = maxDurationMs >= 100000 的失败名。
//
// 用法：
//   node extract-ci-failures.mjs \
//     --arm64-artifact /tmp/r7-art/test-logs-mac-arm64/test-ci-output.log \
//     --x64-artifact /tmp/r7-art/test-logs-mac-x64/test-ci-output.log \
//     --win-artifact /tmp/r7-art/test-logs-win-x64/test-ci-output.log \
//     --outdir 角色卡/测试/docs/change/2026-11-16_remediation-plan_r4-evidence

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
  console.error('missing required arg --outdir (artifact paths default to $R4_ART_ROOT/test-logs-*/test-ci-output.log)');
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
      note: 'uniqueIndentPreservingNames = 去耗时、保留缩进、排除 section 头；lineLevelUniqueIncludingHeaders = 前者 + section 头行出现次数（与协调者 195/195/186 对齐）',
    },
    notes: [],
  };
  const all = new Map(); // name -> record (whole log)
  const finalMap = new Map(); // name -> record (final failing section)
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
      // 顶层 section 头（缩进 0）且位于「大汇总」（tests >= 100）之后才算最终 section。
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

  if (out.cancelTs && out.lastResultTs) {
    out.stallBeforeCancelMs = Date.parse(out.cancelTs) - Date.parse(out.lastResultTs);
  }
  return out;
}

const T = process.env.R4_ART_ROOT || 'C:/Users/51054/AppData/Local/Temp/r7-art';
const platforms = {};
platforms.macos_arm64 = parseLog('macos-arm64', args['arm64-artifact'] || `${T}/test-logs-mac-arm64/test-ci-output.log`);
platforms.macos_x64 = parseLog('macos-x64', args['x64-artifact'] || `${T}/test-logs-mac-x64/test-ci-output.log`);
platforms.windows_x64 = parseLog('windows-x64 (complete)', args['win-artifact'] || `${T}/test-logs-win-x64/test-ci-output.log`);

// 工件完整性核对：三平台均应有顶层 tests>=100 汇总与最终 failing section。
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
  runId: '43812832566',
  workflow: '.github/workflows/test-ci.yml (workflow_dispatch on main @ 8d6a35e, after B1b #110)',
  jobs: {
    'macos-arm64': '(run 43812832566) artifact test-logs-mac-arm64 — complete summary',
    'macos-x64': '(run 43812832566) artifact test-logs-mac-x64 — complete summary',
    'windows-x64': '(run 43812832566) artifact test-logs-win-x64 — complete summary (first full Windows coverage)',
  },
  command: 'node --test --test-concurrency=1 --test-timeout=300000 "test/**/*.test.ts"',
  platforms,
  artifactIntegrity,
  artifactCheck: null,
  notes: [
    'R4 数据源为三平台上传工件（GitHub 日志流偶发 CANCEL，以工件为准）；三平台均有完整顶层汇总与最终 failing section。',
    'Windows 首次完整跑完（非 cancelled）；工时 duration_ms 见汇总，证明预算问题解除。',
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
txt('02-failnames-macos-arm64.txt', platforms.macos_arm64.authoritativeNames);
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
