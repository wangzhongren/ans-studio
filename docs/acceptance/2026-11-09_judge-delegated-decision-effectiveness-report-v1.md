# 代理审批/代决策的效力等同客户本人（judge 代批生效，T3）：B2 独立验收报告 v1

- 日期：2026-11-09；角色：**ANS 独立验收（Independent Acceptance）独立固定上下文**（本报告为该变更 B2）。
- 工作目录（git worktree）：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；分支 `feat/plan-escalation-card`；HEAD **`fb1aa39e787934f334b9c164e4221074f97f6147`**（tree `ee33c3e95d9b3fb61dc5d05eea66c2d0a2eb9583`，父 `c1439ce`；提案卡修复已提交）；暂存 0。
- **唯一判据（已实测核对）**：B1 v1.1 `docs/acceptance/2026-11-09_judge-delegated-decision-effectiveness-criteria-v1.md`，**400 行 / 61,990 bytes / SHA-256 `4cbb5df2507c2b30d43b37707cba305490ca8f8fc365b65e25a18f99b3693543`**（v1 正文 + 附录 A：AC-J7b amendment）。
- 变更包 **E3-B**：`docs/scheduling/2026-11-09_change-package_judge-delegated-decision-effectiveness.md`，**111 行 / 15,628 bytes / SHA-256 `7edad9fcd10bfaca941c59187c5bbddbe0fed09f80fd5803d742fcfe1301ef00`**。
- 方案/复核/团队计划（实测同值）：P1.2 `1477a6e4…`（686 行 / 88,988 bytes）、复核 `de1d0281…`（362 行）、团队计划 `9b61a484…`（73 行）。
- 证据（实测同值）：D1 `d7c16852…`（224 行 / 23,909 bytes）；RR `22cc60f3…`（169 行 / 22,238 bytes）+ 证据目录（`evidence-manifest.txt` `87bd82fb…`，126 条目）；E3-F `8dc4a091…`（271 行 / 32,620 bytes）+ 证据目录（`evidence-manifest.txt` `96a2d4bd…`，680 条目）；六批记录 W-J1 `72848a5b…`、W-J2 `70f0f62a…`、W-J3 `221b3199…`、W-J4 `1a4926ef…`、W-J5 `c811d518…`、W-J2b `c2defed0…`（均独立复算命中）。
- 本报告只做 B2 判定；**未修改任何源码/测试/角色卡/方案/其它文档；未提交/推送/合并/发布；未占用 9222；未运行真实模型/Electron/CDP**。本报告自哈希于写盘后计算并在交付回报中给出（不写入正文以避免自指）。

## 0. 结论摘要

| 项 | 结果 |
| --- | --- |
| 总判定 | **pass**（50/50 条目 pass；§7 限制与披露随附） |
| 逐条计数 | **pass 50 / fail 0 / insufficient 0 / NA 0**（BASE-1..7、AC-J1..J12 + AC-J7b、J1–J17、RR-1..7、EV1–EV6） |
| 候选复核 | `git status --porcelain -- src app test` 恰 **25 项**（11 src M + 12 test M + 2 test 新文件）；逐文件 raw SHA-256 canonical 聚合 = **`9eb21d3b60dd7c384420e5f122939d835a3d9b4669f6a169622752f746ed6919`**（独立复算命中）；`src app test` manifest = **1,107 条目 / `2468fc59c957af88874cdb7d87f449b81ad5fcff70f497dd784454ff6cdfe108`**（独立重建命中；tracked 1,105 + untracked 2） |
| 范围合规 | `git status --porcelain -- app` = 空；`git diff --stat -- app/desktop` = 空；T1 三文件不在候选且工作树未改；`optional-acceptance.test.ts` diff = 0；无删除/重命名/新依赖 |
| 独立复跑（本次 B2） | 13 个关键测试文件逐文件独立进程：**227 tests / 216 pass / 11 fail / 0 cancelled / 0 skip**；11 fail 全部为**预存红项**（与 D1/W-J2/W-J4/基线同名同集合）；`npm run typecheck`（`tsc --noEmit`）**exit 0**；补充：`optional-acceptance.test.ts` BASE-3 命令口径 **6/2/1/3/0**（精确复现基线）；`version-change-integration.test.ts` **12/3/9/0/0**（9 红为既有 VCA 语义漂移，客户主权用例 `ok 12`） |
| E3-F 全量口径 | 547 个 `test/**/*.test.ts`（对参照 540 清单 **+7/−0**）；541 自然完成 + 6 登记挂起；**5,075 tests / 4,845 pass / 197 fail / 1 cancelled / 32 skipped / 0 todo**；`new_failures=4`（全环境性，隔离复跑排除）、`missing_failures=0`、`new_skips=0`、`missing_skips=0`；**新增确定性失败 0、新 skip 0**（证据 `compare/summary.txt` 等独立核对） |
| 真实运行 | 开/关两腿原件齐备且与 RR 记录一致：judge-on `intent-confirmed`/`origin:"judge-delegated"` 冻结成功（字段核对 24/24）；judge-off 客户本人冻结（15/15）、judge 调用数 0；9222 零占用/零改动、9223 释放、无 Electron 残留；贪吃蛇两根 108/88 文件前后逐文件哈希一致 |
| 判定口径披露 | RR 后端模型为 **`deepseek-v4-flash`**（经 `ANTHROPIC_BASE_URL` 代理；claude 引擎适配器、真实模型会话）；本报告 §7-1 明确 AC-J10-1「真实 Claude（非 demo）」的判定口径 |
| 放行边界 | 本 B2 **不授权发布/tag**；合并需客户逐 PR 明确「允许我合并」 |

## 1. 候选与 manifest 独立复核（BASE-4 / BASE-5）

### 1.1 写集（恰 25 文件）

`git -c core.quotepath=false status --porcelain -- src app test` 实测恰 25 项：11 个 `src/**` M、12 个 `test/**` M、2 个 `test/测试/**` 新文件（`??`），无删除/重命名/写集外条目。

| # | 批次 | 文件 | raw SHA-256（本次独立复算） |
| --- | --- | --- | --- |
| 1 | W-J1 | `src/model/version-change.ts` | `f185824160e3081f312d0c73e692fcef27c20ca0a18954be32ba2d189cc9e4bb` |
| 2 | W-J1 | `src/model/runtime.ts` | `67e649047a177a5e8dedd26cae3a3e6d894bda767d8be95dc84b2fac4bcb8c22` |
| 3 | W-J1 | `test/runtime-core/direct-role-capabilities.test.ts` | `80cd5d521cc74b4bb3b68b253006d6387e76fa10a84dcc20a53eb9afd4201833` |
| 4 | W-J1 | `test/runtime-core/version-change-contract.test.ts` | `bea0d51ab8f3a9675ab55c4fe75c70b2e2b27168979beab968245f27a78f85c9` |
| 5 | W-J2 | `src/service/trunk/impl/apply-journal.ts` | `e5774d054bbb025ab56b4fbbdcbe2f2cc5fa3006f1bc2dec19dc02735030720c` |
| 6 | W-J2 | `src/service/version-change/impl/freeze-service.ts` | `0f4ef1411bed880ccaaaac1d7e8201b9e8f7a40a6e573b1ee0f92a6f98e42755` |
| 7 | W-J2 | `src/service/version-change/abstract/version-change-service.ts` | `deaaeb46f60e8a983ff142ef86e201d159ba906ebd5e8c1eff048b861122416a` |
| 8 | W-J2 | `src/provider/version-change/impl/guard-freeze-registry.ts` | `81869f3f2a0e914891617b4c6144cdb5abe6e0dbee3f1a604134dc9ac8d0fdb5` |
| 9 | W-J2 | `src/pipeline/orchestration/trunk-runtime.ts` | `7b120c800dbb9b0e27e9023e91c87d190746b51f161aafb0cbca421445cefde0` |
| 10 | W-J2 | `src/pipeline/orchestration/version-change-runtime.ts` | `c8f67dacaa716b1e18d62f3d3ecd930a01682083a5c323b90d50c63b9cb103d3` |
| 11 | W-J2 | `src/common/编排/task-state.ts` | `da5cf6891ea7cb3730b7ca5a8e1d55bb97bd2571df549276e557d4bc121fff5d` |
| 12 | W-J2 | `test/编排/direct-role-capabilities.test.ts` | `0f63f049573ef2c6d25d786a3826f9b79fc98536e48a1c4c6a737c0bd089e022` |
| 13 | W-J2 | `test/编排/version-change-service.test.ts` | `14a3dc5187530ba8540651e1a7ee8cfe9f744ad911a3f569609d9b7289d3c880` |
| 14 | W-J2 | `test/编排/task-state.test.ts` | `f863e8e7b922b88a93f5eaada03b7b2ce10421dc8bd7796d9f136bf46abc3b03` |
| 15 | W-J2 | `test/编排/trunk-events.test.ts` | `9987d42b245114d100506fa25e16185f92a90f0a529d0df9782144818da3ed01` |
| 16 | W-J3 | `src/common/门禁引擎/classify-shell.ts` | `a98f09e42b10d88a8d18ad26a1f37284a1435880be11df3e3f18babafdc9e7c1` |
| 17 | W-J3 | `test/门禁引擎/direct-role-capabilities.test.ts` | `f36e108d5eeee9b8a045f9cbf9283218ac3b1cafb5b324c2751eadee32a5d666` |
| 18 | W-J3 | `test/门禁引擎/git-shell-acl.test.ts` | `7652d171c3c5e1fc32d85fbf3d9c5bc0c6a8cbd224d7c581a62d17fdbc19a6e4` |
| 19 | W-J4 | `test/桌面应用/decision-service.test.ts` | `f5186992b3bdae4038f90c48a2d3551254bd60c5e69037e69222175ac93e807b` |
| 20 | W-J4 | `test/桌面应用/run-change-trigger.test.ts` | `3775b8da8f62c62a3b0aa75c99bdba4c8e8274757ffd900975a73d3541dd9bbf` |
| 21 | W-J5 | `test/测试/git-write-chain-fixture.ts` | `59700e5fab72796cb27fccfe4aaf0f35e9f83b324f4edfdedb20f981788d7ea7` |
| 22 | W-J5 | `test/测试/2026-11-09_judge-delegated-doc-freeze.test.ts`（新，99 行） | `8ff9666272c4a85768393da8b4f1b802f606878c12d8848cfadf76471e96653f` |
| 23 | W-J5 | `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（新，299 行） | `7c40f724683cfbfaaad4b97a879bb43a59611a282e3a3fc13ab79023e487fcdd` |
| 24 | W-J2b | `src/common/roles/nominator/index.ts` | `77fe423a016cd64cd85cdc25ece0086b1c39e0f84d66b914b881f0ba0a8abe9c` |
| 25 | W-J2b | `test/roles/nominator/nominator-module.test.ts` | `3375a9e74630eea112ccdb3773072ef317eda31be983824fb94eb837e5d111ff` |

- 与 E3-B §1.1 逐文件哈希表**全部一致**；与 D1 `candidate/write-set-actual.tsv`、RR `pre/post`、E3-F `candidate/write-set-actual.tsv` 一致。
- **canonical 聚合**（`sha256  path` 两空格、LF、`LC_ALL=C sort -k2`、25 行取 SHA-256）：**`9eb21d3b60dd7c384420e5f122939d835a3d9b4669f6a169622752f746ed6919`**（独立复算，命中三处记录同值）。
- 改动规模：23 个 M 文件 **+1318/−82**；2 个新文件 **99/299 行**（与 E3-B/E3-F 一致）。

### 1.2 `src app test` manifest（独立重建）

- 口径：`git ls-files --cached --others --exclude-standard -- src app test`（非忽略），逐文件 `sha256sum`，`LC_ALL=C sort -k2` 后成表。
- 独立重建结果：**1,107 行 / SHA-256 `2468fc59c957af88874cdb7d87f449b81ad5fcff70f497dd784454ff6cdfe108`**（tracked at HEAD 1,105 + untracked 2）。与 D1 `candidate/manifest-src-app-test.tsv`、RR `pre/` 与 `post/` manifest **逐字节相同**（`cmp` 无差异）。

### 1.3 范围与基线合规

- `git status --porcelain -- app` = 空；`git diff --stat -- app/desktop` = 空 ⇒ **产品桌面零改动**（W-J4 仅测试口径成立）。
- **T1 三文件**（`src/common/claude-adapter/schema.ts` `afe70c62…`、`test/claude-adapter/schema.test.ts` `358ac967…`、`test/claude-adapter/session.test.ts` `6379bc8e…`）：不在 25 文件候选、`git status` 为空；`session.test.ts` 现值为中间提交 `6ab0d2d` 的 HEAD 基线内容（与 E3-F `t1-files-check.txt` 说明一致），非本候选。
- 排除清单逐项 diff=0：`app/desktop/*`、`app/renderer/*`、`src/common/编排/run-manifest.ts`、`src/provider/runtime/tools.ts`、`src/pipeline/orchestration/run-role.ts`、`src/service/version-change/impl/vca-service.ts`、`src/model/trunk.ts`、`src/service/gate/*` 均不在 status；`test/桌面应用/chief-workflow.test.ts` 不在 status（提案卡修复写集，已由 `fb1aa39` 提交）。
- `test/桌面应用/optional-acceptance.test.ts`：未修改；工作树 blob = HEAD blob `518070f28b0b5ba1a184a8ff23892e3e6af1c0ae`。
- 无删除/重命名（status 无 `D`/`R`）；无新依赖（`package.json`/lock 不在 status）。
- **稳定性**：E3-F `candidate/status-src-app-test.txt` 与本次实测 status **逐行相同（diff 0）**；HEAD/tree/分支/暂存不变；本次 B2 复跑全程未在 `src app test` 产生任何副作用（复跑前后 status 25 项不变）。

## 2. 独立复跑（本次 B2 实测，Node v24.22.1 / npm 11.19.1）

### 2.1 关键受影响文件（逐文件独立进程，`node --test --test-concurrency=1 --test-reporter=tap`）

| # | 文件 | tests | pass | fail | cancelled | skip | exit | 对照基线 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `test/runtime-core/direct-role-capabilities.test.ts` | 13 | 13 | 0 | 0 | 0 | 0 | W-J1 targeted 13/13 ✓ |
| 2 | `test/runtime-core/version-change-contract.test.ts` | 18 | 17 | 1 | 0 | 0 | 1 | W-J1 after 18/17/1（既有红）✓ |
| 3 | `test/编排/direct-role-capabilities.test.ts` | 43 | 42 | 1 | 0 | 0 | 1 | W-J2 targeted 43/42/1（既有红）✓ |
| 4 | `test/编排/version-change-service.test.ts` | 16 | 16 | 0 | 0 | 0 | 0 | W-J2 16/16 ✓ |
| 5 | `test/编排/task-state.test.ts` | 20 | 20 | 0 | 0 | 0 | 0 | W-J2 20/20 ✓ |
| 6 | `test/编排/trunk-events.test.ts` | 5 | 5 | 0 | 0 | 0 | 0 | W-J2 5/5 ✓ |
| 7 | `test/门禁引擎/direct-role-capabilities.test.ts` | 23 | 23 | 0 | 0 | 0 | 0 | W-J3 23/23 ✓ |
| 8 | `test/门禁引擎/git-shell-acl.test.ts` | 39 | 39 | 0 | 0 | 0 | 0 | W-J3 39/39 ✓ |
| 9 | `test/roles/nominator/nominator-module.test.ts` | 15 | 15 | 0 | 0 | 0 | 0 | W-J2b 15/15 ✓ |
| 10 | `test/桌面应用/decision-service.test.ts` | 22 | 22 | 0 | 0 | 0 | 0 | W-J4 22/22 ✓ |
| 11 | `test/桌面应用/run-change-trigger.test.ts` | 10 | 1 | 9 | 0 | 0 | 1 | W-J4 10/1/9（既有红）✓ |
| 12 | `test/测试/2026-11-09_judge-delegated-doc-freeze.test.ts` | 2 | 2 | 0 | 0 | 0 | 0 | J16/J17 ✓ |
| 13 | `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` | 1 | 1 | 0 | 0 | 0 | 0 | J15 ✓（自然 exit 0，64s；D1 曾观测的「本体过、进程不退」未复现，与 E3-F 一致） |
| — | **合计** | **227** | **216** | **11** | **0** | **0** | — | 11 fail 全部为预存红：`doc-freeze reason 九类…（F29/F35/Q6）`（基线即 `10 !== 9`，W-J1 记录在案）、`Retained intent confirmation…`（W-J2 既有）、run-change-trigger 9 条（W-J4/pristine HEAD 同名集合） |

### 2.2 静态门与补充回归

- `npm run typecheck`（`tsc --noEmit`，`tsconfig` 既有 exclude `app/renderer`）：**exit 0**。
- `test/桌面应用/optional-acceptance.test.ts`（BASE-3 命令口径 `node --test --test-timeout=6000`，只读）：**tests 6 / pass 2 / fail 1 / cancelled 3 / skip 0**，`not ok 1` 位于 `:128`（`chief-hub-flow-unavailable` 断言），`:239/:252/:287` 为 6s 超时——**与 B1 BASE-3 基线 6/2/1/3/0 逐项相同**；文件 diff=0。
- `test/测试/version-change-integration.test.ts`（AC-J5 主权回归）：**12 tests / 3 pass / 9 fail / 0 skip**；9 红为既有 `vca-channel-unavailable` 语义漂移（与 W-J5 §4.4 记录一致）；**客户主权用例 `ok 12 - 客户主权与旧入口：VCA 卡不被 @决策/判断器代选…` 通过**。

### 2.3 E3-F 全量计数与「新增确定性失败 0 / 新 skip 0」独立核对

- 证据目录复核（`compare/summary.txt`、`compare/status-counts.tsv`、`compare/aggregate-by-origin.tsv`、`compare/new-failures.tsv`、`compare/missing-failures.tsv`、`compare/new-skips.txt`、`21-test-file-diff-vs-E3F.txt`、`candidate/static-test-integrity-scan.txt`）：
  - 测试文件 **547**（`find test -name '*.test.ts'` = 547；对参照 540 清单 **+7/−0**：本变更 2 + HEAD 基线 5）。
  - 状态分布：natural-exit **541** / registered-hang-timeout **6**；`anomalies.txt` 0 字节；未使用 `--test-force-exit`/`--test-timeout`（`run/run-e3f-per-file.sh` 注释与结果表 force 列一致）。
  - 计数：**5,075 / 4,845 / 197 / 1 / 32 / 0**（tests/pass/fail/cancelled/skipped/todo）——与任务给定完全一致；按来源：既有 534 文件 5,067/4,838/196/1/32、HEAD 基线新增 5 文件 5/4/1、本变更新增 2 文件 3/3/0。
  - 多重集对照：`new_failures=4`（3 条 `chief-workflow` ENOTEMPTY 清理竞态 + 1 条 `git-run-stop-host-continuation-e2e` Node 原生 `CleanupQueue::Add` 崩溃文件级条目）、`missing_failures=0`、`new_skips=0`、`missing_skips=0`；隔离复跑原件核验：run-stop **1/1 pass / exit 0 / 43,734ms**、chief-workflow **63/51/12（失败集合漂移）** ⇒ **新增确定性失败 = 0、新 skip = 0**。
  - 参照口径差异披露（已核）：`5cba2d54…` 实测为 `2026-11-08_E3-T3-full-regression.md`（169 行；4,979/4,750/196/1/32、520 文件）；5,032/4,807/192/1/32 与 540 文件清单来自 `2026-11-08_E3-F_remove-predictive-gates.md`（`41a4a215…`，247 行）。E3-F §1/§12 如实并列两者、不混用；本 B2 复算两文件哈希均命中。
  - 受写集影响套件对 D1 基线（`compare/suites-vs-d1/count-comparison.txt` 与失败标题 `.diff` 均空）：runtime-core 540/503/33/0/4、编排 1133/1109/22/0/2、门禁 453/447/5/0/1、桌面四文件 61/35/26/0/0——计数与失败/skip 集合逐条相同。

### 2.4 证据 manifest 可复算性（独立重建）

| 证据包 | 条目 | 记录值 | 本次独立复算 |
| --- | --- | --- | --- |
| D1 证据目录 `evidence-manifest.txt` | 342 | （未在正文给值） | 342/342 行哈希全部命中；文件哈希 `60ec8dfd…` |
| RR 证据目录 `evidence-manifest.txt` | 126 | `87bd82fb948f9f981a812dd69a36411be87ba974da5b4ee662b80f7bc4300555` | 126/126 全部命中；文件哈希同值 |
| E3-F 证据目录 `evidence-manifest.txt` | 680 | `96a2d4bda11b318c8576e0d62a92b25964970f54fd3e80fa45280dd6becbf8e7` | 680/680 全部命中；文件哈希同值 |

## 3. 逐条判定表

> 判定口径：B1 v1.1（含附录 A）；`pass` = 全部适用子项有完整、可复算原始证据；`fail` = 触犯 §7 fail 列表；`insufficient evidence` = 证据/环境不满足；`NA` = 有明确依据的非适用项。

### 3.1 BASE-1 – BASE-7

| ID | 判定 | 依据/证据 |
| --- | --- | --- |
| BASE-1 | **pass** | judge 实施基线重取：HEAD `fb1aa39`（提案卡修复已提交，提交时间 13:23:13）；`git status -- src app test` 为候选 25 文件；D1/E3-F/RR 全部绑定该 HEAD/tree/分支；提案卡修复 B2 通过记录（memo 2026-11-09）在案；基线无该修复的在飞未提交改动 |
| BASE-2 | **pass** | 串行：提案卡修复提交（`fb1aa39`）→ judge 批次（13:52–15:57）→ D1（16:41）→ RR（16:56）→ E3-F（17:52）→ E3-B（17:55）；文档格式未实施（排最后）。协调/调度记录：团队计划（`9b61a484…`，含 W-J2b amendment「协调方 2026-11-09 批准」与串行次序）；对方方案误述勘误知会：judge P1.2 §10.1/§10.2、文档格式 P1.1 §10.1（`:874`「勘误…随本方案提交知会统筹/沟通（协调记录条目）」）互证；单写者与 `src/model/runtime.ts` 串行窗口在团队计划记录在案。**注**：本变更无独立 `docs/scheduling/*dispatch-log*` 文件，调度记录即团队计划与其 amendment 行（如实记录，供复核） |
| BASE-3 | **pass** | 基线已知红项 + 增量不回归：本 B2 复跑（§2.1/§2.2）同名/同集合；optional-acceptance **6/2/1/3/0 精确复现**且 diff=0；E3-F 5,075/4,845/197/1/32 与参照多重集对照 **新增确定性失败 0 / 新 skip 0**；环境性 4 条逐条隔离复跑排除；既有失败消失 0 |
| BASE-4 | **pass** | §1：25 文件、允许写集、无删除/重命名、逐文件 raw SHA-256、canonical 聚合 `9eb21d3b…`、manifest 1,107/`2468fc59…` 独立复算；写集外 diff=0（含 §0.2-5 排除清单与 T1 三文件）；无新依赖 |
| BASE-5 | **pass** | 稳定性：D1 运行前/中/后、RR pre/post、E3-F 运行前/中/后三次快照均 diff 0；RR pre/post manifest 与本次独立重建逐字节相同；HEAD/tree/分支/暂存不变；本次 B2 复跑未改变 status（25 项） |
| BASE-6 | **pass** | 证据分层齐备：L1 runtime-core（13/13、18/17/1）、L2 编排/服务（43/42/1、16/16、20/20、5/5）、L3 门禁（23/23、39/39）、L4 桌面仅测试（22/22、10/1/9）、L5 跨层真实文件链（J15 1/1、J16/J17 2/2）、L6 隔离真实运行（RR 开/关两腿）；各层绑定候选/命令/环境/退出/计数；低层未替代真实运行，真实运行未替代确定性 |
| BASE-7 | **pass** | AC-31/F35 显式契约修订（非静默放宽）：W-J2 记录 `:16` 逐字记录并引用 `docs/acceptance/trunk-amendment-model-criteria-v1.md:205`（`3c40acad…`，本 B2 复核该文件存在且行号对应）；契约文件本批未修改；无 §0.2-4 之外新契约/数据模型（核：仅 origin/source 扩展、新增常量/守卫/D3 纯函数、applicationId 注释勘误；`request.resolved`/`CustomerInputOutcome` 形状不变） |

### 3.2 AC-J1 – AC-J12 + AC-J7b

| ID | 判定 | 依据/证据 |
| --- | --- | --- |
| AC-J1 | **pass** | J4（`test/编排/direct-role-capabilities.test.ts:133`）：真实 Service/Store/Registry/账本/marker/快照上 judge approve 成功生成 R9 `intent-confirmed`/`judge-delegated`；字段 `schema/reason/origin/applicationId:"intent-<requestId>"/frozenAt===resolved.at`、source 逐字段一致（含 G1 超长 4,000/400 字符原值）、`readConfirmedIntentEvidence` ok、重放幂等不追加；J15（effectiveness）跨层再证；RR judge-on 原件：`versions-final.jsonl` 第 6 行为 judge-delegated 冻结、`tasks-final.jsonl` 无 `doc.freeze`（literal 检查 0）、`freezeRows/source` 与账本 24/24（`8ad81e0b…`）；二次冻结来源筛选（`:694/:1328`）接受 judge-delegated 且仍拒绝 application/role-direct；`freezeEvents` 防御镜像仅 source-bearing（J17 钉字节） |
| AC-J2 | **pass** | J2（runtime-core）负例全 false 不抛错：null/数组/非对象/source 缺失/kind 不符/operatorId≠judge:engine/engine 空/requestId 空/reasonCode 空/cardKind↔reason 绑定/at 空/selected 类型/decidedBy/decisionId/actorRoleId/applicationId 不符/frozenAt≠source.at/非子集 reason/snapshotRef 非法；G1：10,000 字符 reason 与 4,096 字符 model 通过且原值保留；冻结记录无 decidedBy/decisionId/actorRoleId（J4/J15/RR 24/24）；模型值不进授权（role-authorization 只含 d3Source/decisionId；J8 authorization 断言）；形状不变（无新 `by`/actionSource/IPC）；**F7 信任边界如实**：`task-state.ts` 未收紧 `request.resolved.judge` 结构校验（diff 无该区域；R-4），补偿为冻结/授权路径账本重放逐字段核对——本报告不宣称账本层已强校验 |
| AC-J3 | **pass** | customer 路径逐字不变：finalize else 分支条件/构造与 `verifyReviewIntent` customer 分支原样（diff 仅扩展 judge/来源集合）；chief 分支原条件保留（仅 else-if 化）；J6/J7 既有用例在复跑中通过（编排 42 pass 含）；§2.2 optional-acceptance 6/2/1/3/0 与 diff=0；BASE-3 增量口径见上 |
| AC-J4 | **pass** | J5/J14 负例：declined/unavailable/revise/directive/customer 形状遇 judge 行/无匹配行 ⇒ `trunk-item-invalid`、零 judge 冻结、不抛错；decision-service 开关关闭用例（22/22，J12-b）通过；RR judge-off 腿：开关 `checked:false`、原卡呈现客户、judge 调用数 0（诊断无任何 `governance-judge.*`）、客户冻结成功 |
| AC-J5 | **pass** | 仅 `DOC_FREEZE_JUDGE_DELEGATED_REASONS = ["proposal-confirmed","intent-confirmed"]`；VCA/version-upgrade/detail/amendment/stable + judge ⇒ freeze-service 拒绝（J3 在 version-change-service 16/16 内、J1 负例）；`version-change-integration.test.ts` 客户主权用例 `ok 12`（VCA 卡不代选、judge/directive 回包 unavailable）；`app/desktop` diff=0 ⇒ appointment-write/@决策 排除与 judge 结算路径未改；`version-change.ts:407-420` `sovereignViolation` 未改 |
| AC-J6 | **pass** | 模型/Service/账本/门禁接受 proposal+judge：J1 proposal 正例、J16 proposal `doc.freeze` 正例、freeze-service `judged` 分支支持 `proposal-<requestId>`/cardKind proposal；常量恰两值；VCA 等 reason 拒绝；**无新 producer**（核：judge 冻结生产路径仅 `finalizeIntentConfirmation`→judgeIntentConfirmFreeze，reason 恒 `intent-confirmed`；无 proposal judge producer）；W-J1/W-J2 记录如实标注「无真实 producer」、仅单位/契约覆盖 |
| AC-J7 | **pass** | 共享 helper 单实现：`requestResolvedD3DecisionId`/`isJudgeD3Resolution` 各恰 1 处定义（`src/model/runtime.ts:1535/1554`）；调用点：apply-journal `:3220/:3659`（参考值）与 `:3219/:3543/:3653`（来源）、trunk-runtime `:729/:735`、classify-shell `:533/:539`——无手写三元式复制；J8：judge D3 激活/执行 pin/草案作用域通过，授权 `d3Source:"judge"`、`decisionId:"decision-<requestId>"`、无 actionSource，`targetRoleIds/roster` 校验保留；冻结仍不写 decisionId；J9 负例（审计缺失/operatorId 不符/decisionId 异常/actionSource 混入/roster 戳不符等）全拒绝不抛错；R-8：既有 `by:"judge"` D3 fixture（chain-enforcement/run-pin/run-change-trigger `:216`）未使桌面路径经 helper（W-J4 §3 可达性核对：app/desktop 对 helper 引用 0、四个 fixture 路径先于 D3 分支返回/只读 decisionId），fixture 无需升级、失败集合与 pristine HEAD 相同；`request.resolved` 校验无新 judge-delegated actionSource 分支 |
| AC-J7b | **pass** | `src/common/roles/nominator/index.ts` 单行 diff（`matchesFactKind` `d3-by` 加 `"judge"`，无其它编辑/格式化噪声）；nominator 模块测试 15/15（含 `d3By:"model"` 等非法值仍 `appointment-facts-invalid`、customer/chief-delegated 正例）；J15 实测 Runtime 包装层 `createDirectRoleRuntime.activateRoleDocuments` **ok:true/applied**（无 appointment-facts-invalid/activation-not-ready）、直投三收件人记账、幂等重放零重复；W-J5 旧缺口断言已按 A.4 改写为成功正例并逐条记录旧断言原文/新断言/理由/证据行（W-J5 §7.2）；职责/归属/团队计划归属不变；`d3-card` 阶段与其它事实键不变 |
| AC-J8 | **pass** | R3 历史 customer/application/direct/delegated 记录经同一 `isValidDocFreezeRecord` 通过且不重写（runtime-core R3 用例 `:176` 原样保留、13/13）；`trunk-events.test.ts` `doc.freeze` 既有合法/非法行套件原样（5/5）；`readConfirmedIntentEvidence`/`verifyReviewIntent`/`confirmsMigratedIntent` 旧 customer/chief 分支条件保留；旧 judge 结算未冻结记录不追溯补冻结（R-1/Q3 fail-closed；judge 分支要求真实 resolved 行与 `decisionId="decision-"+requestId`） |
| AC-J9 | **pass** | `isValidDocFreezeRecord` 仅 `src/model/version-change.ts:347` 一份；`versioned-doc-guard.ts` type-import/re-export 同一来源（`:43`），`classify-shell.ts:57` 直接 import 同一函数（`:730` 用于 baseline 冻结校验）；G2 断言 `isValidDocFreezeRecord === modelFreezeValidator`（门禁测试 `:335`）通过（23/23）；helper 单实现 grep 见 AC-J7 |
| AC-J10 | **pass** | 真实 Electron（worktree `app/main.ts`，SHA-256 `339fcfaa4d0daaf7b79fa8381743ce4ec2eb0f205bd9c5705cc4ac6f4d532bba`，launcher 动态 import 未改源码）+ **真实 claude 引擎适配器（非 demo）** + 真实桌面 UI（CDP 9223，页面 `app/renderer/dist/index.html`）。judge-on：`request.created` 真实 marker（`req-86b6b0640c4ba662`）→ 开关 ON（`checked:true`）→ `request.presented{to:"judge"}` → 真实 judge 模型会话（`governance-judge.started/evidence/approve`，14,490ms，`reasonCode:"sufficient"`，integrity complete）→ `request.resolved{by:"judge", operatorId:"judge:claude", decisionId:"decision-req-86b6…"}` → `finalizeIntentConfirmation` 成功 → R9 冻结 `intent-confirmed`/`origin:"judge-delegated"`、`applicationId:"intent-req-86b6…"`、`source` 与账本逐字段一致（24/24，含无 decidedBy/decisionId/actorRoleId、无 doc.freeze、frozenAt===source.at）→ `freeze-committed`、`freezePendingDiag:null`、UI 显示「判断代批」且无待恢复 → `readConfirmedIntentEvidence` **ok:true**（`d39b4b87…`）。**模型口径（§7-1）**：claude 引擎适配器真实运行（非 demo），后端模型 `deepseek-v4-flash`（`pre/env.txt` 与 native session `"model":"deepseek-v4-flash"` 实证）；本 B2 按项目既有术语（`RuntimeKind=claude` 即「Claude 引擎」；历史 RR2 亦将 deepseek 后端 + claude 适配器运行记为「真实 Claude」）判定该项 **pass**，并如实披露字面 Anthropic 模型解释的差异风险 |
| AC-J11 | **pass** | 第二隔离实例（独立 `userData2`/`target2`/CDP 9223）：开关 OFF（`checked:false`）→ 原卡 `request.presented{to:"customer"}` + 真实决策对话框（标题/选项 confirm/revise/意图正文与 marker，`dialog-pre.json`）→ 客户本人点卡 `request.resolved{by:"customer", operatorId:"51054", decisionId:"decision-req-9a03…"}` 且**无 judge 字段** → R9 冻结 `origin:"customer"`/`decidedBy:"customer"`/`source.customer-decision`（15/15，`8bc390d1…`）→ `readConfirmedIntentEvidence` ok:true（`68f7797d…`）；**judge 调用数 0**（诊断无 `governance-judge.*`）；行为与变更前 customer 路径一致 |
| AC-J12 | **pass** | 隔离：CDP 仅 **9223**；两腿各独立 `--userData`（`userData`/`userData2`）；仓库外独立目标根（`target`/`target2`）；预检 08:50:12Z：9222/9223 无监听（**如实偏差**：B1 预期的「9222 由贪吃蛇占用」当时不存在，贪吃蛇未运行；全程未启动/占用/关闭 9222）；9223 运行期监听、后检 08:53:30Z 无 LISTENING（仅 TIME_WAIT）且无 Electron 进程；贪吃蛇两运行根 **108/88 文件前后逐文件 SHA-256 清单 diff 均 0 字节**；预算：客户消息 1+1、卡 1+1、chief 回合 2、judge 会话 1、墙钟 34s/16s、开/关各一次（合计 2 次）、首果即停、不自动重试；git 前后仅允许的证据目录新增，`src app test` 零变化 |

### 3.3 测试矩阵 J1 – J17

| ID | 判定 | 依据/证据 |
| --- | --- | --- |
| J1 | **pass** | runtime-core J1/J2 用例：intent/proposal + judge source 正例接受、字段不重写、applicationId/cardKind/frozenAt 自洽（13/13） |
| J2 | **pass** | 同用例 29 类负例全 false 不抛错；G1 无长度上界（10,000/4,096 字符通过） |
| J3 | **pass** | version-change-service 16/16：`buildDocFreezeRecord` proposal/intent + judge（applicationId 合成、origin 正确）；VCA/version-upgrade/detail/amendment/stable + judge 全部拒绝（Q5） |
| J4 | **pass** | 编排 `:133` 真实账本 judge approve 冻结（含超长原值、重放/幂等、无客户字段、readConfirmedIntentEvidence ok）——42 pass 内实测通过 |
| J5 | **pass** | 编排 `:182` 负例全 `trunk-item-invalid`、零冻结、不抛错（无匹配行/judge null/outcome 不一致/operatorId 不符/decisionId 异常/directive 混入/actionSource 混入/selected 不一致/customer 形状遇 judge 行/回落族） |
| J6 | **pass** | customer intent 既有用例原样通过（编排 42 pass 含 `Retained intent confirmation…` 之外的 customer 用例；version-change-service 16/16） |
| J7 | **pass** | chief-delegated 既有用例原样通过（finalize/verify 分支条件保留；编排套件复跑） |
| J8 | **pass** | 编排 `:244`：judge D3 `prepareRoleActivation/activateRoleDocuments/prepareExecutionRun/prepareRoleDraftScope` 成功；`d3Source:"judge"`、authorization.decisionId=`decision-<requestId>`、无 actionSource；roster/targetRoleIds 校验保留；J15 包装层跨层正例 |
| J9 | **pass** | 编排 J9 负例全拒绝（审计缺失/null/operatorId/decisionId/actionSource/targetRoleIds/roster 戳）；runtime-core `isJudgeD3Resolution` 负例族 |
| J10 | **pass** | `readConfirmedIntentEvidence` ok（J15/RR 双腿）；`verifyReviewIntent` judge 分支 e2e（J15 真实 Git candidate → prepareReviewTask 成功）；旧记录不受影响（R3） |
| J11 | **pass** | 门禁 direct-role 23/23（judge 正例/负例、授权期望形状、baseline 冻结记录含 judge-delegated、G2 单实例）；git-shell-acl 39/39（active D3 judge 变体、既有 fixture 保留） |
| J12 | **pass** | decision-service 22/22（judge outcome 字段回归、开关关闭客户卡回落）；run-change-trigger `request.resolved` 映射用例（`by:"judge"`/operatorId/decisionId/judge/presented.to），文件计数与基线一致（10/1/9） |
| J13 | **pass** | 主权卡阻断：version-change-integration 客户主权用例通过；app/desktop diff=0（主权负例未放宽）；acceptance-judge-minimal/download-judge 等既有用例在 E3-F 全量中与参照同集合（无恶化） |
| J14 | **pass** | 编排 J5 内 declined/unavailable/revise/directive 负例；decision-service 开关关闭回落用例；无冻结 |
| J15 | **pass** | effectiveness 1/1：judge 代批 intent 冻结 → verifyReviewIntent → judge D3 经 Runtime 包装层激活 → pin/run；旧 customer/chief 链由既有 5 个 fixture 消费方回归（W-J5 §4.3） |
| J16 | **pass** | doc-freeze 2/2 内 J16：judge-delegated `doc.freeze` 真实账本 append/read 正例（intent+proposal）、8 类负例 fail-closed、旧 customer/application/role-direct/chief 行不变 |
| J17 | **pass** | doc-freeze 2/2 内 J17：无 source 的既有 VCA 冻结事件 JSON 逐字不变（无 actionSource 键）；judge source 如实镜像且通过 J16 校验 |

### 3.4 真实运行 RR-1 – RR-7

| ID | 判定 | 依据/证据 |
| --- | --- | --- |
| RR-1 | **pass** | 环境：真实 Electron（本 worktree `app/main.ts`，`repo_main_sha256=339fcfaa…`，launcher 隔离 userData 后动态 import）、claude 引擎适配器真实模型会话（非 demo）、真实桌面 UI；独立 `--userData`；CDP 仅 9223；仓库外目标根 `ans-judge-delegated-run-2026-11-09\target`/`target2`；候选 HEAD/聚合/manifest 记录在案（`pre/env.txt`）。**模型口径见 §7-1（deepseek-v4-flash 如实披露）** |
| RR-2 | **pass** | 开启腿行为原件齐备：`drive.jsonl`（250 行，import→ready→toggle ON→message→card→judge→freeze→halt）、`tasks-final.jsonl`（6 行，含 `by:"judge"`/`operatorId:"judge:claude"`/`decisionId`/judge 审计）、`versions-final.jsonl`（第 6 行 judge-delegated 冻结）、`summary.json`、`budget.json`、`verification/judge-on-freeze-field-verification.json`（24/24，`8ad81e0b…`）、`readConfirmedIntentEvidence.json`（ok:true）、UI 截图/正文（「判断代批」，无 pending）；首个决定性证据即 halt |
| RR-3 | **pass** | 关闭腿：`request.presented{to:"customer"}`、真实对话框原件、客户本人 `by:"customer"`+真实 `decisionId`、`origin:"customer"` 冻结（15/15）、judge 无结算；`readConfirmedIntentEvidence` ok:true；与变更前 customer 路径一致 |
| RR-4 | **pass** | 隔离证明：预检 9222/9223 无监听（偏差已披露）、后检 9223 无 LISTENING/无 Electron 残留、9222 不可达；贪吃蛇两运行根 108/88 文件前后哈希清单 diff 0 字节（`snake-run-root-diff-pre-vs-post.txt`/`snake-target-diff-pre-vs-post.txt` 均 0B）；运行只写仓库外运行根与允许的证据目录 |
| RR-5 | **pass** | 预算/纪律：每腿客户消息 1、`intent-confirm` 卡 1、chief 回合 1、judge 会话 1（on 腿）、墙钟 34s/16s（均 <20min）、开/关各 1 次（≤2）、首果即停、不自动重试；无非本变更卡/越界写/非预期调用 |
| RR-6 | **pass** | 证据与如实性：诊断/账本/冻结/快照/UI/驱动/端口进程/贪吃蛇快照/git 前后记录齐备；披露如实（deepseek 模型、9222 预检态、driver exit 13「`Browser.close` 后 unsettled top-level await」）；失败/回落未伪装成功；候选/manifest 前后逐字节一致（本次 `cmp` 复验） |
| RR-7 | **pass** | 两腿同一候选（同一 worktree main.ts、同一 25 文件候选、同一配置口径），pre/post manifest 与本次独立重建逐字节相同 |

### 3.5 证据与检查 EV1 – EV6

| ID | 判定 | 依据/证据 |
| --- | --- | --- |
| EV1 | **pass** | BASE-1–4：基线重取、候选 25 文件、写集外 diff=0、聚合/manifest 可复算（§1） |
| EV2 | **pass** | 模型/服务：J1–J5、G1/S1、R9 baseline 与账本对账（J4/J15/RR 24/24） |
| EV3 | **pass** | 编排/D3/门禁：J8–J11、J16/J17；helper 单实现 grep（定义 1/1，调用点逐处）；授权证据形状 |
| EV4 | **pass** | 桌面测试口径：J6/J7/J12/J13/J14 复跑与 E3-F 对照；before/after 计数与失败集合 diff；optional-acceptance 只读且口径精确复现 |
| EV5 | **pass** | 跨层/静态门：J15；`npm run typecheck` exit 0；旧断言改写逐条记录（W-J5 §7.2 单条；fixture 等价改写 2 处断言行，未弱化）；契约修订记录（W-J2 `:16`） |
| EV6 | **pass** | 真实运行：RR-1–7；预算/隔离/证据/如实性；9222 零改动与 9223 释放（§3.4） |

### 3.6 判定计数汇总

| 组 | pass | fail | insufficient | NA |
| --- | --- | --- | --- | --- |
| BASE-1..7 | 7 | 0 | 0 | 0 |
| AC-J1..J12 + AC-J7b | 13 | 0 | 0 | 0 |
| J1–J17 | 17 | 0 | 0 | 0 |
| RR-1..7 | 7 | 0 | 0 | 0 |
| EV1–EV6 | 6 | 0 | 0 | 0 |
| **合计** | **50** | **0** | **0** | **0** |

## 4. 真实运行原件独立抽查（B2 直接读取）

- `judge-on/tasks-final.jsonl`：`sha256:e3eacf98…`（与 RR 记录一致）；6 行恰为 created/notified×2/presented(to judge)/resolved/notified；resolved 行含 `by:"judge"`、`operatorId:"judge:claude"`、`decisionId:"decision-req-86b6b0640c4ba662"`、judge 审计（group decision/cardKind intent-confirm/engine claude/reasonCode sufficient/selected confirm，无 model）；**literal `"kind":"doc.freeze"` 计数 0**。
- `judge-on/versions-final.jsonl`：`sha256:1eb1dbd2…`；第 6 行为 `event:"frozen"`、`reason:"intent-confirmed"`、`origin:"judge-delegated"`、`applicationId:"intent-req-86b6b0640c4ba662"`、`source.kind:"judge-delegated"` 且含 requestId/engine/operatorId/reasonCode/reason/selected/cardKind/at、`snapshotRef`、`frozenAt:"2026-11-09T08:51:18.113Z"`（=== source.at）；**无 decidedBy/decisionId/actorRoleId**；另 5 行为迁移基线（migrated-legacy/application）。
- `judge-on/summary.json`（`6dca5853…`）：`toggle.checked:true`、`freezePendingDiag:null`、`stopCause:"freeze-committed-judge-delegated"`；`budget.json`（`6325922b…`）：customerMessages 1 / intentConfirmCards 1 / chief turns 1 / wallClockSec 34。
- `judge-off/tasks-final.jsonl`（`613bf5bf…`）：resolved `by:"customer"`/`operatorId:"51054"`/`decisionId:"decision-req-9a03…"`/无 judge；`versions-final.jsonl`（`22efc0af…`）：`origin:"customer"`/`decidedBy:"customer"`/`decisionId`/`source.customer-decision`；`summary.json`（`7c6520dd…`）：`toggle.checked:false`、`judgeEvents:[]`、`stopCause:"freeze-committed-customer"`；`dialog-pre.json` 为真实客户对话框（confirm/revise + 完整意图正文 + marker，`judgeNotice:null`）。
- 端口/进程（`pre/ports-process.txt` `8c2f5526…`、`post/ports-process.txt` `ddf12378…`）：预检 9222/9223 无监听、无 Electron；后检 9223 仅 TIME_WAIT、9222 不可达、无 Electron。
- 快照字节：`s-intent-b6d7…json` 7,563 bytes / `3c9a9a01…`，内嵌意图文件与盘面逐字节一致（`byteIdentical:true`）；离线只读复核 `readConfirmedIntentEvidence` 两腿均 ok:true。

## 5. 语义与回归复核（实现 vs B1 逐点）

- **W-J1（model）**：`DocFreezeOrigin` 追加 `"judge-delegated"`；`DOC_FREEZE_JUDGE_DELEGATED_REASONS` 恰两值；`JudgeDelegatedSource`/`isJudgeDelegatedSource`（无长度上界、source 级禁客户字段，附加更严守卫）；`DocFreezeSource`/`DocFreezeRecord.source` 放宽；`isValidDocFreezeRecord` judge 分支（reason 子集、cardKind↔reason、applicationId=prefix-requestId、frozenAt===at、无客户字段）；`requestResolvedD3DecisionId`/`isJudgeD3Resolution`（customer/judge→decisionId、chief→requestId、fail-closed 不抛错）；`DocFreezeEvent.origin`/`actionSource` 扩展。与 §0.2-4 允许清单逐项一致，无额外契约。
- **W-J2（编排）**：`finalizeIntentConfirmation` 新增 judge 分支（账本重放构造、outcome/resolved 对账、G1 原值复制、幂等 old-record 分支原样）；`verifyReviewIntent` judge 分支（source→requestId、applicationId、逐字段 `judgeIntentAuditMatchesSource`）；`confirmsMigratedIntent` judge 分支（`judgeIntentSourceMatches`）；两处二次来源筛选；`prepareRoleActivation/prepareExecutionRun/prepareRoleDraftScope` 来源判定与参考值走共享 helper（customer/chief 条件保留）；`freeze-service` judged 分支（Q5 拒绝、显式构造、applicationId 按 requestId、无客户字段）；`task-state` `doc.freeze` judge 防御分支（reason/源/字段/applicationId/cardKind/at）；`freezeEvents` source 镜像（additive、既有字节不变）。
- **W-J3（门禁）**：`classify-shell` active D3 `judge` 来源经 `isJudgeD3Resolution`、`d3DecisionId` 经 `requestResolvedD3DecisionId`；customer/chief 条件逐字保留；baseline 冻结校验继续用 Model 同一 `isValidDocFreezeRecord`（无第二份判定）。
- **W-J2b（nominator）**：`d3-by` 接受集单行加入 `"judge"`；`nominatorRoleDocumentsFacts` 的 `d3By` 如实为 `"judge"`；其它事实/错误码不变。**H1 delta=0**：不改角色职责/边界/团队计划归属，无新增角色。
- **旧路径不变**：customer（`by:"customer"`+decidedBy+decisionId+source.customer-decision）、chief-delegated（actionSource/requestId/无客户字段/actorRoleId chief）、application、role-direct 的字段/校验/错误码在 diff 中逐字保留（仅来源集合追加 judge）。`request.resolved`/`CustomerInputOutcome` 形状不变（无新 `by` 值/actionSource/IPC）。**未静默放宽**：唯一旧断言改写为 W-J5 §7.2 逐条记录的 A.4-1 改写（旧缺口负例→包装层成功正例，理由/证据行齐备）；fixture 两处 `assert.ok(recordTaskObservation(...))` 等价改写为 judge/customer 条件展开，断言未删除/未弱化（diff 实证）。

## 6. 证据质量与时间线

- **manifest 可复算**：D1 342/342、RR 126/126、E3-F 680/680 全命中（§2.4）；RR pre/post manifest 与本次独立重建逐字节相同。
- **mtime 时间线**（本地 UTC+8）：提案卡修复提交 `fb1aa39` **13:23:13**（先于实现）→ judge 实现文件 **13:52–15:57**（W-J1 13:52–13:55、W-J2 14:05、W-J3 14:02、W-J2b 15:33、W-J5 15:57）→ D1 记录 **16:41**、RR 记录 **16:56**（RR 运行 16:50–16:54）、E3-F 记录 **17:52**（运行 17:00–17:35）、E3-B **17:55**；本次 B2 于 18:05 后独立复核，`src/test/角色卡/测试/docs/scheduling/docs/acceptance` 下无晚于 17:56 的文件 ⇒ **证据均为实现后生成、验收前落盘，无 B2 期间补造**；修复先于实现、串行次序成立。
- **无伪造/后补迹象**：D1/RR/E3-F 记录的内部计数、哈希、隔离复跑原件互相对账一致；RR 披露与原件一致（deepseek 模型、9222 预检态、driver exit 13、budget.json 仅计 chief 回合而 judge 会话由诊断/摘要单列）；E3-F 参照口径差异如实并列两文档（`5cba2d54…`/`41a4a215…` 哈希均实测命中）；4 条新增失败逐条分类并留存隔离复跑。

## 7. 限制与披露

1. **AC-J10-1「真实 Claude（非 demo）」判定口径（重要）**：RR 使用产品 `claude` 引擎适配器（`RuntimeKind="claude"`、真实 Claude Code CLI 会话与 MCP 协议、非 demo），但 `.env` 后端模型为 **`deepseek-v4-flash`**（经 `ANTHROPIC_BASE_URL` 代理；native session 实录 `"model":"deepseek-v4-flash"`），**不是 Anthropic 模型**；judge 审计如实只含 `engine:"claude"`、无 `model` 字段。本 B2 按项目既有术语（引擎级：真实 claude 适配器、非 demo；历史 RR2 亦将同类配置记为「真实 Claude worker」）判定 **pass**。**若标准所有者按字面 Anthropic 模型解释**，则该子项证据不满足，应改判 AC-J10/RR-1/EV6 为 `insufficient evidence` 并以真实 Anthropic 模型重跑 RR——本报告如实标注，交协调方/客户复核，不做隐瞒。
2. **9222 预检态偏差**：B1 预期「9222 由贪吃蛇占用」，实测预检时点 9222/9223 均无监听（贪吃蛇未运行）；RR 未启动/占用/触碰 9222，贪吃蛇两运行根 108/88 文件前后哈希全等。隔离结论不依赖 9222 是否在听。
3. **驱动退出码 13**：两腿 driver 在 `finalize` 内 `Browser.close` 后 unsettled top-level await 导致 exit 13；停表/截图/账本/诊断/快照/复制与 `summary.json` 均已在此之前完成，9223 已释放，属驱动收尾记录，不影响取证；未自动重试。
4. **E3-F 参照口径差异**：任务给定 `5cba2d54…` 实为 `2026-11-08_E3-T3-full-regression.md`（4,979/4,750/196/1/32、520 文件）；5,032/4,807/192/1/32 与 540 文件清单来自 `2026-11-08_E3-F_remove-predictive-gates.md`（`41a4a215…`）。E3-F 已并列披露、不混用；本 B2 复算两文件哈希均命中。
5. **既有红项（非本变更、未修复、未弱化）**：runtime-core 33（含 `doc-freeze reason 九类…` 基线 `10 !== 9` 的陈旧断言，原样保留）、编排 22 fail/2 skip（含 `Retained intent confirmation…`）、门禁 5 fail/1 skip、桌面四文件 26、optional-acceptance 6/2/1/3/0；均与参照/D1 同名同集合，未恶化。E3-F 全量 4 条新增失败为环境性（chief-workflow ENOTEMPTY 抖动 ×3、run-stop e2e Node 原生 teardown 崩溃 ×1），同候选隔离复跑排除，**新增确定性失败 0、新 skip 0**。
6. **F7 / R-4 信任边界**：`task-state.ts` 对 `request.resolved.judge` 未新增结构强校验（本轮有意不收紧以避免追溯拒绝）；补偿为冻结/授权路径的账本重放逐字段核对；本报告不宣称账本层已强校验。
7. **BASE-2 协调记录形态**：本变更无独立 `docs/scheduling/*dispatch-log*` 文件；调度/协调记录为团队计划（含 W-J2b amendment 批准行）与双方方案 §10.1 的勘误知会条目（互证件见 §3.1 BASE-2）。
8. **真实运行范围**：未触发「下一真实门」（pin/handoff/发布）；以下游只读复核 `readConfirmedIntentEvidence` ok:true 作「冻结可被下游消费」证据（AC-J10-3 允许口径）；不宣称完整闭环/长期稳定性/发布。`budget.json` 的 `modelTurnsByRole` 仅计 chief（1），judge 模型会话 1（14.49s）由诊断与摘要单列。
9. **`test/测试` 计数口径**：D1 的 effectiveness「进程未退出」未在 E3-F/本次 B2 复现（均自然 exit 0）；D1 的 9/8/1 raw 与 E3-F 的 8/7/1 差异均为文件级合成条目（真实用例全过），按 BASE-3 归一化处理，未计新增确定性失败。
10. **证据层级独立性**：D1/RR/E3-F 由「测试」角色取证，E3-B 由统筹记录；本 B2 由独立验收上下文执行并独立复跑关键套件（§2），非仅采信报告。
11. 本报告只覆盖本变更与所列候选/环境；不判方案质量；不覆盖提案卡修复、文档格式或其它在飞变更；不授权发布/tag；合并需客户逐 PR 明确「允许我合并」。

## 8. 总判定

- **pass**：50/50 条目（BASE-1..7、AC-J1..J12 + AC-J7b、J1–J17、RR-1..7、EV1–EV6）均通过；候选/聚合/manifest 独立复算一致；确定性复跑与 E3-F 全量计数一致且新增确定性失败 0、新 skip 0；真实运行开/关两腿原件齐备、字段级核对成立；旧路径逐字不变、Q5 主权与回落不变、G1 不截断、契约修订显式记录、无越界/伪造/求绿证据。
- 随附 §7 限制与披露（尤其 AC-J10-1 的模型口径、9222 预检偏差、既有红项）；本 B2 **不授权发布/tag**；合并需客户逐 PR 明确「允许我合并」。

## 9. 证据索引（关键路径）

| 路径 | 内容 |
| --- | --- |
| `docs/acceptance/2026-11-09_judge-delegated-decision-effectiveness-criteria-v1.md` | 唯一判据 B1 v1.1（`4cbb5df2…`） |
| `docs/scheduling/2026-11-09_change-package_judge-delegated-decision-effectiveness.md` | E3-B（`7edad9f…`） |
| `docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md` / `…_review_…` / `docs/scheduling/2026-11-09_team-plan_…` | 方案/复核/团队计划（`1477a6e4…`/`de1d0281…`/`9b61a484…`） |
| `角色卡/测试/docs/change/2026-11-09_D1_judge-delegated-effectiveness.md`（+ 证据目录 342 条目） | D1 组合确定性（`d7c16852…`） |
| `角色卡/测试/docs/change/2026-11-09_RR_judge-delegated-effectiveness.md`（+ 证据目录 126 条目） | RR 真实运行（`22cc60f3…`；manifest `87bd82fb…`） |
| `角色卡/测试/docs/change/2026-11-09_E3-F_judge-delegated-effectiveness.md`（+ 证据目录 680 条目） | E3-F 全量 T3（`8dc4a091…`；manifest `96a2d4bd…`） |
| `角色卡/{运行时核心,编排,门禁引擎,桌面窗口,测试,nominator-code}/docs/change/2026-11-09_WJ*` | 六批实施证据（`72848a5b…`/`70f0f62a…`/`221b3199…`/`1a4926ef…`/`c811d518…`/`c2defed0…`） |
| RR 证据关键原件 | `judge-on/{tasks-final,versions-final,summary,budget,drive}`（`e3eacf98…`/`1eb1dbd2…`/`6dca5853…`/`6325922b…`/`78d0e4bd…`）；`judge-off/{tasks-final,versions-final,summary,budget,drive}`（`613bf5bf…`/`22efc0af…`/`7c6520dd…`/`842e794f…`/`5337d29b…`）；`verification/judge-on-freeze-field-verification.json`（`8ad81e0b…`）、`judge-off-freeze-field-verification.json`（`8bc390d1…`）、两腿 `readConfirmedIntentEvidence.json`（`d39b4b87…`/`68f7797d…`）；`pre/post` 端口（`8c2f5526…`/`ddf12378…`）与贪吃蛇 diff（0B） |

---

- 本报告由 ANS 独立验收（Independent Acceptance）按 B1 v1.1 于 2026-11-09 出具；仅写本文件；未修改任何源码/测试/角色卡/方案/其它文档；未提交/推送/合并/发布；未占用 9222；未运行真实模型/Electron/CDP。报告行数/字节/SHA-256 于写盘后计算并在交付回报中给出。
