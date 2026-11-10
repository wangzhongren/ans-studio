// B5.3 helper: convert flat "<file> :: <name>" known-red ref to failing-names.json shape.
// Usage: node ref-flat-to-json.mjs <ref-flat.txt> <out.json>
import fs from "node:fs/promises";
const [refFile, outFile] = process.argv.slice(2);
const lines = (await fs.readFile(refFile, "utf8")).split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
const map = {};
for (const line of lines) {
  const idx = line.indexOf(" :: ");
  if (idx < 0) throw new Error(`bad ref line: ${line}`);
  const file = line.slice(0, idx);
  const name = line.slice(idx + 4);
  (map[file] ??= []).push(name);
}
await fs.writeFile(outFile, JSON.stringify(map, null, 2) + "\n", "utf8");
console.log(`wrote ${outFile}: ${lines.length} entries across ${Object.keys(map).length} files`);
