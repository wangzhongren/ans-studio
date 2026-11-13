import fs from "node:fs";
const text = fs.readFileSync("app/desktop/session.ts", "utf8").replace(/\r\n/g, "\n");
function parseImports(source) {
  const out = [];
  const starts = [];
  const re = /(^|\n)[ \t]*import\b/g;
  let m;
  while ((m = re.exec(source)) !== null) starts.push(m.index + (m[1] ? 1 : 0));
  for (const start of starts) {
    let j = start;
    for (; j < source.length; j += 1) {
      const ch = source[j];
      if (ch === '"') { j += 1; while (j < source.length && source[j] !== '"') { if (source[j] === "\\") j += 1; j += 1; } continue; }
      if (ch === ";") break;
    }
    const stmt = source.slice(start, j + 1);
    const specMatch = /from\s+"([^"]+)"/.exec(stmt);
    if (!specMatch) continue;
    const clause = stmt.slice(0, stmt.indexOf("from"));
    const names = new Set();
    const braced = /\{([\s\S]*?)\}/.exec(clause);
    if (braced) for (const part of braced[1].split(",")) {
      const t = part.trim().replace(/^type\s+/, "");
      if (!t) continue;
      const asMatch = /\bas\s+([A-Za-z_$][\w$]*)/.exec(t);
      names.add(asMatch ? asMatch[1] : t.replace(/^[A-Za-z_$][\w$]*\s+/, "").trim());
    }
    const defaultMatch = /^\s*import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,|from)/.exec(stmt);
    if (defaultMatch && defaultMatch[1] !== "type") names.add(defaultMatch[1]);
    out.push({ stmt: stmt.slice(0, 60), spec: specMatch[1], names: [...names] });
  }
  return out;
}
const imps = parseImports(text);
console.log("count", imps.length);
for (const i of imps) console.log(JSON.stringify(i.spec), i.names.length, i.names.includes("LiveSession"), JSON.stringify(i.stmt.slice(0, 50)));
