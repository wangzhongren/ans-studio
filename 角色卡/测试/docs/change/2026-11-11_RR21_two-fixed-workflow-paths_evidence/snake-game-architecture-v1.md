---
schema: project-architecture/v1
---

# snake-game 架构 v1

proposal: docs/proposals/snake-game-proposal-v1.md
intent: docs/product/snake-game-intent-v1.md
modules: docs/proposals/snake-game-modules-v1.md
roster: docs/proposals/snake-game-roster-v1.md

## 1. 分层

| 层 | 模块 | 职责 | 允许依赖 |
|----|------|------|----------|
| 入口装配层 | entry-index | 创建并接线 core/loop/input/render | 所有内层（只接线，不含业务逻辑） |
| 驱动层 | game-loop、restart-flow | 固定 tick 推进、输入缓冲、阶段切换、reset 编排 | core |
| 适配层 | input-control | 键盘事件 → Direction 命令；反向抑制 | core（仅 Direction 常量） |
| 视图层 | rendering | 只读 StateSnapshot → Canvas 绘制 | core（只读快照） |
| 核心层 | game-state、collision-boundary、scoring | 纯状态模型、碰撞/边界与计分纯函数 | 无（不得反向依赖外层） |
| 环境层 | env-resources | 构建/运行配置、静态宿主页 | 无业务依赖 |

## 2. 模块与公开契约

- **game-state**：`Direction = UP|DOWN|LEFT|RIGHT`；`Phase = ready|running|over`；`StateSnapshot = { grid: {w,h}, snake: Cell[], food: Cell, score: number, phase }`；提供 `createInitialState()`、`applyDirection(state, dir)`、`reset(state)`。快照对外只读。
- **collision-boundary**：`isOutOfBounds(nextHead, grid)`、`isFoodAt(nextHead, food)`，均为纯函数；坐标约定为 `[0, w-1] × [0, h-1]`，越界即失败。
- **scoring**：`applyFood(state)` 使 `score += 1` 并在空闲格生成新食物（随机源可注入以便测试复现）。
- **input-control**：`mapKeyToDirection(key)`；以「上一已接受方向」校验，反向（180°）输入忽略且不判负；同一 tick 内至多接受一次方向变更。
- **rendering**：`render(snapshot)` 只读绘制场地、蛇、食物、当前分数与结束态，不修改游戏状态。
- **game-loop**：固定 tick（约 8–10 次/秒）推进 `step`，与 requestAnimationFrame 渲染解耦；检测越界后置 `phase=over` 并停止推进。
- **restart-flow**：结束态收到重开操作后调用 `reset`，蛇身回初始位置/长度、分数归零、回到可操作态。
- **e2e-verification**：覆盖 AC1–AC5 的端到端脚本与夹具，输出可核对证据。

## 3. 依赖方向（单向）

```
entry-index ──> game-loop / restart-flow ──> game-state / collision-boundary / scoring
entry-index ──> input-control ──> game-state（仅 Direction）
entry-index ──> rendering ──> game-state（只读 StateSnapshot）
```

- core 层不得依赖 loop/restart/render/input/entry。
- input 不直接改状态，只产命令；render 不写状态；entry 不实现业务逻辑。
- 禁止跨模块越界修改：各模块只在其属主写区内变更。

## 4. 数据流

1. 键盘事件 → `input-control.mapKeyToDirection` → Direction 命令队列入 loop（每 tick 至多消费一次）。
2. `game-loop` 每 tick：取命令 → `applyDirection` 更新方向 → 计算下一格 → `collision-boundary` 判定越界/食物 → 越界则 `phase=over` 并停止，否则推进蛇身 → 吃到食物则 `scoring.applyFood`（score+1、再生食物）。
3. `rendering` 每帧读取只读 StateSnapshot 绘制；分数随状态即时更新（AC2）。
4. 结束态由 `restart-flow` 接收重开操作 → `reset` → 回到初始可玩态（AC4）。

## 5. 扩展点

- 食物生成随机源可注入（测试与可复现性）。
- 网格尺寸、初始蛇长、tick 速度可配置（不改变验收口径）。
- 未来若要新增玩法（撞自身、暂停、加速、穿墙），须走意图新版本与需求变更，不在本架构默认预留实现。
- 渲染后端可替换（Canvas → 其他），只要消费同一只读快照契约。

## 6. 约束

- 本地单人、键盘输入、离线运行，不依赖网络/账号/外部服务。
- 撞自身不判负、不穿墙、不暂停、不加速、不持久化最高分（意图非目标）。
- 架构版本链：本文件正文引用 proposal `docs/proposals/snake-game-proposal-v1.md`；真实架构变化出新版本，不原地改旧版。
