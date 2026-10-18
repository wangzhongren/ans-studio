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
 *  - `write`（普通写盘确认）→ 不镜像（角色工作会话的操作确认，不是治理决定）；
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
 * 按「卡片种类 + 客户实际选择」推导下一步（客户已定契约的推导表）：
 * - `proposal` + `accept`       → nomination / nominator；
 * - `proposal` + `accept-quick` → schedule / convener；
 * - `proposal` + `revise|reject`→ null（无下一步，等客户改稿或放弃）；
 * - `appointment`（任命成功）    → schedule / convener；
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
  switch (cardKind) {
    case "proposal": {
      if (selected.includes("accept")) {
        nextFunction = "nomination";
        roleId = "nominator";
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
  if (payload.cardKind === "proposal" && payload.nextFunction === "nomination" && payload.roleId === "nominator") {
    const proposalPath = payload.proposalPath ?? `docs/proposals/${flowId}-v1.md`;
    return (
      `流程 ${flowId}：客户已接受提案 ${proposalPath}。` +
      `请执行提名：读取提案与流程单，给出候选角色与理由，并通过任命卡请客户确认；不要自行任命或写角色卡。`
    );
  }
  if (payload.cardKind === "proposal" && payload.nextFunction === "schedule" && payload.roleId === "convener") {
    return (
      `流程 ${flowId}：客户已接受提案（快捷路径）。` +
      `请写流程单并排步骤；涉及新建/改边界仍须任命卡与写盘确认。`
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
