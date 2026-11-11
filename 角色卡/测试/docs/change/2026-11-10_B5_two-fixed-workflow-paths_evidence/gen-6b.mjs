// Generate §6b markdown rows from D1 domain results (scratch).
import fs from "node:fs/promises";
const [, , resultsFile, failingFile] = process.argv;
const lines = (await fs.readFile(resultsFile, "utf8")).trimEnd().split(/\r?\n/);
const header = lines[0].split("\t");
const rows = lines.slice(1).map((line) => {
  const cells = line.split("\t");
  const row = {};
  header.forEach((key, index) => { row[key] = cells[index]; });
  return row;
});
const failing = JSON.parse(await fs.readFile(failingFile, "utf8"));
const sum = (subset, key) => subset.reduce((acc, row) => acc + Number(row[key] || 0), 0);
function domain(label, prefixes) {
  const subset = rows.filter((row) => prefixes.some((prefix) => row.file.split("\\").join("/").startsWith(prefix)));
  const names = subset.flatMap((row) => failing[row.file] ?? []);
  const watchdogs = subset.filter((row) => row.signal === "watchdog").map((row) => row.file).join(", ");
  console.log(`| ${label}（${subset.length} 文件） | ${sum(subset, "tests")} / ${sum(subset, "pass")} / ${sum(subset, "fail")} / ${sum(subset, "cancelled")} / ${sum(subset, "skipped")} | 同左（同候选只读复跑） | 失败名 ${names.length} 条${watchdogs !== "" ? `；watchdog: ${watchdogs}` : ""} |`);
}
domain("test/编排", ["test/编排/"]);
domain("test/桌面应用", ["test/桌面应用/"]);
domain("test/门禁引擎", ["test/门禁引擎/"]);
domain("test/runtime-core", ["test/runtime-core/"]);
domain("test/roles+项目管理+gates", ["test/roles/", "test/项目管理/", "test/gates/"]);
