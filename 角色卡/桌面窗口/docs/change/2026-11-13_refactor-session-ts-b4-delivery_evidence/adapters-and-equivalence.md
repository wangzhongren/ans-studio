# B4 适配清单与行为等价论证（delivery：queue 20 方法 / store 7 方法）

- 角色：桌面窗口；工作树 `.claude/worktrees/refactor-session-ts-b4`（分支 `refactor/session-ts-b4`）
- 源：`git show HEAD:app/desktop/session.ts`（e9d5783 = origin/main，含 B0–B3，10,252 行）
- 方案：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §3.2/§3.3/§3.6/§4.2/§4.3/§5 B4/§6.2 R2、附录 A delivery 组
- 逐方法证据：`moved-methods.json` / `moved-methods-summary.md`（27/27 归一化逐字节相等、27/27 方法体 sha256 相等、27/27 门面委托存在）

## 1. 模块类外壳与唯一文本适配（逐字搬运）

- 新增 `app/desktop/session/delivery/queue.ts`（`class Delivery`，20 方法）与
  `app/desktop/session/delivery/store.ts`（`class DeliveryStore`，7 方法）。方法文本（签名+JSDoc+方法体）
  自 HEAD 源**逐字节复制**；类外壳以同名成员重建原 `this` 面（下方 §3–§8），条件、错误码、文案、
  返回值与语句顺序零改动。
- 唯一逐字节差异（已在 `moved-methods.json.adaptations` 记录并由归一化 sha256 证明）：
  1. **可见性**：声明行 `private ` → 模块内 public（门面委托/同模块调用需要；公开导出面与门面侧可见性不变）。
  2. **内联 import 深度**：`queueDirectNotification` 签名里的
     `Extract<import("../../src/model/trunk.ts")…>` → `import("../../../src/model/trunk.ts")`
     （模块目录深一层；同一模块，纯类型位置，无运行时差异）。
- 无方法需要 `this.` → `ctx.` 之类的 receiver 改写：外壳提供同名成员，方法体逐字保留
  （这正是 27/27 归一化 sha 相等的含义）。

## 2. 状态单 owner（delivery）与门面同一实例访问器（方案 §3.6 / §4.3）

- 19 个字段的**唯一声明与创建点**在 `Delivery` 构造器（`queue.ts` `DeliveryState`，`this.state = { … }`）：
  `deliveryQueues`、`drainChains`、`drainClaimRecords`、`deliveryStopVersion`、`deliveryStoppedAll`、
  `stoppedDeliveryKeys`、`resumedDeliveryKeys`、`deliveryKeyStopVersions`、`activeDeliveries`、
  `deliveryQueueStorePath`、`deliveryPersistOutcome`、`deliveryPersistChain`、`deliveryPersistSeq`、
  `deliveredDeliveryKeys`、`deliveredAppTaskIds`、`deliveryStoreArmed`、`suDeliveryBlockedNoted`、
  `taskDeliveryCommits`、`taskHandbackCommits`。
- `DeliveryStore` 通过**同一 state 对象**读写其子集（`DeliveryStoreState` 为结构子集，`DeliveryState extends`
  之）；不存在第二份状态。
- 门面不再声明这些字段，改为**同一实例访问器**（`app/desktop/session.ts` 743 起访问器组）：
  - 只读 getter：`deliveryQueues`/`drainChains`/`drainClaimRecords`/`stoppedDeliveryKeys`/
    `resumedDeliveryKeys`/`deliveryKeyStopVersions`/`activeDeliveries`/`deliveryQueueStorePath`/
    `deliveryPersistOutcome`/`deliveryPersistChain`/`deliveryPersistSeq`/`deliveredDeliveryKeys`/
    `deliveredAppTaskIds`/`suDeliveryBlockedNoted`/`taskDeliveryCommits`/`taskHandbackCommits`；
  - get+set 访问器：`deliveryStopVersion`、`deliveryStoppedAll`、`deliveryStoreArmed`
    （门面 `stop()` 的 `++this.deliveryStopVersion` / `= true` 与测试 cast 写入
    `internals.deliveryStoreArmed = true`（`chief-workflow.test.ts:2421`）保持原语法）。
- **B4 期间仍由门面代码原地改写同一对象**（B5–B7 批次随方法迁出后归零；与方案 §4.3「字段保留在门面
  （引用 delivery 的同名状态对象）」同口径）：`disposeEntry`（`activeDeliveries.delete`）、`consume`
  （settled 复位：`deliveredDeliveryKeys.add/delete`、`activeDeliveries.delete`）、`stop`
  （stop 栅栏集合/版本）、`commitHandback`（`taskHandbackCommits.set/delete`）。这些方法体**逐字未动**
  （见 `git diff` 审计：这些区域无 hunk），语义因同一实例引用而完全不变。
- 跨模块**只读**状态经显式引用传入（同一实例，方案 §3.6 归属其他模块）：
  `sessions`（门面）、`lastGovernanceRuntime`（diagnostics）、`lastRoleActivity`、
  `activeDispatchKeys`、`starTaskIds`（shared/tasks-store）、`enqueuedHandbackKeys`（handback）、
  `openChains`（lifecycle，仅 `.size`）、`attemptStates`（persistence，仅一次失败收尾查询）、
  `observedInventoryRoots`/`inventoryPublicationErrors`（run-change，库存发布）。
  其中 `restorePersistedDeliveries` 对 `enqueuedHandbackKeys`/`activeDispatchKeys`/`starTaskIds` 的
  **写入**是原方法体的既有行为，逐字随方法搬移（同一 Set 实例）。

## 3. `DeliverySink` 端口（只暴露「发送」）

```ts
export interface DeliverySink {
  deliver(entry, origin, text, opts?, requiresHandback?, handbackTaskId?, reportedChildren?,
          queuedSystemAssignment?, applicationNotice?, controllerResume?): Promise<void>;
}
```

- 门面构造时注入箭头回调 → 门面 `sendDelivery(...)`（10 个参数**逐位原样转发**；`openInternal` 的
  `selectionVersion` 缺省值等仍由门面/原方法默认参数决定）。
- `Delivery` 内保留同名私有 `sendDelivery(...)` 薄壳（同签名）→ `this.port.deliver(...)`；因此
  `drainQueueUnsafe` 的调用点文本 `await this.sendDelivery(entry, origin, sent.text, sendOptions, …)`
  与源**逐字相同**（见 R2 顺序证据）。端口不含任何队列/状态操作。

## 4. origin / 发送管线方法**不搬**的判定（方案 §3.3）

- 任务清单把 `delivery/origin.ts`（`beginDeliveryOrigin`/`captureDeliveryOrigin`/`trimDeliveryOrigins`/
  `failDeliveryOrigin`/`healStaleOrigin`）列为候选；会话内核对方案 §3.3 的显式再归属：
  「发送管线 7 个方法（`sendDelivery`、`sendFacts`、`begin/capture/trim/failDeliveryOrigin`、`healStaleOrigin`）
  从 delivery 簇归入 **lifecycle**（它们直接读写 `LiveSession`/origin 状态）」，且附录 A 的 delivery 组
  27 方法**不含**这 5 个方法（它们在 lifecycle 组）。
- 结论：**本批不搬、不新建 `delivery/origin.ts`**，保持现状（仍在门面，方法体零改动）。`Delivery`
  经端口调用它们（`healStaleOrigin`/`beginDeliveryOrigin`/`trimDeliveryOrigins`/`failDeliveryOrigin`），
  参数逐位原样转发——与源调用 `this.xxx(...)` 行为一致。`captureDeliveryOrigin`/`sendFacts` 未被
  delivery 方法引用，不涉及。
- 这符合任务给的处置口径（「如你判定它们按 §3.3 属 lifecycle/send 且本批不应搬，停下说明并保持现状」）
  与 R2「`DeliverySink` 只暴露发送」。

## 5. 门面端口（未迁出方法；参数逐位原样转发、返回原样返回）

`DeliveryPorts`（`queue.ts`）→ 门面箭头回调：

| 端口 | 门面实现 | 说明 |
| --- | --- | --- |
| `deliver` | `sendDelivery` | §3 |
| `openInternal(req, userInitiated)` | `openInternal` | 缺省 `selectionVersion` 由原方法默认参数求值（与源调用同） |
| `healStaleOrigin` / `beginDeliveryOrigin` / `trimDeliveryOrigins` / `failDeliveryOrigin` | 同名门面方法 | §4（lifecycle 归属，保持现状） |
| `hasBusyRuntime` / `profileRevision` / `findLiveRuntime` | 同名公开方法 | 纯读 |
| `noteWatchdogActivity` | 同名门面方法 | 观察转发 |
| `inspectFixedHandbackChild` | 同名门面方法 | fixed-workflow 组（B6 再迁） |
| `runTaskIsFenced` | 同名门面方法 | run-change 组（B5 再迁） |
| `isNetworkOffline` | 同名门面方法 | diagnostics 模块薄委托（B3 已迁） |
| `rememberReceipt` / `persistenceScope` / `persistenceKey` | 同名门面方法 | persistence 模块薄委托（B2 已迁） |
| `targetKey` | 同名门面方法 | shared/keys + 只读状态回调（求值时机/次数不变） |
| `managerId` | `this.managerId` | 只读字段（lifecycle 归属） |
| `inventoryState` | `this.inventoryState` getter | 同一 Set/Map 实例 |

`rebuildIfBoundaryStale` **不经端口**：`Delivery` 直接持有已迁出的 `SessionEnv` 实例并调用
`this.sessionEnv.rebuildIfBoundaryStale(roleId, userInitiated)`——与门面薄委托同函数、同缺省参数
（`selectionVersion = this.selectionVersion` 由 SessionEnv 状态回调求值）；delivery L3 → session-env L2
为结构测试白名单允许的显式下层导入。

## 6. shared 同名同义委托（逐个同一函数、同一入参）

`sessionKey`/`queueKey`/`now`/`emitDeliveryNote`/`handbackOwnerRoleId`/`chiefTaskRoleIdOf`/
`roleDisplayName`/`readTasks`/`isFixedTask`/`appendTaskState`/`appendRoleActivity`/
`inventoryChanged`/`publishDeliveryInventory`/`contextInfo` — 全部经 `shared/*` 导入（B1 已迁出的同一
实现）；`deps` 切片 `Pick<SessionManagerDeps, "emitEvent"|"emitRoleState"|"getListing"|"refreshListing"|"now"|"demoRuntimeAutoDeliver">`
以**同一 deps 对象**传入，调用形式（`this.deps.emitRoleState?.(…)`、`this.deps.demoRuntimeAutoDeliver === false`）不变。

## 7. `DeliveryStore`（L1）与队列动作端口

- store 只导入 L0（contracts/shared）与外部 src（结构测试白名单 `[]` 强制）。
- store 需要的队列动作经 `DeliveryStorePorts` 注入（`Delivery` 构造时以箭头回调接回**本类**方法）：
  `enqueueDelivery`（`restorePersistedDeliveries` 复用既有入队路径）、`drainQueue`（恢复后自动重投）。
  另有 `managerId`（只读）与 `inventoryState`（库存发布）。
- `persistDeliveryQueues`/`deliveryQueuePersistenceFacts`/`finishStopPersistence`/`restorePersistedDeliveries`/
  `persistableDeliveryItem`/`deliveryStoreItems`/`parsePersistedDeliveryItem` 由 `Delivery` 公开同名薄委托
  → store；门面再薄委托 → `Delivery`（B1–B3 的「同名同义委托」同款）。`Delivery` 内部对
  `this.persistDeliveryQueues()` 的调用点（入队/认领/收尾/撤回/停止复位…）文本与时机零改动。
- 原子写/恢复顺序逐字保留（`persistDeliveryQueues` 的 seq/chain/outcome 三段、`restorePersistedDeliveries`
  的 ENOENT 武装/坏文件诊断/逐条重校验/去重/自动 drain 全序列）。

## 8. 装配顺序调整（两阶段装配，运行期才调用端口）

- 构造顺序由「evidence → persistence → tasks → diagnostics → sessionEnv」调整为
  「evidence → persistence → **sessionEnv → delivery** → tasks → diagnostics」。
- 论证：B1–B3 各模块构造器只保存引用/箭头回调（无副作用、无 I/O、无事件发射、无端口调用）；
  Delivery 需要 sessionEnv 实例（§5），tasks/diagnostics 需要 delivery 状态实例（同一对象）。
  所有端口箭头只在运行期调用（「两阶段装配」方案 §3.1 第 6 条），构造期行为与迁移前一致
  （结构测试工具面快照 7 角色逐字相同；全部套件通过）。
- 门面 `deliveryQueueStorePath` 字段声明/赋值删除：路径改由 `deps.deliveryQueueStorePath` 直接传入
  `Delivery` 构造器（同一值、同一时点；门面保留同名只读访问器）。

## 9. 常量与导入适配

- `MAX_DELIVERED_APP_TASK_IDS = 1024`（唯一使用方 `rememberAppTaskDelivered`）随方法迁入 `queue.ts`；
  会话内无其他引用、无测试源码钉（已 grep 核实）。
- `APP_TASK_CLIENT_MESSAGE_ID_PREFIX` / `isAppTaskClientMessageId` 从 `shared/text.ts` 导入（单一来源）。
- `mainT` 从 `../../i18n.ts` 导入（B3 模块同款）；外部 src 导入相对深度按模块目录调整为 `../../../../src/…`。
- session.ts 中仅被搬出方法使用的导入**未清理**（与 B3 同口径：`noUnusedLocals` 未开启，避免删改导入
  带来的审计噪声）。

## 10. 计时器 / 事件循环

- 27 个方法体内 `setTimeout`/`setInterval`/`setImmediate`/`.unref(` 出现次数 = 0（源与目标端 grep 均为空，
  见 `timers-check.txt`）。本批不新增/不删除任何定时器或微任务边界；`drainQueueUnsafe` 的
  `void (async () => { … })().catch(…)` 分离续段逐字保留。

## 11. R2 逐条对照（不变量 / 证据 / 结论）

| # | 不变量 | 证据 | 结论 |
| --- | --- | --- | --- |
| 1 | 状态单 owner（delivery 19 字段） | `queue.ts` `DeliveryState` 唯一创建（146–170）；门面仅同一实例访问器（session.ts 741–775）；`DeliverySink` 仅 `deliver`（queue.ts）；store 用同一 state 对象 | ✅ |
| 2 | `entry.busy = true;` 先于 `await sendDelivery(...)` | 模块：`queue.ts:1096` < `queue.ts:1133`；门面直接 send：`session.ts:4032` < `session.ts:4043`；`message-queue.test.ts` 顺序钉逐字未动并 20/20 通过 | ✅ |
| 3 | 认领段语义（shift → 置忙 → 登记 activeDeliveries → 取 send promise 后立即释放链） | `drainQueueUnsafe` 方法体 sha256 与源相等；认领段同步序：claim.start(1031) → shift(1053) → 置忙(1096) → busySince → activeDeliveries.set(1099) → persist → start(1101) → IIFE(1114，同步执行至 sendDelivery 挂起)；`drainChains` 释放仍由 `drainQueue` finally/链尾完成（方法体未动） | ✅ |
| 4 | settled 复位、`taskHandbackCommits`/`taskDeliveryCommits` 屏障逐字保留 | `consume`/`commitHandback`/`disposeEntry` 区域 `git diff` 无 hunk（文本逐字未动）；屏障 Map 为同一实例（访问器）；`handback-delivery` 16/18 与 `turn-lease` 4/4、`replay-safe-retry` 4/4 通过（失败名与干净 HEAD 逐名一致） | ✅ |
| 5 | 方法体归一化 sha256 相等 | `moved-methods.json`：27/27 `identicalUnderDocumentedAdaptations` + `bodyIdentical` = true；不可机械处（端口/状态注入）论证见 §3–§8 | ✅ |

## 12. 其余与方案 §4.2「搬运保真」的对齐

- 连续代码块切割：27 个方法按源顺序整体剪切（含 JSDoc），无重排、无重写条件。
- 门面委托：公开方法保持原签名/可见性；私有方法保留同名 private 薄委托（B3 同款）；
  `drainQueueUnsafe` 等纯内部方法也保留 delegate 以满足「同名同签名同可见性」审计。
- `git diff -M` 审计：session.ts 仅 1 个文件 +154/−1,288（净 −1,134），hunk 全部落于字段/方法删除与
  构造器/访问器接线；structure test 仅预算常量/注释/标题数字（+8/−6）。
