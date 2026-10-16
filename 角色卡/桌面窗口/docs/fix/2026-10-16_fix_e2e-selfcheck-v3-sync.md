---
id: fix-e2e-selfcheck-v3-sync
type: fix
title: main.mjs 真机自检台对齐 v3/V2 现状（本批失效 + 既有失同步 + 空指针崩溃修复）
created: "2026-10-16"
updated: "2026-10-16"
status: 已实施（e2e 全量跑通、1 条真实产品缺陷如实留红并登记；边界 266/266、typecheck 0 错）
---

# main.mjs 真机自检台对齐（桌面窗口）

来源：客户批准的 v3 界面收敛（桌面UI 已实施完）后，本角色自检台 `test/桌面应用/e2e/main.mjs`
出现**失效点与既有失同步**（桌面UI 只读定位、未改它），PM 排发本角色修复。范围：仅
`test/桌面应用/e2e/main.mjs`（含最小辅助 `waitUntil`）。**未碰 `app/renderer/**`**（只读参考）、
未碰他角色文件；不 commit。

## 〇、结论（一屏）

- e2e 由「第 6 节空指针崩溃终止」修复为**全流程跑通**（`E2E_DONE=1`，352 行报告，两轮内容级零差异）。
- 逐处核对**26 类断言行/夹具点**（下表 A/B 组）：全部按「原断言 → 新断言 + 理由」对齐，**零删除、零放松**；
  另补 9 条 IPC 通道接线（C 组）。两处「能力已移除」按规则改为守卫替代能力（投递卡）+ 登记移除理由
  （事件层镜像、15s 文本防误伤）。
- 崩溃点（`#tab-card .tab-badge` 空引用）修复为防御式判据。
- **唯一未绿行 = `U1_WINDOWED_TO_BOTTOM=false`（dist=18px，确定性）**——经探针定位为**当前产品缺陷**
  （非断言失同步，根因见 §三），属 `app/renderer/**`（桌面UI 边界）；**不放松断言**、不改渲染器，
  如实留红并交 PM 路由。
- 证据：边界单测 **266/266 绿**、`npm run typecheck` 全仓 **0 错**；e2e r4/r5 两轮报告逐字一致
  （见 `2026-10-16-e2e-v3-sync-evidence/`）。

## 一、逐处更新对照表（原断言 → 新断言 + 理由）

### A. 本批 v3 新增失效（桌面UI v3 收敛所致）

| # | 行 | 原断言 | 新断言 | 理由 |
| --- | --- | --- | --- | --- |
| A1 | `ROLE_STATE_BADGE_HAS_ICON` | `.ti-status .ts-ico` 的 `textContent.length>=1` | `.ti-status .ts-ico svg.spin-arc` 存在 | W9（2026-10-16 批准）：working 态图标由文本字形 `◐` 换成 SVG 弧线转轮（`role-status.js::SPINNER_SVG` 唯一图源），`.ts-ico` 内纯 SVG、无文本——原判据必假。语义不变：「工作徽标含图标」。 |
| A2 | S-1 夹具 `s1Event`（fill/live/up/redown ×4 组、共 230 条事件） | 仅 `detail.turnId` 承载身份 | 补 **envelope 顶层 `turnId`**（detail 保留，与生产投影一致） | v3 把 `tool-rows.js::activityOf.turnId` 收窄为「只认顶层 `event.turnId`」（对齐生产 `ProjectedRuntimeToolEventV1`：`identity(event)` 带顶层 turnId、detail 冗余一份）。旧形状 200 条被并进同一组行 ⇒ 行数饿死 ⇒ `S1_WINDOWED_ACTIVE`/`S1_STAYED_AWAY_FROM_BOTTOM`/`U1_PANE_HEIGHT` 连锁转假。同批补 `TOOLROW`（9b）夹具顶层 turnId（形状对齐）。 |
| A3 | `PI_ADVANCED_HINT_LEAVE_BLANK` | 静态 `.pi-advanced-hint` 段落含「留空 = 用默认值」 | 「`.pi-advanced-body .runtime-field-help` + 静态段落」合并文本含「留空」且含「默认」 | 现行载经 `applyPiView` 重写 `.pi-advanced-body`，静态指引段不再留存；指引单一来源 = `src/common/shared/runtime-settings.ts` 的 `help`（「留空使用保守默认值。」）。合并取文兼容两态，语义不变。 |
| A4 | S-1 断言前等待（非断言本身） | `await sleep(800)` | `waitUntil(行模型 count≥150, 10s 有界)` + `sleep(300)` | 200 条**逐条** `session:event` 在现行渲染器下渲完实测 ~4.4s——死睡量到中间态。**非放松**：判据内容不动，仅把固定死睡改为与断言同一事实源的有界轮询；超时仍如实转红。新增最小辅助 `waitUntil`（有界、不抛）。 |

### B. 既有失同步（此前批次已改界面，harness 未跟上；与 v3 无关）

| # | 行 | 原断言 | 新断言 | 理由/引入批 |
| --- | --- | --- | --- | --- |
| B1 | `SU_PRIMARY_BADGE` | `.ti-badge.primary` 元素存在 | `.tree-item.primary` 类 + `aria-description` 含「主入口」 | V2：左树可见「主入口/内置」徽标（`.ti-badge`）退役，身份改由 `primary` 类（带边框区框出）+ `aria-description` 承载（renderer.js::roleTreeItem）；与桌面UI `uiux-v2.mjs` 口径一致。 |
| B2 | `SU_TREE_BADGE` | `.ti-badge` 元素存在 | `aria-description` 含「内置」 | 同上。 |
| B3 | `SU_BADGE_LABELS`（信息行） | `.ti-badge` 文本串联 | `aria-description` 原文 | 载体随 B1/B2 迁移；报告可读性保持。 |
| B4 | `SU_NO_READONLY_BADGE` / `DESKTOP_ROLE_NO_READONLY_BADGE` / `BOOTSTRAP_SU_NO_READONLY_BADGE` / `REFRESH_SU_NO_READONLY_BADGE`（4 处，守卫「只读不回归」） | 仅查旧元素 `.ti-badge.readonly` | 旧元素判据**保留** + 新增「`aria-description` 不含『只读』」 | 旧元素载体退役后原判据空真；加查现行身份载体，不留载体形态的回潮缺口（加强非放松）。 |
| B5 | `SU_WRITE_NOTE_IN_HEADER` → 改名 `SU_WRITE_NOTE_IN_COMPOSE_NOTE` | `.chat-head #runtime-note` | `.compose-note #runtime-note` | v3 归位：写入说明移入输入区下沿 `.compose-note`（原在会话头横栏）。 |
| B6 | `RUNTIME_NOTE_IN_HEADER` → 改名 `RUNTIME_NOTE_IN_COMPOSE_NOTE` | 同上 | 同上 | 同上（第 7 节同源行）。 |
| B7 | `WRITE_NOTE_REMAINS_IN_HEADER` → 改名 `WRITE_NOTE_REMAINS_IN_COMPOSE_NOTE` | 仅查文本 | 文本 + `.closest('.compose-note')` 位置 | 同上；位置钉死。 |
| B8 | `CHAT_HEAD_NO_BUTTONS` → 改名 `CHAT_HEAD_ONLY_APPROVED_BUTTONS` | `.chat-head button` 数为 0 | 按钮 ⊆ `{runtime-select, tab-work, tab-card}` 且旧单功能钮（`#btn-pi-settings`/`#btn-stop`/`#session-state`）不回归 | V2：会话头现合法承载引擎只读入口 + 图标簇（与桌面UI `renderer.test.ts:653` 同口径）；守卫对象仍是「旧钮不回潮」，且白名单式更强。 |
| B9 | `PI_ENTRY_IN_TABS` → 改名 `PI_ENTRY_IN_SIDEBAR_FOOT` | `#right-tabs #tab-pi` | `#tab-pi` 存在且 `closest('.sidebar-foot')` | V2：Pi 设置入口从图标簇移左栏底部（「设置」钮）；入口存在且唯一，断言归位。 |
| B10 | `COMPOSER_ROWS_ARE_ATTACH_AND_CAPSULE` → 改名 `..._ATTACH_CAPSULE_NOTE` | `.composer` 恰 2 行子元素 | 恰 3 行 + 第 3 行 = `.compose-note #runtime-note` | v3 归位（同 B5）：胶囊下带说明行。 |
| B11 | `COMPOSER_CLEAN`（同块 clean 字段） | 含 `!cq('#runtime-note')`（底部不得有它） | 去掉该子句，改钉 `!!cq('.compose-note #runtime-note')`（note 字段） | 语义从「不存在」改为「只可在 `.compose-note` 这一处」——位置被钉死、不是放松；其余子句（无 select/无 hint/无 pi-panel/无 bootstrap-action）不动。 |
| B12 | P1-1 队列段开合（2 处）、`N-3` 工作列表段开合（3 处） | 点 `#tab-card` | 点 `#tab-work` | V2 抽屉拆分：工作列表（待办/队列节）归「工作概览」抽屉。此 5 处点击是全链前置——`QUEUE_ROWS_THREE`/`QUEUE_WITHDRAW_ON_MESSAGES`/`QUEUE_FULL_TOGGLE_ON_LONG`/`QUEUE_EXPAND_FULL`/`Q_WITHDRAW_LINE`/`QUEUE_ROWS_AFTER_WITHDRAW`/`DISPATCH_ROW_NO_WITHDRAW`/`QUEUED_EXECUTION_ORDER_1_3` 随之恢复真值。 |
| B13 | `TABS_PRESENT` | `['tab-card','tab-pi']` | `['tab-work','tab-card','tab-pi']` | 图标簇语义演进（含工作概览）；集合式加强。 |
| B14 | 第 6 节 `RIGHT_HAS_TODO_SECTION` / `RIGHT_QUEUE_SINGLE_LIST` | 在 tab-card 抽屉内查 `#right-queue-body` | 切到 tab-work 抽屉后查（同表达式）+ 新增信息行 `TAB_WORK_ACTIVE`/`DRAWER_TITLE_WORK` | 断言本身不删不减，归属抽屉迁移；card 抽屉段保留四组资料断言（`RIGHT_HAS_CARD/BOUNDARY/CHANGELOG/DOCS/…`）。 |
| B15 | `BADGE_ON_CARD_WHILE_COLLAPSED` → 改名 `BADGE_ON_WORK_WHILE_COLLAPSED` | `#tab-card .tab-badge` 显示 '2' | `#tab-work .tab-badge` 显示 '2' | V2：角标挂到「工作概览」钮（同一 role-state 快照与计数公式，无新数据源）；「收起不丢信息」语义不变。 |
| B16 | `BADGES_CLEAR_ON_EMPTY`（**空指针崩溃点**） | `document.querySelector('#tab-card .tab-badge').hidden` 直引用 | `(() => { const b=document.querySelector('#tab-work .tab-badge'); return !!b && b.hidden === true; })()` | 载体迁移（同 B15）+ **防御式**：元素缺失时如实报 false，绝不再空指针崩溃（原实现是第 6 节 `E2E_ERROR` 的直接根因）。 |
| B17 | `TAB_CARD_ACTIVE_STILL` → 改名 `TAB_WORK_ACTIVE_STILL` | `#tab-card` active | `#tab-work` active | 同 B12 载体迁移。 |
| B18 | 第 9 节回交段（`HANDBACK_*`/`SOURCE_REPORT_*`/`REPORT_NO_PREMATURE_SU_MIRROR`/`SHOT_08`） | 旧事件形状 `event.handback`（裸载荷）+ `.hb-title/.hb-status.hb-ok/.hb-ev-empty/.hb-ev` 载体 | 生产形状 `event.report`（`RuntimeReportSnapshotV1`：`source/summary:{text}/evidence:[{text}]`，与桌面UI e2e 夹具同形）；载体改 `.hb-head strong`（reportDeclaration）/`.hb-evidence li`/`is-blocked`+「被拦下」 | F 批次（2026-10-15）卡片重做 + 事件形状换代：旧形状在新渲染器下安全降级为系统行、旧载体全部退役。`REPORT_NO_PREMATURE_SU_MIRROR` 由 `!…is-mirror` **加强**为 `!任何 #chat .msg-handback`（源角色事件不落 su pane 全域）。`SHOT_08_MIRROR` 更名 `SHOT_08_SU_PANE`（镜像已退役，截图记录 su 现态）。 |
| B19 | 9b `INJECTED_*` 夹具 | `kind:"message"` 仅 summary（文本层 `用户指令：…`） | typed 形状 `detail:{source:"prompt-input", text}` | F 批次（fca8f6b）：注入样式判据收窄为 **typed 标记**，不再从 summary 文本猜测——原推法不再产生 `.msg-injected`。 |
| B20 | `MANUAL_PREFIX_BUBBLE` / `MANUAL_NOT_INJECTED`（推送不动，注释+语义重锚） | 判据=「15s 时间启发式防误伤」 | 判据=①手输仍是普通气泡；②**文本层回显（summary 形态、无 typed 标记）不触发注入** | 15s 时间启发式已由 fca8f6b 移除（身份绑定改走 clientMessageId ACK）——本处钉「删掉文字推测后的反向面」（防文本猜测类判据回潮）；伪前缀手输的 typed 回显分类走向已在 §四-3 如实登记交桌面UI/PM。 |
| B21 | 坏事件夹具（`坏报告`） | 旧形状 `handback` 裸载荷 + `evidence:"invalid"` | `report` 形状 + `evidence:"invalid"`（非法类型保留） | 旧形状在新契约下安全降级为系统行、不再触发单事件隔离路径；替换载荷后照旧触发 `renderer.event-error` 隔离 + 批量不中断，保住守卫语义（诊断断言 `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS` 依赖它）。 |
| B22 | `REPORT_STATUS_UNREPORTED/FAILED/ABORTED`（repairCheck 硬断言 ×3） | 旧形状 `handback` + `.hb-status` | `report` 形状（`origin:"terminal-fallback"`）+ `.hb-head strong` 含标签 | 同 B18；原实现是第 10 节抛错点（修复前必红）。 |

### C. 非断言对齐：harness 主进程 IPC 接线补齐（既有失同步）

`registerIpc` 逐条对照 `app/main.ts` 补注册现行通道（renderer 已改用、harness 未跟上，缺失会产生
真实错误路径而没被断言层显形）：

| 通道 | 缺失时的实际后果（修复前实测） |
| --- | --- |
| `session:live-views` | `refreshLiveRoles` 现优先取它 → 无 handler 异常 ⇒ `liveRoles` 清空 ⇒ **一切徽标错显「已停止」**（`STATUS_BADGE_IS_IDLE`/`ROLE_STATE_CLEARED` 转假）。 |
| `session:history-get` | F 批次后 selectRole 主路径按需取历史 → 失败走「读取历史失败」分支 ⇒ **全量重建清掉已回放行**（`RESTORE_ROWS_PRESENT/RESTORE_MD_RENDERED/RESTORE_SU_OWN_TEXT`、`ANCHOR_TABLE_REGISTERED` 及锚点行序连锁转假）。 |
| `report:retry-save` / `report:get-save-state` / `delivery:retry-history-save` / `delivery:get-receipt` / `session:get-persistence` | 报告/投递卡「报告存储」槽的现行读写通道（只读查询；retry* 仅点击触发）——缺失时卡片槽位显示「保存状态请求失败」噪声。 |
| `runtime-config:get` / `runtime-config:save` | Pi 设置面板现行通道（原 `pi-config:*` 双注册保留）——缺失 ⇒ 面板「读取配置失败」、保存不落盘（`PI_PANEL_PATH_IS_TEMP`/`PI_TEMP_ENV_*`/`PI_TOKEN_*` 全链转假）。 |

未补项（如实登记）：`app:pick-image`（真弹系统对话框，测试台若触发会**挂住**——刻意不注册，
不作为路径由失败快照保护）、`project:document-read`（文档抽屉读取，本台未覆盖该交互）。

**channel 补齐把 stdout 由 287 行 `No handler registered` 噪声降为 1 条**（唯一保留者 = 修复探针
刻意注入的 `发送异常原文` —— 预期行为）。

## 二、运行结果（证据目录 `docs/fix/2026-10-16-e2e-v3-sync-evidence/`）

| 证据 | 内容 | 结果 |
| --- | --- | --- |
| `main-e2e-r1-baseline-crash.txt` | 修复前基线（未动任何行的本台） | E2E_ERROR 止于第 6 节（`.tab-badge` 空指针）；15 行 false |
| `main-e2e-r3-after-channels.txt` | 通道补齐后 | 全流程 352 行，剩 3 行 false（S1×2 + pi hint） |
| `main-e2e-r4-final.txt` / `main-e2e-r5-final-again.txt` | 最终态连跑两轮 | **两轮逐字一致**；352 行；`E2E_DONE=1`；除 `U1_WINDOWED_TO_BOTTOM` 外全绿（详见 §三） |
| `main-e2e-r5-stdout.txt` | 最终态 stdout | 仅 1 条预期探针异常，无其他噪声 |
| `probe-u1-18px-rootcause.txt` | U1 缺陷根因探针（最小化复现） | 见 §三 |
| `boundary-tests.txt` | 本角色边界 23 个单测文件 | **266/266 过、0 红** |
| `typecheck.txt` | `npm run typecheck` | **全仓 0 错** |

- 运行方式（沿用既有）：`ANS_E2E_OUTDIR=<绝对路径> node_modules/.bin/electron test/桌面应用/e2e/main.mjs`；
  轮时长约 70–80s（含新增有界等待），未触 90s 看门狗。
- 对照前档（2026-10-14 run6）：差异均为**预期位移**（角色清单 +3、本批对照表条目、双轮一致），
  无新增未知差异。

## 三、唯一留红行：`U1_WINDOWED_TO_BOTTOM=false`（真实产品缺陷，已定位，非本台失同步）

**现象（确定性，r4/r5 两轮 + 探针复现一致）**：窗口化会话下从 su 切回「桌面窗口」，
距底 **18px** 稳定不消（`DIST=18 > 阈值 8`）；手动再滚一次或**再点一次**该角色即回 0。

**探针根因（`probe-u1-18px-rootcause.txt`）**：切换回来时，`#chat` 的 clientHeight 566→**548**——
`.session-notice` 通知条在**贴底滚动之后**从 0 撑到 19px（`已在该角色的会话中，续接当前会话。`），
而**没有任何后随的补滚**：挂载期 `showPane → stickPaneToBottomOrCard`（滚动此刻按 ch=566 计）
先于 `openSession` 回包后的 `setHint(res.note)` 落文案。`st/scrollHeight` 全静止 ⇒ 下方 18px 内容
永久在折叠线下。**判定：违反 U-1 客户裁定（2026-10-12「点击这个角色，应该滚动到滚动条最下面」）。**

**归因**：`.session-notice` 条由 **V2 批（fd0ac73）**引入（此前该提示在会话头，2026-10-14 run6
该处 `DIST=0`、U-1 全真）——即 V2/v3 后续批次引入的回归，非本批（v3 只读核对时发现）。

**处置（本批）**：**不放松断言**（阈值 ≤8 即裁定原文的可观测口径；改口径=放松，禁令明确）、
不动 `app/renderer/**`（桌面UI 属主）。如实留红 + 本记录 + 回交 PM 路由。
**建议修法（交 PM/桌面UI，一行级）**：通知条文案落定后补一次贴底（如在 `setHint` 之后对
「在底部者」补 `scrollBottomForced`；与 `updateVirtualWindow` 既有的「wasAtBottom 补滚」同款判据）。

## 四、边界与留痕（如实）

1. **只动** `test/桌面应用/e2e/main.mjs`（+ 本记录/证据/changelog/memo）。**未碰** `app/renderer/**`
   （桌面UI 实施域，只读参考）、`app/**` 与他角色文件；不 commit；未碰 `/private/tmp/ans-v11-release-run`。
2. **能力移除类断言及处置**（「不得静默删」逐条）：
   - ①「事件层镜像（`is-mirror` 卡进 su pane）」——渲染器已不再实现（F 批次改投递路径）。处置：
     改为**守卫替代能力** = 新增 `SU_DELIVERY_CARD_PRESENT`（以生产投递形状推入 su pane，断言
     「回交投递 · 本批 1 份」投递卡物化，与桌面UI e2e 夹具同形）+ `REPORT_NO_PREMATURE_SU_MIRROR`
     加强为「源角色事件不物化任何卡」+ `SHOT_08` 更名。**未删任何断言**。
   - ②「15s 时间/文本启发式防误伤」——渲染器已移除（fca8f6b 改 clientMessageId 身份绑定）。
     处置：`MANUAL_*` 两断言保留并语义重锚为「文本层回显不触发注入」的反向钉（见 B20）。
   - ③「`.pi-advanced-hint` 静态段落」——被 `applyPiView` 重写取代。处置：改钉现行载体
     `runtime-field-help` + 静态段落合并（见 A3），语义不删。
3. **跨边界留痕（交 PM 路由，不在本批范围）**：
   - `U1_WINDOWED_TO_BOTTOM` 18px 缺陷（§三；建议修法已附）。
   - `app/renderer/renderer.js` 2311-2312 注释仍写着「手输防误伤（同角色、15s 内）」——实现
     已随 fca8f6b 移除该启发式（注释陈旧）；且现行 typed 回显路径下，**字面以 `[派发] `/`[回交] `
     开头的手输消息，其 typed 回显会被渲染为注入行**（分类只认前缀、不做身份豁免）。本台未钉该
     走向（手输未被断言的 typed 回显不在路径里），如实登记交桌面UI 定性（是否补 clientMessageId
     豁免）。
   - `test/桌面应用/e2e/uiux-v2.mjs` 的「手输防误伤」同名叙事若依赖旧启发式，同请核对（桌面UI 边界）。

## 五、验证清单（本批）

- [x] `ANS_E2E_OUTDIR=… electron test/桌面应用/e2e/main.mjs`：`E2E_DONE=1`、352 行、连跑两轮逐字一致；
      除 §三 一条真实缺陷外全绿；无 WATCHDOG。
- [x] 崩溃修复自证：r1（修复前）E2E_ERROR 止第 6 节 → r4/r5 走到尾部 `MAC_CLOSE_REOPEN_*`。
- [x] 边界 23 单测文件 266/266；`npm run typecheck` 0 错。
- [x] 零删除、零放松：全部更新均在 §一 对照表登记（含 12 处改名）。
- [ ] （待 PM/桌面UI）U1 18px 缺陷修复后复跑本台 → 预期 `U1_WINDOWED_TO_BOTTOM=true`（阈值未动，
      可直接验证修复）。
