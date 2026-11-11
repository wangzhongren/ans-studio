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
    name: 运行环境与装配资源
    purpose: 承载单机离线运行方式说明（无构建、无依赖安装，本地直接打开入口即可游玩），并声明运行前提
    category: env
    path: README.md
    publicContract: "internal（运行说明约定：无构建步骤、无外部网络依赖，双击 index.html 本地打开即可游玩）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: entry-index
    name: 页面入口与装配
    purpose: 提供游戏页面入口文档结构：画布容器、分数与结束提示区域、按顺序加载各脚本并完成启动装配
    category: entry
    path: index.html
    publicContract: "internal（入口装配约定：统一的页面容器 id 与脚本加载顺序，供应用装配层启动）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-core
    name: 游戏核心规则与状态机
    purpose: 实现网格坐标、蛇移动推进、食物生成与进食判定、计分、撞墙判定与整局重置（重开）状态机，不涉及 DOM/Canvas
    category: core
    path: src/core/
    publicContract: "internal（核心状态机接口：createState/step/turn/reset，纯数据、无渲染副作用）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: input-controller
    name: 键盘输入控制
    purpose: 监听键盘事件并把方向键与 WASD 映射为单一方向输入，过滤反向输入与非法按键，向核心状态机提交转向
    category: input
    path: src/input/
    publicContract: "internal（输入接口约定：方向键与 WASD 等价映射为单一 Direction，反向输入被忽略）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: renderer
    name: 画面渲染与状态展示
    purpose: 用 Canvas 绘制场地网格、蛇、食物，显示当前分数，并在本局结束时展示结束遮罩、本局得分与重开提示
    category: ui
    path: src/render/
    publicContract: "internal（渲染约定：只读取核心状态快照绘制，不修改游戏状态）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-shell
    name: 主循环与装配调度
    purpose: 串联入口、输入、核心与渲染：驱动固定节拍的移动循环、处理进食计分与撞墙结束、处理重开触发并整局重置
    category: app
    path: src/app/
    publicContract: "internal（调度约定：主循环 tick 节奏、结束与重开事件的分发顺序）"
    architectureSource: docs/contracts/snake-game-architecture-v1.md
roles:
  - id: env-bootstrap
    displayName: 环境装配与入口
    purpose: 提供单机离线的运行环境说明与页面入口装配，保证双击 index.html 即可启动游戏
    capability: 静态页面装配（HTML/CSS 结构与脚本加载），无构建工具链
    modules: [env-resources, entry-index]
  - id: game-implementer
    displayName: 游戏实现者
    purpose: 实现游戏核心规则状态机、键盘输入、Canvas 渲染与主循环装配，满足意图验收 A1–A4
    capability: 原生 JavaScript + Canvas 2D（无框架、无构建、单机离线）
    modules: [game-core, input-controller, renderer, game-shell]
---

# 人员名单（snake-game v1）

- 依据意图：`docs/product/snake-game-intent-v1.md`（v1，intentId=snake-game）
- 依据提案：`docs/proposals/snake-game-proposal-v1.md`（v1）
- 依据架构：`docs/contracts/snake-game-architecture-v1.md`（v1）
- 模块权威清单：`docs/proposals/snake-game-modules-v1.md`（v1；本文件 `modules[]` 为其派生快照，逐项一致）
- 环境引导：保留默认 `env-bootstrap`（`envBootstrap.omitted=false`），固定持有 `env-resources`（env）与 `entry-index`（entry）。

## 1. 角色与模块归属

| 角色 id | 名称 | 能力 | 持有模块 | 备注 |
| --- | --- | --- | --- | --- |
| env-bootstrap | 环境装配与入口 | 静态页面装配、无构建运行 | env-resources、entry-index | 固定环境/入口角色，env/entry 类别唯一属主 |
| game-implementer | 游戏实现者 | 原生 JS + Canvas 2D | game-core、input-controller、renderer、game-shell | 领域规则、输入、渲染与调度 |

归属校验：6 个模块各恰有一个属主；每个角色至少绑定一个模块；无内置治理角色 id 被占用。

## 2. 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: env-resources
    path: README.md
    roleId: env-bootstrap
  - id: entry-index
    path: index.html
    roleId: env-bootstrap
  - id: game-core
    path: src/core/
    roleId: game-implementer
  - id: input-controller
    path: src/input/
    roleId: game-implementer
  - id: renderer
    path: src/render/
    roleId: game-implementer
  - id: game-shell
    path: src/app/
    roleId: game-implementer
roles:
  - id: env-bootstrap
    modules: [env-resources, entry-index]
  - id: game-implementer
    modules: [game-core, input-controller, renderer, game-shell]
management: [convener, env-bootstrap, game-implementer]
```

## 3. 说明

- 本名单是人事建卡/激活的唯一依据；角色授权、边界与招人由后续任命/激活流程按本名单执行，本文件不自行创建角色卡、不自行激活。
- `convener` 为内置运营角色，列入 `management` 用于生产线派发与收口；名单 `roles[]` 只列项目角色。
- 若后续模块划分或属主变化（如拆分验证/测试角色、增加契约冻结文档），须出名单新版本（`-v2`），旧版只读。
