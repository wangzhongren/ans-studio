# product 角色模块 public API（实现报告）

- 模块：`src/common/roles/product/`（唯一 public entry `index.ts`）
- 实现角色：product-code（开发侧 worker）；E1 greenfield；**B2（T3 两条固定工作流路径）增补 fixed 面**
- 契约：`docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（E0.3，685 行 /
  SHA-256 `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`）§3.1/§3.2/§3.3/§3.4/§3.5、
  §10.2 D1/D8/D10；团队计划 §4.4②/§7.4；B1 §3.3 E1.1–E1.7；
  T3 B2 依据：`docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` §3.2/§3.4（`ae737dcf…`）、
  G-IR §5.7/MF-IR-4（`08e01726…`）、B1 验收 AC-24/T-13（`b607f100…`）
- 证据：`docs/change/2026-11-07_E1_product-module-evidence.md`；
  B2：`docs/change/2026-11-10_B2_two-fixed-workflow-paths.md` + `_evidence/`

## 1. 公开形状

`index.ts` 恰好导出一个值：

```ts
export const productRoleModule: BuiltInRoleModule;
```

`BuiltInRoleModule`（`src/model/role.ts`）＝ 规格数据 `id/displayName/function/card/capabilities/cards`
＋可选的 fixed 字段 `fixedCards`（MF-IR-4）＋四个纯策略面 `tools/dispatch/preflight?/context`。
内部实现全部在 `internal/`（模块根只放 `index.ts`）。

| 字段 | 值 / 语义 | 来源 |
| --- | --- | --- |
| `id` | `"product"` | E0.3 §3.1 |
| `displayName` | `"产品"` | 旧 `governance-roles.ts` product 规格（逐字迁移） |
| `function` | `"product"` | 同上 |
| `card.text` | 旧 `PRODUCT_CARD_TEXT` 逐字（含 shared `intentEntryContractText("product")`） | 同上 |
| `card.entries` | `[{root:"project", path:"docs/product/", kind:"directory", purpose:"产品取舍 / 产品评审 / 产品文档（D 批目标写区）"}]` | 同上 |
| `card.preauthorizedDirs` | `["docs/product/"]` | 同上 |
| `card.forbiddenWritePaths` | 旧规格逐字逐序（应用独占 3 项 + 共用 8 项） | 同上 |
| `capabilities` | `customerInput=false, dispatchTask=false, roleStatus=false, sessionTail=false, installSkill=false, installMcp=false, shell="operator-approve"` | 同上（D10 唯一真源） |
| `cards` | `[]`（product 不发起治理卡；旧 `TRIO_CARD_KINDS.product = []`；D8；legacy 冻结） | 旧 run-role 私有表 |
| `fixedCards` | `[]`（fixed 矩阵白名单；意图确认卡由幕僚呈；MF-IR-4 冻结值；固定路径**不新增卡**） | v1.3 §3.4 / G-IR §5.7 |

模块对象与嵌套数据均 `Object.freeze`；不携带权限字段。`fixedCards` 只在
`matrix:"two-fixed-paths/v1"` 下由门禁引擎门面 `cardKindsOf(id, matrix)` 读取；legacy 消费点不得改读。

## 2. `tools(input: TrustedToolPolicyInput): RoleToolPolicy`

- `governanceModel === "trio"` → `tools: ["submitVersionChange"]`（唯一角色专属额外注入）。
- `governanceModel === "single"` → `tools: []`（Model 注释：single 不装配 trio 角色工具）。
- 运行期未知模型（类型不可达）→ `tools: []` + reason
  `{code:"role-tools-model-unknown", messageKey:"role.product.tools.modelUnknown"}`（fail-closed）。
- `capabilities` 返回模块 spec 的**同一引用**（D10 单一真源），不复制第二份。
- `reasons` 正常路径为空数组。

旧 run-role 门控（oracle）：`submitVersionChange` 仅注入 product / rapporteur；工具内再按 kind 限定唯一
发起角色（version-upgrade = product）。id→运行时工具名→允许角色的唯一装配表是门禁引擎私有
`role-tool-registry.ts::ROLE_TOOL_CATALOG`（本模块不 import、不复制映射）；未知/越权 id 由引擎装配
`validateRoleToolDeclaration` 整单 fail-closed（不注入、不静默忽略）。

## 3. `dispatch(input: RoleDispatchPolicyInput): RoleDispatchPolicy`

R-2：只做硬身份/存在性判定。本模块只回答与 product 相关的派发（与 nominator 模块同口径）：

| 输入条件 | 结果 | `reportToRoleId` |
| --- | --- | --- |
| `sourceRoleId === targetRoleId`（真实非空） | deny `self-dispatch` | — |
| 来源缺失，或来源 ∉ {chief, convener} | deny `unknown-source` | — |
| 目标 ≠ `"product"`（来源为 chief/convener） | deny `dispatch-not-in-module-scope` | — |
| 目标 = product，`targetKind !== "built-in-governance"` 且来源 chief | deny `chief-to-project-forbidden` | — |
| 目标 = product，来源 chief，`targetExists !== true` | deny `target-card-missing` | — |
| 目标 = product，来源 chief，内置、存在 | **allow** | `"chief"`（真实创建者/差分期望） |
| 目标 = product，来源 convener，内置 | deny `convener-target-forbidden` | — |
| 目标 = product，来源 convener，声明 project 类别 | deny `dispatch-input-invalid`（身份冲突） | — |
| 输入形状畸形（空 id/非法 kind/targetExists 非 boolean） | deny `dispatch-input-invalid` | — |

messageKey 统一 `role.product.dispatch.<camelCase>`（`inputInvalid/selfDispatch/unknownSource/
notInModuleScope/chiefToProjectForbidden/targetCardMissing/convenerTargetForbidden/chiefProductionForbidden`）。

### 3.1 fixed 矩阵分支（`matrix:"two-fixed-paths/v1"`；B2 新增）

同一纯函数内按 `input.matrix` 分支；**缺省 / `"legacy-v1"` 走上表 legacy 逻辑逐字不变**（未传
`matrix` 的旧调用点行为不变）。fixed 分支（v1.3 §3.2/§3.4）：

| 输入条件 | 结果 | `reportToRoleId` |
| --- | --- | --- |
| 输入形状畸形（同 legacy 校验：空 id/非法 kind/targetExists 非 boolean） | deny `dispatch-input-invalid` | — |
| `sourceRoleId === targetRoleId`（真实非空） | deny `self-dispatch` | — |
| 来源缺失，或来源 ∉ {chief, convener} | deny `unknown-source` | — |
| 目标 ≠ `"product"`（来源为 chief/convener） | deny `dispatch-not-in-module-scope` | — |
| 目标 = product，声明 project 类别（内置 id 身份冲突） | deny `dispatch-input-invalid` | — |
| 目标 = product，来源 chief，内置 | deny **`chief-production-dispatch-forbidden`**（fixed-only 稳定码） | — |
| 目标 = product，来源 convener，内置、`targetExists !== true` | deny `target-card-missing`（fail-closed） | — |
| 目标 = product，来源 convener，内置、存在 | **allow** | `"convener"`（fixed 生产线任务创建者） |

- fixed-only 稳定码 `chief-production-dispatch-forbidden` 的 i18n 键为
  `role.product.dispatch.chiefProductionForbidden`（v1.3 §3.2 第 8 条：登记在 api-spec/i18n/测试；
  **legacy 从不返回**；不新增客户可见门）。
- 本模块只回答目标=product 的判定；fixed 目标归属由 convener 模块
  `fixedAllowedBuiltInRoleIds`/`isConvenerFixedBuiltInDispatchTarget` 表达（MF-IR-4）。
- 报告期望只是差分口径，不驱动实际路由（实际路由/证据校验由编排
  `workflow-dispatch.ts::evaluateFixedPathDispatchAuthorization` 与桌面完成）。

与旧 `evaluateDispatchAuthorization` 的**已列明差异**（差分测试按编号断言）：

- **D-DISP-1**：旧 chief 分支对 builtin 目标不检查 `targetExists`；模块按 E0 §3.5 要求 `true`
  （fail-closed）。生产桌面调用点对内置 id 恒传 `true`。
- **D-DISP-2**：旧谓词把「id=product 但 kind=project」当项目 worker 放行；模块视为身份冲突拒绝。
- **D-DISP-3**：非 product 目标（如 chief→rapporteur、convener→verifier）不在本模块判定范围，返回
  `dispatch-not-in-module-scope`；由对应角色模块/引擎回答。

不在本模块（R-2 / §3.1）：hub/legacy/review 路由、run/module 规则、D3 选中集合、交付任务/模块属主、
报告时点与实际路由（`workflow-preconditions.ts::reportTargetForTaskCreator` 是编排稳定公开只读入口）。
`reportToRoleId` 仅作差分期望，不驱动实际路由。

## 4. `preflight.checkAction(input: RolePreflightInput): RolePolicyDecision`

覆盖动作：**仅 `version-upgrade`**；其他 9 个动作 → deny `action-not-covered`
（messageKey `role.product.preflight.actionNotCovered`）。

### 4.1 事实键（E0 D4 / Q13：api-spec 登记 + 测试冻结）

| 键 | 类型 | 必填 | 规则 | 违规码 |
| --- | --- | --- | --- | --- |
| `initiatorRoleId` | string | 是 | 必须 `"product"`（可信会话角色） | `product-facts-missing` / `product-facts-invalid` / `product-initiator-mismatch` |
| `kind` | string | 是 | 必须 `"version-upgrade"`（product 不提交 detail-amendment） | `product-facts-missing` / `product-facts-invalid` / `product-kind-mismatch` |
| `operationId` | string | 是 | trim 后非空（直接提交 operation id） | `product-facts-missing` / `product-facts-invalid` / `product-operation-id-missing` |
| `baseTrunk` | object \| null | 是 | `{version: integer>=1, digest: 非空 string}` 或 `null`；`null` 仅 bootstrap | `product-facts-missing` / `product-base-trunk-invalid` / `product-bootstrap-mismatch` |
| `bootstrap` | boolean | 否 | `baseTrunk===null` 时必须 `true`；否则不得 `true` | `product-facts-invalid` / `product-bootstrap-mismatch` |
| `targets` | array | 是 | 至少 1 项；每项须 own `expectedFromSha256: string \| null` | `product-facts-missing` / `product-targets-invalid` |
| `amendmentId` | — | 必须缺席 | version-upgrade 不得引用修正案 | `product-amendment-ref-forbidden` |
| `amendmentDocPath` | — | 必须缺席 | 同上 | `product-amendment-ref-forbidden` |
| `amendmentItems` | — | 必须缺席 | 同上 | `product-amendment-ref-forbidden` |

缺键 → `product-facts-missing`；未登记键 → `product-facts-unknown-key`（fail-closed，防事实走私）；
类型不符 → `product-facts-invalid`。`details` 只含普通可序列化数据（`roleId/action/factKey/...`），
不含密钥、客户正文或模型原始输出。

messageKey 统一 `role.product.preflight.<camelCase>`（`actionNotCovered/factsMissing/factsInvalid/
factsUnknownKey/initiatorMismatch/kindMismatch/amendmentRefForbidden/operationIdMissing/
bootstrapMismatch/baseTrunkInvalid/targetsInvalid`）。

### 4.2 与旧 VCA/trunk 条件的对应（不替代最终校验）

| 角色侧条件（本模块） | 旧实现 oracle |
| --- | --- |
| initiator = product（version-upgrade 唯一发起角色） | `vca-service.ts::prepareDirect` / `vca-service.ts::create`（`vca-role-not-allowed`）；`version-change-runtime.ts::submitDirect`；`apply-journal.ts::prepareDirectSubmission` |
| kind = version-upgrade | `src/model/version-change.ts::VERSION_CHANGE_INITIATOR_BY_KIND` |
| operationId 非空、baseTrunk 显式 | `prepareDirectSubmission` / `submitDirect` 直接提交前置 |
| baseTrunk 形状 `{version,digest}` 或 null；null ⇔ bootstrap | `vca-service.ts::validateBaseTrunk` + tool schema `baseTrunk` |
| 每 target `expectedFromSha256` | `prepareDirectSubmission`（CAS 期望原字节） |
| version-upgrade 不得引用修正案/items | `vca-service.ts::validateAmendmentRefs` |

**不复制**（Service/Provider 最终校验，preflight allow 不省略）：文件字节/hash 重算、target kind/path
作者写区与版本链、base 与当前 trunk 全等、flowId/summary 结构、同 flow pending、快照/冻结/apply/journal。

### 4.3 与旧 oracle 镜像的已列明差异

- **D-PRE-1**：模块额外提前拒绝空 `targets` 与畸形 `baseTrunk` 形状（旧服务层在更晚阶段失败）。
- **D-PRE-2**：模块拒绝未登记事实键（E0 D4 fail-closed）；旧类型输入忽略未知键。

## 5. `context(input: RoleContextInput): readonly RoleContextSection[]`

按 `input.matrix` 选择 legacy/fixed 段（缺省 `"legacy-v1"`；只读 `matrix`，不读 `facts`）。

### 5.1 legacy（缺省 / `"legacy-v1"`；逐字冻结）

返回 4 个静态提示块（顺序稳定、id 唯一、无 `resources`；宿主负责读取/脱敏）：

| id | 内容 |
| --- | --- |
| `product-duty` | 产品职责、只写 `docs/product/`、不写提案/名单/架构/角色卡、不实现/不招人 |
| `product-intent` | 意图版本化规则与必含字段、不写实现方案 |
| `product-version-upgrade` | version-upgrade 直接提交/不等待 VCA 批拒/旧 run 不自动重 pin |
| `product-report` | 报告期望：`submit_report` 回真实任务创建者（幕僚/Chief），缺信息先报阻塞 |

### 5.2 fixed（`matrix:"two-fixed-paths/v1"`；B2 新增）

返回 3 个 fixed 静态提示块（legacy 4 段不混入；由编排在 fixed 会话追加注入，v1.3 §3.4）：

| id | 内容 |
| --- | --- |
| `product-fixed-duty` | 按运营（convener）派发撰写/修订 `docs/product/<flowId>-intent-vN.md`（版本化、不原地改）；必含字段；不写实现方案；与旧卡文本冲突时以本段为准 |
| `product-fixed-boundary` | 只写 `docs/product/`；不派发任务、不实现、不招人；不自行改方案/名单/架构/角色卡；意图确认卡由幕僚呈、product 不发卡；不注入 VCA/版本决策/结构化 Git 工具 |
| `product-fixed-report` | 报告期望：`submit_report` 回真实任务创建者运营（convener）；缺信息先报阻塞 |

`context()` 不读取 `facts`（登记读取键：无）；legacy/fixed 各自返回同一份冻结静态数据（同一引用）。
product 无应用资源文件，故不声明 `RoleContextResourceRef`（项目 `docs/workflow.md` 不是角色模块资源；
E0 D5/Q4）。fixed 段只在 `matrix:"two-fixed-paths/v1"` 下生效；legacy `context({})` 返回值逐字不变。

## 6. 依赖、纯度与模块纪律

- 只 import `src/model/` 与 `src/common/shared/` public entry（`intent-entry-contract.ts` 的纯文本函数）；
  不 import `src/common/门禁引擎/`、`src/pipeline/`、`src/service/`、`src/provider/`、`app/`、门控模块或
  其他角色模块（角色模块之间零 import）。
- 无 I/O、无账本、无会话、无时钟、无随机数、无可变状态；输入只读；返回普通数据/判定，不携带权限。
- 唯一 public entry `index.ts`；模块根只有 `index.ts` 与 `internal/`；外部只能经 index 导入。
- `capabilities` 单一真源（D10），`tools()` 输出同一引用。

## 7. 消费者与切换说明

主要消费者（E2 切换后，契约 §3.2）：Service（`src/service/version-change/`、`src/service/trunk/`）、
编排、桌面窗口。E1 过渡期旧引擎（`governance-roles.ts`/`run-role.ts`/`apply-journal.ts`）仍是权威
oracle；本模块输出只供差分与 E2 装配。本轮未改任何旧引擎/Model/shared/其他角色文件，未提交/推送。

## 8. 待接口评审事项

1. `role.product.*` messageKey 尚未登记进共享 i18n 目录（属主：shared-code/i18n）；对外呈现前需登记文案。
2. 角色卡共用纪律段（DIRECT_*/ROLE_RECOVERY/CHIEF_HUB）目前按契约 §3.2 随卡数据迁入各角色模块；
   六模块并行后若出现跨模块重复，应在 E1 接口评审决定是否上收 shared（shared-code 属主）。
3. E2 切换时由门禁引擎门面装配 `BuiltInRoleModuleMap` 并删除旧内联 product 规格（D2/D6）。
