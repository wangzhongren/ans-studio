// B7 第三段：合并分段 TAP 统计与失败名清单（B0 tools-merge-segments.mjs 同口径）。
// 用法：node merge-segments.mjs <full-dir>
// 读取 <full-dir>/segments-summary.txt 与 <full-dir>/segment-<seg>.tap：
//   - 逐段抽取末尾汇总（tests/pass/fail/cancelled/skipped/todo/duration_ms）与失败名（✖ / not ok）；
//   - 合并输出 <full-dir>/merged.json 与 <full-dir>/failnames.txt。
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node merge-segments.mjs <full-dir>");
  process.exit(2);
}

const summaryLines = readFileSync(join(dir, "segments-summary.txt"), "utf8").split(/\r?\n/);
const segments = [];
for (const line of summaryLines) {
  const m = line.match(/^(gates|claude-adapter|codex-adapter|pi-adapter|roles|runtime-core|装配|项目管理|桌面UI|桌面应用|门禁引擎|测试|测试-hangsplit|编排|编排-git-trunk-store) exit=(\d+) dur=(\d+)s/);
  if (m) segments.push({ segment: m[1], exit: Number(m[2]), durationSec: Number(m[3]) });
}

function lastSummary(text, key) {
  const re = new RegExp(`^ℹ ${key} (\\d+)$`, "gm");
  let value = null;
  let m;
  while ((m = re.exec(text)) !== null) value = Number(m[1]);
  return value;
}

function failureNames(text) {
  const names = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\r$/, "");
    const spec = line.match(/^✖ (.*?) \(\d+(?:\.\d+)?ms\)$/);
    if (spec && spec[1].trim() !== "failing tests:") names.add(spec[1].trim());
    const tap = line.match(/^not ok \d+ - (.*)$/);
    if (tap) names.add(tap[1].replace(/\s+# (SKIP|TODO).*$/i, "").trim());
  }
  return [...names].sort();
}

const result = { generatedAt: new Date().toISOString(), segments: [], totals: {}, failureNames: [] };
const allFails = new Set();
const missing = [];
for (const seg of segments) {
  let text = "";
  try {
    text = readFileSync(join(dir, `segment-${seg.segment}.tap`), "utf8");
  } catch {
    missing.push(seg.segment);
  }
  const counts = {
    tests: lastSummary(text, "tests"),
    pass: lastSummary(text, "pass"),
    fail: lastSummary(text, "fail"),
    cancelled: lastSummary(text, "cancelled"),
    skipped: lastSummary(text, "skipped"),
    todo: lastSummary(text, "todo"),
    durationMs: lastSummary(text, "duration_ms"),
  };
  const fails = failureNames(text);
  for (const f of fails) allFails.add(f);
  result.segments.push({ ...seg, counts, failCount: fails.length, hasSummary: counts.tests !== null, failNames: fails });
}
for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
  const vals = result.segments.map((s) => s.counts[key]).filter((v) => v !== null);
  result.totals[key] = vals.reduce((a, b) => a + b, 0);
}
result.totals.segments = result.segments.length;
result.totals.segmentsMissingSummary = result.segments.filter((s) => !s.hasSummary).map((s) => s.segment);
result.failureNames = [...allFails].sort();
result.missingTapFiles = missing;
writeFileSync(join(dir, "merged.json"), JSON.stringify(result, null, 2));
writeFileSync(join(dir, "failnames.txt"), result.failureNames.join("\n") + (result.failureNames.length ? "\n" : ""));
console.log(JSON.stringify(result.totals, null, 2));
