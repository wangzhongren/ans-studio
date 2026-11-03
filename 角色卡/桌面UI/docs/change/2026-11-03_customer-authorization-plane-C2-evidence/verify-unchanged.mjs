// C2 evidence helper: verify A1/A2/A3/B1 and C1 candidate files were not modified by C2.
// Reads the C1 evidence hash lists (written at C1 completion) and recomputes `git hash-object`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");
const C1 = path.join(REPO, "角色卡", "桌面窗口", "docs", "change", "2026-11-03_customer-authorization-plane-C1-evidence");

function parsePairs(file) {
  const text = readFileSync(file, "utf8");
  const pairs = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-f]{40})\s+(.+)$/.exec(line.trim());
    if (match) pairs.push({ hash: match[1], file: match[2] });
  }
  return pairs;
}

function currentHash(file) {
  return execFileSync("git", ["hash-object", file], { cwd: REPO, encoding: "utf8" }).trim();
}

let failures = 0;
for (const [label, file] of [
  ["A1/A2/A3/B1", path.join(C1, "06-a1-a2-a3-b1-hashes.txt")],
  ["C1", path.join(C1, "05-candidate-hashes.txt")],
]) {
  const pairs = parsePairs(file);
  console.log(`# ${label}: ${pairs.length} files`);
  for (const pair of pairs) {
    const actual = currentHash(pair.file);
    const ok = actual === pair.hash;
    if (!ok) failures += 1;
    console.log(`${ok ? "OK" : "MISMATCH"} ${pair.hash} ${actual} ${pair.file}`);
  }
}
console.log(`UNCHANGED_FAILURES=${failures}`);
process.exit(failures === 0 ? 0 : 1);
