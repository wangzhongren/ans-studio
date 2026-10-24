// src/common/编排/flow-state.ts
// **Flow YAML 契约**（2026-10-19 客户决定「这些全部改成yaml」）。
//
// 背景：真机反复出现流程单 Markdown 表解析问题——`verification` 保留字被执行步骤占用、
// `verification-evidence` 缺 `dispatch.accepted`、`aborted/failed` 行挡住收尾门。根因是
// 「机器状态」与「人读视图」混在 Markdown 表格里，靠正则取首个 token 判定。
//
// 本模块钉死唯一机器状态：`docs/flows/<flowId>.yaml`。
//   · `docs/flows/<flowId>.md` 仅人读视图（可由 YAML 渲染 / 由 Steward 编写），应用**不解析它做判定**；
//   · 证据类型由 flow 中显式的 `kind` 决定，**不再按 stepId 前缀猜**；
//   · 未知字段 / 未知枚举 / 缺必填 ⇒ 校验失败（返回具体 path + message），不静默忽略。
//
// 分层：本模块是编排私有 common；桌面经 `src/pipeline/orchestration/flow-state.ts` 薄再导出消费，
// 不跨角色直接 import 私有 common。只读复用仓库既有 `yaml` 依赖（package.json `yaml@2.9.0`）。

import { parse as parseYaml } from "yaml";
import { GOVERNANCE_SLUG_PATTERN } from "../../model/runtime.ts";
import type { GovernanceLedgerEntry } from "./governance-ledger.ts";

// —————————————————————— 枚举与形状 ——————————————————————

/** 质量档位（评审 §质量：生产级为默认；原型档须客户明确选择）。 */
export const FLOW_QUALITY_TIERS = ["prototype", "production"] as const;
export type FlowQualityTier = (typeof FLOW_QUALITY_TIERS)[number];

/**
 * 步骤类型（决定完成证据种类；**不再按 stepId 前缀猜**）：
 *   · `dispatch`          应用派发给项目角色的执行步骤 → 账本 `dispatch.accepted`；
 *   · `customer-decision` 客户决定步骤（提案接受/任命等） → 账本 `customer.decision`；
 *   · `artifact`          产物步骤（团队计划/契约冻结/流程写入/readiness/标准/报告/变更包等） → 账本 `artifact.observed`；
 *   · `acceptance`        验收步骤（保留 id `verification`/`acceptance`） → 账本 `customer.decision{decisionKind:"acceptance"}`。
 *
 * 2026-10-22 治理分工第 1/3/5 项（方案 §5.4）：**枚举不变**，新流程用 step id + 现有 kind 表达：
 *   · `team-plan`（Convener，artifact；evidence.ref = `docs/scheduling/<flowId>-team-v1.md`）
 *   · `appointment`（Convener，customer-decision；evidence.ref = `appointment`）
 *   · `role-cards`（Crew/Nominator，dispatch；应用派发时写 `dispatch.accepted`）
 *   · `role-readiness`（Convener，artifact；ref = `docs/scheduling/<flowId>-readiness-v1.md`）
 *   · `acceptance-criteria`（Verifier，artifact；ref = `docs/acceptance/<flowId>-criteria-v1.md`）
 *   · `change-package`（Convener，artifact；ref = `docs/scheduling/<flowId>-change-v1.md`）
 *   · `verification-evidence`（产出角色，artifact；真实启动/演示证据路径）
 *   · `verification`（保留验收步骤，kind acceptance）
 *   · `delivery-*`（项目角色，dispatch）
 * 旧版 Markdown 流程单的**词形映射**（桌面 `app/desktop/governance-advance.ts::flowStepEvidenceKind`）须同步：
 * `team-plan*` → artifact（新增）；旧 `nomination*` → decision 保留（legacy）。readiness 在新约定下是 artifact；
 * 该映射的实件属桌面窗口（阶段 D），本模块只登记约定，不复制第二份映射。
 */
export const FLOW_STEP_KINDS = ["dispatch", "customer-decision", "artifact", "acceptance"] as const;
export type FlowStepKind = (typeof FLOW_STEP_KINDS)[number];

/**
 * 步骤状态。`superseded` 是唯一「不参与完成判定」的状态：被 retake/重派取代的旧步骤必须显式标
 * `superseded`（旧 Markdown 的 `cancelled` 迁移时映射为此值）；`failed/blocked/aborted` 未标
 * `superseded` 时仍 fail-closed（挡住收尾门）。
 */
export const FLOW_STEP_STATUSES = [
  "pending",
  "dispatched",
  "delivered",
  "done",
  "superseded",
  "failed",
  "blocked",
  "aborted",
] as const;
export type FlowStepStatus = (typeof FLOW_STEP_STATUSES)[number];

/** 证据种类：与步骤 `kind` 一一对应（`acceptance` 对应验收客户决定）。 */
export const FLOW_EVIDENCE_KINDS = ["dispatch", "customer-decision", "artifact", "acceptance"] as const;
export type FlowEvidenceKind = (typeof FLOW_EVIDENCE_KINDS)[number];

/** 验收步骤的保留 id（只能有一个；执行/证据步骤不得占用）。 */
export const RESERVED_ACCEPTANCE_STEP_IDS = ["verification", "acceptance"] as const;
export type ReservedAcceptanceStepId = (typeof RESERVED_ACCEPTANCE_STEP_IDS)[number];

/**
 * flowId / 步骤 id 形状（**单一来源**：运行时核心 `src/model/runtime.ts` 的 `GOVERNANCE_SLUG_PATTERN`；
 * 2026-10-22 收紧为禁止首/尾连字符）。错误文案经 `${FLOW_ID_RE}` 自动展示现行正则。
 */
const FLOW_ID_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);

/** 可作 `customer-decision` 证据的账本决定类型（`unclassified` 不是证据）。 */
const CUSTOMER_DECISION_KIND_REFS: ReadonlySet<string> = new Set([
  "proposal-accept",
  "proposal-accept-quick",
  "proposal-revise",
  "proposal-reject",
  "appointment",
  "appointment-write",
  "schedule-write",
  "acceptance",
  "intent-confirm",
  "migration",
]);

/** 可计为「已完成」的客户决定结果（与桌面 `governance-advance.ts` 同口径）。 */
const RESOLVED_CUSTOMER_DECISIONS: ReadonlySet<string> = new Set([
  "accepted",
  "accepted-quick",
  "appointed",
]);

/** Flow YAML 的项目相对路径（唯一机器状态）。 */
export function flowStatePath(flowId: string): string {
  return `docs/flows/${flowId}.yaml`;
}

/** 是否为验收步骤保留 id。 */
export function isReservedAcceptanceStepId(value: unknown): value is ReservedAcceptanceStepId {
  return typeof value === "string" && (RESERVED_ACCEPTANCE_STEP_IDS as readonly string[]).includes(value);
}

/** 步骤证据（`ref` 是对应账本记录的匹配键，见文件头与 `validateFlowEvidence`）。 */
export interface FlowStepEvidence {
  kind: FlowEvidenceKind;
  /**
   * 账本匹配键：
   *   · `dispatch`          → `dispatch.accepted.stepId`
   *   · `customer-decision` → `customer.decision.decisionKind`
   *   · `artifact`          → `artifact.observed.artifactPath`
   *   · `acceptance`        → 固定 `"acceptance"`（`customer.decision.decisionKind`）
   */
  ref: string;
}

/** 流程步骤（YAML 步骤项；未知字段一律校验失败）。 */
export interface FlowStateStep {
  id: string;
  title: string;
  owner: string;
  kind: FlowStepKind;
  status: FlowStepStatus;
  evidence?: FlowStepEvidence;
  /**
   * 本步骤取代了哪些旧步骤（可选；须指向存在的步骤）。
   * 与 `supersededBy` 是**同一替代关系的两个方向**：同一对步骤双写合法且推荐（归一化为一条边）。
   */
  supersedes?: string[];
  /**
   * 本步骤被哪个新步骤取代（可选；须指向存在的步骤）。
   * 与 `supersedes` 成对：旧步骤写 `supersededBy: 新id`、新步骤写 `supersedes: [旧id]` 是推荐写法。
   */
  supersededBy?: string;
  /**
   * 并行组（可选；2026-10-22 角色粒度/MapReduce 方案 A）：`map-<slug>` 或 `reduce`。
   * 旧 flow 不填 ⇒ 字段缺席，解析/序列化/门禁行为逐字不变；不是新的 `FlowStepKind`。
   */
  parallelGroup?: string;
  /**
   * 前置 step id 列表（可选；仅承载/静态校验/派发前置 `done`）。
   * 目标必须存在、不得自依赖/重复/成环；旧 flow 不填 ⇒ 不新增任何检查。
   */
  dependsOn?: string[];
}

/**
 * Flow YAML 文档（`docs/flows/<flowId>.yaml`）。
 * 顶层 `status` 仅供人读，**不参与任何机器判定**（机器判定只看 `steps[].status` 与账本）。
 */
export interface FlowState {
  flowId: string;
  version: number;
  qualityTier: FlowQualityTier;
  status?: string;
  /**
   * 发布元数据标记（可选；缺省 = false = 非发布，2026-10-24 P0-1；同日客户修订：所有变更独立验收）。
   *
   * **`release` 仅可选发布元数据，不是独立验收的启动条件**：所有变更（含非发布）在流程齐备后
   * 都由应用按验收门派 Proof / 验收并启动 verifier criteria；该标记不改变验收范围。
   * 标记只能由 Steward 用既有 `request_confirmation(cardKind=schedule-write)` 写一份只把 release
   * 从 false/缺省改为 true、其余字段/步骤不变的 flow YAML（应用做受控扩展校验）；不是新 step kind、
   * 不是账本 kind、不是新卡片种类。
   */
  release?: boolean;
  steps: FlowStateStep[];
}

/** 校验错误（`path` 为 YAML 文档内路径，如 `steps[2].status`；`$` 表示文档根）。 */
export interface FlowStateError {
  path: string;
  message: string;
}

export type ParseFlowStateResult =
  | { ok: true; flow: FlowState }
  | {
      ok: false;
      errors: FlowStateError[];
      /** 同 `errors` 的单串摘要（`path: message；…`；桌面可直接展示/记诊断）。 */
      error: string;
    };

/**
 * 账本输入：既接受纯条目数组，也接受 `readGovernanceLedger` 的 `{ entries, errors }` 结果。
 * 给出 `errors` 且非空 ⇒ 调用方必须以「账本不可读」fail-closed（不猜内容）。
 */
export type FlowLedgerInput =
  | readonly GovernanceLedgerEntry[]
  | { entries: readonly GovernanceLedgerEntry[]; errors?: readonly string[] };

function ledgerOf(input: FlowLedgerInput): {
  entries: readonly GovernanceLedgerEntry[];
  errors: readonly string[];
} {
  if (Array.isArray(input)) return { entries: input, errors: [] };
  const snapshot = input as { entries?: readonly GovernanceLedgerEntry[]; errors?: readonly string[] };
  return {
    entries: Array.isArray(snapshot.entries) ? snapshot.entries : [],
    errors: Array.isArray(snapshot.errors) ? snapshot.errors : [],
  };
}

export interface FlowEvidenceIssue {
  stepId: string;
  /** YAML 文档内路径（如 `steps[1].evidence`）。 */
  path: string;
  message: string;
}

export type ValidateFlowEvidenceResult =
  | { ok: true }
  | { ok: false; issues: FlowEvidenceIssue[] };

/**
 * 收尾门判定：
 *   · `ready: true`  = 流程齐备，可进入验收（自动派 Proof / 出验收卡）；
 *   · `ready: false` = 阻塞或已收口，`issues` 是可读原因（不靠模型自报）。
 */
export type EvaluateFlowCompletionResult =
  | { ready: true }
  | { ready: false; issues: string[] };

// —————————————————————— 解析与校验 ——————————————————————

const TOP_LEVEL_KEYS = new Set(["flowId", "version", "qualityTier", "status", "release", "steps"]);
const STEP_KEYS = new Set([
  "id",
  "title",
  "owner",
  "kind",
  "status",
  "evidence",
  "supersedes",
  "supersededBy",
  "parallelGroup",
  "dependsOn",
]);
const EVIDENCE_KEYS = new Set(["kind", "ref"]);

/** 并行组语法（MapReduce 方案 A）：`map-<slug>` 或 `reduce`。 */
const PARALLEL_GROUP_RE = /^(?:map-[a-z][a-z0-9-]*|reduce)$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function normalizeRelPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** 项目相对路径形状（只做词法判定；不访问文件系统）。 */
function isProjectRelativePath(value: string): boolean {
  if (value === "" || value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) return false;
  const normalized = normalizeRelPath(value);
  if (normalized === "" || normalized.startsWith("../") || normalized === "..") return false;
  const segments = normalized.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function isSlug(value: string): boolean {
  return FLOW_ID_RE.test(value);
}

function enumList(values: readonly string[]): string {
  return values.join(" | ");
}

function formatFlowErrors(errors: readonly FlowStateError[]): string {
  return errors.map((error) => `${error.path}: ${error.message}`).join("；");
}

function flowParseFailure(errors: FlowStateError[]): ParseFlowStateResult {
  return { ok: false, errors, error: formatFlowErrors(errors) };
}

/**
 * 解析并校验 Flow YAML 文本。
 *
 * @param text    `docs/flows/<flowId>.yaml` 的完整全文
 * @param flowId  文件名推导出的 flowId（用于一致性校验）
 *
 * 校验规则（确定性，逐条对应客户决定）：
 *   1. flowId 与文件名一致；version 正整数；qualityTier ∈ {prototype, production}；steps 非空、id 唯一；
 *      可选 `release` 必须是布尔（缺省 = false = 非发布；仅发布元数据，不是独立验收的启动条件）；
 *   2. 保留 id `verification`/`acceptance` 至多一个、必须是 `kind: acceptance`、初始 `status: pending`
 *      （完成后允许 `done` 且必须带 `acceptance` 证据）；执行/证据步骤不得占用这两个 id；
 *   3. `kind`/`status`/`evidence.kind` 严格枚举；`done` 步骤必须有 evidence，且 evidence.kind 与步骤
 *      kind 对应；`pending/dispatched/delivered` 不要求 evidence；
 *   4. `superseded` 不参与完成判定；`supersedes`（新→旧）与 `supersededBy`（旧→新）是同一替代关系的
 *      两个方向——同一对步骤**双写合法且推荐**（归一化为「旧→新」一条边，不误报环）；只写一侧仍合法；
 *      `supersedes`/`supersededBy` 必须指向存在的步骤、不得自指/重复/形成真环；两侧矛盾（如
 *      A.supersededBy=B 但 B.supersedes 明确列出且不含 A）⇒ 具体路径拒绝；`failed/blocked/aborted`
 *      未标 `superseded` 仍 fail-closed；
 *   5. 未知字段/未知枚举/缺必填 ⇒ 校验失败，返回具体路径与原因。
 */
export function parseFlowStateYaml(text: string, flowId: string): ParseFlowStateResult {
  const errors: FlowStateError[] = [];
  const push = (path: string, message: string): void => {
    errors.push({ path, message });
  };

  if (typeof flowId !== "string" || !isSlug(flowId)) {
    push("flowId", `文件名 flowId 非法：${typeof flowId === "string" ? `"${flowId}"` : String(flowId)}；要求 ${FLOW_ID_RE}`);
  }
  if (typeof text !== "string" || text.trim() === "") {
    push("$", "YAML 文本为空");
    return flowParseFailure(errors);
  }

  let document: unknown;
  try {
    document = parseYaml(text, { uniqueKeys: true, maxAliasCount: 100 });
  } catch (err) {
    push("$", `YAML 语法错误：${err instanceof Error ? err.message : String(err)}`);
    return flowParseFailure(errors);
  }
  if (!isPlainObject(document)) {
    push("$", "YAML 根节点必须是对象（flowId/version/qualityTier/steps）");
    return flowParseFailure(errors);
  }

  // —— 顶层字段 ——
  for (const key of Object.keys(document)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      push(key, `未知字段 ${key}；顶层只允许 ${[...TOP_LEVEL_KEYS].join(" / ")}`);
    }
  }

  const rawFlowId = document.flowId;
  if (typeof rawFlowId !== "string" || rawFlowId.trim() === "") {
    push("flowId", "缺少必填字段 flowId（字符串）");
  } else if (rawFlowId.trim() !== flowId) {
    push("flowId", `flowId 与文件名不一致：YAML 为 "${rawFlowId.trim()}"，文件名为 "${flowId}"`);
  }

  const rawVersion = document.version;
  if (typeof rawVersion !== "number" || !Number.isInteger(rawVersion) || rawVersion < 1) {
    push("version", `version 必须是正整数（当前 ${JSON.stringify(rawVersion)}）`);
  }

  const qualityTier = document.qualityTier;
  if (typeof qualityTier !== "string" || !(FLOW_QUALITY_TIERS as readonly string[]).includes(qualityTier)) {
    push("qualityTier", `qualityTier 必须是 ${enumList(FLOW_QUALITY_TIERS)}（当前 ${JSON.stringify(qualityTier)}）`);
  }

  if (document.status !== undefined && (typeof document.status !== "string" || document.status.trim() === "")) {
    push("status", "status 为可选人读字段；给出时必须是非空字符串");
  }

  // release（2026-10-24 P0-1；同日客户修订：仅可选发布元数据，不是独立验收的启动条件）：
  // 可选布尔；缺省 = false（非发布）。未知类型 fail-closed。
  if (document.release !== undefined && typeof document.release !== "boolean") {
    push(
      "release",
      `release 必须是布尔值 true / false（缺省 = 非发布；当前 ${JSON.stringify(document.release)}）`,
    );
  }

  // —— steps ——
  const rawSteps = document.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    push("steps", "steps 必须是非空数组");
    return flowParseFailure(errors);
  }

  const steps: FlowStateStep[] = [];
  const seenIds = new Set<string>();

  rawSteps.forEach((rawStep, index) => {
    const base = `steps[${index}]`;
    if (!isPlainObject(rawStep)) {
      push(base, "步骤必须是对象");
      return;
    }
    for (const key of Object.keys(rawStep)) {
      if (!STEP_KEYS.has(key)) {
        push(`${base}.${key}`, `未知字段 ${key}；步骤只允许 ${[...STEP_KEYS].join(" / ")}`);
      }
    }

    const id = trimString(rawStep.id);
    if (id === undefined) {
      push(`${base}.id`, "缺少必填字段 id（非空字符串）");
    } else if (!isSlug(id)) {
      push(`${base}.id`, `步骤 id 非法："${id}"；要求 ${FLOW_ID_RE}`);
    } else if (seenIds.has(id)) {
      push(`${base}.id`, `步骤 id 重复："${id}"`);
    } else {
      seenIds.add(id);
    }

    const title = trimString(rawStep.title);
    if (title === undefined) push(`${base}.title`, "缺少必填字段 title（非空字符串）");

    const owner = trimString(rawStep.owner);
    if (owner === undefined) push(`${base}.owner`, "缺少必填字段 owner（非空字符串）");

    const kind = rawStep.kind;
    const kindValid = typeof kind === "string" && (FLOW_STEP_KINDS as readonly string[]).includes(kind);
    if (!kindValid) {
      push(`${base}.kind`, `kind 必须是 ${enumList(FLOW_STEP_KINDS)}（当前 ${JSON.stringify(kind)}）`);
    }

    const status = rawStep.status;
    const statusValid = typeof status === "string" && (FLOW_STEP_STATUSES as readonly string[]).includes(status);
    if (!statusValid) {
      push(`${base}.status`, `status 必须是 ${enumList(FLOW_STEP_STATUSES)}（当前 ${JSON.stringify(status)}）`);
    }

    // —— evidence ——
    let evidence: FlowStepEvidence | undefined;
    if (rawStep.evidence !== undefined) {
      const rawEvidence = rawStep.evidence;
      if (!isPlainObject(rawEvidence)) {
        push(`${base}.evidence`, "evidence 必须是对象 { kind, ref }");
      } else {
        for (const key of Object.keys(rawEvidence)) {
          if (!EVIDENCE_KEYS.has(key)) {
            push(`${base}.evidence.${key}`, `未知字段 ${key}；evidence 只允许 kind / ref`);
          }
        }
        const evidenceKind = rawEvidence.kind;
        const evidenceKindValid =
          typeof evidenceKind === "string" && (FLOW_EVIDENCE_KINDS as readonly string[]).includes(evidenceKind);
        if (!evidenceKindValid) {
          push(
            `${base}.evidence.kind`,
            `evidence.kind 必须是 ${enumList(FLOW_EVIDENCE_KINDS)}（当前 ${JSON.stringify(evidenceKind)}）`,
          );
        }
        const ref = trimString(rawEvidence.ref);
        if (ref === undefined) {
          push(`${base}.evidence.ref`, "缺少必填字段 ref（非空字符串）");
        } else if (evidenceKindValid) {
          if (kindValid && evidenceKind !== kind) {
            push(
              `${base}.evidence.kind`,
              `evidence.kind 必须与步骤 kind 对应：步骤 kind=${String(kind)}，证据 kind=${String(evidenceKind)}`,
            );
          }
          if (evidenceKind === "dispatch" && !isSlug(ref)) {
            push(`${base}.evidence.ref`, `dispatch 证据的 ref 必须是账本 stepId（${FLOW_ID_RE}；当前 "${ref}"）`);
          }
          if (evidenceKind === "customer-decision" && !CUSTOMER_DECISION_KIND_REFS.has(ref)) {
            push(
              `${base}.evidence.ref`,
              `customer-decision 证据的 ref 必须是账本 decisionKind（${[...CUSTOMER_DECISION_KIND_REFS].join(" | ")}；当前 "${ref}"）`,
            );
          }
          if (evidenceKind === "artifact" && !isProjectRelativePath(ref)) {
            push(`${base}.evidence.ref`, `artifact 证据的 ref 必须是项目相对路径（当前 "${ref}"）`);
          }
          if (evidenceKind === "acceptance" && ref !== "acceptance") {
            push(`${base}.evidence.ref`, `acceptance 证据的 ref 固定为 "acceptance"（当前 "${ref}"）`);
          }
        }
        if (evidenceKindValid && ref !== undefined) {
          evidence = { kind: evidenceKind as FlowEvidenceKind, ref };
        }
      }
    }

    // done 必须有证据（执行步骤与验收步骤同一口径：done 表示证据已核对）。
    if (statusValid && status === "done" && evidence === undefined) {
      push(`${base}.evidence`, `步骤状态为 done，必须提供 evidence（kind=${String(kindValid ? kind : "?")}）`);
    }

    // —— supersedes / supersededBy（存在性/成环在全部步骤收集后统一校验） ——
    let supersedes: string[] | undefined;
    if (rawStep.supersedes !== undefined) {
      if (!Array.isArray(rawStep.supersedes)) {
        push(`${base}.supersedes`, "supersedes 必须是步骤 id 数组");
      } else {
        const list: string[] = [];
        const seen = new Set<string>();
        rawStep.supersedes.forEach((item, itemIndex) => {
          const value = trimString(item);
          if (value === undefined || !isSlug(value)) {
            push(`${base}.supersedes[${itemIndex}]`, `supersedes 项必须是合法步骤 id（当前 ${JSON.stringify(item)}）`);
            return;
          }
          if (seen.has(value)) {
            push(`${base}.supersedes[${itemIndex}]`, `supersedes 重复列出步骤 "${value}"`);
            return;
          }
          seen.add(value);
          list.push(value);
        });
        supersedes = list;
      }
    }

    let supersededBy: string | undefined;
    if (rawStep.supersededBy !== undefined) {
      const value = trimString(rawStep.supersededBy);
      if (value === undefined || !isSlug(value)) {
        push(`${base}.supersededBy`, `supersededBy 必须是合法步骤 id（当前 ${JSON.stringify(rawStep.supersededBy)}）`);
      } else {
        supersededBy = value;
      }
    }

    // —— parallelGroup / dependsOn（可选；MapReduce 方案 A） ——
    let parallelGroup: string | undefined;
    if (rawStep.parallelGroup !== undefined) {
      const value = trimString(rawStep.parallelGroup);
      if (value === undefined || !PARALLEL_GROUP_RE.test(value)) {
        push(
          `${base}.parallelGroup`,
          `parallelGroup 必须是 map-<slug> 或 reduce（当前 ${JSON.stringify(rawStep.parallelGroup)}）`,
        );
      } else {
        parallelGroup = value;
      }
    }

    let dependsOn: string[] | undefined;
    if (rawStep.dependsOn !== undefined) {
      if (!Array.isArray(rawStep.dependsOn)) {
        push(`${base}.dependsOn`, "dependsOn 必须是步骤 id 数组");
      } else {
        const list: string[] = [];
        const seen = new Set<string>();
        rawStep.dependsOn.forEach((item, itemIndex) => {
          const value = trimString(item);
          if (value === undefined || !isSlug(value)) {
            push(`${base}.dependsOn[${itemIndex}]`, `dependsOn 项必须是合法步骤 id（当前 ${JSON.stringify(item)}）`);
            return;
          }
          if (seen.has(value)) {
            push(`${base}.dependsOn[${itemIndex}]`, `dependsOn 重复列出步骤 "${value}"`);
            return;
          }
          if (id !== undefined && value === id) {
            push(`${base}.dependsOn[${itemIndex}]`, `步骤不能依赖自己（"${id}"）`);
            return;
          }
          seen.add(value);
          list.push(value);
        });
        dependsOn = list;
      }
    }

    steps.push({
      id: id ?? "",
      title: title ?? "",
      owner: owner ?? "",
      kind: (kindValid ? kind : "dispatch") as FlowStepKind,
      status: (statusValid ? status : "pending") as FlowStepStatus,
      ...(evidence !== undefined ? { evidence } : {}),
      ...(supersedes !== undefined ? { supersedes } : {}),
      ...(supersededBy !== undefined ? { supersededBy } : {}),
      ...(parallelGroup !== undefined ? { parallelGroup } : {}),
      ...(dependsOn !== undefined ? { dependsOn } : {}),
    });
  });

  // —— 保留 id / 验收步骤 ——
  const acceptanceSteps: { step: FlowStateStep; index: number }[] = [];
  steps.forEach((step, index) => {
    const base = `steps[${index}]`;
    if (isReservedAcceptanceStepId(step.id)) {
      if (step.kind !== "acceptance") {
        push(
          `${base}.id`,
          `保留 id "${step.id}" 只能用于验收步骤（kind: acceptance）；当前 kind=${step.kind}。` +
            `执行/证据步骤请改用其他 id（如 ${step.id}-evidence）。`,
        );
      }
    }
    if (step.kind === "acceptance") acceptanceSteps.push({ step, index });
  });
  if (acceptanceSteps.length > 1) {
    const { step, index } = acceptanceSteps[1]!;
    push(`steps[${index}].id`, `验收步骤只能有一个（另一处为 id="${acceptanceSteps[0]!.step.id}"，此处 id="${step.id}"）`);
  }
  for (const { step, index } of acceptanceSteps) {
    if (!isReservedAcceptanceStepId(step.id)) {
      push(`steps[${index}].id`, `验收步骤必须使用保留 id verification / acceptance（当前 "${step.id}"）`);
    }
    // 验收步骤是流程的验收出口：不允许被 superseded（那会让收尾门找不到验收步骤）。
    if (step.status === "superseded") {
      push(
        `steps[${index}].status`,
        "验收步骤不能被标为 superseded（流程必须保留验收出口；待验收保持 pending，验收完成用 done + acceptance 证据）。",
      );
    }
  }

  // —— 替代关系：两侧双写归一 + 一致性 + 成环 ——
  //
  // 2026-10-19 契约修正（门禁引擎 Steward 卡要求双写）：
  //   · `supersededBy`（旧 → 新）与 `supersedes`（新 → 旧）是**同一替代关系的两个方向**；
  //     同一对步骤双写时归一化为「旧 → 新」一条边并去重，**不构成环**；只写一侧仍合法。
  //   · 真正替代环（A→B→C→A，含两节点互指）仍拒绝。
  //   · 两侧互相矛盾（A.supersededBy=B 但 B.supersedes 明确列出且不含 A；或 B.supersedes 含 A 但
  //     A.supersededBy=C≠B）⇒ 具体 path 报错。
  const idToIndex = new Map<string, number>();
  steps.forEach((step, index) => {
    if (step.id !== "" && !idToIndex.has(step.id)) idToIndex.set(step.id, index);
  });

  // —— 依赖图（parallelGroup/dependsOn 静态校验；旧 flow 不填 ⇒ 零检查） ——
  validateDependencyGraph(steps, idToIndex, push);

  /** 新步骤 → 显式列出的旧步骤 → 该列表项下标（用于错误路径）。 */
  const explicitSupersedes = new Map<string, Map<string, number>>();
  const supersededByEdges: Array<{ oldId: string; newId: string; path: string }> = [];

  steps.forEach((step, index) => {
    const base = `steps[${index}]`;
    if (step.supersedes !== undefined) {
      const listed = new Map<string, number>();
      step.supersedes.forEach((target, itemIndex) => {
        if (target === step.id) {
          push(`${base}.supersedes[${itemIndex}]`, `步骤不能取代自己（"${step.id}"）`);
          return;
        }
        if (!idToIndex.has(target)) {
          push(`${base}.supersedes[${itemIndex}]`, `supersedes 指向不存在的步骤 "${target}"`);
          return;
        }
        listed.set(target, itemIndex);
      });
      explicitSupersedes.set(step.id, listed);
    }
    if (step.supersededBy !== undefined) {
      if (step.supersededBy === step.id) {
        push(`${base}.supersededBy`, `步骤不能被自己取代（"${step.id}"）`);
      } else if (!idToIndex.has(step.supersededBy)) {
        push(`${base}.supersededBy`, `supersededBy 指向不存在的步骤 "${step.supersededBy}"`);
      } else {
        supersededByEdges.push({ oldId: step.id, newId: step.supersededBy, path: `${base}.supersededBy` });
      }
    }
  });

  // 一致性：旧侧说「我被 B 取代」，则 B 的显式 supersedes 列表必须包含旧侧（双写或省略列表均合法）。
  for (const edge of supersededByEdges) {
    const listed = explicitSupersedes.get(edge.newId);
    if (listed !== undefined && !listed.has(edge.oldId)) {
      const listedText = listed.size > 0 ? `[${[...listed.keys()].join(", ")}]` : "[]";
      push(
        edge.path,
        `supersededBy 指向 "${edge.newId}"，但 "${edge.newId}".supersedes 明确列出 ${listedText} 且不含 "${edge.oldId}"；两侧矛盾`,
      );
    }
  }
  // 一致性：新侧显式列出「我取代 A」，则 A 的 supersededBy 若存在必须是本步骤。
  for (const [newId, listed] of explicitSupersedes) {
    const newIndex = idToIndex.get(newId);
    if (newIndex === undefined) continue; // 新步骤 id 非法：已有 id 错误
    for (const [oldId, itemIndex] of listed) {
      const oldStep = steps[idToIndex.get(oldId)!]!;
      if (
        oldStep.supersededBy !== undefined &&
        oldStep.supersededBy !== newId &&
        idToIndex.has(oldStep.supersededBy)
      ) {
        push(
          `steps[${newIndex}].supersedes[${itemIndex}]`,
          `"${oldId}".supersededBy="${oldStep.supersededBy}"，与 "${newId}".supersedes 矛盾`,
        );
      }
    }
  }

  // 归一化边：统一为「旧步骤 → 新步骤」；同一对步骤双写只保留一条。
  const edgeSets = new Map<string, Set<string>>();
  const edgePaths = new Map<string, Map<string, string>>();
  for (const step of steps) {
    if (!edgeSets.has(step.id)) edgeSets.set(step.id, new Set());
    if (!edgePaths.has(step.id)) edgePaths.set(step.id, new Map());
  }
  const addEdge = (oldId: string, newId: string, path: string): void => {
    const set = edgeSets.get(oldId);
    if (set === undefined) return;
    set.add(newId);
    const paths = edgePaths.get(oldId)!;
    if (!paths.has(newId)) paths.set(newId, path);
  };
  for (const edge of supersededByEdges) addEdge(edge.oldId, edge.newId, edge.path);
  for (const [newId, listed] of explicitSupersedes) {
    const newIndex = idToIndex.get(newId);
    if (newIndex === undefined) continue;
    for (const [oldId, itemIndex] of listed) {
      addEdge(oldId, newId, `steps[${newIndex}].supersedes[${itemIndex}]`);
    }
  }
  const edges = new Map<string, string[]>();
  for (const [id, set] of edgeSets) edges.set(id, [...set]);
  detectSupersedeCycles(steps, edges, edgePaths, push);

  if (errors.length > 0) return flowParseFailure(errors);

  return {
    ok: true,
    flow: {
      flowId,
      version: rawVersion as number,
      qualityTier: qualityTier as FlowQualityTier,
      ...(typeof document.status === "string" ? { status: document.status.trim() } : {}),
      ...(typeof document.release === "boolean" ? { release: document.release } : {}),
      steps,
    },
  };
}

/**
 * `dependsOn` / `parallelGroup` 静态校验（MapReduce 方案 A；仅对有声明字段的步骤/flow 生效）：
 *   · dependsOn 目标存在（自依赖/重复在解析时已报）、无环；
 *   · 同一 `map-*` 组内步骤之间不得有依赖路径；
 *   · 每个 reduce 步骤（dispatch/artifact，验收除外）直接/传递依赖全部 `map-*` dispatch 步骤；
 *   · Map 步骤不得依赖 Reduce 步骤；
 *   · 含 Map dispatch 步骤的新契约 flow 必须有 `contract-freeze`，且每个 Map dispatch 步骤都（直接/传递）依赖它。
 * 旧 flow（无 parallelGroup/dependsOn）不触发任何检查。
 */
function validateDependencyGraph(
  steps: readonly FlowStateStep[],
  idToIndex: ReadonlyMap<string, number>,
  push: (path: string, message: string) => void,
): void {
  if (!steps.some((step) => step.parallelGroup !== undefined || step.dependsOn !== undefined)) return;

  const byId = new Map<string, FlowStateStep>();
  for (const step of steps) {
    if (step.id !== "" && !byId.has(step.id)) byId.set(step.id, step);
  }
  const edges = new Map<string, string[]>();
  for (const step of steps) {
    if (step.dependsOn === undefined) continue;
    const deps: string[] = [];
    step.dependsOn.forEach((dep, itemIndex) => {
      if (!byId.has(dep)) {
        const index = idToIndex.get(step.id);
        push(`steps[${index ?? "?"}].dependsOn[${itemIndex}]`, `dependsOn 指向不存在的步骤 "${dep}"`);
        return;
      }
      deps.push(dep);
    });
    edges.set(step.id, deps);
  }

  // 环检测（依赖边：步骤 → 前置；DFS 三色）。
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const reported = new Set<string>();
  const visit = (id: string): void => {
    const current = state.get(id);
    if (current === 2) return;
    if (current === 1) {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start), id];
      const key = [...new Set(cycle)].sort().join("\u0000");
      if (!reported.has(key)) {
        reported.add(key);
        push(`steps[${idToIndex.get(id) ?? "?"}].dependsOn`, `dependsOn 形成环：${cycle.join(" → ")}`);
      }
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const dep of edges.get(id) ?? []) visit(dep);
    stack.pop();
    state.set(id, 2);
  };
  for (const step of steps) {
    if (step.id !== "") visit(step.id);
  }

  /** 传递前置集合（不含自身；用 visited 防御环）。 */
  const reachable = (id: string): Set<string> => {
    const result = new Set<string>();
    const walk = (current: string): void => {
      for (const dep of edges.get(current) ?? []) {
        if (result.has(dep)) continue;
        result.add(dep);
        walk(dep);
      }
    };
    walk(id);
    return result;
  };
  const reachableCache = new Map<string, Set<string>>();
  const reach = (id: string): Set<string> => {
    const cached = reachableCache.get(id);
    if (cached !== undefined) return cached;
    const computed = reachable(id);
    reachableCache.set(id, computed);
    return computed;
  };

  const mapSteps = steps.filter(
    (step) =>
      step.status !== "superseded" &&
      typeof step.parallelGroup === "string" &&
      step.parallelGroup.startsWith("map-"),
  );
  const reduceSteps = steps.filter(
    (step) => step.status !== "superseded" && step.parallelGroup === "reduce",
  );

  // 同一 map-* 组内不得有依赖路径。
  const groups = new Map<string, FlowStateStep[]>();
  for (const step of mapSteps) {
    const group = step.parallelGroup!;
    const list = groups.get(group) ?? [];
    list.push(step);
    groups.set(group, list);
  }
  for (const [group, groupSteps] of groups) {
    for (let i = 0; i < groupSteps.length; i += 1) {
      for (let j = i + 1; j < groupSteps.length; j += 1) {
        const a = groupSteps[i]!;
        const b = groupSteps[j]!;
        if (reach(a.id).has(b.id) || reach(b.id).has(a.id)) {
          push(
            `steps[${idToIndex.get(a.id) ?? "?"}].dependsOn`,
            `同一 ${group} 组内的步骤 ${a.id} 与 ${b.id} 之间存在依赖路径（同组必须互相独立）`,
          );
        }
      }
    }
  }

  // Map 步骤不得依赖 Reduce 步骤（直接/传递）。
  for (const step of mapSteps) {
    for (const target of reach(step.id)) {
      const targetStep = byId.get(target);
      if (targetStep?.parallelGroup === "reduce") {
        push(
          `steps[${idToIndex.get(step.id) ?? "?"}].dependsOn`,
          `Map 步骤 ${step.id} 不得依赖 Reduce 步骤 ${target}`,
        );
      }
    }
  }

  // Reduce 步骤（dispatch/artifact；验收除外）必须覆盖全部 Map dispatch 步骤。
  const mapDispatchSteps = mapSteps.filter((step) => step.kind === "dispatch");
  const reduceWorkSteps = reduceSteps.filter((step) => step.kind === "dispatch" || step.kind === "artifact");
  for (const step of reduceWorkSteps) {
    const deps = reach(step.id);
    const missing = mapDispatchSteps.filter((mapStep) => !deps.has(mapStep.id));
    if (missing.length > 0) {
      push(
        `steps[${idToIndex.get(step.id) ?? "?"}].dependsOn`,
        `Reduce 步骤 ${step.id} 必须直接或传递依赖全部 Map dispatch 步骤（缺：${missing.map((item) => item.id).join("、")}）`,
      );
    }
  }

  // 新契约 flow：有 Map dispatch 步骤 ⇒ contract-freeze 必须存在且被每个 Map dispatch 依赖。
  if (mapDispatchSteps.length > 0) {
    const contractFreeze = byId.get("contract-freeze");
    if (contractFreeze === undefined || contractFreeze.status === "superseded") {
      push("steps", "新契约 flow 的 Map 交付步骤必须先依赖 contract-freeze：缺少 contract-freeze 步骤");
    } else {
      for (const step of mapDispatchSteps) {
        if (!reach(step.id).has("contract-freeze")) {
          push(
            `steps[${idToIndex.get(step.id) ?? "?"}].dependsOn`,
            `新契约 flow 的 Map 交付步骤 ${step.id} 必须（直接或传递）依赖 contract-freeze`,
          );
        }
      }
    }
  }
}


function detectSupersedeCycles(
  steps: readonly FlowStateStep[],
  edges: ReadonlyMap<string, readonly string[]>,
  edgePaths: ReadonlyMap<string, ReadonlyMap<string, string>>,
  push: (path: string, message: string) => void,
): void {
  const state = new Map<string, 1 | 2>(); // 1 = visiting, 2 = done
  const stack: string[] = [];
  const reported = new Set<string>();

  const visit = (id: string, incomingPath?: string): void => {
    const current = state.get(id);
    if (current === 2) return;
    if (current === 1) {
      const cycleStart = stack.indexOf(id);
      const cycle = [...stack.slice(cycleStart), id];
      const key = [...new Set(cycle)].sort().join("\u0000");
      if (!reported.has(key)) {
        reported.add(key);
        // 报「闭合这条边的来源」的具体 YAML 路径（双写时可能来自任一侧）。
        push(incomingPath ?? "supersedes", `替代关系形成环：${cycle.join(" → ")}`);
      }
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const next of edges.get(id) ?? []) visit(next, edgePaths.get(id)?.get(next));
    stack.pop();
    state.set(id, 2);
  };

  for (const step of steps) {
    if (step.id !== "") visit(step.id);
  }
}

// —————————————————————— 证据对账 ——————————————————————

function ledgerEntryMatchesEvidence(
  flowId: string,
  evidence: FlowStepEvidence,
  entries: readonly GovernanceLedgerEntry[],
): string | undefined {
  switch (evidence.kind) {
    case "dispatch": {
      const found = entries.some(
        (entry) => entry.kind === "dispatch.accepted" && entry.flowId === flowId && entry.stepId === evidence.ref,
      );
      return found ? undefined : `账本缺少 dispatch.accepted（flowId=${flowId}，stepId=${evidence.ref}）`;
    }
    case "customer-decision": {
      const found = entries.some(
        (entry) =>
          entry.kind === "customer.decision" &&
          entry.flowId === flowId &&
          entry.decisionKind === evidence.ref &&
          RESOLVED_CUSTOMER_DECISIONS.has(entry.customerDecision ?? ""),
      );
      return found
        ? undefined
        : `账本缺少已结算的客户决定（flowId=${flowId}，decisionKind=${evidence.ref}，` +
            `customerDecision ∈ ${[...RESOLVED_CUSTOMER_DECISIONS].join(" / ")}）`;
    }
    case "artifact": {
      const target = normalizeRelPath(evidence.ref);
      const found = entries.some(
        (entry) =>
          entry.kind === "artifact.observed" &&
          typeof entry.artifactPath === "string" &&
          normalizeRelPath(entry.artifactPath) === target &&
          (entry.flowId === undefined || entry.flowId === flowId),
      );
      return found ? undefined : `账本缺少 artifact.observed（path=${evidence.ref}）`;
    }
    case "acceptance": {
      const found = entries.some(
        (entry) =>
          entry.kind === "customer.decision" &&
          entry.flowId === flowId &&
          entry.decisionKind === "acceptance" &&
          entry.customerDecision === "accepted",
      );
      return found ? undefined : `账本缺少客户验收决定（flowId=${flowId}，decisionKind=acceptance，customerDecision=accepted）`;
    }
    default:
      return `未知证据种类：${String((evidence as { kind?: unknown }).kind)}`;
  }
}

/**
 * 账本证据对账：账本 `dispatch.accepted` / `customer.decision` / `artifact.observed` 与 flow 中
 * **显式 `evidence.ref`** 逐条匹配（不再按 stepId 前缀猜证据类型）。
 *
 * 口径：
 *   · 只校验 `status: done` 的步骤（`done` 必须有 evidence；未 done 步骤若提前写了 evidence，
 *     parse 只校验形状/类型，不要求账本已有记录——例如验收步骤提前声明 `acceptance` 证据）；
 *   · `status: superseded` 的步骤不参与；
 *   · `customer-decision` 只认已结算结果（accepted/accepted-quick/appointed），拒绝/待定不算完成证据；
 *   · `artifact` 匹配项目相对路径（容忍 `./` 与反斜杠），账本条目无 flowId 时也接受（应用扫描产物时
 *     不一定带 flow 元数据）。
 */
export function validateFlowEvidence(
  flow: FlowState,
  ledgerInput: FlowLedgerInput,
): ValidateFlowEvidenceResult {
  const { entries, errors } = ledgerOf(ledgerInput);
  if (errors.length > 0) {
    return {
      ok: false,
      issues: [{ stepId: "", path: "ledger", message: "治理账本不可读或存在坏行，无法对账证据" }],
    };
  }
  const issues: FlowEvidenceIssue[] = [];
  flow.steps.forEach((step, index) => {
    if (step.status === "superseded") return;
    if (step.status !== "done") return;
    if (step.evidence === undefined) {
      issues.push({
        stepId: step.id,
        path: `steps[${index}].evidence`,
        message: `步骤状态为 done，但没有 evidence（kind 应为 ${step.kind}）`,
      });
      return;
    }
    const mismatch = ledgerEntryMatchesEvidence(flow.flowId, step.evidence, entries);
    if (mismatch !== undefined) {
      issues.push({ stepId: step.id, path: `steps[${index}].evidence`, message: mismatch });
    }
  });
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

// —————————————————————— 收尾门 ——————————————————————

const BLOCKING_STATUSES: ReadonlySet<FlowStepStatus> = new Set(["failed", "blocked", "aborted"]);

/**
 * 最新验收决定（2026-10-23 验收返工路由方案 v1 §5.1.2 / Q1 A）。
 *
 * 取代旧 `hasAcceptanceDecision`「存在任意 acceptance 决定即收口」的布尔口径：
 *   · 「最新」按**账本 append（数组）顺序**取该 flow 最后一条
 *     `customer.decision{decisionKind:"acceptance"}`；`at` 只用于时间比较，不参与排序；
 *   · 最新 `customerDecision:"accepted"` ⇒ `accepted`（唯一收口依据）；
 *   · 最新 `"rejected"` ⇒ `rejected`（待返工，**不是** closed）；
 *   · 其余（`changes-requested`/`none`/`unclassified`/缺字段/未知值）⇒ `unresolved`
 *     （fail-closed：不自动收口、不自动重派，交 Lead/人工）；
 *   · 无 acceptance 决定 ⇒ `none`（沿用既有收尾门：验收步骤 pending 且执行步骤齐备 ⇒ 可派发）；
 *   · 账本有坏行/不可读 ⇒ `ledger-unavailable`（调用方必须 fail-closed，不猜内容）。
 */
export type LatestAcceptanceDecision =
  | { kind: "none" }
  | { kind: "ledger-unavailable"; errors: readonly string[] }
  | { kind: "accepted"; entry: GovernanceLedgerEntry }
  | { kind: "rejected"; entry: GovernanceLedgerEntry }
  | { kind: "unresolved"; entry: GovernanceLedgerEntry };

/**
 * 是否为可作 `customer-decision` 证据的账本决定类型（`unclassified` 不是证据）。
 * 纯函数；与 `parseFlowStateYaml` / `validateFlowEvidence` 共用同一份枚举，不新增 kind。
 */
export function isCustomerDecisionKindRef(value: unknown): value is string {
  return typeof value === "string" && CUSTOMER_DECISION_KIND_REFS.has(value);
}

/** 是否为「已结算」的客户决定结果（accepted / accepted-quick / appointed；与对账同口径）。 */
export function isResolvedCustomerDecision(value: unknown): boolean {
  return typeof value === "string" && RESOLVED_CUSTOMER_DECISIONS.has(value);
}

/**
 * 指定 `decisionKind` 的最新客户决定（2026-10-24 appointment 应用收口用）。
 *
 * 与 `latestAcceptanceDecision` 同口径：按账本 append（数组）顺序取该 flow 最后一条
 * `customer.decision{decisionKind}`；`at` 不参与排序；账本坏行 ⇒ `ledger-unavailable`（fail-closed）。
 * **不匹配 `stepId`**：账本 `customer.decision.stepId` 只是发起步骤的审计标记（例如任命决定可能记在
 * `role-cards`），证据匹配键是 `flowId + decisionKind`（与 `validateFlowEvidence` 同一口径）。
 */
export type LatestCustomerDecision =
  | { kind: "none" }
  | { kind: "ledger-unavailable"; errors: readonly string[] }
  | { kind: "resolved"; entry: GovernanceLedgerEntry }
  | { kind: "unresolved"; entry: GovernanceLedgerEntry };

/** 取该 flow 指定 decisionKind 按账本 append 顺序**最后一条**客户决定并分类（纯函数，不读盘）。 */
export function latestCustomerDecision(
  flowId: string,
  decisionKind: string,
  ledgerInput: FlowLedgerInput,
): LatestCustomerDecision {
  const { entries, errors } = ledgerOf(ledgerInput);
  if (errors.length > 0) return { kind: "ledger-unavailable", errors: [...errors] };
  let latest: GovernanceLedgerEntry | undefined;
  for (const entry of entries) {
    if (entry.kind === "customer.decision" && entry.flowId === flowId && entry.decisionKind === decisionKind) {
      latest = entry;
    }
  }
  if (latest === undefined) return { kind: "none" };
  return isResolvedCustomerDecision(latest.customerDecision)
    ? { kind: "resolved", entry: latest }
    : { kind: "unresolved", entry: latest };
}

/** 取该 flow 按账本 append 顺序**最后一条** acceptance 决定并分类（纯函数，不读盘）。 */
export function latestAcceptanceDecision(flowId: string, ledgerInput: FlowLedgerInput): LatestAcceptanceDecision {
  const { entries, errors } = ledgerOf(ledgerInput);
  if (errors.length > 0) return { kind: "ledger-unavailable", errors: [...errors] };
  let latest: GovernanceLedgerEntry | undefined;
  for (const entry of entries) {
    if (entry.kind === "customer.decision" && entry.flowId === flowId && entry.decisionKind === "acceptance") {
      latest = entry;
    }
  }
  if (latest === undefined) return { kind: "none" };
  if (latest.customerDecision === "accepted") return { kind: "accepted", entry: latest };
  if (latest.customerDecision === "rejected") return { kind: "rejected", entry: latest };
  return { kind: "unresolved", entry: latest };
}

/** `evaluateFlowCompletion` 的可选项（2026-10-23 验收返工路由方案 v1 §5.5.3 / Q4 A）。 */
export interface EvaluateFlowCompletionOptions {
  /**
   * 默认 `false`（strict）：最新 acceptance 决定为 `rejected` ⇒ 不 ready（「验收已拒绝，流程等待返工」）。
   * 仅桌面重派门处理 rejected/auto-rework 流程时传 `true`——rejected 不再挡收尾门，但仍逐条返回
   * 执行步骤未完成 / 证据缺失 / 未结算决定等**具体原因**；`accepted` 与 `unresolved` 不受该选项影响
   * （accepted 仍收口；unresolved 仍 fail-closed）。
   */
  allowRejectedAcceptance?: boolean;
}

function hasUnresolvedDecision(flowId: string, ledger: readonly GovernanceLedgerEntry[]): boolean {
  return ledger.some(
    (entry) =>
      entry.kind === "customer.decision" &&
      entry.flowId === flowId &&
      (entry.decisionKind === "unclassified" ||
        entry.customerDecision === "none" ||
        entry.customerDecision === undefined ||
        (entry.customerDecision as string) === ""),
  );
}

/**
 * 收尾门（流程齐备 → 可进入验收 / 自动派 Proof）：
 *   · 账本不可读由调用方先行 fail-closed（本函数只接收 entries）；
 *   · `superseded` 步骤不参与判定；
 *   · 执行步骤（`kind !== "acceptance"`）必须全部 `done`，且证据与账本对账通过；
 *   · `failed/blocked/aborted` 未标 `superseded` 一律 fail-closed；
 *   · 必须有且仅有一个验收步骤（保留 id verification/acceptance）；按**最新**验收决定（账本 append
 *     顺序，见 `latestAcceptanceDecision`）判定：
 *       - 最新 `accepted` ⇒ 已收口（不再派发）；
 *       - 最新 `rejected` ⇒ 默认 strict 不齐备（「验收已拒绝，流程等待返工」）；仅
 *         `allowRejectedAcceptance:true` 时放行，继续返回执行步骤/证据/未结算决定等具体原因；
 *       - 最新未结算/异常（changes-requested/none/unclassified/缺字段）⇒ fail-closed；
 *       - 无决定 ⇒ 验收步骤 `pending` 才放行；`dispatched/delivered` ⇒ 验收进行中（不重复派发）；
 *       - 验收步骤已 `done` 且最新 `rejected` ⇒ 异常状态（不自动重开/重派，提示人工核对）；
 *   · 存在未结算决定（unclassified / customerDecision none|undefined|空串）⇒ 不齐备（口径不变）。
 *
 * 2026-10-23 验收返工路由（方案 v1 Q1 A）：只有最新 `accepted` 收口；`rejected` 是「待返工」，
 * 不再被当作永久收口。legacy Markdown 行为不在本函数（由桌面窗口按 Q6 A 保持并加回归锁）。
 *
 * 证据类型完全由 flow 的显式 `kind` 决定，**不看 stepId 前缀**。
 */
export function evaluateFlowCompletion(
  flow: FlowState,
  ledgerInput: FlowLedgerInput,
  options: EvaluateFlowCompletionOptions = {},
): EvaluateFlowCompletionResult {
  const { entries: ledger, errors: ledgerErrors } = ledgerOf(ledgerInput);
  if (ledgerErrors.length > 0) {
    return { ready: false, issues: ["治理账本不可读或存在坏行，无法核对验收完成度。"] };
  }
  const issues: string[] = [];
  const active = flow.steps.filter((step) => step.status !== "superseded");

  // 1) 阻塞状态（未 superseded）与执行步骤完成度。
  for (const step of active) {
    if (step.kind === "acceptance") continue;
    if (BLOCKING_STATUSES.has(step.status)) {
      issues.push(`步骤 ${step.id} 状态为 ${step.status}（未被 superseded），流程不能收尾。`);
    } else if (step.status !== "done") {
      issues.push(`执行步骤 ${step.id} 尚未完成（status=${step.status}）。`);
    }
  }

  // 2) 证据对账（done 步骤）。
  const evidence = validateFlowEvidence(flow, ledger);
  if (!evidence.ok) {
    for (const issue of evidence.issues) {
      issues.push(`步骤 ${issue.stepId}：${issue.message}（${issue.path}）`);
    }
  }

  // 3) 验收步骤：必须存在、唯一（parse 已保证至多一个）；按最新验收决定判定。
  const acceptanceSteps = active.filter((step) => step.kind === "acceptance");
  if (acceptanceSteps.length === 0) {
    issues.push("流程缺少验收步骤（保留 id verification/acceptance）。");
  } else {
    const step = acceptanceSteps[0]!;
    // 账本 errors 已在上方返回，这里传 entries ⇒ 不会得到 ledger-unavailable。
    const latest = latestAcceptanceDecision(flow.flowId, ledger);
    if (step.status === "done") {
      if (latest.kind === "rejected") {
        issues.push(
          "验收步骤已完成（done），但最新验收决定为 rejected；异常状态，不自动重开/重派，请人工核对。",
        );
      } else {
        issues.push("验收步骤已完成，流程已收口，无需再派发验收。");
      }
    } else if (latest.kind === "accepted") {
      issues.push("该流程已有验收决定（accepted），流程已收口。");
    } else if (latest.kind === "rejected") {
      if (options.allowRejectedAcceptance === true) {
        if (step.status !== "pending") {
          issues.push(`验收步骤状态为 ${step.status}，验收已派发/进行中，无需重复派发。`);
        }
      } else {
        issues.push("验收已拒绝，流程等待返工；返工后需重新派发验收。");
      }
    } else if (latest.kind === "unresolved") {
      issues.push(
        "该流程最新验收决定不是 accepted/rejected（未结算/异常），不自动收口、不自动重派；请人工核对。",
      );
    } else if (latest.kind === "ledger-unavailable") {
      // 防御分支：正常在函数入口已按 ledger errors 返回。
      issues.push("治理账本不可读或存在坏行，无法核对验收决定。");
    } else if (step.status !== "pending") {
      issues.push(`验收步骤状态为 ${step.status}，验收已派发/进行中，无需重复派发。`);
    }
  }

  // 4) 未结算决定（与桌面 flowCompletionIssue 同口径；口径保持 2026-10-19 不变）。
  if (hasUnresolvedDecision(flow.flowId, ledger)) {
    issues.push("该流程仍有未结算的决定。");
  }

  return issues.length === 0 ? { ready: true } : { ready: false, issues };
}

/**
 * 桌面旧接口风格的**薄适配**（与既有 `app/desktop/governance-advance.ts::flowCompletionIssue`
 * 同形）：齐备 ⇒ `undefined`；否则返回人话原因（`issues` 以「；」连接）。
 * 判定逻辑仍是 `evaluateFlowCompletion` 的单一实现，不复制规则。
 */
export function flowCompletionIssue(flow: FlowState, ledger: FlowLedgerInput): string | undefined {
  const result = evaluateFlowCompletion(flow, ledger);
  return result.ready ? undefined : result.issues.join("；");
}

// —————————————————————— 就绪步骤（2026-10-24 P0-2） ——————————————————————
//
// 纯只读规划器：给定 flow 与「账本里已 dispatch.accepted 的 stepId」，算出下一批可继续调度的步骤。
// **不读盘、不写盘、不改 flow、不派发、不标 done**；桌面只把结果转成给 Steward 的「继续调度」提示，
// 是否派发/如何派发仍由既有治理门禁与角色决定。本函数不新增 flow 字段/枚举/持久化。

/**
 * `listReadyFlowSteps` 的已派发输入：账本 `dispatch.accepted.stepId` 的投影。
 * `ReadonlySet<string>` 或 `readonly string[]` 均可（调用方从治理账本自行收集，按 flowId 过滤）。
 */
export type ReadyFlowDispatchedStepIds = ReadonlySet<string> | readonly string[];

/**
 * 就绪步骤（可继续调度）。
 * `kind` 只会是 `dispatch` / `artifact`：`customer-decision`/`acceptance` 是人工闸门，**永不**进入 ready。
 */
export interface ReadyFlowStep {
  id: string;
  title: string;
  owner: string;
  kind: "dispatch" | "artifact";
  /** 原样携带步骤声明的并行组（未声明则字段缺席）。 */
  parallelGroup?: string;
  /** 原样携带步骤声明的 dependsOn（未声明 = 空数组；不改写为解析后的替代链）。 */
  dependsOn: string[];
}

/**
 * 被跳过的 pending 步骤及机器可读原因：
 *   · `already-dispatched`    账本已有 dispatch.accepted（该 stepId 已派发过）；
 *   · `awaiting-customer`     `kind: customer-decision`（待客户决定，人工闸门）；
 *   · `awaiting-acceptance`   `kind: acceptance`（验收出口，永不自动）；
 *   · `app-owned`             `owner` 为 `app`（应用自身执行，不交角色调度）；
 *   · `owner-missing`         `owner` 为空（无法确定调度对象，fail-closed）；
 *   · `dependency-missing`    dependsOn 引用的步骤不存在；
 *   · `dependency-unknown`    前置已 superseded 但 supersededBy 缺失，或指向不存在的步骤；
 *   · `dependency-cycle`      supersededBy 链成环（防御性；YAML 解析已拒绝替代环）；
 *   · `dependency-not-done`   前置（解析后的最终非 superseded 步骤）尚未 done。
 */
export interface SkippedFlowStep {
  id: string;
  reason:
    | "already-dispatched"
    | "awaiting-customer"
    | "awaiting-acceptance"
    | "app-owned"
    | "owner-missing"
    | "dependency-missing"
    | "dependency-unknown"
    | "dependency-cycle"
    | "dependency-not-done";
}

/**
 * 流程当前停在的人工闸门（仅当**没有 ready 步骤**时报告）：
 *   · `awaiting-customer`   至少一个 pending `customer-decision` 步骤（优先）；
 *   · `awaiting-acceptance` 否则，至少一个 pending `acceptance` 步骤。
 *
 * 注意：ready 非空时**不**报 stopReason——验收步骤通常全程 pending，若无条件报告会让调用方误以为
 * 流程无法继续调度（P0-2 的唤醒被永久压住）。ready 为空的其它原因（步骤在途/阻塞）不在此报告，
 * 由 skipped 与既有收尾门覆盖。
 */
export type ReadyFlowStopReason = "awaiting-customer" | "awaiting-acceptance";

/** `listReadyFlowSteps` 结果：ready / skipped 均保持 `flow.steps` 原顺序。 */
export interface ListReadyFlowStepsResult {
  ready: ReadyFlowStep[];
  /** 被考虑（`status: pending`）但未就绪的步骤；非 pending 步骤不列出。 */
  skipped: SkippedFlowStep[];
  stopReason?: ReadyFlowStopReason;
}

/** 单个 dependsOn 前置解析结果（仅内部用）。 */
type ReadyDependencyResolution =
  | { ok: true; step: FlowStateStep }
  | { ok: false; reason: "missing" | "unknown" | "cycle" };

/**
 * dependsOn 前置解析（与 P0-3 派发门同一口径）：前置若已 `superseded`，沿 `supersededBy` 链解析到
 * 最终非 superseded 步骤；缺失/未知/成环返回 `ok:false`（不按「未 done」混同）。
 */
function resolveReadyDependency(
  byId: ReadonlyMap<string, FlowStateStep>,
  depId: string,
): ReadyDependencyResolution {
  const visited = new Set<string>();
  let currentId = depId;
  for (;;) {
    if (visited.has(currentId)) return { ok: false, reason: "cycle" };
    visited.add(currentId);
    const step = byId.get(currentId);
    if (step === undefined) {
      return { ok: false, reason: currentId === depId ? "missing" : "unknown" };
    }
    if (step.status !== "superseded") return { ok: true, step };
    const next = step.supersededBy?.trim();
    if (next === undefined || next === "") return { ok: false, reason: "unknown" };
    currentId = next;
  }
}

/**
 * 计算下一批可继续调度的步骤（纯函数，2026-10-24 P0-2）。
 *
 * 就绪条件（全部满足）：
 *   1. `status === "pending"`；
 *   2. `kind` 为 `dispatch` / `artifact`（`customer-decision`/`acceptance` 是人工闸门，skip）；
 *   3. `owner` 非空且不是 `app`（应用自身执行，skip）；
 *   4. stepId 不在 `dispatchedStepIds`（账本已有 dispatch.accepted，已派发，skip）；
 *   5. `dependsOn` 每项解析到最终非 superseded 步骤后必须 `done`；缺失/未知/成环 ⇒ 不 ready 并给出原因。
 *
 * 顺序：先按 step 判定 kind/owner/已派发/依赖（第一个命中者决定 skipped.reason），再看 ready 是否为空
 * 决定 stopReason。函数无副作用：不读账本、不写盘、不修改入参。
 */
export function listReadyFlowSteps(
  flow: FlowState,
  dispatchedStepIds: ReadyFlowDispatchedStepIds = [],
): ListReadyFlowStepsResult {
  const byId = new Map<string, FlowStateStep>();
  for (const step of flow.steps) {
    if (!byId.has(step.id)) byId.set(step.id, step);
  }
  const dispatched = new Set<string>(dispatchedStepIds);
  const ready: ReadyFlowStep[] = [];
  const skipped: SkippedFlowStep[] = [];
  let pendingCustomerDecision = false;
  let pendingAcceptance = false;

  for (const step of flow.steps) {
    if (step.status !== "pending") continue;
    if (step.kind === "customer-decision") pendingCustomerDecision = true;
    if (step.kind === "acceptance") pendingAcceptance = true;
  }

  for (const step of flow.steps) {
    if (step.status !== "pending") continue;

    if (step.kind === "acceptance") {
      skipped.push({ id: step.id, reason: "awaiting-acceptance" });
      continue;
    }
    if (step.kind === "customer-decision") {
      skipped.push({ id: step.id, reason: "awaiting-customer" });
      continue;
    }

    const owner = step.owner.trim();
    if (owner === "") {
      skipped.push({ id: step.id, reason: "owner-missing" });
      continue;
    }
    if (owner.toLowerCase() === "app") {
      skipped.push({ id: step.id, reason: "app-owned" });
      continue;
    }
    if (dispatched.has(step.id)) {
      skipped.push({ id: step.id, reason: "already-dispatched" });
      continue;
    }

    // 依赖：缺失/未知/成环优先于「未 done」；多个前置时取第一个未解析原因。
    let unresolvedReason: SkippedFlowStep["reason"] | undefined;
    let hasNotDone = false;
    for (const depId of step.dependsOn ?? []) {
      const resolution = resolveReadyDependency(byId, depId);
      if (!resolution.ok) {
        if (unresolvedReason === undefined) {
          unresolvedReason =
            resolution.reason === "missing"
              ? "dependency-missing"
              : resolution.reason === "cycle"
                ? "dependency-cycle"
                : "dependency-unknown";
        }
        continue;
      }
      if (resolution.step.status !== "done") hasNotDone = true;
    }
    if (unresolvedReason !== undefined) {
      skipped.push({ id: step.id, reason: unresolvedReason });
      continue;
    }
    if (hasNotDone) {
      skipped.push({ id: step.id, reason: "dependency-not-done" });
      continue;
    }

    ready.push({
      id: step.id,
      title: step.title,
      owner: step.owner,
      kind: step.kind,
      ...(step.parallelGroup !== undefined ? { parallelGroup: step.parallelGroup } : {}),
      dependsOn: [...(step.dependsOn ?? [])],
    });
  }

  const stopReason: ReadyFlowStopReason | undefined =
    ready.length > 0
      ? undefined
      : pendingCustomerDecision
        ? "awaiting-customer"
        : pendingAcceptance
          ? "awaiting-acceptance"
          : undefined;

  return {
    ready,
    skipped,
    ...(stopReason !== undefined ? { stopReason } : {}),
  };
}
