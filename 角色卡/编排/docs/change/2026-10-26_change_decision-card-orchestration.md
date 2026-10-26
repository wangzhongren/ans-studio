---
id: decision-card-orchestration
type: change
title: decision 卡（material-choice）编排分类与账本，判断 agent 合法 decision 分支
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: implemented-unverified
related: [decision-card, judge-governance-cards-review, acceptance-triage, proof-gate-reviews]
events:
  - date: "2026-10-26"
    kind: implemented
    summary: 编排接入 decision 卡（仅统筹可发）分类/账本；判断 agent 补合法 decision 分支（按唯一推荐项代批+审计）。定向与全量 test/编排 已跑；桌面接线/e2e/独立验收未做。
---

# 变更记录：decision 卡（material-choice）编排分类与账本

- 角色：编排
- 日期：2026-10-26
- 状态：**implemented-unverified**（编排面实现与定向/全量测试已跑；桌面 UI/系统行、跨角色 e2e、独立验收未做，不代表通过）
- 来源：
  - 客户 2026-10-26 规则（经主控任务转达，PM 设计登记
    `角色卡/项目管理/docs/design/2026-10-26_design_decision-card.md`，`rules-only`）：主理发现材料性选择
    不得自定，交统筹发 `request_choice(cardKind="decision")`；卡内恰一个推荐项；开启「替我决策」时默认
    推荐；decision 卡独立于提案/任命/验收，不是客户批准，不触发 gate/验收。
  - 运行时核心交付：`GovernanceChoiceCardKind` 增 `"decision"`、`GOVERNANCE_CARD_GROUP.decision="decision"`、
    `CustomerInputOption.recommended?: boolean`、`request_choice` 枚举放宽（本角色未改 model/provider）。
  - 协调补遗（2026-10-26，任务中）：`governance-judge-verdict` 缺 `case "decision"` 会把合法卡回落
    `manual`（未知卡种）；`governance-judge-evidence` 物证分支未覆盖——本批一并补齐。
- 写集（实际只改以下文件）：
  - `src/pipeline/orchestration/run-role.ts`
  - `src/common/编排/decision-card.ts`（**新增**：decision 卡结构校验单一共享实现）
  - `src/common/编排/governance-ledger.ts`
  - `src/common/编排/governance-judge-verdict.ts`
  - `src/common/编排/governance-judge-facts.ts`（仅 `requiredArtifactPaths` 增 decision 分支）
  - `src/common/编排/governance-judge-evidence.ts`（证据包 options 透传 `recommended`；注释口径）
  - `src/common/编排/governance-judge-prompt.ts`（卡面 options 透传 `recommended`；decision rubric）
  - `test/编排/decision-card.test.ts`（**新增**，19 例）
  - 本记录、`changelog.md`、`feature-map.md`、`api-spec.md`、`memo.md`
- **未改** `src/model/**`、`src/provider/**`、`app/**`、`src/common/门禁引擎/**`、共享 i18n、其他角色资料；
  未 commit/push、未重启应用、未碰 `demos/`。

## 一、编排分类与白名单（`run-role.ts`）

- `TRIO_CARD_KINDS.convener` 增 `"decision"`：**仅统筹（Steward/Convener）**可发；Lead（liaison）仍只有
  `intent-confirm`，rapporteur/nominator/verifier 均不含 `decision`；越权在触达客户通道之前
  `declined`（既有白名单文案 `/不允许 cardKind=decision/`），不弹卡、不写账本。
- `classifyCustomerDecision(cardKind, out, optionIds?)` 新增 `case "decision"`：
  - **恰好选中一个卡上选项**（`selected.length === 1` 且 id ∈ 本卡 `options`）⇒
    `{ decisionKind: "material-choice", customerDecision: "accepted", selectedOptions: [选中项] }`；
  - 多选 / 空选 / 未知选项 ⇒ `unclassified/none`（fail-closed；客户可重选/重发卡）；
  - **不产生 `targetRoleIds`**（不伪装成任命）、不进入 proposal-*/acceptance 语义；选中项同时出现在
    tool 回执/会话（`CustomerInputOutcome.value.selected`）。
- `recordCustomerDecision`：decision 卡与其它治理卡同路径写 `customer.decision`（仅 flowId 合法时）；
  `power` = 发起角色职能（Convener → `schedule`），`decisionEvidence.kind = "customer-input"`。
- `ledgerEntrySignature` 纳入 `selectedOptions`：会话内“本地已作出但未落盘”的合并去重不吞掉不同的
  材料性选择。
- `judgeArtifactsForCard` 增 `case "decision": return {}`：decision 卡不挂 proposal/团队计划/flow 物证，
  避免借用其它卡种物证制造额外门槛。
- **默认兜底安全缺口（协调 2026-10-26 抓出，本批修复）**：`hasRecommendedOption(req)` 在 choice 默认
  逻辑**之前**识别任一 `recommended:true`——带推荐项的卡**不得**被默认成 appointment（Convener 的
  `looksLikeAppointmentChoice` 会把任意非保留选项 id 当任命形状）。缺 `cardKind` 的 decision 形状卡
  在编排层直接 `declined + notPresented:true`（诊断 `governance.card.rejected{reasonCode:"missing-card-kind"}`），
  不触达客户、不写账本（CLI 通道同样 fail-closed）；与桌面 `evaluateDecisionCardRequest` 的
  `missing-card-kind` 同向。无 `recommended` 的原有 appointment 默认**零回归**（测试钉住）。
- decision 必须显式携带 `cardKind`，不猜。

## 二、账本（`governance-ledger.ts`）

- `GovernanceDecisionKind` 增 `"material-choice"`（注释明确：**不是**提案/任命/验收决定；
  `PROPOSAL_DECISION_KINDS`/`ACCEPTED_DECISION_KINDS`、`latestAcceptanceDecision`、任命写入门、flow 的
  `CUSTOMER_DECISION_KIND_REFS` 均不读/不接受它；只作审计）。
- `GovernanceLedgerEntry.selectedOptions?: string[]`（**新增可选字段**；仅
  `customer.decision{decisionKind:"material-choice"}` 携带）：客户选中的选项 id。**不是** `targetRoleIds`
  （不伪装成任命），不是写盘 `paths`；任何门禁/验收/收口判定都不读。旧条目/旧读取方零变化。
- 账本写入校验不新增枚举校验（现状 `decisionKind` 不做值域校验）；未知字段原样保留的既有兼容性不变。

## 三、判断 agent（「替我决策」）合法 decision 分支

- `governance-judge-verdict.ts`：approve 机械门槛 switch 增 `case "decision"`（此前落 `default` 的
  `unknown → manual/group-mismatch`）：
  - 必须是 choice 卡；**恰有一个** `recommended:true` 选项；`selected` 必须**恰为该推荐项 id**；
  - 推荐项缺失/多个、选中非推荐项/多选 ⇒ `manual`（`insufficient-evidence` / `not-recommended`，可操作返工）；
  - 不读 `packet.intent`、不要求提案/任命/验收事实、无 gate/验收门槛；deny 仍按 decision 组规则转 `manual`；
  - approve 结果照既有 `governanceJudgeAuditFromOutcome` 留审计（group/cardKind/selected/reasonCode）。
- `governance-judge-facts.ts::requiredArtifactPaths` 增 `case "decision" => { paths: [], missing: false }`
  （此前落 default `missing:true`，会把合法卡误判 `artifact-missing`）。
- `governance-judge-evidence.ts`：证据包 `requesterStatement.options` 透传 `recommended:true`（判断可见
  唯一推荐项；旧卡种无该字段 ⇒ 包体与旧版逐字一致）；`isDecisionCardKind` 注释明确新 decision 卡**不读
  意图文件**；证据包 integrity.note 注明该例外。
- `governance-judge-prompt.ts`：卡片视图 options 透传 `recommended`；系统提示新增 decision 逐卡 rubric
  （只能按唯一推荐项代批、不得发明/改选；独立于意图/gate/验收），并同步「intent-confirm / decision 不要求
  packet.intent」的通用门槛说明。
- **推荐项默认由桌面策略处理**（`app/desktop/customer-input.ts::tryAutoSelectDecision`，桌面属主）：
  编排/判断只在被调用时按卡内唯一推荐项正向代批并留审计，不补默认值、不代选其它选项。

## 四、不影响提案/任命/验收/gate（机械保证）

- 前文三处集合/读取点均按 `decisionKind` 精确匹配：`material-choice` 不满足写流程门/任命写入门，
  `latestAcceptanceDecision` 只认 `"acceptance"` ⇒ `none`；`flow-state` 的
  `CUSTOMER_DECISION_KIND_REFS` 不含 `material-choice` ⇒ 不能充当 flow 步骤的 `customer-decision` 证据。
- 与既有提案接受并存时后者照常生效（门禁只取 proposal-* 四类）；测试覆盖。
- decision 卡选择**不是客户批准**：`customerDecision:"accepted"` 只是账本结算值；无任何门禁/验收路径读取
  `material-choice`。

## 五、独立验收修复（F1/F2，2026-10-26）

独立验收将 decision 卡判为 needs-work，本批修复两项（最终验证见 §八）：

### F1（高）：未呈现的卡不得落账

- 缺口：桌面 fail-closed（`outcome:"declined"` + `notPresented:true`）后，`recordCustomerDecision`
  仍写 `customer.decision{decisionKind:"unclassified", customerDecision:"none"}`；`hasUnresolvedDecision`
  扫全账本 ⇒ flow 永久无法收尾/最终验收。
- 修复：`recordCustomerDecision` 在 `declined && notPresented === true` 时**直接返回**（不写账本），
  与 judge 退回 / system 预授权拒绝同口径——「无呈现 = 无决定」。
- **复验收口（可观测性）**：该早退位于 **`system:` 写盘预授权分支之后**——`operatorId="system:write-preauthorization"`
  的拒绝仍先记 `governance.preauthorization.declined` 诊断（账本/行为不变）；普通非法 decision 卡仍零账本
  且不挡 `evaluateFlowCompletion`。
- 测试：桌面 fail-closed 模拟（合法卡 + raw 返回 declined/notPresented）→ 零账本；最小
  acceptance-pending flow 的 `evaluateFlowCompletion` 仍 `ready:true`（无未结算决定）。非法卡
  （缺/多推荐）同样零账本、不挡收尾门。`system:` 预授权拒绝的 `governance.preauthorization.declined`
  诊断用临时诊断目录读取 JSONL 钉住。

### F2（中）：结构校验单一共享实现

- 缺口：decision 结构校验只在桌面；编排/CLI raw 通道（`createCliCustomerInput`、single su、项目角色）
  仍可能把缺推荐项/缺 flowId 的卡送到客户，single su 也能发。
- 新增 `src/common/编排/decision-card.ts::validateDecisionCardRequest(input)`（纯函数，不读盘）：
  卡种解析（`request.cardKind ?? metadata.cardKind`；非 decision ⇒ `applicable:false`）；
  **仅 trio convener**；choice；合法 flowId；≥2 选项；id 非空唯一；**恰一个** `recommended:true`。
  返回 `{ok:true, applicable, flowId?, recommendedOptionId?}` 或 `{ok:false, reasonCode, detail}`
  （机器码：`role-not-allowed` / `not-choice` / `missing-flow-id` / `not-enough-options` /
  `invalid-option-id` / `duplicate-option-id` / `recommended-count`）。
- `run-role.ts::governedInput` 在触达 raw 客户通道**之前**调用；失败 ⇒ `declined + notPresented:true`
  （不调 raw、不写账本、不带 operatorId）。覆盖 CLI/single/项目角色（它们没有桌面卡校验）。
- 经 Pipeline 公共出口 `src/pipeline/orchestration/run-role.ts` **再导出**（`validateDecisionCardRequest`
  + `DECISION_CARD_MIN_OPTIONS` + `DecisionCardRejectReason`/`DecisionCardValidation`），供桌面窗口后续
  复用（不得复制第二份）。
- 测试：校验函数正反例表；convener 缺 flowId 拒绝；single/su 与项目角色拒发、客户通道零调用、
  零账本；合法 convener 卡正常。

## 六、测试（`test/编排/decision-card.test.ts`，新增 19 例）

1. 统筹恰好选一个卡上选项 → `customer.decision{material-choice, accepted, selectedOptions}`、
   `power=schedule`、`decisionEvidence.kind=customer-input`、无 `targetRoleIds`；
2. Lead/rapporteur/nominator/verifier 发 decision ⇒ `declined`（文案含 `不允许 cardKind=decision`）、
   客户通道零调用、账本零写入；Lead 白名单未放宽；
3. **默认兜底安全缺口**：convener 缺 `cardKind` + 含 `recommended:true` ⇒ `declined + notPresented`、
   不默认 appointment、客户通道零调用、账本零写入；
4. **零回归**：convener 缺 `cardKind` 且无 `recommended` ⇒ 仍默认 appointment 并写任命账本
   （`targetRoleIds` 正确、无 `selectedOptions`）；
5. 多选/空选/未知选项 ⇒ `unclassified/none`，不记 `selectedOptions`；
6. `material-choice` 不满足 write-flow / write-role-card 门；不覆盖既有 proposal-accept；
7. 不进入 `latestAcceptanceDecision`（none）；可按 `material-choice` 读回；不能充当 flow 的
   `customer-decision` 证据（`parseFlowStateYaml` 拒绝 ref）；
8. 旧卡种对照：material-choice 与 proposal-accept/appointment 并存时按 kind 各自读回；
9. 账本向后兼容：旧条目无 `selectedOptions` 读取零变化；
10. 判断 agent：decision 卡 approve 按唯一推荐项、审计 group/cardKind/selected；选非推荐项/多选 ⇒
    `manual/not-recommended`；deny ⇒ `manual`（不替客户拒绝）；
11. 判断 agent：推荐项缺失/多个 ⇒ `manual/insufficient-evidence`；
12. 证据包：decision 卡无意图/物证要求（`requiredArtifactPaths` 非 missing）、`requiredReadPaths=[]`、
    推荐项标记进入证据包与提示；系统提示含 decision rubric；
13. F1：桌面 fail-closed（`declined + notPresented`）→ 零账本；最小 acceptance-pending flow 的
    `evaluateFlowCompletion` 仍 `ready:true`；
14. F1/F2：非法 decision 卡（缺/多推荐，flowId 合法）→ 不触达客户、零账本、不挡收尾门；
15. F2：`validateDecisionCardRequest` 正反例（角色/卡形/flowId/选项 id/唯一推荐项）；
16. F2：convener 缺 flowId、single/su 与项目角色发 decision 卡 → 不触达客户、零账本；
17. F1 复验收口：`system:write-preauthorization` 拒绝仍记 `governance.preauthorization.declined`
    诊断（早退不吞），且不写客户决定。

既有 `governance-judge`/`governance-session`/`governance-gate`/`decision-evidence-packet` 断言未弱化。

## 七、偏差、风险与待裁决

1. **与 `rules-only` 设计原文的字面冲突（如实登记）**：设计/变更记录第 4 条写「选择结果仅记录材料性选择，
   **不写 `customer.decision`**」。本次主控任务明确要求 `GovernanceDecisionKind` 增 `"material-choice"`
   并落账；运行时核心/桌面同批代码也按「编排写
   `customer.decision{decisionKind:"material-choice", selectedOptions:[…]}`（审计，门禁不读）」约定。
   本批按任务要求实现为**审计留痕**，并以集合/读取点机械保证它不满足任何门禁/验收、不是客户批准。
   若独立验收按设计原文机械核对「账本不得出现 `customer.decision`」，需客户/治理裁决（可改为独立审计
   kind 或不落账本），本记录不宣称符合该字面条款。
2. **推荐项唯一性校验不在本层**：运行时核心只透传 `recommended`（不校验个数）；唯一性由桌面
   （`tryAutoSelectDecision` 前的卡校验，`noRecommended`/`invalid` fail-closed）与判断 verdict 分支
   （恰一个 recommended，否则 manual）共同保证。编排 `customerInput` 包装器不重复校验卡面结构。
3. **无 flowId 的 decision 卡不入账**：与其它治理卡一致（`recordCustomerDecision` 仅 flowId 合法时写）；
   选择仍在 tool 回执/会话中。
4. **`unclassified/none` 是 fail-closed**：多选/空选/未知选项会以未结算决定形态留痕（与其它治理卡
   非法作答同口径），可能挡住该 flow 的收口门，直至客户重选/重发；未新增豁免。
5. **判断 agent 的默认推荐执行在桌面**：本层只提供合法分支与审计；真实 Electron 卡面/默认选中/系统行、
   跨角色 e2e 未验证。

## 八、验证（2026-10-26，win32 / Node v24.22.1）

- `node --test "test/编排/decision-card.test.ts"` → **19 tests / 19 pass / 0 fail**。
- `node --test "test/编排/**/*.test.ts"` → **1004 tests / 1002 pass / 1 fail / 1 skip**；唯一红＝既有
  Windows symlink `shell-authorized-routine.test.ts:103` 创建链接 `EPERM`（基线一致，本批未触碰）。
- 定向桌面只读：`node --test "test/桌面应用/operator-wiring.test.ts"` → **73/73**。
- `npm run typecheck` → **exit 0**（本批期间桌面角色并行编辑 `app/desktop/customer-input.ts` 曾出现
  2 条临时错误——其 `tryAutoSelectDecision` 直接读 `entry.request.options` 未收窄 choice；该角色收口后
  复跑通过。本批未改 `app/**`）。
- 定性：`governance-judge`/`governance-session`/`governance-gate`/`decision-evidence-packet` 四套件
  169/169。
- 未做：桌面卡面/默认推荐/系统行/重启恢复、**桌面改用共享 `validateDecisionCardRequest`**（本批只经
  Pipeline 出口再导出，未改 `app/**`）、跨角色 e2e、真实 Electron、**修复后的再次独立验收**、commit/push。
