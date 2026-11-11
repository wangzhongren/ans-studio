---
flowId: snake-game
version: 1
author: rapporteur
status: draft
---

# snake-game 实现契约 v1（跨角色冻结）

- flowId：`snake-game`
- workflowId：`wf-5f518ee14f687c8c8f3c6966`
- 依据：意图 `docs/product/snake-game-intent-v1.md`；提案 `docs/proposals/snake-game-proposal-v1.md`；架构 `docs/contracts/snake-game-architecture-v1.md`；模块 `docs/proposals/snake-game-modules-v1.md`
- 格式：`contract-md/v1`（文件名 `-vN` 表达版本；本版 v1，旧版只读）
- 状态：草案；随 A6 提案确认后在实现阶段作为派发必读契约使用。本契约不改变意图 v1 的任何行为口径。

## 1. 范围

本契约冻结五个模块之间的接口、DOM 契约、行为口径与验收证据约定，供实现角色（见名单）按模块编写与后续独立验收。实现不得引入构建工具、第三方依赖、外部素材或网络请求。

## 2. 核心模块 `game-core`（`src/game.js`）

以 IIFE 挂载到 `window.SnakeGame`，暴露 `SnakeGame` 对象：

```js
SnakeGame.create({
  cols: 20,       // 正整数
  rows: 20,       // 正整数
  initialLength: 3,
  initialDirection: "right"  // "up" | "down" | "left" | "right"
}) -> game
```

实例方法（**唯一交互面**）：

| 方法 | 语义 |
| --- | --- |
| `start()` | 进入 `playing` 状态；不启动计时器（计时由 render 层负责） |
| `step()` | 推进一个 tick；返回 `state` 快照；`over` 状态调用为空操作（不移动、不改分） |
| `setDirection(dir)` | 传入 `"up"/"down"/"left"/"right"`；非法值或被忽略；与当前生效方向相反时忽略；合法则记录为 `pendingDirection`，在下一个 `step` 生效 |
| `reset()` | 分数=0、蛇复位初始位置与长度、方向复位 `initialDirection`、清空 `pendingDirection`、食物重新生成、状态回到 `ready` |
| `getState()` | 返回只读状态快照（见下），不得返回内部可变引用 |

状态快照字段（只读）：
```js
{
  cols, rows,
  snake: [{x, y}, ...],   // 蛇头在索引 0
  food: {x, y},
  score: 0,
  status: "ready" | "playing" | "over",
  direction: "up" | "down" | "left" | "right",
  pendingDirection: string | null
}
```

**core 禁止**：访问 `document`/`window` 定时器/Canvas/键盘事件；禁止读取或写入 DOM。

## 3. 渲染模块 `game-render`（`src/render.js`）

- 读取 `game.getState()` 绘制 Canvas；不得修改核心内部状态，只能通过 `setDirection/start/step/reset` 驱动。
- 负责固定 tick 主循环（`setInterval` 或等价，130ms）；每个 tick 调用 `game.step()` 后重绘；`over` 后停止计时器。
- 更新 `#score` 文本为当前分数（实时）；`over` 时在 `#status` 显示结束状态与最终分数，并显示 `#restart`。
- 重开：点击 `#restart` 调用 `game.reset()`，随后重新开始主循环并更新 UI；重开期间必须清空待处理方向（由 core.reset 保证）。
- 边界：绘制时蛇头/食物坐标必须落在网格内；`over` 后不得继续调用 `step()`。

## 4. 输入模块 `game-input`（`src/input.js`）

- 监听 `window` 的 `keydown`；方向键 `ArrowUp/ArrowDown/ArrowLeft/ArrowRight` 映射为方向并调用 `game.setDirection(dir)`，调用 `event.preventDefault()` 阻止页面滚动。
- 重开键：`r`/`R`（可附加 `Enter`）调用重开流程（与 `#restart` 按钮一致）。
- 输入层不得直接修改蛇坐标、食物、分数或状态字段。
- 在 `over` 状态下方向输入被核心忽略；输入层无需另行阻断，但不得绕过核心直接改状态。

## 5. 入口页与样式 DOM 契约

`index.html` 必须包含（id 固定，不可改名）：

| 选择器 | 用途 |
| --- | --- |
| `#game-canvas` | `<canvas>` 游戏区域，`width=400 height=400`（20×20 格 × 20px） |
| `#score` | 当前分数显示（文本，初始 `0`） |
| `#status` | 状态提示（playing 可为空/提示；over 显示最终分数） |
| `#restart` | 重开按钮（over 时显示/可用） |

- 脚本加载顺序固定：`src/game.js` → `src/render.js` → `src/input.js`（经典 `<script src>`，不得使用 `type="module"`）。
- 样式表：`src/style.css` 通过 `<link rel="stylesheet">` 引入。
- 不得引用外部 CDN、字体、图片或任何网络资源；不得使用 `fetch`/XHR。
- `src/style.css` 的选择器必须与上述 DOM 契约一致；Canvas 可 CSS 等比缩放但不得改变逻辑网格。

## 6. 行为口径（冻结）

1. **移动**：蛇按 tick 逐格移动；蛇头在索引 0；蛇身跟随。
2. **反向拦截**：与当前生效方向相反的方向输入被忽略；同一 tick 内多次输入只保留最后一个合法方向；不得通过快速连按绕过（以 `pendingDirection` 在 step 时校验）。
3. **计分**：每吃一个食物 +1；分数不因时间/长度变化；初始 0。
4. **增长**：吃到食物时蛇身增加 1 节（不删除尾部）；食物消失并在同一 tick 内于非蛇身空格重新生成。
5. **越界**：下一蛇头坐标 `x<0 || x>=cols || y<0 || y>=rows` 即置 `over`；不穿墙、不夹取、不阻止移动。
6. **结束态**：`over` 后停止移动、忽略方向输入；仅展示最终分数与重开入口。
7. **重开**：分数=0、蛇复位初始位置与长度、方向复位、食物重生成、清空待处理方向与计时器，可立即继续操作。
8. **满盘**：若无非蛇身空格可生成食物，不崩溃/不挂起；以确定性方式结束本局并提示（不作为验收项）。
9. **不加速**：tick 恒定 130ms，不随分数变化。

## 7. 验收证据约定（A12）

- 验收人使用现代桌面浏览器直接双击 `index.html`，按意图 AC1–AC4 逐条实测，记录通过/不通过与观察说明。
- 代码走查对照本契约 §2–§6 核对接口、反向、越界、计分、重开。
- 证据文件使用纯项目相对路径；截图等附件配 `<artifact>.meta.json` sidecar，实际 lines/bytes/sha256/metrics 必须与 sidecar 一致。
- 不引入测试运行时依赖；如需自动化辅助，须使用宿主已有工具，且不得改变交付形态。

## 8. 变更控制

- 本契约冻结后只读；任何接口/行为口径变更出新版本（`snake-game-contract-v2.md`），并同步更新引用它的架构/模块/名单新版本。
- 需求层变更（范围/验收变化）走意图新版本，不在本契约内静默更改。
- 实现中发现的契约缺陷，报回策划（rapporteur）出契约新版本，不由实现角色单方面改写契约。
