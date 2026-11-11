---
schema: teamPlanSchema:3
flowId: snake-game
version: 1
modules:
  path: docs/proposals/snake-game-modules-v1.md
  sha256: "51ae14ff1796da7e2d0356ee7b4bb3c4d1c3df770c328279c8e1a0195c821e10"
roster:
  path: docs/proposals/snake-game-roster-v1.md
  sha256: "6de65158dbde0f730c9acdf6f72c30b4662ae16f2df81e9a814040b68f199aac"
roleRows:
  - roleId: env-bootstrap
    modules: [env-resources, entry-index]
    writesets: [README.md, index.html]
    dependsOn: []
  - roleId: game-core-dev
    modules: [game-loop, game-state, collision, scoring, restart]
    writesets: [src/main.js, src/state.js, src/collision.js, src/score.js, src/restart.js]
    dependsOn: [env-bootstrap]
  - roleId: game-ui-dev
    modules: [input-control, render]
    writesets: [src/input.js, src/render.js]
    dependsOn: [env-bootstrap]
  - roleId: game-qa
    modules: [acceptance-qa]
    writesets: [qa/]
    dependsOn: [env-bootstrap]
---

# 团队计划 · 贪吃蛇（snake-game）v1

> 依据：docs/proposals/snake-game-roster-v1.md（project-roster/v4）、docs/proposals/snake-game-modules-v1.md、docs/contracts/snake-game-architecture-v1.md、docs/product/snake-game-intent-v1.md。
> 本计划为执行分工与依赖，不批准提案、不替代客户任命；角色只在其边界与已授权任务内执行。

## 1. 团队与模块归属

| 角色 | 模块 | 任务写集 | 依赖 |
| --- | --- | --- | --- |
| env-bootstrap | env-resources（README.md）、entry-index（index.html） | README.md、index.html | 无（先行） |
| game-core-dev | game-loop、game-state、collision、scoring、restart | src/main.js、src/state.js、src/collision.js、src/score.js、src/restart.js | env-bootstrap |
| game-ui-dev | input-control、render | src/input.js、src/render.js | env-bootstrap |
| game-qa | acceptance-qa（qa/，review=true） | qa/ | env-bootstrap |

所有写任务串行于同一工作区：实现角色按 1–2 文件粒度串行派发，避免同工作区并发写冲突；game-qa 的验收清单可在实现进行中并行准备，但其人工验收须在实现完成后执行。

## 2. 依赖与串行顺序

1. env-bootstrap：README.md 与 index.html 骨架先行，确定 DOM 容器与脚本加载顺序（普通 script 顺序加载，file:// 可运行）。
2. game-core-dev：按 src/collision.js → src/state.js → src/score.js → src/restart.js → src/main.js 顺序实现，遵守架构 §2 依赖方向；不得反向依赖或写 src/ 目录整体。
3. game-ui-dev：src/input.js → src/render.js，接口以架构 §3.2 为准；render 只读 state、只写 DOM。
4. game-qa：验收清单（qa/）可与实现并行编写；人工验收记录须在实现完成后按 A1–A4 口径录入。

## 3. 验收分工

- 项目验收角色 game-qa（review=true）：按意图 A1–A4 与提案 §4 口径做人工操作验证并记录可观察结果，输出 qa/ 下清单与记录；不修改实现、不宣告验收通过。
- 内置 verifier：由幕僚直派，独立于生产派发链；A12a 先写验收标准（criteria），A12b 在实现后独立验收。
- 客户是唯一验收决定者；本计划与任何角色报告均不构成验收结论。

## 4. 里程碑

- M1：基线完成（团队计划 v1 + git init -b main + .gitignore 托管块 + baseline commit + 任务分支 ans/task/wf-51b3f2f1cb476297dbcfd938）。
- M2：入口与说明（README.md、index.html）可 file:// 直接打开。
- M3：游戏逻辑与 UI 模块实现完成，自测通过。
- M4：game-qa 人工验收清单与记录完成（A1–A4）。
- M5：内置 verifier 独立验收与客户交付确认（由幕僚按固定路径推进）。

## 5. 变更与失败处理

- 模块/接口/验收口径变更须由策划出新版本（modules/architecture/proposal），本计划随版本更新。
- 实现任务失败或阻塞：保留原任务/候选/OID 与真实错误证据，回运营汇总；原 owner 责任链返工，不互派、不代写。
