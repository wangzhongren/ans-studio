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
 * 解析流程单的「步骤/状态」表（**触发门**，不是验收判定）：表头须同时含「步骤/step」与「状态/status」；
 * 解析口径与编排 `parseFlowSteps` 对齐；缺表头/无数据行 ⇒ `wellFormed:false`（调用方 fail-closed 不派）。
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
      stepColumn = step;
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
}

/**
 * 「流程全部完成」的**触发门**（2026-10-18 收尾推进）：所有步骤 `done`、每步都有 `dispatch.accepted`、
 * 无未结算决定、尚无验收决定、账本可读。返回 `undefined` = 可以派 Rapporteur 出验收；否则返回人话原因
 * （调用方只记诊断、**不派、不循环**）。本函数**不是**验收判定——验收卡仍由决策开关/判断 agent/客户手批。
 */
export function flowCompletionIssue(
  flowId: string,
  markdown: string,
  ledger: { errors: readonly string[]; entries: readonly FlowCompletionLedgerEntryLike[] },
): string | undefined {
  if (ledger.errors.length > 0) return "治理账本不可读或存在坏行";
  const parsed = parseFlowStepStatuses(markdown);
  if (!parsed.wellFormed || parsed.steps.length === 0) return "流程单缺少可解析的步骤表";
  const notDone = parsed.steps.filter((step) => step.status.toLowerCase() !== "done");
  if (notDone.length > 0) {
    const detail = notDone.slice(0, 10).map((step) => `${step.id}=${step.status || "（空）"}`).join("、");
    return `流程仍有未完成/阻塞/待派发步骤（${detail}）`;
  }
  const dispatched = new Set(
    ledger.entries
      .filter((entry) => entry.kind === "dispatch.accepted" && entry.flowId === flowId && typeof entry.stepId === "string")
      .map((entry) => entry.stepId as string),
  );
  const missingDispatch = parsed.steps.filter((step) => !dispatched.has(step.id));
  if (missingDispatch.length > 0) {
    return `流程步骤缺少 dispatch.accepted 记录（${missingDispatch.slice(0, 10).map((step) => step.id).join("、")}）`;
  }
  const acceptance = ledger.entries.find(
    (entry) => entry.kind === "customer.decision" && entry.flowId === flowId && entry.decisionKind === "acceptance",
  );
  if (acceptance !== undefined) return "该流程已有验收决定";
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
 */
export function buildAcceptanceTaskMessage(flowId: string, evidence: readonly string[]): string {
  const paths = [...new Set(evidence.filter((item): item is string => nonEmptyString(item)))].slice(0, 10);
  const evidenceText = paths.length > 0 ? paths.join("、") : "见回交报告与流程单";
  return (
    `流程 ${flowId} 步骤已全部完成（流程单：${governanceFlowPath(flowId)}；回交/核对报告路径：${evidenceText}）。` +
    `请汇总证据并出验收卡（不要自行验收或代替客户决定）。`
  );
}

/** 收尾推进成功的系统行。 */
export function governanceAcceptanceAdvanceNote(flowId: string): string {
  return `流程 ${flowId} 步骤已全部完成，已派发验收汇总任务给 Rapporteur（工作中）`;
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
 * - `write`/`appointment-write`/`schedule-write` → null（写盘确认不解锁任何下一步）；
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
    case "write":
    case "appointment-write":
    case "schedule-write":
      break; // 流程收口 / 普通写盘：无下一步。
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
      `请先写流程单 ${flowPath}（步骤表；首个步骤为提名：由 Nominator 读取提案并给出候选角色）。` +
      `写完后本轮即可结束；提名任务会在流程单落盘后由应用派给 Nominator。不要把步骤说成已派发。`
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
    ? "已派发提名任务给 Nominator（工作中）"
    : "已派发流程任务给 Convener（工作中）";
}

/** accept 两段式第二段的系统行：流程单已落盘、Nominator 已派。 */
export function governanceNominationFollowUpNote(): string {
  return "流程单已落盘，已派发提名任务给 Nominator（工作中）";
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
    `请用 appointment-write 确认卡逐路径完成写卡与边界写入；写完后本轮结束，不要自行任命、不要派发。`
  );
}

/** 任命后先派写卡任务的系统行。 */
export function governanceAppointmentWriteNote(): string {
  return "已派发写卡任务给 Nominator（工作中）";
}
