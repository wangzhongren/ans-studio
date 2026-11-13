# B6 适配清单与行为等价论证

- 日期：2026-11-13
- 角色：桌面窗口
- 工作树：`.claude/worktrees/refactor-session-ts-b6`（分支 `refactor/session-ts-b6`，起点 `b5901ac`）
- 方案：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §3.2 / §3.3 / §3.6 / §5 B6 / 附录 A
- 本文件覆盖两类证明：
  1. **25 个搬运方法 + 1 个随行 helper**：归一化 sha256 逐方法相等（`moved-methods.json`）；
  2. **不可机械处（端口/状态注入、片段提取、门面中转）逐行等价论证**（本文件 §2–§7）。

## 1. 25+1 方法搬运清单（sha 证明见 moved-methods-summary.md）

| 模块 | 方法 | 数量 |
| --- | --- | ---: |
| `session/handback.ts` | displayHandback、handbackFlowId、handleHandback、commitHandback（+ 随行私有形状防御 `isTaskHandbackShape`，无门面委托） | 4+1 |
| `session/dispatch.ts` | routeDispatch、chainDispatchFacts、captureChiefDispatchSource、resumeChiefController、routeStarDispatch | 5 |
| `session/fixed-workflow/route.ts` | routeFixedPathDispatch、ensurePathBStartForDispatch、checkPathBWriteSetForDispatch | 3 |
| `session/fixed-workflow/cards.ts` | inspectFixedHandbackChild、completeTeamPlanFixedForHandle、closeCreatedTaskFixedForSession、verifyFixedReviewCloseBasis、prepareFixedAppointmentCardRequest、recordFixedCardWorkflowResolution | 6 |
| `session/fixed-workflow/release-merge.ts` | presentMergeMainCard、runFixedReleaseMerge、settleMergeMainCard、autoPresentFixedReleaseMerge、noteFixedReleaseAutoTrigger | 5 |
| `session/fixed-workflow/panel.ts` | fixedPanelState、dispatchAdvisorySummary | 2 |

归一化只含两类记录化适配：
1. 声明行 `private ` 前缀移除（模块内 public 仅为门面委托可调用；门面同名委托的可见性/签名逐字不变）；
2. `routeStarDispatch` 局部类型 `ReturnType<SessionManager["captureChiefDispatchSource"]>` →
   `ReturnType<Dispatch["captureChiefDispatchSource"]>`（L4 不可导入门面类 `SessionManager`——循环依赖；
   同一结构化 self 视图，运行时零差异）；`routeDispatch` 内部星形路由调用改经
   `this.port.routeStarDispatch(...)`（见 §6，门面中转，生产路径等价）。

结果：**26/26 方法体 sha256 相等；26/26 归一化文本 sha256 相等；25/25 门面薄委托存在**；唯一无委托者
`isTaskHandbackShape` 为 handback 内部 helper（仅被 handleHandback/commitHandback 调用）。

## 2. Git 端口片段（`session/git-ports.ts`）逐行等价

### 2.1 `createTurnGitRuntime`（源：HEAD `session.ts` 2070–2087 的 `currentGitRuntime` 闭包）

| 源 | 目标 | 等价说明 |
| --- | --- | --- |
| `const entry = this.sessions.get(key)` | `const entry = ctx.sessions.get(ctx.key)` | 同一 `sessions` Map（门面构造传入 `this.sessions`）；`key` = `this.sessionKey(req.projectRoot, req.roleId, req.runtime)`，上下文原样传入 |
| `this.sessions.get(key) === entry && entry.handle === gitBinding.handle` | `ctx.sessions.get(ctx.key) === entry && entry.handle === ctx.gitBinding.handle` | `gitBinding` 是 openInternalUnsafe 内的对象字面量，传入同一对象引用（身份比较语义不变） |
| `!this.deliveryIsStopped(key)` | `!ctx.deliveryIsStopped(ctx.key)` | 回调 → 门面 `deliveryIsStopped`（投递停止判定同一实现） |
| `req.projectRoot` / `req.roleId` | `ctx.projectRoot` / `ctx.roleId` | 同值（构造点逐位传入） |
| `this.runTaskIsFenced(req.projectRoot, assignment.taskId, assignment.runId)` | `ctx.runTaskIsFenced(...)` | 回调 → 门面 `runTaskIsFenced` → RunChange（同一实现） |
| `resolveDeliveryAssignment({...})` / `createGitRoleRuntime({...})` | 原样 | 同函数、同入参、同 await 顺序、同失败码/文案 |

判定顺序、短路顺序、`await` 点、失败分支返回形状与源逐行一致；闭包外每次调用都重新读取 `entry/origin`
（`ctx.sessions.get` 在调用时求值，与原 `this.sessions.get(key)` 时机一致）。

### 2.2 `gitContextFailure`（源 2088–2089）

对象字面量逐字段搬移：`{ operationId, repoId: "unavailable", status: "blocked" as const, code, message }`。
调用点（openInternalUnsafe 的 gitQuery/gitCandidate/gitPublish 三处）文本未变，仅由局部 const 变为导入函数。

### 2.3 `buildFixedTaskGitSurface`（源 2708–2710 `taskGit` 注入片段）

源：`{ taskGit: { classifyShellDetailed, port: createDesktopTaskGitShellPort(req.projectRoot) } }`。
目标：`{ taskGit: buildFixedTaskGitSurface(req.projectRoot) }`，函数体返回
`{ classifyShellDetailed, port: createDesktopTaskGitShellPort(projectRoot) }`——**键名/键序/取值（同一分类器
引用、同一端口工厂、同一 projectRoot）逐字相同**；求值顺序（分类器引用 → `projectRoot` 解析 → 端口工厂）不变。

### 2.4 session-dispose lease/信号（源 `disposeObservedHandle` 569–577）

| 源 | 目标 | 等价说明 |
| --- | --- | --- |
| `beginGitHostAction({ projectRoot: root, kind: "session-dispose" })` | `beginSessionDisposeLease(root)` | 同一 trunk-runtime 调用、同参数（包装器逐字转调） |
| `recordGitHostInterruption({ projectRoot: root, reason: "session-dispose-during-host-action", coreSessionId: handle.sessionId })` | `noteSessionDisposeInterruption(root, handle.sessionId)` | 同载荷；`coreSessionId` 形参放宽为 `string | undefined` 以匹配 `RoleSessionHandle.sessionId` 的可选性（trunk 侧 `coreSessionId?: string`，语义不变） |
| `endGitHostAction({ projectRoot: root, leaseId: lease.leaseId })` | `endSessionDisposeLease(root, lease.leaseId)` | 同调用同参数 |

条件外壳 `root && !heldLease ? ... : undefined`、`if (root && lease && !lease.ok)`、`if (root && lease?.ok)`
逐字保留；错误文案与抛出点不变。

## 3. 模块类外壳的 receiver 适配（同名成员重建）

方法体文本按原样搬移，`this.X` 不改写；每个 X 在模块类中以同名成员重建，来源为下列之一：

| 类别 | 成员 | 来源 |
| --- | --- | --- |
| 本模块方法 | handback/dispatch/fixed 内部互调（commitHandback、routeStarDispatch、settleMergeMainCard 等） | 同一类内（文本不变） |
| L0 共享函数（同名同义） | now、sessionKey、targetKey、queueKey、emitDeliveryNote、handbackOwnerRoleId、chiefTaskRoleIdOf、dispatcherRoleIdOf、findListingForFeedback、roleDisplayName、refreshListingNow、readTasks、appendTaskStateResult、recordTaskFailure、appendRoleActivity | `shared/*` 同名函数（与门面委托同一实现、同一 deps/state 入参；appendRoleActivity 传同一 `lastRoleActivity` Map 与 `() => this.now()`） |
| 单 owner 状态 | enqueuedHandbackKeys、pendingHandbackKeys | `Handback.state`（本模块创建） |
| 跨模块状态（同一实例） | starTaskIds、reportedTaskKeys、governanceHandbackMirrored、lastGovernanceRuntime、taskHandbackCommits、taskDeliveryCommits、planEscalations、planEscalationPrompted、sessions、activeDispatchKeys、deliveredAppTaskIds、deliveredDeliveryKeys、deliveryQueues、activeDeliveries、lastRoleActivity | `HandbackRefs` / `DispatchRefs` / `FixedWorkflowRefs`（门面构造时传入**同一 Map/Set/对象引用**；访问器延迟取值，两阶段装配） |
| 已迁出模块实例 | runTaskIsFenced（fixed route）、buildFixedCloseEvidence / fixedReleaseAutoEvidence（fixed cards/release）、presentAppCard（release） | `refs.runChange` / `refs.evidence` / `refs.cardGateway`（结构测试白名单内的下层模块实例，运行时同一对象） |
| 门面端口（未迁出方法） | openInternal、findLiveRuntime、activeRuntimeFor、enqueueDelivery、drainQueue、drainAllQueuesFor、appDispatchClientMessageId、appTaskClientMessageIdFromSeed、deliveryIsStopped、runTaskIsFenced（dispatch） | 门面构造时以箭头回调注入（`DispatchPorts` / `HandbackPorts` / `FixedWorkflowPorts`），运行期调用、参数逐位转发 |
| 端口（跨层） | routeFixedPathDispatch、dispatchAdvisorySummary（dispatch→fixed） | `FixedDispatchPort`（contracts/ports.ts），门面箭头 → 门面同名薄委托 → fixed 模块 |
| 跨模块写入（既有 B4 口径） | delivery/store 恢复路径写 `enqueuedHandbackKeys` | 门面 getter 返回 handback 的同一 Set；唯一创建点仍为 `Handback`（无第二份状态） |

所有同名成员与原方法在**同一调用点**以同一实参调用；无缓存、无重排、无提前求值。

## 4. 状态归属（§3.6）

- handback **2 字段**（`enqueuedHandbackKeys`/`pendingHandbackKeys`）由 `Handback` 构造器唯一创建；门面仅
  同一实例 getter。delivery/store 的恢复写经门面 getter 落到同一 Set（B4 既有行为，非新增写路径）。
- 其他被引用状态（见 §3 表）B6 **不搬所有权**：经 refs 传同一实例，只读或按原样写入（如
  `governanceHandbackMirrored.set`、`reportedTaskKeys.add`、`starTaskIds.add`、`activeDispatchKeys.add`），
  与原方法写的是同一个对象；无复制、无双写。
- dispatch/fixed 构造于全部下游模块之后（evidence/persistence/handback/sessionEnv/runChange/delivery/tasks/
  diagnostics/acceptanceFacts/cards/versionDecisions/cardGateway/controllerStopPort），refs 取同一实例。

## 5. 构造顺序与两阶段装配

新增构造顺序（插在既有顺序中，不重排既有模块）：

1. evidence → **handbackSink** → persistence → **handback**（新）→ sessionEnv → runChange → delivery → tasks →
   diagnostics → acceptanceFacts → cards → versionDecisions → cardGateway → controllerStopPort →
   **fixedDispatchPort → fixedWorkflowRoute/Release/Cards/Panel → dispatch**（新）。
2. 论证：全部模块构造器**零副作用**（只保存引用/箭头；不调用端口、不读盘、不发事件）；端口方法只在运行期
   调用。`Handback` 必须先于 `Delivery`（Delivery 构造取 `enqueuedHandbackKeys` 同一 Set）。fixed/dispatch
   后置使 refs 可直接取已构造实例（含 evidence/cardGateway/runChange/delivery 状态访问器）。
3. `Persistence` 的 HandbackSink 由 `this.handbackSink` 对象注入（与 B2 内联对象同形；箭头延迟解析门面委托）。

## 6. 测试兼容中转（`routeStarDispatch`）

- 事实：`test/桌面应用/b71-fixed-fail-closed.test.ts:383/411` 在**门面实例**上覆盖
  `m.routeStarDispatch`，以桩隔离 legacy 下游；`routeDispatch` 原为同类方法，`this.routeStarDispatch(...)`
  解析到实例覆盖。搬出后 dispatch 模块的 `this.routeStarDispatch` 指向模块自身实现，覆盖不再生效。
- 处理：`routeDispatch` 内部星形路由调用改为 `this.port.routeStarDispatch(...)`；端口箭头 →
  门面同名薄委托（`this.routeStarDispatch(...)`，动态解析实例属性）→ 模块实现。生产路径 = 一次直接转发，
  参数/返回逐位相同；测试桩仍拦截（b71 复跑 7/7）。
- 记录：`moved-methods.json` 中 `routeDispatch.adaptations` 含该项；归一化替换
  `return this.routeStarDispatch(` → `return this.port.routeStarDispatch(`。

## 7. 其他披露

1. **文件拆分**：按任务/方案 §3.2 四文件（route/cards/release-merge/panel），`inspectFixedHandbackChild`
   按任务清单归 cards.ts；无跨文件方法。
2. **死导入/死薄委托保留**（B3–B5 同口径）：`session.ts` 仍导入 `createDesktopBaselineGitPort`/
   `createDesktopReleaseGitPort`/`createDesktopTaskGitShellPort`/`beginGitHostAction`/`endGitHostAction`/
   `createGitRoleRuntime` 等（现由模块/git-ports 使用）；`fixedReleaseAutoEvidence`/`buildFixedCloseEvidence`/
   `collectFixedProposalDocumentRefs` 的门面 B2 薄委托保留（现由 fixed 模块直接调用 evidence 实例）。
3. **dispatch 的 lease 调用**：`resumeChiefController`/`routeStarDispatch` 内 `beginGitHostAction`/
   `endGitHostAction`（kind:"dispatch"）逐字保留在 dispatch 模块（dispatch 白名单 []，不可导入 git-ports；
   同一 trunk-runtime 单一实现，无第二份逻辑）。
4. **计时器**：B6 搬运方法体零 `setTimeout/setInterval/setImmediate/.unref`。
5. **EOL**：`session.ts` 保持工作树 CRLF 字节风格（改写脚本按原 EOL 还原，无全文件换行 diff）；新模块
   LF（与 B5 cards 模块一致）。
