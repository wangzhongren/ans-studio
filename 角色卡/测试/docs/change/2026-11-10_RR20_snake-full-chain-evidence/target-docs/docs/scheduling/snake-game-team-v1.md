---
schema: project-team-plan/v1
flowId: snake-game
version: 1
intent: docs/product/snake-game-intent-v1.md
proposal: docs/proposals/snake-game-proposal-v2.md
architecture: docs/contracts/snake-game-architecture-v2.md
modulesDoc: docs/proposals/snake-game-modules-v1.md
roster: docs/proposals/snake-game-roster-v1.md
contract: docs/contracts/snake-game-contract-v2.md
envBootstrap:
  omitted: true
  omissionReason: 纯静态单页交付：无依赖安装、无构建、无服务端，无需环境引导
management:
  - convener
  - game-dev
roles:
  - id: game-dev
    displayName: 游戏开发工程师
    modules:
      - game
    writeSet:
      - game/
    dependsOn:
      - convener
modules:
  - id: game
    path: game/
    category: feature
    owner: game-dev
    publicContract: docs/contracts/snake-game-contract-v2.md
    architectureSource: docs/contracts/snake-game-architecture-v2.md
---

# 2D 贪吃蛇小游戏 — 团队计划（v1）

- flowId: `snake-game`
- 意图：`docs/product/snake-game-intent-v1.md`（intentId `snake-2d-game`）
- 提案：`docs/proposals/snake-game-proposal-v2.md`（latest=2）
- 架构：`docs/contracts/snake-game-architecture-v2.md`（latest=2）
- 模块：`docs/proposals/snake-game-modules-v1.md`（模块 `game`，path `game/`，category feature）
- 名单：`docs/proposals/snake-game-roster-v1.md`（角色 `game-dev`，属主 `game`，`management: [convener, game-dev]`，`envBootstrap.omitted: true`）
- 跨角色契约：`docs/contracts/snake-game-contract-v2.md`

## 1. 角色与模块归属

| 角色 | 模块 | 写区 | 依赖 |
| --- | --- | --- | --- |
| `game-dev` | `game`（`game/`，category feature） | `game/` | convener 完成计划与派发后开工 |

- 单一实现模块 `game`，单一属主 `game-dev`；一模块一属主，无跨角色交叉写区。
- 契约与架构按名单 `publicContract`/`architectureSource` 的最新可解析引用：`docs/contracts/snake-game-contract-v2.md`、`docs/contracts/snake-game-architecture-v2.md`。

## 2. 环境引导（env-bootstrap）

按名单 `envBootstrap.omitted: true` 省略：纯静态单页交付，无依赖安装、无构建、无服务端、无包管理器，无需环境引导。

## 3. 拓扑（与名单一致）

```topology
schema: project-topology/v2
modules:
  - id: game
    path: game/
    roleId: game-dev
roles:
  - id: game-dev
    modules:
      - game
management:
  - convener
  - game-dev
```

## 4. 分工与依赖

- `convener`：完成团队计划、维护项目工作流、派发实现任务、收集报告、集成候选并汇报。
- `game-dev`：在 `game/` 内实现 `index.html`、`styles.css`、`game.js`，按契约 v2/架构 v2 完成浏览器手工自测并提交报告。
- 依赖：`game-dev` 的实现任务依赖本计划登记与工作流就位；独立质检由幕僚按标准流程安排，不在本计划内设岗。

## 5. 已知引用问题（如实记录，不由运营修复）

- 应用当前报告：`roster`（`docs/proposals/snake-game-roster-v1.md`）引用的提案版本为 v1，不是最新 v2（`reference-invalid`）。
- 该问题属 **rapporteur（策划）** 职责：需由策划出新版名单或修正引用后，应用方可解析通过；运营不修改名单/模块/提案/架构/契约。

## 6. 版本

- 本计划为 v1；角色或模块变化须新出 v2，不原地修改。
