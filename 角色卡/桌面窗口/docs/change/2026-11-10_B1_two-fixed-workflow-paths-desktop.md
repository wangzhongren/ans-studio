# 桌面窗口批次变更记录：T3 两条固定工作流路径 B1 派发权/状态机（桌面侧）

- 批次：**B1 派发权/状态机**（团队计划 §三 B1「桌面窗口」行；方案 v1.3 §10.2 B1，路由部分）
- 角色 / 上下文：桌面窗口（roleId `桌面窗口`，独立固定上下文）
- 日期：2026-11-10；worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`；
  分支 `feat/two-fixed-workflow-paths`；HEAD **`24af13d0e13dc577ad3fb6d5975fb5b1314ed85b`**
  （B0 `ee5b330` + B1 编排 `24af13d`；`git status --porcelain -- src app test` 开工时为空）
- 状态：**B1 桌面批次已实现，未提交**；`npm run typecheck` **exit 0**；
  新增桌面测试 **17/17 pass**（`fixed-path-routing` 13 + `workflow-git-port` 4）；
  受影响桌面套件 before/after **失败名集合逐名一致**（无新增确定性失败、无新 skip、既有失败名不变）；
  `routeStarDispatch` 与 HEAD **字节级 identical**（49,853 B / `1beea23b…`）；
  **未 commit / 未 push / 未 merge / 未发布**；未运行真实模型/Electron；未占用 9222/9223。

## 0. 依据绑定（写盘实测 hash）

| 依据 | 路径 | 实测（行 / 字节 / SHA-256） |
| --- | --- | --- |
| B1 验收（冻结，唯一判据） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 / 33,722 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| G-IR 接口评审（merge-main/能力面） | `角色卡/门禁引擎/docs/design/2026-11-10_interface-review_two-fixed-workflow-paths.md` | 344 / — / `08e017269c86d92b68e83c25377ccdf7e86d352391a285b635d9a517b48ca571` |
| 实现级方案 v1.3（冻结） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 / 184,391 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| B1 编排记录（只读；导出面对照） | `角色卡/编排/docs/change/2026-11-10_B1_two-fixed-workflow-paths.md` | 275 / — / `5d058f4c8023904bc57b5fa722e0853ce989c3f3bcf3edba3e70bb256d61d30c` |

本批覆盖的 B1 判据（桌面侧）：**AC-01/AC-02/AC-04/AC-05（会话透传）/AC-12/AC-14（骨架）/AC-22（骨架）/
AC-23（direct 过滤）/AC-27（Q1/Q6 桌面面）**；T-01/T-05 的桌面确定性测试、T-10/T-11 的应用侧骨架。
卡构造/呈现、merge 执行、A1–A13 全链属 **B3**；`dispatch_task` schema/handler、`close_created_task` v2、
`activate_role_documents` v2 属 **B2**；本批只做路由/证据/能力过滤与端口骨架。

## 1. 实施内容（按写集）

### 1.1 `app/desktop/workflow.ts`（新，158 行）：桌面侧 workflow 模式/路由**薄层 + 常量**

- `resolveWorkflowMode(projectRoot, flowId)`：空 flowId ⇒ `legacy`（旧调用入口）；否则**只读委托**编排
  `workflow-service.ts::workflowMode`（单一实现，不复制 per-flow 规则）；异常 ⇒ `legacy`（fail-closed，
  与 run-role 同口径；G-IR §5.1「配置不可解析按 legacy」，不猜 fixed）。**不缓存**项目级单值。
- **B1 启用闸 `isFixedPathEnabledForFlow` / `resolveFixedPathMode`**（legacy 兼容关键）：
  fixed 路由/注入只在该项目**显式** `workflowSchema:"two-fixed-paths/v1"`，或该 flow 已有 fixed workflow
  （`workflow.started`）时启用；其余（缺省/`legacy/v1`/配置不可解析）⇒ 不启用（走 legacy）。依据
  v1.3 §4.1 第 4 条：首次 fixed workflow 启动时由应用原子写 `workflowSchema`（B3）；在此之前旧项目/旧
  夹具一律 legacy（AC-03「legacy 断言不改」；fixed 角色卡/工具面属 B2——提前按 fixed 解析会把既有
  `decision` 等卡按 `fixedCards` 缺失 fail-closed，D1 实测 chief-workflow 真实卡链 18 例失败，加闸后恢复）。
  启用后仍以编排 `workflowMode` 为准（legacy 在飞 flow 继续 legacy）。
- `workflowModeForFlowResolver(projectRoot)`：`openRoleSession` 注入形态（run-role 每次按实际 flowId 解析）。
- `sessionWorkflowModeForTask(projectRoot, taskId)`：会话级模式（与 run-role 同口径：任务 `created.flowId`
  ⇒ 模式；无任务/无 flow ⇒ legacy）——桌面 direct 注入过滤的纵深防御，不替代 run-role 判定。
- `LEGACY_ONLY_DIRECT_CAPABILITIES`/`isLegacyOnlyDirectCapability`：AC-23 冻结的 8 项 legacy 工具名常量
  （`git_query`/`git_candidate`/`git_publish`/`select_run_change`/`request_stable_write`/`submit_refactor`/
  `submit_version_change`/`request_version_decision`）。
- `dispatchFlowIdOf`：被派任务 flowId（trim；空 ⇒ 旧调用逐字走 legacy）。
- `DESKTOP_FIXED_DISPATCH_MATRIX`：编排 `FIXED_DISPATCH_MATRIX` 的只读再导出（不复制字面量语义）。

### 1.2 `app/desktop/workflow-git.ts`（新，174 行）：git init/`.gitignore`/merge-main **端口骨架**

- 端口：`WorkflowGitPort.ensureRepository/ensureGitignore/prepareTaskBranch/mergeMain`；失败码与
  v1.3 §5.5/§6.4/附录 C 对齐（`b-repository-required`/`baseline-*`/`release-*`/`git-command-not-ordinary`）。
- `createWorkflowGitPort(implementation?)`：**B1 缺省实现全部 fail-closed**（`workflow-git-unavailable`），
  零文件/零进程/零账本副作用；B3 注入真实实现，未提供的操作不回落 shell/默认 git。
- `mergeMainConfirmationError`：**纯校验**——缺省/`judge` ⇒ `release-unauthorized`（客户本人唯一有效；
  judge 只能转人工/拒绝，不代批）；B3 呈卡/执行前调用。`MergeMainPreview`/`MergeMainResult` 钉住
  AC-14/AC-22 必含字段（workflowId/flowId、base OID、tip OID、文件数、diff stat、合并方式、高风险提示、
  `release.merged` 回执），B1 不实现执行。

### 1.3 `app/desktop/session.ts`（M，+450/−15）：per-flow 路由、fixed 路由、能力过滤、模式注入

- **per-flow 路由**（`routeDispatch` trio 分支）：按**被派任务的 flowId** 现场解析
  `resolveFixedPathMode`（启用闸 + `workflowMode`，不缓存）；`fixed` ⇒ 新私有 `routeFixedPathDispatch`；
  空 flowId/`legacy`/闸未启用 ⇒ 现有 `routeStarDispatch`（**方法体字节级未改**，见 §3.3）：
  - `routeStarDispatch` 的调用行保留；旧谓词 `evaluateDispatchAuthorization`（旧 :8982）与
    convener→verifier 内联拒绝（旧 :8993）逐字保留。
- **`routeFixedPathDispatch`**（新私有方法）：
  - **不做** legacy 机制：不调用 `prepareRoleDispatch`/`freezeExecutionRun`/run-manifest pin/roster、
    `evaluateDispatchPreflight` advisories、`chainDispatchFacts`、`versioned-doc-baseline` 收集、
    `hubPreparation` 五内置判断；不写 `.ans/runs`/`.ans/trunk`。
  - **矩阵/证据（fail-closed）**：`evaluateFixedPathDispatchAuthorization`（matrix `two-fixed-paths/v1`）；
    purpose 由可信路由事实派生（stage-request；chief→内置 verifier/本 workflow `reviewRoleId`＝review；
    其余 chief→项目角色按 production 拒绝并提示交运营；convener＝production）；Q6 证据 =
    `sourceIsCurrent`（live-turn）+ convener 生产派发的 `workflowService.inspectAssignedTask` 绑定
    （只认 tasks 账本）+ identity/target + 应用计算幂等键；**证据缺失/不匹配 ⇒
    `dispatch-evidence-missing`/`dispatch-source-changed`/`stage-request-required`**，不默认通过。
  - **MF-10 窄例外事实**：`reviewRoleId` 仅取 `basis.recorded.reviewRoleId`（不取模型自报/投影未派生
    字段）、roster 原文 `reviewRoleIdOfRoster`、`role.activated`（投影 `activatedRoleIds`）——只透传，
    由谓词判定（缺一 ⇒ `review-role-invalid`，消息附缺失项）。
  - **workflow 事实**：`d.workflowId` 存在 ⇒ 账本必须存在该 workflow 且未关闭/未损坏（`workflow-not-found`/
    `workflow-closed`/`workflow-corrupt`）；fixed 生产任务必须带 `workflowId`+`stage`（否则
    `dispatch-evidence-missing`，避免落到 legacy `run-required`）。
  - **stage-request**：谓词通过后交编排 `workflowService.requestStage`（**单一实现**：确定性 workflowId、
    `stage-request:<wf>:<stage>:<attempt>` 幂等、sourceTaskId 缺失拒绝、workflow.started、只读任务创建、
    open 请求不变量）；桌面只计算 `requestDigest`/证据键并投递；replay 不重复投递。
  - **生产任务**：应用直接 `appendTaskEvent`（task-state 写侧 fixed 规则；**不经 trunk
    `recordTaskObservation`**——legacy CAS 路径会以 `task-run-required` 拒绝无 runId 的 fixed 任务）；
    `task.created` 含 from/to/flowId/workflowId/stage/sideEffect（stage-request 固定 read-only、文本升类
    豁免在其请求路径由服务层落只读）；**拒绝先于 task.created**；投递复用 `planDispatchDelivery`/队列/
    目标会话自动开启/失败如实回执；报告路由由 `task.created.from` 既有链承担。
- **fixed 任务与 legacy trunk 绑定的隔离（B1 最小）**：
  - `openInternalUnsafe`：会话级模式按任务真实 flowId 解析；fixed 任务**不交** legacy
    `resolveDeliveryAssignment`（否则必 `delivery-assignment-unavailable`）——仍以 taskId 传 run-role
    解析 fixed 模式（`workflowModeForFlow`）；legacy/single 路径逐字不变。
  - `sendDelivery`：`requiresHandback` 的 fixed 任务（`created.workflowId`）跳过 trunk `assigned-task`
    解析；legacy 任务逐字不变。
  - 投递机 `inspectQueuedChild`：fixed 任务改用 `workflowService.inspectAssignedTask`（open/stopped 事实），
    不可用即丢弃队列项（与 legacy 同口径 `delivery.skip.task-unavailable`）。
- **`workflowModeForFlow` 注入**：`openRoleSession` 入参新增（**仅 trio**；single/su 不注入，旧行为逐字
  不变）：`workflowModeForFlow: workflowModeForFlowResolver(projectRoot)`——run-role 每次卡/任务/写门禁
  按实际 flowId 解析（不缓存项目级单值）。
- **direct 能力过滤（AC-23）**：fixed 会话（trio + 任务 flow 判 fixed）**不注入**
  `gitQuery`/`gitCandidate`/`gitPublish`/`selectRunChange`/`submitVersionChange`/`submitRefactor`/
  `requestStableWrite`/`requestVersionDecision` 与 `stablePermitOf`（stable 许可）；**保留**
  `closeCreatedTask`/`completeTeamPlan`/`activateRoleDocuments`/`request_choice`/`request_confirmation`/
  `submit_report`/`doc_format`/`governance_matrix`/`project_state`/`project_note` 等按角色允许；
  **未新增 `requestReleaseMerge`**（G-IR 拒绝）。legacy 注入集合/顺序逐字不变（仅条件包裹，既有键序不动；
  唯一新增键 = trio 的 `workflowModeForFlow` 纯选择器，见 §3.3）。

### 1.4 `app/desktop/customer-input.ts`（M，+16）：merge-main 客户主权**识别骨架**（B3 完成卡语义）

- 新增 `MERGE_MAIN_CARD_KIND="merge-main"` + 冻结选项词汇 `MERGE_MAIN_OPTION_IDS`
  （`approve-merge-main`/`reject-merge-main`，导出供 B3 复用）。
- `isApplicationDecisionReservedForCustomer` 纳入 merge-main：仅 `application:true` 且携带完整冻结选项
  词汇时命中 ⇒ 不进 `tryAutoSelectDecision`/委托/`@决策`/判断器；judge 永不代批、永不冒充客户。
- **不新增客户卡**（既有高风险确认机制的具体化）；`appointment-write`/stable-write/run-change/VCA/
  修正案等既有客户主权卡行为逐字不变；`planJudge` 排除面仍由 `governanceCardGroup("merge-main")===undefined`
  （B0）承担。

### 1.5 `app/desktop/interface.ts`（**未改**）

- B1 无 IPC 形状需求：merge-main 卡经既有 `CustomerInputRequest` 通道（B3 构造/呈现），fixed 路由/能力
  过滤全在主进程会话层；不改 UI 呈现。按写集「必要时 IPC」——本批判定为不必要，保持零 diff。

### 1.6 测试（`test/桌面应用/**`，新 2 文件 / 17 tests）

- `fixed-path-routing.test.ts`（13 tests）：per-flow 混合项目路由（legacy 在飞 run + 新 fixed flow，按
  flowId 分别走旧/新路径；配置切换立即生效不缓存）；**B1 启用闸**（未显式 fixed 且无 fixed workflow 的旧
  flow ⇒ 路由/注入一律 legacy；该 flow 有 workflow.started ⇒ 启用；显式 legacy/v1 ⇒ 关闭）；
  `workflowModeForFlow` 注入与空 flow fail-closed；
  fixed 矩阵负例（chief→product/rapporteur、chief→项目角色非 review、self、convener→verifier、目标不存在、
  chief→convener 非 stage-request、stage-request 携 module、生产任务携 workflowPath、来源防御）；
  Q6 证据负例（无 live-turn、settled、fenced、过期/伪条目、伪造/错误创建者/已关闭父 stage-request）；
  fixed 正例（chief→verifier 建 fixed 任务、无 runId、不写 `.ans/runs`、投递；stage-request 首请求建
  只读任务 + workflow.started + 幂等键；convener 绑定真实 open stage-request 派生产角色）；
  MF-10 窄例外正/负例（roster review + basis + role.activated 一致 ⇒ 允许；缺激活/roster 未标记 ⇒
  `review-role-invalid`；非 reviewRoleId ⇒ `chief-to-project-forbidden`）；
  direct 能力过滤（fixed 不含 8 项 legacy + stablePermitOf；legacy 逐项仍在；`requestReleaseMerge` 不存在；
  fixed 保留 complete_team_plan/close_created_task 等）；single/su 不受影响。
- `workflow-git-port.test.ts`（4 tests）：端口缺省全 fail-closed 且零文件副作用；judge/缺省确认 ⇒
  `release-unauthorized`；注入实现生效、未提供操作仍 fail-closed；merge-main 客户主权识别（application+
  冻结选项词汇）/非应用/缺选项不命中；`governanceCardGroup("merge-main")===undefined`；stable-write 不变。
- 确定性：假会话句柄/临时目录/tasks+workflows+basis 账本夹具；不启动 Electron/真实模型；无新增 skip/
  force-exit；`optional-acceptance.test.ts` 未改。

## 2. G-IR / AC 闭环（桌面 owner 部分）

| 条件 | 状态 | 证据/说明 |
| --- | --- | --- |
| AC-01/02/04（fixed 矩阵 + MF-10 + Q6 fail-closed） | **桌面侧闭环** | `routeFixedPathDispatch` 谓词调用 + 证据透传；负例 9 组、窄例外正/负 3 组（`fixed-routing.tap`） |
| AC-05（stage-request 字段/只读/无写权） | **会话透传闭环（B2 schema/handler 待接）** | 载荷字段消费 → `requestStage`（服务层拒绝非法形状）；任务只读、无 module；桌面不复制 stage 状态机 |
| AC-12（per-flow、不缓存、混合项目） | **桌面侧闭环** | `routeDispatch` 按 flowId（B1 启用闸 + 编排 `workflowMode`）；`workflowModeForFlow` 注入；测试含配置切换即时生效与旧项目 legacy 兼容 |
| AC-14/AC-22（merge-main 客户本人/执行） | **骨架（B3 完成）** | customer-input 客户主权识别；workflow-git 端口/失败码/preview 类型/确认纯校验；不新增工具 |
| AC-23（direct 过滤） | **桌面侧闭环** | fixed 8 项 + stablePermitOf 不注入；legacy 逐项保留；测试断言 |
| AC-27 Q1/Q6 | **桌面侧闭环** | merge-main 不进 GROUP/不代批（识别面）；Q6 证据 fail-closed |
| MF-IR-7（A12 核验） | **桌面侧闭环** | reviewRoleId 取 basis、roster 原文、role.activated；缺一拒绝 |
| MF-IR-8（不新增 requestReleaseMerge） | **遵守** | 注入面/类型面均未新增 |

## 3. 验证与证据

### 3.1 typecheck

`npm run typecheck` → **exit 0**（`_evidence/typecheck.txt`）。

### 3.2 before/after（受影响桌面套件；before = HEAD 纯净解包 `git archive HEAD` + node_modules junction）

| 套件 | before pass/fail | after pass/fail | 失败名集合 |
| --- | --- | --- | --- |
| chain-enforcement | 3 / 6 | 3 / 6 | 逐名一致 |
| session | 6 / 1 | 6 / 1 | 逐名一致 |
| interface | 8 / 0 | 8 / 0 | — |
| dispatch-fresh-enum | 2 / 0 | 2 / 0 | — |
| handback-delivery | 12 / 6 | 12 / 6 | 逐名一致 |
| run-pin | 9 / 11 | 9 / 11 | 逐名一致 |
| multi-runtime | 31 / 8 | 31 / 8 | 逐名一致 |
| message-queue | 20 / 0 | 20 / 0 | — |
| ans-wiring | 7 / 0 | 7 / 0 | — |
| boundary-refresh | 13 / 1 | 13 / 1 | 逐名一致 |
| log-actions | 0 / 1 | 0 / 1 | 逐名一致 |
| run-change-trigger | 1 / 9 | 1 / 9 | 逐名一致 |
| star-routing | 3 / 7 | 3 / 7 | 逐名一致（旧断言未改） |
| i-full-chain | 0 / 2 | 0 / 2 | 逐名一致 |
| version-change | 42 / 4 | 42 / 4 | 逐名一致 |

- 汇总：**新增确定性失败 = 0、失败名集合 diff = 0、新 skip = 0**；TAP 见 `_evidence/affected/`
  （after = 终版代码 final-after；before = HEAD 纯净解包）。
- **扩展覆盖（其余导入 SessionManager 的 28 套件，before/after 同上，`_evidence/affected2/`）**：
  24/28 逐名一致；4 项差异均为**既有环境/时序噪声**（无本批代码路径参与，`_evidence/flaky-suites.txt`）：
  - `application-line`（1 例 fail→pass）：断言 `request.*` 事件顺序 created→presented→resolved；
    HEAD 纯净解包隔离复跑 3/3 失败、worktree 0/1/1——既有顺序竞态（非本批修复/引入）。
  - `chief-workflow`（终版 43/13；in-batch before 39/17）：真实 Runtime Service 卡链套件本身非确定——
    HEAD 两次采样（in-batch 39/17 / isolated 43/13）即相差 8+4 个用例；终版两次采样均 43/13
    （isolated 43/13）。所有「终版两次都失败」的用例在 HEAD 至少一次采样中也失败；不存在「终版确定失败
    且 HEAD 确定通过」的用例。初版无闸 25/31 的真实回归已由 §1.1 启用闸修复并单独留证
    （`_evidence/affected2/isolated-after-initial-regression-chief-workflow.tap`）。
  - `operator-channel` test 14 与 `p0-halt-and-images` test 1（**真仓库**角色 + 真实 openRoleSession）：
    本 worktree `.git` 为 linked-worktree 文件 ⇒ `readGitHostProtectionRequirement(worktree)=state:unknown`
    ⇒ `runtime-creation-prepared-api-unavailable`；**纯净 HEAD 代码打开同一 worktree 根复现同一错误**
    （`_evidence/operator-channel-env.txt`）。同套件 pre-gate after 运行与 before 逐名一致
    （operator-channel 59/0、p0-halt 3/2）。
  - `optional-acceptance` / `stuck-redispatch`：终版 30 s 复跑与 before 挂起前部分逐行一致
    （2 ok/1 fail；4 ok/3 fail）。
- **挂起套件（既有）**：`optional-acceptance.test.ts` 在 before/after 均于第 4 个测试前挂起（超时
  EXIT=124；已完成部分逐行一致：`not ok 1` + `ok 2` + `ok 3`，与 B1 §二 known-red「2 pass / 1 fail」
  部分一致，剩余用例未运行）；`stuck-redispatch.test.ts` 在 before/after 均于第 8 个测试前挂起
  （EXIT=124；已完成 7 项逐行一致：`not ok 1/5/6` + `ok 2/3/4/7`）。二者为 HEAD 纯净解包同样存在的
  既有环境问题，**未因本批恶化**（`_evidence/affected/`）。
- 基线说明：上述失败在 HEAD 纯净解包同样存在（本 worktree 环境性；star-routing/i-full-chain 与 G-IR
  记录的 9 红同源）。桌面全量套件在本环境被**既有**挂起（`directive-decision.test.ts`、
  `stuck-redispatch.test.ts`、`optional-acceptance.test.ts`、`session-rebuild-race.test.ts` 单独运行
  亦挂起/超时）——本批以受影响套件逐文件 before/after 对照（`_evidence/affected/`、`affected2/`），
  不据此声称全绿。

### 3.3 旧断言/旧路径保护

- `routeStarDispatch` HEAD vs CUR：**49,853 B，SHA-256 `1beea23b70b5c3d357ef208a20cbb2f6410ea7f92f93ab7440b9dbc7ca065a4f`（identical=true）**；
  旧谓词调用与 convener→verifier 内联拒绝锚点逐字存在（`_evidence/legacy-anchors.txt`）。
- **legacy 注入面**（HEAD 纯净解包 vs CUR，同一 trio legacy 项目/chief 会话，`_evidence/legacy-injection-surface.txt`）：
  既有键集合与相对顺序逐字一致（`gitQuery`/`gitCandidate`/`gitPublish`/`requestVersionDecision`/
  `stablePermitOf` 等在两者均按原序注入）；唯一新增键 = `workflowModeForFlow`（v1.3 §3.6 强制注入的
  **纯模式选择器**；仅 trio；不授予写权/派发权）。
- **D1 回归发现与修复（如实披露）**：初版把 `workflowModeForFlow` **无启用闸**注入——`workflowMode`
  对未标记项目的新 flow 返回 fixed，run-role 按 fixed 矩阵读取尚不存在（B2）的 `fixedCards` 而 fail-closed，
  导致 `chief-workflow` 真实卡链 **18 例新失败**（隔离 before 43/13 → 初版 after 25/31，可复现）；
  加 §1.1 的 B1 启用闸后恢复：隔离 before 43/13 / 终版 after 43/13，失败名逐名一致
  （`_evidence/affected2/isolated-*`）。该闸为 AC-03 legacy 断言不改的必要条件（§6-6）。
- star-routing / i-full-chain / session / interface / version-change 旧断言未改；`optional-acceptance.test.ts`
  未改；无 skip/force-exit 新增。
- 既有 desktop 套件失败名集合逐名一致（§3.2 主体 15+24 套件；4 项既有环境/时序噪声见 §3.2 扩展覆盖，
  其中 operator-channel/p0-halt 已用**纯净 HEAD 代码复现同一环境错误**、application-line/chief-workflow
  为 HEAD 自身非确定）。

### 3.4 新增目标测试

`fixed-path-routing` **13/13 pass**、`workflow-git-port` **4/4 pass**（`_evidence/target-*.tap`；
两文件合并连续 3 次运行均 17/17/0/0，`_evidence/determinism.txt`）。

## 4. 候选（本角色 B1 文件）

`_evidence/candidate.sha256.txt`（逐文件 raw SHA-256/字节/行）：

| 文件 | 字节 | 行 | SHA-256 |
| --- | --- | --- | --- |
| `app/desktop/session.ts` | 756,118 | 11,660 | `ac3a5924f494e83b6e9a25c1393961619f9c8fafb58728ef96750ad501c87d57` |
| `app/desktop/workflow.ts` | 7,815 | 158 | `a60c7f00227a32f1ef51ffac9a0c8eb1fc3f12994fc27002cd8f8c26dff58fa9` |
| `app/desktop/workflow-git.ts` | 7,781 | 174 | `1d9ab3ee30ee053ce54401cd1f1566860a6e67903488af909d3c475a083d13c8` |
| `app/desktop/customer-input.ts` | 158,297 | 2,769 | `f6bb5f3327eb41c99be4db73020d10556f1a73de8d42a1791f1c4bef0ab1ea4f` |
| `test/桌面应用/fixed-path-routing.test.ts` | 47,323 | 859 | `a274eb1b251709bb1f777918d8e6e85ff35a35f2a2ff8f3d21fe843decb25eee` |
| `test/桌面应用/workflow-git-port.test.ts` | 6,765 | 132 | `abb1231f498c7767d59f6b51158f3836a6cd35d319392c67d451ab58a5f4ce2d` |

numstat：`session.ts +450/−15`、`customer-input.ts +16/−0`；新文件见上。
**聚合**：对 6 个候选文件执行 `sha256sum`、按路径排序后拼接（`sha256sum` 行原文）的 SHA-256 =
`81aab0b4e25a57a1977480f23df719349e8aa11f017c2f43c457388df98e1026`（`_evidence/candidate.aggregate.txt`）。
**写集外 diff=0**：`src/**` 0 行 diff；`app/desktop` 其它文件 0；`app/main.ts`/`app/renderer/**` 0；
`角色卡/**`/边界/其它文档 0（记录写入前；`_evidence/write-set.txt`）。

## 5. 与编排导出的接口对照（只读 import）

- `src/common/编排/workflow-dispatch.ts`：`evaluateFixedPathDispatchAuthorization`（输入/结果/失败码/
  `missing[]` 原样消费）、`FIXED_DISPATCH_MATRIX`、`stageRequestIdempotencyKey`/`stageStopIdempotencyKey`
  ——形状匹配，无改动需求。
- `src/common/编排/workflow-service.ts`：`workflowMode`（委托）、`requestStage`（stage-request 创建）、
  `inspectAssignedTask`（convener 父任务证据 + 投递机 fixed 事实）、`readWorkflowLedger`/`readBasisLedger`/
  `appendBasisEvent`（测试夹具）、`workflowIdFor`（首请求幂等证据键）——导出与实现一致。
- `src/common/编排/workflow-state.ts`：`deriveWorkflowView`（stage/activatedRoleIds/closed/corrupt；
  **不派生 reviewRoleId**——桌面按记录以 basis 为唯一来源，符合 B1 记录 §1.9）。
- `src/common/编排/workflow-preconditions.ts`：`loadLatestRoster`/`reviewRoleIdOfRoster`（roster 原文
  review 标记；与编排 §MF-IR-7 同源）。
- `src/pipeline/orchestration/run-role.ts`：`openRoleSession` 入参 `workflowModeForFlow`（本层注入）；
  fixed 工具过滤/模块 context 由 run-role 同源执行，桌面不重复实现。
- 未发现需要编排改动的接口缺口；无写集外需求（无停止报告项）。

## 6. 限制与披露

1. **B2/B3 残留（本批明确不做）**：`dispatch_task` 新字段 schema/handler 矩阵校验（B2）；fixed 任务的
   会话级写作用域/任务绑定（项目角色 fixed 任务打开、verifier fixed review 上下文的 trunk 检查适配）、
   stage 转移的机械校验、merge-main 卡构造/呈现/preview/执行/幂等/冲突（B3）；`close_created_task` v2/
   `activate_role_documents` v2 接线（B2/B3）。
2. **空 flowId ⇒ legacy**（与编排 `workflowMode` 一致）：fixed 会话若省略 flowId，桌面按 legacy 路由——
   stage-request/生产任务的 flowId 强制属 B2 handler + B3 fixed context；B1 以「生产任务必须带
   workflowId+stage」与矩阵证据收紧已知路径（已披露，不视为完成态）。
3. **fixed 投递不按 taskId 绑定目标会话**（B3）：投递机对 fixed 任务跳过 trunk assignment 解析并改用
   workflow-service 的 open/stopped 事实；目标会话以普通方式打开，fixed 写作用域/任务绑定留 B3。
4. **stage-request 证据键的 attempt**：桌面按账本同规则推导（`max(prior)+1`/`stops+1`），仅作
   Q6 幂等证据；幂等权威在 `requestStage`（重复请求返回原任务）。
5. **全量桌面套件**：本 worktree 存在**既有挂起**（`directive-decision.test.ts` 单独运行 90 s 无输出；
   `stuck-redispatch.test.ts`、`optional-acceptance.test.ts`、`session-rebuild-race.test.ts` 同型），与
   G-IR/基线记录一致；本批以受影响套件 before/after 与失败名集合 diff 取证（§3.2），不做全量绿声明。
6. **B1 启用闸的启用时序（B3 依赖）**：fixed 路由/run-role 注入在「项目显式 `two-fixed-paths/v1`」或
   「该 flow 已有 fixed workflow」前保持 legacy——首次 fixed workflow 启动须由 B3 先经
   `writeProjectConfigWorkflowSchema` 落 `workflowSchema`（v1.3 §4.1 第 4 条；其自身经
   `requestStage` 建立的 workflow.started 也会启用该 flow）。若 B2/B3 的验收夹具期望「未标记新项目直接
   fixed」，须按本条固化启动顺序（本闸为 AC-03 legacy 断言不改的必要条件；D1 实测提前 fixed 解析会使
   chief-workflow 真实卡链 18 例失败）。
7. **未运行真实模型/Electron**；未占用 9222/9223；无新依赖；`app/desktop/interface.ts` 未改（§1.5）。
8. 本批为 D1 级自检，不构成 B2 验收；卡/merge 的客户可见面以 B3 实现与 B2 判定为准。

## 7. 未提交声明

- 产品/测试代码变更仅限 §1 写集；记录与 `_evidence/` 仅写入本角色 `docs/change/` 目录（任务精确写集）。
- **未 commit / 未 push / 未 merge / 未 tag / 未发布**；未运行真实模型/Electron；未占用 9222/9223。
- 本记录不自嵌 SHA-256（落盘后由回报/验收复算）；引用 hash 均为写盘实测（§0/§4）。
