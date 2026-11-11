---
schema: project-architecture/v1
flowId: snake-game
version: 1
proposal: docs/proposals/snake-game-proposal-v1.md
author: rapporteur
---

# 架构：贪吃蛇小游戏（snake-game）v1

本架构遵循 `schema: project-architecture/v1`，依据提案 `docs/proposals/snake-game-proposal-v1.md`（v1）编制；模块清单见 `docs/proposals/snake-game-modules-v1.md`（v1），名单见 `docs/proposals/snake-game-roster-v1.md`（v1）。

## 1. 分层与依赖方向

三层，自上而下单向依赖：

1. **入口层** `app-entry`（index.html）：页面骨架、样式、按顺序加载脚本、启动装配。
2. **表现层** `game-ui`（src/ui/）：canvas 渲染、键盘输入、分数/结束态/重开按钮的 DOM 交互。
3. **领域层** `game-core`（src/core/）：游戏状态机与规则，纯逻辑、无 DOM、无 I/O。

依赖方向：`app-entry → game-ui → game-core`。反向依赖禁止：`game-core` 不得引用 `window.SnakeUI`、`document`、`window` 之外的环境对象（仅可记录自身状态），也不得发起任何网络请求或读写 localStorage。

## 2. 文件布局

```text
index.html                 # app-entry：页面骨架 + 按序加载脚本
src/core/game.js           # game-core：window.SnakeCore（状态机与规则）
src/ui/render.js           # game-ui：canvas 绘制
src/ui/input.js            # game-ui：键盘事件 → setDirection
src/ui/main.js             # game-ui：装配 loop 与 UI（SnakeUI.mount）
styles.css                 # 页面样式（由 game-ui 负责，挂在上表 src/ui/ 约定之外时需在页面内联）
docs/acceptance/           # acceptance-record：验收记录与截图（qa-reviewer 专属）
```

脚本加载顺序：`src/core/game.js` → `src/ui/render.js` → `src/ui/input.js` → `src/ui/main.js`；全部为 classic script（非 ES module），因此 `file://` 直开可用。

## 3. 跨模块公开契约（契约面）

### 3.1 核心公开接口（`window.SnakeCore`，game-core 提供）

- `createGame(options?) → state`：`options = {cols=20, rows=20, initialLength=3, tickMs=150, foodScore=10}`；返回初始状态（分数 0，蛇居中，食物随机于空单元格）。
- `setDirection(state, direction) → void`：`direction ∈ {"up","down","left","right"}`；若与当前方向 180° 相反或非法，**忽略本次输入**；合法输入入方向队列（最多缓存 2 个）。
- `step(state) → event`：按当前方向推进一格；返回事件 `{type, snapshot}`，`type ∈ {"moved","ate","gameover"}`；`gameover` 含 `reason ∈ {"wall","self"}`；结束时状态冻结，后续 `step` 不再移动。
- `getSnapshot(state) → snapshot`：只读快照 `{cols, rows, snake:[{x,y}...], food:{x,y}, score, gameOver, reason}`；UI 只能通过快照渲染。

### 3.2 UI 公开接口（`window.SnakeUI`，game-ui 提供）

- `mount(rootElement) → void`：绑定 canvas、键盘监听（方向键与 WASD）、重开按钮；启动固定节拍循环。
- `render(snapshot) → void`：按快照绘制棋盘、蛇、食物、分数与结束遮罩。
- 重开：结束遮罩上的「重新开始」按钮调用 `createGame` 并以新状态重建循环，蛇、食物、分数全部复位。

### 3.3 入口契约

`index.html` 仅按上述顺序加载脚本，并在 DOM 就绪后调用 `SnakeUI.mount(document.getElementById("game-root"))`；不包含游戏规则逻辑。

## 4. 数据流

键盘事件（game-ui/input.js）→ `setDirection`（game-core，非法/反向输入被丢弃）→ 定时器 tick（game-ui/main.js）→ `step`（game-core，推进/吃食物/判定结束）→ 返回快照 → `render`（game-ui/render.js）→ canvas 与分数 DOM。分数变化只发生在 `ate` 事件中；`moved` 不改变分数。

## 5. 口径与规则

- **边界碰撞**：蛇头某坐标 < 0 或 ≥ cols/rows → 立即 `gameover{reason:"wall"}`，停止移动，界面显示结束遮罩（含最终分数与「重新开始」按钮）；结束后方向输入不改变状态。
- **自撞**：蛇头进入当前蛇身占据的格子 → `gameover{reason:"self"}`；不单独列为验收项，但绝不实现为穿过自身。
- **计分**：初始 0 且界面可见；吃到食物 +10；未吃到不变；不做持久化。
- **食物生成**：在所有蛇身未占据的单元格中等概率随机选取。
- **重开**：结束遮罩按钮触发，完整重建初始状态（分数 0）。
- **不加速**：节拍固定 150ms，不随分数变化。

## 6. 技术栈与运行方式

原生 HTML/CSS/JavaScript + canvas 2D；无框架、无构建、无第三方依赖、无后端与网络请求。运行方式：直接双击打开 `index.html`（file:// 即可，因使用 classic script），或放在任意静态目录浏览；无需本地服务器与外部服务。

## 7. 验收证据

由验收角色 qa-reviewer 按四项验收逐条在浏览器中演示，记录操作步骤与截图到 `docs/acceptance/`（AC1–AC4 分档）；证据只依赖人工演示与截图，不依赖自动化工具或环境探测。

## 8. 扩展点

- 棋盘尺寸/节拍/分值通过 `createGame` 参数与常量集中定义，后续调参不改规则代码。
- `step` 返回事件对象，便于后续增加音效/穿墙/难度等玩法（当前均属非目标）。
- 渲染层与核心逻辑分离，可替换为 DOM 栅格渲染而不改核心。
