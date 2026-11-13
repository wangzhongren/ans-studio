# B6：session.ts 回交/派发/固定工作流/Git 端口迁出——第一段（搬运 + 端口接线 + 首线验证）

- 日期：2026-11-13
- 角色：桌面窗口
- 工作树：`.claude/worktrees/refactor-session-ts-b6`（分支 `refactor/session-ts-b6`）
- 起点：`b5901ac`（= origin/main，含 B0–B5；`app/desktop/session.ts` 6,954 行）
- 方案：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §3.2 / §3.3 / §3.6 / §5 B6 / 附录 A
  handback/dispatch/fixed-workflow 组
- 范围：**B6 第一段**——25 方法（4+5+16）+ 随行 helper 搬运、handback 2 状态字段单 owner、git-ports 片段
  提取、`FixedDispatchPort`/`HandbackSink` 端口接门面、门面薄委托、结构预算收紧、首线验证。**第二段**
  （本地全量桌面套件 / 三套冻结 known-red 逐名 diff / 桌面全量定向余量）由后续同角色上下文完成（见 §8）。
- 逐字证明：`…_evidence/moved-methods.json` / `moved-methods-summary.md`；适配与逐行等价论证：
  `…_evidence/adapters-and-equivalence.md`；语义核对表：`…_evidence/semantics-check.md`。

## 1. 结果摘要

| 项 | 值 |
| --- | --- |
| `app/desktop/session.ts` 行数 | **6,954 → 4,626**（`wc -l`；git numstat +181/−2,509） |
| 搬出方法 | **25 个**（handback 4 / dispatch 5 / fixed-workflow 16）+ 随行私有 helper `isTaskHandbackShape` |
| 逐字移动证明 | **26/26 归一化文本 sha256 相等；26/26 方法体 sha256 相等；25/25 门面薄委托存在** |
| 新增模块 | `session/handback.ts` 394 行、`session/dispatch.ts` 1,298 行、`session/fixed-workflow/route.ts` 729 行、`cards.ts` 464 行、`release-merge.ts` 360 行、`panel.ts` 90 行、`session/git-ports.ts` 95 行、`session/contracts/ports.ts` 35 行（单模块 ≤1,500） |
| 状态归属 | 方案 §3.6 handback **2 字段**由 `Handback.state` 单 owner 创建；其余被引用状态经 refs 传同一实例（无第二份状态） |
| 端口 | `FixedDispatchPort` / `HandbackSink`（contracts/ports.ts）门面构造注入；dispatch 经 `DispatchPorts`、handback 经 `HandbackPorts`、fixed 经 `FixedWorkflowPorts` + refs（runChange/evidence/cardGateway 实例） |
| 公开导出面 | 运行时 6 值 + 类型 45 **逐字不变**（结构测试 8/8） |
| 模块边界 | handback L3（白名单 []）、dispatch L4（[]）、fixed-workflow L5（card-gateway/evidence/run-change/git-ports）、git-ports L1（[]）；导入图无环 |
| typecheck | **EXIT=0** |
| 结构预算 | `SESSION_TS_FROZEN_BASELINE_LINES` 9,118 → **6,954**（仅常量/注释/标题数字；实测 4,626） |
| 首线验证 | 见 §5：全部指定套件通过或既有失败与干净 b5901ac 基线**逐名一致（NO_DIFF）** |

## 2. 25 方法 → 文件清单（HEAD 源行 · 目标行）

| 模块 | 方法（源行 · 目标行） |
| --- | --- |
| `session/handback.ts`（4+helper） | `displayHandback`（4049 · 133）、`handbackFlowId`（4074 · 138）、`isTaskHandbackShape`（4087 · 151，随行 helper，无门面委托）、`handleHandback`（4106 · 170）、`commitHandback`（4121 · 185） |
| `session/dispatch.ts`（5） | `routeDispatch`（4331 · 178）、`chainDispatchFacts`（4580 · 427）、`captureChiefDispatchSource`（4737 · 584）、`resumeChiefController`（4763 · 610）、`routeStarDispatch`（4803 · 650） |
| `session/fixed-workflow/route.ts`（3） | `routeFixedPathDispatch`（5452 · 149）、`ensurePathBStartForDispatch`（6309 · 660）、`checkPathBWriteSetForDispatch`（6332 · 683） |
| `session/fixed-workflow/cards.ts`（6） | `inspectFixedHandbackChild`（3485 · 98）、`completeTeamPlanFixedForHandle`（5970 · 156）、`closeCreatedTaskFixedForSession`（6026 · 212）、`verifyFixedReviewCloseBasis`（6085 · 271）、`prepareFixedAppointmentCardRequest`（6143 · 300）、`recordFixedCardWorkflowResolution`（6184 · 341） |
| `session/fixed-workflow/release-merge.ts`（5） | `presentMergeMainCard`（6380 · 78）、`runFixedReleaseMerge`（6406 · 104）、`settleMergeMainCard`（6451 · 149）、`autoPresentFixedReleaseMerge`（6543 · 241）、`noteFixedReleaseAutoTrigger`（6663 · 350） |
| `session/fixed-workflow/panel.ts`（2） | `fixedPanelState`（6674 · 18）、`dispatchAdvisorySummary`（6741 · 84） |

说明：完整逐方法源/目标行与 sha 见 `moved-methods-summary.md`；源行为 `git show b5901ac:app/desktop/session.ts`。

## 3. Git 端口（`session/git-ports.ts`）

片段提取（非方法搬运，逐行等价论证见 `adapters-and-equivalence.md` §2）：

- `createTurnGitRuntime(ctx)`：原 `openInternalUnsafe` 内联 `currentGitRuntime` 闭包（turn 校验 →
  assigned-task 复核 → run-stop 栅栏 → `createGitRoleRuntime`；失败码/文案逐字）；
- `gitContextFailure`：原内联 Git 工具不可用回执（`repoId:"unavailable"`/`status:"blocked"`）；
- `buildFixedTaskGitSurface(projectRoot)`：原 fixed 会话 `taskGit` 注入面（分类器 + 真实端口，键序/取值逐字）；
- `beginSessionDisposeLease` / `noteSessionDisposeInterruption` / `endSessionDisposeLease`：原
  `disposeObservedHandle` 的 session-dispose lease/中断信号装配（同参数/同顺序/同错误路由）。
- 另经本模块转出 `createDesktopBaselineGitPort`/`createDesktopReleaseGitPort`（fixed-workflow 白名单导入
  git-ports，不直接导入 workflow-git）。

## 4. 端口与状态接线

1. **`HandbackSink`**：门面构造 `this.handbackSink = { handleHandback, handbackFlowId }`（箭头 → 门面同名薄
   委托 → handback 模块）；`Persistence` 构造以该实例注入（B2 `PersistenceHandbackPort` 同形），运行期调用。
2. **`FixedDispatchPort`**：`{ routeFixedPathDispatch, dispatchAdvisorySummary }`；`Dispatch` 构造注入。
   dispatch 内部调用经端口 → 门面同名薄委托 → fixed 模块（L4→L5 不导入，参数逐位转发）。
3. **`DispatchPorts.routeStarDispatch`**：星形路由内部调用经门面中转（保持门面实例级测试桩语义；见
   `adapters-and-equivalence.md` §6）。
4. **fixed refs**：`sessions/activeDispatchKeys/starTaskIds/lastGovernanceRuntime/lastRoleActivity`（同一实例）+
   `runChange/evidence/cardGateway`（已迁出模块实例，运行时同对象）。
5. **handback refs**：`starTaskIds/reportedTaskKeys/governanceHandbackMirrored/lastGovernanceRuntime/
   taskHandbackCommits/taskDeliveryCommits/planEscalations/planEscalationPrompted`（同一实例，延迟取值）；
   `enqueuedHandbackKeys/pendingHandbackKeys` 由模块创建（delivery/store 恢复路径经门面 getter 写同一 Set）。
6. **构造顺序**：evidence → handbackSink → persistence → **handback** → sessionEnv → runChange → delivery →
   tasks → diagnostics → acceptanceFacts → cards → versionDecisions → cardGateway → controllerStopPort →
   **fixedDispatchPort → fixedWorkflowRoute/Release/Cards/Panel → dispatch**。全部构造器零副作用；端口运行期调用。

## 5. 首线验证结果（第一段）

| 门槛 | 命令/文件 | 结果 |
| --- | --- | --- |
| 类型 | `npm run typecheck` | **EXIT=0**（`final/typecheck.log`） |
| 结构保护 | `session-structure.test.ts` | **8/8**（导出面 51；导入图无环/分层/白名单；体量 4,626 ≤ 6,954；工具面快照 7 角色） |
| 聚合读取器 | `session-source.test.ts` | **5/5** |
| 回交投递 | `handback-delivery.test.ts` | **16/18**（2 项既有失败与干净 b5901ac 基线逐名一致） |
| 回交集成 | `test/测试/chat-handback-integration.test.ts` | **3/3** |
| 星形路由 | `star-routing.test.ts` | 3/10；**7 项既有失败与基线逐名一致（NO_DIFF）** |
| 固定路由 | `fixed-path-routing.test.ts` | **13/13** |
| 全链 | `test/测试/fixed-path-full-chain.test.ts` | **3/3** |
| 首轮寻址 | `dispatch-fresh-enum.test.ts` | **2/2** |
| 顺序钉 | `message-queue.test.ts` | **20/20**（`entry.busy = true;` 先于 `await this.sendDelivery(...)`；零改动） |
| B3–B6 定向 | `b101` 11/11、`b111` 5/5、`b3-fixed-cards-panel` 8/8、`b3-fixed-baseline-pathb` 10/10、`b3-release-merge-desktop` 7/7、`b3-workflow-git-real` 9/9、`b31` 9/9、`b51` 14/14、`b61` 9/9、`b71` 7/7、`b81` 6/6、`b82` 11/11、`b42` 8/8 | 全部 **EXIT=0 / 0 失败** |
| 钉子·顺序 | `chief-workflow.test.ts` | 66 tests / **58 pass / 8 既有失败**；**CHIEF_NO_DIFF vs 干净 b5901ac**（W5/W10/W19×2/W33/W34/commit-race/required/selected） |
| 钉子·其余 | `run-change-entry` 5/5、`boundary-refresh` 14/14、`g1-copy-and-nails` 5/5、`evidence-markers` 1/1、`queue-status` 5/5、`request-status` 4/4、`hot-path` 3/3、`interface` 8/8、`governance-matrix` 18/18 | ✅ |
| 钉子·既有失败 | `directive-input` 14/19、`h-scope-audit` 4/7 | 与干净基线逐名一致（NO_DIFF） |
| 冒烟 | `session.test.ts` | 6/7；唯一失败 `AC-8 预算 pin`（B1 起既有，非本批） |
| 失败名机械比对 | `…_evidence/failure-name-diff.txt` | star-routing / handback-delivery / chief-workflow / directive-input / h-scope-audit **全部 NO_DIFF** |

> 原始日志：`…_evidence/final/`（本工作树）与 `…_evidence/baseline/`（干净 b5901ac 工作树
> `.tmp-b6/baseline-wt`，`git worktree add --detach` 只读对照，完成后移除）。日志为默认 spec reporter 输出；
> 失败名抽取口径同 B0（行首 `✖ `，去时间戳、去重排序）。

## 6. 基线披露（干净 b5901ac）

- **handback-delivery 2 项既有失败**（任务预期 16/18）：`2026-10-24 trio 回交路由…` 与 `B 星形回交：tasks.jsonl
  已知 taskId…`；干净 b5901ac 工作树复现（16/18，同名）——既有产品/测试语义漂移，非 B6 引入。
- **star-routing 7 项既有失败**（3/10）：干净基线逐名一致（星形目标 v4.1 / convener dispatch / BUG-5 ×4 /
  AC-4.3）；B0–B5 记录同集合。
- **chief-workflow 8 项、directive-input 5 项、h-scope-audit 3 项既有失败**：本次基线逐名复核，零新增。
- **session.test.ts AC-8 预算 pin**：B1 起登记既有失败（索引字节 pin），非本批。
- 本批**零新增失败**：final 与 baseline 的失败名集合逐名 diff 为空（`failure-name-diff.txt`）。

## 7. 偏差说明（与任务/方案不完全一致之处）

1. **`routeStarDispatch` 内部调用经 `DispatchPorts` 门面中转**：`test/桌面应用/b71-fixed-fail-closed.test.ts`
   在门面实例上覆盖 `m.routeStarDispatch`/`m.routeFixedPathDispatch` 做路由桩；搬出后 dispatch 模块直接调用
   自身实现会使桩失效（首线实测 b71 新增 1 失败）。改为 `this.port.routeStarDispatch(...)` → 门面同名薄委托
   → 模块实现：生产路径等价（一次直接转发），门面实例覆盖语义保留（b71 复跑 7/7）。`routeFixedPathDispatch`
   经 `FixedDispatchPort` 本就经门面箭头，无需额外处理。记录化归一化见 `moved-methods.json`。
2. **`routeStarDispatch` 局部类型**：`ReturnType<SessionManager["captureChiefDispatchSource"]>` →
   `ReturnType<Dispatch["captureChiefDispatchSource"]>`（L4 不可导入门面类；纯编译期 self 视图，运行时零差异）。
3. **`isTaskHandbackShape` 随行搬移**：私有 helper，无门面同名委托（仅被 handle/commit 调用；测试无 cast 访问）。
4. **git-ports 的范围**：dispatch 的 `beginGitHostAction/endGitHostAction`（kind:"dispatch"）按「方法体逐字
   保留」留在 dispatch 模块（dispatch 白名单 []，不可导入 git-ports；同一 trunk-runtime 单一实现）；
   git-ports 覆盖 turn 级 runtime、taskGit 注入面与 session-dispose lease/信号。
5. **`disposeObservedHandle` 三行片段改用 git-ports 包装器**：该方法是生命周期方法（B7 才搬），本批仅把
   lease/信号片段提到 git-ports（同参数/同顺序/同错误路由，逐行论证见 adapters-and-equivalence.md §2.4）。
6. **死导入/死薄委托保留**（B3–B5 同口径）：`session.ts` 的 `createDesktopBaselineGitPort`/
   `createDesktopReleaseGitPort`/`createDesktopTaskGitShellPort`/`beginGitHostAction`/`endGitHostAction`/
   `createGitRoleRuntime` 等导入保留；B2 的 `fixedReleaseAutoEvidence`/`buildFixedCloseEvidence`/
   `collectFixedProposalDocumentRefs` 门面薄委托保留（现由 fixed 模块直接调用 evidence 实例）。
7. **模块字段命名**：`handback`/`dispatch`/`fixedWorkflowRoute`/`fixedWorkflowCards`/`fixedWorkflowRelease`/
   `fixedWorkflowPanel`（fixed 四文件各一实例；`cards.ts` 持有 `FixedWorkflowRelease` 引用以复用
   `autoPresentFixedReleaseMerge`，同模块内部拆分）。
8. **EOL**：`session.ts` 保持工作树 CRLF（改写按原换行风格还原，无全文件换行 diff）；新模块 LF（与 B5
   cards 模块一致）。

## 8. 第二段待办（由后续同角色上下文完成）

- 本地**全量**桌面套件（方案 §5 B6 门槛）与三套冻结 known-red（runtime-core 33 / 门禁引擎 5 / 编排 24）
  逐名 diff；
- §5 B6 其余定向余量（桌面全量已含；如 `queue-*`、`network-state-e2e` 邻接套件可按全量覆盖）；
- 上述通过后按流程提交（本段**未** commit/push/tag/CI）。

## 9. 边界声明

- 只改：`app/desktop/session.ts`、`app/desktop/session/handback.ts`（新）、`dispatch.ts`（新）、
  `fixed-workflow/{route,cards,release-merge,panel}.ts`（新）、`git-ports.ts`（新）、
  `session/contracts/ports.ts`（新，仅端口类型）、`test/桌面应用/session-structure.test.ts`
  （仅预算常量/注释/标题数字）、`角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b6-handback-dispatch-fixed*`。
- 未动：`app/desktop/customer-input.ts`、既有 delivery/cards/run-change/shared/tasks/evidence/persistence/
  diagnostics/session-env 模块、14 钉子、`session-source.ts`、boundary 文件、其他测试/生产代码/角色目录。
- 未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占 9222/9223/9224；未启动 Electron/真实模型。

## 10. 第二段：全量门槛（2026-11-13 完成）

- 执行：同一工作树 `.claude/worktrees/refactor-session-ts-b6`（分支 `refactor/session-ts-b6`，HEAD=`b5901ac`，
  第一段改动未提交）。
- 证据目录：`…_handback-dispatch-fixed_evidence/segment2/`。原始日志为 spec reporter 输出
  （`--test-reporter=spec`）；失败名机械抽取口径同 B0（行首 `✖ <name> (<Nms>)`，去时间戳、去重排序；
  `12b` 基线自带 `✖ ` 前缀，对照前归一）。抽取/比对工具：`…_evidence/tools/segment2-failnames.mjs`、
  `tools/segment2-summary.mjs`（可复跑）。
- 结论：逐文件门槛 **22/22 通过或既有失败逐名一致**；三套冻结 known-red **ADDED=0 / REMOVED=0（NO_DIFF）**；
  全量桌面应用失败名 **ADDED=1 / REMOVED=1**——ADDED 项经干净 b5901ac 对照工作树复现同一断言（既有顺序
  竞态 flake，见 §10.2/§10.4），REMOVED 项为 B5 已登记 flake 再次转绿；本批**未引入可归因新增失败**。

### 10.1 逐文件门槛（`node --test --test-timeout=120000`，逐个独立进程）

| 文件 | tests | pass | fail | cancelled | 时长 | EXIT | 失败名对照 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `test/桌面应用/handback-delivery.test.ts` | 18 | 16 | 2 | 0 | 8.2s | 1 | 2 vs 第一段 baseline 2：**NO_DIFF** |
| `test/测试/chat-handback-integration.test.ts` | 3 | 3 | 0 | 0 | 0.7s | 0 | — |
| `test/桌面应用/star-routing.test.ts` | 10 | 3 | 7 | 0 | 2.0s | 1 | 7 vs 第一段 baseline 7：**NO_DIFF** |
| `test/桌面应用/fixed-path-routing.test.ts` | 13 | 13 | 0 | 0 | 1.5s | 0 | — |
| `test/测试/fixed-path-full-chain.test.ts` | 3 | 3 | 0 | 0 | 4.3s | 0 | — |
| `test/桌面应用/dispatch-fresh-enum.test.ts` | 2 | 2 | 0 | 0 | 1.0s | 0 | — |
| `test/桌面应用/b101-fixed-dispatch-task-binding.test.ts` | 11 | 11 | 0 | 0 | 1.2s | 0 | — |
| `test/桌面应用/b111-fixed-closed-handback-drain.test.ts` | 5 | 5 | 0 | 0 | 0.8s | 0 | — |
| `test/桌面应用/b3-fixed-baseline-pathb.test.ts` | 10 | 10 | 0 | 0 | 4.3s | 0 | — |
| `test/桌面应用/b3-fixed-cards-panel.test.ts` | 8 | 8 | 0 | 0 | 0.9s | 0 | — |
| `test/桌面应用/b3-release-merge-desktop.test.ts` | 7 | 7 | 0 | 0 | 6.2s | 0 | — |
| `test/桌面应用/b3-workflow-git-real.test.ts` | 9 | 9 | 0 | 0 | 5.9s | 0 | — |
| `test/桌面应用/b31-fixed-release-auto-desktop.test.ts` | 9 | 9 | 0 | 0 | 6.8s | 0 | — |
| `test/桌面应用/b42-task-git-port-desktop.test.ts` | 8 | 8 | 0 | 0 | 2.7s | 0 | — |
| `test/桌面应用/b51-fixed-workflow-wiring.test.ts` | 14 | 14 | 0 | 0 | 1.8s | 0 | — |
| `test/桌面应用/b61-chat-entry-fixed.test.ts` | 9 | 9 | 0 | 0 | 0.6s | 0 | — |
| `test/桌面应用/b71-fixed-fail-closed.test.ts` | 7 | 7 | 0 | 0 | 0.6s | 0 | — |
| `test/桌面应用/b81-fixed-dispatch-forced-session.test.ts` | 6 | 6 | 0 | 0 | 1.1s | 0 | — |
| `test/桌面应用/b82-fixed-workflow-binding-handback.test.ts` | 11 | 11 | 0 | 0 | 1.1s | 0 | — |
| `test/测试/g1-verify/g1-copy-and-nails.test.ts` | 5 | 5 | 0 | 0 | 0.2s | 0 | — |
| `test/测试/g1-verify/g1-dispatch-wiring.test.ts` | 5 | 5 | 0 | 0 | 2.3s | 0 | — |
| `test/测试/g1-verify/g1-extraction-render.test.ts` | 13 | 13 | 0 | 0 | 0.2s | 0 | — |

- 逐文件跑未加 `--test-force-exit`，全部进程正常退出（无挂起）；计数见 `segment2/gate-results.txt`
  （逐文件原始日志 `segment2/gates/*.log`，失败名 `segment2/gates/*-failnames.txt`）。
- `handback-delivery` 2 项既有失败 = `2026-10-24 trio 回交路由…`、`B 星形回交：tasks.jsonl 已知 taskId…`；
  `star-routing` 7 项既有失败 = 星形目标 v4.1 / convener dispatch / BUG-5 ×4 / AC-4.3——均与第一段
  baseline 日志逐名一致（`segment2/gate-handback-delivery-diff.json`、`gate-star-routing-diff.json`：
  added=0、removed=0），也与 B0 全量基线同集合。

### 10.2 本地全量桌面套件（B0 冻结基线对照）

命令（B0/B4/B5 分段口径，`--test-reporter=spec` 记录；`--test-force-exit` 仅影响测试完成后的进程退出）：

```
node --test --test-concurrency=1 --test-timeout=120000 --test-force-exit --test-reporter=spec "test/桌面应用/**/*.test.ts"
node --test --test-concurrency=1 --test-timeout=120000 --test-force-exit --test-reporter=spec "test/桌面UI/**/*.test.ts"
```

| 段 | 文件数 | tests / pass / fail / cancelled / skipped | 时长 | EXIT |
| --- | --- | --- | --- | --- |
| `test/桌面应用/**/*.test.ts` | 78 | **845 / 773 / 70 / 2 / 0** | 437.7s | 1 |
| `test/桌面UI/**/*.test.ts` | 58 | **443 / 443 / 0 / 0 / 0** | 6.5s | 0 |

- **桌面应用失败名逐名对照**：final 72 vs B0 冻结基线 72（`12b-baseline-desktop-app-failnames.txt`）
  ⇒ **ADDED=1、REMOVED=1**（`segment2/full-desktop-app-failname-diff.json` / `.txt`）。
  - **ADDED**：`申请直达：来源角色=rapporteur，卡片不镜像，裁决回来源；request.* 事件写 tasks.jsonl`
    （`test/桌面应用/application-line.test.ts:103`）。失败为 `request.notified` 事件顺序竞态：
    actual `['presented','created','resolved']` vs expected `['created','presented','resolved']`。
    隔离复现判定：B6 工作树 5 次独立运行 2 次失败；**干净 b5901ac 对照工作树 5 次独立运行 3 次失败，
    actual/expected 逐字相同** ⇒ 既有 flake，非 B6 引入（B0/B5 全量未命中故不在冻结名集合内）。
    详见 `segment2/repro/application-line-flake.md` 与 10 份原始日志。
  - **REMOVED**：`重启：未决申请 orphaned、未决审批 expired；已结算不重复，二次恢复幂等`——B5 第二段
    已披露的临时目录 `ENOTEMPTY` 清理竞态 flake，本次转绿（`pending-card-restart.test.ts` 在 B5 单跑
    1/1 通过，本批未触碰该路径）。
  - 计数差异说明：B0 845/774/69/2；本批 845/773/70/2 = B5 的 845/774/69/2 之上，同一 flake 双向波动
    （application-line 命中 1 次、pending-card-restart 转绿 1 次）；测试集合未变（78 文件，见
    `segment2/full-desktop-app-filelist.txt`）。**与 B5 final 失败名集合（71）逐名对照**：ADDED=1
    （application-line）、REMOVED=0（`segment2/full-desktop-app-vs-b5-diff.json`）——即除该既有 flake
    外，失败集合与 B5 完全一致。
- **桌面UI**：443/443/0，与 B0 `14-segment-桌面UI.tap`（443/443/0）完全一致（58 文件，
  `segment2/full-desktop-ui-filelist.txt`）。
- **2 条 cancelled 均为 120s 超时、与 B0/B5 同名**：`关闭全部与双角色刷新扫描交接：停止返回后没有
  后续重开或投递`（120,015.2ms）、`C-04 decision 开关开启（真实 channel）…`（120,013.2ms）；
  属既有挂起/级联现象，如实披露、未修改测试。
- **flake 披露**：全量段沿用 `--test-force-exit`（仅影响测试完成后的进程退出，不改变用例结果；CI 权威
  命令不变）；437.7s 内无其他超时、无 Node 原生断言崩溃、无 chief-workflow W29/W30/W35 级联。

### 10.3 三套冻结 known-red（逐名 diff 空）

| 套件 | 命令/口径 | tests/pass/fail/skipped | 时长 | 失败名 diff |
| --- | --- | --- | --- | --- |
| runtime-core | `… --test-force-exit --test-reporter=spec "test/runtime-core/**/*.test.ts"`（64 文件） | **604 / 567 / 33 / 4**（EXIT=1） | 15.5s | 33 vs 33：**ADDED=0 REMOVED=0（NO_DIFF）** |
| 门禁引擎 | LF 归一（`git cat-file blob HEAD:` 写回两 chief md）→ `… --test-force-exit "test/门禁引擎/**/*.test.ts"`（57 文件）→ `git checkout --` 还原 | **577 / 571 / 5 / 1**（EXIT=1） | 76.1s | 5 vs 5：**NO_DIFF** |
| 编排 | 137 文件（除 git-trunk-store）+ `test/编排/git-trunk-store.test.ts` 单文件，均 `--test-force-exit` | **1,373 / 1,347 / 24 / 2** + **13/13** = **1,386 / 1,360 / 24 / 2**（EXIT=1 / 0） | 25.8s + 57.6s | 24 vs 24：**NO_DIFF** |

- 门禁归一/还原：before `i/lf w/crlf` → 归一 `w/lf` → 还原 `w/crlf`；还原后对该二文件 `git status` /
  `git diff` 均为空（`segment2/knownred-gates-normalize.txt`，restore-rc=0）。本次**未触发**
  git-shell-acl 原生崩溃，无需复跑。
- 编排采用任务允许的「137 文件 + 单文件」拆分口径（git-trunk-store 为本环境已知挂起/原生崩溃文件；
  文件清单 `segment2/orchestration-filelist.txt`）；主跑 25.8s、单文件 57.6s，全程 `--test-force-exit`，
  如实披露。
- 对照源：B0 `04a-knownred-runtime-core-33.txt` / `04b-knownred-gates-5.txt` / `04c-knownred-orchestration-24.txt`；
  本次失败名清单与 diff 见 `segment2/knownred-*-failnames.txt` / `knownred-*-diff.json`。

### 10.4 口径与 flake 披露汇总

- 环境：Windows 11 / Node v24.22.1 / bash；本工作树无 `node_modules`，测试期（2026-11-13 17:00–17:25）
  创建目录 junction `node_modules → C:\Users\51054\Desktop\work\ans-studio\node_modules`
  （`require('typescript')` = 7.0.2 可解析），全部测试完成后以 `cmd rmdir` 仅移除 junction，主仓库
  `node_modules` 完好。
- `--test-force-exit` 仅用于全量桌面与三套 known-red（B0/B4/B5 同口径）；逐文件门槛全部正常退出。
- 干净 b5901ac 对照工作树（`.tmp-b6-seg2/baseline-wt`，`git worktree add --detach b5901ac`，junction
  node_modules）仅用于 application-line flake 判定，完成后 `git worktree remove` 并移除 junction。
- ADDED=0（逐文件门槛 + 三套 known-red）；全量桌面 ADDED=1 为既有顺序竞态 flake（干净 b5901ac
  3/5 复现，见 §10.2）、REMOVED=1 为既有 flake 转绿；2 cancelled 与基线同名；无改测试/放宽断言。
- 未触发「可复现的新增（B6 引入）失败」停止条件：新增名在干净起点同样复现，归因既有 flake。

### 10.5 终检

- `git status --porcelain` 仅：`M app/desktop/session.ts`、`M test/桌面应用/session-structure.test.ts`、
  `?? app/desktop/session/contracts/ports.ts`、`?? app/desktop/session/dispatch.ts`、
  `?? app/desktop/session/fixed-workflow/`、`?? app/desktop/session/git-ports.ts`、
  `?? app/desktop/session/handback.ts`、`?? 角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b6-handback-dispatch-fixed.md`、
  `?? …_handback-dispatch-fixed_evidence/`；无临时目录/junction/构建产物（`.tmp-b6-seg2/` 与
  baseline 工作树、junction 已移除）。
- `app/desktop/session.ts` **4,626 行**（≤6,954，较起点 9,118 已下降；B6 净 −2,328）；单模块：
  dispatch 1,298、route 729、cards 464、release-merge 360、handback 394、git-ports 95、panel 90、
  contracts/ports 35（均 ≤1,500）。
- 第一段语义核对表（`…_evidence/semantics-check.md`）保持完整、未改动；本段仅追加记录与 `segment2/`
  证据（含 `repro/`）。
- 本段未 commit/push/tag/CI，未读 `.env`，未占 9222/9223/9224，未启动 Electron/真实模型。

## 11. 证据目录

`角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b6-handback-dispatch-fixed_evidence/`：

| 文件/目录 | 内容 |
| --- | --- |
| `moved-methods.json` / `moved-methods-summary.md` | 26 方法源/目标哈希、归一化相等、门面委托、适配清单 |
| `git-ports-fragments.json` | 6 个 git-ports 片段源/目标哈希、归一化相等、门面调用点接线（allFragmentsIdenticalUnderDocumentedAdaptations=true） |
| `adapters-and-equivalence.md` | 不可机械处逐行等价论证（git-ports 片段、receiver 重建、端口、构造顺序、门面中转） |
| `semantics-check.md` | 14 项语义核对表（回交 B8、fixed T3、派发 fail-closed、Git 端口）+ 首线汇总 |
| `failure-name-diff.txt` | 失败名机械对照（全部 NO_DIFF） |
| `final/` / `baseline/` | 首线各套件原始日志（本工作树 / 干净 b5901ac 对照） |
| `tools/moved-methods-sha.mjs` | 方法哈希/归一化比对工具（可复跑） |
| `tools/git-ports-fragments-sha.mjs` | git-ports 片段哈希/归一化比对工具（可复跑） |
| `segment2/` | 第二段证据：逐文件门槛日志/失败名/计数（`gates/`、`gate-results.txt`）、全量桌面应用/UI 日志与失败名 diff、三套 known-red 日志/失败名/diff、门禁 LF 归一记录、编排文件清单、`segment2-summary.json`、`repro/`（application-line flake 判定 10 份日志 + 说明） |
| `tools/segment2-failnames.mjs` / `tools/segment2-summary.mjs` | 第二段失败名抽取/比对与汇总工具（可复跑） |

## 12. 终检

- `git status --porcelain` 仅：`M app/desktop/session.ts`、`M test/桌面应用/session-structure.test.ts`、
  `?? app/desktop/session/contracts/ports.ts`、`?? app/desktop/session/handback.ts`、`?? app/desktop/session/dispatch.ts`、
  `?? app/desktop/session/fixed-workflow/`、`?? app/desktop/session/git-ports.ts`、
  `?? 角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b6-handback-dispatch-fixed.md`、
  `?? …_handback-dispatch-fixed_evidence/`；无临时目录/构建产物。
- 干净 b5901ac 对照工作树（`.tmp-b6/baseline-wt`）已 `git worktree remove`；工作树 `node_modules` junction
  （指向主仓库 node_modules）与 `.tmp-b6/` 已移除；主仓库 node_modules 完好。
- `app/desktop/session.ts` **4,626 行**（≤6,954，较起点 −2,328）；单模块：dispatch 1,298、route 729、
  cards 464、release-merge 360、handback 394、git-ports 95、panel 90、contracts/ports 35（均 ≤1,500）。
- 未 commit/push/tag/CI，未读 `.env`，未占 9222/9223/9224，未启动 Electron/真实模型。
