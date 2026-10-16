---
id: desktop-ui-kanban-f8b-tool-rows-exit-classification
type: fix
title: F-8-b 渲染侧：run_shell「进程跑完、退出码非零」行分类改用结构化事实（红→中性）
created: "2026-10-16"
updated: "2026-10-16"
timezone: Asia/Shanghai
status: implemented-unverified
related: [kanban-fixes-pm-review, design-kanban-runtime-shell-exec-proposal]
events:
  - date: "2026-10-16"
    kind: created
    summary: 客户按推荐批准 kanban-live 修复批次（含 F-8-a+b）；本角色按派发实施 F-8-b（tool-rows 行分类）
  - date: "2026-10-16"
    kind: implemented
    summary: tool-rows.js 结构化事实优先分类（exited-nonzero/timed-out）+ renderer.js 错误预览/详情字段让位；单测 13/13、边界内 62/62、Electron 离线 e2e 41+9 全过；typecheck 中本侧文件 0 错（tools.ts 3 错为并行运行时核心上下文在飞的 F-7 中间态，非本侧）；独立验证与真机 E2E 交测试角色
---

# F-8-b（渲染侧）：非零退出不再长得像「执行失败」

## 1. 背景与批准依据

- 客户批准记录（2026-10-16）：`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md`——按推荐批准，F-8-a+b 全数实施；本角色获批项为 **F-8-b（tool-rows 行分类，判据用 display.process）**，派发依据＝运行时核心提案 `角色卡/运行时核心/docs/fix/2026-10-15_fix_kanban-runtime-shell-exec.md` 的 F-8 节。
- 问题（真机证据，replay L89）：`grep -rn "http" src/public` 无匹配 exit 1——命令**已正常执行完成**，只是退出码非零（合法结果），却被标红为「执行失败」：`kind:"denied"`、标签「执行失败」、`exceptional`（红色拒绝行）。
- 真机事件形状（`角色卡/测试/docs/change/2026-10-15-kanban-live-real-project-evidence/`，仅只读引用）：`detail.display.version===1`，`display.process={exitCode:1,stdout,stderr}`，无 signal、无 timedOut；**`display.error` 同时存在**（投影把工具消息回填进 error，与 resultText 同文）。

## 2. 实施内容（只动本角色边界内文件）

### 2.1 `app/renderer/tool-rows.js`（行分类，`activityOf`）

新增结构化事实分支（**判据只认 `display.process`，不解析消息文本**；命中即覆盖上面的文本推断）：

| 事实 | 行分类 | 标签 | exceptional |
|---|---|---|---|
| `process.timedOut === true` | `status:"timed-out"` | 「超时终止」 | **true**（被时限终止属异常终止，保持显著） |
| `process.exitCode` 为数字且 ≠0，且无 `error`/`signal` 事实 | `status:"exited-nonzero"` | 「已执行完成（退出码 N）」 | **false**（红→中性） |
| 其余（含 signal 终止、spawn 失败、exit 0、无 process 事实） | 原路径不变 | 原标签 | 原判据 |

- **事实优先、旧正则兼容（过渡期）**：既有 `knownFailure` 正则（「run_shell 已执行：…（exit N）」）**保留**——无 `display.process` 的旧文本行（如无结构化事实的历史回放）仍走旧路径、行为不变；同输入同时命中旧正则与结构化事实时，**事实胜出**。
- **「无 error」的落点（判断记录）**：`display.process` 当前无 error 成员（真机投影证实），且真机命中类**必然**带 `display.error`（=工具消息回填，与 resultText 同文）——若以 `display.error` 缺席为判据，批准的功能在真机上将完全失效。故按派发原文映射执行：exitCode 存在＋无 signal/（防御式）process.error，**不**读 `display.error`；防御式检查为未来生产者携带 `process.error` 时兜底（绝不吞异常）。
- `ok`/`status`/`kind`/`errorCode` **契约面不动**（与 F-8-a「投影契约不变」一致）；`display.error`/`resultText`/`deniedSummary`/`visibleSummary` 等字段原样保留（呈现让位见 2.2）。

### 2.2 `app/renderer/renderer.js`（同一判据的两处让位）

- `refreshToolLifecycle` error preview（原 L1041 一带）：中性类 `status === "exited-nonzero"` 时**不摆**红色错误预览（退出码已在状态标签如实给出）；其余类照旧显示首行原因/错误码。
- `toolDetails` 详情字段：中性类的 `display.error` 实为工具消息（投影回填），字段标签由「错误」改为「**消息**」——两个消费点都按 `status` 单处判据，渲染侧不自持第二份 exitCode 判定。

### 2.3 测试与夹具

- `test/桌面应用/tool-rows.test.ts`：新增 2 条——① 真机形状（kind denied＋失败三件套＋process 事实）→ `exited-nonzero`/「已执行完成（退出码 1）」/`exceptional:false`，errorCode 契约原样；事实优先于旧正则同输入；无事实的旧文本行保持原分类（兼容钉）。② timedOut 独立一类（label「超时终止」、exceptional:true）、signal/error 事实与 spawn 失败不落中性、exit 0 仍「执行完成」。**既有 11 条断言一条未动**。
- `test/桌面应用/renderer.test.ts`：新增 1 条接线守卫（错误预览让位＋「消息」字段两处字符串钉，已验证与源码逐字一致）。
- `test/桌面应用/e2e/uiux-v2.mjs`：completeFlowChecks 中 run_shell 非零退出夹具（exitCode:2）的期望从「执行失败」**更新为批准后的新行为**「已执行完成（退出码 2）」（检查名同步）；断言强度不降（仍为全等布尔）。其余涉及「执行失败」的 e2e 夹具均非本类（read_file/dispatch_task/report_shell_verdict/无 process 事实），未动。

## 3. 测试与证据（本机实测，2026-10-16）

| 命令 | 结果 |
|---|---|
| `node --test 'test/桌面应用/tool-rows.test.ts'` | **13/13 通过**（含 2 条新增） |
| `node --test test/桌面应用/renderer.test.ts markdown.test.ts runtime-ui.test.ts` | **62/62 通过** |
| `ANS_COMPLETE_FLOW_UI_ONLY=1 npx electron test/桌面应用/e2e/uiux-v2.mjs`（真实 Electron 渲染器） | **COMPLETE_FLOW_UI_PASS 41**；含更新后的「…nonzero exit completion」检查 via 截图可见「调用发起 → 已执行完成（退出码 2）」、详情「消息/结果/退出码：2」 |
| `ANS_DELIVERY_NOTE_UI_ONLY=1 …`（真实受保护历史行） | **DELIVERY_NOTE_PASS 9**（read_file 真失败行仍「执行失败」不回退） |
| `npm run typecheck` | 本侧文件（app/renderer/*、test/桌面应用/*）**0 错**（两次运行均 0）；全仓现存红均属并行上下文在飞的中间态、随其推进变化：首测 3 错在 `src/provider/runtime/tools.ts`（运行时核心 F-7 的 CommandTokenization 重构，复测已归零），复测 1 错在 `test/编排/shell-gate.test.ts`（编排侧在飞，TS2304 ShellAuditSink）——均**非本侧改动** |

证据：e2e 输出目录（当轮）含 `report.json`（41 项）与 `01-tool-detail.png`（中性类渲染截图）。

## 4. 边界与跨角色（只读定位，未改）

- **运行时核心**（F-8-a/F-1 属主）：`src/model/runtime.ts` 的 `ToolDisplayV1.process.timedOut?: boolean` 已在其在飞工作区出现；本侧读取为防御式——其落地前 `timedOut` 恒缺省（不触发超时类），落地后即生效，两头兼容。
- **桌面窗口**（F-8-b 的 session-history/runtime-history 属主）：其行归类（`failed→kind:'denied'`）未动；本侧 `activityOf` 对**带 `display.process` 事实的行**（如真实受保护历史行的 activity.display 已含 process）同样按事实分类——但**行级 kind** 由其决定；两侧最终效果以独立验证+真机复跑为准。
- 渲染进程仍无第二份判定：本改动只是**呈现分类**（标签/例外位），不涉及任何「能否写/能否跑」判定。

## 5. 未做 / 待确认

- 未 git 提交；未碰 kanban-live-2 与证据目录；未改构建配置与其他角色文件。
- 真机 E2E 复跑（含非零退出行样式观测）与独立验证按 PM 安排交测试角色。
- 观察项（不动，登记）：`toolDetails` 中中性类的 `display.error` 与 `display.resultText` 在真机投影下同文（上游回填所致），详情面板会显示两条同文「消息/结果」——属 F-8-a 投影层取材，若后续要消除重复由运行时核心评估。

## 6. 候选指纹（sha256 前 8）

- `tool-rows.js 3eef5bfd`、`renderer.js 74e24c7f`、`tool-rows.test.ts d2432c7a`、`renderer.test.ts 41485c5d`、`uiux-v2.mjs d9f56499`。
