---
schema: project-roster/v4
flowId: snake-game
version: 1
intent: docs/product/snake-game-intent-v1.md
proposal: docs/proposals/snake-game-proposal-v1.md
architecture: docs/contracts/snake-game-architecture-v1.md
modulesDoc: docs/proposals/snake-game-modules-v1.md
envBootstrap:
  omitted: true
  omissionReason: 单文件零依赖交付，无构建、包管理或环境装配步骤；index.html 由唯一实现模块承载，无需独立 env/entry 模块。
modules:
  - id: snake-game-app
    name: 贪吃蛇单文件应用
    purpose: 以单文件 index.html 承载游戏页面、输入处理、游戏循环、状态机与计分规则
    category: app
    path: index.html
    publicContract: docs/contracts/snake-game-architecture-v1.md
    architectureSource: docs/contracts/snake-game-architecture-v1.md
roles:
  - id: snake-game-dev
    displayName: 贪吃蛇游戏实现者
    purpose: 独立实现并自测单文件贪吃蛇游戏，满足 AC1–AC5
    capability: HTML/CSS/JavaScript，Canvas 或 DOM 渲染，固定节拍游戏循环与输入状态机
    modules: [snake-game-app]
---

# 贪吃蛇游戏 · 团队名单（snake-game v1）

依据意图：`docs/product/snake-game-intent-v1.md`；依据提案：`docs/proposals/snake-game-proposal-v1.md`；模块清单：`docs/proposals/snake-game-modules-v1.md`；架构契约：`docs/contracts/snake-game-architecture-v1.md`。

## 一、名单说明

- 项目规模为单文件、零依赖的基础小游戏（AC1–AC5），实现工作量集中在一个文件，故只设 **1 名实现角色**，不额外招人、不设重复职能。
- 环境/入口按小项目省略：`envBootstrap.omitted=true`（理由见 frontmatter）；不设 `env-bootstrap` 角色与 env/entry 模块。
- 验收默认由内置 verifier 复核 + 客户按 AC1–AC5 实操核对，**不新增验收角色**（故不设 `review=true`）。

## 二、角色

### snake-game-dev · 贪吃蛇游戏实现者

- **角色 id**：`snake-game-dev`
- **职责**：在 A7 实现阶段产出并自测 `index.html`，实现方向键控制与禁止 180° 反向、食物生成与 +10 计分、撞墙即结束、重开且分数归零，以及基础画面与分数显示。
- **能力**：HTML/CSS/JavaScript；Canvas 2D 或 DOM 渲染；固定节拍游戏循环；输入校验与状态机。
- **模块归属**：`snake-game-app`（唯一属主）。
- **写集（writeScope）**：仅 `index.html`。不得写入 `docs/`、`角色卡/`、`.ans/` 等治理或他人范围。
- **公开契约**：`docs/contracts/snake-game-architecture-v1.md`（状态机、输入/节拍、进食与撞墙判定、重开语义、AC1–AC5 对应）。
- **不做**：不写方案/名单/架构文档、不发卡、不改意图、不引入外部依赖或构建工具。

## 三、人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: snake-game-app
    path: index.html
    roleId: snake-game-dev
roles:
  - id: snake-game-dev
    modules: [snake-game-app]
management: [convener, snake-game-dev]
```

## 四、依赖与顺序

- 依赖顺序：A5 文档冻结 → A6 方案确认（幕僚呈客户）→ A7 实现（`snake-game-dev`）→ 验收（内置 verifier + 客户实操）。
- 单角色单模块，无跨角色交付依赖；实现前需名单与模块清单已生效，实现后按 AC1–AC5 验收。
- 名单为人事建卡的唯一依据；本文件不自行招人、不写角色卡、不派发任务。
