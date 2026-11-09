#!/usr/bin/env node
// D1 evidence tool: deterministic raw-byte SHA-256 manifest + aggregate over a directory set.
// Usage:
//   node hash-tree.mjs tree <root> <dir1,dir2,...> <outManifest>
//   node hash-tree.mjs files <root> <path1,path2,...> <outManifest>
// Manifest lines: "<sha256hex>  <relpath>" (LF), sorted by UTF-8 byte order of relpath.
// Aggregate definition (matches worker records): sort paths by UTF-8 bytes, then
// SHA-256 over the concatenation of, per entry, Buffer(relpath,'utf8') + 0x00 + Buffer(sha256hex,'ascii').
// Prints JSON summary to stdout: {files, bytes, aggregate}.
import { createHash } from "node:crypto";
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const mode = process.argv[2];
const root = process.argv[3];
const arg = process.argv[4];
const outManifest = process.argv[5];
if (!mode || !root || !arg || !outManifest) {
  console.error("usage: hash-tree.mjs tree|files <root> <list> <outManifest>");
  process.exit(2);
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function walk(absDir, acc) {
  for (const name of readdirSync(absDir)) {
    const abs = join(absDir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, acc);
    else if (st.isFile()) acc.push(abs);
  }
}

const absFiles = [];
if (mode === "tree") {
  for (const d of arg.split(",")) walk(join(root, d), absFiles);
} else if (mode === "files") {
  for (const f of arg.split(",")) absFiles.push(join(root, f));
} else {
  console.error("unknown mode", mode);
  process.exit(2);
}

const entries = absFiles.map((abs) => {
  const buf = readFileSync(abs);
  return { rel: relative(root, abs).split("\\").join("/"), sha: sha256(buf), bytes: buf.length };
});

entries.sort((a, b) => Buffer.compare(Buffer.from(a.rel, "utf8"), Buffer.from(b.rel, "utf8")));

let total = 0;
const h = createHash("sha256");
for (const e of entries) {
  total += e.bytes;
  h.update(Buffer.from(e.rel, "utf8"));
  h.update(Buffer.from([0]));
  h.update(Buffer.from(e.sha, "ascii"));
}

writeFileSync(outManifest, entries.map((e) => `${e.sha}  ${e.rel}`).join("\n") + "\n", "utf8");
console.log(JSON.stringify({ mode, root, files: entries.length, bytes: total, aggregate: h.digest("hex"), manifest: outManifest }));
