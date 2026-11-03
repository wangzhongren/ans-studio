#!/usr/bin/env node
// D2-supplement evidence helper (test role; not a product/test candidate).
// Hash the evidence files (scripts, logs, reports, ledger/audit copies).
// Screenshots are inventoried separately in 10-screenshot-hashes.txt.
// Transient runtime data (userData/, project fixture trees) is excluded; the ledger/audit
// raw copies at the scenario root are included.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.resolve(HERE, "..");
const EXCLUDE_DIRS = new Set(["userData", "project", "docs", "角色卡", "node_modules"]);
const INCLUDE_EXT = new Set([".log", ".json", ".jsonl", ".txt", ".mjs", ".sh"]);
const files = [];
function walk(dir, depth = 0) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(full, depth + 1);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!INCLUDE_EXT.has(ext)) continue;
    files.push(full);
  }
}
walk(BASE);
// Exclude this generated inventory itself and its runner logs to avoid self-reference churn.
const self = path.join(BASE, "11-evidence-hashes.txt");
const filtered = files.filter((file) => file !== self);
filtered.sort();
const rows = [];
for (const file of filtered) {
  const buffer = fs.readFileSync(file);
  const sha = createHash("sha256").update(buffer).digest("hex");
  let lines = "";
  const ext = path.extname(file).toLowerCase();
  if (ext === ".log" || ext === ".jsonl" || ext === ".txt" || ext === ".json") {
    const text = buffer.toString("utf8");
    const parts = text.split(/\r?\n/);
    lines = String(text.endsWith("\n") ? parts.length - 1 : parts.length);
  }
  const rel = path.relative(BASE, file).split(path.sep).join("/");
  rows.push(`${rel}\t${buffer.length}\t${lines}\t${sha}`);
}
const header = [
  "# D2-supplement evidence hashes",
  `# generated: ${new Date().toISOString()}`,
  "# columns: path(relative)\tbytes\tlines(empty=non-text)\tsha256",
  "# excludes: screenshots (see 10-screenshot-hashes.txt), userData/, project fixture trees, this file",
  `# count: ${rows.length}`,
  "",
];
const text = [...header, ...rows].join("\n") + "\n";
fs.writeFileSync(path.join(BASE, "11-evidence-hashes.txt"), text, "utf8");
console.log(text);
console.log(`RESULT files=${rows.length}`);
