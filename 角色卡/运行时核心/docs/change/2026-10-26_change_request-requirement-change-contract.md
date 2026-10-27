---
id: request-requirement-change-contract-change
type: change
title: "需求变更申请契约与工具：request_requirement_change（Model/Provider 层）"
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: implemented-unverified
related: [runtime-core]
events:
  - date: "2026-10-26"
    kind: implemented
    summary: 客户要求下新增 RequestRequirementChangeInput/Result/Fn 与 GovernedToolsOptions.requestRequirementChange、request_requirement_change 工具与 schema；仅报告员注入时注册，工具只做形状校验并原样转达回执，未知 code fail-closed；request_clarification/其它工具零回归；新增 request-requirement-change-tool.test.ts 10 例；runtime-core 全目录 354 计/347 过/3 既有 Windows symlink 红/4 skip（基线 344/337/3/4，+10/+10 零新红）；npm run typecheck exit 0
  - date: "2026-10-26"
    kind: revised
    summary: 客户两次纠正审批路径后定稿——审批不由主理：需求变更审批卡由提案角色（Rapporteur）或统筹发起/持有（decision 卡；「替我决策」→判断 agent 按推荐项，未开启→客户手选），发起方不得自批，主理只在批准后执行意图变更；成功回执/schema/描述/promptGuidelines/测试/角色文档同步，不写「主理走 intent-confirm 审批」；类型、code 枚举、参数校验、能力注入与零回归不变
---

# 需求变更申请契约与工具（`request_requirement_change`）

**状态分开写**：已实现（下列改动路径全部落盘）；已验证（本机 Windows 上的新增测试、runtime-core 全目录回归与 `npm run typecheck`，见「验证」）；**未验证**（应用侧意图校验/去重/派发、注入端接线、真实桌面/模型端到端、独立验收、非 Windows 平台）。

依据：客户要求——**报告员/Draft 起草提案时发现需要新的客户授权/范围（或约束/成本变化），不得把未获授权的诉求塞进提案卡，而应发起需求变更申请，进入需求变更审批**。客户要求本工具**只给报告员/Draft（rapporteur）注入；未注入不注册**。同一需求变更通道的共享 i18n key 与工程法案第 15 条由项目管理角色另行落盘（`角色卡/项目管理/docs/change/2026-10-26_change_requirement-change-request.md`，本批只读参考、未修改），其冻结回执 code 与本契约一致。

## 客户纠正（2026-10-26）：审批路径

客户先纠正「交主理、主理走意图变更 + intent-confirm」的旧方案，再补充发起方范围。**现行文案以最终版为准**：

- 需求变更审批**不由主理完成**：审批卡为 decision 卡，由**提案角色（Rapporteur）或统筹**发起/持有（两者都可）；
- 勾选「替我决策」时由判断 agent 按推荐项决定，未勾选时由客户手选；
- **发起方不得自批**；
- **主理不审批，只在批准后执行意图变更**；
- 成功回执固定：`已提交需求变更审批（提案/统筹 decision 卡；替我决策→判断 agent，未开启→客户手选）；申请≠批准；主理只在批准后执行意图变更，不审批；发起方不得自批`；**不写**「主理走 intent-confirm 审批」。

`dispatched` 仍只表示已提交、不代表通过；失败/契约外 code fail-closed 不变；类型、code 枚举、参数校验、能力注入与既有工具零改动。

本任务范围只有运行时核心的契约、工具、schema、测试与本角色文档；应用侧实现（意图记录校验、去重/票据、审批卡衔接与批准后主理执行投递、系统行/账本）与注入端（编排/桌面）不在本轮写集。

## 以前怎样、现在怎样

**以前**：报告员发现提案需要新授权/范围时没有专用申请通道——只能塞进提案卡（让未授权内容「顺带获批」）或停住；没有结构化回执，也无法区分「已提交申请」与「客户已授权」。

**现在**：新增与 `request_acceptance` / `request_boundary_change` 同模式的申请通道：

- `src/model/runtime.ts` 冻结四符号＋一个能力位：
  - `RequestRequirementChangeKind = "scope" | "authorization" | "constraint" | "cost" | "other"`；
  - `RequestRequirementChangeInput { flowId?: string; intentId?: string; changeKind: RequestRequirementChangeKind; summary: string; rationale: string; impact?: string; proposedIntentPatch?: string }`（`flowId`/`intentId` 至少一个；`proposedIntentPatch` 只是建议，**不替客户改意图**）；
  - `RequestRequirementChangeResult { ok; code: "dispatched" | "already-dispatched" | "invalid" | "intent-not-found" | "flow-not-found" | "unavailable" | "rejected"; message; flowId?; intentId?; requestId? }`；
  - `RequestRequirementChangeFn = (input) => Promise<RequestRequirementChangeResult>`；
  - `GovernedToolsOptions.requestRequirementChange?: RequestRequirementChangeFn`（**只给报告员（Draft/rapporteur）注入**；未注入 ⇒ 工具不注册）。
- `src/provider/runtime/tools.ts` 注册 `request_requirement_change`：
  - handler **只做参数形状校验**并**原样转达**应用回执（`ok`/`code`/`message`，可选 `flowId`/`intentId`/`requestId`）；
  - 契约外回执（缺失/非对象/缺 `ok`/`code`/`message`/未知 code）⇒ fail-closed「未返回明确结果」，按未提交处理；所谓 `submitted`/`accepted`/`done` 等契约外 code 同样**绝不当成功**；
  - 能力抛错/会话中止 ⇒ 如实「未完成/未获结果」，不假设已提交。
- `src/provider/runtime/schema.ts` 登记工具描述：**只注入给报告员**、不得塞进提案卡、审批卡由**提案角色（Rapporteur）或统筹**发起/持有（decision 卡）、「替我决策」→判断 agent 按推荐项/未开启→客户手选、**发起方不得自批**、主理不审批只在批准后执行意图变更、至少一个归属、`changeKind` 枚举、有界文本、建议不替客户改意图、**申请≠批准**、失败不伪装。

`request_clarification` 及其它既有工具的工具、输入输出、冻结 code、文案、注入条件与行为**未改**（零回归由测试钉住）。

## 工具层校验（触达能力之前，不猜测、不截断）

| 参数 | 规则 | 非法时 |
| --- | --- | --- |
| `flowId` / `intentId` | 各自可选，均须匹配 `GOVERNANCE_SLUG_PATTERN`（`^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`，2–64 位）；**两者至少给一个** | 拒绝（`ok:false`，`未执行`）；能力零调用 |
| `changeKind` | **必填**，恰五值：`scope` / `authorization` / `constraint` / `cost` / `other` | 拒绝；能力零调用 |
| `summary` | **必填**非空字符串，≤500 字（按 Unicode 码点计，超长拒绝、不截断） | 拒绝；能力零调用 |
| `rationale` | **必填**非空字符串，≤4000 字（同上） | 拒绝；能力零调用 |
| `impact` | 可选；缺省/`null`＝未提供；给出时须为非空字符串且 ≤2000 字 | 拒绝；能力零调用 |
| `proposedIntentPatch` | 可选；缺省/`null`＝未提供；给出时须为非空字符串且 ≤4000 字；**只是建议**，不替客户改意图 | 拒绝；能力零调用 |
| 未知参数 | 一律拒绝（`additionalProperties:false` 的 handler 同款守卫） | 拒绝；能力零调用 |

归属存在性（flow/intent 是否真实存在）、`changeKind` 与内容是否匹配、是否重复申请等语义校验**全部由应用能力负责**（本层不读文件、不判治理）。四个文本上限是工具层的本地约定（设计未给数值；本层选保守上限并在 schema 描述中公开），超长拒绝而非静默截断。

## 回执语义（冻结 code；工具原样转达）

| code | 工具呈现 | 纪律 |
| --- | --- | --- |
| `dispatched` | `ok:true`：已提交需求变更审批（提案/统筹 decision 卡） | **申请≠批准**；发起方不得自批；主理不审批、只在批准后执行意图变更 |
| `already-dispatched` | 按应用 `ok` 原样转达（此前已提交/未重复提交） | 同一 flow/intent 有 pending 申请时不重复提交；等待审批（提案/统筹 decision 卡） |
| `invalid` | `ok:false`：未成功 | 参数/语义非法，不提交；按 message 修正 |
| `intent-not-found` | `ok:false`：未成功 | 不猜意图、不自动建意图 |
| `flow-not-found` | `ok:false`：未成功 | 不猜流程、不自动建流程 |
| `unavailable` | `ok:false`：未成功（可能已提交） | 不谎报已提交；如实告知并核对 |
| `rejected` | `ok:false`：被应用**退回** | **不代表客户拒绝**；按 message 修正后重交，不原样死循环 |
| 契约外（未知） | `ok:false`：应用未返回明确结果，按未提交 | 绝不当已提交/已获批准 |

成功回执文案固定重申：**已提交需求变更审批（提案/统筹 decision 卡；替我决策→判断 agent，未开启→客户手选）；申请≠批准；主理只在批准后执行意图变更，不审批；发起方不得自批**；`proposedIntentPatch` 只是建议，不得宣称意图已改。工具**不写盘、不弹决定卡、不改变任何写权**。

## 改动路径（位置 → 改动）

| 文件 | 改动 |
| --- | --- |
| `src/model/runtime.ts` | 新增 `RequestRequirementChangeKind/Input/Result/Fn`（含章节注释与纪律；2026-10-26 客户纠正后注释改为「审批卡由提案/统筹发起、发起方不得自批、主理不审批只在批准后执行意图变更」）与 `GovernedToolsOptions.requestRequirementChange?`；既有类型/`requestClarification`/`requestBoundaryChange` 形状未动。 |
| `src/provider/runtime/tools.ts` | 新增 `REQUEST_REQUIREMENT_CHANGE_TOOL_NAME`；参数键集、`REQUEST_REQUIREMENT_CHANGE_CODES` 冻结枚举、`REQUEST_REQUIREMENT_CHANGE_KINDS`、`REQUEST_REQUIREMENT_CHANGE_LIMITS`（500/4000/2000/4000）、必填/可选有界文本校验、`requestRequirementChangeResultMessage`（成功文案按客户纠正定稿）、`makeRequestRequirementChangeTool`；`abortedToolResult` 增本工具中止文案；`buildGovernedTools` 注入才注册。 |
| `src/provider/runtime/schema.ts` | 新增 `request_requirement_change` 分支：`{flowId?, intentId?, changeKind, summary, rationale, impact?, proposedIntentPatch?}`，`required:["changeKind","summary","rationale"]`、`additionalProperties:false`；描述/指引钉住报告员使用（申请也可由统筹发起）、不塞提案卡、审批卡由提案/统筹发起（decision 卡）、发起方不得自批、主理不审批只在批准后执行意图变更、有界上限、建议语义、申请≠批准、失败不伪装；不再写「主理走 intent-confirm 审批」。 |
| `test/runtime-core/request-requirement-change-tool.test.ts` | 新增 10 例：未注入不注册（且不影响 `request_clarification`）、注入只新增本工具且既有工具 schema/描述零变化、schema 形状与文案钉点（含「提案/统筹 decision 卡／发起方不得自批／申请≠批准／主理不审批」且不出现 `intent-confirm` 审批路径）、载荷原样透传与缺省不造键、非法参数前置拒绝（归属/枚举/空值/超界/未知参数/slug 形状）、上限边界接受、回执 code 矩阵原样转达（成功文案按客户纠正定稿）、`rejected` 退回语义、未知 code（含 `submitted`/`accepted`/`done`）fail-closed、抛错/中止不假设已提交、`request_clarification` 零回归、Service `...options` 透传。 |
| `角色卡/运行时核心/docs/feature/runtime-core.md` | 记录本通道行为、回执纪律与当前接线状态。 |
| `角色卡/运行时核心/feature-map.md` | 新增功能导航行与证据链接。 |
| `角色卡/运行时核心/memo.md` | 追加本轮实施摘要。 |

## 明确不做 / 未覆盖（跨角色缺口）

1. **应用侧未实现**：意图记录校验、重复申请去重/票据（`requestId`）、审批卡（提案/统筹 decision 卡）衔接与批准后主理执行投递、账本/系统行全部属编排/桌面后续波次。本层不写盘、不派发、不弹卡。
2. **注入端未接线**：`src/pipeline/orchestration/run-role.ts` 与 `app/desktop/**` 均未为本能力注入 ⇒ **当前生产会话不会注册 `request_requirement_change`**（能力缺席＝fail-safe toward 现状，不改变任何现有行为）。
3. **未改意图/卡种/i18n**：不新增 `FlowStepKind`/cardKind、不改 `intent-confirm` 卡、不改共享 i18n（同通道 i18n key 属项目管理角色的并行写集）；本工具回执是工具面纯文本，桌面/编排系统行按各自契约生成。
4. **未改 `request_clarification`**：形状、校验、回执、注入范围、文案逐字不变（零回归由测试钉住）。
5. **仅报告员可用是注入端判据**：本层不硬编码角色 id（沿 `requestClarification` 先例）；若注入端错误地注入给其他角色，工具层不会按角色拒绝——注入范围测试属注入端。
6. 未跑真实模型/凭据/网络，未做独立验收；本机为 Windows 11。

## 验证（本机，2026-10-26）

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | exit 0，0 错（客户纠正文案后复跑） |
| 新增文件 `node --test test/runtime-core/request-requirement-change-tool.test.ts` | **10/10 通过**，exit 0（客户纠正文案后复跑） |
| `node --test "test/runtime-core/**/*.test.ts"` | **354 计 / 347 过 / 3 红 / 4 skip**（客户纠正文案后复跑，与实施轮一致）；3 红均为既有 Windows symlink EPERM（`file-write-safety` D3 链接用例 ×1、`session-store` ×2），与改动前基线 **344 计 / 337 过 / 3 红 / 4 skip** 相比 +10 计 +10 过、零新红 |

## 风险与后续

- **门禁只能靠注入端收紧**：工具层不判角色；若未来把能力注入给非报告员会话，需在注入端修正（与 `requestClarification` 同风险面）。
- **文本上限为本地约定**：设计未给数值；本层取 500/4000/2000/4000 字并在 schema 公开，应用侧若需更严可再收紧（但不要静默截断）。
- **回执依赖应用如实**：`unavailable` 时应用应写明「可能已提交，请核对」；工具层只如实转达，不重试、不猜测。
- **与 i18n 消费方的措辞一致性**：工具成功文案用「已提交需求变更审批（提案/统筹 decision 卡）；申请≠批准；发起方不得自批；主理只在批准后执行意图变更」；项目管理冻结的 i18n 用「申请 ≠ 授权」。两者语义一致，但消费方不得拼接出「已获授权」的表述。
- **端到端未验**：去重/票据、审批卡（提案/统筹 decision 卡）衔接、批准后主理执行投递、系统行与真实会话未接线，完整证据需应用侧实现后由独立验收补齐。

## 现行口径补充（2026-10-26 客户纠正）

审批卡不再由发起方手动调用 `request_choice` 发起：应用在 `request_requirement_change` 成功后自动经发起方会话的客户卡通道呈现 `decision` 卡（`approve` / `reject`，恰好一个推荐 `approve`），发起方不得再调用 `request_choice` 重复发卡；审批由客户或「替我决策」判断 agent 完成，主理只执行已批准任务。本文中「由你调用 `request_choice` / 审批卡由发起方发起」的旧表述以本条为准。
