---
schema: project-modules/v2
flowId: snake-game
version: 1
modules:
  - id: env-resources
    name: 环境与静态资源
    purpose: 提供本地运行所需的静态资源与样式，零外部依赖、无网络请求
    category: env
    paths:
      - assets/
      - styles/
    publicContract: docs/contracts/snake-game-gamecore-v1.md（静态资源仅本地、无外链）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: entry-index
    name: 入口与装配
    purpose: 入口页面与装配脚本，定义游戏挂载点、脚本加载顺序与启动初始化
    category: entry
    paths:
      - index.html
      - src/main.js
    publicContract: docs/contracts/snake-game-gamecore-v1.md（index.html 为唯一入口；经典 script 顺序加载，禁用 ES module 与 fetch）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-core
    name: 玩法核心
    purpose: 核心玩法状态机：移动与成长、食物生成与吃掉、边界与自身碰撞、计分、重开重置
    category: core
    path: src/core/
    publicContract: docs/contracts/snake-game-gamecore-v1.md（SnakeCore：getState/tick/setDirection/reset）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-ui
    name: 界面渲染与输入
    purpose: 网格与蛇/食物渲染、分数 HUD、结束提示、重开控件，以及键盘输入到方向命令的映射
    category: ui
    path: src/ui/
    publicContract: docs/contracts/snake-game-gamecore-v1.md（只读 state 渲染、输入命令映射与重开调用 reset）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
---

# 模块清单：贪吃蛇游戏（snake-game）v1

依据：docs/product/snake-game-intent-v1.md（v1，已确认）；提案：docs/proposals/snake-game-proposal-v1.md。

本文件是模块的唯一权威源；名单（roster）中的 `modules[]` 为本文件的派生快照。

## 1. 模块表

| id | 名称 | 类别 | 路径 | 职责边界 | publicContract |
| --- | --- | --- | --- | --- | --- |
| env-resources | 环境与静态资源 | env | assets/、styles/ | 仅放本地静态资源与样式；无外链、无构建产物 | docs/contracts/snake-game-gamecore-v1.md（静态资源仅本地、无外链） |
| entry-index | 入口与装配 | entry | index.html、src/main.js | 唯一入口页面、挂载点、脚本加载顺序与启动装配；不放玩法逻辑 | docs/contracts/snake-game-gamecore-v1.md（index.html 为唯一入口；经典 script 顺序加载，禁用 ES module 与 fetch） |
| game-core | 玩法核心 | core | src/core/ | 状态机、移动与成长、食物生成、边界/自身碰撞、计分、reset；不接触 DOM | docs/contracts/snake-game-gamecore-v1.md（SnakeCore：getState/tick/setDirection/reset） |
| game-ui | 界面渲染与输入 | ui | src/ui/ | 只读状态渲染（网格/蛇/食物/HUD/结束提示）、重开控件、键盘输入→方向命令；不实现规则判定 | docs/contracts/snake-game-gamecore-v1.md（只读 state 渲染、输入命令映射与重开调用 reset） |

## 2. 路径与写区

- 所有模块路径互不重叠、互不嵌套：`index.html`、`src/main.js` 为文件；`src/core/`、`src/ui/`、`assets/`、`styles/` 为目录。
- 模块路径不落在治理写区（docs/intents、docs/product、docs/proposals、docs/contracts、.ans 等），源码与文档目录分离。

## 3. 属主分配（名单派生见 roster）

| 模块 | 属主角色 |
| --- | --- |
| env-resources | env-bootstrap |
| entry-index | env-bootstrap |
| game-core | game-core-dev |
| game-ui | game-ui-dev |

每个模块恰有一个属主；env/entry 类别模块仅由 env-bootstrap 拥有。

## 4. 依赖方向

- game-ui → game-core（只读状态 + 命令调用）。
- entry-index → game-core、game-ui（仅加载与装配，不内联规则）。
- game-core 不依赖 game-ui / entry-index。
- env-resources 不被代码逻辑依赖，仅由入口页面引用。

## 5. 契约引用

- 架构与分层：docs/contracts/snake-game-architecture-v1.md
- 接口/数据契约：docs/contracts/snake-game-gamecore-v1.md
