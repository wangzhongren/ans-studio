// T1（Batch 5）T3 覆盖校验：run-t3.sh 的 glob/参数集合展开后必须与
// 19-t3-file-list.txt 完全一致（静态检查，不执行测试）。
import fs from "node:fs";
import path from "node:path";

const dir = import.meta.dirname;
const root = path.resolve(dir, "../../../../..");
const norm = (p) => p.replace(/\\/g, "/");
const expected = new Set(
  fs
    .readFileSync(path.join(dir, "19-t3-file-list.txt"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(norm),
);

const patterns = [
  "test/claude-adapter/*.test.ts",
  "test/codex-adapter/*.test.ts",
  "test/runtime-core/**/*.test.ts",
  "test/桌面UI/**/*.test.ts",
  "test/桌面应用/**/*.test.ts",
  "test/测试/**/*.test.ts",
  "test/编排/**/*.test.ts",
  "test/装配/**/*.test.ts",
  "test/门禁引擎/**/*.test.ts",
  "test/项目管理/shared/**/*.test.ts",
];
const expanded = new Set();
for (const pattern of patterns) {
  for (const abs of fs.globSync(pattern, { cwd: root })) expanded.add(norm(abs));
}
const piList = fs
  .readFileSync(path.join(dir, "pi-adapter-explicit-files.txt"), "utf8")
  .split(/\r?\n/)
  .filter(Boolean);
for (const file of piList) expanded.add(`test/pi-adapter/${file}`);

const missing = [...expected].filter((rel) => !expanded.has(rel));
const extra = [...expanded].filter((rel) => !expected.has(rel));
console.log(
  `expected=${expected.size} expanded=${expanded.size} piExplicit=${piList.length} missing=${missing.length} extra=${extra.length}`,
);
if (missing.length) console.log("MISSING:\n" + missing.join("\n"));
if (extra.length) console.log("EXTRA:\n" + extra.join("\n"));
process.exitCode = missing.length === 0 && extra.length === 0 ? 0 : 1;
