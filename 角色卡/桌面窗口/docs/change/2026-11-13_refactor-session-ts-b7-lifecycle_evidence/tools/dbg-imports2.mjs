import fs from "node:fs";
const text = fs.readFileSync("app/desktop/session.ts", "utf8").replace(/\r\n/g, "\n");
const starts = [];
const re = /(^|\n)[ \t]*import\b/g;
let m;
while ((m = re.exec(text)) !== null) starts.push(m.index + (m[1] ? 1 : 0));
for (const start of starts) {
  let j = start;
  for (; j < text.length; j += 1) {
    const ch = text[j];
    if (ch === '"') { j += 1; while (j < text.length && text[j] !== '"') { if (text[j] === "\\") j += 1; j += 1; } continue; }
    if (ch === ";") break;
  }
  const stmt = text.slice(start, j + 1);
  const sm = /from\s+"([^"]+)"/.exec(stmt);
  if (!sm || !sm[1].endsWith("model/runtime.ts")) continue;
  const clause = stmt.slice(0, stmt.indexOf("from"));
  const braced = /\{([\s\S]*?)\}/.exec(clause);
  const names = braced ? braced[1].split(",").map((t) => t.trim()).filter(Boolean) : [];
  console.log("stmt chars", stmt.length, "count", names.length,
    "CustomerInputRequest", names.includes("CustomerInputRequest"),
    "DispatchTaskFn", names.includes("DispatchTaskFn"),
    "PromptOptions", names.includes("PromptOptions"));
  console.log(JSON.stringify(names.slice(0, 12)));
}
