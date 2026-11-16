# R9 批次 C：spawn fence 第三路分类（零进程记录的安全 fail-closed）

- 日期：2026-11-17
- 角色：ANS「测试」（roleId: 测试）
- 工作树：`.claude/worktrees/fix-test-debt-r9c`（分支 `fix/test-debt-r9c`，起点 `da805ec` = `origin/main`）
- 范围：**仅** `test/编排/git-command.test.ts`（`Git final spawn fence: real pending-record interruption records no launch and permits a later genuine retry` 用例的显式分类段）。
- 数据源（只读）：
  - `角色卡/测试/docs/change/2026-11-16_remediation-plan-r9-update.md` §3.6（批次 C 口径）；
  - `角色卡/测试/docs/change/2026-11-16_remediation-plan_r9-evidence/11-spawn-fence-third-route.md`（第三路定性与建议）；
  - `角色卡/测试/docs/change/2026-11-16_remediation-plan_r9-evidence/03-error-bodies.md` §6（R9 失败体与 R8 对照）。
  - R9 CI run **43887939365**（原始工件 `/tmp/r11-art`，不入库）。
- 约束遵守：未改产品 `src/**`、`app/**`、`.github/**`、release-policy、main；未 commit/push；未触发 CI；未 tag；未读 `.env`；未占 9222/9223/9224。文件内既有 B6a（`:41-43` 规范根）与 B2（`core.precomposeunicode` 正/负例）修改原样保留。
- 本机：Windows 11 Pro x64 / Node **v24.22.1** / Git 2.55.0.windows.5（CI 为 Node 24.14.0）；无 macOS 环境，arm64 行为基于工件证据并用临时探针覆盖分支。

## 0. 摘要

| # | 项 | R9 事实 | 处置 | 结果 |
| ---: | --- | --- | --- | --- |
| 1 | Git final spawn fence（arm64，`git-command.test.ts`） | 227.4ms：`cancelled 0 !== 1` @ 旧 `:88`；`launched.length === 0` 进入路 A；`:80` 已通过 ⇒ `processFacts.length = 0`（无任何进程记录） | 在两路分类前新增**路 C**：`processFacts.length === 0` ⇒ 拒绝消息必须精确为 `git-host-lease-invalid-before-command`、ref 仍 null、零 owned 进程；路 A/B 条件逐字保留；所有分类断言携带实际 `message`，并新增 `fenceRoute` 诊断行 | 本机全文件 3× 绿（17/17，spawn fence 走路 A）；路 C 分支探针（模拟 arm64 观察时序）全文件绿，诊断行 `fenceRoute:"C"` + 精确消息；`npm run typecheck` exit 0 |

**结论**：这是测试分类缺口（plat 两路二分未覆盖“中断在首个 mutating 命令 lease 预检前被观察”的合法零进程 fail-closed），不是产品缺陷。修复只补分类与诊断，未放宽任何安全不变量、未删测试、未改产品。

## 1. 根因（引用 R9 定性）

- 失败名：`Git final spawn fence: real pending-record interruption records no launch and permits a later genuine retry`；arm64 227.4ms，断言 `assert.equal(cancelled.length, 1, "The never-launched path must record exactly one explicit pre-spawn cancellation")`（旧 `:88`）实际 `0 !== 1`。
- 过程事实：`launched.length === 0` 故进入路 A；同一用例 `:80` 的 `cancelled.length + launched.length === processFacts.length` 已通过 ⇒ **`processFacts.length = 0`**（`.git/ans/processes` 内没有任何进程记录）。同轮 x64（1,511.4ms）/Windows（1,200.4ms）走既有路 B 通过。
- 产品机理（只读）：
  - `src/provider/trunk/impl/git-command.ts:728`：`if (options.hostLeaseId && !checkGitHostAction(...).ok) throw new Error("git-host-lease-invalid-before-command");` —— 该预检发生在 pending 进程记录写入（`git-command.ts:749-750`）**之前**，因此该拒绝路径**不会**产生任何进程记录；
  - R8（旧测试版）arm64 与 x64 的失败体逐字为 `AssertionError: The input did not match the regular expression /git-command-failed:null:unknown/. Input: 'Error: git-host-lease-invalid-before-command'`，栈 `executeGit (git-command.ts:728)` —— 证明早期 lease 失效路径的消息就是 `git-host-lease-invalid-before-command`。
- 时序：macOS（arm64/APFS FSEvents）上中断观察可先于首个 mutating 命令的 lease 预检到达（含目录自身事件），产品以 host-lease 栅栏 fail-closed、零 owned 进程——**合法的第三路**。plat 的“路 A（无 started ⇒ 恰 1 条 cancelled）”与“路 B（有 started）”二分未覆盖它。
- 定性：不是产品缺陷（产品在无进程可取消时不伪造取消记录，符合 “No fake successful OS exit is invented”）；也不是 plat 修复失效（x64/Windows 与旧路 B 已转绿）。
- 诊断缺口（R9 §6.5 披露）：R9 的断言在打印 `message` 之前失败，失败日志里没有实际消息；本批次一并修复诊断。

## 2. 三路分类实现（仅测试分类段）

改动位于新文件 `:75-111`（共享不变量 + 分类）。分类优先级按可持久化进程证据，而不是只按错误文本：

```text
fenceRoute = processFacts.length === 0 ? "C" : launched.length === 0 ? "A" : "B"
```

| 路 | 门 | 断言（本次之后） |
| --- | --- | --- |
| **C（新增）** | `processFacts.length === 0`（⇒ `launched.length === 0`） | `message` 精确匹配 `/^git-host-lease-invalid-before-command$/`；`launched.length === 0`；`cancelled.length === 0`（不伪造取消记录）；`objects.readRef(candidateRef) === null`（未发布 candidate ref）。产品在 pending 记录前 fail-closed ⇒ 零 owned 进程、`update-ref` 必然未启动 |
| A（原样） | `else if (launched.length === 0)`（且 `processFacts.length > 0`） | `cancelled.length === 1`；`message` 匹配 `/^git-command-failed:null:unknown:/` |
| B（原样） | `else`（`launched.length > 0`） | `message` 匹配 `/^(git-host-lease-invalid-before-command|git-command-failed:null:unknown:)/` |

- 共享安全不变量（保留，且失败消息均加 `actual message: ${message}` 诊断后缀；条件逐字未变）：
  1. `cancelled.length + launched.length === processFacts.length`（不允许 pending/unknown 记录持有栅栏）；
  2. 每条 cancelled 记录 `pid === undefined && exitCode === null && termination === "unknown"`（不伪造 OS 成功退出）；
  3. 每条 launched 记录 `pid !== undefined && termination === "exited" && exitCode === 0`（无未结算 owned 进程）；
  4. `objects.readRef(candidateRef) === null`（被中断的 prepare 不发布 ref，`:71`）；
  5. 任何记录不得出现 `update-ref`；mutation 家族仅限 `hash-object/mktree/commit-tree`（`:72-74`）。
- 诊断：新增 `console.log(JSON.stringify({ fenceRoute, message, processFacts, launched, cancelled }))`（`:91`）；路 A/B 的 `assert.equal/assert.match` 条件与正则逐字保留，仅失败消息追加 `actual message: ${message}`（纯诊断，语义不变）。
- 零断言放宽、零删测试：路 A/B 原有门槛不动；路 C 以更精确的期望覆盖此前会被路 A 误杀的零进程分支，且对 `message` 的要求（精确 lease 栅栏码）比路 B 的“两码前缀之一”更严。

## 3. 本地验证（Windows 本机，定向）

- 调用方式（与 `.github/workflows/test-ci.yml` 的单文件定向形式一致）：`node --test --test-timeout=600000 "test/编排/git-command.test.ts"`。
- **全文件 3× 绿**：`tests 17 / pass 17 / fail 0`；总耗时 4.09s / 3.68s / 3.60s。spawn fence 用例 0.82–0.88s。
- spawn fence 用例本机路径走**既有路 A** 且绿，3× 诊断行一致：
  `{"fenceRoute":"A","message":"git-command-failed:null:unknown:","processFacts":1,"launched":0,"cancelled":1}`
- **路 C 分支覆盖探针**（临时复制文件，验证后立即删除，不入库）：在 `prepare` 前直接 `recordGitHostInterruption`，模拟 R9 arm64“中断观察先于首个 mutating 命令 lease 预检”的时序（产品路径与消息不变）。全文件 17/17 绿；spawn fence 用例诊断行：
  `{"fenceRoute":"C","message":"git-host-lease-invalid-before-command","processFacts":0,"launched":0,"cancelled":0}`
  —— 路 C 的四条断言（消息精确匹配、ref null、无 launched、无 cancelled）与后续真实重试、publication 三态段全部通过。
- `npm run typecheck`：exit 0，无错误。
- 清理：探针文件已删除；`git status` 仅 `test/编排/git-command.test.ts` 一处修改（26+/10−）。测试自身 `mkdtemp` 根留在系统临时目录（与 CI 行为一致；未按通配删除，避免误删并行批次正在使用的运行目录）。

## 4. CI 复核点（第九轮三平台）

1. **arm64（主目标）**：`Git final spawn fence …` 应绿。预期日志出现 `"fenceRoute":"C"`，且同含精确消息 `git-host-lease-invalid-before-command`；若实际走另一路，日志中的 `fenceRoute` 与 `actual message:` 直接给出事实，下一轮按日志定性（无需再猜）。
2. **x64 / Windows（零回退）**：保持绿；判定条件与 R9 前逐字一致（路 A/B），新增诊断行不改变语义。
3. **同文件零回退**：其余 16 名用例（B30、B2 precomposeunicode 正/负例、B6a 规范根、transport 等）未触碰，本地 3× 全绿。
4. **门禁口径**：未新增 skip/todo、未改 workflow/release.yml；该用例仍在 `test/**/*.test.ts` 全量回归内。

## 5. 披露与边界

1. **平台证据边界**：本机为 Windows x64，无 macOS 环境；arm64 路由 C 的定性来自 R8 失败体 + R9 `processFacts.length=0` 工件证据，路 C 分支本身用临时探针覆盖（直接记录中断，非真实 FSEvents 事件）。
2. **探针不等价于 arm64 事件源**：探针证明“中断先于首个 mutating 命令”时分类正确，但不单独证明 arm64 的事件源一定是目录自身事件；第九轮 CI 的 `fenceRoute`/`message` 日志将给出直接事实。
3. **未做的事**：未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占 9222/9223/9224；未改产品/src/app/workflow/release-policy；未改该文件分类段之外的任何行。
