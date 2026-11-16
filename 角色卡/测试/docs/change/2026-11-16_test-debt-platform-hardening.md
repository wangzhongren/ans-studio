# 平台候选测试内硬化：spawn fence 两路分类 / compatibility-loopback 子进程隔离 / W-J5 预算观测

- 日期：2026-11-16
- 角色：ANS「测试」（roleId: 测试）
- 工作树：`.claude/worktrees/plat`（分支 `fix/test-debt-platform`，起点 `5661a73` = `origin/main`）
- 范围：
  1. `test/编排/git-command.test.ts`：`Git final spawn fence …`（macOS-only FSEvents 时序）。
  2. `test/测试/g5-reasoning-verify/compatibility-loopback.test.ts`（任务中「实际路径」）：真实子用例独立子进程隔离 + 仅原生收尾崩溃的有界重试。
  3. `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`：W-J5/J15 测试内预算观测（不改语义/上限）。
- 协调者裁定遵守：**继续在测试内硬化/隔离**；**任何「从发布门禁排除」的提议未提出、也未实施**；门禁口径不放松（三个文件仍在 `test/**/*.test.ts` 全量回归内，未新增 skip/todo，未改 workflow/release.yml）。
- 约束遵守：只写上述 3 个测试文件 + 本记录/`_evidence/`；未改产品/workflow/release.yml/角色卡/边界/其他测试；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占 9222/9223/9224。
- 数据源（只读）：
  - R6 分析：`2026-11-16_remediation-plan-r6-update.md`、`_r6-evidence/16-platform-diff.tsv`、`10-block-codes.json`、`14-timeouts-and-stall.json`；
  - 前序记录：`2026-11-16_test-debt-misc2.md`（spawn fence 延迟探针 0ms/100ms）、`2026-11-16_test-debt-misc3.md`（compatibility-loopback 8× 本机绿、W-J5 预算说明）、`2026-11-16_test-debt-b4-followup.md`（平台候选处置先例）、`2026-11-16_test-debt-misc-closeout.md`；
  - R6 CI run **43848313583**（`main @ 82dc180`，Node 24.14.0；原始工件 `/tmp/r9-art`，不入库）。
- 本机：Windows 11 Pro x64 / Node **v24.22.1** / Git 2.55.0.windows.5（CI 为 Node 24.14.0）；无 macOS 环境，macOS 行为用延迟探针模拟并标注待 CI 复核。

## 0. 摘要

| # | 项 | R6 平台事实 | 处置 | 结果 |
| ---: | --- | --- | --- | --- |
| 1 | Git final spawn fence（`git-command.test.ts`） | macOS-x64-only、272ms：期望 `git-command-failed:null:unknown`，实际 `git-host-lease-invalid-before-command`（FSEvents 回调晚于内部 plumbing 启动） | 重构为**显式两路分类** + 共享可证明安全不变量（ref 未发布、update-ref 从未启动、已启动记录全部 settled success、失败必拒绝、真实重试成功）；publication 阶段按三态（blocked/拒绝/published）逐态钉住证据 | 本机 0ms 3× 绿；延迟模拟 **0/20/40/80/100/120/200ms 全部绿**（含 80ms 混合路：started+cancelled）；探针证明 ref 永不发布、update-ref 永不启动 |
| 2 | compatibility-loopback（实际路径 `test/测试/g5-reasoning-verify/compatibility-loopback.test.ts`） | Windows-only file-level 原生 libuv `UV_HANDLE_CLOSING`（三个子用例 ✔ 之后的进程收尾期；R6 首次，且首轮带 `--test-force-exit`） | 三个真实子用例各自**独立 Node 子进程串行隔离**；子进程在全部断言后写完成哨兵；**仅**「哨兵已写 + 原生断言签名」的收尾崩溃做有界重试（3 次），断言失败/中途崩溃/超时一律不重试；重试耗尽仍红 | 父/子隔离生效（3/3 绿，~3.2s）；探针：崩溃一次→重试恢复绿；断言失败→第 1/3 次即红、不重试；持续原生崩溃→3 次后仍红（门禁不放松） |
| 3 | W-J5/J15（`2026-11-09_judge-delegated-effectiveness.test.ts`） | x64-only 180s（R3/R5/R6 三度），无断言失败；R6 x64 总耗时 1.73× Windows | **不改语义/不改 180s 上限**；测试内加入分段预算观测（`context.diagnostic`）。本机分段：`buildWriteChain` 39.4–44.0s、verifyReviewIntent 端到端 14.4–16.4s、其余 ≈2.5–3.1s；本文件无固定 sleep | 本机 3× 绿（56.8 / 59.0 / 63.8s）；CI 日志将带 `wj5BudgetMs` 便于 x64 复现时区分真实链路成本与 runner 负载/泄漏 |
| 4 | 验证 | — | 修改文件全文件 3× 自然退出；`npm run typecheck`；零新增失败；未新增 skip | 见 §4 |

**结论**：三项均在测试内硬化/隔离，门禁口径不变、无排除提议。spawn fence 的「no launch」断言只在**可证明未启动**的路 A 保留；路 B 用更强的证据绑定替代，未放宽 mutation 防护（逐条论证见 §1.3）。

## 1. Git final spawn fence（`test/编排/git-command.test.ts`）

### 1.1 R6 CI 证据与机理

- 失败体（R6 macOS x64，`git-command.test.ts:51`）：`AssertionError: The input did not match /git-command-failed:null:unknown/. Input: 'Error: git-host-lease-invalid-before-command'`；耗时 272ms。
- 产品链（只读）：`prepare` 依次执行 `hash-object -w` → `mktree`（多级目录多次）→ `commit-tree` → `update-ref`（`src/provider/trunk/impl/git-candidate-store.ts:170-218`）。每个 mutation 在 `executeGit` 入口做 lease 检查（`git-command.ts:728`），并在持久化 pending 进程记录后、spawn 前做**无 await** 的最终栅栏检查（`git-command.ts:753-757`）。
- misc2 延迟探针（`misc2_evidence/spawn-fence-delay-probe.log`）：0ms 回调 ⇒ `git-command-failed:null:unknown` + 1 条 `cancelled-before-spawn`；100ms 回调 ⇒ `git-host-lease-invalid-before-command` + 3 条全部 `started/exited/0`。
- 结论：两路都在 **ref 发布前** fail-closed；但 macOS FSEvents 的观察延迟使「records no launch」这一**时序性**断言不成立于延迟路。原断言把「观察延迟」误当作产品缺陷。

### 1.2 改法（仅测试）

1. **显式两路分类**（按可持久化的进程证据分类，而不是只按错误文本）：
   - 路 A（无任何 `started` 记录）：必须恰好 1 条 `cancelled-before-spawn`（pid 缺席/exitCode null/termination unknown），拒绝文本必须匹配 `git-command-failed:null:unknown:`。
   - 路 B（至少 1 条 `started` 记录）：已启动记录必须全部 `pid` 定义 + `termination=exited` + `exitCode=0`；拒绝文本必须为 `git-host-lease-invalid-before-command` 或 `git-command-failed:null:unknown:`（混合时序：某条 plumbing 已启动、后续命令在自身取证窗口被最终栅栏取消）。
2. **共享安全不变量（两路都必须成立）**：candidate ref 为 null（无 ref 变更、commit 不成为 ref 可见）；任何进程记录的 mutation verb 都只能是 `hash-object/mktree/commit-tree`，**`update-ref` 从未启动**（即使取消记录也不允许出现 `update-ref`）。
3. **真实重试**：新 lease 重试必须成功，且 candidate ref 必须由一条 `update-ref` 的 `started/exited-0` 进程证据背书。
4. **publication 三态分类**：`blocked` ⇒ 显式 `cancelled-before-spawn` + ref null；抛错 ⇒ 仅 `git-host-lease-invalid-before-command` + ref null + 该 operation 无 `update-ref` 进程记录；`published` ⇒ `started/exited-0` + ref === 精确 `newOid`。
5. **观察落地有界等待**：每阶段在 retry 前有界等待（≤500ms）watcher 中断观察落地，避免延迟到达的中断合法地落在新 lease 上（那属于真实撤销语义，不是要排除的 flake）。
6. **fake unresolved 记录显式构造**：`launch=started, termination=unknown, pid=99999999, exitCode=null`（原实现用第一条例程记录做模板，延迟路模板是 exited，无法再钉住「未结算进程持有栅栏」）。

### 1.3 逐条「不放宽安全性」论证（若必须改变 no-launch 断言）

| # | 原断言 | 新断言 | 不放宽论证 |
| ---: | --- | --- | --- |
| 1 | 必须拒绝且错误文本 == `git-command-failed:null:unknown` | 必须拒绝；路 A 文本严格不变；路 B 仅接受两种产品已定义的 fail-closed 码 | 拒绝本身未放宽（绝不接受成功）；路 B 不是新增允许，而是原有产品在观察延迟下的真实拒因（misc2 探针逐字复现 CI） |
| 2 | 恰好 1 条进程记录 | 路 A 恰好 1 条；路 B ≥1 条且每条都是 settled success | 放宽的只是「内部对象写入命令是否已跑完」这一平台时序；**ref mutation 证据反而更严**：新增「update-ref 从未启动」+「verb 家族仅限对象写入」+「started 必须 exited/0」 |
| 3 | 单条记录必须 `cancelled-before-spawn` | 路 A 逐字段保留；路 B 不允许出现 `cancelled-before-spawn` 之外的未结算态（pending/unknown 一律失败） | 不允许任何 `pending`/`unknown` 证据通过；路 B 的每次启动都是 `exited/0`，不会留下未结算 own 进程 |
| 4 | publication 必须 `blocked` + `cancelled-before-spawn` + ref null | 三态分类，每态用过程证据绑定 | ref 变更必须由 `started/exited-0` 的 owned update-ref 背书；blocked/拒绝必须 ref 不变；不存在「ref 变了但无进程证据」的放行分支。观察延迟不是产品承诺的同步语义，原断言同样未证明「观察必然先于 spawn」 |
| 5 | 重试不要求 update-ref 证据 | 重试的 candidate ref 必须由 `update-ref` 的 launched/exited-0 记录背书 | 更严：把「ref 已发布」与「owned 进程成功」绑定，防止未来回归把 ref 变化归因于其他路径 |

**结论**：未放宽 mutation 防护。可放宽的只有「fs.watch 观察在某条内部 plumbing 命令完成前送达」这一与安全无关的时序假设；所有会改变 ref 的路径都在两路中被独立禁止，且 ref 变化必须有 stronger process proof。

### 1.4 探针与验证（本机 Windows，macOS 行为模拟）

- **两路探针**（`_evidence/spawn-fence-delay-probe.mjs`，0–200ms）：7 档延迟全部 reject；`candidateRefPublished=false`、`updateRefLaunched=false`。其中 80ms 出现**混合路**（started + cancelled-before-spawn + started，错误 `git-command-failed:null:unknown:`），验证分类覆盖混合时序。原始日志：`_evidence/spawn-fence-delay-probe.log`。
- **真实测试延迟模拟**：把测试文件临时复制并把 `recordGitHostInterruption` 延迟 0/20/40/80/100/120/200ms（其余代码逐字不变），全部 **PASS**：`_evidence/runs/spawn-fence-delayed-test-{0,20,40,80,100,120,200}ms.log`。
- **本机真实路径（0ms）**：目标 3× 绿（`_evidence/runs/spawn-fence-real-run{1,2,3}.log`）；全文件 3× 绿（§4）。

## 2. compatibility-loopback（`test/测试/g5-reasoning-verify/compatibility-loopback.test.ts`）

### 2.1 R6 CI 证据与定性

- Windows-only file-level：`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76` → `✖ test\测试\g5-reasoning-verify\compatibility-loopback.test.ts (3628.4306ms)`；崩溃前三子用例均 ✔（Claude 1405.32ms / Codex 1051.21ms / Pi 646.86ms）。
- 定性（沿用 misc3）：libuv 原生断言，发生在**全部断言通过后的进程收尾期**；不是用例断言、不是产品错误。R6 为首轮带 `--test-force-exit` 的测试 CI（misc3 已披露因果未证实、只作加重因素）。

### 2.2 改法（仅测试）：子进程隔离 + 有界重试

1. 三个真实子用例分别成为 `runClaude/runCodex/runPi`，由**父进程**（outer runner 的 file child）各 spawn 一个**独立 Node 子进程**串行执行；产品/SDK 动态 import 只发生在子进程场景内。
2. 子进程在全部断言完成后写**完成哨兵**（`ANS_G5_LOOPBACK_SENTINEL`）。
3. 父进程判定：
   - 子进程退出 0 且哨兵存在 ⇒ 通过；
   - 子进程非 0 且**哨兵存在**且输出匹配原生断言签名 `Assertion failed:.*(?:UV_HANDLE_CLOSING|src[\\/]win[\\/]async\.c)` ⇒ 仅此类「断言已完成后的进程级原生收尾崩溃」允许重试，最多 3 次；
   - 其余（断言失败/中途崩溃/超时/哨兵缺失）⇒ **立即失败，永不重试**；
   - 3 次仍有原生崩溃 ⇒ **仍失败（门禁保持红）**。
4. 子命令显式 `--test --test-reporter=tap --test-timeout=<scenario+30s>`，删除外层 `NODE_TEST_CONTEXT` 防止嵌套 runner 误入 IPC 子模式；子进程总超时 `scenario+60s`。

### 2.3 探针（临时探针文件，事后删除；日志入库）

| 场景 | 探针注入 | 期望 | 实际 |
| --- | --- | --- | --- |
| 收尾期原生崩溃一次 | 哨兵写入后写签名 + `exit(134)`（首次） | 父进程重试并恢复绿 | **PASS**（`compat-probe-crash-once-recovered.log`；marker=`crashed` 证明首次崩溃发生） |
| 断言失败 | worker 内 `assert.fail` | 第 1 次即失败、不重试 | **FAIL 1/3**（`Isolated pi failed on attempt 1/3 … non-native failures are never retried`；`compat-probe-assert-no-retry.log`） |
| 持续原生崩溃 | 每次写签名 + `exit(134)` | 3 次后仍失败 | **FAIL**（`reproducibly hit the native teardown crash in 3 bounded attempts; keeping the gate red`；`compat-probe-crash-always-red.log`） |

> 探针是对「哨兵之后进程级崩溃」的模拟（签名文本 + 非 0 退出），不是对真实 libuv 崩溃的复现；本机 misc3 已 8× 未复现原生断言。探针用于验证父进程判定逻辑本身。

### 2.4 门禁未排除论证

- 文件仍在全量测试通配内；未新增 skip/todo/条件排除；父进程对**真实子用例结果**负责（断言在子进程执行，父进程传播失败）。
- 重试仅可能把「全部断言已通过后的进程级原生收尾崩溃」转绿；任何断言失败仍红，持续原生崩溃仍红。因此重试不掩盖产品/测试语义失败。
- 隔离把崩溃限制在单个场景子进程，父进程仍能报告失败；不会因一个场景的原生崩溃吞掉其他场景的结果。

### 2.5 验证

- 重构后父/子模式：全文件 3× 自然退出绿（§4；每次 ~3.1–3.3s，三个子进程各自 ~0.9–1.1s）。
- 本机未复现真实 `UV_HANDLE_CLOSING`（与 misc3 一致）；Windows CI 复核仍为最终依据。

## 3. W-J5/J15（`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`）

### 3.1 事实与定性（沿用 misc/misc3）

- x64-only 180s：R3/R5/R6 三度；失败体 `test timed out after 180000ms`，**无断言失败/产品错误**；同轮 Windows ✔ 69.5s、R5 arm64 ✔ 71.1s；R6 x64 全量 44m40.6s = Windows 1.73×。
- 本机 3× 56.8 / 59.0 / 63.8s（本次实测），无失败。

### 3.2 测试内预算观测（不改语义）

- 本文件无固定 sleep；耗时几乎全在真实跨层链。本机分段（`context.diagnostic` 输出的 `wj5BudgetMs`，run1）：`buildWriteChain` 39.4s、R9/负例 0.2s、judge D3+pin 1.7s、verifyReviewIntent 端到端 14.4s、activation 重放/幂等 1.2s，总计 56.8s；3× 区间：`buildWriteChain` 39.4–44.0s、verifyReviewIntent 14.4–16.4s、总计 56.8–63.8s。
- 改动仅为：`budgetMark` 时间戳 + 末尾 `context.diagnostic(JSON.stringify({ wj5BudgetMs }))`；**断言、用例数、180s 上限、skip 全不变**。CI 复现时可直接看到 x64 的分段成本，用于区分「真实链路成本」与「runner 负载/泄漏」。
- **不提高 180s、不拆用例、不并行化**：并行化会改变真实跨层顺序语义；提高上限只会掩盖潜在 x64 性能/泄漏（misc3 §4 结论）。若 x64 第四次复现，按 misc3 建议由 owner 启动 x64 性能专项或单列预算调整。

### 3.3 验证

- 全文件 3× 自然退出绿（§4）；每次输出 `wj5BudgetMs` 诊断。

## 4. 验证汇总

运行口径：本机 Windows 11 x64 / Node v24.22.1；`node --test --test-concurrency=1 --test-timeout=300000`（**自然退出，无 `--test-force-exit`**；CI 另有 `--test-force-exit`，本批按任务要求自然退出验证）。

| 文件 | 运行 | 3× 结果 | EXIT |
| --- | --- | --- | --- |
| `test/编排/git-command.test.ts` | 全文件 | **17 tests / 17 pass / 0 fail ×3**（`runs/git-command-full-run{1,2,3}.log`） | 0 |
| 同上 | `Git final spawn fence` 目标 | **1/1 ×3**（758–770ms；`runs/spawn-fence-real-run{1,2,3}.log`） | 0 |
| 同上 | 延迟模拟（临时副本；0/20/40/80/100/120/200ms） | **7/7 PASS**（`runs/spawn-fence-delayed-test-*.log`） | 0 |
| `test/测试/g5-reasoning-verify/compatibility-loopback.test.ts` | 全文件（父/子隔离） | **3 tests / 3 pass / 0 fail ×3**（~3.1–3.3s；`runs/compat-loopback-full-run{1,2,3}.log`） | 0 |
| `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` | 全文件 | **1/1 ×3**（56.8s / 59.0s / 63.8s；`wj5BudgetMs` 均输出；`runs/wj5-full-run{1,2,3}.log`） | 0 |
| `npm run typecheck` | `tsc --noEmit` | — | **EXIT=0**（`typecheck.log`） |

- 零新增失败：三个修改文件全文件全部绿（17/17、3/3、1/1），无任何失败名；未新增 skip/todo，用例数量不变（git-command 17、compatibility-loopback 3、W-J5 1）。
- 本批所有临时测试副本（W-J5 计时埋点、spawn fence 延迟模拟、compat 重试探针）在验证后已删除；工作树仅保留 3 个测试文件修改 + 本记录/`_evidence/`（`git status --porcelain` 5 项）。
- CI 同口径补充（`--test-force-exit`，各 1×）：spawn fence 目标 PASS（`runs/spawn-fence-force-exit-run.log`）、compatibility-loopback 3/3 PASS（`runs/compat-loopback-force-exit-run.log`）；主验证仍为上方自然退出 3×。

## 5. 限制与披露

1. **无 macOS 本机**：spawn fence 的 macOS 结论来自 R6 工件 + `fs.watch` 中断观察延迟模拟（0–200ms）；最终以 macOS CI 复核为准。模拟的是「观察延迟」而非 FSEvents 内核实现。
2. **compatibility-loopback 原生崩溃本机不可复现**（misc3 8× + 本批 3× 均绿）；隔离/重试逻辑用模拟探针验证，真实 `UV_HANDLE_CLOSING` 是否仍发生需 Windows CI 复核。若 CI 仍出现且 3 次内不稳定，测试将保持红色（门禁不放松）。
3. **W-J5 为预算观测非修复**：不改耗时主因（真实跨层链）；x64 180s 的根因仍未定位。
4. **探针文件不入库**：临时测试副本/探针在验证后删除；证据日志与探针脚本（spawn fence）保留在 `_evidence/`。
5. **未做**：未 commit/push、未触发 CI、未 tag/碰 main、未改产品/workflow/release.yml/角色卡/边界/其他测试、未新增 skip、未读 `.env`、未占 9222/9223/9224。

## 附录 A：证据索引（`角色卡/测试/docs/change/2026-11-16_test-debt-platform-hardening_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `spawn-fence-delay-probe.mjs` | 两路 fail-closed 诊断探针：0/20/40/80/100/120/200ms 观察延迟下的错误、进程记录 verb/launch/termination/exitCode、candidate ref、update-ref 是否启动 |
| `spawn-fence-delay-probe.log` | 探针原始输出；全部延迟下 `candidateRefPublished=false`、`updateRefLaunched=false`；80ms 为混合路（started+cancelled+started） |
| `runs/spawn-fence-delayed-test-{0,20,40,80,100,120,200}ms.log` | 真实测试文件（仅延迟 `recordGitHostInterruption`）在 7 档延迟下的完整运行；全部 PASS |
| `runs/spawn-fence-real-run{1,2,3}.log` | 本机真实 0ms 路径目标 3× |
| `runs/spawn-fence-force-exit-run.log` | CI 同口径（`--test-force-exit`）spawn fence 目标 1× |
| `runs/git-command-full-run{1,2,3}.log` | `git-command.test.ts` 全文件 17/17 ×3 |
| `runs/compat-loopback-full-run{1,2,3}.log` | compatibility-loopback 父/子隔离全文件 3/3 ×3 |
| `runs/compat-loopback-force-exit-run.log` | CI 同口径（`--test-force-exit`）compatibility-loopback 1× |
| `runs/compat-probe-crash-once-recovered.log` | 收尾期原生崩溃一次（模拟）→ 有界重试后 PASS；marker=crashed |
| `runs/compat-probe-assert-no-retry.log` | 断言失败 → `attempt 1/3` 即红，不重试 |
| `runs/compat-probe-crash-always-red.log` | 持续原生崩溃（模拟）→ 3 次后仍红（门禁不放松） |
| `runs/wj5-full-run{1,2,3}.log` | W-J5 全文件 3×（含 `wj5BudgetMs` 诊断） |
| `runs/wj5-phase-timing-instrumented.log` | 临时埋点副本的分段耗时原始输出（buildWriteChain ≈41.1s、phase4 ≈16.1s 等） |
| `typecheck.log` | `npm run typecheck` → EXIT=0（最终状态） |
| `test-diff.patch` | 3 个测试文件的完整 diff |

## 附录 B：复现命令

```bash
# spawn fence 目标 / 全文件（自然退出）
node --test --test-concurrency=1 --test-timeout=300000 --test-name-pattern="Git final spawn fence" "test/编排/git-command.test.ts"
node --test --test-concurrency=1 --test-timeout=300000 "test/编排/git-command.test.ts"

# 两路延迟探针（本机诊断，不修改产品/测试）
node "角色卡/测试/docs/change/2026-11-16_test-debt-platform-hardening_evidence/spawn-fence-delay-probe.mjs"

# 延迟模拟：复制测试文件，把 watcher 回调改为
#   watch(dir, () => { watcher.close(); setTimeout(() => { recordGitHostInterruption(...); signalObserved(); }, DELAY); })
# 然后：ANS_FSEVENTS_DELAY_MS=100 node --test --test-concurrency=1 --test-timeout=300000 \
#   --test-name-pattern="Git final spawn fence" "<临时副本>.test.ts"

# compatibility-loopback（父进程编排三个独立子进程）
node --test --test-concurrency=1 --test-timeout=300000 "test/测试/g5-reasoning-verify/compatibility-loopback.test.ts"

# W-J5（含 budget diagnostic）
node --test --test-concurrency=1 --test-timeout=300000 "test/测试/2026-11-09_judge-delegated-effectiveness.test.ts"

npm run typecheck
```

## 附录 C：关键结论速览

- **spawn fence**：两个合法路（未启动拒绝 / 已启动后拒绝）都在 ref 发布前 fail-closed；新断言把「records no launch」限制在路 A，路 B 用「update-ref 从未启动 + candidate ref 未发布 + 已启动记录全部 exited-0 + 失败必拒绝 + 重试由 update-ref 证据背书」替代——未放宽 mutation 防护。
- **compatibility-loopback**：真实子用例独立子进程串行隔离；仅「全部断言完成后的原生收尾崩溃」有界重试（3 次），断言失败不重试、重试耗尽仍红；未排除门禁。
- **W-J5**：不改语义/不提高 180s；测试内 `wj5BudgetMs` 诊断（buildWriteChain 39–44s、verifyReviewIntent 端到端 14–16s）供 x64 复现时定位。
- **验证**：三文件全文件 3× 自然退出全绿；延迟模拟 0–200ms 全绿；typecheck EXIT=0；零新增失败、零新增 skip。
