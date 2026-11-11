---
schema: teamPlanSchema:3
flowId: snake-game
version: 1
modules:
  path: docs/proposals/snake-game-modules-v1.md
  sha256: 292075be4210468f868e2c06f792668860ba59a6a6c4a12f283e10cf05c8aee9
roster:
  path: docs/proposals/snake-game-roster-v1.md
  sha256: 8da06a42c28e98f46c7f0fc246c25dee11e08bc9388e39275ea99d20c24404f2
roleRows:
  - roleId: env-bootstrap
    modules: [env-resources, entry-index]
    writesets: [package.json, tsconfig.json, vite.config.ts, index.html, src/main.ts]
    dependsOn: []
  - roleId: game-core-dev
    modules: [game-state, collision-boundary, scoring]
    writesets: [src/core/state/, src/core/collision/, src/core/scoring/]
    dependsOn: [env-bootstrap]
  - roleId: runtime-dev
    modules: [game-loop, restart-flow]
    writesets: [src/loop/, src/restart/]
    dependsOn: [game-core-dev]
  - roleId: input-ui-dev
    modules: [input-control, rendering]
    writesets: [src/input/, src/render/]
    dependsOn: [env-bootstrap, game-core-dev]
  - roleId: qa-verifier
    modules: [e2e-verification]
    writesets: [test/]
    dependsOn: [env-bootstrap, game-core-dev, runtime-dev, input-ui-dev]
---

# snake-game 团队计划 v1

> 依据：意图 `docs/product/snake-game-intent-v1.md`（intentId=snake-game-core，v1，客户 A3 确认）；提案 `docs/proposals/snake-game-proposal-v1.md`；模块清单 `docs/proposals/snake-game-modules-v1.md`；名单 `docs/proposals/snake-game-roster-v1.md`；架构 `docs/contracts/snake-game-architecture-v1.md`。
> 本计划为 fixed 路径 A 的 A9 团队计划（team-plan v4 输入）；完成计划不等于 D3，不授权名单外角色。

## 1. 角色与模块归属

| 角色 id | 模块（moduleId） | 写集（模块根内） | 依赖 |
|---------|------------------|------------------|------|
| env-bootstrap | env-resources、entry-index | package.json、tsconfig.json、vite.config.ts、index.html、src/main.ts | 无 |
| game-core-dev | game-state、collision-boundary、scoring | src/core/state/、src/core/collision/、src/core/scoring/ | env-bootstrap |
| runtime-dev | game-loop、restart-flow | src/loop/、src/restart/ | game-core-dev |
| input-ui-dev | input-control、rendering | src/input/、src/render/ | env-bootstrap、game-core-dev |
| qa-verifier（review: true） | e2e-verification | test/ | env-bootstrap、game-core-dev、runtime-dev、input-ui-dev |

- 一模块一属主；写集互不重叠、均在属主模块根内，不含治理目录。
- 名单外角色不参与本计划。

## 2. 依赖顺序

env-bootstrap → game-core-dev → runtime-dev → input-ui-dev → qa-verifier

- env-bootstrap 先落构建配置、静态宿主页与入口骨架；
- game-core-dev 在 core 契约下实现纯逻辑；
- runtime-dev 消费 core 实现主循环与重开；
- input-ui-dev 实现输入映射与只读渲染；
- qa-verifier 在集成后执行 AC1–AC5 端到端验证。

## 3. 一模块一实现任务安排（moduleId 为权威标识）

实现阶段按模块逐任务派发，每任务只写该模块路径（跨模块派发会被应用以 module-paths-mismatch 拒绝）：

1. env-resources（env-bootstrap）：package.json / tsconfig.json / vite.config.ts / index.html
2. entry-index（env-bootstrap）：src/main.ts 入口装配
3. game-state（game-core-dev）：src/core/state/
4. collision-boundary（game-core-dev）：src/core/collision/
5. scoring（game-core-dev）：src/core/scoring/
6. game-loop（runtime-dev）：src/loop/
7. restart-flow（runtime-dev）：src/restart/
8. input-control（input-ui-dev）：src/input/
9. rendering（input-ui-dev）：src/render/
10. e2e-verification（qa-verifier）：test/

同一工作区写任务串行；每任务写明需求依据、验收标准（AC1–AC5）、证据要求（纯路径 + 内容/frontmatter + 结论，不要求 worker 计算 hash）。

## 4. 验收与衔接

- 验收口径：`docs/product/snake-game-intent-v1.md` AC1–AC5 与 `docs/contracts/snake-game-architecture-v1.md` 第 2/4 节。
- 独立验收由幕僚创建 verifier 任务；运营不派新质检、不发 acceptance 卡、不代客户验收。
- 实现完成后由运营汇总并向幕僚提交报告；merge-main 由应用呈卡、仅客户本人确认。

## 5. 基线（A9 三件小事）

1. 普通 Git 仓库 `git init -b main`（应用固定 argv；已存在则 no-op）。
2. `.gitignore` ans 托管块 + baseline commit（仅提交 .gitignore，保留用户内容）。
3. 任务分支 `ans/task/wf-8770860170de487389ef9b49` 与 dirty 检查。

基线操作经应用通道执行，失败按真实错误码（baseline-* 等）fail-closed 报告，不以 shell 拼命令绕过。
