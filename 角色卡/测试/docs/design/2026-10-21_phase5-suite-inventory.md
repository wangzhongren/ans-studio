# Phase 5 套件 check 名清单（计划时基线）

> 从当前源代码与测试角色既有报告静态提取；5A 运行时以各 `report.json`/`report.txt` 的实际 `reports[].name` 为最终名单，本清单用于逐名对照，不以计数代替。

## uiux-v2.mjs 模式与 check 名

### DEFAULT

- 环境：`（无 ANS_*_UI_ONLY）`；函数：`app.whenReady 默认体`；成功标记：`无 PASS 标记；exit 0`；报告：`$OUT/report.json`。
- 名单：

```
routine collapsed; failure direct; assistant untouched
single brief real write fact
default failure shows known path
known shell exit survives literal semicolon
full target plus unknown target honest
live failed reason visible in summary
before-execution rejection keeps visible reason
unknown is honest count
one independent work list without duplicated role documents
snapshot keeps independent role document open
snapshot keeps full after independent role document and back
keyboard tabs to full
keyboard collapses full
keyboard expands full
keyboard tabs to withdraw
role geometry 1360
queue full/grid/action rect 1360
REPORT:queue geometry 1360
pi geometry 1360
Pi only one title/close 1360
growing composer avoids drawer 1360
closed no horizontal overflow 1360
role geometry 960
queue full/grid/action rect 960
REPORT:queue geometry 960
pi geometry 960
Pi only one title/close 960
growing composer avoids drawer 960
closed no horizontal overflow 960
B independent no A image
A draft image resources full restored
late pick does not touch B
late pick stored in A
late send leaves B untouched
success clears original A sent items
halt preserves queued 3/full
withdraw pending retains item
failed withdraw full retained
withdraw failure inline next to action
withdraw failure keeps draft image resources
thrown withdrawal error inline and retryable
keyboard withdrawal response retains same action
snapshot preserves failure inline
late withdraw not B feedback
late withdraw belongs A item
success uses real returned snapshot
historical own-template failures direct
historical failure reasons visible without expand
virtual visible nonempty
REPORT:incremental reader anchor
group materialized and open
user-open group survives unrelated incremental
stable group restored after full prefix insertion
REPORT:full replay preserves content identity
detached-pane role rowlist built before mount
detached-history role mounted windowed
detached-history pane reads same row gap as attached pane
denied conclusion anchor and decided card retained
pending locator visible after role click
open pending supersedes true busy
pending entry fully reachable with card 960
covered pending actions unavailable card
REPORT:pending geometry card
keyboard locate closes card and exposes all actions
pending entry fully reachable with pi 960
covered pending actions unavailable pi
REPORT:pending geometry pi
keyboard locate closes pi and exposes all actions
keyboard reaches original preview
keyboard expands original preview
expanded preview renders controlled markdown
expanded preview stays inside card width
keyboard enters original confirm action
keyboard reaches deny action
answered pending returns to true busy
idle after answered removes work
keyboard reaches retained image removal
keyboard returns to input above toolbar
keyboard returns to composer image toolbar
pending arrival preserves drawer
expired request restores actual true busy
ordinary question creates no pending
runtime groups lead first and unknown metadata escaped
new engine no Pi history queue confirmation or draft
old engine envelopes cache only and stale project ignored
actual Codex call/result target correlation and completion
Codex secret fallback and optional official Responses settings
failed save keeps draft and honest error
saved secret cleared and busy apply timing truthful
runtime settings geometry 1360
runtime settings geometry 960
Claude required key and optional SDK model endpoint
failed outcome remains error
failed native restore honest rebuilding notice
foreign runtime shell caches without showing in current engine
Pi own history background queue draft and expired card restored
expired old shell collapses with reason visible in its own runtime
expired shell exposes no authorize action after collapse
REPORT:runtime bridge targets
W6-C five-role tree: Liaison primary; governance group exactly Rapporteur/Nominator/Convener/Verifier
W6-C status line shows 三权 · 五角色
W6-C Liaison empty state explains customer entrance without self CTA
W6-C mirror card rendered in Liaison with badge/source label and same request id
W6-C answering mirror freezes the mirror face
W6-C source face kept and also frozen; no mirror label there
W6-C queued aggregate on primary; no operable queued card on either side
W6-C presented queue removes one aggregate and mirrors on both faces
```

### FRESH

- 环境：`ANS_FRESH_CONTEXT_UI_ONLY=1`；函数：`freshContextChecks`；成功标记：`FRESH_CONTEXT_PASS`；报告：`$OUT/report.json`。
- 名单：

```
P5 truly fresh open says new context without old history
P5 fresh first prompt tool and snapshot do not invent old lost context
P5 current-handle replay update remains fresh without false old-history warning
P5 actual at-open old history retains truthful failed-restore notice
```

### ROLE_FOCUS

- 环境：`ANS_ROLE_RETURN_FOCUS_UI_ONLY=1`；函数：`roleDocumentFocusChecks`；成功标记：`ROLE_FOCUS_PASS`；报告：`$OUT/report.json`。
- 名单：

```
nested reading fixture has visible real opener and positive inner and outer scroll
P3 return preserves actual role scroll and expansion
P6 return role restores equivalent visible document entry focus
P3 independent card docs changes inner scroll survives alongside outer expansion focus
nested role reading does not leak into another role
returning original role restores only its own nested reading
nested role reading does not leak into another runtime
returning original runtime restores only its own nested reading
nested role reading is reset for a genuinely different project
REPORT:nested role reading actual before
REPORT:nested role reading actual after
```

### TERMINAL

- 环境：`ANS_TERMINAL_UI_ONLY=1`；函数：`terminalChecks`；成功标记：`TERMINAL_PASS`；报告：`$OUT/report.json`。
- 名单：

```
P5 judge toggle starts authoritative off without fake enable
P7 actual queued response sets current hint
P7 other role empty queue cannot clear current queued hint
P7 authoritative empty queue clears current hint but keeps queue history
P7 newer validation hint survives late queue empty snapshot
P7 matching actual turn ACK clears only its queued hint
P7 late queued reply cannot revive hint after matching actual ACK
P7 expired decision inputs frozen without choosing
P7 decided answer remains checked and all inputs frozen
A non-tool terminal stays actual system fact without invented tool target
A replay non-tool terminal preserves two actual turns without fabricated tool details
SU approval deny card shows title tier reason warning and deny focus
SU approval risky tier label
SU approval review tier label
project shell card stays verbatim without su warning
shell card stays actionable while its turn is waiting
other role settled leaves the waiting shell card untouched
settled removes its stale shell card instead of leaving a disabled card
a new shell card after settled is actionable again
late expiry for a removed id cannot touch the current card
expiry receipt closes the shell card and reports the reason
repeated expiry cannot rebuild a closed shell card
```

### SEND_FACTS

- 环境：`ANS_SEND_FACTS_UI_ONLY=1`；函数：`sendFactsChecks`；成功标记：`SEND_FACTS_PASS`；报告：`$OUT/report.json`。
- 名单：

```
P7 structured aborted reply keeps current handle and cleared accepted draft
P7 accepted unknown result does not restore prompt or clear current handle
P7 wrong actual turn cannot overwrite original send outcome
P7 delayed actual aborted terminal resolves unknown without changing new draft
P7 actual aborted stream before failed promise remains usable
P7 true accepted failed outcome remains error without requeueing accepted prompt
P7 genuine unaccepted rejection restores draft and retains known current handle
P7 old runtime rejected result cannot disable current runtime or overwrite draft
```

### TERMINAL_MERGE

- 环境：`ANS_TERMINAL_MERGE_UI_ONLY=1`；函数：`terminalMergeChecks`；成功标记：`TERMINAL_MERGE_PASS`；报告：`$OUT/report.json`。
- 名单：

```
same actual turn and outcome denied plus settled has one readable terminal
reverse arrival keeps actual failure and full diagnostic in same terminal row
different actual turns retain two independent terminal records
legacy without actual turn never merged by equal text
different structured outcomes in same turn remain separate facts
tool denial keeps independent tool lifecycle and terminal
actual matching denied replay reuses terminal fact and retains distinct diagnostics
late settled after matching history does not append another terminal
additional same-turn diagnosis remains reachable in the existing terminal
same turn ID in other runtime remains independent
history-first exact replay identity is promoted only by trusted matching live outcome
offscreen terminal update keeps virtual reading position
```

### VISUAL

- 环境：`ANS_VISUAL_V2_UI_ONLY=1`；函数：`visualChecks`；成功标记：`VISUAL_V2_PASS`；报告：`$OUT/report.json`。
- 名单：

```
V2 ordinary chat stays ordinary before any structured report
V2 accepted structural positions and real window controls
V2 ordinary chat work overview has no invented report
V2 source report uses separate layered top and facts before primary source and full copy
V2 preview is deterministic real summary while complete safe copy is independently reachable
V2 report status unknown association redaction truncation omission and save facts remain visible
V2 report declaration alone cannot fold an active assistant message
V2 true settled folds only the exact report turn assistant original in place
V2 late exact turn reply follows settled rule and other turns remain ordinary
V2 task request folds only by exact structured report actual turn without reordering ordinary chat
V2 local state refresh preserves full report and original task expansion
V2 modal declares dialog and makes whole background inert
V2 document drawer matches 18px heading source block and outlined right reading action
V2 native window controls retain visible icons and real IPC while business background is inert
V2 Shift Tab wraps from first to last actual drawer control
V2 Tab wraps last to first without escaping modal
V2 background focus cannot escape into composer
V2 Escape restores actual visible report invoker draft and same chat reading
REPORT:V2 measured geometry 1360
V2 real geometry 1360
V2 dark theme: no visible light surfaces 1360
V2 modal width is 424 at 1360
V2 dark theme: no visible light surfaces in drawer 1360
REPORT:V2 measured geometry 960
V2 real geometry 960
V2 dark theme: no visible light surfaces 960
V2 modal width is 424 at 960
V2 dark theme: no visible light surfaces in drawer 960
V2 sidebar default width 248 and resizer aria
V2 sidebar double click resets 248
V2 sidebar keyboard shift right +24
V2 sidebar collapse preserves custom width
V2 sidebar collapsed geometry 1362
V2 sidebar expanded restored 1362
V2 sidebar collapsed geometry 1280
V2 sidebar expanded restored 1280
V2 sidebar collapsed geometry 960
V2 sidebar expanded restored 960
V2 cold exact report turn folds neutral original only and preserves explicit expansion
V2 received report shares layered safe report ordering with one separate batch receipt
V2 target batch facts use actual compact component typography spacing and boundaries
V2 independent work overview includes own and actual received structured reports
V2 work de-duplicates only real report identity while separate delivery attempts stay visible
SV13 distinct receiver turn streaming stays expanded
SV13 true settled receiver folds only exact assistant original
SV13 later receiver text folds preserving explicit expansion
SV13 cold receiver keeps neutral label flags expansion and unrelated legacy text
cold reports reverse hash wire becomes actual time old to new while tool row order remains
cold sorted report identities still deduplicate on repeated history snapshot
cold unknown report time preserves wire ordering without guessing
V2 import selects primary su and keeps it inside tree viewport
V2 selecting middle role keeps it inside tree viewport
V2 refresh keeps visible selection and manual tree scroll
V2 clicking primary su reveals it in tree viewport
```

### DELIVERY_NOTE

- 环境：`ANS_DELIVERY_NOTE_UI_ONLY=1`；函数：`deliveryNoteChecks`；成功标记：`DELIVERY_NOTE_PASS`；报告：`$OUT/report.json`。
- 名单：

```
real ten-call history plus old delivery note never creates an eleventh anonymous tool
old anonymous delivery event stays fully reachable as explicit unknown system record
new actual wire delivery note is full system fact never assistant or tool
all real tool names phases and genuine failed result remain
history rebuild preserves system notes without promoting them into activities
unidentified identical progress events are not text-deduplicated or promoted to tools
known legacy live metadata remains an actual named tool
builtin identity stays data and accessible without duplicate third visible line
long project path is single line ellipsis with full actual title
```

### COMPLETE_FLOW

- 环境：`ANS_COMPLETE_FLOW_UI_ONLY=1`；函数：`completeFlowChecks`；成功标记：`COMPLETE_FLOW_UI_PASS`；报告：`$OUT/report.json`。
- 名单（静态全量；运行时以实际报告为准）：

```
fresh empty context never mistakes loader for history
empty fresh session has no above-history warning
A same call one accessible lifecycle with true target and nonzero exit completion
A safe detail streams exit error and flags readable
A different same-text actual call remains separate
A unknown display never falls to raw args
C source declared result not independent acceptance and failed save button
B source list requires explicit file pick without chat switch or opening model
B static markdown no scripts automatic image or unsafe link
B back list restores explicit file focus
B actual too-large result remains explicit error not partial success
B close invalidates late document and returns actual report invoker
C source same card once save success with promise event race
C target safe display copy flags not complete model input
C target only save updates same original card no re-prompt
C expired original report removes unsafe retry
P6 config save retains existing conversation draft
P6 missing setting closes back to actual notice invoker
P7 choice pending separated from empty queue
P7 locate uses original request no default decision
C source report mismatched role is not promoted
C fallback abort is system outcome not submitted success
C disabled live report remains visible without fake persisted ID
C outer ok inner failed never announced saved
C unreadable report record is explicit without new outcome card
A4 history omission invalid and parser counts are separate
P3 source B documents browsing never changes chatting A or engine
B structured PROJECT_NOT_GRANTED error not hidden
B structured STALE_SCOPE error not hidden
B structured NOT_LISTED error not hidden
B structured SYMLINK_NOT_ALLOWED error not hidden
B structured INVALID_UTF8 error not hidden
B structured BINARY_CONTENT error not hidden
B structured PERMISSION_DENIED error not hidden
B structured UNSUPPORTED_ENVIRONMENT error not hidden
C expired material cannot keep old receipt retry enabled
A4 actual legacy status and omissions shown without invented exit or identity
P3 role documents back restores role reading and expanded section
complete flow layout fits 1360
complete flow layout fits 960
REPORT:read/save/query actual controlled operations
```

### PROJECT_RESET

- 环境：`ANS_PROJECT_RESET_UI_ONLY=1`；函数：`projectResetChecks`；成功标记：`PROJECT_RESET_UI_PASS`；报告：`$OUT/report.json`。
- 名单：

```
old project status fixture is visible
new project first DOM clears old badges before events
old project late status is ignored
new actual status immediately displayed
ordinary fresh false refresh preserves actual state
old project cached foreign runtime does not appear
new pending history applied before first tree render
```

### DUP

- 环境：`ANS_DUP_UI_ONLY=1`；函数：`duplicateChecks`；成功标记：`DUP_UI_PASS`；报告：`$OUT/report.json`。
- 名单：

```
one canonical lifecycle 
typed input repeated live is single injected row
live then history input remains one
different actual turn retained and real assistant prefix not converted
full rebuild preserves uncovered second input and assistant
history first then typed live still one
blocked result and failure preserved without success downgrade
unknown legacy starts and true other call turn retained
card and lifecycle single 
full rebuild retains original decided card 
same title distinct call request retained 
manual clientMessage ack consumes typed input without duplicate
normal tools live history share phase identities
duplicate sparse metadata retains original target
history same call start blocked result all retained
history then live phases still single lifecycle
same failed body different actual calls remain two failures
foreign role runtime identity never covers foreground
background role retains one canonical input
background Codex input retained in own view
REPORT:canonical input and tool updates preserve virtual reader anchor
```

### SELECTOR

- 环境：`ANS_SELECTOR_UI_ONLY=1`；函数：`selectorChecks`；成功标记：`SELECTOR_UI_PASS`；报告：`$OUT/report.json`。
- 名单：

```
disabled combobox before import
disabled cannot open
empty folder enables custom selector with Claude default
Home browses first Pi without commit
Space commits Pi once with live missing entry
current Enter only closes
Home opens first and stops at top
Escape cancels and retains trigger focus
closed arrow opens current selected
End browses last Claude and stops at bottom without commit
Tab cancels naturally to accepted work overview without committing
missing settings remains naturally keyboard reachable after work and role actions
ShiftTab cancellation leaves natural previous target
outside pointer cancels without focus stealing
window blur closes without commit
hover moves temporary only and keeps selected check
option click commits Codex once
current click no business reread
programmatic runtime sync selected and label
selector dimensions and viewport 
long label ellipsis retains accessible full name
low viewport flips upward and clamps horizontally
tiny viewport internal scroll keeps active visible
tiny viewport Home active becomes visible
project application closes pending menu
missing entry still opens existing Claude drawer
```

### CONFIG

- 环境：`ANS_CONFIG_UI_ONLY=1`；函数：`configChecks`；成功标记：`CONFIG_UI_PASS`；报告：`$OUT/report.json`。
- 名单：

```
before import disabled and no notice
programmatic no-project guard
cancel initial import remains disabled
failed initial import remains disabled
empty imported folder enables and checks Claude without role
empty imported folder switch checks Pi live
closed drawer Claude missing key actionable outside chat
keyboard opens existing Claude settings
notice fits 
late engine response cannot replace Codex notice
late old project error ignored
older request on same engine cannot replace latest complete result
missing summary treated as read failure
existing project survives cancel and failed switch
read failure offers settings and never complete
successful save retains missing result
save failure keeps draft and missing notice
save success read failure not overwritten
save complete hides missing and clears secret input
save from prior visit cannot overwrite current status
```

### RUNTIME

- 环境：`ANS_RUNTIME_UI_ONLY=1`；函数：`runtimeChecks`；成功标记：`RUNTIME_UI_PASS`；报告：`$OUT/report.json`。
- 名单：

```
runtime groups lead first and unknown metadata escaped
new engine no Pi history queue confirmation or draft
old engine envelopes cache only and stale project ignored
actual Codex call/result target correlation and completion
Codex secret fallback and optional official Responses settings
failed save keeps draft and honest error
saved secret cleared and busy apply timing truthful
runtime settings geometry 1360
runtime settings geometry 960
Claude required key and optional SDK model endpoint
failed outcome remains error
failed native restore honest rebuilding notice
foreign runtime shell caches without showing in current engine
Pi own history background queue draft and expired card restored
expired old shell collapses with reason visible in its own runtime
expired shell exposes no authorize action after collapse
REPORT:runtime bridge targets
```

### MIRROR

- 环境：`ANS_MIRROR_UI_ONLY=1`；函数：`mirrorChecks`；成功标记：`MIRROR_UI_PASS`；报告：`$OUT/report.json`。
- 名单：

```
W6-C five-role tree: Liaison primary; governance group exactly Rapporteur/Nominator/Convener/Verifier
W6-C status line shows 三权 · 五角色
W6-C Liaison empty state explains customer entrance without self CTA
W6-C mirror card rendered in Liaison with badge/source label and same request id
W6-C answering mirror freezes the mirror face
W6-C source face kept and also frozen; no mirror label there
W6-C queued aggregate on primary; no operable queued card on either side
W6-C presented queue removes one aggregate and mirrors on both faces
```

### MERGE

- 环境：`ANS_MERGE_UI_ONLY=1`；函数：`mergeChecks`；成功标记：`MERGE_UI_PASS`；报告：`$OUT/report.json`。
- 名单：

```
same-turn live then history only one response rejection and old history
real project-changed refresh does not repeat current turn
full rebuild retains unpersisted live report settled and original pending card
history first then exact live event does not duplicate
two legitimate same-turn identical events remain two occurrences
distinct turns with identical input and output remain two
background engine merges in own cache without old engine rows
history-before-correlated-live binds two identical optimistic inputs exactly once
repeated known-turn full rebuild keeps original unanchored pending card without borrowed token
legacy decided full replay reuses original card between actual request and conclusion
background legacy rebuild keeps exact decided DOM and shifted anchor indices
unknown legacy no false text-set dedup and old replay stays idempotent
```

### G2

- 环境：`ANS_G2_RECOVERY_UI_ONLY=1`；函数：`g2RecoveryChecks`；成功标记：`G2_RECOVERY_UI_PASS`；报告：`$OUT/report.json`。
- 名单：

```
G2 system alert renders as own injected style with system source chip
G2 closure notice replay classified by the same single source
G2 recovery card shows action role and verbatim evidence with cancel default focus
G2 recovery Esc is deny and channel-absent terminal never claims execution
G2 expired recovery card dismisses without execution illusion
```

### TOOLFOLD

- 环境：`ANS_TOOLFOLD_UI_ONLY=1`；函数：`toolFoldChecks`；成功标记：`TOOLFOLD_UI_PASS`；报告：`$OUT/report.json`。
- 名单：

```
fold running stays expanded with live rows
fold running summary carries calls breakdown and not-released mark
denied phase merges into its own call row and group is not cut
settled folds the turn group with summary intact and denied row still direct
manual expand after fold restores every row identity zero loss
second turn opens its own group while running
manual collapse during running survives later appends
manual collapse survives settle auto fold
failed phase marks the fold summary with failure count
failed turn folds with failure mark retained
windowed tail group open while its turn runs
reader anchor row is real and visible before fold
REPORT:fold anchor offsets
tail fold movement bounded and non accumulating with the reading row still in view
REPORT:mid document fold anchor
mid document fold keeps the reading anchor within two pixels and stable
scrolled away the group is windowed out (no attached group rows)
live group created off screen stays unmounted until scrolled back
off screen settled group attaches already folded with summary
```

### GOV

- 环境：`ANS_GOVERNANCE_REACCEPT_UI_ONLY=1`；函数：`governanceReacceptChecks`；成功标记：`GOVERNANCE_REACCEPT_UI_PASS`；报告：`$OUT/report.json`。
- 名单：

```
GOV pin-mismatch status row
GOV pin-mismatch empty state reuses su empty host
GOV preview reuses non-modal #governance-preview
GOV preview file/write/pin/warning lines
GOV preview adds no modal or fourth entry
GOV cancel keeps mismatch state and hides preview
GOV success text after completed
```

### NOTICE

- 环境：`ANS_NOTICE_UI_ONLY=1`；函数：`noticeChecks`；成功标记：`SYSTEM_NOTICE_UI_PASS`；报告：`$OUT/report.json`。
- 名单：

```
role tree flat: all roles visible without details/fold
role status badges remain visible for every role
live system notice is its own sys row with 系统 badge, not a user bubble
tool row without file target is neutral in summary and details
replay system notice same rule: sys row + user body
notice view no horizontal overflow at 960
```

### BLANK

- 环境：`ANS_BLANK_PANE_UI_ONLY=1`；函数：`blankPaneChecks`；成功标记：`BLANK_PANE_UI_PASS`；报告：`$OUT/report.json`。
- 名单：

```
fixture: background pane has queue/status rows but no transcript
selecting background role shows history loading instead of blank
empty history removes loading and shows neutral busy placeholder
history replay removes placeholder and renders content
role with transcript shows neither loading nor placeholder
idle no-history role shows neutral placeholder instead of blank
```

### QUEUE_VIEW

- 环境：`ANS_QUEUE_VIEW_UI_ONLY=1`；函数：`queueViewChecks`；成功标记：`QUEUE_VIEW_UI_PASS`；报告：`$OUT/report.json`。
- 名单：

```
queued baseline shows two
runtime view restore does not revive old queued requests or aggregate
main-process repush rebuilds aggregate with new count only
clearing queue removes aggregate
```

## main.mjs 检查键（`report.txt` 的 `KEY=...` 行）

- 运行：`./node_modules/.bin/electron test/桌面应用/e2e/main.mjs`；env `ANS_E2E_PROJECT`、`ANS_E2E_OUTDIR`；报告 `$OUTDIR/report.txt`（`KEY=value` 行 + `E2E_DONE=1`/`E2E_ERROR=`）。
- 环境/路径元数据：`ELECTRON`, `NODE`, `OUTDIR`, `PROJECT`。
- 截图证据名（非检查）：`SHOT_00_TITLEBAR`, `SHOT_01_IMPORT`, `SHOT_01B_SU`, `SHOT_02_CHAT`, `SHOT_03_DENIED`, `SHOT_04_PROFILE`, `SHOT_12_COMPOSER`, `SHOT_05_BOOTSTRAP`, `SHOT_06_REFRESH`, `SHOT_12_RESTORE`, `SHOT_14_OP_CROSSPANE`, `SHOT_11_OPERATOR`, `SHOT_07_HANDBACK`, `SHOT_08_SU_PANE`, `SHOT_15_ANCHOR`, `SHOT_09_PI_PANEL`, `SHOT_10_PI_SAVED`。

### 检查键

```
NO_DEFAULT_MENU_BAR
CUSTOM_TITLEBAR_PRESENT
TITLEBAR_IS_DRAG_REGION
TITLEBAR_HAS_THREE_BUTTONS
WINDOW_BUTTON_NO_DRAG
WIN_BRIDGE_FUNCTIONS
WIN_IS_MAXIMIZED_IPC
WIN_BUTTON_MIN_WIRED
WIN_BUTTON_MAX_WIRED
WIN_BUTTON_CLOSE_WIRED
WINDOW_ALIVE_AFTER_GUARDS
PROJECT_BTN_INITIAL_IMPORT
PROJECT_PATH_SHOWN
PROJECT_BTN_SWITCHED
ROLE_COUNT
ROLE_IDS
PRIMARY_ROLE_ID
DEFAULT_SELECTED_ROLE
SU_DEFAULT_ACTIVE
HAS_OTHER_GROUP
CHAT_CTA_PRESENT
CHAT_CTA_TEXT
SESSION_NOT_AUTO_OPENED
NORMAL_PROJECT_NO_BOOTSTRAP_MENTION
NO_MODAL_AFTER_IMPORT
FIRST_ROLE_ID
SU_IS_FIRST
SU_TREE_CLASS
SU_CLICKED
SU_NO_MODAL
SU_CHAT_HEADER
SU_SESSION_STATE
SU_NO_WELCOME
SU_NO_READONLY_BADGE
SU_NO_READONLY_NOTE
SU_BADGE_LABELS
SU_WRITE_NOTE_IN_COMPOSE_NOTE
SU_WRITE_NOTE_WRITES_IMPORTED
SU_NO_INLINE_WRITE_ROWS
BOOTSTRAP_ACTION_REMOVED
CLICKED_DESKTOP_ROLE
NO_MODAL_AFTER_ROLE_CLICK
CHAT_HEADER_ROLE
SESSION_STATE
NO_WELCOME_AFTER_OPEN
USER_BUBBLES_BEFORE
DESKTOP_ROLE_NO_READONLY_BADGE
WRITE_MODE_NO_DEMO_NOTE
NO_MODAL_AFTER_MESSAGES
USER_BUBBLES
ASSISTANT_BUBBLES
HAS_ROUND2
HAS_DENIED_INLINE
HAS_DENIED_GROUPED
SYS_ROWS
ACCEPTED_ROWS
SESSION_STATE_AFTER
DENIED_OPEN_COUNT
RESUME_HINT
SESSION_STATE_AFTER_RESUME
NO_MODAL_AFTER_RESUME
STOP_IN_COMPOSER
CHAT_HEAD_ONLY_APPROVED_BUTTONS
STOP_HIDDEN_WHEN_IDLE
STOP_VISIBLE_WHEN_BUSY
STOP_LINE_UNSUPPORTED
STOP_HIDDEN_AFTER_SNAPSHOT_RESET
STOP_VISIBLE_WITH_REAL_BUSY
SEND_ENABLED_WHILE_BUSY
DATA_STATE_RUN_WHILE_BUSY
SEND_QUEUES_WHILE_BUSY
QUEUE_ROWS_THREE
QUEUE_EXPAND_EVIDENCE
QUEUE_EXPAND_FULL
QUEUE_ROWS_AFTER_WITHDRAW
IMG_QUEUE_FROZEN
QUEUED_EXECUTION_ORDER_1_3
DATA_STATE_IDLE_AFTER_ROUND
SETTLED_ROW_PRESENT
IMG_PASSTHROUGH_QUEUED
IMG_SEND_OK
IMG_REJECT_BAD_MIME
IMG_REJECT_OVERSIZE
IMG_LEGACY_NOTE_ABSENT
TABS_PRESENT
NO_RETIRED_TABS
NO_RIGHT_COLUMN
DRAWER_DEFAULT_CLOSED
DRAWER_OPENS_ON_TAB
TAB_CARD_ACTIVE
DRAWER_TITLE_CARD
RIGHT_HAS_CARD
RIGHT_HAS_BOUNDARY
RIGHT_HAS_CHANGELOG
RIGHT_CARD_MD_RENDERED
RIGHT_CARD_MD_NO_SCRIPT
TAB_WORK_ACTIVE
DRAWER_TITLE_WORK
RIGHT_HAS_TODO_SECTION
DRAWER_TOGGLES_CLOSED
DRAWER_ESC_CLOSES
BADGE_ON_WORK_WHILE_COLLAPSED
BADGES_CLEAR_ON_EMPTY
NO_RUNTIME_SELECTOR
NO_RT_SELECT_CLASS
NO_SELECT_ELEMENTS
RUNTIME_NOTE_IN_COMPOSE_NOTE
NO_PI_BUTTON_IN_HEADER
PI_ENTRY_IN_SIDEBAR_FOOT
RUNTIME_NOTE_WRITES_IMPORTED
RUNTIME_NOTE_ONE_LINE_GATED
COMPOSER_CHILD_ROWS
COMPOSER_ROWS_ARE_ATTACH_CAPSULE_NOTE
COMPOSER_HAS_TEXTAREA_SEND
COMPOSER_SEND_INSIDE_CAPSULE
COMPOSER_ATTACH_BTN
COMPOSER_CLEAN
BOOTSTRAP_HAS_ROLES
BOOTSTRAP_PRIMARY
BOOTSTRAP_DEFAULT_SELECTED
BOOTSTRAP_ROLE_COUNT
BOOTSTRAP_MENTION_COUNT
BOOTSTRAP_MENTION_IN_CENTER_EMPTY
BOOTSTRAP_CENTER_CTA_PRESENT
BOOTSTRAP_LEFT_NOTICE_ABSENT
BOOTSTRAP_NO_LEFT_NOTICE_ELEMENT
BOOTSTRAP_HINT_EMPTY
WRITE_NOTE_REMAINS_IN_COMPOSE_NOTE
BOOTSTRAP_SU_NO_READONLY_BADGE
REFRESH_HAS_ROLES
REFRESH_ROLE_COUNT
REFRESH_HAS_EXAMPLE
REFRESH_TREE_HAS_EXAMPLE
REFRESH_OTHER_GROUP_SHOWN
REFRESH_LEFT_NOTICE_STAYS_ABSENT
REFRESH_BOOTSTRAP_MENTION_AT_MOST_ONE
REFRESH_SU_NO_READONLY_BADGE
RESTORE_BADGE_IS_RESTORED
RESTORE_NO_SUCCESS_DIVIDER
RESTORE_ROWS_PRESENT
RESTORE_MD_RENDERED
RESTORE_NO_STALE_RESTART_NOTE
RESTORE_SU_CHAT_SNIPPET
RESTORE_SU_RESTORED_FLAG
RESTORE_SU_REPLAY_ROWS
RESTORE_SU_OWN_TEXT
RESTORE_NO_CROSSTALK
OPX_NOT_IN_VIEWED_PANE
OPX_POINTER_IN_VIEWED_PANE
OPX_BADGE_LIT
OPX_CARD_ON_RETURN
OPX_DUP_SINGLE_CARD
OPX_EXPIRED_FROZEN
OPX_ANSWERED
OPX_BADGE_CLEARED
OP_NO_CARD_BEFORE_REQUEST
OP_CARD_PRESENT
OP_CARD_TITLE_SHOWS
OP_PREVIEW_COLLAPSED
OP_B3_AWAITING_CONFIRM
OP_CONFIRM_ANSWERED
OP_CARD_FROZEN
OP_B3_AWAITING_CLEARED
OP_SELECT_HAS_RADIO
OP_SUBMIT_DISABLED_INITIALLY
OP_SELECT_ANSWERED
OP_MULTI_HAS_CHECKBOX
OP_MULTI_ANSWERED
OP_FORGED_ID_REJECTED
OP_OUT_OF_SET_REJECTED
OP_CANCEL_DECLINED
OP_OLD_ENTRY_REMOVED
OP_OLD_CARD_REMOVED
HANDBACK_CARD_PRESENT
HANDBACK_TITLE
HANDBACK_NOT_MIRROR
HANDBACK_STATUS_OK
HANDBACK_EVIDENCE_ROWS
REPORT_NO_PREMATURE_SU_MIRROR
SU_DELIVERY_CARD_PRESENT
SOURCE_REPORT_BLOCKED
SOURCE_REPORT_EVIDENCE_PLACEHOLDER
HISTORY_KEPT_ON_SWITCHBACK
MD_STRONG_RENDERED
MD_TAG_TEXT_ESCAPED
LINK_OPEN_EXTERNAL_CALLED
TOOLROW_NO_CONTENT
TOOLROW_HAS_PATH
INJECTED_STYLE_PRESENT
REPORT_DELIVERY_DETAILS_COLLAPSED
INJECTED_CHIP_LABEL
INJECTED_NOT_USER_BUBBLE
MANUAL_PREFIX_BUBBLE
MANUAL_NOT_INJECTED
STATUS_BADGE_TEXT
STATUS_BADGE_IS_IDLE
STATUS_LAST_EVENT_RECORDED
ROLE_STATE_BADGE_WORKING_PENDING
ROLE_STATE_BADGE_HAS_ICON
ROLE_STATE_BADGE_HOVER_FULL
ROLE_STATE_QUEUE_ROW
ROLE_STATE_CLEARED
SHELL_CONFIRM_VISIBLE
SHELL_CONFIRM_COMMAND_VERBATIM
SHELL_CONFIRM_SUMMARY_PLAIN
SHELL_CONFIRM_REASON_PLAIN
SHELL_CONFIRM_DENY_DEFAULT_FOCUS
SHELL_CONFIRM_DETAILS_COLLAPSED
SHELL_CONFIRM_ESC_NOT_ALLOWED
RIGHT_QUEUE_SECTION
RIGHT_QUEUE_ROWS
RIGHT_QUEUE_RUNNING_FIRST
RIGHT_QUEUE_SOURCES
RIGHT_QUEUE_EMPTY_PLACEHOLDER
QUEUE_POSITION_ROWS
QUEUE_POSITION_IN_CARD
TAB_WORK_ACTIVE_STILL
DRAWER_CLOSED_AFTER_N3
P1_ARRIVAL_SCROLLED
P1_ARRIVAL_DEBUG
P1_CHIP_VISIBLE
P1_NO_INTERRUPT_TOP
P1_CHIP_COUNT2
P1_CHIP_CLICK_LOCATES
P1_CHIP_SECOND_CARD
P1_CHIP_COUNT1_AFTER_TERMINAL
P1_CHIP_HIDDEN_AFTER_ALL_TERMINAL
P1_SWITCHBACK_SCROLLS_TO_CARD
P1_CLEANUP_CHIP_HIDDEN
ANCHOR_TABLE_REGISTERED
ANCHOR_CARD_AT_ARRIVAL
ANCHOR_CARD_ANSWERED
ANCHOR_ROW_AFTER_SWITCHBACK
ANCHOR_STABLE_NOT_TAIL_ONCE
ANCHOR_STABLE_NOT_TAIL_TWICE
ANCHOR_NO_DUPLICATE_ROW
OPEN_CARD_AT_ARRIVAL
OPEN_CARD_ROWS_AFTER_SWITCHBACK
OPEN_CARD_STABLE_AT_ANCHOR
OPEN_CARD_CHIP_VISIBLE
OPEN_CARD_CLEANED_CHIP_HIDDEN
S1_WINDOWED_ACTIVE
S1_STICK_AT_BOTTOM_DIST
S1_STICK_AT_BOTTOM
S1_NOT_YANKED
S1_STAYED_AWAY_FROM_BOTTOM
VIEWPORT_MIDDLE_HAS_VISIBLE_ROWS
VIEWPORT_TOP_SINGLE_HAS_VISIBLE_ROWS
VIEWPORT_TOP_BATCH_SETTLED_HAS_VISIBLE_ROWS
EVENT_BATCH_CONTINUES_AFTER_ERROR
S1_STICK_AGAIN_DIST
S1_STICK_AGAIN
S1_SMALL_PANE_STICK_DIST
S1_SMALL_PANE_STICK
S1_SMALL_PANE_NOT_YANKED
U1_WINDOWED_TO_BOTTOM_DIST
U1_PANE_HEIGHT
U1_WINDOWED_TO_BOTTOM
U1_NORMAL_TO_BOTTOM_DIST
U1_NORMAL_TO_BOTTOM
U1_REPEAT_TO_BOTTOM_DIST
U1_REPEAT_TO_BOTTOM
PI_PANEL_OPEN
PI_PANEL_IN_DRAWER
PI_FIELD_COUNT
PI_KEYS_ARE_FIVE
PI_FIELDS_MATCH_REGISTRY
PI_NO_PROVIDER_FIELD
PI_ADVANCED_PRESENT
PI_ADVANCED_COLLAPSED_BY_DEFAULT
PI_CONTEXT_WINDOW_IN_ADVANCED
PI_PROMPT_TIMEOUT_IN_ADVANCED
PI_ADVANCED_HINT_LEAVE_BLANK
PI_TOKEN_MASKED
PI_HAS_SAVE_BTN
PI_PANEL_PATH_IS_TEMP
PI_ENV_NOT_REPO_ROOT
PI_NO_MODAL
PI_STACKED_FIELDS
PI_NARROW_WINDOW
PI_NARROW_STACKED
PI_SAVE_STATUS
PI_TEMP_ENV_WRITTEN
PI_TEMP_ENV_HAS_BASE_URL
PI_TEMP_ENV_HAS_TOKEN
PI_TEMP_ENV_NO_PROVIDER
PI_TEMP_ENV_OMITS_EMPTY_CONTEXT_WINDOW
PI_TOKEN_STILL_MASKED
PI_TOKEN_VALUE_CLEARED
PI_TOKEN_PLACEHOLDER_SET
DRAWER_CLOSED_AFTER_PI
SWITCH_SETUP_BUSY
SWITCH_CONFIRM_ON_BUSY
SWITCH_BAR_NOT_IN_CHAT
SWITCH_NO_CONFIRM_WHEN_IDLE
SWITCH_IDLE_HINT
REPLAY_DEDUP_IDEMPOTENT
REPLAY_DEDUP_APPEND
REPLAY_DEDUP_REBUILD
REPLAY_NO_DOUBLE_ON_REFRESH
E2E_DONE
E2E_ERROR
```

## ime-enter.mjs 检查名

- 运行：`./node_modules/.bin/electron test/桌面应用/e2e/ime-enter.mjs`；env `ANS_RENDERER_ENTRY`、`ANS_IME_OUTDIR`；报告 `$ANS_IME_OUTDIR/report.txt`；成功 `E2E_DONE=1`。

```
ATTACHMENT_READY
CHINESE_COMPOSITION_STATE_NOT_CANCELLED
CHINESE_COMPOSITION_STATE_NO_SEND
CHINESE_COMPOSITION_STATE_INPUT_ATTACHMENT_BUBBLE_UNCHANGED
CHINESE_END_NORMAL_ENTER_SENT_ONCE
CHINESE_END_NORMAL_ENTER_PAYLOAD_AND_CLEAR
ENGLISH_COMPOSITION_NOT_CANCELLED
ENGLISH_COMPOSITION_NO_SEND
ENGLISH_COMPOSITION_INPUT_ATTACHMENT_BUBBLE_UNCHANGED
COMPOSITION_END_BEFORE_229_NOT_CANCELLED
COMPOSITION_END_BEFORE_229_NO_SEND
COMPOSITION_END_BEFORE_229_INPUT_ATTACHMENT_BUBBLE_UNCHANGED
AFTER_229_NORMAL_ENTER_SENT_ONCE
AFTER_229_NORMAL_ENTER_PAYLOAD_AND_CLEAR
IS_COMPOSING_WITHOUT_START_NOT_CANCELLED
IS_COMPOSING_WITHOUT_START_NO_SEND
IS_COMPOSING_WITHOUT_START_INPUT_ATTACHMENT_BUBBLE_UNCHANGED
AFTER_IS_COMPOSING_NORMAL_ENTER_SENT_ONCE
AFTER_IS_COMPOSING_NORMAL_ENTER_PAYLOAD_AND_CLEAR
MOUSE_COMMIT_NEXT_ENTER_SENT_ONCE
MOUSE_COMMIT_NEXT_ENTER_PAYLOAD_AND_CLEAR
SHIFT_ENTER_NOT_CANCELLED
SHIFT_ENTER_NATIVE_NEWLINE_NO_SEND
SEND_BUTTON_BEHAVIOR_UNCHANGED
```

## bench-storm.mjs 指标与有效性字段

- 运行：`BENCH_OUT=... ./node_modules/.bin/electron test/桌面应用/e2e/bench-storm.mjs`；env `ANS_RENDERER_ENTRY`、`BENCH_OUT`；报告 `$BENCH_OUT` JSON。
- 计时指标：`stormA.maxGap`、`stormA_handler.maxMs`、`stormB.maxGap`、`stormB_handler.maxBatchMs`、`replay.replayMs`、`scrollToBottom.ms`；辅助：`frames`、`naive.storm300Ms`、`naive.perEventAvgMs`、`naive.replay2000Ms`、`replay.mounted`、`replay.rows`、`scrollToBottom.mounted`。
- 有效性：`histDirect=true`、`histPending.r1=false`、`histPending.r2=false`；同一轮以旧/新交替 ≥3 轮、每目标预热排除、中位阈值（maxGap ≤ max(旧中位,25)、其余 ≤ max(旧×1.2,+5)、p95≤35、单轮≤50）。

## uiux-design-audit.mjs v3 检查名

- 运行：`ANS_UIUX_OUTDIR=... ./node_modules/.bin/electron test/桌面应用/e2e/uiux-design-audit.mjs`；报告 `$ANS_UIUX_OUTDIR/report.json`（当前脚本仅加载旧入口 `app/renderer/index.html`，5A 前需加目标切换；见计划 §5A-0）。

```
1-W1-行距16±1
2-W2-p10±1
2-W2-h3-16/6±1
3-W3-气泡≤44
4-W4-输入区≤140
4-W4-空框≤30
5-转录总高≤850
6-可见行≥9
8-无横向溢出-1360
S3-无chip时尾行兜底
W6b-系统正文去前缀
W6-注入盒行高1.6
S1-合并为2个调用
S1-合并行高≤48
S1-展开组≤60%现状
S1-相位链保留
S4-口径「N个调用」
S1-折叠摘要失败/未知可见
S3-chip可见无尾行
S2-chip对齐阅读列≤8
零动效-chip/确认卡
8-无横向溢出-960
S1-截断目标仍可见
11-W11-loading同款转轮
11-无第二转轮实现
9-W9-徽标12pxSVG
9-W9-转轮0.9±0.2s
10-W10-尾行26.6±2
10-W10-尾行含转轮
12-reduced-motion静止弧
```

## uiux-prototype-measure.mjs（补充测量，非门）

- 运行：`./node_modules/.bin/electron test/桌面应用/e2e/uiux-prototype-measure.mjs`；输出 `$OUT/report.json` 的 `widths.<档位>` 结构；仅作原型几何对照，不进入 5A/5B 必过门。

