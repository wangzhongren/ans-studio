taskId: t-mwbvh1jw-746d1752 | flowId: snake-game | stage: A12b（复验，reworkOf A12b） | criteria: docs/quality/snake-game-criteria-v1.md (v1, final) | result: 未执行/证据不足（不得判通过；静态缺陷已修复，无浏览器实测证据）

# snake-game 独立验收报告 v2（A12b 复验）

- flowId：`snake-game`
- 阶段：A12b 复验（reworkOf: A12b）
- 版本：v2（文件名 `-v2`；v1 报告 `docs/quality/snake-game-report-v1.md` 保持原样，不修改）
- 判定标准：`docs/quality/snake-game-criteria-v1.md`（v1，final，AC-1～AC-10，与首轮同一冻结标准）
- 依据：架构契约 `docs/contracts/snake-game-architecture-v1.md`（§4 公开契约）、产品意图 `docs/product/snake-game-intent-v1.md`（A1–A10）、团队计划 `docs/scheduling/snake-game-team-v1.md`
- 复验对象（任务说明）：任务分支 `ans/task/wf-afe8ddbeba445bed145ccd1c` 新提交 `b5d5ad6317d59785eb3f833d144a6d9e3869e578`「fix(game): spawn food only inside border, excluding boundary cells (A4)」
- 交付物（本轮读取的工作区文件）：`index.html`（32 行）、`styles.css`、`src/game.js`（518 行）
- 性质：本报告只给独立质检结论与证据，不代替客户验收、不代表客户批准；是否验收由幕僚按流程收口。

## 0. 执行条件与限制

1. 本会话**仍未注入浏览器自动化/截图/录屏能力**，且任务边界禁止运行任何 shell 命令（含浏览器启动、node、测试脚本），因此**仍无法在本环境执行真实浏览器试玩**。
2. 本报告继续只做两件事：**静态逐行核对**（引用具体文件与行区间）与**如实记录未执行项**；凡必须真实浏览器才能确认的（画面渲染、实际按键反应、结束层实际展示、Console/Network），一律记「未执行/证据不足」，**未凭静态推断记为通过，也未伪造截图或运行结果**。
3. 本会话无结构化 Git/trunk 工具且禁止 shell，**未能独立核验提交 `b5d5ad6…` 的 OID、分支指针与工作区是否完全一致**；本报告判定的是本轮从工作区读到的文件字节。若应用绑定的最终完整 OID 与此不一致，以应用绑定为准并需重新核验。
4. `docs/verification/` 未生成附件（无真实浏览器证据可附）。
5. 结论口径按冻结标准 §0.3 / §11：单条内任一通过标准不成立即「不通过」；必须实测而未实测记「未执行/证据不足」；任一条不通过或未执行，整体不得判通过。

## 1. 修复点静态复核（重点：spawnFood）

- 位置：`src/game.js` 第 83–100 行 `spawnFood(snake, random)`。
- 枚举范围：第 93 行 `for (let y = 1; y < GRID - 1; y += 1)`、第 94 行 `for (let x = 1; x < GRID - 1; x += 1)`，即 **x、y ∈ [1, GRID-2] = [1, 18]**，仅枚举 18×18=324 个内部格，**不再包含最外圈（x/y 为 0 或 19 的 76 格）**。
- 非蛇身：第 89–91 行用 `Set` 记录蛇身格（`segment.y * GRID + segment.x`），第 95 行 `!occupied.has(...)` 跳过蛇身格。
- 无合法空位：第 98 行 `if (free.length === 0) return null;`，第 99 行 `return free[randomIndex(random, free.length)];` 随机取一格。
- 同源复用：
  - 初始食物：`createInitialState` 第 102–120 行，第 114 行 `food: spawnFood(snake, random)`；
  - 吃后重生：`computeStep` 第 175–184 行，第 175 行 `const food = spawnFood(snake, random);`，第 181 行 `score: state.score + 1`。
- 静态结论：**首轮 AC-1/AC-4 指出的「食物可能落在最外圈」缺陷已在代码层修复**；初始食物与吃后重生走同一函数，均限定在内部非蛇身格。本轮未在该函数发现新的静态不满足项。

## 2. 逐条判定

### AC-1 A1 启动可见（P0）—— 结论：未执行/证据不足（静态食物位置缺陷已修复）

- 判定依据（静态）：
  - `index.html` 第 12–13 行提供 `#score`、`#high-score`（初始均为 `0`）；第 17 行 `<canvas id="game-canvas" width="400" height="400">`；第 19–24 行 `#overlay.overlay.hidden` 含 `#final-score`、`#final-high-score`、`#restart-btn`；第 27 行 `#hint`；第 30 行加载 `src/game.js`。
  - `styles.css`：`#game-canvas { width: 400px; height: 400px; }`、`.stage { width: 400px; height: 400px; }`、`.overlay { position: absolute; inset: 0; }`、`.hidden { display: none !important; }`。
  - `src/game.js` 第 20–23 行 `GRID=20`、`CELL=20`、`TICK_MS=130`；第 102–120 行初始蛇长 3、起于 `(10,10)` 头、朝右、`score=0`、`status='running'`；第 114 行初始食物经已修复的 `spawnFood`（第 88–100 行，内部非蛇身格）生成；`init()`（第 441–466 行）在 DOM 就绪后自动调用并 `startLoop()`（第 310–314 行 `setInterval(tick, TICK_MS)`）。
- 观察/核对方法：需在桌面 Chrome/Edge 以 `file://` 打开 `index.html`，观察首屏元素与 3–5 秒自动前进。
- 未执行说明：首屏渲染、自动前进节奏、布局可见性均未在真实浏览器观察；静态只能证明结构、样式与初始状态逻辑存在。
- 结论：未执行/证据不足（不再因食物边界问题判不通过；但仍需真实浏览器复验）。

### AC-2 A2 键盘控制（P0）—— 结论：未执行/证据不足（静态机制齐全）

- 判定依据（静态）：`src/game.js` 第 337–346 行 `KEY_DIRECTIONS` 映射 `arrowup/arrowdown/arrowleft/arrowright` 与 `w/s/a/d` 共八键；`onKeyDown`（第 357–394 行）对方向键 `event.preventDefault()`（第 364–365 行），写入 `pendingDirection`（第 384–393 行）；每 tick 由 `computeStep` 的 `resolveDirection(state.direction, state.pendingDirection)`（第 130 行）采用，实现「下一移动步生效、最后一个合法方向生效」。
- 观察/核对方法：需真实按键逐方向观察方向键四向、WASD 四向、连续两键与页面不滚动。
- 未执行说明：实际按键响应、生效时机、页面滚动与否无法在无浏览器环境确认；静态机制不据此记通过。
- 结论：未执行/证据不足。

### AC-3 A3 反向保护（P1）—— 结论：未执行/证据不足（静态机制齐全）

- 判定依据（静态）：第 50–57 行 `isReversal` 按方向向量和为 0 判定 180 度反向；第 59–64 行 `resolveDirection` 对反向输入保留当前方向；输入层第 381–383 行对 `isReversal(state.direction, candidate)` 直接 `return`，不写 `pendingDirection`、不改变方向、不触发死亡。
- 观察/核对方法：需真实试玩朝右按左、朝下按上、朝左按右及 WASD 同理，观察至少 3 个 tick 轨迹与 `status` 保持 `running`。
- 未执行说明：实际视觉轨迹与状态无法在无浏览器环境确认。
- 结论：未执行/证据不足。

### AC-4 A4 吃食物计分（P0）—— 结论：未执行/证据不足（静态食物边界缺陷已修复，计分/增长逻辑齐全）

- 判定依据（静态）：
  - 计分与增长：`computeStep`（第 127–185 行）在 `nextHead` 与 `food` 同格时 `ate=true`（第 147 行），新蛇为 `[nextHead].concat(state.snake)` 不删尾（第 148–150 行，长度 +1），返回 `score: state.score + 1`（第 181 行）；`tick` 第 328 行调用 `syncHud()` 同一步刷新 HUD（`syncHud` 第 285–298 行写入 `#score`、`#high-score` 等）。
  - 食物重生：第 175 行调用 `spawnFood`（第 88–100 行），枚举 x、y ∈ [1,18] 且非蛇身（第 93–95 行），**已排除最外圈**。
  - 棋盘填满/无合法内部空位：第 183 行 `status: food === null ? STATUS_OVER : STATUS_RUNNING`，按当前得分结束（默认边界处理）。
- 观察/核对方法：需真实试玩吃 2–3 个食物，逐次核对「分数 +1、显示同步、蛇身 +1、食物在内部非蛇身空格重生」。
- 未执行说明：实际吃食物过程、HUD 同步与食物位置画面均未真实运行；静态已确认首轮缺陷修复，但不能替代实测。
- 结论：未执行/证据不足（不再判静态不满足）。

### AC-5 A5 撞墙结束（P0）—— 结论：未执行/证据不足（静态判定齐全）

- 判定依据（静态）：第 66–68 行 `inBounds`（`0<=x<20 && 0<=y<20`）；第 135–145 行在移动前检查 `nextHead`，越界即返回 `status: over` 并保留 `score`；`tick` 第 331 行在 `over` 后 `stopLoop()`；`syncHud`（第 285–298 行）在 `over` 时展示结束层并写入 `#final-score`/`#final-high-score`。
- 观察/核对方法：需真实试玩从上、下、左、右四个方向撞墙，核对立即结束、不穿墙、结束层与本局得分。
- 未执行说明：撞墙瞬间表现与结束层可见性无法在无浏览器环境确认。
- 结论：未执行/证据不足。

### AC-6 A6 撞自身结束（P0）—— 结论：未执行/证据不足（静态判定齐全）

- 判定依据（静态）：第 152–162 行在移动后调用 `hitsBody(snake.slice(1), nextHead)`（`hitsBody` 第 70–74 行按坐标比较），命中即返回 `status: over` 并保留 `score`；未进食时尾格先移出（第 148–150 行），符合契约 §5 顺序。
- 观察/核对方法：需先吃 ≥1 食物使蛇身 ≥4，再真实试玩绕圈自撞，核对立即结束、结束层与本局得分。
- 未执行说明：实际自撞轨迹与结束表现无法在无浏览器环境确认。
- 结论：未执行/证据不足。

### AC-7 A7 结束态冻结（P1）—— 结论：未执行/证据不足（静态机制齐全）

- 判定依据（静态）：`tick` 第 316–320 行在 `status !== running` 时 `stopLoop()` 并返回；`onKeyDown` 第 378–379 行在非运行态直接忽略方向输入；`render`（第 258–264 行）只读当前状态重绘，`drawOverLayer`（第 253–256 行）绘制结束遮罩；结束层由 `syncHud` 的 `showOverlay()`（第 272–276 行）保持可见。
- 观察/核对方法：需在结束态连续按方向键/WASD 3–5 秒，对比蛇、食物、分数、结束层是否变化。
- 未执行说明：实际冻结画面与按键无响应无法在无浏览器环境确认。
- 结论：未执行/证据不足。

### AC-8 A8 会话最高分（P1）—— 结论：未执行/证据不足（静态机制齐全）

- 判定依据（静态）：`highScore` 为模块内存变量（第 191 行 `let highScore = 0;`）；`init`（第 457–459 行）初始置 0，`reset`（第 482–494 行）不重置；`tick` 第 326–327 行 `if (state.score > highScore) highScore = state.score;` 立即更新；`syncHud`（第 285–298 行）写入 `#high-score`、`#final-score`、`#final-high-score`；全文通读未发现 `localStorage`/`sessionStorage`/`indexedDB`/`fetch`/`XMLHttpRequest`/`WebSocket` 或外部 URL 调用。
- 观察/核对方法：需真实试玩得分、结束、低分重开、刷新页面，核对最高分实时更新、结束页双数值与刷新重置。
- 未执行说明：实际数值变化与刷新后重置无法在无浏览器环境确认；静态无存储 API 只能支持、不能代替刷新实测。
- 结论：未执行/证据不足。

### AC-9 A9 重开（P0）—— 结论：未执行/证据不足（静态逻辑齐全）

- 判定依据（静态）：`onRestartClick`（第 396–398 行）经 `bindEvents`（第 410–420 行，第 416–417 行绑定 `#restart-btn` 的 `click`）调用 `reset()`；`onKeyDown` 第 369–373 行仅当 `state.status === 'over'` 时对 `r`/`R` 调用 `reset()`，运行中 `R` 直接返回、不重置（符合契约 §4.2）；`reset()`（第 482–494 行）重建初始局面（第 488 行 `createInitialState`，食物经修复后的 `spawnFood` 生成）、`hideOverlay()`（第 278–282 行）、`syncHud()`、`render()`、`startLoop()`，且不修改 `highScore`。
- 观察/核对方法：需真实试玩「按钮重开」与「R 重开」两条路径，并核对运行中按 R 不重置、结束层隐藏、无残留。
- 未执行说明：按钮点击与按键的实际响应、新局画面无法在无浏览器环境确认。
- 结论：未执行/证据不足。

### AC-10 A10 运行质量（P0）—— 结论：未执行/证据不足（静态支持，控制台未实测）

- 判定依据（静态）：`index.html` 第 30 行为传统 `<script src="src/game.js"></script>`，无 `type="module"`；第 7 行仅引用本地 `styles.css`，页面无 CDN/第三方资源；`src/game.js` 以 IIFE 挂载 `window.SnakeGame`（第 507 行），未使用 ES module 语法；全文通读未发现网络或存储 API 调用。
- 观察/核对方法：需在桌面 Chrome/Edge 最新版以 `file://` 打开，完成完整流程并检查 Console（页面自身 error、资源 404、未捕获异常）与 Network（无外部请求）。
- 未执行说明：本环境无浏览器与开发者工具，**控制台无报错与运行表现为必须实测项，未实测**；静态无网络/存储调用只是支持性证据。
- 结论：未执行/证据不足。

## 3. 静态核对清单

| 核对项 | 代码位置 | 核对结果 |
| --- | --- | --- |
| DOM id 契约 | `index.html` 第 12–27 行：`#score`、`#high-score`、`#game-canvas`（400×400）、`#overlay`（默认 hidden）、`#final-score`、`#final-high-score`、`#restart-btn`、`#hint` | 齐全，与契约 §4.1 一致 |
| 食物合法空位（本轮重点） | `src/game.js` 第 88–100 行 `spawnFood`，第 93–94 行 `x、y ∈ [1, GRID-2]`，第 95 行排除蛇身；初始第 114 行、重生第 175 行同源 | **已修复**：仅内部非蛇身格，不再包含最外圈 |
| 键位映射与反向忽略 | 第 337–346 行 `KEY_DIRECTIONS`；第 357–394 行 `onKeyDown`；第 50–64 行 `isReversal`/`resolveDirection` | 方向键+WASD 齐全；反向输入忽略且不改状态 |
| 越界判定 | 第 66–68 行 `inBounds`、第 135–145 行 | 越界即 `over`，不穿墙 |
| 自撞判定 | 第 70–74 行 `hitsBody`、第 152–162 行 | 新蛇头与身体段重合即 `over` |
| 计分与蛇身增长 | 第 147–150 行、第 175–184 行 | 吃食物不删尾（+1 长度）、`score+1`、同 tick 同步 HUD |
| highScore 内存变量、无存储 API | 第 191 行 `let highScore = 0;`；全文通读 | 内存变量；无 Web Storage/网络 API |
| 重开按钮与 R 仅结束态 | 第 396–398 行、第 410–420 行、第 369–373 行、第 482–494 行 | 按钮与 R 均可重开；R 仅 `over` 态；`reset` 保留 `highScore` |
| 普通 script 无 module/CDN | `index.html` 第 7 行、第 30 行 | 传统 script，仅本地 css/js，无 module、无 CDN |
| 无网络/存储调用 | `src/game.js` 全文通读 | 未发现网络/存储 API 调用 |

## 4. 残余观察（非 AC-1～AC-10 判定项，不影响本轮结论）

- 因食物限定在内部 18×18 格，极端情形下若内部格被蛇身占满而最外圈仍有空格，`spawnFood` 会返回 `null` 并按当前得分结束（第 98 行、第 183 行）。该行为属标准与契约未明确的默认边界处理，正常试玩几乎不可达；记录为观察项，不作为本轮任一 AC 的失败依据。

## 5. 结论与建议

- **整体结论：未执行/证据不足，不得判为通过。** 首轮 `src/game.js` 的 `spawnFood` 边界缺陷已在静态层确认修复（第 88–100 行），静态核对未发现 AC-1～AC-10 的新静态不满足项；但 AC-1～AC-10 的通过标准均要求真实浏览器人工试玩（画面渲染、按键反应、结束层、Console/Network），本环境无法执行，故全部条目只能记「未执行/证据不足」，按冻结标准 §11 不得整体判通过。
- 建议：
  1. 由幕僚安排具备桌面 Chrome/Edge 的环境，按 `docs/quality/snake-game-criteria-v1.md` §0.1 的 `file://` 方式完成 AC-1～AC-10 逐条人工试玩，保留 Console/Network 与关键画面证据（附件放 `docs/verification/`）；
  2. 真实试玩通过后，再以应用绑定的最终完整 OID 出本轮或后续 A12b 结论；本报告不把静态核对等同于实测通过；
  3. 若后续实现再有变更，应提交新最终 OID 并按同一冻结标准重新核对；本报告结论不对变更后的版本自动生效。
- 本报告不修改实现、不改判标准、不修改 v1 报告、不代表客户验收或批准。

---

- 报告路径：`docs/quality/snake-game-report-v2.md`
- 判定标准路径：`docs/quality/snake-game-criteria-v1.md`（v1，final）
- 首轮报告：`docs/quality/snake-game-report-v1.md`（保持原样，不修改）
- 证据附件：无（未产生真实浏览器截图/运行记录，未伪造）
