# API 规范：人事代码维护角色（nominator）

## 设计参考

- **E0 冻结契约**：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（685 行 / SHA-256 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`；E0.3）§3.1/§3.2/§3.3/§3.4/§3.5/§7/§10 D1/D9/D10/§11.1。
- **团队计划**：`docs/scheduling/2026-11-07_team-plan_runtime-gate-role-modularization.md`（687 行 / `00e1f76b6a527a1237ac1467bb4100805750606904ce6960bb56a013a4ba565c`）§4.4④/§7.4。
- **验收标准**：`docs/acceptance/2026-11-07_runtime-gate-role-modularization-criteria-v1.md`（273 行 / `a999dc1961c9ebe4727f0796d6baefd24a23e75b1a6cc1d215a9c0e2f63b4999`）E1.1–E1.7。
- **E2 接口评审 D-1**：`docs/scheduling/2026-11-07_review_E2-interface_runtime-gate-role-module.md` 行 24；评估 `角色卡/编排/docs/change/2026-11-07_E2_interface-review_orchestration.md` §7.1。处置 (a)：`intentEntryConsistent` 降为可选/诊断事实，与旧 D3 卡/激活路径行为等价（不新增拒绝）。
- **实现状态**：`implemented-unverified`（E1；2026-11-07 完成 E2 D-1 修复）。未判验收、未 commit/push、未跑真实模型。旧引擎在 E2 切换前仍是权威 oracle。
- **偏离**：无未列明偏离。`dispatch()` 的两条 fail-closed 差异见下方「派发策略」。

## 导出

- **唯一 public entry**：`src/common/roles/nominator/index.ts`。模块根只有该文件；外部只经此导入。
- `export const nominatorRoleModule: BuiltInRoleModule`；另 `export default nominatorRoleModule`（同一对象）。
- 不导出内部 helper/常量；不新增 Model 类型；不导出权限、批准、token、租约或句柄。

### 规格数据（`BuiltInRoleModule` 数据字段）

| 字段 | 值 |
| --- | --- |
| `id` | `nominator` |
| `displayName` | `人事` |
| `function` | `nomination` |
| `card.text` | 旧 `governance-roles.ts::NOMINATOR_CARD_TEXT` 逐字；内嵌 `intentEntryContractText("nominator")`（共享单一来源） |
| `card.entries` | 4 条 `root: "project"` 条目：`角色卡/`、`docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` |
| `card.preauthorizedDirs` | `docs/skills/`、`docs/mcp/`、`docs/governance/nominator/` |
| `card.forbiddenWritePaths` | `.ans/`、`docs/bootstrap-manifest.md`、`角色卡/governance-boundary.yaml`、`角色卡/{chief,product,rapporteur,nominator,convener,verifier,su}/`、`docs/proposals/`、`docs/scheduling/` |
| `capabilities` | `customerInput:true`、`dispatchTask:false`、`roleStatus:false`、`sessionTail:false`、`installSkill:true`、`installMcp:true`、`shell:"operator-approve"` |
| `cards` | `["appointment", "appointment-write"]`（D8：只列当前有效卡种，不含 legacy `"write"`） |

`capabilities` 是唯一真源（D10）；`tools()` 输出的 `capabilities` 与其同一引用。

## 策略面

### `tools(input: TrustedToolPolicyInput): RoleToolPolicy`

| `governanceModel` | `tools` | `reasons` |
| --- | --- | --- |
| `"trio"` | `["activateRoleDocuments"]` | `[]` |
| `"single"` | `[]` | `[]` |
| 运行期未知值 | `[]` | `[{ code: "role-tools-model-unknown", messageKey: "role.nominator.tools.modelUnknown" }]` |

对齐旧 `run-role.ts` 注入门控：`directGovernance = governanceModel === "trio" && builtInGovernance && isTrio && chiefDecisionContext === undefined`，再按 `role.id === "nominator"` 注入 `activateRoleDocuments`。模块只能看到 `governanceModel`（E0 Q2 最小输入面）；宿主是否实际提供函数由引擎注入层判定，模块声明不构成权限。

### `dispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy`

R-2：只做硬身份/存在性；hub/legacy/review 路由、convener run/module 规则、报告时点不在本模块。

| sourceRoleId | targetRoleId | targetKind | targetExists | 结果 |
| --- | --- | --- | --- | --- |
| `chief` | `nominator` | `built-in-governance` | `true` | `allow:true`，`reportToRoleId:"chief"` |
| `chief` | `nominator` | `built-in-governance` | 缺省/`false` | deny `target-card-missing` |
| `chief` | `nominator` | `project` | 任意 | deny `chief-to-project-forbidden` |
| `convener` | `nominator` | `built-in-governance` | 任意 | deny `convener-target-forbidden` |
| `convener` | `nominator` | `project` | 任意 | deny `dispatch-input-invalid`（内置目标声明为项目，输入矛盾） |
| 任意 | 任意相同 id | 任意 | 任意 | deny `self-dispatch` |
| 非 `chief`/`convener` 或 `sourceRoleId` 缺席 | 任意 | 任意 | 任意 | deny `unknown-source`（nominator 不派发） |
| `chief`/`convener` | 非 `nominator` | 任意 | 任意 | deny `dispatch-not-in-module-scope`（由目标模块/引擎回答） |
| 任意 | 空/非法 | 非法 | 非布尔 | deny `dispatch-input-invalid` |

**派发错误码 / i18n key**：

| `code` | `messageKey` |
| --- | --- |
| `dispatch-input-invalid` | `role.nominator.dispatch.inputInvalid` |
| `self-dispatch` | `role.nominator.dispatch.selfDispatch` |
| `unknown-source` | `role.nominator.dispatch.unknownSource` |
| `target-card-missing` | `role.nominator.dispatch.targetCardMissing` |
| `chief-to-project-forbidden` | `role.nominator.dispatch.chiefToProjectForbidden` |
| `convener-target-forbidden` | `role.nominator.dispatch.convenerTargetForbidden` |
| `dispatch-not-in-module-scope` | `role.nominator.dispatch.notInModuleScope` |

**与旧 `evaluateDispatchAuthorization` 的列明差异**（差分测试显式断言）：

1. 旧 oracle 对 `chief → built-in` 目标不读 `targetExists`；本模块按 E0 §3.5「目标不存在 ⇒ deny」要求 `targetExists === true`（fail-closed）。
2. 旧 oracle 对 `chief → product` 等非 nominator 目标可允许；本模块只回答 nominator 相关派发，其余为 `dispatch-not-in-module-scope`，由对应目标模块/引擎回答。

### `preflight.checkAction(input: RolePreflightInput): RolePolicyDecision`

只覆盖 `action === "appointment"`；其它动作：

```ts
{ allow: false, code: "action-not-covered", messageKey: "role.preflight.actionNotCovered" }
```

事实包是宿主已核验的普通 JSON（E0 D4）。模块只读，不重新采集/推断/补造；**必填**键缺失/未知键/已提供键类型不符一律 deny。`intentEntryConsistent` 是可选诊断事实（E2 D-1）：缺失或 `false` 不拒绝；提供时只校验类型。`stage` 区分两个前置阶段。

#### 公共事实键（两阶段都接受）

| 键 | 类型 | 说明 |
| --- | --- | --- |
| `stage` | `"d3-card"` \| `"role-documents"` | 前置阶段（必填） |
| `flowId` | 治理 slug 字符串 | 当前 flowId（必填） |
| `intentEntryConsistent` | `boolean`（**可选**；仅诊断/类型校验） | 意图入口（产品意图/提案/`docs/intents/<intentId>.md`）一致性诊断。**不是本模块的拒绝条件**：旧 D3 卡/激活路径不校验（E2 D-1）；缺失或 `false` 均放行 |
| `rosterFound` | `boolean`（须 `true`） | 最新合法名单存在（必填） |
| `rosterVersion` | 正整数 | 名单版本（必填） |
| `rosterSha256` | 64 hex | 名单字节 SHA-256（必填） |
| `rosterRoleIds` | 非空、唯一字符串数组 | 最新名单 `roles[].id`（必填） |
| `rosterEnvBootstrapOmitted` | `boolean` | 名单 `envBootstrap.omitted`（必填） |
| `rosterContainsBuiltInRoleIds` | `boolean`（须 `false`） | 名单是否含内置治理角色 id（宿主核验；必填） |

> E2 D-1（处置 (a)）：`intentEntryConsistent` 原为必填且须 `true`，但旧 `validateAppointmentCardAgainstRoster`、旧 `prepareRoleActivation` 均不校验意图入口一致性；`run-role.ts:1519` 的 `readIntentEntryFacts` 只服务 judge 上下文且失败不阻断发卡。为保持 B1 E2.2 零差异，本模块改为可选/诊断，不新增拒绝条件；宿主可自行记录/展示该诊断。

#### `stage: "d3-card"` 额外事实键

| 键 | 类型 | 说明 |
| --- | --- | --- |
| `d3CardMultiple` | `boolean`（须 `true`） | 招人决定卡必须多选 |
| `d3CardOptionRoleIds` | 唯一字符串数组 | 卡选项；须与 `rosterRoleIds` 集合完全一致 |
| `d3CardRecommendedRoleIds` | 唯一字符串数组 | 推荐集；须与 `rosterRoleIds` 集合完全一致（应用从名单生成） |

#### `stage: "role-documents"` 额外事实键

| 键 | 类型 | 说明 |
| --- | --- | --- |
| `targetRoleId` | 治理 slug | 本次写卡的项目角色 id |
| `targetIsBuiltIn` | `boolean`（须 `false`） | 目标是否为内置治理角色（宿主核验） |
| `d3Present` | `boolean`（须 `true`） | 存在最新真实 D3（`request.created`+`request.resolved`） |
| `d3By` | `"customer"` \| `"chief-delegated"` | D3 裁决来源 |
| `d3TargetRoleIds` | 唯一字符串数组 | D3 选中角色；须全部在名单内且包含 `targetRoleId` |
| `d3RosterVersion` | 正整数 | D3 绑定的名单版本；须等于 `rosterVersion` |
| `d3RosterSha256` | 64 hex | D3 绑定的名单 hash；须等于 `rosterSha256` |
| `d3DecisionId` | 非空字符串 | 真实 D3 decisionId（`chief-delegated` 时为 requestId），不得自报/伪造 |
| `operationId` | 非空字符串 | 激活操作 id |
| `planCompleted` | `boolean`（须 `true`） | 团队计划已由 convener 真实完成 |
| `planRoleIds` | 唯一字符串数组 | 计划分配的角色；须包含 `targetRoleId` |
| `cardPath` / `boundaryMdPath` / `boundaryYamlPath` | 非空字符串 | 必须分别为 `角色卡/<targetRoleId>/{role-card.md,boundary.md,boundary.yaml}` |
| `cardSha256` / `boundaryMdSha256` / `boundaryYamlSha256` | 64 hex | 三文档候选字节 SHA-256（宿主核验） |
| `boundaryWithinRoleModules` | `boolean`（须 `true`） | 边界条目只取目标角色名下模块的文件/目录并集 |
| `boundaryMdYamlSynchronized` | `boolean`（须 `true`） | `boundary.md` 与 `boundary.yaml` 条目同步 |
| `roleCardRequiredSections` | `boolean`（须 `true`） | `role-card.md` 含 `ROLE_CARD_REQUIRED_SECTIONS` 必填章节 |

#### 错误码 / i18n key

| 条件 | `code` | `messageKey` |
| --- | --- | --- |
| 动作不在本角色范围 | `action-not-covered` | `role.preflight.actionNotCovered` |
| 缺键（含 `stage`） | `appointment-facts-missing` | `role.nominator.preflight.factsMissing` |
| 未知键 | `appointment-facts-unknown` | `role.nominator.preflight.factsUnknown` |
| 类型不符（含已登记但本阶段不读取的键） | `appointment-facts-invalid` | `role.nominator.preflight.factsInvalid` |
| `stage` 非法 | `appointment-stage-invalid` | `role.nominator.preflight.stageInvalid` |
| 名单缺失 | `appointment-roster-missing` | `role.nominator.preflight.rosterMissing` |
| 名单含内置角色 / omitted 与 env-bootstrap 矛盾 | `appointment-roster-builtin-role` / `appointment-roster-invalid` | `role.nominator.preflight.rosterBuiltinRole` / `...rosterInvalid` |
| 名单未省略 env-bootstrap 但缺失 | `appointment-roster-env-bootstrap-missing` | `role.nominator.preflight.rosterEnvBootstrapMissing` |
| D3 卡非多选 | `appointment-d3-card-not-multiple` | `role.nominator.preflight.d3CardNotMultiple` |
| D3 选项与名单不一致 | `appointment-d3-card-roster-mismatch` | `role.nominator.preflight.d3CardRosterMismatch` |
| D3 推荐集与名单不一致 | `appointment-d3-card-recommended-mismatch` | `role.nominator.preflight.d3CardRecommendedMismatch` |
| 目标是内置角色 | `appointment-target-builtin` | `role.nominator.preflight.targetBuiltin` |
| 目标不在名单 | `appointment-target-not-in-roster` | `role.nominator.preflight.targetNotInRoster` |
| 无 D3 | `appointment-d3-missing` | `role.nominator.preflight.d3Missing` |
| D3 选中集合越名单 | `appointment-d3-invalid` | `role.nominator.preflight.d3Invalid` |
| D3 未选中目标 | `appointment-d3-not-selected` | `role.nominator.preflight.d3NotSelected` |
| D3 名单版本/hash 漂移 | `appointment-d3-roster-mismatch` | `role.nominator.preflight.d3RosterMismatch` |
| 计划未完成 | `appointment-plan-incomplete` | `role.nominator.preflight.planIncomplete` |
| 计划未分配目标 | `appointment-plan-target-missing` | `role.nominator.preflight.planTargetMissing` |
| 三文档路径非 canonical | `appointment-document-invalid` | `role.nominator.preflight.documentInvalid` |
| 边界越过角色模块 | `appointment-boundary-scope-invalid` | `role.nominator.preflight.boundaryScopeInvalid` |
| md/yaml 不同步 | `appointment-boundary-unsynchronized` | `role.nominator.preflight.boundaryUnsynchronized` |
| 角色卡缺必填章节 | `appointment-role-card-sections-missing` | `role.nominator.preflight.roleCardSectionsMissing` |

**E2 D-1 停用码**：`appointment-intent-entry-inconsistent` / `role.nominator.preflight.intentEntryInconsistent` 自 2026-11-07 E2 D-1 修复起不再产生（`intentEntryConsistent` 缺失或 `false` 均放行）。shared-code 的 i18n 评审若登记了该键，可在其写集内移除；本模块不依赖该外部文案。

**最终校验不因 preflight allow 而省略**（本模块不替代）：

- `src/service/trunk/impl/apply-journal.ts::prepareRoleActivation`：真实 D3 账本、计划完成证据、名单/计划/模块绑定、三文档字节 hash；
- `src/common/门禁引擎/boundary-core.ts::validateRoleDocumentsSnapshot` / `parseSnapshotRoleDocuments`：必填章节、YAML 严格解析、md/yaml 同源、边界条目在角色模块内；
- `src/service/boundary/resolve-boundary.ts::validateBoundaryYamlText`：YAML 顶层键/role/entries；
- `src/service/gate/resolve-write.ts::resolveWrite`（引擎 owner）：实际写路径/边界/禁写/条件/writeSet；
- `src/common/编排/workflow-preconditions.ts::evaluateDispatchAuthorization`（引擎 owner）：派发硬授权实际执行。

本模块**不实现** `resolveWrite`、边界解析、stable-write 机制或账本读取。

### `context(input: RoleContextInput): readonly RoleContextSection[]`

返回 3 个静态 section（无资源引用；模块不读盘）：

| `id` | 内容 |
| --- | --- |
| `nominator-appointment-card` | 招人决定卡（D3）数据：`cardKind=appointment`、`multiple=true`、选项/推荐集来自最新名单、意图入口检查 |
| `nominator-appointment-write` | `appointment-write` 卡数据（兼容通道）：`targetRoleId`、真实 `decisionId`、三文档 preview 路径与完整激活规则 |
| `nominator-report-expectation` | 报告期望：`submit_report` 回 `task.created.from`（通常 chief），含完成/阻塞、真实证据、遗留 |

## 依赖

| 依赖 | 类型/值 | 用途 | 归属 |
| --- | --- | --- | --- |
| `src/model/boundary.ts` | type-only `BoundaryEntry` | Section 1 条目形状 | Model owner |
| `src/model/role.ts` | type-only `BuiltInRoleModule` 等 | 冻结契约类型 | 门禁引擎 owner |
| `src/common/shared/intent-entry-contract.ts` | value `intentEntryContractText` / `isValidIntentId` | 卡文本内嵌意图契约（单一来源）；slug 校验 | 项目管理/shared owner |

只读 oracle（**模块不 import**）：`src/common/门禁引擎/governance-roles.ts`、`src/pipeline/orchestration/run-role.ts`、`src/service/trunk/impl/apply-journal.ts`、`src/service/gate/resolve-write.ts`。

## 装配说明

1. **E2 切换**：门禁引擎 `governance-roles.ts` 门面改为 import `nominatorRoleModule`，删除内联 nominator 规格；`BuiltInRoleModuleMap` 在六模块落地后装配。装配 owner 是门禁引擎；本模块不在 E1 改门面。
2. **工具装配**：引擎按 `RoleToolId` 允许表校验 `tools().tools`；`activateRoleDocuments` 只有 nominator 允许。旧 `run-role.ts` 的 `directGovernance` 门控由宿主保留；模块只声明 trio 下的额外工具。
3. **preflight 消费**：Service/桌面在 D3 卡与三文档写卡前置处把宿主已核验事实交给 `checkAction`；`allow:true` 不替代 Service 最终校验。事实 producer 尚未接到旧引擎（E1 旧代码冻结），由 E2 单元按本表接线。
4. **dispatch 消费**：引擎硬授权在 E2 评审后改读模块；hub/legacy/review/run/module 规则与报告时点仍留 `workflow-preconditions.ts`/`apply-journal.ts`/桌面路由。
5. **context 消费**：宿主装配上下文时读取 section 文本；资源引用为空，无初始化顺序或资源所有权。

## 验证

- `node --test "test/roles/nominator/**/*.test.ts"` → **25/25 pass**（0 fail / 0 skip / 0 todo；E2 D-1 后新增 3 个用例）。
- 定向 TypeScript（本模块 + 本模块测试 + 夹具，`--ignoreConfig`）→ **exit 0**。
- 差分：规格字段/卡文本/能力位/卡种/工具门控/D3 卡形状/三文档结构 → 0 差异；派发 2 条列明差异；Service 前置 6 条 source-transcribed 对齐；意图入口事实缺失/`false` 与旧 D3/激活路径同为 allow（E2 D-1，新增 2 条差分用例）。
- 全仓 `npm run typecheck` → **exit 0**（收工时复跑；并行角色文件已收口）。
- 文件哈希与行数见 `docs/change/2026-11-07_E1_nominator-module-evidence.md`。
