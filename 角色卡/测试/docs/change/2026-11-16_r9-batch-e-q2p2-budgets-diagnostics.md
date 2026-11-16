# R9 批次 E：Q2 P2 三层预算统一 + 超时阶段诊断

- 日期：2026-11-16
- 角色：测试（roleId：测试）
- 工作树：`.claude/worktrees/fix-test-debt-r9e`（分支 `fix/test-debt-r9e`，起点 `da805ec` = `origin/main`，含 #137）
- 写区（仅这些）：`test/测试/git-role-workflows-driver.ts`、`test/测试/git-role-workflows-e2e.test.ts`；本记录。
- 输入：`analysis-test-debt-r9` 的 `2026-11-16_remediation-plan-r9-update.md` §3.2 / §4 批 E / §6 / §7-1，与 `_r9-evidence/03-error-bodies.md`、`04-q2p2-timeline.tsv`、`09-budget-evidence.md`。
- 边界：未改产品 `src/**`、`app/**`、`.github/**`、release-policy；未碰 main；未 commit/push；未触发 CI；未 tag；未读 `.env`；未占用 9222/9223/9224。

## 0. 摘要

1. **三层预算按同一 600s 目标对齐**：父测试显式 timeout 300s→600s；子进程硬预算 300s→540s（outer 默认 330s→570s，保留 30s margin）；阶段 bounded 实占 150s→240s（默认分支 90s→240s）。
2. **归因修正（关键）**：R9 报告称“first-bootstrap 阶段默认 90s”，但 CI 子进程经 `ANS_Q39_BUSINESS=1` 触发 `q39→q35→q32→…→q27→q26` 闭锁，实际走 `timeoutMs: q26Business ? 150000 : …`。本地运行证明全部阶段 `budgetMs=150000`，关键阶段实耗 119.2s。R9 arm64/Windows 的 bounded 过期点（256.2s/277.3s）与该阶段起点（约 106s/127s）相差约 150s，与 150s 分支一致；90s 默认分支只作用于直接/诊断模式。本批因此把 **q26 实占分支 150s→240s** 与默认分支 90s→240s 一并写为 `q2P2StageBudgetMs`。缺陷定性（链成本 + 阶段预算、非 #137 覆盖）不变，仅层值修正。
3. **诊断增强**：`Q2_TIMEOUT` 名称与 label 保留；错误消息附带 `q2-timeout-diagnostic/v1` 结构（roleProgress、last/recent HTTP、pending 卡片、只读 inventory、recent events、各阶段耗时、errors/waits）；并写 `<caseTag>-q2-timeout-diagnostic.json` 证据文件。零断言放宽、零删测试。
4. **本地 Windows 验证**：最终代码 Q2 P2 通过 `196,887.8ms`（总 `duration_ms 197,384.5ms`；关键阶段 107.9s / 240s 预算；114 请求、392 事件、0 errors）；同文件快用例 Q30/Q74/Q36 3/3 通过；临时把阶段预算压到 30s 的强制超时 smoke 产生完整诊断（last HTTP = chief 正在派发 verifier），随后已还原并重新 typecheck。

## 1. R9 归因修正：阶段预算实占 150s，不是 90s

### 1.1 机制

`runFirstNewBusinessCase` 在子进程内由环境推导：

- 父测试（node:test）以 `ANS_Q39_BUSINESS=1`、`ANS_Q39_CHILD=1` 等 spawn 子进程；
- 子进程内 `q39Business=true` ⇒ `q35Business=true` ⇒ `q32Business=true` ⇒ … ⇒ `q27Business=true` ⇒ `q26Business=true`；
- 因此 e2e 驱动创建处（起点 `da805ec` 的 `git-role-workflows-e2e.test.ts:1922`）实际选择：
  `timeoutMs: q33QueueDiagnostic ? 30000 : q26Business ? 150000 : q25Business ? 120000 : 90000`
  = **150000**，不是默认的 90000。
- `driver` 的 `timeoutMs` 默认 6000（`git-role-workflows-driver.ts` 起点 `:520`），只被少数未显式传参的用例使用（见 §3），与 Q2 P2 无关。

本地直接证据（本次最终运行前的第一次本地运行，旧代码）：`-full-final-proof.json` 的 `extra.budget` 为
`{"wholeTestMs":300000,"perObservationMs":150000,"httpRequests":256,"expectedRequestsAtMost":180,…}`（q26 分支），
且 `stageTimeline` 全部 16 个阶段 `budgetMs=150000`。

R9 时间线算术（`04-q2p2-timeline.tsv`）：

| 平台 | 关键阶段起点（≈pin-child 校验后） | bounded 过期 | 差值 | 与 150s 分支 |
| --- | ---: | ---: | ---: | --- |
| arm64 | ~106s（persisted-child 96.3s 之后保存/观察） | 256.2s | ~150s | 一致 |
| Windows | ~127s（persisted-child 114.8s 之后） | 277.3s | ~150s | 一致 |

结论：R9 的 `Q2_TIMEOUT actual worker required surface / scoped write` 是 **150s 阶段预算**耗尽（并非 90s）；该阶段从 pin-child 校验一直覆盖 worker 候选→集成候选→verifier→controller resume→delivery 的整段链（本地实测该阶段就是 107.9–119.2s）。慢 runner 上跨过 150s 即失败。

### 1.2 对缺陷定性的影响

无变化：仍是“链成本 + 阶段/绝对预算边界”，#137 的 CLI 600s 不覆盖（父测试显式 timeout、子进程看门狗、阶段 bounded 三层都在 CLI 之外）；errors/waits 为空的困局由本批诊断解决。

## 2. 三层预算改动表（每一处的旧值/新值/依据）

| # | 层 | 位置（当前行号） | 旧值 | 新值 | 依据 |
| ---: | --- | --- | ---: | ---: | --- |
| 1 | 父测试显式 timeout | `git-role-workflows-e2e.test.ts:2318`（`test(firstNewBusinessName, { timeout: firstNewBusinessTimeoutMs() })`；父进程分支 `:1317-1322`） | 300000 | **600000**（`q2P2WholeTestBudgetMs`） | #137 的 CLI 600s 被显式 per-test timeout 覆盖；R9 x64 300s 时仅到 persisted-child（251.7s）；R8 同链 arm64/Windows 214.0s/195.6s 通过，600s 目标口径 |
| 2 | 子进程硬预算 | `:1329` `deadlineAt = Math.min(now + X, outerDeadlineAt − 30000)` | 300000 | **540000**（`q2P2ChildAbsoluteBudgetMs`） | 给父测试保留 60s 做子进程结果核验/拆解余量；与 600s 目标对齐 |
| 3 | 子进程 outer 默认 | `:1328`（`ANS_HARNESS_WRAPPER_DEADLINE_AT` 缺席时） | now + 330000 | **now + 570000**（`q2P2ChildAbsoluteBudgetMs + 30000`） | 保持既有 30s outer margin；否则子进程 deadline 会被 outer−30s 再压回 300s |
| 4 | 阶段 bounded（CI 子进程实占分支） | `:1933` `timeoutMs: q26Business ? X : …` | 150000 | **240000**（`q2P2StageBudgetMs`） | 本地关键阶段实测 107.9–119.2s；R9 arm64/Windows 约 150s 耗尽；240s ≈ 2.0× 本地实测、较旧值 +90s；另见 §1 修正 |
| 5 | 阶段 bounded（默认分支，直接/诊断模式） | `:1933` 末位默认 | 90000 | **240000**（同名常量） | 与同一 600s 目标口径对齐；审计确认 CI 子进程不经过该分支（被 q26 闭锁覆盖） |
| 6 | 子进程入口 sanity 上限 | `:3432` `deadlineAt <= now + X` | 300000 | **540000**（同名常量） | 否则父进程传入的 540s 会被子进程自身断言拒绝 |
| 7 | 证据 budget 记录（仅描述字段） | `:2300` `wholeTestMs` / `perObservationMs` | q26: 300000 / 150000；默认: 240000 / 90000 | q26: **600000 / 240000**；默认: **600000 / 240000** | 与实际预算一致，避免证据自述失真；无断言作用 |
| 8 | `firstNewBusinessTimeoutMs()`（子进程/连续运行器分支） | `:1314-1322` | q39 一律 300000 | `ANS_Q39_CHILD=1` → **600000**（子进程 caseDeadlineAt，仍被 supplied 540000 收紧为 540000）；`continuousChangeChild` → **300000 不变**；`ANS_Q39_BUSINESS` 非子进程非连续 → **300000 不变**；父进程模式 → **600000**；Q19–Q38 各诊断/变体分支原值不变；末位默认 240000 不变 | 只对齐 Q2 P2 主链；连续阶段运行器（`runPhase("new", 300000)`、共享绝对 deadline）与 `ANS_NEW_MODIFICATION_CHILD` 等其它入口不受影响 |

补充说明：

- 子进程内 `caseDeadlineAt = min(now + firstNewBusinessTimeoutMs(), suppliedDeadlineAt)`；`ANS_Q39_CHILD=1` 时前者 600000，后者=父传入 540000，故实际 case deadline 为 **540s**。
- #4/#5 中 `timeoutMs` 同时被 driver 用作 `runtimeOptions.requestFirstByteTimeoutMs` 与 `turnLastResortMs`（driver `:708`），因此本用例单回合兜底也由 150s→240s；这是 fixture 用例的既有耦合，不改产品代码，见 §6 披露 3。
- 不动的相关预算：`q33QueueDiagnostic ? 30000`（诊断专用）、`q25Business ? 120000`（q25 为真时 q26 必真、该分支不可达，保留原值）、`requestLimit`（192/256 不变，实测 114 请求）、连续运行器 `runPhase("new", 300000)` 与 `roleProgress`/断言。

## 3. driver 默认值使用方审计（只读）

`git-role-workflows-driver.ts` 的 `createRealHttpDriver`：

- 默认 `const requestLimit = options.requestLimit ?? 30, timeoutMs = options.timeoutMs ?? 6000;`（起点 `:520`；当前 `:527`）。
- `timeoutMs` 在 driver 内的全部使用方：阶段 bounded（`fixtureWaitBudgetMs`，`:790`）、`runtimeOptions.requestFirstByteTimeoutMs` / `turnLastResortMs`（`:708`）、`Q_BOUNDED_CASE_REMAINDER` 日志 `originalDefaultWaitMs`（`:798`）、超时诊断 `stageDefaultMs`（`:766`）。本次未改默认值 6000。
- 全仓导入面：仅 `test/测试/git-role-workflows-e2e.test.ts`（`grep -rl "git-role-workflows-driver" test/` 唯一命中）。
- 未传 `timeoutMs`（使用默认 6000）的调用点：3 处，均不受本次改动影响——
  1. `:1278` Q2 real default CodexChat safe-query（options 无 timeoutMs）；
  2. `:1545` Q2 首建 legacy blocked 变体；
  3. `:2323` `preparedMaterialsFirstObservation`（导出但仓内无调用者）。
- 显式传参的调用点（值均未变）：`:866` 90000、`:1100` 90000、`:1933` Q2 P2（q33 30000 / q26→240000 / q25 120000 / 默认→240000）、`:2368` 10000、`:2476` 30000、`:2578` 30000、`:2998` 45000、`:3086` 30000、`:3187` 10000、`:3366` 15000；`runDesktopLifecycleProbe` 固定 10000。
- `fixtureWaitBudgetMs` 语义未改；其自检（e2e `:338-341`、`:2388-2392`）使用字面量，未受影响。
- 影响面结论：本次预算改动只触及 Q2 P2 用例（经 q26 闭锁与默认分支）与子进程/父测试包装，不改变其它用例的 stage/turn 预算。

## 4. 超时诊断字段（`Q2_TIMEOUT` 名称保留，语义不变）

触发点：driver `bounded`（`:787`）的 30s/240s 计时器；`Q_CASE_ABSOLUTE_BUDGET` 同样附带同结构。错误消息形如
`Q2_TIMEOUT <label>; {"schema":"q2-timeout-diagnostic/v1", …}`，同时写 `<evidence>/<caseTag>-q2-timeout-diagnostic.json`（写失败被吞掉，不替换主失败）。

字段（均为测试自有事实/只读观察，不含 prompt/文件正文/凭证）：

| 字段 | 内容 |
| --- | --- |
| `schema` / `at` / `root` / `stage` | `q2-timeout-diagnostic/v1`；时刻；夹具根；超时的 bounded label（当前阶段） |
| `stageBudgetMs` / `stageDefaultMs` / `caseDeadlineAt` / `caseRemainingMs` | 本次等待预算（min(默认, case 剩余)）、driver 默认（现 240000）、case 绝对 deadline 与剩余 |
| `driverElapsedMs` / `stageElapsedMs` | driver 创建至今、该阶段已等待时长 |
| `roleProgress` | 每个 stage + `replyPreview`（≤240 字符）+ `replyChars` |
| `lastHttp` | 最后一条真实请求：sequence/at/ageMs/role/roleStep/lastUserPreview(≤1500)/emittedToolCalls(id+name)/replyContentPreview/replyError |
| `recentHttp` | 最近 5 条（role/step/at/age/emittedToolCalls/reply 摘要，不含 user 正文） |
| `httpByRole` | 各 role 的请求数、最后时刻、最后 step |
| `pendingCards` | 超时时刻未决客户卡：id/roleId/kind/cardKind/title(≤160) |
| `inventory` | 只读 `desktopProjectExecutionInventory(root)` 摘要：sessions(roleId/runtime/phase/lifecycle)、pendingOpens、queuedDispatches、activeDeliveries |
| `recentEvents` | 最近 8 条 UI 事件：roleId/kind/summary(≤160)/detail 关键字段 |
| `stageTimeline` | 每个 bounded 阶段：label/startedAt/endedAt/durationMs/budgetMs/remainingCase/outcome(resolved/rejected/timeout) |
| `requests` / `errors` / `waits` | 保留原消息字段，向后兼容 |

`stageTimeline` 同时被加入 driver 返回值与 `driver.save` 证据（`extra` 同级），供通过/失败运行做阶段耗时回看。

## 5. 本地验证（Windows 本机，定向）

### 5.1 最终代码 Q2 P2（权威本地运行，pass）

命令：

```bash
node --test --test-concurrency=1 --test-timeout=600000 --test-force-exit \
  --test-name-pattern="Q2 P2 first new project" "test/测试/git-role-workflows-e2e.test.ts"
```

结果：`✔ Q2 P2 first new project … (196,887.8236ms)`；`ℹ tests 1 / pass 1 / fail 0`；`duration_ms 197,384.4875`；`EXIT:0`。

阶段时间线（child START 16:21:32.455Z；预算均 240000ms）：

| 阶段 | 起点 | 耗时 |
| --- | --- | ---: |
| persisted child observed | 16:22:43.943（71.5s） | — |
| worker candidate prepared | 16:23:02.796（90.3s） | — |
| integrated candidate prepared | 16:23:16.412（104.0s） | — |
| verifier 首个 HTTP 回合 | 16:23:36.247（123.8s） | — |
| delivery published | 16:24:38.786（186.3s） | — |
| `actual worker required surface / scoped write` | 16:22:50.944 → 16:24:38.815 | **107,871ms**（240s 预算，余量 132s） |
| `actual execution and worker dispatch preflight` | 16:22:35.843 → 16:22:50.944 | 14,520ms |
| `real D3 / zero-file role drafts / activation` | 16:21:46.426 → 16:22:08.667 | 20,826ms |
| `dedicated workflow request/write…` | 16:22:17.281 → 16:22:29.911 | 11,688ms |
| `actual chief customer delivery and drained…` | 16:24:47.938 → 16:24:47.980 | 42ms |

共 16 个 bounded 阶段全部 `resolved`；HTTP 114 次、事件 392、`errors: []`；证据 `extra.budget = {"wholeTestMs":600000,"perObservationMs":240000,"httpRequests":256,"expectedRequestsAtMost":180,…}`（q26 分支已对齐）。

### 5.2 第一次本地运行（q26 对齐前，pass；用于确认链成本）

同一命令、同一机器：`✔ … (211,747.7169ms)`，`duration_ms 215,016.925`，`EXIT:0`；阶段预算 150000（旧 q26 分支），关键阶段 **119,249ms**、余量仅 30.8s；HTTP 114、事件 392、0 errors。该运行证明：本机链本身可通过，但旧 150s 阶段预算的余量很小，与 R9 慢 runner 越过 150s 的失败一致。

### 5.3 强制超时 smoke（验证诊断路径，临时改动已还原）

临时把 `q2P2StageBudgetMs` 改为 30000（仅本地实验，已还原为 240000 并重新 typecheck），同命令运行：

- 结果：`✖ Q2 P2 … (108,479.492ms)`（预期失败）；
- `Q2_TIMEOUT actual worker required surface / scoped write`，`stageBudgetMs=30000`、`stageElapsedMs=30001`、`caseRemainingMs=431876`、`requests=94`、`errors=[]`、`waits={cycles:[],orphan:[],external:[]}`；
- `roleProgress` 30 条（止于 `chief-visible-controller-review-target`）；`lastHttp = {sequence:94, role:"chief", roleStep:25, ageMs:807, emittedToolCalls:[{id:"q23-dispatch-verifier",name:"ans_dispatch_task"}]}`（即超时时刻 chief 正在派发 verifier）；
- `pendingCards=[]`；`inventory.sessions=12`、`activeDeliveries=[{roleId:"chief",kind:"handback",taskId:"t-…"}]`；`recentEvents` 末条为 chief `tool_call dispatch_task phase=start`；
- `stageTimeline` 13 条（12 resolved + 1 timeout），完整落盘 `<caseTag>-q2-timeout-diagnostic.json`（26,753 B）。
- 结论：超时时刻可定位“最后 HTTP 角色/回合/工具调用 + roleProgress 末阶段 + 活动投递/会话 + 各阶段耗时”，errors/waits 为空时不再无证可查。

### 5.4 同文件快用例回归

`--test-name-pattern="Q30 fixture HTTP|Q74 owned Git metadata|Q36 shared full business"`：

- ✔ Q30 fixture HTTP preserves split UTF8 and byte budget（14.9ms）
- ✔ Q74 owned Git metadata observer atomic rename race remains bounded and strict（72.0ms）
- ✔ Q36 shared full business registration identity（2.3ms）
- `pass 3 / fail 0 / duration_ms 563.2 / EXIT:0`

### 5.5 静态检查

`tsc --noEmit`（仓库根 TypeScript，工作树 cwd）：`EXIT:0`；两文件 `node --check` 通过。

### 5.6 清理

三次本地运行生成的证据目录（约 1GB）与三个 OS 临时项目根（`q2-git-first-bootstrap-nWFAHQ` / `5mjNpF` / `rm1MTn`）已删除；工作树 `git status --short` 仅剩两个写区文件的修改与本记录（untracked）。

## 6. 披露

1. **平台边界**：仅 Windows 本机定向验证；arm64/x64 未在本机复跑。第九轮三平台 CI 是权威验收。
2. **要是第九轮仍 Q2_TIMEOUT**：先看诊断——若 `stageTimeline` 显示同一阶段再次耗尽、`lastHttp.ageMs` 接近预算且 `roleProgress` 不再前进（回合停滞/卡死），或 `pendingCards`/`inventory.activeDeliveries` 显示未决等待，则按 #137 记录**拆测试/升级产品候选并报告 owner**，不得继续静默抬预算。若诊断显示链仍在推进（last HTTP 持续更新）只是总成本超 240s/540s，同样交 owner 裁决拆测试。
3. **budget 耦合**：driver 的 `timeoutMs` 同时是 fixture 的 `turnLastResortMs` 与 `requestFirstByteTimeoutMs`；本用例单回合兜底随阶段预算 150s→240s。这是 fixture 既有设计，未改产品；若后续需要“阶段 240s 但回合 90s”需另立参数，不在本批写区扩大。
4. **发布门禁口径**：父测试显式 600s 也会作用于 release.yml 的运行（其命令无 CLI per-test timeout）；真正挂起的 Q2 在发布验证中最多需 600s 才命名失败（原 300s）。这是“同一 600s 目标”的直接结果，未改 release.yml/#137 的既有声明。
5. **R9 层值修正**：本记录把 R9 报告中的“阶段默认 90s”修正为“CI 子进程实占 150s（q26 闭锁）；90s 仅默认/诊断分支”。缺陷定性（非 #137 覆盖、链成本 + 预算）不变；本批同时修两分支以确保不同入口一致。
6. **关键阶段等待条件**：`actual worker required surface / scoped write` 的退出条件是 `roleProgress` 出现 `controller-bounded-stop` 或 `worker-candidate-source-gap`；前者只在 delivery 发布回执处产生，因此该阶段天然横跨 worker→集成→verifier→controller resume→delivery（本地 107.9–119.2s）。若第九轮在该阶段超时且诊断显示链在正常推进，优先考虑把该等待拆细/改条件（测试侧设计），而不是继续抬 240s。
7. **样本量**：单机两次通过运行（211.7s / 196.9s，波动约 ±15s）+ 一次强制超时 smoke；非多轮统计。
8. **未做**：未 commit/push；未触发 CI；未 tag；未碰 main；未改产品 `src/**`、`app/**`、`.github/**`、release-policy；未读 `.env`；未占用 9222/9223/9224。
9. **只读引用**：`analysis-test-debt-r9` 工作树的 R9 计划与证据只读引用，未修改。

## 7. 改动文件索引（当前行号）

- `test/测试/git-role-workflows-e2e.test.ts`
  - `:1314-1322`：`q2P2WholeTestBudgetMs` / `q2P2ChildAbsoluteBudgetMs` / `q2P2StageBudgetMs` 常量与 `firstNewBusinessTimeoutMs()` 组装；
  - `:1328-1329`：子进程 outer/deadline 预算；
  - `:1933-1934`：Q2 P2 driver `timeoutMs`（q26 分支 + 默认分支）与 `progress`/`timeoutDiagnosticFile` 接线；
  - `:2300`：证据 budget 描述字段；
  - `:2318`：父测试显式 timeout（间接取 600000）；
  - `:3432`：子进程入口 sanity 上限。
- `test/测试/git-role-workflows-driver.ts`
  - `:73-74`：`StageProgressFact` / `StageTimelineFact` 类型；
  - `:428-430`：`progress`、`timeoutDiagnosticFile` 选项；
  - `:742-785`：stageTimeline、HTTP/inventory/events 摘要、`stageTimeoutDiagnostic`、`persistTimeoutDiagnostic`；
  - `:787-810`：`bounded` 记录时间线并以 `Q2_TIMEOUT`/`Q_CASE_ABSOLUTE_BUDGET` 附带诊断；
  - `:843`：`driver.save` 输出 `stageTimeline`。
