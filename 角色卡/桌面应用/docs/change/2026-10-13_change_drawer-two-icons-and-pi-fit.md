---
id: drawer-two-icons-and-pi-fit
type: change
title: 待办/队列归角色（图标簇两枚、两节并入角色资料抽屉）+ Pi 面板抽屉内溢出修复
created: "2026-10-13"
updated: "2026-10-13"
timezone: Asia/Shanghai
status: verified
related: [chat-stream-declutter-and-md-tables, right-queue-panel, markdown-and-multisession]
events:
  - date: "2026-10-13"
    kind: created
    summary: 客户真机复现两项——「代办是不是应该放在角色里面是不是更好呢。不用放在顶部呢。这个是和角色相关的」（图标簇待办/队列两枚退役，视图并入角色资料抽屉）+「Pi 设置面板横向溢出」（窗口 1516px 时输入框画到 x≈1538–1869、越出窗口右缘）
  - date: "2026-10-13"
    kind: implemented
    summary: index.html 图标簇收敛为两枚（tab-card/tab-pi）；renderer.js renderTabs 角标改挂 card、renderRight card 分支变六节（待办/队列 + 队列概览两节入角色资料）、updateRightQueue 同刷两节、队列概览抽成 queueOverviewHtml、tab-todo/tab-queue 接线删除；styles.css 抽屉内 .pi-field 堆叠 + 抽屉 overflow:hidden + 未展开面板双保险不可见 + 删 940px 档死规则
  - date: "2026-10-13"
    kind: verified
    summary: typecheck 0 错；test/桌面应用 163 计/162 过/1 红（唯一红=既有环境红）；e2e E2E_DONE=1（新检查点 NO_RETIRED_TABS / RIGHT_HAS_TODO_SECTION / RIGHT_HAS_OVERVIEW_SECTION / BADGE_ON_CARD_WHILE_COLLAPSED / QUEUE_OVERVIEW_IN_CARD / PI_NO_OVERFLOW / PI_NARROW_NO_OVERFLOW〔900px 最窄抽屉档〕全 true）
---

# 待办/队列归角色 + Pi 面板抽屉内溢出修复

**来源**：客户两轮裁定（真机复现）——
1. 「代办是不是应该放在角色里面是不是更好呢。不用放在顶部呢。这个是和角色相关的」——待办/队列视图
   归角色，顶部图标簇不再单列两枚；
2. Pi 设置面板在抽屉内**横向溢出**（窗口 1516px，面板内输入框落在 x≈1538–1869，越出窗口右缘）。
**属本角色边界内**（`app/renderer/**`、`test/桌面应用/**`、本文档）。

## 1. 待办/队列归角色（图标簇两枚）

- **index.html**：`#right-tabs` 收敛为**两枚**——`tab-card`（角色资料，title 注明「含待办 / 队列」）与
  `tab-pi`（Pi 设置）；`tab-todo`/`tab-queue` 删除。注释同步改口径。
- **renderer.js**：
  - `renderTabs()`：角标改挂 **card**——`setTabBadge("card", queueViewsFor(选中角色).length)`，继承原待办
    图标角标语义（进行中+排队，同一 role-state 快照、无新数据源；>0 才显示，收起不丢信息）；
    高亮轮询只剩 `["card","pi"]`。`setTabBadge("todo"/"queue")` 调用删除。
  - `renderRight()` card 分支：既有四组（角色卡/边界/变更/文档）**逐字保留**，插入**待办 / 队列**节
    （`#right-queue-body`，进行中+排队完整视图，`right-queue-count` 计数）与**队列概览**节
    （`#right-queue-overview`，仅排队条目的位次视图，默认收起）——两节即原独立 tab 的内容**逐字搬入**，
    打开时跟随当前选中角色；`todo`/`queue` 分支与 `titles` 里的对应键删除。
  - `queueOverviewHtml(roleId)`：从原 queue tab 分支抽成的函数（内容一字不动），供 renderRight 与
    定点更新共用。
  - `updateRightQueue(roleId)`：**一次同刷两节**（`#right-queue-body` 与 `#right-queue-overview`）——
    仍为定点更新，不重排手风琴、不重置展开态；某节不在当前渲染（抽屉收起）时跳过该节。
  - 绑定区：`tab-todo`/`tab-queue` 的 click 接线删除（不留死代码）。
- **不动的**：左树徽标（含「 · N 待办」）、`#op-chip`、role-state 快照通道、队列行（聊天流内
  `【队列】N 条待办`）、`queueViewsFor`/`queueRowsHtml`/`UiLabels` 纯映射。

## 2. Pi 面板抽屉内溢出修复

根因：`.pi-field` 的 `grid-template-columns: 200px minmax(0, 1fr)` 标签列是按**旧右栏列宽**设计的；
面板迁入抽屉（268–360px）后并排装不下。修复（`styles.css`）：

- `#right-drawer .pi-field { grid-template-columns: 1fr; align-items: start; gap: 4px; }`——抽屉内字段
  **堆叠**（标签一行、输入一行），输入框吃满整行宽度、随抽屉宽度弹性收缩（`.pi-input` 既有
  `min-width: 0`）；窄窗（≤1100px → 抽屉 268px 最窄档）同样不溢出、不裁切。
- `#right-drawer { overflow: hidden; }`——抽屉为**裁剪边界**：任何内容（面板/长词/宽表）都不得画到
  抽屉矩形之外，溢出在抽屉内滚动。
- `#right-drawer .pi-panel { min-width: 0; }`——面板作为 flex 项不撑破抽屉。
- 双保险 `#right-drawer:not(.open) #pi-panel { visibility: hidden; }`——抽屉未展开（transform 藏在视口
  右外）时面板一律不可见：即使显隐状态失步，也不会把输入框画到窗口右缘之外（真机所见几何）。
- 删 940px 媒体查询里 `.pi-field { grid-template-columns: 150px … }` 死规则（面板只在抽屉，抽屉内一律堆叠）。
- 面板字段、保存/掩码/凭据纪律**一字未动**（只动容器内布局）。

## 3. 测试与证据（2026-10-13；Node v24.14.0 / Darwin arm64）

- `renderer.test.ts` 右栏抽屉钉整组改写：图标簇**两枚**（tab-todo/tab-queue 在 HTML 与渲染侧接线都断言
  不存在）；角标 = `setTabBadge("card", views.length)`（选中角色待办深度）；两节在角色资料渲染里
  （`right-queue-body`/`right-queue-overview` 逐字保留 + `updateRightQueue` 同刷两节）；Pi 抽屉内不溢出
  四钉（堆叠/`min-width:0`/抽屉 `overflow:hidden`/未展开不可见）。
- e2e（真实 Electron，`ANS_E2E_OUTDIR` 临时目录）：`TABS_PRESENT` 改两枚 + 新 `NO_RETIRED_TABS`；
  `RIGHT_HAS_TODO_SECTION`/`RIGHT_HAS_OVERVIEW_SECTION`（六节在抽屉内）；`BADGE_ON_CARD_WHILE_COLLAPSED`/
  `BADGES_CLEAR_ON_EMPTY`（角标归 card）；`QUEUE_OVERVIEW_ROWS`/`QUEUE_OVERVIEW_IN_CARD`/
  `TAB_CARD_ACTIVE_STILL`；**Pi 几何检查点** `PI_STACKED_FIELDS`/`PI_NO_OVERFLOW`（1360px）+
  **窄窗口** `PI_NARROW_WINDOW=900`/`PI_NARROW_STACKED`/`PI_NARROW_NO_OVERFLOW`（900px ≤1100px 裁定线，
  抽屉最窄 268px 档；`win.setSize` 缩放重测后恢复）。
- `npm run typecheck` → **0 错**；`node --test "test/桌面应用/**/*.test.ts"` → **163 计 / 162 过 / 1 红**
  （唯一红＝既有环境红 `pi-config.test.ts` 检出目录名断言）；e2e → **E2E_DONE=1**，新增检查点全 true，
  既有检查点无回归。
