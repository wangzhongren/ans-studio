// B5.3 helper: write sha256 of every regular file in the evidence dir (sorted), relative paths.
// Usage: node hash-evidence.mjs <evidenceDir> <outFile>
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const [dir, outFile] = process.argv.slice(2);
const rows = [];
const walk = (sub) => {
  for (const entry of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
    const rel = sub === "" ? entry.name : `${sub}/${entry.name}`;
    if (entry.isDirectory()) walk(rel);
    else if (entry.isFile()) {
      if (rel === path.basename(outFile)) continue;
      const hash = createHash("sha256").update(fs.readFileSync(path.join(dir, rel))).digest("hex");
      rows.push(`${hash}  ${rel}`);
    }
  }
};
walk("");
rows.sort();
fs.writeFileSync(outFile, rows.join("\n") + "\n", "utf8");
console.log(`wrote ${rows.length} hashes to ${outFile}`);
