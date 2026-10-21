# Phase 5B 新入口最终证据索引

**候选**：HEAD `224cf83`；入口 `app/renderer/dist/index.html`；HTML `3c4da2a2…`、JS `f568e2aa…`、CSS `76fad7ce…`；clean rebuild 哈希一致；gzip 289,095B；CSP 严格。

| 项 | 路径 |
| --- | --- |
| 候选身份/哈希 | [candidate/identity.txt](candidate/identity.txt)、[git-status.txt](candidate/git-status.txt)、[core-sha256-after.txt](candidate/core-sha256-after.txt)、[core-sha.diff](candidate/core-sha.diff)、[dist-sha256.txt](candidate/dist-sha256.txt)、[csp-gzip.txt](candidate/csp-gzip.txt)、[csp-gzip-recheck.txt](candidate/csp-gzip-recheck.txt) |
| 候选分离（AC8 §2.3） | [candidate/candidate-separation.md](candidate/candidate-separation.md) |
| 最终 G1–G5 / 5A 对照 | [main-diff/FINAL-G1-G5-5B.md](main-diff/FINAL-G1-G5-5B.md)、[5a-vs-5b-diff.txt](main-diff/5a-vs-5b-diff.txt)、[5a-old-vs-final3-uiux.txt](main-diff/5a-old-vs-final3-uiux.txt) |
| main 新入口 | [raw/main/report.txt](raw/main/report.txt)（397 名，E2E_PASS=true） |
| uiux 23 段 | `raw/uiux/<MODE>/report.json` + stdout（全部 exit 0） |
| ime | [raw/ime/report.txt](raw/ime/report.txt)（26 true） |
| design audit | [raw/design-audit/report.json](raw/design-audit/report.json)（31/31） |
| 单测/基线/测试域 | `raw/node/unit-ui.txt` 142、`raw/node/desktop.txt` 504、`raw/node/test-domain.txt` 715/714/1（rg 环境红） |
| 懒挂载 | `raw/lazy/report.json`（10/10） |
| bench 3 轮 | `raw/bench/new{1,2,3}.json` |
| packaged smoke 14/14 | [packaged/local-smoke.json](packaged/local-smoke.json)、[packaged/verify-local.txt](packaged/verify-local.txt) |
| 5A 快照完整性引用 | `../2026-10-21-phase5a-old-baseline-evidence/snapshot-manifest.sha256`（`shasum -c` 0）、旧入口/套件 manifest diff 空 |
| 证据哈希 | [snapshot-manifest.sha256](snapshot-manifest.sha256) |

**结论**：5B 门 pass；旧端不可复跑，仅 5A 快照参照；唯一测试红为环境缺真实 rg；G1–G5 补正后 G3 26、无未批准行、MATCH-FAIL=0；旧 uiux 套件版本限制（`d568bf82` vs `fa3f74d4`）已记录，实质 0 个旧通过→新失败；`RELATIVE_ASSET_REFS` 为探针口径过期、已按 5B `./assets/` 重跑为 true，不是 CSP 失败；候选分离清单见 `candidate/candidate-separation.md`；S0 `BOOTSTRAP_S0_*` 命名说明按 5A 记录待 PM 等价/补名。
