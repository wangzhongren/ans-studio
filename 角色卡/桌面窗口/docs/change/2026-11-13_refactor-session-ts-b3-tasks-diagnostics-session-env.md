# B3：session.ts 任务账本、诊断与运行环境 45 个类方法迁出（纯搬运 + 薄委托）

- 日期：2026-11-13
- 角色：桌面窗口
- 工作树：`.claude/worktrees/refactor-session-ts-b3`（分支 `refactor/session-ts-b3`）
- 起点：`c616280`（= origin/main，含 B0/B1/B2；`app/desktop/session.ts` 11,756 行，
  blob `ab0022cd5cfa0b88eeea22458865c479634a96f7`）
- 方案：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §3.3 / §3.6 / §5 B3、附录 A
- 范围：**B3 单批**——按附录 A 归属，把 tasks 组 17 方法 → `app/desktop/session/tasks.ts`、
  diagnostics 组 17 方法 → `app/desktop/session/diagnostics.ts`、session-env 组 11 方法 →
  `app/desktop/session/session-env.ts`；`SessionManager` 保留**同名同签名同可见性**的薄委托。
  方法体（含 JSDoc）**逐字节搬移**（仅记录化 receiver/state 适配，见 §4）。

## 1. 结果摘要

| 项 | 值 |
| --- | --- |
| `app/desktop/session.ts` 行数 | **11,756 → 10,252**（-1,504；`wc -l` 口径；git numstat +187/−1,691） |
| 搬出方法 | **45 个**（17 tasks / 17 diagnostics / 11 session-env） |
| 逐字移动证明 | **45/45 归一化逐字节相等；45/45 方法体 sha256 相等**（`…_evidence/moved-methods.json`） |
| 新增模块 | `session/tasks.ts` 916 行、`session/diagnostics.ts` 722 行、`session/session-env.ts` 601 行（均 ≤1,500） |
| 公开导出面 | 运行时 6 值 + 类型 45 **逐字不变**（结构测试 8/8） |
| 模块边界 | tasks/diagnostics/session-env 均 L2、feature 白名单 `[]`；只导入 contracts/shared 与外部 src（结构测试强制通过） |
| typecheck | **EXIT=0** |
| 结构预算 | `SESSION_TS_FROZEN_BASELINE_LINES` 12,388 → **11,756**（同步注释/标题数字；其余断言零改动） |
| 十文件 | 62 tests / 57 pass / 4 fail / 1 cancelled；**失败名与干净 c616280 基线逐名一致、零新增**（见 §5 基线披露） |
| 14 源码钉子 | 失败名与干净 c616280 基线**逐名一致、零新增**（directive-input 5 / chief-workflow 8 / h-scope-audit 3 为既有） |
| 聚合读取器 | `session-source.test.ts` **5/5** |

## 2. 45 方法 → 模块清单（HEAD 源行 · 目标行）

| 模块 | 方法 |
| --- | --- |
| `session/tasks.ts` | `observeRoleEvent`（4416 · 138）、`roleActivityLogText`（4454 · 176）、`readRoleActivityLog`（5279 · 189）、`listTasks`（5284 · 194）、`projectStateView`（5302 · 210）、`projectStateTool`（5310 · 218）、`projectNote`（5323 · 231）、`restoreTasks`（6099 · 317）、`partialArtifactsFor`（6174 · 385）、`roleTempDir`（6185 · 396）、`isolatePartialArtifacts`（6195 · 406）、`chooseRedispatchTarget`（6282 · 480）、`terminateRoleRun`（6402 · 489）、`taskChainRootOf`（6516 · 603）、`redispatchTask`（6528 · 615）、`closeTask`（6700 · 787）、`escalateStuckTask`（6708 · 795） |
| `session/diagnostics.ts` | `governanceOwnerRoleId`（2546 · 145）、`governanceRuntimeFor`（2551 · 150）、`activeRuntimeFor`（2556 · 155）、`governanceProjectionKey`（6843 · 165）、`governanceProjectionFingerprint`（6848 · 170）、`registerGovernanceClientProjection`（6875 · 197）、`lookupGovernanceClientProjection`（6893 · 215）、`mirrorGovernanceFeedback`（6910 · 232）、`isNetworkOffline`（7560 · 377）、`applyNetworkState`（7566 · 383）、`watchdogSnapshot`（10303 · 410）、`projectRootsWithActivity`（10363 · 470）、`lastTurnOf`（10372 · 479）、`watchdogDeliver`（10377 · 484）、`roleStatusText`（10876 · 532）、`diagnosticsTailText`（10976 · 632）、`sessionTailText`（11018 · 674） |
| `session/session-env.ts` | `installationEffectObservations`（475 · 99）、`refuseUnprovenInstallation`（478 · 103）、`boundaryDiff`（1417 · 120）、`currentSkillPaths`（1439 · 142）、`rebuildIfBoundaryStale`（1470 · 173）、`rebuildIfBoundaryStaleUnsafe`（1501 · 204）、`queueRebuildWritePermitsNotice`（1554 · 257）、`refreshStaleBoundaries`（1574 · 277）、`activateRoleRefresh`（10535 · 297）、`applySkillChange`（10559 · 321）、`applyMcpChange`（10710 · 463） |

逐方法证据（HEAD 源行/目标行、适配标签、源/目标归一化 sha256、方法体 sha256、门面委托存在性）：
`…_evidence/moved-methods.json`；人读摘要：`…_evidence/moved-methods-summary.md`。

## 3. 结构预算收紧

`test/桌面应用/session-structure.test.ts`：

```diff
-const SESSION_TS_FROZEN_BASELINE_LINES = 12388;
+const SESSION_TS_FROZEN_BASELINE_LINES = 11756;
```

同步更新该常量上方注释（B3 结束实测 11,756）、文件头第 3 条说明与测试标题中的旧数字；
断言条件/消息模板/白名单/层次表逐字未动。最终实测 10,252 ≤ 11,756。

## 4. 适配清单与行为等价论证

完整版：`…_evidence/adapters-and-equivalence.md`。要点：

1. **模块类外壳**（方案 §3.3 草案即 `class Tasks`/`Diagnostics`/`SessionEnv`）：同名成员重建原 `this`
   面，45 个方法文本（签名+体+JSDoc）逐字节搬移；唯一文本适配为 `private` → 模块内 public（门面委托
   可调用，不进入公开导出面）。门面 45 个委托签名与 HEAD 逐字相等（45/45）。
2. **状态归属**（方案 §3.6；B1/B2 同款口径）：各模块所需状态**暂留门面**，构造时以**同一 Map/Set/Array
   实例引用**注入；`networkState`/`activeRoleId` 以 get/set 访问器接回门面字段。模块实例每管理器一份，
   **无模块级可变状态**，跨实例隔离性与迁移前一致（多实例等价）。
3. **同名同义委托**：shared 已迁出的函数（`readTasks`/`appendTaskState`/`recordTaskFailure`/
   `appendRoleActivity`/`rememberTaskCreator`/`roleDisplayName`/`chiefTaskRoleIdOf`/
   `handbackOwnerRoleId`/`findListingForFeedback`/`resolveProofFlowIds`/`refreshListingNow`/
   `emitDeliveryNote`/`sessionKey`/`queueKey`/`now`/`contextInfo`/`filePrint`）经模块内同名成员调用
   **同一函数、同一入参**；`now` 仍为 `deps.now ? deps.now() : Date.now()`。
4. **端口**（B3 未迁出的门面方法）：`restoreRequestState`/`restoreVersionDecisions`/`findLiveRuntime`/
   `enqueueDelivery`/`drainQueue`/`appDispatchClientMessageId`/`stopExactController`/
   `ensureFreshRoleSession`/`withRequestLifecycle`（tasks）；`openBackground`/`sendBackground`/
   `notifyRoleState`/`drainAllQueuesFor`/`drainQueue`/`enqueueDelivery`（diagnostics）；
   `disposeEntry`/`hasBusyRuntime`/`openInternalUnsafe`/`profileRevision`/`rebuildSession`/
   `isCustomerInitiatedTurn`/`watchdogDeliver`（session-env，后者为本批同层迁出、经门面上行）。
   全部箭头回调**参数逐位原样转发、返回原样返回**。
5. **常量适配**：`CAPABILITY_INSTALL_SYSTEM_PREFIX` 定义（含 JSDoc）随两方法迁入 session-env.ts，
   session.ts 改为原样转出（公开面/冻结值不变）；diagnostics 专用常量
   `GOVERNANCE_HANDBACK_MIRROR_DEDUPE_MS`/`GOVERNANCE_CLIENT_PROJECTION_LIMIT`/
   `GOVERNANCE_CLIENT_PROJECTION_TTL_MS`/`PROOF_STATUS_TEXT`（仅被本批方法使用）随方法迁入；
   `GOVERNANCE_SLUG_RE` 仍留 session.ts（cards 使用），tasks.ts 以同一单一来源
   `GOVERNANCE_SLUG_PATTERN` 构造等价正则（无状态）。
6. **计时器/看护回调语义**：本批方法体内零 `setInterval`/`unref`/`setImmediate`；HEAD 的 5 处
   `setTimeout` 中恰 1 处（`terminateRoleRun` 的 5000ms abort 竞速上限）随方法逐字迁入 tasks.ts，
   其余 4 处与唯一看护 tick 留在 session.ts 逐字未动；不新增/不删除定时器，不改 unref/dispose 时机
   （证据 `…_evidence/timers-check.txt`）。

## 5. 验证结果（最终候选）

| 门槛 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npm run typecheck` | **EXIT=0** |
| 结构保护 | `node --test test/桌面应用/session-structure.test.ts` | **8/8**（导出面 51；导入图无环/分层/白名单；体量 10,252 ≤ 11,756；工具面快照 7 角色） |
| 聚合读取器 | `node --test test/桌面应用/session-source.test.ts` | **5/5** |
| 十文件合计 | `node --test --test-timeout=180000 <十个文件>` | **62 tests / 57 pass / 4 fail / 1 cancelled**——失败名与干净 c616280 基线**逐名一致、零新增**（见 §6） |
| 钉子·evidence-markers / queue-status / request-status | 单文件 | 1/1、5/5、4/4 |
| 钉子·boundary-refresh | 单文件 | **14/14** |
| 钉子·directive-input | 单文件 | 19 tests / 14 pass / **5 既有失败**（逐名同基线） |
| 钉子·chief-workflow | 单文件（`--test-force-exit`，本机口径） | 66 tests / **58 pass / 8 既有失败**（W5/W10/W19/W33/W34/commit-race/required/selected），与干净基线**逐名相同** |
| 钉子·dispatch-fresh-enum / hot-path / interface / message-queue / run-change-entry | 单文件 | 2/2、3/3、8/8、20/20、5/5 |
| 钉子·g1-copy-and-nails / h-scope-audit / governance-matrix | 单文件 | 5/5、7 tests 4 pass / **3 既有失败**（逐名同基线）、18/18 |

失败名机械比对：`…_evidence/failure-name-diff.txt`（baseline vs final，15 组全部 `NO_DIFF`）。
原始日志：`…_evidence/baseline/`、`…_evidence/final/`。

## 6. 基线披露（干净起点 c616280，修改前实测）

- **十文件基线**：62 tests / 57 pass / 4 fail / 1 cancelled。除任务已知的 **task-restart 1 项既有失败**
  （`重启恢复：…`，约 2s 定时等待超时）外，`stuck-redispatch.test.ts` 另复现 **4 个既有失败**：
  `safe 重派…`（期望原任务 `task.closed(rework)`，实测无 closed 事件）、`B-07 自动换人…`（替代角色未收到
  重派任务）、`B-07 升级卡…`（期望 `t-esc-r2.closed.reason=rejected`，实测 undefined）、
  `C-04 decision 开关开启…`（挂起；单文件运行时超过 600s 仍未结束，十文件口径下 180s 测试超时被取消）。
  在**未做任何修改**的干净 `c616280` 工作树上复现（`…_evidence/baseline/ten-files.txt`、
  `stuck-redispatch-alone.txt`）。历史线索：`e71501c` 起 `redispatchTask` 对原任务的落账由
  `task.closed(rework)` 改为 `recordTaskFailure`（`task.reported(failed)`），而该测试仍断言
  `task.closed`；属**既有产品/测试语义漂移**，非 B3 引入，也不在本批修复范围。
- **钉子基线**：directive-input 5、chief-workflow 8、h-scope-audit 3 为既有；其余 11 个钉子文件全过。
- 本批**零新增失败**：final 与 baseline 的失败名集合逐名 diff 为空（`failure-name-diff.txt`）。
- chief-workflow 与 B2 同口径：单文件加 `--test-force-exit`（测试结束强制退出，防 async_hooks 清理期
  挂起）；baseline 与 final 使用同一口径与超时。

## 7. 偏差说明（与任务/方案不完全一致之处）

1. **十文件预期更正**：任务写“十文件全过；task-restart 已知 1 项既有失败”，但干净起点实测另有 4 个
   stuck-redispatch 既有失败/挂起（§6）。按“既有失败逐名对照、零新增”执行并如实披露；未修既有缺陷。
2. **常量搬移**：`CAPABILITY_INSTALL_SYSTEM_PREFIX` 与 4 个 diagnostics 专用常量随方法迁出（属
   receiver/常量适配；公开面、冻结值与文案逐字不变），见 §4.5。
3. **`GOVERNANCE_SLUG_RE` 双份构造**：tasks.ts 从唯一来源 `GOVERNANCE_SLUG_PATTERN` 重新构造本模块
   正则（纯判定、无状态）；session.ts 原常量保留给同文件 cards 方法。
4. **session.ts 死导入未清理**：仅被搬出方法使用的导入仍保留在 session.ts（`noUnusedLocals` 未开启；
   避免删改导入带来的加载副作用/审计噪声）。与 B2 的“清理死导入”做法不同，特此说明。
5. **session-env 的 deps 切片新增 `emitEvent`**：`rebuildIfBoundaryStaleUnsafe` 原直接用
   `this.deps.emitEvent`；以同一 deps 对象注入，调用形式/时机不变。

## 8. 边界声明

- 只改：`app/desktop/session.ts`、`app/desktop/session/tasks.ts`（新）、
  `app/desktop/session/diagnostics.ts`（新）、`app/desktop/session/session-env.ts`（新）、
  `test/桌面应用/session-structure.test.ts`（仅预算常量/注释/标题数字）、
  `角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b3-tasks-diagnostics-session-env*`。
- 未动：`session/contracts/**`、`session/shared/**`、`session/evidence.ts`、`session/persistence.ts`、
  14 个钉子文件、`test/桌面应用/session-source.ts`、boundary 文件、其他测试/生产代码/角色目录。
- 未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占 9222/9223/9224；未启动 Electron/真实模型。
