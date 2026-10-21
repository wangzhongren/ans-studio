# 5A main.mjs 允许差异台账（候选冻结后新端全量）

> 数据源：桌面窗口最新 `report-diff.json`（old 357/new 365/common 356/only-old 1/only-new 9/值差异 102）+ 测试独立旧端 `raw/main` 与新端 `raw/main`。共 366 行，PM 决定 proposed/—。

| name | status | 旧值 | 新值 | 旧→新/依据 | 替代覆盖 | PM 决定 |
| --- | --- | --- | --- | --- | --- | --- |
| `ACCEPTED_ROWS` | MATCH | 0 | 0 | 同名同值 | — | — |
| `ANCHOR_CARD_ANSWERED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `ANCHOR_CARD_AT_ARRIVAL` | MATCH（值差异） | 6 | -1 | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `ANCHOR_NO_DUPLICATE_ROW` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `ANCHOR_ROW_AFTER_SWITCHBACK` | MATCH（值差异） | {"count":207,"last":206,"ops":[{"index":6,"requestId":"op-6"}]} | {"count":205,"last":204,"ops":[]} | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `ANCHOR_STABLE_NOT_TAIL_ONCE` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `ANCHOR_STABLE_NOT_TAIL_TWICE` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `ANCHOR_TABLE_REGISTERED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `ASSISTANT_BUBBLES` | MATCH | 4 | 4 | 同名同值 | — | — |
| `BADGES_CLEAR_ON_EMPTY` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `BADGE_ON_WORK_WHILE_COLLAPSED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `BOOTSTRAP_ACTION_REMOVED` | MATCH | true | true | 同名同值 | — | — |
| `BOOTSTRAP_CENTER_CTA_PRESENT` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `BOOTSTRAP_DEFAULT_SELECTED` | MATCH | liaison | liaison | 同名同值 | — | — |
| `BOOTSTRAP_HAS_ROLES` | MATCH | false | false | 同名同值 | — | — |
| `BOOTSTRAP_HINT_EMPTY` | MATCH | true | true | 同名同值 | — | — |
| `BOOTSTRAP_LEFT_NOTICE_ABSENT` | MATCH | true | true | 同名同值 | — | — |
| `BOOTSTRAP_MENTION_COUNT` | MATCH（值差异） | 1 | 0 | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `BOOTSTRAP_MENTION_IN_CENTER_EMPTY` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `BOOTSTRAP_NO_LEFT_NOTICE_ELEMENT` | MATCH | true | true | 同名同值 | — | — |
| `BOOTSTRAP_PRIMARY` | MATCH | liaison | liaison | 同名同值 | — | — |
| `BOOTSTRAP_ROLE_COUNT` | MATCH | 5 | 5 | 同名同值 | — | — |
| `BOOTSTRAP_SU_NO_READONLY_BADGE` | MATCH | true | true | 同名同值 | — | — |
| `CHAT_CTA_PRESENT` | MATCH | false | false | 同名同值 | — | — |
| `CHAT_CTA_TEXT` | MATCH |  |  | 同名同值 | — | — |
| `CHAT_HEADER_ROLE` | MATCH | 桌面窗口 | 桌面窗口 | 同名同值 | — | — |
| `CHAT_HEAD_ONLY_APPROVED_BUTTONS` | MATCH | true | true | 同名同值 | — | — |
| `CLICKED_DESKTOP_ROLE` | MATCH | true | true | 同名同值 | — | — |
| `COMPOSER_ATTACH_BTN` | MATCH | true | true | 同名同值 | — | — |
| `COMPOSER_CHILD_ROWS` | MATCH | 4 | 4 | 同名同值 | — | — |
| `COMPOSER_CLEAN` | MATCH | true | true | 同名同值 | — | — |
| `COMPOSER_HAS_TEXTAREA_SEND` | MATCH | true | true | 同名同值 | — | — |
| `COMPOSER_ROWS_ARE_ATTACH_CAPSULE_NOTE` | MATCH | false | false | 同名同值 | — | — |
| `COMPOSER_SEND_INSIDE_CAPSULE` | MATCH | true | true | 同名同值 | — | — |
| `CUSTOM_TITLEBAR_PRESENT` | MATCH | true | true | 同名同值 | — | — |
| `DATA_STATE_IDLE_AFTER_ROUND` | MATCH | true | true | 同名同值 | — | — |
| `DATA_STATE_RUN_WHILE_BUSY` | MATCH | true | true | 同名同值 | — | — |
| `DEFAULT_SELECTED_ROLE` | MATCH | su | su | 同名同值 | — | — |
| `DENIED_OPEN_COUNT` | MATCH（值差异） | 2 | 0 | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `DESKTOP_ROLE_NO_READONLY_BADGE` | MATCH | true DESKTOP_ROLE_NO_READONLY_ROWS=true | true DESKTOP_ROLE_NO_READONLY_ROWS=true | 同名同值 | — | — |
| `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS` | MATCH（值差异） | true | false | 诊断字段：缺 renderer.* 事件（非用户行为，待 PM 判替代覆盖） | 产品/诊断缺陷候选：5A 前修复或 PM 批准替代，不得静默豁免 | proposed |
| `DISPATCH_ROW_NO_WITHDRAW` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `DRAWER_CLOSED_AFTER_N3` | MATCH | true | true | 同名同值 | — | — |
| `DRAWER_CLOSED_AFTER_PI` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `DRAWER_DEFAULT_CLOSED` | MATCH | true | true | 同名同值 | — | — |
| `DRAWER_ESC_CLOSES` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `DRAWER_OPENS_ON_TAB` | MATCH | true | true | 同名同值 | — | — |
| `DRAWER_TITLE_CARD` | MATCH | 桌面窗口 · 角色资料 | 桌面窗口 · 角色资料 | 同名同值 | — | — |
| `DRAWER_TITLE_WORK` | MATCH | 桌面窗口 · 工作概览 | 桌面窗口 · 工作概览 | 同名同值 | — | — |
| `DRAWER_TOGGLES_CLOSED` | MATCH | true | true | 同名同值 | — | — |
| `E2E_DONE` | MATCH | 1 | 1 | 同名同值 | — | — |
| `E2E_FAILURES` | MATCH（值差异） | RECOVERY_SAME_PENDING_CARD_ONCE | SESSION_REPAIR_SAME_ROLE_CONFIRMS_BACKEND, SESSION_REPAIR_EXPLICIT_RECOVERY_DELIVERS_ONCE, SESSION_REPAIR_FAILED_OPEN_DOES_NOT_SEND, SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE, SESS… | 失败汇总派生值 | 按底层 10 项逐项裁定 | proposed |
| `E2E_PASS` | MATCH | false | false | 同名同值 | — | — |
| `ELECTRON` | MATCH | 44.7.0 | 44.7.0 | 同名同值 | — | — |
| `EVENT_BATCH_CONTINUES_AFTER_ERROR` | MATCH | true | true | 同名同值 | — | — |
| `FIRST_ROLE_ID` | MATCH | su | su | 同名同值 | — | — |
| `HANDBACK_CARD_PRESENT` | MATCH | true | true | 同名同值 | — | — |
| `HANDBACK_EVIDENCE_ROWS` | MATCH | 1 | 1 | 同名同值 | — | — |
| `HANDBACK_NOT_MIRROR` | MATCH | true | true | 同名同值 | — | — |
| `HANDBACK_STATUS_OK` | MATCH | true | true | 同名同值 | — | — |
| `HANDBACK_TITLE` | MATCH | 报告声明：已完成 | 报告声明：已完成 | 同名同值 | — | — |
| `HAS_DENIED_GROUPED` | MATCH | true | true | 同名同值 | — | — |
| `HAS_DENIED_INLINE` | MATCH（值差异） | 2 | 0 | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `HAS_OTHER_GROUP` | MATCH | false | false | 同名同值 | — | — |
| `HAS_ROUND2` | MATCH | true | true | 同名同值 | — | — |
| `HISTORY_KEPT_ON_SWITCHBACK` | MATCH | true | true | 同名同值 | — | — |
| `IMG_LEGACY_NOTE_ABSENT` | MATCH | true | true | 同名同值 | — | — |
| `IMG_PASSTHROUGH_QUEUED` | MATCH | true | true | 同名同值 | — | — |
| `IMG_QUEUE_FROZEN` | MATCH | true | true | 同名同值 | — | — |
| `IMG_REJECT_BAD_MIME` | MATCH | true | true | 同名同值 | — | — |
| `IMG_REJECT_OVERSIZE` | MATCH | true | true | 同名同值 | — | — |
| `IMG_SEND_OK` | MATCH | true IMG_PASSTHROUGH_DIRECT=true | true IMG_PASSTHROUGH_DIRECT=true | 同名同值 | — | — |
| `IMG_SLOW_ROUND_OK` | MATCH | true IMG_DEMO_LOG=[{"t":"队列慢轮","img":false},{"t":"队一","img":false},{"t":"队三","img":false},{"t":"排队带图","img":true}] | true IMG_DEMO_LOG=[{"t":"队列慢轮","img":false},{"t":"队一","img":false},{"t":"队三","img":false},{"t":"排队带图","img":true}] | 同名同值 | — | — |
| `INJECTED_CHIP_LABEL` | MATCH（值差异） | 原始交接内容 · 来源未确认 | 回交投递 · 来自 规划者 | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `INJECTED_NOT_USER_BUBBLE` | MATCH | true | true | 同名同值 | — | — |
| `INJECTED_STYLE_PRESENT` | MATCH | true | true | 同名同值 | — | — |
| `LINK_OPEN_EXTERNAL_CALLED` | MATCH | true | true | 同名同值 | — | — |
| `MAC_CLOSE_REOPEN_LOADS_WITHOUT_DUPLICATE_HANDLERS` | MATCH | true | true | 同名同值 | — | — |
| `MAC_CLOSE_REOPEN_NO_AUTO_SEND` | MATCH | true | true | 同名同值 | — | — |
| `MANUAL_NOT_INJECTED` | MATCH | true | true | 同名同值 | — | — |
| `MANUAL_PREFIX_BUBBLE` | MATCH | true | true | 同名同值 | — | — |
| `MD_STRONG_RENDERED` | MATCH | true | true | 同名同值 | — | — |
| `MD_TAG_TEXT_ESCAPED` | MATCH | true | true | 同名同值 | — | — |
| `NODE` | MATCH | 24.21.0 | 24.21.0 | 同名同值 | — | — |
| `NORMAL_PROJECT_NO_BOOTSTRAP_MENTION` | MATCH | true | true | 同名同值 | — | — |
| `NO_DEFAULT_MENU_BAR` | MATCH | true | true | 同名同值 | — | — |
| `NO_MODAL_AFTER_IMPORT` | MATCH | true | true | 同名同值 | — | — |
| `NO_MODAL_AFTER_MESSAGES` | MATCH | true | true | 同名同值 | — | — |
| `NO_MODAL_AFTER_RESUME` | MATCH | true | true | 同名同值 | — | — |
| `NO_MODAL_AFTER_ROLE_CLICK` | MATCH | true | true | 同名同值 | — | — |
| `NO_PI_BUTTON_IN_HEADER` | MATCH | true | true | 同名同值 | — | — |
| `NO_RETIRED_TABS` | MATCH | true | true | 同名同值 | — | — |
| `NO_RIGHT_COLUMN` | MATCH | true | true | 同名同值 | — | — |
| `NO_RT_SELECT_CLASS` | MATCH | true | true | 同名同值 | — | — |
| `NO_RUNTIME_SELECTOR` | MATCH | true | true | 同名同值 | — | — |
| `NO_SELECT_ELEMENTS` | MATCH | false | false | 同名同值 | — | — |
| `NO_WELCOME_AFTER_OPEN` | MATCH | true | true | 同名同值 | — | — |
| `OPEN_CARD_AT_ARRIVAL` | MATCH（值差异） | 207 | -1 | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OPEN_CARD_CHIP_VISIBLE` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OPEN_CARD_CLEANED_CHIP_HIDDEN` | MATCH | true | true | 同名同值 | — | — |
| `OPEN_CARD_ROWS_AFTER_SWITCHBACK` | MATCH（值差异） | {"count":208,"last":207,"ops":[{"index":6,"requestId":"op-6"},{"index":207,"requestId":"op-7"}]} | {"count":205,"last":204,"ops":[]} | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OPEN_CARD_STABLE_AT_ANCHOR` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OPX_ANSWERED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OPX_BADGE_CLEARED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OPX_BADGE_LIT` | MATCH | true | true | 同名同值 | — | — |
| `OPX_CARD_ON_RETURN` | MATCH | true | true | 同名同值 | — | — |
| `OPX_DUP_SINGLE_CARD` | MATCH | true | true | 同名同值 | — | — |
| `OPX_EXPIRED_FROZEN` | MATCH | true | true | 同名同值 | — | — |
| `OPX_NOT_IN_VIEWED_PANE` | MATCH | true | true | 同名同值 | — | — |
| `OPX_POINTER_IN_VIEWED_PANE` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OP_B3_AWAITING_CLEARED` | MATCH | false | false | 同名同值 | — | — |
| `OP_B3_AWAITING_CONFIRM` | MATCH | false | false | 同名同值 | — | — |
| `OP_CANCEL_DECLINED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OP_CARD_FROZEN` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OP_CARD_PRESENT` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OP_CARD_TITLE_SHOWS` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OP_CONFIRM_ANSWERED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OP_FORGED_ID_REJECTED` | MATCH | true | true | 同名同值 | — | — |
| `OP_MULTI_ANSWERED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OP_MULTI_HAS_CHECKBOX` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OP_NO_CARD_BEFORE_REQUEST` | MATCH | true | true | 同名同值 | — | — |
| `OP_OLD_CARD_REMOVED` | MATCH | true | true | 同名同值 | — | — |
| `OP_OLD_ENTRY_REMOVED` | MATCH | true | true | 同名同值 | — | — |
| `OP_OUT_OF_SET_REJECTED` | MATCH | true | true | 同名同值 | — | — |
| `OP_PREVIEW_COLLAPSED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OP_SELECT_ANSWERED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OP_SELECT_HAS_RADIO` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OP_SUBMIT_DISABLED_INITIALLY` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `OUTDIR` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg | /tmp/ans-p5a-new.S0FU2W | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `P13_CONTINUE_AFTER_RETURN` | NEW-ONLY |  | true RESULT={"ok":true,"sessionCurrent":true} | 新端 P1-3 新语义拆分（忙时切项目/旧会话/排队/返回） | 替代旧 P13_NEW_SEMANTICS | proposed |
| `P13_NEW_SEMANTICS` | OLD-ONLY/REMOVED | not-applicable-old-confirm-bar |  | 旧端 P1-3 旧占位检查 | 新端 P13_* 7 项拆分替代（待核） | proposed |
| `P13_OLD_PROJECT_BUSY` | NEW-ONLY |  | true | 新端 P1-3 新语义拆分（忙时切项目/旧会话/排队/返回） | 替代旧 P13_NEW_SEMANTICS | proposed |
| `P13_OLD_SESSION_LIVE_AFTER_SWITCH` | NEW-ONLY |  | true | 新端 P1-3 新语义拆分（忙时切项目/旧会话/排队/返回） | 替代旧 P13_NEW_SEMANTICS | proposed |
| `P13_QUEUED_BEFORE_SWITCH` | NEW-ONLY |  | true RESULT={"ok":true,"queued":true,"position":1} | 新端 P1-3 新语义拆分（忙时切项目/旧会话/排队/返回） | 替代旧 P13_NEW_SEMANTICS | proposed |
| `P13_QUEUE_SURVIVES_SWITCH` | NEW-ONLY |  | true | 新端 P1-3 新语义拆分（忙时切项目/旧会话/排队/返回） | 替代旧 P13_NEW_SEMANTICS | proposed |
| `P13_RETURN_RESUMES_SESSION` | NEW-ONLY |  | true | 新端 P1-3 新语义拆分（忙时切项目/旧会话/排队/返回） | 替代旧 P13_NEW_SEMANTICS | proposed |
| `P13_SWITCH_IMMEDIATE` | NEW-ONLY |  | true | 新端 P1-3 新语义拆分（忙时切项目/旧会话/排队/返回） | 替代旧 P13_NEW_SEMANTICS | proposed |
| `P1_ARRIVAL_DEBUG` | MATCH（值差异） | {"hasCard":true,"dist":46,"st":3011,"sh":3491,"ch":434,"crTop":517,"crBottom":640,"ccTop":287,"ccBottom":721,"chipHidden":false} | {"hasCard":false,"dist":0,"st":3138,"sh":3639,"ch":501,"crTop":null,"crBottom":null,"ccTop":233,"ccBottom":734,"chipHidden":false} | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `P1_ARRIVAL_SCROLLED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `P1_CHIP_CLICK_LOCATES` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `P1_CHIP_COUNT1_AFTER_TERMINAL` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `P1_CHIP_COUNT2` | MATCH | true | true | 同名同值 | — | — |
| `P1_CHIP_HIDDEN_AFTER_ALL_TERMINAL` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `P1_CHIP_SECOND_CARD` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `P1_CHIP_VISIBLE` | MATCH | true | true | 同名同值 | — | — |
| `P1_CLEANUP_CHIP_HIDDEN` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `P1_NO_INTERRUPT_TOP` | MATCH | true | true | 同名同值 | — | — |
| `P1_SWITCHBACK_SCROLLS_TO_CARD` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `PENDING_EXPLICIT_SAME_ROLE_CARD_AND_BUTTON_VISIBLE` | MATCH（值差异） | true | false | 真实行为：重载后同角色待确认卡/按钮不可见 | 产品/诊断缺陷候选：5A 前修复或 PM 批准替代，不得静默豁免 | proposed |
| `PI_ADVANCED_COLLAPSED_BY_DEFAULT` | MATCH | true | true | 同名同值 | — | — |
| `PI_ADVANCED_HINT_LEAVE_BLANK` | MATCH | true | true | 同名同值 | — | — |
| `PI_ADVANCED_PRESENT` | MATCH | true | true | 同名同值 | — | — |
| `PI_CONTEXT_WINDOW_IN_ADVANCED` | MATCH | true | true | 同名同值 | — | — |
| `PI_ENTRY_IN_SIDEBAR_FOOT` | MATCH | true | true | 同名同值 | — | — |
| `PI_ENV_NOT_REPO_ROOT` | MATCH | true | true | 同名同值 | — | — |
| `PI_FIELDS_MATCH_REGISTRY` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `PI_FIELD_COUNT` | MATCH（值差异） | 5 | 6 | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `PI_HAS_SAVE_BTN` | MATCH | true | true | 同名同值 | — | — |
| `PI_KEYS_ARE_FIVE` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `PI_NARROW_NO_OVERFLOW` | MATCH | true | true | 同名同值 | — | — |
| `PI_NARROW_STACKED` | MATCH | true | true | 同名同值 | — | — |
| `PI_NARROW_WINDOW` | MATCH | 900 | 900 | 同名同值 | — | — |
| `PI_NO_MODAL` | MATCH | true | true | 同名同值 | — | — |
| `PI_NO_OVERFLOW` | MATCH | true | true | 同名同值 | — | — |
| `PI_NO_PROVIDER_FIELD` | MATCH | true | true | 同名同值 | — | — |
| `PI_PANEL_IN_DRAWER` | MATCH | true | true | 同名同值 | — | — |
| `PI_PANEL_OPEN` | MATCH | true | true | 同名同值 | — | — |
| `PI_PANEL_PATH_IS_TEMP` | MATCH | true | true | 同名同值 | — | — |
| `PI_PROMPT_TIMEOUT_IN_ADVANCED` | MATCH | true | true | 同名同值 | — | — |
| `PI_SAVE_STATUS` | MATCH（值差异） | 已保存到 .env（改动键：ANTHROPIC_AUTH_TOKEN、ANS_PI_BASE_URL、ANS_PI_MODEL）。必填配置已齐备。下一次开启会话时应用。 | 已保存到 .env（改动键 3 个）。必填配置已齐备。下一次开启会话时应用。 | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `PI_STACKED_FIELDS` | MATCH | true | true | 同名同值 | — | — |
| `PI_TEMP_ENV_HAS_BASE_URL` | MATCH | true | true | 同名同值 | — | — |
| `PI_TEMP_ENV_HAS_TOKEN` | MATCH | true | true | 同名同值 | — | — |
| `PI_TEMP_ENV_NO_PROVIDER` | MATCH | true | true | 同名同值 | — | — |
| `PI_TEMP_ENV_OMITS_EMPTY_CONTEXT_WINDOW` | MATCH | true | true | 同名同值 | — | — |
| `PI_TEMP_ENV_WRITTEN` | MATCH | true | true | 同名同值 | — | — |
| `PI_TOKEN_MASKED` | MATCH | true | true | 同名同值 | — | — |
| `PI_TOKEN_PLACEHOLDER_SET` | MATCH | true | true | 同名同值 | — | — |
| `PI_TOKEN_STILL_MASKED` | MATCH | true | true | 同名同值 | — | — |
| `PI_TOKEN_VALUE_CLEARED` | MATCH | true | true | 同名同值 | — | — |
| `PRIMARY_ROLE_ID` | MATCH | su | su | 同名同值 | — | — |
| `PROJECT` | MATCH | /Users/wangzhongren/code/vibeingcode/解压/ans-runtime | /Users/wangzhongren/code/vibeingcode/解压/ans-runtime | 同名同值 | — | — |
| `PROJECT_BTN_INITIAL_IMPORT` | MATCH | true | true | 同名同值 | — | — |
| `PROJECT_BTN_SWITCHED` | MATCH | true | true | 同名同值 | — | — |
| `PROJECT_PATH_SHOWN` | MATCH | /Users/wangzhongren/code/vibeingcode/解压/ans-runtime | /Users/wangzhongren/code/vibeingcode/解压/ans-runtime | 同名同值 | — | — |
| `PROMISE_TIMEOUT` | NEW-ONLY |  | anchor | 新端等待/承诺超时记录（旧端无） | 待 PM：疑似卡片未呈现/等待超时，不是自动豁免 | proposed |
| `QUEUED_EXECUTION_ORDER_1_3` | MATCH | true | true | 同名同值 | — | — |
| `QUEUE_EXPAND_EVIDENCE` | MATCH | {"bText":"收起","fHidden":false,"hasLong":true} | {"bText":"收起","fHidden":false,"hasLong":true} | 同名同值 | — | — |
| `QUEUE_EXPAND_FULL` | MATCH | true | true | 同名同值 | — | — |
| `QUEUE_POSITION_IN_CARD` | MATCH | true | true | 同名同值 | — | — |
| `QUEUE_POSITION_ROWS` | MATCH | 2 | 2 | 同名同值 | — | — |
| `QUEUE_ROWS_AFTER_WITHDRAW` | MATCH | true | true | 同名同值 | — | — |
| `QUEUE_ROWS_THREE` | MATCH | true QUEUE_WITHDRAW_ON_MESSAGES=true QUEUE_FULL_TOGGLE_ON_LONG=true | true QUEUE_WITHDRAW_ON_MESSAGES=true QUEUE_FULL_TOGGLE_ON_LONG=true | 同名同值 | — | — |
| `Q_WITHDRAW_LINE` | MATCH | true | true | 同名同值 | — | — |
| `RECOVERY_ENDED_REQUEST_NOT_REPLAYED` | MATCH（值差异） | true | false | 真实行为：恢复重放复活已结束请求 | 产品/诊断缺陷候选：5A 前修复或 PM 批准替代，不得静默豁免 | proposed |
| `RECOVERY_NO_AUTO_REPLY_OR_SEND` | MATCH | true | true | 同名同值 | — | — |
| `RECOVERY_OLD_REQUEST_STILL_ANSWERABLE` | MATCH（值差异） | true | false | 真实行为：恢复后旧请求不可作答 | 产品/诊断缺陷候选：5A 前修复或 PM 批准替代，不得静默豁免 | proposed |
| `RECOVERY_PROJECT_AND_ROLE_RESTORED` | MATCH | true | true | 同名同值 | — | — |
| `RECOVERY_SAME_PENDING_CARD_ONCE` | MATCH | false | false | 同名同值 | — | — |
| `RECOVERY_VISIBLE_FAILURE_BUTTON` | MATCH | true | true | 同名同值 | — | — |
| `REFRESH_BOOTSTRAP_MENTION_AT_MOST_ONE` | MATCH | true | true | 同名同值 | — | — |
| `REFRESH_HAS_EXAMPLE` | MATCH | true | true | 同名同值 | — | — |
| `REFRESH_HAS_ROLES` | MATCH | true | true | 同名同值 | — | — |
| `REFRESH_LEFT_NOTICE_STAYS_ABSENT` | MATCH | true | true | 同名同值 | — | — |
| `REFRESH_OTHER_GROUP_SHOWN` | MATCH | false | false | 同名同值 | — | — |
| `REFRESH_ROLE_COUNT` | MATCH | 2 | 2 | 同名同值 | — | — |
| `REFRESH_SU_NO_READONLY_BADGE` | MATCH | true | true | 同名同值 | — | — |
| `REFRESH_TREE_HAS_EXAMPLE` | MATCH | true | true | 同名同值 | — | — |
| `RENDERER_ENTRY` | MATCH（值差异） | /Users/wangzhongren/code/vibeingcode/解压/ans-runtime/app/renderer/index.html | /Users/wangzhongren/code/vibeingcode/解压/ans-runtime/app/renderer/dist/src/index.html | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `REPLAY_DEDUP_APPEND` | MATCH | true | true | 同名同值 | — | — |
| `REPLAY_DEDUP_IDEMPOTENT` | MATCH | true | true | 同名同值 | — | — |
| `REPLAY_DEDUP_REBUILD` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `REPLAY_NO_DOUBLE_ON_REFRESH` | MATCH | true | true | 同名同值 | — | — |
| `REPORT_DELIVERY_DETAILS_COLLAPSED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `REPORT_NO_PREMATURE_SU_MIRROR` | MATCH | true | true | 同名同值 | — | — |
| `REPORT_STATUS_ABORTED` | MATCH | true | true | 同名同值 | — | — |
| `REPORT_STATUS_FAILED` | MATCH | true | true | 同名同值 | — | — |
| `REPORT_STATUS_UNREPORTED` | MATCH | true | true | 同名同值 | — | — |
| `RESTORE_BADGE_IS_RESTORED` | MATCH | true | true | 同名同值 | — | — |
| `RESTORE_MD_RENDERED` | MATCH | true | true | 同名同值 | — | — |
| `RESTORE_NO_CROSSTALK` | MATCH | true | true | 同名同值 | — | — |
| `RESTORE_NO_STALE_RESTART_NOTE` | MATCH | true | true | 同名同值 | — | — |
| `RESTORE_NO_SUCCESS_DIVIDER` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `RESTORE_ROWS_PRESENT` | MATCH | true | true | 同名同值 | — | — |
| `RESTORE_SU_CHAT_SNIPPET` | MATCH（值差异） | SU 的历史问题 | 会话记录已恢复SU 的历史问题 | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `RESTORE_SU_OWN_TEXT` | MATCH | true | true | 同名同值 | — | — |
| `RESTORE_SU_REPLAY_ROWS` | MATCH（值差异） | 1 | 2 | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `RESTORE_SU_RESTORED_FLAG` | MATCH（值差异） | {"hadSession":true,"error":false,"awaitingConfirm":false,"restored":true,"lastSummary":"","lastAt":"","historyNotice":"","contextText":"新会话；可读历史保留，模型未恢复","contextWarning":"","reada… | {"error":false,"hadSession":true,"restored":true,"contextText":"新会话；可读历史保留，模型未恢复","live":true} | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `RESUME_HINT` | MATCH（值差异） | 已在该角色的会话中，续接当前会话。 |  | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `RIGHT_CARD_MD_NO_SCRIPT` | MATCH | true | true | 同名同值 | — | — |
| `RIGHT_CARD_MD_RENDERED` | MATCH | true | true | 同名同值 | — | — |
| `RIGHT_HAS_BOUNDARY` | MATCH | true RIGHT_BOUNDARY_ROWS=46 | true RIGHT_BOUNDARY_ROWS=46 | 同名同值 | — | — |
| `RIGHT_HAS_CARD` | MATCH | true | true | 同名同值 | — | — |
| `RIGHT_HAS_CHANGELOG` | MATCH | true RIGHT_HAS_DOCS=true | true RIGHT_HAS_DOCS=true | 同名同值 | — | — |
| `RIGHT_HAS_TODO_SECTION` | MATCH | true RIGHT_QUEUE_SINGLE_LIST=true | true RIGHT_QUEUE_SINGLE_LIST=true | 同名同值 | — | — |
| `RIGHT_QUEUE_EMPTY_PLACEHOLDER` | MATCH | true | true | 同名同值 | — | — |
| `RIGHT_QUEUE_ROWS` | MATCH | 3 | 3 | 同名同值 | — | — |
| `RIGHT_QUEUE_RUNNING_FIRST` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `RIGHT_QUEUE_SECTION` | MATCH | true | true | 同名同值 | — | — |
| `RIGHT_QUEUE_SOURCES` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `ROLE_COUNT` | MATCH | 16 | 16 | 同名同值 | — | — |
| `ROLE_IDS` | MATCH | su, 编排, 测试, 产品, 独立验收, 门禁引擎, 项目管理, 宣传, 运行时核心, 装配, 桌面窗口, 桌面UI, Claude适配器, Codex适配器, Pi适配器, UIUX设计师 | su, 编排, 测试, 产品, 独立验收, 门禁引擎, 项目管理, 宣传, 运行时核心, 装配, 桌面窗口, 桌面UI, Claude适配器, Codex适配器, Pi适配器, UIUX设计师 | 同名同值 | — | — |
| `ROLE_STATE_BADGE_HAS_ICON` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `ROLE_STATE_BADGE_HOVER_FULL` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `ROLE_STATE_BADGE_WORKING_PENDING` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `ROLE_STATE_CLEARED` | MATCH | true | true | 同名同值 | — | — |
| `ROLE_STATE_QUEUE_ROW` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `RUNTIME_NOTE_IN_COMPOSE_NOTE` | MATCH | true | true | 同名同值 | — | — |
| `RUNTIME_NOTE_ONE_LINE_GATED` | MATCH | true | true | 同名同值 | — | — |
| `RUNTIME_NOTE_WRITES_IMPORTED` | MATCH | true | true | 同名同值 | — | — |
| `S1_NOT_YANKED` | MATCH | true | true | 同名同值 | — | — |
| `S1_SMALL_PANE_NOT_YANKED` | MATCH | true | true | 同名同值 | — | — |
| `S1_SMALL_PANE_STICK` | MATCH | true | true | 同名同值 | — | — |
| `S1_SMALL_PANE_STICK_DIST` | MATCH | 0 | 0 | 同名同值 | — | — |
| `S1_STAYED_AWAY_FROM_BOTTOM` | MATCH | true | true | 同名同值 | — | — |
| `S1_STICK_AGAIN` | MATCH | true | true | 同名同值 | — | — |
| `S1_STICK_AGAIN_DIST` | MATCH | 0 | 0 | 同名同值 | — | — |
| `S1_STICK_AT_BOTTOM` | MATCH | true | true | 同名同值 | — | — |
| `S1_STICK_AT_BOTTOM_DIST` | MATCH | 0 | 0 | 同名同值 | — | — |
| `S1_WINDOWED_ACTIVE` | MATCH | true | true | 同名同值 | — | — |
| `SEND_ENABLED_WHILE_BUSY` | MATCH | true | true | 同名同值 | — | — |
| `SEND_QUEUES_WHILE_BUSY` | MATCH | true | true | 同名同值 | — | — |
| `SESSION_NOT_AUTO_OPENED` | MATCH | false | false | 同名同值 | — | — |
| `SESSION_REPAIR_CONFIRM_PRESERVES_HISTORY` | MATCH | true | true | 同名同值 | — | — |
| `SESSION_REPAIR_EXPLICIT_RECOVERY_DELIVERS_ONCE` | MATCH（值差异） | true | false | 真实行为：显式恢复后投递非恰一次 | 产品/诊断缺陷候选：5A 前修复或 PM 批准替代，不得静默豁免 | proposed |
| `SESSION_REPAIR_FAILED_OPEN_DOES_NOT_SEND` | MATCH（值差异） | true | false | 真实行为：补开失败仍发送（fail-closed 缺口） | 产品/诊断缺陷候选：5A 前修复或 PM 批准替代，不得静默豁免 | proposed |
| `SESSION_REPAIR_FAILED_OPEN_EXPLICIT_RECOVERY` | MATCH | true | true | 同名同值 | — | — |
| `SESSION_REPAIR_FAILED_OPEN_NO_REPLAY` | MATCH（值差异） | true | false | 真实行为：补开失败后回放/发送计数变化 | 产品/诊断缺陷候选：5A 前修复或 PM 批准替代，不得静默豁免 | proposed |
| `SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE` | MATCH（值差异） | true | false | 真实行为：补开失败用户气泡行数不符 | 产品/诊断缺陷候选：5A 前修复或 PM 批准替代，不得静默豁免 | proposed |
| `SESSION_REPAIR_FAILED_OPEN_PRESERVES_INPUT` | MATCH | true | true | 同名同值 | — | — |
| `SESSION_REPAIR_NO_AUTOMATIC_RESEND` | MATCH | true | true | 同名同值 | — | — |
| `SESSION_REPAIR_SAME_ROLE_CONFIRMS_BACKEND` | MATCH（值差异） | true | false | 真实行为：同角色再点击未触发后端重新确认（会话修复） | 产品/诊断缺陷候选：5A 前修复或 PM 批准替代，不得静默豁免 | proposed |
| `SESSION_REPAIR_SEND_EXCEPTION_INVALIDATES` | MATCH | true | true | 同名同值 | — | — |
| `SESSION_REPAIR_SEND_FAILURE_INVALIDATES` | MATCH | true | true | 同名同值 | — | — |
| `SESSION_STATE` | MATCH | idle | idle | 同名同值 | — | — |
| `SESSION_STATE_AFTER` | MATCH | idle | idle | 同名同值 | — | — |
| `SESSION_STATE_AFTER_RESUME` | MATCH | idle | idle | 同名同值 | — | — |
| `SETTLED_ROW_PRESENT` | MATCH | true | true | 同名同值 | — | — |
| `SHELL_CONFIRM_COMMAND_VERBATIM` | MATCH | true | true | 同名同值 | — | — |
| `SHELL_CONFIRM_DENY_DEFAULT_FOCUS` | MATCH | true | true | 同名同值 | — | — |
| `SHELL_CONFIRM_DETAILS_COLLAPSED` | MATCH | true | true | 同名同值 | — | — |
| `SHELL_CONFIRM_ESC_NOT_ALLOWED` | MATCH | false | false | 同名同值 | — | — |
| `SHELL_CONFIRM_REASON_PLAIN` | MATCH | true | true | 同名同值 | — | — |
| `SHELL_CONFIRM_SUMMARY_PLAIN` | MATCH | true | true | 同名同值 | — | — |
| `SHELL_CONFIRM_VISIBLE` | MATCH | true | true | 同名同值 | — | — |
| `SHOT_00_TITLEBAR` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/00-titlebar.png | /tmp/ans-p5a-new.S0FU2W/00-titlebar.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_01B_SU` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/01b-su.png | /tmp/ans-p5a-new.S0FU2W/01b-su.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_01_IMPORT` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/01-import.png | /tmp/ans-p5a-new.S0FU2W/01-import.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_02_CHAT` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/02-chat.png | /tmp/ans-p5a-new.S0FU2W/02-chat.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_03_DENIED` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/03-denied.png | /tmp/ans-p5a-new.S0FU2W/03-denied.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_04_PROFILE` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/04-profile.png | /tmp/ans-p5a-new.S0FU2W/04-profile.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_05_BOOTSTRAP` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/05-bootstrap.png | /tmp/ans-p5a-new.S0FU2W/05-bootstrap.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_06_REFRESH` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/06-refresh.png | /tmp/ans-p5a-new.S0FU2W/06-refresh.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_07_HANDBACK` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/07-handback.png | /tmp/ans-p5a-new.S0FU2W/07-handback.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_08_SU_PANE` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/08-su-pane.png | /tmp/ans-p5a-new.S0FU2W/08-su-pane.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_09_PI_PANEL` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/09-pi-panel.png | /tmp/ans-p5a-new.S0FU2W/09-pi-panel.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_10_PI_SAVED` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/10-pi-saved.png | /tmp/ans-p5a-new.S0FU2W/10-pi-saved.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_11_OPERATOR` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/11-operator-card.png | /tmp/ans-p5a-new.S0FU2W/11-operator-card.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_12_COMPOSER` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/12-composer.png | /tmp/ans-p5a-new.S0FU2W/12-composer.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_12_RESTORE` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/12-restore.png | /tmp/ans-p5a-new.S0FU2W/12-restore.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_14_OP_CROSSPANE` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/14-operator-crosspane.png | /tmp/ans-p5a-new.S0FU2W/14-operator-crosspane.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SHOT_15_ANCHOR` | MATCH（值差异） | /tmp/ans-p5a-old.6MXYfg/15-anchor-reanchor.png | /tmp/ans-p5a-new.S0FU2W/15-anchor-reanchor.png | 环境/路径/截图输出差异，非行为 | 环境归一后复跑 | proposed |
| `SOURCE_REPORT_BLOCKED` | MATCH | true | true | 同名同值 | — | — |
| `SOURCE_REPORT_EVIDENCE_PLACEHOLDER` | MATCH | true | true | 同名同值 | — | — |
| `STATUS_BADGE_IS_IDLE` | MATCH | true | true | 同名同值 | — | — |
| `STATUS_BADGE_TEXT` | MATCH（值差异） | ●空闲 | 空闲 | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `STATUS_LAST_EVENT_RECORDED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `STOP_HIDDEN_AFTER_SNAPSHOT_RESET` | MATCH | true | true | 同名同值 | — | — |
| `STOP_HIDDEN_WHEN_IDLE` | MATCH | true | true | 同名同值 | — | — |
| `STOP_IN_COMPOSER` | MATCH | true | true | 同名同值 | — | — |
| `STOP_LINE_UNSUPPORTED` | MATCH | true | true | 同名同值 | — | — |
| `STOP_VISIBLE_WHEN_BUSY` | MATCH | true | true | 同名同值 | — | — |
| `STOP_VISIBLE_WITH_REAL_BUSY` | MATCH | true | true | 同名同值 | — | — |
| `SU_BADGE_LABELS` | MATCH | 主入口：默认入口与主路径；内置角色：定义在 SKILL.md，无角色目录 | 主入口：默认入口与主路径；内置角色：定义在 SKILL.md，无角色目录 | 同名同值 | — | — |
| `SU_CHAT_HEADER` | MATCH | su | su | 同名同值 | — | — |
| `SU_CLICKED` | MATCH | true | true | 同名同值 | — | — |
| `SU_DEFAULT_ACTIVE` | MATCH | true SU_PRIMARY_BADGE=true SU_IN_MAIN_GROUP=true | true SU_PRIMARY_BADGE=true SU_IN_MAIN_GROUP=true | 同名同值 | — | — |
| `SU_DELIVERY_CARD_PRESENT` | MATCH | true | true | 同名同值 | — | — |
| `SU_IS_FIRST` | MATCH | true | true | 同名同值 | — | — |
| `SU_NO_INLINE_WRITE_ROWS` | MATCH | true | true | 同名同值 | — | — |
| `SU_NO_MODAL` | MATCH | true | true | 同名同值 | — | — |
| `SU_NO_READONLY_BADGE` | MATCH | true | true | 同名同值 | — | — |
| `SU_NO_READONLY_NOTE` | MATCH | true SU_NO_READONLY_ROWS=true | true SU_NO_READONLY_ROWS=true | 同名同值 | — | — |
| `SU_NO_WELCOME` | MATCH | true | true | 同名同值 | — | — |
| `SU_SESSION_STATE` | MATCH | idle | idle | 同名同值 | — | — |
| `SU_TREE_CLASS` | MATCH | true SU_TREE_BADGE=true SU_TREE_NAME=su | true SU_TREE_BADGE=true SU_TREE_NAME=su | 同名同值 | — | — |
| `SU_WRITE_NOTE_IN_COMPOSE_NOTE` | MATCH | true | true | 同名同值 | — | — |
| `SU_WRITE_NOTE_WRITES_IMPORTED` | MATCH | true | true | 同名同值 | — | — |
| `SWITCH_BAR_NOT_IN_CHAT` | MATCH | true | true | 同名同值 | — | — |
| `SWITCH_CANCEL_NOOP` | MATCH | true | true | 同名同值 | — | — |
| `SWITCH_CONFIRM_ON_BUSY` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `SWITCH_CONFIRM_RELOADED` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `SWITCH_IDLE_HINT` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `SWITCH_NO_CONFIRM_WHEN_IDLE` | MATCH | true | true | 同名同值 | — | — |
| `SWITCH_SETUP_BUSY` | MATCH | true | true | 同名同值 | — | — |
| `SYS_ROWS` | MATCH（值差异） | sys sys-context-event \| sys sys-settled \| sys sys-settled | sys sys-call sys-unknown-tool-event \| sys sys-call \| sys sys-settled \| sys sys-call sys-unknown-tool-event \| sys sys-call \| sys sys-settled | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `TABS_PRESENT` | MATCH | true | true | 同名同值 | — | — |
| `TAB_CARD_ACTIVE` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `TAB_WORK_ACTIVE` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `TAB_WORK_ACTIVE_STILL` | MATCH（值差异） | true | false | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `TITLEBAR_HAS_THREE_BUTTONS` | MATCH | true | true | 同名同值 | — | — |
| `TITLEBAR_IS_DRAG_REGION` | MATCH | true | true | 同名同值 | — | — |
| `TOOLROW_HAS_PATH` | MATCH | true | true | 同名同值 | — | — |
| `TOOLROW_NO_CONTENT` | MATCH | true | true | 同名同值 | — | — |
| `U1_NORMAL_TO_BOTTOM` | MATCH（值差异） | false | true | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `U1_NORMAL_TO_BOTTOM_DIST` | MATCH（值差异） | 10 | 0 | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `U1_PANE_HEIGHT` | MATCH（值差异） | 12683 | 12580 | 待分类：旧端基线 vs 新端载体/夹具/交互差异 | 待逐名复验 + PM | proposed |
| `U1_REPEAT_TO_BOTTOM` | MATCH | true | true | 同名同值 | — | — |
| `U1_REPEAT_TO_BOTTOM_DIST` | MATCH | 0 | 0 | 同名同值 | — | — |
| `U1_WINDOWED_TO_BOTTOM` | MATCH | true | true | 同名同值 | — | — |
| `U1_WINDOWED_TO_BOTTOM_DIST` | MATCH | 0 | 0 | 同名同值 | — | — |
| `USER_BUBBLES` | MATCH | 2 | 2 | 同名同值 | — | — |
| `USER_BUBBLES_BEFORE` | MATCH | 0 | 0 | 同名同值 | — | — |
| `VIEWPORT_MIDDLE_HAS_VISIBLE_ROWS` | MATCH | true | true | 同名同值 | — | — |
| `VIEWPORT_TOP_BATCH_SETTLED_HAS_VISIBLE_ROWS` | MATCH | true | true | 同名同值 | — | — |
| `VIEWPORT_TOP_SINGLE_HAS_VISIBLE_ROWS` | MATCH | true | true | 同名同值 | — | — |
| `WAIT_TIMEOUT` | NEW-ONLY |  | document.getElementById('chat').textContent.includes('补开失败原文') | 新端等待/承诺超时记录（旧端无） | 待 PM：疑似卡片未呈现/等待超时，不是自动豁免 | proposed |
| `WINDOW_ALIVE_AFTER_GUARDS` | MATCH | true | true | 同名同值 | — | — |
| `WINDOW_BUTTON_NO_DRAG` | MATCH | true | true | 同名同值 | — | — |
| `WIN_BRIDGE_FUNCTIONS` | MATCH | true | true | 同名同值 | — | — |
| `WIN_BUTTON_CLOSE_WIRED` | MATCH | true | true | 同名同值 | — | — |
| `WIN_BUTTON_MAX_WIRED` | MATCH | true | true | 同名同值 | — | — |
| `WIN_BUTTON_MIN_WIRED` | MATCH | true | true | 同名同值 | — | — |
| `WIN_IS_MAXIMIZED_IPC` | MATCH | true | true | 同名同值 | — | — |
| `WRITE_MODE_NO_DEMO_NOTE` | MATCH | true WRITE_MODE_NO_INLINE_ROWS=true OLD_GENERAL_CLAIM_PRESENT=false | true WRITE_MODE_NO_INLINE_ROWS=true OLD_GENERAL_CLAIM_PRESENT=false | 同名同值 | — | — |
| `WRITE_NOTE_REMAINS_IN_COMPOSE_NOTE` | MATCH | true | true | 同名同值 | — | — |
