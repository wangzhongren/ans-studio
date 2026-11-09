// Parse a per-file sectioned run log (see 52-run-desktop-rest-perfile.sh) into per-file counts/失败集合.
// Usage: node 41-extract-sections.mjs <sectionedLog>
import { readFileSync } from "node:fs";

const text = readFileSync(process.argv[2], "utf8");
const lines = text.split(/\r?\n/);
const normalizeTitle = (t) =>
  t.replace(/ \((?:[0-9.]+|>?\s*[0-9.]+)ms\)$/, "").replace(/\s+/g, " ").trim();

let current = null;
const results = [];
for (const line of lines) {
  const fileMatch = line.match(/^===== FILE: (.+) =====$/);
  if (fileMatch) {
    current = { file: fileMatch[1], body: [] };
    results.push(current);
    continue;
  }
  const exitMatch = line.match(/^===== EXIT (-?\d+) WALL (\d+)s =====$/);
  if (exitMatch && current) {
    current.exit = Number(exitMatch[1]);
    current.wall = Number(exitMatch[2]);
    current = null;
    continue;
  }
  if (current) current.body.push(line);
}

for (const r of results) {
  const body = r.body.join("\n");
  const counts = { tests: null, pass: null, fail: null, cancelled: null, skipped: null, todo: null };
  const summaryIdx = r.body.map((l, i) => (l.startsWith("ℹ tests ") ? i : -1)).filter((i) => i >= 0);
  if (summaryIdx.length > 0) {
    const start = summaryIdx[summaryIdx.length - 1];
    for (let i = start; i < Math.min(start + 12, r.body.length); i++) {
      const m = r.body[i].match(/^ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)$/);
      if (m) counts[m[1]] = Number(m[2]);
    }
  }
  const tapTests = body.match(/^# tests (\d+)$/m);
  if (tapTests) {
    for (const key of Object.keys(counts)) {
      const m = body.match(new RegExp(`^# ${key} (\\d+)$`, "m"));
      if (m) counts[key] = Number(m[1]);
    }
  }
  const failures = [];
  const skips = [];
  for (const line of r.body) {
    if (line.startsWith("✖ ") && line !== "✖ failing tests:") failures.push(normalizeTitle(line.slice(2)));
    if (line.startsWith("﹣ ")) skips.push(normalizeTitle(line.slice(2)));
    const m = line.match(/^not ok \d+ - (.*?)(?: # (SKIP|TODO).*)?$/);
    if (m) {
      if (m[2] === "SKIP") skips.push(normalizeTitle(m[1]));
      else if (m[2] !== "TODO") failures.push(normalizeTitle(m[1]));
    }
  }
  console.log(
    JSON.stringify({
      file: r.file,
      exit: r.exit,
      wall: r.wall,
      counts,
      failures: [...new Set(failures)].sort(),
      skips: [...new Set(skips)].sort(),
    }),
  );
}
