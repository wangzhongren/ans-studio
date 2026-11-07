# verifier 角色模块公共 API 实现报告

- 角色：`verifier-code`（质检代码维护角色）
- 模块：`src/common/roles/verifier/`（greenfield，唯一 public entry `index.ts`）
- 契约：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md` E0.3（685 行 / SHA-256 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`，已冻结）§3.1/§3.2 verifier 行/§3.3/§3.4/§3.5/§10.2 D8·D10
- 状态：E1 模块实现完成；**E2 接口评审 P5 已修复**（未登记事实键 ⇒ deny，2026-11-07；未判验收；未提交/推送；E2 前旧引擎仍是权威与差分 oracle）
- 版本：模块实现版本 `verifier-module/v1.1`（E0.3 契约版本适用于本模块；v1.1 = P5 事实包白名单；实现版本随本文件记录）

## 1. 唯一 public entry 与导出

```ts
// src/common/roles/verifier/index.ts
export const verifierRoleModule: BuiltInRoleModule;
```

- 本文件是模块**唯一导出**；模块根只有 `index.ts`，不散放文件；内部拆分文件可在模块内新增（当前无需拆分）。
- `BuiltInRoleModule` 形状来自 `src/model/role.ts`（门禁引擎 E0 维护，本角色只读引用）：`id/displayName/function/card/capabilities/cards` + `tools/dispatch/preflight/context`。
- 模块对象、卡数据、能力位、卡种、上下文段全部 `Object.freeze`；纯数据/纯函数，无可变状态。

## 2. 数据字段（旧规格逐字迁移；E0 D8/D10）

| 字段 | 值 | 旧 oracle |
| --- | --- | --- |
| `id` | `"verifier"` | `governance-roles.ts::BUILT_IN_GOVERNANCE_ROLES` |
| `displayName` | `"质检"` | 同上 |
| `function` | `"verification"` | 同上 |
| `card.text` | 旧 `VERIFIER_CARD_TEXT` 逐字（含共享纪律段展开） | 同上 |
| `card.entries` | `docs/quality/`、`docs/verification/`、`docs/governance/verifier/`（directory，root=project） | 同上 |
| `card.preauthorizedDirs` | 同上三目录 | 同上 |
| `card.forbiddenWritePaths` | 应用独占写路径 + 六内置角色目录 + `角色卡/su/` + `docs/intents/`、`docs/proposals/`、`docs/contracts/`、`docs/nominations/`、`docs/skills/`、`docs/mcp/`、`docs/workflow.md` | 同上（展开 `APP_ONLY_WRITE_PREFIXES` + `BUILT_IN_ROLE_DIR_PREFIXES`） |
| `capabilities` | `customerInput:true`；`dispatchTask/roleStatus/sessionTail/installSkill/installMcp:false`；`shell:"operator-approve"` | 同上 |
| `cards` | `["acceptance"]` | `run-role.ts::TRIO_CARD_KINDS.verifier`（当前有效卡种，无 legacy `write`） |

- **D10 单一真源**：`VERIFIER_CAPABILITIES` 是唯一真源；`tools()` 返回同一引用。差分测试断言 `tools().capabilities === verifierRoleModule.capabilities`。
- 卡文本/条目/预授权/禁写/capabilities 与旧 oracle **逐字段零差异**（`verifier-differential.test.ts`）。

## 3. `tools(input: TrustedToolPolicyInput): RoleToolPolicy`

- 返回：`{ capabilities: <spec 同引用>, tools: [], reasons: [] }`。
- verifier **没有** `RoleToolId` 闭集（14 项）内的专属额外工具：`role-tool-registry.ts::ROLE_TOOL_CATALOG` 14 项 `allowedRoleIds` 均不含 `verifier`（差分测试逐项断言）。
- 空声明是**合法声明**：引擎装配侧 `validateRoleToolDeclaration("verifier", [])` ⇒ `allow: true`、`tools: []`（差分测试）。
- 旧 `run-role.ts` 的 verifier 门控只涉及能力位/customerInput/shell 与共有工具（`projectState`、`governanceMatrix`）；共有工具由引擎按 `builtInGovernance` 注入，不在 `RoleToolId` 内，本模块不重复声明。
- `single` 治理模型下 verifier 不装配；本函数仍返回同一空集（不按模型造工具、不携带权限）。

## 4. `dispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy`

**范围（E0 R-2）**：只回答「真实来源能否向真实目标 verifier 派发」——硬身份/存在性；**不实现** hub/legacy/review 路由、controller resume、任务创建、D3/run/module 规则与报告时点（全部留在引擎/Service/编排公开只读入口）。

输入四字段只读：`sourceRoleId?`、`targetRoleId`、`targetKind`、`targetExists?`。

| 顺序 | 条件 | 结果 | `code` / `messageKey` |
| --- | --- | --- | --- |
| 1 | `targetRoleId !== "verifier"` | deny | `target-not-verifier` / `role.verifier.dispatch.targetNotVerifier` |
| 2 | `sourceRoleId === targetRoleId` | deny | `self-dispatch` / `role.verifier.dispatch.selfDispatch` |
| 3 | `sourceRoleId` 缺失或 ∉ {`chief`,`convener`} | deny | `unknown-source` / `role.verifier.dispatch.unknownSource` |
| 4 | `targetKind !== "built-in-governance"`：来源 chief | deny | `chief-to-project-forbidden` / `role.verifier.dispatch.chiefToProjectForbidden` |
| 4' | `targetKind !== "built-in-governance"`：来源 convener | deny | `target-kind-mismatch` / `role.verifier.dispatch.targetKindMismatch` |
| 5 | `targetExists !== true`（缺省/未知） | deny | `target-card-missing` / `role.verifier.dispatch.targetMissing` |
| 6 | 以上通过 | allow | — |

- 允许时 `reportToRoleId = sourceRoleId`（派发时点的真实创建者）：chief 新任务 → `chief`；convener 历史任务 → `convener`。**仅作差分期望，不驱动实际报告路由**；实际路由仍由 `workflow-preconditions.ts::reportTargetForTaskCreator` 决定。
- deny 一律不返回 `reportToRoleId`。
- 稳定码与旧 `evaluateDispatchAuthorization` 在可表达的同一宿主事实下**零差异**（fixture `differential:"zero"`）。
- 契约明确差异（fixture `differential:"documented"`，证据已登记）：
  1. `targetExists` 缺省/false 时拒绝——旧函数对内置目标不读单独 `targetExists` 事实；冻结契约 §3.1 要求宿主核验且缺省即拒绝（fail-closed）。
  2. `targetRoleId="verifier"` 但 `targetKind="project"` 的不可能事实：来源 convener 时旧函数因 `targetExists=true` 放行，本模块 deny（内置 id 不能作项目角色 id）；
  3. 同上且 `targetExists=false` 时旧函数返回 `target-card-missing`，本模块先判 kind 一致性返回 `target-kind-mismatch`（同为拒绝）。
- `module-only` fixture（旧函数不可表达）：缺省 source（等价旧 `unknown-source`）、非 verifier 目标（`target-not-verifier`）。

## 5. `preflight.checkAction(input: RolePreflightInput): RolePolicyDecision`

只覆盖 `RoleGovernedAction = "review"`（最终 review 的角色侧条件）。其他动作一律 deny `action-not-covered`（`role.verifier.preflight.actionNotCovered`）。

**登记事实键**（E0 Q13 / E0.3 §3.4/D4：按本文件 + 测试冻结；**只允许这两个键，任何未登记键 ⇒ deny**）：

| 事实键 | 要求 | 说明 |
| --- | --- | --- |
| `reviewTarget` | `DispatchTaskReviewTarget`：恰好 `{ operationId, candidate }`；`operationId` 非空、trimmed、≤500、无控制字符；`candidate` 完整 OID `{ objectFormat:"sha1"\|"sha256", hex:40/64 hex }` | `operationId` = 期望 **CID**；`candidate` = **最终候选**完整 OID；普通调查任务没有最终 CID，不应调用本动作 |
| `criteria` | 1..16 个 `GitEvidenceRef`：恰好 `{ oid, path, sha256 }`；`path` 为字面路径（无通配/`..`/空段/反斜杠/控制字符/冒号，≤500）；`sha256` 64 hex；按 `objectFormat+hex+path` 去重 | 冻结 **criteria**；与 `reviewTarget` 组合为 `TaskReviewBasisRef` 形状 |

- **事实包白名单（E2 接口评审 P5 修复）**：`Object.keys(facts)` 只允许 `reviewTarget`、`criteria`；任何其他顶层键——包括 `accepted`、`passed`、`approved`、`smuggledDecision`，以及值为 `false`/`undefined` 的键——一律 deny `review-facts-unknown-key`，`details = { action: "review", unknownKeys: <排序后的键名数组> }`。未登记键判定**先于**缺键/形状判定；模块不读取其值、不修改事实包。

**判定**（纯函数 + facts；缺事实/未登记键 deny）：

| 场景 | 结果 | `code` / `messageKey` |
| --- | --- | --- |
| `facts` 非普通对象 | deny | `review-facts-missing` / `role.verifier.preflight.reviewFactsMissing`（`details.missing` 列出 `reviewTarget`、`criteria`） |
| `facts` 含任何未登记顶层键 | deny | `review-facts-unknown-key` / `role.verifier.preflight.reviewFactsUnknownKey`（`details.action="review"`、`details.unknownKeys` 稳定排序） |
| 缺 `reviewTarget` 或 `criteria`（无未登记键） | deny | `review-facts-missing` / `role.verifier.preflight.reviewFactsMissing`（`details.missing` 列出缺键） |
| `reviewTarget` 形状不符 | deny | `review-target-invalid` / `role.verifier.preflight.reviewTargetInvalid` |
| `criteria` 形状不符（含数量/去重/路径/哈希） | deny | `review-criteria-invalid` / `role.verifier.preflight.reviewCriteriaInvalid` |
| 全部通过（只含两个登记键且形状合法） | allow | — |

- 形状校验复用 Model 单一真源：`src/model/runtime.ts::isDispatchTaskReviewTarget` 与 `isTaskReviewBasisRef`（与旧 review 材料同一校验函数），不复制 Service/Provider 实现。
- **不实现**：验收判定（accept/reject）、证据内容核验、Git 对象/账本核对、report 内容判定。`accepted`/`passed`/`approved` 等键的值不被读取——它们本身是未登记键，按事实包白名单直接 deny（值 true/false 结果相同）；也不能把非法形状变成 allow。
- **不替代最终校验**：preflight `allow: true` 只表示角色侧不反对，不是权限票，也不是验收通过；Service/Provider/独立验收的最终校验仍照常执行。
- `details` 只含 `{ fact }` / `{ missing }` / `{ action, unknownKeys }` 等 JSON 可序列化普通数据，不回显证据正文。

## 6. `context(input: RoleContextInput): readonly RoleContextSection[]`

两条**静态模板**段（无资源引用、不读盘、不嵌入运行时秘密/账本/证据）：

| `id` | 内容 |
| --- | --- |
| `verifier-acceptance-card` | acceptance 卡数据：`cardKind="acceptance"`（当前唯一允许卡种）、`flowId` 归属、`accept`/`reject` 选项（至少含 accept）、幕僚唯一客户入口、客户或有效委托 chief 最终选择、不得自批/代选、缺证据写 insufficient evidence |
| `verifier-report-expectation` | 报告期望：新任务仅 Chief 创建/收报/收口；报告 `docs/quality/<flowId>-report-vN.md`、证据 `docs/verification/`；`submit_report` 回真实创建者；缺证/失败 blocked/failed；最终 review 的 review target 只表达期望 CID/最终候选/criteria，实际 controller/固定 CID/criteria 由应用核验记录 |

- 静态模板与治理模型/可选 facts 无关（单/trio 输出一致）；输入不被修改。
- 卡数据与旧默认卡种识别（`run-role.ts::defaultGovernanceChoiceCardKind`：verifier 需含 `accept` 才默认 acceptance）及 `TRIO_CARD_KINDS.verifier=["acceptance"]` 对齐；提示不构成发卡权限（发卡仍由引擎校验卡种/归属/选项）。

## 7. 依赖方向与纯度（E0 §3.3）

- 只 import Model public entry：`../../../model/boundary.ts`（type）、`../../../model/role.ts`（type）、`../../../model/runtime.ts`（纯形状 guard）。
- **不 import**：`src/common/门禁引擎/`、`src/pipeline/`、`src/service/`、`src/provider/`、`app/`、`src/common/gates/`、其他角色模块；角色模块之间零 import。
- 无 I/O、账本、会话、时钟、随机数、可变状态；无 `node:` 依赖；无动态 import。
- 所有返回值是普通数据/判定；不返回权限、批准、token、租约或客户凭据。

## 8. 测试与差分

- 单元：`test/roles/verifier/verifier-module.test.ts`（17 项）——数据/能力位/卡种、tools 空声明、dispatch fixture 表、preflight fixture 表 + action 覆盖 + **未登记键 deny 负例**、context 静态段、纯函数/输入不变、单入口/依赖方向扫描。
- 差分：`test/roles/verifier/verifier-differential.test.ts`（12 项）——契约哈希、规格/卡文本金样逐字段、cards 金样（D8）、D1 14 项不含 verifier + 空声明、dispatch zero/documented/module-only 差异、review preflight zero/documented 差异（P5）、验收/证据边界不被读取、金样 provenance（元数据/覆盖映射/载荷哈希/无旧引擎依赖）。
- 夹具：`test/roles/verifier/oracle-fixture.ts`（**冻结金样**：spec/cards/tools D1 catalog/dispatch 15 例/preflight 24 例/KNOWN_DELTAS/来源候选与切换后身份/`payloadSha256`；原 `fixtures/verifier-differential.fixtures.ts` 已 1:1 迁入并删除，避免双份期望值）。
- 运行：`node --test "test/roles/verifier/**/*.test.ts"` → **29/29 pass**（0 fail / 0 skip / 0 todo）。
- 差分结论：卡/边界/capabilities/cards/tools/可表达 dispatch 事实与 review 形状判定**零差异**；`documented` 差异：dispatch 4 条（§4，冻结契约明文/不可能事实 fail-closed）+ review preflight 7 条（E0.3 §3.4/D4 未登记键 ⇒ deny，旧形状 oracle 无事实键白名单），全部为契约明文要求的「更严」差异。
- 类型：`npm run typecheck`（全仓 `tsc --noEmit`）exit 0（2026-11-07 P5 收工复跑）；verifier 文件作用域 tsc 亦 exit 0。
- 证据：`角色卡/verifier-code/docs/change/2026-11-07_E1_verifier-module-evidence.md`（§九「E2 P5 修复」、§十「E2 X-R5 fixture 金样化」）。

## 9. 消费者与 E2 接线（未实施，记录）

- 契约 §3.2：消费者为 Service/桌面（review/acceptance 路由）。E1 只交付模块与差分；E2、X-R5 单元把 `governance-roles.ts` verifier 规格改为 import 本模块 spec，并把 `run-role.ts` 的 verifier 卡种/默认卡数据、桌面 review/acceptance 呈现数据切到模块数据（单写者按团队计划 §7.5）。
- 门脸 `builtInRoleModules: BuiltInRoleModuleMap` 由门禁引擎在 E1 六模块落地后装配；本模块只导出自身 `BuiltInRoleModule`，不 import 其他角色模块。
- i18n：`messageKey` 目前是稳定内部诊断键；若 E2 对外呈现，由 shared-code/i18n owner 按接口评审登记（本模块不写共享 i18n 资源）。
