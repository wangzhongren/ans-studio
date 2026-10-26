---
id: decision-card-contract-change
type: change
title: "材料性选择卡（cardKind=decision）Model/Provider 契约"
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: implemented-unverified
related: [runtime-core]
events:
  - date: "2026-10-26"
    kind: implemented
    summary: 客户要求新增 decision（材料性选择）卡：GovernanceChoiceCardKind 增 decision、GOVERNANCE_CARD_GROUP 增 decision→decision、CustomerInputOption 增可选 recommended；request_choice schema 的 cardKind enum 增 decision、options 项增 recommended boolean；工具层透传 recommended 不代选；新增 request-choice-decision-card.test.ts 5 例；runtime-core 全目录 334 计/327 过/3 既有 Windows symlink 红/4 skip（较基线 +5 计 +5 过零新红）；npm run typecheck exit 0
---

# 材料性选择卡（`cardKind=decision`）Model/Provider 契约

**状态分开写**：已实现（下列改动路径全部落盘）；已验证（本机 Windows 上的新增测试、runtime-core 全目录回归与 `npm run typecheck`，见「验证」）；**未验证**（角色白名单、判断 agent 默认选推荐项、桌面呈现/交互、编排与桌面注入、真实模型端到端、独立验收）。

依据：客户 2026-10-26 要求——**主理发现材料性选择时不自己定**，交统筹（Steward）发 `request_choice(cardKind="decision")`；卡内有一个推荐项；客户开启「替我决策」时判断 agent 默认选推荐项；decision 卡**独立于提案/任命/验收**，不触发门禁/验收。本任务范围只有运行时核心的 Model/Provider 契约、工具、schema、测试与本角色文档；应用侧（角色白名单、判断/桌面/编排接线）不在本轮写集。

## 以前怎样、现在怎样

**以前**：`request_choice` 只有 `proposal` / `appointment` / `acceptance` / `intent-confirm` 四种治理卡种；普通选择卡没有「推荐项」概念，材料性选择只能作为无治理语义的普通卡片发出。

**现在**：

- `src/model/runtime.ts`：
  - `GovernanceChoiceCardKind` 增加 `"decision"`（材料性选择卡；主理不自行决定，交统筹发卡）；
  - `GOVERNANCE_CARD_GROUP` 增加 `decision: "decision"`——只表达「替我决策」开关分组，**不表达权限**；
  - `CustomerInputOption` 增加可选 `recommended?: boolean`。类型层只提供字段；「decision 卡恰有一个推荐项」等校验在应用/角色侧完成，本层不代选、不补默认值。
- `src/provider/runtime/schema.ts`：`request_choice` 的 `options` 项增加可选 `recommended: boolean`；`cardKind` enum 增加 `"decision"`；字段说明与工具描述/指引写明：
  - **仅统筹（Steward）使用**，用于材料性选择（演示/验收证据方式、范围、标准/契约偏离、成本或客户可见行为）；
  - 卡内必须有**恰一个** `recommended: true` 推荐项；
  - 开启「替我决策」时判断 agent 默认选推荐项；
  - decision 卡**独立于提案/任命/验收**：不等于验收/客户批准，**不触发门禁/验收**；`pass` 选项不适用（不设）；
  - 原有卡种（`proposal`/`appointment`/`acceptance`/`intent-confirm`）与其他工具语义不变。
- `src/provider/runtime/tools.ts`：`request_choice` 的 `CHOICE_CARD_KINDS` 增加 `decision`；`readOptions` 保留每项的 `recommended` 布尔字段并原样并入 `CustomerInputRequest.options`——**不代选、不补 `recommended:false`、不校验推荐项个数**（卡种语义在应用/角色侧）；`recommended` 为非布尔值时按 options 非法在**触达客户通道之前**拒绝（不猜测、不静默丢弃）；未知卡种仍由工具层拒绝且不触达客户通道。

## 行为与纪律

| 项 | 契约 |
| --- | --- |
| `cardKind` 枚举 | `proposal` / `appointment` / `acceptance` / `intent-confirm` / `decision`（原有顺序与取值不变，只在末尾新增） |
| 推荐项 | `options[].recommended?: boolean`；decision 卡**恰有一个** `recommended: true`，校验在应用/角色侧；工具层只透传 |
| 开关分组 | `governanceCardGroup("decision") === "decision"`；组只表达「替我决策」开关由判断 agent 代批，不表达权限 |
| 独立性 | decision 卡**不触发门禁/验收**，不是提案/任命/验收，不等于客户批准；客户/判断未明确选择 → 不据此写盘、不代选 |
| 回执 | 既有 `request_choice` 回执语义逐字不变；判断代批仍标注「替我决策/代决策，不是客户本人点击」；judge 退回走通用文案，不套用验收返工路由 |
| 未知卡种 | 工具层拒绝（`cardKind` 非法）且不向客户发卡；不猜成 `decision`，也不落入任何开关分组 |

## 改动路径（位置 → 改动）

| 文件 | 改动 |
| --- | --- |
| `src/model/runtime.ts` | `GovernanceChoiceCardKind` 增 `decision`；`GOVERNANCE_CARD_GROUP` 增 `decision: "decision"`；`CustomerInputOption` 增可选 `recommended?: boolean`；仅注释/类型扩展，无行为实现。 |
| `src/provider/runtime/schema.ts` | `request_choice`：options 项增 `recommended` boolean；cardKind enum 增 `decision`；描述与 promptGuidelines 钉如上纪律；其余卡种/工具未改。 |
| `src/provider/runtime/tools.ts` | `CHOICE_CARD_KINDS` 增 `decision`；`readOptions` 透传合法 `recommended` 布尔值并拒绝非法类型；不新增第二份卡种映射，不做推荐项数量校验。 |
| `test/runtime-core/request-choice-decision-card.test.ts` | 新增 5 例：schema enum/字段形状、schema 文案钉点、`recommended` 原样透传（不补默认）、判断代批/退回回执（不套验收返工）、原有卡种零回归＋非法 `recommended`/未知卡种前置拒绝且不触达客户通道。 |
| `test/runtime-core/governance-flow-metadata.test.ts` | 更新 `request_choice` cardKind enum 断言（末尾新增 `decision`）；其余断言不变。 |
| `test/runtime-core/governance-judge.test.ts` | 分组映射断言更新为八个卡种，新增 `decision → decision`。 |
| `角色卡/运行时核心/docs/feature/runtime-core.md` | 记录 decision 卡行为与接线状态。 |
| `角色卡/运行时核心/feature-map.md` | 新增功能导航行与证据链接。 |
| `角色卡/运行时核心/memo.md` | 追加本轮实施摘要。 |

## 明确不做 / 未覆盖（跨角色缺口）

1. **角色白名单未接线**：本层不硬编码角色 id；「仅统筹可发 decision 卡」需编排/门禁引擎的角色→允许卡种守卫落地。当前 Provider 只按卡种白名单放行，任何注入了 `customerInput` 的会话都能调用 `request_choice(cardKind="decision")`（与 `proposal`/`appointment` 等既有卡种同风险面）。
2. **判断 agent 默认选推荐项未实现**：本层只提供 `recommended` 字段与 `decision` 组映射；编排 `governance-judge*` / 桌面判断流程需在「替我决策」开启时读取推荐项并默认选中，且必须校验恰有一个推荐项。
3. **独立于门禁/验收由消费方保证**：运行时核心不触发任何门禁/验收；编排账本/flow 步骤与桌面卡种路由需确保 decision 卡不写验收决定、不推进 gate、不触发返工。
4. **桌面呈现未接线**：推荐项标记、卡内单选/复选与「替我决策」默认选的 UI 呈现属桌面窗口角色。
5. **i18n 未改**（本轮不涉及）；未跑真实模型/端到端，未做独立验收；本机为 Windows 11。

## 验证（本机，2026-10-26）

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0，0 错 |
| 新增文件 `node --test test/runtime-core/request-choice-decision-card.test.ts` | **5/5 通过**，exit 0 |
| `node --test "test/runtime-core/**/*.test.ts"` | **334 计 / 327 过 / 3 红 / 4 skip**；3 红均为既有 Windows symlink EPERM（`file-write-safety` D3 ×1、`session-store` ×2），与改动前基线 **329 计 / 322 过 / 3 红 / 4 skip** 相比 +5 计 +5 过、零新红 |

## 风险与后续

- **推荐项校验不在本层**：工具层接受「零个/多个 recommended」的 decision 卡（只拒绝非布尔类型），若应用/角色侧漏校验，「替我决策」可能无推荐可选或产生歧义——消费方必须 fail-closed。
- **未知卡种拒绝在 Provider**：编排若未来放宽或另行校验，需保持单一来源（`GovernanceChoiceCardKind` + `CHOICE_CARD_KINDS`），不要复制第二张卡种表。
- **端到端未验**：`request_choice` 的 decision 卡当前可被 Provider 接受并透传，但角色白名单、判断默认推荐、桌面呈现与账本/flow 语义均待其他角色接线后由独立验收补齐。
