---
id: change-ui-platform-phase5a-independent-verification
type: change
title: Phase 5A 独立验证（旧端快照 + 新端全量 + 允许差异台账）——needs-work
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: needs-work
related: [design-ui-platform-phase5-test-plan, change-ui-platform-phase5a-old-baseline, ui-platform-round-review]
events:
  - date: "2026-10-21"
    kind: verified
    summary: 候选冻结后跑新端全量（uiux 默认+22 模式、main、ime、bench 3 轮、design audit、Node/懒挂载），逐名差异与旧端快照对照；三项缺口 Sidebar/P7 关闭、虚拟锚点 toggleDrift 仍红；新端 6 个 uiux 模式早停、design audit 12 条旧 DOM 夹具失配、main 10 项 repair 失败；结论 needs-work，5A 门不通过
---

# Phase 5A 独立验证

**候选**：HEAD `224cf83`；入口 `app/renderer/dist/src/index.html`；候选冻结后 clean build。Node v24.14.0；Electron v44.7.0；Darwin arm64。旧端快照：[2026-10-21-phase5a-old-baseline-evidence](2026-10-21-phase5a-old-baseline-evidence/index.md)；新端证据：[2026-10-21-phase5a-new-entry-evidence](2026-10-21-phase5a-new-entry-evidence/index.md)。

## 一、结论

**needs-work：5A 门不通过，停止进入 5B。**

- **三项缺口**：Sidebar 身份徽标 **已关闭**（DELIVERY_NOTE 9/9）；P7「待选择」**已关闭**（COMPLETE_FLOW P7 两项 true，C/P3 全过）；虚拟窗口阅读锚点**仅部分关闭**——`incremental reader anchor`/`full replay preserves content identity` 报告值通过，但官方 DEFAULT 段仍在 toggleDrift `anchor paragraph materialized 960` 处 raw assert 失败。
- **新端全量**：15 个 uiux 模式通过；6 个模式早停（TERMINAL_MERGE、PROJECT_RESET、DUP、MERGE、NOTICE、BLANK）；DEFAULT/COMPLETE_FLOW 在各自报告全过后被 Phase 5 夹具/读锚点 raw assert 截断。main.mjs 10 项 repair 失败（9 项真实行为候选 + 1 项诊断字段候选）。
- **design audit**：新端 12 条 v3 断言失败，均为旧 DOM 夹具不匹配（行距/chip/注入盒/loading/徽标/转轮等），需重锚或退役并由等价新检查覆盖。
- 旧端 5 个 uiux 模式失败均为旧端基线/旧口径，登记 OLD-ONLY/REMOVED；main `RECOVERY_SAME_PENDING_CARD_ONCE` 仍为旧端 C 类同因，但新端同名 false + 额外恢复失败，不能按旧 C 豁免。

## 二、候选身份与门禁

- 候选身份/哈希：[candidate/identity.txt](2026-10-21-phase5a-new-entry-evidence/candidate/identity.txt)、[dist-sha256.txt](2026-10-21-phase5a-new-entry-evidence/candidate/dist-sha256.txt)、[core-sha256.txt](2026-10-21-phase5a-new-entry-evidence/candidate/core-sha256.txt)；构建前后 core diff 空（[core-sha.diff](2026-10-21-phase5a-new-entry-evidence/candidate/core-sha.diff)）。git status 仅新增证据/文档目录，无代码变更。
- 构建/typecheck：exit 0；CSP 严格；gzip9 **287,465B ≤307,200B**。
- Node 单测 **142/142**；旧基线 **683/683**（679 + 桌面窗口新增 4）；IME **24 基线**；懒挂载 **10/10**；无新增依赖/DOM 例外（package scripts 新增 `package:local`/`verify:local`，无新依赖）。
- bench：旧/新交替 3 轮，新端 stormA maxGap 18.6/18.6/18.6（旧中位 21.5，阈 25）、stormB 18.6/18.4/18.7（旧 17.8，阈 25）、handler 0.6/0.5/0.6、batch 0.9/0.6/0.9、replay 9.5/10.1/9.4、scroll 3.3/14/7；新端 `histDirect=true` 全 3 轮；C1 **150→166，Δ=16（≤16 目标/≤32 硬门）**。

## 三、新端 uiux 结果

通过（exit 0）：FRESH 4/4、ROLE_FOCUS 11 条、TERMINAL 22/22、SEND_FACTS 8/8、VISUAL 54/54、DELIVERY_NOTE 9/9、CONFIG 21/21、RUNTIME 17/17、SELECTOR 27/27、MIRROR 8/8、TOOLFOLD 19/19、QUEUE_VIEW 4/4、GOV 7/7、JUDGE 33/33、G2 5/5。

失败（exit 1）：

| mode | 失败名 | 观测/归类 |
| --- | --- | --- |
| TERMINAL_MERGE | `same actual turn and outcome denied plus settled has one readable terminal` | chat 出现两条「本轮已中止」；旧端合并为一条——**真实合并缺陷候选** |
| PROJECT_RESET | `new project first DOM clears old badges before events` | 新项目首次 DOM/会话重置条件不满足——**真实/夹具候选** |
| DUP | `history first then typed live still one` | 新端 history-first + live 出现重复载体（chat 两条回交投递）——**真实/载体候选** |
| MERGE | `full rebuild retains unpersisted live report settled and original pending card` | full rebuild 后卡身份/终端行/报告保留之一不满足——**真实/载体候选** |
| NOTICE | `live system notice is its own sys row with 系统 badge, not a user bubble` | 新端实时系统通知仅见纯文本，未呈独立 sys 行——**真实呈现缺陷候选** |
| BLANK | `fixture: background pane has queue/status rows but no transcript` | 新端后台 pane 未建立/呈现队列状态行——**真实/夹具候选** |
| DEFAULT | raw `anchor paragraph materialized 960` | `incremental reader anchor`/`full replay` 报告值相等；随后 toggleDrift 960 锚点段落未物化——**虚拟锚点未完全关闭（Phase 5）** |
| COMPLETE_FLOW | raw `role reading fixture must really scroll` | 报告 37 条全 true（P7/C/P3 全过）；随后角色文档阅读夹具未真滚动——**Phase 5 role-reading 缺口** |

## 四、main.mjs 10 项 repair 失败

逐项归因见 [repair-failures.md](2026-10-21-phase5a-new-entry-evidence/main-diff/repair-failures.md)；新端 365 名，10 项失败：

- **9 项真实行为候选**：`SESSION_REPAIR_SAME_ROLE_CONFIRMS_BACKEND`、`SESSION_REPAIR_EXPLICIT_RECOVERY_DELIVERS_ONCE`、`SESSION_REPAIR_FAILED_OPEN_DOES_NOT_SEND`、`SESSION_REPAIR_FAILED_OPEN_NO_USER_BUBBLE`、`SESSION_REPAIR_FAILED_OPEN_NO_REPLAY`、`PENDING_EXPLICIT_SAME_ROLE_CARD_AND_BUTTON_VISIBLE`、`RECOVERY_SAME_PENDING_CARD_ONCE`（旧端 C 同因但新端另有恢复链）、`RECOVERY_OLD_REQUEST_STILL_ANSWERABLE`、`RECOVERY_ENDED_REQUEST_NOT_REPLAYED`。
- **1 项诊断字段候选**：`DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS`（缺 `renderer.event-error/viewport/replay/recovery` 等；非用户行为，但无等价新检查）。
- `PROMISE_TIMEOUT`/`WAIT_TIMEOUT` 为 only-new 9 项之二，标为“待 PM：卡片未呈现/等待超时”，不是自动豁免；`NAVIGATION_BLOCKED` 已从最新 diff 消失（导航修复生效）。
- 这些项**不得静默豁免**；真实行为项须 5A 前修复并重跑。

## 五、允许差异台账

- main：[allowed-diff-ledger.md](2026-10-21-phase5a-new-entry-evidence/main-diff/allowed-diff-ledger.md)（366 行：254 MATCH、102 MATCH（值差异）、9 NEW-ONLY、1 OLD-ONLY/REMOVED）；每行旧值/新值/依据/替代覆盖/PM proposed。
- uiux：[uiux-allowed-diff-ledger.md](2026-10-21-phase5a-new-entry-evidence/uiux-allowed-diff-ledger.md)：旧端 5 个失败模式登记 OLD-ONLY/REMOVED；新端 6 个 NEW-FAIL + DEFAULT/COMPLETE_FLOW 两个截断 + design audit 12 条旧 DOM 失配，均未豁免。
- design audit 12 条（详见 [design-audit-failures.md](2026-10-21-phase5a-new-entry-evidence/design-audit-failures.md)）：`1-W1-行距16±1`、`6-可见行≥9`、`S3-无chip时尾行兜底`、`W6b-系统正文去前缀`、`W6-注入盒行高1.6`、`S2-chip对齐阅读列≤8`、`S1-截断目标仍可见`、`11-W11-loading同款转轮`、`9-W9-徽标12pxSVG`、`9-W9-转轮0.9±0.2s`、`10-W10-尾行含转轮`、`12-reduced-motion静止弧`；建议重锚到新 DOM 或退役并由等价新检查覆盖，测试不改产品断言。
- 旧端 5 个失败：C2（DEFAULT/RUNTIME，旧无载体）、SELECTOR 旧 180px、MIRROR 旧四角色、TOOLFOLD 旧 C1；均为旧端基线，登记 OLD-ONLY/REMOVED，不占新端门；旧端 `RECOVERY_SAME_PENDING_CARD_ONCE` 见 §四。

## 六、断言/边界

- 套件 check 名与旧端/4B 名单逐字对账；未删除/放宽断言；目标切换仅新增入口 env 管线（main/design audit 已支持 `ANS_RENDERER_ENTRY`）。
- 旧入口/套件旧快照 manifest 前后空 diff；新候选 build/身份哈希已冻结，运行期间 core diff 空。
- 只写 `角色卡/测试/` 与 `test/测试/`；未改产品代码/测试断言/配置，未读 `.env`，未 commit/push。证据 `user-data` 已删除。

## 七、5A 门结论与 PM 动作

**5A 门：不通过（needs-work）。** 需 PM/桌面UI 处理：

1. 修复/裁定 9 项 main 真实行为失败，重跑 main 新旧端；`RECOVERY_SAME_PENDING_CARD_ONCE` 复判同因并给出新端恢复链修复。
2. 修复或 PM 批准重锚 6 个 uiux NEW-FAIL；给出等价新检查，不得静默豁免。
3. 关闭 DEFAULT toggleDrift `anchor paragraph materialized 960` 虚拟锚点；关闭 COMPLETE_FLOW `role reading fixture must really scroll`（Phase 5）。
4. design audit 12 条旧 DOM 夹具重锚/退役方案（新端等价检查）；不得改产品断言。
5. `DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS` 诊断字段差异由 PM 决定替代覆盖；`PROMISE_TIMEOUT`/`WAIT_TIMEOUT` 逐项归因。
6. 允许差异台账逐行 PM 批准后，再重跑受影响套件并重判 5A；未批准前不得进入 5B。

## 八、post-fix3 更新（修复落盘后重跑，覆盖前文相关数值）

候选在 18:50–19:11 期间完成 chat-store/ipc/diagnostics/ChatRow/phase4b.css 修复；测试在 19:12 后重新 clean build（gzip **289,797B**）并重跑：

- **main.mjs**：旧 373 / 新 379 / 仅旧 1（`P13_NEW_SEMANTICS`）/ 仅新 7（P13_*）/ 值差异 **80**；**`E2E_PASS=true`、`E2E_FAILURES` 空**。10 项 repair 全部 true（5 SESSION_REPAIR、PENDING、RECOVERY×3、DIAGNOSTICS）。
- **uiux**：除下述外全部通过；**COMPLETE_FLOW 41/41 全段 pass**（P7 + role reading）、SEND_FACTS 8/8、TERMINAL_MERGE/PROJECT_RESET/DUP/NOTICE/BLANK 均转绿、VISUAL 54/54、RUNTIME 17/17、DELIVERY 9/9。
- 仅 2 项 uiux 旧 DOM 断言：`MERGE` 的 `window.__mergeCard` 同一 DOM 节点断言；`DEFAULT` 的 toggleDrift `parentNode` 直挂断言。产品行为/锚点由 main `ANCHOR_*`/`OPEN_CARD_*` 与重锚副本覆盖，需 PM 批准重锚，测试不改产品断言。
- `uiux-design-audit` 仍 abort 于旧 `.tool-records` 选择器；需重锚/退役。
- 最终 main G1–G5 分组见 [最终重分组](2026-10-21_change_phase5a-ledger-regroup-final.md)：G1 19/G2 12/G3 25/G4 21/G4-RESOLVED 1/G5 2/G0 292/NEW 7/OLD 1；G4 不得列差异。

**post-fix3 5A 结论仍为 needs-work**：不是产品行为全红，而是 G4 21 项旧 UI/夹具假设、MERGE/DEFAULT 两个旧 DOM 断言、design audit 旧脚本尚未获 PM 分组/重锚批准；未批准前 5A 门不通过。前文“10 repair 失败/6 uiux 早停”属于修复前候选，已由本节覆盖。
