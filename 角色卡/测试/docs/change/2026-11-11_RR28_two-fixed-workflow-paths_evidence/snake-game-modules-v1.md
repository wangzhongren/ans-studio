---
schema: project-modules/v2
flowId: snake-game
version: 1
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
---
# snake-game 模块清单（v1）

依据意图：`docs/product/snake-game-intent-v1.md`（v1）；方案：`docs/proposals/snake-game-proposal-v1.md`（v1）；架构：`docs/contracts/snake-game-architecture-v1.md`（v1）。

| 模块 id | 名称 | 路径 | 类别 | 说明 |
| --- | --- | --- | --- | --- |
| game-entry | 页面入口 | `index.html` | app | 根目录单页入口与 DOM 挂载点 |
| game-core | 游戏核心 | `src/` | core | 全部游戏逻辑与渲染（`src/game.js`、`src/styles.css`） |

- 模块路径互不重叠、互不包含（根文件 `index.html` 与兄弟目录 `src/`）。
- 实现写区限定为上述两个路径；不在治理写区（`.ans/`、`docs/` 等）内。
- 未包含 env/entry 保留类别模块：纯静态单页无构建/装配步骤，入口即 `index.html`，由实现角色在模块路径内直接创建。
