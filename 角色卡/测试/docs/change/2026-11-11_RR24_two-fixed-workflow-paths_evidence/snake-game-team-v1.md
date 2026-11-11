---
schema: teamPlanSchema:3
flowId: snake-game
version: 1
modules:
  path: docs/proposals/snake-game-modules-v1.md
  sha256: 832e9704ecdd67b3840b11927a15f084f045e738a1520b663846004b9d62d1ac
roster:
  path: docs/proposals/snake-game-roster-v1.md
  sha256: 5371f56e306c9ca5d86e4544d1e7321e2da69fa82896aacbba850414febc82c0
roleRows:
  - roleId: env-bootstrap
    modules: [env-resources, entry-index]
    writesets: [styles/, index.html]
    dependsOn: [game-logic, input-ctrl, ui-render, app-shell]
  - roleId: game-logic
    modules: [game-core]
    writesets: [src/core/]
    dependsOn: []
  - roleId: input-ctrl
    modules: [input-control]
    writesets: [src/input/]
    dependsOn: [game-logic]
  - roleId: ui-render
    modules: [render-ui]
    writesets: [src/render/]
    dependsOn: [game-logic]
  - roleId: app-shell
    modules: [app-entry]
    writesets: [src/app/]
    dependsOn: [game-logic, input-ctrl, ui-render]
---

# 团队计划（snake-game v1）

> A9 团队计划 v4 输入（`teamPlanSchema:3`）；固定路径无 runId/baseDigest。依据：名单 `docs/proposals/snake-game-roster-v1.md`（应用登记 sha256 见 frontmatter）、模块清单 `docs/proposals/snake-game-modules-v1.md`、架构 `docs/contracts/snake-game-architecture-v1.md`、意图 `docs/product/snake-game-intent-v1.md`。5 个角色已由应用在 A8 激活。

## 1. 角色与模块归属

| 角色 | 负责模块 | 模块路径 | 职责 |
| --- | --- | --- | --- |
| env-bootstrap | env-resources、entry-index | `styles/`、`index.html` | 入口页与样式资源装配，零构建离线可打开 |
| game-logic | game-core | `src/core/` | 纯状态机：推进、吃食物计分、撞墙结束、重置 |
| input-ctrl | input-control | `src/input/` | 方向键/WASD 映射、反向过滤、结束态忽略 |
| ui-render | render-ui | `src/render/` | Canvas 2D 绘制与结束覆盖层，只读快照 |
| app-shell | app-entry | `src/app/` | 装配与固定 130ms tick 主循环、重开编排 |

## 2. 写集与依赖（写任务串行）

- 实现顺序：game-core → input-control → render-ui → app-entry → 入口/样式装配（env-bootstrap）。
- 依赖：game-logic 无依赖；input-ctrl / ui-render 依赖 game-logic；app-shell 依赖 game-logic、input-ctrl、ui-render；env-bootstrap 依赖上述四个角色（入口页需装载全部脚本）。
- 写集均在属主模块根内、互不重叠、不含治理目录；同一工作区写任务串行，返工退原属主责任链。

## 3. 验收与交付

- 验收由内置 verifier（质检）独立承担，按 A12 流程执行（A12a criteria 先行、A12b report 后出）；项目角色不自行宣告完成。
- 每模块一个实现任务（moduleId 权威、modulePaths 只写该模块路径），验收标准与证据要求见 `docs/workflow.md` 与 A12 标准。
- 本计划不授予名单外角色任何权限；实现任务派发前核当前有效 D3/激活、完整激活回执、工作流与依赖就绪。

## 4. 基线

- 基线 3 件小事：本团队计划 v4 / `git init -b main`（应用执行）/ `.gitignore` ans 托管块 + baseline commit + 任务分支 `ans/task/<workflowId>`（workflowId=wf-f7e54091de068cb28e4e6998）。
- 失败按 `baseline-*` fail-closed 回报，不伪造 basis.recorded。

## 5. 版本

- v1（A9 团队计划，对应 A5 方案 v1 与 A8 激活名单）。后续调整出新版本，不原地修改。
