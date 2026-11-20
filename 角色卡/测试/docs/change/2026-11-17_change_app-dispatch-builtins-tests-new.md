# 变更记录：app-dispatch/v1 第一步测试批 T2（新增用例，v2.2）

- 日期：2026-11-17（执行于 2026-11-18）
- 角色：ANS 内置「测试」（roleId: 测试）
- 工作树：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\feat-app-dispatch-builtins`
  （分支 `feat/app-dispatch-builtins`，HEAD `caf0acf` + 编排/门禁/桌面三批未提交实现 + T1 测试改动）
- 权威依据：`docs/planning/2026-11-17_design_app-dispatch-builtins.md`（§二/§三/§4.3/§4.4/§五/§七/§九，Q1–Q10）；
  `角色卡/编排/docs/change/2026-11-17_change_app-dispatch-builtins-foundation.md` §二/§六；
  `角色卡/桌面窗口/docs/change/2026-11-17_change_app-dispatch-builtins-desktop.md` §六（待测试批 3–11）；
  `角色卡/门禁引擎/docs/change/2026-11-17_change_app-dispatch-builtins-texts.md` §1/§5.2。
- 范围：**只新增测试文件 + 扩展 `test/测试/fixed-path-full-chain.test.ts`**。未改生产代码、`test/**` 中 T1 写区
  （roles/门禁 fixed 契约、b71、doc-format、role-module-contract 等）、workflow 资源、release 配置；未
  commit/push/CI/tag/main；未读 `.env`；未占 9222/9223/9224；测试只用临时目录/假会话。
- 状态：**T2 完成（未提交）**。新增 6 个文件、扩展 1 个文件；typecheck 0；T2 测试集 48/48；三套
  known-red 冻结名单 **0 命中**（runtime-core 33 / gates 5 / orchestration 24）。
- 2026-11-18 收尾修补回归：编排批落地反向驱动守卫 / observe rework 成功回执 / reconcile corrupt 不记 driven /
  prepareIntent 不写 app-dispatch A3；T2 已同步更新断言并新增 3 条回归（service 16→19，总计 45→48）。

## 一、新增/扩展文件与用例清单

| 文件 | 类型 | 用例数 | 覆盖摘要 |
| --- | --- | --- | --- |
| `test/编排/app-dispatch-definitions.test.ts` | 新增 | 8 | 注册表 add(A1–A13)/modify(B1–B4) 覆盖；next/rework 与 `workflow-state.ts` 逐项一致；`validateWorkflowDefinitions()` 空错误；driveOrder 合法边；canonical JSON + 定义 hash 稳定/深度冻结；单定义/注册表 JSON Schema（draft 2020-12、stage enum、driveOrder 边界、无 $ref）；`getWorkflowDefinition` 未知/版本不符失败码（`workflow-definition-unknown`/`workflow-definition-version-unsupported`）；关键语义冻结（on-dispatch/review/release-or-close/高风险零重派/三卡/documentKinds/merge-main appOwned/Q8/B1 fallback/B2 派生/验收策略） |
| `test/编排/app-dispatch-service.test.ts` | 新增 | 19 | `selectWorkflow` A/B 首阶段、协议/定义/参数/幂等/冲突/拒绝面；`driveAppDispatchStage` 任务形状矩阵（A2/A4/A5/A7/A8/A9/A12a/A12b）、A1/A4/A7 创建即完成、AC-09、B2/A12 无任务拒绝；`observeAppDispatchTaskReport` done⇒accepted+stage.completed/重放、blocked⇒Q8 一次重试→预算耗尽、A12b light 归档接受（A12 聚合）/standard 默认重试/显式 rework（成功回执 `reworked`）/A13 高风险零重派、worker-dispatch/非应用任务/无报告拒绝；A3 卡 prompt（promptId/documentRefs/选项/推荐集）、B24 意图入口缺失、request.created 不重复；`verifyCardPrompt` 匹配/选项顺序/cardKind/documentRefs/未知 prompt/已收口/协议不符；task-state 三类新任务坏形状写侧 fail-closed；`reconcileFixedWorkflow` 已报告未收口收口、事件先写任务缺失按同一 taskId 重建、requestTaskId 不一致/dispatched 引用缺失 corrupt（且 corrupt 不记 driven）、fixed-v2.1 跳过；协议隔离（app 驱动拒绝旧协议；旧 `requestStage` 照旧）；**反向驱动守卫**（旧 `requestStage` ⇒ `stage-request-removed`、旧 `recordStageDispatch` ⇒ `workflow-protocol-mismatch`，账本零新增）；**`prepareIntent` 对 app-dispatch 不写 A3**；新协议零 stage-request、无 `.ans/trunk`/`.ans/runs` |
| `test/编排/app-dispatch-b2.test.ts` | 新增（建议项） | 3 | B2 派生 fail-closed：无名单/无边界、歧义属主、治理文档属主非策划/产品、`.ans/**`/`角色卡/**` 拒绝；正例 effectiveWritesets 精确（按角色/路径排序）；影响面 hash 漂移拒绝且零事件写入；`recordChangeScopeDecision` 幂等 replay |
| `test/桌面应用/app-dispatch-tool-surface.test.ts` | 新增 | 4 | fixed+app-dispatch/v1 幕僚：无 dispatch_task/close_created_task(v2)/redispatch_task/terminate_role_run、有 select_workflow、request_choice（customerInput）与只读工具保留、v3 资源注入（版本/磁盘 SHA256/字节）；fixed-v2.1 在飞快照（旧工具面在、select_workflow 不在、v2 资源注入）；legacy 快照不变；convener dispatch_task 在但内置目标 `convener-builtin-dispatch-forbidden`、项目 worker 绑定 open worker-dispatch（正例/未绑定/旧 stage-request/已关闭/workflow 不符/非 production）、chief 任意派发 `chief-dispatch-removed`、旧协议矩阵逐字 |
| `test/桌面应用/app-dispatch-delivery.test.ts` | 新增 | 5 | `select_workflow` 真实轮次捕获/缺失拒绝、首阶段任务投递（taskId+forced fixed、starTaskIds/taskCreators=application）、幂等重放、目标忙时只入队不打断/释放后补投递；application 报告只落 task.reported、不路由角色、自动收口推进；三卡 promptId 全链（匹配发卡一次/request.created 不重复/不一致 notPresented/已收口拒重呈/裁决后 prompt 应用收口+下一阶段投递）；A12b done 归档+A12 聚合+A13 任务、标准 blocked rework、light blocked accept-with-archive、A13 done 不完成阶段/前置不足不弹 merge-main；worker-dispatch 路由正负例；启动对账（已报告未收口、未送达补投递、旧协议不触碰） |
| `test/门禁引擎/chief-workflow-v3-resource.test.ts` | 新增 | 4 | v3 版本行恰一处/身份行/≤256 KiB/无 BOM/NUL；v1/v2/v3 git blob SHA（LF 归一）逐字稳定（v1 `53d7167…`、v2 `d528c6c…`、v3 `1aad6d7…`）；关键语义段（select_workflow/应用建任务/运营只派 worker/三卡按 prompt/A12 直派/B2 派生/merge-main/judge 不弱化/B13.2/B14/B23/B24/B27/B28/B32/停止/审计）；v3 明示旧动作面移除、v2 旧口径段仍在 |
| `test/测试/fixed-path-full-chain.test.ts` | **扩展** | +2（原 3 保留） | 新增 app-dispatch/v1 路径 A 全链（select_workflow→A1–A13：三卡 prompt、worker-dispatch、A12a/A12b、归档、merge-main 客户本人、无 stage-request/无 trunk/run）与路径 B 全链（B1 worker-dispatch→B2 应用派生 change.scope-decided→B3→B4→merge-main）；原 fixed-v2.1/legacy 全链断言保留（协议分拆见 §四） |

- 合计：**48 个 T2 用例**（新增 43 + 全链新增 2 + 原全链 3 保留）。2026-11-18 收尾修补后 service 由 16 → 19 用例。
- 未改 T1 文件：`test/roles/**` fixed 用例、`test/门禁引擎/{role-module-contract,fixed-role-module-surface,governance-matrix-fixed-view}.test.ts`、
  `test/桌面应用/b71-fixed-fail-closed.test.ts`、`test/编排/{doc-format-specs,run-role-fixed-b2}.test.ts` 等均为 T1 改动，T2 未触碰。

## 二、覆盖矩阵（设计 §九 验收点 / §九 测试清单）

| 验收点（设计 §九） | 覆盖用例 |
| --- | --- |
| ① 幕僚固定会话无派发/收口/重派/停止工具 | tool-surface：「app-dispatch/v1 幕僚工具面…」；full-chain：`assertAppDispatchChiefInjection`（v3 注入、caps.dispatchTask/closeCreatedTaskFixed/redispatchTask/terminateRoleRun 全 undefined） |
| ② 运营仅项目 worker 可派且需绑定 open worker-dispatch | tool-surface：convener 矩阵正负例；delivery：「运营 worker 派发…」route 层正负例（内置目标/未绑定/绑定允许） |
| ③ 应用建任务/观察报告/收口幂等可恢复 | service：「selectWorkflow(A)/(B)」「drive…」「observe…」全组；delivery：「application 报告…」「启动对账…」；full-chain 两条全链 |
| ④ 阶段转移与完成判定与 v2.1 等价 | definitions：next/rework 与 `WORKFLOW_STAGE_TRANSITIONS`/`WORKFLOW_REWORK_FALLBACKS` 逐项一致；service：A1/A4/A7 on-dispatch、AC-09、Q8；full-chain：13 阶段完成判定实测（A9 basis、A11 branch tip、A12b 归档+A12 聚合） |
| ⑤ 三卡+merge-main 与 judge 不弱化 | full-chain A：3 卡各一次 + merge-main 客户本人、cardKinds.length=4、无 acceptance 卡；v3 资源测试：judge 不可代批文本；旧链保留 judge 尝试拒绝（merge-main）用例。judge 代批在 app-dispatch 三卡上的直接代批路径未新增（见 §五披露） |
| ⑥ 在飞协议隔离 | service：「协议隔离…」（app 驱动 `workflow-protocol-mismatch`、reconcile 跳过、旧 `requestStage` 照旧）；tool-surface：fixed-v2.1 旧工具面/资源快照；full-chain 旧 A/B/无仓库用例保留并通过 |
| ⑦ 零新依赖 | 仅测试文件；`package.json` 未改 |
| ⑧ legacy 零回归 | 三套 known-red 0 命中；`test/编排` 1419 用例 0 fail（收尾修补后复跑）；旧 fixed-v2.1/legacy 全链通过（协议分拆见 §四） |
| 定义注册表校验（阶段全覆盖/转移/返工/执行者/完成条件） | definitions 全文件 |
| 应用建任务/收口/卡 prompt 精确匹配 | service + delivery + full-chain |
| 运营越权内置拒绝 / worker 绑定 | tool-surface + delivery |
| 重启对账 / 崩溃点矩阵 | service：reconcile（已报告未收口、任务缺失重建、requestTaskId 不一致、dispatched 引用缺失）；delivery：启动对账/投递一致性 |
| B13–B34 回归 | 定义 taskText 断言（B26/B27/B28/B31/B32）；full-chain A/B 实测应用算 hash、A3 卡门/归档/写集/提交；旧链逐字保留 |
| fixed-path-full-chain 新协议 | full-chain 新增 A/B 两条 app-dispatch 全链 |

## 三、验证输出

### 3.1 typecheck
- `npm run typecheck` → **0 错误**（T1 并行批已更新 `role-module-contract` 14→15 类型钉；T2 新增文件零错误）。

### 3.2 T2 测试集（7 文件，`node --test --test-concurrency=1`）
```
tests 48 / pass 48 / fail 0 / skipped 0 / duration 17302.00ms
```
- 全链耗时（同一运行）：旧 fixed-v2.1 路径 A 2744ms、旧路径 B 1856ms；**app-dispatch 路径 A 2105ms、路径 B 1772ms**。
- 分文件：definitions 8/8、service 19/19、b2 3/3、tool-surface 4/4、delivery 5/5、v3-resource 4/4、full-chain 5/5。

### 3.3 known-red 三套核对（冻结名单逐名比对）
| 套 | 运行范围 | tests / pass / fail | 冻结名命中 |
| --- | --- | --- | --- |
| runtime-core-33 | `test/runtime-core/**/*.test.ts` | 607 / 603 / 0（4 skipped） | **0** |
| gates-5 | `test/门禁引擎/**/*.test.ts` | 581 / 571 / 9（1 skipped；移开并发会话空目录后） | **0** |
| orchestration-24 | `test/编排/**/*.test.ts` | 1419 / 1417 / 0（2 skipped；收尾修补后复跑） | **0** |

- gates 的 9 个失败均为**既有 CRLF 环境差异**（B7.1 ×2、B9.1 ×2、B9.2 ×2、B32、B34、`Chief资源正文独立…`），
  按门禁批记录 §6.5 口径：测试以 LF 冻结常量比较 CRLF 检出，与本批无关；冻结 `gates-5` 名单 0 命中。
- 另：工作树存在并发会话留下的**未跟踪目录 `角色卡/策划/`**（含策划/规划记录，无 role-card.md），会让
  `test/门禁引擎/list-project.test.ts` 出现额外 warning（冻结名单第 3 名）。核对该名单时把该目录临时移出
  （同卷临时路径）+ 运行 + 原样移回（mv 保留全部内容）；移出后 `list-project.test.ts` 18/18 全绿，冻结名单命中 **0**。T2 未删除/改动该目录内容。

### 3.4 2026-11-18 收尾修补回归（rework 回执 + 3 条回归）
编排批收尾修补落地后，T2 同步更新并回归（均为 `test/编排/app-dispatch-service.test.ts`）：
1. **observe rework 成功回执**：`observed.ok === true`、`reworked = { reworkOf:"A12b", stage:"A11", attempt:2 }`、
   `retried/blocked === undefined`、`stageCompleted === false`；随后 drive 仍产出 A11 attempt 2（新幂等键）。
2. **反向驱动守卫**：对 app-dispatch/v1 workflow 调用旧 `requestStage` ⇒ 实际稳定码 **`stage-request-removed`**
   （注意：与协调口径预期的 `workflow-protocol-mismatch` 不同，按实现如实断言并在 §5.2 记录）；旧
   `recordStageDispatch` ⇒ `workflow-protocol-mismatch`；两者均零 workflow/task 事件新增（无 stage.requested/
   task.created/stage.dispatched）、不建任务。
3. **prepareIntent 不写 A3**：对 app-dispatch workflow 返回 `ok:true` 的应用意图证据（documentRefs/marker），
   零 workflow/task 事件新增、无 request.created、无 A3 任务。
4. **reconcile corrupt 不记 driven**：requestTaskId 不一致 / stage.dispatched 引用缺失两种不一致均
   `corrupt` 非空且 `driven === undefined`（不误判为已修复）。
- 验证：typecheck 0；T2 7 文件 **48/48**（service 19/19），duration 17302ms；收尾修补后 `test/编排` 复跑
  **1419 / 1417 / 0**（2 skipped，known-red 24 名 0 命中）。

## 四、对既有全链文件的协议分拆（预期变更，非放宽）

1. **空项目幕僚聊天默认协议已变**：桌面批 §三口径「无 workflow 的新项目 = app-dispatch/v1」。旧路径 A 用例开头
   的空项目聊天原断言「fixed-v2.1/注入 v2」不再成立（生产行为已按新协议切换）。T2 处理：
   - 空项目聊天入口改断言 `assertAppDispatchChiefEntry` + `assertAppDispatchChiefInjection`（v3 资源、
     select_workflow、旧动作面缺席）；
   - 首个 stage-request 仍由该聊天经旧路由发出（协议未知 ⇒ 旧矩阵逐字），启动 fixed-v2.1；
   - 任务绑定 chief 会话（协议=fixed-v2.1）再运行原 **`assertFixedChiefChatInjection`**（v2 资源/旧工具面
     断言全部保留）；镜像打开时去掉 taskId（真实 run-role 会校验任务受派人；协议/模式常量保持 captured 真值）。
2. **fixed chief 模块 context 段标题已按门禁文本批改写**：旧 token「固定路径产线调度」→「固定路径流程选择与驱动」
   （`src/common/roles/chief/internal/context.ts` 固定段按 app-dispatch 口径改写；fixed-v2.1 会话同样注入该段）。
   旧断言仅此 token 更新，其余（v2 资源 SHA/字节、能力面）逐字保留。
3. 旧路径 B/无仓库用例仅 `assertFixedChiefChatEntry`（应用层入参）断言，仍逐字通过；旧 fixed-v2.1 链的
   stage-request/派发/收口/发布断言全部保留。

## 五、披露 / 未覆盖 / 生产疑点（报告不改）

### 5.1 未覆盖
- **B1 rapporteur 回退分支**（契约/结构缺口 ⇒ 应用直派 rapporteur）：定义层断言 fallbackExecutor；执行路径
  编排批记录 §六明确留待后续 API/桌面策略，T2 未构造该分支 e2e。
- **worker-dispatch blocked 报告策略**：桌面不自动 blocked 阶段（Q6），T2 只断言应用观察拒绝收口及运营收口正例；
  blocked 处置留待后续策略。
- **judge 代批**：app-dispatch 三卡仍走既有 `GOVERNANCE_CARD_GROUP` 卡生命周期（未改代码），T2 未新增 judge
  代批 e2e；merge-main 的 judge 拒绝由旧链用例保留 + v3 资源文本断言。
- **A13/B4 merge-main 在 delivery 测试**只断言「报告/收口不完成阶段、前置不足不弹卡」；真实呈卡/合并由
  full-chain A/B 覆盖（客户本人 approve、release 账本、本地合并）。
- **可选文件 `app-dispatch-crash-recovery.test.ts` 未单列**：崩溃/对账矩阵已并入 service（重建/corrupt/已报告
  未收口）与 delivery（投递一致性/启动对账），不另建重复文件。
- 真实模型/Electron 全链未运行（测试批范围；设计 §九「真实全链一次另行授权」）。

### 5.2 生产疑点（测试发现；1–3 已由 2026-11-18 收尾修补落地并由 §3.4 回归覆盖；4 仍开放）
1. **旧驱动反向写入（已修）**：`requestStage` 现对 app-dispatch/v1 返回 **`stage-request-removed`**（新稳定码，
   已进 `APP_DISPATCH_FAILURE_CODES`）；`recordStageDispatch` 返回 `workflow-protocol-mismatch`；两者在任何
   账本/任务写入前 fail-closed。T2 回归断言零新增事件。注意与协调口径的差异：requestStage 实际码不是
   `workflow-protocol-mismatch`。
2. **observe rework 失败码（已修）**：`decision:"rework"` 成功写 `stage.reworked A12b→A11` 后返回 `ok:true`，
   receipt 携带 `reworked = {reworkOf, stage, attempt}`；不再尝试重驱原阶段。
3. **reconcile corrupt 与 driven 并存（已修）**：任何 corrupt 结论都会删除 `driven`（含 requestTaskId 不一致与
   stage.dispatched 引用缺失两路径），避免调用方误判为已修复。
4. **`resolveAppDispatchReviewRole` 名单不可读时静默回落 verifier**（Q3 默认内置 verifier 的口径）；
   若名单损坏可能弱化「roster reviewRoleId 优先」的审计可见性，建议诊断记录（仍开放，未改）。

### 5.3 约束声明
- T2 只写：上表 6 个新文件 + `test/测试/fixed-path-full-chain.test.ts` + 本记录。
- 未改生产代码/资源/角色卡/边界/发布配置；未 commit/push/CI/tag/main；未读 `.env`；未占用
  9222/9223/9224；测试仅临时目录/假会话/假时间，无端口/网络。

*本记录供协调方/测试负责人核对；不构成合并/发布授权。*
