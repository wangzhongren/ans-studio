# app-dispatch/v1 第一步：门禁文本 / 角色固定上下文 / 契约面（2026-11-17）

- 角色：ANS「门禁引擎」（roleId: 门禁引擎）
- 工作树：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\feat-app-dispatch-builtins`（分支 `feat/app-dispatch-builtins`，HEAD `caf0acf` = 设计记录提交；Node v24.22.1，Windows 11；本工作树与在飞「编排/模型批」共用，未 commit/push）
- 权威依据：`docs/planning/2026-11-17_design_app-dispatch-builtins.md`（§二/§三/§5/§6/§七/§9；Q1–Q10 裁定）
- 范围：本批只改**门禁文本 / 角色模块 / 契约面**：
  - 新增 `src/common/门禁引擎/workflows/chief/chief-workflow-v3.md`（app-dispatch/v1 专用；v2 逐字保留给在飞 fixed-v2.1）；
  - `src/common/门禁引擎/governance-roles.ts` fixed 只读矩阵摘要（六角色）；
  - `src/common/roles/**` 六角色 fixed 上下文与两个 fixed 目标集清零；
  - 契约面 `src/common/门禁引擎/role-tool-registry.ts`（`selectWorkflow`/`select_workflow`）、`src/provider/runtime/schema.ts`（`select_workflow` 工具 schema）、`src/model/role.ts`（**仅** RoleToolId/RoleToolName 闭集与两处字段注释同步）；
  - 本记录。
- 未改：`app/desktop/**`（含 `session/evidence.ts` 的 fixed contract_check 文案——桌面批负责，改动点见 §5）、`test/**`、`src/common/编排/**`、`src/pipeline/orchestration/**`、`release.yml`/policy、角色卡/边界；未 commit/push/CI/tag/main；未读 `.env`；未占端口。

## 0. 摘要

1. 新增 v3 资源：版本行 `chief-workflow/v3` 恰一处、26,171 字节（≤256 KiB）、无 BOM/NUL、身份行 `# Chief 工作流…`；v1/v2 字节未动（`git hash-object`：v1 `53d7167…`、v2 `d528c6c…`，与 HEAD 逐字一致）。
2. 六角色 fixed 上下文按「应用建内置任务 / 运营只派 worker / 幕僚只选流程+按 prompt 呈卡」改写；B9.1/B13.2/B14/B23/B27/B28/B31/B32 安全段除「谁建任务/谁派发」来源措辞外逐字保留。
3. `CHIEF_FIXED_TARGET_ROLE_IDS` / `CONVENER_FIXED_ALLOWED_BUILT_IN_ROLE_IDS` **按设计清零为空数组**（消费方 fail-closed；legacy `CHIEF_HUB_DISPATCH` / `CONVENER_WORKER_DISPATCH_TARGETS` 逐字不变）。
4. 契约面新增 `select_workflow`（RoleToolId + 装配表 + schema；仅 chief；实际 handler 与注入开关由桌面批接线，legacy `CHIEF_TOOL_IDS` 保持冻结未加）。
5. 验证：v2 资源测试 3/3 通过；四个指定测试文件的失败**全部**为预期中的旧口径断言（清单与意外回归区分见 §6）；`npm run typecheck` 仅剩两类预期错误（在飞编排批的 `from:"application"` 桌面消费点 + 契约测试 14 项类型钉）。

## 1. v3 与 v2 差异表（`chief-workflow-v3.md` vs `chief-workflow-v2.md`）

| 维度 | v2（fixed-v2.1，逐字保留） | v3（app-dispatch/v1，本批新增） |
| --- | --- | --- |
| 适用协议 | `fixed-v2.1`（在飞 workflow 继续使用直至关闭，Q10 不迁移） | `protocol:"app-dispatch/v1"`（`workflow.started` 钉死） |
| 首个流程动作 | 首个 advance `stage-request` 给 convener（同次 dispatch_task 给全字段） | `select_workflow`（`workflowPath:"A"\|"B"` + `flowId`，可选 `acceptanceStrength:"light"\|"standard"`） |
| 内置任务创建者 | convener 派 product/rapporteur/nominator；chief 直派 verifier | **应用**按流程定义创建 `stage-execution`（A1/A2/A4/A5/A7/A8/A9/A12a/A12b）/`worker-dispatch`/`card-prompt` |
| 幕僚动作面 | stage-request、直派验收、收口、停止 | 只选流程 + 按 `card-prompt` 呈三卡 + 呈 `merge-main`；不派发/不收口/不重派/不停止/不直派验收 |
| worker 派发 | convener 派项目角色（绑定 chief open stage-request，`stage-request-required`） | convener 只派项目 worker（绑定应用 open `worker-dispatch` 任务，`worker-dispatch-required`；派内置 ⇒ `convener-builtin-dispatch-forbidden`） |
| A12 验收派发 | 幕僚直派（verifier / reviewRoleId） | 应用直派（`stage-execution`；与运营生产派发独立）；强度 = 定义参数 |
| 客户卡开卡者 | 幕僚自行发起 `request_choice` | 应用创建 `request.created` + `card-prompt`；幕僚按 prompt 逐项一致呈卡（`card-prompt-mismatch`） |
| B2 范围决定 | 幕僚决定；B1 后直接发 B3 advance，应用受理时记录 `change.scope-decided`（`b2-stage-request-forbidden` 防死锁，B34） | 应用在 B1 完成后**确定性派生**（报告 ∩ 名单模块属主 ∩ 角色边界）；歧义 `b-change-scope-invalid`；无 B2 请求、无死锁类 |
| A13/B4 交付 | 运营汇总 → 幕僚向客户交付/发布 | 运营汇总（应用建任务）→ 应用构造 `merge-main` 卡 → 客户本人 → 应用合并 |
| 停止/重试 | 幕僚收口 open 请求 + `workflowAction:"stop"` stage-request | 客户/应用命令；应用停投递/收口任务/运营停稳证据；`workflow.stop-unconfirmed` |
| 稳定码 | `stage-request-invalid` / `stage-request-required` / `convener-to-verifier-forbidden` 等 | `chief-dispatch-removed` / `convener-builtin-dispatch-forbidden` / `worker-dispatch-required` / `card-prompt-mismatch` / `workflow-definition-unknown` / `workflow-definition-version-unsupported` / `workflow-protocol-mismatch` / `workflow-corrupt` |
| 不变 | 三卡 + merge-main、judge 代批（`decision` 组）、append-only 审计、失败 fail-closed、基线 3 件小事、Git 普通用法、B13.2/B14/B23/B24/B27/B28/B31/B32 语义 | 同左，逐字保留 |

- v3 正文含「两条固定路径 / select_workflow / 阶段与任务来源表 / 三卡 / A12 / 路径 B / 基线 3 件小事 / Git 普通用法 / 任务文本与哈希口径 / merge-main / 停止失败审计 / contract_check / 请示与真实委托」全部段落；版本行正则与既有 loader 约束一致（`^资源版本：(chief-workflow/v[1-9][0-9]*)\r?$`）。
- 资源事实：v3 `sha256=f5cc4acd08cf7f7229683911b3b3a7e6aec4f060e5d04c4d372f917ac2086e79`、`bytes=26171`、`git hash-object=1aad6d7972d61436ce60a35d2a87254961bba74a`（工作树 CRLF、无 BOM/NUL）。

## 2. 角色上下文 / fixed 矩阵摘要改动

### 2.1 `governance-roles.ts`

- `BUILT_IN_ROLE_MATRIX_FIXED` 六角色摘要按新分工改写：chief＝唯一客户入口 + `select_workflow` + 按 `card-prompt` 呈三卡（无派发目标，`chief-dispatch-removed`）；product/rapporteur/nominator＝任务由应用创建（`from:"application"`）、报告回应用；convener＝只派项目 worker（绑定 `worker-dispatch` 任务，`worker-dispatch-required`；不派内置，`convener-builtin-dispatch-forbidden`）；verifier＝A12 应用直派。
- **legacy `BUILT_IN_ROLE_MATRIX` 逐字未动**（仅改上方 fixed 表与注释；`specOf` 不读 fixed 表）。

### 2.2 `src/common/roles/**`

| 文件 | 改动 |
| --- | --- |
| `chief/internal/context.ts` | fixed 4 段保留 id/顺序：`chief-fixed-path-dispatch` 改为 `select_workflow` + 应用驱动 + 禁幕僚派发/收口/重派/停止/直派验收；`chief-fixed-cards` 改为应用开卡+`card-prompt` 逐项一致（`card-prompt-mismatch`），三卡不合并/merge-main 客户本人保留；`chief-fixed-review` 改为 A12 应用直派、强度=定义参数、轻量披露；`chief-fixed-decision` 逐字保留。legacy `SECTIONS`（v1 资源引用）逐字未动 |
| `chief/internal/spec.ts` | `CHIEF_FIXED_TARGET_ROLE_IDS` **清零 `[]`**（注释记录 v2.1 历史值与 Q10 不迁移）；`CHIEF_FIXED_CARDS`（三卡）与 legacy `CHIEF_HUB_DISPATCH`（五内置）未动 |
| `convener/index.ts` | `CONVENER_FIXED_ALLOWED_BUILT_IN_ROLE_IDS` **清零 `[]`**、`isConvenerFixedBuiltInDispatchTarget` 恒 false；fixed `convener-fixed-production-line` 改为「只派项目 worker、绑定应用 `worker-dispatch` 任务、不派内置/不派验收」；`convener-fixed-report` 报告对象改为应用（`task.reported` 观察后收口）；**`convener-fixed-evidence` / `convener-fixed-card-budget` / `convener-fixed-baseline` 逐字保留**（B9.1/B23/B13.2/B31 卡预算口径）；production 段内 B27/B28/B14 句逐字保留、B32 仅将「convener 为 stage-request 会话」改为「你按应用发放的 worker-dispatch 任务派 worker」（来源措辞） |
| `product/internal/context.ts` | fixed 段：任务来源=应用（`stage-execution`）、报告回应用；hash/B13.2 证据纪律段保留；卡由应用开卡、幕僚按 prompt 呈 |
| `rapporteur/internal/context.ts` | fixed 段：A4/A5 由应用创建、B1 契约/结构缺口由应用按定义直派；方案卡由应用开卡、幕僚按 prompt 呈；报告回应用（应用观察 `task.reported` 后收口）；版本化/requirement-change 纪律保留 |
| `nominator/index.ts` | fixed 段：A7/A8 由应用创建、报告回应用；任命卡由应用开卡、幕僚按 prompt 在 A10 呈；`activate_role_documents` v2 激活纪律逐字保留 |
| `verifier/index.ts` | fixed 段：A12a/A12b **应用直派**（与运营生产派发独立）、报告回应用；强度=定义参数；`docs/acceptance` 归档由应用生成、结论按定义策略（幕僚决策→定义策略/应用）；证据纯路径段逐字保留 |

- 六角色 legacy `card.text` / `cards` / `capabilities` 与 `dispatch()` 纯策略均未改（legacy 测试继续通过；fixed 目标集只经 `fixedTargetRoleIds`/`fixedAllowedBuiltInRoleIds` 消费）。

## 3. 契约面改动

| 文件 | 改动 |
| --- | --- |
| `src/common/门禁引擎/role-tool-registry.ts` | `ROLE_TOOL_CATALOG` 追加第 15 项 `catalogEntry("selectWorkflow","select_workflow",["chief"])`；头部注释与表注释同步 15 项（14 legacy + 1 app-dispatch/v1）。允许集校验语义不变（未知/越权/重复仍整单 fail-closed） |
| `src/model/role.ts` | **仅类型闭集同步**：`RoleToolId` 增 `"selectWorkflow"`、`RoleToolName` 增 `"select_workflow"`（14→15 计数注释同步）；`BuiltInRoleModule.fixedTargetRoleIds`/`fixedAllowedBuiltInRoleIds` 字段注释更新为「清零 + v2.1 历史值」。**本批未触碰 runtime.ts/project-state.ts/trunk.ts**（在飞编排批改动保持原样） |
| `src/provider/runtime/schema.ts` | `describeTool` 新增 `select_workflow` 分支：`workflowPath`（enum A/B，必填）、`flowId`（`GOVERNANCE_SLUG_PATTERN`，必填）、`acceptanceStrength`（enum `light`/`standard`，可选；值域来自 `model/runtime.ts::WORKFLOW_ACCEPTANCE_STRENGTHS`）；`executionMode:"sequential"`；描述明示「只选流程、不派发、不授权」，拒绝码如实报告。**旧 `dispatch_task` schema 逐字保留**（兼容；`test/pi-adapter/dispatch-task.test.ts` 11/11 通过） |

### 3.1 范围说明（需要协调方知悉）

- 任务 item 4 要求「新 RoleToolId；同步闭集计数/相关类型」，而 `RoleToolId`/`RoleToolName` 闭集定义在 `src/model/role.ts`；为让装配表条目通过类型检查，本批对 `src/model/role.ts` 做了**最小类型闭集同步（4 处 union/注释）**，未触碰任何行为/其它 model 文件。若协调方决定该文件归编排/模型批，请把本批这段 union 变更转交；除此之外本批未越过既定文件边界。

## 4. 保留的逐字段落清单

- 资源：`chief-workflow-v2.md`（`d528c6c…`）与 legacy `chief-workflow.md`（`53d7167…`）字节逐字不变，仍分别服务 fixed-v2.1 在飞协议与 legacy 会话。
- 矩阵：legacy `BUILT_IN_ROLE_MATRIX` 六项逐字；legacy `CHIEF_HUB_DISPATCH`（五内置、routing/source/report/purpose/schema）与 `CONVENER_WORKER_DISPATCH_TARGETS`（`["verifier"]`、workerTargetKind/reportToRoleId）逐字。
- 卡文本：chief/product/rapporteur/nominator/convener/verifier 六角色 legacy `card.text` 逐字（未动 `card-text.ts`/各 index 的 legacy 卡常量）。
- convener fixed 安全段：`convener-fixed-evidence`（B9.1 证据三要素、应用算 hash、B23 `project_state [versions]`/`versions.jsonl` 来源与自身 shell 禁令、B13.2 `evidence[]` 纯路径）逐字；`convener-fixed-card-budget`（B9.1 三卡+merge-main、不诱导额外审批卡）逐字；`convener-fixed-baseline`（团队计划 v4、基线 3 件小事、`baseline-*` fail-closed）逐字；production 段 B27（静态自检、禁自测脚本）、B28（禁 shell/mkdir、write_file 自动建目录）、B14（禁环境探测）整句逐字；B32 提交语法/返工只纠语法/不得代提交语义逐字（仅来源从句改为 worker-dispatch）。
- product fixed：hash 唯一来源=应用、不得 shell 算 hash、`evidence[]` 纯路径段逐字（仅任务来源/报告对象从句改为应用）。
- verifier fixed：A12a/A12b 内容、review 角色模块绑定、禁 shell、证据纯路径、只认指定 OID/冻结 criteria 段逐字（仅派发者/收口者从句改为应用）。
- v3 内 B 系列语义：B13.2（证据纯路径）、B14（禁环境探测）、B23（哈希取应用记录）、B24（A3 前意图入口一致）、B27/B28（实现/review 禁 shell）、B31（轻量验收 + 归档证据 + note 审计 + 交付披露）、B32（提交引号/返工只纠语法/不代提交）、B34（B2 无请求死锁，新协议由应用派生根除）语义保留，措辞随驱动者调整。

## 5. stable codes 与待对齐项

### 5.1 stable codes（与代码核对）

| 码 | v3 使用处 | 代码现状（2026-11-17 工作树核对） |
| --- | --- | --- |
| `chief-dispatch-removed` | 幕僚任何派发/越权 | 已由在飞编排批 `src/common/编排/workflow-dispatch.ts`（`APP_DISPATCH_FAILURE_CODES` + `evaluateAppDispatchAuthorization`）实现，名称一致 |
| `convener-builtin-dispatch-forbidden` | 运营派任何内置 | 同上，已实现 |
| `worker-dispatch-required` | 运营派 worker 未绑定 open `worker-dispatch` 任务 | 同上，已实现 |
| `card-prompt-mismatch` | 呈卡与 prompt 不一致 | 同上（`APP_DISPATCH_FAILURE_CODES`）已定义；prompt 逐项校验 handler 由桌面批接线 |
| `stage-request-removed` | app-dispatch/v1 下旧 stage-request（advance/stop/重放）入口已移除（旧 fixed-v2.1/legacy 不受影响） | 已由编排批实现：`workflow-dispatch.ts:48`（`APP_DISPATCH_FAILURE_CODES`）+ `workflow-service.ts:858`（requestStage 反向驱动守卫，任何账本/任务写入前 fail-closed）；2026-11-20 收尾同步核对一致 |
| `workflow-definition-unknown` / `workflow-definition-version-unsupported` | select_workflow 拒绝 | `workflow-definitions.ts` 已实现（在飞编排批） |
| `workflow-protocol-mismatch` / `workflow-corrupt` | 协议/账本一致性 | `APP_DISPATCH_FAILURE_CODES` 已定义 |
| `b-change-scope-invalid` / `b-repository-required` / `stage-transition-invalid` / `workflow-stop-unconfirmed` | 路径 B/停止 | 沿用既有码（v2.1 已存在） |

> 2026-11-20 收尾同步：按协调消息，v3「新协议稳定码」段已补充 `stage-request-removed`（含义与上表服务实现一致）；仅改 v3 文本与本记录，未改其它文件/测试。

### 5.2 待其它批对齐（本批未改）

1. **桌面批 `app/desktop/session/evidence.ts` fixed contract_check**（按要求未改；需要改的点）：
   - `:620` `"run：fixed（无 run；固定路径由 stage-request 驱动）"` → 新协议应显示「应用流程驱动（select_workflow 启动）」；
   - `:665-670` `taskKind dispatch` 必填项段（stage-request/workflowAction/stage）→ 追加 `stage-execution` / `worker-dispatch` / `card-prompt` 与 `select_workflow` 字段（workflowPath/flowId/acceptanceStrength）；
   - `:674-681` `fixedRejections` 稳定码表 → 增补 `chief-dispatch-removed` / `convener-builtin-dispatch-forbidden` / `worker-dispatch-required` / `card-prompt-mismatch` / `stage-request-removed` / `workflow-definition-unknown` / `workflow-definition-version-unsupported` / `workflow-protocol-mismatch` / `workflow-corrupt`（旧码按在飞协议保留）；
   - `:97-102` fixed 收口证据特判（`taskKind === "stage-request"` 跳过阶段事件）→ 新协议需要 `stage-execution`/`card-prompt` 由应用收口、`worker-dispatch` 由运营收口的对应分支；
   - `:420` `from` 窄化编译错误（在飞模型批已扩 `from:"application"`）由桌面批按新来源处理。
2. **编排/桌面批**：v3 注入点（`run-role.ts` 现在按 `matrix:"two-fixed-paths/v1"` 硬编码读取 v2；新协议需按 `workflow.started.protocol` 注入 v3）；`select_workflow` handler；fixed 会话工具注入过滤（不注入 `dispatch_task`/`close_created_task`/`redispatch_task`/`terminate_role_run`，仅按协议注入 `select_workflow`；本批未把 `selectWorkflow` 加入 legacy `CHIEF_TOOL_IDS`，保持 legacy 冻结）。
3. **Service 展示（非判定）**：`src/service/governance-matrix/impl/routing.ts` 的 fixed 派发视图文案（「convener 为生产线唯一派发者（内置…）」）在目标集清零后不再产出规则；如需按新协议展示「应用建内置任务」路由，由服务/桌面批补充（本批未改 `src/service`）。
4. **测试批**：按 §6「预期变更」更新断言（含 `RoleToolId` 14→15 类型钉、fixed 目标集清零、fixed 上下文来源措辞、v3 资源校验用例）。

## 6. 验证

### 6.1 `npm run typecheck`（`tsc --noEmit`）

结果：**7 个错误，均为预期/非本批**：

| # | 位置 | 原因 | 归属 |
| --- | --- | --- | --- |
| 1–5 | `app/desktop/session/delivery/store.ts:390`、`session/evidence.ts:420`、`session/tasks.ts:200/321/709` | `TaskCreatedEvent.from` 已由在飞模型批扩为 `"application" \| "chief" \| "convener"`，桌面侧函数签名仍窄化 | 桌面批（在飞） |
| 6–7 | `test/门禁引擎/role-module-contract.test.ts:122/141` | `_ToolIdSet`/`_ToolNameSet` 类型钉仍断言 14 项（现为 15） | 测试批（预期变更） |

本批新增/修改文件本身无类型错误（schema/registry/roles/model 闭集均通过）。

### 6.2 资源结构检查

| 项 | 结果 |
| --- | --- |
| v3 版本行 | 恰一处 `chief-workflow/v3`（正则 `/^资源版本：(chief-workflow\/v[1-9][0-9]*)\r?$/gm`） |
| v3 体积/编码 | 26,171 字节（≤256 KiB）；无 UTF-8 BOM（首字节非 `0xEF`）；无 NUL |
| v3 身份行 | `# Chief 工作流（两条固定路径 v3 / 应用流程驱动）`（满足 `^# Chief 工作流`） |
| v1 SHA（`git hash-object`） | `53d71670ef9f403c027f6e39c0ffd1db92553992` = HEAD 逐字不变 |
| v2 SHA（`git hash-object`） | `d528c6ce5655b2a9916574f4a4477e035aef42a6` = HEAD 逐字不变 |
| v3 SHA | `sha256=f5cc4acd08cf7f7229683911b3b3a7e6aec4f060e5d04c4d372f917ac2086e79`（工作树字节） |

### 6.3 指定测试（逐个运行，`node --test --test-concurrency=1`）

| 测试文件 | tests / pass / fail | 失败项与判定 |
| --- | --- | --- |
| `test/门禁引擎/chief-workflow-v2-resource.test.ts` | **3 / 3 / 0** | 无失败（v2/legacy 资源逐字保留） |
| `test/门禁引擎/role-module-contract.test.ts` | **20 / 19 / 1** | **预期变更**：「D1：14 项 id→name→允许角色与 E0.2 §3.1 表逐项一致」`15 !== 14`（第 15 项 `selectWorkflow`）；其余 19 项（含六模块装配/零复制/decidePendingRequest 等）全过 |
| `test/roles/chief/fixed.test.ts` | **8 / 6 / 2** | **预期变更**：①「fixedTargetRoleIds：恰 [convener, verifier]…」——按设计清零为 `[]`；②「fixed context 内容：产线调度/…」——stage-request 口径已改为 select_workflow/应用驱动（旧 token 消失）。其余 6 项（fixedCards 三卡、legacy 引用冻结、legacy 段逐字、tools 6 项等）全过 |
| `test/roles/convener/convener-fixed.test.ts` | **16 / 12 / 4** | **预期变更**：①「fixedAllowedBuiltInRoleIds…」——清零 `[]`；②「isConvenerFixedBuiltInDispatchTarget…」——谓词恒 false；③「context(fixed)：返回 fixed 段…」——「生产线唯一派发者」标题与旧 token 已改；④「B32 fixed A11/B3 提交语法…」——仅旧来源从句 `stage-request 会话` 被替换（其余 B32 安全断言在失败点之前已通过）。**B9.1/B23/B27/B28/B13.2/B14/卡预算/legacy 三段** 全部通过 |

### 6.4 影响面（额外运行，区分预期变更 vs 意外回归）

| 测试 | tests / pass / fail | 失败判定 |
| --- | --- | --- |
| `test/roles/product/product-fixed.test.ts` | 12 / 11 / 1 | **预期变更**：「context(fixed)：…报告回运营…」旧来源措辞 |
| `test/roles/rapporteur/fixed-module.test.ts` | 8 / 7 / 1 | **预期变更**：fixed 职责段旧来源措辞 |
| `test/roles/nominator/nominator-fixed.test.ts` | 8 / 7 / 1 | **预期变更**：「按运营派发…」旧来源措辞 |
| `test/roles/verifier/verifier-fixed.test.ts` | **7 / 7 / 0** | 全过（证据段逐字保留） |
| `test/门禁引擎/fixed-role-module-surface.test.ts` | 7 / 4 / 3 | **预期变更**：①chief/convener fixed 目标冻结值；②fixed 视图断言 chief mainChain 含 `stage-request`；③「G-IR…RoleToolId 仍 14 项」（现 15） |
| `test/门禁引擎/governance-matrix-fixed-view.test.ts` | **6 / 6 / 0** | 全过（视图与改写后的摘要自洽） |
| `test/门禁引擎/dispatch-matrix-mode.test.ts` | **4 / 4 / 0** | 全过 |
| `test/pi-adapter/dispatch-task.test.ts`（dispatch_task 兼容） | **11 / 11 / 0** | 全过 |
| `test/claude-adapter/schema.test.ts` | **10 / 10 / 0** | 全过 |
| `test/pi-adapter/interactive-execution-mode.test.ts` | **5 / 5 / 0** | 全过 |
| `test/roles/**`（全目录） | 285 / 274 / 11 | 10 项 = 上述角色 fixed 预期变更；另 2 项「差分：契约冻结文件哈希（E0.3 067e3d2e…）」为 **Windows CRLF 检出的既有环境差异**（见 6.5），非本批 |
| `test/门禁引擎/**`（全量） | 577 / 561 / 15 / 1 skipped | 4 项 = 本批预期变更（D1 14 项、G-IR RoleToolId 14、MF-IR-4 fixed 目标、fixed 视图 stage-request）；2 项 = 并发会话在工作树新建未跟踪 `角色卡/策划/` 目录导致的 listProject 额外 warning（`角色卡/策划：缺少 role-card.md，已跳过`，非本批）；其余 9 项为 CRLF 既有环境差异（6.5） |

### 6.5 CRLF 既有环境差异（非本批）

本工作树 Windows 检出为 CRLF；以下测试按**原始工作树字节**与 **LF 归一常量**比较，在 CRLF 检出下失败（KR-29 记录同口径，运行前临时 LF 归一即过）：

- `test/门禁引擎/**`：B7.1 A1/冻结 ×2、B9.1 A1/冻结 ×2、B9.2 A1/冻结与资源事实 ×2、B32.1/B32.2、B34、direct-role-capabilities「Chief资源正文独立…」共 9 项。
- `test/roles/**`：「差分：契约冻结文件哈希（E0.3 067e3d2e…）」×2。

实测抽样证实：`chief-workflow.md` 原始字节 sha256 `10bdb1fe…`，LF 归一后 `9bef5626…`（= 测试常量）；契约文档原始 `d1920e6e…`，LF 归一后 `067e3d2e…`（= 测试常量）。本批未改这些文件（`git status` 空），失败与改动无关。

## 7. 约束声明与范围

- 只改：`src/common/门禁引擎/workflows/chief/chief-workflow-v3.md`（新增）、`src/common/门禁引擎/governance-roles.ts`、`src/common/roles/**`（7 文件）、`src/common/门禁引擎/role-tool-registry.ts`、`src/provider/runtime/schema.ts`、`src/model/role.ts`（仅 RoleToolId/RoleToolName union + 3 处注释/2 处字段注释）、本记录。
- 未改 `app/desktop`（`evidence.ts` 需求点见 §5.2）、`test/`、`src/common/编排`、`src/pipeline/orchestration`、`release.yml`/policy、角色卡/边界；未 commit/push/CI/tag/main；未读 `.env`；未占端口。
- 工作树为与在飞「编排/模型/桌面」批共用；`git status` 中其它变更（`src/model/runtime.ts` 等、`src/common/编排/workflow-definitions.ts`、`workflow-dispatch.ts`、未跟踪 `角色卡/策划/`）均为其它会话产物，本批未触碰。
