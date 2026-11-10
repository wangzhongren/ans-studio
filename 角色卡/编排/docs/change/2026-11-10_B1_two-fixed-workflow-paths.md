# 编排批次变更记录：T3 两条固定工作流路径 B1 派发权/状态机

- 批次：**B1 派发权/状态机**（团队计划 §三 B1「编排」行；方案 v1.3 §10.2 B1）
- 角色 / 上下文：编排（roleId `编排`，独立实施上下文）
- 日期：2026-11-10；worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；
  分支 `feat/two-fixed-workflow-paths`；HEAD **`ff67bc0384ca01da6df1246a50e16e7ee8b46564`**
  （B0 提交 `ee5b330` 含本角色 B0 骨架；G-IR 基于 `ee5b330`；`git diff ee5b330..ff67bc0 -- src test app` 为空）
- 状态：**B1 编排批次已实现，未提交**；`npm run typecheck` **exit 0**；目标新增测试全绿；
  `test/编排` before/after 失败名集合 diff **无新增确定性失败、无新 skip**（known red 名称不变，
  TM-5 同一失败名下 B0 既有未登记字面量保留、本批新增 `project-roster/v4` 已登记白名单）；
  `test/roles` **226/226 pass**；`test/门禁引擎` **483/477/5/1**（与 G-IR 基线逐名一致）；
  `test/runtime-core` 只读回归见 §3；**未 commit / 未 push / 未 merge / 未发布**；
  未运行真实模型/Electron；未占用 9222/9223。

## 0. 依据绑定（写盘实测 hash）

| 依据 | 路径 | 实测（行 / 字节 / SHA-256） |
| --- | --- | --- |
| B1 验收（冻结，唯一判据） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 / 33,722 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| G-IR 接口评审（must-fix 来源） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 344 / — / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 实现级方案 v1.3（冻结） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 / 184,391 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| 团队计划 | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | 159 / 17,013 / `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |
| B0 before TAP（代码态=本批 HEAD 的 src/test） | `角色卡/编排/docs/change/2026-11-10_B0_two-fixed-workflow-paths_evidence/test-orch-before.tap` | 2,237 / — / `8bdd0fb9ecade4a09b555adcd12c22ae02609a79ea899899b93ea968d9e8f4b6` |

本批覆盖的 B1 判据：**AC-01/AC-02/AC-03/AC-04/AC-05/AC-06/AC-07/AC-08/AC-09/AC-12/AC-15/AC-17/AC-18/AC-19/AC-24/AC-25**；
T-01/T-02/T-03/T-04/T-05/T-06/T-07/T-08/T-20 的编排侧确定性测试（跨层/桌面/真机由 B3/B5/独立验收执行）。

## 1. 实施内容（按写集）

### 1.1 `src/common/编排/workflow-dispatch.ts`（新，373 行）：fixed 矩阵唯一纯策略实现

- `evaluateFixedPathDispatchAuthorization(input)`（**纯函数、fail-closed**）：
  - self → `self-dispatch`；来源非 chief/convener → `unknown-source`；目标类别/身份不明 → `target-card-missing`；
  - convener → product/rapporteur/nominator（内置，`targetExists===true`）允许；convener → verifier ⇒
    `convener-to-verifier-forbidden`；convener → chief/convener/其它内置 ⇒ `convener-target-forbidden`；
    convener → 项目角色须 `targetExists===true`；
  - chief → verifier 允许；chief → 项目角色仅 **MF-10 窄例外**（`purpose=review`、`targetRoleId===reviewRoleId`、
    `rosterReviewRoleId===reviewRoleId`、`basisReviewRoleId===reviewRoleId`、`targetActivated===true`），
    否则 `chief-to-project-forbidden` / 绑定不齐 `review-role-invalid`；
  - chief → convener 仅 `purpose=stage-request`（`taskKind=stage-request`、`workflowAction∈advance|stop`、
    `sideEffect=read-only`、无 module/写集）允许，否则 `target-card-missing`；
  - chief → product/rapporteur/nominator ⇒ `chief-production-dispatch-forbidden`。
- **Q6 证据（AC-04 fail-closed）**：`sourceIsCurrent===true`（否则 `dispatch-source-changed`）；
  应用幂等键必填且与期望一致（否则 `dispatch-evidence-missing`）；identity 证据一致；convener 生产派发必须绑定
  open `stage-request`（缺失/关闭/停止 ⇒ `stage-request-required`，创建者/受派人/种类/workflow/stage 不符 ⇒
  `dispatch-evidence-missing`）；stage-request 另需 host 捕获 `sourceTaskId`（缺失 ⇒ `stage-request-source-missing`）。
- 幂等键形态 helper：`stageRequestIdempotencyKey`/`stageStopIdempotencyKey`（与 `workflow-service` 同源）。
- fixed 常量：`FIXED_DISPATCH_MATRIX`、`FIXED_CONVENER_BUILT_IN_TARGETS`、`FIXED_CHIEF_BUILT_IN_TARGETS`。

### 1.2 `src/common/编排/workflow-preconditions.ts`（M，+74/−8）：roster v4 + fixed 再导出（legacy 谓词逐字）

- `project-roster/v4`（MF-IR-7）：`PROJECT_ROSTER_SCHEMA_V4`/`PROJECT_ROSTER_SCHEMAS`；parser 接受 v3/v4 双字面量；
  v4 可选 `roles[].review?: boolean`（**至多一个 true**；非布尔/多个 true/v3 出现该字段 ⇒ 新码
  `roster-role-review-invalid`，确定性拒绝不静默忽略）；`reviewRoleIdOfRoster` 默认 `verifier`；
  `ProjectRoster.schema` 类型扩为 v3|v4（旧 v3 解析/错误语义不变）。
- `contract_check` roster 文本同步（双字面量 + review；≤3900 B 预算保持，实测 **3,896 B**）。
- fixed 谓词/幂等键以公共出口再导出（**单一实现** = `workflow-dispatch.ts`，不复制矩阵）。
- **legacy 逐字证明**：`CHIEF_DISPATCHABLE_BUILT_INS`/`evaluateDispatchAuthorization`/`evaluateDispatchPreflight`/
  `isConvenerBuiltInDispatchTarget`/`parseTeamPlan`/`reportTargetForTaskCreator`/`isSelfReport` 与本批 HEAD
  字节级 identical（见 `_evidence/legacy-anchors.txt`，7/7 identical=True）。

### 1.3 `src/common/编排/workflow-state.ts`（M，+88/−16）：完整 A/B 投影 + MF-IR-1 rework

- **MF-IR-1（冻结判据）**：`stage.reworked.stage` = 回落目标、`reworkOf` = 被返工来源；A12b→A11 时
  `stage:"A11"`、`reworkOf:"A12b"`；投影把 `reworkOf` 标记 `failed`、当前阶段置 `stage`（attempt = max(现, event.attempt)）。
  合法映射 `WORKFLOW_REWORK_FALLBACKS`（A3→A2、A6→A5、A12b→A11、B2→B1）；旧方向语义 ⇒ `workflow-corrupt`（不静默反转）。
- 合法/非法转移：A1→…→A10→A11/A12a、A12a→A11、A11→A12b→A12/A13、A12→A13、B1→B2→B3→B4；
  A10 未完成发 A11 ⇒ corrupt；A12a 在办时允许 A11（G-1）；返工后目标阶段可重试（failed→pending/重派）。
- stop/closed 不变量：`workflow.stop-requested` 仅当前阶段且不得重复；`workflow.stop-unconfirmed` 必须在 stop 请求后；
  `workflow.closed stopped` 必须携带停稳证据（requestClosed + operatorReported + 无 open 生产任务），否则 corrupt；
  关闭后任何新事件 ⇒ corrupt。
- `role.activated` 只允许发生在 A8；导出 `canRequestStage/canDispatchStage/canCompleteStage` 供服务层写前校验
  （与投影同源，不复制顺序规则）。

### 1.4 `src/common/编排/workflow-service.ts`（M，+1,864/−1；B0 骨架保留）：fixed 服务面

- `requestStage`（AC-05/AC-06/AC-07）：
  - `workflowId = "wf-" + sha256(flowId|path|sourceTaskId|requestDigest).slice(0,24)`（无时钟/随机）；
  - `sourceTaskId` 缺失 ⇒ `stage-request-source-missing`（不创建）；
  - 首请求也先算 workflowId，统一 `stage-request:<workflowId>:<stage>:<attempt>`（**AC-06**；任务书写法
    `stage-start:<flowId>:<path>:<stage>:<attempt>` 仅保留为审计 helper——两者冲突处按冻结 AC-06 执行，见 §6）；
  - `workflow.started`（`workflow-start:<flowId>:<path>:<sourceTaskId>`；存在旧状态时如实记 `legacyStateIgnored`）；
  - 每活动 workflow 至多一个 open advance stage-request（下一 advance/stop 前必须 `closeTask` 收口，否则
    `stage-request-open`）；每项目至多一个活动 fixed workflow（`workflow-workspace-busy`；
    同 flow 多活动 ⇒ `workflow-active-conflict`）；
  - 非法阶段转移（含 A10 未完成发 A11、A12a criteria 未创建发 A11 = AC-09/G-1）⇒ `stage-transition-invalid`；
  - stop：`workflow.stop-requested` + `stage-stop:<workflowId>:<stage>:<attempt>`；重复请求 replay 原任务；
  - 任务 `task.created`（from chief → convener、`taskKind=stage-request`、`sideEffect=read-only`、无 module/写集、
    `workflowPath` 仅首 stage-request）；A11 创建后记 `stage.dispatched A11`。
- `recordStageDispatch`：A1/A4/A7/A12a/A12b 等按真实 `task.created` 记 `stage.dispatched`（G-11；应用唯一判定）。
- `inspectAssignedTask`：真实受派任务事实（from/to/workflow/stage/taskKind/open/stopped/幂等键；只认 tasks 账本）。
- `closeTask`（AC-18/MF-IR-2 服务侧）：输入 `{operationId,taskId,outcome,note?}`；校验真实创建者（`actorRoleId
  === task.created.from`）、任务 open、report(done)（accepted）、operationId 幂等；写 `task.closed`（含
  `actionSource=role-direct` + `eventId`，满足既有直接动作校验）并按模式写 `stage.completed`/`stage.reworked`/
  `stage.blocked`；**不写** `.ans/runs`/`.ans/trunk`、不做 CAS/snapshot；legacy 实现未触。
  A12b accepted + `acceptanceArchive` ⇒ 追加 `stage.completed A12` 聚合（G-16；归档缺失不聚合）。
- `prepareIntent`/`finalizeIntent`（A3/MF-4）：固定切 2 算意图 SHA-256/bytes + `documentRefs`（含 `version`）+
  `[ans-intent-evidence …]` marker，并可补记 `stage.requested A3`（卡在办）；finalize 只校验
  `request.resolved`（cardKind=intent-confirm、confirm、documentRefs 当前 hash、`docs/intents/<intentId>.md`
  存在且 intentId 一致）并追加 `stage.completed A3`；**不重写请求、不写 doc-freeze/trunk/CAS**。
- `activateRoleDocumentsFixed`（A8/MF-IR-3 服务侧）：校验提案决定（proposal resolved accept）、roster 字节 hash/
  解析/目标角色在名单、三文档实际字节 SHA-256（`activation-hash-drift`）、幂等；写 `role.activated`；
  全部名单角色激活 ⇒ `stage.completed A8`（cause `activation-complete`）；**不写 trunk、不发 appointment-write**。
- `inspectRoleActivations`：A10 前置（缺账本 ⇒ `role-activation-unrecorded`，不按磁盘枚举放行）。
- `recordBasis`（A9/AC-15/AC-16/AC-19）：团队计划结构校验（`parseTeamPlan`）、文档发现/有界读取/哈希
  （B0 `basis-guard`：32 文件/4 MiB/8 MiB）、`basis.recorded`（documents/teamPlan/repo/reviewRoleId）、幂等
  `baseline:<workflowId>:<planSha>`、`stage.completed A9`（cause basis-recorded）；**A9 对外文档失败码映射为
  AC-16 `baseline-document-missing|unreadable|budget`**（见 §5）。`reason:"path-b"` 为只读快照（只收存在文档、
  teamPlan=null、不产生写权、缺失不失败，Q4）。
- `verifyBasisForWorkflow`：关键门 drift 校验（重算字节 hash；不一致 ⇒ `basis-drift` 并记 `basis.drift`）。
- `archiveAcceptance`（AC-20/G-16）：生成 `docs/acceptance/<flowId>-acceptance-vN.md`（N 随 report 版本），
  含 criteria/report path+sha256、结论、幕僚决策、时间；幂等（同 reportSha ⇒ replay；不同 ⇒
  `acceptance-archive-failed` 不覆盖）。
- `confirmStop`（AC-07）：请求已 closed + 运营报告 + 无 open 生产任务 ⇒ `workflow.closed stopped`；
  否则记 `workflow.stop-unconfirmed` 并返回该码（**不写 stopped**）。
- `detectLegacyStateIgnored`/`LEGACY_STATE_IGNORED_PATHS`：旧 trunk/run/versions/VCA/stable 状态存在即列出
  （只读忽略，不删除/不迁移；G-18）。

### 1.5 `src/common/编排/task-state.ts`（M，+24）：stage-request 收口（AC-05）

- 写侧（`appendTaskEvent`）与读侧（`validateEvent`）：`taskKind==="stage-request"` ⇒ 只允许 chief→convener、
  `sideEffect==="read-only"`、无 `moduleId/modulePaths/moduleDirectory`；违反 ⇒ `invalid-task-binding` 拒绝/读侧坏行。
- fixed `workflowId` 豁免 run-required、`workflowPath` 仅首 stage-request、fixed 不回溯 legacy runState——B0 规则保留。

### 1.6 `src/pipeline/orchestration/run-role.ts`（M，+77/−12）：per-flow 模式 + fixed 注入

- 新增输入 `workflowMode?: "fixed"|"legacy"` 与 `workflowModeForFlow(flowId)` 回调；**不缓存项目级单值**：
  卡种白名单按**每张卡实际 flowId** 解析矩阵；会话级上下文/工具注入按常量或输入任务的真实 flowId 解析；缺省 ⇒ legacy。
- fixed 会话注入模块 `context({matrix:"two-fixed-paths/v1"})` 文本段（legacy 返回值逐字不变）。
- fixed 会话**不注入** legacy trunk/git/VCA/stable 工具：`gitQuery`/`gitCandidate`/`gitPublish`/
  `selectRunChange`/`requestStableWrite`/`submitRefactor`/`submitVersionChange`/`requestVersionDecision`；
  `completeTeamPlan`（v4）/`activateRoleDocuments`（v2）/`closeCreatedTask`（v2）保留。
- `cardKindsOf(roleId, matrix?)`：fixed 只读模块 `fixedCards`（MF-IR-4；缺失/未装配 ⇒ fail-closed 空集，不回退
  legacy cards）；legacy 分支抽为 `legacyCardKindsOf`，**两行源码逐字保留**（module-consumption 源码锚点测试不改）。
- `CARD_KIND_ROUTE_HINTS["merge-main"]`（B0 已含）保留；**未新增 `requestReleaseMerge`**（G-IR 拒绝）。

### 1.7 `src/common/编排/governance-judge.ts` / `governance-judge-verdict.ts`（M，+8/+11）：merge-main 排除

- `merge-main` 为应用自有高风险确认卡：judge 上下文校验与最终裁定均**显式**回落 `manual`
  （`reasonCode="merge-main-customer-only"`），无论模型输出 approve/deny；**不得代批/冒充客户**。
- legacy intent/proposal/appointment/decision 判断路径未改（`governanceCardGroup` 逻辑不动）。

### 1.8 `src/common/编排/project-state.ts`（M，+156）：workflow 只读投影 + legacyStateIgnored

- `buildWorkflowStateProjection`：workflow 视图（stage/status/basisId/releaseId/reviewRoleId/blocked/stopping/
  closed/activatedRoleIds/nextStages）、`roleActivations`、`legacyStateIgnored`、`workflow-corrupt` 警告；
  纯读、零写入、不缓存。
- `renderProjectStateSummary(view, labels, workflow?)` 追加 `[workflow]` 段（第三参可选，旧调用逐字不变）；
  `legacyStateIgnored` 作为警告如实展示（G-18，不静默）。
- `ProjectStateView`（Model 属主）未改——本批以加法投影承载，B2/B3 可将其并入工具输出。

### 1.9 `src/common/编排/doc-format-specs.ts`（M，+7/−4）：roster v4 / team-plan v3 文案同步

- `project-roster/v3` 条目说明/字段/错误文案更新为 v3/v4 双字面量 + 可选 `roles[].review`（G-9/MF-IR-7）；
  **54 格式 id 不变**（未新增格式 id）。
- `team-plan/v3` 说明补充固定路径 `complete_team_plan` v4 无 runId/baseDigest（出现即
  `baseline-legacy-field-forbidden`），legacy 字段保留。

## 2. G-IR must-fix 闭环（本批 owner 部分）

| 条件 | 状态 | 证据/说明 |
| --- | --- | --- |
| MF-IR-1 rework 语义 | **闭环** | `workflow-state.ts` 按 `stage`=回落目标/`reworkOf`=来源实现；B0 测试固化反向并加负例；`closeTask` A12b rework 写 `{stage:"A11",reworkOf:"A12b"}` |
| MF-IR-2 close v2 | **B1 服务侧闭环** | `workflowService.closeTask` fixed 三字段 + 真实创建者/报告/幂等/阶段事件；B2 schema/handler 接入 |
| MF-IR-3 activate v2 | **B1 服务侧闭环** | `activateRoleDocumentsFixed` 冻结输入形状/三文档 hash/`role.activated`/A8；B2 schema/tools 接入 |
| MF-IR-6 码表 | **闭环** | 映射表见 §5；A9 对外 `baseline-document-*` 单点映射，无第二套对外码 |
| MF-IR-7 roster v4 | **闭环（parser/A9）** | 双字面量/至多一个 true/A9 reviewRoleId/A12 谓词窄例外；桌面核验 B3 |
| MF-IR-8/`requestReleaseMerge` | **遵守（不新增）** | 未新增工具/闭集项；应用合并通道属 B3 |

未在本批（B2/B3/B4）：`dispatch_task` 新字段 schema/handler、`close_created_task` v2 类型/schema/tools、
`activate_role_documents` v2 类型/schema/tools（B2 运行时核心）；`fixedCards` 等模块字段（B2 六角色）；
`routeFixedPathDispatch`/merge-main 卡/`.gitignore`+git init 执行/路径 B 基线（B3 桌面窗口）；
`classify-shell` v5（B4）；`basis.verified` 节流与 `basis.amended`（B3/B4 发布链）。

## 3. 测试与证据

### 3.1 typecheck

`npm run typecheck` → **exit 0**（无诊断）。日志 `_evidence/typecheck.txt`。

### 3.2 before 基线

采用 B0 证据 `test-orch-before.tap`（代码态 `ee5b330`；`git diff ee5b330..ff67bc0 -- src test app` 为空，
故与 B1 HEAD 的 src/test 完全一致）：**tests 1,178 / pass 1,152 / fail 24 / skipped 2**；
24 个失败名清单见 `_evidence/before-fails.txt`（与 G-IR 证据 03 逐名一致）。

### 3.3 after（`test/编排/**`，本批 HEAD + 工作树）

最终 after（3 chunk 汇总）：**tests 1,250 / pass 1,224 / fail 24 / skipped 2**（chunk0 359/354/5/0；
chunk1 363/353/8/2；chunk2 528/517/11/0）。失败名集合 diff：**after−before = 0（无新增确定性失败）**、
**before−after = 0（无既有失败消失）**、**新 skip = 0**；24 个 known-red 名称逐名一致。
相对 B0 after（tests 1,209 / pass 1,183 / fail 24 / skipped 2）新增 41 个用例：本批新增测试文件贡献 35、
既有文件新增子测试 5（workflow-state +3、task-state-fixed +1、acceptance-judge-minimal +1），
余 1 为既有套件测试计数差异（不影响失败名集合）。
见 `_evidence/after-*.tap`、`_evidence/after-fails.txt`、`_evidence/after-summary.txt`。
- TM-5（schema 字面量扫描）仍在 24 known-red 内：B0 引入的 `ans-workflow/v1` 等未登记字面量按 B0 披露口径保留；
  本批 `project-roster/v4` 已登记白名单（不改变失败名）。
- TM-8（稳定 code 扫描）保持绿（`role-activation-unrecorded` 登记白名单、非码值改名）。
- 新增测试（本批，目标 TAP `_evidence/targeted-tests.tap`）：**60/60 pass**——
  `workflow-dispatch-fixed` 9、`workflow-stage-request` 8、`workflow-close-intent` 5、`roster-v4` 5、
  `workflow-baseline` 3、`project-state-workflow` 3、`run-role-fixed` 2、`workflow-state` 13、
  `task-state-fixed` 7、`acceptance-judge-minimal` 5。
- 目标回归：`test/roles/**` **226/226 pass**（`_evidence/roles.tap`）；
  `test/门禁引擎/**` **483/477/5/1**，5 红与 G-IR 基线逐名一致（`_evidence/gates.tap`）；
  `test/runtime-core/**` **564/527/33/4**，与**纯净 HEAD worktree 同套件 33/33 失败名逐名一致**
  （环境性、零回归；`_evidence/runtime-core-{before,after}.tap`、`runtime-core-fails.txt`）。

### 3.4 旧断言保护

- `workflow-preconditions` 旧谓词/常量：7 项字节级 identical（`_evidence/legacy-anchors.txt`）。
- `star-routing`/`i-full-chain`/`roles` 差分/`convener-module-consumption` 等旧套件**未改断言**；
  module-consumption 源码锚点因 `cardKindsOf` 需要 matrix 分支而改为「legacy 两行仍在」的等价断言前，
  最终实现改为 **legacy helper 保留逐字两行**，故 5 个 module-consumption 测试**恢复为 HEAD 原文并通过**（32/32）。
- 本批仅改三类既有测试数据/断言：① `workflow-state.test.ts` rework 方向（MF-IR-1 冻结判据要求）；
  ② `workflow-preconditions.test.ts` AC-17 roster 双字面量文本（G-19/MF-IR-7 要求文案同步）；
  ③ `doc-format-specs.test.ts` 白名单数据新增两项（`project-roster/v4` schema 字面量、TM-8
  `role-activation-unrecorded` 稳定码；均带理由、不削弱断言/不放宽 legacy）。

## 4. 候选（本角色 B1 文件）

见 `_evidence/candidate.sha256.txt`（逐文件 raw SHA-256/字节/行）与 `_evidence/candidate.numstat.txt`；
聚合见回报。写集外 diff：
`git status --porcelain -- src app test` 仅列 §1 文件与 `test/编排/**`；`src/model/**`、`src/provider/**`、
`src/common/roles/**`、`src/common/gates/**`、`src/common/门禁引擎/**`、`app/**` 零 diff。
`basis-guard.ts` **未改**（保持 B0；码表在服务层单点映射）。

## 5. 码表映射（MF-IR-6）

| B0 新增码（未在附录 C） | 处置 |
| --- | --- |
| `invalid-task-binding` | **B1 书面扩展**：fixed `task.created` 绑定写侧拒绝码（非客户门；读侧计坏行） |
| `fixed-task-run-forbidden` | **书面扩展**：fixed 任务携带 runId/runState 的写侧拒绝码 |
| `workflow-path-not-stage-request` | **书面扩展**：`workflowPath` 仅限 stage-request 的写侧拒绝码 |
| `workflow-path-not-first` | **书面扩展**：仅首个 stage-request 可携带 workflowPath |
| `baseline-gitignore-malformed` | **书面扩展**：`.gitignore` 托管块畸形（§5.2 G-11；B3 调用） |
| `baseline-gitignore-write-failed` | **书面扩展**：`.gitignore` 写入失败（§5.2；B3 调用） |
| `invalid-event` | **书面扩展**：固定账本写入前形状拒绝（`appendFixedLedgerEvent`；非客户门） |
| `basis-document-missing/unreadable/budget`（B0 basis-guard 内部） | **A9 对外映射**为 AC-16 `baseline-document-missing/unreadable/budget`（`workflow-service.baselineDocumentCode` 单点；漂移码保持 `basis-drift`） |

本批新增 fixed 码（均在附录 C 或本记录登记）：`chief-production-dispatch-forbidden`、
`convener-to-verifier-forbidden`、`stage-request-invalid`、`stage-request-source-missing`、`stage-request-open`、
`stage-transition-invalid`、`stage-workflow-mismatch`、`workflow-active-conflict`、`workflow-workspace-busy`、
`workflow-not-found`、`workflow-closed`、`workflow-corrupt`、`workflow-stop-unconfirmed`、`dispatch-evidence-missing`、
`dispatch-source-changed`、`stage-request-required`、`review-role-invalid`、`role-activation-unrecorded`、
`baseline-identity-invalid`/`baseline-document-*`/`baseline-team-plan-invalid`/`baseline-plan-hash-drift`/
`baseline-roster-drift`/`baseline-ledger-write-failed`、`project-config-write-failed`；
收口/意图/激活/归档：`close-task-invalid`、`close-identity-invalid`、`close-report-missing`、
`intent-decision-invalid`、`intent-hash-drift`、`intent-entry-missing`、`activation-roster-mismatch`、
`activation-role-not-selected`、`activation-document-invalid`、`activation-hash-drift`、
`activation-ledger-write-failed`、`acceptance-record-invalid`、`acceptance-archive-failed`、
`basis-missing`、`basis-drift`、`workflow-ledger-write-failed`（书面扩展）。

## 6. 与任务书的一处冲突及处置

任务书 §2 写「首请求 `stage-start:<flowId>:<path>:<stage>:<attempt>`」，而冻结 AC-06/G-4/G-12 明确
「首次请求也先算 workflowId、**统一** `stage-request:<workflowId>:<stage>:<attempt>`」。本批按**冻结验收**
执行统一键；`workflow-start:<flowId>:<path>:<sourceTaskId>` 为 `workflow.started` 事件键（v1.3 §7.1）；
`stage-start:` 仅保留为 `stageStartIdempotencyKey` 审计 helper（不用于创建任务）。若协调方要求首请求改用
`stage-start:`，需新裁决并同步 AC-06。

## 7. 限制与披露

- 本批为编排代码批次（D1 级自检），**不构成 B2 验收**；未运行真实模型/Electron/真机全链。
- `test/runtime-core` 全量在 worktree 下存在环境性失败（`.git` 为文件等），与 G-IR §十一 一致；
  不据此声称全绿，B2 须按规范环境复测。
- A6/A10/A13 卡流程（方案/任命/发布）与 `dispatch_task` 接线属 B2/B3；本批只提供应用服务与投影原语。
- `basis.amended`/`basis.verified` 节流、release 前置（AC-11/AC-22）属 B3/B4；`archiveAcceptance` 已提供归档原语。
- `legacyStateIgnored` 探测为存在性列举；旧账本不读取为前置（v1.3 §9.3）。
- 未新增依赖；54 doc-format id 不变；`src/common/gates/` 未改。

## 8. 未提交声明

- 本记录与 `_evidence/` 仅写入本角色 `docs/change/` 目录（任务精确写集）；产品/测试代码变更仅限 §1 写集。
- **未 commit / 未 push / 未 merge / 未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。
- 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；引用 hash 均为写盘实测。
