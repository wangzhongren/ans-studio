import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, "../../../../../..");
const text = fs.readFileSync(path.join(root, "app/desktop/session.ts"), "utf8").replace(/\r\n/g, "\n");
const lines = text.split("\n");
const START = 1984, END = 3064;
const blocks = [
  ["P", 1986, 1993], ["B1", 1994, 2060], ["B2", 2061, 2134], ["B3", 2136, 2193],
  ["B4", 2195, 2301], ["B5", 2303, 2542], ["B6", 2543, 2949], ["B7", 2950, 2980], ["B8", 2982, 3063],
];
const blockOf = (line) => blocks.find(([, s, e]) => line >= s && line <= e)?.[0];
const decls = [];
for (let ln = START; ln <= END; ln += 1) {
  const line = lines[ln - 1];
  const m = /^\s{4,}(?:const|let(?:\s+[A-Za-z_$][\w$]*)?)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/.exec(line);
  if (m) decls.push({ name: m[1], line: ln, block: blockOf(ln), text: line.trim().slice(0, 120) });
  const m2 = /^\s{4,}(?:const|let)\s+([A-Za-z_$][\w$]*)\s*:/.exec(line);
  if (m2 && !m) decls.push({ name: m2[1], line: ln, block: blockOf(ln), text: line.trim().slice(0, 120) });
}
const blockNames = blocks.map(b => b[0]);
for (const d of decls) {
  const later = new Set();
  for (let ln = d.line + 1; ln <= END; ln += 1) {
    const re = new RegExp(`(^|[^\w$.])${d.name.replace(/\$/g, "\$")}(?![\w$])`);
    if (re.test(lines[ln - 1])) later.add(blockOf(ln));
  }
  d.usedLaterIn = [...later];
}
const cross = decls.filter(d => d.usedLaterIn.some(b => b !== d.block) || d.usedLaterIn.includes("P"));
console.log("=== declarations used across block boundaries ===");
for (const d of cross) console.log(`${d.block.padEnd(2)} line ${d.line}: ${d.name}  -> later ${d.usedLaterIn.join(",")}   | ${d.text}`);
console.log("total decls", decls.length, "cross", cross.length);
