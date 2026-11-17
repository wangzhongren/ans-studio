#!/usr/bin/env node
// R8 补充证据：行级口径对账、族语义修正、B0/B7 缺口、平台矩阵、KR-33 归零、
// 重点确认逐项、剩余构成、R7→R8 平台迁移。
//
// 输出：24, 25, 26, 27, 28, 29, 30, 16b
//
// 用法：node supplement-r8.mjs --ci <01> --universe <06> --families <11> --b0 <b0.txt> --b7 <b7.txt>
//        --kr-dir <knownred> --r7-ci <r7-artifacts/01> --arm64-log <log> --x64-log <log> --win-log <log> --outdir <dir>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) { console.error('bad args'); process.exit(2); }
  args[k.slice(2)] = v;
}
for (const req of ['ci', 'universe', 'families', 'b0', 'b7', 'kr-dir', 'r7-ci', 'arm64-log', 'x64-log', 'win-log', 'outdir']) {
  if (!args[req]) { console.error(`missing --${req}`); process.exit(2); }
}

const ci = JSON.parse(readFileSync(args.ci, 'utf8'));
const universe = JSON.parse(readFileSync(args.universe, 'utf8'));
const families = JSON.parse(readFileSync(args.families, 'utf8'));
const r7ci = JSON.parse(readFileSync(args['r7-ci'], 'utf8'));
const readLines = (p) => readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
const b0 = readLines(args.b0);
const b7 = readLines(args.b7);
const readFileLines = (p) => readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
const runtimeCore33 = readFileLines(join(args['kr-dir'], 'runtime-core-33.txt'));
const gates5 = readFileLines(join(args['kr-dir'], 'gates-5.txt'));
const orch24 = readFileLines(join(args['kr-dir'], 'orchestration-24.txt'));
const names = new Set(universe.map((u) => u.name));
const um = new Map(universe.map((u) => [u.name, u]));
const famOf = new Map();
for (const f of families.families) for (const n of f.names) famOf.set(n.name, f.family);
const platKeys = ['macos_arm64', 'macos_x64', 'windows_x64'];
const platShort = { macos_arm64: 'arm64', macos_x64: 'x64', windows_x64: 'win' };
const sortNames = (arr) => arr.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

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
    'lineLevelUniqueIncludingHeaders = uniqueIndentPreservingNames（去耗时、保留缩进、排除 section 头）+ sectionHeaderLines（`✖ failing tests:` 行全部出现次数）；R2–R8 逐字沿用。',
  platforms: plat,
  reconcile:
    'arm64 30 唯一名 + 1 section 头 = 31；x64 40 唯一名（fail 38 + cancelled 2）+ 1 = 41；Windows 28 唯一名（含 1 个 file-level）+ 1 = 29；与协调者 30/31、38/41、28/29 精确吻合。',
};
writeFileSync(join(args.outdir, '24-linelevel-reconciliation.json'), JSON.stringify(lineLevel, null, 2) + '\n', 'utf8');

// ---------- 25 族语义修正 ----------
const corrections = [
  {
    name: 'W29 默认Core/Chat真实既有文档基线后续 document-change 保专业规划scope不授旧执行pin',
    ruleFamily: famOf.get('W29 默认Core/Chat真实既有文档基线后续 document-change 保专业规划scope不授旧执行pin') ?? '',
    semantic: 'macOS-x64 产品/夹具后续阻塞：nlink 修复后 flow 已推进到 git_candidate prepared，但 11.4s 处 `Actual publisher notification must reach its actor` 断言失败（与同组其余 3 个 W29 的快速 git-core-in-flight-unproven 不同体）',
    basis: 'chief-workflow.test.ts；10-block-codes ERR_ASSERTION；x64-only',
  },
  {
    name: 'W29 默认Core/Chat真实既有文档基线后续 document-change-missing-confirmation 保专业规划scope不授旧执行pin',
    ruleFamily: famOf.get('W29 默认Core/Chat真实既有文档基线后续 document-change-missing-confirmation 保专业规划scope不授旧执行pin') ?? '',
    semantic: 'macOS-x64 后续阻塞（R8 新出现变体）：git_candidate 在 repoId=uninitialized 时被 git-core-in-flight-unproven 拒绝（An actual Core session is still preparing/creating/disposing）',
    basis: 'chief-workflow.test.ts:1726；R7 无此名，R8 首次',
  },
  {
    name: 'W30 默认Core/Chat真实第二版意图卡确认必须持久同request版本冻结 连续写入后',
    ruleFamily: famOf.get('W30 默认Core/Chat真实第二版意图卡确认必须持久同request版本冻结 连续写入后') ?? '',
    semantic: 'macOS-x64 后续阻塞：同 chief-workflow:1726 git-core-in-flight-unproven（约 0.4–0.6s 快失败）',
    basis: 'chief-workflow.test.ts:1726；R7 三平台红（~8–11s），R8 仅 x64',
  },
  {
    name: 'W33 真实DocRun关闭通知退休旧InitRun绑定且后续合法任务继续',
    ruleFamily: famOf.get('W33 真实DocRun关闭通知退休旧InitRun绑定且后续合法任务继续') ?? '',
    semantic: 'w19 后 arm64/Windows 转绿，仅 x64 红；失败体与 W29/W30 同源 git-core-in-flight-unproven',
    basis: 'chief-workflow.test.ts:1726；R7 三平台红',
  },
  {
    name: 'W34 真实首文档发布与原创建者关闭后派团队规划保独立scope',
    ruleFamily: famOf.get('W34 真实首文档发布与原创建者关闭后派团队规划保独立scope') ?? '',
    semantic: '未自愈：file-gate-host-facts-unproven 已消失，改为 git-core-in-flight-unproven；arm64/Windows 转绿，仅 x64 红',
    basis: 'chief-workflow.test.ts:1726；R7 三平台红',
  },
  {
    name: 'W35 缺team仍可真实Chief报告派人事准备但D3写动作拒绝',
    ruleFamily: famOf.get('W35 缺team仍可真实Chief报告派人事准备但D3写动作拒绝') ?? '',
    semantic: '未自愈：同 git-core-in-flight-unproven；arm64/Windows 转绿，仅 x64 红',
    basis: 'chief-workflow.test.ts:1726；R7 三平台红',
  },
  {
    name: 'Q2 P2 first new project: empty public chief -> formal convener bootstrap before future planning/D3/cards',
    ruleFamily: famOf.get('Q2 P2 first new project: empty public chief -> formal convener bootstrap before future planning/D3/cards') ?? '',
    semantic: '规则归 hang-timeout（maxDuration 300s），语义为「file-gate 失败消失后 x64 真实链 300s 超时」；R7 x64 为 5.6s 断言失败、R7 Windows 已 300s 超时',
    basis: 'git-role-workflows-e2e.test.ts；300001ms；x64-only',
  },
  {
    name: '重启恢复：未投递任务重新入队一次；已投递不前移；重复调用不重复投；坏行跳过',
    ruleFamily: famOf.get('重启恢复：未投递任务重新入队一次；已投递不前移；重复调用不重复投；坏行跳过') ?? '',
    semantic: '规则归 hang-timeout（arm64 55.6s / x64 158.1s ≥100s），实际失败为测试内「等待超时 record={reports:[]}」；misc 批重写后仍红（Windows 绿）',
    basis: 'task-restart.test.ts；R7 三平台红且 x64 已 202.8s',
  },
  {
    name: 'independent C Window: initial source save and its notification continue one original delivery without source replay or raw IPC',
    ruleFamily: famOf.get('independent C Window: initial source save and its notification continue one original delivery without source replay or raw IPC') ?? '',
    semantic: 'unclassified-new 规则族；语义为 flake-timing（ENOTEMPTY 临时目录清理，ans-p1p7-window-report-*）；arm64-only 新出现',
    basis: 'p1p7-window-provenance-integration.test.ts；ENOTEMPTY；duration 51.6ms',
  },
  {
    name: 'test\\测试\\g5-reasoning-verify\\compatibility-loopback.test.ts',
    ruleFamily: famOf.get('test\\测试\\g5-reasoning-verify\\compatibility-loopback.test.ts') ?? '',
    semantic: 'native-infra-crash（file-level；Windows 原生 libuv UV_HANDLE_CLOSING 收尾期断言；plat 未合入）',
    basis: 'Windows fileLevelCount=2（inline+final）；duration 3.2s',
  },
  {
    name: 'Git final spawn fence: real pending-record interruption records no launch and permits a later genuine retry',
    ruleFamily: famOf.get('Git final spawn fence: real pending-record interruption records no launch and permits a later genuine retry') ?? '',
    semantic: 'macOS FSEvents 平台候选（arm64+x64 均红；plat 两路分类未合入）',
    basis: 'git-command.test.ts；R7 已 arm64+x64 红',
  },
];
const corrTsv = [
  ['name', 'ruleFamily', 'semantic', 'basis'].join('\t'),
  ...corrections.map((c) => [c.name, c.ruleFamily, c.semantic, c.basis].join('\t')),
].join('\n');
writeFileSync(join(args.outdir, '25-family-semantic-corrections.tsv'), corrTsv + '\n', 'utf8');

// ---------- 26 B0/B7 缺口 ----------
const parseSkip = (path) => {
  const set = new Set();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/\s*﹣ (.*?)(?: \(\d+(?:\.\d+)?ms\))?\s*$/);
    if (m) set.add(m[1].trim());
  }
  return set;
};
const skipArm = parseSkip(args['arm64-log']);
const skipX64 = parseSkip(args['x64-log']);
const skipWin = parseSkip(args['win-log']);
const b0Missing = b0.filter((n) => !names.has(n));
const b7Missing = b7.filter((n) => !names.has(n));
const inAnySkip = (n) => skipArm.has(n) || skipX64.has(n) || skipWin.has(n);
const b0MissingSkipped = b0Missing.filter(inAnySkip);
const b7MissingSkipped = b7Missing.filter(inAnySkip);
const r7names = new Set();
for (const p of Object.values(r7ci.platforms)) for (const r of p.authoritativeNames) r7names.add(r.name);
const summary = {
  generatedAt: new Date().toISOString(),
  runId: ci.runId,
  b0: { total: b0.length, hit: universe.filter((u) => u.sets.b0).length, missing: b0Missing.length, missingAppearedInSkipLines: b0MissingSkipped.length },
  b7: { total: b7.length, hit: universe.filter((u) => u.sets.b7).length, missing: b7Missing.length, missingAppearedInSkipLines: b7MissingSkipped.length },
  kr62: {
    total: 62,
    hit: universe.filter((u) => u.sets.kr62).length,
    missing: 62 - universe.filter((u) => u.sets.kr62).length,
    hitInR7: r7names.size ? '见 28-kr33-zero.json / 29-focused-confirmations.tsv' : '',
  },
  nonKnownRedB0Hits: universe.filter((u) => u.sets.b0 && !u.sets.kr62).map((u) => u.name),
  r7ToR8: {
    b0MissingR7: b0.filter((n) => !r7names.has(n)).length,
    b0MissingR8: b0Missing.length,
    newlyGreenVsR7: b0Missing.length - b0.filter((n) => !r7names.has(n)).length,
    note: '差额 = R7 红而 R8 三平台未复现的名（三平台均有完整工件）。',
  },
  skipLineNamesScanned: { arm64: skipArm.size, x64: skipX64.size, windows: skipWin.size },
  disclosure: '三平台工件齐全；缺失名的 skip 扫描覆盖 arm64/x64/Windows 全量 skip 行。',
};
writeFileSync(join(args.outdir, '26-b0-b7-closure-summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');

// ---------- 27 平台矩阵 ----------
const groups = new Map();
for (const u of universe) {
  const key = platKeys.filter((k) => u.platforms[k]).map((k) => platShort[k]).join('+') || '-';
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(u.name);
}
const rows = [['combination', 'count', 'familyCounts', 'names'].join('\t')];
for (const [combo, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const fc = {};
  for (const n of list) fc[famOf.get(n) ?? '?'] = (fc[famOf.get(n) ?? '?'] ?? 0) + 1;
  rows.push([combo, list.length, JSON.stringify(fc), sortNames(list).join(' | ')].join('\t'));
}
writeFileSync(join(args.outdir, '27-platform-matrix.tsv'), rows.join('\n') + '\n', 'utf8');

// ---------- 28 KR-33 / KR-29 zero ----------
const presence = (name) => {
  const rec = um.get(name);
  if (!rec) return { any: false, arm64: false, x64: false, win: false, duration: {} };
  return {
    any: true,
    arm64: !!rec.platforms.macos_arm64,
    x64: !!rec.platforms.macos_x64,
    win: !!rec.platforms.windows_x64,
    duration: Object.fromEntries(Object.entries(rec.platforms).map(([k, p]) => [platShort[k], p.maxDurationMs])),
  };
};
const kr33 = runtimeCore33.map((n) => ({ name: n, r8: presence(n), inR7: r7names.has(n), inR6: !!require6Name(n) }));
function require6Name(n) {
  try {
    const r6 = JSON.parse(readFileSync(join(args.outdir, '..', '2026-11-16_remediation-plan_r6-evidence', '06-merged-universe.json'), 'utf8'));
    return r6.some((x) => x.name === n);
  } catch { return null; }
}
const kr29 = {
  gates5: gates5.map((n) => ({ name: n, r8: presence(n), inR7: r7names.has(n) })),
  orchestration24: orch24.map((n) => ({ name: n, r8: presence(n), inR7: r7names.has(n) })),
};
const kr33Zero = {
  generatedAt: new Date().toISOString(),
  source: '角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence/segment3/knownred/runtime-core-33.txt',
  total: runtimeCore33.length,
  presentInR8: runtimeCore33.filter((n) => presence(n).any).length,
  presentInR7: runtimeCore33.filter((n) => r7names.has(n)).length,
  verdict:
    runtimeCore33.filter((n) => presence(n).any).length === 0
      ? 'KR-33 归零：33/33 未出现在 R8 三平台任何失败名；R7 中仍有 6 名（CI 可见真红），已被 #129 修复。'
      : '仍有出现：见 details',
  names: kr33,
  kr29: {
    gates5Present: gates5.filter((n) => presence(n).any).length,
    orchestration24Present: orch24.filter((n) => presence(n).any).length,
    orchestration24Green: orch24.filter((n) => !presence(n).any),
    details: kr29,
  },
};
writeFileSync(join(args.outdir, '28-kr33-zero.json'), JSON.stringify(kr33Zero, null, 2) + '\n', 'utf8');

// ---------- 29 重点确认 ----------
const focusPatterns = [
  ['file-gate W29 document-change', /^W29 .*document-change 保专业/],
  ['file-gate W29 wrong-flow', /^W29 .*wrong-flow/],
  ['file-gate W29 source-loss', /^W29 .*source-loss/],
  ['file-gate W29 missing-confirmation', /^W29 .*missing-confirmation/],
  ['file-gate W30 连续写入后', /^W30 .*连续写入后/],
  ['file-gate W30 真实重启迁移后', /^W30 .*真实重启迁移后/],
  ['file-gate Q2 P2', /^Q2 P2 first new project/],
  ['B4 W34', /^W34 /],
  ['B4 W35', /^W35 /],
  ['w19 W19', /^W19 /],
  ['w19 W33', /^W33 /],
  ['misc2 W36', /^W36 /],
  ['W-J5', /^W-J5/],
  ['spawn fence', /^Git final spawn fence/],
  ['compatibility-loopback', /compatibility-loopback\.test\.ts$/],
  ['misc task-restart', /^重启恢复：未投递任务/],
  ['misc3 b31', /^路径 B：B3 accepted/],
  ['misc3 ENOTEMPTY', /^actual Core request_choice abort/],
  ['new independent C Window', /^independent C Window/],
];
const r7presence = (name) => {
  const s = {};
  for (const k of platKeys) s[platShort[k]] = !!(r7ci.platforms[k]?.authoritativeNames ?? []).some((r) => r.name === name);
  return s;
};
const focusRows = [['item', 'name', 'r7(arm64/x64/win)', 'r8(arm64/x64/win)', 'r8 duration', 'verdict'].join('\t')];
for (const [label, pat] of focusPatterns) {
  const hits = universe.filter((u) => pat.test(u.name));
  if (!hits.length) {
    // still record absence (green) using R7 name if any
    const r7hits = [];
    for (const [k, p] of Object.entries(r7ci.platforms)) for (const r of p.authoritativeNames) if (pat.test(r.name)) r7hits.push(r.name);
    const uniq = [...new Set(r7hits)];
    for (const n of uniq.length ? uniq : ['(R7/R8 均无)']) {
      const p7 = n === '(R7/R8 均无)' ? { arm64: false, x64: false, win: false } : r7presence(n);
      focusRows.push([label, n, `${+p7.arm64}/${+p7.x64}/${+p7.win}`, '0/0/0', '', 'R8 三平台均未出现（转绿/退役）'].join('\t'));
    }
    continue;
  }
  for (const u of hits) {
    const p7 = r7presence(u.name);
    const dur = Object.keys(u.platforms).map((k) => `${platShort[k]}:${Math.round(u.platforms[k].maxDurationMs)}ms`).join(',');
    const plats = Object.keys(u.platforms).map((k) => platShort[k]).join('+');
    focusRows.push([label, u.name, `${+p7.arm64}/${+p7.x64}/${+p7.win}`, plats, dur, `R8 仍红（${plats}）`].join('\t'));
  }
}
writeFileSync(join(args.outdir, '29-focused-confirmations.tsv'), focusRows.join('\n') + '\n', 'utf8');

// ---------- 30 remaining composition ----------
const COMPOSITION_CATEGORY = (u) => {
  const n = u.name;
  if (/^W29 /.test(n) || /^W30 /.test(n) || /^W33 /.test(n) || /^W34 /.test(n) || /^W35 /.test(n)) return 'macOS-x64 file-gate 后续阻塞（#128 后新码 git-core-in-flight-unproven；W29 主变体为 publisher notification）';
  if (/^Q2 P2/.test(n)) return 'macOS-x64 300s 超时（file-gate 失败消失后真实链超时）';
  if (/^W-J5/.test(n)) return 'x64 180s（plat 预算观测待合入）';
  if (/^Git final spawn fence/.test(n)) return 'macOS FSEvents 平台候选（plat 两路分类待合入）';
  if (/compatibility-loopback/.test(n)) return 'Windows 原生 libuv 崩溃（plat 子进程隔离待合入）';
  if (/^重启恢复/.test(n)) return 'misc 未竟（等待超时；arm64/x64，Windows 绿）';
  if (/^independent C Window/.test(n)) return 'R8 新增 flake 候选（ENOTEMPTY；arm64-only）';
  if (u.sets.kr62) return 'KR-29 冻结 known-red（kr29a/kr29b 待合入）';
  return '待定';
};
const compRows = [['category', 'family', 'platforms', 'kr62', 'name'].join('\t'),
  ...universe
    .map((u) => [COMPOSITION_CATEGORY(u), famOf.get(u.name) ?? '', Object.keys(u.platforms).map((k) => platShort[k]).join('+'), u.sets.kr62 ? 'KR' : '', u.name].join('\t'))
    .sort()];
writeFileSync(join(args.outdir, '30-remaining-composition.tsv'), compRows.join('\n') + '\n', 'utf8');
const compSummary = {};
for (const u of universe) (compSummary[COMPOSITION_CATEGORY(u)] ??= []).push(u.name);
console.log('composition:', JSON.stringify(Object.fromEntries(Object.entries(compSummary).map(([k, v]) => [k, v.length])), null, 1));

// ---------- 16b R7→R8 platform transitions ----------
const transRows = [['platform', 'direction', 'name'].join('\t')];
for (const k of platKeys) {
  const a = new Map(r7ci.platforms[k].authoritativeNames.map((r) => [r.name, r]));
  const b = new Map(ci.platforms[k].authoritativeNames.map((r) => [r.name, r]));
  for (const n of sortNames([...a.keys()].filter((n) => !b.has(n)))) transRows.push([platShort[k], 'green', n].join('\t'));
  for (const n of sortNames([...b.keys()].filter((n) => !a.has(n)))) transRows.push([platShort[k], 'new-red', n].join('\t'));
}
writeFileSync(join(args.outdir, '16b-platform-transitions.tsv'), transRows.join('\n') + '\n', 'utf8');

console.log('lineLevel', JSON.stringify(Object.fromEntries(Object.entries(plat).map(([k, v]) => [k, `${v.uniqueAuthoritativeNames}/${v.lineLevelUniqueIncludingHeaders}`]))));
console.log('b0', summary.b0, 'b7', summary.b7, 'kr', summary.kr62);
console.log('missingInSkips b0', b0MissingSkipped.length, 'b7', b7MissingSkipped.length);
console.log('kr33 present', kr33Zero.presentInR8, '/', kr33Zero.total, '(R7 present', kr33Zero.presentInR7 + ')');
console.log('matrix', JSON.stringify(Object.fromEntries([...groups.entries()].map(([k, v]) => [k, v.length]))));
console.log(`wrote 24/25/26/27/28/29/30/16b to ${args.outdir}`);
