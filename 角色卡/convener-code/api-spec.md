# convener 角色模块公共 API 实现报告

- 角色：`convener-code`（运营代码维护角色）
- 模块：`src/common/roles/convener/`（greenfield，唯一 public entry `index.ts`）
- 契约：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` E0.3（685 行 / SHA-256 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`，已冻结）§3.1/§3.2 convener 行/§3.3/§3.4/§3.5/§7/§10 D1·D5·D8·D10
- 状态：E1 模块实现完成（未判验收；未提交/推送；E2 前旧引擎仍是权威与差分 oracle）
- 版本：模块实现版本 `convener-module/v1`（E0.3 契约版本适用于本模块；实现版本随本文件记录）

## 1. 唯一 public entry 与导出

```ts
// src/common/roles/convener/index.ts
export const convenerRoleModule: BuiltInRoleModule;
export const CONVENER_WORKER_DISPATCH_TARGETS: Readonly<{
  workerTargetKind: "project";
  allowedBuiltInRoleIds: readonly ["verifier"];
  reportToRoleId: "convener";
}>;
```

- `convenerRoleModule` 是模块唯一 `BuiltInRoleModule`；`CONVENER_WORKER_DISPATCH_TARGETS` 是 worker 派发目标的纯数据（R-2：run/module/D3/roster 规则不进入模块）。
- 模块根只有 `index.ts`；当前无内部拆分文件；模块对象、卡数据、能力位、卡种、上下文段均 `Object.freeze`。
- 只依赖 `src/model/role.ts` 与 `src/model/boundary.ts`（**type-only**）；无引擎/门控/其他角色/Node I/O import。

## 2. 数据字段（旧规格逐字迁移；E0 D8/D10）

| 字段 | 值 | 旧 oracle |
| --- | --- | --- |
| `id` | `"convener"` | `governance-roles.ts::BUILT_IN_GOVERNANCE_ROLES` |
| `displayName` | `"运营"` | 同上 |
| `function` | `"schedule"` | 同上 |
| `card.text` | 旧 `CONVENER_CARD_TEXT` 逐字（含五个共享纪律段展开） | 同上 |
| `card.entries` | `docs/workflow.md`（file）、`docs/scheduling/`（directory）、`docs/governance/convener/`（directory）；root=project | 同上 |
| `card.preauthorizedDirs` | 同三路径 | 同上 |
| `card.forbiddenWritePaths` | 应用独占写路径（`.ans/`、`docs/bootstrap-manifest.md`、`角色卡/governance-boundary.yaml`）+ `角色卡/`、`docs/proposals/`、`docs/nominations/`、`docs/skills/`、`docs/mcp/` | 同上（展开 `APP_ONLY_WRITE_PREFIXES`） |
| `capabilities` | `customerInput:true`；`dispatchTask:true`；`roleStatus/sessionTail/installSkill/installMcp:false`；`shell:"operator-approve"` | 同上 |
| `cards` | `["decision"]` | `run-role.ts::TRIO_CARD_KINDS.convener`（D8：无 legacy `write`/`appointment`） |

- **D10 单一真源**：`CONVENER_CAPABILITIES` 是唯一真源；`tools()` 返回同一引用。差分测试断言 `tools().capabilities === convenerRoleModule.capabilities`。
- 卡文本/条目/预授权/禁写/capabilities 与旧 oracle **逐字段零差异**（`convener-differential.test.ts`）。

## 3. `tools(input: TrustedToolPolicyInput): RoleToolPolicy`

| 治理模型 | 返回 `tools` | 旧门控来源 |
| --- | --- | --- |
| `trio` | `requestRequirementChange`、`completeTeamPlan`、`closeCreatedTask`、`submitRefactor`、`requestStableWrite` | D1 装配表 convener 允许集；`run-role.ts:1814-1830` |
| `single` | `submitRefactor`、`requestStableWrite` | 旧代码两项为「角色 id === convener」门控，不按治理模型二次收窄（`run-role.ts:1829-1830,2347-2349`）；single 下 convener 会话结构上不可达 |
| 未知（运行时防御） | `[]` + reason `governance-model-unknown` / `role.convener.tools.governanceModelUnknown` | fail-closed；旧类型上不可达 |

- `capabilities` 恒为 spec 同引用；`reasons` 仅在未知模型时非空。
- 不属于本角色允许集的 `RoleToolId` **不得**由本模块声明；引擎装配按 `role-tool-registry.ts` 逐项校验并 fail-closed（D1）。

## 4. `dispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy`

**范围（E0 R-2）**：只回答「真实 convener 能否向真实目标派发」——硬身份/存在性；**不实现** hub/legacy/review 路由、controller resume、run/module/D3/roster/交付属主与报告时点（全部留在 `run-role.ts` / `apply-journal.ts` / `workflow-preconditions.ts` / 桌面路由）。

| 顺序 | 条件 | 结果 | `code` / `messageKey` |
| --- | --- | --- | --- |
| 1 | `sourceRoleId !== "convener"`（含缺省） | deny | `dispatch-source-invalid` / `role.convener.dispatch.sourceInvalid` |
| 2 | `targetRoleId` 为空/空白 | deny | `dispatch-target-invalid` / `role.convener.dispatch.targetInvalid` |
| 3 | `targetRoleId === "convener"` | deny | `self-dispatch` / `role.convener.dispatch.selfDispatch` |
| 4 | `targetKind === "built-in-governance"` 且目标 ∉ `{verifier}` | deny | `convener-target-forbidden` / `role.convener.dispatch.targetForbidden` |
| 5 | 目标为内置 verifier 或项目 worker，但 `targetExists !== true`（缺省/false） | deny | `dispatch-target-missing` / `role.convener.dispatch.targetMissing` |
| 6 | `targetKind` 非 `project`/`built-in-governance`（运行时防御） | deny | `dispatch-target-kind-invalid` / `role.convener.dispatch.targetKindInvalid` |
| 7 | 以上通过 | allow | `reportToRoleId = "convener"` |

- 允许时 `reportToRoleId` 是派发时点的真实创建者（convener）；**仅作差分期望，不驱动实际报告路由**；实际路由仍由 `reportTargetForTaskCreator` 决定。deny 一律不返回 `reportToRoleId`。
- 内置目标仅 `verifier`（历史质检 controller）；新质检任务由 Chief 创建，不由 convener 创建（引擎/卡片纪律，不在本函数）。
- 差分（`convener-differential.test.ts`）：与旧 `evaluateDispatchAuthorization` 在显式存在性域内逐组合允许/拒绝一致；**3 个已登记差异**（均为模块更严格）：
  1. 内置 `verifier` + `targetExists` 缺省/false：旧谓词忽略内置目标存在性，模块按契约 §3.1 / D4 要求宿主显式核验（缺省即 false）并拒绝；
  2. 空 `targetRoleId` + `project` + `targetExists:true`：旧谓词不校验空 id，模块按硬身份拒绝；
  3. 已知差异计数固定为 3（内置 verifier 缺省/false ×2 + 空 project id）；新增差异即差分测试失败。

## 5. `preflight.checkAction(input: RolePreflightInput): RolePolicyDecision`

只覆盖契约 §3.4 convener 行：`team-plan`、`git-action`、`stable-write`、`requirement-change`。其他动作 deny `action-not-covered` / `role.convener.preflight.actionNotCovered`；`facts` 非普通对象 deny `facts-invalid` / `role.convener.preflight.factsInvalid`。

**事实包规则（E0 D4/Q13）**：`facts` 是宿主已核验的普通 JSON；模块只读下表登记的键。**缺键/未知键/类型不符一律 deny**（`facts-unknown` / `role.convener.preflight.factsUnknown` 或其他动作码）。preflight 的 `allow:true` 只表示纯策略不反对，**不替代** Service/Provider 最终校验。

### 5.1 `team-plan`

| 事实键 | 要求 |
| --- | --- |
| `actorRoleId` | 恒为 `"convener"` |
| `operationId` | 非空字符串 |
| `flowId` | 非空字符串 |
| `runId` | 可选；给出时必须非空字符串 |
| `baseDigest` | 64 hex |
| `plan` | 恰为 `{ path, sha256, version }`：`path` 非空、`sha256` 64 hex、`version` 安全整数 ≥1 |

- 额外要求：`plan.path === "docs/scheduling/<flowId>-team-v<version>.md"`（旧 `apply-journal.ts:2818` 路径规则）。
- 返回码：`team-plan-facts-invalid` / `role.convener.preflight.teamPlanFactsInvalid`；`team-plan-path-invalid` / `role.convener.preflight.teamPlanPathInvalid`。
- **不复制** Service 最终校验：`completeTeamPlanInternal` 仍需核 base flow/digest、run flow、计划字节/hash、roster/modules 一致性、`parseTeamPlan` 结构/属主/writeset/DAG。

### 5.2 `stable-write`

| 事实键 | 要求 |
| --- | --- |
| `actorRoleId` | 恒为 `"convener"` |
| `kind` | 恒为 `"workflow"`（`RequestStableWriteInput` 的唯一 kind） |
| `content` | 非空字符串 |

- 返回码：`stable-write-facts-invalid` / `role.convener.preflight.stableWriteFactsInvalid`；`stable-write-kind-invalid` / `role.convener.preflight.stableWriteKindInvalid`。
- **不复制** stable-write 许可/内容上限/快照绑定；这些仍由 stable-write Service 与工具层最终校验。

### 5.3 `requirement-change`

| 事实键 | 要求 |
| --- | --- |
| `actorRoleId` | 恒为 `"convener"` |
| `changeKind` | `scope`/`authorization`/`constraint`/`cost`/`other` |
| `summary` / `rationale` | 非空字符串 |
| `flowId` / `intentId` / `taskId` | 至少一个非空字符串（归属键） |
| `impact` / `proposedIntentPatch` | 可选；给出时必须非空字符串 |

- 返回码：`requirement-change-facts-invalid` / `role.convener.preflight.requirementChangeFactsInvalid`；`requirement-change-scope-missing` / `role.convener.preflight.requirementChangeScopeMissing`。
- **不复制** 工具层文本上限（summary 500 / rationale 4000 / impact 2000 / proposedIntentPatch 4000 字）、flowId/intentId slug 校验，以及应用的归属/去重/派发/账本；这些仍由 `provider/runtime/tools.ts` 与能力实现最终执行。

### 5.4 `git-action`

通用键：`actorRoleId` 恒为 `"convener"`；`operationId` 非空；`action` ∈ `init`/`commit`/`integrate`/`revert`/`publish`（否则 `git-action-invalid` / `role.convener.preflight.gitActionInvalid`）。

| action | 必填事实键（除通用键外） | 角色侧条件 |
| --- | --- | --- |
| `init` | `taskId`、`runId`、`customerSource`、`repositoryState` | 真实客户来源 `customerSource=true`；仓库不存在 `repositoryState="absent"`（已存在 repo 应复用） |
| `commit` | `taskId`、`runId`、`base`、`paths`、`pathsAuthorized` | `paths` 非空字符串数组；`pathsAuthorized=true`（路径在本人任务 scope 内） |
| `integrate` | `taskId`、`runId`、`base`、`candidates`、`contributorsAccepted`、`contributorsAuthorized` | `candidates` 非空且互异；owner 候选已授权且已合法收口 |
| `revert` | `taskId`、`runId`、`base`、`commit`、`controllerTaskId`、`reviewAccepted`、`ownerGrantsVerified` | 真实 controller 任务；review 已接受；owner grants 已核验 |
| `publish` | `taskId`、`runId`、`expected`、`candidate`、`publishTarget`、`finalCandidateVerified`、`criteria`、`evidence`、`creatorCloseOperationId` | 仅 `publishTarget="delivery"`；最终候选 OID 已重新核验；criteria/evidence 非空；原创建者收口 operation id 非空 |

- 形状：`base`/`expected` 恰为 `{ref, oid}`，`ref` 非空，`oid` 为**非 null** `GitOid` `{objectFormat:"sha1"|"sha256", hex:40/64 hex}`；`commit`/`candidate` 为 `GitOid`；`candidates` 为互异 `GitOid[]`；`criteria`/`evidence` 为非空 `GitEvidenceRef[]` `{oid, path 非空, sha256 64hex}`。
- 返回码：`git-action-facts-invalid` / `role.convener.preflight.gitActionFactsInvalid`；`git-action-conditions-unmet` / `role.convener.preflight.gitActionConditionsUnmet`（`details.checks` 列出未满足项）；`git-action-target-invalid` / `role.convener.preflight.gitActionTargetInvalid`。
- **不实现** Git 执行/ACL/候选/证据闭包：真实仓库、ref、OID、owner grants、candidate evidence、集成子任务收口、发布 expected-old 与 CAS 仍由 Git Service（`git-capabilities.ts`）最终校验；模块只消费宿主已核验的布尔/结构事实。
- 旧实现无纯函数 oracle（Git 角色侧条件闭包于宿主上下文与 I/O）；差分测试固定旧源码锚点（`git-capabilities.ts` 的 convener 身份/creator close/integration/revert 文案），行为正负例由单元测试覆盖。

## 6. `context(input: RoleContextInput): readonly RoleContextSection[]`

固定三段静态模板（`Object.freeze`，不随 `facts`/模型拼接运行时数据）：

| section id | 内容 | resources |
| --- | --- | --- |
| `decision-card` | decision 卡纪律：`request_choice(cardKind=decision)`、恰一个 `recommended:true`、task/run/依据/错误证据/已尝试动作、同一阻塞一张有效卡、卡取消≠任务取消、不得发 appointment 卡、业务选择不替代专门执行授权 | 无 |
| `project-workflow` | 项目 `docs/workflow.md` 的步骤表与「准备用当前 snapshot、执行用 run 冻结 workflowRef、标明 task/run/path/hash」纪律 | **无**（D5/Q4：项目 workflow 不是应用资源根下的角色模块资源，由宿主另行提供 path/version/hash） |
| `report-expectation` | worker `submit_report` 回 convener；convener 汇总后向幕僚 `submit_report`；不转发客户/不批准/不验收；`dispatch().reportToRoleId` 仅差分期望，实际路由由 `reportTargetForTaskCreator` 决定 | 无 |

## 7. 差分与测试

- 单测：`test/roles/convener/convener-module.test.ts`（19 tests）。
- 差分：`test/roles/convener/convener-differential.test.ts`（11 tests），合计 **30/30 pass**。
- 差分零差异项：规格数据（逐字段）、cards（源码提取 `TRIO_CARD_KINDS`）、tools（D1 允许集/旧角色门控）、dispatch（显式存在性域，3 个已登记更严格差异）、team-plan（旧角色侧谓词域，2 类已登记更严格 fact 类型校验）、stable-write/requirement-change（旧工具/能力门控域）。
- 已登记差异（模块更严格，非放宽）：见 §4、§5.1、§5.2；另有 `requirement-change` 文本上限/slug 校验刻意留在工具层，模块不复制。

## 8. E2 消费说明与遗留

- E2 门面可用 `convenerRoleModule` 装配 `BuiltInRoleModuleMap`；`governance-roles.ts` 内联 convener 规格在对应单元切换后删除（D2/D6）。
- 宿主必须为 `dispatch()` 显式提供 `targetExists`（含内置目标）；缺省按 false fail-closed。
- 宿主必须按 §5 事实键提供 `preflight` 事实包；任何额外键会被 `facts-unknown` 拒绝。
- 消息键当前为模块内部稳定诊断键（`role.convener.*`），用户可见 i18n 注册在 E2 呈现接入时统一评审/补充。
- 项目 `docs/workflow.md` 的资源 path/version/hash 由宿主上下文装配提供（D5/Q4）；本模块不读盘。
- 未提交/推送；未运行真实模型；不判验收。
