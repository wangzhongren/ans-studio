---
id: judge-auto-rework
type: change
title: 勾选开关后判断 agent 全权处置——deny/manual 自动退回发起角色重做，不再呈现客户卡
created: "2026-10-19"
status: implemented
---

# 判断 agent deny/manual 自动退回重做

## 客户总原则（原话）

> 我勾选了替我决策就不用我来管了。

对应开关（`approval` / `decision`）开启且判断 agent **实际运行后**：`approve` 代批照旧；`deny` 与
`manual` 都不再把卡甩回客户，而是**自动退回发起角色**（`declined` + 可操作原因），由角色按原因修正后
重新提交确认。只有「判断期间客户关闭开关（switch-off）」例外——客户已选择手动，呈现原卡；本轮已中止
（aborted）沿用既有取消/丢弃语义。开关从未开启时 `planJudge` 本就不调用 judge，原卡照旧。

## 改动（`app/desktop/customer-input.ts`）

### 1. deny（仅 approval 组）

- 不呈现客户卡、不发 approve 结果行、不写客户决定账本；
- `settleEntry(..., { outcome: "declined", operatorId: "judge:<engine>", reason }, "judging")`；
- 原因：`自动审批拒绝：<reasonCode/reason 人话>。本次自动判断未通过/未完成，已拒绝；请按上述原因修正后重新提交确认。`
- 诊断 `governance-judge.deny`（`requestId/group/cardKind/reasonCode/reason`；审计字段 `decision:"deny"`、
  `outcome:"deny"` 保留「模型裁决=deny」事实，不伪装成客户操作）。
- decision 组 deny（编排会回落 manual）：防御性按 manual 语义（同样自动退回重做）。

### 2. manual（判断已运行但未能代批）

- 同样**不呈现客户卡**，`declined` + 原因：
  - decision 组：`自动决策未通过：<人话>。本次自动判断未通过/未完成，已拒绝；请按上述原因修正后重新提交确认。`
  - approval 组：`自动审批未通过：…`
- 人话映射：复用 `judgeHumanReason`（`read-denied` 带出具体路径）；driver 给出的具体 `reason` 以括注保留
  （如 `证据不足（写卡缺少边界声明）`）。基础设施类（timeout/unavailable/parse-failed/row-failed/
  group-mismatch/not-recommended/ledger-unavailable/evidence-hash-mismatch/model-manual/
  insufficient-evidence/intent-* 等）也一律给出可操作原因，**不静默、不伪造同意**。
- 诊断 `governance-judge.manual-as-rework`（含 `reasonCode/reason`；`decision:"manual-as-rework"`、
  `outcome:"manual"` 保留模型裁决事实）。
- 应用事实不可用（`judgeContext.unavailableReason`，如账本不可读）：判断未运行但开关已开 ⇒ 同样自动
  `declined`（`治理事实不可读` + 具体 detail），不呈现原卡（不再浪费模型调用）。

### 3. 例外（仍呈现原卡）

- **switch-off**：判断期间客户关闭对应开关 ⇒ 原卡 + `judgeNotice`（`你已关闭对应开关…已转你手动确认`）。
- **aborted**：取消监听按既有语义结算 `unavailable`；迟到结果丢弃，不呈现、不结算。
- 开关从未开启 / 无 `cardKind` / single 模型：`planJudge` 不判断，原卡路径逐字不变。

### 4. 不写账本 / 不伪造同意

deny/manual-as-rework 不是客户接受或拒绝决定：不写 `customer.decision`，不写 `decisionEvidence`；
`declined` 让发起角色的 `request_confirmation` 收到原因并在**同一轮**修正重发。若角色轮次已结束，
由同批落地的[写卡后推进检查](2026-10-19_change_post-write-advance.md) / 后续 settle 检查继续（不要求
客户再发消息）。

## 跨角色对齐（只读核实）

- 编排 `src/pipeline/orchestration/run-role.ts` 已在写 `customer.decision` 前过滤「`declined` 且
  `operatorId` 以 `judge:` 开头」——本批 deny/manual-as-rework 的 `declined` 不会污染账本，也不会被
  记为客户决定（与第 4 节口径一致）。
- 门禁引擎侧已有「declined 后按 reason 修正重发」的角色纪律文档，与本通道的退回原因配套。
- `src/model/runtime.ts::GovernanceJudgeOutcome` 已扩为 `approve|deny|manual`（`deny` 仅 approval 组）；
  其 `manual` 注释仍写「交客户手动确认」，与客户 2026-10-19 总原则下的桌面处置（自动退回重做）不同步，
  建议由模型/编排属主更新注释口径（桌面按客户最新决定执行，不改契约形状）。

## 测试（`test/桌面应用/operator-wiring.test.ts`，49/49）

按新口径更新既有「manual ⇒ 原卡 + judgeNotice」断言，并新增/钉住：

- deny（approval）：不呈现卡、无结果行、`declined` + 具体原因；客户事后作答按终态拒绝。
- deny（decision，防御）：自动退回重做（不回落客户卡）。
- manual 两组（decision/approval）：`declined` + 人话原因（含具体 reason 括注）、无卡/无结果行/无下一步；
  重复结算不重复回投。
- `read-denied`：退回原因仍带出具体路径、无记录兜底、超长仍限 200 码点。
- row-failed / timeout / 事实不可用：自动退回重做（不再呈现客户卡）。
- 按组互不影响：approval manual 自动退回，decision approve 仍代批。
- switch-off 例外：判断期间关闭开关 ⇒ 原卡 + `switch-off` 提示（既有测试保留）。
- 判断状态机：judging 占位/replay/迟到结果语义不变；manual 结算后队列下一张照常呈现。

真实输出（2026-10-19，本机 macOS，Node v24.14.0）：

- `node --test "test/桌面应用/operator-wiring.test.ts"` ⇒ **49 计 / 49 过 / 0 红**。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **640 计 / 640 过 / 0 红**。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险

- shell judge 通道（`operator-channel.ts`）不在本客户口径内，未改；其 manual 仍走原卡路径。
- 自动退回依赖角色模型按 reason 修正后重发；若模型反复提交同样内容，会形成「拒绝→重发」循环——
  应用不自动放行、也不替角色改写内容（这是治理正确性优先）。角色轮次结束时由写卡后检查兜底继续。
- 人话映射覆盖已知 reasonCode；未知 code 回退 driver `reason` 原文（仍带统一的可操作尾句）。
- `judgeNotice` UI 能力保留（switch-off 例外使用），渲染侧无行为改动。
