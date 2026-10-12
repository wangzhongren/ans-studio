---
id: handback-render-crash
type: fix
title: 修复真机崩溃：坏形状回交事件喂进 renderHandbackPrompt（未捕获拒绝）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [dispatch-routing-and-injected-style, su-handback-acceptance]
events:
  - date: "2026-10-12"
    kind: created
    summary: 真机 UnhandledPromiseRejection（renderHandbackPrompt 读 undefined.taskId）——定位为投递机 fire-and-forget 路径对事件载荷无形状防御；H-1 泛化后 handback/dispatch 两条渲染路径在同一机内混走，放大了暴露面
  - date: "2026-10-12"
    kind: implemented
    summary: session.ts 三层防御（handleHandback 形状守卫+渲染 try/catch+整体 catch；drainQueue 安全壳包 drainQueueUnsafe；条目正文守卫）；两条「零未捕获拒绝」钉子 + 坏形状如实系统行 + dispatch 不走 handback 渲染断言
  - date: "2026-10-12"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 120 计/119 过/1 红（唯一红为既有环境红）；全量 794 计/791 过/2 红/1 skipped（两红均既有环境红，非本改动）
---

# 真机崩溃修复：坏形状回交事件 → 未捕获拒绝

## 症状与触发条件

真机出现 `UnhandledPromiseRejectionWarning: TypeError: Cannot read properties of undefined
(reading 'taskId')`，栈顶为 `renderHandbackPrompt`（`src/common/编排/handback.ts` 读 `hb.taskId`），
经桌面投递路径（`SessionManager` 的交回投递）被喂入 `undefined`。

## 根因

投递路径是 **fire-and-forget**（`consume` 事件循环里 `void this.handleHandback(...)`）：**任何上抛都会变成
未捕获拒绝**。而事件载荷**没有形状防御**——`{kind:"handback"}` 缺 `handback` 载荷（或载荷缺 `roleId`）时，
`renderHandbackPrompt(undefined)` 直接读 `undefined.taskId` 抛错。**H-1 泛化后**，handback 与 dispatch
两条条目的**渲染路径同处一机**（handback→`renderHandbackPrompt`、dispatch→`renderDispatchPrompt`）——
同一条通道上任何一类形状出格都会以同一种未捕获形态炸出来（本次即 handback 那半）。

## 修复后的行为（三层防御，全部如实、绝不静默）

1. **`handleHandback` 形状守卫**：缺载荷/缺 `roleId` → **如实系统行**「收到一条**形状不符**的回交事件…未投递
   （如实忽略；不崩、不静默）」→ return（**绝不**把坏载荷喂渲染）。
2. **渲染 try/catch**：`renderHandbackPrompt(hb)` 再坏一档也跑不崩——失败 → 如实系统行 + 不入队；
   **`handleHandback` 整体再包一层 catch**（兜底如实一行）。
3. **`drainQueue` 安全壳**：对外壳（`void` 调用面）包 `try/catch` 包住 `drainQueueUnsafe`——投递机任何意外
   都拦截为如实系统行；投递条目增**正文守卫**（缺 `text`/来源 → 丢弃该条并如实记行，不崩）。
   正常路径逐字未动（`drainQueueUnsafe` 即原实现）。
4. **全仓同类调用点核查**：`renderHandbackPrompt`/`renderDispatchPrompt` 在 `app/**` 的调用点**只有两处**
   （`handleHandback` 入队定格、`routeDispatch` 入队定格——后者入参已先过 `roleId/task` 校验）；
   渲染侧对 `ev.handback` 缺载荷已有 `if (!hb) return;` 防御（A-5 既有）。**无其它同类风险点**。

## 回归验证（bounded）

- **零未捕获拒绝钉子（进程级）**：`handback-delivery.test.ts` 与 `dispatch-delivery.test.ts` 各挂
  `process.on("unhandledRejection")` 计数——驱动「缺载荷 / 缺 roleId 的 handback 事件」与「正常 dispatch
  投递 + 坏回交并入同机」后，**断言计数为 0**；坏形状均**如实系统行**、**不投递**。
- **两条渲染路径不混走**：dispatch 条目投递文本 = 入队定格的派发模板（断言逐字相等），不经
  `renderHandbackPrompt`。
- `npm run typecheck` → **0 错**；`test/桌面应用` → **120 计 / 119 过 / 1 红**（唯一红为**既有环境红**
  pi-config，未动）；全量 → **794 / 791 / 2 红 / 1 skipped**（两红均既有环境红，非本改动）。

## 已知边界（如实）

- 坏形状事件的**上游来源**（谁发出缺载荷的 handback）未在本轮追查——桌面侧按「事件可能是坏的」防御；
  若编排侧确有发出坏事件的路径，属其边界（建议其自查 `handbackEvent`/`withHandback` 的组装）。
- 与 H-1 文案临时实现（`renderDispatchPromptLocal`）的切换登记不变——切换时本修复的钉子继续生效。
