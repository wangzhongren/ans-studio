# 桌面窗口：decision 卡应用侧校验与「替我决策」默认推荐

- 日期：2026-10-26
- 角色：桌面窗口
- 依据：客户 2026-10-26 新要求——主理收到**材料性选择**时不自行决定，交统筹（Steward/convener）发 `request_choice(cardKind="decision")`；卡内恰有一个 `recommended: true` 推荐项；开启「替我决策」时判断 agent 默认选推荐项；decision 卡独立于提案/任命/验收，不写客户决定、不触发 gate/验收。设计/契约见 `角色卡/项目管理/docs/design/2026-10-26_design_decision-card.md`、i18n 变更 `2026-10-26_change_decision-card.md`；编排分类见 `src/pipeline/orchestration/run-role.ts` 的 `material-choice`。
- 状态：实现完成，typecheck 0 错、桌面套件 669/669 通过；**未独立验收、未运行真实 Electron e2e、未 commit/push、未重启应用**（代码改动下次启动生效）。

## 一、范围与写集

只改本角色边界内文件：

- `app/desktop/customer-input.ts`：decision 卡发卡前校验（`evaluateDecisionCardRequest`）、「替我决策」确定性默认推荐（`tryAutoSelectDecision`）、decision 结果行/system line、`planJudge` 对 decision 卡的确定性收口；
- `test/桌面应用/operator-wiring.test.ts`：decision 卡校验矩阵、默认推荐、开关关闭/异常回落、非 decision 卡零回归（新增 6 例，全套 71/71）；
- 本角色 changelog / feature-map / api-spec / docs/change。

未改：`src/model/runtime.ts`、`src/provider/runtime/**`、`src/pipeline/orchestration/**`、`src/common/编排/**`、`src/common/门禁引擎/**`、i18n 目录、`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`demos/**`。decision 卡种、`options[].recommended`、`GOVERNANCE_CARD_GROUP.decision`、`material-choice` 账本分类与 9 个 i18n key 均来自其他角色在本工作树的在飞改动（本批只消费）。

## 二、发卡前校验（fail-closed，触达 presenter / 判断 agent / 排队之前）

`customer-input.ts::evaluateDecisionCardRequest({ request, roleId, governanceModel, metadata })` 返回 `allow | ignore | reject`。**结构判定单一来源＝编排 `src/common/编排/decision-card.ts::validateDecisionCardRequest`**（经 Pipeline 公共出口 `src/pipeline/orchestration/run-role.ts` 只读导入，含 `DECISION_CARD_MIN_OPTIONS`/`DecisionCardRejectReason`/`DecisionCardValidation`）；桌面不复制选项数/id/推荐项/flowId/角色校验，只保留 notPresented/文案/operator 映射、`applicable:false ⇒ ignore`、共享 `detail` 组文案，以及桌面特有的「缺 cardKind」防线。有效规则：

| 条件（共享/桌面） | 结论 |
| --- | --- |
| `cardKind="decision"` 且不是 trio convener（含 liaison/rapporteur/nominator/verifier/su/项目角色/空 id，或 `governanceModel≠trio`） | **拒发卡**（共享 `role-not-allowed`） |
| decision 卡不是 `kind:"choice"` | 拒发卡（共享 `not-choice`） |
| `flowId` 缺失/非 slug（`GOVERNANCE_SLUG_PATTERN`；`request.flowId` 或 metadata 透传） | 拒发卡（共享 `missing-flow-id`） |
| 选项少于 `DECISION_CARD_MIN_OPTIONS`（2）个 | 拒发卡（共享 `not-enough-options`） |
| 选项 `id` 缺失/非字符串/空白、或重复 | 拒发卡（共享 `invalid-option-id`/`duplicate-option-id`） |
| `recommended: true` 数量 ≠ 1（0 个或多个） | 拒发卡（共享 `recommended-count`） |
| 内置治理角色发出「有 `recommended: true`、但完全没有 `cardKind`」的 choice 卡 | 拒发卡（桌面特有 `missing-card-kind`；共享函数对缺 cardKind 返回 not-applicable；编排 trio 路径已有同向守卫） |
| 共享返回 `applicable:false`（非 decision 卡：显式其它 cardKind、项目角色/无 cardKind 的普通 choice） | **忽略该字段**（`ignore`；旧卡零行为变化） |

拒绝一律返回 `{ outcome:"declined", reason, notPresented:true }`：卡片**从未呈现**，不调用 presenter、不占「一项目一卡」、不写账本、不带 `operatorId`（不冒充客户拒绝、不冒充 judge）。原因文案按共享 `reasonCode` 选 `main.decisionCard.invalid` / `main.decisionCard.noRecommended`，`{detail}` 直接使用共享函数的有界 `detail`（测试逐项断言原因码与 detail 一致），i18n 硬编码守卫零新增中文。

请求对象**原样透传**给 presenter：`options[].recommended` 不被重建/丢弃（测试逐字断言）。

## 三、「替我决策」确定性默认推荐（不调用模型）

`presentEntryNow` 先调 `tryAutoSelectDecision(entry)`；全部条件满足才代选：

1. 发卡前校验已通过（`ChannelEntry.decisionCard` 定格 `flowId` + 唯一推荐项 id，呈现/代选只读该快照）；
2. 主进程权威开关 `opts.judge.isGroupEnabled("decision")` 为开；
3. 会话信号未中止；
4. 会话有可用运行时（`ctx.runtime ?? metadata.runtime`）作为审计引擎；
5. 推荐项仍在卡上选项内；
6. `emitJudgeResult` 已注入且投达成功（结果行是 judge 代批的**可见性条件**）。

满足 ⇒ 直接结算 `answered{ selected:[推荐项] }`：

- `operatorId = "judge:<engine>"`、`judge = { group:"decision", cardKind:"decision", engine, reasonCode:"recommended-default", selected:[推荐项] }`——**judge 代批，不是客户本人**；不呈现客户卡、不写 `judging` 状态、不调 `createGovernanceJudge`/模型；
- 发一条结果行 `session:operator-judge`（`group=decision`、`cardKind=decision`、`selected`），`judgeResultSummary` 生成「judge 代批 · 代决策（自动代理）…不是客户本人选择」+ `main.decisionCard.notApproval`（决策卡不是验收、不是客户批准，也不构成验收/提案/任命决定，不触发 gate/验收）；
- `settleEntry` 的 `notifyNextStep` 对 `cardKind="decision"` 推导为 `null`：**不产生 proposal/appointment/acceptance 下一步**、不触发 gate/验收；验收分诊前闸只对 `cardKind="acceptance"`，decision 卡不进入。

任一条件不满足/异常（开关关闭、结果行通道缺失/投递抛错、运行时缺失、推荐项被改写、会话中止）⇒ 返回 false，走**既有客户卡路径**（`presentNow`）交客户手动选择——绝不擅自代选、绝不半截 approve、不把异常伪装成客户同意。`planJudge` 对 decision 卡显式返回 `undefined`：**decision 卡永不交给模型 judge**（确定性优先；未代选时客户手选）。

## 四、结果分类/账本（编排侧，本批只保证 outcome 形状）

桌面把 decision 卡结算为 `answered` + 恰好一个卡上选项 id + （代选时）`judge` 审计；编排 `recordCustomerDecision` 据此写：

- `customer.decision{ decisionKind:"material-choice", customerDecision:"accepted", selectedOptions:[选中项], power=<发起角色职能> }`；
- `decisionEvidence.kind`：judge 代选为 `"judge"`（附有界审计），客户手选为 `"customer-input"`；
- **不写** `acceptance`/`proposal-*`/`appointment`/`targetRoleIds`；`material-choice` 不被 `PROPOSAL_DECISION_KINDS`/`ACCEPTED_DECISION_KINDS`、`latestAcceptanceDecision`、flow 的 `customer-decision` 证据枚举识别；不触发 gate/验收。

桌面测试断言：`deriveGovernanceNextStep(decision 卡, outcome) === null`、`onNextStep` 零调用、验收分诊零调用、outcome 的 `cardKind/group` 均为 `decision`（不冒充 acceptance/proposal/appointment）。

## 五、取舍与残余风险（如实登记）

1. **客户手选系统行未新增 IPC**：`main.decisionCard.selectedRecommended` / `selectedOther` 仍未被产品代码引用（PM i18n 变更记录已标注「待接线」）。本批不新增通道/不改 `app/main.ts`，客户手选的可见性由既有 `request_choice` tool 回执（「客户已选择…」）与卡面 `ui.decisionCard.notApprovalBadge` 承担；judge 代选已有 `session:operator-judge` 结果行。若需主进程另发一条客户手选系统行，需跨角色同步一条新回调/通道。
2. **convener 缺 cardKind 的 decision 形状卡可能被编排先默认成 appointment**：编排 `defaultGovernanceChoiceCardKind` 对 convener 的非保留选项 choice 卡会默认 `appointment`，发生在桌面校验之前；若主理/统筹漏传 `cardKind`，桌面看到的是默认后的 `appointment`（此时 `recommended` 按「非 decision 卡忽略」处理）。这是编排默认逻辑的跨角色风险，需编排属主在默认前识别 `options[].recommended`（或收紧 convener 默认）。桌面在能看到「无 cardKind + recommended」时已 fail-closed。
3. **无推荐项直接拒发卡**：任务项 2 提到「无推荐项 ⇒ 按既有客户卡/判断 manual 路径」，任务项 1 又要求「缺推荐项 ⇒ 拒发卡」；本实现按更严格的项 1：decision 卡结构不合法即 `notPresented`，不呈现一张缺推荐项的 decision 卡。开关关闭时仍正常呈现合法卡交客户手选。
4. **未运行真实 Electron e2e、未接真实模型**：确定性默认推荐不依赖模型；结果行/卡面真实渲染待独立验收。

## 六、验证

- `npm run typecheck`：0 错。
- `node --test "test/桌面应用/**/*.test.ts"`：**671/671 通过**；`operator-wiring.test.ts` 73/73（本批新增 8 例：校验矩阵、**桌面包装与 Pipeline `validateDecisionCardRequest` 原因码/detail 逐项一致**、校验接线/recommended 不丢、默认推荐 judge 代批、开关关闭不代选、异常回落、非 decision 卡零回归、桌面通道+编排包装端到端入账）。
- 一次全目录并行运行命中既有 `acceptance-dispatch.test.ts:5131` 的 gate 观测竞态（observed 0 vs 1，**与 decision 卡无关**；该文件单独跑 86/86、整目录重跑 671/671 全绿；变更记录已多次登记该并行负载 flake）。
- **端到端入账**（`test/桌面应用/operator-wiring.test.ts`）：真实 `openRoleSession` 包装 + 本通道，`flushGovernanceLedger` 后读到唯一 `customer.decision{decisionKind:"material-choice", customerDecision:"accepted", selectedOptions:["option-a"], decisionEvidence.kind:"judge", power:"schedule"}`；断言**无** `acceptance`/`proposal-*`/`appointment` 决定、`targetRoleIds` 缺失、无 `gate.review`。
- `node --test "test/项目管理/shared/i18n.test.ts"`：56/56（i18n 硬编码守卫确认 `customer-input.ts` 无新增中文；decision key 契约 9/9）。
- 既有 `request_gate_review` / `request_acceptance` 用例**零修改**通过（全套回归）；本批未改其代码路径。
- 未重启应用、未 commit/push、未触碰 `demos/`。
