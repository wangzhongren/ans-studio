// 门禁引擎测试：Proof / 质检「工件就绪汇报」纪律（角色卡文本数据面；2026-10-27 批次）
//
// 客户 2026-10-27 新设计：质检（verifier）写完实施前验收标准后，**只向应用汇报**——调用
// `report_artifact_ready({ flowId, stepId, path, summary })`，由应用校验并决定是否收口；质检等待
// 应用 `accepted`，被拒绝 / 缺失时修正后重新汇报；**不得自行用 `flow_step_update` 把步骤从
// `pending` 改成 `dispatched` / `delivered` / `done`，不得自批**；应用决定后如流程仍未继续，
// 如实报告 产品 / Lead 与 运营 / Steward，不伪造完成。
//
// 本文件只钉住 `VERIFIER_CARD_TEXT` 的文本语义与注册表数据面；`report_artifact_ready` 的工具实现、
// 应用自动派发文案与运行时/桌面/编排改动不在门禁引擎边界内。既有验收标准结构、证据、风险档位、
// 版本冻结、`view_image` 不得假看、gate 复核与验收分诊等安全检查必须保留。
// 2026-10-27 O2（gate-review-return-routing）：Proof 卡补充同一轮复核的 `[Gate 报告补正]` 与
// `[Gate 报告不可读提醒]` 系统任务（应用机械发送、不是客户消息/新复核轮次/改判要求；补正只改
// 报告结构、不标 flow done、不改写客户决定、不重开返工）；基线 gate 纪律逐字保留。

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

test("2026-10-27 工件就绪汇报：Proof 写完验收标准后调用 report_artifact_ready（flowId/stepId/path/summary）向应用汇报，等待 accepted；拒绝/缺失修正后重报；仍未继续则报告产品/运营", () => {
  const v = governanceRoleOf("verifier")!.cardText;

  assertIncludesAll(
    v,
    [
      // 工具名与调用形状（四个参数都写死）。
      "report_artifact_ready",
      "`report_artifact_ready({ flowId, stepId, path, summary })`",
      "flowId",
      "stepId",
      "path",
      "summary",
      // 只向应用汇报，由应用校验并决定收口；等待应用 `accepted`。
      "向应用汇报",
      "由应用校验并决定是否收口",
      "**等待应用 `accepted`**",
      "`accepted` 表示应用已校验并接受该产物；是否收口由应用决定",
      // 被拒绝 / 缺失时修正后重新汇报；汇报成功 ≠ 自动完成。
      "回执为拒绝 / 标准缺失时按回执修正后重新汇报",
      "拒绝 / 缺失时按回执修正后重新汇报",
      "不把提交当 `accepted`",
      // 应用决定后仍未继续：如实报告产品 / 运营，不伪造完成。
      "应用 `accepted` 后若流程仍未继续",
      "应用决定后流程仍未继续时",
      "如实报告 产品 / Lead 与 运营 / Steward",
      "不伪造完成",
      // 标准就绪汇报发生在实施开始前，标准冻结规则保留。
      "实施开始后不得改标准适配候选",
    ],
    "Proof 工件就绪汇报",
  );

  // 顺序：先写标准并要求汇报 / 等待 accepted，再进入标准冻结说明。
  const reportAt = v.indexOf("report_artifact_ready");
  const freezeAt = v.indexOf("实施开始后不得改标准适配候选");
  assert.ok(reportAt >= 0, "卡文本须写 report_artifact_ready");
  assert.ok(reportAt < freezeAt, "工件就绪汇报须写在标准冻结规则之前（实施前标准阶段）");

  // 旧「标准落盘后等应用派发 / 自己标状态」绝对句按新语义调整，不得复现。
  for (const legacy of [
    "标准落盘且结构合格后才允许实施派发",
    "等应用派发",
    "等待应用派发",
  ]) {
    assert.equal(v.includes(legacy), false, `Proof 卡不得保留旧「${legacy}」绝对句`);
  }
});

test("2026-10-27 工件就绪汇报：Proof 不自行 flow_step_update 改状态、不自批；done 只由应用收口；gate 步骤例外保留", () => {
  const v = governanceRoleOf("verifier")!.cardText;

  assertIncludesAll(
    v,
    [
      // 新语义：不自行改步骤状态、不自批。
      "你不自行改步骤状态、不要自己标 `done`、不自批",
      "不得自行用 `flow_step_update` 改步骤状态",
      "不得用 `flow_step_update` 把任何步骤从 `pending` 改成 `dispatched` / `delivered` / `done`",
      "不得用 `failed` / `blocked` 掩盖缺口",
      "`done` 只能由应用收口",
      // gate 步骤既有例外逐字保留。
      "含 `gateKind` 的 gate 步骤（owner: verifier）不由你更新状态",
      "`done` 只能由应用按 gate 报告收口",
      "你不对 gate 步骤做 `flow_step_update`",
      // 验收卡决定仍走客户卡，不用流程状态代替。
      "不用 `flow_step_update` 代替客户验收决定",
      "步骤推进不等于客户决定/同意",
    ],
    "Proof 不自批与 gate 例外",
  );

  // 反向断言：旧「可以把 owner=自己的步骤更新到 delivered / done 由 Steward 收口」口径不得残留。
  for (const forbidden of [
    "你只能把 owner=自己的步骤更新到 `delivered`",
    "核对完成且账本证据齐备时，用 `flow_step_update` 记录 `delivered`",
    "`done` 由 Steward / Lead 核对账本证据后标记",
    "可以把自己步骤更新到 `done`",
  ]) {
    assert.equal(v.includes(forbidden), false, `Proof 卡不得保留旧状态权限「${forbidden}」`);
  }
  assert.doesNotMatch(
    v,
    /(可以把自己步骤|允许自己|自行更新到|自行改成).{0,8}`done`/,
    "Proof 卡不得出现自行标 done 的肯定式表述",
  );
});

test("2026-10-27 工件就绪汇报：既有验收标准结构/证据/风险档/冻结/不得假看/gate/分诊等安全检查逐项保留", () => {
  const v = governanceRoleOf("verifier")!.cardText;

  assertIncludesAll(
    v,
    [
      // 验收标准结构、风险档位、判定规则与版本冻结。
      "docs/acceptance/<flowId>-criteria-v1.md",
      "验收表",
      "风险档位 T0–T3 与依据",
      "选定检查/复用规则/全量回归条件",
      "成功/失败/边界情形",
      "判定规则（pass / fail / insufficient evidence / not applicable）",
      "版本冻结规则",
      "实施开始后不得改标准适配候选，确需变更时递增版本、记录理由并交沟通/运营确认",
      // 证据与真实启动/演示要求。
      "docs/scheduling/<flowId>-change-v1.md",
      "同候选、同输入/依赖、同命令的证据可复用",
      "你只能升档、不能降档",
      "用审批档 shell 亲自复跑",
      "真实启动应用并演示",
      "未真实运行、未演示不得建议 accept",
      // 图片证据不得假看。
      "**必须对项目内证据图片调用 `view_image`**",
      "图片尚未提供 / 未返回时不得假装已看",
      "**UI / 游戏截图仍必须关闭 DEBUG 覆盖层**",
      "**不得用「文件存在」冒充看过图**",
      "如实写 `insufficient evidence`",
      // gate 复核与验收分诊。
      "gate 复核**独立于最终验收**",
      "不发验收卡、不写 `customer.decision`、不实现、不派发、不标 flow 步骤 done",
      "acceptance-triage/v1",
      // 验收权 / 验收卡不变。
      "不拥有最终批准权",
      "`cardKind=acceptance`",
      "`accept` / `reject`",
    ],
    "Proof 既有安全检查保留",
  );
});

test("2026-10-27 工件就绪汇报：只改卡文本——注册表数据面（角色顺序/entries/预授权/能力位）零变化", () => {
  // 六角色注册表仍在且顺序不变（批次 A 身份层）。
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((s) => s.id),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
  );

  const verifier = governanceRoleOf("verifier")!;
  assert.equal(verifier.displayName, "质检");
  assert.equal(verifier.function, "verification");
  assert.deepEqual(verifier.entries.map((e) => e.path), [
    "docs/acceptance/",
    "docs/verification/",
    "docs/governance/verifier/",
  ]);
  assert.deepEqual(verifier.preauthorizedDirs, [
    "docs/acceptance/",
    "docs/verification/",
    "docs/governance/verifier/",
  ]);
  // 能力位逐项零变化：不新增工具能力、不获得派发/任命/安装/流程推进权；shell 仍为审批档。
  assert.deepEqual(verifier.capabilities, {
    customerInput: true,
    handOffIntent: false,
    requestClarification: false,
    dispatchTask: false,
    roleStatus: false,
    sessionTail: false,
    proposeRecovery: false,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
  });
  // 写权仍是 Section 1 三目录；禁止写路径与既有禁写语义不因本批变化。
  assert.ok(verifier.forbiddenWritePaths.includes("docs/flows/"), "Proof 仍禁写 docs/flows/");
  assert.ok(verifier.forbiddenWritePaths.includes("角色卡/verifier/"), "Proof 仍禁写 角色卡/verifier/");
  assert.ok(verifier.forbiddenWritePaths.includes(".ans/"), "Proof 仍禁写 .ans/");
});

// —————————————————————— 2026-10-27 O2：Proof 卡 gate 报告补正 / 报告不可读提醒（gate-review-return-routing） ——————————————————————

test("2026-10-27 O2：Proof 卡补充同轮复核的 Gate 报告补正与报告不可读提醒（应用机械任务、不是新复核轮次、不要求改判；补正不越权）", () => {
  // 闸门 1 已选 O2（Q9 A，范围收窄）：Proof 卡说明会收到应用同一轮复核的
  // `[Gate 报告补正]` 与 `[Gate 报告不可读提醒]` 系统任务——来源是应用、不是客户消息 / 新复核
  // 轮次 / 改判要求；补正只改报告结构、按标准重核，不标 flow done、不改写客户决定、不重开返工。
  const v = governanceRoleOf("verifier")!.cardText;

  assertIncludesAll(
    v,
    [
      "## Gate 报告补正与报告不可读提醒（应用系统任务，必须）",
      "`[Gate 报告补正]`",
      "`[Gate 报告不可读提醒]`",
      // 来源：应用机械发送，不是客户 / 主理 / 统筹重新发起的复核请求。
      "由**应用**机械发送",
      "不是客户消息",
      "不是产品 / Lead 的发言",
      "也不是运营 / Steward 重新发起的复核请求",
      // 同一轮复核的机械补正：不是新复核轮次、不改复核对象、不要求改判 pass。
      "属于**同一轮**复核（`requestId` 未变、候选未变）的机械补正",
      "**不是新一轮复核、不改变复核对象，也不要求你改判 `pass`**",
      "内容判定仍由你按 gate 复核标准独立做出",
      "按错误清单修正报告结构、按标准重新核对",
      "不得为迎合任务改判",
      "不得把补正提醒当成客户批准",
      // 补正边界：只改报告结构、版本化不覆盖；不标 flow done、不写账本/客户决定、不重开返工。
      "只补正 gate 报告结构 / 按标准重新核对并写版本化新报告",
      "不覆盖旧版本",
      "不标任何 flow 步骤 `done`",
      "不写 flow / 账本 / `customer.decision`",
      "不改写客户决定",
      "不替运营 / Steward 重开返工或改变返工范围",
      "提醒本身不创建退回状态",
      "应用会在观测到新报告版本时机械复核",
      // 基线 1465833 的既有 gate 纪律保留（不触发返工、minor/nit fail 属结构不符）。
      "应用会退回你补报告，**不触发返工**",
      "只有 `minor` / `nit` 的 fail 属结构不符",
    ],
    "Proof O2 gate 报告补正与不可读提醒",
  );

  // 通道归属与越权边界不变：Proof 不定义统筹专用工具，也不出现 flow-busy / 自动通过 / 派 worker 表述。
  for (const forbidden of [
    "request_gate_review",
    "request_acceptance",
    "flow-busy",
    "应用会自动通过",
    "应用可自动通过",
    "应用可派 worker",
    "质检可以标 gate done",
  ]) {
    assert.equal(v.includes(forbidden), false, `Proof 卡不得出现越权/越界表述「${forbidden}」`);
  }
});
