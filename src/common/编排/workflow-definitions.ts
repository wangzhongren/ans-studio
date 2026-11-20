// src/common/编排/workflow-definitions.ts
// 编排主属（2026-11-17 app-dispatch builtins 第一步）：应用内**类型化流程定义注册表**。
//
// 依据：docs/planning/2026-11-17_design_app-dispatch-builtins.md §三（阶段→执行者表）、
// §4.4（注册表）、§七（状态机/失败面）；Q9 裁定：类型化注册表（TS 常量 + JSON Schema 导出 +
// 定义 hash）；不引入 DSL/依赖；定义随应用发布，**模型/角色不可编辑**。
//
// 纪律：
//  · **纯数据 + 纯函数**：无 I/O、无时钟、无随机。
//  · 阶段集合/合法转移/返工边**唯一语义来源** = `workflow-state.ts`（`WORKFLOW_STAGE_TRANSITIONS`、
//    `WORKFLOW_REWORK_FALLBACKS`）；本模块的定义数据由 `validateWorkflowDefinitions()` 逐项核对，
//    漂移即自检失败（不猜、不自动修）。
//  · 定义 hash = canonical JSON（键排序）的 SHA-256；`workflow.started.definition.sha256` 钉死该值，
//    新版本只影响新 workflow（Q10：在飞不迁移）。
//  · 本模块不授予任何写权/派发权；执行者在会话层仍走全部门禁/边界。

import { createHash } from "node:crypto";

import type {
  GovernanceCardKind,
  TaskSideEffect,
  WorkflowPath,
  WorkflowStage,
} from "../../model/runtime.ts";
import { WORKFLOW_STAGES } from "../../model/runtime.ts";
import {
  WORKFLOW_REWORK_FALLBACKS,
  WORKFLOW_STAGE_TRANSITIONS,
} from "./workflow-state.ts";

/** 单条流程定义的 schema token。 */
export const WORKFLOW_DEFINITION_SCHEMA = "ans-workflow-definition/v1" as const;
/** 注册表导出 schema token（JSON Schema 导出用）。 */
export const WORKFLOW_DEFINITION_REGISTRY_SCHEMA = "ans-workflow-definitions/v1" as const;
/** 定义版本（当前注册表内全部定义为 v1；新增语义变更走 version+1，不静默迁移）。 */
export const WORKFLOW_DEFINITION_VERSION = 1 as const;

/** 默认内置流程 id：`add`＝新增（路径 A）；`modify`＝修改（路径 B）。 */
export const WORKFLOW_DEFINITION_IDS = Object.freeze(["add", "modify"] as const);
export type WorkflowDefinitionId = (typeof WORKFLOW_DEFINITION_IDS)[number];

/** 验收强度（Q2）：`light`＝轻量（B31 审计口径保留）；`standard`＝标准（默认）。 */
export const ACCEPTANCE_STRENGTHS = Object.freeze(["light", "standard"] as const);
export type AcceptanceStrength = (typeof ACCEPTANCE_STRENGTHS)[number];

/** 阶段执行者类别（应用侧驱动语义；与 `model/runtime.ts::WorkflowStageExecutorKind` 对齐并扩展定义侧类别）。 */
export type WorkflowExecutorKind =
  | "built-in" // 应用 → 内置执行者（stage-execution）
  | "worker-dispatch" // 应用 → 运营（worker-dispatch 任务；运营再派项目 worker）
  | "review" // 应用直派验收（verifier 或 roster reviewRoleId）
  | "card-prompt" // 应用 → 幕僚（呈客户卡）
  | "application" // 应用确定性阶段（无任务；B2 派生）
  | "customer"; // 应用自有卡（merge-main；客户本人确认）

/** 阶段任务种类（`none`＝无任务，应用派生/聚合）。 */
export type WorkflowStageTaskKind = "stage-execution" | "worker-dispatch" | "card-prompt" | "none";

/** 阶段完成判定类别（应用执行；判定输入只来自账本/真实任务事实，不采信模型自报）。 */
export type WorkflowStageCompletion =
  | "on-dispatch" // 任务创建（stage.dispatched）即完成（A1/A4/A7，沿用 DISPATCH_COMPLETES）
  | "task-accepted" // 任务 accepted 收口 + 应用证据（A2/A5/A8/A9/A12a/A12b/B1）
  | "card-resolved" // request.resolved 裁决 + 应用 finalize（A3/A6/A10）
  | "scope-decided" // change.scope-decided（B2）
  | "all-tasks-accepted" // 全部实现任务 accepted + 分支/提交证据（A11/B3）
  | "aggregate-acceptance" // A12b accepted + 归档 ⇒ A12 聚合完成
  | "release-or-close"; // release.merged 或 workflow.closed（A13/B4）

/** 阶段重试策略（Q8：每阶段 1 次自动重试后 stage.blocked；高风险零重派）。 */
export interface WorkflowStageRetryPolicy {
  /** 自动重试次数（0..2；实现类高风险阶段为 0）。 */
  readonly autoRetries: number;
  /** 重试耗尽后的处置（固定 blocked 交客户/运营；不自动跳过）。 */
  readonly onExhausted: "blocked";
  /** true = 高风险阶段零自动重派（沿用 watchdog 语义）。 */
  readonly highRiskNoRedispatch: boolean;
}

/** 客户卡定义（应用开卡；幕僚按 prompt 呈卡）。 */
export interface WorkflowCardDefinition {
  readonly cardKind: GovernanceCardKind;
  /** 应用计算 documentRefs 的文档种类（path+字节 SHA-256；空 = 无文档引用）。 */
  readonly documentKinds: readonly string[];
  /** 固定选项 id（顺序即卡面顺序）；空 = 应用按名单 role id 生成（appointment）。 */
  readonly optionIds: readonly string[];
  /** 推荐项 id 集（appointment 由名单角色 id 生成时为空，运行时取全部名单角色）。 */
  readonly recommended: readonly string[];
  /** true = 应用自有卡（merge-main：客户本人，judge 不可代批；不由幕僚呈卡）。 */
  readonly appOwned?: boolean;
}

/** 条件执行者（按定义解析；如 B1 契约/结构缺口 ⇒ rapporteur）。 */
export interface WorkflowFallbackExecutor {
  readonly executor: Extract<WorkflowExecutorKind, "built-in">;
  readonly executorRole: "rapporteur";
  readonly condition: "contract-or-structure-gap";
}

/** 单阶段定义。 */
export interface WorkflowStageDefinition {
  readonly stage: WorkflowStage;
  readonly title: string;
  readonly executor: WorkflowExecutorKind;
  /** built-in/review 的默认执行者；`review-role` = roster review 角色优先（缺省 verifier，Q3）。 */
  readonly executorRole?: "product" | "rapporteur" | "nominator" | "convener" | "verifier" | "review-role";
  readonly taskKind: WorkflowStageTaskKind;
  /** 应用创建的**任务**副作用（worker-dispatch/card-prompt 固定 read-only；内容任务 docs）。 */
  readonly sideEffect: TaskSideEffect;
  readonly completion: WorkflowStageCompletion;
  /** 完成判定所需的应用证据要点（审计口径；应用计算，不由模型自报）。 */
  readonly requiredEvidence: readonly string[];
  readonly card?: WorkflowCardDefinition;
  /** 高风险动作才出的条件卡（B3 `decision`；不是每轮必出）。 */
  readonly highRiskCard?: GovernanceCardKind;
  /** 合法后继（必须与 `WORKFLOW_STAGE_TRANSITIONS` 逐项一致；终态为空，由 workflow.closed 结束）。 */
  readonly next: readonly WorkflowStage[];
  /** 返工回落（必须与 `WORKFLOW_REWORK_FALLBACKS` 一致；仅 A3/A6/A12b/B2）。 */
  readonly reworkFallback?: WorkflowStage;
  readonly retry: WorkflowStageRetryPolicy;
  readonly fallbackExecutor?: WorkflowFallbackExecutor;
  /** 任务文本模板要点（迁入定义时逐条保留 v2.1/B13–B34 语义）。 */
  readonly taskText: { readonly summary: string; readonly details: readonly string[] };
}

/** 验收策略（Q2：定义参数；`select_workflow` 可选覆盖强度，应用执行）。 */
export interface WorkflowAcceptancePolicy {
  readonly defaultStrength: AcceptanceStrength;
  /** 轻量验收：A12b blocked 报告 + 应用归档证据 + 决策 note 时可接受（B31 语义保留）。 */
  readonly lightBlockedDisposition: "accept-with-archive" | "blocked";
  /** 标准验收：blocked 处置（固定 blocked 交客户/运营）。 */
  readonly standardBlockedDisposition: "blocked";
}

/** 一条流程定义（只读；随应用发布）。 */
export interface WorkflowDefinition {
  readonly schema: typeof WORKFLOW_DEFINITION_SCHEMA;
  readonly id: WorkflowDefinitionId;
  readonly version: number;
  readonly path: WorkflowPath;
  readonly title: string;
  readonly acceptance: WorkflowAcceptancePolicy;
  /** 应用驱动的阶段顺序（含无任务聚合阶段；与 `next` 合法边一致）。 */
  readonly driveOrder: readonly WorkflowStage[];
  readonly stages: readonly WorkflowStageDefinition[];
}

const DEFAULT_RETRY: WorkflowStageRetryPolicy = {
  autoRetries: 1,
  onExhausted: "blocked",
  highRiskNoRedispatch: false,
};

/** 高风险实现/交付阶段：零自动重派（Q8）。 */
const HIGH_RISK_RETRY: WorkflowStageRetryPolicy = {
  autoRetries: 0,
  onExhausted: "blocked",
  highRiskNoRedispatch: true,
};

/** 应用派生/聚合阶段：无任务、无重试。 */
const NO_TASK_RETRY: WorkflowStageRetryPolicy = {
  autoRetries: 0,
  onExhausted: "blocked",
  highRiskNoRedispatch: false,
};

const COMMON_ACCEPTANCE: WorkflowAcceptancePolicy = {
  defaultStrength: "standard",
  lightBlockedDisposition: "accept-with-archive",
  standardBlockedDisposition: "blocked",
};

const MERGE_MAIN_CARD: WorkflowCardDefinition = {
  cardKind: "merge-main",
  documentKinds: [],
  optionIds: ["approve", "reject"],
  recommended: [],
  appOwned: true,
};

// —————————————— 路径 A：新增（A1–A13） ——————————————

const ADD_STAGES: readonly WorkflowStageDefinition[] = [
  {
    stage: "A1",
    title: "产品受理/准备",
    executor: "built-in",
    executorRole: "product",
    taskKind: "stage-execution",
    sideEffect: "docs",
    completion: "on-dispatch",
    requiredEvidence: ["stage-dispatched-A1"],
    next: ["A2"],
    retry: DEFAULT_RETRY,
    taskText: {
      summary: "产品受理新项目并准备意图撰写",
      details: [
        "任务由应用按流程定义创建；创建（stage.dispatched）即完成（沿用 DISPATCH_COMPLETES A1）",
        "确认新项目起点；整理客户输入中已给的意图要点",
        "不派发、不写盘越界；写盘仍走产品边界与门禁",
      ],
    },
  },
  {
    stage: "A2",
    title: "意图撰写",
    executor: "built-in",
    executorRole: "product",
    taskKind: "stage-execution",
    sideEffect: "docs",
    completion: "task-accepted",
    requiredEvidence: ["intent-doc", "intent-sha256", "intent-entry"],
    next: ["A3"],
    retry: DEFAULT_RETRY,
    taskText: {
      summary: "撰写产品意图意图文件与意图入口",
      details: [
        "产出 docs/product/<flowId>-intent-vN.md（frontmatter schema=project-intent/v1，version 与文件名一致）",
        "同时写 docs/intents/<intentId>.md 入口（B24：呈 A3 卡前应用校验入口）",
        "报告后由应用重算字节 SHA-256 并收口；hash/入口缺失 ⇒ 不收口",
      ],
    },
  },
  {
    stage: "A3",
    title: "意图确认（客户卡①）",
    executor: "card-prompt",
    taskKind: "card-prompt",
    sideEffect: "read-only",
    completion: "card-resolved",
    requiredEvidence: ["request-resolved-confirm", "intent-entry-consistent"],
    card: {
      cardKind: "intent-confirm",
      documentKinds: ["intent"],
      optionIds: ["confirm", "revise"],
      recommended: ["confirm"],
    },
    reworkFallback: "A2",
    next: ["A4"],
    retry: DEFAULT_RETRY,
    taskText: {
      summary: "按应用 prompt 呈意图确认卡（intent-confirm）",
      details: [
        "应用计算 documentRefs[intent]（path+version+sha256）并发放 promptId",
        "幕僚以 request_choice 原样回传 promptId/cardKind/选项/documentRefs；不一致 ⇒ card-prompt-mismatch（不发卡）",
        "confirm ⇒ 应用 finalizeIntent 完成 A3；revise ⇒ stage.reworked A3→A2；卡属 decision 组（judge 代批语义不变）",
      ],
    },
  },
  {
    stage: "A4",
    title: "策划受理/准备",
    executor: "built-in",
    executorRole: "rapporteur",
    taskKind: "stage-execution",
    sideEffect: "docs",
    completion: "on-dispatch",
    requiredEvidence: ["stage-dispatched-A4"],
    next: ["A5"],
    retry: DEFAULT_RETRY,
    taskText: {
      summary: "策划受理方案阶段并准备提案材料",
      details: [
        "任务由应用创建；创建即完成（沿用 DISPATCH_COMPLETES A4）",
        "准备方案/名单/模块/架构/契约的撰写输入",
      ],
    },
  },
  {
    stage: "A5",
    title: "方案/名单/模块/架构/契约",
    executor: "built-in",
    executorRole: "rapporteur",
    taskKind: "stage-execution",
    sideEffect: "docs",
    completion: "task-accepted",
    requiredEvidence: ["proposal", "roster", "modules", "architecture", "contracts", "sha256"],
    next: ["A6"],
    retry: DEFAULT_RETRY,
    taskText: {
      summary: "产出方案、名单、模块、架构与契约文档",
      details: [
        "docs/proposals/<flowId>-proposal-vN.md",
        "docs/proposals/<flowId>-modules-vN.md（schema 校验）",
        "docs/proposals/<flowId>-roster-vN.md（project-roster/v4；roles[].review 可选）",
        "docs/contracts/<flowId>-architecture-vN.md",
        "报告后应用重算 hash；缺证据/形态非法 ⇒ close-report-missing fail-closed",
      ],
    },
  },
  {
    stage: "A6",
    title: "方案确认（客户卡②）",
    executor: "card-prompt",
    taskKind: "card-prompt",
    sideEffect: "read-only",
    completion: "card-resolved",
    requiredEvidence: ["request-resolved-accept", "document-refs-app-computed"],
    card: {
      cardKind: "proposal",
      documentKinds: ["proposal", "roster", "modules", "architecture"],
      optionIds: ["accept", "accept-quick", "revise", "reject"],
      recommended: ["accept"],
    },
    reworkFallback: "A5",
    next: ["A7"],
    retry: DEFAULT_RETRY,
    taskText: {
      summary: "按应用 prompt 呈方案确认卡（proposal）",
      details: [
        "应用计算 documentRefs（proposal/roster/modules/architecture）并发放 promptId",
        "accept/accept-quick ⇒ 应用进入 A7；revise ⇒ stage.reworked A6→A5；reject ⇒ stage.blocked",
        "幕僚只呈卡与解释；不得增删选项/改写 documentRefs/自批",
      ],
    },
  },
  {
    stage: "A7",
    title: "人事受理/准备",
    executor: "built-in",
    executorRole: "nominator",
    taskKind: "stage-execution",
    sideEffect: "docs",
    completion: "on-dispatch",
    requiredEvidence: ["stage-dispatched-A7"],
    next: ["A8"],
    retry: DEFAULT_RETRY,
    taskText: {
      summary: "人事受理并准备建卡/激活材料",
      details: [
        "任务由应用创建；创建即完成（沿用 DISPATCH_COMPLETES A7）",
        "核对名单角色与三文档（card/boundary.md/boundary.yaml）的建卡输入",
      ],
    },
  },
  {
    stage: "A8",
    title: "建卡/激活",
    executor: "built-in",
    executorRole: "nominator",
    taskKind: "stage-execution",
    sideEffect: "docs",
    completion: "task-accepted",
    requiredEvidence: ["roster", "all-roster-roles-activated", "activation-document-hashes"],
    next: ["A9"],
    retry: DEFAULT_RETRY,
    taskText: {
      summary: "按名单建卡并激活全部名单角色",
      details: [
        "使用 activate_role_documents（固定 v2）建卡/激活；不派发",
        "应用核验 roster + 三文档 hash（B17：应用重算，不采信模型自报）",
        "完成要求全部名单角色 role.activated + 文档 hash 齐全",
      ],
    },
  },
  {
    stage: "A9",
    title: "团队计划 + 基线 3 件小事",
    executor: "built-in",
    executorRole: "convener",
    taskKind: "stage-execution",
    sideEffect: "docs",
    completion: "task-accepted",
    requiredEvidence: ["team-plan", "basis-recorded", "stage-completed-A9"],
    next: ["A10"],
    retry: DEFAULT_RETRY,
    taskText: {
      summary: "运营撰写团队计划并完成基线准备",
      details: [
        "团队计划 docs/scheduling/<flowId>-team-vN.md（complete_team_plan）",
        "基线 3 件小事 + basis.recorded（应用 recordBasis）",
        "完成写 stage.completed A9（cause.kind=basis-recorded，携带 basis ref）",
      ],
    },
  },
  {
    stage: "A10",
    title: "任命确认（客户卡③）",
    executor: "card-prompt",
    taskKind: "card-prompt",
    sideEffect: "read-only",
    completion: "card-resolved",
    requiredEvidence: ["request-resolved-appointment", "target-role-ids"],
    card: {
      cardKind: "appointment",
      documentKinds: ["roster"],
      optionIds: [],
      recommended: [],
    },
    next: ["A11", "A12a"],
    retry: DEFAULT_RETRY,
    taskText: {
      summary: "按应用 prompt 呈任命确认卡（appointment）",
      details: [
        "应用从名单生成选项（roleId）与推荐集（全部名单角色）并发放 promptId",
        "客户/有效委托选择后 targetRoleIds=选中名单角色；应用核验后推进",
        "D3 语义不变：不写卡、不激活；激活在 A8（已建卡角色）",
      ],
    },
  },
  {
    stage: "A12a",
    title: "验收标准（criteria）",
    executor: "review",
    executorRole: "review-role",
    taskKind: "stage-execution",
    sideEffect: "docs",
    completion: "task-accepted",
    requiredEvidence: ["criteria", "acceptance-criteria-hash", "accepted"],
    next: ["A11"],
    retry: DEFAULT_RETRY,
    taskText: {
      summary: "验收角色写验收标准（criteria）",
      details: [
        "应用直派 verifier 或 roster reviewRoleId 验收角色（Q3；与生产派发独立）",
        "criteria 任务 accepted + hash；A12a 可在 A11 实现期间先行完成（AC-09/G-1）",
        "A11 派发前 A12a 必须已创建（AC-09 实施前写标准）",
      ],
    },
  },
  {
    stage: "A11",
    title: "实现",
    executor: "worker-dispatch",
    executorRole: "convener",
    taskKind: "worker-dispatch",
    sideEffect: "read-only",
    completion: "all-tasks-accepted",
    requiredEvidence: ["all-implementation-tasks-accepted", "branch-tip-oid", "basis-not-drifted"],
    next: ["A12b"],
    retry: HIGH_RISK_RETRY,
    taskText: {
      summary: "应用建 worker-dispatch 任务 → 运营为各模块派 worker",
      details: [
        "运营按团队计划 writesets 与模块清单派项目 worker（只能派绑定本 open worker-dispatch 任务的项目角色）",
        "模块写集派生（B26）；实现 worker 禁 shell（B27/B28）；提交引号（B32）",
        "全部实现任务 accepted + 分支 tip OID + basis 未漂移才完成；高风险零自动重派",
      ],
    },
  },
  {
    stage: "A12b",
    title: "验收报告",
    executor: "review",
    executorRole: "review-role",
    taskKind: "stage-execution",
    sideEffect: "docs",
    completion: "task-accepted",
    requiredEvidence: ["acceptance-report", "report-sha256", "acceptance-archive"],
    reworkFallback: "A11",
    next: ["A12", "A13"],
    retry: DEFAULT_RETRY,
    taskText: {
      summary: "验收角色出验收报告（应用直派并归档）",
      details: [
        "应用直派 verifier 或 roster reviewRoleId 验收角色；与运营生产派发相互独立",
        "report accepted + hash + 应用归档 docs/acceptance/*（archiveAcceptance）",
        "B31：轻量验收（定义参数 light）在 blocked 报告 + acceptanceArchive + 决策 note 时可 accepted；标准验收按 blocked 处置",
        "rework ⇒ stage.reworked A12b→A11（MF-IR-1）",
      ],
    },
  },
  {
    stage: "A12",
    title: "验收聚合完成",
    executor: "application",
    taskKind: "none",
    sideEffect: "read-only",
    completion: "aggregate-acceptance",
    requiredEvidence: ["A12b-completed", "acceptance-archive"],
    next: ["A13"],
    retry: NO_TASK_RETRY,
    taskText: {
      summary: "A12b accepted + 归档后应用聚合完成 A12（无任务）",
      details: [
        "等待 A12b completed 且 acceptanceArchive 已写入",
        "应用追加 stage.completed A12（cause=acceptance-archive；G-16）",
      ],
    },
  },
  {
    stage: "A13",
    title: "集成/交付/发布",
    executor: "built-in",
    executorRole: "convener",
    taskKind: "stage-execution",
    sideEffect: "docs",
    completion: "release-or-close",
    requiredEvidence: ["integration-summary", "merge-main-confirmed", "release-merged-or-closed"],
    card: MERGE_MAIN_CARD,
    next: [],
    retry: HIGH_RISK_RETRY,
    taskText: {
      summary: "运营集成汇总 → 应用构造 merge-main 卡 → 客户本人确认 → 应用合并",
      details: [
        "运营汇总（stage-execution）；应用 prepareReleaseMerge 构造高风险合并卡",
        "merge-main 必须客户本人 approve/reject；judge 不可代批（只能转人工/拒绝）",
        "应用执行合并（不 push/tag）；release.merged 或 workflow.closed 完成 A13",
      ],
    },
  },
];

// —————————————— 路径 B：修改（B1–B4） ——————————————

const MODIFY_STAGES: readonly WorkflowStageDefinition[] = [
  {
    stage: "B1",
    title: "影响面分析",
    executor: "worker-dispatch",
    executorRole: "convener",
    taskKind: "worker-dispatch",
    sideEffect: "read-only",
    completion: "task-accepted",
    requiredEvidence: ["impact-report", "report-sha256", "module-owners"],
    next: ["B2"],
    retry: DEFAULT_RETRY,
    fallbackExecutor: { executor: "built-in", executorRole: "rapporteur", condition: "contract-or-structure-gap" },
    taskText: {
      summary: "应用建 worker-dispatch 任务 → 运营派默认模块属主 worker 做影响面分析",
      details: [
        "默认由模块属主 worker 分析；契约/结构缺口按定义由 rapporteur 出分析（应用直派）",
        "分析任务 accepted + 报告 hash（应用重算）是 B2 派生输入",
        "报告属主/模块/边界证据不足 ⇒ B2 b-change-scope-invalid（不猜）",
      ],
    },
  },
  {
    stage: "B2",
    title: "范围决定（应用确定性派生）",
    executor: "application",
    taskKind: "none",
    sideEffect: "read-only",
    completion: "scope-decided",
    requiredEvidence: ["b1-impact-report", "module-ownership", "authority-boundary", "effective-writesets"],
    reworkFallback: "B1",
    next: ["B3"],
    retry: NO_TASK_RETRY,
    taskText: {
      summary: "应用在 B1 完成后确定性派生范围（Q4；不建任务、不发 stage-request）",
      details: [
        "派生 = B1 报告 ∩ 名单模块属主 ∩ 角色边界；effectiveWritesets 由应用计算",
        "歧义/证据不足/治理文档非策划产品属主 ⇒ b-change-scope-invalid（阻塞，不猜）",
        "写 change.scope-decided；不再存在 B2 stage-request 死锁类（B34）",
      ],
    },
  },
  {
    stage: "B3",
    title: "修改实现",
    executor: "worker-dispatch",
    executorRole: "convener",
    taskKind: "worker-dispatch",
    sideEffect: "read-only",
    completion: "all-tasks-accepted",
    requiredEvidence: ["all-implementation-tasks-accepted", "commit-oid", "writesets-not-drifted"],
    highRiskCard: "decision",
    next: ["B4"],
    retry: HIGH_RISK_RETRY,
    taskText: {
      summary: "应用建 worker-dispatch 任务 → 运营按 B2 写集派 worker 实现",
      details: [
        "写集来源 = B2 effectiveWritesets（应用派生，不采信模型自报）",
        "高风险动作才出 decision 卡（材料性选择；运营发起、客户/有效委托决定）",
        "全部实现任务 accepted + 提交 OID 才完成；高风险零自动重派",
      ],
    },
  },
  {
    stage: "B4",
    title: "汇总/交付/发布",
    executor: "built-in",
    executorRole: "convener",
    taskKind: "stage-execution",
    sideEffect: "docs",
    completion: "release-or-close",
    requiredEvidence: ["integration-summary", "merge-main-confirmed", "release-merged-or-closed"],
    card: MERGE_MAIN_CARD,
    next: [],
    retry: HIGH_RISK_RETRY,
    taskText: {
      summary: "运营汇总 → 应用构造 merge-main 卡 → 客户本人确认 → 应用合并",
      details: [
        "运营汇总（stage-execution）；应用 prepareReleaseMerge 构造高风险合并卡",
        "merge-main 必须客户本人 approve/reject；judge 不可代批",
        "应用执行合并（不 push/tag）；release.merged 或 workflow.closed 完成 B4",
      ],
    },
  },
];

// —————————————— 深度冻结 / canonical JSON / hash ——————————————

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = canonicalize(source[key]);
    return out;
  }
  return value;
}

/** canonical JSON（对象键递归排序；hash/比较共用）。 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** 定义 hash：canonical JSON 的 SHA-256（`workflow.started.definition.sha256` 的唯一来源）。 */
export function workflowDefinitionHash(definition: WorkflowDefinition): string {
  return createHash("sha256").update(canonicalJson(definition), "utf8").digest("hex");
}

// —————————————— 注册表（只读） ——————————————

const ADD_DEFINITION: WorkflowDefinition = deepFreeze({
  schema: WORKFLOW_DEFINITION_SCHEMA,
  id: "add" as const,
  version: WORKFLOW_DEFINITION_VERSION,
  path: "A" as const,
  title: "新增（路径 A：A1–A13）",
  acceptance: COMMON_ACCEPTANCE,
  driveOrder: ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A12a", "A11", "A12b", "A12", "A13"] as const,
  stages: ADD_STAGES,
});

const MODIFY_DEFINITION: WorkflowDefinition = deepFreeze({
  schema: WORKFLOW_DEFINITION_SCHEMA,
  id: "modify" as const,
  version: WORKFLOW_DEFINITION_VERSION,
  path: "B" as const,
  title: "修改（路径 B：B1–B4）",
  acceptance: COMMON_ACCEPTANCE,
  driveOrder: ["B1", "B2", "B3", "B4"] as const,
  stages: MODIFY_STAGES,
});

/** 应用内流程定义注册表（只读；模型/角色不可编辑；`select_workflow` 枚举来源）。 */
export const WORKFLOW_DEFINITIONS: Readonly<Record<WorkflowDefinitionId, WorkflowDefinition>> = Object.freeze({
  add: ADD_DEFINITION,
  modify: MODIFY_DEFINITION,
});

/** 注册表定义 hash 表（启动即可用；与 `workflow.started.definition.sha256` 对照）。 */
export const WORKFLOW_DEFINITION_HASHES: Readonly<Record<WorkflowDefinitionId, string>> = Object.freeze({
  add: workflowDefinitionHash(ADD_DEFINITION),
  modify: workflowDefinitionHash(MODIFY_DEFINITION),
});

/** 按路径取默认定义 id（A→add；B→modify）。 */
export function workflowDefinitionIdForPath(path: WorkflowPath): WorkflowDefinitionId {
  return path === "B" ? "modify" : "add";
}

export type WorkflowDefinitionLookupFailureCode =
  | "workflow-definition-unknown"
  | "workflow-definition-version-unsupported";

export type WorkflowDefinitionLookupResult =
  | { ok: true; definition: WorkflowDefinition; hash: string }
  | { ok: false; code: WorkflowDefinitionLookupFailureCode; message: string };

/**
 * 按 id/version 取定义（fail-closed）：
 * - 未知 id ⇒ `workflow-definition-unknown`；
 * - 显式 version 与注册表版本不符 ⇒ `workflow-definition-version-unsupported`（不静默迁移）。
 */
export function getWorkflowDefinition(id: unknown, version?: unknown): WorkflowDefinitionLookupResult {
  const definition = typeof id === "string" && Object.hasOwn(WORKFLOW_DEFINITIONS, id)
    ? WORKFLOW_DEFINITIONS[id as WorkflowDefinitionId]
    : undefined;
  if (definition === undefined) {
    return {
      ok: false,
      code: "workflow-definition-unknown",
      message: `未知流程定义：${String(id)}（注册表仅含 ${WORKFLOW_DEFINITION_IDS.join("/")}）。`,
    };
  }
  if (version !== undefined && version !== definition.version) {
    return {
      ok: false,
      code: "workflow-definition-version-unsupported",
      message: `流程定义 ${definition.id} 仅支持 version ${definition.version}（收到 ${String(version)}；不静默迁移）。`,
    };
  }
  return { ok: true, definition, hash: WORKFLOW_DEFINITION_HASHES[definition.id] };
}

/** 注册表全部定义（只读、按固定顺序：add、modify）。 */
export function listWorkflowDefinitions(): readonly WorkflowDefinition[] {
  return WORKFLOW_DEFINITION_IDS.map((id) => WORKFLOW_DEFINITIONS[id]);
}

// —————————————— JSON Schema 导出（Q9；纯函数、无依赖） ——————————————

const EXECUTOR_KINDS = ["built-in", "worker-dispatch", "review", "card-prompt", "application", "customer"] as const;
const TASK_KINDS = ["stage-execution", "worker-dispatch", "card-prompt", "none"] as const;
const COMPLETIONS = [
  "on-dispatch", "task-accepted", "card-resolved", "scope-decided", "all-tasks-accepted",
  "aggregate-acceptance", "release-or-close",
] as const;
const SIDE_EFFECTS = ["read-only", "docs", "code", "external", "destructive", "unknown"] as const;
const EXECUTOR_ROLES = ["product", "rapporteur", "nominator", "convener", "verifier", "review-role"] as const;

/** 单条定义的 JSON Schema（draft 2020-12；由类型化定义数据生成，字段枚举即注册表值域）。 */
export function workflowDefinitionJsonSchema(definition: WorkflowDefinition): Record<string, unknown> {
  const stageIds = definition.stages.map((stage) => stage.stage);
  const stageSchema: Record<string, unknown> = {
    type: "object",
    additionalProperties: false,
    required: ["stage", "title", "executor", "taskKind", "sideEffect", "completion", "requiredEvidence", "next", "retry", "taskText"],
    properties: {
      stage: { enum: stageIds },
      title: { type: "string", minLength: 1 },
      executor: { enum: [...EXECUTOR_KINDS] },
      executorRole: { enum: [...EXECUTOR_ROLES] },
      taskKind: { enum: [...TASK_KINDS] },
      sideEffect: { enum: [...SIDE_EFFECTS] },
      completion: { enum: [...COMPLETIONS] },
      requiredEvidence: { type: "array", items: { type: "string", minLength: 1 } },
      card: {
        type: "object",
        additionalProperties: false,
        required: ["cardKind", "documentKinds", "optionIds", "recommended"],
        properties: {
          cardKind: { type: "string", minLength: 1 },
          documentKinds: { type: "array", items: { type: "string", minLength: 1 } },
          optionIds: { type: "array", items: { type: "string", minLength: 1 } },
          recommended: { type: "array", items: { type: "string", minLength: 1 } },
          appOwned: { type: "boolean" },
        },
      },
      highRiskCard: { type: "string", minLength: 1 },
      next: { type: "array", items: { enum: [...WORKFLOW_STAGES] } },
      reworkFallback: { enum: [...WORKFLOW_STAGES] },
      retry: {
        type: "object",
        additionalProperties: false,
        required: ["autoRetries", "onExhausted", "highRiskNoRedispatch"],
        properties: {
          autoRetries: { type: "integer", minimum: 0, maximum: 2 },
          onExhausted: { const: "blocked" },
          highRiskNoRedispatch: { type: "boolean" },
        },
      },
      fallbackExecutor: {
        type: "object",
        additionalProperties: false,
        required: ["executor", "executorRole", "condition"],
        properties: {
          executor: { const: "built-in" },
          executorRole: { const: "rapporteur" },
          condition: { const: "contract-or-structure-gap" },
        },
      },
      taskText: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "details"],
        properties: {
          summary: { type: "string", minLength: 1 },
          details: { type: "array", items: { type: "string", minLength: 1 } },
        },
      },
    },
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: definition.title,
    type: "object",
    additionalProperties: false,
    required: ["schema", "id", "version", "path", "title", "acceptance", "driveOrder", "stages"],
    properties: {
      schema: { const: WORKFLOW_DEFINITION_SCHEMA },
      id: { const: definition.id },
      version: { const: definition.version },
      path: { const: definition.path },
      title: { const: definition.title },
      acceptance: {
        type: "object",
        additionalProperties: false,
        required: ["defaultStrength", "lightBlockedDisposition", "standardBlockedDisposition"],
        properties: {
          defaultStrength: { enum: [...ACCEPTANCE_STRENGTHS] },
          lightBlockedDisposition: { enum: ["accept-with-archive", "blocked"] },
          standardBlockedDisposition: { const: "blocked" },
        },
      },
      driveOrder: {
        type: "array",
        minItems: stageIds.length,
        maxItems: stageIds.length,
        items: { enum: stageIds },
      },
      stages: {
        type: "array",
        minItems: stageIds.length,
        maxItems: stageIds.length,
        items: stageSchema,
      },
    },
  };
}

/** 注册表 JSON Schema（导出/校验用；`definitions` 键 = 注册表 id）。 */
export function workflowDefinitionsJsonSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "ANS workflow definitions registry",
    type: "object",
    additionalProperties: false,
    required: ["schema", "definitions"],
    properties: {
      schema: { const: WORKFLOW_DEFINITION_REGISTRY_SCHEMA },
      definitions: {
        type: "object",
        additionalProperties: false,
        required: [...WORKFLOW_DEFINITION_IDS],
        properties: Object.fromEntries(
          WORKFLOW_DEFINITION_IDS.map((id) => [id, workflowDefinitionJsonSchema(WORKFLOW_DEFINITIONS[id])]),
        ),
      },
    },
  };
}

// —————————————— 自检（与 workflow-state.ts 逐项一致） ——————————————

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * 注册表自检（纯函数；返回空数组 = 通过）：
 * - 阶段全覆盖：add = A1–A13（含 A12a/A12b/A12 聚合）；modify = B1–B4；全项目阶段恰被一条定义覆盖；
 * - 每阶段 `next` 与 `WORKFLOW_STAGE_TRANSITIONS` **逐项一致**；
 * - 每阶段 `reworkFallback` 与 `WORKFLOW_REWORK_FALLBACKS` 一致（双向：有/无）；
 * - `driveOrder` 覆盖全部阶段且相邻对为合法边；
 * - executor/taskKind/card/retry 形状自洽（fail-closed 口径）。
 */
export function validateWorkflowDefinitions(): readonly string[] {
  const errors: string[] = [];
  for (const id of WORKFLOW_DEFINITION_IDS) {
    const definition = WORKFLOW_DEFINITIONS[id];
    const label = `definition ${id}`;
    if (definition.id !== id) errors.push(`${label}: id 字段不一致（${definition.id}）`);
    if (definition.schema !== WORKFLOW_DEFINITION_SCHEMA) errors.push(`${label}: schema 非 ${WORKFLOW_DEFINITION_SCHEMA}`);
    if (!Number.isInteger(definition.version) || definition.version < 1) errors.push(`${label}: version 非正整数`);
    const expectedPath: WorkflowPath = id === "add" ? "A" : "B";
    if (definition.path !== expectedPath) errors.push(`${label}: path 必须为 ${expectedPath}`);

    const expectedStages: readonly WorkflowStage[] = id === "add"
      ? ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12", "A12a", "A12b", "A13"]
      : ["B1", "B2", "B3", "B4"];
    const actualStages = definition.stages.map((stage) => stage.stage);
    if (actualStages.length !== new Set(actualStages).size) errors.push(`${label}: 阶段重复`);
    const missing = expectedStages.filter((stage) => !actualStages.includes(stage));
    const extra = actualStages.filter((stage) => !expectedStages.includes(stage));
    if (missing.length > 0) errors.push(`${label}: 缺阶段 ${missing.join(",")}`);
    if (extra.length > 0) errors.push(`${label}: 多余阶段 ${extra.join(",")}`);

    for (const stage of definition.stages) {
      const stageLabel = `${label}/${stage.stage}`;
      const canonicalNext = WORKFLOW_STAGE_TRANSITIONS[stage.stage];
      if (!sameStringArray(stage.next, canonicalNext)) {
        errors.push(`${stageLabel}: next=[${stage.next.join(",")}] 与转移表 [${canonicalNext.join(",")}] 不一致`);
      }
      const canonicalRework = WORKFLOW_REWORK_FALLBACKS[stage.stage];
      if (canonicalRework === undefined) {
        if (stage.reworkFallback !== undefined) {
          errors.push(`${stageLabel}: 转移表无返工边但定义给出 ${stage.reworkFallback}`);
        }
      } else if (stage.reworkFallback !== canonicalRework) {
        errors.push(`${stageLabel}: reworkFallback=${String(stage.reworkFallback)} 与冻结映射 ${canonicalRework} 不一致`);
      }
      const hasTask = stage.taskKind !== "none";
      const needsApplication = stage.executor === "application" || stage.executor === "customer";
      if (needsApplication && hasTask) errors.push(`${stageLabel}: application/customer 阶段不得建任务`);
      if (stage.executor === "worker-dispatch" && stage.taskKind !== "worker-dispatch") {
        errors.push(`${stageLabel}: worker-dispatch 执行者必须用 worker-dispatch 任务`);
      }
      if (stage.executor === "card-prompt" && stage.taskKind !== "card-prompt") {
        errors.push(`${stageLabel}: card-prompt 执行者必须用 card-prompt 任务`);
      }
      if ((stage.executor === "built-in" || stage.executor === "review") && stage.taskKind !== "stage-execution") {
        errors.push(`${stageLabel}: built-in/review 执行者必须用 stage-execution 任务`);
      }
      if (stage.taskKind === "card-prompt" && stage.card === undefined) {
        errors.push(`${stageLabel}: card-prompt 阶段缺少 card 定义`);
      }
      if (stage.card !== undefined && stage.card.appOwned === true && stage.card.cardKind !== "merge-main") {
        errors.push(`${stageLabel}: appOwned 卡只允许 merge-main`);
      }
      if (!Number.isInteger(stage.retry.autoRetries) || stage.retry.autoRetries < 0 || stage.retry.autoRetries > 2) {
        errors.push(`${stageLabel}: autoRetries 必须在 0..2`);
      }
      if (stage.retry.highRiskNoRedispatch && stage.retry.autoRetries !== 0) {
        errors.push(`${stageLabel}: 高风险零重派阶段 autoRetries 必须为 0`);
      }
      if (stage.taskText.summary.trim() === "" || stage.taskText.details.length === 0) {
        errors.push(`${stageLabel}: taskText 模板不得为空`);
      }
    }

    const driveOrder = definition.driveOrder;
    if (driveOrder.length !== actualStages.length || new Set(driveOrder).size !== driveOrder.length) {
      errors.push(`${label}: driveOrder 必须恰覆盖全部阶段且不重复`);
    }
    for (const stage of driveOrder) {
      if (!actualStages.includes(stage)) errors.push(`${label}: driveOrder 含未定义阶段 ${stage}`);
    }
    for (let index = 0; index + 1 < driveOrder.length; index += 1) {
      const from = driveOrder[index]!;
      const to = driveOrder[index + 1]!;
      if (!WORKFLOW_STAGE_TRANSITIONS[from].includes(to)) {
        errors.push(`${label}: driveOrder 相邻边 ${from}→${to} 非法`);
      }
    }
  }
  // 全项目阶段覆盖：每个 WorkflowStage 恰属一条定义。
  for (const stage of WORKFLOW_STAGES) {
    const owners = WORKFLOW_DEFINITION_IDS.filter((id) =>
      WORKFLOW_DEFINITIONS[id].stages.some((entry) => entry.stage === stage));
    if (owners.length !== 1) {
      errors.push(`stage ${stage}: 注册表归属数 ${owners.length}（应恰为 1）`);
    }
  }
  return errors;
}
