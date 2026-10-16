---
id: desktop-ui-g2-recovery-card-and-system-rows
type: fix
title: G-2/U1 恢复确认卡渲染 + `[系统]` 消息行样式（角色看护与收束）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-unverified
related: [role-watchdog-and-closure, kanban-fixes-pm-review]
events:
  - date: "2026-10-16"
    kind: created
    summary: 客户按推荐批准 G-2（V1a+V1b 同轮实施）；本角色按派发实施 U1（恢复卡渲染 + system 行样式），设计规格＝产品提案 2026-10-16_design_role-watchdog-and-closure §六/§3.3
  - date: "2026-10-16"
    kind: implemented
    summary: 恢复确认卡（复用 shell 卡组件族；恰 allow:true/取消为默认焦点/等待不设限/失效如实）+ `[系统·<子类>]` 投递归类与行样式 + 队列来源标签与不可撤回呈现；边界内单测 80/80、桌面目录 321/321、Electron 离线 e2e G2 5 项 + COMPLETE_FLOW 41 + 默认台 99 全过；typecheck 全仓 0 错；W5/O1 未落树处按提案形状实现并标注待接
---

# G-2/U1（渲染侧）：恢复确认卡渲染 + `[系统]` 消息行样式

## 1. 背景与批准依据

- 客户批准记录（2026-10-16）：`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-2 客户批准与派发」——9 个待裁点全部按推荐采纳（含**恢复卡不设限**、恢复动作集 `{abort-turn, rebuild-session, redeliver}`、`system` 呈现细节交实现层），V1a+V1b 同轮实施。
- 设计规格＝`角色卡/产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md`；本角色获批项 = **U1（恢复卡渲染 + `[系统]` 消息行样式，§十）**，对应提案 §六（6.2 恢复确认流交互图）与 §3.3/§7.3（system 文案与呈现）。
- U1 原文：「复用确认卡组件族；`[系统]` 消息行如实标注来源」。

## 2. 实施内容（只动本角色边界内文件）

### 2.1 `app/renderer/tool-rows.js` — `system` 类投递归类（聊天流单一来源）

- `classifyInjectedMessage` 在既有 `[回交] `/`[派发] ` 两类之后新增 `system` 类：剥掉可选 `用户指令：` 回显前缀后，正文以定格标记 **`[系统·`** 开头、`<子类>` 闭合于 `]` 且其后为空白或文末（子类内无括号/换行、长度 ≤12——「看起来像」不归类）⇒ `{kind:"system", label:"系统消息 · <子类原文>", sourceRoleId:"", body}`。
- **来源=系统（非角色）**：`sourceRoleId` 恒空——呈现层标签绝不出现「来自 X」。子类集合（看护/收束/恢复回执…）**不逐子类登记**，随编排 O1 的文案单一来源落树自然扩展；判据唯一改动点 = `SYSTEM_HEAD`/`SYSTEM_SUB_MAX`（注释即契约）。
- 实时回显与回放同解（同一分类器；renderer 的 `renderOneEvent` 与 `appendReplayRow` 都经它）。

### 2.2 `app/renderer/ui-labels.js` — 两枚纯映射

- `queueSourceLabel` 新增 `system ⇒ 「系统」`（队列视图来源标签；撤回判据在渲染侧 `canWithdraw`（只认 `message` 类）——system 行**不出现撤回钮**＝「不可撤回呈现」，与派发/回交同款只读面）。
- 新增 `recoveryActionView(action)`：三枚**冻结枚举**的纯转写——`abort-turn`→「停止本轮」、`rebuild-session`→「重建会话」、`redeliver`→「重新投递」（各带一句与设计 §6.3 同向的后果说明）；**未知动作 ⇒ null**（渲染侧只呈现原始 token——不假装认识、不编语义）。

### 2.3 `app/renderer/index.html` + `styles.css` — 恢复确认卡（复用确认卡组件族）

- 新增 `#recovery-confirm.sc-overlay > .sc-card`（复用 shell 卡的 overlay/card/head/actions/hint 组件类）：标题「恢复操作请求」；动作行（`rc-action`，人话标签 + 原始 token）、目标角色行（`rc-role`）、说明行（`rc-note`）、可选原因（`rc-reason`）、证据 `<pre id="rc-evidence">`（**逐字**、pre-wrap 可滚）、折叠详情（提议方/时间/条目，缺省即隐藏）、按钮「执行」（`rc-allow`，中性）/「取消」（`rc-deny`，深色实心=**默认焦点**）、fail-closed 提示行（`rc-hint`）。失效态沿 shell 卡降淡（`.sc-card.is-expired`）。
- `styles.css`：`.rc-*` 系列样式 + `.msg-injected.is-system`（实线边框 + 左侧竖条、正文满色——与角色投递的虚线框拉开，如实标注来源=系统）。

### 2.4 `app/renderer/renderer.js` — 卡片状态机与行样式接线

- **恢复卡**（与 shell 卡同址同纪律的平行实现，未抽公共件——两卡按钮/文案/终态语义不同，抽公共件反增耦合；共享 pending/replay/expire 机制属 W5 的 presenter 侧）：
  - `state.recoveryConfirm`（随 runtime 视图 capture/install；切引擎重渲染；换项目 `resetPanes` 关闭）。
  - `onRecoveryConfirm(payload)`（`Rt.matchesView` 视图身份校验；同 id 幂等）→ `renderRecoveryConfirm`（全部字段 **textContent** 落入——无 HTML 注入口；证据逐字不截断；`rc-deny` 默认焦点）。
  - `respondRecoveryConfirm(allow)`：**恰 `{allow:true}`**（点「执行」）才作为执行请求回传；取消/Esc/关闭（×）一律 `false`。受理 ⇒ 收起；`{expired:true}` ⇒ 如实终态「此确认已失效（应用重启或请求已结束），**未获执行**——请让提议方重新发起。」；通道未接/异常 ⇒ 「未能回传你的决定（通道未接或异常）——按 fail-closed 不执行；请让提议方重新发起。」——**绝不呈现为已执行**。
  - **等待不设限（裁定 4）**：全程无计时器（G-1 纪律；`renderer.test.ts` 既有去注释源断言继续钉）。
  - Esc 键序：恢复卡在 DOM 中声明于 shell 卡之后（视觉在上）——两卡同开时 Esc 先答恢复卡；两者 Esc 均 = 否决，顺序不影响 fail-closed。
- **模态互斥**：新增 `anyConfirmOverlayOpen()`（shell ∪ recovery）——抽屉 `inert`、focusin 归位、Tab 焦点圈三处共用（原三处逐一读 `#shell-confirm.hidden`，单一判据收口）。
- **`[系统]` 消息行**：`buildInjectedElement` 对 `system` 类取 `ICONS.shield` 图标（区分来源）；标签沿用分类器产出的「系统消息 · 看护」。回放路径原样受益（同一分类器）。
- **探针面**：`window.__ansRenderer.onRecoveryConfirm` 导出（沿 `onShellConfirm` 探针先例；e2e 在 preload 通道落树前也能驱动卡片）。

### 2.5 测试与夹具

- `test/桌面应用/tool-rows.test.ts`：新增 2 条——① system 归类矩阵（回显/回放、子类标签、`sourceRoleId` 恒空、恢复回执同族）；② 不误伤矩阵（行内提及/未闭合/空子类/无空白衔接/超长子类/嵌套括号 ⇒ null）+ 既有两类回归不变。
- `test/桌面应用/renderer.test.ts`：新增 3 条——① 恢复卡结构/接线/三条 fail-closed 出口/失效如实/无计时器/样式钩子；② `recoveryActionView` 纯映射（三枚冻结枚举 + 未知 ⇒ null）；③ `[系统]` 消息行接线（is-system 类名/系统图标/撤回判据不含 system/样式钩子）。N-3 队列夹具扩一条 `system` 条目（来源标签「系统」、kind 原样转出）。**既有断言一条未动（除 N-3 夹具按新增行扩列）**。
- `test/桌面应用/e2e/uiux-v2.mjs`：新增 `g2RecoveryChecks` 段（`ANS_G2_RECOVERY_UI_ONLY=1` 驱动）——真实 Electron 下：① 看护告警真投递回显 → `.msg-injected.is-system` + chip「系统消息 · 看护」+ 非客户气泡；② 收束提示**回放**路径同一分类器；③ 探针注入恢复卡 → 动作/角色/证据逐字 + 取消默认焦点 + 详情默认收起；④ Esc=不执行 + 通道缺席如实终态（「按 fail-closed 不执行」）；⑤ 失效卡关闭即清零。两档截图存证。

## 3. 测试与证据（本机实测，2026-10-16）

| 命令 | 结果 |
|---|---|
| `node --test test/桌面应用/{tool-rows,renderer,markdown,runtime-ui}.test.ts` | **80/80 通过**（renderer 48＝45+3 新增；tool-rows 15＝13+2 新增） |
| `node --test "test/桌面应用/*.test.ts"`（桌面目录全量，含其他角色用例） | **321/321 通过** |
| `ANS_G2_RECOVERY_UI_ONLY=1 npx electron test/桌面应用/e2e/uiux-v2.mjs` | **G2_RECOVERY_UI_PASS 5**（真实 Electron 44.7.0；截图 `g2-recovery-card-{1360,960}.png`：卡面（动作/角色/说明/原因/证据逐字/详情折叠/执行-取消）与「系统消息 · 看护」行同框可见） |
| `ANS_COMPLETE_FLOW_UI_ONLY=1 …`（既有主回归，本侧共享路径） | **COMPLETE_FLOW_UI_PASS 41**（一键未降） |
| 默认全量台（无 ONLY 旗标） | **UIUX_V2_PASS 99**（含抽屉/Esc/focusin/队列几何等本侧触碰路径） |
| `npm run typecheck` | **全仓 0 错** |

证据目录：`角色卡/桌面UI/docs/fix/2026-10-16-g2-recovery-card-evidence/`（`report.json` + 两张卡面截图；`complete-flow-rerun/`、`default-uiux-rerun/` 为两条回归输出的 report 与截图；user-data 已清理）。

## 4. 与 W5 / O1 的接口点（**W5、O1 均未落树，以下为按提案形状实现后的待接清单**）

- **W5（桌面窗口，恢复确认卡 presenter）**：
  - 渲染侧消费的推达数据面（`recovery:confirm-request`，preload `onRecoveryConfirm(cb)`）：`{ id, projectRoot?, runtime?, roleId, action, evidence, reason?, requestedBy?, requestedAt?, itemId? }`。**`projectRoot`/`runtime` 建议随推达携带**（沿 `shell:confirm-request` 先例 `operator-channel.ts:414-415`——视图身份不匹配会被丢弃，防止异引擎错渲染）；`id` 为幂等键（同 id 重推=补挂不重建）。
  - 回传：`recovery:confirm-response`（preload `recoveryConfirmRespond({id, allow})`）回报口径按 shell 卡三态：`{ok:true}` 受理 / `{ok:false, expired:true}` 失效（渲染侧定格「未获执行」）/ `{ok:false, error}` 通道异常（同样如实不执行）。渲染侧只在 `d.onRecoveryConfirm` 存在时订阅——**通道落树前零影响、零执行路径**（fail-closed）。
  - 卡片呈现语义已钉：恰 `allow:true` 可执行；取消默认焦点；窗关 `rejectAllPending`＝未获执行（回执如实属 W5）；`evidence` 逐字上卡（W5 校验非空属工具侧 R2）。
- **O1（编排，文案单一来源）**：渲染侧归类对 O1 的**唯一依赖 = 文首定格标记 `[系统·<子类>] `**（子类闭合于 `]`、其后空白或文末）。子类词表（看护/收束/恢复回执…）不逐项登记、随 O1 自由扩充；**若 O1 文案偏离该标记形态**（如改成 `【系统】` 或去掉闭合空白），classification 会静默回落到普通气泡——届时唯一改动点 = `tool-rows.js::SYSTEM_HEAD` 一带（注释即契约）。
- **W2（桌面窗口，`system` 投递 kind）**：渲染侧已就位——队列快照条目 `kind:"system"` ⇒ 右栏来源标签「系统」、无撤回钮（判据只认 `message`）；`summaries` 短句由主进程产（沿用既有快照通道，渲染侧无新数据源）。

## 5. 边界与未做

- 只改本角色边界内文件（`app/renderer/**` 5 件 + 3 个 test 文件 + 本记录/changelog/memo/feature-map）；未 git 提交；未碰 kanban-live-3 轮次目录、`/private/tmp` 与既有证据目录；对 `app/desktop/**`、`app/main.ts`、`app/preload.cjs`、`src/**` 只读定位、零改动。
- 未做（按派发）：W5 的 presenter/执行桥与 O1/R1/R2/G 属其他角色上下文；真实「提议→卡→恰 allow:true 执行→回执」端到端需 W5/R2 落树后联合观测（本次 e2e 以探针驱动卡片 + 通道缺席如实终态为用户可观测面的最强离线证据）。
- 状态：**implemented-unverified**——独立验证与真机 E2E 按 PM 安排交测试角色。

## 6. 候选指纹（sha256 前 8）

- `renderer.js 928ffacd`、`tool-rows.js 02d75fb2`、`ui-labels.js 564fdb9a`、`index.html a39e3652`、`styles.css dbbb66f0`、`tool-rows.test.ts 6881dc34`、`renderer.test.ts 606e5287`、`uiux-v2.mjs aa8565bb`。
