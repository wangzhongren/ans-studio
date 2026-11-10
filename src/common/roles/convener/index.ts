// 内置角色模块：运营（convener）——E1 greenfield（团队计划 §4.4⑤；B1 E1.1–E1.7）。
//
// 唯一 public entry；只依赖 `src/model/` 的公开类型（`role.ts` / `boundary.ts`）。
// 模块只含纯 TypeScript 数据与纯策略函数：无 I/O、无账本、无会话、无时钟、无随机数、
// 无可变状态；返回值只含普通数据/判定，不携带权限。
//
// 冻结契约：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`
// （E0.3；685 行 / SHA-256 `067e3d2e…`）§3.1/§3.2/§3.3/§3.4/§3.5、§10.2 D1/D5/D8/D10。
//  - D1：`tools()` 只返回本角色允许的 `RoleToolId`（14 项闭集；越界由引擎 fail-closed）。
//  - R-2：`dispatch()` 只做硬身份/存在性；hub/legacy/review 路由、run/module/D3/交付属主
//    与报告时点**留在引擎**（`run-role.ts` / `apply-journal.ts` / `workflow-preconditions.ts` /
//    桌面路由）。`reportToRoleId` 只作差分期望，不驱动实际报告路由。
//  - D5/Q4：`RoleContextResourceRef.path` 默认应用资源根；项目 `docs/workflow.md` 不是角色模块
//    资源，由宿主在上下文装配时另行提供（本模块只在文本中引用它，不把它写成 resources）。
//  - D8：`cards` 只列当前有效卡种（convener = `decision`；旧 `"write"` 不进入模块数据）。
//  - D10：模块 spec 的 `capabilities` 是唯一真源，`tools()` 输出同一引用派生。
//
// E1 过渡期权威：旧引擎（`governance-roles.ts` / `run-role.ts` / `apply-journal.ts`）仍是
// 差分 oracle；本模块不复写 Git 执行/ACL/证据闭包、Service 事务或桌面路由。
//
// T3「两条固定工作流路径」B2（MF-IR-4 / v1.3 §3.4）：在 legacy 数据**逐字冻结**的前提下新增
// fixed 矩阵数据（`fixedCards` / `fixedAllowedBuiltInRoleIds` / `isConvenerFixedBuiltInDispatchTarget`）
// 与 `context({matrix:"two-fixed-paths/v1"})` fixed 段；fixed 字段只在显式 fixed 矩阵下被消费，
// legacy 数据与 legacy 消费点（apply-journal / trunk-runtime）不改读取源。

import type { BoundaryEntry } from "../../../model/boundary.ts";
import type {
  BuiltInRoleModule,
  GovernanceCapabilities,
  GovernanceCardKind,
  GovernanceFunction,
  RoleContextInput,
  RoleContextSection,
  RoleDispatchPolicy,
  RoleDispatchPolicyInput,
  RolePolicyDecision,
  RolePolicyReason,
  RolePreflightHooks,
  RolePreflightInput,
  RoleToolId,
  RoleToolPolicy,
  TrustedToolPolicyInput,
} from "../../../model/role.ts";

// —————————————————————— 卡文本（与旧注册表 convener 规格逐字一致）——————————————————————
//
// 以下五个共享段落与 `src/common/门禁引擎/governance-roles.ts` 的私有常量逐字相同；
// E1 阶段作为数据迁入模块，差分测试逐字对比旧 oracle。E2 门面切换后删除旧内联规格。

const CREATED_TASK_CLOSURE =
  "- 原创建者收口：仅当应用核实可信身份等于 task.created.from，且当前 run/依据/报告和合法状态一致，才通过已注入的窄收口能力关闭自己创建的任务；submit_report 只是报告，不是 closed；未合法收口不得释放依赖，不手写 closed、不固定冒充 chief、不收口他人任务。";
const DIRECT_CAPABILITY_AVAILABILITY =
  "- 直接能力以本会话实际注入的工具为准：未提供、unavailable 或无真实回执时，报告「实现中/待注入」或阻塞；不得虚构工具、身份、批准、激活或完成，不得改发已取消的版本升级/VCA 批拒、修正案逐项/最终、appointment-write、团队计划确认卡。产品内直接能力不改 ANS 技能及其治理闸门。";
const STRUCTURED_GIT_DISCIPLINE =
  "- Git只走实际注入的结构化 `git_query` / `git_candidate` / `git_publish`：查询限宿主已核可读repo/ref/版本路径与有界模板，修改限本人当前可信scope及本任务应用分配的候选ref/现场；author、候选boundary、分支名不授新权。候选 prepared 不等发布、激活、交付或验收；发布只认应用完整差异/当前授权/expected-old核验后的真实回执。不得用裸Git、shell/脚本、直接写.git/common-dir/他人worktree或伪造OID/记录绕过；工具未注入如实待注入，来源、隔离、停稳或提交结果unknown保持blocked并交责任链核实。";
const ROLE_RECOVERY_DISCIPLINE =
  "- 回退与报告：保留task/run、原基线/候选完整OID、拒绝code/missing/owner和真实错误证据，报告回 task.created.from；责任owner是修复线索，不授权你互派或代改。对应owner在原合法范围真实修复后，重新核当前依据/权限/指定最终OID再恢复；缺证据不补造批准/ref/停稳，不重开已取消卡。无新信息不重试，原来源链预算不清零；危险或未知外部副作用零自动重派，取消执行须确认实际停止，不释放成功依赖。";
const CHIEF_HUB_DISCIPLINE =
  "- Chief枢纽：新 Product、Rapporteur、Nominator、Convener、Verifier 任务全部由 Chief 创建、接收正式报告并按真实创建者收口；Convener 仅创建和管理项目实现 worker，worker 先回 Convener，不能解决再报 Chief。历史任务仍按真实 task.created.from 报告/收口，不重写旧 creator、parent 或 accepted。普通 Chief→builtin 派发可只读准备、并行、跳过、返工、改类或停止，不以 M0、前序 close、plan/D3 为通用派发票；具体 write/activate/publish/execute 仍核适用 M0/仓库来源、plan/D3、当前 scope/权限、冻结8refs、指定最终OID/criteria/质量和真实 stopfacts，任务本身不授执行权。";

const CONVENER_CARD_TEXT = [
  "# 角色：运营（内置角色；项目运营者）",
  "",
  "职能：按幕僚任务处理真正新项目的受控init/首次候选、复用核实与团队计划；执行就绪后仅派项目实现 worker、收短报、集成并汇总幕僚；不创建新的 Verifier 或其它内置角色任务。",
  "- 分阶段前置：接首 init/复用核实或规划任务不要求未来 D3/新卡；真正新项目才经实际注入的 `git_candidate(action=init)` 和真实客户来源/task/run执行受控首建，若已存在repo则复用，拒绝/unknown报真实原因，不强制重建。规划先形成合法计划/分工/缺口，不能先等招人；派 worker 实现前才核当前有效 D3/授权、完整激活回执、workflow与依赖就绪，不是只看文件存在。",
  "- 项目工作流：由你落盘并维护 `docs/workflow.md`（步骤表：步骤 / 角色 / 前置依赖 / 契约 / 交接物 / 完成口令 / 验收）；派发实现任务前先让工作流就位。",
  "- 团队计划直接完成：以 convener/schedule 的实际注入能力提交版本化团队计划及 path/hash/version、flowId、当前依据摘要；应用核模块属主、写区、分工、依赖后直接完成、记账通知，不发团队计划客户确认卡。完成计划不等于 D3，不授权名单外角色；能力未注入报告待注入。",
  "- 实现阶段：按**已批准名单（D3 选中）**给项目 worker 发 `dispatch_task`（目标必须在批准名单内、完整卡/边界已激活并有真实内容绑定回执）；任务写清需求依据、验收标准、证据要求；worker 的 `submit_report` 回到你。",
  "- 收报：汇总进度/阻塞/证据，向幕僚 `submit_report`；不转发客户、不批准、不验收。",
  "- 独立质检：把真实集成候选OID/criteria及当前仍 live 的 controller 报 Chief，由 Chief 创建 Verifier 任务、接收报告并收口。你不派新质检、不发 acceptance 卡、不代客户验收。Chief 接受对应 review 后必须显式续接你的原任务，你再按实际质量/权限/R9核验发布；收到通知或旧 accepted 不等于本次发布许可。失败交原 worker 责任链返工，不能解决报 Chief，不等待失败质量被 accepted。",
  "- 环境阻塞可主动发 `request_choice(cardKind=decision)`，无需等幕僚追问；在幕僚唯一入口呈现并响应回原运营及责任链。卡须含 task/run/依据摘要、错误证据、已尝试动作，区分环境/信息/授权，给出方案前置/代价/推荐、保留/终止及恢复条件；业务选择不替代 shell/下载/写入等专门执行授权。",
  "- 同 task/run/阻塞/依据只保留一张有效卡，无新事实不重弹。拒绝/取消明确等待、保留或停止，卡取消不等于任务取消；迟答、变基线重核，过期选择不直接恢复。合法执行者经真实工具处理并核实际阻塞解除后，才恢复仍有效的原来源任务；条件仍错保持 blocked，保留成果与故障/重派预算，无可行方案如实停止。",
  "- 材料性选择仍用 `request_choice(cardKind=decision)`；**不得发 appointment（招人）卡——招人只由人事发起**；不能用 decision 卡换名恢复已取消五类卡。",
  CREATED_TASK_CLOSURE,
  DIRECT_CAPABILITY_AVAILABILITY,
  STRUCTURED_GIT_DISCIPLINE,
  ROLE_RECOVERY_DISCIPLINE,
  CHIEF_HUB_DISCIPLINE,
  "- 运营Git职责：本人计划/workflow形成范围内候选；集成仅收已授权owner候选，最终完整base→候选差异逐项归属，冲突语义修复退原owner。最终merge/revert新OID必须重新独立核验，父提交通过不代替；证据与原创建者合法收口齐备后才请求应用CAS交付，不代写产品/策划/人事内容，不裸改用户分支或远端。",
  "- 运营回退：脏区保留差异/现场/OID及在途清单，不add-A/stash/reset/clean；冲突交原owner、环境/授权不足主动业务卡并交合法执行者实际处理。修复后核最终OID、依赖/占用/权限/条件才恢复；选择后仍不满足保持blocked，取消/预算耗尽或未知副作用则明确保留/等待/停止。",
  "- 不写角色卡、不招人、不改名单、不写项目源码（实现只由项目 worker 写）。",
  "- 收到幕僚派发的任务：完成后**必须**用 `submit_report` 回短报（完成/未完成/证据/遗留），不要只结束回合。",
  "可写：`docs/workflow.md`（项目工作流）、`docs/scheduling/`、`docs/governance/convener/`（Section 1，预授权直接写）。",
  "禁写：`.ans/**`、`角色卡/**`、`docs/intents/**`、`docs/product/**`、`docs/proposals/**`、`docs/contracts/**`、`docs/quality/**`、`docs/verification/**`、`docs/skills/**`、`docs/mcp/**`。",
].join("\n");

// —————————————————————— 规格数据（D8/D10 单一真源）——————————————————————

const CONVENER_CAPABILITIES: GovernanceCapabilities = Object.freeze({
  customerInput: true,
  // I5/P1.1：新运营任务仅派项目实现 worker，不再创建 Verifier；历史 creator 不迁移。
  // 能力位只开启工具，实际派发矩阵和动作授权由宿主预检，不由展示文案授予。
  dispatchTask: true,
  roleStatus: false,
  sessionTail: false,
  installSkill: false,
  installMcp: false,
  shell: "operator-approve",
});

/** 当前有效卡种（D8）：convener 只发 decision 卡；appointment 只归人事。 */
const CONVENER_CARDS: readonly GovernanceCardKind[] = Object.freeze(["decision"]);

/**
 * fixed 派发矩阵卡种白名单（T3「两条固定工作流路径」B2；MF-IR-4 / v1.3 §3.4 convener 行）。
 *
 * 冻结值恰 `["decision"]`：固定路径运营只发 decision 卡（任命确认卡由幕僚呈；acceptance 卡
 * fixed 抑制）。fixed 矩阵**只读本字段**（门禁引擎门面 `cardKindsOf(id,"two-fixed-paths/v1")`），
 * **不从 legacy `cards` 过滤/推导**；legacy `cards` 逐字不动。纯数据、无 I/O。
 */
const CONVENER_FIXED_CARDS: readonly GovernanceCardKind[] = Object.freeze(["decision"]);

const CONVENER_CARD_ENTRIES: readonly BoundaryEntry[] = Object.freeze([
  Object.freeze({
    root: "project",
    path: "docs/workflow.md",
    kind: "file",
    purpose:
      "项目工作流（步骤表：步骤 / 角色 / 前置依赖 / 契约 / 交接物 / 完成口令 / 验收）；由运营落盘并维护",
  }),
  Object.freeze({
    root: "project",
    path: "docs/scheduling/",
    kind: "directory",
    purpose: "计划 / 分析 / 调度记录（D 批目标写区；无 flow 机器）",
  }),
  Object.freeze({
    root: "project",
    path: "docs/governance/convener/",
    kind: "directory",
    purpose: "运营的治理工作记录",
  }),
]);

// `docs/workflow.md` 为精确文件路径：预授权按等值匹配（有任务 writeSet 时也生效）。
const CONVENER_PREAUTHORIZED_DIRS: readonly string[] = Object.freeze([
  "docs/workflow.md",
  "docs/scheduling/",
  "docs/governance/convener/",
]);

const CONVENER_FORBIDDEN_WRITE_PATHS: readonly string[] = Object.freeze([
  ".ans/",
  "docs/bootstrap-manifest.md",
  "角色卡/governance-boundary.yaml",
  "角色卡/",
  "docs/proposals/",
  "docs/nominations/",
  "docs/skills/",
  "docs/mcp/",
]);

// —————————————————————— tools()（按旧 run-role 门控）——————————————————————
//
// 旧注入点：
//  · requestRequirementChange：trio 的 rapporteur/convener（`canRequestRequirementChange`）；
//  · completeTeamPlan / closeCreatedTask：trio + builtInGovernance + 无 chiefDecisionContext 的
//    convener（`directGovernance` 门控）；
//  · submitRefactor / requestStableWrite：角色 id === convener（旧代码不按治理模型二次收窄）。
// 未知治理模型按 fail-closed 返回空工具集（旧代码类型上不可达；运行时防御）。

const CONVENER_TRIO_TOOL_IDS: readonly RoleToolId[] = Object.freeze([
  "requestRequirementChange",
  "completeTeamPlan",
  "closeCreatedTask",
  "submitRefactor",
  "requestStableWrite",
]);

const CONVENER_ROLE_GATED_TOOL_IDS: readonly RoleToolId[] = Object.freeze([
  "submitRefactor",
  "requestStableWrite",
]);

const UNKNOWN_GOVERNANCE_MODEL_REASON: RolePolicyReason = Object.freeze({
  code: "governance-model-unknown",
  messageKey: "role.convener.tools.governanceModelUnknown",
});

function tools(input: TrustedToolPolicyInput): RoleToolPolicy {
  const model: unknown = input.governanceModel;
  if (model === "trio") {
    return { capabilities: CONVENER_CAPABILITIES, tools: CONVENER_TRIO_TOOL_IDS, reasons: [] };
  }
  if (model === "single") {
    // convener 不是 single 模型的角色；这两个工具在旧代码中是「角色 id === convener」门控，
    // 不因 single 额外收窄。模块仍保持与旧谓词逐字一致，是否可达由引擎决定。
    return { capabilities: CONVENER_CAPABILITIES, tools: CONVENER_ROLE_GATED_TOOL_IDS, reasons: [] };
  }
  return { capabilities: CONVENER_CAPABILITIES, tools: [], reasons: [UNKNOWN_GOVERNANCE_MODEL_REASON] };
}

// —————————————————————— dispatch()（R-2：只做硬身份/存在性）——————————————————————
//
// 纯数据：worker 派发目标。run/module/D3/roster/交付属主与报告时点**不在本模块**，留引擎
// （`apply-journal.ts` / `workflow-preconditions.ts` / 桌面路由）。
//
// 旧硬授权谓词（`workflow-preconditions.ts::evaluateDispatchAuthorization`，convener 分支）：
//  - 来源必须是 convener；
//  - 不得派给自己；
//  - 内置目标仅 verifier；
//  - 项目目标要求 targetExists。
// 本模块不复制旧引擎的 chief/convener 双来源上下文；来源由模块身份固定为 convener。

export const CONVENER_WORKER_DISPATCH_TARGETS = Object.freeze({
  /** 项目实现 worker 的目标类别（宿主核验存在性）。 */
  workerTargetKind: "project" as const,
  /** 允许派发的内置目标（唯一：质检；不创建其它内置任务）。 */
  allowedBuiltInRoleIds: Object.freeze(["verifier"] as const),
  /** 报告期望（差分 oracle 期望创建者；实际路由由 reportTargetForTaskCreator 决定）。 */
  reportToRoleId: "convener" as const,
});

// —————————————————————— fixed 矩阵派发数据（T3 B2；MF-IR-4 / v1.3 §3.2/§3.4）——————————————————————
//
// legacy 目标常量 `CONVENER_WORKER_DISPATCH_TARGETS`（`["verifier"]`）**逐字冻结**；fixed 目标集
// 是独立新数据，只在 fixed 谓词/矩阵视图中消费，legacy 消费点（apply-journal / trunk-runtime /
// 编排 legacy 谓词）不改读取源。

/**
 * fixed 矩阵下 convener 可派发的内置生产线目标（T3 B2；MF-IR-4 / v1.3 §3.2/§3.4）。
 *
 * 冻结值恰 `["product","rapporteur","nominator"]`：运营是生产线唯一派发者；verifier 由幕僚创建
 * （fixed 谓词对 convener→verifier 拒绝 `convener-to-verifier-forbidden`），不在此表。项目生产
 * 角色另按 `targetKind:"project"` 允许（目标存在性由宿主核验）。纯数据、无 I/O。
 */
const CONVENER_FIXED_ALLOWED_BUILT_IN_ROLE_IDS: readonly string[] = Object.freeze([
  "product",
  "rapporteur",
  "nominator",
]);

/**
 * fixed 矩阵下「该内置角色是否可作为 convener 的生产线派发目标」纯函数（MF-IR-4）。
 *
 * 与 `CONVENER_FIXED_ALLOWED_BUILT_IN_ROLE_IDS` **同源**（直接 `includes` 同一冻结数组，不复制
 * 第二张表）；大小写敏感（角色 id 逐字），空串/未知 id 恒 false。纯函数、无 I/O、不修改任何数据。
 * legacy `isConvenerBuiltInDispatchTarget`（`["verifier"]`）在编排侧**逐字冻结**，本谓词不得替换它。
 */
function isConvenerFixedBuiltInDispatchTarget(roleId: string): boolean {
  return CONVENER_FIXED_ALLOWED_BUILT_IN_ROLE_IDS.includes(roleId);
}

function denyDispatch(code: string, messageKey: string): RoleDispatchPolicy {
  return { decision: { allow: false, code, messageKey } };
}

function dispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy {
  if (input.sourceRoleId !== "convener") {
    return denyDispatch("dispatch-source-invalid", "role.convener.dispatch.sourceInvalid");
  }
  if (typeof input.targetRoleId !== "string" || input.targetRoleId.trim() === "") {
    return denyDispatch("dispatch-target-invalid", "role.convener.dispatch.targetInvalid");
  }
  if (input.targetRoleId === "convener") {
    return denyDispatch("self-dispatch", "role.convener.dispatch.selfDispatch");
  }
  if (input.targetKind === "built-in-governance") {
    if (!CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds.includes(input.targetRoleId as "verifier")) {
      return denyDispatch("convener-target-forbidden", "role.convener.dispatch.targetForbidden");
    }
    // 存在性是宿主核验的硬事实：`targetExists` 缺省即 false（冻结契约 §3.1 / Model 注释），
    // 内置目标同样要求显式 true；显式 false 与 targetKind 矛盾，fail-closed。
    if (input.targetExists !== true) {
      return denyDispatch("dispatch-target-missing", "role.convener.dispatch.targetMissing");
    }
    return {
      decision: { allow: true },
      reportToRoleId: CONVENER_WORKER_DISPATCH_TARGETS.reportToRoleId,
    };
  }
  if (input.targetKind === "project") {
    if (input.targetExists !== true) {
      return denyDispatch("dispatch-target-missing", "role.convener.dispatch.targetMissing");
    }
    return {
      decision: { allow: true },
      reportToRoleId: CONVENER_WORKER_DISPATCH_TARGETS.reportToRoleId,
    };
  }
  return denyDispatch("dispatch-target-kind-invalid", "role.convener.dispatch.targetKindInvalid");
}

// —————————————————————— preflight（角色侧前置；不替代 Service/Provider 最终校验）——————————————————————
//
// 事实包规则（契约 §3.4 / D4 / Q13）：`facts` 是宿主已核验的普通 JSON；本模块只读取 api-spec
// 登记的键。缺键/未知键/类型不符一律 deny（fail-closed）。每个动作的键集见
// `角色卡/convener-code/api-spec.md`。
//
// 覆盖动作（契约 §3.4 convener 行）：`team-plan` / `git-action` / `stable-write` /
// `requirement-change`。不在此列的动作 → `action-not-covered`。
//
// 本模块**不实现**：Git 执行、ACL、候选/证据闭包、Service 事务、团队计划结构/名单/属主校验
// （这些仍由 `apply-journal.ts` / Git Service 最终执行）。preflight 的 allow 只表示纯策略不反对。

const PREFLIGHT_ACTIONS = Object.freeze([
  "team-plan",
  "git-action",
  "stable-write",
  "requirement-change",
] as const);

const TEAM_PLAN_FACT_KEYS: readonly string[] = Object.freeze([
  "actorRoleId",
  "operationId",
  "flowId",
  "runId",
  "baseDigest",
  "plan",
]);

const STABLE_WRITE_FACT_KEYS: readonly string[] = Object.freeze(["actorRoleId", "kind", "content"]);

const REQUIREMENT_CHANGE_FACT_KEYS: readonly string[] = Object.freeze([
  "actorRoleId",
  "changeKind",
  "summary",
  "rationale",
  "flowId",
  "intentId",
  "taskId",
  "impact",
  "proposedIntentPatch",
]);

const REQUIREMENT_CHANGE_KINDS: readonly string[] = Object.freeze([
  "scope",
  "authorization",
  "constraint",
  "cost",
  "other",
]);

const GIT_ACTION_COMMON_FACT_KEYS: readonly string[] = Object.freeze([
  "actorRoleId",
  "action",
  "operationId",
]);

const GIT_ACTION_FACT_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  init: Object.freeze([...GIT_ACTION_COMMON_FACT_KEYS, "taskId", "runId", "customerSource", "repositoryState"]),
  commit: Object.freeze([...GIT_ACTION_COMMON_FACT_KEYS, "taskId", "runId", "base", "paths", "pathsAuthorized"]),
  integrate: Object.freeze([
    ...GIT_ACTION_COMMON_FACT_KEYS,
    "taskId",
    "runId",
    "base",
    "candidates",
    "contributorsAccepted",
    "contributorsAuthorized",
  ]),
  revert: Object.freeze([
    ...GIT_ACTION_COMMON_FACT_KEYS,
    "taskId",
    "runId",
    "base",
    "commit",
    "controllerTaskId",
    "reviewAccepted",
    "ownerGrantsVerified",
  ]),
  publish: Object.freeze([
    ...GIT_ACTION_COMMON_FACT_KEYS,
    "taskId",
    "runId",
    "expected",
    "candidate",
    "publishTarget",
    "finalCandidateVerified",
    "criteria",
    "evidence",
    "creatorCloseOperationId",
  ]),
});

type Facts = Readonly<Record<string, unknown>>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isHex64(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => isNonEmptyString(item));
}

function isGitOid(value: unknown): value is { readonly objectFormat: "sha1" | "sha256"; readonly hex: string } {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["objectFormat", "hex"])) return false;
  const format = value["objectFormat"];
  const hex = value["hex"];
  if (format !== "sha1" && format !== "sha256") return false;
  if (typeof hex !== "string") return false;
  return format === "sha1" ? /^[a-f0-9]{40}$/i.test(hex) : /^[a-f0-9]{64}$/i.test(hex);
}

function isGitBasis(value: unknown): value is { readonly ref: string; readonly oid: unknown } {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["ref", "oid"])) return false;
  return isNonEmptyString(value["ref"]) && isGitOid(value["oid"]);
}

function isGitEvidenceRef(value: unknown): boolean {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["oid", "path", "sha256"])) return false;
  return isGitOid(value["oid"]) && isNonEmptyString(value["path"]) && isHex64(value["sha256"]);
}

function isGitEvidenceList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isGitEvidenceRef);
}

function isDistinctGitOidList(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isGitOid)) return false;
  const seen = new Set<string>();
  for (const oid of value as ReadonlyArray<{ objectFormat: string; hex: string }>) {
    const key = `${oid.objectFormat}:${oid.hex.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function findUnknownFact(facts: Facts, allowed: readonly string[]): string | undefined {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(facts)) {
    if (!allowedSet.has(key)) return key;
  }
  return undefined;
}

function deny(code: string, messageKey: string, details?: unknown): RolePolicyDecision {
  return { allow: false, code, messageKey, ...(details === undefined ? {} : { details }) };
}

// 2026-11-09《团队计划登记 run 绑定 / baseDigest 合法来源》（B1 AC-10 / P-10）：
// `baseDigest` 与 `plan.sha256` 是应用拥有的机器事实（effective trunk digest / 计划文件实际
// 字节摘要），由 Service 派生；角色侧事实包允许缺省（缺省字段不投影），给出时必须保持既有
// 形状（64 hex）。路径/版本规则、未知键规则与 `TEAM_PLAN_FACT_KEYS` 逐字保留。
function checkTeamPlan(facts: Facts): RolePolicyDecision {
  const unknown = findUnknownFact(facts, TEAM_PLAN_FACT_KEYS);
  if (unknown !== undefined) {
    return deny("facts-unknown", "role.convener.preflight.factsUnknown", { action: "team-plan", key: unknown });
  }
  if (
    facts["actorRoleId"] !== "convener" ||
    !isNonEmptyString(facts["operationId"]) ||
    !isNonEmptyString(facts["flowId"]) ||
    (facts["baseDigest"] !== undefined && !isHex64(facts["baseDigest"])) ||
    (facts["runId"] !== undefined && !isNonEmptyString(facts["runId"]))
  ) {
    return deny("team-plan-facts-invalid", "role.convener.preflight.teamPlanFactsInvalid", { action: "team-plan" });
  }
  const plan = facts["plan"];
  if (
    !isPlainRecord(plan) ||
    !(hasExactKeys(plan, ["path", "version"]) || hasExactKeys(plan, ["path", "sha256", "version"])) ||
    !isNonEmptyString(plan["path"]) ||
    (plan["sha256"] !== undefined && !isHex64(plan["sha256"])) ||
    !isPositiveSafeInteger(plan["version"])
  ) {
    return deny("team-plan-facts-invalid", "role.convener.preflight.teamPlanFactsInvalid", {
      action: "team-plan",
      key: "plan",
    });
  }
  const expectedPath = `docs/scheduling/${facts["flowId"]}-team-v${plan["version"]}.md`;
  if (plan["path"] !== expectedPath) {
    return deny("team-plan-path-invalid", "role.convener.preflight.teamPlanPathInvalid", {
      action: "team-plan",
      expectedPath,
    });
  }
  return { allow: true };
}

function checkStableWrite(facts: Facts): RolePolicyDecision {
  const unknown = findUnknownFact(facts, STABLE_WRITE_FACT_KEYS);
  if (unknown !== undefined) {
    return deny("facts-unknown", "role.convener.preflight.factsUnknown", { action: "stable-write", key: unknown });
  }
  if (
    facts["actorRoleId"] !== "convener" ||
    !isNonEmptyString(facts["kind"]) ||
    !isNonEmptyString(facts["content"])
  ) {
    return deny("stable-write-facts-invalid", "role.convener.preflight.stableWriteFactsInvalid", {
      action: "stable-write",
    });
  }
  if (facts["kind"] !== "workflow") {
    return deny("stable-write-kind-invalid", "role.convener.preflight.stableWriteKindInvalid", {
      action: "stable-write",
      kind: facts["kind"],
    });
  }
  return { allow: true };
}

function checkRequirementChange(facts: Facts): RolePolicyDecision {
  const unknown = findUnknownFact(facts, REQUIREMENT_CHANGE_FACT_KEYS);
  if (unknown !== undefined) {
    return deny("facts-unknown", "role.convener.preflight.factsUnknown", {
      action: "requirement-change",
      key: unknown,
    });
  }
  const changeKind = facts["changeKind"];
  if (
    facts["actorRoleId"] !== "convener" ||
    typeof changeKind !== "string" ||
    !REQUIREMENT_CHANGE_KINDS.includes(changeKind) ||
    !isNonEmptyString(facts["summary"]) ||
    !isNonEmptyString(facts["rationale"]) ||
    (facts["impact"] !== undefined && !isNonEmptyString(facts["impact"])) ||
    (facts["proposedIntentPatch"] !== undefined && !isNonEmptyString(facts["proposedIntentPatch"]))
  ) {
    return deny("requirement-change-facts-invalid", "role.convener.preflight.requirementChangeFactsInvalid", {
      action: "requirement-change",
    });
  }
  const scoped =
    isNonEmptyString(facts["flowId"]) || isNonEmptyString(facts["intentId"]) || isNonEmptyString(facts["taskId"]);
  if (!scoped) {
    return deny("requirement-change-scope-missing", "role.convener.preflight.requirementChangeScopeMissing", {
      action: "requirement-change",
    });
  }
  return { allow: true };
}

function checkGitAction(facts: Facts): RolePolicyDecision {
  const action = facts["action"];
  if (
    typeof action !== "string" ||
    !["init", "commit", "integrate", "revert", "publish"].includes(action)
  ) {
    return deny("git-action-invalid", "role.convener.preflight.gitActionInvalid", { action: action ?? null });
  }
  const allowed = GIT_ACTION_FACT_KEYS[action] ?? GIT_ACTION_COMMON_FACT_KEYS;
  const unknown = findUnknownFact(facts, allowed);
  if (unknown !== undefined) {
    return deny("facts-unknown", "role.convener.preflight.factsUnknown", { action: "git-action", key: unknown });
  }
  if (facts["actorRoleId"] !== "convener" || !isNonEmptyString(facts["operationId"])) {
    return deny("git-action-facts-invalid", "role.convener.preflight.gitActionFactsInvalid", { action });
  }

  const invalid = (key: string): RolePolicyDecision =>
    deny("git-action-facts-invalid", "role.convener.preflight.gitActionFactsInvalid", { action, key });
  const unmet = (checks: readonly string[]): RolePolicyDecision =>
    deny("git-action-conditions-unmet", "role.convener.preflight.gitActionConditionsUnmet", { action, checks });

  if (action === "init") {
    if (
      !isNonEmptyString(facts["taskId"]) ||
      !isNonEmptyString(facts["runId"]) ||
      typeof facts["customerSource"] !== "boolean" ||
      !isNonEmptyString(facts["repositoryState"])
    ) {
      return invalid("init");
    }
    const unmetChecks: string[] = [];
    if (facts["customerSource"] !== true) unmetChecks.push("customer-source-required");
    if (facts["repositoryState"] !== "absent") unmetChecks.push("repository-absent-required");
    return unmetChecks.length > 0 ? unmet(unmetChecks) : { allow: true };
  }

  if (action === "commit") {
    if (
      !isNonEmptyString(facts["taskId"]) ||
      !isNonEmptyString(facts["runId"]) ||
      !isGitBasis(facts["base"]) ||
      !isStringList(facts["paths"]) ||
      typeof facts["pathsAuthorized"] !== "boolean"
    ) {
      return invalid("commit");
    }
    if (facts["pathsAuthorized"] !== true) return unmet(["paths-within-assigned-scope"]);
    return { allow: true };
  }

  if (action === "integrate") {
    if (
      !isNonEmptyString(facts["taskId"]) ||
      !isNonEmptyString(facts["runId"]) ||
      !isGitBasis(facts["base"]) ||
      !isDistinctGitOidList(facts["candidates"]) ||
      typeof facts["contributorsAccepted"] !== "boolean" ||
      typeof facts["contributorsAuthorized"] !== "boolean"
    ) {
      return invalid("integrate");
    }
    const unmetChecks: string[] = [];
    if (facts["contributorsAccepted"] !== true) unmetChecks.push("contributors-accepted");
    if (facts["contributorsAuthorized"] !== true) unmetChecks.push("contributors-authorized");
    return unmetChecks.length > 0 ? unmet(unmetChecks) : { allow: true };
  }

  if (action === "revert") {
    if (
      !isNonEmptyString(facts["taskId"]) ||
      !isNonEmptyString(facts["runId"]) ||
      !isGitBasis(facts["base"]) ||
      !isGitOid(facts["commit"]) ||
      !isNonEmptyString(facts["controllerTaskId"]) ||
      typeof facts["reviewAccepted"] !== "boolean" ||
      typeof facts["ownerGrantsVerified"] !== "boolean"
    ) {
      return invalid("revert");
    }
    const unmetChecks: string[] = [];
    if (facts["reviewAccepted"] !== true) unmetChecks.push("review-accepted");
    if (facts["ownerGrantsVerified"] !== true) unmetChecks.push("owner-grants-verified");
    return unmetChecks.length > 0 ? unmet(unmetChecks) : { allow: true };
  }

  // publish
  if (
    !isNonEmptyString(facts["taskId"]) ||
    !isNonEmptyString(facts["runId"]) ||
    !isGitBasis(facts["expected"]) ||
    !isGitOid(facts["candidate"]) ||
    typeof facts["publishTarget"] !== "string" ||
    typeof facts["finalCandidateVerified"] !== "boolean" ||
    !isGitEvidenceList(facts["criteria"]) ||
    !isGitEvidenceList(facts["evidence"]) ||
    (facts["creatorCloseOperationId"] !== undefined && !isNonEmptyString(facts["creatorCloseOperationId"]))
  ) {
    return invalid("publish");
  }
  if (facts["publishTarget"] !== "delivery") {
    return deny("git-action-target-invalid", "role.convener.preflight.gitActionTargetInvalid", {
      action,
      publishTarget: facts["publishTarget"],
    });
  }
  const unmetChecks: string[] = [];
  if (facts["finalCandidateVerified"] !== true) unmetChecks.push("final-candidate-verified");
  if (!isNonEmptyString(facts["creatorCloseOperationId"])) unmetChecks.push("creator-close-operation");
  return unmetChecks.length > 0 ? unmet(unmetChecks) : { allow: true };
}

function checkAction(input: RolePreflightInput): RolePolicyDecision {
  if (!isPlainRecord(input.facts)) {
    return deny("facts-invalid", "role.convener.preflight.factsInvalid", { action: input.action });
  }
  if (!(PREFLIGHT_ACTIONS as readonly string[]).includes(input.action)) {
    return deny("action-not-covered", "role.convener.preflight.actionNotCovered", { action: input.action });
  }
  switch (input.action) {
    case "team-plan":
      return checkTeamPlan(input.facts);
    case "stable-write":
      return checkStableWrite(input.facts);
    case "requirement-change":
      return checkRequirementChange(input.facts);
    case "git-action":
      return checkGitAction(input.facts);
    default:
      return deny("action-not-covered", "role.convener.preflight.actionNotCovered", { action: input.action });
  }
}

const preflight: RolePreflightHooks = Object.freeze({ checkAction });

// —————————————————————— context()（decision 卡 / 项目 workflow / 报告期望）——————————————————————
//
// D5/Q4：项目 `docs/workflow.md` 不是应用资源根下的角色模块资源；本模块只在文本中声明其
// path 与读取纪律，不把项目路径写成 `resources`（宿主另行提供 path/version/hash）。

const DECISION_CARD_SECTION_TEXT = [
  "## 运营 decision 卡",
  "- 材料性选择与环境阻塞使用 `request_choice(cardKind=decision)`；不得发 appointment（招人）卡——招人只由人事发起；不得用 decision 卡换名恢复已取消卡。",
  "- 卡内必须恰有一个 `recommended: true` 的推荐项；选项须给出前置、代价与推荐，区分环境/信息/授权，并给出保留/终止/恢复条件。",
  "- 卡须含 task/run/依据摘要、真实错误证据、已尝试动作；同一 task/run/阻塞/依据只保留一张有效卡，无新事实不重弹；卡取消不等于任务取消，迟答或基线变化须重新核对，过期选择不直接恢复。",
  "- 业务选择不替代 shell/下载/写入等专门执行授权；发起方不得自批、不得代客户选择。",
].join("\n");

const PROJECT_WORKFLOW_SECTION_TEXT = [
  "## 项目工作流（宿主提供）",
  "- 项目工作流为 `docs/workflow.md`（步骤表：步骤 / 角色 / 前置依赖 / 契约 / 交接物 / 完成口令 / 验收）；由运营落盘并维护，派发实现任务前先让工作流就位。",
  "- 准备时使用当前有效 snapshot；执行时使用对应 run 的 workflowRef 冻结字节，并标明 task/run/path/hash；不得用 live/latest 偷换冻结来源，资源更新不重 pin 执行 run。",
  "- 按 E0 契约 D5/Q4，`docs/workflow.md` 是项目来源而非应用资源根下的角色模块资源：本模块不声明 `resources`，由宿主在上下文装配时另行提供 path/version/hash。",
].join("\n");

const REPORT_EXPECTATION_SECTION_TEXT = [
  "## 报告期望",
  "- 项目 worker 的 `submit_report` 回到运营；本模块 `dispatch()` 的报告期望为 `convener`（仅差分期望，实际路由仍由编排 `reportTargetForTaskCreator` 决定）。",
  "- 运营汇总进度/阻塞/证据后向幕僚 `submit_report`；不转发客户、不批准、不验收、不代客户选择。",
  "- 收到幕僚派发的任务后必须用 `submit_report` 回短报（完成/未完成/证据/遗留），不要只结束回合。",
].join("\n");

const CONVENER_CONTEXT_SECTIONS: readonly RoleContextSection[] = Object.freeze([
  Object.freeze({ id: "decision-card", text: DECISION_CARD_SECTION_TEXT }),
  Object.freeze({ id: "project-workflow", text: PROJECT_WORKFLOW_SECTION_TEXT }),
  Object.freeze({ id: "report-expectation", text: REPORT_EXPECTATION_SECTION_TEXT }),
]);

// —————————————————————— fixed context 段（T3 B2；仅显式 fixed 矩阵返回）——————————————————————
//
// v1.3 §3.4 convener 行：fixed 段说明新职责（生产线唯一派发者 / 团队计划与基线 3 件小事 /
// 集成汇总与报告期望 / 不派质检）。只在 `context({matrix:"two-fixed-paths/v1"})` 下返回；
// `context({})`（无 matrix）与 `matrix:"legacy-v1"` 逐字返回上面的 legacy 三段（同一冻结引用）。
// run-role fixed 会话把本段追加在旧卡文本之后；与旧卡文本冲突时以本段为准（仅 fixed 会话）。
// 纯静态文本（无资源引用、不读盘、不拼接运行时事实）。

const FIXED_PRODUCTION_LINE_SECTION: RoleContextSection = Object.freeze({
  id: "convener-fixed-production-line",
  text: [
    "## 固定路径运营：生产线唯一派发者（two-fixed-paths/v1；与旧卡文本冲突时以本段为准）",
    "- 收到幕僚 `stage-request` 后，由你在真实回合内派发生产线：内置 product / rapporteur / nominator 与项目生产角色（模块属主 / 实现 / 分析）；实现任务须写明 moduleId、写集与验收/证据要求，做属主校验并保持同工作区写任务串行；生产任务报告回你。",
    "- 幕僚不直接派生产线角色（chief-production-dispatch-forbidden）；`stage-request` 是只读、无 module/写集的产线调度请求，不是生产线派发。",
    "- 不派 verifier：独立验收由幕僚创建（默认 verifier；roster `roles[].review` 项目验收角色优先）；`convener→verifier` 拒绝（`convener-to-verifier-forbidden`）；你不派新质检、不发 acceptance 卡、不代客户验收。",
  ].join("\n"),
});

const FIXED_BASELINE_SECTION: RoleContextSection = Object.freeze({
  id: "convener-fixed-baseline",
  text: [
    "## 固定路径团队计划与基线（fixed）",
    "- 团队计划：以 `complete_team_plan` v4 提交版本化团队计划 `docs/scheduling/<flowId>-team-v<version>.md`（path/version；无 runId/baseDigest，出现即 `baseline-legacy-field-forbidden`）；应用核模块属主/写区/分工/依赖后直接完成。完成计划不等于 D3，不授权名单外角色。",
    "- 基线 3 件小事（A9）：团队计划 v4 / `git init -b main`（应用执行）/ `.gitignore` 托管块 + baseline commit + 任务分支 `ans/task/<workflowId>`；失败按 `baseline-*` fail-closed，不弹客户卡。",
  ].join("\n"),
});

const FIXED_REPORT_SECTION: RoleContextSection = Object.freeze({
  id: "convener-fixed-report",
  text: [
    "## 固定路径集成汇总与报告期望（fixed）",
    "- 集成汇总：汇总各生产线任务与实现任务的进度/阻塞/真实提交（任务分支 `ans/task/<workflowId>` 的普通 Git add/commit）；冲突或返工交回原 owner 责任链，不代写实现、不伪造完成。",
    "- 报告期望：汇总后向幕僚 `submit_report`（完成/未完成/证据/遗留）；收到幕僚派发的任务必须用 `submit_report` 回短报，不要只结束回合；不转发客户、不批准、不验收、不代客户选择。",
    "- 发布合并：由应用呈 merge-main 卡、仅客户本人确认；你不代批、不冒充客户、不自行合并 main。",
  ].join("\n"),
});

const CONVENER_FIXED_CONTEXT_SECTIONS: readonly RoleContextSection[] = Object.freeze([
  FIXED_PRODUCTION_LINE_SECTION,
  FIXED_BASELINE_SECTION,
  FIXED_REPORT_SECTION,
]);

function context(input: RoleContextInput): readonly RoleContextSection[] {
  // T3 B2 矩阵分支：只有显式 `matrix:"two-fixed-paths/v1"` 返回 fixed 段；
  // 缺省 / `"legacy-v1"` / `context({})` 一律返回同一 legacy 引用（逐字冻结）。
  // 可选链：历史调用方即使传畸形输入也保持 legacy 行为（不抛错）。
  if (input?.matrix === "two-fixed-paths/v1") return CONVENER_FIXED_CONTEXT_SECTIONS;
  return CONVENER_CONTEXT_SECTIONS;
}

// —————————————————————— 唯一导出模块 ——————————————————————

/** 运营（convener）内置角色模块；E2 由门禁引擎门面装配进 `BuiltInRoleModuleMap`。 */
export const convenerRoleModule: BuiltInRoleModule = Object.freeze({
  id: "convener",
  displayName: "运营",
  function: "schedule",
  card: Object.freeze({
    text: CONVENER_CARD_TEXT,
    entries: CONVENER_CARD_ENTRIES,
    preauthorizedDirs: CONVENER_PREAUTHORIZED_DIRS,
    forbiddenWritePaths: CONVENER_FORBIDDEN_WRITE_PATHS,
  }),
  capabilities: CONVENER_CAPABILITIES,
  cards: CONVENER_CARDS,
  // T3 B2 fixed 矩阵数据（MF-IR-4）：只在 `matrix:"two-fixed-paths/v1"` 下被消费；
  // legacy 数据/消费点逐字冻结，不改读取源。
  fixedCards: CONVENER_FIXED_CARDS,
  fixedAllowedBuiltInRoleIds: CONVENER_FIXED_ALLOWED_BUILT_IN_ROLE_IDS,
  isConvenerFixedBuiltInDispatchTarget,
  tools,
  dispatch,
  preflight,
  context,
});
