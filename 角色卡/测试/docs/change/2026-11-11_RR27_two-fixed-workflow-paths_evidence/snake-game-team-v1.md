---
schema: teamPlanSchema:3
flowId: snake-game
version: 1
modules:
  path: docs/proposals/snake-game-modules-v1.md
  sha256: 9ad7b89f6f7579ab53da066a482eb91455eff70706d46f718a78a53c0673168b
roster:
  path: docs/proposals/snake-game-roster-v1.md
  sha256: a6bd1425baa69509a28dae08c9c506c3c2e9ff751c92fa595c5f359071179435
roleRows:
  - roleId: env-bootstrap
    modules: [env-resources, entry-index]
    writesets: [assets/, index.html]
    dependsOn: []
  - roleId: game-core-dev
    modules: [game-core]
    writesets: [src/game.js]
    dependsOn: []
  - roleId: game-ui-dev
    modules: [game-ui, game-style]
    writesets: [src/ui.js, styles.css]
    dependsOn: [game-core-dev]
---

# 团队计划（snake-game）

- workflowId：wf-3890e8370a4f772e7c7efe09
- 固定路径：A（新建项目）
- 方案依据：`docs/proposals/snake-game-proposal-v1.md`；模块：`docs/proposals/snake-game-modules-v1.md`；名单：`docs/proposals/snake-game-roster-v1.md`；架构契约：`docs/contracts/snake-game-architecture-v1.md`；产品意图：`docs/product/snake-game-intent-v1.md`。

## 角色与写集

| 角色 | 模块 | 写集 | 依赖 |
| --- | --- | --- | --- |
| env-bootstrap | env-resources、entry-index | `assets/`、`index.html` | 无 |
| game-core-dev | game-core | `src/game.js` | 无 |
| game-ui-dev | game-ui、game-style | `src/ui.js`、`styles.css` | game-core-dev |

## 依赖顺序与交付形态

- 实现顺序：game-core-dev（规则与状态机）→ game-ui-dev（渲染/输入/交互）→ env-bootstrap（入口页装配与静态资源目录）；三者均只写各自模块内文件，跨模块调用遵循架构契约的 `window.SnakeGame` / `window.SnakeUI` 公开契约。
- 交付形态：纯静态单页（`index.html` + `styles.css` + `src/game.js` + `src/ui.js`），原生 JavaScript、经典 `<script>`（非 ES module），无构建步骤，浏览器直接打开 `index.html` 运行。
- 独立验收由质检角色承担（A12），实现 worker 不自行宣告完成。

## 基线与分支

- 基线：`git init -b main`（应用执行）、`.gitignore` ans 托管块 + baseline commit（仅提交 `.gitignore`）。
- 任务分支：`ans/task/wf-3890e8370a4f772e7c7efe09`（同一 workflow 可复用自有分支）。
- 本计划不授权名单外角色；完成计划不等于 D3 任命，实现须待 A10 客户任命确认。
