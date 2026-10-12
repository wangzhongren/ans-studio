---
id: right-queue-panel
type: change
title: N-3 右栏「待办 / 队列」组（复用 role-state 快照通道）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [message-queue-and-role-state, ui-button-label-and-card-markdown]
events:
  - date: "2026-10-12"
    kind: created
    summary: 客户追加「代办也要在右边显示」（并入 L-1 队列同处）
  - date: "2026-10-12"
    kind: implemented
    summary: role-state 载荷增结构化 queue + running（同源）；ui-labels.js 纯映射（来源标签/截断/位置）；右栏 details.sec 「待办 / 队列」组 + 定点更新（不重排手风琴）
  - date: "2026-10-12"
    kind: verified
    summary: test/桌面应用 149 计/148 过/1 红（唯一红为既有环境红）；全量 847/844/2 红（两红均既有环境红）；typecheck 0 错
---

# N-3：右栏「待办 / 队列」组

**来源**：客户原话「**代办也要在右边显示**」（追加并入 L-1 队列同处）。**属本角色边界内**。

## 数据面（**复用 `session:role-state` 通道——不造第二套数据源**）

- `session.ts::notifyRoleState` 载荷增两字段（与既有 `summaries` **同源构建**）：
  - `queue: {kind, sourceRoleId, summary, at}[]`——排队中的条目（`DeliveryItem.enqueuedAt` 入队即定格）；
  - `running: {...} | null`——**正在跑的那条投递**（投递成功后登记、settled/失败/dispose 撤销；直接 send 的
    一轮不是队列条目，不入此表——**排队 ≠ 已执行**）。
- 通道两端同步：`interface.ts` 依赖类型、`main.ts` 注释（原样透传）、`preload.cjs` 文档。

## 呈现（`renderRight` 新增同级 `details.sec`）

- **分组**：「待办 / 队列」默认**展开**（待办要看得到），计数徽章（无 ⇒「无」）；位于角色卡之后。
- **每行**：位置（排队 1..N；进行中那条显示「**进行中**」并置最前）/ 来源标签（`su 派发` / `客户消息` /
  `回交投递`；未知保守「投递」）/ 摘要 / 入队时间（ISO → 本地时区）。
- **纯映射**（`ui-labels.js`）：`queueSourceLabel`、`shortenQueueItem`（**有界截断 80 + …**——长内容不铺开）、
  `queueItemViews`（逐条视图行，位置/来源/文本/时间）。
- **安全/诚实**：每字段 `esc`（来源/文本/时间/位置——禁直插）；空队列显式占位「（无待办）」；排队条目
  只呈现为「待办」，绝不呈现为已执行。
- **实时性**：`onRoleState` 收到该角色快照且**正看着它** ⇒ `updateRightQueue` **定点更新**（只换
  `#right-queue-body` + 计数，不重排整个手风琴、不重置展开态）；切角色经 `renderRight` 取该角色数据。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin arm64 / HEAD d933537）

- `renderer.test.ts` **N-3 例**：来源三条映射 + 未知占位；长内容截断（≤81、…）；夹具（进行中 + 排队两条）
  → 视图行逐条（`["进行中","1","2"]` 位置 / 来源 / 文本 / 时间原样）；空 ⇒ 无行；渲染侧接线钉
  （订阅/定点更新/仅当前角色/每字段 esc/占位/标题/计数/样式钩子）。
- `message-queue.test.ts`：快照结构断言扩——排队条目（kind/sourceRoleId/summary/ISO at）与「进行中」
  一条（= 刚放行的排队消息；settled 后撤销）。
- e2e 增 `RIGHT_QUEUE_*` 探针（夹具注入 → 3 行/进行中在最前/来源齐全/空占位；本机未跑，如实登记）。
- `test/桌面应用` 全套 **149/148/1**（唯一红=既有环境红）；全量 **847/844 · 2 红**（两红均既有环境红）；
  `npm run typecheck` **0 错**。

## 取舍（如实）

- 「进行中」只覆盖**由队列投递开跑**的一轮；用户直接发的一轮不是队列条目，不在此组伪列。
- 计数徽章含「进行中」那条（默认展开的组，点击数=待处理总数）。
