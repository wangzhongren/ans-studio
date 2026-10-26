# 变更记录：Decision 卡（材料性选择）角色卡文本（Steward 发卡 + 推荐项；Lead 交统筹）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-10-26
- 角色：门禁引擎（Gate Engine）
- 任务：客户新增 decision 卡——更新 Lead / 主理 与 Steward / 统筹 角色卡（lead-governance-coordination）
- 依据：
  - 客户新规则（经任务派发转达）：主理发现**材料性选择**（真实启动演示方式、验收证据方式、范围、标准 / 契约偏离、成本、客户可见行为等）时，**不得在聊天里自己定**，应给统筹派协调任务，由统筹发 `request_choice(cardKind="decision")` 客户确认卡；内部实现细节仍可自决、不弹卡。统筹收到此类请求或自己发现材料性选择时**必须发 decision 卡**：卡内提供选项且**恰好一个 `recommended: true`**；不得自决、不得把选择说成客户批准；客户开启「替我决策」时判断 agent 默认选推荐项；收到结果后按选项执行并记录，不触发 gate / 最终验收。decision 卡独立于提案 / 任命 / 验收；**不是客户批准**；不写 `customer.decision` 的验收 / 提案语义。
  - 运行时契约（**只读核对、属运行时核心 / 编排角色在飞改动，本批未修改未验证**）：`src/provider/runtime/schema.ts` 的 `cardKind` 枚举新增 `decision`（"`decision` = material-choice card, sent ONLY by the Steward/统筹"），选项新增可选布尔 `recommended`（"A decision card must have exactly one option with `recommended: true` (validated by the application)"）；`src/provider/runtime/tools.ts` 的 `CHOICE_CARD_KINDS` 已含 `decision`，`readOptions` 只透传 `recommended`（不代选、不补默认值）；`src/pipeline/orchestration/run-role.ts` 以 `decisionKind: "material-choice"` 分类记账、不进入 proposal / appointment / acceptance 语义（该文件在并行在飞期间曾出现 typecheck 诊断，最终复跑已由属主修复，见 §6）。
- 范围：只改本角色授权写集——`src/common/门禁引擎/governance-roles.ts` 的 `LIAISON_CARD_TEXT` / `CONVENER_CARD_TEXT` 产品数据文本、`test/门禁引擎/decision-card.test.ts`（新）、`test/门禁引擎/governance-trio.test.ts`（一处 cardKind 纪律断言按新契约更新）、本角色 changelog / memo / feature-map 与本变更记录。未改 `src/model/**`、`src/provider/**`、`src/common/编排/**`、`src/pipeline/**`、`app/**`、共享 i18n、桌面 / 模型实现或 `demos/`；未 commit / push；未重启应用；未跑真实 Electron / 浏览器。

## 1. 写前核对与基线

- `git rev-parse HEAD` = `5bd9fe48194c48de8898e1c85aad2c8c386a3aea`（分支 `feat/scaffold-first-governance`）。
- `node --version` / `npm --version` = v24.22.1 / 11.19.1。
- 工作树已有其他角色在飞改动（共享 i18n、编排 / 运行时核心 / 桌面 / 项目管理文档），本批只在其上增量修改本角色文件，未回退任何既有批次。
- 写后候选哈希（`git hash-object` / `sha256sum`；文档编辑不影响下列代码 / 测试候选）：
  - `src/common/门禁引擎/governance-roles.ts` = `bf04bb79483edc67457edaa846daa4013d1b0271` / `140d1fa91c2a7b8d096298a172249a53fe3d7d3587cafd8a45dc398236668276`
  - `test/门禁引擎/decision-card.test.ts` = `dd530123f634517f5a4317b17acfebfc3c22ca9d` / `1c56cab77da3cb873779d6dabd7b4e38e1b6ea5d6d4b10731770184287fb1f32`
  - `test/门禁引擎/governance-trio.test.ts` = `e61c7e253da165e031429aa10d0f7c7dcfff9d23` / `553643df96cca7b359fdf8a9c57c82488ae8795872983d85b4e89c50df56ea65`

## 2. `LIAISON_CARD_TEXT`（Lead / 主理）

- 「治理协调（Lead / 主理）」在「系统消息只汇报、不派任务（必须）」之后新增 **「材料性选择交统筹发 decision 卡（必须）」**：发现真实启动演示方式、验收证据方式、范围、标准 / 契约偏离、成本、客户可见行为等材料性选择时，**不得在聊天里自己定、不得自行按某一方案推进、不得说成客户已同意或内部选择**；按现有门禁给 Steward / 统筹 派协调任务（带 `flowId`、问题、候选方案、影响与建议），由统筹发 `request_choice`（`cardKind=decision`）客户确认卡；**Lead 仍只发 `intent-confirm`，decision 卡由统筹发**；未获客户 / 判断 agent 明确选择前不按任一方案推进；材料性选择若来自系统消息，仍按「系统消息只汇报、不派任务」只向客户汇报、不据此派任务，客户消息或 Lead 自己工作发现触发的才派协调任务；内部实现细节仍可自决、不弹卡。
- 「内部决策纪律（必须）」保留原有句子（内部工程 / 协调选择不得发 `request_choice`、内部决策自决或派协调任务并用 flow 工具记录、不得包装内部选择），并追加 **「材料性选择不属于内部决策」**：材料性选择不得在聊天里自己定、不得包装成内部选择，按「治理协调」交统筹发 `cardKind=decision` 客户确认卡。
- 治理卡参数纪律补一句：`decision` 卡由统筹发，不由 Lead 发；Lead 仍只用 `intent-confirm`。
- **「系统消息只汇报、不派任务（必须）」逐字保留**（客户 2026-10-26 同日追加规则不回归）：`[系统·治理协调]`、gate pass / fail 系统行、交付 / 阻塞通知只向客户汇报，不得给 Steward / 统筹 发任务 / `dispatch_task`；客户消息路径不变。

## 3. `CONVENER_CARD_TEXT`（Steward / 统筹）

- 新增 **「## Decision 卡（材料性选择，必须）」**（位于标准工作流与「Gate 规划（必须）」之间）：
  - **何时发**：收到 Lead / 主理 材料性选择协调任务，或自己在规划 / readiness / 派发 / 证据检查中发现材料性选择（真实启动演示方式、验收证据方式、范围、标准 / 契约偏离、成本、客户可见行为等）时**必须发 decision 卡**；不得自行决定、不得聊天定案、不得把推荐项或既有做法说成客户已同意 / 已选定，也不得以「主理已转达」跳过客户确认；内部实现细节（契约措辞、实现细节、排期等）按既有流程自决、不发 decision 卡、不包装成客户决定。
  - **卡形态**：`request_choice`（`cardKind=decision`、`flowId` 必填）；`title` 写清问题与影响；`options` 提供真实可执行、彼此可区分的候选方案（逐项写效果 / 代价 / 影响，不得只发一个推荐项冒充选择）；**恰好一个**选项带 `recommended: true`（其余不带或为 `false`），推荐项只是建议，不是预选、不是客户已选择；`preview` 可附方案影响对比。
  - **不得自决**：发卡前后不得按任一方案推进、不得先做后补卡、不得把「未反对 / 沉默」当选择；未获明确选择（拒绝 / 超时 / 通道不可用）时如实报告并等待，不按推荐项继续、不重复刷同一张卡。
  - **「替我决策」**：客户开启时判断 agent 会**默认选择推荐项**并标 `judge 代批`；这是客户授权范围内代选，不得声称客户本人点击 / 亲自批准，不改变任何门槛；代批结果与客户本人选择同口径执行。
  - **收到结果后**：按客户 / 判断 agent 选中的选项执行，把问题、选项、推荐项、选择来源与执行结果记录到 `docs/scheduling/**` 或 `docs/governance/convener/**`；客户选非推荐项时按客户选择执行，不得改回推荐。
  - **与 gate / 验收分离**：decision 卡独立于提案 / 任命 / 验收——**不是客户批准**，不是提案接受、任命或验收通过，不写 `customer.decision` 的验收 / 提案语义（应用按 `cardKind=decision` 记账）；不触发 gate 复核 / `request_gate_review`、不触发 `request_acceptance` / 最终验收、不进入验收分诊，也不得用 decision 结果推进闸门 1 / 闸门 2。
- 标准工作流列表后新增指针：遇到材料性选择时按「Decision 卡（材料性选择，必须）」执行——发卡确认、不自决；结果只解决该问题，不触发 gate / 最终验收。
- 治理卡参数纪律：`request_choice` 白名单由「只用 `appointment`」改为「只用 `appointment` / `decision`」；缺 `flowId` / `cardKind` 仍是无效治理调用（本次不发卡、退回补齐重发）。
- 确认卡约定新增：材料性选择用 `request_choice`（`cardKind=decision`，选项恰好一个 `recommended: true`）。
- 既有 appointment、schedule-write、预约卡 / 流程 / 证据 / gate / 验收规则、禁写与写权逐字保留。

## 4. 测试

- 新增 `test/门禁引擎/decision-card.test.ts`（5 例，全部卡文本数据面断言）：
  1. Steward 必须发 decision 卡、不得自决、内部实现细节不弹卡；
  2. options / `cardKind=decision` / `flowId` / **恰好一个 `recommended: true`**；
  3. 回执按选项执行并记录、未获选择不自决、「替我决策」判断默认选推荐项（`judge 代批`）；
  4. decision 独立于提案 / 任命 / 验收，不是客户批准、不写 `customer.decision` 的验收 / 提案语义、不触发 gate / 最终验收；Decision 章节不得混入其它 cardKind；
  5. Lead 材料性选择不得聊天自定、交统筹发卡、内部实现细节仍可自决；「系统消息只汇报」规则保留；decision 通道只由统筹卡定义（Draft / Crew / Proof 不定义），注册表数据面（entries / 预授权 / 禁写 / 能力位）零变化。
- `test/门禁引擎/governance-trio.test.ts`：把 Steward「`request_choice` 只用 `appointment`」的既有断言按新契约更新为「只用 `appointment` / `decision`」（同等严格、逐字匹配，不删除不放宽）；其余既有断言未动。
- `governance-standard-workflow.test.ts` 中 Lead「内部决策纪律（必须）」、Steward「接受 Lead 协调」等既有断言全部保留并继续通过（Lead 新增句子为追加，不改旧句）。

## 5. 验证结果（本批写后）

- 定向：`node --test test/门禁引擎/decision-card.test.ts test/门禁引擎/governance-trio.test.ts test/门禁引擎/governance-standard-workflow.test.ts` ⇒ **81 计 / 81 过 / 0 失败 / 0 skip，exit 0**。
- 本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **335 计 / 334 过 / 0 失败 / 1 Windows 既有 skip，exit 0**（本批新增 5 例）。
- `npm run typecheck`：本批首次运行 **exit 0**；中间因并行在飞改动出现边界外诊断（`src/pipeline/orchestration/run-role.ts(2654,16)`：`"material-choice"` 未加入 `GovernanceDecisionKind`，属运行时核心 / 编排属主在飞工作）；写文档后**最终复跑 exit 0，0 错**，本批改动文件 0 诊断。
- 未跑跨角色端到端 / 真机 Electron / 浏览器；未独立验收。

## 6. 未做 / 依赖其他角色 / 残余风险

- **卡文本是行为约束，不是实现证据**：`cardKind=decision` 白名单、判断 agent 默认选推荐项、`recommended` 恰好一个的应用校验、`decisionKind: "material-choice"` 记账等由运行时核心 / 编排 / 桌面角色实施；本批只读核对了在飞契约，未修改、未验证。
- 只读核对（核对时点，未改、未验证）：编排 `run-role.ts::TRIO_CARD_KINDS` 已把 `decision` 仅加入 convener 白名单（liaison 仍仅 `intent-confirm`），与卡文本「decision 卡由统筹发」一致；`src/model/runtime.ts::GOVERNANCE_CARD_GROUP` 亦登记 `decision: "decision"`。并行改动仍在进行，最终以属主实现与端到端验证为准。
- 中间并行在飞时曾出现 `run-role.ts:2654` 的 `"material-choice"` / `GovernanceDecisionKind` 诊断（已由属主在最终复跑前修复，现全仓 typecheck exit 0）；decision 卡的运行时类型 / 分类记账仍属运行时核心 / 编排角色。
- 判断 agent 在「替我决策」开启时默认选推荐项、decision 结果不触发 gate / 验收，依赖编排分类与门禁实现；卡文本无法机械保证模型遵从（不自决、恰好一个推荐项）。
- 桌面卡片呈现 `recommended` 标记与 i18n 文案、账本审计字段的消费接线未由本批验证。
- 未 commit / push、未重启应用、未触碰 `demos/`。
