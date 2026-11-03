#!/usr/bin/env node
// D2 evidence helper (test role): screenshot manifest (name, bytes, PNG IHDR size, sha256).
// Not a product/test candidate.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = process.argv[2] ? path.resolve(process.argv[2]) : path.join(HERE, "probe-run-2");
const LABEL = process.argv[3] ?? "D2 probe";
const files = fs.readdirSync(RUN).filter((name) => name.endsWith(".png")).sort();
console.log(`# ${LABEL} screenshots: name\tbytes\twidth\theight\tsha256`);
for (const name of files) {
  const buffer = fs.readFileSync(path.join(RUN, name));
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const sha = createHash("sha256").update(buffer).digest("hex");
  console.log(`${name}\t${buffer.length}\t${width}\t${height}\t${sha}`);
}
console.log(`COUNT\t${files.length}`);
