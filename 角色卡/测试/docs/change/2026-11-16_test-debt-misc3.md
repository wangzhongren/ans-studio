# B7 前置收尾批 3：R6 新增 3 项（b31 / ENOTEMPTY / compatibility-loopback）+ W-J5

- 日期：2026-11-16
- 角色：ANS「测试」（roleId: 测试）
- 工作树：`.claude/worktrees/misc3`（分支 `fix/test-debt-misc3`，起点 `d1f256f` = `origin/main`）
- 范围：
  1. **b31 路径 B（x64-only，R6 新增）**：按 x64 工件错误体定性平台时序/产品/测试假设；本机复跑；按结论修复或标注平台候选。
  2. **multi-runtime `actual Core request_choice abort`（Windows-only，ENOTEMPTY）**：按 Windows CI 错误体与 B0/B7 同类清理缺口修复（有界清理）。
  3. **compatibility-loopback（Windows-only，原生 libuv 断言）**：本机复现/压测；原生 infra flake 则文档化（不改语义）。
  4. **W-J5/J15（x64 180s）**：确认 runner 性能后记录为预算说明/平台候选，不改文件。
  5. 修改文件全文件 3× 自然退出；目标名转绿或明确分类；零新增；`npm run typecheck`。
- 约束遵守：只改上述测试文件 + 本记录/`_evidence/`；**未改产品/workflow/release.yml/角色卡/边界/其他测试**；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 数据源：
  - R6 分析（`2026-11-16_remediation-plan-r6-update.md` 与 `_r6-evidence/`），GitHub Actions run **43848313583**（`main @ 82dc180`，Node **24.14.0**，R6 起命令含 `--test-force-exit`，由 cife #121/`9a97ac1` 引入）；
  - Windows x64 工件 `test-logs-win-x64/test-ci-output.log`、macOS x64 工件 `test-logs-mac-x64/test-ci-output.log`（原始工件在 `/tmp/r9-art`，不入库；摘录见 `_evidence/01-r6-ci-evidence.txt`）；
  - W-J5 既有证据：`2026-11-16_test-debt-misc-closeout.md`（R5 三平台对照与本机 3×）；
  - 本机：Windows 11 Pro x64 / Node **v24.22.1** / Git 2.55.0.windows.5。

## 0. 摘要

1. **b31 路径 B 定性为测试侧单事件屏障假设（非产品缺陷）**：`executeReleaseMerge` 先 append `release.merged`（发布账本），再由 `completeReleaseWorkflow` 在后续 await 才 append `stage.completed B4` + `workflow.closed delivered`（workflow 账本）。R6 用例只等 `release.merged` 就立即读 workflow 账本；慢 x64 runner 上后者尚未落盘 ⇒ `closed.outcome` `undefined ≠ delivered`（b31:819）。**改法**：屏障改为等待最终投影（`release.merged` 且 `deriveWorkflowView().closed.outcome==="delivered"`），断言逐字保留。本机全文件 3× **9/9 绿**。
2. **multi-runtime ENOTEMPTY 定性为 Windows 临时目录清理竞态（flare，非产品）**：测试体通过后，finally 的 `fixture().cleanup()` 在 `fs.rmSync` 抛 `ENOTEMPTY`（`ans-d1-ect9pu`，8.3 短名 TEMP）。按 B0/B7 同类缺口，为 `fixture()` 与 `projectRoots()` 两处 `rmSync` 增加有界重试（`maxRetries:10, retryDelay:50`；Node 仅对 EBUSY/EMFILE/ENFILE/ENOTEMPTY/EPERM 重试，耗尽仍上抛）。本机全文件 3× **39/39 绿**。
3. **compatibility-loopback 定性为 Node/Windows 原生 infra flake（平台候选）**：`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76`，发生在三个真实子用例（Claude/Codex/Pi）全部 ✔ 之后的**进程收尾期**；非用例断言、非产品错误。R6 是首次启用 `--test-force-exit` 的一轮（R5 无此事件）。本机 CI 同口径 **8× 全绿**（含并发负载下 5×，2.49–3.15s/次），原生断言 0/8。**不改文件**（文件已用 `removeTempDirEventually` 有界清理）；R7 观察，复发由 owner 决定隔离该文件与 force-exit 或 Node 版本升级。
4. **W-J5/J15 维持平台/runner 性能候选（预算说明，不改文件）**：x64 R3/R5/R6 三度 180s，**无断言失败**，恰在测试自带 180s 上限；R6 x64 总耗时 2,680,564.56ms（44m40.6s）为 Windows 1,553,909.97ms（25m53.9s）的 **1.73×**（R5 x64/arm64 为 1.95×）。按 Windows ✔ 69.5s × 1.73 ≈ 120s 预期 x64 正常耗时，180s 只有 ~1.5× 余量（arm64/Windows ~2.5×）。本机 3× **61.4 / 64.0 / 64.9s 绿**。
5. **验证汇总**：两个修改文件全文件 3× 自然退出全绿（b31 9/9、multi-runtime 39/39）；compatibility-loopback 8× 绿；W-J5 3× 绿；`npm run typecheck` **EXIT=0**；修改文件内零新增失败名；`git status` 仅两个测试文件 + 本记录/证据。

## 1. b31 路径 B（x64-only）：测试侧屏障修复

### 1.1 R6 CI 证据（判定依据）

- 平台：**macOS x64-only**（Windows 同轮绿；arm64 job 级 cancelled 无工件）。
- 工件（`test-logs-mac-x64/test-ci-output.log`）：
  - L7372 `test at test/桌面应用/b31-fixed-release-auto-desktop.test.ts:769:1`；
  - L7373 `✖ 路径 B：B3 accepted（+运营报告）⇒ 自动呈 merge-main；客户 approve ⇒ 合并 + 交付关闭（不要求 A12b/归档） (1471.218496ms)`；
  - L7375–L7380 `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: + undefined - 'delivered'`，位置 `b31-fixed-release-auto-desktop.test.ts:819:12`。
- 集合证据：`16-platform-diff.tsv` 该名平台列为 `x64`；`17-windows-coverage.tsv`（Windows 51 名全量）无此名。

### 1.2 定性：测试假设问题（产品顺序本身是设计）

- 失败断言（b31:819）是 `view.closed?.outcome === "delivered"`；`view.closed` 来自 `workflow.closed`（`src/common/编排/workflow-state.ts:309`）。
- 产品顺序（`src/common/编排/workflow-service.ts` `executeReleaseMerge`）：
  1. `appendReleaseEvent(release.merged)` 先落**发布账本**；
  2. `await completeReleaseWorkflow(...)` 再读账本并 append `stage.completed B4` 与 `workflow.closed delivered` 到 **workflow 账本**。
- 用例只等 `release.merged`（发布账本）就立即读 workflow 账本。两者之间存在跨账本、跨多个 await 的窗口；x64 慢 runner 上窗口被放大 ⇒ 读到 `closed` 尚未出现。**不是产品竞态/丢写**：顺序是「合并事实先持久化、收口后持久化」的有意设计；先观察 `release.merged` 的读者本来就可能看到尚未关闭的 workflow。
- 平台相关性：x64 runner 总耗时 1.73–1.95× 于 Windows/arm64，首见且单次；本机 Windows 修改前 3× 全绿（未复现）。

### 1.3 改法（断言不放宽）

将屏障从「只等 `release.merged`」扩展为「等最终投影收敛」：

```ts
await until(async () => {
  const releases = (await readReleaseLedger(root)).events.filter((event) => event.workflowId === WF_B);
  if (!releases.some((event) => event.kind === "release.merged")) return false;
  const view = deriveWorkflowView(
    (await readWorkflowLedger(root)).events.filter((event) => event.workflowId === WF_B),
    (await readTaskState(root)).events,
  );
  return view.closed?.outcome === "delivered";
}, "B3 accepted 后应自动呈 merge-main、由客户确认合并并交付关闭（workflow.closed delivered）");
```

- 用例名、后续全部断言（release 顺序/客户确认/`closed.outcome==="delivered"`/HEAD/tag/remote/B4 单次）逐字保留；fail 时超时标签更准确地指向「交付关闭未收敛」。
- 未改产品代码；未改其他用例。

### 1.4 本机结果（Windows x64）

| 阶段 | run | exit | tests | pass | fail | duration_ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 修改前（目标名） | 1 | 0 | 1 | 1 | 0 | 3,699.8832 |
| 修改前（目标名） | 2 | 0 | 1 | 1 | 0 | 1,661.2319 |
| 修改前（目标名） | 3 | 0 | 1 | 1 | 0 | 1,629.7586 |
| 修改后（目标名） | 1 | 0 | 1 | 1 | 0 | 1,842.9181 |
| 修改后（目标名） | 2 | 0 | 1 | 1 | 0 | 1,742.3523 |
| 修改后（目标名） | 3 | 0 | 1 | 1 | 0 | 1,732.6159 |
| 修改后（全文件） | 1 | 0 | 9 | 9 | 0 | 6,393.8903 |
| 修改后（全文件） | 2 | 0 | 9 | 9 | 0 | 6,597.1286 |
| 修改后（全文件） | 3 | 0 | 9 | 9 | 0 | 6,399.7545 |

原始输出：`_evidence/runs/b31-{before,after}-run{1,2,3}.txt`、`_evidence/runs/b31-full-after-run{1,2,3}.txt`。
**结论**：本机无法复现 x64-only 时序；修复为测试侧有界等待，语义等价且断言更不易误报。CI 复验随 R7。

## 2. multi-runtime `actual Core request_choice abort`（Windows-only，ENOTEMPTY）：有界清理

### 2.1 R6 CI 证据

- 平台：**Windows-only**（macOS x64 绿）。
- 工件（`test-logs-win-x64/test-ci-output.log` L7321–L7334）：
  - `✖ actual Core request_choice abort preserves accepted/current facts, expires the old decision and allows one explicit next prompt (138.8177ms)`；
  - `Error: ENOTEMPTY, Directory not empty: \\?\C:\Users\RUNNER~1\AppData\Local\Temp\ans-d1-ect9pu`；
  - 栈：`Object.rmSync (node:fs:1221:18)` ← `Object.cleanup (multi-runtime.test.ts:58:71)` ← 用例 finally（`:1093:81`）；`errno: 41, syscall: 'rm'`。
- 用例主体（request_choice/abort 语义）在清理前已通过；失败仅发生在临时目录删除。

### 2.2 定性：Windows 清理竞态（与 B0/B7 同类缺口）

- `fixture()` 的 `cleanup()` 用裸 `fs.rmSync(root, {recursive:true, force:true})`；Windows 上防病毒/索引器可在 rm 遍历目录后、删除根目录前短暂持有子项句柄，使本已空的目录再次「非空」⇒ `ENOTEMPTY`。
- 路径位于 8.3 短名 TEMP（`RUNNER~1`）下，与 B3c 记录的 Windows CI 环境特征一致；`force` 不能消除该竞态。
- 非产品行为、非断言失败；归类 **Windows flare / 夹具清理缺口**，与 B0/B7 已采用的 `fs.rm` 有界重试同一处置。

### 2.3 改法（有界、不掩盖失败）

`test/桌面应用/multi-runtime.test.ts` 两处清理统一为：

```ts
fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
```

- 覆盖 CI 实际失败的 `fixture()`（`ans-d1-*`）与会话根 `projectRoots()`（`ans-d1-roots-*`）。
- Node `rmSync` 的 `maxRetries/retryDelay` 仅对瞬时码（EBUSY/EMFILE/ENFILE/ENOTEMPTY/EPERM）重试；上界 10×50ms，**耗尽仍抛错**，不把真实清理失败伪装成功。
- 未改产品、未删/放宽任何断言或 skip。

### 2.4 本机结果（Windows x64）

| 阶段 | run | exit | tests | pass | fail | duration_ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 修改前（目标名） | 1 | 0 | 1 | 1 | 0 | 707.0241 |
| 修改前（目标名） | 2 | 0 | 1 | 1 | 0 | 557.7334 |
| 修改前（目标名） | 3 | 0 | 1 | 1 | 0 | 545.6447 |
| 修改后（全文件） | 1 | 0 | 39 | 39 | 0 | 1,431.7717 |
| 修改后（全文件） | 2 | 0 | 39 | 39 | 0 | 1,435.06 |
| 修改后（全文件） | 3 | 0 | 39 | 39 | 0 | 1,394.8872 |

原始输出：`_evidence/runs/multi-runtime-{before-run1..3,full-after-run1..3}.txt`。
**结论**：本机（Windows 11，TEMP 非短名、无 CI 级 AV 压力）未复现 ENOTEMPTY；修复覆盖 CI 实际栈点并保持失败可见性。CI 复验随 R7。

## 3. compatibility-loopback（Windows-only）：Node 原生 infra flake（文档化，不改文件）

### 3.1 R6 CI 证据

- 平台：**Windows-only**；file-level（`01-ci-failures.json`：x64 `fileLevelNames=[]`，Windows 2 行同一文件）。
- 工件（`test-logs-win-x64`）：
  - L3451/L7372：`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76`；
  - `✖ test\测试\g5-reasoning-verify\compatibility-loopback.test.ts (3628.4306ms)`，`test at …:1:1`，失败体 `'test failed'`。
- 崩溃前三子用例均 ✔：独立真实 Claude 1405.32ms / Codex 1051.2132ms / Pi 646.8608ms。
- 历史：R5 无此事件；R6 是首次带 `--test-force-exit` 的测试 CI（cife #121，`9a97ac1`）。

### 3.2 定性

- `UV_HANDLE_CLOSING` / `src\win\async.c:76` 是 **libuv 原生断言**：`uv_async_send` 命中正在关闭的 async handle；发生在全部子用例通过后的**进程退出/收尾期**，所以 Node test runner 只能报 file-level 'test failed'。
- 与用例断言、产品逻辑、夹具清理均无关；`helpers.removeTempDirEventually` 已是有界异步清理（20×100ms，瞬时码白名单）。
- 加重因素假设（未能在本机证实）：`--test-force-exit` 在 Windows 上于原生句柄关闭中途强制退出；CI Node 24.14.0（本机 24.22.1）。归类 **Node/Windows native-infra crash + 平台候选**。

### 3.3 本机复现/压测

| run | 口径 | exit | tests | pass | fail | duration_ms |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | CI 同口径（concurrency=1/timeout=300000/force-exit） | 0 | 3 | 3 | 0 | 3,146.533 |
| 2 | 同上 | 0 | 3 | 3 | 0 | 2,507.4858 |
| 3 | 同上 | 0 | 3 | 3 | 0 | 2,493.8153 |
| 4 | 同上（与 W-J5 后台并发） | 0 | 3 | 3 | 0 | 2,576.8311 |
| 5 | 同上（并发） | 0 | 3 | 3 | 0 | 2,537.6231 |
| 6 | 同上（并发） | 0 | 3 | 3 | 0 | 2,488.3501 |
| 7 | 同上（并发） | 0 | 3 | 3 | 0 | 2,561.2608 |
| 8 | 同上（并发） | 0 | 3 | 3 | 0 | 2,545.4936 |

原生断言 **0/8**；原始输出 `_evidence/runs/compat-loopback-before-run{1..8}.txt`。
**处置**：不改文件、不改产品。R7 Windows 复现则按 owner 决策：隔离该文件与 `--test-force-exit` 的组合，或升级/固定 Node 版本；单次事件不触发测试语义改写。

## 4. W-J5/J15（x64 180s）：预算说明/平台候选（未改文件）

### 4.1 CI 事实（R3/R5/R6 三度 x64-only）

- R6 `14-timeouts-and-stall.json`：仅 x64 一条 `maxDurationMs=180003.746956`、`count=2`；失败体 `test timed out after 180000ms`，**无任何断言失败/产品错误**；Windows 0 条；arm64 无工件。
- 历史：R3 x64-only 180s；R4 三平台未复现；R5 x64-only 180s；R6 x64-only 180s。
- 同轮/历史对照：R5 arm64 ✔ 71132.148208ms；Windows ✔ 69523.6045ms；本机（misc 批）3× 63.9/65.0/65.1s。

### 4.2 runner 性能确认（R6 顶层汇总）

| 平台 | tests | duration_ms | 相对 |
| --- | ---: | ---: | --- |
| macOS x64 | 5,825 | 2,680,564.56 | Windows 的 **1.73×**（R5：arm64 的 1.95×） |
| Windows x64 | 5,826 | 1,553,909.97 | — |
| macOS arm64 | —（job cancelled，无工件） | — | — |

- 按 Windows W-J5 ✔ ~69.5s × 1.73 ≈ **120s** 推 x64 正常耗时；测试自带 180s 上限只有 **~1.5×** 余量（arm64/Windows 约 2.5×）。x64 满载时越过 180s 与 runner 负载/性能解释一致。
- **无测试缺陷证据**：无断言失败、无挂起栈、超时恰在上限；本机 3× 绿。
- **处置**：不改文件（180s 自带上限保持；提高上限只会掩盖潜在 x64 性能/泄漏问题）。记录为**预算说明/平台候选**；R7 若 x64 第四次复现，建议 owner 启动 x64 性能专项或单列测试预算调整（本批不排修）。

### 4.3 本机 3×（无人为并发负载）

| run | exit | tests | pass | fail | duration_ms | wall_ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | 1 | 1 | 0 | 61,419.1093 | 61,485 |
| 2 | 0 | 1 | 1 | 0 | 63,978.7116 | 64,036 |
| 3 | 0 | 1 | 1 | 0 | 64,858.0022 | 64,927 |

原始输出：`_evidence/runs/wj5-clean-run{1,2,3}.txt`。

### 4.4 附带观测：并发负载下的 Node 原生断言（非用例失败）

- 首次 3× 中的 run3 与同批其他测试/命令时间窗重叠，进程在 ~59.9s 处触发 **Node 原生断言**：
  `node::CleanupQueue::Add ... Assertion failed: (insertion_info.second) == (true)`，JS 栈指向 `node:internal/async_hooks` destroy 追踪 × `git-command.ts:551/555`（`noLinks` 递归 `readdir/lstat`）；file-level 'test failed'，**无用例断言失败**。
- 原始输出保留为 `_evidence/runs/wj5-run3-loadcrash.txt`（不计入本批 3× 结论）。
- 与 §3 的 `UV_HANDLE_CLOSING` 同为 **Node 原生 infra 断言**（不同断言点），提示本机/CI 的原生断言类事件与进程收尾/负载相关；清除并发负载后的 3× 全绿（§4.3）。

## 5. 验证汇总

| 文件 | 修改 | 全文件 3× | 目标名 | 其余名 |
| --- | --- | --- | --- | --- |
| `test/桌面应用/b31-fixed-release-auto-desktop.test.ts` | 屏障等待最终投影 | **9/9 ×3 自然退出** | 路径 B ✔ 1.73–1.84s | 无变化（全绿） |
| `test/桌面应用/multi-runtime.test.ts` | 两处 `rmSync` 有界重试 | **39/39 ×3 自然退出** | request_choice abort ✔ | 无变化（全绿） |
| `test/测试/g5-reasoning-verify/compatibility-loopback.test.ts` | **未改**（文档化） | 8× 绿（CI 同口径） | 原生断言 0/8 | — |
| `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` | **未改**（预算说明） | 3× 绿 61.4–64.9s | W-J5 ✔ | — |

- `npm run typecheck` ⇒ **EXIT=0**（`_evidence/04-typecheck.txt`）。
- 修改文件内**零新增失败名**；未新增 skip/todo；未删用例。
- `git status`：仅两个测试文件修改 + 本记录/`_evidence/`；未 commit/push、未触发 CI、未 tag、未碰 main、未读 `.env`、未占 9222/9223/9224。

## 6. 剩余与平台候选

| 项 | 平台 | 状态 | 分类 / 建议 |
| --- | --- | --- | --- |
| b31 路径 B | x64-only | **已修（测试侧屏障）** | 本机 3×/全文件 3× 绿；R7 x64 复核 |
| multi-runtime ENOTEMPTY | Windows-only | **已修（有界清理）** | 本机 3× 绿；R7 Windows 复核 |
| compatibility-loopback 原生崩溃 | Windows-only | 未改（文档化） | Node/Windows native-infra 平台候选；R7 复发由 owner 决策隔离/Node 版本 |
| W-J5 180s | x64-only | 未改（预算说明） | 平台/runner 性能候选；R7 第四次复发则 x64 性能专项或预算调整 |
| W-J5 并发负载下 CleanupQueue 原生断言 | 本机观测 | 未改（文档化） | Node native-infra；与本批目标无关，不在 3× 结论内 |

**产品候选**：本批三项均未发现确定性产品缺陷（b31 为测试假设；ENOTEMPTY 为清理竞态；loopback 为原生 infra）；产品代码零改动。

## 7. 证据边界与披露

1. **本机仅 Windows 11 x64、Node v24.22.1**；b31（x64 macOS）与 Windows CI 环境（Node 24.14.0、8.3 短名 TEMP、AV/索引器）无法在本机等价复现；CI 结论引用 R6 工件，修复后由 R7 复验。
2. **一次单事件 = 分类上限**：b31、ENOTEMPTY、loopback 均为 R6 首次观测；本批按错误体 + 代码顺序定性，不主张永久根因。
3. **loopback 为 file-level 原生断言**：Node test runner 只能报 `'test failed'`；崩溃前子用例全绿。`--test-force-exit` 为 R6 新增变量，但本机无法复现（8×），其因果未被证实，只作加重因素假设披露。
4. **W-J5 未改**：不改 180s 上限；本机首次 3× 的 run3 原生断言（CleanupQueue）独立披露（§4.4），不作为 W-J5 结论样本；清除负载后 3× 全绿。
5. **未做**：未在 macOS 本机复跑；未触发 CI；未改 workflow/release.yml（`--test-force-exit` 仍按 cife 批准保留在开发反馈通道）。
6. **零新增口径**：以修改文件全文件 3× 全绿为准；不同名/新名未出现。

## 附录 A：证据索引（`角色卡/测试/docs/change/2026-11-16_test-debt-misc3_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `01-r6-ci-evidence.txt` | R6 工件四处摘录（b31/ENOTEMPTY/loopback/W-J5）与判定 |
| `02-verification-runs.tsv` | 本机全部运行逐条（exit/tests/pass/fail/duration_ms） |
| `03-diff.diff` | 两个修改测试文件的完整 diff |
| `04-typecheck.txt` | `npm run typecheck` 输出 + EXIT=0 |
| `05-wj5-budget.txt` | W-J5 runner 性能对比与预算说明摘录 |
| `runs/b31-{before,after}-run{1,2,3}.txt` | b31 修改前/后目标名原始输出 |
| `runs/b31-full-after-run{1,2,3}.txt` | b31 修改后全文件 3× 原始输出 |
| `runs/multi-runtime-before-run{1,2,3}.txt` | multi-runtime 修改前目标名原始输出 |
| `runs/multi-runtime-full-after-run{1,2,3}.txt` | multi-runtime 修改后全文件 3× 原始输出 |
| `runs/compat-loopback-before-run{1..8}.txt` | compatibility-loopback CI 同口径 8× 原始输出 |
| `runs/wj5-clean-run{1,2,3}.txt` | W-J5 无人为并发负载 3× 原始输出 |
| `runs/wj5-run3-loadcrash.txt` | W-J5 并发负载下 Node 原生 CleanupQueue 断言原始输出（附带观测） |
| `runs/wj5-run{1,2}.txt` | W-J5 首次批次前两轮原始输出（run3 见上） |

## 附录 B：复现命令

```bash
# b31 目标名（x64 时序屏障）
node --test --test-timeout=300000 --test-name-pattern "路径 B：B3 accepted" "test/桌面应用/b31-fixed-release-auto-desktop.test.ts"
# b31 全文件
node --test --test-timeout=300000 "test/桌面应用/b31-fixed-release-auto-desktop.test.ts"

# multi-runtime 目标名 / 全文件
node --test --test-timeout=300000 --test-name-pattern "actual Core request_choice abort" "test/桌面应用/multi-runtime.test.ts"
node --test --test-timeout=300000 "test/桌面应用/multi-runtime.test.ts"

# compatibility-loopback（CI 同口径）
node --test --test-concurrency=1 --test-timeout=300000 --test-force-exit "test/测试/g5-reasoning-verify/compatibility-loopback.test.ts"

# W-J5（未改）
node --test --test-timeout=300000 "test/测试/2026-11-09_judge-delegated-effectiveness.test.ts"

npm run typecheck
```
