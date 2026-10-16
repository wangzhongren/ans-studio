---
id: u1-notice-restick-deskui
type: fix
title: U1 切回已开会话角色内容被提示条顶起 18px——提示条布局粘性补滚（渲染侧）
created: "2026-10-16"
timezone: Asia/Shanghai
status: implemented
related: [visual-convergence-v3-implementation-deskui, desktop-window-e2e-v3-sync]
---

# U1：切回已开会话角色后提示条撑开顶起内容——补一次贴底（桌面UI）

## 0. 来源与边界

- 由「桌面窗口」自检台（V2 批对齐轮）定位、PM 路由本侧：`U1_WINDOWED_TO_BOTTOM` 确定性 false
  （dist=18px），缺陷由 V2 批 **fd0ac73** 引入；对方不放松断言、未代改本侧文件（只读运行其 e2e）。
- 本侧改动仅：`app/renderer/renderer.js`（提示条两写方 + 三条注释同步）与
  `test/桌面应用/renderer.test.ts`（+1 用例，钉住「提示出现后仍贴底」）。
  **未修改** `test/桌面应用/e2e/main.mjs`（只运行）；未 git 提交；未触碰 `/private/tmp/ans-v11-release-run`
  与 `/private/tmp/ans-ui-preview`。

## 1. 根因（一条因果链）

1. V2 批 fd0ac73 把状态提示从聊天区**下方**（composer 内）搬成聊天区**上方**的 `.session-notice` 条
   （`#composer-hint` + `#history-projection-note`，同为**空时 display:none 零高**）。
2. U-1 语义：点角色 ⇒（无未作答卡时）`showPane → stickPaneToBottomOrCard → scrollBottomForced`
   **立即贴底**（这也是断言先测到 dist=0 的原因）。
3. selectRole 的**异步尾部**才 `setHint(res.note || "")`——续接已有会话时
   note=「已在该角色的会话中，续接当前会话。」（session.ts:999；就绪变体同）。此刻提示条 **0→≈19px**
   展开 ⇒ `#chat` clientHeight −18px（pane 内容与 scrollTop 均未动）⇒ 距底恰 18px，**无后续补滚**。
4. 对照：U1_NORMAL / U1_REPEAT 不红——su 的提示条此前已被写非空（或复点路径 hint 先于贴底），
   高度在贴底时已就位、其后写同形文本高度不变。窗口化/常规路径与缺陷无关（纯时序，不是虚拟化问题；
   dist 恰等于条高一量即验，两轮 U1_PANE_HEIGHT 同为 12683 佐证内容本身未动）。

## 2. 修法（最小：提示条两写方「先量后写」+ 高度变化补偿一次贴底）

`app/renderer/renderer.js` 新增两个小助手（L148/L157），并包住**同一根条的两个写方**：

- `noticeLayoutPin()`：改文案**前**记「是否在底部附近」——**复用 S-1 同款判据**
  （`UiLabels.stickToBottom(d, STICK_THRESHOLD_PX=24)`）＋条高；`backgroundDelivery` 直接返回
  null（后台视图不得动可见视口）。
- `restickAfterNoticeChange(pin)`：四道闸——
  ① 原不在底部 ⇒ 绝不滚（**上翻者不打扰**，S-1 语义原样）；
  ② 条高**未变** ⇒ 不动（重复写同值零副作用，**不引入滚动抖动**）；
  ③ `batchDepth > 0` ⇒ 照 Q-1 口径只登记 `batchSuppressedScroll`、收尾统一（不逐条布局）；
  ④ 通过 ⇒ `chat.scrollTop = chat.scrollHeight`（与 `flushBatchSideEffects` 同款贴底，窗口化下
   rAF 滚动监听照常刷新虚拟窗口）。
- 写方 ① `setHint(text, source)`：量 → 写 → 补（U1 主路径）。
- 写方 ② `renderContextState` 的 `#history-projection-note` 写入：与 composer-hint 同住一根条
  （历史投影注记出现同样顶起内容），同款量 → 写 → 补（**不设第二套口径**）。

滚动语义本身逐字未动：点角色/卡到达/回放的强制贴底、S-1 流式粘性（在底部才贴、先量后挂）零改动；
**无计时器**（纯同步量写，不加延迟不断帧）。

关键 diff（L148–L169）：

```js
function noticeLayoutPin() {
  var chat = $("chat");
  if (!chat || backgroundDelivery) return null;
  var bar = document.querySelector(".session-notice");
  return { chat: chat, bar: bar, h: bar ? bar.getBoundingClientRect().height : 0,
    pinned: UiLabels.stickToBottom(chat.scrollHeight - chat.scrollTop - chat.clientHeight, UiLabels.STICK_THRESHOLD_PX) };
}
function restickAfterNoticeChange(pin) {
  if (!pin || !pin.pinned || backgroundDelivery || !pin.chat.isConnected) return;
  var h = pin.bar ? pin.bar.getBoundingClientRect().height : 0;
  if (h === pin.h) return; // 提示条高度未变：不动（防抖动）
  var pane = pin.chat.querySelector(".chat-pane");
  if (batchDepth > 0) { if (pane) batchSuppressedScroll = pane; return; } // Q-1：批量期抑制，收尾统一贴底
  pin.chat.scrollTop = pin.chat.scrollHeight;
}
function setHint(text, source) {
  var pin = noticeLayoutPin();
  $("composer-hint").textContent = text || "";
  currentHintSource = source || null;
  restickAfterNoticeChange(pin);
}
```

## 3. 影响面

- 触发面 = 全部 setHint 调用点（≈25 处）＋历史投影注记写入；**只在**「条高确有变化 × 原在底部附近」
  同时成立时才多一次 `scrollTop` 赋值。其余路径零副作用（条高不变 ⇒ 不滚；上翻 ⇒ 不滚）。
  附加开销 = 每次写各 2 次 getBoundingClientRect（低频路径，非流式热路径）。
- 未覆盖（同族、本轮范围外，如实列出）：`#runtime-config-notice` / `#switch-confirm` 两家条由各自
  写方（配置状态 / 忙碌切项目确认）控制，出现时同样使 #chat 变矮——不在 U1 报缺陷内、不在
  「setHint 一带」，**未动**。如后续需要，同一「量—写—补」范式可平移（建议单独批次评估，避免
  顺带改变这两处的滚动观感）。
- 测试/断言面：`renderer.test.ts` +1 用例；既有断言零改写（他方断言未动）。

## 4. 验证（全部只读运行）

| 项 | 结果 |
| --- | --- |
| 桌面窗口 e2e（`ANS_E2E_OUTDIR=/private/tmp/ans-ui-u1-e2e`，只运行不修改） | `E2E_DONE=1`；**`U1_WINDOWED_TO_BOTTOM=true`（dist 18→0）**；U1_NORMAL/U1_REPEAT 仍 true；S-1 五组粘性断言全 true 不变；无 FAIL/ERROR 行 |
| 边界测试 `test/桌面应用/**/*.test.ts` | **354/354 过**（含新增 U1 用例） |
| 全仓 `node --test "test/**/*.test.ts"` | **1678 用例：1677 过 / 0 败 / 1 跳过**（exit 0） |
| `npm run typecheck` | **全仓 0 错**（exit 0） |
| 本侧 e2e `uiux-v2.mjs`（默认全家族） | `UIUX_V2_PASS 99`（与 v3 批基线一致，无回归） |

证据：[before/after 关键行](2026-10-16-u1-notice-restick-evidence/before-after-key-lines.md) ＋
[修复轮完整 e2e 报告](2026-10-16-u1-notice-restick-evidence/e2e-report-after.txt)。
before 的权威口径以桌面窗口的记录为准（U1_WINDOWED_TO_BOTTOM 确定性 false、dist=18px；本轮基线轮
16:40 同值，布尔断言红仅此一条）。

新增用例（`renderer.test.ts`，紧跟 U-1 组后）：

> **U1：会话提示条（.session-notice）出现/增高——「在底部者」补一次贴底；上翻者不打扰；高度不变不动**
> 钉：两写方量—写—补结构；判据复用 `UiLabels.stickToBottom` + `STICK_THRESHOLD_PX`；`backgroundDelivery`
> 放弃；高度未变不动；批量期只登记；补滚前置闸（`pin.pinned`）；不引入计时器。

## 5. 回滚

本批逻辑面 = 一个 setHint 包装 + 一个注释级包裹（renderContextState 一处）+ 两助手函数；回滚 =
还原上述三处到「`setHint` 单行写法 + `history.textContent` 单行写法 + 删除两助手」，并同步还原
`renderer.test.ts` 的 +1 用例。回滚后行为 = 修复前（含 U1 dist=18 缺陷与三条过时注释）。
指纹：`renderer.js 3179388f`（改前 `0d704b44`）、`renderer.test.ts d2c267f6`（改前 `74630b45`）；
其余文件零触碰（`role-status.js ba3051c8`、`tool-rows.js 3f851983`、`styles.css 7f83b2bc` 同批未变）。

## 6. 附带评估（任务第 3 项：只定性 + 注释同步，不改行为）

桌面窗口报告两项，逐项核对如下（均为**注释级**处置，行为零变更）：

1. **手输仿照注入前缀会被渲染为注入行**——核对结论：**分路径成立**。
   - **实时回显路径：已被保护**（fca8f6b 起为**身份绑定**）——本端手发送的气泡在 `bindManualTurn`
     以 canonical 键 `["input", turnId]` 绑定身份（并置 live 计数），其同轮回显在 `appendOneEvent`
     判到同键已 live ⇒ 整条去重、**不进入归类**。手输即便字面像前缀，实时也呈普通气泡。
   - **回放路径：残余边界成立**——历史行（session-history 的 user 行）只带文本、不携「手输/投递」
     身份，回放按**同一张前缀表**归类 ⇒ 手输的仿前缀文本在回放里被归成注入行（典型触发：
     重启/重载后整段回放，preserve 表为空时；同一进程内切走切回通常被去重或 preserved 手动行保住）。
     属**呈现层来源张冠李戴**（手输被提升为「回交投递 · 来自 X」样式），无数据/授权面影响，
     严重度定性：低—中（治理叙事里来源标注是卖点，建议排期）。
   - **最小修复方案（跨角色边界，未实施）**：历史行携带投递身份（交付机已有
     `inputProvenance`/`inputPresentation` 先例可循——程序化投递在落历史时打标记），回放**先按标记
     归类**、仅对旧记录回退文本前缀。落点：`app/desktop/session-history.ts` + 编排侧投递函数
     （`src/common/编排/handback.ts` 族），**非本侧边界**——建议 PM 路由桌面窗口/编排定夺，
     本侧按接口形状配合消费。
2. **注释过时（"15s 防误伤"）**——核实：启发式确在 fca8f6b 删除、改为身份绑定；`lastManualSend`
   因此**无读取方**（仅随运行时视图捕获/恢复，且被既有用例钉住写入）。已同步三处注释：
   - `renderer.js` L2325 一带（prompt-input 归类块）：改为如实现状（身份绑定机制、fca8f6b 起生效、
     只覆盖实时回显、指向回放残余边界）；
   - `renderer.js` L4208 一带（lastManualSend 写入处）：改为「仅是记录，防误伤判据已非它，勿据此
     记录做归类判断」；
   - `renderer.js` L3233 一带（回放归类块）：「手输的历史行不受影响」为不实陈述，改为如实标注
     残余边界与修复方向。
