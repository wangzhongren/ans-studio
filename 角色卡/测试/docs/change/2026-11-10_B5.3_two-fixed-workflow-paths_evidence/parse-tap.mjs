// B5.3 helper: parse a TAP file -> {tests,pass,fail,cancelled,skipped,todo,failing:[names]}
// Usage: node parse-tap.mjs <file.tap> [out.json]
import fs from "node:fs/promises";
const [tapFile, outFile] = process.argv.slice(2);
const text = await fs.readFile(tapFile, "utf8");
const summary = { tests: null, pass: null, fail: null, cancelled: null, skipped: null, todo: null };
const failing = [];
for (const line of text.split(/\r?\n/)) {
  const s = /^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/.exec(line);
  if (s !== null) summary[s[1]] = Number(s[2]);
  const m = /^not ok \d+ - (.*)$/.exec(line);
  if (m !== null) failing.push(m[1].replace(/\\#/g, "#"));
}
const result = { ...summary, failing };
const json = JSON.stringify(result, null, 2) + "\n";
if (outFile) await fs.writeFile(outFile, json, "utf8");
console.log(json);
