---
id: shell-judge-final-decision
type: change
title: 「替我审批」开启时判断 agent 是唯一审查者——manual/row-failed 一律按拒绝处理，不再弹客户确认卡
created: "2026-10-19"
status: implemented
---

# 「替我审批」开启时判断 agent 是唯一审查者

## 客户反馈（原话）

> 审查只有同意和拒绝，不需要我来同意，拒绝要给理由。

真机现场：test-engineer 提交了一条巨大的内联 `node -e` 脚本，shell 判断 agent 返回
`manual/context-too-large`（「命令或上下文过大」），桌面通道随后弹出「放行执行 / 拒绝」卡要求客户手批。
客户明确不要这种手动同意：**开关开启时，判断 agent 的结论就是最终结论**（同意 / 拒绝），拒绝必须带理由。

## 根因

`app/desktop/operator-channel.ts` 的三态映射沿用 2026-10-17 设计：`manual`（命令/上下文过大、读取预算
耗尽、超时、不可用、解析失败等）会被写成 `display.judgeNotice` 后**回落原 `present` 路径**（弹客户确认卡）；
`allow` 的结果行投达失败也回落 `manual/row-failed` 再弹卡。开关开启后这两条回落与客户新裁定冲突。

## 改动（仅桌面通道在 judge-enabled 下的 manual 映射；不动规则层/verdict 语义/写门禁）

`app/desktop/operator-channel.ts`：

1. **`manual` ⇒ 直接拒绝，不调用 presenter**：
   - 返回 `{ outcome: "deny", operatorId: "judge:<engine>", reason, judge }`；
   - `reason` 由新增导出 `manualJudgeDenyReason(reasonCode, reason)` 生成：复用既有
     `judgeManualHumanReason` 的具体人话（命令或上下文过大 / 读取预算已用尽 / 判断超时 / 判断服务不可用 /
     读取被拒的具体路径 / 解析失败……），拼接「，无法完成自动审查，已拒绝；<按原因给出的出路>」；
     例（context-too-large）：`命令或上下文过大，无法完成自动审查，已拒绝；请改用落盘脚本或拆分命令后重试。`
   - **审计保留 manual 事实**：`judge` 审计字段的 `verdict` 记通道最终处置 `deny`，同时
     `modelVerdict: "manual"`（契约家既有字段）+ 原 `reasonCode`（如 `context-too-large`）+ 桌面扩展标记
     `manualAsDeny: true`——**不伪装成模型主动 deny**；另记诊断 `shell-judge.manual.denied`
     （`decision: <policy>:<tier>:manual`、`outcome: "manual"`、原 `reasonCode`）。
   - 不产生判断结果行（`ShellJudgeResultPayload.verdict` 只有 allow/deny；manual 的结果行会被渲染成
     「judge 拒绝」，属于伪装）。拒绝理由经 `OperatorOutcome.deny.reason` 进入编排既有 deny 路径
     （`src/common/编排/shell-gate.ts` 的 `out.reason`）与既有 deny 工具结果
     （`run_shell 未执行：审核拒绝（<reason>…）`），**角色侧能看到完整理由**。

2. **`allow` 但结果行投达失败 ⇒ `row-failed` 直接拒绝，不调用 presenter**：
   - 返回 `{ outcome: "deny", operatorId: "judge:<engine>", reason, judge }`；
   - `reason` 由新增导出 `rowFailedJudgeDenyReason(detail)` 生成：
     `审查结果投达失败，无法在聊天中显示判断结论，已拒绝；<投达失败详情>。`
   - 审计：`verdict: "deny"` + `modelVerdict: "allow"`（模型原始裁决是放行，不是模型主动拒绝）+
     `reasonCode: "row-failed"` + `manualAsDeny: true`；诊断 `shell-judge.row.failed` 增记
     `reasonCode: "row-failed"`/`outcome: "deny"`/`errorMessage`。

3. **新增导出** `ShellJudgeAuditWithManual extends ShellJudgeAudit { manualAsDeny?: true }`——桌面侧审计扩展
   （契约家 `ShellJudgeAudit` 未含该字段；同编排 `ShellJudgeAuditWithLabel` 先例，**不改
   `src/model/runtime.ts`**）。

4. **开关关闭 / 无 judge / 已中止**：原 `present` 手动确认卡路径**逐字不变**（客户显式关闭了自动审查）。
   `parseSuApprovalTier`/`policy`/`tier`、deny 档 `hardDenyOverride` 标记、结果行载荷、audit by/branch
   （编排侧）均不变。

5. `manualJudgeNotice` 保留导出（渲染侧 `ui-labels.js` 同名文案口径与旧调用方兼容），但**不再用于
   judge-enabled 的 shell 通道**；`ShellCommandDisplay.judgeNotice` 字段保留兼容、不再由本通道设置。

## 行为矩阵（仅「替我审批」开启且有 judge 时）

| 判断返回 | presenter（确认卡） | OperatorOutcome | 审计/诊断 |
| --- | --- | --- | --- |
| `allow` + 结果行投达成功 | 0 次 | `allow`（`operatorId=judge:<engine>`，`judge` 原样） | `shell-judge.decision`（allow） |
| `allow` + 结果行投达失败 | **0 次（本次改动）** | `deny`（`judge:<engine>`），理由「审查结果投达失败…」 | `modelVerdict=allow`、`reasonCode=row-failed`、`manualAsDeny`；`shell-judge.row.failed` |
| `deny` | 0 次 | `deny`（`judge:<engine>`），既有格式化理由 | `shell-judge.decision`（deny） |
| `manual`（context-too-large/budget/timeout/unavailable/parse-failed/read-denied/aborted…） | **0 次（本次改动）** | `deny`（`judge:<engine>`），具体人话 + 出路 | `modelVerdict=manual`、原 `reasonCode`、`manualAsDeny`；`shell-judge.manual.denied` |
| 开关关闭 / 无 `metadata.judge` / signal 已中止 | 原路径逐字不变 | 人工 allow/deny | 人工归因（不写 `judge`） |

## 测试

`test/桌面应用/operator-channel.test.ts`（既有断言未放宽；按新裁定改写 5 个旧 manual/row-failed 用例，
新增 2 个用例）：

- `manual`（context-too-large / budget / timeout 三例）⇒ presenter 零调用、结果行零发送、
  `outcome=deny`、`operatorId=judge:<engine>`、理由含具体人话与「已拒绝」；审计
  `verdict=deny` / `modelVerdict=manual` / 原 `reasonCode` / `manualAsDeny=true`。
- `allow` 结果行投达失败 ⇒ presenter 零调用、`deny`、理由含「审查结果投达失败」与投达详情；审计
  `modelVerdict=allow` / `reasonCode=row-failed` / `manualAsDeny=true`。
- 诊断：`shell-judge.manual.denied` 保留 `outcome=manual`、原 `reasonCode`、`decision=project:null:manual`，
  且**不**写模型主动 allow/deny 的 `shell-judge.decision`。
- 既有 allow/deny/deny 档/tier/开关关（presenter 仍被调用）/独立超时/read-denied/标点归一/结果行幂等
  等断言保留并按新语义收紧。
- 既有 `runtime-ui.test.ts` 已知红未触碰。

真实输出（2026-10-19，本机 macOS）：

- `node --test test/桌面应用/operator-channel.test.ts` ⇒ **53 计 / 53 过 / 0 红**（改前 52/52；净增 1 例，
  另 5 个旧 manual/row-failed 用例按新行为改写）。
- `node --test "test/桌面应用/**/*.test.ts"`：
  - 第一次 ⇒ **622 计 / 620 过 / 2 红**。除已知既有 `runtime-ui.test.ts`（renderer `localStorage` 钉，
    桌面UI/渲染域）外，`acceptance-dispatch.test.ts` 的「自动验收（导入补齐）…」用例出现一次失败；
    该文件单独运行 **8/8 过**，全套第二次运行亦通过——判定为**全量并发下的既有偶发**，与本改动
    （未触碰该路径）无关。如实记录，不放宽断言。
  - 第二次 ⇒ **622 计 / 621 过 / 1 红**；唯一红＝已知既有 `test/桌面应用/runtime-ui.test.ts:69`
    「renderer 仅消费 IPC，机密为空且无持久化…」（该文件属桌面UI域，非本变更引入，按要求未触碰）。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险（如实登记）

- `manual`→deny 的审计新增字段 `manualAsDeny` 为桌面侧扩展；编排审计写入按对象整体 `JSON.stringify`，
  字段会原样落 `docs/audit/shell-gate.jsonl`，但 `ShellAuditRecord.judge` 的类型声明（编排主属）未含它。
  需要编排/PM 角色在契约层收编该字段时另行评审；未收编前旧读者忽略即可。
- `OperatorOutcome.deny.reason` 是角色侧可见理由的唯一通道（经既有 deny 工具结果）；不产生判断结果行。
  若将来要求「manual→deny 也在聊天流显示判断结果行」，需要渲染侧（桌面UI）支持新的 verdict 语义，
  本角色不单方面扩展载荷。
- 开关**关闭**时的客户手批路径保持原样（含全部 fail-closed 退路）；本次只收紧开关开启路径。
- 审计/诊断不改变编排侧 `branch`/`by`：manual→deny 仍记 `…→a-deny`、`by` 为 `operator:judge:<engine>`；
  `judge.verdict` 是通道最终处置，`modelVerdict`/`manualAsDeny` 才是「非模型主动 deny」的判据。
- 未改规则层 (c)、判断 agent verdict 语义、写门禁/写权、`src/**`、`app/renderer/**`、其他角色文件；
  未 commit。
