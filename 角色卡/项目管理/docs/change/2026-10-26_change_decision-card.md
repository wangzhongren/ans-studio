# 变更记录：decision 卡共享 i18n、变更记录与规则同步（项目管理）

- **任务**：客户新增 decision 卡规则——项目管理负责的共享 i18n、变更记录与规则同步
- **记录角色**：项目管理（技术架构）worker，独立角色上下文
- **日期**：2026-10-26
- **状态**：**`implemented-unverified`**（共享 i18n key、契约测试与文档完成；本角色 i18n 测试与 `npm run typecheck` 已跑并如实分类；**decision 卡实现由其他角色以未提交在飞改动提供，本批未修改、未验证**；未验收、未做真实 Electron/全量回归）
- **授权依据**：客户 2026-10-26 decision 卡规则（由主控任务转达）；工作树内未见对应 `docs/communication/**` 客户沟通原文，本记录以任务转达的客户规则为准，**不伪造沟通文件**
- **基线身份**：worktree `lead-governance-coordination`，HEAD `5bd9fe4`（`feat/scaffold-first-governance`）；本批在未提交的 gate review i18n/文档批次上**增量修改**，未回退既有改动；未 commit / 未 push / 未暂存
- **环境**：Windows 11 / Git Bash（MINGW64）；Node `v24.22.1`；npm `11.19.1`；仓库根 = worktree

> **授权记录说明**：本工作树内未见与本次 decision 卡规则对应的 `docs/communication/**` 客户沟通原文。本记录以主控任务转达的客户规则为依据，**不伪造沟通文件**；独立验收时如要求，请核对原始授权记录。

---

## 一、客户规则

客户 2026-10-26 新增规则（经主控任务转达）：

> 主理发现材料性选择不得自定，交统筹发 `request_choice(cardKind="decision")`；卡内恰好一个推荐项；开启「替我决策」时判断 agent 默认推荐；decision 卡独立于提案/任命/验收，不是客户批准，不触发 gate/验收。

拆成可执行的行为：

1. **主体与通道**：主理（Lead/liaison）遇到**材料性选择**（会影响目标、范围、方案取舍或客户可感知结果的选项）时**不得自定**；由主理交统筹（Steward/Convener），统筹以 `request_choice(cardKind="decision")` 向客户发**决策卡**。
2. **推荐项唯一**：每张 decision 卡**恰好一个推荐项**；推荐项是建议，不是客户决定，也不替客户选择。
3. **默认代批**：「替我决策」开启时，判断 agent（judge）**默认选择唯一推荐项**，不得自行发明选项或改动推荐；代批结果必须标 `judge 代批 · 代决策（自动代理）`，**不得写成客户本人**。开关关闭、判断不可用或判断结果不符合唯一推荐项时，交客户手动选择（fail-closed）。
4. **与验收分离**：decision 卡独立于提案接受、任命、验收；**不是客户批准、不等于验收通过、不是 gate**；选择结果仅记录材料性选择，**不作为验收/提案/任命决定记账**（应用按 `decisionKind="material-choice"` 单独审计留痕，门禁/收尾/分诊不读它），**不触发 gate 复核、不触发或替代验收**；最终验收与客户批准仍按工程法案第 9、11、12 条与既有验收卡链路执行。
5. **结构 fail-closed**：缺少唯一推荐项、参数非法或卡种不属于允许范围时，**不得向客户发卡**；发起方与应用应如实回执并修正后重试，不得伪造推荐项或代选。

**本批（项目管理）只做**：共享 i18n key、共享 i18n 契约测试、本变更记录、设计登记与工程法案规则同步。

**本批不做**：`src/model/**`、`src/provider/**`、`src/common/编排/**`、`src/pipeline/**`、`app/**`、`src/common/门禁引擎/governance-roles.ts` 的任何实现或接线；不新增角色/`FlowStepKind`；不 commit/push；不重启应用；不碰 `demos/`。

---

## 二、共享 i18n key 契约（9 个，zh-CN/en-US 同 key、同语义）

`zh-CN.ts` 是 key 全集来源；`en-US.ts` 的 `satisfies Record<MessageKey, MessageTemplate>` 在编译期强制 key 齐全。所有值沿用现有 i18n 风格（`{option}` / `{detail}` 插值），未改任何既有 key 文案。

| # | key | zh-CN | en-US | 占位符 | 语义/用途 |
| --- | --- | --- | --- | --- | --- |
| 1 | `ui.decisionCard.title` | 决策卡 · 材料性选择 | Decision card · material choice | — | 决策卡标题；只表达材料性选择，不写成客户批准。 |
| 2 | `ui.decisionCard.notApprovalBadge` | 非客户批准 | Not customer approval | — | 卡面徽标：decision 卡不是客户批准。 |
| 3 | `ui.decisionCard.recommended` | 推荐 | Recommended | — | 唯一推荐项的展示标识（供渲染层使用）。 |
| 4 | `main.decisionCard.selectedRecommended` | 决策卡：你选择了推荐项「{option}」；已如实记录本次材料性选择。 | Decision card: you selected the recommended option “{option}”; this material choice has been recorded as-is. | `{option}` | 客户选推荐项回执。 |
| 5 | `main.decisionCard.selectedOther` | 决策卡：你选择了「{option}」（非推荐项）；已如实记录本次材料性选择。 | Decision card: you selected “{option}” (not the recommended option); this material choice has been recorded as-is. | `{option}` | 客户选非推荐项回执；不把非推荐项说成推荐项。 |
| 6 | `main.decisionCard.judgeSelectedRecommended` | judge 代批 · 代决策（自动代理）：已按唯一推荐项「{option}」记录；不是客户本人选择。 | Judge delegation · decision (automatic agent): recorded the single recommended option “{option}”; this is not a selection by the customer. | `{option}` | 判断代批回执：标「自动代理」，明确不是客户本人。 |
| 7 | `main.decisionCard.notApproval` | 决策卡不是验收、不是客户批准，也不构成验收/提案/任命决定：本次选择仅作材料性选择的单独审计留痕，不触发 gate/验收；最终验收与客户批准仍走既有链路。 | A decision card is not acceptance and not customer approval, and does not constitute an acceptance/proposal/appointment decision: this choice is recorded only as a separate material-choice audit trail and triggers no gate or acceptance; final acceptance and customer approval still follow the existing path. | — | 与验收/客户批准/gate 的分离系统行；不暴露内部账本词，也不声称「不写 customer.decision」（账本按 material-choice 单独审计）。 |
| 8 | `main.decisionCard.noRecommended` | decision 卡缺少唯一推荐项（{detail}）；未向客户发卡（fail-closed），请修正后重试。 | Decision card has no unique recommended option ({detail}); no card was sent to the customer (fail-closed). Fix and retry. | `{detail}` | 无唯一推荐项：fail-closed，未发卡。 |
| 9 | `main.decisionCard.invalid` | decision 卡参数非法（{detail}）；未向客户发卡（fail-closed），请修正后重试。 | Decision card parameters are invalid ({detail}); no card was sent to the customer (fail-closed). Fix and retry. | `{detail}` | 非法卡：fail-closed，未发卡。 |

**契约要点**：

- **不是客户批准**：`notApproval` 与 `ui.decisionCard.notApprovalBadge` 逐字承载「不是客户批准」；`notApproval` 同时写明「不构成验收/提案/任命决定、不触发 gate/验收」。应用按 `decisionKind="material-choice"` 单独审计留痕（见 §六），该内部账本词不出现在用户文案中；文案**不**声称「不写 customer.decision」（与在飞账本实现矛盾）。
- **judge 不等于客户本人**：`judgeSelectedRecommended` 明确标「自动代理（automatic agent）」与「不是客户本人选择」；未在任何 key 中把 judge 称为客户本人。
- **推荐项唯一**：`noRecommended` / `invalid` 承载结构 fail-closed；推荐项展示只有 `ui.decisionCard.recommended` 一个标识，避免多个「推荐」口径。
- **与在飞契约对齐**：只读核对了其他角色未提交的在飞改动——`GovernanceChoiceCardKind` 已含 `"decision"`、`CustomerInputOption.recommended?: boolean`、`request_choice` schema/tools 已支持、编排按 `decisionKind:"material-choice"` 分类；本批未修改、未验证这些实现（详见 §六）。

---

## 三、规则同步（工程法案 §二.13 与设计登记）

在 `角色卡/项目管理/docs/project-rules.md` §二「已确认要求」末尾新增**第 13 条「决策卡-01：材料性选择必须发 decision 卡，推荐项唯一，与验收分离」**（客户 2026-10-26 规则）：

- **主体与通道**：主理发现材料性选择不得自定，交统筹发 `request_choice(cardKind="decision")`；decision 卡是独立卡种，不属于提案/任命/验收。
- **推荐项唯一**：每张 decision 卡恰好一个推荐项；推荐项是建议，不替客户选择。
- **默认代批**：「替我决策」开启时判断 agent 默认唯一推荐项；结果行标 `judge 代批 · 代决策（自动代理）`，不得写成客户本人；开关关闭/判断不可用/结果不符时交客户手动（fail-closed）。
- **与验收分离**：不是客户批准、不等于验收通过、不是 gate；选择结果按 `decisionKind="material-choice"` 单独审计留痕，不作为验收/提案/任命决定，不触发 gate/验收；最终验收仍按第 9、11、12 条与既有验收卡链路。
- **结构 fail-closed**：缺唯一推荐项/参数非法/卡种不允许时不得发卡。
- **范围说明**：第 12 条的「不新增 cardKind」仅约束 gate 复核范围，不适用于本条；本条不新增治理角色/`FlowStepKind`；decision 卡以 `cardKind="decision"` 实现（在飞实现已登记），由模型/编排/桌面/门禁卡属主实施并各自验收；本批只做项目管理负责的共享 i18n 与规则同步。

第 1–12 条原文保留、未重排未删改。新增设计登记 [`docs/design/2026-10-26_design_decision-card.md`](../design/2026-10-26_design_decision-card.md)（status `rules-only`：客户规则已确认；运行时/编排/门禁卡已有其他角色未提交的在飞实现，**本批未验证、未验收**；记录卡契约、9 个 i18n key、实现现状与待定项）。**未写「已验证/已验收」**。

**架构文档未改**：本次不新增角色、`FlowStepKind` 或层结构；decision 卡属于客户卡种与治理交互，登记在设计文档即可，`docs/architecture.md` 无需变更。

---

## 四、影响面

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| 共享 i18n（zh） | `src/common/shared/i18n/messages/zh-CN.ts` | 新增 3 个 `ui.decisionCard.*` + 6 个 `main.decisionCard.*` key 与语义注释；既有 key 零改动。 |
| 共享 i18n（en） | `src/common/shared/i18n/messages/en-US.ts` | 同一 9 个 key 的英文文案；占位符与 zh 一致；en-US 不含中文。 |
| 共享契约测试 | `test/项目管理/shared/i18n.test.ts` | key 分区计数 `ui` 783→786、`main` 508→514、总数 1356→1365、扣除 B0 后 778→781 / 503→509；新增 3 个 decision 卡用例（9 key 存在/占位符、独立性与 judge 归属语义 + en 无中文、zh/en 取值与插值）。 |
| 设计登记 | `角色卡/项目管理/docs/design/2026-10-26_design_decision-card.md` | 新增 `rules-only` 设计记录：客户规则、卡契约、i18n 契约、实现现状与待定项、验证计划。 |
| 工程法案 | `角色卡/项目管理/docs/project-rules.md` | §二新增第 13 条 decision 卡规则；变更记录追加 2026-10-26 条目。 |
| 本记录 | `角色卡/项目管理/docs/change/2026-10-26_change_decision-card.md` | 本文件。 |

**消费方契约（供实现批次使用）**：渲染层在 decision 卡上展示 `ui.decisionCard.title` / `notApprovalBadge` / `recommended`；主进程在结算/系统行中按 §二 的 key 与占位符调用 `translate`，`{option}` 用选中项标签，`{detail}` 用有界诊断/缺项说明。缺参会保留占位符并产生 `i18n.missing-param` 诊断。

**未受影响（本批未改）**：既有 `ui.triage.*`、`main.customerInput.*`、`main.gateReview.*`、验收/提案/任命 key 零改动；本批未改 flow/桌面/model/provider/门禁卡（其他角色的 decision 卡在飞改动不属于本批，见 §六）；无新依赖、无新角色、无新 `FlowStepKind`。

---

## 五、验证计划与实跑结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 共享 i18n 契约（本文件） | `node --test "test/项目管理/shared/i18n.test.ts"` | **56 tests / 56 pass / 0 fail / 0 skipped**，exit 0（新增 3 个 decision 卡用例） |
| 共享测试套件（本组） | `node --test "test/项目管理/shared/**/*.test.ts"` | **203 tests / 198 pass / 0 fail / 5 skipped**，exit 0 |
| 硬编码中文守卫 | 同上（`i18n-guard.test.ts`） | `[i18n-guard] scanned=124 allowlisted=20 violations=0`；本批未新增/放宽 allowlist |
| 类型检查（必跑） | `npm run typecheck` | **exit 0**，无诊断（en-US `Record<MessageKey, MessageTemplate>` 强制 9 个新 key 齐全） |
| 自检：zh/en key 齐全 | 同一 i18n 套件 | 目录 parity 断言通过；9 key 两侧均存在 |
| 自检：无重复 key | 同一 i18n 套件 + `tsc` | 计数与 key 规范通过；TS 对象字面量重复键会编译失败；未出现重复 key |
| 自检：无既有 key 误删 | 本批只新增 | `git diff --numstat` 两侧均为纯新增（0 删除）；既有 key 未删除 |

**并行在飞说明**：本批最终复跑 `npm run typecheck` 为 **exit 0**；期间工作树中其他角色的桌面在飞改动曾短暂出现 `app/desktop/customer-input.ts` 类型诊断（非本批文件），由属主修复后复跑通过。本批文件无诊断。

**测试契约说明**：新增用例逐字断言 `main.decisionCard.notApproval` 的「不是验收 / 不是客户批准 / 不构成验收/提案/任命决定 / 不触发 gate/验收」，并负向断言**不得**出现「不写 customer.decision」；同时断言 `judgeSelectedRecommended` 的「自动代理 / 不是客户本人选择」、`noRecommended`/`invalid` 的「fail-closed / 未向客户发卡」，以及 en-US 不含中文；后续改词必须显式更新测试，属有意契约变更。

**未跑**：全量回归（全仓测试）、真实 Electron、decision 卡 e2e、消费者接线后的系统行测试、独立验收。本记录不构成验收结论。

---

## 六、未做与风险

1. **decision 卡实现由其他角色在飞，本批未验证**：只读核对工作树未提交改动——`src/model/runtime.ts` 已把 `decision` 加入 `GovernanceChoiceCardKind` 与 `GOVERNANCE_CARD_GROUP`，`CustomerInputOption` 增可选 `recommended?: boolean`；`src/provider/runtime/schema.ts` / `tools.ts` 已支持 `cardKind=decision` 与推荐项透传；`src/pipeline/orchestration/run-role.ts` 已把 `decision` 仅加入 convener 白名单并按 `decisionKind:"material-choice"` 分类；`src/common/编排/governance-ledger.ts` 已含 `"material-choice"` 与 `selectedOptions`；`src/common/门禁引擎/governance-roles.ts` 角色卡已有 Lead/Steward decision 纪律；`app/desktop/customer-input.ts` 已有发卡前 fail-closed 校验与「替我决策」确定性默认推荐（`group:"decision"`、judge 代批），并引用 4 个 `main.decisionCard.*` key。上述均为**其他角色未提交的在飞改动**，本批未修改、未运行其测试、未验证/验收；渲染层卡面与客户手选回执仍未见接线。
2. **消费者部分接线（其他角色在飞）**：截至本批最终核对，`app/desktop/customer-input.ts` 的未提交在飞改动已引用 `main.decisionCard.invalid` / `noRecommended` / `judgeSelectedRecommended` / `notApproval`（发卡前 fail-closed 校验与 judge 默认推荐结果行）；`main.decisionCard.selectedRecommended` / `selectedOther` 与 3 个 `ui.decisionCard.*` 仍未被产品代码引用，渲染层卡面/客户手选回执待接线。本批未修改、未验证该桌面接线；缺参会保留占位符并产生 `i18n.missing-param`。
3. **推荐项校验位置**：在飞契约已给出 `options[].recommended?: boolean`，要求 decision 卡恰有一个 `recommended: true`；运行时核心只透传，个数校验在应用/角色侧。桌面在飞改动已实现发卡前校验（0 个/多个均拒、仅统筹可发、flowId/选项合法性），但本批未运行其测试、未验证；若最终实现漏校验，消费方必须 fail-closed。
4. **授权沟通原文不在工作树**：见文首说明；若独立验收要求原始客户沟通文件，需由主控/治理补齐，本记录不以任务转达冒充客户沟通原文。
5. **与第 12 条「不新增 cardKind」的边界**：该限制仅适用于 gate 复核实现（第 12 条「范围」款）；decision 卡是独立客户规则，在飞实现已新增 `cardKind="decision"`，不受该款限制，但仍须走各自的授权与验收。已在第 13 条「范围说明」与本记录中写明，避免误读为全局禁令。
6. **误用风险**：decision 卡选择按 `decisionKind="material-choice"` 单独审计留痕是允许的；若实现把它当成验收/提案/任命决定（`acceptance` / `proposal-*` / `appointment`）或据此触发 gate/验收，即违反客户规则。实施验收必须机械核对账本与流程状态（门禁/收尾/分诊不读 `material-choice`），不得只核对文案。
7. **在飞状态会继续变化**：其他角色的 decision 卡实现仍在工作树中演进；本记录 §五/§六 的只读核对只代表 2026-10-26 本批最终核对时点，最终以属主实现与独立验收为准。
8. **未 commit/push/重启**：工作区改动保留未提交；应用未重启；`demos/` 未触碰。

---

## 七、本批写集

- `src/common/shared/i18n/messages/zh-CN.ts`
- `src/common/shared/i18n/messages/en-US.ts`
- `test/项目管理/shared/i18n.test.ts`（本角色边界 Section 1 授权的共享组件测试目录；gate review 批次已在本文件增量修改）
- `角色卡/项目管理/docs/change/2026-10-26_change_decision-card.md`（本文件）
- `角色卡/项目管理/docs/design/2026-10-26_design_decision-card.md`
- `角色卡/项目管理/docs/project-rules.md`

未触碰：`app/**`、`src/common/编排/**`、`src/model/**`、`src/provider/**`、`src/pipeline/**`、`src/common/门禁引擎/**`、边界/角色卡、其他角色资料、`package.json`/`tsconfig*`、`demos/`。
