// B7 第三段：全量失败名 vs B0 冻结基线（191 名）逐名 diff。
// 用法：node diff-full-failnames.mjs <current-merged.json> <b0-merged.json> <out-json>
// 输出：added（本次有、基线无；附本次段归属与 fail/cancelled 语境）、removed（基线有、本次无；附基线段归属）、
//       both（交集计数）、totals 对照。
import { readFileSync, writeFileSync } from "node:fs";

const [curPath, basePath, outPath] = process.argv.slice(2);
if (!curPath || !basePath) {
  console.error("usage: node diff-full-failnames.mjs <current-merged.json> <b0-merged.json> [out-json]");
  process.exit(2);
}
const cur = JSON.parse(readFileSync(curPath, "utf8"));
const base = JSON.parse(readFileSync(basePath, "utf8"));

function segmentMap(merged) {
  const map = new Map();
  for (const s of merged.segments) {
    for (const n of s.failNames) {
      if (!map.has(n)) map.set(n, []);
      map.get(n).push(s.segment);
    }
  }
  return map;
}
const curMap = segmentMap(cur);
const baseMap = segmentMap(base);
const curNames = new Set(cur.failureNames);
const baseNames = new Set(base.failureNames);

const added = [...curNames].filter((n) => !baseNames.has(n)).sort()
  .map((n) => ({ name: n, segments: curMap.get(n) ?? [] }));
const removed = [...baseNames].filter((n) => !curNames.has(n)).sort()
  .map((n) => ({ name: n, segments: baseMap.get(n) ?? [] }));
const both = [...curNames].filter((n) => baseNames.has(n)).sort();

const result = {
  generatedAt: new Date().toISOString(),
  current: { totals: cur.totals, failureNamesCount: curNames.size },
  baseline: { totals: base.totals, failureNamesCount: baseNames.size },
  addedCount: added.length,
  removedCount: removed.length,
  bothCount: both.length,
  added,
  removed,
  both,
};
const text = JSON.stringify(result, null, 2);
if (outPath) writeFileSync(outPath, text + "\n");
console.log(JSON.stringify({ addedCount: added.length, removedCount: removed.length, bothCount: both.length, addedNames: added.map((a) => a.name), removedNames: removed.map((r) => r.name) }, null, 2));
