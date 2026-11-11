---
schema: project-architecture/v1
flowId: snake-game
version: 1
proposal: docs/proposals/snake-game-proposal-v1.md
---

# 贪吃蛇游戏 · 架构契约 v1

## 1. 依据

- 提案：`docs/proposals/snake-game-proposal-v1.md`
- 产品意图：`docs/product/snake-game-intent-v1.md`
- 模块清单：`docs/proposals/snake-game-modules-v1.md`
- 人员名单：`docs/proposals/snake-game-roster-v1.md`

## 2. 交付形态与运行约束

纯静态单页：`index.html` + `styles.css` + `src/game.js` + `src/ui.js`。使用原生 JavaScript 与经典 `<script>`（非 ES module），无构建步骤、无外部依赖、无服务端；用浏览器直接打开 `index.html`（`file://`）即可运行。

## 3. 分层

- **入口层**（entry-index：`index.html`）：页面结构、画布/分数/结束态/重开按钮等 DOM，按顺序加载 `src/game.js`、`src/ui.js`。
- **界面层**（game-ui：`src/ui.js`；game-style：`styles.css`）：Canvas 渲染、键盘输入、分数与结束态展示、重开按钮交互及页面样式。
- **核心层**（game-core：`src/game.js`）：纯规则与状态机，不访问 DOM、不依赖界面层。
- **环境层**（env-resources：`assets/`）：可选静态资源目录。

## 4. 依赖方向

`index.html` → `src/ui.js` → `src/game.js`；`styles.css` 仅被 `index.html` 引用。界面层依赖核心层的公开对象；核心层不反向依赖界面层，禁止核心层引用 DOM 或界面状态。

## 5. 公开契约

- `window.SnakeGame`（game-core 暴露）：
  - `createGame(config)`：创建并返回游戏状态对象（蛇、食物、分数、结束标记、网格尺寸）。
  - `reset()`：复位分数、蛇、食物与结束态。
  - `tick()`：推进一帧并返回新状态（移动、吃食物 +1、撞墙或撞自身 → 结束）。
  - `getState()`：返回当前状态快照。
- `window.SnakeUI`（game-ui 暴露）：
  - `mount(game)`：初始化画布与键盘/按钮事件绑定。
  - `render(state)`：按状态绘制画布、分数与结束态。
  - `onKeydown(event)`：处理方向键输入并忽略 180° 反向。
- DOM 契约：入口页为 canvas、分数元素、结束态提示与重开按钮提供稳定 id。
- 资源契约：`assets/` 内资源以页面相对路径引用。

## 6. 数据流

键盘方向键 → `ui.js` 捕获并校验方向 → 定时器调用 `game.tick()` → game-core 更新状态（移动/进食/碰撞）→ `ui.render(state)` 更新画布与分数。撞墙或撞自身 → 状态标记结束、停止定时器、显示结束态；点击重开按钮或按 R → `game.reset()` → `ui.render()` → 重新计时。

## 7. 扩展点

- 网格尺寸、帧间隔（速度）、配色集中于可配置常量，便于后续调参。
- 食物与计分规则集中在 game-core，可在不触碰 UI 的前提下扩展。
- 保持 `window.SnakeGame` / `window.SnakeUI` 契约稳定；如需 ES module 或构建工具，须经需求变更确认后出架构新版本。

## 8. 版本

架构 v1 对应提案 v1。分层、公开契约或交付形态发生真实变化时出新版本（`snake-game-architecture-v2.md`），不原地修改。
