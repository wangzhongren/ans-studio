# 编排 B2 记录：两条固定工作流路径（角色接线：cardKindsOf 门面 / chief-workflow-v2 / fixed 收口-激活依赖 / 首次启动顺序）

- 批次：**B2 角色模块/工具面——编排接线批次**（团队计划 §三 B2「编排」行 + 任务精确写集）
- 角色 / 上下文：编排（roleId `编排`，独立实施上下文）
- 日期：2026-11-10；worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；
  分支 `feat/two-fixed-workflow-paths`；基线 HEAD **`d4bc79c`**（B2 门禁引擎 + 六角色模块已提交）
- 状态：**已实现，未提交**；`npm run typecheck` **exit 0**；`test/编排` before 1,250/1,224/24/2 →
  after 1,265/1,239/24/2（失败名集合**逐名一致**、新 skip=0）；新增 15 测试全绿（targeted 17/17，
  含 B1 既有 fixed 2）；`test/roles` **275/275 pass**；`test/门禁引擎` **499/493/5/1**（只读回归，
  5 known-red 与 B2 门禁记录逐名一致，零重叠）。
  未 commit / 未 push / 未 merge / 未发布；未运行真实模型/Electron；未占用 9222/9223。

## 0. 依据绑定（写盘实测 SHA-256）

| 依据 | 路径 | 实测（字节 / SHA-256） |
| --- | --- | --- |
| B1 验收（冻结；AC-05/08/18/24/25、T-03/04/13） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 33,722 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| G-IR 接口评审（MF-IR-2/3/4/5/8） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 35,665 / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 实现级方案 v1.3（§3.2/§3.4/§3.5/§3.6/§7.1） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 184,391 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| B1 编排记录（B1 语义基线） | `角色卡/编排/docs/change/2026-11-10_B1_two-fixed-workflow-paths.md` | 24,351 / `5d058f4c8023904bc57b5fa722e0853ce989c3f3bcf3edba3e70bb256d61d30c` |
| B2 门禁引擎记录（facade/资源属主） | `角色卡/门禁引擎/docs/change/2026-11-10_B2_two-fixed-workflow-paths.md` | 17,582 / `6cd8c598480d77fa6abd39227be9330c9d2e9cd4253aa49b167c32c523966d62` |
| 团队计划 | `docs/scheduling/2026-11-10_team-plan_two-fixed-workflow-paths.md` | 17,013 / `4c63ccbc84990f00e772fb6e16cf0e9df9433a8bbe5c99dcd078b67bca036211` |

六份 hash 与任务给定值一致（本记录写盘前实测）。

## 1. 实施内容（按写集）

### 1.1 `src/pipeline/orchestration/run-role.ts`（M，+192/−15）：`cardKindsOf` 改调门禁引擎门面（MF-IR-4）

- 运行期 `cardKindsOf(roleId, matrix)` 现为**门禁引擎门面委托**：
  `return governanceCardKindsOf(roleId, matrix)`（`src/common/门禁引擎/governance-roles.ts`）。
  legacy 矩阵只读模块 `cards`（逐字不变）；fixed 矩阵**只读模块 `fixedCards`**（缺失/未装配 ⇒
  fail-closed 空集，不回退 legacy `cards`）；本层不复制第二张表。
- `legacyCardKindsOf` 两行源码（`const module = builtInRoleModuleOf(roleId); if (module !== undefined)
  return module.cards;`）与迁移前表 `TRIO_CARD_KINDS`（仅 product 行）**逐字保留**——module-consumption
  源码锚点测试与 product 迁移前 oracle 不改；注释登记「运行期已改门面，本函数只作锚点/回退展示」。
- 行为等价性：六内置角色模块均已装配（B2 六角色提交），facade legacy 分支 = 模块 `cards`；未装配角色
  两边均为空集（product 回退值 `[]`）。调用点（卡种白名单/default 卡种/发起人反推/confirm 过滤）不变。

### 1.2 `src/pipeline/orchestration/run-role.ts`：fixed chief 注入 `chief-workflow-v2.md`（AC-24 / §3.4）

- 新增 `loadFixedChiefWorkflowResource()`：从应用包内
  `src/common/门禁引擎/workflows/chief/chief-workflow-v2.md` 读取；校验 Markdown 身份、**唯一版本行恰
  `chief-workflow/v2`**、UTF-8/NUL/≤256 KiB；计算 SHA-256/bytes 并附应用版本；失败抛
  `chief-workflow-v2-resource-unavailable` **fail-closed**（与 legacy loader 同口径，不猜正文）。
- fixed 会话（`sessionWorkflowMode === "fixed"`）且会话角色为内置 chief 且非独立决策上下文：
  - 追加 `## 应用内置 Chief workflow v2（fixed 固定路径；本段优先于任何 legacy chief-workflow v1 段）` +
    资源元数据 JSON（sourceUrl/moduleUrl/resourceVersion/sha256/bytes/applicationVersion）+ 正文；
  - 诊断 `chief.workflow.v2.loaded`（version/sha256/bytes）。
- legacy `chief-workflow.md` **不读、不改**（实测 sha256 `9bef5626…` 与模块 `CHIEF_WORKFLOW_RESOURCE`
  一致）；legacy 会话不追加 v2 段。其它角色 fixed 会话只追加各自模块 `context({matrix})` 段，不注入 v2。
- 披露（§7-3）：运行时核心 `service/runtime/session.ts` 对内置 chief 仍无条件注入 legacy v1 资源
  （既有行为，不在本批写集）；fixed chief 会话因此同时出现 v2（本层，声明优先）与 v1（运行时核心）两段。

### 1.3 `src/pipeline/orchestration/run-role.ts`：治理矩阵 fixed 视图（v1.3 §7.4）

- 会话启动的 chief 矩阵提示段：fixed 会话 `buildGovernanceMatrix(matrixInput, "two-fixed-paths/v1")`；
  legacy 缺省 `"legacy-v1"`（逐字）。
- `governance_matrix` 工具（六角色）：`createGovernanceMatrixFn` 增加可选 `matrix`，fixed 会话传
  `two-fixed-paths/v1`（fixed 视图只读展示；路由/卡种/摘要来自门禁引擎 fixed 表与模块 `fixedCards`）。
- legacy 会话两处均缺省 legacy（行为逐字不变；`test/编排/governance-matrix-injection.test.ts` 不受影响）。

### 1.4 `src/pipeline/orchestration/run-role.ts`：fixed `close_created_task`/`activate_role_documents` 依赖（MF-IR-2/3）

- 新增 `AdapterCapabilities.closeCreatedTaskFixed` / `activateRoleDocumentsFixed`（类型来自
  `workflow-service.ts`，见 §1.7/§3）。
- **注入门控（仅 fixed 会话）**：`directGovernance`（trio + 内置 + 非独立决策上下文）+ 角色
  （close：chief/convener；activate：nominator）+ 模块 `tools()` 声明未显式拒绝。
- **可信身份绑定**：close 绑定 `projectRoot` + `actorRoleId = setup.role.id`；activate 绑定
  `projectRoot`（可信字段放在模型入参之后展开，模型即便夹带同名字段也不覆盖宿主身份）；模型只提供
  固定字段（close `{operationId,taskId,outcome,note?}`；activate `{operationId,flowId,workflowId,
  proposalDecisionId,targetRoleId,roster,documents}`）。
- **缺省实现 = 直连服务**：`workflowService.closeTask` / `workflowService.activateRoleDocumentsFixed`
  （不触 trunk/CAS/snapshot、不发 appointment-write）。可选应用实现
  （`openRoleSession({ closeCreatedTaskFixed / activateRoleDocumentsFixed })`）接收绑定身份，可补
  `evidence`（artifacts/branchTipOid/acceptanceArchive）后调用同一服务；未注入即用缺省。
- **legacy 不触达**：fixed 会话不注入 `input.closeCreatedTask` / `input.activateRoleDocuments`
  （legacy 实现结构性不可达）；legacy 会话注入面/同引用/必填/实现**逐字不变**。
- **B1 注入面兼容别名（披露 §7-4）**：fixed 会话的 `capabilities.closeCreatedTask` 仍存在（值为
  fixed 实现，非 legacy），用于保持 B1 `run-role-fixed.test.ts` 既有断言不改；运行时核心应消费
  `closeCreatedTaskFixed`。

### 1.5 `src/pipeline/orchestration/run-role.ts`：fixed 工具过滤复核（AC-23；B1 已有过滤）

- 复核并保持 fixed 会话不注入的 8 项 legacy 治理工具（`legacyOnlyToolsAllowed=false`）：
  `git_query`/`git_candidate`/`git_publish`/`select_run_change`/`request_stable_write`/
  `submit_refactor`/`submit_version_change`/`request_version_decision`（全部实测 undefined）。
- fixed 保留：`complete_team_plan`（v4）、`close_created_task`（v2 fixed 依赖）、
  `activate_role_documents`（v2 fixed 依赖）、只读面（`governance_matrix`/`project_state`/`doc_format`/
  `contract_check` 等）。
- **未新增 `requestReleaseMerge`**（G-IR §六拒绝；源码/能力对象零出现；`RoleToolId` 仍 14 项）。

### 1.6 `src/pipeline/orchestration/run-role.ts`：fixed 依赖透传运行时核心（接线点）

- `createRuntimeAdapterFactory` 把 `capabilities.closeCreatedTaskFixed` /
  `activateRoleDocumentsFixed` 以同名展开透传给 `createRuntimeAdapter` 选项（运行时字段；undefined ⇒
  字段缺席）。这是给运行时核心 B2 的固定字段名契约：其 `GovernedToolsOptions` 加同名字段后，handler
  经 `buildGovernedTools` 的 `...options` 透传即可读取（本层不改 `model/runtime.ts`/`provider/runtime/**`）。

### 1.7 `src/common/编排/workflow-service.ts`（M，+89/−0）：fixed 依赖类型 + 首次启动顺序助手

- 新增（单一契约源）：
  - `FixedCloseCreatedTaskToolInput`（模型可见 4 字段）、`FixedCloseCreatedTaskDep`（应用实现，含绑定
    身份）、`FixedCloseCreatedTaskFn`（run-role → 运行时核心 handler 的工具依赖，身份已绑定）；
  - `FixedActivateRoleDocumentsToolInput`（`Omit<ActivateRoleDocumentsFixedInput,"projectRoot"|"now">`）、
    `FixedActivateRoleDocumentsDep`、`FixedActivateRoleDocumentsFn`；
    （入参/回执语义直接复用 B1 已实现的 `closeTask` / `activateRoleDocumentsFixed`。）
- 新增 `prepareFixedPathStart({projectRoot, flowId})`：首次 fixed workflow 启动顺序助手（§4）。
  不改变 B1 闸语义、不授予写权/派发权。
- `workflow-state.ts` 未改（本批接线不需要它；B1 语义保持）。

## 2. G-IR must-fix 闭环（本批 owner 部分）

| 条件 | 状态 | 证据/说明 |
| --- | --- | --- |
| MF-IR-2 close_created_task v2 | **编排侧闭环** | `closeCreatedTaskFixed` 依赖 = `workflowService.closeTask`（B1 已实现真实创建者/报告/状态/幂等/`task.closed`+阶段事件/不触 trunk）；模型仅 4 字段；legacy 不触达。schema/handler 接入属运行时核心 B2（§3） |
| MF-IR-3 activate_role_documents v2 | **编排侧闭环** | `activateRoleDocumentsFixed` 依赖 = `workflowService.activateRoleDocumentsFixed`（roster/提案决定/三文档实际字节 SHA-256/`role.activated`/不写 trunk/不发 appointment-write）；legacy 不触达。schema/handler 属运行时核心 B2（§3） |
| MF-IR-4 模块导出/cardKindsOf | **消费闭环** | `run-role::cardKindsOf` 改调门禁门面（legacy `cards` / fixed `fixedCards` 单点）；legacy 锚点源码逐字保留 |
| MF-IR-8 requestReleaseMerge | **遵守** | 未新增（源码/能力对象零出现）；B3 走应用自有 merge-main 通道 |
| MF-IR-6/7 | 不受影响 | B1 已闭环（码表映射/roster v4）；本批无新增稳定码/格式 id |

## 3. 运行时核心 B2 接线契约（回调签名；本批实测可调用）

类型单源：`src/common/编排/workflow-service.ts`（`FixedCloseCreatedTaskFn` 等）。运行时核心在
`AdapterCapabilities` 对应的 `GovernedToolsOptions` 增**同名**字段（名字已由 `createRuntimeAdapterFactory`
透传就位）：

```ts
// fixed 会话必有；legacy 会话缺席（legacy 字段 closeCreatedTask/activateRoleDocuments 在 fixed 会话不可达）
closeCreatedTaskFixed?: (input: {
  operationId: string; taskId: string; outcome: "accepted" | "rework" | "rejected"; note?: string;
}, signal?: AbortSignal) => Promise<CloseTaskResult>;

activateRoleDocumentsFixed?: (input: {
  operationId: string; flowId: string; workflowId: string; proposalDecisionId: string;
  targetRoleId: string;
  roster: { path: string; sha256: string };
  documents: {
    card: { path: string; sha256: string };
    boundaryMd: { path: string; sha256: string };
    boundaryYaml: { path: string; sha256: string };
  };
}, signal?: AbortSignal) => Promise<ActivateRoleDocumentsFixedResult>;
```

回执（服务真实返回，`projectRoot`/`actorRoleId` 已由 run-role 绑定，绝不由模型传）：

```ts
type CloseTaskResult = { ok: true; taskId: string; outcome: TaskClosedOutcome; workflowId?: string;
  stage?: WorkflowStage; eventId: string; operationId: string; replay: boolean; stageCompleted: boolean }
  | { ok: false; code: string; message: string; missing?: string[] };

type ActivateRoleDocumentsFixedResult = { ok: true; workflowId: string; roleId: string;
  rosterSha256: string; activationKey: string; replay: boolean; stageCompleted: boolean }
  | { ok: false; code: string; message: string; missing?: string[] };
```

handler 要求（运行时核心 B2 必做）：

1. **模式选择**：fixed 会话使用 `closeCreatedTaskFixed`/`activateRoleDocumentsFixed`；`closeCreatedTask`/
   `activateRoleDocuments` 在 fixed 会话不存在。两者都存在时以 fixed 字段为准（纵深防御）。
2. **不要走 legacy direct 回执校验**：既有 `makeDirectCapabilityTools` 的 `directReceiptResult`/
   `isDirectActionReceipt`/`taskStatus`/`activationDigest` 校验面向 legacy trunk 回执，不适用于上述 fixed
   结果；fixed 分支应直接把服务结果（`ok`/`code`/`message`/回执字段）如实转成工具结果（参照
   `decide_pending_request` 的直出分支），或为 fixed 结果定义独立校验。
3. **schema**：`close_created_task` fixed 必填 `operationId/taskId/outcome`（+可选 note；legacy
   `runId/basisDigest/reportRef` 在 fixed 可省略/出现则仅断言）；`activate_role_documents` v2 采用上列入参。
   schema 文案模式中立（G-6）。
4. **信号**：handler 应透传 `signal`；run-role 依赖在 `signal.aborted` 时拒执行并如实回执。

## 4. 首次 fixed workflow 启动顺序（B3 必须遵守；避免鸡生蛋死锁）

- 事实链：桌面 B1 启用闸 `isFixedPathEnabledForFlow` 只在项目**显式** `workflowSchema:
  "two-fixed-paths/v1"` 或该 flow 已有 `workflow.started` 时启用 fixed；而 `workflow.started` 只能由
  fixed 派发产生。空项目/缺省配置下直接按 fixed 派发 ⇒ 桌面解析 legacy（死锁点，T-05 已测）。
- **B3 顺序（强制）**：首次 fixed 派发前先调用
  `workflowService.prepareFixedPathStart({projectRoot, flowId})`（或等价的
  `writeProjectConfigWorkflowSchema`）：
  1. 原子写 `.ans/project.json workflowSchema:"two-fixed-paths/v1"`（保留既有键；显式 `"legacy/v1"`
     **不覆盖** ⇒ `skipped:"explicit-legacy"`；坏文件 ⇒ `project-config-write-failed` fail-closed，
     不弹客户卡）；
  2. 以 `workflowMode(projectRoot, flowId)` 复核实际模式（legacy 在飞 flow 仍 legacy）。
  返回 `workflowMode==="fixed"` 后 B3 才能派发首个 fixed workflow；返回 `"legacy"` 则不得按 fixed 派发。
- **不改变 B1 闸语义**：`app/desktop/workflow.ts` 未改；助手只排序既有写回与判定（新增导出，B3 调用）。
- 证据：`test/编排/fixed-path-start.test.ts`（4 tests）覆盖显式 config/首次启动/幂等/显式 legacy 不覆盖/
  坏文件 fail-closed/per-flow 不缓存（legacy 在飞 flow 与 fixed 新 flow 并存）。

## 5. 测试与证据

### 5.1 typecheck

`npm run typecheck` → **exit 0**（证据 03；基线 02 亦 exit 0）。

### 5.2 `test/编排` before/after（命令 `node --test --test-concurrency=1 --test-force-exit --test-reporter=tap "test/编排/**/*.test.ts"`，前后同一命令）

| | 文件数（含新增） | tests | pass | fail | skipped |
| --- | --- | --- | --- | --- | --- |
| before（基线 d4bc79c 工作树） | 121 | 1,250 | 1,224 | 24 | 2 |
| after（本批工作树） | 123 | 1,265 | 1,239 | 24 | 2 |

- **失败名集合 diff：AFTER−BEFORE = 0，BEFORE−AFTER = 0（`FAILURE-NAME-SET-IDENTICAL`）**；24 个
  known-red 名称逐名一致（证据 05-failure-names-diff.txt / 01/05 失败名清单）。
- 新增确定性失败 = 0；新 skip = 0（skip 仍 2，且为 before 同一两项「Delivered Hub/legacy code provenance」）。

### 5.3 新增测试（`test/编排/**`，15 tests；targeted 17/17 pass，证据 04）

| 文件 | tests | 覆盖 |
| --- | --- | --- |
| `test/编排/run-role-fixed-b2.test.ts`（新） | 11 | cardKindsOf 门面 fixed/legacy（chief proposal 允许 vs legacy 拒；fixed rapporteur proposal 拒 vs legacy 触达）；chief-workflow-v2 注入/元数据-SHA-256 一致/legacy 不注入/非 chief 不注入；fixed 工具过滤（8 legacy-only 全缺、completeTeamPlan/closeCreatedTask 保留、无 requestReleaseMerge、源码零出现）；fixed close 应用实现收到绑定身份/legacy 实现不注入/缺省直连服务写 task.closed 且不触 trunk/run/幂等 replay；fixed activate 应用实现收到绑定 projectRoot/legacy 不触达；legacy 同引用注入且 fixed 字段缺席；governance_matrix fixed/legacy 视图 |
| `test/编排/fixed-path-start.test.ts`（新） | 4 | 首次 fixed 启动顺序（死锁点 → 助手写回 → 闸放行 → 幂等）；显式 legacy 不覆盖；坏 project.json fail-closed 不覆盖；per-flow 不缓存（legacy 在飞 + fixed 新 flow 并存） |

未新增 skip/force-exit（测试内）；不启动真实模型/Electron。

### 5.4 旧断言保护

- **未修改任何既有测试文件/断言**（本批 `git status` 仅 2 个源文件 M + 2 个新测试文件）。
- B1 `run-role-fixed.test.ts` 的「fixed 保留 close_created_task」断言不改：fixed 会话经**兼容别名**
  在同名能力位注入 fixed 实现（§1.4/§7-4）。
- `legacyCardKindsOf` 两行源码锚点、`TRIO_CARD_KINDS`（product 行）、`moduleToolsRole`/旧门控字面量、
  `buildGovernanceMatrix` 缺省调用语义均保持（module-consumption / chief oracle 测试通过）。

### 5.5 只读回归

- `test/roles/**`：**275/275 pass**（证据 09；六角色 B2 固定测试含在內）。
- `test/门禁引擎/**`：**499/493/5/1**（证据 10；5 个 known-red 与 B2 门禁记录逐名一致
  [`卡文本：运营负责落盘工作流…`/`渲染过滤…`/两个 `listProject…`/`D-10…`]，未恶化、无新增）。

## 6. 候选（本角色 B2 写集）

### 6.1 逐文件（raw SHA-256 / bytes / lines）

| 文件 | SHA-256 | bytes | lines |
| --- | --- | --- | --- |
| `src/common/编排/workflow-service.ts`（M） | `d58ac39fcfd837563c5bcb9d6a991096ae1930a3d8e138a72b3e0ef61568a7e8` | 110,095 | 2,394 |
| `src/pipeline/orchestration/run-role.ts`（M） | `55f99d7c129ef0914fb96b5d9cd9e6310e08be49b4d6be375873c6174b63cc9a` | 255,203 | 3,912 |
| `test/编排/run-role-fixed-b2.test.ts`（新） | `d22aa29c7207e931b7a12a6150c563eef9783a34b3a0f65dc61e80efa7848ab9` | 22,676 | 446 |
| `test/编排/fixed-path-start.test.ts`（新） | `dfe9bbdb541e968a7b6ea0be909d9ec9abeef97c41a6035bcdd19b6cda55a413` | 6,049 | 128 |

- 4 文件合计 **394,023 bytes**；git numstat（M）：`+192/−15`（run-role）、`+89/−0`（workflow-service）。
- 聚合哈希（路径排序后逐行 `path:sha256` 连接的 SHA-256）：
  `ff54339b1be87cc5261ddceb38477af564e7170f4c7ebc350126c16efb781264`（证据 08，可复算）。

### 6.2 写集外 diff=0（实测）

- `git status --porcelain -- src app test` 仅上述 4 文件（证据 07）。
- 零 diff 守卫：`src/common/gates`、`app`、`src/model`、`src/provider`、`src/common/roles`、
  `src/common/门禁引擎`、`src/service`、`package.json/lock`（证据 07；无新依赖）。
- 文档/其它：仅本记录与 `_evidence/`；未改 `角色卡/**` 其它文件。

## 7. 限制与披露

1. **fixed 会话级注入依赖会话模式**（`workflowMode` 常量或 `taskId` 的 flow 解析；B1 语义未改）。桌面当前
   只为 trio 注入 `workflowModeForFlow`，且会话级模式按输入任务 flowId 解析 ⇒ 不带 taskId 的聊天会话仍
   legacy（无 v2/fixed 依赖）。B3 固定路径的任务打开/绑定属 B3。
2. **运行时核心 B2 handler/schema 未实现**（本批写集外）：fixed 依赖已进入 adapter options（"注入才注册"
   的字段就位），但 `tools.ts` 的 legacy direct 回执校验不适用 fixed 结果——运行时核心须按 §3 映射，
   否则 fixed 工具会回「结果未知」（fail-closed，不会伪造成功）。
3. **fixed chief 同时收到 legacy v1 资源**：运行时核心 `service/runtime/session.ts` 对内置 chief 无条件注入
   `chief-workflow.md`（既有行为，不在本批写集）；run-role 追加的 v2 段标题/正文声明 fixed 会话以 v2 为准
   （v2 资源第 9 行同口径）。后续若运行时核心提供资源选择开关，可切换为仅 v2。
4. **B1 兼容别名**：fixed 会话 `capabilities.closeCreatedTask` = fixed 实现（非 legacy），仅为保持 B1 既有
   断言不改；运行时核心应只消费 `closeCreatedTaskFixed`。
5. **默认 close 依赖无 evidence**：A2/A5/A11/B1/B3/A12a/A12b 的**完成型 accepted 收口**需要应用实现
   （B3）补 artifacts/branchTipOid/acceptanceArchive；缺省直连服务适合非完成型收口（如 chief 收口
   stage-request、rejected/rework）。
6. `requestReleaseMerge` 未新增（G-IR §六）；B3 应用自有 merge-main 通道。
7. 未新增依赖；`workflow-state.ts`/`doc-format-specs.ts` 未改（B1 已同步 roster v4）；54 doc-format id 不变。
8. 未运行真实模型/Electron/真机全链；未占用 9222/9223；测试环境 Windows；`test/编排`/`test/门禁引擎`
   复跑使用 `--test-force-exit`（环境适配，before/after 同一命令）。

## 8. 未提交声明

- 本记录与 `_evidence/` 仅写入本角色 `docs/change/` 目录（任务精确写集）；产品/测试代码变更仅限 §1/§6 写集。
- **未 commit / 未 push / 未 merge / 未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。
- 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；引用 hash 均为写盘实测。

## 9. 证据索引（同目录 `..._evidence/`）

| 文件 | 内容 |
| --- | --- |
| `00-baseline-head.txt` / `00-baseline-status.txt` | 基线 HEAD `d4bc79c`；基线 `git status --porcelain -- src app test` 为空 |
| `01-before-test-orch.tap` / `01-before-failure-names.txt` | before 全量 TAP（1,250/1,224/24/2）；24 失败名 |
| `02-before-typecheck.txt` | 基线 `npm run typecheck` exit 0 |
| `03-after-typecheck.txt` | 收尾 `npm run typecheck` exit 0 |
| `04-targeted-tests.tap` | 定向 3 文件 TAP（17/17 pass；新增 15 + B1 fixed 2） |
| `05-after-test-orch.tap` / `05-after-failure-names.txt` / `05-failure-names-diff.txt` | after 全量 TAP（1,265/1,239/24/2）；失败名集合一致 |
| `06-chief-workflow-resources.txt` | legacy v1 不变指纹 + v2 资源 sha256/bytes/版本 |
| `07-write-set-boundary.txt` | 写集外 diff=0 / 禁改目录 clean |
| `08-candidate-hashes.txt` | 候选逐文件 hash/bytes/lines/numstat/聚合 |
| `09-roles-readonly.tap` | `test/roles/**` 只读回归（275/275） |
| `10-gates-readonly.tap` | `test/门禁引擎/**` 只读回归（499/493/5/1，5 known-red 逐名一致） |
