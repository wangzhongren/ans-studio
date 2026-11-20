// chief 角色模块 fixed 矩阵批次测试（T3「两条固定工作流路径」B2；chief-code 批次）。
//
// 依据：
//  - `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md`（AC-24、T-13、EV-05）；
//  - `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md`
//    §5.7/MF-IR-4（fixedCards/fixedTargetRoleIds 冻结值；requestReleaseMerge 拒绝新增）；
//  - `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` §3.2/§3.4（chief 行）；
//  - 设计 v2 `docs/planning/2026-11-10_design_two-fixed-workflow-paths.md` §〇（幕僚职责）。
//
// 口径：
//  - fixed 数据只在 `matrix:"two-fixed-paths/v1"` 下消费；legacy `card.text`/`cards`/
//    capabilities/`CHIEF_HUB_DISPATCH.targetRoleIds`（五内置）/dispatch/preflight/tools 与
//    `context` 缺省返回值**逐字冻结**（差分由 `differential.test.ts` 守护，本文件另做同引用断言）；
//  - `tools()` 不新增 `requestReleaseMerge`（G-IR §六明确拒绝；字符串在本测试中以拼接构造，
//    以同时证明模块源零出现该 token）；
//  - 只读测试：不改产品代码、不新增依赖、不新增 skip/force-exit。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { RoleContextInput } from "../../../src/model/role.ts";
import { GOVERNANCE_CARD_KINDS } from "../../../src/model/runtime.ts";
import {
  CHIEF_HUB_DISPATCH,
  CHIEF_INTENT_CONFIRM_CARD,
  CHIEF_TOOL_IDS,
  CHIEF_WORKFLOW_RESOURCE,
  chiefRoleModule,
} from "../../../src/common/roles/chief/index.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MODULE_ROOT = join(REPO_ROOT, "src", "common", "roles", "chief");
const FIXED = "two-fixed-paths/v1" as const;

const BUILT_IN_ROLE_IDS = ["chief", "product", "rapporteur", "nominator", "convener", "verifier"] as const;
const LEGACY_FIVE_TARGETS = ["product", "rapporteur", "nominator", "convener", "verifier"] as const;
const FIXED_CARDS_EXPECTED = ["intent-confirm", "proposal", "appointment"] as const;
// 2026-11-17（app-dispatch/v1，设计 §2.1/§6.1）：fixed 目标集按设计清零——内置任务由应用按流程定义
// 创建，幕僚只选流程 + 按应用 prompt 呈卡；旧冻结值 [convener, verifier] 仅为 fixed-v2.1 历史。
const FIXED_TARGETS_EXPECTED: readonly string[] = [];

function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listTsFiles(abs));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(abs);
  }
  return files;
}

// —————————————————————— fixedCards（MF-IR-4 冻结值） ——————————————————————

test("fixedCards：恰 [intent-confirm, proposal, appointment]（3 张客户确认卡；顺序冻结、只读）", () => {
  assert.ok(chiefRoleModule.fixedCards !== undefined, "六模块 B2 后 chief 必须提供 fixedCards");
  const fixedCards = chiefRoleModule.fixedCards!;
  assert.deepEqual([...fixedCards], [...FIXED_CARDS_EXPECTED], "fixedCards 冻结值/顺序（v1.3 §3.4）");
  assert.equal(Object.isFrozen(fixedCards), true, "fixedCards 必须是冻结只读数组");
  assert.equal(new Set(fixedCards).size, fixedCards.length, "fixedCards 不得重复");
  assert.equal(Object.isFrozen(chiefRoleModule), true, "模块对象整体仍冻结");

  // 卡种闭集 + 固定路径抑制项（不发 acceptance；app-owned merge-main/stable-write 不属于角色白名单）。
  for (const kind of fixedCards) {
    assert.ok(GOVERNANCE_CARD_KINDS.includes(kind), `fixedCards 卡种必须在 GovernanceCardKind 闭集内：${kind}`);
  }
  for (const forbidden of ["acceptance", "appointment-write", "merge-main", "stable-write", "download", "decision"] as const) {
    assert.equal(fixedCards.includes(forbidden), false, `fixedCards 不得包含 ${forbidden}`);
  }

  // 不从 legacy cards 过滤/推导（legacy 只有 intent-confirm；fixed 恰为 3 卡且引用不同）。
  assert.deepEqual([...chiefRoleModule.cards], ["intent-confirm"], "legacy cards 逐字冻结");
  assert.notEqual(fixedCards, chiefRoleModule.cards, "fixedCards 不得复用 legacy cards 引用");
  assert.equal(fixedCards.length > chiefRoleModule.cards.length, true, "fixedCards 不是 legacy 的过滤结果");

  // intent-confirm 的卡面数据仍有效（3 卡中的第 1 张）。
  assert.equal(fixedCards.includes(CHIEF_INTENT_CONFIRM_CARD.cardKind), true);
});

// —————————————————————— fixedTargetRoleIds（MF-IR-4 冻结值） ——————————————————————

test("fixedTargetRoleIds：按设计清零 []（应用建内置任务；幕僚只选流程+呈卡）；legacy CHIEF_HUB_DISPATCH 五内置逐字冻结", () => {
  assert.ok(chiefRoleModule.fixedTargetRoleIds !== undefined, "chief 必须提供 fixedTargetRoleIds（清零为 []，不是移除字段）");
  const fixedTargets = chiefRoleModule.fixedTargetRoleIds!;
  assert.deepEqual([...fixedTargets], [...FIXED_TARGETS_EXPECTED], "fixed 目标按设计清零 []（app-dispatch/v1；旧值 [convener, verifier] 仅 v2.1 历史）");
  assert.equal(Object.isFrozen(fixedTargets), true, "fixedTargetRoleIds 必须是冻结只读数组");
  assert.equal(fixedTargets.length, 0, "fixed 目标集不得含任何目标");
  assert.equal(new Set(fixedTargets).size, fixedTargets.length, "fixed 目标不得重复");
  // 新矩阵：幕僚无任何内置派发目标（chief-dispatch-removed）；应用建全部内置任务。
  for (const target of BUILT_IN_ROLE_IDS) {
    assert.equal(fixedTargets.includes(target), false, `fixed 下幕僚不得派 ${target}（应用按流程定义创建）`);
  }

  // legacy hub 派发纯数据冻结：五内置目标、routing/source/report/purpose/schema 逐字不变。
  assert.deepEqual([...CHIEF_HUB_DISPATCH.targetRoleIds], [...LEGACY_FIVE_TARGETS], "legacy 五内置目标逐字冻结");
  assert.equal(CHIEF_HUB_DISPATCH.routing, "chief-hub-v1");
  assert.equal(CHIEF_HUB_DISPATCH.sourceRoleId, "chief");
  assert.equal(CHIEF_HUB_DISPATCH.reportToRoleId, "chief");
  assert.equal(CHIEF_HUB_DISPATCH.purpose, "builtin-preparation");
  assert.equal(CHIEF_HUB_DISPATCH.workSourceSchema, "repository-work-source/v1");
  assert.notEqual(fixedTargets, CHIEF_HUB_DISPATCH.targetRoleIds, "fixed 目标不得复用 legacy 五内置引用");
});

// —————————————————————— fixed context（仅在显式 matrix 返回） ——————————————————————

test("fixed context：matrix=two-fixed-paths/v1 返回 4 个 fixed 段（顺序固定、冻结、与 legacy 引用不同）", () => {
  const fixedSections = chiefRoleModule.context({ governanceModel: "trio", matrix: FIXED });
  const legacySections = chiefRoleModule.context({ governanceModel: "trio" });
  assert.notEqual(fixedSections, legacySections, "fixed 段不得复用 legacy section 表引用");
  assert.deepEqual(fixedSections.map((section) => section.id), [
    "chief-fixed-path-dispatch",
    "chief-fixed-cards",
    "chief-fixed-review",
    "chief-fixed-decision",
  ], "fixed 段 id/顺序冻结");
  assert.equal(Object.isFrozen(fixedSections), true, "fixed section 表冻结");
  for (const section of fixedSections) {
    assert.equal(Object.isFrozen(section), true, `fixed section 冻结：${section.id}`);
    assert.ok(section.text.trim().length > 0, `fixed section 文本不得为空：${section.id}`);
    assert.equal(section.resources, undefined, "fixed 段不新增资源引用（chief-workflow-v2 注入属编排）");
  }
  // 同一输入重复调用返回同一冻结引用（纯数据、无状态）。
  assert.equal(chiefRoleModule.context({ governanceModel: "trio", matrix: FIXED }), fixedSections);
  assert.equal(chiefRoleModule.context({ governanceModel: "single", matrix: FIXED }), fixedSections, "fixed 段与治理模型无关");
});

test("fixed context 内容：select_workflow/应用驱动 / 3 张卡按 prompt / 应用直派验收 / 不派发·不收口·不停止 / 理会专业建议", () => {
  const fixedSections = chiefRoleModule.context({ governanceModel: "trio", matrix: FIXED });
  const text = fixedSections.map((section) => section.text).join("\n");

  // 流程选择与驱动（app-dispatch/v1）：两条固定路径 + select_workflow + 应用建内置任务/驱动阶段。
  assert.match(text, /固定路径流程选择与驱动/);
  assert.match(text, /A1–A13/);
  assert.match(text, /B1–B4/);
  assert.match(text, /select_workflow/);
  assert.match(text, /workflowPath:"A"\|"B"/);
  assert.match(text, /acceptanceStrength:"light"\|"standard"/);
  assert.match(text, /workflow\.started/);
  assert.match(text, /workflow-start:<flowId>:<path>:<sourceTaskId>/);
  assert.match(text, /由应用按流程定义创建并投递/);
  assert.match(text, /运营只派项目 worker/);
  assert.match(text, /worker-dispatch-required/);

  // 幕僚动作面收窄：不派发/不收口/不重派/不停止/不直派验收。
  assert.match(text, /chief-dispatch-removed/);
  assert.match(text, /不收口任务、不重派、不停止、不直派验收/);
  assert.match(text, /workflow-definition-unknown/);
  assert.match(text, /workflow-protocol-mismatch/);
  assert.match(text, /workflow-corrupt/);
  assert.match(text, /workflow\.stop-unconfirmed/);

  // 3 张卡：应用开卡 + card-prompt 逐项一致；merge-main 应用自有、仅客户本人（judge 不可代批）。
  assert.match(text, /3 张且不合并/);
  assert.match(text, /intent-confirm/);
  assert.match(text, /proposal/);
  assert.match(text, /appointment/);
  assert.match(text, /card-prompt/);
  assert.match(text, /promptId/);
  assert.match(text, /documentRefs/);
  assert.match(text, /card-prompt-mismatch/);
  assert.match(text, /merge-main/);
  assert.match(text, /客户本人/);
  assert.match(text, /不可代批/);

  // 独立验收：A12a/A12b 由应用直派、criteria/report、docs/acceptance 归档、强度=定义参数。
  assert.match(text, /独立验收/);
  assert.match(text, /A12a/);
  assert.match(text, /A12b/);
  assert.match(text, /criteria/);
  assert.match(text, /report/);
  assert.match(text, /docs\/acceptance/);
  assert.match(text, /验收强度 = 流程定义参数/);

  // 决策纪律：依据专业建议决定；不自行做专业判断；不代客户批准。
  assert.match(text, /专业建议/);
  assert.match(text, /不自行做专业判断/);
  assert.match(text, /不替客户批准/);

  // 负例防「旧句删除后子串假绿」：旧 stage-request 驱动/生产线派发口径必须整体消失（不是仅个别词消失）。
  for (const oldProtocol of [
    "产线调度",
    "stage-request",
    "sideEffect=read-only",
    "open advance 请求",
    'workflowAction:"stop"',
    "不直接向生产线角色派发任务",
    "chief-production-dispatch-forbidden",
    "只由运营（convener）派发",
    "验收强度由你",
  ]) {
    assert.equal(text.includes(oldProtocol), false, `fixed 段不得保留旧协议口径：${oldProtocol}`);
  }

  // fixed 段不得复制 legacy workflow 资源引用（fixed 资源由编排按协议注入 v2/v3）。
  assert.equal(text.includes("chief-workflow/v1"), false);
  assert.equal(text.includes("chief-workflow.md"), false);
  assert.equal(fixedSections.some((section) => section.resources !== undefined), false);
});

test("context 矩阵缺省/显式 legacy-v1/空输入：返回同一 legacy 冻结表（逐字不变，含 legacy 资源引用）", () => {
  const legacyDefault = chiefRoleModule.context({ governanceModel: "trio" });
  const legacyExplicit = chiefRoleModule.context({ governanceModel: "trio", matrix: "legacy-v1" });
  const legacyEmpty = chiefRoleModule.context({} as RoleContextInput);
  const legacySingle = chiefRoleModule.context({
    governanceModel: "single",
    facts: { anything: true, secret: "must-not-be-read" },
  });

  for (const [label, sections] of [
    ["explicit legacy-v1", legacyExplicit],
    ["empty input", legacyEmpty],
    ["single + facts", legacySingle],
  ] as const) {
    assert.equal(sections, legacyDefault, `${label}: 必须返回同一 legacy 冻结引用（逐字不变）`);
  }

  assert.deepEqual(legacyDefault.map((section) => section.id), [
    "chief-workflow",
    "chief-decision-context",
    "chief-intent-confirm",
  ], "legacy section id/顺序逐字冻结");
  assert.deepEqual(legacyDefault[0]!.resources, [CHIEF_WORKFLOW_RESOURCE], "legacy chief-workflow 资源引用不变");
  assert.equal(CHIEF_WORKFLOW_RESOURCE.path, "src/common/门禁引擎/workflows/chief/chief-workflow.md");
  assert.equal(CHIEF_WORKFLOW_RESOURCE.version, "chief-workflow/v1");
  assert.match(legacyDefault[1]!.text, /唯一客户入口/);
  assert.match(legacyDefault[2]!.text, /request_choice/);
  assert.equal(Object.isFrozen(legacyDefault), true);
  for (const section of legacyDefault) assert.equal(Object.isFrozen(section), true);
});

// —————————————————————— tools：不新增 requestReleaseMerge（G-IR 拒绝项） ——————————————————————

test("tools：fixed 批次不新增发布合并工具；trio 声明仍为冻结的 6 项（含 closeCreatedTask）", () => {
  const policy = chiefRoleModule.tools({ governanceModel: "trio" });
  assert.deepEqual([...policy.tools], [...CHIEF_TOOL_IDS], "tools 声明与 CHIEF_TOOL_IDS 同源");
  assert.deepEqual([...policy.tools], [
    "roleActivityLog",
    "terminateRoleRun",
    "redispatchTask",
    "projectNote",
    "requestVersionDecision",
    "closeCreatedTask",
  ], "trio 工具 6 项/顺序逐字冻结");
  assert.equal(policy.tools.length, 6);
  assert.equal(policy.tools.some((id) => /release|merge/i.test(id)), false, "不得出现发布/合并类工具 id");
  assert.equal(Object.keys(chiefRoleModule).some((key) => /release|merge/i.test(key)), false, "模块对象不得新增发布/合并字段");
});

test("模块源零出现被拒工具 token（G-IR §六：不得新增；模型/注册表由门禁引擎测试另证）", () => {
  // 以拼接构造 token，避免本测试文件自身成为「出现处」；扫描模块源全部 .ts。
  const camel = ["request", "Release", "Merge"].join("");
  const snake = ["request", "release", "merge"].join("_");
  for (const file of listTsFiles(MODULE_ROOT)) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes(camel), false, `${file} 不得出现发布合并工具 token`);
    assert.equal(source.includes(snake), false, `${file} 不得出现发布合并工具 snake token`);
  }
});

// —————————————————————— 纯策略/只读 ——————————————————————

test("纯数据：fixed 读取不改写模块/legacy 数据（重复调用同值；模块 JSON 不变）", () => {
  const snapshot = () => JSON.stringify({
    cards: chiefRoleModule.cards,
    fixedCards: chiefRoleModule.fixedCards,
    fixedTargetRoleIds: chiefRoleModule.fixedTargetRoleIds,
    hubTargets: [...CHIEF_HUB_DISPATCH.targetRoleIds],
    tools: [...CHIEF_TOOL_IDS],
  });
  const moduleBefore = snapshot();
  const fixedBefore = chiefRoleModule.context({ governanceModel: "trio", matrix: FIXED });
  for (let index = 0; index < 3; index += 1) {
    chiefRoleModule.context({ governanceModel: "trio", matrix: FIXED });
    chiefRoleModule.tools({ governanceModel: "trio" });
  }
  assert.equal(snapshot(), moduleBefore, "fixed 读取不得改写模块/legacy 数据");
  assert.equal(chiefRoleModule.context({ governanceModel: "trio", matrix: FIXED }), fixedBefore, "fixed 段为稳定冻结引用");
  assert.equal(Object.isFrozen(CHIEF_TOOL_IDS), true, "工具闭集声明为冻结纯数据");
});
