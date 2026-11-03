#!/usr/bin/env node
// D2-supplement evidence helper (test role; not a product/test candidate).
// Recompute the frozen candidate identity against 09-candidate-identity-fix.txt:
//  - same file set from `git ls-files -m -o --exclude-standard -- src app test` (54)
//  - per-file SHA-256 (Node crypto; reads bytes directly, does not call git)
//  - per-file git blob hash (recorded; the frozen D2 list is the comparison basis)
//  - HEAD / staged / status closure
// Usage: node verify-candidates.mjs <output-file-name>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..", "..");
const FROZEN = path.join(
  REPO,
  "角色卡",
  "测试",
  "docs",
  "change",
  "2026-11-03_customer-authorization-plane-D2-evidence",
  "09-candidate-identity-fix.txt",
);

function git(args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}
function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(path.join(REPO, file))).digest("hex");
}

const expected = [];
for (const line of fs.readFileSync(FROZEN, "utf8").split(/\r?\n/)) {
  if (!line.startsWith("OK\t")) continue;
  const parts = line.split("\t");
  if (parts.length < 5) continue;
  expected.push({ owner: parts[1], file: parts[2], blob: parts[3], sha: parts[4] });
}

const files = execFileSync(
  "git",
  ["ls-files", "-z", "-m", "-o", "--exclude-standard", "--", "src", "app", "test"],
  { cwd: REPO, encoding: "utf8" },
)
  .split("\u0000")
  .filter(Boolean)
  .sort();

const rows = [];
const unexpected = [];
const missing = [];
const mismatch = [];
const seen = new Set();
for (const file of files) {
  seen.add(file);
  const blob = git(["hash-object", "--", file]);
  const sha = sha256(file);
  const exp = expected.find((e) => e.file === file);
  if (!exp) {
    unexpected.push(file);
    rows.push(`UNEXPECTED\t-\t${file}\t${blob}\t${sha}`);
    continue;
  }
  const blobOk = blob === exp.blob;
  const shaOk = sha === exp.sha;
  if (!blobOk || !shaOk) mismatch.push({ file, exp, blob, sha, blobOk, shaOk });
  rows.push(`${blobOk && shaOk ? "OK" : "MISMATCH"}\t${exp.owner}\t${file}\t${blob}\t${sha}`);
}
for (const exp of expected) {
  if (!seen.has(exp.file)) missing.push(exp);
}

const status = execFileSync(
  "git",
  ["-c", "core.quotepath=false", "status", "--porcelain", "--", "src", "app", "test"],
  { cwd: REPO, encoding: "utf8" },
).replace(/\s+$/, "");

const header = [
  "# D2-supplement candidate identity and write-set closure",
  `# generated: ${new Date().toISOString()}`,
  `# cwd: ${REPO}`,
  `# HEAD: ${git(["rev-parse", "HEAD"])}`,
  "# command: git ls-files -m -o --exclude-standard -- src app test; git hash-object; sha256sum (Node crypto)",
  `# frozen reference: 角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-evidence/09-candidate-identity-fix.txt`,
  `# candidate files: ${files.length}`,
  `# expected files: ${expected.length}`,
  `# unexpected: ${unexpected.length}`,
  `# missing: ${missing.length}`,
  `# mismatches: ${mismatch.length}`,
  "",
];

const tail = [];
if (missing.length) tail.push("MISSING:", ...missing.map((m) => `  ${m.owner}\t${m.file}`));
if (mismatch.length) tail.push(
  "MISMATCHES:",
  ...mismatch.map(
    (m) => `  ${m.file}\texpected blob=${m.exp.blob} sha=${m.exp.sha}\tactual blob=${m.blob} sha=${m.sha}`,
  ),
);
if (unexpected.length) tail.push("UNEXPECTED (outside candidate):", ...unexpected.map((f) => `  ${f}`));
tail.push("", "STAGED (git diff --cached --name-only):", git(["diff", "--cached", "--name-only"]));
tail.push("", "STATUS (git status --porcelain -- src app test):", status);

const outName = process.argv[2] ?? "candidate-identity.txt";
const text = [...header, ...rows, "", ...tail].join("\n") + "\n";
fs.writeFileSync(path.join(HERE, "..", outName), text, "utf8");
console.log(text);
console.log(
  `RESULT candidates=${files.length} expected=${expected.length} unexpected=${unexpected.length} missing=${missing.length} mismatch=${mismatch.length}`,
);
if (files.length !== 54 || expected.length !== 54 || unexpected.length || missing.length || mismatch.length) {
  process.exitCode = 1;
}
