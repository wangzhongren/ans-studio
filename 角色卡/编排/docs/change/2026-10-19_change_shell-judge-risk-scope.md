# 2026-10-19 变更：shell 判断改为「系统风险审查」并注入实际读取预算

## 客户反馈（原话）

「判断应该告诉他预算限制。还有就是判断主要是对于系统其他的有没有风险，卡死风险，电脑其他的风险，项目内，不是随他吗，他不关心业务。」

两件事：
1. **定位修正**：判断 agent 是「系统风险审查」，不是「业务必要性审查」。项目内的普通命令由发起角色自己决定，判断 agent 不应因看不懂业务而拦截。
2. **预算告知**：把本次判断实际解析的读取预算明确写进提示词，而不是让模型撞墙后泛泛报「预算用尽」。

## 改动

### 1. 系统提示改为风险 rubric（`src/common/编排/shell-judge-prompt.ts`）

稳定系统提示的「【必要性 rubric——只有以下五维同时成立才可 allow】」整段替换为「【风险 rubric——确认无以下风险才可 allow】」：

- **系统/机器风险**：破坏性删除或覆盖、修改权限/系统配置、sudo/提权、安装或卸载软件包、杀他人进程、资源耗尽（磁盘/内存/CPU/进程数）；
- **卡死风险**：长期驻留服务、阻塞/交互式命令、`tail -f`、无超时的 `sleep`/脚本、无限循环、等待 stdin；
- **越界**：写到项目外、路径穿越、读取密钥/凭据、外发敏感数据；
- **并发/数据完整性**：并行写同一文件、可能损坏数据的操作；
- **端口/资源冲突**：抢占或冲突关键端口、与在跑服务争用同一资源。

新增「【不判断（明确排除）】」：

- 业务正确性、命令是否「必要」、测试是否合理、是否理解业务都不是判断对象，也不得作为 deny/manual 的理由；
- 项目内非破坏性的读写、跑测试、本地服务 curl、带超时的脚本由发起角色自己决定；不得因为「看不懂业务」或「看不出必要」而拦截；
- 命令看起来「多余」但无系统风险 → allow。

fail-closed 语义保留：有明确风险 ⇒ deny；缺关键证据 ⇒ manual；确认无风险 ⇒ allow。deny 档（su 审批档）特殊规则同步改为「系统风险已核对且可控」，不再以「任务明确需要」为前提。读取纪律中「只读与命令是否必要直接相关的文件」改为「只读与是否存在系统风险直接相关的证据」。

### 2. 实际读取预算注入提示词（`shell-judge-prompt.ts` + `shell-judge.ts`）

- `buildShellJudgePrompt(input, budget?)` 新增可选预算参数（`ShellJudgeReadBudgetNotice`：`maxCalls`/`maxBytes`/`maxFileBytes`），在请求提示中输出「本次读取预算（运行时解析值，本次判断生效）」块，并提示先规划取证、范围参数定点读取、预算耗尽时 manual 且写明**缺哪项具体证据**。
- 预算数值**不硬编码**：`createShellJudge` 在每次判断时调用运行时核心既有导出 `resolveShellJudgeBudget(opts.budget)` 解析一次（显式注入 > `ANS_SHELL_JUDGE_MAX_*` env > 运行时缺省），同一份结果：
  1. 作为 `ShellJudgeToolOptions.budget` 显式注入只读工具（工具层不会再被 env 分叉）；
  2. 传给 `buildShellJudgePrompt` 写进提示。
- `CreateShellJudgeOptions` 新增可选 `budget?: Partial<ShellJudgeBudget>`（向后兼容；桌面调用无需改动）。
- 新增 `formatShellJudgeBudgetBytes`：整 KiB 显示 `NKiB`，否则如实显示字节数。

### 3. 文案去「业务不必要」（`shell-judge.ts` / `shell-judge-verdict.ts`）

- 内部 `reasonCode:"necessary"` **保留**（兼容审计/桌面/测试消费方），语义改为「风险审查通过（无系统风险）」；
- deny 兜底 reason：「判断为不必要或未确认必要性。」→「判断未能确认该命令无系统风险。」；
- 防循环命中文案：「连续被判断为不必要」→「连续未通过系统风险审查」；
- `synthesizeCustomerMessage` 默认说明：「当前不必要或不安全」→「存在系统风险或无法确认安全」。

既有工具面（恰 `judge_read_file` / `judge_list_dir` / `report_shell_judgement`）、规则层 (c)、`ShellJudgeVerdict`/`ShellJudgeOutcome` 结构、全部 reasonCode 与读取损伤降级（allow 遇 budget/truncated/denied → manual）均未改变。

## 测试

- 新增 `test/编排/shell-judge-risk-scope.test.ts`（13 例）：
  - rubric 含五类风险与 fail-closed；
  - 明确排除业务必要性，项目内非破坏性命令由角色决定；
  - 预算数字来自注入（`buildShellJudgePrompt` 层面 + 驱动层面），env 解析值同样进入提示与工具；
  - 无风险 allow / 有风险 deny / 缺证据 manual；
  - 客户文案不再出现「不必要」。
- 更新 `test/编排/shell-judge-read-discipline.test.ts` 一处语义断言：「只读与『这条命令是否必要』直接相关的文件」→「只读与『这条命令是否存在系统风险』直接相关的证据」。这是定位修正的有意变更，覆盖强度不降（同一条读取纪律，风险口径）。

## 验证（真实输出）

- `node --test "test/编排/**/*.test.ts"` → **612 计 / 612 过 / 0 红 / 0 skipped**（上一基线 599，+13 即本批新增）。
- `npm run typecheck` → **exit 0**（仅 npm 镜像配置既有 warning）。

## 跨角色依赖 / 请求

1. **运行时核心（只读依赖，已按既有导出实现）**：`shell-judge.ts` 只读导入 `src/common/runtime-core/shell-judge/policy.ts` 的 `resolveShellJudgeBudget`/`ShellJudgeBudget`。该文件头注释称「不跨角色导出为公共契约」，本批为满足客户「预算必须告知实际值」而使用既有导出，未改 runtime-core。**请求运行时核心**将其登记为跨角色只读契约（或收敛到 `common/shared/`），否则后续可能被当作私有实现收紧。
2. **运行时核心（工具描述仍为旧口径）**：`src/provider/runtime/schema.ts` 的 `report_shell_judgement` 参数/工具说明仍写「allow = necessary and safe」「deny = not necessary」、promptGuidelines 仍要求「不必要…如实 deny」。该文件属运行时核心边界，本角色未改。**请求**同步改为系统风险口径，避免与编排系统提示冲突（模型同时看到两份描述）。
3. 桌面/审计如按 `reasonCode:"necessary"` 展示文案，语义现为「无系统风险」，码值不变、无需迁移。

## 边界与残余

- 只写 `src/common/编排/shell-judge-prompt.ts`、`src/common/编排/shell-judge.ts`、`src/common/编排/shell-judge-verdict.ts`、`test/编排/**` 与本角色文档；未碰 `app/**`、其他角色源码、运行时核心、适配器与 git 历史。
- 提示只能引导：判断 agent 仍可能误判；真正的硬约束仍是运行时核心的只读工具/预算与编排的「读取损伤 → allow 降 manual」。
- 预算每秒判断解析一次（含 env）；运行中修改 env 会即时影响后续判断，属预期但需知悉。
- 项目内命令若实际触及五类风险（如测试脚本无限循环、写项目外），仍会被 deny/manual——这不是「业务拦截」，是风险审查的本职。
- 未 git 提交；未读 `.env`、未跑真实模型。
