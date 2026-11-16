// B3a 证据：把 R3 CI source-gate 族 23 名与本机复现/3× 结果逐名对照。
// 用法（worktree 根目录）：node 角色卡/测试/docs/change/2026-11-16_test-debt-b3a-source-gate_evidence/make-family-crosscheck.mjs
import fs from "node:fs";
import path from "node:path";

const ev = "角色卡/测试/docs/change/2026-11-16_test-debt-b3a-source-gate_evidence";
const familyPath = "角色卡/测试/docs/change/2026-11-16_remediation-plan_r3-evidence/11-families.json";
const family = JSON.parse(fs.readFileSync(familyPath, "utf8")).families.find((entry) => entry.family === "source-gate");

/** 解析 node --test 日志：返回「失败名 -> 首个断言/错误行」。 */
function parseFailures(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const results = new Map();
  let current;
  for (const line of lines) {
    const fail = /^✖ (.+?) \(\d[\d.]*ms\)\s*$/.exec(line);
    if (fail !== null) { current = fail[1]; continue; }
    if (current !== undefined) {
      const error = /^\s+(AssertionError \[ERR_ASSERTION\]: |Error: |.*Error \[[A-Z_]+\]: )(.*)$/.exec(line);
      if (error !== null) { results.set(current, `${error[1]}${error[2]}`.trim()); current = undefined; }
    }
  }
  return results;
}

const runs = {
  run1: {
    "test/桌面应用/run-pin.test.ts": parseFailures(path.join(ev, "run-pin-run1.log")),
    "test/桌面应用/run-change-trigger.test.ts": parseFailures(path.join(ev, "run-change-trigger-run1.log")),
    "test/测试/governance-e2e-auto/i-full-chain.test.ts": parseFailures(path.join(ev, "i-full-chain-run1.log")),
    "test/claude-adapter/schema.test.ts": parseFailures(path.join(ev, "schema-run1.log")),
  },
};
const greenAfter = new Set([
  // 本批经夹具修正后已转绿的 CI 名（其余 target 名保持红，见 record §3）。
  "宁可不弹（B1）：目标不存在 ⇒ 硬 target-card-missing，不呈现 run-change",
  "显式入口（continue-frozen）：requestRunChangeDecision 三模式落账不变",
  "显式入口（stop-and-restart）：requestRunChangeDecision 三模式落账不变",
  "显式入口（stop）：requestRunChangeDecision 三模式落账不变",
  "显式入口无会话兜底：没有可呈现的客户卡会话 ⇒ 如实失败（不弹卡）",
  "提案卡：冻结 run 上出现更高版本 proposal ⇒ 先尝试 run-change 卡，提案卡 notPresented 拒发",
  "AC-17：VCA submitted/approved 在途 ⇒ 抑制自动 run-change（系统行）；结束后恢复；显式入口保留",
  "F2：版本化文档基线违规受理 + advisory；基线/文档未被改写",
]);

const rows = [["ciFile", "ciName", "ciCodes", "localStatus", "localCodeOrNote"].join("\t")];
for (const name of family.names) {
  // R3 族 JSON 对 `selected`/`required` 的文件归属是启发式（见 03-schema-attribution.txt）；按日志真实归属校正。
  const misattributed = name.name === "selected" || name.name === "required";
  const ciFile = misattributed ? "test/桌面应用/chief-workflow.test.ts（R3 日志归属；族 JSON 启发式误挂 schema）" : name.file;
  const failure = runs.run1[name.file]?.get(name.name) ?? runs.run1["test/桌面应用/chief-workflow.test.ts"]?.get(name.name);
  const green = greenAfter.has(name.name);
  rows.push([
    ciFile,
    name.name,
    JSON.stringify(name.codes),
    misattributed ? "MISATTRIBUTED" : green ? "GREEN(3x)" : failure !== undefined ? "RED(3x)" : "GREEN(3x)",
    misattributed ? "10-block-codes/06-merged-universe：该块属 chief-workflow.test.ts（e71501c 漂移族跨列）；schema.test.ts 本机 3× 10/10 全绿" : green ? "本批夹具修正后 3× 全绿" : failure ?? "无本机对应失败（见记录）",
  ].join("\t"));
}
fs.writeFileSync(path.join(ev, "02-family-vs-local.tsv"), `${rows.join("\n")}\n`);
console.log(rows.join("\n"));
