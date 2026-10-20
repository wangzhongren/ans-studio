# 2026-10-20 变更：choice 卡缺 `cardKind` 按角色兜底（Lead intent-confirm 可代批）

- 日期：2026-10-20
- 角色：编排
- 来源：真机（新 bookmank 轮）op-1 需求确认卡没有 judge 事件：Lead 的 `request_choice`（intent-confirm）没带 `cardKind`，`governedInput` 只对 confirm 卡默认，choice 卡直接呈现客户。客户要求「勾了替我决策就不用我管」。
- 范围：`src/pipeline/orchestration/run-role.ts`、`src/model/runtime.ts`（共享映射）、`src/common/编排/governance-judge{,-facts,-verdict,-prompt}.ts`、`test/编排/**`、本角色文档；未改 `app/**`、`src/provider/**`、门禁卡；未 git 提交。

## 1. choice 卡角色默认（`run-role.ts::governedInput`）

在 confirm 默认旁新增：`isTrio && req.kind === "choice" && cardKind === undefined` 时按内置治理角色默认（仅当该 kind 在该角色 `TRIO_CARD_KINDS` 白名单内）：

| 角色 | 默认 cardKind | 选项形状守卫 |
| --- | --- | --- |
| Liaison（Lead） | `intent-confirm` | 必须含 `confirm` |
| Rapporteur | `proposal` | 必须含 `accept` |
| Nominator | `appointment` | 不额外限定（选项为角色 id） |
| Verifier | `acceptance` | 必须含 `accept` |
| Convener | 不默认 | — |
| 其他/项目角色 | 不默认 | — |

- 选项形状守卫避免把「普通选择卡」（如 Lead 的「怎么调整」选项 A）误兜底为治理决定卡，保持旧行为。
- 兜底值同时写入传给桌面的 request 与 metadata；继续走 `TRIO_CARD_KINDS` 白名单、preview 完整性、`computeJudgeContext`、judge、账本。
- 诊断 `governance.cardKind.defaulted`（`kind:"choice"`；confirm 默认补 `kind:"confirm"`）。显式 cardKind 优先；显式非法仍拒绝。

### 1.1 Liaison 通用 choice 门控（2026-10-20 真机新增）

真机又出现 Lead 的 `request_choice`「小决定：契约与提案的 3 处措辞差异如何收口」（keep-v1/do-v2/lead-decide，无 confirm）直接呈现客户。客户要求「内部工程/协调选择不要问我」。在 choice 默认之后、白名单/发卡之前增加确定性门控：

- `isTrio && req.kind === "choice" && roleId === "liaison"`：
  - `cardKind === undefined` 且选项不含 `confirm` ⇒ `{outcome:"declined", reason:"这是内部协调/工程决策，不应要求客户选择；请 Lead 自行决定，或用 dispatch_task 派给 Steward/项目角色，并用 flow_step_update 记录。客户只处理 intent-confirm 需求确认。"}`；
  - 显式 `cardKind === "intent-confirm"` 但选项缺 `confirm` ⇒ `{outcome:"declined", reason:"intent-confirm 必须有 confirm/revise 选项；本卡缺少 confirm 选项，未向客户呈现。请补齐选项后重试。"}`；
  - 不发卡、不调判断、不写 `customer.decision`；诊断 `governance.choice.rejected{roleId,reason,optionIds}`。
- 选项含 `confirm` 的 Liaison choice 仍按现有默认 `intent-confirm` + 判断；显式非法 cardKind 仍走白名单拒绝；其他角色/项目角色零变化。

## 2. `intent-confirm` 纳入 decision 组（`src/model/runtime.ts`）

- `GOVERNANCE_CARD_GROUP` 增加 `"intent-confirm": "decision"`。
- **推翻 2026-10-18 的「需求确认卡判断 agent 永不介入」口径**（该卡当时故意缺席映射）；2026-10-20 客户新要求「勾了替我决策就不用我管」为准。
- `governanceCardGroup("intent-confirm")` 现返回 `"decision"`；桌面 `planJudge` 可正常生成 judge 事件。

## 3. 证据/裁决/提示（`governance-judge*`）

- `governance-judge-facts.ts::requiredArtifactPaths`：`intent-confirm` ⇒ `{paths:[], missing:false}`（卡本身是意图基准，不要求独立 intent 文件/物证）。
- `governance-judge-verdict.ts`：
  - 新增 `intent-confirm` 分支：卡片必须是 choice 且含 `confirm` 选项；`selected` 恰为 `["confirm"]` ⇒ approve；选 `revise`/多选 ⇒ `manual/not-recommended`；缺 confirm 选项 ⇒ `manual/insufficient-evidence`。
  - `isConfirm` 改为仅 `write`/`appointment-write`/`schedule-write`（此前 intent-confirm 会被误判为 confirm 卡，返回 `confirmed:true` 而非 `selected`）。
- `governance-judge-prompt.ts`：
  - 新增 `intent-confirm` rubric：Lead 的意图摘要（goal/scope/acceptance/非目标）与客户当前要求一致 ⇒ `confirm`；偏离/无法核对 ⇒ manual + 可操作返工说明；`revise` 交回客户/发起角色。
  - 通用 approve 门槛第 6 条改为只对 proposal/appointment/acceptance 要求 `packet.intent`；intent-confirm 不要求。

## 4. 测试与验证（真实输出）

- 新增 `run-role：治理 choice 卡缺 cardKind ⇒ 按角色兜底并生成 judgeContext（Lead=intent-confirm）`：Liaison/Rapporteur/Nominator/Verifier 各自默认；Convener/项目角色不兜底；request/metadata 都带 cardKind，judgeContext 生成。
- 新增 `intent-confirm：decision 组可代批 confirm；选 revise/缺 confirm 回落 manual`：`governanceCardGroup("intent-confirm")="decision"`；approve selected ["confirm"]；revise ⇒ not-recommended；缺 confirm 选项 ⇒ insufficient-evidence。
- 既有「无 cardKind 的普通客户选择/确认不写治理账本」回归保持：Lead 的普通 choice（选项 A）因选项形状守卫不兜底，仍不写账本。
- 新增 Liaison 通用 choice（keep-v1/do-v2/lead-decide，无 confirm）⇒ declined、客户通道零调用、reason 含「内部协调/工程决策」+ dispatch_task + flow_step_update、无 customer.decision。
- 新增显式 intent-confirm 缺 confirm ⇒ declined（reason 含「intent-confirm 必须有 confirm/revise 选项」）；其他角色通用 choice（无匹配选项）仍直接到客户通道、无 judgeContext。
- `node --test "test/编排/**/*.test.ts"` → **699 tests / 699 pass / 0 fail / 0 skipped**
- `npm run typecheck` → **exit 0**（全仓）

## 5. 跨角色（重要）

1. **运行时核心测试**：`test/runtime-core/governance-judge.test.ts:48-64` 仍钉「映射不含 intent-confirm / `governanceCardGroup("intent-confirm")===undefined`」，本批改共享映射后该测试会红（实测失败：actual 含 `intent-confirm`、expected 不含）。需其属主更新为「intent-confirm → decision」。
2. **运行时核心注释**：`src/provider/runtime/tools.ts:200` 仍写「intent-confirm 不进入 GOVERNANCE_CARD_GROUP（判断 agent 永不代批）」，需同步。
3. **门禁引擎角色卡**：Lead 的需求确认卡文案若仍写「客户本人专属/判断 agent 永不代批」，需按 2026-10-20 客户要求更新（本批未改门禁卡）。
4. **桌面窗口**：`planJudge` 现在会对 `intent-confirm` 得到 decision 组；开关开启时 approve ⇒ answered（selected confirm + judge 审计），manual ⇒ declined+返工原因（沿前批 manual 处置）。

## 6. 残余

- choice 默认带**选项形状守卫**：Liaison 必须有 confirm、Rapporteur/Verifier 必须有 accept；不满足则保持旧行为（不猜）。因此「普通选择卡」不会被误判。
- `intent-confirm` 判断基于卡片 title/preview/detail + 客户当前轮文本；不要求独立意图文件（卡本身是意图基准）。
- `revise` 永远不由判断 agent 代选（交回客户/发起角色）。
- 直接写 flow YAML 路径、`idempotencyKey` 等前批残余不变。
