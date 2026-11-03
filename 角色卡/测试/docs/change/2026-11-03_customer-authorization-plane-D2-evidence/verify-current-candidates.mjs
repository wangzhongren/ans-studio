#!/usr/bin/env node
// D2-fix evidence helper (test role, not a product/test candidate).
// Verify the current candidate identity at D2-fix time:
//  - D1's 53 candidates, with the 4 C2-fix revisions applied (store/panel/Composer/UI test)
//  - D2 test-only probe (test/测试/customer-authorization-plane-d2-probe.mjs)
// Prints per-file git hash-object + SHA-256 and checks write-set closure.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");
const D1 = path.join(
  REPO,
  "角色卡",
  "测试",
  "docs",
  "change",
  "2026-11-03_customer-authorization-plane-D1-evidence",
  "07-post-run-verification.txt",
);

function git(args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}
function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(path.join(REPO, file))).digest("hex");
}

// Expected hashes for the four C2-fix revised files (from C2 fix record §2.1).
const c2fix = new Map([
  ["app/renderer/src/stores/directive-store.ts", { owner: "C2-fix", blob: "4bb498cac277485dacae8353b95c7fb12d3c5bb8", sha: "edb7eefb9c758e1200ab8701a9df9d0cf171c3603b488257a4c0ecdf1f7e29e9" }],
  ["app/renderer/src/chat/directive-panel.tsx", { owner: "C2-fix", blob: "6cc87500d1820118706b576891900b69d6340f5f", sha: "9861abd673aa432ba0595f2b1846ea34f42b91a24fefc36f4c6872d1e2db82ba" }],
  ["app/renderer/src/shell/Composer.tsx", { owner: "C2-fix", blob: "9b64fe998f18d6cab7a83accdd52fc14ec803e78", sha: "972b5779685b0943f7391b5aae2b2ca2a199dd7c1671bc06115b8b2fbb2aa1f8" }],
  ["test/桌面UI/directive-panel.test.ts", { owner: "C2-fix", blob: "e7f72fb5c49943b73e29080b9302cdf270c00300", sha: "f51e232144e2dde9707ee1e95cc7d24c61d9dbc80722c3d9464b229a2fb607c0" }],
]);

// D2 probe expected hash from the D2 record §4.1 (unchanged by C2 fix).
const probe = {
  owner: "D2-probe",
  file: "test/测试/customer-authorization-plane-d2-probe.mjs",
  blob: "a7913e87dfb08e7662b231ebb63af8c35e7d1b396c9e9664bbd45bf267a41427",
  sha: "a7913e87dfb08e7662b231ebb63af8c35e7d1b396c9e9664bbd45bf267a41427",
};
// Note: the D2 record records the probe's SHA-256 only (not its git blob hash);
// verify SHA-256 exactly and record the actual blob hash separately.

const expected = [];
for (const line of fs.readFileSync(D1, "utf8").split(/\r?\n/)) {
  if (!line.startsWith("OK\t")) continue;
  const parts = line.split("\t");
  if (parts.length < 5) continue;
  const item = { owner: parts[1], file: parts[2], blob: parts[3], sha: parts[4] };
  const repl = c2fix.get(item.file);
  if (repl) Object.assign(item, { owner: repl.owner, blob: repl.blob, sha: repl.sha });
  expected.push(item);
}
expected.push({ ...probe, sha: probe.sha, blobCheck: false });

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
  const blobOk = exp.blobCheck === false ? true : blob.startsWith(exp.blob);
  const shaOk = sha.startsWith(exp.sha);
  if (!blobOk || !shaOk) mismatch.push({ file, exp, blob, sha, blobOk, shaOk });
  rows.push(`${blobOk && shaOk ? "OK" : "MISMATCH"}\t${exp.owner}\t${file}\t${blob}\t${sha}`);
}
for (const exp of expected) {
  if (!seen.has(exp.file)) missing.push(exp);
}

const status = execFileSync("git", ["-c", "core.quotepath=false", "status", "--porcelain", "--", "src", "app", "test"], {
  cwd: REPO,
  encoding: "utf8",
}).replace(/\s+$/, "");

const header = [
  "# D2-fix candidate identity and write-set closure",
  `# generated: ${new Date().toISOString()}`,
  `# cwd: ${REPO}`,
  `# HEAD: ${git(["rev-parse", "HEAD"])}`,
  "# command: git ls-files -m -o --exclude-standard -- src app test; git hash-object; sha256sum",
  "# expected: D1 53 candidates (4 revised by C2 fix record) + D2 test-only probe",
  `# candidate files: ${files.length}`,
  `# expected files: ${expected.length}`,
  `# unexpected: ${unexpected.length}`,
  `# missing: ${missing.length}`,
  `# mismatches: ${mismatch.length}`,
  "",
];
const byOwner = new Map();
for (const exp of expected) byOwner.set(exp.owner, (byOwner.get(exp.owner) ?? 0) + 1);
const ownerLines = ["# expected by owner:", ...[...byOwner.entries()].map(([o, n]) => `#   ${o}: ${n}`), ""];

const tail = [];
if (missing.length) tail.push("MISSING:", ...missing.map((m) => `  ${m.owner}\t${m.file}`));
if (mismatch.length) tail.push("MISMATCHES:", ...mismatch.map((m) => `  ${m.file}\texpected blob=${m.exp.blob} sha=${m.exp.sha}\tactual blob=${m.blob} sha=${m.sha}`));
if (unexpected.length) tail.push("UNEXPECTED (outside write set):", ...unexpected.map((f) => `  ${f}`));
tail.push("", "STAGED (git diff --cached --name-only):", git(["diff", "--cached", "--name-only"]));
tail.push("", "STATUS (git status --porcelain -- src app test):", status);

const outName = process.argv[2] ?? "09-candidate-identity-fix.txt";
const text = [...header, ...ownerLines, ...rows, "", ...tail].join("\n") + "\n";
fs.writeFileSync(path.join(HERE, outName), text, "utf8");
console.log(text);
console.log(`RESULT candidates=${files.length} expected=${expected.length} unexpected=${unexpected.length} missing=${missing.length} mismatch=${mismatch.length}`);
if (unexpected.length || missing.length || mismatch.length) process.exitCode = 1;
