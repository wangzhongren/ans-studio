---
schema: teamPlanSchema:3
flowId: snake-game
version: 1
modules:
  path: docs/proposals/snake-game-modules-v1.md
  sha256: 30b8d0832733c4d75d2ac843a280e3611b41eda251826a8d5591ce0d2b257ba5
roster:
  path: docs/proposals/snake-game-roster-v1.md
  sha256: 8259a30459ae1df42eeafeb1569196af0ea7d24be17fe7fef2f78644116194a5
roleRows:
  - roleId: game-implementer
    modules: [game-entry, game-core]
    writesets: [index.html, src/]
    dependsOn: []
---
# 团队计划（snake-game v1）

- 计划性质：执行计划（team-plan/v3，version=1），由运营（convener）落盘并提交 `complete_team_plan`。
- 依据：`docs/product/snake-game-intent-v1.md`（v1，客户本人 confirm）、`docs/proposals/snake-game-proposal-v1.md`（v1）、`docs/proposals/snake-game-modules-v1.md`（v1）、`docs/proposals/snake-game-roster-v1.md`（project-roster/v4）、`docs/contracts/snake-game-architecture-v1.md`（v1）。
- modules/roster 的 sha256 为应用版本记录值（应用按真实字节计算），本计划不自行计算或转抄其他哈希。

## 1. 团队与模块属主

| 角色 | 模块 | 写集 | 依赖 |
| --- | --- | --- | --- |
| game-implementer（游戏实现者） | game-entry（`index.html`）、game-core（`src/`） | `index.html`、`src/` | 无（首发实现） |

- 团队最小化：1 个实现角色承担全部两个模块，每模块恰一属主（与 roster/topology 一致）。
- 验收不属本团队：独立验收由内置 verifier 执行，实现者 `review:false`，不得自批验收。

## 2. 依赖顺序与执行步骤

| 序号 | 步骤 | 角色 | 前置依赖 | 契约/依据 | 交接物 | 完成口令 | 验收 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 实现 game-entry（`index.html`：DOM 挂载点 #game/#score/#status/#overlay/#restart、经典 script 加载顺序） | game-implementer | 团队计划完成 + 本任务已派发（A10 后） | `docs/contracts/snake-game-architecture-v1.md` §2 | `index.html` | 静态自检结论（读码核对，不运行 shell） | 独立验收（verifier） |
| 2 | 实现 game-core（`src/game.js`：状态机/输入/步进/食物/碰撞/重开/渲染；`src/styles.css`） | game-implementer | 团队计划完成 + 本任务已派发（A10 后） | 同上 §3–§8 | `src/game.js`、`src/styles.css` | 静态自检结论（读码核对，不运行 shell） | 独立验收（verifier） |

- 两模块可由同一实现角色在同一实现任务中按顺序完成（同工作区写任务串行）；写集互不重叠，无跨模块写冲突。
- 实现者只写 `index.html` 与 `src/`；提交只做 `git add <paths>` 与 `git commit -m "<message>"`（含空格的提交消息整体加引号），不运行其他 shell 命令。
- 执行/验证（运行游戏、截图、验收）归 A12 验收角色，实现者只交付文件与静态自检结论。

## 3. 基线（A9）

- 应用按固定路径基线流程执行：`git init -b main`（应用执行，已存在则 no-op）、`.gitignore` ans 托管块（保留用户内容）、仅含 `.gitignore` 的 baseline commit、任务分支 `ans/task/wf-7fcce8656a9bfb7fca73f124`。
- 基线失败按 `baseline-*` fail-closed 回报，不弹客户卡、不伪造成功。

## 4. 完成口令

- 团队计划完成：`complete_team_plan` 真实回执（应用核属主/写集/依赖后直接完成）。
- 本计划完成不构成 D3 任命，不授权名单外角色；实现派发待 A10 名单角色确认后进行。
