// B5.3 helper: compare per-file skip counts between B5.2 reference corpus and B5.3 corpus.
// Usage: node compare-skip.mjs <b52 results.tsv> <b53 results.tsv>
import fs from "node:fs/promises";
const [refTsv, curTsv] = process.argv.slice(2);
const read = async (f) => {
  const map = new Map();
  const lines = (await fs.readFile(f, "utf8")).trim().split(/\r?\n/).slice(1);
  for (const l of lines) { const c = l.split("\t"); map.set(c[0], { tests: c[4], pass: c[5], fail: c[6], cancelled: c[7], skipped: +(c[8] || 0), signal: c[2] }); }
  return map;
};
const ref = await read(refTsv);
const cur = await read(curTsv);
let refTotal = 0, curTotal = 0;
const increases = [];
for (const [file, r] of ref) {
  const c = cur.get(file);
  if (!c) { increases.push(`${file}: MISSING in current run`); continue; }
  refTotal += r.skipped; curTotal += c.skipped;
  if (c.skipped > r.skipped) increases.push(`${file}: skipped ${r.skipped} -> ${c.skipped}`);
}
const text = [
  `ref skip total (B5.2 after corpus): ${refTotal}`,
  `current skip total (B5.3 corpus): ${curTotal}`,
  `files with skip increase: ${increases.length}`,
  ...increases.map((x) => `+ ${x}`),
  "",
].join("\n");
console.log(text);
