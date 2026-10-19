---
id: judge-risk-wording-contract-runtime-core
type: change
title: shell 判断 schema 同步系统风险口径 + 读取预算跨角色只读契约登记
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [shell-judge, shell-judge-budget-config-runtime-core, judge-read-range-runtime-core]
---

# shell 判断 schema 同步系统风险口径；读取预算契约登记

## 背景（客户定调）

客户 2026-10-19 定调：shell 判断只做**系统风险审查**（卡死 / 越界 / 破坏 / 资源 / 敏感外发），不判断业务必要性；编排已把 rubric 改为风险口径（`src/common/编排/shell-judge-prompt.ts`）。但运行时核心 `report_shell_judgement` 的 schema 参数说明、`description` 与 `promptGuidelines` 仍写「allow = necessary and safe / deny = not necessary」旧口径——模型会在同一会话同时看到新旧两套描述，判断标准漂移。

另一问题：编排 `src/common/编排/shell-judge.ts` 只读导入 `resolveShellJudgeBudget` / `ShellJudgeBudget`，把本次实际生效的读取预算注入判断提示；但 `policy.ts` 的头注释仍称「本模块不跨角色导出为公共契约」，契约处于未登记状态。

## 改动在哪（位置 → 改动）

1. `src/provider/runtime/schema.ts::describeTool("report_shell_judgement")`
   - `verdict` 参数说明改为风险口径：`allow` = 未发现系统风险（卡死 / 越界 / 破坏 / 资源 / 敏感外发）；`deny` = 存在系统风险或无法确认安全；`manual` = 缺关键证据（写明缺哪项）；明确「不判断业务必要性 / 是否理解业务；项目内非破坏性命令由发起角色决定」。
   - `description` / `promptGuidelines` 同步为中文风险口径（含完整风险词表与 fail-closed 三态语义），删除「必要且可自动放行」「不必要」等旧表述。
   - **字段名 / 枚举（allow|deny|manual）/ required / additionalProperties / 工具 handler 均未变**——纯文案变更。
2. `src/model/runtime.ts`
   - 新增 `ShellJudgeBudget`（`maxCalls` / `maxBytes` / `maxFileBytes` / `maxScanBytes`），作为中立契约**唯一定义**（与 `JudgeReadCode` / `JudgePathClass` 同一分层）。
   - 注释登记为**跨角色只读契约（2026-10-19）**：所有权＝运行时核心；编排只读导入、不得复制第二份 env/默认值解析；新增字段须可选（旧读者忽略）。
   - `ShellJudgeToolOptions.budget` 由内联形状改为 `Partial<ShellJudgeBudget>`——字段名与可选性逐字一致，旧调用不变。
3. `src/common/runtime-core/shell-judge/policy.ts`
   - 删除本地 `interface ShellJudgeBudget`，改为 `import type` + `export type { ..., ShellJudgeBudget }` **re-export 同一符号**：旧导入路径 `.../shell-judge/policy.ts` 不变，**不保留第二份定义**。
   - `resolveShellJudgeBudget` 的 JSDoc 登记为跨角色只读契约：导出路径 / 名称 / 签名冻结；语义或默认值变更须同步编排提示与本角色契约用例。
   - 模块头注释同步：除两个登记契约外，本模块只给运行时核心 judge 工具内部消费。
4. `test/runtime-core/shell-judge-risk-wording-contract.test.ts`（新增 4 例）
   - `verdict` 参数说明含 `no system risk found` / `safety cannot be confirmed` / `key evidence` / `does NOT assess business necessity`，不含 `necessary and safe` / `not necessary` / `unnecessary`；枚举与 `required` 逐字不变。
   - `description` + `promptGuidelines` 含 13 个风险口径短语（系统风险审查、卡死、越界、破坏、资源、敏感外发、未发现系统风险、存在系统风险或无法确认安全、不判断业务必要性、不要求你理解业务、项目内非破坏性命令由发起角色决定、缺关键证据、写明缺哪项证据），且全文不含「不必要」。
   - 装配后的 report 工具与 `describeTool` 的 `description` / `promptGuidelines` / `inputSchema` 逐字一致（文案单一来源，模型不会同时看到两套）。
   - 预算契约可从编排既有导入路径（`policy.ts`）与中立契约家（`model/runtime.ts`）互相赋值（类型同一性）；缺省 / 显式 / env 优先级可观测；缺省表冻结。
   - **既有断言未放宽**；未修改任何既有测试。

## 以前怎样 → 现在怎样（触发场景）

- **以前**：判断模型在会话里同时看到编排 rubric（系统风险）与工具 schema（业务必要性）两套口径，可能因「看不出必要」而 deny / manual，与客户定调冲突。
- **现在**：工具 schema 与编排 rubric 同口径；项目内非破坏性命令即使看起来「多余」，无系统风险即 `allow`；有风险或无法确认安全 `deny`；缺关键证据 `manual` 且写明缺哪项。
- **契约**：`resolveShellJudgeBudget` / `ShellJudgeBudget` 有明确所有权与冻结面；编排无需改导入，也不会出现第二份解析。

## 验证（真实输出）

- `node --test "test/runtime-core/**/*.test.ts"`：**227 计 / 226 过 / 0 红 / 1 跳过**（跳过＝`boundary-write-guard` 的 Windows 平台条件用例，darwin 按设计 skip）。
- `npm run typecheck`：**exit 0（0 错）**。
- 跨角色只读复跑：`node --test test/编排/shell-judge.test.ts test/编排/shell-judge-risk-scope.test.ts test/编排/shell-judge-read-discipline.test.ts`：**53/53 过**（0 红、0 跳过）。
- 未跑真实模型 / 凭据 / 网络；未 git 提交。

## 跨角色影响

- 编排 `src/common/编排/shell-judge.ts` **未改**：导入路径 / 符号名不变，现有导入继续可用。其第 49–52 行注释「policy.ts 注释称本模块不跨角色导出为公共契约——待运行时核心登记」现已过时；建议编排属主改为「已登记跨角色只读契约（2026-10-19）」。
- `ShellJudgeBudget` 定义上移到 `src/model/runtime.ts`（中立契约家），`policy.ts` re-export 同一符号——任何从 `policy.ts` 导入的既有代码零改动；后续读者也可直接从 `model/runtime.ts` 导入，类型同一。
- `ShellJudgeToolOptions.budget` 类型由内联形状改为 `Partial<ShellJudgeBudget>`：字段名 / 可选性逐字一致，调用方无感（编排 `createShellJudge` 的 `budget?: Partial<ShellJudgeBudget>` 亦不变）。
- 三适配器 / 桌面 / 门禁不读取该 schema 文案做逻辑判断；文案变更不影响工具行为（运行时核心 227 例与编排 53 例为证）。

## 残余风险

- schema 文案与编排 rubric 仍是两处文本，新增风险类别时需两处同步（编排 rubric 属编排属主）；本次用测试分别钉住风险词表与禁用旧词，降低漂移概率。
- `manual` 的判定仍依赖模型自觉；编排侧 fail-closed 与「`allow` 必须无损」检查未变。
