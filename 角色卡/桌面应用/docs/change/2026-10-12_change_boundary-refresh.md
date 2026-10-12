---
id: boundary-refresh
type: change
title: O-1 边界变更后刷新旧快照会话（读盘哈希检出 ⇒ 作废重建 + 如实行）
created: "2026-10-12"
updated: "2026-10-12"
timezone: Asia/Shanghai
status: verified
related: [session-restore, session-comment-refresh]
events:
  - date: "2026-10-12"
    kind: created
    summary: 真机现象（客户「这个问题也要修复一下」）：su 改好 boundary.yaml 后，活会话仍用开会话时的旧边界快照拒写
  - date: "2026-10-12"
    kind: implemented
    summary: session.ts 边界快照指纹（sha256 读盘哈希，开会话定格）+ 陈旧 ⇒ 作废重建（发言/续接/投递/ su-settle 扫描四处检查点）；interface 在 su settle 时触发全量扫描
  - date: "2026-10-12"
    kind: verified
    summary: test/桌面应用 149 计/148 过/1 红（唯一红为既有环境红）；全量 847/844/2 红（两红均既有环境红）；typecheck 0 错
---

# O-1：边界变更后刷新旧快照会话

**来源**：真机现象 + 客户原话「这个问题也要修复一下」。模型自诊断「调用的是会话内缓存的旧规则集」。
**属本角色边界内**（只动 `app/**` + `test/桌面应用/**` + 本页）。

## 检测信号（可信，非界面推测）

- 开会话时定格**边界快照指纹**（`session.ts::LiveSession.boundaryPaths/boundaryPrints`）：参与边界解析的文件
  逐一无状态读盘取 **sha256 内容哈希**——
  ① 角色边界文件（`listing` 枚举的 `boundaryPath`，如 `角色卡/<role>/boundary.yaml`，为空则跳过——内置角色）；
  ② 项目治理边界文件（`project.governanceBoundary.path`，若有——su 的生效边界来源）；
  ③ `.ans/project.json`（恒查；**pin 刷新**即内容变）。
- 判定 `boundaryDiff`：逐文件重哈希比对；任一不同 ⇒ 该会话持有的规则集已**陈旧**。**不靠界面推测、不看 mtime
  抖动**（内容哈希为准）；读盘失败一律记 `<missing>`（幂等保守，不因环境异常误重建）。

## 处置（作废重建 + 如实一行）

- `rebuildIfBoundaryStale(roleId, userInitiated)`：陈旧 ⇒ **dispose → 立即按新边界重开**（`openInternal`）——
  重开沿用 D-1（会话文件在 ⇒ 恢复；缺失/坏 ⇒ 新建）。**在跑的轮次（busy）不打断**（下一时机再查）。
- **如实行**（`boundaryRebuiltLine`，两分支按 D-1 如实，不套旧文案）：
  - 会话文件在：`该角色边界已更新（<变化文件>）——旧会话已作废，按新边界重开。历史已从本地会话文件恢复（模型上下文一并恢复）。`
  - 缺失/坏：`…重开。本地无可用会话文件（新建会话）——模型不会记得以上历史，请重新说明需求。`
  - 重开失败：另起一行如实（`按新边界重开会话失败：<原因>`）。
- **检查点**（四处，均为可信时机）：
  ① `send()` 发言前（陈旧 ⇒ 重建后**本条照常发出**；重建失败 ⇒ 如实回错、本条不发送）；
  ② `openInternal` 续接（点角色）前（陈旧 ⇒ 走新建路径重开，`contextSource` 走既有 D-1 文案链）；
  ③ `drainQueueUnsafe` 投递前（后台路径同样适用；重建失败 ⇒ 队列**保留**待重试，不并发）；
  ④ `refreshStaleBoundaries()`（Interface 在 **su 一轮结束**时 `void` 触发——「边界可能刚被 su 改过」的
     可信时机；逐会话 try/catch 隔离、不上抛）。
- **su 同样适用**（su 的边界=项目治理边界/`.ans` case——同代码路径，不豁免）。

## 测试与证据（2026-10-12；Node v24.14.0 / Darwin arm64 / HEAD d933537）

- 新增 `test/桌面应用/boundary-refresh.test.ts`（**4/4**，真临时目录 + 真读盘哈希）：
  ① 边界文件变更 ⇒ 作废重建 + 如实行（含文件名 + D-1 两分支措辞）+ 指纹刷新后**不重复重建**；未变**不重建**；
  ② **su + `.ans/project.json`（pin 刷新）同样触发**（如实行指出 `.ans/project.json`）；
  ③ 投递路径：目标忙时队列积压 → 改边界 → settled 放行**先重建再投**（队列不丢、内容落到新会话）；
  ④ 接线钉（信号哈希/四处检查点/busy 不打断/措辞两分支）。
- `test/桌面应用` 全套 **149 计 / 148 过 / 1 红**（唯一红=既有环境红 pi-config）；全量 **847/844 · 2 红**
  （两红均既有环境红）；`npm run typecheck` **0 错**。

## 跨角色建议（**不越界改**，请协调方转达门禁引擎/编排）

拒写文案「写入被拒绝：目标路径未匹配任何边界条目」建议在**「盘上边界含该路径、而会话快照不含」**时补一句
线索：「**本会话可能持有旧边界快照——请重开会话后重试**」。O-1 已让下次交互自动重建（多能自愈），但该句
能把残余情形（如正在跑的轮次）指向解法。

## 边界与取舍（如实）

- 检查发生在四处**交互时机**（无轮询计时器）；**在跑的轮次**若边界刚变，该轮仍可能用旧快照（下一时机自愈）——
  不打断在跑轮次是刻意取舍（杀轮次会丢产出）。
- 指纹文件集 = 参与解析的三个来源；若未来边界解析引入新来源，需同步加入 `boundaryPaths`（已登记）。
