# B1b（2026-11-16）：`chief-workflow.test.ts` 退出/句柄泄漏修复

- 角色：ANS「测试」（roleId: 测试）。
- 任务：测试债 B1b（最高优先）——修 `test/桌面应用/chief-workflow.test.ts` 的退出/句柄泄漏。
  依据 `角色卡/测试/docs/change/2026-11-16_remediation-plan.md` 与
  `2026-11-16_test-debt-b1-hang-leak.md`（B1 同类修复口径：清理失败不得跳过句柄释放）。
- 工作树/分支：`.claude/worktrees/fix-test-debt-b1b` / `fix/test-debt-b1b`，起点 `b522e0e`
  （= `origin/main`，含 B1/B2 合并后）。
- 范围：只改 `test/桌面应用/chief-workflow.test.ts` + 本记录/同前缀 `_evidence/`。未改产品代码/
  其它测试/workflow/release.yml/角色卡/边界；未 commit/push；未触发 CI；未 tag；未碰 main；
  未读 `.env`；未占用 9222/9223/9224。
- 本机环境：Windows 11 Pro 10.0.26300，Node v24.22.1（CI 为 Node 24.14.0），npm 11.19.1；
  与 CI 同为 Windows x64。

## 〇、结论摘要（先读）

1. **CI 静默事实与定位**：run 43793243595（Windows job 133056200177）在本文件最后一条
   W6/T5 用例于 `02:44:58.603Z` 通过后**无任何输出**，直到 `04:37:06.021Z` 被 120 分钟
   job 上限取消——静默 `6,727,418ms ≈ 112.12 分钟`。日志缺少文件级汇总（`ℹ tests 66` /
   `✖ failing tests:`），说明**全部用例已完成、但文件子进程没有退出**（不是测试级挂起：
   测试级挂起会有 300000ms cancelled 条目）。
2. **根因（句柄侧，确定性）**：本文件有 9 处 `createServer` 调用点（按用例/变体展开后每个用例一个 HTTP 夹具
   server），原 finally 是**顺序清理链**，`server.closeAllConnections()/close()` 排在
   `desktop.stopSession`、`desktop.disposeProjectDocuments()`、证据写入等易抛错步骤**之后**。
   `disposeProjectDocuments()` 在 Git host coordinator 被在途 `dispatch` lease 占用时会**同步抛**
   「项目正在处理派发或权限变更，选择尚未更改。请稍后重试。」
   （`changeProjectSource` → `beginGitHostAction` 返回 `git-host-coordinator-busy`）。任一步抛错即
   **跳过 server.close**；监听中的 server 是 ref'ed libuv handle，`node --test` 的文件子进程因此
   **永不退出**。CI 上 W29×4 / W30×2 / W48 foreign-lease 是 Windows 专属失败（中途失败、清理启动时
   仍有在途会话/派发），正是能命中该抛错窗口的候选路径（见 §2.3 的归因边界）。
3. **Windows 本机强制等价复现（确定性）**：真实 desktop + 真实 `beginGitHostAction({kind:"dispatch"})`
   租约 ⇒ `disposeProjectDocuments()` 如实抛出上述忙碌错误；旧清理顺序下，夹具 server 仍在监听
   （`TCPServerWrap`），进程 15s 外部墙钟到点被杀（EXIT=124）；同一状态下按修复口径（租约结束 +
   server 必关 + 有限重试）进程自然退出（EXIT=0）。日志：`_evidence/04-…leak.log` / `05-…exit.log`。
4. **修复（只改本测试文件，+198/−82 行）**：所有用例 finally 改为**清理步骤互相隔离**（一步失败不跳
   后续释放）；HTTP 夹具 server 统一经工厂登记，**文件级 `after()` 兜底关闭**任何遗漏 server；清理
   await 有界（15s）；`disposeProjectDocuments()` 有界重试后再放弃（只诊断、不跳过 server 关闭）；
   diagnostics/临时目录/环境变量/全局订阅全部在隔离步骤中复位。断言文本/语义零放宽、用例零删除、
   既有失败名保持。
5. **验证**：3× 自然退出（`--test-timeout=300000`，外部 600s）+ 最小环境 1× + 8.3 短名 TEMP 1×；
   失败名与本机基线（66 tests / 58 pass / 8 fail：W5、W10、W19、W33、W34、selected、commit-race、
   required）**逐名一致、零新增**；`npm run typecheck` EXIT=0。详见 §四。
6. **残余风险（如实披露）**：本机在修复前后都偶发观察到一种**与 socket/句柄无关的原生主线程 CPU 自旋**
   （套件全部完成后发生；V8 profiler 只剩 `(root)/(idle)`、无 LISTENING/ESTABLISHED socket、单线程
   ~1 core；`--test-isolation=none` 3/3 自然退出；未修复的 pristine 原文件 4/4 自然退出，说明这是
   低频竞态、4 次内未稳定复现）。它不是本测试文件可释放的句柄，修复后的 `after()` 兜底也只保证
   「JS 收尾可运行」时的句柄闭合。若 CI 再现无输出静默，需按 Node 运行时/进程隔离路径另案定位
  （本批不改 workflow）。

## 一、CI 事实（run 43793243595，Windows x64 job 133056200177）

| 项 | 值 |
| --- | --- |
| 命令 | `node --test --test-concurrency=1 --test-timeout=300000 "test/**/*.test.ts" 2>&1 \| tee test-ci-output.log`（Node 24.14.0） |
| job 上限 | `timeout-minutes: 120` |
| 本文件最后一条输出 | `2026-11-16T02:44:58.6034176Z` ✔ W6/T5 团队计划宿主绑定：普通消息回合无受派任务 ⇒ host-local plan-task-unavailable（20.7474ms） |
| 取消 | `2026-11-16T04:37:06.0211141Z` `##[error]The operation was canceled.` |
| 静默 | **6,727,418ms ≈ 112.12 分钟** |
| 关键判据 | 日志无 `✖ test/桌面应用/chief-workflow.test.ts (…)`、无 `ℹ tests 66`、无 `✖ failing tests:` ⇒ 文件子进程未退出，而非测试挂起 |
| 本文件 CI 失败名（静默前） | W5/W10/W19/W33/W34（与本机基线同名；另含子测试 selected/commit-race/required）+ **CI 专属** W29×4、W30×2、W48 foreign-lease |
| 摘录 | `_evidence/01-ci-silence-excerpt.log`（最后 7 行时间戳与取消行） |

> 说明：Windows job 的内联 `✖` 行为无错误体（顶层 `failing tests:` 从未输出），所以 CI 专属失败的
> 具体错误文本不可见；本记录对 CI 触发路径的归因是「机制已确定性证明 + 失败路径候选」，见 §2.3。

## 二、根因（句柄侧）

### 2.1 代码事实

1. `desktop.disposeProjectDocuments()`（`app/desktop/interface.ts:2448`）调用
   `changeProjectSource([], …)`（同文件 `:1075`）；后者对每个项目根执行
   `beginGitHostAction({ projectRoot, kind: "authorization-change" })`，失败即抛
   **「项目正在处理派发或权限变更，选择尚未更改。请稍后重试。」**。
2. `beginGitHostAction`（`src/provider/trunk/impl/git-command.ts:1037-1046`）在 coordinator
   `state.lease` 非空时返回 `git-host-coordinator-busy`。在途 `dispatch`（`app/desktop/session/dispatch.ts:627/1101`
   的 `beginGitHostAction({kind:"dispatch"})`）会持有该 lease 直至台账/git 步骤结束。
3. 本文件每个含 desktop 夹具的用例都在 finally 里按序执行：
   `channel.rejectAllPending → [逐会话 stopSession] → desktop.stopSession() → desktop.disposeProjectDocuments()
   → server.closeAllConnections()/close() → 环境变量恢复 → 诊断/临时目录清理`。
   第 3–4 步在 CI 慢机上遇到在途 lease 时抛错 ⇒ **server 关闭被跳过**。
4. 监听中的 HTTP server 是 ref'ed 句柄；`node --test` 的文件子进程不会自然退出，父进程也没有
   文件级超时（`--test-timeout` 只约束测试函数），于是直到 job 级 120 分钟上限。

### 2.2 Windows 本机强制等价复现（确定性）

复现脚本：`_evidence/10-forced-repro.mjs`（真实 `createDesktopInterface` + `pickProject/listProject`
+ 真实 `beginGitHostAction({kind:"dispatch"})` 租约；不伪造卡片/权限）。

- 旧清理顺序（`_evidence/04-forced-busy-old-order-leak.log`）：
  `disposeThrew = "Error: 项目正在处理派发或权限变更，选择尚未更改。请稍后重试。"`、
  `activeAction="dispatch"`、`serverListening=true`、post-suite resources 含 `TCPServerWrap`；
  外部 `timeout 15s` 到点 **EXIT=124**（进程不退出）。
- 修复口径（`_evidence/05-forced-busy-fixed-order-exit.log`）：同一租约状态下先保证 server 关闭、
  租约结束后 `disposeProjectDocuments()` 成功；**EXIT=0 自然退出**。
- 结论：`disposeProjectDocuments` 的同步抛错 → 跳过 server.close → 监听句柄保活，是**可确定复现**的
  退出阻断链；与 B1 在 `git-role-workflows-driver` 修的「dispose 抛错 server 不关」同类。

### 2.3 CI 触发候选与归因边界

- CI 专属失败 W29 的四个变体在等待「init 报告/创建者收口依据」时约 10.3s 失败（Windows 慢机；
  本机 5.5–6.5s 通过），失败发生在**回合/派发尚在链上时**；W30×2、W48 foreign-lease 同样是中途断言。
  这些用例的 finally 正好在「有在途 dispatch 会话」时启动，命中 `disposeProjectDocuments` 的忙碌抛错窗口。
- 本机复现的强制租约与上述状态同构（真实 coordinator、真实在途 lease），因此机制成立；但 CI 内联
  日志没有错误体，无法逐字证明就是这一处抛错——修复按「**任何**前置清理步骤抛错都不再跳过后面的
  server 关闭」处理，覆盖该抛错及其它同类抛错。
- 归因限制：W29/W30/W48 的期望更新属 B3c/B4，本批**不改期望、不放宽断言**；修复只保证这些失败
  路径不再泄漏监听句柄。

## 三、修复清单（只改 `test/桌面应用/chief-workflow.test.ts`，+198/−82）

新增文件内 helpers（位于 `rmrf` 之后）：

- `fixtureServers` + `trackedServer` + 统一 `createServer` 工厂：本文件全部 9 处 `createServer`
  调用点（按用例/变体展开的每个实例）自动登记（各用例调用点不变）。
- `closeServer(server)`：`closeAllConnections()` + 必要时 `close()`（幂等、异常不外溢）。
- `releaseAll(context, steps)`：**顺序执行全部清理步骤、逐步捕获错误**，全部执行完后只输出诊断；
  一步失败不会跳过后续 server 关闭/临时目录清理。清理错误不改变用例断言结果（保持失败名基线）。
- `settleBounded(context, work, ms)` / `stopManagerBounded(...)`：清理 await 有界（默认 15s），
  超时输出诊断后继续后续释放。
- `disposeDocumentsBounded(desktop, context)`：`disposeProjectDocuments()` 在 coordinator 忙时
  有界重试（0/50/200/800ms），仍失败只诊断、**不阻断 server 关闭**。
- 文件级 `after()`：兜底关闭任何仍存活的夹具 server、`disposeDiagnostics()`、并在主文件子进程
  （`!ANS_W52_UNKNOWN_CHILD`）打印残余的 `TCPServerWrap/TCPSocketWrap/Timeout/Immediate/MessagePort`
  资源类型（CI 排查用）。

改动点（所有 finally 均改为 `releaseAll` 步骤；W5/W10 原有的 attempt 清理保留并同样受 server 兜底）：

| 用例/夹具 | finally 修复要点 |
| --- | --- |
| 能力矩阵 / role_activity_log（2 例） | manager.stop 有界 + rmrf 隔离 |
| W1b 共享 realWaitingChiefLoop | clearTimeout/channel/directive/releaseMain/allSettled/stop/versionStack/rmrf 全部独立 |
| B1 diagnostics | disposeDiagnostics + rmrf 独立 |
| W3 本地 HTTP / W3 inventory | stopSession 有界、server 必关、env 恢复、rmrf 独立 |
| W14 worker/verifier/review（3 例） | live 会话逐个有界 stop、disposeDocuments 有限重试、server 必关 |
| W16 两例 / W17 / W19 / W20 两例 | stop/disposeDocuments/server/env/诊断/rmrf 独立 |
| W21/W28/W29/W30/W33/W34/W35 变体（13 例） | pre-cleanup 证据、unsubscribe、channel、逐会话 stop、disposeDocuments、server、env、诊断、rmrf 全部独立 |
| W27 两例 / W36 / W38 两例 / W42 / W45 四例 / W47 两例 / W48 四例 | 同口径；W48 的 foreign lease 结束、`injected` settle、证据写入也不再能跳过 server 关闭 |
| W4 / W6-T5 三例 | manager.stop 有界 + rmrf 隔离 |

断言文本/语义、用例数量与名字均未改动；清理失败仅 `console.error` 诊断（不新增失败名）。

## 四、验证

### 4.1 3× 自然退出（最终文件；`node --test --test-timeout=300000`，外部 `timeout -k 30 600`）

| 次 | 结果 | 耗时 | tests/pass/fail | 失败名 |
| --- | --- | --- | --- | --- |
| 1 | 自然退出 EXIT=1 | 1m14.007s（duration 73,938.5ms） | 66/58/8 | 8 名同基线（diff 空） |
| 2 | 自然退出 EXIT=1 | 1m16.699s（duration 76,631.7ms） | 66/58/8 | 8 名同基线（diff 空） |
| 3 | 自然退出 EXIT=1 | 1m11.641s（duration 71,572.4ms） | 66/58/8 | 8 名同基线（diff 空） |

> 表内 V3 是干净重跑（`13-final-verify-run3.log`）。此前第 3 次尝试与残余自旋进程（§五.2）
> 同机争用（`_evidence/13-final-verify-run3-load-contended.log`）：进程自然退出（1m24.4s），
> 但负载下 W30×2 / W35 / W36 追加工时超时（66/54/11）。这些名字正是 §2.3 的 CI 慢机失败族；
> 为满足「失败名逐名一致」门槛，该次不计入 3×。

基线（修复前同机 5 次运行，逐名稳定）：`W5`、`W10`、`W19`、`W33`、`W34`、`selected`、
`commit-race`、`required`（66 tests / 58 pass / 8 fail）。逐名对照见
`_evidence/07-prefix-baseline-failnames.txt` 与 §4.4。

### 4.2 最小环境/独立 TEMP（1×）

- 最小环境/全新空 TEMP：`env -i` 仅保留 `PATH/SystemRoot/TEMP/TMP/TMPDIR/USERPROFILE/HOMEDRIVE/HOMEPATH/COMSPEC/PATHEXT/NUMBER_OF_PROCESSORS`，
  `TEMP/TMP/TMPDIR` 指向新建空目录 `ans-b1b-min-env2`；外部墙钟 600s。
- 结果：**自然退出 EXIT=1**，1m11.734s（duration 71,637.8ms），66 tests / 58 pass / 8 fail，
  失败名与基线逐名一致（`diff -u` 空）。日志：`_evidence/14-minimal-env-run.log`。
- 首次最小环境尝试在套件完成后命中残余原生自旋（无外部 timeout，已中止；`_evidence/14a-…`），
  重跑（上面这次）自然退出——与 §五.2 的低频竞态一致。

### 4.3 Windows CI 等价条件（8.3 短名 TEMP，1×）

- 条件：`TEMP/TMP/TMPDIR` 指向 Windows 8.3 短名目录
  `C:\Users\51054\AppData\Local\Temp\AN9FE2~2`（→ `ans-studio-8dot3-long-name-b1b`），外部墙钟 600s。
- 结果：**自然退出 EXIT=1**，1m13.011s（duration 72,932.1ms），66 tests / 58 pass / 8 fail，
  失败名与基线逐名一致（W29/W30 在 8.3 条件下仍同本机正常通过）。日志：`_evidence/15-8dot3-run.log`。

### 4.4 失败名对照

3 次门槛运行（V1/V2/V3）与本机修复前基线（5 次运行逐名稳定的 8 名）**逐名一致、零新增**：

- 基线：W5、W10、W19、W33、W34、selected、commit-race、required（66 tests / 58 pass / 8 fail）。
- V1/V2/V3：均 66/58/8，`diff -u` 为空。
- 另有一次与残余自旋进程争用的尝试出现负载性 W30×2 / W35 / W36 追加超时（66/54/11，**不计入
  3× 门槛**，日志 `13-final-verify-run3-load-contended.log`）；这组名字与 §2.3 所述 CI 慢机
  失败族一致，说明负载会放大等待类断言，但与修复无关。
- 明细：`_evidence/16-failnames-compare.txt`、`07-prefix-baseline-failnames.txt`。

### 4.5 typecheck

`npm run typecheck` → `tsc --noEmit`，**EXIT=0**（`_evidence/12-typecheck.log`）。

### 4.6 清理诊断

所有验证运行中未出现 `B1b cleanup retained` / `B1b disposeProjectDocuments retained` /
`B1b … exceeded 15000ms`（即清理链无失败、无越界 await）。`after()` 在末用例后通常会打印
`B1b post-suite active resources: ["Timeout","Timeout","Timeout"]`：这是最后几条用例里
`inertRoleHandle().events()` 的 3 个一次性 `tick(50)` pump（50ms 后返回 done 自行结束），
健康运行均在其后毫秒级自然退出；诊断依据见 `_evidence/08-healthy-live-timers.log`（临时计时器
跟踪显示 3 个 50ms timeout，创建栈指向 `tick`/iterator next）。若该行出现 `TCPServerWrap`/
`TCPSocketWrap`，即为 §二 的泄漏类，需要按本记录的修复路径排查。

## 五、限制与披露

1. **CI 触发路径的证据边界**：Windows CI 内联失败无错误体；W29/W30/W48 的 CI 专属失败与清理抛错的
   因果关系是「机制确定性证明（强制租约复现）+ 失败路径候选」，不是 CI 日志逐字证明。修复对
   **所有**前置清理抛错生效，因此不依赖具体是哪一处。
2. **残余原生自旋（本机、未修复）**：本机在默认进程隔离模式下偶发套件完成后 100% CPU、无汇总、
   无 socket 的挂起（修复前后均观察到；`_evidence/03-…`, `09-native-spin-evidence.txt`）。证据：
   V8 CPU profiler 只有 `(root)/(idle)`（主线程无 JS 执行）、无 LISTENING/ESTABLISHED socket、
   单线程 Running ~1 core；`--test-isolation=none` 3/3 自然退出；未修复的 pristine 原文件 4/4
   自然退出（该次数内未复现）。该现象不是本文件可释放的句柄，测试侧无法从根上消除；若 CI 再现，需要 Node
   运行时/进程隔离开关或 CI step 级超时另行处置（本批不改 workflow）。
3. **清理错误不抛出**：为保持既有失败名逐名一致，清理步骤的错误只输出诊断、不改变用例结果；
   这弱化了「清理失败即红」的信号，但保证 server 必关与基线稳定。若后续要收紧，可另批加严格模式。
4. **未做的事**：未改 W29/W30/W48 的期望（B3c/B4）；未跑三套冻结 known-red（按 B1b 范围）；
   未触发三平台 CI（由统筹安排 R 轮复核）。
5. **8.3 短名 TEMP**：本文件的退出链与 8.3 无关（B1 的根因在 e2e driver）；该条件仅作 CI 等价
   附加验证。

## 六、证据索引（`…_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `01-ci-silence-excerpt.log` | CI 最后 7 行（末用例、静默、取消）与静默计算 |
| `02-local-hang-8dot3-run1.log` | 本机 8.3 短名 TEMP 全文件挂起（用例全完成、无汇总、EXIT=124） |
| `03-local-hang-normal-temp-fixed-run1.log` | 修复后普通 TEMP 一次原生自旋挂起（EXIT=124，600s） |
| `04-forced-busy-old-order-leak.log` | 强制租约 + 旧顺序：dispose 抛错、TCPServerWrap 保活、EXIT=124 |
| `05-forced-busy-fixed-order-exit.log` | 同状态修复口径：EXIT=0 |
| `06-native-spin-inspector-diagnostic.log` | 自旋进程 inspector：pause 超时（无 JS 可停） |
| `07-prefix-baseline-failnames.txt` | 修复前同机 5 次基线失败名（逐名一致） |
| `08-healthy-live-timers.log` | 健康运行的 after() 资源/50ms tick 计时器诊断（3 个一次性 pump） |
| `09-native-spin-evidence.txt` | 自旋三例的合并证据（socket/线程/Profiler/isolation-none 对照） |
| `10-forced-repro.mjs` | 强制等价复现脚本（leak/fixed 两模式） |
| `11-pristine-and-isolation.log` | pristine 原文件 4/4 自然退出；isolation=none 3/3 自然退出 |
| `12-typecheck.log` | `npm run typecheck` 输出与 EXIT=0 |
| `13-final-verify-run{1,2,3}.log` | 3× 门槛验证完整日志（V3 = 干净重跑） |
| `13-final-verify-run3-load-contended.log` | 与残余自旋进程争用时的第 3 次尝试（负载性 W30×2/W35/W36，不计入门槛）；`…-failnames.txt` 为同次失败名列表 |
| `14-minimal-env-run.log` | 最小环境/独立 TEMP 运行日志（门槛重跑） |
| `14a-minimal-env-spin-attempt.log` | 最小环境首次尝试（残余自旋；未加外部 timeout，已中止，不计入门槛） |
| `15-8dot3-run.log` | 8.3 短名 TEMP 运行日志（可选验证） |
| `16-failnames-compare.txt` | 基线↔验证运行失败名逐名对照（含争用尝试说明） |
| `17-fix.diff` | 本文件修复完整 diff |
