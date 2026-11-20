# 变更记录：app-dispatch 接缝修复——桌面消费 blockFact/blockOutcome、card-prompt 投递/orphan、修复任务唯一（桌面批）

- 日期：2026-11-20
- 角色：ANS 内置「桌面窗口」（桌面侧运行时实现；协调者已授权本批范围）
- 分支/工作树：`fix/app-dispatch-smoke-seams`（worktree `.claude/worktrees/fix-app-dispatch-smoke-seams`；
  HEAD 起点 `8939367` = origin/main；编排/模型批未提交改动 + 本批未提交）
- 编排批依据：`角色卡/编排/docs/change/2026-11-20_change_app-dispatch-smoke-seams-foundation.md`
  （`createAppDispatchTask` / `appDispatchIdempotencyKey` / `isAppDispatchTaskKind`；observe 回执新增
  `blockFact` + `blockOutcome:"retrying"|"fixed"|"escalated"`；reconcile 回执 `blockFacts`；账本唯一 guard）。
- 客户第一不变量：**任务由工作流/应用侧唯一派发、taskId 确定性、任何路径不得重复建任务**。
- 范围：`app/desktop/**` + 必要模型/记录（`src/common/编排/block-ledger.ts` 只增加 detailCode/engineCanRepair
  读回；`src/common/编排/project-state.ts` orphan 非粘性）。未改 `test/**`、门禁文本/roles、workflow 资源、
  `release.yml`/release-policy；未改 R1 `block-resolution.ts` 分类语义（只消费）；未 commit/push/CI/tag/main；
  未读 `.env`；未占 9222/9223/9224。

## 一、摘要

1. **A2 重复根因**（编排批修复 + 桌面复核）：同一阶段尝试曾由 Q8 重试（`observeAppDispatchTaskReport`
   → `driveAppDispatchStage`）与并发 reconcile/drive 各自建 `task.created`；stage-execution 幂等键含
   targetRole，执行者漂移时键不同；`appendTaskEvent` 对 `task.created` 无 replay guard。编排批已收敛为
   唯一创建核心（确定性 `taskId = t-app-<sha256(key) 前 24>`）+ 进程内锁 + 账本唯一 guard。桌面侧**没有**
   其它应用任务创建点：`fixed-workflow/route.ts`（convener→worker 既有角色派发）与
   `session/dispatch.ts`（legacy 星形派发）逐字保留，使用 `newTaskId()`（`t-…` 前缀，**不生成 `t-app-`**）；
  桌面唯一 append `from:"application"` 的创建点是 block router 的属主修复任务（`taskKind:"repair"`）。
2. **修复任务并发唯一**：`block-router.ts::createRepairTask` 改为**消费 `appendTaskEvent` 回执 taskId**
   （`appended.taskId`；`replay=true` 表示并发败方复用既有任务，不再写第二条），旧 `findTaskByIdempotencyKey`
   预检仅作快路径；登记星形任务/路由/投递全部使用回执 taskId。
3. **block 账本必现**：桌面 handback/observe 路径（`stage-dispatch.ts::logObservation`）现在消费编排批
   新增的**每个 blocked/failed 报告**的 `blockFact`（不再只依赖重试耗尽/高风险），并把 `blockOutcome`
   写入诊断。`detailCode:"reconcile"` 事实按既有分类走 `protocol-reconcile → engine-auto-fix`（不并发建
   属主修复任务）；重试成功也必须在 `blocks.jsonl` 出现
   `block.raised → block.routed(engine-auto-fix) → block.resolved(fixed)`。
4. **card-prompt 投递/orphan 不再搁置**：新增 `FixedWorkflowStageDispatch.scanAppCardPromptFacts`
   （tick/recover 经 block router 调用）：
   - `request.orphaned`（restart，且流程仍在该阶段）⇒ `card-prompt-orphaned`（B6/detailCode=reconcile）
     ⇒ 引擎动作**同 taskId 重投 + 同 requestId 重呈现**（追加一条同 `requestId` 的 `request.created`，
     不新开卡）；
   - 未送达超过 T_stall（target-busy/会话打开失败/队列受阻）⇒ `target-busy`（**B5 environment-infra**）
     ⇒ 引擎有界重投（**每 T_stall 窗口最多一轮**；按 blocks 账本已结算轮次计数，达到
     `maxAutoFixAttempts` 后同码事实带 `autoFixForbidden:true` ⇒ 升级属主/客户，不继续自动重投）；
   - 已送达但超过 T_stall 仍未呈卡（request 仍 `created`）⇒ `card-prompt-stalled`（B8 属主修复）；
   - orphan 属 **superseded / 流程已关 / 阶段已迁移** ⇒ 按实际语义**收口 prompt 任务（rejected）**，
     不重呈现、不误判重投。
5. **恢复重路由读回**：`block.raised` 持久化 `detailCode/engineCanRepair`（模块加法兼容），
   `BlockLifecycle` 重放携带；桌面 `blockFactFromLifecycle` 读回 → 恢复重路由不回落 `model-anomaly`。
6. **project_state 可见等待**：`collectRequests` 改为「同 requestId 的新 `request.created` 清除旧
   orphaned」——重呈现后请求重新进入 `request-pending` 投影（orphaned 非粘性，与 block-router
   `findRequestState` 同口径）。

## 二、问题复盘（SMOKE-1 事实 → 根因）

1. **A2/product 同秒出现两条 `t-app-…` 任务**：见一.1。桌面复核结论：桌面不直接建应用阶段任务；
   `advance`/`observeApplicationTaskReport`/`reconcile` 多入口并发由编排批的锁 + 确定性 taskId + 账本
   guard 归一；桌面批只补齐修复任务的「回执 taskId」消费与并发断言点（§十）。
2. **A2 blocked 两次没有 blocks.jsonl**：HEAD `8939367` 的 observe 回执只在「重试耗尽/高风险零重派」
   时给 `blockFact`；Q8 重试成功的 blocked 报告没有任何事实出口，桌面 `logObservation` 无块可路由。
   编排批改为**重试决策前**对每个 blocked/failed 报告生成事实（`detailCode:"reconcile"`）；
   本批确认 handback（application 任务报告）→ `observeApplicationTaskReport` → `logObservation` →
   `blockRouter.observeFactLater` 为唯一桌面出口，且并发 reconcile 先收口时其 `blockFacts` 也已由
   `reconcile()` 路由（不丢块）。
3. **A3 card-prompt 持续 target-busy / request.orphaned×2 无人处置**：
   - target-busy 是既有「忙时入队不打断」的正常路径，但**没有可见升级**；stall 检测又因
     `hasOpenCardForWorkflow` 把「有 open card request」当合法等待而跳过 ⇒ 持续 busy 无事实；
   - 重启时 `restoreRequestState`（C-08）把未决 `request.created`（包括 app-dispatch card-prompt）
     标 `request.orphaned(restart)`，但应用无重呈现路径；若 prompt 任务此前已 `delivered`，
     投递一致性对账（只看未送达）也不会重投 ⇒ 卡永久停摆。
   本批新增 card-prompt 扫描 + 确定性重投/重呈现（§三.2/§六），并让 superseded 按实际语义收口。

## 三、调用点改造（文件 → 行为）

### 3.1 `app/desktop/block-router.ts`

| 位置 | 改造 |
| --- | --- |
| `DesktopBlockRouterHost` | 新可选端口 `redeliverAppTask(projectRoot, taskId)`、`scanAppCardPromptFacts(projectRoot, {stallMs})`（缺省 ⇒ 旧宿主零变化）。 |
| `runEngineAction`（app-dispatch 分支） | 投递/card-prompt 事实（`kind:"driver-observation"` 或 code ∈ `card-prompt-orphaned/card-prompt-stalled/target-busy/session-open-failed/delivery-failed`）**先做针对性重投**（同 taskId；不建任务）；失败再走既有 reconcile/advance 兜底，仍失败如实升级（不伪造重投）。Q8 `detailCode:"reconcile"` 事实不命中该分支，继续走 advance（重试期间不建 owner-repair）。 |
| `createRepairTask` | 消费 `appendTaskEvent` 回执 `taskId`（replay 复用既有任务）、记录 `replay` 诊断；`registerAppTask`/路由/投递全部用回执 id。 |
| `blockFactFromLifecycle` | 读回 `lifecycle.detailCode/engineCanRepair`（恢复重路由按原分类事实，不回落 model-anomaly）。 |
| `scanAppCardPromptFailures` + `tick`/`recover` | 在 stage.blocked 扫描后调用宿主 card-prompt 扫描，事实经同一 `handleFact`（raised→routed→engine 重投/升级）。 |
| `APP_TASK_REDELIVERY_CODES` 常量 | 确定性重投事实码白名单（见上）。 |

### 3.2 `app/desktop/session/fixed-workflow/stage-dispatch.ts`

| 位置 | 改造 |
| --- | --- |
| `deliverTaskIds` | 目标 fixed 会话忙时记录 `app-dispatch.deliver.target-busy` 诊断（不再静默）；open-failed/rejected 事实携带 `requestId=created.promptId` + `engineCanRepair:true`。 |
| `redeliverAppTask`（新） | 应用任务确定性重投：已收口/已报告 ⇒ no-op；已在队列/在途（`pendingAppTaskDelivery` 端口）⇒ 不重复入队；否则按既有 `planDispatchDelivery` 口径重新入队（同 `taskId`/`dedupKey`/`clientMessageId`，入队清除已投递标记 ⇒ 可重发）；不做任何任务创建。 |
| `representOrphanedCardRequest`（新，私有） | orphan 请求按**最后一条 request 事件**判定：`resolved` ⇒ 收口 prompt 任务（accepted）；`presented` ⇒ **不重投/不重弹**（客户可见等待）；`orphaned(restart)` 且流程仍在该阶段 ⇒ 追加同 `requestId` 的 `request.created`（逐项复制原应用事实）⇒ `represented`；`superseded`/流程已关/阶段已迁移 ⇒ 收口 prompt 任务（rejected）⇒ `superseded`；同口径与 block-router `findRequestState`、project-state 派生一致。 |
| `scanAppCardPromptFacts`（新） | 只扫 `from:"application" && taskKind:"card-prompt" && open && 无报告` 且协议为 app-dispatch/v1 的任务：orphan（restart）⇒ `card-prompt-orphaned`；`created` 且未送达 ≥ T_stall ⇒ `target-busy`（B5；按 blocks 账本已结算轮次**每 T_stall 只重投一轮**，达到 `maxAutoFixAttempts` ⇒ `autoFixForbidden` 升级属主/客户）；已送达未呈卡 ≥ T_stall ⇒ `card-prompt-stalled`；缺 `request.created` ⇒ `workflow-corrupt`（detailCode reconcile）；superseded ⇒ 收口任务（不造块）。 |
| `logObservation` | 消费 `blockOutcome`（retrying/fixed/escalated）写入诊断；**每个** `observed.blockFact` 都路由（retrying/fixed 也 raise）。 |
| `noteServiceBlock` | 追加 `requestId/engineCanRepair/ownerRoleId` 透传。 |
| 模块级 `requestViewOf` | request 生命周期「最后一条为准」视图（orphaned 不粘性）。 |

### 3.3 其它接线/模型

- `app/desktop/session/fixed-workflow/route.ts`：`FixedWorkflowPorts.pendingAppTaskDelivery?`（可选）。
- `app/desktop/session/index.ts`：注入 `pendingAppTaskDelivery`；block router 宿主注入
  `redeliverAppTask` / `scanAppCardPromptFacts`（箭头延迟取值，构造期零副作用）。
- `src/common/编排/block-ledger.ts`：`BlockRaisedEvent.engineCanRepair?`（写读 + 守卫）、
  `BlockLifecycle.detailCode/engineCanRepair`（replay 复制）；旧行缺省兼容。
- `src/common/编排/project-state.ts`：`collectRequests` 在后续 `request.created` 时清除 orphaned。
- 保持不动：`fixed-workflow/cards.ts`（裁决后 `afterCardResolved` 既有路径）、`session/tasks.ts`
  （stuck 重派/legacy 恢复）、`session/dispatch.ts`（legacy 星形派发）、`route.ts` 派发矩阵。

## 四、API 面（消费，非新增编排 API)

- 创建：桌面不新增应用阶段任务；`createAppDispatchTask`/`appDispatchIdempotencyKey` 由编排 drive/reconcile/
  恢复路径唯一创建（桌面只调用 drive/observe/reconcile/select 门面）。修复任务走
  `appendTaskEvent` 账本唯一 guard（`taskKind:"repair"`，同键 replay 返回既有 taskId）。
- 观察：`observeAppDispatchTaskReport` 回执 `blockFact?` + `blockOutcome?`；`ReconcileWorkflowReceipt.blockFacts?`
  （桌面 `reconcile()` 已路由）。
- 重投：无新编排 API；桌面内部 `redeliverAppTask`（同 taskId/同 requestId，幂等）。

## 五、block 必现（A2 blocked，Q8 retry 成功）

```
task.reported(blocked) ── handback（application 任务只落账+应用观察）
  → observeAppDispatchTaskReport：closeTask(rejected→stage.blocked) → Q8 retry（attempt2）
    → receipt.blockFact(detailCode:"reconcile", engineCanRepair:true) + blockOutcome:"retrying"
  → logObservation → blockRouter.observeFactLater
    → blocks.jsonl：block.raised → block.routed(engine-auto-fix)
      → runEngineAction：advanceAppDispatch（幂等；重试任务在飞）→ resolveBlock(fixed)
```
- 重试期间**不**命中 `createRepairTask`（分类 protocol-reconcile ⇒ engine-auto-fix；且引擎动作先
  advance，不建任务）。耗尽/高风险事实码（retry-budget-exhausted/high-risk-blocked）仍走 judge/客户面。
- 并发 reconcile 先收口时：`reconcileFixedWorkflow` 的 `blockFacts` 携带同一事实，桌面 `reconcile()`
  `observeFactListLater` 消费（并发不丢块）。

## 六、card-prompt 投递 / orphan

1. **target-busy / 未送达**：投递桥保留「忙时入队不打断」；tick/recover 扫描 `card-prompt` 任务：
   未送达 ≥ `timings.stallMs`（默认 12min）⇒ `target-busy`（B5）⇒ engine 重投
   （`pendingAppTaskDelivery` 检测已在队列/在途则不重复入队）⇒ 成功 `resolved(fixed)`；
   重投轮次按 blocks 账本已结算块计数、**每 T_stall 最多一轮**；达到 `maxAutoFixAttempts`（默认 2）
   后同码事实带 `autoFixForbidden:true` ⇒ 属主修复任务（不再自动重投），失败/超时由既有
   T_repair/升级链转客户（有界，不无限循环）。
2. **会话打开失败/投递被拒**：投递时即时事实（`session-open-failed`/`delivery-failed`，B5）→ 引擎同
   taskId 重投；失败即升级（不循环）。
3. **request.orphaned（restart）**：同 requestId 重呈现（追加 `request.created`；卡种/选项/推荐/
   documentRefs/promptId 等逐项复制应用事实）+ 同 taskId 重投；`blocks.jsonl` 记
   raised→routed(engine-auto-fix)→resolved(fixed)。**不新开卡任务、不生成新 requestId**。
4. **request.orphaned（superseded / 流程关闭 / 阶段迁移）**：按实际语义收口 prompt 任务（rejected），
   无重投事实（不误判）。
5. **request.presented（客户可见等待）**：不造块（避免把正常等待/提醒语义接管）。
6. **project_state**：重呈现后 `request-pending` 重新可见；open blocks 由既有 R1 投影承载（升级可见）。

## 七、恢复 / 维修

- `block.raised` 已持久化 `detailCode`（R1 既有）+ 本批新增 `engineCanRepair`；`replayBlockLifecycles`
  复制到 `BlockLifecycle`；桌面恢复重路由读回（例：`detailCode:"reconcile"` 恢复后仍走 engine-auto-fix，
  不回落 `model-anomaly → owner-repair`）。
- 启动顺序：`restoreTasks`（restoreRequestState 标 orphan → `recoverBlocks`）→ `reconcileAppDispatch`；
  recover 扫描即可在同一次启动内重呈现/重投。
- `createRepairTask` 并发：账本 guard 串行 read-判-写；同键只保留一条 repair 任务，败方回执 replay
  同 taskId（桌面不写第二条、不按本地 id 路由）。

## 八、smoke-drive.mjs:808（测试侧）

- 位置：`C:/Users/51054/Desktop/work/ans-smoke-app-dispatch-2026-11-20/rr/smoke-drive.mjs`（**不在仓库内**，
  本机可定位；未提交、未改产品语义）。
- 根因：CDP `call()` 无超时；心跳段 `await shot("ui-heartbeat.jpeg").catch(...)` 在
  `Page.captureScreenshot` 永不回包（页面崩溃/端口失效）时 unsettled ⇒ 主循环卡死、`finalize` 不执行。
- 修复：`shot()` 以 `Promise.race` 加 15s 有界超时（timer `unref`，失败记 `screenshot.error` 并返回
  null）；心跳/错误路径均明确失败而非悬挂。`node --check` 通过。

## 九、验证（cwd = worktree，均未提交）

1. `npx tsc --noEmit`：**0**。
2. 临时自检 `.tmp-desktop-smoke-seams-selfcheck.ts`（未跟踪）6 组全过：
   - 并发 advance 同 stage ⇒ A2 仅 1 条任务（同 taskId）；
   - A2 blocked（product）⇒ Q8 attempt2 唯一、A2 任务=2、**repair=0**、blocks.jsonl
     `raised→routed(engine-auto-fix)→resolved(fixed)`；
   - A2 attempt2 done ⇒ A3 card-prompt + `request.created` 唯一；
   - card-prompt 未送达扫描（目标强制 busy）⇒ `target-busy`（B5）→ engine 重投 2 轮 fixed
     （每轮同 taskId、不新建卡任务）；第 3 轮达上限 ⇒ `autoFixForbidden` → owner-repair +
     属主修复任务（不继续自动重投）；
   - `request.orphaned(restart)` ⇒ 同 requestId 第 2 条 `request.created` + block
     raised→routed→resolved(fixed)，卡任务 1 条；
   - `request.orphaned(superseded)` ⇒ prompt 任务 rejected 收口、无重投事实（不误判）。
3. 代表性桌面测试：
   - `test/桌面应用/app-dispatch-delivery.test.ts` 5/5；
   - `test/桌面应用/block-router.test.ts` 18/18；
   - `stuck-redispatch` + `stuck-redispatch-safety` + `fixed-path-routing` + `chief-workflow` 94/94；
   - `b51-fixed-workflow-wiring` + `handback-delivery` + `task-restart` + `queue-withdraw-lru`
     39/39（`--test-concurrency=1`；并行跑时 `task-restart` 首例单测本身约 52s，曾出现一次文件级
     超时/失败，串行/单独运行均通过——与本次改动无关的慢用例）。
   - 编排侧回归：`app-dispatch-service`/`block-ledger`/`block-resolution`/`project-state`(-workflow)
     58/58；`app-dispatch-b2` + 桌面 `project-state` + `app-dispatch-tool-surface` + `session-structure`
     19/19。
4. legacy/fixed-v2.1：上述测试（fixed-path/chief/stuck）零回归；card-prompt 扫描只对
   `from:"application" && taskKind:"card-prompt"` 且 `workflow.started.protocol=app-dispatch/v1` 生效。

## 十、待测试批断言点（建议）

1. **并发双触发**：`Promise.all([drive, drive])`、`observe blocked ∥ reconcile`、桌面多入口
   `advance` 并发 ⇒ A2 `task.created` 仅 1 条/attempt2 唯一，两回执同 `taskId`；repair=0。
2. **block 必现**：observe blocked（Q8 成功/耗尽/高风险/重试失败）分别断言
   `blockOutcome=retrying/fixed/escalated` 与事实 detailCode；桌面路径后 `blocks.jsonl` 形状
   `raised→routed→resolved(fixed|decided)`，且 `routed.route=engine-auto-fix`（retrying/fixed）。
3. **reconcile 丢块**：reconcile 先于桌面观察收口 ⇒ `workflow.blockFacts` 含 retrying/fixed 事实并被路由。
4. **修复任务并发**：两次同键 `createRepairTask`（同 block/attempt）⇒ 账本仅 1 条、双方同一 taskId、
   败方 replay；closed(accepted) 后不重复收口。
5. **card-prompt target-busy**：目标 busy + 超过 T_stall ⇒ `target-busy`（class environment-infra/B5）；
   engine 重投同 taskId（队列已有则不重复入队）；不新建卡任务；**每 T_stall 一轮、上限
   `maxAutoFixAttempts` 轮后 `autoFixForbidden` ⇒ owner-repair（属主修复任务）**，失败/超时再升级客户（有界）。
6. **orphan 重呈现**：restart orphan ⇒ 同 requestId 第 2 条 `request.created`（内容逐项一致）、
   卡任务 1 条、block fixed；重呈现后 `project_state.request-pending` 可见。
7. **orphan superseded**：prompt 任务 rejected 收口、无重投事实、无 block。
8. **恢复读回**：raised 时 `detailCode/engineCanRepair` 持久化，重启后 `blockFactFromLifecycle`
   分类一致（reconcile→engine-auto-fix；不回落 model-anomaly）。
9. **旧协议**：fixed-v2.1/legacy 不出 card-prompt 扫描事实、行为逐字不变。
10. **`initiator-aborted`**：若 app card-prompt 出现该 reason，当前按 restart 处理（同 requestId 重呈现）；
    测试批可按协调者口径钉死或改判。

## 十一、剩余风险

1. **跨进程并发**不在本批（与编排批同口径：进程内锁 + 账本串行 guard）。
2. `target-busy` 的有界轮次以 blocks 账本「已 `resolved(fixed)` 的同码/同 task 块数」计数，
   每轮间隔 T_stall；达到上限后升级属主（open owner-repair 块由 T_repair 超时再升客户）。
   若属主修复链也长期无进展，最终仍依赖看护/人工（不伪造完成）。
3. `card-prompt-stalled`（已送达未呈卡）按未知名码落 B8 属主修复；若需更精确类目需 R1 码表加法
   （本批未改分类语义）。
4. 重呈现写入同 requestId 的第二条 `request.created`：block-router/本模块/project-state 均为
   「最后一条为准」；其它按 `request.created` 首次行读取的旧消费者（如 acceptance-facts 的 flow 映射）
   对 app-dispatch card-prompt 不参与，未见影响；测试批可加跨消费者回归。
5. 本批依赖编排批未提交改动（锁/唯一 guard/新回执字段）同树生效；两批需一并提交/发布。
