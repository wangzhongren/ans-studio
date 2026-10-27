// app/desktop/governance-advance.ts
// 治理三权（Rapporteur / Nominator / Convener）**应用代客户推进流程的纯逻辑**（2026-10-18 客户修正）。
//
// 客户原话：「这个不是应该自动的转发人物给后续流程吗」——提案接受后界面只显示「请切换到 nominator」，
// 客户期望接受提案后自动进入下一角色/步骤。修正后的行为（覆盖早先「发事件让 UI 打开会话」）：
// **接受提案后不打开/切换任何会话**；由应用直接把下一步任务派给目标治理角色、在后台运行。
//
// 本模块只做两件**无副作用**的事：
//   1. `deriveGovernanceNextStep`：按 `cardKind` + 客户实际选择推导下一步（nomination / schedule / 无）；
//   2. `buildGovernanceAdvanceMessage`：按推导结果生成**唯一一条**任务消息（客户给定文案）。
//
// 2026-10-18 真机修正（四角色闭环）：`proposal` 被**接受**时不再直接派 Nominator——此时
// `docs/flows/<flowId>.yaml`（唯一机器状态；2026-10-19 客户决定「这些全部改成yaml。」）还不存在
// （应由 Convener 先写），直接派只会让它反复猜路径、大量读失败。
// 现改为两段式：先派 Convener 写流程状态 YAML（首步提名；`followUp:"nomination-after-flow"`），
// 应用在 Convener 本轮真正空闲后检查 YAML 是否落盘且可解析；落盘 ⇒ 再派 Nominator（消息带 YAML 路径），
// 缺失/非法/超时 ⇒ 系统行如实报错、**不循环重试**。`accept-quick`/`appointment` 仍单段派 Convener。
//
// 纪律（沿 customer-input.ts 的同一套）：
//  - 只认 `CustomerInputOutcome` 里**客户实际作出**的决定，不采信角色自述；取消/拒绝/expired 不推导；
//  - `nextFunction=null` = 明确「没有下一步」（验收收口 / 普通写盘 / 修订 / 拒绝）——由调用方如实呈现，
//    **不猜测**；
//  - 不写 `.ans`/账本、不发送任何批准、不自动批准；派发只由调用方（main/Interface）执行；
//  - `proposalPath` 只在请求/选项**显式提供**时透传；缺席就省略（生成消息时按 flowId 回退到 v1 路径，
//    这是客户给定的文案模板，不是对文件系统的猜测）。

import type {
  CustomerInputOutcome,
  CustomerInputRequest,
  GovernanceCardKind,
  HandOffIntentPayload,
} from "../../src/model/runtime.ts";
// 2026-10-25 验收分诊：只读消费编排 Pipeline 公共出口的**类型**（解析/建议/记录实现在编排；本模块只做文案）。
import type {
  AcceptanceTriageRecommendation,
  AcceptanceTriageSection,
  AcceptanceTriageSeverity,
} from "../../src/pipeline/orchestration/flow-state.ts";
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
import { mainT } from "./i18n.ts";

/**
 * 下一步治理职能（客户契约固定词）。
 *
 * 2026-10-22 治理分工第 1 项（方案 §5.3）：新增 `role-card-write`——客户 appointment 决定后
 * 由**应用派 Crew 写角色卡/边界/工作文档**（不再派 Convener 排程）。旧 `nomination` 保留为
 * legacy（旧提名两段式迁移兼容）。
 */
export type GovernanceNextFunction = "nomination" | "schedule" | "role-card-write";

/** 下一步目标内置治理角色（客户契约固定词，与 `BUILT_IN_GOVERNANCE_ROLES` 的 id 一致）。 */
export type GovernanceNextRoleId = "nominator" | "convener";

/**
 * 主→渲染事件 `governance:next-step` 的载荷（客户已定契约，**不改名**）。
 * `nextFunction`/`roleId` 同步为 null：表示「本次决定后没有下一步」（验收收口、写盘确认、修订/拒绝）。
 */
export interface GovernanceNextStepPayload {
  version: 1;
  flowId?: string;
  cardKind: GovernanceCardKind;
  nextFunction: GovernanceNextFunction | null;
  roleId: GovernanceNextRoleId | null;
  proposalPath?: string;
  /**
   * **两段式闭环标记（2026-10-18 真机修正）**：`proposal` 被**接受**时先由 Convener 写
   * `docs/flows/<flowId>.yaml`（唯一机器状态，首步提名）；YAML 落盘且可解析后应用再派 Nominator。
   * `accept-quick`/`appointment` 没有本字段（直接由 Convener 排程）。
   */
  followUp?: "nomination-after-flow";
}

/**
 * 治理流程**人读视图**的项目相对路径。2026-10-19 客户决定「这些全部改成yaml。」后，机器状态在
 * `docs/flows/<flowId>.yaml`（`governanceFlowStatePath`）；本函数只用于：人读视图文案、legacy Markdown
 * 回退门与迁移提示。**不得**再用于要求角色写机器状态或门禁核对（那些一律用 YAML 路径）。
 */
export function governanceFlowPath(flowId: string): string {
  return `docs/flows/${flowId}.md`;
}

/**
 * 治理流程**机器状态**的项目相对路径（2026-10-19 客户决定：`docs/flows/<flowId>.yaml` 是唯一机器状态，
 * stepId/kind/status/evidence/supersedes；同名 `.md` 仅可选人读视图、不承载门禁状态）。
 * 任务文案、落盘检查与验收门建议一律用它；实现/校验归编排 `src/common/编排/flow-state.ts`。
 */
export function governanceFlowStatePath(flowId: string): string {
  return `docs/flows/${flowId}.yaml`;
}

// —————————————— 2026-10-22 治理分工第 1/3/5 项：调度/验收产物路径（唯一文案来源） ——————————————
//
// 路径约定见策划方案 §5.1/§6.4/§7.1；本模块只做**字符串派生**，不读盘、不猜版本。
// 版本扫描/结构解析在 Interface（`findLatestVersionedArtifact`）与编排（`latestVersionedArtifact`）各一处，
// 本函数给的是任务文案里的**默认 v1 路径**（与客户给定模板同口径）。

/** 团队计划默认路径（`docs/scheduling/<flowId>-team-v1.md`；v2… 由调用方带版本）。 */
export function governanceTeamPlanPath(flowId: string, version = 1): string {
  return `docs/scheduling/${flowId}-team-v${version}.md`;
}

/** 角色就绪复核记录默认路径（`docs/scheduling/<flowId>-readiness-v1.md`）。 */
export function governanceReadinessPath(flowId: string, version = 1): string {
  return `docs/scheduling/${flowId}-readiness-v${version}.md`;
}

/** 实施前验收标准默认路径（`docs/acceptance/<flowId>-criteria-v1.md`）。 */
export function governanceAcceptanceCriteriaPath(flowId: string, version = 1): string {
  return `docs/acceptance/${flowId}-criteria-v${version}.md`;
}

/** 验收报告默认路径（`docs/acceptance/<flowId>-report-v1.md`；详细附件仍在 `docs/verification/`）。 */
export function governanceAcceptanceReportPath(flowId: string, version = 1): string {
  return `docs/acceptance/${flowId}-report-v${version}.md`;
}

/**
 * Gate 复核报告默认路径（`docs/acceptance/<flowId>-<gateId>-report-vN.md`；2026-10-26 客户授权
 * `request_gate_review`，设计 §6.2）。与最终验收报告 `docs/acceptance/<flowId>-report-vN.md` **命名不
 * 冲突**；版本化、不覆盖，重验取 N+1。唯一实现仍是编排公共出口的 `gateReviewReportRelPath`（本函数只
 * 供任务文案的默认路径派生；版本扫描由 `latestGateReviewReport` 负责）。
 */
export function governanceGateReviewReportPath(flowId: string, gateId: string, version = 1): string {
  return `docs/acceptance/${flowId}-${gateId}-report-v${version}.md`;
}

/** 变更包默认路径（`docs/scheduling/<flowId>-change-v1.md`）。 */
export function governanceChangePackagePath(flowId: string, version = 1): string {
  return `docs/scheduling/${flowId}-change-v${version}.md`;
}

/** 风险档位（与技能 `references/testing.md` 唯一口径一致；不是 `qualityTier`）。 */
export type GovernanceRiskTier = "T0" | "T1" | "T2" | "T3";

/** 流程单的步骤状态（触发「收尾推进」用的保守解析；最终验收仍由编排 driver 机械核对）。 */
export interface FlowStepStatus {
  id: string;
  status: string;
}

function stripFlowCell(value: string): string {
  return value.trim().replace(/^[`*_]+/, "").replace(/[`*_]+$/, "").trim();
}

function splitFlowRow(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return undefined;
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

/**
 * 流程步骤状态的**首词规范化**（2026-10-19 真机：状态列写作「状态 + 说明」或 Markdown 强调）。
 *
 * 流程单由 Steward 按模板自然写出，状态单元格常见 `done（有落盘/回交证据；…）`、
 * `pending（不由统筹派发）`、`done：xxx` 这类「引导状态词 + 说明」写法，也常见
 * `**done**（…）`、`__done__`、`` `done` `` 这类 Markdown 强调/代码标记写法。判定只看引导 token：
 * 先剥掉首尾空白与标记字符（`*`、`_`、反引号），再取首词，并剥掉紧贴状态词尾的闭合标记
 * （`**done**（…）` 的闭合 `**` 位于说明文字之前，不在单元格末尾）；大小写不敏感。
 * 后接空白、`（`、`(`、`：`、`:` 或结束即截止，说明文字不参与比较；空/纯标记 ⇒ `""`。
 * **不修改** `parseFlowStepStatuses` 输出的原始 `status`（展示仍用原文），只在判定处调用本函数。
 */
export function normalizeFlowStepStatus(status: string): string {
  if (typeof status !== "string") return "";
  const trimmed = status.replace(/^[\s`*_]+/, "").replace(/[\s`*_]+$/, "");
  const match = /^[^\s（(：:]+/.exec(trimmed);
  if (match === null) return "";
  return match[0].replace(/[`*_]+$/, "").toLowerCase();
}

/**
 * 解析流程单的「步骤/状态」表（**触发门**，不是验收判定）：表头须同时含「步骤/step」与「状态/status」；
 * 缺表头/无数据行 ⇒ `wellFormed:false`（调用方 fail-closed 不派）。
 *
 * 列选择（2026-10-19 真机）：canonical 流程单是 `| stepId | 步骤 | 状态 |` 三列（见
 * `governance-gate.parseFlowStepIds` 以首列为步骤 id 的同一约定）。表头含显式 id 列
 * （`stepId`/`step-id`/`步骤id`/`id`）时**优先**用它作为步骤 id；否则沿用「步骤/step」列。
 * 输出形状保持 `{ id, status }` 不变，`status` 仍是单元格原文。
 */
export function parseFlowStepStatuses(markdown: string): { wellFormed: boolean; steps: FlowStepStatus[] } {
  if (typeof markdown !== "string" || markdown.trim() === "") return { wellFormed: false, steps: [] };
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let headerIndex = -1;
  let stepColumn = -1;
  let statusColumn = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const cells = splitFlowRow(lines[index]!);
    if (cells === undefined) continue;
    const step = cells.findIndex((cell) => /^(步骤|step)$/i.test(stripFlowCell(cell)));
    const status = cells.findIndex((cell) => /^(状态|status)$/i.test(stripFlowCell(cell)));
    if (step !== -1 && status !== -1) {
      headerIndex = index;
      const explicitId = cells.findIndex((cell) => /^(stepid|step-id|步骤id|id)$/i.test(stripFlowCell(cell)));
      stepColumn = explicitId !== -1 ? explicitId : step;
      statusColumn = status;
      break;
    }
  }
  if (headerIndex === -1) return { wellFormed: false, steps: [] };
  const steps: FlowStepStatus[] = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = splitFlowRow(lines[index]!);
    if (cells === undefined) break;
    if (cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()))) continue;
    if (cells.length <= Math.max(stepColumn, statusColumn)) return { wellFormed: false, steps: [] };
    const id = stripFlowCell(cells[stepColumn]!);
    const status = stripFlowCell(cells[statusColumn]!);
    if (id === "") continue;
    steps.push({ id, status });
  }
  return { wellFormed: true, steps };
}

/** 收尾检查所需的最小账本形状（结构类型；不 import 编排私有账本类型）。 */
export interface FlowCompletionLedgerEntryLike {
  kind?: string;
  flowId?: string;
  stepId?: string;
  decisionKind?: string;
  customerDecision?: string;
  /** 仅 dispatch.accepted / customer.decision：目标角色（验收派发去重与客户决定证据用）。 */
  targetRoleId?: string;
  actorRoleId?: string;
  /** 仅 artifact.observed：项目相对产物路径。 */
  artifactPath?: string;
  /** 2026-10-20：账本时间（ISO；验收派发时间比较用——flow 更新后允许重派）。 */
  at?: string;
}

/** 验收步骤的流程单写法（2026-10-18 真机：nomination/delivery/**verification**；旧版用 `acceptance`）。 */
const VERIFICATION_STEP_IDS: ReadonlySet<string> = new Set(["acceptance", "verification"]);

/**
 * **已作废**的步骤状态（`normalizeFlowStepStatus` 归一化后）：步骤被替代（`superseded`）或取消
 * （`cancelled`），按约定视为非执行步骤——不参与**执行步骤**的「未完成」判定，也不要求 dispatch
 * 证据。它们**不算 done**（验收步骤的 done 判定仍只认 `done`）；未知状态一律不在此列、照旧阻塞。
 */
const VOIDED_FLOW_STEP_STATUSES: ReadonlySet<string> = new Set(["superseded", "cancelled"]);

/**
 * `flowCompletionIssue` 的**终态原因**（2026-10-19 客户反馈「这个难道不是bug吗」的可见性修复）：
 * 这两条表示流程已经收口（验收步骤已完成 / 已有验收决定），自动派发本就不该再发生——不是需要
 * 修复的阻塞。文案与 `flowCompletionIssue` 返回**同源**（常量唯一），供阻塞系统行区分建议措辞。
 */
const FLOW_COMPLETION_TERMINAL_ACCEPTANCE_DONE = "验收步骤已完成";
const FLOW_COMPLETION_TERMINAL_ACCEPTANCE_DECIDED = "该流程已有验收决定";
const FLOW_COMPLETION_TERMINAL_REASONS: ReadonlySet<string> = new Set([
  FLOW_COMPLETION_TERMINAL_ACCEPTANCE_DONE,
  FLOW_COMPLETION_TERMINAL_ACCEPTANCE_DECIDED,
]);

/**
 * 机器状态 YAML（编排 `evaluateFlowCompletion`）的终态原因**前缀**：已收口/验收已派发的固定文案
 * （`验收步骤已完成，流程已收口…` / `该流程已有验收决定…` / `验收步骤状态为 dispatched…`）。
 * 与 legacy 精确集合并列使用；原因片段可能被 `；` 拼接，判定按片段逐条进行。
 */
const FLOW_COMPLETION_TERMINAL_PREFIXES: readonly string[] = [
  FLOW_COMPLETION_TERMINAL_ACCEPTANCE_DONE,
  FLOW_COMPLETION_TERMINAL_ACCEPTANCE_DECIDED,
  "验收步骤状态为",
];

/** 所有原因片段都是终态 ⇒ 无需操作（混合原因仍给可操作建议，避免把可修复项误报为收口）。 */
function isTerminalFlowCompletionIssue(issue: string): boolean {
  const segments = issue
    .split("；")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");
  if (segments.length === 0) return false;
  return segments.every(
    (segment) =>
      FLOW_COMPLETION_TERMINAL_REASONS.has(segment) ||
      FLOW_COMPLETION_TERMINAL_PREFIXES.some((prefix) => segment.startsWith(prefix) || segment.includes(prefix)),
  );
}

// ————————————————— 2026-10-19 客户反馈：「独立核准应该是标准流程」 —————————————————
//
// 真机现象：交付全部 done、测试 155/155、e2e 104/104 后验收派发门没有自动打开——旧门要求**每个执行步骤**
// 都有 `dispatch.accepted`，而 nomination / roles-ready / contract-freeze 这类治理步骤由客户决定或产物
// 完成、从不经应用派发，门永远打不开。修正：按步骤类型认证据（映射表显式、可测试、不猜）。

/** 完成证据的类型（按 stepId 词形显式映射；默认派发型＝旧口径）。 */
export type FlowStepEvidenceKind = "dispatch" | "decision" | "artifact";

interface FlowStepEvidenceRule {
  readonly kind: FlowStepEvidenceKind;
  readonly test: (stepId: string) => boolean;
}

/**
 * 步骤 id → 证据类型的**显式映射表**（顺序即优先级；未命中 ⇒ 派发型，行为与 2026-10-18 旧口径一致）。
 * 只按 stepId 词形匹配，**绝不**从状态文本或自然语言推测；新增步骤种类只能改这张表并补测试。
 *
 * · 产物型：契约冻结（`contract-freeze*`）、提案/流程单写入（`proposal*`/`flow*`/`schedule*`）、
 *   团队计划（`team-plan*`；2026-10-22 第 1 项）；
 * · 客户决定型：提名/角色就绪（`nomination*`、`role-readiness`、`roles-ready`、`role-ready`）；
 * · 派发型：`delivery-*`、`*e2e*`、`cleanup*`、`rework-*`、`integration-*`、`verify-*` 及所有未知 id。
 */
const FLOW_STEP_EVIDENCE_RULES: readonly FlowStepEvidenceRule[] = [
  { kind: "artifact", test: (id) => /^contract-freeze(?:$|[-_.])/i.test(id) },
  { kind: "artifact", test: (id) => /^(?:proposal|flow|schedule)(?:$|[-_.])/i.test(id) },
  // 2026-10-22 第 1 项（方案 §5.6）：团队计划是产物型；旧 `nomination*` 保持客户决定型（legacy）。
  { kind: "artifact", test: (id) => /^team-plan(?:$|[-_.])/i.test(id) },
  { kind: "decision", test: (id) => /^(?:nomination|nominations|role-readiness|roles-ready|role-ready)(?:$|[-_.])/i.test(id) },
];

/** 步骤类型（纯函数；映射表是唯一来源，供测试与诊断使用）。 */
export function flowStepEvidenceKind(stepId: string): FlowStepEvidenceKind {
  for (const rule of FLOW_STEP_EVIDENCE_RULES) {
    if (rule.test(stepId)) return rule.kind;
  }
  return "dispatch";
}

/** 可计为「已完成」的客户决定结果（rejected/changes-requested/none 一律不算完成证据）。 */
const RESOLVED_CUSTOMER_DECISIONS: ReadonlySet<string> = new Set(["accepted", "accepted-quick", "appointed"]);

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** 流程单里**显式声明**的产物路径（docs/contracts/**、docs/proposals/**）——路径映射只认声明，不猜。 */
function declaredArtifactPaths(markdown: string, directory: "contracts" | "proposals"): ReadonlySet<string> {
  const pattern = new RegExp(`docs/${directory}/[^\\s\`"'()（）\\[\\]]+\\.md`, "g");
  const found = markdown.match(pattern) ?? [];
  return new Set(found.map(normalizeRelativePath));
}

function artifactEvidenceMatches(
  stepId: string,
  flowId: string,
  markdown: string,
  entries: readonly FlowCompletionLedgerEntryLike[],
): boolean {
  const observed = entries.filter(
    (entry): entry is FlowCompletionLedgerEntryLike & { artifactPath: string } =>
      entry.kind === "artifact.observed" && typeof entry.artifactPath === "string" && entry.artifactPath.trim() !== "",
  );
  if (observed.length === 0) return false;
  const pathOf = (entry: FlowCompletionLedgerEntryLike & { artifactPath: string }): string => normalizeRelativePath(entry.artifactPath);
  if (/^contract-freeze(?:$|[-_.])/i.test(stepId)) {
    const declared = declaredArtifactPaths(markdown, "contracts");
    return observed.some(
      (entry) => declared.has(pathOf(entry)) || (entry.flowId === flowId && pathOf(entry).startsWith("docs/contracts/")),
    );
  }
  if (/^proposal(?:$|[-_.])/i.test(stepId)) {
    const declared = declaredArtifactPaths(markdown, "proposals");
    return observed.some(
      (entry) => declared.has(pathOf(entry)) || (entry.flowId === flowId && pathOf(entry).startsWith("docs/proposals/")),
    );
  }
  // flow/schedule 写入：流程单自身被观测，或任一携带同 flowId 的产物。
  const flowPath = `docs/flows/${flowId}.md`;
  return observed.some((entry) => pathOf(entry) === flowPath || entry.flowId === flowId);
}

function decisionEvidenceMatches(
  stepId: string,
  flowId: string,
  entries: readonly FlowCompletionLedgerEntryLike[],
): boolean {
  const personnelStep = /^(?:nomination|nominations|role-readiness|roles-ready|role-ready)(?:$|[-_.])/i.test(stepId);
  return entries.some((entry) => {
    if (entry.kind !== "customer.decision" || entry.flowId !== flowId) return false;
    if (!RESOLVED_CUSTOMER_DECISIONS.has(entry.customerDecision ?? "")) return false;
    return entry.stepId === stepId || (personnelStep && entry.decisionKind === "appointment");
  });
}

function dispatchEvidenceMatches(
  stepId: string,
  flowId: string,
  entries: readonly FlowCompletionLedgerEntryLike[],
): boolean {
  return entries.some(
    (entry) => entry.kind === "dispatch.accepted" && entry.flowId === flowId && entry.stepId === stepId,
  );
}

/**
 * 某执行步骤是否有**可机械核对**的完成证据。`dispatch.accepted` 对任何步骤都是有效记录（应用在案动作）；
 * 其余按步骤类型：客户决定型认 `customer.decision`（stepId 匹配，人事步骤另认 appointment 决定），
 * 产物型认 `artifact.observed`（flowId 匹配，或流程单显式声明的契约/提案路径匹配）。**不看 done 文本。**
 */
export function flowStepHasEvidence(
  stepId: string,
  flowId: string,
  markdown: string,
  entries: readonly FlowCompletionLedgerEntryLike[],
): boolean {
  if (dispatchEvidenceMatches(stepId, flowId, entries)) return true;
  const kind = flowStepEvidenceKind(stepId);
  if (kind === "decision") return decisionEvidenceMatches(stepId, flowId, entries);
  if (kind === "artifact") return artifactEvidenceMatches(stepId, flowId, markdown, entries);
  return false;
}

/**
 * 验收复核派发记录的**精确谓词**（2026-10-23 验收返工路由 Q4 A / 标准 P4.3、§八.4）。
 *
 * 只认两种情况，`acceptance-criteria` 等其他 verifier 派发**不计入**验收去重（否则返工后补写标准
 * 会被误当成「同版本已复核」而挡住重派）：
 *   · `stepId:"verification"`（含 app 自动派发与角色派发——既有记录口径保留）；
 *   · **旧记录**（无 `stepId`）且 `targetRoleId:"verifier"`（2026-10-20 前的账本形状）。
 */
function isAcceptanceVerificationDispatch(entry: FlowCompletionLedgerEntryLike): boolean {
  if (entry.kind !== "dispatch.accepted") return false;
  if (entry.stepId === "verification") return true;
  return (entry.stepId === undefined || entry.stepId === "") && entry.targetRoleId === "verifier";
}

/**
 * 验收复核是否**已派发过**（旧布尔口径；2026-10-20 起仅用于**无 `at` 的旧记录**兜底）：账本已有
 * stepId=verification 的 `dispatch.accepted`，或旧无 stepId 且 targetRoleId=verifier 的记录。
 * 新旧记录的版本比较请用 `acceptanceLastDispatchAtMs` + flow YAML mtime。
 */
export function acceptanceDispatchRecorded(
  flowId: string,
  ledger: { entries: readonly FlowCompletionLedgerEntryLike[] },
): boolean {
  return ledger.entries.some((entry) => entry.flowId === flowId && isAcceptanceVerificationDispatch(entry));
}

/**
 * **最近一次验收复核（verifier）派发时刻（毫秒）**（2026-10-20 真机修复；2026-10-23 收窄）。
 *
 * 真机 04:06:53 派过 verifier；之后 Lead/Steward 又加 D7 修复并更新 flow YAML（12:11:58），旧布尔去重
 * （「账本只要有过 verifier dispatch 就永久 true」）导致不再派、验收结果没回 Lead。新语义由调用方把本值
 * 与 flow YAML 的 mtime 比较：**最后一次 verifier 验收复核派发 >= flow 更新时间**才算已派；flow 比派发新
 * ⇒ stale，允许再派一次。`at` 不可解析的旧条目忽略；无记录 ⇒ undefined（走旧「无 verifier 记录」路径）。
 *
 * 2026-10-23 收窄（Q4 A / P4.3）：只认 `isAcceptanceVerificationDispatch` 的精确谓词——
 * `acceptance-criteria` 等 verifier 派发不参与验收派发时间口径。
 */
export function acceptanceLastDispatchAtMs(
  flowId: string,
  ledger: { entries: readonly FlowCompletionLedgerEntryLike[] },
): number | undefined {
  let latest: number | undefined;
  for (const entry of ledger.entries) {
    if (entry.flowId !== flowId) continue;
    if (!isAcceptanceVerificationDispatch(entry)) continue;
    if (typeof entry.at !== "string" || entry.at === "") continue;
    const at = Date.parse(entry.at);
    if (!Number.isFinite(at)) continue;
    if (latest === undefined || at > latest) latest = at;
  }
  return latest;
}

/**
 * 「流程全部完成」的**触发门**（2026-10-18 收尾推进；2026-10-19 客户反馈修正证据模型）：**执行步骤**全部
 * `done` 且每步都有**与步骤类型匹配**的机械证据、无未结算决定、尚无验收决定。返回 `undefined` = 可以派
 * Proof / 验收 出验收；否则返回人话原因（调用方只记诊断、**不派、不循环**）。本函数**不是**验收判定——
 * 验收卡仍由决策开关/判断 agent/客户手批。
 *
 * **验收步骤单列（2026-10-18 真机修正——验收鸡生蛋）**：验收步骤（`acceptance` 或 `verification`）
 * 是验收步骤本身，不能算进「执行步骤必须 done + 必须有证据」：它本就 pending，且应用用
 * `sendBackground` 派 Proof / 验收 不写 `dispatch.accepted`——若把它算进去，验收任务永远派不出去。
 * 现只对**执行步骤**（排除 `VERIFICATION_STEP_IDS`）做完成判定；验收步骤自身：缺失 ⇒ fail-closed 不派；
 * 已 `done` ⇒ 不重复派；已有 `customer.decision acceptance` ⇒ 不重复派；其余（pending/in-progress）⇒ 允许派。
 *
 * **按步骤类型认证据（2026-10-19 客户反馈「独立核准应该是标准流程」）**：不再要求每个执行步骤都有
 * `dispatch.accepted`——治理步骤（提名/角色就绪/契约冻结）由客户决定或产物完成、从不经应用派发，旧口径
 * 会让门永远打不开。证据类型映射见 `FLOW_STEP_EVIDENCE_RULES`/`flowStepEvidenceKind`，匹配规则见
 * `flowStepHasEvidence`：派发型认 `dispatch.accepted`；客户决定型认 stepId 匹配的 `customer.decision`；
 * 产物型认 `artifact.observed`（flowId 匹配或流程单显式声明的路径匹配）。任何一步既无完成状态也无匹配
 * 证据 ⇒ 仍 fail-closed 不派；**绝不放宽到只看 done 文本**。
 *
 * **状态按首词判定（2026-10-19 真机）**：流程单状态单元格是「状态 + 说明」写法
 * （`done（有落盘/回交证据；…）`、`pending（不由统筹派发）`），精确比较会把已完成的步骤误判为未完成。
 * 执行步骤与验收步骤的比较统一走 `normalizeFlowStepStatus`（只认引导 token，大小写不敏感，且剥离
 * Markdown 强调/代码标记：`**done**（…）`、`__done__`、`` `done` `` 均视为 `done`）。
 *
 * **作废步骤不阻塞（2026-10-19 真机）**：执行步骤归一化为 `superseded`/`cancelled` 表示该步骤已被
 * 替代或取消（如前端证据补充并入集成 e2e）——视为非执行步骤，不参与「未完成」与证据要求；错误详情
 * 会注明跳过。它们**不算 done**：其他未知状态照旧阻塞，验收步骤的完成判定仍只认 `done`。
 */
export function flowCompletionIssue(
  flowId: string,
  markdown: string,
  ledger: { errors: readonly string[]; entries: readonly FlowCompletionLedgerEntryLike[] },
): string | undefined {
  if (ledger.errors.length > 0) return "治理账本不可读或存在坏行";
  const parsed = parseFlowStepStatuses(markdown);
  if (!parsed.wellFormed || parsed.steps.length === 0) return "流程单缺少可解析的步骤表";
  // 验收步骤是派发目标本身，不参与「执行完成」判定（见函数注释）。
  const executionSteps = parsed.steps.filter((step) => !VERIFICATION_STEP_IDS.has(step.id));
  const acceptanceStep = parsed.steps.find((step) => VERIFICATION_STEP_IDS.has(step.id));
  // 已作废（superseded/cancelled）的执行步骤视为非执行步骤；未知状态不在此列，照旧按未完成处理。
  const voidedSteps = executionSteps.filter((step) => VOIDED_FLOW_STEP_STATUSES.has(normalizeFlowStepStatus(step.status)));
  const activeSteps = executionSteps.filter((step) => !VOIDED_FLOW_STEP_STATUSES.has(normalizeFlowStepStatus(step.status)));
  const skippedNote =
    voidedSteps.length > 0
      ? `；已跳过作废步骤（${voidedSteps.slice(0, 10).map((step) => `${step.id}=${step.status || "（空）"}`).join("、")}）`
      : "";
  const notDone = activeSteps.filter((step) => normalizeFlowStepStatus(step.status) !== "done");
  if (notDone.length > 0) {
    const detail = notDone.slice(0, 10).map((step) => `${step.id}=${step.status || "（空）"}`).join("、");
    return `流程仍有未完成/阻塞/待派发步骤（${detail}）${skippedNote}`;
  }
  const missing = activeSteps.filter(
    (step) => !flowStepHasEvidence(step.id, flowId, markdown, ledger.entries),
  );
  if (missing.length > 0) {
    const byKind: Record<FlowStepEvidenceKind, string[]> = { dispatch: [], decision: [], artifact: [] };
    for (const step of missing) byKind[flowStepEvidenceKind(step.id)].push(step.id);
    const parts: string[] = [];
    if (byKind.dispatch.length > 0) parts.push(`缺少 dispatch.accepted 记录（${byKind.dispatch.slice(0, 10).join("、")}）`);
    if (byKind.decision.length > 0) parts.push(`缺少客户决定证据（${byKind.decision.slice(0, 10).join("、")}）`);
    if (byKind.artifact.length > 0) parts.push(`缺少产物证据（${byKind.artifact.slice(0, 10).join("、")}）`);
    return `流程步骤${parts.join("；")}${skippedNote}`;
  }
  if (acceptanceStep === undefined) return "流程单缺少验收步骤";
  if (normalizeFlowStepStatus(acceptanceStep.status) === "done") return FLOW_COMPLETION_TERMINAL_ACCEPTANCE_DONE;
  const acceptance = ledger.entries.find(
    (entry) => entry.kind === "customer.decision" && entry.flowId === flowId && entry.decisionKind === "acceptance",
  );
  if (acceptance !== undefined) return FLOW_COMPLETION_TERMINAL_ACCEPTANCE_DECIDED;
  const unresolved = ledger.entries.filter(
    (entry) =>
      entry.kind === "customer.decision" &&
      entry.flowId === flowId &&
      (entry.decisionKind === "unclassified" || entry.customerDecision === "none" || entry.customerDecision === undefined || entry.customerDecision === ""),
  );
  if (unresolved.length > 0) return "该流程仍有未结算的决定";
  return undefined;
}

/**
 * 收尾推进的唯一一条任务（Rapporteur）：只引用流程状态 YAML 与回交/报告路径，要求汇总证据并**出验收卡**；
 * 不预先决定通过/退回（验收卡仍走决策开关/判断 agent 或客户手批）。
 *
 * 2026-10-19 客户批准（原话「可以，按你说的改」）：验收前最起码要**真实启动应用并向客户演示**，
 * 且按工程质量基线逐项核对——任务文本追加四条硬要求（①八项基线逐项核对 ②真实启动/演示
 * ③未演示或某项无证据不得建议 accept ④演示证据写入 `docs/verification/<flowId>-v1.md`）。
 *
 * 2026-10-19 客户批评（原话「这个感觉也没有啥架构的啊，提案角色应该也要考虑到扩展性，给出一个
 * 架构方案啊」）：追加第⑤条硬要求——按提案/变更的「架构方案或架构影响分析」核对实现（模块边界、
 * 依赖方向、扩展点、数据 schema/API 版本迁移须与声明一致）；缺失架构章节或实现偏离声明时不得
 * 建议 accept。原四条逐字不变。本函数只产出任务文本，**不是验收判定**：不改变
 * `flowCompletionIssue` 触发门、不自动批准；演示证据存在与否仍由 Proof 核对、验收卡仍由
 * 客户/判断 agent 决定。
 *
 * 2026-10-22 第 3 项（方案 §7.1/§7.4/§7.6）：报告路径改为 `docs/acceptance/<flowId>-report-v1.md`
 * （详细证据附件仍在 `docs/verification/`）；追加第⑥条——先核对实施前标准与变更包/风险档位，复用同候选
 * 有效证据，只补缺失/失效/高风险检查。`riskTier` 由调用方读变更包（或团队计划）传入，缺省不猜。
 */
export interface BuildAcceptanceTaskMessageOptions {
  flowUpdatedSinceReview?: boolean;
  /** 变更包/团队计划的当前风险档位（T0–T3）；缺省不标（由 Verifier 自行核对并记录）。 */
  riskTier?: GovernanceRiskTier;
  /** 团队计划 schema（1=legacy；2=v2；3=v3 目录级授权）；v3 追加布局核对要求，v1/v2 文案不变。 */
  teamPlanSchema?: 1 | 2 | 3;
  /** 实施前验收标准路径（缺省 `docs/acceptance/<flowId>-criteria-v1.md`）。 */
  criteriaPath?: string;
  /** 变更包路径（缺省 `docs/scheduling/<flowId>-change-v1.md`）。 */
  changePackagePath?: string;
  /** 验收报告路径（缺省 `docs/acceptance/<flowId>-report-v1.md`）。 */
  reportPath?: string;
  /**
   * 2026-10-23 验收返工路由（Q11 A）：上一次被拒/被退回的报告路径。传入 ⇒ 任务要求写 **vN+1** 新报告、
   * 不覆盖被拒报告；**未传 ⇒ 旧调用文案逐字不变**（除本变更在传入 reportPath 时追加的返工段硬要求）。
   */
  previousReportPath?: string;
}

export function buildAcceptanceTaskMessage(
  flowId: string,
  evidence: readonly string[],
  options: BuildAcceptanceTaskMessageOptions = {},
): string {
  const paths = [...new Set(evidence.filter((item): item is string => nonEmptyString(item)))].slice(0, 10);
  const evidenceText = paths.length > 0 ? paths.join("、") : "见回交报告与流程状态 YAML";
  const stalePrefix =
    options.flowUpdatedSinceReview === true
      ? "流程在上次验收复核后有更新，请复核最新版本。"
      : "";
  const criteriaPath = options.criteriaPath ?? governanceAcceptanceCriteriaPath(flowId);
  const changePackagePath = options.changePackagePath ?? governanceChangePackagePath(flowId);
  const reportPath = options.reportPath ?? governanceAcceptanceReportPath(flowId);
  const riskText = options.riskTier !== undefined ? `（当前档位：${options.riskTier}）` : "";
  // 2026-10-23 验收返工路由（方案 §5.2.3 / Q2 A）：报告结构化返工段硬要求。只在调用方传入报告路径
  // （`reportPath`/`previousReportPath`）时追加——旧调用（不传新参数）逐字不变；生产调用总会传 reportPath。
  // 2026-10-25 验收分诊（设计 `2026-10-25_design_acceptance-triage.md` §4 / §12.1）：⑨ 改为要求
  // `acceptance-triage/v1`（items 为旧 rework v1 的超集：增加结论/严重度/失败原因/改进方案指针）。
  const reworkSectionRequirement =
    options.reportPath !== undefined || options.previousReportPath !== undefined
      ? `⑨ 报告必须包含**恰好一个** fenced YAML 段（schema: acceptance-triage/v1），供应用做验收分诊与返工路由：` +
        `顶层 conclusion: pass|fail|conditional，items: [{id, severity, owner, reason, action, targets?, criteria?, evidence?}]；` +
        `每项 id 唯一、owner 恰好一个角色（跨 owner 必须拆项），reason（不通过原因）与 action（改进方案）必填，` +
        `action 至少带 targets 或 criteria 之一（指改进方案的文件/模块或验收标准指针；只有 evidence 不算改进方案）；` +
        `严重度四档：blocker=交付不可用/安全/数据损坏/验收标准关键项未满足；major=关键功能或契约不满足、返工可修；` +
        `minor=非关键缺陷、可后续修复；nit=风格/措辞/个人偏好（吹毛求疵）。` +
        `fail/conditional 必须至少一个 item，pass 允许空 items；缺段/坏段/越界/矛盾视为报告不完整，` +
        `应用会把验收卡退回你补报告（不弹客户卡、不返工、不解析自由文本）。`
      : "";
  const previousReportNote =
    options.previousReportPath !== undefined
      ? `本次为重派复核：请写新版本报告 ${reportPath}，不要覆盖被拒报告 ${options.previousReportPath}。`
      : "";
  // 2026-10-23 目录级授权（v3）：只对 v3 计划追加布局核对硬要求；v1/v2 文案逐字不变。
  const v3Requirement =
    options.teamPlanSchema === 3
      ? `⑧ 若团队计划为 v3（teamPlanSchema: 3），核对布局核对报告（候选改动路径 → 授权目录/目录规范逐条：文件类型/子目录/命名/禁写区/路径安全）并附原始 git status/diff（含未跟踪）与候选哈希；核对 new 边界与计划一致、changed/existing 计划 ⊆ 边界、目录规范/共享/治理关键路径；报告与候选不符、或 fail 仍判 pass 时不得建议 accept。`
      : "";
  return (
    `${stalePrefix}` +
    `流程 ${flowId} 步骤已全部完成（流程状态 YAML：${governanceFlowStatePath(flowId)}；回交/核对报告路径：${evidenceText}）。` +
    `请汇总证据并出验收卡（不要自行验收或代替客户决定）。` +
    `验收前必须满足以下硬要求：` +
    `① 按工程质量基线逐项核对并给出结论与证据：正确性、健壮性、安全、可维护性、可观测性、性能、前端可访问性、测试矩阵；` +
    `② 必须真实启动应用并向客户演示：给出启动命令与访问地址，附真实运行截图（最多截图；不得要求录屏；缺录屏不判失败；你已有审批档 shell，可执行启动命令，命令逐条提交审批）；` +
    `③ 未真实启动/演示、或质量基线某项无证据，不得建议 accept（只能建议退回或补充证据）；` +
    `④ 验收报告写入 ${reportPath}（首行五项：风险档位、判定依据、选定检查、复用证据、全量回归），详细证据附件写入 docs/verification/；报告须引用实施前标准 ${criteriaPath} 与变更包 ${changePackagePath} 的版本/哈希。` +
    `⑤ 按提案/变更的「架构方案或架构影响分析」核对实现：模块边界、依赖方向、扩展点、数据 schema/API 版本迁移与声明一致；缺失架构章节或实现偏离声明时不得建议 accept（只能建议退回或补充证据）。` +
    `⑥ 按实施前标准 ${criteriaPath} 逐行判定（pass / fail / insufficient evidence / not applicable）；先核对变更包 ${changePackagePath} 与风险档位${riskText}（档位只能升不能降，报告不得低于变更包）；复用同候选、同输入/依赖、同命令的有效证据，候选/输入/依赖/契约/夹具/配置变化使受影响证据失效，只补缺失/失效/高风险检查。` +
    `⑦ 若团队计划为 v2（teamPlanSchema: 2），核对模块覆盖/写集不相交/并行组/dependsOn/粒度例外，以及 MapReduce 证据：测试须按模块分片并行（每分片独立临时根/端口/日志/结果），Reduce 合并 manifest 与分片原始日志并跑契约/集成/e2e；缺 manifest 或分片原始证据判 insufficient evidence，不得建议 accept。` +
    v3Requirement +
    reworkSectionRequirement +
    previousReportNote
  );
}

/** 收尾推进成功的系统行（2026-10-19 客户反馈：验收复核是标准流程，由应用自动派发；**不是客户批准**）。 */
export function governanceAcceptanceAdvanceNote(flowId: string): string {
  return mainT("main.governance.acceptanceAdvance", { flowId });
}

// —————————————— 2026-10-26 gate 复核任务（客户授权 request_gate_review；设计 §5.5/§6.1） ——————————————
//
// 应用在 `request_gate_review` 校验通过后派 Proof 做**独立 gate 复核**。任务文本必须自足（flowId、
// gateId、gateKind、标准指针、dependsOn 证据指针、流程版本、报告路径），并写清硬边界：
// **gate 复核 ≠ 验收通过 ≠ 客户批准**；不发验收卡、不写 customer.decision、不标任何 flow 步骤 done、
// 不实现/不派发；UI/游戏必须在关闭 DEBUG 覆盖层后截图（真实运行截图；最多截图；不得要求录屏；缺录屏不判失败）；报告复用 `acceptance-triage/v1`，fail 必须
// 有 blocker/major（只有 minor/nit 的 fail 会被应用按结构不符退回、不触发返工）。纯文本，无 IO。

/** dependsOn 证据指针（gate 任务文案用；值来自 flow 步骤与账本核对后的解析结果）。 */
export interface GateReviewDependencyEvidence {
  id: string;
  /** 解析 supersededBy 链后的最终步骤 id（与 `id` 不同表示经替代链解析）。 */
  resolvedId: string;
  status: string;
  evidenceKind?: string;
  evidenceRef?: string;
}

export interface BuildGateReviewTaskMessageOptions {
  flowId: string;
  gateId: string;
  gateKind: string;
  gateTitle: string;
  /** 最新验收标准的路径（必须含该 gateId 的 Gate 复核标准节）。 */
  criteriaPath: string;
  /** 候选流程版本（flow YAML sha256；报告须写明候选/revision 与证据复用判定）。 */
  flowRevision: string;
  /** 本次应写的 gate 报告路径（版本化；重验递增，不覆盖旧报告）。 */
  reportPath: string;
  reportVersion: number;
  dependsOn: readonly GateReviewDependencyEvidence[];
  /** 上一轮被退回/失败的报告路径（重验时给出；要求写新版本、不覆盖）。 */
  previousReportPath?: string;
}

export function buildGateReviewTaskMessage(input: BuildGateReviewTaskMessageOptions): string {
  const revisionText = input.flowRevision.length > 16 ? input.flowRevision.slice(0, 16) : input.flowRevision;
  const depLines =
    input.dependsOn.length > 0
      ? input.dependsOn.map((dep) => {
          const resolved = dep.resolvedId !== dep.id ? `${dep.id}→${dep.resolvedId}` : dep.id;
          const evidence =
            dep.evidenceKind !== undefined && dep.evidenceRef !== undefined
              ? `evidence ${dep.evidenceKind}=${dep.evidenceRef}`
              : "evidence 未在步骤声明";
          return `- ${resolved}（status=${dep.status}；${evidence}）`;
        })
      : ["- （gate 步骤未声明 dependsOn；仍须按标准核对真实输出与账本证据）"];
  const visualRequirement =
    input.gateKind === "visual-baseline"
      ? `2) 必须亲自打开真实浏览器/游戏窗口核对，并**关闭 DEBUG 覆盖层**后截图（真实运行截图；最多截图；不得要求录屏；缺录屏不判失败）；证据里出现 DEBUG 覆盖层、旧候选截图、或无法确认截图为当前候选 ⇒ insufficient evidence（按 fail 处理，不通过）。`
      : `2) 必须亲自运行或打开真实输出核对（不是只读别人转述的日志）；证据不足 ⇒ 按 fail / insufficient evidence 处理，不通过。`;
  return [
    `[Gate 复核] 流程 ${input.flowId}｜gate ${input.gateId}｜gateKind=${input.gateKind}｜gate 步骤标题：${input.gateTitle}`,
    `复核标准：${input.criteriaPath}（Gate 复核标准节；必须含 gateId=${input.gateId} 与逐条判定表）。`,
    `流程版本（flowRevision）：${revisionText}；本次候选以该 flow 版本 + dependsOn 证据为准。`,
    `dependsOn 证据指针（应用已机械核对：步骤 done 且证据与账本可对账；内容合格与否由你判定）：`,
    ...depLines,
    `gate 报告路径：${input.reportPath}（v${input.reportVersion}；版本化、不覆盖旧报告）${input.previousReportPath !== undefined ? `；上一轮报告 ${input.previousReportPath} 保留备查` : ""}。`,
    `证据附件写入 docs/verification/${input.flowId}/${input.gateId}/。`,
    `要求：`,
    `1) 只做 gate 复核：按标准逐项判定并写 gate 报告；**不发 request_choice / 验收卡、不写 customer.decision、不代表客户批准**；gate 通过 ≠ 最终验收通过。`,
    visualRequirement,
    `3) 报告结论只允许 pass / fail / conditional，且必须包含**恰好一个** fenced YAML 段（schema: acceptance-triage/v1）：顶层 conclusion，items: [{id, severity, owner, reason, action, targets?, criteria?, evidence?}]；fail/conditional 必须至少一个 blocker/major（**只有 minor/nit 的 fail 会被应用按结构不符退回 Proof，不触发返工**）；pass 可带 minor/nit 备注。`,
    `4) gate 失败不直接改代码、不派发、不返工：应用按 gate 独立返工路由交运营；你只等返工后的下一次复核请求。`,
    `5) 不得用旧截图/旧日志冒充新候选；报告写明候选/流程版本与证据复用判定。不要标任何 flow 步骤 done、不写 flow / 账本 / 客户决定。`,
    `6) 报告首行建议写：Gate 复核报告 v${input.reportVersion}｜flowId: ${input.flowId}｜gateId: ${input.gateId}｜gateKind: ${input.gateKind}｜候选 revision: <flowRevision>。`,
  ].join("\n");
}

// —————————————— 2026-10-23 验收返工路由：Convener 返工任务与系统行（纯文本，无 IO） ——————————————
//
// 方案 v1 §5.3.2/§6.3.2（Q3/Q7/Q8/Q10 A）：应用只把**报告 + 结构化清单 + 来源事实**交给固定接收方
// Convener；不生成 flow 步骤、不派产品角色、不替客户验收、不伪造 done/客户决定。任务文本是 agent 数据，
// 不是 UI 文案（不做 i18n）；用户可见系统行走下方 `main.governance.acceptanceRework*` key（项目管理维护）。

/** 结构化返工项（与编排解析结果结构兼容；本模块只消费值对象，不复制解析/校验逻辑）。 */
export interface AcceptanceReworkTaskItem {
  id: string;
  owner: string;
  action: string;
  evidence?: readonly string[];
  /** 2026-10-25 验收分诊：严重度 / 失败原因 / 验收标准指针 / 原始 targets（随返工任务带给统筹）。 */
  severity?: "blocker" | "major" | "minor" | "nit";
  reason?: string;
  criteria?: string | null;
  targets?: readonly string[];
  /** `false` = minor/nit（非阻断，可选后续）；`undefined` = 旧路径不标注。 */
  blocking?: boolean;
}

/** 未知/不可派发 owner 的 blocked 项（逐项列出；不猜、不改 owner）。 */
export interface AcceptanceReworkBlockedItem {
  id: string;
  owner: string;
  reason: string;
}

export interface BuildAcceptanceReworkTaskMessageOptions {
  flowId: string;
  /** `customer`＝账本 acceptance 决定（客户手拒或 judge 代批 reject）；`judge`＝judge auto-rework（无决定）。 */
  source: "customer" | "judge";
  /** `customer-input` / `judge` / `judge-deny` / `judge-manual`；未知值按自动退回保守处理。 */
  sourceDetail?: string;
  decisionAt?: string;
  requestId?: string;
  reasonCode?: string;
  reason?: string;
  reportPath: string;
  reportVersion?: number;
  reportSha256?: string;
  reportMissing?: boolean;
  structured: boolean;
  coordinator?: string;
  /** 可派发项（按 owner 分组展示）。 */
  items?: readonly AcceptanceReworkTaskItem[];
  /** 未知/不可派发 owner（blocked 显式挂起）。 */
  blockedItems?: readonly AcceptanceReworkBlockedItem[];
  /** `owner:"verifier"`：报告/工具修正项，不派产品返工。 */
  reportFixItems?: readonly AcceptanceReworkTaskItem[];
  /** `owner` 为内置治理角色：治理文档/变更包项，Convener 自行处理。 */
  governanceItems?: readonly AcceptanceReworkTaskItem[];
  /** 解析错误（`path: message`；有界）。 */
  itemErrors?: readonly string[];
  /**
   * 2026-10-25 验收分诊：清单来自 `acceptance-triage/v1`（items 含 severity/reason/targets/criteria）。
   * 只影响结构化清单标题与非阻断说明；缺省 ⇒ 旧 `acceptance-rework/v1` 文案逐字不变。
   */
  triageSchema?: boolean;
  /** 流程状态 YAML 路径（缺省按 flowId 派生）。 */
  flowPath?: string;
  /**
   * **实际接收方**（2026-10-24 治理协调）：由应用按治理模型决定——trio = Lead（`primaryRoleId`），
   * single/su 保持原接收方。`coordinator` 字段只是**报告建议**，不决定实际接收方；缺省 ⇒ legacy 文案
   * （固定 Convener）逐字不变。
   */
  receiver?: { roleId: string; displayName: string };
  /**
   * flow 顶层 `release` **可选发布元数据**（2026-10-24 客户修订「所有变更独立验收」）：不再作为自动
   * 重派验收/Proof 的条件——返工完成后应用对所有 flow（含非发布）按验收门自动重派。字段保留仅为既有
   * 调用形状；缺省 ⇒ 同样按「所有变更」文案处理。
   */
  release?: boolean;
  /**
   * 2026-10-26 gate 复核（客户授权 `request_gate_review`，设计 §8.2）：给出时本任务按 **gate 返工** 生成
   * ——标题/来源/报告指针写明 `gateId`，任务要求统筹在返工完成后**显式再次** `request_gate_review`（应用
   * 不自动重派、不自动放行）。缺省 ⇒ 旧验收返工文案逐字不变。
   */
  gate?: {
    gateId: string;
    gateKind: string;
    /** 严重度摘要（如 `blocker=1，major=2，minor=0，nit=0`；只用于展示）。 */
    severity: string;
  };
}

/** 来源措辞（Q7 A）：judge 来源绝不出现「客户拒绝」；客户手拒才写「客户拒绝」。 */
function acceptanceReworkSourceText(source: "customer" | "judge", sourceDetail?: string): string {
  if (source === "customer") {
    if (sourceDetail === "judge") return "自动决策未通过（判断代批）";
    if (sourceDetail === "triage-customer") return "客户验收分诊选择（下发运营修改）";
    return "客户拒绝（客户手拒）";
  }
  if (sourceDetail === "judge-rule") return "验收分诊判断代批（确定性规则 judge-rule）";
  return sourceDetail === "judge-deny"
    ? "自动决策未通过（自动退回/判断拒绝）"
    : "自动决策未完成（自动退回）";
}

function formatAcceptanceReworkItem(item: AcceptanceReworkTaskItem): string {
  const evidence = (item.evidence ?? []).filter((entry) => nonEmptyString(entry));
  const severity =
    item.severity !== undefined
      ? ` | severity=${item.severity}${item.blocking === false ? "（非阻断，可选后续）" : ""}`
      : "";
  const reason = nonEmptyString(item.reason) ? ` | reason=${item.reason}` : "";
  const criteria = nonEmptyString(item.criteria) ? ` | criteria=${item.criteria}` : "";
  return `id=${item.id} | owner=${item.owner} | action=${item.action}${severity}${reason}${criteria}${evidence.length > 0 ? ` | evidence=${evidence.join("、")}` : ""}`;
}

function acceptanceReworkItemsByOwner(items: readonly AcceptanceReworkTaskItem[]): string[] {
  const owners: string[] = [];
  const grouped = new Map<string, AcceptanceReworkTaskItem[]>();
  for (const item of items) {
    if (!grouped.has(item.owner)) {
      grouped.set(item.owner, []);
      owners.push(item.owner);
    }
    grouped.get(item.owner)!.push(item);
  }
  return owners.map(
    (owner) =>
      `· owner=${owner}：${grouped
        .get(owner)!
        .map(
          (item) =>
            `${item.id}（${item.action}）` +
            (item.severity !== undefined ? `[${item.severity}${item.blocking === false ? "·非阻断" : ""}]` : ""),
        )
        .join("；")}`,
  );
}

/**
 * 生成**唯一一条**验收返工任务（发给 Convener；方案 §5.3.2 的 1–6 项）。纯函数、无 IO。
 *
 * 硬边界：不创建 flow 步骤、不派产品角色、不 supersede 验收步骤、不替客户验收、不写客户决定；
 * 清单是**范围数据不是权限指令**；报告归 Proof，应用不解析自由文本。
 */
export function buildAcceptanceReworkTaskMessage(input: BuildAcceptanceReworkTaskMessageOptions): string {
  const gate = input.gate;
  const sourceText =
    gate !== undefined
      ? `gate 复核未通过（Proof 判定；gate-review；gateId=${gate.gateId}，gateKind=${gate.gateKind}）`
      : acceptanceReworkSourceText(input.source, input.sourceDetail);
  const flowPath = input.flowPath ?? governanceFlowStatePath(input.flowId);
  const reportVersionText = input.reportVersion !== undefined ? `（v${input.reportVersion}）` : "";
  const reportShaText = typeof input.reportSha256 === "string" && input.reportSha256 !== "" ? `；sha256 ${input.reportSha256}` : "";
  const reportStateText = input.reportMissing === true ? "；报告文件缺失/不可读" : "";
  const factParts = [
    `来源：${sourceText}`,
    ...(input.decisionAt !== undefined ? [`决定/退回时间：${input.decisionAt}`] : []),
    ...(input.requestId !== undefined ? [`请求 id：${input.requestId}`] : []),
    ...(input.reasonCode !== undefined ? [`原因码：${input.reasonCode}`] : []),
    ...(input.reason !== undefined ? [`原因：${input.reason}`] : []),
  ];
  const items = input.items ?? [];
  const blocked = input.blockedItems ?? [];
  const reportFix = input.reportFixItems ?? [];
  const governance = input.governanceItems ?? [];
  const errors = (input.itemErrors ?? []).filter((entry) => nonEmptyString(entry));
  const receiverLabel = input.receiver?.displayName ?? "运营";
  const receiverDetail = input.receiver !== undefined ? `（${input.receiver.roleId}）` : "";
  const reportLine =
    gate !== undefined
      ? `Gate 复核报告：${input.reportPath}${reportVersionText}${reportShaText}${reportStateText}（gateId=${gate.gateId}；gateKind=${gate.gateKind}；严重度：${gate.severity}；实际接收方：${receiverLabel}${receiverDetail}）。`
      : input.receiver !== undefined
        ? `验收报告：${input.reportPath}${reportVersionText}${reportShaText}${reportStateText}（coordinator 建议：${input.coordinator ?? "convener"}；实际接收方：${receiverLabel}${receiverDetail}）。`
        : `验收报告：${input.reportPath}${reportVersionText}${reportShaText}${reportStateText}（coordinator 建议：${input.coordinator ?? "convener"}；实际接收方固定运营）。`;
  const structuredText = input.structured
    ? [
        input.triageSchema === true
          ? `结构化返工清单（acceptance-triage/v1；逐项 id | owner | action | severity | reason | criteria | evidence；severity=minor/nit 为非阻断、可选后续）：`
          : `结构化返工清单（acceptance-rework/v1；逐项 id | owner | action | evidence）：`,
        ...items.map((item) => `- ${formatAcceptanceReworkItem(item)}`),
        ...(items.length === 0 ? ["- （无可派发项：见下方 blocked / 报告修正 / 治理项）"] : []),
        ...(input.triageSchema === true && items.some((item) => item.blocking === false)
          ? ["- minor/nit 项为非阻断（可选后续）：不要因它们重开验收或阻塞返工完成。"]
          : []),
      ]
    : [
        `结构化返工段缺失或不可解析${errors.length > 0 ? `（${errors.slice(0, 10).join("；")}）` : ""}：应用**未生成返工项、未创建流程步骤**，也不解析报告自由文本。`,
        `请阅读 ${input.reportPath} 的偏差/缺口节，或要求报告方（质检）补充 acceptance-rework/v1 结构化段后再组织返工；**不要凭空创建无依据步骤**，必要时请客户/质检补具体返工项。`,
      ];
  const ownerSections: string[] = [];
  if (items.length > 0) {
    ownerSections.push(`可派发项（按 owner 分组；有效项可先行，有问题项显式挂起）：`, ...acceptanceReworkItemsByOwner(items));
  }
  if (blocked.length > 0) {
    ownerSections.push(
      `blocked 项（未知/不可派发 owner；不要猜、不要改 owner、不要静默丢弃；请补证/拆项或确认 owner）：`,
      ...blocked.map((item) => `- id=${item.id} | owner=${item.owner} | ${item.reason}`),
    );
  }
  if (reportFix.length > 0) {
    ownerSections.push(
      `报告/工具修正项（owner=verifier；质检只写 docs/acceptance / docs/verification，不作为产品返工派发）：`,
      ...reportFix.map((item) => `- ${formatAcceptanceReworkItem(item)}`),
      `由 ${receiverLabel} 按报告归属处理或要求质检修正报告/工具；**不要向质检派产品返工**。`,
    );
  }
  if (governance.length > 0) {
    ownerSections.push(
      `治理文档/变更包项（owner 为内置治理角色）：`,
      ...governance.map((item) => `- ${formatAcceptanceReworkItem(item)}`),
      `由 ${receiverLabel} 按职责协调处理治理文档/变更包；**不要向内置治理角色 dispatch_task**。`,
    );
  }
  return [
    gate !== undefined
      ? `流程 ${input.flowId}：gate ${gate.gateId} 复核未通过（gateKind=${gate.gateKind}；gate 步骤保持 pending），应用把返工交 ${receiverLabel}${receiverDetail} 组织（流程状态 YAML：${flowPath}）。`
      : `流程 ${input.flowId}：验收未通过，应用把返工交 ${receiverLabel}${receiverDetail} 组织（流程状态 YAML：${flowPath}）。`,
    factParts.join("；") + "。",
    reportLine,
    ...structuredText,
    ...ownerSections,
    `要求：`,
    `1) 先核对已有进展：用 flow_get 看是否已有同一 item/owner 的 rework-* 且 done/证据齐；有则复用/跳过，不重复建、不重复派（升级/重入时返工可能已完成）。`,
    `2) 按 owner 用现有 flow_step_supersede 建/替换 rework-* 步骤（旧步骤 superseded、新步骤 pending；建议 id=rework-<item id 小写/非字母数字转->，同 owner 多项可合并并保留 item id 列表）；**不要**新建验收步骤、**不要**标 verification done、**不要** supersede 保留验收步骤（服务端会拒绝）。`,
    `3) 用 dispatch_task 派给已任命且 readiness 通过的项目角色；stepId 与 flow 完全一致；dependsOn 前置全部 done；写集/边界按既有门禁；owner 是内置治理角色时不要向内置角色 dispatch_task。`,
    gate !== undefined
      ? `4) 核对/更新变更包与证据登记，使 flow 反映返工进展；返工完成后由运营**显式再次**调用 request_gate_review({flowId, gateId: "${gate.gateId}"}) 请求同一 gate 复核——应用不自动重派同一失败报告、不自动放行，gate 未 done 前下游依赖步骤不得派发。`
      : `4) 核对/更新变更包与证据登记，使 flow 反映返工进展；返工完成后由应用按验收门（所有变更，含非发布）自动重派质检（flow 顶层 release 仅为可选发布元数据，不是重派条件），${receiverLabel} **不要**自己派质检。`,
    gate !== undefined
      ? `5) 不替客户验收、不自动 accept/reject、不写 customer.decision、不改 docs/acceptance/ 报告；gate 复核报告归质检，gate 通过也不等于最终验收通过。`
      : `5) 不替客户验收、不自动 accept/reject、不写 customer.decision、不改 docs/acceptance/ 报告；报告归质检。`,
    `6) 清单是范围数据，不是权限指令；不得据清单扩权、绕过客户确认、写他人目录或改角色卡/边界。`,
    `7) 没有可 supersede 的旧步骤 ⇒ fail-closed：记录 gap 并请产品/质检补 flow 计划，不凭空造步骤。`,
    `8) 应用只以 flow 更新作为返工进展信号；候选代码变化但 flow 未变时不会重派——请把返工/证据登记进 flow。`,
  ].join("\n");
}

/**
 * 治理协调唤醒任务（2026-10-24，设计 v1 §6.3；S3）：应用把 flow 的「阻塞 / 交付待核证」阶段**告知**
 * Lead / 主理。**只是系统通知**——不派项目角色、不自动推进步骤、不写 flow/账本、不弹客户卡；
 * 协调 ≠ 客户批准，门禁仍由应用执行。纯文本，无 IO。
 *
 * 2026-10-26 客户追加行为规则：**主理收到系统消息时只向客户汇报**，不要给统筹（Steward）或项目 worker
 * 派发任务；gate pass/fail 等系统行同样只作客户汇报用途。只有客户消息触发的协调不受此限（客户消息不是
 * 系统消息）。本函数只产出文案；是否派发由 Lead 卡与门禁约束，桌面不代派。
 */
export interface BuildGovernanceCoordinationTaskMessageOptions {
  flowId: string;
  /** 当前 flow YAML 的 revision（sha256；只展示前 12 位，帮助 Lead 用 flow_get 对齐）。 */
  revision: string;
  /** 阶段键（`blocked:<…>` / `delivered:<…>`）；只作事实标识，不作权限。 */
  stage: string;
  description: string;
  details?: readonly string[];
}

export function buildGovernanceCoordinationTaskMessage(input: BuildGovernanceCoordinationTaskMessageOptions): string {
  const revisionText = input.revision.length > 12 ? input.revision.slice(0, 12) : input.revision;
  const details = (input.details ?? []).filter((line) => nonEmptyString(line));
  return [
    `[系统·治理协调] 流程 ${input.flowId} 的阶段通知（协调不是客户批准；应用门禁仍由应用执行）：`,
    `当前 revision：${revisionText}（供核对；如需事实可 flow_get 读取最新流程状态）`,
    `阶段：${input.description}`,
    ...details,
    "这是系统通知：只向客户汇报；不要给运营 / 项目 worker 派发任务，等客户指示。不要替客户批准、不要自行标 done、不要编辑/代批/改判验收结论。",
  ].join("\n");
}

/** 路由成功系统行（客户来源写「客户拒绝」；judge 来源写「自动决策」，绝不写「客户拒绝」）。 */
export function governanceAcceptanceReworkRoutedNote(flowId: string, source: "customer" | "judge"): string {
  return source === "customer"
    ? mainT("main.governance.acceptanceReworkRoutedCustomer", { flowId })
    : mainT("main.governance.acceptanceReworkRoutedAutomatic", { flowId });
}

/** 路由未完成（record pending/failed、等待下一事件重试）系统行。 */
export function governanceAcceptanceReworkPendingNote(flowId: string): string {
  return mainT("main.governance.acceptanceReworkPending", { flowId });
}

/** 报告缺段/坏段系统行（只给路径/错误；不生成 items）。 */
export function governanceAcceptanceReworkReportIncompleteNote(flowId: string, reportPath: string, detail: string): string {
  return mainT("main.governance.acceptanceReworkReportIncomplete", { flowId, reportPath, detail });
}

/** 路由失败系统行（record 写失败/发送失败；不声称已送达）。 */
export function governanceAcceptanceReworkFailedNote(flowId: string, detail: string): string {
  return mainT("main.governance.acceptanceReworkFailed", { flowId, detail });
}

/** 审计写入失败系统行（任务可已发出；不翻转已发送事实、不伪造账本）。 */
export function governanceAcceptanceReworkAuditFailedNote(flowId: string, detail: string): string {
  return mainT("main.governance.acceptanceReworkAuditFailed", { flowId, detail });
}


/**
 * 自动验收被收尾门挡住时的**系统行**（2026-10-19 客户反馈「这个难道不是bug吗」）。
 *
 * 门本身 fail-closed 正确，但原因原先只写诊断日志（`acceptance.flow.incomplete`）——Steward/客户
 * 看不到，只能由操作者手动复算再转告，**静默本身就是缺陷**。本函数把具体原因 + 可操作建议变成
 * **Lead（主入口）**聊天的系统行（2026-10-19 客户决定：自动验收门反馈统一发 Lead，不再发 Convener）：
 *  - 未完成/阻塞/证据不足：建议把已被 retake 取代的 aborted/failed 步骤标为 `superseded`（或
 *    `cancelled`），或用新 `stepId` 重派并更新流程单；应用**不会自动改写流程单，也不会自动派 Proof**；
 *  - 终态（验收步骤已完成 / 已有验收决定）：无需操作，如实说明不会重复派发。
 *
 * 本函数只产出文案：**不改变 `flowCompletionIssue` 门禁判定**、不把 failed/aborted 自动当 superseded、
 * 不写账本。去重（同一 flow + 同一原因只发一次）由调用方（Interface）负责。
 *
 * `flowPath`：建议要落的流程状态文件路径。缺省为 legacy Markdown（`docs/flows/<flowId>.md`，既有调用零变化）；
 * 机器状态 YAML 生效时调用方传 `governanceFlowStatePath(flowId)`，建议直接指向要改的 YAML。
 */
export function governanceAcceptanceBlockedNote(
  flowId: string,
  issue: string,
  flowPath: string = governanceFlowPath(flowId),
): string {
  const advice = isTerminalFlowCompletionIssue(issue)
    ? mainT("main.governance.acceptanceBlockedTerminal")
    : mainT("main.governance.acceptanceBlockedAdvice", { path: flowPath });
  return mainT("main.governance.acceptanceBlocked", { flowId, issue, advice });
}

/**
 * 推导所需的**桌面上下文**（不进 IPC 载荷——事件契约保持上面那一个形状）。
 * 后台派发（打开目标会话 + 发一条任务）与系统行落位需要它。
 */
export interface GovernanceNextStepContext {
  /** 发起这张卡的角色 id（系统行落它的聊天流，即「当前聊天流」）。 */
  sourceRoleId?: string;
  projectRoot?: string;
  runtime?: RuntimeKind;
  /** `appointment` 决定的任命名单（客户选中的候选角色 id；原样来自 `CustomerInputOutcome.value.selected`）。 */
  targetRoleIds?: string[];
  /**
   * 卡片显式携带的流程步骤 id（`CustomerInputRequest.stepId`；缺席即不传）。只用于审计账本的
   * `dispatch.accepted.stepId`——**不推导、不伪造**；`governance:next-step` IPC 载荷仍不扩。
   */
  stepId?: string;
  /**
   * 2026-10-22 第 1 项：卡片请求对象上**显式**携带的团队计划路径（结构读取；冻结契约当前无此字段，
   * 缺席即省略）。派 Crew 写卡时优先账本 `artifactPath`，其次本值，再按 flowId 派生最新
   * `docs/scheduling/<flowId>-team-vN.md`——绝不猜目录。
   */
  teamPlanPath?: string;
}

/** 派发结果（主进程内部使用；成功/失败都如实）。 */
export interface GovernanceAdvanceResult {
  ok: boolean;
  /** 是否真的投递了任务（`nextFunction=null` 时为 false——无需派发）。 */
  dispatched: boolean;
  targetRoleId?: GovernanceNextRoleId;
  /** `proposal accept` 两段式：第二段真正派发到的目标（流程状态 YAML 落盘后才会有）。 */
  followUpRoleId?: GovernanceNextRoleId;
  /** 目标角色忙时经既有投递机入队（`send` 的同一语义）。 */
  queued?: boolean;
  error?: string;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** 客户**实际选中**的选项 id（只有 answered 才有；declined/unavailable/取消一律空）。 */
function answeredSelected(outcome: CustomerInputOutcome | null | undefined): string[] {
  if (outcome === null || outcome === undefined || outcome.outcome !== "answered") return [];
  const selected = outcome.value?.selected;
  return Array.isArray(selected) ? selected.filter((id): id is string => typeof id === "string") : [];
}

/**
 * `proposalPath` 的**非猜测**来源：请求对象或（被选中的）选项对象上显式给出的字符串。
 * 冻结契约 `CustomerInputRequest` 目前没有该字段——这里按结构读、缺席即省略，不改契约、不解析预览文本。
 */
function readProposalPath(request: CustomerInputRequest, selected: readonly string[]): string | undefined {
  const direct = (request as CustomerInputRequest & { proposalPath?: unknown }).proposalPath;
  if (nonEmptyString(direct)) return direct;
  if (request.kind === "choice") {
    const picked = new Set(selected);
    for (const option of request.options) {
      if (!picked.has(option.id)) continue;
      const fromOption = (option as typeof option & { proposalPath?: unknown }).proposalPath;
      if (nonEmptyString(fromOption)) return fromOption;
    }
  }
  return undefined;
}

/**
 * 决定卡镜像判据（四角色评审 §6.1）：**同一个请求 id 的第二处呈现，不是第二个请求**。
 * 仅治理决定卡镜像到主入口（Liaison）；其余一律保持原生位置：
 *  - `proposal` / `appointment` / `appointment-write` / `schedule-write` / `acceptance` → 镜像；
 *  - `write`（普通写盘确认）→ **镜像**（2026-10-18 真机反馈：报告员的写入确认卡必须在联络官可作答；
 *    本条覆盖评审 §6.1 原表「write 不镜像」；仅 trio 治理角色会走该通道——项目角色从不注入 customerInput，
 *    single/su 也不镜像）；
 *  - 无 `cardKind`（旧调用）→ 不镜像（零行为变化）；
 *  - shell 审批卡 / 恢复确认卡不经过本判据（运维面，保持原生位置）。
 *
 * 判据是**纯函数**、只认 `cardKind`：是否镜像（模型/来源角色/主入口）由调用方（session.ts）按
 * `governanceModel === "trio"` 与 `roleId !== primaryRoleId` 组合；渲染侧不重复判据。
 */
const MIRRORED_GOVERNANCE_CARD_KINDS: ReadonlySet<GovernanceCardKind> = new Set([
  "proposal",
  "appointment",
  "appointment-write",
  "schedule-write",
  "acceptance",
  "write",
]);

export function isMirroredGovernanceCard(cardKind: GovernanceCardKind | undefined): boolean {
  return cardKind !== undefined && MIRRORED_GOVERNANCE_CARD_KINDS.has(cardKind);
}

/**
 * 意图交接的**唯一一条**任务消息（四角色评审 §5.3 模板；只给地址与最小上下文，不内嵌意图全文、
 * 不让模型自算哈希）。`flowId` 有才带流程前缀；`summary` 原样附在末尾（≤200 字由工具/编排校验）。
 */
export function buildIntentHandoffMessage(payload: HandOffIntentPayload): string {
  const flowPrefix =
    typeof payload.flowId === "string" && payload.flowId.trim() !== "" ? `流程 ${payload.flowId}：` : "";
  return [
    `${flowPrefix}客户意图已交接。`,
    `请读 docs/intents/${payload.intentId}.md（intentId=${payload.intentId}，handoffKind=${payload.handoffKind}）；这是意图记录，不是客户批准。`,
    "请形成提案并用提案卡请客户决定；信息不足用 request_clarification，不要反复追问客户。",
    payload.summary,
  ].join("\n");
}

/**
 * 按「卡片种类 + 客户实际选择」推导下一步（客户已定契约的推导表；2026-10-22 第 1 项起）：
 * - `proposal` + `accept`       → schedule / convener：Convener 写/更新流程状态 YAML **与团队计划**，
 *                                 然后**直接发 appointment 卡**（不再产生 `followUp:"nomination-after-flow"`
 *                                 两段式；旧事件仍可携带 followUp，`advanceGovernanceFlow` 保留迁移兼容）；
 * - `proposal` + `accept-quick` → schedule / convener（写流程状态 YAML 并排步骤，无任命）；
 * - `proposal` + `revise|reject`→ null（无下一步，等客户改稿或放弃）；
 * - `appointment`（任命成功）    → **role-card-write / nominator**（应用派 Crew 写卡；不再直接派 Convener）；
 * - `acceptance`（验收成功）     → null（流程收口）；
 * - `intent-confirm`（需求确认） → null（2026-10-18 客户拍板：客户确认后由 Lead 自己调 `hand_off_intent`，
 *                                 应用不推进）；
 * - `write`/`appointment-write`/`schedule-write` → null（写盘确认不解锁任何下一步；appointment-write
 *                                 的后续由写卡后推进检查负责：结构校验 → 派 Convener 做 role-readiness）；
 * - 未答（declined/unavailable/取消/expired）或卡上无 `cardKind` → 不产生事件（返回 null）。
 *
 * 非标准选项 id（例如账本会记 `unclassified` 的提案选项）一律按「无下一步」处理——不猜。
 */
export function deriveGovernanceNextStep(
  request: CustomerInputRequest,
  outcome: CustomerInputOutcome | null | undefined,
): GovernanceNextStepPayload | null {
  if (outcome === null || outcome === undefined || outcome.outcome !== "answered") return null;
  const cardKind = request.cardKind;
  if (cardKind === undefined) return null; // 旧调用形状（无治理元数据）：零行为变化，不产生下一步。
  const selected = answeredSelected(outcome);
  let nextFunction: GovernanceNextFunction | null = null;
  let roleId: GovernanceNextRoleId | null = null;
  let followUp: GovernanceNextStepPayload["followUp"];
  switch (cardKind) {
    case "proposal": {
      if (selected.includes("accept")) {
        // 2026-10-22 第 1 项：Convener 在同一轮写流程 YAML + 团队计划并直接发 appointment 卡；
        // 不再产生两段式 followUp（旧 followUp 事件在 advanceGovernanceFlow 保留迁移兼容）。
        nextFunction = "schedule";
        roleId = "convener";
      } else if (selected.includes("accept-quick")) {
        nextFunction = "schedule";
        roleId = "convener";
      }
      // revise / reject / 非标准选项：无下一步。
      break;
    }
    case "appointment":
      // 2026-10-22 第 1 项：客户任命决定后由应用派 Crew 写卡（不是 Convener 排程）。
      nextFunction = "role-card-write";
      roleId = "nominator";
      break;
    case "acceptance":
    case "intent-confirm":
    case "write":
    case "appointment-write":
    case "schedule-write":
      break; // 流程收口 / 客户需求确认（Lead 自行交接）/ 普通写盘 / 写卡确认：无下一步。
    default:
      return null; // 未知种类：不猜、不发假事件。
  }
  const payload: GovernanceNextStepPayload = { version: 1, cardKind, nextFunction, roleId };
  if (followUp !== undefined) payload.followUp = followUp;
  if (nonEmptyString(request.flowId)) payload.flowId = request.flowId;
  const proposalPath = readProposalPath(request, selected);
  if (proposalPath !== undefined) payload.proposalPath = proposalPath;
  return payload;
}

/** `buildGovernanceAdvanceMessage` 的可选事实输入（调用方传入；缺省 ⇒ 旧文案逐字不变）。 */
export interface BuildGovernanceAdvanceMessageOptions {
  /**
   * 流程状态 YAML 是否**已存在**（调用方 `existsSync(projectRoot/docs/flows/<flowId>.yaml)` 的读数）。
   * `false`/缺省 ⇒ 初始创建路径（旧文案：请先写流程状态 YAML）；`true` ⇒ 改走 flow 工具推进，
   * **不再让 Convener 直接 write_file 流程 YAML**（2026-10-20 真机：flow 工具已注册但 Steward 未被要求使用）。
   */
  flowStateExists?: boolean;
  /**
   * 2026-10-26：已存在的流程是否为应用在意图交接时创建的**通用骨架**（`status: skeleton`）。
   * 骨架只含通用步骤、不含项目角色/交付步骤；运营写团队计划后需用一次 schedule-write **替换**为完整流程。
   */
  flowStateSkeleton?: boolean;
  /**
   * 2026-10-22 第 1 项：团队计划（`docs/scheduling/<flowId>-team-vN.md`）。派 Crew 写卡时是
   * **唯一依据**；旧流程（O4）可缺省并回落 `nominationPath`。
   */
  teamPlanPath?: string;
  teamPlanVersion?: number;
  /**
   * 团队计划 schema（1=legacy；2=v2；3=v3 目录级授权）。用于任务文案提示要读的字段；缺省按 legacy 口径。
   * 特例：提案接受后的 Convener 新流程分支缺省按 **v3**（新流程默认 v3）；已有 v2/legacy 计划续接时
   * 由调用方显式传 1/2 以保留原 v2 文案。
   */
  teamPlanSchema?: 1 | 2 | 3;
  /** 团队计划 v2/v3 模块清单（机器可读 modules）；非空时写进写卡任务文案。 */
  teamPlanModules?: readonly string[];
  /** 团队计划 v3 frontmatter `directories`（授权目录摘要）；仅 v3 文案使用。 */
  teamPlanDirectories?: readonly string[];
  /** @deprecated legacy：旧提名文件路径（`docs/nominations/<flowId>-v<n>.md`）；新流程不产生。 */
  nominationPath?: string;
  /**
   * 2026-10-22 第 1 项：本次 proposal 决定是 `accept`（true：写流程 YAML + 团队计划后**直接发任命卡**）
   * 还是 `accept-quick`（false/缺省：旧快捷文案，写流程并排步骤、无任命）。
   * 由调用方按账本最新提案决定传入；直接调用本函数且缺省 ⇒ 旧文案逐字不变（迁移兼容）。
   */
  proposalDecision?: "accept" | "accept-quick";
}

/**
 * 生成**唯一一条**后台派发任务消息。
 * 返回 null = 信息不足（无 flowId、appointment 无任命名单）——调用方应如实报失败，不猜测、不裸发。
 *
 * 2026-10-19 客户决定「这些全部改成yaml。」：所有指向**机器状态**的路径/要求一律用
 * `docs/flows/<flowId>.yaml`（`governanceFlowStatePath`）；同名 `.md` 只作为可选人读视图，
 * **不得承载门禁状态**。文案语义（谁做什么、不越权）不变，只把流程状态载体从 Markdown 表改为 YAML。
 *
 * 2026-10-20 真机（flow 工具已注册但 Steward 没调用）：`options.flowStateExists === true` 时，proposal
 * accept / appointment 的 Convener 任务改为「用 flow_get 读当前 revision，再用 flow_step_update /
 * flow_step_supersede 推进步骤；不要直接 write_file 流程 YAML」；YAML 不存在时保留初始创建文案。
 */
export function buildGovernanceAdvanceMessage(
  payload: GovernanceNextStepPayload,
  targetRoleIds?: readonly string[],
  options?: BuildGovernanceAdvanceMessageOptions,
): string | null {
  if (!nonEmptyString(payload.flowId)) return null;
  const flowId = payload.flowId;
  const flowStatePath = governanceFlowStatePath(flowId);
  const flowStateExists = options?.flowStateExists === true;
  const flowStateSkeleton = options?.flowStateSkeleton === true;
  /** YAML 已存在时的统一推进指引（flow 工具；不直接写文件、不谎称已派发）。 */
  const flowToolInstruction = (stepNoun: string): string =>
    `流程状态 YAML 已存在（${flowStatePath}）；请用 flow_get 读取当前 revision，再用 flow_step_update / ` +
    `flow_step_supersede 推进${stepNoun}；不要直接 write_file 流程 YAML；不要把步骤说成已派发。`;
  if (payload.cardKind === "proposal" && payload.nextFunction === "nomination" && payload.roleId === "nominator") {
    const proposalPath = payload.proposalPath ?? `docs/proposals/${flowId}-v1.md`;
    return (
      `流程 ${flowId}：客户已接受提案 ${proposalPath}；流程状态 YAML 已落盘于 ${flowStatePath}。` +
      `请执行提名：按流程状态 YAML 的首个提名步骤，读取提案与流程状态 YAML，给出候选角色与理由，并通过任命卡请客户确认；不要自行任命或写角色卡。`
    );
  }
  if (
    payload.cardKind === "proposal" &&
    payload.nextFunction === "schedule" &&
    payload.roleId === "convener" &&
    payload.followUp === "nomination-after-flow"
  ) {
    const proposalPath = payload.proposalPath ?? `docs/proposals/${flowId}-v1.md`;
    if (flowStateExists) {
      return `流程 ${flowId}：客户已接受提案 ${proposalPath}。${flowToolInstruction("步骤")}`;
    }
    // accept 两段式第一段（legacy 迁移兼容）：先写流程状态 YAML；Nominator 由应用在 YAML 落盘且可解析后派发。
    return (
      `流程 ${flowId}：客户已接受提案 ${proposalPath}。` +
      `请先写流程状态 YAML ${flowStatePath}（唯一机器状态，字段/枚举按门禁卡的流程 YAML schema；` +
      `首个步骤为提名：由人事读取提案并给出候选角色）。同名 .md 仅可选人读视图，不得承载门禁状态。` +
      `写完后本轮即可结束；提名任务会在流程状态 YAML 落盘后由应用派给人事。不要把步骤说成已派发。`
    );
  }
  if (payload.cardKind === "proposal" && payload.nextFunction === "schedule" && payload.roleId === "convener") {
    // 2026-10-22 第 1 项：客户接受提案 ⇒ Convener 写流程 YAML + 团队计划并**直接发 appointment 卡**
    // （不再产生 nomination-after-flow 两段式；旧 followUp 分支见上，保留迁移兼容）。
    if (options?.proposalDecision === "accept") {
      const proposalPath = payload.proposalPath ?? `docs/proposals/${flowId}-v1.md`;
      const planRel = options.teamPlanPath ?? governanceTeamPlanPath(flowId);
      const flowInstruction = flowStateSkeleton
        ? `应用已在意图交接时创建通用流程骨架（${flowStatePath}，status: skeleton；只含 contract-freeze / team-plan / appointment / role-cards / role-readiness / acceptance-criteria / change-package / verification，不含项目角色与交付步骤）。` +
          `请先按下面的文案写团队计划；完成后用 request_confirmation(cardKind=schedule-write) 把该 YAML **一次性替换**为包含团队角色、交付步骤与 gate 的完整流程（保留 contract-freeze 已登记的证据，替换后去掉 status: skeleton），替换后改用 flow_get / flow_step_update / flow_step_supersede 推进，不要直接改文件、不要把步骤说成已派发。`
        : flowStateExists
          ? `流程状态 YAML 已存在（${flowStatePath}）：请用 flow_get 读取当前 revision，再用 flow_step_update / flow_step_supersede ` +
            `更新步骤（team-plan / appointment / role-cards / role-readiness / acceptance-criteria / change-package；保留 verification）；不要直接 write_file 流程 YAML。`
          : `请先写流程状态 YAML ${flowStatePath}（唯一机器状态；同名 .md 仅可选人读视图，不得承载门禁状态），` +
            `步骤使用 team-plan / appointment / role-cards / role-readiness / acceptance-criteria / change-package（kind 用现有 artifact / customer-decision / dispatch / acceptance），保留 verification 待应用派质检。`;
      // 2026-10-23 目录级授权：**新流程默认 v3**；已有 v1/v2 计划续接（调用方显式传 schema）时保留原 v2 文案逐字不变。
      const v2PlanInstruction =
        `并在 ${planRel} 写出/更新**团队计划 v2**（新流程默认 v2；frontmatter：flowId、version、riskTier、teamPlanSchema: 2、recommended: [角色id,...]、modules: [模块id,...]；` +
        `正文「模块清单」表逐模块含职责/公开契约/架构来源；角色表逐角色含 module/boundedContext、职责目标、能力要求、唯一写集、公开契约、测试面、依赖、dependsOn、并行组、组别、apiSpec、粒度理由；并写「五维判断/协调成本」章节）。` +
        `Map 组（parallelGroup: map-<slug>）写集必须两两不相交且组内无依赖；Reduce 角色（module: reduce、并行组: reduce）依赖全部 Map 角色；整层名/多模块例外必须写粒度理由。` +
        `legacy 旧计划可不写 teamPlanSchema: 2（按 v1 校验并记迁移提醒），但新流程请用 v2。`;
      const v3PlanInstruction =
        `并在 ${planRel} 写出/更新**团队计划 v3（目录级授权）**（新流程默认 v3；frontmatter：flowId、version、riskTier、teamPlanSchema: 3、recommended: [角色id,...]、modules: [模块id,...]、directories: [目录/,...]（非空、以 / 结尾）；` +
        `正文「模块清单」表逐模块含职责/公开契约/架构来源/实现目录（每个 module 必填非空，Q9 A）；角色表逐角色含 module/boundedContext、职责目标、能力要求、授权目录、精确写集、公开契约、测试面、依赖、dependsOn、并行组、组别、apiSpec、粒度理由；` +
        `并写「目录规范」表（目录/owner/类型/用途/命名/允许子目录/允许文件类型/公开契约/测试面/依赖/禁写区/共享；每目录唯一 owner、目录不重叠、共享策略 none/read-only/split）与「五维判断/协调成本」章节）。` +
        `治理关键路径（角色卡/边界、.ans、docs/scheduling|acceptance|communication|flows|nominations、src/common/shared、release/packaging、密钥）只能按精确写集授权，不得作为普通授权目录。` +
        `Map 组（parallelGroup: map-<slug>）写集必须两两不相交且组内无依赖；Reduce 角色（module: reduce、并行组: reduce）依赖全部 Map 角色；整层名/多模块例外必须写粒度理由。` +
        `readiness 记录逐角色列 directories/spec/shared/layout（并保留 module/contract/testSurface/parallel/dependsOn/granularity）。v1/v2 旧计划继续可读（不强制迁移）；新流程请用 v3。`;
      const planInstruction =
        options?.teamPlanSchema === 1 || options?.teamPlanSchema === 2 ? v2PlanInstruction : v3PlanInstruction;
      return (
        `流程 ${flowId}：客户已接受提案 ${proposalPath}。` +
        flowInstruction +
        planInstruction +
        `完成后**直接发任命卡**：request_choice(cardKind=appointment, flowId=${flowId}, stepId=role-cards)，` +
        `选项为团队计划 recommended 中的项目角色（不含内置治理角色）；不要替客户决定、不要自行任命、不要写角色卡。`
      );
    }
    if (flowStateExists) {
      return (
        `流程 ${flowId}：客户已接受提案（快捷路径）。${flowToolInstruction("步骤")}` +
        `涉及新建/改边界仍须任命卡与写盘确认。`
      );
    }
    return (
      `流程 ${flowId}：客户已接受提案（快捷路径）。` +
      `请写流程状态 YAML ${flowStatePath} 并排步骤（无提名；同名 .md 仅可选人读视图，不得承载门禁状态）；` +
      `涉及新建/改边界仍须任命卡与写盘确认。`
    );
  }
  if (payload.cardKind === "appointment" && payload.nextFunction === "role-card-write" && payload.roleId === "nominator") {
    const ids = (targetRoleIds ?? []).filter((id): id is string => nonEmptyString(id));
    if (ids.length === 0) return null; // 任命名单缺失：不猜、不裸发。
    const planRel = options?.teamPlanPath;
    const legacyRel = options?.nominationPath;
    if (planRel === undefined && legacyRel === undefined) return null; // 无团队计划也无 legacy 提名：不猜、不裸发。
    const schemaNote =
      options?.teamPlanSchema === 3
        ? "（团队计划 v3：按授权目录/精确写集/目录规范写卡；new 边界与计划一致，changed/existing 计划 ⊆ 边界）"
        : options?.teamPlanSchema === 2
          ? "（团队计划 v2：按 module/公开契约/测试面/dependsOn/并行组/粒度理由写卡）"
          : options?.teamPlanSchema === 1
            ? "（legacy v1：按旧四列写卡；建议迁移团队计划 v2）"
            : "";
    const moduleNote =
      (options?.teamPlanSchema === 2 || options?.teamPlanSchema === 3) && (options.teamPlanModules?.length ?? 0) > 0
        ? `；模块清单：${options.teamPlanModules!.join("、")}`
        : "";
    const directoryNote =
      options?.teamPlanSchema === 3 && (options.teamPlanDirectories?.length ?? 0) > 0
        ? `；授权目录：${options.teamPlanDirectories!.join("、")}`
        : "";
    // 2026-10-23 目录级授权（v3）：只对 v3 计划追加写边界/目录规范要求；v2/legacy 文案逐字不变。
    const v3WriteRequirements =
      options?.teamPlanSchema === 3
        ? `v3 写卡要求：boundary.yaml 为每个「授权目录」写目录条目（kind: directory/conditional-directory），为「精确写集」写文件条目；new 角色边界目录必须与计划授权目录一致（排除角色根，不得更宽/更窄）；changed/existing 计划目录必须被边界覆盖，更宽部分限于该角色模块实现目录/既有职责（V12 的宽边界 warning 交 readiness 逐条记录）；不得改目录规范、不得跨目录或写他人目录；治理关键路径（角色卡/边界、.ans、src/common/shared、release/packaging、密钥）只按精确文件授权。`
        : "";
    const basis =
      planRel !== undefined
        ? `依据团队计划 ${planRel}${options?.teamPlanVersion !== undefined ? `（version=${options.teamPlanVersion}）` : ""}${schemaNote}${moduleNote}${directoryNote}只读执行`
        : `依据旧提名文件 ${legacyRel}（legacy；新流程应使用团队计划）只读执行`;
    return (
      `流程 ${flowId}：客户已完成任命（闸门 2）：${ids.join("、")}。${basis}；只对名单内角色写卡，不自行扩大职责、不改团队计划、不改其他角色。` +
      `逐路径写入并用 request_confirmation(cardKind=appointment-write, flowId=${flowId}, stepId=role-cards) 请客户确认（逐路径列出全部文件）：` +
      `① role-card.md：角色名/组别/工作立场、能力描述、职责与功能导航、必读资料、交接输入输出、执行原则、质量职责、标准工作流、交付物清单；v2 另须写明 bounded context/公开契约/测试面/上下游依赖/粒度理由；` +
      `② boundary.yaml：现有 schema + 角色根工作文档条目（角色卡/<id>/feature-map.md、functional-description.md、memo.md、api-spec.md）+ 按团队计划的实际写集；**计划写集必须被 entries 覆盖（V12 不覆盖会退回）**；` +
      `③ feature-map.md、functional-description.md、memo.md、api-spec.md（无共享接口时写 not-applicable + 非空理由）。` +
      `不得写整层/纳米角色；不要写计划里没有的模块或路径。` +
      `${v3WriteRequirements}` +
      `计划缺职责目标/能力要求/写集/依赖等细节时（v2 另含 module/公开契约/测试面/dependsOn/并行组）：停止写卡并报告运营补充计划，不自行补计划。写完后本轮结束；应用会做结构校验与计划写集覆盖核对（V12），通过后才请运营做 role-readiness。`
    );
  }
  if (payload.cardKind === "appointment" && payload.nextFunction === "schedule" && payload.roleId === "convener") {
    // @deprecated legacy（2026-10-22 前的事件形状）：appointment 决定后直接派 Convener 排程。
    // 新主路径为 appointment → Crew 写卡（见上）；本分支仅保留旧事件/旧测试的迁移兼容。
    const ids = (targetRoleIds ?? []).filter((id): id is string => nonEmptyString(id));
    if (ids.length === 0) return null; // 任命名单缺失：不猜、不裸发。
    if (flowStateExists) {
      return `流程 ${flowId}：客户已完成任命 ${ids.join("、")}。${flowToolInstruction("已批准步骤")}`;
    }
    return `流程 ${flowId}：客户已完成任命 ${ids.join("、")}。请写流程状态 YAML ${flowStatePath} 并派发已批准步骤。`;
  }
  return null;
}

/** accept 两段式第二段的「提名已完成」续推任务（2026-10-20：不重复派 Nominator，让 Steward 继续）。 */
export function buildNominationAlreadyDoneMessage(flowId: string): string {
  const flowStatePath = governanceFlowStatePath(flowId);
  return (
    `流程 ${flowId}：提名（legacy）已完成（流程状态 YAML ${flowStatePath} 的 nomination 步骤已是 done），应用未重复派发提名任务。` +
    `新流程应为：团队计划 → 任命（appointment）→ 人事写卡（role-cards）→ 角色就绪复核（role-readiness）；` +
    `请用 flow_get 读取当前 revision，再用 flow_step_update / flow_step_supersede 推进后续步骤；不要直接 write_file 流程 YAML；不要把步骤说成已派发。`
  );
}

/** 「提名已完成、未重复派发」的系统行。 */
export function governanceNominationAlreadyDoneNote(): string {
  return mainT("main.governance.nominationAlreadyDone");
}

/** 成功派发的系统行文案（客户给定首例；其余按同一句式如实说明职能）。 */
export function governanceAdvanceSuccessNote(payload: GovernanceNextStepPayload): string {
  if (payload.nextFunction === "nomination") return mainT("main.governance.nominationDispatched");
  if (payload.nextFunction === "role-card-write") return mainT("main.governance.roleCardDispatched");
  return mainT("main.governance.flowTaskDispatched");
}

/** accept 两段式第二段的系统行：流程状态 YAML 已落盘且通过校验、Crew / 组队 已派。 */
export function governanceNominationFollowUpNote(): string {
  return mainT("main.governance.flowYamlAndNomination");
}

/**
 * **任命后角色卡/工作文档尚未写出**时的补救任务（2026-10-18 真机修正；2026-10-22 第 1/5 项更新）：
 * 账本已有 `appointment` 决定，但目标角色未通过结构校验（角色缺失或文件不齐）。此时**不能**派 Convener
 * 做 readiness——改派 Crew 依据团队计划用 appointment-write 逐路径写卡；写完后本轮结束，应用再校验。
 *
 * `options.teamPlanPath` 缺省时按 flowId 派生 v1 路径（任务文案，不是对文件系统的断言）；legacy 流程可传
 * `nominationPath`。
 */
export function buildAppointmentWriteReminderMessage(
  flowId: string,
  targetRoleIds: readonly string[],
  options: {
    teamPlanPath?: string;
    teamPlanVersion?: number;
    teamPlanSchema?: 1 | 2 | 3;
    teamPlanModules?: readonly string[];
    teamPlanDirectories?: readonly string[];
    nominationPath?: string;
  } = {},
): string {
  const ids = targetRoleIds.filter((id): id is string => nonEmptyString(id));
  const planRel = options.teamPlanPath ?? (options.nominationPath === undefined ? governanceTeamPlanPath(flowId) : undefined);
  const schemaNote =
    options.teamPlanSchema === 3
      ? "（v3：按授权目录/精确写集写边界，new 与计划一致、changed/existing 计划 ⊆ 边界）"
      : options.teamPlanSchema === 2
        ? "（v2：按 module/公开契约/测试面/dependsOn/并行组/粒度理由）"
        : "";
  const basis =
    planRel !== undefined
      ? `团队计划 ${planRel}${options.teamPlanVersion !== undefined ? `（version=${options.teamPlanVersion}）` : ""}` +
        schemaNote
      : `旧提名文件 ${options.nominationPath}（legacy）`;
  const v3Reminder =
    options.teamPlanSchema === 3
      ? `v3：boundary.yaml 须为每个「授权目录」写目录条目、为「精确写集」写文件条目；new 角色边界目录必须与计划授权目录一致（排除角色根，不得更宽/更窄）；changed/existing 计划目录必须被边界覆盖，更宽部分限于模块实现目录/既有职责；不得改目录规范/跨目录/写他人目录；治理关键路径只按精确文件授权。`
      : "";
  return (
    `流程 ${flowId}：客户已完成任命 ${ids.join("、")}，但角色卡/边界/工作文档尚未写出或不完整（项目中尚未枚举到这些角色）。` +
    `请人事读取${basis}，用 appointment-write 确认卡逐路径完成写卡：role-card.md（角色名/组别/工作立场、能力描述、职责与功能导航、必读资料、交接输入输出、执行原则、质量职责、标准工作流、交付物清单；v2 另写 bounded context/公开契约/测试面/上下游依赖/粒度理由）、` +
    `boundary.yaml（角色根工作文档条目 + 实际写集；计划写集必须被 entries 覆盖，V12 不覆盖会退回）、feature-map.md、functional-description.md、memo.md、api-spec.md（或 not-applicable + 非空理由）；` +
    `${v3Reminder}` +
    `只写名单内角色（${ids.join("、")}），计划缺细节报告运营补充，不自行扩大职责，不写整层/纳米角色。写完后本轮结束，不要自行任命、不要派发。`
  );
}

/** 任命后先派写卡任务的系统行。 */
export function governanceAppointmentWriteNote(): string {
  return mainT("main.governance.roleCardDispatched");
}

// —————————————— 2026-10-22 第 1/3/5 项：readiness / 实施前标准任务文案（唯一来源） ——————————————
//
// 方案 §5.3「Crew 写卡后的校验与派 Convener」：结构校验通过 ⇒ 派 Convener 做角色就绪复核；
// 方案 §7.2：appointment 决定后、实施派发前 ⇒ 派 Verifier 写实施前完成标准。两个任务都只给
// 路径/步骤/判定口径，**不预判结论、不替代客户决定**。

/**
 * Crew 写卡结构校验通过后的 **role-readiness** 任务（Convener 读团队计划逐角色复核；不写角色卡）。
 * `teamPlanPath` 缺省按 flowId 派生 v1 路径（任务文案，不是对文件系统的断言）。
 */
export function buildRoleReadinessTaskMessage(
  flowId: string,
  targetRoleIds: readonly string[],
  teamPlanPath?: string,
  teamPlanVersion?: number,
  options: {
    teamPlanSchema?: 1 | 2 | 3;
    modules?: readonly string[];
    /** v3：frontmatter `directories`（授权目录摘要）。 */
    directories?: readonly string[];
    /** v3：模块 `实现目录` 摘要（`module→dir`）。 */
    implementationDirs?: readonly string[];
    /**
     * 2026-10-23 可重入门禁（`governance-advance-redispatch` A6）：应用已在结构校验通过后把
     * `role-cards` 标为 done 时的证据引用。**未传 ⇒ 既有 v1/v2/v3 文案逐字不变**；传入时追加一句
     * 「只推进 role-readiness、不要重写角色卡、不要重新派 Crew」。证据只是结构校验记录，不是客户批准。
     */
    roleCardsDone?: { evidenceRef: string };
    /**
     * 2026-10-23 同上：flow 中 `role-readiness` 已 done（目标项目现状）⇒ 明确「不要重做，核对后继续」。
     * 未传/false ⇒ 文案不变。
     */
    roleReadinessAlreadyDone?: boolean;
  } = {},
): string {
  const ids = targetRoleIds.filter((id): id is string => nonEmptyString(id));
  const planRel = teamPlanPath ?? governanceTeamPlanPath(flowId);
  const readinessRel = governanceReadinessPath(flowId);
  const isV2 = options.teamPlanSchema === 2;
  const isV3 = options.teamPlanSchema === 3;
  const modules = (options.modules ?? []).filter((module): module is string => nonEmptyString(module));
  const directories = (options.directories ?? []).filter((dir): dir is string => nonEmptyString(dir));
  const implementationDirs = (options.implementationDirs ?? []).filter((dir): dir is string => nonEmptyString(dir));
  const directoryNote = isV3 && directories.length > 0 ? `；授权目录：${directories.join("、")}` : "";
  const implementationNote = isV3 && implementationDirs.length > 0 ? `；模块实现目录：${implementationDirs.join("、")}` : "";
  const v2Scope = isV2
    ? `团队计划为 v2（teamPlanSchema: 2）${modules.length > 0 ? `；模块清单：${modules.join("、")}` : ""}。` +
      `逐角色核对 module/boundedContext、职责目标、能力要求、唯一写集、公开契约、测试面、依赖/dependsOn、并行组与粒度理由；` +
      `核对模块覆盖（每模块恰一个 Map 角色、无孤儿/重复）、写集两两不相交、依赖无环、同一 Map 组内无依赖、Map 不依赖 Reduce、Reduce 覆盖全部 Map。`
    : `（legacy v1：按旧职责目标/能力要求/写集/边界/依赖/交接核对；如需模块/契约/测试面/并行复核请迁移团队计划 v2。）`;
  // 2026-10-23 目录级授权（v3）：只对 v3 计划追加目录/规范/共享/布局复核；v1/v2 文案逐字不变。
  const v3Scope = isV3
    ? `团队计划为 v3（teamPlanSchema: 3）${modules.length > 0 ? `；模块清单：${modules.join("、")}` : ""}${directoryNote}${implementationNote}。` +
      `逐角色核对 module/职责目标/能力要求/授权目录+精确写集/公开契约/测试面/依赖/dependsOn/并行组与粒度理由；` +
      `逐目录核对目录规范（owner/类型/用途/命名/允许子目录/允许文件类型/公开契约/测试面/依赖/禁写区/共享）、共享策略与治理关键路径（角色卡/边界、.ans、src/common/shared、release/packaging、密钥只精确授权）；` +
      `核对 frontmatter directories/目录规范表/角色授权目录三处一致、每目录唯一 owner、互不重叠、模块实现目录约束、new 边界目录与计划一致、changed/existing 计划 ⊆ 边界且更宽部分在模块实现目录/既有职责内（V12 的宽边界 warning 逐条记录依据）；` +
      `核对模块覆盖（每模块恰一个 Map 角色、无孤儿/重复）、依赖无环、同一 Map 组内无依赖、Map 不依赖 Reduce、Reduce 覆盖全部 Map。`
    : v2Scope;
  const scopeText = isV3 ? v3Scope : v2Scope;
  const readinessColumns = isV3
    ? "（frontmatter flowId/version/status: pass|gaps；逐角色列 directories/spec/shared/layout 并保留 module/contract/testSurface/parallel/dependsOn/granularity，每项 pass/gap + 证据如目录规范行/boundary 条目/role-card 章节/行号）。"
    : isV2
      ? "（frontmatter flowId/version/status: pass|gaps；逐角色列 module/contract/testSurface/parallel/dependsOn/granularity，每项 pass/gap + 证据如 role-card 章节/行号）。"
      : "（frontmatter flowId/version/status: pass|gaps，逐角色每项 pass/gap + 证据如 role-card 章节/行号）。";
  const roleCardsNote =
    options.roleCardsDone !== undefined
      ? `应用已在结构校验通过后把 role-cards 标为 done（证据：${options.roleCardsDone.evidenceRef}）：本次只推进 role-readiness，不要重写角色卡、不要重新派人事。`
      : "";
  const readinessDoneNote =
    options.roleReadinessAlreadyDone === true
      ? "flow 中 role-readiness 已 done：不要重做角色就绪复核，核对既有记录与证据后继续推进后续步骤。"
      : "";
  return (
    `流程 ${flowId}：人事写卡已通过结构校验（文件/章节齐全、计划写集已被 boundary entries 覆盖；**能力内容尚未判定**）。` +
    `请对照团队计划 ${planRel}${teamPlanVersion !== undefined ? `（version=${teamPlanVersion}）` : ""} 逐角色做角色就绪复核（stepId=role-readiness）：${scopeText}` +
    `核对职责目标/能力要求/写集/边界/依赖/交接/质量责任；复核记录写入 ${readinessRel}${readinessColumns}` +
    `Map 组任务须写明同组可并行、写集不相交、只依赖 contract-freeze/前置组、不得写对方路径；Reduce 任务须写明等全部 Map done 后跑契约/集成/e2e，测试按模块分片并行、每分片独立证据、合并 manifest。` +
    `结构校验通过不等于判定粒度正确：语义判断须写入 readiness 记录与证据，应用不代做语义判断。` +
    `有 gap ⇒ 在记录中标 gaps 并退回人事修正；计划缺职责/能力/写集/模块细节 ⇒ 补充计划；全部 pass ⇒ 用 flow_step_update 把 role-readiness 标 done，再按已批准步骤派发项目角色。` +
    `不要写角色卡、不要代替人事写卡、不要绕过客户确认。` +
    roleCardsNote +
    readinessDoneNote
  );
}

/** readiness 任务派发成功的系统行。 */
export function governanceReadinessNote(): string {
  return mainT("main.governance.roleReadinessDispatched");
}

/**
 * 实施前完成标准任务（Verifier；不发验收卡）。方案 §7.2：输入为客户确认的方案版本/意图/团队计划
 * （范围依据）、风险档位；输出 `docs/acceptance/<flowId>-criteria-v1.md`。
 */
export interface BuildAcceptanceCriteriaTaskMessageOptions {
  teamPlanPath?: string;
  riskTier?: GovernanceRiskTier;
  /** 团队计划 schema（1=legacy；2=v2；3=v3）；v3 追加目录/布局核对标准要求，v1/v2 文案不变。 */
  teamPlanSchema?: 1 | 2 | 3;
}

export function buildAcceptanceCriteriaTaskMessage(
  flowId: string,
  options: BuildAcceptanceCriteriaTaskMessageOptions = {},
): string {
  const planRel = options.teamPlanPath ?? governanceTeamPlanPath(flowId);
  const criteriaRel = governanceAcceptanceCriteriaPath(flowId);
  const riskText =
    options.riskTier !== undefined
      ? `风险档位：${options.riskTier}（变更包按当前候选复核，不得低于团队计划；你只能升档）`
      : "风险档位：按团队计划标注（变更包按当前候选复核，不得低于团队计划；你只能升档）";
  // 2026-10-23 目录级授权（v3）：只对 v3 计划追加标准要求；v1/v2 文案逐字不变。
  const v3Criteria =
    options.teamPlanSchema === 3
      ? `⑩ 若团队计划为 v3（teamPlanSchema: 3），标准须覆盖 v3 schema（frontmatter directories/角色授权目录+精确写集/目录规范/模块实现目录）、共享与治理关键路径、V-D1–D9 与 V12（new 边界一致、changed/existing 覆盖/迁移）、布局核对（改动路径 → 目录规范：文件类型/子目录/命名/禁写区/路径安全）并附原始 git status/diff（含未跟踪）与候选哈希；legacy v1/v2 行为不变；不得把结构通过当语义正确。`
      : "";
  return (
    `流程 ${flowId}：客户已确认任命（闸门 2）。请在实施派发前写**实施前完成标准** ${criteriaRel}，` +
    `用 request_confirmation(cardKind=write, flowId, 逐路径) 确认写盘；本阶段只写标准，**不要发验收卡**。` +
    `标准依据：客户确认的策划方案版本（路径 + 版本/哈希）、闸门 0 意图记录、团队计划 ${planRel}（只作范围依据，不是标准来源）；${riskText}。` +
    `必须包含：① 基线（方案版本/意图/团队计划与 gate 2 记录）；② 范围/写集/非目标；` +
    `③ 验收表（ID、方案条目/标准、需要的证据、实际证据路径/哈希、候选版本、产出角色、结果、验收判断）；` +
    `④ 风险档位与判定依据、选定检查、复用证据规则、全量回归条件；⑤ 成功/失败/边界情形；` +
    `⑥ 候选身份（哈希/版本）与证据失效规则；⑦ 判定规则（pass / fail / insufficient evidence / not applicable）；` +
    `⑧ 版本冻结规则（实施开始后不得改标准适配候选；确需变更递增版本并报运营/沟通确认）。` +
    `⑨ 若团队计划为 v2（teamPlanSchema: 2），标准须覆盖模块覆盖/写集不相交/并行组/dependsOn/粒度例外，以及测试按模块分片并行、每分片独立证据、Reduce 合并 docs/verification/<flowId>/manifest.md 的证据规则；legacy 计划按 v1 兼容。` +
    v3Criteria +
    // 2026-10-27 客户新设计：写完标准后必须**汇报给应用**，由应用校验后收口 acceptance-criteria 步骤。
    // 应用不盯文件自动勾卡；质检也不得自行改 flow 状态。
    `写完后必须调用 report_artifact_ready({ flowId: "${flowId}", stepId: "acceptance-criteria", path: "${criteriaRel}" }) 汇报给应用；` +
    `应用会校验 flow/步骤/最新标准路径与文件是否可读，校验通过后才把 acceptance-criteria 步骤收口为 done（幂等）。` +
    `不要自行调用 flow_step_update 标 done、不要改 flow 其它状态；汇报被拒时按回执原因修正后再次汇报（不要伪造已收口）。` +
    `不要自行验收、不要代替客户决定。`
  );
}

/** 实施前标准任务派发成功的系统行（应用派发 ≠ 客户批准）。 */
export function governanceAcceptanceCriteriaNote(flowId: string): string {
  return mainT("main.governance.criteriaDispatched", { flowId });
}

/**
 * **「标准文件已存在但步骤仍 pending」时给 verifier 的汇报唤醒**（2026-10-27 客户新设计）。
 *
 * 应用**不**盯文件自动勾卡；标准落盘后需要质检自己调用 `report_artifact_ready`。本消息只提醒「请汇报」，
 * 由应用能力校验/收口；消息本身不改 flow、不标 done、不冒充客户消息。
 */
export function buildAcceptanceCriteriaReportReminderMessage(input: {
  flowId: string;
  criteriaPath: string;
  stepStatus: string;
}): string {
  return [
    `[请汇报] 流程 ${input.flowId}：实施前验收标准文件已存在（${input.criteriaPath}），但 flow 中 acceptance-criteria 步骤仍为 ${input.stepStatus}。`,
    `应用不会根据文件存在自动勾卡，也不会代改 flow。请核对标准写完后调用 ` +
      `report_artifact_ready({ flowId: "${input.flowId}", stepId: "acceptance-criteria", path: "${input.criteriaPath}" }) 汇报；` +
      `应用校验通过（flow/步骤/最新路径/文件可读）才会收口该步骤。`,
    `若标准尚未写完，请继续写完再汇报；不要自行 flow_step_update 标 done、不要改其它步骤状态。`,
  ].join("\n");
}

/**
 * **流程停滞看护任务**（2026-10-27）：无 current 步骤 + 仍有 pending + 全部相关角色空闲/无 pending 卡
 * 持续约 10 分钟时，向运营（convener）投**一条**系统唤醒（按 pending 签名去重，不刷屏）。
 *
 * 只提示 `flow_get` 核对与按职责协调；**不**直接派项目 worker、不标 done、不写 flow/账本、不伪造状态。
 */
export interface BuildFlowStallTaskMessageInput {
  flowId: string;
  /** 当前 flow YAML revision（sha256；只展示前 12 位）。 */
  revision: string;
  /** pending 步骤摘要（id/status/owner/kind；有界）。 */
  pending: ReadonlyArray<{ id: string; status: string; owner?: string; kind?: string }>;
  /** 已持续空闲的时长（毫秒；文案换算为分钟）。 */
  idleMs: number;
  /** 规划器的 ready 步骤 id（只作事实；不在此派发）。 */
  readyIds?: readonly string[];
  /** 规划器给出的人工闸门（awaiting-customer / awaiting-acceptance）。 */
  stopReason?: string;
}

export function buildFlowStallTaskMessage(input: BuildFlowStallTaskMessageInput): string {
  const revisionText = input.revision.length > 12 ? input.revision.slice(0, 12) : input.revision;
  const minutes = Math.max(1, Math.round(input.idleMs / 60_000));
  const pendingLines = input.pending
    .slice(0, 10)
    .map((step) => `- ${step.id}（status=${step.status}${step.owner !== undefined ? `，owner=${step.owner}` : ""}${step.kind !== undefined ? `，kind=${step.kind}` : ""}）`);
  if (input.pending.length > 10) pendingLines.push(`- ……（另有 ${input.pending.length - 10} 个 pending 步骤，详见 flow_get）`);
  return [
    `[自动推进·停滞] 流程 ${input.flowId} 已约 ${minutes} 分钟没有在途工作，但仍存在 pending 步骤（当前 revision：${revisionText}）。`,
    `pending 步骤（按 flow 原顺序）：`,
    ...pendingLines,
    ...(input.readyIds !== undefined && input.readyIds.length > 0
      ? [`规划器就绪步骤：${input.readyIds.slice(0, 10).join("、")}`]
      : []),
    ...(input.stopReason !== undefined
      ? [`当前人工闸门：${input.stopReason}（如确在等待客户决定，请如实向客户汇报，不要伪造推进）。`]
      : []),
    `请用 flow_get 读取当前 revision 与账本后按职责协调：需要项目角色返工/交付的用既有 dispatch_task 门禁派发；等待客户决定/验收的如实汇报；`,
    `不要替应用标 done、不要改 flow/账本、不要越过 gate/客户决定。本消息只是停滞提示：应用未自动派发、未改任何状态。`,
  ].join("\n");
}


// —————————————— 2026-10-25 验收分诊：卡面 / 汇报 / 退回文案（纯函数，无 IO） ——————————————
//
// 设计 `2026-10-25_design_acceptance-triage.md` §7.2 / §8.2 / §10。所有用户可见文本走共享 `ui.triage.*`；
// 本模块不解析报告、不做建议（编排纯函数负责），只把解析结果拼成有界、确定性的文本。

/** 严重度标签（四档固定；未知值回落原文——解析器已保证枚举，这里只防御）。 */
export function acceptanceTriageSeverityLabel(severity: AcceptanceTriageSeverity | string): string {
  switch (severity) {
    case "blocker":
      return mainT("ui.triage.severity.blocker");
    case "major":
      return mainT("ui.triage.severity.major");
    case "minor":
      return mainT("ui.triage.severity.minor");
    case "nit":
      return mainT("ui.triage.severity.nit");
    default:
      return String(severity);
  }
}

/** 结论标签（pass / fail / conditional）。 */
export function acceptanceTriageConclusionLabel(conclusion: "pass" | "fail" | "conditional" | string): string {
  switch (conclusion) {
    case "pass":
      return mainT("ui.triage.conclusion.pass");
    case "fail":
      return mainT("ui.triage.conclusion.fail");
    case "conditional":
      return mainT("ui.triage.conclusion.conditional");
    default:
      return String(conclusion);
  }
}

/** 默认建议一句（附依据码；`authoritative:false` ⇒ 「无法自动建议」）。 */
function acceptanceTriageAdviceText(recommendation: AcceptanceTriageRecommendation): string {
  if (recommendation.authoritative !== true) return mainT("ui.triage.advice.none");
  if (recommendation.disposition === "report-only") {
    return mainT("ui.triage.advice.reportOnly", {
      minors: recommendation.severityCounts.minor + recommendation.severityCounts.nit,
    });
  }
  if (recommendation.disposition === "rework") {
    return mainT("ui.triage.advice.rework", {
      blockers: recommendation.severityCounts.blocker,
      majors: recommendation.severityCounts.major,
    });
  }
  return mainT("ui.triage.advice.none");
}

/** 单条失败原因（`id · severity：reason`）。 */
function acceptanceTriageReasonLine(item: AcceptanceTriageSection["items"][number]): string {
  return mainT("ui.triage.report.reasonLine", {
    id: item.id,
    severity: acceptanceTriageSeverityLabel(item.severity),
    reason: item.reason,
  });
}

/** 单条改进方案（action + targets/criteria 指针；证据不是改进方案，不在此列）。 */
function acceptanceTriageActionLine(item: AcceptanceTriageSection["items"][number]): string {
  const pointers = [...item.targets, ...(item.criteria !== null ? [item.criteria] : [])];
  const action =
    pointers.length > 0 ? `${item.action}（${pointers.join("；")}）` : item.action;
  return mainT("ui.triage.report.actionLine", { action });
}

/** 分诊卡 preview：结论摘要 + 失败项/原因 + 改进方案 + 默认建议与依据 + 阻断警示（§7.2）。 */
export function buildAcceptanceTriageCardLines(input: {
  triage: AcceptanceTriageSection;
  recommendation: AcceptanceTriageRecommendation;
  reportPath: string;
  reportVersion: number;
}): string[] {
  const { triage, recommendation, reportPath, reportVersion } = input;
  const shown = triage.items.slice(0, 10);
  const lines: string[] = [
    `${mainT("ui.triage.section.summary")}：${acceptanceTriageConclusionLabel(triage.conclusion)}`,
    mainT("ui.triage.report.pathLine", { path: `${reportPath}（v${reportVersion}）` }),
    "",
    `${mainT("ui.triage.section.failures")}：`,
    ...shown.map((item) => `- ${acceptanceTriageReasonLine(item)}`),
  ];
  if (triage.items.length > shown.length) {
    lines.push(`- ……（另有 ${triage.items.length - shown.length} 项，详见报告）`);
  }
  lines.push("", `${mainT("ui.triage.section.improvements")}：`);
  lines.push(...shown.map((item) => `- ${acceptanceTriageActionLine(item)}`));
  lines.push("", acceptanceTriageAdviceText(recommendation));
  if (recommendation.blockingCount > 0) {
    lines.push(`⚠ ${mainT("ui.triage.warn.blockingReportOnly")}`);
  }
  return lines;
}

/**
 * 「仅汇报不返工」的主理确定性汇报（§8.2）：结论、逐项 severity/reason、逐项 action+指针、
 * 决定来源、报告路径。不调用模型、不写客户决定。
 */
export function buildAcceptanceTriageReportText(input: {
  triage: AcceptanceTriageSection;
  source: "judge" | "customer";
  reportPath: string;
  reportVersion: number;
}): string {
  const { triage, source, reportPath, reportVersion } = input;
  const sourceText = source === "judge" ? mainT("ui.triage.source.judge") : mainT("ui.triage.source.customer");
  const lines: string[] = [
    mainT("ui.triage.report.head", { conclusion: acceptanceTriageConclusionLabel(triage.conclusion) }),
    mainT("ui.triage.report.pathLine", { path: `${reportPath}（v${reportVersion}）` }),
    `${mainT("ui.triage.section.failures")}：`,
    ...triage.items.map((item) => `- ${acceptanceTriageReasonLine(item)}`),
    `${mainT("ui.triage.section.improvements")}：`,
    ...triage.items.map((item) => `- ${acceptanceTriageActionLine(item)}`),
    mainT("ui.triage.report.noRework", { source: sourceText }),
  ];
  return lines.join("\n");
}

/** 报告缺/坏分诊结构 ⇒ 退回 Proof 补报告的系统行（不弹卡、不返工、不写客户决定）。 */
export function governanceAcceptanceTriageReturnedNote(detail: string): string {
  return `${mainT("ui.triage.returnedToVerifier")}（${detail}）`;
}

/** 验收报告不可读时的系统行（含具体错误；调用方去重）。 */
export function governanceAcceptanceTriageMissingReportNote(detail: string): string {
  return mainT("ui.triage.missingReport", { detail });
}
