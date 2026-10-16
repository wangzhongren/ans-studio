---
id: fix-g2-watchdog-and-recovery
type: fix
title: G-2 角色看护与收束（W1-W5）桌面窗口实施记录
created: "2026-10-16"
updated: "2026-10-16"
status: 已实施待验证（单测全绿；独立验证与真机 E2E 待测试/root）
---

# G-2（角色看护与收束）桌面窗口 W1-W5 实施记录

来源：客户 2026-10-16 按推荐批准 G-2 实施（9 个待裁点全部采纳默认；[PM 评审 §「G-2 客户批准与派发」](../../../项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md)）。设计规格＝[角色看护与收束（G-2 设计提案）](../../../产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md)（下称「设计」）。派发：桌面窗口 W1-W5、运行时核心 R1/R2、编排 O1、门禁引擎 G、桌面UI U1——**本批 V1a+V1b 同轮**。

本文档记录桌面窗口（本角色）在 Section 1 边界内的实施、接口对接与证据。**状态：已实施（全部落点在本角色边界内）／单测已过／独立验证与真机 E2E 未做**（按 PM 安排由测试角色/root 执行；§十一 的真机断点观测项见 §五）。

---

## 一、改动总表（全部在边界内）

| 项 | 落点（本角色文件） | 要点 |
|---|---|---|
| W1 看护器 | **新文件** `app/desktop/watchdog.ts`（纯逻辑＋注入时钟/快照/投递端）：tick 默认 30s（env `ANS_DESKTOP_WATCHDOG_TICK_MS`）、静默阈值默认 5min（env `ANS_DESKTOP_WATCHDOG_SILENCE_MS`——**仅 env 可调**，裁定 1）；信号 #1-#4；活跃期去重＋跨活跃期冷却＋风暴护栏（15min ≤5 条＋抑制通告＋`watchdog.suppressed` 诊断）；「看护恢复」行（F-6 形态）；`watchdog.failed` 隔离（tick 内 try/catch＋stderr，看护暂停本 tick、下个 tick 重试——核心治理零依赖）。**永不改判定**：只读快照＋投递端＋（客户确认后）复用既有人工动作 | 快照由 `SessionManager` 同源提供（下述），**不造第二数据源** |
| W1 同源数据面 | `app/desktop/session.ts`：`watchdogSnapshot()`（busy/`busySince`/turnId/队列/在途/链/待确认——直读内存结构，同步读不引锁）；`lastTurns` 小状态（settled 顺带落表，四值终局才记）；`busySince` 在 send 直发与投递认领两处置真；事件消费循环转发 `settled`（含 `fromSystemDelivery`——本轮由 `kind:"system"` 投递持有）/命令超时（`classifyProcessOutcome` **同一判据**认 `display.process.timedOut`）/真实活动 | 信号 #1 的「有效时限」求值**只读导入** `resolveRuntimeTimeouts`（`src/common/runtime-core/timeout.ts`——与会话运行时同一函数、单一来源；env 名沿 operator-channel 先例） |
| W1 「正确等待不报」 | `customer-input.ts` 增 `pendingRoles()`（按角色挂起视图）；`operator-channel.ts` shell 卡 `pendingRoles()`；`recovery-channel.ts` 恢复卡同（三者经 main.ts **合并视图**注入 `watchdogPendingConfirmations`） | 带挂起确认卡的角色排除 #1；su 自身忙时关于 su 的信号全部不触发 |
| W2 `system` 第四类 | `session.ts`：`DeliveryItem.kind` 增 `"system"`；`watchdogDeliver()`（经**同一套投递机**给 su——忙排队/未开自动开/失败保留重试全复用；来源标注**恒空**、`[系统·<子类>] ` 文首与 U1 已落树归类契约对齐）；快照/队列视图 kind 透传（`queue` 视图类型补 `id/full`——与运行时真形对齐，向后兼容）；撤回判据（**不可撤回**——`kind !== "message"` 既有分支天然覆盖第四类，**文案保持原文**〔渲染侧源码钉在桌面UI 的 `renderer.test.ts`，本角色不改动他角色断言〕）；去重键**看护自持命名空间**（`watchdog\0…`——与 handback/dispatch 键隔离）；投递失败分支新增 system 如实行「系统消息投递失败…未丢弃，已保留待重试」 | `id/full` 的类型补记属**如实纠偏**（notifyRoleState 早已带出，deps 类型陈旧窄） |
| W3 完成态收束 | `watchdog.ts` 内：静默谓词（全角色空闲＋队列全空＋在途 0＋待确认 0＋无 open/rebuild 链在跑＋su busy=false）＋预热（自导入以来 ≥1 轮 settled）＋滞回状态机（静默 ≥N 投**恰一条**收束提示；仅**真实活动**重新武装——**排除**看护自身投递与 su 对收束提示的回复，经 `fromSystemDelivery` 判定）；投不出去不消费窗口（下 tick 重试） | 收束提示**不强迫 su 断言完成**（文案＝O1 单一来源） |
| W4 恢复执行桥 | `session.ts`：**新公共入口** `rebuildSession(target)`（dispose＋重开、保留 ANS 回放、F-5-opt1 注记适用；**在跑轮次不打断**——busy ⇒ 拒绝如实；与陈旧重建同 `rebuildChains` 串行；链内重开直调 `openInternalUnsafe`＋新增 `internalReopen` 旗标**消自死锁**〔见 §四.3〕）；`redeliverNudge(target, itemId?)`（包装既有 `drainQueue`——不新造投递路径；条目不存在/已投出如实回执，触发后按**触发后真实队列态**回报）；`abort` 复用既有 `manager.abort` | 三态如实（success/unsupported/error），绝不假装已执行 |
| W5 恢复确认卡 | **新文件** `app/desktop/confirm-card.ts`（与 shell 卡**共享** pending/replay/expire 通用件——设计 §6.2 实现建议；shell 卡行为逐字保留：超时/中止分流、诊断事件名、兜底计时）+ **新文件** `app/desktop/recovery-channel.ts`（`createRecoveryConfirmPresenter`——**等待不设限**零计时器，裁定 4；恰 `allow:true` 才为真；关窗 `rejectAllPending`=未获执行；按角色 pending 视图）；`operator-channel.ts` shell presenter 改用共享件（对外行为逐字不变＋`pendingRoles()`）；`session.ts::proposeRecovery`（校验→推卡→等待→**恰 allow:true 才执行**→回执四值如实）；`app/main.ts` 新 IPC `recovery:confirm-request`/`recovery:confirm-response`、focus/show/`app:recovery-ready` 幂等重推、关窗 `rejectAllPending`；`app/preload.cjs` `onRecoveryConfirm`/`recoveryConfirmRespond` | 载荷形状与 U1 已落树消费面**逐字段对齐**（§三.1）；回执**双路**：工具返回（R2 fail-closed 转达）＋经投递机投回 su（`kind:"system"`）＋ UI 系统行＋诊断 |
| W5/W1 只读工具数据源 | `session.ts`：`roleStatusText`（快照＋`lastTurn`＋pending＋看护统计→结构化文本；**纯读**）+ `sessionTailText`（**复用受保护投影管线** `getSessionHistory`——凭据清洗/display 保护在链上；行数由工具层归一；失败如实 `{ok:false,message}`）；诊断节（≤20 条、尾读 ≤256KiB、白名单字段） | 形状＝契约家 `RoleStatusFn`/`SessionTailFn`（返回 `WatchdogToolResult`）——**已按落树契约对齐**（§三.2） |
| 装配 | `interface.ts`：看护服务装配（`projects`＝已导入 ∪ 有会话/队列；`snapshot`/`deliver` 指向 manager；构造失败只记诊断——**看护不可用 ⇒ 一切照旧**）；`SessionManager` deps 增 `recoveryConfirm`/`watchdogObserver`/`watchdogPendingConfirmations`/`watchdogStats`/`now`；`DesktopInterface` 增 `startWatchdog()/stopWatchdog()`；main.ts 窗口注册后启动、窗关停止 | `now` 注入同时收敛 `enqueuedAt`/`busySince`/观察 `at`（测试可注入假时钟，生产＝Date.now） |

**边界外零改动承诺（如实）**：未改 `src/**`（对 `src/common/编排/watchdog.ts`、`src/common/runtime-core/timeout.ts`、`src/model/runtime.ts`、`app/desktop/session-history.ts` 的引用全部为**只读导入**）；未改 `app/renderer/**`（U1 属主）；未改任何他角色文件；未 git 提交；未触碰 kanban-live-3、`/private/tmp` 与测试证据目录。

## 二、文案与契约的单一来源（G-2 收口结果）

1. **文案**：告警/恢复行/风暴通告/收束提示＝编排 O1 `src/common/编排/watchdog.ts` 的 `renderWatchdogAlert` / `renderWatchdogRecovery` / `renderWatchdogStormGuard` / `renderClosurePrompt`；恢复回执＝`renderRecoveryReceipt`。**本角色只读导入、零本地副本**（起草期曾暂驻本角色的草案已删除——「不得两处并存」）。桌面只**如实产出事实行**（时间/来源/摘要/深度/计数——设计 §3.3「事实行由检测侧如实产出」）与**队列行摘要**（呈现面，`系统·看护 · 信号 · 角色 X` 一句）。
2. **能力契约**：`roleStatus` / `sessionTail` / `proposeRecovery` 三能力形状＝契约家 `src/model/runtime.ts`（`RoleStatusFn`/`SessionTailFn`/`ProposeRecoveryFn`，返回 `WatchdogToolResult`/`RecoveryReceipt`——四值 `executed|declined|unsupported|error`，**恰 `executed` 为已执行**）；本角色经 `openRoleSession` 输入的同名可选字段注入（仅内置治理角色 su——判据 `role.builtIn === true`，与 `dispatchTask` 先例同处），编排 O1 `suppressHandback` 透传、运行时核心 R1/R2 落工具——**端到端字段名一致（已联调通过）**。
3. **回执落地三路**（设计 §6.2）：① `propose_recovery` 工具返回（R2 handler 按 `outcome` 四值 fail-closed 转达——`declined/unsupported/error` 一律「不要当它已执行」）；② UI 系统行（`emitDeliveryNote`——操作者在聊天流可见）；③ **经既有投递机回投 su**（`kind:"system"`，`renderRecoveryReceipt` 渲染，含 action/目标/结果/确认者 operator/时间）＋诊断 `recovery.receipt`。

## 三、与并行上下文的接口对接（全部已核实落树并接通）

1. **U1（桌面UI）**：渲染侧 `recovery:confirm-request` 消费面 `{id, projectRoot?, runtime?, roleId, action, evidence, reason?, requestedBy?, requestedAt?, itemId?}`——本角色 `RecoveryConfirmRequest` **逐字段对齐**（含随带 projectRoot/runtime，沿 shell 卡先例——异引擎视图经 `Rt.matchesView` 不被丢弃）；回包 `recoveryConfirmRespond({id, allow})`→`recovery:confirm-response`，恰 `allow:true` 为真，三态 `{ok}|{expired:true}|{error}` 同 shell 口径；`system` 队列行/消息行归类（`tool-rows.js` 已落树，`[系统·<子类>] ` 首行定格）——本角色全部 system 文案经 O1 renderer 生成，天然满足。卡失效通知复用 `session:operator-expired`（沿 shell 卡先例）。
2. **R1/R2（运行时核心）**：`makeRoleStatusTool`/`makeSessionTailTool`/`makeProposeRecoveryTool` 已落树——provider 调用形（`fn(query)` / `fn(query, metadata)`）、回执解释（四值）、行数归一（1..200 缺省 40，工具层已归一）、8KiB 截断由工具层执行（本层**不预截断**）、propose 等待挂 `InteractionGate`（su 轮次超时暂停）——与桌面实现逐点对上；`recovery-receipt` 的 `outcome/message/operatorId` 三字段被正确消费。
3. **O1（编排）**：`withWatchdogCapabilities`/`suppressHandback` 判据透传已落树——su 会话三能力在位（单测断言 su 注入、普通角色不注入）。
4. **G（门禁引擎）**：su 卡「看护职责」段已落树（本角色不涉及）。
5. **`internalReopen` 旗标（本角色内部）**：`openInternalUnsafe` 第 4 参——重建链内的重开（陈旧重建 O-1 ＋ 人工重建 W4）**不再查陈旧、不再入 `rebuildChains`**：既修「链内等自身尾」的潜在自死锁，又使并发方已重建出新会话时按续接如实返回（不重复重建）。既有行为在正常路径上逐字不变（该参数只在两个重建重开点传 `true`）。

## 四、测试与证据

**`test/桌面应用/` 全目录：345/345 绿**（含桌面UI 同目录套件；其中本角色 23 个授权文件全绿，本批**净增 24 例**）。`npm run typecheck` **全仓 0 错**（含与 R1/R2/O1 契约的类型级对齐——三类固化错误在这一步暴露并修净）。全量 `node --test "test/**/*.test.ts"`：**1603 计 / 1602 过 / 0 红 / 1 skip**（本机；既有 2 条基线红本次未出现）。

新增用例分布（按提案 §十一清单）：

| 覆盖点 | 位置 | 关键钉子 |
|---|---|---|
| 阈值表（#1 90% 边界/每轮一次/恢复行；#2 age/depth/冷却；#3 单次即报/冷却/无恢复行；#4 窗口计数/aborted/completed 不计） | session.test.ts（G-2 块，假快照＋注入时钟） | 边界恰 108s 触发；去重只累计；冷却抑制 |
| 排除项（挂起确认卡排除 #1；su 自身忙全部不报） | session.test.ts | 卡解除后恢复检测 |
| 风暴护栏（≤5 条＋通告＋`suppressedTotal` 统计＋恢复行同样过护栏） | session.test.ts | 7 角色齐到线 ⇒ 5 报+1 通告 |
| `watchdog.failed`（快照抛错不炸、下 tick 恢复） | session.test.ts | doesNotThrow＋恢复工作 |
| 滞回（恰一条/su 回复〔system 持有〕不重武装/真实活动重武装/预热/投递失败不消费窗口/任一非静默事实拦下） | session.test.ts | 含「投递端异常→重试恰一条」 |
| W2 快照/撤回/投递机（kind=system、来源空、键命名空间、不可撤回、忙排队→settled 送达、失败回队首＋如实行＋重试送达） | message-queue.test.ts＋queue-withdraw-lru.test.ts＋dispatch-delivery.test.ts | 同源快照逐字段断言 |
| W3 集成（真看护服务＋同源快照＋假时钟：静默满 N 收束真投递恰一条；su 回复不重武装；客户消息重武装→第二条） | message-queue.test.ts | 与生产装配同款接线（观察转发） |
| W1 集成（busy/`busySince` 快照；命令超时观察＝`display.process` 结构化事实；`lastTurn`；`fromSystemDelivery` 标志） | message-queue.test.ts | classifyProcessOutcome 单一判据 |
| W5 卡侧（恰 allow:true/缺字段/未知 id expired/零计时器源码钉＋行为钉/关窗/中止/重推/`pendingRoles`） | operator-channel.test.ts | 「等待不设限」双钉 |
| W5 桥（恰一次执行＋回执三路＋取消未执行；未接线 declined；非法载荷/内置角色 error 且不推卡；推达失败 declined；unsupported/error 三态） | dispatch-delivery.test.ts | abort 恰一次计数；`stub.cards` 为零钉 |
| W4（rebuild 在跑拒绝/空闲重建/UI 行；redeliver 条目不存在如实/触发重试不谎报已投出） | dispatch-delivery.test.ts | 含 `internalReopen` 语义回归（重建后事件流续跑） |
| W1 数据源（role_status 文本含 busy/队列/最近一轮/看护行；session_tail 无历史如实 `{ok:false}`；**纯读**前后快照逐字段一致） | dispatch-delivery.test.ts | includeDiagnostics 降级路径 |
| 回归（投递机既有面逐字——handback/dispatch/message 全部既有用例未动、全绿；撤回仍拒治理流；快照字段向后兼容） | 既有 23 文件全量 | 仅两处**有意更新**的陈旧源码钉（见下） |

**两处既有断言的有意更新（如实登记，非放水）**：
1. `operator-channel.test.ts` F-4-opt1 接线钉：main.ts 的 focus/show 重推从「仅 shellConfirm」变为「shellConfirm＋recoveryConfirm」——正则更新为现行实文（行为语义不变＋扩展，另有 recovery 通道用例补钉）。
2. （已撤回）初稿曾把撤回只读文案扩为「派发/回交/系统看护属治理流」，但该文案的源码钉在**桌面UI 属主**的 `test/桌面应用/renderer.test.ts`——为守边界，**文案与彼处断言均保持原文**（`kind !== "message"` 分支天然拒绝第四类，语义不变；本角色 `queue-withdraw-lru.test.ts` 以正则钉「只读/不可撤回」覆盖 system）。
3. 夹具修正（非断言放松）：dispatch-delivery 的 `stopped` 由按 roleId 共享改为**逐句柄闭包**——重建后新句柄的事件流按生产语义独立存活（旧写法使 W4 重建后的 consume 循环即时退出，是夹具缺陷）。

**未做（如实）**：真机 E2E（§十一 断点观测：收束时间线/异常→排查→恢复全链/F-1 回归观测/无泄漏 grep/不打扰——由测试/root 按 PM 安排在独立轮执行）；独立验证轮；e2e/main.mjs 未动（本批不声称渲染端到端）。

## 五、已知取舍与残余（如实）

- **#2 的 depth 辅判**：depth ≥5 在**单条 age 未到**时即触发（表 §3.2 OR 语义；「age 优先」体现为任何一条 age 到线即报）。误报面待真机观测（设计已列裁定点）。
- **role_status 的「总行数」**：`session_tail` 头部给「规范行 N 条＋跳过 M 行」（解析口径），非文件物理总行数——如实口径而非近似（物理总行数需整读，见 §4.2 意图「不读大文件」）；待 R1/独立验证判是否需要。
- **`su 自身忙不报` 的边界**：su 忙期间关于 su 的 #1-#4 一律不触发（设计 §3.3 字面口径）；su 忙时的**命令超时**事件也被抑制（其轮次内事实；F-1 自愈语义下影响面小）——真机观测后可调。
- **恢复卡失效通知**：复用 `session:operator-expired`（与 shell 卡同通道）——U1 若希望区分卡族可按 `id` 前缀（`rp-`）分流（已如实交接）。
- **`rebuildChains` 与人工重建的交互**：人工重建与陈旧重建同链串行；链内重开带 `internalReopen`。并发极端序（人工重建 dispose 窗口内投递机自动开）下：后到者走续接如实返回，**不产生双开**（F-2-opt2 单测域内回归全绿）。
- **诊断节**：`role_status` 的 `[diagnostics]` 节读的是**最新一份**日志文件尾 ≤256KiB（跨天时早期条目可能不在——如实标注来源为「近日志」）；目录未配置/读取失败如实降级。

## 六、真机 E2E 观测建议（供测试/root，按设计 §十一）

1. **收束**：全流程完成后全程不碰界面——观测静默 5min+ε 内 su 会话出现 `[系统·收束]` 并出终局总结；总结后 ≥5min 无第二条。
2. **异常→排查→恢复**：制造真实事件（如派发后立刻「停止本轮」）→ su 收 `[系统·看护]` → `role_status`/`session_tail` 轨迹 → `propose_recovery` → 客户点卡 → 回执（工具结果＋`[系统·恢复]` 投递）与 `settled`/回交可见；断点：告警时延、卡渲染、恰一次执行。
3. **F-1 回归**：一条限时命令 → `[系统·看护] 命令超时` 如实出现且为「无需动作」级（O1 文案「建议：F-1 已自动终止…通常无需动作」）。
4. **无泄漏**：告警文本与 `session_tail` 输出抽查不含凭据。
5. **不打扰**：正常并行干活期间零告警；应用启动/导入不触发收束（预热条件）。

## 附：证据索引（只读）

- 设计：[2026-10-16_design_role-watchdog-and-closure.md](../../../产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md)；PM 批准与派发：[2026-10-15_change_kanban-fixes-pm-review.md](../../../项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md)
- 编排单一来源：`src/common/编排/watchdog.ts`（文案与契约转发）；契约家：`src/model/runtime.ts`（`RoleStatusFn`/`SessionTailFn`/`ProposeRecoveryFn`/`RecoveryReceipt`——236-330 行区）
- 本批代码：`app/desktop/watchdog.ts`、`app/desktop/confirm-card.ts`、`app/desktop/recovery-channel.ts`、`app/desktop/session.ts`、`app/desktop/interface.ts`、`app/desktop/customer-input.ts`、`app/desktop/operator-channel.ts`、`app/main.ts`、`app/preload.cjs`
- 测试：`test/桌面应用/{session,message-queue,dispatch-delivery,operator-channel,queue-withdraw-lru,renderer}.test.ts` 的 G-2 块
