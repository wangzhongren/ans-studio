# B0：两条固定工作流路径 —— 门禁引擎批次实施记录（类型/契约）

- 日期：2026-11-10；角色：ans-studio 固定 worker「门禁引擎」（roleId: 门禁引擎；独立上下文）。
- 任务：T3「两条固定工作流路径」**B0 基础设施/账本**中**门禁引擎属主批次**——只立类型/契约，不做 fixed 业务实现。
- 方案依据（被冻结的实现依据）：`docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md`，1,392 行 / 184,391 bytes / SHA-256 `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8`；本批对应 §3.1（双矩阵）、§3.2（`DispatchMatrixMode`/`RoleDispatchPurpose`/`RoleDispatchPolicyInput.matrix|purpose` 精确改法）、§3.4（`context({matrix})`）、§4.1（`ProjectConfig.workflowSchema`）、§10.3（接口评审清单）。
- B1 验收依据：`docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md`，197 行 / SHA-256 `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb`；本批为 **AC-24 / EV-05 接口评审项**（`DispatchMatrixMode`/`RoleDispatchPurpose`/`RoleDispatchPolicyInput.matrix`/`context({matrix})`/`ProjectConfig.workflowSchema`）的 B0 类型落地与 T-17/T-18/T-19 自检证据；AC-01/AC-04/AC-05/AC-12 的 fixed 谓词/业务行为**不在本批**（编排 B1 / 运行时核心 B0 并行）。
- 代码锚点（HEAD）：`src/model/role.ts` `ProjectConfig`:77、`RoleDispatchPolicyInput`:296、`RoleDispatchPolicy`:308、`RoleContextInput`:370、`BuiltInRoleModule`:388；`src/common/门禁引擎/role-tool-registry.ts`；`src/common/gates/index.ts`（**本批不改**，fixed 父门替代证据属编排 B1）。
- 工作目录：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/two-fixed-workflow-paths`；HEAD `ad22192197b28f401de8e1d22669b577ef4833e0`（代码基线 `10f90c7`）。开工时 `git status --porcelain | grep -v '^??'` = **空**（仅既有未跟踪产物）。Node **v24.22.1**。
- 状态：**B0 门禁类型批已实施；定向 24/24 通过；隔离 A/B（纯净 HEAD vs HEAD+本批）失败名称集合 IDENTICAL、新增确定性失败 0、新 skip 0；隔离 typecheck exit 0；未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223。**

## 1. 范围（严格写集）

| 文件 | 改动 | 方案/B1 条目 |
| --- | --- | --- |
| `src/model/role.ts`（M，+38/−0；25,261 bytes） | ① 新增 `DispatchMatrixMode`（`"legacy-v1" \| "two-fixed-paths/v1"`）；② 新增 `RoleDispatchPurpose`（`"production" \| "stage-request" \| "review" \| "preparation"`）；③ `RoleDispatchPolicyInput` 增可选 `matrix?`/`purpose?`（缺省 `legacy-v1`/`production`）；④ `RoleContextInput` 增可选 `matrix?`（缺省 `legacy-v1`）；⑤ `ProjectConfig` 增可选 `workflowSchema?: "two-fixed-paths/v1" \| "legacy/v1"`。全部注释声明**纯策略输入/配置数据，不授权限** | v1.3 §3.1/§3.2/§3.4/§4.1；B1 AC-24/EV-05 |
| `test/门禁引擎/role-module-contract.test.ts`（M，+21/−0；44,202 bytes） | 契约 oracle 同步：`_DispatchInputFacts` 精确 shape 增加 `matrix?`/`purpose?`；新增 `_DispatchMatrixModeSet`/`_RoleDispatchPurposeSet`/`_ContextInputFacts` 编译期断言；import 增 `DispatchMatrixMode`/`RoleDispatchPurpose` | v1.3 §3.2/§3.4；B1 T-13 |
| `test/门禁引擎/dispatch-matrix-mode.test.ts`（新，145 行 / 8,980 bytes） | B0 专项：闭集/可选性编译期断言；缺省 vs 显式 legacy 的六模块 × 代表性派发事实/两治理模型 context **等价**；`ProjectConfig.workflowSchema` 两值接受、词汇混用/`null`/大小写变体拒绝（`@ts-expect-error`） | B1 AC-24/EV-05；T-17/T-18 |
| 本记录 + `2026-11-10_B0_two-fixed-workflow-paths-evidence/` | 实施记录与证据（before/after TAP、失败名集合、typecheck、候选指纹） | BASE-4/EV-02 |

**未改**（任务写集与角色边界）：`src/model/runtime.ts`（运行时核心并行）、`src/common/编排/**`、`src/common/shared/**`（shared-code 并行）、`src/common/roles/**`、`src/common/gates/**`、`src/common/门禁引擎/**`（本角色目录内亦零改动：`git status --porcelain -- src/common/gates src/common/门禁引擎` 为空）、`app/**`、`test/门禁引擎` 以外测试、其它角色/文档；不改 B1/方案文档；不新增依赖；不新增/修改 gates reason 码。

## 2. 实现要点（`src/model/role.ts`）

### 2.1 `DispatchMatrixMode` / `RoleDispatchPurpose`（v1.3 §3.2 逐字）

```ts
export type DispatchMatrixMode = "legacy-v1" | "two-fixed-paths/v1";
export type RoleDispatchPurpose = "production" | "stage-request" | "review" | "preparation";
```

- 闭集逐字对齐 v1.3 §3.2（`RoleDispatchPurpose` 顺序亦按方案：production → stage-request → review → preparation）。
- 注释明确：`matrix` 是**矩阵选择器**、`purpose` 是**判据输入**，均不授权任何派发；fixed 谓词由编排 B1 实现、fixed 段数据由角色模块 B2 新增。

### 2.2 `RoleDispatchPolicyInput`（+2 可选字段）

```ts
readonly matrix?: DispatchMatrixMode;   // 缺省 "legacy-v1"：旧调用点不传即旧行为（逐字兼容）
readonly purpose?: RoleDispatchPurpose; // 缺省 "production"
```

- 旧调用点（`test/roles/**` 差分/模块测试的既有字面量）**不传**新字段仍通过类型检查；缺省语义由消费方判（B1/B2），本批不改任何模块实现。

### 2.3 `RoleContextInput`（+1 可选字段）

```ts
readonly matrix?: DispatchMatrixMode;   // 缺省 "legacy-v1"：未传时模块返回 legacy 段，现有返回值不变
```

- `BuiltInRoleModule.context(input: RoleContextInput)` 签名形状不变（入参可选字段扩展，向后兼容）；六模块现有 `context()` 返回值逐字不变（见 §3 等价断言）。

### 2.4 `ProjectConfig.workflowSchema`（v1.3 §4.1）

```ts
workflowSchema?: "two-fixed-paths/v1" | "legacy/v1";
```

- 语义按 v1.3 §4.1：**只作默认/强制值**（`"legacy/v1"` 全项目强制 legacy；`"two-fixed-paths/v1"` 新 flow 默认 fixed；缺省按 per-flow 判定）；实际模式由 `workflowMode(projectRoot, flowId)` 按 flow 解析（MF-5），不是项目级单值缓存。门禁引擎只读消费、不写 `.ans`；载入/原子写回属 shared-code 与应用侧（并行批次）。
- 不新增其它字段、不改任何既有字段/缺省行为；不引入第三个值（`null` 类型拒绝）。

## 3. 测试与验证

### 3.1 隔离 A/B（纯净 HEAD vs HEAD+本批；排除并行 B0 干扰）

方法：`git worktree add --detach ad22192` 得纯净工作树（10248 个 tracked 文件、无并行改动/无未跟踪产物），先跑基线；再**仅覆盖本批 3 个文件**重跑；随后 `git worktree remove --force` 清理。命令入口 `node --test --test-concurrency=1 "test/门禁引擎/**/*.test.ts"`。

| 运行 | tests | pass | fail | skipped | typecheck |
| --- | --- | --- | --- | --- | --- |
| before（纯净 HEAD `ad22192`） | 479 | 472 | 6 | 1 | exit 0（绿） |
| after（HEAD + 本批 3 文件） | 483（+4＝新用例） | 476（+4） | 6 | 1 | exit 0（绿） |

- **失败名称集合 diff = IDENTICAL**（0 新增确定性失败、0 新 skip；`skipped 1` 为既有 `unreadable（权限）… # SKIP`）。
- HEAD 既有 6 红（**非本批引入**，B1 §二 known-red 清单未列，建议 B2 纳入基线）：`Chief资源正文独立且卡只声明真实注入来源，两套workflow分开`；`D-10：质检卡保留可选质量核对与截图上限，不要求录屏`；`listProject：实际已接受的四份运行时组卡返回组别，15 个活项目角色和归档约定保留`；`listProject：枚举真实项目（本仓库）全部角色，边界均解析成功且无警告`；`卡文本：运营负责落盘工作流，幕僚不再被暗示为写者`；`渲染过滤：section=roles/routing 与注册表展示字段出现在文本中`。
- 证据：`_evidence/before-gate-engine.tap`、`_evidence/after-gate-engine.tap`、`_evidence/before-fail-names.txt`、`_evidence/after-fail-names.txt`、`_evidence/before-typecheck.txt`、`_evidence/after-typecheck.txt`。

### 3.2 共享工作树现行状态（含其它角色 B0 并行改动，如实记录）

- `node --test test/门禁引擎/dispatch-matrix-mode.test.ts test/门禁引擎/role-module-contract.test.ts`：**24/24 通过**（本批 4 + 契约 20）；`role-module-contract.test.ts` 单跑 **20/20**。
- `node --test "test/roles/**/*.test.ts"`（governance-roles 模块面回归，含六角色差分）：**226/226 通过**。
- 全量 `test/门禁引擎/**`：483 tests / 477 pass / 5 fail / 1 skip——5 红全部属于 §3.1 的 HEAD 既有集合；`Chief资源正文独立…` 在共享树因并行改动由红转绿（并行侧效应，非本批；须由 B2 统一复测口径）。
- `npm run typecheck`（共享树）：**3 个跨文件错误，均在写集外**——`src/pipeline/orchestration/run-role.ts(3234,7) TS2322`（`GovernanceCardKind` 新增 `"merge-main"` 后编排卡标题表尚未同步，编排 owner 待办）；`test/runtime-core/two-fixed-workflow-paths-b0.test.ts(175,58)/(181,58) TS2353`（`RoleActivatedEvent`/`WorkflowClosedEvent` 尚无 `stage`，运行时核心并行在飞）。**隔离 A/B 证明本批自身 typecheck 前后均 exit 0**。
- 观察：共享树中 `src/model/runtime.ts` 曾在并行编辑中途短暂出现悬挂接口片段（`DispatchReceipt` 成员无宿主），导致导入链上的测试瞬时大面积失败；随后并行 owner 原地修复，非本批造成。

### 3.3 测试设计说明

- 契约 oracle（`role-module-contract.test.ts`）按接口评审变更**同步 shape**（`matrix?`/`purpose?`），不是回归——闭集值仍由 `@ts-expect-error` 与 `Equal` 双重钉死。
- 新文件的运行时断言只比较「**缺省 ≡ 显式 legacy-v1/production**」，不断言具体允许/拒绝或 fixed 行为：该不变量在 B2 添加 fixed 分支后**仍须成立**（legacy 逐字冻结，AC-03），不锁死 B0 尚未实现的 fixed 语义。
- `ProjectConfig.workflowSchema` 无既有校验器（本仓库当前无该字段解析）；测试以类型层接受/拒绝为主 + 纯数据构造断言（缺省不乱写默认值、对象形状不变）。shared-code 并行批已在 `config-loader.ts` 以 `NonNullable<ProjectConfig["workflowSchema"]>` 引用本字段为单一值域来源（只读核对，未改其文件）。

## 4. 候选身份（本角色写集）

| 文件 | 状态 | 行 | bytes | SHA-256 |
| --- | --- | --- | --- | --- |
| `src/model/role.ts` | M（+38/−0） | 447（原 409） | 25,261（原 21,989） | `ea01d09387e26f889f15116933cb41a0b5244a3a906c5b2b1ce74b914538f195` |
| `test/门禁引擎/role-module-contract.test.ts` | M（+21/−0） | 864（原 843） | 44,202 | `566eea7c79d7de4fb270aa7fb95f6b265fcec607ae9c50f04d54e27411b01f43` |
| `test/门禁引擎/dispatch-matrix-mode.test.ts` | 新 | 145 | 8,980 | `0a08bcad2484ca8c06f234fc42f9a0b277e3b89bb531171a095c0c74c07ac0c4` |

- 变更前 `role.ts`：409 行 / 21,989 bytes / `d5e550a06514b8a61fc66b517a267343ba95d8aa29050eb6ee3c7b7f9b5f8780`（写盘实测）。
- 证据：`_evidence/candidates.txt`。

## 5. 写集外与并行基线

- 会话开工基线（tracked）：`git status --porcelain | grep -v '^??'` = 空。开工后其它角色 B0 批次在本共享 worktree 并行落盘（**非本角色改动**）：`src/common/shared/config-loader.ts`（shared-code：workflowSchema 载入/校验）、`src/model/runtime.ts` / `src/provider/runtime/schema.ts` / `src/provider/runtime/tools.ts`（运行时核心：workflow/basis/release 类型、dispatch_task 字段、taskKind）、`test/runtime-core/stable-write-card-kind.test.ts`、`test/项目管理/shared/config-loader.test.ts`。本角色 authored diff 恰为写集 3 文件 + 本记录/证据。
- 需求外溢（停止报告）：无「必须由门禁引擎改而写集未授权」的事项。fixed 谓词/父门替代证据（编排 B1）、fixedCards/fixedTargetRoleIds/`isConvenerFixedBuiltInDispatchTarget`（B2）、gates reason 扩展（默认不做）、`classify-shell` v5（B4）、`requestReleaseMerge`（G-IR 后）均按任务边界未做。

## 6. 限制与未完成

- 本批**不含** fixed 业务实现：`evaluateFixedPathDispatchAuthorization`、`routeFixedPathDispatch`、stage-request 处理、`workflowMode` per-flow 判定、账本/投影均属编排/应用并行批次；`RoleDispatchPurpose` 值目前仅作类型可用，无消费者分支。
- `ProjectConfig.workflowSchema` 由 shared-code/应用消费；门禁引擎自身不读不写（只读消费口径已按 v1.3 §4.1 注释）。
- gates/`role-tool-registry.ts`/角色模块均未改；角色模块按 matrix 分支（B2）后，§3.3 的「缺省 ≡ legacy」断言应继续保持通过。
- 共享树 3 个跨文件 typecheck 错误与 §3.2 并行改动归其它角色/后续批次收口，本批未改他人文件。
- 未验收（B2 独立验收执行）；未运行真实模型/Electron；未占用 9222/9223。

## 7. 未提交声明

本批所有写入（`src/model/role.ts`、`test/门禁引擎/role-module-contract.test.ts`、`test/门禁引擎/dispatch-matrix-mode.test.ts`、本记录与 `_evidence/`）仅存在于工作树，**未 commit / 未 push / 未 merge / 未 tag / 未发布**。
