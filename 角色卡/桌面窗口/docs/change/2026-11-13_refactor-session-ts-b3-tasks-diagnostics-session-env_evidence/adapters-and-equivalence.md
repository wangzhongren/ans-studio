# B3 适配与行为等价论证（45 方法 → tasks / diagnostics / session-env）

- 日期：2026-11-13
- 角色：桌面窗口
- 方案：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §3.3 / §3.6 / §5 B3、附录 A
- 源：`git show HEAD:app/desktop/session.ts`（c616280；blob `ab0022cd5cfa0b88eeea22458865c479634a96f7`，11,756 行）

## 1. 搬移形态：模块类外壳（B1/B2 同款）

三个模块各以 `export class Tasks` / `Diagnostics` / `SessionEnv` 重建原 `SessionManager` 的 receiver 面，
使 **45 个方法文本（签名+方法体+JSDoc）逐字节保留**。逐方法 sha256 见 `moved-methods.json` /
`moved-methods-summary.md`：`allMethodsIdenticalUnderDocumentedAdaptations=true`、
`allMethodBodiesIdentical=true`（45/45）。

唯一文本适配：原 `private` 方法在模块内改为 public（仅门面委托可调用；不进入公开导出面）；
门面侧 **同名同签名同可见性** 的薄委托逐字保留（签名与 HEAD 逐字比对 45/45 相等），
既有类内/测试调用点零改动。

## 2. 状态归属（方案 §3.6；B3 暂留门面，同一实例引用）

| 模块 | 状态面（构造时注入；同一 Map/Set/Array 实例引用） |
| --- | --- |
| tasks | `sessions`、`deliveryQueues`、`activeDeliveries`、`lastGovernanceRuntime`、`starTaskIds`、`activeDispatchKeys`、`escalationRequests`、`lastRoleActivity`（后两者可写：`Map.get/set`、`Set.add`） |
| diagnostics | `sessions`、`deliveryQueues`、`activeDeliveries`、`openChains`、`rebuildChains`、`lastGovernanceRuntime`、`lastRoleActivity`、`lastTurns`、`lastAssistantText`、`governanceHandbackMirrored`、`governanceClientProjections`；`networkState` 以 **get/set 访问器**接回门面字段（`applyNetworkState` 的赋值仍落在原实例字段）；`activeRoleId` 只读 |
| session-env | `sessions`、`rebuildChains`（可写）、`installationRefusals`（可写数组：push/shift）；`selectionVersion`/`boundaryRefreshVersion`/`activeRoleId` 以 get 访问器、`activeRoleId` 另有 set 访问器（`rebuildIfBoundaryStaleUnsafe` 的 `this.activeRoleId = roleId` 仍写入门面字段） |

**多实例等价**：模块实例每个 `SessionManager` 构造一份；状态对象在构造时以箭头回调/同一实例引用注入，
模块不持有任何模块级可变状态（除 shared 既有单例与 diagnostics 的纯常量）。跨实例隔离性与迁移前一致。

## 3. 同名同义委托（shared/*，与门面同名委托调用同一函数、同一入参）

- tasks：`sessionKey`、`queueKey`、`now`、`readTasks`、`rememberTaskCreator`、`appendTaskState`、
  `recordTaskFailure`（`() => this.now()` 时钟回调）、`appendRoleActivity`（同一 `lastRoleActivity` +
  时钟回调）、`roleDisplayName`、`chiefTaskRoleIdOf`、`emitDeliveryNote`（同一 deps）。
- diagnostics：`sessionKey`、`queueKey`、`now`、`handbackOwnerRoleId`、`chiefTaskRoleIdOf`、
  `findListingForFeedback`、`resolveProofFlowIds`、`roleDisplayName`、`refreshListingNow`、`contextInfo`、
  `emitDeliveryNote`。
- session-env：`sessionKey`、`filePrint`（shared/text）、`now` 未使用。

`now` 最终仍为 `deps.now ? deps.now() : Date.now()`（shared/clock.ts 单一实现），与门面 `now()` 逐字同语义。

## 4. 端口（B3 未迁出的门面方法；箭头回调，参数逐位原样转发、返回原样返回）

- tasks → `restoreRequestState`、`restoreVersionDecisions`、`findLiveRuntime`、`enqueueDelivery`、
  `drainQueue`、`appDispatchClientMessageId`、`stopExactController`、`ensureFreshRoleSession`、
  `withRequestLifecycle`。
- diagnostics → `openBackground`、`sendBackground`、`notifyRoleState`、`drainAllQueuesFor`、
  `drainQueue`、`enqueueDelivery`。
- session-env → `disposeEntry`、`hasBusyRuntime`、`openInternalUnsafe`、`profileRevision`、
  `rebuildSession`、`isCustomerInitiatedTurn`、`watchdogDeliver`（B3 同批迁入 diagnostics；同层
  经门面上行，结构测试白名单不变）。

## 5. 常量/导入适配

1. **`CAPABILITY_INSTALL_SYSTEM_PREFIX`**：定义随 `applySkillChange`/`applyMcpChange` 迁入
   `session-env.ts`（含原 JSDoc），`session.ts` 改为 `export { ... } from "./session/session-env.ts";`；
   公开导出面（51 符号）与冻结值 `"[系统·安装]"` 不变（结构测试 8/8）。
2. **diagnostics 专用常量**（仅被本批方法使用）：`GOVERNANCE_HANDBACK_MIRROR_DEDUPE_MS`、
   `GOVERNANCE_CLIENT_PROJECTION_LIMIT`、`GOVERNANCE_CLIENT_PROJECTION_TTL_MS`、`PROOF_STATUS_TEXT`
   连同 JSDoc 迁入 `diagnostics.ts`；session.ts 不再保留副本。
3. **`GOVERNANCE_SLUG_RE`**：session.ts 仍被 cards 方法使用，保留原定义；`tasks.ts` 以同一单一来源
   `GOVERNANCE_SLUG_PATTERN` 构造本地同名正则（无 flags/g 状态，纯判定等价）。
4. **session.ts 死导入未清理**：为保证搬运审计面最小，仅被搬出方法使用的导入保留在 session.ts
   （`noUnusedLocals` 未开启，不影响 typecheck）；不构成行为差异。
5. `rebuildIfBoundaryStale` 的默认参数 `selectionVersion = this.selectionVersion` 在门面与模块各保留
   一份：门面委托缺省时先求值再显式传入；模块内调用（`refreshStaleBoundaries`）缺省时经模块 getter
   读取门面同一字段。求值时机/次数与原实现一致。

## 6. 计时器/看护回调语义

本批方法体内**没有任何 setInterval/unref/setImmediate**；HEAD 的 5 处 `setTimeout` 中恰 1 处
（`terminateRoleRun` 的 5000ms abort 竞速上限）随方法逐字迁入 `tasks.ts`，其余 4 处与唯一看护
`setInterval` 留在 session.ts 未动。`watchdogSnapshot`/`watchdogDeliver` 为同步纯读/入队，不新增
计时器、不改 unref/dispose 时机。证据：`timers-check.txt`。

## 7. 行为等价结论

- 方法文本逐字节等同（仅声明行可见性前缀适配）；条件、顺序、错误码、文案、返回值零改动。
- 所有跨模块访问经由**同一对象实例**（状态）、**同一函数/同一 deps**（shared 委托）或**逐位转发的
  门面方法**（端口），无第二份状态、无复制逻辑。
- 失败隔离/吞错边界（`try/catch`、`void` fire-and-forget、诊断错误吞掉）均在方法文本内原样保留。
