---
schema: project-architecture/v1
flowId: snake-game
version: 1
---
# snake-game 架构契约 v1

- 提案：`docs/proposals/snake-game-proposal-v1.md`
- 产品意图：`docs/product/snake-game-intent-v1.md`（v1，intentId=snake-game-intent）
- 模块清单：`docs/proposals/snake-game-modules-v1.md`
- 人员名单：`docs/proposals/snake-game-roster-v1.md`

本契约冻结跨角色接口边界；实现细节可在模块内演进，但第 4 节的公开契约与第 2 节的依赖方向变更须出新版本契约，不原地修改本文件。

## 1. 范围
浏览器端单页贪吃蛇：零依赖、零构建，桌面 Chrome/Edge 通过 `file://` 直接打开 `index.html` 即可游玩；20×20 网格、单格 20px；固定步长自动前进；方向键 + WASD；撞墙/撞自结束；每食物 +1 分；会话内最高分不持久化；重开按钮 + R 键。

## 2. 分层与依赖方向
- 页面层（entry-index：`index.html`）→ 实现层（game：`src/game.js`）单向依赖；`index.html` 同时引用 env-resources 的 `styles.css`，样式不承载逻辑。
- `src/game.js` 内部逻辑分层（同文件分区，非独立模块）：
  1. 规则层：纯函数（方向校验、单步推进、碰撞判定、食物生成、计分），不得直接访问 DOM、不得使用 `localStorage`/`sessionStorage`/网络。
  2. 应用层：状态机（running/over）、固定步长主循环、重开复位。
  3. 渲染层：只读状态绘制 Canvas 与 HUD 更新。
  4. 输入层：keydown 映射到 pendingDirection；仅运行态接受方向输入。
- 禁止：反向依赖（规则层→渲染层）、任何网络请求、Web Storage、第三方库与打包流程、ES module（`file://` 下受 CORS 限制，会违反 A10）。

## 3. 模块与属主
| 模块 id | 路径 | 属主 | 说明 |
| --- | --- | --- | --- |
| game | `src/game.js` | game-owner | 全部游戏规则、渲染、输入、主循环与重开 |
| env-resources | `styles.css` | env-bootstrap | 纯色几何样式与布局 |
| entry-index | `index.html` | env-bootstrap | DOM 结构与脚本/样式加载入口 |

## 4. 公开契约
### 4.1 DOM 契约（entry-index 提供，game 依赖）
- `#game-canvas`：`<canvas width="400" height="400">`（20 格 × 20px）。
- `#score`：当前分数显示。
- `#high-score`：会话最高分显示。
- `#overlay`：结束层容器，默认 `hidden`。
- `#final-score` / `#final-high-score`：结束页本局得分与会话最高分。
- `#restart-btn`：重开按钮。
- `#hint`：操作提示（方向键/WASD、R 重开）。

### 4.2 脚本契约（game 提供）
- 以传统 `<script src="src/game.js"></script>` 加载（不得 `type="module"`），暴露 `window.SnakeGame`：
  - `SnakeGame.init(options?)`：绑定 DOM 与键盘、启动主循环；重复调用幂等。
  - `SnakeGame.getState()`：返回 `{snake, food, direction, pendingDirection, score, highScore, status}` 的只读快照。
  - `SnakeGame.reset()`：开新局（复位蛇/食物/分数/pendingDirection，保留 highScore，重启主循环）。
- 配置常量：`GRID = 20`、`CELL = 20`、`TICK_MS = 130`（固定速度，不随分数递增）。
- 键盘映射：`ArrowUp`/`W` 上、`ArrowDown`/`S` 下、`ArrowLeft`/`A` 左、`ArrowRight`/`D` 右；`R` 重开（仅结束态响应）。
- 方向输入：与当前方向相反的输入被忽略（不改变方向、不致死）；每个 tick 仅采用最后一个合法方向，输入在下一移动步生效；结束态忽略方向输入。
- 事件处理：方向键 `keydown` 调用 `preventDefault()`，避免页面滚动。

### 4.3 样式契约（env-resources 提供）
- 约定类名：`.board`、`.hud`、`.overlay`、`.hidden` 等；仅影响观感，不改变 DOM 结构与语义。

## 5. 状态与数据流
- 内存状态：`snake`（有序坐标数组，头在前）、`food`、`direction`、`pendingDirection`、`score`、`highScore`、`status`（`running` | `over`）。
- 初始状态：蛇长 3、位于棋盘中央、朝右；食物在非蛇身、非边界的随机空格生成；score=0；highScore 为会话内内存变量。
- 数据流：`keydown` → 反向校验 → 写 `pendingDirection` → 每 `TICK_MS` 触发 `step` → 更新状态与 HUD → `render` → 若结束则停止主循环并显示结束层。
- `step` 规则：按 `direction` 移动蛇头；若新蛇头格等于食物格则 `score += 1`、蛇身增长（不删尾）、重新生成食物，并立即更新会话最高分显示；否则删除蛇尾。随后判定越界（撞墙）或与蛇身重合（撞自），命中即 `status = over`。
- 食物生成：枚举棋盘内非蛇身空格并随机取一格；若不存在空格（棋盘填满），本局视为结束并按当前得分展示（意图未定义胜利条件，属默认边界处理）。
- 最高分：`highScore = max(highScore, score)`，超过时立即刷新显示；仅存于内存，刷新页面即重置（A8 预期）。
- 重开：结束层按钮点击或 `R` 触发 `reset()`，分数清零、蛇与食物复位、最高分保留。
- 结束冻结：`status = over` 后不再推进，方向输入被忽略，画面保持结束状态。

## 6. 扩展点（非本期，不实现）
速度曲线/难度、穿墙模式、暂停、最高分持久化、移动端触控与自适应布局。扩展时须新增模块与版本化提案/契约，不修改旧版本文档。

## 7. 风险与约束
- 单文件实现使规则与渲染同处一文件：以纯函数分区、内部注释与 A1–A10 人工清单自测缓解；不因内部重构机械增派角色。
- 页面隐藏时浏览器会节流定时器：恢复后仅推进单步，不做多步追赶，避免蛇瞬移。
- `file://` 限制：禁止 ES module、外部 CDN 与任何网络请求，确保 A10 无控制台报错。
- 随机食物生成使用 `Math.random`，如后续需可复现测试可注入随机源，但本期不要求自动化测试。
