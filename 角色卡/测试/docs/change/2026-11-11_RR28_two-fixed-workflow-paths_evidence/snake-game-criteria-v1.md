# snake-game 验收标准（v1）

- flowId：`snake-game`
- 阶段：A12a（实施前定稿，先于实现冻结）
- 版本：v1（status=final）
- 依据：
  - 产品意图 `docs/product/snake-game-intent-v1.md`（v1，5 条验收）
  - 架构契约 `docs/contracts/snake-game-architecture-v1.md`（v1）
  - 派发任务 `#t-mwc0teq3-b05035aa`（A12a 验收标准，含 AC1–AC6 最低覆盖要求）
- 被验对象（实现后）：项目根 `index.html`、`src/game.js`、`src/styles.css`（模块归属与路径见架构契约 §1/§9）
- 本文件仅定义标准与判定方法，不含实现结论；A12b 在实现完成后按冻结的本标准与任务指定最终完整 OID 执行真实核对。

## 1. 本阶段验收强度

**完整核对（full）**：A12b 必须对下方全部冻结 criteria（AC-1…AC-9）逐条给出真实核对结果与证据，不得抽样放行。

- 核对手段：**静态代码核对**（逐文件读取 `index.html`、`src/game.js`、`src/styles.css`，核对契约语义）+ **运行核验**（`file://` 直接打开 `index.html`，按步骤复现并截图）。
- 运行证据附件写入 `docs/verification/`（如 `docs/verification/snake-game-A12b-AC4-boundary.png`），每份 P0 证据附 `<artifact>.meta.json` sidecar（`evidence-meta/v1`），其 bytes/lines/sha256 必须与实际文件一致，`acIds` 覆盖对应 AC。
- 不要求录屏；缺录屏不判失败。截图须关闭 DEBUG/调试浮层，记录 sha256/候选/命令于 A12b 报告正文（本文件不转抄 hash）。
- 每条 AC 判定为「通过 / 不通过 / 证据不足（insufficient evidence）」三态之一；缺证据写 insufficient evidence，不得以推断代替实测。任一 P0 不通过或证据不足 ⇒ 整体不通过。

## 2. AC 编号与意图/任务映射

| 本文件 AC | 意图 v1 验收 | 任务最低覆盖 | 内容 |
| --- | --- | --- | --- |
| AC-1 | 1 键盘控制 | AC1 | 键盘控制与持续步进 |
| AC-2 | 2 计分 | AC2 | 计分与分数显示 |
| AC-3 | 3 重开 | AC3 | 结束后重开与状态复位 |
| AC-4 | 4 边界碰撞（含自碰撞） | AC4 | 边界/自碰撞判负，不穿墙不环绕 |
| AC-5 | 5 基本可运行性 | AC5 | `file://` 打开可开始游玩、无启动崩溃 |
| AC-6 | 约束/架构 §2 §9 | AC6 | DOM 挂载点与加载顺序契约（game-entry/v1） |
| AC-7 | 约束/架构 §1 §9 | AC6 | 无外部依赖/无网络请求/经典 script 非 ES module（game-core/v1） |
| AC-8 | 架构 §5 | —（P1） | 食物生成合法性与棋盘占满处理 |
| AC-9 | 架构 §3 §4 §7 | —（P1） | 状态机、步进与定时器语义 |

## 3. 逐条判定标准与证据要求

### AC-1 键盘控制与持续步进（P0）

- **判定方法**：静态核对 `src/game.js` 的 `keydown` 监听与方向映射；运行核验依次按 `ArrowUp/ArrowDown/ArrowLeft/ArrowRight` 与 `W/A/S/D`，观察蛇头方向改变且无输入时仍按固定步长（约 120ms/步，常量可不同但必须是固定间隔）持续前进；在向右移动时按左键做反向测试。
- **通过条件**：方向键与 WASD（大小写不敏感）均可改变方向；蛇持续移动；反向（dx+ndx==0 且 dy+ndy==0）输入被忽略、不发生 180° 自撞或立即反向；`requestAnimationFrame` 只用于渲染、不驱动逻辑步进。
- **证据要求**：代码片段核对记录（键位映射、反向过滤、固定步长定时器）+ 运行截图与复现步骤（覆盖一次方向改变、一次反向被忽略、无输入时持续移动）。

### AC-2 计分与分数显示（P0）

- **判定方法**：静态核对吃到食物分支使分数 +1 并即时更新 `#score` 文本；运行核验初始 `#score` 显示 `0`，操控吃到至少一个食物后分数变为 `1`。
- **通过条件**：每次进食恰 +1（不重复加分）；`#score` 初值 `0`，进食后即时（同 tick 或下一渲染帧内）可见更新；蛇身相应增长。
- **证据要求**：代码核对记录 + 进食前（分数 0）与进食后（分数 ≥1）运行截图及步骤。

### AC-3 游戏结束后的重开与状态复位（P0）

- **判定方法**：静态核对 `Game.restart()` 的原子复位顺序与旧定时器清除；运行核验先制造一局 gameover（撞边界），分别用 `#restart` 按钮与 `Space`/`Enter` 重开。
- **通过条件**：重开后：蛇身复位为初始 3 格（中部、向右）、`direction/nextDirection=right`、分数归 `0` 且 `#score` 刷新、食物重新在合法空格生成、输入缓冲清空、`#overlay` 隐藏、`#status` 更新、进入可继续游玩的新一局；旧定时器先清除再启动，连续多次重开不出现双定时器加速。
- **证据要求**：重开前后对比运行截图（分数/遮罩/蛇身状态）+ 代码核对记录；多次快速重开后步速不变的观察步骤与结论。

### AC-4 边界碰撞与自碰撞判负（P0）

- **判定方法**：静态核对边界条件 `x<0 || x>=COLS || y<0 || y>=ROWS`（COLS=ROWS=20）与自碰撞判定（排除本步将移走的尾格）；运行核验分别复现 (a) 蛇头向边界持续移动直至越界、(b) 构造自碰撞（蛇身足够长后转向自身）。
- **通过条件**：越界的那一步立即 `endGame()`，停止步进，显示 `#overlay` 与最终分数，更新 `#status`；蛇头不发生穿墙、不取模、不环绕（不出现从对侧重新进入）；自碰撞命中即判负；判定顺序为先边界后自碰撞、失败步不位移渲染。
- **证据要求**：两次失败的运行截图（边界、自碰撞各一，含最终分数与状态文本）+ 代码核对记录（边界表达式、自碰撞含尾格排除逻辑）。

### AC-5 基本可运行性与启动稳定性（P0）

- **判定方法**：不启动服务器，直接以 `file://` 双击/打开项目根 `index.html`；观察首屏与 `#status`，按键盘开始游玩一局。
- **通过条件**：页面正常加载、`#game/#score/#overlay/#restart/#status` 均存在且初始化完成，无启动即崩溃/白屏；可开始并游玩；浏览器控制台无未捕获异常（error 级）。
- **证据要求**：首屏运行截图（含状态文本与画布）+ 控制台无错误的截图/记录 + 复现步骤；记录实际打开方式（file:// 路径）与为何不需要服务器。

### AC-6 DOM 挂载点与加载顺序契约（P0）

- **判定方法**：静态核对 `index.html`：`#game` 为 `<canvas>` 且 400×400、`#score` 文本初值 `0`、`#status` 文本、`#overlay` 结束遮罩（含最终分数与「重新开始」按钮、非结束态隐藏）、`#restart` 为 `<button>` 且调用 `Game.restart()`；`src/styles.css` 位于 `<head>`，`src/game.js` 位于 `</body>` 前；`game.js` 在 `DOMContentLoaded` 后查询元素并初始化；运行核验 DOM 实际存在性。
- **通过条件**：上述 id、元素类型、初值与加载顺序全部符合架构契约 §2；缺失或改名即入口契约失效（不通过）。
- **证据要求**：`index.html` 对应片段代码核对记录 + 运行期元素/DOM 核对（开发者工具截图或等效静态记录），逐 id 列出存在性与类型。

### AC-7 无外部依赖、无网络请求、经典 script 非 ES module（P0）

- **判定方法**：静态检索 `index.html` 与 `src/*`：不得有外部 CDN/`http(s)://` 资源引用、`fetch`/`XMLHttpRequest`/`WebSocket`/动态 `import()`、`type="module"`、包管理/构建产物；运行期在开发者工具 Network 观察加载页与游玩期间无发起网络请求（仅本地 `file://` 文件）。
- **通过条件**：零外部依赖、零网络请求/持久化；脚本为经典 `<script src="src/game.js">`（无 `type="module"`）；`file://` 直接可运行。
- **证据要求**：检索命令/范围与命中结果记录（无命中的如实记录）+ Network 面板运行截图或等效证据。

### AC-8 食物生成合法性与棋盘占满处理（P1）

- **判定方法**：静态核对食物生成：在网格内空格枚举后随机取一并排除蛇身全部格子；初始化、每次进食、每次重开均重新生成；无空格时结束本局（按 `gameover` 处理）。运行期多次进食观察食物不落在蛇身/界外。
- **通过条件**：食物恒在 `0..19` 网格内且不与蛇身重合；进食/重开即时重新生成；棋盘占满不死循环、按结束处理。
- **证据要求**：代码核对记录 + 若干次进食/重开后的食物位置观察记录（P1 以静态核对为主，运行抽查即可）。

### AC-9 状态机、步进与定时器语义（P1）

- **判定方法**：静态核对状态枚举 `ready/running/gameover` 与迁移、`start()` 重复调用不叠加定时器、`gameover` 忽略方向/步进仅接受重开、`restart()` 幂等且先清旧定时器；运行核验连续重开与重复按键后的步速稳定性。
- **通过条件**：迁移与契约 §3/§4/§7 一致；不出现双定时器加速、`gameover` 后不继续步进、`restart()` 任意状态可安全复位。
- **证据要求**：代码核对记录 + 运行步骤（多次重开/重复方向输入后步速观察）与结论。

## 4. 冻结验收标准块

```ans-criteria
schema: ans-criteria/v1
flowId: snake-game
version: 1
status: final
criteria:
  - id: AC-1
    priority: P0
    title: 键盘控制：方向键/WASD 改变方向，蛇按固定步长持续移动，禁止 180 度反向
  - id: AC-2
    priority: P0
    title: 计分：吃到食物分数 +1，页面有可见当前分数且初值为 0
  - id: AC-3
    priority: P0
    title: 重开：游戏结束后可重开，分数、蛇身长度/位置、食物与遮罩状态正确复位且无双定时器
  - id: AC-4
    priority: P0
    title: 边界碰撞：蛇头越界立即判负并结束本局，不穿墙不环绕；撞到自身亦判负
  - id: AC-5
    priority: P0
    title: 基本可运行性：file:// 直接打开 index.html 可正常开始并游玩，无启动崩溃
  - id: AC-6
    priority: P0
    title: 契约一致性：DOM 挂载点 #game/#score/#overlay/#restart/#status 与加载顺序符合 game-entry/v1
  - id: AC-7
    priority: P0
    title: 契约一致性：无外部依赖、无网络请求、经典 script 非 ES module，符合 game-core/v1
  - id: AC-8
    priority: P1
    title: 食物生成合法：网格内空格随机、不与蛇身重合，进食/重开重新生成，占满时不死循环
  - id: AC-9
    priority: P1
    title: 状态机与定时器语义：ready→running→gameover 迁移、非法迁移拒绝、restart 幂等且先清旧定时器
```

## 5. 判定与后续

- A12b 逐条核对 AC-1…AC-9，报告写 `docs/quality/snake-game-report-v1.md`，证据附件写 `docs/verification/`；结论与指定最终完整 OID、冻结 criteria 一并回幕僚。
- 不通过按新 attempt 返回 A11 返工；证据不足如实写 insufficient evidence，不以推断或代造证据补足。
- 任何实现内容变更导致被验 OID 变化，须以新指定完整 OID 重新核验，本冻结标准不随实现漂移。
