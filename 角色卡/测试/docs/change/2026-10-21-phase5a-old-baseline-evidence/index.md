# Phase 5A 旧端快照证据索引

**候选/入口**：旧入口 `app/renderer/index.html`；HEAD `224cf83`；Node v24.14.0；Electron v44.7.0；Darwin arm64。详见 [environment.txt](environment.txt)。

| 项 | 路径 |
| --- | --- |
| 套件索引（command/exit/report） | [suite-index.md](suite-index.md) |
| 旧端红/差异登记 | [old-red-status.md](old-red-status.md) |
| uiux 双端差异骨架（新端待填） | [uiux-diff-skeleton.md](uiux-diff-skeleton.md) |
| main.mjs 允许差异台账（367 名） | [main-diff/allowed-diff-ledger.md](main-diff/allowed-diff-ledger.md) / [.json](main-diff/allowed-diff-ledger.json) |
| 桌面窗口 5A report-diff 原始 | [main-diff/desktop-window-report-diff.json](main-diff/desktop-window-report-diff.json) / [.md](main-diff/desktop-window-report-diff.md) |
| 候选 manifest（完整） | [manifest-before.sha256](manifest-before.sha256) / [manifest-after.sha256](manifest-after.sha256) / [manifest-note.md](manifest-note.md) |
| 旧入口/套件稳定 manifest | [before](manifest-old-entry-before.sha256) / [after](manifest-old-entry-after.sha256)（diff 空） |
| uiux 原始 | `raw/uiux/<MODE>/report.json`、`raw/uiux/<MODE>.stdout.log` |
| uiux 逐名 | `check-names/uiux-<MODE>.txt` |
| main 原始/逐名 | [raw/main/report.txt](raw/main/report.txt) / [check-names/main.txt](check-names/main.txt) / 截图 `raw/main/*.png` |
| ime | [raw/ime/report.txt](raw/ime/report.txt) |
| bench 旧端 3 轮 | `raw/bench/old{1,2,3}.json` |
| design audit | [raw/design-audit/error.txt](raw/design-audit/error.txt)、截图 `raw/design-audit/*.png` |
| Node/懒挂载 | `raw/node/unit-ui.txt`、`raw/node/baseline.txt`、`raw/lazy.stdout.log` |
| 证据哈希 | [snapshot-manifest.sha256](snapshot-manifest.sha256)（生成于本轮结束） |

**结论**：旧端快照已落盘；旧入口/套件稳定 manifest 前后一致。旧端 main 独立复跑与桌面窗口旧报告 357 名逐名一致（非环境值零差异），唯一失败 `RECOVERY_SAME_PENDING_CARD_ONCE=false` 判 C 类同因。新端全量、最终差异判定与 5B 等候选冻结通知。
