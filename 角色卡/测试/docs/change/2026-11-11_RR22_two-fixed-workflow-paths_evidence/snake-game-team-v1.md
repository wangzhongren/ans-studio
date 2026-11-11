---
schema: teamPlanSchema:3
flowId: snake-game
version: 1
modules:
  path: docs/proposals/snake-game-modules-v1.md
  sha256: 44dd50e6ec9634040af57e822c612c46868386f489564db4948551f93c85a793
roster:
  path: docs/proposals/snake-game-roster-v1.md
  sha256: c8de3ab940fec39937849dc113c5c9afa50dc407226458e58815053e3a6292a8
roleRows:
  - roleId: env-bootstrap
    modules: [env-resources, entry-index]
    writesets: [src/main.js, README.md, index.html]
    dependsOn: []
  - roleId: game-engine-dev
    modules: [game-rules, input-control, score-storage]
    writesets: [src/core/, src/input/, src/score/]
    dependsOn: [env-bootstrap]
  - roleId: frontend-dev
    modules: [renderer]
    writesets: [src/ui/]
    dependsOn: [env-bootstrap, game-engine-dev]
---
# 团队计划：贪吃蛇游戏（snake-game）

- flowId：`snake-game`；版本：v1；路径 A 新建功能包。
- 依据：意图 `docs/product/snake-game-intent-v1.md`（intentId `snake-game-core`）；方案 `docs/proposals/snake-game-proposal-v1.md`；模块 `docs/proposals/snake-game-modules-v1.md`；名单 `docs/proposals/snake-game-roster-v1.md`；架构与契约 `docs/contracts/snake-game-architecture-v1.md`。
- 本计划与已激活名单一致：3 个项目角色、6 个模块各有唯一属主、拓扑 `management = [convener, env-bootstrap, game-engine-dev, frontend-dev]`。
- 固定路径计划：不携带 runId/baseDigest。

## 1. 角色分工与写集

| 角色 | 模块 | 写集 | 依赖 |
| --- | --- | --- | --- |
| env-bootstrap | env-resources、entry-index | `src/main.js`、`README.md`、`index.html` | 无 |
| game-engine-dev | game-rules、input-control、score-storage | `src/core/`、`src/input/`、`src/score/` | env-bootstrap（入口 DOM 挂载点与脚本加载顺序） |
| frontend-dev | renderer | `src/ui/` | env-bootstrap（页面挂载点）、game-engine-dev（只读状态快照契约） |

## 2. 实施顺序

1. env-bootstrap：页面入口与装配（`index.html` 提供架构第 5 节 DOM 契约、`src/main.js` 装配、`README.md` 说明）。
2. game-engine-dev：规则状态机、输入映射、最高分持久化（按架构第 3、4、6、8 节）。
3. frontend-dev：Canvas 与 HUD/暂停/结束层渲染（只读快照，按架构第 3、5 节）。

依赖方向严格单向：entry → 装配 → input/game-rules/renderer/score-storage；无循环依赖。

## 3. 交付与验收口径

- 实现产物：`index.html`、`src/main.js`、`README.md`、`src/core/`、`src/input/`、`src/score/`、`src/ui/`。
- 验收口径：意图第 6 节 11 条可复现手动步骤全部通过（可玩原型档位）。
- 独立质检由幕僚另行创建验证任务，不属本计划派发范围；本计划只约定运营向实现 worker 派发的写集与依赖。

## 4. 变更说明

- 名单/模块文档如升版，本计划按新版本号另行升版（v2+），不原地修改本版。
