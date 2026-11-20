# 变更记录：card-request orphan 语义地基——显式取代事实 / presented 清除 orphaned / intent-entry 有界等待（编排/模型批）

- 日期：2026-11-20
- 角色：ANS 内置「编排」（编排/模型侧实现；协调者已授权本批范围）
- 分支/工作树：`fix/card-request-orphan-semantics`（worktree `.claude/worktrees/fix-card-request-orphan`；
  HEAD 起点 `1b7801b` = origin/main；本记录未提交）
- 背景：SMOKE-3（真机基线 `1b7801b`）在 A3 意图卡停摆——应用 reconcile 把**仍在等待的**卡 prompt 请求
  标记 `request.orphaned(reason:"restart")`（13:01:59.436/.449 双写），随后 block B6 `engine-auto-fix`
  以**同 requestId** 重呈现（新 `request.created` + `request.presented`），消费侧把 orphan 当终态跳过，
  卡永久未答。客户立案 S3/S4：对账不得把仍可等待的卡判 orphan；orphan 后重投必须有**显式取代语义**
  与消费者契约；A3 前 `intent-entry-missing` 改为**明确有界等待态**（不用 drive.failed）。
- 范围：**只改地基**——`src/model/runtime.ts`、`src/common/编排/{task-state,project-state,workflow-service}.ts`
  + 本记录。**未改** `app/desktop/**`、`test/**`、门禁文本/roles、workflow 资源、`release.yml`/
  release-policy；未 commit/push；未读 `.env`；未占端口。桌面/测试批随后。

## 一、根因（与本批对应的三个接缝）

1. **重呈现没有显式取代事实**：同 requestId 的第二次 `request.created` 与先前的 `request.orphaned`
   在账本中并存；读者只能靠「后写 created 清 orphan」的实现细节推断，无字段级取代凭据。
2. **生命周期视图未完全「最后一条为准」**：`request.created` 已清除 orphaned（SMOKE-1 seams），
   但 `request.presented` 晚于 `request.orphaned` 时不清理 ⇒ project-state 的 pendingRequests/counts/
   blockers 仍按 orphan 终态投影。
3. **A3 入口未就绪被当作失败**：`computeAppDispatchCardPrompt` 的 `intent-entry-missing`（幕僚尚未写
   `docs/intents/<intentId>.md`）经 drive 以 `ok:false` 返回（SMOKE-3 记录中两次 drive.failed），
   没有明确的「正在有界等待」回执形态，易被消费侧计为失败/block。

## 二、事件字段（加法、向后兼容，不新增 event kind）

`src/model/runtime.ts`：`RequestCreatedEvent.supersedesOrphanAt?: string`

- 同 requestId **重新呈现**时，新的 `request.created` 携带**被取代 `request.orphaned` 事件的 `at` 原文**；
- 非空、可解析时间戳；只由应用写入；首次创建与旧记录无此字段（旧行兼容，不改变既有字段语义）；
- 消费者契约：`supersedesOrphanAt` 存在 ⇒ 该 created 之后的请求是**取代后重新等待**；不得把被取代的
  orphan 当终态。结合「最后一条为准」，重呈现链 = `created → orphaned → created(supersedesOrphanAt=orphaned.at) → presented`，
  最终状态为等待中。

`src/common/编排/task-state.ts`（唯一形状校验点 `validateEvent`）：

- `supersedesOrphanAt` 给出时必须是非空、可解析时间戳；非法 ⇒ 稳定中文消息
  **`request.created.supersedesOrphanAt 非法`**（读侧坏行进 errors；写侧见下）；
- 缺失 ⇒ 不触发任何新校验（旧行/首次创建逐字兼容）；既有必填/可选字段校验不变；
- 写侧：`appendTaskEvent` 的写前校验条件扩展为「`request.created` 且携带 `supersedesOrphanAt`」——
  坏值**拒写**（`invalid-event-source`）。仅在字段给出时触发，不影响既有 writer。

**接线点（留给桌面批，本批未改）**：`app/desktop/session/fixed-workflow/stage-dispatch.ts`
`representOrphanedCardRequest` 的同 requestId 重呈现写入处（当前 `taskEvent("request.created", …)`，
约 L538）需补 `supersedesOrphanAt: view.orphaned.at`（`view.orphaned` 在该分支已非空）。

## 三、生命周期视图（最后一条为准）

`src/common/编排/project-state.ts::collectRequests`：新增

- `request.presented` 晚于 `request.orphaned` ⇒ 清除该 request 的 `orphaned`（与既有「新
  `request.created` 清除 orphaned」同口径）；pendingRequests/counts/`request-pending` blocker 随之恢复等待。
- `superseded` 及其它既有语义不变；`request.resolved` 仍为最终态。
- 只读复核（未改）：`app/desktop/block-router.ts::findRequestState` 与桌面
  `requestViewOf` 已是最后一条为准（created 清 orphan；presented 覆盖 last），本批注释与之对齐。

## 四、drive 的有界等待回执（非失败）

`src/common/编排/workflow-service.ts`：

1. `DriveAppDispatchStageReceipt` 新增可选 `waiting?: { code: string; message: string }`。
2. `driveAppDispatchStageLocked`：`planAppDispatchStageTasks` 因卡 prompt 事实计算
   （`computeAppDispatchCardPrompt` 的入口前置检查，drive 路径内**唯一** `intent-entry-missing` 出口）
   返回 `intent-entry-missing` 时，返回**成功形态**的等待回执：

   ```ts
   { ok: true, workflowId, stage: targetStage, attempt, tasks: [],
     requested: false, dispatched: false, completed: false, replay: false,
     waiting: { code: "intent-entry-missing", message } }
   ```

   - **零事件**：检查发生在 `stage.requested` 第一笔写之前 ⇒ 不写任何 workflow/task 事件、不建任务；
   - **不是失败**：不产生 blockFact；其它失败仍 fail-closed 原样返回；
   - **幂等**：入口未出现期间重复 drive 每次返回等待、仍零事件；入口出现后下一次 drive 走既有路径
     （stage.requested → request.created → card-prompt → stage.dispatched），与从未等待过一致。
3. `reconcileFixedWorkflow`：`driven.waiting !== undefined` 时跳过 `requestTaskId` 一致性判定
   （等待不是账本不一致；入口出现后的下一次对账正常补建并校验），避免把等待误报 `workflow-corrupt`。
4. 复核（未改）：`prepareIntent`/finalize 等其它 `intent-entry-missing` 出口语义逐字不变；
   `observeAppDispatchTaskReport` 的重试驱动只针对 stage-execution 阶段，不经过卡 prompt 事实计算。

## 五、测试点（供测试批）

1. `task-state`：`request.created.supersedesOrphanAt` 合法值写入/读回；空串、非时间戳 ⇒ 写侧拒写
   （`invalid-event-source` + 稳定消息）且读侧坏行进 errors；无字段旧行不受影响。
2. `project-state`：`created → orphaned → presented` ⇒ pendingRequests=1（恢复等待）；
   `created → orphaned → created` 仍为等待（回归）；`created → presented → orphaned` ⇒ orphan 终态（0）；
   `resolved` 最终态不变。
3. `workflow-service` drive（app-dispatch/v1 A3 卡阶段，入口缺失）：
   - 回执 `ok:true`、`waiting.code="intent-entry-missing"`、`tasks=[]`、`requested/dispatched/completed/replay=false`；
   - 账本 tasks.jsonl / workflows.jsonl 行数**不变**（无 request.created / stage.requested / task.created）；
   - 重复 drive 仍等待、零事件；补写入口后 drive 成功建 request.created + card-prompt 任务 + stage.dispatched。
   - **既有断言需更新**：`test/编排/app-dispatch-service.test.ts`「A3 card prompt」用例中
     `missingEntry.ok === false` / `code` / `missing` 的旧断言（本批跑测仅此一处预期失败）。
4. 桌面批接线后：重呈现写入携带 `supersedesOrphanAt`（= 被取代 orphan.at）；消费者（smoke 驱动）按
   「presented 晚于 orphaned ⇒ 恢复作答」修正（S4）。

## 六、风险与边界

- **兼容**：全部为可选字段/成功回执加法；旧账本、旧 writer、旧断言（除明确列出的 drive 旧断言）不受影响。
- **消费语义**：仓库内读侧（project-state / block-router / requestViewOf）已按最后一条为准；外部消费者
  （冒烟驱动）需测试批按新契约更新，否则仍可能按自身 orphan 集合跳过。
- **对账边界**：等待回执仅在「卡 prompt 事实计算」处产生；stage.requested 已存在但入口被删的对账场景
  返回 waiting 而非 corrupt（记录 `driven.waiting`，不建任务；入口恢复后自动补建）。
- 未新增 event kind、未改状态机／分类语义、未改桌面行为；失败仍 fail-closed。
