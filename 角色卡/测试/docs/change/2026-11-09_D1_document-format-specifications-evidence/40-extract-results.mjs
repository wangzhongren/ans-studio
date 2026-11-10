// Extract deterministic counts + failure/skip title sets from node --test output (spec or TAP).
// Usage: node 40-extract-results.mjs <file> [<file> ...]
// Output: per file: counts and sorted unique failure/skip titles (JSON-ish).
import { readFileSync } from "node:fs";

const normalizeTitle = (t) =>
  t
    .replace(/ \((?:[0-9.]+|>?\s*[0-9.]+)ms\)$/, "")
    .replace(/\s*\(skipped\)$/, "")
    .replace(/\s+/g, " ")
    .trim();

for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const result = { file, kind: "unknown", counts: {}, failures: [], skips: [] };

  // TAP-style counts: "# tests 6"
  const tapCounts = { tests: null, pass: null, fail: null, cancelled: null, skipped: null, todo: null };
  for (const key of Object.keys(tapCounts)) {
    const re = new RegExp(`^# ${key} (\\d+)$`, "m");
    const m = text.match(re);
    if (m) tapCounts[key] = Number(m[1]);
  }
  // Spec-style counts: last summary block with "ℹ tests N"
  const specCounts = { tests: null, pass: null, fail: null, cancelled: null, skipped: null, todo: null };
  // Find the last index of "ℹ tests" and parse following ℹ lines.
  const specIdx = lines.map((l, i) => (l.startsWith("ℹ tests ") ? i : -1)).filter((i) => i >= 0);
  if (specIdx.length > 0) {
    const start = specIdx[specIdx.length - 1];
    for (let i = start; i < Math.min(start + 12, lines.length); i++) {
      const m = lines[i].match(/^ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)$/);
      if (m) specCounts[m[1]] = Number(m[2]);
    }
  }

  if (tapCounts.tests !== null) {
    result.kind = "tap";
    result.counts = tapCounts;
    for (const line of lines) {
      const m = line.match(/^not ok \d+ - (.*?)(?: # (SKIP|TODO).*)?$/);
      if (m) {
        if (m[2] === "SKIP") result.skips.push(normalizeTitle(m[1]));
        else if (m[2] !== "TODO") result.failures.push(normalizeTitle(m[1]));
      }
    }
  } else if (specCounts.tests !== null) {
    result.kind = "spec";
    result.counts = specCounts;
    for (const line of lines) {
      if (line.startsWith("✖ ") && line !== "✖ failing tests:") {
        const title = normalizeTitle(line.slice(2));
        if (title && !/^failing tests:$/.test(title)) result.failures.push(title);
      }
      if (/^﹣ /.test(line)) result.skips.push(normalizeTitle(line.slice(2)));
    }
  }
  result.failures = [...new Set(result.failures)].sort();
  result.skips = [...new Set(result.skips)].sort();
  console.log(JSON.stringify(result));
}
