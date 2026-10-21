# Phase 5A main.mjs 允许差异台账（G1–G5 重分组）

> 候选冻结后新端 365 名；共 366 行。G0 = 同名同值未列入差异；G4 为不得列差异的真实/夹具缺陷；PM 决定见各节。

| 组 | 行数 | 含义 | PM |
| --- | --- | --- | --- |
| G1 | 19 | 环境/实例归一化（版本/路径/截图 time） | 可整组批准（代表 ELECTRON/NODE 同值） |
| G2 | 12 | 已批准 UI/设计差异（状态前缀/PI 键集/类名/文案/布局） | 逐名批准 |
| G3 | 28 | 旧载体/调试字段且有新等价检查 | 逐名批准替代覆盖 |
| G4 | 43 | 真实行为/夹具缺陷（含 RECOVERY_SAME 同值 false） | **不得批准，5A 修** |
| G5 | 2 | 派生行（E2E_FAILURES/E2E_PASS） | 随底层 |
| G0 | 252 | 同名同值 MATCH | — |
| NEW-ONLY | 9 | 新端能力/超时 | 逐条批准或归 G4 |
| OLD-ONLY | 1 | 旧端专属 P13_NEW_SEMANTICS | 逐条批准替代 |

## G1 环境/实例归一化（19）

代表行：`OUTDIR` `/tmp/ans-p5a-old…`→`/tmp/ans-p5a-new…`；`RENDERER_ENTRY` 旧入口→dist；`SHOT_*` 输出目录。`ELECTRON=44.7.0`、`NODE=24.21.0`、`PROJECT` 同名同值，作为组代表。

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

## G2 已批准 UI/设计差异（12）

代表行：`STATUS_BADGE_TEXT` `●空闲`→`空闲`；`PI_FIELD_COUNT` 5→6；`PI_KEYS_ARE_FIVE`/`PI_FIELDS_MATCH_REGISTRY` 因新增 `ANS_PI_PROMPT_TIMEOUT_MS` 及 piKeys 名集变化；`SYS_ROWS` 类名列表；`U1_*` 布局/几何。

```
PI_FIELDS_MATCH_REGISTRY
PI_FIELD_COUNT
PI_KEYS_ARE_FIVE
PI_SAVE_STATUS
RESUME_HINT
ROLE_STATE_BADGE_HAS_ICON
ROLE_STATE_BADGE_HOVER_FULL
STATUS_BADGE_TEXT
SYS_ROWS
U1_NORMAL_TO_BOTTOM
U1_NORMAL_TO_BOTTOM_DIST
U1_PANE_HEIGHT
```

## G3 旧载体/调试字段 + 新等价检查（28）

逐名替代覆盖如下；没有通过等价检查的不得留在 G3。

```
BADGES_CLEAR_ON_EMPTY
BADGE_ON_WORK_WHILE_COLLAPSED
DISPATCH_ROW_NO_WITHDRAW
DRAWER_CLOSED_AFTER_PI
OPX_ANSWERED
OPX_BADGE_CLEARED
OPX_POINTER_IN_VIEWED_PANE
OP_CANCEL_DECLINED
OP_CARD_FROZEN
OP_CARD_PRESENT
OP_CARD_TITLE_SHOWS
OP_CONFIRM_ANSWERED
OP_MULTI_ANSWERED
OP_MULTI_HAS_CHECKBOX
OP_PREVIEW_COLLAPSED
OP_SELECT_ANSWERED
OP_SELECT_HAS_RADIO
OP_SUBMIT_DISABLED_INITIALLY
REPORT_DELIVERY_DETAILS_COLLAPSED
RESTORE_NO_SUCCESS_DIVIDER
RESTORE_SU_CHAT_SNIPPET
RESTORE_SU_REPLAY_ROWS
RESTORE_SU_RESTORED_FLAG
RIGHT_QUEUE_RUNNING_FIRST
RIGHT_QUEUE_SOURCES
TAB_CARD_ACTIVE
TAB_WORK_ACTIVE
TAB_WORK_ACTIVE_STILL
```

| name | 新等价检查/路径 |
| --- | --- |
| `BADGES_CLEAR_ON_EMPTY` | uiux-v2 WorkOverview 角标/队列预览 + QUEUE_VIEW 4/4（路径覆盖，待 PM 确认等价） |
| `BADGE_ON_WORK_WHILE_COLLAPSED` | uiux-v2 WorkOverview 角标/队列预览 + QUEUE_VIEW 4/4（路径覆盖，待 PM 确认等价） |
| `DISPATCH_ROW_NO_WITHDRAW` | uiux-v2 QUEUE_VIEW 4/4 + WorkOverview 队列/撤回动作 |
| `DRAWER_CLOSED_AFTER_PI` | uiux-v2 RUNTIME `runtime settings geometry 1360/960` + VISUAL drawer checks |
| `OPX_ANSWERED` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `OPX_BADGE_CLEARED` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `OPX_POINTER_IN_VIEWED_PANE` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `OP_CANCEL_DECLINED` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `OP_CARD_FROZEN` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `OP_CARD_PRESENT` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `OP_CARD_TITLE_SHOWS` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `OP_CONFIRM_ANSWERED` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `OP_MULTI_ANSWERED` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `OP_MULTI_HAS_CHECKBOX` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `OP_PREVIEW_COLLAPSED` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `OP_SELECT_ANSWERED` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `OP_SELECT_HAS_RADIO` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `OP_SUBMIT_DISABLED_INITIALLY` | uiux-v2 MIRROR 8/8（W6-C mirror card rendered… / answering mirror freezes… / source face… / queued aggregate… / presented queue…）+ QUEUE_VIEW 4/4 |
| `REPORT_DELIVERY_DETAILS_COLLAPSED` | uiux-v2 VISUAL report source/details checks |
| `RESTORE_NO_SUCCESS_DIVIDER` | uiux-v2 FRESH 4/4（P5 fresh/actual old history）+ RUNTIME `Pi own history background queue draft and expired card restored` |
| `RESTORE_SU_CHAT_SNIPPET` | uiux-v2 FRESH 4/4（P5 fresh/actual old history）+ RUNTIME `Pi own history background queue draft and expired card restored` |
| `RESTORE_SU_REPLAY_ROWS` | uiux-v2 FRESH 4/4（P5 fresh/actual old history）+ RUNTIME `Pi own history background queue draft and expired card restored` |
| `RESTORE_SU_RESTORED_FLAG` | uiux-v2 FRESH 4/4（P5 fresh/actual old history）+ RUNTIME `Pi own history background queue draft and expired card restored` |
| `RIGHT_QUEUE_RUNNING_FIRST` | uiux-v2 QUEUE_VIEW 4/4 + WorkOverview 队列预览/当前工作 |
| `RIGHT_QUEUE_SOURCES` | uiux-v2 QUEUE_VIEW 4/4 + WorkOverview 队列预览/当前工作 |
| `TAB_CARD_ACTIVE` | uiux-v2 VISUAL `V2 accepted structural positions and real window controls` + SELECTOR `current click no business reread` + RUNTIME `runtime settings geometry` |
| `TAB_WORK_ACTIVE` | uiux-v2 VISUAL `V2 accepted structural positions and real window controls` + SELECTOR `current click no business reread` + RUNTIME `runtime settings geometry` |
| `TAB_WORK_ACTIVE_STILL` | uiux-v2 VISUAL `V2 accepted structural positions and real window controls` + SELECTOR `current click no business reread` + RUNTIME `runtime settings geometry` |

## G4 真实行为/夹具缺陷（43，不得列差异，5A 修）

包含 `ANCHOR_*`、`OPEN_CARD_*`、`P1_*`、5×`SESSION_REPAIR_*`、`PENDING_*`、`RECOVERY_*`（含同值 false `RECOVERY_SAME_PENDING_CARD_ONCE`）、`DRAWER_ESC_CLOSES`、`DENIED_OPEN_COUNT`、`HAS_DENIED_INLINE`、`BOOTSTRAP_*`、`INJECTED_CHIP_LABEL`、`DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS` 等。代表行：`ANCHOR_CARD_ANSWERED true→false`、`OPEN_CARD_PRESENT true→false`、`DENIED_OPEN_COUNT 2→0`、`INJECTED_CHIP_LABEL` 旧「原始交接内容 · 来源未确认」→新「回交投递 · 来自 规划者」。

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

## G5 派生行（2）

`E2E_FAILURES` 随 G4/G3 底层；`E2E_PASS=false` 随底层，不单独批准。

```
E2E_FAILURES
E2E_PASS
```

## NEW-ONLY（9）

P13_* 7 项替代旧 `P13_NEW_SEMANTICS`（旧端无 P1-3 新语义）；`PROMISE_TIMEOUT`/`WAIT_TIMEOUT` 旧端无对应能力，待 PM 判为 G4 或诊断替代。

```
P13_CONTINUE_AFTER_RETURN
P13_OLD_PROJECT_BUSY
P13_OLD_SESSION_LIVE_AFTER_SWITCH
P13_QUEUED_BEFORE_SWITCH
P13_QUEUE_SURVIVES_SWITCH
P13_RETURN_RESUMES_SESSION
P13_SWITCH_IMMEDIATE
PROMISE_TIMEOUT
WAIT_TIMEOUT
```

## OLD-ONLY/REMOVED（1）

`P13_NEW_SEMANTICS`：旧端专属；替代覆盖=新端 P13_* 7 项（忙时切项目/旧会话/排队/返回）。安全/fail-closed/持久化/权限检查不得退役。

```
P13_NEW_SEMANTICS
```


## 代表行（逐组）

| 组 | name | 旧值 | 新值 | 依据/处置 |
| --- | --- | --- | --- | --- |
| G1 | `OUTDIR` | /tmp/ans-p5a-old.* | /tmp/ans-p5a-new.* | 实例路径，归一化 |
| G1 | `ELECTRON`/`NODE` | 44.7.0/24.21.0 | 同值 | 同值代表，不需要差异 |
| G2 | `STATUS_BADGE_TEXT` | ●空闲 | 空闲 | 已批准状态前缀 |
| G2 | `PI_FIELD_COUNT` | 5 | 6 | 已批准 piKeys 名集/新增 PROMPT_TIMEOUT |
| G3 | `OP_CARD_PRESENT` | true | false | 新端等价 MIRROR/queue 载体（见上表） |
| G4 | `ANCHOR_CARD_ANSWERED` | true | false | 5A 修，不得列差异 |
| G4 | `OPEN_CARD_PRESENT` | true | false | 5A 修，不得列差异 |
| G4 | `DENIED_OPEN_COUNT` | 2 | 0 | 5A 修，不得列差异 |
| G4 | `RECOVERY_SAME_PENDING_CARD_ONCE` | false | false | 同值但真红；旧 C，新端恢复链；5A 修/复判 |
| G5 | `E2E_FAILURES` | RECOVERY_SAME… | 10 项列表 | 随底层 |

