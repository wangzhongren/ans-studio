# 变更记录：需求变更申请 / 独立审批角色卡文本（Draft / Steward 发起 decision 审批卡；Lead 只执行）

- 状态：**implemented-unverified（已实施、未独立验收；已按同日客户两次纠正更新最终口径）**
- 日期：2026-10-26
- 角色：门禁引擎（Gate Engine）
- 任务：为新增的 `request_requirement_change` 通道更新角色卡（lead-governance-coordination；门禁引擎任务）

## 0. 客户纠正（同日两次；最终口径，取代 §2–§4 的旧路径）

客户先纠正「需求变更申请**不由主理审批**，审批由判断 agent（勾选「替我决策」时）或客户（未勾选时）在
decision 卡上完成，主理只在批准后执行意图变更」，再补充「**统筹（convener）和提案（rapporteur）都可以
发起 / 持有**需求变更申请 / 审批卡；其他内置角色不可；发起方不得自批」。最终规则：

1. **发起 / 持有**：需求变更申请 / 审批卡由 **Draft / 提案** 或 **Steward / 统筹** 发起 / 持有；其他内置
   治理角色（Crew / Proof）与主理不可。
2. **审批**：客户（未勾选「替我决策」）或判断 agent（勾选时默认选推荐项）在
   `request_choice(cardKind="decision")` 卡上以 `approve` / `reject` 完成；恰好一个 `recommended: true`
   （推荐 `approve`）；**发起方不得自批 / 代选 / 默认按 `approve` 推进**；未获明确结果（拒绝 / 超时 / 通道
   不可用）不推进、不重复刷同一张卡。
3. **主理**：不接收原始申请、不审批；只接收「**已批准的需求变更执行任务**」，核验独立审批证据（decision
   `approve` + 批准来源：客户 / `judge 代批` + 同一 flowId / `requestId`）后更新 `docs/intents/**`、按
   `hand_off_intent` 通知 Draft 修订；**未获独立审批证据不得执行**；不得自行批准 / 拒绝、不得再发
   `intent-confirm` 充当需求变更审批；原始申请误投时如实报告、不审批 / 不执行。
4. **Draft**：申请登记后必须发 decision 审批卡并等独立审批；批准后等主理执行意图变更并通知再出 v2 提案、
   重发提案卡；`reject` 则修订或撤回；不得把新授权写进提案卡、不得删需求绕过审批。
5. **Steward**：可发起 / 持有（不排除统筹）；必须发 decision 审批卡、不自批；批准后通知主理执行并通知
   Draft，**自己不执行意图变更 / 不改提案**；既有「Decision 卡（材料性选择）」职责保留（材料性选择仍由
   统筹发卡）。
6. **审批卡语义**：不是提案接受 / 任命 / 验收，不触发 gate / 最终验收，不写提案卡授权；批准只解决需求变更
   本身，提案仍须修订后走提案卡（闸门 1）。不得删需求 / 缩范围 / 降标准绕过审批。
7. **系统消息**：`[需求变更申请·待独立审批]` 等任务处理不改变「系统消息只汇报、不派任务」规则。

**落点**：`RAPPORTEUR_CARD_TEXT` 新增「## 需求变更申请（request_requirement_change + decision 审批卡，
必须）」；`LIAISON_CARD_TEXT` 原需求变更申请节改写为「## 需求变更执行（已批准，必须）」；`CONVENER_CARD_TEXT`
新增「## 需求变更申请审批（request_requirement_change + decision 审批卡，必须）」，材料性选择 Decision
章节逐字保留。**§2–§4 记录的是客户纠正前的旧路径（Lead 审批 + intent-confirm），已被本节取代**；现行卡文本
与本批测试以 §0 为准。§5/§6 已追加本批验证与风险。

- 依据：
  - 客户要求（经任务派发转达；**旧口径，最终以 §0 客户纠正为准**）：Draft / 提案 在提案需要**新的联网 / 外部目录 / 范围 / 标准 / 成本授权**时，**不得写进提案卡**，必须调用 `request_requirement_change` 发起需求变更申请；申请只是请求，不是客户批准；等主理完成意图变更 + `intent-confirm` 后再修订提案；不得删需求绕过 gate 0。Lead / 主理 收到 `[需求变更申请]` 任务时，读意图 / 申请票据，按需更新 `docs/intents/**`，发 `request_choice(cardKind=intent-confirm)` 请客户 / 判断 agent 确认；确认后通知 Draft 修订提案；不得在提案卡上代批新授权、不得把删需求当合规；系统消息只汇报规则不回归。
  - 项目管理工程法案 §二 第 15 条「需求变更-01」（在飞、只读核对）：`角色卡/项目管理/docs/project-rules.md`；变更记录 `角色卡/项目管理/docs/change/2026-10-26_change_requirement-change-request.md`。
  - 运行时 / 共享契约（**只读核对，属运行时核心 / 项目管理角色在飞改动，本批未修改未验证**）：
    - `src/model/runtime.ts`：`RequestRequirementChangeInput`（`flowId?` / `intentId?` 至少一个；`changeKind: scope|authorization|constraint|cost|other`；`summary` / `rationale` 必填；`impact?` / `proposedIntentPatch?` 可选）与 `RequestRequirementChangeResult`（`ok` + `code: dispatched|already-dispatched|invalid|intent-not-found|flow-not-found|unavailable|rejected` + `message`；`flowId` / `intentId` / `requestId?`）；能力未注入则工具不注册。
    - `src/provider/runtime/schema.ts`：工具描述写明「不要把未获授权的诉求塞进提案卡」「主理仍需 Gate 0 意图变更 + intent-confirm」「`proposedIntentPatch` 只是建议」「已提交 ≠ 客户批准 ≠ 意图已变更」「回执原样转达、失败不伪装」。
    - `src/provider/runtime/tools.ts`：只新增该工具，既有工具 schema / 描述 / 行为零变化；参数形状与本卡文本一致。
    - 共享 i18n（在飞）：`[需求变更申请]` 任务标签、申请票据（`requestId` / flowId / intentId）、`dispatched` / 各失败 code 回执文案与系统行；本批未改 i18n。
    - 运行时核心变更记录（在飞、只读核对）：`角色卡/运行时核心/docs/change/2026-10-26_change_request-requirement-change-contract.md`——工具**只给报告员（Draft/rapporteur）注入**、未注入不注册；工具层只做形状校验并原样转达回执，契约外 / 未知 code fail-closed；应用侧意图校验 / 去重票据 / 主理任务投递 / 系统行 / 账本 / intent-confirm 衔接尚未实现。
    - 编排测试（在飞、只读核对）：`test/编排/request-requirement-change.test.ts`——注入判据为 `governanceFunction === "proposal"`，其他内置治理角色与项目角色不注入；编排纯透传。
- 范围：只改本角色授权写集——`src/common/门禁引擎/governance-roles.ts` 的 `RAPPORTEUR_CARD_TEXT` / `LIAISON_CARD_TEXT` 产品数据文本与文件头注、`test/门禁引擎/requirement-change-cards.test.ts`（新）、本角色 changelog / memo 与本变更记录。未改 `src/model/**`、`src/provider/**`、`src/common/编排/**`、`src/pipeline/**`、`src/common/shared/**`、`app/**`、共享 i18n、桌面 / 模型实现或 `demos/`；未 commit / push；未重启应用；未跑真实 Electron / 浏览器。

## 1. 写前核对与基线

- `git rev-parse HEAD` = `99bbbe2cda3be0fcd7c8d1e72189b6f530e8387e`（分支 `feat/scaffold-first-governance`）。
- `node --version` / `npm --version` = v24.22.1 / 11.19.1。
- 写前基线：本角色全套 `node --test "test/门禁引擎/**/*.test.ts"` ⇒ **340 计 / 339 过 / 0 失败 / 1 Windows 既有 skip，exit 0**。
- 工作树在本批进行中出现了其他角色的在飞改动（`src/model/runtime.ts`、`src/provider/runtime/{schema,tools}.ts`、共享 i18n、`test/runtime-core/request-requirement-change-tool.test.ts`、项目管理工程法案 / 变更记录）。本批只读核对契约并按其对齐卡文本，**未修改、未回退、未验证**这些在飞文件。
- 写后候选哈希（客户纠正后的最终候选；`git hash-object` / `sha256sum`；文档编辑不影响下列代码 / 测试候选）：
  - `src/common/门禁引擎/governance-roles.ts` = `7fff83f8df488df2ea3bf2c43e2a5828f0224259` / `805957786197a8d1ddd309ad5dcd80319a4306a61fe4bc59b5c1fb1e787bcc57`
  - `test/门禁引擎/requirement-change-cards.test.ts` = `bb36fa1b2608d294a3dbcdb21a584459b7a59512` / `0fd998a2962e83fc10edee2db96d4a3a4d9e6190879ac76c7396f4039df4b590`
  - `test/门禁引擎/decision-card.test.ts` = `5975cda15bbdd22ba851ab17102db514bca17fe4` / `66d43ebf883a283e96549b2cf6b01f1abf5d8a8a02f1a396c9add51092d1d6fc`
  - `test/门禁引擎/governance-trio.test.ts` = `aeba2df2995cda27970ae8c96148e09d7603f707` / `8833c79f59853b32a848d4d14b37ba695d427d001a7178a60a8dc1aa4495d524`

## 2. `RAPPORTEUR_CARD_TEXT`（Draft / 提案）——纠正前记录，已被 §0 取代

- 标准工作流第 2 步「形成提案」追加指针：提案需要**新的授权**（联网、外部目录、范围、标准、成本）时，先按「需求变更申请（request_requirement_change，必须）」发起申请，**不得写进提案卡**（既有「缺失架构或质量章节不得出提案卡」逐字保留）。
- 新增 **「## 需求变更申请（request_requirement_change，必须）」**（标准工作流之后、`STANDARD_WORKFLOW_PRINCIPLE` 之前）：
  - **触发**：方案需要新的授权——联网 / 外部服务、外部目录 / 仓库、范围、验收 / 技术标准、成本（付费服务 / 资源 / 许可）时，**不得写进提案卡**（不得作为提案 / 提案卡的内容或选项，也不得只在会话里口头说明），必须调用 `request_requirement_change`。
  - **工具契约**（与在飞运行时可核对）：`flowId` / `intentId` 至少一个；`changeKind` 必填（`scope` / `authorization` / `constraint` / `cost` / `other`）；`summary` / `rationale` 必填（超长拒绝、不截断），`impact` / `proposedIntentPatch` 可选；**`proposedIntentPatch` 只是给主理的建议，不替客户修改意图**；应用校验 / 去重后以 `[需求变更申请]` 任务交给 Lead / 主理。
  - **申请只是请求**：不是客户批准、不是提案接受、不解锁任何门禁、不授权实施；在途时不得按新授权写提案 / 契约 / 实现，不得把回执写成客户已同意。
  - **回执如实处理**：`dispatched` / `already-dispatched` 不等于客户批准、不代表意图已变更，等待主理；`invalid` / `intent-not-found` / `flow-not-found` 未提交、修正后重试；`rejected` 是应用退回报告员（不代表客户拒绝），修正后重交、不原样重复；`unavailable` / 失败 / 超时按「可能已提交 / 状态未知」如实报告，不继续按新授权推进；契约外 / 未知回执按未提交处理、不得当成功。
  - **等主理确认后再修订提案**：主理读意图与申请票据、按需更新 `docs/intents/**`，并请客户 / 判断 agent 确认变更后的需求（闸门 0）；**收到主理确认后的通知前不得修订提案、不得重发提案卡**；确认后按更新后的意图出新版本提案（`docs/proposals/<flowId>-v2.md`…）并重发提案卡（`cardKind=proposal`）。
  - **不得删需求绕过闸门 0**：不得删除 / 缩减需求、验收标准或范围来规避新授权申请；删需求本身也是需求变更，必须走本通道并经客户 / 判断 agent 确认需求（闸门 0）。
- 「确认卡约定」追加：**提案卡不得承载新的授权**（联网、外部目录、范围、标准、成本）——先走需求变更申请与主理需求确认，未确认前不得写进提案卡或按新授权出卡。
- 既有治理卡参数纪律（`request_choice` 只用 `proposal`、`request_confirmation` 只用 `write`）、可写目录、禁写路径、预授权、质量基线等逐字保留；**Draft 卡不得出现 `intent-confirm`**（既有 `liaison-role.test.ts` 白名单守卫不弱化）——卡文本以「主理确认 / 闸门 0」表达该路径。

## 3. `LIAISON_CARD_TEXT`（Lead / 主理）——纠正前记录，已被 §0 取代

- 「治理协调」的「交 Draft」bullet 追加指针：需求变更按「需求变更申请（[需求变更申请] 任务，必须）」——更新意图并重新确认后再交 Draft 修订。
- 新增 **「## 需求变更申请（[需求变更申请] 任务，必须）」**（「治理协调」之后、治理卡参数纪律之前）：
  - **触发**：收到应用投递的 `[需求变更申请]` 任务（Draft 经 `request_requirement_change` 发起；票据含 `requestId`、`flowId` / `intentId`、`changeKind`、`summary`、`rationale`、可选 `impact` / `proposedIntentPatch`）；`[需求变更申请]` 是应用投递的任务，**不是客户批准**，也不代表任何新授权已被同意；信息不足先问客户或让 Draft 补充。
  - **读意图与申请票据**：读 `docs/intents/<flowId>.md` 与票据，核对新授权类型与影响；`proposedIntentPatch` 只是 Draft 的建议，**不得照抄当客户意图、不得替客户改意图**；不把内部实现细节包装成需求变更。
  - **更新意图**：按需更新 `docs/intents/**`，把变更点、理由与影响写进 goal / scope / acceptance（保留客户原话与原需求，写清变更前后差异）；不得静默扩权、改写客户原话或借机删减既有需求。
  - **发 intent-confirm 确认（闸门 0）**：`request_choice`（`cardKind=intent-confirm`、`flowId=<intentId>`、`confirm` / `revise`）；`revise` 先按反馈改意图文件再重发；**确认前不得通知 Draft 修订提案、不得按新授权推进**。
  - **确认后交 Draft 修订**：客户或判断 agent 代批 `confirm`（闸门 0 已结算）后，按既有 `hand_off_intent`（`handoffKind=clarification` / `revision`）把更新后的意图交给 Draft 并说明需修订的提案；由 Draft 出新版本提案并重发提案卡，**不由 Lead 改提案或提案卡**。
  - **不得在提案卡上代批新授权**：新授权只能由客户 / 判断 agent 在 `intent-confirm` 需求确认卡上确认；不得把提案卡 `accept` 当作新授权批准，不得让 Draft 把新授权写进提案卡、以提案卡替代需求确认，也不得在会话里说成客户已同意。
  - **不得把删需求当合规**：删需求 / 缩范围 / 降标准同样是需求变更，必须走本通道并经 `intent-confirm` 确认；不得为绕开闸门 0 删除需求、验收标准或范围，也不得默许 Draft 这样做。
  - **系统消息只汇报、不派任务规则不变**：`[需求变更申请]` 是应用投递的任务，按本节处理；`[系统·治理协调]`、gate pass / fail 系统行、交付 / 阻塞通知等系统消息仍只向客户如实汇报、不据此 `dispatch_task` 派任务。
- 「需求确认（必须）」段追加：需求变更也走同一确认路径——先更新意图文件，再重新发 `intent-confirm`；确认前不得让 Draft 修订提案。
- 既有「系统消息只汇报、不派任务（必须）」「材料性选择交统筹发 decision 卡」「内部决策纪律」、治理卡参数纪律（只用 `intent-confirm`）、可写目录 / 禁写、质量职责等逐字保留；`decision` 卡仍由统筹发，Lead 不新增 cardKind。

## 4. 测试（客户纠正后的最终版本）

- `test/门禁引擎/requirement-change-cards.test.ts` 重写为 6 例（全部卡文本数据面断言）：
  1. Draft 需要新授权时不得写进提案卡、必须 `request_requirement_change` 发起申请并等独立审批；工具契约
     （flowId/intentId 至少一个、changeKind 五值、summary/rationale、impact/proposedIntentPatch 建议）；
     申请只是请求；回执如实处理；
  2. Draft 批准后等主理执行意图变更并通知再修订（v2 + 重发提案卡）；拒绝则修订 / 撤回；审批卡不是新门禁 /
     不写提案卡授权；不得删需求绕过审批；Draft 卡不得出现 `intent-confirm` / `cardKind=acceptance`；
  3. Lead 只接收「已批准的需求变更执行任务」，核验独立审批证据后更新 `docs/intents/**` 并通知 Draft；
     原始申请（`[需求变更申请·待独立审批]`）不接收 / 不审批，误投时如实报告；
  4. Lead 不得自行批准 / 拒绝、不得代批 / 代选、不得再发 `intent-confirm` 充当需求变更审批；不得在提案卡
     上代批新授权、不得把删需求当合规；「系统消息只汇报」规则逐字保留；
  5. Steward 可发起 / 持有审批卡、必须发 decision 卡（approve / reject、推荐 approve）、不得自批；批准后
     通知主理执行并通知 Draft，自己不执行；材料性选择 Decision 卡职责保留；
  6. 通道只由 Draft / Steward 发起，Lead 只执行，Crew / Proof 不定义；数据面（entries / 预授权 / 能力位 /
     cardKind 白名单 / 五角色顺序）零变化。
- `test/门禁引擎/decision-card.test.ts`：通道归属断言按纠正更新——材料性选择 Decision 章节仍只由统筹定义；
  Draft 只在「需求变更申请（request_requirement_change + decision 审批卡）」节定义 `cardKind=decision`，不得
  定义材料性选择 Decision 章节；Crew / Proof 仍不得定义 decision 卡；其余断言（Steward 发卡 / 不自决 /
  替我决策 / 与 gate 验收分离 / 数据面）不变。
- `test/门禁引擎/governance-trio.test.ts`：「其余四卡不定义 appointment 推荐集」由 `/recommended:/` 收窄为
  `recommended: [` / `推荐：role-a、role-b` / `推荐集与卡选项一致`（Draft 的需求变更审批卡合法使用
  `recommended: true`，与 appointment 的机器可读推荐集不是同一口径）。其余断言未删除、未放宽。
- 既有测试文件与断言未删除、未弱化：`liaison-role.test.ts` 的非 Liaison 卡不得写 `intent-confirm`、
  `governance-standard-workflow.test.ts` 的 Lead `intent-confirm` / 工作流管理断言、`decision-card.test.ts`
  的 Steward Decision 卡断言、`governance-trio.test.ts` 的既有 gate / 数据面断言均保留。

## 5. 验证结果（客户纠正后，本批写后）

- 本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **346 计 / 345 过 / 0 失败 / 1 Windows 既有
  skip，exit 0**（上一批次 345/344/0/1；本批 +1 计）。
- `npm run typecheck` ⇒ **exit 0，0 错**（含工作树内其他角色在飞的运行时 / 编排 / 桌面 / i18n 改动）。
- 未跑跨角色端到端 / 真机 Electron / 浏览器；未独立验收；未 commit / push；未重启应用；未触碰 `demos/`。

## 6. 未做 / 依赖其他角色 / 残余风险

- **卡文本是行为约束，不是实现证据**：`request_requirement_change` 的工具注册 / 参数校验 / 去重 /
  `requestId` 票据 / 申请登记 / decision 审批卡路由 / 「已批准执行任务」投递 / 系统行 / 账本由运行时核心 /
  编排 / 桌面角色实施。
- **桌面侧已由并行角色对齐（只读核对）**：`app/desktop/requirement-change.ts` 已提供
  `buildRequirementChangeApprovalCard`（`approve` / `reject`、唯一 `recommended`）与
  `buildRequirementChangeLeadExecutionTaskText`（审批证据 + 主理只执行）；`app/desktop/session.ts` 已把
  `request_requirement_change` 注入条件扩到 `proposal` / `schedule`（Draft / Steward），并提供
  `requirementChangeCard` 审批卡通道；`app/desktop/interface.ts` 已改为申请登记 → 审批卡 → 批准后投递执行
  任务。**残余（桌面角色文件）**：`app/desktop/session.ts` 的部分 JSDoc 仍写「仅报告员注入」，与实现
  （`proposal` / `schedule`）不一致；不影响本批，需桌面角色顺手校正。
- **Steward 发起工具注入**：编排 `run-role.ts` 已允许 `rapporteur` / `convener` 注入；桌面 `session.ts`
  已按 `governanceFunction === "proposal" || "schedule"` 注入。两者一致（只读核对，未修改未验证）。
- **并行角色已对齐（只读核对、未修改未验证）**：`src/common/编排/decision-card.ts` 已允许 `convener` /
  `rapporteur` 发 decision 卡（rapporteur 仅需求变更用途）；`governance-judge-{facts,prompt,verdict}.ts`
  已写明发起方不得自批、主理只执行；`src/model/runtime.ts` / `src/provider/runtime/{schema,tools}.ts` 工具
  契约；共享 i18n `main.requirementChange.*`（`[需求变更申请·待独立审批]`、批准 / 执行任务文案）。若这些契约
  最终形状变化，须同批回改卡文本与本批测试。
- **decision 卡语义复用风险**：需求变更审批复用 `cardKind=decision`，桌面 / i18n 现有文案含「非客户批准」
  等材料性选择语义；需求变更审批卡是客户 / 判断 agent 对**需求变更**的批准（不是提案 / 验收批准）。桌面
  徽标 / 文案是否区分两种用途由桌面 / i18n 角色决定，本批未改。
- **判断 agent 代批**：仅「替我决策」开启时按唯一推荐项（`approve`）代选；未开启时客户手选。`reject` 永远
  不由判断代选、发起方不得自批为文本约束，无机械检查；依赖运行时 / 判断 agent 实现。
- 未 commit / push、未重启应用、未触碰 `demos/`。

## 现行口径补充（2026-10-26 客户纠正）

审批卡不再由发起方手动调用 `request_choice` 发起：应用在 `request_requirement_change` 成功后自动经发起方会话的客户卡通道呈现 `decision` 卡（`approve` / `reject`，恰好一个推荐 `approve`），发起方不得再调用 `request_choice` 重复发卡；审批由客户或「替我决策」判断 agent 完成，主理只执行已批准任务。本文中「由你调用 `request_choice` / 审批卡由发起方发起」的旧表述以本条为准。
