# chief 角色模块 public API 实现报告（api-spec）

- 日期：2026-11-07；角色：chief-code（幕僚代码维护角色）；契约版本：E0.3（冻结 `067e3d2e…`，映射 E0.2 `798ce9ce…`）。
- 状态：E1 模块实现（implemented-unverified）+ **E2 接口评审 C-1 修复（2026-11-07：trio 工具集补入 `closeCreatedTask`）**；**不判验收**、不切换消费者、不改旧引擎。
- 模块唯一 public entry：`src/common/roles/chief/index.ts`；内部实现位于 `src/common/roles/chief/internal/`。

## 1. 导出面（`index.ts`）

| 导出 | 类型 | 用途 |
| --- | --- | --- |
| `chiefRoleModule` | `BuiltInRoleModule` | 六内置角色模块之一；E2 由门禁引擎门面装配/切换消费 |
| `CHIEF_HUB_DISPATCH` | `ChiefHubDispatchSpec` | hub 派发纯数据（routing/source/report/purpose/schema/五目标），供 E2 消费 |
| `CHIEF_INTENT_CONFIRM_CARD` | `ChiefIntentConfirmCardData` | intent-confirm 卡固定数据（选项/分组/代批范围） |
| `CHIEF_WORKFLOW_RESOURCE` | `RoleContextResourceRef` | chief-workflow 资源引用（path/version/sha256） |
| `CHIEF_POLICY_CODES` / `CHIEF_MESSAGE_KEYS` | 冻结常量对象 | preflight/dispatch 稳定内部码与 i18n messageKey |
| `CHIEF_TOOL_REASON_CODES` / `CHIEF_TOOL_MESSAGE_KEYS` | 冻结常量对象 | `tools()` 结构化原因码/键 |
| `CHIEF_TOOL_IDS` | `readonly RoleToolId[]` | tools() 声明的 6 个 chief 专属 id（含 E2 C-1 补入的 `closeCreatedTask`） |
| `ChiefHubDispatchSpec` / `ChiefHubTargetRoleId` / `ChiefIntentConfirmCardData` / `ChiefIntentConfirmOptionId` | type-only | E2/桌面只读类型 |

`chiefRoleModule` 形状（E0.3 §3.1，`src/model/role.ts`）：

```
id: "chief"; displayName: "幕僚"; function: "chief";
card: { text, entries, preauthorizedDirs, forbiddenWritePaths };
capabilities: { customerInput, dispatchTask, roleStatus, sessionTail, installSkill, installMcp, shell };
cards: readonly GovernanceCardKind[];   // ["intent-confirm"]
tools(input): RoleToolPolicy; dispatch(input): RoleDispatchPolicy;
preflight: { checkAction(input): RolePolicyDecision };
context(input): readonly RoleContextSection[];
```

## 2. 规格数据（与旧注册表逐字段一致）

| 字段 | 值/来源 |
| --- | --- |
| `id`/`displayName`/`function` | `chief` / `幕僚` / `chief`（`governance-roles.ts:313-315`） |
| `card.text` | 旧 `CHIEF_CARD_TEXT` 逐字（`governance-roles.ts:166-178`）；意图入口段用共享 `intentEntryContractText("chief")`（`src/common/shared/intent-entry-contract.ts`），不复制 |
| `card.entries` | `{root:"project", path:"docs/intents/", kind:"directory", purpose:"客户意图 / 沟通记录（intentId/handoffKind/goal/scope/acceptance/客户原话）"}` |
| `card.preauthorizedDirs` | `["docs/intents/"]` |
| `card.forbiddenWritePaths` | `.ans/`、`docs/bootstrap-manifest.md`、`角色卡/governance-boundary.yaml`、`角色卡/`、`docs/proposals/`、`docs/contracts/`、`docs/nominations/`、`docs/skills/`、`docs/mcp/`、`docs/governance/`、`docs/workflow.md`（顺序与旧表一致） |
| `capabilities` | `customerInput:true, dispatchTask:true, roleStatus:true, sessionTail:true, installSkill:false, installMcp:false, shell:"operator-approve"`（D10 唯一真源；`tools()` 输出为派生） |
| `cards` | `["intent-confirm"]`（旧 `run-role.ts:2864`；D8：不含 legacy `"write"`） |

数据来源均为只读 oracle：`src/common/门禁引擎/governance-roles.ts`、`src/pipeline/orchestration/run-role.ts`；差分见 §8。

## 3. `tools(input)` 语义

输入：`TrustedToolPolicyInput = { governanceModel: "single" | "trio" }`（E0.3 Q2：保持最小，宿主事实留注入层）。

| governanceModel | `tools` | `reasons` |
| --- | --- | --- |
| `trio` | `["roleActivityLog","terminateRoleRun","redispatchTask","projectNote","requestVersionDecision","closeCreatedTask"]` | `[]` |
| `single` | `[]` | `chief-tools-single-model`（`role.chief.tools.singleModel`） |
| 未知/缺失（运行时不可信输入） | `[]` | `chief-tools-governance-model-unknown`（fail-closed） |

- 6 个 id 的旧注入门控：`run-role.ts:1697-1699`（`trioSpec?.id === "chief"`）、`:1704`（同）、`:1705` + `:2344-2346`（`canRequestVersionDecision` 仅 chief）、`:1828`（`closeCreatedTask` 在 `directGovernance` 且 chief/convener）。
- **E2 接口评审 C-1（2026-11-07）**：trio 补入 `closeCreatedTask`——注册表允许 chief/convener，旧 `directGovernance` 下 trio chief 会注入；按模块 `tools()` 驱动装配不得丢失。模块只声明**允许集**；`directGovernance`（trio + builtInGovernance + isTrio + 非独立决策上下文）是会话模式事实，仍由注入层在真实注入时判定（E0.3 Q2 不扩 `TrustedToolPolicyInput`）。
- 宿主是否真正注册工具仍由注入层决定（`input.xxx !== undefined`）；本策略只声明角色允许集。未知/越权 id 由引擎装配 fail-closed（E0.3 §3.1 R-1）。
- D10：`tools().capabilities` 与模块 `capabilities` 为同一冻结引用（单元+类型测试断言）。
- **仍未声明的 chief 允许 id（列明方案差异）**：
  - `decidePendingRequest`（仅 chief 独立决策上下文）：注册表标记 `chiefIndependentDecisionOnly`；普通会话不得因声明获得（`provider/runtime/tools.ts:4233` `buildChiefDecisionTools` 由调用点装配）。
  - `projectState`（全部内置治理）、governance matrix、能力位工具（dispatch/roleStatus/sessionTail/install/customerInput/shell）不属于 `RoleToolId` 角色专属闭集，由引擎注入。

## 4. `dispatch(input)` 语义（R-2：只做硬身份/存在性）

允许的唯一分支：`sourceRoleId === "chief"`、`targetRoleId ∈ {product, rapporteur, nominator, convener, verifier}`、`targetKind === "built-in-governance"`、`targetExists === true` ⇒ `{decision:{allow:true}, reportToRoleId:"chief"}`。

其余 fail-closed（不返回 `reportToRoleId`）：

| 场景 | code | messageKey |
| --- | --- | --- |
| 来源缺失 | `chief-dispatch-source-missing` | `role.chief.dispatch.sourceMissing` |
| 来源非 chief | `chief-dispatch-source-not-chief` | `role.chief.dispatch.sourceNotChief` |
| 自派（target=chief） | `self-dispatch`（与旧编排逐字） | `role.chief.dispatch.self` |
| 目标类别未知 | `chief-dispatch-target-kind-invalid` | `role.chief.dispatch.targetKindInvalid` |
| 幕僚直接派项目 worker | `chief-to-project-forbidden`（与旧编排逐字） | `role.chief.dispatch.projectForbidden` |
| 目标不在五内置 / 不存在 / `targetExists` 缺省或 false | `target-card-missing`（与旧编排逐字） | `role.chief.dispatch.targetMissing` |

- `reportToRoleId` 仅作差分期望（真实创建者 chief），不驱动实际报告路由；实际路由仍由 `src/common/编排/workflow-preconditions.ts::reportTargetForTaskCreator` 决定（E0.3 R-2）。
- hub/legacy/review 路由、报告时点、run/module 规则不在本函数（留引擎）。
- `CHIEF_HUB_DISPATCH` 纯数据：`routing:"chief-hub-v1"`（`TASK_HUB_ROUTING`，Model 单一来源）、`sourceRoleId:"chief"`、`reportToRoleId:"chief"`、`purpose:"builtin-preparation"`、`workSourceSchema:"repository-work-source/v1"`、`targetRoleIds` 五内置（`apply-journal.ts:2923-2926` 同值）。

## 5. `preflight.checkAction(input)` 登记（E0.3 §3.4 / Q13）

覆盖动作：**`version-decision`**（chief 的版本决策申请）。其余动作 ⇒ `{allow:false, code:"action-not-covered", messageKey:"role.chief.preflight.actionNotCovered"}`。

### 事实包键（`facts`）

| 键 | 必填 | 类型/约束 | 缺失行为 |
| --- | --- | --- | --- |
| `flowId` | 是 | string，匹配 `GOVERNANCE_SLUG_PATTERN` | `chief-preflight-fact-missing` |
| `action` | 是 | `"version-modify" \| "new-version-development"`（`VERSION_DECISION_ACTIONS`） | `chief-preflight-fact-missing` |
| `reason` | 是 | string，trim 非空，码点长度 ≤ `VERSION_DECISION_REASON_MAX`(1000) | `chief-preflight-fact-missing` |
| `runId` | 否 | 非空 string（形状最终校验由宿主） | — |
| `refs` | 否 | string[]，≤ `VERSION_DECISION_REFS_MAX`(5)，每项 trim 非空（路径形状最终校验由宿主） | — |
| `runState` | 否 | `"draft" \| "pinned" \| "legacy"`；`pinned` ⇒ deny（应走 run-change） | — |
| `pendingVersionDecisionCount` | 否 | 非负安全整数；`> 0` ⇒ deny（不重复发卡） | — |

未知键 ⇒ `chief-preflight-fact-invalid`（`details.key`/`details.reason="unknown-key"`）。`facts` 非对象/缺失 ⇒ `chief-preflight-fact-missing`。

### 返回码 / i18n key

| code | messageKey | 含义 |
| --- | --- | --- |
| `action-not-covered` | `role.chief.preflight.actionNotCovered` | 动作不在 chief 覆盖范围 |
| `chief-preflight-fact-missing` | `role.chief.preflight.factMissing` | 必需事实缺失 |
| `chief-preflight-fact-invalid` | `role.chief.preflight.factInvalid` | 未知键/类型/取值不符 |
| `chief-version-decision-pinned-run` | `role.chief.preflight.versionDecisionPinnedRun` | pinned run 不走版本决策（走 run-change） |
| `chief-version-decision-pending` | `role.chief.preflight.versionDecisionPending` | 已有未决请求，不重复发卡 |

### 不替代的最终校验（preflight allow 不是权限/批准）

| 最终校验 | 位置 | 说明 |
| --- | --- | --- |
| 请求形状 | `src/common/编排/version-decision.ts::validateVersionDecisionRequest`（`:70`） | 未知键、slug、`runId` 形状、`refs` 项目相对路径、长度上限 |
| 上下文（pinned/多 run/pending） | 同文件 `validateVersionDecisionContext`（`:129`） | 由宿主在真实 run 派生上执行；本模块只用宿主给的 `runState`/`pendingVersionDecisionCount` 事实 |
| 客户决定/账本/执行 | 应用/Service（`request_version_decision` 回执链） | 申请≠批准；路线≠内容批准 |

## 6. `context(input)` 与资源引用

返回固定顺序三段（静态文本；不读盘、不消费 `facts`）：

| id | 内容 | resources |
| --- | --- | --- |
| `chief-workflow` | 读取应用注入 chief-workflow 全文/path/版本/SHA-256；缺失/不可核即阻塞 | `CHIEF_WORKFLOW_RESOURCE` |
| `chief-decision-context` | 唯一客户入口、客户卡化、真实回执/创建者/报告/收口纪律 | — |
| `chief-intent-confirm` | intent-confirm 发卡时机与 `confirm`/`revise` 语义 | — |

`CHIEF_WORKFLOW_RESOURCE`：

```
path: "src/common/门禁引擎/workflows/chief/chief-workflow.md"
version: "chief-workflow/v1"
sha256: "9bef5626c8e9d2d72487567d2d93366f05c178cfa23288add8a13b64e4b4f346"
```

- 资源根语义按现状：宿主 loader `src/provider/runtime/tools.ts::loadBuiltinChiefWorkflow`（`:167`）从应用包内读取该路径，并在读取时校验 Markdown 身份/资源版本/SHA-256；本模块只声明引用，不读盘。
- **维护规则**：chief-workflow 资源字节变化时，`CHIEF_WORKFLOW_RESOURCE.sha256` 须同步刷新；`differential.test.ts` 用宿主 loader 重算并逐字段断言（不同步即测试红）。
- 项目 `docs/workflow.md` 不是角色模块资源，由宿主在上下文装配时另行提供（来源/版本/hash 单列；E0.3 D5/Q4）。

## 7. `intent-confirm` 卡纯数据

`CHIEF_INTENT_CONFIRM_CARD = { cardKind:"intent-confirm", toolName:"request_choice", optionIds:["confirm","revise"], requiredOptionId:"confirm", judgeGroup:"decision", judgeDelegableOptionId:"confirm", customerOnlyOptionIds:["revise"], applicationOwned:false }`。

来源：`src/model/runtime.ts:780-788`（固定选项/用途）、`:837-865`（decision 组与代批语义）、`src/pipeline/orchestration/run-role.ts:2864`（chief 唯一卡种）、`src/provider/runtime/schema.ts:521-556`（`request_choice` 文案纪律）。本数据不构造卡、不写账本、不携带权限。

## 8. 差分与验证（摘要；全量见证据文档）

- `test/roles/chief/`：41 个测试（24 单元 + 13 差分 + 4 import/模块图），41/41 pass。
- 差异 0：card text/entries/preauthorized/forbidden/capabilities/displayName/function、cards、6 工具 id（含 `closeCreatedTask`）允许集与映射名、chief 来源 + `targetExists:true` 的 dispatch 判定、preflight 请求形状子集、资源 path/version/sha256、hub 目标集。
- 列明方案差异：① `targetExists` 缺省/false 时本模块 fail-closed（旧硬授权对 chief→内置不读该字段）；② 本模块只回答 chief 来源（convener 来源由 convener 模块/引擎回答）；③ preflight 不复制 `runId`/`refs` 的路径形状最终校验；④ `decidePendingRequest` 不在普通会话 `tools()`（仅独立决策上下文由引擎调用点装配；E2 C-1 已将 `closeCreatedTask` 补入声明）。
- 依赖扫描：模块源仅 import `src/model/`、`src/common/shared/` 与自身 internal；零跨角色/引擎 import；模块根只有 `index.ts`。
- `npm run typecheck`：**最终复跑 exit 0**（全仓）；本模块/测试隔离 `tsc` 亦 exit 0。期间曾观察到并发 gates-code 在途未跟踪文件 `test/gates/module-graph.test.ts(98,14) TS2339` 的瞬时错误，gates-code 修复后全仓通过；本角色未修改该文件。

## 9. 边界与遗留

- 本模块不写旧引擎、不改 `src/model/**`、不切换消费者（E2 由消费 owner 执行）；旧引擎在 E2 前仍是权威/oracle。
- i18n messageKey 目前是稳定内部键（未登记 locales；E2 若对外呈现再登记）。
- `CHIEF_WORKFLOW_RESOURCE.sha256` 为数据 pin，资源更新须同步；E1 接口评审可细化“应用资源根”的 loader 语义。
- `tools()` 现声明 6 个 chief 专属 id（E1 五个 + E2 C-1 的 `closeCreatedTask`）；`decidePendingRequest` 仍留给引擎独立决策上下文调用点，不随普通会话声明。
