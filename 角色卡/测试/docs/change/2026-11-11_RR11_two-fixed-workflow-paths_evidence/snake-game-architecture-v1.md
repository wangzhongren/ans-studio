---
schema: project-architecture/v1
flowId: snake-game
version: 1
proposal: docs/proposals/snake-game-proposal-v1.md
intent: docs/product/snake-game-intent-v1.md
---
# 架构与契约：贪吃蛇游戏（v1）

- 版本链：proposal = docs/proposals/snake-game-proposal-v1.md；intent = docs/product/snake-game-intent-v1.md（version 1）
- 模块清单（唯一权威源）：docs/proposals/snake-game-modules-v1.md
- 人员名单：docs/proposals/snake-game-roster-v1.md

## 1. 总体形态

零依赖静态网页：`index.html` + `styles/main.css` + 若干经典脚本。双击 `index.html` 用 `file://` 直接打开即可运行；无构建工具、无本地服务器、无网络请求、无第三方库。

关键决定：脚本使用**经典 `<script>` 按序加载**（不使用 ES module），避免 `file://` 下模块加载被浏览器拦截。

## 2. 分层与依赖方向

```
[入口层 entry] index.html ──加载──▶ 全部脚本（按序）
[外壳层 env]  styles/（纯样式，无逻辑）
[装配层 app]  src/app/ ──▶ core / input / render
[表现层 ui]   src/render/ ──▶ core（只读 state 快照）
[输入层 input] src/input/ ──▶ core（仅通过 onDirection 回调发出方向指令）
[核心层 core] src/game/ ──▶ 无依赖（纯逻辑）
```

依赖方向单向向下：`app → {input, render, core}`；`input → core`；`render → core`；`core` 不依赖任何其他模块，不触碰 DOM。

## 3. 模块划分、属主与文件路径

| 模块 id | 属主角色 | 文件路径 | 职责 | 公开契约 |
|---------|----------|----------|------|----------|
| entry-index | env-bootstrap | `index.html` | 页面结构、DOM 容器、脚本加载顺序 | DOM 契约（§4.0） |
| env-resources | env-bootstrap | `styles/`（`styles/main.css`） | 页面外壳、画布、分数/状态/按钮样式 | 样式契约（§4.0） |
| game-core | game-implementer | `src/game/`（`core.js`） | 状态机：移动、进食计分、边界碰撞、重置 | `window.SnakeCore`（§4.1） |
| input-control | game-implementer | `src/input/`（`keyboard.js`） | 方向键监听，映射为方向指令 | `window.KeyboardInput`（§4.2） |
| render-ui | game-implementer | `src/render/`（`renderer.js`） | 画布绘制、分数/状态更新、重开按钮绑定 | `window.Renderer`（§4.3） |
| app-bootstrap | game-implementer | `src/app/`（`main.js`） | 装配与固定 tick 游戏循环驱动 | 启动编排（§4.4） |

每个模块恰有一个属主，路径互不重叠、不嵌套。

## 4. 公开契约边界

### 4.0 DOM 与样式契约（entry / env）

`index.html` 必须提供以下稳定挂载点：

- `#game-canvas`：`<canvas>`，尺寸 480×480（网格 20×20，每格 24px）。
- `#score`：分数显示元素，文本形如 `分数：<N>`。
- `#status`：状态显示元素（如「进行中」/「已结束」/「已重开」）。
- `#restart-btn`：重开按钮，可见文字「重新开始」。

脚本加载顺序固定：`src/game/core.js` → `src/input/keyboard.js` → `src/render/renderer.js` → `src/app/main.js`。

`styles/main.css` 只提供样式类与布局，不写入游戏逻辑、不改变上述 id/结构。

### 4.1 核心逻辑契约（game-core）

全局对象 `window.SnakeCore`，纯逻辑、无 DOM 依赖：

- `newGame(config) -> state`：`config = {gridW=20, gridH=20}`；初始蛇 3 节位于场地中部、向右移动，分数 0，状态 `running`，食物在非蛇空格随机生成。
- `setDirection(state, dir)`：`dir ∈ {"up","down","left","right"}`；写入「下一步方向」，忽略与当前方向相反的输入；不立即推进。
- `tick(state) -> state`：按「下一步方向」推进一格；先判定边界碰撞——蛇头下一格越出 `[0, gridW-1] × [0, gridH-1]` 即置 `status = "gameover"` 并**不移动、不穿墙**；否则移动；若蛇头进入食物格：增长一节、`score += 1`、重生成食物。
- `reset(state) -> state`：恢复到 `newGame` 的初始状态（蛇、分数、食物、方向、状态全部归零）。

`state` 快照结构（只读消费）：

```text
{
  gridW, gridH,
  snake: [{x, y}, ...],     // 索引 0 为蛇头
  dir: "up|down|left|right",
  nextDir: "up|down|left|right",
  food: {x, y},
  score: 0,
  status: "running" | "gameover"
}
```

约定：意图仅要求边界碰撞，**不实现自撞结束判定**（不引入客户未提出的额外规则）；食物重生成时避开蛇身格；场地被填满的极端情形不作胜利判定，保持可运行即可（不作为验收项）。

### 4.2 输入契约（input-control）

`window.KeyboardInput`：

- `attach({onDirection}) -> detach`：在 `window` 上监听 `keydown`，仅映射 `ArrowUp/ArrowDown/ArrowLeft/ArrowRight` → `"up"/"down"/"left"/"right"`，调用 `onDirection(dir)`；对方向键调用 `preventDefault()` 阻止页面滚动；其他按键忽略。
- 输入模块不持有、不修改游戏状态，只发出方向指令；180° 反向过滤由核心 `setDirection` 统一裁决。

### 4.3 渲染契约（render-ui）

`window.Renderer`：

- `create({canvas, scoreEl, statusEl}) -> renderer`：保存 DOM 引用与 2D 上下文。
- `draw(state)`：依据 state 快照绘制场地网格、食物、蛇（蛇头与蛇身可区分色）、更新 `#score` 文本为 `分数：<state.score>`、更新 `#status` 文本（running/gameover）。
- `bindRestart(btn, onRestart)`：绑定 `#restart-btn` 点击到 `onRestart` 回调。

渲染模块只读 state，不修改 state，不写入核心逻辑。

### 4.4 启动编排契约（app-bootstrap）

`src/app/main.js` 在 `DOMContentLoaded` 后：

1. 取 DOM 引用，`const state = SnakeCore.newGame({gridW:20, gridH:20})`。
2. `KeyboardInput.attach({onDirection: dir => SnakeCore.setDirection(state, dir)})`。
3. `const renderer = Renderer.create({canvas, scoreEl, statusEl})`；`renderer.bindRestart(btn, () => { SnakeCore.reset(state); renderer.draw(state); ensureLoop(); })`。
4. 固定 tick 循环（约 140ms）：`SnakeCore.tick(state)` 后 `renderer.draw(state)`；`state.status === "gameover"` 时停止推进（保留画面与结束提示），等待重开重新启动循环。

## 5. 数据流

```
键盘方向键 ──▶ KeyboardInput ──onDirection──▶ SnakeCore.setDirection
定时器 tick ──▶ SnakeCore.tick(state) ──state 快照──▶ Renderer.draw(state)
重开按钮 ──▶ onRestart ──▶ SnakeCore.reset(state) ──▶ Renderer.draw(state) ──▶ 重启 tick 循环
```

单向数据流：输入只发指令、核心独占状态、渲染只读快照；三者无隐式共享可变 DOM 状态。

## 6. 扩展点（不属本次范围）

- 场地尺寸/速度/每食物分值可作为 `config` 参数化（默认 20×20、140ms、+1）。
- 新玩法（自撞规则、关卡、音效、移动端触控等）为客户未提出的非目标，需另行授权，不在本版本实现。

## 7. 验收要点（对应提案 §2）

1. **键盘方向控制**：分别按 ↑↓←→，蛇按对应方向移动且页面不滚动；按当前方向的反向键时蛇不立即反向（忽略该输入）。
2. **计分**：连续吃 3 个以上食物，`#score` 从 0 按次数正确递增（每次 +1），界面实时更新；蛇身相应增长。
3. **重开**：进行中点击「重新开始」→ 分数归 0、蛇回到初始 3 节、状态回到进行中；游戏结束（撞边界）后点击「重新开始」→ 同样完整归零并重新可玩。
4. **边界碰撞**：向四条边界各推进撞一次，蛇头到达边界外一格即本局立即结束、显示结束状态，蛇不穿墙、不环绕。
5. **同局闭环**：一局内可完成「移动 → 进食加分 → 撞边界结束 → 重开继续」的完整流程，四项能力互不冲突。

## 8. 约束与合规

- 代码与资源均位于项目相对路径；模块路径不与治理写区重叠。
- 不引入客户未提出的功能（联网、音效、触控、关卡、皮肤、账号、多人等）。
- 无构建产物、无依赖锁文件；`index.html` 直接打开即可运行。
