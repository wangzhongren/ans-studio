---
schema: project-architecture/v1
flowId: snake-game
version: 1
author: rapporteur
status: draft
proposal: docs/proposals/snake-game-proposal-v1.md
---

# snake-game 架构与契约 v1

上游依据：`docs/proposals/snake-game-proposal-v1.md`（提案 v1）与 `docs/product/snake-game-intent-v1.md`（意图 v1）。模块清单以 `docs/proposals/snake-game-modules-v1.md` 为唯一权威源，名单见 `docs/proposals/snake-game-roster-v1.md`。

## 1. 分层

| 层 | 模块 | 说明 |
| --- | --- | --- |
| 入口/装配层 | `entry-index`、`env-resources`、`app-entry` | HTML 入口、样式资源、启动与主循环装配 |
| 交互层 | `input-control`、`render-ui` | 键盘输入适配；画面渲染（二者互不依赖） |
| 规则层 | `game-core` | 纯状态机，无 DOM、无计时器、无渲染依赖 |

## 2. 模块与职责

- `env-resources`（env，`styles/`）：样式表与静态资源目录，只由 `index.html` 引用。
- `entry-index`（entry，`index.html`）：唯一入口；声明 `canvas#board`、`#score`、结束覆盖层；按固定顺序以普通 `<script>` 装载 `src/core`、`src/input`、`src/render`、`src/app`（非 ES module、无外部请求）。
- `game-core`（core，`src/core/`）：游戏状态与规则。
- `input-control`（input，`src/input/`）：键盘事件到方向意图的适配。
- `render-ui`（render，`src/render/`）：Canvas 2D 绘制，只读状态。
- `app-entry`（app，`src/app/`）：装配、固定 tick 主循环、结束态处理、重开编排。

## 3. 依赖方向

```
entry-index / env-resources  →  (仅被浏览器装载，无业务依赖)
app-entry  →  input-control
app-entry  →  render-ui
app-entry  →  game-core
input-control  →  game-core（仅公开契约/类型）
render-ui      →  game-core（仅快照结构）
game-core      →  （无内部依赖）
```

- 禁止反向依赖与循环依赖；`game-core` 不得引用 DOM、`window`、计时器或渲染模块；`render-ui` 不得写状态；`input-control` 不得直接改状态（只产出方向意图）。
- 唯一计时来源在 `app-entry`（固定 130ms tick），保证节奏可控与可复现。

## 4. 公开契约（internal）

### 4.1 game-core

- `createGame(config)` → `game`：config 含 `cols=20`、`rows=20`、初始长度 3、初始位置（中心）、`rng`（可注入，默认 `Math.random`）。
- `queueDirection(game, dir)`：`dir ∈ {up,down,left,right}`；相对**当前生效方向**过滤 180° 反向；最多保留一个待处理方向（后按先到先得，重复同向忽略）。
- `stepGame(game)` → `game`：按当前方向推进一格；若新蛇头越出 `0..cols-1 / 0..rows-1` 任一方向（**触及或越过**）→ `status='over'`，不再推进；若落在食物格 → 长度 +1、`score += 1`、并在空格重新生成食物。
- `resetGame(game)` → `game`：`score=0`、蛇回到初始长度与位置、`status='running'`、食物重新生成。
- `snapshot(game)` → 只读快照：`{cols, rows, snake, dir, food, score, status}`；渲染与测试只读该快照。

### 4.2 input-control

- `normalizeKey(event)` → `'up'|'down'|'left'|'right'|null`：方向键与 WASD（大小写不敏感）均映射；其他键返回 null。
- `attachKeyboard(target, { onDirection, isOver })` → `detach()`：识别到方向后调用 `onDirection(dir)`；`isOver()` 为真时忽略方向输入（结束态不接受输入）；不 `preventDefault` 干扰重开键。

### 4.3 render-ui

- `createRenderer(canvas, config)` → `{ draw(snapshot), showOverlay(snapshot), hideOverlay() }`。
- `draw`：清屏、绘网格线、蛇身、蛇头、食物、分数文本；只读快照。
- `showOverlay`：半透明覆盖 + 「游戏结束」+「最终分数：N」+「重开」按钮；`hideOverlay` 移除。

### 4.4 app-entry

- `start(config)`：创建 game 与 renderer，绑定键盘与重开按钮，启动 130ms 固定 tick。
- tick：`stepGame` → `draw`；`status==='over'` 时停止推进并 `showOverlay`。
- 重开：按钮 click 或 `Space`/`Enter` keydown → `resetGame` → `hideOverlay` → 恢复 tick（同一重置路径，不残留上一局状态）。

### 4.5 entry-index / env-resources

- `index.html` 结构约定：`#board`（canvas 480×480）、`#score`（分数显示，位于画布上方）、结束覆盖层容器；脚本顺序固定，先 core 后 input/render，最后 app。
- `styles/` 只放样式表，使用相对路径；不引入外部字体/CDN，保证离线。

## 5. 数据流

```
keydown → normalizeKey → (isOver? 忽略 : queueDirection) → [130ms tick] stepGame
        → snapshot → renderer.draw ；over → renderer.showOverlay
重开（按钮 / Space / Enter） → resetGame → hideOverlay → 恢复 tick
```

## 6. 验收映射

| 验收 | 承载模块 | 架构保证 |
| --- | --- | --- |
| A1 方向控制 | input-control、game-core、app-entry | 方向意图经队列在下一 tick 生效；反向相对当前方向过滤 |
| A2 实时计分 | game-core、render-ui | 吃食物与计分在同一 tick 完成；渲染每帧读快照，无异步延迟 |
| A3 撞墙结束 | game-core、input-control、render-ui | 越界立即置 `over`；结束态忽略方向；覆盖层显示提示与最终分数 |
| A4 重开 | app-entry、game-core | 单一重置路径，分数/蛇身/食物全部复位 |
| A5 闭环 | 全部 | 固定 tick、无额外状态（无暂停/加速），可连续多轮 |

## 7. 扩展点（v1 不实现，仅预留边界）

- 节奏参数集中在 `app-entry` 的单一常量（未来做难度/加速时不必改 core）。
- 食物生成策略封装在 `game-core`（未来特殊食物不改渲染契约）。
- 计分规则集中在 `game-core`（未来最高分/不同分值不改输入与渲染）。
- 触控/音效/存档等需新增模块或层，v1 明确不做，不在现有模块内「顺手」添加。

## 8. 约束与不假设

- 单人、本地、离线；无网络请求、无账号、无服务端。
- 不依赖构建工具链（零构建）；普通脚本 + 相对路径以支持 `file://` 直接打开。
- 本阶段未运行任何 shell 探测；运行环境（浏览器版本）由客户环境决定。
- 实现产物不属本文件；本文件只冻结模块边界、依赖方向与公开契约。

## 9. 版本

- v1（首次架构/契约，对应 A5，引用提案 v1）。后续变更出新版本，不原地修改。
