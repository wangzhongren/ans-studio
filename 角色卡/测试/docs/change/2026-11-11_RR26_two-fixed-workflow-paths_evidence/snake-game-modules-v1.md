---
schema: project-modules/v2
flowId: snake-game
version: 1
modules:
  - id: game
    name: 游戏实现
    purpose: 贪吃蛇全部游戏规则与画面/交互的单模块实现（网格与坐标、每步前进、方向合法性与禁 180 度反向、撞墙/撞自判定、吃食物计分与增长、食物合法空位生成、渲染、键盘适配、固定步长主循环、结束冻结与重开）
    category: core
    path: src/game.js
    publicContract: "window.SnakeGame 对外接口（init/getState/reset）与内部规则约定；DOM 挂载点与样式类见 docs/contracts/snake-game-architecture-v1.md 第 4 节"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: env-resources
    name: 环境资源
    purpose: 页面静态样式与环境资源（纯色几何风格，棋盘/画布/HUD/结束层的布局与视觉效果），不含任何游戏规则
    category: env
    paths:
      - styles.css
    publicContract: "样式类约定 .board/.hud/.overlay/.hidden 等（internal，环境资源；不得承载规则逻辑）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: entry-index
    name: 入口页
    purpose: 单页文档入口，声明画布/HUD/结束层与重开按钮的 DOM 结构，并以传统 script 方式加载 styles.css 与 src/game.js（零构建、file:// 本地可直接打开）
    category: entry
    paths:
      - index.html
    publicContract: "文档入口 index.html；DOM id 契约（#game-canvas/#score/#high-score/#overlay/#restart-btn）见架构契约第 4 节"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
---
