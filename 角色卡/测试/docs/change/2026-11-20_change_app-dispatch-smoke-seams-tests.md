# 变更记录：SMOKE-1 接缝修复测试批——并发幂等 / block 必现 / card-prompt 投递与 orphan

- 日期：2026-11-20
- 角色：ANS 内置「测试」（roleId: 测试）
- 分支/工作树：`fix/app-dispatch-smoke-seams`（worktree `.claude/worktrees/fix-app-dispatch-smoke-seams`；
  HEAD `8939367` = origin/main + 编排/模型批与桌面批**未提交**修复）
- 权威依据：
  - `角色卡/编排/docs/change/2026-11-20_change_app-dispatch-smoke-seams-foundation.md`
    （§二 API 面、§三 幂等/唯一/锁、§五 验证、§六 待测试批点）；
  - `角色卡/桌面窗口/docs/change/2026-11-20_change_app-dispatch-smoke-seams-desktop.md`
    （§三 调用点、§五 block 必现、§六 card-prompt 投递/orphan、§十 待测试批断言点、§十一 风险）。
- 客户第一不变量：**任务由工作流/应用侧唯一派发、taskId 确定性、任何路径不得重复建任务**。
- 范围：**只新增 2 个测试文件 + 扩展 2 个既有测试文件（仅增补断言/用例）+ 本记录**。
  未改生产代码、未改 known-red 名单/测试名、未删除或放宽任何既有断言、未新增 skip；
  未 commit/push/CI/tag/main；未读 `.env`；未占 9222/9223/9224；未启动 Electron/真实模型。
- 状态：**完成（未提交；含 2026-11-20 收尾修正同步）**。typecheck **0**；受影响 10 文件 **104/104 pass / 0 fail**；
  三套 known-red 失败名 diff **空（0 命中）**；新旧协议全链 `fixed-path-full-chain` **5/5**。
- 收尾修正（协调方 2026-11-20）：`createAppDispatchTask` 收紧为**仅允许 `taskKind:"worker-dispatch"`**；
  `stage-execution`/`card-prompt` ⇒ 稳定拒绝 `app-dispatch-drive-required`（阶段任务只能由 drive/reconcile
  创建）。本批测试与记录已同步（§一⑤/§二/§五.6/§六.1），并复跑 typecheck 与相关测试。

## 一、新增/变更文件与用例清单

| 文件 | 类型 | 用例数 | 覆盖摘要 |
| --- | --- | ---: | --- |
| `test/编排/app-dispatch-task-idempotency.test.ts` | **新增** | 6 | ① 并发两次 drive 同阶段 ⇒ A2 `task.created` 仅 1 条、两回执同确定性 taskId、`stage.requested`/`stage.dispatched` 各 1 条；② drive∥drive∥reconcile 多入口并发同结论；③ observe blocked（Q8 重试）∥ reconcile∥drive ⇒ attempt1+attempt2 各唯一、无重复 attempt2、repair=0、blockFact/blockOutcome 经 observe 或 reconcile 回执交出（并发不丢块）、同键重复 replay；④ reconcile 先收口 blocked 报告 ⇒ 回执 `blockFacts` 携带 retrying 事实；⑤ **API 收紧（收尾修正）**：`createAppDispatchTask` 的 stage-execution/card-prompt ⇒ `app-dispatch-drive-required` 且账本零新增；worker-dispatch 正例（手播 path B/B1）断言确定性 taskId/键、同键 replay 不追加；taskId 对同 tuple 稳定、不同 attempt/targetRole/taskKind 不同；⑥ 并发同键 repair（不同 taskId）⇒ 账本 1 条、另一回执 replay 同 id；应用任务第二创建者 ⇒ `invalid-task-binding` |
| `test/桌面应用/app-dispatch-block-seams.test.ts` | **新增** | 5 | ⓪ SMOKE-1 A2 blocked **桌面观察路径**：并发 advance 后 A2 唯一；报告 blocked → `observeApplicationTaskReport` → logObservation 消费 `blockFact` ⇒ blocks.jsonl raised→routed(engine-auto-fix)→resolved(fixed)，raised 持久化 detailCode/engineCanRepair；attempt2 唯一、repair=0；① A3 card-prompt 目标持续 busy：`target-busy`（B5）经 router `tick` 有界重投（每 T_stall 一轮，同 taskId）⇒ `resolved(fixed)`；第 3 轮 `autoFixForbidden` ⇒ `owner-repair`（修复任务 1 条、routed 消费回执 taskId）；全程卡任务 1 条、requestId 1 个、`request.created` 1 条；② `request.orphaned(restart)` ⇒ 同 requestId 第 2 条 `request.created`（逐项一致）+ 同 taskId 重投，`blocks.jsonl` raised→routed(engine-auto-fix)→resolved(fixed)；raised 持久化 detailCode/engineCanRepair；project_state 不再显示旧 orphaned、`request-pending` 可见；③ `orphaned(superseded)` ⇒ prompt 任务 rejected 收口、不重呈现/不重投/不造块；④ orphan(restart) 但阶段已迁移 ⇒ 按实际语义 rejected 收口（不误重投） |
| `test/桌面应用/block-router.test.ts` | 扩展 | 18 → **22** | 新增：① A2 blocked（Q8 重试成功）observe 回执经 router 必现 raised→routed(engine-auto-fix)→resolved(fixed)，raised 带 detailCode/engineCanRepair，零 repair、A2 仅 2 任务；② A2 blocked **两次** ⇒ blocks.jsonl **两条 raised**（第 1 条 retrying→engine fixed；第 2 条耗尽 escalated（retry-budget-exhausted）→**客户决策卡**，不靠 retry 消化），不建第 3 任务/零 repair；③ 恢复读回：raised 持久化 detailCode/engineCanRepair ⇒ `recover` 仍 engine-auto-fix（不回落 model-anomaly/owner-repair），不伪造任务；④ 并发两个 router 同键修复任务 ⇒ 账本 1 条 repair、routed 同 taskId（败方消费 replay 回执） |
| `test/编排/app-dispatch-service.test.ts` | 扩展（**仅增补断言**） | 20 → 20 | observe blocked 既有用例增补：Q8 重试成功 `blockOutcome=retrying` + `blockFact`（code/detailCode reconcile/engineCanRepair/taskId/protocol/stage）；预算耗尽 `escalated` + `retry-budget-exhausted`；高风险零重派 `escalated` + `high-risk-blocked`（highRisk） |

合计：**新增 2 文件 / 11 用例；既有文件扩展 4 + 3 个新用例（block-router）/ 3 组增补断言（app-dispatch-service）**。

## 二、任务断言点覆盖矩阵

| 任务书要求 | 覆盖位置 | 状态 |
| --- | --- | --- |
| 同一 workflow/stage 并发两次 `driveAppDispatchStage`（Promise.all）⇒ 账本仅 1 条 task.created、两回执同 taskId、stage.requested 一条 | app-dispatch-task-idempotency ① | ✅ |
| observe blocked retry 与 reconcile/advance 并发 ⇒ A2 attempt1+attempt2 各唯一、无重复 attempt2、repair=0；同键重复调用 replay | app-dispatch-task-idempotency ③ | ✅ |
| 同键 payload 冲突 ⇒ 账本零新增/fail-closed；同阶段同尝试 targetRole 漂移同 | app-dispatch-task-idempotency ⑥（同 taskId 冲突 payload ⇒ `invalid-task-binding`；同键不同 taskId ⇒ 第二创建者拒绝）+ drive 并发用例（expectedTaskId/临时锁归一，不并列第二条）。**收尾修正后公开 API 不再建 stage-execution**，该面经账本 guard 与 drive 路径覆盖 | ✅（口径随 API 收紧调整） |
| `createAppDispatchTask` 收紧 ⇒ 仅 worker-dispatch；stage-execution/card-prompt ⇒ `app-dispatch-drive-required` 且账本零新增；worker-dispatch 确定性/replay | app-dispatch-task-idempotency ⑤ | ✅ |
| 并发 `createRepairTask`（或 block 同键 repair）⇒ 账本仅 1 条、另一回执 replay/同 id | app-dispatch-task-idempotency ⑥（账本层并发）+ block-router 新增④（两 router 并发） | ✅ |
| taskId 确定式：同 tuple 稳定、不同 attempt/targetRole/taskKind 不同；无两条同 stage/attempt 的 t-app | app-dispatch-task-idempotency ①⑤ | ✅ |
| 断言真实并发窗口（不串行化测试本身） | Promise.all 直接并发（服务锁/账本链内归一）；两 router 实例独立串行链共享账本（§三） | ✅ |
| A2 task.reported(blocked) 即便 Q8 重试成功，blocks.jsonl 必现 raised→routed(engine-auto-fix)→resolved(fixed)；raised 携 detailCode/engineCanRepair；repair=0；observe 回执 blockFact+blockOutcome 消费路径；blocked **两次** ⇒ 两条 raised | block-router 新增①②；app-dispatch-block-seams ⓪（桌面 logObservation 真实消费路径）；app-dispatch-service 增补断言 | ✅ |
| 重试耗尽/高风险 ⇒ blockOutcome escalated / owner/customer 路由（不得只靠 retry 消化） | block-router 新增②（客户决策卡）；app-dispatch-service 增补（A2 耗尽 + A13 高风险） | ✅ |
| blocks raised 持久化 engineCanRepair/detailCode，恢复重路由不回落 model-anomaly | block-router 新增③；app-dispatch-block-seams ② | ✅ |
| A3 card-prompt 目标 busy/不可投递：同 taskId 有界重投，成功 ⇒ resolved(fixed)；达预算 ⇒ owner-repair/客户卡（autoFixForbidden）；不新开卡、不重复任务 | app-dispatch-block-seams ① | ✅ |
| `request.orphaned`(restart) ⇒ 同 requestId 追加 request.created 重呈现 + 重投，block fixed；project_state 不再显示旧 orphaned | app-dispatch-block-seams ② | ✅ |
| `request.orphaned(superseded)`/流程关闭/阶段迁移 ⇒ prompt 任务按实际语义 rejected，不误重投、不重弹 | app-dispatch-block-seams ③④（superseded + 阶段迁移；流程关闭见 §六.3） | ✅/◐ |
| requestId/promptId 幂等、卡只一张、无孤儿遗留 | app-dispatch-block-seams ①② | ✅ |
| 更新既有断言（observe 新字段 / reconcile blockFacts / 恢复 detailCode）并逐条记录理由 | §五；app-dispatch-service 增补、app-dispatch-task-idempotency ④、block-router 新增③ | ✅ |
| 不得放宽/删除/skip；冻结 known-red 名不变 | 既有测试 diff 为**纯新增行**（`git diff --stat`：+236/-0）；未改名/删除/skip；名单文件未改（§四.3） | ✅ |

## 三、并发取证方法（真实并发窗口，非测试串行化）

1. **服务层并发**：所有并发用例用 `Promise.all([...])` **同时发起** `driveAppDispatchStage` /
   `observeAppDispatchTaskReport` / `reconcileFixedWorkflow` / `createAppDispatchTask`，不预先 await 任一方。
   实现的 `withServiceLock(projectRoot+workflowId)` 是**被测对象**：并发调用先同时进入公开入口，
   锁内 read-判-写与账本 `appendTaskCreatedIdempotent` 串行链归一。断言以账本事实
   （`task.created` 行数/幂等键/attempt）为准，不依赖回执顺序。
2. **observe∥reconcile 胜负二选一**：不强制某一方先拿锁；断言
   `observe.blockFact` 与 `reconcile.workflows[].blockFacts` **合并后**至少一条 `detailCode=reconcile`
   事实（并发不丢块），并按 `observed.replay` 分支断言 retrying 或已收口 replay。
3. **账本层并发**：两个 repair `task.created`（同 `block-repair:<blockId>:1`、不同本地 `taskId`）
   与两条应用任务 `task.created`（同键不同 taskId）直接用 `Promise.all(appendTaskEvent(...))` 并发；
   断言恰好一成功/一 replay（repair）或一成功/一 `invalid-task-binding`（应用任务）。
4. **桌面两 router 并发**：两个 `createDesktopBlockRouter` 实例（各自独立 `serialize` 链）对同一 root
   并发 `observeFact` 同一事实；block 账本 append 链串行，但 repair 任务创建在两个 router 间真并发，
   断言账本仅 1 条 repair、routed 同 taskId。
5. **有界重投轮次**：SessionManager 注入假时钟（`deps.now`）；每轮把时钟推进 `T_stall+1s`，
   让 `scanAppCardPromptFacts` 的轮次计数/间隔按真实语义生效；断言每轮同 taskId、卡任务/requestId 不变，
   第 3 轮 `autoFixForbidden` 升级属主。
6. **异步桌面观察路径**：`observeApplicationTaskReport` → `blockRouter.observeFactLater` 为生产异步链；
   测试用 `waitFor`（上限 4s，10ms 轮询）等待 block 结算，不伪造同步。

## 四、验证

### 4.1 typecheck

- `npx tsc --noEmit`（cwd=worktree）：**exit 0，0 error**（含两个新增文件与既有文件增补；
  API 收紧落树后最终复跑）。

### 4.2 受影响测试（`node --test --test-concurrency=1`）

| 文件 | tests / pass / fail / skipped |
| --- | --- |
| `test/编排/app-dispatch-service.test.ts` | 20 / 20 / 0 / 0 |
| `test/编排/app-dispatch-task-idempotency.test.ts`（新） | 6 / 6 / 0 / 0 |
| `test/编排/block-ledger.test.ts` | 11 / 11 / 0 / 0 |
| `test/编排/block-resolution.test.ts` | 15 / 15 / 0 / 0 |
| `test/桌面应用/block-router.test.ts` | 22 / 22 / 0 / 0 |
| `test/桌面应用/app-dispatch-delivery.test.ts` | 5 / 5 / 0 / 0 |
| `test/桌面应用/app-dispatch-block-seams.test.ts`（新） | 5 / 5 / 0 / 0 |
| `test/桌面应用/stuck-redispatch.test.ts` | 10 / 10 / 0 / 0 |
| `test/桌面应用/stuck-redispatch-safety.test.ts` | 5 / 5 / 0 / 0 |
| 合跑（上述 9 文件，`--test-concurrency=1`） | **99 / 99 / 0 / 0**（16.2s，API 收紧后最终复跑） |
| `test/测试/fixed-path-full-chain.test.ts`（新旧协议全链） | **5 / 5 / 0 / 0**（16.2s，同一最终复跑） |
| **合计** | **104 / 104 / 0 / 0** |

补充回归（project-state orphan 非粘性 / card-prompt 扫描接线 / 工具面）：
`block-resolver-projects` + 桌面 `project-state` + `pending-card-restart` **11/11**；
`app-dispatch-tool-surface` + `session-structure` **12/12**。

### 4.3 三套 known-red 冻结名单

| 名单 | 文件 SHA-256（本批实测，文件未改） | 域运行 | 结果 |
| --- | --- | --- | --- |
| runtime-core-33 | `0c9e4dde2b4e8db59e5f0401ae28962c43e4438b6341351f399f682dc43d202c` | `test/runtime-core/**/*.test.ts`：607 tests / 603 pass / 0 fail / 4 skipped | **0 命中（diff 空）** |
| gates-5 | `8325f9d8f24a7aeda3899be9187297744bf517c1975ddaf9c9dc0fcd860139f2` | `test/gates/**/*.test.ts`：29 tests / 29 pass / 0 fail | **0 命中（diff 空）** |
| orchestration-24 | `f9513fb0e9578a260fe20ee3643d1980d5135f4c24b479fbd3b3bdd279547804` | `test/编排/**/*.test.ts` 逐文件（144 文件，API 收紧后最终复跑）：**1452 tests / 1450 pass / 0 fail / 2 skipped** | **0 命中（diff 空）** |

- 三份名单文件均无 git 改动；本批未改名/删除/放宽任何冻结 known-red 测试名，未新增 skip。
- orchestration 2 / gates 0 / runtime-core 4 个 skipped 为既有（非本批新增；新文件无 skip/force-exit）。
- **运行方式披露（`test/编排`）**：目录级 `--test-concurrency=1` 运行在本环境出现文件级挂起——
  首轮在 `appointment-roster.test.ts` **全部 9 个用例打印通过后**进程未退出（约 14min 无新输出，
  属测试后句柄泄漏，非用例失败；单独 `--test-force-exit` 运行 **9/9 pass / 0.53s**）；次轮
  `--test-concurrency=1 --test-force-exit` 又在 `git-action-authorization-wiring-publication.test.ts`
  首个用例处长时间无输出（单独运行 **1/1 pass / 7.1s**），均判为环境/文件级挂起。
  为取得完整计数与失败名，最终按**文件逐个**运行（`node --test --test-force-exit <file>`，
  `timeout 180s`/文件，`xargs -P 4`），144/144 文件完成、0 个非零退出、0 个 fail 文件；
  与目录级运行同为 Node 测试进程隔离（每文件独立进程），不 skip、不改测试文件。
  **API 收紧落树后已用同一方式整体复跑**，计数与失败名 diff 不变。
- runtime-core-33 名单以**实际文件 SHA-256 `0c9e4dde…`** 为准（R4a 记录引用的 `973c918f…` 为
  陈旧/不一致引用）；名单文件未改、域内 0 fail、diff 仍为空（见 §六.2）。
- 证据（未跟踪）：`.tmp-seams-knownred-runtime-core.tap`、`.tmp-seams-knownred-gates.tap`、
  `.tmp-seams-knownred-orch.tap`（逐文件输出拼接）、`.tmp-orch-parallel/summary.txt`（144 文件逐文件计数）、
  `.tmp-orch-fails.txt`（实际失败名集合，0 行）。

## 五、既有断言更新逐条理由（只增补，不放宽）

1. `app-dispatch-service.test.ts`「observe blocked：Q8 一次自动重试…」：
   - **新增** `observed1.blockOutcome === "retrying"` 与 `blockFact` 六字段断言。
   - 理由：编排批 §二.5 明确「每个 blocked/failed 报告在重试决策前生成事实」，SMOKE-1 A2 无
     blocks.jsonl 的根因正是旧实现只在耗尽/高风险时给事实；新出口必须由测试钉住。
   - 既有 outcome/retried/blocked/任务数/事件断言逐字保留。
2. 同用例预算耗尽分支：**新增** `blockOutcome === "escalated"`、`blockFact.code === "retry-budget-exhausted"`、
   `taskId`。理由：B9 客户/judge 面事实出口；防止把「重试耗尽」误当 retry 消化。
3. 同文件 A13 高风险分支：**新增** `blockOutcome === "escalated"`、`blockFact.code === "high-risk-blocked"`、
   `highRisk === true`、`taskId`。理由：B4 客户主权面（Q8 零重派），事实必须 escalate 而非重试。
4. `block-router.test.ts`：既有 18 用例**零改动**（未改名、未改断言），仅追加 4 个新用例；
   恢复/对账既有用例保持逐字。
5. `app-dispatch-task-idempotency.test.ts` reconcile 用例：断言 `reconcile` 回执
   `blockFacts` 现可携带 retrying/fixed 事实（编排批 §二.5 加法字段）；旧「仅 corrupt/errors」断言
   不存在于既有测试（无需回改），本批新增确定性覆盖。
6. **收尾修正（协调方 2026-11-20）**：`createAppDispatchTask` 收紧为仅允许 `worker-dispatch`；
   stage-execution/card-prompt ⇒ `app-dispatch-drive-required`。测试 ⑤ 由「API 先建 A2 再验证
   replay/冲突」改为「拒绝码 + 账本零新增」+「worker-dispatch 正例（确定性/replay）」；原因：
   先建 stage 任务再 drive 会因 `text`（稳定字段）不一致触发 `workflow-corrupt`（§六.1 实测），
   阶段任务必须保持单一创建路径（drive/reconcile）。未放宽任何账本唯一/并发断言。
7. 未删除、未弱化、未 skip 任何既有断言；`git diff --stat -- test` 为 **+236 / -0**（两个既有测试
   文件纯新增；两个新增文件未跟踪）。

## 六、披露与生产疑点（报告不改；只读实测）

1. **`createAppDispatchTask` 与 drive 混用会 payload 冲突（已由收尾修正解决）**：
   实测（临时探针，未提交）：`createAppDispatchTask({text:"桌面 API 自定文本"})` 成功建 A2 后调用
   `driveAppDispatchStage` 同阶段 ⇒ `workflow-corrupt`：
   「task.created replay 冲突：任务 … 已存在且 text 不一致（不重绑、不追加）」；
   A2 任务 1 条、`stage.requested` 1 条、`stage.dispatched` 0 条。
   原因：drive 以 `renderAppDispatchTaskText` 自行渲染文本，而 `text` 属 `TASK_CREATED_STABLE_FIELDS`；
   外部调用方无法预知渲染文本 ⇒「先桌面 API 建阶段任务、后 drive 补齐」不可用。
   **协调方 2026-11-20 收尾修正**：`createAppDispatchTask` 已收紧为仅 `worker-dispatch`，
   stage-execution/card-prompt ⇒ `app-dispatch-drive-required`（阶段任务保持单一创建路径）；
   本批测试 ⑤ 已按新口径更新（拒绝 + 账本零新增 + worker-dispatch 正例）。
2. **known-red 名单 SHA 以实际文件为准**：runtime-core-33 名单在本工作树的实际 SHA-256 为
   `0c9e4dde2b4e8db59e5f0401ae28962c43e4438b6341351f399f682dc43d202c`；R4a 记录曾引用
   `973c918f…`，属**陈旧/不一致引用**，以实际文件为准（git 无改动、名单未改）。域内 0 fail、
   diff 为空；按「同名不恶化」口径不影响判定。
3. **orphan `initiator-aborted` 语义未钉死**：阶段文档 §十.10 指出当前实现按 restart 处理
   （同 requestId 重呈现）；本批未新增该 reason 用例，也未改判。建议协调方口径明确后补测。
4. **流程关闭（workflow.closed）的 orphan 未单独覆盖**：本批覆盖 `superseded` 与「阶段迁移」两条
   superseded 路径；workflow-closed 走同一 `supersededReason` 分支，未单独播种 `workflow.closed` 事件。
5. **高风险 A13 的 router 端到端链未单独串联**：服务回执 `escalated/high-risk-blocked` 已在
   app-dispatch-service 钉住；router 对 `high-risk` 类的客户决策卡路由由既有 T-4/B4 用例与
   block-resolution 路由矩阵覆盖；本批未新增 A13→router 全链（避免复制 A13 长夹具）。
6. **同一已路由未结算 block 再次观察会按 repeat 语义升级**：迭代并发用例时实测，第三次观察同一
   open owner-repair block 会走 `repeat` 升级并可能产生 attempt+1 的修复任务（不同幂等键
   `block-repair:<blockId>:2`）。这是既有 B7「重复同指纹 ⇒ 升级」设计，不是并发建重；本批只断言
   同键（attempt 1）账本唯一，未把 repeat 后行为固化为期望。
7. **target-busy 轮次计数依赖 blocks 账本已 `resolved(fixed)` 的同码/同 task 块**：若人工清理/改写
   blocks 账本，轮次会重置；属于设计口径（账本才是事实源），本批未测试篡改场景。
8. **跨进程并发不在本批范围**（与实现批次同口径：进程内锁 + 账本串行 guard）。
9. **真实环境**：未启动 Electron/真实模型、未占调试端口、未读 `.env`；card-prompt/block 路径用
   SessionManager + 假会话 + 注入时钟验证，真机 SMOKE-1 复跑仍需 RR/driver 侧执行。

## 七、未覆盖 / 说明

1. 未改生产代码；所有生产疑点只记录在本记录，未修改实现（§六）。
2. 未新增依赖、未改 `release.yml`/release-policy/门禁文本/roles。
3. 未 commit/push/CI/tag/main；本记录与测试改动均为工作树未提交状态，供协调方与两批实现一并审阅。

*本记录供协调方/客户核对实施对照；不构成合并/发布授权。*
