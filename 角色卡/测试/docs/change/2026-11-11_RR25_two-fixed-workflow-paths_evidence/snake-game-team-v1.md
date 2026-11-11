---
schema: teamPlanSchema:3
flowId: snake-game
version: 1
modules:
  path: docs/proposals/snake-game-modules-v1.md
  sha256: 09fd43c2c4adffe70e409ec8578a36999c356eaa00527befc778423c474d15d8
roster:
  path: docs/proposals/snake-game-roster-v1.md
  sha256: 35433a6aeb05380a97491c69f031de08d22e72ef1dc83d4999e0ef7f823b3b4e
roleRows:
  - roleId: game-core-dev
    modules: [game-core]
    writesets: [src/core/]
    dependsOn: []
  - roleId: game-ui-dev
    modules: [game-ui]
    writesets: [src/ui/]
    dependsOn: [game-core-dev]
  - roleId: app-integrator
    modules: [app-entry]
    writesets: [index.html]
    dependsOn: [game-ui-dev]
  - roleId: qa-reviewer
    modules: [acceptance-record]
    writesets: [docs/acceptance/]
    dependsOn: [game-core-dev, game-ui-dev, app-integrator]
---

# 团队计划（snake-game v1）

本计划依据客户已确认的意图 `docs/product/snake-game-intent-v1.md`（v1）、提案 `docs/proposals/snake-game-proposal-v1.md`（v1）、模块清单 `docs/proposals/snake-game-modules-v1.md`（v1）、名单 `docs/proposals/snake-game-roster-v1.md`（v1）与架构 `docs/contracts/snake-game-architecture-v1.md`（v1）编制。

## 分工与写集

| 角色 | 模块 | 写集 | 依赖 |
| --- | --- | --- | --- |
| game-core-dev | game-core | src/core/ | 无 |
| game-ui-dev | game-ui | src/ui/ | game-core-dev |
| app-integrator | app-entry | index.html | game-ui-dev |
| qa-reviewer（验收） | acceptance-record | docs/acceptance/ | game-core-dev、game-ui-dev、app-integrator |

依赖方向：app-entry → game-ui → game-core；qa-reviewer 在各实现角色交付后执行四项验收（键盘控制/计分/重开/边界碰撞）并归档证据到 docs/acceptance/，不写实现路径。

## 执行约定

- 一模块一任务：实现任务由运营（convener）派发给对应模块属主，每任务只写本模块写集。
- 实现角色只写自己写集；不得写角色卡、其他角色目录或治理路径。
- 验收证据由 qa-reviewer 记录，实现角色不得向 docs/acceptance/ 写入。
- 技术栈与运行方式以架构 v1 为准：原生 HTML/CSS/JavaScript + canvas 2D，classic script，双击 index.html 离线可运行；CSS 只能写在 src/ui/ 内或 index.html 内联（不写仓库根 styles.css）。
- 基线：git init -b main、.gitignore ans 托管块、任务分支 ans/task/wf-e3ffff5ed5085fb622102f62。
