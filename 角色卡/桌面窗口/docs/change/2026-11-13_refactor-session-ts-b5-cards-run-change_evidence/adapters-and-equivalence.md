# B5 适配清单与逐行等价论证（cards 43 + run-change 9）

- 源：`git show HEAD:app/desktop/session.ts`（9970c3d = origin/main，含 B0–B4；9,118 行）
- 目标：`app/desktop/session/cards/{cards,version-decisions,acceptance-facts}.ts`、`app/desktop/session/run-change.ts`、`app/desktop/session/card-gateway.ts`
- 逐字证明：`moved-methods.json`（52/52 归一化逐字节相等、方法体 sha256 相等、门面薄委托存在）

## 1. 模块类外壳（与 B1–B4 同款）

每个模块以一个类（`Cards` / `VersionDecisions` / `AcceptanceFacts` / `RunChange`）重建原 `SessionManager` 的
`this` 面：方法文本整段搬移（含 JSDoc），类内以同名字段/访问器/委托提供方法体读取的一切成员。**唯一
方法体文本适配**见 §3；其余方法体（条件、顺序、await 时序、错误码、返回值）零改动。

## 2. 端口/状态注入（两阶段装配；构造期零副作用）

### 2.1 状态单 owner（方案 §3.6）

| 模块 | 字段（创建点 = 模块构造器） | 门面兼容访问器 |
| --- | --- | --- |
| `Cards` | planEscalations、planEscalationPrompted、requestNotifiedKeys、requestPresentedKeys、versionDecisionPending、versionDecisionChains、runChangeAutoPrompted（`Cards.state`） | 同名 getter → `this.cards.state.*`（无第二份状态） |
| `RunChange` | runStopGeneration、fencedRunTasks、fencedRuns、runStopFacts、controllerStopFacts、controllerDisposalOwners、deferredRunChanges、runChangeOperations（`RunChange.state`） | 同名 getter/setter → `this.runChange.state.*` |
| `RunChange` | inventoryPublicationErrors、observedInventoryRoots | 同名 getter → `this.runChange.state.*`；`inventoryState` getter → `this.runChange.inventoryState` |

- `observedInventoryRoots`/`inventoryPublicationErrors` **同一 Set/Map 实例**经 `SessionInventoryState` 被
  `shared/inventory.ts`（`inventoryChanged`/`publishDeliveryInventory`）与 `Delivery`（B4 状态面）使用；
  门面构造 `Delivery` 时传入 `this.observedInventoryRoots`/`this.inventoryPublicationErrors` 访问器（同一实例）。
- `VersionDecisions` 经 `Cards` 实例读写 `versionDecisionPending`/`versionDecisionChains`（`cards.state` 同一实例），
  不复制状态。
- 物理面兼容：`chief-workflow.test.ts:2457/2414` 结构化 cast 的 `runStopFacts.set`、`fixed-path-routing.test.ts:532`
  的 `fencedRunTasks.set/delete`、`stop()` 的 `manager.runChangeOperations.values()`、`disposeEntry` 的
  `this.deferredRunChanges`/`this.runChangeOperations` 全部经门面同名访问器读写同一对象（门面零直接状态）。

### 2.2 端口（门面构造时注入箭头；只在运行期调用）

| 模块 | 端口 | 注入实现（门面） |
| --- | --- | --- |
| `Cards` | `findLiveRuntime` / `activeRuntimeFor` / `enqueueDelivery` / `drainQueue` | 门面同名薄委托（diagnostics/delivery；B5 未迁出） |
| `Cards` | `FixedCardHooks.prepareFixedAppointmentCardRequest` / `recordFixedCardWorkflowResolution` | 门面同名薄委托（fixed-workflow；B6 迁出后改指模块） |
| `VersionDecisions` | `findLiveRuntime` | 门面同名薄委托 |
| `RunChange` | `deliveryQueuePersistenceFacts` | 门面同名薄委托（delivery/store） |
| `Cards` | `Evidence` 实例（L1，白名单） | 门面构造的同一 `Evidence` 实例（`collectFixedProposalDocumentRefs`） |
| `RunChange` | 跨实例协调 | `shared/inventory.ts` 的**同一管理器注册表**（`desktopSessionManagers`），结构化 `RunChangePeer` 视图 |

- `card-gateway.ts`：`CardGateway`（presentAppCard/withRequestLifecycle/offerRunChangeOnFrozenContract/
  reportPlanEscalation）、`FixedCardHooks`、`ControllerStopPort` 端口形状；门面构造 `cardGateway`/`controllerStopPort`
  实例（B6/B7 的 fixed-workflow/lifecycle 经此使用；B5 无其他消费者）。
- 参数逐位原样转发、返回原样返回；端口只在方法体内调用（构造期不触发）——两阶段装配与 B1–B4 同款。

### 2.3 构造顺序

`evidence → persistence → sessionEnv → runChange → delivery → tasks → diagnostics → acceptanceFacts → cards →
versionDecisions → cardGateway/controllerStopPort`。

论证：`runChange` 必须先于 `delivery`（`Delivery` 构造读取 run-change 单 owner 的 inventory 两实例；同
Set/Map 引用）；`cards` 依赖 `evidence` 与 `acceptanceFacts`；`versionDecisions` 依赖 `cards`。所有构造器只
存引用/箭头，无运行期调用。

## 3. 记录化文本适配（源与目标同规则归一化后逐字节相等）

1. **可见性**：声明行 `private ` 前缀移除（模块内 public 仅为门面委托可调用；不进入公开导出面；门面侧
   `SessionManager` 方法可见性/签名逐字不变）。
2. **内联 import 深度**：`enrichAcceptanceJudgeContext` 的 `import("../../src/model/runtime.ts")`（类型位置）
   → `import("../../../../src/model/runtime.ts")`（模块目录深两层；同一模块）。
3. **局部 Map 键类型**：`ownedRunStopMembers` 的 `new Map<SessionManager, …>` → `new Map<RunChangePeer, …>`。
   L2 run-change 不可导入门面类（循环）；`RunChangePeer` 是门面实例的结构化编译期视图（字段/方法逐一对应，
   运行时为同一 `SessionManager` 对象）。方法体行为不变：`groups` 的键仍是真实管理器实例。
4. **定位注释（不参与方法体）**：run-change 的 `ownedRunStopMembers`/`executeOwnedRunStop`/`resumeDeferredRunChanges`
   声明前各有一行注释注明原 `private` 声明文本，使 `chief-workflow.test.ts:2521-2522` 的
   `slice("private ownedRunStopMembers", "private async executeOwnedRunStop")` 顺序钉在
   `readSessionModule("run-change")` 上仍能定位真实方法体；**测试与聚合读取器零改动**，断言语义不变。

## 4. 行为等价要点（R4/R5 对应）

- **run 停止栅栏时序**：`selectRunChangeForHandle` 的 fence 段（写 fencedRunTasks/fencedRuns → runStopFacts →
  inventoryChanged）逐字保留；`executeOwnedRunStop` 的 stopAndInspect → disposeObservedHandle → eventConsumerDone
  → disposeEntry → claims/commits → finishStopPersistence → finalizeRunChange 顺序逐字保留（方法体 sha 相等）。
- **deferred run-change**：`deferredRunChanges` 键、`resumeDeferredRunChanges` 的 settle 后微任务续跑、取消分支
  逐字保留；`consume`（B7 未迁出）经门面同名委托调用同一实现。
- **控制权停止**：`stopExactController` 的 lease 获取/结束、controllerDisposalOwners 增删、四项 fence 事实、
  `ownsControllerDisposal` 校验顺序逐字保留（`Map<SessionManager`→`Map<RunChangePeer` 仅编译期）。
- **版本决策**：check-then-set 串行链（versionDecisionChains gate/tail）与 `decision-pending` 语义、executing →
  executed/uncertain 审计、restore 对账（F5/孤儿排除/幂等）逐字保留。
- **申请生命周期**：created → approval.created → presented → resolved 的 `.then` 接力、abort 竞争、晚到答案丢弃、
  呈现不等待落盘的同步 `raw` 调用顺序逐字保留。
- **`@决策` 顺序**：`app/desktop/customer-input.ts` **零改动**（`tryApplyDirectiveDecision(entry)` 先于
  `isChiefBusinessCard(entry)` 的消费顺序原样）；`directive-decision`/`customer-authorization-plane-integration`
  回归绿；桌面方法内 `directiveIdFromOperatorId` 归属解析（先于 judge/customer）哈希相等。
