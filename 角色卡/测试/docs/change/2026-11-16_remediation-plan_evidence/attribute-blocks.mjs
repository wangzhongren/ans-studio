#!/usr/bin/env node
// R2 测试债治理：从 macOS 日志的顶层 `✖ failing tests:` section 逐块提取失败名 + 错误码归因。
// 目的：`errorFirst` 300 字截断会漏掉 JSON 里的下游错误（如 git-initialization-effects-pending
// 内部 message 才是 git-config-executable-or-unsupported）。本脚本按块合并全部行再匹配错误码。
//
// 用法：node attribute-blocks.mjs --arm64 <log> --x64 <log> --out <json>

import { readFileSync, writeFileSync } from 'node:fs';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
if (!args.arm64 || !args.x64 || !args.out) { console.error('missing --arm64/--x64/--out'); process.exit(2); }

const CODES = [
  'git-config-executable-or-unsupported',
  'git-config-section-unsupported',
  'git-config-value-invalid',
  'git-initialization-effects-pending',
  'git-file-final-guard-unproven',
  'git-root-link-unsupported',
  'noncanonical-project-root',
  'runtime-protection-scope-unknown',
  'document-planning-source-unavailable',
  'worker-dispatch-source-unavailable',
  'chief-hub-flow-unavailable',
  'stage-request-required',
  'vca-channel-unavailable',
  'vca-role-not-allowed',
  'ENOTEMPTY',
  'CleanupQueue',
  'AggregateError',
  'ERR_ASSERTION',
  'D1 test wait expired',
  'waitFor 超时',
  '等待实际事件超时',
  '等待超时',
  '离线回交未入队',
  'The actual creator receipt must supply notification source',
  'Actual file/edit handlers do not carry the current canonical metadata roots and link guard',
];

function clean(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\^\[\[?[0-9;]*m/g, '').replace(/^﻿/, '');
}
function toLines(path) {
  const raw = readFileSync(path, 'utf8').split(/\r?\n/);
  const pre = /^([^\t]*)\t([^\t]*)\t(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) ?(.*)$/;
  return raw.map((l) => { const m = clean(l).match(pre); return m ? m[4] : clean(l); });
}
function parse(path) {
  const lines = toLines(path);
  let maxTests = 0, sumIdx = -1;
  lines.forEach((c, i) => { const m = c.match(/^ℹ tests (\d+)$/); if (m && +m[1] > maxTests) { maxTests = +m[1]; sumIdx = i; } });
  if (maxTests < 100) return { error: 'no top-level summary', blocks: [] };
  let start = -1;
  for (let i = sumIdx + 1; i < lines.length; i++) if (/^✖ failing tests:/.test(lines[i])) { start = i; break; }
  if (start === -1) return { error: 'no failing section', blocks: [] };
  const blocks = [];
  let current = null;
  for (let i = start + 1; i < lines.length; i++) {
    const at = lines[i].match(/^test at (.+?)(?::\d+:\d+)?$/);
    if (at) {
      if (current && current.name) blocks.push(current);
      current = { file: at[1].trim(), name: null, lines: [] };
      continue;
    }
    if (current) current.lines.push(lines[i]);
    const x = lines[i].match(/^✖ (.*)$/);
    if (x && current && !current.name) {
      current.name = x[1].replace(/ \(\d+(?:\.\d+)?ms\)$/, '');
    }
  }
  if (current && current.name) blocks.push(current);
  return { maxTests, blocks };
}

const out = { generatedAt: new Date().toISOString(), platforms: {} };
for (const [key, path] of [['macos_arm64', args.arm64], ['macos_x64', args.x64]]) {
  const parsed = parse(path);
  const byName = new Map();
  for (const b of parsed.blocks) {
    const text = b.lines.join('\n');
    const codes = CODES.filter((c) => text.includes(c));
    const firstLine = b.lines.find((l) => l.trim().length > 0)?.trim().slice(0, 220) ?? null;
    const rec = byName.get(b.name) ?? { name: b.name, files: new Set(), codes: new Set(), firstLine, blocks: 0 };
    rec.files.add(b.file);
    for (const c of codes) rec.codes.add(c);
    rec.blocks += 1;
    rec.firstLine ??= firstLine;
    byName.set(b.name, rec);
  }
  out.platforms[key] = {
    source: path,
    topLevelTests: parsed.maxTests,
    blockCount: parsed.blocks.length,
    names: [...byName.values()].map((r) => ({ name: r.name, files: [...r.files], codes: [...r.codes], firstLine: r.firstLine, blocks: r.blocks })),
  };
}
writeFileSync(args.out, JSON.stringify(out, null, 2) + '\n', 'utf8');
for (const [k, p] of Object.entries(out.platforms)) console.log(`${k}: blocks=${p.blockCount} names=${p.names.length}`);
console.log(`wrote ${args.out}`);
