---
id: change_lead-internal-decisions
type: change
title: Lead 内部工程/协调选择不得发 request_choice 问客户，只能发 intent-confirm
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: implemented
role: 门禁引擎
scope: Lead / liaison 卡新增内部决策纪律；不改判定逻辑、卡片白名单与既有权力
events:
  - date: "2026-10-20"
    kind: implemented
    summary: Lead 卡新增「内部决策纪律（必须）」——契约措辞/实现细节/排期等内部工程/协调选择不得发 request_choice 问客户；Lead 只能发 intent-confirm；内部决策自行决定或用 dispatch_task 派 Steward/项目角色并用 flow 工具记录；不得包装成客户决定或另发 request_choice
  - date: "2026-10-20"
    kind: verified
    summary: 门禁引擎套件 287 计 / 286 过 / 0 红 / 1 skip；npm run typecheck exit 0；未提交 git
---

# Lead 内部决策不得发 request_choice 问客户

## 1. 客户新要求

客户新要求：Lead 的**内部工程/协调选择**（契约措辞、实现细节、排期等）不许发 `request_choice`
问客户；只有 `intent-confirm` 需求确认卡可发（开关开启时判断 agent 可代批 `confirm`）。内部决策由
Lead 自行决定，或用 `dispatch_task` 派 Steward / 项目角色，并用 flow 工具记录。

本批只在**门禁引擎**边界内补 Lead 卡纪律与测试；不改其他角色/产品代码。

## 2. 卡文本变更（Lead / `liaison`）

在「治理卡参数纪律」段后新增：

> **内部决策纪律（必须）**：契约措辞、实现细节、排期等内部工程/协调选择**不得发 `request_choice`
> 问客户**——Lead 只能发 `intent-confirm` 需求确认卡；内部决策由你自行决定，或用 `dispatch_task`
> 派给 Steward / 项目角色，并用 flow 工具记录。不得把内部选择包装成客户决定或另发 `request_choice`。

### 保留

- 既有「每次 `request_choice` 必须带 `flowId` + `cardKind`（只用 `intent-confirm`）」不变。
- `intent-confirm` 代批新口径（开关开启时判断 agent 可代批 `confirm`，`revise` 永不代选）不变。
- Lead 工作流管理权力（flow 工具 + dispatch_task）、不拥有最终批准权、写边界/禁写均不变。

## 3. 测试（真实输出）

- `node --test "test/门禁引擎/**/*.test.ts"`
  - **287 tests / 286 pass / 0 fail / 1 skipped**。
  - `governance-standard-workflow.test.ts` Lead 工作流管理者用例新增断言：内部决策纪律、
    不得发 `request_choice` 问客户、只能发 `intent-confirm`、自行决定/`dispatch_task` 派发/flow 工具
    记录、不得包装成客户决定或另发 `request_choice`。
  - 既有断言未放宽、未删除。
- `npm run typecheck` ⇒ **exit 0**。

## 4. 跨角色依赖（本角色边界外，未改）

1. **编排/判断 agent**：Lead 的 `request_choice` 白名单仍只允许 `intent-confirm`；若 Lead 试图用
   其他 cardKind 询问内部选择，应按无效治理调用回落手动（既有参数纪律）。
2. **dispatch_task / flow 工具**：Lead 内部决策用 `dispatch_task` 派 Steward/项目角色并用 flow 工具
   记录，仍需遵守既有目标校验、证据与 revision 服务端校验。
3. 卡文本是行为约束；「内部选择 vs 客户决定」的语义判断依赖模型与判断 agent，无独立机械检查。

## 5. 残余风险

- 模型是否把内部选择误发成 `request_choice` 依赖遵从；cardKind 白名单可机械拒绝非 intent-confirm。
- `dispatch_task` 目标校验与 flow 工具证据/revision 校验在运行时；卡文本不实现。
- 真机端到端与独立复验未进行；未提交 git。

## 6. 边界与约束

仅改 `src/common/门禁引擎/governance-roles.ts`、
`test/门禁引擎/governance-standard-workflow.test.ts`、本文件、`changelog.md`、`memo.md`。
未碰其他角色/产品代码、`src/common/编排/**`、`app/**`、`test/测试/**`、`src/provider/**`、
`src/service/**`、真实项目；不读 `.env`、不跑真实模型/凭据/网络；未 commit。
