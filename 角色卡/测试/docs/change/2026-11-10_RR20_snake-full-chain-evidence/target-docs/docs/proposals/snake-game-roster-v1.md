---
schema: project-roster/v3
flowId: snake-game
version: 1
intent: docs/product/snake-game-intent-v1.md
proposal: docs/proposals/snake-game-proposal-v1.md
architecture: docs/contracts/snake-game-architecture-v1.md
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

# 项目名单（v1）

- flowId: `snake-game`
- 产品意图：`docs/product/snake-game-intent-v1.md`（intentId `snake-2d-game`）
- 提案：`docs/proposals/snake-game-proposal-v1.md`
- 模块清单：`docs/proposals/snake-game-modules-v1.md`
- 架构：`docs/contracts/snake-game-architecture-v1.md`
- 跨角色实现契约：`docs/contracts/snake-game-contract-v1.md`

## 1. 人员安排

| 角色 id | 显示名 | 职责 | 能力 | 模块 |
| --- | --- | --- | --- | --- |
| `game-dev` | 游戏开发工程师 | 按架构与契约实现三个静态文件；完成真实浏览器手工自测并报告结果 | 原生 HTML/CSS/JavaScript、Canvas 2D、手工测试、localStorage | `game` |

- 一个实现角色即可覆盖全部交付面；单一模块、单一属主，避免跨角色交接成本。
- 独立验收由项目验收角色按意图 AC 执行（由应用按标准流程安排），不在本名单内重复设岗。

## 2. 环境引导（env-bootstrap）取舍

本次交付为纯静态三文件，**无依赖安装、无构建、无服务端、无包管理器**，因此省略标准 `env-bootstrap` 角色，也不设 env/entry 模块：

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

- 本名单为 v1，不原地修改；后续角色或模块变化须新出 v2 并保持引用指向各自最新版本。
- 引用的意图/提案/架构/模块清单均为当前最新 v1 文件。
