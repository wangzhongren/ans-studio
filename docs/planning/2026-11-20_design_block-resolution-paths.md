# 设计提案：Block 解法路由——所有 block 都必须有解法（2026-11-20）

- 日期：2026-11-20
- 角色：ANS 内置角色「策划」（业务策划；独立固定上下文）
- 状态：**设计提案（草案 v1）**。客户 2026-11-20 原则已给定方向，协调方同日裁定覆盖原任务书第 3 点（取消 stopped-with-disclosure 终态）。本文件只出设计，**不改代码/测试/角色卡/边界**，不合并、不发布、不触发 CI。
- 依据：
  - 客户 2026-11-20 原话：「所有的 block 应该都要有解法，就是不是说卡住就暂停。如果是缺少文件卡住，应该让对应的人修复；如果是业务上的取舍卡住，应该让客户来决策；如果替我决策是开的，就让替我决策。如果没有就应该弹出卡片来让我决策。」
  - 协调方 2026-11-20 裁定（覆盖原任务书第 3 点）：「**取消 stopped-with-disclosure 终态——没有这种情况**。即：**不存在任何允许停住的 block**。每个 block 必须收敛到两种终态之一：①**fixed**：路由给对应责任角色/引擎自动恢复修复；②**decided**：业务取舍由 judge（代决策开启时）或客户卡裁决后继续。安全/高危场景也走 decided（高危动作必须客户卡，不可代批——这是决策而非停止）；不可恢复/损坏场景也必须转化为「属主修复任务」（如重建账本、补证、回滚至一致状态）或「客户决策（接受现状/更换方案）」，不得以 stop 结束。审计事件保留 block 生命周期（raised→routed→resolved/escalated），escalated 的语义是「升级为更高级修复/客户决策」，不是停止。」
  - 语境：`角色卡/测试/docs/change/2026-11-16_remediation-plan.md`；`docs/planning/2026-11-17_design_app-dispatch-builtins.md`；`docs/planning/2026-11-10_design_two-fixed-workflow-paths.md`；`docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`；`docs/planning/2026-10-31_design_shell-deny-customer-escalation.md`。
- 基线：本 worktree `C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`，分支 `feat/post-2.1.0`，HEAD `caf0acf`（v2.1.0 已发布；`main` 基线 `75284d2`）。app-dispatch 分支 `feat/app-dispatch-builtins`（worktree `.claude/worktrees/feat-app-dispatch-builtins`，HEAD 同为 `caf0acf`，**67 项未提交改动：51 修改 + 1 重命名 + 15 未跟踪；已暂停**）仅作只读核对。
- 标记约定：**[事实]** 只读核实的现行代码/文档行为；**[设计]** 本提案提议、未实施；**[默认]** 本提案推荐取舍，列入 §九 未决项；**[待确认]** 需协调方/客户确认。
- 纪律：本轮只写文档（本文 + 策划记录）；未改代码/测试/角色卡/边界/schema，未运行产品/测试/Electron，未读 `.env`，未合并/发布。

---

## 〇、摘要（先读这段）

1. **总原则**：block 不是终点，是**路由输入**。任何 block 都必须在**有限步内**收敛到两种终态之一：**fixed**（引擎自动恢复或属主修复后重入场）或 **decided**（judge 代决策或客户卡裁决后继续）。**不存在 stopped-with-disclosure 终态**；所有原「停住/空转/交人后不管」的点位逐一映射到 fixed 或 decided。
2. **分类学 9 类**：缺文件/资源、缺能力/权限、范围歧义/业务取舍、高风险动作、环境/基础设施、协议/对账、重复拒绝循环、模型行为异常、预算/配额耗尽（原要求 8 类 + 预算单列）。每类给出确定性判定依据（**只认代码/账本事实，不采信模型自报**）、责任归属（属主角色 / 引擎 / 客户 / judge）与修复动作形态。
3. **决策路由**：业务取舍类 block 先查「替我决策」开关——开启且卡在 `decision` 组、有唯一推荐项、不属于客户主权词汇时由 judge 代决策（如实 `by:"judge"` + judge 审计 + `decisionId`，沿用既有语义）；未开启、judge 不可代批或 judge 判 `manual`/不可用时，**必须弹出客户决策卡**（证据/选项/推荐/默认；无答复不执行）。高危动作（`merge-main`、`stable-write`、shell 授权等）**永远客户本人**，judge 只能转人工/拒绝。禁止无声暂停。
4. **现点位 51 个（6 族）**：账本/终态 9、派发/拒绝码 14、报告/重试/升级 11、shell/审批 5、环境/看护 8、测试驱动 4。清单见 §二（P1–P51），逐项给出「现在怎样 → 新语义下怎样」。今天真实运行史（RR26 12 分钟空转、RR27 blocked-unrecovered、RR31 B2 死结+shell 卡、RR34 误用 stage-request 等）全部可归入该清单。
5. **落地形态**：应用侧确定性模块（纯分类器 `block-resolution.ts` + 桌面 router + append-only `blocks.jsonl` + 决策卡/修复任务执行器），角色文本只做「如实报告 + 不空转 + 不越权」的减法。**兼容两种协议**：fixed-v2.1 在飞（stage-request 旧驱动）逐字保留，router 只消费既有事实（`stage.blocked`/拒绝回执/报告/对账结果），不改阶段状态机；app-dispatch/v1 把 `retry.onExhausted:"blocked"` 语义改为「交 block resolver」，并把 `reconcile` 的 `corrupt` 结论接入路由。
6. **最大风险**：把「路由」实现成自动无限重试或自动代选，或把尚未裁决的 block 记成已解决（假性 fixed）；以及新决策卡扩大客户可见门、judge 越权代批业务/高危事项。设计以「证据由应用计算、终态必须带审计事实、重复指纹必升级」三条防线约束。

---

## 一、客户原则与最新裁定

### 1.1 客户原话（2026-11-20）

> 「所有的 block 应该都要有解法，就是不是说卡住就暂停。如果是缺少文件卡住，应该让对应的人修复；如果是业务上的取舍卡住，应该让客户来决策；如果替我决策是开的，就让替我决策。如果没有就应该弹出卡片来让我决策。」

拆成四条可执行要求：

| # | 要求 | 本设计的落点 |
| --- | --- | --- |
| C-1 | block ≠ 暂停：不能卡住就停、不能不处置 | 每个 block 必须有 `block.routed`（可见的修复任务或决策卡或自动修复在跑），否则视为应用缺陷（§五不变量） |
| C-2 | 缺文件/资源 ⇒ 对应的人修复 | 分类 B1/B2/B5：属主修复任务（补证任务）或引擎自动恢复，产出证据后自动重入场 |
| C-3 | 业务取舍 ⇒ 客户决策；「替我决策」开启时 judge 代决策 | 分类 B3/B4/B9：决策卡；按开关与分组决定 judge 或客户（§四） |
| C-4 | 没有可用的代决策 ⇒ 必须弹卡，不得静默 | judge 关闭、不可用、无唯一推荐、manual、客户主权卡 ⇒ **客户决策卡**（§四.4/§四.6） |

### 1.2 协调方 2026-11-20 裁定（覆盖原任务书第 3 点）

- **取消 `stopped-with-disclosure` 终态**；block 终态只有 `fixed` 与 `decided`。
- **安全/高危**不是 stop，是 `decided`（必须客户卡；judge 不可代批）。
- **不可恢复/损坏**（对账 corrupt、账本损坏、重试耗尽、预算耗尽）不得以 stop 结束，必须转为：
  - 属主修复任务（重建账本、补证、回滚到一致状态），或
  - 客户决策（接受现状/更换方案/显式终止本次流程——终止是客户决策的结果，不是 block 的终态）。
- 审计保留 block 生命周期 `raised → routed → resolved / escalated`；`escalated` = **升级为更高级修复/客户决策**，不是停止。

### 1.3 本设计的不变量（后文全部服从）

| # | 不变量 | 检查方式（测试/审计） |
| --- | --- | --- |
| I-1 | 每个 block 记录最终 `resolution ∈ {fixed, decided}`；**不存在 `stopped` 终态** | `blocks.jsonl` 全量扫描 + 路由矩阵测试 |
| I-2 | 每个 `raised` 在一个应用 tick 内必有 `routed`（指向修复任务/决策卡/自动修复/升级），否则记为应用缺陷并立即升级为 `/reconcile` 修复 | 不变量测试 + `project_state` 暴露 |
| I-3 | 等待客户卡是**可见的等待**（卡已呈现、审计在案），不是「无声暂停」；无答复不执行、不自动放行、不转 stop | 卡通道测试 + 幂等测试 |
| I-4 | 责任人的修复必须由**应用重算证据**（文件字节 hash、账本事实、OID），不采信角色自报「已修好」 | 修复任务收口测试 |
| I-5 | 客户主权不弱化：高危/主权卡的结算拒绝任何 `judge:`/`directive:` 来源；本设计只增加决策卡**种类**，不放宽既有排除面 | 既有 `isApplicationDecisionReservedForCustomer` 单测扩展 |

---

## 二、现状：block → 暂停/终止点位盘点（51 个，6 族）

### 2.1 口径

「现点位」= 现行产品代码中「遇到异常后**不再自动前进**、把处置抛回给角色/客户/测试驱动，且没有任何机制保证该处置会发生」的事实点。**点位不等于缺陷**：其中许多是必要的 fail-closed 安全门；本设计不改它们的拒绝语义，只在其后追加「解法路由」。app-dispatch 分支（暂停、未提交）内的点位单列标注，因为设计必须同时兼容两种协议。

### 2.2 六族总表

| 族 | 数量 | 代表点位 | 现状后果（真实或代码事实） |
| --- | ---: | --- | --- |
| E 账本/终态 | 9 | `stage.blocked`（closeTask 三码）、A9 基线失败、release 失败、`workflow-corrupt`、`stop-unconfirmed` | 账本停在 blocked/corrupt，无自动处置；只能等人/角色 |
| D 派发/拒绝码 | 14 | fixed 矩阵 13 码、`workflow-binding-unavailable`、`b-change-scope-invalid`、`stage-request-invalid`、缺契约拒投、source 门 | 拒绝回执给调用角色；角色可能重试同一错误（RR31/RR34）或静默 |
| R 报告/重试/升级 | 11 | blocked 报告只提示运营、重派安全门、重派上限升级卡（推荐 terminate）、Q8 重试耗尽 | 报告后无人处置（RR26 12 分钟）、升级卡推荐「终止」 |
| S shell/审批 | 5 | c-deny 终结、a-unavailable 拒绝、judge deny/manual 按拒绝、shell 升级卡 | 「关闭开关再试」式死路；fixed 路径出现卡预算外 shell 卡（RR31） |
| W 环境/看护 | 8 | turn-deadline、log-silence（5/10/30min）、patrol（10min）、stuck 自动终止、网络离线 | 只告警/中止，不产生 block 处置；模型失败后等下一轮 |
| H 测试驱动 | 4 | `stalled-no-progress-8/10/12min`、`blocked-unrecovered`（6min）、gate 早停、产品侧停滞消息为空 stub | **测试驱动替产品兜底**：把真实运行整体判失败并停止；产品自身无 flow 停滞处置 |

### 2.3 今日真实运行史映射（RR26–RR34）

| 事件（记录） | 事实摘要 | 现点位 | 新语义归类（§三） | 新语义动作 |
| --- | --- | --- | --- | --- |
| RR26（`2026-11-11_RR26_two-fixed-workflow-paths.md`） | A12b 复验报告 `status=blocked`（verifier 无受认可运行期验证通道）；幕僚两次唤醒未收口，12 分钟无账本进度 → `stalled-no-progress-12min` | E4/R1/H1 | B2 缺能力（验证通道）+ B8 模型行为（空转） | 引擎先补「应用内运行期验证通道」或按定义提供替代证据；不可得 ⇒ 决策卡（轻量验收含披露 / 返工 / 换方案）；空转由 router 的 stall 检测升级为属主修复 |
| RR27（同目录 RR27） | A11 worker `git commit -m` 未加引号，argv 形状被写门拒绝；运营以环境阻塞 rejected；6 分钟未恢复 → `blocked-unrecovered` | E1/R1/H2 | B8 模型行为（任务文本/参数缺陷）+ B5 环境（误判） | 引擎修复（提交 argv 归一化，B32 类）→ 属主修复任务（改写任务文本/worker 复派）；环境阻塞不是 stop |
| RR30（`2026-11-11_RR30_wuxia-roguelike.md`） | `baseline-team-plan-invalid` blocked 后恢复；A12b 三次 blocked → B31 轻量验收 | E5/E4 | B1 缺文件/证据 + B2 缺能力 | 补证任务（团队计划结构）→ 自动重试；A12b 能力缺口走决策卡（含披露） |
| RR31（`2026-11-11_RR31_wuxia-roguelike-fix.md`） | B2 范围决定无法记录；B3 派发 `b-change-scope-invalid`、B3 advance `stage-transition-invalid`；幕僚越界读应用源码并触发 shell 审批卡，驱动早停 | D7/D5/S5/H3 | B6 协议/对账（B2 记录通道）+ B8 模型越界 + B4 shell 授权 | B2 修复：应用在受理 B3 时确定性记录（B34 已修）或明确拒绝并给下一步；越界 shell 记入审计并路由为属主修复（任务文本/纪律），shell 授权卡保持客户本人 |
| RR33（`2026-11-12_RR33_...md`） | 删 `.ans/` 后 chief 缺失，驱动 `chief-role-missing` 早停 | W8/H3 | B5 环境 | 引擎检测到治理角色缺失 ⇒ 环境 block：应用重建/切换治理模型或客户决策（恢复项目配置/重新导入），不得静默运行 |
| RR34（`2026-11-12_RR34_...md`） | 运营首次向 loop-engine 误用 `taskKind:"stage-request"` 被拒 `stage-request-invalid`；幕僚直发 B3 被拒 `stage-transition-invalid` | D5/E9 | B8 模型行为（参数误用） | 拒绝回执附「下一步正确动作」；同指纹重复 ⇒ 升级（换任务文本/换执行者），不空转 |
| 任务书列举 | 契约文件缺失拒投、blocked 报告无人处置 12 分钟、Q8 重试耗尽后 blocked、reconcile `workflow-corrupt` | D11/R1/R7/R9 | B1/B5/B7/B6 | 补证任务自动重派 / stall 路由 / 预算升级 / 引擎对账修复 + 决策卡 |

### 2.4 现点位清单（P1–P51）

> 锚点为只读快照（HEAD `caf0acf`）；「app-dispatch」标注项在暂停分支 worktree（未提交），不在 v2.1.0 产品内。

**E 族：账本/终态（9）**

| # | 点位（锚点） | 现行为 | 新语义归类 |
| --- | --- | --- | --- |
| P1 | `closeTask` outcome=rejected → `stage.blocked task-closed-rejected`（`src/common/编排/workflow-service.ts:1284,1467-1500`） | 阶段 blocked，无自动处置 | 按拒绝原因分类（B1/B3/B8/B9），路由修复或决策 |
| P2 | `closeTask` accepted + 报告 failed/blocked → `stage.blocked task-report-failed/blocked`（同段） | 同上 | B1/B2/B8 |
| P3 | `closeTask` rework（非 A12b）→ `stage.blocked task-report-blocked`（同段） | 同上 | B8/B3 |
| P4 | A12b 轻量验收缺归档/note → `close-report-missing`（`workflow-service.ts:1323-1345`；RR26 空转源） | 收口失败、任务保持 open、无路由 | B1/B2 |
| P5 | A9 基线失败 → `stage.blocked A9`（`baseline-*`/`b-repository-required`/`project-config-write-failed`；`workflow-service.ts:3948-4035`） | 阶段 blocked，靠同阶段重试或人 | B5/B1 |
| P6 | release 合并失败/拒绝 → `release.failed` + `stage.blocked`（`workflow-service.ts:3433-3460,3539+,3770+`） | A13/B4 保持 blocked，等新 release | B5/B4/B9 |
| P7 | `workflow.stop-unconfirmed` → blocked（`src/common/编排/workflow-state.ts:300-306`） | 不写 stopped，保留现场 | B5/B6（停稳确认是环境事实） |
| P8 | `workflow-corrupt` → view blocked（`workflow-state.ts:34,135-136,361+`；`workflow-service.ts:670-671`） | 停止自动推进，交人核对 | B6 |
| P9 | `stage-transition-invalid`/未知阶段（`requestStage`:733、`recordStageDispatch`:1080-1109、A3 卡门:1630-1640 等） | 拒绝请求，不建任务/不写账本 | B6（真实态冲突）或 B8（误用），按指纹区分 |

**D 族：派发/拒绝码（14）**

| # | 点位（锚点） | 现行为 | 新语义归类 |
| --- | --- | --- | --- |
| P10 | fixed 矩阵 13 拒绝码（`src/common/编排/workflow-dispatch.ts:30-43,147`） | 回执拒绝，角色自行处置 | B8/B2（谁越权/谁缺证据） |
| P11 | `workflow-binding-unavailable`（`app/desktop/session/fixed-workflow/route.ts:250-285`） | 不建任务、不回落 legacy | B6（绑定事实缺失） |
| P12 | `workflow-not-found`/`workflow-closed`（`route.ts:318-333`） | 拒绝派发 | B6 |
| P13 | `workflow-corrupt` 派发门（`route.ts:328-329`） | 拒绝派发 | B6 |
| P14 | `stage-request-invalid`（chat 缺字段；`route.ts:197-200`；RR34 误用） | fail-closed 拒绝 | B8 |
| P15 | `basis-drift`/`basis-missing`（`workflow-service.ts:2695`） | 拒绝 A11/B1/B3 派发 | B1/B6 |
| P16 | `b-change-scope-invalid`（`route.ts:685-724`；`workflow-service.ts:4261+`；RR31） | 拒绝 B3 派发/启动 | B3/B6 |
| P17 | `b2-stage-request-forbidden`（`workflow-service.ts:848`；B34 死锁门） | 拒绝 B2 请求 | B6（协议约束）→ 回执指导 |
| P18 | `b-repository-required`（路径 B 准备；`route.ts` ensurePathBStartForDispatch） | 拒绝，不自动 init | B5 |
| P19 | `module-paths-mismatch`（`route.ts:468-474`；`workflow-preconditions.ts:1018-1040`） | 拒绝派发 | B8/B1 |
| P20 | 缺契约拒投（`app/desktop/session/dispatch.ts` routeDispatch 必读块判据；`:197` 注释口径） | fail-closed 拒投；不登记去重键；契约修好后重派可成功 | B1 |
| P21 | source 门：`document-planning-source-unavailable`/`worker-dispatch-source-unavailable`/`chief-hub-flow-unavailable`（`dispatch.ts:742,756,863,891`） | 拒绝派发/登记 | B2/B6 |
| P22 | VCA：`vca-channel-unavailable`/`vca-role-not-allowed`（`src/pipeline/orchestration/version-change-runtime.ts:767+`） | 保持 submitted/拒绝 | B2/B5 |
| P23 | `review-target-invalid`/`workflow-path-not-stage-request`（`route.ts:185-200`） | 拒绝 | B8 |

**R 族：报告/重试/升级（11）**

| # | 点位（锚点） | 现行为 | 新语义归类 |
| --- | --- | --- | --- |
| P24 | blocked 报告只给运营一条 delivery-note 提示（`app/desktop/session/handback.ts:293-336`） | 「是否发方案升级卡」由运营自行判断 | B3/B5（升级为应用路由） |
| P25 | accepted 收口要求 `task.reported(done)` → `close-report-missing`（`workflow-service.ts:1330-1345`） | 收口失败，任务 open | B1/B8 |
| P26 | 重派安全门：外部副作用/终止未确认/部分写入/在飞工具 ⇒ 零自动重派（`app/desktop/session/tasks.ts:621-703`；`src/common/编排/watchdog.ts:224+`） | 只写日志/系统行 | B5/B8（属主修复/换人） |
| P27 | 重派上限（默认 2）→ `escalateStuckTask` 客户卡（`tasks.ts:637-650,799-916`） | 决策卡 continue/redispatch/replace/terminate，**推荐 terminate** | B7/B9（推荐项改为修复向） |
| P28 | 升级卡无客户通道 ⇒ `escalated:false`（`tasks.ts:820-830`） | 不伪造卡，记录 unavailable | B5（环境）→ 重试/升级 |
| P29 | `terminateRoleRun` 终止未确认（`tasks.ts:489-608`） | 如实失败，不伪造停止 | B5 |
| P30 | Q8：`observeAppDispatchTaskReport` 自动重试 1 次后 `stage.blocked`（app-dispatch；`workflow-service.ts:5457-5600`） | 重试耗尽后保持 blocked | B7/B9 → resolver |
| P31 | 高风险零重派 `highRiskNoRedispatch`（app-dispatch；`workflow-definitions.ts:68-75,147-163`） | blocked 后不再自动动作 | B4/B7 → 决策卡 |
| P32 | `reconcileFixedWorkflow`：corrupt / `requestTaskId` 不一致 / `stage.dispatched` 引用不存在任务（app-dispatch；`workflow-service.ts:5727-5900`） | 不猜、不自动推进 | B6 |
| P33 | 投递失败/目标忙/离线 ⇒ 队列保留重试（`app/desktop/session/delivery/queue.ts:668-680,759-760`） | 重试，无上限路由 | B5 |
| P34 | handback 登记/渲染失败 ⇒ 系统行、不入队（`handback.ts:280-290,356+`） | 报告丢失路径由系统行兜底 | B5/B6 |

**S 族：shell/审批（5）**

| # | 点位（锚点） | 现行为 | 新语义归类 |
| --- | --- | --- | --- |
| P35 | c 硬拒（`c-deny`）终结（`src/common/编排/shell-gate.ts:322+`） | 直接拒绝执行 | B2/B8（按原因） |
| P36 | 操作者不可用/超时 ⇒ 拒绝（`a-unavailable`/`a-timeout`；`shell-gate.ts:431-435`） | fail-closed 拒绝 | B5 |
| P37 | judge deny ⇒ 拒绝；manual/retry-capped 按拒绝（`app/desktop/operator-channel.ts`；`customer-input.ts:1515-1818`） | 「关闭替我审批再试」式死路（设计前状态） | B2/B7 |
| P38 | shell 升级通道：allow-once/session/deny 客户确认卡（`src/common/编排/shell-escalation.ts:54-71,272+`；设计 `2026-10-31_design_shell-deny-customer-escalation.md`） | 客户可对精确命令放行一次/本会话；每命令每会话一次 | B2/B4（客户权限决策，judge 不接） |
| P39 | fixed 路径卡预算外 shell 卡（RR31 实测，幕僚越界 shell） | 驱动早停（H3） | B8（越界）+ B4（客户授权） |

**W 族：环境/会话/看护（8）**

| # | 点位（锚点） | 现行为 | 新语义归类 |
| --- | --- | --- | --- |
| P40 | turn-deadline 到点检查/开关开启自动中止（`app/desktop/watchdog.ts:61,618-665`） | 告警或自动中止本轮 | B8/B5 |
| P41 | log-silence slow 5min / stuck 10min / hard-cap 30min（`watchdog.ts:78-82,740-780`） | 默认只告警；env 显式才自动终止 | B8/B5 |
| P42 | patrol 10min 巡检消息（`watchdog.ts:78,818+`） | 给治理主人的提醒 | B8 |
| P43 | queue-stuck/repeat-fail/cmd-timeout 信号（`watchdog.ts`） | 告警 | B5/B8 |
| P44 | `propose_recovery` 恢复（开关开启自动执行；关闭需客户一键确认） | 恢复动作 | B5/B8 |
| P45 | stuck 角色自动终止 + 安全重派（B-07/B-08；`tasks.ts:489+`） | 终止并视安全分类重派/不重派 | B8/B5 |
| P46 | 模型请求失败/轮次超时（`MODEL_REQUEST_FAILED`/`timed_out`；`src/common/pi-adapter/lifecycle.ts:104-106`） | 本轮失败，等看护/下一轮 | B5/B8 |
| P47 | 会话打开失败/网络离线（`openSessionFailed`；`queue.ts:759-760`） | 系统行/队列保留 | B5 |

**H 族：测试驱动（4，非产品）**

| # | 点位（锚点） | 现行为 | 新语义归类 |
| --- | --- | --- | --- |
| P48 | RR driver `stalled-no-progress-8/10/12min`（RR26/B19 等 evidence run-scripts） | **驱动停止整轮** | B8（产品侧 stall 路由后，driver 退化为观察） |
| P49 | RR driver `blocked-unrecovered`（RR27 6 分钟） | 停止整轮 | B8/B9 |
| P50 | driver gate 早停 `gate:shell-confirm-card`/`chief-role-missing`（RR31/RR33） | 停止整轮 | B4/B5/B8 |
| P51 | 产品无 flow 停滞处置：`buildFlowStallTaskMessage` 为空 stub（`app/desktop/governance-advance.ts:40`） | 不存在自动处置 | 本设计新增 router stall 检测（§6.6） |

> 合计 **51**：E9 + D14 + R11 + S5 + W8 + H4。

---

## 三、Block 分类学（9 类）与解法路由表

> 判定只读**代码/账本事实**（错误码、事件、文件可读性、hash、OID、进程/队列状态），**不采信模型自报**；同一事实命中多类时按表中优先级从上到下取第一类（上=更具体）。所有类别**均无 stop 分支**。

| # | 类（class id） | 判定依据（确定性事实） | 责任归属 | 修复动作形态 | 终态 |
| --- | --- | --- | --- | --- | --- |
| B1 | 缺文件/资源 `missing-resource` | 契约/必读文件缺失拒投；intent/proposal/modules/roster/architecture/团队计划/criteria/report/验收归档缺失或不可读；`close-report-missing`（证据类）；`basis-drift/basis-missing` 的文档面 | **属主角色**（product/rapporteur/nominator/convener/worker；按文档种类路由）；外部输入/客户物料缺失 ⇒ 客户 | **补证/修复任务**（repair task，携缺失路径、schema/格式要求、hash 口径）→ 属主产出 → 应用重算字节 hash → 自动重入场（阶段新 attempt / 拒投同文重派） | fixed |
| B2 | 缺能力/权限 `missing-capability` | `professional-role-unavailable`；工具未注入（worker 无 shell、verifier 无运行期验证通道）；边界/ACL 拒绝；source 门；`vca-role-not-allowed`；shell 判拒（非越界） | **引擎**（可注入工具/换执行者/提供应用内验证通道）→ 需授权 ⇒ **客户**（judge 不接 shell 授权）；角色仅当可绕行 | 能力路由（换执行者/应用验证通道/只读替代）→ 仍缺 ⇒ 修复任务（改任务文本与约束）→ 需授权 ⇒ 客户授权卡（如 shell 升级 allow-once/session）；验收能力缺口 ⇒ 决策卡（轻量验收含披露/返工/换方案） | fixed / decided |
| B3 | 范围歧义/业务取舍 `scope-tradeoff` | `b-change-scope-invalid`（属主不唯一/写集来源缺失/越界）；范围/验收标准冲突；材料性选择；plan-escalation `scheme`/`authority`/`evidence`；需求变更 | **judge**（「替我决策」开启且可代批）或 **客户**（未开启/不可代批） | **决策卡**（应用发行；证据包+选项+唯一推荐+默认；无答复不执行）→ 裁决后继续：修订⇒新 attempt；换方案⇒新流程/版本；继续⇒按新依据重试 | decided |
| B4 | 高风险动作 `high-risk` | `merge-main`、`stable-write`、删除/发布/支付/外部副作用/权限授予/迁移；高风险清单（HIGH_RISK_MERGE_NOTES 等） | **客户本人**（judge 只能转人工/拒绝，不可代批） | 客户主权卡（app-owned）→ approve ⇒ 执行；reject ⇒ **decided(rejected)** 后路由到修复任务（调整后重新提交）或后续决策卡（换方案/显式终止本次流程） | decided |
| B5 | 环境/基础设施 `environment-infra` | git init/仓库缺失（`b-repository-required`）、项目配置写失败、网络离线、模型请求失败/超时、会话打开失败、端口/磁盘/权限、目标忙、投递失败、`stop-unconfirmed`（停稳事实缺失） | **引擎**（有界重试/退避/重连/重建会话/停稳核验）→ **属主**（convener/维护者修复环境）→ **客户**（提供环境/授权例外） | 自动恢复（有界、带退避、每次尝试审计）→ 修复任务 → 客户卡（提供环境/改方案/授权） | fixed / decided |
| B6 | 协议/对账 `protocol-reconcile` | `workflow-corrupt`、`workflow-protocol-mismatch`、定义 hash 不符、reconcile 引用不一致（`requestTaskId`/`stage.dispatched`）、事件乱序/重复/缺失、真实态与请求态冲突的 `stage-transition-invalid` | **引擎**（确定性重放/隔离坏尾/补偿事件/协议切换）→ 引擎不能自动修 ⇒ **客户**（接受现状/重建到一致基线/换方案；目标项目无「应用维护角色」，默认客户卡为人工兜底） | 引擎修复（只追加、不改写历史；隔离坏尾；重建投影）→ 修复任务（补证/回滚到一致状态）→ 客户决策卡 | fixed / decided |
| B7 | 重复拒绝循环 `repeat-rejection` | 同 code + 同指纹（任务文本 hash、operationId、scope hash、命令原文）重复 ≥ 阈值（默认：重派 2 次、同命令判拒 2 次、同阶段同码 2 次）；无新事实重弹 | **引擎**检测 → **升级**：换执行者/换修复属主/**客户决策**（授权例外/换方案/接受现状） | `block.escalated`：executor-replace / owner-reassign / 客户决策卡；**禁止原样循环**；升级卡必须携重复证据与已尝试动作 | fixed / decided |
| B8 | 模型行为异常 `model-anomaly` | 非法工具参数重复、幻觉工具、报告与证据不符（done 无证据）、越界读/写/shell、同回合空转、无效收口、误用 taskKind | **属主修复**（supervisor 改写任务文本/约束）→ 引擎换执行者/模型/降权 → 客户仅当业务影响需要 | 返工任务（附纠正约束+证据要求）→ 换执行者/模型（fresh 会话）→ 越界行为按边界拒绝并审计；重复 ⇒ escalated；安全影响如实披露 | fixed / decided |
| B9 | 预算/配额耗尽 `budget-quota` | 阶段重试预算（Q8 `autoRetries`）、重派上限（默认 2）、turn 预算、审批重试上限（retry-capped）、同 block 修复次数上限耗尽；无新事实 | **引擎**（换路径/扩展上限需客户授权）→ **客户**（延预算/缩范围/改方案/接受现状）→ judge（仅当属于 decision 组业务取舍且可代批） | 升级：换路径/缩范围修复任务；客户决策卡（延长预算/缩小范围/接受现状/显式终止本次流程）；**不得以预算耗尽为由停止** | fixed / decided |

### 3.1 责任归属矩阵（汇总）

| 责任方 | 适用类 | 动作权限 | 禁止项 |
| --- | --- | --- | --- |
| 属主角色（product/rapporteur/nominator/convener/worker/verifier） | B1（缺文件）、B3 的「修订/返工」执行、B8（返工） | 在其写区/边界内产出/修复；报告回交 | 不得自批、不得代客户选择、不得伪造证据 |
| 引擎（应用侧确定性执行器） | B2（能力路由）、B5（自动恢复）、B6（账本修复）、B7（检测）、B9（换路径）、以及所有类的路由与审计 | 建任务/收口自己创建的任务/写账本/重算 hash/隔离坏尾 | 不猜语义、不伪造阶段完成、不采信模型自报事实 |
| 客户 | B3/B4/B9（决策）、B2/B5（授权/环境）、B6（接受现状/重建） | 主权卡裁决、授权例外、显式终止本次流程（决策结果） | 卡未答不得默认执行 |
| judge（「替我决策」开启） | B3/B9（decision 组且非客户主权词汇、有唯一推荐） | 按证据与推荐项代选并留审计 | 不可代批高风险/客户主权卡；不冒充客户；manual 不硬编结论 |

### 3.2 「不可恢复/安全/预算」逐类映射（回应协调方裁定）

| 原任务书措辞 | 本设计映射 |
| --- | --- |
| 安全类「停止并披露」 | **B4 decided**：客户主权卡（approve/reject/转人工）；judge 不可代批；拒绝后走修复/替代方案决策 |
| 不可恢复/损坏「停止并披露」 | **B6**：引擎修复（重建/隔离/回滚）→ 不能修则客户决策（接受现状/重建到一致基线/换方案）；不做 stop |
| 预算类「停止并披露」 | **B9**：换路径/缩范围修复任务；或客户决策（延长/缩小/接受现状/显式终止本次流程）；不做 stop |
| 重试耗尽「blocked」 | **B7/B9 escalated**：换执行者/换修复属主/客户决策；原阶段保持 blocked 只是**中间事实**，不是终态 |

---

## 四、决策路由规则（业务取舍与高风险）

### 4.1 两开关与分组（沿用既有语义，不新增开关）

- **[事实]** 开关与分组：`GOVERNANCE_CARD_GROUP`（`src/model/runtime.ts:952-975`）把 `proposal/appointment/acceptance/intent-confirm/decision` 归 `decision` 组（「替我决策」`decisionJudgeSwitch`，`app/main.ts:353,602,627`），`appointment-write/download` 归 `approval` 组（「替我审批」）；`stable-write`/`merge-main` **故意不在表中** ⇒ 永不判断/代选。
- **[事实]** 客户主权排除：`isApplicationDecisionReservedForCustomer`（`app/desktop/customer-input.ts:482+`）按**应用标志 + 冻结选项词汇**识别 run-change、版本决策、VCA、修正案逐项/最终、stable-write、merge-main、plan-escalation；这些卡即使 `cardKind:"decision"` 也永远客户本人。
- **[设计]** Block 决策卡复用 `cardKind:"decision"` 与「应用发行」通道（`escalateStuckTask` 先例，`tasks.ts:799+`）；新增选项词汇集（§7.3），并按是否属于客户主权分成两族：
  - `block-decision` 词汇：允许 judge 在开关开启且唯一推荐时代选；
  - `block-sovereign` 词汇：进入 `isApplicationDecisionReservedForCustomer` 排除面，永远客户本人（高危/验收让步/终止流程等）。

### 4.2 judge 代决策（开启时）

- 适用：B3（范围/取舍）、B9（预算/范围）中属于 `decision` 组、非客户主权、**恰有一个** `recommended:true` 的卡。
- 语义：judge 按既有证据包与合法选项代选；审计来源 `by:"judge"`、`operatorId:"judge:<engine>"`、`judge` 审计与 `decisionId`（既有 judge 设计 P1.2 的诚实来源口径）；**不冒充客户**。
- 约束：
  - 无唯一推荐 ⇒ `not-recommended` ⇒ **禁止**自动选非推荐项；回落客户卡（§4.4）。
  - 高风险/客户主权（§4.5）⇒ judge 永不进入。
  - 证据不足/核对失败 ⇒ 如实 `manual`，不硬编结论。

### 4.3 客户决策卡（未开启或不可代批时）

- **必须弹卡**（客户 2026-11-20 原话：「如果没有就应该弹出卡片来让我决策」）；卡由应用发行（`application:true`），内容规则见 §7.3：
  - 标题：`[Block] <类名> · <flowId>/<stage>`；
  - 证据：错误码、摘要、workflowId/stage/taskId/requestId、已尝试动作（含次数/指纹）、证据文件引用（path + 应用计算的 sha256）、judge 结论（若有）；
  - 选项：2–4 个，每个带「选择后会发生什么」；恰一个 `recommended:true`（给 judge 与客户共同参考）；
  - 默认：`recommended`，但**无答复不执行**（不是自动放行/自动拒绝）；
  - 幂等：`requestId = block-card-<blockId>`；同一 block 只保留一张有效卡（重复触发复用/不重弹）。
- 卡未答期间 block 状态为 `routed`（可见等待），`project_state` 显示「等待客户决策」；不得转 stop、不得静默推进。

### 4.4 judge 的回落（manual / 不可用 / 无推荐）

- **[设计]** Block 决策卡采用**专门回落**：judge `manual`（超时/解析失败/`not-recommended`/`group-mismatch`/结果行投达失败/开关中途关闭）或 judge 不可用 ⇒ **客户决策卡**（附 judge 失败原因），**不是**沿用现有「decision 组 manual 自动退回发起角色重做」（`customer-input.ts:1770-1818`）。
  - 理由：block 场景下发起者是应用，角色侧没有可重做的对象；自动退回会形成新的无人处置循环，违反 I-1/I-2。
  - 影响面：仅对**新 block 决策卡**生效；既有三卡/验收/决策卡的 manual 语义不动（避免回归）。此点列 §九 Q2。

### 4.5 高风险不可代批清单（judge 只能转人工/拒绝）

沿用并显式扩展（冻结选项词汇/卡种）：

| 卡/动作 | 现状依据 | 新语义下 |
| --- | --- | --- |
| `merge-main`（合并 main/发布） | `GOVERNANCE_CARD_GROUP` 无此键；`isApplicationDecisionReservedForCustomer`；RR 系列 | 不变；release 拒绝后走 B4→修复/替代方案决策 |
| `stable-write` | 同上 | 不变 |
| run-change / 版本决策 / VCA / 修正案 | 同上（冻结选项词汇） | 不变 |
| plan-escalation（方案升级报告） | 同上（`PLAN_ESCALATION_OPTION_IDS`） | 保留；新增 block 路由后可与其对接（B3/B5 的客户决策） |
| shell 授权（allow-once/session/deny） | `2026-10-31` 设计非目标：不接「替我决策」 | 不变；B2/B4 的授权面 |
| block 主权选项（终止本次流程/验收让步/预算延长/授权例外） | 本设计新增 | 进入排除面；永远客户本人 |

### 4.6 无静默等待规则

1. 任何 block 的 `routed` 必须指向**可见产物**：修复任务（open）/决策卡（已呈现）/自动修复（进行中，有 attempt 记录）。
2. 修复任务在 T_repair（建议默认 10 分钟，可配置）内未产生新事实 ⇒ `block.escalated`（换属主/升级客户卡），不是「继续等」。
3. 客户卡在 T_remind（建议默认 30 分钟）后由 UI 提醒一次（同一卡，不重弹）；无答复不执行。
4. 停滞检测（§6.6）兜底：账本在 T_stall（建议默认 12 分钟，沿用 RR 驱动观察值）内无进度且无可见产物 ⇒ `block.raised`（B8/B9 类候选）→ 路由。

---

## 五、Block 生命周期、审计与幂等

### 5.1 状态机（无 stopped）

```
raised ──► routed(engine-auto-fix | owner-repair | judge-decision | customer-decision) ──► resolved(fixed | decided)
   │                                    │
   └──────────► escalated(owner-reassign | executor-replace | customer-decision | engine-repair) ──► routed...
```

- `raised`：应用从事实源（`task.reported`、`stage.blocked`、拒绝回执、reconcile 结果、watchdog/stall）创建。
- `routed`：确定性归类并选择责任方/动作；写入路由事实（目标角色、任务 id、卡 requestId、attempt）。
- `resolved`：仅两种：`fixed`（带 re-entry 事实）或 `decided`（带 `by:"judge"|"customer"`、`decisionId`、选择项）。
- `escalated`：升级（换属主/换执行者/升级客户决策/引擎修复），之后必须再次 `routed`；escalated 不是终态。
- **不存在** `stopped`。任何 workflow 级终止只能来自客户/应用的显式命令并记 `workflow.closed`（停稳证据见既有 `confirmStop` 语义），与 block 终态分开记账、分开审计。

### 5.2 事件形状与账本位置

- **[设计]** 新增 append-only 账本 `.ans/state/blocks.jsonl`（schema `block/v1`），事件：

| kind | 必填字段 | 说明 |
| --- | --- | --- |
| `block.raised` | `blockId, class, code?, workflowId?, flowId?, stage?, taskId?, requestId?, fingerprint, summary, evidenceRefs[], protocol` | `protocol ∈ {"fixed-v2.1","app-dispatch/v1","legacy"}` |
| `block.routed` | `blockId, route, targetRoleId?, taskId?, cardRequestId?, attempt, reason` | 每次路由/重路由一条 |
| `block.resolved` | `blockId, resolution ∈ {fixed, decided}, by ∈ {engine,<roleId>,judge,customer}, decisionId?, reEntry?, note` | 终态 |
| `block.escalated` | `blockId, from, to, reason ∈ {repeat,budget,judge-manual,repair-timeout,unclassified}, attempt` | 升级（后接新 routed） |

- **为什么不写进 `workflows.jsonl`**：v2.1.0 已发布，`deriveWorkflowView` 是严格投影（未知 kind 计入 `skipped.invalid`）；向在飞账本引入新事件会改变旧版本消费者的观测面，且 block 生命周期不是阶段状态，混入会诱使投影承担第二职责。独立账本保持「workflow 阶段事实」与「block 处置事实」分离，二者以 `workflowId/taskId/requestId` 关联；不做第二套阶段状态源。
- `project_state` 新增只读「open blocks」派生（类似 workflow-corrupt 警告，`src/common/编排/project-state.ts:1236-1260` 先例）。
- 幂等键：`block:<blockId>:<kind>:<attempt>`；`blockId = sha256(protocol|workflowId|stage|taskId|code|fingerprint).slice(0,24)`；同键 replay 返回原回执。

### 5.3 防重复卡与防风暴

- 卡 requestId 确定性（`block-card-<blockId>`）；同一 block 的同一决策只呈一次；重复 raised（抖动）复用同 blockId（fingerprint 相同）。
- 每项目同时最多一张 block 决策卡（沿用既有「一项目一卡」与排队，`customer-input.ts` `activeByProject`），其余排队并在 `project_state` 显示。
- 同指纹重复 ≥ 阈值 ⇒ 只允许 `block.escalated`（不得再发同 kind 卡/同文任务）；升级卡必须携带重复证据。
- 卡过期/被取消 ≠ 决策：block 保持 `routed`（等待），重新呈现同 requestId；不得把取消当拒绝执行。

### 5.4 终态与重入场

| 终态 | 成立条件（应用核验） | 重入场动作 |
| --- | --- | --- |
| `fixed` | 修复任务 `task.closed accepted` + 应用重算的证据齐（文件字节 hash/OID/账本事实），或引擎自动修复完成且对账通过 | 阶段 block：新 attempt（`attempt+1`，新幂等键）驱动/重派；派发拒绝：同文重派（未登记去重键，契约定后合法）；对账：重放后视图一致 |
| `decided` | 卡 `request.resolved`（judge 或客户）+ 应用最终核验（`verifyCardPrompt` 类匹配，app-dispatch；固定路径沿用 `request.resolved` + documentRefs 一致） | 按选项执行：修订⇒新 attempt；换方案⇒新 workflow/flow（应用决定，客户可见）；继续⇒按新依据重试；接受现状⇒写入披露并以「现状」收口（下游说明必须带限制）；显式终止本次流程⇒客户命令 + `workflow.closed stopped`（停稳证据）+ 披露；该 stop 属于**客户决策结果**，block 本身终态仍是 `decided` |

### 5.5 Provenance 与审计不变量

- judge：`by:"judge"`、`operatorId:"judge:<engine>"`、`judge` 审计、真实 `decisionId`；永不写 `decidedBy:"customer"`（沿用 judge 设计 P1.2）。
- 客户：`by:"customer"`，无 judge 字段。
- 引擎：`by:"engine"`（修复动作），修复前后事实均入账。
- 角色：`by:"<roleId>"`（仅作为属主修复/返工作业的执行者，不构成裁决）。
- 所有卡/任务都有 `blockId` 反向引用；`blocks.jsonl` 可独立重放出每个 block 的完整生命周期。

---

## 六、与既有机制的接合（逐项：现在怎样 → 新语义下怎样）

### 6.1 task blocked 报告（RR26 痛点）

- **现在**：`task.reported(status:"blocked")` 写入账本；创建者（chief/convener/application）收到回交并自行决定；fixed-v2.1 下仅给运营一条「是否发方案升级卡」的提示（P24），运营不动作则无人处置；A12b 还要幕僚当回合三选一，否则空转（P4，RR26 12 分钟）。
- **新**：应用观察 `task.reported` 后**确定性归类**（B1/B2/B3/B8…）→ `block.raised/routed`：
  - 属主/证据类：自动创建补证任务或应用任务（app-dispatch）；fixed-v2.1 由应用向创建者发确定性修复简报（含 repairId、缺失路径、证据口径），并盯 T_repair 超时升级；
  - 取舍类：决策卡（judge/客户）；
  - 创建者的原收口路径保留：若创建者在 router 路由前完成收口并解决，block 记 `resolved(fixed, by:<creator>)`；否则以 router 为准（先到先得，幂等）。
- **不变量**：报告仍只是报告，不因路由自动构成收口；`closeTask` 语义不变。

### 6.2 fail-closed 拒绝码

| 拒绝码 | 现在 | 新语义 |
| --- | --- | --- |
| `b-change-scope-invalid` | B3 派发被拒；运营报 blocked；幕僚可能重发 B2（RR31 死结） | 归类 B3/B6：若缺失是**可确定性补齐**的（B2 派生事实可从 B1 报告 ∩ 名单 ∩ 边界计算）⇒ 引擎修复并重试一次；仍歧义 ⇒ 决策卡（范围选项）；重复同指纹 ⇒ escalated（换执行者/客户） |
| `stage-transition-invalid` | 拒绝请求，账本不动 | 归类 B6/B8：真实态冲突⇒引擎重放/校对后给出当前合法动作（回执带 `nextActions`）；模型误用⇒返工任务/纠正文本；重复⇒escalated |
| `workflow-protocol-mismatch` | app-dispatch `verifyCardPrompt`/`loadAppDispatchContext` 拒绝（非本协议） | 归类 B6：引擎按协议切换正确驱动（fixed-v2.1 走 requestStage，app-dispatch 走 drive）；定义/版本不符⇒引擎修复（拒绝静默迁移）+ 客户决策（接受当前定义/升级） |
| `workflow-corrupt` | 停止自动推进（P8/P13/P32） | 归类 B6：引擎先做确定性修复（坏尾隔离、重放投影、补偿事件；不改写历史）；能修⇒`fixed` 并继续；不能修⇒客户决策卡（接受现状/重建到一致基线/换方案） |

### 6.3 缺契约拒投（P20）

- **现在**：`routeDispatch` 必读块判据在登记去重键之前 fail-closed 拒投；回执+系统行；契约修好后重派同文可成功（键未登记）。
- **新**：归类 B1（缺文件）：`block.raised`（missing paths + sha 期望）→ 属主补证任务（按引用路径的属主；外部物料⇒客户）→ 完成后应用重探测（`filePrint` 逻辑不变）→ 自动重派同文（新幂等上下文）；拒绝回执保持逐字不变，附加 `blockId` 与「谁修/修好后自动重派」事实。

### 6.4 shell 审批（P35–P39，RR31）

- **现在**：三层链；c 硬拒终结；a 不可用/超时拒绝；judge deny/manual 按拒绝（「关闭替我审批再试」）；升级通道可对精确命令申请客户放行（每命令每会话一次）；fixed 路径不应出现 shell 卡，RR31 幕僚越界 shell 触发卡预算外卡并导致驱动早停。
- **新**：
  - shell 拒绝本身归 B2/B8：**先判「是否本不该发生」**——fixed 任务文本要求 shell（环境探测/自测/哈希）⇒ 任务文本缺陷（B8）⇒ 属主修复（改写文本/复派），不是让角色换命令硬试；
  - 真实环境需要 ⇒ B2/B5：shell 升级卡（客户本人；judge 不接）或属主修复环境；
  - 拒绝回执保留升级通道指引；同命令同指纹重复被判拒 ⇒ escalated（B7），不循环。
  - **shell 拒绝不是 stop**；`a-unavailable` 可重试/升级（B5）。

### 6.5 Q8 重试策略（P30/P31）

- **现在**（app-dispatch 暂停分支）：每阶段 `autoRetries`（默认 1）自动重试（新 attempt/新幂等键）；耗尽或高风险零重派 ⇒ 保持 `stage.blocked` 交客户/运营（`workflow-definitions.ts:68-75,147-163`；`observeAppDispatchTaskReport:5577-5600`）。
- **新**：
  - 重试算术与幂等不变；`WorkflowStageRetryPolicy.onExhausted` 的语义从 `"blocked"`（停住等）改为 **`"route-block-resolver"`**（枚举值更名/定义版本递增；旧定义在飞按旧值解释）；
  - 耗尽 ⇒ `block.raised`（B7/B9）→ 路由：换执行者/换修复属主/客户决策；高风险零重派仍保持（但进入 B4/B7 路由，不是停）；
  - `stage.blocked` 事件保留为账本事实锚点（投影语义不变），resolver 在其上追加生命周期，不改阶段转移。

### 6.6 停滞检测（P41/P48/P49/P51）

- **现在**：产品侧只有看护信号（log-silence 5/10/30min、patrol 10min、turn-deadline），**没有 workflow 进度停滞处置**（`buildFlowStallTaskMessage` 为空 stub）；真实兜底是 RR 测试驱动的 `stalled-no-progress-8/10/12min` 与 `blocked-unrecovered`，它们**把整轮判失败并停止**（RR26/RR27）。
- **新**：
  - 应用侧新增 **block stall 检测**（每项目 tick）：若某活动 workflow 的「最后进度时刻」（账本事件/task.reported/卡活动/投递成功）超过 `T_stall`（默认 12 分钟，可配置）且无 open 修复任务/待答卡/在飞自动修复 ⇒ `block.raised`（默认 B8，候选 B9）→ `routed`（检查角色状态→返工/换执行者；或决策卡）；
  - `T_stall` 触发前必须排除：合法长回合（模型在飞）、已呈现的客户卡（可见等待）、进行中的修复任务/自动恢复；排除事实入审计；
  - RR 驱动 stalled/blocked-unrecovered/早停 gate 退化为**独立观察者**（可以继续判失败用于测试，但不再是产品主处置）；回归测试要求：模拟 12 分钟无进度时，先出现 `block.raised/routed`，driver gate 不得先触发。
  - watchdog 既有信号保留：log-silence slow/stuck 继续告警；hard-cap 的自动终止仍可发生，但终止后必须立刻 `block.raised` 并路由（修复/换人/客户），不得终止即了事。

### 6.7 reconcile corrupt（P32）

- **现在**（app-dispatch 暂停分支）：`reconcileFixedWorkflow` 对 `corrupt`/引用不一致不猜不推进，`receipt.corrupt` 返回，桌面停止驱动；v2.1.0 无 reconcile。
- **新**：reconcile 结果接入 resolver：
  1. 引擎自动修复（幂等收口已报告未收口任务、用事件携带 taskId 重建任务、重放投影、隔离坏尾）；
  2. 修不好 ⇒ `block.raised`（B6）→ 修复任务（补证/回滚至一致状态）→ 客户决策卡（接受现状/重建到一致基线/换方案）；
  3. 每次修复动作写 `blocks.jsonl` 与 diagnostics；不改写历史事件（只追加补偿）。

### 6.8 redispatch / escalateStuckTask（P26–P29）

- **现在**：安全分类门（外部副作用/终止未确认/部分写入/在飞工具）零自动重派；重派上限 2 次后客户升级卡（推荐 terminate）；无通道则如实 unavailable。
- **新**：保留安全门与上限；升级卡成为 **B7/B9 的一个实例**：
  - 选项扩展与改序：`属主修复/换人执行/再重派一次/接受现状/显式终止本次流程`，推荐项改为**修复向**（默认「换人执行」或「属主修复」，视 safety 事实），`terminate` 不再是默认；
  - 推荐项与选项进入 `block-decision` / `block-sovereign` 词汇：涉及「终止本次流程」「接受现状」的选项为客户主权（judge 不可代批）；
  - 卡 requestId 改为 `block-card-<blockId>` 体系（兼容保留旧 `task-escalation-<rootTaskId>-<attempts>` 读取）。

### 6.9 交付/release 失败（P6）

- **现在**：冲突/失败 ⇒ `release.failed` + `stage.blocked`；客户拒绝 ⇒ `release.rejected` by customer；judge 转人工/拒绝/超时 ⇒ `release.rejected` by judge；A13/B4 保持 blocked 直到新 release。
- **新**：
  - 冲突/技术失败 ⇒ B5：属主修复任务（convener 处理合并冲突/重建 release）→ 新 release 自动重呈同一 requestId 规则（releaseId 变化则新卡）；
  - 客户拒绝 ⇒ `decided(rejected)` → 后续路由：修复后重新提交（新 release）或后续决策卡（换方案/显式终止本次流程）；
  - judge 转人工/拒绝/超时：保持「客户本人」语义（B4），block 以 `routed`（等待客户）记录，不是 blocked 停住。

### 6.10 其他（source 门 / VCA / 网络 / 会话）

| 机制 | 现在 | 新语义 |
| --- | --- | --- |
| source 门（P21） | 拒绝派发/登记（无真实客户轮次/受派任务） | B2/B6：引擎不伪造来源；属主修复（由真实轮次发起/补受派任务）；若属产品缺陷（legacy 直接派发是否受支持待 owner 裁决，见测试债 B3a）⇒ 客户/维护决策，不在 router 猜 |
| VCA/stable-write（P22） | `vca-channel-unavailable` 保持 submitted 可重试；`vca-role-not-allowed` 拒绝 | B2/B5：通道不可用⇒引擎重试/恢复；角色不符⇒属主纠正（rapporteur 提交）；主权卡仍客户本人 |
| 网络离线/队列（P33/P47） | 队列保留、标 `blockedReason:"network"`，恢复后续投 | B5：引擎自动恢复；恢复超时⇒属主修复/客户环境决策 |
| 会话打开失败（P47） | 系统行 | B5：自动重开（有界）→ 修复任务/客户 |
| 模型失败/超时（P46） | 本轮 failed/timed_out；看护告警 | B5/B8：自动重试一轮→升级（换模型/换执行者/客户） |

### 6.11 汇总（P → 类 → 动作）

| P | 类 | 路由动作 |
| --- | --- | --- |
| P1–P3 | 按 code 判定 B1/B3/B8/B9 | 修复任务 / 决策卡 / 返工 |
| P4 | B1/B2 | 补证或能力路由；仍不可得⇒决策卡（含披露） |
| P5 | B5/B1 | 自动重试→属主修复→客户 |
| P6 | B5/B4/B9 | 属主修复→客户卡 |
| P7 | B5/B6 | 停稳核验→属主修复→客户 |
| P8/P13/P32 | B6 | 引擎修复→修复任务→客户决策 |
| P9/P11/P12/P14–P17/P19/P23 | B6/B8 | 回执带下一步→返工/换人→escalated |
| P10/P21 | B2/B8 | 纠正/授权/属主修复 |
| P18 | B5 | 环境恢复/客户提供仓库 |
| P20 | B1 | 补证任务→自动重派 |
| P22 | B2/B5 | 通道恢复/角色纠正/客户 |
| P24 | B3/B5 | 应用路由替换「运营自选」 |
| P25–P29/P33/P34 | B1/B5/B8 | 修复/重试/升级 |
| P30/P31 | B7/B9/B4 | resolver（onExhausted 语义更名） |
| P35–P39 | B2/B4/B8 | 任务文本修复/客户授权/升级 |
| P40–P47 | B5/B8 | 自动恢复→属主→客户 |
| P48–P51 | B8/B9 | 产品 stall 路由先行；driver 只观察 |

---

## 七、落地形态

### 7.1 模块划分（应用侧确定性）

| 模块 | 层 | 职责 | 约束 |
| --- | --- | --- | --- |
| `src/common/编排/block-resolution.ts`（新） | 编排（纯函数） | 拒绝码/事件/报告 → 分类（9 类）；类 → 责任方/动作形态；指纹与 blockId 计算；`onExhausted` / escalate 策略判定 | 无 I/O、无时钟、无随机；输入为宿主核验事实；可被两协议共用与单测 |
| `app/desktop/block-router.ts`（新，或 `session/block-router.ts`） | 桌面（应用服务） | 订阅事实源（task.reported、stage.blocked、派发拒绝回执、reconcile 结果、stall tick）；写 `blocks.jsonl`；创建修复任务/呈决策卡；执行重入场；超时升级 | 幂等；不采信模型自报；不改阶段状态机；失败如实系统行并重试 |
| `app/desktop/session/block-cards.ts`（新） | 桌面 | `block-decision`/`block-sovereign` 卡装配（证据/选项/推荐/默认）；requestId 幂等；与既有 customer-input 通道/judge 分组对接 | 选项词汇与排除表单一来源；不发明选项 |
| `src/model/runtime.ts`（改） | 契约 | 新增 block 卡选项词汇常量/白名单；`task.created.from` 增 `"application"`（app-dispatch 已有设计）；`task.closed.by` 同步 | 旧值/旧记录读取不变；白名单派生不手抄 |
| `src/common/编排/workflow-definitions.ts`（改，app-dispatch） | 编排 | `onExhausted` 语义更名/版本递增；高风险零重派保留 | 旧定义在飞按旧值解释（§九 Q5） |
| `docs/planning`/`角色卡` | 文本 | 角色规则（§7.2）与固定路径资源更新 | 在飞会话不热改 |

- **修复任务形态（两协议）**：
  - app-dispatch/v1：`taskKind:"repair"`（新）或复用 `stage-execution` 的 repair 子类，`from:"application"`，由应用创建/观察/收口；报告必须携证据路径；应用重算 hash 后判 `accepted`。
  - fixed-v2.1 在飞：不新增应用任务来源的语义变更——应用向现有创建者（chief/convener）投递**确定性修复简报**（`repairId`、缺失路径、证据口径、截止）；创建者用既有 `dispatch_task` 建任务；应用按 idempotencyKey 观察任务出现，超时升级。这样 v2.1.0 的阶段/收口语义零变化。
- **重入场**：统一由 router 调既有服务函数（`driveAppDispatchStage`/`requestStage`/`redispatchTask`/同文重派），不新增第二条推进路径；所有调用带新幂等键与 `blockId` 反向引用。

### 7.2 角色文本增删

| 角色/资源 | 删除 | 新增/改写 |
| --- | --- | --- |
| 幕僚 `chief-workflow-v2.md`（fixed-v2.1） | A12b blocked「三选一含停止」；B2 卡死「上报/停止」；「停止并如实上报」的默认出路 | 「block 如实上报即可，应用会路由（属主修复/决策卡）；你不空转、不代客户选择、不越界 shell；收到应用修复任务须按简报执行；`blockId` 入回执」 |
| 幕僚 `chief-workflow-v3.md`（app-dispatch，未提交） | 「`stage.blocked` 交客户/运营」「无法恢复时按停止面处理」 | 同 v2；增加「按应用 prompt 呈 block 决策卡（若 Q1 采用幕僚呈卡）」与「决策卡内容逐项一致」 |
| 运营 `convener` | 「无可行方案如实停止」等停住措辞 | 「报告即路由输入；收到修复任务按简报执行；环境/授权阻塞主动上报，不自行发同文重试；同一 block 不重弹卡」 |
| 产品/策划/人事/验证 | 「缺证或失败 blocked/failed，不静默等待」可保留 | 补「blocked 报告必须写缺失项/证据路径；属主修复任务按 repairId 回交」；验证角色注明「无运行期通道不是停的理由，应用会路由」 |
| 固定路径说明（`docs/planning/2026-11-10_design_two-fixed-workflow-paths.md` 的后续版本/提案） | 「pause/stop 由幕僚发 `workflowAction:"stop"`」的旧调度描述 | 「停止由客户/应用显式命令执行；block 由应用路由」 |

- 文本改动**新会话生效**；在飞会话保持旧文本，应用 router 仍按事实路由（不依赖文本）。

### 7.3 客户卡格式（block 决策卡）

```
标题：[Block] <类名> · <flowId>/<stage>
问题：<一句话：需要你决定什么；说明已自动尝试过什么>
证据：
  - code / 摘要 / workflowId / stage / taskId / requestId / 次数 / 指纹
  - 已尝试动作（引擎自动修复/属主修复/重派；含次数与结果）
  - 证据文件：path（sha256=<应用计算>）
  - judge 结论（若有）：by:"judge"、reasonCode、选择（若 manual 则写原因）
选项（每个带后果）：
  - <id> <label> — 选择后会发生什么（修复/重派/换人/接受现状/显式终止本次流程）
推荐：恰好一个 recommended:true（同时供 judge 与客户参考）
默认：recommended；无答复不执行（不自动通过、不自动拒绝）
```

- `block-decision` 词汇示例（judge 可代批）：`block-revise-scope`、`block-rework`、`block-replace-executor`、`block-retry-with-cap`、`block-accept-with-limits`（仅非高危）。
- `block-sovereign` 词汇示例（客户主权）：`block-terminate-flow`、`block-grant-exception`、`block-accept-current-state`、`block-merge-main`（复用既有）、`block-stable-write`（复用既有）。
- 终止选项的语义：客户选择 `block-terminate-flow` ⇒ 应用走显式停止流程（`confirmStop` 停稳证据 + `workflow.closed stopped`），并披露未完成项；**该 stop 是决定的结果**，block 记 `resolved(decided)`。

### 7.4 与 app-dispatch 分支（暂停、未提交）的关系

- 该分支实现：应用创建/观察/收口 `stage-execution`、Q8 重试、`reconcileFixedWorkflow`、卡 prompt、v3 角色文本；**尚未包含 block resolver**。本设计不要求先合并它；两者按以下接口衔接：
  1. **事实锚点不变**：两协议都以 `stage.blocked` 事件、`task.reported`、拒绝回执、reconcile 结论为输入；resolver 在应用侧新增，不改 `workflow-service` 的阶段语义（v2.1.0 在飞零迁移）。
  2. **Q8 语义**：`onExhausted:"blocked"` → `"route-block-resolver"` 属于 app-dispatch 定义的**版本化变更**；在飞 app-dispatch workflow（如有）按其 `definition.version` 旧语义（blocked）继续，resolver 仍可观察并路由——即「旧定义解释 + 新路由层」兼容。
  3. **reconcile**：`ReconcileFixedWorkflowReceipt.corrupt/errors` 直接作为 B6 输入；不改变 reconcile 本身的只读/幂等结论。
  4. **v3 文本**：本设计对 v3 的改动属于「合并前修订」；若 v3 已合并发布，则按新资源版本（v3.1）处理，不做在飞热改。
  5. **协议隔离**：resolver 记录 `protocol` 字段；禁止对同一 workflow 中途换驱动；fixed-v2.1 的 repair 简报走「角色创建任务」路径（§7.1），app-dispatch 走应用建任务路径。

### 7.5 UI / project_state / 告警

- `project_state` 增加 open blocks（blockId/类/状态/责任方/等待对象/年龄/证据入口）；作为幕僚与客户的只读事实面。
- 卡通道复用既有「一项目一卡」；block 卡排队可见（`project_state` 与 UI 队列一致）。
- diagnostics 记录 `block.raised/routed/resolved/escalated`（便于测试与回归）；不替代 `blocks.jsonl`。

---

## 八、测试与验收

### 8.1 测试矩阵

| # | 测试 | 覆盖 |
| --- | --- | --- |
| T-1 | 分类矩阵：P1–P51 每个错误码/事实 → 期望 class（appendix B 全表） | 判定确定性、无遗漏 |
| T-2 | 路由矩阵：每类 → 期望动作（修复任务字段/决策卡选项/自动修复 attempt）；断言 routed 必产生产物 | I-1/I-2 |
| T-3 | judge 开/关两态：B3/B9 卡开关开启且唯一推荐 ⇒ `by:"judge"` + 审计；关闭 ⇒ 客户卡呈现；manual ⇒ 客户卡回落（§4.4） | 决策路由 |
| T-4 | 高风险负例：`merge-main`/`stable-write`/shell 授权/`block-sovereign` 选项 ⇒ judge 永不结算；伪造 `judge:` 来源被拒 | 客户主权 |
| T-5 | 卡幂等/防重：同 blockId 重复 raised 不重弹；卡取消≠拒绝；同项目多 block 排队 | 防重复卡 |
| T-6 | 修复证据：角色自报「已修好」但文件/hash 不符 ⇒ 不 `fixed`；属主产出后应用重算通过 ⇒ 自动重入场 | I-4 |
| T-7 | 停滞回归：注入时钟模拟 12min 无进度且无可见产物 ⇒ `block.raised→routed`；driver stalled gate 不先触发；有 open 卡/修复任务/长回合时不误报 | §6.6 |
| T-8 | Q8：autoRetries=1 重试后耗尽 ⇒ resolver（非停）；高风险零重派 ⇒ B4/B7；旧定义版本在飞按旧值 | §6.5 |
| T-9 | reconcile corrupt：可修⇒fixed；不可修⇒B6 决策卡；不改写历史 | §6.7 |
| T-10 | 双协议：fixed-v2.1 stage.blocked 用例 + app-dispatch observe 用例 + 混跑（同项目两 workflow 不同协议） | §7.4 |
| T-11 | 审计完整性：`blocks.jsonl` 生命周期可重放；provenance 不冒充；append-only schema 校验 | §5 |
| T-12 | 角色文本：chief v2/v3 资源测试断言无「停止/空转/三选一含停止」措辞；新增 block 语义段存在 | §7.2 |

### 8.2 验收标准（AC）

- **AC-1 无 stop 终态**：全量扫描 `blocks.jsonl`，`resolution` 仅 `{fixed, decided}`；代码中不存在把 block 直接写成停止的路径。
- **AC-2 全点位覆盖**：P1–P51 每项都能在 T-1/T-2 矩阵命中且路由到产物。
- **AC-3 禁止无声暂停**：I-2 不变量测试通过（raised→routed 同 tick）；`project_state` 可见。
- **AC-4 judge 语义完整**：T-3/T-4 通过；judge 审计字段与既有设计逐字一致；高风险负例零通过。
- **AC-5 修复闭环**：B1 缺契约与 B5 环境各一个端到端用例：block raised → 修复任务 → 证据核验 → 自动重派/新 attempt → 阶段继续。
- **AC-6 决策闭环**：B3 范围歧义用例：卡 → judge（开）或客户（关）→ 选项执行 → 阶段继续；接受现状类选项把限制写入交付披露。
- **AC-7 停滞兜底**：T-7 通过；RR 驱动 gate 在 mock 中迟于 router 触发。
- **AC-8 双协议**：T-10 通过；在飞 fixed-v2.1 workflow 行为零回归（既有测试不改期望）。
- **AC-9 审计/幂等**：T-5/T-11 通过；账本重放一致。
- **AC-10 角色文本**：T-12 通过；无新增客户可见门（除 block 决策卡本身，且只在必要时出现）。

### 8.3 不回归项

三卡 + `merge-main` 客户本人、judge 代批、append-only 审计、写区边界、Git 普通用法、doc_format、客户主权排除面、`closeTask`/`requestStage`/reconcile 既有语义、shell 三层链、看护信号阈值（除非显式配置）、v2.1.0 在飞 workflow 的协议隔离。

---

## 九、风险与未决问题（问题 + 推荐默认）

### 9.1 主要风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 「路由」被实现成自动无限重试/自动代选 | 预算燃烧、越权、违反客户原则 | 指纹+上限（B7/B9）；高风险排除；T-4；resolver 只做确定性动作 |
| 假性 fixed（未核验修复就继续） | 带病推进、假完成 | I-4：证据由应用重算；T-6；修复任务收口必须 accepted + 证据 |
| 卡风暴/重复卡 | 客户被打扰、排队阻塞 | requestId 幂等；一项目一卡；升级卡携带重复证据；T-5 |
| 新决策卡扩大客户可见门 | 与旧「不新增客户可见门」默认冲突 | 仅 block 且 judge 不可用时出现；披露；客户原则优先（§十 披露） |
| judge 在 block 场景被过度使用 | 业务判断被自动代选 | 仅 decision 组+唯一推荐+非主权；manual 回落客户；T-3/T-4 |
| fixed-v2.1 在飞兼容 | 旧驱动与新语义混用 | 事实锚点不变；旧定义旧解释；协议字段；T-10 |
| stall 误报（合法长回合/长卡等待） | 打扰/误升级 | 排除在飞回合与待答卡；T_stall 可配置；T-7 |
| 目标项目没有「维护者角色」 | corrupt 修复无人承接 | 引擎确定性修复优先；人工兜底=客户决策卡（§三 B6） |
| 账本增长/第二事实源 | 双写漂移 | blocks.jsonl 只记 block 生命周期；阶段事实仍以 workflows/tasks 为准；重放校验 |

### 9.2 未决问题（推荐默认）

| # | 问题 | 推荐默认 |
| --- | --- | --- |
| Q1 | block 生命周期账本放哪？ | **[默认]** 新 `.ans/state/blocks.jsonl`（schema `block/v1`）；不改 `workflows.jsonl` 投影；备选：合并入 workflows.jsonl（需版本化账本 schema，风险更高） |
| Q2 | judge `manual` 的回落？ | **[默认]** block 决策卡 ⇒ 客户卡（附原因）；既有三卡/验收/决策卡 manual 语义不动 |
| Q3 | 等待客户卡的时限/提醒？ | **[默认]** 不自动超时、不默认执行；30 分钟 UI 提醒一次（同卡）；`project_state` 展示年龄 |
| Q4 | 停机/终止选项？ | **[默认]** 只作为**客户主权选项**存在于决策卡；选择后走显式停稳流程并披露；block 终态仍为 `decided` |
| Q5 | fixed-v2.1 在飞是否迁移？ | **[默认]** 不迁移：旧驱动/旧定义逐字保留；resolver 只观察事实并路由；协议字段隔离 |
| Q6 | 修复任务的创建者？ | **[默认]** app-dispatch：应用（`from:"application"`）；fixed-v2.1：由现有创建者（chief/convener）按应用简报创建，应用盯超时升级 |
| Q7 | corrupt 的「属主修复任务」归谁？ | **[默认]** 引擎确定性修复（重放/隔离/补偿）；不可自动修 ⇒ 客户决策卡（目标项目无维护者角色时） |
| Q8 | B2 范围歧义的决策卡选项？ | **[默认]** 候选范围集（来自 B1 报告 ∩ 名单 ∩ 边界）+「按推荐范围继续」+「换方案」；推荐项唯一；属主不唯一时不得自动选 |
| Q9 | A12b 能力缺口（运行期未验证）的处置？ | **[默认]** 引擎先提供应用内运行期验证通道（fixed 候选）；不可得 ⇒ 决策卡（轻量验收含披露 / 返工 / 换方案），judge 可在开启时代选（非主权）但披露必须进交付 |
| Q10 | 重复阈值与 T_stall/T_repair 数值？ | **[默认]** 同指纹 2 次；`T_stall=12min`、`T_repair=10min`、`T_remind=30min`，均可配置；首版用测试注入时钟钉死 |

---

## 十、非目标与披露

- 不新增角色、不改六内置角色与项目角色的边界模型、不改写区归属与 Git 普通用法。
- 不改变客户主权、judge 既有三卡语义、`merge-main` 客户本人、高风险清单与 shell 三层链的**判定本身**；本设计只在其后追加路由。
- 不重写历史账本、不做第二套阶段状态机；block 账本只记处置生命周期。
- 不承诺在 v2.1.0 内实施；落地提交需另立变更并获客户/协调方授权与独立验收。
- **披露**：旧默认「不新增客户可见门」在本设计下被客户 2026-11-20 原则覆盖——当 judge 关闭/不可用时，业务取舍类 block **必须**呈现客户卡；这是新增的客户可见门，但仅在 block 发生且无人可代决策时出现。
- 本设计对「终止本次流程」的处理是**客户决策的结果**（`workflow.closed stopped` + 停稳证据 + 披露），不是 block 终态；block 终态只有 fixed/decided（符合协调方裁定）。
- 本文为设计提案（草案 v1），未实施、未验收；实施与验收以另行授权的变更记录为准。

---

## 附录 A：拒绝码→分类映射（节选，全表随实施补齐）

| 码 | 类 | 首选动作 |
| --- | --- | --- |
| `b-change-scope-invalid` | B3（可派生补齐时 B6） | 引擎派生一次→仍歧义⇒决策卡 |
| `stage-transition-invalid` | B6（真实态冲突）/B8（误用） | 回执带当前合法动作→返工/换人 |
| `workflow-protocol-mismatch` | B6 | 协议切换/定义修复→客户决策 |
| `workflow-corrupt` | B6 | 引擎修复→修复任务→客户决策 |
| `workflow-binding-unavailable` | B6 | 绑定事实补齐→返工 |
| `stage-request-invalid` | B8 | 纠正文本/换执行者 |
| `basis-drift`/`basis-missing` | B1/B6 | 补证/重建 basis |
| `b-repository-required` | B5 | 环境恢复/客户提供仓库 |
| `professional-role-unavailable` | B2 | 能力路由/换执行者 |
| `vca-channel-unavailable` | B2/B5 | 通道恢复/客户卡通道 |
| `vca-role-not-allowed` | B2 | 属主纠正（rapporteur） |
| `document-planning-source-unavailable`/`worker-dispatch-source-unavailable`/`chief-hub-flow-unavailable` | B2/B6 | 来源补齐/产品裁决 |
| `close-report-missing` | B1/B8 | 补证/返工 |
| `task-report-blocked`/`task-report-failed`/`task-closed-rejected` | 按报告内容 B1/B2/B3/B8 | 路由（§6.1） |
| `workflow-stop-unconfirmed` | B5/B6 | 停稳核验→修复→客户 |
| shell 拒绝族（c-deny/a-*/judge deny/manual） | B2/B8（越界） | 任务文本修复/客户授权/升级 |

## 附录 B：RR26–RR34 对照（见 §2.3，略）

## 附录 C：只读核对锚点（摘要）

- 编排：`workflow-service.ts:733( requestStage)、1080 recordStageDispatch、1284 closeTask、1467-1500 stage.blocked、1630-1640 A3 卡门、2695 verifyBasisForWorkflow、3433-3460/3539+/3770+ release、3948-4035 A9`；`workflow-state.ts:34/135-136/225-235/300-306/361+`；`workflow-dispatch.ts:30-43/147`；`workflow-preconditions.ts:1018-1040/1738`；`task-state.ts:136/1150-1172/1280`；
- app-dispatch（暂停分支）：`workflow-service.ts:5158 driveAppDispatchStage、5457 observeAppDispatchTaskReport、5727 reconcileFixedWorkflow`；`workflow-definitions.ts:68-75/147-163`；`app/desktop/session/fixed-workflow/stage-dispatch.ts:440-560/653+`；
- 桌面：`fixed-workflow/route.ts:177-729`；`dispatch.ts:197/734-891`；`handback.ts:220-336`；`tasks.ts:489-916`；`watchdog.ts:61/78-82/224+/346-350/618-880`；`customer-input.ts:355-510/1515-1818`；`plan-escalation.ts`；`shell-gate.ts/shell-escalation.ts`；`governance-advance.ts:40`；
- 模型：`model/runtime.ts:870-1000`（卡组/白名单）；`provider/runtime/tools.ts:5200-5230`（plan escalation）。

---

*本文件供协调方/客户确认与后续实施对照；不构成实施授权、验收或客户批准。*
