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
roles:
  - id: env-bootstrap
    displayName: 环境装配
    purpose: 装配单页入口与静态环境资源，保证 index.html 与 styles.css 在桌面浏览器本地 file:// 直接打开即可加载游戏，并在交付前自测无控制台报错
    capability: 静态页面装配、HTML/CSS、浏览器本地 file:// 运行校验
    modules: [env-resources, entry-index]
  - id: game-owner
    displayName: 游戏实现者
    purpose: 在 src/game.js 中实现并维护全部游戏规则、渲染、键盘输入、固定步长主循环、结束冻结与重开，按 A1–A10 自测可玩闭环
    capability: 原生 JavaScript（ES2020）、Canvas 2D、DOM 事件与定时器
    modules: [game]
---
# snake-game 人员名单 v1

- 产品意图：`docs/product/snake-game-intent-v1.md`（v1）
- 提案：`docs/proposals/snake-game-proposal-v1.md`
- 模块清单：`docs/proposals/snake-game-modules-v1.md`
- 架构契约：`docs/contracts/snake-game-architecture-v1.md`

## 1. 角色与职责
| 角色 id | 显示名 | 职责 | 能力要求 |
| --- | --- | --- | --- |
| env-bootstrap | 环境装配 | 负责入口页与静态环境资源：`index.html`、`styles.css`；保证本地 `file://` 打开可正确加载样式与脚本 | 静态页面装配、HTML/CSS、本地运行校验 |
| game-owner | 游戏实现者 | 负责 `src/game.js`：规则、渲染、输入、主循环、结束与重开；按 A1–A10 自测 | 原生 JavaScript、Canvas 2D、DOM 事件与定时器 |

## 2. 模块属主与路径
| 模块 id | 路径 | 属主 | 公开契约 |
| --- | --- | --- | --- |
| game | `src/game.js` | game-owner | `window.SnakeGame`（init/getState/reset），DOM 与样式约定见架构契约第 4 节 |
| env-resources | `styles.css` | env-bootstrap | 样式类约定（internal，不含规则） |
| entry-index | `index.html` | env-bootstrap | 文档入口与 DOM id 契约 |

每个模块恰有一个属主，路径互不重叠、互不嵌套。

## 3. 协作关系与边界
- 依赖方向：entry-index（`index.html`）加载 env-resources（`styles.css`）与 game（`src/game.js`），为单向依赖；env-resources 不承载逻辑；game 不反向依赖页面结构，只通过架构契约第 4 节的 DOM id 与 `window.SnakeGame` 契约交互。
- 变更边界：game 模块所依赖的 DOM id 或脚本入口路径如需变更，须同步更新架构契约并出新版本，不得静默修改。
- 验收：由验收角色按 A1–A10 逐条人工试玩核对；本名单不设验收角色模块，验收职责由治理侧验收角色承担。

## 4. 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: game
    path: src/game.js
    roleId: game-owner
  - id: env-resources
    paths: [styles.css]
    roleId: env-bootstrap
  - id: entry-index
    paths: [index.html]
    roleId: env-bootstrap
roles:
  - id: env-bootstrap
    modules: [env-resources, entry-index]
  - id: game-owner
    modules: [game]
management: [convener, env-bootstrap, game-owner]
```
