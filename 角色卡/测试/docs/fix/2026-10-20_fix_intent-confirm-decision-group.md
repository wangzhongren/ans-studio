---
id: intent-confirm-decision-group
type: fix
title: intent-confirm 纳入 decision 组的测试同步（测试角色）
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: verified
related: [intent-confirm, governance-judge, decision-group]
events:
  - date: "2026-10-20"
    kind: fixed
    summary: 编排把 intent-confirm 纳入 decision 组后，更新 e2e 夹具与 i/j 用例：decision 开 ⇒ 判断代批 confirm、0 客户卡、judge 证据；decision 关 ⇒ 客户手答、customer-input 证据；新增缺 confirm 选项负例（manual 自动退回、hand_off 被拒）。test/测试 788/788、全仓 3310/3308/0/2、typecheck 0。
---

# intent-confirm 纳入 decision 组：测试同步

## 结论

- 客户 2026-10-20「勾了替我决策就不用我管」：`intent-confirm` 纳入 `decision` 组，开关开启时判断 agent
  可代批 `confirm`（只代批 confirm；revise 交回客户/发起角色）。
- `test/测试` 同步完成，旧「判断 agent 永不介入需求确认卡」的假设已全部更新；未放宽任何门槛。
- `node --test "test/测试/**/*.test.ts"`：**788/788，17s**。
- 全仓 `node --test "test/**/*.test.ts"`：**3310 计 / 3308 过 / 0 红 / 2 skip，33s**。
- `npm run typecheck`：**exit 0**。

## 测试更新

### `governance-e2e-auto/fixture.ts`
- `approveReport` 新增 `intent-confirm` 分支：`verdict:"approve"`、`selected:["confirm"]`、
  可核对 evidence；不再落 generic `confirmed:true`（那会被 choice 卡防御复核判 manual）。

### `governance-e2e-auto/i-full-chain.test.ts`
- Lead 的 `intent-confirm` 不再等客户手答：`decision:true` 下判断代批 confirm，
  **0 张客户卡**；`hand_off_intent` 直接放行。
- 新增判断结果行断言：`cardKind=intent-confirm`、`group=decision`、`selected=["confirm"]`。
- 账本新增断言：`intent-confirm` 决定 `customerDecision=accepted` 且 `decisionEvidence.kind="judge"`。
- 最终界面断言改为「全部治理卡（含 intent-confirm）自动代批，0 张手动卡」；其余链路与强断言不变。

### `governance-e2e-auto/j-intent-confirm.test.ts`
重构为 4 条，覆盖开关矩阵与负例：

| 用例 | 开关 | 期望 |
| --- | --- | --- |
| decision 开 + confirm 卡 | `decision:true` | 进判断并代批 confirm；**0 客户卡**；judge 结果行 `selected=["confirm"]`；账本 `intent-confirm accepted` + `decisionEvidence.kind="judge"`；hand_off 成功、Rapporteur 收到任务 |
| decision 关 + confirm 卡 | `decision:false` | 不进判断、客户卡手答 confirm；`judgeRows=0`；账本 `customer-input` 证据；hand_off 成功 |
| decision 关 + revise | `decision:false` | 客户卡选 revise；hand_off 被拒（`尚未经客户确认`）、不投递、无交接账本 |
| decision 开 + 缺 confirm 选项 | `decision:true` | 判断 mechanical 门槛 manual ⇒ **自动退回（0 客户卡）**、`request_choice` 回执拒绝且原因可操作、hand_off 被拒、无交接账本 |

- 保留 revise 负例与新增缺 confirm 选项负例，expected 0 卡/1 卡按开关区分。
- 其余旧的 intent-confirm 断言（liaison 审计/种子账本/UI 徽标）均为数据种子或展示，不受本次语义影响，未改。

## 改动与纪律

- `test/测试/governance-e2e-auto/fixture.ts`
- `test/测试/governance-e2e-auto/i-full-chain.test.ts`
- `test/测试/governance-e2e-auto/j-intent-confirm.test.ts`
- 角色记录：`changelog.md` + 本文件。
- 未由本角色 git 提交；未读 `.env`；未打印凭据；未改产品源码；未改其他角色测试。
