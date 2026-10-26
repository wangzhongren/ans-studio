---
id: app-ui-background-flow-acceptance
type: change
title: 聊天面板/后台任务/流程状态批次独立验收——A1–A11 逐项判定
created: "2026-10-25"
updated: "2026-10-25"
timezone: Asia/Shanghai
status: verified-limited
related: [background-tasks, background-tasks-acceptance, chat-panel-adjustments-plan]
events:
  - date: "2026-10-25"
    kind: verified
    summary: 对 HEAD 2a63414 + 未提交工作树按客户交接口径 A1–A11 独立判定；类型检查 0、桌面应用 602/602、桌面UI 279/279、i18n 51/51、shell-judge-verify 38/38、运行时后台任务 34/34 全过，编排 897/899（1 例既有 Windows symlink EPERM 基线红与本次无关）；实测 CDP 工作态/聚焦色/工具行/判断卡/工具详情；真实 background-tasks:* 与 flow:status IPC 因主进程未重启无 handler，列未验证；总体有条件通过，无行为 FAIL
---

# 聊天面板 / 后台任务 / 流程状态批次独立验收

**总体结论：有条件通过。** 本批应用改动在 A1–A11 上未发现行为性 FAIL；可独立执行的测试与静态/实机抽查全部通过。条件是两个真实 IPC 面的端到端证据尚缺（`background-tasks:list/read/stop` 与 `flow:status` 需要主进程重启后才注册，当前运行窗口调用得到 `No handler registered`），以及两份角色变更记录缺失；详见 §八、§九。

**权限声明**：本结论不授予提交、推送、合并、部署或发布。本角色只写了自身 `docs/change/` 下的报告与证据脚本/截图；未修改实现代码、测试、共享 i18n 或他人文档，未 commit/push。

## 一、标准与依据

本批是**实施完成后**按客户「所有变更都要独立验收」补做的验收，仓库中不存在本批实施前由本角色固定的设计/验收标准。为使判定可复核，本报告把客户交接文字中的可核对要求固定为 **A1–A11**（下表），并明确这是**事后标准**（post-hoc criteria），不是实施前冻结的标准；这是本批次的过程限制，不因本次通过而消失。

| 编号 | 验收项 | 主要判据 |
| --- | --- | --- |
| A1 | 工具失败卡片 | 摘要一行（工具名/目标/失败徽标/一行原因）；完整原文只在展开区；不新增弹窗/live region |
| A2 | 判断结果卡 allow/deny/deny-tier | 盾牌图标、judge 代批徽标、决策主行、流程/引擎/时间、deny 档徽标；默认收起详情 |
| A3 | 工具行排版 | 单行、省略、状态列不换行；完整文本在 title |
| A4 | 判断卡/工具行展开详情重排 | 分区、命令只出现一次、stdout/stderr 分区、长输出折叠 |
| A5 | 输入框聚焦 | 冷色焦点环，textarea 自身不叠第二圈 |
| A6 | 角色工作态 | 绿色 chip + 头像环；工作态无左侧竖条/底色；竖条只属于选中态 |
| A7 | 后台任务运行时访问器与编排透传 | `RoleSession` 三方法、无管理器/关闭语义、`RoleSessionHandle`/治理会话原样透传 |
| A8 | 后台任务桌面面 | `background-tasks:list/read/stop` IPC + preload、unavailable/empty 区分、stop 原样返回、工作概览区块与入口计数 |
| A9 | 流程状态 | `flow:status` 只读 IPC + preload、坏文件进 errors、工作概览区块、头部进度徽标 |
| A10 | i18n | `ui.background.*`、`ui.flow.*`、`main.flowStatus.*` 等 key 成对存在，术语「判断 agent→自动代理」统一 |
| A11 | 测试与文档 | 新增/受影响测试、实现记录与接口文档足以复核，未验证项如实标注 |

## 二、候选身份与环境

| 项 | 值 |
| --- | --- |
| 工作树 | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\lead-governance-coordination` |
| HEAD | `2a634144b61a358b67fc3fe37c17c0e7fbdaf6f7`（`feat/chat-panel-ui-refinements`） |
| 候选 | HEAD + **未提交工作树**（本批快照：40 modified + 22 新增产品/测试/文档；另本角色本报告与证据目录）。**验收期间工作树发生并发漂移**：19:45–19:47 另一在飞变更 `request_acceptance` 修改 `src/provider/runtime/{schema,tools}.ts`、在 `src/model/runtime.ts` 追加类型/能力字段并新增 `test/runtime-core/request-acceptance-tool.test.ts`；该变更**不属本批**、未完成、未验收（见 §2.1） |
| 渲染产物 | `app/renderer/dist/index.html` 构建于 2026-10-25 17:47，晚于本批 renderer 源码最后修改 17:35；运行窗口确实加载本工作树 dist |
| 操作系统 | Windows 11 Pro 10.0.26300（win32 x64） |
| Node / npm | v24.22.1 / 11.19.1（本角色以绝对路径 `C:/Users/51054/AppData/Local/Programs/nodejs/node.exe` 执行） |
| Electron/CDP | 运行中应用，CDP 127.0.0.1:9225，页面 `file:///…/app/renderer/dist/index.html`；**未重启主进程** |
| 候选代码变更后 | 本角色只读产品/测试；本批受审文件的最后修改时间为 14:22–17:35（`src/model/runtime.ts` 于 19:45 被并发变更追加 request_acceptance 类型，后台任务三方法段落经复核未变）；本角色未修改实现、测试或配置 |

### 2.1 验收期间的并发漂移（必须记录）

本工作树与另一个正在进行的实现会话共享。验收进行中（19:45–19:47），工作树新增了与**本批无关**的 `request_acceptance` 工具变更：

- `src/provider/runtime/schema.ts`（+35 行）、`src/provider/runtime/tools.ts`（+108 行）：新工具 `request_acceptance`；
- `src/model/runtime.ts`：追加 `RequestAcceptanceInput/Result/Fn` 与 `requestAcceptance?` 能力字段（第 912–930、1658 行附近）；本批受审的 `RoleSession` 三个后台任务方法（第 69–87 行）内容未变；
- 新增未跟踪测试 `test/runtime-core/request-acceptance-tool.test.ts`。

处理方式：
1. 本报告的**逐项结论只绑定本批受审范围**（§三、§五），不覆盖 `request_acceptance`；该变更仍在飞、未完成、未验收，需在其完成后另做独立验收。
2. 受审的 app/renderer、desktop、service、pipeline、i18n、测试文件在验收期间**未被并发变更触碰**（mtime 均早于本批测试执行）；`src/model/runtime.ts` 的并发修改为追加式，经逐行复核未改后台任务访问面。
3. 并发漂移后本角色**重跑** `npm run typecheck`：仍 **exit 0**（2026-10-25 19:5x 快照）。其余测试结论仍绑定漂移前快照；提交/发布前应以最终冻结候选重跑受影响门。
4. 该漂移是共享工作树的流程风险：本批不能声称「工作树在验收期间零变化」。若客户要求严格候选冻结，应在提交前由可信启动端冻结并复跑。

## 三、改动清单（文件级）

### 3.1 产品代码（22 件修改 + 12 件新增）

| 归属 | 文件 |
| --- | --- |
| 桌面窗口（主进程/preload/desktop） | `app/desktop/interface.ts`、`app/desktop/session.ts`、`app/main.ts`、`app/preload.cjs` |
| 桌面UI（渲染） | `app/renderer/src/App.tsx`、`chat/ChatRow.tsx`、`index.css`、`lib/platform.ts`、`shell/ChatHeader.tsx`、`shell/Sidebar.tsx`、`shell/WorkOverview.tsx`、`shell/phase4a.css`、`shell/shell.css` |
| 桌面UI（新增） | `chat/background-tasks.ts`、`chat/flow-status.ts`、`chat/judge-row-view.ts`、`chat/role-status-view.ts`、`chat/tool-details-view.ts`、`chat/tool-error-view.ts`、`chat/tool-error.ts`、`chat/tool-row-text.ts`、`shell/BackgroundTasksPanel.tsx`、`shell/FlowStatusPanel.tsx`、`stores/background-tasks-store.ts`、`stores/flow-status-store.ts` |
| 运行时核心 | `src/model/runtime.ts`、`src/service/runtime/session.ts` |
| 编排 | `src/pipeline/orchestration/run-role.ts`、`src/pipeline/orchestration/govern-session.ts` |
| 编排/判断文案 | `src/common/编排/governance-judge-verdict.ts`、`src/common/编排/governance-judge.ts`、`src/common/编排/shell-judge-verdict.ts`（「判断 agent」→「自动代理」） |
| 项目管理（共享 i18n） | `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` |

### 3.2 测试（modified 11 + 新增 9）

- 修改：`test/桌面应用/interface.test.ts`、`test/桌面应用/session.test.ts`、`test/测试/shell-judge-verify/{a-allow-flow,b-deny-flow,c-manual-flow,e-deny-tier}.test.ts`、`test/编排/{governance-judge,governance-session,session-handle,shell-judge-risk-scope}.test.ts`、`test/项目管理/shared/i18n.test.ts`
- 新增：`test/runtime-core/background-session-access.test.ts`；`test/桌面UI/{background-tasks,flow-status,judge-row-view,role-status-view,tool-details-view,tool-error-view,tool-error,tool-row-text}.test.ts`

### 3.3 文档

- 已更新：`角色卡/运行时核心/{api-spec.md,feature-map.md,functional-description.md,memo.md}`、`角色卡/运行时核心/docs/feature/background-tasks.md`、`角色卡/运行时核心/docs/change/2026-10-25_change_background-task-session-access.md`（新增）、`角色卡/桌面窗口/api-spec.md`、`角色卡/项目管理/changelog.md`、`角色卡/桌面窗口/docs/change/2026-10-25_change_chat-panel-adjustments.md`（既有）、`角色卡/桌面UI/docs/design/2026-10-25_plan_chat-panel-adjustments.md`（既有）。
- **缺口**：`角色卡/桌面UI/docs/change/` 无 2026-10-25 变更记录（后台任务面板、流程状态面板、工具失败/判断行/工作态等只留有 design 截图）；`角色卡/编排/` 无 2026-10-25 记录/api-spec 说明（三个访问器的纯透传仅见于代码注释与本报告证据）。见 §九。

## 四、独立实测（本角色实际执行）

工作目录均为工作树根；Node 使用绝对路径；关键计数与退出码见下表，原始 stdout/stderr 由本角色在本机实际执行产生。

| # | 命令 | 实测结果 |
| --- | --- | --- |
| 1 | `npm run typecheck` | **exit 0**，无诊断（`tsc --noEmit`）；并发漂移后复跑仍 **exit 0**（见 §2.1） |
| 2 | `npm run typecheck:renderer`（补充） | **exit 0**（`tsc -p app/renderer/tsconfig.json`） |
| 3 | `node --test --test-concurrency=1 "test/桌面应用/**/*.test.ts"` | **exit 0；602 tests / 602 pass / 0 fail / 0 skip**（143.6s） |
| 4 | `node --test "test/桌面UI/**/*.test.ts"` | **exit 0；279 tests / 279 pass / 0 fail / 0 skip** |
| 5 | `node --test --test-concurrency=1 "test/项目管理/shared/i18n.test.ts" "test/项目管理/shared/i18n-guard.test.ts"` | **exit 0；51 tests / 51 pass / 0 fail / 0 skip**（i18n 45 + guard 6；guard 单独复跑输出 `scanned=121 allowlisted=18 violations=0`） |
| 6 | `node --test --test-concurrency=1 "test/测试/shell-judge-verify/**/*.test.ts"` | **exit 0；38 tests / 38 pass / 0 fail / 0 skip** |
| 7 | `node --test --test-concurrency=1 "test/编排/**/*.test.ts"` | **exit 1；899 tests / 897 pass / 1 fail / 1 skip**。唯一失败为 `test/编排/shell-authorized-routine.test.ts:103` 的 `EPERM: symlink`（本机 Windows 无符号链接权限）。该文件相对 HEAD **零 diff**（`git diff --quiet HEAD -- …` exit 0），失败种类为既有 Windows 基线红，**与本批改动无关**，未计入通过、也未用于掩盖其它失败 |
| 8 | `node --test --test-concurrency=1 test/runtime-core/background-tasks.test.ts background-review.test.ts background-engines.test.ts background-contract.test.ts background-session-access.test.ts` | **exit 0；34 tests / 34 pass / 0 fail / 0 skip**（既有 31 + 会话访问面 3）；并发漂移后复跑仍 **34/34** |
| 9 | （补充）`node --test --test-concurrency=1 "test/桌面应用/session.test.ts"` | **exit 0；37 tests / 37 pass / 0 fail / 0 skip**（含桌面窗口客户投影与会话级后台任务聚合用例） |

**与实现者报告的差异（以本角色实测为准）**

- 运行时核心 change 记录称其运行全仓 typecheck 时 exit 1（2 条错误在 `test/桌面UI/tool-error-view.test.ts`）；**当前候选 typecheck exit 0**。该记录是当时快照的陈旧结论，当前候选已无此问题。
- 桌面UI plan 声称 215 项；当前实测 **279 项**（后续新增测试），全过。
- 桌面窗口 api-spec 声称桌面套件 602/602；实测一致。

## 五、A1–A11 逐项结论

| 项 | 结论 | 证据 |
| --- | --- | --- |
| **A1 工具失败卡片** | **PASS（代码+单测）；实机样本 N/A** | `chat/tool-error.ts`（原因提取/截断 72、全文来源）、`tool-error-view.ts`（summary 只含时间/工具/目标/状态徽标/一行原因，全文进 `<details class="tool-error-full">`）、`ChatRow.tsx:301-347`；`tool-error.test.ts` 12 例 + `tool-error-view.test.ts` 4 例（summary 可见文本 <200、无 dialog/aria-live）全过。当前窗口可见区无失败工具行，未取得实机失败卡截图，不作实机声称 |
| **A2 判断结果卡** | **PASS** | `judge-row-view.ts` + `ChatRow.tsx:827`；实机 DOM 实测 6 行判断卡（5 个 shell judge：allow×4、deny×1；1 个 governance judge），`ShieldCheck/ShieldX`、`sj-auto-badge`、`sj-tier-badge` 结构；deny-tier 由 `judge-row-view.test.ts` 覆盖（实机无 deny-tier 样本）；截图 `01_judge_deny_details.png` |
| **A3 工具行排版** | **PASS** | 实机 10+ `.tool-call-record`：summary 高度 **24px**、单行；`.tool-call-target` `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`；`.tool-call-status` 同 nowrap；长命令显示省略号且 title 保留全文（`tool-row-text.ts`）；`tool-row-text.test.ts` 6 例全过 |
| **A4 展开详情重排** | **PASS** | 实机 deny 判断卡展开：分区「命令原文 / 判断理由 / 替代方案 / 客户说明 / 证据」，命令作为代码块 **1 次**，证据列表已过滤与命令相同项（理由正文引用命令属判断内容，不是重复控件）；实机工具详情：时间线 `18:35 调用发起 → 18:35 执行完成 · exit 0`、实际命令 1 次、退出码、stdout 21 行 + `+9` 折叠；`tool-details-view.test.ts` 7 例另覆盖 stderr 分区、命令只出现一次、结果与 stdout 去重；截图 `01`、`02` |
| **A5 输入框聚焦冷色** | **PASS** | 实机 focus `#inp-message`：`.capsule` border `rgb(134,197,227)`（`--info #86c5e3`）、box-shadow `rgb(79,134,163) 0 0 0 2px`（`--info-border #4f86a3`）；textarea `outline-style: none`；截图 `03_composer_focus.png`；`tool-row-text.test.ts` 的 composer 用例同口径 |
| **A6 角色工作态** | **PASS** | 实机捕获工作态（统筹/主理）：`.ti-avatar.is-working` border `rgb(94,224,176)`、呼吸环 box-shadow、`animation-name: ti-working-breathe`；`.role-status-chip.is-working` 绿字/绿底/绿边；工作行 `background-color: rgba(0,0,0,0)`、`box-shadow: none`、无左边框；选中行仍为 `inset 2px 0 0 var(--primary)`；截图 `04_work_overview_panels.png`；`role-status-view.test.ts` 9 例及 CSS 断言全过 |
| **A7 后台任务运行时/编排透传** | **PASS** | `src/model/runtime.ts:69-87` 三可选方法；`src/service/runtime/session.ts:389-402` 转调同一管理器、disposed 前置检查、无管理器 `closed` 不抛；`run-role.ts:1623-1640`、`govern-session.ts:383-400` 条件展开原样透传（无实现保持 undefined）；`background-session-access.test.ts` 3/3、`session-handle.test.ts` 2 例、`governance-session.test.ts` 1 例全过 |
| **A8 后台任务桌面面** | **PASS（契约/单测）；真实 IPC E2E NOT VERIFIED（待重启）** | 契约：`SessionManager.listBackgroundTasks` 以 `capable===0` 返回 `unavailable:true`，与「有会话无任务」区分；`readBackgroundTask` 未知任务 `ok:false`；`stopBackgroundTask` 原样返回底层结果（测试断言同一引用，含 `unknown-task`），找不到会话 `closed`、无能力 `unavailable`；Interface 参数校验齐全；main 三 handler 有 `event.sender === win.webContents` 校验；preload 三白名单方法。测试：`session.test.ts` 2 例 + `interface.test.ts` 2 例全过。实机：工作概览「后台任务」区块存在，但因主进程未重启调用 `background-tasks:list` 得到 `No handler registered`，面板如实显示失败（未伪装空态）；真实列表/日志/停止与入口计数均未验证 |
| **A9 流程状态** | **PASS（接口只读/逻辑）；真实 IPC 与头部徽标实数据 NOT VERIFIED（待重启）** | `interface.ts:5444-5527` 只 readdir/readFile/stat/sha256；ENOENT/ENOTDIR ⇒ 空列表；坏文件逐文件进 `errors`；`flow:status` handler 有来源校验且只传字符串；preload 仅 `getFlowStatus`。独立脚本直接调用 Interface 读取真实项目 `demos/wukong-2d/docs/flows/wukong-2d.yaml`：解析 26 步（done 16、superseded 8、pending 2、current 空），文件 sha256/大小/mtime 调用前后完全一致（READ_ONLY=UNCHANGED），头部徽标逻辑得 `16/26`；单测 `flow-status.test.ts` 覆盖 `12/19`、七态、默认过滤、5s/30s 与隐藏跳过。实机面板存在但因无 handler 显示失败；真实 `flow:status` 与头部徽标实数据未验证 |
| **A10 i18n** | **PASS** | `ui.background.*` 26 key、`ui.flow.*` 22 key、`main.backgroundTasks.unavailable`、`main.flowStatus.*` 成对存在（zh/en）；新增契约测试 4 组；i18n 51/51；术语「判断 agent」→「自动代理」已落在共享 i18n 与三处编排判断文案；源码/渲染层 UI 文案无旧词残留（`shell.css` 仅剩一条注释） |
| **A11 测试与文档** | **PASS（测试）；文档缺口（非阻断）** | 本报告 §四为独立实测；运行时核心/桌面窗口/项目管理文档已更新且与实现一致；缺桌面UI 2026-10-25 变更记录与编排透传记录（§九.2）。实现者若干自述与实测不一致处已按实测修正记录（§四） |

**FAIL 项：无。**

## 六、其他随批 UI 履约点（客户清单「包括但不限于」之外发现的同批改动）

以下改动在同一工作树内，客户要求「所有变更都要独立验收」，故一并记录；除注明外由桌面UI plan A0–A4/B1–B5/C1–C5 覆盖，本次以单测 + 实机抽查判断：

| 履约点 | 结论 | 证据 |
| --- | --- | --- |
| 上下文状态去重（`#context-state` 只显示上下文；`#history-projection-note` 只显示投影诊断） | PASS | 实机 `#context-state` 文本「已从本地恢复模型上下文」，`#history-projection-note` 空且 hidden，二者不重复；`#context-state` 保持 `role=status aria-live=polite` |
| 助手消息角色/时间 meta | PASS | 实机 `.msg-meta` 含头像首字 + 角色名；`at` 缺失时不显示时间（不伪造） |
| 托管开关 chip + 可见分组标题 | PASS | 实机 `.composer-trust[role=group][aria-label=托管]`，两个 32px chip「替我审批中 · 自动代理 / 替我决策中 · 自动代理」；截图 `03` |
| 宽屏抽屉推挤（≥1200px） | PASS（目测） | 1385px 窗口打开抽屉时聊天列收窄、头部按钮仍可见、抽屉不覆盖正文；截图 `04` |
| 治理状态模型 chip、抽屉关闭图标、工作概览空态卡 | PASS（目测） | 实机 `.gov-chip`、`#drawer-close` 图标、`.work-empty` 虚线卡；截图 `04` |
| 治理反馈 `clientProjection` / 指纹（桌面窗口 A3/A4） | PASS（单测）；实机投影卡未单独复核 | 单独复跑 `test/桌面应用/session.test.ts` **37/37**（含治理反馈投影与后台任务聚合用例；全桌面套件 602/602）；字段可缺省、未命中不改事件 |
| 确认卡按钮等权、200% 缩放/对比度、窄屏抽屉覆盖 | NOT VERIFIED | 本轮未制造确认卡，未做 200% 缩放与窄屏实机复核 |

## 七、CDP 实机抽查（只读；未重启主进程）

页面：`file:///…/app/renderer/dist/index.html`，窗口 1385×864，`document.visibilityState=hidden`（应用窗口在后台）。操作限定：读 DOM/计算样式、展开 `<details>`、聚焦输入框、开关抽屉；未触发发送、停止、模型调用或任何写操作。

| 截图 | 内容 |
| --- | --- |
| `docs/change/2026-10-25_app-ui-background-flow-evidence/00_initial.png` | 初始聊天视图（基线） |
| `…/01_judge_deny_details.png` | deny 判断卡展开：盾牌 X、judge 代批徽标、命令原文/判断理由/替代方案/客户说明/证据分区 |
| `…/02_tool_details_structured.png` | 工具详情：时间线、实际命令、退出码、stdout 21 行 + 折叠 |
| `…/03_composer_focus.png` | 输入框聚焦冷色环（`--info`）与托管 chip |
| `…/04_work_overview_panels.png` | 工作概览：工作态 chip/头像环、宽屏抽屉推挤、流程状态/后台任务区块（失败态：no handler） |

证据脚本：`…/cdp.mjs`、`inspect.mjs`、`q1.mjs`–`q8.mjs`、`flow-real-check.mjs`。其中工作态样式探针在临时节点上测量后立即移除，未改应用状态；`flow-real-check.mjs` 直接以 node 调 `DesktopInterface.flowStatus` 读真实项目并做前后哈希对照。

## 八、未验证项（不得写成通过）

| 项 | 状态 | 原因/后续 |
| --- | --- | --- |
| 真实 `background-tasks:list/read/stop` IPC | **NOT VERIFIED（待主进程重启）** | 当前窗口调用得到 `No handler registered for 'background-tasks:list'`；handler 只在 `app/main.ts` 启动时注册。需重启后以真实会话任务验证列表/日志/停止/kill-timeout |
| 后台任务面板真实数据、日志展开、停止二次确认、入口计数 | **NOT VERIFIED（待重启 + 真实任务）** | 面板错误态与纯逻辑单测通过；无真实 handler/任务 |
| 真实 `flow:status` IPC 与头部 `16/26` 徽标 | **NOT VERIFIED（待重启）** | Interface 直调真实项目与徽标纯函数已通过；实机 handler 未注册，徽标因错误隐藏 |
| deny-tier 判断卡实机样本 | **NOT VERIFIED（仅单测）** | 当前历史只有 allow/deny；`judge-row-view.test.ts` 覆盖 deny-tier |
| 工具失败卡实机样本 | **NOT VERIFIED（仅单测）** | 当前可见历史无失败工具行；代码与 16 例单测覆盖 |
| Electron e2e（phase3b/4a/4b/5a、uiux-v2、main.mjs） | **NOT VERIFIED（本轮未跑）** | 客户交接要求本轮不重启主进程；这些 e2e 需另起 app。实现者记录的 e2e 结论未由本角色复跑 |
| 窗口隐藏时的徽标刷新策略（实机） | **NOT VERIFIED（实机）；代码+单测 PASS** | flow 30s 轮询在 `visibilityState=hidden` 时跳过、`visibilitychange` 时补拉（`flow-status.test.ts`）；后台任务入口计数为一次性/事件驱动刷新，长期运行退出后可能短暂陈旧（§九.3） |
| 并发在飞的 `request_acceptance` 工具变更 | **NOT VERIFIED（非本批、未完成、未验收）** | 验收期间 19:45–19:47 出现在工作树（§2.1）；不在客户本批清单内，仍在实现中。不纳入本批结论，完成后需另立验收 |
| 200% 缩放对比度、窄屏覆盖抽屉、确认卡按钮层级、真实 OS 级不可杀进程 | **NOT VERIFIED** | 不属客户本次点名范围；未改实现，也不据此声称通过 |

## 九、剩余风险与问题

### 9.1 非阻断：`readBackgroundTask` 对未知任务返回「服务不可用」文案
`app/desktop/session.ts:1126-1129` 在底层返回 `undefined`（未知/已过期 taskId）时回 `main.backgroundTasks.unavailable`。契约只要求 `ok:false`，但 UI 会显示「读取日志失败：后台任务服务不可用」，把「任务不存在」说成「能力不可用」。建议桌面窗口后续区分 `unknown-task` 文案；不影响 stop 的 `unknown-task/closed/timeout` 原样透传，也不影响本批通过。

### 9.2 文档缺口（非阻断，需补）
- `角色卡/桌面UI/` 无本批 change 记录：后台任务面板、流程状态面板、工具失败/判断行/工作态、聚焦色等仅有 design 截图与 plan §7；建议补 `2026-10-25_change_*.md`，状态从 `implemented-unverified` 更新。
- `角色卡/编排/` 无本批透传记录/api-spec 说明；建议补一行契约说明（三方法纯透传、未实现保持 undefined）。

### 9.3 入口计数刷新策略（残余风险）
`ChatHeader` 的后台任务计数只在 `projectRoot/runtime/locale/anyRoleBusy` 变化时拉一次，不是周期轮询；任务在角色空闲时自然退出，入口角标可能短暂显示旧值，直到下一次 busy 变化或打开面板。flow 徽标有 30s 轮询与可见性补拉，无此问题；窗口隐藏时两者都不轮询（flow 由 `visibilitychange` 补拉，后台计数无补拉）。建议桌面UI评估是否给后台角标加低频轮询或可见性补拉。

### 9.4 i18n 守卫的口径风险
`app/renderer/src/chat/tool-error.ts` 为通过「allowlist 之外不得出现中文」守卫，把旧版中文解析词汇写成 `\u` 转义（运行时仍是中文）。这些是解析词表而非 UI 文案，风险低；但守卫源码扫描按字面中文判定，转义可绕过其本意。建议项目管理决定是否给该文件正式豁免/数据化词表，而不是依赖转义。

### 9.5 过程风险：事后标准
本批没有实施前固定的验收标准，A1–A11 是验收时按客户交接文字固定的。下一批建议先在本角色 `docs/design/` 固定标准，再实施与验收，避免「按结果调标准」的质疑。

## 十、总体结论与返工归属

- **总体结论：有条件通过。** 所有可独立执行的测试与抽查通过，未发现 A1–A11 的行为性 FAIL；两个真实 IPC 面（后台任务与流程状态）及依赖它们的头部徽标/面板数据仍需主进程重启后的 E2E 证据，按 NOT VERIFIED 记录。
- **FAIL 项：无。**
- **返工归属**：
  - 行为返工：无。
  - 文档补证：桌面UI（本批 change 记录）、编排（透传记录/api-spec）。非阻断。
  - 可选改进：桌面窗口（未知任务 read 文案，§9.1）；桌面UI（后台入口计数刷新，§9.3）；项目管理/桌面UI（i18n 守卫口径，§9.4）。
- **未验证项**：见 §八，逐项保持 NOT VERIFIED，不因本轮通过而消失；并发在飞的 `request_acceptance` 变更不在本批结论内（§2.1），需完成后单独验收，提交/发布前应在冻结候选上重跑受影响门。
- **通过范围**：Windows 11 上的类型检查、桌面应用/桌面UI/运行时后台任务/判断验证/i18n 测试、Interface 直调真实流程 YAML、以及 9225 页面上的只读 DOM/样式抽查。不覆盖真实主进程 IPC E2E、真实模型/任务会话、非 Windows、打包/发布。
- **权限**：本结论不授权提交、推送、合并、部署或发布；发布决定属客户。本角色只写自身边界内文档与证据。

## 关联

- 桌面UI 实施计划（A0–A4/B1–B5/C1–C5）：[2026-10-25_plan_chat-panel-adjustments.md](../../../桌面UI/docs/design/2026-10-25_plan_chat-panel-adjustments.md)
- 桌面窗口实施与契约：`角色卡/桌面窗口/docs/change/2026-10-25_change_chat-panel-adjustments.md`、`角色卡/桌面窗口/api-spec.md`
- 运行时核心会话访问面：`角色卡/运行时核心/docs/change/2026-10-25_change_background-task-session-access.md`、`角色卡/运行时核心/docs/feature/background-tasks.md`
- 后台任务既有验收标准：[2026-10-22_design_background-tasks-acceptance.md](../design/2026-10-22_design_background-tasks-acceptance.md)
- 本批证据目录：[2026-10-25_app-ui-background-flow-evidence](2026-10-25_app-ui-background-flow-evidence/)
