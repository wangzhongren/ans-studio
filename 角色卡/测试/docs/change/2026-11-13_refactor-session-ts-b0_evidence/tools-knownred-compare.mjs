// B0：known-red 逐名比对工具。
// 用法：node tools-knownred-compare.mjs <suite-tap-file> <canonical-names-file> [suite-label]
// 从 TAP13（`not ok N - name`）或 spec（`✖ name (1.2ms)`）输出抽取失败名，与冻结名单逐名 diff：
// 输出 JSON：suite、canonicalCount、actualCount、missing（基线有、本次无）、extra（本次新增）、
// canonicalOnly、actualOnly 的逐行内容。
import { readFileSync } from "node:fs";

const [tapPath, namesPath, label = ""] = process.argv.slice(2);
if (!tapPath || !namesPath) {
  console.error("usage: node tools-knownred-compare.mjs <suite-tap-file> <canonical-names-file> [suite-label]");
  process.exit(2);
}

function namesFromTap(text) {
  const names = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "");
    const tap = line.match(/^not ok \d+ - (.*)$/);
    if (tap) {
      const name = tap[1].replace(/\s+# (SKIP|TODO).*$/i, "").trim();
      if (name && name !== "failing tests:") names.add(name);
      continue;
    }
    const spec = line.match(/^✖ (.*?) \(\d+(?:\.\d+)?ms\)$/);
    if (spec) {
      const name = spec[1].trim();
      if (name && name !== "failing tests:") names.add(name);
    }
  }
  return names;
}

const actual = namesFromTap(readFileSync(tapPath, "utf8"));
const canonical = new Set(
  readFileSync(namesPath, "utf8")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean),
);

const missing = [...canonical].filter((n) => !actual.has(n)).sort();
const extra = [...actual].filter((n) => !canonical.has(n)).sort();
console.log(JSON.stringify({
  suite: label || namesPath,
  tap: tapPath,
  canonicalCount: canonical.size,
  actualCount: actual.size,
  missingInActual: missing,
  extraVsCanonical: extra,
  sameSet: missing.length === 0 && extra.length === 0,
}, null, 2));
