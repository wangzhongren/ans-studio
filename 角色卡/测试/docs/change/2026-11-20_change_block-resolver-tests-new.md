# 变更记录：block resolver 测试批 R4b（新增 resolver 测试矩阵）

- 日期：2026-11-20
- 角色：ANS 内置「测试」（roleId: 测试）
- 工作树：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\feat-block-resolver`
  （分支 `feat/block-resolver`，HEAD `694ea9c` + R1/R2/R3 未提交实现 + R4a 未提交测试改动）
- 权威依据：`docs/planning/2026-11-20_design_block-resolution-paths.md`（§三–§七、§8.1 T-1–T-12、
  §8.2 AC-1–AC-10、§九 Q1–Q10 默认）；R1 记录 `角色卡/编排/docs/change/2026-11-20_change_block-resolver-foundation.md`；
  R2 记录 `角色卡/桌面窗口/docs/change/2026-11-20_change_block-resolver-desktop.md`；
  R3 记录 `角色卡/门禁引擎/docs/change/2026-11-20_change_block-resolver-texts.md`（§五 T-12 断言口径）。
- 范围：**只新增 6 个测试文件**。未改生产代码、未改既有测试（含 R4a 文件）、workflow 资源、release 配置；
  未 commit/push/CI/tag/main；未读 `.env`；未占 9222/9223/9224；测试只用临时目录/假会话/临时账本。
- 状态：**R4b 完成（未提交；已同步 R2 2026-11-20 收尾修补）**。新增 63 个用例；typecheck **0 错误**；
  新增 6 文件 + `fixed-path-full-chain` 合跑 **68/68 pass / 0 fail / 11.69s**；三套 known-red 名单
  **0 命中（33/5/24）**，名单文件未改（SHA-256 见 §四）。
- R2 收尾修补同步（同日，只改本批测试/记录）：`deriveRepairBinding` 从 `workflow.started`/视图派生
  flowId/stage、不可得/冲突 ⇒ blockId-only repair 任务（不再 invalid-task-binding 降级）；卡 flowId
  确定性回退（`block-<blockId12>`）；`options.timings` 并入策略（stall fact 同源）；拒绝/stage.blocked
  适配器转发证据；P27 同链复用。本批 T-9 后半段、shell 回退、stall 计时与适配器证据断言已按新行为更新（§三.6）。

## 一、新增文件与用例清单

| 文件 | 用例数 | 覆盖摘要 |
| --- | ---: | --- |
| `test/编排/block-resolution.test.ts` | 15 | 9 类定义/优先级/码表与二级码；P1–P51 分类矩阵（`BLOCK_POINTS`/`blockFactForPoint` 逐点 expectedClass/allowedClasses）；P1–P51 路由矩阵（expectedRoute + 每点位恰一产物：引擎/属主 repair/卡/升级）；无 stop 不变量（枚举/决策/推荐非终止）；重复阈值（B7 优先于 highRisk/detail/code；策略可配 ≥2）；指纹/blockId/幂等键稳定（summary 不参与、证据 hash 排序、协议/工作流/阶段/任务/码参与）；卡选项装配（每类 2–4、恰一推荐、主权标记、judge 面仅 block-decision、`blockCardAllowsJudge` 负例、`validateBlockCardOptions` 精确错误）；推荐项策略；逐类路由语义（B1 属主/客户物料、B2 授权/引擎/属主、B3 judge/客户、B4 主权、B5 有界/安全门/上限、B6 引擎/属主/客户、B8 返工、B9 judge 仅 judgeEligible）；计时默认 12/10/30min 与非法值回落；事实适配器（stage.blocked/task.reported 三态/拒绝含证据转发/reconcile corrupt+errors/stall 排除与阈值/shell 7 因映射） |
| `test/编排/block-ledger.test.ts` | 11 | schema `block/v1` 写入/读取（`.ans/state/blocks.jsonl`、事件逐字段、证据 `path#sha256=`、幂等键）；raised→routed(owner-repair)→resolved(fixed) 生命周期与投影（owner/waitingOn/routeTaskId/routings）；decided provenance（仅 judge/customer + decisionId；fixed 可属主/引擎）；escalated 非终态（必须先 routed 再 resolved；升级后可重路由；非法 to/reason/from 拒绝）；replay 幂等（同 blockId 不重复 raised、同幂等键 first-wins）；坏行 fail-closed（读写都拒绝 `block-ledger-corrupt`，零追加）；`isBlockLedgerEvent` 负例（`resolution=stopped`、缺 decisionId、route=escalated、非法形状/枚举）；`replayBlockLifecycles` 非法顺序 errors；R1 收尾修补投影（两次 routed 保留 taskId/cardRequestId，最新链接不沿用旧值）；重复阈值（第 2 块 B7、raised 状态只允许 escalated、升级后路由/结算、threshold=3）；open blocks 摘要（status/owner/waitingOn/ageMs/证据/过滤/limit/escalated open） |
| `test/桌面应用/block-router.test.ts` | 18 | 事实源→raised/routed：stage.blocked 扫描（仅最新未被取代；协议取 workflow.started；同 tick routed；tick 幂等）、task.reported（blocked/failed；done 不入块；app-dispatch stage-execution 跳过且不收口）、fixed 派发拒绝（系统行简报/零任务/零工作流写入/nextActions）、shell 拒绝（judge-deny ⇒ B2 客户授权卡；观察端口事实入账 + 卡 flowId 确定性回退仍出卡；operator outcome 映射）、reconcile（可修⇒engine fixed+重驱动；不可修⇒升级属主修复任务；deriveRepairBinding 派生绑定/blockId-only 两种合法形态 + 冲突不绑定；不改写历史）、引擎有界（策略 0 直接属主；恢复重放受上限⇒escalate budget）、app-dispatch 修复任务（from application/taskKind repair/blockId/幂等键/requestedEvidence/投递/不触发阶段完成/证据 sha256 重算⇒fixed+重驱动）、T-6 证据不符/缺失（任务 rejected+升级+第 2 任务⇒fixed；blocked 报告不判 fixed）、fixed-v2.1 修复简报 + T_repair（10min 首次换属主、二次客户卡、客户裁决）、judge 开+唯一推荐（by judge+真实 decisionId+judge 审计；无客户卡）、开关关闭客户卡（接受限制⇒decided+披露）、judge 结果行不可用（judgeNotice 客户卡回落）、主权/终止（judge 永不选；客户终止⇒confirmStop 停稳→workflow.closed stopped→block decided；通道防御；无 workflow 终止不伪造 stopped）、卡未答不执行、同 block 卡幂等（requestId 确定、一张卡、重复观察 escalate repeat）、一项目一卡排队、T_remind 一次不重弹、重复同指纹只 escalated 一次、恢复对账（raised 补路由/已答卡按账本执行/已报告修复重启收口）、review 名单不可读⇒route rapporteur（不回落 verifier） |
| `test/桌面应用/block-resolver-projects.test.ts` | 6 | project_state `openBlocks`（class/status/owner/waitingOn/ageMs/routeTaskId/cardRequestId/routeKind；resolved 不展示；workflow 投影同源；`[blocks]` 摘要可见）；旧项目无账本字段缺席；角色裁剪（flowId 缺席不展示）；坏行 `block-ledger-bad-lines` 警告；T-7 stall 精确边界（59.999s 不报、恰 T_stall 报、同 workflow 不重复）；排除面（在飞回合/待答卡/open 修复任务/近期进度/已关闭/stopping）；T_repair/T_stall 注入时钟精确边界且同一超时只升级一次 |
| `test/测试/block-resolver-protocols.test.ts` | 5 | 定义双版本（v1 `blocked` 逐字、v2 `route-block-resolver`、阶段集合仅 onExhausted 不同、v1/v2 hash 冻结 `ef7720c1…`/`4bea23eb…`、缺省 v2、version 3 拒绝、注册表自检）；fixed-v2.1 在飞零迁移（只写 blocks 账本、workflows/tasks 字节不变、零任务、简报走 system 投递/同步拒绝系统行、无 trunk/runs）；app-dispatch/v1 旧定义在飞（definition v1+hash 不变、resolver 追加应用修复任务、零阶段写入）；同项目两协议混跑（各自协议成块、仅 app 建任务、fixed system 简报、互不串扰）；新 `select_workflow` 钉 v2 定义/hash |
| `test/门禁引擎/block-resolver-texts.test.ts` | 8 | v3 身份/体积/BOM；v1/v2 资源 git blob SHA 逐字冻结（`53d7167…`/`d528c6c…`）且 v3 独立；v3 positive 23 条（如实报告即路由输入/应用按类路由/不空转/不代选/不越权 shell/终止仅客户 decided/生命周期无 stopped/escalated 非终态/T_repair/T_remind/block 卡 requestId/card-prompt-mismatch/不得重弹/无答复不执行/blocks.jsonl/raised→routed/不计入三卡/A12 路由处置）；v3 negative 具体旧句（`stage.blocked` 交客户/运营、无法恢复按停止面、三选一、停止并如实上报）；合法停止语义保留（动作面「不停止」、停止由客户/应用命令、stop-unconfirmed、不写 stopped）；六角色 fixed positive（如实报告即路由输入/不空转/不代选/重弹约束；非 chief 角色 repairId）；convener fixed 覆盖 legacy 停住默认出路且不自行同文重试；verifier「无运行期通道不是停的理由」；chief fixed 段 id/顺序冻结与 block 卡 prompt/blockId/回执/A12/决策纪律；legacy 冻结（convener legacy「无可行方案如实停止」仍在；legacy 上下文无新路由句） |

合计新增：**6 文件 / 63 用例**。可选第 7 文件（`block-resolver-full-chain.test.ts`）**未新增**（见 §六 披露 1）。

## 二、覆盖矩阵（T-1–T-12 / AC-1–AC-10）

| T | 覆盖位置 | 状态 |
| --- | --- | --- |
| T-1 分类矩阵 P1–P51 | block-resolution「T-1」逐点（51/51，canonical 事实 + summary 不参与） | ✅ |
| T-2 路由矩阵（每类产物） | block-resolution「T-2」逐点（51/51，kind/owner/repair/选项/升级产物；无 stop） | ✅ |
| T-3 judge 开/关/manual 回落 | block-router「T-3」×2（by judge+decisionId+结果行；开关关客户卡；结果行失败 judgeNotice 客户卡）；真实 `createCustomerInputChannel` | ✅（manual 以结果行失败代表；无唯一推荐由 R1 装配保证不可达） |
| T-4 高风险负例 | block-resolution 卡选项负例 + block-router 主权/终止（judge 0 结果行；通道防御；客户终止 decided）；`isApplicationDecisionReservedForCustomer` 既有测试未改 | ✅ |
| T-5 卡幂等/防重/排队 | block-router「T-5」×3（未答不执行、requestId 一张卡、重复观察 repeat、一项目一卡排队）；block-ledger 重复阈值 | ✅ |
| T-6 修复证据 | block-router「T-6」×2（错误 hash/缺失证据不判 fixed；补齐⇒fixed；blocked 报告不判 fixed；不触发阶段完成） | ✅ |
| T-7 停滞回归 | block-resolver-projects（边界 + 排除面 + 同 tick 一次升级）；driver gate 未模拟（§六.2） | ✅（产品侧）/ ◐（driver 时序） |
| T-8 Q8/高风险零重派/旧定义 | block-router（B9/B4 路由到客户卡；fixed-v2.1 简报/上限）；protocols（v1 `blocked` 在飞按旧值、v2 `route-block-resolver`） | ✅ |
| T-9 reconcile corrupt | block-router（可修⇒engine fixed+重驱动；不可修⇒升级属主修复任务；`deriveRepairBinding` 派生绑定/blockId-only 两种合法形态 + 冲突不绑定；不改写历史） | ✅ |
| T-10 双协议 | block-resolver-protocols ×5（fixed-v2.1 零迁移、app-dispatch v1 旧定义在飞、混跑、新 select v2） | ✅ |
| T-11 审计完整性/重放 | block-ledger（schema/生命周期/replay/坏行/provenance/routings/摘要） | ✅ |
| T-12 角色文本 | block-resolver-texts ×8（positive/negative/合法 stop/v1+v2 冻结/legacy 冻结） | ✅ |

| AC | 覆盖 |
| --- | --- |
| AC-1 无 stop 终态 | block-resolution 无 stop 不变量；block-ledger `resolution=stopped` 拒绝；block-router 终止⇒block decided + `workflow.closed stopped`（客户决定结果） |
| AC-2 P1–P51 全覆盖 | T-1/T-2 51/51 逐点；`validateBlockPointMatrix()` 空 |
| AC-3 禁止无声暂停 | stage.blocked 同 tick raised→routed；project_state `openBlocks`/`[blocks]`；卡等待/修复任务可见 |
| AC-4 judge 语义 | T-3/T-4；by judge 必带真实 decisionId（账本层面也拒绝缺失）；主权/终止负例零通过 |
| AC-5 修复闭环 | B1 缺契约：修复任务→证据 sha256 重算→fixed→重驱动（E2E）；B5/B6 引擎可修（reconcile）fixed；B5 环境证据闭环未单独 E2E（§六.1） |
| AC-6 决策闭环 | B3：judge 代选/客户卡；客户接受限制⇒decided+披露；终止⇒停稳+披露；选项执行（revise⇒属主修复动作） |
| AC-7 停滞兜底 | T-7 边界/排除；RR driver gate 未模拟（§六.2） |
| AC-8 双协议 | T-10；fixed-v2.1 既有测试不改期望（`fixed-path-full-chain` 68 合跑内 5/5） |
| AC-9 审计/幂等 | T-5/T-11；账本重放一致、坏行 fail-closed |
| AC-10 角色文本 | T-12；无新增客户可见门（texts 只断言既有段） |

## 三、验证

1. **typecheck**：`npm run typecheck`（cwd=worktree）**0 错误**（含 R4a 未提交测试改动与 R2 收尾修补）。
2. **新增文件 + fixed-path-full-chain**（`node --test --test-concurrency=1` 7 文件）：
   **tests 68 / pass 68 / fail 0 / skipped 0 / duration 11.69s**。
3. 分文件（单独运行）：block-resolution **15/15**、block-ledger **11/11**、block-router **18/18**、
   block-resolver-projects **6/6**、block-resolver-protocols **5/5**、block-resolver-texts **8/8**、
   `fixed-path-full-chain` **5/5**。
4. R4a 触达文件复核（只读，不修改）：`stuck-redispatch` + `app-dispatch-delivery` + `chief-workflow-v3-resource`
   **19/19 pass**（v3 冻结 SHA 已刷新为 `f3ee151…`）。
5. 未运行 Electron/真实模型；未占调试端口；未读 `.env`；未 commit/push/CI/tag/main。
6. **R2 收尾修补同步复跑**（2026-11-20，T-9/shell/stall/适配器断言更新后）：受影响 3 文件
   （block-resolution + block-router + block-resolver-projects）**39/39 pass**；7 文件合跑 **68/68 pass**
   （11.69s）；typecheck 0。T-9 后半段现断言：派生绑定（workflow.started ⇒ flowId + 当前 stage）、
   blockId-only（无 workflowId/flowId/stage、`block-repair:<id>:2`、24hex blockId、文本「不伪造阶段」）、
   冲突不绑定；无 invalid-task-binding 系统行；工作流账本零新增、任务零伪造收口。shell 观察端口断言
   `block-<blockId12>` 回退 flowId + 预览「应用回退」且客户可裁决。stall 用 `options.timings` 覆盖。
   适配器断言拒绝/stage.blocked 转发 `evidencePaths/evidenceHashes`。

## 四、known-red 核对（三套冻结名单）

| 名单 | 文件 SHA-256（未改） | 域运行 | 结果 |
| --- | --- | --- | --- |
| runtime-core-33 | `973c918f1eb6ad793442fdfba06aa6117bae8cc6c388b977e6ae855e2d2c6421` | `test/runtime-core/*.test.ts`：607 tests / 603 pass / 0 fail / 4 skipped | **0 命中** |
| gates-5 | `8325f9d8f24a7aeda3899be9187297744bf517c1975ddaf9c9dc0fcd860139f2` | `test/gates/*.test.ts`：29 tests / 29 pass / 0 fail | **0 命中** |
| orchestration-24 | `f9513fb0e9578a260fe20ee3643d1980d5135f4c24b479fbd3b3bdd279547804` | `test/编排/*.test.ts`：1446 tests / 1444 pass / 0 fail / 2 skipped | **0 命中** |

- 名单文件均无 git 改动（`git status` 空），名集与内容不变；三域 0 失败 ⇒ 62 名逐名 0 命中。
- 2/0/4 个 skipped 为既有（非本批新增；本批新文件无 skip/force-exit）。
- 新增用例未进入任何 known-red 名单；R4a 在飞改动已使此前的版本/review-role 预期红转绿（本批未触碰其文件）。
- 证据（未跟踪）：`.tmp-r4b-orch.tap`、`.tmp-r4b-gates.tap`、`.tmp-r4b-runtime-core.tap`。

## 五、生产疑点（报告不改；均为只读实测）

### 已由 R2 2026-11-20 收尾修补修复（本批断言已同步）

1. **拒绝适配器丢证据**（原疑点）：`blockFactFromDispatchRejection` / `blockFactFromServiceFailure` /
   `blockFactFromStageBlocked` 已转发 `evidencePaths/evidenceHashes`；本批断言拒绝与 stage.blocked
   适配器携带证据（block-resolution 适配器用例）。
2. **修复任务绑定校验失败**（原疑点）：`deriveRepairBinding` 从 `workflow.started`/视图派生 flowId/stage；
   不可得或事实与账本 flowId 冲突 ⇒ **blockId-only repair 任务**（from=application、`block-repair:`
   幂等键、24hex blockId、无伪造 stage），不再 `invalid-task-binding` 降级。本批 T-9 三分支断言
   （派生/无账本/冲突）+ 工作流账本零新增、任务零伪造收口。
3. **`BlockRouterOptions.timings.stallMs` 未生效**（原疑点）：`options.timings` 已并入策略
   （stall fact 与 T_repair/T_remind 同源）；本批 stall 用例改用 `options.timings` 精确边界断言。
4. **shell 观察端口无 flowId**（原疑点）：`resolveCardFlowId` 确定性回退（事实 → 关联任务 → workflow.started
   → `block-<blockId12>`，只作卡审计/排队作用域）；本批断言观察端口回退卡呈现、`flowId=block-<id12>`、
   预览「应用回退」、客户可裁决。

### 仍开放 / 说明

5. **T-9 设计措辞差异**：设计写「不可修⇒B6 决策卡」，实现先升级属主修复任务（repair-first），
   客户卡在 T_repair 超时后出现。与设计 §5.4 修复闭环一致，但与 T-9 行文不完全一致（披露，非缺陷）。
6. **R2 记录 §八 的 R1 投影缺陷已由 R1 §八修复**（routed taskId/cardRequestId 已入 `BlockLifecycle.routings`
   与摘要）；R2 记录文字为历史状态，本批断言按现行实现（已修）。
7. 既有代码事实（非本批）：`decideBlockRoute` 对 B5 在 `attempts >= maxAutoFix` 时直接判属主（不经
   escalate/budget）；`maxAutoFixAttempts=0` 首块无引擎尝试（测试按此精确断言）。
8. **P27 同链复用**（R2 收尾修补）：`escalateRedispatchBlock` 对已 resolved 的 block 复用裁决、不回退旧
   `task-escalation-*`；本批未新增 P27 用例（既有 stuck-redispatch 由 R4a 覆盖），披露。

## 六、披露 / 未覆盖

1. **可选第 7 文件未新增**：`block-resolver-full-chain.test.ts` 未创建；两条端到端闭环已覆盖在
   block-router 内（blocked→修复任务→证据重算→fixed→重驱动；决策卡 judge/客户→decided→选项执行/披露）。
2. **AC-7 driver 时序未模拟**：RR driver `stalled-no-progress`/`blocked-unrecovered` 属测试驱动侧，
   本批只验证产品 router 先行（T_stall 到点先 raised/routed）；「driver gate 迟于 router」需 RR harness，
   未在本批范围。
3. **AC-5 B5 环境证据闭环**未单独 E2E（B5 引擎失败→属主；B1/B6 证据闭环已覆盖）。
4. **T-3 无唯一推荐 manual** 在 router 路由层不可达（R1 装配恒恰一推荐）；以「judge 结果行不可用」回落
   覆盖 manual/不可用面，Channel 层无唯一推荐行为由既有 2026-11-20 smoke/既有测试覆盖（本批不改其文件）。
5. 未修改 R4a 文件；工作树中 R4a 改动（7 个既有测试）与本批新增文件互不重叠。
6. 未新增依赖/DSL；未改生产代码；未 commit/push/CI/tag/main。
