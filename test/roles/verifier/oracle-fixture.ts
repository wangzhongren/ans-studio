// test/roles/verifier/oracle-fixture.ts
//
// verifier 角色模块差分金样（E2 X-R5 fixture 金样化；E2 检查单 G9 / B1 M4；
// 先例 test/roles/rapporteur/oracle-fixture.ts 与 test/roles/convener/oracle-fixture.ts）。
//
// 捕获方式（2026-11-07，工作树 trunk-amendment；一次性工具
// `角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_golden-capture.mjs`）：
//  - 规格/卡文本：E1 从旧 `BUILT_IN_GOVERNANCE_ROLES` verifier 行逐字段捕获；X-R5 门面切换后
//    由本脚本逐字段复核（含 D2 投影、旧卡文本逐字节比较）0 差异后冻结。
//  - cards：`run-role.ts::TRIO_CARD_KINDS.verifier` 源码提取 = ["acceptance"]（D8）。
//  - tools：D1 `ROLE_TOOL_CATALOG` 14 项（均不含 verifier）+ 旧 `validateRoleToolDeclaration`
//    对空声明的捕获结果（allow:true / tools:[] / reasons:[]）。
//  - dispatch：逐用例调用旧 `evaluateDispatchAuthorization`（+ `reportTargetForTaskCreator`）
//    捕获 oldAllow/oldCode/oldReport；新模块 expectedAllow/稳定码/reportToRoleId 同批冻结。
//    zero / documented / module-only 三类口径与 E1 fixture 一致。
//  - preflight：旧 Model 形状 oracle（`isDispatchTaskReviewTarget` + `isTaskReviewBasisRef`）
//    捕获 oldAllow；E2 P5 未登记键负例标 documented，旧 oracle 会放行的 4 例证明「更严」差异真实存在。
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

/** 旧注册表 verifier 规格（逐字段；E1 捕获，X-R5 切换后复核 0 差异）。 */
export const ORACLE_VERIFIER_SPEC = Object.freeze({
  id: "verifier",
  displayName: "质检",
  function: "verification",
  entries: Object.freeze<readonly OracleBoundaryEntry[]>([
    {
      root: "project",
      path: "docs/quality/",
      kind: "directory",
      purpose: "质量记录 / 可选核对（D 批目标写区）",
    },
    {
      root: "project",
      path: "docs/verification/",
      kind: "directory",
      purpose: "可选核对证据附件（不是验收结论）",
    },
    {
      root: "project",
      path: "docs/governance/verifier/",
      kind: "directory",
      purpose: "质检的治理工作记录",
    },
  ]),
  preauthorizedDirs: Object.freeze([
    "docs/quality/",
    "docs/verification/",
    "docs/governance/verifier/",
  ]),
  forbiddenWritePaths: Object.freeze([
    ".ans/",
    "docs/bootstrap-manifest.md",
    "角色卡/governance-boundary.yaml",
    "角色卡/chief/",
    "角色卡/product/",
    "角色卡/rapporteur/",
    "角色卡/nominator/",
    "角色卡/convener/",
    "角色卡/verifier/",
    "角色卡/su/",
    "docs/intents/",
    "docs/proposals/",
    "docs/contracts/",
    "docs/nominations/",
    "docs/skills/",
    "docs/mcp/",
    "docs/workflow.md",
  ]),
  capabilities: Object.freeze<OracleCapabilities>({
    customerInput: true,
    dispatchTask: false,
    roleStatus: false,
    sessionTail: false,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
  }),
  cards: Object.freeze([
    "acceptance",
  ]),
  cardText: Object.freeze({
    length: 2250,
    lineCount: 16,
    sha256: "ac9511ac64603ea5b14a1436854c78160f7c903d779e74400bc7b263cc165199",
  }),
});

export interface OracleRoleToolCatalogEntry {
  readonly id: RoleToolId;
  readonly name: string;
  readonly allowedRoleIds: readonly string[];
  readonly chiefIndependentDecisionOnly?: true;
}

/** D1 `ROLE_TOOL_CATALOG` 14 项冻结清单（E1 捕获；无一允许 verifier）。 */
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

/** 旧 `validateRoleToolDeclaration("verifier", [])` 与模块空声明冻结期望（trio/single）。 */
export const ORACLE_TOOLS_DECLARATION = Object.freeze({
  trio: Object.freeze({
    tools: Object.freeze([]),
    reasons: Object.freeze([]),
    validation: Object.freeze({
      allow: true,
      tools: Object.freeze([]),
      reasons: Object.freeze([]),
    }),
  }),
  single: Object.freeze({
    tools: Object.freeze([]),
    reasons: Object.freeze([]),
    validation: Object.freeze({
      allow: true,
      tools: Object.freeze([]),
      reasons: Object.freeze([]),
    }),
  }),
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
   *  - `documented`：契约明文差异（存在性/kind 一致性），旧行为不同且方向固定（旧 allow/粗码 → 模块 deny）；
   *  - `module-only`：旧函数无法表达该模块范围（缺省 source、非 verifier 目标），只冻结模块行为与旧观测。
   */
  readonly differential: "zero" | "documented" | "module-only";
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
  /** 新模块期望报告角色（allow 时为来源；仅差分期望，实际路由仍在编排）。 */
  readonly expectedReportToRoleId: string | null;
  /** 已知差异类别（`KNOWN_DELTAS` 前缀）；无差异为 null。 */
  readonly knownDelta: string | null;
}

/** 派发差分矩阵：zero 9 + documented 4 + module-only 2 = 15 例。 */
export const ORACLE_DISPATCH_CASES: readonly OracleDispatchCase[] = Object.freeze([
  Object.freeze({
    name: "chief → verifier（hub 新任务）",
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
    name: "convener → verifier（历史路径，仍按真实 creator 回报）",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true }),
    differential: "zero",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    oldCode: null,
    oldReportToRoleId: "convener",
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "convener",
    knownDelta: null,
  }),
  Object.freeze({
    name: "product → verifier（非真实派发来源）",
    input: Object.freeze({ sourceRoleId: "product", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true }),
    differential: "zero",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    oldCode: "unknown-source",
    oldReportToRoleId: null,
    expectedAllow: false,
    expectedCode: "unknown-source",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "rapporteur → verifier（非真实派发来源）",
    input: Object.freeze({ sourceRoleId: "rapporteur", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true }),
    differential: "zero",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    oldCode: "unknown-source",
    oldReportToRoleId: null,
    expectedAllow: false,
    expectedCode: "unknown-source",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "nominator → verifier（非真实派发来源）",
    input: Object.freeze({ sourceRoleId: "nominator", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true }),
    differential: "zero",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    oldCode: "unknown-source",
    oldReportToRoleId: null,
    expectedAllow: false,
    expectedCode: "unknown-source",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "项目角色 → verifier（非真实派发来源）",
    input: Object.freeze({ sourceRoleId: "implementer", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true }),
    differential: "zero",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    oldCode: "unknown-source",
    oldReportToRoleId: null,
    expectedAllow: false,
    expectedCode: "unknown-source",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "verifier → verifier（自派禁止）",
    input: Object.freeze({ sourceRoleId: "verifier", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true }),
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
    name: "chief → verifier 但 targetKind=project（结构性禁止）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "verifier", targetKind: "project", targetExists: true }),
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
    name: "chief → verifier 但 targetKind=project 且 targetExists=false（kind 先于存在性）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "verifier", targetKind: "project", targetExists: false }),
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
    name: "缺省 sourceRoleId（fail-closed；旧函数同判 unknown-source）",
    input: Object.freeze({ targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true }),
    differential: "module-only",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    oldCode: "unknown-source",
    oldReportToRoleId: null,
    expectedAllow: false,
    expectedCode: "unknown-source",
    expectedReportToRoleId: null,
    knownDelta: "dispatch-scope",
  }),
  Object.freeze({
    name: "targetRoleId=product（本模块只覆盖向 verifier 的派发）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true }),
    differential: "module-only",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    oldCode: null,
    oldReportToRoleId: "chief",
    expectedAllow: false,
    expectedCode: "target-not-verifier",
    expectedReportToRoleId: null,
    knownDelta: "dispatch-scope",
  }),
  Object.freeze({
    name: "convener → verifier 但 targetKind=project（不可能事实；旧函数因 targetExists=true 放行）",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "verifier", targetKind: "project", targetExists: true }),
    differential: "documented",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    oldCode: null,
    oldReportToRoleId: "convener",
    expectedAllow: false,
    expectedCode: "target-kind-mismatch",
    expectedReportToRoleId: null,
    knownDelta: "dispatch-kind-mismatch",
  }),
  Object.freeze({
    name: "convener → verifier 但 targetKind=project 且 targetExists=false（拒绝码不同）",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "verifier", targetKind: "project", targetExists: false }),
    differential: "documented",
    oldAnchor: "workflow-preconditions.ts::evaluateDispatchAuthorization + reportTargetForTaskCreator（E1 捕获期；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    oldCode: "target-card-missing",
    oldReportToRoleId: null,
    expectedAllow: false,
    expectedCode: "target-kind-mismatch",
    expectedReportToRoleId: null,
    knownDelta: "dispatch-kind-mismatch",
  }),
  Object.freeze({
    name: "chief → verifier 且 targetExists=false（契约要求缺省/未知即拒绝）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: false }),
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
    name: "chief → verifier 且 targetExists 缺省（缺事实即拒绝）",
    input: Object.freeze({ sourceRoleId: "chief", targetRoleId: "verifier", targetKind: "built-in-governance" }),
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
]);

export interface OraclePreflightCase {
  readonly name: string;
  readonly facts: Readonly<Record<string, unknown>>;
  /** 差分口径：zero（只含登记键）/ documented（E2 P5 未登记键，契约明文更严）。 */
  readonly differential: "zero" | "documented";
  /** 旧实现行为锚点（历史；运行期不读取）。 */
  readonly oldAnchor: string;
  /** 旧 Model 形状 oracle 的 allow 位（捕获期）。 */
  readonly oldAllow: boolean;
  /** 新模块期望 allow 位（`allow:true` 只表示纯策略不反对）。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码（allow 时为 null）。 */
  readonly expectedCode: string | null;
  /** 已知更严格差异的类别（`KNOWN_DELTAS` 前缀）；无差异为 null。 */
  readonly knownDelta: string | null;
}

/** 合法 review 事实包（只含登记键；测试用工厂，每次返回独立对象）。 */
export function validReviewFacts(): Record<string, unknown> {
  return {
    reviewTarget: {
      operationId: "review-op-1",
      candidate: {
        objectFormat: "sha1",
        hex: "0123456789abcdef0123456789abcdef01234567",
      },
    },
    criteria: [
      {
        oid: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
        path: "docs/quality/flow-1-report-v1.md",
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ],
  };
}

/** review preflight 差分矩阵：zero 17 + documented 7（E2 P5）= 24 例。 */
export const ORACLE_PREFLIGHT_CASES: readonly OraclePreflightCase[] = Object.freeze([
  Object.freeze({
    name: "合法 reviewTarget（sha1）+ 1 项 criteria",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "合法 reviewTarget（sha256）+ 2 项不同 criteria",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-2",
        candidate: {
          objectFormat: "sha256",
          hex: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha256",
            hex: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          },
          path: "docs/verification/flow-1-evidence.md",
          sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ],
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "缺 reviewTarget",
    facts: Object.freeze({
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-facts-missing",
    knownDelta: null,
  }),
  Object.freeze({
    name: "缺 criteria",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-facts-missing",
    knownDelta: null,
  }),
  Object.freeze({
    name: "facts 为空",
    facts: Object.freeze({}),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-facts-missing",
    knownDelta: null,
  }),
  Object.freeze({
    name: "reviewTarget 多一个键（形状不符）",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
        kind: "git-candidate-review",
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-target-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "reviewTarget.operationId 为空串（CID 缺失）",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-target-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "reviewTarget.candidate 只有 39 hex（非完整最终候选 OID）",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "000000000000000000000000000000000000000",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-target-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "reviewTarget.candidate 未知 objectFormat",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "md5",
          hex: "00000000000000000000000000000000",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-target-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "criteria 为空数组",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: [],
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-criteria-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "criteria 超过 16 项",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-0.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-2.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-3.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-4.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-5.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-6.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-7.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-8.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-9.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-10.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-11.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-12.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-13.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-14.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-15.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/f-16.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-criteria-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "criteria 重复（objectFormat+hex+path 相同）",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        },
      ],
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-criteria-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "criteria path 含通配（非字面路径）",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/*.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-criteria-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "criteria sha256 只有 63 hex",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-criteria-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "criteria 不是数组",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: "docs/quality/flow-1-report-v1.md",
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-criteria-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "criteria 项多一个键（形状不符）",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          note: "x",
        },
      ],
    }),
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-criteria-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "合法形状 + 未登记 accepted/passed（值一律不读取，未登记键即 deny）",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      accepted: false,
      passed: false,
    }),
    differential: "documented",
    oldAnchor: "E2 接口评审 P5 / E0.3 §3.4 D4（旧形状 oracle 不检查顶层事实键；模块未登记键一律 deny）",
    oldAllow: true,
    expectedAllow: false,
    expectedCode: "review-facts-unknown-key",
    knownDelta: "preflight-facts-unknown-key",
  }),
  Object.freeze({
    name: "合法形状 + 未登记 accepted/passed/approved（E2 评审实测走私输入）",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      accepted: true,
      passed: true,
      approved: true,
    }),
    differential: "documented",
    oldAnchor: "E2 接口评审 P5 / E0.3 §3.4 D4（旧形状 oracle 不检查顶层事实键；模块未登记键一律 deny）",
    oldAllow: true,
    expectedAllow: false,
    expectedCode: "review-facts-unknown-key",
    knownDelta: "preflight-facts-unknown-key",
  }),
  Object.freeze({
    name: "合法形状 + 未登记 smuggledDecision（未登记键先于形状/缺键）",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      smuggledDecision: "accept",
    }),
    differential: "documented",
    oldAnchor: "E2 接口评审 P5 / E0.3 §3.4 D4（旧形状 oracle 不检查顶层事实键；模块未登记键一律 deny）",
    oldAllow: true,
    expectedAllow: false,
    expectedCode: "review-facts-unknown-key",
    knownDelta: "preflight-facts-unknown-key",
  }),
  Object.freeze({
    name: "非法形状 + 未登记 accepted/passed/approved（未登记键先于形状判定）",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      accepted: true,
      passed: true,
      approved: true,
    }),
    differential: "documented",
    oldAnchor: "E2 接口评审 P5 / E0.3 §3.4 D4（旧形状 oracle 不检查顶层事实键；模块未登记键一律 deny）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-facts-unknown-key",
    knownDelta: "preflight-facts-unknown-key",
  }),
  Object.freeze({
    name: "缺 reviewTarget + 未登记 accepted（未登记键先于缺键判定）",
    facts: Object.freeze({
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      accepted: true,
    }),
    differential: "documented",
    oldAnchor: "E2 接口评审 P5 / E0.3 §3.4 D4（旧形状 oracle 不检查顶层事实键；模块未登记键一律 deny）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-facts-unknown-key",
    knownDelta: "preflight-facts-unknown-key",
  }),
  Object.freeze({
    name: "未登记键值为 undefined 仍是未登记键",
    facts: Object.freeze({
      reviewTarget: {
        operationId: "review-op-1",
        candidate: {
          objectFormat: "sha1",
          hex: "0123456789abcdef0123456789abcdef01234567",
        },
      },
      criteria: [
        {
          oid: {
            objectFormat: "sha1",
            hex: "0123456789abcdef0123456789abcdef01234567",
          },
          path: "docs/quality/flow-1-report-v1.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      approved: undefined,
    }),
    differential: "documented",
    oldAnchor: "E2 接口评审 P5 / E0.3 §3.4 D4（旧形状 oracle 不检查顶层事实键；模块未登记键一律 deny）",
    oldAllow: true,
    expectedAllow: false,
    expectedCode: "review-facts-unknown-key",
    knownDelta: "preflight-facts-unknown-key",
  }),
  Object.freeze({
    name: "只有未登记键（facts 非空但无登记键）",
    facts: Object.freeze({
      accepted: true,
      passed: true,
    }),
    differential: "documented",
    oldAnchor: "E2 接口评审 P5 / E0.3 §3.4 D4（旧形状 oracle 不检查顶层事实键；模块未登记键一律 deny）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-facts-unknown-key",
    knownDelta: "preflight-facts-unknown-key",
  }),
  Object.freeze({
    name: "facts 为 null（非普通对象，fail-closed）",
    facts: null as unknown as Readonly<Record<string, unknown>>,
    differential: "zero",
    oldAnchor: "model/runtime.ts::isDispatchTaskReviewTarget + isTaskReviewBasisRef（E1 形状 oracle；旧实现删除后仅作历史锚点）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "review-facts-missing",
    knownDelta: null,
  }),
]);

/** 已列明差异（模块按 E0.3/D4 更严格，非放宽）。差分测试按前缀逐类断言；新增差异即失败。 */
export const KNOWN_DELTAS: readonly string[] = Object.freeze([
  "dispatch-scope：模块只回答向 verifier 的派发；缺省 sourceRoleId / 非 verifier 目标等模块独有负例旧函数无法表达（运行期分别落 unknown-source / allow），只冻结模块行为与旧观测值，不作 allow 位差额登记。",
  "dispatch-existence：chief → verifier 且 targetExists=false/缺省（2 例）：旧硬授权对内置目标不读单独 targetExists 返回 allow；模块按契约 §3.1/D4 要求宿主显式核验（缺省即 false），fail-closed 拒绝 target-card-missing。",
  "dispatch-kind-mismatch：convener → verifier 且 targetKind=project（exists=true/false，2 例）：旧函数因 project+exists=true 放行或报 target-card-missing；模块先判 kind 一致性，fail-closed 拒绝 target-kind-mismatch（内置 id 不能作项目角色 id）。",
  "preflight-facts-unknown-key：E2 P5 修复——旧 Model 形状 oracle 不检查顶层事实键；合法形状 + 未登记 accepted/passed/approved/smuggledDecision 等键时旧放行（4 例），模块按契约 §3.4/D4 一律 deny review-facts-unknown-key（更严，非放宽；值不被读取）。",
  "tools-declaration：D1 ROLE_TOOL_CATALOG 14 项无一允许 verifier；旧 validateRoleToolDeclaration('verifier', []) 捕获期 allow:true/tools:[]/reasons:[]；模块声明空集，实际注入仍由引擎按治理模型/宿主能力门控。",
  "cards-source-oracle：旧 run-role.ts::TRIO_CARD_KINDS.verifier 源码 oracle = ['acceptance']（E1 捕获期）；编排 S2 切换/删除后 cards 唯一真源为模块，金样冻结 ['acceptance'] 且 D8 无 legacy token。",
]);

export const ORACLE_GOLDEN_PAYLOAD = Object.freeze({
  spec: ORACLE_VERIFIER_SPEC,
  toolsCatalog: ORACLE_ROLE_TOOL_CATALOG,
  toolsDeclaration: ORACLE_TOOLS_DECLARATION,
  dispatch: ORACLE_DISPATCH_CASES,
  preflight: ORACLE_PREFLIGHT_CASES,
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
 * `test/roles/rapporteur/oracle-fixture.ts` / `test/roles/convener/oracle-fixture.ts`）。
 *
 * - `capture`：捕获期望值时旧 oracle 文件身份（行数 + SHA-256 + 锚点 + 捕获时点）。
 * - `switch`：E2 X-R5 后实测身份（`changed` 与捕获期不同；`unchanged` 逐字节一致）。
 * - 两者都是**历史记录**：差分测试不读取工作树旧文件，旧实现删除后测试仍可运行。
 * - `counts` 与 fixture 数组长度一致；`coverage` 记录期望面 → 测试断言映射（不得删覆盖）。
 * - `payloadSha256`：冻结载荷哈希（防期望值静默漂移）。
 */
export const ORACLE_GOLDEN_META = Object.freeze({
  schema: "verifier-oracle-golden/v1",
  capturedAt: "2026-11-07",
  generator:
    "E1 开发期 live probe（E1 证据 §四/§9）+ E2 X-R5 金样化复算（角色卡/verifier-code/docs/change/2026-11-07_E2-XR5_golden-capture.mjs）",
  evidence: Object.freeze({
    capture: "角色卡/verifier-code/docs/change/2026-11-07_E1_verifier-module-evidence.md §四/§9",
    switch: "角色卡/门禁引擎/docs/change/2026-11-07_E2-XR5_gate-facade-verifier-evidence.md §2/§5/§6.4",
    goldenization:
      "角色卡/verifier-code/docs/change/2026-11-07_E1_verifier-module-evidence.md §10（E2 X-R5 fixture 金样化）",
  }),
  /**
   * 捕获脚本在冻结前执行的复核（任一不符即 throw，不生成 fixture）。X-R5 后 oldSpec/D2 投影
   * 由模块派生（自比较）；独立物证仍是 E1 证据 §四（编辑前捕获）与 X-R5 证据 §5（zeroCopyBinding）。
   */
  captureChecks: Object.freeze({
    oldSpecFieldsEqual: true,
    oldCardTextByteEqual: true,
    d2ProjectionEqual: true,
    oldRunRoleCardsEqual: true,
    toolsDeclarationValid: true,
    zeroCopyBindingRecordedElsewhere: "E2-XR5 证据 §5（governanceRoleOf(\"verifier\") 与模块同一引用）",
  }),
  module: Object.freeze({
    path: "src/common/roles/verifier/index.ts",
    lineCount: 409,
    sha256: "bbc5c258f6d58571859dd4f9ed357fb013fc4e79c4702e6b2c4e8523a21407f0",
  }),
  capture: Object.freeze<Readonly<Record<string, OracleCaptureIdentity>>>({
    governanceRoles: Object.freeze({
      path: "src/common/门禁引擎/governance-roles.ts",
      lineCount: 794,
      sha256: "fddda111cb1ea76614f632f931441d45e534e4f9f23297193615fbdf525cd16e",
      anchors: "verifier 内联规格 / VERIFIER_CARD_TEXT / BUILT_IN_ROLE_DIR_PREFIXES（E1 捕获期）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R5 已切换：内联卡/规格删除，`specOf(verifierRoleModule)` 装配；matrix 逐字迁入 `BUILT_IN_ROLE_MATRIX.verifier`（D6）",
    }),
    runRole: Object.freeze({
      path: "src/pipeline/orchestration/run-role.ts",
      lineCount: 3333,
      sha256: "026f5e995f4f10cf890a94a5e50d9a9317a0ebbcc04a1106bf287c9d6c2823e6",
      anchors: "TRIO_CARD_KINDS.verifier（E1 捕获期源码对照）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R1 起编排单元修改；X-R5 未改本文件。`TRIO_CARD_KINDS.verifier` 仍保留为回退/迁移前源码 oracle（编排 S2 处置）",
    }),
    roleToolRegistry: Object.freeze({
      path: "src/common/门禁引擎/role-tool-registry.ts",
      lineCount: 157,
      sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
      anchors: "ROLE_TOOL_CATALOG 14 项（E1 捕获期）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R5 未改（捕获期与切换后逐字节一致）",
    }),
    workflowPreconditions: Object.freeze({
      path: "src/common/编排/workflow-preconditions.ts",
      lineCount: 1609,
      sha256: "6c2349a5e7766e8c79edcc5c7b465cbf4bf10bae662cbe13f99499e6c8c4dd41",
      anchors: "evaluateDispatchAuthorization / reportTargetForTaskCreator（E1 捕获期）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R5 时点未改；此后并发单元修改（切换后实测见 switch.changed）",
    }),
    modelRuntime: Object.freeze({
      path: "src/model/runtime.ts",
      lineCount: 3945,
      sha256: "368559b75268df669f362406d785d5c3f04ca71994736fdfab181b34e019e9e5",
      anchors: "isDispatchTaskReviewTarget / isTaskReviewBasisRef（review 形状真源）",
      capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
      e2Disposition: "X-R5 未改；哈希为金样化时实测（历史记录，运行期不读取）",
    }),
    modelRole: Object.freeze({
      path: "src/model/role.ts",
      lineCount: 409,
      sha256: "d5e550a06514b8a61fc66b517a267343ba95d8aa29050eb6ee3c7b7f9b5f8780",
      anchors: "BuiltInRoleModule / RoleToolId 类型契约（E1 冻结）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R5 未改（逐字节一致）",
    }),
    contract: Object.freeze({
      path: "docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md",
      lineCount: 685,
      sha256: "067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3",
      anchors: "§3.1/§3.2/§3.4/§10.2 D4/D8/D10",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "E0.3 冻结契约；本单元复核未漂移（差分测试仍断言哈希）",
    }),
  }),
  switch: Object.freeze({
    changed: Object.freeze<Readonly<Record<string, OracleSwitchIdentity>>>({
      governanceRoles: Object.freeze({
        path: "src/common/门禁引擎/governance-roles.ts",
        lineCount: 595,
        sha256: "70315a80d47881308e6a7f7983bb0f133eceb53f4d971bb502f147d9b1ce7fa5",
        anchors: "21-29（verifier 模块 import）/ 232-246（BUILT_IN_ROLE_MATRIX.verifier）/ 345-347（specOf(verifierRoleModule)）/ 364-373（BUILT_IN_ROLE_MODULES 装配）",
        change: "X-R5 数据门面切换（E2-XR5 证据 §3/§7.1）",
      }),
      runRole: Object.freeze({
        path: "src/pipeline/orchestration/run-role.ts",
        lineCount: 3566,
        sha256: "b63defa415283df23e82e8a77f7fef05f157a77b4bbe087948abb592a4c3b873",
        anchors: "TRIO_CARD_KINDS.verifier 回退仍在（编排 S2 待删）",
        change: "X-R1 起编排单元修改（非 X-R5）；哈希为金样化实测值（X-R5 证据 §1 记录后并发单元继续修改，故与此后实测可能前移）",
      }),
      workflowPreconditions: Object.freeze({
        path: "src/common/编排/workflow-preconditions.ts",
        lineCount: 1687,
        sha256: "480e0e7effa7b8120f44e478673dbe0b5ca4fbdbfcf026f4238c0b73724a7ffc",
        change: "E1 捕获后由并发单元修改（非 X-R5）；仅在金样化元数据记录，不参与期望值",
      }),
    }),
    unchanged: Object.freeze<Readonly<Record<string, OracleSourceIdentity>>>({
      roleToolRegistry: Object.freeze({
        path: "src/common/门禁引擎/role-tool-registry.ts",
        lineCount: 157,
        sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
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
    }),
    measuredAt: "2026-11-07（E2-XR5 证据 §1/§5/§7.1 + 本轮金样化实测）",
  }),
  counts: Object.freeze({
    specFields: 8,
    cardText: 1,
    cards: 1,
    toolsCatalog: 14,
    toolsDeclaration: 2,
    dispatchCases: 15,
    dispatchZero: 9,
    dispatchDocumented: 4,
    dispatchModuleOnly: 2,
    preflightCases: 24,
    preflightZero: 17,
    preflightDocumented: 7,
    knownDeltas: 6,
    fixtureComparisons: 64,
  }),
  coverage: Object.freeze({
    spec: "差分/规格：8 字段逐项 JSON 比较（含卡文本哈希/条目/预授权/禁写/capabilities）",
    cardText: "差分/卡文本：sha256 / 长度 / 行数",
    cards: "差分/cards：模块 cards 与金样一致（D8 无 legacy token；Model 卡种闭集在模块单测断言）",
    tools: "差分/tools：D1 14 项 catalog 均不含 verifier + 空声明 trio/single 与捕获校验一致",
    dispatch: "差分/dispatch：15 例（zero 9 / documented 4 / module-only 2）allow 位 + 稳定码 + reportToRoleId；已知差异逐项登记",
    preflight: "差分/动作前置：24 例（zero 17 / documented 7 E2 P5）；allow 位/稳定码/unknownKeys 口径",
    knownDeltas: "差分/已知差异清单：6 类前缀齐备且与用例登记一致",
    provenance: "金样/provenance：元数据自洽 / 载荷哈希 / 无旧引擎 live 依赖",
  }),
  payloadSha256: "3c4e7a3aaf4a8ceb980145be4622000e6ec2462c7be85fa2f264da10ab9920c0",
});
