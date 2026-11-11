// Aggregate D1 domain per-file results by path prefix (scratch).
import fs from "node:fs/promises";
const [, , resultsFile] = process.argv;
const lines = (await fs.readFile(resultsFile, "utf8")).trimEnd().split(/\r?\n/);
const header = lines[0].split("\t");
const rows = lines.slice(1).map((line) => {
  const cells = line.split("\t");
  const row = {};
  header.forEach((key, index) => { row[key] = cells[index]; });
  return row;
});
const prefixes = [
  ["test/编排/", "编排"],
  ["test/桌面应用/", "桌面应用"],
  ["test/门禁引擎/", "门禁引擎"],
  ["test/runtime-core/", "runtime-core"],
  ["test/roles/", "roles"],
  ["test/项目管理/", "项目管理"],
  ["test/gates/", "gates"],
];
for (const [prefix, label] of prefixes) {
  const subset = rows.filter((row) => row.file.split("\\").join("/").startsWith(prefix));
  const sum = (key) => subset.reduce((acc, row) => acc + Number(row[key] || 0), 0);
  const watchdogs = subset.filter((row) => row.signal === "watchdog").length;
  console.log(`${label}\tfiles=${subset.length}\ttests=${sum("tests")}\tpass=${sum("pass")}\tfail=${sum("fail")}\tcancelled=${sum("cancelled")}\tskip=${sum("skipped")}\twatchdog=${watchdogs}`);
}
const total = rows.length;
const sum = (key) => rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);
console.log(`TOTAL\tfiles=${total}\ttests=${sum("tests")}\tpass=${sum("pass")}\tfail=${sum("fail")}\tcancelled=${sum("cancelled")}\tskip=${sum("skipped")}\twatchdog=${rows.filter((r) => r.signal === "watchdog").length}`);
