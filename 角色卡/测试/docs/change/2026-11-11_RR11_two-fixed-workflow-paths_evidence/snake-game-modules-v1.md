---
schema: project-modules/v2
flowId: snake-game
version: 1
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
---
# 模块清单：贪吃蛇游戏（v1）

- flowId：snake-game；version：1
- 依据：docs/product/snake-game-intent-v1.md（version 1）；提案：docs/proposals/snake-game-proposal-v1.md
- 架构来源：docs/contracts/snake-game-architecture-v1.md

## 模块表

| id | name | category | path | 职责 |
|----|------|----------|------|------|
| entry-index | 入口页面 | entry | index.html | 页面容器与脚本加载顺序 |
| env-resources | 页面外壳资源 | env | styles/ | 页面外壳/控件样式 |
| game-core | 游戏核心逻辑 | core | src/game/ | 状态推进、计分、边界碰撞、重置 |
| input-control | 键盘输入 | input | src/input/ | 方向键监听与方向指令 |
| render-ui | 渲染与界面 | ui | src/render/ | 画布渲染、分数/状态显示、重开按钮 |
| app-bootstrap | 启动编排 | app | src/app/ | 装配与固定 tick 循环 |

## 说明

- 模块路径互不重叠/不嵌套：`index.html`（文件）、`styles/`、`src/game/`、`src/input/`、`src/render/`、`src/app/` 均同父或不同父，互不包含。
- `entry` / `env` 为保留类别，仅由标准角色 `env-bootstrap` 拥有；本清单中对应模块归 `env-bootstrap`。
- `publicContract` 均为非空字符串契约说明，详细契约正文见架构文档 §4。
- 每个模块的属主分配见名单：`docs/proposals/snake-game-roster-v1.md`。
