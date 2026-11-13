# B1（提交 2/2）：22 个类方法迁出到 `session/shared/*` 并委托化

- 日期：2026-11-13
- 角色：桌面窗口
- 工作树：`.claude/worktrees/refactor-session-ts-b1`（分支 `refactor/session-ts-b1`）
- 起点：`cf63cc7`（= origin/main，含 B0）；叠加第一段（提交 1/2）未提交改动
- 方案：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §3.3 / §3.6 / §4.2 / §5 B1、附录 A
- 范围：**B1 第二段（提交 2/2）**——按附录 A 归属，把 22 个类方法**纯搬运**到 `app/desktop/session/shared/`
  的函数（显式参数/端口/回调，不依赖 `this`），`SessionManager` 内保留**同名同签名同可见性**的薄委托；
  私有方法名仍是实例物理面（`sessionKey`/`queueKey` 等测试结构化 cast 访问保持可用）。
  第一段的临时适配（`bumpDesktopExecutionRevision`、Set 类型收窄别名）本段收口为最终 API。

## 1. 结果摘要

| 项 | 值 |
| --- | --- |
| `app/desktop/session.ts` 行数 | 12,421（第一段后）→ **12,388**（-33；`wc -l` 口径） |
| 搬出方法 | **22 个**（22/22 归一化哈希逐字相等，见 §4） |
| 新增 shared 模块 | 6 个（keys/clock/roles/session-views/notifier/tasks-store），扩展 inventory |
| 新增文件行数 | keys 40、clock 10、roles 87、session-views 14、notifier 16、tasks-store 87（`wc -l`） |
| `inventory.ts` | 35 → 68 行（新增 `inventoryChanged`/`publishDeliveryInventory`/`registerDesktopSessionManager` + 状态面接口） |
| 公开导出面 | 运行时 6 值 + 类型 45 **逐字不变**（结构测试 8/8） |
| 行为验证 | 六文件 56/57（唯一失败为既有 AC-8 pin）；14 钉子失败名与 B0 基线**逐名一致，零新增** |
| typecheck | **EXIT=0** |

## 2. 22 方法 → 模块清单（方案附录 A 归属）

| 模块 | 方法（HEAD 源行 · 目标行） |
| --- | --- |
| `shared/keys.ts` | `sessionKey`（1968 · 11）、`targetKey`（1971 · 26）、`queueKey`（8102 · 38） |
| `shared/clock.ts` | `now`（1949 · 8） |
| `shared/roles.ts` | `handbackOwnerRoleId`（5299 · 24）、`chiefTaskRoleIdOf`（5316 · 36）、`dispatcherRoleIdOf`（7851 · 46）、`resolveProofFlowIds`（8077 · 54）、`findListingForFeedback`（8082 · 59）、`roleDisplayName`（8094 · 71）、`refreshListingNow`（3549 · 78） |
| `shared/session-views.ts` | `contextInfo`（2085 · 10） |
| `shared/notifier.ts` | `emitDeliveryNote`（7856 · 12） |
| `shared/tasks-store.ts` | `rememberTaskCreator`（5312 · 24）、`readTasks`（5323 · 29）、`isFixedTask`（5333 · 39）、`appendTaskStateResult`（5399 · 47）、`appendTaskState`（5405 · 54）、`recordTaskFailure`（5409 · 58）、`appendRoleActivity`（5418 · 73）＋ `taskCreators` 状态 |
| `shared/inventory.ts` | `inventoryChanged`（1653 · 55）、`publishDeliveryInventory`（1664 · 66） |

逐方法证据（归一化 sha256、适配命中数）：`…_evidence/moved-methods.json`；人读摘要：
`…_evidence/moved-methods-summary.md`。

## 3. 适配清单（方法体仅做 receiver/state 适配；条件、顺序、错误码、文案、返回值不变）

1. **deps 端口**（`roles.ts` / `notifier.ts`）：`this.deps.getListing` / `this.deps.refreshListing` /
   `this.deps.emitEvent` → 注入的 `deps` 参数（`Pick<SessionManagerDeps, …>`），**仍以 deps 方法调用形式
   执行**（receiver 语义不变）；委托方法传 `this.deps`。
2. **时钟**（`clock.ts`）：`now(deps: { now?: () => number })`，方法体 `deps.now ? deps.now() : Date.now()`
   逐字；`recordTaskFailure`/`appendRoleActivity` 以 `() => this.now()` 回调传入。
3. **`targetKey`**（`keys.ts`）：`this.activeEntry()` / `this.activeRoleId` / `this.sessions.keys()` /
   `this.rebuildChains.keys()` → `TargetKeyState` 只读**回调**（惰性求值时机与次数与原方法一致；
   `return state.activeRoleId()!` 的类型断言为纯编译期标记、无运行时效果）。
4. **任务账本**（`tasks-store.ts`）：`this.readTasks`/`this.appendTaskStateResult`/`this.appendTaskState` →
   同模块函数；`taskCreators` 状态随主迁入本模块（方案 §3.6 状态归属）。
5. **角色日志**（`tasks-store.ts`）：`this.lastRoleActivity` → 显式状态参数（该字段按 B1 范围仍留门面，
   方案 §3.6 的最终归属为后续批次）；`this.now()` → `state.now()`。
6. **库存**（`inventory.ts`）：`this.observedInventoryRoots` / `this.inventoryPublicationErrors` →
   显式 `SessionInventoryState`（方案 §3.6 归属 run-change，B1 不搬状态）；`this.inventoryChanged` →
   同模块函数 + `state`。
7. **逐字搬运口径**：连续代码块切割；方法体文本按原样复制，仅应用上述机械替换。搬运审计对每个方法
   从 `git show HEAD:app/desktop/session.ts` 提取方法体，应用同一适配表后与新函数体做法线化比对：
   **22/22 归一化 sha256 相等**（`moved-methods.json.allFunctionsIdenticalUnderDocumentedAdaptations=true`）。

## 4. 第一段临时适配的收口（最终 API）

`shared/inventory.ts`：

- **删除 `bumpDesktopExecutionRevision()`**：`inventoryChanged` 迁入本模块后，`desktopExecutionRevision++`
  在模块内直接执行（ESM 导入绑定不可赋值的过桥函数不再需要）。
- `desktopExecutionRevision` / `inventoryListeners` 收回**模块私有**；外部只能经 `inventoryChanged` 变更。
- **注册表**：新增 `registerDesktopSessionManager(manager)`（元素最小面 `DesktopSessionManagersSource`），
  门面构造时经它登记（不再直接 `Set.add`）。
- `session.ts` 侧的类型视图固定为 `Set<SessionManager>`（门面的跨实例私有面只读访问：`observedHandles`/
  `controllerDisposalOwners`/`runChangeOperations`），注释说明最小公共面由 inventory 持有、登记走最终 API。
- **单例/订阅/revision 语义逐字不变**：`observedInventoryRoots.add` → revision+1 → `recordGitHostInventory(
  desktopProjectExecutionInventory(root))` → 成功清错/失败记诊断 → 逐 listener 派发（异常吞掉）顺序不变；
  `publishDeliveryInventory` 遍历同一 Set 并对每个 root 调用同一函数。

## 5. 验证结果（最终候选）

| 门槛 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npm run typecheck` | **EXIT=0** |
| 结构保护 | `node --test --test-timeout=120000 test/桌面应用/session-structure.test.ts` | **8/8 通过**（导出面 51；导入图无环/分层/白名单；`session.ts` 12,388 ≤ B0 预算 13,491） |
| 聚合读取器 | `node --test … test/桌面应用/session-source.test.ts` | **5/5 通过** |
| `session.test.ts` | 单文件 | 6/7；**1 个既有失败**：AC-8 预算 pin（实测 5244 ≠ 5223，B0/cf63cc7 基线同样失败，非 B1 引入） |
| `message-queue.test.ts` | 单文件 | **20/20** |
| `boundary-refresh.test.ts` | 单文件 | **14/14** |
| `role-log.test.ts` | 单文件 | **5/5** |
| `hot-path.test.ts` | 单文件 | **3/3** |
| `interface.test.ts` | 单文件 | **8/8** |
| 六文件合计 | 同批运行 | 57 tests / 56 pass / 1 fail（唯一失败 = 上述 AC-8） |
| 钉子·directive-input | 单文件 | 19 tests / **14 pass / 5 既有失败**，失败名与 B0 基线**逐字相同** |
| 钉子·chief-workflow | 单文件 | 66 tests / **57 pass / 9 既有失败**，失败名与 B0 基线（cf63cc7）**逐名相同、零新增**（见 §6） |
| 钉子·h-scope-audit | 单文件 | 7 tests / **4 pass / 3 既有失败**，失败名与基线逐名相同 |
| 其余钉子 | evidence-markers 1/1、queue-status 5/5、request-status 4/4、dispatch-fresh-enum 2/2、run-change-entry 5/5、g1-copy-and-nails 5/5、governance-matrix-integration 18/18 | **全过（40/40）** |

原始日志（含基线对照）：`…_evidence/baseline-*.txt`、`after-*.txt`。失败名集合的机械比对：
`baseline-*` 与 `after-*` 的 `✖` 行 `diff` 为空（六文件/desktop 钉子/testdir 钉子三组 `NO_DIFF`；
chief-workflow 与 B0 基线 `CHIEF_NO_DIFF_VS_BASELINE`）。

## 6. 已知失败与运行环境记录

- **`session.test.ts` AC-8 预算**：pin 期望索引 5,223 B，实测 5,244 B；第一段已在干净 `cf63cc7`
  工作树复现同值失败（`…_contracts-shared-text_evidence/verify-session-test-baseline-cf63cc7.txt`），
  与 B1 无关；按要求未改该测试。
- **directive-input 5 个既有失败**：`sendSession` 指令面板相关（4 个断言/1 个 4s 超时）；基线
  cf63cc7 逐名相同（第一段证据 `verify-directive-input-baseline-cf63cc7.txt`）。
- **chief-workflow 9 个既有失败**：`W5`（selected/commit-race）、`W10`（unmanaged/required）、`W19`、
  `W33`、`W34`；与 B0 基线 9 名**完全一致**。任务预期写 58/8——那是第一段运行中已知不稳定子测
  `unmanaged` 恰好通过的结果；本段两次运行（含一次测试进程被 Node 原生断言中止后的干净重跑）分别
  为 34（崩溃中止）与 **66/57/9**，后者与基线逐名相同，零新增。
- **一次 Node 原生断言中止（非测试失败）**：首次 chief-workflow 运行在 W20 之后被测试进程的
  `node::CleanupQueue::Add` 原生断言中止（async_hooks 清理期，栈含 `readGitHostProtectionRequirement`
  → `realpath`），仅完成 34 个测试；干净重跑完整跑完 66 个并复现基线失败集。日志保留为
  `after-chief-workflow.txt`（中止）与 `after-chief-workflow-rerun.txt`（完整）。
- h-scope-audit 3 个既有失败：`范围②`/`范围③补＋⑤`/`范围⑥`（7 tests 4 pass），与基线一致。

## 7. 偏差说明（与方案附录 A 不完全一致之处）

1. **`now` 的注入形状**：附录只写「保持注入时钟/deps.now 语义」；实现为 `now(deps)` 显式参数
   （`{ now?: () => number }`），与委托传 `this.deps` 一致。行为等价：唯一判定仍是 `deps.now ? deps.now()
   : Date.now()`。
2. **`targetKey` 的端口形状**：采用只读回调而非值快照，保证与 `this.activeEntry()` / `this.activeRoleId`
   的**求值时机与次数**逐一对应（含短路时不求值）。返回值语义不变。
3. **`taskCreators` 状态位置**：按方案 §3.6 由 `shared/tasks-store.ts` 持有**模块单例** Map（原为实例字段）。
   行为等价论证：task id 全局唯一（`newTaskId` 时间戳+随机；恢复项来自持久队列/账本同名键）；写入值
   （`fromRoleId === handbackOwner ? "convener" : "chief"` 或 `created.from`）与账本 `task.created.from`
   同源，读取方只在持有该 task 的 `starTaskIds` 时才查；条目从不删除。生产环境单 SessionManager 时
   完全等价；测试多实例场景下键不冲突、值同源。
4. **`lastRoleActivity` 状态未搬**：B1 范围只搬 `taskCreators` 状态；`appendRoleActivity` 以显式状态参数
   接收该 Map（字段仍留门面），方案 §3.6 的最终归属留给后续批次。
5. **`inventory` 状态未搬**：`observedInventoryRoots`/`inventoryPublicationErrors` 按 §3.6 属 run-change，
   B1 只搬方法；以 `SessionInventoryState` 显式传入（同一 Set/Map 实例）。
6. **`handleTaskStateResult`/`appendTaskState` 的相互调用**：改为模块内函数互调（原 `this.` 方法互调），
   判定与返回值不变。

## 8. 边界声明

- 只改：`app/desktop/session.ts`、`app/desktop/session/shared/{keys,clock,roles,session-views,notifier,
  tasks-store,inventory}.ts`、`角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b1-shared-methods*`。
- 未动：`session/contracts/**`（第一段定稿，一字未改）、14 个钉子文件、`test/桌面应用/session-source.ts`、
  `test/桌面应用/session-structure.test.ts`、boundary 文件（另一角色已写 Delta）、其他生产代码/角色目录。
- 未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占 9222/9223/9224；未启动 Electron/真实模型。
- `git status` 中的 `session-structure.test.ts` 与 `boundary.{md,yaml}` 修改为第一段/其他上下文遗留，
  非本段产出、未改动。
