---
schema: project-roster/v4
flowId: snake-game
version: 1
intent: docs/product/snake-game-intent-v1.md
proposal: docs/proposals/snake-game-proposal-v1.md
modulesDoc: docs/proposals/snake-game-modules-v1.md
architecture: docs/contracts/snake-game-architecture-v1.md
envBootstrap:
  omitted: false
modules:
  - id: env-resources
    name: 环境与资源
    purpose: 交付说明、启动方式与操作说明，保障本机可直接打开运行
    category: env
    path: README.md
    publicContract: internal（启动与交付说明约定）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: entry-index
    name: 页面入口
    purpose: 单页入口、DOM 容器与脚本装配，只装配不承载游戏规则
    category: entry
    path: index.html
    publicContract: internal（DOM 容器与脚本装配约定）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-loop
    name: 主循环与编排
    purpose: tick 循环、模块装配、游戏结束与重开编排
    category: core
    path: src/main.js
    publicContract: internal（循环与编排接口）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-state
    name: 游戏状态
    purpose: 蛇与食物状态、移动推进、蛇身增长与食物生成、结束状态机
    category: core
    path: src/state.js
    publicContract: internal（GameState 状态与变更接口）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: collision
    name: 碰撞判定
    purpose: 封闭边界碰撞（非穿墙）与自撞判定的纯函数判定
    category: feature
    path: src/collision.js
    publicContract: internal（碰撞判定纯函数）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: scoring
    name: 计分
    purpose: 进食加分规则与分数累计，重开时归零
    category: feature
    path: src/score.js
    publicContract: internal（计分规则：每次进食 +1）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: restart
    name: 重开
    purpose: 重开触发后的状态归零编排（蛇、食物、分数、结束态）
    category: feature
    path: src/restart.js
    publicContract: internal（reset 状态归零约定）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: input-control
    name: 键盘输入
    purpose: 方向键解析、方向合法性校验与最后有效方向选择
    category: feature
    path: src/input.js
    publicContract: internal（方向输入接口）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: render
    name: 渲染与反馈
    purpose: 绘制网格/蛇/食物、显示分数与游戏结束提示，只读状态
    category: feature
    path: src/render.js
    publicContract: internal（只读渲染接口）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: acceptance-qa
    name: 项目验收
    purpose: 按意图 A1–A4 口径编写人工验收清单、记录可观察结果
    category: qa
    path: qa/
    publicContract: internal（人工验收清单与操作步骤）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
roles:
  - id: env-bootstrap
    displayName: 环境装配与入口
    purpose: 装配单页入口与交付说明，保障浏览器直接打开即可运行
    capability: HTML/JS、静态资源装配与启动说明
    modules: [env-resources, entry-index]
  - id: game-core-dev
    displayName: 游戏核心开发
    purpose: 实现主循环、蛇与食物状态、计分、重开与边界碰撞编排
    capability: JavaScript、游戏状态机与碰撞算法
    modules: [game-loop, game-state, collision, scoring, restart]
  - id: game-ui-dev
    displayName: 交互与渲染开发
    purpose: 键盘方向输入校验与画面/分数/结束提示渲染
    capability: JavaScript、DOM/Canvas 渲染与键盘事件
    modules: [input-control, render]
  - id: game-qa
    displayName: 项目验收
    purpose: 按意图 A1–A4 口径做人工验收并记录可观察结果
    capability: 手工操作验证、验收清单编写
    modules: [acceptance-qa]
    review: true
---

# 名单 · 贪吃蛇（snake-game）v1

- 依据意图：`docs/product/snake-game-intent-v1.md`
- 提案：`docs/proposals/snake-game-proposal-v1.md`
- 模块清单：`docs/proposals/snake-game-modules-v1.md`
- 架构与契约：`docs/contracts/snake-game-architecture-v1.md`

## 人员与职责

| 角色 id | 名称 | 模块 | 职责 |
| --- | --- | --- | --- |
| env-bootstrap | 环境装配与入口 | env-resources, entry-index | 入口装配、启动与交付说明 |
| game-core-dev | 游戏核心开发 | game-loop, game-state, collision, scoring, restart | 逻辑、状态、计分、重开、碰撞 |
| game-ui-dev | 交互与渲染开发 | input-control, render | 键盘输入、渲染与可观察反馈 |
| game-qa | 项目验收（review=true） | acceptance-qa | A1–A4 人工验收与记录 |

说明：

- 每个模块恰有一个属主，每个角色至少绑定一个模块；角色之间模块不重叠。
- `env-bootstrap` 为固定角色，独占 `env-resources`（env）与 `entry-index`（entry）两个固定模块。
- 内置 verifier 由幕僚直派，不写入本生产名单与派发链；`game-qa` 为项目内人工验收角色（review=true），其角色卡与边界按任命流程建立。
- `management` 为扁平数组，含 convener 与全部项目角色。

## 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: env-resources
    path: README.md
    roleId: env-bootstrap
  - id: entry-index
    path: index.html
    roleId: env-bootstrap
  - id: game-loop
    path: src/main.js
    roleId: game-core-dev
  - id: game-state
    path: src/state.js
    roleId: game-core-dev
  - id: collision
    path: src/collision.js
    roleId: game-core-dev
  - id: scoring
    path: src/score.js
    roleId: game-core-dev
  - id: restart
    path: src/restart.js
    roleId: game-core-dev
  - id: input-control
    path: src/input.js
    roleId: game-ui-dev
  - id: render
    path: src/render.js
    roleId: game-ui-dev
  - id: acceptance-qa
    path: qa/
    roleId: game-qa
roles:
  - id: env-bootstrap
    modules: [env-resources, entry-index]
  - id: game-core-dev
    modules: [game-loop, game-state, collision, scoring, restart]
  - id: game-ui-dev
    modules: [input-control, render]
  - id: game-qa
    modules: [acceptance-qa]
management: [convener, env-bootstrap, game-core-dev, game-ui-dev, game-qa]
```
