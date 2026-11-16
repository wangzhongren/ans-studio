# 测试收尾批 2（misc2）：run-pin M1/M2/M3、Pipeline initial workflow、Q74、W36、Git final spawn fence

- 日期：2026-11-16
- 角色：测试（roleId: 测试）
- 工作树：`.claude/worktrees/misc2`（分支 `fix/test-debt-misc2`，起点 `d1f256f` = `origin/main`）
- 范围：R6 残差 5 项——
  1. `test/桌面应用/run-pin.test.ts`：`run-pin：M1/M2/M3 …`（x64+Windows）
  2. `test/编排/run-role-submit-capabilities.test.ts`：`Pipeline initial workflow source …`（Windows-only）
  3. `test/测试/git-role-workflows-e2e.test.ts`：`Q74 owned Git metadata observer …`（x64+Windows）
  4. `test/桌面应用/chief-workflow.test.ts`：`W36 真实Chief可无M0-plan-D3派五builtin准备…`（x64-only）
  5. `test/编排/git-command.test.ts`：`Git final spawn fence …`（macOS-x64-only）
- 数据源（R6 权威工件，只读）：
  - `角色卡/测试/docs/change/2026-11-16_remediation-plan-r6-update.md`
  - `_r6-evidence/16-platform-diff.tsv`、`10-block-codes.json`、`01-ci-failures.json`、`03-failnames-macos-x64.txt`、`04-failnames-windows-x64.txt`
  - 原始工件：`/tmp/r9-art/test-logs-mac-x64/test-ci-output.log`、`/tmp/r9-art/test-logs-win-x64/test-ci-output.log`（run **43848313583**，`main @ 82dc180`；arm64 job 级 cancelled、无工件）
  - 先例记录：B3a 残差、B4-fu、B3c-fu（8.3 短名 × 同步 `realpathSync` 同源）
- 本机：Windows 11 Pro x64，Node v24.22.1（CI 为 Node 24.14.0）。
- 约束遵守：只改上述测试文件的目标夹具/期望行 + 本记录与 `_evidence/`；未改产品/workflow/release.yml/角色卡/边界/其他测试；未 commit/push；未触发 CI；未 tag；未碰 main；未读 `.env`；未占 9222/9223/9224。

## 0. 摘要

| # | 项 | R6 平台 | 定性 | 改法 | 结果 |
| ---: | --- | --- | --- | --- | --- |
| 1 | run-pin M1/M2/M3 | x64+Windows | **测试装配竞态**（非产品）：demo 脚本是会话级共享引用，handoff 回合后 chief 收到回交/通知 prompt 时重放上一回合 `dispatch_task`，产生第二条「重复派发已抑制」ok 回执；`driveTurn` 取最后一条回执 ⇒ 392 行 `true !== false` | 夹具一次性脚本 + 只取「本回合/本角色/本载荷」回执 | 本机改前定向 11 次复现 3 次（首轮 10 次中 2 次 + 捕捉轮首跑 1 次，逐字同形）；改后 20× 0 失败；全文件 20/20 ×3 自然退出 EXIT=0 |
| 2 | Pipeline initial workflow source | Windows-only | **环境拼写 × 测试夹具**：`fs.realpathSync`（JS 实现）在 Windows 不展开 8.3 短名（`RUNNER~1`），产品异步 `realpath` 展开 ⇒ `realpath(dir) !== dir` 误拒写、最终读 ENOENT | 夹具根改用 `fs.realpathSync.native` | 8.3 短名 TEMP 下改前 1× 逐字复现 CI 错误体；改后 3× 正常 + 3× 短名 TEMP 全绿；全文件 14/14 EXIT=0 |
| 3 | Q74 | x64+Windows | **环境拼写 × 夹具未规范化根**：`hashFixtureFiles` 以 `realpath(file) === file` 拒绝未解析链接祖先；macOS `/var→/private/var`、Windows 8.3 短名均让合法夹具误判 | Q74 夹具根 `await fs.realpath(mkdtemp(...))` 规范化 | 8.3 短名 TEMP 下改前 1× 复现（actual long vs expected short）；改后 3× 正常 + 3× 短名 TEMP 全绿 |
| 4 | W36 | x64-only | **平台候选 + mock 形状强假设**：`body.tools.some(tool => tool.function.name …)` 遇 `tool.function` 缺席即 TypeError；请求来源未在工件中定位 | 夹具识别嵌套/扁平两种真实 tools 形状；无名元素记异常样本进断言诊断；不崩溃、不猜幕僚、不放宽业务断言 | 本机 3× EXIT=0；全文件 66/66 EXIT=0（本机不复现 CI 形状） |
| 5 | Git final spawn fence | macOS-x64-only | **平台候选（macOS FSEvents 投递延迟）**：延迟探针证明回调晚到 100ms 时两路 fail-closed 中走 `git-host-lease-invalid-before-command`，且先前的 git plumbing 命令已 `launch=started`/`exit=0` ⇒ 后续「records no launch」断言在延迟路不成立；只改首条正则等于放宽核心断言，故不改 | **不改**（记录理由与探针） | 本机 3× EXIT=0（本机走期望路径）；待 macOS 复核 |

**结论**：4 项按当前语义修复（断言未放宽、用例未删）；spawn fence 明确列为 macOS 平台候选（等价 fail-closed，但“no launch”不成立，改期望即放宽）。`npm run typecheck` **EXIT=0**。

## 1. 逐项定性（CI 错误体 → 本机复现 → 改法）

### 1.1 run-pin M1/M2/M3（`test/桌面应用/run-pin.test.ts`）

**CI 错误体**（两平台逐字同形，见 `_evidence/01-run-pin-ci-excerpt.txt`）：

```
AssertionError [ERR_ASSERTION]: 已受理：任务 #t-mwj4lu36-676aba20 已报告，重复派发已抑制（未创建新任务、未投递）；如需返工请使用新的任务文本或幂等键。
true !== false
    at TestContext.<anonymous> (…/test/桌面应用/run-pin.test.ts:392:12)
```

392 行是 `assert.equal(worker.ok, false, …)`：期望 convener→implementer 被 trunk execution preflight 冻结硬拒（`worker-freeze stage=prepare code=trunk-verify-failed … effective-manifest-missing`），实际收到 `ok:true` 的重复派发抑制回执。

**本机复现**：定向运行 11 次出现 **3 次失败**（首轮 10 次中 2 次 + 捕捉轮首跑 1 次），错误体与 CI 逐字同形（`_evidence/run-pin-local-flake-repro.log`；约 27% 复现率，说明是夹具竞态而非 CI 环境独有）。

**机理**（临时 `RUNPIN_DEBUG` 仪表，`_evidence/run-pin-local-flake-repro-debug.log`、`_evidence/01-run-pin-local-race-analysis.txt`）：

1. chief 的 handoff 回合脚本 = `dispatch_task(convener, "把项目交付运营")`。
2. handoff 任务投递到 convener，convener 回合 settle 产生回交/通知，又向 chief 发一次 prompt。
3. demo runtime 的脚本数组是**会话级共享引用**，每个 prompt 都会重放；chief 的脚本仍是 handoff 调用 ⇒ 重放产生第二条 `ok:true`「重复派发已抑制」回执。
4. `driveTurn` 返回 `receipts[receipts.length - 1]`，恰好拿到这条无关回执。

**改法（仅夹具）**：
- `wrapped dispatch` 完成后清空本角色脚本（一次性脚本）：后续无关 prompt 不再重放旧 `dispatch_task`。
- `driveTurn` 只取 `slice(before)` 中 `fromRoleId === roleId && payload.roleId/task` 匹配的回执；无关并发回执不得顶替被测 dispatch。
- 断言文本、用例数量、产品语义（BUG-5 重复抑制）均未改。

**验证**：改后 20× 定向 0 失败；全文件 `20 tests / 20 pass / 0 fail` ×3 自然退出，EXIT=0（`run-pin-full-run{1,2,3}.log`）。

### 1.2 Pipeline initial workflow source（`test/编排/run-role-submit-capabilities.test.ts`）

**CI 错误体**（Windows-only，见 `_evidence/03-pipeline-initial-workflow-ci-excerpt.txt`；macOS x64 同用例 ✔）：

```
AssertionError [ERR_ASSERTION]: {"ok":false,"reason":"missing","message":"Error: ENOENT: no such file or directory, realpath 'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\ans-o10-workflow-source-KljWHL\\.ans\\trunk\\operations\\59ff…\\stable-source.json'"}
    at …/run-role-submit-capabilities.test.ts:504:12
```

**定性**：B6a 已把夹具根注释为「规范根」，但用的是**同步 JS `fs.realpathSync`**——B3c-fu 已证其在 Windows 不展开 8.3 短名；产品写路径 `git-trunk-store.ts:215` 用异步 `realpath`（native 语义，展开短名）做 `realpath(dir) !== dir` 校验，于是短名根下写被拒（`workflow-source-directory-unsafe`），最终读 ENOENT。**测试夹具问题，非产品缺陷**。

**本机复现**：把 `TEMP/TMP` 设为 8.3 短名目录（`C:/Users/51054/AppData/Local/Temp/ANS-CI~1`，等价 CI 的 `C:\Users\RUNNER~1\…`）→ 改前 1× 逐字复现（`_evidence/pipeline-short-temp-prefix-repro.log`：`reason:"missing"` + `realpath` ENOENT + `ANS-CI~1`）。

**改法**：`fs.realpathSync(...)` → `fs.realpathSync.native(...)`（仅目标用例根一行 + 注释）。

**验证**：正常 TEMP 3× + 短名 TEMP 3× 全绿（`pipeline-run{1,2,3}.log`、`pipeline-short-temp-run{1,2,3}.log`）；全文件 `14/14` ×1 EXIT=0（`run-role-submit-capabilities-full.log`）。

### 1.3 Q74（`test/测试/git-role-workflows-e2e.test.ts`）

**CI 错误体**（两平台同断言、不同拼写；见 `_evidence/02-q74-ci-excerpt.txt`）：

```
AssertionError [ERR_ASSERTION]: Fixture inventory path must not traverse unknown links
+ actual   '/private/var/folders/…/q2-git-metadata-observer-…/.git/HEAD'   (x64)
+ actual   'C:\\Users\\runneradmin\\AppData\\Local\\Temp\\…\\.git\\ans'    (Windows)
- expected '/var/folders/…/…/.git/HEAD'
- expected 'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\…\\.git\\ans'
```

失败点为 `git-role-workflows-driver.ts:355`：`assert.equal(await fs.realpath(file), file, "Fixture inventory path must not traverse unknown links")`。`hashFixtureFiles` 的契约实际要求**规范根**——同文件其它夹具（`q2ProjectFixture`，driver:447-451）已先 `await fs.realpath(mkdtemp(...))`；Q74 是唯一直接 `mkdtemp` 后交给 `hashFixtureFiles` 的用例。macOS 的 `/var → /private/var` 与 Windows 8.3 短名都是环境别名，不是夹具链接。**测试夹具未规范化根，非产品缺陷**。

**本机复现**：8.3 短名 TEMP 下改前 1× 复现（actual 长名 vs expected `ANS-CI~1`），与 CI Windows 形态一致；改后 3× 绿。

**改法**：Q74 夹具根 `const root = await fs.realpath(await fs.mkdtemp(...))`（native 语义；一行 + 注释）。未改 driver 断言、未改其它用例。

**验证**：正常 TEMP 3× + 短名 TEMP 3× 全绿（`q74-run{1,2,3}.log`、`q74-short-temp-run{1,2,3}.log`）；全文件（`--test-concurrency=1 --test-timeout=300000 --test-force-exit`）`19 tests / 7 pass / 0 fail / 12 skipped`，EXIT=0（`git-role-workflows-e2e-full.log`，183s；默认跳过的 12 项为环境开关用例）。

### 1.4 W36（`test/桌面应用/chief-workflow.test.ts`）

**CI 错误体**（x64-only，见 `_evidence/04-w36-ci-excerpt.txt`）：

```
TypeError: Cannot read properties of undefined (reading 'name')
    at file:///…/test/桌面应用/chief-workflow.test.ts:2111:117
    at Array.some (<anonymous>)
```

即 mock 的 `body.tools.some((tool: { function: { name: string } }) => tool.function.name === "ans_role_activity_log")` 收到某个 `tool.function` 缺席的元素。chat-transport 只发嵌套 `{type:"function", function:{name…}}`；扁平 `{type:"function", name…}` 来自 responses 原生路径。**夹具形状强假设 + x64 平台候选**（本机不可复现；B4-fu 4× 绿）。

**改法（仅 W36 行）**：
- 工具名提取兼容嵌套与扁平两种真实形状：`value?.function?.name ?? value?.name`。
- 无名元素记录形状样本到 `toolShapeAnomalies`，并拼进 `wait` 失败诊断串；不把未知请求猜成幕僚、不放宽任何业务断言。
- 未触碰清理结构、W19/W33/W1b 等其它用例。

**验证**：目标 3× EXIT=0（`w36-run{1,2,3}.log`）；全文件 `66 tests / 66 pass / 0 fail` EXIT=0（`chief-workflow-full.log`；--test-force-exit 与 CI 同口径）。

### 1.5 Git final spawn fence（`test/编排/git-command.test.ts`）——平台候选，不改

**CI 错误体**（macOS-x64-only，见 `_evidence/05-spawn-fence-ci-excerpt.txt`）：

```
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /git-command-failed:null:unknown/. Input:
'Error: git-host-lease-invalid-before-command'
    at async TestContext.<anonymous> (…/git-command.test.ts:51:9)
```

**探针定性**（`_evidence/spawn-fence-delay-probe.log` / `.mjs`，仅本机诊断，不入产品）：同一场景把 `fs.watch` 回调延迟投递以模拟 macOS FSEvents：

| 回调延迟 | prepare 错误 | 进程记录 |
| ---: | --- | --- |
| 0ms（Windows 本机路径） | `git-command-failed:null:unknown:` | **1** 条，`launch=cancelled-before-spawn`、`pid` 缺席、`termination=unknown` |
| 100ms（模拟 macOS FSEvents） | `git-host-lease-invalid-before-command` | **3** 条，全部 `launch=started`、`exitCode=0`（内部 git plumbing 已 spawn） |

CI 栈显示内层 `writeTree` 成功、中层 `executeGit` 在 `git-command.ts:724` 因 lease 已失效抛错——与探针 100ms 路径一致。两路都在**下一次 mutation 前** fail-closed（ref 未发布），但延迟路下测试后续断言 `files.length===1`、`launch=cancelled-before-spawn`、`pid===undefined` 不成立。R8 工件同形：macOS x64 同错误体（178ms），Windows 通过（843ms），进一步支持平台时序归因。**只把首条正则改成两选一会放宽「records no launch」核心断言，违反本批「断言不放宽」约束，故不改**；标记 macOS 平台候选，待 macOS 定向复核/owner 裁决（R6 §6.2 item 6）。

**验证**：本机 3× EXIT=0（本机走期望路径，`spawn-fence-run{1,2,3}.log`）。

## 2. 验证汇总

| 文件 | 运行 | 3× 结果 | 退出 |
| --- | --- | --- | --- |
| run-pin.test.ts | 全文件（`--test-concurrency=1 --test-timeout=300000`） | 20/20/0 ×3 | EXIT=0（自然退出） |
| run-role-submit-capabilities.test.ts | 目标（正常 + 8.3 短名 TEMP） | 1/1 ×3 + 1/1 ×3；全文件 14/14 ×1 | EXIT=0 |
| git-role-workflows-e2e.test.ts | Q74 目标（正常 + 8.3 短名 TEMP）；全文件 1× | 1/1 ×3 + 1/1 ×3；19 tests / 7 pass / 0 fail / 12 skipped | EXIT=0 |
| chief-workflow.test.ts | W36 目标 3×；全文件 1× | 1/1 ×3；66/66/0 | EXIT=0（全文件 --test-force-exit，CI 同口径） |
| git-command.test.ts | spawn fence 目标 3×（未改） | 1/1 ×3 | EXIT=0 |
| `npm run typecheck` | `tsc --noEmit` | — | **EXIT=0** |

- 改前/改后对照：run-pin 改前定向 11 次出现 3 次失败（逐字同 CI），改后 20× 0 失败；Q74/Pipeline 在 8.3 短名 TEMP 下改前逐字复现 CI 错误体，改后 3× 绿。
- 退出方式说明：3× 定向运行与 run-pin 全文件 3× 为自然退出；其余全文件回跑使用 `--test-force-exit`（CI 同口径）。
- **零新增失败**：改动的四个文件全文件运行均无新增失败名（run-pin 20/20、run-role-submit 14/14、chief-workflow 66/66、git-role-workflows-e2e 7/7 通过 + 12 默认 skip）。
- 未修改 spawn fence 文件；其 3× 绿仅为本机基线。

## 3. 剩余 / 平台候选

| 项 | 类别 | 理由 | 后续 |
| --- | --- | --- | --- |
| Git final spawn fence | **macOS 平台候选（不改）** | FSEvents 回调延迟 ⇒ 内层 git plumbing 先 spawn；等价 fail-closed 但「records no launch」不成立；改期望即放宽 | R7 macOS 定向复核；owner 裁决是否接受平台差异 |
| W36 | x64 平台候选（已加固夹具） | CI 异常 tools 形状来源未定位；加固后不再崩溃并记录形状 | R7 x64 复核；若再红，诊断串会带异常形状样本 |
| run-pin | 已修（测试装配竞态） | 本机可复现并已消除 | R7 x64+Windows 复核 |
| Q74 / Pipeline | 已修（环境拼写 × 夹具） | 8.3 短名 TEMP 等价复现并转绿 | R7 CI 复核（Windows TEMP 短名；macOS `/private` 别名） |

## 4. 证据索引（`角色卡/测试/docs/change/2026-11-16_test-debt-misc2_evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-r6-reference-excerpts.txt` | R6 `16-platform-diff` / `10-block-codes` 中 5 名的相关行与块码 |
| `01-run-pin-ci-excerpt.txt` | R6 两平台 run-pin 最终 section 全文摘录 |
| `01-run-pin-local-race-analysis.txt` | run-pin 本机竞态仪表日志与机理 |
| `run-pin-local-flake-repro.log` / `-debug.log` | 改前本机失败复现（含调试仪表） |
| `run-pin-full-run{1,2,3}.log` | 改后全文件 3× 自然退出 |
| `run-pin-target-20x-postfix.log` | 改后目标 20× 汇总（0/20 失败） |
| `02-q74-ci-excerpt.txt` | R6 两平台 Q74 最终 section 摘录 |
| `q74-run{1,2,3}.log` / `q74-short-temp-run{1,2,3}.log` | Q74 正常 + 8.3 短名 TEMP ×3 |
| `q74-short-temp-prefix-repro.log` | 改前 8.3 短名 TEMP 逐字复现（actual 长名 vs expected `ANS-CI~1`） |
| `git-role-workflows-e2e-full.log` | 全文件 19 tests / 7 pass / 0 fail / 12 skipped，EXIT=0 |
| `03-pipeline-initial-workflow-ci-excerpt.txt` | R6 Windows 失败体 + macOS 通过行 |
| `pipeline-short-temp-prefix-repro.log` | 改前 8.3 短名 TEMP 逐字复现 CI 错误体 |
| `pipeline-run{1,2,3}.log` / `pipeline-short-temp-run{1,2,3}.log` | 改后正常 + 短名 TEMP ×3 |
| `run-role-submit-capabilities-full.log` | 全文件 14/14 |
| `04-w36-ci-excerpt.txt` | R6 x64 TypeError 栈 |
| `w36-run{1,2,3}.log` / `chief-workflow-full.log` | W36 3×；全文件 66/66 |
| `05-spawn-fence-ci-excerpt.txt` | R6 x64 spawn fence 失败体与栈 |
| `spawn-fence-run{1,2,3}.log` | 本机 3×（期望路径） |
| `spawn-fence-delay-probe.log` / `.mjs` | 0ms vs 100ms 回调延迟探针（两路 fail-closed 与进程记录形状） |
| `06-dispositions.tsv` | 5 项逐项处置（平台/错误体/定性/改法/验证） |
| `test-diff.patch` | 4 个测试文件完整 diff |
| `typecheck.log` | `tsc --noEmit` EXIT=0（最终状态） |

## 5. 边界与未做事项

- 未改产品（`app/`、`src/`）、workflow、`release.yml`、角色卡、边界、其他测试；spawn fence 文件未编辑。
- 未 commit/push、未触发 CI、未 tag、未碰 main；未读 `.env`；未占用 9222/9223/9224。
- 未在 macOS 本机复跑（无 macOS 环境）；spawn fence 的 macOS 行为依据 R6/R8 工件 + 本机延迟探针推断。
- e2e 测试自写证据目录（`2026-11-05_git-role-permissions-evidence/`，未跟踪）在复跑后位于工作树外 `%TEMP%/ans-misc2-generated-evidence-moved`；工作树状态仅含 4 个测试文件 + 本记录/证据，未入库。
