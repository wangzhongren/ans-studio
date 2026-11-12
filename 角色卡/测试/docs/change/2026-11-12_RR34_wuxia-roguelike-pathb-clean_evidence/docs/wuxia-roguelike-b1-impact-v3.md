# wuxia-roguelike B1 影响面报告 v3（v2 更正与派发记录；结论不变）

- flowId：`wuxia-roguelike`
- workflowId：`wf-08a64bc64db25ab9650a5372`
- stage：B1（只读影响面分析与根因确认）
- 路径：B（复用现有仓库、现有角色与模块属主）
- 关联任务：B1 原任务 `#t-mwcbsu2q-32509e8e`；B1 补齐任务 `#t-mwcbymny-4ac78b50`
- loop-engine 只读复核任务：`#t-mwcbytjn-92613679`（本轮已按普通 dispatch 成功派发；sideEffect=read-only，待其回交）
- 日期：2026-11-12
- 前版：`docs/scheduling/wuxia-roguelike-b1-impact-v2.md`（结论继续有效，本文件不重复全文）

## 一、结论：与 v2 一致，无内容修订

根因、调用链、受影响文件、责任属主、最小修复范围与回归要点均以 v2 为准，本轮复核与 v2 一致：

- **根因**：`game/app/app.js` · `pollFrameInput()` 把 `engine.input.wasPressed` 解引用为裸函数后以 `pressed('escape')` 形式调用；`game/engine/input.js` · `Input.prototype.wasPressed` 读取 `this.pressed`，而 `input.js` 为 `'use strict'` IIFE，裸调用下 `this === undefined`，抛出
  `TypeError: Cannot read properties of undefined (reading 'pressed')`（与客户现象逐字一致）。
- **为何“点开始后”才崩**：MENU 状态仅在 `!ui` 时调用 `pressed(...)`；本项目 UI 正常加载，故进入 `PLAYING` 后必然调用并抛错。
- **逐帧重复**：`frame()` 先 `requestAnimationFrame(frame)` 再调用 `pollFrameInput()`；异常跳过 `stepWorld/renderFrame/updateUi/engine.endFrame`，但下一帧已排好，故每帧重复。
- **受影响文件**：唯一真实缺陷 `game/app/app.js`（`pollFrameInput`）；`game/engine/input.js` 实现正确不改；`buildContext()` 的 `on/off` 为闭包函数脱离调用安全（非缺陷，修正 v1 判断）；engine/player/combat/enemies/progression/arsenal/ui 无需改动。
- **责任属主**：`loop-engine`，模块 `loop-app`（写区 `game/app/`）。
- **最小修复范围**：仅 `game/app/app.js` · `pollFrameInput()`，保留 `engine.input` 对象并以方法形式调用 `input.wasPressed(...)`（或局部包装函数）；不改 `input.js`、不改状态机/固定步长/事件契约/数值。
- **回归要点**：控制台无逐帧 TypeError；移动（WASD/方向键、对角线不加速、边界）；自动攻击；波次开始/清除/终波胜负；经验球生成/拾取/升级三选一（1/2/3 与方向键+Enter）；经验球与道具/武器拾取；暂停 Esc/P 与 window.blur；死亡重开（R/Enter 或按钮、掉落清空、武器回起始）；`engine.endFrame()` 恢复后 `pressed` 边沿不累积；无 UI 兜底路径可用。

## 二、派发记录更正（取代 v2 第八节相关限制说明）

- 上一轮向 `loop-engine` 派发时误用 `taskKind:"stage-request"`，被应用拒绝（`stage-request-invalid`；stage-request 只能由幕僚发给运营）。该限制说明仅针对错误用法，**不代表生产派发能力不可用**。
- 本轮按普通 `dispatch_task`（`roleId=loop-engine`、`stage=B1`、`workflowId=wf-08a64bc64db25ab9650a5372`、`moduleId=loop-app`、`modulePaths=["game/app/"]`、`sideEffect=read-only`、不带 `taskKind`）派发成功，应用受理任务 `#t-mwcbytjn-92613679`（受理 ≠ 完成，待 loop-engine 回交只读复核报告）。
- v2 第八节中“运营本人独立复核、非 loop-engine 回执”的表述，作为当时的真实限制仍成立；本轮起改由 loop-engine 独立复核任务承接。若其结论与本报告不一致，以属主复核回执与后续 B3/A12 实机回归为准，并另出修订。

## 三、证据与限制

- 本文件为对 v2 的更正与派发记录；结论依据仍是运营对真实源码的独立逐行读码复核（文件清单见 v2 第八节）。
- 未运行浏览器/DevTools；未运行任何 shell（无 node/npm/测试脚本/环境探测/hash 计算）；未修改 `game/**`；未 git add/commit。
- hash 由应用按真实字节计算记录，本文件不自行计算或转抄。
- 本报告不构成验收结论，不批准、不代替客户决定。

## 四、阶段推进

- B1 影响面报告（`docs/scheduling/wuxia-roguelike-b1-impact-v2.md` 与本文）作为 B1 证据由应用记录；建议幕僚据此推进 **B3**（不请求 B2）。
- B3 派发前仍按既有口径核当前有效 D3/授权、完整激活回执、workflow 与依赖就绪；独立验收由幕僚创建（roster `roles[].review` 优先）。
