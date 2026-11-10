# G-IR 接口评审记录：两条固定工作流路径（T3）B0 类型落地

- 日期：2026-11-10
- 评审角色：ANS 固定角色「门禁引擎」（roleId: 门禁引擎；独立固定上下文）
- 评审门：**G-IR 接口评审门**（团队计划 §四；非客户门；评审失败即不支持，不得强推）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 评审对象：分支 `feat/two-fixed-workflow-paths`，**B0 提交 `ee5b330fceedf3eb82a42c1b878b0f3f410fd7b1`**（HEAD）；
  代码基线 `10f90c769ce9c2a567cdd364def0037fe9019a05`；实际评审 diff：`git diff 10f90c7..ee5b330 -- src test`
  （20 文件 / +3,891 −28）。
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`
- 环境：Node v24.22.1；npm 11.19.1；git 2.55.0.windows.5；Windows 11；评审时 `git status --porcelain -- src app test` 为空。
- 性质：**本角色独立接口评审记录（含只读复跑证据）；不是验收判定**；不修改产品/测试代码、不改角色卡/边界、
  不提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223。
- **总判定：`G-IR 通过（可进入 B1/B2）`**（附 must-fix 条件 MF-IR-1…MF-IR-8，见 §九；条件闭环前不得启用对应
  fixed 能力；`requestReleaseMerge` 明确**不支持新增**，见 §六）。

---

## 一、依据绑定（写盘实测 hash）

| 依据 | 路径 | 实测（行 / 字节 / SHA-256） |
| --- | --- | --- |
| B1 验收（冻结，唯一判据；AC-01/04/05/14/17/18/24/26、EV-05 等） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 / 33,722 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| 实现级方案 v1.3（冻结；§3.2/§3.4/§3.5/§4.1/§7.1/§10.3/附录 E） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 / 184,391 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| 团队计划（§四 接口评审门） | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | 159 / 17,013 / `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |
| B0 记录（运行时核心；只读） | `角色卡/运行时核心/docs/change/2026-11-10_B0_two-fixed-workflow-paths.md` | 146 / `0603ba8198cc303dba69c1024d987f83c684338e9e31fd21521627d0c3bb7f42` |
| B0 记录（门禁引擎；只读） | `角色卡/门禁引擎/docs/change/2026-11-10_B0_two-fixed-workflow-paths.md` | 115 / `1d846d351e4ead47af840bc718ac374c78e3c0c483224d4ff0561d766ec2c07f` |
| B0 记录（shared-code；只读） | `角色卡/shared-code/docs/change/2026-11-10_B0_two-fixed-workflow-paths.md` | 157 / `ab1383ca9f35a2e730ea2995faef5d19a58896e1408d26b1e8f2978ba0461afc` |
| B0 记录（编排；只读） | `角色卡/编排/docs/change/2026-11-10_B0_two-fixed-workflow-paths.md` | 219 / `b180e020f5fb7806a1d4dfe6d3479539908daf5378173606d68ae47df5df05c9` |

- B0 提交 `ee5b330`：65 文件 / +24,889 −28（代码/测试 20 + 四角色 B0 记录/证据）。
- 依据 hash 与评审任务给定值一致（`b607f100…` / `ae737dcf…`）。

## 二、评审方法与限制

1. 只读 `git show ee5b330 --stat/--name-status`、`git diff 10f90c7..ee5b330 -- src test`，抽查
   `src/model/runtime.ts`、`src/model/role.ts`、`src/provider/runtime/schema.ts|tools.ts`、
   `src/common/编排/task-state.ts`、`workflow-state.ts`、`workflow-service.ts`、`basis-guard.ts`、
   `src/pipeline/orchestration/run-role.ts`、`src/common/shared/config-loader.ts` 及 merge-main/card/group/planJudge 消费点。
2. 只读复跑：`npm run typecheck`、B0 定向套件、`test/项目管理/shared/**`、`test/编排/**`、`test/门禁引擎/**`、
   `test/桌面应用/star-routing.test.ts` + `test/测试/governance-e2e-auto/i-full-chain.test.ts`；
   基线对照用 `git archive 10f90c7` 解包到临时目录（评审后已清理，未触碰工作树）。
3. 未运行真实模型/Electron；未占用 9222/9223；未修改任何产品/测试代码。
4. 证据见同目录 `2026-11-10_interface-review_two-fixed-workflow-paths_evidence/`（命令、输出摘要、hash、锚点）。

## 三、B0 证据抽查（记录 ↔ 代码）

- 四份 B0 记录声明的候选 hash 与 HEAD ee5b330 工作树逐项一致（14 文件抽查全中）：
  `runtime.ts 17c5d7a4…`、`role.ts ea01d093…`、`schema.ts 061fd80c…`、`tools.ts d30b7f65…`、
  `task-state.ts 029a9a89…`、`workflow-state.ts 863a3164…`、`workflow-service.ts 0c76ea1f…`、
  `basis-guard.ts 3874925b…`、`run-role.ts aafb1a07…`、`config-loader.ts 2d6a22fd…`、新测试 `b82c84c1…` 等
  （完整表见证据 02）。**未发现“记录与代码不一致”**。
- `src/common/gates/` 零 diff；`app/**`、`src/common/roles/**`、边界文件、`package.json/lock` 零 diff（证据 06）。
- `npm run typecheck` = **exit 0**；B0 定向 10 文件 **99/99 pass**；shared **224/219/0/5**（与记录一致）；
  `test/编排` **24 known-red 失败名逐名一致**（TAP 见证据 03）；门禁引擎 **483/477/5/1**（无新增红，
  一项按 B0 记录披露由红转绿）。

## 四、逐项结论表

| # | 评审项 | 结论 | 关键证据（锚点见证据 05） | owner / 后续 |
| --- | --- | --- | --- | --- |
| 1 | 矩阵/context（`DispatchMatrixMode`/`RoleDispatchPurpose`/`RoleDispatchPolicyInput.matrix/purpose`/`RoleContextInput.matrix`/`BuiltInRoleModule.context`/`ProjectConfig.workflowSchema`） | **通过** | role.ts:98/312/322/336/338/415/426-435；config-loader.ts:98-110/306-315；dispatch-matrix-mode.test.ts:36-47/107-129 | B1/B2 按缺省 legacy-v1/production 消费；shared-code 记录已披露 config fail-closed |
| 2 | `requestReleaseMerge`（`RoleToolId` 条件项） | **拒绝（不新增）** | RoleToolId 14 项（role.ts:252-266）；ROLE_TOOL_CATALOG 14 项；direct 5 项；chief 工具 6 项；request_stable_write/git_publish 均为 legacy 且 fixed 不注入 | 运行时核心 B2 **不得新增**；B3 用应用自动呈卡/UI 动作备选（§六） |
| 3 | merge-main 卡种（`GovernanceCardKind`/`AppOwnedGovernanceCardKind`/GROUP/planJudge） | **通过**（B0 类型/排除面）；运行时面 B3 条件 | runtime.ts:895-910/924-928/952-967/974-977/986-989/2266-2278；customer-input.ts:1320-1337；governance-judge.ts:165-168；verdict.ts:356/395；run-role.ts:3243 | B3 实现应用自有通道/preview/客户本人；T-10/T-11/T-15 |
| 4 | task.created 字段/豁免 | **附条件通过** | runtime.ts:1375-1429/1482-1549；task-state.ts:370-400/404-455/1102-1122/1189；task-state-fixed.test.ts | MF-IR-1、MF-IR-5；B1 接 AC-06 |
| 5 | dispatch_task 字段 | **附条件通过** | schema.ts:698-735/767-770/840；tools.ts:2886-2935/3177；runtime.ts:2602-2655/2728；B0 契约测试:256-321 | MF-IR-1；B1 应用层来源/目标/副作用/转移/幂等校验 |
| 6 | close_created_task v2 / activate_role_documents v2 | **附条件通过（B0 尚不足以支撑 fixed v2）** | runtime.ts:3152-3164/3171-3180；schema.ts:53-60；tools.ts:4461-4467；B0 契约测试:281-292 | MF-IR-2、MF-IR-3（B2 运行时核心 + B1 编排） |
| 7 | 角色模块新增导出 | **附条件通过（接口冻结，B2 实现）** | role.ts:186-198/426-435；chief/internal/dispatch.ts:48；convener/index.ts:191；workflow-preconditions.ts:1582；run-role.ts:3201-3206 | MF-IR-4（门禁引擎 + 六角色 code B2） |
| 8 | `project-roster/v4 roles[].review` | **附条件通过（接口冻结，B1/B2 实现）** | workflow-preconditions.ts:30/686-712/730-770；doc-format-specs.ts:628 | MF-IR-7（编排 B1/B2 + 桌面窗口核验） |
| 9 | legacy 兼容 | **附条件通过**（无 B0 回归；码表需收口） | gates 零 diff；typecheck 0；编排 24 名一致；shared 224/219/0/5；门禁 5 红（记录 6，一项转绿已披露）；star-routing/i-full-chain 9 红在 10f90c7 与 HEAD 同集合（非 B0 引入） | MF-IR-6；B2 基线复测口径 |
| 10 | 其他（新客户门/新角色/边界/H1/依赖/越权写集/记录 hash） | **通过**（附披露） | 无 app/roles/gates/boundary/deps 变更；无新角色/客户门；H1=0；记录 hash 一致；run-role.ts +1 已披露 | Scheduler/编排确认 run-role +1 纳入写集（程序性） |

## 五、逐项详述

### 5.1 项 1：矩阵/context —— 通过

- `DispatchMatrixMode`、`RoleDispatchPurpose` 闭集与 v1.3 §3.2 逐字一致；`matrix?`/`purpose?`/`context({matrix})`
  均为**可选**、缺省 `legacy-v1`/`production`；`BuiltInRoleModule.context(input: RoleContextInput)` 签名形状未变
  （仅入参类型追加可选字段），旧调用点类型检查与运行时行为不变（六模块 × 代表性事实/两治理模型等价断言）。
- `ProjectConfig.workflowSchema?: "two-fixed-paths/v1" | "legacy/v1"`：可选、无第三值；缺省不声明（per-flow 判定）；
  config-loader 仅在显式两值时带出，缺省不设字段（旧项目逐字不变）。
- 披露：config-loader 对**显式非法** `workflowSchema` 采用“整配置 `ans-invalid`” fail-closed（不静默按缺省）；
  此为 shared-code 批的确定性选择，已在记录披露；B1 `workflowMode` 对配置不可解析按 legacy fail-closed（不猜 fixed）。
- 结论：接口可实施；B1/B2 必须显式处理缺省（不得把缺省当 fixed），固定矩阵只能由 `matrix:"two-fixed-paths/v1"` 选择。

### 5.2 项 2：`requestReleaseMerge` —— 拒绝新增（见 §六）

### 5.3 项 3：merge-main 卡种 —— 通过（B0 类型/排除面）

- 卡种联合/清单：`AppOwnedGovernanceCardKind = "stable-write" | "merge-main"`；`GOVERNANCE_APP_OWNED_CARD_KINDS`
  冻结包含两项；`GovernanceCardKind` 并入；`GOVERNANCE_CARD_KINDS` 派生 9 项。
- 非判断卡：`GOVERNANCE_CARD_GROUP` 键/值**逐字未变**（appointment-write/download/proposal/appointment/acceptance/
  intent-confirm/decision）；`governanceCardGroup("merge-main") === undefined`；`planJudge` 因分组未定义直接
  `return undefined`（不进判断器）；`governance-judge` 上下文/裁定在分组未定义时一律回落 manual（不可 approve）。
- 客户本人：`release.confirmed.by` 仅 `"customer"`；`release.rejected.by` 允许 `"customer" | "judge"`（judge 只能拒绝/
  转人工，不能 approve）；`merge-main` 不属于 `request_choice`/`request_confirmation` 卡种（工具层白名单拒绝）。
- 运行时面（preview 必含 workflowId/flowId、base OID、tip OID、文件数、diff stat、合并方式、高风险提示；
  应用构造/执行；不 push/tag）属 B3，B0 未实现，**不得据此提前启用**。B3 必须按 AC-14/T-10/T-11/T-15 覆盖。
- 结论：类型/分组/判断器排除接口冻结正确；B3 实现应用自有通道与客户本人语义。

### 5.4 项 4：task.created 字段/豁免 —— 附条件通过

- 字段：`workflowId/stage/taskKind/workflowPath` 均**可选**；旧事件形状仍合法；`request.created/resolved`
  追加可选 `documentRefs/workflowId/stage`（裁决事件一次写入；finalize 只校验不重写）。
- fixed 校验分支与 v1.3 §7.1 一致（task-state.ts:404-455）：
  - `workflowId` 存在：校验 slug、`flowId` 必填且 slug、`stage ∈ WorkflowStage` 必填、`taskKind` 只允许
    `"stage-request"`（普通生产任务可缺省）、`workflowPath` 只允许 A/B；
  - `runId`/`runState` 出现即拒（`fixed-task-run-forbidden`）；
  - `workflowPath` 仅允许出现在 `taskKind==="stage-request"` 且同 workflowId 首个 stage-request
    （`workflow-path-not-stage-request` / `workflow-path-not-first`；同幂等键 replay 放行）；
  - 无 `workflowId` 且 `flowId` 有值：旧 `run-required` 分支与文案**逐字保留**（allowLegacyRun 语义不变）；
  - 读侧新增 fixed 字段 fail-closed；replay 不再把 fixed 任务回填 `runState:"legacy"`（旧回填逐字保留）。
- 条件：
  - **MF-IR-1**：`reworkOf` 语义与 AC-08/§4.4 相反（见 5.5/§九）；
  - **MF-IR-5**：v1.3 §4.2 A3 要求 `documentRefs` 含 `version`，B0 `WorkflowDocumentRef` 无 `version`；
    应追加可选 `version?: number`（加法，不破坏旧形状）或书面记录与 §4.2 的差异并由协调方确认。
- 结论：B0 分支实现正确、legacy 未被放宽；上述两项条件闭后方可用于 A3/A12 记账。

### 5.5 项 5：dispatch_task 字段 —— 附条件通过

- schema：新增 6 个可选属性（`taskKind` 枚举 `["stage-request"]`；`workflowAction` `advance|stop`；
  `workflowPath` `A|B`；`workflowId` string 1–200；`stage`/`reworkOf` 取 `WORKFLOW_STAGES` 全集）；
  `required` 仍 `["roleId","task"]`；旧属性/`additionalProperties` 逐字保留；文案模式中立（不含 fixed 专属口号），
  promptGuidelines 追加 stage-request 无写权/需再派发、stop 由收到请求方执行两条（旧条不变）。
- `DispatchTaskPayload` 6 个可选字段；handler 只做形状校验（非法枚举/坏 stage fail-closed，且不调用注入 fn），
  仅在存在时透传（旧载荷不追加任何键）；`contract_check.taskKind` schema 与 handler 同步加 `stage-request`。
- 条件/后续（B1/B2，非 B0 缺陷）：
  - 应用层必须按 AC-05/AC-06/§3.3 强制：stage-request 仅 chief→convener、`sideEffect=read-only` 豁免文本升类、
    无 module/写集、目标阶段合法、来源 live-turn + assigned-task 证据、首请求 workflowId 应用确定性生成
    （模型自报不采信/须等于计算值）、幂等键 `stage-request:<wf>:<stage>:<attempt>`、open 请求不变量；
  - **MF-IR-1**：`reworkOf` 语义须按 AC-08/§4.4 修正。
- 结论：B0 的工具面/载荷接口正确；fixed 行为未实现，B1 必须补齐上述 fail-closed 校验后方可启用。

### 5.6 项 6：close_created_task v2 / activate_role_documents v2 —— 附条件通过（不足以支撑 fixed v2）

- **close_created_task v2**：
  - 现状（B0）：`CloseCreatedTaskInput` 仍要求 `runId/basisDigest/reportRef`（runtime.ts:3171-3180）；
    schema `required` 6 项未放宽（schema.ts:57-60）；工具层 `directShapeError` 按 schema.required 校验
    （tools.ts:4461-4467）。因此 fixed 目标输入 `{operationId,taskId,outcome,note?}` **当前无法通过工具层**。
  - B0 仅 description 预留模式语义、required 逐字保留——这是有意为之（记录 §4.2），**不是 B0 记录不一致**；
    但接口**尚不足以支撑 fixed v2**。
  - **MF-IR-2**（B2 运行时核心 + B1 编排）：类型/ schema / handler 必须支持 fixed 3+1 字段输入；legacy 模式
    仍要求 `runId/basisDigest/reportRef` 并由 legacy 实现/服务 fail-closed 拒绝缺失；`workflowService.closeTask`
    校验真实创建者/报告/状态/幂等、写 `task.closed` + 阶段事件、不触 trunk/CAS；legacy 原实现逐字保留。
- **activate_role_documents v2**：
  - 现状（B0）：`ActivateRoleDocumentsInput` 为 legacy 形状（`planRef/d3DecisionId/rosterRef`；无
    `workflowId/proposalDecisionId`；runtime.ts:3152-3164；schema.ts:53-56）；**fixed A8 输入不可表达**。
  - **MF-IR-3**（B2 运行时核心 + B1/B2 编排）：支持 fixed `{operationId, flowId, workflowId, proposalDecisionId,
    targetRoleId, roster:{path,sha256}, documents:{card,boundaryMd,boundaryYaml}}`；应用校验提案决定/名单/属主/
    边界并重算三文档实际字节 SHA-256（`activation-hash-drift`），写 `role.activated`；不写 trunk、不发
    appointment-write 卡；legacy 输入与实现逐字保留。
- 结论：两项均为 **B0 明确留待 B2 的接口扩展**；G-IR 冻结目标形状（见 §八），B1/B2 闭环前不得启用对应 fixed 能力。

### 5.7 项 7：角色模块新增导出 —— 附条件通过（接口冻结，B2 实现）

- B0 未新增 `fixedCards`/`fixedTargetRoleIds`/`fixedAllowedBuiltInRoleIds`/`isConvenerFixedBuiltInDispatchTarget`
  （按团队计划属 B2）；`BuiltInRoleModule` 当前无对应字段，run-role `cardKindsOf` 仍读 `module.cards`。
- 接口可实施且必须按以下冻结口径实现（**MF-IR-4**）：
  - `fixedCards: readonly GovernanceCardKind[]`（六模块均提供；fixed 矩阵**只读本字段**，不得从 legacy `cards` 过滤；
    缺失 ⇒ fail-closed 空集，不静默回退）；
  - `fixedTargetRoleIds: readonly string[]`（chief，恰 `["convener","verifier"]`）；
  - `fixedAllowedBuiltInRoleIds: readonly string[]`（convener，恰 `["product","rapporteur","nominator"]`）；
  - `isConvenerFixedBuiltInDispatchTarget(roleId: string): boolean`（convener 模块纯函数，与上表同源）。
- 值（v1.3 §3.4）：chief=`["intent-confirm","proposal","appointment"]`；rapporteur=`["decision"]`；
  convener=`["decision"]`；product/nominator/verifier=`[]`。
- 约束：全部纯策略/纯数据、无 I/O；legacy `card.text`/`cards`/capabilities/`CHIEF_HUB_DISPATCH.targetRoleIds`
  （五内置）/`CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds`（`["verifier"]`）/`isConvenerBuiltInDispatchTarget`
  **逐字冻结**；fixed 字段只在 `matrix:"two-fixed-paths/v1"` 下消费，legacy 消费点（apply-journal/trunk-runtime）
  不得改读新字段；不得复制第二张硬编码表。

### 5.8 项 8：project-roster/v4 `roles[].review` —— 附条件通过（接口冻结，B1/B2 实现）

- 现状：`PROJECT_ROSTER_SCHEMA = "project-roster/v3"`，解析器只接受 v3 且不做静默归一化（workflow-preconditions.ts:30/686-712）；
  `roles[]` 解析无 `review` 字段；doc-format 单一格式 id 为 `project-roster/v3`（doc-format-specs.ts:628）。
- 冻结口径（**MF-IR-7**）：
  - parser 同时接受字面量 `"project-roster/v3"` 与 `"project-roster/v4"`；v3 解析/错误语义逐字不变；
  - v4 追加可选 `roles[].review?: boolean`；**至多一个 `true`**（>1 拒绝）；非布尔拒绝；v3 + `review` 拒绝
    （确定性，不静默忽略）；
  - **不新增 doc-format 格式 id**（54 格式不变）：保留现有 `project-roster/v3` 条目并同步说明/示例为
    v3/v4 双字面量 + v4 可选 review（B2 编排）；
  - A9：`basis.recorded.reviewRoleId` 默认 `"verifier"`；roster v4 有 `review:true` 项目角色 R ⇒ `reviewRoleId=R`；
    A12 派发仅当 `purpose=review && targetRoleId===workflow.reviewRoleId && roster 原文 roles[].review===true &&
    basis.reviewRoleId 一致 && 角色已 role.activated` 时允许（MF-10 窄例外），否则 `chief-to-project-forbidden`；
    应用核验，不采信模型自报；
  - 测试：T-20（v3/v4 解析/错误文案）、T-01/T-13（reviewRoleId 正/负例）。
- 结论：不改变格式 id、v3 兼容、可选且至多一个 true——接口可实施；B1 解析/A9 绑定、B2 文档说明、桌面核验按上冻结实现。

### 5.9 项 9：legacy 兼容 —— 附条件通过

- `src/common/gates/` **零 diff**；`CHIEF_HUB_DISPATCH.targetRoleIds` 五内置与
  `CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds=["verifier"]` 未改；`workflow-preconditions.ts` 旧谓词未改；
  `routeStarDispatch`/session.ts B0 未改；旧测试文件无删除/无断言弱化（仅 3 个 shape oracle/清单同步）。
- `appendTaskEvent` 由 `function` → `async function`：返回类型仍 `Promise<AppendResult>`，旧分支返回值由
  `Promise.resolve(x)` 变为 async 返回 x（对 `await` 调用方语义等价）；`limits()` 同步抛错场景变为 reject，
  生产调用点均 `await`，判定无行为差异；已披露。
- 复跑：typecheck 0；`test/编排` 24 known-red 失败名与 B0 记录逐名一致（新增 31 用例全绿）；
  shared 224/219/0/5；门禁引擎 5 红（B0 记录基线 6 红，少项为已披露的并行侧红转绿；B2 须统一复测口径）。
- 披露/条件：
  - B1 §二写 `test/编排/** 22 fail / 2 skip`，实测基线为 **24 fail / 2 skip**（B0 记录已如实披露）；
    B2 须按实测基线复测并在报告说明差异。
  - `star-routing`/`i-full-chain` 在 **10f90c7 与 ee5b330 同集合 9 红**（12 tests / 3 pass / 9 fail；
    失败名逐名一致），**不是 B0 回归**；但 B1 §二未列、AC-03 要求其通过——B2 必须在规范环境复测并解释/修复，
    不得以“未列 known-red”跳过。
  - 新增语义码 `invalid-task-binding`/`fixed-task-run-forbidden`/`workflow-path-not-stage-request`/
    `workflow-path-not-first`/`baseline-gitignore-malformed`/`baseline-gitignore-write-failed`/`invalid-event`
    未在 v1.3 附录 C；且 A9 文档失败码在 AC-16 为 `baseline-document-*`，B0 basis-guard 采用 `basis-document-*`
    （§5.3 G-7 口径）。**MF-IR-6**：B1 必须映射到验收冻结清单或书面申请扩展（不得两套并存模糊）。
- 结论：B0 未改变 legacy 默认行为/旧断言/gates；上述码表与基线口径需 B1/B2 收口。

### 5.10 项 10：其他 —— 通过（附披露）

- 无新客户门（merge-main 为既有高风险确认机制具体化，非新门）；无新角色；无边界模型变化；H1=0；
  无新依赖；`app/**`/`src/common/roles/**`/`src/common/gates/**`/边界文件零 diff。
- B0 记录 hash 与代码一致（证据 02）。
- 披露：`src/pipeline/orchestration/run-role.ts` +1 行（`CARD_KIND_ROUTE_HINTS["merge-main"]`）不在团队计划
  §三 B0「编排」行（B1 行才列）；编排 B0 记录 §1.5 已披露，属同一 owner 的 B1 写集范围，为恢复 typecheck=0
  的最小修复。判定非越权安全风险；请 Scheduler/编排在 B1 记录确认该 +1 行纳入批次写集（程序性条件）。
- 本评审无写集外需求（停止报告）：未发现“必须由门禁引擎改而写集未授权”的事项；未改任何产品/测试代码。

## 六、`requestReleaseMerge` 专门结论：**拒绝新增（不支持）**

### 6.1 现行能力清点（实测）

| 能力面 | 内容 | 是否可承载“触发 merge-main 高风险确认卡” |
| --- | --- | --- |
| `RoleToolId` 闭集（role.ts:252-266；catalog 14 项） | roleActivityLog / terminateRoleRun / redispatchTask / projectNote / requestVersionDecision / requestRequirementChange / submitVersionChange / selectRunChange / completeTeamPlan / activateRoleDocuments / closeCreatedTask / submitRefactor / requestStableWrite / decidePendingRequest | **否**：无发布/合并语义；扩项需改闭集/装配表/schema/tools/契约测试（T-13 由 14 项变 15 项） |
| direct capabilities（schema.ts:37-77） | select_run_change / complete_team_plan / activate_role_documents / close_created_task / decide_pending_request | **否**：close 只收口任务、complete_team_plan 只做基线、decide 只处理保留卡；均无 release.requested/confirmed/merged 语义 |
| `request_stable_write`（convener，legacy） | 仅 `docs/workflow.md` stable 写入请求，触发 stable-write 卡 | **否**：角色不同（convener）、卡种不同（stable-write）、fixed 路径 deprecate/不注入；复用会混淆卡种与语义 |
| `git_publish`（legacy 结构化 Git） | trunk 候选发布三段式 | **否**：legacy trunk 机制，fixed 不注入；不合并 main；绑定候选 ref/旧依据 |
| `request_choice` / `request_confirmation` | 卡种白名单不含 merge-main（tools.ts:369/372）；且非应用自有通道 | **否**：AC-14 要求应用自有非判断卡；用通用工具发卡会绕过应用构造/preview/客户本人语义 |
| `complete_team_plan` / `close_created_task` 收口链 | 基线/收口事件 | **否**：把“任务收口 accepted”重载为“请求合并 main”会把普通收口变成发布授权，违反 §4.2“收口不是阶段完成/授权” |

### 6.2 结论

1. **不存在可复用的既有能力**能安全承载“发布合并请求”→merge-main 卡（枚举见 6.1）。
2. 新工具在本 T3 **并非“确需”**：v1.3 §6.4 明确允许备选——**应用在 A13/B4 前置满足时自动呈 card**
   （或桌面 UI 显式动作），安全语义不变、接口面更小，且避免模型滥用/伪造发布请求与扩大 `RoleToolId` 闭集。
3. 因此：**B2 不得新增 `requestReleaseMerge`**（不得先斩后奏）；B3 按下列 fail-closed 口径实现应用自有通道：
   - 触发：仅 A13/B4 且 §6.4 公共前置满足（A13：A12b accepted + `docs/acceptance` 归档；B4：B3 accepted +
     运营最终报告；对应实现任务 accepted；basis 校验通过；当前分支=任务分支；工作区 clean（tracked 修改/删除=0，
     非忽略 untracked 仅任务 writeSet/空）；main base OID 记录；同一 workflow 无开放 release）；
     任一不满足 ⇒ `release-workflow-not-ready`，**不发卡**；
   - 卡：应用构造 `merge-main`（非判断、不进 GROUP）；preview 含 workflowId/flowId、main base OID、branch tip OID、
     文件数、diff stat、合并方式（merge/initial）、高风险提示；**仅客户本人 approve/reject**；judge 只能转人工/拒绝；
   - 执行：应用固定 argv/sanitized env，不经 shell；main unborn ⇒ `git switch -c main <tipOid>`/update-ref
     （`mergeKind:"initial"`）；main 存在 ⇒ switch main + `git merge --no-ff`；冲突 ⇒ abort + 切回任务分支 +
     `release-merge-conflict`；不 force/reset/clean；不 push/tag；
   - 幂等：`release:<workflowId>:<tipOid>`；已合并 `release-already-merged`；拒绝/超时 `release.rejected`；
   - 事件：`release.requested/confirmed/merged/failed` 由应用写；`release.confirmed.by` 仅 customer。
4. 若后续出现**新证据**证明必须由 chief 主动发起（自动卡无法覆盖的场景），须**重新走接口评审**并钉住
   接口名/入参/幂等/失败码/fail-closed/仅 chief/不进 legacy 注入/必要性；本次评审不预先批准。

## 七、merge-main 运行时条件（B3 冻结，非 B0 缺陷）

- 类型面（B0 已完成）：卡种/清单/非分组/judge 排除/客户本人裁定事件。
- 运行时面（B3 必须）：应用自有构造与客户本人通道；preview 字段；judge 不可代批（只能转人工/拒绝）；
  无 `judge-delegated` 来源；客户卡总数仍为 3 张确认卡 + 高风险动作卡（不新增客户门）。
- 验收钩子：T-10（release 合并/冲突/幂等/未授权 + merge-main 客户本人）、T-11（merge-main 非判断卡/仅客户本人）、
  T-15（judge 来源不冒充客户、无 judge-delegated）。

## 八、B1/B2 冻结接口汇总（供实现对照）

1. **矩阵/context**：缺省 `legacy-v1`/`production`；fixed 仅由显式 `two-fixed-paths/v1` 选择；模块 fixed 段只在
   fixed 矩阵返回；legacy 返回值逐字冻结。
2. **模块导出**（MF-IR-4）：`fixedCards` / `fixedTargetRoleIds` / `fixedAllowedBuiltInRoleIds` /
   `isConvenerFixedBuiltInDispatchTarget` 的签名/值/纯策略约束见 5.7。
3. **project-roster/v4**（MF-IR-7）：v3/v4 双字面量、可选 `roles[].review`、至多一个 true、doc-format 不新增 id；
   A9 `reviewRoleId` 默认 verifier/roster review 角色优先；A12 应用核验绑定。
4. **close_created_task v2**（MF-IR-2）：fixed `{operationId,taskId,outcome,note?}`；legacy 必填与实现逐字保留；
   handler/服务按模式 fail-closed。
5. **activate_role_documents v2**（MF-IR-3）：fixed `{operationId,flowId,workflowId,proposalDecisionId,targetRoleId,
   roster{path,sha256},documents{card,boundaryMd,boundaryYaml}}`；legacy 形状逐字保留；`role.activated`；
   不写 trunk/appointment-write。
6. **task.created/dispatch_task**：字段/枚举/幂等/来源证据见 5.4/5.5；**reworkOf = 被返工的来源阶段**
   （A12b→A11 时 `reworkOf:"A12b"`，`stage` = 回落目标 A11）；`documentRefs` 可含可选 `version`。
7. **码表**（MF-IR-6）：B1 映射/扩展，A9 文档失败须满足 AC-16 `baseline-document-*`。
8. **release**（MF-IR-8）：不新增 `requestReleaseMerge`；应用自动呈卡/UI 动作 + §六 fail-closed 语义。

## 九、Must-fix 清单（MF-IR）

> 说明：B0 为“类型/骨架”批次；以下各项属 B1/B2 计划内实现义务（团队计划 §三/§五）。G-IR 通过不豁免这些条件：
> **在对应条件闭环前，B1/B2 不得启用对应 fixed 能力，不得先斩后奏。**

| ID | 内容 | owner | 闭环点 / 验收影响 |
| --- | --- | --- | --- |
| **MF-IR-1** | `stage.reworked`/`dispatch_task.reworkOf` 语义与 AC-08/§4.4 相反：B0 `workflow-state.ts:216/226` 把 `reworkOf` 当目标阶段、`stage` 当来源；测试 `workflow-state.test.ts:146-153/249` 以 `reworked("A12b","A11",2)` 固化。按冻结判据：A12b→A11 时 `reworkOf:"A12b"`（被返工来源），`stage` 为回落目标 A11；投影应标记 `reworkOf` failed、当前阶段置 `stage`。 | 编排（B1）；运行时核心（B2 同步类型注释） | A12 rework/T-03/AC-08 前；如团队有不同读法须先升级协调方，不得静默反转 |
| **MF-IR-2** | `close_created_task` v2：类型/schema/handler 支持 fixed `{operationId,taskId,outcome,note?}`；legacy `runId/basisDigest/reportRef` 必填与旧实现逐字保留（legacy 缺失 fail-closed）。 | 运行时核心（B2 类型/schema/tools）+ 编排（B1 `workflowService.closeTask`） | fixed 收口/T-04/AC-18 前 |
| **MF-IR-3** | `activate_role_documents` v2：支持 fixed `{operationId,flowId,workflowId,proposalDecisionId,targetRoleId,roster{path,sha256},documents{...}}`；应用重算三文档 hash/`activation-hash-drift`/`role.activated`；不写 trunk、不发 appointment-write；legacy 逐字保留。 | 运行时核心（B2）+ 编排（B1/B2 activation） | A8 fixed/T-08/T-13/AC-24 前 |
| **MF-IR-4** | 模块新增导出 `fixedCards`/`fixedTargetRoleIds`/`fixedAllowedBuiltInRoleIds`/`isConvenerFixedBuiltInDispatchTarget`（签名/值/纯策略/legacy 冻结/缺失 fail-closed，见 5.7）；`cardKindsOf(roleId, matrix)` 固定矩阵只读 fixedCards。 | 门禁引擎 + 六角色 code（B2） | fixed 矩阵/T-13/AC-24 前 |
| **MF-IR-5** | `WorkflowDocumentRef` 追加可选 `version?: number`（v1.3 §4.2 A3 要求 intent documentRefs 带 version）或书面记录与 §4.2 的差异并由协调方确认。 | 运行时核心（B2） | A3/T-04 前 |
| **MF-IR-6** | 码表收口：`invalid-task-binding`/`fixed-task-run-forbidden`/`workflow-path-not-stage-request`/`workflow-path-not-first`/`baseline-gitignore-malformed`/`baseline-gitignore-write-failed`/`invalid-event` 未在附录 C；A9 文档失败须满足 AC-16 `baseline-document-*`（B0 basis-guard 用 `basis-document-*`）。B1 映射到冻结清单或书面申请扩展。 | 编排（B1）；运行时核心（若涉工具层码） | AC-16/AC-17/T-06/T-08 证据前 |
| **MF-IR-7** | `project-roster/v4` 解析 + doc-format 同步（v3/v4 双字面量、可选 review、至多一个 true、不新增格式 id、A9 reviewRoleId/A12 核验），见 5.8。 | 编排（B1 parser/A9；B2 doc-format）+ 桌面窗口（A12 核验） | A5/A9/T-20/AC-25 前 |
| **MF-IR-8** | 发布合并通道：**不得新增 `requestReleaseMerge`**；B3 实现应用自有 merge-main 卡（自动呈卡/UI 动作）+ §六 fail-closed 前置/客户本人/judge 排除/幂等/本地合并。 | 运行时核心（B2 不新增）+ 桌面窗口/编排（B3） | A13/B4/T-10/T-11/T-15/AC-14/AC-22 前 |

程序性条件（不计入 8 项）：`run-role.ts` +1 行的 B0 写集归属由 Scheduler/编排在 B1 记录确认（见 5.10）。

## 十、legacy / H1 / 客户门核对

- **H1=0**：`src/common/gates/` 零 diff；无新角色；无客户可见门（merge-main 为既有高风险确认机制具体化）；
  无边界模型变化；新文件均在既有 directory 授权内（v1.3 §10.3）；无新依赖。
- **客户门**：B0 未新增任何客户卡/门；merge-main 仅在类型/ledger 白名单/判断器排除面落地；运行时卡通道属 B3。
- **legacy**：旧谓词/旧常量/旧卡文本/旧断言未改；`routeStarDispatch` 未改；无 CHANGELOG 变更；
  `src/common/gates` 零 diff；测试无删除/无弱化（仅 3 个 oracle/清单同步，均为按设计增项，不是弱化）。
- **证据**：typecheck 0；定向 99/99；shared 224/219/0/5；编排 24 known-red 名称一致；门禁 483/477/5/1
  （无新增红；一项转绿已披露）；star-routing/i-full-chain 9 红与 10f90c7 同集合（非 B0 引入，B2 须复测解释）。

## 十一、限制与披露

1. 本评审为**只读代码/文档/测试评审**，未运行真实模型/Electron/真机全链；不构成 B2 验收或客户批准。
2. `test/编排` 全量复跑出现 1 个文件级偶发 `test\编排\git-trunk-store.test.ts`（exitCode 2147483651，64.25 s），
   单独复跑 13/13 pass；判定环境/负载型，非确定性新增失败；TAP hash 已记录（证据 03）。
3. runtime-core 全量套件未在本 worktree 复跑（该记录已披露 worktree `.git` 为文件导致
   `runtime-protection-scope-unknown` 环境性失败）；本评审采用其隔离 A/B 证据 + 定向套件复跑。
4. B1 §二 known-red 计数与实测差异（22 vs 24 fail）与 star-routing/i-full-chain 9 红未列入基线：
   不改变 G-IR 判定，但 B2 必须在报告中复测/解释，否则 AC-03/AC-18 存在证据风险。
5. B0 记录对并行批次、瞬时红、跨批修复（run-role.ts +1）均已披露；本次未发现记录与代码 hash 不一致。
6. 若 B0 之后代码/依据文档变更，本评审结论须按新候选重新复核（本记录基于 ee5b330 与给定 hash）。

## 十二、总判定

**`G-IR 通过（可进入 B1/B2）`。**

- 通过含义：B0 的类型/契约骨架（矩阵/context、task.created、dispatch_task、merge-main 卡种、账本类型、
  workflow/basis/service 骨架）满足 B1/B2 使用前提；未发现必须回退的 B0 接口。
- 条件：MF-IR-1…MF-IR-8 由对应 owner 在 B1/B2 闭环（§九）；闭环前不得启用对应 fixed 能力。
- **不支持项**：`requestReleaseMerge` 新增（§六）——B2 不得新增；B3 改用应用自有 merge-main 通道（安全语义不变）。
- 不通过项：无（`requestReleaseMerge` 为“评审失败即不支持”，不阻塞其余接口进入 B1/B2）。

## 十三、未提交声明

- 本记录与 `_evidence/` 仅写入本角色设计文档目录（任务精确写集）；**未修改任何产品/测试代码、角色卡/边界**；
  **未 commit / 未 push / 未 merge / 未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。
- 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；其余引用 hash 均为写盘实测。

## 十四、证据索引（同目录 `..._evidence/`）

| 文件 | 行 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| 01-basis-and-candidate.txt | 32 | 2,672 | `ecbd9227cf0f1f1f94400f6f524c4ee800edf30784d2a59709d09ae53f901200` |
| 02-b0-record-code-hash-check.txt | 26 | 2,649 | `1de184b8f72022ad10f25ce7c4103aa6ed2eb5dc9b446268e3cc09da1d89855c` |
| 03-typecheck-and-tests.txt | 72 | 3,364 | `333bfb888bdae2bd246b77411ac89bd695dc2c797281fe9df4fa3903281f4f73` |
| 04-legacy-star-routing-i-full-chain-baseline.txt | 51 | 3,109 | `5064cbe7be34a97cbf042cb565b834396687d73033fae4c6b0dd05cf6f8976b6` |
| 05-code-anchors.txt | 99 | 7,640 | `ef38538b2380b68686626b839a3ea02ee1e450155b7898883edb05c67d8e472c` |
| 06-write-set-deps-gates.txt | 46 | 2,662 | `55c94b1ba80716e2d67946bff9cca8455c8972610ce7be285e25a78994ae49df` |
