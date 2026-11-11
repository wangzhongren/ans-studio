---
schema: project-architecture/v1
flowId: snake-game
version: 1
proposal: docs/proposals/snake-game-proposal-v1.md
---

# 架构与公开契约 · 贪吃蛇（snake-game）v1

依据提案：`docs/proposals/snake-game-proposal-v1.md`（v1）。本文件冻结跨模块边界、数据流与公开接口；模块清单见 `docs/proposals/snake-game-modules-v1.md`，人员归属见 `docs/proposals/snake-game-roster-v1.md`。后续变更须出新版本，不原地修改。

## 1. 文件结构

```text
index.html          页面入口与 DOM 容器（env-bootstrap，entry-index）
README.md           启动方式与操作说明（env-bootstrap，env-resources）
src/main.js         主循环与编排（game-core-dev，game-loop）
src/state.js        游戏状态：蛇/食物/分数/status（game-core-dev，game-state）
src/collision.js    边界/自撞碰撞判定纯函数（game-core-dev，collision）
src/score.js        计分规则（game-core-dev，scoring）
src/restart.js      重开状态归零（game-core-dev，restart）
src/input.js        键盘方向输入（game-ui-dev，input-control）
src/render.js       画面/分数/结束提示渲染（game-ui-dev，render）
qa/                 人工验收清单与记录（game-qa，acceptance-qa）
```

无构建产物目录、无依赖清单、无网络/存储代码。所有代码为浏览器可直接执行的普通 JavaScript，`index.html` 以普通 `<script>` 顺序加载（不使用 ES module），保证 `file://` 直接打开可运行。

## 2. 分层与依赖方向

- 入口层：`index.html` 只提供 DOM 容器（如 canvas 与分数/状态文本节点）并按顺序加载脚本，不承载规则。
- 编排层：`src/main.js` 持有定时器与模块装配，每个 tick 调用 state 推进 → collision 判定 → render 绘制；处理结束态与重开触发。
- 状态层：`src/state.js` 是唯一可变状态源；蛇、食物、分数、游戏状态只在此变更。
- 判定层：`src/collision.js` 为无副作用纯函数。
- 规则辅助：`src/score.js` 计分规则、`src/restart.js` 状态归零；由 state/main 调用，不自行持有全局状态。
- 输入层：`src/input.js` 只把键盘事件翻译为方向请求并做合法性校验，交给 state。
- 展示层：`src/render.js` 只读状态绘制，不回写。

依赖方向（单向、禁止反向/回写）：

```text
index.html → main.js → { input.js, state.js, collision.js, score.js, restart.js, render.js }
state.js → collision.js
state.js → score.js
restart.js → state.js（仅调用 reset 接口）
render.js → state.js（只读）
```

`state.js`、`collision.js`、`score.js`、`restart.js`、`render.js`、`input.js` 之间不得形成环；不得直接操作 DOM（render 除外，且 render 只写 DOM）。

## 3. 数据模型与公开接口

### 3.1 GameState

```js
/** @typedef {{x:number, y:number}} Cell */
/** @typedef {{
 *   grid: {cols:number, rows:number},
 *   snake: Cell[],              // snake[0] 为蛇头
 *   dir: Cell,                  // 当前移动方向，如 {x:1,y:0}
 *   nextDir: Cell,              // 待应用方向（最后一次有效输入）
 *   food: Cell,
 *   score: number,
 *   status: 'running' | 'gameover',
 *   tickMs: number
 * }} GameState */
```

### 3.2 模块接口（公开契约）

- `state.js`
  - `createState(opts?) -> GameState`：初始化网格、初始蛇（长度≥2）、随机食物、score=0、status='running'。
  - `step(state) -> { state, ate: boolean, dead: boolean }`：应用 `nextDir`→`dir`，计算新蛇头，越界或自撞时 `dead=true`、`status='gameover'`；吃到食物时保持尾部实现增长并 `score += 1` 并重新生成食物。
  - `setDirection(state, dir) -> boolean`：仅接受单位向量（↑↓←→）；拒绝与当前方向相反的输入；接受则写 `nextDir` 并返回 true。
  - `resetState(state) -> GameState`：调用 restart 约定复位为初始状态（供 restart 模块与 main 使用）。
- `collision.js`
  - `isOutOfBounds(cell, grid) -> boolean`：`x<0 || x>=cols || y<0 || y>=rows`。
  - `isSelfCollision(head, snake, willEat) -> boolean`：按是否进食决定是否检查尾部。
  - 纯函数，不修改入参。
- `score.js`
  - `applyEat(score) -> number`：每次进食固定 +1（意图假设，无连击/倍率）。
  - `resetScore() -> number`：返回 0。
- `restart.js`
  - `resetGame(state) -> GameState`：蛇回初始位置与长度、食物重新生成、score=0、status='running'、保留网格与 tickMs。
- `input.js`
  - `bindKeyboard(target, onDirection) -> () => void`：监听 keydown，将 ↑↓←→ 映射为单位向量，调用 `onDirection(dir)`；忽略其他键；返回解绑函数。
  - `KEYS` 映射表：ArrowUp/Down/Left/Right → 方向向量。
- `render.js`
  - `render(ctxLike, state) -> void`：只读 state，绘制网格、蛇、食物。
  - `renderScore(el, state) -> void`：显示 `分数：<score>`。
  - `renderGameOver(el, state) -> void`：status='gameover' 时显示「游戏结束」与最终分数；重开后清除。
- `main.js`
  - `start()`：创建 state、绑定键盘、启动 tick 定时器。
  - `tick()`：step → 若 dead 停表并渲染结束提示；否则 render。
  - `handleRestart()`：resetGame → 清理结束提示 → 重新启动 tick。
  - 对外仅暴露必要启动入口；R 键或界面按钮触发 handleRestart。

接口签名与字段名是跨模块契约，改动需同步更新本文件并出新版本。

## 4. 数据流

1. 页面加载：`index.html` → `main.start()` → `state.createState()` → `render.render()` 首帧。
2. 玩家按键：`input.bindKeyboard` → `onDirection(dir)` → `state.setDirection(state, dir)`（合法性过滤）→ 下一 tick 生效。
3. 每 tick：`main.tick()` → `state.step(state)`（移动/进食/增长/计分）→ `collision` 判定（越界/自撞）→ `render` 绘制 + 分数/结束提示。
4. 结束：`status='gameover'`，停表，`renderGameOver` 显示「游戏结束」与最终分数；不再响应移动（重开除外）。
5. 重开：R 键或按钮 → `restart.resetGame(state)` → 分数归零、结束提示清除 → tick 重启，可立即新开一局。

## 5. 运行与交付约定

- 浏览器直接打开 `index.html` 即可运行；不要求构建、安装依赖或本地服务器。
- `README.md` 写明启动方式、操作键位（↑↓←→ 移动、R 重开）、计分与结束规则。
- 不发起网络请求；不使用 cookie/localStorage/sessionStorage；不写文件。
- 若交付环境不支持浏览器，按意图退化为等价最小可运行形态，并由新版本架构文档重新约定入口与路径。

## 6. 扩展点（非本轮范围）

- 网格尺寸、初始速度 `tickMs`、配色可在模块内调整，不改变接口。
- 可选扩展（WASD、暂停、音效）不属于本轮验收；实现前须走需求变更流程，不在本版架构内预留强制接口。
- 模块边界允许内部重构，但公开接口、依赖方向与验收口径变化须发布新版本架构并重核名单模块归属。
