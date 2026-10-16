---
id: fix-kanban-delivery-and-operator
type: fix
title: kanban-live 真机轮 F-2 投递机整轮串行阻塞 / F-4 操作者确认不可用 修复提案
created: "2026-10-15"
updated: "2026-10-16"
status: 已实施待验证（单测全绿；真机复验待测试/root）
---

# F-2 / F-4 修复提案（桌面窗口）

来源：PM 派发件 [2026-10-15_change_kanban-runtime-fixes-dispatch.md](../../../项目管理/docs/change/2026-10-15_change_kanban-runtime-fixes-dispatch.md)（提案轮：只写提案、不改任何 src/app/test 代码）。~~本文档状态：**未实施 / 未测试**；所有可选件待客户裁定。~~ **状态更新（2026-10-16）：客户已按 PM 推荐批准（F-2-M1 + opt2 + opt3；F-4-M1 + M2 + opt1 + opt2；另承接 F-8-b 桌面侧与 F-5-opt1 桌面侧——见 PM 评审件 §客户批准记录），本角色实施轮已完成实施，单测与 typecheck 全绿，真机复验待测试/root——见下方实施摘要。**

本轮在既有证据之外，**只读**复核了当时运行的诊断日志（本轮隔离用户目录仍在：`/private/tmp/ans-kanban-live-7ae6156b/userdata/ans/diagnostics/ans-diagnostics-2026-10-15.jsonl`，下称「诊断日志」），它把两条问题的时序钉到了毫秒级——**建议 PM 安排把该文件（及其所在目录）纳入证据保全**，`/private/tmp` 会被系统清理。本文未复制、未改动该文件与 `角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/` 下任何内容。

---

## 实施摘要（2026-10-16，实施轮）

**状态：已实施（本角色全部改动落在 Section 1 边界内）／单测已过／真机未复验。** 按 §三「最小拟改动」与 §五「测试计划」实施；未勾选项（F-2-opt1、F-4-opt3）未实施；fail-closed 全链未放松。

| 项 | 落点（本角色文件） | 要点 |
|---|---|---|
| F-2-M1 | `app/desktop/session.ts` `drainQueueUnsafe` | 认领段（shift→置忙→登记 activeDeliveries→`delivery.start`→组装载荷→调 `sendDelivery` 取 promise）后**立即释放链**；成功/失败记账移入分离续段（IIFE 内 try/await/catch 与旧代码**逐字同体**，含「成功支抛错也落失败支」逐支等价）；续段自带与 `drainQueue` 安全壳同款的**就地拒收**（绝不产生未捕获拒绝）；注释写明「链防的是同队列并发 shift/open 与认领竞态，持有收窄到认领段」 |
| F-2-opt2 | 同上（新增 `openChains`） | `openInternal` 按会话键互斥（等待链 + finally 释放 + 链尾清理）；**防死锁**：重建续段（`rebuildIfBoundaryStaleUnsafe` 的重开）直调 `openInternalUnsafe`，不入链 |
| F-2-opt3 | 同上 | 认领段起止诊断 `delivery.claim.start/end`（字段用诊断 FIELD_NAMES 白名单内的 `state`/`queueDepth`/`count`）；形状防御丢弃路径也配对收尾 |
| F-4-M1 | `app/desktop/operator-channel.ts` `readConfirmTimeoutMs` | 取值链：专用 env `ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS` → 未设时**跟随** `ANS_PI_SHELL_REVIEW_TIMEOUT_MS`（env 名从编排 `shell-deadline.ts` 只读导入，不写字面量）→ 否则 120000；presenter 兜底 `+5000` 同步跟随；判定不变（超时仍 unavailable） |
| F-4-M2 | 同上 | 超时分支以**带标记 reason**（`confirmTimeoutError`，携带 `timeoutMs`）中止组合信号；presenter `cancel` 读 `signal.reason` 分流：超时 ⇒「操作者确认超时（>Nms），未获放行——可让角色重新发起。」；轮次中止/重建 ⇒ 原文案。**组合信号 reason 传播（Node 24 / Electron 44 实施轮首验项）已由单测钉住通过** |
| F-4-opt1 | `app/main.ts` | `win.on("focus"/"show") → shellConfirm.replayPending()`（幂等；只重推仍挂起者） |
| F-4-opt2 | `operator-channel.ts` presenter | cancel/超时路径补诊断 `shell-confirm.timeout`（含 `durationMs`=生效时限）/`shell-confirm.cancelled`——presented 之后每种去向（responded/expired/timeout/cancelled）均可判定 |
| F-8-b（桌面侧） | `app/desktop/session-history.ts`（新增导出 `classifyProcessOutcome`）、`app/desktop/runtime-history.ts` | 判据只认 `display.process` 结构化事实（与运行时核心投影 / 桌面UI `tool-rows.js` F-8-b 块同源）：`exitCode` 非零且无 `error`/`signal` ⇒ 不归 kind='denied'/failed（activity.status='returned'）；`timedOut` 独立一类（不归 denied；status 保持 failed）；无结构化事实的旧文本行**行为逐字不变**（过渡期口径） |
| F-5-opt1（桌面侧） | `app/desktop/session.ts` 重建路径 | 确认制会话（`confirmGated`＝内置治理角色+客户通道已接）重建后，对新句柄调 `handle.queueModelNotice?.(REBUILT_SESSION_WRITE_PERMITS_NOTICE)`（编排侧已实施落地的接口与单一来源文案；防御式 `?.`，旧替身缺席为 no-op；非确认制会话不排——绝不说假话） |

**测试证据（2026-10-16，本机 Node v24.14.0）**：本角色全部 23 个授权单测文件 **235/235 绿**（新增：F-2-T1..T5、F-2-opt2、F-2-opt3、F-4-T1..T3、F-4-opt1 接线+行为、F-5-opt1 两条、F-8-b 单测与全管线各一条）；`npm run typecheck` 0 错；全仓全量 `node --test "test/**/*.test.ts"` **1470 计 1469 过 / 1 skipped / 0 红**（记忆中的 2 条基线红本次未出现）。跨角色回归抽查：桌面UI `tool-rows.test.ts` 13/13 绿（其 F-8-b 判据块与我的行输出互认）。

**未含（如实）**：真机 E2E 复跑（按 PM 评审 §七 由测试角色/root 执行，含 F-2/F-4 断点观测项）；F-4-V1 渲染复验为回归项（客户已亲历证实卡片渲染存在，见 PM 评审 §四.1）；本实施未改 `src/**`、`app/renderer/**` 与任何他角色文件。

---

## 一、问题与证据

### F-2（P0）投递机「整轮串行」阻塞跨角色投递——实测复述

- su 于 **13:43:19** 派给测试者的复跑任务已受理（queue-timeline.json：「dispatch_task 执行完成（已受理）」）；13:46 的 CDP 快照：测试者 `roleBusy=false`，任务在队列（「复跑复核（等待投递）」）；直到 **13:52:30.191** 才真正投递开跑（约 9 分 11 秒）。等待期间实现者轮次卡在挂死的 shell 命令上（F-1）。
- 诊断日志把链条钉死（`desktop.delivery` 记录，全部同一项目）：
  - 13:35:35.465 `delivery.start 实现者（dispatch）` → **13:52:30.190 `delivery.failed`（AbortError，停止本轮所致）**——单条链持有 **16 分 55 秒**，恰等于实现者该轮时长；
  - 13:52:30.191 `delivery.start 测试者（dispatch）`——**上一链结束后 1ms** 立即开跑；
  - 全轮 **`delivery.blocked` 记录为 0**：测试者队列从未被「目标忙」判过——唯一的阻塞就是串行链本身；
  - 另两处同因可见：su 在自身轮内 13:35:26 派发返工 → 13:35:35.465 才送达（等 su 本轮 send 完成）；13:56:28 测试者 settle 后的回交批次把 su 轮拉到 13:57:01.599，实现者队列中已排队的重投递又被迫等到 13:57:01.600。
- `delivery.start→end` 的间隔与各角色**轮次**时长逐一对齐（如 13:21:38.391→13:27:42.506 = 实现者第一轮全场）——即：**一条投递投出去后，链被持有到目标整轮结束**。
- 对照证据：`queue-timeline.json`（13:46 观测）、实现者/su/测试者 replay 的轮次时间、本机诊断日志。

### F-4（P1）操作者通道「不可用（无人值守？）」——实测复述与证据链

- 实现者 13:36:30.414 发 `run_shell cp src/server.js temp/实现者/….js`；13:38:39.002 收到拒绝：`run_shell 未执行：审核拒绝（操作者通道不可用（无人值守？），拒绝，审者：pm → operator:不可用）`（实现者 replay L116/L117，`durationMs=128589`），随后改 write_file 绕行（L122）。当时应用正常运行、界面开放，查看焦点不在实现者会话（在 su）。
- 诊断日志（全轮仅此一次操作者确认，且**任何 UI 交互都会留下 IPC 证据**——按钮/×/Esc 都走 `shell:confirm-response`）：
  - 13:36:30.415 `shell.review.start`（该 cp 的 toolCallId `call_00_uqkcHFfQfwvWIYROt2U31701`）；
  - 13:36:38.996 `shell.operator.requested`，**`reasonCode: "b-allow"`**（(b) pm 模型审读判**放行**，但命令被 (c) 判为 `risky` ⇒ 必过 (a)——设计 §14.2「pm 不是终审，客户才是」）；
  - 13:36:38.997 `desktop.shell-confirm shell-confirm.presented { requestId: "sc-1", pendingCount: 1 }`——**主进程呈现调用成功、未抛错**（该记录只在 `opts.present(request)` 未抛错时写入）；
  - 13:38:38.997 `shell.review.end deny, reasonCode: "b-allow→a-unavailable"`——距 presented **恰好 120.000 秒**；
  - 全轮 `desktop.main` IPC 记录中**从无 `shell:confirm-response`**；`shell-confirm.responded` / `shell-confirm.expired` 记录均不存在。
- 结论（证据支撑的部分）：呈现通道**做到了把请求推到渲染侧**；判「不可用」的**真实判据是「120 秒内无人作答」**（桌面通道自身的确认超时，见 §二），不是任何「后台/无人值守/焦点」判定。
- 待确认（证据缺口，需复验）：**卡片是否真的显示在操作者眼前**。本机没有覆盖 13:36:39–13:38:44 的截图或探针（`stuck-before-stop.png` 为 13:48:39、`stuck-run2-before-halt.png` 为 13:52:20，均无卡片，但已过 120s 超时点）；且**卡片过期后按 ×/Esc 关闭不回传任何 IPC**，故「没有任何交互记录」同时相容于两种情形：(a) 卡片显示了、120s 内无人操作（注意力/可发现性），随后被无痕关掉；(b) 卡片因未知原因未显示。代码路径上未找到按「查看焦点」抑制显示的判定（见 §二）。操作者在同轮使用过 A-5 客服卡（13:23 曾操作 su 的选择卡）——模态卡与 A-5 卡是两套机制。
- A3 原文「本轮另一处 `cp` 曾出现可放行的确认卡」：三个 replay 全量扫描**只有这一条 `cp`（L116/L117）**，其余任何命令都没有走到操作者确认（`operator` 字样全轮仅此一处）。该表述**未能在留档证据中复现**，标记「待确认」（疑为跨轮记忆或把 A-5 卡当成了 shell 卡）。

---

## 二、根因（读实际代码；跨边界只读定位，写给属主）

### F-2 根因：串行链的「持有」被拉长到了整轮，而链本身是**每项目**一条

投递机设计（`app/desktop/session.ts:451-456`，注释原文：「投递机串行链（每项目一条，2026-10-12 L-1 修正）…不串行则同一队列会被两个 drain 同时 shift/open（真机缺陷：su 被**重复开启**两个会话）」）——**串行本身的动机是防「同一队列并发双开/双 shift」，这个防护必须保留**。问题在两点：

1. **链键是项目**：`drainQueue`（`app/desktop/session.ts:1610-1629`）`const key = projectRoot`——一个项目的**所有**投递共用一条链；任何角色的投递尝试（入队/开尾/settled/派发/回交触发）都 `prev.then(() => this.drainQueueUnsafe(...))`（1613-1614）排队等待。
2. **链持有贯穿整轮**：`drainQueueUnsafe` 的认领段（shift 队列 → 置忙 → 登记 `activeDeliveries`，`session.ts:1701-1721`）之后直接 `await this.sendDelivery(...)`（1740）。`sendDelivery`（534-551）`await entry.handle.send(...)`；编排 `run-role.ts:616-659` 的 `send` `await session.prompt(...)`；真实 Pi 适配器的 `prompt`（`src/common/pi-adapter/real-adapter.ts:643-683`）`await` 的是 **Pi SDK `session.prompt`——在整轮结束（settle）时才 resolve**。实测印证：`delivery.start/end` 对与轮次时长逐一对齐（§一）。
   ⇒ 一个角色只要在跑（含被 F-1 挂死 17 分钟的那轮、也含一切正常的数分钟长轮），**同项目其他角色的投递、回交、客户消息全部排在它后面**。

### F-4 根因：三层叠加，逐层定位

1. **注册层（无缺陷，先排除任务假设）**：桌面为**每个**非内置治理角色的会话在开机即注册操作者通道——`session.ts:874-878`（`openInternal` 内），闭包带 `roleId/projectRoot/runtime/signal`，与查看焦点**无关**；「查询」发生在闸调用时（每次判定经该闭包进编排）。不存在「后台角色没有通道」。
2. **判定层（如实判定，但原因被吞）**：桌面通道（`app/desktop/operator-channel.ts`）的三条 fail-closed 退路里，本次命中的是**通道自身的确认超时**：`DEFAULT_OPERATOR_CONFIRM_TIMEOUT_MS = 120000`（:68，env `ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS`），`withConfirmTimeout`（:260-272）超时后返回 `{outcome:"unavailable", reason:"操作者确认超时（>120000ms）…"}`。**注意：本轮明确注入 `ANS_PI_SHELL_REVIEW_TIMEOUT_MS=300000`（闸侧整体预算=300s，编排侧 operatorTimeoutMs 亦默认跟随），但桌面通道内部这个 120s 是独立默认、没有被放宽**——「人工确认窗口」被静默地钉在 120s（presented→deny 恰 120.000s 的来源）。
3. **呈现/语义层（两处误导 + 一处证据缺口）**：
   - 编排 `src/common/编排/shell-gate.ts:562-567`：channel 返回 `unavailable`（含我们的超时）时**丢弃 `out.reason`**，统一输出固定文案「操作者通道不可用（无人值守？），拒绝」（:566）。**「无人值守」的真实判据只存在于 CLI 侧**（`src/common/编排/operator-channel.ts:86-93`：stdin EOF）；桌面侧套用了这个词——「人在场但 120s 没答」被报成了「无人值守？」。（跨边界，本角色不改。）
   - 通道超时路径在 presenter 侧复用 `cancel` 文案：「本轮已结束、停止或会话已重建，旧 shell 确认失效。」（`app/desktop/operator-channel.ts:413-417`；触发源是通道 `timeoutController.abort()`，:264/250-252 的组合信号）——超时被报成「轮次结束」，且该路径**不写任何诊断记录**（只有 125s 兜底计时器那条 :408-412 会写、但已被 `finish()` 清掉，:384），这是本轮证据缺口的来源。
   - 卡片可见性：确认卡是**全屏模态**（`app/renderer/index.html:204` `#shell-confirm`，`.sc-overlay` `position:fixed; inset:0; z-index:60`），渲染为**全局**行为（`app/renderer/renderer.js:1412-1419` `onShellConfirm` 不按选中角色分支；唯一的显示条件 `backgroundDelivery`（:264/307-320）只对**跨引擎信封**为真，本轮全 pi，**与「焦点在 su」无关**）；A-5 客服卡有「非当前查看 ⇒ 当前 pane 落一行『【待确认】…』」的可见性指针（renderer.js:1743-1745）而 shell 卡**没有对应机制**。渲染侧复验建议见 §五（F-4-V1）——若复验证明未显示，修法在渲染侧（桌面UI）。

---

## 三、最小拟改动（本角色实现面）

### F-2-M1（必需）把链的持有收窄到「认领段」，send 启动后立即释放链

**文件**：`app/desktop/session.ts`（单文件；不动 src/）。
**改法**（语义级描述，实施轮细化）：

1. `drainQueueUnsafe` 拆成「认领段 + 分离续段」：
   - **认领段（链上，保持串行）**：读队首/合批 → `q.splice(0, batchCount)` → `notifyRoleState` → 形状防御 → 置 `busy=true` + `interactionState.turn` + `activeDeliveries.set` + `delivery.start` 记录 + 外推（现 1701-1721 全部保留）→ 组装 `sendOptions`（handback 溯源，现 1724-1739）→ **调用** `this.sendDelivery(...)` 取得 promise；
   - **立即释放链**：在同一同步段内挂上续段 `sending.then(successBody, failureBody)` 后 `return`——`promise.then(A).catch(B)` 与现状 `try { await promise; A } catch { B }` **逐支等价**（含「A 抛错也落 B」的现状语义），成功/失败路径的全部语句（`delivery.end`/`delivery.failed`、去重键释放、delivery-note、失败回队首 + 忙态复位 + `activeDeliveries` 同一性守卫撤销）**逐字保留**，只是不再持有链。
2. 更新 `drainChains`/`drainQueue`/`drainQueueUnsafe` 注释：写明「链防的是同一队列的并发 shift/open 与认领竞态；**持有收窄到认领段，投递开跑后即释放**——不再覆盖目标整轮」。
3. 连带语义变化（需在 change 记录写明）：
   - `handleHandback`（1494）与 `drainAllQueuesFor`（1591）里 `await this.drainQueue(...)` 的完成点提前到「认领+开跑」，调用方均为 fire-and-forget/不消费结果，无行为影响；
   - **跨角色轮次并发**成为常态（投递给 B 不再等 A 的轮次）：与现状一致——两个角色经聊天同时跑本来就允许（多会话保活、多忙态徽标并存），本改动只是让「投递」并入同一并发类，不引入新的并发种类。

**保持不失的防护（逐条）**：

| 防护 | 为何仍在 |
| --- | --- |
| 同一队列不并发双 drain/双 shift | 认领段仍全在链上（甚至仍是**每项目**串行，比按队列更强）；两个 drain 的 shift/置忙不可能交错 |
| 不并发 send 同一会话 | `busy=true` 在释放链**之前**同步置位（1716-1719 原样保留）；其后到达的 drain 见 busy 即退（1677），用户直发见 busy 入队（1121-1139） |
| 自动开目标不双开 | `openInternal` 调用仍在认领段内 ⇒ 受链串行——**跨角色开也不会并发**（比把链降为按队列更保守） |
| `activeDeliveries`「进行中」语义 | 认领即登记（早于释放）；撤销点（settled 1043、失败续段、dispose 609）都带同一性守卫（1769 等），settled 先于 promise 续段到达的次序已有守卫覆盖 |
| 队列期去重（handbackKey / `enqueuedHandbackKeys` / dispatch 窗口键） | 登记/释放点全部不变（handback 入队前登记 1462-1467；dispatch 送达释放 1743，仍在「send promise 完成」这一事件上） |
| 失败回队首 + 如实系统行 + 忙态复位 | 失败续段与原 catch 逐字同体，且其在 promise settle 的同一微任务里同步完成（无中间窗口） |
| withdraw | 「进行中不可撤/排队可撤」都读队列与 `activeDeliveries`——两者的登记时点与语义未变 |

**并发时序安全论证**：
- 仍可能双开的**既有窗口（本修不改、如实登记）**：① 用户点开（`open()` 不进链）与投递机自动开**同一角色**并发——`openInternal` 无同键互斥（先到者建会话、后到者覆盖 `sessions` 表，前者句柄泄漏且事件循环退出）；② 两个用户级 `open` 同角色并发（同上）。这两个窗口**在现状即存在**（链只串 drain 之间），F-2 不依赖也不恶化它们；关闭选项见 F-2-opt2。
- **为何新方案不会再引入双开/双 shift**：drain 与 drain 之间的一切危险交错（同队列或跨队列地读队列、shift、开目标、置忙、发 send）全部发生在认领段内，而认领段在任何时刻只可能有一个在跑（链未动，只缩短了持有）。释放点之后，本条投递只剩「已确定归属」的后续记账（续段），不再读/改队列或会话归属。
- **新的交错与既有守卫的对应**：释放后，其他队列的认领可与本条 send 的**等待期**重叠（预期行为）；settled 事件（消费循环）可能先于 send promise 的续段执行——续段内的所有共享状态改动均有过同一性守卫（`ownsRunningDelivery`/`activeDeliveries.get(key) === sent`/`sessions.get(key) === entry`），且失败续段整段同步、无 await 断点。

### F-4-M1（必需）桌面确认等待与「shell 审核预算」对齐（120s 独立默认不再静默钳制）

**文件**：`app/desktop/operator-channel.ts`（单文件，+ 其单测）。
**改法**：`readConfirmTimeoutMs`（:486-492）的取值链改为：`ANS_DESKTOP_OPERATOR_CONFIRM_TIMEOUT_MS`（专用覆盖，显式优先）→ 若未设，跟随 `ANS_PI_SHELL_REVIEW_TIMEOUT_MS`（本轮已用于放宽 shell 审核的**同一预算**；常量从既有单一来源 `src/common/编排/shell-deadline.ts` **只读导入**——shell-gate.ts:75-80 的同一引用，不在本角色再写字面量）→ 否则默认 120000。
**行为变化**：把「审核预算放宽到 300s」的配置从此**真正覆盖人工确认等待**（presenter 兜底计时 `+5000` 同步跟随，:375）。**不改变任何判定**：超时仍是 `unavailable`（编排据此拒），fail-closed 逐字不动；只是把「本来设计为跟随审核预算的 (a) 窗口」（shell-arming.ts:70-71 注释：operatorTimeoutMs 缺省=审核超时）从桌面侧恢复一致。
**理由**：本轮两个 300s env 都已注入，人工窗口却仍是 120s——超时之后数分钟内即出现操作者的应用内观测/操作（13:46 CDP 探测、13:48:39 截图），若人工窗口为 300s，这些时点都落在窗口内，该卡大概率会被看到并处理。这是最小、可单测、不触碰判定的修法。

### F-4-M2（必需）超时 ≠「轮次结束」：到期文案与诊断分流

**文件**：`app/desktop/operator-channel.ts`（+ 单测）。
**改法**：`createDesktopOperatorChannel` 的超时分支用**带标记的原因**中止（`timeoutController.abort(confirmTimeoutError(timeoutMs))`，复用既有 :465 的错误工厂）；presenter 的 `cancel`（:413-417）读取组合信号 `reason` 区分两种来源：超时 ⇒ 「操作者确认超时（>Nms），未获放行——可让角色重新发起。」；轮次中止/重建 ⇒ 保留现文案。顺带在 cancel/expire 路径补一条诊断记录（并入 F-4-opt2）。
**行为变化**：操作者侧经 `session:operator-expired` 看到的失效原因从「本轮已结束、停止或会话已重建」（本轮实为假）变为如实超时文案。判定不变。
**跨边界关联**：模型/工具行看到的「操作者通道不可用（无人值守？）」文案在编排（§六 F-4-X1）。

---

## 四、必需项 vs 可选加固项（稳定编号；默认建议见「建议」列，待客户选择）

| 编号 | 项 | 必要性 | 理由 / 收益 | 成本 / 风险 | 建议 |
| --- | --- | --- | --- | --- | --- |
| F-2-M1 | 链持有收窄到认领段（§三） | 必需 | 直击实测根因；三类投递全部受益；防护逐条保真 | session.ts 单文件重构；需完整回归投递机 6 个测试文件 | **勾选** |
| F-2-opt1 | 链键降为「每队列（项目×角色×runtime）」：认领段之间也不再跨队列互斥 | 可选 | 目标自动开会话（秒级）不再拖其他目标的认领 | 引入跨目标认领并发（open/rebuild 交错），需补 openInternal 并发安全评估与用例；保护面比现方案弱 | 默认不勾（先稳） |
| F-2-opt2 | `openInternal` 按会话键互斥（闭合「用户 open vs 投递 open」的既有双开窗口） | 可选加固 | 彻底关闭 §三论证中的既有 ①/② 窗口 | open 路径改造 + 竞态用例；与 `rebuildChains` 的关系需设计 | 建议勾选（独立小项） |
| F-2-opt3 | 投递认领段起止诊断记录（`delivery.claim.start/end`） | 可选 | 下一轮真机可一眼区分「认领耗时」vs「轮次时长」；本轮正是靠 delivery.start/end 破案 | 两行诊断；无行为影响 | 建议勾选 |
| F-4-M1 | 桌面确认超时与 shell 审核预算对齐（§三） | 必需 | 实测根因；本轮 300s 预算被 120s 静默钳制 | operator-channel.ts 单文件；判定不变 | **勾选** |
| F-4-M2 | 超时/轮次中止的原因分流（abort reason + 文案 + 诊断） | 必需 | 操作者看到的失效原因如实；补上本轮缺失的证据 | 同文件小改 | **勾选** |
| F-4-opt1 | 窗口 `focus`/`show` 时 `shellConfirm.replayPending()`（main.ts 一两行；幂等，仅挂起项重推） | 可选加固 | 若某次推送在渲染侧丢失，操作者一回到窗口即可再收到卡；覆盖「未显示」假设的兜底 | main.ts 小改；复用既有幂等重推（app:recovery-ready 同款） | 建议勾选 |
| F-4-opt2 | 诊断补录：presenter 的 cancel/超时路径写 `shell-confirm.timeout/cancelled` | 可选 | 本轮「是否渲染/为何消失」不可判定的直接原因；下一轮可判定 | 数行；无行为影响 | 建议勾选 |
| F-4-opt3 | 提高桌面确认超时默认值本身（如 300s） | 可选 | 无人值守时的等待更长 | 偏离既有 120s 语义（§7.5 卡片文案「超时=拒绝」已钉），无人值守成本变大 | 默认不勾（F-4-M1 已覆盖有配置场景） |

---

## 五、测试计划（全部使用本角色边界内既有测试文件；无新文件需求，不越界）

**F-2（回归 + 新增用例）**——需要给测试桩加一项既有用例没有的能力：**可控挂起的 `send`**（send 返回的 promise 不 resolve，直到用例显式放行；模拟真实 Pi「prompt 随整轮 resolve」语义——现有 stub 立即 resolve，天然掩盖本缺陷）：

1. `test/桌面应用/dispatch-delivery.test.ts`：新增
   - F-2-T1「长轮不阻塞跨角色」：A 的 send 挂起（A 在跑）期间 su 派发 B ⇒ **B 立即收到**（不待 A 轮结束）；随后放行 A，断言两边消息各一次、无并发对同会话 send；
   - F-2-T2「同目标仍严格排队」（既有 159 行用例保留/加严）：A 挂起期间再派 A ⇒ 排队；A settle 后按序投递、`sent.A` 顺序逐条断言。
2. `test/桌面应用/handback-delivery.test.ts`：F-2-T3：B 长轮期间 A settle 产生回交 ⇒ su **立即**收到（不被 B 轮持有）；批合批/去重既有用例全数保持绿。
3. `test/桌面应用/message-queue.test.ts`：F-2-T4：X 长轮期间客户消息投空闲 Y ⇒ 立即送达；X settle 后 X 队列按序放行。
4. `test/桌面应用/queue-withdraw-lru.test.ts`：F-2-T5：send 挂起（认领已发生）期间 `withdraw` ⇒ 如实「进行中，撤回无效」；排队期撤回语义不变。
5. `test/桌面应用/session-rebuild-race.test.ts`、`hot-path.test.ts`、`session.test.ts`：既有用例全量回归（认领段与 rebuild 串行、状态外推时点、直发忙时入队均不变）。
6. F-2-opt2/opt3 若采纳，各加对应用例（openInternal 互斥；claim 诊断字段）。

**F-4**：

1. `test/桌面应用/operator-channel.test.ts`：新增
   - F-4-T1 超时取值链：专用 env 优先；未设时跟随 `ANS_PI_SHELL_REVIEW_TIMEOUT_MS`（注入小值断言实际等待随之变化）；都未设 ⇒ 120000；非法值回退链；
   - F-4-T2 到期原因分流：超时中止的 cancel 文案=超时文案；轮次中止=原文案（组合信号 reason 驱动）；
   - F-4-T3（opt2 采纳时）诊断记录断言；既有 fail-closed 全链用例（allow/deny/未配置/抛错/超时）不变。
2. `test/桌面应用/operator-wiring.test.ts`：保持 main.ts 接线断言（M1/M2 不触 main.ts；opt1 采纳则加 focus/show 重推的接线断言）。
3. **F-4-V1（渲染侧复验，本角色 e2e 可做）**：`test/桌面应用/e2e/main.mjs` 新增场景：选中角色 A ⇒ 对角色 B 注入/触发 `shell:confirm-request` ⇒ 断言 `#shell-confirm` 可见、拒绝按钮默认焦点（现 harness 已有直注入用例 :918，扩展为「非当前查看角色」变体）。**今日代码阅读预期该用例直接通过**；若真机/复验环境重现「未显示」，则该假设被证实，修法交桌面UI（见 §六 F-4-X2）。
4. 运行集合：本角色全部 23 个授权单测文件 + `npm run typecheck` + `git diff --check`；本机既有 2 条基线红（检出目录名、macOS /var 符号链接）不作为回归。

**真机复验（实施后、由测试/root 执行）**：复刻本轮配置（ANS_PI_SHELL_REVIEW_TIMEOUT_MS=300000）+ 一次 risky 命令在「非当前查看角色」上触发确认，断点观测：(a) `shell-confirm.presented` 后卡片在界面上可见并可由操作者作答；(b) 不作答时 300s 后才失败、且文案如实（含操作者侧超时文案与 F-4-X1 后模型的如实文案）；(c) F-2：一侧角色长轮期间另一侧投递的 `delivery.start` 时延 < 秒级。

---

## 六、跨角色影响（只读定位，绝不代改）

1. **F-4-X1 → 编排**：`src/common/编排/shell-gate.ts:562-567` 在 `unavailable` 时转达 `OperatorOutcome.reason`（或区分超时/未配置/报错），消除「无人值守？」误导；建议同时评估 `BRANCH_A_TIMEOUT` 归因在「通道先超时」情形下的语义（现状落 `a-unavailable`，审计分不出超时）。fail-closed 结论不变。**本角色不改 src/**。
2. **F-4-X2 → 桌面UI（`app/renderer/`，非本角色边界）**：① 若 F-4-V1 复验发现渲染缺失，由此定位修复；② 对齐 A-5 先例，为 shell 确认卡补「非当前查看角色 ⇒ 当前 pane 落一行【待确认】指针/角色徽标」（renderer.js:1743-1745 同款机制）；③ （注明）过期卡片关闭不回传属既定 fail-closed 设计，不改。
3. **观察项 → PM**：`SHELL_REVIEW_TIMEOUT_ENV` 同名常量现分居两处 common（`src/common/编排/shell-deadline.ts:2-4` 与 `src/common/runtime-core/timeout.ts`；shell-gate 用前者、provider tools 用后者）——本提案 M1 选定引用前者；是否登记/收敛由 PM 裁定。
4. **与其他修复项的关系**：F-2 修好后，F-1 类「角色挂死」不再连带阻塞**其他角色**投递（但该角色自身轮次仍停摆——F-1 的时限归运行时核心，两者不互相替代）。F-4 与 F-1 无耦合（确认等待发生在工具执行内，不经投递机）。
5. **本角色边界外零改动承诺**：实施面仅 `app/desktop/session.ts`、`app/desktop/operator-channel.ts`、（可选）`app/main.ts` 与本角色测试文件；不改渲染、不改 src、不生成共享组件。

---

## 七、风险与回滚

- **F-2-M1 风险**：认领段变短后，跨角色/跨队列交错面变大（§三已列既有与新增窗口）。缓解：认领段仍全串行（比 opt1 保守）；续段与原 try/catch 同构；`activeDeliveries`/`origins`/`busy` 守卫已在 2026-10-13 状态机修复中加固并有既有用例；新增 F-2-T1..T5 钉住三类投递与撤回。**回滚**：单文件 revert，行为回到现状（整轮持有）。
- **F-4-M1 风险**：无人值守时 risky 命令的失败等待变长（上限=宿主自选的审核预算）——与闸侧 overtime 同预算，fail-closed 结论不变。**回滚**：单文件 revert（回到 120s 独立默认）。
- **F-4-M2 风险**：仅文案/诊断；组合信号（`AbortSignal.any`，operator-channel.ts:252 已在用）的 reason 传播属采纳后新增依赖的语义，须补 reason 传播单测钉住（Node 24/Electron 44 下按规范应传播中止源 reason；未在本轮实测，标为实施轮首验项）。**回滚**：单文件 revert。
- **未实施/未测试声明**：本提案未写一行代码、未跑任何新增用例；§一 的全部时序均为既有留档与当时诊断日志的只读复核。

---

## 附：证据索引（均只读，未改动）

- PM 派发件：`角色卡/项目管理/docs/change/2026-10-15_change_kanban-runtime-fixes-dispatch.md`
- 测试证据：`角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/`（problem-summary.md、raw/queue-timeline.json、app-redacted.log、shots/）
- 真机 replay（只读）：`~/code/vibeingcode/ans-testbed/kanban-live/.ans/sessions/{su,实现者,测试者}/pi/ans/replay.jsonl`（F-4 证据：实现者 L116/L117/L122）
- 当轮诊断日志（**建议保全**）：`/private/tmp/ans-kanban-live-7ae6156b/userdata/ans/diagnostics/ans-diagnostics-2026-10-15.jsonl`（`desktop.delivery`、`orchestration.shell-gate`、`desktop.shell-confirm` 记录；本机 2026-10-15 可读）
