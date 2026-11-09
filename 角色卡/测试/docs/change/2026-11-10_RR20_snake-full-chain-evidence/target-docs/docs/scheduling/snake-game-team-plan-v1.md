---
schema: project-team-plan/v1
flowId: snake-game
version: 1
intent: docs/product/snake-game-intent-v1.md
proposal: docs/proposals/snake-game-proposal-v1.md
roster: docs/proposals/snake-game-roster-v1.md
modulesDoc: docs/proposals/snake-game-modules-v1.md
architecture: docs/contracts/snake-game-architecture-v1.md
contract: docs/contracts/snake-game-contract-v1.md
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
    publicContract: docs/contracts/snake-game-contract-v1.md
    architectureSource: docs/contracts/snake-game-architecture-v1.md
---

# 2D 贪吃蛇小游戏 — 团队计划（v1）

- flowId: `snake-game`
- 依据：意图 `docs/product/snake-game-intent-v1.md`；提案 `docs/proposals/snake-game-proposal-v1.md`；名单 `docs/proposals/snake-game-roster-v1.md`；模块 `docs/proposals/snake-game-modules-v1.md`；架构 `docs/contracts/snake-game-architecture-v1.md`；契约 `docs/contracts/snake-game-contract-v1.md`。
- 客户已接受提案（D3 裁决 id：`decision-req-4d9cad12f7f51043`，来源于提案确认卡 accept 回执；该 id 由 Nominator 在 appointment-write 时原样携带，不作为本计划的授权字段）。

## 1. 角色与模块归属

| 角色 | 模块 | 写区 | 依赖 |
| --- | --- | --- | --- |
| `game-dev` | `game`（`game/`，category feature） | `game/` | convener 完成计划与派发后开工 |

- 单一实现模块 `game`，单一属主 `game-dev`；一模块一属主，无跨角色交叉写区。
- 契约：`docs/contracts/snake-game-contract-v1.md`；架构：`docs/contracts/snake-game-architecture-v1.md`。

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

- `convener`：完成团队计划、维护 `docs/workflow.md`、派发实现任务、收集报告、集成候选并汇报。
- `game-dev`：在 `game/` 内实现 `index.html`、`styles.css`、`game.js`，按契约完成浏览器手工自测并提交报告。
- 依赖：`game-dev` 的实现任务依赖本计划登记与工作流就位；验收由独立质检按标准流程执行（不在本计划内设岗）。

## 5. 版本

- 本计划为 v1；角色或模块变化须新出 v2，不原地修改。
