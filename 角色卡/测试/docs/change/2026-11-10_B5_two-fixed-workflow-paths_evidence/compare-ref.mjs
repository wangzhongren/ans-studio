// B5 known-red comparison helper (scratch). Usage:
//   node compare-ref.mjs <failing-names.json> <path-prefix> <ref-names.txt> <out.txt>
import fs from "node:fs/promises";

const [jsonFile, prefix, refFile, outFile] = process.argv.slice(2);
const failing = JSON.parse(await fs.readFile(jsonFile, "utf8"));
const actual = [];
for (const [file, names] of Object.entries(failing)) {
  if (!file.split("\\").join("/").startsWith(prefix)) continue;
  for (const name of names) actual.push(name);
}
const ref = (await fs.readFile(refFile, "utf8")).split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "");
const count = (list) => {
  const map = new Map();
  for (const item of list) map.set(item, (map.get(item) ?? 0) + 1);
  return map;
};
const actualCount = count(actual);
const refCount = count(ref);
const added = [];
const removed = [];
for (const [name, n] of actualCount) {
  const r = refCount.get(name) ?? 0;
  if (n > r) added.push(`${name} (actual ${n} > ref ${r})`);
}
for (const [name, n] of refCount) {
  const a = actualCount.get(name) ?? 0;
  if (a < n) removed.push(`${name} (ref ${n} > actual ${a})`);
}
const lines = [
  `prefix: ${prefix}`,
  `actual failing entries: ${actual.length}`,
  `ref entries: ${ref.length}`,
  `new failure names (not in ref): ${added.length}`,
  ...added.map((item) => `+ ${item}`),
  `ref names missing now: ${removed.length}`,
  ...removed.map((item) => `- ${item}`),
  "",
];
const text = lines.join("\n");
console.log(text);
if (outFile !== undefined) await fs.writeFile(outFile, text, "utf8");
