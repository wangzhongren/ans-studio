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
  - id: game-rules
    name: 游戏规则与状态机
    purpose: "纯逻辑核心：蛇身与网格坐标、固定 tick 移动步进、食物在合法空格随机生成、每食物固定 +10 分、撞墙与自撞判定、待开始/运行/暂停/结束相位、重开重置；维护方向输入队列（容量 2）与禁止反向裁决，不依赖 DOM 与存储实现。"
    category: core
    path: src/core/
    publicContract: "internal（状态快照与方向命令约定，见 docs/contracts/snake-game-architecture-v1.md 第 3、4 节）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: renderer
    name: 渲染与界面展示
    purpose: "渲染层：Canvas 2D 绘制棋盘、蛇与食物，DOM 更新分数、最高分、已暂停提示与结束层（原因/本局分数/最高分/重开提示）；只读状态快照，不修改规则状态、不读写存储。"
    category: ui
    path: src/ui/
    publicContract: "internal（只读状态快照；DOM 元素 id 契约见 docs/contracts/snake-game-architecture-v1.md 第 5 节）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: input-control
    name: 输入控制
    purpose: "输入层：监听 keydown，将方向键与 WASD 归一化为方向请求，Space 映射为暂停/继续、R 映射为重开，并绑定界面「重开」按钮；忽略 event.repeat（按住不加速），不持有游戏状态、不做反向裁决。"
    category: input
    path: src/input/
    publicContract: "internal（键盘到方向/暂停/重开命令的映射契约，见 docs/contracts/snake-game-architecture-v1.md 第 4 节）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: score-storage
    name: 最高分持久化
    purpose: "持久化层：以固定键读写浏览器 localStorage 中的历史最高分，做非负整数解析与异常回落 0；单局结束时比较并按需更新，清空浏览器数据即丢失属预期。"
    category: data
    path: src/score/
    publicContract: "internal（localStorage 键 snake-game:highScore，非负整数；见 docs/contracts/snake-game-architecture-v1.md 第 6 节）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: env-resources
    name: 环境装配资源
    purpose: "环境装配：启动脚本加载顺序、命名空间装配与本地直接打开（file://）说明；不承载游戏规则、渲染与存储逻辑。"
    category: env
    paths: [src/main.js, README.md]
    publicContract: "internal（启动装配与脚本加载顺序约定）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: entry-index
    name: 页面入口与挂载点
    purpose: "页面入口：index.html 提供根挂载点、画布与 HUD/结束层元素，并按序引用经典脚本；承载 DOM 元素 id 契约的根节点。"
    category: entry
    paths: [index.html]
    publicContract: "internal（DOM 挂载点与元素 id 契约，见 docs/contracts/snake-game-architecture-v1.md 第 5 节）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
roles:
  - id: env-bootstrap
    displayName: 环境装配
    purpose: 负责页面入口、脚本加载顺序与装配，保证双击 index.html 即可运行。
    capability: 原生 HTML/CSS 静态资源装配与脚本加载顺序管理
    modules: [env-resources, entry-index]
  - id: game-engine-dev
    displayName: 游戏引擎开发
    purpose: 实现规则状态机、输入映射与最高分持久化，保证 11 条验收步骤的规则/持久化部分可复现通过。
    capability: 原生 JavaScript、状态机与事件处理、浏览器 localStorage
    modules: [game-rules, input-control, score-storage]
  - id: frontend-dev
    displayName: 前端渲染开发
    purpose: 实现 Canvas 棋盘/蛇/食物绘制与 HUD、暂停提示、结束层展示，严格只读状态快照。
    capability: 原生 JavaScript、Canvas 2D、DOM/CSS
    modules: [renderer]
---
# 项目名单：贪吃蛇游戏（snake-game）

- flowId：`snake-game`；版本：v1。
- 引用：意图 `docs/product/snake-game-intent-v1.md`；方案 `docs/proposals/snake-game-proposal-v1.md`；模块 `docs/proposals/snake-game-modules-v1.md`；架构 `docs/contracts/snake-game-architecture-v1.md`。
- 环境装配：本版不省略 `env-bootstrap`（`envBootstrap.omitted: false`），固定拥有 `env-resources`（env）与 `entry-index`（entry）。

## 1. 角色与模块归属

| 角色 id | 显示名 | 模块 | 说明 |
| --- | --- | --- | --- |
| env-bootstrap | 环境装配 | env-resources、entry-index | 固定环境/入口模块，唯一属主 |
| game-engine-dev | 游戏引擎开发 | game-rules、input-control、score-storage | 规则、输入映射与最高分持久化 |
| frontend-dev | 前端渲染开发 | renderer | Canvas 与 DOM 展示，只读快照 |

- 每个模块恰有一个属主；每个角色至少绑定一个模块。
- `env-resources`（category=env）与 `entry-index`（category=entry）只归 `env-bootstrap`。
- 所有模块 `publicContract` 均为非空字符串，指向内部约定与架构文档对应章节。

## 2. 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: game-rules
    path: src/core/
    roleId: game-engine-dev
  - id: renderer
    path: src/ui/
    roleId: frontend-dev
  - id: input-control
    path: src/input/
    roleId: game-engine-dev
  - id: score-storage
    path: src/score/
    roleId: game-engine-dev
  - id: env-resources
    paths: [src/main.js, README.md]
    roleId: env-bootstrap
  - id: entry-index
    paths: [index.html]
    roleId: env-bootstrap
roles:
  - id: env-bootstrap
    modules: [env-resources, entry-index]
  - id: game-engine-dev
    modules: [game-rules, input-control, score-storage]
  - id: frontend-dev
    modules: [renderer]
management: [convener, env-bootstrap, game-engine-dev, frontend-dev]
```

- 拓扑块与 frontmatter 的 `modules[]`、`roles[].modules[]` 完全一致：模块 id 6 个、角色 3 个，属主一一对应。
- `management` 为扁平字符串数组，包含 convener 与全部项目角色 id。

## 3. 版本引用

- 意图：`docs/product/snake-game-intent-v1.md`
- 方案：`docs/proposals/snake-game-proposal-v1.md`
- 模块：`docs/proposals/snake-game-modules-v1.md`
- 架构：`docs/contracts/snake-game-architecture-v1.md`
