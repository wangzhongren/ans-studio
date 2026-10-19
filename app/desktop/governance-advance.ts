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
// `docs/flows/<flowId>.md` 还不存在（应由 Convener 先写），直接派只会让它反复猜路径、大量读失败。
// 现改为两段式：先派 Convener 写流程单（步骤表，首步提名；`followUp:"nomination-after-flow"`），
// 应用在 Convener 本轮真正空闲后检查流程单是否落盘；落盘 ⇒ 再派 Nominator（消息带流程路径），
// 缺失/超时 ⇒ 系统行如实报错、**不循环重试**。`accept-quick`/`appointment` 仍单段派 Convener。
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
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";

/** 下一步治理职能（客户契约固定词）。 */
export type GovernanceNextFunction = "nomination" | "schedule";

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
   * `docs/flows/<flowId>.md`（步骤表，首步提名）；流程单落盘后应用再派 Nominator。
   * `accept-quick`/`appointment` 没有本字段（直接由 Convener 排程）。
   */
  followUp?: "nomination-after-flow";
}

/** 治理流程单的项目相对路径（唯一写法；Convener 写、应用检查、Nominator 任务引用均用它）。 */
export function governanceFlowPath(flowId: string): string {
  return `docs/flows/${flowId}.md`;
}

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
 * · 产物型：契约冻结（`contract-freeze*`）、提案/流程单写入（`proposal*`/`flow*`/`schedule*`）；
 * · 客户决定型：提名/角色就绪（`nomination*`、`role-readiness`、`roles-ready`、`role-ready`）；
 * · 派发型：`delivery-*`、`*e2e*`、`cleanup*`、`rework-*`、`integration-*`、`verify-*` 及所有未知 id。
 */
const FLOW_STEP_EVIDENCE_RULES: readonly FlowStepEvidenceRule[] = [
  { kind: "artifact", test: (id) => /^contract-freeze(?:$|[-_.])/i.test(id) },
  { kind: "artifact", test: (id) => /^(?:proposal|flow|schedule)(?:$|[-_.])/i.test(id) },
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
 * 验收复核是否**已派发过**（持久化去重）：账本已有 targetRoleId=verifier 的 `dispatch.accepted`
 * （或 app 写的 stepId=verification 记录）。重启后据此不再重复派。
 */
export function acceptanceDispatchRecorded(
  flowId: string,
  ledger: { entries: readonly FlowCompletionLedgerEntryLike[] },
): boolean {
  return ledger.entries.some(
    (entry) =>
      entry.kind === "dispatch.accepted" &&
      entry.flowId === flowId &&
      (entry.targetRoleId === "verifier" || (entry.stepId === "verification" && entry.actorRoleId === "app")),
  );
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
 * 收尾推进的唯一一条任务（Rapporteur）：只引用流程单与回交/报告路径，要求汇总证据并**出验收卡**；
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
 */
export function buildAcceptanceTaskMessage(flowId: string, evidence: readonly string[]): string {
  const paths = [...new Set(evidence.filter((item): item is string => nonEmptyString(item)))].slice(0, 10);
  const evidenceText = paths.length > 0 ? paths.join("、") : "见回交报告与流程单";
  return (
    `流程 ${flowId} 步骤已全部完成（流程单：${governanceFlowPath(flowId)}；回交/核对报告路径：${evidenceText}）。` +
    `请汇总证据并出验收卡（不要自行验收或代替客户决定）。` +
    `验收前必须满足以下硬要求：` +
    `① 按工程质量基线逐项核对并给出结论与证据：正确性、健壮性、安全、可维护性、可观测性、性能、前端可访问性、测试矩阵；` +
    `② 必须真实启动应用并向客户演示：给出启动命令与访问地址，附截图或录屏（你已有审批档 shell，可执行启动命令，命令逐条提交审批）；` +
    `③ 未真实启动/演示、或质量基线某项无证据，不得建议 accept（只能建议退回或补充证据）；` +
    `④ 演示证据与逐项核对结论写入 docs/verification/${flowId}-v1.md，并在验收卡中引用。` +
    `⑤ 按提案/变更的「架构方案或架构影响分析」核对实现：模块边界、依赖方向、扩展点、数据 schema/API 版本迁移与声明一致；缺失架构章节或实现偏离声明时不得建议 accept（只能建议退回或补充证据）。`
  );
}

/** 收尾推进成功的系统行（2026-10-19 客户反馈：验收复核是标准流程，由应用自动派发；**不是客户批准**）。 */
export function governanceAcceptanceAdvanceNote(flowId: string): string {
  return `流程 ${flowId} 步骤已全部完成，已自动派发验收复核给 Proof（工作中）`;
}

/**
 * 自动验收被收尾门挡住时的**系统行**（2026-10-19 客户反馈「这个难道不是bug吗」）。
 *
 * 门本身 fail-closed 正确，但原因原先只写诊断日志（`acceptance.flow.incomplete`）——Steward/客户
 * 看不到，只能由操作者手动复算再转告，**静默本身就是缺陷**。本函数把具体原因 + 可操作建议变成
 * 治理主人（Convener；无法确定则 Lead）聊天的系统行：
 *  - 未完成/阻塞/证据不足：建议把已被 retake 取代的 aborted/failed 步骤标为 `superseded`（或
 *    `cancelled`），或用新 `stepId` 重派并更新流程单；应用**不会自动改写流程单，也不会自动派 Proof**；
 *  - 终态（验收步骤已完成 / 已有验收决定）：无需操作，如实说明不会重复派发。
 *
 * 本函数只产出文案：**不改变 `flowCompletionIssue` 门禁判定**、不把 failed/aborted 自动当 superseded、
 * 不写账本。去重（同一 flow + 同一原因只发一次）由调用方（Interface）负责。
 */
export function governanceAcceptanceBlockedNote(flowId: string, issue: string): string {
  const advice = FLOW_COMPLETION_TERMINAL_REASONS.has(issue)
    ? "无需操作：流程已收口，应用不会重复派发验收复核。"
    : `建议：若旧步骤已被 retake 取代，请把对应的 aborted/failed 步骤在流程单 ${governanceFlowPath(flowId)} 中标为 superseded（或 cancelled）；或用新的 stepId 重新派发任务并在流程单中更新状态与证据。修正后下一次事件会自动重新检查；应用不会自动改写流程单，也不会自动派 Proof。`;
  return `自动验收未派发：流程 ${flowId} 未通过收尾门。原因：${issue}。${advice}`;
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
}

/** 派发结果（主进程内部使用；成功/失败都如实）。 */
export interface GovernanceAdvanceResult {
  ok: boolean;
  /** 是否真的投递了任务（`nextFunction=null` 时为 false——无需派发）。 */
  dispatched: boolean;
  targetRoleId?: GovernanceNextRoleId;
  /** `proposal accept` 两段式：第二段真正派发到的目标（流程单落盘后才会有）。 */
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
 * 按「卡片种类 + 客户实际选择」推导下一步（客户已定契约的推导表；2026-10-18 真机修正后）：
 * - `proposal` + `accept`       → schedule / convener，`followUp:"nomination-after-flow"`：
 *                                 **先**由 Convener 写 `docs/flows/<flowId>.md`（步骤表，首步提名），
 *                                 流程单落盘后应用再派 Nominator（**不再直接派 Nominator**）；
 * - `proposal` + `accept-quick` → schedule / convener（写流程单并排步骤，无提名）；
 * - `proposal` + `revise|reject`→ null（无下一步，等客户改稿或放弃）；
 * - `appointment`（任命成功）    → schedule / convener（排程，既有逻辑不变）；
 * - `acceptance`（验收成功）     → null（流程收口）；
 * - `intent-confirm`（需求确认） → null（2026-10-18 客户拍板：客户确认后由 Lead 自己调 `hand_off_intent`，
 *                                 应用不推进）；
 * - `write`/`appointment-write`/`schedule-write` → null（写盘确认不解锁任何下一步；appointment-write
 *                                 的后续由既有 appointment 链路负责：写卡 → settle → 刷新 → 角色出现后派 Convener）；
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
        // 真机闭环：流程单不存在时不能直接派 Nominator（否则只能反复猜路径、大量读失败）。
        nextFunction = "schedule";
        roleId = "convener";
        followUp = "nomination-after-flow";
      } else if (selected.includes("accept-quick")) {
        nextFunction = "schedule";
        roleId = "convener";
      }
      // revise / reject / 非标准选项：无下一步。
      break;
    }
    case "appointment":
      // 任命决定成功（客户实际选中了候选角色）→ 由 Convener 写流程单并派发。
      nextFunction = "schedule";
      roleId = "convener";
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

/**
 * 生成**唯一一条**后台派发任务消息（客户给定文案；不增不减语义）。
 * 返回 null = 信息不足（无 flowId、appointment 无任命名单）——调用方应如实报失败，不猜测、不裸发。
 */
export function buildGovernanceAdvanceMessage(
  payload: GovernanceNextStepPayload,
  targetRoleIds?: readonly string[],
): string | null {
  if (!nonEmptyString(payload.flowId)) return null;
  const flowId = payload.flowId;
  const flowPath = governanceFlowPath(flowId);
  if (payload.cardKind === "proposal" && payload.nextFunction === "nomination" && payload.roleId === "nominator") {
    const proposalPath = payload.proposalPath ?? `docs/proposals/${flowId}-v1.md`;
    return (
      `流程 ${flowId}：客户已接受提案 ${proposalPath}；流程单已落盘于 ${flowPath}。` +
      `请执行提名：按流程单的首个提名步骤，读取提案与流程单，给出候选角色与理由，并通过任命卡请客户确认；不要自行任命或写角色卡。`
    );
  }
  if (
    payload.cardKind === "proposal" &&
    payload.nextFunction === "schedule" &&
    payload.roleId === "convener" &&
    payload.followUp === "nomination-after-flow"
  ) {
    // accept 两段式第一段：先写流程单；Nominator 由应用在流程单落盘后派发。
    const proposalPath = payload.proposalPath ?? `docs/proposals/${flowId}-v1.md`;
    return (
      `流程 ${flowId}：客户已接受提案 ${proposalPath}。` +
      `请先写流程单 ${flowPath}（步骤表；首个步骤为提名：由 Crew / 组队 读取提案并给出候选角色）。` +
      `写完后本轮即可结束；提名任务会在流程单落盘后由应用派给 Crew / 组队。不要把步骤说成已派发。`
    );
  }
  if (payload.cardKind === "proposal" && payload.nextFunction === "schedule" && payload.roleId === "convener") {
    return (
      `流程 ${flowId}：客户已接受提案（快捷路径）。` +
      `请写流程单 ${flowPath} 并排步骤（无提名）；涉及新建/改边界仍须任命卡与写盘确认。`
    );
  }
  if (payload.cardKind === "appointment" && payload.nextFunction === "schedule" && payload.roleId === "convener") {
    const ids = (targetRoleIds ?? []).filter((id): id is string => nonEmptyString(id));
    if (ids.length === 0) return null; // 任命名单缺失：不猜、不裸发。
    return `流程 ${flowId}：客户已完成任命 ${ids.join("、")}。请写流程单并派发已批准步骤。`;
  }
  return null;
}

/** 成功派发的系统行文案（客户给定首例；其余按同一句式如实说明职能）。 */
export function governanceAdvanceSuccessNote(payload: GovernanceNextStepPayload): string {
  return payload.nextFunction === "nomination"
    ? "已派发提名任务给 Crew / 组队（工作中）"
    : "已派发流程任务给 Steward / 统筹（工作中）";
}

/** accept 两段式第二段的系统行：流程单已落盘、Crew / 组队 已派。 */
export function governanceNominationFollowUpNote(): string {
  return "流程单已落盘，已派发提名任务给 Crew / 组队（工作中）";
}

/**
 * **任命后角色尚未写出**时的补救任务（2026-10-18 真机修正）：账本已有 `appointment` 决定，但目标角色
 * 不在刷新后的 listing（角色卡/边界未写）。此时**不能**派 Convener（它只会反复报「未枚举」）；改派
 * Nominator 用 appointment-write 逐路径写卡，写完后本轮结束；应用随后再检查角色是否出现。
 */
export function buildAppointmentWriteReminderMessage(flowId: string, targetRoleIds: readonly string[]): string {
  const ids = targetRoleIds.filter((id): id is string => nonEmptyString(id));
  return (
    `流程 ${flowId}：客户已完成任命 ${ids.join("、")}，但角色卡/边界尚未写出（项目中尚未枚举到这些角色）。` +
    `请 Crew / 组队 用 appointment-write 确认卡逐路径完成写卡与边界写入；写完后本轮结束，不要自行任命、不要派发。`
  );
}

/** 任命后先派写卡任务的系统行。 */
export function governanceAppointmentWriteNote(): string {
  return "已派发写卡任务给 Crew / 组队（工作中）";
}
