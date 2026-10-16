---
id: role-watchdog-and-closure
type: design
title: 角色看护与收束（G-2 设计提案）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: draft
revision: 1
related: [kanban-fixes-pm-review, contract-workflow-dispatch, post-v1-product-roadmap]
events:
  - date: "2026-10-16"
    kind: created
    summary: 按 kanban-fixes PM 评审 §「新增候选 G-2」派发，将客户方向「角色看护与收束」细化成正式设计提案（仅调研+设计，零代码改动）
---

# 角色看护与收束（G-2 设计提案）

一句话结论：给 su 装上一套**看护回路**——异常态（轮次逼近超时／投递排队积压／命令超时限／重复失败）由主进程**去重后自动投系统消息**给 su，su 用两个**只读**状态工具（`role_status` / `session_tail`）核对卡点并留证；恢复动作（停止本轮／重建会话／重投任务）**只能由 su 提议（带证据）、经客户一键确认后由应用执行**（复用确认卡通道机制，执行回执回投 su）；完成态（全角色空闲＋队列全空＋无待确认，持续 N 分钟）自动投一条**收束提示**让 su 自行判断是否收尾——不强迫 su 断言「完成」。两支柱全部为「读快照＋投文本＋（确认后）复用既有人工动作」形态：**零权限面变化、不改任何判定链**，一切失败路径 fail-closed（最坏情形退化为「今天的现状」）。

本记录是**设计提案**，不是实施授权：**未实施、未测试**。本轮只读源码与证据并形成判断；没有改任何 `app/`、`src/`、`test/`、证据目录，没有 git 提交，没有操作任何真实项目与轮次目录。涉及实施的部分须经客户确认文档后由项目管理派发属主角色。

## 来源与动机（依据）

- 客户在 kanban 修复批次重跑轮复盘后提出方向 G-2（两支柱登记原文见 [PM 评审批次 §「新增候选」](../../../项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md)，2026-10-16；客户同日「这些开始启动」＝批准 G-2 细化）。
- 动机一（异常态，A1 活例）：[问题总结 §二 A1](../../../测试/docs/change/2026-10-15-kanban-live-real-project-evidence/problem-summary.md) —— 挂起命令 583s 无自动中止，且**连带阻塞全项目投递约 9 分钟**（su 派给测试者的任务 13:43:19 受理、13:52:30 才投出）。F-1 已治「最硬的卡死」（命令级时限＋轮次继续），但「卡住/积压」**没有告知路径**——无人值守时没有任何人（含 su）知道出了事。
- 动机二（完成态，run-3 活例）：[run-3 观察日志](../../../测试/docs/change/2026-10-16-kanban-dev3-e2e-evidence/observations.md)「收束」节 —— 全流程闭环后**全角色空闲＋队列全空，静默约 6 分钟无终局总结**，客户手动索取后 su 才产出终局收束汇报。现状「完成态无任何系统侧判定」。
- 现状能力（登记原文 §「新增候选」）：F-1 命令级时限；「停止本轮」人工兜底；主进程权威快照（roleBusy/queueItems/running + `ans-diagnostics.jsonl`，第一轮破案即靠它）；su 有全项目读权（读不受边界约束）。
- 缺口（登记原文）：su 没有状态可见性（无结构化状态工具、无异常通知）；没有排查入口；没有恢复动作（停止本轮/重建/重投只有人能做）；「完成态」无系统侧判定。

> 行号说明：本提案引用的行号为 2026-10-16 写作时点的**工作树**读数；当时工作树含 G-1/预授权等其他批次的未提交修改，实施派发前请以当轮基线复核行号。

## 一、调研：G-2 的既有承载件（本仓产品代码，只读定位）

### 1.1 主进程权威状态快照（唯一数据源）

`SessionManager`（`app/desktop/session.ts`）是全部运行态的唯一权威：

| 事实 | 承载 | 位置 |
| --- | --- | --- |
| 角色忙/闲 | `LiveSession.busy`（send 成功置真、`settled` 置假） | `session.ts:357-358`；翻转点 `:1087-1117` |
| 待投递队列（按项目×目标角色） | `deliveryQueues`（条目**入队即定格** `text/summary/dedupKey/enqueuedAt`） | `:458-459, 368-399, 1346-1352` |
| 正在跑的投递 | `activeDeliveries`（settled/失败/dispose 撤销） | `:485-490` |
| 状态快照外推 | `notifyRoleState`（busy×队列×running，同一通道不造第二数据源） | `:1401-1423`；渲染侧去抖 `app/main.ts:214-234, 310-312` |
| 活会话视图 | `liveSessionViews()` | `:533-535` |

### 1.2 投递机（E-1 回交 / H-1 派发 / L-1 客户消息共用）

- 每项目一条串行链、**F-2-M1 起持有收窄到认领段**：`drainChains` `:460-469`；`drainQueue/drainQueueUnsafe` `:1676-1884`。
- 三类条目 `kind: "handback" | "dispatch" | "message"` `:368-399`；目标忙→按到达序排队 `:1757-1761`；目标未开→**自动开启**再投 `:1739-1756`；失败→**如实系统行＋放回队首保留待重试**（绝不静默丢）`:1850-1872`。
- 去重：回交 `handbackKey` 永不重投 `:496-497, 1527-1532`；派发**队列期窗口去重**、送达即释放（保返工）`:498-503, 1830`。
- 撤回（P1-1）：**仅「客户消息」类可撤**，派发/回交属治理流只读 `:1365-1399`。
- 系统行（只到聊天流、不到模型）：`emitDeliveryNote` `:1335-1339`；「队列受阻只提示一次」先例 `suDeliveryBlockedNoted :504-505, 1726-1736`。

### 1.3 模型可见通知的三种形态（G-2 的选型依据）

| 形态 | 机制 | 是否开轮/到模型 | 位置 | 适用 |
| --- | --- | --- | --- | --- |
| ① UI 系统行 | `emitDeliveryNote` → `session:events` 推送 | 否（只到界面） | `session.ts:1335-1339` | 如实可见性 |
| ② 真投递（E-1/H-1 文案） | `enqueueDelivery`＋投递机 → 目标会话 `send`（未开自动开、忙时排队） | **是（su 真收到并行动）** | `handback.ts:191-240`；`session.ts:1546-1559, 1627-1637` | **G-2 采用** |
| ③ 注记前缀（F-5-opt1） | `queueModelNotice`：排入**下一次 send 的输入前缀**，送达一次即消费、**不单独开轮** | 否（下轮搭车） | 契约 `run-role.ts:302-314`；实现 `:727-733, 660-709`；桌面调用 `session.ts:742-756` | 被动如实告知 |

**选型**：G-2 的告警与收束提示都要求 su **可能行动**（核对/提议/收尾），且 su 空闲时注记形态会**一直不送达**（等不到下一次 send）——故一律走形态②：新增一个 `system` 类投递条目，经**同一套投递机**（忙时排队、未开自动开、失败保留重试全部复用）。文案纪律对齐 F-5-opt1 先例（`REBUILT_SESSION_WRITE_PERMITS_NOTICE`，`:245-252`）：如实、不夹带任何授权语义。

### 1.4 诊断（ans-diagnostics.jsonl）的形态与既有事件名

- 模块：`src/common/shared/diagnostics.ts`（项目管理主属，跨层共用）。**落盘白名单**仅元数据（`FIELD_NAMES` `:11-18`：turnId/toolName/durationMs/timeoutMs/reasonCode/queueDepth/count/state…；命令原文/argv 等正文依设计契约禁入）；`scrub` 脱敏限长 `:36-47`；滚动 24h、`appendFile` 串行队列 `:73-104, 138-152`；写失败保留 `lastError` 不崩 `:73-80, 163-166`。目录：`userData/ans/diagnostics`（`app/main.ts:444`）。
- 桌面侧既有事件名（看护可复用为信号源/对账）：`delivery.start/end/failed/blocked/claim.start/claim.end`（`session.ts:1759, 1804, 1828, 1841-1842, 1772, 1883`）、`session.open.*/rebuild.*`（`:800-803, 732, 768`）、`report.*`（`:1512, 1529, 1558, 1561`）、`interaction.presented/response.end/closed`（`customer-input.ts:157, 239, 228`）、`shell-confirm.*`（`operator-channel.ts:419, 432, 435, 445, 462`）。
- 运行侧：`shell.exec.timeout`（F-1，`tools.ts:663`）、`prompt.timeout`（`real-adapter.ts:741`）、`handback.generated/duplicate`（`handback.ts:357-359`）等。

### 1.5 轮次与时限信号（阈值表的基准）

- 整轮硬超时：`resolveRuntimeTimeouts`（单一来源 `src/common/runtime-core/timeout.ts:101-110`；`ANS_PI_PROMPT_TIMEOUT_MS`，默认 120000 `:11`）；经 `withPausableTimeout` 执行（`src/service/runtime/session.ts:259`）——**等待客户确认期间计时暂停**（`InteractionGate`＋`withPausableTimeout`，`timeout.ts:185-211, 224-270`）。
- 终局四值：`TurnOutcome = completed | failed | aborted | timed_out`（`src/common/pi-adapter/lifecycle.ts:6`）；桌面已在事件消费循环里捕获（`session.ts:1087-1089`）。
- F-1 命令级时限：默认 600000ms、只可调大不可禁用（`timeout.ts:20-33`）；超时=如实「超时已终止（N ms）」＋**轮次继续**（`tools.ts:659-680`）；结构化事实 `display.process.timedOut`（投影 `src/common/runtime-core/tool-display.ts:110, 149`；桌面分类 `app/desktop/session-history.ts:86-102`）。

### 1.6 会话文件与受保护投影（`session_tail` 的现成来源）

- 会话落盘契约：`<projectRoot>/.ans/sessions/<roleId>/`（含 runtime 子目录，见 `run-role.ts:97-101` 注释）；桌面已有**只读解析＋界面行规范化**：`session-history.ts:24-25, 288-319`（防御式、坏行跳过、无历史≠失败），**受保护投影**（凭据清洗、display 保护）经公开管线：`runtime-history.ts:12-96`（IPC `session:history-get`，`main.ts:387`）。

### 1.7 能力注入先例与确认卡通道

- **「注入才注册」**（未注入⇒工具不存在，最强 fail-closed）逐项先例：`run_shell`（`tools.ts:1110-1123`）、`submit_report`（`:1136-1141`）、`dispatch_task`（`:1143-1148`，**只给 su**）。能力面：`AdapterCapabilities`（`run-role.ts:106-117`）→ `RuntimeAdapterFactory(gate, capabilities)`（`:933-960`）；su 判据＝`suppressHandback`（`built-in-governance`，`:453, 486`）；桌面注入点 `session.ts:1004-1011`。
- **确认卡通道两组先例**：shell 确认卡（主进程 presenter：pending Map/`replayPending`/`expire`/**恰 allow:true**，`operator-channel.ts:383-483`；IPC `main.ts:253-272`；窗关 `rejectAllPending` fail-closed）；su 交互卡（`customer-input.ts:123-256`；**G-1 起无超时**，窗关归 declined `:21-26, 227-234`）。两者均为「主进程挂起＋渲染侧只渲染不判定」。
- 人工动作的既有 API：「停止本轮」`manager.abort`（三态如实返回，`session.ts:1246-1266`；IPC `interface.ts:263-268`）；作废重建 `rebuildIfBoundaryStale*`（`:698-770`，含 F-5-opt1 注记、在跑不打断）；**无**「手动重建」「手动重投」公共入口（G-2 需新增，见 §六）。
- su 写权限现状：`docs/su/**`＋`docs/contracts/**` 预授权已随 2026-10-16 批次在编排落地（`run-role.ts:20-22, 405-429, 871-894`）——su 排查留证有直接落点。

## 二、设计总览

```
                      ┌────────────────────────── 主进程（桌面窗口）──────────────────────────┐
                      │  看护器 WatchdogService（新，app/desktop/watchdog.ts 建议）            │
   信号源（同源快照）→ │   · 异常检测（4 信号 + 阈值表 + 去重/冷却/护栏）                        │
   ① SessionManager   │   · 完成态判定（静默谓词 + 滞回状态机）                                │
      busy/queue/…    │        │ 命中                                   │ 命中                       │
   ② 事件流（settled/ │        ▼                                        ▼                            │
      display.process）│   enqueueDelivery(kind:"system") ── 复用车 ── enqueueDelivery(kind:"system") │
   ③ 诊断文件（尾部）  └────────┼────────────────────────────────────────┼───────────────────────────┘
                              ▼                                        ▼
                     su 会话（真投递：忙排队/未开自动开/失败保留重试）
                              │
               su 行动：role_status / session_tail（只读核对）
                        │                    │
                        │                    └─→ 确认卡死 ⇒ propose_recovery(带证据)
                        ▼                                        │
               引导下继续（自解/重派）                               ▼
                                                 客户一键确认卡（service 通道，恰 allow:true）
                                                             │ 执行（应用侧既有动作）
                                                             ▼  停止本轮 / 重建会话 / 重投任务
                                                  回执再经投递机回 su → 既有回交/重派流程
```

**一条原则**：看护**不改判定链**——所有行为＝读快照＋经既有投递机投文本＋（客户确认后）复用既有人工动作 API；不写盘（诊断除外）、不放行、不改写权、不替 su 决策、不自动做任何恢复。

**非目标（V1 不做）**：自动恢复（永远需客户一键确认）；替 su 断言「完成」；系统托盘/OS 通知（仅 su 会话内＋聊天流系统行）；跨项目聚合；多窗口协同（当前单窗口）；「客户活跃度」感知（列裁定点）。

## 三、支柱一 a)：异常检测与通知

### 3.1 检测器形态（建议）

主进程挂一个**看护器**（纯逻辑＋注入时钟/发射端，可在 node 下单测——沿 `app/desktop/*.ts` 全部模块先例）：每 **tick=30s** 同步读一遍同源快照（§1.1 的 Map 结构直接读，**不造第二数据源**）＋观察事件流事实（`settled` outcome、`display.process.timedOut`）；命中即走「去重判定 →（必要时）投告警」。

### 3.2 阈值表（候选默认值，全部列裁定点）

| # | 信号 | 观测源（file:line） | 触发条件（候选默认） | 去重键 | 冷却 | 告警口径 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **轮次逼近超时** | `busy`＋本轮起时刻（投递开跑/send 置忙 `session.ts:1211, 1802`）；生效时限 `resolveRuntimeTimeouts`（`runtime-core/timeout.ts:101-110`） | 有效已耗 ≥ **90%** × 生效时限（默认 120s→108s；放宽 900s→810s）。**待客户确认挂起期间不计入**（`withPausableTimeout` 语义；看护侧按「该角色有挂起确认卡」排除） | `turn-deadline:{role}:{turnId}` | 每轮一次 | 「即将被整轮硬超时终止」预警；正常完成则自然解除 |
| 2 | **投递排队积压** | `deliveryQueues` 条目 `enqueuedAt`（`session.ts:1346-1352`） | 队首 age ≥ **10 min** 或单角色深度 ≥ **5**（age 优先，见 §八 F-2 注） | `queue-stuck:{role}` | 10 min | 「目标可能卡住」＋建议核对（role_status） |
| 3 | **命令超时限（F-1 事实）** | 事件流 `detail.display.process.timedOut`（`tool-display.ts:110,149`；分类 `session-history.ts:86-102`） | **单次即报**（低频高信号） | `cmd-timeout:{role}` | 10 min | 注明「F-1 已自动终止、轮次继续——**通常无需动作**，仅告知」 |
| 4 | **重复失败** | `settled` outcome ∈ {failed, timed_out} 按角色计数＋`delivery.failed` 诊断 | **15 min 窗口 ≥ 3 次** | `repeat-fail:{role}` | 30 min | 「反复失败，建议排查」 |
| 5 | （归并）投递投不出去 | `delivery.blocked`（target-busy）/su 队列无法开目标（`suDeliveryBlockedNoted` 先例） | V1 并入 #2/#4，不单列 | — | — | — |

> 实现注（待确认）：#1 的「生效时限」求值须与运行时核心**单一来源**同源（`resolveRuntimeTimeouts`；跨角色只读导入可行性沿 `operator-channel.ts:514-516` 的 env 常量先例交实施评估——不得在桌面另写一份时长解析）。「待确认挂起」的按角色视图：su 交互卡通道现仅给 `pendingCount()`（`customer-input.ts:104`），shell 卡请求带 `roleId`（`ShellConfirmRequest`）——需扩出按角色视图（桌面窗口，§十 W5）。

去重与「恢复行」形态**直接沿用 F-6 先例**（`shell-gate.ts:325-330, 631-660`）：同一信号活跃期内重复命中只**累计计数**（不重复打扰）；条件解除时投一条「**看护恢复**：〈信号〉已解除（期间共命中 N 次，抑制 M 条）」。

### 3.3 通知路径与文案草案

- 路径：`enqueueDelivery(projectRoot, suRoleId, { kind: "system", … })` → 既有投递机（su 忙→排队；未开→自动开启；失败→保留重试＋如实系统行）。`system` 为**第四类 kind**：**不可撤回**（撤回判据 `:1390-1392` 归入「治理流只读」面，按钮不出现）。
- 文案草案（队列积压例；文首统一 `[系统·看护]`，**必含**：信号/角色/事实（带时间与来源）/建议动作/纪律）：

```text
[系统·看护] 投递排队积压：角色「实现者」队首任务已排队 12 分钟（深度 3）。
事实：- [dispatch] 来自 su：<摘要 60 字>（入队 02:10:03）；该角色最近一轮进行中/开启失败记录见 role_status。
建议：先用 role_status（必要时 session_tail）核对；若确认卡死，可 propose_recovery（需客户一键确认后由应用执行）。
纪律：看护仅如实告知——是否处理由你判断；不得据此假设任何写权。
```

- **风暴护栏**：全项目 15 min 窗口内告警投递 ≤ **5 条**；超出投一条「看护告警已抑制 N 条（风暴护栏）」＋ 诊断 `watchdog.suppressed`。
- **已知的「正确等待」不报**：带挂起确认卡的角色（su 交互卡 `roleId`、shell 卡 `roleId`，两通道均有请求快照）不计入 #1；su 自身忙（正在处理）不触发任何告警（它本来就在做工）。
- **F-6 教训**：告警**永不改判定**（不因告警改变任何 gate/队列语义）；投递失败重试沿用投递机语义。

## 四、支柱一 b)：su 只读状态工具

两工具均**只给 su 注入**（同 `dispatch_task` 先例：capability 注入才注册，`run-role.ts:486`、`tools.ts:1143-1148`），**纯读**：不写盘、不入队、不改 busy、不动任何判定链。

### 4.1 `role_status`（待定名，签名草案）

```text
role_status(roleId?: string, includeDiagnostics?: boolean)
```
- `roleId` 缺省＝全项目角色概览；给出＝单角色详情。`includeDiagnostics=true` 时附**该角色近日志尾部 ≤20 条**（字段为白名单元数据，写盘时已 scrub——读侧不再扩面）。
- 输出（结构化文本，≤8 KiB；超限截断并如实标注 `truncated`）：

```text
role_status（项目 <root>，<time>）
su：busy=false ｜ 待确认卡 0 ｜ 看护：活跃告警 0，最近触发 <time|null>，今日已抑制 2
角色 <id>：busy=false ｜ 会话 已开（contextSource=resumed） ｜ 队列 0 ｜ 进行中 —
  最近一轮：timed_out @ 02:31:05（该角色近 15 分钟 failed/timed_out 计 2）
  队列明细（若有）：- [dispatch] 来自 su：<摘要>（入队 <age> 前，id=<dedupKey>）
  [diagnostics 节（可选）] 02:31:05 prompt.timeout turnId=… durationMs=120000 …
```
- 来源：SessionManager 同源快照（§1.1）＋ `lastTurn{outcome, at}`（**新小状态**：看护器在事件消费循环里捕获 settled 时顺带落表，`session.ts:1087-1089` 已有 outcome 捕获点）＋ 诊断文件尾部只读。
- **只读保证**：handler 无任何副作用；测试断言「调用前后快照逐字段相等」。`su` 的 busy/待确认数由主进程从两通道读（`customer-input.ts:104` 的 `pendingCount` 需扩出按角色视图，见 §十）。

### 4.2 `session_tail`（待定名，签名草案）

```text
session_tail(roleId: string, lines?: number)   // 缺省 40，上限 200
```
- 返回该角色会话文件**尾部规范化行**：`<at> [user|assistant|tool] <一行文本（≤200 字/行，截断标注）>`，头部如实给「来源文件／总行数／跳过的坏行数」。
- 来源：**复用受保护投影管线**（`runtime-history.ts:12-96` 的 `getSessionHistory` 同路径）——凭据清洗、display 保护已在链上；**不**让 su 直接读裸 JSONL 大文件（read_file 路径仍可用，但本工具是结构化＋脱敏的便利用法）。
- 失败语义（沿 `session-history.ts:288-319` 口径）：无历史 → 如实「无会话历史」；读坏/header 非法 → 如实错误文本；**不抛、不猜**。
- 隐私边界如实写进工具说明：内容可能含该角色此前会话原文（已过投影脱敏）；**本工具不扩大任何写权**。

## 五、支柱一 c)：su 排查（流程约定，无新机制）

- **su 卡文本增补职责段**（门禁引擎属主，`boundary-core.ts::BUILT_IN_ROLE_CARD_TEXT`）：收到 `[系统·看护]` → 先 `role_status`（必要时 `session_tail`）核对 → 能自解的自解（澄清/重派 E-1·H-1 既有路径）；确认卡死才 `propose_recovery`。
- **留证**：核查结论写 `docs/su/**`（2026-10-16 预授权已在编排落地 `run-role.ts:871`；门禁引擎侧配套修订同批进行中——未见生效前走 `request_confirmation`）。
- **不强迫动作**：告警文案已含「仅告知、由你判断」；su 核对后回复「状态正常，忽略」是合法结局。

## 六、支柱一 d)：恢复不静默（提议 → 一键确认 → 应用执行 → 回执）

### 6.1 `propose_recovery`（待定名，签名草案；只给 su）

```text
propose_recovery(roleId: string, action: "abort-turn" | "rebuild-session" | "redeliver",
                 evidence: string, reason?: string, itemId?: string)
```
- 工具 handler **只把载荷交给注入的能力**（前端路由，同 `dispatch_task` 先例 `tools.ts:997-1044`）：校验（角色在本项目、action 枚举、`evidence` 非空）→ 推确认卡 → 等待客户 →（恰 allow:true 才）执行 → **结果三态如实回执**。su **只能提议**：无确认＝不执行；工具本身不做任何事。

### 6.2 确认流交互图（复用确认卡通道机制）

```text
su ──propose_recovery(roleId, action, evidence)──▶ 桌面主进程（路由）
   ◀── 回执（三态）──┐                             │ 校验通过 ⇒ 生成恢复确认卡（pending 登记, id=rp-<n>）
                   │                             ▼ 推渲染侧（新 IPC `recovery:confirm-request`）
                   │                    客户看卡：角色/动作/证据逐字/「执行或取消（默认取消）」
                   │                             │ 恰 allow:true（`recovery:confirm-response` 按请求快照校验）
                   │                             ▼ 应用执行（复用既有动作，见 6.3）
                   │                     执行结果 → 回执投递 su（kind:"system"）＋ UI 系统行 ＋ 诊断
   ◀──────────────────────────────（su 据回执走既有回交/重派；E-1/H-1 不变）
   客户取消 / 关窗 ⇒ 未获执行（fail-closed），同样如实回执 su
```
- **幂等**：同一卡 id **恰执行一次**（respond 即从 pending 删除、旧 id 失效——沿 shell 卡先例 `operator-channel.ts:455-464`）；窗关 `rejectAllPending`＝未获执行；重推沿 `replayPending`（focus/show 重推先例 `main.ts:264-265`）。
- **时限**：建议**不设限**（沿 G-1「等待客户不设限」；su 的等待轮次不吃整轮超时——`InteractionGate` 暂停语义适用），卡可一直挂着；列裁定点（备选：沿 shell 卡窗口）。
- **实现建议**：呈现端抽一个与 shell 卡**共享 pending/replay/expire 机制**的通用件（两文件同属桌面窗口角色，无跨角色共享问题）；渲染侧复用既有确认卡组件族（桌面UI）。

### 6.3 动作语义（钉死；全部复用既有行为）

| action | 语义 | 复用点 | 边界 |
| --- | --- | --- | --- |
| `abort-turn` | 停当前轮次（＝UI「停止本轮」）：不销毁会话、abort 后 `settled` 正常收尾、无在飞轮次=no-op、三态如实 | `manager.abort` `session.ts:1246-1266` | 运行时不支持 ⇒ 如实回执 unsupported |
| `rebuild-session` | dispose＋重开（保留 ANS 回放；F-5-opt1 注记适用重建路径） | 新公共入口（内部＝`rebuildIfBoundaryStaleUnsafe :716-770` 同款步骤，去掉陈旧判据） | **在跑轮次不打断**（busy ⇒ 拒绝并如实回执）；确认制会话重建⇒注记 |
| `redeliver` | 触发该角色投递队列**立即重试**（既有 drain 时机）；给 `itemId` 时针对该排队条目 | 新小入口包装 `drainQueue :1676-1695` | 条目已投出/不存在 ⇒ 如实回执；重复 upsert 同条目按队列期去重既有语义 |

- **回执内容**：action、目标角色、结果（三态＋原因）、确认者标识（操作者 id 先例 `operator-channel.ts:243`）、时间；投递进 su 会话（投递机全复用）。
- **执行后**：su 收齐「执行回执＋被动作角色的新 `settled`/回交」后走既有验收/重派路径——不新增任何交接协议。

## 七、支柱二：完成态收束（静默态判定＋滞回＋去重）

### 7.1 静默谓词（每 tick 评估）

```text
本项目静默 ⇔ 全项目角色 busy=false ∧ 全部投递队列为空 ∧ activeDeliveries 空
          ∧ 两确认通道 pendingConfirmations=0 ∧ su busy=false ∧ 无 rebuild/open 链在跑
预热条件：本项目自导入以来至少有 1 次 turn settled（防空项目一进来就触发）
```

### 7.2 滞回状态机（本提案的核心设计点）

```text
                     ┌────────── 真实活动 ──────────┐
                     ▼                              │（看护自身投递/收束后 su 的回复：不算）
   ARMED_WAITING ──静默连续 ≥ N──▶ 投「收束提示」 ──▶ FIRE_COOLDOWN（已投，冷却）
   （等待静默）        （默认 5 min；tick 30s）        │
        ▲                                            │无真实活动 ⇒ 不重发（防骚扰回路）
        └──────────── 真实活动 ─────────────────────┘
```

- **真实活动**（重新武装信号）：项目角色 `settled`（任意 outcome）／客户 `send` 消息／派发·回交·客户消息**入队**／确认卡呈现或应答／会话开/关/重建／drain 出队投出。**刻意排除**：看护自身的告警与收束投递、su 对收束提示的那一轮回复（否则「总结完 → 5 分钟又催」的骚扰回路）。
- **触发动作**：`enqueueDelivery` 一条 `system` 投递给 su（su 未开自动开）。投递失败（保留重试）⇒ 队列非空 ⇒ 谓词转假，**天然不重发**；滞留会进而触发异常信号 #2（§3.2）——两支柱互洽。
- **每静默窗口至多一条**：`lastFireAt` 之后的再次静默不重发，直到出现真实活动开启新窗口。
- **误判成本**：su 一轮轻量核对（可回「暂无遗留，忽略」）；比「静默 6 分钟无人收束」的缺口小一个量级。

### 7.3 收束提示文案草案（不强迫断言「完成」）

```text
[系统·收束] 已无进行中任务：全部角色空闲、投递队列为空、无待确认，已持续 5 分钟。
请核对是否达到收尾条件：
· 若确认完成——请给客户最终总结（交付物／验证结论／遗留项）；
· 若还有未了事项（含你正在等待的客户答复之外的口头承诺）——继续处理或派发。
本提示仅为系统侧静默判定，不代表任何验收结论；是否收尾由你判断。
```

- 与「客户口味五条」对齐：进 su 会话（不弹窗、不出系统通知）；每静默窗口一条；「信息在对的上下文」——收束是 su 的职责面，提示直达 su。

## 八、与既有修复/机制的衔接

1. **F-1（命令时限）**：命令超时是**自愈语义**（轮次继续）——看护只做告知级信号 #3（单次即报但注明「通常无需动作」），**不**把它算进恢复触发面；短窗口重复才归 #4。阈值表与 F-1 的时限（默认 600s 命令级）**不耦合**（别把「合法长命令」误报成卡死）。
2. **F-2（并行投递）**：队列指标按角色、从同源快照读（F-2-M1 认领段保证读值自洽）；并行下「目标忙排队」是**正常态**——#2 以**队首 age** 优先、depth 仅辅判（误报面待真机观测，列裁定点）。
3. **F-5-opt1（重建注记）**：告警/收束走**真投递**（形态②），与注记前缀形态③区分；`rebuild-session` 动作触发的重建**同样**走 F-5-opt1 注记路径（`:742-756` 既有代码，不另写文案）。
4. **F-6（审计自愈先例)**：去重＋计数＋「已恢复」行的形态直接沿用（§3.2）；看护与审计提示一样「不改判定、不翻转任何 allow/deny」。
5. **E-1/H-1/投递机**：全复用；新增 `system` kind 须同步：队列视图渲染（桌面UI/桌面窗口）、撤回判据（拒撤回）、快照外推（`summaries/queue/running` 新 kind 文案）、去重键集合（看护自持 `activeWatchdogKeys`，与 handback/dispatch 键隔离）。
6. **O-1（会话陈旧重建）**：`rebuild-session` 动作＝**手动触发同款重建**（含 TOCTOU/串行链纪律：入 `rebuildChains`、在跑拒绝）；不做第二套重建实现。
7. **「停止本轮」人工兜底**：`abort-turn` 就是它（同一 `manager.abort`）；UI 按钮不动，恢复流是 su 提议的**附加**路径。
8. **su 预授权（2026-10-16）**：留证落 `docs/su/**` 已可用（`run-role.ts:871`）；G-2 不给 su 任何新写权。
9. **自动调度（路线图 C1）**：收束判定与 `system` 投递是「静默态/空队列」信号的先行件（与 G-1 workflow.md 完成口令同族）；机器化调度**本期不承诺**。

## 九、失败模式与 fail-closed 边界

| 失败 | 检出点 | 行为（口径） |
| --- | --- | --- |
| 看护器自身异常（读快照/判定抛错） | tick 内 try/catch | `diagnostic.error("watchdog.failed")`＋stderr；**看护暂停**、会话与投递不受影响（不共用判定链）；下个 tick 重试 |
| 诊断写盘故障 | 既有 `lastError`（`diagnostics.ts:73-80, 163-166`） | 检测器**不依赖盘上诊断**（内存快照为准，信号 #3 取事件流）；`role_status` 的诊断节如实返回「不可用＋lastError」 |
| 告警/收束投递失败 | 投递机既有失败支（`:1850-1872`） | 保留待重试＋如实系统行（绝不静默丢）；风暴护栏防堆积 |
| su 会话开不出来 | `openInternal` 失败（`:1744-1752`） | 保留＋一次性如实提示（`suDeliveryBlockedNoted` 先例）；不重试风暴 |
| 恢复确认通道故障（窗关/推达失败） | presenter 抛错（`operator-channel.ts:443-451` 同款） | **未获执行**＋回执如实（fail-closed）；**绝不当「没人问就执行」** |
| 恢复执行失败/运行时不支持 | `manager.abort` 三态、rebuild 失败支 | 回执如实（success/unsupported/error 三态），不假装已执行 |
| 看护整体不可用/未启用 | 启动路径 | **核心治理零依赖**：无看护时一切照旧（＝今天的现状）。这是「fail-safe toward 现状」，不是 fail-open |
| 误报（正常长命令/合法排队） | 阈值表 | 文案自带事实与「可忽略」指引；恢复仅提议、要客户确认——误报成本＝su 一轮核对 |

补充纪律：看护**永不**写项目文件、不放行任何命令/写入、不停任何轮次（除客户确认的 `abort-turn`）、不撮合「完成」语义；性能上 tick 同步读内存结构＋仅事件驱动的小表（`lastTurn`），**不引锁**（避免与 drainChains 交互）。

## 十、分期与实施归属（V1 最小闭环拆分到角色）

| # | 改动 | 内容 | 属主（建议） |
| --- | --- | --- | --- |
| W1 | 看护器（异常态） | `app/desktop/watchdog.ts`：信号 #1-#4 检测、去重/冷却/护栏、`lastTurn` 小状态、诊断 | 桌面窗口 |
| W2 | `system` kind | `DeliveryItem` 第四类：投递/快照/队列视图/撤回判据/去重键隔离 | 桌面窗口 |
| W3 | 完成态收束 | 静默谓词＋滞回状态机＋收束投递（与 W1 同一服务） | 桌面窗口 |
| W4 | 恢复执行桥 | 新公共入口：`rebuildSession(target)`、队列重试 nudge；`abort` 复用 | 桌面窗口 |
| W5 | 恢复确认卡 | presenter（新 IPC `recovery:confirm-request/-response`）＋执行→回执投递；两通道按角色 pending 视图 | 桌面窗口 |
| R1 | `role_status` + `session_tail` | schema（`schema.ts` 增两工具说明）＋ handler（`tools.ts` 增两 maker：纯读、截断、失败如实）；`GovernedToolsOptions` 增能力位 | 运行时核心 |
| R2 | `propose_recovery` | schema＋handler（同 `dispatch_task` 先例：只交载荷、如实转达三态回执） | 运行时核心 |
| O1 | 透传＋文案单一来源 | `AdapterCapabilities` 增三能力（只 su 注入，判据复用 `suppressHandback`）；告警/收束/回执文案收敛到编排单一来源（`common/编排/` 新文件建议）；`promptGuidelines` | 编排 |
| G | su 卡文本 | 看护职责段＋只提议纪律（`BUILT_IN_ROLE_CARD_TEXT`） | 门禁引擎 |
| U1 | 恢复卡渲染＋system 行样式 | 复用确认卡组件族；`[系统]` 消息行如实标注来源 | 桌面UI |

**建议批次**：
- **V1a（先「看得到」）＝ W1+W2+W3 + R1 + O1 + G**：异常告警＋收束提示＋两只读工具，真机即可观测「卡住有告警、su 能自查、完成会收束」。
- **V1b（再「动得了」）＝ W4+W5 + R2 + U1**：恢复提议全链。
- 两批可同一实施轮（桌面窗口一个上下文承担 W1-W5，或拆两个上下文），验收一轮真机 E2E。
- 后续（**本期不做**）：自动调度对接、客户活跃度感知、系统托盘通知。

## 十一、测试/验收思路（含真机断点观测项）与风险

**单测（离线；供实施轮与独立验证轮参考，本轮未做）**

- 滞回状态机：连续静默 N→恰一条；su 回复后不重发；真实活动重武装；投递失败不消费窗口；tick 抖动边界。
- 阈值表：每信号构造快照/事件序列→命中/不命中；去重冷却；「看护恢复」行；风暴护栏计数。
- 工具：`role_status` 只读（前后快照逐字段相等）、截断、诊断节降级；`session_tail` 尾取/行数上限/坏文件如实/脱敏（构造含假凭据的会话文件断言不外泄）；`propose_recovery` 三态回执（declined/expired→零执行；allow→恰一次执行）。
- 恢复执行：`abort` 幂等与 unsupported 三态；`rebuild` 在跑拒绝、确认制注记；`redeliver` 条目不存在如实。
- 回归：投递机既有面（handback/dispatch/message 语义逐字不变；撤回仍拒治理流；快照字段向后兼容）。

**真机 E2E 断点观测项（kanban-live 同型；绝对路径 OUTDIR）**

1. **收束**：全流程完成后**全程不碰界面**，观测静默 N(5min)+ε 内 su 收到收束提示并出终局总结；记录时间线（静默起点/触发/总结产出）；并观测总结后 **5 分钟无第二条**（不重复）。
2. **异常→排查→恢复**：制造一次真实事件（如派发后立刻「停止本轮」，或令某角色反复小失败）→ su 收告警 → 调 `role_status`/`session_tail`（工具轨迹留证）→ `propose_recovery` → 客户点卡 → 执行回执与 `settled`/回交在 su 流里可见；断点：告警到达时延、卡渲染、恰一次执行。
3. **F-1 回归观测**：一条 sleep 超设置时限的命令 → `[系统·看护]` 命令超时告警如实出现且为「无需动作」级文案；无误报卡死。
4. **无泄漏**：告警文本与 `session_tail` 输出抽查不含凭据（grep 证据目录留档）。
5. **不打扰**：正常并行干活期间零告警（阈值不误报）；应用启动/导入不触发收束（预热条件生效）。

**风险**

- **噪音风险（最大）**：阈值过激→su 被打扰，违背「常规提示不打扰」。缓解=保守默认＋冷却＋每窗口一条＋护栏；以观测项 1/5 验证，超标即调参。
- 误报（合法长命令、正常排队）：文案带事实与可忽略指引；恢复需客户确认，误报不外溢。
- su 误诊/过度动作：客户一键确认是最终闸；su 仅提议。
- 模型不照做（忽略告警/不核对直接提议）：无机械强制（沿 G-1 残余先例登记）；文案纪律＋真机观测。
- 实现复杂度集中桌面窗口（看护器＋卡通道＋system kind）：建议拆批（V1a/V1b）降低单批回归面。
- 输出体积：`role_status`/`session_tail` 大输出可能占 su 上下文——截断＋行数上限＋工具说明提示「按需取尾部」。
- 时序竞态：tick 读快照与投递机并发——读取同步（JS 单线程 tick 内读完）、投递只经既有链，不引锁。

## 十二、待客户/PM 裁定点

1. **静默阈值 N 与 tick**：推荐 5 min / 30 s（候选 3/5/10 min）；是否暴露设置项（设置面板）还是 V1 仅 env。
2. **异常阈值表逐项确认**（§3.2）：轮次 90%、排队 age 10 min/深度 5、命令超时单次即报、重复失败 3 次/15 min、冷却 10/30 min——均可调。
3. **恢复动作集 V1**：`{abort-turn, rebuild-session, redeliver}`——是否增/减（本提案**不含**「禁用角色/删会话/改边界」类）。
4. **恢复卡时限**：推荐**不设限**（沿 G-1「等待客户不设限」）；备选：沿 shell 卡窗口自动过期（过期＝未获执行）。
5. **告警去重与「恢复行」口径**：沿用 F-6 先例——技术细节交桌面窗口/编排实施时评估。
6. **工具命名与 su 卡文本**：`role_status`/`session_tail`/`propose_recovery` 三名待客户点名或改名（注意与 UI 既有「role-state」通道名区分）；su 卡文本改动由门禁引擎实施。
7. **`system` kind 的呈现面**：队列视图/撤回拒止的文案口径（桌面窗口/桌面UI 实现细节，PM 知悉）。
8. **完成态判定是否排除「客户刚活跃」**：推荐**不排除**（无人值守正是场景；收束提示只进 su 会话、不弹窗）。
9. **V1 是否做「告警的界面级提示」**（如角标）：推荐不做（沿口味五条，仅 su 会话内＋聊天流系统行）；后续可选。

---

本提案为**产品评估**：已完成调研与设计，**未实施、未测试、未部署**。写集仅本角色设计文档、feature-map、memo、changelog；未改 `app/`、`src/`、`test/`、其他角色文件与证据目录（kanban-live-3 轮次目录、`/private/tmp` 与测试证据目录未触碰），未 git 提交。相关产品导航见[产品功能导航](../../feature-map.md)；同构先例见 [G-1 设计提案](2026-10-16_design_contract-workflow-dispatch.md)。
