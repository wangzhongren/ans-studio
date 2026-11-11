---
schema: teamPlanSchema:3
flowId: snake-game
version: 1
modules:
  path: docs/proposals/snake-game-modules-v1.md
  sha256: "844671303d71dc814649d565d089b4ba022dbabb7be7dcf2efba0008fa905d71"
roster:
  path: docs/proposals/snake-game-roster-v1.md
  sha256: "06d4fa9d330f102ecf4524ec6835dfceda3613f39fabdf8702b17179866321d6"
roleRows:
  - roleId: game-implementer
    modules: [entry-page, game-core, game-render, game-input, game-style]
    writesets: [index.html, src/game.js, src/render.js, src/input.js, src/style.css]
    dependsOn: []
---

# 团队计划（snake-game v1）

- flowId：`snake-game`
- workflowId：`wf-5f518ee14f687c8c8f3c6966`
- 路径：A（先意图后提案）
- 版本：v1（固定路径 complete_team_plan v4；无 runId/baseDigest）
- 模块唯一权威源：`docs/proposals/snake-game-modules-v1.md`（project-modules/v2，v1）
- 名单依据：`docs/proposals/snake-game-roster-v1.md`（project-roster/v4，v1）
- 方案依据：`docs/proposals/snake-game-proposal-v1.md`（v1，客户 A6 已接受，决定 id：decision-req-27b87bfb318be248）

## 一、分工

| 角色 | 模块 | 写集（模块根内具体路径） | 依赖 |
| --- | --- | --- | --- |
| `game-implementer` | `entry-page`、`game-core`、`game-render`、`game-input`、`game-style` | `index.html`、`src/game.js`、`src/render.js`、`src/input.js`、`src/style.css` | 无 |

- 单实现角色负责全部五个模块，与名单属主一致；写集与各模块路径一一对应，均在模块根内、互不重叠、不涉及治理目录。
- 实现任务由运营（convener）逐模块派发（一模块一任务），同一工作区写任务串行。

## 二、验收分工（不写入本计划写集）

- 独立验收角色由幕僚在 A12 另行直派 verifier（默认 verifier；roster `roles[].review` 预留位未启用），不属本实现名单，也不在本计划 roleRows 中。
- 验收依据：意图 v1 AC1–AC4、`docs/contracts/snake-game-contract-v1.md`；证据为纯项目相对路径，hash 由应用计算。

## 三、基线说明

- 本计划提交后由应用执行基线 3 件小事：`git init -b main`、`.gitignore` ans 托管块 + baseline commit、任务分支 `ans/task/wf-5f518ee14f687c8c8f3c6966`。
- 基线失败按 `baseline-*` fail-closed，不伪造成功、不弹客户卡；修复后以新 operationId 重试。
- 基线就绪前不派实现任务；A10 任命确认卡由幕僚在 A9 完成后呈报。
