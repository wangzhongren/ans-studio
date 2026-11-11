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
  omissionReason: 纯静态单页小游戏，无构建/装配步骤，浏览器直接打开根目录 index.html 即可运行；入口与样式/脚本均由实现角色在 modules 路径内直接创建，无需独立 env/entry 装配角色。
modules:
  - id: game-entry
    name: 页面入口
    purpose: 单页入口 index.html：标题、分数 HUD、画布、操作说明与结束/重开遮罩的静态结构，按固定顺序挂载 src/styles.css 与 src/game.js
    category: app
    path: index.html
    publicContract: "game-entry/v1：DOM 挂载点约定（#score 分数、#game 画布、#overlay 结束遮罩、#restart 重开按钮、#status 状态文本）与脚本加载顺序；经典 script 标签、非 ES module，详见 docs/contracts/snake-game-architecture-v1.md"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-core
    name: 游戏核心
    purpose: 游戏状态机、键盘输入处理、固定步长主循环、食物生成、边界与自碰撞判定、重开复位与 Canvas 2D 渲染实现（src/game.js、src/styles.css）
    category: core
    path: src/
    publicContract: "game-core/v1：浏览器全局经典脚本，暴露 Game 命名空间（init/start/restart/step/render/onKey）；状态机 ready→running→gameover，重开走 restart()；无网络请求、无 ES module、无持久化，详见 docs/contracts/snake-game-architecture-v1.md"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
roles:
  - id: game-implementer
    displayName: 游戏实现者
    purpose: 按架构契约实现并自测单页贪吃蛇：页面入口（index.html）与游戏核心（src/game.js、src/styles.css）
    capability: HTML/CSS/JavaScript（Canvas 2D，无框架、无构建工具）
    modules:
      - game-entry
      - game-core
    review: false
---
# snake-game 人员名单（v1）

- 意图：`docs/product/snake-game-intent-v1.md`（v1）
- 方案：`docs/proposals/snake-game-proposal-v1.md`（v1）
- 模块清单：`docs/proposals/snake-game-modules-v1.md`（v1）
- 架构契约：`docs/contracts/snake-game-architecture-v1.md`（v1）

## 角色与写区

| 角色 | 显示名 | 模块（写区） | 职责 |
| --- | --- | --- | --- |
| game-implementer | 游戏实现者 | `game-entry`（`index.html`）、`game-core`（`src/`） | 实现入口页面与游戏核心逻辑/渲染，并按架构契约自测四项硬验收与基本可运行性 |

- 写区边界：仅 modules 声明的两个路径（`index.html` 文件与 `src/` 目录），不写治理目录与其他角色资料。
- `review: false`：实现角色不作为独立验收角色；验收由工作流内置 verifier 依据意图与架构独立执行，实现者不得自批验收。
- 团队最小化：1 个实现角色承担全部模块（`game-entry` 与 `game-core` 各恰一属主）。

## 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: game-entry
    path: index.html
    roleId: game-implementer
  - id: game-core
    path: src/
    roleId: game-implementer
roles:
  - id: game-implementer
    modules: [game-entry, game-core]
management: [convener, game-implementer]
```
