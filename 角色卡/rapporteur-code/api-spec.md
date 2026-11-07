# rapporteur 角色模块 public API（实现报告）

- 日期：2026-11-07
- 角色：rapporteur-code（策划代码维护角色）
- 契约：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（E0.3 冻结，685 行 / SHA-256 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`）
- 状态：E1 模块已实现并自测；**未提交/未推送**；旧引擎仍为权威 oracle（E2 切换前）。
- 模块：`src/common/roles/rapporteur/`（唯一 public entry `index.ts`；内部实现只在 `internal/`）。

## 1. public entry

```ts
export const rapporteurRoleModule: BuiltInRoleModule;
```

- 唯一 public 值导出；无 default export、无其他导出。
- `BuiltInRoleModule` 类型来自 `src/model/role.ts`（E0 冻结形状）。
- 模块对象与全部数据冻结（`Object.freeze`），调用方不可改写。

## 2. 规格数据（`BuiltInRoleModule` 数据字段）

| 字段 | 值/行为 | 与旧 oracle 关系 |
| --- | --- | --- |
| `id` | `"rapporteur"` | 逐字段一致 |
| `displayName` | `"策划"` | 逐字段一致 |
| `function` | `"proposal"` | 逐字段一致 |
| `card.text` | 旧 `RAPPORTEUR_CARD_TEXT` 逐字节一致（4676 字符 / 34 行 / SHA-256 `4214c632d0215932ce6ce0dae8f39ae6b8e4a226ce487b58f9e0461552cb5a65`） | 差分 = 0；意图入口段落经共享 `intentEntryContractText("rapporteur")` 单源插值 |
| `card.entries` | `docs/proposals/`、`docs/contracts/`、`docs/governance/rapporteur/`（root 恒为 project） | 逐字段一致 |
| `card.preauthorizedDirs` | 与 entries 同三目录 | 逐字段一致 |
| `card.forbiddenWritePaths` | 11 项：`.ans/`、`docs/bootstrap-manifest.md`、`角色卡/governance-boundary.yaml`、`角色卡/{chief,product,rapporteur,nominator,convener,verifier,su}/`、`docs/nominations/` | 逐字段一致 |
| `capabilities` | `customerInput:true`、`dispatchTask:false`、`roleStatus:false`、`sessionTail:false`、`installSkill:false`、`installMcp:false`、`shell:"operator-approve"` | 逐字段一致；D10 唯一真源 |
| `cards` | `["proposal","decision"]` | 与旧 `TRIO_CARD_KINDS.rapporteur` 一致；D8 无 legacy `"write"` |

## 3. `tools(input: TrustedToolPolicyInput): RoleToolPolicy`

| 输入 | 行为 |
| --- | --- |
| `governanceModel === "trio"` | `tools: ["requestRequirementChange","submitVersionChange","selectRunChange"]`（顺序固定，冻结数组）；`reasons: []` |
| `"single"` / 未知 / 运行时畸形（`null`、非字符串等） | `tools: []`；`reasons: [{ code:"rapporteur-tools-governance-model-unsupported", messageKey:"role.rapporteur.tools.governanceModelUnsupported", details:{governanceModel} }]`（fail-closed） |

- 三个 id 与旧 `run-role.ts` 注入门控一致：`requestRequirementChange`（`isTrio && canRequestRequirementChange`）、`submitVersionChange`（role = rapporteur）、`selectRunChange`（trio 直通治理且非 chief 决策上下文）。
- 模块只声明**角色允许的额外注入 id**；`projectState` 等共有工具不重复声明；会话模式（chief 独立决策上下文）、宿主能力是否提供、最终注入由引擎负责。
- 未知 id / 越权 id 的 fail-closed 由门禁引擎 `role-tool-registry.ts::validateRoleToolDeclaration` 执行；本模块不维护第二份映射表，也不会返回闭集外值。
- `capabilities` 直接返回 spec 的同一冻结对象（D10 派生，不产生第二份）。

## 4. `dispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy`

R-2：只回答「该真实来源能否向该真实目标派发」。rapporteur **不是可派发来源**（旧硬授权只有 chief/convener），因此所有分支均为 deny，且**不返回 `reportToRoleId`**。

| 判定顺序 | 条件 | `code` | `messageKey` |
| --- | --- | --- | --- |
| 1 | `sourceRoleId` 缺失/空串 | `rapporteur-dispatch-source-missing` | `role.rapporteur.dispatch.sourceMissing` |
| 2 | `sourceRoleId !== "rapporteur"` | `rapporteur-dispatch-source-mismatch` | `role.rapporteur.dispatch.sourceMismatch` |
| 3 | `targetRoleId` 空/非串，或 `targetKind` 非 `project`/`built-in-governance` | `rapporteur-dispatch-target-invalid` | `role.rapporteur.dispatch.targetInvalid` |
| 4 | `targetExists !== true` | `rapporteur-dispatch-target-missing` | `role.rapporteur.dispatch.targetMissing` |
| 5 | 来源/目标均真实 | `rapporteur-dispatch-not-authorized` | `role.rapporteur.dispatch.notAuthorized` |

- 旧 oracle：`evaluateDispatchAuthorization` 对来源 rapporteur 一律 `unknown-source`（allow 位一致 = false；稳定码差异已登记，见 §9）。
- hub/legacy/review 路由、报告时点、实际 `reportTargetForTaskCreator` 不在模块内（契约 §3.1 R-2）；报告期望在 `context()` 静态声明。

## 5. `preflight.checkAction(input: RolePreflightInput): RolePolicyDecision`

### 5.1 动作覆盖

| action | 覆盖 | 说明 |
| --- | --- | --- |
| `detail-amendment` | 是 | 整单修正案策略 |
| `run-change` | 是 | run 三模式选择策略 |
| `requirement-change` | 是 | 需求变更申请 |
| 其它（`review`/`version-upgrade` 等） | 否 | deny `action-not-covered` / `role.rapporteur.preflight.actionNotCovered` |

### 5.2 事实包纪律

- `facts` 必须是普通对象；否则 deny `rapporteur-facts-invalid`。
- 只允许读取下表登记的键；**未知键** ⇒ deny `rapporteur-facts-unknown-key`（不静默忽略）。
- 缺键 ⇒ deny `rapporteur-facts-missing`；类型/取值不符 ⇒ deny `rapporteur-facts-invalid`。
- `allow:true` 只表示纯策略不反对，不是权限票；Service/Provider 最终校验不因 preflight allow 省略。
- `details` 只含动作名、事实键、期望/实际类型或枚举值等 JSON 普通数据。

### 5.3 `detail-amendment` 事实键

| 键 | 必填 | 类型/取值 | 缺失/不符行为 |
| --- | --- | --- | --- |
| `initiatorRoleId` | 是 | 非空字符串；必须为 `"rapporteur"` | 缺失 `rapporteur-facts-missing`；非字符串/空串 `rapporteur-facts-invalid`；非 rapporteur `rapporteur-initiator-mismatch` |
| `kind` | 是 | 非空字符串；必须为 `"detail-amendment"` | 缺失/类型不符 `rapporteur-facts-invalid`（缺失为 `rapporteur-facts-missing`）；值不符 `rapporteur-facts-invalid` |
| `wholeOrder` | 是 | boolean；必须为 `true` | 缺失 `rapporteur-facts-missing`；非布尔 `rapporteur-facts-invalid`；`false` ⇒ `rapporteur-amendment-not-whole-order` |
| `legacyCardPath` | 是 | `"none"` / `"proposal-accept"` / `"vca-batch-decision"` / `"amendment-item-confirm"` / `"amendment-final-card"` / `"legacy-approver"` | 未知值/类型不符 `rapporteur-facts-invalid`；非 `"none"` ⇒ `rapporteur-amendment-legacy-card-path` |

对应 Service 最终校验（不替代）：VCA/trunk 直接提交路径校验真实 actor、kind、operationId、baseTrunk、targets、expected hashes、权限、snapshot/commit（`src/service/trunk/impl/apply-journal.ts:567` 等）。

### 5.4 `run-change` 事实键

| 键 | 必填 | 类型/取值 | 缺失/不符行为 |
| --- | --- | --- | --- |
| `initiatorRoleId` | 是 | `"rapporteur"` | 同上 |
| `mode` | 是 | `RUN_CHANGE_MODES`：`continue-frozen` / `stop-and-restart` / `stop`（Model 单源） | 缺失 `rapporteur-facts-missing`；非字符串 `rapporteur-facts-invalid`；未知值 `rapporteur-run-change-mode-invalid` |
| `operationId` | 是 | 非空字符串 | 缺失 `rapporteur-facts-missing`；空/非串 `rapporteur-facts-invalid` |
| `runId` | 是 | 非空字符串 | 同上 |
| `expectedPinDigest` | 是 | 非空字符串 | 同上 |
| `targetTrunkVersion` | 是 | 整数 ≥ 1 | 缺失 `rapporteur-facts-missing`；非整数/小于 1 `rapporteur-facts-invalid` |
| `targetTrunkDigest` | 是 | 非空字符串 | 同上（非空串） |
| `reason` | 是 | 非空字符串 | 同上 |

- 模块**不采集、不判定停稳证据**（契约 §3.2：停稳证据不进入模块）；`stop`/`stop-and-restart` 的实际停稳、两阶段提交、pin/目标真实一致性与 CAS 仍由 `apply-journal.ts::selectRunChange`/`prepareRunChange` 及宿主核验。
- 旧 direct 路径对 `stop`/`stop-and-restart` 返回 `blocked(run-stop-unverified)`；模块 `allow` 只表示角色侧策略不反对（已登记差异）。

### 5.5 `requirement-change` 事实键

| 键 | 必填 | 类型/取值 | 缺失/不符行为 |
| --- | --- | --- | --- |
| `initiatorRoleId` | 是 | `"rapporteur"` | 同上 |
| `changeKind` | 是 | `scope` / `authorization` / `constraint` / `cost` / `other` | 缺失 `rapporteur-facts-missing`；未知值/非串 `rapporteur-facts-invalid` |
| `flowId` / `intentId` / `taskId` | **至少一个** | 出现时须为非空字符串 | 三者全缺 `rapporteur-requirement-change-ref-missing`；出现但空/非串 `rapporteur-facts-invalid` |
| `summary` | 是 | 非空字符串 | 缺失 `rapporteur-facts-missing`；空/非串 `rapporteur-facts-invalid` |
| `rationale` | 是 | 非空字符串 | 同上 |
| `impact` | 否 | 出现时非空字符串 | 空/非串 `rapporteur-facts-invalid` |
| `proposedIntentPatch` | 否 | 出现时非空字符串 | 空/非串 `rapporteur-facts-invalid` |
| `claimsApproved` | 否 | boolean；出现时必须为 `false` | 非布尔 `rapporteur-facts-invalid`；`true` ⇒ `rapporteur-requirement-change-approval-claimed` |
| `selfApproval` | 否 | boolean；出现时必须为 `false` | 非布尔 `rapporteur-facts-invalid`；`true` ⇒ `rapporteur-requirement-change-self-approval` |

对应 Service/应用最终校验（不替代）：`request_requirement_change` 工具/schema 的长度与枚举校验、归因归属、去重、派发、账本与审批卡登记（`src/provider/runtime/schema.ts:1319-1398`、Model `RequestRequirementChangeInput`）；发起方不得自批由应用通道与判断规则保证。

## 6. `context(input: RoleContextInput): readonly RoleContextSection[]`

| section id | 内容 | resources |
| --- | --- | --- |
| `rapporteur-role` | 角色职责 / Section 1 / 能力以实际注入为准 | 无 |
| `rapporteur-decision-context` | detail-amendment 整单、run-change 三模式、requirement-change 申请纪律、fail-closed 口径 | 无 |
| `rapporteur-report-expectation` | 报告回 `task.created.from`；报告≠关闭；不得伪造身份/批准 | 无 |
| `rapporteur-decision-card` | 可发卡种 `proposal`/`decision`；decision 仅需求变更审批；结构约束（flowId、≥2 唯一选项、恰一 recommended）；不是提案/验收批准 | 无 |
| `rapporteur-context-facts-rejected` | 仅当宿主传入未登记的 facts 时返回（fail-closed；未读取内容） | 无 |

- `governanceModel !== "trio"` ⇒ 仅返回 `rapporteur-governance-model`（不可用声明，fail-closed）。
- **不登记任何 context fact 键**：`facts` 缺省或空对象视为未提供；提供任何非空/非对象 facts ⇒ 仅返回
  `rapporteur-context-facts-rejected`（未读取、不静默当空值，fail-closed）。无资源引用；同一输入返回同一冻结数组。
- 文本为静态模板，不含运行时秘密/账本内容/未脱敏证据。

## 7. 错误码 / messageKey 登记

| code | messageKey | 使用处 |
| --- | --- | --- |
| `action-not-covered` | `role.rapporteur.preflight.actionNotCovered` | preflight 未覆盖动作（契约 §3.4 指定稳定码） |
| `rapporteur-facts-missing` | `role.rapporteur.preflight.factsMissing` | 必填事实缺失 |
| `rapporteur-facts-invalid` | `role.rapporteur.preflight.factsInvalid` | 类型/取值不符、facts 非普通对象 |
| `rapporteur-facts-unknown-key` | `role.rapporteur.preflight.factsUnknownKey` | 未登记事实键 |
| `rapporteur-initiator-mismatch` | `role.rapporteur.preflight.initiatorMismatch` | 发起人非 rapporteur |
| `rapporteur-amendment-not-whole-order` | `role.rapporteur.preflight.amendmentNotWholeOrder` | 非整单 |
| `rapporteur-amendment-legacy-card-path` | `role.rapporteur.preflight.amendmentLegacyCardPath` | 走旧卡/旧批准路径 |
| `rapporteur-run-change-mode-invalid` | `role.rapporteur.preflight.runChangeModeInvalid` | mode 不在三模式闭集 |
| `rapporteur-requirement-change-ref-missing` | `role.rapporteur.preflight.requirementChangeRefMissing` | 无 flowId/intentId/taskId |
| `rapporteur-requirement-change-approval-claimed` | `role.rapporteur.preflight.requirementChangeApprovalClaimed` | 声称已批准 |
| `rapporteur-requirement-change-self-approval` | `role.rapporteur.preflight.requirementChangeSelfApproval` | 发起方自批 |
| `rapporteur-dispatch-source-missing` | `role.rapporteur.dispatch.sourceMissing` | 派发来源缺失 |
| `rapporteur-dispatch-source-mismatch` | `role.rapporteur.dispatch.sourceMismatch` | 来源非本角色 |
| `rapporteur-dispatch-target-invalid` | `role.rapporteur.dispatch.targetInvalid` | 目标 id/类别非法 |
| `rapporteur-dispatch-target-missing` | `role.rapporteur.dispatch.targetMissing` | 目标不存在 |
| `rapporteur-dispatch-not-authorized` | `role.rapporteur.dispatch.notAuthorized` | rapporteur 不是可派发来源 |
| `rapporteur-tools-governance-model-unsupported` | `role.rapporteur.tools.governanceModelUnsupported` | 非 trio 模型不装配工具 |

- E1 只登记键名，**未向 `src/common/shared/i18n` 增条目**（写集不含共享目录）；消费者可按需映射，键名改名走接口评审。
- 所有 `details` 只含 JSON 普通数据；不含密钥/凭据、客户正文、模型原始输出。

## 8. 依赖与纯度

- 只 import：`src/model/role.ts`、`src/model/boundary.ts`、`src/model/runtime.ts`（类型 + `RUN_CHANGE_MODES` 值）、`src/common/shared/intent-entry-contract.ts`（公开入口）。
- 不 import：`src/common/门禁引擎/`、`src/pipeline/`、`src/service/`、`src/provider/`、`app/`、`src/common/gates/`、其他角色模块。
- 无 I/O、无账本、无会话、无时钟、无随机数、无 `process`/`console`/`fetch`、无可变模块状态；输入只读。
- 模块根只有 `index.ts`；内部实现仅在 `internal/`；模块外不得导入 internal（测试静态扫描覆盖）。

## 9. 差分与已知差异

差分 fixture：`test/roles/rapporteur/oracle-fixture.ts`（E2 G9 冻结金样：来源候选/捕获期与切换后哈希/覆盖映射/载荷 SHA-256 见 `ORACLE_GOLDEN_META`；测试不 import/读取旧引擎）。

| 差分面 | 结果 |
| --- | --- |
| 规格 8 字段（id/displayName/function/entries/preauth/forbidden/capabilities/cards） | 差异 = 0 |
| 卡文本 sha256/长度/行数 | 差异 = 0 |
| 工具声明 vs 旧 run-role 注入 probe | 差异 = 0（3 项） |
| dispatch allow 位 vs `evaluateDispatchAuthorization` | 差异 = 0（来源 rapporteur 恒 false） |
| preflight allow 位 vs 旧 schema/Service/卡文本锚点 | 差异 = 0（24 用例） |

已列明差异（`KNOWN_DELTAS`，契约允许）：

1. `dispatch-code-map`：旧 `unknown-source` → 新条件化稳定码；allow 位一致。
2. `dispatch-scope`：旧硬授权同时编码 chief/convener 目标规则；rapporteur 模块只回答本角色作为来源（R-2）。
3. `preflight-fact-schema`：事实键按 Q13 由本 api-spec 登记；旧实现无单一 preflight 纯函数。
4. `preflight-run-change-stop`：旧 direct stop 返回 `blocked(run-stop-unverified)`；模块 allow 不等于提交会成功（停稳证据归 Service）。
5. `preflight-detail-amendment-legacy`：旧逐项/最终卡是 VCA 历史状态机；模块按卡文本编码拒绝。
6. `tools-declaration-vs-injection`：模块声明最大允许集；实际注入仍由引擎按会话模式/宿主能力门控。

## 10. 测试与验证（本角色自测，不判验收）

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 模块单测 + 差分 + 边界扫描 | `node --test "test/roles/rapporteur/*.test.ts"` | **67/67 pass / 0 fail / 0 skip** |
| 旧契约测试回归（只读 oracle） | `node --test test/门禁引擎/role-module-contract.test.ts` | **14/14 pass** |
| 旧注入测试回归（只读 oracle） | `node --test test/编排/run-role-submit-capabilities.test.ts` | **14/14 pass** |
| 隔离 typecheck（模块 + 测试） | `npx tsc --ignoreConfig --noEmit ... src/common/roles/rapporteur/index.ts test/roles/rapporteur/*.ts` | exit 0 |
| 仓级 typecheck | `npm run typecheck` | exit 0（执行时其他角色模块已就位） |

## 11. 消费者与 E2 交接

- 规格数据消费者：门禁引擎 `governance-roles.ts` 门面（E2 改为 import 本模块 spec，删除内联规格）。
- 工具策略消费者：编排 `run-role.ts`（E2 改读模块 `tools()` 并按 registry 校验）。
- 动作前置消费者：Service（VCA/run-change/requirement-change）在 E2 调 `preflight`，之后仍执行既有事务/证据校验。
- 提示块消费者：编排/桌面（E2 经 Pipeline public handle 读取 `context()`）。
- 报告期望：仍由 `workflow-preconditions.ts::reportTargetForTaskCreator` 实际路由；模块只声明期望。
- **本模块不携带权限**；E2 删除旧实现前，旧引擎仍是权威 oracle。
