// Build evidence index: for every file in the evidence dir (recursively), emit byte size, sha256, path.
// Usage: node 90-evidence-index.mjs <dir> <outFile>
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const out = process.argv[3];
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const rows = [];
const walk = (dir) => {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.isFile()) {
      const buf = readFileSync(p);
      rows.push({ p: p.replaceAll("\\", "/"), size: statSync(p).size, hash: sha256(buf) });
    }
  }
};
walk(root);
rows.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
const lines = rows.map((r) => `${r.hash}\t${r.size}\t${r.p}`);
writeFileSync(out, lines.join("\n") + "\n");
const digest = sha256(readFileSync(out));
console.log(`files: ${rows.length}`);
console.log(`index sha256: ${digest}`);
