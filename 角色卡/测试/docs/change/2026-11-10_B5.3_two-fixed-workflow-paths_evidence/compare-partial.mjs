// B5.3 helper: compare per-file TAP summaries of a completed/partial corpus against B5.2 ref corpus.
// Usage: node compare-partial.mjs <outDir> <fileList.txt> <b52 results.tsv>
import fs from "node:fs";
import path from "node:path";
const [outDir, listFile, refTsv] = process.argv.slice(2);
const list = fs.readFileSync(listFile, "utf8").split(/\r?\n/).filter(Boolean);
const sanitize = (f) => f.replace(/[\\/:*?"<>|]/g, "_") + ".tap";
const tapBySource = new Map(list.map((f) => [sanitize(f), f]));
const ref = new Map();
for (const line of fs.readFileSync(refTsv, "utf8").trim().split(/\r?\n/).slice(1)) {
  const c = line.split("\t");
  ref.set(c[0], { tests: c[4], pass: c[5], fail: c[6], cancelled: c[7], skipped: c[8], signal: c[2] });
}
const done = fs.readdirSync(outDir).filter((f) => f.endsWith(".tap"));
const diffs = [];
let notok = 0;
for (const tap of done) {
  const rel = tapBySource.get(tap);
  if (rel === undefined) { diffs.push(`UNMAPPED TAP: ${tap}`); continue; }
  const text = fs.readFileSync(path.join(outDir, tap), "utf8");
  const cur = { tests: "", pass: "", fail: "", cancelled: "", skipped: "" };
  for (const line of text.split(/\r?\n/)) {
    const m = /^# (tests|pass|fail|cancelled|skipped) (\d+)$/.exec(line);
    if (m !== null) cur[m[1]] = m[2];
  }
  notok += (text.match(/^not ok \d+ - /gm) ?? []).length;
  const r = ref.get(rel);
  if (r === undefined) { diffs.push(`NEW FILE (not in B5.2 corpus): ${rel}`); continue; }
  for (const k of ["tests", "pass", "fail", "cancelled", "skipped"]) {
    if (String(cur[k]) !== String(r[k])) diffs.push(`${rel} :: ${k} ref=${r[k] || "∅"} cur=${cur[k] || "∅"}`);
  }
  if (r.signal === "watchdog") diffs.push(`${rel} :: ref was watchdog; current completed tests=${cur.tests || "∅"}`);
}
console.log(`compared ${done.length}/${list.length} files; not-ok so far: ${notok}; summary diffs: ${diffs.length}`);
for (const d of diffs) console.log(d);
