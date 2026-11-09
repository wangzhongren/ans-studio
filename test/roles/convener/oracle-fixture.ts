// test/roles/convener/oracle-fixture.ts
//
// convener 角色模块差分金样（E2 X-R4 fixture 金样化；E2 检查单 G9 / B1 M4；
// 先例 test/roles/rapporteur/oracle-fixture.ts）。
//
// 捕获方式（2026-11-07，工作树 trunk-amendment）：
//  - 规格/卡文本：E1 从旧 `BUILT_IN_GOVERNANCE_ROLES` convener 行逐字段捕获；X-R4 门面切换后
//    逐字段复核实测 0 差异（E2-XR4 证据 §5）。本文件冻结切换前期望值与切换后实测身份。
//  - cards：`run-role.ts::TRIO_CARD_KINDS.convener` 源码提取 = ["decision"]（D8）。
//  - tools：D1 `ROLE_TOOL_CATALOG` convener 允许集（trio）；single 为旧 run-role 角色门控两项。
//  - dispatch：逐组合调用旧 `evaluateDispatchAuthorization`（来源 convener）捕获 oldAllow/oldCode；
//    新模块期望 allow/稳定码/reportToRoleId 同批冻结。
//  - preflight：旧角色侧谓词（apply-journal / run-role / provider tools）转写捕获 oldAllow；
//    新模块期望 allow/稳定码逐例冻结。Git 动作旧实现无纯函数 oracle（闭包于 Git Service/宿主），
//    冻结模块行为 + 历史锚点（KNOWN_DELTAS::git-action-no-pure-oracle）。
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

/** 旧注册表 convener 规格（逐字段；X-R4 前捕获，切换后复核 0 差异）。 */
export const ORACLE_CONVENER_SPEC = Object.freeze({
  id: "convener",
  displayName: "运营",
  function: "schedule",
  entries: Object.freeze<readonly OracleBoundaryEntry[]>([
    {
      root: "project",
      path: "docs/workflow.md",
      kind: "file",
      purpose: "项目工作流（步骤表：步骤 / 角色 / 前置依赖 / 契约 / 交接物 / 完成口令 / 验收）；由运营落盘并维护",
    },
    {
      root: "project",
      path: "docs/scheduling/",
      kind: "directory",
      purpose: "计划 / 分析 / 调度记录（D 批目标写区；无 flow 机器）",
    },
    {
      root: "project",
      path: "docs/governance/convener/",
      kind: "directory",
      purpose: "运营的治理工作记录",
    },
  ]),
  preauthorizedDirs: Object.freeze([
    "docs/workflow.md",
    "docs/scheduling/",
    "docs/governance/convener/",
  ]),
  forbiddenWritePaths: Object.freeze([
    ".ans/",
    "docs/bootstrap-manifest.md",
    "角色卡/governance-boundary.yaml",
    "角色卡/",
    "docs/proposals/",
    "docs/nominations/",
    "docs/skills/",
    "docs/mcp/",
  ]),
  capabilities: Object.freeze<OracleCapabilities>({
    customerInput: true,
    dispatchTask: true,
    roleStatus: false,
    sessionTail: false,
    installSkill: false,
    installMcp: false,
    shell: "operator-approve",
  }),
  cards: Object.freeze([
    "decision",
  ]),
  cardText: Object.freeze({
    length: 3382,
    lineCount: 23,
    sha256: "808c25ec0bc4d5c2c9e0a13fd4bd9836e416c17a2a6d5b1069af7acf5967eb46",
  }),
});

/** D1 `ROLE_TOOL_CATALOG` convener 允许集（trio，逐项同序）。 */
export const ORACLE_CONVENER_TRIO_TOOLS: readonly RoleToolId[] = Object.freeze([
  "requestRequirementChange",
  "completeTeamPlan",
  "closeCreatedTask",
  "submitRefactor",
  "requestStableWrite",
]);

/** 旧 run-role 角色门控（single；角色 id === convener，不按治理模型二次收窄）。 */
export const ORACLE_CONVENER_SINGLE_TOOLS: readonly RoleToolId[] = Object.freeze([
  "submitRefactor",
  "requestStableWrite",
]);

export interface OracleDispatchCase {
  readonly name: string;
  readonly input: Readonly<{
    sourceRoleId?: string;
    targetRoleId: string;
    targetKind: "project" | "built-in-governance";
    targetExists?: boolean;
  }>;
  /** 旧 `evaluateDispatchAuthorization` 的 allow 位（捕获期）。 */
  readonly oldAllow: boolean;
  /** 旧拒绝码（仅诊断；新模块码见 expectedCode）。allow 时为 null。 */
  readonly oldCode: string | null;
  /** 新模块期望 allow 位。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码（allow 时为 null）。 */
  readonly expectedCode: string | null;
  /** 新模块期望报告角色（allow 时 "convener"；仅差分期望，实际路由仍在编排）。 */
  readonly expectedReportToRoleId: string | null;
  /** 已知更严格差异的类别（`KNOWN_DELTAS` 前缀）；无差异为 null。 */
  readonly knownDelta: string | null;
}

/** 派发差分矩阵：9 目标 × 2 类别 × 3 存在性 = 54 例（来源 = convener）。 */
export const ORACLE_DISPATCH_CASES: readonly OracleDispatchCase[] = Object.freeze([
  Object.freeze({
    name: "verifier/内置/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true }),
    oldAllow: true,
    oldCode: null,
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "convener",
    knownDelta: null,
  }),
  Object.freeze({
    name: "verifier/内置/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: false }),
    oldAllow: true,
    oldCode: null,
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: "dispatch-existence",
  }),
  Object.freeze({
    name: "verifier/内置/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "verifier", targetKind: "built-in-governance" }),
    oldAllow: true,
    oldCode: null,
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: "dispatch-existence",
  }),
  Object.freeze({
    name: "verifier/项目/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "verifier", targetKind: "project", targetExists: true }),
    oldAllow: true,
    oldCode: null,
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "convener",
    knownDelta: null,
  }),
  Object.freeze({
    name: "verifier/项目/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "verifier", targetKind: "project", targetExists: false }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "verifier/项目/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "verifier", targetKind: "project" }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief/内置/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "chief", targetKind: "built-in-governance", targetExists: true }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief/内置/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "chief", targetKind: "built-in-governance", targetExists: false }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief/内置/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "chief", targetKind: "built-in-governance" }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief/项目/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "chief", targetKind: "project", targetExists: true }),
    oldAllow: true,
    oldCode: null,
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "convener",
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief/项目/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "chief", targetKind: "project", targetExists: false }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "chief/项目/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "chief", targetKind: "project" }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "product/内置/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "product/内置/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "product", targetKind: "built-in-governance", targetExists: false }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "product/内置/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "product", targetKind: "built-in-governance" }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "product/项目/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "product", targetKind: "project", targetExists: true }),
    oldAllow: true,
    oldCode: null,
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "convener",
    knownDelta: null,
  }),
  Object.freeze({
    name: "product/项目/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "product", targetKind: "project", targetExists: false }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "product/项目/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "product", targetKind: "project" }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "rapporteur/内置/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "rapporteur", targetKind: "built-in-governance", targetExists: true }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "rapporteur/内置/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "rapporteur", targetKind: "built-in-governance", targetExists: false }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "rapporteur/内置/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "rapporteur", targetKind: "built-in-governance" }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "rapporteur/项目/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "rapporteur", targetKind: "project", targetExists: true }),
    oldAllow: true,
    oldCode: null,
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "convener",
    knownDelta: null,
  }),
  Object.freeze({
    name: "rapporteur/项目/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "rapporteur", targetKind: "project", targetExists: false }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "rapporteur/项目/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "rapporteur", targetKind: "project" }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "nominator/内置/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "nominator", targetKind: "built-in-governance", targetExists: true }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "nominator/内置/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "nominator", targetKind: "built-in-governance", targetExists: false }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "nominator/内置/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "nominator", targetKind: "built-in-governance" }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "nominator/项目/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "nominator", targetKind: "project", targetExists: true }),
    oldAllow: true,
    oldCode: null,
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "convener",
    knownDelta: null,
  }),
  Object.freeze({
    name: "nominator/项目/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "nominator", targetKind: "project", targetExists: false }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "nominator/项目/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "nominator", targetKind: "project" }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "convener/内置/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "convener", targetKind: "built-in-governance", targetExists: true }),
    oldAllow: false,
    oldCode: "self-dispatch",
    expectedAllow: false,
    expectedCode: "self-dispatch",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "convener/内置/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "convener", targetKind: "built-in-governance", targetExists: false }),
    oldAllow: false,
    oldCode: "self-dispatch",
    expectedAllow: false,
    expectedCode: "self-dispatch",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "convener/内置/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "convener", targetKind: "built-in-governance" }),
    oldAllow: false,
    oldCode: "self-dispatch",
    expectedAllow: false,
    expectedCode: "self-dispatch",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "convener/项目/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "convener", targetKind: "project", targetExists: true }),
    oldAllow: false,
    oldCode: "self-dispatch",
    expectedAllow: false,
    expectedCode: "self-dispatch",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "convener/项目/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "convener", targetKind: "project", targetExists: false }),
    oldAllow: false,
    oldCode: "self-dispatch",
    expectedAllow: false,
    expectedCode: "self-dispatch",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "convener/项目/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "convener", targetKind: "project" }),
    oldAllow: false,
    oldCode: "self-dispatch",
    expectedAllow: false,
    expectedCode: "self-dispatch",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "implementer/内置/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "implementer", targetKind: "built-in-governance", targetExists: true }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "implementer/内置/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "implementer", targetKind: "built-in-governance", targetExists: false }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "implementer/内置/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "implementer", targetKind: "built-in-governance" }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "implementer/项目/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "implementer", targetKind: "project", targetExists: true }),
    oldAllow: true,
    oldCode: null,
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "convener",
    knownDelta: null,
  }),
  Object.freeze({
    name: "implementer/项目/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "implementer", targetKind: "project", targetExists: false }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "implementer/项目/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "implementer", targetKind: "project" }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "env-bootstrap/内置/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "env-bootstrap", targetKind: "built-in-governance", targetExists: true }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "env-bootstrap/内置/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "env-bootstrap", targetKind: "built-in-governance", targetExists: false }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "env-bootstrap/内置/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "env-bootstrap", targetKind: "built-in-governance" }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "convener-target-forbidden",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "env-bootstrap/项目/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "env-bootstrap", targetKind: "project", targetExists: true }),
    oldAllow: true,
    oldCode: null,
    expectedAllow: true,
    expectedCode: null,
    expectedReportToRoleId: "convener",
    knownDelta: null,
  }),
  Object.freeze({
    name: "env-bootstrap/项目/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "env-bootstrap", targetKind: "project", targetExists: false }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "env-bootstrap/项目/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "env-bootstrap", targetKind: "project" }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-missing",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "空目标/内置/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "", targetKind: "built-in-governance", targetExists: true }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "dispatch-target-invalid",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "空目标/内置/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "", targetKind: "built-in-governance", targetExists: false }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "dispatch-target-invalid",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "空目标/内置/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "", targetKind: "built-in-governance" }),
    oldAllow: false,
    oldCode: "convener-target-forbidden",
    expectedAllow: false,
    expectedCode: "dispatch-target-invalid",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "空目标/项目/exists=true",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "", targetKind: "project", targetExists: true }),
    oldAllow: true,
    oldCode: null,
    expectedAllow: false,
    expectedCode: "dispatch-target-invalid",
    expectedReportToRoleId: null,
    knownDelta: "dispatch-empty-target",
  }),
  Object.freeze({
    name: "空目标/项目/exists=false",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "", targetKind: "project", targetExists: false }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-invalid",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "空目标/项目/exists=缺省",
    input: Object.freeze({ sourceRoleId: "convener", targetRoleId: "", targetKind: "project" }),
    oldAllow: false,
    oldCode: "target-card-missing",
    expectedAllow: false,
    expectedCode: "dispatch-target-invalid",
    expectedReportToRoleId: null,
    knownDelta: null,
  }),
]);

export interface OraclePreflightCase {
  readonly name: string;
  readonly action: "team-plan" | "stable-write" | "requirement-change";
  readonly facts: Readonly<Record<string, unknown>>;
  /** 旧实现行为锚点（历史文件:行；捕获期转写，运行期不读取）。 */
  readonly oldAnchor: string;
  /** 旧角色侧谓词的 allow 位（捕获期）。 */
  readonly oldAllow: boolean;
  /** 新模块期望 allow 位（`allow:true` 只表示纯策略不反对）。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码（allow 时为 null）。 */
  readonly expectedCode: string | null;
  /** 已知更严格差异的类别（`KNOWN_DELTAS` 前缀）；无差异为 null。 */
  readonly knownDelta: string | null;
}

/** 动作前置差分矩阵：team-plan 12 + stable-write 5 + requirement-change 10 = 27 例。 */
export const ORACLE_PREFLIGHT_CASES: readonly OraclePreflightCase[] = Object.freeze([
  Object.freeze({
    name: "team-plan 基线正例",
    action: "team-plan",
    facts: Object.freeze({
      actorRoleId: "convener",
      operationId: "op-plan-1",
      flowId: "focus",
      runId: "run-1",
      baseDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      plan: {
        path: "docs/scheduling/focus-team-v2.md",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        version: 2,
      },
    }),
    oldAnchor: "apply-journal.ts:2795/2816-2818（completeTeamPlan 角色侧身份/依据/路径）；run-role.ts:1826（directGovernance）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "team-plan runId 缺省",
    action: "team-plan",
    facts: Object.freeze({
      actorRoleId: "convener",
      operationId: "op-plan-1",
      flowId: "focus",
      runId: undefined,
      baseDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      plan: {
        path: "docs/scheduling/focus-team-v2.md",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        version: 2,
      },
    }),
    oldAnchor: "apply-journal.ts:2795/2816-2818（completeTeamPlan 角色侧身份/依据/路径）；run-role.ts:1826（directGovernance）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "team-plan baseDigest 大写 64hex 正例",
    action: "team-plan",
    facts: Object.freeze({
      actorRoleId: "convener",
      operationId: "op-plan-1",
      flowId: "focus",
      runId: "run-1",
      baseDigest: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      plan: {
        path: "docs/scheduling/focus-team-v2.md",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        version: 2,
      },
    }),
    oldAnchor: "apply-journal.ts:2795/2816-2818（completeTeamPlan 角色侧身份/依据/路径）；run-role.ts:1826（directGovernance）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "team-plan 非 convener 身份",
    action: "team-plan",
    facts: Object.freeze({
      actorRoleId: "chief",
      operationId: "op-plan-1",
      flowId: "focus",
      runId: "run-1",
      baseDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      plan: {
        path: "docs/scheduling/focus-team-v2.md",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        version: 2,
      },
    }),
    oldAnchor: "apply-journal.ts:2795/2816-2818（completeTeamPlan 角色侧身份/依据/路径）；run-role.ts:1826（directGovernance）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "team-plan-facts-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "team-plan operationId 空",
    action: "team-plan",
    facts: Object.freeze({
      actorRoleId: "convener",
      operationId: "",
      flowId: "focus",
      runId: "run-1",
      baseDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      plan: {
        path: "docs/scheduling/focus-team-v2.md",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        version: 2,
      },
    }),
    oldAnchor: "apply-journal.ts:2795/2816-2818（completeTeamPlan 角色侧身份/依据/路径）；run-role.ts:1826（directGovernance）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "team-plan-facts-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "team-plan flowId 空",
    action: "team-plan",
    facts: Object.freeze({
      actorRoleId: "convener",
      operationId: "op-plan-1",
      flowId: "",
      runId: "run-1",
      baseDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      plan: {
        path: "docs/scheduling/focus-team-v2.md",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        version: 2,
      },
    }),
    oldAnchor: "apply-journal.ts:2795/2816-2818（completeTeamPlan 角色侧身份/依据/路径）；run-role.ts:1826（directGovernance）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "team-plan-facts-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "team-plan baseDigest 63 字符",
    action: "team-plan",
    facts: Object.freeze({
      actorRoleId: "convener",
      operationId: "op-plan-1",
      flowId: "focus",
      runId: "run-1",
      baseDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      plan: {
        path: "docs/scheduling/focus-team-v2.md",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        version: 2,
      },
    }),
    oldAnchor: "apply-journal.ts:2795/2816-2818（completeTeamPlan 角色侧身份/依据/路径）；run-role.ts:1826（directGovernance）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "team-plan-facts-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "team-plan 路径版本不匹配",
    action: "team-plan",
    facts: Object.freeze({
      actorRoleId: "convener",
      operationId: "op-plan-1",
      flowId: "focus",
      runId: "run-1",
      baseDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      plan: {
        path: "docs/scheduling/focus-team-v2.md",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        version: 3,
      },
    }),
    oldAnchor: "apply-journal.ts:2795/2816-2818（completeTeamPlan 角色侧身份/依据/路径）；run-role.ts:1826（directGovernance）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "team-plan-path-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "team-plan flow 不匹配",
    action: "team-plan",
    facts: Object.freeze({
      actorRoleId: "convener",
      operationId: "op-plan-1",
      flowId: "focus",
      runId: "run-1",
      baseDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      plan: {
        path: "docs/scheduling/other-team-v2.md",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        version: 2,
      },
    }),
    oldAnchor: "apply-journal.ts:2795/2816-2818（completeTeamPlan 角色侧身份/依据/路径）；run-role.ts:1826（directGovernance）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "team-plan-path-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    // 2026-11-09《团队计划登记 run 绑定 / baseDigest 合法来源》B1 §4.3：缺省 plan.sha256 由旧
    // 「模块更严格差异」改为契约允许（应用按计划实际字节派生）；旧角色侧谓词同样 allow。
    name: "team-plan plan 缺 sha256（新契约允许）",
    action: "team-plan",
    facts: Object.freeze({
      actorRoleId: "convener",
      operationId: "op-plan-1",
      flowId: "focus",
      runId: "run-1",
      baseDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      plan: {
        path: "docs/scheduling/focus-team-v2.md",
        version: 2,
      },
    }),
    oldAnchor: "apply-journal.ts:2795/2816-2818（completeTeamPlan 角色侧身份/依据/路径）；run-role.ts:1826（directGovernance）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "team-plan plan sha256 非 64hex（已知差异）",
    action: "team-plan",
    facts: Object.freeze({
      actorRoleId: "convener",
      operationId: "op-plan-1",
      flowId: "focus",
      runId: "run-1",
      baseDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      plan: {
        path: "docs/scheduling/focus-team-v2.md",
        sha256: "not-a-sha",
        version: 2,
      },
    }),
    oldAnchor: "apply-journal.ts:2795/2816-2818（completeTeamPlan 角色侧身份/依据/路径）；run-role.ts:1826（directGovernance）",
    oldAllow: true,
    expectedAllow: false,
    expectedCode: "team-plan-facts-invalid",
    knownDelta: "team-plan-fact-schema",
  }),
  Object.freeze({
    name: "team-plan version 0",
    action: "team-plan",
    facts: Object.freeze({
      actorRoleId: "convener",
      operationId: "op-plan-1",
      flowId: "focus",
      runId: "run-1",
      baseDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      plan: {
        path: "docs/scheduling/focus-team-v2.md",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        version: 0,
      },
    }),
    oldAnchor: "apply-journal.ts:2795/2816-2818（completeTeamPlan 角色侧身份/依据/路径）；run-role.ts:1826（directGovernance）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "team-plan-facts-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "stable-write workflow 正例",
    action: "stable-write",
    facts: Object.freeze({
      actorRoleId: "convener",
      kind: "workflow",
      content: "x",
    }),
    oldAnchor: "run-role.ts:1830/2347-2349（canRequestStableWrite 仅 convener）；model/runtime.ts:2503-2508（kind 闭集 workflow）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "stable-write kind=role-card",
    action: "stable-write",
    facts: Object.freeze({
      actorRoleId: "convener",
      kind: "role-card",
      content: "x",
    }),
    oldAnchor: "run-role.ts:1830/2347-2349（canRequestStableWrite 仅 convener）；model/runtime.ts:2503-2508（kind 闭集 workflow）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "stable-write-kind-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "stable-write kind=boundary",
    action: "stable-write",
    facts: Object.freeze({
      actorRoleId: "convener",
      kind: "boundary",
      content: "x",
    }),
    oldAnchor: "run-role.ts:1830/2347-2349（canRequestStableWrite 仅 convener）；model/runtime.ts:2503-2508（kind 闭集 workflow）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "stable-write-kind-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "stable-write 非 convener",
    action: "stable-write",
    facts: Object.freeze({
      actorRoleId: "chief",
      kind: "workflow",
      content: "x",
    }),
    oldAnchor: "run-role.ts:1830/2347-2349（canRequestStableWrite 仅 convener）；model/runtime.ts:2503-2508（kind 闭集 workflow）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "stable-write-facts-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "stable-write 空 content（已知差异）",
    action: "stable-write",
    facts: Object.freeze({
      actorRoleId: "convener",
      kind: "workflow",
      content: "",
    }),
    oldAnchor: "run-role.ts:1830/2347-2349（canRequestStableWrite 仅 convener）；model/runtime.ts:2503-2508（kind 闭集 workflow）",
    oldAllow: true,
    expectedAllow: false,
    expectedCode: "stable-write-facts-invalid",
    knownDelta: "stable-write-empty-content",
  }),
  Object.freeze({
    name: "requirement-change flowId 归因正例",
    action: "requirement-change",
    facts: Object.freeze({
      actorRoleId: "convener",
      changeKind: "scope",
      summary: "需要补充验收证据",
      rationale: "现有证据不足以覆盖真实环境",
      flowId: "focus",
    }),
    oldAnchor: "provider/runtime/tools.ts:3679-3715（request_requirement_change 工具侧事实校验）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "requirement-change intentId 归因正例",
    action: "requirement-change",
    facts: Object.freeze({
      actorRoleId: "convener",
      changeKind: "scope",
      summary: "需要补充验收证据",
      rationale: "现有证据不足以覆盖真实环境",
      flowId: undefined,
      intentId: "intent-1",
    }),
    oldAnchor: "provider/runtime/tools.ts:3679-3715（request_requirement_change 工具侧事实校验）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "requirement-change taskId 归因正例",
    action: "requirement-change",
    facts: Object.freeze({
      actorRoleId: "convener",
      changeKind: "scope",
      summary: "需要补充验收证据",
      rationale: "现有证据不足以覆盖真实环境",
      flowId: undefined,
      taskId: "task-1",
    }),
    oldAnchor: "provider/runtime/tools.ts:3679-3715（request_requirement_change 工具侧事实校验）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
  Object.freeze({
    name: "requirement-change 无归因键",
    action: "requirement-change",
    facts: Object.freeze({
      actorRoleId: "convener",
      changeKind: "scope",
      summary: "需要补充验收证据",
      rationale: "现有证据不足以覆盖真实环境",
      flowId: undefined,
    }),
    oldAnchor: "provider/runtime/tools.ts:3679-3715（request_requirement_change 工具侧事实校验）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "requirement-change-scope-missing",
    knownDelta: null,
  }),
  Object.freeze({
    name: "requirement-change 非法 changeKind",
    action: "requirement-change",
    facts: Object.freeze({
      actorRoleId: "convener",
      changeKind: "unknown",
      summary: "需要补充验收证据",
      rationale: "现有证据不足以覆盖真实环境",
      flowId: "focus",
    }),
    oldAnchor: "provider/runtime/tools.ts:3679-3715（request_requirement_change 工具侧事实校验）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "requirement-change-facts-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "requirement-change 空 summary",
    action: "requirement-change",
    facts: Object.freeze({
      actorRoleId: "convener",
      changeKind: "scope",
      summary: "",
      rationale: "现有证据不足以覆盖真实环境",
      flowId: "focus",
    }),
    oldAnchor: "provider/runtime/tools.ts:3679-3715（request_requirement_change 工具侧事实校验）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "requirement-change-facts-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "requirement-change 空 rationale",
    action: "requirement-change",
    facts: Object.freeze({
      actorRoleId: "convener",
      changeKind: "scope",
      summary: "需要补充验收证据",
      rationale: "",
      flowId: "focus",
    }),
    oldAnchor: "provider/runtime/tools.ts:3679-3715（request_requirement_change 工具侧事实校验）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "requirement-change-facts-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "requirement-change 空 impact",
    action: "requirement-change",
    facts: Object.freeze({
      actorRoleId: "convener",
      changeKind: "scope",
      summary: "需要补充验收证据",
      rationale: "现有证据不足以覆盖真实环境",
      flowId: "focus",
      impact: "",
    }),
    oldAnchor: "provider/runtime/tools.ts:3679-3715（request_requirement_change 工具侧事实校验）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "requirement-change-facts-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "requirement-change 空 proposedIntentPatch",
    action: "requirement-change",
    facts: Object.freeze({
      actorRoleId: "convener",
      changeKind: "scope",
      summary: "需要补充验收证据",
      rationale: "现有证据不足以覆盖真实环境",
      flowId: "focus",
      proposedIntentPatch: "",
    }),
    oldAnchor: "provider/runtime/tools.ts:3679-3715（request_requirement_change 工具侧事实校验）",
    oldAllow: false,
    expectedAllow: false,
    expectedCode: "requirement-change-facts-invalid",
    knownDelta: null,
  }),
  Object.freeze({
    name: "requirement-change 可选 impact/patch 正例",
    action: "requirement-change",
    facts: Object.freeze({
      actorRoleId: "convener",
      changeKind: "scope",
      summary: "需要补充验收证据",
      rationale: "现有证据不足以覆盖真实环境",
      flowId: "focus",
      impact: "影响一个模块",
      proposedIntentPatch: "建议补充范围",
    }),
    oldAnchor: "provider/runtime/tools.ts:3679-3715（request_requirement_change 工具侧事实校验）",
    oldAllow: true,
    expectedAllow: true,
    expectedCode: null,
    knownDelta: null,
  }),
]);

export interface OracleGitActionCase {
  readonly name: string;
  readonly facts: Readonly<Record<string, unknown>>;
  /** 旧实现行为锚点（Git Service/宿主上下文；无纯函数 oracle）。 */
  readonly oldAnchor: string;
  /** 新模块期望 allow 位（捕获期冻结）。 */
  readonly expectedAllow: boolean;
  /** 新模块期望稳定码（allow 时为 null）。 */
  readonly expectedCode: string | null;
}

/** Git 动作行为矩阵（旧实现无纯函数 oracle；模块行为 + 历史锚点冻结）。 */
export const ORACLE_GIT_ACTION_CASES: readonly OracleGitActionCase[] = Object.freeze([
  Object.freeze({
    name: "git-action init 正例",
    facts: Object.freeze({
      actorRoleId: "convener",
      action: "init",
      operationId: "op-git-1",
      taskId: "task-1",
      runId: "run-1",
      customerSource: true,
      repositoryState: "absent",
    }),
    oldAnchor: "git-capabilities.ts（convener 身份 / creator close / git-integration-child-not-accepted / git-revert-request-invalid）；旧角色侧条件闭包于 Git Service/宿主上下文，无纯函数 oracle",
    expectedAllow: true,
    expectedCode: null,
  }),
  Object.freeze({
    name: "git-action init 仓库已存在",
    facts: Object.freeze({
      actorRoleId: "convener",
      action: "init",
      operationId: "op-git-1",
      taskId: "task-1",
      runId: "run-1",
      customerSource: true,
      repositoryState: "present",
    }),
    oldAnchor: "git-capabilities.ts（convener 身份 / creator close / git-integration-child-not-accepted / git-revert-request-invalid）；旧角色侧条件闭包于 Git Service/宿主上下文，无纯函数 oracle",
    expectedAllow: false,
    expectedCode: "git-action-conditions-unmet",
  }),
  Object.freeze({
    name: "git-action init 非客户来源",
    facts: Object.freeze({
      actorRoleId: "convener",
      action: "init",
      operationId: "op-git-1",
      taskId: "task-1",
      runId: "run-1",
      customerSource: false,
      repositoryState: "absent",
    }),
    oldAnchor: "git-capabilities.ts（convener 身份 / creator close / git-integration-child-not-accepted / git-revert-request-invalid）；旧角色侧条件闭包于 Git Service/宿主上下文，无纯函数 oracle",
    expectedAllow: false,
    expectedCode: "git-action-conditions-unmet",
  }),
  Object.freeze({
    name: "git-action commit 路径未授权",
    facts: Object.freeze({
      actorRoleId: "convener",
      action: "commit",
      operationId: "op-git-1",
      taskId: "task-1",
      runId: "run-1",
      base: {
        ref: "refs/ans/candidates/example",
        oid: {
          objectFormat: "sha256",
          hex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        },
      },
      paths: [
        "src/example.ts",
      ],
      pathsAuthorized: false,
    }),
    oldAnchor: "git-capabilities.ts（convener 身份 / creator close / git-integration-child-not-accepted / git-revert-request-invalid）；旧角色侧条件闭包于 Git Service/宿主上下文，无纯函数 oracle",
    expectedAllow: false,
    expectedCode: "git-action-conditions-unmet",
  }),
  Object.freeze({
    name: "git-action integrate 候选未接受",
    facts: Object.freeze({
      actorRoleId: "convener",
      action: "integrate",
      operationId: "op-git-1",
      taskId: "task-1",
      runId: "run-1",
      base: {
        ref: "refs/ans/candidates/example",
        oid: {
          objectFormat: "sha256",
          hex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        },
      },
      candidates: [
        {
          objectFormat: "sha256",
          hex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        },
        {
          objectFormat: "sha256",
          hex: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        },
      ],
      contributorsAccepted: false,
      contributorsAuthorized: true,
    }),
    oldAnchor: "git-capabilities.ts（convener 身份 / creator close / git-integration-child-not-accepted / git-revert-request-invalid）；旧角色侧条件闭包于 Git Service/宿主上下文，无纯函数 oracle",
    expectedAllow: false,
    expectedCode: "git-action-conditions-unmet",
  }),
  Object.freeze({
    name: "git-action revert review 未接受",
    facts: Object.freeze({
      actorRoleId: "convener",
      action: "revert",
      operationId: "op-git-1",
      taskId: "task-1",
      runId: "run-1",
      base: {
        ref: "refs/ans/candidates/example",
        oid: {
          objectFormat: "sha256",
          hex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        },
      },
      commit: {
        objectFormat: "sha256",
        hex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
      controllerTaskId: "task-2",
      reviewAccepted: false,
      ownerGrantsVerified: true,
    }),
    oldAnchor: "git-capabilities.ts（convener 身份 / creator close / git-integration-child-not-accepted / git-revert-request-invalid）；旧角色侧条件闭包于 Git Service/宿主上下文，无纯函数 oracle",
    expectedAllow: false,
    expectedCode: "git-action-conditions-unmet",
  }),
  Object.freeze({
    name: "git-action publish 目标非 delivery",
    facts: Object.freeze({
      actorRoleId: "convener",
      action: "publish",
      operationId: "op-git-1",
      taskId: "task-1",
      runId: "run-1",
      expected: {
        ref: "refs/ans/candidates/example",
        oid: {
          objectFormat: "sha256",
          hex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        },
      },
      candidate: {
        objectFormat: "sha256",
        hex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
      publishTarget: "candidate",
      finalCandidateVerified: true,
      criteria: [
        {
          oid: {
            objectFormat: "sha256",
            hex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          },
          path: "docs/quality/report.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      evidence: [
        {
          oid: {
            objectFormat: "sha256",
            hex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          },
          path: "docs/quality/report.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      creatorCloseOperationId: "op-close-1",
    }),
    oldAnchor: "git-capabilities.ts（convener 身份 / creator close / git-integration-child-not-accepted / git-revert-request-invalid）；旧角色侧条件闭包于 Git Service/宿主上下文，无纯函数 oracle",
    expectedAllow: false,
    expectedCode: "git-action-target-invalid",
  }),
  Object.freeze({
    name: "git-action publish 正例",
    facts: Object.freeze({
      actorRoleId: "convener",
      action: "publish",
      operationId: "op-git-1",
      taskId: "task-1",
      runId: "run-1",
      expected: {
        ref: "refs/ans/candidates/example",
        oid: {
          objectFormat: "sha256",
          hex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        },
      },
      candidate: {
        objectFormat: "sha256",
        hex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
      publishTarget: "delivery",
      finalCandidateVerified: true,
      criteria: [
        {
          oid: {
            objectFormat: "sha256",
            hex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          },
          path: "docs/quality/report.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      evidence: [
        {
          oid: {
            objectFormat: "sha256",
            hex: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          },
          path: "docs/quality/report.md",
          sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      creatorCloseOperationId: "op-close-1",
    }),
    oldAnchor: "git-capabilities.ts（convener 身份 / creator close / git-integration-child-not-accepted / git-revert-request-invalid）；旧角色侧条件闭包于 Git Service/宿主上下文，无纯函数 oracle",
    expectedAllow: true,
    expectedCode: null,
  }),
  Object.freeze({
    name: "git-action 未知动作",
    facts: Object.freeze({
      actorRoleId: "convener",
      action: "unknown",
      operationId: "op-git-1",
    }),
    oldAnchor: "git-capabilities.ts（convener 身份 / creator close / git-integration-child-not-accepted / git-revert-request-invalid）；旧角色侧条件闭包于 Git Service/宿主上下文，无纯函数 oracle",
    expectedAllow: false,
    expectedCode: "git-action-invalid",
  }),
]);

/** 已列明差异（模块按 E0.3/D4 更严格，非放宽）。差分测试按前缀逐类断言；新增差异即失败。 */
export const KNOWN_DELTAS: readonly string[] = Object.freeze([
  "dispatch-code-map：旧 evaluateDispatchAuthorization 使用 target-card-missing/unknown-source 等粗粒度拒绝码；新模块按 R-2 给出条件化稳定码（dispatch-target-* / convener-target-forbidden / self-dispatch）。allow 位一致。",
  "dispatch-existence：内置 verifier + targetExists 缺省/false（2 例）：旧谓词对内置目标忽略存在性事实返回 allow；模块按契约 §3.1/D4 要求宿主显式核验（缺省即 false），fail-closed 拒绝。",
  "dispatch-empty-target：空 targetRoleId + project + targetExists=true：旧谓词不校验空 id 返回 allow；模块按硬身份拒绝空目标（dispatch-target-invalid）。",
  "team-plan-fact-schema：plan sha256 非 64hex（1 例）：旧角色侧谓词只看 path/version 正则；模块按 D4 校验 fact 类型。旧 Service 仍做最终 hash 漂移/结构/名单/属主校验，模块不复制。2026-11-09 起 plan 缺 sha256 已按新契约允许（应用派生，B1 §4.3），不再属本差异。",
  "stable-write-empty-content：content 空串：旧类型只约束 string 并返回 allow；模块把空内容视为无事实（fail-closed）。Provider/Service 仍做最终内容校验。",
  "git-action-no-pure-oracle：Git 动作的角色侧条件闭包于 Git Service/宿主上下文，旧实现无纯函数 oracle；fixture 冻结模块行为与历史源码锚点，行为正负例由本矩阵与模块单测共同覆盖。",
]);

export const ORACLE_GOLDEN_PAYLOAD = Object.freeze({
  spec: ORACLE_CONVENER_SPEC,
  toolsTrio: ORACLE_CONVENER_TRIO_TOOLS,
  toolsSingle: ORACLE_CONVENER_SINGLE_TOOLS,
  dispatch: ORACLE_DISPATCH_CASES,
  preflight: ORACLE_PREFLIGHT_CASES,
  gitAction: ORACLE_GIT_ACTION_CASES,
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
 * `test/roles/rapporteur/oracle-fixture.ts`）。
 *
 * - `capture`：捕获期望值时旧 oracle 文件身份（行数 + SHA-256 + 锚点 + 捕获时点）。
 * - `switch`：E2 X-R4 后实测身份（`changed` 与捕获期不同；`unchanged` 逐字节一致）。
 * - 两者都是**历史记录**：差分测试不读取工作树旧文件，旧实现删除后测试仍可运行。
 * - `counts` 与 fixture 数组长度一致；`coverage` 记录期望面 → 测试断言映射（不得删覆盖）。
 * - `payloadSha256`：冻结载荷哈希（防期望值静默漂移）。
 */
export const ORACLE_GOLDEN_META = Object.freeze({
  schema: "convener-oracle-golden/v1",
  capturedAt: "2026-11-07",
  generator:
    "E1 开发期 live probe（E1 证据 §4）+ E2 X-R4 金样化复算（角色卡/convener-code/docs/change/2026-11-07_E2-XR4_golden-capture.mjs）",
  evidence: Object.freeze({
    capture: "角色卡/convener-code/docs/change/2026-11-07_E1_convener-module-evidence.md §1/§4",
    switch: "角色卡/门禁引擎/docs/change/2026-11-07_E2-XR4_gate-facade-convener-evidence.md §1/§2/§5/§7.1",
    goldenization:
      "角色卡/convener-code/docs/change/2026-11-07_E1_convener-module-evidence.md §10（E2 X-R4 fixture 金样化）",
  }),
  module: Object.freeze({
    path: "src/common/roles/convener/index.ts",
    lineCount: 688,
    sha256: "e125478a7809ae60a380c40236bfbc5bb6eaebd43819b40520a9a48bca6e7985",
  }),
  capture: Object.freeze<Readonly<Record<string, OracleCaptureIdentity>>>({
    governanceRoles: Object.freeze({
      path: "src/common/门禁引擎/governance-roles.ts",
      lineCount: 794,
      sha256: "fddda111cb1ea76614f632f931441d45e534e4f9f23297193615fbdf525cd16e",
      anchors: "159（CREATED_TASK_CLOSURE 共享段）/ 178-202（CONVENER_CARD_TEXT）/ 365-411（convener 内联规格）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R4 已切换：内联卡/规格删除，`specOf(convenerRoleModule)` 装配；matrix 逐字迁入 `BUILT_IN_ROLE_MATRIX.convener`（D6）",
    }),
    runRole: Object.freeze({
      path: "src/pipeline/orchestration/run-role.ts",
      lineCount: 3333,
      sha256: "026f5e995f4f10cf890a94a5e50d9a9317a0ebbcc04a1106bf287c9d6c2823e6",
      anchors: "1826-1830（directGovernance/工具门控）/ 2347-2349（canRequestStableWrite）/ 2859-2878（TRIO_CARD_KINDS）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R1 起编排单元修改；X-R4 未改本文件。`TRIO_CARD_KINDS.convener` 仍保留为回退/迁移前源码 oracle",
    }),
    roleToolRegistry: Object.freeze({
      path: "src/common/门禁引擎/role-tool-registry.ts",
      lineCount: 157,
      sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
      anchors: "52-67（ROLE_TOOL_CATALOG）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R4 未改（捕获期与切换后逐字节一致）",
    }),
    workflowPreconditions: Object.freeze({
      path: "src/common/编排/workflow-preconditions.ts",
      lineCount: 1609,
      sha256: "6c2349a5e7766e8c79edcc5c7b465cbf4bf10bae662cbe13f99499e6c8c4dd41",
      anchors: "1530-1570（evaluateDispatchAuthorization）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R4 时点未改；此后并发单元修改（切换后实测见 switch.changed）",
    }),
    applyJournal: Object.freeze({
      path: "src/service/trunk/impl/apply-journal.ts",
      lineCount: 3723,
      sha256: "fd778342ff83ebd51582847cd78f8bdfe0861bd6d8b789e829ac2bfaf3255ffb",
      anchors: "2795/2816-2818（completeTeamPlan 角色侧谓词转写）",
      capturedAt: "E1（2026-11-07）",
      e2Disposition: "X-R4 时点未改；此后并发单元修改（切换后实测见 switch.changed）",
    }),
    runtimeTools: Object.freeze({
      path: "src/provider/runtime/tools.ts",
      lineCount: 5317,
      sha256: "48ed8dec583f078c6808e269ca38a273ae7479b126b13e312892edba97a03cc0",
      anchors: "3679-3715（request_requirement_change 工具侧事实校验）",
      capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
      e2Disposition: "X-R4 未改；哈希为金样化时实测（历史记录，运行期不读取）",
    }),
    runtimeModel: Object.freeze({
      path: "src/model/runtime.ts",
      lineCount: 3945,
      sha256: "368559b75268df669f362406d785d5c3f04ca71994736fdfab181b34e019e9e5",
      anchors: "2503-2508（RequestStableWriteInput.kind 闭集）",
      capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
      e2Disposition: "X-R4 未改；哈希为金样化时实测（历史记录，运行期不读取）",
    }),
    gitCapabilities: Object.freeze({
      path: "src/service/trunk/impl/git-capabilities.ts",
      lineCount: 557,
      sha256: "1a3dec761d64458af17fc1de3d238db752c461f85cbab3b463186a5603263a10",
      anchors: "convener 身份 / publish 原创建者收口 / git-integration-child-not-accepted / git-revert-request-invalid",
      capturedAt: "金样化（2026-11-07；E1 证据未记录该文件哈希）",
      e2Disposition: "X-R4 未改；哈希为金样化时实测（历史记录，运行期不读取）",
    }),
  }),
  switch: Object.freeze({
    changed: Object.freeze<Readonly<Record<string, OracleSwitchIdentity>>>({
      governanceRoles: Object.freeze({
        path: "src/common/门禁引擎/governance-roles.ts",
        lineCount: 649,
        sha256: "c31274f9497298676f2afdedadf2607c2c4d662c362bd76b6f55aaf9d299a1d1",
        anchors: "21-23（convener 模块 import）/ 246-262（BUILT_IN_ROLE_MATRIX.convener）/ 356-358（specOf(convenerRoleModule)）/ 423（BUILT_IN_ROLE_MODULES 装配）",
        change: "X-R4 数据门面切换（E2-XR4 证据 §3/§7.1）",
      }),
      runRole: Object.freeze({
        path: "src/pipeline/orchestration/run-role.ts",
        lineCount: 3483,
        sha256: "655095b0bf0d63deef3611b8f9ab0397e696b7c401d9c76fa36b97be298eb417",
        anchors: "3009（TRIO_CARD_KINDS.convener 回退仍在）",
        change: "X-R1 起编排单元修改（非 X-R4）；E2-XR4 证据 §1 实测值",
      }),
      workflowPreconditions: Object.freeze({
        path: "src/common/编排/workflow-preconditions.ts",
        lineCount: 1656,
        sha256: "a7e501185920cfb46b2c9d6751394dbf69fb632e9d48eb88ae62037885afd49a",
        change: "E1 捕获后由并发单元修改（非 X-R4）；仅在金样化元数据记录，不参与期望值",
      }),
      applyJournal: Object.freeze({
        path: "src/service/trunk/impl/apply-journal.ts",
        lineCount: 3734,
        sha256: "cc3342e67523591244d73372b2cdfdea83e024838eea2ed0850172dee4f7f519",
        change: "E1 捕获后由并发单元修改（非 X-R4）；仅在金样化元数据记录，不参与期望值",
      }),
    }),
    unchanged: Object.freeze<Readonly<Record<string, OracleSourceIdentity>>>({
      roleToolRegistry: Object.freeze({
        path: "src/common/门禁引擎/role-tool-registry.ts",
        lineCount: 157,
        sha256: "9aca72a5f64e22bc5c68af0997d04200faec58d7762563f02ab09aafd469389b",
      }),
    }),
    measuredAt: "2026-11-07（E2-XR4 证据 §7.1 + 本轮金样化实测）",
  }),
  counts: Object.freeze({
    specFields: 8,
    cardText: 1,
    cards: 1,
    toolsTrio: 5,
    toolsSingle: 2,
    dispatchCases: 54,
    dispatchKnownDeltas: 3,
    preflightCases: 27,
    preflightKnownDeltas: 2,
    gitActionCases: 9,
    knownDeltas: 6,
    fixtureComparisons: 107,
  }),
  coverage: Object.freeze({
    spec: "差分/规格：8 字段逐项 JSON 比较（含卡文本哈希/条目/预授权/禁写/capabilities）",
    cardText: "差分/卡文本：sha256 / 长度 / 行数",
    cards: "差分/cards：模块 cards 与金样一致（D8 无 legacy token）",
    tools: "差分/tools：trio/single 集合与金样逐项同序",
    dispatch: "差分/dispatch：54 组合 allow 位 + 稳定码 + reportToRoleId；已知差异逐项登记",
    preflight: "差分/动作前置：team-plan 12 + stable-write 5 + requirement-change 10；allow 位/稳定码",
    gitAction: "差分/git-action：9 例模块行为冻结（旧实现无纯函数 oracle）+ 历史锚点",
    knownDeltas: "差分/已知差异清单：6 类前缀齐备且与用例登记一致",
    provenance: "金样/provenance：元数据自洽 / 载荷哈希 / 无旧引擎 live 依赖",
  }),
  payloadSha256: "67ef107d65c0d753d9041563d187183d58bc1b40a707ca17aca1f6779ac6f31e",
});
