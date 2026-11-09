#!/usr/bin/env node
// D1 evidence tool: extract counts and failure/skip title sets from a Node TAP log.
// Usage: node parse-tap.mjs <tapfile> [outJson]
// Title handling: every line matching /^\s*(not ok|ok) \d+ - (.*)$/ contributes its title;
// "not ok" -> failure title; lines whose trailer contains "# SKIP" -> skip title.
// Trailing diagnostics (" # SKIP ...", " # TODO ...") are stripped from the title text.
// Titles are deduplicated and sorted by UTF-8 byte order for set-diff use.
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
const outJson = process.argv[3];
const text = readFileSync(file, "utf8");
const lines = text.split(/\r?\n/);

const fails = [];
const skips = [];
const summary = {};
const re = /^\s*(not ok|ok) (\d+) - (.*)$/;
for (const line of lines) {
  const m = re.exec(line);
  if (m) {
    const [, status, , rest] = m;
    const hasSkip = /# SKIP/i.test(rest);
    let title = rest.replace(/\s+#\s*(SKIP|TODO)\b.*$/i, "").trim();
    if (status === "not ok") fails.push(title);
    if (hasSkip) skips.push(title);
    continue;
  }
  const s = /^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/.exec(line);
  if (s) summary[s[1]] = Number(s[2]);
}
const uniqSort = (arr) =>
  [...new Set(arr)].sort((a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")));
const result = { file, summary, failCount: fails.length, skipCount: skips.length, failTitles: uniqSort(fails), skipTitles: uniqSort(skips) };
const json = JSON.stringify(result, null, 2) + "\n";
if (outJson) writeFileSync(outJson, json, "utf8");
console.log(json);
