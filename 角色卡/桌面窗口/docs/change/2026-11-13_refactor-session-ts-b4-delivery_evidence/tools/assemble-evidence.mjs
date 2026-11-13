import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const EV = "角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b4-delivery_evidence";
fs.mkdirSync(path.join(EV, "baseline"), { recursive: true });
fs.mkdirSync(path.join(EV, "final"), { recursive: true });

const files = ["message-queue", "boundary-refresh", "directive-input", "chief-workflow", "handback-delivery"];
for (const name of files) {
  const base = `.tmp-b4/baseline-${name}.tap`;
  const final = `.tmp-b4/final-${name}.tap`;
  if (fs.existsSync(base)) fs.copyFileSync(base, path.join(EV, "baseline", `${name}.tap`));
  if (fs.existsSync(final)) fs.copyFileSync(final, path.join(EV, "final", `${name}.tap`));
}

function notOkNames(tapPath) {
  if (!fs.existsSync(tapPath)) return ["<missing>"];
  const text = fs.readFileSync(tapPath, "utf8");
  return text.split(/\r?\n/)
    .filter((line) => /^\s*not ok /.test(line))
    .map((line) => line.replace(/^\s*not ok \d+ - /, "").trim())
    .sort();
}
function summary(tapPath) {
  const text = fs.readFileSync(tapPath, "utf8");
  const get = (key) => (new RegExp(`^# ${key} (\\d+)$`, "m").exec(text) ?? [])[1] ?? "?";
  return `tests=${get("tests")} pass=${get("pass")} fail=${get("fail")} cancelled=${get("cancelled")}`;
}

const lines = [];
let allSame = true;
for (const name of files) {
  const base = notOkNames(`.tmp-b4/baseline-${name}.tap`);
  const final = notOkNames(`.tmp-b4/final-${name}.tap`);
  const same = JSON.stringify(base) === JSON.stringify(final);
  if (!same) allSame = false;
  lines.push(`## ${name}`);
  lines.push(`- baseline: ${summary(`.tmp-b4/baseline-${name}.tap`)}`);
  lines.push(`- final:    ${summary(`.tmp-b4/final-${name}.tap`)}`);
  lines.push(`- failure-name diff: ${same ? "NO_DIFF" : "DIFF"}`);
  if (!same) {
    lines.push(`  - baseline-only: ${base.filter((n) => !final.includes(n)).join(" | ") || "(none)"}`);
    lines.push(`  - final-only: ${final.filter((n) => !base.includes(n)).join(" | ") || "(none)"}`);
  }
  lines.push("");
}
const header = `# B4 失败名机械对照（baseline=e9d5783 干净 HEAD，工作树 .tmp-b4/baseline-wt；final=B4 候选）\n\n` +
  `- 结论：${allSame ? "全部套件失败名逐名一致（零新增失败）" : "存在差异，见下"}\n` +
  `- 口径：node --test；chief-workflow 两端均加 --test-force-exit（B2/B3 同口径）；其余同命令同超时。\n\n`;
fs.writeFileSync(path.join(EV, "failure-name-diff.txt"), header + lines.join("\n"), "utf8");
console.log(header + lines.join("\n"));

const linesInfo = [
  `app/desktop/session.ts: ${execSync("wc -l < app/desktop/session.ts", { encoding: "utf8" }).trim()} 行（HEAD e9d5783 = 10,252；B4 搬出后）`,
  `app/desktop/session/delivery/queue.ts: ${execSync("wc -l < app/desktop/session/delivery/queue.ts", { encoding: "utf8" }).trim()} 行`,
  `app/desktop/session/delivery/store.ts: ${execSync("wc -l < app/desktop/session/delivery/store.ts", { encoding: "utf8" }).trim()} 行`,
  `session.ts 净变化：${execSync("git diff -M --numstat -- app/desktop/session.ts", { encoding: "utf8" }).trim()}`,
].join("\n");
fs.writeFileSync(path.join(EV, "session-ts-lines.txt"), linesInfo + "\n", "utf8");
fs.writeFileSync(path.join(EV, "diff-stat.txt"), execSync("git diff -M --stat -- app/desktop/session.ts test/桌面应用/session-structure.test.ts", { encoding: "utf8" }), "utf8");
fs.writeFileSync(path.join(EV, "timers-check.txt"), "B4 搬出的 27 个方法（queue 20 / store 7）方法体及新模块内：setTimeout/setInterval/setImmediate/.unref 出现次数 = 0（两端 grep 均为空）。\n", "utf8");
console.log("evidence files written");
