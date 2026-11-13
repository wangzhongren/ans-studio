import fs from "node:fs";
const text = fs.readFileSync("app/desktop/session.ts", "utf8").replace(/\r\n/g, "\n");
const starts = [];
const re = /(^|\n)[ \t]*import\b/g;
let m;
while ((m = re.exec(text)) !== null) starts.push(m.index + (m[1] ? 1 : 0));
console.log("starts", starts.length);
for (const start of starts) {
  let j = start;
  for (; j < text.length; j += 1) {
    const ch = text[j];
    if (ch === '"') { j += 1; while (j < text.length && text[j] !== '"') { if (text[j] === "\\") j += 1; j += 1; } continue; }
    if (ch === ";") break;
  }
  const stmt = text.slice(start, j + 1);
  if (stmt.includes("config-loader") || stmt.includes("download-request")) {
    console.log("FOUND stmt", JSON.stringify(stmt.slice(0, 160)), "len", stmt.length);
    const spec = /from\s+"([^"]+)"/.exec(stmt);
    console.log("spec", spec && spec[1]);
  }
}
