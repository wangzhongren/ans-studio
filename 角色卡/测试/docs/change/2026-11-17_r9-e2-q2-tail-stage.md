# R9 批次 E2：Q2 P2 tail stage 受既有 case deadline 约束 + 子阶段标记

- 日期：2026-11-17
- 角色：测试（roleId：测试）
- 工作树：`.claude/worktrees/fix-test-debt-r9h`（分支 `fix/test-debt-r9h`，起点 `52a651b` = `origin/main`，含 A2 `d27a34e`）
- 写区（仅这些）：`test/测试/git-role-workflows-e2e.test.ts`；本记录。
- 输入（只读）：`analysis-test-debt-r9` 的 `2026-11-16_remediation-plan-r9-update.md` §3.2；`2026-11-16_r9-batch-e-q2p2-budgets-diagnostics.md`（批 E 披露 #3/#6）。
- 边界：未改产品 `src/**`、`app/**`、`.github/**`、release-policy、main；未 commit/push；未触发 CI；未 tag；未读 `.env`；未占用 9222/9223/9224。
- 本机环境：Windows 11 / Node v24.22.1。

## 0. 摘要

1. **裁决（协调者已批准方案 (i)）：不新增预算**。第九轮 x64（run 43911103883，job 133452915507）Q2 P2 失败（child exit 1）；E 诊断显示 tail stage `actual worker required surface / scoped write` 在 240.005s 触顶（driver elapsed 469.4s），case 剩余 69.3s（child 540s 上限）；roleProgress 已推进到 `chief-visible-controller-review-target`，lastHttp=verifier roleStep 0（age 24.5s，已发 `ans_git_query q25-verifier-criterion`），inventory=verifier live + activeDelivery 在途，errors/waits 空——**链路正常推进，非回合停滞**。该阶段天然横跨 worker→集成→verifier→delivery（`controller-bounded-stop` 只在 delivery 发布回执处产生）。
2. **实现（单文件）**：把该单段 bounded 拆为 4 个有序子段，每段第三参数 `{ remainingCase: true }`（driver 已支持；`fixtureWaitBudgetMs` 语义 = `caseDeadlineAt - now`，即既有 case deadline，不再受 driver 默认 240s 上限）。每段循环条件 = 原终态（`controller-bounded-stop` ∨ `worker-candidate-source-gap`）∨ 该段推进标记；原失败检查（impl open-failed/dispose-failed 的 `Q15_WORKER_OPEN_BLOCK`、`driver.errors`、abort）逐字保留在每段循环中。断言、后续阶段、roleProgress 语义零改动；未改 `driver.ts`。
3. **本地 Windows 定向验证**：Q2 P2 通过 **187,618.9ms**（`duration_ms 190,101.1ms`，EXIT 0；114 请求 / 391 事件 / 0 errors；child 墙钟 187,422ms，watchdog 未触发）；四个新子段在 `stageTimeline` 全部 `resolved`（`remainingCase=true`）；Q30/Q74/Q36 3/3 通过；`npm run typecheck` EXIT 0。
4. **收官轮规则（写入代码注释与本记录）**：若收官轮仍撞 case deadline（`Q_CASE_ABSOLUTE_BUDGET` 或到达 deadline 的 `Q2_TIMEOUT`），按既定规则**拆 Q2 P2 测试/转产品候选，不再抬预算**。

## 1. 第九轮证据（x64）与裁决来源

- run **43911103883**（`Test matrix (development feedback)`，`workflow_dispatch`，main），x64 job **133452915507**：Q2 P2 child exit 1；失败标签 `Q2_TIMEOUT actual worker required surface / scoped write`。
- 批 E 诊断（`2026-11-16_r9-batch-e-q2p2-budgets-diagnostics.md`）在该失败运行中记录：
  - bounded 阶段触顶 **240.005s**（driver elapsed **469.4s**），`caseRemainingMs` = **69,300**（child 540s 绝对预算）；
  - `roleProgress` 末阶段 `chief-visible-controller-review-target`；`lastHttp` = verifier roleStep 0，age **24.5s**，已发 `ans_git_query q25-verifier-criterion`；
  - `inventory` = verifier live + `activeDeliveries` 在途；`errors: []`、`waits` 无 cycle/orphan/external。
- 定性（批 E 披露 #3/#6）：链在正常推进，只是总成本越过旧 240s 阶段预算；此时**优先把等待拆细/改条件（测试侧设计），而不是继续抬 240s**。
- 裁决：协调者已批准方案 (i)——不新增预算；tail stage 改为受既有 case deadline（`remainingCase`，沿用 child 540s/父 600s）约束，并加子阶段标记；若收官轮仍撞 `Q_CASE_ABSOLUTE_BUDGET`，按既定规则拆 Q2 P2 测试/转产品候选，不再抬预算。

## 2. 改动（单文件）

`test/测试/git-role-workflows-e2e.test.ts`（diff：`35 insertions(+), 2 deletions(-)`；仅 tail stage 块 + 注释）：

| # | 子段标签（`driver.bounded` label） | 代码行 | 退出条件（除原终态外） | 本次实测 budgetMs |
| ---: | --- | ---: | --- | ---: |
| 1 | `actual worker surface / scoped write` | `:2244` | `roleProgress` 出现 `worker-candidate-result` | 465,431 |
| 2 | `actual controller integration` | `:2252` | `controller-integration-result` | 454,219 |
| 3 | `actual verifier review` | `:2260` | `chief-visible-controller-review-target` | 440,949 |
| 4 | `actual controller bounded stop / delivery` | `:2268` | 无（终态唯一条件，等价原整段） | 437,629 |

- 每段第三参数 `{ remainingCase: true }`；每段循环内逐字保留原三项检查：
  `Q15_WORKER_OPEN_BLOCK`（impl `open-failed`/`dispose-failed`）、`driver.errors`、`signal.throwIfAborted()` + 10ms 轮询。
- 子段标记选择：
  - 段 1 用 `worker-candidate-result`（它蕴含 surface 证据 → scoped write → basis → candidate 全链已完成；`worker-surface-evidence` 只代表首个 worker 回合开始，粒度不足）；
  - 段 2 用 `controller-integration-result`（integrate 回执即集成结果）；
  - 段 3 按任务书用 `chief-visible-controller-review-target`（chief 收到 controller 复核目标并派发 verifier 的时刻；verifier 的实际核对回合因此落在段 4 内，与任务书的标记口径一致）。
- 代码上方新增注释（9 行）：第九轮 469.4s/240.005s/case 剩余 69.3s/verifier 在途证据、裁决来源（方案 (i)，不新增预算）、以及「若收官轮仍撞 `Q_CASE_ABSOLUTE_BUDGET` → 拆测试/产品候选，不再抬预算」。
- 未改 `test/测试/git-role-workflows-driver.ts`（`{ remainingCase: true }` 在现有 driver 已可用：`fixtureWaitBudgetMs(..., remainingCase=true)` 要求 `caseDeadlineAt` 为 safe integer，本用例由 `:1400` 定义并经 `:1933` 传入）。

## 3. 语义等价论证

1. **整体退出条件不变**：原单段等待到 T = `controller-bounded-stop` ∨ `worker-candidate-source-gap`。新四段顺序执行；段 1–3 可因推进标记提前进入下一段，但整体只能在段 4 完成时结束，而段 4 的退出条件仍只有 T。标记是测试自有 `roleProgress`（append-only）的存在性检查，只会让等待**提前进入下一段**，不可能让整体完成提前（段 4 仍要求 T），也不会让整体更晚（T 出现后每段条件立即为真、顺序通过）。因此复合等待完成 ⇔ T，与原语义一致。
2. **失败检查一致**：`Q15_WORKER_OPEN_BLOCK`、`driver.errors`、abort 三项检查逐字保留在每段循环，轮询节拍仍为 10ms；段切换只多一次轮询周期（≤10ms），不改变错误内容与顺序。T 出现前的任何失败仍以相同文案抛出。
3. **断言/后续零改动**：diff 仅 tail stage 块与注释；`workerSurfaceEvidence` 等后续断言、`controller-bounded-stop` 分支、delivery 收尾、teardown 全部未动。段 1 退出时 `worker-candidate-result` 必然晚于 `worker-surface-evidence`（同一 fixture 先在 worker 首回合 push surface 证据，再走 write/basis/candidate），故 `:2277`（`Q14_WORKER_SURFACE_EVIDENCE_MISSING`）的断言前提不变。
4. **预算语义（按裁决变化，非等价项）**：每段预算 = `caseDeadlineAt - now`（既有 child 540s/父 600s 绝对 deadline），tail 不再受 driver 默认 240s 上限；`driver.timeoutMs`（240s）仍作为 `turnLastResortMs`/`requestFirstByteTimeoutMs` 使用，未改。case deadline 前本 tail 不可能再以 240s 默认触顶；若剩余预算为 0，段开始即抛 `Q_CASE_ABSOLUTE_BUDGET`（原行为）。

## 4. 本地验证（Windows 本机，定向）

### 4.1 Q2 P2（权威本地运行，pass）

命令：

```bash
node --test --test-concurrency=1 --test-timeout=600000 --test-name-pattern="Q2 P2" "test/测试/git-role-workflows-e2e.test.ts"
```

结果：

```text
✔ Q2 P2 first new project: empty public chief -> formal convener bootstrap before future planning/D3/cards (187618.8766ms)
ℹ tests 1 / pass 1 / fail 0 / cancelled 0 / skipped 0 / duration_ms 190101.1323
EXIT:0
```

- child 生命周期：START→CLOSE 墙钟 187,422ms（`deadlineAt-start = 540,001ms`，watchdog 未触发，EXIT/CLOSE exitCode 0）。
- 证据 JSON（`<caseTag>-full-final-proof.json`）：`errors: []`、`trace: 114`、`events: 391`、`extra.budget = {"wholeTestMs":600000,"perObservationMs":240000,"httpRequests":256,"expectedRequestsAtMost":180,…}`。
- 阶段时间线（全部 19 段 `resolved`；以下为 tail 相关行，`remainingCase=true` 四段为本次新增）：

  | outcome | label | budgetMs | remainingCase | durationMs |
  | --- | --- | ---: | --- | ---: |
  | resolved | `actual worker surface / scoped write` | 465,431 | true | 11,212 |
  | resolved | `actual controller integration` | 454,219 | true | 13,270 |
  | resolved | `actual verifier review` | 440,949 | true | 3,320 |
  | resolved | `actual controller bounded stop / delivery` | 437,629 | true | 75,893 |
  | resolved | `actual worker latest report and matching persisted turn end` | 240,000 | false | 97 |
  | resolved | `actual controller blocked report reaches chief` | 240,000 | false | 7,975 |
  | resolved | `actual chief customer delivery and drained application receiver` | 240,000 | false | 27 |

- 四个新子段合计 103,695ms（批 E 单段实测 107,871ms，同量级）；`Q_BOUNDED_CASE_REMAINDER` 在每段开始各输出一条，首两条：
  `actual worker surface / scoped write | remainingMs=465431` → `actual controller integration | remainingMs=454219`（段 1 在 11.2s 后由 `worker-candidate-result` 推进）。
- 说明：段 3 仅 3.3s（`controller-integration-result` 后 3.3s 即出现 `chief-visible-controller-review-target`）；verifier 实际核对回合（`Q_VERIFIER_HTTP`、证据写、正式报告）如设计落在段 4。

### 4.2 同文件快用例回归

命令：

```bash
node --test --test-concurrency=1 --test-timeout=600000 --test-name-pattern="Q30 fixture HTTP|Q74 owned Git metadata|Q36 shared full business" "test/测试/git-role-workflows-e2e.test.ts"
```

结果：

```text
✔ Q30 fixture HTTP preserves split UTF8 and byte budget (14.0017ms)
✔ Q74 owned Git metadata observer atomic rename race remains bounded and strict (74.8863ms)
✔ Q36 shared full business registration identity (2.367ms)
ℹ tests 3 / pass 3 / fail 0 / duration_ms 551.2249
EXIT:0
```

### 4.3 静态检查

- `npx tsc --noEmit`：EXIT 0；`npm run typecheck`（同命令）：EXIT 0。
- `node --check test/测试/git-role-workflows-e2e.test.ts`：EXIT 0。

### 4.4 清理

- 本次运行证据目录 `角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence`（运行前为空；396MB / 41 文件，全部由本次运行生成）已整体删除。
- 本次生成的两个临时根（按创建时间窗与运行 START 时间核对）已精确删除：`%TEMP%\q2-git-first-bootstrap-vah6VC`（Q2 P2 夹具根，01:57:40 创建 = child START）与 `%TEMP%\q2-git-metadata-observer-QSoZ5k`（Q74 回归，02:01:02 创建）。其余既有 `q2-git-*` 目录（跨会话累计/其它并发会话）未动，未做全量 temp 清扫。
- 工作树 `git status`：仅 `M test/测试/git-role-workflows-e2e.test.ts` + 本记录（untracked）。

## 5. 披露

1. **平台边界**：仅 Windows 本机定向（单次 pass）；arm64/x64 未在本机复跑。第九轮 x64 收官轮 CI 是权威验收。
2. **收官轮处置（预算边界）**：本批不新增预算。tail 现在受既有 case deadline 约束；若收官轮仍耗尽 case deadline（段开始即 `Q_CASE_ABSOLUTE_BUDGET`，或等待到 deadline 的 `Q2_TIMEOUT`——两者同为 case 绝对预算耗尽），按既定规则**拆 Q2 P2 测试/转产品候选并报告 owner，不再抬预算**。该规则已写入测试注释。
3. **段 3 标记口径**：任务书指定 `actual verifier review` 的推进标记为 `chief-visible-controller-review-target`；该标记在 chief 派发 verifier 时产生，故 verifier 的实际核对全部落在段 4（`actual controller bounded stop / delivery`）。若收官轮诊断显示 verifier 回合停滞，段 4 的 `lastHttp=verifier …` + `roleProgress` 仍可定位；如需更细 verifier 粒度，可在后续批次把段 3 标记改为 `verifier-formal-report-returned`（本批按任务书标记，未自行扩项）。
4. **预算字段语义变化**：`stageTimeline.budgetMs` 对这四段记录的是 case 剩余（本次 465,431→437,629），不再是 driver 默认 240,000；诊断里的 `stageDefaultMs` 仍为 240,000（driver `timeoutMs`，未改），`caseRemainingMs` 与段预算一致。使用证据时勿把 `budgetMs>240s` 误读为“新增预算”——它是既有 case deadline 的剩余。
5. **段 1 标记选择**：选用 `worker-candidate-result` 而非 `worker-surface-evidence`（后者只代表首个 worker 回合开始）；两者均在任务书允许范围内。
6. **运行噪声**：本机其它并发会话/历史运行在 `%TEMP%` 留有大量既有 `q2-git-*` 目录（会话窗口外，未清理）；本次仅清理自身产物。
7. **无产品改动、零断言放宽、零删测试**：diff 仅 tail stage 拆分与注释。
8. **未做**：未 commit/push；未触发 CI；未 tag；未碰 main；未改产品 `src/**`、`app/**`、`.github/**`、release-policy；未读 `.env`；未占用 9222/9223/9224。

## 6. 产物与复现

- 本记录 + `test/测试/git-role-workflows-e2e.test.ts`（唯一代码改动）。
- 复现命令：

  ```bash
  cd .claude/worktrees/fix-test-debt-r9h
  node --test --test-concurrency=1 --test-timeout=600000 --test-name-pattern="Q2 P2" "test/测试/git-role-workflows-e2e.test.ts"
  node --test --test-concurrency=1 --test-timeout=600000 --test-name-pattern="Q30 fixture HTTP|Q74 owned Git metadata|Q36 shared full business" "test/测试/git-role-workflows-e2e.test.ts"
  npm run typecheck
  ```
