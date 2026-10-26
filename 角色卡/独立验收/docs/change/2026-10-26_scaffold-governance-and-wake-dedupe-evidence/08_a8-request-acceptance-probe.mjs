import { strict as assert } from "node:assert";
import { pathToFileURL } from "node:url";

const roles = await import(pathToFileURL("C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/src/common/门禁引擎/governance-roles.ts").href);
const tools = await import(pathToFileURL("C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/src/provider/runtime/tools.ts").href);

const card = roles.governanceRoleOf("convener").cardText;
const codes = ["dispatched", "flow-not-found", "criteria-missing", "change-package-missing", "change-package-no-risk", "flow-incomplete", "runtime-unresolved", "already-dispatched", "unavailable"];
for (const code of codes) {
  assert.ok(card.includes(`\`${code}\``), `receipt code missing from convener card: ${code}`);
}
console.log("all 9 frozen receipt codes present in convener card");

const mustRetain = [
  "所有变更（含非发布）在流程 / 证据 / change-package 齐备后，由应用按验收门自动派 Proof / 验收",
  "Steward 不派发治理角色、不代替验收、不催办",
  "`release` 只是可选发布元数据，不是独立验收的启动条件，也不代替验收 / 客户决定",
];
for (const phrase of mustRetain) assert.ok(card.includes(phrase), `existing acceptance rule weakened/missing: ${phrase}`);
console.log("existing automatic-gate rules retained verbatim");

const prerequisites = [
  "全部实现/交付步骤都已核证 `done`",
  "`verification-evidence`",
  "change-package",
  "含 `riskTier`",
  "验收标准",
  "主动调用 `request_acceptance({flowId})`",
  "不得等待应用事件",
];
for (const phrase of prerequisites) assert.ok(card.includes(phrase), `prerequisite missing: ${phrase}`);
console.log("prerequisites and proactive-submission rule present");

for (const id of ["liaison", "rapporteur", "nominator", "verifier"]) {
  assert.equal(roles.governanceRoleOf(id).cardText.includes("request_acceptance"), false, `${id} must not define the channel`);
}
console.log("request_acceptance channel defined only in Steward card");

// 工具冻结回执枚举与卡文本对齐：tools.ts 的枚举集合与卡文本一致（防止卡引用不存在的 code）。
const enumBlock = /const REQUEST_ACCEPTANCE_CODES[^=]*= Object\.freeze\(\[(.*?)\]\);/s.exec(await (await import("node:fs/promises")).readFile("C:/Users/51054/Desktop/work/ans-studio/.claude/worktrees/lead-governance-coordination/src/provider/runtime/tools.ts", "utf8"));
const enumCodes = [...enumBlock[1].matchAll(/"([a-z-]+)"/g)].map((match) => match[1]);
assert.deepEqual(enumCodes.sort(), [...codes].sort());
console.log("card receipt codes match frozen tool enum:", JSON.stringify(enumCodes));
console.log("A8 PROBE PASS");
