// B6 第二段：汇总逐文件门槛 / 全量桌面 / 三套 known-red，生成 gate-results.txt 与 segment2-summary.json
// 用法：node segment2-summary.mjs <repoRoot>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFailnames, parseNameFile, parseSummary } from "./segment2-failnames.mjs";

const repoRoot = process.argv[2];
if (!repoRoot) {
  console.error("usage: node segment2-summary.mjs <repoRoot>");
  process.exit(2);
}
const evRel = "角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b6-handback-dispatch-fixed_evidence";
const ev = path.join(repoRoot, evRel);
const s2 = path.join(ev, "segment2");
const gatesDir = path.join(s2, "gates");

const GATES = [
  ["handback-delivery", "test/桌面应用/handback-delivery.test.ts"],
  ["chat-handback-integration", "test/测试/chat-handback-integration.test.ts"],
  ["star-routing", "test/桌面应用/star-routing.test.ts"],
  ["fixed-path-routing", "test/桌面应用/fixed-path-routing.test.ts"],
  ["fixed-path-full-chain", "test/测试/fixed-path-full-chain.test.ts"],
  ["dispatch-fresh-enum", "test/桌面应用/dispatch-fresh-enum.test.ts"],
  ["b101-fixed-dispatch-task-binding", "test/桌面应用/b101-fixed-dispatch-task-binding.test.ts"],
  ["b111-fixed-closed-handback-drain", "test/桌面应用/b111-fixed-closed-handback-drain.test.ts"],
  ["b3-fixed-baseline-pathb", "test/桌面应用/b3-fixed-baseline-pathb.test.ts"],
  ["b3-fixed-cards-panel", "test/桌面应用/b3-fixed-cards-panel.test.ts"],
  ["b3-release-merge-desktop", "test/桌面应用/b3-release-merge-desktop.test.ts"],
  ["b3-workflow-git-real", "test/桌面应用/b3-workflow-git-real.test.ts"],
  ["b31-fixed-release-auto-desktop", "test/桌面应用/b31-fixed-release-auto-desktop.test.ts"],
  ["b42-task-git-port-desktop", "test/桌面应用/b42-task-git-port-desktop.test.ts"],
  ["b51-fixed-workflow-wiring", "test/桌面应用/b51-fixed-workflow-wiring.test.ts"],
  ["b61-chat-entry-fixed", "test/桌面应用/b61-chat-entry-fixed.test.ts"],
  ["b71-fixed-fail-closed", "test/桌面应用/b71-fixed-fail-closed.test.ts"],
  ["b81-fixed-dispatch-forced-session", "test/桌面应用/b81-fixed-dispatch-forced-session.test.ts"],
  ["b82-fixed-workflow-binding-handback", "test/桌面应用/b82-fixed-workflow-binding-handback.test.ts"],
  ["g1-copy-and-nails", "test/测试/g1-verify/g1-copy-and-nails.test.ts"],
  ["g1-dispatch-wiring", "test/测试/g1-verify/g1-dispatch-wiring.test.ts"],
  ["g1-extraction-render", "test/测试/g1-verify/g1-extraction-render.test.ts"],
];

function diffSets(canonicalNames, actualNames, canonicalFile, actualFile) {
  const canonicalSet = new Set(canonicalNames);
  const actualSet = new Set(actualNames);
  return {
    canonicalFile,
    actualFile,
    canonicalCount: canonicalNames.length,
    actualCount: actualNames.length,
    added: actualNames.filter((n) => !canonicalSet.has(n)),
    removed: canonicalNames.filter((n) => !actualSet.has(n)),
    sameSet: canonicalNames.every((n) => actualSet.has(n)) && actualNames.every((n) => canonicalSet.has(n)),
  };
}

const summary = { generatedAt: new Date().toISOString(), gates: {}, fullDesktop: {}, knownred: {}, flakeDisclosure: [] };
const gateLines = ["# B6 第二段逐文件门槛（spec reporter 末次汇总块）", ""];

for (const [name, file] of GATES) {
  const log = path.join(gatesDir, `${name}.log`);
  if (!fs.existsSync(log)) {
    summary.gates[name] = { file, missing: true };
    gateLines.push(`${name} | ${file} | LOG MISSING`);
    continue;
  }
  const s = parseSummary(log);
  const failnames = extractFailnames(log);
  const entry = { file, ...s, failnames: failnames.length, exit: undefined };
  if (name === "handback-delivery" || name === "star-routing") {
    const baseFile = path.join(gatesDir, `${name}-baseline-failnames.txt`);
    const actualFile = path.join(gatesDir, `${name}-failnames.txt`);
    const baseNames = parseNameFile(baseFile);
    entry.failnameDiff = diffSets(baseNames, failnames, baseFile, actualFile);
  } else if (failnames.length > 0) {
    entry.failnameDiff = { unbaselined: true, names: failnames };
  }
  summary.gates[name] = entry;
  const diffTag = entry.failnameDiff
    ? entry.failnameDiff.unbaselined
      ? ` UNBASELINED(${entry.failnameDiff.names.length})`
      : ` diff(added=${entry.failnameDiff.added.length},removed=${entry.failnameDiff.removed.length})`
    : " -";
  gateLines.push(
    `${name} | ${file} | ${s.tests} | ${s.pass} | ${s.fail} | ${s.cancelled} | ${s.skipped} | ${s.duration_ms} |${diffTag}`,
  );
}

// 全量桌面
function fullSegment(key, logName, baselineFile) {
  const log = path.join(s2, logName);
  if (!fs.existsSync(log)) return { missing: true };
  const s = parseSummary(log);
  const names = extractFailnames(log);
  const failnamesFile = path.join(s2, logName.replace(/\.log$/, "-failnames.txt"));
  fs.writeFileSync(failnamesFile, names.map((n) => `${n}\n`).join(""), "utf8");
  const entry = { file: logName, ...s, failnames: names.length };
  if (baselineFile) {
    const baseNames = parseNameFile(path.join(repoRoot, baselineFile));
    entry.failnameDiff = diffSets(baseNames, names, baselineFile, failnamesFile);
  }
  return entry;
}

summary.fullDesktop.桌面应用 = fullSegment(
  "桌面应用",
  "full-desktop-app.log",
  "角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b0_evidence/12b-baseline-desktop-app-failnames.txt",
);
summary.fullDesktop.桌面UI = fullSegment("桌面UI", "full-desktop-ui.log", null);

// 三套 known-red
function knownred(key, logName, canonicalRel) {
  const log = path.join(s2, logName);
  if (!fs.existsSync(log)) return { missing: true };
  const s = parseSummary(log);
  const names = extractFailnames(log);
  const failnamesFile = path.join(s2, logName.replace(/\.log$/, "-failnames.txt"));
  fs.writeFileSync(failnamesFile, names.map((n) => `${n}\n`).join(""), "utf8");
  const entry = { file: logName, ...s, failnames: names.length };
  if (canonicalRel) {
    const baseNames = parseNameFile(path.join(repoRoot, canonicalRel));
    entry.failnameDiff = diffSets(baseNames, names, canonicalRel, failnamesFile);
  }
  return entry;
}

summary.knownred["runtime-core"] = knownred(
  "runtime-core",
  "knownred-runtime-core.log",
  "角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b0_evidence/04a-knownred-runtime-core-33.txt",
);
summary.knownred.gates = knownred(
  "gates",
  "knownred-gates.log",
  "角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b0_evidence/04b-knownred-gates-5.txt",
);
summary.knownred.orchestration = knownred(
  "orchestration",
  "knownred-orchestration.log",
  "角色卡/测试/docs/change/2026-11-13_refactor-session-ts-b0_evidence/04c-knownred-orchestration-24.txt",
);
summary.knownred["orchestration-git-trunk-store"] = knownred("git-trunk-store", "knownred-orchestration-git-trunk-store.log", null);

// 编排合计
const o = summary.knownred.orchestration;
const g = summary.knownred["orchestration-git-trunk-store"];
if (!o.missing && !g.missing) {
  summary.knownred.orchestrationCombined = {
    tests: o.tests + g.tests,
    pass: o.pass + g.pass,
    fail: o.fail + g.fail,
    cancelled: o.cancelled + g.cancelled,
    skipped: o.skipped + g.skipped,
    duration_ms: Math.round((o.duration_ms + g.duration_ms) * 10) / 10,
  };
}

// 全量桌面行
for (const [key, e] of Object.entries(summary.fullDesktop)) {
  if (e.missing) {
    gateLines.push(`full-${key} | LOG MISSING`);
    continue;
  }
  const diffTag = e.failnameDiff ? ` diff(added=${e.failnameDiff.added.length},removed=${e.failnameDiff.removed.length})` : " -";
  gateLines.push(`full-${key} | ${e.file} | ${e.tests} | ${e.pass} | ${e.fail} | ${e.cancelled} | ${e.skipped} | ${e.duration_ms} |${diffTag}`);
}
for (const [key, e] of Object.entries(summary.knownred)) {
  if (key === "orchestrationCombined") continue;
  if (e.missing) {
    gateLines.push(`knownred-${key} | LOG MISSING`);
    continue;
  }
  const diffTag = e.failnameDiff ? ` diff(added=${e.failnameDiff.added.length},removed=${e.failnameDiff.removed.length})` : " -";
  gateLines.push(`knownred-${key} | ${e.file} | ${e.tests} | ${e.pass} | ${e.fail} | ${e.cancelled} | ${e.skipped} | ${e.duration_ms} |${diffTag}`);
}
if (summary.knownred.orchestrationCombined) {
  const c = summary.knownred.orchestrationCombined;
  gateLines.push(`knownred-orchestration-combined | 137files+git-trunk-store | ${c.tests} | ${c.pass} | ${c.fail} | ${c.cancelled} | ${c.skipped} | ${c.duration_ms} |`);
}

fs.writeFileSync(path.join(s2, "gate-results.txt"), `${gateLines.join("\n")}\n`, "utf8");
fs.writeFileSync(path.join(s2, "segment2-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(gateLines.join("\n"));
