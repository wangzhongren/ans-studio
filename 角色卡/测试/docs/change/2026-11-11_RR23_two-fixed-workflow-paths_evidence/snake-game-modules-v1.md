---
schema: project-modules/v2
flowId: snake-game
version: 1
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
---

# 贪吃蛇游戏 · 模块清单 v1

本文件是模块划分的唯一权威源；名单文档的 `modules[]` 是本文件的派生快照，必须逐项一致。

## 1. 模块与写入根

| 模块 id | 名称 | 类别 | 写入根 | 属主角色（见名单） |
| --- | --- | --- | --- | --- |
| env-resources | 环境与静态资源 | env | `assets/` | env-bootstrap |
| entry-index | 入口与页面外壳 | entry | `index.html` | env-bootstrap |
| game-state | 游戏状态与规则 | core | `src/game-state.js` | game-core |
| game-loop | 主循环与节拍 | core | `src/game-loop.js` | game-core |
| input | 键盘输入 | input | `src/input.js` | ui-input |
| render | 渲染与界面反馈 | ui | `src/render.js` | ui-input |
| score | 计分与最高分持久化 | core | `src/score.js` | score-persist |
| app-shell | 应用装配 | core | `src/app-shell.js` | game-core |

所有写入根均为项目相对路径、互不重叠：`assets/` 为目录，`index.html` 与 `src/*.js` 为独立文件，均不落在 `.ans/`、`角色卡/`、`docs/` 等治理写区。

## 2. 依赖方向

- `game-state`：无依赖，纯规则与数据。
- `score`：仅操作游戏对象中的分数与最高分，不反向依赖渲染或输入。
- `game-loop`：不感知具体模块，只通过注入的 `tick`/`draw` 回调驱动。
- `input`：只产生输入事件，不直接修改游戏状态。
- `render`：只读游戏状态与分数，不修改业务数据。
- `app-shell`：唯一装配者，依赖以上全部模块；模块之间不互相直接引用，统一经 `window.SnakeGame` 命名空间交互。

依赖方向单向：`app-shell` → {`game-state`,`game-loop`,`input`,`render`,`score`} → 基础数据；不存在反向依赖或循环依赖。

## 3. 单文件装配顺序

交付物 `index.html` 为自包含单文件（内联 CSS/JS，无外链）。`entry-index` 由 env-bootstrap 按以下固定顺序内联各模块源码，保证 `window.SnakeGame` 命名空间就绪后再启动：

1. `src/game-state.js`
2. `src/score.js`
3. `src/game-loop.js`
4. `src/input.js`
5. `src/render.js`
6. `src/app-shell.js`（`DOMContentLoaded` 后调用 `SnakeGame.app.init()`）

装配只做原文内联，不改写模块语义；各模块源码以 IIFE 包装并向 `window.SnakeGame` 挂载公开 API。

## 4. 一模块一任务的派生约定

每个模块的写入根互不重叠，可按模块 id 派生独立写集与独立任务；模块间接口以架构契约 `docs/contracts/snake-game-architecture-v1.md` 为准。`entry-index` 的最终装配依赖其余模块源码就绪，派发时应排在其他模块之后（或先产出外壳、待模块完成后重新装配）。
