---
schema: teamPlanSchema:3
flowId: snake-game
version: 1
modules:
  path: docs/proposals/snake-game-modules-v1.md
roster:
  path: docs/proposals/snake-game-roster-v1.md
roleRows:
  - roleId: env-bootstrap
    modules: [entry-index, env-resources]
    writesets:
      - index.html
      - styles/main.css
    dependsOn: []
  - roleId: game-implementer
    modules: [game-core, input-control, render-ui, app-bootstrap]
    writesets:
      - src/game/core.js
      - src/input/keyboard.js
      - src/render/renderer.js
      - src/app/main.js
    dependsOn: [env-bootstrap]
---
# 团队计划：贪吃蛇游戏（v1）

- flowId：snake-game；version：1
- 依据：意图 `docs/product/snake-game-intent-v1.md`（v1）；提案 `docs/proposals/snake-game-proposal-v1.md`（v1）；名单 `docs/proposals/snake-game-roster-v1.md`（project-roster/v4，v1）；模块 `docs/proposals/snake-game-modules-v1.md`（v1）；架构 `docs/contracts/snake-game-architecture-v1.md`（v1）；客户方案决定 decisionId=decision-req-da9ca4f2979e95ad（A6）。
- 范围：零依赖静态网页（HTML+CSS+原生 JS），四项必须能力：键盘方向控制、计分、重开、边界碰撞（撞边界即结束、不可穿墙）。

## 角色与写集

| 角色 | 模块 | 写集 | 依赖 |
|------|------|------|------|
| env-bootstrap | entry-index、env-resources | index.html、styles/main.css | 无 |
| game-implementer | game-core、input-control、render-ui、app-bootstrap | src/game/core.js、src/input/keyboard.js、src/render/renderer.js、src/app/main.js | env-bootstrap |

- 名单 2 个角色全覆盖，每角色恰一行；每模块恰一属主。
- 写集均在属主模块根内，互不重叠，不含治理写区（.ans/、角色卡/、docs/intents|product|proposals|contracts|scheduling|quality|verification|skills|mcp|audit 等）。
- 依赖方向：env-bootstrap → 无；game-implementer → env-bootstrap（入口页面与样式先行，再由实现者装配脚本）。无环。

## 执行顺序

1. env-bootstrap：交付 `index.html`（DOM 挂载点与脚本按序加载）与 `styles/main.css`（页面外壳样式）。
2. game-implementer：交付 `src/game/core.js`、`src/input/keyboard.js`、`src/render/renderer.js`、`src/app/main.js`，按架构 §4 公开契约与 §7 验收要点实现四项能力。
3. 集成与独立验收：由幕僚按流程创建 Verifier 独立验收；本计划不授权名单外角色。

## 说明

- 本文件为 A9 团队计划产物，提前落盘以配合 A8 建卡门禁对「已完成计划」的要求；本文件不写角色卡、不做 Git 基线，不构成 D3 任命或写权扩张。
- 角色卡/边界由 nominator 在 A8 按名单与 D3（decision-req-da9ca4f2979e95ad）写入并激活。
