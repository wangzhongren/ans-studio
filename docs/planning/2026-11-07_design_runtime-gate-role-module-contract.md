# 运行时门控与角色模块：E0 公开契约（草案 E0.3）

- 日期：2026-11-07；角色：ANS 策划（Planning）独立上下文。
- 状态：**E0.3 契约草案，供冻结引用；未冻结、未实施、未测试、未运行真实模型、未改任何代码/测试/角色卡/边界。** **E0.3 相对 E0.2（681 行 / 53674 bytes / `798ce9ce…`）仅做文本修正，语义等价**；冻结记录将引用 E0.3 并映射到已判 E0.2 `798ce9ce…`。E0.1 评审记录 `docs/scheduling/2026-11-07_review_E0-contract_runtime-gate-role-module.md`（71 行 / 12303 bytes / `6905f391b42c95a1cc94bd367fdb4ae23a080e8151cdf21f01e37363337a13f6`）。本版只修正版本文字、Q3/Q13 编号与 7/7→8/8 锚点，不改 P1.6/B1/H1/团队计划。冻结由统筹在 E0 评审通过后写 `docs/scheduling/2026-11-07_contract-freeze_runtime-gate-role-module.md`；冻结后变更走接口评审（不引入客户卡）。
- 本文件是 E0 的正式契约输入，不是验收标准，也不替代 B1。B1 的 E0.1–E0.9 仍由独立验收按 `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md` 判定。

**版本记录**

| 版本 | 日期 | 变更 | 状态 |
| --- | --- | --- | --- |
| E0.1 | 2026-11-07 | 初稿：8 模块 API、shared/gates 契约、写集、B0/22 fixture、冻结输入、Pi 政策、D1–D8、Q1–Q12 | 已被 E0.2 取代；评审见 `6905f391…` |
| E0.2 | 2026-11-07 | 处置 R-1（RoleToolId 扩 14 + 映射）、R-2（dispatch 仅硬身份/存在性）、R-3（import）、R-4（reason 触发文字）、R-5（锚点），并确认 Q1–Q13/非 blocking 记录项 | 已被 E0.3 取代；可判性已确认（映射 E0.2 `798ce9ce…`） |
| E0.3 | 2026-11-07 | 纯文本修正：§8/§12 版本文字 E0.1→E0.3；Q3/Q13 编号统一（Q3=dispatch 范围，Q13=动作事实键）；契约测试 7/7→8/8；语义等价 | 待冻结引用 |

## 0. 输入与版本锚点

| 输入 | 路径 | 版本/哈希（本文件写盘前核对） |
| --- | --- | --- |
| 方案 P1.6 | `docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md` | 1242 行 / 160852 bytes / `241502075ff57d6534d7b2c807a2726f1a4c261381e3b0f968b6be468c64e9ce` |
| 团队计划 | `docs/scheduling/2026-11-07_team-plan_runtime-gate-role-modularization.md` | 687 行 / 82241 bytes / `00e1f76b6a527a1237ac1467bb4100805750606904ce6960bb56a013a4ba565c` |
| B1 标准 | `docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md` | 273 行 / `a999dc1961c9ebe4727f0796d6baefd24a23e75b1a6cc1d215a9c0e2f63b4999` |
| B0 冻结脏基线 | `角色卡/测试/docs/change/2026-11-07_runtime-gate-role-modularization-B0-baseline.md` | 910 行 / 81484 bytes / `135535055abfe2e4b4f3c4c34d207618272b98fe5b5cfefc7b23e70cec483101` |
| 门禁引擎 E0 类型草案 | `src/model/role.ts`（当前 +254/−1，工作树未提交；E0.1 起草时 +208/−1）+ `test/门禁引擎/role-module-contract.test.ts`（当前 399 行；E0.1 起草时 337 行） | 证据 `角色卡/门禁引擎/docs/change/2026-11-07_E0_role-module-contract-types-evidence.md` 当前 314 行 / `971dadde6b30b1b1696cbfdaec7af289b8c62b8df83a2a700f735758e6e80c95`（E0.1 起草时 182 行 / `35f4bbfb…`）；D1–D10 落地后以当前证据为准 |
| H1 角色卡/边界 | `角色卡/{chief,product,rapporteur,nominator,convener,verifier,shared,gates}-code/boundary.md` 与 `role-card.md` | 8 角色已由人事写卡/边界/YAML（团队计划 §4.3/§4.4；H1 独立核对通过） |
| P1 实现状态 | 工作树 P1 实现（implemented-unverified，不在本契约修改范围） | 团队计划/调度记录：P1 候选 12 文件聚合 `f1d0d017…`、集成测试 `ede01d45…`；本契约只对齐其类型/API |

本契约**不修改** P1 实现、门禁引擎草案、B1、团队计划、H1 角色卡/边界；如需调整，分别由原 owner 在 E0 评审后按接口评审执行，并在冻结记录中列 delta。

## 1. 目的、范围与非目标

### 1.1 目的

为 E1 的八个开发侧代码维护角色提供**唯一、可冻结、可差分、可验收**的公共契约：
1. 六个产品内置角色代码模块（chief/product/rapporteur/nominator/convener/verifier）的 `BuiltInRoleModule` 公开形状与纯策略签名；
2. 共享代码维护角色（`shared-code`）维护的 `src/common/shared/` 既有共享组件契约（维护/迁移，不重写）；
3. 门控代码维护角色（`gates-code`）的派发父门判定模块 API、证据消费边界、reason 码；
4. 依赖方向、写集/owner、行为/测试基线、冻结记录输入、Pi `ANS_PI_SERVER_TOOLS` 政策、与门禁引擎类型草案的对齐 delta。

### 1.2 范围

- 只定义**公开 API/数据形状/纯策略约束/错误语义/写集/基线/冻结输入**；不实现模块、不写角色卡、不改 B1。
- 六个角色模块与门控模块为 greenfield；共享模块为既有 `src/common/shared/` 维护/迁移（不是 greenfield 重写，P1.6 §9.2/F26）。
- 角色模块只依赖 `src/model/` 与 `src/common/shared/` public entry；不 import 引擎/门控/其他角色模块。

### 1.3 非目标

- 不建通用工作流引擎/DSL/规则解释器；契约是 TypeScript 类型 + 纯函数 + 文档 + 测试。
- 不改变客户主权、验收、写权/边界、shell/Git ACL、D3/冻结/报告/收口语义。
- 不改变 Codex 严格路径原条件、写/发布门 strict observed 边界、应用中介证据的消费白名单。
- 不新设角色/边界；写集/owner 复述 H1 卡与团队计划，不新授权。
- 不在本文件内实现 Pi/适配器修复；只冻结政策与 delta（由 Pi 适配器 owner 在 E1/P1-B 后续执行）。

## 2. 架构与依赖方向

```
Model (src/model/)
   ↑ type-only / pure data
shared (src/common/shared/)                 ← shared-code 维护（既有组件）
   ↑ public entries
{ roles (src/common/roles/<id>/), gates (src/common/gates/) }  ← 角色/gates 维护
   ↑ public entry index.ts（roles/gates）；shared 为既有 per-component 入口
engines (Interface/Pipeline/Service/Provider) ← 现有 owner；只读消费
```

硬规则：
1. **Model ← shared ← {roles, gates} ← engines**；不得反向 import。
2. **六角色模块 + gates 模块**：唯一 public entry `index.ts`；模块内可拆内部文件，模块根不得散放文件；外部只能经 `index.ts`。
3. **共享模块**：不是单一新模块；`src/common/shared/` 的既有组件保留各自 public entry（不新增伞状 `index.ts`，除非 E0 另批；Q1）。shared-code 只维护/迁移既有组件。
4. 角色模块之间零 import；角色模块不 import 引擎/门控/其他角色私有 common；gates 不 import 角色；shared 不 import 门/角色；无环（D2 扫描）。
5. 角色模块/gates/shared 不 import `src/common/门禁引擎/` 私有 common、`src/pipeline/`、`src/service/`、`src/provider/`、`app/`。
6. 角色模块无 I/O、无账本、无会话、无时钟、无随机数、无可变状态；只返回纯数据/判定，不携带权限。
7. `handback.ts`/`workflow-preconditions.ts` 是**编排的稳定公开只读入口**，默认不迁移（P1.6 §8.2、团队计划 §9.4 第 4 项）；角色模块不 import 引擎，只通过引擎参数/数据使用。

## 3. 六个角色模块公共 API

### 3.1 `BuiltInRoleModule`（唯一公开形状）

以下类型以门禁引擎 E0 草案 `src/model/role.ts` 为基础；本契约为其**冻结口径**（见 §10 delta）：

```ts
export type BuiltInRoleId = "chief" | "product" | "rapporteur" | "nominator" | "convener" | "verifier";
export type GovernanceShellTier = "none" | "readonly" | "operator-approve";

export interface GovernanceCapabilities {
  readonly customerInput: boolean;
  readonly dispatchTask: boolean;
  readonly roleStatus: boolean;
  readonly sessionTail: boolean;
  readonly installSkill: boolean;
  readonly installMcp: boolean;
  readonly shell: GovernanceShellTier;
}

export interface RoleCardSpec {
  readonly text: string;
  readonly entries: readonly BoundaryEntry[];
  readonly preauthorizedDirs: readonly string[];
  readonly forbiddenWritePaths: readonly string[];
}

export interface GovernanceRoleSpec {
  readonly id: BuiltInRoleId;
  readonly displayName: string;
  readonly function: GovernanceFunction;
  readonly card: RoleCardSpec;
  readonly capabilities: GovernanceCapabilities;
  readonly cards: readonly GovernanceCardKind[]; // 唯一真源 src/model/runtime.ts
}

export type RolePolicyDecision =
  | { readonly allow: true }
  | { readonly allow: false; readonly code: string; readonly messageKey: string; readonly details?: unknown };

export interface RolePolicyReason {
  readonly code: string;
  readonly messageKey: string;
  readonly details?: unknown;
}

export interface TrustedToolPolicyInput { readonly governanceModel: GovernanceModel; }

export interface RoleToolPolicy {
  readonly capabilities: GovernanceCapabilities;
  readonly tools: readonly RoleToolId[];
  readonly reasons: readonly RolePolicyReason[];
}

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

export interface RoleDispatchPolicyInput {
  readonly sourceRoleId?: string;
  readonly targetRoleId: string;
  readonly targetKind: RoleKind;
  readonly targetExists?: boolean;
}

export interface RoleDispatchPolicy {
  readonly decision: RolePolicyDecision;
  readonly reportToRoleId?: string;
}

export type RoleGovernedAction =
  | "version-upgrade" | "detail-amendment" | "run-change" | "requirement-change"
  | "version-decision" | "stable-write" | "appointment" | "team-plan" | "git-action" | "review";

export interface RolePreflightInput {
  readonly action: RoleGovernedAction;
  readonly facts: Readonly<Record<string, unknown>>;
}

export interface RolePreflightHooks {
  checkAction(input: RolePreflightInput): RolePolicyDecision;
}

export interface RoleContextResourceRef {
  readonly path: string;
  readonly version?: string;
  readonly sha256?: string;
}

export interface RoleContextSection {
  readonly id: string;
  readonly text: string;
  readonly resources?: readonly RoleContextResourceRef[];
}

export interface RoleContextInput {
  readonly governanceModel: GovernanceModel;
  readonly facts?: Readonly<Record<string, unknown>>;
}

export interface BuiltInRoleModule extends GovernanceRoleSpec {
  tools(input: TrustedToolPolicyInput): RoleToolPolicy;
  dispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy;
  preflight?: RolePreflightHooks;
  context(input: RoleContextInput): readonly RoleContextSection[];
}

export type BuiltInRoleModuleMap = Readonly<Record<BuiltInRoleId, BuiltInRoleModule>>;
```

**签名/返回类型冻结**：六角色模块的 `tools/dispatch/preflight/context` 必须与上述完全一致；`preflight` 可选，不提供即该角色无专属前置策略。`tools().tools` 只能使用 `RoleToolId` 闭集；未知 id 由引擎装配 fail-closed（不得注入），新增 id 走接口评审（§4.4）。`dispatch().reportToRoleId` 必须是真实角色 id；未知值由引擎 fail-closed。`projectState` 等**内置治理角色共有工具**由引擎按 `builtInGovernance` 注入，不需要各角色在 `tools()` 重复声明；`RoleToolId` 只列**角色专属额外注入**。

**R-1 处置（选择 (a)：扩为 14 id + snake_case 映射）**：`RoleToolId` 是模块声明的稳定 camelCase id；引擎装配时按下表映射到运行时注册工具名（snake_case）。未知 id 或映射不一致 → fail-closed（不注入、不静默忽略）。本闭集由编排/运行时核心按 `run-role.ts`、`provider/runtime/tools.ts` 现状核对；run-role 属编排，门禁引擎负责类型与装配校验。

| RoleToolId | 运行时工具名 | 允许角色（按现有注入点） |
| --- | --- | --- |
| roleActivityLog | role_activity_log | chief |
| terminateRoleRun | terminate_role_run | chief |
| redispatchTask | redispatch_task | chief |
| projectNote | project_note | chief |
| requestVersionDecision | request_version_decision | chief |
| requestRequirementChange | request_requirement_change | rapporteur, convener |
| submitVersionChange | submit_version_change | product, rapporteur |
| selectRunChange | select_run_change | rapporteur |
| completeTeamPlan | complete_team_plan | convener |
| activateRoleDocuments | activate_role_documents | nominator |
| closeCreatedTask | close_created_task | chief, convener |
| submitRefactor | submit_refactor | convener |
| requestStableWrite | request_stable_write | convener |
| decidePendingRequest | decide_pending_request | chief（独立决策模式） |

- 该表是 **id→name→允许角色** 的唯一冻结清单；角色模块 `tools()` 只能返回本角色允许的 id（越界由引擎 fail-closed）。`decidePendingRequest` 仅在 chief 独立决策上下文（`buildChiefDecisionTools`）可用；普通 chief 会话不因声明而获得。
- 不新增 `RoleToolId` 之外的字段；如未来新增，走 §4.4 接口评审并更新本表/类型/测试。

**R-2 处置（`dispatch()` 范围收窄为硬身份/存在性）**：`RoleDispatchPolicyInput` 保持四字段（`sourceRoleId?`/`targetRoleId`/`targetKind`/`targetExists?`），`dispatch()` **只回答“该真实来源能否向该真实目标派发”**（来源/目标身份与目标存在性）。以下**不属于** `dispatch()`，留在引擎现有位置：
- hub（`chief-hub-v1`）与 legacy 派发路由、review/续接 controller 路由：`trunk-runtime.ts`、`apply-journal.ts`、桌面 `session.ts`；
- convener 的 run/module 规则、D3 选中集合、交付任务/模块属主：`apply-journal.ts`/`workflow-preconditions.ts`/桌面路由；
- 报告时点与实际 `reportTargetForTaskCreator`：`src/common/编排/workflow-preconditions.ts`（编排稳定公开只读入口）。
- 模块 `RoleDispatchPolicy.reportToRoleId` 仅作**差分期望**（旧引擎 oracle 的期望创建者），不驱动实际报告路由；实际路由仍由 `reportTargetForTaskCreator` 决定。
- 若未来要让 convener 模块拥有模块规则，须新增可选可信事实并重开接口评审（本版不新增字段）。

### 3.2 六角色模块内容、消费者与 owner

| 角色 | 模块目录（唯一 `index.ts`） | 角色模块内容（数据/纯策略） | 主要消费者 | 测试根 |
| --- | --- | --- | --- | --- |
| chief | `src/common/roles/chief/` | 卡/边界条目/capabilities/cards；chief 专属工具策略（roleActivityLog/terminateRoleRun/redispatchTask/projectNote/requestVersionDecision）；hub 派发目标/报告期望；chief 决策上下文；chief-workflow 资源引用；intent-confirm 卡数据 | 编排 `run-role.ts`（工具策略）、Service `apply-journal.ts`（hub 派发/报告）、桌面窗口（路由/呈现）、门禁引擎 `governance-roles.ts` 门面 | `test/roles/chief/` |
| product | `src/common/roles/product/` | 卡/边界/capabilities/cards；version-upgrade 提交前置策略；产品上下文；报告期望 | Service `version-change`/trunk、编排、桌面 | `test/roles/product/` |
| rapporteur | `src/common/roles/rapporteur/` | 卡/边界/capabilities/cards；detail-amendment 整单策略；run-change 三模式策略；requirement-change；decision 卡数据；报告期望 | Service VCA/run-change、桌面 | `test/roles/rapporteur/` |
| nominator | `src/common/roles/nominator/` | 卡/边界/capabilities/cards；D3/appointment 策略；三文档写卡前置；install_skill/install_mcp 能力位；appointment-write 卡数据 | Service appointment/journal、桌面、门禁引擎（D3 前置只读） | `test/roles/nominator/` |
| convener | `src/common/roles/convener/` | 卡/边界/capabilities/cards；worker 派发目标/模块规则；team-plan 策略；git 动作角色侧条件；requirement-change；decision 卡；项目 workflow 引用 | 编排（Git 能力装配）、Service apply-journal/hub、桌面 | `test/roles/convener/` |
| verifier | `src/common/roles/verifier/` | 卡/边界/capabilities/cards；review target/最终候选/CID/criteria 策略；acceptance 卡数据；报告期望 | Service/桌面（review/acceptance 路由） | `test/roles/verifier/` |

**迁移归属（非 blocking，评审记录）**：chief 的 `chief-workflow` 资源引用与 `intent-confirm` 数据当前实现位于 `provider/runtime/tools.ts`/`run-role.ts`；E1 接口评审须明确迁移边界、差分方式与旧实现删除单元，不在 E0 直接移动。

### 3.3 纯数据/纯策略硬约束（B1 E0.2）

1. 只依赖 `src/model/` 与 `src/common/shared/` public entry；不 import 引擎/门控/其他角色模块。
2. 唯一 public entry `index.ts`；模块根不得散放文件；外部只能经 index 导入（D2 扫描）。
3. 无 I/O、无账本、无会话、无时钟、无随机数、无可变状态；输入只读，不修改调用方数据。
4. 返回值只含普通数据/判定；不返回权限、批准、token、租约、句柄或客户凭据。
5. 缺事实/未知默认拒绝；`allow: true` 只表示该纯策略不反对，不是权限票。
6. `deny` 必带稳定内部 `code` 与 i18n `messageKey`；`details` 只能是 JSON 可序列化的普通数据，不含密钥/正文/模型原始输出。
7. `context().text` 是角色模块自有静态模板；不得嵌入运行时秘密、账本内容或未脱敏证据；资源引用只声明 path/version/sha256，读取由宿主执行（角色模块不读盘）。
8. `cards` 只列当前有效卡种；旧 `"write"` 等 legacy token 不进入模块数据；E2 门面负责旧数据兼容映射。
9. 六个模块之间零 import；共享逻辑上收 shared 或作为参数注入，不得复制。
10. 新增/变更 public API（`BuiltInRoleModule` 字段、`RoleToolId`、动作、消息键）走接口评审（§4.4），不自行扩张。

### 3.4 动作前置策略（preflight）归属与事实包

| 角色 | 可覆盖的 `RoleGovernedAction` | 说明 |
| --- | --- | --- |
| chief | `version-decision` | chief 的版本决策请求；其余动作由对应角色模块覆盖。 |
| product | `version-upgrade` | VCA 提交前置；不复制 Service 的 hash/结构/权限校验。 |
| rapporteur | `detail-amendment`, `run-change`, `requirement-change` | 整单修正案、run 三模式选择、需求变更申请。 |
| nominator | `appointment` | D3/appointment；三文档写卡前置由 Service/门禁引擎执行。 |
| convener | `team-plan`, `git-action`, `stable-write`, `requirement-change` | 团队计划、Git 角色侧条件、stable 请求、需求变更申请。 |
| verifier | `review` | review target/最终候选/CID/criteria 角色侧条件。 |

- **事实包规则**：`facts` 是宿主已核验的普通数据（plain JSON），角色模块只读；只允许读取该动作在 `api-spec.md` 中声明的键；缺键/未知/类型不符 → `deny`（fail-closed）。角色模块不得重新采集、推断或补造事实；Service/Provider 的最终校验不因 preflight allow 而省略。
- 不在本角色归属内的 action → `deny` 稳定码 `action-not-covered` / i18n key（模块自定义，需登记）。
- 每个角色模块的 `api-spec.md` 必须列出：动作、要求的 fact 键、缺失行为、返回码/i18n key、对应 Service/Provider 最终校验（不得替代）。
- **E0 问题 Q13**：是否在 E0 冻结每动作 fact 键的精确 schema，或按“api-spec 登记 + 测试”冻结；本契约默认后者（避免把 Service 事实形状复制进 Model/role.ts）。

### 3.5 错误语义

| 场景 | 契约行为 |
| --- | --- |
| 允许 | `{ allow: true }`（纯策略不反对；不是权限） |
| 缺事实/未知/类型不符 | `{ allow: false, code, messageKey }`；不得默认允许 |
| 动作不在本角色范围 | `{ allow: false, code: "action-not-covered", messageKey }` |
| 派发目标非法/不存在 | `{ decision: { allow: false, code, messageKey } }`；不返回 `reportToRoleId` |
| 报告期望 | 允许时 `reportToRoleId` 必须是真实创建者 id；未知 → 引擎 fail-closed |
| 外部可见回执 | 门禁/Pipeline 仍返回现有 `trunk-verify-failed` 与文案；内部 reason 只用于测试/诊断 |

## 4. 共享模块契约（`shared-code`）

### 4.1 范围与 owner

- owner：`shared-code`（开发侧 worker）；写集 `src/common/shared/`、`test/项目管理/shared/`（自项目管理移交）、`角色卡/shared-code/docs/architecture/shared-components.md`（迁入）、自身 docs。
- **既有模块维护/迁移，不是 greenfield 重写**；E1 只按 E0 契约维护/新增共享 public entry，不把角色专属策略放进 shared。
- `src/provider/runtime/schema.ts` 与 `tools.ts` **不在本 E0 的 shared-code 写集**，保持运行时核心 owner（P1.6 §8.2 注）；若 E0 后续把它们归为共享组件，须另走接口评审与写集变更，不在本契约自动迁移。
- 共享组件目录从 `角色卡/项目管理/docs/architecture/shared-components.md` 迁至 `角色卡/shared-code/docs/architecture/shared-components.md`（团队计划 §6.4；单写者顺序：shared-code 建新 → E0/E1 评审等价 → PM 删旧；不留双份）。若 E0 否决迁移，退回 S1（PM 兼任）并重开闸门 2。

### 4.2 既有共享组件 public entry（默认清单）

| 组件 | 路径 | 主要 public entry（既有导出，不复制） | 主要消费者 |
| --- | --- | --- | --- |
| argv 规范化 | `src/common/shared/argv-primitives.ts` | `normalizeArgv` 等 | 引擎/适配器/CLI |
| 原子写 | `src/common/shared/atomic-write.ts` | `atomicWrite`、`renameReplacingExisting`、`retryOnTransient`、`AtomicWriteOptions` | Provider/Service |
| 配置加载 | `src/common/shared/config-loader.ts` | `loadEffectiveConfig`、`readGovernanceModel`、`ansProjectPath`、`enforcePinBackedAcceptance` | 引擎/CLI |
| 诊断 | `src/common/shared/diagnostics.ts` | `createDiagnosticLogger`、`configureDiagnostics`、`getDiagnosticsStatus` | 全层 |
| env 文件 | `src/common/shared/env-file.ts` | `parseEnvFile`/`mergeEnvText`/`parseEnvValue`/`renderEnvValue`/`isSecretKey` | 装配/适配器 |
| 意图入口契约 | `src/common/shared/intent-entry-contract.ts` | `INTENT_ENTRY_*`、`resolveIntentEntryReference`、`intentEntryContractText`、`readIntentEntryFacts` | 门禁/Service/角色模块 |
| JSONL 账本 | `src/common/shared/jsonl-ledger.ts` | `appendJsonlLine`、`jsonlSegmentFiles`、JSONL limits/parse 类型 | Provider/Service |
| 路径原语 | `src/common/shared/path-primitives.ts` | `toPosix`/`normalizeLexical`/`isWithinReal` 等 | 全层 |
| 运行时设置 | `src/common/shared/runtime-settings.ts` | `RUNTIME_SETTINGS`/`getRuntimeSettingsDefinition` | 装配/适配器/UI |
| 运行时共享常量 | `src/common/shared/runtime-shared.ts` | `RuntimeKind`、`RUNTIME_LABELS`、凭据 env 名单 | 全层 |
| i18n | `src/common/shared/i18n/` | `MessageKey`、`translate`、format/locales/types | 全层 |

- 上表是**默认公开入口清单**；E0 允许 shared-code 在相同依赖方向下新增/收敛共享 public entry，但必须在冻结记录与共享组件目录中登记，并走接口评审。
- 共享组件不 import `src/common/门禁引擎/`、`src/pipeline/`、`src/service/`、`src/provider/`、`app/`、角色模块或 gates。
- 共享行为变更使消费者证据失效；按 P1.6 §8.5 重取或明确标注。

### 4.3 编排公开只读例外（默认不迁移）

- `src/common/编排/handback.ts`（任务-报告-回交协议、`isDispatchableRoleId` 等）与 `src/common/编排/workflow-preconditions.ts`（`evaluateDispatchAuthorization`/`evaluateDispatchPreflight`/`reportTargetForTaskCreator`）保持**编排 owner、写入权不变**，声明为**稳定公开只读入口**。
- 角色模块不 import 这两个文件（角色模块不 import 引擎）；Service/桌面等现有消费者经公开入口使用。
- 共享 API 变更（签名/语义/错误）须经 shared-code 评审 + 消费者影响清单 + 测试；无记录不得合并。
- 若 E0 评审认定必须迁入 `src/common/shared/`，按 X-S 单单元执行：shared-code 建新 → 消费 owner 切换 → 双跑 → 删旧（不得双份）。默认不迁移；Q6。

### 4.4 接口评审流程（无客户卡）

1. 需求方（角色/门控/引擎 owner）提交变更提案：目的、受影响 public entry、消费者、兼容性、测试、迁移/回滚。
2. shared-code 评审共享 API 变更；gates-code 评审门 API；角色模块 public entry 由对应 `*-code` 提出、消费者 owner 确认。
3. 实现 + 测试；受影响 owner 更新调用；统筹排期；独立验收按证据判断。
4. 更新共享组件目录/冻结记录；旧实现删除，不留双份。
5. 不新造客户卡；不把内部评审伪装成客户决定；仅按既有授权/闸门要求由客户确认方案或实施。

## 5. 门控模块契约（`gates-code`）

### 5.1 公开 API（`src/common/gates/index.ts`）

门控模块只判定，不采集证据、不读注册表、不调用 Service。输入是调用方已取得的事实；输出是 typed 判定 + 稳定 reason 码。

```ts
import type {
  RuntimeInputProvenanceV1,
  RuntimeKind,
  RuntimeSessionLifecycleFacts,
  RuntimeSessionToolSurfaceFacts,
} from "../../model/runtime.ts";

export interface DispatchParentHostFacts {
  parent: {
    roleId: "chief";
    runtime: RuntimeKind;
    sessionId: string;
    turnId: string;
    clientMessageId?: string;
    kind?: string;
    inputAccepted: true;
    settled: false;
  };
  creatorReports?: readonly { taskId: string; roleId: string; reportId: string; turnId: string }[];
}

export interface DispatchParentCoreFacts {
  disposed: boolean;
  construction: string;                 // 只接受 "default-core"
  roleId?: string;
  runtime?: RuntimeKind;
  lifecycle?: RuntimeSessionLifecycleFacts;
  toolSurface?: RuntimeSessionToolSurfaceFacts;
  turnInput?: { turnId: string; provenance?: RuntimeInputProvenanceV1 };
}

export type DispatchParentReason =
  | "evidence-missing"
  | "disposed"
  | "not-default-core"
  | "evidence-identity-mismatch"
  | "wrong-runtime"
  | "tool-surface-unknown"
  | "custom-factory"
  | "application-mediation-ambiguous"
  | "application-mediation-unverified"
  | "native-builtin-present"
  | "registry-mismatch"
  | "turn-mismatch"
  | "stopped"
  | "no-active-dispatch"
  | "input-not-accepted"
  | "turn-settled"
  | "creator-reports-mismatch"
  | "parent-kind-invalid";

export type DispatchParentDecision =
  | { ok: true }
  | { ok: false; reasons: readonly DispatchParentReason[] };

export function evaluateChiefDispatchParent(input: {
  host: DispatchParentHostFacts;
  core: DispatchParentCoreFacts | undefined;
  hub: boolean;
}): DispatchParentDecision;
```

### 5.2 运行时分支与证据接受

门控必须按 P1.6 §4.4/§5.3 的精确分支实现（P1 D-minimal 是同一 predicate 的种子；E2 切到本模块）：

1. `claude`/`pi`：只走受限应用中介路径；`status === "unknown"`、`nativeToolRegistry === "unknown"`、`applicationMediation.status === "verified"`、身份/注册表/工厂一致、`nativeBuiltinTools` 为空、active dispatch 工具名在 `appTools` 中。
2. `codex`：先走严格 native 路径（原条件 + `applicationMediation === undefined` 互斥 guard；严格路径对**任何** `applicationMediation !== undefined` 返回 `application-mediation-ambiguous`）；严格路径不成立且 native 事实存在/绑定时走受限路径；受限路径 `status === "observed" && applicationMediation.status === "verified"` → `application-mediation-ambiguous`，`observed + mediation unknown` → `tool-surface-unknown`。
3. `demo`：只走严格路径（现状）；不构造应用中介证据。
4. 其它 runtime：`wrong-runtime` 拒绝。
5. `host` 缺失时 `validParent` 保持旧行为（返回 true）；门只在此后调用。
6. 只接受**派发父门/controller resume**消费；写/发布/stable-write/run-stop 不读 `applicationMediation`（INV-2）。
7. `applicationMediation.nativeInstanceId`（P1-A Amendment-1）是 verified 必填字段；Codex 需与 `native.nativeInstanceId` 一致，claude/pi 与 `nativeLifecycle.instanceId` 同源。
8. reason 码仅用于测试/诊断；对外回执仍 `trunk-verify-failed` + 现有文案。

### 5.3 reason 码（闭集）

| reason | 含义/触发 |
| --- | --- |
| `evidence-missing` | `core` 不存在 |
| `disposed` | Core 会话已 disposed |
| `not-default-core` | 构造非 `default-core` |
| `evidence-identity-mismatch` | role/runtime/session/nativeInstanceId 等身份不一致 |
| `wrong-runtime` | runtime 不匹配或不在允许分支 |
| `tool-surface-unknown` | 严格路径 `status !== "observed"`；或受限路径 `status !== "unknown"` 且非歧义 |
| `custom-factory` | 严格路径：仅 `factoryProvenance === "custom-override"`；demo（`"demo"`）可通过严格路径。受限路径：`factoryProvenance !== "default-production"`（含 custom/demo） |
| `application-mediation-ambiguous` | 严格路径：`applicationMediation !== undefined`（任何 status，含 unknown）；受限路径：`status === "observed" && applicationMediation.status === "verified"`；`observed + mediation unknown` 归 `tool-surface-unknown` |
| `application-mediation-unverified` | mediation 缺失/`status` 非 verified/kind 不符/factory 不符/reasons 非空 |
| `native-builtin-present` | `nativeBuiltinTools` 非空 |
| `registry-mismatch` | appTools/foreign 不一致、`nativeToolRegistry` 非 unknown、active dispatch 工具不在 appTools |
| `turn-mismatch` | `lifecycle.turnId !== parent.turnId` |
| `stopped` | `stopRequested` |
| `no-active-dispatch` | 无 active `dispatch_task`/`ans_dispatch_task` |
| `input-not-accepted` | `parent.inputAccepted !== true` |
| `turn-settled` | `parent.settled !== false` |
| `creator-reports-mismatch` | handback provenance / creatorReports 不匹配 |
| `parent-kind-invalid` | `parent.kind` **已定义**且非 `"message"`（`undefined` 允许；creatorReports 分支优先，不走此条） |

> 该闭集与 P1 D-minimal 的字符串 reason 逐项一致；E1 gates 模块可把内部字符串收窄为本 union，行为不变。新增/改名走接口评审。

### 5.4 边界

- 门控模块只判定；不采集/不伪造证据；不 import 角色模块、Service、Provider、Pipeline。
- 门控模块的输入类型使用 Model 的 `RuntimeSessionToolSurfaceFacts`/`RuntimeSessionLifecycleFacts`；不得复制第二套证据字段。
- 门控模块的 public entry 只导出上述类型/函数与 reason 联合；不导出内部 helper。
- P1 D-minimal 的本地结构类型是 pre-freeze 种子；E2 切换时消费方改为 import 本模块类型，并删除重复本地类型（D9/E-A10）。P1 本地类型允许保留到 E2 前，但不得出现两套判定实现（D5）。

## 6. 写集/owner 映射（复述 H1，不新设）

| 角色/模块 | 精确写集（Section 1 摘要） | 测试写集 | owner |
| --- | --- | --- | --- |
| chief-code | `src/common/roles/chief/` | `test/roles/chief/` | chief-code |
| product-code | `src/common/roles/product/` | `test/roles/product/` | product-code |
| rapporteur-code | `src/common/roles/rapporteur/` | `test/roles/rapporteur/` | rapporteur-code |
| nominator-code | `src/common/roles/nominator/` | `test/roles/nominator/` | nominator-code |
| convener-code | `src/common/roles/convener/` | `test/roles/convener/` | convener-code |
| verifier-code | `src/common/roles/verifier/` | `test/roles/verifier/` | verifier-code |
| shared-code | `src/common/shared/`（既有维护/迁移）、`角色卡/shared-code/docs/architecture/shared-components.md`（迁入）、自身 docs | `test/项目管理/shared/`（路径保留、owner 移交） | shared-code |
| gates-code | `src/common/gates/`（greenfield） | `test/gates/`（含 module-graph 扫描） | gates-code |
| 现有引擎（run-role/trunk-runtime/session/apply-journal/desktop/适配器） | 原文件 | 原测试目录 | 现有 owner；新角色只读 |
| Model 契约类型 | `src/model/role.ts`（门禁引擎扩展）、`src/model/runtime.ts`（运行时核心） | 对应角色测试 | 原 Model owner |
| 契约文档/基线/冻结记录 | `docs/planning/`（策划）、`角色卡/测试/docs/change/`（测试）、`docs/scheduling/`（统筹） | — | 各自 owner |

- 写集零重叠；角色卡/边界/YAML/changelog 归人事；新角色只写自身模块/测试/docs。
- `src/common/roles/`、`src/common/gates/` 新共享根须经人事 H1（B-1～B-12）与闸门 2 授权；未授权前不得写。
- `test/项目管理/shared/` 历史名保留；改名另立变更。

## 7. 行为/测试基线

### 7.1 B0 冻结脏基线

- 文件：`角色卡/测试/docs/change/2026-11-07_runtime-gate-role-modularization-B0-baseline.md`（910 行 / 81484 bytes / `135535055abfe2e4b4f3c4c34d207618272b98fe5b5cfefc7b23e70cec483101`）。
- 全量：4,452 tests / 4,221 pass / **198 fail** / 1 cancelled / 32 skipped / 0 todo；6 个挂起文件；登记为**冻结脏基线**，不是绿色基线。
- 判定口径：新增确定性失败相对 B0 名单 = 0；新 skip = 0；旧失败原样保留、不修 checkpoint；B1 E3.1 按 B1 v1.1 补注。
- 差分 oracle 只能使用基线绿的文件；基线红文件不能直接当零差异 oracle，除非原 owner 修复或统筹接受为冻结差异。

### 7.2 22 条差分 fixture/oracle 清单（B0 §8 摘要）

| # | 文件 | 基线状态 |
| --- | --- | --- |
| 1 | `test/编排/trunk-runtime.test.ts` | 绿 |
| 2 | `test/编排/trunk-service.test.ts` | 1 红（applyStableSnapshot mini re-pin） |
| 3 | `test/编排/trunk-store.test.ts` | 绿 |
| 4 | `test/编排/fixtures/trunk-project.ts` | 夹具（非用例） |
| 5 | `test/编排/fixtures/version-change-service-fixture.ts` | 夹具（非用例） |
| 6 | `test/编排/direct-role-capabilities.test.ts` | 1 红（retained intent confirmation） |
| 7 | `test/编排/run-role-submit-capabilities.test.ts` | 绿 |
| 8 | `test/编排/governance-matrix-injection.test.ts` | 1 红（A5 一次性 CLI） |
| 9 | `test/门禁引擎/governance-matrix.test.ts` + `governance-matrix-service.test.ts` | 前者绿；后者 1 红 |
| 10 | `test/编排/dispatch-advisories.test.ts` | 绿 |
| 11 | `test/编排/trio-worker-report.test.ts` | 3 红（卡文本） |
| 12 | `test/桌面应用/star-routing.test.ts` | 7 红（探针，无 timeout） |
| 13 | `test/桌面应用/dispatch-fresh-enum.test.ts` | 绿（探针 0 红） |
| 14 | `test/桌面应用/chief-workflow.test.ts` | 13 红（12 清理期 ENOTEMPTY + 1 断言）+ post-test 泄漏 |
| 15 | `test/测试/governance-e2e-auto/i-full-chain.test.ts` | 2 红 |
| 16 | `test/测试/chat-handback-integration.test.ts` | 绿 |
| 17 | `test/测试/direct-role-capabilities-e2e.test.ts` + `direct-role-capabilities-driver.ts` | 1 红 |
| 18 | `test/测试/git-role-workflows-e2e.test.ts` + `git-role-workflows-driver.ts` | 绿（含 12 env-gated skip） |
| 19 | `test/runtime-core/trunk-contract.test.ts` | 1 红 |
| 20 | `test/测试/trunk-stable-write-integration.test.ts` + `version-change-integration.test.ts` | 2 + 9 红 |
| 21 | `test/测试/helpers.ts` | 夹具（非用例） |
| 22 | `test/编排/fixtures/op2-write-confirm-card.json` | 夹具（非用例） |

> 用途：E1 模块差分、E2 切换 gate、E3 终验；不得把红文件整体当零差异 oracle。门禁负例矩阵见 B1 §3.2 N1–N28 与 P1.6 §11.1。

### 7.3 契约测试与差分层

- 门禁引擎 E0 草案：`test/门禁引擎/role-module-contract.test.ts` 8/8 pass（类型级断言 + 最小构造桩 + 门面用例）；E0 冻结前保持绿。
- E1 六角色：每模块单测 + 与旧 `governance-roles.ts`/`run-role.ts`/`apply-journal.ts` 输出的差分（逐字段）；模块图扫描（单入口/零跨角色 import/无环）。
- E1 gates：P1 D-minimal 与 gates 模块的差分（同一 fixture 集合零差异）；门矩阵 P/N。
- E2：每单元旧/新双跑差分 + 回滚演练 + 切换 gate + 删除清单；共享/门控单一 owner。
- E3：B1 E3.1–E3.12、D1–D9、E-A1–E-A10。
- **E1 过渡期权威（评审记录）**：E2 切换前，旧引擎（`governance-roles.ts`/`run-role.ts`/`apply-journal.ts`）保持权威；新模块/差分的 oracle 是旧引擎；E1.6 可判性依赖此声明。E2 每单元切换后按 D9 删除旧实现。

## 8. 冻结记录输入

| 字段 | 值/要求 |
| --- | --- |
| 契约路径 | `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` |
| 版本 | E0.3（本文件）；E0.2 `798ce9ce…` 为已判可判基线；冻结后变更递增版本并走接口评审 |
| SHA-256 | 由统筹在冻结记录中按本文件写盘后原字节复算；本文件不自引用 |
| 冻结记录路径 | `docs/scheduling/2026-11-07_contract-freeze_runtime-gate-role-module.md`（团队计划 §7.3） |
| 评审参与方 | 运行时核心、编排、门禁引擎、Claude/Codex/Pi 适配器、测试、内置独立验收（可判性） |
| 消费者 | Pipeline（`trunk-runtime.ts`）、Service（`apply-journal.ts`/runtime session）、桌面窗口/UI（只读数据）、门禁引擎 `governance-roles.ts` 门面、六角色模块、shared-code、gates-code |
| 行为/测试基线 | B0 `13553505…` + 22 fixture 清单 + B1 E0/E1/E2/E3 证据计划 |
| 契约测试 | `test/门禁引擎/role-module-contract.test.ts` 8/8（E0 草案）；E1 各模块测试/差分 |
| 冻结/变更流程 | E0 评审通过 + B1 E0.1–E0.9 可判；冻结后变更走 §4.4 接口评审（无客户卡），更新冻结记录/消费者影响/测试 |

**B1 E0.1–E0.9 映射**：

| B1 条目 | 本契约位置 |
| --- | --- |
| E0.1 8 模块 public API/边界/消费者/owner/版本 | §3、§4、§5、§6 |
| E0.2 角色模块契约细化/纯策略 | §3.1、§3.3、§3.4 |
| E0.3 共享模块契约 | §4.1、§4.2、§4.3 |
| E0.4 门控模块契约 | §5.1–§5.4 |
| E0.5 错误语义 | §3.5、§5.3 |
| E0.6 依赖方向/无环 | §2、§10 |
| E0.7 写集/owner/共享根/迁移 | §4.1、§6 |
| E0.8 行为/测试基线与冻结记录 | §7、§8 |
| E0.9 E0 出口判据 | §8、§12 |

## 9. Pi `ANS_PI_SERVER_TOOLS` 政策与 `wrapSession`

### 9.1 `ANS_PI_SERVER_TOOLS`：**启用即 fail-closed**（E0 决定）

事实：`ANS_PI_SERVER_TOOLS` 默认关闭；启用时 `web_search`/`web_fetch` 作为**提供方服务端工具**由 Pi 扩展在 wire 声明，不是应用注册的 `customTools`，也未进入 `RuntimeApplicationToolSurfaceFacts` 的冻结字段；`web_fetch` 的网关支持/块形状未经探针确认（`server-tools.ts` 头部登记）。

**契约决定**：应用中介证据路径只证明“应用默认注册面 + 无额外 native/服务端工具通道”；启用 `ANS_PI_SERVER_TOOLS` 时无法证明这一点，因此**不得产生 `status:"observed"` 的应用中介事实，派发父门 fail-closed（拒绝）**。默认关闭时行为不变（可产生 observed）。

**实现口径（不新增 Model 字段）**：
- 首选：`serverToolConfig.enabled.length > 0` 时，Pi `bindRole` **不提供** `applicationToolSurface`（`inspectApplicationToolSurface` 缺席）；Service 包装层得到 unknown → 派发拒绝。诊断/日志记录 `pi-provider-server-tools-enabled-unverified`（仅诊断，不是 Model 字段）。
- 备选（若 E0 要求显式原因）：适配器内部 surface 可带 `status:"unknown"`/原因；映射到 `RuntimeApplicationToolSurfaceFacts.status:"unknown"` + `reasons:[...]`，仍不新增 Model 字段。**适配器不得自行发明新的公开事实字段**。
- 未来若要允许 server tools，须新增冻结字段/证据并另立契约版本（含正负例）；本 E0 不放开。
- 判断会话已强制关闭 server tools；不受本项影响。
- **证据边界（评审记录）**：E0 只有离线桩件；`ANS_PI_SERVER_TOOLS` 启用时真机派发拒绝未实测，B1/E2 只能按桩件+代码证据判，真机缺失时不得声称“真实运行已验证”。

### 9.2 `wrapSession` 可选方法转发（Pi legacy 路径）

- 现状：`src/provider/pi/session.ts::wrapSession` 转发 `nativeLifecycle` 等，但**未转发** `inspectApplicationToolSurface`（生产路径不经过该 legacy wrapper；legacy CLI/facade 会因此得不到应用面事实 → 派发 fail-closed）。
- **契约要求**：`wrapSession` 必须把内部会话的可选证据方法转发给外部，至少：
  ```ts
  inspectApplicationToolSurface: inner.inspectApplicationToolSurface?.bind(inner)
  ```
  或在 `inner` 存在该方法时条件展开；不得伪造/补造事实；`inner` 无该方法时保持缺失（fail-closed）。
- 影响：仅 legacy Pi facade；生产路径不变；转发后 legacy 与生产在应用面证据上一致；不新增权限/不改变门语义。
- 测试：`test/pi-adapter/` 桩件——inner 有/无 `inspectApplicationToolSurface` 两例，wrapper 分别转发/保持缺失；转发结果与 inner 原事实逐字段一致。

### 9.3 Pi 相关 delta 清单

| # | 文件 | delta | owner/阶段 |
| --- | --- | --- | --- |
| P-1 | `src/common/pi-adapter/real-adapter.ts` | `ANS_PI_SERVER_TOOLS` 非空时不提供 `applicationToolSurface`（或显式 unknown，按 E0 选择）；默认关闭行为不变 | Pi适配器 / P1-B 后续或 E1 前 |
| P-2 | `src/provider/pi/session.ts` | `wrapSession` 转发 `inspectApplicationToolSurface`（可选） | Pi适配器 / P1-B 后续或 E1 前 |
| P-3 | `test/pi-adapter/` | server tools 启用/关闭、wrapper 转发、既有 Pi 事实测试 | Pi适配器 |

## 10. 与门禁引擎 E0 草案的对齐与 delta

### 10.1 映射

| 门禁引擎草案 | 本契约 | 状态 |
| --- | --- | --- |
| `BuiltInRoleId` 六 id | §3.1 同 | 一致 |
| `GovernanceShellTier` | §3.1 同 | 一致 |
| `GovernanceCapabilities` 七字段 | §3.1 同 | 一致 |
| `RoleCardSpec`（text/entries/preauthorized/forbidden） | §3.1 同 | 一致 |
| `GovernanceRoleSpec`（id/displayName/function/card/capabilities/cards；不含 matrix/cardText） | §3.1 同 | 一致 |
| `GovernanceCardKind` type-only re-export | §3.1 同 | 一致 |
| `RolePolicyDecision` / `RolePolicyReason` | §3.1/§3.5 | 一致；本契约追加 details 约束 |
| `TrustedToolPolicyInput`（governanceModel） | §3.1 | 一致；Q2 复核是否需更多可信事实 |
| `RoleToolPolicy.tools: readonly string[]` | §3.1 收窄为 `RoleToolId[]` | **delta D1** |
| `RoleDispatchPolicyInput` / `RoleDispatchPolicy` | §3.1 同 | 一致 |
| `RoleGovernedAction` 十动作 | §3.1/§3.4 | 一致 |
| `RolePreflightInput.facts: Record<string, unknown>` | §3.1/§3.4 | 一致；本契约追加事实包规则 |
| `RoleContextResourceRef`/`RoleContextSection`/`RoleContextInput` | §3.1 | 一致；Q4 资源根语义 |
| `BuiltInRoleModule` | §3.1 | 一致 |
| 无 `BuiltInRoleModuleMap` | §3.1 新增 | **delta D2** |
| 契约测试 8/8 | §7.3 | 一致；E1 增模块测试 |

### 10.2 需要的精确 delta（交门禁引擎 owner，在 E0 冻结前）

1. **D1 `RoleToolId` 闭集（R-1，扩 14 id + 映射）**：在 `src/model/role.ts` 把 `RoleToolId` 扩为 §3.1 的 14 个 id，并增加 `RoleToolName`（snake_case）类型/映射（映射可由 Model 常量或引擎装配表承载，须单一来源）；`RoleToolPolicy.tools` 保持 `readonly RoleToolId[]`；引擎装配按 §3.1 表映射并校验“id 属于该角色允许集”，未知 id/越权 id fail-closed（不注入、不静默忽略）。新增 id 走接口评审。
2. **D2 `BuiltInRoleModuleMap` / 门面 lookup（R-2 相关非 blocking）**：E0 接受 `governance-roles.ts` 现有 `builtInRoleModuleDataOf(id)` 作为零复制门面 lookup；完整 `builtInRoleModules: BuiltInRoleModuleMap` 在 E1 六模块落地后由门面装配，E2 切换时删除内联规格。E0 冻结记录须写明该过渡方案与迁移清单。
3. **D3 `details` 约束**：`RolePolicyDecision.details`/`RolePolicyReason.details` 保持 `unknown` 类型不变，但在注释/契约中限定为 JSON 可序列化普通数据、无密钥/正文/模型原始输出；消费者只展示/审计，不据此放行。
4. **D4 事实包规则**：`RolePreflightInput.facts`/`RoleContextInput.facts` 保持 `Readonly<Record<string, unknown>>`；每个角色 `api-spec.md` 登记动作 fact 键；缺键/未知/类型不符 deny；不得把 Service 校验复制成第二实现。
5. **D5 资源根语义（Q4）**：`RoleContextResourceRef.path` 默认相对**应用资源根**（如 `chief-workflow.md`）；项目 `docs/workflow.md` 不是角色模块资源，由宿主在上下文装配时另行提供（来源/版本/hash 单列）。若 E0 要求统一根，建议后续版本增加 `root: "resource" | "project"`，本版不新增。
6. **D6 类型去重**：E2 时 `governance-roles.ts` 的私有 `GovernanceCapabilities`/规格数据必须改为 Model 公开投影的 re-export/装配，或加类型等价断言；不得长期两份定义。`matrix` 展示摘要留在门禁引擎，不进入 `BuiltInRoleModule`。
7. **D7 gates 输入类型**：`src/common/gates/index.ts` 使用 §5.1 类型；P1 D-minimal 的本地结构类型在 E2 切换时删除/别名；reason 闭集按 §5.3；`applicationMediation.nativeInstanceId` 必填（P1-A Amendment-1）纳入 accepted evidence。
8. **D8 卡片 legacy**：`cards` 只列当前有效卡种；旧 `"write"` 不进入模块数据；E2 门面按旧数据兼容映射，不把 legacy token 写进新模块。
9. **D9 无环扫描口径**：豁免 Model 内 type-only 边（`role.ts↔runtime.ts`、既有 `download.ts` 例外）；禁止 value import 反向/环；type-only 共享原语单列。此口径写入冻结记录与模块图扫描脚本。
10. **D10 capabilities 单一真源**：E1 接口评审前声明模块 spec 的 `capabilities` 为唯一真源，`tools()` 输出的 `capabilities` 为派生；加类型/测试约束（`Equal`/字段一致），不得两份不一致。

### 10.3 结论

门禁引擎草案的**主体形状与本契约一致**；上述 D1–D10 是 E0 冻结前需 owner 确认/落地的精确 delta，不改变 P1.6 语义、不放宽门禁/写权/客户主权。若 owner 不同意某项 delta，须在 E0 评审记录中写明替代与理由，并由统筹决定是否冻结。

## 11. E0 评审问题（Q1–Q13）

- **Q1 共享 public entry 形态**：`src/common/shared/` 保持既有 per-component public entry、不新增伞状 `index.ts`（本契约默认）；是否确认？（若需伞状入口，需证明不形成 god-module/第二事实源。）
- **Q2 `TrustedToolPolicyInput` 最小面**：仅 `governanceModel` 是否足够？若角色工具策略需要“客户通道/ shell 可用性/判断模式”等宿主事实，是新增可选可信字段（新契约版本）还是保持在注入层处理？本契约默认保持最小。
- **Q3 dispatch 范围**：`RoleDispatchPolicyInput` 四字段只做硬身份/存在性判定；hub/legacy/review 路由、convener run/module 规则与报告时点留引擎（R-2）；`reportToRoleId` 仅差分期望。是否确认？
- **Q4 资源根**：`RoleContextResourceRef.path` 默认应用资源根；项目 `docs/workflow.md` 由宿主另行提供；是否需要在本版增加 `root` 字段？默认不增。
- **Q5 `RoleToolId` 闭集**：R-1 已扩为 14 id + 映射；是否还有现有但未列的 role-specific tool id？由编排/运行时核心按 `run-role.ts`/`provider/runtime/tools.ts` 现状核对，门禁引擎负责类型/装配校验。
- **Q6 编排公开只读例外**：`handback.ts`/`workflow-preconditions.ts` 默认不迁移、保持编排 owner + 公开只读入口；确认？若 E0 要求迁移，按 X-S 单单元执行。
- **Q7 Pi server tools**：`ANS_PI_SERVER_TOOLS` 启用即 fail-closed，首选“不提供 applicationToolSurface”，是否确认？是否要求显式 unknown reason（仍不新增 Model 字段）？
- **Q8 `wrapSession` 转发**：确认 legacy Pi wrapper 必须转发 `inspectApplicationToolSurface`（可选）；生产路径不变。
- **Q9 gates 类型/所有权**：§5.1 类型放 `src/common/gates/index.ts`，P1 D-minimal 本地类型在 E2 删除/别名；确认？
- **Q10 `applicationMediation.nativeInstanceId`**：P1-A Amendment-1 的必填字段纳入 gate accepted evidence；确认？
- **Q11 Codex 限制**：Codex 外来 MCP fail-closed、WebSearch 默认 fail-closed、写/发布门 strict observed——仅为复述客户决定，不在 E0 重开；确认无异议？
- **Q12 共享组件目录迁移**：`角色卡/shared-code/docs/architecture/shared-components.md`（E1 单写者迁移）与 `test/项目管理/shared/` 历史名保留；确认？
- **Q13 动作事实键**：`RolePreflightInput.facts` 的每动作精确 schema 是否在 E0 冻结，还是按各角色 `api-spec.md` 登记 + 测试冻结？本契约默认后者。

### 11.1 E0.1 评审处置（E0.2）

**R-1–R-5 关闭**

| 编号 | 处置 | 位置 |
| --- | --- | --- |
| R-1 Q5 RoleToolId 不完整 | **采纳 (a)**：扩为 14 id + camelCase→snake_case 映射 + 允许角色表；未知/越权 fail-closed | §3.1、§10.2 D1 |
| R-2 dispatch 范围不清 | **采纳**：`dispatch()` 只做硬身份/存在性；hub/legacy/review/run/module/report 时点留引擎；`reportToRoleId` 仅差分期望 | §3.1 R-2、§3.4 |
| R-3 import 路径 | **采纳**：`../model/runtime.ts` → `../../model/runtime.ts` | §5.1 |
| R-4 reason 触发文字 | **采纳**：custom-factory / application-mediation-ambiguous / parent-kind-invalid 按 P1 实现精确化（不改行为） | §5.3、§5.2 |
| R-5 锚点漂移 | **采纳**：§0 更新当前 +254/−1、测试 399 行；E0.1 起草锚点保留为历史 | §0 |

**Q1–Q13 处置**

| Q | 处置 |
| --- | --- |
| Q1 共享 public entry | 确认：保持 per-component public entry，不新增伞状 `index.ts`（§4.2）。 |
| Q2 TrustedToolPolicyInput | 维持最小（仅 `governanceModel`）；宿主事实留在注入层（§3.1）。 |
| Q3 dispatch 范围 | 按 R-2 收窄为硬身份/存在性（§3.1）。 |
| Q4 资源根 | 默认应用资源根、本版不增 `root` 字段；loader owner/版本/hash 与 `RoleContextSection[]` 装配规则列入 E1 接口评审（§3.1、§10.2 D5）。 |
| Q5 RoleToolId | 按 R-1 扩 14 id + 映射；run-role 属编排，门禁引擎按编排/运行时核心清单核对（§3.1）。 |
| Q6 编排公开只读入口 | 确认不迁移；`handback.ts`/`workflow-preconditions.ts` 保持编排 owner + 公开只读入口（§4.3）。 |
| Q7 Pi server tools | 确认“启用即不提供应用面事实（fail-closed）”，不新增 Model 字段（§9.1；Pi P-1 已落）。 |
| Q8 wrapSession | 确认转发 `inspectApplicationToolSurface`；其他 Pi native 方法（`inspectNativeToolSurface`/`inspectLifecycle`/`stopAndInspect`）legacy 未转发不在本 E0 范围，Pi 适配器按需另走接口评审（§9.2）。 |
| Q9 gates 类型/所有权 | 确认 `src/common/gates/index.ts` 使用 §5.1 类型；P1 D-minimal 本地类型 E2 删除/别名（§5.4）。 |
| Q10 nativeInstanceId | 确认 P1-A Amendment-1 必填字段纳入 gate accepted evidence（§5.2）。 |
| Q11 客户可见限制 | 确认不重开；文字按三适配器建议澄清（§5.3、§9）。 |
| Q12 共享目录/测试历史名 | 确认 catalog 迁至 shared-code 目录（E1 单写者）；`test/项目管理/shared/` 历史名保留（§4.1）。 |
| Q13 动作事实键 | 默认按各角色 `api-spec.md` 登记 + 测试冻结，不在 E0 把 Service 事实形状复制进 Model/role.ts；E1 接口评审可细化（§3.4）。 |

**非 blocking 记录（写入冻结记录）**

1. **无环扫描口径**：豁免 Model 内 type-only 边（`role.ts↔runtime.ts`、既有 `download.ts` 例外）；冻结记录与扫描脚本明示“禁止 value import 反向/环；type-only 共享原语单列”。
2. **D2 门面过渡**：接受现有 `builtInRoleModuleDataOf(id)` 零复制 lookup 作为 E0 产物；完整 `builtInRoleModules` map 在 E1 六模块落地后装配，E2 删除内联规格（§10.2 D2）。
3. **`RoleToolPolicy.capabilities` 与 `GovernanceRoleSpec.capabilities` 双来源**：E1 接口评审前声明模块 spec 为唯一真源；`tools()` 输出仅作派生，加类型/测试约束（不得两份不一致）。
4. **E1 过渡期权威**：旧引擎在 E2 切换前为权威/oracle（§7.3）。
5. **chief-workflow/intent-confirm 迁移归属**：当前实现位于 `provider/runtime/tools.ts`/`run-role.ts`；E1 接口评审明确迁移边界/差分/删除单元（§3.2）。
6. **reason 闭集**：18 项与 P1-C 字符串层一致；R-4 后触发文字更可判；B1 N22 等按“拒绝”取证，不硬编码单一 reason（§5.3）。
7. **P1 本地类型/夹具**：E2 切 gates 时换完整 Model 类型并补测试夹具必填字段（§5.4、§10.2 D7）。
8. **Pi server tools 真机**：E0 仅离线桩件；启用时真机派发拒绝未实测，不得声称真实运行已验证（§9.1）。

## 12. 状态与下一步

- 本文件为 E0.3 契约草案；**未冻结**。下一步：统筹按 E0.3 引用与已判 E0.2 `798ce9ce…` 写冻结记录（路径/版本/sha256/评审人/消费者/测试证据），门禁引擎落 D1，随后 E1 派发。
- E0.3 相对 E0.2 仅文本修正（§8/§12 版本文字、Q3/Q13 编号、7/7→8/8 锚点），语义等价；E0.2 的已判可判性继续适用。
- 冻结前不得开始 E1；P1 实现/真实重跑按团队计划独立推进；本契约不修改 P1 实现、门禁引擎草案、B1、团队计划或 H1 卡/边界。
- 冻结后变更走 §4.4 接口评审（不引入客户卡）；共享/门 API/角色 public entry 变更须更新冻结记录与受影响证据。
