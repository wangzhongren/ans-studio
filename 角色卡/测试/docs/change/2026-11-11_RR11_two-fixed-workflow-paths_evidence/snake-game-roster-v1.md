---
schema: project-roster/v4
flowId: snake-game
version: 1
intent: docs/product/snake-game-intent-v1.md
proposal: docs/proposals/snake-game-proposal-v1.md
architecture: docs/contracts/snake-game-architecture-v1.md
modulesDoc: docs/proposals/snake-game-modules-v1.md
envBootstrap:
  omitted: false
modules:
  - id: entry-index
    name: 入口页面
    purpose: 游戏入口静态页面：定义画布/分数/状态/重开按钮 DOM 容器，并按序加载全部脚本
    category: entry
    path: index.html
    publicContract: "DOM 契约：#game-canvas、#score、#status、#restart-btn 容器存在，脚本按 core→input→render→app 顺序加载（架构 §4）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: env-resources
    name: 页面外壳资源
    purpose: 页面外壳样式与布局资源：栅格布局、画布边框、分数/状态/按钮样式，支撑 index.html 直接打开可运行
    category: env
    paths:
      - styles/
    publicContract: "样式契约：styles/main.css 提供页面外壳与控件样式类；不包含游戏逻辑，不改变 DOM 契约"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-core
    name: 游戏核心逻辑
    purpose: 纯游戏状态与规则：蛇移动推进、进食增长与计分、边界碰撞判定、重置；不做 DOM 与渲染
    category: core
    path: src/game/
    publicContract: "window.SnakeCore：newGame(config)、tick(state)、setDirection(state,dir)、reset(state)；state 快照结构见架构 §4.1"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: input-control
    name: 键盘输入
    purpose: 监听方向键（↑↓←→）并转换为方向指令交给核心逻辑，阻止页面滚动；仅接受方向键
    category: input
    path: src/input/
    publicContract: "window.KeyboardInput.attach({onDirection}) / detach()：仅映射四个方向键，不直接修改游戏状态（架构 §4.2）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: render-ui
    name: 渲染与界面
    purpose: 按游戏状态快照绘制画布（场地/蛇/食物）、更新分数与状态文本、绑定重开按钮点击
    category: ui
    path: src/render/
    publicContract: "window.Renderer：create({canvas,scoreEl,statusEl})、draw(state)、bindRestart(btn,onRestart)；只读 state 快照（架构 §4.3）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: app-bootstrap
    name: 启动编排
    purpose: 装配核心/输入/渲染并驱动固定间隔游戏循环：tick 推进、渲染刷新、结束态停止与重开复位
    category: app
    path: src/app/
    publicContract: "启动契约：DOMContentLoaded 后自装配；固定 tick 间隔驱动 SnakeCore.tick，并将 state 快照交给 Renderer.draw（架构 §4.4）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
roles:
  - id: env-bootstrap
    displayName: 环境装配
    purpose: 装配游戏入口页面与页面外壳样式资源，保证 index.html 双击直接打开即可运行
    capability: HTML/CSS 静态页面装配与零依赖页面外壳（无构建工具）
    modules: [entry-index, env-resources]
  - id: game-implementer
    displayName: 游戏实现者
    purpose: 实现贪吃蛇核心逻辑、键盘输入、Canvas 渲染与启动编排，交付可玩演示
    capability: 原生 JavaScript（Canvas 2D / DOM）+ CSS；纯逻辑与渲染分离；无构建工具
    modules: [game-core, input-control, render-ui, app-bootstrap]
---
# 人员名单：贪吃蛇游戏（v1）

- flowId：snake-game；version：1
- 依据：intent = docs/product/snake-game-intent-v1.md；proposal = docs/proposals/snake-game-proposal-v1.md；architecture = docs/contracts/snake-game-architecture-v1.md
- 模块权威源：docs/proposals/snake-game-modules-v1.md（本名单 modules[] 为其派生快照，逐项一致）

## 角色与分工

| 角色 id | 显示名 | 职责 | 模块 |
|---------|--------|------|------|
| env-bootstrap | 环境装配 | 入口页面与页面外壳样式资源装配（标准固定角色；env/entry 保留类别归其所有） | entry-index、env-resources |
| game-implementer | 游戏实现者 | 核心逻辑、键盘输入、渲染与启动编排 | game-core、input-control、render-ui、app-bootstrap |

- 最小角色集：2 个角色；每个模块恰有一个属主，每个角色至少绑定一个模块。
- 未引入客户未提出的功能角色；名单不含任何内置治理角色。

## 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: entry-index
    path: index.html
    roleId: env-bootstrap
  - id: env-resources
    path: styles/
    roleId: env-bootstrap
  - id: game-core
    path: src/game/
    roleId: game-implementer
  - id: input-control
    path: src/input/
    roleId: game-implementer
  - id: render-ui
    path: src/render/
    roleId: game-implementer
  - id: app-bootstrap
    path: src/app/
    roleId: game-implementer
roles:
  - id: env-bootstrap
    modules: [entry-index, env-resources]
  - id: game-implementer
    modules: [game-core, input-control, render-ui, app-bootstrap]
management: [convener, env-bootstrap, game-implementer]
```

## 说明

- 拓扑块与 frontmatter modules/roles 完全一致：6 个模块、2 个角色、每模块唯一属主。
- management 为扁平数组，含运营（convener）与全部项目角色。
- 依赖方向与公开契约见架构文档：docs/contracts/snake-game-architecture-v1.md。
