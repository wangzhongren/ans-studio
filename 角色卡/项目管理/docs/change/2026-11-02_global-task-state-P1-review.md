---
id: global-task-state-p1-review
type: change
title: P1 实现提案审核：全局任务状态与幕僚版本决策权（A0/A1/A2/A4）
created: "2026-11-02"
updated: "2026-11-02"
timezone: Asia/Shanghai
status: draft
related: [global-task-state]
events:
  - date: "2026-11-02"
    kind: created
    summary: 按 references/proposal-review.md 审核运行时核心/编排/桌面窗口/桌面UI 四份 P1 提案；总体结论 needs revision（四份均需窄修订，A4 新文件写集须沟通/客户确认）
---

# P1 实现提案审核：全局任务状态与幕僚版本决策权（A0/A1/A2/A4）

- **审核角色 / 上下文**：项目管理（technical-architecture，固定角色；本上下文只承担该角色，独立于四份提案作者上下文）。
- **审核性质**：实现提案审核（`references/proposal-review.md`）；不是客户闸门、不是实施授权、不是测试结果、不是独立验收结论，也不替代 V1/E2。
- **审核对象**：沟通于 2026-11-02 转交的四份 P1 短提案（A0 运行时核心、A1 编排、A2 桌面窗口、A4 桌面UI）。四份提案**均声明只读分析、未写文件、未 commit**；提案原文由沟通转交、未落盘到仓库，故行数与 SHA-256 **无法实测**（见 §八 未解决项 1）。本记录只对转交快照有效；提案文本如有实质修改须重新核对受影响项。
- **结论**：**`needs revision`**（总体）。四份提案在范围、角色归属、T3、只读/账本/卡语义方向上与已确认 P1.2、V1、团队计划一致；但存在**契约冻结前必须收口的修改项**（A0 事件形状归属、A1 执行期 pinned/非法答案、A2 IPC 面与 requestId 匹配、A4 新文件写集），其中 **A4 新增 `app/renderer/src/chat/project-state-view.ts` 不在团队计划 §4.1/§4.3 写集内，按 §八.11 越界规则不得由 PM 自行批准**，须由沟通向客户重开闸门 2 或改用列内替代（§四.2）。逐份结论见 §二。
- **可进入的下一步**：各提案 owner 按 §二/§七 的必须修改项提交**窄修订说明**（不必重写全文）；项目管理按受影响项复审。复审通过前不进入 A0/A1/A2/A4 实施；A4 另须等 A2 IPC 契约冻结与写集结论。本记录不授权 commit/push/发布。
- **未做**：未运行测试、未启动应用、未跑 E2E、未实施任何产品/测试代码、未改方案/团队计划/沟通/验收/角色卡/边界、未 commit/push、未接触客户。所有代码结论来自 HEAD `0a12310` 的只读阅读与 B0/沟通记录转引。

## 一、冻结输入与只读基线

### 1.1 输入（2026-11-02 审核时实测）

| 输入 | 路径 | 行数 | SHA-256 |
| --- | --- | --- | --- |
| 团队计划（闸门 2 确认） | `docs/scheduling/2026-11-02_team-plan_global-task-state.md` | 477 | `06d29aaf940b9b66062420a9926c9c1764b0aaf12757f785383ce5c0d6359d62` |
| 方案 P1.2（实施/V1 基线） | `docs/planning/2026-11-02_design_global-task-state-version-authority.md` | 1302 | `1573e1ef7b88dece485f6eab29d657181e1afd61a02849a29c7a7592af5bebfb` |
| 实施前验收标准 V1 | `docs/acceptance/global-task-state-criteria-v1.md` | 907 | `b6c23c78486239a6aec1abe3f6118a2d3a83716dcc9d443299cabd58598b77ab` |
| 独立复核记录（P1.1 再复核） | `docs/planning/2026-11-02_review_global-task-state-version-authority.md` | 148 | `22128e59904ab8de10ede64f7acc478069c752198fc3b87c043f5dab4434c5a8` |
| 沟通记录（审核时） | `docs/communication/2026-11-02_intent_global-task-state.md` | 140 | `fff4320150cd27ab01516dbec65ed872ae404822a961a57812d8ae48a6558486` |
| B0 基线（转引） | `角色卡/测试/docs/change/2026-11-02_global-task-state-B0-baseline.md` | 167 | `5c275332f38ba3c8c3f1ad51dcd72df62ef92e2a2523779441d678f6bf02aa58` |
| 四份 P1 提案 | 沟通 2026-11-02 转交文本（A0/A1/A2/A4） | 未落盘 | 无法实测（见 §八 1） |

- 代码基线：worktree `flow-improvements-wave1`，HEAD `0a123109a6b10e9b60fd1aee5f08f861455c48de`；`git status --porcelain -- src app test` 为空（产品/测试无本任务改动）。
- 沟通记录 140 行 / `fff43201…` 是审核时**当前**值；V1 写盘时引用 134 行 / `0ef4ba72…` 是历史快照（沟通记录为并发追加的管理记录，V1 §九.2 已披露），两者不混用；P1.0 复核快照 103 行 / `3b8d3a3a…` 与再复核记录 148 行 / `22128e59…` 亦分开（R5）。
- 闸门 2 与实施授权已确认（沟通记录「闸门 2 确认与实施授权记录」与「P1.2 核对记录」「V1 核对记录」）：按团队计划与 P1.1/P1.2 实施，不含提交/推送/发布；B-1/B-2 已确认，H1 已落地（6 个边界文件 +20/−0、boundary 测试 17/17）；B0 已完成（受影响套件 44/44、phase4b smoke 64 checks/0 failures）。

### 1.2 只读代码核对（HEAD `0a12310`）

- `src/common/编排/task-state.ts`：`:39-47` `TASK_EVENT_KINDS`；`:274-422` `validateEvent`（`request.orphaned` 走通用 `request.*` 分支，仅校验 `requestId`，不校验 `reason`）；`:425-480` 重放对 `request.*`/`approval.*`/`delegation.changed` 跳过；`:542-549` `taskStatusOf`；`:551-572` `TaskCardView`（含 `text`/`reports`/`status` 五态，不含 `from`/`blocked`/`failed`/`redispatchCount`）；`:630-642` `redispatchCountOf`。
- `src/common/编排/run-manifest.ts`：`:221-237` `listRunManifestsResult` 为 **all-or-nothing**（首个非法 manifest 即 `ok:false`）；`:240-251` `findActiveRun` 复用该函数；`:254-285` `ensureDraftRun` 经 `findActiveRun`，故**创建侧**受 all-or-nothing 影响；`:546-565` `closeRun` 只读目标 run 的 manifest（**不是** all-or-nothing，无关坏 manifest 不阻塞关闭）；`:696-730` `buildRunChangeCard`（application-owned、三项、恰一推荐）；`:832-863` `findNewerContractDocs`。
- `src/common/编排/decision-card.ts`：`:36` `DECISION_CARD_ALLOWED_ROLES = ["convener","rapporteur"]`；`:98-107` `application:true` 绕过角色 allowlist；`:108-144` 仍校验 choice/flowId/≥2 选项/唯一 id/恰一 recommended。
- `src/model/runtime.ts`：`:836-840` `RequestOrphanedEvent.reason` 当前仅 `"restart"`；`:871-885` `TaskStateEvent` 联合；`:2054+` `GovernedToolsOptions`；`:576-601` `CustomerInputMetadata` 含 `signal`；`:645-649` `ReportHandbackMetadata` 只含 `turnId/roleId/runtime`；`:293-296` `ShellEscalationFn(input, signal?)` 为**第二位置参数**先例；`:2021-2024` `ToolExecutionCall.signal`。
- `src/provider/runtime/schema.ts`：`:19` `describeTool` 按名分派；`:1233` 未知工具名直接抛 `未知 ANS 工具`（新增三工具必须补分支，否则 `buildGovernedTools` 构造失败）；`:310/410` 交互类工具 `executionMode:"sequential"` 先例。
- `src/provider/runtime/tools.ts`：`:3077` `buildGovernedTools`「注入才注册」；`:3236` 统一 `describeTool`；`:1126-1133` `raceAbort(fn(...), call.signal)` + 第二位置 `signal` 先例；`:226-228` `customerMetadata` 才把 signal 放进 `CustomerInputMetadata`。
- `src/pipeline/orchestration/run-role.ts`：`:718` `builtInGovernance`；`:1264-1280` 能力矩阵（`roleActivityLog`/`terminateRoleRun`/`redispatchTask` 仅 chief；`dispatchTask` 看 `cap`）；`:1383-1407` `AdapterCapabilities` 组装。
- `app/desktop/session.ts`：`:3464-3480` `requestIdFor` 稳定 digest `req-…`；`:3482-3515` `notifyRequest` 按 `requestId+event` 去重并输出 `[系统·申请]`；`:3882-3995` `withRequestLifecycle`（answered/declined/null/throw 都会写 `request.resolved`，并通知 resolved）；`:4049-4062` `listTasks`（`unclosed = state.unclosed.length`）；`:4073-4107` `restoreRequestState`（未决 `request.created` → `request.orphaned(restart)`）；`:4665-4723` `escalateStuckTask`（application-owned decision 卡 + `withRequestLifecycle` + `requestIdOverride` 先例）；`:2440-2504` 能力注入；`:2790-2803` `requirementChangeCard` 通道仅统筹/提案/幕僚构造。
- `app/main.ts`：`:932-956` `tasks:list` 等 handler 的 `event.sender === win.webContents` 来源校验；`:893` `run:change-request`；`app/preload.cjs:131` 薄桥先例。
- `app/renderer/src/lib/platform.ts`：`:191` `getDesktopBridge` 只在函数内读 `window.desktop`（模块可被 Node 导入）；`app/renderer/src/chat/run-change-view.ts` + `test/桌面UI/run-change-view.test.ts` 是「纯视图逻辑放 `.ts`、Node 测试导入」的既有先例；`test/桌面UI/i18n-view.test.ts:4` 明示 Node 不能直接执行 `.tsx`。
- `test/项目管理/shared/i18n.test.ts`：当前计数 `ui 921 / main 559 / shared 62 / preferences 3 = 1545`；`i18n-guard` 对 `app/renderer/src/**`、`app/desktop/interface.ts`、`app/desktop/session.ts` 等有允许清单与硬编码中文守卫。

### 1.3 方法与限制

- 按 `references/proposal-review.md` 检查需求符合、五层架构与依赖方向、共享契约/公共导出、角色归属、复用、测试映射与证据；只读核对方案 P1.2、V1、团队计划、复核、沟通记录与相关代码段落。
- 未运行测试/应用/E2E，未验证运行时行为；未逐行读完 `session.ts`（约 491 KB）等大文件，只读与账本、申请生命周期、run-change、注入、工具注册、任务卡、IPC 相关段落。
- 四份提案未落盘，无法核对其行数/SHA-256；本记录按沟通转交文本审核。A3 是审核者自身角色的 i18n 计划，按 §六 披露自检，不虚构独立审核。

## 二、逐份结论（含必须修改项与 owner）

| 提案 | 结论 | 必须修改项（摘要） | owner |
| --- | --- | --- | --- |
| A0 运行时核心 | **needs revision** | ①三种账本事件的**接口**必须定义在 `src/model/runtime.ts` 并加入 `TaskStateEvent`（`project-state.ts` 只放枚举/常量/视图类型，runtime 可单向往 type-import），否则违反设计 §6.1 与「事件形状单一来源 = model/runtime.ts」纪律；②冻结 `ErrorCode` 恰 11 项、`Error.source`、`Evidence.kind/status`、`ProjectStateCounts` 精确字段；③`ProjectStateTask` 只做结构性镜像、不得 import `src/common/编排/task-state.ts`（Model 不得依赖编排）；④回执去掉 `noteEventId`；⑤`AbortSignal` 用第二位置参数（沿 `ShellEscalationFn`），不放 metadata；⑥`describeTool` 三支必须新增且 `executionMode` 按 §七 裁决；⑦常量单一来源。 | 运行时核心 |
| A1 编排 | **needs revision** | ①`version-modify` 执行期发现 pinned 统一写 `version.decision(status:"failed", message:"run-change-required")` 并零副作用；②非法答案的账本处置固定为「归一化 declined + 零执行 + 不写 `version.decision`」；③`scanRunManifestsForState`/`deriveActiveRunFromManifests` 返回形状精确冻结；④`acceptance-rework` 只按机器事实派生并披露收窄；⑤`buildProjectStateView` 不调用 `findActiveRun`/`listRunManifestsResult`，`run-manifest.ts` 默认零改动；⑥`evidence.status` 冻结 `present|missing`；⑦测试补 AC/R 缺口（§五）。 | 编排 |
| A2 桌面窗口 | **needs revision** | ①本任务**不**向 preload 暴露 `project:note`/`version-decision:request` 写桥（O4 未选）；`project-state:get` 为唯一新 IPC；②requestId 公式与 pending 扫描必须按已知 runId/flowId **结构化匹配**，不得裸前缀；补 runId 前缀碰撞测试；③`closeRun` 并非 all-or-nothing（只读目标 manifest），`ensureDraftRun` 才是；**不新增 partial-aware 助手**，执行失败如实 `execution-failed`；④`withRequestLifecycle` 可选参数默认逐字不变，abort 抑制 resolved/通用通知并写 orphaned；⑤回执无 `noteEventId`；⑥系统行只发 `[系统·版本决策]` resolved 一条；⑦测试补 AC-2.3/2.4、AC-5.1/5.2、AC-7.1、R1-e、第二未决重启、恢复不重复建 flow 等（§五）。 | 桌面窗口 |
| A4 桌面UI | **needs revision** | ①新增 `app/renderer/src/chat/project-state-view.ts` **不在团队计划写集**，按 §八.11 不得自行创建；须沟通→客户重开闸门 2，或改用列内替代（`lib/platform.ts` 纯函数 / `.tsx` + source-guard + E2E）；②A2 IPC 未冻结前不写面板；③CSS 只落 `shell.css`；④pinned 只提示、不新增按钮；⑤`platform.ts` 只保留 `getProjectState?`，不加 `projectNote?`；⑥计数只用 A0 `counts.*`，不做本地派生；⑦i18n key 按 §六冻结；⑧E2E 最小范围、phase4b 单写者。 | 桌面UI |

## 三、契约冻结（以 A0 为单一来源，A1/A2/A4 对齐）

### 3.1 冻结表

| 契约 | 冻结内容（本审核裁决） |
| --- | --- |
| `project-state/v1` | `schema:"project-state/v1"`；`generatedAt`、`projectRoot`；`focus{ flowId?, runId?, runState?: "draft"|"pinned"|"legacy", stage?, selectedBy: "chief"|"application"|"derived"|"none", updatedAt?, stale? }`；`flows[]` 含 `flowId/sources/runs[]/taskCounts/lastActivityAt/supersededBy?`，`taskCounts` 精确为 `{unclosed,blocked,failed}`；`tasks[]` = `TaskCardView` 字段集 + `from:"chief"|"convener"` + `blocked:boolean`（仅最后报告 blocked）+ `failed:boolean`（仅最后报告 failed）+ `redispatchCount:number`；`blockers[]` 10 kind（`task-blocked/task-failed/request-pending/acceptance-rework/redispatch-exhausted/version-drift/reference-invalid/run-ambiguous/focus-stale/chief-note`）+ `source:"app"|"chief"`；`versions[]` 含 `latest{path,version,sha256?}|pinned{path,version?,sha256?}/newerThanPinned/referenceIssue?`；`evidence[]` kind 仅 `acceptance-card/verifier-report/task-evidence`，`status` 仅 `present|missing`（**只是指针存在性，不是有效性**）；`notes[]`、`nextStep{text,source:"chief"|"derived",at}`；`errors[]{source:"tasks"|"run-manifest"|"docs"|"roster"|"modules", message}`；`truncated`；`counts{unclosed,supersededUnclosed,activeUnclosed,blocked,failed,pendingRequests,flows,tasks}`。`counts.unclosed = state.unclosed.length`（含 superseded）；`supersededUnclosed` 为子集；`activeUnclosed = unclosed - supersededUnclosed`；`blocked/failed` 只算活动 flow；`counts.flows/tasks` 是 **加法补充**，不得替代上述口径。 |
| `version-decision/v1` | 事件 `version.decision` 字段：`schema`、`decisionId`、`requestId`、`attempt`、`flowId`、`runId?`、`action`、`recommendedBy:"chief"`、`recommendedAction`、`decidedBy:"customer"|"judge"`、`operatorId?`、`reason`、`status:"executing"|"executed"|"failed"|"uncertain"`、`oldFlowId`、`oldRunId?`、`newFlowId?`、`newRunId?`、`targetVersions?: Record<string, number>`（kind→目标版本）、`closedRunIds?`、`orphanedRequestIds?`、`supersededTaskIds?`、`message?`。动作 id 固定 `version-modify`/`new-version-development`。`VersionDecisionResult` 含 `ok/code?/message/decisionId?/action?/flowId?/runId?/targetVersions?/newFlowId?/newRunId?/closedRunIds?/orphanedRequestIds?/runAnchor?:"created"|"existing"|"unavailable"`。 |
| 错误码（恰 11 项，措辞固定） | `version-decision-invalid`、`flow-not-found`、`run-ambiguous`、`run-change-required`、`decision-pending`、`channel-unavailable`（发卡前无通道）、`decision-declined`、`decision-unavailable`（已发卡后超时/不可用）、`initiator-aborted`、`execution-failed`、`execution-uncertain`。A0 当前摘要只点名 5 项，须补全；A1/A2 不得另造同义码。 |
| task-state 加法 | kind 白名单新增 `project.focus`/`project.note`/`version.decision`；`project.focus` 字段 `flowId?（cleared 时可省）/runId?/note?/roleId:"chief"|"application"/sourceDecisionId?/cleared?`；`project.note` 字段 `noteKey/noteKind/text/refs?/active/roleId:"chief"`；`version.decision` 见上。`TaskRecord`/`taskStatusOf` 不消费新事件；重放跳过；旧 app 读新 kind 记坏行、不阻塞、不丢数据。 |
| `RequestOrphaned.reason` | `"restart"|"superseded"|"initiator-aborted"`；TS 类型在 `runtime.ts` 扩展。`validateEvent` 校验规则：**给出时必须**是三者之一；**缺失按旧行兼容**（现有写侧始终写 `reason`，历史只有 `restart`；坏行跳过不阻塞）。 |
| 工具 schema | 工具名 `project_state`/`project_note`/`request_version_decision`；`project_state` 入参仅可选 `flowId`（**不接受 roleId**，裁剪域由会话身份注入）；`project_note` 严格 op 白名单 `set-focus|blocker|next-step`；`request_version_decision` 入参 `flowId/runId?/action/reason/refs?`。文本上限：reason ≤1000、blocker ≤500、next-step ≤1000、noteKey ≤64、refs ≤5、工具文本 ≤8 KiB。注入面：`project_state` 给全部内置治理角色（chief 完整、其余裁剪，含旧 su 只读）；`project_note`/`request_version_decision` 只给 trio chief；项目 worker 无。 |
| 能力命名 | `GovernedToolsOptions` 字段固定 `projectState`/`projectNote`/`requestVersionDecision`（与 `roleStatus`/`contractCheck` 同风格）；`SessionManager` 方法名 `projectStateView`；不采用 `projectStateView` 作为能力位名。 |
| 依赖方向 | `src/model/project-state.ts` **不 import** `runtime.ts`、也不 import `src/common/编排/**`；`runtime.ts` 可单向 `import type` project-state 的枚举/常量；三种事件的**接口与 kind 判别**定义在 runtime.ts。禁止 type-only 双向循环。 |
| IPC | `project-state:get`，入参 `{projectRoot: string}`，返回**总是** `ProjectStateView`（非法/空 root 返回空视图 + `errors[]`，不抛）；preload 仅新增 `getProjectState(input)`；`project:note`/`version-decision:request` 本任务不暴露写桥（§七 A2-4）。 |
| executionMode | `project_note`、`request_version_decision` = `"sequential"`（账本写入/发卡必须同批串行）；`project_state` 可省略（纯读，同 `read_file`）。 |

### 3.2 四份提案之间的不一致（须按上表对齐）

| # | 不一致 | A0 | A1 | A2 | A4 | 冻结裁决 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | 事件形状归属 | payload 放 `project-state.ts`，runtime type-only import | 假定 runtime 联合可用 | 假定可用 | 只读 | 事件接口必须在 `runtime.ts`；project-state 只放枚举/常量/视图类型 |
| C2 | 能力命名 | 问 `projectState` vs `projectStateView` | 用 `projectState` | 未表态 | 未表态 | `projectState` 能力位；`projectStateView` 只作会话方法名 |
| C3 | 错误码集合 | 只点名 5/11 | 未逐项 | 未逐项 | 未逐项 | 以 §3.1 恰 11 项为准；`channel-unavailable` 与 `decision-unavailable` 分开 |
| C4 | `Evidence.status`/`Error.source` | 未冻结 | 问 PM | 未涉及 | 需要展示 | `present|missing`、三种 evidence kind、五类 error source；只是指针 |
| C5 | `counts.flows/tasks` | 补充字段 | builder 输出 | 未用 | 只用 `counts.*` | 保留为加法字段；不得改变 F4 口径 |
| C6 | `noteEventId` | 回执含 `noteEventId?` | 未涉及 | 问 PM | 未涉及 | 删除；回执 `{ok, message, at?}` |
| C7 | AbortSignal 位置 | metadata 含 AbortSignal | 未涉及 | lifecycle 需要 | 未涉及 | 第二位置参数 `(input, signal?)`（`ShellEscalationFn` 先例） |
| C8 | requestId 公式 | 未涉及 | `versionDecisionRequestId`/attempt | `runId|flowId+时间+8hex` | 未涉及 | `version-decision-<runId|flow-<flowId>>-<base36 时间>-<8hex>`；pending 按已知 id 结构化匹配 |
| C9 | 工具文本归属 | tool 层 8 KiB 截断 | `renderProjectStateSummary` ≤8 KiB | 原样转达 | 无 | A1 生成有界摘要；A0 工具层再做硬上限防御；不二次派生 |
| C10 | `project_state` 给谁 | chief 完整/其他裁剪/worker 无 | `builtInGovernance` | 未涉及 | 未涉及 | 内置治理角色（含旧 su）只读裁剪；worker 无；写工具仅 chief |
| C11 | `ProjectStateTask` 镜像 | 结构性投影、不 import | 同 | 未涉及 | 类型 import A0 | 镜像 + A1 类型兼容测试；不得 import 编排 |
| C12 | 新文件写集 | B-1 已列 | 两新文件已列 | 承接 B-2 已列 | `project-state-view.ts` **未列** | 不得创建；走沟通/客户或列内替代（§四.2） |
| C13 | 版本决策系统行 | 未涉及 | 未涉及 | 不走通用 `[系统·申请]` | 未涉及 | 仅 resolved 一条 `[系统·版本决策]`；created/presented 不发系统通知（`request.notified` 也只留 resolved） |
| C14 | `VersionDecisionCard` 选项标签来源 | Model 类型 | builder 接收注入 labels | 用 A1 卡 | 渲染由 DecisionDialog 既有 | 标签经 `translate`/注入，key 家族 `ui.versionDecision.*`；A3 冻结 |

## 四、写集核对（团队计划 §4.1/§4.3）与越界结论

### 4.1 逐路径核对

| 提案 | 路径 | 团队计划状态 | 结论 |
| --- | --- | --- | --- |
| A0 | `src/model/project-state.ts`（新） | B-1 已列（闸门 2 已确认、H1 已落地） | 在写集内；P1 通过后可创建 |
| A0 | `src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts` | 单文件已列 | 在写集内 |
| A1 | `src/common/编排/{task-state,project-state,version-decision}.ts`、`src/pipeline/orchestration/run-role.ts` | 目录/单文件已列 | 在写集内 |
| A1 | `test/编排/{project-state,version-decision,task-state,run-manifest,decision-card}.test.ts` | 目录已列（5 文件） | 在写集内 |
| A1 | `run-manifest.ts`、`decision-card.ts` | 目录但**默认只读** | 不得改；R1 的 partial scan 放 project-state.ts；如必须改须 P1 报告 + 语义不变证据 |
| A2 | `app/desktop/{session,interface}.ts`、`app/main.ts`、`app/preload.cjs` | 目录/单文件已列 | 在写集内 |
| A2 | `test/桌面应用/{project-state,version-decision}.test.ts`（新，B-2）、`chief-workflow.test.ts`（扩展） | B-2 已确认、H1 已落地；chief-workflow 单文件 | 在写集内 |
| A2 | `test/桌面应用/run-change*.test.ts` | 只读回归 | 不得改 |
| A4 | `app/renderer/src/chat/TaskCenterPanel.tsx`、`ProjectStatePanel.tsx`（新）、`lib/platform.ts`、`shell/shell.css` | 目录已列 | 在写集内 |
| A4 | `app/renderer/src/chat/ipc.ts` | 仅「现有刷新钩子不足时按需」 | 本提案预期零改，符合 |
| A4 | `test/桌面UI/project-state.test.ts`（新）、`phase4b-electron-smoke.mjs`、`phase4b-smoke-preload.cjs` | 目录已列（条件/按需） | 在写集内；phase4b 只由桌面UI写，A5 只改 README |
| A4 | **`app/renderer/src/chat/project-state-view.ts`（新）** | **未列** | **越界（§八.11）**：不得自行创建，见 §4.2 |
| A4 | `shell/phase4a.css`、`phase4b.css` | 未列 | 不得改；CSS 只落 `shell.css` |

### 4.2 A4 新增 `project-state-view.ts` 的 §八.11 结论

- **是否必要**：对**产品行为**不必要——面板/解析逻辑可放在已列的 `ProjectStatePanel.tsx` 或 `lib/platform.ts`；只对「Node 可执行的纯视图单测」必要。仓库确有 `run-change-view.ts` + `test/桌面UI/run-change-view.test.ts` 先例，但该路径是**当时任务写集**明确列入的，不能自动类推到本任务。
- **列内替代**：(a) 把纯解析/视图函数放 `app/renderer/src/lib/platform.ts`——该文件在写集内，模块只在函数内读 `window.desktop`，可被 Node 导入；缺点是混入非桥逻辑，但无需重开闸门；(b) 全部放 `ProjectStatePanel.tsx`——在写集内，但 Node 不能执行 `.tsx`，`test/桌面UI/project-state.test.ts` 只能做源码守卫，渲染/计数一致性须由真实 E2E 与 A3 DOM 证据补足，证据强度较弱（V1 §2.2 要求实际行为，不能只靠字段/源码存在）。(c) `ipc.ts` 虽在写集但仅限「现有刷新钩子不足时按需改」；面板已可复用 `paneVersions` 刷新，不构成该条件，不能作为纯逻辑落点。
- **是否需沟通向客户重开闸门 2**：**是**。若 A4 坚持新增该文件，必须由沟通把「精确新增路径 `app/renderer/src/chat/project-state-view.ts`（桌面UI 目录内、无新依赖、仅纯函数）」作为写集加法提交客户确认；风险档位仍 T3，不新增角色/权限，但不确认前不得创建。**项目管理不自行批准该越界。**
- 建议：优先采用 (a) `platform.ts` 纯函数方案，避免为测试便利重开闸门；若客户同意新增文件，按 `run-change-view.ts` 先例在 A4 记录中列明。

### 4.3 A2 IPC 面裁决（写集内但收窄）

- `project-state:get` 是 V1 AC-1.1/AC-7.3 必需，按 §3.1 冻结。
- `project:note`/`version-decision:request` 虽出现在团队计划 A2 写集括号内，但设计 §6.1 标注 `project:note` 为「可选」、`version-decision:request` 为「若 UI 入口需要」；O4（面板写操作）未选。若向渲染层暴露可写 IPC，会形成**不经幕僚会话**的写路径（渲染层无 chief 身份），属于权限面扩大。**本审核裁决：本任务不向 preload 暴露这两个写桥，也不在 main 注册它们**；note/version 动作只经幕僚工具能力。这是对团队计划括号项的**收窄**，请沟通记录；如客户/后续 O4 需要，另开变更。

## 五、R1–R5 与 AC-1–AC-10 覆盖与缺口

### 5.1 R1–R5

| 核对项 | 现有映射 | 缺口（必须补） | owner |
| --- | --- | --- | --- |
| R1 部分扫描/active 派生 | A1 `project-state`（坏+好 manifest、derive）；A2 前置用 partial | A2 补「与 focus flow 无关的坏 manifest 不阻断版本决策**前置**」桌面级用例（R1-e）；A1 断言视图路径不调用 `findActiveRun`/`listRunManifestsResult`；`run-manifest.ts` 零改动哈希/diff | A1/A2 |
| R2 超时 vs 中止 | A1 answer 映射；A2 拒/超时/中止/晚到 | A1 纯逻辑必须分别覆盖 `timeout`/`unavailable`/`initiator-aborted`/`late` 四类；A2 断言 abort 路径**无** `request.resolved`、无 `version.decision`，timeout/unavailable 有 resolved 无 version.decision | A1/A2 |
| R3 执行期 pinned / F5 排除 | A1 执行计划 pinned failed；A2 pinned fail-closed/恢复 | A2 补「执行期 pinned failed 不被 F5 误判 uncertain」「已 orphaned 不进入 resolved-without-execution 扫描」；A1 补 F5 扫描条件纯逻辑 | A1/A2 |
| R4 全部活动 run | A1 plan closedRunIds；A2 多 draft 全关 | A2 补「请求只带一个 runId 仍关闭全部」「`closeReason` 含 `superseded-by:<new>/<new>`」「关闭阶段并发 pinned/失败 → 停止其余 + failed/uncertain 如实」 | A2 |
| R5 快照引用 | P1.2/沟通/本记录已区分 | 无实施缺口；E2 按 V1 §4.5 核对 | 策划/沟通/D1 |

### 5.2 AC-1–AC-10 缺口清单（按提案）

| AC | 已有映射 | 缺口（须补测试/证据） | owner |
| --- | --- | --- | --- |
| AC-1 | A1 全字段/坏+好 manifest/裁剪/有界/零写；A2 IPC/8 KiB；A4 面板/计数 | ①A1 补坏账本行数准确性；②A2 补 `project_state` 工具文本原文与字节数（≤8 KiB）证据；③A1/A2 补「不产生 `.ans/state/project*.json`」前后文件清单；④A1 补 focus `cleared` 后不再派生、多候选不猜 `-c` 的正反例；⑤A4 补 `errors[]`/`truncated` 如实显示（不假造） | A1/A2/A4 |
| AC-2 | A2 notes/幂等；A1 校验 | ①A2 补 blocker/next-step 超长拒绝、refs>5 拒绝、`active:false` 解除、同 key 幂等；②A2 补备注写入前后任务/run/文档哈希不变（AC-2.3）；③A2 补重启后 focus/notes 重建（AC-2.4）；④A2 补 set-focus 的 runId 不属于 flow 时拒绝 | A1/A2 |
| AC-3 | A1 参数/卡/requestId/attempt；A2 发卡/拒/超时/中止/通知 | ①A2 补「第二次未决时重启按 requestId 独立 orphan/resolve」；②A2 补 `requestNotifiedKeys` 不吞新请求通知的断言；③A1/A2 补 `request.created→presented→resolved` 完整序列（执行路径）；④A2 补 `channel-unavailable`（发卡前）与 `decision-unavailable`（发卡后）区分 | A1/A2 |
| AC-4 | A2 版本修改；A1 targetVersions | ①A1 补「不存在 kind 按 v1 建议」；②A2 补「不自动 pin/激活」断言；③A2/ D1 跑 `versioned-doc-guard` 回归（AC-4.4） | A1/A2/D1 |
| AC-5 | A2 新版本开发/多 draft/pinned；A1 计划 | ①A2 补命名 `-next/-next2`/超长 `-n2`/非法 fail-closed；②A2 补「关闭阶段失败/并发 pinned」部分失败；③A2 补旧未收口任务不自动 closed、旧文档/任务/manifest 哈希不变；④A2 补执行前 pinned 零创建/零关闭/零 orphan；⑤A1 补 `closedRunIds` 与 partial scan 一致 | A1/A2 |
| AC-6 | A2 run-change 只读；D1 | 既有验收/证据/写守卫套件与受保护文件零改动由 D1 记录；A1/A2 不得改 `run-manifest.ts`/`decision-card.ts`/`evidence_check` | D1/A1/A2 |
| AC-7 | A1 审计；A2 系统行；A4 UI 同源/i18n | ①A2 补系统行全文：请求/决定/拒绝/执行结果/部分失败、judge 代批措辞、created/presented 不刷屏；②A4 补 `counts.unclosed === listTasks().unclosed` 断言与 superseded/active 差值；③A3/A4 补两语言无中文泄漏 | A2/A4/A3 |
| AC-8 | A1 轮转/旧白名单；A2 恢复 | ①A1 补轮转后 focus 回退 derived/none；②A2 补「executing 对账不重复创建第二个 flow」；③A2 补「resolved 已写、无 version.decision」崩溃窗口写 `uncertain`（`resolved-without-execution-record`）并通知；④A2 补部分失败 `failed/uncertain` 记录 | A1/A2 |
| AC-9 | A1/A2/A4 各自 typecheck；D1 | ①A1/A2 记录 `npm run typecheck` 退出码；②A4 记录 `typecheck:renderer`/`build:renderer`；③D1 记录 T3 全量（排除 `write-sequencing.test.ts` 并记原因）；④A0 无自身行为测试，须由 A1/A2 覆盖并记录（P1 可接受） | A0/A1/A2/A4/D1 |
| AC-10 | A0 工具描述；P1.2/沟通 | ①A0 三工具描述含「只读/申请≠批准/路线≠内容批准/不写文档不派发」原文；②A5 README 中英事件清单（不在四份提案内，按团队计划）；③角色卡零改动（除 H1） | A0/A5/D1 |

### 5.3 四份提案测试映射的总体评价

- A1/A2 的测试映射对 R1–R4、AC-1/3/5/8 的主体覆盖较好；主要缺口集中在**桌面级恢复/并发/系统行/命名边界**与**纯逻辑四类答案**，按 §5.1/§5.2 补齐即可，不改变方案/写集。
- A0 只有 `npm run typecheck`；Model 契约由 A1/A2 测试间接覆盖，可接受，但 A0 必须给出 `describeTool` 三支与注入矩阵的构造证据（A2 `chief-workflow`/`tools.test` 只读执行可转引）。
- A4 的 UI 测试能否覆盖「只读/同源/计数」取决于 §4.2 的写集路径选择；若走 `.tsx` + 源码守卫，必须用真实 E2E 补实际行为证据，不能把源码守卫当渲染证据。

## 六、i18n key 合并、去重与 A3 计划（自检披露）

- **Authorship disclosure**：A3 是审核者（项目管理）自身角色的 i18n 实施计划；本节是**作者自检/冻结建议**，不是独立审核。A3 的实施/验证仍由 A3 自身测试、D1/E2 覆盖。
- **复用既有 key（不新增）**：`ui.run.state.draft/pinned/closed/cancelled/legacy`（run 状态）、`shared.common.failed`/`completed`/`truncated`/`unknown`/`none`/`notReported`、`ui.taskCenter.unclosed`、`ui.governance.status.blocked`、`ui.work.reportStatus.blocked`。**不重复**为这些含义新建 key。
- **命名统一**：面板/卡片/证据/版本一律 `ui.projectState.*`；版本决策卡面 `ui.versionDecision.*`；主进程系统行/回执/错误码 `main.versionDecision.*`。禁止 `ui.project-state`、`ui.taskState`、`ui.globalState` 等别名。
- **冻结 key 家族与数量**（A3 必须按此实现；改名/增删须回项目管理更新本节与 `i18n.test.ts`）：

| 家族 | 数量 | key 清单 |
| --- | --- | --- |
| `ui.projectState.*` | **62** | `title`、`refresh`、`readOnly`、`empty`、`loadError`、`unavailable`、`schemaUnsupported`、`truncated`、`errors`、`pinnedHint`、`focus.label`、`focus.none`、`focus.stale`、`focus.derived`、`focus.application`、`focus.stageUndefined`、`focus.updatedAt`、`badge.unclosed`、`badge.blocked`、`badge.failed`、`badge.pendingRequests`、`section.flows`、`section.tasks`、`section.blockers`、`section.versions`、`section.evidence`、`section.nextStep`、`flow.superseded`、`flow.taskCounts`、`flow.runs`、`blocker.kind.taskBlocked`、`blocker.kind.taskFailed`、`blocker.kind.requestPending`、`blocker.kind.acceptanceRework`、`blocker.kind.redispatchExhausted`、`blocker.kind.versionDrift`、`blocker.kind.referenceInvalid`、`blocker.kind.runAmbiguous`、`blocker.kind.focusStale`、`blocker.kind.chiefNote`、`blocker.source.app`、`blocker.source.chief`、`evidence.kind.acceptanceCard`、`evidence.kind.verifierReport`、`evidence.kind.taskEvidence`、`evidence.status.present`、`evidence.status.missing`、`version.latest`、`version.pinned`、`version.newerThanPinned`、`version.missing`、`version.docKind.intent`、`version.docKind.proposal`、`version.docKind.modules`、`version.docKind.roster`、`version.docKind.topology`、`version.docKind.architecture`、`version.docKind.assets`、`nextStep.source.chief`、`nextStep.source.derived`、`note.kind.blocker`、`note.kind.nextStep` |
| `ui.versionDecision.*` | **18** | `title`、`question`、`option.versionModify`、`option.newVersionDevelopment`、`disclaimer`、`fact.header`、`fact.unclosed`、`fact.blockedFailed`、`fact.pendingRequests`、`fact.acceptanceReworks`、`fact.latestVsPinned`、`fact.previousDecisions`、`decidedBy.customer`、`decidedBy.judge`、`status.executing`、`status.executed`、`status.failed`、`status.uncertain` |
| `main.versionDecision.*` | **17** | `presented`、`notifiedResolved`、`executed.versionModify`、`executed.newVersion`、`declined`、`unavailable`、`aborted`、`partialFailed`、`uncertain`、`error.versionDecisionInvalid`、`error.flowNotFound`、`error.runAmbiguous`、`error.runChangeRequired`、`error.decisionPending`、`error.channelUnavailable`、`error.executionFailed`、`error.executionUncertain` |

- **占位符核对**：`ui.projectState.badge.unclosed/blocked/failed/pendingRequests`、`ui.projectState.errors`、`ui.projectState.flow.runs` 用 `{count}`；`ui.projectState.flow.taskCounts` 用 `{unclosed}/{blocked}/{failed}`；`focus.updatedAt` 用 `{time}`；`version.latest`/`version.pinned` 用 `{version}`；`main.versionDecision.executed.versionModify` 用 `{flowId}/{targets}`；`executed.newVersion` 用 `{oldFlowId}/{newFlowId}/{newRunId}`；`partialFailed`/`error.*` 视需要 `{detail}`。zh/en 占位符集合必须逐 key 相等；英文零 Han；计数用复数模板（`{ one, other }`/`{ other }`）。
- **计数变更（供 A3 更新 `i18n.test.ts`）**：当前 `ui 921 / main 559 / shared 62 / preferences 3 = 1545`；新增 62 `ui.projectState.*` + 18 `ui.versionDecision.*` + 17 `main.versionDecision.*` → 预期 `ui 1001 / main 576 / shared 62 / preferences 3 = 1642`。若 A2/A4 实施需要不同 key，A3 必须回项目管理先更新本节与计数，不得静默加减。
- **A3 冻结时机**：按团队计划，A3 在 P1 后可并行；但 A4 依赖 A3 key 冻结。本审核建议 **A3 在 A3 阶段按上表一次性冻结**，并在实施记录中列实际 key 集与计数；本 P1 记录不代替 A3 实现记录。

## 七、逐条裁决（四份提案「需 PM 裁决」共 31 点）

> 结论类型：**技术裁决**（PM 可定，写入本记录即生效）/ **交沟通或客户**（范围/权限/写集事项，PM 不自批）。

### 7.1 A0（9 点）

| ID | 问题 | 裁决 | 类型/owner |
| --- | --- | --- | --- |
| A0-1 | 能力命名 `projectState` vs `projectStateView` | 能力位用 `projectState`（字段名即契约，与 `roleStatus` 同风格）；`projectStateView` 仅作 `SessionManager` 方法名，避免同名混淆 | 技术裁决 / A0 |
| A0-2 | 事件 payload 放 `project-state.ts`、runtime type-only import 的依赖方向 | **需改**：事件接口（含 `kind`/`v`/`at`）定义在 `runtime.ts` 并加入 `TaskStateEvent`；`project-state.ts` 只放枚举/常量/视图类型，且不 import runtime；runtime 可单向 type-import project-state 的枚举；禁止双向循环 | 技术裁决 / A0 |
| A0-3 | `reason` 白名单是否需 A1 validate 校验 | 需要：`reason` 给出时必须是 `restart|superseded|initiator-aborted`；缺失按旧行兼容；未知值记坏行（不阻塞）。TS 类型同步 | 技术裁决 / A0+A1 |
| A0-4 | `ProjectStateTask` 结构镜像的字段漂移 | 采用结构镜像（Model 不得 import 编排）；A1 在 `test/编排/project-state.test.ts` 加双向可赋值类型断言（共享字段集）防漂移；完整字段 = `TaskCardView` + `from/blocked/failed/redispatchCount` | 技术裁决 / A0+A1 |
| A0-5 | `Error.source`/`Evidence.status` 未冻结、`counts.flows/tasks` 为补充 | 冻结 `Error.source ∈ {tasks,run-manifest,docs,roster,modules}`、`Evidence.status ∈ {present,missing}`；`counts.flows/tasks` 保留为加法字段，不改变 F4 口径；`pendingRequests` 保留 | 技术裁决 / A0 |
| A0-6 | `AbortSignal` 是否随 metadata | 不随 metadata；用第二位置参数 `(input, signal?: AbortSignal)`（`ShellEscalationFn` 先例）；工具层 `raceAbort` + 调用前 `aborted` 检查；会话层据此区分发起中止 | 技术裁决 / A0+A2 |
| A0-7 | `executionMode:"sequential"` | `project_note`/`request_version_decision` = sequential（同批串行写账/发卡）；`project_state` 可省略（纯读） | 技术裁决 / A0 |
| A0-8 | `project_state` 回执形状与文本投影归属 | Fn 返回 `{ok, text?, message?}`（同 `WatchdogToolResult`）；A1 生成 ≤8 KiB 摘要；A0 工具层再做硬截断/标注；不二次派生 | 技术裁决 / A0+A1 |
| A0-9 | 常量唯一来源 | `PROJECT_STATE_SCHEMA`/`VERSION_DECISION_SCHEMA`/动作/上限/枚举全部在 `project-state.ts`；runtime/tools/编排/桌面/UI 只 import，不复制字面量 | 技术裁决 / A0 |

### 7.2 A1（8 点）

| ID | 问题 | 裁决 | 类型/owner |
| --- | --- | --- | --- |
| A1-1 | 能力形状与 A0 边界 | 按 A0 冻结的 Fn 签名透传三个能力；`AdapterCapabilities`/`RunRoleInput` 加法；`projectState` 给 `builtInGovernance`，另两仅 trio chief；不改其他透传/顺序 | 技术裁决 / A1 |
| A1-2 | `project_state` 是否给 legacy su/single | 给：内置治理角色（含旧 su）只读裁剪工具；**不给** `project_note`/`request_version_decision`（O10 未选） | 技术裁决 / A1 |
| A1-3 | scan 放 `project-state.ts` 还是 `run-manifest.ts` | 放 `src/common/编排/project-state.ts`（团队计划默认）；`run-manifest.ts` 默认只读；若实施必须改，需 P1 报告 + `listRunManifestsResult` 语义不变证据 | 技术裁决 / A1 |
| A1-4 | 有界数值 | 冻结 50 flows / 500 tasks / 每 flow 20 versions / 50 evidence / 工具文本 8 KiB；超出 `truncated=true` 且保留计数；不得改小/改大 | 技术裁决 / A1 |
| A1-5 | `acceptance-rework` 缺机器关联字段（拟只统计 acceptance reject） | 接受收窄：只按 `request.created(cardKind="acceptance")` + `request.resolved` reject 派生；可选加 `task.closed(outcome="rework")` 机器事实；**禁止**文本匹配/猜意图；在 A1 记录与 E1/E2 披露该收窄（设计 §3.4 的「或未收口返工任务」不实现） | 技术裁决 / A1 |
| A1-6 | `version-modify` 执行期 pinned 是否与 new-version 统一 failed | 统一：执行前重读活动 run，发现 pinned → `version.decision(status:"failed", message:"run-change-required")`，零执行（不 ensure/不改文档/不写目标版本）；补测试 | 技术裁决 / A1+A2 |
| A1-7 | 非法答案的账本处置 | 非法/未知选项 = 未获有效选择：零执行；`request.resolved` 归一化 `choice:"declined"` + `reason:"invalid-selection"`（有界）；**不写** `version.decision`；只记诊断/角色日志；F5 不把它当 answered | 技术裁决 / A1+A2 |
| A1-8 | `evidence` status 枚举与路径 | `kind` 三种、`status:"present"|"missing"`；路径只来自账本结构化字段、约定 `docs/quality/<flowId>-report-v1.md` 存在性与任务 `requestedEvidence/modulePaths`；不读正文、不判有效性 | 技术裁决 / A1 |

### 7.3 A2（6 点）

| ID | 问题 | 裁决 | 类型/owner |
| --- | --- | --- | --- |
| A2-1 | `withRequestLifecycle` 变体 | 用**可选参数**（如 `{ notify?: "default"|"resolved-only"|"none"; signal?: AbortSignal }`）而非新方法；缺省逐字不变（既有 `run-change`/验收/升级测试必须全绿）；abort 时抑制 `request.resolved` 与 created/presented 通用通知，写 `request.orphaned(initiator-aborted)`；晚到答案只诊断 | 技术裁决 / A2 |
| A2-2 | 无 run 时 requestId 用 flowId 段 | 可以：`version-decision-flow-<flowId>-<base36>-<8hex>`；有 run 用 `version-decision-<runId>-<base36>-<8hex>`；pending 检测按**已知 runId/flowId 结构化匹配**（不用裸前缀），补一个 runId 为另一 runId 前缀的碰撞测试 | 技术裁决 / A2 |
| A2-3 | 执行侧 `ensureDraftRun`/`closeRun` 内部 all-or-nothing，是否由 A1 提供 partial-aware 助手 | **代码事实修正**：`closeRun` 只读目标 run manifest，**不是** all-or-nothing；`ensureDraftRun` 经 `findActiveRun` 是全有或全无。裁决：**不新增** partial-aware 助手（避免复制 run 生命周期/偏离设计 §4.6「ensureDraftRun」）；关闭旧 run 可逐个 `closeRun`（不受无关坏 manifest 影响）；创建侧遇无关坏 manifest → `execution-failed` 如实记录（不是 `run-ambiguous`）。若 V1/E2 要求执行侧也容忍无关坏 manifest，属标准解释/范围问题，停止澄清，不自行扩 | 技术裁决（含停止点）/ A1+A2 |
| A2-4 | preload 是否暴露 note/version 两写桥（O4 未选、UI 不调用） | **不暴露**：本任务 preload 只加 `getProjectState`；`project:note`/`version-decision:request` 不注册 IPC（写路径只经幕僚工具）；这是对团队计划 A2 括号项的收窄，交沟通记录 | 技术裁决 + 交沟通记录 / A2 |
| A2-5 | `noteEventId` 无事件 id | 删除该字段；回执 `{ok, message, at?}`；审计用 `at`+`noteKey`+`roleId` 核对（AC-2.4 不要求事件 id） | 技术裁决 / A0+A2 |
| A2-6 | 版本决策系统行不走通用 `[系统·申请]` | 是：`request.notified` 只留 resolved；系统行只发一条 `[系统·版本决策]`（含客户/判断代批与执行结果）；created/presented 不发系统通知 | 技术裁决 / A2 |

### 7.4 A4（8 点）

| ID | 问题 | 裁决 | 类型/owner |
| --- | --- | --- | --- |
| A4-1 | `project-state-view.ts` 写集缺口 | **不批准自行新增**；按 §4.2：优先 `lib/platform.ts` 纯函数（列内）；否则沟通→客户重开闸门 2 加精确路径；`.tsx` + 源码守卫 + E2E 也可但证据较弱 | 交沟通/客户 / A4 |
| A4-2 | A2 契约未冻结（桥名/入参/返回） | 冻结：preload `getProjectState({projectRoot})` → IPC `project-state:get` → `ProjectStateView`（`project-state/v1`）；非法 root 返回空视图+errors；A2 在先冻结后 A4 才写面板 | 技术裁决 / A2+A4 |
| A4-3 | 最小字段（`taskCounts`/`counts.pendingRequests`） | 冻结 `counts.pendingRequests` 与 `flows[].taskCounts{unclosed,blocked,failed}`（§3.1）；UI 只用 `counts.*`，不本地派生 | 技术裁决 / A0+A1+A4 |
| A4-4 | CSS 落点 `shell.css` vs `phase4a.css` | 只落 `app/renderer/src/shell/shell.css`（写集内）；`phase4a.css`/`phase4b.css` 未列，不得改 | 技术裁决 / A4 |
| A4-5 | 面板位置/默认收起 | `TaskCenterPanel` 顶部；一行 focus + 徽标常显；`<details>` 默认收起；刷新按钮；不新增路由/页面（O1 未选） | 技术裁决 / A4 |
| A4-6 | pinned 提示 vs 按钮 | 只提示（徽标/`pinnedHint` 指向既有 run-change 入口）；**不新增**按钮（O4/O5 未选，面板只读） | 技术裁决 / A4 |
| A4-7 | `projectNote` 桥类型是否保留 | 不保留：`platform.ts` 只加 `getProjectState?`；`projectNote?` 待 O4/后续变更再加 | 技术裁决 / A4 |
| A4-8 | E2E 夹具范围 | 最小：现有 `phase4b-electron-smoke.mjs`/`phase4b-smoke-preload.cjs` 按需加状态区断言（IPC 调用次数、零写桥、截图）；不新建 e2e 脚本；phase4b 单写者=桌面UI，A5 只改 README；D1 用当前候选重建后运行 | 技术裁决 / A4+A5+D1 |

## 八、未解决项、限制与复审要求

1. **提案未落盘**：四份提案由沟通转交、仓库无原文，无法给出对象哈希。请沟通在 A0–A2/A4 开工前将转交文本归档（`docs/communication/` 或各角色 `docs/change/`，管理记录不混入产品候选），并在沟通记录中登记；任何提案文本变更须重新核对受影响项。此项不改变 P1 结论，但影响证据可复算性。
2. **A4 写集缺口**：`project-state-view.ts` 未获批准；在沟通/客户结论前 A4 不得创建该文件，也不得用未列路径变通。
3. **A2 IPC 收窄**：`project:note`/`version-decision:request` 不注册 IPC/preload；请沟通记录该收窄（不是权限扩大）。
4. **A2-3 执行侧残留**：`ensureDraftRun` 的 all-or-nothing 在无关坏 manifest 存在时可能使执行失败；本审核接受「如实 `execution-failed`」，并披露为已知限制。若 V1 所有者把 R1-e 解释为执行侧也必须容忍，停止实施并澄清，不自行扩大。
5. **A1-5 收窄**：`acceptance-rework` 只按 acceptance reject（可选 `task.closed(rework)`）派生；在 A1 实施记录与 E1/E2 中披露，不得声称实现了设计 §3.4 的「未收口返工任务」分支。
6. **未验证**：未运行任何测试/应用/E2E；未验证 `withRequestLifecycle` 变体在真实中止、通知去重、恢复窗口下的行为；未验证 Electron/IPC/preload/渲染；未验证 i18n 计数/文案实际。以上由 A0–A4/D1/E2 验证。
7. **复审方式**：各 owner 提交窄修订说明（逐条对应 §二/§七），列出受影响文件与测试；项目管理按受影响项复审并更新本记录（新行数/SHA-256）；A4 复审还须附写集结论（客户确认或列内替代选择）。复审通过前不进入实施。
8. **停止条件**：若修订触及方案范围、写集/边界、T3、验收/证据/写权/闸门，立即停止并回报统筹/沟通，按方案 §10.3/团队计划 §5.4 重开闸门 1/2；不得以本记录代替客户确认。

## 九、总体结论

**`needs revision`。**

- 四份提案的方向、角色归属与写集主体符合已确认 P1.2/V1/团队计划；未发现范围扩张或 T3 变化。A0/A1/A2 的问题是可窄修订的契约/语义/测试缺口；A4 的 `project-state-view.ts` 是**写集越界**，必须交沟通/客户（或改用列内替代），PM 不自批。
- **返工 owner**：A0（事件归属/错误码/回执/信号/字段冻结）、A1（执行期 pinned/非法答案/scan 形状/acceptance-rework/证据枚举）、A2（IPC 收窄/requestId 匹配/lifecycle 变体/系统行/测试缺口）、A4（写集路径/依赖 A2 冻结/CSS/只读边界/platform 类型）；A3 按 §六 冻结 key（作者自检，不虚构独立审核）。
- **需沟通/客户确认事项**：
  1. A4 `app/renderer/src/chat/project-state-view.ts` 新增路径（写集加法；T3 不变）——客户确认后才能创建；否则用 `lib/platform.ts` 纯函数替代。
  2. A2 IPC 收窄（不暴露 `project:note`/`version-decision:request` 写桥）——请沟通记录。
  3. 四份提案原文归档与版本登记——请沟通办理。
  4. A1-5 的 `acceptance-rework` 收窄与 A2-3 的执行侧残留——请沟通/独立验收在 E1/E2 知悉；若 V1 解释不同，停止澄清。
- 本审核**不代替** V1、实施授权、D1 测试或独立验收，也不授权 commit/push/merge/release。复审通过后按团队计划 G2 → A0 → A1 → A2（A3 并行）→ A4 → A5 → D1 → E1 → E2 → E3 执行。

---

**本文件状态：P1 审核记录；总体结论 `needs revision`；未运行测试、未实施、未验收、未 commit/push。**

---

## 复审记录（窄修订 V1，2026-11-02）

- **复审对象**：`docs/communication/2026-11-02_p1-proposals_global-task-state.md`（**454 行 / SHA-256 `cf1eb8942fa93932da3c8cf33e63fa53b1e6c914e35ab414c926b91f1ac33dcd`**）「修订记录」节 A0/A1/A2/A4 各一份；四份均声明未写文件、未 commit。初始 V0 快照（同文件 §A0–§A4）保留作对照。
- **复审方式**：静态只读，逐条对照本记录 §二/§七/§八 的必须修改项、§三 契约冻结、§五 AC/R 缺口；未运行测试/应用/E2E。
- **结论**：**`recommend approval`**。A0/A2/A4 的修订已落实本记录全部必须修改项；A1 除 `ProjectStateError` 一处类型来源外全部落实，该处由本复审给出最终裁决（P1-GTS2-01，A1 实施必须条件），**不需要再次 P1 复审**。**可进入 A0**；A1 开工前须先落实 P1-GTS2-01。本复审结论取代 §九 对 V0 的结论，仅对 V1 修订快照有效。

### 1. 逐项核对

| 提案 | 修订落实（对照原必须修改项） | 结论 |
| --- | --- | --- |
| A0 | 三个事件的接口、`kind` 判别与字段全部在 `src/model/runtime.ts` 并加入 `TaskStateEvent`；`project-state.ts` 不 import runtime，runtime 仅 type-import 枚举（单向无环）。11 错误码、`Error.source` 五值（含 `roster`/`modules`）、`Evidence.kind` 三值/`status` 两值、`Counts` 八字段逐字落实。`ProjectStateTask` 仅结构镜像、不 import 编排。`ProjectNoteResult={ok,message,at?}`。`RequestVersionDecisionFn=(input, signal?)` + 先查 aborted + `raceAbort`。`project_note`/`request_version_decision` sequential，`project_state` 省略。常量单一来源；能力位 `projectState`/`projectNote`/`requestVersionDecision`；`project_state` 入参仅 `flowId`、回执 `{ok,text?,message?}`。 | **通过** |
| A1 | `version-modify` 执行期 pinned 统一 `failed/run-change-required` 零执行；非法答案归一化 `declined` + `reason:"invalid-selection"` + 不写 `version.decision`；`scanRunManifestsForState`/`deriveActiveRunFromManifests` 形状冻结；`acceptance-rework` 机器事实收窄；`buildProjectStateView` 不调用 `findActiveRun`/`listRunManifestsResult`；evidence 冻结；注入范围、有界、类型镜像、测试缺口均补。 | **有条件通过**：P1-GTS2-01（`ProjectStateError` 必须 import A0，禁止本地重定义） |
| A2 | 仅 `project-state:get` IPC + preload `getProjectState`；不暴露 `project:note`/`version-decision:request` 写桥。`withRequestLifecycle` 可选参数（`notify:"default"|"resolved-only"|"none"` + `signal`），缺省逐字不变；abort → 抑制 resolved/通用通知、写 orphaned、晚到丢弃。requestId 有 run/无 run 两式 + 已知 runIds/flowIds 降序最长匹配 + flowId 校验。`closeRun` 逐 run、`ensureDraftRun` all-or-nothing 事实修正，不新增 partial 助手。回执与系统行、测试补充均落实。 | **通过** |
| A4 | 采纳列内替代 (a)：删除 `project-state-view.ts`；纯函数放 `app/renderer/src/lib/platform.ts`（写集内）；`platform.ts` 只加 `getProjectState?`（无 `projectNote?`）；面板只读、顶部、details 默认收起、pinned 只提示、只刷新；计数只用 `counts.*`/`flows[].taskCounts`；两语言 62 key、E2E 最小范围。 | **通过**（附 P1-GTS2-03/04 实施注意） |

### 2. 跨提案不一致裁决（重点）

- **P1-GTS2-01（A1，必须落实）**：A1 修订的 `ProjectStateError={source:"tasks"|"manifest"|"docs"; ref?:string; message:string}` 与本记录 §三/§7.1 A0-5 及 A0 V1 冻结的 `ProjectStateErrorSource="tasks"|"run-manifest"|"docs"|"roster"|"modules"`、`ProjectStateError{source;message;file?;line?}` 不一致（`manifest` vs `run-manifest`、缺 `roster`/`modules`、`ref` vs `file/line`）。**最终裁决：A1 必须 `import type { ProjectStateError } from "../../model/project-state.ts"`（相对路径按实际文件位置）并删除本地定义；`scanRunManifestsForState.errors`、`buildProjectStateView.errors[]` 全部使用 A0 类型。** 映射：账本坏行→`tasks`；manifest 不可读→`run-manifest`；文档扫描→`docs`；roster 解析→`roster`；模块解析→`modules`；`file/line` 按可得事实填，不可得则省略。A1 实施报告须列 import 与 `npm run typecheck` 证据；D1/E1 核对。此项不需要再次 P1 复审。
- A0 `ProjectStateFn(query, metadata?)` 不携带 roleId，与 A2 会话身份注入一致：UI `getProjectState` 内部以 chief scope 取完整视图；工具能力闭包绑定会话 roleId；IPC 入参无 roleId。A2 V1 已按此收窄。
- A2 无 run 的 requestId 用 `version-decision-flow-<flowId>-<base36>-<8hex>`；A1 的 `versionDecisionRequestId(runId, now, hex)` 辅助签名应相应接受无 run subject（或由 A2 直接生成两种），属实施对齐注意，不改契约（P1-GTS2-02）。
- `ProjectStateTask.from`：A0 V0 写作 `from?`、A1 V1 写作必填 `from`；因 `task.created.from` 恒存在，**最终按必填 `from` 对齐**（A0 实施时改为必填或 A1 双向可赋值断言按共享字段集处理），以类型断言结果为准（P1-GTS2-02）。
- `runAnchor`：本复审将 §3.1 的 `"created"|"existing"|"unavailable"` 解释为**仅失败值 `unavailable` 为必需**；成功路径不要求 `created/existing` 枚举。A1/A2 不得依赖未冻结值；如实施需要区分，作为加法字段在实施记录说明。
- A4 V0 §3 的 `counts.unclosed === payload.unclosed.length` 措辞不成立（`ProjectStateView` 无 `unclosed` 数组）；A4 V1 测试已改为「unclosed 同 listTasks」交叉断言。实施按 V1：用 `counts.unclosed` 与任务中心/listTasks fixture 对齐（P1-GTS2-04）。

### 3. AC/R 缺口覆盖（§五 逐项）

- **R1–R5**：R1（A1 §7、A1 测试映射 10、A2 §6 无关坏 manifest 不阻断前置）；R2（A1 四类纯逻辑、A2 三路 lifecycle + 两层测试）；R3（A1 执行期 pinned/`collectResolvedWithoutExecution` 排除 orphaned/已有 decision、A2 `failed` 不误判 + 崩溃窗口）；R4（A1 `closedRunIds` 与 partial scan 一致、A2 多 draft 全关 + `closeReason` + 关闭失败/并发 pinned）；R5（无代码落点，文档口径不变）。**无遗漏。**
- **AC-1–AC-10**：A1 V1 补 AC-1 坏账本行数/cleared 不派生/多候选不猜 `-c`、AC-4 缺失 kind→v1、AC-5 `closedRunIds`、AC-8 轮转后 focus 回退；A2 V1 补 AC-2.3 备注哈希不变/AC-2.4 重启重建/set-focus 拒绝/超长/refs>5、AC-3 第二未决重启/通知不吞/完整序列/channel vs decision-unavailable、AC-5 命名边界/关闭失败/旧产物不变/执行前 pinned 零创建、AC-7.1 系统行、AC-8 恢复不重复建 flow/崩溃窗口 uncertain+通知；A4 V1 补 AC-1.4 UI 展示/AC-7.3 计数/两语言/空态/truncated/errors；AC-6/AC-9/AC-10 由 D1/E1/E2 按计划取证。**未发现 §五 缺口遗漏。**

### 4. i18n key 冻结复述

- 本复审重申 §六 的 **62 个 `ui.projectState.*` + 18 个 `ui.versionDecision.*` + 17 个 `main.versionDecision.*`** 为 A3 冻结清单；A4 V0 §4 的别名列表（如 `focus.line`/`badge.activeUnclosed`/`section.notes`）作废，A4 按 §六 名称消费（P1-GTS2-03）。A4 V1 的「62 key 全量」与 §六 数量一致；A3 仍须更新 `i18n.test.ts` 计数（预期 `ui 1001 / main 576 / shared 62 / preferences 3 = 1642`）。

### 5. 剩余项与复审结论

- **剩余必须项**：仅 **P1-GTS2-01**（A1，`ProjectStateError` 必须 import A0，删除本地定义）。
- **实施注意（非阻断）**：P1-GTS2-02（A1 `versionDecisionRequestId` 无 run subject / `ProjectStateTask.from` 必填对齐）；P1-GTS2-03（A4 按 §六 62 key 名称，不按 V0 §4 别名）；P1-GTS2-04（A4 用 `counts.unclosed` 对 listTasks fixture，不引用不存在的 `payload.unclosed`）。
- **总体**：**`recommend approval`**。**可进入 A0**（A0 不依赖 A1 修订）；A1 开工前须落实 P1-GTS2-01；A2/A4 按团队计划依赖顺序（A4 等 A2 IPC + A3 key 冻结）。若实施中发现与修订文本/本记录不符，停止并回报，不自行扩权。
- 本复审只读；未运行测试/应用/E2E，未改产品/测试/方案/团队计划/沟通/验收/角色卡，未 commit/push。本审核记录更新后的行数与 SHA-256 由沟通/E1 外部登记（避免自指循环）。

**本文件状态：P1 审核记录（V0 结论需修订；V1 窄修订复审结论 `recommend approval`）；未运行测试、未实施、未验收、未 commit/push。**
