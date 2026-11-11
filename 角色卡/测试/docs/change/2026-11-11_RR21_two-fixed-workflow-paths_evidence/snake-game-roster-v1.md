---
schema: project-roster/v4
flowId: snake-game
version: 1
intent: docs/product/snake-game-intent-v1.md
proposal: docs/proposals/snake-game-proposal-v1.md
architecture: docs/contracts/snake-game-architecture-v1.md
modulesDoc: docs/proposals/snake-game-modules-v1.md
envBootstrap:
  omitted: false
modules:
  - id: game-state
    name: 游戏状态
    purpose: 蛇身/食物/分数/阶段（ready·running·over）的纯状态模型与状态转移
    category: core
    path: src/core/state/
    publicContract: internal（GameState 快照与命令接口）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: collision-boundary
    name: 碰撞与边界判定
    purpose: 蛇头越界判定与食物吞噬判定（纯函数，无 I/O）
    category: core
    path: src/core/collision/
    publicContract: internal（碰撞/边界纯函数契约）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: scoring
    name: 计分
    purpose: 每吃一颗食物固定 +1 的计分规则与食物再生成
    category: core
    path: src/core/scoring/
    publicContract: internal（计分 +1 与食物生成契约）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: input-control
    name: 输入控制
    purpose: 键盘四方向映射为 Direction 命令，并按已接受方向抑制 180° 反向
    category: input
    path: src/input/
    publicContract: internal（键位→Direction 映射与反向抑制）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: rendering
    name: 渲染
    purpose: 只读 StateSnapshot 绘制场地/蛇/食物/分数/结束态，不修改状态
    category: ui
    path: src/render/
    publicContract: internal（只读快照渲染）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: game-loop
    name: 主循环
    purpose: 固定 tick 推进、输入缓冲与阶段切换（运行→结束）
    category: runtime
    path: src/loop/
    publicContract: internal（tick 驱动与阶段转换契约）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: restart-flow
    name: 重开流程
    purpose: 结束态下触发重开，调用 reset 回到初始可玩态
    category: runtime
    path: src/restart/
    publicContract: internal（reset 至初始可玩态契约）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: e2e-verification
    name: 端到端验证
    purpose: 覆盖 AC1–AC5 的端到端脚本与夹具
    category: qa
    path: test/
    publicContract: internal（AC1–AC5 端到端脚本契约）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: env-resources
    name: 环境资源
    purpose: 构建/运行配置与静态宿主页（无业务逻辑）
    category: env
    paths: ["package.json", "tsconfig.json", "vite.config.ts", "index.html"]
    publicContract: internal（构建与运行配置）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
  - id: entry-index
    name: 入口装配
    purpose: 应用入口装配 core/loop/input/render，只接线不实现业务
    category: entry
    paths: ["src/main.ts"]
    publicContract: internal（入口装配）
    architectureSource: docs/contracts/snake-game-architecture-v1.md
roles:
  - id: game-core-dev
    displayName: 游戏核心开发
    purpose: 实现纯逻辑核心：状态模型、碰撞/边界判定与计分
    capability: TypeScript 纯函数与状态机实现、单元测试
    modules: [game-state, collision-boundary, scoring]
  - id: runtime-dev
    displayName: 运行时开发
    purpose: 实现主循环、输入缓冲、阶段切换与重开流程编排
    capability: 定时驱动/循环、事件与流程编排
    modules: [game-loop, restart-flow]
  - id: input-ui-dev
    displayName: 输入与界面开发
    purpose: 实现键盘输入适配与只读快照渲染
    capability: 键盘事件处理、Canvas 绘制
    modules: [input-control, rendering]
  - id: qa-verifier
    displayName: 验收验证
    purpose: 端到端验证 AC1–AC5 并产出可核对证据
    capability: 端到端测试脚本与验收证据整理
    modules: [e2e-verification]
    review: true
  - id: env-bootstrap
    displayName: 环境装配
    purpose: 搭建构建配置、静态宿主页与应用入口装配
    capability: 构建工具配置、入口接线（不实现业务）
    modules: [env-resources, entry-index]
---

# snake-game 人员名单 v1

> 依据：意图 `docs/product/snake-game-intent-v1.md`；提案 `docs/proposals/snake-game-proposal-v1.md`；模块清单 `docs/proposals/snake-game-modules-v1.md`；架构 `docs/contracts/snake-game-architecture-v1.md`。
> 本名单是人事建卡的唯一依据；不自行增删角色，内容变化出新版本 `-vN`，不原地改旧版。

## 1. 角色与模块归属

| 角色 id | 角色 | 绑定模块 | 写区（模块路径） |
|---------|------|----------|------------------|
| game-core-dev | 游戏核心开发 | game-state、collision-boundary、scoring | `src/core/state/`、`src/core/collision/`、`src/core/scoring/` |
| runtime-dev | 运行时开发 | game-loop、restart-flow | `src/loop/`、`src/restart/` |
| input-ui-dev | 输入与界面开发 | input-control、rendering | `src/input/`、`src/render/` |
| qa-verifier | 验收验证（review: true） | e2e-verification | `test/` |
| env-bootstrap | 环境装配 | env-resources、entry-index | `package.json`、`tsconfig.json`、`vite.config.ts`、`index.html`、`src/main.ts` |

- 共 5 个项目角色、10 个模块；每模块恰一个属主，每角色至少绑定一个模块。
- `env-bootstrap` 为固定角色，默认必带：`env-resources`（category=env，多路径）与 `entry-index`（category=entry，多路径）只能归其所有，不得误归其他角色。
- 写区按模块路径隔离、互不重叠；跨模块改动须由该模块属主在其写区内完成，禁止代改。

## 2. 实施顺序与依赖

1. `env-bootstrap`：构建配置、静态宿主页、应用入口骨架（env-resources → entry-index）。
2. `game-core-dev`：core 契约与纯逻辑（game-state → collision-boundary → scoring）。
3. `runtime-dev`：主循环与重开编排消费 core（game-loop → restart-flow）。
4. `input-ui-dev`：输入映射命令、渲染只读快照（input-control、rendering）。
5. `qa-verifier`：集成后跑 AC1–AC5 端到端验证（e2e-verification）。

依赖方向：`entry-index → loop/restart → core`；`input-control → core（仅 Direction）`；`rendering → core（只读快照）`；core 不反向依赖外层。

## 3. 人员+模块拓扑图

```topology
schema: project-topology/v2
modules:
  - id: game-state
    path: src/core/state/
    roleId: game-core-dev
  - id: collision-boundary
    path: src/core/collision/
    roleId: game-core-dev
  - id: scoring
    path: src/core/scoring/
    roleId: game-core-dev
  - id: input-control
    path: src/input/
    roleId: input-ui-dev
  - id: rendering
    path: src/render/
    roleId: input-ui-dev
  - id: game-loop
    path: src/loop/
    roleId: runtime-dev
  - id: restart-flow
    path: src/restart/
    roleId: runtime-dev
  - id: e2e-verification
    path: test/
    roleId: qa-verifier
  - id: env-resources
    paths: ["package.json", "tsconfig.json", "vite.config.ts", "index.html"]
    roleId: env-bootstrap
  - id: entry-index
    paths: ["src/main.ts"]
    roleId: env-bootstrap
roles:
  - id: game-core-dev
    modules: [game-state, collision-boundary, scoring]
  - id: runtime-dev
    modules: [game-loop, restart-flow]
  - id: input-ui-dev
    modules: [input-control, rendering]
  - id: qa-verifier
    modules: [e2e-verification]
  - id: env-bootstrap
    modules: [env-resources, entry-index]
management: [convener, game-core-dev, runtime-dev, input-ui-dev, qa-verifier, env-bootstrap]
```

## 4. 说明

- topology 的 `modules[]`/`roles[]` 与 frontmatter `modules[]`/`roles[]` 完全一致；`management` 为扁平字符串数组，含 `convener` 与全部项目角色 id。
- 本名单不含名单外角色；不建卡、不招人、不派发任务由后续治理流程按本名单执行。
