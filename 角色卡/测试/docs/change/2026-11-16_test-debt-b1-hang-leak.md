# B1（2026-11-16）：挂起/泄漏族修复——Windows 89 分钟静默停顿 + 两个测试级 300s 挂起

- 角色：ANS「测试」（roleId: 测试）。
- 任务：测试债治理第一批 B1（P0 挂起/泄漏），目标先削 Windows CI 预算。依据
  `角色卡/测试/docs/change/2026-11-16_remediation-plan.md` §3/§4.2 与
  `2026-11-16_remediation-plan_evidence/{14-timeouts-and-stall,01-ci-failures}.json`。
- 工作树/分支：`.claude/worktrees/fix-test-debt-b1` / `fix/test-debt-b1`，起点 `ee26b44`
  （= origin/main，PR #106 合并提交）。
- 范围：只改 4 个测试文件 + 本记录/同前缀 `_evidence/`。未改产品代码/其它测试/workflow/
  release.yml/角色卡/边界；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；
  未占用 9222/9223/9224。
- 本机环境：Windows 11 Pro 10.0.26300，Node v24.22.1（CI 为 Node 24.14.0），npm 11.19.1；
  与 CI 同为 Windows x64 语义（8.3 短名、native realpath）。

## 〇、结论摘要（先读）

1. **Windows 120 分钟预算的真正大头（88.97 分钟静默）已定位并修复。** 泄漏的不是 Q2 P2
   本身，而是**紧邻其前**的「Q2 real default CodexChat HTTP」测试：CI Windows 日志给出其错误体
   `AssertionError [ERR_ASSERTION]: Fixture inventory path must not traverse unknown links`
   （12:31:57.408Z）；最后一条结果为 Q2 P2（12:31:59.390Z），此后静默至 14:00:57Z 取消
   （5,338,421ms）。根因链：Windows runner 的 `os.tmpdir()` 是 **8.3 短名**
   （`C:\Users\RUNNER~1\…`）→ `fs.mkdtemp` 返回短名夹具根 → `fs.promises.realpath`（native 实现）
   展开长名 → `hashFixtureFiles` 的严格 realpath 断言抛错 → 该测试 `finally` 先
   `driver.save(...)` 后 `driver.dispose()`，保存异常**跳过 dispose** → fixture HTTP server
   （监听中）、5ms `actorSampler` interval 与 desktop 会话句柄留在事件循环 → 测试文件子进程
   **永不退出**，`node --test --test-concurrency=1` 父进程一直等待。本机以 8.3 短名 TEMP 精确复现：
   用例 64.7ms 失败后进程 **120s 仍不退出**（被外部 wall clock 杀死）；修复后同一条件用例
   0.8s 通过并**自然退出**。
2. **两个测试级 300s 挂起均变为 ~10s 有界命名失败，失败名不变、诊断可命名。**
   - `session-rebuild-race`「关闭全部与双角色刷新扫描交接」：产品 `freezeBindings` 在检测到
     `stop` 后**自毁**重建句柄（`disposeObservedHandle`），该 dispose 在 rebuild 链内被 await；
     而 `stop(null)` 先 `await` 全部 rebuild 链。测试把该 dispose 的 gate 留到
     `Promise.race([refresh, laterOpen.arrived])` 之后释放，`refresh` 又卡在同一链上 ⇒ 循环等待
     （测试 gate 与产品 stop-guard 顺序的契约冲突；生产无此死锁，dispose 不依赖 stop）。
   - `stuck-redispatch` C-04：`e71501c` 删除 `tryAutoSelectDecision` 后，decision 卡被
     `planJudge` 明确排除（`cardKind === DECISION_CARD_KIND ⇒ undefined`），测试注入的 `judge`
     永不结算该卡；请求实际呈现给客户（`pushed:1`）后 `redispatchTask` 永挂（`rows:0`）。
     该期望属 e71501c 语义漂移族（B4），B1 只把无限挂起改为带现场的有界失败。
3. **修复只动 4 个测试文件**（见 §五）：夹具根 realpath 规范化、dispose 失败路径全兜底、
   证据保存失败不阻断 dispose、两处挂起测试的全部内部等待改 10s 有界。断言文本/语义未放宽，
   未删除/跳过任何用例。
4. **验证：** 三个文件各 **3× 自然退出**（`--test-timeout=300000` + 外部 wall clock）；
   失败名与修复前本机基线**逐名一致、零新增**；两个 300s 用例从 `300010ms/cancelled` 变为
   `~10s fail`（`--test-timeout` 零命中）；`npm run typecheck` EXIT=0。
5. **限制披露：** 本机普通 TEMP（无 8.3）下无法直接复现 CI 的静默停顿；已用 8.3 短名 TEMP
   等价复现（修复前 Q2 query 失败后 ≥120s 不退出；修复后整文件 191s 自然退出），并用强制
   Q2 P2 有界失败验证失败路径退出。Q2 real / Q2 P2 的 CI 侧失败名变化需 R1 轮 CI 复核。

## 一、CI 事实（run 43421603526，Windows x64）

来源：`2026-11-16_remediation-plan_evidence/01-ci-failures.json`、
`14-timeouts-and-stall.json`（本轮只引用，不重复下载大日志）。

| 项 | 值 |
| --- | --- |
| 命令 | `node --test --test-concurrency=1 --test-timeout=300000 "test/**/*.test.ts"`（Node 24.14.0） |
| Windows job | `131872698592`，`timeout-minutes: 120`，12:00:50Z 启动，14:01:03Z cancelled |
| 最后一条测试输出 | 12:31:59.3915875Z（Q72 `# SKIP` 一行） |
| 取消 | 14:00:57.8125464Z |
| 静默间隔 | **5,338,421ms ≈ 88.97 分钟** |
| 归属文件（证据） | `test/测试/git-role-workflows-e2e.test.ts`（Q65/Q2 P2/Q36/Q37–Q72 全部声明在该文件） |
| 关键错误体 | 「Q2 real default CodexChat HTTP…」`AssertionError [ERR_ASSERTION]: Fixture inventory path must not traverse unknown links`，12:31:57.4089635Z |
| 最后结果 | 「Q2 P2 first new project…」1986.7609ms，12:31:59.3907645Z（owned child 快速失败退出，非泄漏者） |
| 300s 条目 | 2 个测试级：`关闭全部…`（300011.3438ms）、`C-04 decision 开关开启…`（300002.0474ms）；文件级 0 条 |

## 二、根因 A：Windows 静默停顿（Q2 real query → 88.97 分钟）

### 2.1 机制的代码事实

1. `test/测试/git-role-workflows-driver.ts` 的 `createRealHttpDriver`（修复前）：
   `root = await fs.mkdtemp(path.join(os.tmpdir(), …))`——根是 `os.tmpdir()` 的**原始拼写**。
   GitHub Windows runner 的 `os.tmpdir()` = `C:\Users\RUNNER~1\AppData\Local\Temp`（8.3 短名）。
2. `hashFixtureFiles` 对每个条目严格断言
   `assert.equal(await fs.realpath(file), file, "Fixture inventory path must not traverse unknown links")`。
   `fs.promises.realpath` 走 **native** 实现，会把 8.3 短名展开为长名
   （`C:\Users\runneradmin\…`）⇒ `realpath(file) !== file` ⇒ 断言必红。
   （本机探针确认：`fs.realpathSync` 保留短名拼写，而 `fs.promises.realpath` 展开长名。）
3. `driver.save` → `observe()` → `observeFixtureGitMetadata(root)` → `hashFixtureFiles(root, ".git")`。
   只要夹具已初始化真实 `.git`（Q2 query 的 `prepareFixture: initializeGitRepository`），保存必走该断言。
4. 「Q2 real default CodexChat HTTP」的 `finally`（修复前）：
   `await driver.save(proof); await driver.dispose(); await driver.save(after-cleanup-proof);`
   ——保存异常使 `driver.dispose()` **不执行**。
5. 泄漏句柄：fixture `createServer(...).listen(0, "127.0.0.1")` 的 HTTP server、`setInterval(actorSampler, 5)`
   的采样 interval、以及 desktop 会话。文件子进程全部用例结束后事件循环仍非空，
   `node --test` 等待子进程退出 ⇒ CI 静默 88.97 分钟直到 job 上限。
6. 为什么最后一行是 Q2 P2：Q2 P2 在 full-file 模式下经 `runOwnedCompleteBusinessChild` 启动 owned
   child；CI 上该 child 约 2s 内结束（Windows 内联条目无错误体；父测试随后失败），而它前面 Q2 query
   的 driver 仍以泄漏状态挂在同一文件子进程里。因此「最后结果 = Q2 P2」与「泄漏者 = Q2 query」并不矛盾；
   计划 §3.2 的「Q2 P2 失败路径未 dispose」高置信假设就此修正为**同文件紧邻前序测试的 save 失败
   路径未 dispose**（两者共用同一 driver 清理模式，B1 一并兜底）。

### 2.2 本机 8.3 短名复现（修复前）

- 准备：`C:\Users\51054\AppData\Local\Temp\ans-studio-8dot3-long-name-b1` 的 8.3 短名为
  `C:\Users\51054\AppData\Local\Temp\AN7AEF~1`；把 `TEMP/TMP/TMPDIR` 指向短名。
- 命令（只跑泄漏用例）：
  `TEMP=…AN7AEF~1 TMP=… TMPDIR=… timeout -k 10 120 node --test --test-concurrency=1
  --test-timeout=300000 --test-name-pattern="Q2 real default CodexChat HTTP"
  "test/测试/git-role-workflows-e2e.test.ts"`
- 结果（`_evidence/pre-fix-8dot3-query-hang.log`）：用例 **64.7111ms** 失败，错误体与 CI 完全一致
  （`Fixture inventory path must not traverse unknown links`）；此后无任何输出，**120s 外部
  wall clock 到点被杀（EXIT=124）**——文件进程不自然退出。
- 对照（修复后，同命令同环境）：用例 **326.7566ms 通过**，`duration_ms 810.134`，
  **EXIT=0 自然退出**（`_evidence/post-fix-8dot3-query-pass.log`）。
- 说明：本机普通 TEMP（无 8.3 短名）下，修复前整文件也可自然退出（基线 203s，仅 Q30/Q74 红），
  因此本机若不构造 8.3 条件就无法直接复现 CI 停顿；上例即为 CI 条件的等价复现。
  修复后再跑整文件 8.3 条件：见 §6.3（全绿除 Q30/Q74，自然退出）。

## 三、根因 B：session-rebuild-race「关闭全部…」300s

- 复现（修复前，`--test-timeout=300000`）：`关闭全部…` 300010.0628ms，摘要
  `fail 3, cancelled 1`，整文件 301s（`_evidence/pre-fix-baseline-race-300s.log`）。
- 插桩探针（`.tmp-b1/probe-race.mjs` 的调用栈，证据 `_evidence/probe-race-stack.log`）：
  A 角色陈旧重建的 gen3 句柄由 `LifecycleOpen.freezeBindings`
  （`app/desktop/session/lifecycle/open.ts:1316`）在 `stopped()` 判定后经
  `disposeObservedHandle → handle.dispose()` **在 open 内部自毁**；该 dispose 是 rebuild 链的一环。
- 测试时序：`refreshStaleBoundaries()` 卡在 A 的 rebuild 链（gen3 open 的 dispose gate
  `firstStopDispose`）→ `stop(null)` 先 `++boundaryRefreshVersion` 再
  `await Promise.all([...rebuildChains.values()])` → 测试在 `Promise.race([refresh,
  laterOpen.arrived])` 之后才 `firstStopDispose.release()`。`refresh` 等待的正是 stop 等待的
  同一链 ⇒ 双方互等，`race` 永不结算 ⇒ 300s。
- 判定：**不是生产死锁**（真实 dispose 不依赖 stop 返回），是测试 gate 与 stop-guard 自毁顺序的
  契约冲突。B1 不猜测修改产品语义；按计划 §4.2 加 10s 显式 deadline，超时如实失败并给出
  `refreshSettled/stopSettled/opened/disposed/sent/live/openForRoleId` 现场。
- 修复后：`10023.2334ms` 命名失败（`Error: 刷新扫描/后续重开未在有界窗口内结算：10000ms 内未结算
  {"refreshSettled":false,"stopSettled":false,"opened":["A","B","A"],"disposed":["A"],"sent":[],
  "live":["B"],"openForRoleId":"B"}`），文件 11s 自然退出（`_evidence/post-fix-race-single-bounded.log`）。

## 四、根因 C：stuck-redispatch C-04 decision 开关开启 300s

- 复现（修复前，`--test-timeout=300000`）：`C-04 decision 开关开启…` 300010.6365ms，摘要
  `fail 3, cancelled 1`，整文件 307s（`_evidence/pre-fix-baseline-redispatch-300s.log`）。
- 代码事实：`app/desktop/customer-input.ts` 的 `planJudge` 对 decision 卡直接返回 undefined
  （`if (cardKind === DECISION_CARD_KIND) return undefined;`，约 :1462）；`e71501c` 已删除
  `tryAutoSelectDecision`（同仓 `directive-decision.test.ts:346`、
  `customer-authorization-plane-integration.test.ts:590` 的 v2.0.0 注释可证）。测试注入的
  `judge: { isGroupEnabled("decision")=true, fn→approve }` 因此**没有消费者**：
  `withRequestLifecycle` 的 customerInput promise 只会在 presenter 客户应答/通道取消时结算。
- 修复后：`10025.4506ms` 命名失败（`Error: C-04 decision 开关开启：judge 代选未在有界窗口内结算
  （无客户裁决事件）：10000ms 内未结算 {"pushed":1,"rows":0}`）——直接证明「客户卡已呈现、judge
  结果行 0 条」；文件 11s 自然退出（`_evidence/post-fix-redispatch-single-bounded.log`）。
- 该用例的期望更新属 B4（e71501c 语义漂移族），B1 不更新期望、不放宽断言，只消除无限挂起。

## 五、修复清单（4 个文件，+101/−39 行；完整 diff 见 `_evidence/fix.diff`）

1. `test/测试/git-role-workflows-driver.ts`
   - 夹具根创建即规范化：`root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), …)))`，
     消除 Windows 8.3 短名与 native realpath 的断言冲突（§二）。
   - `createDesktopInterface(...)` 构造失败时关闭 fixture HTTP server 后再抛错——监听句柄不得
     因构造异常留在事件循环。
   - `dispose()` 改为「失败收集 + server 必关」：`rejectAllPending`/`desktop.stopSession`/
     `disposeProjectDocuments` 任一抛错都继续关闭 server/恢复 env/冲刷诊断，最后按单错原样、
     多错 `AggregateError` 抛出；不再有「先抛错、server 不关」的路径。
   - 未改 `hashFixtureFiles` 的严格断言与 save 的数据面。
2. `test/测试/git-role-workflows-e2e.test.ts`
   - 新增 `saveThenDispose(driver, save)`：保存失败先 `await driver.dispose()` 再如实重抛；
     应用到本文件 10 处「save → dispose → save(after-cleanup)」清理点（Q2 query、delivered
     maintenance/revert、Q37/Q43、CHANGE publish/admission、Q48 hub draft、clarification 等）；
     Q2 P2 的 `finally` 因需保留完整清理证据，单独按同一契约改造（下一条）。
   - Q2 P2 `finally`：pre-dispose 证据保存失败被捕获为 `finalSaveFailure`，dispose 与全部清理
     证据（teardown-facts/after-cleanup/error-outcomes）仍执行，最后与主错误一并如实抛出。
   - 断言/证据字段未改；`error-outcomes.json` 的 `disposeCompleted/finalAssertionsCompleted` 语义保留。
3. `test/桌面应用/session-rebuild-race.test.ts`
   - 新增 `settledWithin(promise,label,facts,10_000)`；`关闭全部…` 的全部内部等待
     （firstOpen/firstStopDispose/race/stop/refresh/finally stop）改有界；超时抛带
     `refreshSettled/stopSettled` 与夹具快照的可命名失败。
   - 断言逐字不变；finally 仍释放全部 waitPoint。
4. `test/桌面应用/stuck-redispatch.test.ts`
   - 同一 `settledWithin`；C-04 开关关闭的 `pending` 裁决等待、C-04 开关开启的
     `redispatchTask`、以及两个 C-04 用例的清理 stop 均改 10s 有界。
   - 断言逐字不变（`escalated`/`pushed.length===0`/`rows.length===1`/`selected`/closed note）。

清理面逐一核对（子进程/watcher）：e2e 的 owned child 已有绝对 deadline watchdog 与 close 等待，
失败路径由 watchdog 终止并回收 fd；该文件与 driver 不创建 fs watcher；desktop 会话/文档句柄由
`desktop.stopSession()` + `disposeProjectDocuments()` 释放，driver 的 HTTP server 与采样 interval
由 hardened `dispose()` 必关。未发现第四类泄漏源。

## 六、验证

### 6.1 3× 自然退出（`node --test --test-concurrency=1 --test-timeout=300000 <file>`，外部 wall clock 600s）

| 文件 | 修复前 | 修复后 run1/run2/run3 | 自然退出 |
| --- | --- | --- | --- |
| `session-rebuild-race.test.ts` | 301s（300s 挂起） | 11s / 11s / 11s | 3/3 |
| `stuck-redispatch.test.ts` | 307s（300s 挂起） | 16s / 17s / 16s | 3/3 |
| `git-role-workflows-e2e.test.ts` | 203s | 186s / 187s / 190s（每次均从 pristine 证据目录开始） | 3/3 |

日志：`_evidence/after-{race,redispatch,e2e}-run{1,2,3}.log`、`_evidence/pre-fix-baseline-*.log`。

> e2e 本机基线说明：Q30/Q74 依赖 `角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence/`
> 目录存在（其 proof 直接 `fs.writeFile` 到该目录）；B7 已删除该目录，因此**首次/CI 干净检出**上两例必红。
> 同一 worktree 内后续 run 会被前一 run 的 Q18/Q2 重新创建该目录而转绿。为与基线/CI 同条件，
> 3× 复跑前均恢复 pristine（删除该生成目录），失败名因此逐名一致。

### 6.2 失败名对照（本机基线 → 修复后，零新增）

| 文件 | 基线失败名（修复前本机） | 修复后（3× 一致） | 判定 |
| --- | --- | --- | --- |
| `session-rebuild-race` | ①重建 dispose 等待窗口：stop A… ②重建 dispose 等待窗口：stop all… ③重建 open 等待窗口：stop A… ④关闭全部…（300010ms，cancelled） | ①②③逐字 + ④关闭全部…（10014–10023ms，fail） | 名集一致；④ 300s→10s |
| `stuck-redispatch` | ①safe 重派… ②B-07 自动换人… ③B-07 升级卡… ④C-04 decision 开关开启…（300010ms，cancelled） | ①②③逐字 + ④（10009–10014ms，fail） | 名集一致；④ 300s→10s |
| `git-role-workflows-e2e` | Q30、Q74 | Q30、Q74（每次均从 pristine 开始） | 名集一致 |

### 6.3 300s 命中与泄漏前后

| 项 | 修复前 | 修复后 |
| --- | --- | --- |
| `--test-timeout=300000` 命中 | 2（两文件各 1，三平台 CI 同样命中） | **0**；两例 ~10s 有界命名失败 |
| 8.3 短名 TEMP + Q2 query | 64.7ms 失败后 **≥120s 不退出**（外部杀死） | 0.8s 通过，**自然退出** |
| 8.3 短名 TEMP + **整文件** | ——（CI 即此条件：89 分钟静默） | **191s 自然退出**；Q2 real 351ms ✔、Q2 P2 189.8s ✔；Q30/Q74 ✖（pristine 基线同）；`fail 2, cancelled 0`（`_evidence/after-e2e-8dot3-full.log`） |
| 强制 Q2 P2 失败（`ANS_Q33_QUEUE_DIAGNOSTIC=1`，child 在 30s 有界失败） | —— | Q2 P2 30.8s 有界失败，**整文件 31s 自然退出**；child `completed:false` 且各自 dispose（`Q_DRIVER_DISPOSE_AWAITED`）（`_evidence/after-q2p2-forced-failure.log`） |
| 注入证据保存失败（dispose 顺序探针） | ——（旧时序会跳过 dispose） | dispose 4ms 返回、`serverCloseCallbacks:1`、错误如实重抛、进程自然退出（`_evidence/probe-dispose-order.log`） |
| CI Windows 静默 | 88.97 分钟（5,338,421ms） | 待 R1 轮 CI 复核（本机 8.3 整文件已自然退出） |

### 6.4 typecheck

`npm run typecheck` → `tsc --noEmit`，**EXIT=0**（`_evidence/typecheck-after.log`）。

### 6.5 未做的事（按统筹约定）

三套冻结 known-red（runtime-core 33 / 门禁 5 / 编排 24）未由本批跑，交统筹复核。

## 七、限制与披露

1. **CI 侧失败名无法本机等价验证**：Q2 real / Q2 P2 在 CI 的失败名是否转绿取决于 8.3 规范化
   后的真实业务路径，需 R1 轮 CI 观察；本机基线（无 8.3）Q2 real/Q2 P2 均绿，Q30/Q74 红。
2. **Q2 P2 失败路径已做有界强制复现**：`ANS_Q33_QUEUE_DIAGNOSTIC=1` 使 owned child 在 30s 内
   有界失败，child 输出 `Q_DRIVER_DISPOSE_AWAITED` 后以 `completed:false` 退出，父测试 Q2 P2
   30.8s 有界失败、整文件 31s 自然退出（`_evidence/after-q2p2-forced-failure.log`）。该强制条件
   只用于验证失败路径退出，不替代正常 3× 基线（后者 Q2 P2 ✔）。若 R1 仍出现 Windows 静默，
   需按 driver 的 lifecycle/teardown 证据继续定位（本轮已消除已知三类泄漏源：save→dispose 跳过、
   构造失败 server 未关、dispose 抛错 server 未关）。
3. **两个 300s 用例仍有界失败而非转绿**：`关闭全部…` 是测试 gate 与产品 stop-guard 顺序的契约
   冲突；C-04 是 e71501c 语义漂移（B4）。B1 只按计划消除挂起、保留现场诊断，不越权改产品或期望。
4. **Q30/Q74 的本地红是环境产物**：干净检出/CI 上因证据目录缺失而红；本机同一 worktree 连续
   跑会自愈。已在 3× 前恢复 pristine 以保持对照；未修改这两例。
5. **证据目录清理**：测试运行会在 `2026-11-05_git-role-permissions-evidence/` 生成未跟踪产物；
   交付前已删除，恢复 B7 后的干净状态。
