// 门禁引擎测试：2026-10-26 需求变更申请 + 独立审批（decision 卡）角色卡文本数据面
//
// 客户规则（经任务派发两次纠正后的最终口径）：
//  1. 需求变更申请**不由主理审批**；审批由客户（未勾选「替我决策」）或判断 agent（勾选时默认选推荐项）
//     在 `request_choice(cardKind="decision")` 卡上以 `approve` / `reject` 完成，恰好一个
//     `recommended: true`（推荐 `approve`）。
//  2. 申请 / 审批卡由 Draft / 提案 或 Steward / 统筹 **发起 / 持有**；其他内置治理角色与主理不可；
//     发起方不得自批 / 代选。
//  3. Draft / 提案：提案需要**新的授权**（联网 / 外部服务、外部目录 / 仓库、范围、验收 / 技术标准、
//     成本）时，**不得写进提案卡**，必须调用 `request_requirement_change` 发起申请并发 decision 审批卡；
//     申请只是请求、不是客户批准；批准后等主理执行意图变更并通知，再修订提案；拒绝则修订 / 撤回；
//     不得删需求绕过审批。
//  4. Lead / 主理：不接收原始申请、不审批；只接收「已批准的需求变更执行任务」，核验独立审批证据后更新
//     `docs/intents/**` 并通知 Draft 修订；未获审批证据不得执行；不得自行批准 / 拒绝；「系统消息只汇报、
//     不派任务」规则不回归。
//  5. Steward / 统筹：可发起 / 持有需求变更审批卡，同样必须发 decision 卡、不得自批；批准后通知主理执行
//     并通知 Draft；不执行意图变更、不改提案。其他 decision 卡（材料性选择）职责保留。
//
// 本文件只钉住卡文本数据面（行为约束）。`request_requirement_change` 的运行时实现（工具注册 / 参数
// 校验 / 任务投递 / 票据 / 账本）与 `cardKind=decision` 的发起角色白名单由运行时核心 / 编排 / 桌面角色
// 实施；本批只读核对了在飞契约并对齐卡文本，未修改、未验证该通道。

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

// —————————————————————— 1) Draft / 提案：申请 + decision 审批卡 + 等待 ——————————————————————

test("2026-10-26 需求变更：Draft 需要新授权时不得写进提案卡，必须 request_requirement_change 发起申请并等独立审批（decision 卡）", () => {
  const r = governanceRoleOf("rapporteur")!.cardText;

  assertIncludesAll(
    r,
    [
      // 章节与发起权归属：Draft / Steward 可发起 / 持有；其他内置角色与主理不可。
      "## 需求变更申请（request_requirement_change + decision 审批卡，必须）",
      "**谁能发起**：需求变更申请由 策划 / Draft 或 运营 / Steward 发起；审批卡由应用在 `request_requirement_change` 成功后经你的会话客户卡通道自动呈现（你持有该卡，但不是你手动发卡）",
      "其他内置治理角色与产品不得发起或持有该审批卡",
      // 触发面：联网 / 外部目录 / 范围 / 标准 / 成本五类新授权。
      "**新的授权**",
      "联网",
      "外部目录",
      "范围",
      "验收 / 技术标准",
      "成本",
      // 硬约束：不得写进提案卡，必须走专用申请通道。
      "**不得写进提案卡**",
      "不得作为提案 / 提案卡的内容或选项",
      "不得只在会话里口头说明",
      "必须调用 `request_requirement_change` 发起需求变更申请",
      // 工具契约（只读核对在飞实现）：归属至少一个、changeKind 五值、有界文本与建议字段。
      "`flowId` / `intentId` **至少给一个**",
      "`changeKind` 必填",
      "`scope`＝范围 / `authorization`＝联网等新授权 / `constraint`＝标准或约束 / `cost`＝成本 / `other`",
      "`summary` 与 `rationale` 必填",
      "超长拒绝、不截断",
      "`impact`、`proposedIntentPatch` 可选",
      "**`proposedIntentPatch` 只是给产品的建议，不替客户修改意图**",
      "申请由应用校验 / 去重并登记票据",
      // 申请只是请求：不是客户批准 / 提案接受 / 门禁解锁 / 实施授权。
      "**申请只是请求**",
      "**不是客户批准、不是提案接受、不解锁任何门禁、不授权实施**",
      "申请在途时不得按新授权写提案 / 契约 / 实现",
      "不得把申请回执写成客户已同意",
      // 必须发 decision 审批卡：approve / reject、唯一 recommended=approve、不能自批 / 代选。
      "**审批卡由应用自动呈现并等待独立审批**",
      "应用会以你的会话客户卡通道自动呈现需求变更审批 `decision` 卡",
      "**你不得再调用 `request_choice` 重复发卡**",
      "**恰好一个**选项带 `recommended: true`（推荐 `approve`）",
      "**审批人不是产品、也不是你**",
      "客户开启「替我决策」时由判断 agent 默认选推荐项（`approve`）并标 `judge 代批`",
      "未开启时由客户手选",
      "**不得自行批准 / 拒绝、不得代选、不得默认按 `approve` 推进、不得把推荐项或申请提交说成客户已同意**",
      "未获明确结果（拒绝 / 超时 / 通道不可用）时不推进、不重复刷同一张卡",
      // 回执如实处理：成功不夸大、失败不伪装、rejected 不代表客户拒绝。
      "**回执如实处理**",
      "`dispatched` / `already-dispatched`＝申请已登记 / 已有在途申请",
      "不等于客户批准、不代表意图已变更",
      "`invalid` / `intent-not-found` / `flow-not-found`＝未提交",
      "`rejected`＝应用退回报告员（不代表客户拒绝）",
      "按原因修正后重交，不原样重复提交",
      "`unavailable` / 工具失败 / 超时＝可能已提交、以应用核对为准",
      "「申请未提交 / 状态未知」",
      "不得继续按新授权推进",
      "契约外 / 未知回执按未提交处理，不得当成功",
      // 标准工作流第 2 步同步指针（不只藏在新章节）。
      "先按「需求变更申请（request_requirement_change + decision 审批卡，必须）」发起申请并等独立审批",
    ],
    "Draft 需求变更申请 + 审批卡",
  );

  // 反向断言：不得把「不需要申请、可以写进提案卡」写成肯定式口径，也不得把审批交给主理。
  for (const forbidden of [
    "新授权可以直接写进提案卡",
    "新授权写进提案卡即可",
    "提案卡可以批准新授权",
    "由产品审批需求变更",
    "产品批准需求变更",
  ]) {
    assert.equal(r.includes(forbidden), false, `Draft 卡不得出现「${forbidden}」式表述`);
  }
});

test("2026-10-26 需求变更：Draft 批准后等产品通知再修订提案；拒绝则修订 / 撤回；不得删需求绕过审批", () => {
  const r = governanceRoleOf("rapporteur")!.cardText;

  assertIncludesAll(
    r,
    [
      // 批准后等主理执行意图变更并通知；通知前不得修订 / 重发提案卡；通知后出 v2 并重发。
      "**批准后等产品执行意图变更再修订**",
      "由应用把申请票据与 decision 结果作为「已批准的需求变更执行任务」交给产品",
      "产品执行意图变更（更新 `docs/intents/**`）后通知你",
      "**在收到产品通知前，不得修订提案、不得重发提案卡**",
      "`docs/proposals/<flowId>-v2.md`",
      "重发提案卡（`cardKind=proposal`）",
      // 拒绝则修订 / 撤回，不得按新授权推进或重复申请绕过。
      "**拒绝则修订或撤回**",
      "审批 `reject` 时，按通知修订提案",
      "或撤回提案",
      "不得把拒绝说成批准",
      "不得原样重复提交同一申请绕过拒绝",
      // 审批卡不是新门禁、不写提案卡授权；批准 ≠ 提案接受。
      "**审批卡不是新门禁 / 不写提案卡授权**",
      "不是提案接受、任命或验收通过",
      "不触发 gate 复核 / 最终验收",
      "不得用审批结果推进闸门 1 / 闸门 2",
      "**提案卡不得承载新的授权**",
      "批准只解决需求变更本身，提案仍须修订后走既有提案卡（闸门 1）",
      "不得把新授权写进提案 / 提案卡",
      "不得用审批卡替代提案卡",
      // 不得删需求绕过审批；删需求本身也是需求变更。
      "**不得删需求绕过审批**",
      "删需求本身就是需求变更",
      "必须走本通道并经客户 / 判断 agent 独立审批",
      "不得把「客户没反对」「原意图没写」当作授权",
      // 提案卡约定同步：提案卡不得承载新的授权。
      "经客户 / 判断 agent 在 decision 卡上独立审批后再修订提案",
      // 治理卡参数纪律：Draft 仍只出 proposal 选择卡；需求变更审批另用 decision。
      "需求变更审批卡由应用在 `request_requirement_change` 成功后自动呈现",
    ],
    "Draft 批准后修订 / 拒绝后处理 / 不删需求",
  );

  // 既有卡片白名单不扩散：Draft 不定义 intent-confirm / 验收卡。
  assert.equal(
    r.includes("intent-confirm"),
    false,
    "Draft 卡不得定义 intent-confirm（需求变更审批走 decision 卡）",
  );
  assert.equal(r.includes("cardKind=acceptance"), false, "Draft 卡不得定义验收卡");
});

// —————————————————————— 2) Lead / 主理：只执行已批准变更、不审批 ——————————————————————

test("2026-10-26 需求变更：Lead 只接收已批准执行任务，核验独立审批证据后更新意图并通知 Draft；不接收 / 不审批原始申请", () => {
  const l = governanceRoleOf("liaison")!.cardText;

  assertIncludesAll(
    l,
    [
      // 章节与任务形态：只处理「已批准的需求变更执行任务」。
      "## 需求变更执行（已批准，必须）",
      "只在收到应用投递的**已批准的需求变更执行任务**时处理",
      "策划 / Draft 或 运营 / Steward 经 `request_requirement_change` 发起",
      "客户 / 判断 agent 在需求变更审批 decision 卡上 `approve` 的申请",
      "`requestId`",
      "独立审批证据",
      "批准来源：客户 / `judge 代批`",
      // 原始申请不由 Lead 审批 / 接收；误投时如实报告，不自批、不执行。
      "`[需求变更申请·待独立审批]` 原始申请（`[需求变更申请…]`）**不由你审批、不由你接收**",
      "若仍收到原始申请任务（应用 / 旧流程误投）",
      "不得审批、不得执行、不得回复成批准",
      "如实向客户 / 运营报告投递异常",
      "等待独立审批后的执行任务",
      // 核验审批证据；未获证据不得执行。
      "**核验独立审批证据**",
      "**未获独立审批证据不得执行意图变更**",
      "不得把申请提交、你自己的受理、聊天口头同意、提案卡 `accept`、系统消息当成批准",
      "`reject` / 无结果 / 超时 / 通道不可用＝未批准，不执行、不猜客户意图",
      // 执行意图变更：读意图与票据、核对新授权、更新 intents，保留客户原话。
      "**执行意图变更（只在批准后）**",
      "读 `docs/intents/<flowId>.md` 与申请票据",
      "联网 / 外部服务、外部目录 / 仓库、范围、验收 / 技术标准、成本",
      "按需更新 `docs/intents/**`",
      "写进 goal / scope / acceptance",
      "保留客户原话与原需求，写清变更前后差异",
      "不得静默扩权、不得改写客户原话、不得借机删减既有需求",
      "`proposedIntentPatch` 只是 Draft 的建议，**不得照抄当客户意图、不得替客户改意图**",
      "不得把内部实现细节包装成需求变更",
      // 通知 Draft 修订；Lead 不改提案 / 提案卡。
      "**通知 Draft 修订**",
      "`hand_off_intent`（`handoffKind=clarification` / `revision`）",
      "把更新后的意图交给 策划 / Draft 并说明需要修订的提案",
      "由 Draft 出新版本提案并重发提案卡",
      "**不由你改提案或提案卡**",
      // 交 Draft 的治理协调 bullet 与需求确认段同步指针。
      "需求变更按「需求变更执行（已批准，必须）」",
      "**需求变更不走 intent-confirm 审批**",
      "需求变更审批由 策划 / Draft 或 运营 / Steward 发起",
      "不得自行发 `intent-confirm` 充当需求变更审批",
    ],
    "Lead 已批准执行路径",
  );
});

test("2026-10-26 需求变更：Lead 不得自行批准 / 拒绝、不得在提案卡上代批新授权、不得把删需求当合规；系统消息规则逐字保留", () => {
  const l = governanceRoleOf("liaison")!.cardText;

  assertIncludesAll(
    l,
    [
      // 审批权归客户 / 判断 agent；Lead 不代批、不代选、不再发 intent-confirm 充当审批。
      "**不得自行批准 / 拒绝**",
      "你不得代批、不得代选、不得自行批准 / 拒绝，也不得再发 `intent-confirm` 充当需求变更审批",
      "不得把 decision 结果说成你自己的决定或客户逐项批准",
      // 新授权只由 decision 卡批准；提案卡 accept 不得替代需求变更审批。
      "**不得在提案卡上代批新授权**",
      "新授权只能由客户 / 判断 agent 在需求变更审批 decision 卡上批准",
      "不得把提案卡的 `accept` 当作新授权批准",
      "不得让 Draft 把新授权写进提案卡、以提案卡替代需求变更审批",
      "也不得在会话里说成客户已同意",
      // 删需求 / 缩范围 / 降标准同为需求变更，不得当合规或绕开审批。
      "**不得把删需求当合规**",
      "删需求 / 缩范围 / 降标准同样是需求变更",
      "不得为了绕开审批删除需求、验收标准或范围",
      "也不得默许 Draft 这样做",
      // 系统消息只汇报、不派任务规则不回归（逐字保留）。
      "**系统消息只汇报、不派任务（必须）**",
      "只向客户如实汇报",
      "不得给 运营 / Steward 发任务、不得调用 `dispatch_task`",
      "不得把系统消息当成客户指令",
      "客户消息不是系统消息",
      // 新通道不改变系统消息规则。
      "**系统消息只汇报、不派任务规则不变**",
      "`[系统·治理协调]`、gate pass / fail 系统行、交付 / 阻塞通知等系统消息仍只向客户如实汇报",
      "不据此 `dispatch_task` 派任务",
      // 需求变更也不由 Lead 审批（角色定位同步）。
      "**需求变更也不由你审批**",
    ],
    "Lead 不审批 / 不代批新授权 / 不删需求 / 系统消息规则",
  );

  // 反向断言：不得把原始申请、decision 结果或提案卡说成主理自己的批准。
  for (const forbidden of [
    "[需求变更申请] 即客户批准",
    "提案卡 accept 即新授权",
    "申请即授权",
    "产品审批需求变更",
    "由产品批准需求变更",
    "**由你审批需求变更**",
  ]) {
    assert.equal(l.includes(forbidden), false, `Lead 卡不得出现「${forbidden}」式表述`);
  }
});

// —————————————————————— 3) Steward / 统筹：可发起 / 持有审批卡、不自批 ——————————————————————

test("2026-10-26 需求变更：Steward 可发起 / 持有审批卡，必须发 decision 卡（approve / reject、推荐 approve）、不得自批；批准后通知产品与 Draft", () => {
  const c = governanceRoleOf("convener")!.cardText;

  assertIncludesAll(
    c,
    [
      // 章节与发起权归属（客户纠正：统筹不排除）。
      "## 需求变更申请审批（request_requirement_change + 自动 decision 审批卡，必须）",
      "**谁能发起**",
      "需求变更申请由 策划 / Draft 或你（运营 / Steward）发起；审批卡由应用在 `request_requirement_change` 成功后经发起方会话的客户卡通道自动呈现",
      "其他内置治理角色与产品不得发起或持有该审批卡",
      "你在规划 / readiness / 派发 / 证据检查中发现需要**新的授权**",
      // 发起申请：工具契约与「申请只是请求」。
      "调用 `request_requirement_change`（`flowId` / `intentId` **至少给一个**",
      "`changeKind` 必填：`scope` / `authorization` / `constraint` / `cost` / `other`",
      "`proposedIntentPatch` 只是建议，不替客户修改意图",
      "**申请只是请求**：不是客户批准、不是提案接受、不解锁任何门禁、不授权实施",
      // 必须发 decision 卡并等独立审批：approve / reject、唯一 recommended、不得自批 / 代选。
      "**审批卡由应用自动呈现并等待独立审批**",
      "应用会经发起方（你或 Draft）的会话客户卡通道自动呈现需求变更审批 `decision` 卡",
      "**发起方不得再调用 `request_choice` 重复发卡**",
      "**恰好一个**选项带 `recommended: true`（推荐 `approve`）",
      "**审批人不是产品、也不是发起方**",
      "客户开启「替我决策」时由判断 agent 默认选推荐项（`approve`）并标 `judge 代批`",
      "未开启时由客户手选",
      "**不得自行批准 / 拒绝、不得代选、不得默认按 `approve` 推进、不得把推荐项或申请提交说成客户已同意**",
      "未获明确结果（拒绝 / 超时 / 通道不可用）时不推进、不重复刷同一张卡",
      // 收到结果后：批准 → 交主理执行 + 通知 Draft；拒绝 → 通知 Draft；Steward 不执行意图变更。
      "**收到结果后**",
      "由应用 / 既有协调通道把申请票据与 decision 结果作为「已批准的需求变更执行任务」交给产品",
      "并通知 策划 / Draft 等待产品修订通知",
      "**你不改意图、不改提案 / 提案卡、不执行意图变更**",
      "`reject` → 通知 策划 / Draft 申请被拒",
      "由 Draft 修订或撤回提案",
      "不要把批准确认当成提案接受",
      // 不是新门禁 / 不写提案卡授权。
      "**不是新门禁 / 不写提案卡授权**",
      "不是提案接受、任命或验收通过",
      "不触发 gate 复核 / 最终验收",
      "不得用审批结果推进闸门 1 / 闸门 2",
      "批准只解决需求变更本身，提案仍须修订后重发提案卡（闸门 1）",
      "不得把新授权写进提案 / 提案卡",
      // 不得删需求绕过审批。
      "**不得删需求绕过审批**",
      "删需求本身就是需求变更",
      "必须走本通道并经客户 / 判断 agent 独立审批",
      // 回执如实处理。
      "**回执如实处理**",
      "`dispatched` / `already-dispatched`＝申请已登记 / 已有在途申请，不等于客户批准",
      "`rejected`＝应用退回（不代表客户拒绝）",
      "`unavailable` / 工具失败 / 超时＝可能已提交、以应用核对为准",
      // 确认卡约定同步：需求变更审批用 decision 卡。
      "需求变更审批卡由应用在 `request_requirement_change` 成功后自动呈现（`cardKind=decision`，选项 `approve` / `reject`、恰好一个 `recommended: true`（推荐 `approve`）",
    ],
    "Steward 需求变更审批卡",
  );

  // 材料性选择 Decision 卡职责保留（本批不删、不改）。
  assertIncludesAll(
    c,
    [
      "## Decision 卡（材料性选择，必须）",
      "**必须发 decision 卡**",
      "**与 gate / 验收分离**",
    ],
    "Steward 材料性选择 Decision 卡保留",
  );

  // 反向断言：Steward 不得把需求变更审批说成自己的批准。
  for (const forbidden of [
    "由运营批准需求变更",
    "运营自行批准需求变更",
    "需求变更审批由产品完成",
  ]) {
    assert.equal(c.includes(forbidden), false, `Steward 卡不得出现「${forbidden}」式表述`);
  }
});

// —————————————————————— 4) 通道归属与数据面零变化 ——————————————————————

test("2026-10-26 需求变更：通道只由 Draft / Steward 发起，Lead 只执行；其余内置卡不得定义；数据面（写权 / 能力）零变化", () => {
  // 申请 / 审批卡发起权：Draft + Steward；Lead 只处理已批准执行任务。
  assert.ok(
    governanceRoleOf("rapporteur")!.cardText.includes("request_requirement_change"),
    "Draft 卡须定义 request_requirement_change 申请 + 审批卡通道",
  );
  assert.ok(
    governanceRoleOf("convener")!.cardText.includes("request_requirement_change"),
    "Steward 卡须定义 request_requirement_change 申请 + 审批卡通道",
  );
  assert.ok(
    governanceRoleOf("liaison")!.cardText.includes("已批准的需求变更执行任务"),
    "Lead 卡须只处理已批准执行任务",
  );
  // Lead 不发起 / 持有审批卡、不定义审批卡形态。
  const liaison = governanceRoleOf("liaison")!;
  assert.equal(
    liaison.cardText.includes("**必须发需求变更审批 decision 卡"),
    false,
    "Lead 卡不得定义需求变更审批 decision 卡发起职责",
  );
  // Crew / Proof 不定义该通道。
  for (const id of ["nominator", "verifier"] as const) {
    const t = governanceRoleOf(id)!.cardText;
    assert.equal(
      t.includes("request_requirement_change"),
      false,
      `${id} 卡不得定义 request_requirement_change 通道`,
    );
    assert.equal(
      t.includes("需求变更申请审批"),
      false,
      `${id} 卡不得定义需求变更审批职责`,
    );
  }

  // 注册表数据面零变化：本批只改卡文本，不加能力位、不改写权。
  assert.deepEqual(liaison.entries.map((e) => e.path), ["docs/intents/"]);
  assert.deepEqual(liaison.preauthorizedDirs, ["docs/intents/"]);
  assert.equal(liaison.capabilities.customerInput, true);
  assert.equal(liaison.capabilities.handOffIntent, true);
  assert.equal(liaison.capabilities.dispatchTask, true);
  assert.equal(liaison.capabilities.shell, "operator-approve");

  const rapporteur = governanceRoleOf("rapporteur")!;
  assert.deepEqual(rapporteur.entries.map((e) => e.path), [
    "docs/proposals/",
    "docs/contracts/",
    "docs/governance/rapporteur/",
  ]);
  assert.deepEqual(rapporteur.preauthorizedDirs, [
    "docs/proposals/",
    "docs/contracts/",
    "docs/governance/rapporteur/",
  ]);
  assert.equal(rapporteur.capabilities.customerInput, true);
  assert.equal(rapporteur.capabilities.requestClarification, true);
  assert.equal(rapporteur.capabilities.dispatchTask, false);
  assert.equal(rapporteur.capabilities.shell, "operator-approve");

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
  assert.equal(convener.capabilities.customerInput, true);
  assert.equal(convener.capabilities.dispatchTask, true);
  assert.equal(convener.capabilities.shell, "operator-approve");

  // 现有 cardKind 白名单不变：需求变更审批复用 decision，不新增 cardKind。
  assert.ok(rapporteur.cardText.includes("只用 `proposal`"), "Draft 仍只出 proposal 选择卡（另有需求变更审批 decision）");
  assert.ok(rapporteur.cardText.includes("只用 `write`"), "Draft 仍只出 write 写盘卡");
  assert.ok(liaison.cardText.includes("只用 `intent-confirm`"), "Lead 仍只出 intent-confirm 需求确认卡");

  // 六角色注册表仍在且顺序不变（只改卡文本）。
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.id),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
  );
});
