// Model 层：角色与来源的共享类型
// 冻结契约：角色卡/项目管理/docs/design/2026-10-11_design_ans-cli-v1-prototype.md §2
// 只用可擦除语法。
//
// 依赖方向（E0.2 §10.2 D9 无环扫描口径）：本文件与 `runtime.ts` 的互引均为 **type-only** 边——
// 豁免 Model 内 type-only 边（`role.ts↔runtime.ts`、既有 `download.ts` 例外）；禁止 value import
// 反向/环；type-only 共享原语单列。E0 阶段以本注释 + 契约测试记录该口径，模块图扫描脚本属
// E1 gates-code/E3；本文件不得引入任何 value import 反向依赖。

import type { Acceptance, BoundaryEntry, BoundarySection1 } from "./boundary.ts";
import type { FrozenRoleEvidence } from "./trunk.ts";
// E0 角色模块契约：卡种沿用既有 Model 类型（`src/model/runtime.ts` 是 `GovernanceCardKind`
// 的唯一真源）。这里只有 type-only 引用/再导出，编译后无运行时依赖边；不复制字面量联合。
import type { GovernanceCardKind } from "./runtime.ts";

export type RoleKind = "project" | "built-in-governance";

/**
 * 治理模型（客户 2026-10-17 拍板「V1 + V1b 分期；新项目 trio、旧项目默认 single 兼容」；
 * 冻结契约：`角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md` §5.1）。
 *
 * - `"single"`：旧治理模型（内置角色 `su`）——**缺省值**，任何未显式声明 trio 的调用方行为逐字不变。
 * - `"trio"`：三权治理模型（**三权不变、六个内置角色**：`chief` / `product` / `rapporteur` /
 *   `nominator` / `convener` / `verifier`；`trio` 命名的是权力模型而不是角色数量）。
 *   2026-10-28 批次 A：`liaison` 退休（仅编译期 deprecated 别名），主入口 `primaryRoleId="chief"`。
 *
 * 模型来源：`src/common/shared/config-loader.ts::readGovernanceModel`（PM 属主，只读消费）；
 * `listProject` 按本模型枚举内置角色，`resolveBoundarySection` 按本模型选择边界来源。
 */
export type GovernanceModel = "single" | "trio";

/**
 * 内置治理角色的治理职能（2026-10-28 方案 v9.2「幕僚 + 最小系统」）：
 * 幕僚 `chief` / 产品 `product` / 提案 `proposal` / 提名 `nomination` / 编排 `schedule` /
 * 验收 `verification`。`schedule` 仅作职能 id / 兼容标签，**不再有调度权**（调度归幕僚）。
 *
 * `liaison` 是**批次 A 的编译期 deprecated shim**（方案 §16.3：中间批次可用只读别名维持
 * typecheck；行为不变，D 批删除）：它**不进入** `BUILT_IN_GOVERNANCE_ROLES` / 角色列表 /
 * 新项目主入口，只用于存量旧会话/旧测试按 id 解析。
 *
 * 仅 trio 的六个内置治理角色携带；`su`（single）与项目角色为 `undefined`。
 */
export type GovernanceFunction =
  | "chief"
  | "product"
  | "proposal"
  | "nomination"
  | "schedule"
  | "verification"
  /** @deprecated 批次 A 临时 shim（方案 §16.3），D 批删除；不进入注册表枚举/列表。 */
;

/** 角色卡声明的协作信息，仅供展示；不授予权限或改变角色身份。 */
export interface RoleGroupMetadata {
  readonly group?: string;
  readonly groupDuty?: string;
}

// F8：角色路径来自配置，不硬编码 角色卡/<角色>/
export interface RoleLocation {
  card: string; // 项目相对路径，如 角色卡/编排/role-card.md
  boundary: string; // 项目相对路径
}

export interface ResolvedRole extends RoleGroupMetadata {
  id: string;
  kind: RoleKind;
  cardText: string;
  boundary: BoundarySection1;
  boundarySource: string;
  location: RoleLocation;
  /** 仅 trio 的内置治理角色携带（chief/product/proposal/nomination/schedule/verification）；su 与项目角色不出现。
   *  批次 A 兼容：旧 `liaison` 仍可经 deprecated 只读别名解析，但不进入列表。 */
  governanceFunction?: GovernanceFunction;
}

export interface ProjectConfig {
  /** 仅宿主注入的可信读取上下文；有run缺物证必须拒绝，不能退回live。 */
  documentContext?: { runId?: string; pinDigest?: string; frozenRoleEvidence?: FrozenRoleEvidence };
  projectRoot: string;
  skillRoot: string;
  roles: Record<string, RoleLocation>; // F8：由配置提供
  /** 允许**会话式入口**（openRoleSession / 桌面聊天）开启的内置治理角色 id 列表。
   *  这些角色无角色目录、不登记在 roles 映射（登记会让 resolveRole 去读空 cardPath 而报错）；
   *  调用方（桌面应用）据门禁引擎 listProject 的枚举结果（builtIn===true）填充。
   *  缺省/未设置 = 不额外允许任何内置角色——此时仅 roles 登记的角色可寻址（CLI `ans role run` 即此情形，行为不变）。 */
  builtInRoles?: string[];
  /** 治理模型（评审 §5.1/§5.5）：缺省 `"single"`——旧行为逐字不变。
   *  由共享载入器 `readGovernanceModel`（PM 属主）与 `listProject().governanceModel` 填充；
   *  门禁引擎只读消费，不写 `.ans`。 */
  governanceModel?: GovernanceModel;
  governanceBoundary?: { path: string; acceptance: Acceptance };
  /** 冷启动「**有界创世例外**」的触发与证据（设计 §10.1 / §12.2，任务 T31）。
   *
   *  仅在**操作者发起的 bootstrap**（导入空文件夹并开启内置治理角色对话）时，由调用方（编排 / 桌面）
   *  **显式**设置——**不是** `acceptance.accepted === true` 的自动推论（若自动推论，任何已接受项目都会
   *  意外获得创世授权，即 blanket）。`source` 如实记录该操作者指令（供 F6 与审计）。
   *
   *  设置后，`resolveBoundarySection` 对**内置治理角色**返回「**项目根**」治理种子边界
   *  （**普通目录** `角色卡/`、`docs/`、`.ans/`——见 §12.2：由条件目录改为普通目录，故 su 的
   *  `scope: undefined` 下命中即放行，**无需 scope、也无需 slug**），acceptance 即
   *  `{ accepted: true, source }`——**这仍是有界授权**：条目仅此三处治理产物（不含 `src/`、不含
   *  项目内任意文件），且仅在**本字段被显式设置**时出现。
   *
   *  **自终止**：项目自己的治理边界文档一旦写出并经 pin 接受（`.ans/project.json` 令
   *  `governanceBoundary.path` 非空），`resolveBoundarySection` 的**项目覆盖**分支**先于**本字段求值，
   *  创世授权随之失效——**本字段即便残留也不再生效**（自终止是结构性的，不依赖调用方清除它）。 */
  genesisBootstrap?: { source: string };
}

// —————————————————————— E0：公开角色模块契约（P1.6 §6.2 / 团队计划 §7.3）——————————————————————
//
// 六个产品内置角色代码模块（`src/common/roles/<内置 id>/`，E1 起）以 `BuiltInRoleModule` 为唯一
// 公开形状；本文件只承载**类型**（纯可擦除语法），不实现装配、不宣布冻结——冻结由统筹在 E0 契约
// 评审后记录（路径/版本/sha256/评审人/消费者/测试证据）。
//
// 约束（B1 E0.2/E0.5/E0.6；`shared-directories.md`「Role modules」）：
//  - 角色模块只依赖 `src/model/` 与 `src/common/shared/` 的 public entry；**不 import** 引擎实现、
//    门控模块或其它角色模块（含 `src/common/门禁引擎/` 私有 common、`src/pipeline/`、`src/service/`、
//    `src/provider/`、`app/`）。
//  - 每个模块唯一 public entry `index.ts`；模块只含纯 TypeScript 数据与纯策略函数：无 I/O、无账本、
//    无会话、无时钟、无随机数、无可变状态。
//  - 返回值是普通数据/判定（`RolePolicyDecision`），**不携带权限**；引擎仍执行全部安全边界。
//  - 缺事实/未知默认拒绝（fail-closed）；「未提供」不得解释为允许。
//  - 错误语义（P1.6 §6.6）：稳定内部码 `code` + i18n `messageKey`；角色模块不写用户文案、
//    不以抛异常作控制流。
//  - E2 由 `src/common/门禁引擎/governance-roles.ts` 门面 re-export/装配：本文件的公开投影是该门面
//    在切换期对齐的唯一形状来源；私有实现的展示摘要（`matrix` 等）**不进入**本契约。

/** 六个产品内置治理角色 id（P1.6 §6.3；`su` 与项目角色不在角色模块契约内）。 */
export type BuiltInRoleId = "chief" | "product" | "rapporteur" | "nominator" | "convener" | "verifier";

/** shell 审批档公开投影（与运行层注入值同集；`none`/`readonly` 仅旧数据/兼容保留）。 */
export type GovernanceShellTier = "none" | "readonly" | "operator-approve";

/**
 * 治理能力位的**公开只读投影**（P1.6 §6.2 `capabilities`）。
 *
 * 私有数据当前在 `src/common/门禁引擎/governance-roles.ts::GovernanceCapabilities`；E2 由该门面
 * 改为本类型 re-export/装配，避免两份定义长期漂移。能力位只表达「注入哪些工具/通道」，不是权限：
 * 执行与安全边界仍由引擎判定。
 *
 * E0.2 §10.2 D10（capabilities 单一真源）：模块 spec 的 `capabilities`
 * （`BuiltInRoleModule["capabilities"]`）是**唯一真源**；`tools()` 输出 `RoleToolPolicy.capabilities`
 * 只是它的派生，必须与 spec 一致。E0 以类型断言 + 注释 + 契约测试声明；完整模块约束在 E1 接口评审落地。
 */
export interface GovernanceCapabilities {
  readonly customerInput: boolean;
  readonly dispatchTask: boolean;
  readonly roleStatus: boolean;
  readonly sessionTail: boolean;
  readonly installSkill: boolean;
  readonly installMcp: boolean;
  readonly shell: GovernanceShellTier;
}

/**
 * 角色卡与 Section 1 数据的公开只读投影（P1.6 §6.2 `card`）。
 *
 * 角色模块只声明数据；边界解析、预授权播种与 `resolveWrite` 判定仍由门禁引擎执行，
 * 本类型不构成写权限。
 */
export interface RoleCardSpec {
  /** 角色卡正文（Markdown；纯数据，不读盘）。 */
  readonly text: string;
  /** 该角色的 Section 1 边界条目（root 恒为 project；按段比较，不实现 glob）。 */
  readonly entries: readonly BoundaryEntry[];
  /** 会话初始 writeSet 预置目录（预授权 ≠ 跳过 F4/F6/F7、禁写路径与治理门禁）。 */
  readonly preauthorizedDirs: readonly string[];
  /** 先于 `resolveWrite` 判定的禁写前缀（应用治理记录/其他治理角色资料），命中即拒。 */
  readonly forbiddenWritePaths: readonly string[];
}

/**
 * 内置治理角色规格的**公开只读投影**（P1.6 §6.2；私有 `BuiltInGovernanceRoleSpec` 的数据子集）。
 *
 * 只读展示摘要（`matrix`）不属于角色模块契约，刻意不在此列；E2 门面自行维护展示部分。
 */
export interface GovernanceRoleSpec {
  readonly id: BuiltInRoleId;
  readonly displayName: string;
  readonly function: GovernanceFunction;
  readonly card: RoleCardSpec;
  /**
   * 能力位**唯一真源**（E0.2 §10.2 D10）：`tools()` 输出的 `capabilities` 是它的派生。
   * 模块实现必须保持两者一致（不得两份不一致）；E1 接口评审落地完整模块约束。
   */
  readonly capabilities: GovernanceCapabilities;
  /** 该角色可发起的治理卡种（稳定 token；值集与 `src/model/runtime.ts` 的 `GovernanceCardKind` 同源）。 */
  readonly cards: readonly GovernanceCardKind[];
}

/**
 * 既有 Model 卡种类型的公开再导出（唯一真源仍是 `src/model/runtime.ts`）。
 * 角色模块只须从 `src/model/role.ts` 取得契约相关类型；不得另写字面量联合或第二张卡种表。
 */
export type { GovernanceCardKind };

/**
 * 角色纯策略判定（P1.6 §6.6 / B1 E0.5）：typed、无异常、不写文案。
 *
 * - `allow: true` 只表示「该纯策略不反对」；**不是权限票**，引擎仍执行全部安全边界。
 * - `allow: false` 必带稳定内部码 `code` 与 i18n `messageKey`；`details` 只放结构化补充事实。
 * - `details` 保持 `unknown`（E0 D3）：只允许 **JSON 可序列化的普通数据**；不得含密钥/凭据、
 *   客户正文或模型原始输出。消费者只可**展示/审计**，不得据此放行任何动作。
 * - 缺事实/未知一律构造 deny（fail-closed）。
 */
export type RolePolicyDecision =
  | { readonly allow: true }
  | { readonly allow: false; readonly code: string; readonly messageKey: string; readonly details?: unknown };

/**
 * 策略附带的结构化原因（稳定内部码 + i18n messageKey；只供展示/审计，不参与判定）。
 * `details` 保持 `unknown`（E0 D3）：只允许 JSON 可序列化的普通数据，不得含密钥/凭据、客户正文
 * 或模型原始输出；消费者只可展示/审计，不得据此放行。
 */
export interface RolePolicyReason {
  readonly code: string;
  readonly messageKey: string;
  readonly details?: unknown;
}

/**
 * `tools()` 的输入：**宿主已核验**的事实（不可由模型输入或角色模块自行推断）。
 * 保持最小：角色模块只按治理模型装配 trio 专属工具；会话/通道可用性由引擎在注入层处理。
 */
export interface TrustedToolPolicyInput {
  /** 治理模型（宿主从项目配置读取；`single` 时不装配 trio 角色工具）。 */
  readonly governanceModel: GovernanceModel;
}

/**
 * 角色模块可额外声明的工具稳定 id **闭集**（E0.2 §3.1 R-1 / §10.2 D1；14 项）。
 *
 * - 只列**角色专属额外注入**的工具；`projectState` 等内置治理角色共有工具由引擎按
 *   `builtInGovernance` 注入，不在此列。
 * - **id→运行时工具名（`RoleToolName`）→允许角色** 的唯一来源是门禁引擎私有装配表
 *   `src/common/门禁引擎/role-tool-registry.ts::ROLE_TOOL_CATALOG`；本文件只定义字面量闭集，
 *   **不得**在别处再维护第二份映射。
 * - 引擎装配遇到未知 id、闭集外 id 或角色允许集之外的 id 必须 **fail-closed**（整单不注入、
 *   不静默忽略）；新增 id 走接口评审（契约 §4.4），角色模块不得自行扩张。
 * - `decidePendingRequest` 仅 chief 独立决策上下文可用；普通 chief 会话不因声明获得
 *   （会话模式由引擎调用点判定，装配表注释）。
 */
export type RoleToolId =
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
  | "decidePendingRequest";

/**
 * `RoleToolId` 对应的运行时注册工具名（snake_case；E0.2 §3.1 逐字，14 项）。
 *
 * 本类型只定义字面量闭集，**不承载映射值**：逐项映射只存在于门禁引擎私有装配表
 * （`role-tool-registry.ts::ROLE_TOOL_CATALOG`，单一来源），由契约测试逐项断言与 §3.1 表一致。
 */
export type RoleToolName =
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
  | "decide_pending_request";

/** `tools()` 的输出：可用能力位 + 额外注入工具稳定 id + 结构化原因（纯数据）。 */
export interface RoleToolPolicy {
  /**
   * 能力位：**派生**自模块 spec 的 `capabilities`（`BuiltInRoleModule["capabilities"]` 是唯一
   * 真源，E0.2 §10.2 D10）；模块必须返回与 spec 一致的值，不得两份不一致。
   */
  readonly capabilities: GovernanceCapabilities;
  /** 额外注入的工具稳定 id（`RoleToolId` 闭集；闭集外/越权 id 由引擎装配 fail-closed；空数组＝不额外注入）。 */
  readonly tools: readonly RoleToolId[];
  readonly reasons: readonly RolePolicyReason[];
}

/** `dispatch()` 的输入：派发来源/目标的**宿主可信事实**（不做 I/O、不猜测、不补造）。 */
export interface RoleDispatchPolicyInput {
  /** 派发来源角色 id（真实发起者；未知时缺席 ⇒ fail-closed）。 */
  readonly sourceRoleId?: string;
  /** 拟派发目标角色 id（真实 id）。 */
  readonly targetRoleId: string;
  /** 目标类别（宿主核验；`project` ＝项目角色/worker）。 */
  readonly targetKind: RoleKind;
  /** 目标是否真实存在/已枚举（宿主核验；缺省 false ⇒ 拒绝）。 */
  readonly targetExists?: boolean;
}

/** `dispatch()` 的输出：纯判定 + 报告期望（收到报告必须回到的真实创建者）。 */
export interface RoleDispatchPolicy {
  readonly decision: RolePolicyDecision;
  /** 报告期望：允许时报告必须回到的真实创建者 id；拒绝或无期望时缺席。 */
  readonly reportToRoleId?: string;
}

/** 角色纯前置策略覆盖的治理动作（P1.6 §6.3；新增动作走接口评审，不自行扩张）。 */
export type RoleGovernedAction =
  | "version-upgrade"
  | "detail-amendment"
  | "run-change"
  | "requirement-change"
  | "version-decision"
  | "stable-write"
  | "appointment"
  | "team-plan"
  | "git-action"
  | "review";

/** `preflight.checkAction()` 的输入：动作 id + 该动作的**可信事实**（形状由动作消费者定义）。 */
export interface RolePreflightInput {
  readonly action: RoleGovernedAction;
  /**
   * 宿主已核验的普通数据；角色模块只读（E0 D4）。
   *
   * 每个角色模块的 `api-spec.md` 必须登记「动作 → 允许读取的 fact 键」；缺键/未知键/类型不符
   * 一律构造 deny（fail-closed）。角色模块只读事实，不得重新采集/推断/补造，也不得复制
   * Service/Provider 的最终校验（preflight allow 不替代最终校验）。
   */
  readonly facts: Readonly<Record<string, unknown>>;
}

/** 动作前置事实校验（纯函数；无 I/O/账本/会话）。每个角色按需实现，未实现即不提供该字段。 */
export interface RolePreflightHooks {
  /** 返回 typed 判定；不得抛异常作控制流。 */
  checkAction(input: RolePreflightInput): RolePolicyDecision;
}

/** 上下文资源引用（只声明路径/版本/hash；读取与校验由宿主执行，角色模块不读盘）。 */
export interface RoleContextResourceRef {
  /**
   * 默认**应用资源根**相对路径（如 `chief-workflow.md`；E0 D5/Q4）。
   *
   * 项目 `docs/workflow.md` **不是**角色模块资源，由宿主在上下文装配时另行提供（来源/版本/hash
   * 单列）；本版不新增 `root` 字段。资源读取/校验由宿主执行，角色模块不读盘。
   */
  readonly path: string;
  /** 可选冻结版本标签（如 `chief-workflow/v1`）。 */
  readonly version?: string;
  /** 可选 SHA-256（宿主核验；缺省不核验）。 */
  readonly sha256?: string;
}

/** 提示块/资源引用（P1.6 §6.2 `context`；纯数据，顺序由角色模块给定）。 */
export interface RoleContextSection {
  /** 稳定 section id（同一角色内唯一；宿主据此去重/排序）。 */
  readonly id: string;
  /** 提示文本块（角色模块自有的纯文本，不拼接 I/O 结果）。 */
  readonly text: string;
  readonly resources?: readonly RoleContextResourceRef[];
}

/** `context()` 的输入：治理模型 + 宿主注入的只读事实（不携带权限）。 */
export interface RoleContextInput {
  readonly governanceModel: GovernanceModel;
  /**
   * 宿主注入的只读事实（E0 D4）：只允许读取该角色 `api-spec.md` 登记的键；缺键/未知键/类型不符
   * 按 fail-closed 处理（不得静默当作空值）。角色模块不得复制 Service 校验或携带权限。
   */
  readonly facts?: Readonly<Record<string, unknown>>;
}

/**
 * 六个产品内置角色代码模块的唯一公开契约（P1.6 §6.2 / 团队计划 §7.3 / B1 E0.2）。
 *
 * 每个模块（`src/common/roles/<id>/index.ts`，E1 起）导出恰好一个 `BuiltInRoleModule`：
 * 规格数据（`id/displayName/function/card/capabilities/cards`）＋四个纯策略面
 * （`tools`/`dispatch`/`preflight?`/`context`）。模块之间零 import；不 import 引擎/门控；
 * 无 I/O/账本/会话/时钟/随机数/可变状态；返回值是普通数据/判定，不携带权限。
 */
export interface BuiltInRoleModule extends GovernanceRoleSpec {
  /** 工具/能力装配策略（纯函数）。 */
  tools(input: TrustedToolPolicyInput): RoleToolPolicy;
  /** 派发目标/报告期望策略（纯函数）。 */
  dispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy;
  /** 动作前置事实校验（可选；不提供＝该角色无专属前置策略）。 */
  preflight?: RolePreflightHooks;
  /** 提示块/资源引用（纯函数；不读盘）。 */
  context(input: RoleContextInput): readonly RoleContextSection[];
}

/**
 * 六个内置角色模块的**完整装配表**（E0 D2；契约 §3.1/§10.2）。
 *
 * 键集恰为 `BuiltInRoleId`（六个，不缺不多）；值必须是由各角色模块唯一 `index.ts` 导出的
 * `BuiltInRoleModule`。角色模块之间零 import；装配由门禁引擎门面（E1 建立模块、E2 切换）完成。
 *
 * E0.2 §10.2 D2 已接受 `governance-roles.ts::builtInRoleModuleDataOf(id)` 零复制门面 lookup 作为
 * E0 产物（不要求本文件/门面在 E0 导出完整 map）；完整 `builtInRoleModules` 在 E1 六模块落地后
 * 由门面装配，E2 切换时删除内联规格。E0 阶段模块尚不存在，门面只提供零复制的规格数据投影。
 */
export type BuiltInRoleModuleMap = Readonly<Record<BuiltInRoleId, BuiltInRoleModule>>;
