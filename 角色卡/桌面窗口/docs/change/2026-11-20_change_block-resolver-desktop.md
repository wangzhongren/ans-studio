# 变更记录：Block 解法路由——桌面 router/执行器（block resolver 第二批）

- 日期：2026-11-20
- 角色：ANS 内置「桌面窗口」（桌面侧运行时实现；客户 2026-11-20 原则 + 协调方裁定已授权）
- 分支/工作树：`feat/block-resolver`（worktree `.claude/worktrees/feat-block-resolver`；HEAD `694ea9c` + R1 未提交地基 + 本批未提交）
- 设计依据（权威）：`docs/planning/2026-11-20_design_block-resolution-paths.md` §三–§七、§九 Q1–Q10 默认；
  协调方 Q4 最终澄清：**终止只能由客户在决策卡中显式选择，judge 永不选择；终止是 decided 的结果，不是停止态**。
- R1 记录：`角色卡/编排/docs/change/2026-11-20_change_block-resolver-foundation.md`（API 面/P1–P51/待桌面点）。
- 范围：只改桌面运行时、最小模型/契约加法与 task-state 校验；未改 `test/**`、门禁文本/roles、workflow 资源、
  `release.yml`/policy；未改 R1 `block-resolution.ts`/`block-ledger.ts` 语义（只调用；发现缺陷见 §八）；
  未 commit/push/CI/tag/main；未读 `.env`；未占 9222/9223/9224。

## 一、摘要

1. 新增 `app/desktop/block-router.ts`（L 外挂模块，避开 `session/**` 结构预算）：事实 → `classifyBlock`/
   `decideBlockRoute`（R1）→ `blocks.jsonl`（R1 账本）→ 执行器（应用修复任务 / 引擎确定性动作 / 决策卡）→
   `resolveBlock(fixed|decided)` → 既有服务重入场。**无 stop 终态、无自动无限重试、无自动代选**。
2. 接入点：handback（`task.reported`/repair）、fixed 派发拒绝回执、star 派发已知 source 门、workflow-service
   事实出口（receipt.blockFact / reconcile.blockFacts / 服务拒绝）、stage.blocked 账本扫描、shell (a) 层拒绝、
   看护 tick（stall/T_repair/T_remind）、启动/打开项目恢复（tasks.restoreTasks）。项目状态 open blocks 由 R1 投影承载。
3. 决策卡：复用既有 app-owned `cardKind:"decision"` 通道（`withRequestLifecycle`，一项目一卡排队）；
   `requestId=block-card-<blockId>`；选项/唯一推荐/主权标记来自 R1；`blockJudgePermitted` 仅由 router 在
   `judge-decision` 路由下设；customer-input 对其做**确定性**「替我决策」代选（不调用模型，沿用 2026-10-26
   decision 卡口径），结算 `operatorId:"judge:<engine>"` + judge 审计 + 真实 `decisionId`；主权选项永不代选。
4. `block-terminate-flow`：仅客户可选；选择后应用在**既有 stop 前提齐备**时调用 `confirmStop`（停稳证据 +
   `workflow.closed stopped`），否则向治理主人投递显式 stop 简报（不伪造停稳）；block 仍记 `resolved(decided)`。
5. 最小模型/契约加法（全部可选、旧记录兼容）：`FIXED_TASK_KINDS + "repair"`、`task.created.blockId`、
   `CustomerInputMetadata.blockId/blockJudgePermitted`、`DispatchReceipt.blockId/nextActions`、
   `SessionManagerDeps.decisionDelegationEnabled`；task-state 写/读对 repair/blockId fail-closed。
6. typecheck 0；临时冒烟 15 组全过（`.tmp-block-router-smoke.mjs`，未跟踪）；R1 自检 364 assertions 仍 PASS；
   桌面测试 879 项 875 过 4 失败（3 worktree 环境 + 1 测试批 T-9 旧断言待更新；见 §十一）。

## 二、接线图（事实源 → router → 产物）

```
                         ┌───────────────────────────── app/desktop/block-router.ts ─────────────────────────────┐
stage.blocked 账本扫描 ──┤ tick/recover：blockFactFromStageBlocked（仅最新未被后续进度取代的事件）                │
task.reported(blocked/   │                                                                                            │
 failed) / repair 报告 ──┤ handback 端口 observeBlockTaskReport → observeTaskReport（repair 报告只走 router）         │
fixed 派发拒绝 ──────────┤ route.ts reject：blockFactFromDispatchRejection + 回执 blockId/nextActions               │
star source 门拒绝 ──────┤ dispatch.ts fail：已知 code（worker/document/chief-hub/review…）                          │
服务拒绝 / Q8 耗尽 ──────┤ stage-dispatch：receipt.blockFact / 服务 blockFact / reconcile.blockFacts                  │
shell (a) 层拒绝 ────────┤ interface wrap：shellDenialReasonFromOperatorOutcome（judge deny/manual/retry-capped/a-*）   │
重派安全门/耗尽 ─────────┤ tasks：redispatch-safety-gate / escalateRedispatchBlock（block 卡，P27）                     │
看护终止未确认 ──────────┤ interface onStuckRole → terminate-unconfirmed 事实                                       │
stall tick ──────────────┤ watchdog.onTickProject → manager.noteBlockTick → tick（排除 busy/card/repair/open block）   │
                         └───────────────────────────────┬────────────────────────────────────────────────────────────┘
                                                         ▼
              observeFact（按项目串行；raiseBlock 幂等；同 block 同指纹 ⇒ escalate(repeat)）
                                                         ▼
        decideBlockRoute（R1：B1–B9 / 无 stop / 选项与推荐 / 升级去向 / resumeAction）
             ┌───────────────────────┼───────────────────────────┬─────────────────────────────┐
             ▼                       ▼                           ▼                             ▼
    engine-auto-fix           owner-repair                  judge-decision /            escalated
  （app-dispatch：reconcile/  app-dispatch：repair 任务     customer-decision          （repeat/budget/repair-timeout/
    drive；fixed：无可确定      （from=application,          （block 卡：requestId         judge-manual/unclassified）
    动作 ⇒ 升级；上限 2）      taskKind=repair, blockId）      block-card-<blockId>）     ⇒ 再 routed
                             fixed：修复简报/系统行
                                                         ▼
                         resolveBlock(fixed|decided) → 重入场（drive/advance 或创建者简报；不伪造阶段推进）
```

## 三、事实源 → 类/路由（落地口径）

| 事实源 | 适配器 | 说明 |
| --- | --- | --- |
| `task.reported(status=blocked/failed)`（star 任务） | `blockFactFromTaskReport` | 报告只是报告；`done` 不入 block。app-dispatch `stage-execution` 报告**跳过**（由 `observeAppDispatchTaskReport` 收口/重试；耗尽时其 `blockFact` 另发 B9/B4），避免同一事件双块。 |
| `taskKind:"repair"` 报告 | 直接读 `task.created.blockId` | 只走 router（观察/证据重算/收口/重入场），**不进**阶段观察（不触发阶段完成）。 |
| `stage.blocked` 账本事件 | `blockFactFromStageBlocked` | tick/recover 扫描；**只对最新且无后续进度的事件补块**（历史已恢复的 blocked 不制造陈旧 block）。协议取 `workflow.started.protocol`（缺省 fixed-v2.1）。 |
| fixed 派发拒绝（P10–P23） | `blockFactFromDispatchRejection` | `routeFixedPathDispatch` 的 `reject` 构造确定性事实并异步 `onBlockFact`；回执附 `blockId`+`nextActions`（拒绝码/消息/语义逐字不变）。 |
| star/legacy source 门（P21 子集） | 同上（protocol `legacy`） | 仅已知稳定码（worker-dispatch-source-* / document-planning-source-* / chief-hub-flow-unavailable / review-* / task-parent-unavailable 等）；未知中文消息不猜。 |
| workflow-service 服务拒绝 | `blockFactFromServiceFailure` | route.ts 的 pathB/basis/writeSet/scope/stageRequest 等失败原样转发；stage-dispatch `advance`/`selectWorkflow`/`observe` 失败与服务 `blockFact` 转发。 |
| `observeAppDispatchTaskReport` Q8 耗尽/高风险零重派 | receipt `blockFact` | B9/B4（R1 事实出口）。 |
| `reconcileFixedWorkflow` corrupt/errors | receipt `blockFacts` | B6；固定路径 `workflow-corrupt` 拒绝也构造 B6 事实。 |
| shell (a) 层拒绝 | `blockFactFromShellDenial` | judge deny / judge manual（含 retry-capped）/ a-unavailable（超时/不可用亦归此）。c-deny 与升级卡见 §六「未接线」。 |
| 重派安全门 | `blockFactFromDispatchRejection(code=redispatch-safety-gate, autoFixForbidden)` | 属主=任务创建者（不是被卡死的执行者）；落账链被 `await`（测试/清理窗口确定）。 |
| 重派耗尽 | `escalateRedispatchBlock` | 发 B9 block 卡（`block-card-<blockId>`），选项修复向（推荐 `block-revise-scope`），terminate 非默认；裁决映射到既有 continue/redispatch/replace/terminate 落地动作（单一实现 `finishStuckEscalation`）。 |
| 看护 stuck 终止未确认 | 直接事实 `terminate-unconfirmed` | B5；确认时仍走既有安全重派。 |
| stall | `blockFactFromStallTick` | 见 §五。 |

**指纹/幂等**：R1 `computeBlockFingerprint`/`computeBlockId`/`blockIdempotencyKey`；桌面只在事实里补充
稳定材料（taskId/workflow/stage/command/task-text hash/attempts），不采信模型自报正文。同 blockId 再观察：
`raised` 补路由；`routed/escalated` 只做一次 `escalateBlock(reason:"repeat")` 再 routed（进程内去重防风暴）。

## 四、执行器

### 4.1 属主修复任务（app-dispatch/v1）

- `task.created`：`from:"application"`、`taskKind:"repair"`、`blockId`、`to=属主`（`repair.ownerRoleId` /
  route owner / fact.ownerRoleId / 治理主人兜底；角色不存在回退 governanceOwner/chief）、
  `idempotencyKey=block-repair:<blockId>:<attempt>`（attempt=`routeCount+1`）、`sideEffect:"unknown"`、
  `workflowId/flowId/stage`（有则带；flowId 只在 workflowId 存在时写，避免 legacy run-required）、
  `requestedEvidence=缺失路径`。文本含 blockId/类/code/缺失项/证据口径（应用重算字节 sha256）/截止 T_repair/
  「本任务不触发阶段完成」。
- 投递：既有投递机（`enqueueDelivery(kind:"dispatch")` + drain 自动开会话）；`taskCreators/starTaskIds`
  经宿主端口登记，使回交报告按任务绑定落账。已送达/已报告的修复任务幂等跳过。
- 收口：报告 `done` ⇒ 逐条证据路径项目相对、可读、字节 sha256 重算；R1 raise 时 `path#sha256=` 的期望必须
  一致；`missing-resource` 至少一个可读证据。通过 ⇒ `closeApplicationTaskDirect(accepted)` +
  `resolveBlock(fixed, by:<owner>)` + 重入场；不通过/报告 blocked/failed ⇒ 任务 `rejected` 收口 +
  `escalateBlock(reason:"unclassified")` → 属主/客户再路由（不判 fixed、不伪造）。
- 超时：T_repair 到期（tick）⇒ `escalateBlock(reason:"repair-timeout")` → 换属主/客户卡（不是继续等）。

### 4.2 fixed-v2.1 / legacy 属主修复（零迁移）

- **不创建应用任务、不写阶段事件**：向属主投递确定性修复简报（含 blockId/缺失路径/证据口径/截止）。
- **同步拒绝**（`dispatch-rejection`/`service-rejection`）的简报以**系统行**可见（工具回执已含 nextActions），
  不占该角色模型队列；`stage.blocked`/`task.reported` 等异步事实的简报经既有投递机排队。
- 修复是否发生以**账本进度**判定（应用事实）：owner-repair 无 taskId 的 block 在 raise 后出现新 workflow
  进度/任务 done 报告 ⇒ `resolveBlock(fixed, by:<owner>, reEntry:"ledger-progress")`；否则 T_repair 升级。

### 4.3 引擎自动恢复（有界）

- app-dispatch/v1：B6/reconcile 类 → 既有 `FixedWorkflowStageDispatch.reconcile`（含投递/补驱）；其余 →
  `advance` 重驱动一次。成功 ⇒ `resolveBlock(fixed, by:"engine")` + 重入场；失败/不可得 ⇒
  `escalateBlock(reason:"unclassified")` → 属主/客户。
- fixed-v2.1/legacy：不伪造阶段推进（无可自动执行的确定性动作）⇒ 升级属主/客户。
- 上限：默认 2 次（policy 可注入）；达上限 ⇒ `escalateBlock(reason:"budget")`。每次 routed 作为 attempt 审计；
  引擎动作期间回传事实以 `selfFacts` 去重（防自激 repeat）。

### 4.4 决策卡（app-owned decision）

- `request`：`kind:"choice"`、`cardKind:"decision"`、`application:true`、`sourceRoleId:"application"`、
  `flowId`（fact 有则带）、title `[Block] <类名> · <flow>/<stage>`、question（含已自动尝试次数/路由理由）、
  preview（blockId/类/code/protocol/workflow/stage/task/request/attempts/route/escalate/fingerprint/证据引用/
  judge 口径/推荐项）、options=decision.options（label+consequence+推荐）。
- `metadata`：`{cardKind:"decision", blockId, blockJudgePermitted: <route=judge-decision>, taskId?, flowId?}`。
- `requestId=block-card-<blockId>`；既有**一项目一卡**排队；`withRequestLifecycle`（`notify:"none"`）写
  `request.created/presented/resolved`；卡未答/取消/不可用 = 不执行、不重弹；同 requestId 幂等复用。
- **judge 代选（确定性）**：`customer-input.tryBlockDecisionAutoSelect` 仅在
  ①卡为应用发行 block 卡（选项全在 block 词表）②`metadata.blockJudgePermitted===true` ③「替我决策」开关开
  ④trio ⑤恰一推荐且为 `block-decision` ⑥无主权选项 ⑦结果行可投达 时，直接结算
  `answered{selected:[推荐]}` + `operatorId:"judge:<engine>"` + `GovernanceJudgeAudit{group:"decision",
  cardKind:"decision",reasonCode:"block-recommended"}`；`request.resolved.by="judge"` + 真实 `decisionId`。
  不调用模型（沿用 decision 卡 2026-10-26 确定性口径）。条件不满足（开关关/结果行失败/结构不允许）⇒
  原卡呈客户；开关开但结果行失败附 `judgeNotice` 原因。
- **客户主权**：`block-sovereign` 词汇并入 `isApplicationDecisionReservedForCustomer` 排除面；卡含任一主权项
  ⇒ 整卡客户本人（directive/chief-delegated/judge 均不结算；`settleEntry` 最后一层也会拒绝非客户来源）。
  `block-terminate-flow` 永不作为推荐项（R1 装配保证；router 不另造）。
- **裁决落地**：
  - `block-rework` / `block-revise-scope`：`resolveBlock(decided)` 后转属主修复动作（新 block 由后续事实产生）。
  - `block-retry-with-cap`：限次重试（app-dispatch 重驱动一次；不循环）。
  - `block-replace-executor`：有 taskId 且宿主提供重派 ⇒ 既有安全重派；否则属主换人简报。
  - `block-accept-with-limits` / `block-accept-current-state`：`resolveBlock(decided)` + 披露系统行/角色日志
    （接受现状不伪造阶段完成）。
  - `block-grant-exception`：记录客户一次性例外；精确动作仍由既有审批卡执行（应用不代批）。
  - `block-merge-main` / `block-stable-write`：记录决定；精确合并/写入走既有客户主权卡。
  - `block-terminate-flow`：见 §一.4。
- **provenance**：judge/customer 来源如实；`directive:` 归属映射为 `by:"customer"`（note 保留 directive id）；
  `chief-delegated` 一律拒结（block decided 只允许 judge/customer）；decided 必须带 `decisionId`。
- **P27 升级卡**：`escalateRedispatchBlock` 发 B9 block 卡（修复向推荐；terminate 非默认）；裁决映射回既有
  `finishStuckEscalation`（terminate/continue/redispatch/replace 的落地动作仍是单一实现；不新增第二条重派/终止路径）。

### 4.5 重入场

- app-dispatch/v1：`FixedWorkflowStageDispatch.advance`（内部 `driveAppDispatchStage`，幂等/新 attempt 由服务
  决定）；失败/受预算约束 ⇒ 新事实另成块（不伪造完成）。
- fixed-v2.1/legacy：向治理主人投递「修复已核验」简报，要求用既有工具继续；**不改阶段状态机**。
- 客户端 decided 后按选项执行（§4.4）；所有路径都不写 workflows 阶段事件（唯一阶段写入方仍是编排服务）。

## 五、计时器（注入时钟；默认 Q10）

| 计时 | 默认 | 行为 |
| --- | --- | --- |
| T_stall | 12min | 看护 tick（`onTickProject` → `manager.noteBlockTick`）扫描活动 workflow：排除本项目任何在飞轮次、已呈现卡、open 修复任务、已有 open block 的 workflow；其余无进度 ≥T_stall ⇒ `blockFactFromStallTick` → B8（含对 fixed-v2.1 的**只读观察**，不迁移）。 |
| T_repair | 10min | `owner-repair`/`engine-auto-fix` routed 且该 block 最新 routed 事件超时 ⇒ `escalateBlock(reason:"repair-timeout")` → 客户（high-risk/repeat）或属主换人；不是继续等。 |
| T_remind | 30min | 等待客户/ judge 卡的 block 每 block 一次 UI 系统行提醒（同一张卡、不重弹）；无答复不执行。 |

时钟：`deps.now` 注入；tick 只在看护启用时运行（测试可直调 `tick()`）。**T_stall 触发前排除事实**入诊断
（`block.stall.detected`）。

## 六、恢复

- `SessionManager.restoreTasks`（`listProject` 打开项目路径）末尾调用 `blockRouter.recover`（失败只诊断，
  不阻塞任务恢复）：
  1. `scanStageBlockedFacts`（仅最新未被超越的 blocked）；
  2. open blocks：`raised`/`escalated` 补 routed；`routed engine-auto-fix` 受上限重放；
     `owner-repair` 有 taskId ⇒ 已报告未收口任务重走修复收口；无 taskId ⇒ 账本进度判定/T_repair；
     `customer/judge` 卡 ⇒ 账本已有 `request.resolved` 直接执行选项；`request.created` 未决则等待；
     orphaned/缺席 ⇒ 同 `requestId` 重呈（不重弹新卡）；
  3. T_repair/T_remind 检查。
- `project_state`/`[blocks]`：R1 投影（blockId/类/状态/owner/waitingOn/ageMs/证据引用）无需桌面重复派生。
- 卡请求的 `request.created` 在重启后会被既有 `restoreRequestState` 标 `request.orphaned`；router 以此判据
  同 id 重呈（不把取消当拒绝、不自动执行）。

## 七、P1–P51 落地进度（本批）

图例：**✅ 运行时接线**（事实→router→产物/可见等待）；**◐ 部分**（主路径已接，个别入口/信号未接）；
**○ 仅事实适配器**（R1/本批有构造器，尚无运行时消费点）；**—** 非产品面（测试驱动）。

| P | 落地 | 说明 |
| --- | --- | --- |
| P1–P3 | ✅ | closeTask 产生的 `stage.blocked` 扫描 + 报告事实；owner-repair/客户卡按类路由。 |
| P4 | ✅ | `observeAppDispatchTaskReport` 失败（close-report-missing）→ 服务事实（B1/B8）。 |
| P5 | ◐ | stage.blocked 扫描 + requestStage/basis/pathB 服务事实；A9 个别分支若只写事件亦被扫描覆盖。 |
| P6 | ◐ | release 失败写 `stage.blocked` ⇒ 扫描；release-merge 专用失败回执未逐一加 blockFact。 |
| P7 | ○ | `workflow.stop-unconfirmed` 事件（非 stage.blocked）尚未接入扫描；confirmStop 失败只在 terminate 处置中如实系统行。 |
| P8 | ✅ | drive/reconcile/view 的 `workflow-corrupt` blockFact 转发（app-dispatch）＋ fixed 拒绝构造 B6。 |
| P9 | ✅ | `stage-transition-invalid` 服务事实（route/advance/select）转发。 |
| P10 | ✅ | fixed 矩阵拒绝统一构造事实 + 回执 blockId/nextActions。 |
| P11–P23 | ✅ | fixed route 全部 reject 路径；star source 门已知码子集。 |
| P24 | ✅ | handback blocked/failed → router（旧的运营提示保留为兼容提示，不替代路由）。 |
| P25 | ✅ | observe 失败（close-report-missing）事实。 |
| P26 | ✅ | 安全门事实（B5 owner-repair；属主=创建者）。 |
| P27 | ✅ | 耗尽 ⇒ block 卡（修复向推荐；terminate 非默认）；裁决映射既有落地动作；**同链结果缓存**（router 已 resolved 直接复用 + tasks 按链缓存）——已裁决/已 fixed 不回退旧 `task-escalation-*` 卡，也不重复终止/失败报告。 |
| P28 | ✅ | 卡通道不可用 ⇒ 非高危升级属主修复（系统行）；高危保持客户等待。 |
| P29 | ◐ | 看护 stuck 终止未确认 → 事实；重派内终止失败经安全门覆盖；其它 terminateRoleRun 调用点未接。 |
| P30/P31 | ✅ | Q8 耗尽/高风险零重派 receipt.blockFact（B9/B4）。 |
| P32 | ✅ | reconcile corrupt/errors → `blockFacts` → router；修复任务从 workflow 账本派生 flowId/stage（`workflow.started` + 视图阶段）；缺失/冲突 ⇒ **blockId-only** repair（不伪造阶段，仍 fail-closed）。 |
| P33 | ◐ | app-dispatch 投递 open/拒绝失败 → 事实；legacy 队列投递失败未接。 |
| P34 | ○ | `handback-register-failed`/`handback-render-failed` 事实构造器可用；handback 失败分支未接。 |
| P35 | ◐ | shell (a) 层拒绝已接；c 硬拒（shell-gate 审计）未接。 |
| P36 | ✅ | operator outcome `unavailable`（超时/不可用）→ `a-unavailable`。 |
| P37 | ✅ | judge deny/manual（含 retry-capped）→ 事实；卡 flowId 缺失时按「任务/账本 started → 稳定 block slug」回退（卡审计作用域，不伪造 workflow）。 |
| P38 | ○ | shell 升级卡既有客户通道不变，未另发 block（避免重复客户门）。 |
| P39 | ◐ | 越界 shell 若表现为 judge deny 会入块；`outOfScope` 事实未从 gate 透出。 |
| P40 | ○ | turn-deadline 看护信号未接（自动中止语义不变）。 |
| P41 | ◐ | flow 级 stall 已接；log-silence 5/10/30min 信号未接。 |
| P42 | ○ | patrol 信号未接。 |
| P43 | ○ | queue-stuck/repeat-fail/cmd-timeout 未接。 |
| P44 | ○ | propose_recovery 未接（原恢复通道不变）。 |
| P45 | ◐ | onStuckRole 终止未确认事实；自动重派路径不变。 |
| P46 | ○ | 模型请求失败/轮次超时未接。 |
| P47 | ◐ | app 任务会话打开失败 → 事实；普通会话打开失败未接。 |
| P48–P50 | — | 测试驱动观察；仅矩阵事实（不接产品）。 |
| P51 | ✅ | stall tick（排除在飞轮次/卡/open 修复/open block）。 |

## 八、收尾修补（R4b/R4a 反馈，2026-11-20）

1. **repair 任务绑定派生（P32）**：`deriveRepairBinding` 从账本确定性派生——flowId 取事实或
   `workflow.started.flowId`；stage 取事实或 `deriveWorkflowView` 当前阶段。事实 flowId 与账本冲突 ⇒ 诊断并
   **不绑定**；flowId/stage 任一不可得 ⇒ **blockId-only repair 任务**（task-state 已允许 repair 无 workflow
   绑定，仍 fail-closed：from=application、`block-repair:` 幂等键、24hex blockId、无 card-prompt 字段）。
   任务文本披露「账本未给出可绑定 flowId/stage ⇒ 仅以 blockId 关联；不伪造阶段」。不再因
   `invalid-task-binding` 降级系统行；不写阶段事件。
2. **卡 flowId 回退（shell 拒绝等）**：decision 卡校验要求合法 flowId。`resolveCardFlowId` 依次取
   事实 flowId → 关联任务 `task.created.flowId` → 任务/事实 workflowId 的 `workflow.started.flowId` →
   项目稳定 slug `block-<blockId 前 12>`（**仅卡审计/排队作用域**，不写 workflow/block 账本；诊断
   `block.card.flow-fallback`）。卡 preview 如实标注回退来源。
3. **`options.timings` 透传**：`baseline policy` 与 `options.timings` 合并后写回 `policy.timings`，
   `blockFactFromStallTick` 等适配器与 T_repair/T_remind 同源生效（此前 stall 仍用默认 12min）。
4. **P27 同链不回落旧卡**：router 在 `observeFact` 后先查生命周期——已 resolved（decided/fixed）直接复用
   裁决（映射 continue/redispatch/replace/terminate），不再等卡/不再回退；tasks 侧以
   `escalationRequests` 的 `block-escalation` 命名空间按链缓存结果，避免重复执行终止/失败报告。
   仅当 block 卡从未呈现且未结算时才回退既有 `escalateStuckTask`（legacy 兼容）。
5. **R1 收尾修补已修（更新过期说明）**：`replayBlockLifecycles` 现提供 `routeTaskId`/`cardRequestId`/
   `routings`；桌面恢复/T_repair 已改用生命周期字段，移除了直读 `block.routed` 事件的兼容函数。
   `block-resolution.ts`/`block-ledger.ts` 仍未被本批改动。

**测试批可断言点（未直接改 test/**）**：
- reconcile repair 任务：有 `workflow.started` ⇒ task.created 携派生 flowId/stage；无 started/冲突 ⇒
  blockId-only repair 任务成功创建（不再 `invalid-task-binding`，routeTaskId 存在；不写 workflow 事件）。
- shell denial（无 flowId/workflow/task）⇒ block 卡呈现且 `request.flowId` 匹配 `^block-[a-f0-9]{12}$`。
- `createDesktopBlockRouter(host,{timings:{stallMs}})` 实际影响 stall 判定（不再固定 12min）。
- 同链第二次 `redispatchTask`：复用 block 裁决，不重弹旧 `task-escalation-*` 卡、presenter 计数不增。
- `BlockLifecycle.routeTaskId/cardRequestId/routings` 投影可断言（R1 收尾修补）。

## 九、最小模型/契约改动（披露）

| 文件 | 改动 | 兼容性 |
| --- | --- | --- |
| `src/model/runtime.ts` | `FIXED_TASK_KINDS += "repair"`；`TaskCreatedEvent.blockId?`；`CustomerInputMetadata.blockId?/blockJudgePermitted?`；`DispatchReceipt.blockId?/nextActions?` | 全部加法/可选；旧记录/旧调用读取不变；repair 任务形状由 task-state fail-closed 校验（from=application、block-repair 幂等键、24hex blockId、无 card-prompt 字段）。 |
| `src/common/编排/task-state.ts` | task.created 写/读对 repair 与 blockId 的校验 | 旧事件零影响；未知 taskKind 仍拒绝。 |
| `app/desktop/session/contracts/deps.ts` | `decisionDelegationEnabled?()` | 可选；缺省视为关闭（不代选）。 |

未改 `block-resolution.ts`/`block-ledger.ts` 一行；未改阶段状态机/三卡/merge-main/judge 既有语义。

## 十、兼容性

- **fixed-v2.1 在飞零迁移**：resolver 只观察既有事实（stage.blocked/报告/拒绝/对账）；不写 workflows/tasks
  阶段事件、不创建修复任务、不改驱动。fixed-path 代表测试 61/61 通过（拒绝回执只加 `blockId/nextActions`）。
- **app-dispatch 旧定义 v1**：`onExhausted:"blocked"` 等定义数据未变（R1 双版本）；本批只消费服务事实出口。
- **legacy**：`block.protocol="legacy"`；star 任务 blocked/failed 报告开始产生 block（新路由层），拒绝码
  nextActions 为加法。
- **无 stop 终态**：`blocks.jsonl` 只写 fixed/decided；终止=客户 decided 结果；escalated 非终态。
- **失败关闭**：blocks 账本坏行 ⇒ 不追加/不猜；卡通道不可用不伪造卡；修复不采信自报；高危不代批。
- **预算**：`session/index.ts` 799/800 行；session 模块均 <1500 行；结构/导出面测试全过。

## 十一、验证

1. **typecheck**：根 `tsc --noEmit`（cwd=worktree）**0 错误**。
2. **临时冒烟**（`.tmp-block-router-smoke.mjs`，未跟踪；临时目录）**15 组全过**：
   blocked 报告→raised/routed→修复任务→证据 sha256 重算→fixed→重驱动；fixed 缺文件→属主简报（零任务/零阶段迁移）；
   app-dispatch 缺资源→修复任务→证据 sha256 重算→fixed→重驱动；
   同 block 同指纹重复→只 escalated(repeat) 不新增 raised；block 卡 judge 开+唯一推荐⇒judge 代选（by=judge+
   decisionId；无客户卡）；开关关⇒客户卡+客户裁决 decided；主权/终止选项⇒judge 拒绝代选；judge 结果行失败⇒
   客户卡（附原因）；shell 拒绝/reconcile corrupt⇒事实入账；stall tick⇒flow-stall；卡幂等（requestId 确定、
   同 block 只一张卡）；reconcile repair 任务派生 flowId/stage；shell 无 flow 卡片稳定 slug 回退；
   `timings.stallMs` 覆盖生效；P27 同链已裁决复用（不重弹旧卡）。
3. **R1 自检**：`.tmp-block-selfcheck.mjs` **364 assertions PASS**（模型加法未破坏 R1 矩阵）。
4. **桌面测试**（`node --test "test/桌面应用/*.test.ts"`，含测试批 R4a/R4b 更新后的文件）：**879 项 / 875 过 /
   4 失败**，逐项归因：
   - `block-router` T-9 reconcile（1）：**测试批旧断言待更新**——该用例的后半段仍断言「无 flowId ⇒ repair 任务
     创建失败、routeTaskId 为空」（原“生产疑点，报告不改”）。本批按收尾要求已让 repair 任务以
     blockId-only/派生绑定成功创建；断言应改为「任务存在且不伪造 stage 字段」。非产品缺陷。
   - `genesis-bootstrap`（1）、`operator-channel` I-1 真正接通（1）、`p0-halt-and-images` P0-2（1）：worktree
     环境——仓库根为 **linked worktree**（`.git` 是文件），`readGitHostProtectionRequirement` 返回 `unknown`
     ⇒ 真实 openRoleSession 报 `runtime-creation-prepared-api-unavailable`；与 resolver 代码无关（主检出/CI 的
     `.git` 为目录时应恢复；本批未改 run-role/git-protection）。
   - `chief-workflow` W30：并行全量运行偶发超时（7s 级）；单文件 `--test-name-pattern` 83/83 通过——并发抖动，
     非产品回归。
5. **代表性旧协议测试**：fixed-path 61/61；task/project/workflow-state 57/57；decision-service/directive-
   decision/handback/structure/app-dispatch-tool-surface/download 等全过；`stuck-redispatch` 10/10（测试批已按
   block 卡新语义更新）；`block-router` 17/18（仅 T-9 旧断言）；`app-dispatch-definitions` 4/8 失败、
   `app-dispatch-service` 6/19 失败与 R1 记录逐项一致（版本 v2/双版本/review-role fixture），无新增失败。
6. 未运行 Electron/真实模型；未占调试端口；未读 `.env`；未 commit/push/CI/tag。

## 十二、风险与后续

1. **旧升级卡语义变更**（P27）：block 卡替代 `task-escalation-*`（旧读取面未删除——仅在 block 卡从未呈现/
   未结算时回退）。测试批已更新 `stuck-redispatch`；`block-router` T-9 的后半段仍钉旧「repair 创建失败」断言，
   应按本批 §八 改为 blockId-only/派生绑定成功。历史 `task-escalation-*` 账本仍可读（`request.resolved` 事实）。
2. **确定性 judge 口径**：block 卡的「替我决策」不调用模型（推荐项由应用装配、恰一推荐）。若后续要求
   model-judge 证据核对，可在 `tryBlockDecisionAutoSelect` 前增加既有 `GovernanceJudgeFn` 调用；当前实现
   与 2026-10-26 decision 卡语义一致，且避免模型对 block 证据做选择题。
3. **终止停稳**：`confirmStop` 只在既有 stop 请求任务已收口/已报告时执行；否则投递显式 stop 简报（不伪造
   stopped）。若客户期望「一键停稳」需要编排提供可由应用直发的 stop 请求原语（现无）。
4. **未接信号**：P7/P34/P35(c-deny)/P38/P40/P42–P44/P46 等仍为事实适配器或未接（§七）；建议按批次接入
   watchdog 信号/handback 失败分支/shell 审计消费点。
5. **stall 保守性**：只要本项目任一角色在飞就排除 stall（防误报）；多角色项目里真正的 flow 停滞可能延后
   到全部空闲后才发现。可按 workflow 的创建者/执行者角色精细排除（后续）。
6. **修复简报分流**：同步拒绝用系统行（不占模型队列）；异步事实用投递队列。两者都可见、可审计；若后续要求
   所有简报都进模型队列，可统一切换（会改变队列/忙态时序）。
7. **R1 投影（已收尾修补）**：`replayBlockLifecycles` 已提供 `routeTaskId/cardRequestId/routings`；桌面已消费。
8. **block 卡与既有三卡并存**：一项目一卡排队；block 卡不会挤掉既有客户卡（按到达顺序排队；project_state
   `[blocks]` 显示等待对象/年龄）。客户可见门只在 block 且 judge 不可用时出现（设计 §十 披露）。
9. **repair 任务绑定**：flowId/stage 只从账本事实派生；缺失时 repair 任务仅以 blockId 关联（不触发阶段完成，
   不写阶段事件）。若后续要求所有 repair 任务都必须带阶段绑定，可改为「不创建任务、直接客户卡」，但当前
   选择优先保证 P32 的修复闭环（任务仍 fail-closed 于真实绑定的不一致）。
10. **卡 flowId 回退**：`block-<12hex>` 只用于卡审计/排队作用域，不进入 workflow/block 账本事实；客户卡
    preview 如实标注。若新增更合适的项目级稳定 flow 作用域，应替换该回退并保留诊断。
