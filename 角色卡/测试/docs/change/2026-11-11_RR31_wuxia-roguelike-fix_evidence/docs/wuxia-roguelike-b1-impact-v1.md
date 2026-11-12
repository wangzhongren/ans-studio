# wuxia-roguelike B1 影响面报告：运行期 TypeError（input.wasPressed 解引用）

- flowId：`wuxia-roguelike`
- workflowId：`wf-739312023202ee992b7c8955`（B 批）
- stage：B1（只读影响面分析，未改实现代码）
- 幕僚任务：`#t-mwc9o8n9-2e908938`（stage-request，read-only）
- 分析派发：`#t-mwc9otb7-a48fa319`（loop-engine，只读；正式本报告由运营落盘）
- 日期：2026-11-11

## 一、客户现象

打开 `index.html`，点「踏入江湖」开始后，浏览器控制台每帧报
`Uncaught TypeError: Cannot read properties of undefined (reading 'pressed')`，
游戏无法进行（移动 / 自动攻击 / 波次 / 经验升级 / 拾取 / 死亡重开全部停滞）。

## 二、根因（读码确认）

1. `game/app/app.js` 的 `pollFrameInput()` 首行把输入方法解引用后独立调用：
   ```js
   var pressed = engine.input.wasPressed;
   ...
   if (pressed('escape') || pressed('p')) { togglePause(); }
   ```
2. `game/engine/input.js` 中 `wasPressed` 是原型方法，实现访问 `this.pressed`：
   ```js
   Input.prototype.wasPressed = function (name) {
     var n = normalizeName(name);
     if (n && this.pressed[n]) { return true; }
     ...
   };
   ```
3. `input.js` 为 `'use strict'` IIFE；`pressed('escape')` 是普通函数调用（`this` 为
   `undefined`），访问 `undefined.pressed` 立即抛 TypeError。
4. `frame()` 以 `pollFrameInput()` 为每帧固定步骤且**在所有状态下无条件调用**
   （MENU/PLAYING/PAUSED/GAME_OVER/VICTORY 都经过），因此每帧必抛一次，与客户现象完全吻合。

## 三、触发路径与每帧位置

```
index.html
  └─ <script src="game/app/app.js"> → WX.App.start()
       └─ createApp() → startLoop() → requestAnimationFrame(frame)
            └─ frame(timestamp)            // 每帧
                 1. rafId = requestAnimationFrame(frame)   // 先排下一帧
                 2. camera.update(delta)
                 3. pollFrameInput()      // ← 在此抛 TypeError
                 4. （被跳过）固定步长 stepWorld / 渲染 renderFrame / updateUi / engine.endFrame()
```

- 异常发生在第 3 步，第 4 步的 `stepWorld()`（移动/战斗/波次/经验/拾取）与 `renderFrame()`、
  `updateUi()`、`engine.endFrame()` 均不执行；但第 1 步已排好下一帧，所以错误每帧重复。
- `engine.endFrame()` 内的 `input.endFrame()` 因此也一直不执行，按键边沿 `pressed` 不清空，
  即使修复解引用后也需确认帧末清理恢复正常（修复后自然恢复）。
- 菜单 DOM 覆盖层仍可点击（UI 由 DOM 事件驱动），所以「能点开始但游戏不动」符合此路径。

## 四、受影响文件与调用点（读码结论）

| 文件 | 位置 | 判定 |
| --- | --- | --- |
| `game/app/app.js` | `pollFrameInput()`：`var pressed = engine.input.wasPressed`，随后 `pressed('escape')`/`pressed('p')`/`pressed('enter')`/`pressed(' ')`/`pressed('r')` | **真实缺陷（根因）** |
| `game/app/app.js` | `buildContext()`：`on: bus.on, off: bus.off` | **潜在同类风险**（解引用方法；当前未见领域模块经 `ctx.on/ctx.off` 调用，但一旦调用同样 `this` 丢失） |
| `game/app/app.js` | `setInputEnabled()`：`engine.input.setEnabled(enabled)` | 安全（方法调用，`this` 正确） |
| `game/app/app.js` | `stepWorld()`：`player.update(step, engine.input)` | 安全（传对象；player 内 `src.moveVector()` 为方法调用） |
| `game/engine/engine.js` | `endFrame()`：`input.endFrame(); renderer.endFrame();` | 安全（方法调用，`this` 正确） |
| `game/player/player.js` | `resolveMove()`：`src.moveVector()` | 安全（对象方法调用） |
| `game/engine/input.js` | `wasPressed` 等原型方法 | 无需改动（方法语义正确，问题在调用方） |

补充：`game/app/` 其他文件（`bus.js`、`integrations.js`、`wave-scheduler.js`）与 UI 侧未发现
对 `engine.input` 方法的解引用调用；UI 的键盘交互走自身 DOM 监听，不依赖被解引用的输入方法。

## 五、最小修复建议（B3 范围建议）

1. **`game/app/app.js` · `pollFrameInput()`（必改）**：改为保留对象、以方法形式调用，例如
   ```js
   var input = engine.input;
   if (!input || typeof input.wasPressed !== 'function') { return; }
   var pressed = function (name) { return input.wasPressed(name); };
   ```
   或将各调用点直接写成 `input.wasPressed('escape')`（不推荐 `bind` 兜底，方法调用更直观）。
2. **`game/app/app.js` · `buildContext()`（建议同批防御性修复）**：`on`/`off` 改为包装函数
   `function (name, handler) { return bus.on(name, handler); }`，避免同类解引用风险。
3. **不改 `game/engine/input.js`**：其原型方法本身正确；修改 API 会波及 engine-core 已验收模块。
4. 若采用 `bind(this)` 方案亦可运行，但语义不如直接方法调用清晰，且需逐处确认绑定时机。

## 六、副作用 / 回归风险与验证要点

- 修复仅触及调用方式，不改变状态机、固定步长、事件契约与数值，回归面小。
- 需回归确认：
  1. 菜单「踏入江湖」点击/Enter/Space 开局；开局后无控制台逐帧报错。
  2. 移动：WASD 与方向键，对角线不加速，边界约束正常。
  3. 自动攻击：起始铁剑出招、第 3 波拾取柳叶刀后实际出手（combat 已装备双武器）。
  4. 波次：wave:started/cleared 正常、余时倒计时、终波胜利/死亡失败结算。
  5. 经验：击杀生成单枚经验球、拾取加经验、升级弹三选一；面板 1/2/3 与方向键+Enter 可选择并生效。
  6. 暂停：Esc/P 切换；`window.blur` 自动暂停（仅从 PLAYING 进入，升级面板不被打断）。
  7. 结算重开：R/Enter 或结算按钮重开；在途经验球/掉落物清空、武器回到起始武器。
  8. 无 UI 兜底路径（UI 缺失或抛错）：自动选择升级、键盘开/重开仍可用。

## 七、B2 范围结论（建议）

- 修复范围：**仅 `game/app/app.js`**（`pollFrameInput` 必改；`ctx.on/off` 包装建议同批）。
- 责任属主：loop-engine（loop-app）。
- 不改 `game/engine/input.js`、`game/ui/`、`game/player/` 等已验收模块；不新增事件、不改数值。
- 验证方式：A12/B 批验收角色按上述要点实机（file://）回归；本报告不构成验收结论。

## 八、证据与限制

- 本报告基于对 `game/app/app.js`、`game/engine/input.js`、`game/engine/engine.js`、
  `game/player/player.js` 的实际读码；未运行 shell/浏览器、未计算 hash（由应用记录）。
- loop-engine 的独立只读分析任务 `#t-mwc9otb7-a48fa319` 已回交并收口 accepted
  （event-a9aea0ff85c27cfcfcffd491）：结论与本报告一致（唯一真实缺陷为 `pollFrameInput()`
  解引用；`engine.endFrame()`/`player.update` 为安全方法调用；`ctx.on/off` 为潜在风险）；
  该任务未改任何文件、未提交（`git status` 干净）。
