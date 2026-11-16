# 测试债 x64 follow-up：macOS x64-only 残差（R8 后续）

- 日期：2026-11-16
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/x64fu`（分支 `fix/test-debt-x64-followup`，起点 `5661a73` = `origin/main`）
- 范围：R8（run 43867573699）中 macOS x64-only 残差与 arm64-only 新 flake 的夹具/等待链硬化，逐项：
  1. `git-core-in-flight-unproven` 8 名同根（W29×3 / W30×2 / W33 / W34 / W35，`chief-workflow.test.ts`）；
  2. W29 `document-change` 的 `Actual publisher notification must reach its actor`（x64）；
  3. Q2 P2 x64 300s 超时（`git-role-workflows-e2e.test.ts`，预算/优化评估）；
  4. task-restart CI 红（arm64 55.6s / x64 158.1s 等待超时，Windows 绿）；
  5. independent C Window arm64-only ENOTEMPTY（`p1p7-window-provenance-integration.test.ts`）。
- 约束：只写上述相关测试文件与本记录/`_evidence/`；未改产品、workflow、release.yml、角色卡、边界或其他测试；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 数据源（**权威**）：GitHub Actions run **43867573699**（`Test matrix (development feedback)`，`main @ 5661a73`）三平台工件，下载到本机 `/tmp/x64fu-r8-art`（Git Bash `/tmp` = `C:\Users\51054\AppData\Local\Temp`；原始工件不入库）：
  - `test-logs-mac-arm64/test-ci-output.log`（7,841 行）
  - `test-logs-mac-x64/test-ci-output.log`（8,037 行）
  - `test-logs-win-x64/test-ci-output.log`（7,816 行）
  - 与 R8 证据 `_r8-evidence/00-run-metadata.json` 的行数/字节一致。
  - **数据源更正**：任务提到的 `/tmp/r10-art` 实际是 R7/第六轮旧工件（run **43859105048**，head `d1f256f`，三平台 fail 46/47/46，见 `_r8-evidence/00-run-metadata.json` 的 `artifactNotes`）；本轮按任务备选路径重新 `gh run download 43867573699` 到 `/tmp/x64fu-r8-art` 后分析。
- 方法：自写提取脚本（`_evidence/scripts/extract-fails.mjs` / `registry-dump.mjs` / `trace-summary.mjs`）逐块解析工件；本机 Windows 3× 自然退出复核。

## 0. 摘要

R8 x64 的 9 名 `chief-workflow.test.ts` 红名是**一条级联链**：`W29 document-change` 在 11.4s 因「发布通知未到达 actor」超时（慢 runner 上发布应用 + 通知投递超过旧 6500ms 窗口），失败后的 teardown 把仍在发布回合中的 product Core 会话停在 `disposing`；该条目随后被产品守卫 `git-core-in-flight-unproven` 命中，后续 8 个变体在 convener 的 `git_candidate init` 上 0.4–0.6s 快失败。x64 工件 9 次 init 的注册表转储直接证明：第 1 次（document-change）无在途条目；第 2–9 次（wrong-flow/source-loss/missing-confirmation/W30×2/W33/W34/W35）同一 `product` 会话 `43f07f15-…` 始终 `state=disposing`；arm64 对照转储无任何在途条目。

修复口径（全部只动夹具，**零断言放宽**）：
- `chief-workflow.test.ts`：新增有界 `waitForCoreRegistryQuiescent`（pre-open 超时抛带 entry 诊断的错误；teardown 只记录诊断），在参数化用例 pre-open、W30 真实重启、finally 三处等待真实注册表离开 `preparing/creating/disposing`；documentChange 变体的通知等待 6500→20000ms、测试预算 12000→30000ms，失败时附 product 投递/队列/Core 在途诊断。
- `task-restart.test.ts`：恢复投递等待 5000→30000ms、`task.delivered` 落盘等待 5000→15000ms（真实 pinned run 准备已占大部分用例时长）。
- `p1p7-window-provenance-integration.test.ts`：`rmSync` 加 `maxRetries:10 / retryDelay:100`（B0/B7 同法）。
- Q2 P2：未改（无安全语义等价缩短空间）；预算说明见 §1.3。

验证：三个修改文件全文件 **3× 自然退出全绿**（chief-workflow 66/66、task-restart 2/2、p1p7 3/3，EXIT=0）；`npm run typecheck` EXIT=0。x64 行为待下一轮 x64 CI 复核。

## 1. 逐名定性（x64 工件引用）

行号均指 run 43867573699 的 checkout（`5661a73`）；本次修改后本工作树行号已平移，见 §2。

### 1.1 `git-core-in-flight-unproven` 8 名同根（W29×3 / W30×2 / W33 / W34 / W35）

x64 工件逐名（`_evidence/01-x64-target-failures.txt`）：

| 名 | duration | 首个失败体 |
| --- | --- | --- |
| W29 document-change-wrong-flow | 513ms | assert `chief-workflow.test.ts:1726:99`，tools 含 `git_candidate … status=blocked code=git-core-in-flight-unproven message="An actual Core session is still preparing/creating/disposing"` |
| W29 document-change-source-loss | 578ms | 同上 |
| W29 document-change-missing-confirmation | 450ms | 同上 |
| W30 连续写入后 | 605ms | 同上 |
| W30 真实重启迁移后 | 398ms | 同上 |
| W33 真实DocRun关闭通知 | 443ms | 同上 |
| W34 真实首文档发布 | 472ms | 同上 |
| W35 缺team | 440ms | 同上 |

根因证据（工件 `test-logs-mac-x64` 行 2423/2437–2451，`_evidence/02-x64-registry-dumps.txt`）：
- 每个变体在 convener 的 `ans_git_candidate init` 前打印 `W52 init actual Core registry`。
- 第 1 次（document-change，行 2423）非 disposed 条目 = `nominator(prepared)` + 本用例自己的 `chief(active)` / `convener(active)`，无在途；init 成功。
- 第 2–9 次（行 2437–2451）每次都含同一 `product` 会话 `43f07f15-ef5b-4ece-989f-168b265007fa`，`state=disposing`，直至最后一次转储仍在；产品守卫 `src/pipeline/orchestration/trunk-runtime.ts:215-216` 对**进程级注册表**的 `preparing/creating/disposing` 一律 fail-closed。
- arm64 对照（`_evidence/03-arm64-registry-dumps.txt`，行 2423–2442）：9 次转储均只有当前用例的 `chief/convener(active)` + `nominator(prepared)`，无 product 在途；9 名全绿。
- 该 `disposing` 条目来自前一变体（document-change）失败后的 teardown：trace 停在该 product 的发布回合（见 §1.2），teardown 的 `stopSession` 在其发布工具仍在途时触发 dispose。

定性：**夹具等待预算 + teardown 时序**，不是 file-gate/nlink 修复未生效，也不是 8 个独立产品缺陷。改动为「进入下一阶段前等待 Core registry 静止」的有界夹具等待（阈值 15s，pre-open 超时抛出带 sessionId/roleId/state/projectRoot/reasons 的错误；teardown 只保留 `B1b …` 诊断、不改变用例结果）。

### 1.2 W29 `document-change`：`Actual publisher notification must reach its actor`（x64）

- x64：11,437ms 失败（工件行 2424/2436；`_evidence/01`、`04-w29-document-change-trace.txt`）。trace 共 26 条，最后一条是 product 收到 `W21 publish actual material then report` 派发；mock 已返回 `ans_submit_version_change`，但**没有**该工具结果的后续回合，也**没有** `[应用·文档更新] … version-upgrade` 的 actor 回合。
- arm64：同名 5,836.9ms 绿；Windows：6,635.1ms 绿（同 run）。
- 机制：通知由 `queueDirectNotification`（`app/desktop/session/delivery/queue.ts:276-294`）在发布应用后入队，投递需等 product 当前发布回合结束；旧 `waitFor` 在 documentChange 上只有 6500ms，x64 慢 runner 未走完发布应用 + 通知投递。
- 改法（不放松断言）：documentChange 的通知等待预算 6500→20000ms、该用例测试预算 12000→30000ms（teamPlanning 仍 18000）；失败诊断附加 product 最近 3 条 trace 摘要、activeDeliveries、queuedDispatches、Core 在途条目。断言仍是「product actor 必须收到包含 version-upgrade 的应用文档更新」。

### 1.3 Q2 P2 first new project：x64 300s 超时

- 同 run：arm64 214,039ms 绿、Windows 195,593ms 绿、x64 `test timed out after 300000ms`（duration 300,001ms，无断言体）。
- child 时间线（`_evidence/07-q2p2-timeline.txt`）：`Q_OWNED_BUSINESS_CHILD_START` → `Q_PERSISTED_CHILD_OBSERVED`（worker dispatch 阶段）耗时 arm64 69.6s / Windows 67.1s / x64 226.2s（约 3.25–3.37×）；x64 在 300s deadline 被 watchdog SIGTERM。
- 定性：**runner 性能**（真实串行全链：真实 Core 回合 + 真实 git 对象/运行记录 + 多角色会话），不是断言失败或产品挂起。
- 优化评估：用例轮询最小粒度为 10ms（无固定长 sleep），链路本身是串行前置依赖（init → 产品/策划 → 计划 → D3/激活 → workflow → worker → verifier → delivery），无可安全并行化/缩短而不改语义的步骤；把预算抬到 300s 以上会改变 CI 门禁口径（`--test-timeout=300000`）并且是 owner 决策（R8 文档 §6.2 #3 已列）。**本轮不改、记录预算说明**。

### 1.4 task-restart：arm64 55.6s / x64 158.1s「恢复投递未发生」

- arm64 55,646ms / x64 158,107ms 红；Windows 绿；本机 Windows 3× 绿（misc 批记录一致）。
- 错误体（`_evidence/05-task-restart-errors.txt`）：`恢复投递未发生：Error: 等待超时 record={"reports":[]} events=[]`，`task-restart.test.ts:113`。
- 定性：`restoreTasks` 的 drain 是异步链（真实来源门 `inspectAssignedTask` + Git 读取）；用例总时长的大头是真实 pinned run 夹具准备（本机亦 ~48.9s），旧 `waitUntil` 只有 5000ms，慢 runner 上 drain 超过窗口。
- 改法：恢复投递等待 5000→30000ms、`task.delivered` 落盘等待 5000→15000ms；断言与失败诊断（record/events）不变。

### 1.5 independent C Window：arm64-only ENOTEMPTY

- arm64 工件（duration 51.6ms）：`Error: ENOTEMPTY, Directory not empty: /private/var/folders/…/T/ans-p1p7-window-report-c5l8el`，`p1p7-window-provenance-integration.test.ts:170` 的 `rmSync`（`_evidence/06-independent-c-window-enotempty.txt`）。
- 定性：真实 delivery-history 写入与递归删除的清理竞态（与 R6 multi-runtime ENOTEMPTY 同族）。
- 改法：`rmSync` 加 `maxRetries:10, retryDelay:100`（B0/B7 同法）；仍失败如实抛错。

## 2. 改动（仅测试夹具）

1. `test/桌面应用/chief-workflow.test.ts`
   - `:99-119` 新增 `coreInFlightStates` / `inFlightCoreEntries()` / `waitForCoreRegistryQuiescent(context, { timeoutMs=15000, throwOnTimeout })`：轮询真实 `inspectRuntimeCoreRegistry()`，只等待 `preparing/creating/disposing` 消失；pre-open 超时抛出含 sessionId/roleId/runtime/state/projectRoot/reasons 的错误，teardown 只 `console.error("B1b …")`。
   - `:1703` W21/W28/W29/W30/W33/W34/W35 参数化用例测试预算：`teamPlanning ? 18000 : documentChange ? 30000 : 12000`。
   - `:1797-1806` `waitFor` 支持显式 `timeoutMs` 与失败 `diagnose()`（默认仍 `documentChange ? 6500 : 3500`）。
   - `:1811` pre-open 前等待注册表静止（`throwOnTimeout`）。
   - `:1931-1945` 发布通知等待：documentChange 20000ms / 其他 3500ms，失败附 product trace/投递/队列/Core 在途诊断。
   - `:2001` W30「真实重启迁移后」在 stop/dispose 后、新 desktop 打开前等待注册表静止。
   - `:2071` finally 新增 `core-registry-quiescent` 步骤（在 `disposeDocuments` 之后、`close-server` 之前；server 保持打开让收尾请求自然结束；超时仅诊断）。
2. `test/桌面应用/task-restart.test.ts`
   - `:110-115` 恢复投递 `waitUntil(..., 30_000)`；`:121` `task.delivered` 落盘 `waitUntil(..., 15_000)`。断言/诊断文本不变。
3. `test/测试/p1p7-window-provenance-integration.test.ts`
   - `:170-172` finally `fs.rmSync(root, { recursive:true, force:true, maxRetries:10, retryDelay:100 })`。
4. Q2 P2：无代码改动（§1.3 预算说明）。

未触碰 `git-command` / `compatibility-loopback` / `judge-delegated` 等 plat 分支覆盖文件，避免冲突。

## 3. 验证（本机 Windows，Node v24.22.1）

- 全文件 3× 自然退出（未加 `--test-force-exit`；命令 `node --test --test-concurrency=1 --test-timeout=300000 <file>`，逐次 EXIT=0）：

| 文件 | run1 | run2 | run3 |
| --- | --- | --- | --- |
| `test/桌面应用/chief-workflow.test.ts` | 66/66，64.0s | 66/66，63.4s | 66/66，62.5s |
| `test/桌面应用/task-restart.test.ts` | 2/2，48.9s | 2/2，48.5s | 2/2，48.9s |
| `test/测试/p1p7-window-provenance-integration.test.ts` | 3/3，0.72s | 3/3，0.70s | 3/3，0.71s |

  （明细 `_evidence/08-local-runs.tsv`；另在整文件 3× 之前，先用 `--test-name-pattern="W29|W30|W33|W34|W35"` 跑了 3× 9/9 绿：46.6s / 43.9s / 43.7s。）
- `npm run typecheck`（`tsc --noEmit`）**EXIT=0**（`_evidence/10-typecheck.txt`）。
- **零新增失败**：三个修改文件全文件 3× 全绿；其余文件未改动。
- Q2 P2 未本机复跑：无代码改动；本机复现一次需 3 分钟以上真实链，且该用例 Windows CI 已绿，改动不涉及；x64 结论以工件 + 预算说明为准。
- 变更 diff：`_evidence/09-changed-files.diff`。

## 4. 剩余 / 产品候选 / 下一轮 x64 CI 复核要点

1. **x64 无法本机复现**（本机 Windows）：§1.1/§1.2 的硬化依据 R8 x64 工件 + 夹具审计；下一轮 x64 CI 需复核：
   - 9 名是否全部转绿（尤其 document-change 通知等待 20000ms 是否足够）；
   - 若仍红，新增诊断（`DIAG=…` 与 `B1b Core registry not quiescent for …`）会直接给出残留条目的 sessionId/state/projectRoot，可用于区分「通知仍未走完」与「disposing 条目永不静止」。
2. **产品候选（供 owner 知悉，未按停手处理）**：R8 x64 工件显示一个 Core 会话在夹具 stop/dispose 后以 `disposing` 持续跨 8 个用例（≥10s 量级）未离开；触发条件是前一用例在发布回合在途时被 teardown。该现象更像「teardown 与在途回合竞态」的后果，而非独立产品缺陷；本轮按夹具时序处理（先修等待预算 + 有界静止等待）。若下一轮 x64 出现「用例已正常收尾、静止等待 15s 仍报 disposing」的证据，应升级为产品并发候选（dispose 等待在途回合/`pendingPersist` 的无界路径）。
3. **Q2 P2**：x64 真实链成本约 3.3× 于 arm64；若后续 x64 仍 300s 超时，需 owner 决定提高该 E2E 预算/拆分（会触及 CI `--test-timeout` 口径，本轮不静默放宽、不排除）。
4. task-restart 的 30s/15s 有界等待与 p1p7 的 `maxRetries` 只在失败/清理路径生效或用于吸收慢 runner；未改变任何断言语义。

## 5. 约束遵守

只修改了上述 3 个测试文件并写入本记录与 `_evidence/`；未 commit/push、未触发 CI、未 tag、未碰 main、未读 `.env`、未占用 9222/9223/9224；未修改产品代码/`.github/workflows`/`release.yml`/角色卡/边界/其他测试。
