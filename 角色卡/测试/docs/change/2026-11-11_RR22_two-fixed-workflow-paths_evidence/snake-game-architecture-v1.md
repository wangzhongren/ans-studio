---
schema: project-architecture/v1
---
# 架构与契约：贪吃蛇游戏（snake-game）

- 版本：v1（首建）。
- 上游提案：`docs/proposals/snake-game-proposal-v1.md`。
- 上游意图：`docs/product/snake-game-intent-v1.md`（intentId `snake-game-core`）。
- 模块权威源：`docs/proposals/snake-game-modules-v1.md`。

## 1. 概述与设计原则

单页、无后端、无网络请求、无账号；双击 `index.html` 即可游玩（file://）。设计原则：规则与渲染分离、输入无状态、持久化契约独立、依赖单向无循环、固定 tick（150ms）不随分数变化。所有坐标为单位格整数，界面像素换算只发生在渲染层。

## 2. 分层与依赖方向

```
index.html（entry-index）
  └─ src/main.js（env-resources：装配/启动）
       ├─ input-control ──(命令)──▶ game-rules
       ├─ game-rules ──(只读状态快照)──▶ renderer
       └─ game-rules ──(loadHighScore/saveHighScore)──▶ score-storage
```

- 依赖严格单向：entry → 装配 → input/game-rules/renderer/score-storage。
- game-rules 不依赖 DOM、不直接引用 localStorage、不引用 renderer/input；存储通过装配时注入的适配器调用。
- renderer 只读状态快照，不修改规则状态；input-control 不持有游戏状态；score-storage 不反向依赖任何业务模块。
- 禁止循环依赖与跨层直连（如 renderer 直接改分数、input 直接改相位）。

## 3. 状态快照契约（game-rules → renderer / 装配）

```
GameState {
  phase: 'ready' | 'running' | 'paused' | 'over',
  grid: { cols: 20, rows: 20, cellSize: 20 },
  snake: [{x, y}, ...],        // snake[0] 为蛇头；初始长度 3
  direction: 'up' | 'down' | 'left' | 'right',
  food: {x, y} | null,
  score: number,               // 10 的倍数
  highScore: number,           // 启动时读入，结束时可能更新
  endReason: 'wall' | 'self' | 'board-full' | null,
  tickMs: 150
}
```

- 坐标范围 `x ∈ [0,19]`、`y ∈ [0,19]`，原点左上、y 向下。
- 快照为只读数据；renderer 不得写回。game-rules 每次状态变化（tick、命令、重开、结算）后提供新快照。

## 4. 输入命令契约（input-control → game-rules）

键位映射（两套键位同时有效，`keydown` 且 `event.repeat === false` 才处理，按住不加速）：

| 按键 | 命令 |
| --- | --- |
| ↑ / W | `requestDirection('up')` |
| ↓ / S | `requestDirection('down')` |
| ← / A | `requestDirection('left')` |
| → / D | `requestDirection('right')` |
| Space | `togglePause()` |
| R / 点击 `#restart-btn` | `restart()` |

规则层契约：

- `requestDirection(dir)`：忽略与队列中最后一个已接受方向（队列为空时与当前 `direction`）相同或相反（180°）的输入；合法输入入队，队列容量 2，按输入顺序每次 tick 消费一个；`phase='ready'` 时任意合法方向入队并立即进入 `running`；`phase='over'` 时方向输入被忽略。
- `togglePause()`：仅在 `running`/`paused` 间切换；`ready`/`over` 不响应。
- `restart()`：任意相位可调用，重置为初始状态并进入 `ready`（见第 8 节）。
- 被忽略的输入不产生任何状态变化（不丢队列中已接受的合法输入）。

## 5. DOM/渲染契约

`index.html` 必须提供以下元素 id（渲染层只使用、不创建/删除）：

| id | 元素 | 用途 |
| --- | --- | --- |
| `#game` | 容器 | 根挂载点 |
| `#board` | `<canvas>` | 棋盘 400×400（20×20、每格 20px） |
| `#score` | 文本 | 当前分数 |
| `#high-score` | 文本 | 历史最高分 |
| `#status` | 文本 | 相位提示（如「已暂停」） |
| `#overlay` | 容器 | 暂停/结束覆盖层显隐 |
| `#overlay-title` | 文本 | 「游戏结束」等标题 |
| `#overlay-reason` | 文本 | 结束原因（撞墙/撞到自己） |
| `#overlay-score` | 文本 | 结束层本局分数 |
| `#overlay-high-score` | 文本 | 结束层最高分 |
| `#restart-btn` | `<button>` | 重开按钮（由 input-control 绑定点击，renderer 不处理交互） |

- `phase='paused'` 显示「已暂停」；`phase='over'` 显示结束层并填入原因/本局分数/最高分；其余相位隐藏覆盖层。
- 渲染层不读 localStorage、不判规则；画布尺寸与网格参数由快照 `grid` 派生。

## 6. 存储契约

- 键：`snake-game:highScore`（仅此一个键，不引入账号/同步/其他数据）。
- 值：十进制非负整数字符串（如 `"120"`）。
- 启动：`loadHighScore()` 读取并解析；缺失、非数字或负值一律回落 `0`；localStorage 不可用（隐私模式等）时捕获异常并在内存中维持最高分。
- 结算：`phase='over'` 时若本局 `score > highScore`，立即 `saveHighScore(score)` 并更新快照中的 `highScore`；`restart` 不清零最高分；清空浏览器数据导致最高分丢失属预期。

## 7. 主循环与数据流

1. 启动：装配读取最高分 → 初始化 `ready` 状态（分数 0、3 节蛇、1 食物）→ 渲染首帧。
2. 运行：`phase='running'` 时每 150ms 一个 tick：消费队列中至多 1 个方向 → 计算新蛇头 → 判定撞墙/自撞/吃食物 → 更新状态与分数、按需重生食物 → 生成快照 → 渲染。
3. 暂停：Space 切换 `running`/`paused`；`paused` 不推进 tick，画面冻结。
4. 结束：撞墙或自撞立即置 `phase='over'`，停止移动；结算最高分并持久化；渲染结束层。
5. 重开：R/按钮 → 重置分数/蛇/食物/方向，保留最高分，`phase='ready'`；此后方向键开始。

## 8. 规则边界细节

- 初始状态：蛇头 `(10,10)`，蛇身 `(9,10)`、`(8,10)`，方向向右；食物在未被蛇身占用格中均匀随机生成。
- 移动：新蛇头 = 蛇头 + 方向单位向量；越界（`x<0 || x>19 || y<0 || y>19`）立即结束，原因 `wall`（不穿墙）。
- 自撞判定：若本 tick 不吃食物，先移除尾格再检测新蛇头是否与剩余蛇身重合（允许进入即将空出的尾格）；若吃食物则不移动尾，直接检测。重合立即结束，原因 `self`。
- 食物：同一时刻仅 1 个，只生成在合法空格；吃到后分数固定 +10、蛇身增长一格，并立即重生下一个；若棋盘无空格，以 `phase='over'`、原因 `board-full` 防御性结束（非意图验收路径，界面显示「棋盘已满」）。
- 暂停：仅切换 `running`/`paused`；恢复后按暂停前方向继续。
- 重开：分数归零、蛇与食物重置、方向向右、保留最高分、进入 `ready`，无倒计时/二次确认。
- 固定 tick 150ms，不随分数或蛇长变化；不实现难度递增。

## 9. 扩展点

- `grid`（列/行/格宽）与 `tickMs` 参数化，便于调整棋盘与速度（本版固定值）。
- 渲染后端可替换（Canvas ↔ DOM 网格），只要满足第 3、5 节契约。
- 存储适配器可替换（内存/其他键），只要满足第 6 节读写语义。
- 纯逻辑接口可直接用于后续可选自动化测试，不改变本契约。

以上扩展仅为设计余量，不属本版交付范围。

## 10. 验收标准（意图第 6 节 11 条）

逐条手动复现并全部通过为达标口径：

1. 打开页面：棋盘、分数 0、最高分（读取本地存储）、初始 3 节蛇与 1 食物可见，处于「待开始」。
2. 按 → 后向右移动；再按 ↑ 在下一格转向向上，无反向。
3. 吃到食物：分数 +10、蛇身 +1、界面同步、食物立即在合法空格重生。
4. 向右移动时按 ←：方向不变，不发生自撞。
5. 快速连按「↑ 再 ←」：按输入顺序执行，不丢失。
6. 按 Space：停止并显示「已暂停」；再按恢复移动。
7. 撞墙：立即结束，显示「游戏结束」、原因「撞墙」、本局分数与最高分。
8. 蛇身较长时自撞：立即结束，原因「撞到自己」。
9. 刷新页面：最高分仍正确显示（本地持久化生效）。
10. 按 R 或点「重开」：分数归零、蛇与食物重置、最高分保留、进入「待开始」，按键可再次开始。
11. 重开后打出更高分：最高分即时更新并显示。

## 11. 版本引用

- 提案：`docs/proposals/snake-game-proposal-v1.md`
- 模块：`docs/proposals/snake-game-modules-v1.md`
- 名单：`docs/proposals/snake-game-roster-v1.md`
- 意图：`docs/product/snake-game-intent-v1.md`
