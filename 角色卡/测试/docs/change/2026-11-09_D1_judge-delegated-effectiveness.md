# D1：judge-delegated 组合确定性验证记录（judge 代批生效）

- 日期：2026-11-09；角色：ans-studio 固定 worker「测试」（roleId: 测试），独立验证上下文。
- 任务：对「judge 代批生效」变更的**全部在飞批次组合候选**（W-J1–W-J5 + W-J2b）执行 **D1 组合确定性验证**：候选完整性/哈希/清单、受影响套件逐文件前后对照、失败/skip 集合 diff、typecheck、环境抖动隔离复跑。
- 本记录**只取证、不判验收**；未修改任何产品/测试/角色卡/文档；只写 `角色卡/测试/docs/change/2026-11-09_D1_judge-delegated-effectiveness-evidence/`。未运行真实模型/Electron；未占用 9222；未提交/推送/合并。
- 工作目录 worktree：`.claude/worktrees/trunk-amendment`；分支 `feat/plan-escalation-card`；基线 HEAD **`fb1aa39e787934f334b9c164e4221074f97f6147`**（tree `ee33c3e95d9b3fb61dc5d05eea66c2d0a2eb9583`；提案卡修复已提交，见 `fb1aa39` 提交内容）；Node **v24.22.1**，npm 11.19.1。
- 状态：**D1 取证完成。组合候选与六批 after 状态逐文件字节一致；五个套件计数与各批参照逐一相符；新增确定性测试级失败 = 0、新 skip = 0；typecheck exit 0；1 个进程未退出抖动经同候选隔离复跑自然通过（1/1，62s）。未验收。**

## 0. 结论摘要（供 B2 使用，不代替验收判定）

| 项 | 结果 |
| --- | --- |
| 组合候选 | `src app test` 共 **25** 个在飞文件（11 src M + 12 test M + 2 test 新文件），与 W-J1(4)+W-J2(11)+W-J3(3)+W-J4(2)+W-J5(3)+W-J2b(2) 的 after 状态**逐文件 SHA-256 全等**（diff 为空）；canonical 聚合一致（§2.2） |
| 写集外改动 | `app/desktop` 产品 diff = **0**；`git status -- src app test` 恰为上述 25 文件（运行前/终点两次快照逐行相同）；全仓 `git status` 在运行中与全部套件完成后逐行相同 |
| 候选稳定性 | 运行前/中/后三次复取 write-set 与 `src app test` manifest **逐字节相同** |
| 受影响套件 | runtime-core **540/503/33/4**；编排 **1133/1109/22/2**；门禁引擎 **453/447/5/1**；桌面应用四文件 **61/35/26/0**；`test/测试` W-J5 相关 7 文件 raw **9/8/1**（归一化 8/8/0）——全部与各批 after 参照相符 |
| 失败标题集合 | 五个套件与各批 pre/post 失败标题集合 diff 均为空（test-role 的 3 条差异全部为文件级合成条目/旧断言改写，见 §5.5） |
| 新增确定性失败 | **0**（无新增测试级断言失败；`test/测试` 唯一 raw fail 为文件级合成条目，同候选隔离复跑 1/1 pass） |
| 新 skip | **0**（skip 计数：runtime-core 4、编排 2、门禁 1，与各批参照相同；桌面/test-role 0） |
| typecheck | `npm run typecheck`（`tsc --noEmit`，`app/renderer` 按 tsconfig 排除）**exit 0** |
| 环境抖动 | 1 次「测试本体通过但进程未退出」（effectiveness，本体 ok 62.1s，300s watchdog 杀进程）；同候选隔离复跑自然 exit 0（1/1）；无原生崩溃；未 force-exit |

## 1. 依据与口径

- 方案 P1.2：`docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`，SHA-256 `1477a6e423a74a7007824b7db82cac4e0f6dbb9e48abaa60a7f452704672e6be`（与任务给定一致）。
- 验收 B1 v1.1：`docs/acceptance/2026-11-09_judge-delegated-decision-effectiveness-criteria-v1.md`，SHA-256 `4cbb5df2507c2b30d43b37707cba305490ca8f8fc365b65e25a18f99b3693543`（与任务给定一致）。
- 批次证据（只读消费，SHA-256 与任务给定逐一一致）：
  - W-J1 `角色卡/运行时核心/docs/change/2026-11-09_WJ1_judge-delegated.md` `72848a5b…`；
  - W-J2 `角色卡/编排/docs/change/2026-11-09_WJ2_judge-delegated.md` `70f0f62a…`；
  - W-J3 `角色卡/门禁引擎/docs/change/2026-11-09_WJ3_judge-delegated.md` `221b3199…`；
  - W-J4 `角色卡/桌面窗口/docs/change/2026-11-09_WJ4_judge-delegated.md` `1a4926ef…`；
  - W-J5 `角色卡/测试/docs/change/2026-11-09_WJ5_judge-delegated.md`（含 §7 amendment）`c811d518…`；
  - W-J2b `角色卡/nominator-code/docs/change/2026-11-09_WJ2b_judge-d3-by.md` `c2defed0…`。
- 判定口径：B1 §1 **BASE-3**（基线已知红项 + 增量不回归；新增确定性失败 = 0、新 skip = 0；环境抖动须同候选隔离复跑通过方可排除）。本 D1 以**组合候选**为唯一被测对象；"组合前"参照取各批记录的 pre/post 失败标题集合（各批 pre↔post diff 均为空，见各批 evidence）。

## 2. 组合候选

### 2.1 写集（25 文件；逐文件 provenance）

`git status --porcelain -- src app test`（原始：`candidate/status-src-app-test.txt`）恰为 25 项：11 个 `src/**` M、12 个 `test/**` M、2 个 `test/测试/**` 新文件（`??`）。

| 批次 | 文件数 | 文件 |
| --- | --- | --- |
| W-J1（运行时核心） | 4 | `src/model/version-change.ts`、`src/model/runtime.ts`、`test/runtime-core/direct-role-capabilities.test.ts`、`test/runtime-core/version-change-contract.test.ts` |
| W-J2（编排） | 11 | `src/service/trunk/impl/apply-journal.ts`、`src/service/version-change/impl/freeze-service.ts`、`src/service/version-change/abstract/version-change-service.ts`、`src/provider/version-change/impl/guard-freeze-registry.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`src/pipeline/orchestration/version-change-runtime.ts`、`src/common/编排/task-state.ts`、`test/编排/{direct-role-capabilities,version-change-service,task-state,trunk-events}.test.ts` |
| W-J3（门禁引擎） | 3 | `src/common/门禁引擎/classify-shell.ts`、`test/门禁引擎/direct-role-capabilities.test.ts`、`test/门禁引擎/git-shell-acl.test.ts` |
| W-J4（桌面窗口） | 2 | `test/桌面应用/decision-service.test.ts`、`test/桌面应用/run-change-trigger.test.ts` |
| W-J5（测试） | 3 | `test/测试/git-write-chain-fixture.ts`、`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（新）、`test/测试/2026-11-09_judge-delegated-doc-freeze.test.ts`（新） |
| W-J2b（nominator-code） | 2 | `src/common/roles/nominator/index.ts`、`test/roles/nominator/nominator-module.test.ts` |

合计 **4+11+3+2+3+2 = 25**，与任务预期一致（以磁盘为准）。逐文件 provenance 与证据文档哈希见 `candidate/write-set-provenance.tsv`；改动规模 numstat 见 `candidate/write-set-numstat.txt`（23 个 M 文件合计 +1318/−82；2 个新文件 299/99 行）。

### 2.2 逐文件 raw SHA-256 与 canonical 聚合

- 逐文件 raw SHA-256：`candidate/write-set-actual.tsv`（25 行，`sha256  path`，按路径排序）。
- 期望集合：`candidate/write-set-expected.tsv`（由六批证据中的 after 哈希逐文件汇总）；与 actual 的 `diff -u` **为空**（`candidate/write-set-diff.txt`，0 行）。
- **canonical 聚合**（定义：对上述排序后的 25 行 `sha256  path` 文本取 SHA-256）：
  - actual = expected = **`9eb21d3b60dd7c384420e5f122939d835a3d9b4669f6a169622752f746ed6919`**
  - 证据：`candidate/write-set-canonical-aggregate.txt`、`candidate/write-set-expected-aggregate.txt`。

结论：组合候选**不是近似拼接**，而是六批 after 状态的逐字节并集——批次文档中的每个 after 哈希均可在当前工作树复算命中（两份独立的 W-J1/W-J2/W-J3/W-J4/W-J5-amendment/W-J2b 哈希表全部一致）。

### 2.3 `src app test` manifest（口径与计数）

- 定义（`run/make-candidate-manifest.sh` 可复算）：`git ls-files --cached --others --exclude-standard` 列出 `src app test` 下全部**非忽略**文件（tracked + untracked），逐文件 `sha256sum`，按路径排序后成 manifest；对 manifest 文本取 SHA-256 为聚合。
- 计数：**tracked at HEAD = 1105**；**untracked（新测试文件）= 2**；manifest 条目 **1107**；合计 **25,517,395 bytes**（`candidate/manifest-counts.txt`）。
  - 说明：任务文案的「1,109 + 新增」口径与本 worktree 实测（1,105 + 2）差 4，已按磁盘实测记录，不做凑数；差异来源可为口径/时点不同。另：`find src app test -type f` 计 1,111，其中 4 个为 gitignore 的 `app/renderer/dist/**`（`git status --ignored` 可见），按"非忽略文件"口径排除且前后一致。
- manifest 聚合：**`2468fc59c957af88874cdb7d87f449b81ad5fcff70f497dd784454ff6cdfe108`**（`candidate/manifest-canonical-aggregate.txt`；全表 `candidate/manifest-src-app-test.tsv`）。

### 2.4 写集外改动核对

- `git status --porcelain -- app` = **空**（`candidate/status-app.txt`）；`git diff --stat -- app/desktop` = **空**（`candidate/app-desktop-diffstat.txt`）⇒ `app/desktop` 产品 diff = 0。
- `git status --porcelain -- src app test` 仅上述 25 文件，无写集外条目（运行前后两次快照逐行相同：`candidate/status-src-app-test.txt` vs `status-src-app-test-final.txt`）。
- 全仓 `git status --porcelain` 在运行中（typecheck + runtime-core 后）与全部套件完成后**逐行相同**（`candidate/status-full-diff-midrun-vs-final.txt` 为空）⇒ 所有测试运行**未在仓库内产生任何副作用文件**。
- 并发如实记录：D1 期间（2026-11-09 16:11:55）出现一个**非 D1 产生的**未跟踪文件 `docs/planning/2026-11-09_design_team-plan-run-binding.md`（`??`，不在 `src app test`，不在本 D1 写集；推测为同 worktree 并发会话产物）。不影响候选/manifest（均限 `src app test`）与任何套件结果。

### 2.5 候选稳定性（前后稳定）

| 时点 | write-set TSV | manifest |
| --- | --- | --- |
| 运行前（16:11） | `candidate/write-set-actual.tsv` | `candidate/manifest-src-app-test.tsv`（1107 行） |
| 运行中（runtime-core + typecheck 后，16:14） | `candidate/recheck1/`，diff 为空 | 行数/字节数一致 |
| 编排套件后（16:20） | `candidate/recheck2/`，diff 为空 | 一致 |
| 全部套件后（16:38） | `candidate/recheck-final/`，diff 为空 | **逐字节相同** |

⇒ 测试运行未触碰任何候选文件；候选在取证全程冻结。

## 3. 运行口径

- Node **v24.22.1**；全部命令在 worktree 根执行；`--test-concurrency=1`。
- **逐文件**运行器（`run/run-files.sh`，与各批单一进程命令等价）：每文件 `node --test --test-concurrency=1 --test-reporter=tap <file>`，外部 `timeout -k 5 300`（外部 watchdog 仅约束已登记挂起族，**不 force-exit 测试本体**；本 D1 未对任何文件使用 90s 例外——该例外登记文件 `customer-authorization-plane-integration` 不在本次套件范围）。
- `test/测试` W-J5 相关 7 文件使用 W-J5 amendment 既有运行器 `amendment/run-related.sh`（同 300s watchdog 口径，`ANS_WJ5_EVIDENCE_DIR` 指向本证据目录），保证与 amendment 参照可比。
- 失败/skip 标题提取与集合 diff：`run/extract-titles.sh`、`run/compare-sets.sh`（去 `✖ ` 前缀、去尾随时长、去重排序；不删改任何断言）。
- `npm run typecheck`（`tsc --noEmit`）：`typecheck/typecheck-post.txt`（exit 0）。`tsconfig.json` include `["src","test","app"]`、exclude `["app/renderer"]` ⇒ renderer 不在 typecheck 范围属既有 N/A（`typecheck/tsconfig-excerpt.txt`）。

## 4. 受影响套件结果（组合候选）

### 4.1 汇总

| 套件 | 文件 | tests | pass | fail | cancelled | skipped | todo | hang | 非零退出文件 | 用时(s) | 各批参照 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `test/runtime-core/**` | 59 | **540** | **503** | **33** | 0 | **4** | 0 | 0 | 12 | 53 | W-J1 after 540/503/33/4 ✓ |
| `test/编排/**` | 107 | **1133** | **1109** | **22** | 0 | **2** | 0 | 0 | 13 | 212 | W-J2 after 1133/1109/22/2 ✓ |
| `test/门禁引擎/**` | 41 | **453** | **447** | **5** | 0 | **1** | 0 | 0 | 5 | 101 | W-J3 after 453/447/5/1 ✓ |
| `test/桌面应用/`（W-J4 四文件） | 4 | **61** | **35** | **26** | 0 | 0 | 0 | 0 | 3 | 9 | W-J4 after 61/35/26/0 ✓ |
| `test/测试/`（W-J5 相关 7 文件） | 7 | 9 | 8 | 1 | 0 | 0 | 0 | **1** | 1 | 591 | amendment after raw 8/7/1（归一 7/7/0）；本组合归一 **8/8/0**（见 §5.5） |
| 补充：`test/roles/nominator/**`（W-J2b owner 套件） | 2 | **27** | **27** | 0 | 0 | 0 | 0 | 0 | 0 | 1 | W-J2b after 27/27 ✓ |

- 原始逐文件表：`suites/<suite>/summary.tsv`；逐文件 TAP：`suites/<suite>/*.tap`；非零退出清单：`suites/<suite>/nonzero.tsv`。
- 桌面四文件另以 W-J4 的**单进程精确命令**复跑：61/35/26/0（`suites/desktop/desktop-four-combined.tap`、`…exit.txt`）⇒ 逐文件与单进程口径一致。
- `npm run typecheck`：exit 0（`typecheck/typecheck-post.txt`）。

### 4.2 runtime-core（对照 W-J1）

- 计数与 W-J1 after **完全相同**（540/503/33/4）。
- 33 条失败标题集合与 W-J1 `failure-set-diff.txt` 的 post 集合：**new=0 / missing=0**（`compare/runtime-core-new-fails.txt`、`…missing-fails.txt` 均空）。
- skip 4 条（标题见 `suites/runtime-core/titles.skips.txt`；计数与 W-J1 参照一致）。
- 既有红项示例（前后同名）：`doc-freeze reason 九类…`、D3 linked workspace、R12/R2/R8/Pi timing 等 33 条；无新增。

### 4.3 编排（对照 W-J2）

- 计数与 W-J2 after **完全相同**（1133/1109/22/2）。
- 22 条失败标题集合与 W-J2 `failing-post.txt`：**new=0 / missing=0**；与 `failing-pre.txt` 亦 **new=0 / missing=0**（`compare/orchestration*`）。
- 本批 4 个修改文件定向合计：`direct-role-capabilities` 43/42/1、`task-state` 20/20/0、`trunk-events` 5/5/0、`version-change-service` 16/16/0 ⇒ **84 tests / 83 pass / 1 fail**，与 W-J2 targeted 84/83/1 一致；唯一 fail 为既有 `Retained intent confirmation…`。
- skip 2 条（Delivered Hub/legacy code provenance；计数一致）。

### 4.4 门禁引擎（对照 W-J3）

- 计数与 W-J3 after **完全相同**（453/447/5/1）。
- 5 条失败标题集合与 W-J3 `failure-titles-post.txt` / `failure-titles-pre-norm.txt`：**new=0 / missing=0**（`compare/gates*`）。
- 本批 2 个修改文件定向：`direct-role-capabilities` 23/23/0、`git-shell-acl` 39/39/0 ⇒ **62/62/0**，与 W-J3 targeted 62/62/0 一致。
- skip 1 条（unreadable 权限；计数一致）。

### 4.5 桌面应用（对照 W-J4）

- 四文件计数与 W-J4 after **完全相同**：61/35/26/0（per-file = `decision-service` 22/22、`chain-enforcement` 9/3/6、`run-pin` 20/9/11、`run-change-trigger` 10/1/9）。
- 26 条失败标题集合与 W-J4 `failing-post.txt` / `failing-pre.txt`：**new=0 / missing=0**（`compare/desktop*`）；即与 pristine HEAD 记录的既有 26 红同集合。
- 两个修改文件定向：32 tests / 23 pass / 9 fail，与 W-J4 targeted 32/23/9 一致；新增 J12 三例实测通过：`ok 30`（outcome 回归钉）、`ok 31`（开关关闭回落）、`ok 41`（`request.resolved` 回归钉）。
- skip 0。

### 4.6 `test/测试/` W-J5 相关 7 文件

| 文件 | status | tests/pass/fail | skip | exit | 用时(s) |
| --- | --- | --- | --- | --- | --- |
| `2026-11-09_judge-delegated-effectiveness.test.ts` | hang(300s) | 2/1/1（本体 ok 62.1s；fail 为文件级合成条目） | 0 | 124 | 300 |
| `2026-11-09_judge-delegated-doc-freeze.test.ts` | natural | 2/2/0 | 0 | 0 | 1 |
| `git-run-stop-host-continuation-e2e.test.ts` | natural | 1/1/0 | 0 | 0 | 49 |
| `git-action-delivery-claude-e2e.test.ts` | natural | 1/1/0 | 0 | 0 | 101 |
| `git-action-activation-e2e.test.ts` | natural | 1/1/0 | 0 | 0 | 42 |
| `git-action-commit-pi-e2e.test.ts` | natural | 1/1/0 | 0 | 0 | 49 |
| `git-action-commit-claude-e2e.test.ts` | natural | 1/1/0 | 0 | 0 | 49 |

- 原始合计 7 文件 / 9 tests / 8 pass / 1 fail / 0 skip；**归一化（剔除文件级合成条目）：8 tests / 8 pass / 0 fail**（amendment 参照归一 7/7/0：本组合多出的一条为 commit-pi 的 1 个真实用例——本次自然跑通并通过，属改善，非回归）。
- 逐文件 TAP：`suites/test-role/*.tap`；runtime 快照：`suites/test-role/runtime/`（`ANS_WJ5_EVIDENCE_DIR` 导出）。
- 环境抖动与隔离复跑：见 §6。

## 5. 失败/skip 集合对照（组合前 ↔ 组合候选）

### 5.1 汇总表

| 套件 | 本候选 fail 数 | 对照集合（pre / post） | diff（new / missing） | 新增确定性失败 | 新 skip |
| --- | --- | --- | --- | --- | --- |
| runtime-core | 33 | W-J1 post（pre 与其 diff 为空） | 0 / 0 | 0 | 0（skip 4） |
| 编排 | 22 | W-J2 post 及 pre | 0 / 0（对两者均空） | 0 | 0（skip 2） |
| 门禁引擎 | 5 | W-J3 post-normalized（= pre-normalized） | 0 / 0 | 0 | 0（skip 1） |
| 桌面应用四文件 | 26 | W-J4 post（= pre = pristine HEAD） | 0 / 0 | 0 | 0 |
| `test/测试` W-J5 相关 | 1 raw（文件级） | W-J5 amendment post（1 文件级）；pre（3 条） | 对 post：new 1（文件级）/missing 1（文件级）；对 pre：new 1（文件级）/missing 3 | **0**（见 §5.5） | 0 |

### 5.2–5.4 说明

- runtime-core：33 条与 W-J1 前后同一集合；`doc-freeze reason 九类…（F29/F35/Q6）` 等与 judge 无关的既有红项保持原样（本 D1 未改任何断言）。
- 编排：22 条与 W-J2 前后同一集合（含 `Retained intent confirmation…`）；新增 6 用例全部通过（计数 +6 逐字对应）。
- 门禁：5 条（卡文本/listProject/D-10 等）与 W-J3 前后同一集合；新增 4 用例全部通过。
- 桌面：26 条（`document-planning-source-unavailable` 族）与 W-J4 前后及 pristine HEAD 同一集合；新增 J12 三例通过。

### 5.5 `test/测试` 的差异逐条归因（全部为文件级合成条目或旧断言改写）

对 amendment post：new = `test\\测试\\2026-11-09_judge-delegated-effectiveness.test.ts`（**文件级合成**：本体 `ok 1` 62.1s，进程未退出，300s watchdog 终止 ⇒ node 输出文件级 `not ok 1`；见 §6 隔离复跑自然 1/1）；missing = `git-action-commit-pi-e2e	…`（amendment 时该文件原生崩溃的文件级条目；本次该文件自然通过 1/1，属改善）。
对 amendment pre：missing 3 = （a）旧版 effectiveness 缺口断言（测试级失败，已被 amendment 改写为包装层成功正例，现已绿）；（b）commit-pi 文件级崩溃条目；（c）delivery-claude 文件级崩溃条目（本次自然 1/1 通过）。new 1 同上文件级合成条目。

⇒ **无任何新增测试级断言失败；无新 skip。**

## 6. 环境抖动与隔离复跑（BASE-3）

- 现象：`2026-11-09_judge-delegated-effectiveness.test.ts` 在 7 文件套件运行中**测试本体通过**（TAP `ok 1 … duration_ms 62107`）但进程 300s 内未退出；watchdog 终止后 node 汇总 `tests 2 / pass 1 / fail 1`，唯一 `not ok` 是文件级路径条目（非测试正文）。
- 同候选隔离复跑（同一文件、同一候选、同一命令、无其它套件并发，`ANS_WJ5_EVIDENCE_DIR` 同样设置）：**natural / 1 test / 1 pass / 0 fail / exit 0 / 62s**（`isolated/runs/effectiveness-rerun-1/summary.tsv`、`…tap`、`…/runtime/`）。按 B1 BASE-3「同候选隔离复跑通过方可排除」，该抖动不计新增确定性失败。
- 本 D1 全程**未观测到** Node 原生 `CleanupQueue::Add` 崩溃；未 force-exit 任何测试本体；未改测试求绿。W-J5 §4.3 的既有抖动族在本组合候选的其余 6 个文件上均自然退出。
- 如实保留：套件内那次 hang 的原始 TAP 与 summary 均保留在 `suites/test-role/`，不做删改。

## 7. 边界、未覆盖与如实披露

1. **未运行** `test/桌面应用/optional-acceptance.test.ts`（D1 任务清单未列；B1 BASE-3 仅要求其 diff=0 与基线计数对照——diff 已为 0，本 D1 未触碰；其 6/2/1/3/0 基线见 B1，不属本组合候选套件）。
2. **未运行** `test/测试/**` 全量（仅 W-J5 相关 7 文件，按任务）；未运行真实模型/Electron 真实运行项（AC-J10/J11/J12 属真实运行批次，不在 D1）。
3. 逐文件运行器与各批「单一进程 glob」命令等价性以**总计数与失败集合逐一相符**佐证（3900+ 用例级别一致）；桌面四文件另以单进程精确命令复核一致。
4. `test/测试` 的 9/8/1 raw 计数与任务文案「7/7」口径差异：7/7 为 amendment 归一化参照（7 个真实用例全过）；本组合真实用例为 8 个（commit-pi 不再崩溃）且 8/8 全过，严格不强于/不弱于该口径（见 §4.6/§5.5）。
5. 并发：同 worktree 可能存在其它会话（D1 期间出现 1 个非本任务未跟踪 planning 文档，见 §2.4）；`src app test` 候选与 manifest 全程逐字节稳定，全仓 `git status` 在运行中与全部套件完成后逐行相同，未污染结果。
6. 未提交/推送/合并/发布；未修改方案/B1/其它角色资料；未删除/弱化任何断言；未新增 skip/force-exit；未占用 9222。

## 8. 证据

目录：`角色卡/测试/docs/change/2026-11-09_D1_judge-delegated-effectiveness-evidence/`（逐文件 SHA-256 见 `evidence-manifest.txt`，可复算）。

| 路径 | 内容 |
| --- | --- |
| `candidate/baseline-env.txt` | 日期/HEAD/tree/分支/Node/npm |
| `candidate/status-src-app-test.txt`、`…-final.txt`、`status-app.txt`、`app-desktop-diffstat.txt`、`status-full-midrun.txt`、`status-full-final.txt`、`status-full-diff-midrun-vs-final.txt` | 写集/写集外/全仓 status 前后快照与 diff |
| `candidate/write-set-actual.tsv`、`write-set-expected.tsv`、`write-set-diff.txt`、`write-set-canonical-aggregate.txt`、`write-set-expected-aggregate.txt`、`write-set-provenance.tsv`、`write-set-numstat.txt` | 25 文件 raw SHA-256、期望并集与 diff、canonical 聚合、provenance、numstat |
| `candidate/manifest-src-app-test.tsv`、`manifest-canonical-aggregate.txt`、`manifest-counts.txt`、`recheck1/`、`recheck2/`、`recheck-final/` | 1,107 条 manifest、聚合、计数、三次稳定性复取 |
| `suites/{runtime-core,orchestration,gates,desktop,test-role,nominator-supplement}/summary.tsv`、`*.tap`、`titles.fails.txt`、`titles.skips.txt`、`nonzero.tsv` | 逐文件计数/TAP/失败与 skip 标题/非零退出 |
| `suites/desktop/desktop-four-combined.tap`、`…exit.txt` | W-J4 精确单进程命令复核 |
| `suites/test-role/runtime/*.json` | W-J5 运行期真实冻结/账本/授权/包装层回执快照（`ANS_WJ5_EVIDENCE_DIR`） |
| `isolated/runs/effectiveness-rerun-1/` | 抖动文件同候选隔离复跑（natural 1/1，62s） |
| `compare/` | 各套件对 pre/post 基线的失败集合归一化与 new/missing diff（`*new-fails.txt`、`*missing-fails.txt`、`*current.norm.txt`、`*baseline.norm.txt`） |
| `typecheck/typecheck-post.txt`、`typecheck/tsconfig-excerpt.txt` | `tsc --noEmit` exit 0；renderer 排除依据 |
| `run/*.sh`、`run/list-*.txt` | 全部运行器与文件清单（可复算） |

复算入口：
- `bash …/run/run-files.sh <outdir> <listfile>`（逐文件套件）；`bash …/run/run-desktop-combined.sh <outdir>`；`ANS_WJ5_EVIDENCE_DIR=<dir> bash 角色卡/测试/docs/change/2026-11-09_WJ5_judge-delegated-evidence/amendment/run-related.sh <outdir>`。
- `bash …/run/make-candidate-manifest.sh <outdir>`（哈希/manifest）；`bash …/run/extract-titles.sh <tapdir> <prefix>`；`bash …/run/compare-sets.sh <current> <baseline> <prefix>`。

## 9. 状态

- **D1 组合确定性验证取证完成**：组合候选 = 六批 after 逐字节并集（25/25）；五套件计数与失败/skip 集合与各批基线一致；**新增确定性测试级失败 = 0、新 skip = 0**；typecheck exit 0；1 次进程未退出抖动经同候选隔离复跑排除；未发现写集外改动；候选全程稳定。
- **不判验收**：本记录供独立验收按 B1 v1.1 判定；真实运行（AC-J10/J11/J12）与 B2 出口不在本 D1 范围。未提交/推送。
