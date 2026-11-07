// test/roles/chief/oracle-fixture.ts
//
// chief 角色模块差分金样（E2 X-R6 fixture 金样化；E2 检查单 G9 / B1 M4；
// 先例 test/roles/rapporteur/oracle-fixture.ts、test/roles/convener/oracle-fixture.ts、
// test/roles/verifier/oracle-fixture.ts）。
//
// 捕获方式（2026-11-07，工作树 trunk-amendment；一次性工具
// `角色卡/chief-code/docs/change/2026-11-07_E2-XR6_golden-capture.mjs`）：
//  - 规格/卡文本：E1 从旧 `BUILT_IN_GOVERNANCE_ROLES` chief 行逐字段捕获；X-R6 门面切换后
//    逐字段复核实测（自比较）0 差异后冻结；独立物证 = E1 证据 §3（编辑前差分 0）与 X-R6 §7。
//  - cards：`run-role.ts::TRIO_CARD_KINDS.chief` 源码提取 = ["intent-confirm"]（D8）。
//  - tools：D1 `ROLE_TOOL_CATALOG` 14 项 + 旧 `validateRoleToolDeclaration("chief", CHIEF_TOOL_IDS)`
//    捕获（allow:true / 6 绑定 / reasons:[]，含 E2 C-1 `closeCreatedTask`）；旧 run-role 注入门控
//    逐字冻结为历史锚点（不依赖旧文件结构/行号）。
//  - dispatch：逐用例调用旧 `evaluateDispatchAuthorization`（+ `reportTargetForTaskCreator`）
//    捕获 oldAllow/oldCode/oldReport；新模块 expectedAllow/稳定码/reportToRoleId 同批冻结。
//  - preflight：旧 `validateVersionDecisionRequest` 捕获 oldAllow；新模块 allow/稳定码逐例冻结。
//    runId/refs 路径形状由宿主最终校验（2 例 documented）。
//  - context 资源：`loadBuiltinChiefWorkflow()` 捕获 path/version/sha256/bytes。
//  - hub 数据：`CHIEF_HUB_DISPATCH` + apply-journal 源字符串 oracle（目标五内置/routing/from）。
//
// 本文件是**冻结金样**：测试只 import 本 fixture（纯数据）；不读取旧引擎文件字节、不 import 旧
// oracle 模块，旧实现删除后差分仍可运行。`ORACLE_GOLDEN_META` 记录来源候选/捕获期哈希/切换后
// 实测/覆盖映射/载荷哈希（防静默漂移）。重新捕获须同步更新 `payloadSha256` 并在角色证据登记
// （不得删断言/删矩阵/整文件替换）。

import type { RoleToolId } from "../../../src/model/role.ts";

export interface OracleBoundaryEntry {
  readonly root: "project";
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly purpose: string;
}

export interface OracleCapabilities {
  readonly customerInput: boolean;
  readonly dispatchTask: boolean;
  readonly roleStatus: boolean;
  readonly sessionTail: boolean;
  readonly installSkill: boolean;
  readonly installMcp: boolean;
  readonly shell: "none" | "readonly" | "operator-approve";
}

/** 旧注册表 chief 规格（逐字段；E1 捕获，X-R6 切换后复核 0 差异）。 */
export const ORACLE_CHIEF_SPEC = Object.freeze({
  id: "chief",
  displayName: "幕僚",
  function: "chief",
  entries: Object.freeze<readonly OracleBoundaryEntry[]>([
    {
      root: "project",
      path: "docs/intents/",
      kind: "directory",
      purpose: "客户意图 / 沟通记录（intentId/handoffKind/goal/scope/acceptance/客户原话）",
    },
  ]),
  preauthorizedDirs: Object.freeze([
    "docs/intents/",
  ]),
  forbiddenWritePaths: Object.freeze([
    ".ans/",
    "docs/bootstrap-manifest.md",
    "角色卡/governance-boundary.yaml",
    "角色卡/",
    "docs/proposals/",
    "docs/contracts/",
    "docs/nominations/",
    "docs/skills/",
    "docs/mcp/",
    "docs/governance/",
    "docs/workflow.md",
  ]),
  capabilities: Object.freeze<OracleCapabilities>({
    customerInput: true,
    dispatchTask: true,
    roleStatus: true,
    sessionTail: true,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
  }),
  cards: Object.freeze([
    "intent-confirm",
  ]),
  cardText: Object.freeze({
    length: 1680,
    lineCount: 22,
    sha256: "bdca98f9ee0d7875d0d9812107a2565af897a5a37b4987c7256294da6381935f",
  }),
});

export interface OracleRoleToolCatalogEntry {
  readonly id: RoleToolId;
  readonly name: string;
  readonly allowedRoleIds: readonly string[];
  readonly chiefIndependentDecisionOnly?: true;
}

/** D1 `ROLE_TOOL_CATALOG` 14 项冻结清单（E1 捕获；chief 允许 7 项，其中 decidePendingRequest 仅独立决策上下文）。 */
export const ORACLE_ROLE_TOOL_CATALOG: readonly OracleRoleToolCatalogEntry[] = Object.freeze([
  Object.freeze({
    id: "roleActivityLog",
    name: "role_activity_log",
    allowedRoleIds: Object.freeze(["chief"]),
  }),
  Object.freeze({
    id: "terminateRoleRun",
    name: "terminate_role_run",
    allowedRoleIds: Object.freeze(["chief"]),
  }),
  Object.freeze({
    id: "redispatchTask",
    name: "redispatch_task",
    allowedRoleIds: Object.freeze(["chief"]),
  }),
  Object.freeze({
    id: "projectNote",
    name: "project_note",
    allowedRoleIds: Object.freeze(["chief"]),
  }),
  Object.freeze({
    id: "requestVersionDecision",
    name: "request_version_decision",
    allowedRoleIds: Object.freeze(["chief"]),
  }),
  Object.freeze({
    id: "requestRequirementChange",
    name: "request_requirement_change",
    allowedRoleIds: Object.freeze(["rapporteur", "convener"]),
  }),
  Object.freeze({
    id: "submitVersionChange",
    name: "submit_version_change",
    allowedRoleIds: Object.freeze(["product", "rapporteur"]),
  }),
  Object.freeze({
    id: "selectRunChange",
    name: "select_run_change",
    allowedRoleIds: Object.freeze(["rapporteur"]),
  }),
  Object.freeze({
    id: "completeTeamPlan",
    name: "complete_team_plan",
    allowedRoleIds: Object.freeze(["convener"]),
  }),
  Object.freeze({
    id: "activateRoleDocuments",
    name: "activate_role_documents",
    allowedRoleIds: Object.freeze(["nominator"]),
  }),
  Object.freeze({
    id: "closeCreatedTask",
    name: "close_created_task",
    allowedRoleIds: Object.freeze(["chief", "convener"]),
  }),
  Object.freeze({
    id: "submitRefactor",
    name: "submit_refactor",
    allowedRoleIds: Object.freeze(["convener"]),
  }),
  Object.freeze({
    id: "requestStableWrite",
    name: "request_stable_write",
    allowedRoleIds: Object.freeze(["convener"]),
  }),
  Object.freeze({
    id: "decidePendingRequest",
    name: "decide_pending_request",
    allowedRoleIds: Object.freeze(["chief"]),
    chiefIndependentDecisionOnly: true,
  }),
]);

export interface OracleToolBinding {
  readonly id: RoleToolId;
  readonly name: string;
}

/** 旧 `validateRoleToolDeclaration("chief", CHIEF_TOOL_IDS)` 与模块 trio 声明冻结期望（6/6，含 closeCreatedTask）。 */
export const ORACLE_CHIEF_TOOL_DECLARATION = Object.freeze({
  tools: Object.freeze<readonly RoleToolId[]>([
    "roleActivityLog",
    "terminateRoleRun",
    "redispatchTask",
    "projectNote",
    "requestVersionDecision",
    "closeCreatedTask",
  ]),
  reasons: Object.freeze([]),
  validation: Object.freeze({
    allow: true,
    tools: Object.freeze<readonly OracleToolBinding[]>([
      {
        id: "roleActivityLog",
        name: "role_activity_log",
      },
      {
        id: "terminateRoleRun",
        name: "terminate_role_run",
      },
      {
        id: "redispatchTask",
        name: "redispatch_task",
      },
      {
        id: "projectNote",
        name: "project_note",
      },
      {
        id: "requestVersionDecision",
        name: "request_version_decision",
      },
      {
        id: "closeCreatedTask",
        name: "close_created_task",
      },
    ]),
    reasons: Object.freeze([]),
  }),
});

/** 旧 run-role 工具注入门控逐字锚点（E1 捕获期；旧实现删除后仅作历史记录，运行期不读取旧文件）。 */
export const ORACLE_RUN_ROLE_TOOL_GATES = Object.freeze({
  anchors: Object.freeze([
    "const roleActivityLog = trioSpec?.id === \"chief\" ? input.roleActivityLog : undefined;",
    "const terminateRoleRun = trioSpec?.id === \"chief\" ? input.terminateRoleRun : undefined;",
    "const redispatchTask = trioSpec?.id === \"chief\" ? input.redispatchTask : undefined;",
    "const projectNote = trioSpec?.id === \"chief\" ? input.projectNote : undefined;",
    "const requestVersionDecision = trioSpec !== undefined && canRequestVersionDecision(trioSpec.id) ? input.requestVersionDecision : undefined;",
    "const closeCreatedTask = directGovernance && (setup.role.id === \"chief\" || setup.role.id === \"convener\") ? input.closeCreatedTask : undefined;",
  ]),
  canRequestVersionDecisionPredicate: "function canRequestVersionDecision(roleId: string): boolean {\n  return roleId === \"chief\";\n}",
  directGovernanceDefinition: "const directGovernance = governanceModel === \"trio\" && builtInGovernance && isTrio && chiefDecisionContext === undefined;",
  anchor: "run-role.ts:1694-1705（工具门控）/ :1824/:1828（directGovernance closeCreatedTask）/ :2344-2346（canRequestVersionDecision）（E1 捕获期；旧实现删除后仅作历史锚点）",
});

/** 旧 runtime/tools 的 chief 独立决策上下文锚点（`decidePendingRequest` 不由普通会话声明）。 */
export const ORACLE_CHIEF_DECISION_CONTEXT = Object.freeze({
  builderFunction: "buildChiefDecisionTools",
  toolNameConstant: "DECIDE_PENDING_REQUEST_TOOL_NAME",
  anchor: "runtime/tools.ts（chief 独立决策上下文；E1 捕获期；旧实现删除后仅作历史锚点）",
});

export interface OracleDispatchInput {
  readonly sourceRoleId?: string;
  readonly targetRoleId: string;
  readonly targetKind: "project" | "built-in-governance";
  readonly targetExists?: boolean;
}

export interface OracleDispatchCase {
  readonly name: string;
  readonly input: OracleDispatchInput;
  /**
   * 差分口径：
   *  - `zero`：旧硬授权可表达同一宿主事实，allow/拒绝码/report 必须与 expected 一致；
   *  - `documented`：契约明文差异（存在性/来源归属），旧行为不同且方向固定（旧 allow → 模块 deny）。
   */
  readonly differential: "zero" | "documented";
  /** 旧实现行为锚点（历史；运行期不读取）。 */
  readonly oldAnchor: string;
  /** 旧 `evaluateDispatchAuthorization` 的 allow 位（捕获期）。 */
  readonly oldAllow: boolean;
  /** 旧拒绝码（仅诊断；新模块码见 expectedCode）。allow 时为 null。 */
  readonly oldCode: string | null;
  /** 旧 `reportTargetForTaskCreator` 的报告期望（allow 时为真实来源；否则 null）。 */
  readonly oldReportToRoleId: string | null;
  /** 新模块期望 allow 位。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码（allow 时为 null）。 */
  readonly expectedCode: string | null;
  /** 新模块期望报告角色（allow 时为 "chief"；仅差分期望，实际路由仍在编排）。 */
  readonly expectedReportToRoleId: string | null;
  /** 已知差异类别（`KNOWN_DELTAS` 前缀）；无差异为 null。 */
  readonly knownDelta: string | null;
}

/** 派发差分矩阵：zero 8 + documented 3 = 11 例（来源 = chief；含 1 例来源归属负例）。 */
export const ORACLE_DISPATCH_CASES: readonly OracleDispatchCase[] = Object.freeze([
  Object.freeze({
    name: "chief → product（内置/存在）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true }),
    differential: "zero",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    oldCode: null,
    oldReportToRoleId: "chief",
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "chief",
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief → rapporteur（内置/存在）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "rapporteur", targetKind: "built-in-governance", targetExists: true }),
    differential: "zero",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    oldCode: null,
    oldReportToRoleId: "chief",
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "chief",
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief → nominator（内置/存在）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "nominator", targetKind: "built-in-governance", targetExists: true }),
    differential: "zero",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    oldCode: null,
    oldReportToRoleId: "chief",
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "chief",
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief → convener（内置/存在）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "convener", targetKind: "built-in-governance", targetExists: true }),
    differential: "zero",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    oldCode: null,
    oldReportToRoleId: "chief",
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "chief",
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief → verifier（内置/存在）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true }),
    differential: "zero",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    oldCode: null,
    oldReportToRoleId: "chief",
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "chief",
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief → chief（自派禁止）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "chief", targetKind: "built-in-governance", targetExists: true }),
    differential: "zero",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    oldCode: "self-dispatch",
    oldReportToRoleId: null,
    expectedAllow: false,
    expectedCode: "self-dispatch",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief → liaison（闭集外内置目标）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "liaison", targetKind: "built-in-governance", targetExists: true }),
    differential: "zero",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    oldCode: "target-card-missing",
    oldReportToRoleId: null,
    expectedAllow: false,
    expectedCode: "target-card-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief → worker-a（项目目标禁止）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "worker-a", targetKind: "project", targetExists: true }),
    differential: "zero",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    oldCode: "chief-to-project-forbidden",
    oldReportToRoleId: null,
    expectedAllow: false,
    expectedCode: "chief-to-project-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief → product 且 targetExists=false（契约要求显式存在性）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance", targetExists: false }),
    differential: "documented",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    oldCode: null,
    oldReportToRoleId: "chief",
    expectedAllow: false,
    expectedCode: "target-card-missing",
    expectedReportToRoleId: null,
    knownDelta: "dispatch-existence",
  }),
  Object.freeze({
    name: "chief → product 且 targetExists 缺省（缺事实即拒绝）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance" }),
    differential: "documented",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    oldCode: null,
    oldReportToRoleId: "chief",
    expectedAllow: false,
    expectedCode: "target-card-missing",
    expectedReportToRoleId: null,
    knownDelta: "dispatch-existence",
  }),
  Object.freeze({
    name: "convener → worker-a（本模块只回答 chief 来源）",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "worker-a", targetKind: "project", targetExists: true }),
    differential: "documented",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    oldCode: null,
    oldReportToRoleId: "convener",
    expectedAllow: false,
    expectedCode: "chief-dispatch-source-not-chief",
    expectedReportToRoleId: null,
    knownDelta: "dispatch-scope",
  }),
]);

export interface OraclePreflightCase {
  readonly name: string;
  readonly facts: Readonly<Record<string, unknown>>;
  /** 差分口径：zero（旧请求形状 oracle 同判）/ documented（宿主最终校验更严，模块只做前置）。 */
  readonly differential: "zero" | "documented";
  /** 旧实现行为锚点（历史；运行期不读取）。 */
  readonly oldAnchor: string;
  /** 旧 `validateVersionDecisionRequest` 的 allow 位（捕获期）。 */
  readonly oldAllow: boolean;
  /** 新模块期望 allow 位（`allow:true` 只表示纯策略不反对）。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码（allow 时为 null）。 */
  readonly expectedCode: string | null;
  /** 已知差异类别（`KNOWN_DELTAS` 前缀）；差异 0 为 null。 */
  readonly knownDelta: string | null;
}

/** version-decision preflight 差分矩阵：zero 12 + documented 2 = 14 例。 */
export const ORACLE_PREFLIGHT_CASES: readonly OraclePreflightCase[] = Object.freeze([
  Object.freeze({
    name: "flowId + version-modify + reason 正例",
    facts: Object.freeze({
      flowId: "q2-new",
      action: "version-modify",
      reason: "需要新版本",
    }),
    differential: "zero",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（请求形状 oracle；E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "new-version-development + runId 正例",
    facts: Object.freeze({
      flowId: "q2-new",
      action: "new-version-development",
      reason: "x",
      runId: "run-hub-abc",
    }),
    differential: "zero",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（请求形状 oracle；E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "refs 两项正例",
    facts: Object.freeze({
      flowId: "q2-new",
      action: "version-modify",
      reason: "x",
      refs: [
        "docs/a.md",
        "docs/b.md",
      ],
    }),
    differential: "zero",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（请求形状 oracle；E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "缺 flowId（fact-missing）",
    facts: Object.freeze({
      action: "version-modify",
      reason: "x",
    }),
    differential: "zero",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（请求形状 oracle；E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "chief-preflight-fact-missing",
    knownDelta: null,
  }),
  Object.freeze({
    name: "flowId 非治理 slug",
    facts: Object.freeze({
      flowId: "Q2 New",
      action: "version-modify",
      reason: "x",
    }),
    differential: "zero",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（请求形状 oracle；E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "chief-preflight-fact-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "action 非版本决策动作",
    facts: Object.freeze({
      flowId: "q2-new",
      action: "upgrade",
      reason: "x",
    }),
    differential: "zero",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（请求形状 oracle；E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "chief-preflight-fact-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "reason 全空白",
    facts: Object.freeze({
      flowId: "q2-new",
      action: "version-modify",
      reason: "   ",
    }),
    differential: "zero",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（请求形状 oracle；E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "chief-preflight-fact-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "reason 超长（1001）",
    facts: Object.freeze({
      flowId: "q2-new",
      action: "version-modify",
      reason: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    }),
    differential: "zero",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（请求形状 oracle；E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "chief-preflight-fact-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "refs 超上限（6 项）",
    facts: Object.freeze({
      flowId: "q2-new",
      action: "version-modify",
      reason: "x",
      refs: [
        "r0",
        "r1",
        "r2",
        "r3",
        "r4",
        "r5",
      ],
    }),
    differential: "zero",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（请求形状 oracle；E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "chief-preflight-fact-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "refs 含非字符串项",
    facts: Object.freeze({
      flowId: "q2-new",
      action: "version-modify",
      reason: "x",
      refs: [
        "ok",
        3,
      ],
    }),
    differential: "zero",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（请求形状 oracle；E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "chief-preflight-fact-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "runId 非字符串",
    facts: Object.freeze({
      flowId: "q2-new",
      action: "version-modify",
      reason: "x",
      runId: 7,
    }),
    differential: "zero",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（请求形状 oracle；E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "chief-preflight-fact-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "未登记事实键",
    facts: Object.freeze({
      flowId: "q2-new",
      action: "version-modify",
      reason: "x",
      extra: true,
    }),
    differential: "zero",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（请求形状 oracle；E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "chief-preflight-fact-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "runId 含空格（宿主最终校验拒绝；preflight 只查非空字符串）",
    facts: Object.freeze({
      flowId: "q2-new",
      action: "version-modify",
      reason: "x",
      runId: "bad run id!",
    }),
    differential: "documented",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（宿主最终校验仍拒绝非法 runId/绝对路径 ref；preflight 只做存在/类型/上限，E0.3 D4）",
    oldAllow: false,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: "preflight-final-validation",
  }),
  Object.freeze({
    name: "refs 绝对路径（宿主最终校验拒绝；preflight 只查非空字符串）",
    facts: Object.freeze({
      flowId: "q2-new",
      action: "version-modify",
      reason: "x",
      refs: [
        "/etc/passwd",
      ],
    }),
    differential: "documented",
    oldAnchor: "编排/version-decision.ts::validateVersionDecisionRequest（宿主最终校验仍拒绝非法 runId/绝对路径 ref；preflight 只做存在/类型/上限，E0.3 D4）",
    oldAllow: false,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: "preflight-final-validation",
  }),
]);

/** chief-workflow 资源冻结引用（宿主 loader 捕获期实测：版本 + SHA-256 + bytes）。 */
export const ORACLE_CHIEF_WORKFLOW_RESOURCE = Object.freeze({
  path: "src/common/门禁引擎/workflows/chief/chief-workflow.md",
  version: "chief-workflow/v1",
  sha256: "9bef5626c8e9d2d72487567d2d93366f05c178cfa23288add8a13b64e4b4f346",
  bytes: 8724,
  loadedSourcePathSuffix: "/src/common/门禁引擎/workflows/chief/chief-workflow.md",
});

/** hub 派发纯数据冻结（含 apply-journal 源字符串 oracle；运行期不读取旧文件）。 */
export const ORACLE_CHIEF_HUB_DISPATCH = Object.freeze({
  routing: "chief-hub-v1",
  sourceRoleId: "chief",
  reportToRoleId: "chief",
  purpose: "builtin-preparation",
  workSourceSchema: "repository-work-source/v1",
  targetRoleIds: Object.freeze([
    "product",
    "rapporteur",
    "nominator",
    "convener",
    "verifier",
  ]),
  applyJournalTargetRoleIds: Object.freeze([
    "product",
    "rapporteur",
    "nominator",
    "convener",
    "verifier",
  ]),
  applyJournalHubRoutingCheck: "event.hubRouting !== \"chief-hub-v1\"",
  applyJournalSourceCheck: "event.from !== \"chief\"",
  applyJournalTargetCheck: "[\"product\", \"rapporteur\", \"nominator\", \"convener\", \"verifier\"].includes(event.to)",
  anchor: "apply-journal.ts:2923-2926（hub 路由/目标/工作源；E1 捕获期；旧实现删除后仅作历史锚点）",
});

/** 已列明差异（契约允许：E2 模块化阶段列明项；本模块差异均为更严/归属，不是放宽）。 */
export const KNOWN_DELTAS: readonly string[] = Object.freeze([
  "dispatch-existence：chief → 内置目标 targetExists 缺省/false（2 例）：旧硬授权对 chief→内置不读单独 targetExists 返回 allow；模块按 RoleDispatchPolicyInput 契约要求宿主显式核验（缺省即 false），fail-closed 拒绝 target-card-missing。",
  "dispatch-scope：旧 evaluateDispatchAuthorization 同时编码 convener 来源规则；chief 模块只回答 chief 作为来源的策略（R-2 把路由/hub/报告时点留在引擎），convener→project 旧谓词允许但本模块以 chief-dispatch-source-not-chief 拒绝。",
  "preflight-final-validation：runId/refs 的路径形状由宿主 validateVersionDecisionRequest 最终校验（旧 oracle 拒绝非法 runId/绝对路径 ref，2 例）；preflight 只做存在/类型/上限（E0.3 D4 不复制 Service 校验）。",
  "tools-declaration-vs-injection：模块声明 6 个允许集 id（含 E2 C-1 的 closeCreatedTask）；是否实际注入仍由注入层按 directGovernance（trio + builtInGovernance + isTrio + 非独立决策上下文）与宿主能力门控；decidePendingRequest 仅独立决策上下文（buildChiefDecisionTools），不由普通会话声明。",
  "cards-source-oracle：旧 run-role.ts::TRIO_CARD_KINDS.chief 源码 oracle = [\"intent-confirm\"]（E1 捕获期）；编排 S2 切换/删除后 cards 唯一真源为模块，金样冻结 [\"intent-confirm\"] 且 D8 无 legacy write。",
]);

export const ORACLE_GOLDEN_PAYLOAD = Object.freeze({
  spec: ORACLE_CHIEF_SPEC,
  toolsCatalog: ORACLE_ROLE_TOOL_CATALOG,
  toolsDeclaration: ORACLE_CHIEF_TOOL_DECLARATION,
  runRoleToolGates: ORACLE_RUN_ROLE_TOOL_GATES,
  decisionContext: ORACLE_CHIEF_DECISION_CONTEXT,
  dispatch: ORACLE_DISPATCH_CASES,
  preflight: ORACLE_PREFLIGHT_CASES,
  workflowResource: ORACLE_CHIEF_WORKFLOW_RESOURCE,
  hubDispatch: ORACLE_CHIEF_HUB_DISPATCH,
  knownDeltas: KNOWN_DELTAS,
});

export interface OracleSourceIdentity {
  readonly path: string;
  readonly lineCount: number;
  readonly sha256: string;
}

export interface OracleCaptureIdentity extends OracleSourceIdentity {
  /** 捕获期历史锚点（切换后不保证仍对应同一行）。 */
  readonly anchors: string;
  /** 捕获时点（E1 或金样化）。 */
  readonly capturedAt: string;
  /** E2 处置（每文件）——只作历史记录，运行期不读取旧文件。 */
  readonly e2Disposition: string;
}

export interface OracleSwitchIdentity extends OracleSourceIdentity {
  /** 切换后等价结构锚点（实测）。 */
  readonly anchors?: string;
  /** 相对捕获期的变更说明。 */
  readonly change?: string;
}

/**
 * 冻结金样元数据（E2 检查单 G9 / B1 E2.5/M4/D9；先例
 * `test/roles/rapporteur/oracle-fixture.ts` / `test/roles/convener/oracle-fixture.ts` /
 * `test/roles/verifier/oracle-fixture.ts`）。
 *
 * - `capture`：捕获期望值时旧 oracle 文件身份（行数 + SHA-256 + 锚点 + 捕获时点）。
 * - `switch`：E2 X-R6 后实测身份（`changed` 与捕获期不同；`unchanged` 逐字节一致）。
 * - 两者都是**历史记录**：差分测试不读取工作树旧文件，旧实现删除后测试仍可运行。
 * - `counts` 与 fixture 数组长度一致；`coverage` 记录期望面 → 测试断言映射（不得删覆盖）。
 * - `payloadSha256`：冻结载荷哈希（防期望值静默漂移）。
 */
export const ORACLE_GOLDEN_META = Object.freeze({
  schema: "chief-oracle-golden/v1",
  capturedAt: "2026-11-07",
  generator:
    "E1 开发期 live probe（E1 证据 §3）+ E2 X-R6 金样化复算（角色卡/chief-code/docs/change/2026-11-07_E2-XR6_golden-capture.mjs）",
  evidence: Object.freeze({
    capture: "角色卡/chief-code/docs/change/2026-11-07_E1_chief-module-evidence.md §2/§3/§9",
    switch: "角色卡/门禁引擎/docs/change/2026-11-07_E2-XR6_gate-facade-chief-and-closure-evidence.md §1/§7/§9",
    goldenization:
      "角色卡/chief-code/docs/change/2026-11-07_E1_chief-module-evidence.md §10（E2 X-R6 fixture 金样化）",
  }),
  /**
   * 捕获脚本在冻结前执行的复核（任一不符即 throw，不生成 fixture）。X-R6 后 oldSpec 由模块派生
   * （自比较）；独立物证仍是 E1 证据 §3（编辑前捕获）与 X-R6 证据 §7（切换后 0 差异）。
   */
  captureChecks: Object.freeze({
    oldSpecFieldsEqual: true,
    oldCardTextByteEqual: true,
    oldRunRoleCardsEqual: true,
    toolsDeclarationValid: true,
    workflowResourceLoaderMatch: true,
    hubApplyJournalChecks: true,
    independentEvidence:
      "E1 证据 §3（编辑前差分 0）与 E2-XR6 证据 §7（切换后 zeroCopyBinding / 差分 0）",
  }),
  module: Object.freeze({
    path: "src/common/roles/chief/index.ts",
    lineCount: 33,
    sha256: "f3e022b5cb40efea836e6ae379279b4b1f5565680befd349bc4fb1eb2a81a4cd",
  }),
  capture: Object.freeze<Readonly<Record<string, OracleCaptureIdentity>>>({
    governanceRoles: Object.freeze({
      path: "src/common/门禁引擎/governance-roles.ts",
      lineCount: 794,
      sha256: "fddda111cb1ea76614f632f931441d45e534e4f9f23297193615fbdf525cd16e",
      anchors: "313-358（chief 内联规格）/ 166-178（CHIEF_CARD_TEXT）（E1 捕获期）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R6 已切换：内联 chief 卡/规格删除，`specOf(chiefRoleModule)` 装配；matrix 逐字迁入 `BUILT_IN_ROLE_MATRIX.chief`（D6/D8）",
    }),
    runRole: Object.freeze({
      path: "src/pipeline/orchestration/run-role.ts",
      lineCount: 3333,
      sha256: "026f5e995f4f10cf890a94a5e50d9a9317a0ebbcc04a1106bf287c9d6c2823e6",
      anchors: "1694-1705（工具门控）/ 2859-2880（TRIO_CARD_KINDS.chief）/ 1828（directGovernance closeCreatedTask）（E1 捕获期）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R1 起编排单元修改；X-R6 未改本文件。`TRIO_CARD_KINDS.chief` 仍保留为回退/迁移前源码 oracle（编排 S2 处置）",
    }),
    roleToolRegistry: Object.freeze({
      path: "src/common/门禁引擎/role-tool-registry.ts",
      lineCount: 157,
      sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
      anchors: "52-67（ROLE_TOOL_CATALOG 14 项）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R6 未改（捕获期与切换后逐字节一致）",
    }),
    workflowPreconditions: Object.freeze({
      path: "src/common/编排/workflow-preconditions.ts",
      lineCount: 1609,
      sha256: "6c2349a5e7766e8c79edcc5c7b465cbf4bf10bae662cbe13f99499e6c8c4dd41",
      anchors: "1530-1573（evaluateDispatchAuthorization）/ 1596-1603（reportTargetForTaskCreator）（E1 捕获期）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "E1 捕获后由并发单元修改（X-R4 convener 分支接模块）；切换后实测见 switch.changed",
    }),
    versionDecision: Object.freeze({
      path: "src/common/编排/version-decision.ts",
      lineCount: 514,
      sha256: "133778f87f67b68c504959c4bf5735d39292caf05d6536be6ec6f7c2c1ae759f",
      anchors: "70-110（validateVersionDecisionRequest）",
      capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
      e2Disposition: "X-R6 未改；哈希为金样化时实测（历史记录，运行期不读取）",
    }),
    applyJournal: Object.freeze({
      path: "src/service/trunk/impl/apply-journal.ts",
      lineCount: 3791,
      sha256: "84532a9675b4542b3c7f05732ab212e535cacf4a912f910f89e7c40a5ba15308",
      anchors: "2959（hub 路由/目标/工作源校验）",
      capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
      e2Disposition: "X-R6 未改；哈希为金样化时实测（历史记录，运行期不读取）",
    }),
    runtimeTools: Object.freeze({
      path: "src/provider/runtime/tools.ts",
      lineCount: 5330,
      sha256: "fdf7a44e7178a42d4660bda2e32512c083963ed3a82f498504b155bcf84631d1",
      anchors: "167-189（loadBuiltinChiefWorkflow）/ buildChiefDecisionTools / DECIDE_PENDING_REQUEST_TOOL_NAME",
      capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
      e2Disposition: "X-R6 未改；哈希为金样化时实测（历史记录，运行期不读取）",
    }),
    modelRuntime: Object.freeze({
      path: "src/model/runtime.ts",
      lineCount: 3945,
      sha256: "368559b75268df669f362406d785d5c3f04ca71994736fdfab181b34e019e9e5",
      anchors: "TASK_HUB_ROUTING（hub 路由 token 单一来源）",
      capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
      e2Disposition: "X-R6 未改；哈希为金样化时实测（历史记录，运行期不读取）",
    }),
    modelRole: Object.freeze({
      path: "src/model/role.ts",
      lineCount: 409,
      sha256: "d5e550a06514b8a61fc66b517a267343ba95d8aa29050eb6ee3c7b7f9b5f8780",
      anchors: "BuiltInRoleModule / RoleToolId / RoleDispatchPolicyInput 类型契约（E1 冻结）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R6 未改（逐字节一致）",
    }),
    contract: Object.freeze({
      path: "docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md",
      lineCount: 685,
      sha256: "067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3",
      anchors: "§3.1/§3.2/§3.4/§3.5/§10.2 D4/D8/D10",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "E0.3 冻结契约；本单元复核未漂移（差分测试仍断言哈希）",
    }),
    workflowResource: Object.freeze({
      path: "src/common/门禁引擎/workflows/chief/chief-workflow.md",
      lineCount: 61,
      sha256: "9bef5626c8e9d2d72487567d2d93366f05c178cfa23288add8a13b64e4b4f346",
      anchors: "chief-workflow Markdown 资源字节（版本 + SHA-256 由宿主 loader 校验）",
      capturedAt: "金样化（2026-11-07；E1 证据 §8.2 记录资源 hash/bytes）",
      e2Disposition: "X-R6 未改；loader 归属/读取仍由宿主，模块只声明引用",
    }),
  }),
  switch: Object.freeze({
    changed: Object.freeze<Readonly<Record<string, OracleSwitchIdentity>>>({
      governanceRoles: Object.freeze({
        path: "src/common/门禁引擎/governance-roles.ts",
        lineCount: 457,
        sha256: "6eafcf3ab8877c41ecd0bd414ce257aa4ad52e019e62edc308091d398580188f",
        anchors: "22-29（六模块 import）/ 137-150（BUILT_IN_ROLE_MATRIX.chief）/ 240-254（builtInRoleModules）/ 256-273（BUILT_IN_GOVERNANCE_ROLES 装配）",
        change: "X-R6 数据门面切换（E2-XR6 证据 §3/§7.1）",
      }),
      runRole: Object.freeze({
        path: "src/pipeline/orchestration/run-role.ts",
        lineCount: 3554,
        sha256: "493fd4ed6ccc03fedbdba2fd7d1a9233d171bd8e594a229b98b1a322c7ef10a8",
        anchors: "TRIO_CARD_KINDS.chief 回退仍在（编排 S2 待删）",
        change: "X-R1 起编排单元修改（非 X-R6）；X-R6 证据 §1 实测值",
      }),
      workflowPreconditions: Object.freeze({
        path: "src/common/编排/workflow-preconditions.ts",
        lineCount: 1687,
        sha256: "480e0e7effa7b8120f44e478673dbe0b5ca4fbdbfcf026f4238c0b73724a7ffc",
        change: "E1 捕获后由并发单元修改（X-R4 convener 分支接模块）；不影响 chief 期望值",
      }),
    }),
    unchanged: Object.freeze<Readonly<Record<string, OracleSourceIdentity>>>({
      roleToolRegistry: Object.freeze({
        path: "src/common/门禁引擎/role-tool-registry.ts",
        lineCount: 157,
        sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
      }),
      versionDecision: Object.freeze({
        path: "src/common/编排/version-decision.ts",
        lineCount: 514,
        sha256: "133778f87f67b68c504959c4bf5735d39292caf05d6536be6ec6f7c2c1ae759f",
      }),
      applyJournal: Object.freeze({
        path: "src/service/trunk/impl/apply-journal.ts",
        lineCount: 3791,
        sha256: "84532a9675b4542b3c7f05732ab212e535cacf4a912f910f89e7c40a5ba15308",
      }),
      runtimeTools: Object.freeze({
        path: "src/provider/runtime/tools.ts",
        lineCount: 5330,
        sha256: "fdf7a44e7178a42d4660bda2e32512c083963ed3a82f498504b155bcf84631d1",
      }),
      modelRuntime: Object.freeze({
        path: "src/model/runtime.ts",
        lineCount: 3945,
        sha256: "368559b75268df669f362406d785d5c3f04ca71994736fdfab181b34e019e9e5",
      }),
      modelRole: Object.freeze({
        path: "src/model/role.ts",
        lineCount: 409,
        sha256: "d5e550a06514b8a61fc66b517a267343ba95d8aa29050eb6ee3c7b7f9b5f8780",
      }),
      contract: Object.freeze({
        path: "docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md",
        lineCount: 685,
        sha256: "067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3",
      }),
      workflowResource: Object.freeze({
        path: "src/common/门禁引擎/workflows/chief/chief-workflow.md",
        lineCount: 61,
        sha256: "9bef5626c8e9d2d72487567d2d93366f05c178cfa23288add8a13b64e4b4f346",
      }),
    }),
    measuredAt: "2026-11-07（E2-XR6 证据 §1/§7.1 + 本轮金样化实测）",
  }),
  counts: Object.freeze({
    specFields: 8,
    cardText: 1,
    cards: 1,
    toolsCatalog: 14,
    toolsDeclaration: 1,
    runRoleToolGates: 6,
    dispatchCases: 11,
    dispatchZero: 8,
    dispatchDocumented: 3,
    preflightCases: 14,
    preflightZero: 12,
    preflightDocumented: 2,
    workflowResource: 1,
    hubDispatch: 1,
    knownDeltas: 5,
    fixtureComparisons: 52,
  }),
  coverage: Object.freeze({
    spec: "差分/规格：8 字段逐项 JSON 比较（含卡文本哈希/条目/预授权/禁写/capabilities/cards）",
    cardText: "差分/卡文本：sha256 / 长度 / 行数",
    cards: "差分/cards：模块 cards 与金样一致（D8 无 legacy write；TRIO_CARD_KINDS.chief 源码 oracle 已冻结）",
    tools: "差分/tools：D1 14 项 catalog + chief 6-id 声明（含 closeCreatedTask）映射/顺序/校验冻结；decidePendingRequest 不声明",
    dispatch: "差分/dispatch：11 例（zero 8 / documented 3）allow 位 + 稳定码 + reportToRoleId；已知差异逐项登记",
    preflight: "差分/动作前置：14 例（zero 12 / documented 2）allow 位/稳定码/unknown-key 口径",
    workflowResource: "差分/context 资源：path/version/sha256/bytes 与捕获期宿主 loader 实测一致",
    hubDispatch: "差分/hub 数据：routing/source/report/purpose/schema/五内置目标与 apply-journal 捕获值一致",
    knownDeltas: "差分/已知差异清单：5 类前缀齐备且与用例登记一致",
    provenance: "金样/provenance：元数据自洽 / 载荷哈希 / 无旧引擎 live 依赖",
  }),
  payloadSha256: "fb4557b8a579e6f8358cc2c0ae468823118bcdb94b760a68998818b8ddd9ea25",
});
