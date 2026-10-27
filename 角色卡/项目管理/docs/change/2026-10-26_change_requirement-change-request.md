# 变更记录：`request_requirement_change` 共享 i18n、变更记录与工程法案规则（项目管理）

- **任务**：为 `request_requirement_change`（需求变更申请）补共享 i18n、变更记录与工程法案规则，并按客户后续纠正修订审批主体口径
- **记录角色**：项目管理（技术架构）worker，独立角色上下文
- **日期**：2026-10-26
- **状态**：**`implemented-unverified`**（共享 i18n key、契约测试、本变更记录与工程法案规则完成；本角色 i18n/shared 测试通过；本批写集的 scoped typecheck 通过；全仓 `npm run typecheck` 会话中途曾 **exit 0**，最终复跑因其他角色并发在飞的桌面/测试文件报错（**错误均不在本批写集**，详见 §六/§七）；`request_requirement_change` 工具实现/桌面/编排接线不在本批写集，**未修改、未验证、未验收**；未做真实 Electron/全量回归；最终状态等独立验收后另记）
- **授权依据**：客户要求（由主控任务转达）——为 `request_requirement_change` 补共享 i18n、变更记录与工程法案规则；执行期间客户两次纠正审批主体（见 §〇）。工作树内未见对应 `docs/communication/**` 客户沟通原文，本记录以任务转达的客户要求为准，**不伪造沟通文件**
- **基线身份**：worktree `lead-governance-coordination`，HEAD `99bbbe2`（`feat/scaffold-first-governance`）；本批在已提交的 gate review / decision card / view_image 改动上**增量**修改，未回退既有改动；未 commit / 未 push / 未暂存
- **环境**：Windows 11 / Git Bash（MINGW64）；Node `v24.22.1`；npm `11.19.1`；仓库根 = worktree

> **授权记录说明**：本工作树内未见与本次需求变更申请对应的 `docs/communication/**` 客户沟通原文。本记录以主控任务转达的客户要求（含两次纠正）为依据，**不伪造沟通文件**；独立验收时如要求，请核对原始授权记录。

> **并发说明**：本批执行期间，工作树中存在**其他角色的在飞改动**（`src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、`src/common/门禁引擎/governance-roles.ts`、`app/desktop/requirement-change.ts` / `interface.ts` 接线及编排/测试文件，即 `request_requirement_change` 的类型/工具/角色卡/桌面/测试）。本批只**只读核对**这些改动用于对齐 key 后缀与分类登记，未修改、未运行其测试、未验证/验收。本修订的 `npm run typecheck` 复跑 **exit 0**；其他角色实现是否完整接线仍须由属主与独立验收判断。

---

## 〇、口径修订（客户 2026-10-26）

| 版本 | 审批主体与路径 | 状态 |
| --- | --- | --- |
| 初版（本批首轮） | 主理收到申请后更新意图，并发 `intent-confirm` 需求确认卡（客户或判断代批） | 已被客户纠正取代 |
| 第一次纠正 | 由独立判断 agent（开启「替我决策」）或客户（未开启）在**统筹 decision 卡**完成审批；主理只执行 | 已被下一次纠正取代 |
| 第二次纠正 | 审批卡改由**提案角色（Rapporteur）**发起/持有；统筹不参与 | 已被最终口径取代 |
| **最终口径（本记录现行）** | **需求变更申请与审批卡由统筹或提案角色发起（两者都可以，其他角色不可，发起方不得自批）；审批由开启「替我决策」时的独立判断 agent 或未开启时的客户在 decision 卡完成；主理不审批，只在批准后执行意图变更并通知 Draft 修订** | **生效** |

本次修订**删除**「主理改意图 + intent-confirm 作为审批」与「仅单一发起方（仅提案/仅统筹）」的措辞，**保留**「提案卡不得承载新授权」「不得删除需求绕过 gate 0」。共享 i18n 与契约测试已同步（13 个 key：6 个既有 key 调整文案、新增 3 个审批结果/执行任务 key）。

---

## 一、客户要求与场景（当前口径）

客户要求（经主控任务转达）：**Draft / 提案 需要新授权或新范围时，不得把新授权写进提案卡**；应通过 `request_requirement_change`（需求变更申请）提交申请。**需求变更申请与审批卡由统筹或提案角色发起**（其他角色不可发起，发起方不得自批）；申请进入**独立审批**：审批由**开启「替我决策」时的独立判断 agent**（默认选择唯一推荐项）或**未开启时的客户**在 **decision 卡**上完成；**主理不审批**，只在批准后执行意图变更并通知 Draft 修订提案。

该场景的核心约束：

1. **提案卡只承载已确认意图内的方案**：提案正文/提案卡不得出现未获批准的新授权、新范围、新验收口径或新资源承诺。
2. **申请通道独立**：Draft 发现需要新授权/范围时，先发 `request_requirement_change`，不是自行扩写提案、不是绕开审批直接实施、不是把「申请」写成「已获批准」。
3. **发起方限定**：需求变更申请与审批卡由**统筹或提案角色**发起（两者都可以），**其他角色不得发起**；**发起方不得自批**。
4. **审批人不是主理**：审批由独立判断 agent（「替我决策」开启时默认选唯一推荐项，代批须标明自动代理、不得写成客户本人）或客户（未开启或判断不可用时手选）在 decision 卡完成；**主理不审批、不代选**。
5. **主理只执行**：仅当独立审批通过后，主理才按**批准范围**更新 `docs/intents/<flowId>.md` 意图，并通知 Draft 修订提案；不得扩大批准范围。
6. **确认后才修订**：Draft 仅在独立审批通过且主理完成意图变更后，才可依据已确认意图修订提案；修订仍走既有提案卡（`cardKind=proposal`）与 gate 1。
7. **不得删需求绕过 gate 0**：不得通过删除、改写、拆分需求来规避 gate 0；申请、独立审批记录与意图变更记录缺一不可。
8. **申请 ≠ 批准**：提交申请、审批卡已发、意图文件已改都不等于批准，不得据此解锁任何门禁或按新授权实施。

**本批（项目管理）只做**：共享 i18n key、共享 i18n 契约测试、本变更记录、工程法案规则同步、本角色 changelog。

**本批不做**：`request_requirement_change` 的工具实现、桌面/编排/门禁卡接线；`src/model/**`、`src/provider/**`、`src/common/编排/**`、`src/common/门禁引擎/**`、`src/pipeline/**`、`app/**` 的任何实现或接线；不新增角色/`FlowStepKind`/cardKind；不 commit/push；不重启应用；不碰 `demos/`。

---

## 二、通道规则（当前契约）

```text
Draft 发现提案需要新授权/范围
        │
        ├─ 不得：写进提案卡 / 自行扩写提案 / 绕过审批
        │
        └─ request_requirement_change（申请，带 flowId / intentId / 变更内容 / 理由）
                 │
                 └─▶ 需求变更申请与审批卡（发起方：统筹或提案角色；其他角色不可；发起方不得自批）
                          │
                          ├─ 「替我决策」开启 → 独立判断 agent 默认选唯一推荐项
                          │     （judge 代批 · 代决策（自动代理），不得写成客户本人）
                          │
                          └─ 「替我决策」未开启 / 判断不可用 → 客户在 decision 卡上手选
                                   │
                                   ├─ 批准 → 主理按批准范围更新 docs/intents/<flowId>.md
                                   │          → 通知 Draft 修订提案（仍走既有提案卡与 gate 1）
                                   │
                                   └─ 未批准 → 主理不执行意图变更
                                              → Draft 不得按该申请修订，按审批意见调整后重新申请
```

**规则要点**：

- **申请 ≠ 批准**：提交申请、审批卡已发、主理执行意图变更，都不等于客户本人批准或已获其他授权；不得据此解锁任何门禁。
- **提案卡不得承载新授权**：在独立审批通过前，Draft 不得在提案卡/提案正文中写入该授权或据其实施；系统行/回执也必须明确这一点，避免「已提交」被误读为「已获批准」。
- **发起方限定与回避**：需求变更申请与审批卡均可由统筹或提案角色发起；其他角色不可；发起方不得自批（规避利益冲突）。
- **审批主体**：独立判断 agent（「替我决策」开启时默认推荐）或客户（未开启时手选）在 decision 卡完成；主理不审批、不代选。
- **主理只执行**：审批通过后主理按批准范围改意图并通知 Draft；不得扩大范围。
- **重复申请幂等**：同一流程/意图已有待处理申请时，不重复提交，等待独立审批结果。
- **结构 fail-closed**：参数非法、意图不存在、流程不存在时不得提交，如实回执并修正后重试；通道不可用时不得声称已提交；提交被拒时按原因修正后重交，不原样重试。
- **范围**：不新增治理角色、不新增 `FlowStepKind`、不新增 cardKind（decision 卡是既有卡种）；`request_requirement_change` 只是申请通道，不改变任何角色的文件写权。

---

## 三、共享 i18n key 契约（13 个，zh-CN/en-US 同 key、同语义）

`zh-CN.ts` 是 key 全集来源；`en-US.ts` 的 `satisfies Record<MessageKey, MessageTemplate>` 在编译期强制 key 齐全。所有值沿用现有 i18n 风格（`{flowId}` / `{intentId}` / `{requestId}` / `{detail}` / `{source}` 插值）。

| # | key | zh-CN | en-US | 占位符 | 语义/用途 |
| --- | --- | --- | --- | --- | --- |
| 1 | `main.requirementChange.dispatched` | 流程 {flowId}：已提交需求变更申请 {requestId}（意图 {intentId}），进入独立审批：申请与审批卡由统筹或提案角色发起（其他角色不可，发起方不得自批）；审批由开启「替我决策」时的判断 agent 默认选推荐项、未开启时由客户在 decision 卡上完成；申请 ≠ 批准——主理不审批，只在批准后执行意图变更并通知提案修订；提案卡不得承载未确认的新授权。 | Flow {flowId}: requirement change request {requestId} (intent {intentId}) submitted for independent approval: the request and the approval card may be initiated by the Steward or the proposer role (Rapporteur) — no other role may initiate them, and the initiator must not approve its own request; approval is completed on the decision card by the judge agent (with “decide for me” enabled, defaulting to the recommended option) or by the customer when it is not enabled; a request is not approval — the Lead does not approve and only executes the intent change after approval and notifies Draft to revise; proposal cards must not carry unconfirmed new authorization. | `{flowId}` `{intentId}` `{requestId}` | `dispatched` 回执（对应回执 code `dispatched`）：申请已提交并进入独立审批；写明发起方限定/不得自批、审批人、申请 ≠ 批准、主理只执行与提案卡禁令。 |
| 2 | `main.requirementChange.alreadyDispatched` | 流程 {flowId}：已存在待处理的需求变更申请 {requestId}（意图 {intentId}）；未重复提交，请等待独立审批结果（申请与审批卡由统筹或提案角色发起，发起方不得自批）。 | Flow {flowId}: a pending requirement change request {requestId} already exists (intent {intentId}); not submitted again — wait for the independent approval result (the request and the approval card may be initiated by the Steward or the proposer role; the initiator must not self-approve). | `{flowId}` `{intentId}` `{requestId}` | `already-dispatched` 回执：幂等去重，不重复提交，等待独立审批。 |
| 3 | `main.requirementChange.invalid` | 需求变更申请参数非法（{detail}）；未提交（fail-closed），请修正后重试。 | Requirement change request parameters are invalid ({detail}); not submitted (fail-closed). Fix and retry. | `{detail}` | `invalid` 回执：参数非法，fail-closed 未提交。 |
| 4 | `main.requirementChange.intentNotFound` | 流程 {flowId}：未找到意图 {intentId}；需求变更申请未提交，请核对后重试。 | Flow {flowId}: intent {intentId} not found; the requirement change request was not submitted. Check and retry. | `{flowId}` `{intentId}` | `intent-not-found` 回执：不猜意图、不自动建意图。 |
| 5 | `main.requirementChange.flowNotFound` | 流程 {flowId}：未找到该流程；需求变更申请未提交，请核对后重试。 | Flow {flowId}: flow not found; the requirement change request was not submitted. Check and retry. | `{flowId}` | `flow-not-found` 回执：不猜流程、不自动建流程。 |
| 6 | `main.requirementChange.unavailable` | 流程 {flowId}：需求变更申请通道不可用（{detail}）；可能已提交，请核对；应用未声称已提交。 | Flow {flowId}: the requirement change request channel is unavailable ({detail}); it may already have been submitted — check. The app does not claim submission. | `{flowId}` `{detail}` | `unavailable` 回执：fail-closed；不谎报已提交。 |
| 7 | `main.requirementChange.rejected` | 流程 {flowId}：需求变更申请提交被拒（{detail}）；未进入独立审批，请按原因修正后重交，不原样重试。 | Flow {flowId}: the requirement change request submission was rejected ({detail}); it did not enter independent approval — fix the cause and resubmit instead of retrying unchanged. | `{flowId}` `{detail}` | `rejected` 回执：**提交级拒绝**（既有在飞回执 code `rejected`），不是审批结果；写明未进入独立审批、修正后重交。 |
| 8 | `main.requirementChange.taskLabel` | [需求变更申请·待独立审批] | [Requirement change request · independent approval pending] | — | 申请任务标签（任务文本前缀），标明待独立审批，不承担审批语义。 |
| 9 | `main.requirementChange.ticket` | 需求变更申请 {requestId}｜流程 {flowId}｜意图 {intentId}｜待独立审批（申请与审批卡由统筹或提案角色发起；发起方不得自批；申请 ≠ 批准）：{detail} | Requirement change request {requestId} \| flow {flowId} \| intent {intentId} \| pending independent approval (the request and the approval card may be initiated by the Steward or the proposer role; the initiator must not self-approve; a request is not approval): {detail} | `{flowId}` `{intentId}` `{requestId}` `{detail}` | 申请票据/任务头：写明申请 id、流程、意图、待独立审批与发起方回避，便于审计与对账。 |
| 10 | `main.requirementChange.systemLine` | 系统·需求变更 · 提交了需求变更申请 {requestId}（流程 {flowId} · 意图 {intentId}），进入独立审批：申请与审批卡由统筹或提案角色发起（其他角色不可，发起方不得自批）；审批由替我决策→判断 agent 默认推荐、未开启→客户在 decision 卡上完成；申请 ≠ 批准——主理不审批，只在批准后执行意图变更并通知提案修订；提案卡不得承载未确认的新授权。 | System·Requirement change · requirement change request {requestId} (flow {flowId} · intent {intentId}) submitted for independent approval: the request and the approval card may be initiated by the Steward or the proposer role (Rapporteur) — no other role may initiate them, and the initiator must not self-approve; approval is completed on the decision card by the judge agent (decide-for-me → default recommendation) or by the customer when not enabled; a request is not approval — the Lead does not approve and only executes the intent change after approval and notifies Draft to revise; proposal cards must not carry unconfirmed new authorization. | `{flowId}` `{intentId}` `{requestId}` | 用户可见系统行：写明进入独立审批、发起方限定/不得自批、审批人、申请 ≠ 批准、主理只执行与提案卡禁令。 |
| 11 | `main.requirementChange.approved` | 流程 {flowId}：需求变更申请 {requestId}（意图 {intentId}）已通过独立审批（{source}）；主理不审批，将按批准范围执行意图变更并通知提案修订；提案卡不得承载未获批准的新授权。 | Flow {flowId}: requirement change request {requestId} (intent {intentId}) passed independent approval ({source}); the Lead does not approve and will execute the intent change within the approved scope and notify Draft to revise; proposal cards must not carry unapproved new authorization. | `{flowId}` `{intentId}` `{requestId}` `{source}` | 审批通过回执/系统行：`{source}` 由消费方填审批来源（判断代批「替我决策」或客户选择）；写明主理只按批准范围执行。 |
| 12 | `main.requirementChange.approvalRejected` | 流程 {flowId}：需求变更申请 {requestId}（意图 {intentId}）未通过独立审批（{detail}）；主理不审批、不执行意图变更；申请 ≠ 批准，提案不得按该申请修订，请按审批意见调整后重新申请。 | Flow {flowId}: requirement change request {requestId} (intent {intentId}) did not pass independent approval ({detail}); the Lead does not approve and does not execute the intent change; a request is not approval — do not revise the proposal on that request; adjust per the approval feedback and submit again. | `{flowId}` `{intentId}` `{requestId}` `{detail}` | 审批未通过回执/系统行：主理不执行、提案不得按该申请修订；与提交级 `rejected` 区分。 |
| 13 | `main.requirementChange.leadExecuteTask` | 需求变更执行任务｜流程 {flowId}｜意图 {intentId}｜申请 {requestId}：独立审批已通过（{source}）；主理不审批，只按本次批准范围执行意图变更（docs/intents/**）并通知提案修订；不得扩大范围、不得把新授权写进提案卡、不得删除需求绕过 gate 0。 | Requirement change execution task \| flow {flowId} \| intent {intentId} \| request {requestId}: independent approval passed ({source}); the Lead does not approve and only executes the intent change (docs/intents/**) within the approved scope and notifies Draft to revise; do not expand scope, do not put new authorization into proposal cards, and do not delete requirements to bypass gate 0. | `{flowId}` `{intentId}` `{requestId}` `{source}` | 批准后发给主理的执行任务：仅在批准后执行、不得扩大范围、不得删需求绕过 gate 0。 |

**契约要点**：

- **申请 ≠ 批准**由 `dispatched`、`systemLine`、`approvalRejected` 承载（en: `a request is not approval`）；`approved`/`approvalRejected` 是审批结果的独立 key。
- **发起方限定与回避**由 `dispatched`、`alreadyDispatched`、`ticket`、`systemLine` 共同承载：需求变更申请与审批卡均可由统筹或提案角色发起（en: `the request and the approval card may be initiated by the Steward or the proposer role`），其他角色不可（en: `no other role may initiate them`），发起方不得自批（en: `the initiator must not … approve its own request` / `must not self-approve`）。
- **审批人**：`dispatched`/`systemLine` 写明「替我决策→判断 agent 默认推荐；未开启→客户在 decision 卡完成」；`{source}` 由消费方按实际结果填入判断代批或客户选择。
- **主理只执行**：所有结果类 key 均写明主理不审批、只在批准后执行意图变更并通知提案修订。
- **提案卡禁令**由 `dispatched`、`systemLine`、`approved`、`leadExecuteTask` 共同承载。
- **不得删需求绕过 gate 0** 由 `leadExecuteTask` 逐字承载。
- **`rejected` 命名说明**：既有 key `main.requirementChange.rejected` 表示**提交级拒绝**（在飞 `RequestRequirementChangeResult.code = "rejected"`，桌面 `interface.ts` 已按该 key 取词），不是审批结果。客户建议的审批结果 key 名 `rejected` 与该既有 key 冲突，故审批未通过使用 **`approvalRejected`**；未删除、未改名任何既有 key。若后续属主希望把审批结果收敛为 `rejected`，须先与桌面消费方协调 key 迁移，不能静默覆盖。
- **与在飞回执契约对齐**：`src/model/runtime.ts`（其他角色在飞改动）冻结的 `RequestRequirementChangeResult.code` 为 `dispatched` / `already-dispatched` / `invalid` / `intent-not-found` / `flow-not-found` / `unavailable` / `rejected`；本批 key 后缀按同一枚举取 camelCase，与 gate 复核 key 的 code→key 映射先例一致。审批结果/执行任务 key 供后续编排/桌面按需消费。
- **占位符规范**：`{flowId}` 流程 id、`{intentId}` 意图 id、`{requestId}` 申请票据 id、`{detail}` 有界诊断/缺项说明、`{source}` 审批来源；zh/en 占位符集合逐 key 一致（测试断言）。

---

## 四、规则同步（工程法案 §二.15）

`角色卡/项目管理/docs/project-rules.md` §二「已确认要求」第 15 条就地修订为**「需求变更-01：提案新授权必须走 `request_requirement_change` + 独立审批（decision 卡）+ 主理执行」**：

- **通道**：Draft / 提案 发现需要**新授权或新范围**时，**不得把新授权写进提案卡或提案正文**；必须调用 `request_requirement_change` 提交申请（带 `flowId`、`intentId`、变更内容与理由）。**申请 ≠ 批准**。
- **发起方（统筹或提案，其他角色不可）**：需求变更申请与审批卡均由统筹或提案角色发起（两者都可以，不限定仅一方）；其他角色不得发起；发起方不得自批。
- **独立审批（decision 卡，非主理）**：审批由开启「替我决策」时的独立判断 agent 默认选唯一推荐项（代批标明自动代理，不得写成客户本人），或由未开启时的客户在 decision 卡手动完成；判断不可用或结果不符合唯一推荐项时转客户手选（fail-closed）。主理不审批、不代选。
- **主理只执行**：仅在独立审批通过后，主理才按批准范围更新 `docs/intents/<flowId>.md` 并通知 Draft 修订提案；不得扩大批准范围。申请提交、审批卡已发、主理执行意图变更都不等于批准，不得据此解锁其他门禁。
- **修订时机**：独立审批通过且主理完成意图变更后，Draft 才可依据已确认意图修订提案；修订仍走既有提案卡与 gate 1。
- **提案卡禁令 / 不得绕过 gate 0**：提案卡不得承载未获批准的新授权；不得通过删除、改写、拆分需求规避 gate 0；申请、独立审批记录与意图变更记录缺一不可。
- **范围**：不新增治理角色、不新增 `FlowStepKind`、不新增 cardKind（decision 卡是既有卡种）；不改变任何角色写权；本规则不扩张任何角色的文件写权。

第 1–14 条原文保留、未重排未删改。**架构文档未改**：本次不新增角色、`FlowStepKind` 或层结构；需求变更申请属于治理交互/通道规则，登记在工程法案与变更记录即可，`docs/architecture.md` 无需变更。

---

## 五、影响面

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| 共享 i18n（zh） | `src/common/shared/i18n/messages/zh-CN.ts` | `main.requirementChange.*` 增为 13 个：6 个既有 key（`dispatched`/`alreadyDispatched`/`rejected`/`taskLabel`/`ticket`/`systemLine`）按客户纠正改文案，新增 `approved`/`approvalRejected`/`leadExecuteTask`；4 个既有 key（`invalid`/`intentNotFound`/`flowNotFound`/`unavailable`）文案未改；未删除任何 key。 |
| 共享 i18n（en） | `src/common/shared/i18n/messages/en-US.ts` | 同一 13 个 key 的英文文案；占位符与 zh 一致。 |
| 共享契约测试 | `test/项目管理/shared/i18n.test.ts` | key 分区计数同步：`main` 526→529、总 key 1378→1381、`main` 扣除 B0 521→524；`REQUIREMENT_CHANGE_KEYS` 10→13；更新 3 个 requirementChange 用例（13 key 存在/占位符、审批主体与发起方语义 + en 无中文、zh/en 逐字取值与插值），并新增「旧口径不得回归」负断言（不得出现 `intent-confirm`、`给主理`、仅单一发起方）。 |
| i18n 守卫 allowlist | `test/项目管理/shared/i18n-guard-allowlist.ts` | 本修订**未改**：`app/desktop/requirement-change.ts` 仍含 agent-facing 中文（旧流程的主理任务正文等），按既有 classification §4 继续登记；该文件属桌面角色写集，本批不改。 |
| 工程法案 | `角色卡/项目管理/docs/project-rules.md` | 就地修订 §二第 15 条为「独立审批（decision 卡）+ 主理执行」口径；变更记录追加 2026-10-26（客户纠正）条目。 |
| 角色变更记录 | `角色卡/项目管理/changelog.md` | 新增本次修订条目。 |
| 本记录 | `角色卡/项目管理/docs/change/2026-10-26_change_requirement-change-request.md` | 本文件（含 §〇 口径修订）。 |

**消费方契约（供实现批次使用）**：工具实现/桌面/编排在生成申请回执、票据、系统行、审批结果或主理执行任务时，按 §三 的 key 与占位符调用 `translate`；`{requestId}` 用申请票据 id（稳定、可审计），`{detail}` 用有界诊断/缺项说明，`{flowId}`/`{intentId}` 用项目内标识，`{source}` 用审批来源（判断代批「替我决策」或客户选择）。缺参数会保留占位符并产生 `i18n.missing-param` 诊断。申请任务文本以 `main.requirementChange.taskLabel` 作前缀，票据行用 `main.requirementChange.ticket`，批准后主理执行任务用 `main.requirementChange.leadExecuteTask`。

**未受影响（本批写集外）**：decision 卡既有 key 与链路零改动；提案卡/任命/验收/gate 相关 key 零改动；本批**未修改** model/provider/编排/桌面/门禁卡（工作树中这些文件存在其他角色的并发在飞改动，本批只读核对、未运行其测试）；无新依赖、无新枚举、无新角色/`FlowStepKind`/cardKind。

---

## 六、验证计划与实跑结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 共享 i18n 契约（必跑） | `node --test "test/项目管理/shared/i18n.test.ts"` | **62 tests / 62 pass / 0 fail / 0 skipped**，exit 0（含更新后的 3 个 requirementChange 用例） |
| 共享测试套件（本组） | `node --test "test/项目管理/shared/**/*.test.ts"` | **209 tests / 204 pass / 0 fail / 5 skipped** |
| 类型检查（必跑） | `npm run typecheck` | **会话中途曾 exit 0**；最终复跑 **exit 1**，9 个错误**全部**来自其他角色并发在飞的 `app/desktop/customer-input.ts`、`app/desktop/interface.ts`、`app/desktop/session.ts`、`test/桌面应用/acceptance-dispatch.test.ts`（`onPresented` 类型、旧导出名 `buildRequirementChangeLeadTaskText`、`RequirementChangeTicketRecord` 形状等，均在本批写集之外）；本批写集无诊断 |
| 类型检查（本批写集 scoped） | `npx tsc --ignoreConfig --noEmit ... src/common/shared/i18n/index.ts test/项目管理/shared/i18n.test.ts` | **exit 0**（含 `@ts-expect-error` 类型级契约；仅检查本批共享 i18n 与契约测试及其依赖） |
| 自检：zh/en key 齐全与 parity | 同一 i18n 套件 | zh 1381 / en 1381 key，目录 parity 断言通过；`onlyZh=0` / `onlyEn=0` |
| 自检：无重复 key | 同一 i18n 套件（分区计数 + key 规范） | 计数与 key 规范通过；TS 对象字面量重复键会使编译失败 |
| 自检：无既有 key 误删 | `git diff --numstat` | `zh-CN.ts` / `en-US.ts` 均为纯增量（新增 3 个 key + 既有文案改写），既有 key 无删除/改名 |
| 自检：旧口径措辞清除 | `grep -n "intent-confirm\|给主理\|submitted to Lead"`（两个目录） | 无命中 |

**测试契约说明**：新增用例逐字断言 `dispatched` 的「申请与审批卡由统筹或提案角色发起（其他角色不可，发起方不得自批）」「判断 agent / 客户在 decision 卡」「申请 ≠ 批准」「主理不审批」「只在批准后执行意图变更」「通知提案修订」「提案卡不得承载未确认的新授权」；`approved`/`approvalRejected`/`leadExecuteTask` 的主理只执行与不执行语义；`taskLabel` 的待独立审批标签；`rejected` 的提交级拒绝语义；并显式断言旧口径（`intent-confirm`、`给主理`、仅单一发起方）不得回归。后续改词必须显式更新测试，属有意契约变更。

**未跑**：全量回归（全仓测试）、真实 Electron、`request_requirement_change` 工具/审批卡/主理执行接线的集成与 e2e、独立验收。本记录不构成验收结论。

---

## 七、未做与风险

1. **工具实现/接线不在本批**：本批只冻结共享文案与规则；`request_requirement_change` 的工具注册、参数校验、幂等/票据、审批卡发起/持有、判断代批或客户手选、审批结果回执、主理执行任务投递、意图变更与通知 Draft 均由模型/编排/桌面/门禁卡属主在各自边界实现并各自验收。本批只读核对了工作树中**其他角色未提交的在飞改动**（`src/model/runtime.ts`、`src/provider/runtime/**`、`src/common/编排/**`、`src/pipeline/**`、`app/desktop/requirement-change.ts` / `interface.ts`、门禁引擎角色卡与新增测试），未修改、未运行其测试、未验证/验收。
2. **桌面在飞实现仍是旧流程（重要风险）**：`app/desktop/requirement-change.ts::buildRequirementChangeLeadTaskText` 的任务正文仍要求主理「更新意图 → 发 intent-confirm → 确认后通知 Draft」，`interface.ts` 仍把申请投递给主理并按旧回执取词；这些文件属桌面角色写集，本批**未修改**。本批已冻结新 key 契约，桌面属主必须按 §三/§四把任务正文与审批链路改为「需求变更申请与审批卡由统筹或提案发起（不得自批）→ 判断 agent/客户 decision 卡审批 → 主理只执行」，否则实际行为与共享文案/规则不一致。`taskLabel`/`ticket`/`dispatched`/`systemLine` 占位符形状未变，现有消费方可继续编译/取词，但语义须由属主同步。
3. **`rejected` 命名冲突已按既有消费方保留**：审批未通过使用 `approvalRejected`；`main.requirementChange.rejected` 仍是提交级拒绝（既有在飞回执 code `rejected`，桌面已绑定）。这是对客户建议 key 名 `rejected` 的有意偏离，理由见 §三；如需收敛须先协调桌面 key 迁移。
4. **新增审批结果/执行任务 key 尚无消费方**：`approved`/`approvalRejected`/`leadExecuteTask` 本批结束时无产品代码引用；消费方按 §三 接线前，缺参数会保留占位符并产生 `i18n.missing-param`。
5. **规则依赖 decision 卡与判断/客户审批**：若实现方改用其他卡种、让发起方（统筹或提案）自批、让主理审批，或要求主理发 `intent-confirm` 作为审批，即违反 §二.15，须退回修正。
6. **语义边界风险**：`dispatched`/`systemLine` 都写明「申请 ≠ 批准」，但若消费方只取 `taskLabel` 或截断文本，可能让客户误读；实现方必须整句使用回执/系统行，不得自行拼接出「已获批准」的表述。
7. **措辞冻结成本**：13 个值已被测试逐字断言；实现中若发现语义需要调整（如 `{source}` 取值格式），须同步改 key 文案与测试，并按契约变更记录，不能静默漂移。
8. **i18n 守卫分类（本批）**：`app/desktop/requirement-change.ts` 去除注释后仍含中文（结构校验 detail、旧流程主理任务正文、票据状态/路径机器常量），按既有 classification §4 继续 allowlist；本修订未改 allowlist、未放宽断言。若桌面属主更新任务正文后文件仍含 agent-facing 中文，条目继续保留；若变为零 Han，守卫会判陈旧，须由项目管理移除。
9. **并发工作树与验证漂移**：其他角色仍在写入 `request_requirement_change` 相关实现/测试。本修订 `npm run typecheck` 会话中途曾 exit 0，**最终复跑 exit 1**：9 个错误全部来自并发在飞的 `app/desktop/customer-input.ts`、`app/desktop/interface.ts`、`app/desktop/session.ts`、`test/桌面应用/acceptance-dispatch.test.ts`（旧导出名、票据记录形状、`onPresented` 类型等在飞重构中间态），**本批写集文件无诊断**，本批写集 scoped typecheck exit 0。不能据此声称其他角色实现可编译/可运行，最终验证必须在属主完成后的合并候选上复跑。
10. **授权沟通原文不在工作树**：见文首说明；若独立验收要求原始客户沟通文件，需由主控/治理补齐，本记录不以任务转达冒充客户沟通原文。
11. **未 commit/push/重启**：工作区改动保留未提交；应用未重启；`demos/` 未触碰。

---

## 八、本批写集

- `src/common/shared/i18n/messages/zh-CN.ts`
- `src/common/shared/i18n/messages/en-US.ts`
- `test/项目管理/shared/i18n.test.ts`（本角色边界 Section 1 授权的共享组件测试目录；分区计数 526/1378 → 529/1381，`REQUIREMENT_CHANGE_KEYS` 10→13，更新 3 个 requirementChange 契约用例）
- `角色卡/项目管理/docs/change/2026-10-26_change_requirement-change-request.md`（本文件）
- `角色卡/项目管理/docs/project-rules.md`
- `角色卡/项目管理/changelog.md`

未触碰：`app/**`、`src/model/**`、`src/provider/**`、`src/common/编排/**`、`src/common/门禁引擎/**`、`src/pipeline/**`、边界/角色卡、其他角色资料、`package.json`/`tsconfig*`、`demos/`。`test/项目管理/shared/i18n-guard-allowlist.ts` 本修订未改。
