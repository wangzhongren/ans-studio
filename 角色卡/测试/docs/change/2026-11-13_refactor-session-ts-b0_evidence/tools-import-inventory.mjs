// B0 基线：全仓导入方清单（静态 import/export-from 解析，按路径解析到 app/desktop/session.ts）。
// 运行：node tools-import-inventory.mjs <repo-root>
// 输出：逐文件计数（生产/测试分类）、总文件数、总出现次数、符号直方图。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep, dirname } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const SCAN_DIRS = ["app", "src", "test", "bin"];
const TARGET = resolve(root, "app/desktop/session.ts");

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (/\.(ts|mts|cts|mjs|js)$/.test(name) || name.endsWith(".retired")) yield full;
  }
}

const importRe = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:([^;]*?)\s+from\s+)?["']([^"']+\.ts)["'];?/g;
const files = [];
const symbolHistogram = new Map();
let totalOccurrences = 0;

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(root, dir))) {
    const text = readFileSync(file, "utf8");
    const statements = [];
    let m;
    importRe.lastIndex = 0;
    while ((m = importRe.exec(text)) !== null) {
      const [, , clause = "", spec] = m;
      if (!spec.endsWith("session.ts")) continue;
      const resolved = resolve(dirname(file), spec);
      if (resolved !== TARGET) continue;
      const symbols = [];
      const braced = clause.match(/\{([\s\S]*?)\}/);
      if (braced) {
        for (const part of braced[1].split(",")) {
          const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0];
          if (name) symbols.push(name);
        }
      }
      const ns = clause.match(/\*\s+as\s+([A-Za-z0-9_$]+)/);
      if (ns) symbols.push(`* as ${ns[1]}`);
      const def = clause.match(/^([A-Za-z0-9_$]+)\s*(,|$)/);
      if (def && !braced && !ns) symbols.push(def[1]);
      for (const s of symbols) symbolHistogram.set(s, (symbolHistogram.get(s) ?? 0) + 1);
      statements.push({ typeOnly: Boolean(m[1]), symbols, spec });
      totalOccurrences += 1;
    }
    if (statements.length > 0) {
      const rel = relative(root, file).split(sep).join("/");
      const category = rel.endsWith(".retired")
        ? "retired"
        : rel.startsWith("test/")
          ? (rel.endsWith(".test.ts") ? "test" : "probe")
          : "production";
      files.push({ file: rel, category, imports: statements.length, statements });
    }
  }
}

files.sort((a, b) => a.file.localeCompare(b.file));
const byCat = (c) => files.filter((f) => f.category === c);
const prod = byCat("production");
const tests = byCat("test");
const probes = byCat("probe");
const retired = byCat("retired");
const sumSymbols = (list) => list.reduce((n, f) => n + f.statements.reduce((m, s) => m + s.symbols.length, 0), 0);
const histogram = [...symbolHistogram.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
console.log(JSON.stringify({
  target: "app/desktop/session.ts",
  filesTotal: files.length,
  occurrencesTotal: totalOccurrences,
  productionFiles: prod.length,
  testFiles: tests.length,
  probeFiles: probes.length,
  retiredFiles: retired.length,
  testImportStatements: tests.reduce((n, f) => n + f.imports, 0),
  testSymbolOccurrences: sumSymbols(tests),
  productionSymbolOccurrences: sumSymbols(prod),
  production: prod,
  tests,
  probes,
  retired,
  symbolHistogram: histogram,
}, null, 2));
