// B5.3 helper: build adjusted corpus from isolated re-runs of transient-anomaly files.
// Usage: node build-adjusted.mjs <corpus results.tsv> <corpus failing-names.json> <replacement.json> <outDir>
// replacement.json shape: [{ "file": "<repo-relative path>", "tap": "<path to isolated TAP>" }]
import fs from "node:fs/promises";
import path from "node:path";
const [resultsTsv, failingJson, replacementJson, outDir] = process.argv.slice(2);
const replacements = JSON.parse(await fs.readFile(replacementJson, "utf8"));
const parseTap = (text) => {
  const s = { tests: null, pass: null, fail: null, cancelled: null, skipped: null, todo: null };
  const failing = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/.exec(line);
    if (m !== null) s[m[1]] = Number(m[2]);
    const n = /^not ok \d+ - (.*)$/.exec(line);
    if (n !== null) failing.push(n[1].replace(/\\#/g, "#"));
  }
  return { ...s, failing };
};
const rep = new Map();
for (const r of replacements) rep.set(r.file.split("\\").join("/"), parseTap(await fs.readFile(r.tap, "utf8")));
const rows = (await fs.readFile(resultsTsv, "utf8")).trim().split(/\r?\n/).slice(1);
const failing = JSON.parse(await fs.readFile(failingJson, "utf8"));
const totals = { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0, hangs: 0 };
const adjustedFailing = {};
const notes = [];
for (const row of rows) {
  const c = row.split("\t");
  const file = c[0];
  const r = rep.get(file.split("\\").join("/"));
  if (r) {
    notes.push(`substituted: ${file} corpus(tests=${c[4]} pass=${c[5]} fail=${c[6]} cancelled=${c[7]} skip=${c[8]} signal=${c[2] || "none"}) -> isolated(tests=${r.tests} pass=${r.pass} fail=${r.fail} cancelled=${r.cancelled} skip=${r.skipped})`);
    totals.tests += r.tests ?? 0;
    totals.pass += r.pass ?? 0;
    totals.fail += r.fail ?? 0;
    totals.cancelled += r.cancelled ?? 0;
    totals.skipped += r.skipped ?? 0;
    totals.todo += r.todo ?? 0;
    if (r.failing.length > 0) adjustedFailing[file] = r.failing;
  } else {
    totals.tests += +(c[4] || 0);
    totals.pass += +(c[5] || 0);
    totals.fail += +(c[6] || 0);
    totals.cancelled += +(c[7] || 0);
    totals.skipped += +(c[8] || 0);
    totals.todo += +(c[9] || 0);
    if (c[2] === "watchdog") totals.hangs += 1;
    if ((failing[file] ?? []).length > 0) adjustedFailing[file] = failing[file];
  }
}
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "adjusted-totals.json"), JSON.stringify(totals, null, 2) + "\n", "utf8");
await fs.writeFile(path.join(outDir, "adjusted-failing-names.json"), JSON.stringify(adjustedFailing, null, 2) + "\n", "utf8");
const entryCount = Object.values(adjustedFailing).reduce((a, v) => a + v.length, 0);
const text = [
  `adjusted totals: tests ${totals.tests} / pass ${totals.pass} / fail ${totals.fail} / cancelled ${totals.cancelled} / skip ${totals.skipped} / hangs ${totals.hangs}`,
  `adjusted not-ok entries: ${entryCount}`,
  ...notes,
  "",
].join("\n");
await fs.writeFile(path.join(outDir, "adjusted-summary.txt"), text, "utf8");
console.log(text);
