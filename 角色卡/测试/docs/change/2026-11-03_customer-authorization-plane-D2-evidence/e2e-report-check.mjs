import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const report = fs.readFileSync(path.join(dir, "report.txt"), "utf8").split(/\r?\n/);
const pngs = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
const refNames = [];
for (const line of report) {
  if (!/^SHOT_/.test(line)) continue;
  const value = line.slice(line.indexOf("=") + 1).trim();
  const name = value.split(/[\\/]/).pop();
  if (name) refNames.push(name);
}
const uniqueRefs = [...new Set(refNames)];
const unreferenced = pngs.filter((p) => !uniqueRefs.includes(p));
const missingRefs = uniqueRefs.filter((r) => !pngs.includes(r));
console.log(`report_lines=${report.length} (including trailing=${report[report.length - 1] === "" ? "yes" : "no"})`);
console.log(`shot_lines=${refNames.length} unique_refs=${uniqueRefs.length} pngs=${pngs.length}`);
console.log(`unreferenced=${unreferenced.length ? unreferenced.join(",") : "<none>"}`);
console.log(`missing_refs=${missingRefs.length ? missingRefs.join(",") : "<none>"}`);
const last = report.filter(Boolean).slice(-4);
console.log("tail=" + last.join(" | "));
