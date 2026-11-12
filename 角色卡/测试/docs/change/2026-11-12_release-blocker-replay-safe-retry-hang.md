# v2.0.0 发布阻断（第六批）：replay-safe-retry CI 失败根因 + 失败路径清理加固 + 同族扫查（2026-11-12）

- 角色：ANS「测试」（roleId: 测试）。
- 任务：v2.0.0 发布阻断第六批——`test/桌面应用/replay-safe-retry.test.ts` 在第六轮 CI 三 job 中的
  ✖/挂起；按「先复现、再裁定、后修复」处理；同类扫查只输出清单、不改其它测试；**不改产品代码**。
- 工作树/分支：`.claude/worktrees/release-v2.0.0-blockers-6` / `release/v2.0.0-blockers-6`，
  从 `origin/main`（`8920f3a`，PR #90 已合并）切出。
- 授权：客户已授权；若发现真实产品回归则停下报告、不夹带。**本批判定：无产品回归**。
- 声明：未运行 Electron、未占用 9224、未触发 CI、未打 tag、未 push main；只提交/推送本分支。

## 〇、结论摘要（先读）

1. **三个 ✖ 的根因不是重试语义变化，也不是产品回归，而是测试夹具的项目根在 CI 上不可解析。**
   `replay-safe-retry.test.ts`（及同族多个桌面测试）以字面量 `/proj` 作 `projectRoot`；v2.0.0 B3-2b 起
   `recordGitHostInventory` 以 **native realpath 规范化项目根**，根不可解析即 fail-closed
   （`git-host-project-root-unresolvable`）⇒ `SessionManager.open` 返回「会话库存登记失败」⇒ `send`
   返回「会话尚未开启」⇒ 回合从未开跑（`until("…轮未开跑")` 在 2.5–3.9 秒后失败）。三平台 CI runner
   都没有该路径（macOS 为根目录下 `/proj`；Windows 为当前盘符根下 `\proj`）。**本机 `C:\proj` 是
   2026-10-28 遗留目录，掩盖了该依赖**——这正是「本地全绿、CI 三平台红」的原因。逐类裁定见 §四。
2. **45 分钟挂起不在本文件，而在它的下一个文件 `request-timeout-wiring.test.ts`。**
   证据：Windows 日志取消时给出文件级时长
   `✖ test\桌面应用\request-timeout-wiring.test.ts (2151333.1101ms)`（≈35.85 分钟）；macOS 两个 job
   的最后输出是 `replay-safe-retry` 的 i18n ✔，此后直到 45 分钟取消无任何输出（`--test-concurrency=1`
   串行，下一个文件正是 `replay-safe-retry` < `request-timeout-wiring`）。该文件失败路径 `await
   first.started` / `await started.promise` **无界**：open 失败时夹具行为永不执行，测试 promise 永不
   结算；CI 命令 `node --test --test-concurrency=1 "test/**/*.test.ts"` **未设 `--test-timeout`** ⇒
   整个子进程永久挂起。本机以「不存在项目根」复现：45 秒被 `timeout` 杀死仍未退出（证据
   `probe-request-timeout-wiring-hang-45s.txt`）。**本批只修 replay-safe-retry；该文件列入同族清单
   最高优先，下一批处理。**
3. **原「失败断言漏清理 ⇒ 句柄泄漏」假设未被证据支持。** 对原文件强制在 `gate.release()` 之前失败，
   进程 1 秒内正常退出，活动句柄只有 stdout/stderr 两个 Socket（`probe-before-cleanup-forced-
   failure.txt`）；以不可解析根复现三例 ✖ 时进程也仅 19 秒退出（`until` 有界超时之和，无挂起）。
   诊断 logger 的维护 interval 自带 `unref()`（`src/common/shared/diagnostics.ts:144-147`），且
   `withDiagnostics` 的 finally 已 `disposeDiagnostics()`——不是泄漏源。仍按任务要求把清理做成
   **失败路径也必然执行**并加上**有界回执等待**（§五），避免未来任何回执悬挂把文件拖死。
4. **本批修复**（仅 1 个测试文件 + 白名单/装配钉 + 记录）：
   - 夹具改为 `fs.mkdtemp` 的**真实项目根**（listing / open / lastTurnOf 全用同一根），结束后删除
     （含 `maxRetries`）；`open` 结果新增 `ok === true` 断言，开不起来立即失败而不是等 2.6 秒超时；
   - harness 追踪夹具门/句柄/send；`finally` 统一 `cleanup()`：放门 → 有界 stop → 逐句柄 dispose
     （幂等）→ 有界等 send 结算；
   - 三个回执等待（`first.pending`/`second`/`turn.pending`）加 10 秒上限：产品若永不结算，用例失败
     并进入清理，而不是让 CI 文件子进程永久挂起；
   - 断言全部原样保留（未删除用例、未加 skip、未放宽 fail-closed 主断言）。
5. **overlay**：`src/common/装配/release-policy.mjs` 精确加入
   `test/桌面应用/replay-safe-retry.test.ts`（单文件不开目录、注释理由）；`test/装配/
   release-packaging.test.ts` 新增同批精确路径钉（19/19 pass）。

## 一、CI 事实（run 43184430032，2026-11-12）

- workflow：`Build and verify release`，head `main` `8920f3abb53d846a9eaf15d31965f7c83fb88699`；
  三 job：macos-15 arm64（131067983381）、macos-15-intel x64（131067983334）、
  windows-2025 x64（131067982984）；全部 45 分钟 job timeout 取消。
- 回归命令：`.github/workflows/release.yml:74-76`
  `node --test --test-concurrency=1 "test/**/*.test.ts"`（**无 `--test-timeout`**）。
- Windows：`replay-safe-retry` 三例 ✖（`重试耗尽轮未开跑` / `重试成功轮未开跑` / `不安全失败轮未开跑`），
  `i18n：retryExhausted…` ✔（08:46:18Z）；随后 `request-timeout-wiring.test.ts` 一直未结束，取消时
  文件级时长 **2,151,333ms**。
- macOS arm64：三例 ✖ 各约 2.6s（`until` 预算耗尽），`i18n` ✔（08:44:14Z），之后无输出至取消
  （09:22:23Z）。
- macOS x64：同样三例 ✖ + i18n ✔（08:48:49Z），之后无输出至取消。
- 原始日志摘录见 `_evidence/ci-facts.txt`（本地下载的三 job 日志，未提交仓库外内容）。

## 二、根因定位（代码事实）

1. `SessionManager.open` 在构造句柄前先登记宿主库存：
   - `app/desktop/session.ts:1653-1662` `inventoryChanged()` → `recordGitHostInventory(…)`；
   - `app/desktop/session.ts:1698-1712` `openObservedRoleSession()`：登记失败即
     `throw new Error("会话库存登记失败，会话尚未创建。请检查诊断后重试。")`，**不会**调用
     `openRoleSession`；
   - `send` 对未开启会话返回 `{ok:false, error:"会话尚未开启…"}` —— 夹具行为永不执行，`busy` 永假。
2. `recordGitHostInventory`（`src/provider/trunk/impl/git-command.ts:1021-1032`）先取
   `hostCoordinator(projectRoot)`；`hostProjectKey`（同文件 `:953-967`）以
   `nativeRealRoot(root)` 规范化，**不可解析（不存在/悬空链接）⇒ undefined ⇒ 调用方 fail-closed**
   （注释 `:954-958` 明示这是 B3-2b 的有意行为：绝不为不可解析根创建可被其它拼写命中的 coordinator）。
3. 上述行为是**期望的 fail-closed 产品语义**（真实桌面只会打开用户选择的真实目录）；测试以
   `/proj` 这个「在本机恰好存在、在 CI 必定不存在」的路径作夹具根，属于**测试非封闭性缺陷**。
   本机 `C:\proj`（`.ans/governance`、`.ans/state`、`docs/flows`，mtime 2026-10-28）是遗留夹具，
   与测试代码无关，不是产品依赖。
4. 复现探针（`_evidence/probe-open-failure-root-cause.txt`）：
   - 不存在根 ⇒ `OPEN_RESULT {"ok":false,"error":"会话库存登记失败…"}`、
     `SEND_RESULT {"ok":false,"error":"会话尚未开启…"}`；
   - `mkdtemp` 真实根 ⇒ `OPEN_RESULT {"ok":true,…}`、`SEND_RESULT {"ok":true,"turnId":"turn-A…"}`。

## 三、泄漏/挂起探针（逐项）

| 探针 | 做法 | 结果 | 证据 |
| --- | --- | --- | --- |
| 原文件 × 不可解析根 | 复制原文件，把 `"/proj"` 换成不存在的根，`node --test`（无 test-timeout） | 三例按 CI 同名失败；**19s 自然退出**，无挂起 | `probe-nonexistent-root-before.txt` |
| 原文件 × 强制失败（开轮后、放门前） | 复制原文件，在 `until(busy)` 后 `assert.fail`，末尾打印活动句柄 | **1s 退出**；`PROBE_ACTIVE_HANDLES=["Socket","Socket"]`（仅 stdio） | `probe-before-cleanup-forced-failure.txt` |
| 修复后 × 强制失败 | 同上施加于修复版 | **1s 退出**；仅 stdio Socket；后续用例照常通过 | `probe-after-cleanup-forced-failure.txt` |
| 修复后 × open 失败 | 把夹具根改回不存在的路径 | 3 例在 `open` 断言处**立即失败**；**1s 退出**；仅 stdio Socket | `probe-after-open-failure-bounded.txt` |
| `request-timeout-wiring` × 不可解析根 | 同法替换 `"/proj"` | **45s 仍未退出**（被 `timeout` 杀死；CI 为该文件 35.85 分钟后 job 取消） | `probe-request-timeout-wiring-hang-45s.txt` |
| 诊断 interval | 读 `src/common/shared/diagnostics.ts:132-148,194-201` | interval 已 `unref()`，`disposeDiagnostics()` 清 interval | 代码事实 |

结论：本文件的失败会**有界失败并退出**；真正的挂起来自 `request-timeout-wiring.test.ts` 的**无界等待**。

## 四、失败语义逐类裁定（v2.0.0）

| 失败用例 | v2.0.0 语义是否变化 | 裁定与依据 |
| --- | --- | --- |
| 重试耗尽终态（`MODEL_REQUEST_RETRY_EXHAUSTED`） | **未变**：仍应恰一条人话系统行（含「自动重试」「可稍后重发」、无技术 code）、`lastTurn.errorCode`、诊断 `attempt=3/replayPlan=safe`、重复终态不重复系统行 | 失败点在第 170 行 `until("重试耗尽轮未开跑")`，即**断言从未执行**；open 失败导致回合未开跑（§二）。不是系统行文案/attempt 字段/终态语义回归。修复后原断言全绿。 |
| 重试后成功（completed + attempts=2 + replaySafe=true） | **未变**：不得产生失败系统行；`lastTurn.completed`；诊断 `attempt=2/replayPlan=safe` | 失败点 `:213 until("重试成功轮未开跑")`，同上。 |
| 不安全失败（replaySafe=false） | **未变**：沿用既有请求失败人话（「响应长时间中断」）；诊断 `replayPlan=unsafe` | 失败点 `:239 until("不安全失败轮未开跑")`，同上。 |
| i18n retryExhausted 中英成对 | **未变** | 三平台均 ✔（macOS 08:44/08:48，Windows 08:46:18）。 |

**结论：无产品回归，不改产品代码。** 三例共同根因是夹具根不可解析 + 宿主库存 fail-closed；修复在测试侧。

## 五、改法（`test/桌面应用/replay-safe-retry.test.ts`）

1. `listing(projectRoot)` / `makeHarness(projectRoot)`：夹具根改为 `withDiagnostics` 里
   `fs.mkdtemp(path.join(os.tmpdir(), "ans-replay-safe-retry-wiring-project-"))` 的**真实目录**；
   `open`/`lastTurnOf`/`listing.projectRoot` 全部使用同一根；finally 里 `fs.rm(..., {recursive,
   force, maxRetries: 3, retryDelay: 50})`。CI 上不再依赖 `/proj`。
2. 三处 `open` 后新增 `assert.equal(opened.ok, true, "夹具项目根须真实可解析（CI runner 无 /proj）")`
   ——开不起来立即暴露为清晰失败（未放宽任何原断言）。
3. Harness 新增 `gates`（夹具门）、`send`（记录 send 并以 no-op catch 防未处理拒绝）、
   `cleanup()`：`放门 → if (mgr.isOpen()) await mgr.stop(null) → 逐句柄 dispose()（幂等）→ 有界
   （1s，unref timer）等待 `Promise.allSettled(send)` 结算`。三个用例 finally 从 `mgr.stop(null)`
   改为 `h.cleanup()`：**断言失败/开轮前失败/open 失败都会走同一清理**。
4. 新增 `settledWithin(promise, label, 10s)` 包裹 `first.pending` / `second` / `turn.pending` 三个
   回执等待：产品回执若永不结算，用例在 10 秒内失败并进入 finally，而不是把文件子进程永久挂起
   （CI 无 `--test-timeout`）。断言内容/顺序未改。
5. 未删除任何用例、未新增 skip、未改 `until` 预算、未放宽人话/无技术 code/恰一条/attempt/replayPlan
   等主断言。

## 六、同类扫查（只查不改；下一批候选）

### 6.1 已确认挂起（最高优先）

| 文件 | 风险点 | 证据 |
| --- | --- | --- |
| `test/桌面应用/request-timeout-wiring.test.ts` | 与修复前同 harness：`/proj` + open 失败后 `await first.started` (`:174`)、`await idle.started` (`:218`)、`await failed.started` (`:224`)、`await started.promise` (`:257`) 等 **8 处无界等待**；`finally` 只有 `stop(null)`，对「回合未开跑」无效 | CI 文件级 `2,151,333ms`；本机 45s 被杀（`probe-request-timeout-wiring-hang-45s.txt`）；Windows CI 该文件 3 例 ✖ 的失败文本与同族一致 |

### 6.2 同根因（`/proj` 不可解析 ⇒ CI ✖，但有界退出；下一批按同法改真实临时根）

CI 失败计数来自第六轮 Windows 取消时 flush 的失败明细（`test at` → 用例名）；本地均已用
`open` 探针确认根因同一（§二/§三）。

| 文件 | `/proj` 出现 | CI 失败用例数（Windows） | 备注 |
| --- | --- | --- | --- |
| `test/桌面应用/handback-delivery.test.ts` | 28 | 18 | open 29 处，stop 19 处；有界 |
| `test/桌面应用/message-queue.test.ts` | 34 | 16 | open 18 处，stop 21 处；`while(true)` 迭代器由 dispose 收口（不 hold 事件循环） |
| `test/桌面应用/operator-channel.test.ts` | 52 | 8 | open 10 处，stop 9 处 |
| `test/桌面应用/p0-halt-and-images.test.ts` | 8 | 5 | open 3 处，`stop()` 2 处；无 finally |
| `test/桌面应用/queue-withdraw-lru.test.ts` | 16 | 4 | open 14 处，stop 6 处；**无 finally**；迭代器 20000×5ms 预算 |
| `test/桌面应用/abort-unwedge.test.ts` | 11 | 3 | open 5 处，stop 3 处 |
| `test/桌面应用/queue-visibility.test.ts` | 5 | 2 | open 3 处，stop 2 处 |
| `test/桌面应用/dispatch-fresh-enum.test.ts` | 6 | 2 | open 1 处，stop 2 处；无 finally；迭代器 20000×5ms |
| `test/桌面应用/turn-lease.test.ts` | 11 | 未到达（取消） | open 7 处，stop 4 处；同 harness 口径 |
| `test/桌面应用/optional-acceptance.test.ts` | 1 | 0（已修复） | B3-1 已按 mkdtemp 真实根修复并 overlay，作为本族先例 |

相邻候选（`test/测试`，同轮各有 1 例 ✖，未逐个复现；建议下一批先核对其根/等待是否同族）：
`test/测试/kanban-fixes-verify/f4-operator-channel.test.ts`（使用 `"/proj"`）、
`test/测试/request-timeout-e2e.test.ts`（`configureDiagnostics`，未用 desktop `SessionManager`；
其失败可能来自等待预算而非根）。

### 6.3 清理缺口（未观测到挂起，但失败路径可能遗留 session/迭代器；下一批评估）

| 文件 | 风险点 |
| --- | --- |
| `test/桌面应用/download-decision.test.ts` | `new SessionManager` + `open`，但**全文件无 stop/dispose**；夹具 `dispose(){}` 不置停止位 |
| `test/测试/su-shell-approval-verify/c-desktop-injection.test.ts` | 4 次 `open`，**无 stop/dispose** |
| `test/测试/turn-watch-verify/c-cross-runtime-settings.test.ts` | 2 次 `open`，**无 stop/dispose** |
| `test/测试/g4-skill-verify/fixture.ts`、`test/测试/g4v2-mcp-verify/f-fixture.ts` | 构造 SessionManager 的辅助文件，无 stop；由调用方决定清理，需逐用例核对 |

### 6.4 其它（已排除或低风险）

- `configureDiagnostics` 的 30+ 个测试文件：全部调用 `disposeDiagnostics()`（无缺失）；interval 已
  `unref()`，不会单独阻止进程退出。
- `setInterval` 测试（`chief-workflow`、`network-monitor`、`runtime-core/background*`、`门禁引擎/
  session-handle` 等）：第六轮日志中除 `chief-workflow` 的既有红例外均未出现退出问题；`chief-workflow`
  文件本身已结束（后续文件继续运行），其失败属另一批已处理/待处理的断言语义问题，非本族。
- `multi-runtime.test.ts`（22 红）不使用 `/proj` 且无 `mgr.open`，根因不同；`directive-input.test.ts`
  无 SessionManager；二者不属于本族，留给对应批次。
- 共同点：这些文件均使用**有界 `until`** 或 `--test-timeout` 之外的无界 await 仅出现在
  `request-timeout-wiring`（6.1）与本批已修复文件。

## 七、overlay（白名单）与装配钉

- `src/common/装配/release-policy.mjs`：
  - `files` 精确加入 `test/桌面应用/replay-safe-retry.test.ts`（1 条，单文件不开目录）；
  - 新增第六批注释：`/proj` 在 CI 不可解析 → 宿主库存 fail-closed；改 mkdtemp 真实根（断言未放宽）；
    try/finally 清理 + 有界回执；实际挂起在 `request-timeout-wiring`（同族，下一批）；
  - 未列入任何产品代码；未列名 `app/`/`src/` 仍 fail-closed；未列名 `test/` 仍 excluded。
- `test/装配/release-packaging.test.ts`：新增
  `release overlay selects the v2.0.0 replay-safe-retry blocker test by exact path only`（入选仅此文件；
  相似名、`request-timeout-wiring.test.ts`、`decision-service.test.ts` 仍 excluded；既有 blockers 条目不回归）。
- 装配测试 19/19 pass。

## 八、验证（Windows 11 / Node v24.22.1，同一工作树）

| 项 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| 目标文件 ×3 | `node --test --test-concurrency=1 "test/桌面应用/replay-safe-retry.test.ts"` | **4/4 pass ×3**，0 fail/skip/cancelled，每次约 1s 自然退出 | `after-3x.txt` |
| 目标文件（超时参数） | `node --test --test-timeout=120000 "test/桌面应用/replay-safe-retry.test.ts"` | **4/4 pass**，exit 0 | `after-timeout-120000.txt` |
| 类型 | `npm run typecheck` | **exit 0** | `typecheck.txt` |
| 装配 | `node --test --test-concurrency=1 "test/装配/release-packaging.test.ts"` | **19/19 pass** | `release-packaging.txt` |
| 冻结树模拟（与 CI 同 actualTree `cd136c46…`） | 将本批 3 文件放入 `.release/source` 后跑目标文件与装配 | 目标 **4/4**、装配 **19/19** | `frozen-tree-after.txt` |
| 冻结 known-red runtime-core | `node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"` | 604 tests / 567 pass / **33 fail** / 4 skipped；逐名 diff 空 | `knownred-runtime-core.txt` |
| 冻结 known-red 门禁 | `node --test --test-concurrency=1 "test/门禁引擎/**/*.test.ts"`（运行前 LF 归一、运行后还原） | 577 tests / 571 pass / **5 fail** / 1 skipped；逐名 diff 空 | `knownred-gates.txt` |
| 冻结 known-red 编排 | `node --test --test-concurrency=1 --test-timeout=120000 "test/编排/**/*.test.ts"` | 1386 tests / 1360 pass / **24 fail** / 2 skipped；逐名 diff 空（239.5s） | `knownred-orchestration.txt` |

known-red 口径与基线（同前批）：

- runtime-core 基线 `角色卡/运行时核心/docs/change/2026-11-12_release-blocker-83-provider_evidence/
  14b-knownred-runtime-core.tap`（排除 reporter 汇总头 `failing tests:`）；33 个失败名逐名 diff 空。
- 门禁基线 `角色卡/运行时核心/docs/change/2026-11-10_B2_two-fixed-workflow-paths-evidence/
  07-gates-failure-names.txt`（5 名；CRLF 文件按 LF 比较）；逐名 diff 空。
- 编排基线 `角色卡/编排/docs/change/2026-11-11_B17_two-fixed-workflow-paths_evidence/
  b17-05-known-red-failnames.txt`（24 名）；逐名 diff 空。
- 门禁资源 LF 归一：运行前 `git cat-file blob HEAD:<path>` 临时写回
  `src/common/门禁引擎/workflows/chief/*.md`，运行后 `git checkout --` 还原；还原后 `file` 确认 CRLF、
  `git status` 干净。

## 九、限制与披露

1. 本机为 Windows 11；macOS 平台的最终确认由发布流水线执行（本批未触发 CI、未打 tag）。
2. 本批**未改产品代码**：`git-host-project-root-unresolvable` 的 fail-closed 是 v2.0.0 B3-2b 的
   有意语义（真实根不可解析时不得创建可被其它拼写命中的协调器）。若未来产品决定「允许以不存在的
   根打开会话」，那是产品决策，应另立变更并同时评估安全面，不应在本测试修订单夹带。
3. **第六批任务前提修正**：45 分钟挂起不是 `replay-safe-retry.test.ts`（该文件在 macOS 上已打印
   i18n ✔ 后结束；Windows 上其后文件才开始），而是 `request-timeout-wiring.test.ts` 的无界
   `await started`；本文档 §6.1 给出证据与下一批建议。若下一批修复该文件，必须同时：
   (a) 夹具根改真实临时目录；(b) 所有 `await *.started/pending/promise` 加有界等待；
   (c) 失败路径 try/finally 清理。
4. 本批只保证 `replay-safe-retry.test.ts` 在 CI 环境（无 `/proj`）下 4/4 通过并自然退出；同族其余
   文件仍为红（§六清单），发布是否放行取决于后续批次是否清完。
5. 未删除用例、未新增 skip、未放宽断言；`until` 预算与主断言逐字保留。
6. 编排 known-red 首次运行在约 704 个用例输出后约 10 分钟无新增（随后被终止）；同命令加
   `--test-timeout=120000` 重跑 **239.5s 完成 1386/1360/24/2**、逐名 diff 空，未出现超时用例。
   该停滞未复现，可能与当时并行的 release-prepare/worktree 操作或本机 IO 有关；记录在此，若后续
   再次出现需单独定位（与本批改动无文件交集）。

## 十、复现命令

```powershell
cd C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\release-v2.0.0-blockers-6
node --test --test-concurrency=1 "test/桌面应用/replay-safe-retry.test.ts"
node --test --test-timeout=120000 "test/桌面应用/replay-safe-retry.test.ts"
node --test --test-concurrency=1 "test/装配/release-packaging.test.ts"
npm run typecheck

# known-red（门禁需先 LF 归一、运行后还原）
node --test --test-concurrency=1 "test/runtime-core/**/*.test.ts"
node --test --test-concurrency=1 --test-timeout=120000 "test/编排/**/*.test.ts"
```

## 十一、文件与 SHA-256（提交前工作树）

| 文件 | SHA-256 |
| --- | --- |
| `test/桌面应用/replay-safe-retry.test.ts` | `a459ce346ad130429ceaf89174282354c87d98c8b46377707c98c44b921169b8` |
| `src/common/装配/release-policy.mjs` | `14510a903a7d3c74470126cf3b95e289ef68266fcff59851e0747f78899d71af` |
| `test/装配/release-packaging.test.ts` | `78be681a1edbfe6075dcc60f3f73940bd75c3b97ad412f788d91e61d4542c27a` |
