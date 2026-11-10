// B5 failing-name diff helper (scratch). Usage:
//   node diff-failures.mjs <before.json> <after.json> [outDir]
// JSON files are { "<file>": ["<test name>", ...] } as produced by run-tests.mjs.
import fs from "node:fs/promises";
import path from "node:path";

const [beforeFile, afterFile, outDirArg] = process.argv.slice(2);
const before = JSON.parse(await fs.readFile(beforeFile, "utf8"));
const after = JSON.parse(await fs.readFile(afterFile, "utf8"));
const key = (file, name) => `${file} :: ${name}`;
const beforeSet = new Set();
const afterSet = new Set();
for (const [file, names] of Object.entries(before)) for (const name of names) beforeSet.add(key(file, name));
for (const [file, names] of Object.entries(after)) for (const name of names) afterSet.add(key(file, name));
const added = [...afterSet].filter((item) => !beforeSet.has(item)).sort();
const removed = [...beforeSet].filter((item) => !afterSet.has(item)).sort();
const lines = [
  `before entries: ${beforeSet.size}`,
  `after entries: ${afterSet.size}`,
  `added (after only): ${added.length}`,
  ...added.map((item) => `+ ${item}`),
  `removed (before only): ${removed.length}`,
  ...removed.map((item) => `- ${item}`),
  "",
];
const text = lines.join("\n");
console.log(text);
if (outDirArg !== undefined) {
  await fs.mkdir(outDirArg, { recursive: true });
  await fs.writeFile(path.join(outDirArg, "failure-names-diff.txt"), text, "utf8");
  const flat = (set) => [...set].sort().join("\n") + "\n";
  await fs.writeFile(path.join(outDirArg, "before-failures-flat.txt"), flat(beforeSet), "utf8");
  await fs.writeFile(path.join(outDirArg, "after-failures-flat.txt"), flat(afterSet), "utf8");
}
