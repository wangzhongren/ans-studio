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
  - id: env-resources
    name: 环境与静态资源
    purpose: 存放页面静态资源（图标等），提供无构建运行所需的资源目录
    category: env
    paths: [assets/]
    publicContract: "static-assets：assets/ 下资源按页面相对路径引用，不引入构建步骤"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: entry-index
    name: 页面入口
    purpose: 浏览器入口页面，装配画布、分数区、结束态与重开按钮并加载脚本
    category: entry
    paths: [index.html]
    publicContract: "page-entry：浏览器直接打开 index.html 即可启动游戏"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-core
    name: 游戏核心
    purpose: 规则与状态机：移动推进、食物生成、碰撞判定、计分、结束与重开复位
    category: core
    path: src/game.js
    publicContract: "window.SnakeGame：{ createGame(config), reset(), tick(), getState() }（纯逻辑，不依赖 DOM）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-ui
    name: 游戏界面
    purpose: Canvas 渲染、键盘输入处理、分数显示、结束态提示与重开按钮绑定
    category: ui
    path: src/ui.js
    publicContract: "window.SnakeUI：{ mount(game), render(state), onKeydown(event) }（依赖 window.SnakeGame）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-style
    name: 页面样式
    purpose: 页面布局、画布容器、分数与重开按钮的视觉样式
    category: ui
    path: styles.css
    publicContract: "styles：页面与游戏区域样式约定，入口页按相对路径引用"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
roles:
  - id: env-bootstrap
    displayName: 环境装配
    purpose: 维护静态资源目录与页面入口，保证浏览器可直接打开运行
    capability: 无构建静态页面装配 / HTML / 资源目录管理
    modules: [env-resources, entry-index]
  - id: game-core-dev
    displayName: 游戏核心开发
    purpose: 实现规则与状态机（移动、食物、碰撞、计分、重开复位）
    capability: 原生 JavaScript / 状态机 / 逻辑测试
    modules: [game-core]
  - id: game-ui-dev
    displayName: 游戏界面开发
    purpose: 实现 Canvas 渲染、键盘输入、分数显示、结束态与重开交互及页面样式
    capability: Canvas 2D / DOM 与键盘事件 / CSS
    modules: [game-ui, game-style]
---

## 1. 角色与模块归属

| 角色 | 模块 | 职责 |
| --- | --- | --- |
| env-bootstrap | env-resources、entry-index | 静态资源目录与页面入口 |
| game-core-dev | game-core | 规则与状态机 |
| game-ui-dev | game-ui、game-style | 渲染、输入、交互与样式 |

## 2. 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: env-resources
    paths: [assets/]
    roleId: env-bootstrap
  - id: entry-index
    paths: [index.html]
    roleId: env-bootstrap
  - id: game-core
    path: src/game.js
    roleId: game-core-dev
  - id: game-ui
    path: src/ui.js
    roleId: game-ui-dev
  - id: game-style
    path: styles.css
    roleId: game-ui-dev
roles:
  - id: env-bootstrap
    modules: [env-resources, entry-index]
  - id: game-core-dev
    modules: [game-core]
  - id: game-ui-dev
    modules: [game-ui, game-style]
management: [convener, env-bootstrap, game-core-dev, game-ui-dev]
```

## 3. 说明

- 每个模块恰有一个属主；每个角色至少绑定一个模块。
- 模块路径互不重叠、互不嵌套：`assets/`、`index.html`、`styles.css` 为项目根条目，`src/game.js` 与 `src/ui.js` 为同级文件。
- 名单依据 `docs/proposals/snake-game-proposal-v1.md`、`docs/proposals/snake-game-modules-v1.md`、`docs/contracts/snake-game-architecture-v1.md` 与 `docs/product/snake-game-intent-v1.md`（v1）。
