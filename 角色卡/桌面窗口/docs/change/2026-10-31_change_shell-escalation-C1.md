# shell 判拒后的客户确认通道 —— 桌面接线（C1）变更记录

- 日期：2026-10-31｜任务：`2026-10-31-shell-deny-customer-escalation`（T3）｜节点：**C1 桌面接线**
- 状态：`implemented-unverified`（实现完成、本地检查通过；**未启动应用**、未做真实 Electron 验收；真实 E2E 归 D2）
- 依据（只读）：客户确认方案 v1.3（857 行 / SHA-256 `6bd12a99af9cbf4bd131b0ee2353e66882c2376952c00e71bb01aabc322a23de`）；团队计划（575 行 / `4d52bdf4309b23c14065cd6893301cd43971a25726bacdd7338e1c987fc40203`）；实施前标准 V1（1320 行 / `0b724fa2ba34b740c8741e1d2799391fa4248284bb373cbbad8e189eaab4d26b`）；编排 B1 冻结报告（`角色卡/编排/docs/change/2026-10-31_change_shell-escalation-B1.md`，145 行 / `fdbb8c7d…`）；运行时核心 A1 冻结报告（`角色卡/运行时核心/docs/change/2026-10-31_change_shell-escalation-A1.md`）。
- 基线：worktree `flow-improvements-wave1` HEAD `9f670fb2c7d403baf995071055d697c50714c905`；Node v24.22.1 / npm 11.19.1 / win32 x64 / Git Bash（MINGW64_NT-10.0-26300）。
- 纪律：未 commit / 未 push / 未启动应用；未改 `app/renderer/**`、`src/**`、`test/桌面UI/**`、`test/测试/**`、`test/编排/**`、`test/门禁引擎/**`、`test/runtime-core/**`、`test/项目管理/**`、`docs/scheduling|acceptance|communication`、角色卡/边界/YAML；写集外改动 = 无。

## 一、写集与逐文件写前/写后哈希

哈希口径：`git hash-object`（blob，工作区字节）+ `sha256sum`（原始字节）。写前清单见证据 `00-pre-hashes.tsv`（8 个既有文件；两个新增文件写前不存在）。写后见 `06-post-hashes.tsv`。注意：本 worktree 的既有工作区文件为 CRLF（`core.autocrlf=true`），HEAD blob 为 LF；`confirm-card.ts` 本次以 LF 重写（内容 diff 正常，非整文件换行重写），哈希按工作区原始字节记录。

| 文件 | 写前 blob / sha256 | 写后 blob / sha256 | 行数（后） | 说明 |
| --- | --- | --- | --- | --- |
| `app/desktop/shell-escalation.ts`（**新增**） | —（不存在） | `0ced2ad8d748c7d56e1ef659bcd52beb7792577b` / `d0d0fa12284ff8060da7faa8e141659b94fa0961eecb8b4c45acf0e704e5ed8c`（R2 后最终值；R1 初值见 §九） | 265 | 升级卡呈现端 + IPC 数据面 + 回包路由判定 |
| `app/desktop/confirm-card.ts` | `616da48e2b7010c06127ce892db8d5af8115b198` / `3c09fc95db93fd7fd12785ae58cb2c649286a139f84fc9a793c7ea3a66e17d0b` | `727eee4b691a73abb77245a059aa43190acf44c4` / `caff37db102e67f89986dd100cc38cd7698f93d2f247f16f7f572e61792ab7ab` | 388 | 布尔 `mount/respond` 不变；新增动作投影 `mountAction/respondAction` + 共享呈现槽 |
| `app/desktop/operator-channel.ts` | `799ce4032aecaa499f6c0113c1f55b2db5d09cd7` / `9a40a0d0da42ffa297fcaf01e996a0db0a6051c0f4cf0b600aae9df9abb3d3c2` | `b6d461d12db8a5cb796fb18c782341a854580bd2` / `67cd7be6ba1f3bbb6db21223595ddbfa427f5714eca9471ed8adee3086b1b948` | 1116 | 审批卡共享槽等待；retry-capped 出路；`kind:"approval"`；`renderArgvLines`/`readConfirmTimeoutMs` 导出 |
| `app/desktop/session.ts` | `7a100b2d75db129b8b6f93627001744b43b5d9c5` / `9e59798619625280e8cc836d3fa735611ad39286a7dbbfa5c60a5b2225e333f7` | `b3bfdee7019ce9bf64ab148905f417d8f7d7a233` / `9dace0fb3c494ca9168113dd788bc5874a93918880e5cc01294f8467bd2bb2a0` | 7785 | 升级 presenter 每会话包装（life/turn 中止）→ `openRoleSession` |
| `app/desktop/interface.ts` | `3a2b35238d65d942c490820b4d7bc1a55277540e` / `6f14eadb1589a51431c47fd9f874e648dded08bb001afbb014d1b5657ad6855c` | `c5a454110d73156394723e56ec325b988d3301a8` / `285656a234eeb8209b06d93c12da1409d4db47f690750da4e244538c793bdc7f` | 2592 | `ShellJudgeStateReply.paused`；暂停状态机 `createShellSessionPauseState`；deps 透传 |
| `app/main.ts` | `162fc262ce52c02b95e2cae256b54462bd8192f7` / `620112a9a814fee5769e03d9d86d8fbc04b87a7a5df6571babed4701249ec0bd` | `d4ae60aad9a28dde993215ba4337024a961ad009` / `475a228cef3772a099318bd4a0e5843f494983e2b0fc551da3aed80f27e57b27` | 1122 | 模块级 `shellSessionPaused`；升级卡 IPC/槽；`shell:judge-pause`；状态推送 `paused` |
| `app/preload.cjs` | `ff5b45e3f90c44993737a0f41f451e2b5843e9c7` / `5b45f18803ac92474935e88c00e61c1a829e66c57146e3e8d1075952b4969b49` | `c40bb39e35c6e7e1539002976fb0306e136cf490` / `636c930aba095dc9345d70dcf0e719f36612e97818000951f935171e5da3d30d` | 415 | 新增 `shellEscalationRespond` / `setShellJudgePaused`（白名单，无 Node 能力） |
| `app/desktop/recovery-channel.ts` | `f520482d4eac907acefd23e361d96110ca7962f6` / `2fcee235fa136431545c1728ac2139c19eed12f581937dd46c68916322af1365` | **同左（未改）** | 115 | 共享核心签名未变 ⇒ 不改（见 §四） |
| `test/桌面应用/operator-channel.test.ts` | `186e20f32c4a5e5f71b4d5ec584444f740733e7a` / `f8f7e9ccb9e33dc44fc9bc075bb9fb57834306fc7d4f9edae33847068dc0939c` | `6f9f4aa4af44c591805d33a65dd41dd82ee40dc6` / `639cf8f4dbaab30e4cec12c2909d9632cc53350b00e5d74e43a860d303d0b7cd` | 1948 | 新增 retry-capped 回归；2 处按影响同步（逐条见 §六） |
| `test/桌面应用/shell-escalation.test.ts`（**新增**） | —（不存在） | `3955f8029c80371840b12ec9413ffef514e85a62` / `c5006e7e9c82667da0ab99ab2a12663497138fbce0be265c8a2a4aec28f78609`（R2 后最终值；R1 初值见 §九） | 489 | 22 项：卡内容/三选项/超时/失败/replay/仲裁四组（含 pending）/暂停 IPC/开关关闭 |

写集外改动：**无**（详见证据 `07-git-scope.txt`；`git diff --cached --name-only` 为空）。工作树中其它已修改/未跟踪文件（`src/**`、`test/编排/**`、`test/门禁引擎/**`、`test/runtime-core/**`、`src/common/shared/i18n/**`、`test/项目管理/**`、角色卡/边界等）均为 A1/A2/A3/B0/B1/H1 在 C1 之前已存在的改动，本节点只读消费、未触碰。

## 二、实现要点（方案 §4.3/§4.6/§6.1/§6.4/§6.5(a)(e)/§7.1/§7.2/§9）

### 2.1 `app/desktop/shell-escalation.ts`（新增）

- **升级卡呈现端**（`createShellEscalationPresenter`）：复用 `confirm-card.ts` 的 pending/replay/expire 与 `shell:confirm-request` 通道；把 registry 的 `ShellEscalationCardRequest` 映射为 IPC 卡（`buildShellEscalationIpcCard`）：命令**逐字取自判拒记录**、`argv` 规范化 + `argvLines`（与审批卡同一 JSON 转义口径）、`cwd`、judge 理由/给客户的话/替代方案、`necessity`（原样 + 应用生成的 `necessityNote`「由角色提供，未经验证」）、`approvalContext`、`expiresAt`、固定三选项 `actions`、`customerNotJudgeNote`（「客户手批 ≠ judge 放行」声明）。**卡片不生成任何以 necessity 为来源的标题/选项**。
- **回包 → 决定**：客户回包 `{kind:"escalation", id, action}`；恰 `allow-once`/`allow-session`/`deny` 才合法；决定为 `{action, operatorId}`（`operatorId` 由应用注入，渲染侧不能自报）。未知/过期 id、重复回包、非法动作 ⇒ `expired`（默认拒绝）；超时（`cleanupAfterMs` = 确认超时链 + 5000）⇒ `expired`；推达失败/窗口关闭 ⇒ `unavailable`/`expired`。**不调用 judge、不读「替我决策」**。
- **排他检查**（E2 R2 起）：呈现前 `core.canPresent()`（共享槽）——有审批卡待答或已有升级卡 ⇒ 返回 **`{action:"pending", reason: mainT("main.operator.escalation.pending")}`**（不弹卡、不排队；**不是默认拒绝**——registry 据此不消耗申请权/额度、保持 recorded、可稍后再申请）。
- `isShellEscalationResponse`（回包路由纯函数，main.ts 共用）：`kind:"escalation"` 或无 `kind` 且有 `action` 字段 ⇒ 升级；旧 `{id, allow}` ⇒ 审批（逐字兼容）。

### 2.2 `app/desktop/confirm-card.ts`

- **既有布尔 `mount`/`respond` 签名与语义逐字保留**（恢复卡与既有审批卡零回归；两种模式按 pending 条目 `mode` 严格路由，互不结算）。
- 新增**动作投影** `mountAction`/`respondAction`（升级卡）：失效/非法回包按消费方给出的 fallback（`expired`）结算；`respond` 绝不结算动作卡、`respondAction` 绝不结算布尔卡。
- 新增**共享呈现槽** `createConfirmCardSlot()` + 核级 `canPresent()`/`waitForSlot(signal, timeoutMs)`（方案 §7.2 仲裁 API）：审批卡只被升级卡阻塞；升级卡要求槽完全空闲；等待上限/中止 ⇒ `false`（调用方 fail-closed）；`enter/leave` 在 present 前/结算时配对，恢复卡不配置槽 ⇒ 不参与、等待语义不变。

### 2.3 `app/desktop/operator-channel.ts`

- **审批卡等待**：`OperatorPresenter.waitForSlot?` 可选方法；`presentConfirmed` 在**真正推达前**等待共享槽——**等待期间不启动确认超时**（超时从实际推达开始计时）；等待上限/中止 ⇒ `unavailable`（fail-closed）；未配置 `waitForSlot` 的既有 presenter ⇒ 不等待、行为逐字不变。**开关关闭路径的命令显示/超时/拒绝/不可用文案逐字不变**。
- **retry-capped 出路**：`manualDenyAdvice("retry-capped")` → `main.operator.manualDenyAdvice.retryCapped`（可申请客户确认 + 关闭开关兜底）；manual 仍按拒绝、不弹卡、无结果行。
- **回执措辞分工（AC-19）**：角色可见的 judge deny 回执经 `formatJudgeDenyReason` 使用 A3 冻结的 `main.operator.judgeWayOut`（新出路 + 关闭开关兜底，C1 未改写文案）；客户可见的判拒结果行 `retryHint` 由渲染侧 `app/renderer/src/chat/judge.ts` 消费 A3 的 `ui.judge.closeAndRetry`（保留「关闭『替我审批』后重试」子串，供 `containsExitLine` 兼容）——渲染属 C2 范围，C1 未改 `app/renderer/**`。
- **审计事实**：`modelVerdict`/`manualAsDeny` 已并入共享 `ShellJudgeAudit`（A1）；本地 `ShellJudgeAuditWithManual` 改为**兼容别名**（`test/测试/` 等既有导入仍可用），判拒审计原样带出 `verdict:"deny"` + `modelVerdict` + `reasonCode` + `manualAsDeny:true`。
- 审批卡数据面增 `kind:"approval"`（加法，旧渲染忽略）；导出 `renderArgvLines`（单一 argv 呈现实现）与 `readConfirmTimeoutMs`（升级卡复用同一超时链）。

### 2.4 `app/desktop/session.ts`

- `SessionManagerDeps.shellEscalationPresenter?: ShellEscalationPresentFn`（应用级 presenter）；`openInternal` 生成**每会话包装**：`AbortSignal.any([lifetime.signal, 当前轮 turn.signal, registry signal])` 后透传——**会话终止/重建/dispose（lifetime）与轮次中止（turn）时挂起升级卡即时失效（expired，默认拒绝）**。
- 仅当 deps 提供 presenter 时向 `openRoleSession` 传 `shellEscalationPresenter`；缺省 ⇒ 不传 ⇒ 编排不创建 registry、`request_shell_escalation` 不注册。未改变既有会话/投递语义。

### 2.5 `app/desktop/interface.ts`

- `ShellJudgeStateReply` 增可选 `paused?: boolean`（shell-only 临时覆盖语义注释）。
- 新增 `ShellJudgePauseReply`、`ShellSessionPauseState`、`createShellSessionPauseState()`：只接受 `{paused:boolean}`（无额外字段），**非法输入不改状态**，错误文案复用 `main.interface.toggle*`；`reset()` 供测试/显式重置。
- `DesktopDeps.shellEscalationPresenter?` + `openRoleSessionFn` 入参类型 + `SessionManager` 透传。

### 2.6 `app/main.ts`

- 模块级 `const shellSessionPaused = createShellSessionPauseState();`（窗口工厂/`registerIpc` 之外）：**同一次应用运行跨窗口重开保留；重启模块重新初始化 ⇒ 清零**；不写偏好。
- 每窗口 `createConfirmCardSlot()` 同时交给审批卡与升级卡呈现端；窗口关闭 `rejectAllPending`；focus/show/`app:recovery-ready` 幂等重推两类挂起卡；`watchdogPendingSnapshot` 合并升级卡 pending。
- `shell:confirm-response` 按 `isShellEscalationResponse` 路由（kind/action），旧 `{id, allow}` 逐字走既有审批。
- `shell:judge-pause`（sender 校验同 `shell:judge-*`）→ 状态机 + 推送；`shell:judge-state` 推送与 `shell:judge-get` 读取均含 `paused`；**shell 操作者通道** `isEnabled = shellJudgeSwitch.isEnabled() && !shellSessionPaused.isPaused()`；**治理 approval 组仍只看全局开关**；`shell:judge-set` 校验/持久化路径零改动。

### 2.7 `app/preload.cjs`

- 新增 `shellEscalationRespond(input)`（固定 `kind:"escalation"`、`id`、`action` 原样提交）与 `setShellJudgePaused(paused)`（提交布尔意图）；`shellConfirmRespond`（恰 `allow:true`）与 `onShellConfirm`/`onShellJudgeState` 原样保留；不暴露任何 Node 能力。

## 三、IPC / preload 形状冻结声明（供 C2 消费）

1. **`shell:confirm-request`（复用；主→渲染）**
   - 审批卡：`ShellConfirmRequest`（既有字段：`id/roleId?/projectRoot?/runtime?/command/summary/reasonPlain/reasonRaw/argvLines/cwd/tier/policy/judgeNotice?`）+ **`kind:"approval"`**（加法）。
   - 升级卡：`ShellEscalationIpcCard`：
     `{ version:1, kind:"escalation", id, requestId, roleId, projectRoot, runtime, command, argv, argvLines, cwd, judgeReason?, judgeCustomerMessage?, judgeAlternative?, necessity?, necessityNote?, approvalContext?, expiresAt?, customerNotJudgeNote, actions:["allow-once","allow-session","deny"] }`。
     `id` = 桌面卡族 id（`se-<n>`，**回包必须对 id**）；`requestId` = 编排申请 id（授权/审计权威 id，原样透传）。事实字段全部取自判拒记录；`necessity` 为**不可信文本**，渲染侧须在独立区块原样展示并显示 `necessityNote`；`customerNotJudgeNote` 为应用生成的「客户手批 ≠ judge 放行」声明。
2. **`shell:confirm-response`（复用；渲染→主）**
   - 审批卡：`{id, allow}`（逐字不变；恰 `allow:true` 才放行）；`kind:"approval"` 可选。
   - 升级卡：`{kind:"escalation", id, action}`，`action ∈ "allow-once"|"allow-session"|"deny"`；未知/过期 id、重复回包、非法动作 → `{ok:false, expired:true}`（**不放行**）；缺合法 `action` 的升级回包按失效结算（默认拒绝）。
   - 路由：`kind:"escalation"` 或无 `kind` 且有 `action` 字段 ⇒ 升级核；其余 ⇒ 审批核（两类核的 pending 互不可见，跨 id 注入无效）。
3. **`shell:judge-pause`（新增；渲染→主）**：入 `{paused:boolean}`（strict，无额外字段）→ `{version:1, ok, paused, error?}`；非法输入不改状态；sender 校验同 `shell:judge-*`。
4. **`shell:judge-state`（扩展；主→渲染）**：既有 `{version:1, ok, enabled, available}` + **`paused?: boolean`**（旧渲染忽略）。
5. **`shell:judge-get`（读取）**：既有回复 + `paused`（当前真实暂停态）。
6. **preload 方法名（冻结）**：`onShellConfirm`（同通道收两类，按 `kind` 分派）、`shellConfirmRespond`（审批，不变）、`shellEscalationRespond`（升级）、`getShellJudgeState`（含 `paused`）、`setShellJudgeEnabled`（不变）、`setShellJudgePaused`、`onShellJudgeState`（载荷含 `paused`）。
7. **暂停状态语义**：模块级、应用运行期、shell-only（`isEnabled = 持久化开关 && !paused`）；不写偏好、不改持久化开关、不影响治理 approval 组；同一次运行内跨窗口重开保留、重启清零；暂停页脚动作**不是**升级卡第四决定项（不触发 allow/deny）。
8. **升级 presenter 排他回执（E2 R2）**：共享槽被占用（有审批卡待答/已有升级卡）时，呈现函数返回 **`{action:"pending", reason}`**（契约第三支；不是客户决定、不是默认拒绝——不消耗申请权/额度、不写客户决定审计）；超时/中止/推达失败/窗口关闭仍为 `expired`/`unavailable`。IPC 回包形状不变（`{kind:"escalation", id, action}` 仍只三选一）。

## 四、`recovery-channel.ts`：不改 + 恢复卡回归证据

- **不改**：`createConfirmCardCore` 只做**加法**（可选 `slot`、新增 `mountAction/respondAction/canPresent/waitForSlot`）；既有 `mount/respond/rejectAllPending/pendingCount/pendingRoles/replayPending` 签名与语义未变，`ConfirmCardMetadata`/`ConfirmCardMountOptions` 未变 ⇒ `recovery-channel.ts` 无需适配，**文件哈希写前=写后**（§一表）。
- **回归证据**：`test/桌面应用/operator-channel.test.ts` 的 G-2/W5 恢复卡组（恰 `allow:true` 才为真、缺字段/取消 → false、未知 id → expired、**等待不设限**、关窗/中止=未获执行、`rp-` 前缀、按角色 pending）全部通过；本节点新增测试另钉「恢复卡不配置共享槽 ⇒ 不参与仲裁」；全量 `test/桌面应用/*.test.ts` 444/444 通过（R2 后）。

## 五、检查与证据（原始日志）

环境：Windows 11 Pro 10.0.26300；Node v24.22.1；npm 11.19.1；HEAD `9f670fb`。证据目录：
`C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\C1\`（下称 `$EV`；全部文件路径/行数/SHA-256 见下表）。

| 命令 | 退出码 | 结果 | 证据（行数 / sha256） |
| --- | --- | --- | --- |
| `node --test "test/桌面应用/operator-channel.test.ts"` | 0 | **57 / 57 pass / 0 fail / 0 skip / 0 todo** | `01-operator-channel.log`（65 / `0245c52b…12578`）；`01-operator-channel.exit` |
| `node --test "test/桌面应用/shell-escalation.test.ts"` | 0 | **21 / 21 pass / 0 fail / 0 skip / 0 todo** | `02-shell-escalation.log`（29 / `adfcdd84…2a99a`）；`02-shell-escalation.exit` |
| **`node --test test/桌面应用/operator-channel.test.ts test/桌面应用/shell-escalation.test.ts`** | **0** | **78 / 78 pass / 0 fail / 0 skip / 0 todo** | `03-combined.log`（86 / `8df3caa0…c16b1`）；`03-combined.exit` |
| `node --test "test/桌面应用/*.test.ts"`（受影响面回归） | 0 | **443 / 443 pass / 0 fail / 0 skip / 0 todo** | `04-desktop-suite.log`（464 / `793aae9b…fc875a`）；`04-desktop-suite.exit` |
| **`npm run typecheck`** | **0** | `tsc --noEmit` 无输出 | `05-typecheck.log`（4 / `2d13ff10…0435`）；`05-typecheck.exit` |
| 环境记录 | — | HEAD/Node/npm/OS | `00-pre-environment.txt`（6 / `aae76607…c9c2`） |
| 写前哈希清单 | — | 8 行（既有文件） | `00-pre-hashes.tsv`（8 / `f13bf425…24b7`） |
| 写后哈希清单 | — | 10 行（含两个新增） | `06-post-hashes.tsv`（10 / `9bfea9c9…e27a`） |
| 改动范围 | — | 写集内 8 改 + 2 新增；暂存区空 | `07-git-scope.txt`（23 / `21c174cc…1f5d`） |
| B0 对照 | — | 见 §五.1 | `08-baseline-comparison.txt`（3 / `b3229e6d…989a1f`） |

### 5.1 失败分类（对照 B0）

- B0：`operator-channel.test.ts` 56/56 pass；全量基线 3193 tests / 3166 pass / 9 fail（既有 Windows symlink EPERM）/ 18 skip；typecheck exit 0。
- C1：`operator-channel` 57/57（+1 新增 retry-capped 回归，既有 56 条全过）、`shell-escalation` 21/21、combined 78/78、桌面应用全目录 443/443；**0 fail / 新增确定性失败 = 0 / 新增 skip = 0 / 新增 todo = 0**；typecheck exit 0。失败分类：**无失败**。
- 未修改断言保绿；未删除既有断言；§六列出的 2 处既有测试同步均为「任务/上游变更导致的必要时更新」，且不弱化其余断言。

## 六、`test/桌面应用/operator-channel.test.ts` 的既有断言同步（逐条理由）

1. **「su 审批档（真正接通核查）」的 review 样本**：裸 `node --test` 已被 A2 的 (c) 确定性白名单在**所有角色（含内置治理角色）**放行为 `c-allow`（方案 §5.4/P7，0 卡、0 judge），不再是 review 样本；`node --test ../outside.test.ts` 会被写目标守卫按越界脚本拒（也不出卡）。改用 `tsc -p tsconfig.json`（不命中白名单、classify=`review`、写守卫不拦），保留原断言「review ⇒ 出卡交客户审批；当前桩件拒绝 ⇒ 不执行」。
2. **「F-4-opt1 focus/show 幂等重推」的 main.ts 源码钉**：同一 focus/show 现在还重推挂起的**升级卡**（同一 `shell:confirm-request` 通道）。正则由「只含 `shellConfirm.replayPending()`」扩为「`shellConfirm` + `shellEscalation` 均重推」，并新增 `shellEscalation.replayPending()` 存在性断言——**更强**（两类卡都覆盖），既有 shell 卡重推语义不变。
3. **新增**「manual/retry-capped ⇒ 仍拒绝不弹卡；审计保留 manual 事实；回执给出申请客户确认的新出路」（对应 AC-18/AC-19/P6；断言 `request_shell_escalation` 出路 + 「关闭「替我审批」后重试」兜底 + `manualAsDeny/modelVerdict/reasonCode`）。
- 其余既有断言（含开关关闭路径、恢复卡、超时/诊断、payload 逐字、审批档文案等）**未改动、未弱化**。

## 七、未解决项 / 偏差披露

1. **`test/桌面应用/e2e/main.mjs` 未改**：真实 Electron E2E 归 D2；且渲染侧升级卡界面属 C2，C1 阶段扩展 e2e 无客户可见面可验。未新建 `test/桌面应用/e2e/` 下任何脚本。
2. **审批卡直连核的边界**：共享槽等待在 `createDesktopOperatorChannel` 的 `presentConfirmed` 中执行；生产审批卡只经该通道。直接调用 `createShellConfirmPresenter.presenter.present()`（测试/非常规调用方）不经过等待——已在 §三.2 说明按 `kind`/卡族隔离，升级卡仍排他（其 `canPresent` 在核内自查）。
3. **升级卡超时双保险**：编排 registry 的 `presentTimeoutMs`（既有确认超时链）先判超时并记 `expired`；桌面 `cleanupAfterMs`（同链 +5000，与审批卡同口径）只做内存清理与 `onExpired` 定格（用户若在 5s 窗口内点击，registry 已终态、不会产生授权）。与审批卡既有「通道先判、清理后手」完全同构。
4. **`necessity` 超限行为**：由 A1 工具层「拒绝、不截断」保证；C1 只转抄合法输入并附 `necessityNote`，不再重复校验/截断（超限内容到不了 presenter）。
5. **`shellSessionPaused` 命名**：为与方案/验收口径一致，模块级单例命名为 `shellSessionPaused`（`createShellSessionPauseState()` 实例，提供 `isPaused()/set()/reset()`）；其值语义与方案「模块级 `shellSessionPaused` 标记」一致。
6. **真实应用证据缺失**：本节点未启动应用（纪律要求），P1/P8/G1 的真实截图/重启/窗口重开证据由 D2 按 V1 §4.6 场景矩阵补齐；本报告只声明实现与单测/typecheck 结果。
7. **B1 blocked（readonly × 例行白名单）** 与本节点无交集：C1 未改只读档路径；`test/编排/shell-readonly.test.ts` 的 2 项 blocked 仍由统筹/策划处置。

## 八、无越权改动与纪律声明

- 仅写：`app/desktop/{shell-escalation,confirm-card,operator-channel,session,interface}.ts`、`app/main.ts`、`app/preload.cjs`、`test/桌面应用/{operator-channel,shell-escalation}.test.ts`、本报告。`app/desktop/recovery-channel.ts` 未改（哈希同前）。
- 未写 `app/renderer/**`、`src/**`、其他角色测试目录、`test/桌面应用/e2e/` 新脚本、`docs/scheduling|acceptance|communication`、角色卡/边界/YAML、`package.json`/锁文件/构建/发布配方；未改 A1/B1/A3 冻结文件。
- 未 commit / 未 push / 未合并 / 未发布 / 未启动应用 / 未使用 stash；未暂存任何文件。
- 未新增 skip/todo；未以修改断言保绿（§六逐条列明）；未伪造输出；上述日志路径/行数/sha256 均可在证据目录复核。

## 九、E2 R2 presenter pending（2026-10-31 追加）

- **触发**：E2 返工 R2——A1 已在共享契约 `ShellEscalationDecision` 增第三支 `{ action: "pending"; reason?: string }`（`src/model/runtime.ts` 已落盘，本节点只读消费）。呈现端在**已有待答 shell 卡（审批/升级）**时不再把它当默认拒绝。
- **改动（仅写集内）**：`createShellEscalationPresenter.present()` 的 `!core.canPresent()` 分支由 `{action:"unavailable", reason}` 改为 **`{action:"pending", reason: mainT("main.operator.escalation.pending")}`**；超时/中止/推达失败/窗口关闭仍 `expired`/`unavailable`（未改）；IPC 回包形状不变（客户回包仍只三选一）。同步 §二.1 排他检查、§三.8 冻结声明。`pending` **不是客户决定**：不带 `operatorId`、不写客户决定审计；registry 据此不消耗申请权/额度、保持 recorded（回执协同由 B1 单测/集成覆盖）。
- **测试**：审批卡先到用例断言 `pending`（而非 `unavailable`）+ 无卡/无 pending 残留；新增「已有升级卡待答 ⇒ 第二张 pending；槽释放后可再次申请」用例。既有断言未弱化、未新增 skip/todo。
- **before / after 哈希（本阶段两文件）**：

| 文件 | R2 前 blob / sha256 | R2 后 blob / sha256 | 行数（后） |
| --- | --- | --- | --- |
| `app/desktop/shell-escalation.ts` | `da81ea1612744c7112a18b14e23775f4db67673f` / `49cccd0525b2ecd2fa2cf8e118faad1aaf285b61d91c0e74a5d75f4921308f46` | `0ced2ad8d748c7d56e1ef659bcd52beb7792577b` / `d0d0fa12284ff8060da7faa8e141659b94fa0961eecb8b4c45acf0e704e5ed8c` | 265 |
| `test/桌面应用/shell-escalation.test.ts` | `ff919ce9503ce2b59d4872f012534aed3de98e7b` / `af0e77bac8345bf424b55a80a51d7508248a6a10b1e60b60d2d619e219875829` | `3955f8029c80371840b12ec9413ffef514e85a62` / `c5006e7e9c82667da0ab99ab2a12663497138fbce0be265c8a2a4aec28f78609` | 489 |

- **检查（原始日志，`$EV` = `C:\Users\51054\AppData\Local\Temp\ans-shell-escalation-evidence\C1\`）**：

| 命令 | 退出码 | 结果 | 证据（行数 / sha256） |
| --- | --- | --- | --- |
| `node --test "test/桌面应用/operator-channel.test.ts"` | 0 | 57 / 57 pass / 0 fail / 0 skip / 0 todo | `09-r2-operator-channel.log`（65 / `f9a90d09…80cb`） |
| `node --test "test/桌面应用/shell-escalation.test.ts"` | 0 | **22 / 22 pass** / 0 fail / 0 skip / 0 todo | `10-r2-shell-escalation.log`（30 / `6e0e5308…c9c`） |
| `node --test test/桌面应用/operator-channel.test.ts test/桌面应用/shell-escalation.test.ts` | 0 | **79 / 79 pass** / 0 fail / 0 skip / 0 todo | `11-r2-combined.log`（87 / `3e5cd474…d2f0`） |
| `node --test "test/桌面应用/*.test.ts"` | 0 | **444 / 444 pass** / 0 fail / 0 skip / 0 todo | `12-r2-desktop-suite.log`（465 / `23a1b116…d08d`） |
| `npm run typecheck` | 0 | `tsc --noEmit` 无输出 | `13-r2-typecheck.log`（4 / `2d13ff10…0435`） |
| 写后哈希清单（R2） | — | 9 行 | `14-r2-post-hashes.tsv`（9 / `279ff072…199e`） |

- 失败分类：无失败；新增确定性失败 = 0、新增 skip = 0、新增 todo = 0。状态行仍为 `implemented-unverified`（未启动应用、未真实 E2E）；未 commit/push；写集外改动 = 无。
