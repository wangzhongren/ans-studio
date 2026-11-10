// D1 candidate verification: per-file raw SHA-256 vs batch records, combined aggregate, per-batch aggregates.
// Read-only over candidate files; writes nothing except stdout.
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const candidates = [
  // path, batch, expected sha256 (from batch record W{1..5} "after" values)
  ["src/common/编排/doc-format-specs.ts", "B1/W1", "f141e4ba3314f3a67673f83fa70daf8a80ac5fca7270b214eb30aeeba1008871"],
  ["test/编排/doc-format-specs.test.ts", "B1/W1", "f9abe8f35fbe920cf14c53c4fb9f2e9df5017f03741200bf2b2050753e1395c4"],
  ["src/model/runtime.ts", "B2/W2", "89e5fbc97b3a3f6994cf858696750fe6d3acfbe45ed1d0cf571b8a35037f4959"],
  ["src/provider/runtime/tools.ts", "B2/W2", "b07c3f805ab9eb88f13d4a6d4098b001d101e04b59b6162f57eda1e47a06ba79"],
  ["src/provider/runtime/schema.ts", "B2/W2", "fd3ee646e07e6d6beb3ba006a5f3079de5fb92c2fc08909dc6c9f4322e7a13a6"],
  ["test/runtime-core/doc-format-specs-pin.test.ts", "B2/W2", "f05471e38ca83f626856352ce85d914ec0ff85a1035c111eadc5e43659592003"],
  ["test/门禁引擎/doc-format-specs-pin.test.ts", "B3/W3", "45b1ce34ed2d06f460264b252d2d702bebd78d55bf155c2922af1b39f520d369"],
  ["src/pipeline/orchestration/run-role.ts", "B4a/W4a", "d754d767298de61b956b29e6fe8873640d53359765c9dfce45abc548f6003258"],
  ["app/desktop/session.ts", "B4b/W4b", "df5bf7b0315410791e4c58a6c3e3caaac6f1d4312ff4751957d454e7a569fe14"],
  ["test/桌面应用/session.test.ts", "B4b/W4b", "23bc19a723ef6c3c0c19259fee58179e779578ed6fbd726e6b094f1d8ef9085e"],
  ["test/测试/doc-format-all-roles.test.ts", "B5/W5", "d992b164fcd0e36d8eea0646d0736a3b5da08e16922d6e248d828a0de543b2e5"],
];

const batchAggregateExpected = {
  "B1/W1": "d1ad15629cc2d6cc371763798ee07be74c1c39331470d472573fa69f9c67b4f6",
  "B2/W2": "16a5fadf3da013d8536177dd762630f654952ffdf11a2c090cfa78d1c606e043",
  "B3/W3": "2e9fb006258d2401ca6d603785a77cfcc72296c67330b1d97d5b88b388d5d765",
  "B4b/W4b": "266f526da1226ac1eed56394a618e5d4abd68f1efbf99c7e309d0cd9402a4219",
  "B5/W5": "6b1e48919697d0922de9c9b7cd081dec9ea69c5dc8d7b3548d875fbf330d2caf",
};

const rows = [];
let allEqual = true;
for (const [path, batch, expected] of candidates) {
  const buf = readFileSync(path);
  const actual = sha256(buf);
  const st = statSync(path);
  const eq = actual === expected;
  if (!eq) allEqual = false;
  rows.push({ path, batch, bytes: st.size, actual, expected, eq });
}

rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
const concat = Buffer.concat(rows.map((r) => Buffer.from(`${r.path}\0${r.actual}`, "utf8")));
const aggregate = sha256(concat);

console.log("per-file raw SHA-256 vs batch records (11 candidates):");
console.log("path\tbatch\tbytes\tsha256\texpected\tequal");
for (const r of rows) console.log(`${r.path}\t${r.batch}\t${r.bytes}\t${r.actual}\t${r.expected}\t${r.eq ? "YES" : "NO"}`);
console.log(`\n11/11 equal: ${allEqual}`);
console.log(`\ncombined aggregate (sorted "path\\0sha256" concatenated, SHA-256): ${aggregate}`);

console.log("\nper-batch aggregate cross-check (batch records):");
for (const [batch, expected] of Object.entries(batchAggregateExpected)) {
  const subset = rows.filter((r) => r.batch === batch).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const dig = sha256(Buffer.concat(subset.map((r) => Buffer.from(`${r.path}\0${r.actual}`, "utf8"))));
  console.log(`${batch}\t${dig}\texpected ${expected}\t${dig === expected ? "MATCH" : "MISMATCH"}`);
}
