---
schema: project-architecture/v1
flowId: snake-game
version: 1
proposal: docs/proposals/snake-game-proposal-v1.md
---
# snake-game 架构契约（v1）

- 依据方案：`docs/proposals/snake-game-proposal-v1.md`（v1）
- 依据意图：`docs/product/snake-game-intent-v1.md`（v1）
- 模块清单：`docs/proposals/snake-game-modules-v1.md`（v1）

## 1. 分层与文件结构

```
index.html      # 页面入口层（game-entry 模块）：静态 DOM 结构 + 经典 script 挂载
src/game.js     # 游戏核心层（game-core 模块）：状态机 / 输入 / 步进 / 渲染
src/styles.css  # 表现层（game-core 模块）：布局、HUD、遮罩样式
```

- 依赖方向：`index.html → src/game.js`（单向）。`game.js` 不得反向依赖页面模板，只通过约定的 DOM id 与浏览器事件交互；`styles.css` 只影响表现，不承载逻辑。
- 无构建步骤、无包管理、无外部 CDN/网络请求；脚本必须为经典 `<script>`（`file://` 双击可直接运行，禁止 `type="module"`，禁止 `fetch`/动态 import）。

## 2. DOM 挂载约定（公开契约 game-entry/v1）

`index.html` 必须提供并保持以下 id（供 `game.js` 查询，缺失即视为入口契约破坏）：

| 选择器 | 类型 | 约定 |
| --- | --- | --- |
| `#game` | `<canvas>` | 游戏画布，宽高 400×400，网格 20×20（单元格 20px） |
| `#score` | 文本元素 | 当前分数显示，初值 `0`，每次进食后即时更新 |
| `#status` | 文本元素 | 状态文本（就绪/进行中/游戏结束） |
| `#overlay` | 容器 | 结束遮罩，含最终分数与「重新开始」按钮；非结束态隐藏 |
| `#restart` | `<button>` | 重开按钮，调用 `Game.restart()` |

加载顺序：`src/styles.css` 于 `<head>`；`src/game.js` 于 `</body>` 前，`game.js` 在 `DOMContentLoaded` 后查询上述元素并初始化，保证元素已存在。

## 3. 状态机

- 状态枚举：`ready`（就绪，已初始化未步进）→ `running`（进行中，定时器推进）→ `gameover`（结束，定时器已停止）。
- 重开路径：`gameover → restart() → ready →（首次步进）→ running`。
- 非法迁移拒绝：`running` 中重复 `start()` 不叠加定时器；`gameover` 中忽略方向/步进输入，仅接受重开；任何状态下 `restart()` 均先清除旧定时器再复位（幂等）。
- 可选扩展点：`paused`（暂停）不在 v1 硬验收内；若实现，必须是 `running ↔ paused`，不影响 `ready/running/gameover` 语义。

## 4. 输入 → 方向 → 步进规则

- 事件：`keydown` 监听；方向键 `ArrowUp/ArrowDown/ArrowLeft/ArrowRight` 与 `W/A/S/D`（大小写不敏感），`Space`/`Enter` 在 `gameover` 触发重开。
- 方向缓冲：`nextDirection` 仅保存「下一步」方向；同一步内多次有效输入取最后一次。
- 反向过滤：若 `nextDirection` 与当前 `direction` 相反（dx+ndx==0 且 dy+ndy==0）则忽略；每个 tick 最多应用一次方向变化。
- 步进：固定步长定时器（默认约 120ms/步）调用 `step()`：
  1. 取出 `nextDirection` 作为本步方向；
  2. 计算新蛇头 `head + direction`；
  3. 先做边界判定（§6），越界立即 `endGame()` 并返回，不位移、渲染；
  4. 再做自碰撞判定（§6），命中则 `endGame()`；
  5. 未失败则推进蛇身：头插新格；若新格是食物则分数 +1、保留尾（长度 +1）、重新生成食物；否则删除尾格。
- `requestAnimationFrame` 仅用于 `render()` 刷新，不驱动逻辑步进，保证步进与渲染解耦。

## 5. 食物生成

- 食物坐标为网格内、且**不与蛇身任何格子重合**的空格。
- 生成方式：枚举全部空格后随机取一（避免「随机重试」在蛇占满时死循环）；无空格即视为棋盘占满，结束本局（胜利态，按 `gameover` 处理）。
- 食物在初始化、每次进食、每次重开时生成；不落在界外。

## 6. 边界与自碰撞判定

- 边界：`x < 0 || x >= COLS || y < 0 || y >= ROWS`（COLS=ROWS=20）→ 立即 `endGame()`，停止定时器；**不取模、不环绕、不穿墙**。
- 自碰撞：新蛇头坐标等于当前蛇身某格即失败；判定时排除「本步将移走的尾格」（未进食时），避免合法追尾误判。
- 失败表现：状态置 `gameover`，停止步进，显示 `#overlay` 与最终分数，更新 `#status`。

## 7. 重开复位

`restart()` 必须原子地复位：

- 蛇身 = 初始 3 格（中部、向右）；`direction = right`；`nextDirection = right`；
- `score = 0` 并刷新 `#score`；
- 食物重新随机生成；输入缓冲清空；
- 状态 = `ready`→首步进入 `running`；隐藏 `#overlay`，`#status` 更新；
- 先 `clearInterval` 旧定时器，再启动新定时器，保证不出现双定时器加速。

## 8. 渲染接口与约定

- `render()`：清屏 → 绘制网格背景 → 绘制食物 → 绘制蛇身（头/身可区分）→ 更新 HUD 文本。
- 渲染只读游戏状态，不修改状态、不推进逻辑；`render()` 可在任意状态幂等调用。
- 画布坐标换算：`pixel = grid * CELL`（CELL=20）；不缩放、不使用设备像素比以外的复杂变换。
- 公开接口（浏览器全局 `Game` 命名空间）：`Game.init()`、`Game.start()`、`Game.restart()`、`Game.step()`、`Game.render()`、`Game.onKey(event)`；供实现与证据脚本调用，不做网络/模块导出。

## 9. 公开契约摘要

- `game-entry/v1`：`index.html` 提供 §2 所列 id 与加载顺序；破坏即入口契约失效。
- `game-core/v1`：`src/` 内实现上述接口与状态机语义；无网络请求、无外部依赖、无持久化。
- 模块归属与路径见 `docs/proposals/snake-game-modules-v1.md`；人员名单见 `docs/proposals/snake-game-roster-v1.md`。

## 10. 扩展点

- 暂停/继续：新增 `paused` 状态与按键，不改动既有状态语义。
- 难度递进/加速：仅调整步进间隔，不改碰撞与计分规则。
- 视觉主题：仅改 `styles.css` 与渲染配色，不动逻辑与 DOM 契约。
- 最高分：属意图非目标（持久化），若未来引入需先经意图变更，不在 v1 契约内。
