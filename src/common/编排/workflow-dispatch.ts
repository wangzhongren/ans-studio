// src/common/编排/workflow-dispatch.ts
// 编排主属（T3「两条固定工作流路径」B1，2026-11-10）：**fixed 派发矩阵的唯一纯策略实现**。
//
// 依据：实现级方案 v1.3 §3.1/§3.2（two-fixed-paths/v1 矩阵）、§3.3（stage-request 原语）、
// §3.6（Q6 父门替代证据 fail-closed）；B1 验收 AC-01/AC-02/AC-03/AC-04、T-01/T-02。
//
// 纪律：
//  · **纯函数**：无 I/O、无时钟、无随机、无账本；输入全部是宿主已核验事实，输出只做判定。
//  · **legacy 不动**：本文件不 import/不修改 `workflow-preconditions.ts::evaluateDispatchAuthorization`
//    等旧谓词；legacy 调用点继续走旧实现（MF-1/MF-2）。fixed 谓词只由 fixed 路由调用。
//  · **fail-closed**：未知来源/目标/证据缺失/来源已变 ⇒ 拒绝；不默认通过、不从模型自报补造事实。
//  · 本模块不授予任何写权：`allow: true` 只表示「fixed 矩阵不反对」，会话层仍执行全部安全边界。

import type {
  TaskSideEffect,
  WorkflowAction,
  WorkflowProtocol,
  WorkflowStage,
} from "../../model/runtime.ts";
import { WORKFLOW_PROTOCOL_APP_DISPATCH } from "../../model/runtime.ts";
import type { RoleDispatchPurpose } from "../../model/role.ts";

/** fixed 矩阵模式（与 `model/role.ts::DispatchMatrixMode` 同源；此处只导出 fixed 值便捷常量）。 */
export const FIXED_DISPATCH_MATRIX = "two-fixed-paths/v1" as const;

/** fixed：运营可派发的内置目标（v1.3 §3.4；仅 fixed 谓词使用）。 */
export const FIXED_CONVENER_BUILT_IN_TARGETS: readonly string[] = Object.freeze(["product", "rapporteur", "nominator"]);
/** fixed：幕僚可派发的内置目标（v1.3 §3.4；仅 fixed 谓词使用）。 */
export const FIXED_CHIEF_BUILT_IN_TARGETS: readonly string[] = Object.freeze(["convener", "verifier"]);

/**
 * 2026-11-17（app-dispatch/v1，设计 §2.1）：**新协议目标集清零**——
 * 幕僚不再派发任何 agent（任意目标 `chief-dispatch-removed`）；
 * 运营不再派发任何内置角色（`convener-builtin-dispatch-forbidden`），只可派项目 worker 且必须
 * 绑定自身 open 的 `worker-dispatch` 任务（`worker-dispatch-required`）。
 * 本常量只表达目标集；判定在 `evaluateFixedPathDispatchAuthorization(protocol:"app-dispatch/v1")`。
 */
export const APP_DISPATCH_CHIEF_BUILT_IN_TARGETS: readonly string[] = Object.freeze([]);
export const APP_DISPATCH_CONVENER_BUILT_IN_TARGETS: readonly string[] = Object.freeze([]);

/** app-dispatch/v1 稳定码（集中定义；与 fixed-v2.1 旧码并存，旧协议仍返回旧码）。 */
export const APP_DISPATCH_FAILURE_CODES = Object.freeze([
  "chief-dispatch-removed",
  "convener-builtin-dispatch-forbidden",
  "worker-dispatch-required",
  "card-prompt-mismatch",
  "card-prompt-document-invalid",
  "stage-request-removed",
  "workflow-definition-unknown",
  "workflow-definition-version-unsupported",
  "workflow-protocol-mismatch",
  "workflow-stopping",
  "workflow-corrupt",
] as const);
export type AppDispatchFailureCode = (typeof APP_DISPATCH_FAILURE_CODES)[number];

/** fixed 派发失败码（v1.3 附录 C + MF-10 窄例外 + 2026-11-17 app-dispatch 三码；fixture/测试断言稳定码）。 */
export type FixedDispatchFailureCode =
  | "self-dispatch"
  | "unknown-source"
  | "chief-to-project-forbidden"
  | "chief-production-dispatch-forbidden"
  | "convener-to-verifier-forbidden"
  | "convener-target-forbidden"
  | "target-card-missing"
  | "stage-request-invalid"
  | "stage-request-source-missing"
  | "dispatch-evidence-missing"
  | "dispatch-source-changed"
  | "stage-request-required"
  | "review-role-invalid"
  // 2026-11-17（app-dispatch/v1 新协议专属；fixed-v2.1/legacy 路径不返回）
  | "chief-dispatch-removed"
  | "convener-builtin-dispatch-forbidden"
  | "worker-dispatch-required";

/**
 * Q6 证据（宿主捕获；AC-04 fail-closed）。
 * 证据缺失/不匹配 ⇒ 拒绝；调用方不得用模型自报值填充本对象。
 */
export interface FixedDispatchEvidence {
  /** `app/desktop/session.ts::sourceIsCurrent` 的真实会话/本轮/来源证据。 */
  readonly sourceIsCurrent?: boolean;
  /** `workflowService.inspectAssignedTask` 的真实受派任务事实（convener 生产派发必填）。 */
  readonly assignedTask?: {
    readonly taskId?: string;
    readonly from?: string;
    readonly to?: string;
    readonly taskKind?: string;
    readonly workflowId?: string;
    readonly stage?: WorkflowStage;
    readonly open?: boolean;
    readonly stopped?: boolean;
  };
  /** 本次派发将使用的幂等键（应用计算；模型自报不采信）。 */
  readonly idempotencyKey?: string;
  /** 应用期望的幂等键（与 `idempotencyKey` 同时给出时须一致）。 */
  readonly expectedIdempotencyKey?: string;
  /** 身份/目标等价证据（应用枚举结果；给出时须与请求一致）。 */
  readonly identity?: { readonly sourceRoleId?: string; readonly targetRoleId?: string };
  /** chief 当前真实客户轮次 id（host 从 session origin 捕获；stage-request 必填）。 */
  readonly sourceTaskId?: string;
}

/** stage-request 子模式字段（AC-05：无 module/写集、sideEffect 固定 read-only）。 */
export interface FixedStageRequestFacts {
  readonly taskKind?: unknown;
  readonly workflowAction?: WorkflowAction;
  readonly sideEffect?: TaskSideEffect | unknown;
  readonly moduleId?: unknown;
  readonly modulePaths?: unknown;
  readonly writeSet?: unknown;
}

/** fixed 谓词输入（宿主已核验事实；缺省一律按 fail-closed 处理）。 */
export interface FixedDispatchPolicyInput {
  /**
   * 2026-11-17：工作流驱动协议（宿主从 `workflow.started.protocol` 解析；缺省 = fixed-v2.1）。
   * `fixed-v2.1`/缺省 ⇒ **逐字保持旧矩阵**；`app-dispatch/v1` ⇒ 新矩阵（§2.1：幕僚 ∅ / 运营内置 ∅ /
   * 运营项目 worker 需绑定 open `worker-dispatch` 任务）。
   */
  readonly protocol?: WorkflowProtocol;
  readonly sourceRoleId?: string;
  readonly chiefRoleId?: string;
  readonly convenerRoleId?: string;
  readonly targetRoleId: string;
  /** 目标类别（宿主枚举；未给出按 `targetBuiltIn` 推断，两者都缺 ⇒ 拒绝）。 */
  readonly targetKind?: "built-in-governance" | "project";
  /** 兼容旧形状：true = 内置治理角色。 */
  readonly targetBuiltIn?: boolean;
  readonly targetExists?: boolean;
  readonly purpose?: RoleDispatchPurpose;
  /** 应用解析的 workflow 视图事实（reviewRoleId 等；不信任模型自报）。 */
  readonly workflow?: {
    readonly workflowId?: string;
    readonly reviewRoleId?: string;
    readonly stage?: WorkflowStage;
  };
  /** 应用核验的验收角色绑定（MF-10 窄例外四项须同时成立）。 */
  readonly reviewRoleId?: string;
  readonly rosterReviewRoleId?: string;
  readonly basisReviewRoleId?: string;
  readonly targetActivated?: boolean;
  readonly stageRequest?: FixedStageRequestFacts;
  readonly evidence?: FixedDispatchEvidence;
}

export type FixedDispatchPolicyResult =
  | { readonly ok: true; readonly purpose: RoleDispatchPurpose; readonly reportToRoleId?: string }
  | {
    readonly ok: false;
    readonly code: FixedDispatchFailureCode;
    readonly message: string;
    readonly missing?: readonly string[];
  };

function deny(
  code: FixedDispatchFailureCode,
  message: string,
  missing?: readonly string[],
): FixedDispatchPolicyResult {
  return { ok: false, code, message, ...(missing !== undefined ? { missing } : {}) };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * fixed 派发硬授权（`matrix:"two-fixed-paths/v1"`）。
 *
 * 规则（v1.3 §3.2，逐条）：
 * - self → `self-dispatch`；来源非 chief/convener → `unknown-source`；
 * - chief → verifier（前置/验收）允许；chief → 项目角色仅 `purpose=review` 且
 *   `targetRoleId===reviewRoleId===roster review 角色===basis reviewRoleId`、角色已激活时允许
 *   （MF-10），其余 `chief-to-project-forbidden`；
 * - chief → convener 仅 `purpose=stage-request`（read-only、无 module/写集）允许；
 * - chief → product/rapporteur/nominator ⇒ `chief-production-dispatch-forbidden`；
 * - convener → product/rapporteur/nominator 允许；convener → verifier ⇒ `convener-to-verifier-forbidden`；
 * - convener → 项目角色须 `targetExists`；其余内置目标 ⇒ `convener-target-forbidden`。
 *
 * 通过矩阵后仍须满足 Q6 证据（live-turn + assigned-task + identity/target + 幂等）；
 * 证据缺失/不匹配一律拒绝，不默认通过。
 */
export function evaluateFixedPathDispatchAuthorization(input: FixedDispatchPolicyInput): FixedDispatchPolicyResult {
  const source = input.sourceRoleId;
  const target = input.targetRoleId;
  const chief = isNonEmptyString(input.chiefRoleId) ? input.chiefRoleId : "chief";
  const convener = isNonEmptyString(input.convenerRoleId) ? input.convenerRoleId : "convener";
  const purpose: RoleDispatchPurpose = input.purpose ?? "production";
  const kind: "built-in-governance" | "project" | undefined = input.targetKind
    ?? (input.targetBuiltIn === true ? "built-in-governance" : input.targetBuiltIn === false ? "project" : undefined);

  if (!isNonEmptyString(source)) {
    return deny("unknown-source", "派发未受理：fixed 矩阵缺少可信来源角色（只有幕僚或运营可以派发任务）。");
  }
  if (source === target) {
    return deny("self-dispatch", "派发未受理：不能派发给自己。");
  }
  if (source !== chief && source !== convener) {
    return deny("unknown-source", "派发未受理：只有幕僚或运营可以在 fixed 矩阵下派发任务。");
  }
  if (kind === undefined || !isNonEmptyString(target)) {
    return deny("target-card-missing", `派发未受理：目标角色 ${String(target)} 类别/身份不明确；不猜。`);
  }

  // 2026-11-17（app-dispatch/v1，设计 §2.1）：新协议矩阵。
  // 缺省/fixed-v2.1 不进入本分支 ⇒ 下方旧矩阵**逐字不变**（在飞协议隔离，Q10）。
  if (input.protocol === WORKFLOW_PROTOCOL_APP_DISPATCH) {
    return evaluateAppDispatchAuthorization(input, { source, target, kind, chief, convener });
  }

  if (source === chief) {
    if (kind === "built-in-governance" && target === "verifier") {
      if (input.targetExists !== true) {
        return deny("target-card-missing", "派发未受理：验收目标未真实枚举（targetExists=false/缺省）。");
      }
      return withEvidence(input, purpose, chief, undefined);
    }
    if (kind === "project") {
      const reviewRoleId = input.reviewRoleId ?? input.workflow?.reviewRoleId;
      const rosterReview = input.rosterReviewRoleId;
      const basisReview = input.basisReviewRoleId;
      if (purpose !== "review") {
        return deny(
          "chief-to-project-forbidden",
          "派发未受理：幕僚不直接给项目角色派生产任务；实现任务请交运营（convener）。",
        );
      }
      if (!isNonEmptyString(reviewRoleId) || target !== reviewRoleId) {
        return deny(
          "chief-to-project-forbidden",
          "派发未受理：幕僚只可派本 workflow 的验收角色（reviewRoleId）；该目标不是验收角色。",
        );
      }
      if (input.targetExists !== true || rosterReview !== reviewRoleId || basisReview !== reviewRoleId
        || input.targetActivated !== true) {
        const missing: string[] = [];
        if (input.targetExists !== true) missing.push("targetExists");
        if (rosterReview !== reviewRoleId) missing.push("roster=review");
        if (basisReview !== reviewRoleId) missing.push("basis.reviewRoleId");
        if (input.targetActivated !== true) missing.push("role.activated");
        return deny(
          "review-role-invalid",
          "派发未受理：项目验收角色绑定证据不完整（roster/basis/激活须与 reviewRoleId 一致）。",
          missing,
        );
      }
      return withEvidence(input, purpose, chief, reviewRoleId);
    }
    if (kind === "built-in-governance" && target === "convener") {
      if (purpose !== "stage-request") {
        return deny(
          "target-card-missing",
          "派发未受理：幕僚→运营只允许 stage-request（产线调度请求）；生产线派发归运营。",
        );
      }
      const stageRequest = validateStageRequestFacts(input.stageRequest);
      if (!stageRequest.ok) return stageRequest;
      return withEvidence(input, purpose, chief, undefined, { requireSourceTaskId: true });
    }
    if (kind === "built-in-governance" && (target === "product" || target === "rapporteur" || target === "nominator")) {
      return deny(
        "chief-production-dispatch-forbidden",
        "派发未受理：fixed 路径的幕僚不派生产线角色（产品/策划/人事由运营派发）。",
      );
    }
    return deny("target-card-missing", `派发未受理：目标角色 ${target} 不是 fixed 幕僚可派发的内置角色。`);
  }

  // 来源 = 运营（convener）
  if (kind === "built-in-governance") {
    if (target === "verifier") {
      return deny(
        "convener-to-verifier-forbidden",
        "派发未受理：fixed 路径的质检/验收只由幕僚创建；运营不派 verifier。",
      );
    }
    if (!FIXED_CONVENER_BUILT_IN_TARGETS.includes(target)) {
      return deny(
        "convener-target-forbidden",
        "派发未受理：运营只能派产品/策划/人事（fixed 内置生产线）或项目角色。",
      );
    }
    if (input.targetExists !== true) {
      return deny("target-card-missing", `派发未受理：目标内置角色 ${target} 未真实枚举。`);
    }
    return withEvidence(input, purpose, convener, undefined);
  }
  if (input.targetExists !== true) {
    return deny("target-card-missing", `派发未受理：目标角色 ${target} 不存在/未枚举到。`);
  }
  return withEvidence(input, purpose, convener, undefined);
}

/**
 * app-dispatch/v1 矩阵（2026-11-17；设计 §2.1；纯判定）：
 * - 幕僚 → 任意目标：**拒绝** `chief-dispatch-removed`（固定会话不再注入派发工具，谓词双保险）；
 * - 运营 → 任意内置：**拒绝** `convener-builtin-dispatch-forbidden`（内置任务由应用按定义创建）；
 * - 运营 → 项目 worker：仅当同时满足 Q6 证据 + 绑定自身 open 的 `worker-dispatch` 任务
 *   （`from:"application"`、`to`=运营、`taskKind:"worker-dispatch"`、workflow/stage 一致、未停止）
 *   ⇒ 允许 production；否则 `worker-dispatch-required`。
 * - 应用侧建任务不走本谓词（由 `workflow-service` 按定义/阶段/幂等校验）。
 */
function evaluateAppDispatchAuthorization(
  input: FixedDispatchPolicyInput,
  facts: {
    source: string;
    target: string;
    kind: "built-in-governance" | "project";
    chief: string;
    convener: string;
  },
): FixedDispatchPolicyResult {
  const { source, target, kind, chief, convener } = facts;
  if (source === chief) {
    return deny(
      "chief-dispatch-removed",
      "派发未受理：app-dispatch/v1 下幕僚不再派发任何 agent（只选流程、按应用 prompt 呈客户卡）。",
    );
  }
  if (source !== convener) {
    return deny("unknown-source", "派发未受理：app-dispatch/v1 下只有运营（convener）可以派发项目 worker。");
  }
  if (kind === "built-in-governance") {
    return deny(
      "convener-builtin-dispatch-forbidden",
      "派发未受理：app-dispatch/v1 下运营只派项目 worker，不派任何内置角色（内置任务由应用按流程定义创建）。",
    );
  }
  const purpose: RoleDispatchPurpose = input.purpose ?? "production";
  if (purpose !== "production") {
    return deny(
      "worker-dispatch-required",
      "派发未受理：app-dispatch/v1 下运营只做项目 worker 生产派发（不得代发验收/review 或其他目的）。",
    );
  }
  if (input.targetExists !== true) {
    return deny("target-card-missing", `派发未受理：目标角色 ${target} 不存在/未枚举到。`);
  }
  const evidence = input.evidence;
  if (evidence === undefined) {
    return deny(
      "dispatch-evidence-missing",
      "派发未受理：app-dispatch/v1 派发必须携带 live-turn / worker-dispatch 绑定 / identity / 幂等证据（不得默认通过）。",
      ["evidence"],
    );
  }
  if (evidence.sourceIsCurrent !== true) {
    return deny("dispatch-source-changed", "派发未受理：来源会话/轮次已变化或不可证（sourceIsCurrent=false/缺省）。");
  }
  if (!isNonEmptyString(evidence.idempotencyKey)) {
    return deny("dispatch-evidence-missing", "派发未受理：缺少应用计算的幂等键证据。", ["idempotencyKey"]);
  }
  if (isNonEmptyString(evidence.expectedIdempotencyKey) && evidence.expectedIdempotencyKey !== evidence.idempotencyKey) {
    return deny(
      "dispatch-evidence-missing",
      "派发未受理：幂等键与应使用的幂等键不一致（不得重复投递或改写幂等键）。",
      ["idempotencyKey"],
    );
  }
  if (evidence.identity !== undefined) {
    const identity = evidence.identity;
    if ((identity.sourceRoleId !== undefined && identity.sourceRoleId !== source)
      || (identity.targetRoleId !== undefined && identity.targetRoleId !== target)) {
      return deny("dispatch-evidence-missing", "派发未受理：identity 证据与真实来源/目标不一致。", ["identity"]);
    }
  }
  const assigned = evidence.assignedTask;
  if (assigned === undefined || assigned.open !== true || assigned.stopped === true
    || assigned.from !== "application" || assigned.to !== source || assigned.taskKind !== "worker-dispatch") {
    return deny(
      "worker-dispatch-required",
      "派发未受理：app-dispatch/v1 下运营派 worker 必须绑定自身当前 open 的 worker-dispatch 任务（由应用创建）。",
      [assigned === undefined ? "assignedTask" : "assignedTask.binding"],
    );
  }
  const workflowId = input.workflow?.workflowId;
  if (workflowId !== undefined && assigned.workflowId !== undefined && assigned.workflowId !== workflowId) {
    return deny(
      "worker-dispatch-required",
      "派发未受理：worker-dispatch 任务的 workflowId 与本次派发不一致。",
      ["assignedTask.workflowId"],
    );
  }
  const stage = input.workflow?.stage;
  if (stage !== undefined && assigned.stage !== undefined && assigned.stage !== stage) {
    return deny(
      "worker-dispatch-required",
      "派发未受理：worker-dispatch 任务的 stage 与本次派发不一致。",
      ["assignedTask.stage"],
    );
  }
  return { ok: true, purpose: "production" };
}

function validateStageRequestFacts(facts: FixedStageRequestFacts | undefined): FixedDispatchPolicyResult | { ok: true; purpose: "stage-request" } {  if (facts === undefined) {
    return deny("stage-request-invalid", "stage-request 未携带其子模式字段（taskKind/workflowAction/sideEffect）。");
  }
  if (facts.taskKind !== undefined && facts.taskKind !== "stage-request") {
    return deny("stage-request-invalid", 'stage-request 的 taskKind 只允许 "stage-request"。');
  }
  if (facts.workflowAction !== undefined && facts.workflowAction !== "advance" && facts.workflowAction !== "stop") {
    return deny("stage-request-invalid", "stage-request 的 workflowAction 只允许 advance/stop。");
  }
  if (facts.sideEffect !== "read-only") {
    return deny(
      "stage-request-invalid",
      "stage-request 必须为 sideEffect=read-only（文本升类豁免后固定 read-only）；不得携带写副作用。",
    );
  }
  if (facts.moduleId !== undefined || facts.modulePaths !== undefined || facts.writeSet !== undefined) {
    return deny("stage-request-invalid", "stage-request 不得携带 module/写集（它不是生产线派发）。");
  }
  return { ok: true, purpose: "stage-request" };
}

/**
 * Q6 证据校验（fail-closed）：
 * 1. `sourceIsCurrent === true`（live-turn）；否则 `dispatch-source-changed`；
 * 2. 幂等证据：`idempotencyKey` 必填；与 `expectedIdempotencyKey` 不一致 ⇒ `dispatch-evidence-missing`；
 * 3. identity/target：给出 `identity` 时必须与来源/目标一致；
 * 4. assigned-task：convener 的**生产派发**必须绑定当前真实受派的 open `stage-request` 任务；
 * 5. stage-request 另需 `sourceTaskId`（host 捕获）；缺失 ⇒ `stage-request-source-missing`。
 */
function withEvidence(
  input: FixedDispatchPolicyInput,
  purpose: RoleDispatchPurpose,
  source: string,
  reviewRoleId: string | undefined,
  options: { requireSourceTaskId?: boolean } = {},
): FixedDispatchPolicyResult {
  const evidence = input.evidence;
  if (evidence === undefined) {
    return deny(
      "dispatch-evidence-missing",
      "派发未受理：fixed 派发必须携带 live-turn / assigned-task / identity / 幂等证据（不得默认通过）。",
      ["evidence"],
    );
  }
  if (evidence.sourceIsCurrent !== true) {
    return deny("dispatch-source-changed", "派发未受理：来源会话/轮次已变化或不可证（sourceIsCurrent=false/缺省）。");
  }
  if (!isNonEmptyString(evidence.idempotencyKey)) {
    return deny("dispatch-evidence-missing", "派发未受理：缺少应用计算的幂等键证据。", ["idempotencyKey"]);
  }
  if (isNonEmptyString(evidence.expectedIdempotencyKey) && evidence.expectedIdempotencyKey !== evidence.idempotencyKey) {
    return deny(
      "dispatch-evidence-missing",
      "派发未受理：幂等键与应使用的幂等键不一致（不得重复投递或改写幂等键）。",
      ["idempotencyKey"],
    );
  }
  if (evidence.identity !== undefined) {
    const identity = evidence.identity;
    if ((identity.sourceRoleId !== undefined && identity.sourceRoleId !== source)
      || (identity.targetRoleId !== undefined && identity.targetRoleId !== input.targetRoleId)) {
      return deny("dispatch-evidence-missing", "派发未受理：identity 证据与真实来源/目标不一致。", ["identity"]);
    }
  }
  if (purpose === "stage-request") {
    if (!isNonEmptyString(evidence.sourceTaskId)) {
      return deny(
        "stage-request-source-missing",
        "stage-request 未创建：缺少 chief 当前真实客户轮次（sourceTaskId 由 host 捕获，不可模型自报）。",
        ["sourceTaskId"],
      );
    }
  } else if (source !== "chief") {
    // convener 的生产派发：必须绑定当前真实受派的 open stage-request 任务。
    const assigned = evidence.assignedTask;
    if (assigned === undefined) {
      return deny(
        "stage-request-required",
        "派发未受理：运营的生产派发必须绑定当前真实受派的 open stage-request 任务。",
        ["assignedTask"],
      );
    }
    if (assigned.open !== true || assigned.stopped === true) {
      return deny(
        "stage-request-required",
        "派发未受理：绑定的 stage-request 任务已关闭/已停止/非 open，不得再派发。",
        ["assignedTask.open"],
      );
    }
    if (assigned.from !== "chief" || assigned.to !== source || assigned.taskKind !== "stage-request") {
      return deny(
        "dispatch-evidence-missing",
        "派发未受理：assigned-task 证据的创建者/受派人/种类与真实派发不符。",
        ["assignedTask.from/to/taskKind"],
      );
    }
    const workflowId = input.workflow?.workflowId;
    if (workflowId !== undefined && assigned.workflowId !== undefined && assigned.workflowId !== workflowId) {
      return deny("dispatch-evidence-missing", "派发未受理：assigned-task 的 workflowId 与本次派发不一致。", ["assignedTask.workflowId"]);
    }
    const stage = input.workflow?.stage;
    if (stage !== undefined && assigned.stage !== undefined && assigned.stage !== stage) {
      return deny("dispatch-evidence-missing", "派发未受理：assigned-task 的 stage 与本次派发不一致。", ["assignedTask.stage"]);
    }
  }
  return {
    ok: true,
    purpose,
    ...(reviewRoleId !== undefined ? { reportToRoleId: reviewRoleId } : {}),
  };
}

/** `stage-request` 幂等键（v1.3 §3.3/G-4/G-12；首次也先算 workflowId 后统一使用）。 */
export function stageRequestIdempotencyKey(workflowId: string, stage: WorkflowStage, attempt: number): string {
  return `stage-request:${workflowId}:${stage}:${attempt}`;
}

/** `stop` 请求幂等键（v1.3 §3.3；独立于 advance）。 */
export function stageStopIdempotencyKey(workflowId: string, stage: WorkflowStage, attempt: number): string {
  return `stage-stop:${workflowId}:${stage}:${attempt}`;
}
