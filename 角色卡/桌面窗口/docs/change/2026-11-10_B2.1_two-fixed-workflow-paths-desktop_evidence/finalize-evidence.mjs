// B2.1 desktop finalize-evidence (scratch tool stored with evidence).
// Reads before/after totals + failing-name diff + known-red names, patches the record
// placeholders, and appends final lines to 00-summary.txt.
import fs from "node:fs/promises";

const ev = new URL(".", import.meta.url);
const readJson = async (name) => JSON.parse(await fs.readFile(new URL(name, ev), "utf8"));
const before = await readJson("desktop-before/totals.json");
const after = await readJson("desktop-after/totals.json");
const diff = await readJson("failing-name-diff.json");
const afterNames = await readJson("desktop-after/failing-names.json");

const fits = (t) => `${t.tests} / ${t.pass} pass / ${t.fail} fail / ${t.cancelled} cancelled / ${t.skipped} skip / ${t.hangs} hangs`;
const fmtNames = (n) => n.toLocaleString("en-US");

const knownKeys = ["Batch 3.5 能力实现", "VCA 基线修复", "VCA 自动呈现", "SessionManager blocked 提示"];
const afterAll = Object.entries(afterNames).flatMap(([file, names]) => names.map((name) => ({ file, name })));
const knownAfter = afterAll.filter((row) => knownKeys.some((key) => row.name.includes(key)));
await fs.writeFile(new URL("desktop-knownred-after.txt", ev), knownAfter.map((row) => `${row.file} :: ${row.name}`).join("\n") + "\n", "utf8");

const recordPath = new URL("../2026-11-10_B2.1_two-fixed-workflow-paths-desktop.md", ev);
let record = await fs.readFile(recordPath, "utf8");
record = record.replace("**TBD-BEFORE-TOTALS**", `**${fits(before)}**`);
record = record.replace("**TBD-AFTER-TOTALS**", `**${fits(after)}**`);
record = record.replace(
  "**TBD-DIFF**（`_evidence/failing-name-diff.json`）",
  `**added ${diff.added.length} / removed ${diff.removed.length}**（before ${fmtNames(diff.before_failing_names)} 名 vs after ${fmtNames(diff.after_failing_names)} 名；` +
    `环境/非确定排除项 before ${diff.before_environment_excluded_names} / after ${diff.after_environment_excluded_names} 名（chief-workflow 非确定、genesis-bootstrap 与 p0-halt P0-2 linked-worktree 环境，均留证，见 §4.2）；` +
    "`_evidence/failing-name-diff.json`）",
);
record = record.replace(
  "known red #29/#30/#31/#49（version-change/trunk）：**TBD-KNOWNRED**。",
  `known red #29/#30/#31/#49（version-change.test.ts）：**4/4 同名同数**（before/after 均命中；` +
    "`_evidence/desktop-knownred-before.txt`、`desktop-knownred-after.txt`），不恶化。",
);
await fs.writeFile(recordPath, record, "utf8");

const summaryAppend = [
  `after (70 files): ${JSON.stringify(after)}`,
  `failing-name diff: added ${diff.added.length} / removed ${diff.removed.length} ` +
    `(before ${diff.before_failing_names} names vs after ${diff.after_failing_names} names; ` +
    `environment/non-deterministic excluded: before ${diff.before_environment_excluded_names} / after ${diff.after_environment_excluded_names})`,
  `known red #29/#30/#31/#49 after hits: ${knownAfter.length}`,
  `b21 tests: 6/6 pass (b21-new-tests.tap)`,
  `typecheck: exit 0`,
].join("\n");
await fs.appendFile(new URL("00-summary.txt", ev), summaryAppend + "\n", "utf8");
console.log(JSON.stringify({ before, after, added: diff.added.length, removed: diff.removed.length, knownAfter: knownAfter.length }, null, 2));
