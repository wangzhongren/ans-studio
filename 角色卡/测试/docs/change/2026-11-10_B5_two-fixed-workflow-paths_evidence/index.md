# B5 证据索引（2026-11-10）

任务：`2026-11-10-two-fixed-workflow-paths` B5（测试角色，独立固定上下文）。
HEAD `e645e4e`；分支 `feat/two-fixed-workflow-paths`。本目录只存本批证据；未提交/未推送。

## 1. 缺口证据（G-B5-1/2/3；阻塞 RR，交 owner）

| 文件 | 内容 | 可复现命令 |
| --- | --- | --- |
| `gap-a12a-projection.txt` | 桌面直派 A12a 后投影仍 `pending`；A11 stage-request 被 AC-09 门拒绝（`stage-transition-invalid`） | `node _evidence/probe-a12a-gap.mjs` |
| `gap-record-stage-dispatch-wiring.txt` | `recordStageDispatch` 生产调用点检索（`src/app` 除定义外为空） | `grep -rn recordStageDispatch src app --include=*.ts` |
| `gap-a6-marker.txt` | `stage.requested A6` 无生产写入者；在办写入仅 A3（prepareIntent）/A10（run-role）/A13·B4（release） | `grep -an stageRequestIdempotencyKey( src/pipeline/orchestration/run-role.ts src/common/编排/workflow-service.ts` |
| `gap-b2-writer.txt` | `recordChangeScopeDecision` 无生产调用点 | `grep -rn recordChangeScopeDecision src app --include=*.ts` |
| `gap-chain-host-glue-a.txt` / `probe-chain-a.mjs` | 宿主 glue（recordStageDispatch + A6 marker）下路径 A 全链探针：A1→…→A13→delivered（HEAD=main） | `node _evidence/probe-chain-a.mjs` |
| `gap-chain-host-glue-b.txt` / `probe-chain-b.mjs` | 宿主 glue（recordChangeScopeDecision）下路径 B 全链探针：B1→B4→delivered | `node _evidence/probe-chain-b.mjs` |

说明：以上探针**不是**产品修复；宿主 glue 只用于证明机制可通。生产接线缺失的修复属桌面窗口/编排写集。

## 2. 已知红参照（同一候选 HEAD e645e4e；来自 B4.1/B4.2 D1 证据）

| 文件 | 来源 | 行数 |
| --- | --- | --- |
| `ref-knownred-orch-24.txt` | `角色卡/编排/.../2026-11-10_B4.1_..._evidence/05-after-failure-names.txt` | 24 |
| `ref-knownred-gates-5.txt` | `角色卡/桌面窗口/.../2026-11-10_B4.2_..._evidence/07-gates-fail-names.txt` | 5 |
| `ref-knownred-runtime-core-33.txt` | `角色卡/桌面窗口/.../2026-11-10_B4.2_..._evidence/08-runtime-core-fail-names.txt` | 33 |
| `ref-knownred-desktop-4.txt` | `角色卡/桌面窗口/.../2026-11-10_B4.2_..._evidence/11-knownred-after-names.txt` | 4 |
| `ref-knownred-desktop-b3-suites.txt` | `角色卡/桌面窗口/.../2026-11-10_B3_..._evidence/after-fail-names.txt`（24 套件） | 48 |
| `ref-knownred-desktop-b3-remaining.txt` | 同 B3 `after-remaining-fail-names.txt`（40 文件扩面） | 32 |
| `ref-knownred-desktop-b3-env4.txt` | 同 B3 `after-env4-fails.txt`（环境敏感 3 套件） | 5 |
| `ref-knownred-desktop-union.txt` | 上述桌面参照去重并集（逐名对照用） | 80 |

## 3. D1 运行

- `run-tests.mjs`：逐文件独立进程 + TAP + 超时（登记挂起文件 90s、其余 300s）；未使用 `--test-force-exit`。
- `d1-before-test-domain/`：`test/测试` before（116 文件）= **703 / 646 / 38 / 1 / 18**，1 登记挂起
  （`customer-authorization-plane-integration` 90s watchdog）；`results.tsv`/`failing-names.json`/`totals.json`/`run.log.txt`。
- `d1-new-tests/`：3 个新文件（8 tests 全绿、0 skip）；`results.tsv`/`failing-names.json`/`totals.json`/TAP。
- `d1-after-test-domain/`：after 数据集 = before 116 文件（逐文件隔离等价）+ 新 3 文件 ⇒ **711 / 654 / 38 / 1 / 18**。
- `d1-diff/`：before vs after 失败名集合 diff = **added 0 / removed 0**（39 entries 逐名一致）。
- `d1-domains/`：known-red 域逐文件复跑（353 文件；`results.tsv`/`failing-names.json`/`totals.json`/
  `run.log.txt`；失败/挂起 TAP 在 `tap-failing/`）。
  - 计数：编排 1,301/1,275/24/2（+一次性原生崩溃 27 tests；`tap-crash-rerun/` 隔离复跑 47/46/1，
    补足后 1,328/1,302/24/2 = B4.2 参照）、桌面 717/633/84/0/0（4 挂起 watchdog）、
    门禁 528/522/5/1、runtime-core 586/549/33/4、roles 275/275、项目管理 224/218/1/5、gates 29/29。
  - 失败名对照（`d1-knownred/`）：编排 24/24、门禁 5/5、runtime-core 33/33 逐名一致；
    桌面 88 vs 并集 80，8 条差集全部属已登记非确定/挂起套件（chief-workflow/optional-acceptance/
    stuck-redispatch/session-rebuild-race）。
  - **G-B5-4**：`tap-failing/test_项目管理_shared_i18n-guard.test.ts.tap`——`app/desktop/workflow.ts:20`、
    `app/desktop/workflow-git.ts:32` 中文 import 路径未入 allowlist（候选回归，非 B5 引入）。
- `typecheck-after.txt`：`npm run typecheck` exit 0（含 3 个新文件）。

## 4. 工具哈希

| 文件 | SHA-256 |
| --- | --- |
| `probe-a12a-gap.mjs` | `4eb8bd6201350cec3b66eaee4c1a9bc9753c8123d6ae3fa6b7199e4d597f56d7` |
| `probe-chain-a.mjs` | `9a1b520212435537df89d71c3757707ea6fb574688360398a081652ed43516b6` |
| `probe-chain-b.mjs` | `28dad9e17f7513fa9722ab54ed7153bd94b0e8f5383eb74f825fe69e5e1ae500` |
| `run-tests.mjs` | `dc47dd4ab8cd4fc6d0e869309192eefcbb6bb1186b1f0222ec8358cbf2e38f95` |
| `combine-after.mjs` | `a852089e11ee8df40dfdcf2f95fc3666ce4558a2b8a35aaf5643778e2fd9fe62` |
| `diff-failures.mjs` | `614fa4f8418341f8475750726ff35b014c61b5a5efa8f0df105633f534fd2bba` |
| `compare-ref.mjs` | `502d6592adbf3c819bd0c7dddbfd1dc6f3b7197375b2841454bbe7aa1599d563` |
| `summarize-domains.mjs` | `e69450d1304f5b0735957dd6e8a1e668883896fb23794ce81cbe25dc736a158f` |

## 5. 复现

1. `npm run typecheck`。
2. 生成文件清单（`find test/测试 -name '*.test.ts' | LC_ALL=C sort`）后：
   `node _evidence/run-tests.mjs <outDir> <listFile> --max=300000 --hang=90000`。
3. 合并 before+new：`node _evidence/combine-after.mjs <beforeDir> <newDir> <outDir>`；
   失败名 diff：`node _evidence/diff-failures.mjs <before.json> <after.json> <outDir>`；
   对照冻结 known-red：`node _evidence/compare-ref.mjs <failing-names.json> <prefix> <ref.txt> <out.txt>`。
4. 缺口复现：`node _evidence/probe-a12a-gap.mjs`；宿主 glue 全链探针：`node _evidence/probe-chain-a.mjs|probe-chain-b.mjs`。
