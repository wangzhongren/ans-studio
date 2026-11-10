---
schema: project-architecture/v1
flowId: snake-game
intentId: snake-2d-game
version: 2
author: rapporteur
status: draft
proposal: docs/proposals/snake-game-proposal-v2.md
---

# 2D 贪吃蛇小游戏 — 架构（v2）

- flowId: `snake-game`
- 提案依据：`docs/proposals/snake-game-proposal-v2.md`（v2）
- 产品意图：`docs/product/snake-game-intent-v1.md`（intentId `snake-2d-game`）
- 实现模块：`game`（path `game/`），见 `docs/proposals/snake-game-modules-v1.md`
- 跨角色实现契约：`docs/contracts/snake-game-contract-v2.md`
- 本版变更：新增 `PAUSED` 状态与暂停/继续数据流（对应提案 v2 与 AC-11）；分层与依赖方向不变。

## 1. 架构约束

- 纯前端、零第三方依赖：不得引入 CDN、外链资源、npm 包、UI/游戏框架。
- 无构建、无包管理器、无本地服务器：源码即产物，浏览器直接打开 `game/index.html` 运行。
- 因 `file://` 下浏览器会拦截跨文件 ES module 的 `import`，脚本采用**单个经典脚本**（IIFE 包裹），不做跨文件模块加载。
- 状态与渲染同页面完成，不跳转、不刷新。
- 最高分仅存于 `localStorage`，无网络、无服务端。

## 2. 分层与模块边界

单一交付模块 `game/`，内部逻辑分层（分层是职责边界，不是目录拆分）：

```text
┌───────────────────────────── game/ ─────────────────────────────┐
│  L1 页面骨架  index.html                                         │
│      DOM 结构、静态文案、对 styles.css / game.js 的单向引用       │
│                    │                                             │
│  L2 表现层    styles.css + render()                              │
│      只读游戏状态 → 绘制画布、更新 DOM（分数/最高分/overlay）     │
│                    │                                             │
│  L3 规则层    createInitialState() / queueDirection() / step()   │
│                / placeFood() / 碰撞判定                          │
│      纯状态变换，不读 DOM、不写 DOM、不做持久化                   │
│                    │                                             │
│  L4 适配层    键盘事件 / 暂停与重开按钮 / loadBest() / saveBest() │
│      把外部输入与存储翻译成状态操作，并把状态变化回报给表现层     │
└──────────────────────────────────────────────────────────────────┘
```

- **依赖方向**：L1 → L2、L3、L4（仅脚本/样式引用）；L4 → L3 → 状态对象；L2 → 状态对象（只读）。规则层（L3）不反向依赖 DOM 或 localStorage，保证其可被手工推演与复用。
- **无循环依赖**：同一文件内的函数调用为单向；无跨模块 import。
- **边界**：模块只产出静态文件，不暴露任何公共 API、全局对象或网络端点；除 `game/` 外不写任何文件。

## 3. 运行状态机

```text
页面首次加载 → READY
READY  --(方向键/WASD，非反向)-->  RUNNING
RUNNING  <--(空格键 / #pause 按钮)-->  PAUSED
RUNNING  --(撞墙/撞自身)-->  GAME_OVER
GAME_OVER  --(R 键 或 重新开始按钮)-->  RUNNING（新一局）
PAUSED  --(点击「重新开始」按钮)-->  RUNNING（新一局）
```

- `READY`：静态展示初始蛇与食物，overlay 提示开始方式；等待首次方向输入。
- `RUNNING`：固定 120 ms 步进定时器驱动；处理方向队列、移动、进食、碰撞与渲染；`#pause` 文案为「暂停」。
- `PAUSED`：由 `RUNNING` 经空格键或 `#pause` 按钮进入；该状态下不持有步进定时器，蛇、食物、分数静止；`#pause` 文案为「继续」；再次触发恢复 `RUNNING`。`READY`/`GAME_OVER` 下空格与暂停按钮无副作用；`PAUSED` 下 R 键不生效。
- `GAME_OVER`：停止定时器、蛇与食物静止、overlay 显示「游戏结束」与重开提示。
- 状态迁移的唯一入口是 `setStatus(next)`；迁移时统一处理定时器启停与 overlay/DOM 更新（`RUNNING` 创建唯一计时器，`PAUSED`/`GAME_OVER` 必须无计时器）。
- 重开（R 或按钮）会重建完整初始状态（分数 0、新蛇、新食物、空方向队列）并直接进入 `RUNNING`；最高分不受影响。`PAUSED` 下点击「重新开始」按同一规则处理。

## 4. 数据流

```text
用户输入 ──（键盘：方向 / 空格暂停 / R 重开；按钮：暂停、重新开始）──► 输入适配层
                                                                  │
                                                                  ▼
                                             游戏状态对象（唯一事实源）
                            { status, snake[], dir, pendingDirs[], food, score, best }
                                                                  │
          ┌───────────────┬───────────────┬───────────────┬───────┴────────┐
          ▼               ▼               ▼               ▼                ▼
   step()（每120ms）  togglePause()   render()       saveBest()       restart()
   移动/进食/碰撞     RUNNING↔PAUSED  画布+DOM更新   localStorage     重建初始状态
                     启停唯一计时器                     （破纪录时）     直接进入 RUNNING
```

- 游戏状态对象是唯一事实源；DOM 与画布都是它的投影。
- 键盘/按钮只调用状态操作，不直接改 DOM；渲染不修改游戏状态。
- 暂停/继续不写 localStorage，不影响 `score`/`best`；仅改变 `status` 与计时器。

## 5. 不变式（实现必须始终成立）

1. **蛇身唯一性**：`snake[]` 中各格坐标两两不同；长度 = 初始长度 3 + 已吃食物数（即分数）。
2. **食物合法**：食物坐标始终在棋盘内且不在任何蛇身格上。
3. **无 180° 掉头**：任一时刻的生效方向都不是当前朝向的反向；方向队列每步只消费一个输入。
4. **棋盘边界**：所有蛇身格坐标满足 `0 ≤ x < 24`、`0 ≤ y < 24`；越界即判负，不得绘制在画布外。
5. **最高分单调**：会话内 `best` 只增不减，且 `best ≥ score`；新一局只把 `score` 归零，`best` 保留。
6. **单一计时器**：`RUNNING` 有且仅有一个步进定时器；`PAUSED` / `GAME_OVER` 下不得存在步进定时器；任何状态迁移（含暂停/继续）都必须先清理旧定时器、再按需创建唯一新定时器。
7. **零外部依赖**：不存在任何非本目录相对路径的资源引用；断网不影响运行。
8. **零全局污染**：脚本包在 IIFE 内，仅注册必要的事件监听，不向 `window` 挂业务对象。
9. **暂停即冻结**：`PAUSED` 下蛇、食物、分数、最高分均不变化；除恢复 `RUNNING` 或重开外，任何输入不改变可见游戏状态。

## 6. 可扩展点（仅预留，不实现）

- `CONFIG` 常量对象：棋盘列/行数、格宽、步进间隔、初始长度、颜色、`localStorage` key 单点可调。
- 规则与渲染解耦：替换 `render()` 不影响规则；替换步进方式（如 rAF 累加器）不影响规则。
- 输入映射表：新增键位只需扩映射，不改规则层。
- 持久化适配：`loadBest()`/`saveBest()` 是唯一存储入口，可替换存储介质而不动规则层。

以上扩展点均为结构预留，**不属于本次交付范围**；除本版新增的暂停/继续外，其他新增玩法（自动暂停、设置菜单、加速、关卡、音效、触屏等）属非目标，需新意图版本驱动。

## 7. 部署与运行

- 交付单元：`game/index.html`、`game/styles.css`、`game/game.js` 三个静态文件。
- 运行方式：浏览器直接打开 `game/index.html`；无需构建、无需服务器、无需联网。
- 无环境变量、无配置文件、无安装步骤。
