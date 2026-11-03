#!/usr/bin/env node
// D2 evidence helper (test role): SHA-256 index for committed-to-evidence files.
// Excludes transient Electron userData/cache trees and generated fixture projects.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..", "..", "..");
const rel = (p) => path.relative(REPO, p).replace(/\\/g, "/");

const files = [];
const add = (p) => {
  if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push(p);
};
for (const name of fs.readdirSync(HERE)) {
  if (name === "08-evidence-hashes.txt") continue;
  add(path.join(HERE, name));
}
for (const name of fs.readdirSync(path.join(HERE, "e2e-out"))) {
  if (name.endsWith(".png") || name === "report.txt" || name === "restart-pause-probe.mjs") {
    add(path.join(HERE, "e2e-out", name));
  }
}
for (const name of fs.readdirSync(path.join(HERE, "probe-run-2"))) {
  if (name.endsWith(".png") || name === "report.json" || name === "ledger-snapshot.json") {
    add(path.join(HERE, "probe-run-2", name));
  }
}
add(path.join(HERE, "probe-run-2", "project", ".ans", "state", "customer-directives.jsonl"));
add(path.join(REPO, "test", "测试", "customer-authorization-plane-d2-probe.mjs"));
add(path.join(REPO, "角色卡", "测试", "docs", "change", "2026-11-03_customer-authorization-plane-D2-real-run.md"));

files.sort();
console.log("# D2 evidence SHA-256 index (bytes\tlines\tsha256\tpath)");
let totalBytes = 0;
for (const file of files) {
  const buffer = fs.readFileSync(file);
  totalBytes += buffer.length;
  let lines = "-";
  if (!file.endsWith(".png")) {
    lines = String((buffer.toString("utf8").match(/\n/g) || []).length);
  }
  const sha = createHash("sha256").update(buffer).digest("hex");
  console.log(`${buffer.length}\t${lines}\t${sha}\t${rel(file)}`);
}
console.log(`FILES\t${files.length}`);
console.log(`TOTAL_BYTES\t${totalBytes}`);
