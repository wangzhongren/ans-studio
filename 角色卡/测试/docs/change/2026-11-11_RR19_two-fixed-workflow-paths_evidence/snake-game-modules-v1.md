---
schema: project-modules/v2
flowId: snake-game
version: 1
modules:
  - id: snake-game-app
    name: 贪吃蛇单文件应用
    purpose: 以单文件 index.html 承载游戏页面、输入处理、游戏循环、状态机与计分规则
    category: app
    path: index.html
    publicContract: docs/contracts/snake-game-architecture-v1.md
    architectureSource: docs/contracts/snake-game-architecture-v1.md
---

# 贪吃蛇游戏 · 模块清单（snake-game v1）

依据提案：`docs/proposals/snake-game-proposal-v1.md`；本清单为模块唯一权威源，名单中的 `modules[]` 是本文的派生快照。

## 一、模块表

| id | name | category | path | purpose | publicContract | architectureSource |
|---|---|---|---|---|---|---|
| `snake-game-app` | 贪吃蛇单文件应用 | `app` | `index.html` | 单文件承载页面骨架、样式、输入处理、游戏循环、状态机与计分规则 | `docs/contracts/snake-game-architecture-v1.md` | `docs/contracts/snake-game-architecture-v1.md` |

## 二、模块说明

- **边界**：本模块是项目唯一实现模块。单文件交付约束下，页面、样式与游戏逻辑全部内嵌于 `index.html`；不拆分外部脚本/样式文件，不引入第三方依赖。
- **路径**：`index.html` 为项目根下的文件（不以 `/` 结尾，表示文件），由本模块唯一持有；不存在与其它模块路径重叠或嵌套的情况。
- **公开契约**：对外可验收行为与内部结构约定见 `docs/contracts/snake-game-architecture-v1.md`（游戏状态机、输入与节拍、进食/撞墙判定、重开语义、AC1–AC5 对应）。
- **架构来源**：`docs/contracts/snake-game-architecture-v1.md`。

## 三、属主与写集边界

- 属主角色：`snake-game-dev`（见名单 `docs/proposals/snake-game-roster-v1.md`），每模块恰一个属主。
- 写集：实现角色仅可写本模块路径 `index.html`；不得写入治理目录（`docs/proposals/`、`docs/contracts/`、`docs/product/`、`docs/intents/`、`角色卡/`、`.ans/` 等）。
- 本清单由策划维护；实现阶段只按本清单与架构契约产出 `index.html`，不自行增删模块或路径。

## 四、环境/入口模块取舍

- 本项目为单文件、零依赖、无构建交付：无包管理文件、无构建脚本、无环境装配步骤。`index.html` 本身就是游戏入口，由 `snake-game-app` 承载。
- 因此按小项目省略 `env-bootstrap`（名单中登记 `envBootstrap: {omitted: true, omissionReason: ...}`），不设独立 `env-resources` / `entry-index` 模块，避免与单文件路径唯一属主冲突。
