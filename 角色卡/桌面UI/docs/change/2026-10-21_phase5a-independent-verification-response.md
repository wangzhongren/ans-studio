---
id: change-ui-platform-phase5a-independent-verification-response
type: change
title: Phase 5A 独立验证 needs-work 响应——A/B 组修复、C 组重锚映射、D 组等价
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: implemented（A 组 6/8 产品修复 + 2 项夹具重锚建议；B 组 2 项修复 main 全绿；C/D 映射交测试/PM）
related: [change-ui-platform-phase5a-gaps, ui-platform-phase5a-scope, ui-platform-round-review, ui-platform-phase5b-new-visual-audit]
events:
  - date: "2026-10-21"
    kind: fixed
    summary: 按独立验证 needs-work 与 PM §十八/UIUX 新端视觉审计修复：终端合并、项目重置、DUP/MERGE/NOTICE/BLANK、role reading、200% composer、统一转轮、锚点生命周期、session repair、诊断事件；重跑 uiux/main/门禁
---

# Phase 5A 独立验证响应

**输入**：测试 [5A 独立验证 needs-work](../../../测试/docs/change/2026-10-21_change_phase5a-independent-verification.md)、UIUX [新端视觉审计 needs-work](../../../UIUX设计师/docs/design/2026-10-21_design_ui-platform-phase5b-new-visual-audit.md)；只读核对 raw 报告与主进程 repair 归因。

## 一、A 组（8 项）

| # | 失败 | 根因 | 修复 | 复跑 |
| --- | --- | --- | --- | --- |
| 1 | TERMINAL_MERGE 同轮 denied+settled 两条「本轮已中止」 | `describeEvent` 把非工具 denied 一律 system；settled 独立 turn-terminal；full rebuild 保留实时终态又与历史 denied 并存 | denied/settled 有真实 turn+outcome 时统一 `turn-terminal`；`appendDescriptor` 同 turn+outcome 合并 sources；终态即使命中文本去重也走合并；full rebuild 将实时终态 sources 提升到同 turn 历史 sys-call 行并丢弃重复；`TurnTerminalRow` 按 sources 多行渲染 | **TERMINAL_MERGE 12/12 PASS** |
| 2 | PROJECT_RESET 新项目首 DOM 不清旧徽标 | `resetPanes` 未清 `roleMeta/roleBusy/queueByRole`；`loadProject` 仅路径变化才 fresh；跨项目 pending history 被 IPC 按旧项目丢弃 | 显式 `loadProject` 一律 fresh（`refreshProject` 传 `false`）；fresh 清角色状态；`handleHistory` 对异项目历史交 store 寄存，项目打开后重放 | **PROJECT_RESET 7/7 PASS** |
| 3 | DUP history-first+live 重复 | 同项目 `loadProject` 不重置；特殊工具 denied 未走生命周期；历史 user 行不认领本地乐观行 | fresh 语义（同上）；special tool/display denied 归 `tool-lifecycle` blocked 相位；`claimOptimisticUserRow` 增量回放绑定同文本乐观行 turnId | **DUP 32/32 PASS** |
| 4 | MERGE full rebuild 丢未持久 live 报告/卡 | `liveTextOf(handback)` 取 `data.text` 为空，保留扫描跳过 handback；特殊工具 denied 历史未合并 | handback 回退 `rowText`（报告摘要）保留；blocked 历史按特殊工具生命周期合并；卡/终端/报告均在；旧 DOM 节点身份断言按 PM §十九批准重锚 | 修复前旧断言止于 `window.__mergeCard` 同一 DOM；PM §十九批准后已由桌面UI 重锚为同 `data-request-id`+`data-state=open`+confirm 可见（无 borrowed token），后续 `background legacy rebuild keeps exact decided DOM` 同因重锚为同 request id + 已决状态 + `replayAnchorDebug` 索引；**MERGE 段 12/12 与默认段 110/110 全过**；产品行为由 main `ANCHOR_*/OPEN_CARD_*` 全 true 覆盖 |
| 5 | NOTICE live 系统通知落用户气泡 | `classifyInjected` 未实现 `【系统通知·子类】`；注入行只有 `.msg-injected` 样式 | 补系统通知分类（子类≤16、正文到空行、remainder 用户正文）；`appendDescriptor` 拆 sys-notice + user 两行；`InjectedRow` 渲染 `.sys sys-notice` + `.sys-notice-badge`/`.sys-text`；补 CSS | **NOTICE 6/6 PASS** |
| 6 | BLANK 后台 pane 无 queue/status | 未给后台角色建模型；paneDebug `empty/loadingText/text` 未计队列/busy | `applyRoleState` 建空模型；paneDebug 计 queue/busy、loading 文案「正在载入会话历史…」、text 含队列摘要；ChatStream loading 同步 | **BLANK 6/6 PASS** |
| 7 | DEFAULT toggleDrift `anchor paragraph materialized 960` | 阅读锚点已稳定（before/after offset 差 0）；失败点是旧断言要求 `.msg` 直接挂 `.chat-pane`，新渲染器为 `.chat-row` 包裹 | 产品不改；**重锚方式**：`parented: !!n.closest('.chat-pane')`（等价且更强：仍在 pane 内）。该重锚落地后默认段 **110/110 全过**（含 denied anchor/decided card） | 已由桌面UI 按 PM §十九批准落地 `closest('.chat-pane')` 重锚，**默认段 110/110 全过** |
| 8 | COMPLETE_FLOW role reading must scroll | `openTab` 打开抽屉未同步提交，`#right-body` 仍 `display:none` 时设置 scrollTop 被丢弃；同面板 nonce 又用 saved 0 覆盖 | `openTab` 用 `flushSync` 提交；Drawer 外层滚动改 `useLayoutEffect`，同目标 nonce 不覆盖已滚动位置；`locateRequest` 同步摘 inert + 关抽屉不抢焦点 | **COMPLETE_FLOW 41/41 PASS**（含 P7/角色 reading/1360/960 布局） |

## 二、B 组（2 项，main 全绿）

- **SESSION_REPAIR×5**：`selectRole` 不再在 `alreadyOpen && alreadyLoaded` 直接短路；显式同角色点击仍调一次 `bridge.openSession` 确认/重开，保留历史/行模型。发送失败遵循主进程 `sessionCurrent`：显式 true 保留句柄（SEND_FACTS 的未接受拒发），缺省/false 才 `invalidateSession`，下次发送前补开；补开失败保留输入/附件、不发送、不追加用户气泡、只追加失败 system 行（fail-closed）。
- **DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS**：新增 `chat/diagnostics.ts`（只经 preload `reportDiagnostic`）；`ipc` 上报 `renderer.replay`（history count/plan）、`renderer.recovery`、全局 `renderer.event-error`；`VirtualPane` 上报 `renderer.viewport`；Composer 发送异常上报 `renderer.event-error`。字段均在桌面窗口 `RENDERER_FIELDS` 白名单内。
- **main.mjs 新端最终：`E2E_FAILURES=`（空，exit 0）**；repair 段 5 项 SESSION_REPAIR + PENDING + RECOVERY_OLD/ENDED/SAME + DIAGNOSTICS 全 true；`DRAWER_ESC_CLOSES=true`、`TAB_CARD_ACTIVE/TAB_WORK_ACTIVE=true`、`ANCHOR_TABLE_REGISTERED=true`、`ANCHOR_*`/`OPEN_CARD_STABLE_AT_ANCHOR/CHIP_VISIBLE=true`、`DENIED_OPEN_COUNT=0`、`HAS_DENIED_INLINE=0`、`INJECTED_CHIP_LABEL=回交投递 · 来自 规划者`。

## 三、C 组 design audit 10 条重锚映射（UIUX 批准口径）

测试仍用旧 DOM，需测试/UIUX 在 `test/桌面应用/e2e/uiux-design-audit.mjs` 落地；本轮提供精确新 DOM/测量：

| 旧检查 | 新 DOM/测量（等价，不弱化） |
| --- | --- |
| `1-W1-行距16±1` | 相邻 `.chat-row` 内容有效间距或 `getComputedStyle(.chat-row).paddingBottom` = **16±1**（当前 CSS `padding-bottom:16px`；pane gap=0 不再适用） |
| `S3-无chip时尾行兜底` | chip `hidden` 的 busy 夹具：`.tool-current` 文本「正在工作」+ `.status-spinner svg`；旧「等待你确认」不再适用 |
| `W6b-系统正文去前缀` | `.msg-injected.is-system .mi-chip` =「系统消息 · <子类>」；`.mi-body` 文本不含 `[系统·]`；注入行夹具 |
| `W6-注入盒行高1.6` | `.msg-injected .mi-body` computed line-height = 19.2px（12×1.6）或比值 1.6 |
| `S2-chip对齐阅读列≤8` | **右缘**：`|#op-chip.right - .chat-pane.right| ≤8`（设计批准行动 chip 右对齐阅读列） |
| `S1-截断目标仍可见` | 超长目标夹具：`.tool-activity .activity-target` 存在、可见且以 `…` 结尾；合并行数量按新工具生命周期 |
| `9-W9-徽标12pxSVG` | `.ti-status.st-working .ts-ico.status-spinner svg`：box/`width/height` 12±1，描边 1.5 |
| `9-W9-转轮0.9±0.2s` | 新实现为共享 `BusySpinner`（Motion rotate 360，duration 0.9）；审计读 `data-spin-duration="0.9"`/`data-spin-motion="true"`，不写 CSS keyframes |
| `11-W11-loading同款转轮` | `.sys-loading .status-spinner svg` + 文案；同一 Motion 0.9s；已补 `.sys-loading` flex |
| `10-W10-尾行含转轮` | `.tool-current .status-spinner svg`；行高 26.6±2 保持；同一 0.9s |
| `12-reduced-motion静止弧` | CDP reduce 后 `.status-spinner.spin-arc` computed `animation-duration ≤0.01s`、`iteration-count ≤1`，svg 仍可见 |

**6-可见行≥9**：按 UIUX 裁定改为规范化夹具 **1360 无提示条 ≥9 / 有提示条叠 ≥8；960 有提示条 ≥4**；不得用残留 `v3-pending/audit-pending` 夹具判密度，不得降到 6。属测试/UIUX 夹具重锚，不改产品文案/正文 15/27。

## 四、D 组 G3/G4 映射与结果

主进程 main 新端已全绿；旧载体 → 新等价：

| 旧载体/日志 | 新等价 |
| --- | --- |
| `OP_*` | `#chat .op-request[data-request-id]` + `.op-title/.op-actions/.op-preview`；卡状态 `data-state`（open/submitting/decided/expired）；`OP_CARD_PRESENT` 旧选择器已换 `data-request-id` |
| `OPX_*` | 镜像 `data-surface-role-id/.is-mirror/.op-mirror-badge/.op-mirror-source`；两 pane 各一卡；`rowModelDebug.operators` 唯一 |
| `ANCHOR_*` | `replayAnchorDebug(role)` + `rowModelDebug(role).operators`；历史锚点行独立（带 anchorKey 的 tool-lifecycle 不并入卡）；main 值 `ANCHOR_TABLE_REGISTERED=true`、request/conclusion 相邻 |
| `OPEN_CARD_*` | `replayAnchorDebug` 未决卡索引 + `#op-chip` 可见；`OPEN_CARD_STABLE_AT_ANCHOR/CHIP_VISIBLE=true` |
| `BADGE_*` | `#tab-work .tab-badge`（待确认/待选择数）与 `#tab-card .tab-badge`（当前工作+排队）；旧「queue summaries 徽标」语义已按 4A/4B 拆分，需新检查名 |
| `TAB_*_ACTIVE` | `#tab-work/#tab-card` 现有 `.active`（本轮补），main true |
| `RIGHT_QUEUE_*` | `#right-queue-body .q-item/.q-pos/.queue-src`（QueueSubview/WorkOverview）；`RIGHT_QUEUE_RUNNING_FIRST/SOURCES` 旧结构差异需按新 QueuePanel 重锚 |
| `RESTORE_*` | `rowModelDebug`/`.sys-replay-divider`/`.msg-assistant`；`RESTORE_NO_SUCCESS_DIVIDER=false` 是旧文案差异（新分隔「会话记录已恢复」），按新文案重锚 |
| `DRAWER_*` | `#right-drawer.open`/`aria-hidden`/`inert`；Esc 关闭已修（document 监听），main true |
| `INJECTED_CHIP_LABEL` | `#chat .msg-injected .mi-chip` =「回交投递 · 来自 <角色>」；main 值如实 |

**D 组补充（P1_*/REPLAY/BOOTSTRAP）**：
- `P1_*` 7 项：旧 main 以「当前 pane 找卡 + scrollIntoView + chip」断言；新等价为 `ChatStream.locatePendingCard`/`#op-chip`/`data-request-id` 与 `replayAnchorDebug`，官方 COMPLETE_FLOW `P7 locate uses original request no default decision` 已通过（P7 段整段 41/41）。main 旧日志 false 属旧 pane/角色夹具载体差异，按新 P7 检查名重锚，不退役。
- `REPLAY_DEDUP_REBUILD`：新 `rowModelDebug.count` 不再计恢复分隔提示（旧行表口径），纯回放测试 `skip/append/full` 与默认段 no-double 均通过；main 旧计数断言需按新 count 口径重锚。
- `BOOTSTRAP_*`：`BOOTSTRAP_MENTION_COUNT=0`、`CENTER_CTA_PRESENT=false`、`HAS_ROLES=false` 等新空态值是否为新设计有意变化，待 UIUX 书面依据；若无依据按旧 CTA/文案补齐，PM 未裁定前不称 pass。
- `P1_ARRIVAL/HAS_DENIED/DENIED_OPEN` 等旧日志不作为 5A 门通过依据；5A 冒烟/P7/默认段/DENIED 检查为准。
**G4 真实行为**：`ANCHOR_*`、`OPEN_CARD_*`、`DRAWER_ESC_CLOSES`、`DENIED_OPEN_COUNT`、`HAS_DENIED_INLINE`、`BOOTSTRAP_*`、`INJECTED_CHIP_LABEL` 已按 main 新端值核对；`ANCHOR_*`/`OPEN_CARD_*`/DRAWER 已转 true，DENIED/HAS_DENIED 为 0，BOOTSTRAP 空态/主入口值如实。`BADGE_ON_WORK_WHILE_COLLAPSED=false`、`RIGHT_QUEUE_RUNNING_FIRST/SOURCES=false` 属新结构语义差异，需测试重锚（未退役）。

## 五、UIUX 新端视觉审计响应

- **P0 200% 输入区**：`#chat.chat` 200% 改 `flex:1 1 auto; min-height:240; overflow-y:auto`；`.composer` 200% `position:sticky; bottom:0`。5A 冒烟新增长历史 200% 检查：chat client=240、scroll=19396、composer bottom=430=innerHeight；截图 `05/06`。
- **P1 200% 无角色/失败态横溢**：`.col-mid` 200% `overflow-x:hidden`；5A 冒烟空项目 200% 检查 `mid.scrollWidth=422=clientWidth`、`.chat-empty` 在列内、composer bottom=430。
- **P1 转轮**：`sys-loading`/`tool-current` 补 `<BusySpinner>`（Lucide LoaderCircle 12px + Motion `rotate 360` 0.9s linear repeat；reduced-motion 静止）；侧栏/loading/尾行共用同一实现；尾行保持 26.6±2。
- **P1 密度**：`6-可见行` 按 UIUX 规范化夹具/阈值重锚（见 §三）；本轮未改正文 15/27、未降阈值；产品 chrome 未进一步压缩，等待规范夹具结果。
- **P2 注入盒 1.6**：`.msg-injected .mi-body{line-height:1.6}`。
- 200% 镜像/交付截图与证据命名由 UIUX 复测补；本轮未改。
- 候选 hash 已变：最新 `dist/src/index.html` + `index-T1im4gOp.js`/`index-DbPZU_Oj.css`；SHA256 `f372e111…5b5cc`（html）/`f568e2aa…08e4095`（js）/`b52cfca1…4271fe`（css）（构建后以工作树为准）。UIUX 最终审计 P1（200% sticky composer 遮挡）已在 ≤680/480 CSS 修复并补 12 项遮挡断言，5A 冒烟 **36/36**（21 截图）。

## 六、剩余与边界

- A 组 6/8 产品修复官方通过；MERGE/DEFAULT 的旧 DOM 节点身份断言已获 PM §十九批准等价重锚（MERGE：同 request id + `data-state=open` + confirm 可见；DEFAULT：`n.closest('.chat-pane')`），产品断言不改；**两项重锚已由桌面UI 落地，MERGE 12/12、默认段 110/110 全过**。
- C 组 10 条为测试/UIUX 重锚，本轮给新 DOM/测量映射；`uiux-design-audit` 旧脚本仍会先在 `.tool-records` 夹具处 abort（旧载体），需测试角色落地。
- 未删除旧渲染器/vendor/旧测试；未切生产入口；未新增依赖/DOM 例外；未改 package/根配置。
