# 变更记录：应用侧内置角色派发——编排/模型地基（app-dispatch/v1 第一步）

- 日期：2026-11-17
- 角色：ANS 内置「编排」（编排/模型侧实现；客户已授权直接开发）
- 分支/工作树：`feat/app-dispatch-builtins`（HEAD 起点 caf0acf；本记录未提交）
- 设计依据（权威）：`docs/planning/2026-11-17_design_app-dispatch-builtins.md` §二–§七、§九；
  Q1–Q10 已裁定：Q1 幕僚按 prompt 呈卡、Q2 验收强度=定义参数（默认标准）、Q3 项目验收角色应用直派、
  Q4 B2 应用确定性派生/歧义 fail-closed、Q5 应用/客户停止且写审计呈现客户、Q6 worker-dispatch 由运营收口、
  Q7 客户明示流程+幕僚 `select_workflow`、Q8 每阶段自动重试 1 次后 `stage.blocked`/高风险零重派、
  Q9 类型化注册表+JSON Schema+hash、Q10 在飞 v2.1.0 不迁移按旧协议关闭。
- 范围：**只改编排/模型侧**。未改 `app/desktop/**`、`test/**`、`src/common/门禁引擎/**`、
  `src/common/roles/**`、workflow 资源、`release.yml`/release-policy；未 commit/push/CI/tag；
  未读 `.env`；未占 9222/9223/9224。

## 一、实现了什么（对照设计）

1. **模型契约扩展（旧值原样保留，旧记录读取不变）**
   - `TaskCreatedEvent.from` / `TaskClosedEvent.by` 增加 `"application"`；
   - `taskKind` 扩为 `FixedTaskKind`＝`stage-request`（v2.1 compat）/`stage-execution`/`worker-dispatch`/`card-prompt`；
   - `workflow.started` 增加可选 `protocol:"app-dispatch/v1"`（缺省＝`fixed-v2.1`，Q10）、
     `definition:{id,version,sha256}`、`parameters:{acceptanceStrength}`（Q2）；
   - `stage.requested`/`stage.dispatched` 增加可选 `issuedBy:"application"`；
     `stage.dispatched` 增加 `executorKind`（built-in/worker-dispatch/review/card-prompt/application）；
   - `request.created`/`GovernanceCardMetadata` 增加可选 `promptId`；`card-prompt` 任务携带
     `promptId/cardKind/cardDocumentRefs/cardOptions/cardRecommended`；
   - `DIRECT_ACTION_ACTORS["close-created-task"]` 增加 `"application"`（应用收口自建任务）。
2. **流程定义注册表**（新 `src/common/编排/workflow-definitions.ts`，Q9）
   - `add`（A1–A13 含 A12a/A12b/A12 聚合）与 `modify`（B1–B4）类型化定义：每阶段执行者/任务种类/
     sideEffect/完成条件/客户卡/高风险卡/返工边/重试策略/任务文本模板要点；`driveOrder` 显式驱动顺序；
   - 定义只读（深度冻结）；`next` 与 `WORKFLOW_STAGE_TRANSITIONS` **逐项一致**、`reworkFallback` 与
     `WORKFLOW_REWORK_FALLBACKS` 一致（`validateWorkflowDefinitions()` 自检，漂移即失败）；
   - canonical JSON（键排序）+ SHA-256 定义 hash；JSON Schema 导出（单定义 + 注册表）；`getWorkflowDefinition`
     fail-closed（`workflow-definition-unknown` / `workflow-definition-version-unsupported`）。
3. **应用侧驱动**（`workflow-service.ts` 新增；旧 `requestStage`/stage-request 路径逐字保留）
   - `selectWorkflow`：幕僚选流程 A/B（+可选验收强度）→ 写 `workflow.started`（protocol/definition hash/
     parameters）→ 建首任务（A1 product stage-execution；B1 worker-dispatch→运营）；
   - `driveAppDispatchStage`：`stage.requested`（issuedBy application）→ `task.created`（from application）→
     `stage.dispatched`（issuedBy/executorKind）；幂等键按设计 §4.3：
     `stage-exec:<wf>:<stage>:<role>:<attempt>`、`worker-dispatch:<wf>:<stage>:<attempt>`、
     `card-prompt:<wf>:<stage>:<requestId>`；taskId 由幂等键确定性派生（事件先写携带 taskId，崩溃可幂等重建）；
     A1/A4/A7 创建即完成（沿用 DISPATCH_COMPLETES）；AC-09（A11 前 A12a 已创建）保留；
     A12a/A12b 由应用直派 verifier 或 roster review 角色（Q3）；
   - 客户卡：应用计算 documentRefs（intent/proposal/modules/roster/architecture 的 path+version+字节
     SHA-256）与选项/推荐集（appointment 从名单 role id 生成），写 `request.created`（promptId）+ 
     `card-prompt` 任务给幕僚；A3 保留 B24 intent-entry 校验；`verifyCardPrompt` 逐项校验
     promptId/cardKind/选项（含顺序）/documentRefs，不一致 ⇒ `card-prompt-mismatch`；
   - `observeAppDispatchTaskReport`：观察 `task.reported` 自动收口 `stage-execution`（accepted/blocked）；
     Q8：blocked/failed ⇒ 1 次自动重试（attempt+1、新幂等键），预算耗尽保持 `stage.blocked`；高风险零重派；
     A12b 轻量验收（定义参数 light + `acceptanceArchive` + 应用决策 note）保留 B31 语义；
     `worker-dispatch` 任务拒绝由应用收口（Q6，运营收口）；
   - `reconcileFixedWorkflow`：启动对账只处理 app-dispatch/v1；已报告未收口任务幂等收口；当前 open 阶段
     （requested/dispatched/in-progress）幂等补建/补投递；`stage.requested.requestTaskId` 与真实任务不一致、
     `stage.dispatched` 引用缺失任务 ⇒ `workflow-corrupt`（不猜、不自动推进）；`fixed-v2.1` 一律跳过。
4. **协议感知派发矩阵**（`workflow-dispatch.ts`；缺省/fixed-v2.1 逐字旧行为）
   - `FixedDispatchPolicyInput.protocol?`；`app-dispatch/v1` 下：幕僚任意派发 ⇒ `chief-dispatch-removed`；
     运营→任意内置 ⇒ `convener-builtin-dispatch-forbidden`；运营→项目 worker 仅当绑定自身 open 的
     `worker-dispatch` 任务（from application/to=运营/未停止/workflow+stage 一致）⇒ 允许，否则
     `worker-dispatch-required`；`APP_DISPATCH_CHIEF/CONVENER_BUILT_IN_TARGETS` 置空；
     `APP_DISPATCH_FAILURE_CODES` 集中定义（含 card-prompt-mismatch/workflow-definition-* /workflow-corrupt 等）。
5. **任务账本写/读侧**（`task-state.ts`）
   - 接受 4 种 fixed taskKind；三种新种类形状 fail-closed：`stage-execution`（application→内置/review，
     read-only|docs，键前缀 `stage-exec:`）、`worker-dispatch`（application→convener，read-only，键前缀
     `worker-dispatch:`）、`card-prompt`（application→chief，read-only，`promptId`+治理卡种+卡文档/选项形状，
     键前缀 `card-prompt:`）；`stage-request` 仍 chief→convener/read-only/无 module（逐字不变）；
   - `task.closed.by="application"` 读侧合法（actionSource 绑定校验沿用）；`request.created.promptId` 形状校验。
6. **报告路由**（`workflow-preconditions.ts`）：`reportTargetForTaskCreator` 接受 `"application"` ⇒ 返回
   `null`（应用任务报告只落账本，由应用观察收口，不唤醒第二角色）。
7. **project-state 投影**：运行期如实保留 `from:"application"`；为保住冻结结构镜像（旧契约 `from` 仅
   chief/convener），模型 `ProjectStateTask.from` 维持窄类型并新增可选 `creator`（含 application），
   新消费者按 `creator` 分支（见 §五 披露）。

## 二、API 面（给桌面批次）

### Model（`src/model/runtime.ts` / `trunk.ts` / `project-state.ts`）
- `FixedTaskKind` / `FIXED_TASK_KINDS` / `isFixedTaskKind`；`TaskCreatedEvent.from|by` 含 application；
- `WORKFLOW_PROTOCOL_FIXED_V2_1` / `WORKFLOW_PROTOCOL_APP_DISPATCH` / `WorkflowProtocol` /
  `isWorkflowProtocol` / `workflowProtocolOf(started)`（缺省 fixed-v2.1）；
- `WorkflowDefinitionRef` / `isWorkflowDefinitionRef`；`WorkflowAcceptanceStrength` /
  `WORKFLOW_ACCEPTANCE_STRENGTHS` / `isWorkflowAcceptanceStrength`；
- `WorkflowStageExecutorKind` / `WORKFLOW_STAGE_EXECUTOR_KINDS` / `isWorkflowStageExecutorKind`；
- `WorkflowStartedEvent.protocol|definition|parameters`；`StageRequested/DispatchedEvent.issuedBy|executorKind`；
  `RequestCreatedEvent.promptId`；`GovernanceCardMetadata.promptId`；
- `DIRECT_ACTION_ACTORS["close-created-task"]` 含 application。

### 编排（`src/common/编排/workflow-definitions.ts`）
- `WORKFLOW_DEFINITIONS`（只读）、`WORKFLOW_DEFINITION_HASHES`、`WORKFLOW_DEFINITION_IDS`、
  `WORKFLOW_DEFINITION_SCHEMA`、`WORKFLOW_DEFINITION_REGISTRY_SCHEMA`、`ACCEPTANCE_STRENGTHS`；
- `getWorkflowDefinition(id, version?)`、`workflowDefinitionIdForPath(path)`、`listWorkflowDefinitions()`；
- `workflowDefinitionHash(def)`、`canonicalJson(value)`；
- `workflowDefinitionJsonSchema(def)`、`workflowDefinitionsJsonSchema()`；
- `validateWorkflowDefinitions()`（自检：覆盖/转移/返工/driveOrder/形状）。

### 编排（`src/common/编排/workflow-service.ts`）
- `selectWorkflow({projectRoot, flowId, workflowPath, sourceTaskId, definitionId?, definitionVersion?,
  acceptanceStrength?, workflowId?, reason?})` → `SelectWorkflowReceipt`；
- `driveAppDispatchStage({projectRoot, workflowId, stage?})` → `DriveAppDispatchStageReceipt`
  （tasks[]: taskId/idempotencyKey/taskKind/to/promptId/replay；requested/dispatched/completed）；
- `observeAppDispatchTaskReport({projectRoot, taskId, decision?})` → accepted/blocked/retried/replay；
- `verifyCardPrompt({projectRoot, workflowId, stage, promptId, cardKind, optionIds?, documentRefs?})`
  → `{requestId,promptId,cardKind}` 或 `card-prompt-mismatch`；
- `reconcileFixedWorkflow({projectRoot, workflowId?})` → 每 workflow 的 `driven/closedTasks/errors/corrupt/skipped`；
- 幂等键/ID 辅助：`stageExecutionIdempotencyKey`、`workerDispatchIdempotencyKey`、
  `cardPromptIdempotencyKey`、`appDispatchTaskId`、`appDispatchPromptId`；`APP_DISPATCH_PROTOCOL`。

### 编排（`src/common/编排/workflow-dispatch.ts`）
- `evaluateFixedPathDispatchAuthorization({protocol?, ...})`：`app-dispatch/v1` 新矩阵；
- `APP_DISPATCH_*_TARGETS`（空集）、`APP_DISPATCH_FAILURE_CODES`。

## 三、改动文件与规模（本批）

| 文件 | 行数 | 说明 |
| --- | --- | --- |
| `src/model/runtime.ts` | +177/-10 | from/by/taskKind/协议/定义引用/卡 prompt/审计字段 + 守卫 |
| `src/model/trunk.ts` | +5/-2 | close-created-task 演员集加 application |
| `src/model/project-state.ts` | +7/-2 | `creator?`（from 保窄，见 §五） |
| `src/common/编排/workflow-definitions.ts` | 新增 939 | 类型化注册表 + 自检 + Schema + hash |
| `src/common/编排/workflow-service.ts` | +1321/-2 | app-dispatch 驱动/卡 prompt/观察收口/对账 |
| `src/common/编排/workflow-dispatch.ts` | +149/-4 | 协议感知矩阵 + 稳定码 |
| `src/common/编排/task-state.ts` | +170/-17 | 3 新 taskKind 写/读侧形状、application 收口/promptId |
| `src/common/编排/workflow-preconditions.ts` | +4/-2 | reportTarget application→null |
| `src/common/编排/project-state.ts` | +6/-1 | 投影保留运行时 from + creator |

本记录：`角色卡/编排/docs/change/2026-11-17_change_app-dispatch-builtins-foundation.md`。

## 四、验证

- **typecheck**（根仓库 tsc，cwd=worktree）：首跑 7 错误（5 个 `app/desktop/**` 由
  `TaskCreatedEvent.from` 扩容 `"application"` 引起；2 个并行批 `RoleToolId` 契约断言）。
  桌面批与测试批已并行修复；**2026-11-18 收尾复跑：0 错误**。
- **注册表自检**（`node --input-type=module`）：`validateWorkflowDefinitions()` PASS；add 覆盖
  A1–A13（15 阶段，含 A12a/A12b/A12）、modify 覆盖 B1–B4；定义 hash 重算稳定；
  单定义/注册表 JSON Schema 可生成；`getWorkflowDefinition` 未知/版本码正确。
- **应用侧驱动端到端自检**（临时目录，不落仓库）：select A→A1 任务/事件/完成；A2 报告后自动
  accepted+stage.completed；A3 request.created（documentRefs/选项）+ card-prompt 任务；
  verifyCardPrompt 匹配/不匹配；reconcile 无 corrupt/errors；select 幂等重放；select B→B1
  worker-dispatch；协议矩阵（chief-dispatch-removed / convener-builtin-dispatch-forbidden /
  worker-dispatch-required / 旧协议逐字允许）；Q8 blocked→重试 1 次→预算耗尽保持 blocked；
  旧 fixed-v2.1 被 reconcile 跳过、app 驱动返回 `workflow-protocol-mismatch`；task-state 新种类
  坏形状写侧拒绝、读侧重放 application 任务；全部 PASS。
- **目标测试**（`node --test`）：
  - `test/编排/workflow-state.test.ts`、`workflow-dispatch-fixed.test.ts`、`workflow-stage-request.test.ts`、
    `task-state.test.ts`、`task-state-fixed.test.ts`：**61/61 pass**（旧协议用例保持）；
  - `test/编排/project-state.test.ts`、`project-state-workflow.test.ts`、`workflow-preconditions.test.ts`：
    **42/42 pass**。
- **编排全目录**（首跑 1388 tests）：1382 pass / 4 fail / 2 skipped。失败归因：
  1. `doc-format-specs.test.ts::TM-5`：新 schema 字面量 `ans-workflow-definition/v1`、
     `ans-workflow-definitions/v1`、`app-dispatch/v1` 未登记——**已由测试批登记**（2026-11-18 复跑通过）；
  2. `run-role-fixed-b2.test.ts`「fixed chief 注入 chief-workflow-v2」与 `governance_matrix` 两例——
     **并行批次**在飞改动；2026-11-18 复跑 38/38 通过；
  3. 一次并行运行中 `download-provider` 短暂失败，重跑消失（环境/并行干扰）。
  - TM-8 首跑因本批 `requiredEvidence` 标签（`role-activated-all`/`criteria-sha256`/`roster-modules`/
    `role-boundary`）触发；已改名为 `all-roster-roles-activated`/`acceptance-criteria-hash`/
    `module-ownership`/`authority-boundary`（非稳定码），复跑通过。
  - 2026-11-18 收尾后，编排目录的已知剩余失败仅 `app-dispatch-service.test.ts` 的 rework 旧断言
    （预期语义变更，见 §八；由测试批更新）。

## 五、兼容策略与披露

- **旧协议逐字保留**：`requestStage`/`stage-request`、`evaluateFixedPathDispatchAuthorization` 缺省路径、
  legacy 谓词、`ProjectStateTask.from` 旧契约均未改语义；`workflow.started.protocol` 缺省＝`fixed-v2.1`。
- **协议隔离**：app 驱动只处理 app-dispatch/v1；旧 workflow 由旧驱动直至关闭（Q10）；同一 workflow 中途
  切换 ⇒ `workflow-protocol-mismatch`。
- **模型层授权披露**：`src/model/**` 属「运行时核心」边界；按协调者任务授权直接修改，本记录如实披露。
- **project-state 类型折衷**：冻结测试断言 `ProjectStateTask` 与 `TaskMirror`（`from:"chief"|"convener"`）
  双向可赋值；本批不扩 `from` 类型，改为运行期保留真实值 + 新增 `creator?`。旧消费者读 `from` 会看到
  `"application"`（未知来源，应 fail-closed/忽略）；需要分支的新消费者读 `creator`。
- **并行批次披露**：工作树内另有 roles/门禁/model/role.ts/provider/schema/chief-workflow-v3 等改动
  （非本批）；本批未触碰这些文件，typecheck/测试中的相关差异见 §四。

## 六、待桌面/测试/门禁批配合点

- **桌面批**：`select_workflow` 工具接线（`RoleToolId` 已由并行批加入）；`request_choice` 透传/校验
  `promptId`（先调 `verifyCardPrompt`，不一致不发卡）；阶段完成/卡裁决后调用 `driveAppDispatchStage`；
  `task.reported` 后调用 `observeAppDispatchTaskReport`（A12b rework 用 `decision:"rework"` 显式策略）；
  启动/打开项目调用 `reconcileFixedWorkflow`；扩本地创建者类型含 application（修 5 个 TS 错误）；
  A3 `finalizeIntent` 与 A6/A10 既有完成路径继续由桌面调用（驱动已写 workflowId/stage/promptId 的卡记录）。
- **测试批**：TM-5 `SCHEMA_WHITELIST` 登记三字面量（含理由）；按设计 §九 新增 app-dispatch 用例
  （定义注册表、建任务/收口/卡 prompt 精确匹配、运营越权内置拒绝、worker 绑定、重启对账、崩溃点矩阵、
  B13–B34 回归、fixed-path-full-chain 新协议）；更新并行批相关的 role-module-contract/chief-v2 注入用例。
- **门禁批**：`contract_check`/`doc_format`/`governance_matrix` fixed 口径与任务种类同步（设计 §6.2）；
  worker-dispatch/card-prompt/stage-execution 的展示与诊断文案。
- **A11/B3 阶段完成**：仍由运营 `closeTask`（worker 任务）按既有完成条件推进；应用驱动不重建运营创建的
  worker 任务（对账只覆盖 application 创建的任务）。
- **B1 rapporteur 分支**：定义里记录 `fallbackExecutor`；本批只创建 worker-dispatch 主任务，应用按 B1
  报告出现契约/结构缺口时的 rapporteur 直派留给后续 API/桌面策略。

## 七、开放风险

- 桌面批未接线前，app-dispatch 工作流不会被真实驱动（服务/类型/矩阵已就绪）。
- ~~5 个 desktop 类型错误需桌面批修复后才能 `npm run typecheck` 全绿。~~ 桌面批已修复（2026-11-18 复跑 0 错误）。
- `reconcileFixedWorkflow` 未校验 `task.delivered` 投递事实（投递属桌面队列）；"投递状态一致"由桌面批的
  启动恢复流程补齐。
- A12b `rework` 的业务判定（验收报告 blocked 是否等同返工）由应用策略显式给出（`decision:"rework"`），
  本批不猜测。

## 八、收尾修补（2026-11-18，测试批生产疑点）

1. **旧入口反向驱动守卫**（`workflow-service.ts`）
   - `requestStage`：解析到已有 workflow 后、任何写入前，若 `workflow.started.protocol==="app-dispatch/v1"`
     ⇒ `stage-request-removed`（advance/stop/重放一律拒绝；不写事件/任务）。`fixed-v2.1`/legacy 逐字不变。
   - `recordStageDispatch`：app-dispatch workflow ⇒ `workflow-protocol-mismatch`（stage.dispatched 只由应用驱动写）。
   - `prepareIntent`：app-dispatch workflow 只返回意图证据（documentRefs/marker/text），**不写**旧
     `stage.requested A3`（A3 由应用 card-prompt 驱动）。`closeTask`/`finalizeIntent`/`recordBasis`/
     `recordChangeScopeDecision`/`confirmStop`/release 内核保持可复用（设计 §九 复用清单）。
   - 稳定码：`APP_DISPATCH_FAILURE_CODES` 增 `stage-request-removed`。
2. **`observeAppDispatchTaskReport(decision:"rework")`**：`closeTask` 写 `stage.reworked`（A12b→A11）成功后
   **直接返回成功回执**，不再尝试重驱原阶段；回执新增 `reworked:{reworkOf,stage,attempt}`（桌面后续 advance）。
   自动重试逻辑仅对 `outcome==="rejected"` 生效；状态机/事件不变。
3. **`reconcileFixedWorkflow`**：检测到不一致（`requestTaskId` 不符 / `stage.dispatched` 引用缺失任务）时
   清除 `driven`，只记 `corrupt`/`errors`；循环末尾统一兜底（任何 corrupt 结论都不与 driven 同时出现）。

### 收尾验证
- `npm run typecheck` 等价命令：**0 错误**。
- `test/编排/app-dispatch-service.test.ts`：**15/16 pass**。唯一失败为本批**预期语义变更**：
  `observe standard blocked + decision=rework` 在 line 775 断言 `observed.ok===false`（旧实现怪癖）；
  现应为 `observed.ok===true` 且 `observed.reworked` 深等于 `{reworkOf:"A12b",stage:"A11",attempt:2}`，
  后续 `driveOk` 仍得到 A11 attempt 2（该用例其余断言不变）。**建议测试批更新该断言**。
- `workflow-stage-request` / `workflow-dispatch-fixed` / `task-state` / `task-state-fixed` /
  `app-dispatch-b2` / `app-dispatch-definitions`：**59/59 pass**。
- 收尾专项自检（临时目录）：反向驱动（advance/stop/recordStageDispatch/prepareIntent）全部 fail-closed 且
  **零事件/零任务写入**；rework 成功回执 + 视图 A12b failed/A11 pending + 后续 advance attempt 2；
  corrupt 回执 driven 为空——全部 PASS。
- 建议测试批新增回归：①`requestStage`/`recordStageDispatch` 对 app workflow 的拒绝码与零写入；
  ②`prepareIntent` 对 app workflow 不写 `stage.requested A3`；③rework 成功回执与 `reworked` 字段；
  ④reconcile corrupt 时 `driven===undefined`（现有用例已覆盖 corrupt 字符串，建议加 driven 断言）。
  TM-5 三字面量已由测试批登记（含理由）。

*本记录供协调方/客户核对实施对照；不构成合并/发布授权。*
