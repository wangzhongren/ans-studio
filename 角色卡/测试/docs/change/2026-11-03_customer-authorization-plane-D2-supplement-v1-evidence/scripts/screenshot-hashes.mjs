#!/usr/bin/env node
// D2-supplement evidence helper (test role; not a product/test candidate).
// Inventory all PNG screenshots under the supplement evidence directory:
// relative path, bytes, PNG dimensions (IHDR), SHA-256. No image library.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.resolve(HERE, "..");
const ROOTS = ["main", "restart", "bad-ledger"];
const pngs = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) pngs.push(full);
  }
}
for (const root of ROOTS) {
  const dir = path.join(BASE, root);
  if (fs.existsSync(dir)) walk(dir);
}
pngs.sort();
const rows = [];
const bad = [];
for (const file of pngs) {
  const buffer = fs.readFileSync(file);
  let width = null;
  let height = null;
  if (buffer.length >= 24 && buffer.toString("ascii", 12, 16) === "IHDR") {
    width = buffer.readUInt32BE(16);
    height = buffer.readUInt32BE(20);
  }
  const sha = createHash("sha256").update(buffer).digest("hex");
  const rel = path.relative(BASE, file).split(path.sep).join("/");
  rows.push(`OK\t${rel}\t${buffer.length}\t${width}x${height}\t${sha}`);
  if (width !== 1360 || height !== 860) bad.push(rel);
}
const header = [
  "# D2-supplement screenshot inventory",
  `# generated: ${new Date().toISOString()}`,
  "# columns: status\tpath(bytes relative)\tbytes\tdimensions\tsha256",
  `# count: ${rows.length}`,
  `# expected window: 1360x860 (BrowserWindow useContentSize)`,
  `# non-1360x860: ${bad.length}`,
  "",
];
const text = [...header, ...rows].join("\n") + "\n";
fs.writeFileSync(path.join(BASE, "10-screenshot-hashes.txt"), text, "utf8");
console.log(text);
console.log(`RESULT screenshots=${rows.length} non_1360x860=${bad.length}`);
if (bad.length || rows.length === 0) process.exitCode = 1;
