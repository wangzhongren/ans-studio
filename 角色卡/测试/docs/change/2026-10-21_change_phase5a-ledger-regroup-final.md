---
id: change-ui-platform-phase5a-ledger-regroup-final
type: change
title: Phase 5A 最终重分组台账（G1–G5）——main 全绿、uiux 仅 2 项旧 DOM 重锚、design audit 待重锚
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: needs-work（PM 分组/重锚未批）
related: [change-ui-platform-phase5a-independent-verification, change-ui-platform-phase5a-ledger-regroup, design-ui-platform-phase5-test-plan]
events:
  - date: "2026-10-21"
    kind: revised
    summary: 修复落盘后重跑 main/uiux/design audit；main E2E_PASS=true、379 名；uiux 除 MERGE/DEFAULT 两个旧 DOM 身份断言外全过；最终 main 差异 80/7/1 重分 G1–G5：G1 19/G2 12/G3 25/G4 21/G4-RESOLVED 1/G5 2/G0 292；5A 门仍待 PM
---

# Phase 5A 最终重分组台账（post-fix3）

**候选**：修复落盘后 clean build；入口 `app/renderer/dist/src/index.html`；gzip **289,797B**、CSP 严格；单测 142/142、旧基线 683/683、IME 24、懒挂载 10/10；bench 3 轮全过（stormA 中位 20.8、stormB 18.7、handler 0.6、replay 10.0、scroll 3.4；单轮最大 26.7）；C1 Δ=16。证据：[post-fix3](2026-10-21-phase5a-new-entry-evidence/post-fix3/)。

> **2026-10-21 独立验收补正**：`OPEN_CARD_AT_ARRIVAL` 在 final3 重跑为 207→206，已补列 G3（旧 207/新 206、索引归一化、PM §19.3；`OPEN_CARD_STABLE_AT_ANCHOR=true`）。本报告表格中的 G3 25 / G0 292 为 post-fix3 时点计数；最终以 final3 的 [FINAL-G1-G5.md](2026-10-21-phase5a-new-entry-evidence/final3/main-diff/FINAL-G1-G5.md)（G3 26，75 条值差异全登记）为准。post-fix3 JSON/MD 台账已同步修正该行。

## 一、Main 最终结果

- 旧 373 / 新 379 / common 372 / only-old 1（`P13_NEW_SEMANTICS`）/ only-new 7（P13_*）/ 值差异 **80**。
- **`E2E_PASS=true`，`E2E_FAILURES` 空**；10 项 repair 全部关闭（5 SESSION_REPAIR + PENDING + RECOVERY×3 + DIAGNOSTICS）。
- 最终分组（逐名见 [final-regroup-ledger.md](2026-10-21-phase5a-new-entry-evidence/post-fix3/main-diff/final-regroup-ledger.md) / [final-allowed-diff-ledger.json](2026-10-21-phase5a-new-entry-evidence/post-fix3/main-diff/final-allowed-diff-ledger.json)）：

| 组 | 行数 | 说明 | PM |
| --- | --- | --- | --- |
| G1 | 19 | `OUTDIR`/`RENDERER_ENTRY`/`SHOT_*`；`ELECTRON`/`NODE` 同值代表 | 可整组批准 |
| G2 | 12 | `STATUS_BADGE_TEXT`、`PI_FIELD_COUNT 5→6`、piKeys 名集、`SYS_ROWS`、`U1_*`、`RESUME_HINT` | 逐名批准 |
| G3 | 25 | `OP_*`/`OPX_*`、`RESTORE_*`、`RIGHT_QUEUE_*`、`BADGE_*`、`DRAWER_CLOSED_AFTER_PI`、`DISPATCH_ROW_NO_WITHDRAW`、`REPORT_DELIVERY_DETAILS_COLLAPSED`、诊断计数 | 逐名批准替代覆盖 |
| G4 | 21 | `P1_*`、`BOOTSTRAP_*`、`DENIED_OPEN_COUNT`、`HAS_DENIED_INLINE`、`INJECTED_CHIP_LABEL`、`SWITCH_*`、`ROLE_STATE_BADGE_*`、`REPLAY_DEDUP_REBUILD`、`STATUS_LAST_EVENT_RECORDED` | **不得列差异；5A 修/重锚** |
| G4-RESOLVED | 1 | `RECOVERY_SAME_PENDING_CARD_ONCE false→true` | closed |
| G5 | 2 | `E2E_FAILURES`（旧 1→新空）、`E2E_PASS` false→true | 随底层全绿 |
| G0 | 292 | 同名同值 | — |
| NEW-ONLY | 7 | P13_* 新语义 | 逐条 |
| OLD-ONLY | 1 | `P13_NEW_SEMANTICS` | 由 P13_* 替代 |

**G4 关键点**：这些旧 key 在新端为 false，但 `E2E_PASS=true`；属于旧 UI/夹具/DOM 假设与少数行为候选（如 P1 到达/chip、BOOTSTRAP 重置、DENIED/HAS_DENIED、SWITCH），不得静默归 G3 或豁免。PM 需逐条决定“修”或“等价重锚”；安全/fail-closed 类（如 shell/权限）不在本表被批准。

## 二、UIUX 最终结果

全部模式重跑（post-fix2 全量 + post-fix3 受影响复核）：

- **通过**：FRESH、ROLE_FOCUS、TERMINAL、SEND_FACTS、TERMINAL_MERGE、VISUAL 54/54、DELIVERY_NOTE 9/9、COMPLETE_FLOW **41/41 全段**（P7 + role reading 真滚动 + 1360/960）、PROJECT_RESET、DUP、SELECTOR、CONFIG、RUNTIME 17/17、MIRROR 8/8、G2 5/5、TOOLFOLD 19/19（C1 16）、GOV 7/7、JUDGE 33/33、NOTICE、BLANK、QUEUE_VIEW 4/4。
- **仅 2 项失败**：
  1. `MERGE`：`repeated known-turn full rebuild keeps original unanchored pending card without borrowed token` —— 旧 `window.__mergeCard` 同一 DOM 节点身份断言；产品数据/锚点/卡状态由 main `ANCHOR_*`/`OPEN_CARD_*` 与新重锚候选覆盖，需 PM 批准重锚（同 request id + `data-state=open` + confirm 可见），不得直接改产品断言。
  2. `DEFAULT`：旧 toggleDrift `anchor paragraph materialized 960` —— 旧 `.msg` 直接挂 `.chat-pane` 的 `parentNode` 假设；重锚副本（`n.closest('.chat-pane')`）110 checks 全过（桌面UI 证据），测试未改原断言，待 PM 批准。
- `uiux-design-audit`：新入口仍 abort 于旧 `.tool-records` 选择器（S1 折叠摘要夹具），12 项旧 DOM 断言未到达；需重锚/退役并由等价新检查覆盖，测试不改产品断言。

**三项缺口**：Sidebar 身份徽标 **9/9 关闭**；P7 **COMPLETE_FLOW 41/41 关闭**（含 role reading）；虚拟锚点 `incremental reader anchor`/`full replay` 通过，仅旧 toggleDrift `parentNode` 断言待重锚——产品行为已由重锚副本证明，但原断言未改，按 PM 归 allowed-diff 待批。

## 三、断言/边界

- main 最终 379 名与桌面窗口最新 380 名差 `DIAGNOSTIC_EVENT_NAMES`/`PENDING_DIAG` 等诊断字段口径；`E2E_PASS=true`、无 `E2E_ERROR`、无 renderer console 错误。
- 套件/候选哈希：post-fix3 `candidate/core-sha256.txt`、`dist-sha256.txt`；旧入口/套件 manifest 仍为旧快照（旧端不改）。
- 未改产品/测试断言；只写 `角色卡/测试/` 与 `test/测试/`；未读 `.env`；未 commit/push。

## 四、5A 门结论

**needs-work（待 PM 分组/重锚批准）**：

1. G1/G2/G3 逐组批准；G4 21 项不得列差异，需修复或等价重锚；G4-RESOLVED 已关闭。
2. uiux MERGE/DEFAULT 两个旧 DOM 断言重锚获 PM 批准；design audit 旧脚本重锚/退役方案获批准。
3. 所有未批准行保持未批准；5A 门不通过，不能进入 5B。修复/重锚后重跑受影响段并更新证据。
