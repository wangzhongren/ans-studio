---
schema: project-modules/v2
flowId: snake-game
version: 1
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
---

# snake-game 模块清单 v1

本文件是模块划分的唯一权威源；名单（`docs/proposals/snake-game-roster-v1.md`）中的 `modules[]` 是本文件的派生快照，必须逐项一致。moduleId 为后续任务派发的权威标识。

## 模块与路径

- 普通模块使用 `path`；固定模块 `env-resources`（category=env）与 `entry-index`（category=entry）使用 `paths[]`，且只能由 `env-bootstrap` 拥有。
- 路径均为项目相对路径，尾 `/` 表示为目录；模块路径之间互不重叠、互不嵌套。
- 模块路径不落在治理写区（`.ans/`、`角色卡/`、`docs/intents|product|proposals|contracts|scheduling|quality|verification|skills|mcp|audit/`）。
- 职责边界：core（game-state / collision-boundary / scoring）为无副作用纯逻辑；runtime（game-loop / restart-flow）负责驱动与流程；input-control 只产出 Direction 命令；rendering 只读快照；entry-index 只装配不实现业务；env-resources 只承载构建配置。

## 验收相关模块

- AC1：input-control、game-state
- AC2：scoring、rendering
- AC3：collision-boundary、game-state、game-loop
- AC4：restart-flow、game-state
- AC5：game-loop、restart-flow、e2e-verification
