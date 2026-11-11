---
schema: project-modules/v2
flowId: snake-game
version: 1
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
---

# 模块清单（snake-game v1）

本文件为模块归属的唯一权威源（`docs/proposals/snake-game-roster-v1.md` 的 `modules[]` 为本文件派生快照，须逐项一致）。

## 1. 模块表

| id | 名称 | category | path | 属主（见名单） |
| --- | --- | --- | --- | --- |
| env-resources | 运行环境与装配资源 | env | `README.md` | env-bootstrap |
| entry-index | 页面入口与装配 | entry | `index.html` | env-bootstrap |
| game-core | 游戏核心规则与状态机 | core | `src/core/` | game-implementer |
| input-controller | 键盘输入控制 | input | `src/input/` | game-implementer |
| renderer | 画面渲染与状态展示 | ui | `src/render/` | game-implementer |
| game-shell | 主循环与装配调度 | app | `src/app/` | game-implementer |

## 2. 路径与边界说明

- 所有模块路径均为项目相对路径，互不重叠、不互相包含：`README.md`、`index.html` 为根级文件，`src/core/`、`src/input/`、`src/render/`、`src/app/` 为互不嵌套的代码目录。
- 模块路径均不落在治理写区（`.ans/`、`角色卡/`、`docs/` 治理文档目录等）。
- `env-resources`（category=env）与 `entry-index`（category=entry）为环境/入口保留类别的固定模块，归属 `env-bootstrap`；其余模块归属实现角色。
- 公开契约字段均引用同一架构文档 `docs/contracts/snake-game-architecture-v1.md` 的对应接口章节；跨角色冻结契约（`contract-md/v1`）如需另立，后续版本追加引用，不改变本文件模块划分。
