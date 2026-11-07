// test/roles/product/fixtures/product-differential-fixtures.ts
// product 模块差分夹具（E1；B1 E1.7）。
//
// 用途：给 `test/roles/product/product-differential.test.ts` 提供同一事实集合的多组输入。
// 夹具是**测试数据**，不是生产来源：`expected` 记录模块应返回的判定（allow/code/reportToRoleId），
// `difference` 记录与旧 oracle 的**已列明差异**（无标记 = 应零差异）。
//
// 旧 oracle（E1 过渡期权威，契约 §7.3）：
//  - 派发：`workflow-preconditions.ts::evaluateDispatchAuthorization`（硬身份/存在性）；
//  - VCA 前置：`version-change-runtime.ts::submitDirect` / `apply-journal.ts::prepareDirectSubmission`
//    / `vca-service.ts::prepareDirect|validateBaseTrunk|validateAmendmentRefs` 的角色侧条件；
//  - 卡/规格：`governance-roles.ts` product 规格 + 私有 `run-role.ts::TRIO_CARD_KINDS`。
// 差异编号（D-DISP-*/D-PRE-*）在 evidence 与差分测试中登记。

import type { RoleDispatchPolicyInput } from "../../../../src/model/role.ts";

/** 模块应返回的判定（`details` 不参与差分断言；code 仅在 deny 时断言）。 */
export interface ExpectedDispatchDecision {
  readonly allow: boolean;
  readonly code?: string;
  readonly reportToRoleId?: string;
}

export interface DispatchFixture {
  readonly id: string;
  readonly input: RoleDispatchPolicyInput;
  readonly expected: ExpectedDispatchDecision;
  /**
   * 与旧 oracle 的已列明差异；缺省 = 模块与旧 oracle 在 allow/deny 维度应一致。
   *  - D-DISP-1：旧 chief 分支不检查 targetExists；模块按 E0 §3.5 fail-closed 要求 true。
   *  - D-DISP-2：旧谓词把「id=product 但 kind=project」当项目 worker 放行；模块视为身份冲突拒绝。
   *  - D-DISP-3：非 product 目标不在本模块判定范围（由目标角色模块/引擎负责回答）。
   */
  readonly difference?: "D-DISP-1" | "D-DISP-2" | "D-DISP-3";
  readonly note?: string;
}

/** 派发差分夹具（old oracle 在该文件中以同一 input 重建：fromRoleId=source??""，targetBuiltIn=kind 判定）。 */
export const DISPATCH_FIXTURES: readonly DispatchFixture[] = Object.freeze([
  {
    id: "chief-to-product-builtin-exists",
    input: {
      sourceRoleId: "chief",
      targetRoleId: "product",
      targetKind: "built-in-governance",
      targetExists: true,
    },
    expected: { allow: true, reportToRoleId: "chief" },
    note: "星形任务：chief→product 允许，报告期望=创建者 chief。",
  },
  {
    id: "chief-to-product-builtin-missing",
    input: {
      sourceRoleId: "chief",
      targetRoleId: "product",
      targetKind: "built-in-governance",
      targetExists: false,
    },
    expected: { allow: false, code: "target-card-missing" },
    difference: "D-DISP-1",
    note: "旧 chief 分支只查 allowlist；模块按 targetExists fail-closed。",
  },
  {
    id: "chief-to-product-builtin-undefined",
    input: {
      sourceRoleId: "chief",
      targetRoleId: "product",
      targetKind: "built-in-governance",
    },
    expected: { allow: false, code: "target-card-missing" },
    difference: "D-DISP-1",
    note: "targetExists 缺省=false；生产桌面调用点对内置 id 恒传 true。",
  },
  {
    id: "chief-to-product-project-kind",
    input: {
      sourceRoleId: "chief",
      targetRoleId: "product",
      targetKind: "project",
      targetExists: true,
    },
    expected: { allow: false, code: "chief-to-project-forbidden" },
    note: "chief 不直接给项目 worker 派实现任务；旧 oracle 同码。",
  },
  {
    id: "convener-to-product-builtin",
    input: {
      sourceRoleId: "convener",
      targetRoleId: "product",
      targetKind: "built-in-governance",
      targetExists: true,
    },
    expected: { allow: false, code: "convener-target-forbidden" },
    note: "convener 只能派项目 worker / verifier；旧 oracle 同码。",
  },
  {
    id: "convener-to-product-project-kind",
    input: {
      sourceRoleId: "convener",
      targetRoleId: "product",
      targetKind: "project",
      targetExists: true,
    },
    expected: { allow: false, code: "dispatch-input-invalid" },
    difference: "D-DISP-2",
    note: "旧谓词会把它当项目 worker 放行；内置 id=product 与 project 类别冲突，模块拒绝。",
  },
  {
    id: "rapporteur-to-product",
    input: {
      sourceRoleId: "rapporteur",
      targetRoleId: "product",
      targetKind: "built-in-governance",
      targetExists: true,
    },
    expected: { allow: false, code: "unknown-source" },
    note: "旧 oracle：只有 chief/convener 可派发。",
  },
  {
    id: "product-to-product-self",
    input: {
      sourceRoleId: "product",
      targetRoleId: "product",
      targetKind: "built-in-governance",
      targetExists: true,
    },
    expected: { allow: false, code: "self-dispatch" },
    note: "旧 oracle：不能派发给自己。",
  },
  {
    id: "product-to-verifier",
    input: {
      sourceRoleId: "product",
      targetRoleId: "verifier",
      targetKind: "built-in-governance",
      targetExists: true,
    },
    expected: { allow: false, code: "unknown-source" },
    note: "product 不派发（能力位 dispatchTask=false）；旧 oracle 同码。",
  },
  {
    id: "missing-source-to-product",
    input: {
      targetRoleId: "product",
      targetKind: "built-in-governance",
      targetExists: true,
    },
    expected: { allow: false, code: "unknown-source" },
    note: "来源缺失 ⇒ fail-closed；旧 oracle（fromRoleId 空串）同码。",
  },
  {
    id: "chief-to-rapporteur",
    input: {
      sourceRoleId: "chief",
      targetRoleId: "rapporteur",
      targetKind: "built-in-governance",
      targetExists: true,
    },
    expected: { allow: false, code: "dispatch-not-in-module-scope" },
    difference: "D-DISP-3",
    note: "旧 oracle 允许；非 product 目标由 rapporteur/chief 模块与引擎负责。",
  },
  {
    id: "convener-to-verifier",
    input: {
      sourceRoleId: "convener",
      targetRoleId: "verifier",
      targetKind: "built-in-governance",
      targetExists: true,
    },
    expected: { allow: false, code: "dispatch-not-in-module-scope" },
    difference: "D-DISP-3",
    note: "旧 oracle 允许 convener→verifier；由 convener 模块/引擎负责。",
  },
  {
    id: "invalid-target-kind",
    input: {
      sourceRoleId: "chief",
      targetRoleId: "product",
      targetKind: "worker" as unknown as RoleDispatchPolicyInput["targetKind"],
      targetExists: true,
    },
    expected: { allow: false, code: "dispatch-input-invalid" },
    note: "运行期畸形 kind ⇒ fail-closed（旧类型层不可达；模块防御）。",
  },
]);

/** VCA 前置事实（`RolePreflightInput.facts`）。 */
export type PreflightFacts = Readonly<Record<string, unknown>>;

export interface PreflightFixture {
  readonly id: string;
  readonly facts: PreflightFacts;
  readonly expected: { readonly allow: boolean; readonly code?: string };
  /**
   * 与旧 oracle 角色侧条件镜像的已列明差异；缺省 = 应零差异。
   *  - D-PRE-1：模块额外做 baseTrunk 形状/非空 targets 的早期 fail-closed（Service 仍会最终校验）。
   *  - D-PRE-2：模块拒绝未登记事实键（fail-closed，防事实走私）；旧类型输入忽略未知键。
   */
  readonly difference?: "D-PRE-1" | "D-PRE-2";
  readonly note?: string;
}

const VALID_BASE = Object.freeze({ version: 3, digest: "a".repeat(64) });
const VALID_TARGET = Object.freeze({ expectedFromSha256: "b".repeat(64) });

/** 一个合法直接提交的基线事实（测试内浅拷贝后改单键）。 */
export const VALID_VERSION_UPGRADE_FACTS: PreflightFacts = Object.freeze({
  initiatorRoleId: "product",
  kind: "version-upgrade",
  operationId: "op-product-upgrade-1",
  baseTrunk: VALID_BASE,
  targets: Object.freeze([VALID_TARGET]),
});

/** 前置差分夹具。 */
export const PREFLIGHT_FIXTURES: readonly PreflightFixture[] = Object.freeze([
  {
    id: "valid-direct-upgrade",
    facts: VALID_VERSION_UPGRADE_FACTS,
    expected: { allow: true },
    note: "合法直接提交：角色/kind/operationId/base/每目标 expectedFromSha256 齐备。",
  },
  {
    id: "valid-bootstrap",
    facts: Object.freeze({
      initiatorRoleId: "product",
      kind: "version-upgrade",
      operationId: "op-bootstrap-1",
      baseTrunk: null,
      bootstrap: true,
      targets: Object.freeze([VALID_TARGET]),
    }),
    expected: { allow: true },
    note: "首建 bootstrap：baseTrunk=null 且 bootstrap=true（旧 validateBaseTrunk 配对）。",
  },
  {
    id: "null-base-without-bootstrap",
    facts: Object.freeze({ ...VALID_VERSION_UPGRADE_FACTS, baseTrunk: null }),
    expected: { allow: false, code: "product-bootstrap-mismatch" },
    note: "旧 validateBaseTrunk：baseTrunk null 仅允许 bootstrap。",
  },
  {
    id: "bootstrap-with-object-base",
    facts: Object.freeze({ ...VALID_VERSION_UPGRADE_FACTS, bootstrap: true }),
    expected: { allow: false, code: "product-bootstrap-mismatch" },
    note: "旧 validateBaseTrunk：bootstrap:true 时 baseTrunk 必须为 null。",
  },
  {
    id: "initiator-rapporteur",
    facts: Object.freeze({ ...VALID_VERSION_UPGRADE_FACTS, initiatorRoleId: "rapporteur" }),
    expected: { allow: false, code: "product-initiator-mismatch" },
    note: "旧 VCA：version-upgrade 只能由 product 发起。",
  },
  {
    id: "kind-detail-amendment",
    facts: Object.freeze({ ...VALID_VERSION_UPGRADE_FACTS, kind: "detail-amendment" }),
    expected: { allow: false, code: "product-kind-mismatch" },
    note: "旧映射：detail-amendment=rapporteur；product 只提交 version-upgrade。",
  },
  {
    id: "amendment-id-present",
    facts: Object.freeze({ ...VALID_VERSION_UPGRADE_FACTS, amendmentId: "am-1" }),
    expected: { allow: false, code: "product-amendment-ref-forbidden" },
    note: "旧 validateAmendmentRefs：version-upgrade 不得引用修正案。",
  },
  {
    id: "amendment-doc-path-present",
    facts: Object.freeze({
      ...VALID_VERSION_UPGRADE_FACTS,
      amendmentDocPath: "docs/proposals/f1-amendment-v1.md",
    }),
    expected: { allow: false, code: "product-amendment-ref-forbidden" },
    note: "旧 validateAmendmentRefs：version-upgrade 不得引用修正案文档。",
  },
  {
    id: "amendment-items-present",
    facts: Object.freeze({ ...VALID_VERSION_UPGRADE_FACTS, amendmentItems: Object.freeze([]) }),
    expected: { allow: false, code: "product-amendment-ref-forbidden" },
    note: "旧 validateAmendmentRefs：version-upgrade 不得引用 items。",
  },
  {
    id: "missing-operation-id",
    facts: Object.freeze({
      initiatorRoleId: "product",
      kind: "version-upgrade",
      baseTrunk: VALID_BASE,
      targets: Object.freeze([VALID_TARGET]),
    }),
    expected: { allow: false, code: "product-facts-missing" },
    note: "旧 prepareDirectSubmission：直接提交必须带 operationId。",
  },
  {
    id: "empty-operation-id",
    facts: Object.freeze({ ...VALID_VERSION_UPGRADE_FACTS, operationId: "   " }),
    expected: { allow: false, code: "product-operation-id-missing" },
    note: "operationId 非空（等价旧 `!input.operationId`）。",
  },
  {
    id: "missing-base-trunk",
    facts: Object.freeze({
      initiatorRoleId: "product",
      kind: "version-upgrade",
      operationId: "op-1",
      targets: Object.freeze([VALID_TARGET]),
    }),
    expected: { allow: false, code: "product-facts-missing" },
    note: "旧 prepareDirectSubmission：直接提交必须带显式 baseTrunk。",
  },
  {
    id: "target-missing-expected-from",
    facts: Object.freeze({
      initiatorRoleId: "product",
      kind: "version-upgrade",
      operationId: "op-1",
      baseTrunk: VALID_BASE,
      targets: Object.freeze([Object.freeze({ kind: "contract", path: "x" })]),
    }),
    expected: { allow: false, code: "product-targets-invalid" },
    note: "旧 prepareDirectSubmission：每目标必须带 expectedFromSha256。",
  },
  {
    id: "targets-empty",
    facts: Object.freeze({ ...VALID_VERSION_UPGRADE_FACTS, targets: Object.freeze([]) }),
    expected: { allow: false, code: "product-targets-invalid" },
    difference: "D-PRE-1",
    note: "工具 schema minItems=1；旧服务层在更晚阶段拒绝。模块提前 fail-closed。",
  },
  {
    id: "base-trunk-shape-broken",
    facts: Object.freeze({
      ...VALID_VERSION_UPGRADE_FACTS,
      baseTrunk: Object.freeze({ version: "3", digest: "" }),
    }),
    expected: { allow: false, code: "product-base-trunk-invalid" },
    difference: "D-PRE-1",
    note: "旧服务层在读取 manifest/比较时失败；模块按 TrunkCommitRef 形状提前拒绝。",
  },
  {
    id: "unknown-fact-key",
    facts: Object.freeze({ ...VALID_VERSION_UPGRADE_FACTS, flowId: "flow-1" }),
    expected: { allow: false, code: "product-facts-unknown-key" },
    difference: "D-PRE-2",
    note: "E0 D4 事实包规则：未登记键 ⇒ deny（旧类型输入忽略未知键）。",
  },
]);

/** 非 version-upgrade 动作（module-only 负例；旧 preflight 不存在，无需差分）。 */
export const OUT_OF_SCOPE_ACTIONS = Object.freeze([
  "detail-amendment",
  "run-change",
  "requirement-change",
  "version-decision",
  "stable-write",
  "appointment",
  "team-plan",
  "git-action",
  "review",
] as const);
