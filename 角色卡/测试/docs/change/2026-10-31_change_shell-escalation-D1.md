# 测试 D1 变更记录：shell 判拒客户升级——跨层集成与 T3 全量回归

- 任务 ID：`2026-10-31-shell-deny-customer-escalation`（节点 **D1**：跨层集成 + 受影响断言更新 + T3 全量回归）
- 角色：测试（独立固定上下文）
- 日期：2026-10-31
- 状态：**`implemented-unverified`**（D1 交付完成；真实 Electron E2E/截图归 D2；未经独立验收；未 commit/push；未启动真实应用）
- 依据（只读）：
  - 客户确认方案 v1.3：`docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`（857 行 / SHA-256 `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`），§4.6/§5/§6.3/§7.1/§9/§10。
  - 团队计划：`docs/scheduling/2026-10-31_team-plan_shell-deny-customer-escalation.md`（575 行 / `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203`），§4.3 D1/§6.3/§6.6。
  - 实施前验收标准 V1：`docs/acceptance/shell-escalation-criteria-v1.md`（1320 行 / `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b`），§二/§三/§六与 AC-25/AC-26/AC-27/AC-29。
  - readonly 裁定 A 澄清：`docs/planning/2026-10-31_clarification_shell-escalation-readonly.md`（124 行 / `6c568ee626b8e4fa6487562364e23927c2812f64ae8c8753cc7ad9bfb2588dd4`）。
  - 已完成节点冻结报告：A1 `36d2cd12…`、A2 `cd5e16a8…`、A3 `2385b14e…`、B1 `68334d5e…`、C1 `e970346c…`、C2 `d0a88a44…`（路径见任务单）。
- 基线：worktree `flow-improvements-wave1` HEAD `9f670fb2c7d403baf995071055d697c50714c905`；Node v24.22.1 / npm 11.19.1 / win32（MINGW64_NT-10.0-26300）。

## 1. 写集与逐文件 before / after 哈希

写集严格限定在 `test/测试/`（Section 1 目录授权）与本报告。哈希口径：`git hash-object`（blob）+ `sha256sum`（工作区字节）。

| 文件 | 写前 blob / sha256 | 写后 blob / sha256 | 行数（后） | 性质 |
| --- | --- | --- | --- | --- |
| `test/测试/shell-judge-verify/b-deny-flow.test.ts` | `4cc69f8563c93d41597090d578d73e187cd6063d` / `57b7c76f719234b3ddb82b8f05cee2848d6972d6e3857d07ac0e25f18a5e40f6` | `7d85515a87082ed9cb6406ae5cca220f67ee8b20` / `3ce3a3c8239d7e3ea2495f2f9a8840debd3af88f567e2546f5b5f012f4802a02` | 225 | 更新受影响断言（旧 `judgeWayOut` 全句 → 新文案，§4.6/AC-19） |
| `test/测试/shell-judge-verify/c-manual-flow.test.ts` | `3bdfa3925b6790424968e3613e206cff29ef7159` / `556060df2334626615e2513d4809d404d2d13c36b8e89307e26435f797f522d8` | `2fbb995eb999d9c720363a6fd01d6ca6bdb35a15` / `973beaedc3d2a6db605c28d6eb9c6ceff7f93e9210b89cbaebd31519b839c469` | 497 | 更新受影响断言（retry-capped 出路改「可申请客户确认 + 关闭开关兜底」） |
| `test/测试/shell-escalation-integration.test.ts`（**新增**） | 不存在 | `5caec9e34319843d5cd305b689fdc007e0c78612` / `3c439c9e6d7c2ffda8a74442613bce63ad51c31f1a4a0c85e71a1d1252c96e9e` | 1092 | 跨层集成（AC-26；14 项测试） |

- 写前工作树 `test/测试/` 无已跟踪改动、无未跟踪文件（`00-pre-status-test-test.txt` 为空）；写前哈希见证据 `00-pre-hashes.txt`。
- 写后 `test/测试/` 仅 2 个 `M` + 1 个 `??`（见 `12-post-hashes-and-scope.txt`）；`git diff --cached --name-only` 为空（未暂存）。

## 2. 新增跨层集成测试：`test/测试/shell-escalation-integration.test.ts`

设计口径：真实 `openRoleSession` / `assembleProjectShellGate` / `assembleOperatorShellGate` / `assembleReadonlyShellGate` / `buildShellGate` / `buildGovernedTools` + 真实门禁引擎分类器（经 `src/service/gate/shell-rules.ts` Service 公开出口）与真实 shell 写目标守卫；只注入受控替身（升级卡 presenter、操作者/判断通道、内存审计 sink、临时项目）。**不启动真实 Electron、不触真实模型/网络**。

| # | 测试名（节选） | 覆盖 | 关键断言 |
| --- | --- | --- | --- |
| A | 真实工具注册 + 判拒→申请→allow-once→原样重试执行→二次回正常链 | AC-01/03/05/07/10/22/26 | `request_shell_escalation` 只在 `shellGate`+`shellEscalation` 双注入时注册；卡内容取自判拒记录（命令原文/cwd/necessity/judge 理由/脚本上下文）；`allow-once` 原样重试经闸放行并真实执行（`run_shell 已执行`、输出 `granted`）；第二次回判断通道（调用计数 2）；审计 `customerGrant{requestId,scope,operatorId}`、branch `customer-escalation:allow-once`、by `customer:<id>（grant:<id>）`、无 `judge`；`escalation-decision` 记录齐全（branch/conclusion/execution/conditions/escalation/toolCallId 空串） |
| A2 | allow-session 原样重试可反复执行；dispose 后授权失效 | AC-05/07 | 两次重试均放行、判断通道 0 增；两条 `customerGrant.scope="session"`；dispose 后同闭包闸不再放行（fail-closed） |
| B | 客户拒绝 / 超时（expired）默认拒绝 | AC-05/06/08/26 | 回执如实「未获客户允许」；不可再申请（不弹第二张卡）；原样重试回正常链（判断通道第二次调用） |
| C | 会话总上限 5、待答 1 张、旧记录清理 | AC-08 | 前 5 次真实呈现、第 6 次 `上限（5 次）` 且不出卡；待答期间新申请 `/待答复/` 且不排队；pending 拒绝不消耗该命令申请权；判拒后同 key 变 allow ⇒ 申请 `未找到可申请的判拒记录` |
| D | `entry=run_shell` 与后台入口负例 | AC-01/02 | 后台判拒不写入台账（申请 ineligible）、不清除 run_shell recorded、不消费 run_shell 一次性授权（前台重试仍放行）；审计 `entry` 区分 `run_shell` / `start_background_task` |
| E | 脚本上下文 sha256 stale | AC-07 | 判拒记录上下文出现在卡上；内容变化 ⇒ 闸 `customer-escalation:stale-context` 拒绝、授权作废、不可再申请、恢复旧内容也不复活；stale 判定不调用判断通道 |
| F | 只读档裁定 A | AC-02/12/13 | 真实只读装配下 `npm test`/`npm ci`/`npm run lint`/`node --test`/`tsc --noEmit` ⇒ `readonly-deny`（reason 档位按 A2 之前，review/risky），`ls -la` 仍 c-allow；0 operator/0 卡 |
| F2 | readonly 构造期禁止 takeGrant；只读拒绝不消费授权 | AC-02 | `createShellGate({readonlyOnly:true,takeGrant})` 抛错；真实只读闸拒绝 routine 命令后，正常闸仍能消费既有 run_shell 一次性授权 |
| G | 白名单 judge 调用计数=0（项目角色/内置审批档） | AC-12/13/14 | 8 形态（`npm test`、`npm run test\|typecheck\|lint\|check`、裸/带路径 `node --test`、`tsc --noEmit`、`npm ci`）在 `assembleProjectShellGate`（advisory 项目角色）与 `assembleOperatorShellGate`（内置审批档）均 c-allow、判断通道 0 调用、审计无 judge/customerGrant；`npm install lodash` 仍 `script:review→a-deny`（判断通道 1 次） |
| H | 审计四类可区分 | AC-22/33 | judge 放行（含 `judge`，by `→ operator:judge:<engine>`）；客户手批（无 judge/customerGrant、`→a-allow`、by `operator:`）；客户升级授权（customerGrant、`customer-escalation:*`、`customer:`）；`escalation-decision`（event/branch/by/字段）；deny 档放行保留 `tier:"deny"`+`hardDenyOverride:true` |
| I | c=allow 不消费 / c=deny 不消费不放行 | AC-07 | once 授权存在时：c-allow 不消费；c-deny 终结且不调用判断通道、不消费；随后 review 命中才消费并放行；消费后回正常链 |
| J | 暂停语义 | AC-20 | `createShellSessionPauseState`：暂停/恢复、非法输入（null/数字/数组/缺字段/字符串 paused/额外字段）不改状态；`shellJudgeSwitch && !paused` vs 治理 approval 组只看全局开关；`app/main.ts` 两处表达式与模块级单例按源码事实钉住 |

原始输出：`02-integration-first-run.log`（首轮 12/14，暴露两处断言口径问题后修正）→ `03-integration-second-run.log`（**14 tests / 14 pass / 0 fail / 0 skip / 0 todo，exit 0**）。全量回归中该文件同样通过（`09-full-suite.log`）。

## 3. 受影响断言更新（逐条理由，不弱化）

扫描范围：`test/测试/**`（含 `shell-judge-verify/`、`lightweight-permission-repairs`、`su-shell-approval-verify`、`t9-block3` 等所有使用 shell 闸/判断通道的套件）。仅发现 2 处因本变更失败；无其它失效断言（全量回归验证）。

1. `test/测试/shell-judge-verify/b-deny-flow.test.ts:62`
   - 旧：`assert.match(result.reason, /出路：如需执行，请关闭「替我审批」后重试。/);`
   - 新：逐字断言 `/出路：如确属推进必需，可调用 request_shell_escalation 对这条精确命令申请客户确认（每会话一次）；或关闭「替我审批」后重试。/`
   - 理由：方案 §4.6/AC-19 明示改写 `main.operator.judgeWayOut`（A3 冻结）；A3 在交付时已登记该断言需测试角色在 D1 更新。**新断言为完整新文案（比旧句更长更具体），保留「关闭」「替我审批」「重试」三词的兜底语义**；未正则放宽、未删除断言。该文件其余断言（`EXIT_LINE`、结果行、审计、投达失败）未改。
2. `test/测试/shell-judge-verify/c-manual-flow.test.ts:290`
   - 旧：retry-capped 期望理由 `…已拒绝；请重试，如持续失败请关闭「替我审批」后手动确认。`
   - 新：`…已拒绝；如确属推进必需，可调用 request_shell_escalation 对这条精确命令申请客户确认（每会话一次）；或关闭「替我审批」后重试。`
   - 理由：方案 §4.6 要求 retry-capped 的 `manualDenyAdvice.retryCapped` 给出同一新出路（A3 冻结 key，C1 接入 `operator-channel`）；断言仍为**逐字全文**并同时校验审计 `judge` 事实（`assertManualDenied` 未改）。未放宽比较、未新增 skip/todo。

变更 diff 见 `11-test-diff-U0.patch`（仅 2 文件、+9/−2 行，无其他断言改动）。

## 4. 定向与 T3 全量回归

### 4.1 定向（先跑）

| 套件 | 命令 | 写前 | 写后 |
| --- | --- | --- | --- |
| `test/测试/shell-judge-verify/*.test.ts` | `node --test --test-concurrency=1 "test/测试/shell-judge-verify/*.test.ts"` | 38 tests / 36 pass / **2 fail**（即上述两处旧文案断言，`01-pre-shell-judge-verify.log`） | **38 / 38 / 0 fail / 0 skip / 0 todo，exit 0**（`04-post-shell-judge-verify.log`） |
| 新集成 | `node --test --test-concurrency=1 "test/测试/shell-escalation-integration.test.ts"` | — | **14 / 14 / 0 fail / 0 skip / 0 todo，exit 0**（`03-integration-second-run.log`） |

### 4.2 T3 全量（排除历史 `test/pi-adapter/write-sequencing.test.ts`，理由按团队计划 §6.3 / V1 AC-27：历史串行写测试）

- 命令：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`
- 结果：**exit 1；tests 3337 / pass 3310 / fail 9 / skipped 18 / todo 0；duration 246270.587 ms**（`09-full-suite.log`，4431 行 / `0daae674…`；exit `09-full-suite.exit.txt`）。
- B0 基线：**3193 / 3166 / 9 / 18**（`…\ans-shell-escalation-evidence\b0\full-suite.log`）。
- 对照：tests **+144**、pass **+144**、fail **9 = 9**、skip **18 = 18**、todo 0 = 0。**新增确定性失败 = 0；新增 skip = 0；新增 todo = 0。**
- 失败分类（`10-failure-classification.txt`）：9 个失败与 B0 **逐名完全相同**，且原始错误均为 `EPERM: operation not permitted, symlink`（Windows 无符号链接权限）：
  1. `test/claude-adapter/session.test.ts:639` native symlink…
  2. `test/codex-adapter/session.test.ts:351` native directory symlink…
  3. `test/pi-adapter/injected-runtime.test.ts:185` store validate callback…
  4. `test/pi-adapter/injected-runtime.test.ts:193` Pi storage refuses file symlink…
  5. `test/runtime-core/file-write-safety.test.ts:97` D3 linked workspace root…
  6. `test/runtime-core/session-store.test.ts:46` store: traversal…
  7. `test/runtime-core/session-store.test.ts:58` store: native validation…
  8. `test/测试/g4-skill-verify/b-render-double-check.test.ts:182` 读取器入参防御（对抗）…（fixture `fs.symlinkSync` EPERM）
  9. `test/编排/shell-authorized-routine.test.ts:184` node test外指符号链接路径不获委托…（B1 已确认为既有基线 EPERM）
- **其他角色测试的合法受影响断言失败：无**（除上述 9 个既有 EPERM 基线外全部通过）；D1 未跨目录修改任何其他角色测试。
- 新增 144 个测试来自 A1/A2/A3/B1/C1/C2 的既有权衡测试与本节点 14 项集成；全部通过。

## 5. typecheck / 构建

| 命令 | 退出码 | 结果 | 证据 |
| --- | --- | --- | --- |
| `npm run typecheck`（`tsc --noEmit`，含 `test/**`） | 0 | 无输出 | `05-typecheck.log`（4 行 / `2d13ff10…`） |
| `npm run typecheck:renderer` | 0 | 无输出 | `06-typecheck-renderer.log`（4 行 / `dddee1c8…`） |
| `npm run build:renderer` | 0 | `✓ built in 325ms`；chunk 体积/`INEFFECTIVE_DYNAMIC_IMPORT` 为 B0/C2 亦有的既有提示 | `07-build-renderer.log`（22 行 / `d13848af…`） |

## 6. 证据目录

`C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\D1\`（仓库外；每命令一文件）。清单与逐文件行数/SHA-256 见 `manifest.txt`（24 行 / SHA-256 `35f466d9619b16e95202e1700c25384fb1be40ca1218294400727458230d9bf7`）。关键文件：`00-pre-environment.txt`、`00-pre-hashes.txt`、`01-pre-shell-judge-verify.log`、`03-integration-second-run.log`、`04-post-shell-judge-verify.log`、`05/06/07` typecheck/build、`09-full-suite.log`（4431 行 / `0daae674…`）、`10-failure-classification.txt`、`11-test-diff-U0.patch`、`12-post-hashes-and-scope.txt`。

## 7. 未解决项 / 偏差 / 阻塞

1. **无阻塞项**；未发现需要改设计、扩写集或回报统筹的问题。
2. **真实 Electron E2E 与截图（P1/P7/P8 客户可见面）不在 D1 范围**：归 D2（团队计划 §5.1）。本节点按纪律**未启动任何真实应用**；D1 结论仅覆盖跨层集成 + 单测/回归/类型/构建。
3. **环境性基线失败**：9 个 Windows symlink EPERM 为 B0 既有失败，非本变更引入；未掩盖任何新增失败。
4. 本节点未 commit/push/合并/发布，未使用 stash，未启动应用。

## 8. 无越权改动声明

- 仅写：`test/测试/shell-judge-verify/b-deny-flow.test.ts`、`test/测试/shell-judge-verify/c-manual-flow.test.ts`、新增 `test/测试/shell-escalation-integration.test.ts`、本报告。
- 未写产品源码（`src/**`、`app/**`、`app/renderer/**`）、其他角色测试目录（`test/门禁引擎|编排|runtime-core|桌面应用|桌面UI|项目管理/**`）、`docs/scheduling|acceptance|communication|planning`、角色卡/边界/YAML、`package.json`/锁文件/构建与发布配方；未修改既有断言以保绿（仅 §3 两处按方案要求的逐字更新）；未新增 skip/todo；未伪造输出。
- 写集外改动：**无**。（共享 worktree 中其他路径的未提交改动均为此前节点 A1/A2/A3/B1/C1/C2/H1 的既有产物，非本节点写入。）

## 9. E2 R2 / AC-19 增量（D1b，2026-10-31）

### 9.1 依据与落盘核对（只读）

E2 返工（R2）修复已在工作树落盘，D1b 在其上复测（本节点未改产品代码）：

- A1 契约加法：`src/model/runtime.ts` 的 `ShellEscalationDecision` 增第三支 `{ action: "pending"; reason?: string }`（呈现端在已有待答 shell 卡时返回）。
- B1 registry：`src/common/编排/shell-escalation.ts` 对 presenter 返回 `pending` **回滚呈现前的消耗**（`requestedKeys`/`requestCount` 归还、record 回 `recorded`、清除 `requestId`），**不写** `escalation-decision` 审计，回执稳定句「当前有 pending shell 确认卡，请稍后再申请（本次未弹卡）；未执行任何命令。」；`normalizeDecision` 保留 `pending`（未知动作仍 `expired`）。
- C1 presenter：`app/desktop/shell-escalation.ts` 在共享槽不可呈现时返回 `{ action: "pending", reason: main.operator.escalation.pending }`（不排队）。
- C2/渲染：判拒结果行 `retryHint` 消费 A3 `ui.judge.closeAndRetry`（「可让角色申请客户确认（允许一次 / 本会话允许该命令 / 拒绝），或关闭「替我审批」后重试（改为手动确认）。」），升级卡渲染 `approvalContext`；`test/桌面UI/judge.test.ts`/`judge-row-view.test.ts` 已由桌面UI角色补新措辞断言（本节点只读，未改）。

### 9.2 D1b 测试改动（仅 `test/测试/`）

| 文件 | D1b 前（=D1 完成后）blob / sha256 | D1b 后 blob / sha256 | 行数（后） | 变更 |
| --- | --- | --- | --- | --- |
| `test/测试/shell-escalation-integration.test.ts` | `5caec9e34319843d5cd305b689fdc007e0c78612` / `3c439c9e6d7c2ffda8a74442613bce63ad51c31f1a4a0c85e71a1d1252c96e9e` | `2b22bf9e716e25f75588f09857db2a784a15dca1` / `b9f90aba5f6f05257b37c10edfd01c0834101e5d6f5e997e1f3ad0f5d83d8a15` | 1176 | ① C2 既有断言同步：呈现前/呈现端 pending 的稳定回执由「待答复」改为新冻结句「当前有 pending shell 确认卡…」（断言 `/pending shell 确认卡/` + `/请稍后再申请/`，不放宽）；② 新增 K：presenter `pending` 路径；③ 新增 L：AC-19 行视图新措辞。 |
| `test/测试/shell-judge-verify/b-deny-flow.test.ts` | 未改（`7d85515a…` / `3ce3a3c8…`） | 同左 | 225 | D1 已含新 `judgeWayOut` 逐字断言（含新措辞 + 兜底），本轮无再改 |
| `test/测试/shell-judge-verify/c-manual-flow.test.ts` | 未改（`2fbb995e…` / `973beaed…`） | 同左 | 497 | D1 已含 retry-capped 新出路逐字断言，本轮无再改 |

新增用例（真实 registry + 真实闸 + 真实工具/纯视图；presenter 替身）：

- **K（AC-09，E2 R2）**：judge 判拒 → presenter 第一次返回 `{action:"pending"}`（模拟审批卡待答）→ 回执 `state=pending`、message 含「pending shell 确认卡」「请稍后再申请」、**不含**「未获客户允许」；**无 `escalation-decision` 审计**；原样重试回正常链（判断通道第二次调用）且**无授权**（0 条 customerGrant）。把会话上限压为 1：第二次申请仍成功呈现并 `allow-once`（证明每命令申请权与会话额度均回滚、record 保持 `recorded`）；随后原样重试由客户授权放行，真正的客户决定写 1 条 `escalation-decision`。**pending 不被当作 expired/unavailable/deny，不放行、不创建授权**。
- **L（AC-19，E2 R2）**：`shellJudgeResultView`（纯视图，`app/renderer/src/chat/judge.ts`）对 deny 行同时断言新措辞「可让角色申请客户确认」+ 三选项说明 + 兜底「关闭「替我审批」后重试」；与 `translate(DEFAULT_LOCALE, "ui.judge.closeAndRetry")` 同值；allow 行 `retryHint` 仍为空。旧子串语义保留（未删除旧断言；`shell-judge-verify` 的 `EXIT_LINE` 与行视图旧子串断言照旧通过）。

扫描结论：`test/**` 其余受 E2 修复影响的断言均在其他角色写集（`test/桌面UI/**`、可能 `test/桌面应用/**`），由原所有者更新；`test/测试/**` 内除上述 C2 回执同步外无其他失效断言（全量回归验证）。D1b 未跨目录修改任何其他角色测试。

### 9.3 D1b 定向复跑

| 套件 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| 新集成 | `node --test --test-concurrency=1 "test/测试/shell-escalation-integration.test.ts"` | **16 / 16 pass / 0 fail / 0 skip / 0 todo，exit 0**（含 K/L） | `21-d1b-integration.log` / `.exit` |
| `shell-judge-verify` | `node --test --test-concurrency=1 "test/测试/shell-judge-verify/*.test.ts"` | **38 / 38 pass / 0 fail / 0 skip / 0 todo，exit 0** | `22-d1b-shell-judge-verify.log` / `.exit` |

### 9.4 D1b T3 全量回归

- 命令同 D1：`node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')`。
- 结果：**exit 1；tests 3345 / pass 3318 / fail 9 / skipped 18 / todo 0；duration 247802.328 ms**（`26-d1b-full-suite.log`）。
- 对照：

  | 基线 | tests | pass | fail | skip | todo |
  | --- | --- | --- | --- | --- | --- |
  | B0（本轮任务基线） | 3193 | 3166 | 9 | 18 | 0 |
  | D1（上轮） | 3337 | 3310 | 9 | 18 | 0 |
  | **D1b** | **3345** | **3318** | **9** | **18** | **0** |

  D1b 相对 D1：tests **+8**、pass **+8**、fail 9=9、skip 18=18、todo 0=0。**新增确定性失败 = 0；新增 skip = 0；新增 todo = 0。**
- 失败分类：9 个失败与 B0 **逐名完全相同**（`diff` 为空），原始错误均为 Windows symlink `EPERM`（全量日志 `code: 'EPERM'` 恰 9 处，无其它错误类型）；无其他角色测试的合法受影响断言失败。
- 全量日志中 K/L 均通过（`26-d1b-full-suite.log` 第 2099–2100 行）。

### 9.5 D1b typecheck / 构建（均 exit 0）

`npm run typecheck`（`23-d1b-typecheck.log`）、`npm run typecheck:renderer`（`24-d1b-typecheck-renderer.log`）、`npm run build:renderer`（`25-d1b-build-renderer.log`，`✓ built in 327ms`）全部退出码 0。

### 9.6 D1b 证据

`…\ans-shell-escalation-evidence\D1\` 新增：`20-d1b-pre-hashes.txt`、`21-d1b-integration.log/.exit`、`22-d1b-shell-judge-verify.log/.exit`、`23/24/25-d1b-*`、`26-d1b-full-suite.log/.exit`（全量日志 4439 行 / `53406e44…`）、`26-d1b-failure-classification.txt`、`26-b0-fail-names.txt`、`26-d1b-fail-names.txt`（两者 diff 为空）、`27-d1b-post-hashes.txt`、`manifest-d1b.txt`（17 项逐文件行数/SHA-256，SHA-256 `798b807a84cf0d437924c06a5b76b05419982027556cb0afe5286223f56372cc`）。

### 9.7 D1b 纪律声明

未 commit/push/合并/发布；未启动真实应用；未改产品代码或其他角色测试/写集外路径；未删除/弱化旧断言（仅按 E2 冻结文案同步 1 处回执子串并新增断言）；未新增 skip/todo；未伪造输出。状态保持 `implemented-unverified`（真实 Electron E2E/截图仍归 D2/验收）。
