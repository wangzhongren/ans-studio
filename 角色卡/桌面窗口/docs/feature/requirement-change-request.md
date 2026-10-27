# 需求变更申请（`request_requirement_change`，桌面侧）

**状态**：窗口单元/集成验证通过（待独立验收）。实现记录见
[2026-10-26 变更记录](../change/2026-10-26_change_requirement-change-desktop.md)；契约与工具由运行时核心/编排
批次提供，工程规则见 `角色卡/项目管理/docs/project-rules.md` §二.15。

## 用途

Draft / 提案（报告员 Rapporteur）或 Steward / 统筹（convener）在起草/核证时发现需要**新的客户授权 /
范围**（或约束、成本变化），**不得**把未获授权的诉求写进提案卡「顺带获批」；应调用运行时工具
`request_requirement_change` 发起需求变更申请。应用经**发起方会话的客户卡通道**呈现
`request_choice(cardKind="decision")` 审批卡：审批人＝客户（未勾选「替我决策」）或独立判断 agent
（勾选时默认选唯一推荐项）；**发起方不得自批**。批准后应用把「已批准需求变更执行任务」交给主理——
主理**不审批**，只按批准范围更新 `docs/intents/**` 并用 `hand_off_intent` 通知 Draft 依据新意图修订提案；
拒绝/未获明确结果则回执发起方。**申请 ≠ 批准**：提交申请、卡片已呈现都不解锁任何门禁。

## 当前流程

```text
统筹 / 提案 发现需要新授权/范围
        │
        ├─ ✗ 写进提案卡 / 自行扩写提案 / 自行批准或代选
        │
        └─ request_requirement_change（运行时工具，仅统筹/提案注入）
                 │  载荷：flowId? / intentId?（至少一个）、changeKind、summary、rationale、
                 │        impact?、proposedIntentPatch?
                 ▼
        桌面应用侧能力（app/desktop/interface.ts）
                 │
                 ├─ 载荷二次校验 + 发起方白名单 + 意图/流程存在性 ──✗──▶ invalid / rejected /
                 │        intent-not-found / flow-not-found（零票据、零卡、零投递）
                 ├─ 同一 flow 已有 requested/dispatched/approved 票据 ──▶ already-dispatched
                 ├─ 原子写 .ans/governance/requirement-changes/<flowId>/<requestId>.json
                 │   （requirement-change-request/v2；先 requested）
                 ├─ 经发起方会话客户卡通道呈现 decision 审批卡
                 │   （approve 推荐 / reject，恰一个 recommended=approve，带 flowId；
                 │    角色/结构校验复用共享 validateDecisionCardRequest；presenter 成功后 onPresented）
                 ├─ 已呈现 ⇒ 票据 dispatched + requestId + 发起方聊天流系统行
                 │   （工具回执：已提交独立审批，**不是批准**）
                 └─ 未呈现/通道不可用 ⇒ 票据 failed + unavailable/rejected（不谎称已提交）
                          │
                          ▼
客户 / 判断 agent 在 decision 卡上作答（发起方不得作答）
        │
        ├─ approve ─▶ 票据 approved + 发起方系统行
        │              └─ 已批准执行任务 → 主理（有界投递；忙则入队）
        │                   主理：核验审批证据 → 更新 docs/intents/** → hand_off_intent 通知 Draft 修订
        │
        └─ reject / 取消 / 超时 / 通道不可用 ─▶ 票据 rejected/failed + 回执发起方
                        （主理不审批、不执行、不接收原始申请任务）
```

## 关键规则

- **注入面**：仅统筹（`governanceFunction === "schedule"`）与提案（`"proposal"`）会话注入；其他内置治理
  角色、项目角色、single/su 不注入（能力缺席 = 工具不注册 = 结构性 fail-closed）。
- **审批人不是主理**：客户（未勾选「替我决策」）或独立判断 agent（勾选时确定性默认选推荐项，标
  `judge 代批`）；发起方不得自批/代选；主理不审批、不接收原始申请任务。
- **稳定幂等**：`requestId` 为申请内容（含发起角色）的 SHA-256 前 16 hex；同一请求重试使用同一票据 id
  与同一 `ans-app-task:` 主理执行任务投递键。同一 flow 已有 `requested`/`dispatched`/`approved` 票据
  ⇒ `already-dispatched`。
- **票据**：应用自有 `.ans` 审计记录（原子写，schema v2）；不写治理账本、不写 `customer.decision`。
  `submission`（卡提交事实）/`approval`（审批结果与来源）/`leadDispatch`（执行任务投递）三段留痕。
- **有界**：主理执行任务打开/投递各受阶段预算限制（缺省 20s，总 60s）；超时/失败如实记
  `leadDispatch.error` + 可见系统行，不谎称已交接；主理忙时入队（`queued:true`）仍成功。
- **失败如实**：非法/不存在/非白名单 ⇒ `invalid` / `flow-not-found` / `intent-not-found` / `rejected`
  （未提交）；卡通道不可用/未呈现 ⇒ `unavailable`（或卡校验拒发时 `rejected`），票据 `failed`，
  不声称已提交；审批未获明确结果 ⇒ 票据 `failed`，不冒充客户拒绝。

## 代码位置

| 模块 | 位置 | 职责 |
| --- | --- | --- |
| 纯逻辑 | `app/desktop/requirement-change.ts` | 载荷二次校验、稳定 requestId、票据路径与形状、审批卡与已批准执行任务文本 |
| 应用侧能力 | `app/desktop/interface.ts::requestRequirementChangeForProject` | 白名单/存在性/去重、票据 IO、审批卡通道、审批结算、主理执行任务、系统行/回执 |
| 会话注入 + 卡通道 | `app/desktop/session.ts`（`canInitiateRequirementChange` 分支） | 仅统筹/提案注入；`requestRequirementChangeDecision` 绑定发起方会话客户卡上下文 |
| 发卡前校验 | `app/desktop/customer-input.ts::evaluateDecisionCardRequest` | 复用共享 `validateDecisionCardRequest`（统筹/提案在其角色白名单内）；`onPresented` 区分已呈现/未呈现 |
| 测试 | `test/桌面应用/acceptance-dispatch.test.ts`、`operator-wiring.test.ts` | 校验/卡形状/批准→执行/拒绝回执/幂等/失败重试/忙时入队/统筹发起/注入矩阵；可信路径与真实通道 |

## 演变

- 2026-10-26：客户要求新增；项目管理批次先冻结共享 i18n 与工程法案规则；运行时核心/编排批次提供契约
  `RequestRequirementChangeInput/Result/Fn`、运行时工具与报告员注入收口；本批实现桌面应用侧能力并接线。
- 2026-10-26（客户纠正）：需求变更**不由主理审批**——审批改由客户/判断 agent 在发起方（统筹/提案）会话
  的 `decision` 卡上完成；主理只在批准后执行意图变更；工具回执 `dispatched` 语义改为「已提交独立审批，
  不是批准」；票据升级 v2；本文件与实现同步更新。
