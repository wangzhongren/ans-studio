# Phase 5A old-end suite index

- entry: `app/renderer/index.html`；所有 uiux 模式独立进程；`ANS_UIUX_INTERACTIVE=0`。

- 旧端结果只作 5A 基线；新端不得引用为自身结果。


## uiux-v2

| mode | env | exit | report | checks | names file |
| --- | --- | --- | --- | --- | --- |
| BLANK | `ANS_BLANK_PANE_UI_ONLY=1` | 0 | [raw/uiux/BLANK/report.json](raw/uiux/BLANK/report.json) | 6 | [uiux-BLANK.txt](check-names/uiux-BLANK.txt) |
| COMPLETE_FLOW | `ANS_COMPLETE_FLOW_UI_ONLY=1` | 0 | [raw/uiux/COMPLETE_FLOW/report.json](raw/uiux/COMPLETE_FLOW/report.json) | 41 | [uiux-COMPLETE_FLOW.txt](check-names/uiux-COMPLETE_FLOW.txt) |
| CONFIG | `ANS_CONFIG_UI_ONLY=1` | 0 | [raw/uiux/CONFIG/report.json](raw/uiux/CONFIG/report.json) | 21 | [uiux-CONFIG.txt](check-names/uiux-CONFIG.txt) |
| DEFAULT | `—` | 1 | [raw/uiux/DEFAULT/report.json](raw/uiux/DEFAULT/report.json) | 101 | [uiux-DEFAULT.txt](check-names/uiux-DEFAULT.txt) |
| DELIVERY_NOTE | `ANS_DELIVERY_NOTE_UI_ONLY=1` | 0 | [raw/uiux/DELIVERY_NOTE/report.json](raw/uiux/DELIVERY_NOTE/report.json) | 9 | [uiux-DELIVERY_NOTE.txt](check-names/uiux-DELIVERY_NOTE.txt) |
| DUP | `ANS_DUP_UI_ONLY=1` | 0 | [raw/uiux/DUP/report.json](raw/uiux/DUP/report.json) | 32 | [uiux-DUP.txt](check-names/uiux-DUP.txt) |
| FRESH | `ANS_FRESH_CONTEXT_UI_ONLY=1` | 0 | [raw/uiux/FRESH/report.json](raw/uiux/FRESH/report.json) | 4 | [uiux-FRESH.txt](check-names/uiux-FRESH.txt) |
| G2 | `ANS_G2_RECOVERY_UI_ONLY=1` | 0 | [raw/uiux/G2/report.json](raw/uiux/G2/report.json) | 5 | [uiux-G2.txt](check-names/uiux-G2.txt) |
| GOV | `ANS_GOVERNANCE_REACCEPT_UI_ONLY=1` | 0 | [raw/uiux/GOV/report.json](raw/uiux/GOV/report.json) | 7 | [uiux-GOV.txt](check-names/uiux-GOV.txt) |
| JUDGE | `ANS_JUDGE_UI_ONLY=1` | 0 | [raw/uiux/JUDGE/report.json](raw/uiux/JUDGE/report.json) | 33 | [uiux-JUDGE.txt](check-names/uiux-JUDGE.txt) |
| MERGE | `ANS_MERGE_UI_ONLY=1` | 0 | [raw/uiux/MERGE/report.json](raw/uiux/MERGE/report.json) | 12 | [uiux-MERGE.txt](check-names/uiux-MERGE.txt) |
| MIRROR | `ANS_MIRROR_UI_ONLY=1` | 1 | [raw/uiux/MIRROR/report.json](raw/uiux/MIRROR/report.json) | 2 | [uiux-MIRROR.txt](check-names/uiux-MIRROR.txt) |
| NOTICE | `ANS_NOTICE_UI_ONLY=1` | 0 | [raw/uiux/NOTICE/report.json](raw/uiux/NOTICE/report.json) | 6 | [uiux-NOTICE.txt](check-names/uiux-NOTICE.txt) |
| PROJECT_RESET | `ANS_PROJECT_RESET_UI_ONLY=1` | 0 | [raw/uiux/PROJECT_RESET/report.json](raw/uiux/PROJECT_RESET/report.json) | 7 | [uiux-PROJECT_RESET.txt](check-names/uiux-PROJECT_RESET.txt) |
| QUEUE_VIEW | `ANS_QUEUE_VIEW_UI_ONLY=1` | 0 | [raw/uiux/QUEUE_VIEW/report.json](raw/uiux/QUEUE_VIEW/report.json) | 4 | [uiux-QUEUE_VIEW.txt](check-names/uiux-QUEUE_VIEW.txt) |
| ROLE_FOCUS | `ANS_ROLE_RETURN_FOCUS_UI_ONLY=1` | 0 | [raw/uiux/ROLE_FOCUS/report.json](raw/uiux/ROLE_FOCUS/report.json) | 11 | [uiux-ROLE_FOCUS.txt](check-names/uiux-ROLE_FOCUS.txt) |
| RUNTIME | `ANS_RUNTIME_UI_ONLY=1` | 1 | [raw/uiux/RUNTIME/report.json](raw/uiux/RUNTIME/report.json) | 16 | [uiux-RUNTIME.txt](check-names/uiux-RUNTIME.txt) |
| SELECTOR | `ANS_SELECTOR_UI_ONLY=1` | 1 | [raw/uiux/SELECTOR/report.json](raw/uiux/SELECTOR/report.json) | 21 | [uiux-SELECTOR.txt](check-names/uiux-SELECTOR.txt) |
| SEND_FACTS | `ANS_SEND_FACTS_UI_ONLY=1` | 0 | [raw/uiux/SEND_FACTS/report.json](raw/uiux/SEND_FACTS/report.json) | 8 | [uiux-SEND_FACTS.txt](check-names/uiux-SEND_FACTS.txt) |
| TERMINAL | `ANS_TERMINAL_UI_ONLY=1` | 0 | [raw/uiux/TERMINAL/report.json](raw/uiux/TERMINAL/report.json) | 22 | [uiux-TERMINAL.txt](check-names/uiux-TERMINAL.txt) |
| TERMINAL_MERGE | `ANS_TERMINAL_MERGE_UI_ONLY=1` | 0 | [raw/uiux/TERMINAL_MERGE/report.json](raw/uiux/TERMINAL_MERGE/report.json) | 12 | [uiux-TERMINAL_MERGE.txt](check-names/uiux-TERMINAL_MERGE.txt) |
| TOOLFOLD | `ANS_TOOLFOLD_UI_ONLY=1` | 1 | [raw/uiux/TOOLFOLD/report.json](raw/uiux/TOOLFOLD/report.json) | 15 | [uiux-TOOLFOLD.txt](check-names/uiux-TOOLFOLD.txt) |
| VISUAL | `ANS_VISUAL_V2_UI_ONLY=1` | 0 | [raw/uiux/VISUAL/report.json](raw/uiux/VISUAL/report.json) | 54 | [uiux-VISUAL.txt](check-names/uiux-VISUAL.txt) |

## main.mjs（旧入口）

- command: `ANS_RENDERER_ENTRY=app/renderer/index.html ANS_E2E_PROJECT=<repo> ANS_E2E_OUTDIR=raw/main electron test/桌面应用/e2e/main.mjs`
- exit: 0；`E2E_DONE=1`；`E2E_PASS=false`；`E2E_FAILURES=RECOVERY_SAME_PENDING_CARD_ONCE`
- report: [raw/main/report.txt](raw/main/report.txt)；check names: [check-names/main.txt](check-names/main.txt)

## ime-enter
- exit: 0；`E2E_DONE=1`；report [raw/ime/report.txt](raw/ime/report.txt)

## bench-storm
- exit: 0 ×3 轮；reports [old1.json](raw/bench/old1.json)、[old2.json](raw/bench/old2.json)、[old3.json](raw/bench/old3.json)；metrics 见 JSON（stormA.maxGap/stormB.maxGap/handler/replay/scroll；旧端 histDirect=false）

## uiux-design-audit
- exit: 1；无 report.json；error [raw/design-audit/error.txt](raw/design-audit/error.txt)：脚本 eval 失败于 S1 折叠摘要夹具（`#chat .tool-records` null）；旧端不适用，C 类基线

## node/lazy
- unit [raw/node/unit-ui.txt](raw/node/unit-ui.txt) exit 0；baseline [raw/node/baseline.txt](raw/node/baseline.txt) exit 0
- lazy [raw/lazy.stdout.log](raw/lazy.stdout.log) exit 2：旧入口无新工具组契约，`LAZY_DENIED_DIRECT_VISIBLE=false`，new-only 检查

