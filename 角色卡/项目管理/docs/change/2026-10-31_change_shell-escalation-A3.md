# 变更记录：shell 判拒客户升级 A3 —— i18n key 契约（中英成对）

- 日期：2026-10-31
- 角色：项目管理（`src/common/shared/` 唯一写入者）
- 状态：**`implemented-unverified`**（key 与测试已写盘、本角色自测通过；未经独立验收；不 commit）
- 任务 ID：`2026-10-31-shell-deny-customer-escalation`（节点 **A3**，T3；任务 T3）
- 依据：
  - 方案 v1.3：`docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`（857 行 / `6bd12a99…`），重点 §4.6、§7.1、§7.3、§8.3 第 6 点
  - 团队计划：`docs/scheduling/2026-10-31_team-plan_shell-deny-customer-escalation.md`（575 行 / `4d52bdf4…`）§5.2 项目管理（A3）
  - 验收标准 V1：`docs/acceptance/shell-escalation-criteria-v1.md`（1320 行 / `0b724fa2…`）P9、AC-19、AC-21、AC-24
  - B0 基线：`test/项目管理/shared/**` 154 tests / 149 pass / 0 fail / 5 skip；`npm run typecheck` exit 0
- 环境：Windows 11（win32）/ Node v24.22.1 / npm 11.19.1；HEAD `9f670fb2c7d403baf995071055d697c50714c905`

## 1. 本节点做了什么

1. `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts` **成对**新增 **25 个 key**、改写 **2 个既有 key**（名称与范围严格按方案 §7.3；未新增设计外 key）：
   - 新增：`main.operator.escalation.*` 8 个 + `main.operator.manualDenyAdvice.retryCapped` 1 个（main 分区 +9）；`ui.confirm.escalation.*` 12 个 + `ui.judge.pauseSession/pauseSessionDone/pausedBadge/resume` 4 个（ui 分区 +16）。
   - 改写：`main.operator.judgeWayOut`、`ui.judge.closeAndRetry`（方案 §4.6 明示；均保留「关闭」「替我审批」「重试」三词）。
   - 未实现 O9 聊天行，故不新增 `ui.chatRow.escalation…`（§7.3 注明「仅当实现 O9」）。
2. `test/项目管理/shared/i18n.test.ts`：分区计数显式更新为实际值；新增 `SHELL_ESCALATION_KEYS` 冻结清单（27 项 = 25 新增 + 2 改写）与契约断言（中英成对、改写保留三词、retry-capped 给出申请出路、三选项与「客户手批 ≠ judge 放行」声明、必要性不可信标注）。**未删除或弱化任何既有断言**（B0_KEYS / D_RETAINED_KEYS / parity / 零泄漏 / 旧 key 零命中全部保留）。
3. 本报告与临时证据；**未 commit / push，未启动应用**。
4. **E2 R1 增量（2026-10-31，同属 A3 写集）**：按 E2 返工 R1 请求追加 5 个 `ui.confirm.escalation.context*` key（升级卡显示脚本上下文摘要；渲染层不得硬编码中文）；详见 §11。

## 2. 新增 key 清单（A3 基线，25 个；E2 R1 增量另见 §11）

### 2.1 `main.*`（+9）

| key | zh-CN | en-US |
| --- | --- | --- |
| `main.operator.escalation.appliedOnce` | 客户已允许这一次：仅此一次，请原样重试该命令（同 cwd、同参数）；执行一次后授权失效。 | The customer allowed this once: one time only — retry the exact same command (same cwd, same arguments); the grant is consumed after that call. |
| `main.operator.escalation.appliedSession` | 客户已允许本会话执行该精确命令：同 cwd、同参数的该命令在本会话内可直接执行；会话结束或应用重启后失效。 | The customer allowed this exact command for this session: with the same cwd and arguments it may run directly for the rest of this session; the grant ends when the session ends or the app restarts. |
| `main.operator.escalation.denied` | 客户拒绝了本次申请：未获允许，命令未执行；本会话不再受理同一命令的申请。 | The customer rejected this request: no approval, the command was not executed; this session will not accept another request for the same command. |
| `main.operator.escalation.expired` | 升级申请超时或确认通道不可用，按未获客户允许处理（fail-closed），命令未执行；本会话不再受理同一命令的申请。 | The escalation request timed out or the confirmation channel was unavailable; treated as not allowed (fail-closed) and the command was not executed; this session will not accept another request for the same command. |
| `main.operator.escalation.ineligible` | 没有可申请的判拒记录：仅判断代理主动判拒（非硬拒档）或 retry-capped 的精确命令可申请客户确认。 | No applicable denial record: only an exact command that the judge actively denied (outside the hard-deny class) or one rejected with retry-capped can request customer confirmation. |
| `main.operator.escalation.pending` | 当前已有待答复的升级申请或 shell 确认卡，请稍后再申请（不排队）。 | An escalation request or shell confirmation card is already awaiting an answer; try again later (requests are not queued). |
| `main.operator.escalation.capped` | 本角色会话的升级申请次数已达上限，不再受理新的申请。 | This role session has reached the escalation request limit; no further requests will be accepted. |
| `main.operator.escalation.invalid` | 申请无效：只能对已记录判拒的精确命令（run_shell 入口，参数与判拒原文一致）发起申请。 | Invalid request: only an exact command with a recorded judge denial can be requested (run_shell entry; arguments must match the recorded denial). |
| `main.operator.manualDenyAdvice.retryCapped` | 如确属推进必需，可调用 request_shell_escalation 对这条精确命令申请客户确认（每会话一次）；或关闭「替我审批」后重试。 | If truly necessary to proceed, call request_shell_escalation to request customer confirmation for this exact command (once per session); or turn off “Approve for me” and retry. |

### 2.2 `ui.*`（+16）

| key | zh-CN | en-US |
| --- | --- | --- |
| `ui.confirm.escalation.title` | 客户确认：是否放行被 judge 判拒的 shell 命令 | Customer confirmation: allow this judge-denied shell command? |
| `ui.confirm.escalation.intro` | 自动代理未放行这条命令，角色申请由你亲自决定。决定只对这一条精确命令（同 cwd、同参数）生效，不会扩展到其它命令。 | The automatic agent did not approve this command, and the role asks you to decide personally. Your decision applies only to this exact command (same cwd, same arguments) and does not extend to any other command. |
| `ui.confirm.escalation.judgeHeader` | ── judge 判拒说明 ── | ── Judge denial details ── |
| `ui.confirm.escalation.necessityHeader` | ── 角色必要性说明 ── | ── Role's necessity statement ── |
| `ui.confirm.escalation.necessityNote` | 由角色提供，未经验证 | Provided by the role; not verified |
| `ui.confirm.escalation.allowOnce` | 允许一次 | Allow once |
| `ui.confirm.escalation.allowSession` | 本会话允许该精确命令 | Allow this exact command for this session |
| `ui.confirm.escalation.reject` | 拒绝 | Reject |
| `ui.confirm.escalation.note` | 无答复、超时或关闭窗口 = 拒绝；同一命令每会话只能申请一次。授权仅对该精确命令（同 cwd、同参数）有效，不跨角色、不跨项目，会话结束或应用重启后失效。 | No answer, timeout, or closing the window = reject; each command can be requested only once per session. A grant applies only to this exact command (same cwd, same arguments) — not across roles or projects — and ends when the session ends or the app restarts. |
| `ui.confirm.escalation.expired` | 此升级申请已失效（超时或窗口已关闭），未获允许，命令未执行；本会话不再受理同一命令的申请。 | This escalation request has expired (timeout or window closed); no approval was given and the command was not executed; this session will not accept another request for the same command. |
| `ui.confirm.escalation.customerNotJudge` | 客户手批 ≠ judge 放行：本次由你亲自决定，不改变判断代理对该命令的判拒结论，也不会由自动代理代批。 | Customer approval ≠ judge approval: this decision is yours alone; it does not overturn the judge's denial of this command and is never auto-approved by the automatic agent. |
| `ui.confirm.escalation.pauseSession` | 暂停本次运行自动审批 | Pause auto-approval for this run |
| `ui.judge.pauseSession` | 本次运行暂停自动审批 | Pause auto-approval for this run |
| `ui.judge.pauseSessionDone` | 已暂停本次运行的 shell 自动审批（不影响提案/任命/验收的替我决策）：新的 shell 请求将逐条由你确认；重启后清零并回到持久化开关值。 | Shell auto-approval is paused for this run (it does not affect “Decide for me” for proposals/appointments/acceptance): new shell requests will be confirmed by you one by one; this resets on restart to the persisted switch value. |
| `ui.judge.pausedBadge` | 本次运行已暂停自动审批（重启后清零、回到持久化开关值） | Auto-approval paused for this run (resets on restart to the persisted switch value) |
| `ui.judge.resume` | 恢复自动审批 | Resume auto-approval |

## 3. 改写 key 清单（2 个，方案 §4.6/§7.3 明示）

| key | 改前（zh） | 改后（zh） | 改后（en） |
| --- | --- | --- | --- |
| `main.operator.judgeWayOut` | 出路：如需执行，请关闭「替我审批」后重试。 | 出路：如确属推进必需，可调用 request_shell_escalation 对这条精确命令申请客户确认（每会话一次）；或关闭「替我审批」后重试。 | Way out: if truly necessary to proceed, call request_shell_escalation to request customer confirmation for this exact command (once per session); or turn off “Approve for me” and retry. |
| `ui.judge.closeAndRetry` | 可关闭「替我审批」后重试（改为手动确认），或按替代方案调整命令。 | 可让角色申请客户确认（允许一次 / 本会话允许该命令 / 拒绝），或关闭「替我审批」后重试（改为手动确认）。 | The role may request customer confirmation (allow once / allow this command for the session / reject), or turn off “Approve for me” and retry (manual confirmation). |

除上表两键外，未改任何既有 key 的文案或语义。新增 key 均无 `{param}` 占位符（消费方可直接 `translate`，无需传参）。

## 4. 计数变化

| 分区 | B0（改前） | A3（改后） | 变化 |
| --- | --- | --- | --- |
| `ui.` | 886 | **902** | +16 |
| `main.` | 550 | **559** | +9 |
| `shared.` | 62 | 62 | 0 |
| `preferences.` | 3 | 3 | 0 |
| **总计** | **1501** | **1526** | **+25** |

- +25 = 新增 key 25（ui 16 + main 9）；2 个改写 key 不改变计数。
- zh-CN 与 en-US 各 1526 key，parity 通过（en-US `satisfies Record<MessageKey, MessageTemplate>` 编译期强制齐全）。
- `i18n.test.ts` 计数断言与测试名已显式更新；A3 基线 `SHELL_ESCALATION_KEYS` 27 项（25 新增 + 2 改写）。
- **E2 R1 增量（§11）**：ui +5 → **907**；总计 **1531**；`SHELL_ESCALATION_KEYS` 扩为 32 项（30 新增 + 2 改写）。

## 5. 逐文件 before/after 哈希

| 文件 | 改前行数 | 改前 blob / sha256 | 改后行数 | 改后 blob / sha256 |
| --- | --- | --- | --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | 1906 | `4ccd94ae72cc38f89fdde80ed3680bd421dc5076` / `1e017a7fe5bb4d93cb1dfbfab9802744243c7a0ec0ef550d9bb26b32c05a1ad1` | 1951 | `2bca3a34aa528fcb12b08db0c1ef4ea3310dde06` / `4197eebff13681984653b79282044e57b8dd2a7aa58231bb5c6382004bd8016c` |
| `src/common/shared/i18n/messages/en-US.ts` | 2172 | `9daf037becea35f6ff6bbc49a6c44e7f47afa871` / `5e0e8e42f3f18edec51396578f5f963efc2202397f9ead3bcb9e21bc7ba96399` | 2217 | `3ea6cfe525380eef74781d395d34c307e58a47bd` / `7b9bf1f762a4fb581689219f40fa12b4efe1ee0eefc20f6556ca47d077592a67` |
| `test/项目管理/shared/i18n.test.ts` | 104 | `279e98e02f668836800caff7b82cc1412114f3a3` / `a7e4f4739e6b79af61154c92f5d5398a57e61b84449821e09bd0c138cd401f32` | 160 | `b2f1a46fa85dce6db9b27a029af7ac7dce222db7` / `a78933bc0e25cfb103d4da315ca36383c891ecab6f95a3e95882604ed58688de` |

写前复测与任务给出的基线逐项一致（blob/sha256）。改后逐文件 diff：zh-CN `47+/2-`、en-US `47+/2-`、i18n.test.ts `59+/3-`（`git diff --numstat`）。E2 R1 增量后的最终哈希与行数见 §11（上表为 A3 基线历史快照）。

## 6. diff/status 范围

- 本节点改动仅 3 个白名单文件：`zh-CN.ts`、`en-US.ts`、`test/项目管理/shared/i18n.test.ts`（+ 本报告）。
- 完整 `git diff -U0` 存档：`C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\A3\a3-diff-U0.patch`（188 行，sha256 `df853b1b867a616590cfd0b2185481fd18a582fe00ff885924d375f70eac635a`）。
- worktree 中可见其他节点（A1/A2 等）并发修改的 `src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/service/gate/shell-rules.ts`、`src/common/门禁引擎/**`、`test/门禁引擎/**` 等；**均非本节点改动，未触碰**。
- 未 commit / push；未启动应用。

## 7. 检查与证据（原始日志均在 `C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\A3\`）

| 检查 | 命令 | 退出码 | 结果 | 日志（行数 / sha256） |
| --- | --- | --- | --- | --- |
| 写前基线 | `node --test "test/项目管理/shared/**/*.test.ts"` | 0 | 154 tests / 149 pass / 0 fail / 5 skip（与 B0 一致） | `pre-i18n-tests.log`（165 / `bfbcb6d36248177954fe2398e67bf93d09303962ba18cde28173e4984fafabf4`） |
| A3 自测 | `node --test "test/项目管理/shared/**/*.test.ts"` | 0 | **155 tests / 150 pass / 0 fail / 5 skip** | `post-i18n-tests.log`（166 / `eeea58cfc9c140a3673609350d4fc547670da709cd294e59b0c0414e22a3d979`） |
| 类型检查 | `npm run typecheck`（`tsc --noEmit`） | 0 | 无输出错误 | `post-typecheck.log`（4 / `2d13ff10c940fd38eb2c89e44a741f3dc7767f14607b7ee80ded981a0d900435`） |
| A3 自测（E2 R1 后） | `node --test "test/项目管理/shared/**/*.test.ts"` | 0 | 155 tests / 150 pass / 0 fail / 5 skip（计数不变；契约清单已含新 key） | `post-i18n-tests-e2r1.log`（166 / `bb5a616288d726c0ccc5c78124180a6900d49bee837b02a029986d4652902ecb`） |
| 类型检查（E2 R1 后） | `npm run typecheck` | 0 | 无输出错误 | `post-typecheck-e2r1.log`（4 / `2d13ff10c940fd38eb2c89e44a741f3dc7767f14607b7ee80ded981a0d900435`） |
| 环境/状态 | node/npm/git status | 0 | v24.22.1 / 11.19.1 / HEAD `9f670fb` | `env-and-status.log`（31 / `8bda11eac65a46cb0d9cc35c306e13348e6532217bd20e79b5d953d6c8c1b26a`） |
| 消费方回归 | `node --test "test/桌面UI/judge.test.ts" "test/桌面UI/judge-row-view.test.ts"` | 0 | 13/13 pass（`关闭「替我审批」后重试` 子串兼容） | `consumer-desktop-ui-judge.log`（21 / `03038868c2d65874e221baac93a5d32f5118e03cbae40924b3112145a5e4882c`） |
| 受影响断言（非本角色写集） | `node --test "test/测试/shell-judge-verify/b-deny-flow.test.ts"` | 1 | 4 tests / 3 pass / **1 fail**（见下） | `consumer-b-deny-flow.log`（35 / `1587a500dc762411aeaf76e489b938753727301f1839477787dc0cdb67fff416`） |

**A3 自有套件失败分类**：新增确定性失败 **0**；新增 skip **0**；既有 5 个 skip 均为 `atomic-write.test.ts` 平台跳过（与 B0 相同）。较 B0 仅 **+1 test**（新增 key 契约断言）。

**受影响断言（预期、需消费方更新）**：`test/测试/shell-judge-verify/b-deny-flow.test.ts:62` 断言旧文案正则 `/出路：如需执行，请关闭「替我审批」后重试。/`，现与方案 §4.6 明示改写后的 `main.operator.judgeWayOut` 不再逐字匹配：

```
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /出路：如需执行，请关闭「替我审批」后重试。/.
actual: '…出路：如确属推进必需，可调用 request_shell_escalation 对这条精确命令申请客户确认（每会话一次）；或关闭「替我审批」后重试。'
```

该文件属 **测试角色写集**（`test/测试/`），A3 不得修改；这是方案 §4.6/AC-19 的既定措辞变更，需由测试角色在 D1 更新受影响断言（新文案仍保留「关闭」「替我审批」「重试」三词，且客户面合成消息中的「如需执行，请关闭『替我审批』后重试。」来自编排常量 `SHELL_JUDGE_EXIT_LINE`，未受 A3 影响）。

**消费接线提示（供 B1/C1）**：`app/desktop/operator-channel.ts` 的 `manualDenyAdvice()` 当前无 `retry-capped` 分支（落入 default 的 `.retry`）；按 §4.6 应由 B1/C1 在 retry-capped 拒绝路径改用新 key `main.operator.manualDenyAdvice.retryCapped`。`ui.judge.closeAndRetry` 仍由 `app/renderer/src/chat/judge.ts` 的 `retryHint` 消费，现有桌面UI 断言（子串）通过。

## 8. key 集合冻结声明（供 C1/C2 消费）

本节点完成后，以下 **32 个 key**（A3 基线 27 + E2 R1 增量 5）的名称与中英文案**冻结**，C1/C2 只按本清单消费，不得自行新增/改名或改文案；若需变更，回到项目管理（A3 属主）并重跑 `test/项目管理/shared/**` 与计数/parity 证据：

`main.operator.escalation.appliedOnce`、`.appliedSession`、`.denied`、`.expired`、`.ineligible`、`.pending`、`.capped`、`.invalid`；`main.operator.manualDenyAdvice.retryCapped`；`main.operator.judgeWayOut`（改写冻结）；`ui.judge.closeAndRetry`（改写冻结）；`ui.confirm.escalation.title`、`.intro`、`.judgeHeader`、`.necessityHeader`、`.necessityNote`、`.contextHeader`、`.contextPath`、`.contextNpmScript`、`.contextSha`、`.contextNote`、`.allowOnce`、`.allowSession`、`.reject`、`.note`、`.expired`、`.customerNotJudge`、`.pauseSession`；`ui.judge.pauseSession`、`.pauseSessionDone`、`.pausedBadge`、`.resume`。

冻结断言：`test/项目管理/shared/i18n.test.ts` 的 `SHELL_ESCALATION_KEYS`（32 项中英成对）、分区计数 907/559/62/3 = 1531、改写文案三词子串、三选项与「客户手批 ≠ judge 放行」「由角色提供，未经验证」声明。A3 基线新增 key 无占位符；E2 R1 的 `contextPath/contextNpmScript/contextSha/contextNote` 分别使用 `{path}`/`{name}`/`{sha}`/`{note}`。`ui.chatRow.escalation…`（O9）未实现、未新增。

## 9. 无越权改动声明

- 仅写：`src/common/shared/i18n/messages/zh-CN.ts`、`src/common/shared/i18n/messages/en-US.ts`、`test/项目管理/shared/i18n.test.ts`、本报告。
- 未写：`app/**`、`src/model/**`、`src/common/编排/**`、`src/common/门禁引擎/**`、`src/provider/**`、`src/service/**`、其他角色 test 目录、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、任何角色卡/边界/YAML。
- 未删除/弱化既有测试断言；未新增 skip；未 commit/push；未启动应用；未伪造输出。
- 未引入设计外 key；未改既有 key 语义（除 §4.6 明示的 `judgeWayOut` / `closeAndRetry`）。

## 10. 阻塞与偏差

- 无阻塞。偏差：无（O9 聊天行属默认不实施项，未新增对应 key，符合 §7.3/§11）。
- 交接：本 key 契约为 A3 冻结产物；B1/C1/C2 可按 §7.3 与本文消费；受影响断言（`test/测试/shell-judge-verify/b-deny-flow.test.ts:62`）需测试角色在 D1 更新并留存分类证据。

## 11. E2 R1 增量 key（2026-10-31，同属 A3 写集）

- 来源：E2 返工 R1——升级卡需显示「脚本上下文摘要」（方案 §4.3「脚本上下文摘要（路径 + sha256 + 有界内容，如有）」/§7.1 `approvalContext`），渲染层不得硬编码中文，故由 A3 追加 key。
- 范围：仅新增 5 个 `ui.confirm.escalation.context*` key（名称固定供 C2 消费）；**不新增其它 key，不改任何既有 key 的文案或语义**。状态行保持 `implemented-unverified`。

### 11.1 新增 key（中英成对，5 个）

| key | zh-CN | en-US |
| --- | --- | --- |
| `ui.confirm.escalation.contextHeader` | 脚本上下文（judge 判拒时所依据） | Script context (what the judge relied on when denying) |
| `ui.confirm.escalation.contextPath` | 脚本：{path} | Script: {path} |
| `ui.confirm.escalation.contextNpmScript` | npm 脚本：{name} | npm script: {name} |
| `ui.confirm.escalation.contextSha` | sha256：{sha} | sha256: {sha} |
| `ui.confirm.escalation.contextNote` | 说明：{note} | Note: {note} |

占位符固定为 `{path}` / `{name}` / `{sha}` / `{note}`（C2 按同名传参）；`contextHeader` 无占位符。

### 11.2 计数变化

| 分区 | 增量前（A3 基线） | 增量后 | 变化 |
| --- | --- | --- | --- |
| `ui.` | 902 | **907** | +5 |
| `main.` | 559 | 559 | 0 |
| `shared.` | 62 | 62 | 0 |
| `preferences.` | 3 | 3 | 0 |
| **总计** | **1526** | **1531** | **+5** |

- 新增 key 总数：A3 基线 25 → **30**（ui 21 + main 9）；改写仍为 2 个。
- `SHELL_ESCALATION_KEYS`：27 → **32** 项（30 新增 + 2 改写）；zh/en 各 1531 key，parity 与英文零中文泄漏通过。
- `i18n.test.ts` 计数断言与测试名更新为 `ui 907 / main 559 / shared 62 / preferences 3 = 1531`。

### 11.3 逐文件 before/after 哈希（增量前后）

| 文件 | 增量前行数 | 增量前 blob / sha256 | 增量后行数 | 增量后 blob / sha256 |
| --- | --- | --- | --- | --- |
| `src/common/shared/i18n/messages/zh-CN.ts` | 1951 | `2bca3a34aa528fcb12b08db0c1ef4ea3310dde06` / `4197eebff13681984653b79282044e57b8dd2a7aa58231bb5c6382004bd8016c` | 1957 | `b1c63a444ef094fe38e8032dfd46d040e09da0bd` / `4a944f0e3484d1455a4f9e6caec56cd5824d0e67671a46597f4e7af9dfb48db4` |
| `src/common/shared/i18n/messages/en-US.ts` | 2217 | `3ea6cfe525380eef74781d395d34c307e58a47bd` / `7b9bf1f762a4fb581689219f40fa12b4efe1ee0eefc20f6556ca47d077592a67` | 2223 | `945d47797c9a8d2948bcad749d16013e0b25e229` / `56f0706b62125945f54df0cade178318a43c68d2b42692909997f635421e66f1` |
| `test/项目管理/shared/i18n.test.ts` | 160 | `b2f1a46fa85dce6db9b27a029af7ac7dce222db7` / `a78933bc0e25cfb103d4da315ca36383c891ecab6f95a3e95882604ed58688de` | 165 | `000111762d24c5823facabea944925bdbe1c3d1a` / `89f23673a75812ae8ed534187d3ebe2da27aba522307bda443383134d5ffba41` |

增量 diff（累计）：zh-CN `53+/2-`、en-US `53+/2-`、i18n.test.ts `64+/3-`（`git diff --numstat`）。

### 11.4 检查与证据（`C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\A3\`）

| 检查 | 命令 | 退出码 | 结果 | 日志（行数 / sha256） |
| --- | --- | --- | --- | --- |
| 增量前基线 | 哈希 + 计数 | 0 | 1526（ui 902），与 A3 基线一致 | `e2r1-pre-baseline.log`（8 / `8f49db78e8a641542c4f18f6b7e055346ce92976f52f012d9af6bba2d47829bc`） |
| A3 自测 | `node --test "test/项目管理/shared/**/*.test.ts"` | 0 | **155 tests / 150 pass / 0 fail / 5 skip**（计数不变；新增 key 由既有契约断言覆盖） | `post-i18n-tests-e2r1.log`（166 / `bb5a616288d726c0ccc5c78124180a6900d49bee837b02a029986d4652902ecb`） |
| 类型检查 | `npm run typecheck` | 0 | 无输出错误 | `post-typecheck-e2r1.log`（4 / `2d13ff10c940fd38eb2c89e44a741f3dc7767f14607b7ee80ded981a0d900435`） |
| 增量后基线 | 哈希 + 计数 | 0 | 1531（ui 907；context 5；en 1531） | `e2r1-post-baseline.log`（12 / `97c818f06e50a4f3dac7fabe01b88fdf65f7dc5342a2dd998d197b49ce982637`） |

失败分类：新增确定性失败 **0**、新增 skip **0**。边界：改动仍仅上述 3 个白名单文件 + 本报告；未 commit / push；未改实现外文件。
