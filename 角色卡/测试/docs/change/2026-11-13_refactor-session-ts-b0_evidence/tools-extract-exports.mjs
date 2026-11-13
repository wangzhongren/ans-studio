// B0 基线：抽取 app/desktop/session.ts 顶层导出符号（源码静态解析）。
// 运行：node tools-extract-exports.mjs <repo-root>
// 输出：JSON（symbols 全量、values 运行期值、types 类型），并附类别计数。
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? ".";
const source = readFileSync(join(root, "app/desktop/session.ts"), "utf8");
const lines = source.split(/\r?\n/);

const symbols = [];
const values = [];
const types = [];

for (const line of lines) {
  // export type { A, B }; 或 export type { X } from "...";
  let m = line.match(/^export type \{([^}]*)\}(?: from "[^"]*")?;?\s*$/);
  if (m) {
    for (const raw of m[1].split(",")) {
      const name = raw.trim();
      if (name) {
        symbols.push(name);
        types.push(name);
      }
    }
    continue;
  }
  // export interface|type|class|const|function NAME
  m = line.match(/^export (interface|type|class|const|function) ([A-Za-z0-9_$]+)/);
  if (m) {
    const kind = m[1];
    const name = m[2];
    symbols.push(name);
    if (kind === "class" || kind === "const" || kind === "function") values.push(name);
    else types.push(name);
    continue;
  }
  if (/^export \{$/.test(line.trim())) {
    throw new Error(`unexpected multi-line export block: ${line}`);
  }
}

const unique = [...new Set(symbols)];
const dupes = symbols.filter((s, i) => symbols.indexOf(s) !== i);
const out = {
  file: "app/desktop/session.ts",
  totalSymbols: unique.length,
  totalStatements: symbols.length,
  duplicates: [...new Set(dupes)],
  values: values.sort(),
  types: types.sort(),
  symbols: unique.sort(),
};
console.log(JSON.stringify(out, null, 2));
