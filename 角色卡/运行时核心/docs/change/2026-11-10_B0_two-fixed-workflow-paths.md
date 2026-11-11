# B0 实施记录：两条固定工作流路径——基础设施/账本骨架（运行时核心）

- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）；批次 **B0 基础设施/账本**。
- 角色：运行时核心（独立固定上下文；团队计划 §三 B0 行）。只写本角色写集与记录；**不提交/推送/合并/发布**。
- 日期：2026-11-10。
- 状态：**已实施；定向测试与 `test/runtime-core/**` 前后失败集合一致（新增确定性失败 = 0、新 skip = 0）；`npm run typecheck` 仍有 1 处写集外（编排属主）错误，如实记录并停止扩围（§6）**。未 commit / 未 push / 未 stash / 未 merge / 未发布。

## 1. 依据绑定（写盘实测）

| 依据 | 路径 | 实测（行 / 字节 / SHA-256） |
| --- | --- | --- |
| B1（唯一判据） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 / 33,722 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| 实现级方案 v1.3（冻结） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 / 184,391 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| 团队计划 | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | 159 / 17,013 / `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |

- 覆盖判据：AC-05 / AC-13 / AC-14 / AC-17 / AC-24 / AC-25；T-06 / T-11 / T-13 的本批类型/schema 子项。
- 方案锚点：§3.3（stage-request 载荷）、§3.5（工具面/schema）、§4.1（WorkflowPath/WorkflowStage/StageStatus 与账本事件公共字段）、§5.3（basis.recorded）、§6.4（release 事件）、§7.1（事件完整字段/幂等键）、§8.4（merge-main 卡）。

## 2. 基线（实施前实测）

| 项 | 实测 |
| --- | --- |
| worktree | `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment` |
| 分支 | `feat/two-fixed-workflow-paths` |
| HEAD | `ad22192197b28f401de8e1d22669b577ef4833e0`（代码基线 `10f90c7`；自该点仅 docs 提交） |
| 起始工作树 | `git status --porcelain -- src app test` 输出为空（0 行，实施开始时实测） |
| 并行批次 | 实施期间门禁引擎/shared-code 开始写入：`src/model/role.ts`、`src/common/shared/config-loader.ts`、`test/门禁引擎/role-module-contract.test.ts`、`test/项目管理/shared/config-loader.test.ts`、`test/门禁引擎/dispatch-matrix-mode.test.ts`。**均非本角色改动，不计入本候选**；本角色未触碰 |
| 已知红（B1 §二） | `test/编排/**` 22 fail/2 skip、version-change-integration 9 红、optional-acceptance 6/2/1/3/0；本批不触碰这些文件 |

## 3. 范围与不做

**本批实现（B0，类型/schema/plumbing 骨架）**

1. `src/model/runtime.ts`：`WorkflowPath`/`WorkflowStage`（A1–A13 含 A12a/A12b、B1–B4）/`StageStatus`/`WorkflowAction`；`ans-workflow/v1`（11 事件）、`ans-basis/v1`（4 事件）、`ans-release/v1`（5 事件）完整类型 union + 事件公共字段（`v/at/schema/idempotencyKey`；workflow 事件另带 `workflowId/flowId/path`）+ 最小形状守卫（`isWorkflowPath`/`isWorkflowStage`/`isStageStatus`/`isWorkflowEvent`/`isBasisEvent`/`isReleaseEvent`）。
2. `TaskCreatedEvent` 可选 `workflowId/stage/taskKind/workflowPath`；`request.created`/`request.resolved` 可选 `documentRefs/workflowId/stage`；**未加必填、未改旧字段/旧语义**。
3. `DispatchTaskPayload` 可选 `taskKind/workflowAction/workflowPath/workflowId/stage/reworkOf`（v1.3 §3.3）。
4. `AppOwnedGovernanceCardKind`/`GOVERNANCE_APP_OWNED_CARD_KINDS` 增 `"merge-main"`；`GovernanceCardKind` 自动并入；**`GOVERNANCE_CARD_GROUP` 键/值逐字不变**（`governanceCardGroup("merge-main") === undefined`）；`GOVERNANCE_CARD_KINDS` 派生包含。
5. `dispatch_task` schema 新属性（`taskKind`/`workflowAction`/`workflowPath`/`workflowId`/`stage`/`reworkOf`，文案模式中立）；`contract_check.taskKind` 枚举同步 `"stage-request"`；`close_created_task` 仅描述预留 fixed v2 模式语义（**required 数组逐字不变，不在 B0 放宽**）。
6. `tools.ts` dispatch handler 形状校验 + 透传（不做业务）；contract_check 透传枚举。
7. 测试：`test/runtime-core/two-fixed-workflow-paths-b0.test.ts`（新，10 用例）+ `stable-write-card-kind.test.ts` 期望值同步（断言仍为精确清单）。

**不做（按任务边界）**：状态机/投影/账本 I/O（编排 B0/B1）；task-state run-required 分支（编排）；角色模块 fixedCards/context（B2）；session 路由（B1/B3）；classify-shell v5（B4）；`request_release_merge`（G-IR 后）；不新增依赖；不改 B1/方案文档。

## 4. 改动文件与逐文件 SHA-256

| 文件 | 前（HEAD blob raw SHA-256） | 后（工作树 raw SHA-256） | numstat | 后置行/字节 |
| --- | --- | --- | --- | --- |
| `src/model/runtime.ts` | `224376d1d4129e34358a0bd24b4efc285afb319cb275ad9a35c309aa7426bd15` | `17c5d7a40cc8a725fddeb615845a92abcbee29df9870bb91ff146f82232ab8fc` | +647 / −8 | 4,822 / 244,058 |
| `src/provider/runtime/schema.ts` | `d6671cac0741eeaf97d9dc266b4570dbbf36f3a5c81393aafdf3b180eaca66db` | `061fd80c791d6794b09d9976983cbdd31aeeba8b6c820898fe41f99a7a5e50fc` | +44 / −3 | 1,902 / 150,934 |
| `src/provider/runtime/tools.ts` | `455e2717583b1c30c389fb603b31099a3c38d03f77bac0545e1c944b8768ffaf` | `d30b7f65a117d852cae9bc478dafc48c60c9202c9660c28f7c716545e2e15635` | +40 / −1 | 5,521 / 338,989 |
| `test/runtime-core/stable-write-card-kind.test.ts` | `6f919806ca8fc8a09bba83a9afdb85a58ec827a093de4340811bd4ed52d1a39f` | `2504b5073fa31d874897edac674ed826f3f2b68db5316a4abf24fee2c23e79af` | +8 / −4 | 103 / 5,369 |
| `test/runtime-core/two-fixed-workflow-paths-b0.test.ts`（新） | — | `b82c84c16e137465be171826bf5298f8f836f68affb6bc6ef8640b9efeb0a717` | 新文件（321 行） | 321 / 19,535 |

- **可复算聚合**（按路径排序后 `path + "\0" + sha256` 串联的 SHA-256）：`29cc8e90057036c5229f6b5eb1816ee3c201aa54194058fdb05e3278cb325c44`。
- 候选 diff（4 个已跟踪文件；新测试文件另行归档）：51,984 bytes / `7683c78136e11b5d3c19963da7f4a4893c7b42c10c870d456da4ab115ee0cbe4`（`_evidence/candidate.diff`）。
- 被删除行仅为本批有意替换的 8 行（`AppOwnedGovernanceCardKind`/清单旧定义、两处注释、`ContractCheckInput.taskKind` 旧行）；无其它删除。未新增/删除依赖；未改构建/发布配置。

### 4.1 `src/model/runtime.ts`

- 卡种：`AppOwnedGovernanceCardKind = "stable-write" | "merge-main"`；`GOVERNANCE_APP_OWNED_CARD_KINDS = ["stable-write","merge-main"]`（冻结）；`GOVERNANCE_CARD_GROUP` **未改**；注释写明 merge-main 为客户本人高风险合并确认卡、judge 不可代批（协调方决策 #4）。
- 新增「T3 B0 账本类型」段（`TaskStateEvent` union 之后）：三 schema 常量、`WorkflowEvent`/`BasisEvent`/`ReleaseEvent`/`FixedPathLedgerEvent`、`WORKFLOW_STAGES`（19 项冻结）、`WORKFLOW_EVENT_KINDS`（11）/`BASIS_EVENT_KINDS`（4）/`RELEASE_EVENT_KINDS`（5）、最小守卫。字段逐项按 v1.3 §7.1（含各事件幂等键模式注释）；`release.merged` 含 `baseOid/tipOid/mergeOid/mergeKind/files/diffDigest`；`release.confirmed` 仅 `by:"customer"`（judge 不可 confirm），`release.rejected` 允许 `customer|judge`（judge 只能拒绝/转人工）。
- `TaskCreatedEvent`：追加 4 个可选字段（注释明确 workflowId 存在即豁免 run-required 由编排实现、旧事件兼容读取）。
- `RequestCreatedEvent`/`RequestResolvedEvent`：追加 `documentRefs?: WorkflowDocumentRef[]`、`workflowId?`、`stage?`。
- `DispatchTaskPayload`：追加 6 个可选字段（v1.3 §3.3），注释声明载荷不构成授权、缺省=旧行为。
- `ContractCheckInput.taskKind`：枚举追加 `"stage-request"`（legacy 五项不变）。

### 4.2 `src/provider/runtime/schema.ts`

- `dispatch_task`：新增 6 个可选属性；`required` 仍 `["roleId","task"]`、`additionalProperties:true`、旧属性（`flowId/stepId/moduleId/modulePaths/sideEffect/...`）逐字保留；`stage`/`reworkOf` 枚举取 `WORKFLOW_STAGES`；文案模式中立（不写死 fixed 专属口号），promptGuidelines 追加两条（stage-request 无写权/须再派发；stop 由收到请求的一方执行停稳）。
- `close_created_task`：仅 description 追加「按实际工作流模式核验必填字段；未启用固定路径时 runId/basisDigest/reportRef 必填不变；固定路径模式（由编排启用后）只要求 operationId/taskId/outcome」。**parameters/required 未改**（不在 B0 放宽）。
- `contract_check.taskKind` 枚举：追加 `"stage-request"`。
- 未新增 `request_release_merge`（G-IR 未评审；B2 按结论决定）。

### 4.3 `src/provider/runtime/tools.ts`

- `dispatch_task` handler：新增 6 字段形状校验（`taskKind` 非空串；`workflowAction∈{advance,stop}`；`workflowPath∈{A,B}`；`workflowId` 1–200 字；`stage/reworkOf` 必须为合法阶段）并只在存在时透传进 `DispatchTaskPayload`（旧载荷不追加任何键）。**不做**来源/目标/阶段转移/副作用等业务校验（应用 handler/编排属主）。
- `contract_check` handler：`taskKind` 透传枚举同步 `"stage-request"`。
- 未改 `close_created_task` 直连能力语义（directShapeError/required 未动）。

## 5. 测试与证据

环境：Node **v24.22.1**；基线在干净 HEAD `ad22192` 解包目录（无 worktree `.git` 文件）运行；候选在工作树运行。日志见 `_evidence/`。

### 5.1 定向套件（稳定卡种 + 新 B0 契约 + 直连能力 + pi/claude 适配器 + 既有文案红例）

命令：`node --test --test-concurrency=1 --test-reporter=tap <files>`

| 时点 | tests | pass | fail | cancelled | skipped | 日志 SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| 实施前（干净 HEAD，5 文件） | 40 | 38 | 2 | 0 | 0 | `0ef76e738df1d24fb8d2649ec90e0af49cdf7830617826dd08bc81478d764f0b` |
| 实施后（本候选，6 文件＝原 5 + 新 B0） | 50 | 48 | 2 | 0 | 0 | `81e96443bc67f9237d7737f5a1c22376b0c51e67705d5b27417fa21b2efe16cf` |

- 新增 10 用例全部 `ok`；失败集合前后同为 2 个既有红例（`test/runtime-core/dispatch-workflow-writer-copy.test.ts` 的 `dispatch_task 文案…`/`dispatch_task promptGuidelines…`，HEAD 基线即失败，非本批引入、未修复）。
- 直接覆盖：`merge-main` 卡种语义；旧 `TaskCreatedEvent`/`RequestCreatedEvent`/`RequestResolvedEvent`/`DispatchTaskPayload` 形状仍合法且新字段可选；账本三 schema 守卫正/负例（坏 schema/坏 stage/坏 kind/坏 OID/缺幂等键；未知额外字段容忍；旧 tasks 形状不被误认）；`dispatch_task` schema 新旧属性与 required；`contract_check` 枚举；`close_created_task` required 未放宽；handler 透传/旧载荷逐字/非法参数不调用注入 fn。

### 5.2 `test/runtime-core/**` 全量前后对照（失败集合 diff）

| 时点/方式 | tests | pass | fail | skipped | 日志 SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 实施前（干净 HEAD） | 554 | 542 | 8 | 4 | `ba6746a09d77ddf66b87d6c49eb6ca48ad46255b80079c0edc3410a6527de9e2` |
| 实施后（工作树，含并行角色改动） | 564 | 527 | 33 | 4 | `0bde06872540a7ea8c8d5275e2bfd8b02de55f73f5c49bb42570284add596782` |
| **实施后（干净 HEAD + 本候选 5 文件 overlay）** | **564** | **552** | **8** | **4** | `d89d8127f7fe7e3ba10231c5bd535b5d8d89cb92dd5f3c590811048d2472be29` |

- **overlay 失败集合与 HEAD 基线逐名一致（diff 为空）**：本候选在 `test/runtime-core/**` 新增确定性失败 = 0、新 skip = 0；新增 10 用例。
- 工作树多出的 25 个失败均为环境性 `runtime-protection-scope-unknown`（`src/service/runtime/session.ts` 的 `readCoreProtectionScope`：worktree 根 `.git` 为文件 ⇒ `git-association-protection-requirement-unknown` ⇒ unknown），在干净解包根（无 `.git` 文件）全部通过；与 W1 记录 §5.1 的既有红一致，非本候选引入。相关失败名见 `_evidence/after-runtime-core-suite.worktree.tap`。
- 8 个 HEAD 基线红（含 `dispatch-workflow-writer-copy` 2 例）均与环境/既有契约无关本批，未新增同名恶化。

### 5.3 适配器/角色快速回归子集

- 同一子集（`test/roles/verifier/verifier-module.test.ts`、`test/roles/chief/differential.test.ts`、`test/pi-adapter/tool-display-projection.test.ts`）：
  - 干净 HEAD 基线：37 / 38 pass；1 红为**解包目录无 `.git`** 导致的契约冻结哈希用例（`差分：契约冻结文件哈希（E0.3 067e3d2e…）`），环境性，非代码回归。
  - 工作树（本候选 + 并行角色改动）：**38 / 38 pass（0 fail）**。
  - 日志：`_evidence/before-role-adapter-subset.tap` / `_evidence/after-role-adapter-subset.tap`。
- 定向适配器契约（`test/pi-adapter/dispatch-task.test.ts`、`test/claude-adapter/schema.test.ts`）已含在 §5.1 前后对照中，全部通过。
- 更宽的适配器/角色全量 overlay 复跑在本环境挂起（已停止、无产出），不作为本批判据；干净 HEAD 解包上宽量基线曾为 841 / 835 / 4 / 2（4 红同为环境性：Pi storage symlink 2 例 + 差分冻结哈希 2 例），仅供参照。

## 6. typecheck 与写集外需求（停止项）

| 时点 | 命令 | exit | 结果 |
| --- | --- | --- | --- |
| 实施前（干净 HEAD） | `npx --no-install tsc --noEmit` | 0 | 空输出（`_evidence/before-typecheck.log`） |
| 实施后（本候选） | `npm run typecheck` | 1 | 1 处错误（`_evidence/after-typecheck.log`） |

```
src/pipeline/orchestration/run-role.ts(3234,7): error TS2322:
Type '{ acceptance: string; ...; "stable-write": string; }' is not assignable to type
'Readonly<Record<GovernanceCardKind, string>> & ...'.
Property '"merge-main"' is missing ... but required in type 'Readonly<Record<GovernanceCardKind, string>>'.
```

- **根因**：AC-14/v1.3 §8.4 要求 `GovernanceCardKind` 并入 `merge-main`（本批已按判据实现）；`run-role.ts::CARD_KIND_ROUTE_HINTS` 是 `Record<GovernanceCardKind, string>` 穷举表，新增联合成员后必须补一个 route-hint 键（或改 Partial）。
- **归属与处置**：`src/pipeline/orchestration/run-role.ts` 属**编排**写集（团队计划 B1 行 `run-role.ts`/B3），不在本角色写集；按纪律**未修改他人文件、未为绿改类型契约**。这是本批唯一写集外需求（停止项）：请编排在其批次补 `merge-main` 文案键（例如「合并 main 确认卡由应用合并通道发起；必须客户本人确认，judge 不可代批；不得用 request_choice/request_confirmation 发该卡」）。
- 其余类型检查在干净 HEAD + 本候选下无新增错误（并行角色改动不参与本判定）。

## 7. 边界与写集核对

- 本角色改动仅上述 5 文件，全部在 B0 写集（`src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`、`test/runtime-core/**`）。
- 未改：`src/model/role.ts`（门禁引擎）、`src/common/编排/**`（编排）、`src/common/shared/**`（shared-code）、`src/common/roles/**`（角色 code）、`app/**`、其它角色/文档、B1/方案文档；未新增依赖；未动 9222/9223；未运行真实模型/Electron。
- 工作树中其它 `M/??`（`config-loader.ts`、`role.ts`、`test/门禁引擎/*`、`test/项目管理/shared/*`）属并行角色批次，本记录如实列出但不计入本候选。

## 8. 限制与未提交声明

- 本批只做 B0 类型/schema/plumbing；**不含**状态机、投影、账本 I/O、run-required 分支、fixed 业务校验、session 路由；相关判据（AC-04/06/07/08/09/10/11/12/15…）仍待后续批次。
- `close_created_task` 的 fixed 条件与 schema `required` 条件化留待 B2（本批仅描述预留；legacy 必填逐字保留）。
- 无 `request_release_merge`（G-IR 未评审）。
- **未提交声明**：本轮仅写工作树；未 commit / 未 push / 未 stash / 未 merge / 未 tag / 未发布；候选以 §4 逐文件 raw SHA-256 与聚合 `29cc8e90…` 标识。
