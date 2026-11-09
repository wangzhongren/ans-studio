// Compute before/after failure+skip set diffs for one suite (single-file TAP/spec log or sectioned per-file log).
// Usage: node 70-diff-suite.mjs <beforeLog> <afterLog> <label>
import { readFileSync } from "node:fs";

const normalizeTitle = (t) =>
  t
    .replace(/ \([0-9.]+ms\)/g, "")
    .replace(/ \((?:[0-9.]+|>?\s*[0-9.]+)ms\)$/, "")
    .replace(/\s+/g, " ")
    .trim();

function parse(text) {
  const lines = text.split(/\r?\n/);
  if (lines.some((l) => l.startsWith("===== FILE: "))) {
    // sectioned
    const files = [];
    let cur = null;
    for (const line of lines) {
      const fm = line.match(/^===== FILE: (.+) =====$/);
      if (fm) {
        cur = { file: fm[1], body: [], exit: null };
        files.push(cur);
        continue;
      }
      const em = line.match(/^===== EXIT (-?\d+) WALL (\d+)s =====$/);
      if (em && cur) {
        cur.exit = Number(em[1]);
        cur = null;
        continue;
      }
      if (cur) cur.body.push(line);
    }
    const out = new Map();
    for (const f of files) {
      const r = parseBody(f.body);
      out.set(f.file, { exit: f.exit, counts: r.counts, failures: r.failures, skips: r.skips });
    }
    return { sectioned: true, files: out };
  }
  const r = parseBody(lines);
  return { sectioned: false, single: r };
}

function parseBody(lines) {
  const body = lines.join("\n");
  const counts = { tests: null, pass: null, fail: null, cancelled: null, skipped: null, todo: null };
  const specIdx = lines.map((l, i) => (l.startsWith("ℹ tests ") ? i : -1)).filter((i) => i >= 0);
  if (specIdx.length > 0) {
    const start = specIdx[specIdx.length - 1];
    for (let i = start; i < Math.min(start + 12, lines.length); i++) {
      const m = lines[i].match(/^ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)$/);
      if (m) counts[m[1]] = Number(m[2]);
    }
  }
  for (const key of Object.keys(counts)) {
    const m = body.match(new RegExp(`^# ${key} (\\d+)$`, "m"));
    if (m) counts[key] = Number(m[1]);
  }
  const failures = [];
  const skips = [];
  for (const line of lines) {
    if (line.startsWith("✖ ") && line !== "✖ failing tests:") failures.push(normalizeTitle(line.slice(2)));
    if (line.startsWith("﹣ ")) skips.push(normalizeTitle(line.slice(2)));
    const m = line.match(/^not ok \d+ - (.*?)(?: # (SKIP|TODO).*)?$/);
    if (m) {
      if (m[2] === "SKIP") skips.push(normalizeTitle(m[1]));
      else if (m[2] !== "TODO") failures.push(normalizeTitle(m[1]));
    }
  }
  return { counts, failures: [...new Set(failures)].sort(), skips: [...new Set(skips)].sort() };
}

const [beforePath, afterPath, label] = process.argv.slice(2);
const before = parse(readFileSync(beforePath, "utf8"));
const after = parse(readFileSync(afterPath, "utf8"));
console.log(`# suite: ${label}`);
if (!before.sectioned && !after.sectioned) {
  console.log(`before: ${JSON.stringify(before.single.counts)} failures=${before.single.failures.length} skips=${before.single.skips.length}`);
  console.log(`after : ${JSON.stringify(after.single.counts)} failures=${after.single.failures.length} skips=${after.single.skips.length}`);
  const b = new Set(before.single.failures);
  const a = new Set(after.single.failures);
  const beforeOnly = [...b].filter((x) => !a.has(x)).sort();
  const afterOnly = [...a].filter((x) => !b.has(x)).sort();
  const common = [...a].filter((x) => b.has(x)).sort();
  console.log(`failures common=${common.length} before-only=${beforeOnly.length} after-only=${afterOnly.length}`);
  for (const x of beforeOnly) console.log(`  BEFORE-ONLY FAIL: ${x}`);
  for (const x of afterOnly) console.log(`  AFTER-ONLY FAIL: ${x}`);
  const bs = new Set(before.single.skips);
  const as = new Set(after.single.skips);
  console.log(`skips before-only=${[...bs].filter((x) => !as.has(x)).length} after-only=${[...as].filter((x) => !bs.has(x)).length}`);
  for (const x of [...as].filter((x) => !bs.has(x))) console.log(`  AFTER-ONLY SKIP: ${x}`);
} else if (before.sectioned && after.sectioned) {
  const allFiles = [...new Set([...before.files.keys(), ...after.files.keys()])].sort();
  let newAfterOnly = 0;
  let newSkips = 0;
  for (const file of allFiles) {
    const b = before.files.get(file);
    const a = after.files.get(file);
    if (!b) {
      console.log(`FILE ${file}: NEW (after only) counts=${JSON.stringify(a.counts)} failures=${a.failures.length}`);
      continue;
    }
    if (!a) {
      console.log(`FILE ${file}: MISSING after (before counts=${JSON.stringify(b.counts)})`);
      continue;
    }
    const bs = new Set(b.failures);
    const as = new Set(a.failures);
    const beforeOnly = [...bs].filter((x) => !as.has(x)).sort();
    const afterOnly = [...as].filter((x) => !bs.has(x)).sort();
    const bskip = new Set(b.skips);
    const askip = new Set(a.skips);
    const skipAfterOnly = [...askip].filter((x) => !bskip.has(x)).sort();
    if (beforeOnly.length || afterOnly.length || skipAfterOnly.length || JSON.stringify(b.counts) !== JSON.stringify(a.counts)) {
      console.log(`FILE ${file}`);
      console.log(`  counts before=${JSON.stringify(b.counts)} after=${JSON.stringify(a.counts)} exit before=${b.exit} after=${a.exit}`);
      for (const x of beforeOnly) console.log(`  BEFORE-ONLY FAIL: ${x}`);
      for (const x of afterOnly) console.log(`  AFTER-ONLY FAIL: ${x}`);
      for (const x of skipAfterOnly) console.log(`  AFTER-ONLY SKIP: ${x}`);
      newAfterOnly += afterOnly.length;
      newSkips += skipAfterOnly.length;
    }
  }
  console.log(`TOTALS: files=${allFiles.length} new-after-only-failures=${newAfterOnly} new-after-only-skips=${newSkips}`);
} else {
  console.log("ERROR: one side sectioned, one side single; cannot diff");
  process.exit(3);
}
