---
id: su-shell-approval-review
type: design
title: su 的 run_shell 审批策略（只读免审批、其余含 deny 逐条客户批准）——评审与拆发
created: "2026-10-17"
updated: "2026-10-17"
timezone: Asia/Shanghai
status: approved
revision: 1
related: [governed-interaction-and-chat-ux, visual-convergence-v3-uiux]
events:
  - date: "2026-10-17"
    kind: reviewed
    summary: 客户裁定 su 的 shell 改为「只读白名单免审批、其余（含原硬拒 deny）逐条客户批准」；PM 批准实施并钉死 operator-only 模式、分支/审计、卡片披露与 su-only 守卫；如实登记 deny 面扩大与 shell 绕过写边界的风险
---

# su 的 run_shell 审批策略——评审与拆发

**客户裁定（逐字，2026-10-17）**：「这个su 的命令也改一下，不是只读，是只读的免审批，其他的要客户审批」；追加确认：「deny 也走客户审批」。
**本轮性质**：治理策略评审与拆发，**不写代码**。本文是策略边界、契约与派发口径；代码尚未改动。

## 一、结论

**批准按客户裁定实施。** su 的 `run_shell` 从「只读档（readonlyOnly）」改为「**operator-only + approveDeny**」：

1. `(c)=allow`（只读白名单）→ **直接执行，不弹卡**。
2. `(c)=risky` / `review` → **客户确认卡**；批准执行，拒绝/超时/通道不可用 = 拒绝；**不走 (b) pm 审读**（su 不自审）。
3. `(c)=deny`（原硬拒类）→ **也弹客户确认卡**；批准执行，拒绝/超时/通道不可用 = 拒绝。
4. 审计、落盘、文件写边界语义不变；shell 可绕过 `write_file` 角色边界，客户审批是唯一闸——**必须在卡片与内置角色卡中如实说明**。

**没有必须返工的问题**；但有 **两条必须如实登记的风险**（见 §六）与 **一条建议客户确认的边界**（deny 面远大于 `rm -rf`/`sh -c`，见 §七）。默认按客户原话「deny 也走客户审批」执行，不擅自保留不可批准的 deny 子集。

## 二、现状（代码事实，只读复核）

| 位置 | 事实 |
| --- | --- |
| `src/common/编排/shell-gate.ts` | `createShellGate` 的 (c)→(b)→(a) 链：allow 直放；deny 直接终结；risky/review 交 (b)；risky 在 (b) 放行后仍必过 (a)。`readonlyOnly` 只映射 (c)：allow 放行，deny 直接拒，risky/review 一律 `readonly-deny`（不接 b/a）。审计 `branch`/`by`/`conditions` 在 `createShellGate` 内统一落盘。 |
| `src/pipeline/orchestration/shell-arming.ts` | `assembleProjectShellGate` 接 (a) 通道 + (b) pm 审读（审读角色默认=内置 su）；`assembleReadonlyShellGate` 只接 (c)，选项面**没有** `operatorChannel`/`pmAsk`/`pmRoleId`/`sessionDeps`（type 层面接不上）。审计边界共用 `resolveGovernanceBoundary`。 |
| `src/pipeline/orchestration/run-role.ts` | shell 注入优先级：`shellReadonly` 优先（给出即只读档，**不受 `suppressHandback` 限制**）；否则仅当 `!suppressHandback` 且给了 `shellOperatorChannel` 才走项目角色三层链。`suppressHandback` = `built-in-governance`。 |
| `app/desktop/session.ts` | su（`role.builtIn === true`）只经 `shellReadonly = this.deps.shellArming` 注入只读档；`shellOperatorChannel` 当前**只对非内置角色**构造（`role.builtIn !== true`）。 |
| `app/main.ts` | `DESKTOP_SHELL_GATE_ARMED=true`；`buildDesktopShellArming()` 产 (c) 实件；`buildDesktopOperatorChannel(shellConfirm.presenter)` 产 (a) 通道并注入 `DesktopDeps`。 |
| `app/desktop/operator-channel.ts` | 确认卡数据面：命令原文、摘要、`reasonPlain`、`reasonRaw`、`argv`、`cwd`；`plainReasonFor` 已识别 risky/超时/不可用等，但**没有 deny 档**。卡片标题由 `index.html` 写死为「shell 命令请求」。 |
| `src/provider/runtime/tools.ts` | `run_shell` 的 F-7 执行层守卫在 ShellGate **之前**：未加引号的独立操作符/重定向、内嵌操作符、变量展开/命令替换 → **不调 gate、不 spawn、直接拒绝**。`run_shell` 工具描述只说「执行前必须过 ShellGate；未获明确 allow 绝不执行」，**没有只读限定**。 |
| `src/common/门禁引擎/classify-shell.ts` | 默认规则：`rm`/`rmdir`/`dd` 等属 **risky**（`risky:delete`）；`sh`/`bash`/`cmd`/`pwsh` 等（`reshell`）、`eval`/`exec`/`source`（`inline-eval`）、`node -e`/`python -c`（`interpreter-inline`）、`awk`、`sudo`、`mkfs`/`shutdown`、Windows LOLBin 等属 **deny**。`executionModel: "argv-noshell"`，不扫元字符；F-7 守卫另行拦截未加引号的展开/操作符。 |
| `src/common/门禁引擎/boundary-core.ts` | `BUILT_IN_ROLE_CARD_TEXT` 目前没有 run_shell 审批纪律段；现有「确认制要点」只讲 `request_confirmation` 写盘。 |

## 三、新策略与模式（钉死）

### 3.1 编排：`operatorOnly` + `approveDeny`

`CreateShellGateOptions` / `ShellGateBuildDeps` 新增两个**显式**开关：

- `operatorOnly?: boolean`（缺省 `false`）：`true` 时**不接 (b)**；`allow` 直放，`risky`/`review` 一律交 (a)。
- `approveDeny?: boolean`（缺省 `false`）：`true` 时 `(c)=deny` **不直接终结**，改交 (a)。**仅在 `operatorOnly === true` 时有效**。

**构造期守卫（全部 fail-closed，抛错 ⇒ 调用方不 arm）**：

1. `readonlyOnly && operatorOnly` → 抛错（模式互斥）。
2. `approveDeny && !operatorOnly` → 抛错（防止项目角色三层链的硬地板被误关）。
3. `operatorOnly && typeof operatorChannel !== "function"` → 抛错（没有客户通道就不能进入该模式；不得退化成「全拒但已注册」）。
4. `operatorOnly && (pmAsk || routineShellPolicy)` → 抛错（su 不自审；客户审批不得被 pm/委托常规检查绕过）。
5. `operatorOnly === false && approveDeny === false` → 既有行为逐字不变。

**判定映射（operatorOnly=true）**：

| (c) 判定 | approveDeny | 行为 | 审计 branch |
| --- | --- | --- | --- |
| allow | 任意 | 直接 allow；**不调用 (a)**（0 卡） | `c-allow` |
| risky | 任意 | 调 (a)；allow→放行，否则拒绝 | `c-risky→a-allow` / `c-risky→a-deny` / `c-risky→a-timeout` / `c-risky→a-unavailable` |
| review | 任意 | 调 (a)；同上 | `c-review→a-allow` / … |
| deny | true | 调 (a)；同上 | `c-deny→a-allow` / `c-deny→a-deny` / `c-deny→a-timeout` / `c-deny→a-unavailable` |
| deny | false | 直接拒绝（既有硬拒） | `c-deny` |

- 新增常量 `BRANCH_C_RISKY = "c-risky"`、`BRANCH_C_REVIEW = "c-review"`（仅 operator-only 使用；既有分支常量不变）。
- `by` 统一带档位后缀：`ruleset:<规则id>（su 审批档）`；经客户批准/拒绝后为 `ruleset:<规则id>（su 审批档） → operator:<标识>`。**不得**复用 `（su 只读档）`。
- 审计字段/落盘不变：`command` 逐字原文、`argv`、`cwd`、`conclusion`、`branch`、`by`、`conditions: ["shell-gate"]`、`execution: "未执行"`。审计失败**不翻转**判定（既有语义）。
- 审计边界仍取**治理边界**（`resolveGovernanceBoundary`），不因客户批准而改用项目角色边界；`docs/audit/shell-gate.jsonl` 与 `shell-gate` 条件不变。
- **超时**：沿用既有 `operatorTimeoutMs` 与整体 `timeoutMs`；a 超时/不可用 = 拒绝。建议装配时保证 `operatorTimeoutMs <= timeoutMs`，避免外层先超时（既有默认相等；不改变语义）。

### 3.2 卡片原因文本（跨角色契约）

`runA` 的 `why`（即 `OperatorPrompt.reason`）在 operator-only 模式下使用**固定前缀 + 档位 token**，供桌面窗口/桌面UI 稳定解析：

```text
su-审批档[<risky|review|deny>]：<档位说明/命中原因>；批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界。
```

- 编排导出单一来源常量 `SU_APPROVAL_REASON_PREFIX = "su-审批档"` 与 `renderSuApprovalReason(tier, detail?)`；桌面窗口只读导入或按钉死正则 `/^su-审批档\[(risky|review|deny)\]/` 解析。**不得**在两端各写一份不同文案。
- `deny` 的 `detail` 带 `(c)` 的原文（如「命中硬拒程序规则：reshell」）；`risky`/`review` 同理带规则 id/原因。
- 项目角色三层链的 `why` 文案**逐字不变**（不加此前缀）。

### 3.3 编排：`assembleOperatorShellGate`

`src/pipeline/orchestration/shell-arming.ts` 新增：

```ts
export interface AssembleOperatorShellGateOptions {
  project: ProjectConfig;
  operatorChannel: OperatorChannelFn;   // 必填（无通道即不 arm）
  classifyShell?: ClassifyShellFn;
  rules?: ShellRules | (() => ShellRules | Promise<ShellRules>);
  timeoutMs?: number;
  operatorTimeoutMs?: number;
  now?: () => Date;
  env?: Record<string, string | undefined>;
  auditSink?: ShellAuditSink;
}
export async function assembleOperatorShellGate(opts: AssembleOperatorShellGateOptions): Promise<ShellGate>;
```

- **选项面没有** `pmAsk`/`pmRoleId`/`openSession`/`sessionDeps`/`routineShellPolicy`——type 层面保证 su 不自审、不会被委托常规检查绕过。
- 内部 `buildShellGate({ operatorOnly: true, approveDeny: true, operatorChannel, ... })`；审计边界解析复用 `resolveGovernanceBoundary`（同只读档）。
- 失败语义：缺 `classifyShell`/`rules`/通道 ⇒ 构造抛错或 gate 一律拒绝；调用方（`run-role`）捕获 ⇒ **不 arm**（`run_shell` 不注册）。

### 3.4 `run-role.ts`：`shellOperatorOnly` 输入（su-only）

- 新增 `shellOperatorOnly?: Omit<AssembleOperatorShellGateOptions, "project">`。
- **su 分支不受 `suppressHandback` 限制**：给出即装配 operator-only（与旧 `shellReadonly` 同级）。
- **su-only 守卫**：`shellOperatorOnly` 只允许在 `suppressHandback === true`（内置治理角色）时生效；**项目角色即使误传也不 arm**（记录诊断），防止三层链被绕过。
- **互斥守卫**：`shellOperatorOnly` 与 `shellReadonly` 同时给出 ⇒ **不 arm**（诊断记录），不择一静默生效。
- 优先级：`shellOperatorOnly`（su-only 校验后）→ `shellReadonly`（旧路径，保留给其他调用方/测试）→ 项目角色三层链（既有 `!suppressHandback` 条件）。缺省行为不变。

### 3.5 桌面窗口

- `app/desktop/session.ts`：
  - **(a) 通道对 su 也构造**（去掉 `role.builtIn !== true` 条件）：`shellOperatorChannel = channel(prompt, {roleId, projectRoot, runtime, signal})`。
  - su：`shellOperatorOnly = deps.shellArming && shellOperatorChannel ? { classifyShell: deps.shellArming.classifyShell, rules: deps.shellArming.rules, operatorChannel: shellOperatorChannel } : undefined`。
  - **不再**给 su 传 `shellReadonly`；`shellArming` 仍只给项目角色三层链。`DESKTOP_SHELL_GATE_ARMED=false`/缺件 ⇒ 不传 ⇒ su 不 arm。
  - 旧 `shellReadonly` 字段可保留在类型中（兼容其他调用方），但桌面不再使用；若两者同时出现，编排侧不 arm。
- `app/desktop/operator-channel.ts`：
  - `ShellConfirmRequest` 增 `tier: "risky" | "review" | "deny" | null`、`policy: "su-approval" | "project"`（**桌面自有类型**，不改 `model/runtime.ts` 的 `OperatorPrompt`）。
  - `buildShellConfirmRequest`：从 `display.reason` 解析 `su-审批档[...]`；`reasonPlain` 新增 deny/risky/review 的 su 文案（先匹配前缀，避免既有 `/risky/` 泛匹配）。
  - `plainReasonFor` 的 su 文案必须包含「逐条客户批准」「拒绝/超时/通道不可用 = 拒绝」「批准后可能绕过 ANS 文件写边界」。
- `app/main.ts`：预期**零改动**（通道已构造并注入）；实施时核实 `shellArming` 为 undefined 时 `shellOperatorChannel` 也为 undefined（现状如此）。
- `app/desktop/interface.ts`：`DesktopDeps` 注释更新（`shellOperatorChannel` 不再只给项目角色）；无 IPC 变化。

### 3.6 桌面UI：确认卡

- 标题：`policy === "su-approval"` → 「**SU 命令审批**」；否则保持「shell 命令请求」。
- 档位标签（`sc-summary` 或等价可见行）：`risky` →「风险命令（risky）」；`review` →「未自动判定（review）」；`deny` →「**硬拒类（deny）**」。
- 可见的高风险原因：`reasonPlain` + 一行 `reasonRaw`（如「命中硬拒程序规则：reshell」）；完整 argv/cwd 仍在折叠详情。
- **必备警告**（su 卡）：批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界；请逐字核对命令原文。
- 按钮/焦点：沿用「批准执行 / 拒绝」，**拒绝为默认焦点**；Esc/关闭/超时 = 不执行；无「记住选择」。
- 不显示「只读」徽标（只读命令不出卡）；不把「已提交审批」呈现成「已获准」。
- 优先**零 HTML 改动**：复用 `sc-title`/`sc-summary`/`sc-reason`/`sc-hint`；若确需独立档位徽标，`index.html` 属桌面UI，允许但须在实施清单列明。

### 3.7 门禁引擎：内置角色卡「命令纪律」

在 `BUILT_IN_ROLE_CARD_TEXT` 增加一段（位置建议在「派发 ≠ 授权」之后、「安装纪律」之前）：

```text
命令纪律（run_shell）：只读白名单命令（(c) 判为 allow）直接执行、不弹确认卡；
其余一切命令——risky/review，以及被 (c) 判为硬拒的 deny（如 sh -c/eval、提权、系统破坏等）——
都必须由客户在确认卡上逐条批准：批准才执行；拒绝/超时/通道不可用一律拒绝。
本模式不走 pm 审读（su 不自审）。你不得把「已提交审批」说成「已获准」，
不得自行执行未获批准的命令，不得声称审批会自动通过。
shell 命令不受文件写边界约束：命令可以写到当前 OS 用户可写的任何位置，
客户审批是唯一闸；需要时须如实告知客户这一风险。
```

- 不写「rm -rf 属 deny」（当前规则是 risky），避免与规则事实不符；用「如 sh -c/eval、提权、系统破坏等」举例。
- 与既有「确认制要点」分开：`request_confirmation` 管 `write_file`，shell 审批卡管 `run_shell`，不得混同。

### 3.8 运行时核心/Pi适配器：零改动（需核实）

`run_shell` 工具描述（`src/provider/runtime/schema.ts`）没有「只读」限定，仍然成立：「执行前必须过 ShellGate 审核；未获明确 allow 绝不执行」。**本轮不改** `src/provider/runtime/tools.ts` / Pi适配器，除非实施时发现其他只读限定文本。F-7 守卫（未加引号的操作符/展开）保持——见 §七-1。

## 四、文件归属与派发

| 属主 | 文件 | 改动 | 测试 |
| --- | --- | --- | --- |
| 编排 | `src/common/编排/shell-gate.ts` | `operatorOnly`/`approveDeny`、构造守卫、`c-risky`/`c-review`、`byTagged`、`SU_APPROVAL_REASON_PREFIX`/render、审计分支 | `test/编排/shell-gate.test.ts`、`shell-review-chain.test.ts`（扩展） |
| 编排 | `src/pipeline/orchestration/shell-arming.ts` | `AssembleOperatorShellGateOptions` + `assembleOperatorShellGate` | `test/编排/shell-arming.test.ts`（扩展） |
| 编排 | `src/pipeline/orchestration/run-role.ts` | `shellOperatorOnly` 输入、su-only/互斥守卫、优先级 | `test/编排/session-handle.test.ts`、`shell-readonly.test.ts`（回归）、新增 `shell-operator-only.test.ts`（目录授权） |
| 编排 | `src/common/编排/operator-channel.ts` | CLI 提示不再写死「(b) 未定」；按 mode 如实（低优先，桌面为主） | `test/编排/*` 相关 |
| 门禁引擎 | `src/common/门禁引擎/boundary-core.ts` | `BUILT_IN_ROLE_CARD_TEXT` 命令纪律段 | `test/门禁引擎/su-shell-approval-convention.test.ts`（目录授权，可新增） |
| 桌面窗口 | `app/desktop/session.ts` | su 构造 (a) 通道并注入 `shellOperatorOnly`；不再传 `shellReadonly` | `test/桌面应用/session.test.ts`、`operator-wiring.test.ts`、`su-effective-boundary.test.ts`（单文件扩展） |
| 桌面窗口 | `app/desktop/operator-channel.ts` | tier/policy 解析、deny plain reason、请求字段、卡片数据面 | `test/桌面应用/operator-channel.test.ts`（单文件扩展） |
| 桌面窗口 | `app/desktop/interface.ts` | 注释/类型同步（无 IPC） | 同会话测试 |
| 桌面UI | `app/renderer/renderer.js`（可选 `index.html`） | 标题、档位标签、可见原因、警告、默认焦点 | `test/桌面应用/renderer.test.ts`（单文件扩展）、`e2e/uiux-v2.mjs`（单文件扩展） |
| 运行时核心/Pi适配器 | — | **零改动**（核实无只读限定） | 既有 run_shell 测试回归 |
| 测试 | `test/测试/su-shell-approval-verify/`（新目录）+ 测试报告 | 独立端到端与真机清单 | — |
| 项目管理 | 本文件、`memo.md`、`changelog.md` | 评审与拆发 | — |

**边界纪律**：`test/桌面应用/` 是单文件条目，桌面窗口/桌面UI 只可扩展既有文件；`test/编排/`、`test/门禁引擎/`、`test/测试/` 是目录条目，可新增文件。桌面窗口不得直接导入编排私有 `common/`；经 `shell-arming.ts` 的公共出口。不新增 `model/runtime.ts` 契约字段。

## 五、验收

### 5.1 门禁/编排（确定性）

- **allow**：`operatorOnly` 下 allow → 放行；**operator 通道调用次数 = 0**；branch `c-allow`；`by` 含「（su 审批档）」。
- **risky**：出 1 卡；批准 → allow，branch `c-risky→a-allow`；拒绝/超时/不可用 → deny，branch 对应；**不调用 pmAsk/routineShellPolicy**。
- **review**：同上，branch `c-review→a-*`。
- **deny + approveDeny**：出 1 卡；批准 → allow，branch `c-deny→a-allow`；拒绝/超时/不可用 → deny，branch 对应。
- **deny + approveDeny=false**：直接拒，branch `c-deny`，**不调用 operator**（回归）。
- **构造守卫**：`readonlyOnly+operatorOnly`、`approveDeny` 无 `operatorOnly`、无通道、带 `pmAsk`/`routineShellPolicy` → 抛错/不 arm。
- **审计**：每条含 `command` 原文、`argv`、`cwd`、`branch`、`by`、`conditions:["shell-gate"]`；拒绝/超时/不可用可辨；审计失败不翻转（既有）。
- **只读档回归**：`readonlyOnly` 既有测试全绿；项目角色三层链逐字不变。

### 5.2 桌面/端到端

- su 的 `run_shell` 注入 operator-only；项目角色仍三层链；`DESKTOP_SHELL_GATE_ARMED=false`/缺件 → 不 arm（`run_shell` 不注册）。
- 卡片：allow 0 卡；risky/review/deny 各出卡；标题/档位/原始命令/高风险原因/绕过写边界警告可见；拒绝为默认焦点；拒绝/Esc/关闭/超时 = 不执行。
- 安全端到端（临时目录）：`sh -c "echo approved"`（deny）批准后真实执行并留审计；拒绝/超时后**零执行**（哨兵文件不存在）。`touch`/`rm`（risky）用临时文件验证；`review` 用一个不存在的程序验证「批准后 spawn 失败但判定已放行」。
- 审计文件：临时项目落 `docs/audit/shell-gate.jsonl`，branch/by/command 与判定一致。
- 写边界不变：`write_file` 的角色边界回归；shell 绕过写边界在卡片与角色卡中有如实披露（不声称已拦）。
- 真机：客户本人看卡、批准/拒绝；不使用凭据/网络；测试角色只用桩通道与临时目录。

## 六、风险与回滚（如实登记）

1. **su 的硬地板被客户审批替代（核心风险）**：原 `deny` 直接终结、不可翻案；新策略下 `deny` 可被客户批准执行。客户已明确裁定「deny 也走客户审批」；本评审不保留不可批准子集。**缓解**：卡片显示档位、原始命令、命中原因、默认拒绝、无「记住」、逐条审计。**残余**：客户可能匆忙批准；模型可构造看似无害的命令。
2. **deny 面远大于示例**：当前 deny 含 `sh`/`bash`/`cmd`/`pwsh`（reshell）、`eval`/`exec`/`source`、`node -e`/`python -c`/`awk`（内联求值）、`sudo`/`doas`/`pkexec`（提权）、`mkfs`/`fdisk`/`shutdown`/`reboot`（系统破坏）、`certutil`/`mshta`/`cscript` 等 LOLBin。**这些全部变为客户可批准**。**建议**（不阻塞）：对「提权/系统破坏/LOLBin」显示更强的警告或二次确认；是否保留 `never-approve` 子集请客户确认（§七-2）。
3. **shell 绕过文件写边界**：`write_file` 的 Section 1 约束不适用于 shell；`sh -c` 批准后其内部一切写入**不经过 `resolveWrite`**，审计只记外层命令串/argv，不记内部子命令。**缓解**：卡片逐字显示原始命令 + 必备警告；内置角色卡新增命令纪律；不声称写边界已覆盖 shell。**残余**：批准的 `sh -c` 可写到项目外/敏感位置；`cwd` 钉项目根不阻止绝对路径。
4. **审批疲劳/卡片醒目度**：su 的常见开发命令（`touch`/`cp`/`mv`/`git commit` 等 risky）都会出卡；客户可能形成盲点。**缓解**：默认拒绝、档位标签、原始命令优先、无自动/记忆批准；不做「重复命令自动放行」。
5. **超时/通道不可用**：沿用 fail-closed（拒绝）；关闭窗口/轮次中止/会话重建时确认失效，不执行。测试覆盖 `a-timeout`/`a-unavailable`。
6. **审计失败不翻转判定**：已批准的 deny/risky 命令若审计落盘失败仍会执行（既有语义）。**缓解**：stderr 如实提示、去重；不改判定（客户/本轮未授权改）。**残余**：可能缺少该条审计记录。
7. **误用 operator-only 到项目角色**：`run-role` 的 su-only 守卫 + `approveDeny` 必须伴随 `operatorOnly` 的构造守卫 + 模式互斥，防止三层链被误关。测试覆盖。
8. **F-7 守卫与变量展开**：未加引号的 `$VAR`/`$(...)`/`|`/`>` 在 gate 之前被 F-7 拒绝，**不出卡**；这不是遗漏，而是 argv-noshell 执行模型的一部分（批准也不会被 shell 解释）。需要 shell 展开时，模型应使用 `sh -c "..."`（deny 档，会出卡）。若客户要求「F-7 命中也要出卡」，属运行时核心/Pi适配器另项改动，不在本轮。

**回滚**：桌面把 su 的注入从 `shellOperatorOnly` 改回 `shellReadonly`；移除内置角色卡命令纪律段；`shell-gate.ts` 的 `operatorOnly`/`approveDeny` 缺省 false，保留代码即不影响既有三层链/只读档。**无数据/契约迁移**，回滚只涉及代码与文案。A/B 两档不涉及。

## 七、与任务描述/现状不一致处（必读）

1. **`rm -rf` 不是 deny，是 risky**：默认规则 `risky:delete` 覆盖 `rm/rmdir/del/shred/truncate/dd`；`sh -c`/`eval`/`node -e`/`awk`/`sudo`/`mkfs`/LOLBin 才是 deny。客户例子里的 `rm -rf` 与 `sh -c` 会**分别**走 `c-risky→a-*` 与 `c-deny→a-*`，都出卡，但档位标签不同。**不要**把 `rm` 改标 deny 来「对齐措辞」。
2. **deny 面远大于示例，且包含提权/系统破坏/LOLBin**：按客户原话全部可批准。**待客户确认（建议默认：全部可批准 + 更强警告）**：是否对 `sudo`/`mkfs`/`shutdown`/`certutil` 等保留 `never-approve`？本评审默认不保留，避免擅自改客户裁定；若客户同意，作为一个小增量（规则集加白名单/不可批准子集 + 卡片禁用「批准」）再实施。
3. **变量展开在 F-7 守卫被提前拒绝**：见 §六-8；不是 gate 的 deny 档。若客户要求「变量展开也出卡」，需改 F-7 或改用 `sh -c`，属另项决策。
4. **`run_shell` 工具描述无只读限定**：运行时核心/Pi适配器零改动；不要顺手改工具描述或 F-7。
5. **旧只读档保留**：`readonlyOnly`/`assembleReadonlyShellGate`/`shellReadonly` 代码保留给其他调用方与回归；桌面 su 不再使用。不要把旧路径删掉（会破坏既有测试/兼容面）。
6. **CLI 提示文案**：`src/common/编排/operator-channel.ts::formatOperatorPrompt` 现在写死「(b) 未定，(a) 请操作者确认」；若 CLI 未来使用 operator-only，需按模式如实改写。桌面主路径不经过它，但同属编排，建议同批修正。
7. **卡片标题**：`index.html` 写死「shell 命令请求」；桌面UI 需按 `policy` 动态设置标题（复用现有元素，零 HTML 亦可）。

## 八、派发顺序

| 步 | 角色 | 内容 | 依赖 |
| --- | --- | --- | --- |
| 1 | 编排 | `shell-gate.ts` 模式/分支/守卫 + `shell-arming.ts` 装配 + `run-role.ts` 输入；单测覆盖 allow/risky/review/deny × 批准/拒绝/超时/不可用；审计断言 | 本评审 |
| 2 | 门禁引擎 | `BUILT_IN_ROLE_CARD_TEXT` 命令纪律段 + 文本测试 | 与步 1 并行（不同文件） |
| 3 | 桌面窗口 | `session.ts` su 注入 operator-only + `operator-channel.ts` tier/policy/文案；测试 | 步 1 |
| 4 | 桌面UI | 卡片标题/档位/原因/警告/默认焦点；测试 | 步 3 的请求形状（契约已钉死，可先做静态部分） |
| 5 | 测试 | `test/测试/su-shell-approval-verify/` 独立端到端（临时目录、桩通道、审计、零执行哨兵）；真机清单 | 步 1–4 |
| 6 | 客户 | 真机看卡、批准/拒绝、核对写边界披露 | 步 5 |

**同角色串行**；不同角色不并发写同一文件；桌面窗口零 IPC 变更；运行时核心/Pi适配器不派发。A3/B 不涉及。真机不使用凭据/网络；测试角色不代跑客户审批。
