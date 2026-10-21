---
id: change-ui-platform-phase4b-governance-receipts
type: change
title: Phase 4B 变更记录——治理三权/镜像/排队聚合、治理记录、报告全文与回执、锚点与收尾
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: delivered（4B 范围内；全量双端/Phase 5 未执行）
related: [ui-platform-phase4b-scope, ui-platform-phase4b-design, ui-platform-round-review, ui-contract-surface, ui-components, check-ledger-phase3a]
events:
  - date: "2026-10-21"
    kind: implemented
    summary: 按 PM §十五放行实施 4B：解冻 chat-store/ChatRow/ChatStream/confirm-store/events（最小）等，新增治理/报告/锚点纯逻辑与面板、phase4b.css、扩展点、驱动；uiux-v2 五角色与 C2 重锚；门禁与证据执行
---

# Phase 4B 变更记录：治理三权、镜像、治理记录、报告与回执

**授权**：PM [4B 复核与放行 §十五](../../../项目管理/docs/design/2026-10-21_review_ui-platform-round.md)（含 §15.1 解冻边界、§15.2 五角色、§15.3 聚合落点、§15.4 菜单缓存、§15.5 治理宿主、§15.6 C2、§15.7 门子集、§15.8 组合组件、§15.9/§15.10）。范围与写集：[4B 范围](../../design/2026-10-21_design_ui-platform-phase4b-scope.md)；设计：[UIUX 4B 附录](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase4b-design.md)。**不包含 Phase 5**：`main.mjs`、全量双端逐 check、生产入口切换、打包/发布/安装包、真实模型/网络/`.env`、Windows/DPI/屏读最终验收。

## 一、交付摘要

- **QUEUE_VIEW / operator 聚合**：`chat-store` 行模型 + `ChatRow` 渲染唯一 `.op-queue-aggregate`（trio 主入口），原位更新、不可聚焦/无按钮/无请求内容；`queuedDebug()` 插入序；切引擎/项目清空且 runtime 快照不重放（`runtime-view.replayRest` 移除 queued 重放）；呈现/expired 后移除；同 id 不与可操作卡重复计数。
- **治理三权卡/镜像**：治理 meta（`.op-gov-badge/.op-meta`：流程/步骤/权力类型/将写路径/摘要/哈希，缺省不显示）、镜像面（`.is-mirror`、`data-surface-role-id`、`.op-mirror-badge`「镜像 · 主入口」、`.op-mirror-source`「来自 <角色> 的治理决定 · 客户最终批准」）；同一 `data-request-id` 源面/镜像面共用一个条目：任一侧作答只发一次 `operatorRespond`，双面冻结；重复提交由 shared `state`（open/submitting/decided/expired）挡住；排队请求不物化可操作卡（防御卡显示「等待前一个决定」且无动作）。
- **治理记录建立/重新接受/迁移预览**：`#governance-status`（ChatHeader）+ 唯一非模态 `#governance-preview`（class 精确 `governance-preview`、无 backdrop/焦点陷阱、Esc 回触发）；建立（single/trio 选择、写入/pin/采纳既有文档/旧格式/声明、canConfirm）、重新接受（逐文件 modified/missing/unreadable、pin 重算、warning、blockers、64hex digest、取消零写、确认一次）、迁移（模型/字段/manifest/pin/保留/摘要前 8 位；本版 `not-available` 如实）；`phase === "write"` 绝不声明零写入/成功；ChatStream 空态复用 `.chat-empty`（pin-mismatch/无记录/不可用/治理角色说明）；`governance:next-step` 只显示状态行。
- **报告全文 / persistence / delivery 回执**：`ReportCard/ReportBody`（来源/声明/任务/轮次/摘要 180 字 4 行/flags/证据/来源文档/报告存储/独立验收「尚未确认」）；`report-store` 按 scope×reportId/attemptId 缓存，saved 不被迟到 pending/failed 覆盖，失败可重试（同卡原位），`report-persistence-updated`/`delivery-history-updated` 经扩展点更新；`DeliveryCard`（批次标题「本批 N 份（不表示全部收齐）」、接收历史/目标输入记录/目标轮次结果、安全显示副本 flags、历史重试、expired 不保留假重试）；`task-request`/`reply-original` 仅按真实报告精确 turnId + settled/回放折叠，报告声明本身不折叠活跃消息；历史报告按时间排序（未知时间保线上序）、按真实身份去重。
- **judge 跨引擎历史重放**：`confirm-store` 增加结果 sink，`ipc.ts` 先记每引擎缓存再落地当前视图；切回旧引擎按到达序重放（chat-store 同 id 幂等），不跨引擎泄漏。
- **`replayAnchorDebug`**：`driver-extensions/replay-anchor.ts` 接 `anchor-view`；历史回放按 `anchorKey`/`anchor` 登记请求/结论行索引；交互卡物化按 `toolCallId → anchorKey → 尾` 落位，插入后锚点索引右移；full 重建保留原卡行对象（DOM 复用）并按锚点回插。
- **single 警告刷新**：`confirm-store.installGovernanceModelWatch()` 在 single↔trio 变化时重算一次性警告已确认键；single 立即禁用 decision 并从警告中移除「替我决策中」旧行；回 trio 可用，下一次开启重新提示一次，不持久化。
- **菜单配置状态**：`settings-store.menu` per-engine 摘要（按需读取/缓存/项目守卫），`EngineSelect` 菜单 208px 两行、状态文字「已配置/缺配置/配置未知/检查中…」；读取失败显示「配置未知」；不导入预取，保持 SELECTOR 读取次数断言。
- **queueView 顶层 tab 切换**：`drawer-store.openTab/openSettingsDrawer/openDocumentList/backToRole` 统一清空 `queueView`；ChatHeader `tab-work/tab-card` 经 `openTab`；抽屉保持打开、标题/焦点正确。
- **C2 重锚（文件桌面UI、口径测试提出/PM 批准）**：`uiux-v2` 将 `expired old shell shown disabled in its own runtime` 重锚为 `expired old shell collapses with reason visible in its own runtime`（卡收起 + `composer-hint` 原因可见），并同步重锚跟随断言为「收起后不暴露 sc-allow/sc-close、Esc 不回包」；不再保留与 2026-10-18 批准语义冲突的红色期望。原因可见的实现：`confirm-store` 记录曾出现的 shell id（含异引擎缓存），失效回执即使当前卡已被清也写 composer-hint。
- **五角色重锚（PM §15.2）**：`uiux-v2` MIRROR 夹具加 `verifier`，治理组期望 `rapporteur,nominator,convener,verifier`，状态行「治理模型：三权 · 五角色」，检查名改 five-role，显示名与 `role-view.ts`/README v1.4.0 一致（主理 / Lead 等），删除四角色双期望。

## 一之二、独立验证 needs-work 修复（2026-10-21 返工）

- **真红 1（C2 原因不可见）**：`confirm-store` 新增 `knownShellIds`（`receiveShell` 与 `ipc.handleShellConfirm` 的异引擎缓存路径均登记）；`expireShell` 在「当前卡已被清」时仍按已知 shell id 写 `composer-hint`，非 shell 的 operator 失效不写。`uiux-v2` RUNTIME 段 **17/17**：`expired old shell collapses with reason visible in its own runtime` pass，新增配套断言「收起后无 sc-allow/sc-close、Esc 无回包」pass。
- **真红 2（已答卡锚点丢失）**：`appendOperatorRequest` 建行即保存 `anchorKey`（源面；镜像面不参与源角色锚点表）与 `anchor:"request"`；full rebuild 的 operator 回插按该锚点生效、结论索引右移。4B 冒烟新增最小复现（前插历史 → full rebuild）：同一 DOM 卡保留、`op.index===requestIndex+1`、`conclusionIndex===op.index+1`、卡仍冻结。
- **UIUX 1（960 五角色行重叠）**：`phase4b.css` 令 `#role-tree > .tree-group-block/.tree-item` 不收缩、`ti-power/ti-builtin` 可换行；冒烟在 1360/960/200% 断言行 rect 不重叠、树与行无横向溢出；截图 `phase4b-960-five-role-tree.png`、`phase4b-200pct-five-role-tree.png`。
- **UIUX 2（200% 横溢假通过）**：冒烟改为逐容器断言 `#chat/.chat-head/.head-inner/#right-body` 的 `scrollWidth<=clientWidth+1` + documentElement，并断言 `.head-inner` 换行；`phase4b.css` 增加窄视口头部换行/抽屉 `min(424px,100vw)`/工具与报告内容可换行；截图 `phase4b-200pct.png`、`phase4b-200pct-report.png`、`phase4b-200pct-governance-preview.png`。
- **UIUX 3（facts 标签值粘连）**：`.report-facts > div` 采用 inline-flex + 4px 间距，`dt::after` 提供「：」（伪元素不进 `textContent`，不改变交付三列逐字断言）；720px 以下单列。冒烟在 1360/960 断言伪元素与 flex 布局；截图 `phase4b-1360-report.png`、`phase4b-960-report.png`。
- **UIUX 4（预览取消不回焦）**：`GovernancePanel` 取消按钮统一走 `cancelPreview`（`cancel()` + 回触发元素），与 Esc 同焦点语义；冒烟在常规与 200% 两处断言取消后 activeElement 为 `#governance-status [data-governance-reaccept]`。
- **UIUX 5（200% 左树不可见 / 缺配提示被裁 / 检查假通过）**：`phase4b.css` 在窄视口令 `.col-left` 纵向可滚动、`#role-tree` `min-height:140px`、`--gutter:12px`、缺配条/治理状态行换行且按钮独占下一行并压缩上下 padding；冒烟把 `.runtime-config-notice/.governance-status/#role-tree/.col-mid/.session-notice/.composer` 纳入逐容器 `scrollWidth<=clientWidth+1`，断言缺配提示全文（`msgSH<=msgCH`）与按钮 bottom 在首屏内、树 `clientHeight>0`、选中行/末行可通过左栏滚动进入屏幕且行不重叠；截图 `phase4b-200pct.png`、`phase4b-200pct-five-role-tree.png`（左树可见、提示全文与按钮完整）。
- **UIUX 6（200% 报告/预览截图未展示目标 / details 内部溢出）**：窄视口令 `.col-mid` 纵向滚动、`#chat` 保持 240px 可读高度；报告动作纵向排列（来源按钮/完整摘要各占整行），`report-complete-body/.hb-complete-summary/.hb-evidence` 纳入展开态内部无横溢断言并允许卡内纵向滚动（表格局部横向滚动标注）；冒烟先滚到报告卡、展开完整摘要与证据后截图，治理预览先 `scrollIntoView` 再截图；960 报告滚到 facts 并断言标签/值在聊天视口内；截图 `phase4b-200pct-report.png`、`phase4b-200pct-report-details.png`、`phase4b-200pct-governance-preview.png`、`phase4b-960-report.png`。
- **证据表述更正**：COMPLETE_FLOW 改为「官方到达 5/12；只读补证副本跳过 P7 两个 Phase 5 检查后 12/12，行为通过但未在官方段到达」；默认段注明官方止于 Phase 5，补证副本（仅跳过虚拟窗口阅读/开合断言）100 checks PASS 到达并覆盖 denied anchor/B1/B2/B3。

## 二、文件清单

### 2.1 新增（`app/renderer/src/`）

| 文件 | 用途 |
| --- | --- |
| `chat/governance-view.ts` | 治理动作/状态/空态/预览/迁移/失败 phase/卡 meta/镜像/聚合文案（纯逻辑） |
| `chat/operator-view.ts` | 镜像面/同 id 去重/排队计数/终态与重试文案/pending surfaces（纯逻辑） |
| `chat/report-view.ts` | 报告身份/声明/预览/flags/persistence 矩阵/交付事实/安全副本/历史投影摘要（纯逻辑） |
| `chat/anchor-view.ts` | 回放锚点表、插入位、插入后索引右移（纯逻辑） |
| `stores/governance-store.ts` | 预览打开/模式/模型选择/loading/busy/项目守卫/结果/next-step |
| `stores/report-store.ts` | 报告持久化/交付回执缓存（scope/report/attempt 键、晚到丢弃、重试） |
| `shell/GovernancePanel.tsx` | `#governance-status` + 非模态 `#governance-preview` |
| `shell/ReportCard.tsx` | `ReportCard/ReportBody/DeliveryCard`（报告全文/证据/持久化/交付） |
| `shell/phase4b.css` | 4B 样式（治理/镜像/聚合/chip/报告/交付/菜单/960/200%） |
| `chat/extensions/reports.ts` | 持久化/交付推送 → report-store（4A glob 自动注册） |
| `chat/extensions/governance.ts` | `governance:next-step` → 状态行（4A glob） |
| `driver-extensions/replay-anchor.ts` | `replayAnchorDebug`（4A 驱动扩展合并） |
| `driver-extensions/governance.ts` | `governance` 驱动（真实 store） |
| `test/桌面UI/{governance-view,operator-view,report-view,anchor-view}.test.ts` | 4B 纯逻辑单测 |
| `test/桌面UI/phase4b-electron-smoke.mjs` + `phase4b-smoke-preload.cjs` | 4B 离线 Electron 冒烟（53 项 + 1360/960/200% 截图） |

### 2.2 修改（含 PM 批准解冻）

| 文件 | 4B 实际改动与边界 |
| --- | --- |
| `chat/chat-store.ts`（解冻） | operator 共享条目/镜像面/decided 状态与只答一次；`queuedOperator` 删除/清空与聚合同步；报告/交付行/scope；历史报告排序与身份去重；task/reply 折叠与显式展开保持；锚点表与卡回插；full 重建保留未覆盖实时行与 operator 行；`historyProjection` 注记；上下文恢复文案对齐旧口径。未做 store/行模型重构，未改行高/虚拟窗口。 |
| `chat/ChatRow.tsx`（解冻） | 治理卡 meta/镜像/排队/预览/提交态；聚合行；报告/交付卡组合；user/assistant 折叠；display 生命周期相位合并渲染（tool-call-record）；历史 failed 直显首行安全摘要。未改工具组折叠/懒挂载/虚拟窗口。 |
| `chat/ChatStream.tsx`（解冻，最小） | 治理空态（mismatch/无记录/不可用/治理角色说明）；`#op-chip` 定位；`tool-current` 文案「正在工作」+ chip 可见时让位；抽屉覆盖由卡自身 `inert`。未改滚动/贴底/行分发。 |
| `chat/events.ts`（解冻，最小） | 新增 `delivery` 行分类、历史锚点字段、display 生命周期（v1/不支持版本）与特殊工具 barrier、文本投影/元数据省略、历史 denied 安全首行。既有行分类语义保持。 |
| `chat/ipc.ts` | judge 结果 sink（每引擎缓存/重放）、项目切换清 report-store/governance 预览、模型 watch 安装；扩展注册保持 4A 机制。 |
| `chat/runtime-view.ts` | 重放顺序去掉排队事实（快照仍可记录，不复活旧 queued）。 |
| `stores/confirm-store.ts`（解冻） | judge 结果 sink；`installGovernanceModelWatch`（single↔trio 一次性警告刷新）；双开关主进程权威保持。 |
| `stores/drawer-store.ts` | 顶层 tab 切换清 `queueView`（openTab/openSettingsDrawer/openDocumentList/backToRole）；back-list 微任务聚焦回原阅读按钮。 |
| `stores/settings-store.ts` | per-engine 菜单摘要缓存/状态/项目守卫；`menuConfigStatusText`；面板 load 同步摘要；projectChanged 重置。 |
| `shell/ChatHeader.tsx` | 挂载 GovernancePanel；tab-work/tab-card 经 drawer-store（清 queueView）；context title 用 `contextWarning`。 |
| `shell/EngineSelect.tsx` | 菜单打开按需读取未缓存/未知引擎；208px 两行状态文字；极小视口最小 56px 保证活动项完整可见（读取次数断言不变）。 |
| `lib/platform.ts` | 只读声明 4B preload 方法（治理/持久化/交付/事件）。 |
| `chat/types.ts` | RowKind 增 `delivery`/`queue-aggregate`；行锚点字段；ActivityItem display/label/投影字段；RoleMeta.contextWarning。 |
| `chat/work-view.ts` | pending 按 surfaces 计数；最近回交含交付批内真实报告（身份去重）。 |
| `test-driver.ts` | 驱动扩展 glob 修正为 `./driver-extensions/*.ts`；`state.governancePreview`；`unimplemented=[]`。 |
| `test/桌面UI/runtime-view.test.ts` | 按 PM §15.3 更新重放期望（queued 记录但不重放），非弱化。 |
| `test/桌面应用/e2e/uiux-v2.mjs` | MIRROR 五角色重锚；C2 重锚；SELECTOR 菜单宽度 180→208（4B 设计 §6.1，读取次数断言保持）；MIRROR 独立段关闭 recovery 夹具（与其它独立段同口径）并把 MIRROR/QUEUE 夹具改为先 load 后切引擎（真实切换语义）。 |
| `角色卡/桌面UI/docs/feature/*` | 契约面三态 #8/#12/#13/#14/#15/#17/#19/#20 与 4B 驱动/证据；组件台账 4B 节。 |

**明确未动**：`App.tsx`、`shell/shell.css`、`phase4a.css`、`Sidebar.tsx`、`main.tsx`、`components/ui/**`、`package.json`/`package-lock.json`、`app/main.ts`、`app/preload.cjs`、`app/desktop/`、旧渲染器核心、根配置、其他角色文件。旧渲染器/main/preload/desktop **零 diff**。

## 三、门禁与真实输出（2026-10-21）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 根类型检查 | `npm run typecheck` | exit 0 |
| 渲染类型检查 | `npm run typecheck:renderer` | exit 0 |
| 构建 | `npm run build:renderer` | 成功；`dist/src/index.html` + 1 JS + 1 CSS |
| CSP | 构建产物静态扫描 | `default-src 'none'`、`script-src 'self'`；无 unsafe/内联脚本；冒烟 `__smokeCsp` 0 |
| gzip 预算 | 入口引用 JS+CSS gzip9 | **284,814B ≤300KiB**（JS 265,774 + CSS 19,040） |
| 4B 纯逻辑 | `node --test "test/桌面UI/*.test.ts"` | **96/96**（4A 67 + 新增 29） |
| 旧基线 | `node --test test/桌面应用/*.test.ts` | **679/679** |
| IME | `ime-enter.mjs` 新入口 | 26 true / 0 false / `E2E_DONE=1`（24 项检查基线保持） |
| 懒挂载 | `test/测试/phase3a-lazy-toolgroup-check.mjs` | **10/10** |
| 4B 冒烟 | `test/桌面UI/phase4b-electron-smoke.mjs` | **70/70**；含 C2 收起+原因、已答卡 full rebuild 锚点最小复现、五角色 960/200% 树行不重叠且可见/可滚动、200% 逐容器（含缺配条/治理状态/树/col-mid/composer）无横溢、头部换行、缺配提示全文与按钮首屏内、报告卡可见+完整摘要展开内部无横溢、治理预览可见+取消回焦、facts 冒号分离；1360/960/200% 截图；零 console/CSP |
| bench | `bench-storm.mjs` 同机同日旧/新交替 3 轮 | 见 §四 |
| C1 | TOOLFOLD `fold anchor offsets` | **150→166，Δ=16px**（≤32，目标 ≤20） |

## 四、bench（同机同日，旧/新交替 3 轮）

| 指标 | 新（3 轮） | 中位 | 旧中位 | 阈值 | 结论 |
| --- | --- | --- | --- | --- | --- |
| stormA.maxGap | 17.8 / 17.6 / 17.9 | 17.8ms | 25.5ms | max(旧,25)=25.5 | pass |
| stormB.maxGap | 19.5 / 17.6 / 17.6 | 17.6ms | 17.7ms | 25 | pass |
| stormA_handler.maxMs | 0.5 / 0.7 / 0.4 | 0.5ms | 11.1ms | max(×1.2,+5) | pass |
| stormB_handler.maxBatchMs | 1.1 / 0.5 / 0.5 | 0.5ms | 1.1ms | max(×1.2,+5) | pass |
| replay.replayMs | 11.0 / 11.0 / 8.7 | 11.0ms | 20.6ms | max(×1.2,+5) | pass |
| scrollToBottom.ms | 6.9 / 1.2 / 2.3 | 2.3ms | 12.7ms | max(×1.2,+5) | pass |

p95 ≤19.5ms、单轮最大 ≤19.5ms（≤35/≤50 护栏）。

## 五、uiux-v2 新入口逐段结果（真实执行）

| 段 | 结果 |
| --- | --- |
| `ANS_QUEUE_VIEW_UI_ONLY` | **4/4 pass**（两个 queueed 2、切引擎不复活、重推 1、清空移除；`queuedDebug` 一致） |
| `ANS_MIRROR_UI_ONLY` | **8/8 pass**（五角色树/状态行/Liaison 空态/镜像同 id/只答一次/双面冻结/排队聚合/呈现移除并镜像） |
| `ANS_GOVERNANCE_REACCEPT_UI_ONLY` | **pass 7 reports**（状态行、空态、预览唯一非模态、取消零写、确认一次 digest、成功文案） |
| `ANS_JUDGE_UI_ONLY` | **33/33 pass**（回归） |
| `ANS_G2_RECOVERY_UI_ONLY` | **5/5 pass**（回归） |
| `ANS_SELECTOR_UI_ONLY` | **27/27 pass**（含读取次数、208px 菜单） |
| `ANS_CONFIG_UI_ONLY` | **21/21 pass** |
| `ANS_ROLE_RETURN_FOCUS_UI_ONLY` | **11/11 pass** |
| `ANS_SEND_FACTS_UI_ONLY` | **8/8 pass** |
| `ANS_TERMINAL_UI_ONLY` | **22/22 pass** |
| `ANS_TOOLFOLD_UI_ONLY` | **19/19 pass**（C1 Δ=16） |
| `ANS_FRESH_CONTEXT_UI_ONLY` | **4/4 pass** |
| `ANS_VISUAL_V2_UI_ONLY` | **54/54 PASS**：报告分层/摘要/状态/证据/source/持久化、声明不折叠、settled/迟到/任务折叠、本地刷新保持、接收报告批次、工作去重、SV13、冷报告反向/排序/未知时间；窗口/主题/几何/侧栏/树视口也全部通过（960 树行不收缩修复后）。 |
| `ANS_DELIVERY_NOTE_UI_ONLY` | 通过 7 项：十调用历史+匿名注记不新增第十一工具、旧匿名事件可追溯、真实 delivery note 系统事实、工具名/相位/真实失败保留、重建保留系统注记、相同进度事件不误升工具、旧 live 元数据仍为具名工具；随后止于 Phase 5 项 `builtin identity stays data and accessible without duplicate third visible line`（左树身份徽标，Sidebar） |
| `ANS_COMPLETE_FLOW_UI_ONLY` | **官方报告在 P7 中止**：4B C/P3 子集官方到达 **5/12**；只读补证副本跳过 P7 两个 Phase 5 检查后 **12/12**（C source 声明/同卡 saved、C target 安全副本/同卡保存、C expired 移除重试、C role/fallback/disabled、C outer ok inner failed、C 不可读报告、C expired 回执、P3 来源文档），行为通过但未在官方段到达。补证副本随后止于 Phase 5 「role reading fixture must really scroll」。 |
| 默认段 | `historical own-template failures direct` 与 `historical failure reasons visible without expand` 已修（安全首行/目标提取）；**官方段止于 Phase 5 `full replay preserves content identity`（虚拟窗口阅读锚点）**。只读补证副本仅跳过 Phase 5 虚拟窗口阅读/开合断言后 **100 checks PASS**，含 `denied conclusion anchor and decided card retained`、B1/B2/B3（待处理定位/op-chip/只答一次/expired）及 runtime/mirror 段；官方默认段未到达这些名。 |
| `ANS_RUNTIME_UI_ONLY` | **17/17 pass**：C2 重锚检查 `expired old shell collapses with reason visible in its own runtime` 通过，并新增「收起后不暴露 sc-allow/sc-close、Esc 无回包」配套断言（旧 shown-disabled 跟随断言同步重锚）。 |
| C2 | 新入口同名重锚检查 `expired old shell collapses with reason visible in its own runtime` **pass**（RUNTIME 段到达） |

**说明**：上述 VISUAL/DELIVERY_NOTE/COMPLETE_FLOW/默认段均在 4B 子集检查全部通过后，被 Phase 5 既有缺口（Sidebar 身份/树视口、虚拟窗口阅读锚点、角色树待选择文案）提前中止；这些文件不在 4B 写集（PM §15.1），未为过门而修改或弱化。剩余 4B 交付/回执项（expired 回执、P3 B 来源文档等）由 `phase4b-electron-smoke` 覆盖。

## 六、证据

- 冒烟报告/截图：[2026-10-21-phase4b-evidence/smoke/](../2026-10-21-phase4b-evidence/smoke/)（1360/960、五角色树、报告 facts、200% 头部/树/报告/完整摘要/治理预览）
- uiux-v2 逐段 report.json（含 RUNTIME 17/17、VISUAL 54/54、官方 DEFAULT/FLOW 与只读补证副本）：[2026-10-21-phase4b-evidence/uiux-v2/](../2026-10-21-phase4b-evidence/uiux-v2/)（`DEFAULT_SUPPLEMENT/`、`FLOW_SUPPLEMENT/` 为仅跳过 Phase 5 断言的补证副本，报告内保留了跳过的上下文）
- bench 原始 JSON：[2026-10-21-phase4b-evidence/bench/](../2026-10-21-phase4b-evidence/bench/)
- IME / 懒挂载：[ime/report.txt](../2026-10-21-phase4b-evidence/ime/report.txt)、[lazy/report.json](../2026-10-21-phase4b-evidence/lazy/report.json)

## 七、未实现/未验证（Phase 5 与真机）

- `main.mjs` 整机自检、全量双端逐 check 名对照、生产入口切换、打包/发布/安装包、Windows/DPI/屏读、真实模型/网络/`.env` 写入。
- 仍留 Phase 5 的既有缺口：DELIVERY_NOTE 左树身份徽标（`builtin identity…`）、COMPLETE_FLOW P7 角色树「待选择」文案（Sidebar 不在 4B 写集）；默认段官方虚拟窗口阅读锚点 `full replay preserves content identity`。VISUAL 段已随 960 树行不收缩修复全绿（54/54）。上述缺口的行为面已由 4B 冒烟/补证副本覆盖，但未在官方段到达。
- 4B 不改变 Phase 5 的发布/安装/全量等价声明；4B 通过后 Phase 4 完成，不等于最终验收。

## 八、边界声明

- 只写 `app/renderer/`、`test/桌面UI/`、`test/桌面应用/e2e/uiux-v2.mjs`（五角色/C2/208px/夹具顺序）与 `角色卡/桌面UI/`。
- 未改 `package.json`/`package-lock.json`、`app/main.ts`、`app/preload.cjs`、`app/desktop/`、旧渲染器核心、根配置、其他角色；零新增依赖、零新增 DOM 例外（仅既有延迟挂载 40 与失效卡 hidden）；未弱化断言。
- 解冻文件实际改动见 §2.2；`App.tsx`/`shell.css`/`phase4a.css`/`Sidebar.tsx` 保持冻结。
