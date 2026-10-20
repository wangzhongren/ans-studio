---
id: change_intent-confirm-auto-confirm
type: change
title: intent-confirm 在替我决策开启时可由判断 agent 代批 confirm；revise 永不代选
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: implemented
role: 门禁引擎
scope: Lead 卡 intent-confirm 工作流与需求确认段；保留 cardKind/flowId/confirm-revise 选项与 revise 重发纪律；不改判定逻辑
events:
  - date: "2026-10-20"
    kind: implemented
    summary: Lead 卡明确替我决策开启时判断 agent 可代批 intent-confirm 的 confirm（仅当复述与客户当轮要求一致）；revise 永远不由判断代选、仍交回客户/发起角色；代批不是客户逐项批准/不改写客户意图；confirm（客户或代批）后才 hand_off_intent
  - date: "2026-10-20"
    kind: verified
    summary: 门禁引擎套件 286 计 / 285 过 / 0 红 / 1 skip；本批改动文件 typecheck 无错；整仓 typecheck 因桌面/测试角色在飞文件报错 exit 1（见 §5）；未提交 git
---

# intent-confirm 可由判断 agent 代批 confirm

## 1. 客户新口径（2026-10-20）

客户 2026-10-20 新口径：勾了「替我决策」就不用客户管——`intent-confirm` 需求确认卡在 decision
开关开启时可由判断 agent 代批 `confirm`；`revise` 仍交回客户/发起角色。编排/运行时已把
intent-confirm 纳入 decision 组。

本批只在**门禁引擎**边界内同步 Lead 卡文本与测试；不改 `src/common/编排/**`、`app/**`、
`test/测试/**`。

## 2. 卡文本变更（Lead / `liaison`）

### 标准工作流第 4 步

> 意图确认卡：发 `request_choice`（`cardKind=intent-confirm`、`flowId=<intentId>`、`confirm` /
> `revise`），向客户复述目标、范围与验收标准；开关开启时判断 agent 可代批 `confirm`（仅当复述与
> 客户当轮要求一致），`revise` 永远不由判断代选；`revise` 先按反馈改文件再重发。

### 标准工作流第 5 步

> 交接：客户或判断 agent 代批 `confirm` 后调用 `hand_off_intent`，由应用在后台投递给 Draft / 提案。

### 需求确认（必须）段

> 写完意图文件后，先发 `request_choice`（`cardKind=intent-confirm`，`flowId=<intentId>`，选项固定为
> `confirm` / `revise`），向客户复述目标、范围与验收标准；客户开启「替我决策」时，判断 agent 可代批
> `confirm`（仅当复述与客户当轮要求一致）；`revise` 永远不由判断代选，仍交回客户/发起角色。客户或
> 判断 agent 代批 `confirm` 后才能调用 `hand_off_intent`；选 `revise` 时先按反馈修改意图文件，修改后
> 重新发确认卡，确认前不得交接。代批不是客户逐项批准、不改写客户意图，只是确认你复述的意图与客户
> 当轮要求一致。

### 保留

- `cardKind=intent-confirm`、`flowId=<intentId>`、选项 `confirm` / `revise` 不变。
- `revise` 先改意图文件、重新发确认卡、确认前不得交接的纪律不变。
- 既有判断代批纪律（`judge 代批`、不得声称客户本人点击/批准、代批不扩权、不改门槛）不变。
- 卡文本中不存在「需求确认卡客户本人专属/判断永不介入」的旧口径；本次只补代批 confirm 的明确语义。

## 3. 测试（真实输出）

- `node --test "test/门禁引擎/**/*.test.ts"`
  - **286 tests / 285 pass / 0 fail / 1 skipped**。
  - 更新：
    - `governance-standard-workflow.test.ts` Lead 标准工作流断言：原「客户选 confirm 后调用」
      改为「客户或判断 agent 代批 confirm 后才能调用」，并新增替我决策代批 confirm、revise 永不代选、
      代批不是客户逐项批准/不改写客户意图。
    - `governance-trio.test.ts` Lead 卡文本断言同步（新增代批 confirm/revise 永不代选/代批性质）。
    - `liaison-role.test.ts` 需求确认用例标题与断言同步。
  - 既有断言未放宽、未删除。
- `npm run typecheck`：**本批改动文件 0 错**；整仓 exit 1，错误全部在边界外（见 §5）。

## 4. 跨角色依赖（本角色边界外，未改）

1. **编排/运行时核心**：已把 intent-confirm 纳入 decision 组；需保证 decision 开关开启时判断 agent
   可对 intent-confirm 代批 `confirm`、且 `revise` 永不自动选择。
2. 代批只能确认 Lead 复述的意图与客户当轮要求一致，不得改写客户意图文件；该约束是判断 agent/
   运行时的行为，卡文本只声明。
3. 判断 agent 的 decision 回执仍需标 `judge 代批`；既有判断代批纪律不变。

## 5. 整仓 typecheck 边界外错误（如实登记）

`npm run typecheck` ⇒ exit 1。错误全部在其他角色/在飞文件，本角色改动文件（`governance-roles.ts`
与 `test/门禁引擎/**`）无错误：

- `test/桌面应用/operator-wiring.test.ts(1490,23)/(1491,23)`：`Property 'value'/'judge' does not exist
  on type '{ outcome: "declined"; ... }'`
- `test/测试/governance-e2e-auto/j-intent-confirm.test.ts(36,7)/(45,32)`：`'toolCallId' does not exist
  in type 'ToolCall'`

这两处属桌面/测试角色在飞改动，须其属主修复后方可整仓 typecheck 归零。

## 6. 残余风险

- 判断 agent 是否只在复述与客户当轮要求一致时代批 confirm，依赖运行时/判断实现；卡文本是行为约束。
- `revise` 永不代选需要 decision 组机械保证；卡文本只声明。
- 真机端到端与独立复验未进行；未提交 git。

## 7. 边界与约束

仅改 `src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-standard-workflow.test.ts`、
`test/门禁引擎/governance-trio.test.ts`、`test/门禁引擎/liaison-role.test.ts`、本文件、
`changelog.md`、`memo.md`。未碰 `src/common/编排/**`、`app/**`、`test/测试/**`、`src/provider/**`、
`src/service/**`、其他角色文件/测试、真实项目；不读 `.env`、不跑真实模型/凭据/网络；未 commit。
