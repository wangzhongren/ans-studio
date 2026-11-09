---
schema: project-roster/v3
flowId: snake-game
version: 2
intent: docs/product/snake-game-intent-v1.md
proposal: docs/proposals/snake-game-proposal-v2.md
architecture: docs/contracts/snake-game-architecture-v2.md
modulesDoc: docs/proposals/snake-game-modules-v1.md
envBootstrap:
  omitted: true
  omissionReason: 纯静态单页交付：无依赖安装、无构建、无服务端，无需环境引导
modules:
  - id: game
    name: 贪吃蛇游戏
    purpose: 纯静态单页贪吃蛇的全部交付内容——页面结构、深色主题样式、Canvas 渲染、游戏规则、键盘输入与最高分持久化
    category: feature
    path: game/
    publicContract: docs/contracts/snake-game-contract-v1.md
    architectureSource: docs/contracts/snake-game-architecture-v1.md
roles:
  - id: game-dev
    displayName: 游戏开发工程师
    purpose: 按架构与跨角色契约实现贪吃蛇单页游戏的三个静态文件，并完成真实浏览器手工自测
    capability: 原生 HTML/CSS/JavaScript（Canvas 2D）、浏览器手工测试与调试、localStorage 使用
    modules:
      - game
---

# 项目名单（v2）

- flowId: `snake-game`
- 产品意图：`docs/product/snake-game-intent-v1.md`（intentId `snake-2d-game`）
- 提案：`docs/proposals/snake-game-proposal-v2.md`（v2，客户已接受，req-83771b765b37d527）
- 模块清单：`docs/proposals/snake-game-modules-v1.md`（最新 v1，本次未变更）
- 架构：`docs/contracts/snake-game-architecture-v2.md`（v2）
- 跨角色实现契约：`docs/contracts/snake-game-contract-v2.md`（v2）

## 0. 本版变更说明

本版**仅同步版本链**，不改变团队构成、模块划分、写区与职责：

- 提案引用：`snake-game-proposal-v1.md` → `snake-game-proposal-v2.md`（v1 已非最新，原引用会被判 `reference-invalid`）。
- 架构引用：`snake-game-architecture-v1.md` → `snake-game-architecture-v2.md`。
- 模块清单引用：仍为 `docs/proposals/snake-game-modules-v1.md`（最新版本就是 v1）。
- 角色与模块：与 v1 完全一致——单一模块 `game`（path `game/`，category feature）唯一属主 `game-dev`；仍省略 `env-bootstrap`（原 omissionReason 不变）。

> **关于 `modules[].publicContract` / `architectureSource` 的说明（如实记录差异）**：派发要求把这两项改为 contract-v2 / architecture-v2，但 `project-roster/v3` 加载校验硬性要求「roster 的 `modules[]` 与最新模块清单逐项一致」（`roster-modules-drift`），而最新模块清单仍是 `modules-v1`，其中这两项分别写作 `docs/contracts/snake-game-contract-v1.md` 与 `docs/contracts/snake-game-architecture-v1.md`。为使名单可被加载、真正修好版本链，本版此处**逐字照抄 modules-v1**；若需把这两项升到 v2，须先由策划出 `snake-game-modules-v2`（模块清单升版），再同步名单——本次任务明确要求「不改动 modules」，故不做。

## 1. 人员安排

| 角色 id | 显示名 | 职责 | 能力 | 模块 |
| --- | --- | --- | --- | --- |
| `game-dev` | 游戏开发工程师 | 按架构与契约实现三个静态文件；完成真实浏览器手工自测并报告结果 | 原生 HTML/CSS/JavaScript、Canvas 2D、手工测试、localStorage | `game` |

- 一个实现角色即可覆盖全部交付面；单一模块、单一属主，避免跨角色交接成本。
- 独立验收由项目验收角色按意图 AC 执行（由应用按标准流程安排），不在本名单内重复设岗。
- 本版 v2 相对 v1 **没有新增/删除/改派任何角色**，也没有任何角色权限变化。

## 2. 环境引导（env-bootstrap）取舍

本次交付为纯静态三文件，**无依赖安装、无构建、无服务端、无包管理器**，因此继续省略标准 `env-bootstrap` 角色，也不设 env/entry 模块（与 v1 一致）：

```yaml
envBootstrap:
  omitted: true
  omissionReason: 纯静态单页交付：无依赖安装、无构建、无服务端，无需环境引导
```

> 若客户或验收方认为标准流程必须保留 env-bootstrap，可在客户反馈后出新版本名单补入 `env-bootstrap` + `env-resources` / `entry-index` 模块。

## 3. 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: game
    path: game/
    roleId: game-dev
roles:
  - id: game-dev
    modules:
      - game
management:
  - convener
  - game-dev
```

- 拓扑与 frontmatter 的 `modules[]` / `roles[].modules[]` 完全一致。
- `management` 为扁平数组：项目召集人（convener）与全部项目角色 `game-dev`。
- 模块 `game`（路径 `game/`）唯一属主为 `game-dev`。

## 4. 版本与引用

- 本名单为 v2（新建文件，**不原地修改 v1**）；v1 保持冻结只读，其内部引用仍指向其编写时的 v1 提案/架构，不作为当前有效名单。
- 后续角色或模块变化须新出 v3 并保持引用指向各自最新版本。
- 当前引用均为对应文档的最新版本：intent v1、proposal v2、architecture v2、modules v1。
