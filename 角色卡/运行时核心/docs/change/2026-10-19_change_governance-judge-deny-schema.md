---
id: governance-judge-deny-schema-runtime-core
type: change
title: report_governance_judgement schema 支持 approval 组写卡 deny（退回发起角色重做）
created: "2026-10-19"
updated: "2026-10-19"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [governance-judge]
---

# `report_governance_judgement` schema 支持 approval 组写卡 `deny`

## 背景（客户要求）

客户 2026-10-19 要求：治理卡判断 agent 对 **approval 组写卡**（write / appointment-write / schedule-write）的判断可以 `deny`——当写卡内容 / 路径 / 完整性不合规时，应用把 **deny 原因退回发起角色重做**，而不是只能回落客户手动确认。`decision` 组（proposal / appointment / acceptance）仍不得 `deny`：判断 agent 不替客户拒绝。

编排正在扩展 `GovernanceJudgeOutcome` / 规范化 / prompt；本角色本批只落**运行时核心的工具 schema 与只读工具层**。

## 改动

1. `src/provider/runtime/schema.ts::describeTool("report_governance_judgement")`
   - `verdict.enum`：`["approve", "manual"]` → **`["approve", "deny", "manual"]`**。
   - `verdict.description`：`approve`＝每个 rubric 门槛满足、可以代批；`deny`＝**仅限 approval 组写卡**（write/appointment-write/schedule-write）内容/路径/完整性不合规、必须由发起角色修正后重做，且**绝不用于 decision 组**；`manual`＝判断无法完成（证据不可读、预算耗尽、读取被拒）或 decision 组无法确认。明示判断 agent **不替客户拒绝**；`deny` 需非空 reason 写明不合规点与修正方向，不需要 pathDecisions/selected/confirmed。
   - `reason.description`：由「required for approve」改为「required for approve and deny（deny 需写明不合规点与修正方向）」。
   - `selected` / `confirmed` / `pathDecisions` 字段说明补「Approve only; not needed for deny」。
   - 工具 `description` 改为三值口径，保留既有 `approve` 门槛（reason + ≥1 evidence + 实际读过必读物证）与 fail-closed 回落；`promptGuidelines` 第二条由「只做正向代批」改为「approve 可代批；deny 仅限 approval 组写卡并写清不合规点/修正方向；decision 组不得 deny，revise/reject/false/空选择/未知 id 一律 manual」；其余指引逐字保留。
   - 注释同步：approval 组写卡可 `deny`，decision 组仍只做正向代批。
   - **未改** `report_shell_judgement` 的 schema（测试钉住其枚举仍为 `allow|deny|manual`）。
2. `src/common/runtime-core/governance-judge/tools.ts`：**无代码改动**。复核模块头/处理器注释：只声明「report 只把原始参数回调、规范化/required-read/逐路径复核在编排」，无「只做正向代批」表述，与新值域不冲突；handler 仍不做值域裁决（deny 原样回调，由编排按组归一化）。
3. 测试 `test/runtime-core/governance-judge.test.ts`
   - 工具集用例的枚举断言更新为 `["approve", "deny", "manual"]`（既有 approve/manual 值断言保留，未放宽）。
   - 新增「approval 组写卡可 deny」用例：schema 接受 deny；`verdict.description` / `reason.description` 含 approval 组写卡范围、decision 组禁令、manual 覆盖读取失败、不替客户拒绝、deny 不需要 pathDecisions/selected/confirmed；`description` 与 `promptGuidelines` 均含 approval-deny 口径与 decision 组不得 deny；decision 组负向结果仍一律 manual；shell judge schema 不变。
   - 新增「原样接受 deny」用例：approval 组写卡 deny 可交回（回调收到同一份原始参数对象）；decision 组 deny 也原样回调（值域裁决不在运行时核心）。

## 验证（真实输出）

- `node --test "test/runtime-core/**/*.test.ts"`：**229 计 / 228 过 / 0 红 / 1 跳过**（跳过＝`boundary-write-guard` 的 Windows 平台条件用例，darwin 按设计 skip）。
- 单文件 `node --test test/runtime-core/governance-judge.test.ts`：**14/14 过**。
- `npm run typecheck`：**exit 0（0 错）**。
- 跨角色只读复跑：`node --test test/pi-adapter/governance-judge.test.ts` **8/8 过**；`node --test test/codex-adapter/judge-governance.test.ts` **6/6 过**；`node --test test/编排/governance-judge.test.ts` **59/59 过**（该工作树内编排已有未提交的 deny 扩展）。adapter 测试未钉治理 schema 文案/枚举，未改任何 adapter 测试。
- 未跑真实模型 / 凭据 / 网络；未 git 提交。

## 跨角色状态与待办

1. **编排（本工作树内已在飞，未提交）**：`src/common/编排/governance-judge-verdict.ts`（`NormalizedGovernanceJudgeVerdict` / `normalizeGovernanceJudgeVerdict` / `evaluateGovernanceJudgeVerdict` 已接受 deny、approval 组放行、decision 组 deny ⇒ manual）、`src/model/runtime.ts::GovernanceJudgeOutcome.verdict`（已扩为 `"approve" | "deny" | "manual"`）、`governance-judge-prompt.ts`（三值输出契约与 approval deny rubric）、`governance-judge.ts`（deny 记 `governance-judge.deny`、跳过 approve 哈希复核）与 `test/编排/governance-judge.test.ts` 均已就位，只读复跑 **59/59 过**。这些改动属编排角色，本角色未改。
2. **注释同步（属 `src/model/runtime.ts` 属主/编排）**：该文件第 167 行「判断本身仍只做正向代批（见 `GovernanceJudgeOutcome`）」与第 1036 行「判断**只做正向代批**：…一律由编排归一化 `manual`」在 deny 落地后已不准确（approval 组可 deny）；本批由编排负责该文件，本角色未动以避免冲突，建议其属主一并更新。
3. **测试属主**：`test/测试/governance-e2e-auto/**`、`test/测试/governance-judge-cards-verify/**` 的夹具目前只有 approve/manual 路径；若验收需覆盖「deny 退回发起角色重做」端到端链路，由对应测试属主扩展。

## 残余风险

- `deny` 与 `manual` 的边界依赖模型按 description/guideline 自觉区分（approval 组内容/路径/完整性不合规用 deny；证据不可读/预算/读取被拒用 manual）；编排侧按组机械裁决（decision 组 deny ⇒ manual）是最终防线，已在编排工作树中实现。
- schema 文案与编排 prompt 仍是两处文本，本次用测试分别钉住三值口径与 approval/decision 组边界，降低漂移概率。
