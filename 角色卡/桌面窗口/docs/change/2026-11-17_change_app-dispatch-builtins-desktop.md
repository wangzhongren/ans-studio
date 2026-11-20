# 变更记录：应用侧内置角色派发——桌面接线（app-dispatch/v1 第一步）

- 日期：2026-11-17
- 角色：ANS 内置「桌面窗口」（roleId: 桌面窗口）
- 工作树：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\feat-app-dispatch-builtins`
  （分支 `feat/app-dispatch-builtins`，HEAD `caf0acf`；在「编排/模型地基批」「门禁文本/契约批」未提交改动之上继续，未重做其改动）
- 权威依据：`docs/planning/2026-11-17_design_app-dispatch-builtins.md`（§2.1/§三/§4.3/§五/§6.1/§七/§9.1，Q1–Q10 裁定）；
  `角色卡/编排/docs/change/2026-11-17_change_app-dispatch-builtins-foundation.md` §二/§六；
  `角色卡/门禁引擎/docs/change/2026-11-17_change_app-dispatch-builtins-texts.md` §5.2 待对齐项；协调者任务单。
- 范围：桌面接线（`app/desktop/**`）+ 协调者授权的跨边界文件：`src/pipeline/orchestration/run-role.ts`、
  `src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`（披露见 §八）。
- 未改：`test/**`、门禁文本/roles、`src/model/**`、`src/common/编排/**`、`src/service/**`、`release.yml`/policy、
  角色卡/边界；未 commit/push/CI/tag/main；未读 `.env`；未占 9222/9223/9224。

## 一、改动摘要（对照协调者任务清单）

### 1. 修 5 个 typecheck 错误（`from:"application"` 桌面消费点）
- `app/desktop/session/shared/tasks-store.ts`：新增 `TaskCreator = "chief"|"convener"|"application"`；`taskCreators`
  Map 与 `rememberTaskCreator` 扩为三值（application 原样保留；缺字段旧记录仍按 chief 兼容）。
- `tasks.ts` / `delivery/store.ts` / `session/index.ts` 的同名窄化包装签名同步扩为三值；
  `evidence.ts:evidenceScopeRoots` 的 `creatorAllowed` 集合类型扩为三值（成员语义不变——application 任务均带
  workflowId，走 flow 分支）。
- 结果：5 个 desktop 错误清零；剩余 2 个为 `test/门禁引擎/role-module-contract.test.ts` 的 14→15 类型钉（测试批）。

### 2. 工具面 / 协议感知注入
- `app/desktop/workflow.ts` 新增只读协议解析（不缓存、不写盘、不授权）：
  `workflowProtocolForWorkflowId` / `sessionWorkflowProtocolForTask` / `sessionWorkflowProtocolForChat` /
  `activeAppDispatchWorkflowIds`。缺省 = `fixed-v2.1`（Q10）；任务会话按该任务 workflow 的
  `workflow.started.protocol`；聊天：任一活动 `fixed-v2.1` ⇒ 旧协议；否则（含无 workflow 的新项目）⇒
  `app-dispatch/v1`；账本读失败 ⇒ `fixed-v2.1`（fail-closed 保持旧工具面）。
- `app/desktop/session/lifecycle/open.ts`：`resolveWorkflowMode` builder 计算会话协议并存入 OpenContext；
  `openRoleSession` 传入 `workflowProtocol`；构造 `selectWorkflow` 能力（仅 app-dispatch/v1 + fixed + chief；
  句柄/轮次绑定后捕获真实 `turnId` 作为 sourceTaskId，不在跑/已变 ⇒ 不伪造，服务返回
  `stage-request-source-missing`）；`contract_check` 透传协议；app-dispatch 会话注入 A8 完成回调
  `afterFixedStageAction`（A8 激活成功后 drive）。
- `src/pipeline/orchestration/run-role.ts`（跨边界，披露）：
  - `AdapterCapabilities.selectWorkflow` + `openRoleSession` 输入 `workflowProtocol/selectWorkflow/afterFixedStageAction`；
  - `appDispatchChief`（fixed + app-dispatch + chief）⇒ **不注入** `dispatch_task`、fixed `close_created_task`、
    `terminate_role_run`、`redispatch_task`（模块声明/旧门控结果在该会话被强制置空；旧协议/legacy 逐字不变）；
  - `select_workflow` 仅该会话注入（`directGovernance` 内）；
  - fixed chief workflow 资源按协议注入：app-dispatch ⇒ `chief-workflow-v3.md`（v3），旧协议 ⇒ v2 逐字保留；
  - A8 `activate_role_documents` 成功后调用 `afterFixedStageAction`（fire-and-forget，异常不影响回执）；
  - `createRuntimeAdapterFactory` 经扩展选项透传 `selectWorkflow` 至运行时核心 `buildGovernedTools`。
- `src/provider/runtime/tools.ts`（跨边界，披露）：`GovernedToolsOptions & { selectWorkflow? }`；
  `makeSelectWorkflowTool`（严格形状：workflowPath A/B、flowId slug、可选 acceptanceStrength；未知参数拒绝；
  `raceAbort`；回执失败码原样转达；**只选流程，不派发/不授权**）；`request_choice` 读取 `promptId`
  （治理卡元数据）与运行时附加 `documentRefs`（形状校验；一致性由应用 `verifyCardPrompt` 判定）。
- `src/provider/runtime/schema.ts`：`request_choice` 增 `promptId`/`documentRefs` 参数与 app-dispatch 文案；
  `select_workflow` schema 由门禁批提供，未重复。

### 3. 阶段投递桥与驱动钩子（新模块 `app/desktop/session/fixed-workflow/stage-dispatch.ts`）
- `deliverTaskIds`：应用任务登记 `starTaskIds`/`taskCreators(application)`、写角色活动、以
  `taskId + forcedWorkflowMode:"fixed"` 打开目标会话（忙时只入队；与 route.ts 同一 open/delivery/enqueue 口径）、
  写任务卡行并投递；已送达/已报告跳过（幂等）；打开失败/判据拒绝 ⇒ **保留任务待恢复**（只诊断+系统行，
  不写伪报告、不伪造投递）。
- `selectWorkflowAndDeliver`：宿主捕获 sourceTaskId → 编排 `selectWorkflow` → 投递首阶段任务 → `advance`
  继续驱动；失败稳定码原样返回。
- `advance`（仅 app-dispatch/v1；旧协议直接 no-op）：路径 B 的 B2 应用派生 → `driveAppDispatchStage` →
  投递本阶段任务 → 完成态（A1/A4/A7）继续下一阶段；corrupt 只提示、不猜。
- `deriveB2IfNeeded`（Q4）：B1 completed 且 B2 未完成时，以 B1 done 报告 evidence（应用重算字节 hash）+
  B1 任务 modulePaths 为候选，属主/有效写集由编排 `recordChangeScopeDecision` 按名单/边界派生；
  证据不足/属主不唯一 ⇒ `b-change-scope-invalid` 阻塞（不猜、不驱动）。
- `observeApplicationTaskReport`：`task.reported` 后按定义收口——普通 `stage-execution` 交编排
  `observeAppDispatchTaskReport`（accepted/blocked/Q8 重试）；**A12b**：done ⇒ 应用先补归档证据
  （`buildFixedCloseEvidence`；accepted 同时写 A12 聚合）再 `closeTask(accepted)`；标准验收 blocked ⇒
  显式 `decision:"rework"`（A12b→A11）；轻量验收 blocked ⇒ 先补归档交给编排按定义接受；
  **A13/B4**：done ⇒ 关闭汇总任务（应用收口，**不写阶段完成**——release-or-close 只由合并/关闭完成）→
  呈 merge-main（`autoPresentFixedReleaseMerge`，证据仍由应用计算）；blocked ⇒ 交编排 reject。
- `afterCardResolved`：卡裁决后关闭 card-prompt 任务（应用收口，不写阶段事件）并驱动下一阶段；
  `resolved=false`（非 answered：通道不可用/中止/judge 转人工等）保持 open、不推进（可重呈）。
- `closeApplicationTaskDirect`（导出）：应用任务直接收口（`task.closed.by="application"` + role-direct
  actionSource；形状/幂等与 `closeTask` 对齐）；用于 worker-dispatch（Q6）与 A13/B4/卡 prompt 收口。
- `reconcile`：启动/打开项目对账——编排 `reconcileFixedWorkflow`（只处理 app-dispatch/v1；旧协议服务层
  已跳过）+ 桌面投递一致性（driven 补建任务立即投递；**「上阶段已完成但下阶段未驱动」的崩溃窗口由
  `advance` 幂等续驱兜底**；活动 workflow 的应用任务未送达/无报告 ⇒ 重新入队；
  open 阶段 `requestTaskId` 与任务不匹配由服务判 `workflow-corrupt`，本层只如实汇总、不猜）。

### 4. 其余接线点
- `fixed-workflow/route.ts`：协议感知派发——`evaluateFixedPathDispatchAuthorization` 传入协议；
  app-dispatch 下运营派项目 worker **必须绑定自身 open 的 `worker-dispatch` 任务**
  （from=application/to=运营/未停止/workflow+stage 一致），否则 `worker-dispatch-required`（旧协议
  `stage-request` 绑定与 `workflow-binding-unavailable` 文案逐字保留）；未显式 workflowId/受派任务时
  协议未知 ⇒ 旧矩阵逐字（Q10；app-dispatch 下幕僚工具已结构性不注入）。
- `fixed-workflow/cards.ts`：`closeCreatedTaskFixedForSession` 对 **application 创建的 worker-dispatch**
  任务（受派运营调用）以真实创建者身份写 `task.closed`（不写阶段事件）；其它 application 任务拒绝
  （`close-identity-invalid`）。旧路径 A11/B3 阶段完成后 `advance`；A9 `complete_team_plan` 成功后
  `advance`（旧协议 advance no-op）。
- `handback.ts`：application 任务的报告**只落账本**（`task.reported`），随后经端口
  `observeApplicationTaskReport` 由应用观察收口/推进；不路由给角色、不唤醒第二角色。
- `cards/cards.ts`（withRequestLifecycle）：`request_choice` 带 `promptId` ⇒ 发卡前经
  `evidence.resolveAppDispatchCardPrompt`（`verifyCardPrompt`：promptId/cardKind/选项顺序/documentRefs）
  校验；不一致 ⇒ `declined + notPresented`（`card-prompt-mismatch` 等，不发卡、不写 request.created）；
  通过后复用应用发放的 requestId（= promptId），**不重复写 request.created**、跳过旧 fixed 卡准备段；
  裁决后既有 `recordFixedCardWorkflowResolution` 照常写 A3/A6/A10 阶段事件，随后经 `FixedCardHooks`
  新钩子 `afterAppDispatchCardResolved` 关闭 prompt 任务并 drive。
  （documentRefs 由应用计算：模型未回传时以应用发放记录自校；模型回传时逐项比对——模型可篡改面仅为
  promptId/cardKind/选项。）
- `evidence.ts`：新增 `resolveAppDispatchCardPrompt`；fixed `contract_check` 按协议分流（§5.2）：
  app-dispatch 显示「应用流程驱动」run 行、`stage-execution`/`worker-dispatch`/`card-prompt`/
  `select_workflow` 必填与 8 个新稳定码（`chief-dispatch-removed` 等）；fixed-v2.1/legacy 文案逐字不变。
  `buildFixedCloseEvidence` 的 `stage-request` 跳过段保持「仅旧协议」语义——app-dispatch 下
  `stage-execution`（observe）、`card-prompt`/`worker-dispatch`（closeApplicationTaskDirect）分别收口，
  不进入该特判（旧协议的跳过行为逐字保留）。
- `tasks.ts:restoreTasks`：application 任务不走 legacy 星形恢复投递（由启动对账 + 投递桥唯一处理）。
- `interface.ts:listProject`：`restoreTasks` 之后链式调用 `manager.reconcileAppDispatch`（fire-and-forget；
  只处理 app-dispatch/v1，旧协议不触碰）。
- `session/index.ts`：新增 `FixedWorkflowStageDispatch` 实例与 `reconcileAppDispatch` 公开薄委托（门面仍为
  ≤1 行/方法；实测 795 逻辑行 ≤ 800 预算）；Handback/Cards/Lifecycle 端口按两阶段装配注入（构造期不触发）。
- `lifecycle/host.ts`、`lifecycle/index.ts`、`lifecycle/open-context.ts`、`contracts/deps.ts`：端口/上下文/
  镜像输入扩增（`appDispatchSelectWorkflow`/`appDispatchDriveWorkflow`、`workflowProtocol/selectWorkflow/
  afterFixedStageAction`、`contractCheckText(protocol?)`）。

## 二、接线图（数据流）

```
[幕僚 select_workflow] ─ tool(shape) ─▶ open.ts 能力(捕获 turnId) ─▶ stage-dispatch.selectWorkflowAndDeliver
        └─▶ workflow-service.selectWorkflow（注册表/幂等/workflow.started + 首阶段 drive）
              └─▶ stage-dispatch.deliverTaskIds（open taskId+forced fixed / enqueue / drain）
                    └─▶ 目标会话（stage-execution / worker-dispatch / card-prompt）
[角色 submit_report] ─▶ commitHandback（application：只写 task.reported，不路由）─▶ stage-dispatch.observe
        └─▶ observeAppDispatchTaskReport（/A12b 应用补归档 closeTask；/A13-B4 关闭+merge-main）
              └─▶ stage-dispatch.advance → driveAppDispatchStage → deliverTaskIds → …
[client 卡裁决] ─▶ withRequestLifecycle（verifyCardPrompt → request.resolved）
        └─▶ recordFixedCardWorkflowResolution（A3/A6/A10 阶段事件）
              └─▶ stage-dispatch.afterCardResolved（关闭 card-prompt + advance）
[convener dispatch_task] ─▶ route.ts（协议矩阵；worker-dispatch 绑定门）─▶ 项目 worker 任务（from=convener）
[convener close_created_task] ─▶ fixed cards（worker-dispatch：应用真实创建者收口；worker 任务：closeTask 条件推进）
        └─▶ advance（A11/B3 完成 ⇒ A12b/B4；B1 完成 ⇒ B2 派生 ⇒ B3）
[listProject/启动] ─▶ restoreTasks ─▶ manager.reconcileAppDispatch ─▶ reconcileFixedWorkflow + 投递一致性
```

## 三、协议分流（Q10）

| 场景 | 协议 | 行为 |
| --- | --- | --- |
| legacy / single | — | 一切注入/文案/派发逐字不变（`workflowMode` 判定不变） |
| fixed 会话 + 任务 | `task.created.workflowId → workflow.started.protocol`；缺失/读失败 ⇒ fixed-v2.1 | 旧协议：旧工具面（dispatch/close/redispatch/terminate + stage-request 矩阵 + v2 资源/旧 contract 文案）逐字；新协议：收窄幕僚工具面 + `select_workflow` + v3 资源/新 contract 文案 |
| fixed 聊天（无 taskId） | 活动 workflow 含 fixed-v2.1 ⇒ fixed-v2.1；否则 app-dispatch/v1（无 workflow 的新项目 = 新协议） | 同上 |
| 在飞 fixed-v2.1 | fixed-v2.1 | 禁止中途迁移（服务 `workflow-protocol-mismatch`；`reconcile` 跳过） |

## 四、工具面矩阵（app-dispatch/v1 fixed）

| 角色 | dispatch_task | close_created_task | redispatch/terminate | select_workflow | request_choice | 其它 |
| --- | --- | --- | --- | --- | --- | --- |
| chief | **不注入**（谓词双保险 `chief-dispatch-removed`） | **不注入** | **不注入** | **注入**（唯一流程动作） | 保留（带 `promptId` 校验） | project_state/doc_format/governance_matrix/project_note/role_activity_log 保留 |
| convener | 保留（仅项目 worker；需绑定 open `worker-dispatch`：`worker-dispatch-required`；内置 ⇒ `convener-builtin-dispatch-forbidden`） | 保留（worker 任务 + worker-dispatch 收口） | 不变（未注入） | 未注入 | 保留 | complete_team_plan/stable/refactor 语义不变 |
| product/rapporteur/nominator/verifier | 不变（无） | 不变 | 不变 | 未注入 | 不变 | 任务来源=应用（stage-execution）；verifier A12a/A12b 应用直派 |
| 项目 worker | 不变（无） | 不变 | 不变 | 未注入 | 不变 | 写集/分支/门禁不变 |

## 五、验证

### 5.1 typecheck（根 tsc，cwd=worktree）
- 5 个 desktop 错误清零。当前仅剩 2 个**测试批**类型钉：
  `test/门禁引擎/role-module-contract.test.ts:122/141`（`RoleToolId/Name` 14→15；测试批更新）。无其它错误。

### 5.1a 收尾文本同步（2026-11-20，协调方要求，**已同步**）
- 按协调方收尾要求，在 `app/desktop/session/evidence.ts` fixed `contract_check` 的 app-dispatch 稳定码
  清单加入 `stage-request-removed`（chief；不可原样重试）：说明 = app-dispatch/v1 下旧 stage-request
  派发入口已移除，旧形调用按此码拒绝；**旧协议 fixed-v2.1 仍走旧码（stage-request-invalid/
  stage-request-required 等逐字保留）**。同一 `taskKind dispatch` 说明行同步补充该码。
- 仅改 `evidence.ts` 与本记录；未改测试/其它文件。`grep -n "stage-request-removed"` 已确认两处（文案 + 码表）。
- 收尾同步时观察到测试批已在本工作树提交 `b6b7165`（更新 fixed 契约断言 + `role-module-contract` 15 项）：
  `npm run typecheck` 现为 **0 错误**；`b71-fixed-fail-closed` 与 `role-module-contract` 复跑 **28/28 pass**
  （§5.2 中此前记录的 2 个类型钉与 b71 预期差异已由测试批收口）。

### 5.2 目标桌面测试（`node --test --test-concurrency=1`）
| 测试 | pass/fail | 说明 |
| --- | --- | --- |
| `fixed-path-routing.test.ts` | 22/22 | 旧协议矩阵/路由/证据/会话模式逐字保留 |
| `b61-chat-entry-fixed.test.ts` | 全部 pass | 空项目聊天仍 fixed；工具面断言通过 |
| `b71-fixed-fail-closed.test.ts` | 1 个**预期差异**（7 用例中 6 pass） | 「contract_check fixed 视图」：空项目聊天**无 workflow ⇒ 新协议**，`run` 行为 app-dispatch 文案（旧断言期望 fixed-v2.1 文案）。其余 6 个用例（含 legacy 文案逐字）通过——测试批按新协议新增/分支断言 |
| `b82-fixed-workflow-binding-handback.test.ts` | 全部 pass | 旧协议回交安全校验/绑定不变 |
| `b101-fixed-dispatch-task-binding.test.ts` | 全部 pass | 旧协议派发/绑定不变 |
| `b51-fixed-workflow-wiring.test.ts` | 全部 pass | G-B5-1/2/3 旧路径不变 |
| `session-structure.test.ts` | 全部 pass | 分层/白名单/无环；单模块 ≤1500（cards.ts 1493）、index ≤800（795） |

> 说明：b71 的 contract_check 空项目用例是协调者任务单预期中的「新协议行为由测试批新增/旧固定路径测试不改」
> 的差异点（无 workflow = 新协议）；fixed-v2.1 在飞项目的 contract 文案仍走旧文本（由 legacy 用例与
> `contractCheckTextFixed(protocol=undefined)` 覆盖）。b71 在基线工作树（trunk-amendment）7/7 通过，
> 本工作树仅该 1 例因新协议默认而不同。

**全量桌面目录（`test/桌面应用/*.test.ts`，78 文件；分块执行以规避环境性长尾）**：
- 其余全部文件按块执行 **全绿**（合计 420+ 用例：abort-unwedge / acceptance-* / ans-wiring /
  application-line / b21 / b3-baseline / b3-workflow-git-real / b42 / boundary-refresh / chain-enforcement /
  composer-images / decision-service / diagnostics / directive-* / dispatch-fresh-enum / download-* /
  handback-delivery / hot-path / interface / log-* / message-queue / multi-runtime / network-monitor /
  optional-acceptance / pending-card-restart / pi-config / project-document / project-state / queue-* /
  rejection-copy / replay-safe-retry / request-timeout-wiring / role-log / run-change* / session* /
  star-routing / task-restart / watchdog-reuse / workflow-git-port / b3-release-merge / b31 等）。
- **环境性既有失败（与基线工作树 `trunk-amendment` 逐项复现，非本批）**：
  `genesis-bootstrap.test.ts` 1/7（`runtime-creation-prepared-api-unavailable`）、
  `operator-channel.test.ts` 1、`p0-halt-and-images.test.ts` 1（同 bindPrepared）；
  `project.test.ts` 1（工作树存在未跟踪 `角色卡/策划/` 目录导致额外枚举提示）。

### 5.3 app-dispatch in-memory 冒烟（临时目录/脚本，未落仓库）
`select_workflow(A, sourceTaskId)` → A1 创建（on-dispatch 完成）→ A2 `stage-execution` 投递 product →
幂等重放同 workflowId → A2 报告 → `observeApplicationTaskReport` 自动 accepted + `stage.completed A2` →
A3 `card-prompt`（promptId + request.created documentRefs）投递 chief → `verifyCardPrompt` 匹配通过 /
选项顺序不一致 ⇒ `card-prompt-mismatch` → 客户 confirm + `finalizeIntent`（stage.completed A3）→
`afterCardResolved` 关闭 prompt → A4 投递 rapporteur → `reconcile`（activeWorkflows=1，corrupt=0，errors=0）→
`closeApplicationTaskDirect`（worker-dispatch）`task.closed.by="application"`。**全部 PASS。**

**路径 B 冒烟（同批临时脚本）**：`select_workflow(B)` → B1 `worker-dispatch` 投递 convener → 模拟运营派
B1 分析 worker（`from=convener`，modulePaths `src/core/`）→ 报告 + `closeTask(accepted)`（B1 completed）→
应用收口 B1 worker-dispatch → `advance` → **B2 确定性派生** `change.scope-decided`（impact = 报告证据
`src/core/a.ts` 字节 hash；属主/写集由编排按名单/边界派生 ⇒ `analyst: src/core/a.ts`）→ B3 `worker-dispatch`
投递 convener。**PASS。**（无名单/边界 ⇒ `b-change-scope-invalid` 阻塞已验证为 fail-closed。）

### 5.4 工具层冒烟（临时脚本，未落仓库）
- `buildGovernedTools({selectWorkflow})`：工具注册；workflowPath 非法/未知参数 ⇒ `ok:false`（未调用能力）；
  合法输入 ⇒ 能力收到 `{workflowPath, flowId, acceptanceStrength}`；能力失败码原样进入回执。
- `buildGovernedTools({customerInput})` + `request_choice`：`promptId`/`cardKind`/`documentRefs` 原样进入
  CustomerInputRequest（`documentRefs` 为运行时附加字段）；非法 documentRefs ⇒ 发卡前拒绝。**PASS。**

## 六、待测试批覆盖点（建议）

1. `RoleToolId/RoleToolName` 14→15 类型钉（现有 2 个红）。
2. b71 contract_check：按「无 workflow ⇒ app-dispatch/v1」分叉断言（新文案）；补 fixed-v2.1 在飞项目的旧文案断言。
3. app-dispatch 工具面快照：fixed + app-dispatch 幕僚无 `dispatch_task/close_created_task/redispatch_task/terminate_role_run`、
   有 `select_workflow`；convener 有 dispatch（项目 worker 绑定门）；fixed-v2.1 在飞快照逐字不变。
4. `request_choice` promptId 流程：匹配/不一致（cardKind/选项顺序/documentRefs）、prompt 任务已收口、协议不符；
   request.created 不重复写；卡 resolved 后 prompt 任务收口 + 下一阶段投递。
5. `routeFixedPathDispatch`：app-dispatch 运营→内置 ⇒ `convener-builtin-dispatch-forbidden`；未绑定 ⇒
   `worker-dispatch-required`；绑定 open worker-dispatch ⇒ 项目 worker 任务创建（无 stage-request 依赖）；
   旧协议逐字用例保持。
6. `commitHandback` application 分支：只写 `task.reported`、不入队角色、触发 observe 收口。
7. 阶段驱动：A12b done（归档 + A12 聚合）/标准 blocked（rework A12b→A11）/轻量 blocked（accept-with-archive）；
   A13/B4 done → 汇总任务收口 + merge-main 呈卡（客户本人）；A9/A8/A11/B3 完成 → 下一阶段。
8. 路径 B：B1 done → `change.scope-decided` 派生 → B3 worker-dispatch；证据不足 ⇒ `b-change-scope-invalid`；
   B3 done 报告证据 → B4/merge-main。
9. 启动对账：已报告未收口幂等收口、open 阶段补建/补投递、`requestTaskId` 不一致 ⇒ corrupt、旧协议跳过；
   投递一致性（未送达应用任务重新入队、`forcedWorkflowMode:"fixed"`）。
10. 崩溃点矩阵（任务事件已写/投递前/投递后/报告后/收口前）与幂等键重放。
11. 与门禁批对齐：`chief-workflow-v3.md` 注入（app-dispatch）与 v2（fixed-v2.1）字节不变。

## 七、开放风险 / 未覆盖

- **standard A12b 归档**：编排 `observeAppDispatchTaskReport` 对 done 报告不生成/不携带 `acceptanceArchive`
  （仅 light+blocked 路径读取归档）⇒ 桌面批在 A12b done 上**改用应用证据 `closeTask`**（`buildFixedCloseEvidence`
  生成归档并触发 A12 聚合），未改 `src/common/编排/**`；建议编排批在 observe 中补齐同一语义，桌面路径可回归 observe。
- **A13/B4 语义**：新定义 A13/B4 为 `release-or-close`；桌面批把「汇总报告 done」实现为：关闭汇总任务（应用收口、
  不写阶段完成）→ 呈 merge-main；合并/关闭仍由应用服务完成阶段。若编排批希望由 observe 统一，请调整并回归。
- **B1 rapporteur 分支（fallbackExecutor）**：定义已记录；本批未实现「按 B1 报告出现契约/结构缺口时应用直派
  rapporteur」策略（设计 §六「留给后续 API/桌面策略」）。B1 worker-dispatch 主路径可用。
- **worker-dispatch blocked 报告**：`observeAppDispatchTaskReport` 拒绝收口 worker-dispatch（Q6），桌面亦不自动
  blocked 阶段；运营需按既有路径（worker 任务 rejected / 客户/应用停止）处置；列入测试批/后续策略。
- **投递一致性**：桌面已在 reconcile 检查「未送达/无报告」并重投；`task.delivered` 与投递队列/会话绑定的
  更细一致性（如 in-flight 崩溃窗口）依赖既有投递持久化恢复（本批未改）。
- **v3 资源注入错误码**：loader 错误前缀由 `chief-workflow-v2-resource-unavailable` 改为
  `chief-workflow-resource-unavailable`（按版本参数化；若有测试逐字断言旧前缀，需测试批同步——本批目标测试未命中）。

## 八、跨边界披露

- **`src/pipeline/orchestration/run-role.ts`**（协调者任务授权）：协议输入/工具面收窄/v3 资源/select_workflow 透传/
  A8 回调/工厂透传。legacy 与 fixed-v2.1 分支逐字保留（缺省 protocol = 旧行为）。
- **`src/provider/runtime/tools.ts`、`schema.ts`**（协调者任务授权）：`select_workflow` 工具与 `request_choice`
  promptId/documentRefs 参数；`GovernedToolsOptions` 未改（Model 属主），以本地交叉类型 + 工厂扩展选项透传。
- **未改 `src/model/**`**：`promptId` 字段已由地基批/门禁批写入 Model；`documentRefs` 回传为运行时附加字段
  （工具层形状校验 + 桌面防御读取），如需 Model 契约化请编排/模型批评估。
- **手工镜像输入**：`app/desktop/session/contracts/deps.ts` 的 `openRoleSession` 输入形状按 run-role 现行公开输入
  手工镜像（既有惯例），新增三字段与 run-role 同义。

## 九、产物清单（本批）

| 文件 | 说明 |
| --- | --- |
| `app/desktop/workflow.ts` | +协议解析 4 函数（只读） |
| `app/desktop/session/fixed-workflow/stage-dispatch.ts` | **新增**（731 行）：投递桥/驱动/观察收口/卡钩子/worker-dispatch 收口/reconcile |
| `app/desktop/session/fixed-workflow/route.ts` | 协议感知矩阵 + worker-dispatch 绑定 |
| `app/desktop/session/fixed-workflow/cards.ts` | worker-dispatch 应用收口 + A9/A11/B3 drive 钩子 |
| `app/desktop/session/evidence.ts` | `resolveAppDispatchCardPrompt`；fixed contract_check 协议分流；creatorAllowed 类型 |
| `app/desktop/session/cards/cards.ts` | promptId 校验/复用 requestId/跳过重复 request.created/裁决后钩子 |
| `app/desktop/session/card-gateway.ts` | `FixedCardHooks.afterAppDispatchCardResolved?` |
| `app/desktop/session/handback.ts` | application 报告只落账本 + observe 端口 |
| `app/desktop/session/tasks.ts` | restoreTasks 跳过 application 任务；creator 类型 |
| `app/desktop/session/shared/tasks-store.ts` | TaskCreator 三值 |
| `app/desktop/session/delivery/store.ts` | creator 类型 |
| `app/desktop/session/lifecycle/{open,host,index,open-context}.ts` | 协议解析/注入/端口/上下文 |
| `app/desktop/session/contracts/deps.ts` | 镜像输入三字段 |
| `app/desktop/session/index.ts` | StageDispatch 装配/端口/`reconcileAppDispatch`（793 行） |
| `app/desktop/interface.ts` | listProject 后链式 reconcile |
| `src/pipeline/orchestration/run-role.ts` | 协议感知注入/v3 资源/A8 回调（跨边界披露） |
| `src/provider/runtime/tools.ts`、`schema.ts` | select_workflow / request_choice promptId+documentRefs（跨边界披露） |
| 本记录 | `角色卡/桌面窗口/docs/change/2026-11-17_change_app-dispatch-builtins-desktop.md` |

*本记录供协调方/客户核对实施对照；不构成合并/发布授权。*
