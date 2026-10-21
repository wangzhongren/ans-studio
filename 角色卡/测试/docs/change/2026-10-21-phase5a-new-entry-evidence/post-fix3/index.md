# Phase 5A post-fix3 最终复核证据

**候选**：修复落盘后 clean build；入口 `app/renderer/dist/src/index.html`；`candidate/core-sha256.txt`、`dist-sha256.txt`、`csp-gzip.txt`。gzip 289,797B；main `E2E_PASS=true`；uiux 全量除 MERGE/DEFAULT 旧 DOM 断言外通过；design audit 旧 `.tool-records` 脚本 abort。

| 项 | 路径 |
| --- | --- |
| 最终 main 分组台账 | [main-diff/final-regroup-ledger.md](main-diff/final-regroup-ledger.md) / [JSON](main-diff/final-allowed-diff-ledger.json) |
| main 原始 | [raw/main/report.txt](raw/main/report.txt) |
| uiux 最终 | `raw/uiux/<MODE>/report.json` |
| design audit | [raw/design-audit/error.txt](raw/design-audit/error.txt) / stdout |
| bench | `raw/bench/new{1,2,3}.json` |
| Node/IME/lazy | `raw/node/*`、`raw/ime/report.txt`、`raw/lazy/report.json`（如存在） |

最终分组：G1 19 / G2 12 / G3 25 / G4 21 / G4-RESOLVED 1 / G5 2 / G0 292 / NEW-ONLY 7 / OLD-ONLY 1。5A 门仍待 PM 批准 G1–G3 与 MERGE/DEFAULT/design audit 重锚；G4 不得列差异。
