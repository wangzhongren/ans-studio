#!/usr/bin/env node
// R3：三平台 gh 日志与上传工件 test-ci-output.log 的失败名集合一致性核对（R2 只核了 Windows 工件）。
//
// 用法：node crosscheck-artifacts.mjs \
//   --arm64 /tmp/ci-logs2/arm64.log --arm64-artifact /tmp/ci-logs2/artifact-mac-arm64/test-ci-output.log \
//   --x64 /tmp/ci-logs2/x64.log --x64-artifact /tmp/ci-logs2/artifact-mac-x64/test-ci-output.log \
//   --win /tmp/ci-logs2/windows.log --win-artifact /tmp/ci-logs2/artifact-win/test-ci-output.log \
//   --out <json>

import { readFileSync, writeFileSync } from 'node:fs';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
if (!args.out) { console.error('missing --out'); process.exit(2); }

const clean = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\^\[\[?[0-9;]*m/g, '').replace(/^﻿/, '');
const GH_PREFIX = /^([^\t]*)\t([^\t]*)\t(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) ?(.*)$/;
const NAME = /^\s*✖ (.*)$/;

function names(path, hasGhPrefix) {
  const raw = readFileSync(path, 'utf8');
  const out = new Set();
  let xmarkLines = 0;
  let headers = 0;
  for (let l of raw.split(/\r?\n/)) {
    l = clean(l);
    if (hasGhPrefix) {
      const m = l.match(GH_PREFIX);
      if (m) l = m[4];
    }
    const x = l.match(NAME);
    if (!x) continue;
    xmarkLines += 1;
    let name = x[1].trim();
    if (name === 'failing tests:') { headers += 1; continue; }
    name = name.replace(/ \(\d+(?:\.\d+)?ms\)$/, '');
    out.add(name);
  }
  return { path, bytes: Buffer.byteLength(raw), xmarkLines, headers, uniqueNames: out.size, names: out };
}

const check = (label, logPath, artifactPath) => {
  if (!logPath || !artifactPath) return null;
  const a = names(logPath, true);
  const b = names(artifactPath, false);
  const diffA = [...a.names].filter((n) => !b.names.has(n));
  const diffB = [...b.names].filter((n) => !a.names.has(n));
  return {
    label,
    ghLog: { path: a.path, bytes: a.bytes, xmarkLines: a.xmarkLines, headers: a.headers, uniqueNames: a.uniqueNames },
    artifact: { path: b.path, bytes: b.bytes, xmarkLines: b.xmarkLines, headers: b.headers, uniqueNames: b.uniqueNames },
    sameNameSet: diffA.length === 0 && diffB.length === 0,
    onlyInGhLog: diffA,
    onlyInArtifact: diffB,
  };
};

const result = {
  generatedAt: new Date().toISOString(),
  arm64: check('macos-arm64', args.arm64, args['arm64-artifact']),
  x64: check('macos-x64', args.x64, args['x64-artifact']),
  win: check('windows-x64', args.win, args['win-artifact']),
};
writeFileSync(args.out, JSON.stringify(result, null, 2) + '\n', 'utf8');
for (const k of ['arm64', 'x64', 'win']) {
  if (result[k]) console.log(k, JSON.stringify({ sameNameSet: result[k].sameNameSet, gh: result[k].ghLog.uniqueNames, art: result[k].artifact.uniqueNames }));
}
console.log(`wrote ${args.out}`);
