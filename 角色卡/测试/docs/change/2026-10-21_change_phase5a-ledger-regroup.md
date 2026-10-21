---
id: change-ui-platform-phase5a-ledger-regroup
type: change
title: Phase 5A 允许差异台账 G1–G5 重分组——组/精确名单/代表行/替代覆盖
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: awaiting-pm-groups（5A 门不通过）
related: [change-ui-platform-phase5a-independent-verification, design-ui-platform-phase5-test-plan]
events:
  - date: "2026-10-21"
    kind: revised
    summary: 按 PM §十八把 main.mjs 366 行差异重分为 G1–G5：G1 19、G2 12、G3 28、G4 43、G5 2、G0 252、NEW-ONLY 9、OLD-ONLY 1；逐名给替代覆盖/代表行，G4 不得列差异；5A 门保持不通过，待修复后重跑
---

# Phase 5A 允许差异台账 G1–G5 重分组

> **已被 post-fix3 最终版覆盖**：修复后 main 差异为 80/7/1（G1 19/G2 12/G3 25/G4 21/G4-RESOLVED 1/G5 2/G0 292/NEW 7/OLD 1），以 [最终重分组](2026-10-21_change_phase5a-ledger-regroup-final.md) 为准；本文件保留 102 值差异时的中间骨架。

**依据**：PM §十八；main 最新 diff（old 357/new 365/common 356/only-old 1/only-new 9/值差异 102）；独立旧/新端报告。完整逐名表：[main-diff/regroup-ledger.md](2026-10-21-phase5a-new-entry-evidence/main-diff/regroup-ledger.md)（366 行分组）与 [allowed-diff-ledger.json](2026-10-21-phase5a-new-entry-evidence/main-diff/allowed-diff-ledger.json)（含 `group` 字段）。

## 一、分组结果

| 组 | 行数 | 含义 | PM 处置 |
| --- | --- | --- | --- |
| G1 | 19 | 环境/实例归一化（版本/路径/time/截图） | 可整组批准；代表 `ELECTRON`/`NODE` 同名同值 |
| G2 | 12 | 已批准 UI/设计差异 | 逐名批准 |
| G3 | 28 | 旧载体/调试字段且有新等价检查 | 逐名批准替代覆盖 |
| G4 | 43 | 真实行为/夹具缺陷（含同值 false `RECOVERY_SAME_PENDING_CARD_ONCE`） | **不得列差异，5A 修** |
| G5 | 2 | 派生行 `E2E_FAILURES`/`E2E_PASS` | 随底层 |
| G0 | 252 | 同名同值 MATCH | — |
| NEW-ONLY | 9 | 7×P13 新语义 + 2×timeout | 逐条批准或归 G4 |
| OLD-ONLY/REMOVED | 1 | `P13_NEW_SEMANTICS` | 由 P13_* 7 项替代 |

## 二、G1（19）精确名单

```
OUTDIR
RENDERER_ENTRY
SHOT_00_TITLEBAR
SHOT_01B_SU
SHOT_01_IMPORT
SHOT_02_CHAT
SHOT_03_DENIED
SHOT_04_PROFILE
SHOT_05_BOOTSTRAP
SHOT_06_REFRESH
SHOT_07_HANDBACK
SHOT_08_SU_PANE
SHOT_09_PI_PANEL
SHOT_10_PI_SAVED
SHOT_11_OPERATOR
SHOT_12_COMPOSER
SHOT_12_RESTORE
SHOT_14_OP_CROSSPANE
SHOT_15_ANCHOR
```

代表行：`OUTDIR /tmp/ans-p5a-old.* → /tmp/ans-p5a-new.*`；`RENDERER_ENTRY` 旧入口→`dist/src/index.html`；`SHOT_*` 输出目录不同。`ELECTRON=44.7.0`、`NODE=24.21.0`、`PROJECT` 同名同值，作为环境代表，不需要逐项差异。

## 三、G2（12）精确名单

```
STATUS_BADGE_TEXT
PI_FIELD_COUNT
PI_KEYS_ARE_FIVE
PI_FIELDS_MATCH_REGISTRY
PI_SAVE_STATUS
SYS_ROWS
RESUME_HINT
ROLE_STATE_BADGE_HAS_ICON
ROLE_STATE_BADGE_HOVER_FULL
U1_NORMAL_TO_BOTTOM
U1_NORMAL_TO_BOTTOM_DIST
U1_PANE_HEIGHT
```

代表行：`STATUS_BADGE_TEXT ●空闲→空闲`（已批准状态前缀）；`PI_FIELD_COUNT 5→6`、`PI_KEYS_ARE_FIVE true→false`、`PI_FIELDS_MATCH_REGISTRY true→false`（新增 `ANS_PI_PROMPT_TIMEOUT_MS` 及 piKeys 名集）；`SYS_ROWS` 新类名列表；`U1_*` 布局/滚动语义新基线。PM 需逐名确认，不把未列出的行为变化塞进 G2。

## 四、G3（28）精确名单 + 新等价覆盖

| name | 新等价检查/路径 |
| --- | --- |
| `BADGES_CLEAR_ON_EMPTY` | uiux-v2 WorkOverview 角标/队列预览 + QUEUE_VIEW 4/4（路径覆盖，待 PM 确认） |
| `BADGE_ON_WORK_WHILE_COLLAPSED` | 同上 |
| `DISPATCH_ROW_NO_WITHDRAW` | uiux-v2 QUEUE_VIEW 4/4 + WorkOverview 队列/撤回动作 |
| `DRAWER_CLOSED_AFTER_PI` | uiux-v2 RUNTIME `runtime settings geometry` + VISUAL drawer checks |
| `OPX_ANSWERED` | uiux-v2 MIRROR 8/8（同 id 只答一次/双面冻结） |
| `OPX_BADGE_CLEARED` | uiux-v2 MIRROR 8/8 + QUEUE_VIEW presented queue |
| `OPX_POINTER_IN_VIEWED_PANE` | uiux-v2 MIRROR 8/8 + QUEUE_VIEW |
| `OP_CANCEL_DECLINED` | MIRROR `answering mirror freezes…` / `source face…` |
| `OP_CARD_FROZEN` | MIRROR `answering mirror freezes…` |
| `OP_CARD_PRESENT` | MIRROR `W6-C mirror card rendered…` |
| `OP_CARD_TITLE_SHOWS` | MIRROR same-id/mirror source label |
| `OP_CONFIRM_ANSWERED` | MIRROR same-id answered once |
| `OP_MULTI_ANSWERED` | MIRROR/queue operator cards（新 UI 选项表） |
| `OP_MULTI_HAS_CHECKBOX` | MIRROR/queue operator cards（新 UI 复选） |
| `OP_PREVIEW_COLLAPSED` | MIRROR card preview + VISUAL report source |
| `OP_SELECT_ANSWERED` | MIRROR/queue operator cards |
| `OP_SELECT_HAS_RADIO` | MIRROR/queue operator cards |
| `OP_SUBMIT_DISABLED_INITIALLY` | MIRROR/queue operator cards |
| `REPORT_DELIVERY_DETAILS_COLLAPSED` | uiux-v2 VISUAL report source/details checks |
| `RESTORE_NO_SUCCESS_DIVIDER` | uiux-v2 FRESH P5 4/4 |
| `RESTORE_SU_CHAT_SNIPPET` | FRESH `P5 actual at-open old history...` + RUNTIME Pi history |
| `RESTORE_SU_REPLAY_ROWS` | FRESH P5 + RUNTIME `Pi own history...` |
| `RESTORE_SU_RESTORED_FLAG` | FRESH P5 + RUNTIME restore flags |
| `RIGHT_QUEUE_RUNNING_FIRST` | uiux-v2 QUEUE_VIEW 4/4 + WorkOverview 当前工作 |
| `RIGHT_QUEUE_SOURCES` | QUEUE_VIEW 4/4 + WorkOverview 来源 |
| `TAB_CARD_ACTIVE` | VISUAL `V2 accepted structural positions...` + SELECTOR `current click no business reread` |
| `TAB_WORK_ACTIVE` | VISUAL/SELECTOR + RUNTIME drawer geometry |
| `TAB_WORK_ACTIVE_STILL` | VISUAL/SELECTOR + RUNTIME drawer geometry |

**规则**：以上仅在 PM 确认“路径/检查确为等价”时保留在 G3；不能证明等价的归 G4（本表已把无精确新检查的角标项标注“待 PM 确认”）。

## 五、G4（43）不得列差异，5A 修

精确名单：

```
ANCHOR_CARD_ANSWERED
ANCHOR_CARD_AT_ARRIVAL
ANCHOR_NO_DUPLICATE_ROW
ANCHOR_ROW_AFTER_SWITCHBACK
ANCHOR_STABLE_NOT_TAIL_ONCE
ANCHOR_STABLE_NOT_TAIL_TWICE
ANCHOR_TABLE_REGISTERED
BOOTSTRAP_CENTER_CTA_PRESENT
BOOTSTRAP_MENTION_COUNT
BOOTSTRAP_MENTION_IN_CENTER_EMPTY
DENIED_OPEN_COUNT
DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS
DRAWER_ESC_CLOSES
HAS_DENIED_INLINE
INJECTED_CHIP_LABEL
OPEN_CARD_AT_ARRIVAL
OPEN_CARD_CHIP_VISIBLE
OPEN_CARD_ROWS_AFTER_SWITCHBACK
OPEN_CARD_STABLE_AT_ANCHOR
P1_ARRIVAL_DEBUG
P1_ARRIVAL_SCROLLED
P1_CHIP_CLICK_LOCATES
P1_CHIP_COUNT1_AFTER_TERMINAL
P1_CHIP_HIDDEN_AFTER_ALL_TERMINAL
P1_CHIP_SECOND_CARD
P1_CLEANUP_CHIP_HIDDEN
P1_SWITCHBACK_SCROLLS_TO_CARD
PENDING_EXPLICIT_SAME_ROLE_CARD_AND_BUTTON_VISIBLE
RECOVERY_ENDED_REQUEST_NOT_REPLAYED
RECOVERY_OLD_REQUEST_STILL_ANSWERABLE
RECOVERY_SAME_PENDING_CARD_ONCE
REPLAY_DEDUP_REBUILD
ROLE_STATE_BADGE_WORKING_PENDING
ROLE_STATE_QUEUE_ROW
SESSION_REPAIR_EXPLICIT_RECOVERY_DELIVERS_ONCE
SESSION_REPAIR_FAILED_OPEN_DOES_NOT_SEND
SESSION_REPAIR_FAILED_OPEN_NO_REPLAY
SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE
SESSION_REPAIR_SAME_ROLE_CONFIRMS_BACKEND
STATUS_LAST_EVENT_RECORDED
SWITCH_CONFIRM_ON_BUSY
SWITCH_CONFIRM_RELOADED
SWITCH_IDLE_HINT
```

代表行：`ANCHOR_CARD_ANSWERED true→false`、`OPEN_CARD_STABLE_AT_ANCHOR true→false`、`DENIED_OPEN_COUNT 2→0`、`HAS_DENIED_INLINE 2→0`、`INJECTED_CHIP_LABEL 原始交接内容 · 来源未确认→回交投递 · 来自 规划者`、`RECOVERY_SAME_PENDING_CARD_ONCE false→false`（同值但真红）。G4 不得作为允许差异；5A 门不通过。

## 六、G5 派生行

`E2E_FAILURES`（旧 1 项→新 10 项）与 `E2E_PASS`（false→false）随 G4/G3/G2 底层逐项裁定；不单独批准。

## 七、NEW-ONLY 9 / OLD-ONLY 1

| name | 旧端能力/替代 |
| --- | --- |
| `P13_CONTINUE_AFTER_RETURN` | 旧端无 P1-3 新语义；替代旧 `P13_NEW_SEMANTICS` |
| `P13_OLD_PROJECT_BUSY` | 同上 |
| `P13_OLD_SESSION_LIVE_AFTER_SWITCH` | 同上 |
| `P13_QUEUED_BEFORE_SWITCH` | 同上 |
| `P13_QUEUE_SURVIVES_SWITCH` | 同上 |
| `P13_RETURN_RESUMES_SESSION` | 同上 |
| `P13_SWITCH_IMMEDIATE` | 同上 |
| `PROMISE_TIMEOUT` | 旧端无超时记录；待 PM 判 G4/诊断替代，不自动豁免 |
| `WAIT_TIMEOUT` | 同上 |
| `P13_NEW_SEMANTICS`（OLD-ONLY） | 旧端专属；新端 7×P13_* 替代 |

安全/fail-closed/持久化/权限类检查不得退役；`P13_*` 不涉及这些类别，但仍需 PM 逐条批准。

## 八、当前门状态

- 本轮 **5A needs-work**：G4 43 项不得列差异、G3 中无精确等价项需降 G4、NEW-ONLY timeout 待判；6 个 uiux NEW-FAIL、DEFAULT/COMPLETE_FLOW 截断、design audit 12 条旧 DOM 失配仍未关闭。
- 候选在 18:33–18:36 仍有 `main.mjs`/`chat-store.ts`/`phase4b.css` 修复落盘；本台账基于 18:22 构建/新端全量。待修复稳定后重跑受影响 main/uiux/design audit，更新本台账与证据；未批准行一律未批准，**5A 门不通过**。
- 只写 `角色卡/测试/` 与 `test/测试/`；未改产品断言/配置。
