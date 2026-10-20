---
id: intent-confirm-decision-group
type: change
title: intent-confirm 纳入 decision 组——桌面旧假设与测试同步（判断可代批 confirm，revise 仍交回客户）
created: "2026-10-20"
status: implemented
---

# intent-confirm 纳入 decision 组（桌面同步）

## 背景

客户 2026-10-20「勾了替我决策就不用我管」：编排已把 `intent-confirm`（Lead 在 `hand_off_intent` 前的
需求确认卡）纳入 `decision` 组（单一映射来源 `src/model/runtime.ts::GOVERNANCE_CARD_GROUP`），判断 agent
在开关开启时可代批 `confirm`；`revise` 仍交回客户/发起角色。桌面窗口侧没有逻辑改动（分组判据、判断
通道、结算路径均为既有实现），但**旧注释与旧测试仍按「客户专属卡、判断永不介入」假设**，需同步。

## 改动（桌面边界内）

### 1. `app/desktop/session.ts`（仅注释）

- Liaison `customerInput` 注入段注释改为：「`intent-confirm` 需求确认卡——**客户决策卡**；『替我决策』
  开关开启时判断 agent 可代批 `confirm`，`revise` 仍交回客户」。
- 其余注入判据/能力面未改。

### 2. `test/桌面应用/operator-wiring.test.ts`

「intent-confirm：客户专属需求确认卡不调用判断 agent…」用例按新口径重写为三段：

1. **开关开启（decision）**：判断 agent 被调用（`group=decision`、`cardKind=intent-confirm`）；approve
   `confirm` ⇒ 自动作答（`answered`、`selected:["confirm"]`、`operatorId:"judge:<engine>"`、judge 审计），
   **零客户卡**、结果行按既有 judge approve 路径恰一条（`selected`/`group` 如实）。
2. **开关关闭**：不调用判断、原卡照旧呈现；客户手答 `confirm`、`revise` 与取消三条路径都原样结算
   （`revise` 不被代选；取消＝declined，不伪造同意）。
3. **判断 manual**（无法核对/偏离）：沿用 2026-10-19 客户总原则——**不呈现客户卡、自动退回发起角色
   重做**（declined + 可操作原因）；不发 approve 结果行、无 judge 审计、`value` 为空（**不伪造客户同意**）。

既有判断/卡片断言未放宽；`tool-rows.test.ts` 只测展示，未改。

## 测试与证据（真实输出）

- `node --test "test/桌面应用/operator-wiring.test.ts"` ⇒ **49/49 过**
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **654 计 / 654 过 / 0 红**（16.8s）
- `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` ⇒ **33/33 过**（e2e 侧已含
  「decision 开 ⇒ intent-confirm 进判断并代批 confirm（0 客户卡）」「decision 关 ⇒ 客户卡手答」
  「decision 关 + revise ⇒ hand_off 被拒」「decision 开 + 缺 confirm 选项 ⇒ manual 自动退回」四例）
- `npm run typecheck` ⇒ **exit 0（0 错）**

## 残余风险

- 判断 `manual` 对 decision 组（含 intent-confirm）仍是「自动退回重做、不呈现客户卡」——这是
  2026-10-19 客户总原则的既有语义，本次未改变；仅「判断期间客户关闭开关（switch-off）」例外呈现原卡
  + 提示。若客户希望 intent-confirm 的 manual 必须回到人工卡，需另行拍板改通道语义。
- `revise` 只能由客户手答（判断被编排 verdict 限制为只能代批 `confirm`）；Lead 收到 revise 后按既有
  流程改意图文件并重发确认卡。
