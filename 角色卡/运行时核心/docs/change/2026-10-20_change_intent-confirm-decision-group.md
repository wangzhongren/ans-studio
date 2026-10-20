---
id: intent-confirm-decision-group-runtime-core
type: change
title: 同步 intent-confirm 纳入 decision 组的运行时核心旧假设
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [governance-judge, intent-confirm]
---

# `intent-confirm` 纳入 `decision` 组：运行时核心旧假设同步

## 背景（客户拍板）

客户 2026-10-20：「勾了替我决策就不用我管」——编排已把 `intent-confirm` 加入 `GOVERNANCE_CARD_GROUP` 的 `decision` 组，运行时会看到 intent-confirm 的 judge 事件。此前 2026-10-18 的口径是「需求确认卡客户本人专属、判断 agent 永不介入」，运行时核心的部分注释/测试仍钉着旧假设，本批同步（纯文案与测试，不改判定/权限）。

## 改动（均在运行时核心边界内）

1. `test/runtime-core/governance-judge.test.ts`（映射用例）
   - 用例名「六个卡种」→「七个卡种全覆盖」；键集合断言加入 `intent-confirm`。
   - `governanceCardGroup("intent-confirm")` 断言由 `undefined` 改为 **`"decision"`**；`hasOwnProperty` 断言由 false 改为 true。
   - 注释更新为 2026-10-20 新口径：判断 agent 可代批 `confirm`；`revise` 仍交回客户/发起角色（不替客户修改）。
2. `test/runtime-core/governance-flow-metadata.test.ts`
   - `request_choice` 的 intent-confirm 透传用例名由「判断分组无该卡种」改为「判断分组为 decision」，并新增 `governanceCardGroup("intent-confirm") === "decision"` 断言（confirm 可代批、revise 仍交回的归一化在编排）。
3. `src/provider/runtime/tools.ts`（约 199 行注释）
   - 删除「它不进入 `GOVERNANCE_CARD_GROUP`（判断 agent 永不代批）」，改为「2026-10-20 进入 decision 组，判断 agent 可代批 `confirm`；`revise` 仍交回客户/发起角色」。
4. `src/provider/runtime/schema.ts`（`request_choice` 描述）
   - 删除「由客户本人确认；判断 agent 永不代批（该卡不属于任何代批分组）」，改为「由客户本人回答，或在其开启『替我决策』时由判断 agent 代批 `confirm`（`revise` 仍交回客户/发起角色，判断 agent 不替客户修改）」。
5. `src/model/runtime.ts`（`GovernanceChoiceCardKind` JSDoc）
   - 删除「客户本人专属，判断 agent 永不代批」，补 2026-10-20 新口径。`GOVERNANCE_CARD_GROUP` 映射本身已由编排更新为 `"intent-confirm": "decision"`（本角色未重复改映射）。
6. 既有 approve/manual 断言未放宽；judge 工具集仍恰三只；未改 `src/common/编排/**`、`app/**`、门禁卡。

## 验证（真实输出）

- `node --test test/runtime-core/governance-judge.test.ts test/runtime-core/governance-flow-metadata.test.ts`：**21/21 过**。
- `node --test "test/runtime-core/**/*.test.ts"`：**240 计 / 239 过 / 0 红 / 1 跳过**（跳过＝boundary-write-guard Windows 条件用例）。
- `npm run typecheck`：**exit 0（0 错）**。
- 跨角色只读复跑：`node --test test/编排/governance-judge.test.ts` **68/68 过**；`node --test test/测试/governance-e2e-auto/j-intent-confirm.test.ts` **4/4 过**（decision 开 ⇒ 代批 confirm；关 ⇒ 客户手答；revise ⇒ 交接被拒；缺 confirm ⇒ manual 自动退回）。
- 未跑真实模型 / 凭据 / 网络；未 git 提交。

## 跨角色待办（旧注释/旧假设，边界外）

1. `src/pipeline/orchestration/run-role.ts:1931` 注释仍写「`intent-confirm` 需求确认卡（判断 agent 永不介入）；其它治理卡仍结构性拒绝」——属编排，需同步为新口径（decision 开时可进判断）。
2. `src/common/编排/governance-ledger.ts:58` 注释仍写「客户专属卡；判断 agent 永不代批」——属编排，需同步。
3. `test/测试/governance-e2e-auto/j-intent-confirm.test.ts:3` 文件头注释仍写「卡由客户本人回答，判断 agent 永不介入（即便两个开关都开）」；该文件 4 个用例已按新行为通过，仅头注释过时，属测试角色。
4. `test/桌面应用/operator-wiring.test.ts`、`test/门禁引擎/liaison-role.test.ts` 已按 2026-10-20 新口径（只读核对通过），无需改。

## 残余风险

- 运行时核心只提供映射与文案；intent-confirm 的 `confirm` 代批、`revise` 交回、缺 confirm 选项 ⇒ manual 的最终裁决均在编排/桌面（其测试已覆盖）。
- 若桌面徽标/文案仍写「客户专属」，以 `test/桌面应用/tool-rows.test.ts` 为准（当前为「需求确认 · 客户」徽标，属呈现标签、不表达判断唯一性），如需调整由桌面UI属主决定。
