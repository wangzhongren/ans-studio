---
schema: project-modules/v2
flowId: snake-game
version: 1
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
---

# 模块清单 · 贪吃蛇（snake-game）v1

唯一权威模块源。owner 归属见 `docs/proposals/snake-game-roster-v1.md` 的 roles[].modules[] 与拓扑块；架构依据 `docs/contracts/snake-game-architecture-v1.md`。

## 1. 模块表（含属主与验收映射）

| id | 名称 | path | category | 属主角色 | 覆盖功能项 |
| --- | --- | --- | --- | --- | --- |
| env-resources | 环境与资源 | README.md | env | env-bootstrap | 交付可用性/启动方式 |
| entry-index | 页面入口 | index.html | entry | env-bootstrap | 页面装配（全部功能载体） |
| game-loop | 主循环与编排 | src/main.js | core | game-core-dev | 游戏循环、A3/A4 编排 |
| game-state | 游戏状态 | src/state.js | core | game-core-dev | 蛇与食物逻辑、隐含本体 |
| collision | 碰撞判定 | src/collision.js | feature | game-core-dev | A4 边界碰撞 |
| scoring | 计分 | src/score.js | feature | game-core-dev | A2 计分 |
| restart | 重开 | src/restart.js | feature | game-core-dev | A3 重开 |
| input-control | 键盘输入 | src/input.js | feature | game-ui-dev | A1 键盘控制 |
| render | 渲染与反馈 | src/render.js | feature | game-ui-dev | A2/A4 可观察反馈 |
| acceptance-qa | 项目验收 | qa/ | qa | game-qa（review=true） | A1–A4 人工验收 |

## 2. 路径与边界约束

- 所有路径为项目相对路径，互不重叠/不嵌套；`src/` 目录本身不作为任何模块路径，`qa/` 为目录（尾 `/`）。
- 路径均不落在治理写区（`.ans/`、`角色卡/`、`docs/` 等）；实现只写各自模块路径内。
- `env-resources`（category=env）与 `entry-index`（category=entry）为固定模块，只能由 `env-bootstrap` 拥有。
- 尺寸、速度、配色等实现参数可在模块内自定，但不得改变意图验收口径。

## 3. 覆盖说明

- 游戏循环/状态：game-loop + game-state
- 键盘输入：input-control
- 蛇与食物逻辑：game-state
- 渲染：render
- 计分：scoring（显示由 render 承担）
- 重开：restart（循环复位由 game-loop 调用）
- 边界碰撞：collision（归属明确）
