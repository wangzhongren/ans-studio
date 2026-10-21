# Phase 5A 冻结候选最终证据索引

**候选**：HEAD `224cf83`；JS `index-sSLXHl7e.js`（`f568e2aa…`）、CSS `index-CM2A97v3.css`（`57d9575c…`）、HTML `c9d13918…`；clean rebuild。gzip（本角色扫描）288,827B；桌面UI 冻结值 288,262B。Node v24.14.0；Electron v44.7.0。

| 项 | 路径 |
| --- | --- |
| 候选哈希 | [candidate/core-sha256.txt](candidate/core-sha256.txt)、[dist-sha256.txt](candidate/dist-sha256.txt)、[csp-gzip.txt](candidate/csp-gzip.txt) |
| 最终 G1–G5 台账 | [main-diff/FINAL-G1-G5.md](main-diff/FINAL-G1-G5.md) |
| main 旧/新原始 | [raw/main-old/report.txt](raw/main-old/report.txt)、[raw/main/report.txt](raw/main/report.txt) |
| uiux 全段 | `raw/uiux/<MODE>/report.json` + stdout |
| 5A 冒烟 24/24 | [raw/smoke5a/report.json](raw/smoke5a/report.json) |
| design audit（exit 0） | [raw/design-audit/report.json](raw/design-audit/report.json) |
| 密度规范化夹具 | [raw/density/report.json](raw/density/report.json) |
| S0 独立探针 9/9 | [raw/s0/report.json](raw/s0/report.json) |
| 200% operator/mirror/delivery | [raw/zoom200/report.json](raw/zoom200/report.json) + `raw/zoom200/out/*.png` |
| bench 3 轮 | `raw/bench{1,2,3}.json` |
| 单测/旧基线/IME/lazy | `raw/unit.txt`、`raw/baseline.txt`、`raw/ime/report.txt`、`raw/lazy/report.json` |
| 证据哈希 | [snapshot-manifest.sha256](snapshot-manifest.sha256) |

**结论**：全部官方套件通过；G1/G2/G3/G4/G5/NEW/OLD 无未批准行，MATCH-FAIL=0。唯一命名说明：main.mjs 尚无 `BOOTSTRAP_S0_*` 六个官方名，S0 行为由官方 5A 冒烟 3 项 + 独立 S0 探针 9/9 覆盖，建议 PM 接受等价或 5B 前补名。
