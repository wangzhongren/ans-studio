# snake-game 验收报告（A12b / v1）

- flowId：`snake-game`
- workflowId：`wf-7fcce8656a9bfb7fca73f124`
- 任务编号：`#t-mwc0yoho-0cb40d29`（A12b 独立验收）
- 被验对象（任务指定最终完整 OID）：`5428a28823f60104020ab01f5884f430f56fd2f4`
  - `index.html`（game-entry：DOM 挂载与加载顺序）
  - `src/game.js`（game-core：状态机/输入/步进/计分/碰撞/重开/渲染）
  - `src/styles.css`（表现层）
- 冻结验收标准：`docs/quality/snake-game-criteria-v1.md`（v1，status=final，AC-1…AC-9）
- 对照依据：`docs/product/snake-game-intent-v1.md`（v1）、`docs/contracts/snake-game-architecture-v1.md`（v1）
- 核对角色：verifier（独立质检）；核对日期：2026-11-11
- 本报告不发起验收卡、不推进交付/合并、不修改实现与标准。

## 1. 核对方式、证据范围与限制

**采用方式**：对 `index.html`、`src/game.js`、`src/styles.css` 做**完整文件静态核对**（逐文件读取全部内容，对照冻结标准与架构契约逐条判断），未修改任何文件。

**限制（必须如实声明）**：

1. **无运行期验证通道**：本会话未注入浏览器或 `file://` 页面执行能力，无法实际打开 `index.html` 运行游戏、无法截图、无法观察控制台/Network；且本任务要求不得运行任何 shell 命令，故未启动服务器、未执行任何脚本。
2. 因此凡冻结标准中要求运行截图/步骤复现/运行期 DOM 或 Network 观察的 AC，一律标记为**证据不足（insufficient evidence）**，不以静态推断冒充运行通过，也未伪造截图或运行记录。
3. **OID 绑定**：被验 OID 按任务派发给定；本会话无 Git 查询/复核通道（固定路径未注入，且任务禁止 shell），未能独立复核工作树文件字节与该 OID 的绑定关系。本报告的静态结论基于项目工作树当前内容，若工作树与指定 OID 不一致，须按指定 OID 重新核验。
4. 未创建 `docs/verification/` 证据附件：运行类证据不可得，按任务要求不伪造。
5. 冻结标准未增删、未改判；逐 AC 沿用 AC-1…AC-9 原文含义与优先级。
6. **复核记录（同一任务重复派发）**：2026-11-11 重新读取 `index.html`、`src/game.js`、`src/styles.css`，内容与本报告首次核对时一致；`docs/verification/` 仍不存在，无新增运行证据；结论维持不变。

## 2. 逐 AC 结论汇总

| AC | 优先级 | 结论 | 静态核对要点（证据路径与片段） | 运行证据 |
| --- | --- | --- | --- | --- |
| AC-1 键盘控制与持续步进 | P0 | 证据不足（insufficient evidence） | `src/game.js` `onKey()` 方向键/WASD 映射、反向过滤、`STEP_MS=120` 定时步进均存在且方向正确；运行未验证 | 无（无浏览器通道） |
| AC-2 计分与分数显示 | P0 | 证据不足（insufficient evidence） | `step()` 进食分支 `score += 1`；`syncHud()` 写 `#score`；`index.html` 初值 `0`；运行未验证 | 无 |
| AC-3 重开与状态复位 | P0 | 证据不足（insufficient evidence） | `restart()`→`clearTimer()+resetRound()+startTimer()`；`resetRound()` 复位蛇身/方向/分数/食物/遮罩；运行未验证 | 无 |
| AC-4 边界碰撞与自碰撞判负 | P0 | 证据不足（insufficient evidence） | `step()` 边界判定先于位移、无取模/环绕；自碰撞判定排除将移走的尾格；运行未验证 | 无 |
| AC-5 file:// 基本可运行性 | P0 | 证据不足（insufficient evidence） | 仅能静态确认结构完整性；`file://` 实际加载与游玩未验证 | 无 |
| AC-6 DOM 挂载点与加载顺序契约 | P0 | **通过**（静态等效记录） | `index.html` 五 id 齐全、类型/初值/加载顺序符合契约；标准允许「等效静态记录」 | 无需运行（静态 HTML 即 DOM 源） |
| AC-7 无外部依赖/无网络/经典 script | P0 | 证据不足（insufficient evidence） | 静态全量审计：无外部 URL、无 `fetch`/XHR/WebSocket/`import()`、无 `type="module"`；但 Network 运行观察与 file:// 可运行未验证 | 无 |
| AC-8 食物生成合法性与占满处理 | P1 | 证据不足（insufficient evidence） | `spawnFood()` 枚举空格、排除蛇身、随机取一；无空格返回 false 并结束；运行抽查未验证 | 无 |
| AC-9 状态机与定时器语义 | P1 | 证据不足（insufficient evidence） | 状态 `ready/running/gameover` 与 `start()`/`step()`/`restart()` 守卫、`clearTimer()` 先于 `setInterval`；运行未验证 | 无 |

- **通过：1 项**（AC-6）；**不通过：0 项**；**证据不足：8 项**（AC-1、AC-2、AC-3、AC-4、AC-5、AC-7、AC-8、AC-9）。
- 静态核对未发现与冻结标准/架构契约相矛盾的实现；但运行类要求未获证据，不能据此判为通过。

## 3. 逐 AC 核对详情

### AC-1 键盘控制与持续步进（P0）— 证据不足

静态核对（`src/game.js`）：

- `onKey(event)` 先 `event.key.toLowerCase()`，再匹配 `arrowup|w`、`arrowdown|s`、`arrowleft|a`、`arrowright|d`，覆盖方向键与 WASD 且大小写不敏感；方向输入调用 `event.preventDefault()`。
- 反向过滤：`if (dir.x + direction.x === 0 && dir.y + direction.y === 0) return;`，与当前方向相反的输入被忽略；`gameover` 时方向输入直接 `return`。
- 持续步进：`startTimer()` 使用 `global.setInterval(step, STEP_MS)`，`STEP_MS = 120`；`step()` 中 `direction = nextDirection` 后推进；`requestAnimationFrame` 仅用于 `render()` 循环（`startRenderLoop()`），不驱动逻辑步进。
- 源码静态语义符合契约 §4；但「实际按键后蛇持续移动、反向输入被忽略」的**运行行为**未验证（无浏览器通道），冻结标准要求运行截图与复现步骤 ⇒ 证据不足。

### AC-2 计分与分数显示（P0）— 证据不足

静态核对：

- `index.html`：`<div class="hud__score">分数：<span id="score">0</span></div>`，可见分数初值 `0`。
- `src/game.js` `step()`：`var eating = Boolean(food) && nx === food.x && ny === food.y;`，进食分支 `score += 1;` 且保留尾格（长度 +1）、重新生成食物；`syncHud()` 中 `els.score.textContent = String(score);`，`render()` 调用 `syncHud()`。
- 静态逻辑符合「每次进食 +1 并刷新 #score」；但实际进食前后的运行画面与分数变化未验证 ⇒ 证据不足。

### AC-3 游戏结束后的重开与状态复位（P0）— 证据不足

静态核对：

- `restart()`：`clearTimer(); resetRound(); startTimer();` —— 先清旧定时器再复位并启动，连续重开不叠加定时器。
- `resetRound()`：蛇身置 `[{x:10,y:10},{x:9,y:10},{x:8,y:10}]`（中部、向右）、`direction = RIGHT`、`nextDirection = RIGHT`、`score = 0`、`state = 'ready'`、`spawnFood()` 重新生成食物、`hideOverlay()` 隐藏遮罩（`overlay.hidden = true`）、`syncHud()` 刷新 `#score`/`#status`、`render()`。
- `index.html` 的 `#restart` 按钮绑定 click → `restart()`；`onKey` 在 `gameover` 时对空格/Enter 调用 `restart()`。
- 静态复位语义符合契约 §7；但「结束后按钮/键盘重开、复位后继续游玩、多次重开步速不变」未运行验证 ⇒ 证据不足。

### AC-4 边界碰撞与自碰撞判负（P0）— 证据不足

静态核对：

- 边界：`if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) { endGame(); return; }`，`COLS = ROWS = 20`，越界立即 `endGame()` 且 `return`（不位移、不渲染该步），源码无取模/环绕逻辑。
- 自碰撞：`var limit = eating ? snake.length : snake.length - 1;` 后遍历 `snake[i]` 与 `(nx, ny)` 比较，未进食时排除本步将移走的尾格；命中 `endGame()` 并 `return`。
- `endGame()`：`clearTimer()`、`state = 'gameover'`、`showOverlay()`（写入最终分数并显示遮罩）、`syncHud()`（`#status` 变为「游戏结束」）、`render()`。
- 静态逻辑符合契约 §6；但边界失败与自碰撞失败的**运行复现与截图**不可得 ⇒ 证据不足。

### AC-5 基本可运行性与启动稳定性（P0）— 证据不足

- `index.html` 结构完整、`<script src="src/game.js">` 位于 `</body>` 前、样式表在 `<head>`，静态看具备本地打开条件。
- 但「浏览器以 `file://` 直接打开、正常开始并游玩、无启动崩溃、控制台无未捕获异常」属于纯运行期结论，本会话无浏览器/页面执行通道 ⇒ **证据不足**，不推断通过。

### AC-6 DOM 挂载点与加载顺序契约（P0）— 通过（静态等效记录）

依据 `index.html` 完整静态核对（冻结标准允许「等效静态记录」）：

| 契约项 | 实际值 | 结论 |
| --- | --- | --- |
| `#game` | `<canvas id="game" width="400" height="400" ...>` | 符合（canvas，400×400） |
| `#score` | `<span id="score">0</span>`，位于可见 HUD「分数：」中 | 符合（文本元素，初值 0） |
| `#status` | `<p id="status" class="status">就绪</p>` | 符合（文本元素，初值「就绪」） |
| `#overlay` | `<div id="overlay" class="overlay" hidden>`，内含 `#final-score` 与 `<button id="restart" type="button">重新开始</button>` | 符合（结束遮罩，含最终分数与重开按钮；非结束态经 `hidden` 属性隐藏，`styles.css` `.overlay[hidden]{display:none}`） |
| `#restart` | `<button id="restart" type="button">`，`src/game.js` `bindEvents()` 以 `addEventListener('click', ...)` 调用 `restart()`（即公开的 `Game.restart`） | 符合（button；通过事件监听调用 restart） |
| 加载顺序 | `<head>` 内 `<link rel="stylesheet" href="src/styles.css">`；`</body>` 前 `<script src="src/game.js"></script>` | 符合 |
| 初始化时机 | `src/game.js` 末尾：`document.readyState === 'loading'` 时监听 `DOMContentLoaded`，否则立即 `init()`；`init()` 查询上述元素 | 符合 |

- 说明：`#restart` 使用事件监听而非内联 `onclick="Game.restart()"`，调用的仍是同一公开 `restart` 函数，功能语义与契约一致；不构成契约偏离。
- 本 AC 的判定对象是静态 DOM/入口契约，`index.html` 即 DOM 源，无动态创建上述挂载点的代码，静态等效记录可判定通过；该通过不代表其余运行类 AC 通过。

### AC-7 无外部依赖、无网络请求、经典 script 非 ES module（P0）— 证据不足

静态全量审计（`index.html`、`src/game.js`、`src/styles.css`，并查看项目根目录无 `package.json`/`node_modules` 等构建/包管理产物）：

- 无 `http://`/`https://` 外部资源引用；样式与脚本均为本地相对路径。
- `src/game.js` 无 `fetch`、`XMLHttpRequest`、`WebSocket`、动态 `import()`、模块导出；无持久化调用。
- `index.html` 脚本为经典 `<script src="src/game.js"></script>`，无 `type="module"`。

静态层面支持「无外部依赖、无网络代码路径、经典 script」；但冻结标准 AC-7 还要求运行期 Network 观察与 `file://` 直接可运行证据，本会话均不可得 ⇒ **证据不足**（不以静态审计代替运行观察）。

### AC-8 食物生成合法性与棋盘占满处理（P1）— 证据不足

静态核对 `spawnFood()`：

- 以 `occupied` 标记蛇身全部格子，双层循环枚举 `0 ≤ x < COLS`、`0 ≤ y < ROWS` 的空格入 `cells`，`cells.length === 0` 时 `food = null; return false;`，否则 `Math.floor(Math.random() * cells.length)` 取一格 —— 食物必在界内且不与蛇身重合，避免随机重试死循环。
- 初始化/重开经 `resetRound()` 调用 `spawnFood()`；进食时 `step()` 再次调用；棋盘占满时进食分支 `endGame()`（按契约以 `gameover` 处理）。
- 静态逻辑符合契约 §5；但 P1 要求的「若干次进食/重开后的食物位置观察」运行抽查未做 ⇒ 证据不足。

### AC-9 状态机、步进与定时器语义（P1）— 证据不足

静态核对：

- 状态枚举与迁移：`state = 'ready' | 'running' | 'gameover'`；`start()` 仅当 `state === 'ready'` 才进入 `running` 并 `startTimer()`；`step()` 在 `state === 'ready'` 时切 `running`，`gameover` 时直接 `return`；`endGame()` 置 `gameover` 并 `clearTimer()`。
- 定时器单实例：`startTimer()` 先 `clearTimer()` 再 `setInterval`；`restart()` 先 `clearTimer()`；`endGame()` 清定时器。
- 非法迁移/输入：`start()` 在 `running` 重复调用被 `state !== 'ready'` 拦截；`gameover` 时方向输入被忽略，仅 Space/Enter 与按钮触发重开；`restart()` 幂等复位。
- 静态语义符合契约 §3/§4/§7；但「多次重开/重复方向输入后步速稳定、无双定时器」的运行观察未验证 ⇒ 证据不足。

## 4. 总体结论

**验收结论：不能判定通过（本次验收未通过，原因为证据不足/阻塞）。**

- 冻结标准 §1 明确：任一 P0 不通过**或证据不足** ⇒ 整体不通过。本次 AC-1、AC-2、AC-3、AC-4、AC-5、AC-7 六项 P0 均因缺少运行期验证通道而证据不足，故整体不能判定通过。
- 未发现静态层面的实现与契约冲突（0 项判「不通过」），但静态一致性不等于运行验收通过；不得以静态推断替代运行证据。
- **阻塞原因**：本会话未注入浏览器/`file://` 运行能力，且任务禁止 shell，无法形成冻结标准要求的运行截图/步骤复现、控制台与 Network 观察证据。
- 未推进交付/合并，未写验收归档，未自批通过。

## 5. 未验证项清单

1. AC-1：实际按键改变方向、持续移动、反向输入被忽略的运行表现。
2. AC-2：实际进食后分数 +1 与 `#score` 可见更新。
3. AC-3：结束后通过按钮与 Space/Enter 重开，分数/蛇身/食物/遮罩复位，多次重开无双定时器加速。
4. AC-4：越界与自碰撞的实际判负、遮罩/最终分数/状态显示、无穿墙/环绕。
5. AC-5：`file://` 直接打开可开始游玩、无启动崩溃、控制台无未捕获异常。
6. AC-7：运行期 Network 无请求观察、`file://` 直接可运行。
7. AC-8：进食/重开后食物位置的运行抽查（P1）。
8. AC-9：多次重开/重复方向输入后的步速稳定性运行观察（P1）。
9. 被验文件字节与任务指定 OID `5428a288…f4` 的独立绑定复核（无 Git 通道，未复核）。

## 6. 补证建议（不推进交付）

- 由具备浏览器/`file://` 运行通道的一方按冻结标准 AC-1…AC-5、AC-7（及 P1 抽查）执行真实运行，产出截图与步骤记录到 `docs/verification/`（P0 证据附 `evidence-meta/v1` sidecar），再由 verifier 对新指定完整 OID 重新核验；或由幕僚按任务链决定补证/返工路径。
- 在运行证据补齐并经独立核验前，本报告结论保持「证据不足，不能判定通过」。
