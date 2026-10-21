# Phase 5A 新端全量证据索引

**候选**：HEAD `224cf83`；入口 `app/renderer/dist/src/index.html`；clean build；Node v24.14.0；Electron v44.7.0；Darwin arm64。候选身份/哈希见 [candidate/identity.txt](candidate/identity.txt)、[candidate/dist-sha256.txt](candidate/dist-sha256.txt)、[candidate/core-sha256.txt](candidate/core-sha256.txt)；构建前后核心哈希 diff 为空（[core-sha.diff](candidate/core-sha.diff)）。

| 项 | 路径 |
| --- | --- |
| 套件索引（command/exit/report/check 名） | [suite-index.md](suite-index.md) |
| main 逐名 | [check-names/main.txt](check-names/main.txt)、[raw/main/report.txt](raw/main/report.txt) |
| main 允许差异台账（366 行） | [main-diff/allowed-diff-ledger.md](main-diff/allowed-diff-ledger.md) / [.json](main-diff/allowed-diff-ledger.json) |
| 10 项 repair 失败归因 | [main-diff/repair-failures.md](main-diff/repair-failures.md) |
| uiux 双端差异台账 | [uiux-allowed-diff-ledger.md](uiux-allowed-diff-ledger.md) |
| uiux 原始/逐名 | `raw/uiux/<MODE>/report.json`、`check-names/uiux-<MODE>.txt` |
| ime | [raw/ime/report.txt](raw/ime/report.txt) |
| bench 新端 3 轮 | `raw/bench/new{1,2,3}.json` |
| design audit | [raw/design-audit/error.txt](raw/design-audit/error.txt)、stdout、截图；12 条失配见 [design-audit-failures.md](design-audit-failures.md) |
| Node/懒挂载 | `raw/node/unit-ui.txt`（142）、`raw/node/baseline.txt`（683）、`raw/lazy.stdout.log`（10/10） |
| 证据哈希 | [snapshot-manifest.sha256](snapshot-manifest.sha256) |

**结论**：5A **needs-work**；新端 6 个 uiux 模式早停、design audit 12 条旧 DOM 夹具失配、main 10 项 repair 失败（9 真实行为候选 + 1 诊断字段候选）；三项缺口 Sidebar/P7 已关闭，虚拟锚点仅 `full replay` 过而 toggleDrift 仍红。详见[独立验证报告](../change/2026-10-21_change_phase5a-independent-verification.md)。
