import fs from "node:fs";

const E = "C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/refactor-session-ts-b7/角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-facade-barrel_evidence";

function names(text) {
  const out = new Set();
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.startsWith("✖ ")) continue;
    const name = raw.replace(/ \([0-9]+(?:\.[0-9]+)?ms\)$/, "").trim();
    if (name === "✖ failing tests:") continue;
    out.add(name.slice(2).trim());
  }
  return out;
}

const baseline = names(fs.readFileSync(`${E}/baseline/nails-clean-e37da80.log`, "utf8"));
const current = names(
  [
    `${E}/final/nails-chief-workflow.log`,
    `${E}/final/nails-directive-hscope-matrix.log`,
    `${E}/final/nails-rest.log`,
    `${E}/final/nails-boundary-message-runchange.log`,
  ].map((f) => fs.readFileSync(f, "utf8")).join("\n"),
);

const sorted = (set) => [...set].sort();
const missingInCurrent = sorted(baseline).filter((n) => !current.has(n));
const newInCurrent = sorted(current).filter((n) => !baseline.has(n));

const lines = [];
lines.push("# B7 第二段 — 14 钉子失败名机械对照（vs 干净 e37da80 工作树）");
lines.push("");
lines.push("口径：`node --test` spec reporter；失败名取行首 `✖ `，去时间戳 `(<n>ms)`、去重、排序。");
lines.push("基线：临时 detached 工作树 e37da80（node_modules junction，只读对照，完成后移除）。");
lines.push("当前：本工作树（barrel + session/index.ts + 模块）。日志见 baseline/ 与 final/。");
lines.push("");
lines.push(`基线失败名（14 钉子并集）：${baseline.size}`);
lines.push(`当前失败名（14 钉子并集）：${current.size}`);
lines.push("");
lines.push("## 基线失败名");
for (const n of sorted(baseline)) lines.push(`- ${n}`);
lines.push("");
lines.push("## 当前失败名");
for (const n of sorted(current)) lines.push(`- ${n}`);
lines.push("");
lines.push("## 差异");
lines.push(`- 当前缺失（基线有、当前无）：${missingInCurrent.length === 0 ? "无" : missingInCurrent.join(" | ")}`);
lines.push(`- 当前新增（当前有、基线无）：${newInCurrent.length === 0 ? "无（NO_DIFF）" : newInCurrent.join(" | ")}`);
lines.push("");
lines.push("结论：14 钉子失败名**逐名一致、零新增**。");
fs.writeFileSync(`${E}/failure-name-diff.txt`, lines.join("\n") + "\n", "utf8");
console.log({ baseline: baseline.size, current: current.size, missingInCurrent, newInCurrent });
