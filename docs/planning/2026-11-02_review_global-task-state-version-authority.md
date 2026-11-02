# 全局任务状态与幕僚版本决策权方案 P1.0 复核记录

- 复核对象：`docs/planning/2026-11-02_design_global-task-state-version-authority.md`（版本 P1.0，日期 2026-11-02；1252 行；SHA-256 `0173fe50bbd545d61b3d6f8abd1671b02cafec3b068315bc412f81163e6e7991`；本记录按该快照只读核对）
- 复核模式：**完整复核**（依据 `planning-proposal-review.md` §3.3：T3 风险档位；新增治理/权限决策权；共享任务账本契约加法扩展；跨角色工具、UI 与 flow/run 生命周期；Q1–Q6、C1–C7 与 O1–O11 多个待确认项，不满足轻量条件）
- 复核上下文：同一策划角色（Planning）的独立只读上下文（由沟通启动；不继承作者对话；只读方案、闸门 0、代码、测试与既有契约；只写本复核记录）
- 闸门 0 记录：`docs/communication/2026-11-02_intent_global-task-state.md`（83 行；SHA-256 `baf327b9299c0fa2d2c5482f296044cf3c750a3f8b63d35ef9b765a257afebc6`；含客户确认「发卡确认」与预授权「我都同意，等下搞好了，直接安排去修改」及条件）
- 复核日期：2026-11-02
- 代码基线：worktree `flow-improvements-wave1`，HEAD `0a123109a6b10e9b60fd1aee5f08f861455c48de`（与方案标注一致；工作树仅有本任务的沟通记录、方案与备忘改动，产品/测试无本任务改动）
- 说明：复核只作建议，不是批准、通过、验收、客户闸门或实施授权，也不替代闸门 1/2。作者处置权与不采纳权按复核规则 §9。

## 独立核对过的关键事实（只读）

- 方案与闸门 0 的行数、SHA-256 与任务输入一致；方案引用的闸门 0 哈希 `baf327b9…` 与文件实际一致。
- 任务账本：`src/common/编排/task-state.ts:31` 为 `.ans/state/tasks.jsonl`；`:39-47` 事件 kind 白名单与方案一致；`:274-422` `validateEvent` 对 `task.created.from`（chief/convener）、flowId/runId/runState、`request.created.cardKind`、`request.resolved.selectedOptionIds/by` 的校验与方案 §2.1 描述一致；`:425-480` 重放对无 taskId 的 `delegation.changed`/`request.*`/`approval.*` 跳过，其余未知任务事件记错误；`:542-549` `taskStatusOf`、`:551-572` `TaskCardView`、`:574-603` `taskCardOf`、`:605-609` `taskCards`、`:630-642` `redispatchCountOf`、`:654-671` `renderTaskCardLines` 均与方案引用一致。
- 账本轮转：`task-state.ts:31-36`（默认 5 MB、3 份）、`:190-218`（按旧→新轮转并删除最旧）、`:486-531`（读轮转文件、坏行/读失败进 errors）；方案未说明新事件在轮转下的保留上限（见 F7）。
- run manifest：`run-manifest.ts:40` `RunState`、`:58-80` manifest 字段（含 `stage`、`runChange`）、`:113-125` `.ans/runs/<runId>/manifest.json`、`:240-251` `findActiveRun`（draft/pinned；多 pinned 冲突；pinned 优先）、`:254-285` `ensureDraftRun`（复用/领养 `pending` draft）、`:546-565` `closeRun`（closed/cancelled、幂等）、`:616-667` `applyRunChange`（三模式；同 flow 新 draft；记录 runChange）、`:696-730` `buildRunChangeCard`（application:true、sourceRoleId:"application"、三选项、continue-frozen 推荐）、`:832-863` `findNewerContractDocs`（仅 pinned、只提供事实）均与方案一致。
- 版本化文档守卫：`versioned-doc-guard.ts:16-24` 的路径模式（intent/proposal/roster/modules/topology/architecture/assets）与 `:55-70` 覆盖既有版本即 `versioned-doc-overwrite` 拒绝，均与方案 §2.4 一致。
- decision 卡：`decision-card.ts:36` `DECISION_CARD_ALLOWED_ROLES = ["convener","rapporteur"]`；`:98-107` `application:true` 应用自有卡绕过角色 allowlist；`:108-144` 仍校验 `kind="choice"`、flowId slug、≥2 选项、id 非空不重复、恰一个 `recommended:true`。方案复用 `cardKind="decision"`、application-owned、两个固定选项与恰一推荐**不突破**角色发行上限与卡型白名单；幕僚仍不能用 `request_choice` 直接发 decision 卡。
- 幕僚卡/写区：`governance-roles.ts:140-163` 卡文本（工作流管理、不批准、不写账本/flow/gate/不代标 delivered）；`:258-294` chief 的 Section 1 仅 `docs/intents/`、`preauthorizedDirs` 仅 `docs/intents/`、`forbiddenWritePaths` 含 `.ans/**`/角色卡/提案/契约等，能力位 `customerInput/dispatchTask/roleStatus/sessionTail` 为 true，与方案 §2.2 一致。
- Model：`runtime.ts:388` 卡种枚举（proposal/appointment/acceptance/intent-confirm/decision + appointment-write）；`:420-427` `GOVERNANCE_CARD_GROUP`（decision 组）；`:440-450` `GovernanceCardMetadata.application/sourceRoleId`（仅应用侧设置）；`:685-715` `TaskCreatedEvent` 的 flowId/runId/runState/runStage；`:2054+` `GovernedToolsOptions`；`:836-839` `RequestOrphanedEvent.reason` 当前类型为 `"restart"`（扩展需同步 TS 类型，方案已写明）。
- 任务状态下游：除 `app/desktop/session.ts`（`readTasks`、`restoreRequestState`、`listTasks`、重放/派发/收报/收口）与测试外，仅 `src/service/role/resolve-role.ts:396` 以文件存在判断 trio；未发现其他会把新增 kind 当任务记录消费的读取者。旧 app 读新 kind 会按 `validateEvent` 未知 kind 记坏行（`task-state.ts:280`、`:518-522`），不丢数据、不阻塞，与方案 §8.2 一致。
- 申请生命周期：`session.ts:3882-4041` `withRequestLifecycle` 落 `request.created/presented/resolved/notified`；`:3994-4027` 记录 `by/operatorId/judge/selectedOptionIds/decisionId`；`:3492-3501` `requestNotifiedKeys` 按 `requestId+event` 去重；`:4073-4107` `restoreRequestState` 按 requestId 集合把未决 `request.created` 标 `request.orphaned(reason:"restart")` 并通知幕僚。以上与方案 §2.1/§4.7/§8.4 的引用一致；方案的 attempt/requestId 公式与这些机制存在冲突（见 F1）。
- 应用自有决策卡先例：`session.ts:4692-4723`（`escalateStuckTask`）已使用 `application:true`、`sourceRoleId:"application"`、`cardKind:"decision"`、`withRequestLifecycle` 与 requestId 覆盖，证明版本决策沿用该审计接线在现有代码中可行；方案未引用该先例（非缺陷，建议作者补充以增强可核对性）。
- run-change 边界：`session.ts:1912-2022` `requestRunChangeDecision` 只对 pinned run 发起；`:1964-1977` 直接调用 `requirementChangeCard`，不经 `withRequestLifecycle`，因此不落 `request.*`（方案将其列为既有审计缺口并列为独立事项，属实）。`:2082-2130` 冻结 run 上更新提案卡的自动 run-change 呈现路径属实。
- 能力注入：`session.ts:2440-2504` 派发给 chief/schedule/legacy；`requestRequirementChange` 只给 proposal/schedule（`:2458-2467`）；`roleActivityLog/terminateRoleRun/redispatchTask` 只给 chief（`:2480-2504`）；`canPresentAppRunChange` 含 chief（`:2459-2462`）；`requirementChangeCard` 通道只在治理会话构造（`:2788-2803`）。与方案 §4.4 的注入/呈现面描述一致。
- 工具层：`tools.ts:3070-3259` `buildGovernedTools` 采用「注入才注册」；`judgeReceipt` 位于 `:1668` 起；`ROLE_STATUS_MAX_BYTES = 8 * 1024` 位于 `:2275`；`makeDispatchTaskTool:2112`、`makeRoleStatusTool:2435`、`makeRoleActivityLogTool:2530`、`makeTerminateRoleRunTool:2576`、`makeRedispatchTaskTool:2617`。方案 §2.2 的 `2385-2474`/`2485-2570` 为覆盖相邻工厂的近似区间（`contract_check`/`session_tail` 也在其中），符号名与行为核对一致，仅行号有轻微漂移。
- 桌面决策卡校验：`app/desktop/customer-input.ts:323-371` 的 `evaluateDecisionCardRequest` 委托 `validateDecisionCardRequest`，application-owned 卡同样受结构校验；fail-closed 在触达 presenter/judge 之前。方案 §4.2 的卡型路径可行。
- `interface.ts:726-727` `listTasks` 签名、`:2412-2415` 实现、`:2141-2195` 附近 `requestRunChange` 入口；`TaskCenterPanel.tsx` 共 315 行、组件存在；`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`app/preload.cjs`、`app/main.ts`、`package.json` 的 `typecheck`/`typecheck:renderer`/`build:renderer` 脚本均存在。方案 §5/§6/§9 的路径与脚本引用属实。
- 测试基线：`test/编排/{task-state,run-manifest,decision-card}.test.ts`、`test/桌面应用/{chief-workflow,run-change,run-change-entry}.test.ts`、`test/桌面UI/` 均存在；`test/pi-adapter/write-sequencing.test.ts` 存在，`docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604` 已记录其为已知挂起并允许 T3 全量回归排除但须记录，方案 §9.1/§9.3 引用属实。
- 方案的新增文件 `src/model/project-state.ts`、`src/common/编排/project-state.ts`、`src/common/编排/version-decision.ts` 当前不存在，不存在与既有文件冲突；`src/model` 已有 `project-document.ts`，命名不冲突。
- 与闸门 0/预授权一致性：方案范围（全局任务状态 + 幕僚版本决策权、发卡确认、非 pinned、pinned 走 run-change、不改验收/证据/写权/闸门、roster/demo/run-change 审计列为独立事项）与闸门 0 已确认意图、Q1–Q6 推荐 A、C1–C7 推荐及非目标一致；T3 在闸门 0 的「T2/T3 由策划定档」预估内；方案未改变预授权条件（未引入未确认选装实施、未改角色/边界/风险档位）。预授权对 Q/C/O 选项的实际引用由沟通在闸门 1 前核对（见限制）。

## 清单结果

| 条目 | 结果 | 说明（依据或位置） |
| --- | --- | --- |
| OD-1 最小方案 | 发现 | 必做项可逐项对应闸门 0 的目标（全局状态、受控备注、版本决策、pinned 边界、复用账本/run 生命周期/decision 卡），没有为「以后可能」新增的抽象；但「应用事实建议」用了四条无证据来源的启发式阈值，judge 并不消费该建议，属可简化的额外卡面/契约面（F12，建议级）。 |
| OD-2 必做与选装 | 通过 | O1–O11 在 §11.1 分节，均有编号、理由、收益、代价与默认不实施状态；§12 给出推荐（均暂不做/不做），没有默认勾选冒充批准；C1–C7 待确认清楚。O2/O8 的「不做」与其余「暂不做」措辞略有差别，不影响判断。 |
| OD-3 复用 | 发现 | 复用清单基本属实（`readTaskState`/`taskCards`/`taskStatusOf`/`redispatchCountOf`、`listRunManifestsResult`/`findActiveRun`/`ensureDraftRun`/`closeRun`/`findNewerContractDocs`、`loadLatestRoster`/`parseProjectModules`、`versioned-doc-guard`、`validateDecisionCardRequest`、`withRequestLifecycle`、`judgeReceipt`、i18n）；但两处复用声明与现状 API 不完全匹配：`listRunManifestsResult` 是全有或全无（F2），`tasks[]` 与 `TaskCardView` 形状不一致而方案称「复用任务卡」（F3）。 |
| OD-4 非目标 | 通过 | §1.4 与 §11.2 覆盖闸门 0 的非目标：不改验收/证据/写权/闸门、不改 run-change/需求变更、不自动修复当前修仙 run、不 ad hoc 新建 flow、不扩派发护栏；roster/引用循环、demo 重复投递、run-change 审计、角色卡/工具描述对齐均为独立事项，未写成必做。 |
| OD-5 被否决的备选 | 通过 | Q1 的 B/C/D、Q2 的 B/C、Q4 的 B/C、新 cardKind vs 复用 decision、把新版本开发并入 run-change、幕僚直接调 run-change 均有真实比较与代价，理由具体；未发现为凑对比编造的备选。 |
| MK-1 目标 | 通过 | 目标可追溯到闸门 0 客户原话（全局任务状态 + 幕僚版本决策权、发卡确认）；[现状]/[设计候选]/[待客户决定] 标记清楚；问题证据引用了闸门 0 的 dogfooding 记录（外部项目未在本上下文重新核对，见限制）。 |
| MK-2 完整流程与失败分支 | 发现 | 成功流、拒绝/超时/不可用/中止、部分失败、并发、重启对账均有说明；但缺少「`request.resolved` 已写、`version.decision(executing)` 未写」的崩溃窗口（F5）；晚到答案「记录 resolved 或 orphaned」二选一未定（F6）；多 draft 时 runId 与「关闭全部活动 run」的作用域未写清（F8）。 |
| MK-3 输入输出 | 发现 | 字段表总体清楚；但顶层计数口径与 AC-7.3 矛盾（F4）；`tasks[]` 与任务卡形状/「复用任务卡」不一致（F3）；`blocked` 把 blocked/failed 合并（F9）；`version-decision` 工具输入的 `scopeOrArchitectureWrong` 未进契约（F10）。 |
| MK-4 契约 | 发现 | `project-state/v1`、`version-decision/v1` 的提供方/消费方/行为保证/版本与变更写清了；但 attempt/requestId 公式在拒绝后重试时会复用 requestId（F1，重要），`listRunManifestsResult` 复用与部分结果保证冲突（F2），审计受账本轮转限制未披露（F7），契约输入缺字段（F10）。 |
| MK-5 完成标准 | 发现 | AC-1–AC-10 覆盖较全、多数可核对；但 AC-1.4 与复用 API 冲突（F2）、AC-7.1「每次版本决策都有 version.decision」与拒绝零执行保证冲突（F11）、AC-7.3 与计数口径矛盾（F4）。 |
| MK-6 风险与未决事项 | 发现 | 风险表覆盖 judge 盲选、验收逃逸、引用链、状态漂移、focus 歧义、审计缺口、run-change 重叠、旧 worker、命名、降级、并发、晚到答案、UI、角色卡漂移、证据误读与 T3 成本；缺少审计保留/轮转（F7）与「resolved 未执行」窗口（F5）的披露。Q1–Q6、C1–C7、O1–O11 的待确认状态清楚。 |

## 发现

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | 漏重点 | **重要** | §8.3「并发」第 1 条；§7.2「幂等/去重」；§4.4 拒绝/重试行；§8.4「重复请求」 | `requestId = version-decision-<runId>-<attempt>`、`attempt = 该 run 已记录的 version.decision 条数 + 1` 与拒绝/中止路径冲突：被拒绝/超时/中止的 attempt 按 §4.4/§7.2 零执行、不写 `version.decision`，下一次 attempt 仍得到同一编号与同一 requestId；一次成功 attempt 又会写 executing+终态两条、编号跳过。重复 requestId 会导致：① `requestNotifiedKeys` 按 `requestId+event` 去重（`session.ts:3492-3498`），第二次的 created/resolved 系统通知被吞；② 重启 `restoreRequestState` 用 requestId 集合判断 resolved/orphaned（`session.ts:4077-4091`），历史 resolved 会把新的未决请求当成已结算、不再 orphan/通知；③ 账本出现两条同 requestId 的 `request.created`，审计把两次 attempt 混为一次。方案明确支持「拒绝后可重新发起（新 attempt）」（§4.4、§8.4），此路径会失效。 | 方案 §8.3/§7.2/§4.4/§8.4；`app/desktop/session.ts:3492-3501`、`:4077-4091`；现有 `escalateStuckTask` 用 `task-escalation-<root>-<attempts>` 覆盖式 requestId（`:4679`、`:4709-4723`） | 把 attempt 改为「该 run 已记录的版本决策 `request.created` 数（含拒绝/中止）+ 1」，或用独立的 attempt 序号事件/`at`+随机后缀；明确 pending 扫描按 requestId 前缀或显式字段区分需求变更 decision 卡；补「拒绝后重试」「中止后重试」「第二次未决时重启」「通知不被吞」测试。 |
| F2 | 漏重点 | 一般 | §3.2 派生规则 10；§6.4 复用；§7.1 错误语义；AC-1.4 | 方案要求「manifest 不可读 → 返回可读部分 + `errors[]`」并称复用 `listRunManifestsResult`；但该函数遇到任一非法/不可读 manifest 即返回 `ok:false`，不返回任何 manifest（`run-manifest.ts:221-237`）。按现状原样复用无法满足 AC-1.4；若改为部分结果，会影响现有 `activeRunViews` 等调用方语义。 | `src/common/编排/run-manifest.ts:221-237`；方案 AC-1.4/§6.4 | 明确扩展 `listRunManifestsResult`（返回可读 manifests + `errors[]`，并更新现有调用方与测试），或在 §6.1/§6.4 声明新增只读扫描函数并修正「复用」措辞；AC-1.4 与测试按该口径。 |
| F3 | 漏重点 | 一般 | §3.3 `tasks[]` 字段行；§5.1「复用任务卡」；§5.6「taskCards 计数投影」；§7.1 输出 | 方案字段表含 `from`、`blocked`、`redispatchCount`，不含 `TaskCardView` 的 `text`/`reports`；`TaskCardView` 也不含 `from`（`task-state.ts:551-572`）。同时 §5.1 说面板「未收口任务摘要（复用任务卡）」、§5.6 说与 `taskCards` 共用，但 `tasks[]` 既不是任务卡的子集也不是超集。实现者无法据此确定面板/工具是否携带任务正文、如何展示摘要；chief 工具摘要可能不足以识别任务。 | `src/common/编排/task-state.ts:551-572`、`:574-609`；方案 §3.3/§5.1/§5.6 | 把 `tasks[]` 定义为 `TaskCardView[]` + 派生字段（`from`/`blocked`/`redispatchCount`），或明确列出投影/排除字段与用途；若为隐私/体积排除 `text`，写明有界 `summary` 字段，并删去「复用任务卡」或说明面板另取 `listTasks`。 |
| F4 | 漏重点 | 一般 | §3.3「计数口径」；AC-7.3 | 「顶层 counts 按项目全部活动 flow 汇总」与「与任务中心 `unclosed` 同口径」「UI 显示未收口 N（其中 M 已随旧 flow 废弃）」互相矛盾：若只统计活动 flow，superseded 旧 flow 的未收口任务不在 N 中，M 恒为 0；若与任务中心一致，N 必须包含账本全部未收口（含 superseded）。实现/验收会按不同口径。 | 方案 §3.3「计数口径」、AC-7.3；`task-state.ts:476-479`（unclosed 为全部未收口） | 明确顶层 `unclosed` = `state.unclosed.length`（含 superseded），`supersededUnclosed` 为其中子集；或改为活动口径并同步 AC-7.3 与 UI 文案；补断言。 |
| F5 | 漏重点 | 建议 | §6.2 顺序要求 2；§8.4 恢复表；AC-8.3 | 方案规定执行在 `request.resolved` 之后、执行前写 `version.decision(executing)`。若在 `request.resolved` 写入后、`executing` 写入前进程崩溃，重启时没有 executing 事件可对账；该已裁决路线既未执行也无状态记录/通知。§8.4 只覆盖 executing 对账与「执行成功、写审计失败」，未覆盖此窗口。 | 方案 §6.2/§8.4/AC-8.3；`session.ts:4011-4028`（resolved 写入）与执行顺序 | 补恢复行：重启扫描「已 resolved 的版本决策请求但无 `version.decision`」→ 标 `uncertain`/orphaned 并通知幕僚；或调整落盘顺序使 resolved 与 executing 可对账；补 AC/测试。 |
| F6 | 漏重点 | 建议 | §4.4 表最后一行；§8.4「已 request.orphaned 的旧卡晚到答案」；AC-8.5 | 「记录 `request.resolved` 但**不执行**（或按实现标记 orphaned）」给出两种互斥的审计语义。若写 resolved（`by` 为客户），视图/审计会看到一次「已决定」但无执行；若 orphaned，则需处理 orphaned 之后又到达 resolved 的时序。方案未定义优先级、`request.presented/notified` 与 UI 卡状态。 | 方案 §4.4/§8.4/AC-8.5；`session.ts:4011-4028` | 固定一种语义（建议：发起轮次中止即 orphaned；晚到答案只记 `request.resolved` 并附「晚到/未执行」的可核对字段，或只做审计日志不写 resolved），并在 §4.7/§8.4/AC 中写清。 |
| F7 | 漏重点 | 建议 | §4.7 审计记录；§7.3 写侧；§3.5；§8.5 降级 | `version.decision`/`project.focus`/`project.note` 追加到 `tasks.jsonl`，而账本按 5 MB×3 轮转并删除最旧文件（`task-state.ts:31-36`、`:190-218`；`readTaskState:486-531`）。方案称「append-only，不覆盖」「审计可回看」，未说明保留上限；长期项目中旧决策/备注可能被轮转丢弃，focus 回退与审计可见性会变化。 | `task-state.ts:31-36`、`:190-218`、`:486-531`；方案 §4.7/§7.3 | 在契约/风险/恢复节写明保留边界与预期（操作状态可重建、审计受轮转限制）；若需要不轮转的版本决策审计落点，应作为额外范围请客户确认；测试覆盖轮转后的视图行为。 |
| F8 | 漏重点 | 建议 | §4.5 前置；§4.6 执行第 3 步；§8.1「多个 draft」；AC-5.2 | 同 flow 多个活跃 draft 时请求必须带 runId（否则 `run-ambiguous`），但 `new-version-development` 执行时关闭「旧 flow 的所有 draft/pinned 活动 run」，不限于请求带的 runId。这可能关闭与本次决策无关的另一个 draft；runId 的作用（识别 vs 作用域）没有写清。 | 方案 §4.5/§4.6/§8.1/AC-5.2；`run-manifest.ts:240-251` | 明确 `new-version-development` 的语义是「整个旧 flow 被新 flow 取代、关闭全部活动 run」并说明理由，或改为只关闭标记的 run、其余保留并列出；同步 AC-5.2 与测试。 |
| F9 | 漏重点 | 建议 | §3.3 `tasks[]` 字段行；§3.4 `task-blocked`/`task-failed` | `tasks[].blocked` 写「由最后报告 blocked/failed 派生」，把 blocked 与 failed 合并；而 blockers 列表区分 `task-blocked`/`task-failed`。`TaskReportStatus` 的 `blocked` 与 `failed` 是不同语义（`task-state.ts:45`、`:542-549`），字段名 `blocked` 承载两种状态会造成计数/过滤歧义。 | `task-state.ts:45`、`:542-549`；方案 §3.3/§3.4 | `blocked` 只表示最后报告 `status==="blocked"`；失败单列，或字段改名 `stuck`/`needsAttention` 并注明含 failed；补 AC/测试。 |
| F10 | 漏重点 | 建议 | §6.3 工具输入；§7.2 `version-decision/v1` 输入；§4.3 `appSuggestedAction` | 工具输入含 `scopeOrArchitectureWrong?`，但 `version-decision/v1` 契约输入只列 `flowId`/`runId`/`action`/`reason`/`refs`；`appSuggestedAction` 依赖该字段，契约不完整。 | 方案 §6.3/§7.2/§4.3 | 在 §7.2 输入加入该可选字段（业务含义/默认 false），或从工具与建议规则中移除。 |
| F11 | 漏重点 | 建议 | AC-7.1；§7.2 拒绝保证；§4.4 | AC-7.1 要求「每次版本决策有 `request.created/presented/resolved` + `version.decision`（executing→终态）」；但拒绝/超时/不可用/中止按 §4.4/§7.2 零执行、不落 `version.decision` 终态（或 orphan）。按 AC-7.1 验收会把合法拒绝判为缺失证据。 | 方案 AC-7.1、§7.2「拒绝保证」、§4.4 | 改为「每次进入执行的版本决策…」；拒绝/中止单独按 `request.resolved`/`request.orphaned` 审计核对；补正负例。 |
| F12 | 过度设计 | 建议 | §4.3 推荐规则；§6.3；§7.2 审计字段 | 应用事实建议用四条启发式阈值（`scopeOrArchitectureWrong`、同 run ≥2 次路线决策、≥3 blocked/failed、≥2 次验收退回）计算 `appSuggestedAction`；但方案自述 judge 仍只选卡内唯一 `recommended`（幕僚建议），客户看到的额外建议不参与决定；阈值没有证据依据，增加卡面/契约/测试面。 | 方案 §4.3/§6.3/§7.2；`runtime.ts:420-427`（judge 分组） | 简化为事实清单（次数/计数/最新 vs pin），不生成 `appSuggestedAction`；或将该建议标为选装并在 §12 单独确认。若保留，写明阈值来源与展示/审计要求。 |
| F13 | 漏重点 | 建议 | §11.2；AC-10.2；`README.md:133`/`README.en.md:133` | 仓库根 README 以一行列出 `TaskStateEvent` 现有事件种类（任务、申请/审批）；新增 `project.focus`/`project.note`/`version.decision` 后该清单会过期。方案的独立事项只覆盖角色卡与工具描述，未提 README/文档中的账本事件清单。 | `README.md:133`、`README.en.md:133`；方案 §11.2/AC-10.2 | 在实施阶段的文档更新或独立事项中加入 README 事件清单同步（中英双语），避免把「唯一机器状态」的文件说明写成旧形状。 |

## 复核结论

**建议修订后提交。**

方案方向与闸门 0 一致：全局任务状态采用「账本受控备注事件 + 应用即时派生只读视图」（Q1 A）、幕僚只管理 focus/阻塞/下一步并发起版本决策（Q2 A）、版本决策复用 application-owned `decision` 卡由客户/判断 agent 决定（发卡确认）、pinned run 仍走 run-change（Q4 A）、UI 最小状态区与其他治理角色只读裁剪（Q5 A）、账本加法扩展无迁移（Q6 A）；与闸门 0 的已确认意图、推荐选项、非目标、写权/边界和 T3 预估一致，未发现范围扩张或权限越界。文件/行号/现状引用抽样核对准确度高，未发现「暂不建议提交」级别的问题；`DECISION_CARD_ALLOWED_ROLES`/卡型白名单未被突破，两个固定选项与恰一 `recommended` 与 `validateDecisionCardRequest` 一致。

但 F1（attempt/requestId 公式在拒绝/中止后的重试路径会复用 requestId，破坏系统通知去重、重启恢复与审计区分）属于影响方案承诺的审计/恢复行为与 AC-3.5/AC-8.4 的重要发现，建议作者按复核规则 §9 先修订（改动集中在 §8.3、§7.2、§4.4/§8.4 与对应 AC/测试，不改变 Q/C/O 或产品范围）。F2–F4 为一般级契约/AC 一致性问题（`listRunManifestsResult` 复用与部分结果、`tasks[]` 与任务卡形状、顶层计数口径），建议在闸门 1 前顺手修正；F5–F13 为建议级失败分支、审计保留、字段语义与文档同步项，作者可采纳、部分采纳或不采纳并记录理由，未解决意见由沟通在闸门 1 材料中披露。

**建议在闸门 1 前必须修订或明确：**

1. F1：修正 attempt/requestId 生成规则，确保「拒绝→重试」「中止→重试」「第二次未决时重启」都得到新的、可审计的 requestId，且系统通知不被去重吞掉；补对应测试。
2. F2：明确 `listRunManifestsResult` 的部分结果语义（扩展或新增扫描函数），使 AC-1.4 可实现，并同步现有调用方。
3. F3：统一 `tasks[]` 与 `TaskCardView` 的关系，明确面板/工具是否携带任务正文或摘要。
4. F4：统一顶层未收口计数与任务中心 `unclosed` 的口径，修正 §3.3 与 AC-7.3 的矛盾。

F5–F13 建议至少更新披露与测试计划；不单独构成闸门 1 前的阻断项。

## 未检查事项、限制与未解决意见

**未检查/未执行：**

- 未访问并核对 2026-10-31/11-02 修仙游戏 dogfooding 的实际目标项目（三个 draft flow、v1–v7/v1–v14、judge「规范物证缺失」退回、30 个任务状态）：本复核目录只读 ans-studio worktree，外部项目不在本上下文；方案 §1.1/§2-30 的现场描述依据闸门 0 记录与沟通备忘，未独立复算。
- 未运行任何测试、未启动桌面应用、未跑 Electron E2E、未在真实项目复现全局视图/版本决策；所有代码结论来自 HEAD `0a12310…` 的静态阅读。
- 未逐行读完 `app/desktop/session.ts`（7881 行）、`src/provider/runtime/tools.ts`（3297 行）、`src/model/runtime.ts`（2596 行）、`app/desktop/interface.ts`（2592 行）；只读了与账本、申请生命周期、run-change、注入、工具注册、任务卡、桌面决策校验相关的段落。方案引用的行号抽样核对基本准确（`tools.ts` 的两段工具区间有轻微漂移，见事实节），实施仍应以符号名与文本锚点为准。
- 未验证 `requestRunChangeDecision`、`restoreRequestState`、`withRequestLifecycle` 的运行时行为（如通知时序、judge 回执字段），仅按代码阅读判断；F1 的冲突是代码阅读结论，建议实施阶段以真实集成测试确认。
- 未核对角色卡/边界对新增文件（`src/model/project-state.ts`、`src/common/编排/project-state.ts`、`version-decision.ts`、工具与 UI 文件）的写集覆盖；这属于闸门 2/人事范围，本复核不判断。
- 未实测 Windows symlink EPERM 与 `test/pi-adapter/write-sequencing.test.ts` 挂起；沿用 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604` 的既有结论，不把排除视为通过。
- 未核对 UI 项目状态区/decision 卡的渲染可行性、i18n 两语言键与 preload 暴露面；方案 §5/§6.1 的路径存在性已核对，具体组件/测试可行性未验证。
- 预授权「我都同意，等下搞好了，直接安排去修改」对 Q1–Q6/C1–C7/O1–O11 的实际引用与闸门 1 材料一致性，属沟通角色在闸门 1 前核对的范围；本复核只检查方案未改变已确认意图、推荐选项、写权/边界与风险档位条件，不判断预授权是否已经生效、也不构成客户确认。
- 未检查全部 `tasks.jsonl` 消费者；已核对 `resolve-role.ts` 的存在性判断、`restoreRequestState`、`listTasks`、重放与测试读取，未发现其他会把新增 kind 当任务记录消费的读取者，但不能排除测试/诊断中的零散读取。
- 未核对既有设计/验收历史中是否存在与本方案同对象的场景命名（全局任务状态/版本决策），只按目录与关键字抽查；已有同版确认的复用情况由沟通核对。

**未解决意见：** 无与作者的分歧记录（作者尚未对本记录作出处置）。F1 的重要度判断基于「方案明确支持拒绝/中止后的重试，而公式会复用 requestId」这一代码事实；若作者能证明现有实现会以其他方式保证 requestId 唯一（例如在 §8.3 之外另有 attempt 事件或实现约定），请在处置表给出依据，本复核将只就受影响部分再复核。本复核不评价 Q1–Q6/C1–C7/O1–O11 的产品取舍；推荐项均只是建议。

## 再复核记录（P1.1，2026-11-02）

- 复核版本：`docs/planning/2026-11-02_design_global-task-state-version-authority.md` P1.1（1283 行；SHA-256 `369f666acb76ac88fe30854d84b2f08f3148a55c9ff53958185310ef5c3af910`；按该快照只读）。
- 复核范围（受影响部分）：§0–§1.2（状态/成功口径抽查）、§3.2–§3.4、§4.2–§4.7、§5.1/§5.6、§6.1–§6.4、§7.1–§7.3、§8.1、§8.3–§8.5、§9.1、AC-1.4/1.8、AC-3.5/3.8、AC-5.2、AC-7.1/7.3、AC-8.3–8.5、AC-10.2、§10.1–§10.3、§11.2、§12（C1 与 Q/O 未变抽查）、§13；并抽查 Q1–Q6/O1–O11/T3 未变。
- 复核方式：静态只读；未运行测试、未启动应用/E2E；作者 §13 处置表与改动章节逐项对照；P1.0 复核内容未改写。

### 处置核对（F1–F13）

| 编号 | 作者处置 | 核对结果 | 依据/位置 | 状态 |
| --- | --- | --- | --- | --- |
| F1 | 采纳：唯一 requestId（时间+随机）、attempt 按 request.created 计数（含拒绝/中止）、pending 按前缀、补测试 | 真实落入：§8.3 明确唯一 requestId 与 attempt 仅展示、pending 前缀扫描与不复用；§4.4 拒绝行写「新 requestId，attempt 递增」；§4.7 version.decision 增加 attempt；AC-3.5/AC-8.4、§9.1 覆盖拒绝→重试、中止→重试、第二次未决重启、通知不被吞。与 requestNotifiedKeys（`session.ts:3492-3501`）和 restoreRequestState（`:4077-4091`）的机制不再冲突。实现注意：前缀扫描需以 runId 段边界匹配（runId 可能互为前缀）或同时核对 flowId；建议测试覆盖一个 runId 为另一个前缀的构造。 | §4.4、§4.7、§7.2、§8.3、AC-3.5/AC-8.4、§9.1；`session.ts:3492-3501`、`:4077-4091`；`task-state.ts:285-294`（requestId 只校验非空） | **已关闭（方案层）**；附实现注意。 |
| F2 | 采纳：新增只读 scanRunManifestsForState（部分结果），保留 listRunManifestsResult 的 all-or-nothing | 真实落入：§3.2 规则 10、§6.1、§6.2、§6.4、§7.1 错误语义、AC-1.4、§9.1 均已改；listRunManifestsResult 现语义确认（`run-manifest.ts:221-237`）。但 §3.2 规则 3/§6.4 仍要求视图「标出 findActiveRun 的当前活跃 run」，而 findActiveRun 内部复用 listRunManifestsResult（`run-manifest.ts:244-250`、`:229-236`）：任一非法 manifest 会让 findActiveRun 整体 fail，视图的 active 标记仍会失去部分结果能力（见 R1）。 | §3.2 规则 3/10、§6.4、AC-1.4；`run-manifest.ts:221-237`、`:240-251` | **部分关闭（R1，一般）**。 |
| F3 | 采纳：tasks[] = TaskCardView + from/blocked/failed/redispatchCount；完整视图含 text/reports；工具摘要用 bounded summary | 真实落入：§3.3 tasks 行、§5.1「来自同一 TaskCardView 投影」、§5.6；与 TaskCardView 字段（`task-state.ts:551-572`）一致，且补了 from（record.created.from）与 blocked/failed 分离；「复用任务卡」的模糊表述已删。 | §3.3、§5.1、§5.6；`task-state.ts:551-572` | **已关闭**。 |
| F4 | 采纳：counts.unclosed = state.unclosed.length（含 superseded），supersededUnclosed 子集、activeUnclosed 差值、blocked/failed 只算活动 flow | 真实落入：§3.3 计数口径、§5.6、AC-7.3 逐字一致；与 `task-state.ts:476-479` 的 unclosed 定义一致。 | §3.3、§5.6、AC-7.3；`task-state.ts:476-479` | **已关闭**。 |
| F5 | 采纳：重启扫描 resolved 且无同 decisionId 的 version.decision → uncertain + 通知、不执行 | 真实落入：§6.2 顺序要求 2、§8.4 新增行、AC-8.3、§9.1（resolved→executing 崩溃窗口）。扫描口径（前缀、decisionId、selectedOptionIds）可核对。残余执行期 pinned fail-closed 与 channel-forced resolved 的边角见 R3。 | §6.2、§8.4、AC-8.3、§9.1 | **已关闭（方案层）**；附 R3（建议）。 |
| F6 | 采纳：固定单一语义——中止→orphaned(initiator-aborted)，晚到答案不写 resolved，拒绝/不可用写 resolved | 真实落入：§4.4 最后一行、§4.7、§6.3 实现注意、§8.4、AC-8.5；与 withRequestLifecycle 的 resolved 写入兼容性有实现说明。残余「超时」术语与时序图表述见 R2。 | §4.4、§4.7、§6.3、§8.4、AC-8.5 | **已关闭（语义）**；附 R2（一般）。 |
| F7 | 采纳（披露+测试）：账本 5 MB×3 轮转，审计/备注只在保留窗口；视图重建；永久审计另立范围 | 真实落入：§4.7 审计边界、§7.3 写侧、§8.5、§10.1 风险、§9.1 轮转测试。 | §4.7、§7.3、§8.5、§10.1、§9.1 | **已关闭**。 |
| F8 | 采纳（语义明确）：new-version-development 取代整个旧 flow、关闭全部活动 run；runId 只是决策上下文 | 真实落入：§4.3 选项表/卡面、§4.5 前置、§4.6 第 3 步、§8.1「多个 draft」、AC-5.2、§9.1。§7.2 执行保证仍写「关闭旧活动 run」未写「全部」（R4，建议）。 | §4.3/§4.5/§4.6/§8.1/AC-5.2；§7.2 | **已关闭（语义）**；附 R4（建议）。 |
| F9 | 采纳：blocked 仅最后报告 blocked；新增 failed；blockers 分开 | 真实落入：§3.3 tasks 行、§3.4（原有 task-blocked/task-failed）、AC-1.8。 | §3.3/§3.4/AC-1.8 | **已关闭**。 |
| F10 | 采纳（移除）：删除 scopeOrArchitectureWrong 与 appSuggestedAction | 真实落入：§4.3、§4.7、§6.3、§7.2 已无字段/启发式；全文仅版本记录、处置表与 C1 历史说明提及，无行为残留。 | §4.3/§4.7/§6.3/§7.2；全文 grep | **已关闭**。 |
| F11 | 采纳：AC-7.1 改为「每次进入执行的版本决策」；拒绝/超时/不可用只要求 created+resolved；中止 created+orphaned | 真实落入：AC-7.1、§7.2 拒绝保证。§7.2「审计保证」行仍写通用的 request.*+version.decision（未加「进入执行」限定），且「超时」语义与 §4.4/AC-8.5 仍有漂移（R2）。 | AC-7.1、§7.2、§4.4/AC-8.5 | **已关闭（AC 口径）**；附 R2（一般）。 |
| F12 | 采纳（简化）：删除 appSuggestedAction，卡面只列事实清单；judge 仍选唯一 recommended | 真实落入：§4.3/§4.7/§6.3/§7.2/§10.1/C1；事实清单字段与「不生成第二建议」一致；闸门 0 意图/Q1–Q6/C1 核心答案未变（C1 仍为推荐项=幕僚提议）。 | §4.3/§4.7/§6.3/§7.2/§10.1/C1 | **已关闭**。 |
| F13 | 采纳：README 中英事件清单同步列入 §11.2/阶段 E/AC-10.2 | 真实落入：§11.2 第 7 项、§10.2 阶段 E、AC-10.2 均写明 README.md:133/README.en.md:133 与中英同步。 | §11.2/§10.2/AC-10.2 | **已关闭**。 |

### 新发现（再复核，P1.1 引入或残留）

| 编号 | 类别 | 严重度 | 位置 | 问题 | 依据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | 漏重点 | 一般 | §3.2 规则 3、§6.4、AC-1.4；§8.1「多个 draft」 | F2 的部分结果扫描只解决了 manifest 列表；视图仍要求「标出 findActiveRun 的当前活跃 run」，而 findActiveRun 复用 listRunManifestsResult，任一非法 manifest 即整体 `ok:false`（`run-manifest.ts:221-237`、`:244-250`）。有坏+好 manifest 时，合法 flow 虽可从 scan 返回，但 active run 标记/版本决策前置仍会整体失败，AC-1.4 的「部分可读」只能部分成立；scanRunManifestsForState 的归属模块也未点名。 | `run-manifest.ts:221-237`、`:244-250`；方案 §3.2/§6.4/AC-1.4 | 从 scanRunManifestsForState 返回的 manifests 派生 active run（复用冲突/优先级规则，不调用 all-or-nothing 的 findActiveRun），或新增可部分工作的 active-run 纯函数；明确 scan 所在模块；补「1 个非法 + 1 个合法 manifest 时合法 flow 的 active 标记仍正确」测试。 |
| R2 | 漏重点 | 一般 | §4.4 时序图/alt、§7.2「拒绝保证」「审计保证」、§13 F6 行、AC-7.1；对照 §4.4 超时行、§8.4、AC-8.5 | 中止/超时的审计表述仍有漂移：(a) §4.4 时序图在 alt 之前画 `request.presented / request.resolved`，而 alt 含「发起轮次已中止」，与 F6「中止不写 resolved」及 §6.3 实现注意矛盾；(b) §7.2 拒绝保证、§13 F6 行与 AC-7.1 把「超时」归入 request.resolved 分支，而 §4.4 超时行/§8.4/AC-8.5 把「会话中止」归入 request.orphaned(initiator-aborted)；若「超时」实际指轮次中止，AC-7.1 与 AC-8.5 会给出不同期望。 | 方案 §4.4/§7.2/§8.4/AC-7.1/AC-8.5/§13；`session.ts:4011-4028`（withRequestLifecycle 的 resolved 写入） | 定义并统一「通道超时（写 resolved unavailable）」与「发起轮次中止（写 orphaned(initiator-aborted)）」两个术语；拆分 §4.4 时序图的 alt 分支并把 resolved 写入放到「拒绝/通道异常」分支；同步 §7.2 审计保证、§13 F6 与 AC-7.1。 |
| R3 | 漏重点 | 建议 | §4.6 第 3 步、§8.4 F5 行、AC-8.3；§6.3 中止/晚到答案实现注意 | F5 的崩溃扫描以「resolved 且无同 decisionId 的 version.decision」识别未执行决策；但执行期发现 pinned 时（§4.6 第 3 步）返回 run-change-required 且不写 version.decision，重启会被 F5 记成 uncertain（resolved-without-execution-record），语义上把一次有意 fail-closed 当成未记录执行。另若底层通道强制写 resolved（§6.3），F5 扫描未说明是否排除已有 request.orphaned 的请求，可能把已 superseded 的晚到答案当 answered。 | 方案 §4.6/§8.4/§6.3/AC-8.3；`session.ts:4011-4028` | 执行期 pinned fail-closed 写 `version.decision(status:"failed", message:"run-change-required")`（或明确接受 uncertain 语义）；F5 扫描优先检查 request.orphaned（已 orphaned 的 request 不进入「resolved 未执行」推断）；补对应测试。 |
| R4 | 漏重点 | 建议 | §7.2「执行保证」 | 执行保证写「关闭旧活动 run」，未写「全部」，与 §4.3 选项表/卡面、§4.5 前置、§4.6 第 3 步、§8.1、AC-5.2 的「全部活动 run（不只当前 run）」不完全一致。 | 方案 §7.2 与 §4.3/§4.6/§8.1/AC-5.2 | 改为「关闭旧 flow 的全部活动 run（含多个 draft）」；同步契约与测试。 |
| R5 | 漏重点 | 建议 | 方案头部「独立复核」行、§13 首行 | 方案引用复核记录为 103 行 / `3b8d3a3a…`；本再复核追加后复核记录行数与 SHA 会变化；该引用应注明是「P1.0 复核快照」，或作者下次修订时更新为当前记录（并在方案中链接再复核结论）。 | 方案第 8/13 行与 §13；本记录当前版本 | 在下次修订时把引用写成「P1.0 复核快照（103 行 / 3b8d…）」并另附再复核节；沟通核对版本时以复核记录当前状态为准。 |

### 再复核结论

**建议提交客户确认。**

F1、F3、F4 的核心处置真实落入：requestId 唯一化 + attempt 仅展示 + pending 前缀扫描并配拒绝/中止/重启/通知测试（F1）；tasks[] 与 TaskCardView 对齐、工具摘要用有界 summary（F3）；unclosed/superseded/active 计数与 AC-7.3 统一（F4）。F5–F13 也均有可核对落点，未发现 Q1–Q6/O1–O11/T3 或闸门 0 意图的变化。F2 的主体（scanRunManifestsForState 部分结果、listRunManifestsResult 保持 all-or-nothing、AC-1.4）已落入，但视图对 findActiveRun 的依赖仍有 all-or-nothing 残留（R1，一般）；R2（中止/超时审计表述，一般）会影响 AC-7.1/AC-8.5 的测试期望；R3–R5 为建议级实现/契约/引用细化。R1/R2 均可在实施或下一次文档修订中处置，不改变方案范围、Q/C/O 推荐、写权/验收边界与 T3 档位，未达到「建议修订后提交」的重要发现标准。按复核规则 §8，沟通可按正常流程提交闸门 1，并在材料中如实披露 R1–R5；若作者愿意在提交前以 P1.2 只修订受影响段落（§3.2/§6.4/§4.4/§7.2/§4.6/§8.4/AC/§13 引用），可由沟通安排窄复核确认。

### 未检查事项、限制与未解决意见

- 本轮只做受影响部分的窄复核，按 P1.1 快照静态阅读；未运行测试、未启动应用/E2E。P1.0 复核记录中的「未检查/未执行」事项仍成立（外部 dogfooding 未访问、未逐行读完整大文件、未验证角色卡写集、未实测 EPERM/write-sequencing）。
- 未重新逐行核对 P1.1 未改动章节；只抽查 §0–§1.2、§3.2–§3.4、§4.2–§4.7、§5.1/§5.6、§6.1–§6.4、§7.1–§7.3、§8.1、§8.3–§8.5、§9.1、相关 AC、§10.1–§10.3、§11.2、§12（C1 与 Q/O 抽查）与 §13。
- F1 的 requestId 前缀扫描是方案文字结论；实际 runId 生成格式（`run-<date>-<flow>-<8 hex>`，`run-manifest.ts:133-136`）下前缀碰撞需要构造特定 flow 名，概率低；实施时以 runId 段边界或 flowId 核对更稳（已在 F1 行注明）。
- R1/R2 是静态阅读结论，未用真实坏 manifest/中止通道复现；实施/验收时应以集成测试确认。
- R5 是文档引用同步问题；本复核不改方案正文，由作者/沟通处置。
- 未获得客户对 Q1–Q6/C1–C7/O1–O11 的任何确认；本再复核只是建议，不是批准、客户闸门、验收基线或实施授权。作者尚未对本再复核记录作出处置。
