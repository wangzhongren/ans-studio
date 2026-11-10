// Combine before (116 files) + new-test results into the after dataset (119 files).
import fs from "node:fs/promises";
const [, , beforeDir, newDir, outDir] = process.argv;
await fs.mkdir(outDir, { recursive: true });
const beforeTsv = (await fs.readFile(`${beforeDir}/results.tsv`, "utf8")).trimEnd().split(/\r?\n/);
const newTsv = (await fs.readFile(`${newDir}/results.tsv`, "utf8")).trimEnd().split(/\r?\n/);
const rows = [...beforeTsv.slice(0, 1), ...beforeTsv.slice(1), ...newTsv.slice(1)];
await fs.writeFile(`${outDir}/results.tsv`, rows.join("\n") + "\n", "utf8");
const beforeNames = JSON.parse(await fs.readFile(`${beforeDir}/failing-names.json`, "utf8"));
const newNames = JSON.parse(await fs.readFile(`${newDir}/failing-names.json`, "utf8"));
await fs.writeFile(`${outDir}/failing-names.json`, JSON.stringify({ ...beforeNames, ...newNames }, null, 2), "utf8");
const beforeTotals = JSON.parse(await fs.readFile(`${beforeDir}/totals.json`, "utf8"));
const newTotals = JSON.parse(await fs.readFile(`${newDir}/totals.json`, "utf8"));
const totals = {};
for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo", "hangs"]) {
  totals[key] = (beforeTotals[key] ?? 0) + (newTotals[key] ?? 0);
}
await fs.writeFile(`${outDir}/totals.json`, JSON.stringify(totals, null, 2), "utf8");
console.log(JSON.stringify(totals));
