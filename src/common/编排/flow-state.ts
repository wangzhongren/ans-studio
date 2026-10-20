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
import type { GovernanceLedgerEntry } from "./governance-ledger.ts";

// —————————————————————— 枚举与形状 ——————————————————————

/** 质量档位（评审 §质量：生产级为默认；原型档须客户明确选择）。 */
export const FLOW_QUALITY_TIERS = ["prototype", "production"] as const;
export type FlowQualityTier = (typeof FLOW_QUALITY_TIERS)[number];

/**
 * 步骤类型（决定完成证据种类；**不再按 stepId 前缀猜**）：
 *   · `dispatch`          应用派发给项目角色的执行步骤 → 账本 `dispatch.accepted`；
 *   · `customer-decision` 客户决定步骤（提名/任命/提案接受等） → 账本 `customer.decision`；
 *   · `artifact`          产物步骤（契约冻结/流程写入等） → 账本 `artifact.observed`；
 *   · `acceptance`        验收步骤（保留 id `verification`/`acceptance`） → 账本 `customer.decision{decisionKind:"acceptance"}`。
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

const FLOW_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

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

const TOP_LEVEL_KEYS = new Set(["flowId", "version", "qualityTier", "status", "steps"]);
const STEP_KEYS = new Set(["id", "title", "owner", "kind", "status", "evidence", "supersedes", "supersededBy"]);
const EVIDENCE_KEYS = new Set(["kind", "ref"]);

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

    steps.push({
      id: id ?? "",
      title: title ?? "",
      owner: owner ?? "",
      kind: (kindValid ? kind : "dispatch") as FlowStepKind,
      status: (statusValid ? status : "pending") as FlowStepStatus,
      ...(evidence !== undefined ? { evidence } : {}),
      ...(supersedes !== undefined ? { supersedes } : {}),
      ...(supersededBy !== undefined ? { supersededBy } : {}),
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
      steps,
    },
  };
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

function hasAcceptanceDecision(flowId: string, ledger: readonly GovernanceLedgerEntry[]): boolean {
  return ledger.some(
    (entry) => entry.kind === "customer.decision" && entry.flowId === flowId && entry.decisionKind === "acceptance",
  );
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
 *   · 必须有且仅有一个验收步骤（保留 id verification/acceptance），且仍为 `pending`；
 *     已 `done` / 已有 `customer.decision{acceptance}` ⇒ 视为已收口（不是可再派发）；
 *     已 `dispatched/delivered` ⇒ 验收进行中（不重复派发）；
 *   · 存在未结算决定（unclassified / customerDecision none|undefined）⇒ 不齐备。
 *
 * 证据类型完全由 flow 的显式 `kind` 决定，**不看 stepId 前缀**。
 */
export function evaluateFlowCompletion(
  flow: FlowState,
  ledgerInput: FlowLedgerInput,
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

  // 3) 验收步骤：必须存在、唯一（parse 已保证至多一个）、尚未有验收决定。
  const acceptanceSteps = active.filter((step) => step.kind === "acceptance");
  if (acceptanceSteps.length === 0) {
    issues.push("流程缺少验收步骤（保留 id verification/acceptance）。");
  } else {
    const step = acceptanceSteps[0]!;
    if (step.status === "done") {
      issues.push("验收步骤已完成，流程已收口，无需再派发验收。");
    } else if (hasAcceptanceDecision(flow.flowId, ledger)) {
      issues.push("该流程已有验收决定，流程已收口。");
    } else if (step.status !== "pending") {
      issues.push(`验收步骤状态为 ${step.status}，验收已派发/进行中，无需重复派发。`);
    }
  }

  // 4) 未结算决定（与桌面 flowCompletionIssue 同口径）。
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
