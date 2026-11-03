// D2-fix evidence helper (test role): classify the T3 full-regression failures/skips
// on the current candidate and compare with the D1/B0 baseline classification.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const current = fs.readFileSync(path.join(HERE, "14-full-t3-fix.log"), "utf8").split(/\r?\n/);
const baseline = fs.readFileSync(
  path.join(HERE, "..", "2026-11-03_customer-authorization-plane-D1-evidence", "05-failure-classification.txt"),
  "utf8",
).split(/\r?\n/);

const summary = current.filter((l) => /^ℹ (tests|pass|fail|cancelled|skipped|todo|duration_ms)/.test(l));
const failing = [];
for (let i = 0; i < current.length; i += 1) {
  const m = /^test at (test.*:\d+):1$/.exec(current[i]);
  if (!m) continue;
  const nameLine = current.slice(i + 1).find((l) => l.startsWith("✖ "));
  failing.push({ where: m[1].replace(/\\/g, "/"), name: nameLine ? nameLine.replace(/^✖\s*/, "").replace(/\s*\([\d.]+ms\)$/, "") : "<unknown>" });
}
const skipName = (l) => l.replace(/^﹣\s*/, "").replace(/\s*\([\d.]+ms\).*$/, "").trim();
const skipped = current.filter((l) => l.startsWith("﹣ ")).map(skipName);

const baselineFail = new Set(
  baseline
    .filter((l) => /^\d+\s+test\//.test(l))
    .map((l) => l.replace(/^\d+\s+/, "").replace(/\s+既有 Windows symlink EPERM$/, "").trim()),
);
const baselineSkips = new Set(
  baseline.filter((l) => l.startsWith("﹣ ")).map(skipName),
);

const newFailures = failing.filter((f) => !baselineFail.has(f.where));
const missingFailures = [...baselineFail].filter((w) => !failing.some((f) => f.where === w));
const newSkips = skipped.filter((s) => !baselineSkips.has(s));
const missingSkips = [...baselineSkips].filter((s) => !skipped.includes(s));

const out = [];
out.push("D2-fix T3 failure / skip classification (current candidate)");
out.push(`generated: ${new Date().toISOString()}`);
out.push("");
out.push(...summary);
out.push("");
out.push(`--- FAILING TESTS (${failing.length}) ---`);
for (const f of failing) out.push(`✖ ${f.name}`);
out.push("", "file:line");
for (const f of failing) out.push(`test at ${f.where}`);
out.push("");
out.push(`--- SKIPPED (${skipped.length}) ---`);
for (const s of skipped) out.push(`﹣ ${s}`);
out.push("");
out.push("--- COMPARISON WITH D1/B0 ---");
out.push(`baseline_failures: ${baselineFail.size}`);
out.push(`new_failures: ${newFailures.length}${newFailures.length ? " -> " + newFailures.map((f) => f.where).join(", ") : ""}`);
out.push(`missing_baseline_failures: ${missingFailures.length}${missingFailures.length ? " -> " + missingFailures.join(", ") : ""}`);
out.push(`baseline_skips: ${baselineSkips.size}`);
out.push(`new_skips: ${newSkips.length}${newSkips.length ? " -> " + newSkips.join(", ") : ""}`);
out.push(`missing_baseline_skips: ${missingSkips.length}${missingSkips.length ? " -> " + missingSkips.join(", ") : ""}`);
out.push("");
out.push("NEW DETERMINISTIC FAILURES: " + newFailures.length);
out.push("NEW SKIPS: " + newSkips.length);
out.push("Excluded file: test/pi-adapter/write-sequencing.test.ts (same as B0/D1; not run).");

const text = out.join("\n") + "\n";
fs.writeFileSync(path.join(HERE, "15-failure-classification-fix.txt"), text, "utf8");
console.log(text);
