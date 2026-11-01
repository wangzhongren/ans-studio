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

import { GOVERNANCE_SLUG_PATTERN, type GovernanceJudgeFacts, type GovernanceJudgeRequest } from "../../model/runtime.ts";
import { isAbsoluteAny, normalizeLexical } from "../shared/path-primitives.ts";

/** facts 序列化上限（评审 §5.3：整个 facts ≤8KB）。 */
export const GOVERNANCE_JUDGE_FACTS_MAX_BYTES = 8 * 1024;
/** 单个字符串上限（评审 §5.3：≤128B）。 */
export const GOVERNANCE_JUDGE_FACT_STRING_BYTES = 128;
/** 数组上限（评审 §5.3：≤50；latestDecisionKinds ≤20）。 */
export const GOVERNANCE_JUDGE_FACT_ARRAY_LIMIT = 50;
export const GOVERNANCE_JUDGE_LATEST_DECISIONS_LIMIT = 20;

/**
 * 提案卡的「需求变更申请」指引（2026-10-26 客户要求 + 同日客户纠正/补充；**提示词文案的单一来源**，
 * 本模块只导出常量，不参与事实提炼/裁决，也不改变任何机械权限）。
 *
 * 背景：Draft / 报告员需要新的客户授权/范围（或约束/成本变化）时，不得把未获授权的诉求塞进提案卡
 * 「顺带获批」；正确通道是先发 `request_requirement_change`，进入**独立审批**：审批卡由统筹
 * （Convener/Steward）或提案角色（Rapporteur/Draft）发起的 `cardKind="decision"` 决策卡承载；
 * 审批人是独立判断 agent（客户勾选「替我决策」时按卡内唯一推荐项代批）或客户本人（未勾选时手选）；
 * **发起方不得自批**；主理（Lead）不审批，只在批准后执行意图变更（更新 `docs/intents/**`），Draft
 * 再修订提案。申请 ≠ 授权：申请提交/受理/意图文件已改都不解锁任何门禁。
 *
 * 判断 agent 的机械权限不变：decision 组仍只能 approve 或 manual（**不得 deny**），approval 组仍
 * 只能 deny/manual；判断 agent 不能在提案卡上代批任何新授权。这类提案卡一律不得 approve：
 * decision 组 ⇒ manual/intent-drift，理由必须指向专用通道，并说明不得通过代批或删除需求绕过。
 */
export const GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE =
  "提案卡若包含**未获意图授权**的新联网/外部目录访问/范围扩张/成本授权（或其它新授权诉求），一律不得 approve：" +
  "decision 组不能 deny ⇒ manual（reasonCode 用 intent-drift；approval 组写卡夹带同类诉求 ⇒ deny）。" +
  "reason 必须写明：「Draft 应先发 request_requirement_change；需求变更审批卡由运营（Convener）或策划角色" +
  "（Rapporteur）发起，发起方不得自批；审批由独立判断 agent（客户勾选「替我决策」时按卡内唯一推荐项代批）" +
  "或客户本人（未勾选时手动选择）完成；产品不审批，只在批准后执行意图变更；不得通过在提案卡上代批或" +
  "将需求删掉绕过」——申请 ≠ 客户批准，也不是产品批准；提案卡上判断 agent 不能代批任何新授权。";

/**
 * 治理 flowId 形状（**单一来源**：运行时核心 `src/model/runtime.ts` 的 `GOVERNANCE_SLUG_PATTERN`；
 * 2026-10-22 收紧为禁止首/尾连字符）。本地只编译判定用 RegExp，不保留同值副本。
 */
const GOVERNANCE_FLOW_ID_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);

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
  /** D 批：账本已撤除；保留可选参数以兼容旧调用方（不读取）。 */
  snapshot?: { entries?: readonly unknown[]; errors?: readonly unknown[] };
  flowId: string;
  /**
   * 调用方从 `tasks.jsonl`/请求上下文提炼的事实（D 批单一来源）。
   * 3.4：`acceptanceFacts/evidenceMismatch/criteriaRef` 同为可选事实，经 `...input.facts` 原样有界透传；
   * priority 由应用从 criteria 派生，builder 不采信/不改写角色自报。
   */
  facts?: Partial<GovernanceJudgeFacts>;
}): GovernanceJudgeFacts {
  const facts: GovernanceJudgeFacts = {
    governanceModel: "trio",
    flowId: input.flowId,
    ledgerErrors: 0,
    unresolvedClarificationCount: 0,
    latestDecisionKinds: [],
    ...input.facts,
  };
  return boundFactsSize(facts);
}

/**
 * 规范物证要求（评审 §5.4；2026-10-22 治理分工第 1/3/5 项）：
 * - 返回**必须可读**的物证路径与「是否有必需物证缺失」；
 * - 本函数**不扫盘、不做版本选择**：实际版本路径由 app（验收 judgeContext）传入；
 *   `expectedProposal`/`expectedQualityReport` 只是 flowId 存在时的**约定缺失文案**，与
 *   `mechanical-rejection`/`workflow-preconditions`/`governance-judge-prompt` 同一命名
 *   （部分位置用 `-proposal-v1.md` 示例、部分用 `-proposal-vN.md` 正则），不表示该版本存在；
 * - `missingPaths` 是缺失物证的**约定路径**（客户可读；flowId 缺失时退化为文字，不编造路径）；
 * - 第 1 项：任命材料以请求携带的 `recommendedRoleIds` 为唯一来源（D 批撤除团队计划）；
 * - 第 3 项（2026-10-29 方案 v2.1 / Q6 A）：acceptance 只要求**提案**与**质检报告**
 *   （`docs/quality/<flowId>-report-v1.md`，经 `acceptanceReportPath` 传入）；意图/名单/D3 由
 *   `facts.intentDocumentPath`/`rosterVersion`/`rosterSha256`/`appointmentDecisionId` 机械核对；
 *   旧 flow 的验收标准/变更包不再作为 acceptance 物证；
 * - `write` 卡的物证由 `run-role` 按来源角色收窄后放入 `artifacts`，此处取全部已给项（Convener 的
 *   `write` 可带 teamPlan，若已存在）；
 * - `appointment-write` 的 flow 物证可选（存在才要求读，缺失不单独阻断）。
 */
export function requiredArtifactPaths(request: GovernanceJudgeRequest): {
  paths: string[];
  missing: boolean;
  missingPaths?: string[];
} {
  const artifacts = request.artifacts ?? {};
  const pick = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  const proposal = pick(artifacts.proposalPath);
  const report = pick(artifacts.acceptanceReportPath);
  const flowId = typeof request.flowId === "string" && request.flowId.trim() !== "" ? request.flowId.trim() : undefined;
  // 约定路径（flowId 缺失 ⇒ 文字，不编造路径）。
  const expectedProposal = flowId !== undefined ? `docs/proposals/${flowId}-proposal-v1.md` : "提案";
  const expectedQualityReport = flowId !== undefined ? `docs/quality/${flowId}-report-v1.md` : "质检报告";

  switch (request.cardKind) {
    case "proposal":
      return proposal !== undefined
        ? { paths: [proposal], missing: false }
        : { paths: [], missing: true, missingPaths: [expectedProposal] };
    case "appointment": {
      const recommended = Array.isArray(request.recommendedRoleIds) ? request.recommendedRoleIds : [];
      return recommended.length > 0
        ? { paths: [], missing: false }
        : { paths: [], missing: true, missingPaths: ["任命推荐集 recommendedRoleIds"] };
    }
    case "acceptance": {
      // 2026-10-29（方案 v2.1 §5.1/Q6 A）：最小链事实——产品意图 + 提案 + 名单 + D3 通过 + 质检报告。
      // 物证只要求**提案**与**质检报告**（后者经 `acceptanceReportPath` 传 `docs/quality/<flowId>-report-v1.md`）；
      // 不再要求旧 flow 的验收标准/变更包（最小系统无这些物证）。意图/名单/D3 事实由应用注入 facts。
      const missingPaths = [
        ...(proposal === undefined ? [expectedProposal] : []),
        ...(report === undefined ? [expectedQualityReport] : []),
      ];
      return {
        paths: [proposal, report].filter((p): p is string => p !== undefined),
        missing: missingPaths.length > 0,
        ...(missingPaths.length > 0 ? { missingPaths } : {}),
      };
    }
    case "appointment-write":
      return { paths: [], missing: false };
    case "intent-confirm":
      // 2026-10-20：需求确认卡本身是意图基准（判断它与客户当前要求是否一致），不要求独立 intent 文件/物证。
      return { paths: [], missing: false };
    case "decision":
      // 2026-10-26 客户 decision 卡（材料性选择）：与提案/任命/验收独立——不要求任何规范物证；
      // 判断只需卡内选项（含唯一推荐项）。绝不能落 default 的 `missing:true`（那会把合法卡误判 manual）。
      return { paths: [], missing: false };
    default:
      return { paths: [], missing: true };
  }
}

/**
 * 流程单步骤行（`docs/removed/<flowId>.md` 的 Markdown 表格）：
 * 表头须同时含「步骤/step」与「状态/status」列；显式 id 列优先（见 `parseFlowSteps`）。
 * `status` 保留单元格原文；判定处一律经 `normalizeFlowStepStatus` 取引导 token（fail-closed）。
 */
export function declaredWritePathOfLine(rawLine: string): string | undefined {
  let line = rawLine.trim();
  line = line.replace(/^(?:[-*+]|\d+[.)])\s+/, "");
  // 关键词后可直接跟路径（`将写入 docs/x.md`），也可带修饰词+冒号
  // （`写入路径仅一条：docs/x.md`）；`路径：` / 反引号 / 列表符同样容忍。
  line = line.replace(/^(?:写入路径|将写入|写入|新建|创建|修改|更新|路径)\s*/, "");
  line = line.replace(/^(?:[^：:\s]+\s*)?[:：]\s*/, "");
  line = line.replace(/^[`"'“”‘’*_]+/, "").replace(/[`"'“”‘’*_]+$/, "").trim();
  line = line.replace(/[（(][^（）()]*[）)]$/, "").replace(/[。；;，,]+$/, "").trim();
  if (line === "" || /\s/.test(line) || !line.includes("/")) return undefined;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(line)) return undefined; // URL
  if (isAbsoluteAny(line)) return undefined; // 绝对路径
  const norm = normalizeLexical(line);
  if (norm === "" || norm === "." || norm.startsWith("../")) return undefined;
  if (norm.split("/").some((segment) => segment === "" || segment === "..")) return undefined;
  return norm;
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
    const norm = declaredWritePathOfLine(rawLine);
    if (norm === undefined || seen.has(norm)) continue;
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
