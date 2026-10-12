---
id: dispatch-receipt-queue
type: change
title: 派发受理回执的单一来源（L-1）：入队与位置如实回执；队列归属前端
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [governed-interaction-and-chat-ux, su-dispatch-wiring]
events:
  - date: "2026-10-12"
    kind: designed
    summary: 设计稿 governed-interaction-and-chat-ux §L-1（客户：每角色一个队列，可派发到队列）；H-1 已定路由/排队归前端
  - date: "2026-10-12"
    kind: implemented
    summary: 编排实施——formatDispatchReceipt（受理回执文案单一来源：忙=入队+位置+受理≠完成；空闲=现状文案）；队列归属结论=前端，未造第二套
  - date: "2026-10-12"
    kind: verified
    summary: test/编排 159/159（+2）；typecheck 本角色零错；全量 820 计/815 过（4 红=2 既有环境 + 2 桌面在途）
---

# L-1 每角色任务队列（编排侧）：回执单一来源 + 约定

> 依据：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §L-1（客户原话：「每个角色如果正在工作，应该可以有个队列的概念，可以派发到队列里面去」）。H-1 已定「前端路由（开/排队/去重/失败保留）归桌面」——本次不改变归属。

## 队列归属的结论：**前端（桌面）持有；编排不造第二套**

- **设计依据**：H-1 明确「前端路由（桌面，复用 E-1 那套）：未开会话 → 自动开；忙 → 排队；失败/超时 → 如实提示 + 保留」。单队列语义（每角色至多一个在跑、其余按到达序）是**投递机**的属性。
- **现状核实**：桌面投递机已实现——`app/desktop/session.ts`：按 `${projectRoot}\0${targetRoleId}` 的**到达序数组**（`enqueueDelivery` push）、目标忙则积压、其 `settled` 后按序放行（`drainQueue`）、E-1/H-1 **共用一套**、按名去重窗口。**编排侧不新增队列**（否则=第二套队列，违背「杜绝两份实现」）。
- **编排侧交付**：把「受理回执怎么说」统一为**单一来源**（下节），并约定接口；队列生命周期（开/排/放行/保留）仍归前端。

## 改在哪里（位置 → 改动）

**`src/common/编排/handback.ts`（一个纯函数；无接线变更）**
- **新增 `formatDispatchReceipt({ targetRoleId, sessionOpen, queuePosition? })`**——`dispatch_task` 路由实现受理时生成回执 `message` 的**单一来源**（工具如实转达 su）：
  - **目标忙（已入队）**：`已受理：目标忙，已入队（第 N 位）；受理 ≠ 完成。`
    ——**位置口径**：入队后该条目在本角色队列中的序号（1 起、FIFO 按到达序），由**队列持有方**（前端）计算传入。
  - **未入队（空闲/正在投递）**：`已受理：任务将投递给角色 <id> 的会话[（其会话未开——将自动开启）]；投递结果/失败会在其聊天流与 su 的聊天流如实显示（受理≠已完成）。`（**按现状文案**，含「未开→自动开启」如实提示。）
  - **受理 ≠ 完成必须在场**（两形态都写死）；校验失败/去重等其它回执分支仍归路由实现如实填写。
- **事件外推（未新增任何冻结类型）**：入队 → 本回执即含**位置**；出队/投递成功/失败 → 桌面既有 `emitDeliveryNote` 系统行（如实、不静默）；完成 → 目标回交（E-1 自动投递回 su）。**既有事件流已覆盖队列变化**——本层不另立事件类型；若前端要更细的队列可视，由桌面在其事件面内扩（其自有工作）。

## 如何确认（实际结果）

- `test/编排/handback.test.ts`（**17 例全绿**，L-1 新增 2）：
  1. 回执文案——忙：明说「入队」+「第 2 位」+「受理 ≠ 完成」；空闲：现状文案（未开 → 「将自动开启」；已开 → 不带该提示；「投递结果/失败…如实显示」渠道在）。
  2. **到达序（假件驱动）**：同一目标队列两条派发 → 回执位置 1、2（按到达序）；出队 A→B（FIFO）；清空后转「空闲」回执（不带位置）。
- `test/编排/` **159/159**；`npm run typecheck` 本角色零错；全量 `node --test "test/**/*.test.ts"`（引号带）**820 计 / 815 过 / 4 红 / 1 skipped**——4 红逐条归因：2 条**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）+ 2 条**桌面在途**（`test/桌面应用/interface.test.ts:106`、`session.test.ts:43`，其「可见性」实现进行中）。**本角色零红**。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。
- 真实端到端（su 真派发、目标真忙、队列真放行）属**客户跑**。

## 跨角色（请 pm 转达）

- **桌面应用**：`routeDispatch` 的受理回执切到 `formatDispatchReceipt`（一行；忙分支需传目标队列长度+1 作 `queuePosition`，空闲分支传 `sessionOpen`）；其 `renderDispatchPromptLocal` 占位可切到已落的 `renderDispatchPrompt`（H-1 单一来源）。队列本身与本文档的约定（单队列/到达序/受理≠完成/失败保留）不变，仅回执文案收敛到一处。
