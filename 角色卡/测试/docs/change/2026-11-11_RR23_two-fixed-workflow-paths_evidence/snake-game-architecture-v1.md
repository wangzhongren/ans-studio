---
schema: project-architecture/v1
---

# 贪吃蛇游戏 · 架构契约 v1

- 对应方案：`docs/proposals/snake-game-proposal-v1.md`（project-proposal/v2，version 1）
- 对应意图：`docs/product/snake-game-intent-v1.md`（version 1）
- 模块清单：`docs/proposals/snake-game-modules-v1.md`（version 1）
- 名单：`docs/proposals/snake-game-roster-v1.md`（version 1）

本文件是跨角色冻结契约：模块接口、数据流、行为口径与验收映射以本文件为准；实现不得擅自改变接口或语义。变更须出新版本 `-vN`。

## 1. 交付形态与分层

- **交付物**：单个自包含 `index.html`（内联 CSS/JS），离线双击可玩；禁止 `<script src>`、`<link rel="stylesheet">`、`fetch`/`XHR`/WebSocket、CDN、外链字体与图片。`assets/` 可存在但运行时不依赖。
- **源码分层**（8 模块，写入根互不重叠）：

| 层 | 模块 | 路径 | 职责 |
| --- | --- | --- | --- |
| 环境/入口 | env-resources | `assets/` | 静态资源边界；强制无网络依赖 |
| 环境/入口 | entry-index | `index.html` | 页面结构、样式、分数面板、提示/结算区、内联装配与启动 |
| 规则 | game-state | `src/game-state.js` | 网格、蛇、食物、方向、碰撞、增长、状态机 |
| 规则 | score | `src/score.js` | 计分、最高分、localStorage 持久化与降级 |
| 调度 | game-loop | `src/game-loop.js` | 固定步长节拍、rAF 渲染解耦、暂停/恢复 |
| 交互 | input | `src/input.js` | 键盘监听、键位映射、阻止默认滚动 |
| 表现 | render | `src/render.js` | Canvas 绘制、面板与状态提示 |
| 装配 | app-shell | `src/app-shell.js` | 组装模块、编排流程、错误兜底 |

- **依赖方向（单向，禁止反向与循环）**：`app-shell` → {`game-state`, `game-loop`, `input`, `render`, `score`} → 基础数据；`game-loop` 只依赖注入的 `tick`/`draw` 回调；`render` 只读状态；`input` 不直接改状态。模块间统一经 `window.SnakeGame` 命名空间交互。

## 2. 公开契约：模块接口

所有模块以 IIFE 挂载到 `window.SnakeGame`，不污染全局其他名称；以下签名与语义为冻结契约。

### 2.1 `SnakeGame.state`

- `createGame(opts?) → game`：构造新局。`opts` 可含 `gridSize`（默认 20）、`initialLength`（默认 3）、`initialSpeedCps`（默认 7）。
- `start(game) → void`：`ready|paused` → `playing`。
- `changeDirection(game, dir) → boolean`：`dir ∈ {up,down,left,right}`；直接反向返回 `false` 并忽略；否则写入单槽方向缓冲并返回 `true`。
- `tick(game) → { event, scoreDelta, speedCps }`：推进一个节拍；`event ∈ {move,eat,wall,self,noop}`；`wall/self` 时置 `status='over'`。
- `restart(game) → game`：返回重置后的新局（当前分清零、蛇身/速度复位），不改变最高分。
- `pause(game)` / `resume(game)`：`playing ⇄ paused`。
- `game` 数据契约：`{ gridSize:number, snake:{x,y}[], direction:'up'|'down'|'left'|'right', pendingDirection:null|string, food:{x,y}, score:number, foodsEaten:number, speedCps:number, status:'ready'|'playing'|'paused'|'over' }`（坐标 0 基，蛇头为 `snake[0]`）。

### 2.2 `SnakeGame.score`

- `createScoreStore({storageKey, read, write}) → store`：默认键 `snake-game.highScore.v1`，默认读写包装 `localStorage` 并以 `try/catch` 降级为内存。
- `getHighScore(store) → number`：非负整数；非法存储值按 0 处理。
- `onFood(game, store) → number`：当前分 `+10`（唯一加分入口），若超过最高分则更新内存最高分；返回新当前分。
- `onGameOver(game, store) → void`：将最高分写回持久化存储（失败静默）。
- `resetCurrent(game) → void`：仅清零当前分，不动最高分。
- 存储内容仅最高分整数，不写任何玩家个人信息（A9）。

### 2.3 `SnakeGame.loop`

- `createLoop({tick, draw, now?}) → loop`：`now` 可注入时钟（便于测试），默认 `performance.now`。
- `loop.start()` / `loop.stop()` / `loop.pause()` / `loop.resume()`。
- 语义：以 `requestAnimationFrame` 驱动；累加器按 `1000 / speedCps` 计算步长，每帧最多追赶 5 步（超出丢弃，避免突跳）；每步调用 `tick()`，每帧调用一次 `draw()`；暂停时停止调用 `tick` 但仍可重绘。

### 2.4 `SnakeGame.input`

- `attach({onDirection, onPauseToggle, onRestart, onStart}) → detachFn`：监听 `window` 的 `keydown`。
- 映射：`ArrowUp|w|W → up`、`ArrowDown|s|S → down`、`ArrowLeft|a|A → left`、`ArrowRight|d|D → right`；`p|P → onPauseToggle`；`r|R → onRestart`；待开始状态下方向键/WASD 先触发 `onStart` 再触发 `onDirection`；空格亦触发 `onStart`。
- 对方向键与空格调用 `preventDefault()`，避免页面滚动；`P`/`R` 的 `event.repeat` 忽略，避免连发。
- 禁止直接反向由 `state.changeDirection` 统一裁决（输入层不重复实现规则）。

### 2.5 `SnakeGame.render`

- `createRenderer({canvas, scoreEl, highScoreEl, statusEl}) → renderer`。
- `renderer.draw(game, highScore) → void`：绘制 20×20 网格、蛇（头身区分）、食物；更新当前分/最高分面板。
- `renderer.setStatus(status, payload?) → void`：`ready` 显示开始提示；`paused` 显示「已暂停」；`over` 显示结算（本局分数与最高分，各一行）。
- 画布 480×480（20×20 网格 × 24px），深色背景高对比配色；按 `devicePixelRatio` 缩放保证清晰；不使用外部图片/字体。

### 2.6 `SnakeGame.app`

- `init() → void`：取 DOM、创建 store/game/renderer/loop、绑定输入、首次绘制；在 `DOMContentLoaded` 后调用。
- 编排：开始 → 启动循环；`tick` 事件 `eat` → `score.onFood`；`wall|self` → 结束、`score.onGameOver`、停止循环、渲染结算；`P` → 暂停/恢复；`R`/重开按钮 → `state.restart` + `score.resetCurrent` + 重新开始。
- 错误兜底：启动失败时在状态区显示一行可读错误，不抛出未捕获异常（A7 要求无报错）。

## 3. 游戏状态与主循环

1. 页面加载 → `app.init()` → 读取最高分 → `state.createGame()` → 渲染 `ready` 提示。
2. 玩家按方向键/WASD/空格 → `onStart` → `status='playing'` → `loop.start()`。
3. 每个节拍：应用方向缓冲 → 计算新蛇头 → 判定撞墙/自撞 → 吃食物则增长并 `score.onFood`，否则移动尾部 → 返回事件。
4. `wall|self` → 冻结状态、保存最高分、停止循环、渲染结算（本局分与最高分）。
5. `P` → 暂停/继续；暂停时不推进节拍。
6. `R` 或「重开」按钮（任意状态）→ 新局，清零当前分/蛇身/速度，保留最高分，无二次确认。
7. 速度：`speedCps = min(12, 7 + floor(foodsEaten / 5))`，从下一个节拍生效；吃第 5、10、15… 个食物各提速一档。

**碰撞口径**：新蛇头越出 `[0, gridSize-1]` 为撞墙；新蛇头落在蛇身格（不咬尾时排除即将移走的尾格）为自撞。两者均立即结束本局。

**盘面填满**：无空格生成食物时按结束处理并展示结算。

## 4. 输入 / 渲染 / 计分与持久化的交互约定

- 输入层只产生意图事件；规则层是唯一裁判（反向过滤、碰撞、增长）。
- 渲染层只读 `game` 与最高分，不修改状态；不得在渲染中推进逻辑。
- 计分唯一入口为 `score.onFood`（+10）；`game-state` 不直接写 `localStorage`。
- 最高分读取发生在 `app.init()`；写入发生在刷新最高分时与每局结束；刷新页面后最高分保留（A6），当前分不保留。
- 暂停、结算、开始提示均使用固定面板文本区，各一行。

## 5. 单文件装配契约

- `entry-index`（env-bootstrap）按固定顺序内联模块源码：`game-state.js` → `score.js` → `game-loop.js` → `input.js` → `render.js` → `app-shell.js`。
- 每个模块源码为 IIFE，内容原样内联；装配不得修改语义或接口。
- 最终 `index.html` 必须可脱离 `src/` 与 `assets/` 单独复制运行；验收以该单文件在目标浏览器 `file://` 打开为准。

## 6. 验收行为口径（A1–A9）

| 验收 | 架构层保证 |
| --- | --- |
| A1 | 单文件 `index.html` 自包含，无任何网络/外部引用；离线双击可玩 |
| A2 | `loop` 固定步长推进；`input` 支持方向键与 WASD；`changeDirection` 拒绝反向 |
| A3 | `tick` 返回 `eat`，`score.onFood` +10，`render.draw` 实时刷新面板 |
| A4 | `tick` 返回 `wall|self` 立即置 `over`，`render.setStatus('over')` 展示本局分/最高分 |
| A5 | `input` 的 R 与页面「重开」按钮均触发 `state.restart`，无需刷新 |
| A6 | `restart`/`resetCurrent` 清零当前分与速度，`getHighScore` 保留最高分并跨刷新持久化 |
| A7 | 全流程无未捕获异常；存储失败降级；控制台无报错 |
| A8 | 固定步长 + rAF 渲染；单帧追赶上限；目标 ≥30fps |
| A9 | 无账号/无网络；localStorage 仅存最高分整数，不收集个人信息 |

## 7. 扩展点

- 参数集中：网格尺寸、初始速度、加速步长与上限、每食物分值集中为常量，便于后续调整。
- 渲染主题可替换（颜色/格子大小），不影响规则层。
- 输入层可扩展其他键位或设备；计分存储可替换适配器（内存/其他本地存储）。
- 本期不实现音效、触摸、排行榜、关卡、多人等扩展。

## 8. 风险与约束

1. `file://` 下 `localStorage` 可能受浏览器策略影响：按契约降级为内存，不阻断 A7；A6 需在目标浏览器实测并在验收记录中注明。
2. 单文件装配由 env-bootstrap 二次内联：模块接口变更后必须重新装配，验收只认最终 `index.html`。
3. 模块源码不得引用未声明路径或外部资源；路径以模块清单为准，禁止跨模块写入。
4. 本契约为 v1，任何接口/行为变更须出新版本并同步 proposal/modules/roster 的版本引用。
