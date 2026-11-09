// D1 v1.1 candidate verification after the 编排 fix (2026-11-10).
// Expected values: 9 files from original batch records (unchanged) + 2 files from the W1 fix record §9.5.
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const candidates = [
  ["src/common/编排/doc-format-specs.ts", "B1/W1-fix", "3c0c9c63ba99ad09adb379858595618b833ff20406429d46bc8160514e49bf86"],
  ["test/编排/doc-format-specs.test.ts", "B1/W1-fix", "54e5b01ab47c59f091ec2c9617b5209b6e3b254fe2aa757ec211455166aa2e94"],
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

const rows = [];
for (const [path, batch, expected] of candidates) {
  const buf = readFileSync(path);
  const actual = sha256(buf);
  rows.push({ path, batch, bytes: statSync(path).size, actual, expected, eq: actual === expected });
}
rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
const aggregate = sha256(Buffer.concat(rows.map((r) => Buffer.from(`${r.path}\0${r.actual}`, "utf8"))));
console.log("path\tbatch\tbytes\tsha256\texpected\tequal");
for (const r of rows) console.log(`${r.path}\t${r.batch}\t${r.bytes}\t${r.actual}\t${r.expected}\t${r.eq ? "YES" : "NO"}`);
console.log(`\n11/11 equal (9 original batch + 2 W1-fix §9.5): ${rows.every((r) => r.eq)}`);
console.log(`\ncombination aggregate (v1.1): ${aggregate}`);

// B1 two-file aggregate check against W1 fix record value f6d4475c…
const b1 = rows.filter((r) => r.batch === "B1/W1-fix").sort((a, b) => (a.path < b.path ? -1 : 1));
const b1agg = sha256(Buffer.concat(b1.map((r) => Buffer.from(`${r.path}\0${r.actual}`, "utf8"))));
console.log(`B1 two-file aggregate: ${b1agg} (expected f6d4475ce676c55ebf462d144a58ae38ba0477a983c98ca1b1a4b266a3b3bb0f) ${b1agg === "f6d4475ce676c55ebf462d144a58ae38ba0477a983c98ca1b1a4b266a3b3bb0f" ? "MATCH" : "MISMATCH"}`);
