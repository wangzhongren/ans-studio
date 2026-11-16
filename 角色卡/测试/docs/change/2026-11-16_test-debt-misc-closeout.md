# B7 前置收尾批：其余单列项（W-J5、task-restart、Q 固定早链、Q2 P2/B6a spawn fence）

- 日期：2026-11-16
- 角色：ANS「测试」（roleId: 测试）
- 工作树：`.claude/worktrees/misc`（分支 `fix/test-debt-misc`，起点 `82dc180` = `origin/main`，含 B6a #119 / B6b #120）
- 范围：R5「其余单列项」——
  1. W-J5/J15（`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`，x64-only 180s）定性；
  2. task-restart（`test/桌面应用/task-restart.test.ts`）按 v2.0.0 run-bound 夹具重写；
  3. direct-role e2e「Q normal-new early chain」（`test/测试/direct-role-capabilities-e2e.test.ts`）按 fixed A1→A2→A3 真实链重写；
  4. Q2 P2 与 B6a spawn fence 仅分类/文档（macOS-only 平台候选）；
  5. 修改文件各 3× 自然退出 + `npm run typecheck`。
- 约束遵守：只改上述两个测试文件 + 本记录/`_evidence/`；**未改产品/workflow/release.yml/角色卡/边界/其他测试**；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 数据源：
  - R5 分析（`2026-11-16_remediation-plan-r5-update.md` 与 `_r5-evidence/`）；
  - R5 CI 工件（GitHub Actions run **43829367008**，`main @ a0baea2`，Node 24.14.0）：`/tmp/r8-art/test-logs-{mac-arm64,mac-x64,win-x64}/test-ci-output.log`（原始工件不入库，摘录见 `_evidence/04-wj5-ci-evidence.txt`、`_evidence/06-platform-candidates.txt`）；
  - B5/B6a/B6b 记录与证据（task-restart 产品/夹具候选、Q2 P2/spawn fence 本机结果）；
  - 本机：Windows 11 / Node v24.22.1 / Git 2.55.0。

## 0. 摘要

1. **W-J5/J15 定性为平台/runner 性能时序候选（未改测试）**：x64 工件恰在测试自带 180s `timeout` 到点（`'test timed out after 180000ms'`），**无任何断言失败**；同轮 arm64 ✔ 71.1s、Windows ✔ 69.5s；本机 Windows 3× ✔ 63.9/65.0/65.1s。R3 同款 180s、R4 未复现、R5 复现。x64 测试步骤 41m41s 为 arm64 21m24s 的 1.95×，与 runner 负载/性能解释一致。按 R5 owner 裁决项 #8「观测为主，暂不排修」保留 180s 上限，标注平台候选。
2. **task-restart 重写完成并转绿**：用 `git-write-chain-fixture` 的真实 pinned run（真实 intent/计划/激活/initial workflow/`freezeExecutionRun`）+ 真实 `createExecutionAssignment`（chief→convener 控制任务、convener→impl 受派任务、真实 `parentTaskRef`）替换裸 legacy 任务；恢复投递通过真实 `inspectAssignedTask`（run pin + module + active authorization）。3× **2/2 pass**（45.2–45.8s/次，自然退出）。断言未放宽：新增「来源门必须接受」与「坏行下来源门 fail-closed、不伪造投递」的显式断言；用例未删、原名保留。
3. **direct-role e2e 按 fixed A1→A2→A3 真实链重写并转绿**：空项目默认 fixed；chief A1 stage-request → convener 派产品 A1 受理 → 产品报告/运营收口 → chief 发 A2 stage-request → convener 派产品写真实 `docs/product/direct-e2e-intent-v1.md` → 运营 accepted 收口（stage.completed A2）→ chief 写 `docs/intents/direct-e2e.md` 并呈 intent-confirm 卡 → 客户 confirm → `finalizeIntent` 完成 A3。3× **3/3 pass**（~1.2s/次，自然退出）。断言：A1/A2/A3 completed、`request.created.documentRefs[intent]` 绑定真实字节 hash、产品报告证据、卡恰一次；且 `.ans/trunk` / `.ans/runs` / `.ans/state/doc-freezes.json` 均不产生（A3 不写 trunk/doc-freeze）。旧 legacy 早链名退役，新名按当前语义命名。
4. **Q2 P2 / spawn fence 仅分类**：两者均 macOS-only，本机 Windows 无可复现产品错误；分别定性为 macOS host facts/protection 候选与 macOS FSEvents 时序候选（两路均 fail-closed），保留原样待 macOS 定向复跑/owner 裁决。
5. **验证**：两个修改文件各 3× 自然退出全绿；W-J5 未改、3× 自然退出全绿；`npm run typecheck` **EXIT=0**；修改文件内其余名零新增；`git status` 仅两个测试文件修改 + 本记录/证据。

## 1. W-J5/J15：平台/runner 性能时序候选（测试文件未改）

### 1.1 范围与现状

- 文件：`test/测试/2026-11-09_judge-delegated-effectiveness.test.ts`（单用例，`{ timeout: 180000 }`）。
- R5 x64 工件（`test-logs-mac-x64/test-ci-output.log`）：
  - L3174 / L7930：`✖ W-J5/J15：… (180001.963841ms)`，失败体 `'test timed out after 180000ms'`。
  - **没有任何断言失败/产品错误文本**；就是测试自带 180s 上限到点被取消。
- 同轮对照：
  - macOS arm64：`✔ … (71132.148208ms)`；
  - Windows x64：`✔ … (69523.6045ms)`。
- 历史：R3 同款 180s（x64-only）；R4 三平台未复现；R5 复现。R5 §1：x64 测试步骤 41m41s vs arm64 21m24s（1.95×）。

### 1.2 本机 3×

| run | 结果 | W-J5 时长 | 文件 duration_ms | 退出 |
| ---: | --- | ---: | ---: | --- |
| 1 | 1 pass / 0 fail | 63,872.928ms | 64,202.8468 | 自然 EXIT=0 |
| 2 | 1 pass / 0 fail | 65,024.212ms | 65,356.0435 | 自然 EXIT=0 |
| 3 | 1 pass / 0 fail | 65,060.0389ms | 65,395.815 | 自然 EXIT=0 |

原始输出：`_evidence/runs/wj5-run{1,2,3}.txt`；汇总 `_evidence/01-wj5-local-3x.tsv`。

### 1.3 定性

- **非产品缺陷**：无断言失败；测试在 arm64/Windows CI 与本机 Windows 均稳定通过。
- **非测试假设错误（本批不改）**：180s 对 69–71s 的稳定耗时约有 2.5× 余量；x64 runner 整体 1.95× 慢于 arm64，超时与 runner 负载/性能解释一致；在不知道 x64 实际完成时间的情况下抬高上限只会掩盖潜在性能/泄漏问题。
- **分类：平台/runner 性能时序候选（x64-only）**。按 R5 owner 裁决项 #8「观测为主，暂不排修；R6 后复核」保持文件原样；若后续 x64 连续复现且无负载解释，再由 owner 决定 x64 性能专项或调整测试预算。

## 2. task-restart：按 v2.0.0 run-bound 真实来源门重写

### 2.1 基线（修改前）

- `node --test --test-timeout=120000 test/桌面应用/task-restart.test.ts` → **1 pass / 1 fail**；
  `重启恢复：…` 每次 2.0s `等待超时`（`waitUntil(sent.worker.length===1)`）。
- 根因（B5 §1.8 已定性）：裸 legacy `task.created`（无 runId/flowId/run record）在 drain 的
  `inspectQueuedChild → inspectAssignedTask` 处被 v2.0.0 来源门 fail-closed 移除；`sent=[]`；
  第二次 restore 因账本无 `task.delivered` 再次 `restored:1`。不是时序 flake。

### 2.2 改法（断言不放宽、不删用例）

- **真实 pinned run**：调用 `test/测试/git-write-chain-fixture.ts` 的 `buildWriteChain`——真实 init/
  intent 确认/首发布/计划发布/激活/initial workflow/`freezeExecutionRun`，得到真实 `execRunId` 与
  run pin 证据。
- **真实受派任务账本**：真实 `createExecutionAssignment(chain, { controllerTaskId, workerTaskId:
  "t-pending" })`——chief→convener 控制任务（真实 `repository-work-source/v1`）+ `prepareParentTaskRef`
  + convener→impl 工作任务（真实 parentTaskRef、`runId/flowId/runState:"pinned"`、moduleId）。
- **来源门显式断言**：`inspectAssignedTask({ projectRoot, taskId:"t-pending", actorRoleId:"impl" })`
  必须 `ok:true`（run pin + module + 当前 active authorization 交集）；这就是恢复投递前 drain 实际执行的同一来源门。
- **恢复断言保持**：`restoreTasks` → `restored:1` / `taskIds:["t-pending"]` / `skipped:1`；投递文本
  `/任务编号：#t-pending/`；第二次 restore `restored:0`、间隔后仍仅 1 次投递；`listTasks` 的
  已报告/已投递/坏行计数断言保留。
- **v2.0.0 坏行语义更新**（关键披露）：旧用例把 `{broken line}` 先写入 `tasks.jsonl` 再期待恢复投递成功；
  当前产品的 `readOperationEvents` 对坏行整体 `audit-ledger-unreadable`，来源门会 fail-closed——
  **“坏行 + 成功投递”在当前语义下不可能同时成立**。因此改为：
  1. 先在**可读账本**上完成第一个受派任务的恢复/投递/幂等断言；
  2. 再在有可读账本时准备第二个真实受派任务（`t-pending-2`）；
  3. 写入坏行后 `restoreTasks` 仍识别未投递任务（`restored:1`），但来源门 fail-closed：
     **不投递、不写 `task.delivered`、不伪造成功**；
  4. `listTasks` 坏行如实计数（`errors:1`），三个任务状态分别 `reported/delivered/created`。
  这是按当前有意语义更新，而不是放宽：新增了“不得伪造投递/不得标记 delivered”的更强断言。
- **夹具整理**：真实链自带多条已存在于同一账本的规划任务；为让 `skipped` 只统计本用例事实，
  恢复前把夹具既有 open 任务直接补 `task.closed`（夹具初始化，不代表产品行为），并保留控制任务
  （同样在恢复前收口）。
- **重文件口径**：单次运行约 45–50s（真实 Git 链），测试自带上限 300s（与 CI `--test-timeout=300000`
  一致）；**最终 3× 均为自然退出，未使用 `--test-force-exit`**。`after` 与 finally 同时调用
  `disposeOpenedSessions()`（`git-action-cross-runtime-fixture` 的 bound sessions）与
  `disposeChainSessions()`，释放真实 Core 会话的 1h last-resort 计时器，保证进程自然退出。

### 2.3 3× 结果

| run | exit | tests | pass | fail | duration_ms | 目标名 |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 0 | 2 | 2 | 0 | 46,308.338 | ✔ 45,777.7683ms |
| 2 | 0 | 2 | 2 | 0 | 45,796.76 | ✔ 45,245.6682ms |
| 3 | 0 | 2 | 2 | 0 | 46,315.1894 | ✔ 45,742.9473ms |

原始输出：`_evidence/runs/task-restart-verify-{1,2,3}.txt`；基线见 `runs/task-restart-before-run1.txt`；
汇总 `_evidence/02-task-restart-3x.tsv`。

## 3. direct-role e2e「Q normal-new early chain」：按 fixed A1→A2→A3 真实链重写

### 3.1 基线（修改前）

- `node --test --test-timeout=120000 test/测试/direct-role-capabilities-e2e.test.ts` → **2 pass / 1 fail**。
- `Q normal-new early chain…` 首次 tool 调用即失败：
  `request_choice：治理确认卡未发出（未向客户呈现；原因：未找到 docs/product/direct-e2e-intent-vN.md（最新意图缺失）。）`
  ——旧用例是 B1 之前的 legacy 直启顺序（先写 `docs/intents`、先呈 legacy intent-confirm、产品后补意图），
  且末段期望 legacy trunk/doc-freeze 的 `intent-confirmed`；fixed A3 明确要求真实 product 意图 doc +
  活动 workflow A2 completed，且不写 trunk/doc-freeze（B6b §3 语义取代候选）。

### 3.2 改法（真实 fixed 链，断言按当前语义）

角色脚本（driver 仍是“只替换推理/传输”，工具与业务状态全部产品所有）：

1. **A1**：chief `dispatch_task(taskKind:"stage-request", workflowPath:"A", stage:"A1", workflowAction:"advance")`
   → 真实 `requestStage` 建 chief→convener 只读任务 + `workflow.started`；convener 以真实受派任务自动绑定
   `workflowId`，派产品 A1 任务（stage A1，任务创建即完成 A1），并 `submit_report`。
2. **收口 A1**：chief 收口 A1 stage-request（accepted）；产品报告 A1 受理完成；convener 收口产品 A1 任务。
3. **A2**：chief 发 A2 stage-request；convener 派产品撰写 `docs/product/direct-e2e-intent-v1.md`
   （stage A2）；产品 `write_file` 真实意图 doc（`schema: project-intent/v1`、flowId/intentId/version），
   `submit_report` 携带真实证据路径；convener accepted 收口 → `closeTask` 走 `buildFixedCloseEvidence`
   生成报告证据文件 hash → **stage.completed A2**。
4. **A3**：chief 通过 `turn.wait` 等待 A2 completed（跨角色有界等待，driver 的 wait 环检测生效），
   收口 A2 stage-request、写 `docs/intents/direct-e2e.md`（`project-intent-entry/v1`、intentId 一致），
   `request_choice(cardKind:"intent-confirm", flowId:"direct-e2e")` → run-role fixed 分支
   `prepareIntent`（校验最新意图/入口/A2 completed，写 `stage.requested A3`）→ 客户 confirm →
   `finalizeIntent` 写 `stage.completed A3`。
- 测试断言（逐字钉住，不放宽）：
  - workflow `path:"A"`，`stages.A1/A2/A3` 均 `completed`；
  - `request.created` 为真实应用事件，`documentRefs[intent].path` = 实际 product 意图路径，
    `sha256` = 实际字节 hash（`createHash` 重算比对）；
  - `docs/intents/direct-e2e.md` 存在且 intentId 一致；
  - 产品报告 `task.reported.evidence[]` 含真实意图路径；
  - 客户卡恰一次（`customerTrace.length===1`）；
  - `.ans/trunk`、`.ans/runs`、`.ans/state/doc-freezes.json` 均不存在（A3 不写 trunk/run/CAS/doc-freeze）。
- 旧名 `Q normal-new early chain: actual chief customer request -> formal product dispatch -> product
  write/report; no seeded freeze` **退役**；新名
  `Q normal-new fixed chain: chief A1 stage-request -> convener/product A2 intent -> A3 customer confirm;
  no trunk/doc-freeze` 覆盖同一场景的当前语义。

### 3.3 3× 结果

| run | exit | tests | pass | fail | duration_ms | fixed chain |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | 3 | 3 | 0 | 1,162.3929 | ✔ 602.4234ms |
| 2 | 0 | 3 | 3 | 0 | 1,186.8037 | ✔ 602.1228ms |
| 3 | 0 | 3 | 3 | 0 | 1,175.2213 | ✔ 614.3784ms |

原始输出：`_evidence/runs/direct-role-verify-{1,2,3}.txt`；基线见 `runs/direct-role-before-run1.txt`；
汇总 `_evidence/03-direct-role-3x.tsv`。

## 4. Q2 P2 与 B6a spawn fence：仅分类/文档（macOS-only）

> 本机 Windows 无法执行 macOS-only 分支；以下 macOS 事实来自 R5 CI 工件与 B3c/B5/B6a 记录。本机未复现产品错误。

### 4.1 Q2 P2

- 实际文件：`test/测试/git-role-workflows-e2e.test.ts`（任务书曾写 `git-action-delivery-claude-e2e.test.ts`，该文件内无此名；B5 §2 已核对）。
- macOS arm64：✖ 2,819.687ms；关键错误码 `file-gate-host-facts-unproven: genuine current stage, roots and Git protection basis are required`（write_file 写入前复核拒绝）。
- Windows CI：✔ 210,868.0483ms（慢但绿）；B5 本机 Windows 3× 183,927/182,539/186,480ms 全绿；B6b 修改该文件后全文件 3× 绿（含本用例）。
- **分类：macOS-only 产品 host facts/protection 候选 / 平台候选**；本机无可复现产品错误；不阻塞本批，R5 §6.2 #6 待 macOS 定向复跑/owner 裁决。

### 4.2 Git final spawn fence

- 文件：`test/编排/git-command.test.ts`；macOS arm64 ✖ 149.791625ms，输入未匹配 `/git-command-failed:null:unknown/`，实际 `Error: git-host-lease-invalid-before-command`（`executeGit` mutating 命令前 host lease 终检）。
- Windows CI ✔ 843.9806ms；B6a 正常与 junction（CI 非规范根形态）双口径 3× 绿；本批在 HEAD 单测复跑 ✔ 725.8482ms（`_evidence/runs/spawn-fence-current.txt`）。
- 机理（B6a §3）：macOS FSEvents 延迟/合并使中断落在后续 mutating 命令之前，产生另一条 fail-closed 码；两路都不发布 ref、不伪造退出回执、真实重试可成功。
- **分类：macOS-only 平台时序候选（非产品缺陷）**；保留原样，待 macOS 定向复跑/owner 裁决。

## 5. 验证汇总

| 文件 | 修改前 | 修改后 3× | 目标名 | 其余名 |
| --- | --- | --- | --- | --- |
| `test/测试/2026-11-09_judge-delegated-effectiveness.test.ts` | 3× 绿（本机） | **3× 绿（自然退出）** | W-J5 ✔ 63.9–65.1s；平台候选（未改） | 无变化 |
| `test/桌面应用/task-restart.test.ts` | 1 pass / 1 fail | **2/2 ×3（自然退出）** | `重启恢复…` ✔ 45.2–45.8s | 第二用例 ✔ |
| `test/测试/direct-role-capabilities-e2e.test.ts` | 2 pass / 1 fail | **3/3 ×3（自然退出）** | fixed 早链 ✔ ~0.6s（新名；旧名退役） | 前两用例 ✔ |

- `npm run typecheck` ⇒ **EXIT=0**（`_evidence/05-typecheck.txt`）。
- 修改文件内**零新增失败名**；未新增 skip/todo；未删用例。
- 约束：`git status` 仅两个测试文件修改（+ 本记录/证据）；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占用 9222/9223/9224。

## 6. 剩余与平台候选

| 项 | 平台 | 状态 | 分类 / 建议 |
| --- | --- | --- | --- |
| W-J5/J15 180s | x64-only | 未改（本机 3× 绿） | 平台/runner 性能候选；R5 owner #8 观测为主；R6 复核 |
| Q2 P2 | macOS-only | 未改（Windows 绿/慢） | macOS host facts/protection 候选；macOS 定向复跑或 owner 裁决 |
| Git final spawn fence | macOS-only | 未改（Windows 绿） | macOS FSEvents 时序候选；两路 fail-closed；macOS 定向复跑/owner 裁决 |
| task-restart | 全平台 | **已转绿** | 真实 pinned run + 受派任务；坏行按 v2.0.0 fail-closed 语义钉住 |
| Q normal-new fixed chain | 全平台 | **已转绿** | fixed A1→A2→A3 真实链；A3 不写 trunk/doc-freeze |

**产品候选**：本批未发现新的确定性产品缺陷。task-restart 的旧红已由真实 run-bound 夹具解决（不需要改产品）；Q2 P2/spawn fence 维持平台候选。

**owner 裁决建议**：
1. W-J5：继续观测；若 R6 x64 仍 180s 超时，评估 x64 性能专项或测试预算（当前不改）。
2. Q2 P2：macOS 定向 3× / owner 裁决 host facts 是产品修复还是平台接受。
3. spawn fence：macOS 定向复跑；若稳定复现，由 owner 裁定「两路等价 fail-closed 语义」是否可作为平台已知差异重写。

## 7. 证据边界与披露

1. 本机仅 Windows 11 x64；macOS-only 结论来自 R5 CI 工件与 B3c/B5/B6a 记录，未在 macOS 本机复跑。
2. task-restart 使用真实 Git 链夹具，单次 ~45–50s；已用 `after` + finally 双重会话释放保证自然退出。本批最终 3× **未使用** `--test-force-exit`。诊断期间曾出现一次未释放 1h last-resort 计时器导致进程不退出，已定位为 `git-action-cross-runtime-fixture` 的 bound sessions 未 dispose；补 `disposeOpenedSessions()` 后自然退出稳定。
3. task-restart 的「坏行 + 成功投递」旧组合在 v2.0.0 下不可成立（`readOperationEvents` 对坏行整体 `audit-ledger-unreadable`）。测试改为「可读账本先成功恢复，再证明坏行下来源门 fail-closed、零投递、零 delivered」，新增断言而非放宽。
4. direct-role 的旧测试名退役（语义被 fixed 路径取代）；新名覆盖同一场景。driver 只替换推理/传输，工具、账本、卡片、收口、阶段推进均为产品真实实现（Q1_FIXED_CHAIN trace 见运行输出）。
5. W-J5 未改：180s 是测试自带上限；本批不改预算，仅在记录中定性。若 owner 决定提高上限，应另行评估。
6. 证据只引用 R5 工件与 B5/B6a/B6b 既有记录，不取代下一轮 CI；平台候选均需 R6 或 macOS 定向复跑复核。

## 附录 A：证据索引（`角色卡/测试/docs/change/2026-11-16_test-debt-misc-closeout_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `01-wj5-local-3x.tsv` | W-J5 本机 3× 计数/耗时 |
| `02-task-restart-3x.tsv` | task-restart 修改前/后逐 run 计数/耗时 |
| `03-direct-role-3x.tsv` | direct-role e2e 修改前/后逐 run 计数/耗时 |
| `04-wj5-ci-evidence.txt` | W-J5 x64 180s、arm64/Windows 绿、历史与定性 |
| `05-typecheck.txt` | `npm run typecheck` 输出 + EXIT=0 |
| `06-platform-candidates.txt` | Q2 P2 / spawn fence 的 macOS 工件摘录与分类 |
| `07-diff.diff` | 两个修改测试文件的完整 diff |
| `runs/wj5-run{1,2,3}.txt` | W-J5 本机 3× 原始输出 |
| `runs/task-restart-before-run1.txt` / `runs/task-restart-verify-{1,2,3}.txt` | task-restart 修改前/后原始输出 |
| `runs/direct-role-before-run1.txt` / `runs/direct-role-verify-{1,2,3}.txt` | direct-role e2e 修改前/后原始输出 |
| `runs/spawn-fence-current.txt` | HEAD 上 spawn fence 单测复跑（Windows 绿） |

## 附录 B：复现命令

```bash
# W-J5（未改）
node --test --test-timeout=300000 test/测试/2026-11-09_judge-delegated-effectiveness.test.ts

# task-restart（真实 pinned run；单次约 45–50s）
node --test --test-timeout=300000 test/桌面应用/task-restart.test.ts

# direct-role e2e（fixed A1→A2→A3）
node --test --test-timeout=120000 test/测试/direct-role-capabilities-e2e.test.ts

# 平台候选复跑（macOS 环境）
node --test --test-timeout=300000 --test-name-pattern "Q2 P2 first new project" test/测试/git-role-workflows-e2e.test.ts
node --test --test-timeout=120000 --test-name-pattern "Git final spawn fence" test/编排/git-command.test.ts

npm run typecheck
```
