// src/common/编排/governance-gate.ts
// 三道治理门禁（三权治理 V1，评审 §6.2）：**应用侧纯判定**，只读账本快照，不读 Markdown `status`。
//
// 三道门（逐条对应评审 §6.2）：
//   1. 提案接受门：`write-flow` / `write-team-plan` / legacy `write-nomination` —— 该 flow 的最新提案类
//      决定必须是 `proposal-accept` / `proposal-accept-quick`；否则拒，文案指回「先在 Rapporteur 会话
//      完成提案接受」。2026-10-22 治理分工第 1 项：团队计划（`docs/scheduling/<flowId>-team-vN.md`）
//      由 Convener 写，走 `write-team-plan`；旧 `write-nomination`（Nominator）保留为 legacy。
//   2. 任命写入门：`write-role-card` —— 该 flow 的最新任命决定（`decisionKind="appointment"`）的
//      `targetRoleIds` 必须含目标角色；否则拒（「请先取得客户任命」）。
//   3. 派发范围门：`dispatch` —— 目标不是内置治理角色、提案已接受、目标在任命名单内**或**快捷路径
//      复用既有项目角色、`flowId`/`stepId` 必填且流程文件存在对应步骤、同一 `flowId+stepId` 未派发过。
//      2026-10-22 验收第 3 项（O2，客户按推荐项）：派发项目角色前的验收标准门槛；2026-10-24
//      客户修订（撤销「仅发布版本」口径，独立验收范围＝**所有变更**）：所有**声明了
//      `acceptance-criteria` 步骤的新契约 flow YAML**（含非发布；`release` 只是可选发布元数据，
//      不是启动条件）在实施派发前都要求 `docs/acceptance/<flowId>-criteria-vN.md` 的**最新版本**
//      （扫描取最高 N）存在且结构校验合格；legacy（无 YAML 或无 `acceptance-criteria` 步骤）没有可
//      定位标准的机器状态，保留原放行；`proposal-accept-quick`（快捷复用既有角色）仍显式豁免
//      （见 `evaluateDispatchGate`）。
//      2026-10-24（P0-3/P1-4，设计 v1 §6.4 执行门）：`dependsOn` 解析 `supersededBy` 链（前置 superseded
//      ⇒ 解析到最终非 superseded 步骤并判 done；缺失/未知/成环明确拒绝，不按「未 done」混同）；
//      结构化步骤的 `owner` 必须等于派发目标（旧版 `.md`/无 owner 不新增检查；coordinate/app-only 例外）。
//   4. 协调消息门：`coordinate`（2026-10-20 客户拍板「把主理 Lead 设为工作流管理者，可和所有职能角色
//      沟通」）——仅 Liaison（Lead）→ Convener（Steward）；`flowId` 必填、`stepId` 可选；
//      **不是**项目步骤派发，不要求任命名单/流程步骤存在/未派发去重。
//      2026-10-24（设计 v1 §6.4 闸门 1）：最新提案决定必须是 `proposal-accept`/`proposal-accept-quick`，
//      否则拒（协调不能先于客户接受提案）；`dispatch`（Convener → 项目角色）其余语义不变。
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

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { GovernanceModel } from "../../model/role.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";
import { isBuiltInGovernanceRoleId } from "../../service/boundary/resolve-boundary.ts";
import { parseFlowStateYaml, type FlowState, type FlowStateStep } from "./flow-state.ts";
import type {
  GovernanceDecisionKind,
  GovernanceLedgerEntry,
  GovernanceLedgerSnapshot,
} from "./governance-ledger.ts";

/** 门禁动作（评审 §6.2 + 2026-10-20 `coordinate` + 2026-10-22 `write-team-plan`）。 */
export type GovernanceGateAction =
  | "write-flow"
  | "write-team-plan"
  | "write-nomination"
  | "write-role-card"
  | "dispatch"
  | "coordinate";

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
  // 2026-10-22 治理分工第 1 项：团队计划由 Convener（Steward/统筹）唯一撰写。
  "write-team-plan": "convener",
  // legacy：旧提名文件（`docs/nominations/**`）仍由 Crew（Nominator）写，迁移期兼容。
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
    case "write-team-plan":
    case "write-nomination":
      return evaluateProposalGate(input, snapshot);
    case "write-role-card":
      return evaluateRoleCardGate(input, snapshot);
    case "dispatch":
      return evaluateDispatchGate(input, snapshot);
    case "coordinate":
      return evaluateCoordinateGate(input, snapshot);
  }
}

/**
 * 协调消息门（2026-10-20 客户拍板）：Lead（Liaison）可以给 Steward（Convener）发协调消息。
 *
 * **不是项目步骤派发**：不要求目标在任命名单、流程步骤存在、`flowId+stepId` 未派发；
 * 只校验来源/目标/flowId（stepId 可选，给出时必须是 slug），以及**闸门 1**
 * （2026-10-24 设计 v1 §6.4）：该 flow 的最新提案决定必须是 `proposal-accept`/`proposal-accept-quick`
 * ——协调不能先于客户接受提案。`evaluateDispatchGate` 的其它语义不受影响。
 */
export function evaluateCoordinateGate(
  input: GovernanceGateInput,
  snapshot: GovernanceLedgerSnapshot,
): GovernanceGateDecision {
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
  // 闸门 1（2026-10-24 收紧）：最新提案决定必须是接受/快捷接受；不要求步骤/任命/未派发。
  return evaluateProposalGate(input, snapshot);
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

// —————————————————————— 验收标准前置门槛（O2，2026-10-22） ——————————————————————

/** 验收标准的约定路径（`docs/acceptance/<flowId>-criteria-vN.md`；`version` 缺省 1，兼容历史调用）。 */
export function acceptanceCriteriaRelPath(flowId: string, version = 1): string {
  return `docs/acceptance/${flowId}-criteria-v${version}.md`;
}

/**
 * 最新验收标准（2026-10-24 修订：适用于所有声明 `acceptance-criteria` 步骤的新契约 flow）：
 * 扫描 `docs/acceptance/` 下 `<flowId>-criteria-vN.md`，取 N 最高的文件；目录不可读/无匹配
 * ⇒ `undefined`（调用方按缺失处理）。只认后缀为正整数（>=1）的 `.md`；v2 存在时不再回退 v1
 * （v2 不合格即拒绝）。
 */
export function latestAcceptanceCriteriaRelPath(projectRoot: string, flowId: string): string | undefined {
  const dir = path.join(projectRoot, "docs", "acceptance");
  const prefix = `${flowId}-criteria-v`;
  const suffix = ".md";
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return undefined;
  }
  let latest: { version: number; name: string } | undefined;
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue;
    const versionText = name.slice(prefix.length, name.length - suffix.length);
    if (!/^\d+$/.test(versionText)) continue;
    const version = Number(versionText);
    if (!Number.isSafeInteger(version) || version < 1) continue;
    if (latest === undefined || version > latest.version) latest = { version, name };
  }
  return latest === undefined ? undefined : `docs/acceptance/${latest.name}`;
}

export interface AcceptanceCriteriaCheck {
  ok: boolean;
  issues: string[];
}

/**
 * 验收标准**结构门槛**（确定性；只看文本，不调模型）：
 *   · flowId 可核对：frontmatter 给出 `flowId` 时必须与 flow 一致；正文必须出现该 flowId；
 *   · 验收表：表头含 `ID` 列且有分隔行；
 *   · 风险档位：提到「风险档位/riskTier」且出现 T0–T3 之一；
 *   · 判定规则：同时出现 pass / fail / insufficient evidence（大小写不敏感）；
 *   · 证据计划：出现「证据计划」或「需要的证据」；
 *   · 版本/冻结：出现「版本」或「冻结」。
 * 任一不满足 ⇒ 不合格（派发门禁拒，文案列出原因；不把「待补」当通过）。
 */
export function validateAcceptanceCriteriaText(text: string, flowId: string): AcceptanceCriteriaCheck {
  const issues: string[] = [];
  if (typeof text !== "string" || text.trim() === "") {
    return { ok: false, issues: ["标准文件为空"] };
  }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (frontmatter !== null) {
    const match = /^\s*flowId\s*:\s*(.+?)\s*$/m.exec(frontmatter[1]!);
    if (match !== null) {
      const value = match[1]!.trim().replace(/^["'`]|["'`]$/g, "");
      if (value !== flowId) issues.push(`frontmatter flowId="${value}" 与流程 ${flowId} 不一致`);
    }
  }
  if (!text.includes(flowId)) issues.push(`正文未出现 flowId「${flowId}」`);
  if (!/\|\s*ID\s*\|/i.test(text) || !/^\s*\|?\s*:?-{2,}/m.test(text)) {
    issues.push("缺少验收表（表头含 ID 列 + 分隔行）");
  }
  if (!/(风险档位|riskTier)/i.test(text) || !/\bT[0-3]\b/.test(text)) {
    issues.push("缺少风险档位（T0–T3）");
  }
  if (!/insufficient\s+evidence/i.test(text) || !/\bpass\b/i.test(text) || !/\bfail\b/i.test(text)) {
    issues.push("缺少判定规则（pass / fail / insufficient evidence）");
  }
  if (!/(证据计划|需要的证据)/.test(text)) issues.push("缺少证据计划");
  if (!/(版本|冻结)/.test(text)) issues.push("缺少版本/冻结规则");
  return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues };
}

/** 新契约流程声明「实施前标准」的步骤 id（2026-10-24 客户修订：所有变更独立验收）。 */
const ACCEPTANCE_CRITERIA_STEP_ID = "acceptance-criteria";

/**
 * 实施派发前的验收标准门槛（O2；2026-10-24 客户修订：**所有变更**，不再只对发布版本）：
 *   · **适用范围**：flow YAML（新契约流程）声明了 `acceptance-criteria` 步骤 ⇒ 实施派发前必须已有
 *     `docs/acceptance/<flowId>-criteria-vN.md` 的**最新版本**（扫描取最高 N）且结构合格；
 *     **不要求 `release: true`**——`release` 仅可选发布元数据，不是启动条件；
 *   · legacy（无 YAML、或 YAML 未声明 `acceptance-criteria` 步骤的旧流程）没有可定位标准的机器状态，
 *     保留原放行（不给旧流程新增不可满足的硬门）；
 *   · 最新提案决定是 `proposal-accept-quick`（快捷复用既有角色）时显式豁免（既有语义）；
 *   · 缺失/不可读 ⇒ `acceptance-criteria-missing`；结构不合格 ⇒ `acceptance-criteria-invalid`
 *     （存在 v2 时校验 v2，不回退 v1）。
 * 该门槛不改变派发权归属，只增加「实施前先有标准」的机械前置。
 */
function evaluateAcceptanceCriteriaGate(
  input: GovernanceGateInput,
  snapshot: GovernanceLedgerSnapshot,
  flow: FlowState | undefined,
): GovernanceGateDecision {
  const flowId = input.flowId as string;
  // legacy/旧流程：无 YAML 可解析（坏 YAML 由后续步骤检查 fail-closed），或 YAML 未声明
  // `acceptance-criteria` 步骤 —— 没有机器状态可定位「实施前标准」要求，保留原放行，不新增硬门。
  if (flow === undefined || !flow.steps.some((step) => step.id === ACCEPTANCE_CRITERIA_STEP_ID)) {
    return { allowed: true };
  }
  const latestProposal = latestDecision(snapshot, flowId, (entry) =>
    PROPOSAL_DECISION_KINDS.has(entry.decisionKind as GovernanceDecisionKind),
  );
  if (latestProposal?.decisionKind === "proposal-accept-quick") return { allowed: true };

  const rel = latestAcceptanceCriteriaRelPath(input.projectRoot, flowId);
  if (rel === undefined) {
    return deny(
      "acceptance-criteria-missing",
      `治理门禁：流程 ${flowId} 声明了 acceptance-criteria 步骤，但 docs/acceptance/${flowId}-criteria-vN.md ` +
        "不存在或不可读；所有变更（含非发布）在实施派发前都必须先写出最新版本的结构合格标准" +
        "（含验收表、风险档位、判定规则、证据计划）。",
    );
  }
  let text: string;
  try {
    text = readFileSync(path.join(input.projectRoot, ...rel.split("/")), "utf8");
  } catch {
    return deny(
      "acceptance-criteria-missing",
      `治理门禁：流程 ${flowId} 声明了 acceptance-criteria 步骤，但实施前验收标准 ${rel} 不存在或不可读；` +
        "所有变更（含非发布）在实施派发前都必须先写出最新版本的结构合格标准" +
        "（含验收表、风险档位、判定规则、证据计划）。",
    );
  }
  const check = validateAcceptanceCriteriaText(text, flowId);
  if (!check.ok) {
    return deny(
      "acceptance-criteria-invalid",
      `治理门禁：实施前验收标准 ${rel} 结构不合格（${check.issues.join("；")}）；` +
        "流程声明了 acceptance-criteria 步骤（所有变更，含非发布），实施派发前必须补合格；" +
        "请补齐后重新派发（不把「标准待补」当通过；读取最新版本，不回退旧版本）。",
    );
  }
  return { allowed: true };
}

// —————————————————————— 各门 ——————————————————————

/** 提案接受门：最新提案类决定必须为 accept / accept-quick。 */
function evaluateProposalGate(
  input: GovernanceGateInput,
  snapshot: GovernanceLedgerSnapshot,
): GovernanceGateDecision {
  if (!isSlug(input.flowId)) {
    return deny("missing-flow-id", `治理门禁：写流程/团队计划必须带合法 flowId（\`${GOVERNANCE_SLUG_PATTERN}\`）。`);
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
        "请先由 Convener（Steward/统筹）依团队计划发起任命卡并把该角色列入客户选择。",
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
          "请先由 Convener（Steward/统筹）依团队计划取得客户任命（或由客户选择 accept-quick 复用既有角色）。",
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

  // 4) 流程文件步骤查询（只判存在，不读 status）：YAML 时同时得到结构化步骤，
  //    供验收标准门槛判定是否为新契约流程（声明了 `acceptance-criteria` 步骤）。
  const lookup = lookupFlowStep(input.projectRoot, input.flowId, input.stepId);

  // 4a) 实施前验收标准门槛（O2，2026-10-22；2026-10-24 客户修订：**所有变更**——所有声明了
  //     `acceptance-criteria` 步骤的新契约 flow YAML（含非发布）都要求
  //     `docs/acceptance/<flowId>-criteria-vN.md` 最新版本结构合格；`release` 不是前提；
  //     legacy（无 YAML/无该步骤）与 accept-quick 豁免）。
  const criteria = evaluateAcceptanceCriteriaGate(input, snapshot, lookup.flow);
  if (!criteria.allowed) return criteria;

  // 4b) 流程文件中必须存在对应步骤。
  if (!lookup.found) {
    return deny(
      "flow-step-missing",
      `治理门禁：流程 docs/flows/${input.flowId}.yaml（或旧版 .md）中没有步骤 ${input.stepId}；` +
        "请先在 Convener 会话按已接受提案写出流程步骤。",
    );
  }

  // 5) owner 校验（2026-10-24 P1-4，设计 v1 §6.4 执行门）：结构化步骤的 `owner` 必须等于派发目标。
  //     旧版 `.md`（无结构化步骤）与 owner 缺省的 legacy 流程不新增检查；coordinate/app-only 派发
  //     不经过本门（coordinate 走 `evaluateCoordinateGate`，app-only 由应用直接执行）。
  const stepOwner = lookup.step?.owner;
  if (typeof stepOwner === "string" && stepOwner.trim() !== "" && stepOwner !== target) {
    return deny(
      "owner-mismatch",
      `治理门禁：步骤 ${input.stepId} 的 owner 是 ${stepOwner}，与派发目标 ${target} 不一致；` +
        "请把该步骤派给 owner（流程按 owner 对账，错派会让流程与执行者不一致）。",
    );
  }

  // 6) 前置依赖（2026-10-22 MapReduce 方案 A；2026-10-24 P0-3 解析 supersededBy 链）：
  //     步骤声明 dependsOn 时，前置必须 done；前置已被 superseded ⇒ 沿 supersededBy 解析到最终
  //     非 superseded 步骤再判 done。缺失/未知引用/替代链成环 ⇒ `dependencies-unresolved`
  //     （明确拒绝，不按「未 done」混同）。不改变派发权归属；旧步骤无 dependsOn ⇒ 不新增检查。
  const dependsOn = lookup.step?.dependsOn ?? [];
  if (dependsOn.length > 0 && lookup.flow !== undefined) {
    const notDone: string[] = [];
    const unresolved: string[] = [];
    for (const depId of dependsOn) {
      const resolution = resolveDependencyStep(lookup.flow, depId);
      if (!resolution.ok) {
        unresolved.push(`${depId}：${resolution.reason}`);
        continue;
      }
      if (resolution.step.status !== "done") {
        notDone.push(
          resolution.step.id === depId
            ? `${depId}（${resolution.step.status}）`
            : `${depId}→${resolution.step.id}（${resolution.step.status}）`,
        );
      }
    }
    if (unresolved.length > 0) {
      return deny(
        "dependencies-unresolved",
        `治理门禁：步骤 ${input.stepId} 的前置依赖无法解析（${unresolved.join("、")}）；` +
          "缺失步骤、supersededBy 指向未知步骤或替代链成环一律拒绝；请先修复流程步骤/替代关系后派发。",
      );
    }
    if (notDone.length > 0) {
      return deny(
        "dependencies-not-done",
        `治理门禁：步骤 ${input.stepId} 的前置依赖尚未全部 done（${notDone.join("、")}）；` +
          "请先完成前置步骤，再派发本步骤（不改变派发权，只增加前置条件）。",
      );
    }
  }

  // 7) 同一 flowId+stepId 未被派发过。
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

/**
 * `dependsOn` 前置解析（2026-10-24 P0-3）：前置步骤若已 `superseded`，沿 `supersededBy` 链解析到
 * **最终非 superseded 步骤**再判 `done`（返工替代后下游不应被旧引用硬拦）。
 *
 * fail-closed（返回 `ok:false`，调用方用 `dependencies-unresolved` 明确拒绝，不按「未 done」混同）：
 *   · 前置 id 不存在；
 *   · superseded 步骤缺少 `supersededBy`，或 `supersededBy` 指向未知步骤；
 *   · `supersededBy` 链成环（防御性；flow-state 解析已拒绝 YAML 内的替代环）。
 */
function resolveDependencyStep(
  flow: FlowState,
  depId: string,
): { ok: true; step: FlowStateStep } | { ok: false; reason: string } {
  const byId = new Map<string, FlowStateStep>();
  for (const step of flow.steps) {
    if (!byId.has(step.id)) byId.set(step.id, step);
  }
  const visited: string[] = [];
  const seen = new Set<string>();
  let currentId = depId;
  for (;;) {
    if (seen.has(currentId)) {
      return { ok: false, reason: `supersededBy 链成环：${[...visited, currentId].join(" → ")}` };
    }
    seen.add(currentId);
    visited.push(currentId);
    const step = byId.get(currentId);
    if (step === undefined) {
      return {
        ok: false,
        reason:
          currentId === depId
            ? `步骤 "${depId}" 不存在`
            : `supersededBy 指向不存在的步骤 "${currentId}"`,
      };
    }
    if (step.status !== "superseded") return { ok: true, step };
    if (step.supersededBy === undefined || step.supersededBy.trim() === "") {
      return { ok: false, reason: `步骤 "${currentId}" 已 superseded 但缺少 supersededBy` };
    }
    currentId = step.supersededBy;
  }
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
 * 流程步骤查询（派发门禁第 4/5 条）：返回步骤是否存在及（YAML 时的）结构化步骤/flow。
 *
 * 2026-10-19 Flow YAML 契约（客户「这些全部改成yaml」）：`docs/flows/<flowId>.yaml` 是**唯一机器状态**。
 *   · YAML 存在 ⇒ 只认 YAML；YAML 校验失败 ⇒ `found:false`（fail-closed，**不回落 Markdown**，避免坏 YAML
 *     被旧人读视图掩盖）；
 *   · YAML 不存在 ⇒ 回落旧版 `docs/flows/<flowId>.md`（迁移兼容；新流程应写 YAML；旧 .md 无 dependsOn）。
 */
function lookupFlowStep(
  projectRoot: string,
  flowId: string,
  stepId: string,
): { found: boolean; step?: FlowStateStep; flow?: FlowState } {
  const yamlAbs = path.join(projectRoot, "docs", "flows", `${flowId}.yaml`);
  let yamlText: string | undefined;
  try {
    yamlText = readFileSync(yamlAbs, "utf8");
  } catch (err) {
    // 只有「不存在」才允许回落旧 .md；存在但不可读（权限/IO）⇒ fail-closed，不猜。
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") return { found: false };
    yamlText = undefined;
  }
  if (yamlText !== undefined) {
    const parsed = parseFlowStateYaml(yamlText, flowId);
    if (!parsed.ok) return { found: false };
    const step = parsed.flow.steps.find((candidate) => candidate.id === stepId);
    return step === undefined ? { found: false, flow: parsed.flow } : { found: true, step, flow: parsed.flow };
  }

  // 旧版人读视图（仅迁移期兼容；应用不再把它作为新流程的判定来源）。
  const abs = path.join(projectRoot, "docs", "flows", `${flowId}.md`);
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return { found: false };
  }
  return { found: parseFlowStepIds(text).includes(stepId) };
}
