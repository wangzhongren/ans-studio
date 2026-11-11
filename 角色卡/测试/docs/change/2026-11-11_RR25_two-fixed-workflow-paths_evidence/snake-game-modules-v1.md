---
schema: project-modules/v2
flowId: snake-game
version: 1
modules:
  - id: game-core
    name: 游戏核心逻辑
    purpose: 贪吃蛇状态机与规则：蛇身、食物、分数、方向队列、边界与自撞判定；纯逻辑不触碰 DOM
    category: core
    path: src/core/
    publicContract: "internal（核心公开接口：createGame / step / setDirection / getSnapshot，约定见 docs/contracts/snake-game-architecture-v1.md）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-ui
    name: 渲染与输入
    purpose: canvas 栅格渲染、方向键/WASD 键盘输入、分数与结束态显示、重开按钮与页面装配
    category: ui
    path: src/ui/
    publicContract: "internal（UI 层通过 window.SnakeUI 暴露 mount/render 接口；只消费核心快照，不反向修改核心内部状态）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: app-entry
    name: 页面入口
    purpose: index.html 页面骨架；按顺序加载脚本并启动游戏
    category: integration
    path: index.html
    publicContract: "internal（入口只做装配：加载 src/core/game.js 与 src/ui/ 下脚本，并调用 SnakeUI.mount）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: acceptance-record
    name: 验收记录
    purpose: 保存四项验收的演示步骤、结论与截图证据，由验收角色维护
    category: acceptance
    path: docs/acceptance/
    publicContract: "internal（验收记录目录：按验收项编号 AC1–AC4 归档演示步骤与截图）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
---

# 模块清单：贪吃蛇小游戏（snake-game）v1

本清单遵循 `schema: project-modules/v2`，与提案 `docs/proposals/snake-game-proposal-v1.md`（v1）及架构 `docs/contracts/snake-game-architecture-v1.md`（v1）一致。

## 模块表

| id | 名称 | 类别 | 路径 | 属主 | 职责边界 |
| --- | --- | --- | --- | --- | --- |
| game-core | 游戏核心逻辑 | core | src/core/ | game-core-dev | 状态机与规则：蛇身、食物、分数、方向队列、边界与自撞判定；不含任何 DOM/渲染代码 |
| game-ui | 渲染与输入 | ui | src/ui/ | game-ui-dev | canvas 渲染、键盘事件、分数与结束态显示、重开按钮、页面装配；只调用核心公开接口 |
| app-entry | 页面入口 | integration | index.html | app-integrator | 页面骨架与脚本加载顺序、启动装配；不承载游戏规则 |
| acceptance-record | 验收记录 | acceptance | docs/acceptance/ | qa-reviewer（验收角色） | 四项验收的演示记录与截图归档；不写实现代码 |

## 依赖方向

`app-entry` → `game-ui` → `game-core`；`game-core` 不依赖任何上层模块，也不读取 DOM；`game-ui` 只通过公开接口读取状态快照，不修改核心内部结构。

## 固定环境/入口模块说明

本项目为纯静态单页、无构建、无第三方依赖，直接打开 `index.html` 即可运行，因此按名单规则写 `envBootstrap: {omitted: true}`（真实理由见名单文件），不设 env-bootstrap 角色；入口 `index.html` 使用普通类别 `integration` 由实现角色持有。

## 路径约束

- 各模块路径互不相同、互不包含：`src/core/`、`src/ui/`、`index.html`、`docs/acceptance/`。
- 均不落在治理写区（.ans/、角色卡/、docs/intents|product|proposals|contracts|scheduling|quality|verification|skills|mcp|audit/ 等）。
- `docs/acceptance/` 为验收记录目录，属验收角色专属，实现角色不得写入。
