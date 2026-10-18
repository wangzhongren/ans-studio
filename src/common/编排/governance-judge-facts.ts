// src/common/编排/governance-judge-facts.ts
// 治理卡判断 agent 的**事实构造**（编排私有 common；公开入口经 `govern-session.ts` 薄再导出）。
//
// 依据：PM 评审 `角色卡/项目管理/docs/design/2026-10-18_design_judge-governance-cards-review.md`
// §5.1/§5.3/§5.4（approved）。
//
// 三条纪律：
//   1. **有界、机读**：所有字符串 ≤128B、数组 ≤50、整个 facts 序列化 ≤8KB（§5.3）；
//   2. **账本错误可数**：`ledgerErrors > 0` 时 driver 必须拒绝一切 `approve`（fail-closed）；
//   3. **不读 `.ans` 原文**：facts 只从编排已刷新的账本快照提炼；判断 agent 的读取策略整体排除
//      `.ans/**`（运行时核心 `policy.ts`）。
//
// 本模块只做事实提炼/物证路径计算/提名推荐集解析；**不做裁决**（裁决规范化/机械复核在
// `governance-judge-verdict.ts`）。

import type { GovernanceJudgeFacts, GovernanceJudgeRequest } from "../../model/runtime.ts";
import { isAbsoluteAny, normalizeLexical } from "../shared/path-primitives.ts";
import type { GovernanceLedgerEntry, GovernanceLedgerSnapshot } from "./governance-ledger.ts";

/** facts 序列化上限（评审 §5.3：整个 facts ≤8KB）。 */
export const GOVERNANCE_JUDGE_FACTS_MAX_BYTES = 8 * 1024;
/** 单个字符串上限（评审 §5.3：≤128B）。 */
export const GOVERNANCE_JUDGE_FACT_STRING_BYTES = 128;
/** 数组上限（评审 §5.3：≤50；latestDecisionKinds ≤20）。 */
export const GOVERNANCE_JUDGE_FACT_ARRAY_LIMIT = 50;
export const GOVERNANCE_JUDGE_LATEST_DECISIONS_LIMIT = 20;

/** 治理 flowId 形状（与运行时核心/编排其他处同值；本地再判一次，不导入运行时实现）。 */
const GOVERNANCE_FLOW_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

export function isGovernanceJudgeFlowId(value: unknown): value is string {
  return typeof value === "string" && GOVERNANCE_FLOW_ID_RE.test(value);
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** 有界字符串（非字符串/空串 → undefined）。 */
function boundedText(value: unknown, maxBytes: number = GOVERNANCE_JUDGE_FACT_STRING_BYTES): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (byteLength(trimmed) <= maxBytes) return trimmed;
  const buffer = Buffer.from(trimmed, "utf8").subarray(0, Math.max(0, maxBytes - 3));
  let end = buffer.length;
  while (end > 0 && (buffer[end - 1]! & 0xc0) === 0x80) end -= 1;
  return `${buffer.subarray(0, end).toString("utf8")}…`;
}

/** 空/不可读账本时的保守事实：`ledgerErrors` 置 1（禁止 approve）。 */
export function unavailableGovernanceJudgeFacts(flowId: string): GovernanceJudgeFacts {
  return {
    governanceModel: "trio",
    flowId,
    ledgerErrors: 1,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
  };
}

function proposalDecisionOf(entry: GovernanceLedgerEntry): GovernanceJudgeFacts["proposalDecision"] | undefined {
  switch (entry.decisionKind) {
    case "proposal-accept":
      return "accepted";
    case "proposal-accept-quick":
      return "accepted-quick";
    case "proposal-revise":
      return "revise";
    case "proposal-reject":
      return "reject";
    default:
      return undefined;
  }
}

function boundedStringList(values: readonly unknown[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = boundedText(value);
    if (text === undefined || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

/** 保留顺序与重复的短序列（`latestDecisionKinds` 是「最新决定序列」，不止是集合）。 */
function boundedStringSequence(values: readonly unknown[], limit: number): string[] {
  const out: string[] = [];
  for (const value of values) {
    const text = boundedText(value);
    if (text === undefined) continue;
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

/** 把 facts 压到 JSON 序列化 ≤8KB（优先裁掉列表项；facts 的标量本身远小于上限）。 */
function boundFactsSize(facts: GovernanceJudgeFacts): GovernanceJudgeFacts {
  if (byteLength(JSON.stringify(facts)) <= GOVERNANCE_JUDGE_FACTS_MAX_BYTES) return facts;
  const bounded: GovernanceJudgeFacts = {
    ...facts,
    latestDecisionKinds: [...facts.latestDecisionKinds],
    ...(facts.dispatchedStepIds !== undefined ? { dispatchedStepIds: [...facts.dispatchedStepIds] } : {}),
    ...(facts.appointmentTargetRoleIds !== undefined
      ? { appointmentTargetRoleIds: [...facts.appointmentTargetRoleIds] }
      : {}),
  };
  while (byteLength(JSON.stringify(bounded)) > GOVERNANCE_JUDGE_FACTS_MAX_BYTES) {
    if (bounded.latestDecisionKinds.length > 0) {
      bounded.latestDecisionKinds.shift();
      continue;
    }
    if (bounded.dispatchedStepIds !== undefined && bounded.dispatchedStepIds.length > 0) {
      bounded.dispatchedStepIds.shift();
      continue;
    }
    if (bounded.appointmentTargetRoleIds !== undefined && bounded.appointmentTargetRoleIds.length > 0) {
      bounded.appointmentTargetRoleIds.shift();
      continue;
    }
    break;
  }
  return bounded;
}

/**
 * 从**已刷新的**账本快照提炼有界事实（评审 §5.3）。
 * `snapshot.errors` 非空 ⇒ `ledgerErrors > 0` ⇒ driver 拒绝一切 approve。
 */
export function buildGovernanceJudgeFacts(input: {
  snapshot: GovernanceLedgerSnapshot;
  flowId: string;
}): GovernanceJudgeFacts {
  const { snapshot, flowId } = input;
  const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
  const ledgerErrors = Array.isArray(snapshot.errors) ? snapshot.errors.length : 1;

  let proposalDecision: GovernanceJudgeFacts["proposalDecision"];
  let appointmentTargetRoleIds: string[] | undefined;
  const dispatched: string[] = [];
  const latestDecisionKinds: string[] = [];
  let pendingClarifications = 0;

  for (const entry of entries) {
    if (entry === null || typeof entry !== "object") continue;
    const sameFlow = entry.flowId === flowId;
    if (entry.kind === "customer.decision") {
      const decisionKind = boundedText(entry.decisionKind);
      if (decisionKind !== undefined) {
        latestDecisionKinds.push(decisionKind);
        if (latestDecisionKinds.length > GOVERNANCE_JUDGE_LATEST_DECISIONS_LIMIT) latestDecisionKinds.shift();
      }
      if (!sameFlow) continue;
      const mapped = proposalDecisionOf(entry);
      if (mapped !== undefined) proposalDecision = mapped;
      if (entry.decisionKind === "appointment" && Array.isArray(entry.targetRoleIds)) {
        appointmentTargetRoleIds = boundedStringList(entry.targetRoleIds, GOVERNANCE_JUDGE_FACT_ARRAY_LIMIT);
        if (appointmentTargetRoleIds.length === 0) appointmentTargetRoleIds = undefined;
      }
      continue;
    }
    if (!sameFlow) continue;
    if (entry.kind === "dispatch.accepted") {
      const stepId = boundedText(entry.stepId);
      if (stepId !== undefined && !dispatched.includes(stepId) && dispatched.length < GOVERNANCE_JUDGE_FACT_ARRAY_LIMIT) {
        dispatched.push(stepId);
      }
      continue;
    }
    if (entry.kind === "clarification.requested") {
      pendingClarifications += 1;
      continue;
    }
    if (entry.kind === "intent.handed-off" && entry.handoffKind === "clarification" && pendingClarifications > 0) {
      // 只抵扣**其后**出现的澄清交接（评审 §5.3「减去其后」）；次序不成立时宁可高估。
      pendingClarifications -= 1;
    }
  }

  const facts: GovernanceJudgeFacts = {
    governanceModel: "trio",
    flowId,
    ledgerErrors,
    unresolvedClarificationCount: Math.max(0, pendingClarifications),
    latestDecisionKinds: boundedStringSequence(latestDecisionKinds, GOVERNANCE_JUDGE_LATEST_DECISIONS_LIMIT),
    ...(proposalDecision !== undefined ? { proposalDecision } : {}),
    ...(appointmentTargetRoleIds !== undefined ? { appointmentTargetRoleIds } : {}),
    ...(dispatched.length > 0 ? { dispatchedStepIds: dispatched } : {}),
  };
  return boundFactsSize(facts);
}

/**
 * 规范物证要求（评审 §5.4）：
 * - 返回**必须可读**的物证路径与「是否有必需物证缺失」；
 * - `write` 卡的物证由 `run-role` 按来源角色收窄后放入 `artifacts`，此处取全部已给项；
 * - `appointment-write` 的 flow 物证可选（存在才要求读，缺失不单独阻断）。
 */
export function requiredArtifactPaths(request: GovernanceJudgeRequest): { paths: string[]; missing: boolean } {
  const artifacts = request.artifacts ?? {};
  const proposal = typeof artifacts.proposalPath === "string" && artifacts.proposalPath.trim() !== ""
    ? artifacts.proposalPath.trim()
    : undefined;
  const nomination = typeof artifacts.nominationPath === "string" && artifacts.nominationPath.trim() !== ""
    ? artifacts.nominationPath.trim()
    : undefined;
  const flow = typeof artifacts.flowPath === "string" && artifacts.flowPath.trim() !== ""
    ? artifacts.flowPath.trim()
    : undefined;

  switch (request.cardKind) {
    case "proposal":
      return { paths: proposal !== undefined ? [proposal] : [], missing: proposal === undefined };
    case "appointment":
      return { paths: nomination !== undefined ? [nomination] : [], missing: nomination === undefined };
    case "acceptance":
      return {
        paths: [proposal, flow].filter((p): p is string => p !== undefined),
        missing: proposal === undefined || flow === undefined,
      };
    case "appointment-write":
      return {
        paths: [nomination, flow].filter((p): p is string => p !== undefined),
        missing: nomination === undefined,
      };
    case "schedule-write":
      return { paths: flow !== undefined ? [flow] : [], missing: flow === undefined };
    case "write": {
      // 写盘卡：只把 run-role 按来源角色收窄的**已存在**物证放进 required-read；
      // 即将新建的目标文件不在此列（评审 §5.4「新文件除外」，由 preview 正文核对）。
      const paths = [proposal, nomination, flow].filter((p): p is string => p !== undefined);
      return { paths, missing: false };
    }
    default:
      return { paths: [], missing: true };
  }
}

/**
 * 流程单步骤行（`docs/flows/<flowId>.md` 的 Markdown 表格）：
 * 表头须同时含「步骤/step」与「状态/status」列；状态只认 `done`（fail-closed）。
 */
export interface FlowStepRecord {
  id: string;
  status: string;
}

function stripTableMarkup(value: string): string {
  return value.trim().replace(/^[`*_]+/, "").replace(/[`*_]+$/, "").trim();
}

function splitTableRow(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return undefined;
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()));
}

/** 解析流程单的步骤表；找不到表头/无数据行 ⇒ `wellFormed:false`（调用方 fail-closed）。 */
export function parseFlowSteps(markdown: string): { wellFormed: boolean; steps: FlowStepRecord[] } {
  if (typeof markdown !== "string" || markdown.trim() === "") return { wellFormed: false, steps: [] };
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  let headerIndex = -1;
  let stepColumn = -1;
  let statusColumn = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const cells = splitTableRow(lines[index]!);
    if (cells === undefined) continue;
    const step = cells.findIndex((cell) => /^(步骤|step)$/i.test(stripTableMarkup(cell)));
    const status = cells.findIndex((cell) => /^(状态|status)$/i.test(stripTableMarkup(cell)));
    if (step !== -1 && status !== -1) {
      headerIndex = index;
      stepColumn = step;
      statusColumn = status;
      break;
    }
  }
  if (headerIndex === -1) return { wellFormed: false, steps: [] };

  const steps: FlowStepRecord[] = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = splitTableRow(lines[index]!);
    if (cells === undefined) break; // 表格结束
    if (isSeparatorRow(cells)) continue;
    if (cells.length <= Math.max(stepColumn, statusColumn)) return { wellFormed: false, steps: [] };
    const id = stripTableMarkup(cells[stepColumn]!);
    const status = stripTableMarkup(cells[statusColumn]!);
    if (id === "") continue;
    steps.push({ id, status });
  }
  return { wellFormed: true, steps };
}

/**
 * 验收机械门槛（P6 验收观察，安全项）：**不靠模型自报**，只用流程单 + 账本事实。
 * 所有步骤 `done`、每个步骤都有 `dispatch.accepted`、无未结算（`unclassified`/`none`）决定、
 * 无未闭环澄清、账本可读——任一不满足即 `manual`（原卡 + 说明）。
 */
export function evaluateAcceptanceCompletion(input: {
  flowMarkdown: string;
  facts: GovernanceJudgeFacts;
  ledgerEntries: readonly GovernanceLedgerEntry[];
  ledgerErrors: number;
}): { ok: true } | { ok: false; reasonCode: string; reason: string } {
  if (input.ledgerErrors > 0) {
    return { ok: false, reasonCode: "ledger-unavailable", reason: "治理账本不可读或存在坏行，无法核对验收完成度，已转手动确认。" };
  }
  const parsed = parseFlowSteps(input.flowMarkdown);
  if (!parsed.wellFormed || parsed.steps.length === 0) {
    return { ok: false, reasonCode: "insufficient-evidence", reason: "流程单缺少可解析的步骤表，无法核对验收完成度，已转手动确认。" };
  }
  const notDone = parsed.steps.filter((step) => step.status.toLowerCase() !== "done");
  if (notDone.length > 0) {
    const detail = notDone.slice(0, 10).map((step) => `${step.id}=${step.status || "（空）"}`).join("、");
    return {
      ok: false,
      reasonCode: "insufficient-evidence",
      reason: `流程仍有未完成/阻塞/待派发步骤（${detail}），不能代批验收，已转手动确认。`,
    };
  }
  const dispatched = new Set(input.facts.dispatchedStepIds ?? []);
  const missingDispatch = parsed.steps.filter((step) => !dispatched.has(step.id));
  if (missingDispatch.length > 0) {
    const detail = missingDispatch.slice(0, 10).map((step) => step.id).join("、");
    return {
      ok: false,
      reasonCode: "insufficient-evidence",
      reason: `流程步骤缺少 dispatch.accepted 记录（${detail}），不能代批验收，已转手动确认。`,
    };
  }
  if (input.facts.unresolvedClarificationCount > 0) {
    return { ok: false, reasonCode: "insufficient-evidence", reason: "仍有未闭环的澄清，不能代批验收，已转手动确认。" };
  }
  const unresolved = input.ledgerEntries.filter((entry) =>
    entry.kind === "customer.decision"
    && entry.flowId === input.facts.flowId
    && (entry.decisionKind === "unclassified" || entry.customerDecision === "none" || entry.customerDecision === undefined)
  );
  if (unresolved.length > 0) {
    return { ok: false, reasonCode: "insufficient-evidence", reason: "该流程仍有未结算的决定，不能代批验收，已转手动确认。" };
  }
  return { ok: true };
}

/**
 * **声明写入路径**（2026-10-18 真机修复）：只从 preview 的「一行一个路径」声明中提取，
 * **不扫描散文**（散文里的 `src/**`、`test/**`、`data/ledger.json` 等不是本次写入目标）。
 * 约定来源：`request_confirmation` 的 promptGuidelines「preview 必须列出将要写出的具体路径
 * （每个待写文件一行，相对项目根、含目录）」。支持行首列表符/「路径：」标签/反引号。
 */
export function declaredWritePathsFromPreview(preview: string | undefined): string[] {
  if (typeof preview !== "string" || preview.trim() === "") return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of preview.replace(/\r\n/g, "\n").split("\n")) {
    let line = rawLine.trim();
    line = line.replace(/^(?:[-*+]|\d+[.)])\s+/, "");
    // 关键词后可直接跟路径（`将写入 docs/x.md`），也可带修饰词+冒号
    // （`写入路径仅一条：docs/x.md`）；`路径：` / 反引号 / 列表符同样容忍。
    line = line.replace(/^(?:写入路径|将写入|写入|新建|创建|修改|更新|路径)\s*/, "");
    line = line.replace(/^(?:[^：:\s]+\s*)?[:：]\s*/, "");
    line = line.replace(/^[`"'“”‘’*_]+/, "").replace(/[`"'“”‘’*_]+$/, "").trim();
    line = line.replace(/[（(][^（）()]*[）)]$/, "").replace(/[。；;，,]+$/, "").trim();
    if (line === "" || /\s/.test(line) || !line.includes("/")) continue;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(line)) continue; // URL
    if (isAbsoluteAny(line)) continue; // 绝对路径
    const norm = normalizeLexical(line);
    if (norm === "" || norm === "." || norm.startsWith("../")) continue;
    if (norm.split("/").some((segment) => segment === "" || segment === "..")) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

/** 角色 id token（推荐集/任命 id 用；不做过度限制——项目角色 id 可为中文）。 */
function normalizeRoleIdToken(value: string): string | undefined {
  const token = value.trim().replace(/^[`'"[（(]+/, "").replace(/[`'"\]）)]+$/, "").trim();
  if (token === "" || token.length > 128) return undefined;
  if (/[\s/\\]/.test(token)) return undefined;
  if (token === "." || token === "..") return undefined;
  return token;
}

function parseIdList(raw: string): string[] | undefined {
  const cleaned = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (cleaned === "") return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of cleaned.split(/[,、，]/)) {
    const token = normalizeRoleIdToken(part);
    if (token === undefined) return undefined;
    if (seen.has(token)) return undefined; // 推荐集重复 ⇒ 歧义
    seen.add(token);
    out.push(token);
    if (out.length > GOVERNANCE_JUDGE_FACT_ARRAY_LIMIT) return undefined;
  }
  return out.length > 0 ? out : undefined;
}

/**
 * 解析提名文件的机器可读推荐集（评审 §5.4/§7.3）：
 * - frontmatter `recommended: [id1, id2]`（也接受 `recommended: id1、id2`）；
 * - 或固定行 `推荐：id1、id2` / `推荐: id1, id2`；
 * - 两种来源同时出现且不一致 / 重复 / 空 / 多个歧义 ⇒ `undefined`（driver 回落 manual）。
 * 不解析 Markdown 表格/散文——不猜测。
 */
export function parseRecommendedRoleIds(markdown: string): string[] | undefined {
  if (typeof markdown !== "string" || markdown.trim() === "") return undefined;
  const text = markdown.replace(/\r\n/g, "\n");

  const frontmatterValues: string[] = [];
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (frontmatter !== null) {
    for (const line of frontmatter[1]!.split("\n")) {
      const match = /^\s*recommended\s*:\s*(.*)$/i.exec(line);
      if (match !== null) frontmatterValues.push(match[1]!.trim());
    }
  }

  const fixedLineValues: string[] = [];
  for (const line of text.split("\n")) {
    const match = /^\s*推荐\s*[:：]\s*(.*)$/.exec(line);
    if (match !== null) fixedLineValues.push(match[1]!.trim());
  }

  const sources: string[][] = [];
  for (const raw of [...frontmatterValues, ...fixedLineValues]) {
    const parsed = parseIdList(raw);
    if (parsed === undefined) return undefined;
    sources.push(parsed);
  }
  if (sources.length === 0) return undefined;
  const first = sources[0]!;
  for (const other of sources.slice(1)) {
    if (other.length !== first.length || other.some((id, index) => id !== first[index])) return undefined;
  }
  return first;
}
