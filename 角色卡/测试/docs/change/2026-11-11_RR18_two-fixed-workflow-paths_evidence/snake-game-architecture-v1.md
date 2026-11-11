---
schema: project-architecture/v1
flowId: snake-game
version: 1
author: rapporteur
status: draft
---

# snake-game 架构 v1

- flowId：`snake-game`
- workflowId：`wf-5f518ee14f687c8c8f3c6966`
- 上游提案：`docs/proposals/snake-game-proposal-v1.md`（本架构以其为方案依据）
- 意图依据：`docs/product/snake-game-intent-v1.md`
- 版本：v1（随 A6 提案确认后生效；变更出新版本）

## 一、运行形态与总体结构

单页静态网页，`file://` 直接打开 `index.html` 即运行；零构建、零依赖、零网络请求。整体为三层单向结构：

```text
entry-page (index.html)
   ├── game-input  (src/input.js)   ── 方向意图/重开事件
   ├── game-render (src/render.js)  ── 主循环/绘制/UI
   └── game-style  (src/style.css)
               │
               ▼
        game-core (src/game.js)      ── 纯逻辑状态机（不触 DOM）
```

**依赖方向（硬约束）**：
- `game-core` 不依赖输入、渲染、DOM、计时器；只暴露纯函数/对象 API。
- `game-render`、`game-input` 单向依赖 `game-core`。
- `entry-page` 只负责装配与脚本加载顺序；不承载游戏规则。
- `game-style` 仅样式，不参与逻辑。
- 禁止反向依赖（core → DOM/input/render）与跨层回写。

## 二、模块与文件

| 模块 id | 路径 | 说明 |
| --- | --- | --- |
| `entry-page` | `index.html` | 容器 DOM、分数/结束/重开 UI 骨架、按顺序加载脚本 |
| `game-core` | `src/game.js` | 状态机、步进、方向、计分、增长、越界、reset |
| `game-render` | `src/render.js` | Canvas 绘制、主循环调度、UI 更新、重开按钮 |
| `game-input` | `src/input.js` | 键盘事件、preventDefault、方向与重开按键 |
| `game-style` | `src/style.css` | 布局与样式 |

脚本加载顺序固定为：`src/game.js` → `src/render.js` → `src/input.js`（经典脚本，非 ES module；各文件以 IIFE 挂载到 `window.SnakeGame` 命名空间）。

## 三、公开契约

跨模块接口与行为口径冻结在：`docs/contracts/snake-game-contract-v1.md`。要点：
- `SnakeGame.create(options)` 返回核心实例；`start/step/setDirection/reset/getState` 为唯一交互面。
- 状态对象包含 `cols/rows/snake/food/score/status/direction/pendingDirection`，为只读快照。
- 方向规则、越界判定、计分/增长、食物生成、结束态、重开语义均在契约 §6 明确。
- DOM 契约：`#game-canvas`、`#score`、`#status`、`#restart` 为固定 id。

## 四、数据流

1. 用户按键 → `input.js` 捕获 keydown，方向键 `preventDefault` → 调用 `core.setDirection(dir)`；反向或非法输入被核心忽略。
2. 主循环（`render.js`）按固定 tick 130ms 调用 `core.step()`。
3. `step()` 计算下一蛇头 → 越界则置 `over`（结束，不再前进）；命中食物则分数 +1、蛇增长、食物重生成；否则正常移动。
4. `render.js` 每次 tick 后读取 `core.getState()` 绘制 Canvas，并更新分数与状态文案（实时）。
5. `over` 后主循环停止，展示最终分数与重开入口；点击重开按钮或按重开键 → `core.reset()` 清空待处理方向、复位蛇/食物/分数 → 重新 `start` 主循环。

## 五、状态机

```text
ready ──start──▶ playing ──越界──▶ over
  ▲                                  │
  └──────────── reset ◀──────────────┘
```

- `playing`：每个 tick 前进一格；接受合法方向输入（非反向）。
- `over`：停止 tick、忽略方向输入；仅展示最终分数与重开入口。
- `ready`：初始/重开后的可玩状态，首次输入或自动开始即进入 `playing`。

## 六、关键参数（方案层冻结）

| 参数 | 值 |
| --- | --- |
| 网格 | 20×20 格 |
| 单元格像素 | 20×20（Canvas 400×400，CSS 可等比缩放） |
| tick | 130ms |
| 初始蛇长 | 3 |
| 初始方向 | 向右 |
| 初始分数 | 0 |
| 每食物得分 | +1 |
| 加速 | 无（不随分数变化） |
| 穿墙 | 禁止（越界即 over） |

这些参数属于方案/实现层，不改变意图 v1 的行为口径；变更需契约新版本。

## 七、扩展点（不实现，仅预留结构）

- 若未来需要加速/关卡/穿墙：在 `game-core` 增加规则配置对象，渲染/输入层不变。
- 若未来需要多种渲染（DOM/Canvas）：保持 `getState()` 快照契约，替换 `game-render`。
- 若未来需要触控：在输入层增加适配器，核心规则不变。
- 扩展均不得在当前版本引入外部依赖或改变意图 v1 验收口径。

## 八、与提案/模块/名单的关系

- 本架构实现 `docs/proposals/snake-game-proposal-v1.md` 的方案；模块路径以 `docs/proposals/snake-game-modules-v1.md` 为唯一权威源。
- 名单（`docs/proposals/snake-game-roster-v1.md`）按模块路径分配属主；本文件不定义人员。
- 契约文档 `docs/contracts/snake-game-contract-v1.md` 为本架构的接口细化与冻结版本。
