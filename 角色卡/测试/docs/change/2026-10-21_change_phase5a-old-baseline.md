---
id: change-ui-platform-phase5a-old-baseline
type: change
title: Phase 5A 旧端全量快照——套件/退出码/check 名/哈希；main 允许差异台账骨架
created: "2026-10-21"
updated: "2026-10-21"
timezone: Asia/Shanghai
status: old-baseline-frozen（新端待候选冻结）
related: [design-ui-platform-phase5-test-plan, phase5-suite-inventory, ui-platform-round-review]
events:
  - date: "2026-10-21"
    kind: verified
    summary: 按 Phase 5 计划执行旧入口全量快照（uiux-v2 默认+22 模式、main、ime、bench 3 轮、design audit、Node/懒挂载），逐命令/退出码/报告/check 名/哈希落盘；用桌面窗口 5A report-diff 建 367 名允许差异台账骨架；核实 RECOVERY_SAME_PENDING_CARD_ONCE 旧端 C 类同因；新端全量待候选冻结
---

# Phase 5A 旧端全量快照

**范围**：按 [Phase 5 测试计划](../design/2026-10-21_design_ui-platform-phase5-test-plan.md) §五执行旧入口快照；本报告只下旧端结论，不代表新端、不进入 5B。入口 `app/renderer/index.html`；HEAD `224cf83`；Node v24.14.0；Electron v44.7.0；Darwin arm64。证据：[2026-10-21-phase5a-old-baseline-evidence](2026-10-21-phase5a-old-baseline-evidence/index.md)。

> **套件版本限制（2026-10-21 验收补记）**：本报告 §一/§二的 uiux 与 main 357 名快照生成于 18:04–18:05，套件 `uiux-v2.mjs`/`main.mjs` 为 `d568bf82…`（`manifest-old-entry-before/after.sha256`）。最终套件为 `fa3f74d4…`（final3 `candidate/core-sha256.txt`）。旧端 main 已于 20:44 用最终套件复跑，得到 **391 名**（[final3/raw/main-old/report.txt](2026-10-21-phase5a-new-entry-evidence/final3/raw/main-old/report.txt)）；旧端 uiux **未**在删除前用最终套件复跑，旧端已删除、不可补跑。实质对照：旧端 uiux 通过名 424 个在新端全部存在且仍为 true（0 个旧通过→新失败）；5 个旧端失败名逐条登记（`old-red-status.md`）。因此不得再声称旧/新 uiux「同套件源码」，只能记为「旧套件版本限制 + 已证实质等价」。

## 一、结果总览

| 套件 | 结果 |
| --- | --- |
| uiux-v2 默认 + 22 模式 | 18 模式 exit 0；5 模式 exit 1（DEFAULT、SELECTOR、RUNTIME、MIRROR、TOOLFOLD），失败名见 §二；全部模式有 `report.json` 与逐名文件 |
| main.mjs 旧入口 | exit 0，`E2E_DONE=1`，`E2E_PASS=false`，`E2E_FAILURES=RECOVERY_SAME_PENDING_CARD_ONCE`；357 名（旧套件 18:04 快照；20:44 用最终套件复跑为 **391 名**，见 final3 `raw/main-old/report.txt`） |
| ime-enter | exit 0，24 检查基线，`E2E_DONE=1` |
| bench-storm 旧端 3 轮 | exit 0；`stormA.maxGap` 23.3/18.2/21.5，`stormB` 17.6/17.9/17.8，`replay` 18.2/21.3/19.4，`scroll` 18.6/25.7/13.2；`histDirect=false`（旧渲染器口径） |
| uiux-design-audit | exit 1，无 report；`error.txt` 在 S1 折叠摘要夹具取 `#chat .tool-records` 为 null，旧端不支持新工具组载体（old-only/C） |
| Node 单测 / 旧基线 | 96/96、683/683 exit 0（raw [baseline.txt](2026-10-21-phase5a-old-baseline-evidence/raw/node/baseline.txt)；679 基线 +4 桌面窗口 5A 检查） |
| 懒挂载 | exit 2；旧入口无新工具组契约，`LAZY_DENIED_DIRECT_VISIBLE=false`（new-only，旧端 N/A） |

**命令/退出码/报告路径/逐名**：[suite-index.md](2026-10-21-phase5a-old-baseline-evidence/suite-index.md)；逐名 `check-names/`；环境/hash：[environment.txt](2026-10-21-phase5a-old-baseline-evidence/environment.txt)、[manifest-note.md](2026-10-21-phase5a-old-baseline-evidence/manifest-note.md)。

## 二、旧端 uiux 失败名（逐名）

| mode | 失败名 | 归类 |
| --- | --- | --- |
| DEFAULT | `expired old shell collapses with reason visible in its own runtime` | 旧端无 C2 重锚载体，C 类 |
| SELECTOR | `selector dimensions and viewport 1360` | 旧菜单 180px/旧几何 vs 新 208px，旧端基线 |
| RUNTIME | `expired old shell collapses with reason visible in its own runtime` | 同 DEFAULT，C 类 |
| MIRROR | `W6-C five-role tree: Liaison primary; governance group exactly Rapporteur/Nominator/Convener/Verifier` | 旧端四角色夹具，无 verifier；旧端基线 |
| TOOLFOLD | `tail fold movement bounded and non accumulating with the reading row still in view`；`fold anchor offsets=null` | 旧端 C1 旧口径，C 类 |

旧端其余模式通过；旧端 `VISUAL` 54 条全过、`DELIVERY_NOTE` 9 条全过、`COMPLETE_FLOW` 41 条（40 true + 1 报告对象）全过（旧端 P7 已通过）。

## 三、main.mjs 允许差异台账骨架

桌面窗口 5A report-diff：old 357 / new 366 / common 356 / only-old 1 / only-new 10 / 值差异 103。已逐名建表：

- [allowed-diff-ledger.md](2026-10-21-phase5a-old-baseline-evidence/main-diff/allowed-diff-ledger.md)（367 行）
- [allowed-diff-ledger.json](2026-10-21-phase5a-old-baseline-evidence/main-diff/allowed-diff-ledger.json)

状态：`MATCH` 253（同名同值）、`MATCH（值差异）` 103、`NEW-ONLY` 10、`OLD-ONLY/REMOVED` 1。每行含旧值/新值/依据/替代覆盖/PM 决定（当前 proposed/—）。值差异中环境类（`OUTDIR`/`RENDERER_ENTRY`/`SHOT_*`）标注为环境归一后复跑；`NAVIGATION_BLOCKED` 与 `PROMISE_TIMEOUT`/`WAIT_TIMEOUT` 标注为“待 PM 裁定，可能是 5A 新端缺口”，未自动豁免。

## 四、`RECOVERY_SAME_PENDING_CARD_ONCE=false` 核实（C 类）

- 测试独立复跑旧端 main，得到与桌面窗口旧报告**完全相同的 357 名**，非环境值逐名零差异；唯一失败 `RECOVERY_SAME_PENDING_CARD_ONCE=false`。
- 旧端相邻恢复检查均为 true：`RECOVERY_VISIBLE_FAILURE_BUTTON`、`RECOVERY_PROJECT_AND_ROLE_RESTORED`、`RECOVERY_NO_AUTO_REPLY_OR_SEND`、`RECOVERY_OLD_REQUEST_STILL_ANSWERABLE`、`RECOVERY_ENDED_REQUEST_NOT_REPLAYED`、`DIAGNOSTICS_WINDOW_AND_RENDERER_EVENTS`；桌面窗口实测同 id 卡 2 张。
- 新端报告同名为 false，且另带 9 项 recovery/session-repair 失败；旧端只有这一条，说明旧端是**单点同 id 回放去重**问题，不是入口切换/Markdown/导航兜底引入。
- 判定：**C 类（旧端既有、当前仓库真实会话历史下复现）**；历史干净夹具曾为 true。新端是否同因待候选冻结后复判；不得用旧端 C 类掩盖新端新增 9 项。

## 五、manifest 与快照完整性

- 旧入口/套件稳定 manifest：[before](2026-10-21-phase5a-old-baseline-evidence/manifest-old-entry-before.sha256) / [after](2026-10-21-phase5a-old-baseline-evidence/manifest-old-entry-after.sha256)，`diff` 为空（exit 0）。
- 完整候选 manifest 快照期间 `app/main.ts` 被桌面窗口导航兜底在途修改（`2fdb2173…`→`9e7cef76…`）；旧入口/旧端套件不读取 `app/main.ts`，故旧端快照不受影响；详见 [manifest-note.md](2026-10-21-phase5a-old-baseline-evidence/manifest-note.md)。新端全量开始前候选冻结后重新生成完整 manifest。
- 证据哈希：[snapshot-manifest.sha256](2026-10-21-phase5a-old-baseline-evidence/snapshot-manifest.sha256)。

## 六、等待新端（候选冻结后）

1. 新端同套件全量（uiux 默认+22 模式、main、ime、bench 3 轮、design audit、Node/懒挂载），逐 check 名对照；main/design audit 需先完成 5A-0 统一 `ANS_RENDERER_ENTRY`。
2. 填 [uiux-diff-skeleton.md](2026-10-21-phase5a-old-baseline-evidence/uiux-diff-skeleton.md) 与 main 台账的 new 值/失败名；逐行 PM 批准。
3. 确认三项 Phase 5 缺口在新端官方段自然 pass；`RECOVERY_SAME_PENDING_CARD_ONCE` 新端是否与旧端同因。
4. 所有未批准差异/新端红不得进入 5B；不得用旧端结果代替新端，不弱化断言。

只写 `角色卡/测试/` 与 `test/测试/`；未改产品代码/测试断言/配置，未读 `.env`，未 commit/push。
