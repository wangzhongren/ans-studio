// B0 evidence helper: verify that the T3 command's glob/argument set expands to
// exactly the 407-file list in 11-t3-file-list.txt (find output excluding
// test/pi-adapter/write-sequencing.test.ts). No test execution; static check.
import fs from "node:fs";
import path from "node:path";

const dir = import.meta.dirname;
const list = fs
  .readFileSync(path.join(dir, "11-t3-file-list.txt"), "utf8")
  .split(/\r?\n/)
  .filter(Boolean);
const norm = (p) => p.replace(/\\/g, "/");
const expected = new Set(list.map(norm));

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
const all = new Set();
for (const p of patterns) {
  for (const f of fs.globSync(p)) all.add(norm(f));
}
// The T3 command passed these pi-adapter files explicitly (39), excluding
// the known-hang write-sequencing.test.ts.
const piGlob = fs
  .globSync("test/pi-adapter/*.test.ts")
  .map(norm)
  .filter((f) => !f.endsWith("/write-sequencing.test.ts"));
for (const f of piGlob) all.add(f);

const missing = [...expected].filter((f) => !all.has(f));
const extra = [...all].filter((f) => !expected.has(f));
console.log(
  `expected=${expected.size} expanded=${all.size} piExplicit=${piGlob.length} missing=${missing.length} extra=${extra.length}`,
);
if (missing.length) console.log("MISSING:\n" + missing.join("\n"));
if (extra.length) console.log("EXTRA:\n" + extra.join("\n"));
