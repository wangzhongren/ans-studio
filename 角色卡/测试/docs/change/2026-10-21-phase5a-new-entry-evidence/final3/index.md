# Phase 5A 最终冻结候选证据索引（final3）

**候选**：HEAD `224cf83`；JS `index-T1im4gOp.js`=`f568e2aa…`、CSS `index-DbPZU_Oj.css`=`b52cfca1…`、HTML=`f372e111…`；clean rebuild。gzip 本角色 289,120B（冻结摘要 288,552B）；CSP 严格；Node v24.14.0/Electron v44.7.0。

| 项 | 路径 |
| --- | --- |
| 候选哈希 | [candidate/core-sha256.txt](candidate/core-sha256.txt)、[dist-sha256.txt](candidate/dist-sha256.txt)、[csp-gzip.txt](candidate/csp-gzip.txt) |
| 最终 G1–G5 | [main-diff/FINAL-G1-G5.md](main-diff/FINAL-G1-G5.md)、机器台账 [final-allowed-diff-ledger.json](main-diff/final-allowed-diff-ledger.json)、核对 [ledger-audit.txt](main-diff/ledger-audit.txt) |
| main 旧/新 | [raw/main-old/report.txt](raw/main-old/report.txt)、[raw/main/report.txt](raw/main/report.txt) |
| uiux 全段 | `raw/uiux/<MODE>/report.json` + stdout |
| 5A smoke 36/36 | [raw/smoke5a/report.json](raw/smoke5a/report.json) |
| design audit 31/31 | [raw/design-audit/report.json](raw/design-audit/report.json) |
| 12 项遮挡断言 | [occlusion/report.json](occlusion/report.json) + `occlusion/out/*.png`（480/680 report/details/preview/mirror/delivery/S0） |
| 密度 | [raw/density/report.json](raw/density/report.json) |
| S0 9/9 | [raw/s0/report.json](raw/s0/report.json) |
| 200% operator/mirror/delivery | [raw/zoom200/report.json](raw/zoom200/report.json) + 截图 |
| bench 3 轮 | `raw/bench{1,2,3}.json` |
| 单测/旧基线/IME/lazy | `raw/unit.txt`、`raw/baseline.txt`、`raw/ime/report.txt`、`raw/lazy/report.json` |
| 证据哈希 | [snapshot-manifest.sha256](snapshot-manifest.sha256) |

**结论**：5A 门 **pass**；G1–G5/NEW/OLD 无未批准行、MATCH-FAIL=0。唯一命名说明：main.mjs 无 `BOOTSTRAP_S0_*` 六名，行为由 5A smoke 36/36 的 S0 3 项 + 独立 S0 9/9 覆盖，待 PM 接受等价或 5B 前补名。

**2026-10-21 验收补正**：`OPEN_CARD_AT_ARRIVAL` 旧 207→新 206 已补列 G3（PM §19.3 索引归一化；`OPEN_CARD_STABLE_AT_ANCHOR=true`），G3 25→26；final3 的 75 条值差异全部登记。post-fix3 JSON/MD 台账同步修正；旧基线 raw 为 683/683（679+4），旧 uiux 套件版本限制见 5B 报告。
