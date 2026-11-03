#!/usr/bin/env node
// D2 evidence helper (test role): verify the 53 D1 candidates are unchanged and that the
// only additional src/app/test path is the D2 test-only probe. Not a product/test candidate.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
const lines = fs.readFileSync(D1, "utf8").split(/\r?\n/);
const expected = [];
for (const line of lines) {
  if (!line.startsWith("OK\t")) continue;
  const parts = line.split("\t");
  if (parts.length < 5) continue;
  expected.push({ owner: parts[1], file: parts[2], blob: parts[3], sha: parts[4] });
}
let mismatches = 0;
let missing = 0;
for (const item of expected) {
  const abs = path.join(REPO, item.file);
  if (!fs.existsSync(abs)) {
    missing += 1;
    console.log(`MISSING\t${item.owner}\t${item.file}`);
    continue;
  }
  const blob = execFileSync("git", ["hash-object", "--", item.file], { cwd: REPO, encoding: "utf8" }).trim();
  const sha = createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  if (blob !== item.blob || sha !== item.sha) {
    mismatches += 1;
    console.log(`MISMATCH\t${item.owner}\t${item.file}\texpected=${item.blob}/${item.sha}\tactual=${blob}/${sha}`);
  }
}
const status = execFileSync("git", ["-c", "core.quotepath=false", "status", "--porcelain", "--", "src", "app", "test"], {
  cwd: REPO,
  encoding: "utf8",
}).replace(/\s+$/, "");
const statusPaths = status === "" ? [] : status.split(/\r?\n/).map((line) => line.slice(3));
const expectedSet = new Set(expected.map((item) => item.file));
const isExpectedDir = (p) => p.endsWith("/") && expected.some((item) => item.file.startsWith(p));
const extras = statusPaths.filter((p) => !expectedSet.has(p) && !isExpectedDir(p));
const extraDirs = [];
console.log(`HEAD\t${execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim()}`);
console.log(`D1_CANDIDATES\t${expected.length}`);
console.log(`UNCHANGED\t${expected.length - mismatches - missing}`);
console.log(`MISMATCHES\t${mismatches}`);
console.log(`MISSING\t${missing}`);
console.log(`STATUS_ENTRIES\t${statusPaths.length}`);
console.log(`EXTRA_PATHS\t${JSON.stringify([...extras, ...extraDirs])}`);
console.log(`STAGED_EMPTY\t${execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: REPO, encoding: "utf8" }).trim() === ""}`);
