// verifier 角色模块 fixed 矩阵测试（T3「两条固定工作流路径」B2，2026-11-10）。
//
// 依据：`docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md`（AC-09/AC-24/T-13）、
// `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` §5.7/MF-IR-4、
// `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` §3.4（verifier 行）/§8.5。
//
// 覆盖（不改既有断言、不新增跳过/强制退出机制）：
//  - fixedCards=[]（v1.3 §3.4 冻结值；与 legacy cards 不同引用，不回退/过滤 legacy）；
//  - fixed context 段（幕僚直派、A12a criteria、A12b report、强度调节、如实回幕僚、
//    docs/acceptance 应用归档、不派发/不实现/不改他人报告、固定路径不发 acceptance 卡）；
//  - legacy context/card/cards/capabilities 逐字冻结（context({})/legacy-v1 同一引用 + 冻结哈希）；
//  - 无 release 合并请求工具（G-IR §六拒绝项）；无跳过/强制退出 token。
//
// 本文件只读取本角色模块与其测试目录；不 import 旧引擎/门禁门面；不改产品代码。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { RoleContextInput, RoleContextSection } from "../../../src/model/role.ts";
import { GOVERNANCE_CARD_KINDS } from "../../../src/model/runtime.ts";
import { verifierRoleModule } from "../../../src/common/roles/verifier/index.ts";

const MODULE_ENTRY = new URL("../../../src/common/roles/verifier/index.ts", import.meta.url);
const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));

const FIXED = "two-fixed-paths/v1" as const;

/** 基线（B2 改动前）legacy context JSON 的 SHA-256：改 legacy 文案必须显式登记并更新证据。 */
const LEGACY_CONTEXT_JSON_SHA256 =
  "574a8d85ecaf42b479c4e84f7a09679802403186fbfa34100a2256336af35baf";

/** 测试源码禁用 token（拼接构造，避免扫描自命中）。 */
const FORBIDDEN_TEST_TOKENS: readonly string[] = [
  "." + "skip(",
  "skip" + ":",
  "force" + "-exit",
  "process." + "exit",
];

/** G-IR §六拒绝项（拼接构造，避免本文件自身出现该 token）。 */
const REJECTED_RELEASE_TOKENS: readonly string[] = [
  "request" + "Release" + "Merge",
  "request_" + "release_" + "merge",
];

function sha256(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function contextOf(matrix?: "legacy-v1" | "two-fixed-paths/v1"): readonly RoleContextSection[] {
  const input: RoleContextInput = matrix === undefined
    ? { governanceModel: "trio" }
    : { governanceModel: "trio", matrix };
  return verifierRoleModule.context(input);
}

// —————————————————————— fixedCards（MF-IR-4 冻结值） ——————————————————————

test("fixedCards：[] 冻结值（v1.3 §3.4），与 legacy cards 不同引用且不回退/过滤", () => {
  assert.notEqual(verifierRoleModule.fixedCards, undefined);
  const fixedCards = verifierRoleModule.fixedCards!;
  assert.deepEqual([...fixedCards], [], "verifier fixedCards 必须为空集");
  assert.equal(Object.isFrozen(fixedCards), true, "fixedCards 必须是冻结纯数据");
  // 不同引用：fixed 不是 legacy cards 的过滤/推导结果（G-2）。
  assert.notEqual(fixedCards as readonly string[], verifierRoleModule.cards as readonly string[]);
  // legacy cards 逐字冻结（acceptance 保留在 legacy；fixed 抑制）。
  assert.deepEqual([...verifierRoleModule.cards], ["acceptance"]);
  // 空集天然是 GovernanceCardKind 闭集子集；显式断言避免未来改值时漏检。
  for (const kind of fixedCards) {
    assert.equal(GOVERNANCE_CARD_KINDS.includes(kind), true, `非法卡种：${kind}`);
  }
  // 重复调用/重复访问同引用（纯数据，无运行时派生）。
  const again = verifierRoleModule.fixedCards!;
  assert.equal(again, fixedCards);
});

// —————————————————————— fixed context 段 ——————————————————————

test("fixed context：仅 matrix=\"two-fixed-paths/v1\" 返回 fixed 两段（含 A12a/A12b/归档/边界纪律）", () => {
  const fixed = contextOf(FIXED);
  assert.equal(fixed.length, 2);
  assert.deepEqual(fixed.map((section) => section.id), [
    "verifier-fixed-review-role",
    "verifier-fixed-report-expectation",
  ]);
  assert.equal(Object.isFrozen(fixed), true);
  for (const section of fixed) {
    assert.equal(typeof section.text, "string");
    assert.equal(section.text.length > 0, true);
    assert.equal(section.resources, undefined);
    assert.equal(Object.isFrozen(section), true);
  }
  const all = fixed.map((section) => section.text).join("\n");

  // 幕僚直派的验收角色 + A12a 实施前 criteria + A12b 实施后 report（v1.3 §3.4/A12）。
  assert.equal(all.includes("幕僚"), true);
  assert.equal(all.includes("A12a"), true);
  assert.equal(all.includes("A12b"), true);
  assert.equal(all.includes("criteria"), true);
  assert.equal(all.includes("docs/quality/<flowId>-criteria-vN.md"), true);
  assert.equal(all.includes("docs/quality/<flowId>-report-vN.md"), true);
  assert.equal(all.includes("docs/verification/"), true);
  // 按任务文本调节验收强度。
  assert.equal(all.includes("强度"), true);
  assert.equal(all.includes("任务文本"), true);
  // 结论/证据如实回幕僚。
  assert.equal(all.includes("submit_report"), true);
  assert.equal(all.includes("如实"), true);
  assert.equal(all.includes("insufficient evidence"), true);
  // 应用生成 docs/acceptance/<flowId>-acceptance-vN.md 归档；角色只读。
  assert.equal(all.includes("docs/acceptance/<flowId>-acceptance-vN.md"), true);
  assert.equal(all.includes("由应用"), true);
  assert.equal(all.includes("只读"), true);
  // 不派发、不实现、不改他人报告。
  assert.equal(all.includes("不派发"), true);
  assert.equal(all.includes("不实现"), true);
  assert.equal(all.includes("不改他人报告"), true);
  // fixed 抑制 acceptance 卡（fixedCards=[]）：不出现 legacy 卡数据/发卡指引。
  assert.equal(all.includes("固定路径不发 acceptance 卡"), true);
  assert.equal(all.includes('cardKind="acceptance"'), false, "fixed 段不得携带 legacy acceptance 卡数据");
  assert.equal(all.includes("接受（accept）/拒绝（reject）"), false);
  // fixed 段不复制 legacy 段 id。
  assert.equal(all.includes("verifier-acceptance-card"), false);
});

test("fixed context：治理模型/事实不影响输出；输入不被修改；与 legacy 段互不混入", () => {
  const trio = verifierRoleModule.context({ governanceModel: "trio", matrix: FIXED });
  const single = verifierRoleModule.context({ governanceModel: "single", matrix: FIXED });
  const facts = Object.freeze({ flowId: "flow-1", anything: true });
  const withFacts = verifierRoleModule.context({ governanceModel: "trio", facts, matrix: FIXED });
  assert.deepEqual(trio, single);
  assert.deepEqual(trio, withFacts);
  assert.equal(withFacts, trio, "fixed 段同一引用（纯静态模板）");
  assert.deepEqual(facts, { flowId: "flow-1", anything: true });

  const legacy = contextOf();
  assert.notEqual(trio, legacy);
  const legacyIds = new Set(legacy.map((section) => section.id));
  for (const section of trio) {
    assert.equal(legacyIds.has(section.id), false, `fixed 段 id 不得与 legacy 重复：${section.id}`);
  }
});

// —————————————————————— legacy 逐字冻结 ——————————————————————

test("legacy context：context({})/缺省/显式 legacy-v1 同一引用且 JSON 哈希逐字冻结", () => {
  const legacyDefault = verifierRoleModule.context({ governanceModel: "trio" });
  const explicitLegacy = verifierRoleModule.context({ governanceModel: "trio", matrix: "legacy-v1" });
  const emptyInput = verifierRoleModule.context({} as RoleContextInput);
  assert.equal(explicitLegacy, legacyDefault);
  assert.equal(emptyInput, legacyDefault);
  // 与 B2 改动前基线逐字一致（冻结哈希；改 legacy 文案须显式登记）。
  assert.equal(sha256(JSON.stringify(legacyDefault)), LEGACY_CONTEXT_JSON_SHA256);
  assert.deepEqual(
    legacyDefault.map((section) => section.id),
    ["verifier-acceptance-card", "verifier-report-expectation"],
  );
  // legacy acceptance 卡数据仍保留（仅 legacy；fixed 抑制不影响本段）。
  assert.equal(legacyDefault[0]!.text.includes('cardKind="acceptance"'), true);
});

test("legacy 规格数据逐字冻结：card.text/cards/capabilities/边界不受 B2 改动影响", () => {
  assert.equal(verifierRoleModule.card.text.startsWith("# 角色：质检（内置角色）"), true);
  assert.equal(verifierRoleModule.card.text.includes("不批准、不代客户验收"), true);
  assert.equal(sha256(verifierRoleModule.card.text), "ac9511ac64603ea5b14a1436854c78160f7c903d779e74400bc7b263cc165199");
  assert.deepEqual([...verifierRoleModule.cards], ["acceptance"]);
  assert.deepEqual(verifierRoleModule.capabilities, {
    customerInput: true,
    dispatchTask: false,
    roleStatus: false,
    sessionTail: false,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
  });
  assert.deepEqual(
    verifierRoleModule.card.entries.map((entry) => [entry.root, entry.path, entry.kind]),
    [
      ["project", "docs/quality/", "directory"],
      ["project", "docs/verification/", "directory"],
      ["project", "docs/governance/verifier/", "directory"],
    ],
  );
  // legacy dispatch 逐字不变：convener→verifier 仍允许（fixed 拒绝在编排 fixed 谓词，不改本模块）。
  const convenerLegacy = verifierRoleModule.dispatch({
    sourceRoleId: "convener",
    targetRoleId: "verifier",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.deepEqual(convenerLegacy.decision, { allow: true });
  assert.equal(convenerLegacy.reportToRoleId, "convener");
});

// —————————————————————— 拒绝项 / 测试纪律 ——————————————————————

test("无 release 合并请求工具：模块源码零出现（G-IR §六；RoleToolId 仍 14 项）", () => {
  const source = readFileSync(fileURLToPath(MODULE_ENTRY), "utf8");
  for (const token of REJECTED_RELEASE_TOKENS) {
    assert.equal(source.includes(token), false, `模块不得携带拒绝项：${token}`);
  }
  // 工具面仍为空（不新增专属工具/卡）。
  for (const governanceModel of ["trio", "single"] as const) {
    const policy = verifierRoleModule.tools({ governanceModel });
    assert.deepEqual([...policy.tools], []);
    assert.deepEqual([...policy.reasons], []);
  }
});

test("测试纪律：test/roles/verifier 无跳过/强制退出 token（不新增，B2 回归照常执行）", () => {
  const files = readdirSync(TEST_DIR)
    .filter((name) => name.endsWith(".test.ts"))
    .sort();
  assert.equal(files.includes("verifier-fixed.test.ts"), true, "本文件必须参与扫描");
  for (const file of files) {
    const source = readFileSync(`${TEST_DIR}${file}`, "utf8");
    for (const token of FORBIDDEN_TEST_TOKENS) {
      assert.equal(source.includes(token), false, `${file} 含禁用 token：${token}`);
    }
  }
});
