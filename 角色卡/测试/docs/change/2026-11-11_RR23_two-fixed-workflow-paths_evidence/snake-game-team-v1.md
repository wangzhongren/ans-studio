---
schema: teamPlanSchema:3
flowId: snake-game
version: 1
modules:
  path: docs/proposals/snake-game-modules-v1.md
  sha256: e8954f5edd6cddf2c5d9d8e0d78277a85cc9d651f909dedf8572a31a86a1df94
roster:
  path: docs/proposals/snake-game-roster-v1.md
  sha256: d1f57638b31c8504226a8c5a1cdc5b1f81601c53095303eb2309bd3cfa4f9198
roleRows:
  - roleId: env-bootstrap
    modules: [env-resources, entry-index]
    writesets: [assets/, index.html]
    dependsOn: [game-core, ui-input, score-persist]
  - roleId: game-core
    modules: [game-state, game-loop, app-shell]
    writesets: [src/game-state.js, src/game-loop.js, src/app-shell.js]
    dependsOn: []
  - roleId: ui-input
    modules: [input, render]
    writesets: [src/input.js, src/render.js]
    dependsOn: []
  - roleId: score-persist
    modules: [score]
    writesets: [src/score.js]
    dependsOn: []
---

# 贪吃蛇游戏 · 团队计划 v1

- 依据意图：`docs/product/snake-game-intent-v1.md`（version 1，客户已确认）
- 依据方案：`docs/proposals/snake-game-proposal-v1.md`（version 1，客户 A6 已 accept）
- 模块清单：`docs/proposals/snake-game-modules-v1.md`（version 1）
- 名单：`docs/proposals/snake-game-roster-v1.md`（version 1）
- 架构契约：`docs/contracts/snake-game-architecture-v1.md`（version 1）

## 1. 角色与写集

| 角色 | 负责模块 | 写入集 | 依赖 |
| --- | --- | --- | --- |
| env-bootstrap | env-resources、entry-index | `assets/`、`index.html` | game-core、ui-input、score-persist |
| game-core | game-state、game-loop、app-shell | `src/game-state.js`、`src/game-loop.js`、`src/app-shell.js` | 无 |
| ui-input | input、render | `src/input.js`、`src/render.js` | 无 |
| score-persist | score | `src/score.js` | 无 |

所有写集均在各自属主模块根内，互不重叠，不包含 `.ans/`、`角色卡/`、`docs/` 等治理目录。

## 2. 依赖顺序

1. `game-core`（game-state → game-loop → app-shell）、`ui-input`（input、render）、`score-persist`（score）可并行实现，接口以架构契约 v1 为准。
2. `env-bootstrap` 的 `entry-index` 最终装配依赖以上全部模块源码就绪：按 `game-state.js → score.js → game-loop.js → input.js → render.js → app-shell.js` 顺序内联为自包含单文件 `index.html`（或先出外壳，待模块完成后二次装配）。

## 3. 里程碑

| 里程碑 | 内容 | 依赖 |
| --- | --- | --- |
| M1 规则与调度 | game-state、game-loop、app-shell 接口实现 | 架构契约 v1 |
| M2 表现与持久化 | input、render、score 实现 | 架构契约 v1 |
| M3 单文件装配 | entry-index 内联装配、离线自包含 | M1、M2 |
| M4 自测与回交 | 各实现角色按 A1–A9 口径自测并回交运营 | M1–M3 |
| M5 独立验收 | 按意图 A1–A9 人工试玩核验（独立验收流程执行） | M4 |

## 4. 执行约定

- 实现任务由运营（convener）按「一模块一任务」派生，模块 id 权威、`modulePaths` 仅写该模块路径，同工作区写任务串行。
- 各角色只写自己负责模块写入根；跨模块读取允许、跨模块写入禁止。
- 接口或行为变更须先出新版架构契约，再同步模块、名单与本计划。
- 阻塞先回运营，运营不能解决再报幕僚；验收由独立验收流程执行，实现角色不自宣告完成。
