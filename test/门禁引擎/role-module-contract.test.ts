// 门禁引擎测试：公开角色模块契约（E0/E0.2；P1.6 §6.2 / 团队计划 §7.3 / B1 E0.2/E0.5/E0.6）。
//
// 本文件以**类型形状/编译期断言**为主（`npm run typecheck` 执行），运行时只做最小构造桩，证明
// `BuiltInRoleModule` 可由六角色模块以纯数据/纯函数实现，且返回 typed 判定而非权限。
// 只读引用 `src/model/`；除本角色自己的门面 `src/common/门禁引擎/governance-roles.ts`（E0 D2 数据
// 投影 → X-R6 完整模块 map）与私有装配表 `role-tool-registry.ts`（E0.2 D1 唯一映射来源）外，
// 不 import 引擎/门控。
// E2 X-R1–X-R6：门面六角色规格已全部切换到 `src/common/roles/<id>/index.ts`；完整
// `builtInRoleModules` map 在 X-R6 收口，D2 过渡数据投影已删除。本文件只读 import 六个模块作为
// 门面等价断言（测试专用 oracle，不是生产依赖）。
// 本文件不修改任何实现，不新造依赖；负例用 `@ts-expect-error`（未使用即由 typecheck 报错）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { BoundaryEntry } from "../../src/model/boundary.ts";
import type {
  BuiltInRoleId,
  BuiltInRoleModule,
  BuiltInRoleModuleMap,
  GovernanceCapabilities,
  GovernanceCardKind,
  GovernanceFunction,
  GovernanceRoleSpec,
  RoleCardSpec,
  RoleContextInput,
  RoleContextSection,
  RoleDispatchPolicy,
  RoleDispatchPolicyInput,
  RolePolicyDecision,
  RolePolicyReason,
  RolePreflightHooks,
  RolePreflightInput,
  RoleToolId,
  RoleToolName,
  RoleToolPolicy,
  TrustedToolPolicyInput,
} from "../../src/model/role.ts";
import {
  BUILT_IN_GOVERNANCE_ROLES,
  builtInRoleModuleOf,
  builtInRoleModules,
  governanceRoleOf,
  type GovernanceCapabilities as FacadeGovernanceCapabilities,
} from "../../src/common/门禁引擎/governance-roles.ts";
import * as governanceRolesFacade from "../../src/common/门禁引擎/governance-roles.ts";
import {
  ROLE_TOOL_CATALOG,
  roleToolCatalogEntryOf,
  validateRoleToolDeclaration,
  type RoleToolCatalogEntry,
} from "../../src/common/门禁引擎/role-tool-registry.ts";
import { chiefRoleModule } from "../../src/common/roles/chief/index.ts";
import { convenerRoleModule } from "../../src/common/roles/convener/index.ts";
import { nominatorRoleModule } from "../../src/common/roles/nominator/index.ts";
import { productRoleModule } from "../../src/common/roles/product/index.ts";
import { rapporteurRoleModule } from "../../src/common/roles/rapporteur/index.ts";
import { verifierRoleModule } from "../../src/common/roles/verifier/index.ts";

// —————————————————————— 编译期断言工具 ——————————————————————

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

// —— id 集合：恰为六角色（不含 su / liaison / 项目角色）—— //

type _BuiltInRoleIds = Assert<
  Equal<BuiltInRoleId, "chief" | "product" | "rapporteur" | "nominator" | "convener" | "verifier">
>;
type _ModuleId = Assert<Equal<BuiltInRoleModule["id"], BuiltInRoleId>>;

// —— 公开能力位投影：键集固定、只读，shell 档值集固定；不夹带私有实现细节 —— //

type _CapabilityKeys = Assert<
  Equal<
    keyof GovernanceCapabilities,
    "customerInput" | "dispatchTask" | "roleStatus" | "sessionTail" | "installSkill" | "installMcp" | "shell"
  >
>;
type _ShellTier = Assert<Equal<GovernanceCapabilities["shell"], "none" | "readonly" | "operator-approve">>;

// —— 公开规格投影：card 形状（含 text/entries/预授权/禁写）与卡种；私有 cardText/matrix 不进入契约 —— //

type _CardShape = Assert<
  Equal<
    RoleCardSpec,
    {
      readonly text: string;
      readonly entries: readonly BoundaryEntry[];
      readonly preauthorizedDirs: readonly string[];
      readonly forbiddenWritePaths: readonly string[];
    }
  >
>;
type _CardEntries = Assert<Equal<BuiltInRoleModule["card"]["entries"], readonly BoundaryEntry[]>>;
type _Cards = Assert<Equal<BuiltInRoleModule["cards"], readonly GovernanceCardKind[]>>;
type _NoPrivateCardText = Assert<Equal<"cardText" extends keyof BuiltInRoleModule ? true : false, false>>;
type _NoPrivateMatrix = Assert<Equal<"matrix" extends keyof BuiltInRoleModule ? true : false, false>>;
type _SpecIsDataOnly = Assert<
  Equal<keyof GovernanceRoleSpec, "id" | "displayName" | "function" | "card" | "capabilities" | "cards">
>;

// —— 四个纯策略面的精确签名（输入/输出类型必须与契约逐字一致）—— //

type _ToolsInput = Assert<Equal<Parameters<BuiltInRoleModule["tools"]>[0], TrustedToolPolicyInput>>;
type _ToolsOutput = Assert<Equal<ReturnType<BuiltInRoleModule["tools"]>, RoleToolPolicy>>;
type _DispatchInput = Assert<Equal<Parameters<BuiltInRoleModule["dispatch"]>[0], RoleDispatchPolicyInput>>;
type _DispatchOutput = Assert<Equal<ReturnType<BuiltInRoleModule["dispatch"]>, RoleDispatchPolicy>>;
type _ContextInput = Assert<Equal<Parameters<BuiltInRoleModule["context"]>[0], RoleContextInput>>;
type _ContextOutput = Assert<Equal<ReturnType<BuiltInRoleModule["context"]>, readonly RoleContextSection[]>>;
type _PreflightType = Assert<Equal<NonNullable<BuiltInRoleModule["preflight"]>, RolePreflightHooks>>;
type _PreflightOptional = Assert<Equal<undefined extends BuiltInRoleModule["preflight"] ? true : false, true>>;
type _PreflightInput = Assert<Equal<Parameters<RolePreflightHooks["checkAction"]>[0], RolePreflightInput>>;
type _PreflightOutput = Assert<Equal<ReturnType<RolePreflightHooks["checkAction"]>, RolePolicyDecision>>;

// —— E0.2 D1：RoleToolId 14 id 闭集 + RoleToolName 14 snake_case 闭集；RoleToolPolicy.tools 保持 RoleToolId[] —— //

type _ToolIdSet = Assert<
  Equal<
    RoleToolId,
    | "roleActivityLog"
    | "terminateRoleRun"
    | "redispatchTask"
    | "projectNote"
    | "requestVersionDecision"
    | "requestRequirementChange"
    | "submitVersionChange"
    | "selectRunChange"
    | "completeTeamPlan"
    | "activateRoleDocuments"
    | "closeCreatedTask"
    | "submitRefactor"
    | "requestStableWrite"
    | "decidePendingRequest"
  >
>;
type _ToolNameSet = Assert<
  Equal<
    RoleToolName,
    | "role_activity_log"
    | "terminate_role_run"
    | "redispatch_task"
    | "project_note"
    | "request_version_decision"
    | "request_requirement_change"
    | "submit_version_change"
    | "select_run_change"
    | "complete_team_plan"
    | "activate_role_documents"
    | "close_created_task"
    | "submit_refactor"
    | "request_stable_write"
    | "decide_pending_request"
  >
>;
type _ToolPolicyTools = Assert<Equal<RoleToolPolicy["tools"], readonly RoleToolId[]>>;
type _CatalogId = Assert<Equal<RoleToolCatalogEntry["id"], RoleToolId>>;
type _CatalogName = Assert<Equal<RoleToolCatalogEntry["name"], RoleToolName>>;
type _CatalogRoles = Assert<Equal<RoleToolCatalogEntry["allowedRoleIds"], readonly BuiltInRoleId[]>>;

// —— E0.2 D10：capabilities 单一真源——模块 spec 与 tools() 输出同一 GovernanceCapabilities 形状 —— //

type _ModuleCapabilities = Assert<Equal<BuiltInRoleModule["capabilities"], GovernanceCapabilities>>;
type _ToolPolicyCapabilities = Assert<Equal<RoleToolPolicy["capabilities"], GovernanceCapabilities>>;

// —— D6/D10（X-R1）：门面 GovernanceCapabilities 是 Model 公开投影的同一类型别名（不再两份定义）—— //

type _FacadeCapabilitiesAlias = Assert<Equal<FacadeGovernanceCapabilities, GovernanceCapabilities>>;

// —— E0 D2 / X-R6：BuiltInRoleModuleMap 键集恰为六内置 id；完整 map 是门面唯一模块出口 —— //

type _ModuleMap = Assert<Equal<BuiltInRoleModuleMap, Readonly<Record<BuiltInRoleId, BuiltInRoleModule>>>>;
type _ModuleMapKeys = Assert<Equal<keyof BuiltInRoleModuleMap, BuiltInRoleId>>;
type _FacadeModuleMap = Assert<Equal<typeof builtInRoleModules, BuiltInRoleModuleMap>>;
type _FacadeLookup = Assert<Equal<ReturnType<typeof builtInRoleModuleOf>, BuiltInRoleModule | undefined>>;

// —— RolePolicyDecision：allow 分支不带 code/messageKey；deny 分支必带（typed、fail-closed）—— //

type _AllowBranch = Assert<Equal<Extract<RolePolicyDecision, { allow: true }>, { readonly allow: true }>>;
type _DenyBranch = Assert<
  Equal<
    Extract<RolePolicyDecision, { allow: false }>,
    { readonly allow: false; readonly code: string; readonly messageKey: string; readonly details?: unknown }
  >
>;
type _ReasonShape = Assert<
  Equal<RolePolicyReason, { readonly code: string; readonly messageKey: string; readonly details?: unknown }>
>;

// —— 纯数据输入：只携带宿主可信事实，不携带权限/文案 —— //

type _ToolInputFacts = Assert<Equal<TrustedToolPolicyInput, { readonly governanceModel: "single" | "trio" }>>;
type _DispatchInputFacts = Assert<
  Equal<
    RoleDispatchPolicyInput,
    {
      readonly sourceRoleId?: string;
      readonly targetRoleId: string;
      readonly targetKind: "project" | "built-in-governance";
      readonly targetExists?: boolean;
    }
  >
>;

// —— 编译期负例（@ts-expect-error 由 `npm run typecheck` 执行；未使用即报错）—— //

// @ts-expect-error `su` 不在角色模块契约内（single 治理模型不是 BuiltInRoleModule）。
const invalidRoleModuleId: BuiltInRoleId = "su";
// @ts-expect-error E0 D1：RoleToolId 是闭集，`dispatch_task` 由能力位注入，不在额外工具 id 内。
const invalidRoleToolId: RoleToolId = "dispatch_task";
// @ts-expect-error E0.2 D1：RoleToolName 是 snake_case 闭集，`dispatch_task` 不是角色专属工具名。
const invalidRoleToolName: RoleToolName = "dispatch_task";
// @ts-expect-error E0 D2：BuiltInRoleModuleMap 键集恰为六内置 id（不含 su / 项目角色）。
const invalidModuleMapKey: keyof BuiltInRoleModuleMap = "su";
// @ts-expect-error deny 分支必须携带稳定 messageKey（P1.6 §6.6 错误语义）。
const invalidDenyDecision: RolePolicyDecision = { allow: false, code: "some-code" };
// @ts-expect-error BuiltInRoleModule 必须提供 context（四个纯策略面之一）。
const missingContextModule: BuiltInRoleModule = { ...({} as BuiltInRoleModule), context: undefined };

// —————————————————————— 最小构造桩（纯数据/纯函数）——————————————————————

const BASE_CAPABILITIES: GovernanceCapabilities = {
  customerInput: true,
  dispatchTask: false,
  roleStatus: false,
  sessionTail: false,
  installSkill: false,
  installMcp: false,
  shell: "operator-approve",
};

const CHIEF_ENTRY: BoundaryEntry = {
  root: "project",
  path: "docs/intents/",
  kind: "directory",
  purpose: "客户意图 / 沟通记录",
};

const CHIEF_CARD: RoleCardSpec = {
  text: "# 角色：幕僚（测试桩）",
  entries: [CHIEF_ENTRY],
  preauthorizedDirs: ["docs/intents/"],
  forbiddenWritePaths: ["角色卡/"],
};

/** 六角色通用的最小模块（证明每个 id 都能按契约实现；不含角色专属策略）。 */
function makeMinimalModule(
  id: BuiltInRoleId,
  displayName: string,
  fn: GovernanceFunction,
  cards: readonly GovernanceCardKind[],
): BuiltInRoleModule {
  return {
    id,
    displayName,
    function: fn,
    card: { text: `# 角色：${displayName}（测试桩）`, entries: [], preauthorizedDirs: [], forbiddenWritePaths: [] },
    capabilities: BASE_CAPABILITIES,
    cards,
    tools() {
      return { capabilities: BASE_CAPABILITIES, tools: [], reasons: [] };
    },
    dispatch() {
      return { decision: { allow: false, code: "test-dispatch-deny", messageKey: "test.dispatch.deny" } };
    },
    context() {
      return [];
    },
  };
}

const MINIMAL_MODULES = {
  chief: makeMinimalModule("chief", "幕僚", "chief", ["intent-confirm"]),
  product: makeMinimalModule("product", "产品", "product", []),
  rapporteur: makeMinimalModule("rapporteur", "策划", "proposal", ["proposal", "decision"]),
  nominator: makeMinimalModule("nominator", "人事", "nomination", ["appointment", "appointment-write"]),
  convener: makeMinimalModule("convener", "运营", "schedule", ["decision"]),
  verifier: makeMinimalModule("verifier", "质检", "verification", ["acceptance"]),
} satisfies Record<BuiltInRoleId, BuiltInRoleModule>;

/** 带可选 preflight/context 的完整桩：证明四个策略面可同时实现。 */
const CHIEF_MODULE: BuiltInRoleModule = {
  id: "chief",
  displayName: "幕僚",
  function: "chief",
  card: CHIEF_CARD,
  capabilities: { ...BASE_CAPABILITIES, dispatchTask: true, roleStatus: true, sessionTail: true },
  cards: ["intent-confirm"],
  tools(input: TrustedToolPolicyInput): RoleToolPolicy {
    return {
      capabilities: CHIEF_MODULE.capabilities,
      tools: input.governanceModel === "trio" ? ["roleActivityLog", "requestVersionDecision"] : [],
      reasons: [],
    };
  },
  dispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy {
    if (input.targetKind === "project") {
      return {
        decision: {
          allow: false,
          code: "chief-to-project-forbidden",
          messageKey: "role.dispatch.chiefToProjectForbidden",
        },
      };
    }
    return { decision: { allow: true }, reportToRoleId: "chief" };
  },
  preflight: {
    checkAction(input: RolePreflightInput): RolePolicyDecision {
      if (input.action !== "version-decision") {
        return { allow: false, code: "action-not-covered", messageKey: "role.preflight.actionNotCovered" };
      }
      return input.facts["versionDecisionRequested"] === true
        ? { allow: true }
        : {
            allow: false,
            code: "version-decision-facts-missing",
            messageKey: "role.preflight.versionDecisionFactsMissing",
          };
    },
  },
  context(input: RoleContextInput): readonly RoleContextSection[] {
    return [
      {
        id: "chief-workflow",
        text: `治理模型：${input.governanceModel}`,
        resources: [{ path: "chief-workflow.md", version: "chief-workflow/v1" }],
      },
    ];
  },
};

// —————————————————————— 运行时断言（最小构造桩）——————————————————————

test("BuiltInRoleModule：六个内置 id 均可按契约构造（唯一公开形状）", () => {
  const ids = Object.keys(MINIMAL_MODULES) as BuiltInRoleId[];
  assert.equal(ids.length, 6);
  for (const id of ids) {
    const module = MINIMAL_MODULES[id];
    assert.equal(module.id, id);
    assert.equal(typeof module.displayName, "string");
    assert.equal(typeof module.tools, "function");
    assert.equal(typeof module.dispatch, "function");
    assert.equal(typeof module.context, "function");
    // preflight 可选：最小桩不提供，不是构造错误。
    assert.equal(module.preflight, undefined);
  }
});

test("BuiltInRoleModule：card/capabilities/cards 为纯数据，不携带权限字段", () => {
  assert.equal(CHIEF_MODULE.card.text.startsWith("# 角色："), true);
  assert.equal(CHIEF_MODULE.card.entries[0].root, "project");
  assert.deepEqual(CHIEF_MODULE.card.preauthorizedDirs, ["docs/intents/"]);
  assert.deepEqual(CHIEF_MODULE.card.forbiddenWritePaths, ["角色卡/"]);
  assert.equal(CHIEF_MODULE.capabilities.shell, "operator-approve");
  assert.deepEqual([...CHIEF_MODULE.cards], ["intent-confirm"]);
  // 契约不提供权限/授权/批准字段（判定只返回数据类型）。
  for (const forbidden of ["allowed", "authorized", "approved", "grant"]) {
    assert.equal(forbidden in CHIEF_MODULE, false);
  }
});

test("tools()：按治理模型装配纯数据工具集（trio 才给角色专属工具）", () => {
  const trio = CHIEF_MODULE.tools({ governanceModel: "trio" });
  assert.deepEqual([...trio.tools], ["roleActivityLog", "requestVersionDecision"]);
  assert.equal(trio.capabilities.dispatchTask, true);

  const single = CHIEF_MODULE.tools({ governanceModel: "single" });
  assert.deepEqual([...single.tools], []);
  // 能力位仍由模块声明；如何注入由引擎决定，模块不给权限。
  assert.equal(single.capabilities.customerInput, true);
});

test("dispatch()：项目角色 fail-closed（typed deny 带稳定码/i18n key），内置目标带报告期望", () => {
  const denied = CHIEF_MODULE.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "implementer",
    targetKind: "project",
    targetExists: true,
  });
  assert.equal(denied.decision.allow, false);
  assert.equal(denied.decision.allow === false ? denied.decision.code : "", "chief-to-project-forbidden");
  assert.equal(denied.decision.allow === false ? denied.decision.messageKey : "", "role.dispatch.chiefToProjectForbidden");
  assert.equal(denied.reportToRoleId, undefined);

  const allowed = CHIEF_MODULE.dispatch({
    sourceRoleId: "chief",
    targetRoleId: "product",
    targetKind: "built-in-governance",
    targetExists: true,
  });
  assert.deepEqual(allowed.decision, { allow: true });
  assert.equal(allowed.reportToRoleId, "chief");
});

test("preflight：动作前置校验纯函数化；缺事实默认拒绝（fail-closed）", () => {
  const missingFacts = CHIEF_MODULE.preflight?.checkAction({ action: "version-decision", facts: {} });
  assert.equal(missingFacts?.allow, false);
  assert.equal(
    missingFacts?.allow === false ? missingFacts.code : "",
    "version-decision-facts-missing",
  );

  const permitted = CHIEF_MODULE.preflight?.checkAction({
    action: "version-decision",
    facts: { versionDecisionRequested: true },
  });
  assert.deepEqual(permitted, { allow: true });

  const outOfScope = CHIEF_MODULE.preflight?.checkAction({ action: "review", facts: {} });
  assert.equal(outOfScope?.allow, false);
});

test("context()：返回提示块/资源引用纯数据（宿主负责读取，模块不读盘）", () => {
  const sections = CHIEF_MODULE.context({ governanceModel: "trio" });
  assert.equal(sections.length, 1);
  assert.equal(sections[0].id, "chief-workflow");
  assert.deepEqual(sections[0].resources, [{ path: "chief-workflow.md", version: "chief-workflow/v1" }]);
});

test("契约类型只读：运行时不改输入/模块（纯策略无副作用）", () => {
  const input: TrustedToolPolicyInput = { governanceModel: "trio" };
  const frozenInput = Object.freeze(input);
  CHIEF_MODULE.tools(frozenInput);
  assert.deepEqual(frozenInput, { governanceModel: "trio" });
  const dispatchInput: RoleDispatchPolicyInput = Object.freeze({
    targetRoleId: "verifier",
    targetKind: "built-in-governance",
  });
  CHIEF_MODULE.dispatch(dispatchInput);
  assert.deepEqual(dispatchInput, { targetRoleId: "verifier", targetKind: "built-in-governance" });
});

test("X-R6：完整 builtInRoleModules map（六模块同一绑定）、全六 lookup、零复制；D2 过渡投影已删除", () => {
  const ids = Object.keys(builtInRoleModules) as BuiltInRoleId[];
  assert.deepEqual(
    [...ids].sort(),
    ["chief", "convener", "nominator", "product", "rapporteur", "verifier"],
  );
  assert.equal(Object.isFrozen(builtInRoleModules), true);
  const modules = {
    chief: chiefRoleModule,
    product: productRoleModule,
    rapporteur: rapporteurRoleModule,
    nominator: nominatorRoleModule,
    convener: convenerRoleModule,
    verifier: verifierRoleModule,
  } as const satisfies Record<BuiltInRoleId, BuiltInRoleModule>;
  for (const id of ids) {
    const spec = governanceRoleOf(id);
    const module = modules[id];
    assert.ok(spec !== undefined);
    // 完整 map 的值 = 模块本体（同一绑定，非复制）；lookup 与 map 同一引用。
    assert.equal(builtInRoleModules[id], module);
    assert.equal(builtInRoleModuleOf(id), builtInRoleModules[id]);
    // 门面规格字段与模块同一引用（D6 零复制）。
    assert.equal(spec.id, module.id);
    assert.equal(spec.displayName, module.displayName);
    assert.equal(spec.function, module.function);
    assert.equal(spec.cardText, module.card.text);
    assert.equal(spec.entries, module.card.entries);
    assert.equal(spec.preauthorizedDirs, module.card.preauthorizedDirs);
    assert.equal(spec.forbiddenWritePaths, module.card.forbiddenWritePaths);
    assert.equal(spec.capabilities, module.capabilities);
    // matrix 不进入模块（D6）；六角色展示摘要齐全（specOf fail-loud 的前提）。
    assert.equal("matrix" in module, false);
    assert.equal(typeof spec.matrix.duty, "string");
    assert.equal(spec.matrix.duty.length > 0, true);
    // D8：cards 真源是模块（门面 spec 无 cards 字段；模块 cards 为冻结只读数组）。
    assert.equal("cards" in spec, false);
    assert.equal(Object.isFrozen(module.cards), true);
  }
  // 未知/非六内置 id 不猜、不兜底。
  for (const unknown of ["su", "implementer", ""]) {
    assert.equal(builtInRoleModuleOf(unknown), undefined);
  }
  // D2 过渡投影已删除（X-R6 收口）：运行时导出与源码声明均不存在。
  assert.equal("BUILT_IN_ROLE_MODULE_DATA" in governanceRolesFacade, false);
  assert.equal("builtInRoleModuleDataOf" in governanceRolesFacade, false);
  const facadeSource = readFileSync(
    new URL("../../src/common/门禁引擎/governance-roles.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(facadeSource, /export type BuiltInRoleModuleData\b/);
  assert.doesNotMatch(facadeSource, /export const BUILT_IN_ROLE_MODULE_DATA\b/);
  assert.doesNotMatch(facadeSource, /export function builtInRoleModuleDataOf\b/);
});

test("X-R1：product 门面规格由 productRoleModule 零复制装配；matrix 展示摘要逐字保留；数组顺序不变", () => {
  const spec = governanceRoleOf("product");
  assert.ok(spec !== undefined);
  // 数据字段与模块同一引用（D6 零复制）。
  assert.equal(spec.id, productRoleModule.id);
  assert.equal(spec.displayName, productRoleModule.displayName);
  assert.equal(spec.function, productRoleModule.function);
  assert.equal(spec.cardText, productRoleModule.card.text);
  assert.equal(spec.entries, productRoleModule.card.entries);
  assert.equal(spec.preauthorizedDirs, productRoleModule.card.preauthorizedDirs);
  assert.equal(spec.forbiddenWritePaths, productRoleModule.card.forbiddenWritePaths);
  assert.equal(spec.capabilities, productRoleModule.capabilities);
  // matrix 不进入模块（D6）：门禁引擎私有展示摘要逐字保留（X-R1 切换前 oracle）。
  assert.deepEqual(spec.matrix, {
    duty: "按真实目标/范围缺口维护产品意图与升级，已有有效依据可核验复用。",
    mainChain: [
      "产出 docs/product/<flowId>-intent-vN.md（版本化，不原地改）。",
      "version-upgrade 整单校验后直接提交；以真实回执为准，旧 run 不自动重 pin。",
      "不写实现方案/提案/名单/角色卡。",
    ],
    cardDiscipline: ["只写 docs/product/；不写提案/名单/架构/角色卡；不实现、不招人。"],
  });
  // D8：卡种真源是模块；product 不发治理卡（门面不复制第二份卡种表）。
  assert.deepEqual([...productRoleModule.cards], []);
  // 注册表顺序不变（listProject / resolve-role 枚举顺序）。
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((row) => row.id),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
  );
});

test("X-R2：rapporteur 门面规格由 rapporteurRoleModule 零复制装配；matrix 展示摘要逐字保留；数组顺序不变", () => {
  const spec = governanceRoleOf("rapporteur");
  assert.ok(spec !== undefined);
  // 数据字段与模块同一引用（D6 零复制）。
  assert.equal(spec.id, rapporteurRoleModule.id);
  assert.equal(spec.displayName, rapporteurRoleModule.displayName);
  assert.equal(spec.function, rapporteurRoleModule.function);
  assert.equal(spec.cardText, rapporteurRoleModule.card.text);
  assert.equal(spec.entries, rapporteurRoleModule.card.entries);
  assert.equal(spec.preauthorizedDirs, rapporteurRoleModule.card.preauthorizedDirs);
  assert.equal(spec.forbiddenWritePaths, rapporteurRoleModule.card.forbiddenWritePaths);
  assert.equal(spec.capabilities, rapporteurRoleModule.capabilities);
  // matrix 不进入模块（D6）：门禁引擎私有展示摘要逐字保留（X-R2 切换前 oracle）。
  assert.deepEqual(spec.matrix, {
    duty: "据产品意图出策划方案、人员名单、项目架构；提案/契约。",
    mainChain: [
      "按真实影响补方案/名单/架构；有效依据核绑定后复用，无缺口不机械重走策划/招人。",
      "detail-amendment 整单直接提交；策划选择 continue-frozen/stop-and-restart/stop，不恢复逐项/最终卡。",
    ],
    cardDiscipline: ["名单是人事招人的唯一依据；不写角色卡、不招人、不实现、不改产品意图。"],
  });
  // D8：卡种真源是模块（门面 spec 无 cards 字段，X-R1 口径不变；消费方经模块 lookup 读取）。
  assert.deepEqual([...rapporteurRoleModule.cards], ["proposal", "decision"]);
  assert.equal("cards" in spec, false);
  // 公共入口返回模块本体（同一绑定，非复制）。
  assert.equal(builtInRoleModuleOf("rapporteur"), rapporteurRoleModule);
  // 注册表顺序不变（listProject / resolve-role 枚举顺序）。
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((row) => row.id),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
  );
});

test("X-R3：nominator 门面规格由 nominatorRoleModule 零复制装配；matrix 展示摘要逐字保留；数组顺序不变", () => {
  const spec = governanceRoleOf("nominator");
  assert.ok(spec !== undefined);
  // 数据字段与模块同一引用（D6 零复制）。
  assert.equal(spec.id, nominatorRoleModule.id);
  assert.equal(spec.displayName, nominatorRoleModule.displayName);
  assert.equal(spec.function, nominatorRoleModule.function);
  assert.equal(spec.cardText, nominatorRoleModule.card.text);
  assert.equal(spec.entries, nominatorRoleModule.card.entries);
  assert.equal(spec.preauthorizedDirs, nominatorRoleModule.card.preauthorizedDirs);
  assert.equal(spec.forbiddenWritePaths, nominatorRoleModule.card.forbiddenWritePaths);
  assert.equal(spec.capabilities, nominatorRoleModule.capabilities);
  // matrix 不进入模块（D6）：门禁引擎私有展示摘要逐字保留（X-R3 切换前 oracle）。
  assert.deepEqual(spec.matrix, {
    duty: "真实角色/权限缺口时按合法名单与计划保留D3并完整激活；不参与无缺口的机械重招。",
    mainChain: [
      "无最新合法名单不得写卡。",
      "保留 appointment/D3；选中范围内直接写三文档，凭完整激活回执上线；不发 appointment-write。",
    ],
    cardDiscipline: ["无名单不得写卡；不招名单外角色；不批准提案/验收，不代客户决定。"],
  });
  // D8：卡种真源是模块（门面 spec 无 cards 字段，X-R1 口径不变；消费方经模块 lookup 读取）。
  assert.deepEqual([...nominatorRoleModule.cards], ["appointment", "appointment-write"]);
  assert.equal("cards" in spec, false);
  // 公共入口返回模块本体（同一绑定，非复制）。
  assert.equal(builtInRoleModuleOf("nominator"), nominatorRoleModule);
  // 注册表顺序不变（listProject / resolve-role 枚举顺序）。
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((row) => row.id),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
  );
});

test("X-R4：convener 门面规格由 convenerRoleModule 零复制装配；matrix 展示摘要逐字保留；数组顺序不变", () => {
  const spec = governanceRoleOf("convener");
  assert.ok(spec !== undefined);
  // 数据字段与模块同一引用（D6 零复制）。
  assert.equal(spec.id, convenerRoleModule.id);
  assert.equal(spec.displayName, convenerRoleModule.displayName);
  assert.equal(spec.function, convenerRoleModule.function);
  assert.equal(spec.cardText, convenerRoleModule.card.text);
  assert.equal(spec.entries, convenerRoleModule.card.entries);
  assert.equal(spec.preauthorizedDirs, convenerRoleModule.card.preauthorizedDirs);
  assert.equal(spec.forbiddenWritePaths, convenerRoleModule.card.forbiddenWritePaths);
  assert.equal(spec.capabilities, convenerRoleModule.capabilities);
  // matrix 不进入模块（D6）：门禁引擎私有展示摘要逐字保留（X-R4 切换前 oracle）。
  assert.deepEqual(spec.matrix, {
    duty: "按Chief任务受控init/复用核实/合法计划；执行就绪后仅派worker、集成候选、收报，交Chief组织独立质检。",
    mainChain: [
      "首init/规划不等未来D3；执行前workflow及真实任命/授权/激活就绪。",
      "团队计划校验后直接完成；主动发环境阻塞 decision 卡并核实际恢复，只收口自己创建的任务。",
      "按四类意图实际缺口推进；新派发仅限合法worker，汇报Chief创建质检；Chief接受后显式续live controller才核最终OID并CAS交付。",
      "不写卡/不招人。",
    ],
    cardDiscipline: ["不写角色卡、不招人、不改名单、不写项目源码；不批准、不验收。"],
    dispatchScope: "新派发仅限D3选中且合法授权的项目实现worker；不得创建Verifier或其它builtin任务（应用预检）。",
  });
  // D8：卡种真源是模块（门面 spec 无 cards 字段，X-R1 口径不变；消费方经模块 lookup 读取）。
  assert.deepEqual([...convenerRoleModule.cards], ["decision"]);
  assert.equal("cards" in spec, false);
  // 公共入口返回模块本体（同一绑定，非复制）。
  assert.equal(builtInRoleModuleOf("convener"), convenerRoleModule);
  // 注册表顺序不变（listProject / resolve-role 枚举顺序）。
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((row) => row.id),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
  );
});

test("X-R5：verifier 门面规格由 verifierRoleModule 零复制装配；matrix 展示摘要逐字保留；数组顺序不变", () => {
  const spec = governanceRoleOf("verifier");
  assert.ok(spec !== undefined);
  // 数据字段与模块同一引用（D6 零复制）。
  assert.equal(spec.id, verifierRoleModule.id);
  assert.equal(spec.displayName, verifierRoleModule.displayName);
  assert.equal(spec.function, verifierRoleModule.function);
  assert.equal(spec.cardText, verifierRoleModule.card.text);
  assert.equal(spec.entries, verifierRoleModule.card.entries);
  assert.equal(spec.preauthorizedDirs, verifierRoleModule.card.preauthorizedDirs);
  assert.equal(spec.forbiddenWritePaths, verifierRoleModule.card.forbiddenWritePaths);
  assert.equal(spec.capabilities, verifierRoleModule.capabilities);
  // matrix 不进入模块（D6）：门禁引擎私有展示摘要逐字保留（X-R5 切换前 oracle）。
  assert.deepEqual(spec.matrix, {
    duty: "可选质量核对与验收执行者。",
    mainChain: [
      "新任务仅由Chief创建/收报/收口；历史任务按真实creator保留。",
      "报告写 docs/quality/、证据写 docs/verification/；发 acceptance 卡。",
      "独立提供质检结论/物证；客户或有效委托的真实 chief 仅作最终业务选择，不替代质检。",
      "缺证或失败正式blocked/failed回Chief，不静默等待；指定新OID再验，不代运营发布。",
    ],
    cardDiscipline: ["不批准、不代客户验收；证据最多真实运行截图，不要求录屏。"],
  });
  // D8：卡种真源是模块（门面 spec 无 cards 字段，X-R1 口径不变；消费方经模块 lookup 读取）。
  assert.deepEqual([...verifierRoleModule.cards], ["acceptance"]);
  assert.equal("cards" in spec, false);
  // 公共入口返回模块本体（同一绑定，非复制）。
  assert.equal(builtInRoleModuleOf("verifier"), verifierRoleModule);
  // 注册表顺序不变（listProject / resolve-role 枚举顺序）。
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((row) => row.id),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
  );
});

test("X-R6：chief 门面规格由 chiefRoleModule 零复制装配；matrix 逐字迁入；cards/顺序不变", () => {
  const spec = governanceRoleOf("chief");
  assert.ok(spec !== undefined);
  // 数据字段与模块同一引用（D6 零复制）。
  assert.equal(spec.id, chiefRoleModule.id);
  assert.equal(spec.displayName, chiefRoleModule.displayName);
  assert.equal(spec.function, chiefRoleModule.function);
  assert.equal(spec.cardText, chiefRoleModule.card.text);
  assert.equal(spec.entries, chiefRoleModule.card.entries);
  assert.equal(spec.preauthorizedDirs, chiefRoleModule.card.preauthorizedDirs);
  assert.equal(spec.forbiddenWritePaths, chiefRoleModule.card.forbiddenWritePaths);
  assert.equal(spec.capabilities, chiefRoleModule.capabilities);
  // matrix 不进入模块（D6）：门禁引擎私有展示摘要逐字保留（X-R6 切换前 oracle）。
  assert.deepEqual(spec.matrix, {
    duty: "唯一客户入口与五builtin派发/收报/收口枢纽；按真实反馈自主选路，明确委托时按证据作真实业务决定。",
    mainChain: [
      "每次客户/正式报告驱动前读取应用注入chief-workflow.md全文、资源path/hash/版本与应用版本；正文唯一MD真源。",
      "项目docs/workflow.md另按有效snapshot或执行run冻结来源读取，不替代Chief资源，不因资源更新重pin。",
    ],
    cardDiscipline: [
      "只合法收口自己创建且有报告的任务；独立质检与专门执行审批保留，不默认选推荐项。",
    ],
    dispatchScope: "新任务派Product/Rapporteur/Nominator/Convener/Verifier五builtin；worker由Convener派。历史creator不改，实际动作仍核权限。",
  });
  // D8：卡种真源是模块（门面 spec 无 cards 字段；消费方经模块 lookup 读取）。
  assert.deepEqual([...chiefRoleModule.cards], ["intent-confirm"]);
  assert.equal("cards" in spec, false);
  // 公共入口返回模块本体（同一绑定，非复制）。
  assert.equal(builtInRoleModuleOf("chief"), chiefRoleModule);
  // 注册表顺序不变（listProject / resolve-role 枚举顺序）。
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((row) => row.id),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
  );
  // 卡文本真源唯一：门面不再持有内联 `CHIEF_CARD_TEXT`（X-R6 删除）。
  const facadeSource = readFileSync(
    new URL("../../src/common/门禁引擎/governance-roles.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(facadeSource, /CHIEF_CARD_TEXT\s*=/);
});

// —————————————————————— E0.2 D1：14 项 id→name→允许角色表 ——————————————————————

/**
 * 契约 §3.1 冻结表的**测试侧逐字副本**（测试 oracle，不是第二份生产来源；生产唯一来源是
 * `role-tool-registry.ts::ROLE_TOOL_CATALOG`）。顺序/名字/允许角色必须与 E0.2 逐项一致。
 */
const EXPECTED_ROLE_TOOL_TABLE = [
  { id: "roleActivityLog", name: "role_activity_log", allowedRoleIds: ["chief"] },
  { id: "terminateRoleRun", name: "terminate_role_run", allowedRoleIds: ["chief"] },
  { id: "redispatchTask", name: "redispatch_task", allowedRoleIds: ["chief"] },
  { id: "projectNote", name: "project_note", allowedRoleIds: ["chief"] },
  { id: "requestVersionDecision", name: "request_version_decision", allowedRoleIds: ["chief"] },
  { id: "requestRequirementChange", name: "request_requirement_change", allowedRoleIds: ["rapporteur", "convener"] },
  { id: "submitVersionChange", name: "submit_version_change", allowedRoleIds: ["product", "rapporteur"] },
  { id: "selectRunChange", name: "select_run_change", allowedRoleIds: ["rapporteur"] },
  { id: "completeTeamPlan", name: "complete_team_plan", allowedRoleIds: ["convener"] },
  { id: "activateRoleDocuments", name: "activate_role_documents", allowedRoleIds: ["nominator"] },
  { id: "closeCreatedTask", name: "close_created_task", allowedRoleIds: ["chief", "convener"] },
  { id: "submitRefactor", name: "submit_refactor", allowedRoleIds: ["convener"] },
  { id: "requestStableWrite", name: "request_stable_write", allowedRoleIds: ["convener"] },
  {
    id: "decidePendingRequest",
    name: "decide_pending_request",
    allowedRoleIds: ["chief"],
    chiefIndependentDecisionOnly: true,
  },
] as const satisfies readonly {
  id: RoleToolId;
  name: RoleToolName;
  allowedRoleIds: readonly BuiltInRoleId[];
  chiefIndependentDecisionOnly?: true;
}[];

test("D1：14 项 id→name→允许角色与 E0.2 §3.1 表逐项一致", () => {
  assert.equal(EXPECTED_ROLE_TOOL_TABLE.length, 14);
  assert.equal(ROLE_TOOL_CATALOG.length, 14);
  for (let index = 0; index < EXPECTED_ROLE_TOOL_TABLE.length; index += 1) {
    const expected = EXPECTED_ROLE_TOOL_TABLE[index];
    const actual = ROLE_TOOL_CATALOG[index];
    assert.equal(actual.id, expected.id);
    assert.equal(actual.name, expected.name);
    assert.deepEqual([...actual.allowedRoleIds], [...expected.allowedRoleIds]);
    const expectedIndependent =
      "chiefIndependentDecisionOnly" in expected && expected.chiefIndependentDecisionOnly === true;
    assert.equal(actual.chiefIndependentDecisionOnly === true, expectedIndependent);
    assert.equal(roleToolCatalogEntryOf(expected.id)?.name, expected.name);
  }
  // 唯一性：14 个 id、14 个运行时工具名，无重复/无遗漏。
  assert.equal(new Set(ROLE_TOOL_CATALOG.map((entry) => entry.id)).size, 14);
  assert.equal(new Set(ROLE_TOOL_CATALOG.map((entry) => entry.name)).size, 14);
  // 未知/错形 id 不猜、不兜底（snake_case 运行时名不能当 id 用）。
  assert.equal(roleToolCatalogEntryOf("dispatch_task"), undefined);
  assert.equal(roleToolCatalogEntryOf("decide_pending_request"), undefined);
  assert.equal(roleToolCatalogEntryOf(""), undefined);
});

test("D1：允许角色表正例——每个允许角色声明其工具均整单放行且映射正确", () => {
  for (const expected of EXPECTED_ROLE_TOOL_TABLE) {
    for (const roleId of expected.allowedRoleIds) {
      assert.deepEqual(validateRoleToolDeclaration(roleId, [expected.id]), {
        allow: true,
        tools: [{ id: expected.id, name: expected.name }],
        reasons: [],
      });
    }
  }
});

test("D1：越权/未知/整单拒绝/空表——fail-closed（deny 时不注入任何 id）", () => {
  // 越权：verifier 无角色专属工具。
  const unauthorized = validateRoleToolDeclaration("verifier", ["roleActivityLog"]);
  assert.equal(unauthorized.allow, false);
  assert.deepEqual(unauthorized.tools, []);
  assert.equal(unauthorized.reasons.length, 1);
  assert.equal(unauthorized.reasons[0]?.code, "role-tool-not-allowed");
  assert.deepEqual(unauthorized.reasons[0]?.details, { roleId: "verifier", toolId: "roleActivityLog" });

  // 未知 id（含能力位工具与 snake_case 名）：不注入、不静默忽略。
  for (const unknownId of ["dispatch_task", "decide_pending_request", "notATool"]) {
    const result = validateRoleToolDeclaration("chief", [unknownId]);
    assert.equal(result.allow, false);
    assert.deepEqual(result.tools, []);
    assert.equal(result.reasons[0]?.code, "role-tool-id-unknown");
  }

  // 未知角色（su/项目角色）声明工具：允许表中不存在该角色 ⇒ 越权拒绝。
  const unknownRole = validateRoleToolDeclaration("su", ["roleActivityLog"]);
  assert.equal(unknownRole.allow, false);
  assert.equal(unknownRole.reasons[0]?.code, "role-tool-not-allowed");

  // 多 id 中一项越权 ⇒ 整单拒绝，合法项也不得注入（不得从 deny 结果挑使用）。
  const partiallyDenied = validateRoleToolDeclaration("chief", ["roleActivityLog", "selectRunChange"]);
  assert.equal(partiallyDenied.allow, false);
  assert.deepEqual(partiallyDenied.tools, []);
  assert.deepEqual(partiallyDenied.reasons.map((reason) => reason.code), ["role-tool-not-allowed"]);

  // 重复声明 ⇒ 拒绝（不静默去重/忽略）。
  const duplicated = validateRoleToolDeclaration("chief", ["roleActivityLog", "roleActivityLog"]);
  assert.equal(duplicated.allow, false);
  assert.deepEqual(duplicated.tools, []);
  assert.equal(duplicated.reasons[0]?.code, "role-tool-declaration-duplicate");

  // 空表：不注入任何工具，整单放行（空声明不构成越权）。
  assert.deepEqual(validateRoleToolDeclaration("chief", []), { allow: true, tools: [], reasons: [] });
  assert.deepEqual(validateRoleToolDeclaration("verifier", []), { allow: true, tools: [], reasons: [] });
});

test("D1：decidePendingRequest 只进 chief 允许集且标记独立决策模式（会话模式由引擎调用点判）", () => {
  const entry = roleToolCatalogEntryOf("decidePendingRequest");
  assert.ok(entry !== undefined);
  assert.equal(entry.name, "decide_pending_request");
  assert.deepEqual([...entry.allowedRoleIds], ["chief"]);
  assert.equal(entry.chiefIndependentDecisionOnly, true);
  for (const roleId of ["product", "rapporteur", "nominator", "convener", "verifier"] as const) {
    assert.equal(validateRoleToolDeclaration(roleId, ["decidePendingRequest"]).allow, false);
  }
  // 校验函数只按允许表：chief 声明通过 ≠ 普通 chief 会话可注入；引擎调用点必须另核独立决策模式。
  assert.deepEqual(validateRoleToolDeclaration("chief", ["decidePendingRequest"]), {
    allow: true,
    tools: [{ id: "decidePendingRequest", name: "decide_pending_request" }],
    reasons: [],
  });
});

test("D9：无环扫描口径——Model 内互引仅 type-only 边，无 value import 反向/环", () => {
  const roleSource = readFileSync(new URL("../../src/model/role.ts", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../../src/model/runtime.ts", import.meta.url), "utf8");
  // E0.2 §10.2 D9：豁免 Model 内 type-only 边（role.ts↔runtime.ts、既有 download.ts 例外）；
  // 禁止 value import 反向/环；type-only 共享原语单列。模块图扫描脚本属 E1 gates-code/E3。
  assert.match(roleSource, /import type \{[^}]*GovernanceCardKind[^}]*\} from "\.\/runtime\.ts";/);
  assert.doesNotMatch(roleSource, /(^|\n)import \{[^}]*\} from "\.\/runtime\.ts";/);
  assert.match(runtimeSource, /import type \{[^}]*ResolvedRole[^}]*\} from "\.\/role\.ts";/);
  assert.doesNotMatch(runtimeSource, /(^|\n)import \{[^}]*\} from "\.\/role\.ts";/);
});

test("D10：capabilities 单一真源——模块 spec 唯一、tools() 输出为派生", () => {
  for (const id of Object.keys(MINIMAL_MODULES) as BuiltInRoleId[]) {
    const module = MINIMAL_MODULES[id];
    const policy = module.tools({ governanceModel: "trio" });
    // 最小桩按契约实现：tools().capabilities 直接派生自模块 spec 的 capabilities（同一引用）。
    assert.equal(policy.capabilities, module.capabilities);
    assert.deepEqual({ ...policy.capabilities }, { ...module.capabilities });
  }
});
