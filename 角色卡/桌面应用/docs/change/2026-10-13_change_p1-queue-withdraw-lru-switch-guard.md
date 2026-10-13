---
id: p1-queue-withdraw-lru-switch-guard
type: change
title: P1 三条（桌面侧）——待办最小管理面（看全文 + 撤回）、LRU 淘汰避开 busy、切换项目一次性防呆
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [right-queue-panel, message-queue-and-role-state, click-to-bottom, state-machine-and-replay-dedup]
events:
  - date: "2026-10-13"
    kind: created
    summary: 客户裁定产品提案 P1-1/P1-2/P1-3 全部实施（提案原文 角色卡/产品/docs/design/2026-10-13_design_desktop-ux-improvement-proposal.md §P1-1/§P1-2/§P1-3，逐条按提案+验收口径办）
  - date: "2026-10-13"
    kind: implemented
    summary: P1-1——快照条目增 id/full；SessionManager.withdraw（仅未投递客户消息可撤、进行中/派发回交/不存在如实回错）；抽屉行「全文」展开 + 「撤回」（撤回行如实、位次前移走既有快照）；P1-2——evictBeyondLimit 跳过 busy + keepRoleId（正在开启者不淘汰）+ settled 收口为「下一时机」；P1-3——busy 时切换项目出内联确认条（#chat 之外、不落聊天历史）、取消零动作、确认关全部并进新项目；顺带修排队消息投递误走派发文案的错口径
  - date: "2026-10-13"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 178 计/177 过/1 红（唯一红=既有环境红）；全量 950 计/947 过/2 红（两红均既有环境红）；e2e E2E_DONE=1（244 true；QUEUE_*/Q_WITHDRAW_/DISPATCH_ROW_NO_WITHDRAW/QUEUED_EXECUTION_ORDER_1_3/SWITCH_* 全 true）
---

# P1 三条（桌面侧）：待办管理面 / LRU 避开 busy / 切换防呆

**来源**：客户裁定产品提案 P1-1/P1-2/P1-3 全部实施（提案原文见 `角色卡/产品/docs/design/`；
逐条按提案「提案+验收口径」办）。**属本角色边界内**。

## P1-1 排队待办最小管理面（看全文 + 撤回）

- **看全文**：role-state 快照条目增 `full`（= `DeliveryItem.text`，**入队即定格的全文**）——抽屉条目行在
  「全文比显示摘要更长」时出「全文」钮（`.q-toggle`，短消息不摆无用钮），点击 `.q-full` 展开（抽屉内，
  不新开窗口；`pre-wrap` 渲染全文，esc 单一来源）。**不新开窗口、不做重排序/批量清理/优先级**（提案明示不做）。
- **撤回**：`SessionManager.withdraw(roleId, id)`（`id` = 快照 `dedupKey`，单一数据源）——
  - **仅「客户消息」类、仅未投递者**可撤：出队即删 + `notifyRoleState`（位次/角标随既有快照机制自然前移，
    **不造第二套界面状态**）；渲染侧成功即聊天流如实一行「已撤回排队消息：〈摘要〉」。
  - **已进「进行中」⇒ 撤回无效**：如实回「该条已进入「进行中」，撤回无效（它正在被执行）。」——
    **绝不**从执行里抽掉已在跑的东西（进行中条目已 shift、不在队列，撤回按 `activeDeliveries` 先行辨认）。
  - **派发/回交只读**：经理层拒非 message 条目（「派发/回交属治理流」）；界面侧仅 message 且非进行中
    的行出「撤回」钮——**呈现与语义同口径**。
  - IPC：`session:withdraw`（preload/main/Interface 三层透传，同形既有 session:* 通道）。
- **实现坑（已修，留钉）**：`dedupKey` 含 NUL（`msg\u0000…`）——**裸放进 HTML 属性会被解析替换成
  U+FFFD**，撤回定位键随即损坏（e2e 实测踩中）；属性侧 `encodeURIComponent`、处理器侧
  `decodeURIComponent` 配对往返。
- **顺带修一处错口径**：排队后的**客户消息**投递时原误落派发文案分支（「已接收来自 X 的派发任务…」——
  消息不是派发）；现按 handback / dispatch / message 三类各归各位，message **不加额外文案**
  （消息本体随会话事件出现，真实 pi 的「用户指令：」回显走注入样式行）。
- **验收（e2e）**：忙时连发 3 条（UI 真实路径）→ 抽屉 3 行、各带撤回、长文带全文（`QUEUE_ROWS_THREE`/
  `QUEUE_WITHDRAW_ON_MESSAGES`/`QUEUE_FULL_TOGGLE_ON_LONG`）→ 展开全文 `QUEUE_EXPAND_FULL` → 撤第 2 条
  （`Q_WITHDRAW_LINE` 聊天流如实一行 + `QUEUE_ROWS_AFTER_WITHDRAW` 队列减一）→ 释放后**执行序 = 第 1、3 条**
  （`QUEUED_EXECUTION_ORDER_1_3`：demo 收包记录逐字核对，被撤条目绝不进入执行）；派发条目
  `DISPATCH_ROW_NO_WITHDRAW`（无撤回钮）。

## P1-2 LRU 淘汰避开 busy（提案首选方案）

- `evictBeyondLimit` 挑选判据加 **`!busy`**（在跑轮次的不淘汰——含 B-2 下切走的后台轮次）；
  **无可回收者（全忙 / 只剩刚开启的）⇒ 允许暂时超限**，待某会话 settled（consume 的 settled 收口 =
  「下一时机」）再收。
- **`keepRoleId`**：本次**正在开启**的那一个不淘汰（否则「除它之外全忙」时会把用户刚点的会话当场回收——
  开启即失效）。openInternal 传 `req.roleId`，settled 收口的回收不设 keep。
- 切回被淘汰者的提示链路（D-1 recovered/rebuilt 文案）**逐字未动**——不出现第二套文案（既有
  `contextSource` 用例覆盖）。
- **验收（单测）**：B 在跑且最久未用时开第 4 个 → B 不被淘汰（淘汰最久未用的非忙者）；全忙开第 4 个 ⇒
  暂超限一个不掐断；某会话 settled ⇒ 下一时机精确回收（在跑的其余角色不受影响）。

## P1-3 「切换项目」一次性防呆

- 点「切换项目」时若存在 busy 会话（**role-state 真实快照**判据），聊天流**顶部**出内联确认条
  `#switch-confirm`（非系统对话框）：「有 N 个角色正在工作，切换项目会停止它们——[仍要切换] [取消]」。
- **取消 = 什么都不发生**（仅隐藏条；项目/会话原样）。**确认 = 关闭全部并进新项目**（走原导入流程——
  `loadProject` 首步 `stopSession(null)`「关闭全部」即「会停止它们」的兑现）。**无 busy ⇒ 行为逐字不变、零提示**。
- **不落聊天历史**：确认条放在 `#chat` **之外**（聊天头与本栏之间）——它不进行表、不回放、切项目随重置；
  快照推送时刷新计数、**归零（轮次自己结束）自动收起**（防呆不再有意义）。
- **验收（e2e）**：真忙（慢轮缝）时点切换 → 确认条出现且文案含「1 个角色正在工作…」（`SWITCH_CONFIRM_ON_BUSY`）
  + 不在 #chat 内（`SWITCH_BAR_NOT_IN_CHAT`）；取消后 live 会话清单不变（`SWITCH_CANCEL_NOOP`）；再点并确认
  （选择器桩返回 REPO_ROOT）→ 全部会话关闭 + 项目重载（`SWITCH_CONFIRM_RELOADED`）；重载后空闲时点切换
  → 零提示直达选择器（`SWITCH_NO_CONFIRM_WHEN_IDLE`/`SWITCH_IDLE_HINT`）。e2e harness 的目录选择器同步改
  **桩**（`nextPickPath`；真对话框会挂住 e2e）。

## 测试与证据（2026-10-13；Node v24.14.0 / Darwin arm64）

- **新单测** `queue-withdraw-lru.test.ts`（2 例）：撤回四态（未投递可撤 + 位次前移 + id/full 在快照里；
  进行中无效如实；回交只读；不存在如实）＋「消息投递不落派发文案」反向钉；LRU 两局（挑非忙者 / 全忙暂超限
  → settled 收口回收 / keepRoleId）。
- `renderer.test.ts` +3（P1-1 UI 判据/文案/全链通道/快照 id·full；P1-2 源码钉；P1-3 位置/判据/两端/样式）。
- **e2e** 新增 15 检查点全 true（见上三节验收）。
- `npm run typecheck` → **0 错**；`node --test "test/桌面应用/**/*.test.ts"` → **178 计 / 177 过 / 1 红**
  （唯一红＝既有环境红）；全量 → **950 计 / 947 过 / 2 红**（两红均既有环境红）；e2e → **E2E_DONE=1**
  （244 true / 2 个既有预期 false）。
