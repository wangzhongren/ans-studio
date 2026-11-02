# P1 提案归档：全局任务状态与幕僚版本决策权（A0/A1/A2/A4）

- 日期：2026-11-02
- 记录角色：ANS 沟通（Communication）
- 用途：归档 2026-11-02 P1 阶段四份实现短提案（即沟通转交项目管理审核的同一文本快照）。四份提案均为报告文本：**未写文件、未改代码/测试/文档、未 commit/push**。
- 审核记录：`角色卡/项目管理/docs/change/2026-11-02_global-task-state-P1-review.md`（271 行 / SHA-256 `cca102df50cbd3783f614c7913b0137cf72282768280bf13b40996317d4e78ce`；总体结论 `needs revision`）。
- 版本登记：**V0（初始提案，2026-11-02）** = 本文件 §A0/§A1/§A2/§A4；后续窄修订以「修订记录」追加，不改写本初始快照。
- 基线（提案撰写时）：HEAD `0a12310`；方案 P1.2 1302 行 / `1573e1ef…`；V1 907 行 / `b6c23c78…`；团队计划 477 行 / `06d29aaf…`；复核 148 行 / `22128e59…`（P1.0 快照 103 行 / `3b8d3a3a…`）。

---

## A0 运行时核心（V0）

### 1. 契约

#### 1.1 `src/model/project-state.ts`（B-1 新文件；纯类型/常量，无 I/O，不 import `runtime.ts`）

常量：`PROJECT_STATE_SCHEMA="project-state/v1"`、`VERSION_DECISION_SCHEMA="version-decision/v1"`、`VERSION_DECISION_ACTIONS=["version-modify","new-version-development"]`、`VERSION_DECISION_REASON_MAX=1000`、`VERSION_DECISION_REFS_MAX=5`、`PROJECT_NOTE_*_MAX`（blocker 500 / next-step 1000 / noteKey 64 / refs 5）、`PROJECT_STATE_TOOL_MAX_BYTES=8*1024`、`PROJECT_STATE_LIMITS={flows:50,tasks:500,versionsPerFlow:20,evidence:50}`。

枚举：
- `ProjectStateRunState="draft"|"pinned"|"closed"|"cancelled"`；`ProjectStateTaskStatus="created"|"delivered"|"reported"|"closed"|"failed"`（与 `taskStatusOf` 同值）；`ProjectStateTaskSideEffect` 同 `TaskSideEffect`
- `ProjectStateFocusSelectedBy="chief"|"application"|"derived"|"none"`；`ProjectStateBlockerKind="task-blocked"|"task-failed"|"request-pending"|"acceptance-rework"|"redispatch-exhausted"|"version-drift"|"reference-invalid"|"run-ambiguous"|"focus-stale"|"chief-note"`；`ProjectStateBlockerSource="app"|"chief"`；`ProjectStateNoteKind="blocker"|"next-step"`；`ProjectStateNextStepSource="chief"|"derived"`；`ProjectStateEvidenceKind="acceptance-card"|"verifier-report"|"task-evidence"`
- `VersionDecisionAction`（两值同上）；`VersionDecisionStatus="executing"|"executed"|"failed"|"uncertain"`；`VersionDecisionDecidedBy="customer"|"judge"`；`VersionDecisionErrorCode="version-decision-invalid"|"flow-not-found"|"run-ambiguous"|"run-change-required"|"decision-pending"|"channel-unavailable"|"decision-declined"|"decision-unavailable"|"initiator-aborted"|"execution-failed"|"execution-uncertain"`（§6.3）

视图（§3.3/§7.1）：
- `ProjectStateView{schema:"project-state/v1";generatedAt;projectRoot;focus;flows[];tasks[];blockers[];versions[];evidence[];notes[];nextStep?;errors[];truncated;counts}`
- `ProjectStateFocus{flowId?;runId?;runState?:"draft"|"pinned"|"legacy";stage?;selectedBy;updatedAt?;stale;candidates?}`
- `ProjectStateFlow{flowId;sources:("run"|"task"|"docs")[];runs[];taskCounts{unclosed;blocked;failed};lastActivityAt?;supersededBy?}`；`ProjectStateRunView{runId;state;active;stage?;createdAt?;updatedAt?;pinnedAt?;closedAt?;closeReason?;rosterVersion?;documentKinds?}`
- `ProjectStateTask`（`TaskCardView` 结构性投影 + 派生）：`taskId;retryOf?;targetRoleId;from?:"chief"|"convener";text;expectedOutput?;requestedEvidence?;moduleId?;moduleDirectory?;modulePaths?;flowId?;runId?;runState?;runStage?;sideEffect;status;createdAt;deliveredAt?;lastReport?;closed?{outcome:"accepted"|"rework"|"rejected";note?;at};reports[];blocked;failed;redispatchCount`
- `ProjectStateBlocker{id;kind;flowId?;runId?;taskId?;requestId?;summary;since?;source}`；`ProjectStateVersion{flowId;docKind:"intent"|"proposal"|"modules"|"roster"|"architecture"|"assets"|"topology";latest?{path;version?;sha256?};pinned?;newerThanPinned;referenceIssue?}`；`ProjectStateEvidence{flowId;kind;ref;summary?;status?;at?}`；`ProjectStateNote{noteKey;kind;text;refs?;at;roleId:"chief";active}`；`ProjectStateNextStep{text;source;at?}`；`ProjectStateError{source:"ledger"|"manifest"|"docs"|"roster"|"view";message;file?;line?}`
- `ProjectStateCounts{unclosed;supersededUnclosed;activeUnclosed;blocked;failed;pendingRequests;flows;tasks}`（前六项按 §3.3 计数口径；flows/tasks 为截断前总数）

版本决策（§7.2）：
- `VersionDecisionRequest{flowId;runId?;action;reason(≤1000);refs?(≤5)}`；`ProjectStateQuery{flowId?;roleId?}`；`ProjectStateToolResult{ok;text?;message?}`
- `ProjectNoteInput{op:"set-focus"|"blocker"|"next-step";flowId?;runId?;note?;cleared?;noteKey?;text?;active?;refs?}`；`ProjectNoteResult{ok;message;noteEventId?}`
- `VersionDecisionFacts{flowId;runId?;runState?;stage?;unclosedCount;blockedCount;failedCount;pendingRequestCount;acceptanceRejectedCount;priorVersionDecisionCount;latestDocs[]{docKind;version?;path?;sha256?};pinnedDocs?;newerThanPinned[]}`
- `VersionDecisionCard{schema;requestId;flowId;runId?;action;reason;facts;title;question;options[]{id:VersionDecisionAction;label;description?;recommended?};preview?}`（恰 2 项/恰 1 `recommended`；校验在 A1/A2）
- `VersionDecisionResult{ok;code?;message;decisionId?;action?;flowId?;runId?;targetVersions?;newFlowId?;newRunId?;closedRunIds?;orphanedRequestIds?;runAnchor?:"unavailable"}`

事件 payload（供 `runtime.ts` type-only 引用，避免 project-state→runtime 反向依赖）：
- `ProjectFocusEventPayload{flowId?;runId?;note?;roleId:"chief"|"application";sourceDecisionId?;cleared?}`
- `ProjectNoteEventPayload{noteKey;noteKind;text;refs?;active;roleId:"chief"}`
- `VersionDecisionEventPayload{schema:"version-decision/v1";decisionId;requestId;attempt;flowId;runId?;action;recommendedBy:"chief";recommendedAction;decidedBy;operatorId?;reason;status;oldFlowId?;oldRunId?;newFlowId?;newRunId?;targetVersions?;closedRunIds?;orphanedRequestIds?;supersededTaskIds?;message?}`（§4.7）

#### 1.2 `src/model/runtime.ts`

- `RequestOrphanedEvent.reason` 扩为 `"restart"|"superseded"|"initiator-aborted"`（§7.3/§8.1）。
- `TaskStateEvent` 联合新增 `ProjectFocusEvent`（`kind:"project.focus"`）、`ProjectNoteEvent`（`"project.note"`）、`VersionDecisionEvent`（`"version.decision"`）；三者 `extends TaskStateEventBase` + 对应 payload（type-only import 自 `./project-state.ts`，无环）。
- `GovernedToolsOptions` 新增（沿 `roleStatus`/`roleActivityLog`/`requestRequirementChange` 风格）：`projectState?:ProjectStateFn`、`projectNote?:ProjectNoteFn`、`requestVersionDecision?:RequestVersionDecisionFn`。
- 能力签名：`ProjectStateFn(query, metadata?)=>Promise|ProjectStateToolResult`；`ProjectNoteFn(input, metadata?)=>Promise|ProjectNoteResult`；`RequestVersionDecisionFn(input, metadata?&{signal?:AbortSignal})=>Promise<VersionDecisionResult>`（metadata 沿 `ReportHandbackMetadata`；`RuntimeSessionOptions` 经 Omit 自动继承，无需改 service 文件）。

#### 1.3 `src/provider/runtime/tools.ts`（注入才注册；本层不硬编码角色 id）

- `project_state`：`options.projectState` 注入才注册；纯读；参数只透传 `flowId`/`roleId`（给出 `roleId` 且≠`options.roleId` ⇒ `ok:false`）；文本按 8 KiB 截断并标注（沿 `ROLE_STATUS_MAX_BYTES` 做法）。
- `project_note`：`options.projectNote` 注入才注册；严格参数白名单（未知参数拒绝）；按 op 校验：set-focus（`flowId` slug、`cleared`/`note`、`runId`）；blocker（`noteKey` slug≤64、`text`≤500、`active` 必填 bool、`refs`≤5）；next-step（`noteKey` 缺省 `"next-step"`、`text`≤1000、`active`、`refs`≤5）。
- `request_version_decision`：`options.requestVersionDecision` 注入才注册；校验 `flowId` slug、`action` 枚举、`reason` 非空≤1000、`refs`≤5；`raceAbort(call.signal)`；只调能力并原样转达 `ok/code/message`；工具本身不发卡、不执行、不写盘。
- 注入面（由 A1 `run-role.ts`/A2 `session.ts` 实施）：`project_state` → chief 完整、其他内置治理角色裁剪注入、项目 worker 不注入；`project_note`/`request_version_decision` → 仅 chief。A0 只提供契约与注册条件。

#### 1.4 `src/provider/runtime/schema.ts`（必须新增三分支，否则 `tools.map(describeTool)` 抛“未知 ANS 工具”）

- `project_state`：`{flowId?(slug),roleId?}`，required `[]`，`additionalProperties:false`；描述=只读、与 UI 同一 builder、≤8 KiB 截断、非验收证据、不写盘。
- `project_note`：`op/flowId/runId/note/cleared/noteKey/text/active/refs`，`additionalProperties:false`；描述=仅幕僚、append-only 受控备注、不改任务 status/run/manifest/文档、不是批准/验收证据、超长拒绝不截断。
- `request_version_decision`：`flowId/runId/action/reason/refs`，`additionalProperties:false`；描述=仅幕僚；**申请≠批准**；决定者是客户/judge（代批须标注）；**路线≠内容批准**、不是验收/需求变更；pinned→run-change；`new-version-development` 关闭旧 flow 全部活动 run；应用不写文档/不派角色/不创建任务；`executionMode:"sequential"`（交互工具先例）。

### 2. 精确写集（4 文件，1 新）

`src/model/project-state.ts`（新，B-1）、`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`。不改其它路径；不改 `app/**`、`src/common/编排/**`、`src/pipeline/**`、i18n、测试、文档、README、`package.json`；不新增 cardKind、不改 `DECISION_CARD_ALLOWED_ROLES`/`GOVERNANCE_CARD_GROUP`。

### 3. 测试映射（本角色不新增测试文件）

- A0 自身证据：`npm run typecheck` 0 错误（新类型/联合/能力键编译）。
- A1 `test/编排/task-state.test.ts`：三个新 kind 入白名单、`validateEvent` 接受与 `reason` 三值、重放跳过新 kind 不记“未知任务事件”、旧行不变。
- A1 `test/编排/project-state.test.ts`：`ProjectStateView` 字段/枚举/计数/truncated/errors 与 §3.3 一致（类型驱动）。
- A1 `test/编排/version-decision.test.ts`：`VersionDecisionRequest` 校验、卡两选项/一推荐、Facts/Result 形状与错误码。
- A2 `test/桌面应用/chief-workflow.test.ts`：注入矩阵——能力注入才注册；chief 三工具、其他内置角色仅 `project_state`（裁剪）、worker 无；未注入时工具名不出现。
- A2 `test/桌面应用/project-state.test.ts`：工具文本 ≤8 KiB、`roleId` 仅本人、零写入。
- A2 `test/桌面应用/version-decision.test.ts`：非法 action/reason/flowId 在工具层被拒、能力未被调用、回执“申请≠批准”。
- 回归：既有 runtime-core/pi-adapter 工具清单测试不受影响（新工具仅注入时注册，默认注入面不变）。

### 4. R1–R5 落点（A0 提供类型/能力支持）

- R1：`flows[].runs[].active` + `errors[]` 形状；`scanRunManifestsForState`/`deriveActiveRunFromManifests` 由 A1 实现。
- R2：`RequestOrphanedEvent.reason` 含 `initiator-aborted`/`superseded`；`VersionDecisionErrorCode` 区分 `decision-declined`/`decision-unavailable`/`initiator-aborted`，不设含糊 timeout 码；映射/落账 A1/A2。
- R3：`VersionDecisionEventPayload.status` 含 `failed`+`message`；Result 码 `run-change-required`；fail-closed 与 F5 排除由 A1/A2 实现。
- R4：`VersionDecisionCard.facts`、`VersionDecisionResult.closedRunIds`、事件 `closedRunIds`；schema 描述写明“关闭旧 flow 全部活动 run”；执行 A2，计划纯逻辑 A1。
- R5：无代码影响；A0 注释/报告按“P1.0 快照 103/`3b8d3a3a…`”与“再复核 148/`22128e59…`”分开引用。

### 5. i18n

A0 不产生 i18n key（新增均为 TS 类型/常量与中文工具描述，沿现有 `schema.ts` 约定）；卡标题/选项标签/系统行由 A3 管理、A2 使用 key。

### 6. 风险/歧义/需 PM 裁决

1. 能力命名 `projectState`/`projectNote`/`requestVersionDecision` 是否按现有 camelCase 工具派生风格（备选 `projectStateView`）。
2. 事件 payload 放 `project-state.ts`、`runtime.ts` type-only import：满足“project-state 不反向依赖 runtime”，但新增 runtime→project-state 单向依赖；请确认“避免循环依赖”仅指此方向。
3. `reason` 枚举加 `superseded`/`initiator-aborted`；A0 仅 TS 类型，A1 是否在 `validateEvent` 加白名单校验需确认。
4. `ProjectStateTask` 为 `TaskCardView` 结构性镜像（model 不能 import 编排）；字段漂移由 A1 测试对齐。
5. `ProjectStateError.source`（暂定五值）与 `ProjectStateEvidence.status`（暂定 `string`）设计未冻结；`counts.flows/tasks` 为 A0 补充字段。
6. `RequestVersionDecisionFn` metadata 是否携带 `AbortSignal`（用于 initiator-aborted）；若 A2 能从会话轮次自行判定可移除。
7. `request_version_decision` 设 `executionMode:"sequential"`（与 request_choice 交互工具一致）是否接受。
8. `project_state` 能力回执 `{ok,text?,message?}`（同 `role_status`），完整视图只走 IPC；请确认 A1 负责文本投影、A2 注入。
9. noteKey/refs 上限与 next-step 缺省 key 已在常量冻结，A1/A2 不得另立第二份数字。

### 7. 声明

本提案为只读分析结果；未写任何文件、未改代码/测试/文档、未 commit/push、未运行测试；未接触其他角色路径或治理文档。

---

## A1 编排（V0）

- 角色/阶段：ANS 编排独立上下文；P1 只出提案，不实施。
- 基线：HEAD `0a123109…`；`git status --porcelain -- src app test` 为空。
- 输入只读核对：方案 P1.2 1302 行/`1573e1ef…`；V1 907 行/`b6c23c78…`；团队计划 477 行/`06d29aaf…`；复核 148 行/`22128e59…`（P1.0 快照 103 行/`3b8d3a3a…`）。

### 1. 契约与函数

#### 1.1 `src/common/编排/task-state.ts`（加法，不改既有形状）

- `TASK_EVENT_KINDS` 追加 `project.focus`、`project.note`、`version.decision`；`validateEvent` 在 `request.*`/`approval.*` 旁新增独立分支（早于通用 `taskId` 校验），既有 kind 校验逐字不变。
- `project.focus`：`roleId∈{chief,application}`；`cleared!==true` 时 `flowId` 必填合法 slug、`runId?` 合法 runId、`note?`≤500、`sourceDecisionId?` 非空；`cleared:true` 时 `flowId/runId` 可省。
- `project.note`：`roleId="chief"`、`noteKey` slug≤64、`noteKind∈{blocker,next-step}`、`text` 必填（blocker≤500/next-step≤1000）、`active:boolean`、`refs?`≤5 且项目相对（无绝对路径/`..`）。
- `version.decision`：`schema="version-decision/v1"`；`decisionId/requestId/flowId/oldFlowId/reason` 必填；`attempt` 正整数；`action/recommendedAction` 两值；`recommendedBy="chief"`；`decidedBy∈{customer,judge}`；`status∈{executing,executed,failed,uncertain}`；`oldRunId/newFlowId/newRunId?` 合法；`targetVersions?` 正整数表；`closedRunIds?/orphanedRequestIds?/supersededTaskIds?` 非空字符串数组；`message?`≤500。
- `request.orphaned.reason`：给出时仅允许 `restart|superseded|initiator-aborted`；缺省兼容旧行（旧读侧未校验 reason）。
- 重放：`replayTaskEvents` 将新 kind 与 `delegation.changed`/`request.*`/`approval.*` 一样跳过（无 `taskId` → continue）；`TaskRecord`/`taskStatusOf`/`taskCards`/`unclosed` 不消费新事件，旧行不变；旧 app 白名单读新账本 → 坏行计数、不阻塞、不丢数据。
- `appendTaskEvent`/串行链/5 MB×3 轮转/坏行语义不变；A1 不改 `src/model/runtime.ts`（事件 TS 类型由 A0 冻结）。

#### 1.2 `src/common/编排/project-state.ts`（新，纯读、零写入）

- `scanRunManifestsForState(projectRoot): Promise<{manifests: RunManifest[]; errors: ProjectStateError[]}>`：直接 `readdir(.ans/runs)` + 逐项 `readRunManifest`；`isRunId` 过滤；坏/不可读 manifest 进 `errors[]` 并继续；按 `createdAt` 升序；**不调用** `listRunManifestsResult`/`findActiveRun`（R1）。
- `deriveActiveRunFromManifests(manifests, flowId): {active: RunManifest|null; activeRuns: RunManifest[]; conflict?: "multiple-pinned"}`：纯函数，复用 `findActiveRun` 的冲突/优先级规则（draft/pinned；多 pinned 冲突；pinned 优先；否则最新 draft）；`activeRuns` 全部活动 run 供视图列出（AC-1.3）。
- `buildProjectStateView(projectRoot, scope): Promise<ProjectStateView>`：`scope={viewerRoleId?, full, flowId?, now?, limits?}`；输出 §3.3 的 focus/flows/tasks/blockers/versions/evidence/notes/nextStep/errors/counts/truncated/generatedAt；错误进 `errors[]`，可读部分照常返回，不抛。
- flow 合并：manifest `flowId` + `task.created.flowId` + `docs/{product,proposals,contracts}` 版本化文件名解析（`<flowId>-<kind>-vN.md`）；同 flowId 合并；`flows[].sources` 标来源。
- focus：最新 `project.focus`；`cleared:true`→none 且不再派生；指针指向不存在/已关闭 flow/run→`stale=true` 并列候选；无事件且恰好一个有活跃 run/未收口任务的 flow→`derived`；否则 none，不猜最新 `-c`；多 active run 全列，不擅自选一个。
- tasks/blockers：`TaskCardView` + `from`/`blocked`（最后报告 `blocked`）/`failed`（最后报告 `failed`）/`redispatchCount`（一次遍历建链计数，避免 O(n²)）；blocked/failed 分离；仅 active flow 进 blockers；kind 按 §3.4；superseded flow 的任务只在 flow 明细标 superseded；`chief-note` 取最新 active `project.note(blocker)`。
- versions/evidence：版本化文档最新版（focus flow 优先；每 flow ≤20 条）；focus pinned 时取 manifest pin 并 `newerThanPinned`（复用 `findNewerContractDocs`）；缺失文档 `latest:undefined`，不误报 `reference-invalid`；`referenceIssue` 仅在文档存在但解析/引用失败时给。evidence 只出指针：`requestedEvidence`/`modulePaths`、acceptance request 状态、`docs/quality/<flowId>-report-v*.md` 存在性；不读正文、不判有效性；文档扫描辅助 `scanVersionedDocsForFlow(projectRoot, flowId)` 由本文件导出供 A2 计算 targetVersions 复用。
- notes/nextStep：`project.note` 按 `noteKey` 取最新 active；`nextStep` 幕僚备注优先，否则派生 `{source:"derived", code}`；不改机器事实。
- counts：`unclosed=state.unclosed.length`（含 superseded）；`supersededUnclosed` 为子集（最新 executed `new-version-development` 的 `oldFlowId`；轮转丢失时回退 manifest `closeReason:superseded-by:*`）；`activeUnclosed=unclosed-supersededUnclosed`；blocked/failed 只算 active flow；`pendingRequests`；`flows[].taskCounts`。
- 裁剪：chief/UI 完整；其他内置治理角色仅 focus + 自己的任务（`targetRoleId===roleId` 或 `from===roleId`）+ 相关 flow 未收口计数/阻塞摘要 + focus 版本/证据 + 公开 nextStep；他人正文/reports 不返回。
- 有界：默认 50 flow/500 task/每 flow 20 版本/50 证据；超限 `truncated=true` 且计数保留；`renderProjectStateSummary(view, labels)` 输出工具文本，UTF-8 ≤8 KiB、超限截断标注；零写入（不 `appendTaskEvent`、不 `ensureDraftRun`/`closeRun`、不产生第二状态文件）。

#### 1.3 `src/common/编排/version-decision.ts`（新，纯逻辑；I/O 由 A2）

- `validateVersionDecisionRequest(raw): Ok<VersionDecisionRequest> | Err<"version-decision-invalid">`：严格键集 `flowId/runId?/action/reason/refs?`；flowId slug、action 两值、reason 1–1000、refs≤5 安全路径；不读盘。
- `validateVersionDecisionContext(input): Ok<{runId?}> | Err<"run-change-required"|"run-ambiguous"|"decision-pending">`：输入 R1 的 `ActiveRunDerivation`、`requestedRunId?`、`hasPending`；任一 pinned/多 pinned 冲突→`run-change-required`；多个 active 且未给/给错 runId→`run-ambiguous`；有未决→`decision-pending`；legacy 无 run→ok。
- `buildVersionDecisionCard(input): VersionDecisionCard`：`kind=choice`、`cardKind=decision`、`application:true`、`sourceRoleId:"application"`、`flowId`；固定两选项 `version-modify`/`new-version-development`，恰一 `recommended=action`；labels 注入（title/question(facts)/选项文案），question 必须含 R4「关闭旧 flow 的全部活动 run」与「路线≠内容批准/不是验收」声明；产物须通过 `validateDecisionCardRequest`；不新增 cardKind、不扩大 `DECISION_CARD_ALLOWED_ROLES`。
- `computeTargetVersions(latest): Record<VersionDocKind, number>`：intent/proposal/modules/roster/architecture/assets；已有最新版+1，缺 kind→1；topology 随 roster，不单列；只建议，不创建文件。
- `mapVersionDecisionAnswer(input): VersionDecisionAnswerPlan`（R2）：answered+恰一合法 action→`execute`；declined→`resolve-declined`；timeout/unavailable→`resolve-unavailable`；aborted→`orphan(initiator-aborted)`；late（已中止/orphaned 后）→`late` 仅诊断、不写 resolved、不执行；非法答案→`invalid`，零执行。
- `planVersionDecisionExecution(input): VersionDecisionExecutionPlan`：`version-modify`→同 flow/同 draft run（legacy 返回 `needsRunAnchor:true`，A2 再 `ensureDraftRun`）+ `targetVersions`，不新建 flow/run、不写文档；`new-version-development`→`oldActiveRunIds=全部活动 run`（含多 draft；`requestedRunId` 只作上下文）、`orphanRequestIds`、`closeReason` 由 `supersededCloseReason(newFlowId,newRunId)` 生成；执行期复核发现 pinned→`fail(run-change-required)` + audit `{status:"failed",message:"run-change-required"}`，不创建/不关闭/不 orphan（R3/R4）。
- `supersededCloseReason(newFlowId,newRunId): string` = `superseded-by:<newFlowId>/<newRunId>`（R4 唯一格式）；`collectResolvedWithoutExecution(events)`：仅 `requestId` 前缀 `version-decision-`、answered（有 `decisionId`、`selectedOptionIds` 恰一合法 action）的 `request.resolved`，排除同 requestId 已有 `request.orphaned`、同 decisionId 已有任意 `version.decision`（failed/run-change-required 不误判 uncertain，R3/F5）。
- `versionDecisionRequestId(runId, now, hex)` / `versionDecisionAttempt(events, runId)`：唯一 requestId、attempt=该 run `request.created` 前缀数+1（含拒绝/中止），仅展示/审计；A2 使用（F1/AC-3.5）。

#### 1.4 `src/pipeline/orchestration/run-role.ts`（能力透传，不改其它行为）

- `AdapterCapabilities`/`RunRoleInput` 增 `projectState?`、`projectNote?`、`requestVersionDecision?`（Fn 类型来自 A0 `model/runtime.ts`）；`createRuntimeAdapterFactory` 原样透传到 `RuntimeSessionOptions`/`GovernedToolsOptions`，不包装、不调用、不写盘。
- 注入判据：`projectState` 仅 `builtInGovernance`（只读）；`projectNote`/`requestVersionDecision` 仅 `trioSpec?.id==="chief"`；项目角色/其他角色不注入（能力缺席=工具不注册）。
- 不改 dispatch/roleStatus/shell/其他 capability 的既有透传与顺序。

### 2. 精确写集

- 源码 4（2 新）：`src/common/编排/task-state.ts`（改）、`src/common/编排/project-state.ts`（新）、`src/common/编排/version-decision.ts`（新）、`src/pipeline/orchestration/run-role.ts`（改）。
- 测试 5：`test/编排/project-state.test.ts`（新）、`test/编排/version-decision.test.ts`（新）、`test/编排/task-state.test.ts`、`test/编排/run-manifest.test.ts`、`test/编排/decision-card.test.ts`（均扩展）。
- 默认只读/零改动：`src/common/编排/run-manifest.ts`、`decision-card.ts`、`workflow-preconditions.ts`、`versioned-doc-guard.ts`。
- 不写：`app/**`、`src/model/**`、`src/provider/**`、`src/common/shared/i18n/**`、`README*`、UI、`package.json`、角色卡、`docs/**`。A1 以 A0 冻结的 `src/model/project-state.ts`/`runtime.ts` 类型为前置。

### 3. 测试映射

- `test/编排/task-state.test.ts`：新 kind 合法/非法字段/坏行不阻塞；`request.orphaned.reason` 三值；重放跳过、`TaskRecord`/`taskStatusOf`/`unclosed` 不变；旧白名单模拟（AC-8.1/8.2、AC-7.1、AC-9.1）。
- `test/编排/project-state.test.ts`：flow 合并/focus（chief/cleared/derived/none/stale/不猜 `-c`）/多 active run；**R1：1 坏 + 1 好 manifest → 合法 flow 仍返回、active 标记正确、errors 计数准确**；blockers 各 kind/blocked-failed 分离；versions/pinned/newerThanPinned；evidence 指针不读正文；notes/nextStep；角色裁剪；有界/truncated；**零写入**（前后哈希、`.ans/state/` 无第二状态文件）；轮转后 focus 回退；`counts.unclosed===state.unclosed.length`、superseded/active 差值（AC-1.1–1.8、AC-2.3/2.4、AC-7.3、AC-8.1、R1）。
- `test/编排/version-decision.test.ts`：参数/卡形状（两选项、恰一 recommended、application/flowId、`validateDecisionCardRequest` 通过）/targetVersions；pinned/多 run/pending 拒绝；**R2** timeout/unavailable→resolved、aborted→orphaned、late→诊断；**R4** 多 draft 全部 `oldActiveRunIds`、`requestedRunId` 仅上下文、`closeReason` 格式；**R3** 执行期 pinned→`failed/run-change-required`、不创建/关闭/orphan；F5 `collectResolvedWithoutExecution` 排除 orphaned/已有 version.decision；requestId/attempt 拒绝→重试、中止→重试、第二未决（AC-3.2–3.6/3.8、AC-4.2/4.3/4.5、AC-5.2/5.6、AC-8.3/8.5、AC-9.1）。
- `test/编排/run-manifest.test.ts`：`closeRun` supersede `closeReason`/幂等/多 draft 逐个关闭；`findActiveRun`/`listRunManifestsResult` 既有 all-or-nothing 与 F5 坏 manifest 用例保持（AC-5.2、R1、AC-9.1）。
- `test/编排/decision-card.test.ts`：application-owned 绕过角色上限不变；version 卡两选项/恰一推荐/flowId 通过；`DECISION_CARD_ALLOWED_ROLES` 不变、无新 cardKind（AC-3.1/3.6、AC-6.6）。

### 4. R1–R5 落点

- R1：`project-state.ts` 的 `scanRunManifestsForState` + `deriveActiveRunFromManifests`；`project-state.test` 坏+好 manifest active 标记；`run-manifest.test` 既有语义回归；视图路径不调用 `findActiveRun`（代码审查证据）。
- R2：`version-decision.ts` 的 `mapVersionDecisionAnswer`；`version-decision.test` 四分支；账本 `request.resolved`/`request.orphaned` 写入归 A2 集成测试（A1 只出 plan）。
- R3：`validateVersionDecisionContext`/`planVersionDecisionExecution` 的 failed 终态 + `collectResolvedWithoutExecution` 排除 orphaned/已有 decision；纯逻辑测试；A2 落账。
- R4：`planVersionDecisionExecution` 返回全部 `oldActiveRunIds` + `supersededCloseReason`；卡 labels 必含「全部活动 run」；测试多 draft、runId 只作上下文；`run-manifest.test` closeRun。
- R5：无代码落点；A1 零文档改动、不写 planning/communication/acceptance；报告只引用 P1.2 1302/`1573e1ef…`、再复核 148/`22128e59…`（P1.0 快照 103/`3b8d3a3a…`），不混用。

### 5. i18n

- A1 不改 i18n、不硬编码文案；`buildVersionDecisionCard`/`renderProjectStateSummary` 接收注入的 labels/translate，A2 用 A3 key 组装。
- 需 A3 提供的 key 家族（精确名由 A3 冻结）：`ui.versionDecision.{title,question,option.versionModify,option.newVersionDevelopment,closeAllActiveRunsNotice,routeNotApprovalNotice,facts.*}`；`ui.projectState.{focus,counts,blocker.*,version.*,evidence.*,nextStep.*,derived.*,truncated}`；错误码文案 `version-decision-invalid` 等。
- A1 测试用 stub labels，不依赖 A3 文件；A3 未落地时 A1 仍可编译/单测。

### 6. 风险/歧义/需 PM 裁决

1. `run-role.ts` 能力形状：拟由 A0 在 `model/runtime.ts` 定义三个 Fn 与 `GovernedToolsOptions` 字段，A1 在 `AdapterCapabilities`/`RunRoleInput` 增同名透传；请确认这不越出 A0/A1 写集。
2. `project_state` 注入范围：拟对所有 `builtInGovernance`（含 su）只读注入；`project_note`/`request_version_decision` 仅 chief。legacy su/single 是否给只读 `project_state`，请裁决。
3. R1 归属：scan/derive 放 `project-state.ts`，`run-manifest.ts` 零改动；若要求放 `run-manifest.ts`，需追加只读变更与回归证据。
4. 有界：默认 50 flow/500 task/20 version/50 evidence、工具文本 8 KiB；请确认条数与字节上限。
5. acceptance-rework：方案「验收返工任务未收口」缺机器关联字段；拟 v1 只统计 acceptance request 的 reject（不读/猜任务文本），请裁决。
6. version-modify 执行期 pinned：方案 R3 只明确 `new-version-development`；拟两者统一写 `version.decision(failed/run-change-required)`，请确认。
7. 非法答案：非两选项之一拟 `version-decision-invalid`、零执行、不写 `resolved`；待决请求的账本处置（A2）需定义，请裁决。
8. evidence 指针：`docs/quality/<flowId>-report-v*.md` 只做存在性、不读正文；请确认路径与 status 枚举（`present|missing|pending|accepted|rejected|orphaned|referenced`）。

### 7. 声明

未写任何文件、未改代码/测试/文档、未 commit/push、未运行测试；本报告仅为 P1 短提案，待项目管理审核与 PM 裁决。

---

## A2 桌面窗口（V0）

基线：HEAD `0a12310`；只读核对 P1.2（1302 行 / `1573e1ef…`）、V1（907 行 / `b6c23c78…`）、团队计划（477 行 / `06d29aaf…`）、再复核（148 行 / `22128e59…`）及 `session.ts`/`interface.ts`/`main.ts`/`preload.cjs`/桌面测试。以下仅为提案文本；**未写文件、未改代码/测试/文档、未 commit/push**。

### 1. 契约与接线

#### 1.1 `app/desktop/session.ts`

**`projectStateView({ projectRoot, roleId })`**：`project-state:get` 的唯一数据源，直接调用 A1 `buildProjectStateView(projectRoot, { roleId })`，原样返回 A0 `ProjectStateView`；A2 不重算 flow/focus/task/blocker/version/evidence，不调用 `findActiveRun`；UI 通道用 `roleId:"chief"` 取完整视图，工具通道传会话 roleId（裁剪由 A1 按 roleId 完成）。读操作零写入，`errors[]`/`truncated` 如实透传。`project_state` 工具文本投影由 A0/A1 基于同一 builder 生成（A2 只注入同一结果，不复制摘要逻辑）。

**`projectNote({ projectRoot, roleId, runtime, op, ... })`**：仅 `governanceFunction==="chief"`；按 A1 的 `validateProjectNote`（若无则由 A2 做同口径形状校验：flowId/runId/noteKey slug，note/blocker ≤500、next-step ≤1000、refs ≤5、无绝对路径/`..`）。`set-focus` 用 A1 视图校验 flow 存在、runId 属于该 flow；`blocker`/`next-step` 按 `noteKey` 最新 active 生效，同 key/同文本/同 active 幂等不重复追加。通过后 `appendTaskState` 追加 `project.focus` 或 `project.note`（`roleId:"chief"`、应用时钟、append-only）；失败返回 `ok:false`。不改任务状态/closed、run state/pin、manifest、文档；不写第二状态文件。返回 `{ ok, message, noteEventId? }`（事件形状无 id 时 `noteEventId` 省略或由 A0 决定）。

**`requestVersionDecision({ projectRoot, roleId, runtime, flowId, runId?, action, reason, refs? })`**：
1. 鉴权：listing 中该 roleId 的 `governanceFunction==="chief"`，且存在 chief 活会话条目与其 `governedCardChannel`；否则 `channel-unavailable`。
2. 形状校验：A1 `validateVersionDecisionRequest`（flowId slug、action 两值、reason 必填 ≤1000、refs ≤5）；失败 `version-decision-invalid`，**不发卡、不写 `request.created`**。
3. 前置事实：用 A1 `buildProjectStateView` / `scanRunManifestsForState` + `deriveActiveRunFromManifests` 判 flow 存在、active run、pinned、多 run 歧义（**不调用 `findActiveRun`**）。flow 不存在 → `flow-not-found`；任一 active pinned 或多 pinned 冲突 → `run-change-required`；多 active run 未带 runId → `run-ambiguous`；给定 runId 必须属于该 flow 且为 active。旧 flow 自身 manifest 不可读 → 执行前置失败（不创建/不关闭）；与 focus flow 无关的坏 manifest 不阻断前置（R1-e）。
4. pending/并发：按 requestId 前缀 + `request.created.flowId` 扫描无 `request.resolved`/`request.orphaned` 的未决请求；再用内存 `versionDecisionPending`（per-project 串行链保护 check-then-set）兜住同进程并发；命中 → `decision-pending`，只呈现一张卡。
5. requestId/attempt：`version-decision-<runId|flowId>-<base36 时间>-<8 hex 随机>`，由应用生成、永不复用；`attempt` = 该 run（无 run 时该 flow）的 `request.created` 前缀数（含拒绝/中止）+1，仅展示/审计，不参与 requestId。runId 互为前缀时按 `flowId` 过滤并校验后缀形状，补构造用例。
6. 卡：A1 `buildVersionDecisionCard`（`application:true`、`sourceRoleId:"application"`、`cardKind:"decision"`、flowId、固定两选项、恰一 `recommended` = 幕僚 action；事实清单 + 免责声明，含「新版本开发关闭旧 flow 的全部活动 run」）；不新增 cardKind，不改 judge 语义。
7. 生命周期：在 `withRequestLifecycle` 增加**可选** lifecycle 参数（缺省行为逐字不变）：`notify:"none"`（版本决策只用自有 `[系统·版本决策]` 行，不对 created/presented 刷通用通知）、`abortSignal`（chief 会话 turn/lifetime signal）。拒绝/通道超时/不可用 → `request.resolved`（`declined`/`unavailable`），不写 `version.decision`；发起轮次中止 → `request.orphaned(reason:"initiator-aborted")`，不写 `request.resolved`/`version.decision`，晚到答案只记诊断/角色日志、不执行；底层通道即使晚到 resolved 也以 orphaned 为唯一状态（不双写）。
8. 已选后：先写 `version.decision(executing)`，再执行，再写终态。
   - `version-modify`：A1 `computeTargetVersions`（文档最新+1，缺失 kind 建议 v1）；同 flow/同 draft run，不写文档/不改 manifest/不 pin/不建任务/不派发；legacy/无 run 可 `ensureDraftRun` 作为锚点，失败返回 `runAnchor:"unavailable"` 不伪造；终态 `executed`。
   - `new-version-development`（顺序固定）：执行前重读旧 flow **全部** active run，发现任一 pinned → 写 `version.decision(failed, message:"run-change-required")` 并返回 `run-change-required`，**不创建新 flow/run、不关闭任何 run、不 orphan 任何申请**（R3）；生成 `<oldFlowId>-next`/`-next2`…（≤64，非法则 fail-closed）；`ensureDraftRun(newFlowId)`；关闭旧 flow **全部** active run（含多个 draft，`closeReason:"superseded-by:<newFlowId>/<newRunId>"`，请求 runId 只作上下文，R4）；对旧 flow 未决 `request.created` 补 `request.orphaned(reason:"superseded")`；追加 `project.focus` 指向新 flow/run（`roleId:"application"`、`sourceDecisionId`）；写 `version.decision(executed)`（old/new ids、`closedRunIds`、`orphanedRequestIds`、targetVersions、decidedBy/operatorId/reason）。创建失败旧 flow 不动；关闭/写审计中途失败 → `failed`/`uncertain`，停止关闭其余 run，如实回报已关闭/未关闭项，不谎称成功；不自动关旧未收口任务、不派角色、不写文档。
9. 恢复：扩展现有 `restoreRequestState`（由 `restoreTasks` 调用）：`version.decision(executing)` 对账（按 newFlowId/newRunId 查 run、旧 run 是否 closed）→ `executed`/`uncertain`，不重复建 flow；扫描 answered 的版本决策 `request.resolved`（有 decisionId、selectedOptionIds 为两 action）、**无对应 `request.orphaned`**、且无同 decisionId 的 `version.decision` → 写 `uncertain`（message `resolved-without-execution-record`）+ 通知幕僚，不自动执行；执行期 pinned 的 `failed/run-change-required` 不被误判 uncertain。
10. 通知：每次 attempt 用唯一 requestId 发一条 `[系统·版本决策]`（i18n key；judge 代批写「判断 agent 代批，不是客户本人」；拒绝写「未获选择；未执行任何改动」；中止写「发起轮次已中止；未执行」）；去重键 `requestId\0resolved` 因 requestId 唯一不会吞第二次 attempt。所有失败结构化返回，不抛到工具层；`ok:true` 只表示机器部分完成/已记录。

#### 1.2 IPC 三通道（`interface.ts` / `main.ts` / `preload.cjs`）

- `project-state:get`：`ProjectStateGetInput { projectRoot: string }` → `Promise<ProjectStateView>`（含 `errors[]`；空 projectRoot 返回空视图 + error，不抛）。
- `project:note`：`ProjectNoteInput { projectRoot, roleId, runtime?, op, flowId?, runId?, note?, noteKey?, text?, active?, refs?, cleared? }` → `{ ok, code?, message, noteEventId? }`；interface 严格白名单校验并交给 `manager.projectNote`（仅 chief）。
- `version-decision:request`：`VersionDecisionRequestInput { projectRoot, roleId, runtime?, flowId, runId?, action, reason, refs? }` → A0 `VersionDecisionResult`；interface 校验后交 `manager.requestVersionDecision`（仅 chief），失败返回 `{ok:false,code,message}`。
- `main.ts`：注册三个 handler，均做 `event.sender === win.webContents` 来源校验（同 `tasks:list`）；不新增窗口控制/Node 能力。
- `preload.cjs`：`getProjectState`、`projectNote`、`requestVersionDecision` 三个薄桥，仅透传白名单字段（字符串/布尔/字符串数组），不暴露 Node/fs/path。`project:note`/`version-decision:request` 当前 UI 不调用（O4 未选）；是否保留 bridge 请 PM 裁决（见 §6）。

### 2. 精确写集

- **修改**：`app/desktop/session.ts`、`app/desktop/interface.ts`、`app/main.ts`、`app/preload.cjs`。
- **新增测试**：`test/桌面应用/project-state.test.ts`、`test/桌面应用/version-decision.test.ts`（B-2）。
- **扩展测试**：`test/桌面应用/chief-workflow.test.ts`。
- **只读回归**：`test/桌面应用/run-change.test.ts`、`run-change-entry.test.ts`（不改）。
- **不改**：`app/renderer/**`、`src/**`（含 `run-manifest.ts`/`decision-card.ts`/`task-state.ts`）、i18n、README、角色卡/边界、`package.json`；无新依赖。

### 3. 测试映射（3 个文件）

- `project-state.test.ts`：① `project-state:get` 真实 IPC 形状（focus/flows/tasks/blockers/versions/evidence/notes/nextStep/generatedAt/errors/truncated），与 A1 同 builder；`counts.unclosed===state.unclosed.length`、superseded 子集、active 差值、blocked/failed 只算活动 flow；② chief 完整 vs convener/其他角色裁剪、worker 无工具；③ notes：set-focus 存在/不存在/cleared、blocker/next-step active/解除/幂等/超长拒绝/refs 上限；④ 零写入（`tasks.jsonl`/manifest/文档前后哈希、无第二状态文件）；⑤ 工具文本 ≤8 KiB/截断；⑥ 坏+好 manifest 下 active 标记（R1 视图侧）。映射 AC-1.1/1.2/1.4/1.5/1.6/1.7/1.8、AC-2.1–2.4、AC-7.3。
- `version-decision.test.ts`：A 发卡/客户/judge（application-owned、两选项、一推荐、事实清单、`by:"judge"`/`operatorId:"judge:"`/judge 审计/代批措辞）；B 拒绝/通道超时/不可用/发起中止/晚到答案（resolved vs orphaned、零执行、无 `version.decision`、晚到只诊断）；C pending/并发/重试/通知（单卡、`decision-pending`、拒绝与中止后新 requestId、attempt 递增、第二未决重启按 requestId 独立、两次 attempt 两条系统行不吞、runId 前缀碰撞）；D 版本修改（同 flow/run、manifest/文档哈希不变、targetVersions、executing→executed、legacy 锚点成功/失败）；E 新版本开发（`-next`/`-next2`、命名超长、新 draft、旧 flow **多 draft 全部** closed + `superseded-by`、runId 只作上下文、旧产物保留、旧未收口任务不自动关闭、旧申请 orphaned(superseded)、focus 切新、executed 字段）；F pinned fail-closed（`failed/run-change-required`、零创建/关闭/orphan、重启不误判 uncertain）、关闭阶段并发 pinned/失败（停止其余、failed/uncertain、已关闭/未关闭如实）、`resolved→executing` 崩溃窗口（uncertain + 通知、不自动执行、排除已 orphaned）、executing 对账、不重复建 flow。映射 AC-3.2–3.8、AC-4、AC-5、AC-7.1/7.2、AC-8.3–8.6、R2/R3/R4。
- `chief-workflow.test.ts`（扩展）：chief 注入了 `projectState`/`projectNote`/`requestVersionDecision`；convener 仅只读 `projectState`；worker 三者皆无；`buildGovernedTools` 注入才注册（`project_state`/`project_note`/`request_version_decision`）。映射 AC-1.6、AC-3.1。
- `run-change*.test.ts` 只读执行：lifecycle 可选参数缺省时 run-change 行为逐字不变，版本决策不触发/不替代 run-change。

### 4. R1–R5 落点

- **R1**：视图与版本决策前置只用 A1 `scanRunManifestsForState` + `deriveActiveRunFromManifests`，不调用 `findActiveRun`；测试「1 坏 + 1 好 manifest 合法 flow active 正确、无关坏 manifest 不阻断版本决策前置」；`run-manifest.ts` 零改动（A2 不写）。
- **R2**：lifecycle 变体分三路：超时/不可用 → `request.resolved`（declined/unavailable）；发起中止 → `request.orphaned(initiator-aborted)`，无 resolved/version.decision；晚到答案只诊断/角色日志；两层测试覆盖。
- **R3**：执行前 pinned → `failed/run-change-required` 终态，零创建/关闭/orphan；F5 扫描排除已 `request.orphaned`；测试断言 `failed` 不被改写为 `uncertain`。
- **R4**：新版本开发关闭旧 flow 全部 active run（含多 draft），`closeReason` 含 `superseded-by:<newFlowId>/<newRunId>`；请求 runId 只作上下文；卡面文案含「全部活动 run」；测试断言 `closedRunIds` 集合等于旧 flow 全部 active run。
- **R5**：A2 只读 P1.2/团队计划，不写 `docs/**`；回归/证据中确认 `docs/planning` 零 diff、复核记录未被改写。

### 5. i18n key（供 A3 定稿；代码不写死中文）

- 卡：`versionDecision.card.title`（{flowId}）、`.question`、`.option.versionModify.label/.description`、`.option.newVersionDevelopment.label/.description`、`.facts.unclosed/blocked/failed/pending/acceptanceRework/latestVsPinned/previousDecisions`、`.disclaimer.routeNotApproval`、`.disclaimer.closesAllActiveRuns`。
- 系统行：`versionDecision.system.resolvedCustomer/resolvedJudge/declined/unavailable/aborted/executedVersionModify/executedNewVersion/partialFailure/uncertain/failedRunChangeRequired`（含 {option}/{flowId}/{oldFlowId}/{newFlowId}/{newRunId}/{closedCount}/{unclosedCount} 占位符）。
- 项目状态/工具：`projectState.title/focusLine/stageUndefined/badge.unclosed|blocked|failed|pending/flowList/blockers.*/versions.latest|pinned|newerThanPinned/evidence.pointerNotValidity/nextStepDerived/errors.partial/truncated/noFocus/candidates/stale`。
- 错误码：`versionDecision.error.version-decision-invalid|flow-not-found|run-ambiguous|run-change-required|decision-pending|channel-unavailable|decision-declined|decision-unavailable|initiator-aborted|execution-failed|execution-uncertain`；`projectNote.error.*`、`projectState.error.*`。A3 负责 zh-CN/en-US 成对与占位符一致。

### 6. 风险、歧义与需 PM 裁决点

1. **`withRequestLifecycle` 变体**：新增可选 lifecycle 参数（notify/abort/orphaned 抑制）会触及所有申请卡的公共路径；提案保证缺省逐字不变，但需 PM 同意此扩展及「中止时 orphaned 优先、晚到答案丢弃」语义。
2. **无 run 的 requestId**：设计公式只含 `<runId>`；legacy/无 run 时提案用 `flowId` 段，若 PM/A0 要求严格区分，需在 `request.created` 增加可选 `runId`（A0/A1 契约加法）或另定前缀。
3. **执行侧 all-or-nothing 残留**：`ensureDraftRun`/`closeRun` 内部仍经 `findActiveRun`（all-or-nothing）。无关坏 manifest 可使新版本开发在创建/关闭阶段如实失败；是否由 A1 在 `project-state.ts` 提供 partial-scan-aware 创建助手，请 PM/A1 裁决（不改 `listRunManifestsResult` 语义）。
4. **IPC 暴露面**：`project:note`/`version-decision:request` 在 O4 未选时是否保留在 preload；提案保留受限 bridge、UI 不调用；若 PM 认为形成第二写入口，可只保留 interface 类型不暴露 renderer。
5. **`noteEventId`**：`project.note` 事件当前无 id；提案可省略或由 A0 增加可选字段，请 A0 冻结。
6. **通知口径**：版本决策用自有 `[系统·版本决策]` 行、不走通用 `[系统·申请]` created/presented；确认这是否符合 AC-7.4 的噪声控制与审计可见性要求。

### 7. 声明

本上下文只做了只读核对；**未写任何文件、未改代码/测试/文档、未 commit/push**。以上为实现短提案，待项目管理审核与 PM 对 §6 事项裁决后方可进入 A2 实施。

---

## A4 桌面UI（V0）

结论：方案可行。面板是纯只读投影，唯一数据入口为 `platform.getProjectState` → `project-state:get`（A2），不重算、不扫描、不实现第二套 `taskStatusOf`。以下提交 A3/PM 审核。

### 1. 契约与组件

- 入口：`TaskCenterPanel.tsx` 顶部（`tc-tools` 之前）渲染 `<ProjectStatePanel/>`；随 `projectRoot`/`paneVersions` 变化与「刷新」按钮重取，不新增轮询/订阅；`ipc.ts` 预期零改动（仅当 A2 提供专用刷新事件时按需）。
- 取数：`getDesktopBridge().getProjectState({ projectRoot })`（按 `listTasks({projectRoot})` 先例，A2 最终命名/封装为准）；校验 `schema==="project-state/v1"`，不匹配显示「不支持」而非误渲染。桥缺省、抛错、`ok:false`、空视图 → i18n 空态/错误，不假造数字；`errors[]`/`truncated` 如实显示。
- 只读边界：不读 `.ans/**`，不 import `task-state`/`project-state`/`run-manifest`，不实现 `taskStatusOf`/`taskCardOf`，不调用 close/terminate/redispatch/projectNote；计数一律取 `counts.*`，列表按 payload 顺序渲染，只做枚举→标签映射与字符串拼接。
- 面板内容（最小）：
  - 单行 focus：flowId/runId/runState/stage/generatedAt + selectedBy/stale；无 focus 显示「无」，不猜。
  - 徽标：unclosed（含 superseded，与任务中心同字段）、activeUnclosed、supersededUnclosed、blocked/failed（标「活动」）、pendingRequests、版本漂移、reference-invalid。
  - `<details>` 展开：flows（active/closed runs、taskCounts、lastActivityAt、supersededBy）；blockers（kind/summary/source）；任务摘要（只用 payload 的 TaskCardView 字段，不重判状态）；版本表（latest vs pinned、newerThanPinned、referenceIssue）；证据指针（ref/summary/status，不读正文）；nextStep（text/source）；chief notes。
  - pinned 只显示提示「请走契约变更·重开 run」，不新增写入口（按钮仍在既有 header 入口）。
- `platform.ts`：新增 `getProjectState?: (input:{projectRoot:string}) => Promise<unknown>`；`ProjectStateView` 优先 `import type` 复用 A0 `src/model/project-state.ts`，否则用渲染层结构类型；`projectNote?` 仅类型对齐 preload、UI 零调用（保留与否见 §6）。
- `shell.css`：追加 `.project-state/.ps-*`（复用现有令牌；只做布局/徽标色，不含状态语义）。

### 2. 精确写集

- 改 `app/renderer/src/chat/TaskCenterPanel.tsx`；新增 `app/renderer/src/chat/ProjectStatePanel.tsx`。
- 新增（待 PM 批准，见 §6-1）`app/renderer/src/chat/project-state-view.ts`：纯解析/视图函数，供 Node 测试（模式同 `run-change-view.ts`）。
- 改 `app/renderer/src/lib/platform.ts`；改 `app/renderer/src/shell/shell.css`；`app/renderer/src/chat/ipc.ts` 仅按需（预期不改）。
- 新增 `test/桌面UI/project-state.test.ts`；按需最小夹具 `test/桌面UI/phase4b-electron-smoke.mjs`、`phase4b-smoke-preload.cjs`。
- 不新建 e2e 脚本；不改 `app/desktop/**`、`src/**`、i18n、README、角色卡/边界、其他角色测试。

### 3. 测试映射（`test/桌面UI/project-state.test.ts`）

- 渲染/契约：fixture 覆盖 focus/flows/tasks/blockers/versions/evidence/notes/nextStep/counts/errors/truncated；断言各区块文本与徽标。
- 计数：`counts.unclosed === payload.unclosed.length`；superseded 为子集；active=差；blocked/failed 只取 counts 且带「活动」；与 `listTasks.unclosed` 同值 fixture（AC-1.1/AC-7.3）。
- 只读/无本地派生/同 builder：源码守卫断言唯一数据入口是 `getProjectState`；无 fs/账本/编排 import；无 `taskStatusOf`；无写 IPC；除刷新外无 onClick 动作。
- 两语言：全部新 key 在 zhCN/enUS 成对、占位符一致；视图 zh/en 输出；en 无中文；面板源码无硬编码中文（i18n-guard 同口径）。
- 空态：桥缺失/无项目/空视图/错误响应 → 空态/错误 key，无假数字、不抛。
- 裁剪有界：`truncated:true`+counts → 截断提示且计数保留；每组渲染上限（建议 20 行），截断不丢计数。
- R1 展示：fixture 含 1 坏 manifest 的 `errors[]` + 合法 flow 的 active 标记 → 如实显示；UI 不重新扫描（AC-1.4 UI 侧）。
- E2E（按需最小）：preload 增 `getProjectState` 桩 + main 固定 fixture；点 `#tab-tasks`，断言 `.project-state` 出现、focus/徽标文本、IPC 调用=1；点刷新再+1；断言零写通道调用；截图沿用现有流程。

### 4. i18n key（A3 定稿；全部 `ui.projectState.*`，中英成对）

- 基础：`title, refresh, readOnly, empty, loadError{detail}, unavailable, schemaUnsupported`
- focus：`focus.line{flowId,runId,runState,stage,generatedAt}, focus.none, focus.stale, selectedBy.{chief,application,derived,none}, runState.{draft,pinned,legacy,closed,unknown}, stage.undefined`
- 徽标：`badge.unclosed{count}, badge.activeUnclosed{count}, badge.supersededUnclosed{count}, badge.blockedActive{count}, badge.failedActive{count}, badge.pendingRequests{count}, badge.versionDrift{count}, badge.referenceInvalid{count}, badge.activeTag`
- 分区/列表：`section.{flows,tasks,blockers,versions,evidence,nextStep,notes,errors}`；`flow.taskCounts{open,total}`、`flow.runs{count}`、`flow.supersededBy{old,new}`（字段名待 A1 冻结）
- 枚举标签：`blocker.kind.{task-blocked,task-failed,request-pending,acceptance-rework,redispatch-exhausted,version-drift,reference-invalid,run-ambiguous,focus-stale,chief-note}`、`blocker.source.{app,chief}`、`evidence.kind.{acceptance-card,verifier-report,task-evidence}`
- 其他：`version.latest, version.pinned, version.newerThanPinned, version.referenceIssue, nextStep.source.{chief,derived}, truncated, errors{count}, pinnedHint`
- 说明：A4 不写 i18n 文件；新 key 未落地前 `typecheck:renderer` 必失败，需 A3 先行冻结。

### 5. R1–R5 落点（UI 不承担，只消费并展示）

- R1：只展示 A2 经 A1 `scanRunManifestsForState`+`deriveActiveRunFromManifests` 派生的 focus/flows/active 标记；坏+好 manifest fixture 的好 flow active 照常显示、坏项进 errors；不调用 `findActiveRun`。
- R2：只展示 pendingRequests/阻塞/版本决策结果字段；超时/中止审计语义在 A1/A2，UI 不推断、不生成系统行（AC-7.4 由 A2 落）。
- R3：执行期 pinned fail-closed 的可审计终态按 payload 展示，UI 不改判 uncertain。
- R4：`flows[].runs` 全量渲染（多个关闭 run、closeReason、supersededBy），不筛选成单 run。
- R5：无 UI 落点；引用口径只在文档。
- AC-1.1/AC-9：同一 builder 的 UI 证据=唯一 IPC 入口 + counts 同值 fixture + 无本地派生源码守卫；AC-9.2 由 `npm run typecheck:renderer`/`build:renderer` 覆盖。

### 6. 风险/歧义/需 PM 裁决

1. **写集缺口（需批准）**：Node 不能执行 `.tsx`（仓库既有口径，见 `test/桌面UI/i18n-view.test.ts`），要覆盖渲染/空态/截断必须有纯视图模块 `chat/project-state-view.ts`；否则只能源码守卫，证据偏弱。建议批准该 1 文件。
2. **A2 契约未冻结**：桥名/入参/返回封装（建议 `getProjectState({projectRoot})`、成功直接返回 `ProjectStateView`）以 A2 为准；A4 不擅自猜，冻结后再开工。
3. **最小字段**：`flows[].taskCounts` 形状、`counts.pendingRequests` 是否在 A0/A1 契约；缺字段显示「—」，不本地计算。请 A1/A2 在 model 冻结时确认。
4. **CSS 落点**：写集写 `shell.css`，但任务中心现有样式在 `phase4a.css`（Drawer 导入）。默认按写集落 `shell.css`；若要内聚请批准改 `phase4a.css`（二选一，不双写）。
5. **面板位置/展开**：建议任务中心顶部、单行+徽标常显、明细默认收起；若要求全局常驻属 O1，需明确不本轮扩。
6. **pinned 提示 vs 按钮**：为守只读建议只显示提示，不新增「重开 run」按钮（复用既有 header 入口）；请 PM 确认。
7. **projectNote 桥类型**：团队计划列在 platform.ts，但 UI 只读；建议不声明或仅类型对齐零调用。请 PM 确认。
8. **E2E 夹具范围**：仅 phase4b preload 增 1 桩 + smoke 增 1 段检查（含刷新计数与零写断言），不改现有断言/截图流程；D1 复用同一脚本需知会。

### 7. 声明

本阶段仅出报告：未写文件、未改代码/测试/文档、未 commit/push。已核对输入行数 1302/907/477，且工作区目标文件无改动。

---

## 修订记录

### 修订 V1：A0 运行时核心（2026-11-02，回应 PM `needs revision`）

1. 三个账本事件的接口、`kind` 判别与字段全部定义在 `src/model/runtime.ts` 并加入 `TaskStateEvent`；`src/model/project-state.ts` 只放枚举/常量/视图/卡/请求/回执类型，**不 import runtime**；runtime 仅 type-import project-state 的枚举（单向，无环）。
2. 错误码冻结 11 项；`Error.source` 五值；`Evidence.kind` 三值、`status` 两值；`Counts` 八字段。
3. `ProjectStateTask` 仅 `TaskCardView` 结构镜像，不 import 编排；A1 加双向可赋值断言。
4. `ProjectNoteResult={ok,message,at?}`，删除 `noteEventId`。
5. `RequestVersionDecisionFn=(input, signal?:AbortSignal)`；工具层先查 `call.signal?.aborted`，再 `raceAbort(fn(input, call.signal), call.signal, …)`；AbortSignal 不进 metadata。
6. `schema.ts` 新增三支；`project_note`/`request_version_decision` 设 `executionMode:"sequential"`，`project_state` 省略。
7. 常量单一来源＝project-state.ts；tools/schema/runtime 只 import。
8. 能力位固定 `projectState`/`projectNote`/`requestVersionDecision`；`projectStateView` 仅作 SessionManager 方法名。
9. `project_state` 入参仅可选 `flowId`（无 `roleId`，裁剪域由会话身份注入）；回执 `{ok,text?,message?}`；A1 产 ≤8 KiB 摘要，A0 工具层硬截断并标注。
10. `Error.source`/`Evidence.status`/`Counts`/`ProjectStateTask` 按冻结表。

事件接口（全在 `src/model/runtime.ts`，追加进 `TaskStateEvent`）：

```ts
export interface ProjectFocusEvent extends TaskStateEventBase {
  kind: "project.focus";
  flowId?: string; runId?: string; note?: string;
  roleId: "chief" | "application"; sourceDecisionId?: string; cleared?: boolean;
}
export interface ProjectNoteEvent extends TaskStateEventBase {
  kind: "project.note";
  noteKey: string; noteKind: "blocker" | "next-step"; text: string;
  refs?: string[]; active: boolean; roleId: "chief";
}
export interface VersionDecisionEvent extends TaskStateEventBase {
  kind: "version.decision";
  schema: "version-decision/v1"; decisionId: string; requestId: string; attempt: number;
  flowId: string; runId?: string;
  action: VersionDecisionAction; recommendedBy: "chief"; recommendedAction: VersionDecisionAction;
  decidedBy: VersionDecisionDecidedBy; operatorId?: string; reason: string;
  status: VersionDecisionStatus;
  oldFlowId?: string; oldRunId?: string; newFlowId?: string; newRunId?: string;
  targetVersions?: Record<string, number>; closedRunIds?: string[];
  orphanedRequestIds?: string[]; supersededTaskIds?: string[]; message?: string;
}
```

枚举/常量冻结（`src/model/project-state.ts`）：
- 常量：`PROJECT_STATE_SCHEMA="project-state/v1"`、`VERSION_DECISION_SCHEMA="version-decision/v1"`、`VERSION_DECISION_ACTIONS=["version-modify","new-version-development"]`、reason ≤1000、refs ≤5、blocker 500 / next-step 1000 / noteKey 64 / refs 5、工具文本 8 KiB、limits {flows:50,tasks:500,versionsPerFlow:20,evidence:50}。
- 枚举：runState、taskStatus、taskSideEffect、focusSelectedBy、blockerKind 10、blockerSource、noteKind、nextStepSource；`ProjectStateErrorSource="tasks"|"run-manifest"|"docs"|"roster"|"modules"`；`ProjectStateEvidenceKind` 三值、`ProjectStateEvidenceStatus="present"|"missing"`；VersionDecisionAction/Status/DecidedBy/ErrorCode（恰 11）；`ProjectStateCounts` 八字段。
- `ProjectStateError{source;message;file?;line?}`；`ProjectStateTask` = TaskCardView 结构镜像 + `from/blocked/failed/redispatchCount`；镜像 `ProjectStateReportedEvent`。
- 其余：`ProjectStateQuery{flowId?}`；`ProjectStateToolResult{ok;text?;message?}`；`ProjectNoteInput`；`ProjectNoteResult{ok;message;at?}`；`VersionDecisionRequest`；Facts/Card/Result 维持原字段。

能力签名（`runtime.ts`）：

```ts
export type ProjectStateFn = (query: ProjectStateQuery, metadata?: ReportHandbackMetadata) => ProjectStateToolResult | Promise<ProjectStateToolResult>;
export type ProjectNoteFn = (input: ProjectNoteInput, metadata?: ReportHandbackMetadata) => ProjectNoteResult | Promise<ProjectNoteResult>;
export type RequestVersionDecisionFn = (input: VersionDecisionRequest, signal?: AbortSignal) => Promise<VersionDecisionResult>;
```

`GovernedToolsOptions` 新增同名三键；`RequestOrphanedEvent.reason="restart"|"superseded"|"initiator-aborted"`。

工具层：三工具注入才注册；`project_state` schema 仅 `{flowId?(slug)}`，`additionalProperties:false`，文本按 8 KiB 硬截断；`project_note` 严格白名单 + op 校验 + sequential；`request_version_decision` 校验 + 先查 aborted + raceAbort + 只转达回执 + sequential；schema 三支描述固定写明只读/申请≠批准/路线≠内容批准/不写文档不派发/pinned→run-change/新版本开发关闭旧 flow 全部活动 run。

最终写集：`src/model/project-state.ts`（新，B-1）、`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`；不改其他路径。

声明：仅报告文本；未写文件、未 commit。

### 修订 V1：A1 编排（2026-11-02，回应 PM `needs revision`）

1. **version-modify 执行期 pinned（统一）**：A2 执行前重新 `scanRunManifestsForState` + `deriveActiveRunFromManifests`，作为 `planVersionDecisionExecution` 唯一 active-run 输入；任一 `pinned`/`conflict:"multiple-pinned"` → `{kind:"fail", code:"run-change-required", audit:{status:"failed", message:"run-change-required"}}`；零执行（不 ensureDraftRun、不写 targetVersions、不改文档/run、不关闭/不 orphan）。测试：两种 action × pinned/并发 pinned。
2. **非法答案固定归一化 declined**：`mapVersionDecisionAnswer` invalid 分支 → `{kind:"resolve-declined", choice:"declined", reason:"invalid-selection", by}`；零执行；A2 写 `request.resolved(choice:"declined", reason:"invalid-selection")`；不写 `version.decision`；只记诊断/角色日志；`collectResolvedWithoutExecution` 排除 `reason:"invalid-selection"`。测试：未知选项/多选/缺 selectedOptionIds 三例。
3. **scan/derive 形状冻结**：`scanRunManifestsForState(projectRoot): Promise<{manifests: RunManifest[]; errors: ProjectStateError[]}>`；`ProjectStateError={source:"tasks"|"manifest"|"docs"; ref?:string; message:string}`（**注：与 A0/PM 冻结的 `source∈{tasks,run-manifest,docs,roster,modules}`、`file?/line?` 不一致，待 PM 复审裁决**）；逐 manifest 读、坏项进 errors、按 createdAt 升序、不调用 listRunManifestsResult/findActiveRun。`deriveActiveRunFromManifests(manifests, flowId): {active: RunManifest|null; activeRuns: RunManifest[]; conflict?: "multiple-pinned"}`。
4. **acceptance-rework 收窄**：仅机器事实（acceptance request reject；可选 task.closed(outcome="rework")）；禁止文本匹配/猜意图；不实现设计 §3.4「未收口返工任务」推断；E1/E2 披露。
5. **视图不调用 all-or-nothing API**：`buildProjectStateView`/scan/derive 只依赖 `readRunManifest`/`isRunId`/文档扫描；不 import/调用 `findActiveRun`/`listRunManifestsResult`；`run-manifest.ts` 零 diff（源码级断言 + E1 `git diff --exit-code`）。
6. **evidence 冻结**：kind 三种、status `present|missing`；只做指针存在性；不读正文、不判有效性。测试 present/missing 各 kind、读取前后文档哈希不变。
7. **补测试缺口**：R1 视图不调用两 API + run-manifest.ts 零 diff；R2 四类纯逻辑；R3 F5 排除 orphaned/已有 version.decision、failed 不误判；R4 closedRunIds 与 partial scan 一致；AC-1 坏账本行数准确、cleared 不派生、多候选不猜 -c 正反例；AC-4 缺失 kind→v1；AC-5 closedRunIds 断言；AC-8 轮转后 focus 回退 derived/none。
8. **project_state 注入冻结**：`projectState` → `builtInGovernance` 全部（含旧 su）只读裁剪；`projectNote`/`requestVersionDecision` → 仅 `trioSpec?.id==="chief"`；项目 worker 不注入。
9. **有界与类型镜像冻结**：50/500/20/50/8 KiB；`ProjectStateTask = TaskCardView & {from;blocked;failed;redispatchCount}`；与 A0 双向可赋值断言。
10. 测试文件补充映射：task-state（新 kind/reason/旧白名单）→ AC-7.1/8.1/8.2/9.1；project-state（R1/focus/acceptance-rework/evidence/有界/零写入/轮转/counts/类型断言）→ AC-1、AC-2.3/2.4、AC-7.3、AC-8.1、R1、AC-9.1；version-decision（pinned 双 action、非法答案、R2 四类、R3 F5、R4 closedRunIds、AC-4 缺失 kind、AC-5、requestId/attempt）→ AC-3.2–3.6/3.8、AC-4.2/4.3/4.5、AC-5.2/5.6、AC-8.3/8.5、R2/R3/R4、AC-9.1；run-manifest（closeRun/既有语义）；decision-card（application-owned/两选项/上限不变）。

声明：仅报告文本；未写文件、未 commit。

### 修订 V1：A2 桌面窗口（2026-11-02，回应 PM `needs revision`）

1. **IPC 面（仅 `project-state:get`）**：`interface.ts` 只新增 `getProjectState(input:{projectRoot:string}): Promise<ProjectStateView>`（空/非法 root 返回空视图 + errors，不抛）；`main.ts` 只注册 `"project-state:get"` + sender 校验；`preload.cjs` 只新增 `getProjectState` 薄桥；**不新增/注册** `project:note`/`version-decision:request`。写路径只经幕僚工具能力注入。
2. **`withRequestLifecycle` 可选参数**：`(..., requestIdOverride?: string, lifecycle?: {notify?: "default"|"resolved-only"|"none"; signal?: AbortSignal})`；缺省逐字不变；`resolved-only`/`none` 控制通用通知；signal 中止→抑制 resolved/通用通知、写 `request.orphaned(initiator-aborted)`、晚到丢弃；timeout/unavailable→resolved、不写 version.decision；版本决策用 `notify:"none"` + signal，自行追加仅 resolved 的 `request.notified` 与一条 `[系统·版本决策]`。
3. **requestId/pending 结构化匹配**：有 run `version-decision-<runId>-<base36>-<8hex>`；无 run `version-decision-flow-<flowId>-<base36>-<8hex>`；随机后缀、永不复用；attempt = 结构化匹配的 request.created 数（含拒绝/中止）+1；扫描按已知 runIds/flowIds 降序最长匹配 + flowId 校验，不用裸 startsWith；补 runId 前缀碰撞测试。
4. **执行侧事实修正**：`closeRun` 只读目标 manifest，不是 all-or-nothing；逐个 closeRun；`ensureDraftRun` 经 findActiveRun 是全有或全无，创建侧遇无关坏 manifest → `execution-failed`；不新增 partial-aware 助手；不改 run-manifest.ts。
5. **回执与系统行**：projectNote 回执 `{ok,message,at?}`；版本决策沿用 A0 Result；created/presented 不发系统通知，`request.notified` 只留 resolved，只发一条 `[系统·版本决策]`（客户/判断代批与执行结果；部分失败如实）。
6. **测试补充**：project-state（备注哈希不变/重启重建/set-focus 拒绝/超长/refs>5/active:false/幂等/载荷裁剪零写）；version-decision（无关坏 manifest 不阻断前置、命名边界、关闭失败/并发 pinned、旧产物不变、执行前 pinned 零创建、完整序列、channel vs decision-unavailable、第二未决重启、恢复不重复建 flow、崩溃窗口 uncertain+通知、failed 不误判、runId 前缀碰撞）；chief-workflow（注入矩阵/无写桥）。
7. 其余 A2-1–A2-6 裁决全部落入；写集不变（session/interface/main/preload + 3 测试）。

声明：仅报告文本；未写文件、未 commit。

### 修订 V1：A4 桌面UI（2026-11-02，回应 PM `needs revision`）

- 采纳列内替代 (a)：**删除** `project-state-view.ts`；纯解析/视图函数放入 `app/renderer/src/lib/platform.ts`；面板只渲染。
- `platform.ts` 仅新增 `getProjectState?`（不加 `projectNote?`）与纯函数：`asProjectStateView(value): ProjectStateView | null`（只校验 schema 与顶层形状，非法→null）；`projectStateSummaryView(state,t): {focusLine,selectedBy,stale,pinned,readOnlyLabel,badges[]}`；`projectStateDetailsView(state,t): {flows,blockers,versions,evidence,nextStep,notes,errors,truncated}`（按 payload 顺序映射、不聚合/不重算/不排序）。
- 面板：`TaskCenterPanel` 顶部、一行 focus+徽标常显、`<details>` 默认收起、pinned 仅提示、唯一动作=刷新（projectRoot/paneVersions）；计数只用 `counts.*` 与 `flows[].taskCounts`。
- 写集：TaskCenterPanel/ProjectStatePanel（新）/lib/platform.ts/shell.css + test/桌面UI/project-state.test.ts（新）+ phase4b 夹具按需；`ipc.ts` 零改；不改 phase4a/phase4b.css、不新建 e2e 脚本。
- 测试：Node 直接 import platform.ts；渲染/计数（unclosed 同 listTasks、superseded 子集、active 差值、blocked/failed 带活动）/只读源码守卫/两语言（62 key 全量、占位符、英文零 Han、无硬编码中文）/空态/truncated/errors 如实/R1 展示；E2E 最小：preload 桩 + main fixture，IPC 调用=1、刷新=2、零写桥、截图。
- 依赖：A2 IPC 冻结（getProjectState({projectRoot})→project-state:get→ProjectStateView，非法/空 root 空视图+errors）；A3 冻结 `ui.projectState.*` 62 key 后再写代码。
- 声明：仅报告文本；未写文件、未 commit。
