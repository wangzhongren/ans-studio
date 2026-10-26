// app/desktop/boundary-change.ts
// 2026-10-26 客户确认的分层门禁（lead-governance-coordination）：
// `request_boundary_change` 桌面侧应用能力的**纯逻辑**——确定性校验、稳定票据 id、组队任务文本、
// AI 门禁审核请求（复用编排 `createGovernanceJudge` 的只读判断驱动）。
//
// 分层纪律：
//  - 本模块**不写盘、不开会话、不调用模型**：IO/派发/判断闭包构造全部在 `interface.ts` 的单一装配点。
//  - 写资格判定不在本模块新增第二份实现：本模块只做**请求载荷的项目相对路径形状/治理关键路径/实际变化**
//    校验（这是边界变更请求的入口卫生，不是写门禁）；真正写权仍由组队按 appointment-write 经门禁确认。
//  - 审计票据是应用自己的 `.ans/governance/boundary-requests/` 记录（不伪造治理账本）：
//    不追加 `customer.decision`、不伪造批准。
//
// AI 门禁为什么用 `intent-confirm` 卡种：现有 `createGovernanceJudge` 只接受已经冻结的治理卡种。
// approval 组（write/appointment-write/schedule-write）的机械门槛要求**实际写入者的逐路径探测与待写正文**
// （`pathProbes` + `declaredContent`）——本请求发生在组队真正写边界**之前**，此刻伪造这些事实会违反
// 「不伪造系统事实」；decision 组的 proposal/appointment/acceptance 又要求已确认意图/团队计划物证且只判
// 意图漂移。`intent-confirm` 是唯一**不需要捏造写入正文/意图文件**的只读卡种：语义即「这次变更是否与
// 当前已确认的流程/团队计划一致」。approve 只表示「同意提交组队」，组队仍按 appointment-write 逐路径确认；
// deny/manual/超时/不可用一律由调用方转成 `rejected`（不自动放行）。

import { createHash } from "node:crypto";
import type {
  CustomerInputRequest,
  GovernanceJudgeFacts,
  GovernanceJudgeRequest,
  RuntimeKind,
} from "../../src/model/runtime.ts";
import type { BoundaryEntry, BoundarySection1 } from "../../src/model/boundary.ts";
import type { GovernanceLedgerEntry } from "../../src/pipeline/orchestration/govern-session.ts";
import type { ProjectRoleSummary } from "../../src/service/role/resolve-role.ts";
import { compareKey, isUnderOrEqual, toPosix } from "../../src/common/shared/path-primitives.ts";

/** 审计票据 schema（应用自有 `.ans/governance/` 记录；不是治理账本条目）。 */
export const BOUNDARY_CHANGE_TICKET_SCHEMA = "boundary-change-request/v1";
/** 票据根目录（项目相对）。`<root>/<flowId>/<ticketId>.json`，原子写、重启可读。 */
export const BOUNDARY_CHANGE_TICKET_ROOT_REL = ".ans/governance/boundary-requests";
/** 未归一到具体流程时的票据目录名（合法 slug；不冒充真实 flowId）。 */
export const BOUNDARY_CHANGE_UNASSIGNED_FLOW_ID = "unassigned";

/**
 * 治理关键路径：增删写权**都不得**经由本通道触碰这些根（按路径段比较，覆盖祖先/后代都拒绝）。
 * 与 `governance-judge-verdict.ts::isHardForbiddenPath` 同口径的治理关键项 + 本仓共享目录/发布根。
 * 移除误授权虽然收窄权限，但同样属治理/共享/Role-Card 层变更：应走团队计划/边界任命流程，
 * 不在运行期请求通道里处理（也避免借移除请求探测治理文件）。
 */
const GOVERNANCE_CRITICAL_PREFIXES: readonly string[] = [
  ".ans",
  "角色卡",
  "docs/flows",
  "common/shared",
  "src/common/shared",
  "docs/bootstrap-manifest.md",
];

/**
 * 发布/打包根文件与目录（项目根；本通道不得授予写权）。这些文件由团队计划指定的构建配置 owner 独占，
 * 需变更走团队计划/边界任命（gate 2 已确认的写集），不能由运行期边界变更请求顺带扩权。
 */
const RELEASE_ROOT_PATTERNS: readonly RegExp[] = [
  /^package(-lock)?\.json$/i,
  /^(pnpm-lock\.yaml|yarn\.lock)$/i,
  /^tsconfig(?:\.[^/]+)?\.json$/i,
  /^(?:vite|vitest|playwright|electron-builder|forge|webpack|rollup|eslint|prettier)\.config\.[^/]+$/i,
  /^index\.html$/i,
  /^\.github(?:\/|$)/,
  /^(?:release|packaging|dist|build|bin)(?:\/|$)/,
  /^\.env(?:\.|$)/,
  /^\.git(?:\/|$)/,
];

export type BoundaryChangeAssessmentFailureCode = "invalid-path" | "no-change";

export interface BoundaryChangeAssessmentOk {
  ok: true;
  /** 归一化并去重后的请求路径（保留首次出现顺序）。 */
  addPaths: string[];
  removePaths: string[];
  /** 与当前边界比较后**真正会改变**的增/删（空数组表示该侧无实际变化）。 */
  effectiveAdds: string[];
  effectiveRemoves: string[];
}

export interface BoundaryChangeAssessmentFailure {
  ok: false;
  code: BoundaryChangeAssessmentFailureCode;
  message: string;
}

/**
 * 项目相对路径归一化（**词法**；不触碰文件系统）：
 *  - 反斜杠统一为 `/`（Windows 录入友好）；
 *  - 拒绝绝对路径（POSIX 前导 `/`、盘符 `C:`、UNC 归一后以 `/` 开头）；
 *  - 拒绝空串、空段（含尾斜杠 `src/`）、`.`、`..` 段与 NUL。
 * 合法返回去首尾空白后的 posix 相对路径；否则 undefined。
 */
export function normalizeBoundaryChangePath(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  if (text === "" || text.includes("\0")) return undefined;
  const posix = toPosix(text);
  if (posix.startsWith("/") || /^[a-zA-Z]:/.test(posix)) return undefined; // 绝对路径/盘符/UNC
  const segments = posix.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return undefined;
  return segments.join("/");
}

/** 路径是否触碰治理关键/发布打包路径（祖先覆盖或后代覆盖均拒绝；增删共用）。 */
export function boundaryChangePathIsGovernanceCritical(path: string): boolean {
  if (GOVERNANCE_CRITICAL_PREFIXES.some((prefix) => isUnderOrEqual(path, prefix) || isUnderOrEqual(prefix, path))) {
    return true;
  }
  return RELEASE_ROOT_PATTERNS.some((pattern) => pattern.test(path));
}

/** 边界条目的项目根相对路径（去掉尾斜杠；非 project 根条目返回 undefined）。 */
function projectEntryPath(entry: BoundaryEntry): string | undefined {
  if (entry.root !== "project") return undefined;
  const normalized = toPosix(entry.path).replace(/\/+$/, "");
  return normalized === "" ? undefined : normalized;
}

/** 当前边界条目是否已经覆盖该路径（file 精确；directory 目录内；conditional-directory 不算已覆盖）。 */
export function boundaryEntryCoversPath(entry: BoundaryEntry, path: string): boolean {
  const base = projectEntryPath(entry);
  if (base === undefined) return false;
  if (entry.kind === "file") return compareKey(base) === compareKey(path);
  if (entry.kind === "directory") return isUnderOrEqual(path, base);
  return false;
}

/** 当前边界是否有与路径**完全相等**的条目（移除只能针对独立条目，不能切目录条目的一部分）。 */
export function boundaryEntryIsExact(entry: BoundaryEntry, path: string): boolean {
  const base = projectEntryPath(entry);
  return base !== undefined && compareKey(base) === compareKey(path);
}

function pathListOf(raw: unknown, label: string): { ok: true; paths: string[] } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, paths: [] };
  if (!Array.isArray(raw)) return { ok: false, message: `${label} 必须是字符串数组。` };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const normalized = normalizeBoundaryChangePath(item);
    if (normalized === undefined) {
      return {
        ok: false,
        message: `${label} 含非法路径：${typeof item === "string" ? JSON.stringify(item) : String(item)}（须为项目相对路径，不能是绝对路径、不能含 ..、空段或尾斜杠）。`,
      };
    }
    const key = compareKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return { ok: true, paths: out };
}

/**
 * 确定性校验（应用侧；工具层已先做一次形状拒绝，这里是**能力入口的第二道**）：
 *  1. add/remove 至少一个非空；rationale 非空；
 *  2. 路径项目相对、无绝对/`..`/空段，去重；同一路径不得同时新增与移除；
 *  3. 增删路径都不得触碰治理关键/发布打包根（治理/共享/Role-Card 层变更走团队计划/边界任命流程）；
 *  4. 与当前角色边界比较：已覆盖的新增、非独立条目的移除都不会产生实际变化；全部无变化 ⇒ `no-change`。
 *
 * 移除路径被更宽的目录条目覆盖时返回 `invalid-path`：边界模型没有「否定条目」，Crew 不能只删目录里的
 * 一项；请改为调整目录条目（另走团队计划/治理流程）或保持现状。
 */
export function assessBoundaryChangeRequest(input: {
  boundary: BoundarySection1;
  addPaths?: unknown;
  removePaths?: unknown;
  rationale?: unknown;
}): BoundaryChangeAssessmentOk | BoundaryChangeAssessmentFailure {
  const rationale = typeof input.rationale === "string" ? input.rationale.trim() : "";
  if (rationale === "") {
    return { ok: false, code: "invalid-path", message: "请求载荷非法：rationale（理由）不能为空。" };
  }
  const adds = pathListOf(input.addPaths, "addPaths");
  if (!adds.ok) return { ok: false, code: "invalid-path", message: adds.message };
  const removes = pathListOf(input.removePaths, "removePaths");
  if (!removes.ok) return { ok: false, code: "invalid-path", message: removes.message };
  if (adds.paths.length === 0 && removes.paths.length === 0) {
    return { ok: false, code: "no-change", message: "请求没有任何增删路径（addPaths/removePaths 至少一个非空）。" };
  }
  const addKeys = new Set(adds.paths.map((path) => compareKey(path)));
  const overlap = removes.paths.find((path) => addKeys.has(compareKey(path)));
  if (overlap !== undefined) {
    return { ok: false, code: "invalid-path", message: `同一路径不能同时新增与移除：${overlap}。` };
  }
  const critical = [...adds.paths, ...removes.paths].find((path) => boundaryChangePathIsGovernanceCritical(path));
  if (critical !== undefined) {
    return {
      ok: false,
      code: "invalid-path",
      message:
        `路径触碰治理关键/发布打包路径：${critical}。` +
        "`.ans/**`、`角色卡/**`、`docs/flows/**`、共享目录与 release/packaging 根文件不能经由边界变更请求增删；" +
        "请改用团队计划/边界任命流程。",
    };
  }

  const entries = input.boundary.entries;
  const effectiveAdds = adds.paths.filter((path) => !entries.some((entry) => boundaryEntryCoversPath(entry, path)));
  const effectiveRemoves: string[] = [];
  for (const path of removes.paths) {
    if (entries.some((entry) => boundaryEntryIsExact(entry, path))) {
      effectiveRemoves.push(path);
      continue;
    }
    if (entries.some((entry) => boundaryEntryCoversPath(entry, path))) {
      return {
        ok: false,
        code: "invalid-path",
        message:
          `移除路径 ${path} 当前被更宽的目录条目覆盖，边界模型无法只移除其中一项；` +
          "请改为调整目录条目（属团队计划/边界任命变更）或保持现状。",
      };
    }
    // 当前边界本来就没有该路径：移除是空操作，不构成实际变化。
  }
  if (effectiveAdds.length === 0 && effectiveRemoves.length === 0) {
    return {
      ok: false,
      code: "no-change",
      message:
        "与当前角色边界比较没有实际变化（新增路径已被现有条目覆盖/移除路径本来就不在边界内）；" +
        "未派发给组队。",
    };
  }
  return { ok: true, addPaths: adds.paths, removePaths: removes.paths, effectiveAdds, effectiveRemoves };
}

/** 稳定 ticketId：roleId + 排序后的增删路径 + 理由（trim）的 SHA-256 前 16 hex。 */
export function boundaryChangeTicketId(input: {
  roleId: string;
  addPaths: readonly string[];
  removePaths: readonly string[];
  rationale: string;
}): string {
  const canonical = JSON.stringify([
    input.roleId,
    [...input.addPaths].sort(),
    [...input.removePaths].sort(),
    input.rationale.trim(),
  ]);
  return `bnd-${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}

/** 稳定 clientMessageId（`ans-app-task:` 前缀；同一 ticket 重复调用至多投递一次）。 */
export function boundaryChangeClientMessageId(ticketId: string): string {
  const digest = createHash("sha256").update(`boundary-change\u0000${ticketId}`).digest("hex").slice(0, 32);
  return `ans-app-task:${digest}`;
}

/** 票据项目相对路径 `.ans/governance/boundary-requests/<flowId>/<ticketId>.json`。 */
export function boundaryChangeTicketRelPath(flowId: string, ticketId: string): string {
  const safeFlowId = flowId === "" ? BOUNDARY_CHANGE_UNASSIGNED_FLOW_ID : flowId;
  return `${BOUNDARY_CHANGE_TICKET_ROOT_REL}/${safeFlowId}/${ticketId}.json`;
}

export type BoundaryChangeTicketStatus = "requested" | "rejected" | "dispatched" | "failed";

/** 审计票据（应用自有 `.ans` 记录；不写 `customer.decision`、不伪造批准）。 */
export interface BoundaryChangeTicketRecord {
  schema: typeof BOUNDARY_CHANGE_TICKET_SCHEMA;
  ticketId: string;
  roleId: string;
  requestedBy: string;
  flowId: string;
  addPaths: string[];
  removePaths: string[];
  rationale: string;
  status: BoundaryChangeTicketStatus;
  /** 首次登记时间（ISO）。 */
  at: string;
  /** 最近一次状态更新时间（ISO）。 */
  updatedAt: string;
  attempts: number;
  /** AI 门禁结论摘要（requested 时为 null）。 */
  judge: null | {
    verdict: string;
    reasonCode?: string;
    reason?: string;
    engine?: string;
  };
  /** 派发事实（dispatched 时非 null）。 */
  dispatch: null | {
    clientMessageId: string;
    sentAt: string;
    runtime?: string;
    queued?: boolean;
    /** 投递任务文本的 SHA-256（消息摘要；不存全文）。 */
    messageSha256?: string;
  };
  /** 失败原因（failed 时如实记录；可重试）。 */
  error?: string | null;
}

/**
 * 组队任务文本：只含精确增删路径、理由与 ticketId；明确「只改列出的路径」「按 appointment-write 逐路径确认」。
 * **不得**夹带「已获客户批准」一类断言——组队仍需确认后才写。
 */
export function buildBoundaryChangeCrewTaskText(input: {
  ticketId: string;
  roleId: string;
  flowId: string;
  addPaths: readonly string[];
  removePaths: readonly string[];
  rationale: string;
}): string {
  const lines: string[] = [
    `[边界变更请求] ticketId=${input.ticketId}｜目标项目角色=${input.roleId}｜flowId=${input.flowId}`,
    "统筹（convener）报告该角色的写集/边界不足以完成已授权任务，请求你按任命写卡流程修改角色边界。",
    "本次只做下列精确增删（不得重写整个边界、不得顺带扩大其它路径、不得修改角色职责/能力/写集之外的内容）：",
  ];
  if (input.addPaths.length > 0) {
    lines.push("需新增写权限的路径（逐条）：");
    for (const path of input.addPaths) lines.push(`- ${path}`);
  }
  if (input.removePaths.length > 0) {
    lines.push("需移除写权限的路径（逐条）：");
    for (const path of input.removePaths) lines.push(`- ${path}`);
  }
  lines.push(`理由：${input.rationale}`);
  lines.push("要求：");
  lines.push("1) 只对上方列出的路径增删；其余条目原样保留。");
  lines.push("2) 仍按 appointment-write 逐路径提交确认；未获确认不得写入，也不得先写后补。");
  lines.push("3) 确认被拒或无法按请求修改时，按拒绝原因修正后重发，并向统筹报告。");
  lines.push(`4) 完成后向统筹（并汇总主理）报告，保留证据；审计票据：${BOUNDARY_CHANGE_TICKET_ROOT_REL}/${input.flowId}/${input.ticketId}.json。`);
  lines.push("本请求只是统筹提交的边界变更请求，是否落地以你按 appointment-write 取得的逐路径确认为准。");
  return lines.join("\n");
}

/** 证据包摘要的有界长度（提示层另有 8KB 截断；此处提前裁剪，保持内容可读）。 */
const JUDGE_PREVIEW_MAX_BYTES = 7_500;
const JUDGE_ROLE_CARD_EXCERPT_BYTES = 1_800;
const JUDGE_BOUNDARY_ENTRY_LIMIT = 80;
const JUDGE_FLOW_STEP_LIMIT = 30;

function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  const buffer = Buffer.from(text, "utf8").subarray(0, Math.max(0, maxBytes - 3));
  let end = buffer.length;
  while (end > 0 && (buffer[end - 1]! & 0xc0) === 0x80) end -= 1;
  return `${buffer.subarray(0, end).toString("utf8")}…`;
}

export interface BoundaryChangeJudgeEvidence {
  projectRoot: string;
  /** 发起请求的治理角色（convener）。 */
  requesterRoleId: string;
  runtime: RuntimeKind;
  flowId: string;
  ticketId: string;
  targetRole: Pick<ProjectRoleSummary, "roleId" | "cardPath" | "cardText"> & {
    boundarySource: string;
    boundaryEntries: readonly BoundaryEntry[];
  };
  addPaths: readonly string[];
  removePaths: readonly string[];
  effectiveAdds: readonly string[];
  effectiveRemoves: readonly string[];
  rationale: string;
  facts: GovernanceJudgeFacts;
  teamPlan?: {
    relPath: string;
    version: number;
    recommended?: readonly string[];
    roleRow?: { duty: string; ability: string; writes: string; deps: string };
    planIssues?: readonly string[];
  };
  flow?: {
    relPath: string;
    summaryLines: readonly string[];
  };
}

function buildJudgePreview(ev: BoundaryChangeJudgeEvidence): string {
  const lines: string[] = [
    "【边界变更范围确认（供只读 AI 门禁审核；不是客户卡）】",
    `目标项目角色：${ev.targetRole.roleId}`,
    `发起治理角色：${ev.requesterRoleId}`,
    `flowId：${ev.flowId}｜ticketId：${ev.ticketId}`,
    `请求新增路径：${ev.addPaths.length === 0 ? "（无）" : ""}`,
    ...ev.addPaths.map((path) => `- ${path}`),
    `请求移除路径：${ev.removePaths.length === 0 ? "（无）" : ""}`,
    ...ev.removePaths.map((path) => `- ${path}`),
    "与当前边界比较后的实际变化：",
    ...(ev.effectiveAdds.length === 0 ? ["- 新增：无（已被现有条目覆盖）"] : ev.effectiveAdds.map((path) => `- 新增：${path}`)),
    ...(ev.effectiveRemoves.length === 0 ? ["- 移除：无"] : ev.effectiveRemoves.map((path) => `- 移除：${path}`)),
    `理由：${ev.rationale}`,
    "",
    "目标角色角色卡摘录：",
    truncateUtf8(ev.targetRole.cardText.trim() === "" ? "（无角色卡正文）" : ev.targetRole.cardText.trim(), JUDGE_ROLE_CARD_EXCERPT_BYTES),
    "",
    `目标角色当前边界（来源：${ev.targetRole.boundarySource || "未知"}；共 ${ev.targetRole.boundaryEntries.length} 条）：`,
  ];
  for (const entry of ev.targetRole.boundaryEntries.slice(0, JUDGE_BOUNDARY_ENTRY_LIMIT)) {
    const path = entry.root === "project" ? toPosix(entry.path) : `[${entry.root}] ${toPosix(entry.path)}`;
    lines.push(`- ${path}（${entry.kind}）`);
  }
  if (ev.targetRole.boundaryEntries.length > JUDGE_BOUNDARY_ENTRY_LIMIT) {
    lines.push(`- …（其余 ${ev.targetRole.boundaryEntries.length - JUDGE_BOUNDARY_ENTRY_LIMIT} 条省略）`);
  }
  lines.push("");
  if (ev.teamPlan !== undefined) {
    lines.push(`团队计划：${ev.teamPlan.relPath}（v${ev.teamPlan.version}）`);
    if (ev.teamPlan.recommended !== undefined) lines.push(`- 计划推荐角色集：${ev.teamPlan.recommended.join("、")}`);
    if (ev.teamPlan.roleRow !== undefined) {
      const row = ev.teamPlan.roleRow;
      lines.push(`- 目标角色行：职责=${row.duty}；能力=${row.ability}；写集=${row.writes}；依赖=${row.deps}`);
    }
    if (ev.teamPlan.planIssues !== undefined && ev.teamPlan.planIssues.length > 0) {
      lines.push(`- 计划结构问题：${ev.teamPlan.planIssues.slice(0, 5).join("；")}`);
    }
  } else {
    lines.push("团队计划：未找到可读的 docs/scheduling/<flowId>-team-vN.md（未纳入证据包）。");
  }
  if (ev.flow !== undefined) {
    lines.push(`流程摘要：${ev.flow.relPath}`);
    for (const line of ev.flow.summaryLines.slice(0, JUDGE_FLOW_STEP_LIMIT)) lines.push(`- ${line}`);
  } else {
    lines.push("流程摘要：无可解析的 docs/flows/<flowId>.yaml（未纳入证据包）。");
  }
  lines.push("");
  lines.push(
    "审核口径：只读核对请求的精确路径/理由是否与角色卡、当前边界、团队计划与流程一致，" +
      "是否顺带扩权或触碰治理关键路径。approve 只表示同意把请求交给组队，组队仍按 appointment-write 逐路径确认；" +
      "deny/manual/超时/不可用一律不派发、不自动放行。",
  );
  return truncateUtf8(lines.join("\n"), JUDGE_PREVIEW_MAX_BYTES);
}

/**
 * 构造 AI 门禁的治理判断请求（`createGovernanceJudge` 驱动的只读会话）。
 * 使用 `intent-confirm` 卡种：见文件头「为什么用 intent-confirm」。
 */
export function buildBoundaryChangeJudgeRequest(ev: BoundaryChangeJudgeEvidence): GovernanceJudgeRequest {
  const preview = buildJudgePreview(ev);
  const card: CustomerInputRequest = {
    kind: "choice",
    title: `边界变更范围确认：项目角色「${ev.targetRole.roleId}」精确增删写路径（ticket ${ev.ticketId}）`,
    question:
      `请求为项目角色「${ev.targetRole.roleId}」新增 ${ev.effectiveAdds.length} 条、移除 ${ev.effectiveRemoves.length} 条写路径。` +
      "该变更是否与当前流程/团队计划和角色卡一致、且没有顺带扩权？",
    options: [
      { id: "confirm", label: "确认：同意交给组队按 appointment-write 逐路径确认" },
      { id: "revise", label: "退回统筹修改请求" },
    ],
    cardKind: "intent-confirm",
    flowId: ev.flowId,
    preview,
  };
  const artifacts = {
    ...(ev.teamPlan !== undefined ? { teamPlanPath: ev.teamPlan.relPath } : {}),
    ...(ev.flow !== undefined ? { flowPath: ev.flow.relPath } : {}),
  };
  return {
    group: "decision",
    cardKind: "intent-confirm",
    roleId: ev.requesterRoleId,
    projectRoot: ev.projectRoot,
    runtime: ev.runtime,
    governanceModel: "trio",
    flowId: ev.flowId,
    turnText: ev.rationale,
    card,
    ...(Object.keys(artifacts).length > 0 ? { artifacts } : {}),
    facts: ev.facts,
    at: new Date().toISOString(),
  };
}

function boundedFactText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return truncateUtf8(trimmed, 128);
}

/**
 * 构造 AI 门禁审核所需的 `GovernanceJudgeFacts`（有界、机读）。
 *
 * ⚠️ 与编排私有 `governance-judge-facts.ts::buildGovernanceJudgeFacts` 保持**被比对字段**一致：
 * `buildDecisionEvidencePacket` 会用重读账本重算这些字段并核对请求事实，任一不一致即 `evidence-conflict`
 * （fail-closed）。该 helper 未随 Pipeline 公共出口导出（不能由桌面直接 import 编排私有 common），
 * 故这里只复算**参与比对**的四个字段（ledgerErrors / proposalDecision / appointmentTargetRoleIds /
 * unresolvedClarificationCount），并附展示用字段；如编排导出该 helper，应改为只读复用而不是继续复制。
 */
export function boundaryChangeJudgeFacts(input: {
  flowId: string;
  ledgerEntries: readonly GovernanceLedgerEntry[];
  ledgerErrors: number;
}): GovernanceJudgeFacts {
  let proposalDecision: GovernanceJudgeFacts["proposalDecision"];
  let appointmentTargetRoleIds: string[] | undefined;
  const dispatched: string[] = [];
  const latestDecisionKinds: string[] = [];
  let pendingClarifications = 0;

  for (const entry of input.ledgerEntries) {
    if (entry === null || typeof entry !== "object") continue;
    const sameFlow = entry.flowId === input.flowId;
    if (entry.kind === "customer.decision") {
      const decisionKind = boundedFactText(entry.decisionKind);
      if (decisionKind !== undefined) {
        latestDecisionKinds.push(decisionKind);
        if (latestDecisionKinds.length > 20) latestDecisionKinds.shift();
      }
      if (!sameFlow) continue;
      switch (entry.decisionKind) {
        case "proposal-accept":
          proposalDecision = "accepted";
          break;
        case "proposal-accept-quick":
          proposalDecision = "accepted-quick";
          break;
        case "proposal-revise":
          proposalDecision = "revise";
          break;
        case "proposal-reject":
          proposalDecision = "reject";
          break;
        default:
          break;
      }
      if (entry.decisionKind === "appointment" && Array.isArray(entry.targetRoleIds)) {
        const bounded: string[] = [];
        const seen = new Set<string>();
        for (const value of entry.targetRoleIds) {
          const text = boundedFactText(value);
          if (text === undefined || seen.has(text)) continue;
          seen.add(text);
          bounded.push(text);
          if (bounded.length >= 50) break;
        }
        appointmentTargetRoleIds = bounded.length > 0 ? bounded : undefined;
      }
      continue;
    }
    if (!sameFlow) continue;
    if (entry.kind === "dispatch.accepted") {
      const stepId = boundedFactText(entry.stepId);
      if (stepId !== undefined && !dispatched.includes(stepId) && dispatched.length < 50) dispatched.push(stepId);
      continue;
    }
    if (entry.kind === "clarification.requested") {
      pendingClarifications += 1;
      continue;
    }
    if (entry.kind === "intent.handed-off" && entry.handoffKind === "clarification" && pendingClarifications > 0) {
      pendingClarifications -= 1;
    }
  }

  return {
    governanceModel: "trio",
    flowId: input.flowId,
    ledgerErrors: input.ledgerErrors,
    unresolvedClarificationCount: Math.max(0, pendingClarifications),
    latestDecisionKinds,
    ...(proposalDecision !== undefined ? { proposalDecision } : {}),
    ...(appointmentTargetRoleIds !== undefined ? { appointmentTargetRoleIds } : {}),
    ...(dispatched.length > 0 ? { dispatchedStepIds: dispatched } : {}),
  };
}
