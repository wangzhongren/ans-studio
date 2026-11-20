# 变更记录：Block 解法路由——编排/模型地基（block resolver 第一批）

- 日期：2026-11-20
- 角色：ANS 内置「编排」（编排/模型侧实现；客户 2026-11-20 原则 + 协调方裁定已授权）
- 分支/工作树：`feat/block-resolver`（worktree `.claude/worktrees/feat-block-resolver`；HEAD 起点 `694ea9c` = origin/main，含 app-dispatch v2.2 第一步；本记录未提交）
- 设计依据（权威）：`docs/planning/2026-11-20_design_block-resolution-paths.md` §三–§七、§九；
  Q1–Q10 全部采纳默认；协调方 Q4 最终澄清：**终止只能由客户在决策卡中显式选择，judge 永不选择；
  终止是 decided 的结果，不是停止态**。客户原则：所有 block 必须有解法，终态只有 `fixed` / `decided`，无 `stopped`。
- 范围：**只改编排/模型侧**。未改 `app/desktop/**`、`test/**`、门禁文本、`src/common/roles/**`、workflow 资源、
  `release.yml`/release-policy；未 commit/push/CI/tag；未读 `.env`；未占 9222/9223/9224。

## 一、实现了什么（对照设计）

1. **纯分类器 `src/common/编排/block-resolution.ts`（新；无 I/O/时钟/随机）**
   - 9 类 `BlockClass`（`missing-resource`…`budget-quota`，§三表序即优先级）；判定只认错误码/结构化事实
     （`code`/`detailCode`/`highRisk`/`stateConflict`/证据/账本事实），`summary` 仅审计展示、**不参与分类**；
   - 事实输入 `BlockFact`（protocol/workflowId/flowId/stage/taskId/requestId/code/kind/source/reportStatus/
     evidencePaths/Hashes/attempts/fingerprintMaterial/highRisk/judgeAvailable/priorOccurrences 等）；
   - 分类顺序：重复指纹（B7）→ 显式 highRisk（B4）→ `detailCode` → `code` → 事实信号 → 兜底 B8；
   - 码→类全表（附录 A + P1–P51 所用码 + app-dispatch 码 + shell 码）；`detailCode` 二级码表（更具体，优先）。
2. **路由决策 `decideBlockRoute(fact, policy)`（无 stop 分支）**
   - 路由 kind 仅 `engine-auto-fix | owner-repair | judge-decision | customer-decision | escalated`；
   - B1 属主修复（外部物料 ⇒ 客户）；B2 引擎能力路由（需授权 ⇒ 客户）；B3 judge（开关开+唯一推荐）/客户；
     B4 永远客户主权；B5 有界自动恢复 → 属主（安全门/上限）→ 客户；B6 引擎修复 → 属主/客户；B7 只升级
     （executor-replace / owner-reassign / customer-decision / engine-repair，**不是终态**）；B8 属主返工/换人；
     B9 judge（仅 `judgeEligible` 业务取舍）/客户（含终止主权项）；
   - `highRisk/sovereign/needsJudge/requiresCustomer/owner/repair/resume/escalation/repeat` 字段齐备；
   - `isStopFreeRoute()` 提供 AC-1 便捷断言；`block-terminate-flow` **永不作为推荐项**。
3. **指纹 / blockId / 幂等键（§5.2）**
   - `computeBlockFingerprint`（SHA-256(JSON(材料))；材料缺省按 code/kind/detail/workflow/stage/taskId/证据 hash 稳定派生）；
   - `computeBlockId = sha256(protocol|workflowId|stage|taskId|code|fingerprint).slice(0,24)`；
   - `blockIdempotencyKey(blockId, kind, attempt) = block:<blockId>:<kind>:<attempt>`；
   - 重复阈值默认 2；`resolveBlockTimings` 默认 `T_stall=12min`、`T_repair=10min`、`T_remind=30min`（可配置注入）；
     自动修复尝试上限默认 2。
4. **事实适配器（供 workflow-service / 桌面 router）**
   - `blockFactFromStageBlocked`（`stage.blocked` 事件）、`blockFactFromTaskReport`（`task.reported` 的 blocked/failed；
     done ⇒ 不是 block）、`blockFactFromDispatchRejection` / `blockFactFromServiceFailure`（fixed 矩阵码 /
     `workflow-binding-unavailable` / `b-change-scope-invalid` / `stage-request-removed` / `workflow-protocol-mismatch` /
     `workflow-corrupt` / shell 码等）、`blockFactFromReconcileReceipt`（corrupt/errors ⇒ B6）、
     `blockFactFromStallTick`（≥T_stall 且无在飞回合/待答卡/open 修复任务才产生；时间非法不猜）、
     `blockFactFromShellDenial`（c-deny/a-*/judge deny/manual/retry-capped/escalation）；
   - **P1–P51 点位矩阵**：`BLOCK_POINTS`（每点位含代表码、允许类、canonical 事实、默认策略期望类/路由）、
     `blockFactForPoint(point, overrides)`、`validateBlockPointMatrix()`（自检零遗漏）。
5. **卡选项词表与装配**
   - 选项 id 单一来源 = `src/model/runtime.ts`：
     `BLOCK_DECISION_OPTION_IDS`（block-revise-scope/block-rework/block-replace-executor/block-retry-with-cap/
     block-accept-with-limits）与 `BLOCK_SOVEREIGN_OPTION_IDS`（block-terminate-flow/block-grant-exception/
     block-accept-current-state/block-merge-main/block-stable-write）+ 类型/守卫；
   - `BLOCK_OPTION_SPECS`（id/label/后果文案/主权标记）；`blockCardOptionsFor(cls, fact, variant)` 每类 2–4 项、
     恰一 recommended（修复向；终止永不推荐）；judge 变体只含 `block-decision` 词汇；
     `blockCardAllowsJudge()` / `validateBlockCardOptions()`；卡复用 `cardKind:"decision"`、应用发行。
6. **block 生命周期账本 `src/common/编排/block-ledger.ts`（新；I/O）**
   - `.ans/state/blocks.jsonl`，schema `block/v1`（独立账本，不混入 `workflows.jsonl`，不做第二套阶段状态）；
     事件 `block.raised/routed/resolved/escalated`，字段按 §5.2；
   - append-only；同幂等键 replay 返回原事件；坏行如实计数并在**写入时 fail-closed**（`block-ledger-corrupt`）；
   - `resolution ∈ {fixed, decided}`（`stopped` 被 schema 守卫拒绝）；`decided` 只能由 judge/customer 结算且
     必须有 `decisionId`（provenance 诚实）；`escalated` 不是终态（resolved 前必须先 routed）；
   - `raiseBlock` 按同指纹计数补全 `priorOccurrences`（≥阈值 ⇒ class=repeat-rejection）；`routeBlock` 在
     `raised` 状态 + 同指纹 ≥ 阈值时拒绝（`block-repeat-escalation-required`，必须先 `escalateBlock`）；
   - 查询：`replayBlockLifecycles`（生命周期重放/非法顺序 errors）、`listOpenBlocks`（blockId/workflowId/flowId 过滤）、
     `summarizeOpenBlocks`（blockId/class/status/owner/waitingOn/ageMs/evidenceRefs）、`readOpenBlockProjection`。
7. **project_state 只读 open blocks（§5.2/§7.5）**
   - `buildProjectStateView` 新增可选 `openBlocks?: ProjectStateOpenBlock[]`（resolved 不展示；escalated 也是 open）；
     不改变 workflows/tasks 投影；旧项目无 blocks 账本 ⇒ 字段缺席（兼容）；
   - `buildWorkflowStateProjection` 新增 `openBlocks` 与 `block-ledger-bad-lines` 警告；
     `renderProjectStateSummary` 追加 `[blocks]` 段（可见等待，不是无声暂停）；非 chief 角色按 focus/本人任务 flow 裁剪。
8. **workflow-definitions 版本化（Q5/Q10）**
   - `WORKFLOW_DEFINITION_VERSION = 2`；新增 `WORKFLOW_DEFINITION_VERSIONS=[1,2]`、`WorkflowDefinitionVersion`、
     `WORKFLOW_DEFINITION_BY_VERSION`（`[id][version]` 双版本、深度冻结）、`WORKFLOW_DEFINITION_HASHES_BY_VERSION`；
   - v2 = 同一数据、仅 `retry.onExhausted:"route-block-resolver"`；v1 = 旧数据 `"blocked"` **逐字保留**；
     v1 定义 hash 与变更前注册表**完全一致**（证据：`add ef7720c1…ecbee`、`modify 4bea23eb…4bb6`），
     在飞 app-dispatch/v1 workflow 的 `definition.sha256` 对账零失败（Q10 不迁移）；
   - `getWorkflowDefinition(id, version?)`：缺省 ⇒ v2；显式 1/2 ⇒ 对应版本与对应 hash；其它 ⇒
     `workflow-definition-version-unsupported`；未知 id 仍 `workflow-definition-unknown`；
   - `listWorkflowDefinitions()` 返回当前 v2；`workflowDefinitionVersionsOf(id)` 返回 v1/v2；
     Schema `onExhausted` enum 两值；`validateWorkflowDefinitions()` 按版本逐项自检（阶段集/转移/返工/边/
     executor/taskKind/retry 语义/onExhausted 版本语义），双版本阶段覆盖恰一。
9. **workflow-service 事实出口（不调用 resolver / 不写 blocks 账本；阶段/收口/错误码语义不变）**
   - `WorkflowServiceFailure.blockFact?`；`requestStage`/`recordStageDispatch` 的主要拒绝类（invalid/
     source-missing/not-found/corrupt/conflict/busy/closed/protocol-mismatch/stage-request-removed/
     b2-forbidden/open/transition-invalid/attempt 非法/task-required/mismatch）附可序列化事实；
   - `observeAppDispatchTaskReport` 的重试耗尽 / 高风险零重派 blocked ⇒ receipt `blockFact`
     （`retry-budget-exhausted` B9 / `high-risk-blocked` B4）；
   - `reconcileFixedWorkflow` 每个 workflow 的 `corrupt`/`errors` ⇒ receipt `blockFacts[]`（B6）；
   - `viewFailure(view, protocol)` 对 `workflow-corrupt` 附 blockFact（app-dispatch 调用点显式传协议）；
   - `stage.blocked` 事件事实锚点不变；由 `blockFactFromStageBlocked` 适配（不新增账本字段）；
   - **`resolveAppDispatchReviewRole` 名单不可读不再静默回落 verifier**：返回
     `review-role-unavailable`（message 明确「不静默回落」）+ `blockFact`（B1，`roster-unreadable`，
     属主 rapporteur）；名单可读但无 `roles[].review` ⇒ 仍按 Q3 默认 verifier（语义不变）。
10. **测试/自检资产**：`.tmp-block-selfcheck.mjs`（worktree 内未跟踪；364 assertions）；本记录。

## 二、API 面（给桌面 R2 / 测试批）

### Model（`src/model/runtime.ts`）
- `BLOCK_DECISION_OPTION_IDS` / `BLOCK_SOVEREIGN_OPTION_IDS` / `BLOCK_OPTION_IDS` / `BLOCK_TERMINATE_OPTION_ID`；
- 类型 `BlockDecisionOptionId` / `BlockSovereignOptionId` / `BlockOptionId`；
- 守卫 `isBlockDecisionOptionId` / `isBlockSovereignOptionId` / `isBlockOptionId`。
- 桌面接线：`block-sovereign` 词汇并入 `isApplicationDecisionReservedForCustomer` 排除面；judge 结算拒绝任何
  `block-terminate-flow`/`block-merge-main`/`block-stable-write`/`block-accept-current-state`/`block-grant-exception`。

### 编排（`src/common/编排/block-resolution.ts`）
- 类型：`BlockClass`/`BlockClassCode`/`BlockProtocol`/`BlockFactKind`/`BlockFact`/`BlockTimings`/
  `BlockResolverPolicy`/`BlockClassification`/`BlockRouteKind`/`BlockRouteDecision`/`BlockRouteOwner`/
  `BlockOwnerKind`/`BlockResumeAction`/`BlockEscalationTarget`/`BlockEscalationReason`/`BlockCardOption`/
  `BlockOptionSpec`/`BlockPointId`/`BlockPointDefinition`/`BlockStallTick`/`BlockShellDenialReason`/
  `BlockDispatchRejectionInput`；
- 常量：`BLOCK_CLASS_DEFINITIONS`/`BLOCK_CLASSES`/`BLOCK_PROTOCOLS`/`BLOCK_FACT_KINDS`/`BLOCK_OPTION_SPECS`/
  `BLOCK_ROUTE_KINDS`/`BLOCK_ESCALATION_TARGETS`/`BLOCK_ESCALATION_REASONS`/`BLOCK_SHELL_DENIAL_REASONS`/
  `DEFAULT_BLOCK_TIMINGS`/`BLOCK_REPEAT_THRESHOLD`/`DEFAULT_MAX_AUTO_FIX_ATTEMPTS`/`BLOCK_POINTS`/`BLOCK_POINT_IDS`；
- 函数：`classifyBlock(fact, policy?)`、`decideBlockRoute(fact, policy?)`、`isStopFreeRoute(decision)`、
  `blockClassForCode(code)`、`blockClassForDetailCode(detailCode)`、`blockClassCodeOf(cls)`、`isBlockClass`、
  `isBlockProtocol`、`blockFingerprintMaterial`、`computeBlockFingerprint`、`computeBlockId`、
  `blockIdempotencyKey`、`blockCardRequestId`、`blockCardOptionsFor`、`blockCardAllowsJudge`、`validateBlockCardOptions`、
  `recommendedBlockOptionIdFor`、`resolveBlockTimings`、`blockFactForPoint`、`validateBlockPointMatrix`；
- 适配器：`blockFactFromStageBlocked`、`blockFactFromTaskReport`、`blockFactFromDispatchRejection`、
  `blockFactFromServiceFailure`、`blockFactFromReconcileReceipt`、`blockFactFromStallTick`、
  `blockFactFromShellDenial`。
- 预期桌面用法：事实源 → 适配器 → `raiseBlock` → `decideBlockRoute` → 执行产物（修复任务/自动修复/卡）→
  `routeBlock`（携 targetRoleId/taskId/cardRequestId/attempt）；卡答裁决 → `resolveBlock(fixed|decided)`；
  修复超时/judge manual/预算/重复 → `escalateBlock` → 再 `routeBlock`。

### 编排（`src/common/编排/block-ledger.ts`）
- `BLOCKS_STATE_REL`（`.ans/state/blocks.jsonl`）、`BLOCK_LEDGER_SCHEMA`（`block/v1`）、`blocksStatePath`；
- 事件接口 `BlockRaisedEvent/BlockRoutedEvent/BlockResolvedEvent/BlockEscalatedEvent`、`BlockLedgerEvent`、
  守卫 `isBlockLedgerEvent`；
- `readBlockLedger(projectRoot)`、`appendBlockEvent(projectRoot, event)`；
- `raiseBlock({projectRoot, fact, policy?, summary?, evidenceRefs?, now?})`、
  `routeBlock({projectRoot, blockId, route, reason, targetRoleId?, taskId?, cardRequestId?, attempt?, policy?, now?})`、
  `escalateBlock({projectRoot, blockId, from, to, reason, note?, attempt?, now?})`、
  `resolveBlock({projectRoot, blockId, resolution, by, decisionId?, reEntry?, note, now?})`；
- `replayBlockLifecycles(events)`、`listOpenBlocks(events, filter)`、`summarizeOpenBlocks(events, opts)`、
  `readOpenBlockProjection(projectRoot, opts)`；类型 `BlockLifecycle`/`BlockLedgerReplayResult`/`BlockOpenSummary`。

### 编排（`src/common/编排/workflow-definitions.ts`）
- `WORKFLOW_DEFINITION_VERSION=2`、`WORKFLOW_DEFINITION_VERSIONS`、`WorkflowDefinitionVersion`、
  `WORKFLOW_DEFINITION_BY_VERSION`、`WORKFLOW_DEFINITION_HASHES_BY_VERSION`、`workflowDefinitionVersionsOf(id)`；
- `WorkflowStageRetryPolicy.onExhausted: "blocked" | "route-block-resolver"`；
- `getWorkflowDefinition(id, version?)` 双版本（缺省 v2）。

### 编排（`src/common/编排/workflow-service.ts`）
- `WorkflowServiceFailure.blockFact?: BlockFact`；
- `ObserveAppDispatchTaskReportReceipt.blockFact?: BlockFact`；
- `ReconcileWorkflowReceipt.blockFacts?: BlockFact[]`；
- 新稳定码 `review-role-unavailable`（仅 `driveAppDispatchStage` 的 review 阶段在名单不可读时返回；
  携 blockFact；旧码语义不变）。

### Model / 编排（project_state）
- `src/model/project-state.ts`：`ProjectStateOpenBlockStatus`、`ProjectStateOpenBlock`、
  `ProjectStateView.openBlocks?: ProjectStateOpenBlock[]`（加法可选，旧记录兼容）；
- `src/common/编排/project-state.ts`：`ProjectStateWorkflowSummary.openBlocks`；
  `buildWorkflowStateProjection({projectRoot, now?})`；`renderProjectStateSummary` 追加 `[blocks]`。

## 三、P1–P51 → 类 / 默认路由（设计 §2.4/§6.11；canonical 事实）

> 「默认路由」= 首现、judge 关、无授权、引擎可修；实际路由由 `decideBlockRoute` 按事实/策略决定。
> 每项的 canonical 事实与允许类集合在 `BLOCK_POINTS`（代码即矩阵，`validateBlockPointMatrix()` 自检）。

| P | 族 | 代表码/事实 | 类 | 默认路由 |
| --- | --- | --- | --- | --- |
| P1 | E | task-closed-rejected | B8 | owner-repair |
| P2 | E | task-report-failed | B8 | owner-repair |
| P3 | E | task-report-blocked | B8 | owner-repair |
| P4 | E | close-report-missing | B1 | owner-repair |
| P5 | E | project-config-write-failed | B5 | engine-auto-fix |
| P6 | E | release-merge-failed | B5 | engine-auto-fix |
| P7 | E | workflow-stop-unconfirmed | B5 | engine-auto-fix |
| P8 | E | workflow-corrupt | B6 | engine-auto-fix |
| P9 | E | stage-transition-invalid（stateConflict） | B6 | engine-auto-fix |
| P10 | D | self-dispatch（fixed 矩阵） | B8 | owner-repair |
| P11 | D | workflow-binding-unavailable | B6 | engine-auto-fix |
| P12 | D | workflow-not-found | B6 | engine-auto-fix |
| P13 | D | workflow-corrupt（派发门） | B6 | engine-auto-fix |
| P14 | D | stage-request-invalid | B8 | owner-repair |
| P15 | D | basis-drift | B1 | owner-repair |
| P16 | D | b-change-scope-invalid | B3 | customer-decision（judge 开 ⇒ judge-decision） |
| P17 | D | b2-stage-request-forbidden | B6 | engine-auto-fix |
| P18 | D | b-repository-required | B5 | engine-auto-fix |
| P19 | D | module-paths-mismatch | B8 | owner-repair |
| P20 | D | missing-contract（缺契约拒投） | B1 | owner-repair |
| P21 | D | document-planning-source-unavailable | B2 | engine-auto-fix |
| P22 | D | vca-channel-unavailable | B5 | engine-auto-fix |
| P23 | D | review-target-invalid | B8 | owner-repair |
| P24 | R | blocked-report-needs-routing（scope 面） | B3 | customer-decision |
| P25 | R | close-report-missing（accepted 收口） | B1 | owner-repair |
| P26 | R | redispatch-safety-gate（autoFixForbidden） | B5 | owner-repair |
| P27 | R | redispatch-exhausted | B9 | customer-decision |
| P28 | R | escalation-channel-unavailable | B5 | engine-auto-fix |
| P29 | R | terminate-unconfirmed | B5 | engine-auto-fix |
| P30 | R | retry-budget-exhausted（app-dispatch Q8） | B9 | customer-decision |
| P31 | R | high-risk-blocked（高风险零重派） | B4 | customer-decision（主权） |
| P32 | R | reconcile-corrupt | B6 | engine-auto-fix |
| P33 | R | delivery-failed | B5 | engine-auto-fix |
| P34 | R | handback-register-failed | B5 | engine-auto-fix |
| P35 | S | shell-c-deny（越界） | B8 | owner-repair |
| P36 | S | shell-a-unavailable | B5 | engine-auto-fix |
| P37 | S | shell-judge-deny（需授权） | B2 | customer-decision（主权） |
| P38 | S | shell-escalation | B4 | customer-decision（主权） |
| P39 | S | shell-escalation（outOfScope） | B8 | owner-repair |
| P40 | W | turn-deadline | B8 | owner-repair |
| P41 | W | log-silence | B8 | owner-repair |
| P42 | W | patrol | B8 | owner-repair |
| P43 | W | queue-stuck | B5 | engine-auto-fix |
| P44 | W | propose-recovery | B5 | engine-auto-fix |
| P45 | W | stuck-role | B8 | owner-repair |
| P46 | W | model-request-failed | B5 | engine-auto-fix |
| P47 | W | session-open-failed | B5 | engine-auto-fix |
| P48 | H | stalled-no-progress（driver 观察） | B8 | owner-repair |
| P49 | H | blocked-unrecovered（driver 观察） | B8 | owner-repair |
| P50 | H | chief-role-missing（driver gate） | B5 | engine-auto-fix |
| P51 | H | flow-stall（router stall） | B8 | owner-repair |

## 四、改动文件

新增：
- `src/common/编排/block-resolution.ts`
- `src/common/编排/block-ledger.ts`
- `角色卡/编排/docs/change/2026-11-20_change_block-resolver-foundation.md`（本记录）

修改：
- `src/model/runtime.ts`（block 选项词表/类型/守卫；追加，不改旧值）
- `src/common/编排/workflow-definitions.ts`（v2 + 双版本解析/hash/Schema/自检）
- `src/common/编排/workflow-service.ts`（`blockFact` 事实出口 + `review-role-unavailable`；错误码/消息/阶段语义不变）
- `src/common/编排/project-state.ts`（open blocks 投影 + `[blocks]` 渲染 + 坏行警告）
- `src/model/project-state.ts`（`ProjectStateOpenBlock` + `openBlocks?`；加法可选）

未跟踪验证资产：`.tmp-block-selfcheck.mjs`（node 自检；不提交）。

## 五、兼容性

- **v1 定义逐字保留**：v1 hash 与变更前一致（`add ef7720c1…`、`modify 4bea23eb…`，已用 HEAD 版模块重算比对）；
  在飞 app-dispatch/v1 workflow 的 `workflow.started.definition.sha256` 对账/加载零迁移、零失败。
- 新 `select_workflow` 记录 `version:2` + v2 hash；v2 仅 `onExhausted` 语义更名，阶段集合/顺序/执行者/
  完成条件/重试算术/高风险零重派/文本逐字不变；`stage.blocked` 事件锚点与投影不变。
- fixed-v2.1 在飞零迁移：resolver 只观察既有事实（`stage.blocked`/拒绝回执/报告），不改阶段状态机；
  本批未接桌面、未创建修复任务、未发卡。
- `blocks.jsonl` 独立 append-only 账本；不写 workflows/tasks；`project_state` 仅加法可选字段。
- 旧错误码/消息不变；新增 `review-role-unavailable` 仅替换「名单不可读 ⇒ 静默 verifier」这一条隐式回落
  （任务书明确要求；行为变化见 §六 测试失败说明）。
- 未新增依赖/DSL；纯分类器无 I/O；账本复用 `jsonl-ledger` 单一实现。

## 六、验证

1. **typecheck**：根 `tsc --noEmit`（cwd=worktree）通过，零错误。
2. **node 自检**：`.tmp-block-selfcheck.mjs` **364 assertions PASS**（R1/R1b 收尾修补后 **421**；见 §八），覆盖：
   - 9 类代表码 + P1–P51 矩阵（`validateBlockPointMatrix()` 零错误、51 点位）；
   - 路由无 stop、卡选项 2–4/恰一推荐/终止非推荐、judge 卡无主权项、B4/授权永远客户、judge 开关开/关；
   - blockId/指纹/幂等键稳定与格式；重复指纹 ⇒ B7/escalated；
   - 账本 raise/replay/route/resolve、decided provenance（非 judge/customer 拒绝、缺 decisionId 拒绝）、
     escalated 非终态（未 routed 不得 resolved）、同指纹第二块仅 escalated、坏行 fail-closed、
     `resolution=stopped` 被 schema 拒绝；
   - v1/v2 定义并存（v1 `blocked`、v2 `route-block-resolver`、hash 不同、`version=3` 拒绝）、`validateWorkflowDefinitions()` 零错误；
   - project_state openBlocks（view/projection/`[blocks]` 渲染/ageMs/waitingOn customer）。
3. **v1 hash 兼容证据**：用 `git show HEAD:src/common/编排/workflow-definitions.ts` 重建旧注册表重算，
   v1 hash 与旧发布值逐字一致（`ef7720c112c76c8d…`、`4bea23eb0b1c00c8…`）。
4. **既有测试现状**（如实）：
   - 通过：`workflow-state` 13/13；`project-state` + `project-state-workflow` 12/12；
     `app-dispatch-b2` 3/3；其余 workflow 系（stage-request/dispatch-fixed/ledger/mode/baseline/fixed-b131/
     basis-b21/close-intent/fixed-path-start/preconditions）91/91。
   - `app-dispatch-definitions`：4 pass / 4 fail —— **预期定义版本相关断言**：
     `version` 1→2；`onExhausted` 期望 `blocked`；`getWorkflowDefinition("add",2)` 期望失败（v2 现为合法）；
     冻结断言中的 version 字段。
   - `app-dispatch-service`：13 pass / 6 fail —— 3 个为 `selected.definition` version 1→2（含 v2 hash）、
     `badVersion` 用例用 version=2 当作非法（现合法，应改 3）；3 个为 A12a/A12b 在无名单 fixture 下
     现在返回 `review-role-unavailable`（任务书要求的「不再静默回落 verifier」；测试批需补名单 fixture 或
     断言新码 + blockFact）。
   - 无其它回归：本次变更追加字段/可选码，未发现非版本/非 review-role 的失败。
5. 未运行 Electron/真实模型；未占调试端口；未读 `.env`；未 commit/push/CI/tag。

## 七、开放风险 / 待测试批点

1. **测试批必改**：`app-dispatch-definitions.test.ts`（v2 + 双版本/测试 `WORKFLOW_DEFINITION_HASHES_BY_VERSION`）；
   `app-dispatch-service.test.ts`（definition v2；非法版本改 3；review 阶段名单 fixture 或断言
   `review-role-unavailable` + `blockFact`）。
2. **测试批新增（T-1/T-2/T-5/T-11）**：直接消费 `BLOCK_POINTS`/`blockFactForPoint` 做 51 点位矩阵；
   账本坏行/replay/重复升级；project_state open blocks；judge/主权负例（T-3/T-4）；重复指纹（T-8 语义）。
3. **桌面 R2 契约**：
   - `block-terminate-flow` 裁决 ⇒ 桌面必须走显式停稳流程（`confirmStop` 停稳证据 + `workflow.closed stopped`
     + 披露），随后 `resolveBlock(decided, by:"customer", decisionId, note:"block-terminate-flow")`；
     不得把 block 记为 stopped；
   - judge 结算必须拒绝任何主权选项，且 `by:"judge"` 必须携真实 `decisionId`（账本会校验）；
   - 同 blockId 的重复发生（同一任务同指纹）是 **raise replay**（幂等，不新增计数）；桌面检测到「同一拒绝再次发生」
     时应调用 `escalateBlock(reason:"repeat")` 升级现有 block，而不是再次 raise/原样重试；
   - 非 chief 角色的 project_state 视图中，flowId 缺席的 block 不展示（角色裁剪，见代码注释）。
4. **语义边界**：本批只实现「事实 → 类/路由/账本/投影」；卡发行、修复任务创建/收口、重入场执行、
   T_repair/T_remind 计时器均在桌面批；本批不改变任何阶段推进路径。
5. **B7 升级默认去向**：高风险 ⇒ customer-decision；引擎可修 ⇒ engine-repair；否则 executor-replace
   （router 可依安全事实覆盖为 owner-reassign，账本只记事实）。
6. **code 覆盖可扩展**：码表对未知码兜底 B8（属主返工），新稳定码出现时应补 `CODE_CLASSES`/点位表
   （`blockClassForCode` 单一入口），不要在桌面另写映射。
7. **未决数值**：T_stall/T_repair/T_remind 已按 Q10 默认（12/10/30min）导出，首版由测试注入时钟钉死；
   `maxAutoFixAttempts=2` 为 B5 有界自动恢复默认，可在 policy 注入。

## 八、R1 收尾修补（2026-11-20，协调者反馈）

**问题**：`replayBlockLifecycles` 未把 `block.routed.taskId/cardRequestId` 复制进生命周期投影，投影缺
「修复任务/卡」链接；桌面此前只能直读 routed 事件绕过，生命周期不是自足事实面。

**修复**（只改 `src/common/编排/block-ledger.ts` + project_state 类型/映射 + 本记录；不改桌面/test）：

- 新增 `BlockRoutingRecord`（route/reason/attempt/at/idempotencyKey + targetRoleId/taskId/cardRequestId）；
- `BlockLifecycle` 新增 `routings: BlockRoutingRecord[]`（**保留每次** `block.routed`，旧→新）与最新路由便利字段
  `routeReason/routeAttempt/routeTargetRoleId/routeTaskId/cardRequestId`（= `routings` 末项；最新事件未携某链接时
  该字段缺席，**不沿用旧值**）；
- `BlockOpenSummary` 新增 `routeKind/routeReason/routeAttempt/routeTargetRoleId/routeTaskId/cardRequestId/
  routeCount/routings`；
- `src/model/project-state.ts::ProjectStateOpenBlock` 与 `src/common/编排/project-state.ts` 两处映射透出
  `routeKind/routeReason/routeAttempt/routeTargetRoleId/routeTaskId/cardRequestId`（**加法可选**；旧账本无 routed
  事件时 `routings=[]`、字段缺席，读取不变）；
- 说明：`BlockLifecycle.taskId` 仍是 raised 事实关联的**被 blocked 任务**；修复任务改由 `routeTaskId`
  （及 `routings[].taskId`）表达，桌面以 `cardRequestId` 恢复等待中的卡。

**R1 自检**（`.tmp-block-selfcheck.mjs` 新增断言）：两次 routed（先 owner-repair 带 taskId，升级后
customer-decision 带 cardRequestId）⇒ 生命周期 `routings.length=2`、首次 taskId/targetRoleId/attempt 保留、
最新 `cardRequestId/routeReason/routeAttempt` 正确且最新 `routeTaskId` 不沿用；`summarizeOpenBlocks` 同样透出
`routings/routeCount/链接`；`project_state` view 与 workflow projection 的 open block 透出
`routeKind/routeReason/routeAttempt/cardRequestId` 且最新 `routeTaskId` 不沿用；R1 block 随后可正常
`resolveBlock(decided)`。

**R1 验证**：`tsc --noEmit` 通过；`.tmp-block-selfcheck.mjs` **386 assertions PASS**（原 364 + R1 22）。

### R1b（2026-11-20，测试批 R4b 发现的适配器证据缺口）

**问题**：`blockFactFromDispatchRejection`/`blockFactFromServiceFailure`/`blockFactFromStageBlocked` 等适配器
未复制 `evidencePaths/evidenceHashes`（及 stage.blocked options 的结构事实），拒绝类 block 的修复任务/简报缺
证据路径与期望 hash，违反 I-4/AC-5。

**修复**（只改 `src/common/编排/block-resolution.ts` + 自检/本记录；不改桌面/test）：

- `BlockFactBaseOptions` 增加可选 `requestId?`（stage.blocked options 用；加法）；
- 新增 `baseFactExtras(options)`：统一复制 `requestId/evidencePaths/evidenceHashes/outOfScope/
  requiresAuthorization/requiresCustomer/externalInput/stateConflict/modelMisuse/engineCanRepair/derivable/
  judgeEligible/sovereign/autoFixForbidden/ownerRoleId`（仅复制已给出值；旧调用兼容）；
- `blockFactFromStageBlocked`：改用 `baseFactExtras` 复制证据/期望 hash/结构事实（原先只复制 2 个字段）；
- `blockFactFromDispatchRejection` / `blockFactFromServiceFailure`：拒绝类事实复制 `evidencePaths/
  evidenceHashes`（并补 `autoFixForbidden` 透传）；
- `blockFactFromTaskReport`：报告无 evidence 时回退 `options.evidencePaths`；`requestId` 支持 input→options 回退；
  其余结构事实随 `baseFactExtras` 复制（证据/请求 id 保持「报告优先」，不重复覆盖）；
- `blockFactFromReconcileReceipt`：输入新增可选 `evidencePaths/evidenceHashes`，corrupt 与每个 error 事实均携带；
- `blockFactFromStallTick`：`BlockStallTick` 新增可选 `evidencePaths/evidenceHashes` 并复制；
- `blockFactFromShellDenial`：输入新增可选 `evidencePaths/evidenceHashes` 并复制（shell 审计证据）；
- P1–P51 矩阵：P4/P5/P8/P15/P20/P24/P25/P32 的 canonical 事实补证据示例（路径 + 64 hex 期望 hash，下标对齐）。

**R1b 自检**（`.tmp-block-selfcheck.mjs` 新增断言）：dispatch/service/stage.blocked/task.report/reconcile/
stall/shell 适配器均把 `evidencePaths/evidenceHashes` 复制进 `BlockFact`（stage.blocked 另验证 requestId 与
requiresAuthorization；report 验证 options 回退与 requestId）；8 个矩阵点位的代表事实带证据且 hash 与路径
数量对齐；`evidenceHashes` 参与默认指纹材料（同事实不同 hash ⇒ 不同 blockId）。

**R1b 验证**：`tsc --noEmit` 通过；`.tmp-block-selfcheck.mjs` **421 assertions PASS**（R1 后 386 + R1b 35）。
