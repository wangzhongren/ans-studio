// B6 第二段：失败名抽取 / 逐名 diff / spec 汇总抽取（可复跑）
// 用法：
//   node segment2-failnames.mjs extract <log> <out.txt>
//   node segment2-failnames.mjs diff <canonical.txt> <actual.txt> <out.json> [out.txt]
//   node segment2-failnames.mjs summary <log>            # 打印 tests/pass/fail/cancelled/skipped/todo/duration_ms
// 口径（同 B0/B5）：spec reporter 行首 `✖ <name> (<Nms>)`；去时间戳、去掉重复输出块（failing tests 区）、去重排序。
import fs from "node:fs";

const FAIL_RE = /^✖ (.+?)(?: \((\d+(?:\.\d+)?)ms\))?$/;

export function normalizeName(raw) {
  let s = String(raw).replace(/^﻿/, "").trimEnd();
  s = s.replace(/^✖ /, "");
  s = s.replace(/ \(\d+(?:\.\d+)?ms\)$/, "");
  return s.trim();
}

export function parseNameFile(file) {
  const names = new Set();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const name = normalizeName(line);
    if (!name || name === "failing tests:" || name === "failing tests") continue;
    names.add(name);
  }
  return [...names].sort();
}

export function extractFailnames(logFile) {
  const names = new Set();
  for (const line of fs.readFileSync(logFile, "utf8").split(/\r?\n/)) {
    const m = line.match(FAIL_RE);
    if (!m) continue;
    const name = normalizeName(m[1]);
    if (!name || name === "failing tests:" || name === "failing tests") continue;
    names.add(name);
  }
  return [...names].sort();
}

export function parseSummary(logFile) {
  const text = fs.readFileSync(logFile, "utf8");
  const grab = (field) => {
    const re = new RegExp(`^ℹ ${field} (\\d+(?:\\.\\d+)?)\\s*$`, "gm");
    let m, last = null;
    while ((m = re.exec(text)) !== null) last = m[1];
    return last == null ? null : Number(last);
  };
  return {
    tests: grab("tests"),
    suites: grab("suites"),
    pass: grab("pass"),
    fail: grab("fail"),
    cancelled: grab("cancelled"),
    skipped: grab("skipped"),
    todo: grab("todo"),
    duration_ms: grab("duration_ms"),
  };
}

function cmdExtract(log, out) {
  const names = extractFailnames(log);
  fs.writeFileSync(out, names.map((n) => `${n}\n`).join(""), "utf8");
  console.log(`${out}: ${names.length} failnames`);
}

function cmdDiff(canonicalFile, actualFile, outJson, outTxt) {
  const canonical = parseNameFile(canonicalFile);
  const actual = parseNameFile(actualFile);
  const canonicalSet = new Set(canonical);
  const actualSet = new Set(actual);
  const added = actual.filter((n) => !canonicalSet.has(n));
  const removed = canonical.filter((n) => !actualSet.has(n));
  const result = {
    canonicalFile,
    actualFile,
    canonicalCount: canonical.length,
    actualCount: actual.length,
    added,
    removed,
    sameSet: added.length === 0 && removed.length === 0,
  };
  fs.writeFileSync(outJson, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  if (outTxt) {
    const lines = [
      `# canonical: ${canonicalFile} (${canonical.length} names)`,
      `# actual: ${actualFile} (${actual.length} names)`,
      `ADDED=${added.length}`,
      `REMOVED=${removed.length}`,
      "",
      ...added.map((n) => `+ ${n}`),
      ...removed.map((n) => `- ${n}`),
      "",
    ];
    fs.writeFileSync(outTxt, lines.join("\n"), "utf8");
  }
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("segment2-failnames.mjs"))) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "extract") cmdExtract(args[0], args[1]);
  else if (cmd === "diff") cmdDiff(args[0], args[1], args[2], args[3]);
  else if (cmd === "summary") console.log(JSON.stringify(parseSummary(args[0]), null, 2));
  else {
    console.error("usage: extract <log> <out> | diff <canonical> <actual> <out.json> [out.txt] | summary <log>");
    process.exit(2);
  }
}
