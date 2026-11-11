taskId: t-mwbvcaxx-293ba5dc | flowId: snake-game | stage: A12b | criteria: docs/quality/snake-game-criteria-v1.md (v1, final) | result: 不通过（AC-1/AC-4 静态不满足；AC-2/3/5/6/7/8/9/10 未执行-证据不足）

# snake-game 独立验收报告 v1（A12b）

- flowId：`snake-game`
- 阶段：A12b（实施后独立验收）
- 版本：v1（文件名 `-v1`）
- 判定标准：`docs/quality/snake-game-criteria-v1.md`（v1，final，AC-1～AC-10）
- 依据：产品意图 `docs/product/snake-game-intent-v1.md`（A1–A10）、架构契约 `docs/contracts/snake-game-architecture-v1.md`（§4 公开契约）、团队计划 `docs/scheduling/snake-game-team-v1.md`
- 交付物（本轮读取的工作区文件）：`index.html`（32 行）、`styles.css`、`src/game.js`
- 任务说明中的来源：任务分支 `ans/task/wf-afe8ddbeba445bed145ccd1c`
- 性质：本报告只给出独立质检结论与证据，不代替客户验收、不代表客户批准；是否验收由幕僚按流程收口。

## 0. 执行条件与限制（先声明，避免把静态推断冒充实测）

1. 本会话**未注入浏览器自动化/截图/录屏能力**，且任务边界明确禁止运行任何 shell 命令（含浏览器启动、node、测试脚本），因此**无法在本环境执行真实浏览器试玩**。
2. 本报告只做了两件事：
   - **静态核对**：逐行阅读 `index.html`、`styles.css`、`src/game.js`，核对可静态判定的行为（DOM id、键位映射、反向忽略、越界/自撞判定、计分与蛇身增长、食物生成范围、内存最高分、重开逻辑、脚本加载方式、网络/存储调用），并引用具体代码位置；
   - **如实记录未执行项**：凡必须真实浏览器才能确认的（画面渲染、实际按键反应、结束层实际展示、控制台/Network 面板），一律记为「未执行/证据不足」，**未凭静态推断记为通过，也未伪造截图或运行结果**。
3. 本会话未注入结构化 Git/trunk 工具且禁止 shell，因此**未能独立核验提交 OID 与分支指针**；本报告判定的是本轮从工作区读取到的文件字节。若应用绑定的最终完整 OID 与这些字节不一致，以应用绑定为准并需重新核验。
4. `docs/verification/` 未生成任何附件（无真实浏览器截图可附）；本报告不把代码阅读笔记伪装成运行证据。
5. 结论口径按冻结标准 §0.3：单条内任一通过标准不成立即「不通过」；必须实测而未实测记「未执行/证据不足」；任一条不通过或未执行，整体不得判通过。

## 1. 逐条判定

### AC-1 A1 启动可见（P0）—— 结论：不通过（静态不满足 + 真实浏览器未执行）

- 判定依据（静态）：
  - `index.html` 第 12–13 行提供 `#score`、`#high-score`，初始文本均为 `0`；第 17 行 `<canvas id="game-canvas" width="400" height="400">`；第 19–24 行 `#overlay.overlay.hidden` 内含 `#final-score`、`#final-high-score`、`#restart-btn`；第 27 行 `#hint` 提供操作提示；第 30 行加载 `src/game.js`。
  - `styles.css` 中 `#game-canvas { width: 400px; height: 400px; }`、`.stage { width: 400px; height: 400px; }`、`.overlay { position: absolute; inset: 0; }`、`.hidden { display: none !important; }`，DOM 具备可见性样式基础。
  - `src/game.js`：常量 `GRID=20`、`CELL=20`、`TICK_MS=130`（第 20–23 行）；`createInitialState`（第 98–116 行）生成蛇长 3、位于 `(10,10)` 起头朝右、`score=0`、`status='running'`；`init()` 在 DOM 就绪后自动调用并 `startLoop()`，`setInterval(tick, TICK_MS)`（应用层主循环区）提供固定步长自动前进。
- 观察/核对方法：按标准需在桌面 Chrome/Edge 以 `file://` 打开 `index.html`，观察首屏元素与 3–5 秒自动前进；本环境未执行。
- **静态不满足项（导致本条不通过）**：标准要求初始食物「位于非蛇身且非棋盘最外圈的空格」，但 `spawnFood`（`src/game.js` 第 83–96 行）在 `for (y=0; y<GRID; y++)` / `for (x=0; x<GRID; x++)` 中只排除蛇身格，**没有排除最外圈（x/y 为 0 或 19 的 76 个格子）**，初始食物存在落在棋盘最外圈的可能，无法保证满足通过标准。
- 未执行说明：首屏实际渲染、自动前进节奏与布局无错位均未在真实浏览器观察，属未证实。
- 结论：即使修复食物边界问题，本条仍需真实浏览器复验；当前静态证据已显示一项通过标准不满足，故记「不通过」。

### AC-2 A2 键盘控制（P0）—— 结论：未执行/证据不足（静态机制齐全）

- 判定依据（静态）：`src/game.js` 的 `KEY_DIRECTIONS`（第 333–342 行）映射 `arrowup/arrowdown/arrowleft/arrowright` 与 `w/s/a/d` 共八键；`onKeyDown`（第 353–390 行）对方向键调用 `event.preventDefault()`（第 360–361 行），将输入写入 `pendingDirection`，且每次 tick 由 `computeStep` 的 `resolveDirection(state.direction, state.pendingDirection)`（第 126 行）采用，实现「输入在下一移动步生效」；同一 tick 内后按的合法方向覆盖先前值（`state = {... pendingDirection: candidate ...}`，第 380–389 行），符合「最后一个合法方向生效」。
- 观察/核对方法：需真实按键逐方向观察（方向键四向、WASD 四向、连续两键、页面不滚动）。
- 未执行说明：实际按键响应、生效时机、页面滚动与否无法在无浏览器环境确认；静态代码只能证明机制存在，**不据此记通过**。
- 结论：未执行/证据不足。

### AC-3 A3 反向保护（P1）—— 结论：未执行/证据不足（静态机制齐全）

- 判定依据（静态）：规则层 `isReversal`（第 50–57 行）按方向向量和为 0 判定 180 度反向；`resolveDirection`（第 59–64 行）对反向输入保留当前方向；输入层 `onKeyDown` 第 377–379 行对 `isReversal(state.direction, candidate)` 直接 `return`，不写 `pendingDirection`、不改变方向、不触发死亡；双重校验避免延迟生效。
- 观察/核对方法：需真实试玩朝右按左、朝下按上、朝左按右，以及 WASD 同理，观察至少 3 个 tick 的轨迹与 `status` 是否保持 `running`。
- 未执行说明：实际视觉轨迹与状态无法在无浏览器环境确认。
- 结论：未执行/证据不足。

### AC-4 A4 吃食物计分（P0）—— 结论：不通过（静态不满足：新食物未排除最外圈；实际试玩未执行）

- 判定依据（静态）：
  - 计分与增长：`computeStep`（第 123–181 行）在 `nextHead` 与 `food` 同格时 `ate=true`，新蛇为 `[nextHead].concat(state.snake)`（不删尾，长度 +1，第 143–146 行），返回 `score: state.score + 1`（第 177 行）；`tick` 内调用 `syncHud()`（第 324 行）在同一步刷新 `#score`、`#high-score` 等文本（`syncHud` 第 281–294 行）。
  - 食物生成：`spawnFood`（第 83–96 行）枚举所有非蛇身格并随机取一格；棋盘填满时返回 `null` 并按当前得分结束（第 171–180 行）。
- 观察/核对方法：需真实试玩吃 2–3 个食物，逐次核对「分数 +1、蛇身 +1、食物消失并在非蛇身非边界空格重生」。
- **静态不满足项（导致本条不通过）**：`spawnFood` 的候选集合包含棋盘最外圈全部空格（仅排除蛇身，未排除 `x==0 || x==19 || y==0 || y==19`），与 AC-4 通过标准「每次新食物均在非蛇身、非边界的随机空格生成」不符；该缺陷同时影响初始食物（见 AC-1）。计分与增长静态实现正确，但不能抵消食物位置标准的不满足。
- 未执行说明：实际吃食物过程与 HUD 同步未真实运行。
- 结论：不通过（需实现方修复 `spawnFood` 的食物边界约束后，以新指定 OID 重新核验，并补真实试玩）。

### AC-5 A5 撞墙结束（P0）—— 结论：未执行/证据不足（静态判定齐全）

- 判定依据（静态）：`computeStep` 第 131–141 行在移动前用 `inBounds(nextHead)`（第 66–68 行，条件 `0<=x<20 && 0<=y<20`）检查新蛇头，越界即返回 `status: over` 且保留 `score`；`tick` 检测到 `over` 后 `stopLoop()`（第 327 行）；`syncHud` 在 `over` 时展示结束层并写入 `#final-score`/`#final-high-score`。
- 观察/核对方法：需真实试玩从上、下、左、右四个方向撞墙，核对立即结束、不穿墙、结束层与本局得分。
- 未执行说明：撞墙瞬间的实际表现与结束层可见性无法在无浏览器环境确认。
- 结论：未执行/证据不足。

### AC-6 A6 撞自身结束（P0）—— 结论：未执行/证据不足（静态判定齐全）

- 判定依据（静态）：`computeStep` 第 148–158 行在移动后调用 `hitsBody(snake.slice(1), nextHead)`（`hitsBody` 第 70–74 行按坐标比较），命中即返回 `status: over` 并保留 `score`；未进食时尾格先移出（第 144–146 行），只与移动后的身体段比较，符合契约 §5 顺序。
- 观察/核对方法：需先吃 ≥1 食物使蛇身 ≥4，再真实试玩绕圈自撞，核对立即结束、结束层与本局得分。
- 未执行说明：实际自撞轨迹与结束表现无法在无浏览器环境确认。
- 结论：未执行/证据不足。

### AC-7 A7 结束态冻结（P1）—— 结论：未执行/证据不足（静态机制齐全）

- 判定依据（静态）：`tick` 第 312–317 行在 `status !== running` 时 `stopLoop()` 并返回，不再推进；`onKeyDown` 第 374–375 行在非运行态直接忽略方向输入；`render` 只读当前状态重绘（第 254–260 行），`drawOverLayer` 绘制结束遮罩；结束层由 `syncHud` 的 `showOverlay()` 保持可见。
- 观察/核对方法：需在结束态连续按方向键/WASD 3–5 秒，对比蛇、食物、分数、结束层是否变化。
- 未执行说明：实际冻结画面与按键无响应无法在无浏览器环境确认。
- 结论：未执行/证据不足。

### AC-8 A8 会话最高分（P1）—— 结论：未执行/证据不足（静态机制齐全）

- 判定依据（静态）：`highScore` 为模块内存变量（`src/game.js` 第 187 行 `let highScore = 0;`），`init`/`reset` 均不重置它（仅 `init` 首次置 0）；`tick` 第 322–323 行 `if (state.score > highScore) highScore = state.score;` 立即更新；`syncHud` 将其写入 `#high-score`、`#final-score` 与 `#final-high-score`；通读全文未发现 `localStorage`/`sessionStorage`/`indexedDB`/`fetch`/`XMLHttpRequest`/`WebSocket`/外部 URL 调用，符合「仅会话内、刷新重置」。
- 观察/核对方法：需真实试玩得分、结束、低分重开、刷新页面，核对最高分实时更新、结束页双数值与刷新重置。
- 未执行说明：实际数值变化与刷新后重置无法在无浏览器环境确认（静态无存储 API 只能支持、不能代替刷新实测）。
- 结论：未执行/证据不足。

### AC-9 A9 重开（P0）—— 结论：未执行/证据不足（静态逻辑齐全）

- 判定依据（静态）：`onRestartClick`（`src/game.js` 输入/重开区）绑定到 `#restart-btn` 的 `click`（`bindEvents`）；`onKeyDown` 第 365–369 行仅当 `state.status === 'over'` 时对 `r`/`R` 调用 `reset()`，运行中 `R` 直接返回、不重置（符合契约 §4.2）；`reset()` 重建初始局面（蛇长 3、居中、朝右、分数 0、食物重生成）、调用 `hideOverlay()`、`syncHud()`、`render()`、`startLoop()`，且**不修改** `highScore`，实现「分数清零、棋盘复位、最高分保留」。
- 观察/核对方法：需真实试玩「按钮重开」与「R 重开」两条路径，并核对运行中按 R 不重置、结束层隐藏、无残留。
- 未执行说明：按钮点击与按键的实际响应、新局画面无法在无浏览器环境确认。
- 结论：未执行/证据不足。

### AC-10 A10 运行质量（P0）—— 结论：未执行/证据不足（静态支持，控制台未实测）

- 判定依据（静态）：
  - `index.html` 第 30 行为传统 `<script src="src/game.js"></script>`，无 `type="module"`；页面只引用同目录 `styles.css` 与 `src/game.js`，无 CDN、无第三方资源；`src/game.js` 以 IIFE 挂载 `window.SnakeGame`，未使用 ES module 语法。
  - 通读 `src/game.js` 全文，未发现 `fetch`/`XMLHttpRequest`/`WebSocket`/`localStorage`/`sessionStorage`/`indexedDB` 等网络或存储调用。
- 观察/核对方法：需在桌面 Chrome/Edge 最新版以 `file://` 打开，完成完整流程并检查 Console（页面自身 error、资源 404、未捕获异常）与 Network（无外部请求）。
- 未执行说明：本环境无浏览器与开发者工具，**控制台无报错与运行表现为必须实测项，未实测**；静态无网络/存储调用只是支持性证据，不据此记通过。
- 结论：未执行/证据不足。

## 2. 静态核对清单（对应任务要求的可静态核查项）

| 核对项 | 代码位置 | 核对结果 |
| --- | --- | --- |
| DOM id 契约 | `index.html` 第 12–27 行：`#score`、`#high-score`、`#game-canvas`（400×400）、`#overlay`（默认 hidden）、`#final-score`、`#final-high-score`、`#restart-btn`、`#hint` | 齐全，与契约 §4.1 一致 |
| 键位映射与反向忽略 | `src/game.js` 第 333–342 行 `KEY_DIRECTIONS`；第 353–390 行 `onKeyDown`；第 50–64 行 `isReversal`/`resolveDirection` | 方向键+WASD 映射齐全；反向输入忽略且不影响状态 |
| 越界判定 | `src/game.js` 第 66–68 行 `inBounds`、第 131–141 行 | 越界即 `over`，不穿墙 |
| 自撞判定 | `src/game.js` 第 70–74 行 `hitsBody`、第 148–158 行 | 新蛇头与身体段重合即 `over` |
| 计分与蛇身增长 | `src/game.js` 第 143–146 行、第 171–180 行 | 吃食物不删尾（+1 长度）、`score+1`、同 tick 同步 HUD |
| 食物合法空位 | `src/game.js` 第 83–96 行 `spawnFood` | **不满足**：仅排除蛇身，未排除最外圈边界格 |
| highScore 内存变量、无存储 API | `src/game.js` 第 187 行 `let highScore = 0;`；全文通读 | 内存变量、无任何 Web Storage/网络 API |
| 重开按钮与 R 仅结束态 | `src/game.js` `onRestartClick`/`bindEvents`、第 365–369 行、`reset()` | 按钮始终可重开；`R` 仅 `over` 态响应；`reset` 保留 `highScore` |
| 普通 script 无 module/CDN | `index.html` 第 7 行、第 30 行 | 传统 script，仅本地 css/js，无 module、无 CDN |
| 无网络/存储调用 | `src/game.js` 全文通读 | 未发现网络/存储 API 调用 |

## 3. 缺陷与风险汇总

1. **P0 缺陷（静态确定）**：`src/game.js` 第 83–96 行 `spawnFood` 未排除棋盘最外圈，食物可能生成在边界格，违反契约 §5 与意图 A4「食物在非蛇身、非边界的随机空格生成」，直接影响 AC-4 与 AC-1 的食物位置标准。需实现方（game-owner）修复后按新指定 OID 重新验收；本报告不代改实现。
2. **未执行风险**：AC-2/3/5/6/7/8/9/10 的关键通过标准均依赖真实浏览器试玩；本环境无法执行，静态代码只能证明机制存在，不能替代实测，故整体不得判通过。
3. **证据缺口**：无浏览器截图/Console/Network 证据；`docs/verification/` 无附件。缺口如实记录，不伪造。
4. **OID 绑定限制**：本会话无结构化 Git 工具且禁止 shell，未能独立核验任务分支提交 OID；判定基于本轮工作区文件字节，最终以应用绑定的完整 OID 为准。

## 4. 结论与建议

- **整体结论：不通过（不得验收通过）**。依据冻结标准 §11 汇总口径：AC-1、AC-4 存在静态不满足项，AC-2、AC-3、AC-5、AC-6、AC-7、AC-8、AC-9、AC-10 未执行/证据不足；任一条不通过或证据不足均不得整体判通过。
- 回退与复验建议：
  1. 由原属主 `game-owner` 修复 `spawnFood`，使食物候选仅包含非蛇身且非最外圈的空格（初始食物同源修复），不改动本报告与冻结标准；
  2. 修复后提交新的最终完整 OID，并在桌面 Chrome/Edge 以 `file://` 完成 AC-1～AC-10 真实人工试玩，保留 Console/Network 与关键画面证据（附件放 `docs/verification/`）；
  3. 由幕僚派发新 A12b 核验，按新 OID 与本报告同一冻结标准重新逐条判定；本报告结论不对修复后的版本自动生效。
- 本报告不修改实现、不改判标准、不代表客户验收或批准。

---

- 报告路径：`docs/quality/snake-game-report-v1.md`
- 判定标准路径：`docs/quality/snake-game-criteria-v1.md`（v1，final）
- 证据附件：无（未产生真实浏览器截图/运行记录，未伪造）

## 5. 本轮复验记录（同一任务重派）

- 本轮为任务 `#t-mwbvcaxx-293ba5dc`（A12b）的重派复核：重新读取 `index.html`、`styles.css`、`src/game.js` 与冻结标准 `docs/quality/snake-game-criteria-v1.md`。
- 核对结果：`src/game.js` 第 83–96 行 `spawnFood` 仍未排除棋盘最外圈（候选循环 `y=0..19` / `x=0..19` 仅排除蛇身格），AC-1/AC-4 的静态不满足项依旧存在；`index.html` 的 DOM id 契约、`styles.css` 的可见性样式、`src/game.js` 的其余核对点与本报告所列位置一致；冻结标准仍为 v1、status=final。
- 结论不因重派改变：整体仍为「不通过（不得验收通过）」；本环境仍无真实浏览器试玩能力，相关条目仍记「未执行/证据不足」，未伪造成交。
- 若实现方已另行修复并提交新的最终完整 OID，应以新 OID 与本轮重读字节重新核对；本报告结论不对修复后的版本自动生效。
