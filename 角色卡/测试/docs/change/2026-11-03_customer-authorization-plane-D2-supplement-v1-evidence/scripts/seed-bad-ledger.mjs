#!/usr/bin/env node
// D2-supplement evidence helper (test role; not a product/test candidate).
// Seeds a temporary project ledger with bad lines and rotations for the bad-ledger scenario:
//   .2 (oldest) : valid d-1 created(forever) + revoked d-1
//   .1          : truncated JSON (bad) + valid d-3 created(forever) + revoked d-3
//   current     : not-json (bad) + version:2 event (parser error)
// Expected ledgerErrors after Service replay: 2 bad JSON lines + 1 parser error = 3.
// Usage: node seed-bad-ledger.mjs <project-root>
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("USAGE: node seed-bad-ledger.mjs <project-root>");
  process.exit(2);
}
const dir = path.join(root, ".ans", "state");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, "customer-directives.jsonl");

const created = (id, seq, command, sessionId, createdAt) =>
  JSON.stringify({
    version: 1,
    kind: "directive.created",
    id,
    seq,
    target: "approval",
    action: { kind: "allow", resource: { type: "shell", command, cwd: root } },
    scope: {},
    until: "forever",
    rawText: `@审批 允许 shell "${command}" forever`,
    sessionId,
    createdAt,
    createdBy: "customer",
    source: "desktop-input",
  });
const revoked = (id, seq, at) =>
  JSON.stringify({ version: 1, kind: "directive.revoked", id, seq, at, by: "customer" });

fs.writeFileSync(
  `${file}.2`,
  [created("d-1", 1, "npm run build", "seeded-old-run", "2026-11-03T09:00:00.000Z"), revoked("d-1", 2, "2026-11-03T09:00:01.000Z")].join("\n") + "\n",
  "utf8",
);
fs.writeFileSync(
  `${file}.1`,
  [
    '{"version":1,"kind":"directive.created","id":"d-3"',
    created("d-3", 3, "npm run test", "seeded-old-run", "2026-11-03T09:00:02.000Z"),
    revoked("d-3", 4, "2026-11-03T09:00:03.000Z"),
  ].join("\n") + "\n",
  "utf8",
);
fs.writeFileSync(
  file,
  [
    "not-json-at-all",
    '{"version":2,"kind":"directive.created","id":"d-3","seq":5}',
  ].join("\n") + "\n",
  "utf8",
);
console.log(`SEEDED ${file}`);
for (const name of [`${file}.2`, `${file}.1`, file]) {
  const text = fs.readFileSync(name, "utf8");
  console.log(`  ${path.basename(name)} lines=${text.split(/\r?\n/).filter((line) => line.trim() !== "").length} bytes=${Buffer.byteLength(text)}`);
}
