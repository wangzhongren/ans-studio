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
roles:
  - id: env-bootstrap
    displayName: 装配入口
    purpose: 维护入口页面、脚本加载顺序与本地静态资源/样式，保证双击即可运行
    capability: HTML/CSS 静态页面与原生脚本装配
    modules: [env-resources, entry-index]
    review: false
  - id: game-core-dev
    displayName: 玩法核心开发
    purpose: 实现并维护核心玩法状态机、碰撞判定与计分规则
    capability: 原生 JavaScript 状态机与算法实现
    modules: [game-core]
    review: false
  - id: game-ui-dev
    displayName: 界面与交互开发
    purpose: 实现渲染、分数显示、结束提示、重开控件与键盘输入映射
    capability: 原生 JavaScript DOM/CSS 渲染与事件处理
    modules: [game-ui]
    review: false
---

# 人员名单与模块拓扑：贪吃蛇游戏（snake-game）v1

依据：docs/product/snake-game-intent-v1.md（v1，已确认）；提案：docs/proposals/snake-game-proposal-v1.md；模块清单：docs/proposals/snake-game-modules-v1.md；架构：docs/contracts/snake-game-architecture-v1.md。

## 1. 角色与职责

| 角色 id | 名称 | 职责 | 模块 | review |
| --- | --- | --- | --- | --- |
| env-bootstrap | 装配入口 | 入口页面、挂载点、脚本加载顺序、本地静态资源与样式 | env-resources、entry-index | false |
| game-core-dev | 玩法核心开发 | 状态机、移动成长、食物生成、边界/自身碰撞、计分、重开重置 | game-core | false |
| game-ui-dev | 界面与交互开发 | 网格与蛇/食物渲染、分数 HUD、结束提示、重开控件、键盘输入映射 | game-ui | false |

- 本名单 3 个角色均为项目实现角色；chief/product/rapporteur/nominator/convener/verifier 为内置治理角色，不列入。
- 无角色被标记为项目验收角色（review 全为 false）；验收由验收流程/独立验证执行。
- env-bootstrap 为固定装配/入口角色，持有 env 类别 `env-resources` 与 entry 类别 `entry-index`；未省略。

## 2. 任命推荐顺序

名单顺序即任命推荐顺序：

1. **env-bootstrap**：先落入口页面、加载顺序与静态资源骨架，确定工程可本地打开。
2. **game-core-dev**：按接口契约实现 core 状态机与规则。
3. **game-ui-dev**：按契约实现渲染与输入，调用 core 完成交互与重开。

依赖关系：env-bootstrap 定壳 → game-core-dev 与 game-ui-dev 在契约冻结后并行 → env-bootstrap 集成核对入口加载顺序。

## 3. 模块归属与写区

| 模块 | 类别 | 路径 | 属主 |
| --- | --- | --- | --- |
| env-resources | env | assets/、styles/ | env-bootstrap |
| entry-index | entry | index.html、src/main.js | env-bootstrap |
| game-core | core | src/core/ | game-core-dev |
| game-ui | ui | src/ui/ | game-ui-dev |

每个模块恰好一个属主；路径互不重叠、互不嵌套；env/entry 仅归 env-bootstrap。

## 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: env-resources
    paths: [assets/, styles/]
    roleId: env-bootstrap
  - id: entry-index
    paths: [index.html, src/main.js]
    roleId: env-bootstrap
  - id: game-core
    path: src/core/
    roleId: game-core-dev
  - id: game-ui
    path: src/ui/
    roleId: game-ui-dev
roles:
  - id: env-bootstrap
    modules: [env-resources, entry-index]
  - id: game-core-dev
    modules: [game-core]
  - id: game-ui-dev
    modules: [game-ui]
management: [convener, env-bootstrap, game-core-dev, game-ui-dev]
```

## 4. 协作约定

- game-core-dev 与 game-ui-dev 以 docs/contracts/snake-game-gamecore-v1.md 为冻结接口，不得单方变更状态结构或方法签名；需要变更时先出新版契约再改实现。
- game-ui 不复制规则逻辑（碰撞、计分、食物生成）到界面层；只读状态并渲染、把输入转成命令。
- env-bootstrap 的加载顺序（assets/styles → src/core → src/ui → src/main）为契约一部分，改动需同步入口与架构文档。
