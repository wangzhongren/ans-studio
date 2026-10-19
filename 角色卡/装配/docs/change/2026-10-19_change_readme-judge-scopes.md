---
id: readme-judge-scopes-20261019
type: change
title: README 补充两类判断 agent 的审查边界
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: verified
related: []
events:
  - date: "2026-10-19"
    kind: verified
    summary: README 补充 shell/决策判断 agent 定位与读取预算 fail-closed；装配测试 82/82，仅文档改动
---

# README 补充两类判断 agent 的审查边界

客户 2026-10-19 定调：

- **shell 判断 agent** 只做系统风险审查（卡死、越界、破坏、资源、敏感外发），不判断业务必要性；项目内非破坏性命令由发起角色自行决定。
- **决策判断 agent**（「替我决策」）只判断是否偏离客户已确认的意图（目标、范围、非目标、验收标准、已接受决定），不重复审工程质量、架构与测试；这些由 Proof 在验收阶段核对。
- 读取预算仍 fail-closed，预算/证据不足转手动，不猜测；预算可经环境变量配置。

本任务只改装配所属的 [README](../../../../README.md)，不修改任何代码、提示词或行为。

## README 改动

在 `## 角色协作怎样约束修改` 小节：

1. **新增第 77 行条目「两类判断 agent 各审各的」**：
   - 「替我审批」的 shell 判断 agent 只审系统风险——卡死、越界、破坏、资源、敏感外发，不判断业务必要性；项目内非破坏性命令由发起角色自行决定。
   - 「替我决策」的决策判断 agent 只审意图漂移——目标、范围、非目标、验收标准与客户已接受的决定，不重复审工程质量、架构与测试；这些由 Proof 在验收阶段核对。
2. **第 78 行「判断 agent 只读」尾部补充读取预算口径**：读取预算仍 fail-closed（硬上限可经环境变量调整）；预算不足、证据不足、风险不明或意图缺失时一律转手动确认，不猜测。
3. 第 75–76 行及其他段落逐字未动（第 76 行已有「证据不足、读取被拒或判断失败时回落手动确认」，与新条目一致）。

## 只读核对依据

- `src/common/编排/shell-judge-prompt.ts`（工作树未提交改动，属编排写区）：第 33–36 行定位注释明确「只审**系统风险**，不审业务必要性；业务正确性、命令是否必要、测试是否合理由发起角色自己负责」；第 45 行「机器安全、卡死、越界、并发/数据完整性、端口/资源冲突」五类与 README 措辞对应；第 56–58 行明确项目内非破坏性命令由发起角色决定、不得因「看不懂业务」拦截。
- `src/common/runtime-core/shell-judge/policy.ts` 第 166–168、216–235 行：`ANS_SHELL_JUDGE_MAX_CALLS` / `ANS_SHELL_JUDGE_MAX_BYTES` / `ANS_SHELL_JUDGE_MAX_FILE_BYTES` 可调读取预算，仍受 `SHELL_JUDGE_BUDGET_LIMITS` 上下限约束；非法值回落缺省（不是夹取），保持 fail-closed 可预测。
- `app/renderer/ui-labels.js` 第 258–261、348–349 行与 `app/desktop/session.ts` 第 363/614/1870 行：双开关文案与判断闭包口径——「替我审批」覆盖 shell 命令与写盘/写卡确认，「替我决策」覆盖提案接受、任命、验收，与 README 第 76 行一致（该文件属桌面窗口写区，本角色只读核对）。

## 待收口差异（跨角色，如实上报）

`src/common/编排/governance-judge-prompt.ts` 当前工作树仍保留「架构门槛」逐卡 rubric（第 74、79–86 行：提案卡须含架构方案/架构影响分析章节片段，缺失 ⇒ manual），并要求 goal/scope/acceptance 明确、与意图一致、不扩大范围。前半部分与客户本次「决策判断 agent 不重复审架构/质量/测试，由 Proof 在验收阶段核对」的定调存在差异；后半部分与意图漂移方向一致。该文件属编排写区，本角色未改，交编排/治理侧按新定调收口。

## 测试同步

`test/装配/` 无钉 README 文案的用例：以「判断 agent / 需求确认卡 / 替我审批 / 替我决策 / 系统风险 / 意图漂移」检索零命中；`release-packaging.test.ts` 只把 `README.md` 当作发布 overlay 的排除路径夹具（断言私有/文档文件不入包），不读取或断言正文。按任务要求不新增测试。

## 验证

- `node --test "test/装配/**/*.test.ts"` → **82 计 / 82 过 / 0 红 / 0 跳过**（工作树含他人未提交改动；本改动为纯文档）。
- `git diff --check -- README.md` → 通过（退出 0）。
- 未跑全仓测试与 typecheck（仅 README 文档改动，不触代码）；未读 `.env`、未发真实模型/网络请求；未 git 提交。
