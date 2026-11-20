# 变更记录：app-dispatch 接缝修复——单一创建者 / 确定性 taskId / 账本唯一（编排/模型批）

- 日期：2026-11-20
- 角色：ANS 内置「编排」（编排/模型侧实现；协调者已授权本批范围）
- 分支/工作树：`fix/app-dispatch-smoke-seams`（worktree `.claude/worktrees/fix-app-dispatch-smoke-seams`；
  HEAD 起点 `8939367` = origin/main；本记录未提交）
- 背景：SMOKE-1（真机基线 `8939367`）在 A2/product 同秒出现两条应用任务
  `t-app-2128a768…` 与 `t-app-317321a9…`。客户第一不变量：**任务必须由工作流/应用侧唯一派发，
  taskId 必须一致且确定，任何其它路径不得重复建任务**。
- 范围：**只改编排/模型侧**（`src/common/编排/task-state.ts`、`src/common/编排/workflow-service.ts`）。
  未改 `app/desktop/**`、`test/**`、门禁文本/roles、`release.yml`/release-policy、`block-resolution.ts`
  分类语义（只消费）；未 commit/push/CI/tag；未读 `.env`；未占 9222/9223/9224；无新增依赖。

## 一、问题（SMOKE-1 暴露的接缝）

现有实现中，同一阶段尝试可能由多条路径各自建任务：

1. **Q8 重试**（`observeAppDispatchTaskReport` → `driveAppDispatchStage`）与 **并发 reconcile**
   同时读到「可驱动」快照，各自计算 attempt / 建 `task.created`；
2. **stage-execution 的幂等键含 targetRole**（`stage-exec:<wf>:<stage>:<role>:<attempt>`）：
   两次解析出不同执行者（名单变化/并发窗口）⇒ 键不同 ⇒ 仅靠键相等无法阻止第二条任务；
3. **block resolver 属主修复任务**（`block-repair:<blockId>:<attempt>`，随机 `newTaskId`）可在
   引擎重试路由期间并发创建（两套「修复」路径并行）；
4. `appendTaskEvent` 对 `task.created` 没有 replay/幂等 guard：同 taskId 或同幂等键的并发写会
   追加第二行（重放只是报「重复 task.created」错误，不返回既有任务）。

## 二、实现的 API 面（给桌面 B / route）

均在 `src/common/编排/workflow-service.ts` 导出：

1. `createAppDispatchTask(input): Promise<CreateAppDispatchTaskResult>`
   - 输入：`projectRoot / workflowId / stage / targetRoleId / taskKind / text / sideEffect /
     moduleId? / moduleDirectory? / modulePaths? / now?`；
   - **对外只允许 `taskKind:"worker-dispatch"`**（application→convener 请派 worker；定义阶段 B1/A11）。
     **单一创建路径**：`stage-execution` / `card-prompt` 是阶段驱动任务，只能由
     `driveAppDispatchStage` / `reconcileFixedWorkflow` 按流程/卡定义创建；对外请求这两类 ⇒
     稳定拒绝码 **`app-dispatch-drive-required`**（不得先建后驱；测试批已暴露
     「API 先建 stage 任务 → drive 同阶段 ⇒ 文本不一致 workflow-corrupt、stage.dispatched 缺失」的混用缺陷）；
   - **attempt 一律由账本派生**（与 drive 同口径：in-flight 取当前/已请求最大；否则 prior+1），
     不接受模型/调用方自报；
   - 校验定义内阶段/任务种类（`defStage.taskKind !== taskKind` ⇒ `stage-transition-invalid`）、
     `canRequestStage`、blocked 的高风险零重派与重试预算；
   - **不改变阶段状态机/完成判定**：只建任务、不写 workflow/stage 事件；
     `stage.requested/stage.dispatched` 仍由既有 drive/reconcile 幂等补齐（同 taskId 复用）。
2. `appDispatchIdempotencyKey({workflowId, stage, targetRoleId, taskKind, attempt})`
   - `taskKind` 显式分派；返回**与在飞 v1/v2 逐字一致的键格式**：
     `stage-exec:<wf>:<stage>:<role>:<attempt>` /
     `worker-dispatch:<wf>:<stage>:<attempt>`（role 固定 convener）/
     `card-prompt:<wf>:<stage>:<requestId>`（requestId 含 attempt）。
3. `isAppDispatchTaskKind(value)`：种类守卫（新 taskKind 必须显式入名单/派生，否则 fail-closed）。
4. `CreateAppDispatchTaskReceipt = AppDispatchTaskReceipt & { attempt }`
   - `taskId / idempotencyKey / attempt / taskKind / to / promptId? / replay`；
   - `replay=true` ⇒ 返回同一条任务，**不追加第二条**。
5. 既有函数的新增事实出口（加法兼容）：
   - `ObserveAppDispatchTaskReportReceipt.blockFact?`：**每个 blocked/failed 报告**（被应用按 B31
     轻量归档接受的 blocked 除外——那是 accepted，不是 block）在重试决策前生成；
     `detailCode:"reconcile"` 表示引擎重试/对账在办；
   - `ObserveAppDispatchTaskReportReceipt.blockOutcome?: "retrying" | "fixed" | "escalated"`：
     桌面可判（retrying=重试已触发；fixed=确定性动作已收口；escalated=预算/高风险/重试失败）；
   - `ReconcileWorkflowReceipt.blockFacts` 现在也会携带对账内观察收口产生的 retrying/fixed/escalated
     事实（并发 reconcile 先于桌面观察时不丢块）。

## 三、幂等 / 唯一 / 锁设计

1. **唯一创建核心**：`createAppDispatchTaskCore(projectRoot, context, workflowId, stage, spec, now)`
   - 阶段任务（stage-execution/card-prompt）与 worker-dispatch 都经此核心；**外部桌面 API
     `createAppDispatchTask` 只放行 worker-dispatch**，阶段任务只允许 drive/reconcile 进入核心
     （单一创建路径）；
   - taskId = `appDispatchTaskId(键)`（`t-app-<sha256(键) 前 24 hex>`）；
   - `stage.requested.requestTaskId` 作为可选 `expectedTaskId`；与确定性派生不一致 ⇒
     `workflow-corrupt`（不猜、不自动推进）；
   - 最终以 `appendTaskEvent` 的账本 guard 收口（见 2）。
2. **账本层唯一 guard**（`task-state.ts::appendTaskCreatedIdempotent`，覆盖三类应用任务 + repair）：
   - 同一 tasks 文件的 read-判-写在同一进程串行链中完成；
   - 同 taskId 已存在：payload 一致 ⇒ 返回既有任务（`replay:true`，不追加）；不一致 ⇒
     `invalid-task-binding`（不重绑）；
   - 同 idempotencyKey 但 taskId 不同：repair 返回既有（同键只允许一条修复任务）；
     应用任务 ⇒ `invalid-task-binding`（taskId 必须由键派生，禁止第二创建者）；
   - `workflow-service` 把 `invalid-task-binding` 映射为 `workflow-corrupt` 回执；
   - legacy 派遣/重派（无 workflowId/taskKind；重派沿用原键）**不经过该 guard**，行为逐字保持。
3. **同阶段同尝试槽位唯一**：`(workflowId, stage, taskKind, attempt)` 已有任务但键不同
   （如名单变化导致 targetRole 漂移）⇒ `workflow-corrupt`，不并列第二条。
   键 attempt 解析：stage-execution/worker-dispatch 取末段；card-prompt 由 promptId 确定性反查（≤50）。
4. **进程内锁**（key = `projectRoot+workflowId`；select 另加 `projectRoot` 锁）：
   - `driveAppDispatchStage` / `observeAppDispatchTaskReport` / `reconcileFixedWorkflow`（逐 workflow）
     / `selectWorkflow`（整段）共用 `withServiceLock`；observe/select/reconcile 内部调用
     `*Locked` 核心，避免重复取锁；
   - 锁序固定 `project → workflow`（只有 select 同时取两把）；task-state 链在 workflow 锁内，
     不与流程锁反向嵌套；
   - settled tail：前序异常不毒化后继；段内只做本地文件 I/O，不等待外部事件/投递；
   - **跨进程并发不在本批范围**（与既有 fixed 账本 append 链同口径）。
5. **block resolver 衔接（不改分类语义，只消费）**：
   - rejected 报告：重试成功 ⇒ blockFact（`detailCode:"reconcile"`，resolver 现有分类走
     `engine-auto-fix`）+ `blockOutcome: "retrying"`（重试即完成的阶段为 `"fixed"`）；
     桌面 raise block 后 engine advance/reconcile 幂等收口并记 `resolved(fixed)`；
   - 预算耗尽/高风险 ⇒ 既有 B9/B4 事实 + `blockOutcome: "escalated"`（客户/judge 面）；
   - 重试失败 ⇒ 如实带原错误码/消息的事实 + `escalated`（不伪造已重试）；
   - rework（A12b→A11）⇒ 固定事实 + `blockOutcome: "fixed"`；
   - **引擎重试路由期间不会并发建 owner-repair 修复任务**：retrying/fixed 事实走
     `protocol-reconcile → engine-auto-fix`，不是 `model-anomaly → owner-repair`。
6. **reconcile 不直接 append task**：只调用 locked observe/drive；并发/串行均由锁 + 账本 guard 归一。

## 四、兼容

- 键格式与在飞 app-dispatch v1/v2 任务**逐字一致**（见二.2）；taskId 派生公式不变；
- 旧任务缺少后加数组字段（`cardDocumentRefs/cardOptions/cardRecommended/modulePaths/...`）时
  不据此判 payload 冲突（在飞兼容）；既有字段有值则逐项一致；
- `fixed-v2.1` / legacy 路径未改（`selectWorkflow` 之外的旧入口、`requestStage`、旧 `appendTaskEvent`
  非应用任务路径逐字保留）；
- `block-resolution.ts` 分类/路由语义未改；本批只选择既有 `detailCode:"reconcile"` 分类消费。

## 五、验证（cwd = worktree）

- `npx tsc --noEmit`：**0**。
- 并发自检（临时脚本 `.tmp-smoke-seams-selfcheck.ts`，未提交）4 组全过：
  1. 并发两次 drive 同 stage ⇒ A2 `task.created` 仅 1 条，两 receipt 同 taskId；
     `createAppDispatchTask(taskKind:"stage-execution")` ⇒ `app-dispatch-drive-required`（不建任务）；
     手工种入同阶段同尝试但不同 targetRole 的应用任务 ⇒ drive `workflow-corrupt`（槽位唯一），不追加；
  2. observe blocked 重试 与 reconcile 并发 ⇒ A2 仅 attempt1+attempt2 两条、attempt2 唯一、
     零 repair 任务；blockFact 经 observe 或 reconcile 回执交出（并发不丢块）；
  3. worker-dispatch API：同 key 重复调用 replay（同 taskId、不追加）；同 key 冲突 payload ⇒
     `workflow-corrupt`；taskId 对同 tuple 稳定、不同 attempt 不同；
  4. 并发同键 repair 任务（不同 taskId）⇒ 账本只保留 1 条，另一回执 replay。
- 既有测试：`test/编排/**` **1446 tests / 1444 pass / 0 fail / 2 skipped**（含 app-dispatch-service、
  app-dispatch-b2、task-state、block-ledger、block-resolution）；
  `test/桌面应用/block-router.test.ts` 等 27 tests 全过（与上批合跑 99 tests 全过）。
- 测试批新增用例（同工作树并行产物，未提交）：`test/编排/app-dispatch-task-idempotency.test.ts`
  **6/6 过**；`test/桌面应用/app-dispatch-block-seams.test.ts` **5/5 过**（含桌面 `logObservation`
  消费 retrying blockFact ⇒ blocks `raised→engine-auto-fix→resolved(fixed)`、A2 attempt2 唯一、repair=0）。

## 六、待桌面 / 待测试点（下一批）

1. **桌面 B**：消费 `blockOutcome`（retrying/fixed/escalated）可减少对 detailCode 的隐式依赖；
   现桌面已能通过 `blockFact` 正常 raise/route/resolved(fixed)。
2. **桌面恢复路径**：`blockFactFromLifecycle` 未复制 `detailCode/engineCanRepair`；
   blocks 账本 `block.raised` 已持久化 detailCode，但恢复重路由时可能回落 model-anomaly。
   建议桌面批次在重建事实时读回 `detailCode`（本批不改 app/desktop）。
3. **桌面 repair 创建**：`block-router.createRepairTask` 在并发路径应消费 append 回执的 taskId
   （本批账本 guard 已保证唯一；败方回执为 replay，不再写第二条）。
4. **测试批**（已按测试批反馈收紧）：
   - `createAppDispatchTask` 的阶段任务用例改为断言稳定拒绝码 **`app-dispatch-drive-required`**；
     并发 stage 用例继续走 `driveAppDispatchStage`（单一创建路径）；
   - observe 回执新增 `blockFact`（retrying）+ `blockOutcome`；现有断言未覆盖处可直接加；
   - reconcile 回执 `blockFacts` 现在可能含 retrying/fixed 事实（不再是仅 corrupt/errors）；
   - 同键冲突 payload（如卡片 documentRefs 在任务 open 期间变化）⇒ `workflow-corrupt`（fail-closed，
     不再静默复用旧任务）；
   - 同阶段同尝试执行者漂移 ⇒ `workflow-corrupt`；并发 drive/observe/reconcile 回归用例可用
     `Promise.all` 直接覆盖；
   - SMOKE-1 真机复跑：断言 A2 只出现一条 `t-app-*`、Q8 重试 attempt2 唯一、block 账本出现
     raised→routed(engine-auto-fix)→resolved(fixed)。
