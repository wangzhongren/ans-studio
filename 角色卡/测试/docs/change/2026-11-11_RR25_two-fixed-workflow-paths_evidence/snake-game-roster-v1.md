---
schema: project-roster/v4
flowId: snake-game
version: 1
intent: docs/product/snake-game-intent-v1.md
proposal: docs/proposals/snake-game-proposal-v1.md
architecture: docs/contracts/snake-game-architecture-v1.md
modulesDoc: docs/proposals/snake-game-modules-v1.md
envBootstrap:
  omitted: true
  omissionReason: 纯静态单页游戏，无构建步骤、无第三方依赖、无环境装配需求，直接打开 index.html 即可运行，故不设 env-bootstrap 角色与 env/entry 模块
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
roles:
  - id: game-core-dev
    displayName: 核心逻辑开发
    purpose: 实现游戏状态机与规则，保证边界/自撞/计分/方向过滤口径与架构一致
    capability: 原生 JavaScript（状态机、无 DOM 纯逻辑、单元自测）
    modules:
      - game-core
  - id: game-ui-dev
    displayName: 渲染与输入开发
    purpose: 实现 canvas 渲染、键盘输入、分数与结束态显示、重开按钮与页面装配
    capability: 原生 JavaScript、Canvas 2D、DOM 事件
    modules:
      - game-ui
  - id: app-integrator
    displayName: 入口集成
    purpose: 实现 index.html 页面骨架与脚本加载顺序，完成启动装配
    capability: HTML、classic script 装配、页面调试
    modules:
      - app-entry
  - id: qa-reviewer
    displayName: 验收记录
    purpose: 按四项验收逐条在浏览器演示并记录证据，维护 AC1–AC4 验收档案
    capability: 功能验收、浏览器演示、截图与证据归档
    modules:
      - acceptance-record
    review: true
---

# 人员名单：贪吃蛇小游戏（snake-game）v1

本名单遵循 `schema: project-roster/v4`（使用 v4 仅为支持 `roles[].review` 验收角色字段），依据意图 `docs/product/snake-game-intent-v1.md`（v1）、提案 `docs/proposals/snake-game-proposal-v1.md`（v1）、模块清单 `docs/proposals/snake-game-modules-v1.md`（v1）与架构 `docs/contracts/snake-game-architecture-v1.md`（v1）编制。

## 说明

- **env-bootstrap 省略**：纯静态单页、无构建、无依赖、直接打开 `index.html` 即可运行，故 `envBootstrap: {omitted: true}`，不设 env-bootstrap 角色，也不含 env/entry 类别模块；入口 `index.html` 以普通类别 `integration` 归 `app-integrator`。
- 实现角色三个（core / ui / entry），与模块一一对应，每模块恰一属主；验收角色 `qa-reviewer` 仅拥有 `acceptance-record`（`docs/acceptance/`），不拥有任何实现模块路径，`review: true` 至多一个。
- 各角色写区仅覆盖自己名下模块路径；角色 id 均非内置 id。

## 人员与模块归属

| 角色 id | 显示名 | 模块 | 路径 |
| --- | --- | --- | --- |
| game-core-dev | 核心逻辑开发 | game-core | src/core/ |
| game-ui-dev | 渲染与输入开发 | game-ui | src/ui/ |
| app-integrator | 入口集成 | app-entry | index.html |
| qa-reviewer（验收） | 验收记录 | acceptance-record | docs/acceptance/ |

## 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: game-core
    path: src/core/
    roleId: game-core-dev
  - id: game-ui
    path: src/ui/
    roleId: game-ui-dev
  - id: app-entry
    path: index.html
    roleId: app-integrator
  - id: acceptance-record
    path: docs/acceptance/
    roleId: qa-reviewer
roles:
  - id: game-core-dev
    modules: [game-core]
  - id: game-ui-dev
    modules: [game-ui]
  - id: app-integrator
    modules: [app-entry]
  - id: qa-reviewer
    modules: [acceptance-record]
management: [convener, game-core-dev, game-ui-dev, app-integrator, qa-reviewer]
```

## 验收协作

验收角色 qa-reviewer 在实现角色交付后按 AC1–AC4 逐条演示并记录；证据写入 `docs/acceptance/`，实现角色不得写该目录。验收标准以意图四项为准，本名单不新增验收项。
