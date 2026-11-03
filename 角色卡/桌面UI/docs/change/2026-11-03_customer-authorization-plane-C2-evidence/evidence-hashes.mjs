// C2 evidence helper: line counts + SHA-256 for all evidence files (excluding Electron user-data
// and this generated index itself).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "13-evidence-hashes.txt");
const SKIP_DIR = path.join(HERE, "probe-run", "user-data");

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (full === SKIP_DIR || full.startsWith(SKIP_DIR + path.sep)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const files = walk(HERE)
  .filter((file) => file !== OUT)
  .sort();
const lines = ["# C2 evidence hashes (excludes probe-run/user-data and this index; lines<TAB>sha256<TAB>path)"];
for (const file of files) {
  const bytes = readFileSync(file);
  const text = bytes.toString("utf8");
  const lineCount = text.length === 0 ? 0 : text.split(/\r?\n/).length - (text.endsWith("\n") ? 1 : 0);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  lines.push(`${lineCount}\t${sha256}\t${path.relative(HERE, file).replaceAll("\\", "/")}`);
}
writeFileSync(OUT, lines.join("\n") + "\n");
console.log(lines.join("\n"));
