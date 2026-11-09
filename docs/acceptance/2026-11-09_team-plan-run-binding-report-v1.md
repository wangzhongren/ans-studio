# B2 独立验收报告：团队计划登记 run 绑定 / baseDigest 合法来源（T2）

- 日期：2026-11-09；身份：**ANS 独立验收（Independent Acceptance）唯一主上下文**（与 B1 作者同一独立身份）。本报告只作 B2 判定；**未改代码/测试/角色卡/方案/其它文档；未提交/推送/合并/发布；未占用 9222；未运行真实模型/Electron**。
- 判定标准：**B1 v1.2（唯一判据）** `docs/acceptance/2026-11-09_team-plan-run-binding-criteria-v1.md`，**297 行 / 74,210 bytes / SHA-256 `0f528a0b9f80cb9c451985c2a3d37c25a51b7f1959910600ec54a93246303d1b`**（bytes/SHA 与派发记录/预绑定一致；预绑定 `lines:298` 为行数口径差异，见 §4-2）。
- 判定对象：**15 文件候选**（全 M，无新增/删除/重命名），HEAD **`24799cb61239272e8603018adc094881bb6263dd`**（tree `409a4ac7bb077c0fc5b19f3c99383cf0b09dd13e`，分支 `feat/plan-escalation-card`）；确定性证据 D1 记录 `1b69a1bca89843a303c061802721aa8cb86e18d0078f87eebad8fa9a15aae0a5`（216 行 / 29,663 bytes）+ 真实运行 RR6b 记录 `3d69277ed4b177d925c24775b20da77235abe42f9bb2d9b8da0acaaccfc8d0f4`（222 行 / 32,167 bytes）。
- 状态：**B2 独立验收完成；总判定 `pass`（51/51 适用项 pass；附更正/披露，见 §4；不改变任何判据或分支）。不授权提交/推送/合并/发布。**

## 0. 结论摘要

| 项 | 结果（B2 独立复核） |
| --- | --- |
| 总判定 | **pass**（BASE 8/8、AC 13/13、P 15/15、RR 8/8、EV 7/7 = **51 pass / 0 fail / 0 insufficient / 0 NA**） |
| 候选身份 | `git status --porcelain -- src app test` = **15 M**；逐文件 raw SHA-256 与 D1 表 **15/15 全等**；聚合 **`a80e93dad2bc598a6bda3adae239bf79d46213538f391c6beba8cf25439eda59`**（独立复算一致） |
| manifest | `src app test` **1,107** 文件；文件 SHA-256 **`f62a81a6485c2bb1047c1dbf2c6d260c90c94c4073cb5b3bd7e469f2013a7d15`**、聚合 **`b06433b5ad162907a7ec5395f9cb31c89e6c48244ca0e5eb21115de13c7fdbf0`**（独立生成与记录逐字节相同） |
| 写集外 | `角色卡/**` tracked diff=0；`api-spec` blob=`HEAD`（diff=0）；12 个 exclusion 路径 0；`src app test` untracked=0；staged=0；依赖/构建配置 0；`memo.md` 为并发外部写入（非候选，§4-8） |
| 独立复跑（6 文件） | direct-role **47/46/1/0/0**；git-cap **16/13/1/0/2**；consumption **9/9/0/0/0**；submit **25/23/2/0/0**；convener pair **32/32/0/0/0**；chief-workflow **66/53/13/0/0**（失败集合为 D1 after 的子集，无 new-only） |
| 独立复跑（4 目录） | 编排 **1139/1115/22/0/2**；runtime-core **543/506/33/0/4**；门禁 **453/447/5/0/1**；roles/convener **32/32/0/0/0**；**失败/skip 集合与 D1 after 逐条 diff 空** |
| 静态门 | `npm run typecheck` **exit 0**；日志 4 行 / 43 bytes / `22d52cc9fc6af45ff16ea0c9c37829064d4d00eac6d144007dc9166796b6a247`（与 D1 记录同 hash） |
| 新增用例 | 编排 +6/+6 pass（T1+4、T2+1、T6+1）、runtime-core +3/+3（T4）、chief +3/+3（T5）、convener 0、gates 0（合计新增 12 用例全过）；**新增确定性失败=0 / 新 skip=0**；P-1–P-15 锚点全部实测通过 |
| RR6b | **RR6-B 已观测**：入参仅 `{flowId,operationId,plan:{path,version}}`（无 baseDigest/sha256/runId）→ 回执 `trunk-unavailable`/`effective-manifest-missing`、`baseDigest:null`/`targetDigest:null`；规范路径；无 bootstrap；9222 零监听/9223 释放；贪吃蛇 app/run 根零写入；候选前后不变；模型 `deepseek-v4-flash` |
| RR6-A/C | 未真实触发；按 B1 RR-4/RR-6 以 P-1/P-9/P-13 与 P-2/P-3/P-7/P-12 确定性覆盖并如实标注；本报告不冒充真实运行证明 |
| B2 更正/披露 | 3 项记录性更正（RR6b gate-records 措辞、预绑定行数口径、派发记录版本漂移）+ 若干限制/披露（§4）；均不改变分支或判据 |

## 1. 依据与绑定身份（写盘前实测）

| 项 | 实测 |
| --- | --- |
| B1 v1.2 | `docs/acceptance/2026-11-09_team-plan-run-binding-criteria-v1.md`：**297 行 / 74,210 bytes / `0f528a0b9f80cb9c451985c2a3d37c25a51b7f1959910600ec54a93246303d1b`** |
| 团队计划 | `docs/scheduling/2026-11-09_team-plan_team-plan-run-binding.md`：100 行 / 14,393 bytes / `48148836ed80291446e16e021446512b734f4b7546f767b497a093c50324934d` |
| 派发记录（当前版本） | `docs/scheduling/2026-11-09_dispatch-log_team-plan-run-binding.md`：44 行 / 6,068 bytes / `6ed789f128e01f09db972d2960de84138850c46a7e2586ca397c81d3fd4c4e94` |
| 派发记录（RR6b 预绑定版本） | `pre/binding-inputs.json` 绑定：44 行 / 5,594 bytes / `70b868e505dba3e06b073c0c76e63417ec5edcfa665c7c94bd63c7f69d576a85`（当前版本为其后行政更新；§4-3） |
| D1 记录 | `角色卡/测试/docs/change/2026-11-09_D1_team-plan-run-binding.md`：216 行 / 29,663 bytes / `1b69a1bca89843a303c061802721aa8cb86e18d0078f87eebad8fa9a15aae0a5`；证据索引 `evidence-sha256.txt` 145 行 / `fa61e7da6844257e99a91a04ae8fe8e43ef77cb8654e5a65f9c01cf916ffbe5d` |
| RR6b 记录 | `角色卡/测试/docs/change/2026-11-09_RR6b_team-plan-run-binding.md`：222 行 / 32,167 bytes / `3d69277ed4b177d925c24775b20da77235abe42f9bb2d9b8da0acaaccfc8d0f4`；证据索引 `evidence-manifest.txt` 195 行 / `08d53a53bbcb0d27450a098ea37de61e0daea86928072357b1e54aa1c7a41d7b` |
| 首轮 RR6（非修正轮） | `角色卡/测试/docs/change/2026-11-09_RR6_team-plan-run-binding.md`：200 行 / 28,778 bytes / `7f672fb2813db0bde1180806e806e129fcddce2e4e1b8c0b26c16d6ec3115829`；派发记录 §三：停在更早的既有 `versioned-doc-overwrite` 门，RR6-A/B/C 均未观测；RR6b 为协调方授权的修正轮（非驱动重试） |
| 候选 | HEAD `24799cb`（tree `409a4ac7…`，分支 `feat/plan-escalation-card`）；15 文件全 M；聚合 `a80e93da…`；manifest 1,107 / `f62a81a6…` / `b06433b5…` |
| 模型（如实） | `.env` `ANS_CLAUDE_MODEL=deepseek-v4-flash`、`ANS_CLAUDE_REASONING_EFFORT=high`；原生 `message.model` 实测 `deepseek-v4-flash`；**非 Anthropic Claude** |

## 2. 独立复核（不得只信报告）——方法与结果

### 2.1 候选身份（BASE-4/5）

- `git -c core.quotepath=false status --porcelain -- src app test` 恰 **15 行 ` M`**：运行时核心 3（`src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/submit-capability-tools.test.ts`）、编排 6（`src/service/trunk/impl/apply-journal.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`test/编排/direct-role-capabilities.test.ts`、`test/编排/git-capabilities.test.ts`、`test/编排/convener-module-consumption.test.ts`、`test/编排/fixtures/git-action-authorization-wiring.ts`）、convener-code 4（`src/common/roles/convener/index.ts`、`test/roles/convener/convener-module.test.ts`、`test/roles/convener/oracle-fixture.ts`、`test/roles/convener/convener-differential.test.ts`）、桌面窗口 2（`app/desktop/session.ts`、`test/桌面应用/chief-workflow.test.ts`）；无 `??`/删除/重命名。
- B2 独立计算逐文件 raw SHA-256，与 D1 表 **15/15 全等**；聚合按「路径 UTF-8 排序后 `path + "\0" + sha256(hex)` 串联的 SHA-256」复算 = **`a80e93dad2bc598a6bda3adae239bf79d46213538f391c6beba8cf25439eda59`**（与 D1/预绑定一致；raw-digest 变体不等，证明记录使用 hex-string 口径）。
- B2 独立生成 `src app test` manifest：`git ls-files -z` 得 **1,107** 文件，逐文件 SHA-256，按路径字节序排序，行格式 `sha256<TAB>path`，得 **118,578 bytes / `f62a81a6…`**；与 D1 证据 `manifest-src-app-test.txt` **逐字节相同**；聚合 **`b06433b5…`** 一致。
- 候选区域核对：`src/model/runtime.ts` 仅 `CompleteTeamPlanInput`/注释 hunk；`apply-journal.ts` 仅 `baseDigest ?? null` 与 `completeTeamPlanInternal` 区域；`trunk-runtime.ts` 仅 Git 身份/失败回显、`convenerTeamPlanFacts`/注释、abort/preflight 回显；`schema.ts` 仅 `complete_team_plan`；`convener/index.ts` 仅 `checkTeamPlan`；`session.ts` 仅新增 `completeTeamPlanForHandle`/接线。与 B1 §2.1 写集一致。

### 2.2 写集外 diff=0（B2 独立审计）

- `角色卡/**` **tracked 变更 0**；`角色卡/convener-code/api-spec.md` 工作树 blob `b3b651b7c7b13deaf25024fa86d59085ee483a5a` ＝ `HEAD:` blob，`git diff` = 0（B1 v1.2 附录 B 回退确认）。
- 12 个 exclusion 路径（`classify-shell.ts`、`run-manifest.ts`、`customer-input.ts`、`app/renderer`、`optional-acceptance.test.ts`、`workflow-preconditions.ts`、`tools.ts`、`run-role.ts`、`session.test.ts`、`amendment-validate.ts`、`evidence-check.ts`、`src/common/门禁引擎`）status 行数全为 **0**。
- `src app test` untracked（`-uall`）= **0**；staged = **0**；`package.json`/`package-lock.json`/`electron-builder.yml`/`tsconfig.json` = **0**。
- 全仓 tracked 修改仅 15 候选 + B1 v1.2（判据文件，B1 修订）+ `docs/communication/memo.md`（调度方并发写入 PR #79 合并记录，非本变更/非候选；§4-8）。其余未跟踪 `.tmp-*`/`.commit-msg-*`/`.pr-body-*`/角色证据目录均为既有治理/证据产物，不计候选。
- H1 delta=0：不新增目录、不改角色卡/边界/roster/卡文本/派发矩阵；T8/T9 在 `test/roles/convener/`（boundary :11），T7 在 `test/编排/`（:83），W1–W6 均在各自 boundary §1。

### 2.3 稳定性（BASE-5）

- D1 `snapshot-initial` → `snapshot-post`：15 M、聚合、manifest、HEAD/tree/分支/暂存均逐字节相同。
- RR6b `pre/candidate-*` → `post/candidate-stability.txt`：HEAD/tree/分支、15 文件、聚合 `a80e93da…`、manifest `f62a81a6…`/`b06433b5…` 前后相同；untracked 0、staged 空。
- B2 复跑全部测试/typecheck 后复取：`src app test` 仍 **15 M**、untracked 0、聚合 **`a80e93da…`**；未在候选内产生副作用文件。

### 2.4 确定性复跑（B2 独立执行；Node v24.22.1）

**六文件（命令：`node --test --test-concurrency=1 --test-reporter=tap <file>`）**

| 文件 | B2 实测（tests/pass/fail/cancelled/skip；exit） | D1 after | 失败集合 |
| --- | --- | --- | --- |
| `test/编排/direct-role-capabilities.test.ts` | **47/46/1/0/0；1** | 47/46/1/0/0 | 同名 `Retained intent confirmation…`（diff 空） |
| `test/编排/git-capabilities.test.ts` | **16/13/1/0/2；1** | 16/13/1/0/2 | 同名 `Git team plan publication…`（diff 空；2 skip 同名） |
| `test/编排/convener-module-consumption.test.ts` | **9/9/0/0/0；0** | 9/9/0/0/0 | 空 |
| `test/runtime-core/submit-capability-tools.test.ts` | **25/23/2/0/0；1** | 25/23/2/0/0 | 同名 2 条 `R2 Service real-chief context…`/`R2 chief timeout…`（diff 空） |
| `test/roles/convener/convener-module.test.ts` + `convener-differential.test.ts` | **32/32/0/0/0；0** | 32/32/0/0/0 | 空 |
| `test/桌面应用/chief-workflow.test.ts` | **66/53/13/0/0；1** | 66/51/15/0/0 | B2 失败标题集合（11 个去重）为 D1 after 的子集；无 new-only；W10/W47 select 在 B2 通过（环境抖动族，§4-5） |

**四目录（命令：`node --test --test-concurrency=1 --test-reporter=tap <find 出的 *.test.ts 列表>`）**

| 目录 | B2 实测（tests/pass/fail/cancelled/skip；exit） | D1 after | 失败/skip 集合 |
| --- | --- | --- | --- |
| `test/编排/`（107 文件） | **1139/1115/22/0/2；1** | 1139/1115/22/0/2 | 与 D1 after **逐条 diff 空** |
| `test/runtime-core/`（59 文件） | **543/506/33/0/4；1** | 543/506/33/0/4 | 与 D1 after **逐条 diff 空** |
| `test/门禁引擎/`（41 文件） | **453/447/5/0/1；1** | 453/447/5/0/1 | 与 D1 after **逐条 diff 空** |
| `test/roles/convener/`（2 文件） | **32/32/0/0/0；0** | 32/32/0/0/0 | 空 |

**新增用例/B2 TAP 锚点**（全部实测通过）：direct-role `ok 44`（P-1/P-6/P-8①③）、`ok 45`（P-2/P-3/P-15）、`ok 46`（P-4）、`ok 47`（P-5/P-7）；既有 `ok 7/8`（P-8④，含 `:427-428` 删除后重放）；git-cap `ok 16`（P-9）；consumption `ok 9`（P-13）；submit `ok 16/17/18`（P-11）；convener pair（P-10，32/32）；chief `ok 54/55/56`（P-12）；P-14 由目录集合 diff 空覆盖。

**P-9 已知红**：B2 复跑 `not ok 15 - Git team plan publication…` 原文为 `{"ok":false,"code":"trunk-item-invalid","message":"The actual publication task has no original Chief input source"}`（与 D1 红因一致；既有红未改写/未跳过），新增 P-9 `ok 16` 使用真实 chief init source 隔离，已通过；既有红不作为 pass 证据。

**静态门**：`npm run typecheck` **exit 0**；日志 4 行 / 43 bytes / `22d52cc9…`，与 D1 `after-typecheck.log` **同 hash**；`app/renderer` 为既有排除，本变更 diff=0。

### 2.5 旧断言记录 / H1 / Q 默认（B2 独立核对）

- B1 §4.3 第 1 条：`test/roles/convener/convener-module.test.ts` 删除 `baseDigest` 旧断言由 `team-plan-facts-invalid` 改为 `allow`，新增 `{path,version}`/最小 payload 正例与 RR5 路径负例——候选 diff 与记录一致。
- 第 2 条 `{baseDigest:63 位}` 拒绝断言保留；第 3 条 consumption facts 缺省不造键新增；第 4 条 submit 旧形状保留+省略/缺字段/未知键/非 hex 负例新增；第 5 条无未记录的断言删除（B2 扫描 `git diff -- test/` 的 `-` 行为 §4.3 所列改写/import 替换）；第 6 条 N3 两条 `plan-hash-drift` 文案均有测试锚点；第 7 条 P-9 红项未改写；第 8 条 T7 `?? null`；第 9/10 条 T8/T9 金样/差分；第 11 条 api-spec 回退。
- 候选无新增 `skip(`/`todo(`/`--test-force-exit`/`process.exit`（扫描 0 命中）；无删除/弱化 fail-closed 负例。
- H1 delta=0：`角色卡/**` tracked 0、`CONVENER_CARD_TEXT` 区域无 diff、roster/派发矩阵/卡种/权限 0；团队计划仍归运营。
- Q4：marker 不含 `runId`（direct-role `ok 44`/`ok 47` 断言 `"runId" in marker === false`）；`classify-shell.ts` diff=0。Q6：无 bootstrap（P-5 与 RR6b）。Q7：`appointment` 仍 nominator-only（`run-role.ts` diff=0；RR6b 未发任命卡）。S2：`plan-run-conflict` 复用 service 码；host-local `plan-task-unavailable`/`plan-task-changed`/`plan-flow-conflict` 未登记共享码；`inspectAssignedTask` 失败直通 `trunk-item-invalid`。

### 2.6 RR6b 真实运行复核（B2 只读取证，不重跑）

- **回执原件**：`complete-team-plan-calls.jsonl`（490 bytes / `bc53f9f2…`）入参逐字 `{"flowId":"snake-game","operationId":"ctp-snake-team-v1-1","plan":{"path":"docs/scheduling/snake-game-team-v1.md","version":1}}`，`inputHasBaseDigest=false`/`inputHasPlanSha256=false`/`inputHasRunId=false`。
- `complete-team-plan-receipts.jsonl`（510 bytes / `fc54b673…`）回执原文 `complete_team_plan: {"ok":false,"status":"rejected","operationId":"ctp-snake-team-v1-1","baseDigest":null,"targetDigest":null,"errorCode":"trunk-unavailable","message":"effective-manifest-missing"}`——RR6-B 主预期。
- **端口/隔离**：`pre/pre-summary.json` `portsPre.listeners9222=0`/`9223=0`；`ports-during-run.jsonl` 6 次采样均 `listeners9222:0`/`listeners9223:1`；`isolation-post.txt` 仅 9223 `TIME_WAIT` 无 LISTENING；`processes-post.txt` 空。
- **零触碰**：`snake-app-root-pre/post.sha256` 均 `01ba4719…`（0 文件）；`snake-run-root-pre/post.sha256` 均 `71d10856…`（108 文件）——前后逐字节相同。
- **候选/仓库稳定**：`post/candidate-stability.txt`（906 bytes / `03f51a5a…`）HEAD/tree/分支/15 文件/聚合/manifest 前后相同，untracked 0/staged 空。
- **target**：`post/post-summary.json`（5,910 bytes / `3a48111e…`）`trunkManifestPost={exists:false,trunkDirListing:["initialization-sources","snapshots"]}`；target 101→111（added 13 / removed 3 / changed 18），新增含规范团队计划 `docs/scheduling/snake-game-team-v1.md`（3,377 bytes / `efd1c8e6…`），无 `game/`；docs/proposals/contracts/product/intents 前后逐字节未变（记录 §9.3）。
- **预算**：`budget.json`（1 客户消息 / 0 卡 / 1 派发 / chief 1 completed / Git 0）；`post/budget-post.json`（chief 1 settled+2 aborted；convener 0+1 aborted；rapporteur 1+1 aborted）；墙钟 ≈1m30s；首果回执 13:23:51.340Z、停止 13:23:58.952Z（+7.6s，驱动收尾条件偏差已披露）；驱动 0 重试；应用恢复重投 3 次（未投递/1 真实 rapporteur 回合/1 中止）已单列；9222 零占用；9223 释放。
- **模型**：`extras/model-disclosure.txt`（89ea5ab4…）`ANS_CLAUDE_MODEL=deepseek-v4-flash`、`message.model=deepseek-v4-flash`；非 Anthropic Claude。
- **规范路径**：`gate-records.jsonl` 24 行、`codes` 全空、**0 行含 `"errorCode":"plan-path-invalid"`**；13 行在客户/任务文本 snippet 中提及该字符串（见 §4-1 更正）；`complete_team_plan` 仅在 canonical path 上进入 service 并被 trunk 缺失拒绝，`plan-path-invalid` 回执未出现。
- **首轮 RR6**：记录 `7f672fb2…` 200 行，停在更早的 `versioned-doc-overwrite` 文档冻结门；RR6-A/B/C 未观测；RR6b 为协调方授权的修正轮（新运行根 `userData2`/`evidence2`，非重试、未追加客户消息）。

## 3. 逐条判定

> 每条在**同一最终候选**上、以可复算原始证据判定；全部子判据满足方可 `pass`。本条 B2 全部适用项均 `pass`；更正/披露见 §4，不影响判据。

### 3.1 BASE-1..BASE-8

| ID | 判定 | 依据/观察 |
| --- | --- | --- |
| BASE-1 | **pass** | 实施基线 HEAD `24799cb`（tree `409a4ac7…`）、分支 `feat/plan-escalation-card`；judge 已合入（`24799cb` 提交及 memo/派发记录），提案卡修复 `fb1aa39e` 为祖先；`src app test` 15 M，无 judge 在飞编辑；D1 §1.1/派发记录 §三。 |
| BASE-2 | **pass** | 串行 judge→本变更→文档格式；judge 已合入，文档格式未开始；`apply-journal.ts`/`trunk-runtime.ts`/`model/runtime.ts` 仅本变更 hunk；`session.ts` 与文档格式同文件、本变更先写；D1 区域核对与候选 diff。 |
| BASE-3 | **pass**（附限制） | D1 before/after 与 B2 独立 after：目录/5 文件失败与 skip 集合 diff 空；新增 +12 用例全过；新增确定性失败=0、新 skip=0；chief-workflow 抖动为已知 ENOTEMPTY 族（B2 集合为 D1 after 子集、无 new-only）；optional-acceptance partial 两侧对称（§4-4）。 |
| BASE-4 | **pass** | 15 文件全 M；per-file hash 15/15=D1；聚合 `a80e93da…`；manifest 1,107 / `f62a81a6…` / `b06433b5…`；写集外 0；api-spec diff=0；无新依赖/目录；未跟踪治理文档不计候选。 |
| BASE-5 | **pass** | D1 快照前/后、RR6b 候选稳定性、B2 复跑后复取：15 M/聚合/manifest/HEAD/tree/分支/staged 全部相同；测试未在 `src app test` 产生副作用。 |
| BASE-6 | **pass** | 全部写集命中 boundary §1；不新增目录；`角色卡/**` tracked 0；`CONVENER_CARD_TEXT`/roster/派发矩阵/卡种/权限 0；团队计划归属不变。 |
| BASE-7 | **pass** | T2 维持（协调方裁决）；无 bootstrap/run 生命周期/marker/`classify-shell`/角色卡/公共契约 breaking/新数据模型；写集外 0。 |
| BASE-8 | **pass** | L1–L5 确定性（D1+B2 复跑）、L6 RR6b 真实运行分层独立；证据绑定候选/命令/环境/计数/日志 hash；未用真实运行替代确定性，反之亦然。 |

### 3.2 AC-1..AC-13

| ID | 判定 | 依据/观察 |
| --- | --- | --- |
| AC-1 | **pass** | `apply-journal.ts` 形状可选化（`:2863`）、`derivedBase=current.digest`、严格相等、`effectiveBase ?? input.baseDigest ?? null` 分层回显；`source.baseDigest=current.digest`；P-1 `ok 44`、P-2 `ok 45`、P-5 `ok 47` 断言。 |
| AC-2 | **pass** | 来源选择 (i) frozen 命中、(ii) live 命中、(iii) live 优先/frozen 兜底/均不可读；严格相等（大写拒绝）；`derivedSha` 用于 parse/marker/target；P-3 `ok 45`、P-4 `ok 46`、旧式 `ok 7/8`。 |
| AC-3 | **pass** | 无 manifest→`trunk-unavailable`（P-5 `ok 47`，baseDigest=null、不 bootstrap、无 marker）；roster/modules→`plan-basis-incomplete`/`plan-owner-invalid`；不可读→`plan-hash-drift`；结构/路径 code 不变；RR6b 停在该门如实记录。 |
| AC-4 | **pass** | P-6 `ok 44`：`team-plan:<sha(canonicalJson({input,actor}))>` 原样 input、marker 派生值、target 字节、旧式完整 payload `deepEqual` 派生路径回执；`ok 7/8`（含 `:427-428`）原样通过。 |
| AC-5 | **pass** | `requestDigest` 原位置/原样 input；`resolved` 仅 marker/target/回执/commit；`PreparedTeamPlanCommit.input` 原样（P-9 `ok 16` 断言）；P-8①/③ `ok 44`、② `ok 16`、④ `ok 7/8`；NoOp `ok 44`；canonicalJson 丢 `undefined`。 |
| AC-6 | **pass** | `session.ts` 新增 `completeTeamPlanForHandle`：entry/handle/origin/busy/!settled/双 abort 校验；`inspectAssignedTask`；flow/run 断言；`plan-run-conflict`/`plan-flow-conflict`/`plan-task-unavailable`/`plan-task-changed`/`trunk-item-invalid` 分层；P-12 `ok 54/55/56`；仅 convener 注入。 |
| AC-7 | **pass** | P-13 `ok 9`：多 draft + `run-ambiguous` 登记成功、绑定任务 run、不增/不关/不 pin；`project_state`/`version-decision` 只读 deepEqual 不变；`run-role.ts` diff=0；仅 `session.ts:4319` 注入 ⇒ CLI 无工具回归。 |
| AC-8 | **pass** | Service 路径正则（`:2886`）与 convener `expectedPath` 逐字未改；P-15 `ok 45`（RR5/roster/版本不一致仍 `plan-path-invalid`）；convener `ok 22`；RR6b 规范路径进入 service；`plan.version` 不派生；文档格式责任归文档格式变更。 |
| AC-9 | **pass** | `CompleteTeamPlanInput` 可选化、schema required `["operationId","flowId","plan"]`/plan `["path","version"]`、base/sha 64 hex 形状保留；P-11 `ok 16/17/18`；`tools.ts` diff=0；无新工具/IPC/数据模型。 |
| AC-10 | **pass** | `checkTeamPlan` 可选字段/键集允许 `{path,version}` 或 `{path,sha256,version}`；路径/版本/未知键逐字保留；`convenerTeamPlanFacts` 缺省不投影；P-10 convener pair **32/32**；api-spec 不纳入（已回退）。 |
| AC-11 | **pass** | H1 delta=0：`角色卡/**` tracked 0、`CONVENER_CARD_TEXT`/roster/派发矩阵/卡种/权限 0；团队计划仍归运营；无新角色/边界；api-spec 回退 `20e6336d…`。 |
| AC-12 | **pass** | P-2/P-3/P-4/P-5 负例均断言无 journal/marker/trunk 变更、失败回执回显派生/`null`；RR6b `baseDigest:null`/`targetDigest:null` 如实；无空串摘要/截断 hash 冒充；审计仅记录派生/实际值。 |
| AC-13 | **pass**（附限制） | 四目录失败/skip 集合与 D1 after 逐条 diff 空；P-14；typecheck exit 0（`22d52cc9…`）；新增确定性失败=0/新 skip=0；optional partial 与 chief 抖动见 §4-4/§4-5；写集外 0。 |

### 3.3 P-1..P-15

| # | 判定 | B2 证据（自带 TAP 锚点） |
| --- | --- | --- |
| P-1 | **pass** | direct-role `ok 44`：缺省 payload ⇒ applied；回执/baseDigest=effective digest；planRef.sha256=实际字节；trunk+1；marker plan 派生值。 |
| P-2 | **pass** | direct-role `ok 45`：声明 baseDigest 不等/大写 ⇒ `plan-base-conflict`；失败回执回显派生 baseDigest；无 journal/target 变更。 |
| P-3 | **pass** | direct-role `ok 45`：声明 sha 不等/大写 ⇒ `plan-hash-drift`；无副作用。 |
| P-4 | **pass** | direct-role `ok 46`：(i) frozen 命中、(ii) live 命中、(iii-a) live 优先、(iii-b) frozen 兜底、(iii-c) 均不可读 ⇒ `plan-hash-drift` 新文案；无 journal。 |
| P-5 | **pass** | direct-role `ok 47`：无 manifest ⇒ `trunk-unavailable`、baseDigest=null、不 bootstrap、无 marker 目录。 |
| P-6 | **pass** | direct-role `ok 44`：旧式完整 payload 与派生路径回执 `deepEqual`；`team-plan:<digest>` 锚点；marker/target 字节相等；`ok 7/8` 旧重放。 |
| P-7 | **pass** | direct-role `ok 47`：run 属 flow ⇒ applied + `source.runId`/journal actionSource.runId、marker 不写 runId；外 flow/不存在 ⇒ `plan-run-conflict`、无 journal、trunk 不变。 |
| P-8① | **pass** | direct-role `ok 44`：首成功后删除计划文件、同 operationId 同原样 payload 重放 ⇒ 命中先序回执。 |
| P-8② | **pass** | git-cap `ok 16`：Git prepare→commit 后原样 payload 重放 ⇒ 同一回执。 |
| P-8③ | **pass** | direct-role `ok 44`：同 operationId 形态变化（补声明值）⇒ `plan-operation-conflict`。 |
| P-8④ | **pass** | direct-role `ok 7/8`（既有参数化，含 `:427-428` 删除后重放）逐字保留。 |
| P-9 | **pass**（附已知红） | git-cap `ok 16`：省略值 prepare/commit 派生、prepared input 原样、`team-plan:` 锚点、漂移 commit 非 applied；既有 `not ok 15` 同名红 `trunk-item-invalid`（无原始 Chief 输入源）未改写，不作 pass 证据。 |
| P-10 | **pass** | convener pair `ok 22`（T3 `:391`）+ differential 32/32：缺 baseDigest/plan.sha256 ⇒ allow；63 位/非 hex/未知键/缺 version/path ⇒ `team-plan-facts-invalid`；RR5 路径/版本 ⇒ `team-plan-path-invalid`；差分 allowed 4/compared 11/knownDelta 1。 |
| P-11 | **pass** | submit `ok 16/17/18`：schema required 缩减、64 hex 保留、无 oneOf/anyOf；省略形状合法且原样提交；缺 path/version/未知键/非 hex/路径越界/version 0 拒绝且 0 调用；回执透传派生 planRef.sha256。 |
| P-12 | **pass** | chief `ok 54/55/56`：省略 runId ⇒ 注入任务 run、source.runId=任务 run；自报不一致 ⇒ `plan-run-conflict`；flow 不符 ⇒ `plan-flow-conflict`；无回合/中止 ⇒ `plan-task-unavailable`；核验期间中止 ⇒ `plan-task-changed` 且 trunk 不前进；inspect 失败直通 `trunk-item-invalid`；非 convener 不注入。 |
| P-13 | **pass** | consumption `ok 9`（+ `ok 1` 扩展）：多 draft + `run-ambiguous` 登记成功、绑定任务 run、planRef 派生；run 集合/状态不增不关不 pin；project_state/version-decision 只读不变；facts 缺省不投影。 |
| P-14 | **pass** | 目录 diff：编排/runtime-core/门禁/roles-convener 失败与 skip 集合全空；P-14 相关 run-manifest/project-state/evidence_check 同名同结果。 |
| P-15 | **pass** | direct-role `ok 45`（RR5/roster/版本不一致 ⇒ `plan-path-invalid`）+ convener `ok 22`（preflight `team-plan-path-invalid`）；未放宽。 |

### 3.4 RR-1..RR-8

| ID | 判定 | 依据/观察 |
| --- | --- | --- |
| RR-1 | **pass** | 真实 Electron `app/main.ts`（83,599 bytes / `339fcfaa…`）+ 真实模型（deepseek-v4-flash）+ 真实 UI；隔离 `userData2`；CDP 仅 9223；9222 预检/6 采样/后检零监听；现有贪吃蛇 target；运行根仓库外；首轮 RR6 停在更早门、RR6b 为授权修正轮（§4-6）。 |
| RR-2 | **pass**（附披露） | 客户消息 1/1；卡 0/≤4；派发 1/≤8；chief 1 completed+2 aborted/≤8；convener 0+1 aborted/≤3；product/impl 0/≤4；rapporteur 1+1 aborted（总 2 ≤2）；Git 0/≤4；墙钟 ≈1m30s/≤45m；首果回执后 +7.6s 停止（驱动收尾条件偏差，已披露）；驱动 0 重试；应用恢复重投单列；9222 零占用。修正轮书面预批「其它角色各 ≤3」为 B1 ≤2 的超集，实际 2 不超 B1；派发记录版本漂移见 §4-3。 |
| RR-3 | **pass** | 派发记录/RR6b 预先写明预期 RR6-B（现 target 无 `manifest.json`）；未临时 bootstrap；RR6b 运行后 trunk 仍无 manifest。 |
| RR-4 | **pass**（确定性覆盖） | RR6-A 未真实触发（无 ok:true/planRef/source.runId）；按 B1 RR-4 以 P-1/P-9/P-13 确定性覆盖并如实标注，不冒充真实运行；未为触发 A 而 bootstrap。 |
| RR-5 | **pass**（附 B2 更正） | RR6-B 已观测：`trunk-unavailable`/`effective-manifest-missing`、baseDigest/targetDigest null；规范路径进入 service；`plan-path-invalid` 回执 0；未 bootstrap；下一门如实归类；gate-records 措辞更正见 §4-1。 |
| RR-6 | **pass**（确定性覆盖） | RR6-C 未触发（模型未自报 baseDigest/sha256/runId）；按 B1 RR-6 以 P-2/P-3/P-7/P-12 确定性覆盖并如实标注。 |
| RR-7 | **pass**（附披露） | RR6-D：预算/隔离/证据齐备；9222 零改动（pre-summary + 6 采样 + post）；9223 释放无残留；贪吃蛇 app/run 根前后逐字节相同；target docs 未改写、无 game；候选/manifest 前后不变；模型如实 deepseek-v4-flash；证据索引 195 文件。 |
| RR-8 | **pass**（附 B2 更正/披露） | 无伪造成功/任命/游戏/客户同意；下一门、失败、回退、预算偏差、convener 报告未落盘、驱动 exit 13、应用恢复重投均如实披露；未拼接 RR5/首轮 RR6 证据；RR6-A/C 未触发如实标注；gate-records 措辞更正见 §4-1。 |

### 3.5 EV1..EV7

| ID | 判定 | 依据/观察 |
| --- | --- | --- |
| EV1 | **pass** | BASE-1–8：基线/顺序/候选/聚合/manifest/稳定性/H1/T2/证据层级全部齐备。 |
| EV2 | **pass** | AC-1–3/AC-12：P-1–P-5/P-15；payload 旧式/缺省、来源选择 (i)/(ii)/(iii) 分列；负例无副作用；无伪造摘要。 |
| EV3 | **pass** | AC-4–5：P-6–P-9；`team-plan:<digest>` 字节锚点、NoOp/journal/marker、prepared input 原样、Git store 绑定 fail-closed、P-9 红因隔离。 |
| EV4 | **pass** | AC-6–7：P-7/P-12/P-13；真实回合/handle/busy/abort、inspect 直通码、source.runId、多 draft、run-ambiguous 不变、CLI 无回归。 |
| EV5 | **pass** | AC-8–11：P-10/P-11；schema/preflight/路径负例/H1/归属。 |
| EV6 | **pass** | AC-13/P-14：before/after 计数与失败/skip diff、旧断言逐条、typecheck 0、无新增确定性失败/新 skip。 |
| EV7 | **pass** | RR-1–8：预算/隔离/证据/如实性；9222 零改动与 9223 释放；RR6-A/B/C/D 分支记录；模型名如实；附 §4 更正。 |

## 4. 发现、更正与限制（B2 独立记录）

1. **RR6b gate-records 措辞更正（RR-5/RR-8，不改变分支）**：记录 §5.2 称「`gate-records.jsonl` 24 行均为工具名/门类词汇提及，无任何 `plan-path-invalid` 回执（0 行含该 code）」。B2 实测：24 行均为 `{codes,file,snippet,ts}` replay/snippet 记录，`codes` 全空；**0 行含 `"errorCode":"plan-path-invalid"`**；但 **13 行在客户/任务文本 snippet 中提及字符串 `plan-path-invalid`**。正确表述为「0 行含该 errorCode（13 行为文本提及）」；`complete_team_plan` 实际回执仍为 `trunk-unavailable`，RR6-B 结论不变。建议 RR6b 记录在后续维护中更正该括号。
2. **预绑定行数口径（identity 辅助字段）**：`pre/binding-inputs.json` 记 B1 v1.2 `lines: 298`；B2 实测文件 297 行（297 newlines / `splitlines` 297，末尾有换行），bytes 74,210 与 SHA `0f528a0b…` 完全一致。属行数统计口径差异，不改变 B1 身份；以 bytes/SHA 为准。
3. **派发记录版本漂移（RR-2/RR-7）**：RR6b `pre/binding-inputs.json` 绑定派发记录版本 `70b868e5…`（5,594 bytes / 44 行）；B2 当前工作树为 `6ed789f1…`（6,068 bytes / 44 行，§三实施状态/B2 行更新）。RR6b §8 的预批原文仍在记录中；预算执行在原文范围内；当前版本为 RR6b 后的行政更新，不改变 RR6b 运行证据。
4. **`optional-acceptance.test.ts` 只读对照部分复现（AC-13/BASE-3）**：D1 两侧均在第 4 个测试前停滞（10 分钟看门狗终止，未 force-exit）；已完成 3 条两侧完全一致（2 pass / 1 fail），B1 参照 6/2/1/3/0 未能整体复现。文件 diff=0、不在写集；本报告不以部分结果冒充完整通过；该项判为 pass 附限制，不构成候选回归。
5. **`chief-workflow.test.ts` 环境抖动（AC-13/BASE-3）**：D1 after 66/51/15；B2 复跑 66/53/13，失败标题集合为 D1 after 的子集（11 个去重标题 vs D1 13 个），无 new-only；差异均为 Windows 临时目录 `ENOTEMPTY`/清理竞争族（W10/W47 select 等在两次运行间双向翻转），与 D1 §2.4/§2.5 隔离复跑归因一致；新增 P-12 三例 `ok 54/55/56` 全过；新 skip=0。B1 v1.1 A.2 的 59/47/12→63/47–48/15 为更早基线/环境参照；D1 以 63/50/13→66/51/15 重取，B2 66/53/13 为其子集，属同一 ENOTEMPTY 抖动族。判为 pass 附限制。
6. **首轮 RR6 与 RR6b 修正轮（RR-1）**：首轮 RR6（`7f672fb2…`，200 行）停在更早的既有 `versioned-doc-overwrite` 文档冻结门，未观测 RR6-A/B/C；RR6b 为协调方授权的全新隔离实例（`userData2`/`evidence2`），非驱动重试、未发第 2 条客户消息；本 B2 以 RR6b 为团队计划门证据，首轮仅作预态/披露引用，不拼接。
7. **RR6b 收尾偏差与报告缺失（RR-2/RR-8）**：首果回执 13:23:51.340Z，驱动 13:23:58.952Z 停止（+7.6s）；停止条件误把 rapporteur 的 `blocked` 行当作 convener 报告落地，convener `submit_report` 在停止后被取消，**convener 报告未落盘**。RR6-B 证据以工具回执原件为准；记录如实披露；不伪造报告。
8. **并发外部写入**：`docs/communication/memo.md` 的 M 为调度方并发更新（PR #79 合并记录），不在 `src app test`、不计候选；B1 v1.2 的 M 为判据文件本身（hash 稳定）。`request-rows.jsonl`/`old-cards.jsonl`/`project-notes.jsonl` 各含 1 个空行（0 记录），与记录「空」一致。
9. **before 基线构造（BASE-3）**：D1 before 使用 `git archive` 纯净副本 + `node_modules` junction + `.env` + worktree 形态 `.git`，并按 worktree 逐文件 EOL 复刻（1,107 文件 0 偏差）；首次 CRLF 全量副本作废（`superseded-crlf-before/`）。B2 独立重跑 after 并核对 D1 before/after 集合（diff 空）；before 非 worktree 本体，属实现基线重建，已披露。
10. **RR6-A/C 未真实触发**：按 B1 口径以确定性 P-1/P-9/P-13 与 P-2/P-3/P-7/P-12 分层覆盖并标注；本报告不宣称真实运行已证明 A/C。
11. **B2 未运行真实模型/Electron**：真实运行证据来自 RR6b（测试角色取证）；B2 仅作只读复核与确定性复跑，不占用 9222/9223。
12. **B1 v1.2 未提交**：B1 v1.1/v1.2 为工作树修订（B1 v1 已入库 `24799cb`）；B2 以 bytes/SHA `0f528a0b…` 绑定判据，不依赖提交状态；不授权提交/推送/合并/发布。

## 5. 判定计数与总判定

| 组 | 条数 | pass | fail | insufficient | NA |
| --- | --- | --- | --- | --- | --- |
| BASE-1..8 | 8 | 8 | 0 | 0 | 0 |
| AC-1..13 | 13 | 13 | 0 | 0 | 0 |
| P-1..P-15 | 15 | 15 | 0 | 0 | 0 |
| RR-1..RR-8 | 8 | 8 | 0 | 0 | 0 |
| EV1..EV7 | 7 | 7 | 0 | 0 | 0 |
| **合计** | **51** | **51** | **0** | **0** | **0** |

**总判定：`pass`**（同一最终候选 + D1 + RR6b；附 §4 的 B2 更正/披露，均不改变判据或分支）。本判定不授权提交/推送/合并/发布。

## 6. 限制与未覆盖

1. 本 B2 未运行真实模型/Electron/CDP；RR6-A/C 未真实触发，按 B1 确定性覆盖口径判定（P-1/P-9/P-13、P-2/P-3/P-7/P-12），不冒充真实运行证明。
2. 真实运行仅 RR6b 单次（首果即停、不重试、不追加）；首轮 RR6 停在更早门，未拼接其证据；convener 报告未落盘，以工具回执原件为准。
3. `optional-acceptance.test.ts` 仅部分复现（两侧对称 3 条），文件 diff=0；不以此宣称完整 6/2/1/3/0。
4. `chief-workflow.test.ts` 存在既有 ENOTEMPTY/清理竞争抖动；B2 集合为 D1 after 子集、无 new-only，新增用例全过；不宣称绝对全绿。
5. D1 before 为实现基线重建副本（EOL 对齐），非 worktree 本体；B2 独立重跑 after 并核对 before/after 集合 diff 空。
6. 本报告只判定同一最终候选；未判定其它候选/变更/后续发布；B1 v1.2 的提交状态不影响本判定，但提交/推送/合并/发布仍需授权。
7. 报告自身行数/字节/SHA-256 在写盘后由交付回报提供（文件无法内嵌自身哈希）。

## 7. 状态

- **B2 独立验收完成：pass（51/51 适用项；附 §4 更正/披露）。**
- 未改代码/测试/角色卡/方案/其它文档；未提交/推送/合并/发布；未占用 9222；未运行真实模型/Electron。
- 本报告为阶段独立报告，不跨阶段合并；后续合并/发布需客户/协调方逐 PR 授权。
