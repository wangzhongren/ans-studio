// src/common/编排/governance-gate.ts
// 三道治理门禁（三权治理 V1，评审 §6.2）：**应用侧纯判定**，只读账本快照，不读 Markdown `status`。
//
// 三道门（逐条对应评审 §6.2）：
//   1. 提案接受门：`write-flow` / `write-nomination` —— 该 flow 的最新提案类决定必须是
//      `proposal-accept` / `proposal-accept-quick`；否则拒，文案指回「先在 Rapporteur 会话完成提案接受」。
//   2. 任命写入门：`write-role-card` —— 该 flow 的最新任命决定（`decisionKind="appointment"`）的
//      `targetRoleIds` 必须含目标角色；否则拒（「请先取得客户任命」）。
//   3. 派发范围门：`dispatch` —— 目标不是内置治理角色、提案已接受、目标在任命名单内**或**快捷路径
//      复用既有项目角色、`flowId`/`stepId` 必填且流程文件存在对应步骤、同一 `flowId+stepId` 未派发过。
//   4. 协调消息门：`coordinate`（2026-10-20 客户拍板「把主理 Lead 设为工作流管理者，可和所有职能角色
//      沟通」）——仅 Liaison（Lead）→ Convener（Steward）；`flowId` 必填、`stepId` 可选；
//      **不是**项目步骤派发，不要求提案接受/任命名单/流程步骤存在/未派发去重。
//      `dispatch`（Convener → 项目角色）逐字不变。
//
// **fail-closed**（评审 §6.2/§九-16）：
//   · 账本快照 `errors` 非空 → 拒一切门禁动作，文案提示检查 `.ans/governance/ledger.jsonl`；
//   · 流程文件不存在/不可读/步骤缺失 → 拒投（不猜）；
//   · 只服务 trio；`model !== "trio"` 时不分流三权门禁（旧 single 行为逐字不变）。
//
// 边界：本模块**纯判定**——不写盘、不追加账本、不改变任何客户决定。流程状态只用于「步骤是否存在」
// （评审 §6.2 派发第 4 条），**不解析其 status**；2026-10-19 起 `docs/flows/<flowId>.yaml` 是唯一机器
// 状态（YAML 存在即只认 YAML，校验失败 fail-closed；仅在 YAML 缺失时回落旧版 `.md`）；`status: accepted`
// 写在 Markdown 里不改变任何判定。

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { GovernanceModel } from "../../model/role.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";
import { isBuiltInGovernanceRoleId } from "../../service/boundary/resolve-boundary.ts";
import { parseFlowStateYaml } from "./flow-state.ts";
import type {
  GovernanceDecisionKind,
  GovernanceLedgerEntry,
  GovernanceLedgerSnapshot,
} from "./governance-ledger.ts";

/** 门禁动作（评审 §6.2 + 2026-10-20 `coordinate`）。 */
export type GovernanceGateAction = "write-flow" | "write-nomination" | "write-role-card" | "dispatch" | "coordinate";

/** 门禁输入（评审 §6.2 逐字形状）。 */
export interface GovernanceGateInput {
  projectRoot: string;
  model: GovernanceModel;
  roleId: string;
  action: GovernanceGateAction;
  flowId?: string;
  stepId?: string;
  targetRoleId?: string;
  targetRoleIds?: string[];
  path?: string; // 项目相对路径（write-* 用）
}

/** 门禁判定（评审 §6.2 逐字形状）。 */
export type GovernanceGateDecision =
  | { allowed: true }
  | { allowed: false; code: string; message: string };

/**
 * 治理 slug 形状（**单一来源**：运行时核心 `src/model/runtime.ts` 的 `GOVERNANCE_SLUG_PATTERN`；
 * 2026-10-22 收紧为禁止首/尾连字符）。此处只编译本地判定用 RegExp，不保留同值副本。
 */
const SLUG_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);

/**
 * 提案类决定集合（顺序即「最新决定」的候选集合；普通写盘确认没有 decisionKind，不参与）。
 * **不含 `unclassified`**（2026-10-18 真机）：旧账本里无 cardKind 的普通选择曾写入 unclassified，
 * 若参与「最新决定」会覆盖真正的 proposal-accept；提案接受只看 proposal-* 四类。
 */
const PROPOSAL_DECISION_KINDS: ReadonlySet<GovernanceDecisionKind> = new Set([
  "proposal-accept",
  "proposal-accept-quick",
  "proposal-revise",
  "proposal-reject",
]);

/** 允许解锁写门禁的提案决定。 */
const ACCEPTED_DECISION_KINDS: ReadonlySet<GovernanceDecisionKind> = new Set([
  "proposal-accept",
  "proposal-accept-quick",
]);

/** 每个动作只允许的治理来源角色（防御性再校验；写入权限本身已由注册表边界收窄）。 */
const ACTION_ROLE: Record<GovernanceGateAction, string> = {
  "write-flow": "convener",
  "write-nomination": "nominator",
  "write-role-card": "nominator",
  dispatch: "convener",
  // coordinate 在 switch 内由 `evaluateCoordinateGate` 自己判角色/目标（错误码要 `forbidden`，
  // 不是通用 `wrong-role`）；此值只用于满足 Record 形状。
  coordinate: "liaison",
};

/**
 * 三道门禁判定入口（评审 §6.2；**同步**，只读快照）。
 * `model !== "trio"` → `{allowed:true}`（旧 single 模型不分流三权门禁；行为逐字不变）。
 */
export function evaluateGovernanceGate(
  input: GovernanceGateInput,
  snapshot: GovernanceLedgerSnapshot,
): GovernanceGateDecision {
  if (input.model !== "trio") return { allowed: true };

  if (snapshot.errors.length > 0) {
    return deny(
      "ledger-corrupt",
      `治理账本不可用（${snapshot.errors[0]}）；为安全起见拒绝本次操作。请检查 .ans/governance/ledger.jsonl 后重试。`,
    );
  }

  const expectedRole = ACTION_ROLE[input.action];
  // coordinate 由自己的门判定来源/目标（要求 `forbidden` 而非通用 `wrong-role`）。
  if (input.action !== "coordinate" && input.roleId !== expectedRole) {
    return deny(
      "wrong-role",
      `治理门禁：动作 ${input.action} 只能由 ${expectedRole} 发起（当前角色 ${input.roleId}）。`,
    );
  }

  switch (input.action) {
    case "write-flow":
    case "write-nomination":
      return evaluateProposalGate(input, snapshot);
    case "write-role-card":
      return evaluateRoleCardGate(input, snapshot);
    case "dispatch":
      return evaluateDispatchGate(input, snapshot);
    case "coordinate":
      return evaluateCoordinateGate(input);
  }
}

/**
 * 协调消息门（2026-10-20 客户拍板）：Lead（Liaison）可以给 Steward（Convener）发协调消息。
 *
 * **不是项目步骤派发**：不要求提案已接受、目标在任命名单、流程步骤存在、`flowId+stepId` 未派发；
 * 只校验来源/目标/flowId（stepId 可选，给出时必须是 slug）。`dispatch` 门逐字不变。
 */
export function evaluateCoordinateGate(input: GovernanceGateInput): GovernanceGateDecision {
  if (input.roleId !== "liaison") {
    return deny("forbidden", "治理门禁：协调消息（coordinate）只能由主理 Lead 发起。");
  }
  if (input.targetRoleId !== "convener") {
    return deny("forbidden", "治理门禁：Lead 的协调消息目标只能是 Steward/Convener。");
  }
  if (!isSlug(input.flowId)) {
    return deny("missing-flow-id", `治理门禁：协调消息必须带合法 flowId（\`${GOVERNANCE_SLUG_PATTERN}\`）。`);
  }
  if (input.stepId !== undefined && !isSlug(input.stepId)) {
    return deny("missing-step-id", `治理门禁：协调消息给出 stepId 时必须是合法 slug（\`${GOVERNANCE_SLUG_PATTERN}\`）。`);
  }
  return { allowed: true };
}

/**
 * 从流程单文本解析步骤 id（派发门禁第 4 条的唯一判定口径；**不看 status**）。
 *
 * 约定形状（V1 最小面）：
 *   · Markdown 表格行：**第一格**为步骤 id（可带反引号），如 `| 实现 | 实现者 | pending |`；
 *   · 列表行：`- 实现 …` / `* 实现：…` / `- [ ] 实现` —— 第一个词为步骤 id；
 *   · 步骤 id 必须匹配 Model 常量 `GOVERNANCE_SLUG_PATTERN`（2–64 位、首尾字母/数字、禁止首/尾连字符）；
 *     表头/分隔行/其他文本不参与。
 * 解析是**保守**的：只有上面两种结构行的首格/首词被采信；正文里出现同名 token 不算步骤。
 */
export function parseFlowStepIds(text: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string): void => {
    const value = raw
      .trim()
      .replace(/^`+/, "")
      .replace(/`+$/, "")
      .replace(/^\*+|\*+$/g, "")
      .replace(/[：:，,。；;]+$/, "")
      .trim();
    if (!SLUG_RE.test(value) || seen.has(value)) return;
    seen.add(value);
    ids.push(value);
  };

  for (const line of text.split(/\r?\n/)) {
    const table = /^\s*\|(.+)\|\s*$/.exec(line);
    if (table !== null) {
      const cells = table[1].split("|").map((cell) => cell.trim());
      if (cells.length === 0) continue;
      // 分隔行（--- / :---:）与表头（首格不是 slug）自然被 add 的 slug 校验挡掉。
      if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
      add(cells[0]);
      continue;
    }
    const list = /^\s*[-*+]\s+(?:\[[ xX]\]\s*)?(.+)$/.exec(line);
    if (list !== null) {
      const first = list[1].split(/[\s：:，,。；;]+/)[0] ?? "";
      add(first);
    }
  }
  return ids;
}

// —————————————————————— 各门 ——————————————————————

/** 提案接受门：最新提案类决定必须为 accept / accept-quick。 */
function evaluateProposalGate(
  input: GovernanceGateInput,
  snapshot: GovernanceLedgerSnapshot,
): GovernanceGateDecision {
  if (!isSlug(input.flowId)) {
    return deny("missing-flow-id", `治理门禁：写流程/提名必须带合法 flowId（\`${GOVERNANCE_SLUG_PATTERN}\`）。`);
  }
  const latest = latestDecision(snapshot, input.flowId, (entry) =>
    PROPOSAL_DECISION_KINDS.has(entry.decisionKind as GovernanceDecisionKind),
  );
  if (latest === undefined) {
    return deny(
      "proposal-not-accepted",
      `治理门禁：流程 ${input.flowId} 尚无客户提案决定；请先在 Rapporteur 会话完成提案接受（客户决定卡）。`,
    );
  }
  if (!ACCEPTED_DECISION_KINDS.has(latest.decisionKind as GovernanceDecisionKind)) {
    return deny(
      "proposal-not-accepted",
      `治理门禁：流程 ${input.flowId} 的最新提案决定是 ${latest.decisionKind}，不是接受；` +
        "请先在 Rapporteur 会话取得客户接受（accept / accept-quick）。",
    );
  }
  return { allowed: true };
}

/** 任命写入门：最新任命决定须含目标角色；`flowId` 缺省时在全部 flow 的任命决定中查找。 */
function evaluateRoleCardGate(
  input: GovernanceGateInput,
  snapshot: GovernanceLedgerSnapshot,
): GovernanceGateDecision {
  const target = input.targetRoleId;
  if (typeof target !== "string" || target.trim() === "") {
    return deny("missing-target-role", "治理门禁：写角色卡必须能判定目标角色 id（路径须为 角色卡/<id>/**）。");
  }
  const appointment = latestAppointment(snapshot, input.flowId, target);
  if (appointment === undefined) {
    return deny(
      "appointment-required",
      `治理门禁：角色 ${target} 尚未取得客户任命${input.flowId ? `（流程 ${input.flowId}）` : ""}；` +
        "请先由 Nominator 发起任命卡并把该角色列入客户选择。",
    );
  }
  return { allowed: true };
}

/** 派发范围门（评审 §6.2 五条，逐条 fail-closed）。 */
function evaluateDispatchGate(
  input: GovernanceGateInput,
  snapshot: GovernanceLedgerSnapshot,
): GovernanceGateDecision {
  // 0) flowId/stepId 必填（规则 4 的前置；缺失无法判定接受范围与去重）。
  if (!isSlug(input.flowId)) {
    return deny("missing-flow-id", `治理门禁：Convener 派发必须带合法 flowId（\`${GOVERNANCE_SLUG_PATTERN}\`）。`);
  }
  if (!isSlug(input.stepId)) {
    return deny("missing-step-id", `治理门禁：Convener 派发必须带合法 stepId（\`${GOVERNANCE_SLUG_PATTERN}\`）。`);
  }

  // 1) 目标不是内置治理角色（三人与 su 一律拒绝）。
  const target = input.targetRoleId;
  if (typeof target !== "string" || target.trim() === "") {
    return deny("missing-target-role", "治理门禁：派发缺少目标角色 id。");
  }
  if (isBuiltInGovernanceRoleId(target)) {
    return deny(
      "builtin-target",
      `治理门禁：派发目标 ${target} 是内置治理角色；三人（含 su）不可被派发，治理角色之间不 dispatch。`,
    );
  }

  // 2) 该 flow 的提案已被客户接受。
  const proposal = evaluateProposalGate(input, snapshot);
  if (!proposal.allowed) return proposal;

  // 3) 目标在任命名单内，**或**快捷路径（accept-quick）且目标是既有项目角色。
  const appointment = latestAppointment(snapshot, input.flowId, target);
  if (appointment === undefined) {
    const latest = latestDecision(snapshot, input.flowId, (entry) =>
      PROPOSAL_DECISION_KINDS.has(entry.decisionKind as GovernanceDecisionKind),
    );
    const quick = latest?.decisionKind === "proposal-accept-quick";
    if (!quick) {
      return deny(
        "appointment-required",
        `治理门禁：目标 ${target} 不在流程 ${input.flowId} 的客户任命名单内；` +
          "请先由 Nominator 取得任命（或由客户选择 accept-quick 复用既有角色）。",
      );
    }
    if (!isExistingProjectRole(input.projectRoot, target)) {
      return deny(
        "quick-target-not-project-role",
        `治理门禁：快捷路径只能复用既有项目角色；目标 ${target} 没有角色目录（角色卡/${target}/）。` +
          "新建角色仍须任命卡 + 写盘确认卡。",
      );
    }
  }

  // 4) 流程文件中存在对应步骤（只判存在，不读 status）。
  if (!flowStepExists(input.projectRoot, input.flowId, input.stepId)) {
    return deny(
      "flow-step-missing",
      `治理门禁：流程 docs/flows/${input.flowId}.yaml（或旧版 .md）中没有步骤 ${input.stepId}；` +
        "请先在 Convener 会话按已接受提案写出流程步骤。",
    );
  }

  // 5) 同一 flowId+stepId 未被派发过。
  const dispatched = snapshot.entries.some(
    (entry) =>
      entry.kind === "dispatch.accepted" &&
      entry.flowId === input.flowId &&
      entry.stepId === input.stepId,
  );
  if (dispatched) {
    return deny(
      "duplicate-dispatch",
      `治理门禁：流程 ${input.flowId} 的步骤 ${input.stepId} 已派发过；重复派发被去重。` +
        "如需再派，请让流程单出新版本并更新步骤 id。",
    );
  }

  return { allowed: true };
}

// —————————————————————— 辅助 ——————————————————————

function deny(code: string, message: string): GovernanceGateDecision {
  return { allowed: false, code, message };
}

function isSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_RE.test(value);
}

/** 该 flow 的最新一条满足谓词的 `customer.decision`（append 顺序 = 时间顺序）。 */
function latestDecision(
  snapshot: GovernanceLedgerSnapshot,
  flowId: string,
  predicate: (entry: GovernanceLedgerEntry) => boolean,
): GovernanceLedgerEntry | undefined {
  for (let i = snapshot.entries.length - 1; i >= 0; i--) {
    const entry = snapshot.entries[i];
    if (entry.kind !== "customer.decision") continue;
    if (entry.flowId !== flowId) continue;
    if (!predicate(entry)) continue;
    return entry;
  }
  return undefined;
}

/**
 * 最新任命决定：给了 flowId → 只在该 flow 找；缺省（写角色卡时路径无 flow 上下文）→ 在全部 flow
 * 的最新任命决定中找。目标必须在 `targetRoleIds` 内。
 */
function latestAppointment(
  snapshot: GovernanceLedgerSnapshot,
  flowId: string | undefined,
  targetRoleId: string,
): GovernanceLedgerEntry | undefined {
  if (flowId !== undefined) {
    const entry = latestDecision(
      snapshot,
      flowId,
      (candidate) => candidate.decisionKind === "appointment",
    );
    return entry !== undefined && (entry.targetRoleIds ?? []).includes(targetRoleId) ? entry : undefined;
  }
  const flowIds = new Set(
    snapshot.entries
      .filter((entry) => entry.kind === "customer.decision" && typeof entry.flowId === "string")
      .map((entry) => entry.flowId as string),
  );
  for (const id of flowIds) {
    const entry = latestDecision(snapshot, id, (candidate) => candidate.decisionKind === "appointment");
    if (entry !== undefined && (entry.targetRoleIds ?? []).includes(targetRoleId)) return entry;
  }
  return undefined;
}

/** 既有项目角色：存在 `角色卡/<id>/role-card.md`（或 boundary.yaml/.yml/.md）。不读 Markdown status。 */
function isExistingProjectRole(projectRoot: string, roleId: string): boolean {
  const dir = path.join(projectRoot, "角色卡", roleId);
  return ["role-card.md", "boundary.yaml", "boundary.yml", "boundary.md"].some((name) =>
    existsSync(path.join(dir, name)),
  );
}

/**
 * 流程步骤存在性（派发门禁第 4 条；**只看步骤是否存在，不读 status**）。
 *
 * 2026-10-19 Flow YAML 契约（客户「这些全部改成yaml」）：`docs/flows/<flowId>.yaml` 是**唯一机器状态**。
 *   · YAML 存在 ⇒ 只认 YAML；YAML 校验失败 ⇒ false（fail-closed，**不回落 Markdown**，避免坏 YAML
 *     被旧人读视图掩盖）；
 *   · YAML 不存在 ⇒ 回落旧版 `docs/flows/<flowId>.md`（迁移兼容；新流程应写 YAML）。
 */
function flowStepExists(projectRoot: string, flowId: string, stepId: string): boolean {
  const yamlAbs = path.join(projectRoot, "docs", "flows", `${flowId}.yaml`);
  let yamlText: string | undefined;
  try {
    yamlText = readFileSync(yamlAbs, "utf8");
  } catch (err) {
    // 只有「不存在」才允许回落旧 .md；存在但不可读（权限/IO）⇒ fail-closed，不猜。
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") return false;
    yamlText = undefined;
  }
  if (yamlText !== undefined) {
    const parsed = parseFlowStateYaml(yamlText, flowId);
    return parsed.ok && parsed.flow.steps.some((step) => step.id === stepId);
  }

  // 旧版人读视图（仅迁移期兼容；应用不再把它作为新流程的判定来源）。
  const abs = path.join(projectRoot, "docs", "flows", `${flowId}.md`);
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return false;
  }
  return parseFlowStepIds(text).includes(stepId);
}
