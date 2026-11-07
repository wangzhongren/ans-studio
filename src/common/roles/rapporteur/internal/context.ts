// 内部文件：rapporteur `context()` 纯策略（静态提示块 / 决策上下文 / 报告期望 / decision 卡数据）。
//
// 约束（契约 §3.3 第 7 条 / D5）：
//  - `context().text` 是本模块自有静态模板；不嵌入运行时秘密、账本内容或未脱敏证据；
//  - 本实现**不读 `facts`**，也不声明资源引用（rapporteur 无专属资源文件；项目 `docs/workflow.md`
//    不是角色模块资源，由宿主在上下文装配时另行提供）；
//  - 不读盘、无 I/O、无状态；同一输入返回同一内容。

import type { GovernanceModel, RoleContextInput, RoleContextSection } from "../../../../model/role.ts";

const ROLE_IDENTITY_TEXT = [
  "你是产品内置策划角色（rapporteur）。职责：据产品意图文档产出策划方案、人员名单、项目架构与提案/契约。",
  "只写 Section 1：`docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/`；不写角色卡、不招人、不实现、不改产品意图、不写其他角色资料。",
  "角色模块只提供数据与纯策略；工具/能力是否可用一律以本会话实际注入为准——未注入即不存在，不得虚构已获得的能力、批准或激活。",
].join("\n");

const DECISION_CONTEXT_TEXT = [
  "决策上下文：",
  "- detail-amendment：用实际注入的 `submit_version_change(kind=detail-amendment)` **整单**提交，应用校验通过直接生效；不发提案接受、VCA 批拒、修正案逐项/最终卡，不进旧批准器。涉及产品升级交产品；修正不得通过修正扩大授权。",
  "- run-change：只有策划可经 `select_run_change` 显式选择 `continue-frozen`（仅登记、旧 pin 不变）/ `stop-and-restart`（先停稳旧链并核部分产物/授权，冻结完整新依据后重核依赖再新派）/ `stop`（停止旧链，不自动回滚文档 trunk）。绑定 runId/pinDigest、目标 trunk version/digest、理由与 operationId；过期 pin/目标摘要拒绝，停稳不明不得新派。停稳证据由 Service/宿主核验，本模块不采集。",
  "- requirement-change：需要新授权/范围/约束/成本时用实际注入的 `request_requirement_change` 提交申请；申请≠批准、不代表意图已变更；发起方不得自批；不得把未批准的新授权塞进提案卡。",
  "- 缺事实/未知一律拒绝（fail-closed）；纯策略的 allow 只表示不反对，不是权限票；Service/Provider 的最终校验不因本策略而省略。",
].join("\n");

const REPORT_EXPECTATION_TEXT = [
  "报告期望：",
  "- 任务完成或阻塞必须用 `submit_report` 回真实创建者（`task.created.from`，通常为幕僚 chief）；报告不是任务关闭，不能自行收口任务。",
  "- 不得自报他人身份、伪造客户批准/决定或把准备/通知当作生效；真实回执原样转达。",
  "- 回退与恢复：保留 pin、候选/基线完整标识、拒绝码与真实错误证据，交原创建者与责任 owner；旧 run 停稳不明交运营核实，不自造已停止、不新派。",
].join("\n");

const DECISION_CARD_TEXT = [
  "decision 卡数据：",
  "- rapporteur 可发起卡种：`proposal`、`decision`。`decision` 卡仅用于需求变更审批（材料性选择），不得冒充提案/验收批准。",
  "- decision 卡结构：`request_choice`（choice）；合法 `flowId`；至少 2 个不重复选项；恰有一个 `recommended: true` 推荐项；发起方持有该卡但不得自批，审批人只有客户或「替我决策」判断 agent。",
  "- decision 卡不触发门禁/验收，不进入 `latestAcceptanceDecision`，也不能替代 shell/下载/写入等专门执行审批。",
].join("\n");

const SINGLE_MODEL_TEXT =
  "治理模型不是 trio：rapporteur 是 trio 内置角色，在本模型下不可开启、不可写入；不得据此推断任何可用能力或权限。";

const CONTEXT_FACTS_REJECTED_TEXT =
  "上下文事实被拒绝：rapporteur 角色模块未登记任何 context fact 键，宿主提供的 facts 未被读取；不得据此推断角色上下文或权限。";

const SECTION_ROLE = Object.freeze({ id: "rapporteur-role", text: ROLE_IDENTITY_TEXT });
const SECTION_DECISION_CONTEXT = Object.freeze({ id: "rapporteur-decision-context", text: DECISION_CONTEXT_TEXT });
const SECTION_REPORT = Object.freeze({ id: "rapporteur-report-expectation", text: REPORT_EXPECTATION_TEXT });
const SECTION_DECISION_CARD = Object.freeze({ id: "rapporteur-decision-card", text: DECISION_CARD_TEXT });
const SECTION_MODEL_UNAVAILABLE = Object.freeze({ id: "rapporteur-governance-model", text: SINGLE_MODEL_TEXT });
const SECTION_FACTS_REJECTED = Object.freeze({ id: "rapporteur-context-facts-rejected", text: CONTEXT_FACTS_REJECTED_TEXT });

const TRIO_SECTIONS: readonly RoleContextSection[] = Object.freeze([
  SECTION_ROLE,
  SECTION_DECISION_CONTEXT,
  SECTION_REPORT,
  SECTION_DECISION_CARD,
]);

const NON_TRIO_SECTIONS: readonly RoleContextSection[] = Object.freeze([SECTION_MODEL_UNAVAILABLE]);
const FACTS_REJECTED_SECTIONS: readonly RoleContextSection[] = Object.freeze([SECTION_FACTS_REJECTED]);

/**
 * facts 是否为“未提供”：`undefined` 或空普通对象视为未提供；其它任何值（含非对象/数组/非空对象）
 * 都是未登记的上下文事实 ⇒ fail-closed（不读取、不静默当空值）。
 */
function hasUnregisteredContextFacts(input: RoleContextInput): boolean {
  const facts = (input as { facts?: unknown } | null | undefined)?.facts;
  if (facts === undefined) return false;
  if (typeof facts !== "object" || facts === null || Array.isArray(facts)) return true;
  return Object.keys(facts).length > 0;
}

/**
 * 纯函数：按治理模型返回静态提示块。
 * - 非 trio/未知 ⇒ 单一「不可用」声明（fail-closed）；
 * - 传入任何未登记的上下文事实 ⇒ 单一「事实被拒绝」声明（fail-closed，不读取 facts）；
 * - `trio` 且未提供 facts ⇒ 身份 / 决策上下文 / 报告期望 / decision 卡数据（顺序稳定）。
 */
export function contextSections(input: RoleContextInput): readonly RoleContextSection[] {
  const governanceModel =
    typeof input === "object" && input !== null ? (input as { governanceModel?: GovernanceModel }).governanceModel : undefined;
  if (governanceModel !== "trio") return NON_TRIO_SECTIONS;
  if (hasUnregisteredContextFacts(input)) return FACTS_REJECTED_SECTIONS;
  return TRIO_SECTIONS;
}
