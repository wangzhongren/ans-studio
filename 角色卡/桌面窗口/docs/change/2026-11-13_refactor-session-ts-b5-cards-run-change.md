# B5：session.ts 卡片决策（43 方法）与 run-change（9 方法）迁出 + 首线验证——第一段完成

- 日期：2026-11-13
- 角色：桌面窗口
- 工作树：`.claude/worktrees/refactor-session-ts-b5`（分支 `refactor/session-ts-b5`）
- 起点：`9970c3d`（= origin/main，含 B0–B4；`app/desktop/session.ts` 9,118 行）
- 方案：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §3.2 / §3.3 / §3.6 / §5 B5 / 附录 A
  cards + run-change 组
- 范围：**B5 第一段**——cards/run-change/card-gateway 搬运、17 字段单 owner、`FixedCardHooks`/
  `ControllerStopPort` 端口、门面薄委托、结构预算收紧、首线验证。**第二段**（本地全量桌面套件 / 三套
  known-red 逐名 diff / 其余 §5 B5 定向套件）由后续同角色上下文完成（见 §8）。
- 逐字证明：`…_evidence/moved-methods.json` / `moved-methods-summary.md`；适配与等价论证：
  `…_evidence/adapters-and-equivalence.md`；语义核对表：`…_evidence/semantics-check.md`。

## 1. 结果摘要

| 项 | 值 |
| --- | --- |
| `app/desktop/session.ts` 行数 | **9,118 → 6,954**（−2,164；`git diff --numstat` +223/−2,387） |
| 搬出方法 | **52 个**（cards 43 + run-change 9），逐个含 JSDoc 逐字节搬移 |
| 逐字移动证明 | **52/52 归一化逐字节相等；52/52 方法体 sha256 相等；52/52 门面薄委托存在** |
| 新增模块 | `session/cards/cards.ts` 1,476 行（21 方法）、`cards/version-decisions.ts` 819 行（17）、`cards/acceptance-facts.ts` 436 行（5）、`session/run-change.ts` 494 行（9）、`session/card-gateway.ts` 97 行（端口形状）；均 ≤1,500 |
| 状态归属 | 方案 §3.6：cards **7 字段**由 `Cards.state` 单 owner 创建；run-change **10 字段**由 `RunChange.state` 单 owner 创建；门面仅**同一实例**访问器 |
| 端口 | `CardGateway` / `FixedCardHooks` / `ControllerStopPort`（card-gateway.ts，L3）由门面构造注入；cards 经 `FixedCardHooks` 调 fixed-workflow 两方法；B5 其余未迁出方法经 `CardsPorts`/`VersionDecisionPorts`/`RunChangePorts` 箭头逐位转发 |
| 公开导出面 | 运行时 6 值 + 类型 45 **逐字不变**（结构测试 8/8） |
| 模块边界 | cards L4（白名单 card-gateway/evidence）、run-change L2（白名单 []）、card-gateway L3（[]）；导入图无环 |
| typecheck | **EXIT=0** |
| 结构预算 | `SESSION_TS_FROZEN_BASELINE_LINES` 10,252 → **9,118**（仅常量/注释/标题数字；实测 6,954） |
| 首线验证 | 见 §5：全部指定套件通过或既有失败与干净 9970c3d 基线**逐名一致（NO_DIFF）** |
| 边界 | `app/desktop/customer-input.ts` **零改动**（`@决策` 顺序钉保持绿） |

## 2. 52 方法 → 模块清单（HEAD 源行 · 目标行）

完整逐方法表（源行/目标行/sha）见 `…_evidence/moved-methods-summary.md`。按模块：

| 模块 | 方法 |
| --- | --- |
| `cards/cards.ts`（21） | `interpretDirective`、`requestRequirementChangeDecision`、`requestRunChangeDecision`、`pickGovernedCardEntry`、`presentAppCard`、`presentVersionChangeCard`、`presentAmendmentItemCard`、`presentStableWriteCard`、`noteVersionChange`、`noteVersionChangeInitiator`、`reportPlanEscalation`、`afterPlanEscalation`、`activeRunViews`、`proposalCardFrozenRejection`、`pendingVersionChangesFor`、`offerRunChangeOnFrozenContract`、`requestIdFor`、`notifyRequest`、`recordRequestPresented`、`appointmentWriteApplicationRejection`、`withRequestLifecycle` |
| `cards/version-decisions.ts`（17） | `versionDecisionSubjectKey`、`isVersionDecisionRequestIdForSubject`、`findPendingVersionDecision`、`pendingRequestIdsForFlow`、`countPriorVersionDecisions`、`buildVersionDecisionFacts`、`versionDecisionCardLabels`、`decidedByText`、`formatTargetVersions`、`stripVersionDecisionPrefix`、`nextVersionFlowId`、`mapVersionDecisionRawOutcome`、`appendVersionDecisionAudit`、`emitVersionDecisionResolved`、`requestVersionDecision`、`restoreVersionDecisions`、`restoreRequestState` |
| `cards/acceptance-facts.ts`（5） | `enrichAcceptanceJudgeContext`、`countAcceptanceRejections`、`afterStableWrite`、`enrichAppointmentWriteBoundaryCard`、`afterAppointmentWriteApproved` |
| `run-change.ts`（9） | `runTaskIsFenced`、`selectRunChangeForHandle`、`completeTeamPlanForHandle`、`ownedRunStopMembers`、`executeOwnedRunStop`、`resumeDeferredRunChanges`、`executionInventoryFacts`、`controllerProducerFacts`、`stopExactController` |

说明：`presentAppCard`/`withRequestLifecycle`/`pickGovernedCardEntry`/`offerRunChangeOnFrozenContract` 等 16 个
`private` 方法在模块内为 public（仅门面委托可调用；门面侧可见性/签名逐字不变）。

## 3. 结构预算收紧

`test/桌面应用/session-structure.test.ts`：

```diff
-const SESSION_TS_FROZEN_BASELINE_LINES = 10252;
+const SESSION_TS_FROZEN_BASELINE_LINES = 9118;
```

同步更新常量上方注释（B5 起点实测 9,118）、文件头第 3 条说明与测试标题中的旧数字；断言条件/消息模板/
白名单/层次表逐字未动。最终实测 6,954 ≤ 9,118（继续下降）。

## 4. 状态单 owner 与端口

完整版见 `…_evidence/adapters-and-equivalence.md` §2。要点：

1. **cards 7 字段**（planEscalations、planEscalationPrompted、requestNotifiedKeys、
   requestPresentedKeys、versionDecisionPending、versionDecisionChains、runChangeAutoPrompted）：
   `Cards` 构造器唯一创建；`VersionDecisions` 经 `Cards.state` 读写其中 2 项（同一实例）；门面同名 getter。
2. **run-change 10 字段**（runStopGeneration、fencedRunTasks、fencedRuns、runStopFacts、controllerStopFacts、
   controllerDisposalOwners、deferredRunChanges、runChangeOperations、inventoryPublicationErrors、
   observedInventoryRoots）：`RunChange` 构造器唯一创建；门面同名 getter（`runStopGeneration` 带 setter）；
   `inventoryState` getter → `runChange.inventoryState`。
3. **库存两实例不双写**：`observedInventoryRoots`/`inventoryPublicationErrors` 同一 Set/Map 实例经
   `SessionInventoryState` 供 `shared/inventory` 与 `Delivery`（构造时以门面访问器取同一实例）使用。
4. **端口接线**：`Cards`/`VersionDecisions`/`RunChange` 的未迁出方法调用全部经端口箭头（门面同名薄委托，
   参数逐位转发）；`Cards.collectFixedProposalDocumentRefs` 直接调用同一 `Evidence` 实例（白名单 L1）；
   跨实例 run-stop 协调经 `shared/inventory` 同一管理器注册表的 `RunChangePeer` 结构化视图（运行时同对象）。
5. **构造顺序**：evidence → persistence → sessionEnv → **runChange** → delivery → tasks → diagnostics →
   **acceptanceFacts → cards → versionDecisions** → cardGateway/controllerStopPort。论证：Delivery 构造需要
   run-change 状态实例；cards 依赖 evidence/acceptance；versionDecisions 依赖 cards；全部构造器零副作用
   （只存引用/箭头，端口运行期调用）。

## 5. 首线验证结果（第一段）

| 门槛 | 命令/文件 | 结果 |
| --- | --- | --- |
| 类型 | `npm run typecheck` | **EXIT=0**（`final/typecheck.log`） |
| 结构保护 | `session-structure.test.ts` | **8/8**（导出面 51；导入图无环/分层；体量 6,954 ≤ 9,118；工具面快照 7 角色） |
| 聚合读取器 | `session-source.test.ts` | **5/5** |
| 回归·指令顺序 | `directive-decision.test.ts` | **8/8**（本 checkout 实为 8 例，全过） |
| 回归·授权平面 | `customer-authorization-plane-integration.test.ts` | **6/6** |
| 回归·run-change 入口 | `run-change-entry.test.ts` | **5/5** |
| 回归·申请重启 | `pending-card-restart.test.ts` | **1/1** |
| 回归·有界等待验收 | `optional-acceptance.test.ts` | **6/6**（注：本 checkout 文件内共 6 个 `test(`，任务口径「8/8」与文件实测不符；全过） |
| 回归·超时接线 | `request-timeout-wiring.test.ts` | **3/3** |
| 抽查·run-change | `run-change.test.ts` | **4/4** |
| 抽查·版本决策 | `version-decision.test.ts` | **15/15** |
| 抽查·版本变更 | `version-change.test.ts` | 42/46；**4 项既有失败**与干净 9970c3d 基线逐名一致（NO_DIFF） |
| 抽查·run-change 触发 | `run-change-trigger.test.ts` | 1/10；**9 项既有失败**与基线逐名一致（NO_DIFF） |
| 追加·验收卡 | `acceptance-evidence` / `acceptance-proposal-path` / `acceptance-return-card` | 3/3、7/7、10/10 |
| 追加·下载卡 | `download-request.test.ts` | 7/8；1 项既有失败与基线逐名一致（NO_DIFF） |
| 追加·租约/固定卡面板 | `turn-lease` / `b3-fixed-cards-panel` | 4/4、8/8 |
| 钉子·顺序 | `message-queue.test.ts` | **20/20**（`entry.busy = true;` 先于 `await this.sendDelivery(...)`；零改动） |
| 钉子·run-change 顺序 | `chief-workflow.test.ts` | 66 tests / **58 pass / 8 既有失败**；**W4 桌面 run-stop 用例通过**（含 `readSessionModule("run-change")` 方法边界顺序钉）；失败名与基线逐名一致 |
| 钉子·其余 | boundary-refresh 14/14、evidence-markers 1/1、queue-status 5/5、request-status 4/4、dispatch-fresh-enum 2/2、hot-path 3/3、interface 8/8、g1 5/5、governance-matrix 18/18；directive-input 14/5、h-scope-audit 4/3 与基线逐名一致 | ✅ |
| 失败名机械比对 | `…_evidence/failure-name-diff.txt` | version-change / run-change-trigger / download-request / chief-workflow / directive-input / h-scope-audit **全部 NO_DIFF** |

> 原始日志：`…_evidence/final/`（本工作树）与 `…_evidence/baseline/`（干净 9970c3d 工作树
> `.tmp-b5/baseline-wt`，`git worktree add --detach` 只读对照，完成后移除）。基线工作树带 `node_modules`
> junction → 主仓库 `node_modules`，完成后仅移除 junction（主仓库完好）。证据生成工具归档于
> `…_evidence/tools/`（`extract.mjs` 从 `git show HEAD:app/desktop/session.ts` 重建 `methods-source.json`
> 所需的方法清单；`moved-methods-sha.mjs` 复跑需 `.tmp-b5/methods.json`——先跑 `extract.mjs`，或把
> `tools/methods-source.json` 放回该路径；`gen.mjs`/`rewrite-delegates.py`/`patch-*.py` 与 `pre-*.txt`
> 为一次性迁移脚本/模块外壳模板，路径引用已清理的 `.tmp-b5/`）。

## 6. 基线披露（干净 9970c3d）

- **version-change 4 项既有失败**（VCA 能力/基线修复/自动呈现/blocked 提示；与本次改动无关；干净基线逐名复现）。
- **run-change-trigger 9 项既有失败**（干净基线逐名复现，1 pass 相同）。
- **download-request 1 项既有失败**（「一项目一卡：前一张未决时下载卡排队，不呈现」；干净基线复现，3.0s 超时形态一致）。
- **chief-workflow 8 项既有失败**（W5/W10/W19×2/W33/W34/commit-race/required/selected；干净基线逐名复现）。
- **directive-input 5 项、h-scope-audit 3 项既有失败**（与 B3/B4 记录同集合；本次基线逐名复核）。
- **optional-acceptance 计数口径**：任务写「8/8」，本 checkout 文件内 6 个 `test(`，实跑 6/6 全过；如实披露。
- 本批**零新增失败**：final 与 baseline 的失败名集合逐名 diff 为空（6 组）。

## 7. 偏差说明（与任务/方案不完全一致之处）

1. **`acceptance-facts.ts` 方法分配**：任务 `cards.ts` 清单含 `afterStableWrite`/`enrichAppointmentWriteBoundaryCard`/
   `afterAppointmentWriteApproved`；因 `cards.ts` 首版 1,621 行超单模块预算（≤1,500），将 3 个
   stable-write/appointment-write 校验方法移入 `acceptance-facts.ts`（§3.2 该文件职责本就含「appointment-write
   校验」），`cards.ts` 收敛到 1,476 行。方法体仍逐字搬移、门面委托同名同签名。记录于此并以方案为准。
2. **`card-gateway.ts` 端口形状**：`CardGateway`/`FixedCardHooks`/`ControllerStopPort` 为**现有方法签名的具名
   提取**（不新造业务语义）；B5 仅有 `FixedCardHooks` 被 cards 使用，`CardGateway`/`ControllerStopPort` 已由门面
   构造（B6/B7 使用）；未提前设计大接口。
3. **`RunChangePeer` 结构化视图**：L2 run-change 不可导入门面类 `SessionManager`（循环），`ownedRunStopMembers`
   的局部 `Map<SessionManager, …>` 键类型改为 `Map<RunChangePeer, …>`（字段/方法逐一对应，运行时同一实例）；
   为本次唯一方法体文本适配（记录化归一化，见 moved-methods.json）。
4. **`chief-workflow` 顺序钉定位**：模块方法为 public（B1–B4 同款），为让 `slice("private ownedRunStopMembers",
   "private async executeOwnedRunStop")` 在 `readSessionModule("run-change")` 上定位真实方法体，在三个方法声明前
   保留注明原 `private` 声明文本的定位注释；**未改钉子/聚合器/断言语义**。
5. **`VERSION_DECISION_SYSTEM_PREFIX` / `GOVERNANCE_SLUG_RE`** 常量随方法迁入 `version-decisions.ts`（原 session.ts
   模块级常量；session.ts 内的旧常量如仍被未迁出代码使用则保留，否则为死常量，B7 收口）。
6. **cards 状态门面访问器**：无测试直接 cast 这 7 个字段，但按「同一实例兼容访问器」口径全部保留同名 getter
   （零第二份状态）；run-change 的 10 个访问器保留 getter/setter 以维持物理面（测试 cast 见 §4）。
7. **`inventoryChanged` 门面方法体保持原样**（经 `this.inventoryState` → `runChange.inventoryState`），语义与
   B1 相同；未改为直接调用 `runChange.inventoryChanged`，避免无意义的文本变化（行为一致）。
8. **`optional-acceptance` 计数**：任务口径 8/8，实际文件 6 例全过（§6）。

## 8. 第二段待办（由后续同角色上下文完成）

- 本地**全量**桌面套件（方案 §5 B5 门槛）与三套冻结 known-red（runtime-core 33 / 门禁引擎 5 / 编排 24）逐名 diff；
- §5 B5 其余定向套件：`acceptance-*`（已抽跑）、`turn-lease`（已跑）、`pending-card-restart`（已跑）、
  `request-timeout-wiring`（已跑）、版本/run-change 余量文件；
- 上述通过后按流程提交（本段**未** commit/push/tag/CI）。

## 9. 边界声明

- 只改：`app/desktop/session.ts`、`app/desktop/session/cards/**`（新）、`app/desktop/session/run-change.ts`（新）、
  `app/desktop/session/card-gateway.ts`（新）、`test/桌面应用/session-structure.test.ts`（仅预算常量/注释/标题数字）、
  `角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b5-cards-run-change*`。
- 未动：`app/desktop/customer-input.ts`、既有 delivery/shared/tasks/evidence/persistence/diagnostics/session-env
  模块、14 钉子、`session-source.ts`、boundary 文件、其他测试/生产代码/角色目录。
- 未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占 9222/9223/9224；未启动 Electron/真实模型。

## 10. 第二段：全量门槛（2026-11-13 完成）

- 执行：同一工作树 `.claude/worktrees/refactor-session-ts-b5`（分支 `refactor/session-ts-b5`，HEAD=`9970c3d`，
  第一段改动未提交）。
- 证据目录：`…_cards-run-change_evidence/segment2/`。原始日志为 spec reporter 输出（`--test-reporter=spec`）；
  失败名机械抽取口径同 B0（行首 `✖ <name> (<Nms>)`，去重排序）；`12b` 基线文件自带 `✖ ` 前缀，对照前归一。
- 结论：**零新增失败**（ADDED=0）；三套冻结 known-red 逐名 diff 全空；§8 待办全部完成。

### 10.1 逐文件门槛（`node --test --test-timeout=120000`，逐个独立进程）

| 文件 | tests | pass | fail | cancelled | 时长 | EXIT | 失败名对照 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `version-decision.test.ts` | 15 | 15 | 0 | 0 | 2.6s | 0 | — |
| `version-change.test.ts` | 46 | 42 | 4 | 0 | 8.5s | 1 | 4 vs 第一段干净基线 4：**NO_DIFF** |
| `run-change.test.ts` | 4 | 4 | 0 | 0 | 0.6s | 0 | — |
| `run-change-trigger.test.ts` | 10 | 1 | 9 | 0 | 1.3s | 1 | 9 vs 第一段干净基线 9：**NO_DIFF** |
| `run-change-entry.test.ts` | 5 | 5 | 0 | 0 | 0.6s | 0 | — |
| `acceptance-evidence.test.ts` | 3 | 3 | 0 | 0 | 0.6s | 0 | — |
| `acceptance-proposal-path.test.ts` | 7 | 7 | 0 | 0 | 2.0s | 0 | — |
| `acceptance-return-card.test.ts` | 10 | 10 | 0 | 0 | 1.4s | 0 | — |
| `optional-acceptance.test.ts` | 6 | 6 | 0 | 0 | 1.5s | 0 | — |
| `pending-card-restart.test.ts` | 1 | 1 | 0 | 0 | 0.5s | 0 | — |
| `turn-lease.test.ts` | 4 | 4 | 0 | 0 | 1.2s | 0 | — |
| `request-timeout-wiring.test.ts` | 3 | 3 | 0 | 0 | 1.0s | 0 | — |
| `directive-decision.test.ts`（顺序回归） | 8 | 8 | 0 | 0 | 0.4s | 0 | — |
| `test/测试/customer-authorization-plane-integration.test.ts`（B3-1 顺序钉） | 6 | 6 | 0 | 0 | 0.6s | 0 | — |
| 追加抽查 `test/测试/version-change-integration.test.ts`（版本簇余量，非显式清单） | 12 | 3 | 9 | 0 | 1.0s | 1 | 9 vs 干净 9970c3d 基线 9：**NO_DIFF** |

- 两个既有失败文件与第一段干净 9970c3d 基线逐名一致（`segment2/gate-version-change-diff.json` /
  `gate-run-change-trigger-diff.json`：missing=0、extra=0）；其余 12 文件全绿。
- **追加抽查基线判定**：`version-change-integration` 不在任务显式清单内，作为版本簇余量补跑。为判定其 9 项失败的
  既有性，临时以 `git worktree add --detach .tmp-b5-seg2/baseline-wt 9970c3d` 建干净基线工作树（junction
  `node_modules`，只跑该文件），结果同为 12/3/9，失败名逐名一致（ADDED=0/REMOVED=0，
  `segment2/gate-version-change-integration-diff.txt`）；B0 全量基线（c234e79，191 名）亦包含全部 9 名。
  基线工作树与 junction 已移除。
- 逐文件跑未加 `--test-force-exit`，全部进程正常退出（无挂起）。逐文件计数见 `segment2/gate-results.txt`。

### 10.2 本地全量桌面套件（B0 冻结基线对照）

命令（B0/B4 分段口径：`--test-concurrency=1 --test-timeout=120000 --test-force-exit`，目录分段）：

| 段 | 文件数 | tests / pass / fail / cancelled / skipped | 时长 | EXIT |
| --- | --- | --- | --- | --- |
| `test/桌面应用/**/*.test.ts` | 78 | **845 / 774 / 69 / 2 / 0** | 441.8s | 1 |
| `test/桌面UI/**/*.test.ts` | 58 | **443 / 443 / 0 / 0 / 0** | 7.2s | 0 |

- **桌面应用失败名逐名对照**：final 71 vs B0 冻结基线 72（`12b-baseline-desktop-app-failnames.txt`）
  ⇒ **ADDED=0、REMOVED=1**（`segment2/full-desktop-app-failname-diff.txt`）。
  - 唯一转绿项：`重启：未决申请 orphaned、未决审批 expired；已结算不重复，二次恢复幂等`。B0 基线失败原因为
    临时目录 `ENOTEMPTY` 清理竞态（环境 flake，非产品断言）；本批全量通过且 `pending-card-restart.test.ts`
    单文件复跑 **1/1** 通过（0.5s）⇒ 既有 flake 转绿，非本批引入。
- **计数与 B4 第二段 final 完全一致**（845/774/69/2；桌面UI 443/443/0），本批未改变测试集合。
- **桌面UI**：443/443、0 失败，与 B0 `14-segment-桌面UI.tap`（443/443/0）完全一致。
- **2 条 cancelled 均为 120s 超时、且与 B0/B4 同名**：`关闭全部与双角色刷新扫描交接：停止返回后没有后续重开或投递`
  （120,011.0ms）、`C-04 decision 开关开启（真实 channel）…`（120,007.7ms）；属既有挂起/级联现象，如实披露、
  未修改测试。
- **flake 披露**：本环境存在测试后句柄残留历史（B0/B4 同款），全量段沿用 `--test-force-exit`（仅影响测试完成后的
  进程退出，不改变用例结果；CI 权威命令不变）；桌面应用 441.8s 内无其他超时、无 Node 原生断言崩溃、
  无 chief-workflow W29/W30/W35 级联。

### 10.3 三套冻结 known-red（逐名 diff 空）

| 套件 | 命令 | tests/pass/fail/skipped | 失败名 diff |
| --- | --- | --- | --- |
| runtime-core | `… --test-force-exit "test/runtime-core/**/*.test.ts"`（64 文件） | **604 / 567 / 33 / 4**（50.6s，EXIT=1） | 33 vs 33：**ADDED=0 REMOVED=0（NO_DIFF）** |
| 门禁引擎 | LF 归一（`git cat-file blob HEAD:` 写回两 chief md）→ `… --test-force-exit "test/门禁引擎/**/*.test.ts"` → `git checkout --` 还原 | **577 / 571 / 5 / 1**（93.9s，EXIT=1） | 5 vs 5：**NO_DIFF** |
| 编排 | 137 文件（除 git-trunk-store）+ `test/编排/git-trunk-store.test.ts` 单文件，均 `--test-force-exit` | **1,373 / 1,347 / 24 / 2**（140.4s）+ **13/13**（58.4s）= **1,386 / 1,360 / 24 / 2** | 24 vs 24：**NO_DIFF** |

- 门禁归一/还原：before `i/lf w/crlf` → 归一 `w/lf` → 还原 `w/crlf`；还原后 `git status`/`git diff` 对该目录
  均为空（`segment2/knownred-gates-normalize.txt`，restore-rc=0）。本次**未触发** git-shell-acl 原生崩溃，
  无需复跑。
- 编排采用任务允许的「137 文件 + 单文件」拆分口径（git-trunk-store 为本环境已知挂起/原生崩溃文件）；
  137 文件主跑 141s 内无挂起，单文件 13/13；全程 `--test-force-exit`，如实披露。
- 对照源：B0 `04a-knownred-runtime-core-33.txt` / `04b-knownred-gates-5.txt` / `04c-knownred-orchestration-24.txt`；
  本次失败名清单与 diff 见 `segment2/knownred-*-failnames` 抽取源日志与 `knownred-*-diff.json`。

### 10.4 口径与 flake 披露汇总

- 环境：Windows 11 / Node v24.22.1 / bash；本工作树无 `node_modules`，测试期创建目录 junction
  `node_modules → C:\Users\51054\Desktop\work\ans-studio\node_modules`（`require('typescript')` = 7.0.2 可解析），
  全部测试完成后以 `cmd rmdir` 仅移除 junction，主仓库 `node_modules` 完好（`ls` 确认）。
- `--test-force-exit` 仅用于全量桌面与三套 known-red（B0/B4 同口径）；逐文件门槛全部正常退出。
- ADDED=0（全部门槛）；REMOVED=1 为既有 flake 转绿；2 cancelled 与基线同名；无改测试/放宽断言。
- 无新增失败即未触发「可复现新增失败」停止条件。

### 10.5 终检

- `git status --porcelain` 仅：`M app/desktop/session.ts`、`M test/桌面应用/session-structure.test.ts`、
  `?? app/desktop/session/card-gateway.ts`、`?? app/desktop/session/cards/`、
  `?? app/desktop/session/run-change.ts`、`?? 角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b5-cards-run-change.md`、
  `?? …_cards-run-change_evidence/`；无 `node_modules` junction（已移除）、无临时目录、无构建产物。
- `app/desktop/session.ts` **6,954 行**（≤ 起点 9,118，已下降）；模块行数：cards.ts 1,477 /
  version-decisions.ts 819 / acceptance-facts.ts 440 / run-change.ts 494 / card-gateway.ts 97。
- 第一段语义核对表（`…_evidence/semantics-check.md`）保持完整、未改动；本段仅追加记录与 `segment2/` 证据。
- 本段未 commit/push/tag/CI，未读 `.env`，未占 9222/9223/9224，未启动 Electron/真实模型。
