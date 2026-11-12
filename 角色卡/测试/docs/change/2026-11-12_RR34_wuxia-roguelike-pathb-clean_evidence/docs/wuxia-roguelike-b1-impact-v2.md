# wuxia-roguelike B1 影响面报告 v2：运行期 TypeError（`input.wasPressed` 解引用后调用）

- flowId：`wuxia-roguelike`
- workflowId：`wf-08a64bc64db25ab9650a5372`（本阶段任务上下文）
- stage：B1（只读影响面分析与根因确认；**未改实现、未提交**）
- 路径：B（复用现有仓库、现有角色与模块属主；未重建团队计划/角色卡/基线）
- 幕僚任务：`#t-mwcbsu2q-32509e8e`（stage-request，read-only）
- 日期：2026-11-12
- 前版：`docs/scheduling/wuxia-roguelike-b1-impact-v1.md`（本轮**未直接采信**，结论为独立读码复核；一致处与差异见第七节）

## 一、客户现象

打开 `index.html`，点「踏入江湖」开始后立即崩溃，浏览器控制台每帧报：

```
Uncaught TypeError: Cannot read properties of undefined (reading 'pressed')
```

游戏完全无法进行：移动 / 自动攻击 / 波次 / 经验升级 / 拾取 / 死亡重开全部停滞。

## 二、根因（读码确认，精确到函数）

1. **抛错点**：`game/app/app.js` · `pollFrameInput()`
   ```js
   function pollFrameInput() {
     if (!engine || !engine.input || typeof engine.input.wasPressed !== 'function') { return; }
     var pressed = engine.input.wasPressed;          // ← 解引用方法，脱离宿主对象
     if (state === STATES.PLAYING || state === STATES.PAUSED) {
       if (pressed('escape') || pressed('p')) { togglePause(); }   // ← 普通函数调用
       return;
     }
     ...
     if (!ui && state === STATES.MENU && (pressed('enter') || pressed(' '))) { ... }
     ...
   }
   ```
   `pressed` 是 `engine.input.wasPressed` 的**裸函数引用**，随后以 `pressed('escape')` 形式调用，调用时没有接收者对象，`this` 丢失。

2. **方法实现依赖 `this`**：`game/engine/input.js` · `Input.prototype.wasPressed`
   ```js
   Input.prototype.wasPressed = function (name) {
     var n = normalizeName(name);
     if (n && this.pressed[n]) { return true; }   // ← this 为 undefined 时读取 'pressed' 抛错
     ...
   };
   ```
   `input.js` 为 `'use strict'` IIFE，普通函数调用时 `this` 为 `undefined`，因此 `this.pressed` 触发
   `TypeError: Cannot read properties of undefined (reading 'pressed')`；错误文案与客户现象逐字一致。

3. **每帧路径**：`frame()` 在排好下一帧后调用 `pollFrameInput()`，且不区分状态调用。异常抛出后本帧后续步骤
   （`stepWorld()`、`renderFrame()`、`updateUi()`、`engine.endFrame()`）全部跳过；但因 `requestAnimationFrame`
   已在函数开头重新排好，错误**每帧重复一次**。

4. **为何“点开始后”才崩**：`pollFrameInput()` 中 MENU 状态只在 `!ui` 时才调用 `pressed(...)`；
   本项目 `game/ui/ui.js` 正常加载（`index.html` 中 `ui.js` 先于 `app.js`），`ui` 非空，故菜单期不触发；
   一旦点击「踏入江湖」进入 `PLAYING`，`state === PLAYING` 分支必然调用 `pressed('escape')`，立即抛错。
   这与客户“点开始后立即崩溃”的时序完全吻合。

## 三、触发路径与每帧位置

```
index.html（入口脚本按序装配）
  └─ <script src="game/app/app.js"> → WX.App.start()
       └─ createApp() → startLoop() → requestAnimationFrame(frame)
            └─ frame(timestamp)                 // 每帧
                 1. rafId = requestAnimationFrame(frame)   // 先排下一帧
                 2. engine.camera.update(delta)
                 3. pollFrameInput()        // ← 在此抛 TypeError
                 4. （被跳过）固定步长 stepWorld / renderFrame / updateUi / engine.endFrame
```

- 异常点在第 3 步；第 4 步的移动/战斗/波次/经验/拾取/结算与渲染、UI 更新、`engine.endFrame()` 均不执行，
  但第 1 步已排好下一帧 ⇒ 错误逐帧重复。
- `engine.endFrame()` 内的 `input.endFrame()` 因此也不执行，`pressed`/`released` 边沿一直不清空；
  修复解引用后该清理会自然恢复（见 `game/engine/engine.js` · `endFrame()`：`input.endFrame(); renderer.endFrame();`，
  为正确的方法调用，`this` 不丢失）。
- UI 覆盖层由 DOM 事件驱动，开始按钮仍可点击；崩溃发生在 UI 快照刷新之前（`updateUi()` 被跳过），
  因此界面会停在旧状态、游戏画面不再更新——与客户“能点开始但游戏不动”一致（此为读码推断，未实机观察）。

## 四、受影响文件与调用点（逐条判定）

| 文件 | 位置 | 判定 |
| --- | --- | --- |
| `game/app/app.js` | `pollFrameInput()`：`var pressed = engine.input.wasPressed;` 及随后 `pressed('escape')` / `pressed('p')` / `pressed('enter')` / `pressed(' ')` / `pressed('r')` | **真实缺陷（根因，必改）** |
| `game/engine/input.js` | `Input.prototype.wasPressed`（读 `this.pressed`） | 实现正确；调用方问题，**不改** |
| `game/engine/engine.js` | `endFrame()`：`input.endFrame(); renderer.endFrame();` | 安全（方法调用，`this` 正确） |
| `game/app/app.js` | `setInputEnabled()`：`engine.input.setEnabled(enabled)` | 安全（方法调用） |
| `game/app/app.js` | `stepWorld()`：`player.update(step, engine.input)` | 安全（传对象；player 内为方法调用） |
| `game/app/app.js` | `buildContext()`：`on: bus.on, off: bus.off` | **不是缺陷**：`bus.on`/`bus.off` 是 `createBus()` 内部的闭包函数，不依赖 `this`，脱离对象调用仍正确（v1 记为“潜在同类风险”，本轮读码修正为安全；包一层仅为风格，非修复必需） |
| `game/app/bus.js` | `on` / `off` 闭包实现 | 安全（闭包引用 `handlers`，未使用 `this`） |
| `game/player/player.js` | `resolveMove()`：`raw = src.moveVector()` | 安全（对象方法调用，`this` 正确） |
| `game/combat/combat.js` | 全文不使用 `ctx.input` | 不受影响 |
| `game/enemies/enemies.js` | 全文不使用 `ctx.input` | 不受影响 |
| `game/progression/progression.js` | 全文不使用 `ctx.input` | 不受影响 |
| `game/items/arsenal.js` | 全文不使用 `ctx.input` | 不受影响 |
| `game/ui/ui.js` | 键盘仅用自身 `document` 的 `keydown`（升级面板 1/2/3、方向键、Enter），不读 `engine.input` | 不受影响 |

结论：崩溃源唯一，位于 `game/app/app.js` 的 `pollFrameInput()`；engine 原型方法、其它领域模块与 UI 均无需改动。

## 五、最小修复范围与责任属主

- **责任属主**：`loop-engine`（roster roleId），模块 `loop-app`（写区 `game/app/`）；根因文件 `game/app/app.js` 即其写区。
- **最小修复（仅 `game/app/app.js` · `pollFrameInput()`）**：保留对象、以方法形式调用，例如
  ```js
  function pollFrameInput() {
    if (!engine || !engine.input || typeof engine.input.wasPressed !== 'function') { return; }
    var input = engine.input;
    if (state === STATES.PLAYING || state === STATES.PAUSED) {
      if (input.wasPressed('escape') || input.wasPressed('p')) { togglePause(); }
      return;
    }
    ...
    if (!ui && state === STATES.MENU &&
        (input.wasPressed('enter') || input.wasPressed(' '))) { startGame(); return; }
    if (!hasResultUi && (state === STATES.GAME_OVER || state === STATES.VICTORY) &&
        (input.wasPressed('r') || input.wasPressed('enter'))) { restartRun(); }
  }
  ```
  或等价地保留局部包装：`var pressed = function (name) { return engine.input.wasPressed(name); };`。
- **不改**：`game/engine/input.js`（原型方法正确，改动会波及已验收的 engine-core 公共接口）、`game/ui/`、
  `game/player/` 等已验收模块；不新增事件、不改状态机/固定步长/事件契约/数值。
- `buildContext()` 的 `on/off` 包装为可选项（非缺陷，不作为验收条件）。

## 六、回归确认要点（修复后由 A12 独立验收执行，本报告不构成验收结论）

1. **控制台**：点「踏入江湖」开局后不再出现逐帧 `TypeError`；开局后画面与 HUD 正常刷新。
2. **移动**：WASD 与方向键；对角线不加速；边界约束正常。
3. **自动攻击**：起始铁剑自动出招；命中/伤害经 `ctx.applyDamage` 生效。
4. **波次**：`wave:started` / `wave:cleared` 正常触发、余时倒计时；终波结束胜利、气血归零失败。
5. **经验升级**：击杀生成单枚经验球、靠近吸附拾取加经验、达阈值弹三选一；面板 1/2/3 与方向键+Enter
   可选择并生效（升级面板键盘走 `game/ui/ui.js` 自身监听，非 `engine.input`）。
6. **拾取**：经验球与道具/武器掉落均可拾取；第 3 波武器掉落链路正常。
7. **暂停/失焦**：Esc/P 切换暂停；`window.blur` 自动暂停（仅 PLAYING 进入；升级面板不被打断）。
8. **死亡重开**：R/Enter 或结算按钮重开；在途经验球/掉落物清空、武器回到起始武器、经验/等级归零。
9. **帧末清理**：修复后 `engine.endFrame()` 正常执行，`pressed` 边沿不再累积（暂停/菜单快捷键不粘连）。
10. **无 UI 兜底路径**（UI 缺失/抛错时）：自动选择升级、键盘开/重开仍可用（`!ui` / `!hasResultUi` 分支）。

## 七、与 v1 的对照（本轮独立复核结论）

- **一致**：根因（`pollFrameInput()` 解引用 `wasPressed`）、每帧重复机制、受影响文件（仅 `game/app/app.js`）、
  责任属主（loop-engine / loop-app）、B3 修复范围（仅 `app.js`）。
- **修正**：v1 将 `buildContext()` 的 `on: bus.on, off: bus.off` 记为“潜在同类风险”；本轮读码确认
  `bus.on`/`bus.off` 为闭包函数、不依赖 `this`，脱离调用**安全**，不属缺陷、无需作为修复项。
- **补充**：明确 `wasPressed` 在 `'use strict'` 下 `this === undefined` 的抛错成因；明确 MENU 期不崩
  （因 UI 存在且 `!ui` 短路）而进入 PLAYING 即崩，与客户时序吻合；确认 combat/enemies/progression/arsenal
  均不读取 `ctx.input`，UI 键盘走自身 DOM 监听。

## 八、证据、分析与限制

- **证据来源**：本轮实际读取并逐行核对
  `index.html`、`game/app/app.js`、`game/app/bus.js`、`game/app/integrations.js`、
  `game/app/wave-scheduler.js`、`game/engine/engine.js`、`game/engine/input.js`、
  `game/player/player.js`、`game/combat/combat.js`、`game/enemies/enemies.js`、
  `game/progression/progression.js`、`game/items/arsenal.js`、`game/ui/ui.js`。
- **未运行任何浏览器/DevTools**；**未运行任何 shell**（无 node/npm/测试脚本/环境探测/hash 计算）；
  环境事实取应用 `project_state` / 项目配置。
- **分析来源限制（如实说明）**：按任务要求应在真实回合内派 `loop-engine` 做独立只读复核，但本会话注入的
  `dispatch_task` 能力仅接受 `stage-request → convener` 形态；向 `loop-engine` 派发被应用拒绝
  （回执 code：`stage-request-invalid`，未创建任务、未写账本）。因此本报告为**运营（convener）本人对真实源码的
  独立只读复核**，不是 loop-engine 的独立分析回执；loop-engine 独立复核仍需在相应派发能力可用后补做。
  该限制不影响读码结论本身的证据性（结论均由上述源码逐行核对得出），但 B3 实现与 A12 独立验收不应省略。
- 本报告**不构成验收结论**，不批准、不代替客户决定；hash 由应用按真实字节计算与记录。

## 九、阶段推进建议

- B1（只读影响面分析）已完成：根因唯一、范围唯一、属主明确。
- 建议幕僚下一步发 **B3**（不请求 B2）：由 `loop-engine` 在 `game/app/app.js` 内做最小修复并按规定提交，
  随后由幕僚创建独立验收（roster `roles[].review` 优先）按第六节回归要点实机核对。
- B3 派发前仍需核当前有效 D3/授权、完整激活回执、workflow 与依赖就绪（本阶段不预先假定）。
