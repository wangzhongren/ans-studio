# B4：session.ts 投递队列（delivery 27 方法迁出 + 单 owner 状态 + 首线/全量验证）——第一、二段完成

- 日期：2026-11-13
- 角色：桌面窗口
- 工作树：`.claude/worktrees/refactor-session-ts-b4`（分支 `refactor/session-ts-b4`）
- 起点：`e9d5783`（= origin/main，含 B0–B3；`app/desktop/session.ts` 10,252 行）
- 方案：`docs/planning/2026-11-13_refactor_session-ts_plan-v1.md` §3.2/§3.3/§3.6/§4.3/§5 B4/§6.2（R2）、附录 A delivery 组
- 范围：**B4 第一段**——投递模块搬运（`delivery/queue.ts` 20 方法 + `delivery/store.ts` 7 方法）、
  19 字段单 owner 化、`DeliverySink` 端口接回门面、首线验证。**第二段**（本地全量桌面套件 / 三套
  known-red 逐名 diff / 打包冒烟）见 §10（已完成）。
- R2 硬条件与逐行等价论证：`…_evidence/adapters-and-equivalence.md`；27 方法 sha 证明：
  `…_evidence/moved-methods.json` / `moved-methods-summary.md`。

## 1. 结果摘要

| 项 | 值 |
| --- | --- |
| `app/desktop/session.ts` 行数 | **10,252 → 9,118**（-1,134；git numstat +154/−1,288） |
| 搬出方法 | **27 个**（queue 20 / store 7），逐个含 JSDoc 逐字节搬移 |
| 逐字移动证明 | **27/27 归一化逐字节相等；27/27 方法体 sha256 相等；27/27 门面薄委托存在** |
| 新增模块 | `session/delivery/queue.ts` 1,276 行（`class Delivery`）、`session/delivery/store.ts` 423 行（`class DeliveryStore`；均 ≤1,500） |
| 状态归属 | 方案 §3.6 delivery **19 字段**由 `Delivery` 单 owner 声明/创建（`DeliveryState`）；门面仅同一实例访问器 |
| `DeliverySink` | 仅 `deliver(...)`（10 参数逐位转发 → 门面 `sendDelivery`）；端口无队列/状态操作 |
| 公开导出面 | 运行时 6 值 + 类型 45 **逐字不变**（结构测试 8/8） |
| 模块边界 | queue L3 白名单导入 `delivery/store`（L1）/`session-env`（L2）/L0；store L1 白名单 `[]`；导入图无环 |
| typecheck | **EXIT=0** |
| 结构预算 | `SESSION_TS_FROZEN_BASELINE_LINES` 11,756 → **10,252**（仅常量/注释/标题数字；实测 9,118） |
| 首线验证 | message-queue **20/20**（顺序钉逐字未动）、queue-visibility 2/2、replay-safe-retry 4/4、abort-unwedge 3/3、turn-lease 4/4；handback-delivery **16/18**（2 项既有、与干净基线逐名一致） |
| 钉子抽查 | message-queue/boundary-refresh/chief-workflow/directive-input 与干净 e9d5783 基线**失败名逐名一致（NO_DIFF）**；其余 10 个钉子全过/既有失败名不变 |

## 2. 27 方法 → 模块清单（HEAD 源行 · 目标行）

| 模块 | 方法 |
| --- | --- |
| `session/delivery/queue.ts` | `deliveryIsStopped`（761 · 262）、`deliveryLifecycle`（764 · 267）、`resumeDelivery`（767 · 272）、`queueDirectNotification`（1651 · 277）、`forceResetDeliveryState`（4094 · 297）、`appTaskClientMessageId`（6151 · 353）、`appTaskClientMessageIdFromSeed`（6159 · 362）、`appDispatchClientMessageId`（6165 · 369）、`rememberAppTaskDelivered`（6171 · 376）、`pendingAppTaskDelivery`（6182 · 388）、`enqueueDelivery`（6199 · 406）、`withdraw`（6521 · 428）、`notifyRoleState`（6572 · 480）、`broadcastRoleStates`（6624 · 533）、`redeliverNudge`（9422 · 541）、`drainAllQueuesFor`（9563 · 582）、`drainPiQueuesAcrossProjects`（9576 · 596）、`waitForRunStopDeliveryClaims`（9586 · 607）、`drainQueue`（9617 · 639）、`drainQueueUnsafe`（9643 · 666） |
| `session/delivery/store.ts` | `persistableDeliveryItem`（6222 · 118）、`deliveryStoreItems`（6254 · 151）、`deliveryQueuePersistenceFacts`（6276 · 174）、`finishStopPersistence`（6283 · 182）、`persistDeliveryQueues`（6295 · 195）、`parsePersistedDeliveryItem`（6324 · 225）、`restorePersistedDeliveries`（6400 · 302） |

说明：`persistableDeliveryItem`/`deliveryStoreItems`/`parsePersistedDeliveryItem` 为 store 内部方法（门面保留
同名薄委托以满足「同名同签名同可见性」审计）。

## 3. 结构预算收紧

`test/桌面应用/session-structure.test.ts`：

```diff
-const SESSION_TS_FROZEN_BASELINE_LINES = 11756;
+const SESSION_TS_FROZEN_BASELINE_LINES = 10252;
```

同步更新该常量上方注释（B4 起点实测 10,252）、文件头第 3 条说明与测试标题中的旧数字；
断言条件/消息模板/白名单/层次表逐字未动。最终实测 9,118 ≤ 10,252。

## 4. 适配清单与行为等价论证

完整版（含 R2 逐条对照表）：`…_evidence/adapters-and-equivalence.md`。要点：

1. **模块类外壳**（`class Delivery` / `class DeliveryStore`）：同名成员重建原 `this` 面；方法文本（签名+
   JSDoc+体）逐字节搬移；唯一文本适配 = `private` → 模块内 public + `queueDirectNotification` 内联
   `import("…src/model/trunk.ts")` 深度调整（纯类型位置）；27/27 归一化 sha 相等。
2. **状态单 owner**：19 字段唯一创建于 `Delivery` 构造器；`DeliveryStore` 用同一 state 对象；门面仅有
   同一实例 getter（`deliveryStopVersion`/`deliveryStoppedAll`/`deliveryStoreArmed` 另带 setter，因门面
   `stop()` 与测试 cast 写入保持原语法）。B4 期间 `disposeEntry`/`consume`/`stop`/`commitHandback`
   仍原地改写同一对象（方案 §4.3 口径；这些方法体逐字未动，diff 无 hunk），B5–B7 随方法迁出归零。
3. **`DeliverySink` 只暴露发送**：门面构造时注入箭头 → `sendDelivery`（10 参数逐位转发）；`Delivery`
   保留同名私有 `sendDelivery` 薄壳，认领段调用点文本与源逐字相同。
4. **origin/发送管线 5+2 方法不搬**：按方案 §3.3 显式再归属 lifecycle，保持现状（仍在门面，零改动）；
   delivery 经端口调用 4 个 origin 方法，`captureDeliveryOrigin`/`sendFacts` 未被引用。任务允许此判定。
5. **端口**：`openInternal`/`hasBusyRuntime`/`profileRevision`/`findLiveRuntime`/`noteWatchdogActivity`/
   `inspectFixedHandbackChild`/`runTaskIsFenced`/`isNetworkOffline`/`rememberReceipt`/`persistenceScope`/
   `persistenceKey`/`targetKey`/`managerId`/`inventoryState` 全部箭头回调、参数逐位原样转发；
   `rebuildIfBoundaryStale` 直接经已迁出的 `SessionEnv` 实例调用（白名单内下层）。
6. **shared 同名同义委托**：14 个 shared 函数经同名成员调用同一实现；deps 切片含
   `emitEvent/emitRoleState/getListing/refreshListing/now/demoRuntimeAutoDeliver`。
7. **构造顺序调整**：evidence → persistence → **sessionEnv → delivery** → tasks → diagnostics。
   论证：模块构造器零副作用（只存引用/箭头）；端口只在运行期调用（两阶段装配）；
   工具面快照 7 角色逐字不变、全部套件通过。
8. **常量/导入**：`MAX_DELIVERED_APP_TASK_IDS` 随方法迁入 queue.ts（无其他引用/源码钉）；
   `APP_TASK_CLIENT_MESSAGE_ID_PREFIX` 等仍从 shared/text 单一来源导入；session.ts 死导入未清理（B3 同口径）。
9. **计时器**：27 方法体零 `setTimeout/setInterval/setImmediate/.unref`。

## 5. 首线验证结果（第一段）

| 门槛 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npm run typecheck` | **EXIT=0** |
| 结构保护 | `node --test test/桌面应用/session-structure.test.ts` | **8/8**（导出面 51；导入图无环/分层/白名单；体量 9,118 ≤ 10,252；工具面快照 7 角色） |
| 聚合读取器 | `node --test test/桌面应用/session-source.test.ts` | **5/5** |
| 顺序钉 | `node --test test/桌面应用/message-queue.test.ts` | **20/20**（`entry.busy = true;` 先于 `await this.sendDelivery(...)`；测试/聚合器零改动） |
| 队列可见性 | `queue-visibility.test.ts` | 2/2 |
| 重放安全 | `replay-safe-retry.test.ts` | 4/4 |
| 解楔 | `abort-unwedge.test.ts` | 3/3 |
| 回交投递 | `handback-delivery.test.ts` | **16/18**（2 项既有失败，与干净基线逐名一致；见 §6） |
| 轮次租约 | `turn-lease.test.ts` | 4/4 |
| 钉子·boundary-refresh | 单文件 | 14/14 |
| 钉子·directive-input | 单文件 | 19 tests / **14 pass / 5 既有失败**（逐名同基线） |
| 钉子·chief-workflow | 单文件（`--test-force-exit`，本机口径，baseline/final 同口径） | 66 tests / **58 pass / 8 既有失败**（W5/W10/W19/W33/W34/commit-race/required/selected；逐名同基线） |
| 钉子·evidence-markers / queue-status / request-status | 单文件 | 1/1、5/5、4/4 |
| 钉子·dispatch-fresh-enum / hot-path / interface / run-change-entry | 单文件 | 2/2、3/3、8/8、5/5 |
| 钉子·g1-copy-and-nails / h-scope-audit / governance-matrix | 单文件 | 5/5、7 tests 4 pass / **3 既有失败**（逐名同基线）、18/18 |
| 追加（§5 B4 清单内、低风险） | `queue-withdraw-lru` / `b101-*` / `b111-*` | 5/5、11/11、5/5 |
| 追加·冒烟 | `session.test.ts`（B1 门槛文件） | 7 tests / **6 pass / 1 既有失败**（AC-8 doc-format 索引字节 pin；干净 e9d5783 基线逐名相同，与 delivery 无关） |
| 追加·冒烟 | `test/测试/g4-skill-verify/e-handler.test.ts`（cast 直注 `activeDeliveries` 的私有面用例） | 6 tests / **5 pass / 1 既有失败**（护栏矩阵「无轮次」；干净 e9d5783 基线逐名相同）；同文件 cast 写入 `activeDeliveries.set` 的用例通过 ⇒ 访问器物理面可用 |
| 源码顺序核验 | 模块 `queue.ts:1096`（`entry.busy = true;`）< `queue.ts:1133`（`await this.sendDelivery(…`）；门面 `session.ts:4032` < `session.ts:4043` | ✅ |
| 失败名机械比对 | `…_evidence/failure-name-diff.txt` | message-queue/boundary-refresh/directive-input/chief-workflow/handback-delivery **全部 NO_DIFF** |

> 原始日志：`…_evidence/baseline/`（干净 e9d5783 工作树 `.tmp-b4/baseline-wt`）、`…_evidence/final/`。
> 基线工作树为 `git worktree add --detach .tmp-b4/baseline-wt HEAD` 的**只读对照**，不动本工作树；完成后移除。

## 6. 基线披露（干净起点 e9d5783）

- **handback-delivery 2 项既有失败**（任务预期 16/18）：`2026-10-24 trio 回交路由…`与
  `B 星形回交：tasks.jsonl 已知 taskId…`；在**未修改**的干净 e9d5783 工作树复现（same names, 16/18）。
  属既有产品/测试语义漂移，非 B4 引入，不在本批修复范围。
- **钉子既有失败**：directive-input 5、chief-workflow 8、h-scope-audit 3（与 B3 记录同集合；
  本次 baseline 逐名复核）。其余 11 个钉子文件全过。
- **session.test.ts 既有失败 1 项**：`AC-8 预算：索引 5,223 B…`（doc-format 静态索引字节 pin；
  干净 e9d5783 工作树逐名复现，与 delivery 改动无关）。
- **g4 `e-handler.test.ts` 既有失败 1 项**：护栏矩阵「无轮次」用例（干净 e9d5783 工作树逐名复现）；
  同文件「派发轮对抗构造」用例（cast 直写 `activeDeliveries`）通过，验证门面访问器物理面与迁移前等价。
- 本批**零新增失败**：final 与 baseline 的失败名集合逐名 diff 为空（`failure-name-diff.txt`）。

## 7. 偏差说明（与任务/方案不完全一致之处）

1. **`delivery/origin.ts` 未创建、5 个 origin 方法未搬**：方案 §3.3 将发送管线 7 方法显式再归属
   lifecycle/send（B7），附录 A delivery 组不含它们；按任务允许口径「停下说明并保持现状」处理——
   门面原样保留、delivery 经端口调用。**不新建 origin.ts。**
2. **门面「只读 getter」与 B4 期间的门面写**：19 字段均以同一实例访问器暴露；`deliveryStopVersion`/
   `deliveryStoppedAll`/`deliveryStoreArmed` 带 setter（`stop()` 的 `++`/赋值与测试 cast 写入
   `chief-workflow.test.ts:2421` 需保持原语法）。`disposeEntry`/`consume`/`stop`/`commitHandback`
   仍直接改写同一 Map/Set（方案 §4.3 允许「字段保留引用同一对象」，B5–B7 迁出后归零）——
   单 owner 指**唯一状态对象/创建点**，不存在第二份状态。
3. **`Delivery` 额外公开 7 个 store 薄委托**（persistDeliveryQueues/deliveryQueuePersistenceFacts/
   finishStopPersistence/restorePersistedDeliveries/persistableDeliveryItem/deliveryStoreItems/
   parsePersistedDeliveryItem）：store 独立成 L1 模块后，Delivery/门面需同名同义委托（B1–B3 同款）。
   端口形状因此多 `DeliveryStorePorts`（enqueueDelivery/drainQueue/managerId/inventoryState）。
4. **构造顺序调整**（sessionEnv 提前、tasks/diagnostics 后移）：见 §4.7；无副作用。
5. **`DrainClaimRecord` 具名类型**：门面 `drainClaimRecords` 访问器需引用元素形状，从模块导出
   （与源内联形状逐字段相同）。
6. **类名**：`Delivery` / `DeliveryStore`（任务允许「class Delivery/Store 同款外壳」；store 加前缀避免
   与通用名冲突）。
7. **`MAX_DELIVERED_APP_TASK_IDS` 常量迁移**（session.ts 私有常量 → queue.ts；无公开面/测试钉）。
8. **source-pin 说明**：`message-queue` 顺序钉读取 `readSessionModule("lifecycle/send")`，该模块尚未存在，
   **回退读 session.ts**；门面直接 send 路径的 `entry.busy = true;`（4032）先于
   `await this.sendDelivery(entry, origin, text, opts);`（4043）逐字未动 ⇒ 钉子保持绿；**未改测试/聚合器**。
   drain 认领段的同款顺序另在模块内以行号证据核验（§5）。

## 8. 第二段待办（已完成，见 §10）

- 本地**全量**桌面套件（§5 B4 门槛）；三套冻结 known-red（runtime-core 33 / 门禁引擎 5 / 编排 24）逐名 diff；
- 单平台（Windows）release 打包冒烟（方案 §5 B4「本批后建议」）；
- `queue-recovery-e2e`、`network-state-e2e` 等其余 §5 B4 定向套件（首段未跑）；
- 上述全部通过后按流程提交（本段**未** commit/push/tag/CI）。

## 9. 边界声明

- 只改：`app/desktop/session.ts`、`app/desktop/session/delivery/queue.ts`（新）、
  `app/desktop/session/delivery/store.ts`（新）、`test/桌面应用/session-structure.test.ts`
  （仅预算常量/注释/标题数字）、`角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b4-delivery*`。
- 未动：`session/contracts/**`、`session/shared/**`、既有 tasks/diagnostics/session-env/evidence/persistence
  模块、14 个钉子文件、`session-source.ts`、boundary 文件、其他测试/生产代码/角色目录。
- 未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占 9222/9223/9224；未启动 Electron/真实模型。

## 10. 第二段：全量门槛与打包（2026-11-13 完成）

- 执行：同一工作树 `.claude/worktrees/refactor-session-ts-b4`（分支 `refactor/session-ts-b4`，HEAD=`e9d5783`，第一段改动未提交）。
- 证据目录：`…_evidence/segment2/`。原始日志为默认 spec reporter 输出（B0 分段同口径）；`*-failnames.txt` 为机械抽取的失败名清单（口径同 B0 `tools-merge-segments.mjs`：行首 `✖ <name> (<Nms>)`，cancelled 条目亦含）。
- 结论：**零新增失败**；三套冻结 known-red 逐名 diff 全空；Windows 打包 ZIP 产出成功。

### 10.1 临时目录清理

- `.tmp-b4/` 内 8 组 baseline/final TAP 与 `…_evidence/baseline|final/` **逐字节一致（16/16 md5 相同）**，无需重复拷贝。
- 归档仍有留存价值的证据生成脚本（命名清晰）：
  - `…_evidence/tools/moved-methods-sha.mjs`（原 `evidence.mjs`）：27 方法体 sha256/门面薄委托比对，生成 `moved-methods.json` / `moved-methods-summary.md`；
  - `…_evidence/tools/assemble-evidence.mjs`（原 `assemble-evidence.mjs`）：失败名机械对照/汇总生成。
  - 注：`assemble-evidence.mjs` 为一次性脚本，路径引用原 `.tmp-b4/`（已删）；TAP 已归档于 `baseline/`、`final/`，如需复跑改指即可。
- 其余一次性中间物（`session.ts.orig`、`gen-modules.mjs`、`rewrite-facade.mjs`、`extract.mjs`、`refs.json`、`source/*.txt`）为可从 `git show e9d5783:app/desktop/session.ts` 复得的迁移工具输入，随 `.tmp-b4/` 删除。
- `git status` 已无 `.tmp-b4`（约 1.4MB 清理完毕）。

### 10.2 剩余 B4 门槛（逐文件，`node --test --test-timeout=120000`）

| 文件 | 结果 |
| --- | --- |
| `test/测试/queue-recovery-e2e.test.ts` | **2/2**，EXIT=0 |
| `test/测试/network-state-e2e.test.ts` | **6/6**，EXIT=0 |
| `test/桌面应用/message-queue.test.ts` | **20/20**，EXIT=0（顺序钉复跑一致） |
| `test/桌面应用/handback-delivery.test.ts` | **16/18**，EXIT=1；2 项既有失败名与第一段干净基线**逐名一致**（`2026-10-24 trio 回交路由…`、`B 星形回交…`） |
| `test/桌面应用/queue-visibility.test.ts` | 2/2，EXIT=0 |
| `test/桌面应用/queue-withdraw-lru.test.ts` | 5/5，EXIT=0 |
| `test/桌面应用/replay-safe-retry.test.ts` | 4/4，EXIT=0 |
| `test/桌面应用/abort-unwedge.test.ts` | 3/3，EXIT=0 |
| `test/桌面应用/b101-fixed-dispatch-task-binding.test.ts` | 11/11，EXIT=0 |
| `test/桌面应用/b111-fixed-closed-handback-drain.test.ts` | 5/5，EXIT=0 |
| `test/桌面应用/turn-lease.test.ts` | 4/4，EXIT=0 |

### 10.3 本地全量桌面套件（B0 冻结基线对照）

命令（B0 分段口径：`--test-concurrency=1 --test-timeout=120000 --test-force-exit`，目录分段）：

| 段 | 文件数 | tests / pass / fail / cancelled / skipped | 时长 | EXIT |
| --- | --- | --- | --- | --- |
| `test/桌面应用/**/*.test.ts` | 78 | 845 / 774 / 69 / 2 / 0 | 443.2s | 1 |
| `test/桌面UI/**/*.test.ts` | 58 | 443 / 443 / 0 / 0 / 0 | 7.6s | 0 |

- **桌面应用失败名逐名对照**：final 71 vs B0 冻结基线 72（`12b-baseline-desktop-app-failnames.txt`）⇒ **ADDED=0、REMOVED=1**（`segment2/full-desktop-app-failname-diff.txt`）。
  - 唯一转绿项：`重启：未决申请 orphaned、未决审批 expired；已结算不重复，二次恢复幂等`。B0 基线失败原因为临时目录 `ENOTEMPTY` 清理竞态（环境 flake，非产品断言）；本次全量通过且 `pending-card-restart.test.ts` 单文件复跑 **1/1** 通过（53ms）⇒ 既有 flake 转绿，非本批引入。
- **桌面UI**：443/443、0 失败，与 B0 `14-segment-桌面UI.tap` **完全一致**。
- **2 条 cancelled 均为 120s 超时、且与 B0 同名**：`关闭全部与双角色刷新扫描交接：停止返回后没有后续重开或投递`（B0 亦 119,999.97ms 超时）与 `C-04 decision 开关开启（真实 channel）…`（B0 亦 120,006.89ms 超时）。属既有挂起/级联现象，如实披露、不修改测试。
- **计数差异披露**：本次 tests 845 > B0 基线 832（pass 774 vs 760、fail 69 vs 70），系 `e9d5783`（含 B0–B3 累积）与 B0 快照 `c234e79` 的测试集合差异；本批门槛按**失败名逐名对照**，零新增失败。
- **flake 披露**：本环境存在测试后句柄残留历史（B0 记录同款），故沿用 B0 `--test-force-exit` 口径；桌面应用段 443s 内无其他超时，未见 Node 原生断言崩溃、未见 chief-workflow W29/W30/W35 级联（该文件属本节全量，失败名与 B0 同名）。

### 10.4 三套冻结 known-red（逐名 diff 空）

| 套件 | 命令 | tests/pass/fail/skipped | 失败名 diff |
| --- | --- | --- | --- |
| runtime-core | `… --test-force-exit "test/runtime-core/**/*.test.ts"`（64 文件） | **604 / 567 / 33 / 4**（65.3s，EXIT=1） | 33 vs 33：**ADDED=0 REMOVED=0（NO_DIFF）** |
| 门禁引擎 | LF 归一两文件 → `… "test/门禁引擎/**/*.test.ts"` → `git checkout --` 还原 | **577 / 571 / 5 / 1**（93.1s，EXIT=1） | 5 vs 5：**NO_DIFF** |
| 编排 | 137 文件（除 git-trunk-store）+ `test/编排/git-trunk-store.test.ts` 单文件 | **1,373 / 1,347 / 24 / 2**（140.1s）+ **13/13**（57.5s）= **1,386 / 1,360 / 24 / 2** | 24 vs 24：**NO_DIFF** |

- 门禁引擎 LF 归一/还原：`i/lf w/crlf` → 归一 `w/lf` → 还原 `w/crlf`；`git status` 与 `git diff` 对该目录均为空（`segment2/knownred-gates-normalize.txt`）；本次**未触发** git-shell-acl 原生崩溃，无需复跑。
- 编排采用任务允许的「137 文件 + 单文件」拆分口径（git-trunk-store 为本环境已知挂起文件，B0 同口径单跑 57s）；分段全程 `--test-force-exit`，如实披露。
- 对照源：B0 `04a-knownred-runtime-core-33.txt` / `04b-knownred-gates-5.txt` / `04c-knownred-orchestration-24.txt`；本次失败名清单与 diff 见 `segment2/knownred-*-failnames.txt` / `knownred-*-diff.txt`。

### 10.5 Windows 打包冒烟

- 命令：`npm run package:local`（= `npm run build:renderer && electron-builder --config electron-builder.yml --publish never -c.directories.output=release-output/local`）；**EXIT=0**。
- 产物：`release-output/local/ANS-Studio-2.0.0-win-x64.zip`，**169,187,132 bytes**，sha256 `303b7d902ede8dbdec76c5354564dc8da249e4ba9fa0ecd31c278c47c7075df6`；`win-unpacked` 416M；ZIP 2,532 文件条目，抽查含 `ANS Studio.exe`、`resources/app/app/main.ts`、`resources/app/app/renderer/dist/index.html`。
- 未发布/未上传；`release-output/` 命中 `.gitignore`（`git check-ignore` 确认 `.gitignore:8:release-output/`），`git status` 无 zip/构建产物。
- **环境接线披露**：工作树无 `node_modules`；打包期临时创建目录 junction `node_modules -> C:\Users\51054\Desktop\work\ans-studio\node_modules`（两侧 dependencies/devDependencies 哈希逐字相同：electron 44.7.0 / electron-builder 26.15.3 / vite 8.3.4），完成后以 `cmd rmdir` 仅移除 junction，主仓库 node_modules 完好。
- **非致命告警**：electron-builder `cannot find path for dependency`（34 个 pi 生态传递依赖 version=`undefined`）；exit 0、zip 正常产出，未改配置绕过，疑为依赖元数据既有形态；vite chunk 体积/`INEFFECTIVE_DYNAMIC_IMPORT` 为构建期既有提示。
- 详见 `segment2/package-local.log`、`package-local-summary.txt`、`package-local-sha256.txt`、`package-local-zip-list.txt`。

### 10.6 交付前终检

- `git status --porcelain` 仅：`M app/desktop/session.ts`、`M test/桌面应用/session-structure.test.ts`、`?? app/desktop/session/delivery/`、`?? 角色卡/桌面窗口/docs/change/2026-11-13_refactor-session-ts-b4-delivery.md`、`?? …_delivery_evidence/`。
- 无 `.tmp-b4`、无 zip/构建产物、无无关文件；`session.ts` **9,118 行**（≤10,252，较起点 −1,134）。
- 本段未 commit/push/tag/CI，未读 `.env`，未占 9222/9223/9224，未启动 Electron/真实模型（打包不运行应用）。
- **§R2 时序不变量核对表保持完整**：`…_evidence/adapters-and-equivalence.md` 本段未改动；本段全部门槛与之逐条相符（见 §10.2–10.4）。
