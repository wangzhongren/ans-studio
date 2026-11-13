# B7：session.ts lifecycle 迁出 + `openInternalUnsafe` 8 builder 分解——第一段（搬运 + 端口接线 + 首线验证）

- 日期：2026-11-13
- 角色：桌面窗口
- 工作树：`.claude/worktrees/refactor-session-ts-b7`（分支 `refactor/session-ts-b7`）
- 起点：`e37da80`（= origin/main，含 B0–B6；`app/desktop/session.ts` 4,626 行）
- 方案：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §3.2 / §3.3 / §3.4 / §3.6 / §5 B7、附录 A lifecycle 组、§6.2/§6.3（R7）
- 范围：**B7 第一段**——lifecycle 47 方法（含 `openInternalUnsafe` 8 builder 连续块分解）迁出、11 状态字段单 owner、
  `SessionDirectory`/`SessionControl` 端口形状、门面 47 薄委托、`session.ts` 仍为门面类（**barrel/桶切换由第二段做**）。
  行为零变化；不 commit / 不 push / 不动 main / 不触发 CI。
- 逐字证明：`…_evidence/moved-methods.json` / `moved-methods-summary.md`；builder 分解：`…_evidence/builder-map.json` /
  `builder-equivalence.md`；失败名对照：`…_evidence/failure-name-diff.txt`；原始日志：`…_evidence/final/` 与 `…_evidence/baseline/`。

## 1. 结果摘要

| 项 | 值 |
| --- | --- |
| `app/desktop/session.ts` 行数 | **4,626 → 2,662**（`wc -l`；git numstat **+174/−2,138**，另 `session/lifecycle/` 新增 **3,793** 行） |
| 搬出方法 | **47 个**（open 族/发送管线/consume/后台任务/目录/停止/LRU/重建等；含 `openInternalUnsafe`） |
| 逐字移动证明 | **46/46 归一化文本 sha256 相等；46/46 方法体 sha256 相等；46/46 门面薄委托存在**（另 openInternalUnsafe 由 builder 映射证明） |
| builder 分解 | **8/8 连续块逐字包含**（源 1994–3063 全覆盖、无遗漏/重排）；主流程 231–257 行（27 行，含签名；前置校验 1986–1993 逐字保留） |
| 新增模块 | `lifecycle/state.ts` 55、`host.ts` 359、`open.ts` 1,430、`open-context.ts` 151、`send.ts` 378、`consume.ts` 309、`background.ts` 124、`ops.ts` 586、`index.ts` 362、`directory.ts` 39（**单文件 ≤1,500**） |
| 状态归属 | 方案 §3.6 lifecycle **11 字段**由 `Lifecycle` 单 owner 持有/创建（`state.ts`）；门面仅保留**同一实例**访问器（物理名不变） |
| 端口 | `SessionDirectory` / `SessionControl`（`contracts/ports.ts`，本批新增并说明）；`LifecyclePorts`（= `LifecycleHost` 去掉 lifecycle 自身/状态/shared 面）由门面构造注入 56 个箭头（运行期调用、参数逐位转发） |
| 公开导出面 | 运行时 6 值 + 类型 45 **逐字不变**（结构测试 8/8） |
| 模块边界 | lifecycle L6（白名单 contracts/shared/delivery/session-env/tasks/evidence/git-ports）；导入图无环（结构测试） |
| typecheck | `npm run typecheck` **EXIT=0**；`npm run typecheck:renderer` **EXIT=0** |
| 结构预算 | `SESSION_TS_FROZEN_BASELINE_LINES` **未改**（保持 6,954，按指示由第二段收紧）；实测 session.ts 2,662；每模块 ≤1,500（open.ts 1,430） |
| 首线验证 | 全部指定套件通过或既有失败与干净 e37da80 基线**逐名一致（NO_DIFF，零新增）**——见 §6 |

当前行数（`wc -l`）：

```
2662 app/desktop/session.ts
   124 app/desktop/session/lifecycle/background.ts
   309 app/desktop/session/lifecycle/consume.ts
    39 app/desktop/session/lifecycle/directory.ts
   359 app/desktop/session/lifecycle/host.ts
   362 app/desktop/session/lifecycle/index.ts
   151 app/desktop/session/lifecycle/open-context.ts
  1430 app/desktop/session/lifecycle/open.ts
   586 app/desktop/session/lifecycle/ops.ts
   378 app/desktop/session/lifecycle/send.ts
    55 app/desktop/session/lifecycle/state.ts
  6455 total
```

## 2. 47 方法 → 文件清单（源行为 `git show e37da80:app/desktop/session.ts`）

| 方法 | 源行（e37da80） | 目标（文件 · 行） |
| --- | --- | --- |
| `open` | 1580–1592 | lifecycle/open.ts · 195 |
| `openInternal` | 1959–1977 | lifecycle/open.ts · 210 |
| `send` | 3310–3434 | lifecycle/send.ts · 75 |
| `sendDelivery` | 1273–1383 | lifecycle/send.ts · 202 |
| `sendFacts` | 1385–1393 | lifecycle/send.ts · 315 |
| `beginDeliveryOrigin` | 1257–1263 | lifecycle/send.ts · 326 |
| `captureDeliveryOrigin` | 1265–1271 | lifecycle/send.ts · 335 |
| `trimDeliveryOrigins` | 1395–1402 | lifecycle/send.ts · 344 |
| `failDeliveryOrigin` | 1404–1409 | lifecycle/send.ts · 354 |
| `healStaleOrigin` | 1235–1250 | lifecycle/send.ts · 362 |
| `consume` | 3070–3302 | lifecycle/consume.ts · 76 |
| `listBackgroundTasks` | 1138–1161 | lifecycle/background.ts · 44 |
| `readBackgroundTask` | 1167–1197 | lifecycle/background.ts · 70 |
| `stopBackgroundTask` | 1204–1224 | lifecycle/background.ts · 103 |
| `openObservedRoleSession` | 539–570 | lifecycle/ops.ts · 102 |
| `ownsControllerDisposal` | 571–575 | lifecycle/ops.ts · 136 |
| `disposeObservedHandle` | 576–592 | lifecycle/ops.ts · 143 |
| `observeWatchdog` | 1093–1099 | lifecycle/ops.ts · 262 |
| `noteWatchdogActivity` | 1102–1105 | lifecycle/ops.ts · 271 |
| `profileRevision` | 1121–1121 | lifecycle/ops.ts · 277 |
| `profileChanged` | 1122–1126 | lifecycle/ops.ts · 280 |
| `hasBusyRuntime` | 1127–1127 | lifecycle/ops.ts · 287 |
| `hasStaleProfile` | 1128–1128 | lifecycle/ops.ts · 290 |
| `liveSessionViews` | 1129–1131 | lifecycle/ops.ts · 293 |
| `activeEntry` | 1412–1414 | lifecycle/ops.ts · 257 |
| `disposeEntry` | 1421–1486 | lifecycle/ops.ts · 162 |
| `evictBeyondLimit` | 1499–1517 | lifecycle/ops.ts · 230 |
| `isPrimarySession` | 1525–1528 | lifecycle/ops.ts · 251 |
| `openBackground` | 1604–1617 | lifecycle/ops.ts · 298 |
| `sendBackground` | 1634–1648 | lifecycle/ops.ts · 314 |
| `isRoleBusy` | 1657–1659 | lifecycle/ops.ts · 331 |
| `hasLiveSession` | 1662–1664 | lifecycle/ops.ts · 336 |
| `wasLastTurnAborted` | 1667–1669 | lifecycle/ops.ts · 341 |
| `hasPendingDelivery` | 1672–1676 | lifecycle/ops.ts · 346 |
| `waitForRoleSettle` | 1888–1909 | lifecycle/ops.ts · 353 |
| `waitForRoleIdle` | 1923–1957 | lifecycle/ops.ts · 377 |
| `abort` | 3445–3472 | lifecycle/ops.ts · 414 |
| `stop` | 3483–3535 | lifecycle/ops.ts · 444 |
| `isOpen` | 3538–3540 | lifecycle/ops.ts · 499 |
| `openForRoleId` | 3543–3545 | lifecycle/ops.ts · 504 |
| `liveRoleIds` | 3548–3550 | lifecycle/ops.ts · 509 |
| `findLiveRuntime` | 3826–3831 | lifecycle/ops.ts · 514 |
| `ensureFreshRoleSession` | 3854–3864 | lifecycle/ops.ts · 522 |
| `rebuildSession` | 4452–4463 | lifecycle/ops.ts · 535 |
| `rebuildSessionUnsafe` | 4466–4494 | lifecycle/ops.ts · 549 |
| `isCustomerInitiatedTurn` | 4515–4520 | lifecycle/ops.ts · 580 |
| `openInternalUnsafe` | 1984–3064 | `lifecycle/open.ts` · 231（主流程 231–257；8 builder 259–1379） |

说明：`openInternalUnsafe` 的方法体经 8 builder 连续块分解（见 §3），不计入逐字哈希表；`open`/`openInternal`
逐字搬入 `lifecycle/open.ts`。精确归属相对方案附录 A 的微调均记录于 §7。

## 3. `openInternalUnsafe` builder 分解（§3.4 / R7）

源方法：1984–3064（1,081 行）。分解方式：**连续代码块**；主流程保留原 1986–1993 前置校验（参数/运行时校验、
`key`/`stopped`/`stoppedResult`/`stopped()` 早退）并顺序调用 8 个 builder：

| builder | source lines | target block start | contains verbatim block | adaptations |
| --- | --- | --- | --- | --- |
| resolveWorkflowMode | 1994–2060（67 行） | open.ts:262 | YES | — |
| reuseOrRebindEntry | 2061–2134（74 行） | open.ts:337 | YES | — |
| loadAuthorization | 2136–2193（58 行） | open.ts:418 | YES | — |
| assembleGovernanceCapabilities | 2195–2301（107 行） | open.ts:487 | YES | — |
| assembleProjectCapabilities | 2303–2542（240 行） | open.ts:620 | YES | caller.handle === handle -> caller.handle === ctx.handle |
| assembleToolSurface | 2543–2956（414 行） | open.ts:891 | YES | const manager = this; -> const manager = this.host; |
| freezeBindings | 2958–2980（23 行） | open.ts:1316 | YES | — |
| postOpenWiring | 2982–3063（82 行） | open.ts:1347 | YES | — |

机制（逐行等价论证见 `…_evidence/builder-equivalence.md`）：
- 每个 builder 入口：`const { … } = ctx;` —— 把 `OpenContext`（`open-context.ts`，**单一**上下文对象）解构为
  同名局部 const（原方法作用域的等价视图；保持原 `const` 收窄语义；仅引用/值别名，不复制可变状态）；
- 随后**逐字**执行原连续块；块尾把本块产出的变量写回 `ctx`（`ctx.X = X;`）；
- 原 `return` 保持在所属连续块内；主流程以 `!== undefined` 判定早退（早退值逐字原样返回）；
- 唯一文本适配 2 处（见上表 `adaptations` 列；`assembleToolSurface` 的 `const manager = this;` →
  `const manager = this.host;`；`assembleProjectCapabilities` 的 `caller.handle === handle` →
  `caller.handle === ctx.handle`，保留原闭包对外层 `handle` 的**运行期**读取——B6 块成功开会话后才赋值）。

主流程行数：**27 行**（231–257，含签名与前置校验）。较方案 §3.4 的「~120–150 行」估计更短：所有连续块均已整体
下沉到 builder，剩余仅为编排调用（记录为偏差 D4）。

## 4. 状态、端口与装配

1. **lifecycle 11 字段单 owner**（`state.ts::createLifecycleState`）：`messageSeq`、`lruClock`、`activeRoleId`、
   `selectionVersion`、`selectionTargetRoleId`、`openChains`、`observedHandles`、`observedHandleIds`、
   `lastGovernanceRuntime`、`inventoryRegistration`、`managerId`。门面同实例访问器（物理名保留，方案 §4.3 兼容面）。
   `inventoryRegistration` 的登记回调仍注册**门面实例**（注册表消费 `executionInventoryFacts`/`runChangeOperations`/
   `observedHandles` 等门面公开面）；`state.ts` 逐字保留「先登记、后生成 managerId」顺序。
2. **sessions/deps 留门面**（§3.6/Q4）：门面字段 `sessions` 为同一 `Map` 实例，经 `LifecycleRefs.sessions` 只读注入。
3. **只读引用面**：`profileRevisions`/`rebuildChains`/`boundaryRefreshVersion`（session-env 归属）与
   `lastTurns`/`lastAssistantText`（diagnostics）、`reportStates`/`attemptStates`（persistence）、delivery 19 字段、
   run-change 的 `deferredRunChanges`/`runChangeOperations`/`inventoryPublicationErrors` 经 `LifecycleRefs` 的
   **延迟取值回调**注入（同一实例，运行期求值——构造顺序不引入第二份状态）。
4. **端口**：`contracts/ports.ts` 新增 `SessionDirectory`（只读目录：key/find/activeRoleId/governanceOwner/
   governanceRuntime/isBusy/views/lastTurn）与 `SessionControl`（openInternal/ensureFresh/disposeEntry/abortTurn），
   由 `Lifecycle` 实现并暴露 `directory()`；`DeliverySink` 复用 `delivery/queue.ts` 既有形状（不重复第二份）。
   跨模块上行调用（55 个）经 `LifecyclePorts`（门面构造注入箭头；运行期调用、参数逐位转发）。
5. **子模块宿主面**：`host.ts::LifecycleHost` 汇总子模块可见的方法/状态（91 方法 + 状态访问器 + `manager` 门面引用 +
   `maxLiveSessions`）；`Lifecycle`（`index.ts`）逐名实现并分发到 5 个子模块；子模块以同名薄包装调用
   （方法体文本保持 `this.<name>(...)` 原样；包装为运行期直转发，不加异步层）。
6. **构造顺序**：门面 `deps/sessions` 就绪后**先构造 `Lifecycle`**（其后再构造 Evidence/Persistence/…/Delivery/…），
   保证后续模块以 `this.openChains` 等访问器取得同一实例；全部构造器零副作用，端口只在运行期调用。
7. **shared 面**：`sessionKey`/`queueKey`/`now`/`contextInfo`/`emitDeliveryNote`/`findListingForFeedback`/
   `refreshListingNow`/`readTasks`/`isFixedTask` 由 `Lifecycle` 直接调用 L0 实现（与门面同名委托同一函数）。

## 5. R7 逐条核对

| # | 条件 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | **工具面快照不变**：7 角色注入工具名+顺序逐项相同 | **YES** | `session-structure.test.ts` 工具面快照 2 用例 + 导出面/边界/预算共 **8/8** 全绿；结构测试直接以真实 `SessionManager`→`openRoleSession`→`buildGovernedTools` 捕获 7 角色（chief 22/product 14/rapporteur 15/nominator 19/convener 17/verifier 14/implementer 12）与冻结清单 `deepEqual` |
| 2 | **能力缺席=不注册 fail-closed 语义逐字保留** | **YES** | 全部 spread 条件与文本在 builder 连续块内逐字包含（builder-map 8/8 YES）；`boundary-refresh` 14/14、`ans-wiring`、`operator-channel`（除基线既有 1 项）、`download-decision`、`acceptance-evidence` 全绿 |
| 3 | 导出面 51 不变；导入图无环；每模块 ≤1,500 行 | **YES** | `session-structure` 导出面运行时/类型层 2 用例 + 边界/无环 + 单模块预算全绿；open.ts 1,430（`open-context.ts` 拆分，见偏差 D1） |
| 4 | builder 顺序/条件/注册 spread 顺序逐字；不可机械处逐行等价论证 | **YES** | `builder-map.json` 8/8 `containsVerbatimSourceBlock=true`；两处适配列明；`builder-equivalence.md` 记录主流程/块映射 |

补充：`message-queue.test.ts` 顺序钉（读 `readSessionModule("lifecycle/send")`）——`entry.busy = true;` 仍先于
`await this.sendDelivery(entry, origin, text, opts);`（20/20）；`chief-workflow` 顺序钉（`readSessionModule("run-change")`）不变。

## 6. 首线验证结果

| 门槛 | 命令/文件 | 结果 |
| --- | --- | --- |
| 类型 | `npm run typecheck` / `npm run typecheck:renderer` | **EXIT=0 / EXIT=0**（`final/typecheck.log`、`final/typecheck-renderer.log`） |
| 结构保护 | `session-structure.test.ts` | **8/8**（导出面 51；无环/分层/白名单；体量；7 角色工具面快照） |
| 聚合读取器 | `session-source.test.ts` | **5/5** |
| 定向回归 | `boundary-refresh` 14/14；`operator-channel` **58/59（1 基线既有，NO_DIFF）**；`download-decision`+`acceptance-evidence` 11/11；`fixed-path-full-chain` 3/3；`queue-recovery-e2e` 2/2；`network-state-e2e` 6/6；`turn-watch-verify` 12/13（1 基线既有，NO_DIFF）；`message-queue` **20/20**；`handback-delivery` **16/18（2 基线既有，NO_DIFF）**；`run-change-entry` 5/5；`directive-decision` 8/8；`b101` 11/11；`b111` 5/5 | 见 `failure-name-diff.txt`；全部通过或 **NO_DIFF** |
| 14 钉子抽查 | boundary-refresh/chief-workflow/message-queue/run-change-entry/queue-status/request-status/evidence-markers/directive-input/dispatch-fresh-enum/hot-path/interface/g1-copy-and-nails/h-scope-audit/governance-matrix | 顺序钉均不失败；其余全绿或与干净基线逐名一致；**未改任何钉子/session-source** |
| 相邻生命周期套件 | `abort-unwedge` 3/3、`turn-lease` 4/4、`watchdog-reuse` 4/4、`queue-withdraw-lru` 5/5、`queue-visibility` 2/2、`session.test` 6/7（AC-8 基线既有） | 全绿 / NO_DIFF |
| 基线 | 干净 e37da80 工作树 `.tmp-b7/baseline-wt`（`git worktree add --detach`，只读对照，完成后移除） | 失败名逐名一致 |
| 结构预算 | `SESSION_TS_FROZEN_BASELINE_LINES` 保持 **6,954**（按指示不改；第二段桶切换后收紧）；session.ts 实测 2,662 | ✅ |

## 7. 偏差与适配（逐条）

- **D1 文件分配/体量**：方案 §3.2 的 `lifecycle/{index,open,send,consume,background,directory}.ts` 保留，另新增
  `state.ts`（11 状态单 owner + 创建）、`host.ts`（子模块宿主接口）、`open-context.ts`（`OpenContext` 类型）与
  `ops.ts`（open 族中除 open/openInternal/openInternalUnsafe 外的 32 方法）。原因：openInternalUnsafe + open 族全放
  `open.ts` 会超过 1,500 行；按连续块/职责拆分后 open.ts 1,430、ops.ts 586。`background.ts` 按 §3.2 独立保留
  （任务允许的微调）。
- **D2 operator-channel source 钉**：`test/桌面应用/operator-channel.test.ts` 直接读 `app/desktop/session.ts` 文本断言
  `if (this.deps.shellOperatorChannel) {` / `role.builtIn === true ? undefined : this.deps.shellArming` /
  `const shellOperatorOnly = …` / `...(shellOperatorOnly ? { shellOperatorOnly } : {})`。该文件**不在 B0 的 14 钉聚合
  清单**内，且本批边界不允许修改测试。处理：在 `session.ts` 的 lifecycle 导入处保留**只读迁移指针注释**（逐字包含上述
  表达式，注明实际实现在 `lifecycle/open.ts`，不参与运行、不构成第二份实现）。该套件现 58/59，唯一失败与干净
  e37da80 基线逐名一致（本工作树 `.git` 形态导致的既有问题）。**建议**：第二段/验收按 Q1 口径把该文件并入
  `readSessionSource()`（或将 14 钉清单扩为 15），然后删除该注释。
- **D3 builder 上下文形状**：`OpenContext` 为**单一**显式对象（`open-context.ts`，纯类型）；builder 入口解构为同名局部
  const、块尾回写。与「`this.` → ctx」的字面重写不同——这是保持原 `const` 收窄语义与闭包运行期读取（`handle`）的
  最小适配；块体文本零改动（builder-map 8/8 逐字包含）。未引入第二份状态（解构出的均为同一引用/值）。
- **D4 主流程行数**：实际 27 行（含签名），低于方案 §3.4 的 120–150 行估计——8 个连续块全部下沉后，主流程仅剩
  前置校验 + 顺序调用；未为凑行数保留块内联。
- **D5 端口形状**：新增 `SessionDirectory`/`SessionControl` 到 `contracts/ports.ts`（方案 §3.3 草案的现行签名版；
  `SessionControl.ensureFresh`/`abortTurn` 分别映射 `ensureFreshRoleSession`/`abort`）。`EventRouter` 未新增
  （当前无消费者；consume 在 lifecycle 内部，门面 `deps.emitEvent` 直连），`DeliverySink` 复用 B4 既有形状。
- **D6 子模块宿主包装**：每个子模块为所用跨方法/跨模块名生成同名薄包装（指向 `LifecycleHost`），方法体保持
  `this.<name>(...)` 原样（B1–B6 同款口径）；`Lifecycle` 逐名实现宿主面并分发。
- **D7 `MAX_LIVE_SESSIONS`**：`evictBeyondLimit` 内引用改为 `this.host.maxLiveSessions`（门面构造传值；常量单一来源仍在
  `session.ts` 的导出）。逐字哈希在此方法上按记录化适配通过（`moved-methods.json`）。
- **D8 `stop` 跨实例比较**：`manager !== this` → `manager !== this.host.manager`（`host.manager` 即门面实例；跨实例
  协调语义逐字保留）。
- **D9 `handle` 晚绑**：B6 块的 `let handle` 保持**局部**（其内部 chiefDecision 闭包另有同名局部，不可提升）；成功
  路径末尾写回 `ctx.handle`；B5 的 `terminateRoleRun` 闭包按原语义在运行期读取 `ctx.handle`。
- **D10 `inventoryRegistration` 注册回调**：由 `createLifecycleState(registerManager)` 在构造期调用，注册对象仍为门面。
- **D11 未改测试**：未修改任何测试文件/钉子/session-source；`SESSION_TS_FROZEN_BASELINE_LINES` 未改。

## 8. 第二段待办（不在本段）

1. `SessionManager` 迁入 `session/index.ts`、`session.ts` 改 barrel（51 导出逐字）；`SESSION_TS_FROZEN_BASELINE_LINES`
   收紧至最终口径（session.ts ≤50 行、index ≤800 行）。
2. D2 的 operator-channel 读取路径随 Q1 口径收口（并入聚合读取器后移除迁移指针注释）。
3. 全量 627 测试文件 / 三套冻结 known-red / 三平台 release 冒烟（方案 §5 B7 波次边界）。

> 第三段（全量套件 / 三套 known-red / 桌面全链 / 打包冒烟 / 终检）已完成：
> `角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b7-final.md`
> （合并 5,824/5,601/188/32/3；三套 known-red 逐名一致；全链零新增；本地 Windows 打包 EXIT=0；唯一 ADDED 为 i18n 守卫 allowlist 缺口，待裁决）。
