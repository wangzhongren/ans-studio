// test/门禁引擎/block-resolver-texts.test.ts
// 2026-11-20（block resolver 测试批 R4b，测试角色）：**角色文本 block 语义**（T-12）。
//
// 依据（权威）：`docs/planning/2026-11-20_design_block-resolution-paths.md` §7.2（角色文本增删）、
// §8.1 T-12、§8.2 AC-10；R3 记录 `角色卡/门禁引擎/docs/change/2026-11-20_change_block-resolver-texts.md`
// （§一 改动段落、§二 逐字保留面、§五.2 negative 口径：按具体旧句而非 blanket「停止」）。
//
// 覆盖：
//   1. v3 资源身份/体积/BOM 约束；v1/v2 资源字节（git blob SHA，LF 归一）逐字不变；
//   2. v3 positive：block 如实报告即路由输入/应用按类路由/不空转/不代客户选择/终止仅客户/decided/
//      block 生命周期/T_repair/T_remind/block 卡 prompt/不重弹；
//   3. v3 negative：具体旧句（「stage.blocked 交客户/运营」「无法恢复时按停止面处理」「三选一」等）不出现；
//      合法 stop 语义（不停止动作面、停止由客户/应用命令、workflow.stop-unconfirmed）保留；
//   4. 六角色 fixed 上下文：block 路由/修复任务/回执/不重弹 positive；convener fixed 覆盖 legacy 停住默认出路；
//   5. legacy 冻结：convener legacy 卡文本仍含「无可行方案如实停止」；legacy 上下文不出现新 block 路由句。
//
// 只读文件；无临时目录/端口/`.env`/真实模型。

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chiefRoleModule } from "../../src/common/roles/chief/index.ts";
import { convenerRoleModule } from "../../src/common/roles/convener/index.ts";
import { productRoleModule } from "../../src/common/roles/product/index.ts";
import { rapporteurRoleModule } from "../../src/common/roles/rapporteur/index.ts";
import { nominatorRoleModule } from "../../src/common/roles/nominator/index.ts";
import { verifierRoleModule } from "../../src/common/roles/verifier/index.ts";
import type { BuiltInRoleModule, RoleContextSection } from "../../src/model/role.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW_DIR = join(REPO_ROOT, "src", "common", "门禁引擎", "workflows", "chief");
const V1_PATH = join(WORKFLOW_DIR, "chief-workflow.md");
const V2_PATH = join(WORKFLOW_DIR, "chief-workflow-v2.md");
const V3_PATH = join(WORKFLOW_DIR, "chief-workflow-v3.md");
const MAX_RESOURCE_BYTES = 256 * 1024;
const FIXED = "two-fixed-paths/v1" as const;

/** git hash-object 同口径：blob `<len>\\0<content>` 的 SHA-1（LF 归一；与工作树 CRLF 无关）。 */
function gitBlobSha(raw: Buffer): string {
  const lf = Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  const header = Buffer.from(`blob ${lf.length}\0`, "utf8");
  return createHash("sha1").update(header).update(lf).digest("hex");
}

function fixedSections(module: BuiltInRoleModule): readonly RoleContextSection[] {
  return module.context({ governanceModel: "trio", matrix: FIXED });
}
function fixedText(module: BuiltInRoleModule): string {
  return fixedSections(module).map((section) => section.text).join("\n");
}

// —————————————— 1) 资源身份/冻结 ——————————————

test("v3 资源身份/体积/BOM：版本行恰一处 chief-workflow/v3、≤256 KiB、无 BOM/NUL", () => {
  const raw = readFileSync(V3_PATH);
  const text = raw.toString("utf8");
  assert.match(text, /^# Chief 工作流/, "Markdown 身份行保留");
  const versions = [...text.matchAll(/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm)].map((match) => match[1]!);
  assert.deepEqual(versions, ["chief-workflow/v3"]);
  assert.ok(raw.length <= MAX_RESOURCE_BYTES, `v3 资源不得超过 256 KiB（实际 ${raw.length}）`);
  assert.notEqual(raw[0], 0xef, "不得带 UTF-8 BOM");
  assert.equal(raw.includes(0), false, "不得含 NUL");
});

test("v1/v2 字节冻结：git blob SHA 逐字不变（53d7167… / d528c6c…）；v3 独立字节", () => {
  const v1 = readFileSync(V1_PATH);
  const v2 = readFileSync(V2_PATH);
  const v3 = readFileSync(V3_PATH);
  assert.equal(gitBlobSha(v1), "53d71670ef9f403c027f6e39c0ffd1db92553992", "chief-workflow.md（v1）逐字未动");
  assert.equal(gitBlobSha(v2), "d528c6ce5655b2a9916574f4a4477e035aef42a6", "chief-workflow-v2.md（fixed-v2.1 在飞）逐字未动");
  assert.notEqual(gitBlobSha(v3), gitBlobSha(v2), "v3 不得复制 v2 字节");
  assert.notEqual(gitBlobSha(v3), gitBlobSha(v1), "v3 不得复制 v1 字节");
});

// —————————————— 2) v3 positive ——————————————

test("v3 positive：block 如实报告即路由输入/应用按类路由/不空转/不代选/终止仅客户/生命周期", () => {
  const text = readFileSync(V3_PATH, "utf8");
  const positives: ReadonlyArray<readonly [string, RegExp]> = [
    ["block 如实报告即路由输入", /block 如实报告即路由输入/],
    ["应用按类路由", /应用按类路由（引擎修复\/属主修复\/决策卡\/升级）/],
    ["不空转", /不空转/],
    ["不代客户选择", /不代客户选择/],
    ["不越权 shell", /不越权 shell/],
    ["终止仅客户显式选择", /终止仅由客户在决策卡中显式选择/],
    ["decided 结果", /decided 结果/],
    ["不以停住结束", /不以停住结束/],
    ["block 生命周期", /block 生命周期（无 stopped）/],
    ["fixed/decided 两终态", /block 终态只有 `fixed`（修复后重入场）与 `decided`（judge\/客户裁决后继续）/],
    ["escalated 非终态", /`escalated` 是升级[^\n]*不是终态/],
    ["同指纹重复升级", /同指纹重复 block ⇒ 应用升级（`escalated`）/],
    ["T_repair", /`T_repair`（默认 10 分钟）/],
    ["T_remind", /`T_remind`（默认 30 分钟）/],
    ["block-terminate-flow 永不推荐", /`block-terminate-flow` 只作为客户主权选项存在于决策卡、永不推荐、judge 永不代选/],
    ["block 卡应用发行", /block 决策卡（应用发行/],
    ["block-card requestId", /requestId=block-card-<blockId>/],
    ["card-prompt-mismatch", /card-prompt-mismatch/],
    ["不重弹", /不得对同一 `blockId` 重弹卡/],
    ["无答复不执行", /无答复不执行/],
    ["blocks.jsonl 审计", /\.ans\/state\/blocks\.jsonl/],
    ["block.raised → block.routed", /block\.raised → block\.routed/],
    ["block 卡不计入三卡", /block 决策卡（应用发行的 `decision` 卡）按 decision 卡口径不计入三卡/],
    ["baseline 路由", /应用按 block 路由：环境\/属主修复或决策卡，不以停住结束/],
    ["A12 standard 路由处置", /由应用按 block 路由处置（属主修复\/决策卡\/升级）/],
  ];
  for (const [label, pattern] of positives) assert.match(text, pattern, `v3 须包含：${label}`);
});

test("v3 negative（具体旧句）：不再指示 stage.blocked 交客户/运营、无法恢复按停止面、三选一含停止", () => {
  const text = readFileSync(V3_PATH, "utf8");
  const oldSentences = [
    "`stage.blocked` 交客户/运营",
    "stage.blocked 交客户/运营",
    "无法恢复时按停止面处理",
    "停止面处理",
    "三选一",
    "停止并如实上报",
  ];
  for (const sentence of oldSentences) {
    assert.equal(text.includes(sentence), false, `v3 不得保留旧停住口径：${sentence}`);
  }
});

test("v3 合法停止语义保留（不 blanket 误杀）：动作面「不停止」、停止由客户/应用命令、stop-unconfirmed", () => {
  const text = readFileSync(V3_PATH, "utf8");
  assert.match(text, /你不推进阶段、不收口任务、不重派、不停止、不直派验收/, "幕僚动作面「不停止」逐字保留");
  assert.match(text, /停止\/改道由客户或应用命令执行/, "停止由客户/应用命令执行");
  assert.match(text, /workflow\.stop-unconfirmed/, "停稳不明 ⇒ workflow.stop-unconfirmed");
  assert.match(text, /不写 stopped、保留现场|不写 stopped、不自动回滚 Git/, "不伪造 stopped");
  assert.match(text, /## 停止、失败与审计/, "停止/失败/审计段保留");
});

// —————————————— 3) 六角色 fixed 上下文 ——————————————

test("六角色 fixed 段：block 路由语义 positive（如实报告/应用路由/不空转/不代选/修复任务回交）", () => {
  const modules: ReadonlyArray<readonly [string, BuiltInRoleModule]> = [
    ["chief", chiefRoleModule],
    ["convener", convenerRoleModule],
    ["product", productRoleModule],
    ["rapporteur", rapporteurRoleModule],
    ["nominator", nominatorRoleModule],
    ["verifier", verifierRoleModule],
  ];
  for (const [roleId, module] of modules) {
    const text = fixedText(module);
    assert.ok(text.includes("如实报告即路由输入"), `${roleId}: 如实报告即路由输入`);
    assert.ok(text.includes("不空转"), `${roleId}: 不空转`);
    assert.ok(text.includes("不代客户选择"), `${roleId}: 不代客户选择`);
    assert.ok(text.includes("重弹"), `${roleId}: 同一 block 不重弹（不得/不重弹）`);
  }
  // 终止仅客户（治理角色段落显式；product/rapporteur/nominator/verifier 由不代选+不空转约束）。
  assert.ok(fixedText(chiefRoleModule).includes("终止仅由客户"));
  assert.ok(fixedText(convenerRoleModule).includes("终止仅由客户"));
  // 属主修复回交（repairId）：convener/product/rapporteur/nominator/verifier。
  for (const [roleId, module] of modules.filter(([roleId]) => roleId !== "chief")) {
    assert.ok(fixedText(module).includes("repairId"), `${roleId}: 修复任务按 repairId 回交`);
  }
  // convener fixed 覆盖 legacy 停住/等待默认出路，且不自行同文重试。
  const convenerText = fixedText(convenerRoleModule);
  assert.ok(convenerText.includes("旧卡文本中的停住/等待类默认出路在固定路径不适用"), "convener fixed 覆盖 legacy 停住默认出路");
  assert.ok(convenerText.includes("不自行同文重试"), "convener fixed 不自行同文重试");
  assert.ok(convenerText.includes("同一 `blockId` 不重弹卡"), "convener fixed 同一 blockId 不重弹卡");
  assert.equal(convenerText.includes("无可行方案如实停止"), false, "fixed 段不得复用 legacy 停住句");
  // verifier fixed：无运行期通道不是停的理由。
  const verifierText = fixedText(verifierRoleModule);
  assert.ok(verifierText.includes("无运行期通道不是停的理由"));
  assert.ok(verifierText.includes("不自批"));
});

test("chief fixed 段：block 卡按 prompt 逐项一致、blockId 入回执、A12 应用路由、决策纪律", () => {
  const sections = fixedSections(chiefRoleModule);
  assert.deepEqual(sections.map((section) => section.id), [
    "chief-fixed-path-dispatch",
    "chief-fixed-cards",
    "chief-fixed-review",
    "chief-fixed-decision",
  ], "段 id/顺序冻结");
  const dispatch = sections.find((section) => section.id === "chief-fixed-path-dispatch")!.text;
  const cards = sections.find((section) => section.id === "chief-fixed-cards")!.text;
  const review = sections.find((section) => section.id === "chief-fixed-review")!.text;
  const decision = sections.find((section) => section.id === "chief-fixed-decision")!.text;
  assert.match(dispatch, /block 如实报告即路由输入：应用按类路由（引擎修复\/属主修复\/决策卡\/升级）/);
  assert.match(dispatch, /终止仅由客户在决策卡中显式选择（decided 结果/);
  assert.match(cards, /block 决策卡由应用发行（requestId=block-card-<blockId>/);
  assert.match(cards, /blockId 入回执/);
  assert.match(cards, /card-prompt-mismatch/);
  assert.match(cards, /不得对同一 blockId 重弹/);
  assert.match(cards, /block 卡按 decision 卡口径不计入三卡/);
  assert.match(review, /standard：由应用按 block 路由处置（属主修复\/决策卡\/升级）/);
  assert.match(decision, /block 不是停的理由/);
});

// —————————————— 4) legacy 冻结 ——————————————

test("legacy 冻结：convener legacy 卡文本仍含「无可行方案如实停止」；legacy 上下文不出现新 block 路由句", () => {
  assert.ok(convenerRoleModule.card.text.includes("无可行方案如实停止"), "legacy 卡文本逐字冻结（不得判为 fixed 回归）");
  const modules: ReadonlyArray<readonly [string, BuiltInRoleModule]> = [
    ["chief", chiefRoleModule],
    ["convener", convenerRoleModule],
    ["product", productRoleModule],
    ["rapporteur", rapporteurRoleModule],
    ["nominator", nominatorRoleModule],
    ["verifier", verifierRoleModule],
  ];
  for (const [roleId, module] of modules) {
    const legacyText = module.context({ governanceModel: "trio" }).map((section) => section.text).join("\n");
    assert.equal(legacyText.includes("如实报告即路由输入"), false, `${roleId}: legacy 上下文逐字冻结（无新路由句）`);
    assert.equal(legacyText.includes("不空转"), false, `${roleId}: legacy 上下文逐字冻结（无不空转句）`);
    assert.equal(legacyText.includes("block-card-<blockId>"), false, `${roleId}: legacy 上下文无 block 卡 requestId`);
  }
});
