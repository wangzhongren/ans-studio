// 门禁引擎测试：T3「两条固定工作流路径」B0——派发矩阵模式/派发目的类型与 ProjectConfig.workflowSchema。
//
// 依据：`docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md`（B1；AC-05/AC-24/EV-05
// 接口评审项：`DispatchMatrixMode`/`RoleDispatchPurpose`/`RoleDispatchPolicyInput.matrix`/
// `context({matrix})`/`ProjectConfig.workflowSchema`）与
// `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` §3.1/§3.2/§3.4/§4.1。
//
// 本批（B0）只立**类型/契约**，不含 fixed 业务实现：
//  - `DispatchMatrixMode` / `RoleDispatchPurpose` 闭集逐字断言（v1.3 §3.2）；
//  - `RoleDispatchPolicyInput.matrix|purpose`、`RoleContextInput.matrix` 为**可选**扩展，
//    缺省 `"legacy-v1"` / `"production"`——旧调用点（不传）类型与运行时行为逐字兼容；
//  - `ProjectConfig.workflowSchema` 只作 per-flow 模式的默认/强制值（v1.3 §4.1），只接受两字面量。
// 编译期断言由 `npm run typecheck` 执行；运行时只做最小 legacy 缺省等价与纯数据断言。
// 负例用 `@ts-expect-error`（未使用即由 typecheck 报错）。
// 本文件不修改实现、不新造依赖；fixed 谓词（编排 B1）与模块 fixed 段/fixedCards（B2）不在本文件断言。

import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  BuiltInRoleId,
  DispatchMatrixMode,
  ProjectConfig,
  RoleContextInput,
  RoleDispatchPolicyInput,
  RoleDispatchPurpose,
} from "../../src/model/role.ts";
import { builtInRoleModules } from "../../src/common/门禁引擎/governance-roles.ts";

// —————————————————————— 编译期断言工具 ——————————————————————

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

// —— 闭集逐字（v1.3 §3.2）：不得就地扩值/改名 —— //
type _MatrixModeSet = Assert<Equal<DispatchMatrixMode, "legacy-v1" | "two-fixed-paths/v1">>;
type _PurposeSet = Assert<Equal<RoleDispatchPurpose, "production" | "stage-request" | "review" | "preparation">>;

// —— 可选扩展：undefined 仍可赋（缺省 legacy-v1 / production；旧调用逐字兼容）—— //
type _DispatchMatrixOptional = Assert<Equal<RoleDispatchPolicyInput["matrix"], DispatchMatrixMode | undefined>>;
type _DispatchPurposeOptional = Assert<Equal<RoleDispatchPolicyInput["purpose"], RoleDispatchPurpose | undefined>>;
type _ContextMatrixOptional = Assert<Equal<RoleContextInput["matrix"], DispatchMatrixMode | undefined>>;

// —— ProjectConfig.workflowSchema：可选、恰两字面量（缺省＝不声明，v1.3 §4.1）—— //
type _WorkflowSchemaOptional = Assert<
  Equal<ProjectConfig["workflowSchema"], "two-fixed-paths/v1" | "legacy/v1" | undefined>
>;

// —— 旧字面调用（不传新字段）仍通过类型检查：逐字兼容 —— //
const legacyDispatchInput: RoleDispatchPolicyInput = {
  sourceRoleId: "chief",
  targetRoleId: "verifier",
  targetKind: "built-in-governance",
  targetExists: true,
};
const legacyContextInput: RoleContextInput = { governanceModel: "trio" };
// —— fixed 调用方形状（B1/B2 将按此传值；本批仅类型，不产生 fixed 行为）—— //
const fixedDispatchInput: RoleDispatchPolicyInput = {
  ...legacyDispatchInput,
  matrix: "two-fixed-paths/v1",
  purpose: "stage-request",
};
const fixedContextInput: RoleContextInput = { ...legacyContextInput, matrix: "two-fixed-paths/v1" };

// —— 编译期负例（@ts-expect-error 由 `npm run typecheck` 执行；未使用即报错）—— //

// @ts-expect-error 矩阵模式是闭集：`"two-fixed-paths"`（缺 /v1）不是合法模式。
const invalidMatrixMode: DispatchMatrixMode = "two-fixed-paths";
// @ts-expect-error 两套词汇不互通：`"legacy/v1"` 是 workflowSchema 值，不是矩阵模式。
const schemaValueAsMatrix: DispatchMatrixMode = "legacy/v1";
// @ts-expect-error 派发目的是闭集：`"review-write"` 未定义（review 派发只读，不新增写目的）。
const invalidPurpose: RoleDispatchPurpose = "review-write";
// @ts-expect-error 目的不接受下划线变体（稳定 token 逐字，v1.3 §3.2）。
const underscorePurpose: RoleDispatchPurpose = "stage_request";
// @ts-expect-error matrix 不接受任意字符串/大小写变体。
const caseVariantInput: RoleDispatchPolicyInput = { ...legacyDispatchInput, matrix: "Legacy-V1" };
// @ts-expect-error workflowSchema 只接受 v1.3 §4.1 两字面量：`"legacy-v1"` 是矩阵词汇，不是 schema 值。
const schemaVocabMixup: ProjectConfig = { projectRoot: "/p", skillRoot: "/s", roles: {}, workflowSchema: "legacy-v1" };
// @ts-expect-error workflowSchema 缺省即不声明，不接受 null（不引入第三值）。
const nullWorkflowSchema: ProjectConfig = { projectRoot: "/p", skillRoot: "/s", roles: {}, workflowSchema: null };

// —————————————————————— 运行时：legacy 缺省等价（不回归 legacy 矩阵/上下文）——————————————————————

// 代表性派发事实（允许/拒绝混合；只比较「缺省 vs 显式 legacy」等价，不断言具体允许/拒绝——
// 具体矩阵属编排 B1，fixed 分支属 B2；本断言在 B2 之后仍须成立：legacy 分支逐字冻结）。
const DISPATCH_FACTS: readonly RoleDispatchPolicyInput[] = Object.freeze([
  { sourceRoleId: "chief", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true },
  { sourceRoleId: "chief", targetRoleId: "product", targetKind: "built-in-governance", targetExists: true },
  { sourceRoleId: "chief", targetRoleId: "worker", targetKind: "project", targetExists: true },
  { sourceRoleId: "convener", targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true },
  { sourceRoleId: "convener", targetRoleId: "worker", targetKind: "project", targetExists: true },
  { sourceRoleId: "unknown-source", targetRoleId: "worker", targetKind: "project" },
  { targetRoleId: "verifier", targetKind: "built-in-governance", targetExists: true },
]);

const BUILT_IN_IDS = Object.keys(builtInRoleModules) as BuiltInRoleId[];

test("B0：类型层——旧调用不传新字段，fixed 调用方显式传值（纯数据形状）", () => {
  assert.equal(legacyDispatchInput.matrix, undefined);
  assert.equal(legacyDispatchInput.purpose, undefined);
  assert.equal(legacyContextInput.matrix, undefined);
  assert.equal(fixedDispatchInput.matrix, "two-fixed-paths/v1");
  assert.equal(fixedDispatchInput.purpose, "stage-request");
  assert.equal(fixedContextInput.matrix, "two-fixed-paths/v1");
});

test("B0：dispatch 缺省 matrix/purpose ≡ 显式 legacy-v1/production（六模块逐例）", () => {
  assert.equal(BUILT_IN_IDS.length, 6);
  for (const roleId of BUILT_IN_IDS) {
    const roleModule = builtInRoleModules[roleId];
    for (const facts of DISPATCH_FACTS) {
      const legacyDefault = roleModule.dispatch(facts);
      assert.deepEqual(roleModule.dispatch({ ...facts, matrix: "legacy-v1" }), legacyDefault, roleId);
      assert.deepEqual(roleModule.dispatch({ ...facts, purpose: "production" }), legacyDefault, roleId);
      assert.deepEqual(roleModule.dispatch({ ...facts, matrix: "legacy-v1", purpose: "production" }), legacyDefault, roleId);
    }
  }
});

test("B0：context 缺省 matrix ≡ 显式 legacy-v1（六模块 × 两治理模型；现有返回值不变）", () => {
  assert.equal(BUILT_IN_IDS.length, 6);
  for (const roleId of BUILT_IN_IDS) {
    const roleModule = builtInRoleModules[roleId];
    for (const governanceModel of ["single", "trio"] as const) {
      const legacyDefault = roleModule.context({ governanceModel });
      assert.deepEqual(roleModule.context({ governanceModel, matrix: "legacy-v1" }), legacyDefault, roleId);
    }
  }
});

test("B0：ProjectConfig.workflowSchema 是纯配置数据——两值可构造、缺省不声明、不改其它字段", () => {
  const base: ProjectConfig = { projectRoot: "/p", skillRoot: "/s", roles: {} };
  assert.equal(base.workflowSchema, undefined);
  assert.deepEqual(
    Object.keys(base).sort(),
    ["projectRoot", "roles", "skillRoot"],
    "缺省不乱写默认值：对象形状与旧配置逐字一致",
  );
  const fixed: ProjectConfig = { ...base, workflowSchema: "two-fixed-paths/v1" };
  const legacy: ProjectConfig = { ...base, workflowSchema: "legacy/v1" };
  assert.equal(fixed.workflowSchema, "two-fixed-paths/v1");
  assert.equal(legacy.workflowSchema, "legacy/v1");
  // 只作默认/强制值：本批门禁引擎不消费该字段（per-flow 判定属编排 B0 并行批次；载入属 shared-code）。
  assert.deepEqual({ ...legacy, roles: {} }, { projectRoot: "/p", skillRoot: "/s", roles: {}, workflowSchema: "legacy/v1" });
});
