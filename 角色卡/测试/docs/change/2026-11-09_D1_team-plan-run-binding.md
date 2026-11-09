# D1 组合确定性验证记录：团队计划登记 run 绑定 / baseDigest 合法来源（T2）

- 日期：2026-11-09；角色：ans-studio 固定 worker「测试」（roleId: 测试），独立验证上下文。
- 任务：对「团队计划登记 run 绑定 / baseDigest 合法来源（T2）」的**四批组合候选（15 文件）**执行 **D1 组合确定性验证**：候选冻结（BASE-4/5）、受影响套件 before/after（BASE-3）、失败/skip 集合 diff、隔离复跑、P-1–P-15 映射、静态门（typecheck）。
- 本记录**只取证、不判验收**；未修改任何产品/测试/角色卡/文档（只写 `角色卡/测试/docs/change/2026-11-09_D1_team-plan-run-binding-evidence/`）；未运行真实模型/Electron/CDP；未占用 9222/9223；未提交/推送/合并/发布。
- 工作目录 worktree：`.claude/worktrees/trunk-amendment`；分支 `feat/plan-escalation-card`；基线 HEAD **`24799cb61239272e8603018adc094881bb6263dd`**（tree `409a4ac7bb077c0fc5b19f3c99383cf0b09dd13e`）；Node **v24.22.1**，npm 11.19.1。
- 状态：**D1 取证完成。候选 15 文件与四批记录逐文件 SHA-256 全等（15/15）；聚合 `a80e93da…`；`src app test` manifest 运行前/后逐字节相同；写集外 tracked diff=0（`api-spec` 已回退 blob `b3b651b7…`）；受影响套件新增确定性失败＝0（chief-workflow 的集合差异全部落在既有 ENOTEMPTY 清理竞争族，隔离复跑/同候选复跑已归因）、新 skip＝0；`npm run typecheck` exit 0。未验收。**

## 0. 结论摘要（供 B2 使用，不代替验收判定）

| 项 | 结果 |
| --- | --- |
| 组合候选 | `git status --porcelain -- src app test` 恰 **15 项全 M**（3+6+4+2；无新增/删除/重命名/untracked）；逐文件 raw SHA-256 与 W1/W2/W3/W4 记录 after 值 **15/15 全等** |
| 聚合 | **`a80e93dad2bc598a6bda3adae239bf79d46213538f391c6beba8cf25439eda59`**（定义：路径排序后 `path + "\0" + sha256` 串联的 SHA-256；方法已用 W1/W3/W4 记录聚合值复算验证） |
| manifest | `src app test` **1107** 文件；文件 SHA-256 `f62a81a6485c2bb1047c1dbf2c6d260c90c94c4073cb5b3bd7e469f2013a7d15`；聚合 `b06433b5ad162907a7ec5395f9cb31c89e6c48244ca0e5eb21115de13c7fdbf0`；**运行前/后逐字节相同** |
| 写集外 | tracked diff=0（`角色卡/**` 0、`api-spec` blob=HEAD、classify-shell/run-manifest/customer-input/renderer/optional-acceptance 等 12 路径 exclusion=0）；`src app test` untracked=0；无新依赖/构建配置改动 |
| 受影响文件（6 套件） | direct-role **43/42/1→47/46/1**；git-capabilities **15/12/1/2→16/13/1/2**；convener-consumption **8/8→9/9**；submit **22/20/2→25/23/2**；convener-pair **32/32→32/32**；chief-workflow **63/50/13→66/51/15** |
| 目录级（4 套件） | 编排 **1133/1109/22/2→1139/1115/22/2**；runtime-core **540/503/33/4→543/506/33/4**；roles/convener **32/32→32/32**；门禁引擎 **453/447/5/1→453/447/5/1** |
| 失败/skip 集合 diff | 编排、runtime-core、roles/convener、门禁引擎：**失败与 skip 集合完全相同（diff 空）**；文件级 6 套件中 5 个 diff 空；chief-workflow 差异仅 ENOTEMPTY 清理竞争族（§2.4），隔离/同候选复跑归因，见 §2.5 |
| 新增确定性失败 | **0**；新增用例（12 个）全部通过；已知红同名不恶化 |
| 新 skip | **0**（skip 计数前后一致：编排 2、runtime-core 4、门禁 1、其它 0） |
| typecheck | `npm run typecheck` **exit 0**；日志 `22d52cc9…`（与 W2/W3/W4 after 同 hash） |
| P-1–P-15 | 全部有确定性证据锚点（§3）；P-9 既有红关系如实记录 |

## 1. 候选冻结（BASE-4/5）

### 1.1 候选清单（15 文件，`candidate-status.txt`）

`git -c core.quotepath=false status --porcelain -- src app test` 恰 15 行、全为 ` M`：

| 批次 | 文件 |
| --- | --- |
| 运行时核心（3） | `src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/submit-capability-tools.test.ts` |
| 编排（6） | `src/service/trunk/impl/apply-journal.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`test/编排/direct-role-capabilities.test.ts`、`test/编排/git-capabilities.test.ts`、`test/编排/convener-module-consumption.test.ts`、`test/编排/fixtures/git-action-authorization-wiring.ts` |
| convener-code（4） | `src/common/roles/convener/index.ts`、`test/roles/convener/convener-module.test.ts`、`test/roles/convener/oracle-fixture.ts`、`test/roles/convener/convener-differential.test.ts` |
| 桌面窗口（2） | `app/desktop/session.ts`、`test/桌面应用/chief-workflow.test.ts` |

无新增（`??`=0）/删除/重命名；无目录外条目。

### 1.2 逐文件 raw SHA-256 与批次记录比对（`candidate-sha256.txt` / `candidate-vs-batch-records.txt`）

15/15 与四批记录 after 哈希**逐字节相等**（match=YES×15）：

| 文件 | raw SHA-256（实测＝记录） | 批次 |
| --- | --- | --- |
| `src/model/runtime.ts` | `307694ceac763033f42a5686a511b9e05cece31f0f49f27a206298ab4a98a61e` | W1 |
| `src/provider/runtime/schema.ts` | `b0b01f010b7e971cf6cbb55b2f1832a699c950474380a797f6d8b2738308a01d` | W2 |
| `test/runtime-core/submit-capability-tools.test.ts` | `c6f7a24abfc8f3a8c83079752d769651086bdc936c288de9210d445ea53174c3` | T4 |
| `src/service/trunk/impl/apply-journal.ts` | `b213a7dd2a6ecbb010be822c7f399a0c463a9c617580c0106e20ec6ae49d7898` | W3 |
| `src/pipeline/orchestration/trunk-runtime.ts` | `5b718ffdd970ab24dcba6eae2fef7f813c6155dc89e8be977d8b3efecb5bc1af` | W4 |
| `test/编排/direct-role-capabilities.test.ts` | `9e2cd3c08ac40feb9fad89ba2bacd237a01ee06314c2e2efad07876e8984e6a3` | T1 |
| `test/编排/git-capabilities.test.ts` | `a2de9417977507b9bd1620eac27bd810c3ae9f796bc1a8adcd9b6d84c8d4bba7` | T2 |
| `test/编排/convener-module-consumption.test.ts` | `4c7dfc6a317181935a4729f948fcc625b8db86e5788daa62bfbc211a8dc815c9` | T6 |
| `test/编排/fixtures/git-action-authorization-wiring.ts` | `30d5a0a640bedca2f34cedf79134be771ceb6b820d10b0f55052504bdade6a17` | T7 |
| `src/common/roles/convener/index.ts` | `5b1e927d653295757687e29fa72f28168eea8f8abb4618f0cf31d7b9991b4224` | W5 |
| `test/roles/convener/convener-module.test.ts` | `ead7981240f3c955a8e633d5635b36e75e2eaf97340a4cf4c02b821cb58a9640` | T3 |
| `test/roles/convener/oracle-fixture.ts` | `b7c7f2e8e543c9054e8864be22ede705d4c2d8e4b33e08594a94bcfeeb589528` | T8 |
| `test/roles/convener/convener-differential.test.ts` | `f46f7bd308620a8a934b04263c231ca6c53788326b7c2f649a13defbc4f24172` | T9 |
| `app/desktop/session.ts` | `9c690cf363d1bc8d15c531cab19238f06d26078bcee0e5c934c170acaf7ec862` | W6 |
| `test/桌面应用/chief-workflow.test.ts` | `87983bde4a21387d6b2e1b7a26c430efba73a3ccc92fe01d30cb3182c03ac494` | T5 |

### 1.3 聚合与 manifest

- 聚合方法验证：以同一方法对 W1 3 文件、W3(convener) 4 文件、W4(desktop) 2 文件复算，分别命中记录值 `0be305fb…`、`2f56e4cc…`、`1db49e20…` ⇒ 方法一致。
- 组合候选聚合：**`a80e93dad2bc598a6bda3adae239bf79d46213538f391c6beba8cf25439eda59`**（`candidate-aggregate.txt`；原始串联流与被排序路径表在证据目录）。
- manifest（`manifest-src-app-test.txt`，1107 行 `sha256<TAB>path`，按路径字节序排序）：文件 SHA-256 **`f62a81a6…`**、聚合 **`b06433b5…`**；`src app test` tracked=1107、untracked=0。前/后两次复取**逐字节相同**（§1.6）。
- numstat（`candidate-numstat.txt`）与四批记录逐文件一致（`+34/−1`、`+7/−3`、`+8/−2`、`+9/−8`、`+2/−2`、`+29/−13`、`+5/−4`、`+28/−2`、`+9/−7`、`+61/−0`、`+142/−1`、`+64/−1`、`+229/−1`、`+1/−1`、`+82/−0`）。
- 候选完整 diff：`candidate.diff`（1,127 行 / 98,108 bytes / `e4b5b157c2fa84ce067bfedd218c60e3e70deb663e8a8daef72d35a33d98a367`）。

### 1.4 写集外 diff = 0（`writeset-outside-audit.txt`）

- `角色卡/**` tracked 变更 = **0**；`角色卡/convener-code/api-spec.md` 工作树 blob `b3b651b7c7b13deaf25024fa86d59085ee483a5a` ＝ `HEAD:` blob；blob 内容 SHA-256 `20e6336dcbd47acda251dbc4fb7cf5a7a95ebc40c3c6beac4837f7a60933aea4`（基线），`git diff` = 0 bytes ⇒ B1 v1.2 附录 B 回退确认。
- exclusion 12 路径（`src/common/门禁引擎/classify-shell.ts`、`src/common/编排/run-manifest.ts`、`app/desktop/customer-input.ts`、`app/renderer`、`test/桌面应用/optional-acceptance.test.ts`、`src/common/编排/workflow-preconditions.ts`、`src/provider/runtime/tools.ts`、`src/pipeline/orchestration/run-role.ts`、`test/桌面应用/session.test.ts`、`src/service/trunk/impl/amendment-validate.ts`、`src/common/编排/evidence-check.ts`、`src/common/门禁引擎`）status 行数 = **0**。
- `src app test` untracked（含 `-uall`）= **0**；无新依赖/构建/发布配置改动（`package.json`/`package-lock.json`/`electron-builder.yml` 等不在修改列表）。
- 全仓 tracked 修改仅：15 候选文件 + `docs/acceptance/2026-11-09_team-plan-run-binding-criteria-v1.md`（B1 v1.2 修订，D1 开始前已存在，`0f528a0b…`） + `docs/communication/memo.md`（**并发外部写入**：调度方 2026-11-09T11:23Z 记录 PR #79 合并，非本 D1/非候选，如实披露）。

### 1.5 区域核对（BASE-4 共享文件约束）

`candidate.diff` 的 hunk 头逐一核对：

- `src/model/runtime.ts`：**仅 1 个 hunk** `@@ -2465,12 +2465,18 @@`，只覆盖 `CompleteTeamPlanInput` 接口及上方注释（`baseDigest?`、`plan.sha256?`），judge/文档格式区域未混入。
- `src/service/trunk/impl/apply-journal.ts`：5 个 hunk（`:1241`、`:2855`、`:2880`、`:2891`、`:2915`），全部位于 `createDirectCommitPort` 的 `baseDigest ?? null` 与 `completeTeamPlanInternal`（形状检查/派生/断言/`source.runId`）区域内。
- `src/pipeline/orchestration/trunk-runtime.ts`：6 个 hunk（`:473`、`:496`、`:623`、`:632`、`:821`、`:833`），全部为 Git 身份/失败回显 `baseDigest ?? null`、`convenerTeamPlanFacts` 投影与注释、abort/preflight 回显区域。
- `src/provider/runtime/schema.ts`：1 个 hunk（`complete_team_plan` 条目）。
- `src/common/roles/convener/index.ts`：3 个 hunk（`checkTeamPlan` 内可选字段）。
- 其余测试文件 hunk 与批次记录 §1 描述逐一对应；无写集外 hunk。

### 1.6 稳定性（BASE-5）

| 时点 | 候选 status | 聚合 | manifest 文件 hash / 聚合 | HEAD/tree/分支/暂存 |
| --- | --- | --- | --- | --- |
| 运行前（`snapshot-initial.txt`，11:26:33Z） | 15 M | `a80e93da…` | `f62a81a6…` / `b06433b5…` | `24799cb` / `409a4ac7…` / `feat/plan-escalation-card` / staged 0 |
| 全部证据运行后（`snapshot-post.txt`，12:50:42Z） | 15 M（同集合） | `a80e93da…`（复算相同） | `f62a81a6…` / `b06433b5…`（逐字节相同） | 同上，staged 0 |

⇒ 运行前/后两次完整复取**逐字节相同**；运行中抽查 `git status --porcelain -- src app test` 均为 15 项（与运行前一致）；测试运行未在 `src app test` 产生副作用文件。

## 2. 受影响套件 before/after（BASE-3）

### 2.1 环境、命令与基线副本口径（如实）

- 命令：`node --test --test-concurrency=1 --test-reporter=tap <文件…>`；Node **v24.22.1**；worktree 根执行；各套件串行运行（不并发多个套件）。
- **before 基线**：`git -c core.autocrlf=false archive` 取基线 `24799cb` 纯净副本（仓库外临时目录）+ `node_modules` junction（只读复用）；复制 worktree `.env`；以 worktree 形态的 `.git` 文件（内容指向不存在 gitdir 的仿真文件，用于复现 worktree「`.git` 为文件」对 `readGitHostProtectionRequirement` 的影响）建立。
  - **逐文件行尾对齐**：worktree 实测 src/app/test 为混合行尾（899 CRLF / 192 LF / 1 mixed / 15 binary）；副本按 worktree 逐文件 EOL 复刻（CRLF 文件从 CRLF 物化副本批量覆盖，mixed 测试文件取 worktree 字节），对齐后 1,107 文件 **0 偏差**。`角色卡`/`docs` 的 24 个历史 mixed 文档保留 LF（非测试读取路径，记录在此）。
  - 首次 CRLF 全量副本的 before 尝试因行尾差异产生伪差异（`wiring guards` 源码切片 `\n` 锚点失败、git 测试文件级崩溃），**整批作废**，原件移入 `superseded-crlf-before/`（审计用，不属本记录证据）。
- **after**：当前 worktree 候选本体（同一 HEAD/聚合/manifest，见 §1.6）。
- 已知红参照（只作参照）：W1 before submit 22/20/2、W2 before direct-role 43/42/1、git 15/12/1/2、consumption 8/8、W3 before convener 32/32、W4 before chief 63/47/16；D1-judge 编排 1133/1109/22/2、runtime-core 540/503/33/4、门禁 453/447/5/1。本 D1 的 before 为**独立重取**，与参照在计数上一致（chief-workflow 见 §2.4）。

### 2.2 受影响文件 before/after（tests/pass/fail/cancelled/skip；TAP 原件与 hash 见 §6）

| 套件 | before | after | 失败集合 diff | skip diff |
| --- | --- | --- | --- | --- |
| `test/编排/direct-role-capabilities.test.ts` | 43/42/1/0/0（exit 1） | 47/46/1/0/0（exit 1） | 无（同名 `Retained intent confirmation…`） | 无（0/0） |
| `test/编排/git-capabilities.test.ts` | 15/12/1/0/2（exit 1） | 16/13/1/0/2（exit 1） | 无（同名 `Git team plan publication…`） | 无（同名 2 skip） |
| `test/编排/convener-module-consumption.test.ts` | 8/8/0/0/0（exit 0） | 9/9/0/0/0（exit 0） | 无 | 无 |
| `test/runtime-core/submit-capability-tools.test.ts` | 22/20/2/0/0（exit 1） | 25/23/2/0/0（exit 1） | 无（同名 2 条 `runtime-protection-scope-unknown`） | 无 |
| `test/roles/convener/convener-module.test.ts` + `convener-differential.test.ts` | 32/32/0/0/0（exit 0） | 32/32/0/0/0（exit 0） | 无 | 无 |
| `test/桌面应用/chief-workflow.test.ts` | 63/50/13/0/0（exit 1；65s，300s 有界内自然退出） | 66/51/15/0/0（exit 1；79s 自然退出） | before-only 1 / after-only 3（§2.4–2.5） | 无（0/0） |

- 新增用例全部通过（after TAP 锚点）：direct-role `ok 44–47`（P-1/P-6/P-8、P-2/P-3/P-15、P-4、P-5/P-7）；git `ok 16`（P-9）；consumption `ok 9`（P-13）；submit `ok 16–18`（P-11）；chief `ok 54–56`（P-12）。合计新增 12 个用例、12 pass。
- 已知红同名/同数保持：direct-role 1 条、git 1 条（+2 skip）、submit 2 条；未删除/弱化任何 fail-closed 断言，候选 diff 中无 `skip(`/`todo(`/`--test-force-exit` 新增（`skip-hits=0`）。

### 2.3 目录级 before/after

| 套件 | before | after | 失败集合 diff | skip |
| --- | --- | --- | --- | --- |
| `test/编排/**`（107 文件） | 1133/1109/22/0/2（exit 1） | 1139/1115/22/0/2（exit 1） | **完全相同（空 diff）** | 相同（2） |
| `test/runtime-core/**`（59 文件） | 540/503/33/0/4（exit 1） | 543/506/33/0/4（exit 1） | **完全相同（空 diff）** | 相同（4） |
| `test/roles/convener/**`（2 文件） | 32/32/0/0/0（exit 0） | 32/32/0/0/0（exit 0） | 空 | 0 |
| `test/门禁引擎/**`（41 文件） | 453/447/5/0/1（exit 1） | 453/447/5/0/1（exit 1） | **完全相同（空 diff）** | 相同（1） |

- 目录级新增用例：编排 +6 测试/+6 pass（T1+4、T2+1、T6+1）、runtime-core +3/+3（T4）、convener 0、门禁 0；**新增确定性失败 = 0，新 skip = 0**。
- 编排 before 与 D1-judge 参照（1133/1109/22/2）、runtime-core（540/503/33/4）、门禁（453/447/5/1）逐一相同；详细失败/skip 标题集合见 `before-directory-titles.txt`、`diff-dir-*.txt`。
- `test/门禁引擎/**` 本变更不改其产品文件，按任务要求运行并记录：前后计数与集合完全一致。

### 2.4 chief-workflow 集合差异与归因（环境抖动，非确定性新增）

全量集合 diff（`diff-chief-workflow.txt`）：

- 本记录 TAP 的集合 diff：before-only = `selected`（W5 子测试）；after-only = `W10 fresh scope…`（含子测试 `unmanaged`）、`W47 默认Core/Codex本地HTTP：忙Chief独立revise`。其余 12 条失败标题两侧同名同数（W5、commit-race、W14、W19、W22、W23、W28 stop、W28 stop-and-restart、W30、W33、W34、W47 select）。W4 记录的 before/after 曾出现 W20/required/selected 等同类翻转，属同族（只作参照）。
- 归因证据：
  1. **W47 revise**：同候选（worktree）隔离复跑 `--test-name-pattern "W47 …revise"` = **1/1 pass, exit 0**（`after-isolated-w47revise.tap.log`）⇒ 已排除，非确定性失败。
  2. **W10（含 `unmanaged`）**：全量运行时在 before/after 间双向翻转（本记录 before 通过、after 失败；W4 记录的 after 全量运行 66/54/12 **不含 W10**——同候选文件哈希 `87983bde…` 同一）。隔离复跑（`^W10 `）在**基线副本**与**候选**均 3/5（失败点同为 `unmanaged` 清理断言，`W10 primary/owned cleanup failures retained` / `ENOTEMPTY`）⇒ 与候选无关的测试顺序/清理竞争。3 次候选隔离重试均同态（3/5）。
  3. **`selected`/W5/commit-race**：两侧全量均失败（同名 W5 父级 `2 subtests failed`），失败原文 `W5 primary/owned cleanup failures retained` / `ENOTEMPTY`；before/after 同名不恶化。
  4. 全部差异失败原文均为 Windows 临时目录清理竞争族（`ENOTEMPTY: directory not empty, rmdir …ans\\sessions\\…\\codex\\ans`），与 W4 记录 §3.2 / B1 v1.1 A.2 已登记的 W5/W20/W30/W47 翻转现象同族。
- 判定口径：**新增确定性失败 = 0**（无新增测试级断言失败；after-only 项均经同候选/同环境对照归因为环境抖动）；**新 skip = 0**；已知红同名不恶化。

### 2.5 隔离复跑记录（同一候选/同一环境）

| 侧 | 用例 | 命令模式 | 结果 | 判定 |
| --- | --- | --- | --- | --- |
| after（候选） | W47 revise | `--test-name-pattern "W47 …revise"` | 1/1 pass，exit 0 | after-only 排除 |
| after（候选） | W10（含 unmanaged） | `--test-name-pattern "^W10 "` ×3 | 3/5 ×3（unmanaged 清理竞争） | 环境/顺序竞争；同候选全量曾通过（W4 记录） |
| after（候选） | W5（含 selected/commit-race） | `--test-name-pattern "^W5 专字段"` | 5/7（selected 清理竞争） | 两侧同名 |
| before（基线副本） | W10 / W47 revise / W5 | 同上 | 3/5 / 0/1（ENOTEMPTY）/ 5/7 | W10/W5 与候选侧同态；W47 revise 在 before 隔离失败、after 隔离通过（双向翻转 ⇒ 抖动非确定性），非候选引入 |
| before（基线副本） | git-trunk-store.test.ts（曾挂起） | 单文件，有/无 `.git` 仿真文件各一次 | **13/13 pass ×2**（`before-isolated-git-trunk-store-{nogit,withgit}.tap.log`） | 挂起为一次性环境抖动（§5-2）；fake `.git` 假说被否定 |
| before（基线副本） | wiring guards（行尾修复冒烟） | 单文件 | 2/2 pass（`before-smoke-wiring-lf.tap.log`） | 行尾对齐修复确认 |

### 2.6 `test/桌面应用/optional-acceptance.test.ts`（只读对照；写集外，diff=0）

- 文件 diff=0；B1 §4.2 参照 6/2/1/3/0 仅作只读对照。
- 本环境运行：before（副本）与 after（worktree）均在第 4 个测试前停滞（10 分钟无进展，看门狗终止，未 force-exit），已完成 3 条结果**两侧完全一致**：`not ok 1 - 幕僚调度验收…`、`ok 2 - 无自动验收机器…`、`ok 3 - 开关关闭…`（各 2 pass / 1 fail）。原件：`before-optional-acceptance.tap.log`、`after-optional-acceptance.tap.log`、`optional-acceptance-partial.txt`。停滞与本变更无关（两侧对称、文件未改），如实披露。

## 3. P-1–P-15 映射（证据锚点均取自 after 候选 TAP）

| P | 证据（文件:TAP 行 / 用例） | 关键观察 | 状态 |
| --- | --- | --- | --- |
| P-1 | `after-direct-role-capabilities.tap: ok 44`（T1 `:1617`） | 缺省 payload ⇒ applied；回执/baseDigest=effective digest、planRef.sha256=实际字节、trunk+1、marker plan 派生值 | ok |
| P-2 | `after-direct-role-capabilities.tap: ok 45`（T1 `:1669`） | 声明 baseDigest 不等 → `plan-base-conflict`；大写 hex 值正确亦拒；失败回执回显 derivedBase；无 journal/target 变更 | ok |
| P-3 | 同上 `ok 45` | 声明 sha 不等/大写 hex → `plan-hash-drift`；无副作用 | ok |
| P-4 | `after-direct-role-capabilities.tap: ok 46`（T1 `:1705`） | 来源选择 (i) frozen 命中、(ii) live 命中、(iii-a) live 优先、(iii-b) frozen 兜底、(iii-c) 均不可读 → `plan-hash-drift` 新文案、无 journal | ok |
| P-5 | `after-direct-role-capabilities.tap: ok 47`（T1 `:1767`） | 无 manifest.json → `trunk-unavailable`、baseDigest=null、不 bootstrap、无 marker 目录 | ok |
| P-6 | 同 `ok 44` | 旧式完整 payload 回执 deepEqual 派生路径；`team-plan:<digest>` 锚点（`canonicalJson({input,actor})`）；marker/target 字节相等 | ok |
| P-7 | 同 `ok 47` | run 属 flow ⇒ applied + `source.runId`/journal actionSource.runId 记录、marker 不写 runId；外 flow/不存在 ⇒ `plan-run-conflict`、无 journal、trunk 不变 | ok |
| P-8① | 同 `ok 44` | 首成功后删除计划文件、同 operationId 同原样 payload 重放 ⇒ 命中先序回执 | ok |
| P-8② | `after-git-capabilities.tap: ok 16`（T2 `:843`） | Git prepare→commit 后原样 payload 重放 ⇒ 同一回执 | ok |
| P-8③ | `ok 44` | 同 operationId 形态变化（补声明值）⇒ `plan-operation-conflict` | ok |
| P-8④ | `after-direct-role-capabilities.tap: ok 7/8`（既有 `:390` 两参数化用例，含 `:427-428` 删除后重放） | 逐字保留、原样通过 | ok |
| P-9 | `after-git-capabilities.tap: ok 16`（T2 `:843`） | 省略值 prepare/commit 派生；`PreparedTeamPlanCommit.input` 保持原样；`team-plan:` 锚点基于原样 input；漂移 commit 非 applied 且 trunk 不变 | ok |
| P-9 既有红 | `after-git-capabilities.tap: not ok 15`（`Git team plan publication…`，基线已知红） | 红因如实：`prepareDirectAuthority` 返回 `{"ok":false,"code":"trunk-item-invalid","message":"The actual publication task has no original Chief input source"}`；**未改写/未跳过**，新增 P-9 用例以真实 chief init source 隔离；红项不作为 pass 证据 | 已知红（不恶化） |
| P-10 | `after-convener-pair.tap: ok 22`（T3 `:391`）+ `ok 1–10`（differential） | 缺 baseDigest/plan.sha256 ⇒ allow；63 位/非 hex/未知键/缺 version/缺 path ⇒ `team-plan-facts-invalid`；RR5/roster 路径/版本不一致 ⇒ `team-plan-path-invalid`；差分 32/32（allowed 4/compared 11/knownDelta 1） | ok |
| P-11 | `after-submit-capability-tools.tap: ok 16/17/18` | schema required 缩减、64 hex 形状保留、无 oneOf/anyOf；省略形状合法且工具层原样提交；缺 path/version/未知键/非 hex/路径越界/version 0 拒绝且 0 调用；回执透传派生 planRef.sha256 | ok |
| P-12 | `after-chief-workflow.tap: ok 54/55/56` | 省略 runId ⇒ 注入受派任务 run、`source.runId`=任务 run；自报不一致 ⇒ `plan-run-conflict`；flow 不符 ⇒ `plan-flow-conflict`；无回合/入口中止 ⇒ `plan-task-unavailable`；核验期间中止 ⇒ `plan-task-changed` 且 trunk 不前进；inspect 失败直通 `trunk-item-invalid`；非 convener 不注入 | ok |
| P-13 | `after-convener-module-consumption.tap: ok 9`（T6 `:375`）+ `ok 1`（`:266` 扩展） | 多 draft + `run-ambiguous` 下经受派任务登记成功、绑定任务 run、planRef 派生；run 集合/状态不增不关不 pin；project_state/version-decision 只读对照逐字不变；facts 缺省不投影/不造键 | ok |
| P-14 | `diff-dir-编排.txt` / `diff-dir-runtime-core.txt` / `diff-dir-门禁引擎.txt` / `diff-dir-roles-convener.txt` 全空；锚点 `after-dir-编排.tap: ok 543`（run-manifest R1 all-or-nothing）、`ok 537`（manifest 形状）、`ok 539`（F5 fail-closed）、`ok 503`（project-state latest/pinned 零写入）、`after-dir-runtime-core.tap: ok 144`（evidence_check） | pinned/无 run/run-manifest/evidence_check 输出零行为变化（同名同结果、失败集合空 diff） | ok |
| P-15 | `after-direct-role-capabilities.tap: ok 45`（RR5 路径/roster 路径/版本不一致 ⇒ `plan-path-invalid`）+ `after-convener-pair.tap: ok 22`（preflight RR5 形态 ⇒ `team-plan-path-invalid`） | 非规范路径仍拒、未放宽；失败归文档格式责任 | ok |

## 4. 静态门

- `npm run typecheck`（`tsc --noEmit`）：**exit 0**；日志 `typecheck.log`（4 行 / 43 bytes / `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247`，与 W2/W3/W4 after 同 hash）；`typecheck.exit.txt`=`0`。
- `typecheck:renderer` / `build:renderer`：**N/A**。依据：本变更未改 `app/renderer/**`（diff=0）、未改构建配置；`tsconfig.json` include `["src","test","app"]` exclude `["app/renderer"]` 属既有范围，`npm run typecheck` 覆盖 `app/desktop/session.ts`（已通过）。
- 候选 diff 无 skip/todo/force-exit 新增（`skip-hits=0`）；未改任何既有断言（改写项与 §4.3 记录一致）。

## 5. 限制与披露（如实）

1. **基线副本口径**：before 用 `git archive` 纯净副本（非 worktree 本体）+ `node_modules` junction + `.env` + worktree 形态 `.git` 文件；并按 worktree 逐文件行尾复刻（src/app/test 1,107 文件 0 偏差）。首次 CRLF 全量副本尝试作废（原件在 `superseded-crlf-before/`），原因与修复记录见 §2.1。
2. **副本环境抖动（一次性，已隔离复核）**：chief-workflow 首次 before 运行测试体完成（63 条结果）但进程未退出（884s 后按看门狗口径终止，未 force-exit）；git-trunk-store.test.ts 一次目录运行崩溃（exit 134）与一次单文件挂起（Git migration 用例），其后同副本单文件复跑 **13/13 ×2 通过**。重跑后的 before TAP 为权威证据；被终止/作废原件在 `superseded-*` 保留审计。
3. **optional-acceptance**：两侧同点停滞（§2.6），仅取得对称 3 条结果（2 pass/1 fail）；B1 参照 6/2/1/3/0 未能整体复现，如实记录，不以部分结果冒充完整通过；该文件 diff=0、不在写集。
4. **并发外部写入**：D1 期间 `docs/communication/memo.md` 由调度方并发更新（11:23Z 记录 PR #79 合并，`+1` 行）；`docs/acceptance/…criteria-v1.md` 的 M 为 B1 v1.2 修订（D1 开始前已存在）。两者均不在 `src app test`，不影响候选/manifest/任何套件结果。
5. **证据层级**：本 D1 只覆盖确定性层（L1–L5）；不覆盖 RR6 真实运行（RR-1–RR-8 另阶段），不宣称 happy path 已经真实运行证明。
6. **模型/端口**：未运行真实模型/Electron/CDP；未占用 9222/9223；未触碰贪吃蛇 target。
7. **本记录只取证、不判验收**；未提交/推送/合并/发布；未修改任何产品/测试/角色卡/其它文档。

## 6. 证据目录（`2026-11-09_D1_team-plan-run-binding-evidence/`）

全量逐文件 SHA-256 索引：`evidence-sha256.txt`（145 行，索引自身 `fa61e7da6844257e99a91a04ae8fe8e43ef77cb8654e5a65f9c01cf916ffbe5d`）。关键原件：

| 类别 | 文件（节选） |
| --- | --- |
| 候选 | `candidate-status.txt`、`candidate-sha256.txt`、`candidate-before-sha256.txt`、`candidate-vs-batch-records.txt`、`candidate-numstat.txt`、`candidate.diff`、`candidate-aggregate.txt`、`manifest-src-app-test.txt`、`snapshot-initial.txt`、`snapshot-post.txt`、`writeset-outside-audit.txt`、`full-status.txt` |
| before TAP（权威） | `before-direct-role-capabilities.tap.log`（`900cd453…`）、`before-git-capabilities.tap.log`（`409fa132…`）、`before-convener-module-consumption.tap.log`（`1fc06ac0…`）、`before-submit-capability-tools.tap.log`（`220a51c8…`）、`before-convener-pair.tap.log`（`e7ffc4e1…`）、`before-chief-workflow.tap.log`（`ab69b878…`）、`before-dir-编排.tap.log`（`efc070f5…`）、`before-dir-runtime-core.tap.log`（`7ec24cc0…`）、`before-dir-roles-convener.tap.log`（`13b881ac…`）、`before-dir-门禁引擎.tap.log`（`5d15947b…`）、`before-runner.log`（`04c4e9d6…`） |
| after TAP | `after-direct-role-capabilities.tap.log`（`bfb10af5…`）、`after-git-capabilities.tap.log`（`60d79b25…`）、`after-convener-module-consumption.tap.log`（`3017ee04…`）、`after-submit-capability-tools.tap.log`（`47e38928…`）、`after-convener-pair.tap.log`（`35ab54e6…`）、`after-chief-workflow.tap.log`（`0f6f4a90…`）、`after-dir-编排.tap.log`（`bb0b1afd…`）、`after-dir-runtime-core.tap.log`（`6e7ee2da…`）、`after-dir-roles-convener.tap.log`（`91769877…`）、`after-dir-门禁引擎.tap.log`（`e0721005…`）、`after-runner.log`（`2639f507…`） |
| 集合分析 | `before-*.analysis.txt`、`after-*.analysis.txt`、`diff-*.txt`（11 套件）、`before-directory-titles.txt` |
| 隔离复跑 | `after-isolated-w47revise.tap.log`、`after-isolated-w10.tap.log`、`after-isolated-w5.tap.log`、`before-isolated-w10.tap.log`、`before-isolated-w47revise.tap.log`、`before-isolated-w5.tap.log`、`before-isolated-git-trunk-store-nogit.tap.log`、`before-isolated-git-trunk-store-withgit.tap.log`、`before-smoke-wiring-lf.tap.log` |
| optional 对照 | `before-optional-acceptance.tap.log`、`after-optional-acceptance.tap.log`、`optional-acceptance-partial.txt` |
| 静态门 | `typecheck.log`（`22d52cc9…`）、`typecheck.exit.txt` |
| 作废/审计 | `superseded-crlf-before/`（38 文件，首次 CRLF 副本 before 尝试，非权威）、`superseded-killed-before-dir-编排.tap.log`（挂起终止件） |
