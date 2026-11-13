// B0：合并分段 TAP 统计与失败名清单。
// 用法：node tools-merge-segments.mjs <evidence-dir>
// 读取 14-segments-summary.txt 与 14-segment-<seg>.tap：
//   - 逐段抽取末尾汇总（tests/pass/fail/cancelled/skipped/todo/duration_ms）与失败名（✖ / not ok）；
//   - 合并输出 15-full-tap-before-merged.json 与 15-full-tap-before-failnames.txt。
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node tools-merge-segments.mjs <evidence-dir>");
  process.exit(2);
}

const summaryLines = readFileSync(join(dir, "14-segments-summary.txt"), "utf8").split(/\r?\n/);
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
let crashed = [];
for (const seg of segments) {
  let text = "";
  try {
    text = readFileSync(join(dir, `14-segment-${seg.segment}.tap`), "utf8");
  } catch {
    crashed.push(seg.segment);
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
result.crashedSegments = crashed;
console.log(JSON.stringify(result, null, 2));
const fs = await import("node:fs");
fs.writeFileSync(join(dir, "15-full-tap-before-merged.json"), JSON.stringify(result, null, 2));
fs.writeFileSync(join(dir, "15-full-tap-before-failnames.txt"), result.failureNames.join("\n") + (result.failureNames.length ? "\n" : ""));
