# 变更记录：E3-F 终验——全量 T3 回归 + typecheck（judge 代批生效，2026-11-09）

- 任务节点：**E3-F 终验执行**（团队计划 `docs/scheduling/2026-11-09_team-plan_judge-delegated-decision-effectiveness.md` §四/§五；B1 v1.1 §1 BASE-3/BASE-4/BASE-5、§6 EV1）
- 角色：测试（`roleId: 测试`，独立验证上下文；**只取证，不判验收**）
- 日期：2026-11-09（本地 16:58 起；权威 T3 运行 START/END 见 §5.1）
- 工作区：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree；分支 `feat/plan-escalation-card`）
- 证据目录：`角色卡/测试/docs/change/2026-11-09_E3-F_judge-delegated-effectiveness-evidence/`
- 纪律：只读 `src/** app/** test/**`；**未修改任何产品/测试源码**（候选/manifest/status 运行前后逐行 diff 0）；未 commit / push / stash / merge / 发布；未运行真实模型/Electron/CDP；未占用 9222；未删除测试/放宽断言/加 skip；**全程未使用 `--test-force-exit`/`--test-timeout`**。

## 0. 结论摘要（事实，先读）

1. **候选冻结成立**：HEAD `fb1aa39e…`（tree `ee33c3e9…`）/ 分支 `feat/plan-escalation-card`；`git status --porcelain -- src app test` 恰 **25 项**（11 src M + 12 test M + 2 新测试文件，0 删除）；逐文件 raw SHA-256 聚合 **`9eb21d3b60dd7c384420e5f122939d835a3d9b4669f6a169622752f746ed6919`**（= D1 期望，逐行 diff 0）；`src app test` manifest **1,107 文件 / `2468fc59c957af88874cdb7d87f449b81ad5fcff70f497dd784454ff6cdfe108`**（= D1/RR 同值）；运行前/中/后三次快照逐字节相同（diff 0 行）；`app/desktop` diff = 0。
2. **测试文件枚举**：**547** 个 `test/**/*.test.ts`；对参照 540 文件清单：**新增 7、删除 0**——本变更新增 2（judge doc-freeze/effectiveness）+ 参照运行后 HEAD 基线新增 5（git-action/git-run-stop e2e，均 HEAD tracked、非本变更 delta）。
3. **权威 T3 运行（一次，隔离）**：547 文件逐文件独立进程 `timeout -k 5 <TO> node --test --test-concurrency=1 <file>`（09:00:14Z–09:34:50Z，墙钟 34m36s）；**541 个自然完成文件 + 6 个登记挂起文件（90s watchdog，不计通过）**；无未登记 watchdog、无 no-summary、无解析异常；退出码分布 469×0 / 72×1 / 6×124。**未使用 `--test-force-exit`/`--test-timeout`**。
4. **计数（自然完成 541 文件）**：**5,075 tests / 4,845 pass / 197 fail / 1 cancelled / 32 skipped / 0 todo**。
   - 参照 E3-F（540 文件、5,032/4,807/192/1/32）多重集对照：参照受信任失败对 192；本轮 196（实际 fail 197）；**新增失败 4、既有失败消失 0、新增 skip 0、既有 skip 消失 0**（31 条打印 skip 名逐条一致）。
   - 4 条新增失败**全部环境性/非确定性**（分类与隔离复跑见 §6/§9）：3 条 `chief-workflow` ENOTEMPTY 清理竞态（隔离复跑失败集合再次漂移）+ 1 条 `git-run-stop-host-continuation-e2e` Node 原生 `CleanupQueue::Add` 崩溃文件级条目（隔离复跑 1/1 自然通过 43.7s）⇒ **新增确定性失败 = 0、新 skip = 0**。
   - 本变更新增测试：2 个新文件 **3/3 pass**（doc-freeze 2/2、effectiveness 1/1 自然 65.4s）；13 个既有测试文件内新增 **35 用例全部 pass**（其中本变更 judge 新增 20、HEAD 基线差 15〔提案卡 A′ 5 + 中间提交 10〕）。
5. **受写集影响套件（对 D1/各批基线）**：runtime-core **540/503/33/4**（失败标题集合 diff 0）；编排 **1133/1109/22/2**（diff 0）；门禁引擎 **453/447/5/1**（diff 0）；桌面四文件 **61/35/26/0**（diff 0）；nominator **27/27**；test-role 7 文件 raw 8/7/1（唯一 fail 为 run-stop e2e 原生崩溃文件级条目，隔离复跑 1/1；归一化 7/7 pass）——全部与 D1 基线相符（除该环境性条目，见 §9）。
6. **静态门**：`npm run typecheck`（`tsc --noEmit`）**exit 0**；`typecheck:renderer`/`build:renderer` **N/A**（候选 25 文件无 `app/**`；`app/renderer` 与 `app/main.ts` diff 0；`tsconfig.json` exclude `app/renderer`——见 `typecheck/renderer-na-basis.log`）。
7. **稳定性**：运行前/中/后 write-set 聚合、manifest、scope status **逐行 diff 0**；HEAD/tree/分支/暂存不变；候选全程冻结，测试运行未在 `src app test` 产生任何副作用文件。
8. 本记录**只取证、不判验收**；未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222。

## 1. 输入与依据（只读）

| 输入 | 实测 SHA-256 |
| --- | --- |
| 团队计划 | `docs/scheduling/2026-11-09_team-plan_judge-delegated-decision-effectiveness.md` `9b61a48460a00fb25f2587edba441d73082a93ecc0f50b7dec83c1c214a8b219` |
| 方案 P1.2 | `docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md` `1477a6e423a74a7007824b7db82cac4e0f6dbb9e48abaa60a7f452704672e6be` |
| B1 v1.1 | `docs/acceptance/2026-11-09_judge-delegated-decision-effectiveness-criteria-v1.md` `4cbb5df2507c2b30d43b37707cba305490ca8f8fc365b65e25a18f99b3693543` |
| D1（本变更组合） | `角色卡/测试/docs/change/2026-11-09_D1_judge-delegated-effectiveness.md` `d7c16852684140fcc0dbe912e93d71adb51727a124f1106c793c2ee1ef1c2e64` |
| RR（真实运行） | `角色卡/测试/docs/change/2026-11-09_RR_judge-delegated-effectiveness.md` `22cc60f30119937747f55c182613f629a7775375b4f9699a9618cfc7ad6f02fe` |
| 参照 E3（T3 方法） | `角色卡/测试/docs/change/2026-11-08_E3-T3-full-regression.md` `5cba2d548b31f83c7966d3276ebe979c42329aa3c3904d66572ff2ec923dab33`（4,979/4,750/196/1/32、520 文件） |
| 全量参照 E3-F（540 文件/5,032/4,807/192/1/32） | `角色卡/测试/docs/change/2026-11-08_E3-F_remove-predictive-gates.md` `41a4a2154b1cc8d8fa791a0bfb8fbcbbe95ba5d1cbe6eb375d15346a8b49a852`；证据 `2026-11-08_E3-F_evidence/`（文件清单 `20-all-test-files.txt`、失败/skip 集 `40-comparison/`） |
| 批次证据（只读消费，SHA-256 实测一致） | W-J1 `72848a5b…`、W-J2 `70f0f62a…`、W-J3 `221b3199…`、W-J4 `1a4926ef…`、W-J5 `c811d518…`（含 §7 amendment）、W-J2b `c2defed0…` |

口径说明：任务给定「参照 E3 `5cba2d54…`；5,032/4,807/192/1/32」。实测 `5cba2d54…` 为 `2026-11-08_E3-T3-full-regression.md`（4,979/4,750/196/1/32、520 文件）；**5,032/4,807/192/1/32 与 540 文件清单**来自其后继全量运行 `2026-11-08_E3-F_remove-predictive-gates.md`（`41a4a215…`）。本记录以**后者（540 文件清单 + 5,032/4,807/192/1/32）**作为全量多重集参照，并以 D1/各批基线作受写集影响套件的精确对照；两者均如实列出，不混用。

## 2. 候选冻结与身份（BASE-4/BASE-5）

### 2.1 HEAD / 分支 / scope

- HEAD **`fb1aa39e787934f334b9c164e4221074f97f6147`**；tree `ee33c3e95d9b3fb61dc5d05eea66c2d0a2eb9583`；父 `c1439ce57430ef783b80a01bb6e6437fcb20cabd`；分支 `feat/plan-escalation-card`；暂存 0（`00-opening-state.log`）。
- `git status --porcelain -- src app test`（`candidate/status-src-app-test.txt`）：**恰 25 项 = 11 `src/**` M + 12 `test/**` M + 2 `test/测试/**` 新文件（`??`）**，无删除/重命名/写集外条目；与 D1 组合候选的 25 文件路径集合相同。
- `git status --porcelain -- app` = **0 行**（`candidate/status-app.txt`）；`git diff --stat -- app/desktop` = **0 行**（`candidate/app-desktop-diffstat.txt`）⇒ `app/desktop` 产品 diff = 0。
- T1/其它变更证据不混入（`candidate/t1-files-check.txt`）：T1 三文件均不在 25 文件写集——`src/common/claude-adapter/schema.ts` 与 `test/claude-adapter/schema.test.ts` raw SHA-256 与参照 E3-F T1 记录一致（`afe70c62…`/`358ac967…`），`test/claude-adapter/session.test.ts` 因中间提交 `6ab0d2d` 的 HEAD 基线内容变化而为 `6379bc8e…`（`git hash-object` = HEAD blob，无工作树改动）；三者均不属本候选。

### 2.2 逐文件 raw SHA-256 与 canonical 聚合

- 逐文件 raw SHA-256：`candidate/write-set-actual.tsv`（25 行，`sha256  path`，按路径排序）。
- 定义（与 D1 相同的 canonical 口径）：25 行 `sha256  path` 文本（两空格、LF、按路径字节序 `LC_ALL=C sort -k2`）取 SHA-256。
- **actual = D1 expected = `9eb21d3b60dd7c384420e5f122939d835a3d9b4669f6a169622752f746ed6919`**（`candidate/write-set-canonical-aggregate.txt`；与 `candidate/write-set-expected-d1.tsv` 逐行 `diff` **0 行**）。
- numstat：23 个 M 文件 +1318/−82；2 个新文件 99/299 行（`candidate/write-set-numstat.tsv`，D1 一致）。

### 2.3 `src app test` manifest

- 口径：`git ls-files --cached --others --exclude-standard -- src app test`（非忽略），逐文件 `sha256sum`，按路径排序后成 manifest。
- **1,107 条目**（tracked at HEAD 1,105 + untracked 2）；聚合 **`2468fc59c957af88874cdb7d87f449b81ad5fcff70f497dd784454ff6cdfe108`**（`candidate/manifest-src-app-test.tsv`、`candidate/manifest-canonical-aggregate.txt`、`candidate/manifest-counts.txt`）——与 D1/RR 同值。

### 2.4 运行前 / 中 / 后冻结

| 时点 | write-set 聚合 | manifest |
| --- | --- | --- |
| 运行前（16:58） | `9eb21d3b…` | 1,107 / `2468fc59…` |
| 运行中（`candidate/recheck-midrun/`，158 文件后） | `9eb21d3b…`（diff 0 行） | 1,107 / `2468fc59…`（diff 0 行） |
| 运行后（`candidate/recheck-final/`） | `9eb21d3b…`（diff 0 行） | 1,107 / `2468fc59…`（diff 0 行） |

- 收工复核（`50-final-recheck.sh` 输出）：HEAD/tree/分支不变；status 25 行且与开工逐行相同（diff 0）；`app` status 0 行、`app/desktop` diffstat 0 行。
- 并发如实记录：全仓 `git status --porcelain` 开工 vs 收工 diff 仅 2 行新增——本记录 `?? 角色卡/测试/docs/change/2026-11-09_E3-F_judge-delegated-effectiveness.md`（允许写区）与**非本任务产生**的并发未跟踪文件 `?? docs/acceptance/2026-11-09_team-plan-run-binding-criteria-v1.md`（mtime 17:03:43，推测为同 worktree 其它会话；不在 `src app test`，不影响候选/manifest/套件结果）。

## 3. 测试文件枚举

- 当前 `test/**/*.test.ts`：**547**（`20-all-test-files.txt`；与 `find test -name '*.test.ts'` 逐一相同，排序无重复）。
- 对参照 540 文件清单（`2026-11-08_E3-F_evidence/20-all-test-files.txt`）：**新增 7、删除 0**（`21-test-file-diff-vs-E3F.txt`）。新增构成：
  - **本变更新增（2）**：`test/测试/2026-11-09_judge-delegated-doc-freeze.test.ts`、`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（工作区 `??`；W-J5）。
  - **参照运行后 HEAD 基线新增（5，非本变更 delta）**：`test/测试/git-action-activation-e2e.test.ts`、`git-action-commit-claude-e2e.test.ts`、`git-action-commit-pi-e2e.test.ts`、`git-action-delivery-claude-e2e.test.ts`、`git-run-stop-host-continuation-e2e.test.ts`（均在 HEAD tracked；由上一变更提交 `29c0e15`〔删除预知式门控，2026-11-08 22:01〕在参照 E3-F 运行〔19:30–20:09〕之后纳入提交，属 HEAD 基线，非本变更写集）。

## 4. 环境与方法

- OS Windows 11 Pro 10.0.26300（MINGW64）/ Node **v24.22.1** / npm 11.19.1 / Git 2.55.0.windows.5。
- **逐文件独立进程自然运行**：`timeout -k 5 <TO> node --test --test-concurrency=1 <file>`（`run/run-e3f-per-file.sh`；与参照 E3/E3-F 同一方法）。每文件记录 TO/force/exit/killed/summary/tests/pass/fail/cancelled/skipped/todo/duration/wall（`31-t3-per-file-results.tsv`）。
- watchdog：**6 个登记挂起文件 90s**（沿用参照名单：`test/pi-adapter/write-sequencing.test.ts`、`test/测试/customer-authorization-plane-integration.test.ts`、`test/桌面应用/directive-decision.test.ts`、`test/桌面应用/optional-acceptance.test.ts`、`test/桌面应用/session-rebuild-race.test.ts`、`test/桌面应用/stuck-redispatch.test.ts`）；其余 300s。**未使用 `--test-force-exit`/`--test-timeout`**（force 列全 0）。
- 运行隔离：权威运行期间无其它测试进程（开工仅 1 个既有 Codex artifact host-daemon node 进程，非测试）；manifest/write-set 运行中快照各一次（§2.4）。
- 失败/skip 解析沿用参照 `40-compare-vs-ref.sh` 口径（末段 `✖ failing tests:` 的 `test at <loc>` + `✖ <name>` 配对；路径 `/`、去行号列号/耗时；skips 取 `﹣ … # SKIP`）。
- 日志：`logs/`（547 个逐文件原始日志）。

## 5. 权威运行结果

### 5.1 运行窗口与状态分布

- START `2026-11-09T09:00:14Z` → DONE `2026-11-09T09:34:50Z`（墙钟 **34m36s**；`run/run-start.txt`、`31-t3-progress.log`）。
- 状态分布：**natural-exit 541 / registered-hang-timeout 6**；`watchdog-killed`（未登记）= **0**；`natural-exit-no-summary` = **0**（`compare/status-counts.tsv`、`compare/anomalies.txt` 为空、`compare/parse-not-ok-files.tsv` 为空）。
- 退出码分布：**469 × exit 0 / 72 × exit 1 / 6 × exit 124**（124 均为登记的 90s 档；`timeout -k 5` 语义 = 到时先 SIGTERM、5s 后 SIGKILL；全部 6 个均在 SIGTERM 后退出，`killed=1` 仅由 exit=124 标记，未另记信号名）。

### 5.2 计数（自然完成 541 文件）

| 范围 | 文件 | tests | pass | fail | cancelled | skipped | todo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 参照同路径既有文件（natural） | 534 | 5,067 | 4,838 | 196 | 1 | 32 | 0 |
| HEAD 基线新增文件（5，非本变更） | 5 | 5 | 4 | 1 | 0 | 0 | 0 |
| 本变更新增文件（2） | 2 | 3 | 3 | 0 | 0 | 0 | 0 |
| **本次权威合计** | **541** | **5,075** | **4,845** | **197** | **1** | **32** | **0** |
| 未计入：6 个登记挂起（90s watchdog） | 6 | —（部分 summary 见 §5.4） | | | | | |

- 原始来源：`compare/counted-files.tsv`、`compare/per-file-validation.tsv`、`compare/aggregate-by-origin.tsv`；对账详见 `compare/count-reconciliation-vs-ref.md`。
- 按目录：`compare/aggregate-by-dir.tsv`（runtime-core 59 文件 540/503/33/4；编排 107 文件 1133/1109/22/2；门禁引擎 41 文件 453/447/5/1；桌面应用 55 自然 643/559/84；`test/测试` 直属 55 自然文件 326/279/29/0/18；其余与参照同）。
- cancelled 1 = `test/测试/turn-watch-verify/b-last-resort.test.ts`（3/2/0/1，`test timed out after 10000ms`；与参照同口径）。

### 5.3 长耗时文件（均自然退出，无 watchdog）

| 文件 | tests/pass/fail/skip | 用时 |
| --- | --- | --- |
| `test/测试/git-role-workflows-e2e.test.ts` | 19/7/0（12 skip） | 212.5s（参照 195.3s） |
| `test/测试/git-action-delivery-claude-e2e.test.ts` | 1/1/0 | 97.5s |
| `test/编排/git-shell-acl.test.ts` | 39/39/0 | 88.6s |
| `test/桌面应用/chief-workflow.test.ts` | 63/48/15 | 71.6s |
| `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` | 1/1/0 | 65.4s |
| `test/编排/git-trunk-store.test.ts` | 13/13/0 | 65.5s |
| `test/测试/git-action-commit-claude-e2e.test.ts` | 1/1/0 | 54.2s |
| `test/测试/git-action-commit-pi-e2e.test.ts` | 1/1/0 | 49.8s |
| `test/测试/git-action-activation-e2e.test.ts` | 1/1/0 | 44.9s |
| `test/编排/git-capabilities.test.ts` | 15/12/1（2 skip） | 12.0s |

### 5.4 登记挂起文件（90s watchdog，不计通过；部分 summary 与参照逐项相同）

| 文件 | 部分 summary（tests/pass/fail） | 参照 |
| --- | --- | --- |
| `test/pi-adapter/write-sequencing.test.ts` | 4/3/1 | 4/3/1 |
| `test/桌面应用/directive-decision.test.ts` | 1/0/1 | 1/0/1 |
| `test/桌面应用/optional-acceptance.test.ts` | 3/2/1 | 3/2/1 |
| `test/桌面应用/session-rebuild-race.test.ts` | 17/14/3 | 17/14/3 |
| `test/桌面应用/stuck-redispatch.test.ts` | 7/4/3 | 7/4/3 |
| `test/测试/customer-authorization-plane-integration.test.ts` | 1/0/1 | 1/0/1 |

（B1 BASE-3 的 optional-acceptance 6/2/1/3/0 为 BASE-3 命令口径；本 E3-F 按参照挂起口径记录其 90s 部分 summary，不计入合计。`test/桌面应用/stuck-redispatch-safety.test.ts` 为另一独立文件，本轮 5/5 自然通过。）

## 6. 与参照 E3-F（540 文件）的逐条对照

### 6.1 失败/skip 多重集（文件 + 测试名）

| 指标 | 值 |
| --- | --- |
| 参照受信任失败对 / 实际 fail | 192 / 192 |
| 本轮受信任失败对 / 实际 fail | 196 / 197（chief-workflow fail 15/配对 13；turn-watch cancelled 1 计入配对——参照同解析口径） |
| **新增失败** | **4**（逐条分类见 §6.2） |
| **既有失败消失** | **0** |
| **新增 skip / 既有 skip 消失** | **0 / 0**（31 条打印 skip 名多重集逐条一致；总数 32 = 参照同口径，第 32 条为源内未打印 skip） |
| cancelled | 1（`turn-watch-verify/b-last-resort`，与参照同） |

机器结果：`compare/summary.txt`、`compare/new-failures.tsv`、`compare/missing-failures.tsv`（空）、`compare/new-skips.txt`/`missing-skips.txt`（空）、`compare/ours-failures-trusted.sorted.tsv`、`compare/ours-skips-trusted.sorted.txt`。

### 6.2 新增失败 4 条（全部环境性/非确定性；分类原文见 `compare/new-and-missing-failures-classification.md`）

| # | 文件 | 测试名 | 类别与处置 |
| --- | --- | --- | --- |
| 1 | `test/桌面应用/chief-workflow.test.ts` | W47 默认Core/Codex本地HTTP：忙Chief独立select释放真实卡调用 | `ENOTEMPTY` fixture 清理竞态（非产品断言）；同候选隔离复跑失败集合再次漂移（`isolated/runs/chief-workflow-rerun-1/`：63/51/12，W20/revise/unmanaged 转绿、commit-race 转红）⇒ 非确定性 |
| 2 | 同上 | W47 …revise… | 同上（主跑 ENOTEMPTY；复跑通过） |
| 3 | 同上 | selected | 同上（主跑 ENOTEMPTY；复跑仍红，集合漂移） |
| 4 | `test/测试/git-run-stop-host-continuation-e2e.test.ts`（HEAD 基线文件） | 文件级合成条目（path） | Node v24.22.1 原生 `CleanupQueue::Add` 断言崩溃（`src\cleanup_queue-inl.h:24`；非测试断言）；隔离复跑 **1/1 自然通过 43.7s**（`isolated/runs/run-stop-e2e-rerun-1/`）⇒ 非确定性原生崩溃 |

⇒ **新增确定性失败 = 0**。4 条均可归入参照/各批已登记的非确定性族（ENOTEMPTY 清理竞态；Node 原生 teardown 崩溃），且同候选隔离复跑通过/集合漂移。

### 6.3 计数差（同路径 13 文件，+35 tests）

逐文件表见 `compare/count-deltas-vs-ref.tsv` 与 `compare/count-reconciliation-vs-ref.md`；归因（精确拆分，合计 +35）：
- **本变更 judge 新增用例：+20**（11 个写集内既有测试文件）：runtime-core direct-role +2、version-change-contract +3、编排 direct-role +3、task-state +1、trunk-events +1、version-change-service +1、门禁 direct-role +1、git-shell-acl +3、decision-service +2、run-change-trigger +1、nominator-module +2。
- **HEAD 基线差（参照运行后中间提交产生，非本变更）：+15**：编排 direct-role 提案卡修复 A′ +5（`fb1aa39`）、claude-adapter/session +6（`6ab0d2d`）、chief-workflow +4（`fb1aa39`）。
- **新增文件：+8**（2 change-new + 5 baseline-added = 7 文件）。
- 总计 **+43 tests / +38 pass / +5 fail**（+4 chief-workflow 波动族、+1 run-stop 原生崩溃）；skip 不变。

### 6.4 既有失败消失 = 0；转绿 = 0（相对参照）

参照 192 条受信任失败对在本轮全部复现（`missing-failures.tsv` 为空）；无“既有失败消失/转绿”需逐条分类。

## 7. 与 D1 / 各批基线的套件对照

同一候选（D1 组合 = 本 E3-F 候选）上的精确对照（`run/41-compare-suites-vs-d1.sh` → `compare/suites-vs-d1/`）：

| 套件 | 文件 | 本轮（tests/pass/fail/canc/skip） | D1 / 批基线 | 失败标题集合 diff |
| --- | --- | --- | --- | --- |
| `test/runtime-core/**` | 59 | **540/503/33/0/4** | W-J1 after 540/503/33/4 | **0 行（同名 33/33）** |
| `test/编排/**` | 107 | **1133/1109/22/0/2** | W-J2 after 1133/1109/22/2 | **0 行（同名 22/22）** |
| `test/门禁引擎/**` | 41 | **453/447/5/0/1** | W-J3 after 453/447/5/1 | **0 行（同名 5/5）** |
| `test/桌面应用/`（W-J4 四文件） | 4 | **61/35/26/0/0** | W-J4 after 61/35/26/0 | **0 行（同名 26/26）** |
| `test/roles/nominator/**` | 2 | **27/27/0/0/0** | W-J2b after 27/27 | — |
| `test/测试/`（W-J5 相关 7 文件） | 7 | 8/7/1（raw；见 §9） | D1 raw 9/8/1；归一 8/8/0 | 唯一 fail 为 run-stop e2e 原生崩溃文件级条目（D1 为 effectiveness 挂起文件级条目）；真实用例 7/7 pass |

- 本批修改文件定向复核：runtime-core 2 文件 13/13 + 18/17/1（1 既有红）= 31/30/1；编排 4 文件 **84/83/1**（W-J2 targeted 一致，唯一 fail 为既有 `Retained intent confirmation…`）；门禁 2 文件 **62/62/0**（W-J3 targeted 一致）；桌面修改 2 文件 decision-service 22/22 + run-change-trigger 10/1/9 = 32/23/9（W-J4 targeted 一致，J12 三例通过）。
- 已知红项复核（BASE-3/各批）：runtime-core **33**、编排 **22 fail/2 skip**、门禁 **5 fail/1 skip**、桌面四文件 **26**——计数与失败名集合均与 D1/各批逐条相同（diff 0 行），未恶化；`optional-acceptance` 为登记挂起（90s 部分 summary 3/2/1，未计入；BASE-3 命令口径 6/2/1/3/0 未在本 E3-F 重取，见 §12）。
- skip 计数：runtime-core 4、编排 2、门禁 1（与 D1 相同）；桌面/test-role/nominator 0。

## 8. 本变更新增测试（逐条）

### 8.1 新增测试文件（2 个；3 用例全绿）

| 文件 | 用例 | 结果 |
| --- | --- | --- |
| `test/测试/2026-11-09_judge-delegated-doc-freeze.test.ts` | J17：无 source 的既有冻结 entry 事件字节逐字不变；judge-delegated source 如实镜像 actionSource | ✔ 1.6ms |
| 同上 | J16：judge-delegated doc.freeze 经真实账本追加/读取正例通过；缺失/伪造/客户字段负例 fail-closed | ✔ 14.6ms |
| `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` | W-J5/J15：judge 代批 intent 冻结 → verifyReviewIntent → judge D3 经 Runtime 包装层激活 → pin/run；非法 d3-by 仍负例 | ✔ 65.1s（自然 exit 0） |

（逐用例证据：`compare/new-files-cases.tsv`、`logs/test__测试__2026-11-09_judge-delegated-*.test.ts.log`。effectiveness 本轮自然退出（1/1，65.4s），未复现 D1 曾观测的“本体通过但进程未退出”；亦无需隔离复跑。）

### 8.2 既有测试文件内新增用例（+35；全部 pass）

- 本变更 judge 新增 **+20**（11 文件）：参见 §6.3 与 `compare/count-deltas-vs-ref.tsv`；其中 J12 三例（`decision-service` ok ×2、`run-change-trigger` ok ×1）、W-J2b 正例（nominator 15/15）、W-J3 门禁 4 例（23/23、39/39）、W-J1/W-J2 契约与 D3 用例均在主跑中实测通过。
- HEAD 基线差（非本变更）+15：claude-adapter/session +6（71/71）、chief-workflow +4（63 中 4 例通过；文件 flake 见 §9）、编排 direct-role 提案卡 A′ +5（43 中 42 pass，唯一 fail 为既有）。
- baseline-added 5 个 e2e 文件（非本变更，列入全量记录）：activation 1/1、commit-claude 1/1、commit-pi 1/1、delivery 1/1、run-stop 1/0/1（原生崩溃，隔离复跑 1/1，见 §9）。

## 9. 环境性差异与隔离复跑

| 项 | 主跑观测 | 隔离复跑（同候选/同命令） | 处置 |
| --- | --- | --- | --- |
| `git-run-stop-host-continuation-e2e` Node 原生 `CleanupQueue::Add` 崩溃 | 文件级合成 fail（21.2s，`logs/…run-stop…log`） | **natural exit 0，1/1 pass，43.7s**（`isolated/runs/run-stop-e2e-rerun-1/`） | 非确定性原生崩溃（E3 §3.5/W-J5 §4.3 已登记族），不计新增确定性失败 |
| `chief-workflow` ENOTEMPTY 清理竞态 | 63/48/15；W20、W47 select、W47 revise、selected、unmanaged 红 | **63/51/12**（进程 300s 未退出，watchdog；`isolated/runs/chief-workflow-rerun-1/`）；失败集合漂移（W20/revise/unmanaged 转绿、commit-race 转红），`W14/W19/W22/W23/W28×2/W33/W34` 两轮同名 | 既有非确定性清理族（参照 E3/E3-F、提案卡 D1、W-J4 同族），不计新增确定性失败 |
| `2026-11-09_judge-delegated-effectiveness` 进程未退出（D1 曾观测） | **未复现**：自然 exit 0，1/1 pass，65.4s | 不需要 | 改善（D1 已按同候选隔离复跑排除） |
| 其余 Node 原生崩溃/ENOTEMPTY | `CleanupQueue::Add` 仅 run-stop 日志 1 处；`ENOTEMPTY` 仅 chief-workflow 日志（W19/W4-selected/W9/W47 fixture 清理） | — | 均在已登记族内；`git-trunk-store` 13/13 自然（65.5s）、`git-role-workflows` 19/7/12 skip 自然（212.5s） |
| 未登记 watchdog | **0**（6 个 124 均为登记 90s） | — | — |
| `--test-force-exit`/`--test-timeout` | 全程未用（force 列全 0） | 未用 | — |

⇒ 主跑唯一“套件外”新增项（run-stop 原生崩溃）经隔离复跑自然通过；chief-workflow 3 条新增失败为已登记 flake 族的另一集合。**新增确定性失败 = 0、新 skip = 0**。

## 10. 静态门

- `npm run typecheck`（`tsc --noEmit`）：**exit 0**（`typecheck/typecheck-post.log`，09:44Z 后执行）。
- `typecheck:renderer` / `build:renderer`：**N/A**。依据（`typecheck/renderer-na-basis.log`）：候选 25 文件 **0 个 `app/**` 路径**；`git status --porcelain -- app/renderer app/main.ts` = 空；`git status --porcelain -- app` = 0 行；`git diff --stat -- app/desktop` = 0 行；`tsconfig.json` `include:["src","test","app"]`、`exclude:["app/renderer"]`（renderer 不在 typecheck 范围属既有配置）。与团队计划「渲染按需（预期 N/A 并给依据）」一致。

## 11. 测试完整性静态检查

- 测试文件删除：0（对参照 540 清单 diff 仅新增，无删除；`21-test-file-diff-vs-E3F.txt`）。
- delta 新增行中 `.skip(`/`test.skip`/`skip: true`/`--test-force-exit`/`--test-timeout`：**0**（`candidate/static-test-integrity-scan.txt`）。
- 两个新增测试文件内 skip/todo 标记：**0**。
- delta 移除的含断言行：**2**（均为 `test/测试/git-write-chain-fixture.ts` 中 `recordTaskObservation` 的 `assert.ok(...)` 行**等价改写**为 judge/customer 分支的条件展开，断言未删除/未弱化；新增含断言行 183）。
- 未修改 `test/桌面应用/optional-acceptance.test.ts`（B1 BASE-3 只读项；不在 25 文件写集）：`git status`/`git diff` 0 行，`git hash-object` = HEAD blob `518070f28b0b5ba1a184a8ff23892e3e6af1c0ae`（工作树 raw sha256 与 `git show HEAD:` 的差异仅为 CRLF 检出转换，内容不变）。

## 12. 限制与如实披露

1. **参照口径差异（已在 §1 说明）**：任务给定「参照 E3 `5cba2d54…`；5,032/4,807/192/1/32」；实测 `5cba2d54…` 为 `2026-11-08_E3-T3-full-regression.md`（4,979/4,750/196/1/32、520 文件），5,032/4,807/192/1/32 与 540 文件清单来自其后继全量 `2026-11-08_E3-F_remove-predictive-gates.md`（`41a4a215…`）。本记录以 540 文件全量参照作多重集对照、以 D1/各批基线作受写集影响套件的精确对照，二者均如实列出。
2. **参照运行后 HEAD 基线变化**：参照 540 文件运行（2026-11-08，HEAD `3f249e2` + 删除预知门控在飞）之后，删除预知门控提交 `29c0e15` 纳入 5 个 e2e 测试文件（参照运行后才加入提交）；其后又有中间提交（`6ab0d2d` claude-adapter 修复、`fb1aa39` 提案卡修复）落地。本候选 = HEAD `fb1aa39` + judge 25 文件。中间提交/提交时差相对参照造成 3 个既有测试文件内容变化（`test/claude-adapter/session.test.ts` +6 用例、`test/桌面应用/chief-workflow.test.ts` +4 用例、`test/编排/direct-role-capabilities.test.ts` +5 用例）与 5 个新 e2e 测试文件；本记录在 §6 计数对账中逐条区分「本变更 delta」与「HEAD 基线差」，不混用。
3. **登记挂起文件不计通过/失败**：6 个登记挂起文件按参照名单 90s watchdog 记录部分 summary，未计入合计（与参照同口径）；未使用 `--test-force-exit`/`--test-timeout` 冒充自然通过。
4. **环境性/非确定性**：chief-workflow 清理/时序族（ENOTEMPTY/AggregateError/waitFor）在参照与各批记录中即为多轮集合漂移的既有现象；application-line 顺序竞态、Node v24.22.1 原生 teardown 崩溃（CleanupQueue::Add）为参照 E3/E3-F §3.5 已登记族。本轮观测与隔离复跑见 §9；未以任何豁免掩盖新增确定性失败（判定口径：新增确定性失败 = 0、新 skip = 0）。
5. **测试自身写盘行为**：`test/测试/git-role-workflows-e2e.test.ts` 按其既有设计向 `角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence/`（运行前即存在、未跟踪）写入本次运行 proof JSON；属测试既有行为（参照 E3-F 同样发生），非本任务证据写集，`src app test` 未受影响。
6. **本轮机器性能**：与参照相当（长 e2e：activation 44.9s、commit-claude 54.2s、commit-pi 49.8s、delivery 97.5s、git-role-workflows 212.5s vs 参照 195.3s；无慢机 watchdog）。
7. 本记录只证明所列命令/文件集/环境下的观察；**不判验收**；E3-F 出口由 B2 独立验收按 B1 v1.1（`4cbb5df2…`）判定；未提交/推送/合并/发布。
8. **并发**：运行期间同一 worktree 出现 1 个非本任务未跟踪文件 `docs/acceptance/2026-11-09_team-plan-run-binding-criteria-v1.md`（§2.4）；`src app test` 候选/清单/状态全程逐字节稳定，全仓收工 status 与开工差仅该并发条目与本记录，未污染任何套件结果。

## 13. 纪律声明

- 只写本记录与 `2026-11-09_E3-F_judge-delegated-effectiveness-evidence/`；**未修改 `src/** app/** test/**`**（候选/manifest 运行前后逐行 diff 0 可证）；未修改 docs/角色卡其它内容；未 commit / push / 暂存 / merge / 发布；未 `npm install`；未运行真实模型/Electron/CDP；未占用 9222。
- 如实说明：`test/测试/git-role-workflows-e2e.test.ts` 按其自身既有设计向 `角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence/` 写入本次运行证据（非本任务写集，测试既有行为；参照 E3-F 同样发生）。

## 14. 证据索引

目录：`角色卡/测试/docs/change/2026-11-09_E3-F_judge-delegated-effectiveness-evidence/`（完整逐文件 SHA-256/行数/bytes 见 `evidence-manifest.txt`）

| 路径 | 内容 |
| --- | --- |
| `00-opening-state.log` | 开工身份/环境（HEAD/tree/分支/Node/npm/Git/OS/暂存） |
| `candidate/` | 25 文件 status/路径/逐文件 raw SHA-256/canonical 聚合/numstat/provenance；`manifest-src-app-test.tsv`（1,107）、`manifest-counts.txt`、`manifest-canonical-aggregate.txt`；`status-app.txt`、`app-desktop-diffstat.txt`；`static-test-integrity-scan.txt`；`recheck-midrun/`、`recheck-final/`（运行中/后快照与 diff） |
| `20-all-test-files.txt` / `21-test-file-diff-vs-E3F.txt` | 547 个 `*.test.ts` 与参照 540 清单 diff（+7/−0：2 本变更 + 5 HEAD 基线） |
| `run/run-e3f-per-file.sh` | 权威逐文件运行器（与参照同方法；无 force-exit/test-timeout） |
| `31-t3-per-file-results.tsv` / `31-t3-progress.log` / `31-node-leftovers.log` | 逐文件 exit/killed/summary/计数/duration/wall；进度；超时后 node 残留检查 |
| `logs/`（547 个 `.log`） | 逐文件原始输出（TAP/ spec） |
| `run/40-compare-vs-ref.sh` / `compare/` | 对参照 E3-F 的多重集对照：失败/skip 集、new/missing diff、count-deltas、aggregate-by-origin/dir、status-counts、anomalies、hang-and-timeout、per-file-validation、解析可信表、`new-and-missing-failures-classification.md` |
| `compare/d1-baselines/` / `run/41-compare-suites-vs-d1.sh` / `compare/suites-vs-d1/` | 受写集影响套件对 D1/各批基线的计数与失败/skip 标题集合对照 |
| `run/42-extract-new-cases.sh` / `compare/new-files-cases.tsv` | 新增/基线新增测试文件逐用例结果 |
| `isolated/runs/` | 环境性差异（原生 crash/清理抖动）同候选隔离复跑原件 |
| `run/50-final-recheck.sh` / `candidate/recheck-final/` | 收工候选/manifest/status/app-desktop 复核（diff 0） |
| `typecheck/typecheck-post.log` / `typecheck/renderer-na-basis.log` | `npm run typecheck` exit 0；renderer N/A 依据 |
| `run/99-evidence-manifest.sh` / `evidence-manifest.txt` | 本目录逐文件 SHA-256/bytes/行数索引（自哈希于交付回报给出） |
| `2026-11-09_E3-F_judge-delegated-effectiveness.md` | 本记录（SHA-256 于写盘后计算并在交付回报中给出，不写入正文以避免自指） |
