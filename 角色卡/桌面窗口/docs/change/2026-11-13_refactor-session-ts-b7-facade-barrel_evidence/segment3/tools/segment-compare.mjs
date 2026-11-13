// B7 第三段：逐段对照当前全量运行与 B0 冻结基线（计数 + 失败名）。
// 用法：node segment-compare.mjs <current-merged.json> <b0-merged.json> <out-json>
import { readFileSync, writeFileSync } from "node:fs";

const [curPath, basePath, outPath] = process.argv.slice(2);
if (!curPath || !basePath) {
  console.error("usage: node segment-compare.mjs <current-merged.json> <b0-merged.json> [out-json]");
  process.exit(2);
}
const cur = JSON.parse(readFileSync(curPath, "utf8"));
const base = JSON.parse(readFileSync(basePath, "utf8"));
const baseBySeg = new Map(base.segments.map((s) => [s.segment, s]));

const rows = [];
for (const seg of cur.segments) {
  const b = baseBySeg.get(seg.segment) ?? null;
  const names = new Set(seg.failNames);
  const baseNames = new Set(b?.failNames ?? []);
  const added = [...names].filter((n) => !baseNames.has(n)).sort();
  const removed = [...baseNames].filter((n) => !names.has(n)).sort();
  const counts = {};
  for (const k of ["tests", "pass", "fail", "cancelled", "skipped"]) {
    counts[k] = { current: seg.counts[k], baseline: b?.counts[k] ?? null };
  }
  rows.push({ segment: seg.segment, exit: { current: seg.exit, baseline: b?.exit ?? null }, durationSec: { current: seg.durationSec, baseline: b?.durationSec ?? null }, counts, added, removed });
}
const result = { generatedAt: new Date().toISOString(), totals: { current: cur.totals, baseline: base.totals }, segments: rows };
const text = JSON.stringify(result, null, 2);
if (outPath) writeFileSync(outPath, text + "\n");
for (const r of rows) {
  const c = r.counts;
  console.log(`${r.segment}: tests ${c.tests.current}/${c.tests.baseline} pass ${c.pass.current}/${c.pass.baseline} fail ${c.fail.current}/${c.fail.baseline} cancelled ${c.cancelled.current}/${c.cancelled.baseline} skipped ${c.skipped.current}/${c.skipped.baseline} added=${r.added.length} removed=${r.removed.length}`);
}
