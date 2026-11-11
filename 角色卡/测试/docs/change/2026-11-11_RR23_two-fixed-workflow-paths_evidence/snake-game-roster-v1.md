---
schema: project-roster/v3
flowId: snake-game
version: 1
intent: docs/product/snake-game-intent-v1.md
proposal: docs/proposals/snake-game-proposal-v1.md
architecture: docs/contracts/snake-game-architecture-v1.md
modulesDoc: docs/proposals/snake-game-modules-v1.md
envBootstrap:
  omitted: false
modules:
  - id: env-resources
    name: 环境与静态资源
    purpose: 承载离线运行所需的静态资源目录；约束项目仅使用本地相对资源，禁止 CDN、外链字体与任何网络请求。
    category: env
    paths:
      - assets/
    publicContract: "internal（资源契约：仅本地相对引用，assets/ 可为空，禁止任何网络依赖）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: entry-index
    name: 入口与页面外壳
    purpose: 交付自包含单文件 index.html：页面结构、深色样式、分数面板、开始/暂停/结算提示区、内联脚本装配与启动入口。
    category: entry
    path: index.html
    publicContract: "internal（入口契约：双击离线可玩，不引用任何外部脚本、样式或资源）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-state
    name: 游戏状态与规则
    purpose: 维护 20×20 网格、蛇身与食物、方向缓冲、移动推进、撞墙/自撞判定、吃食物增长与状态机（ready/playing/paused/over）。
    category: core
    path: src/game-state.js
    publicContract: "internal（状态 API：SnakeGame.state.createGame/start/changeDirection/tick/restart）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-loop
    name: 主循环与节拍
    purpose: 固定步长调度游戏节拍（初始 7 格/秒，每吃 5 个食物 +1 格/秒，上限 12 格/秒），以 requestAnimationFrame 解耦渲染，提供开始/暂停/恢复/停止。
    category: core
    path: src/game-loop.js
    publicContract: "internal（循环 API：SnakeGame.loop.createLoop({tick,draw}) 及其 start/stop/pause/resume）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: input
    name: 键盘输入
    purpose: 监听方向键与 WASD，映射方向并交给规则层过滤直接反向；P 暂停/继续，R 重开；阻止方向键与空格滚动页面。
    category: input
    path: src/input.js
    publicContract: "internal（输入 API：SnakeGame.input.attach({onDirection,onPauseToggle,onRestart,onStart}) 及 detach）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: render
    name: 渲染与界面反馈
    purpose: Canvas 绘制 20×20 网格、蛇、食物；深色高对比配色；渲染当前分/最高分面板及开始/暂停/结算提示；保持 ≥30fps 的绘制。
    category: ui
    path: src/render.js
    publicContract: "internal（渲染 API：SnakeGame.render.createRenderer({canvas,scoreEl,highScoreEl,statusEl}) 的 draw/setStatus）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: score
    name: 计分与最高分持久化
    purpose: 每吃一个食物 +10 分；维护当前分与最高分；用 localStorage 键 snake-game.highScore.v1 持久化最高分；重开清零当前分并保留最高分；存储不可用时内存降级且不崩溃。
    category: core
    path: src/score.js
    publicContract: "internal（计分 API：SnakeGame.score.createScoreStore/onFood/getHighScore/onGameOver）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: app-shell
    name: 应用装配
    purpose: 组装状态、循环、输入、渲染与计分模块，编排启动/暂停/重开/结算流程与错误兜底，暴露 SnakeGame.app.init()。
    category: core
    path: src/app-shell.js
    publicContract: "internal（装配 API：SnakeGame.app.init()；模块间仅经 window.SnakeGame 命名空间交互）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
roles:
  - id: env-bootstrap
    displayName: 环境装配
    purpose: 维护环境/静态资源边界，并把各模块源码装配为可离线双击运行的自包含单文件入口。
    capability: HTML/CSS 装配、内联打包（无构建工具）、静态资源管理、离线运行约束核验
    modules: [env-resources, entry-index]
  - id: game-core
    displayName: 游戏核心
    purpose: 实现游戏规则、状态机、固定节拍主循环与应用装配，保证四项核心能力的行为口径与验收一致。
    capability: 原生 JavaScript、状态机、固定步长循环、模块装配与错误兜底
    modules: [game-state, game-loop, app-shell]
  - id: ui-input
    displayName: 界面与输入
    purpose: 实现键盘输入映射与 Canvas 渲染，提供深色高对比画面、分数面板与开始/暂停/结算提示。
    capability: Canvas 2D、DOM、键盘事件、devicePixelRatio 适配
    modules: [input, render]
  - id: score-persist
    displayName: 计分与持久化
    purpose: 实现每食物 +10 的计分规则与最高分 localStorage 持久化，含重开清零与存储不可用降级。
    capability: 原生 JavaScript、Web Storage、容错与降级处理
    modules: [score]
---

# 贪吃蛇游戏 · 项目名单 v1

- 依据意图：`docs/product/snake-game-intent-v1.md`
- 依据方案：`docs/proposals/snake-game-proposal-v1.md`
- 依据模块清单：`docs/proposals/snake-game-modules-v1.md`
- 依据架构：`docs/contracts/snake-game-architecture-v1.md`

## 1. 角色与职责

| 角色 id | 名称 | 职责 | 负责模块 |
| --- | --- | --- | --- |
| env-bootstrap | 环境装配 | 环境/资源边界；将各模块源码内联装配为自包含单文件 `index.html` 并核验离线运行 | env-resources、entry-index |
| game-core | 游戏核心 | 规则、状态机、固定节拍循环与应用装配 | game-state、game-loop、app-shell |
| ui-input | 界面与输入 | 键盘输入、Canvas 渲染、面板与状态提示 | input、render |
| score-persist | 计分与持久化 | 计分规则、最高分持久化、重开清零与降级 | score |

## 2. 模块属主映射与可写目录

| 模块 id | 属主角色 | 可写路径 |
| --- | --- | --- |
| env-resources | env-bootstrap | `assets/` |
| entry-index | env-bootstrap | `index.html` |
| game-state | game-core | `src/game-state.js` |
| game-loop | game-core | `src/game-loop.js` |
| input | ui-input | `src/input.js` |
| render | ui-input | `src/render.js` |
| score | score-persist | `src/score.js` |
| app-shell | game-core | `src/app-shell.js` |

约束：

- 每个模块恰有一个属主；每个角色至少负责一个模块；路径互不重叠。
- `env-resources`（category=env）与 `entry-index`（category=entry）仅归 env-bootstrap。
- 角色只能写自己负责模块的路径；跨模块读取允许，跨模块写入禁止；不得写入 `.ans/`、`角色卡/`、`docs/` 等治理区。

## 3. 依赖与实施顺序

1. `game-state` → `score` → `game-loop` → `input` → `render` → `app-shell`（接口以架构 v1 为准，可并行开发，按依赖就绪集成）。
2. `entry-index` 的最终装配依赖以上模块源码就绪，排在其后（或先出外壳、待模块完成后重新装配）。
3. 各模块接口变更须先更新架构契约版本，再同步模块与名单引用。

## 4. 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: env-resources
    paths: [assets/]
    roleId: env-bootstrap
  - id: entry-index
    path: index.html
    roleId: env-bootstrap
  - id: game-state
    path: src/game-state.js
    roleId: game-core
  - id: game-loop
    path: src/game-loop.js
    roleId: game-core
  - id: input
    path: src/input.js
    roleId: ui-input
  - id: render
    path: src/render.js
    roleId: ui-input
  - id: score
    path: src/score.js
    roleId: score-persist
  - id: app-shell
    path: src/app-shell.js
    roleId: game-core
roles:
  - id: env-bootstrap
    modules: [env-resources, entry-index]
  - id: game-core
    modules: [game-state, game-loop, app-shell]
  - id: ui-input
    modules: [input, render]
  - id: score-persist
    modules: [score]
management: [convener, env-bootstrap, game-core, ui-input, score-persist]
```

## 5. 说明

- 本名单是招人与派发实现的唯一依据；角色卡由任命流程按本名单机械创建，不在本文件内定义。
- 名单不含验收角色（review 标记）；验收由独立验收流程按意图 A1–A9 执行。
