// 门禁引擎测试：2026-10-26 Decision 卡（材料性选择）
//
// 客户规则（经任务派发转达）：
//  1. 主理（Lead / liaison）发现**材料性选择**（真实启动演示方式、验收证据方式、范围、标准 / 契约偏离、
//     成本、客户可见行为等）时，**不得在聊天里自己定**；应给统筹（Steward / convener）派协调任务，由统筹
//     发 `request_choice(cardKind="decision")` 客户确认卡；内部实现细节仍可自决、不弹卡。
//  2. 统筹收到此类请求或自己发现材料性选择时**必须发 decision 卡**：卡内提供真实可执行的选项且
//     **恰好一个 `recommended: true`**；不得自决、不得把选择说成客户批准；客户开启「替我决策」时判断
//     agent 默认选推荐项；收到结果后按选项执行并记录，不触发 gate / 最终验收。
//  3. decision 卡独立于提案 / 任命 / 验收；**不是客户批准**；不写 `customer.decision` 的验收 / 提案语义。
//
// 2026-10-26 客户纠正（需求变更审批）：需求变更审批也复用 `cardKind=decision`，但该审批卡由
// Draft / 提案 或 Steward / 统筹 发起 / 持有（其他内置角色与主理不可），审批人为客户 / 判断 agent；
// 这条不属于本节「材料性选择」通道，Lead 不发起、不审批。本文件只钉住**材料性选择** Decision 通道
// 仍只由统筹卡定义，并断言 Draft 只在需求变更审批节定义 decision 卡、不得定义材料性选择 Decision 章节。
//
// 本文件只钉住卡文本数据面（行为约束）。运行时 `cardKind=decision` 白名单、判断 agent 推荐项代选与账本
// 记账由运行时核心 / 编排角色实施；本批未越界修改或验证这些实现。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BUILT_IN_GOVERNANCE_ROLES,
  governanceRoleOf,
} from "../../src/common/门禁引擎/governance-roles.ts";

function assertIncludesAll(text: string, needles: readonly string[], label: string): void {
  for (const needle of needles) {
    assert.ok(text.includes(needle), `${label} 须包含「${needle}」`);
  }
}

// —————————————————————— 1) Steward / 统筹：必须发 decision 卡 ——————————————————————

test("2026-10-26 Decision 卡：Steward 收到材料性选择请求或自己发现时必须发卡，内部实现细节不弹卡、不得自决", () => {
  const c = governanceRoleOf("convener")!.cardText;

  // 章节与触发：来自 Lead 的协调任务，或统筹自己在规划 / readiness / 派发 / 证据检查中发现。
  assertIncludesAll(
    c,
    [
      "## Decision 卡（材料性选择，必须）",
      "收到 产品 / Lead 材料性选择的协调任务",
      "规划 / readiness / 派发 / 证据检查",
      "真实启动演示方式、验收证据方式、范围、标准 / 契约偏离、成本、客户可见行为",
      "**必须发 decision 卡**",
      // 不得自决、不得把推荐 / 现状说成客户已选择；不得因来自主理就跳过客户确认。
      "**不得自行决定、不得在聊天里定案、不得把推荐项或既有做法说成客户已同意 / 已选定**",
      "也不得以「产品已转达」为由跳过客户确认",
      // 内部实现细节例外：可自决、不发卡、不包装成客户决定。
      "内部实现细节",
      "**不发 decision 卡**",
      "也不包装成客户决定",
    ],
    "Steward Decision 卡触发与不得自决",
  );

  // 卡形态：request_choice + cardKind=decision + flowId；options 真实可选、恰好一个 recommended。
  assertIncludesAll(
    c,
    [
      "调用 `request_choice`（`cardKind=decision`、`flowId` 必填）",
      "`title` 写清要决定的问题与影响",
      "`options` 提供真实可执行、彼此可区分的候选方案",
      "逐项写清效果 / 代价 / 影响",
      "不得只发一个推荐项冒充选择",
      "**恰好一个**选项带 `recommended: true`",
      "其余不带或为 `false`",
      "推荐项只是你的建议，不是预选、不是客户已选择",
    ],
    "Steward Decision 卡 options 与 recommended",
  );
});

test("2026-10-26 Decision 卡：回执按选项执行并记录、未获选择不自决；替我决策默认选推荐项（judge 代批）", () => {
  const c = governanceRoleOf("convener")!.cardText;

  assertIncludesAll(
    c,
    [
      // 未获明确选择：不按推荐项继续、不重复刷同一张卡。
      "未获明确选择（拒绝 / 超时 / 通道不可用）",
      "如实向客户或 产品 / Lead 报告并等待",
      "不按推荐项继续",
      "不重复刷同一张卡",
      // 替我决策：判断 agent 默认选推荐项并标 judge 代批；不是客户本人批准。
      "客户开启「替我决策」时，判断 agent 会**默认选择推荐项**",
      "`judge 代批`",
      "这是客户授权范围内的代选",
      "不得声称是客户本人点击或亲自批准",
      "代批结果与客户本人选择同口径执行",
      // 收到结果后按选项执行并记录；客户选非推荐项时不得改回。
      "**收到结果后**：按客户 / 判断 agent 选中的选项执行",
      "记录到 `docs/scheduling/**` 或 `docs/governance/convener/**`",
      "客户选了非推荐项时按客户选择执行，不得改回推荐",
    ],
    "Steward Decision 卡回执与判断代选",
  );
});

test("2026-10-26 Decision 卡：独立于提案 / 任命 / 验收，不是客户批准，不写 customer.decision 的验收 / 提案语义，不触发 gate / 最终验收", () => {
  const c = governanceRoleOf("convener")!.cardText;

  assertIncludesAll(
    c,
    [
      "**与 gate / 验收分离**：decision 卡独立于提案 / 任命 / 验收",
      "**不是客户批准**",
      "不是提案接受、任命或验收通过",
      "不写 `customer.decision` 的验收 / 提案语义",
      "应用按 `cardKind=decision` 记账",
      "不触发 gate 复核 / `request_gate_review`",
      "不触发 `request_acceptance` / 最终验收",
      "不进入验收分诊",
      "不得用 decision 结果推进闸门 1 / 闸门 2",
      // 标准工作流与确认卡约定同口径（不只藏在一个章节）。
      "流程中遇到材料性选择时按「Decision 卡（材料性选择，必须）」执行",
      "decision 卡结果只解决该问题，不触发 gate / 最终验收",
      "材料性选择用 `request_choice`（`cardKind=decision`，选项恰好一个 `recommended: true`",
      // 治理卡参数纪律：appointment / decision 两类，缺 flowId/cardKind 仍无效。
      "（只用 `appointment` / `decision`）",
      "缺任何一项＝无效治理调用",
    ],
    "Steward Decision 卡与 gate / 验收分离",
  );

  // 反向断言：旧「只用 appointment」口径不得残留；decision 章节不得混入其它 cardKind 语义。
  assert.equal(c.includes("（只用 `appointment`）"), false, "Steward 卡不得只允许 appointment 一种选择卡");
  const sectionStart = c.indexOf("## Decision 卡（材料性选择，必须）");
  const sectionEnd = c.indexOf("## Gate 规划（必须）");
  assert.ok(sectionStart >= 0 && sectionEnd > sectionStart, "Decision 卡章节须位于 Gate 规划之前");
  const decisionSection = c.slice(sectionStart, sectionEnd);
  for (const foreign of ["`cardKind=proposal`", "`cardKind=appointment`", "`cardKind=acceptance`"]) {
    assert.equal(
      decisionSection.includes(foreign),
      false,
      `Decision 卡章节不得混入 ${foreign} 语义`,
    );
  }
  assert.equal(
    decisionSection.includes("`cardKind=decision`"),
    true,
    "Decision 卡章节须明确 cardKind=decision",
  );
});

// —————————————————————— 2) Lead / 主理：材料性选择不得聊天定案 ——————————————————————

test("2026-10-26 Decision 卡：Lead 发现材料性选择不得聊天自定，交运营发卡；内部实现细节仍可自决、不弹卡", () => {
  const l = governanceRoleOf("liaison")!.cardText;

  assertIncludesAll(
    l,
    [
      "## 治理协调（产品 / Lead）",
      "**材料性选择交运营发 decision 卡（必须）**",
      "真实启动演示方式、验收证据方式、范围、标准 / 契约偏离、成本、客户可见行为",
      "**不得在聊天里自己定、不得自行按某一方案推进、不得说成客户已同意或内部选择**",
      "应按现有门禁给 运营 / Steward 派协调任务",
      "带 `flowId`、问题、候选方案、影响与你的建议",
      "由运营发 `request_choice`（`cardKind=decision`）客户确认卡",
      "**你仍只发 `intent-confirm` 需求确认卡；材料性选择的 decision 卡由运营发，需求变更审批 decision 卡由应用在 策划 / Draft 或运营 的 `request_requirement_change` 通道内自动呈现——你都不发**",
      "未获客户 / 判断 agent 明确选择前不按任一方案推进",
      // 与同日「系统消息只汇报」规则不冲突：系统消息来源的材料性选择仍只汇报。
      "材料性选择若来自系统消息，仍按「系统消息只汇报、不派任务」只向客户汇报，不据此派任务",
      "客户消息或你自己的工作发现触发的才派协调任务",
      "内部实现细节（契约措辞、实现细节、排期等）仍可自决、不弹卡",
      // 既有内部决策纪律保留，并明确材料性选择不属内部决策。
      "**内部决策纪律（必须）**",
      "**材料性选择不属于内部决策**",
      "不得在聊天里自己定、不得包装成内部选择",
      "不得把内部选择包装成客户决定或另发 `request_choice`",
      // 治理卡参数纪律：Lead 仍只发 intent-confirm；decision 卡由统筹发。
      "只用 `intent-confirm`；材料性选择 decision 卡由运营发，需求变更审批 decision 卡由应用在 `request_requirement_change` 通道内自动呈现——都不由你发",
    ],
    "Lead 材料性选择交运营",
  );

  // 既有「系统消息只汇报、不派任务」规则必须保留（本批不回归）。
  assertIncludesAll(
    l,
    [
      "**系统消息只汇报、不派任务（必须）**",
      "只向客户如实汇报",
      "不得给 运营 / Steward 发任务、不得调用 `dispatch_task`",
      "不得把系统消息当成客户指令",
      "客户消息不是系统消息",
    ],
    "Lead 系统消息纪律保留",
  );
});

// —————————————————————— 3) 通道归属与数据面零变化 ——————————————————————

test("2026-10-26 Decision 卡：材料性选择 decision 通道只由运营卡定义；需求变更审批 decision 卡由 Draft / 运营发起（客户纠正），其余内置卡不得自行定义，数据面（写权/能力）零变化", () => {
  // 材料性选择 decision 卡是统筹的通道：Lead 只派协调任务。
  assert.ok(
    governanceRoleOf("convener")!.cardText.includes("`cardKind=decision`"),
    "Steward 卡须定义 decision 卡通道",
  );
  assert.ok(
    governanceRoleOf("liaison")!.cardText.includes("decision 卡由运营发"),
    "Lead 卡只转交运营发 material 选择 decision 卡",
  );
  // 2026-10-26 客户纠正：需求变更审批 decision 卡由 Draft / 提案 或 Steward / 统筹 发起 / 持有。
  // Draft 只在需求变更审批节定义该卡，不得定义「Decision 卡（材料性选择）」章节（材料性选择仍归统筹）。
  const rapporteur = governanceRoleOf("rapporteur")!.cardText;
  assert.ok(
    rapporteur.includes("## 需求变更申请（request_requirement_change + decision 审批卡，必须）"),
    "Draft 卡须定义需求变更审批 decision 卡通道",
  );
  assert.ok(
    rapporteur.includes("`cardKind=decision`"),
    "Draft 需求变更审批节须写明 cardKind=decision",
  );
  assert.equal(
    rapporteur.includes("Decision 卡（材料性选择"),
    false,
    "Draft 卡不得定义材料性选择 Decision 卡章节",
  );
  // Crew / Proof 仍不得定义任何 decision 卡。
  for (const id of ["nominator", "verifier"] as const) {
    const t = BUILT_IN_GOVERNANCE_ROLES.find((s) => s.id === id)!.cardText;
    assert.equal(t.includes("`cardKind=decision`"), false, `${id} 卡不得定义 decision 卡通道`);
    assert.equal(t.includes("Decision 卡（材料性选择"), false, `${id} 卡不得定义 Decision 卡章节`);
    assert.equal(
      t.includes("需求变更申请审批"),
      false,
      `${id} 卡不得定义需求变更审批职责`,
    );
  }

  // 注册表数据面零变化：本批只改卡文本，不加能力位、不改写权。
  const convener = governanceRoleOf("convener")!;
  assert.deepEqual(convener.entries.map((e) => e.path), [
    "docs/flows/",
    "docs/workflow.md",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.deepEqual(convener.preauthorizedDirs, [
    "docs/flows/",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]);
  assert.deepEqual(convener.forbiddenWritePaths, [
    ".ans/",
    "docs/bootstrap-manifest.md",
    "角色卡/governance-boundary.yaml",
    "角色卡/",
    "docs/proposals/",
    "docs/nominations/",
    "docs/skills/",
    "docs/mcp/",
  ]);
  assert.equal(convener.capabilities.dispatchTask, true);
  assert.equal(convener.capabilities.shell, "operator-approve");

  const liaison = governanceRoleOf("liaison")!;
  assert.deepEqual(liaison.entries.map((e) => e.path), ["docs/intents/"]);
  assert.deepEqual(liaison.preauthorizedDirs, ["docs/intents/"]);
  assert.equal(liaison.capabilities.customerInput, true);
  assert.equal(liaison.capabilities.handOffIntent, true);
  assert.equal(liaison.capabilities.dispatchTask, true);
  assert.equal(liaison.capabilities.shell, "operator-approve");
});
