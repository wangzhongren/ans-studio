---
id: message-queue-and-role-state
type: change
title: L-1 每角色任务队列（可见性 + 客户消息入队）+ 状态准确性（真实信号 + 图标化）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [su-handback-acceptance, dispatch-routing-and-injected-style, k-input-capsule-and-images]
events:
  - date: "2026-10-12"
    kind: created
    summary: 客户裁定 L-1「每个角色如果正在工作，应该可以有个队列的概念，可以派发到队列里面去」（现为直接失败）+ 状态准确性「执行的时候这个状态显示不对吧…应该用图标来表示」
  - date: "2026-10-12"
    kind: implemented
    summary: 客户消息并入同一投递机（第三类 kind=message）；session:role-state 真实快照（busy×队列摘要）；徽标图标化 + 「工作中 · N 待办」；队列行；顺带修复两处真机缺陷（自动开 su 抢活动角色、双 drain 并发抢队列）
  - date: "2026-10-12"
    kind: verified
    summary: test/桌面应用 136 计/135 过/1 红（唯一红为既有环境红）；全量 830/827/2 红（两红均既有环境红）；typecheck 0 错
---

# L-1 每角色任务队列 + 状态准确性（真实信号 + 图标化）

**来源**：客户裁定（2026-10-12）。原话：①「每个角色如果正在工作，应该可以有个队列的概念，可以派发到队列
里面去」+「现在是直接失败」；②「执行的时候这个状态显示不对吧…应该用图标来表示」。
**属本角色边界内**（只动 `app/**` + `test/桌面应用/**` + 本页）。

## L-1：客户消息入队（不再直接失败）+ 队列可见

- **入队**（`session.ts::send`）：角色忙（会话条目 `busy`）时，消息作为**第三类** `DeliveryItem`
  （`kind:"message"`）并入**同一条**投递机（E-1 回交 / H-1 派发共用，不造第二套）；按到达序在当前任务
  结束后执行；空闲路径**逐字不变**。返回 `{ok:true, queued:true, position:N}`——界面如实提示
  「已入队：等它完成当前任务后处理（第 N 位）」。
- **可见性**：主进程在**忙/闲切换与队列变化**时外推 `session:role-state`（`{roleId, busy, summaries}`）：
  ① 左树徽标「◐ 工作中 · N 待办」；② 该角色会话流里一条**队列行**（原位更新、常驻流尾）：
  「【队列】N 条待办：<第 1 条摘要>（另有 N-1 条）——等它完成当前任务后依次处理。」；清空即移除。
- **摘要**：`你：<首段 40 字>…`（`shortenText`；客户消息**不去重**——同文重复=两个意图，逐条独立键）。
- **失败语义不变**：排队消息投递失败 → 如实系统行「排队消息投递失败（角色 X）：…——**未丢弃**，已保留
  待重试（下次时机自动重试）」+ **放回队首**；传输失败（空闲路径）仍如实回 `{ok:false,error}`。
- **不做（登记）**：**无优先级/抢占**（队列按到达序；改序/插队未做）；CLI 前端不做同等队列（一次性会话，另议）。

## 状态准确性（重点）：只许真实信号 + 图标化

- **判据只许真实信号**（`deriveRoleStatus` 的 facts）：`busy`＝主进程会话 busy 标志（开跑 / settled /
  dispose 时外推；**B-2 下切走的后台轮次同样计入**）；`queueDepth`＝投递队列密度（入队/出队时外推）；
  `live`＝保活表；`dispose` 即真实信号（会话移出保活表）。**界面侧推测已退役**——旧的「本端刚发过消息
  就算在跑」`working` 事实**从纯函数判据里删除**（喂它不再影响派生，反向断言钉死）。
- **复现 → 修后**（`message-queue.test.ts`，真跑一轮=投递开跑的 su 轮次，界面从未发过消息）：
  - 复现：旧事实组合 `{live:true, hadSession:true}` → `deriveRoleStatus`＝**"idle"**——「其实在跑却显示空闲」；
  - 修后：主进程真实快照 `busy:true` → **"working"**；settled 后回 "idle"；有排队待办（`queueDepth>0`）
    **不得**显示空闲。
- **图标化**（`role-status.js`，唯一映射）：七态 `{icon, label, className, title}`——○未开启 / ●空闲 /
  ◐工作中 / ?等待你确认 / ■已停止 / ✕错误 / ◌空闲（已恢复）；`title`=更完整描述（+ 最近事件与时间）。
  图标为单字符文本字形（非 emoji）。
- **措辞唯一**：状态里的「停止」**全应用只此一处**（`STOPPED_LABEL="已停止"`）——七态标签与悬停描述里
  「停止」均只出现在 stopped；渲染侧代码（去注释）不得自写第二份（反向断言钉死）。

## 顺带修复的两处真机缺陷（本轮窗口内发现，如实登记）

1. **自动开 su 抢「活动角色」**→用户下一条消息**错发到 su**（回交/派发自动开启属后台动作）：
   `open` 拆 `openInternal(req, userInitiated)`——**后台自动开启不改 `activeRoleId`**（`openForRoleId`
   语义相应收窄为「最近一次**用户发起**的 open」）。测试钉：自动开 su 后 `openForRoleId()==="A"` 且
   send 落到 A、不落 su。
2. **投递机并发重入**（多触发点：入队/开尾/settled/派发/回交同时 drain 同一队列）→ su 被**重复开启**两个
   会话 + 误报「投递条目形状不符」：加**串行门** `drainChains`（每项目一条 Promise 链；`drainQueueUnsafe`
   不再被并发重入，重复触发只排队不叠加）。测试钉：并发触发下 su 只开一次、零「形状不符」误报。
3. **演示 adapter 缺 `settled` + send 置忙时序**（L-1 依赖「一轮结束」信号）：demo 适配器补发
   `settled`（对齐真实适配器 `agent_settled`——**绝不可删**，否则忙态永不复位）；`send` 改**先置忙再
   await**（与投递机同款，防快适配器事件先到被反向覆盖）。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin arm64 / HEAD d933537）

- 新增 `test/桌面应用/message-queue.test.ts`（7 例）：入队/位次/摘要截断/失败保留/传输失败如实/复现对照/
  队列待办不空闲/接线钉子（含渲染侧无推测的反向断言）。
- `renderer.test.ts`：B-3 组重写为「真实信号 + 图标 + 待办后缀 + 措辞唯一」；`operator-channel.test.ts`
  注入判据扩 (c)（见 shell-arm 文档补丁节）。
- `test/桌面应用` 全套 **136 计 / 135 过 / 1 红**（唯一红＝既有环境红 pi-config）；全量 **830/827 · 2 红**
  （两红均既有环境红）。`npm run typecheck` 0 错。e2e 增 `ROLE_STATE_*` 探针并同步 composer 探针（未在本机跑，如实登记）。
