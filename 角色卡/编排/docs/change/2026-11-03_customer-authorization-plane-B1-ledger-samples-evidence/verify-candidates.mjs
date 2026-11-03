#!/usr/bin/env node
// B1 ledger-samples evidence helper (orchestration role; evidence-only, not a product/test candidate).
//
// Verifies that the current candidate write set under src/app/test is still the exact
// 54-file list frozen in the D2 evidence 09-candidate-identity-fix.txt (134 lines /
// SHA-256 49cfc38d6ee6eaa4fab4b69b9a368e40acb19517d645b5314c57e481041a307a).
//
// Usage (from the worktree):
//   node "角色卡/编排/docs/change/2026-11-03_customer-authorization-plane-B1-ledger-samples-evidence/verify-candidates.mjs" <outName>
//
// Exit code 0 only when candidate files = expected files = 54 and unexpected/missing/mismatch = 0.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../..");
const EXPECTED_FILE = path.join(
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
for (const line of fs.readFileSync(EXPECTED_FILE, "utf8").split(/\r?\n/)) {
  if (!line.startsWith("OK\t")) continue;
  const parts = line.split("\t");
  if (parts.length < 5) continue;
  expected.push({ owner: parts[1], file: parts[2], blob: parts[3], sha: parts[4] });
}

const files = execFileSync(
  "git",
  ["-c", "core.quotepath=false", "ls-files", "-z", "-m", "-o", "--exclude-standard", "--", "src", "app", "test"],
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
  const exp = expected.find((item) => item.file === file);
  if (exp === undefined) {
    unexpected.push(file);
    rows.push(`UNEXPECTED\t-\t${file}\t${blob}\t${sha}`);
    continue;
  }
  const blobOk = exp.blob.startsWith(blob) || blob.startsWith(exp.blob);
  const shaOk = exp.sha === sha;
  if (!blobOk || !shaOk) mismatch.push({ file, exp, blob, sha });
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

const lines = [
  "# B1 ledger-samples candidate identity (expected list = D2 09-candidate-identity-fix.txt)",
  `# generated: ${new Date().toISOString()}`,
  `# cwd: ${REPO}`,
  `# HEAD: ${git(["rev-parse", "HEAD"])}`,
  "# command: git -c core.quotepath=false ls-files -z -m -o --exclude-standard -- src app test; git hash-object; SHA-256",
  `# expected list: ${path.relative(REPO, EXPECTED_FILE).split(path.sep).join("/")}`,
  `# expected list lines: ${fs.readFileSync(EXPECTED_FILE, "utf8").split(/\r?\n/).length - 1} (file total incl. trailing newline count)`,
  `# expected list SHA-256: ${createHash("sha256").update(fs.readFileSync(EXPECTED_FILE)).digest("hex")}`,
  `# candidate files: ${files.length}`,
  `# expected files: ${expected.length}`,
  `# unexpected: ${unexpected.length}`,
  `# missing: ${missing.length}`,
  `# mismatches: ${mismatch.length}`,
  "",
  "# expected by owner:",
];
const byOwner = new Map();
for (const item of expected) byOwner.set(item.owner, (byOwner.get(item.owner) ?? 0) + 1);
for (const [owner, count] of byOwner) lines.push(`#   ${owner}: ${count}`);
lines.push("", ...rows, "");

if (missing.length > 0) {
  lines.push("MISSING:", ...missing.map((item) => `  ${item.owner}\t${item.file}`), "");
}
if (mismatch.length > 0) {
  lines.push(
    "MISMATCHES:",
    ...mismatch.map(
      (item) =>
        `  ${item.file}\texpected blob=${item.exp.blob} sha=${item.exp.sha}\tactual blob=${item.blob} sha=${item.sha}`,
    ),
    "",
  );
}
if (unexpected.length > 0) {
  lines.push("UNEXPECTED (outside frozen write set):", ...unexpected.map((file) => `  ${file}`), "");
}
lines.push("STAGED (git diff --cached --name-only):", git(["diff", "--cached", "--name-only"]));
lines.push("", "STATUS (git status --porcelain -- src app test):", status);

const outName = process.argv[2] ?? "00b-candidate-identity-before.txt";
const text = `${lines.join("\n")}\n`;
fs.writeFileSync(path.join(HERE, outName), text, "utf8");
process.stdout.write(text);
console.log(
  `RESULT candidates=${files.length} expected=${expected.length} unexpected=${unexpected.length} missing=${missing.length} mismatch=${mismatch.length}`,
);
if (files.length !== 54 || unexpected.length > 0 || missing.length > 0 || mismatch.length > 0) {
  process.exitCode = 1;
}
