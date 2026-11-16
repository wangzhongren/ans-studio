# R9 残差错误体摘录（run 43887939365）

> 原始工件在 `/tmp/r11-art/test-logs-{mac-arm64,mac-x64,win-x64}/test-ci-output.log`（不入库）。
> 本文件只摘录归因所需的断言/栈/错误体；完整块可由日志复核。

## 1. Git team plan publication（三平台同错，确定性）

- 测试：`test/编排/git-capabilities.test.ts:515`
  `Git team plan publication and active-only activation: real tasks and structured bytes preserve document/execution authority`
- 失败断言：`git-capabilities.test.ts:658:101`
  `const activeCloseBasis = await service.prepareCreatedTaskClose(nominationTaskId, "chief"); assert.ok(activeCloseBasis.ok, JSON.stringify(activeCloseBasis));`
- 错误体（三平台逐字相同）：

```text
AssertionError [ERR_ASSERTION]: {"ok":false,"code":"trunk-item-invalid","message":"Error: git-journal-directory-invalid"}
    at TestContext.<anonymous> (file:///.../test/编排/git-capabilities.test.ts:658:101)
```

- 产品抛出点：`src/provider/trunk/impl/git-command.ts:446`
  `if (!info.isDirectory() || info.isSymbolicLink() || await realpath(dir) !== dir) throw new Error("git-journal-directory-invalid");`
  调用链：`prepareCreatedTaskClose` → `listGitOperationJournals(root)`（`base = path.join(root, ".ans/trunk/operations")`）。
- 夹具根：`test/编排/fixtures/trunk-project.ts:58-59`
  `makeRoot() { return fs.mkdtemp(path.join(os.tmpdir(), "ans-trunk-service-")); }`（未 canonicalize）。
- 平台机理：macOS `os.tmpdir()` = `/var/folders/...`，`realpath` → `/private/var/...`；Windows runner `os.tmpdir()` = `C:\Users\RUNNER~1\AppData\Local\Temp\...`，`realpath` → `C:\Users\runneradmin\...`。两条路径都使 `realpath(dir) !== dir`。
- 同文件先例：`test/编排/git-command.test.ts:41-43`（B6a）已用 `fs.realpath(await fs.mkdtemp(...))` 持有规范根；本夹具未采用。

## 2. Q2 P2 first new project

- 测试：`test/测试/git-role-workflows-e2e.test.ts:35`；测试声明在 `:2306`
  `test(firstNewBusinessName, { timeout: firstNewBusinessTimeoutMs() }, runFirstNewBusinessCase);`
  `firstNewBusinessTimeoutMs()` 在 CI 父进程返回 **300000**（`:1310`）。
- 子进程绝对预算：`runOwnedCompleteBusinessChild` `:1317-1319`
  `const deadlineAt = Math.min(Date.now() + 300000, outerDeadlineAt - 30000);`
  看门狗 `:1341` 在 `deadlineAt` 用 SIGTERM 杀子进程。

### arm64（258,059.9ms，自然失败）

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
1 !== 0
    at runOwnedCompleteBusinessChild (.../git-role-workflows-e2e.test.ts:1347:88)
    at async TestContext.runFirstNewBusinessCase (.../git-role-workflows-e2e.test.ts:1387:73)
```

`1347:88` = `assert.equal(row.exitCode, 0)`（子进程 EXIT 事件 exitCode=1）。子进程内部首要错误：

```text
AggregateError: Actual NEW failure and cleanup/evidence errors; no failure suppressed
  [errors]: [
    Error: Q2_TIMEOUT actual worker required surface / scoped write; {"errors":[],"requests":108,"waits":{"cycles":[],"orphan":[],"external":[]}}
        at Timeout.<anonymous> (file:///.../test/测试/git-role-workflows-driver.ts:740:56),
    Error: 项目正在处理派发或权限变更，选择尚未更改。请稍后重试。
        at changeProjectSource (file:///.../app/desktop/interface.ts:1083:30)
        at Object.disposeProjectDocuments (.../app/desktop/interface.ts:2449:7)
  ]
```

### Windows（278,365.6ms，自然失败）

与 arm64 同一断言（`:1347:88`）与同一子进程首要错误：

```text
Error: Q2_TIMEOUT actual worker required surface / scoped write; {"errors":[],"requests":106,"waits":{"cycles":[],"orphan":[],"external":[]}}
```

（主机更换，`requests` 106；无 `Q15_WORKER_OPEN_BLOCK`、无 cycles/orphan/external wait edge。）

### x64（300,000.3ms，测试级超时）

```text
✖ Q2 P2 ... (300000.337007ms)
  'test timed out after 300000ms'
```

子进程标记止于 `Q_PERSISTED_CHILD_OBSERVED`（见 `04-q2p2-timeline.tsv`），无 `Q2_TIMEOUT` 行——父测试先到 300s 上限；子进程绝对预算（300s）即将到期。

## 3. W 家族（W29×3 / W30×2 / W34；x64+Windows）

### 3.1 W29×3、W30×2（共享断言，`:1945`）

- 断言：`test/桌面应用/chief-workflow.test.ts:1945`
  `await waitFor(() => events.filter(e => e.roleId === "product" && e.event.kind === "settled").length >= 3 && !desktopProjectExecutionInventory(root).activeDeliveries.some(row => row.roleId === "product") && closeBasis !== undefined, "Actual publication/notice turns must settle and creator basis arrive");`
- 错误体以断言消息 + 全量 `trace` 串联（`waitFor` 在 `:1804` 抛出 `message + JSON.stringify(trace)`）。
- trace 尾部逐字特征（x64 五名与 Windows 四名共享同一决定性行，仅行序不同；见 `05-chief-workflow-trace-labels.md`）：
  - `[25/26] role=product ... W21 publish actual material then report`（派发已到 product）；
  - 随后 chief 收到 `[工作结果] ... 来源角色：product | 状态：failed | 摘要：本轮执行超时……本轮未提交正式任务报告`；
  - 之后 `[应用·文档更新] version-upgrade ... applied` 通知行到达 chief/convener/product。
  - 因而 `closeBasis`（由 `:1786-1789` 的 `[工作结果] ... W21 publication completed` 分支写入）永远不产生；`waitFor` 默认 6500ms 耗尽。
- “本轮执行超时”来源：`src/common/编排/handback.ts:543`，仅由 `timed_out` 终态产生；`timed_out` 在 `src/model/runtime.ts:4116` 注释保留给 `turnLastResortMs`。测试注入：`chief-workflow.test.ts:1813`
  `runtimeOptions: { ..., requestFirstByteTimeoutMs: 1500, turnLastResortMs: 4500 }`。

### 3.2 W34（Windows 9,535.4ms 断言；x64 18,001.1ms 超时）

- Windows 首个失败：`chief-workflow.test.ts:1915`
  `The actual first publication and creator-close must finish before measuring team dispatch`
  trace 尾部：`[26] product 派发` → `[27] NOTICE role=chief`；无 `w34-close-publication`（product 未产出 `W21 publication completed` 回交）。
- x64：`'test timed out after 18000ms'`；测试声明 `:1703` 对 teamPlanning 预算为 **18000ms**，而 product 通知等待 `:1934` 为 `documentChange ? 20_000 : 3_500`（teamPlanning 属 documentChange）——**等待预算大于用例预算**。日志同轮 `W52 fixture primary failure before teardown AssertionError: The actual first publication ...`（`:1915:7`）证明超时前发布/关闭未完成；trace 停在 product 派发（无通知行）。

### 3.3 W35（x64 30,001.6ms 超时；Windows 通过）

- 首要错误（`W52 fixture primary failure before teardown`）：

```text
Error: Core registry not quiescent for W21 variant role-preparation-missing-plan pre-open: [
 {"sessionId":"ca24da13-dc21-4882-b422-48e3476cc312","roleId":"product","runtime":"codex","state":"disposing",
  "projectRoot":"/var/folders/20/jp1_0n3n7kndh6rnbqb5344m0000gn/T/ans-w21-notice-go164m","reasons":[]}]
    at waitForCoreRegistryQuiescent (.../chief-workflow.test.ts:117:37)
    at async TestContext.<anonymous> (.../chief-workflow.test.ts:1811:5)
```

- 同一条目来自 W34（team-planning）超时后的 teardown：`B1b Core registry not quiescent for W21 variant team-planning teardown: [ca24da13 ... state=disposing ... projectRoot=.../ans-w21-notice-go164m]`。
- 结论：W35 x64 是 W34 的级联（前一变体 product 会话在 dispose 中滞留，pre-open 15s 有界等待后抛出；随后 teardown 再耗时至 30s 用例预算）。

## 4. AC-4（x64 only）

```text
✖ AC-4：Claude convener 在受保护项目完成任务/回合内 git_publish delivery 完整链… (300002.347342ms)
  'test timed out after 300000ms'
```

- 测试无 per-test timeout 选项（`test/测试/git-action-delivery-claude-e2e.test.ts:34`，纯 `test(name, async () => {})`），受 CI CLI `--test-timeout` 约束。
- 同轮通过：arm64 106,215.5ms；Windows 138,943.3ms。
- 历史：R8（run 43867573699）x64 通过 **246,302.4ms**（见 `09-budget-evidence.md`）。

## 5. W-J5（x64 only）

```text
✖ W-J5/J15：judge 代批 intent 冻结 → verifyReviewIntent → judge D3 经 Runtime 包装层激活 → pin/run；非法 d3-by 仍负例 (180002.752092ms)
  'test timed out after 180000ms'
```

- 显式 per-test timeout：`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts:55`
  `test("W-J5/J15：…", { timeout: 180000 }, async context => {`
- 同轮通过：arm64 81,767.3ms；Windows 101,995.5ms。R8：arm64 65,780.2ms / Windows 73,191.5ms；x64 180,003.4ms（连续两轮 180s 触顶）。

## 6. Git final spawn fence（arm64 only）

- 测试：`test/编排/git-command.test.ts:45`；失败断言 `:88:12`
  `assert.equal(cancelled.length, 1, "The never-launched path must record exactly one explicit pre-spawn cancellation");`
  实际 `0 !== 1`；耗时 227.4ms；`launched.length === 0` 分支。
- 过程事实：`processFacts.length === 0`（`:80` 断言通过），即被中断的 prepare 未持久化任何进程记录。
- 同轮通过：x64 1,511.4ms；Windows 1,200.4ms。
- 历史对照（R8，旧测试）：arm64 与 x64 均以
  `AssertionError: The input did not match /git-command-failed:null:unknown/. Input: 'Error: git-host-lease-invalid-before-command'`
  失败，栈为 `executeGit (git-command.ts:728:137)`；证明早期 lease 失效路径的消息就是 `git-host-lease-invalid-before-command`，且 arm64 在 R9 出现的正是“无任何进程记录”的同一路径（第三路）。详见 `11-spawn-fence-third-route.md`。

## 7. Windows 重启 orphaned/expired（149.3ms）

- 测试：`test/桌面应用/pending-card-restart.test.ts:29`；失败点在 `finally` 清理 `:87`
  `await fs.rm(root, { recursive: true, force: true });`
- 错误体：

```text
[Error: ENOTEMPTY: directory not empty, rmdir 'C:\Users\RUNNER~1\AppData\Local\Temp\ans-pending-restart-DGo74B\.ans\state']
{ errno: -4051, code: 'ENOTEMPTY', syscall: 'rmdir', path: '...\\.ans\\state' }
```

- 同轮：arm64 101.4ms 通过；x64 139.7ms 通过。Windows-only 清理竞态（`mgr.stop(null)` 后异步落盘与递归删除）。
