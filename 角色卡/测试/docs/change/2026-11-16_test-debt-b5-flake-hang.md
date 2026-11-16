# B5（测试债）：flake 16 + 有界 hang 2（12 文件）逐文件 3× 定性与最小硬化

- 日期：2026-11-16
- 角色：ANS「测试」（roleId: 测试）
- 工作树：`.claude/worktrees/b5new`（分支 `fix/test-debt-b5`，起点 `a0baea2` = `origin/main`，含 B3/B4 合并）
- 范围：B5 = R4 分族的 **flake 16 + 有界 hang 2（12 文件）**；另做 3× 定性：Q2 P2、W36、W29-missing
  （后两者只跑不改）。**未编辑** `test/桌面应用/chief-workflow.test.ts`（W19/W33 并行批）与
  `test/测试/g4v2-mcp-verify/f-handler.test.ts`（归 B6b）。
- 数据源：R4 计划与证据
  `角色卡/测试/docs/change/2026-11-16_remediation-plan-r4-update.md`、
  `…_r4-evidence/`（`07-by-file.tsv` / `10-block-codes.json` / `01-ci-failures.json`）。
- 约束：未 commit/push、未触发 CI、未 tag、未碰 main、未读 `.env`、未占 9222/9223/9224；
  未改产品/workflow/release.yml/角色卡/边界/其他测试。仅修改本记录列出的 10 个测试文件 + 本记录/证据。
- 验证：10 个修改文件各 **3× 自然退出全绿**（`--test-timeout=120000`）；`npm run typecheck` **EXIT=0**；
  修改文件内其余用例零新增红。剩余目标名：`task-restart` 1 名（明确分类为产品/夹具候选，未改）。

## 0. 摘要

1. **P1 两个 10s 有界 hang 全部定性并收口**：
   - `session-rebuild-race`「关闭全部与双角色刷新扫描交接…」＝**夹具等待环**（测试等 refresh、
     refresh 等重建的 dispose、dispose 等测试）；在 v2.0.0 stop 栅栏下，`firstStopDispose` 阻塞的是
     **重建自身的 fail-closed 清理**（`openInternalUnsafe` 见 stopped ⇒ `disposeObservedHandle`），
     不是 stop 的 dispose 阶段。改为「先放行 dispose → 有界等 refresh → 有界等 stop」，语义断言不放宽。
   - `stuck-redispatch`「C-04 decision 开关开启…judge 代选…」＝**e71501c 已删除 `tryAutoSelectDecision`**
     （decision 卡 `planJudge` 直接 undefined）。用例按 v2.0.0 语义更新（客户卡呈现、0 judge 结果行、
     客户作答 terminate、failed 报告不自动收口），旧名退役、新名 3× 绿；并修正失败路径清理顺序
     （先 `rejectAllPending` 再 `stop`，消除 Windows ENOTEMPTY 掩盖断言）。
2. **P2 flake 的分类结果**（逐文件 3×）：
   - **确定性测试同步缺陷（可修，已修）**：session-rebuild-race 3 个窗口用例（stop 栅栏语义/句柄代次）、
     e-handler 1（e71501c 绑定层 `effect-scope-unproven` 先于 handler 的 `not-customer-turn`）、
     download-requests-integration 1（e71501c 起 request.* 写入经 trunk 账本 observation，坏行 ⇒
     写入 fail-closed）、download-request 1（夹具未转发 `runInput.toolCallId/turnId` ⇒ 两卡 requestId
     相同，命中同请求重放去重）、b-last-resort 1（mock 时钟下兜底计时器武装点偏移，固定 tick 漏触发）。
   - **CI-only（本机 3× 绿）的夹具根缺陷（已修）**：network-state-e2e 3、f2-claim-release 2、
     queue-recovery-e2e 1、interface 1 —— 共同根因是沿用 `/proj`（CI 三平台不存在；本机仅因残留
     `C:\proj` 才绿），与 B7-3（e3b6fc9）同源：v2.0.0 B3-2b host-inventory publication 对不可解析根
     fail-closed；interface 另叠加按项目根登记的全局 Git host 租约互污。修法＝每 harness 独占
     `mkdtemp` 根 + `open.ok` 断言 + 有界清理；queue-recovery / network-state 的等待上界 2s→8s（有界）。
   - **产品/夹具候选（先报告、不改）**：task-restart 1 —— restore 会重新入队裸 legacy 任务，但 v2.0.0
     来源门（`inspectAssignedTask` 要求真实 `runId`+`flowId`+run record）在 drain 时 fail-closed，
     条目被移除、零投递；第二次 restore 因账本无 `task.delivered` 再次 `restored:1`。需 owner 裁定
     或 v2.0.0 run-bound 夹具；本批未改期望。
3. **3× 定性（不改期望）**：Q2 P2（实际位置 `test/测试/git-role-workflows-e2e.test.ts`；任务书写的
   `git-action-delivery-claude-e2e.test.ts` 内无此名）本机 Windows 3/3 绿（183–186s/次），CI macOS-only
   `file-gate-host-facts-unproven` 仍为平台/产品候选；W36、W29-missing 本机 3/3 绿（B4 no-change 成立）。
4. **验证**：10 个修改文件 3× 全绿（session-rebuild-race 18/18、stuck-redispatch 10/10、
   download-request 8/8、b-last-resort 3/3、e-handler 6/6、f2 2/2、network-state 6/6、
   queue-recovery 2/2、interface 8/8、download-requests-integration 13/13）；typecheck EXIT=0。

## 1. 逐文件 3× 定性与改法

> 复现命令统一：`node --test --test-timeout=120000 <file>`（未使用 `--test-force-exit`；全部自然退出）。
> 3× 原始计数见 `_evidence/01-before-3x.tsv`、`_evidence/02-after-3x.tsv`。

### 1.1 `test/桌面应用/session-rebuild-race.test.ts`（flake 3 + hang 1）

- 修改前 3×：**14 pass / 4 fail**（每次均同 4 名，确定性）：
  - `关闭全部与双角色刷新扫描交接：停止返回后没有后续重开或投递`（10.0s 有界失败；
    facts `refreshSettled:false, stopSettled:false, opened:[A,B,A], live:[B]`）
  - `重建 dispose 等待窗口：stop A 保持用户目标/关闭契约`（`stop.ok` 实际 false）
  - `重建 dispose 等待窗口：stop all 保持用户目标/关闭契约`（`sentGenerations [3] ≠ [4]`）
  - `重建 open 等待窗口：stop A 保持用户目标/关闭契约`（`stop.ok` 实际 false）
- 定性：
  1. **close-all = 夹具等待环**。探针（`_evidence/06-srr-stop-fence-probe.txt`）显示 `firstStopDispose`
     的 dispose 入口来自**重建自身的 stopped 预检**：`openInternalUnsafe` 建好新句柄后发现 stop(null)
     已置 `deliveryStoppedAll`，即 `await disposeObservedHandle(handle)` 并返回 stoppedResult。
     原测试在放行该 dispose 之前等待 refresh 结算 ⇒ refresh 等重建、重建等 dispose、测试等 refresh。
  2. **3 个 stop 窗口 = v2.0.0/e71501c stop 栅栏语义同步**。stop 先冻结该角色的投递代际并等待在途
     重建链；重建的「重开续段」在 stopped 预检处作废并 dispose 新句柄（不装入会话表）。stop 返回时
     没有活会话可释放，如实回执 `ok:false` +「没有打开的会话」；关闭契约由栅栏保证（A 不复活、
     零投递）。旧期望 `ok:true`/代次 4 来自栅栏引入前的「重建先装入、stop 再 dispose」时序。
- 改法（断言不放宽/不删用例）：
  - close-all：`firstStopDispose.release()` 提前；以 `settledWithin(refresh)` 有界观察扫描**不再启动 B
    的重建**（缺陷版会卡在 laterOpen，refresh 有界等待即失败）；随后有界等 stop。
  - stop A 两侧：显式断言 `ok:false`、note 含「没有打开的会话」、`openForRoleId===null`、A 不在活表、
    零投递；保留「关闭必须等已在途重建收口」的 `stopped===false` 断言。
  - stop all：`sentGenerations` 从硬编码 `[4]` 改为 `[harness.opened.length]`（被栅栏作废的重建不创建
    句柄；dispose 阶段 open 预检早退、open 阶段句柄已建即 disposed），语义仍是「新项目的新句柄接收，
    旧重建句柄已释放」。
- 修改后 3×：**18/18 pass**。

### 1.2 `test/桌面应用/stuck-redispatch.test.ts`（hang 1；同文件其余 B4 名不动）

- 修改前 3×：**9 pass / 1 fail**；`C-04 decision 开关开启（真实 channel）：judge 按唯一推荐项代选
  terminate ⇒ 0 张客户卡 + 结果行 + 任务收口` 每次 10.02s 有界失败（`pushed=1` 卡呈现、无人作答）。
- 定性：**测试同步缺陷**。e71501c 删除 `tryAutoSelectDecision`；当前 `planJudge` 对 decision 卡
  `return undefined`（`app/desktop/customer-input.ts:1462`），decision 卡按 `isChiefBusinessCard →
  presentNow` 交客户；terminate 由 `recordTaskFailure` 写 failed 报告、任务保持未收口（同文件 B4
  已按此更新其余用例）。直接证据见 `_evidence/08-c04-semantics.txt`（含 B3-1 同源记录）。
- 改法：用例按 v2.0.0 语义更新并重命名（旧名退役）：
  `C-04 decision 开关开启（真实 channel）：v2.0.0 decision 卡不经 judge 代选（0 结果行）；客户作答
  terminate ⇒ 失败报告、不自动收口`。断言：客户卡恰 1 张、judge 结果行 0、推荐项仍在卡面仅展示、
  客户作答后 `escalated/selected`、`closed===undefined`、failed 报告含 `stuck-escalation:terminate`。
  失败路径 finally 改为**先 `channel.rejectAllPending("cleanup")` 再 bounded stop**，并给 `fs.rm`
  `maxRetries:5`（消除 Windows ENOTEMPTY 掩盖真实断言）。
- 修改后 3×：**10/10 pass**（其余 B-07/safe/unsafe/needs-review/上限/B-08 名逐字不变）。

### 1.3 `test/测试/network-state-e2e.test.ts`（flake 3）

- 修改前本机 3×：**6/6 pass**（CI-only）。R4 errorFirst：
  `离线回交未入队`（队列两例）、`回合未开跑`（网络失败系统行）。
- 定性：**夹具根缺陷**，非时序断言缺陷。三例走 `makeQueueHarness`，listing/open/send 固定 `/proj`；
  CI 三平台无 `/proj`，v2.0.0 宿主 inventory publication fail-closed ⇒ 会话开不出来、回交不入队
  （B7-3 e3b6fc9 同源；本机残留 `C:\proj` 造成假绿）。
- 改法：harness 内 `mkdtempSync(join(ROOT,"queue-proj-"))` 独占根并写最小角色卡/边界；`open` 使用
  `h.projectRoot` 并断言 `open.ok`；`cleanup()` 有界 stop + rm(maxRetries)；`until` 上界 2s→8s（有界，
  不改「离线保留/恢复恰一次/恰一条人话系统行」断言）。
- 修改后 3×：**6/6 pass**。

### 1.4 `test/测试/kanban-fixes-verify/f2-claim-release.test.ts`（flake 2）

- 修改前本机 3×：**2/2 pass**（CI-only）。R4 errorFirst：
  `su 会话应注入派发能力`（场景 1）、`dispatch is not a function`（场景 2）。
- 定性：**夹具根缺陷**。两例 `makeHarness` 用 `/proj`；CI 上宿主 inventory fail-closed ⇒ su 会话未开、
  `dispatchTask` 未注入（场景 2 对 undefined 调用即 TypeError）。本机 `C:\proj` 残留造成假绿。
- 改法：`mkdtempSync` 独占根 + 最小角色卡/边界；`listing(root)`、`getListing`、open 同一根；断言
  `open.ok`；`cleanup()` 有界 stop + rm；`finally` 保证清理。队列语义断言（跨目标不阻塞、同目标排队、
  峰值 ≤1、按序）逐字未改。
- 修改后 3×：**2/2 pass**。

### 1.5 `test/测试/g4-skill-verify/e-handler.test.ts`（flake 1）

- 修改前 3×：**5 pass / 1 fail**；`护栏矩阵：无轮次/… ⇒ not-customer-turn…` 的
  「无轮次 ⇒ 护栏拒绝」实际 `effect-scope-unproven`。
- 定性：**测试同步缺陷**（e71501c 绑定层）。真实能力闭包在 `applySkillChange` 之前先做
  `stillUnmanaged`（调用来源/执行范围身份核验）；无活轮次或伪造 origin ⇒ `effect-scope-unproven`
  fail-closed，handler 自身的 `not-customer-turn` 护栏不再首先到达。
- 改法：矩阵保留原名与 not-customer-turn 断言；新增：
  - 真实绑定层断言（case a 无轮次、case d 私有面伪造 dispatch）⇒ `effect-scope-unproven` + 文案 +
    零副作用盘快照；
  - 直调同一实现 `sessionEnv.applySkillChange`（bind receiver）⇒ 原 `not-customer-turn` + 逐字文案 +
    零副作用。既钉绑定层也钉 handler 层，断言未放宽、用例未删。
- 修改后 3×：**6/6 pass**。

### 1.6 `test/测试/download-requests-integration.test.ts`（flake 1）

- 修改前 3×：**12 pass / 1 fail**；`审计坏行：…` 在「坏行不得影响 request.* 读取」处失败。
- 定性：**测试同步缺陷**。e71501c 起 app 层 `request.*` 写入经 trunk 账本
  `recordTaskObservation`（CAS/审计），不再是裸 append。探针：`tasks.jsonl` 含坏行 ⇒
  `readOperationEvents` 返回 `audit-ledger-unreadable`，`recordTaskObservation` 以
  `task-ledger-unavailable` 拒绝写入（既有产品纪律：账本坏行 ⇒ 不写/不收口，绝不追加到不可读账本）。
- 改法：保留「下载主路径不受坏行影响」断言（result.ok、文件字节、downloads 账本 errors/完成事件），
  将 request.* 断言改为当前语义：tasks 坏行被计数、`request.*` 审计写入 fail-closed（缺席），并注释
  说明缺席是安全策略而非主路径故障。用例名不变。
- 修改后 3×：**13/13 pass**。

### 1.7 `test/桌面应用/download-request.test.ts`（flake 1）

- 修改前 3×：**7 pass / 1 fail**；`一项目一卡：前一张未决时下载卡排队，不呈现` 3.0s timeout
  （`queued.length` 恒 0）。
- 定性：**夹具缺陷**。fake B1 runtime 用固定 `approvalRequest()`（`toolCallId:"call-1"`），未转发
  每次调用的 `DownloadRunInput.toolCallId/turnId`；两张下载卡的 `requestIdFor` 相同 ⇒ 桌面通道
  `requestResults` 同请求重放去重返回第一张 promise，第二张既不呈现也不排队。与 B7-3
 （e3b6fc9 download-decision 同款修复）一致。
- 改法：fake runtime 以 `runInput.toolCallId/turnId` 覆盖 approvalRequest（真实 B1 运行时同形）。
- 修改后 3×：**8/8 pass**。

### 1.8 `test/桌面应用/task-restart.test.ts`（flake 1）——**产品/夹具候选，未改**

- 修改前 3×：**1 pass / 1 fail**；`重启恢复：未投递任务重新入队一次；…` 每次 2.0s `等待超时`
  （`waitUntil(sent.worker.length===1)`）。R4 三平台同款。
- 定性：**v2.0.0 来源门 / 夹具语义**（非时序）。探针（`_evidence/04-task-restart-product-candidate.txt`）：
  - `restoreTasks` 报 `restored:1`（t-pending 入队）；
  - drain 时 `inspectQueuedChild → inspectAssignedTask` 要求 `task.created` 同时带 `runId`+`flowId`
    且 run record 可读（draft/pinned）；裸 legacy 任务两项皆无 ⇒ `delivery.skip.task-unavailable`，
    条目被**移除**、`sent.worker=[]`，任务保持 `created`（未投递/未收口）；
  - 第二次 restore 因账本无 `task.delivered` 再次 `restored:1`（又重新入队后移除）。
- 结论：原期望「投递一次 + list=delivered + 第二次 restored:0」无法在当前语义下满足；要转绿需 owner
  裁定 restore 对不可投递条目的保留/提前拒绝策略，或把夹具改为 v2.0.0 真实 run-bound 任务（需要完整
  trunk run record/角色文档，超出 B5 最小硬化范围）。本批**未改期望、未改产品**，单列为产品/夹具候选。

### 1.9 `test/测试/turn-watch-verify/b-last-resort.test.ts`（flake 1）

- 修改前 3×：**2 pass / cancelled 1**（每个 run EXIT=1；首个用例 `test timed out after 10000ms`）。
- 定性：**测试时序脆性**（语义不变）。mock timers 探针显示兜底计时器在 send 的异步装配后（第一个
  `tick(100)` 之后）才武装；旧测试固定 `tick(100)+tick(200)` 只推进到 t0+300，计时器到期点为 t0+400，
  随后 `await rejected` 无界等待至 10s 测试超时（详见 `_evidence/09-b-last-resort-before.txt`）。
- 改法：保留「100ms > 检查时限 40ms、< 兜底 300ms，到点不中止」断言；其后按 20ms 步进推进 mock 时钟
  （总推进上界 2s 有效时间）直到 send 拒绝；`turnLastResortMs=300`、`outcome=timed_out`、
  「最后兜底」文案、abort 断言逐字不变。
- 修改后 3×：**3/3 pass**。

### 1.10 `test/测试/queue-recovery-e2e.test.ts`（flake 1）

- 修改前本机 3×：**2/2 pass**（CI-only）。R4 errorFirst：`回交未持久化`。
- 定性：**夹具根缺陷 + 2s 等待上界偏紧**。`makeInstance` 用 `/proj`，CI 上会话开不出来/回交不入队；
  持久化链在中载 runner 上可超过 2s。
- 改法：调用方传入 `mkdtemp` 项目根（listing/open/send/watchdogSnapshot 同一根）；`until` 上界
  2s→8s（有界）；`disposeHandles + bounded stop + rm` 清理保持。持久化/恰好一次/诊断断言逐字不变。
- 修改后 3×：**2/2 pass**。

### 1.11 `test/桌面应用/interface.test.ts`（flake 1）

- 修改前本机 3×：**8/8 pass**（CI-only）。R4 errorFirst：
  `项目正在处理派发或权限变更，选择尚未更改。请稍后重试。`
- 定性：**夹具根缺陷（跨文件租约互污）**。`requestRoleStates` 用例固定 `/proj`；v2.0.0 Git host
  action 租约按项目根**全局登记**，与其它使用 `/proj` 的用例/文件互污；CI 上 `/proj` 不存在且租约
  冲突稳定出现。
- 改法：该用例使用 `t.dir/proj` 独占临时根（写最小 chief/B 角色卡与边界），`listProject/open/
  sendSession/重放断言`全部使用该根；清理沿用 `tempDir.cleanup()`。
- 修改后 3×：**8/8 pass**。

### 1.12 `test/测试/g4v2-mcp-verify/f-handler.test.ts`（flake 1）——**不在 B5 范围**

- 按任务书归 B6b，**未修改、未运行**（与 e-handler 同 helper 时由 B6b 复用本记录 §1.5 的两层结论）。

## 2. 3× 定性（不改期望）

| 名 | 文件（实际） | 本地 3× | 结论 |
| --- | --- | --- | --- |
| Q2 P2 first new project: empty public chief -> formal convener bootstrap before future planning/D3/cards | `test/测试/git-role-workflows-e2e.test.ts`（**任务书写的 `git-action-delivery-claude-e2e.test.ts` 内无此名**；R4 `07-by-file.tsv` 亦指向本文件） | **3/3 绿**（183,927 / 182,539 / 186,480 ms） | 本机 Windows 无产品错误；CI macOS-only `file-gate-host-facts-unproven` 仍为平台/产品候选（B3c 结论不变）。首次运行需先存在 `角色卡/测试/docs/change/2026-11-05_git-role-permissions-evidence/`（测试自写证据目录）；本轮运行产生的约 969MB 工件已清理，未入库。 |
| W36 真实Chief可无M0-plan-D3派五builtin准备；人事写动作仍拒 | `test/桌面应用/chief-workflow.test.ts` | **3/3 绿**（1.72–1.76s） | B4 no-change 成立；未编辑该文件。 |
| W29 … document-change-missing-confirmation … | 同上 | **3/3 绿**（2.31–2.34s） | B4 no-change 成立；未编辑。 |

补充（任务书点名的文件交叉核对）：`test/测试/git-action-delivery-claude-e2e.test.ts` 内**没有 Q2 P2**，
唯一用例是 **AC-4**（Claude convener git_publish delivery 完整链）。该文件本地 3×：run1/run2 绿
（74.8s / 75.1s），run3 在 55.5s 触发 **Node 24.22.1 原生 CleanupQueue::Add 断言**
（async_hooks destroyTracking × `fs.promises.lstat`，`src/provider/trunk/impl/git-command.ts:553`）。
属 Node 原生清理队列 flake（R2/R3 已登记该错误族，本轮此前计数 0），不是 Q2 P2、也不是 macOS
host-facts 产品错误；不在 B5 12 文件范围，未修改，如实单列（`_evidence/11-named-q2p2-file-ac4.txt`）。

## 3. 验证

- 10 个修改文件各 3×（`node --test --test-timeout=120000`，自然退出）：
  `session-rebuild-race 18/18`、`stuck-redispatch 10/10`、`download-request 8/8`、
  `b-last-resort 3/3`、`e-handler 6/6`、`f2 2/2`、`network-state 6/6`、`queue-recovery 2/2`、
  `interface 8/8`、`download-requests-integration 13/13`（3× 计数见 `_evidence/02-after-3x.tsv`）。
- `npm run typecheck` ⇒ **EXIT=0**（`_evidence/05-typecheck.txt`）。
- 修改文件内其余名逐字不变、零新增失败；未新增 skip/todo；未删用例。
- 目标名状态：15 个在范围内的 flake 名中 **14 个转绿**（含 2 个有界 hang；C-04 旧名退役、新名绿）；
  `task-restart` 1 名明确分类为产品/夹具候选（未修改，保持红）；`f-handler` 1 名按任务书排除（B6b）。

## 4. 剩余名（`_evidence/10-remaining-names.tsv`）

| 名 | 文件 | 状态 | 分类 |
| --- | --- | --- | --- |
| 重启恢复：未投递任务重新入队一次；已投递不前移；重复调用不重复投；坏行跳过 | `test/桌面应用/task-restart.test.ts` | RED（未修改） | 产品/夹具候选：v2.0.0 来源门拒绝裸 legacy 恢复投递；需 owner 裁定（§1.8） |
| C-04 decision 开关开启…judge 按唯一推荐项代选 terminate…（旧名） | `test/桌面应用/stuck-redispatch.test.ts` | RETIRED | 测试同步：e71501c 删除 `tryAutoSelectDecision`；新名 3× 绿 |
| F3 护栏矩阵… | `test/测试/g4v2-mcp-verify/f-handler.test.ts` | UNTOUCHED | 不在 B5 范围（B6b） |

## 5. 证据索引（`角色卡/测试/docs/change/2026-11-16_test-debt-b5-flake-hang_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `01-before-3x.tsv` | 11 个文件的修改前逐 run 计数（pass/fail/cancelled/skipped） |
| `02-after-3x.tsv` | 10 个修改文件的修改后逐 run 计数（全绿） |
| `03-qualitative-3x.tsv` | Q2 P2 / W36 / W29-missing 本地 3× 计数 |
| `04-task-restart-product-candidate.txt` | 失败体 + 独立探针（restored/sent/list/queue/second restore）+ 结论 |
| `05-typecheck.txt` | `npm run typecheck` EXIT=0 |
| `06-srr-stop-fence-probe.txt` | close-all 停止栅栏探针（dispose 来自重建 stopped 预检；refresh/stop 结算） |
| `07-root-cause-proj.txt` | `/proj` 夹具根与 CI 假绿/互污根因（B7-3 同类） |
| `08-c04-semantics.txt` | e71501c 删除 `tryAutoSelectDecision` 与 v2.0.0 decision 卡语义的直接证据 |
| `09-b-last-resort-before.txt` | mock timer 武装点偏移与去抖依据 |
| `10-remaining-names.tsv` | 剩余/退役/排除名清单 |
| `11-named-q2p2-file-ac4.txt` | 任务书点名的 `git-action-delivery-claude-e2e.test.ts` 3× 交叉核对（文件内无 Q2 P2；AC-4 Node 原生 CleanupQueue::Add flake 1/3） |

## 6. 复现命令

```bash
node --test --test-timeout=120000 test/桌面应用/session-rebuild-race.test.ts
node --test --test-timeout=120000 test/桌面应用/stuck-redispatch.test.ts
node --test --test-timeout=120000 test/测试/network-state-e2e.test.ts
node --test --test-timeout=120000 test/测试/kanban-fixes-verify/f2-claim-release.test.ts
node --test --test-timeout=120000 test/测试/g4-skill-verify/e-handler.test.ts
node --test --test-timeout=120000 test/测试/download-requests-integration.test.ts
node --test --test-timeout=120000 test/桌面应用/download-request.test.ts
node --test --test-timeout=120000 test/桌面应用/task-restart.test.ts        # 产品候选（红）
node --test --test-timeout=120000 test/测试/turn-watch-verify/b-last-resort.test.ts
node --test --test-timeout=120000 test/测试/queue-recovery-e2e.test.ts
node --test --test-timeout=120000 test/桌面应用/interface.test.ts

# 3× 定性
node --test --test-timeout=120000 --test-name-pattern "Q2 P2 first new project" test/测试/git-role-workflows-e2e.test.ts
node --test --test-timeout=120000 --test-name-pattern "W36 真实Chief可无M0-plan-D3派五builtin准备" test/桌面应用/chief-workflow.test.ts
node --test --test-timeout=120000 --test-name-pattern "document-change-missing-confirmation" test/桌面应用/chief-workflow.test.ts

npm run typecheck
```
