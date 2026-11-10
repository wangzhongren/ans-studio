// B2.1 read-only suite failure-name extractor (scratch tool stored with evidence).
// Usage: node extract-failures.mjs <tapFile> <outJson>
// Extracts "not ok <n> - <name>" test names from a TAP file (escaped \# unescaped).
import fs from "node:fs/promises";

const [tapPath, outPath] = process.argv.slice(2);
const text = await fs.readFile(tapPath, "utf8");
const names = [];
for (const line of text.split(/\r?\n/)) {
  const m = /^not ok \d+ - (.*)$/.exec(line);
  if (m) names.push(m[1].replace(/\\#/g, "#"));
}
await fs.writeFile(outPath, JSON.stringify(names, null, 2), "utf8");
console.log(JSON.stringify({ tap: tapPath, failing: names.length }));
