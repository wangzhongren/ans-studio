# 实现级方案：两条固定工作流路径（T3 产品重构，v1）

- 日期：2026-11-10
- 角色：ANS 内置角色「策划」（业务策划 `rapporteur`；**不是**代码维护角色 `rapporteur-code`，独立固定上下文）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 分支/基线：`feat/two-fixed-workflow-paths`；HEAD `10f90c7`（基于 `origin/main` `d9e3e99`）；全链跑通前不合并/不发布
- 状态：**实现级方案 v1，待独立复核（must-fix 闭环）→ B1 冻结**。本轮未实施、未测试、未验收、未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223。
- 唯一产品依据：`docs/planning/2026-11-10_design_two-fixed-workflow-paths.md`（**95 行 / 8,476 bytes / SHA-256 `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d`**；设计草稿 v2，客户确认进入开发，第六节四个默认项按默认采纳）
- 启动计划（只读）：`docs/scheduling/2026-11-10_startup_two-fixed-workflow-paths.md`（实测 **75 行 / 8,913 bytes / SHA-256 `8b207d246b8977e5965aa30a5397f667f89726e3c5701bd4f73e54bf5c910b1b`**）
- 前任清点记录（只读，不替代本方案）：`角色卡/rapporteur-code/docs/design/2026-11-10_impl_two-fixed-workflow-paths.md`（**86 行 / 12,447 bytes / SHA-256 `24364c13cef088d85e7139efa04067bc67160b01d256e01c86f8309766c746ad`**）
- 现有架构/契约（只读参考；与设计 v2 冲突处以设计 v2 为准）：
  - `docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md`（1,242 行 / `241502075ff57d6534d7b2c807a2726f1a4c261381e3b0f968b6be468c64e9ce`）
  - `docs/planning/2026-11-05_design_governance-authority-matrix.md`（1,056 行 / `1f6518b898aa33b649c21124e26816cd05715a5eba6a147aed8b8cab9cfb26d6`）
  - `docs/planning/2026-11-07_design_runtime-gate-role-module-contract.md`（685 行 / `067e3d2e2629489028785f5eff90a01784b4430d7f818efe8d635b700057c1b3`）
  - `docs/planning/2026-11-09_design_document-format-specifications.md`（979 行 / `886fef84c3db34515a98f5874a33bb22134a3fc3b02f20aa3d185b828a3e7c54`）
  - `docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`（686 行 / `1477a6e423a74a7007824b7db82cac4e0f6dbb9e48abaa60a7f452704672e6be`）
  - `docs/planning/2026-11-09_design_team-plan-run-binding.md`（438 行 / `2bb663fec3baee7b275ae7a8747bb3a31091304cd728b4329787d17bab86608b`）
- 标记约定：**[事实]** 只读核实的代码/文档行为；**[设计]** 本方案提议、未实施；**[默认]** 设计 v2 第六节默认项或本方案默认取舍；**[待确认]** 见 §12.2；行号按当前检出，实施以符号名/文本锚点为准。

---

## 0. 摘要（先读这段）

### 0.1 要做什么

把默认工作流收敛为**两条固定路径**，并把 Git 回归普通用法：

1. **路径 A（新增）**：A1–A13。运营（convener）是**生产线唯一派发者**（产品/策划/人事/实现角色全部由运营派发）；幕僚（chief）只做产线调度（阶段推进请求）、呈 3 张客户卡、派独立验收、调节验收强度、汇总交付。3 张客户卡 = 意图确认、方案确认、任命确认，**不合并**。
2. **路径 B（修改）**：B1–B4。运营派专业角色做只读影响面分析 → 幕僚依据专业建议定范围（不做技术判断）→ 运营派现有实现角色修改 → 汇总交付。
3. **Git 只装代码**：任务分支提交 + 合并 main（高风险动作，客户本人确认卡，可 judge 代批）；**取消** trunk ref、bootstrap、冻结闭包、候选 ref、run pin、stable-write 许可、16 MiB 清单预算、发布租约、run 歧义等治理型 Git 机制。
4. **治理状态走应用账本**：意图/方案/团队计划/角色卡/审批/审计是普通 `-vN` 文件 + `.ans/state/*.jsonl` append-only 账本；依据钉死以应用记录文档 SHA-256 实现，不把治理状态写进 Git。
5. **基线准备只剩 3 件小事**：`git init`、文档哈希入账、团队计划落盘 + 结构校验；失败只回报幕僚/运营，**不弹注定失败的客户卡**。
6. **保留不弱化**：append-only 审计 sidecar、judge 代批、doc_format、文件级写区边界、高风险清单；不新增角色、不改边界模型、不新增客户可见门（高风险发布确认卡沿用既有确认机制）。

### 0.2 改动规模与关键增量（供复核先看）

| 项 | 增量 | 说明 |
| --- | --- | --- |
| 新增 `RoleToolId` | **1 项**：`requestReleaseMerge` → 运行时 `request_release_merge`（chief 专属） | 触发发布合并高风险确认卡；走接口评审（契约 §4.4）。**不新增**阶段推进工具（复用 `dispatch_task` 的 `stage-request` 子模式）。 |
| 新增卡种 | **1 项**：`merge-main`（应用自有 confirm 卡，approval 组，可 judge 代批） | 仅应用构造；角色工具 schema 不放行该 token。 |
| 新增账本 | **3 个**：`.ans/state/workflows.jsonl`、`basis.jsonl`、`releases.jsonl` | 复用 `src/common/shared/jsonl-ledger.ts`（5 MiB × 3 轮转）。 |
| `task.created` 新字段 | `workflowId?`、`stage?`、`taskKind?`、`workflowPath?` | 可选、向后兼容；旧记录无字段照常读取。 |
| 项目配置新字段 | `.ans/project.json` → `workflowSchema?: "two-fixed-paths/v1" \| "legacy/v1"` | 缺省按 §9.4 规则判定。 |
| 角色卡文本 | 6 个内置角色模块文本更新（`src/common/roles/*`） | **不是** `角色卡/**` 文件；不改边界模型。 |
| 删除文件 | **0** | 旧 trunk/run/VCA/stable-write 代码保留为 compat-only；删除另立清理变更。 |
| 边界/H1 | **0 处边界修订**（写集全部落在既有 directory/file 授权内） | 见 §10.3。 |

### 0.3 明确不做

- 不改六个内置角色与项目角色的**边界模型**；不新增角色；不新增客户可见门（发布合并确认卡是既有高风险确认机制的具体化，不是新门）。
- 不重做 UI；卡片呈现、会话、投递沿用现有；不做 UI 改版。
- 不删除旧机器（`apply-journal.ts` 4,030 行等），不在本变更做大规模删除；旧项目/在飞 run 继续 compat 路径。
- 不自动 push/tag/发布产物；合并 main 只做本地合并（默认），push/tag 仍需客户逐次授权（另报）。

---

## 1. 目标、非目标、T3 判型与设计 v2 映射

### 1.1 目标（可判定）

- **G1 派发分裂**：生产线派发目标矩阵改为「运营 → 产品/策划/人事/实现角色；幕僚 → 独立验收 + 阶段推进请求」；代码/工具面/gates/提示文案一致；越权在任务创建前 fail-closed。
- **G2 两条固定路径**：A1–A13、B1–B4 每阶段有稳定 stage id、执行角色、产物、卡片、账本事件、幂等键、失败/停止语义；应用可机器判定阶段与下一合法动作。
- **G3 Git 普通用法**：默认路径只做「任务分支提交 + 合并 main」；不触达 trunk ref/bootstrap/冻结闭包/候选 ref/run pin/stable-write 许可；旧机制代码保留但不成为前置。
- **G4 账本与依据钉死**：新增 workflows/basis/releases 三个 append-only 账本；文档 `-vN` + SHA-256 入账；实现前/发布前校验当前文档一致性（drift → fail-closed）。
- **G5 基线 3 件小事**：`git init`、哈希入账、团队计划落盘 + 结构校验；失败只回报幕僚/运营，不产生客户卡。
- **G6 3 张卡与高风险**：意图/方案/任命三卡不合并，均由幕僚发起；高风险合并 main 出客户确认卡（可 judge 代批）；高风险清单不变。
- **G7 迁移/兼容**：旧 trunk/run/VCA/stable-write 路径 compat-only；已合并修复（judge/doc-format/提案卡绑定/bootstrap 闭包等）不回退；贪吃蛇 target 历史 trunk 状态可直接忽略。
- **G8 全链可跑**：确定性测试覆盖状态机/派发权限/账本哈希/迁移兼容/审计/卡片；一次从空项目到出游戏（贪吃蛇）的真机全链跑通（另授权、预算另报）。

### 1.2 非目标

- N1 不新增角色、不改五层架构与依赖方向、不改边界文件格式。
- N2 不弱化审计、写区边界、高风险确认、发布/tag 客户授权。
- N3 不把旧机制「改成新机制再保留两套默认」；默认只走新路径，旧路径仅显式兼容。
- N4 不追求旧套件全绿；按「基线已知红 + 增量不回归」判定（§11.2）。
- N5 不实现 UI 改版；`project_state`/卡片数据可扩展但呈现沿用现有。
- N6 不在本变更删除 4,030 行 `apply-journal.ts` 等旧机器；删除列为后续清理变更候选。

### 1.3 T3 判型

设计 v2 与启动计划已判 **T3**：改变内置角色权责与派发权、改变默认流程状态机、默认路径取消 Git 治理机制、需要迁移/废弃清单、验收需确定性测试 + 真机全链。本方案不降档。

### 1.4 设计 v2 逐条映射

| 设计 v2 条目 | 本方案落点 | 实现锚点（实施时以符号名为准） |
| --- | --- | --- |
| §核心原则 1 Git 只装代码 | §6 全节 | `src/common/门禁引擎/classify-shell.ts`、`app/desktop/session.ts`、`src/common/编排/workflow-service.ts`（新） |
| §核心原则 2 治理状态走账本 | §4.1、§5.3、§7 | `.ans/state/workflows.jsonl`、`basis.jsonl`、`releases.jsonl`；`src/model/runtime.ts` |
| §核心原则 3 派发分裂 | §3.1–§3.6 | `evaluateDispatchAuthorization`、6 个角色模块 `dispatch()`、`app/desktop/session.ts::routeStarDispatch` |
| §核心原则 4 幕僚产线调度 | §3.3、§4.4 | `dispatch_task` 的 `stage-request` 子模式 + 任务收口 |
| §核心原则 5 3 张卡 | §8.1–§8.3 | `src/model/runtime.ts::GOVERNANCE_CARD_GROUP`、`run-role.ts::cardKindsOf`、`schema.ts::request_choice` |
| §核心原则 6 审计/judge/doc_format/写区 | §7.3、§8.4 | `shell-audit.ts`、`governance-judge*.ts`、`doc-format-specs.ts`、`resolve-write.ts` |
| §核心原则 7 默认固定、例外可加重 | §9.4、§12.2 | `workflowSchema` 开关；VCA/trunk 仅 legacy/重型例外 |
| §一 基线 3 件小事 | §5 全节 | `complete_team_plan` v4、`workflow-service.ts`、`parseTeamPlan` |
| §二 路径 A A1–A13 | §4.2 | `workflow-state.ts`（新）阶段表 |
| §三 路径 B B1–B4 | §4.3 | 同上 |
| §四 门/机制处置 | §6.5、§9.1 | 逐文件 keep/deprecate/compat-only 表 |
| §五 在研工作影响 | §9.2、§9.3 | 旧分支停用；蛇 target 历史状态忽略 |
| §六 四个默认项 | §12.2 | 全部按默认采纳 |
| §七 非目标 | §1.2、§0.3 | 不改边界/不新增角色/不新增客户门 |

---

## 2. 现状清点（实际代码，文件/行锚点）

> 清点基于 HEAD `10f90c7` + 工作树（启动计划已更新）；行号只作定位，实施以符号名/文本锚点为准。所有清点为只读。

### 2.1 角色模块与工具面

**角色模块（`src/common/roles/<id>/`，唯一 public entry `index.ts`，模块间零 import）**

| 角色 | 关键文件（行） | 现状 cards | 现状 capabilities | 现状 dispatch / preflight |
| --- | --- | --- | --- | --- |
| chief 幕僚 | `chief/index.ts`（33）、`internal/spec.ts`（72）、`internal/dispatch.ts`（139）、`internal/tools.ts`（79）、`internal/preflight.ts`（142）、`internal/intent-confirm.ts`（47）、`internal/card-text.ts`（32） | `["intent-confirm"]`（spec.ts:72） | customerInput true、dispatchTask true、roleStatus/sessionTail true、shell operator-approve（spec.ts:61-69） | **[事实]** `chiefDispatch` 允许 chief→五内置（product/rapporteur/nominator/convener/verifier），禁止 project/self（dispatch.ts:24-25、54-61、88-139）；`CHIEF_TOOL_IDS` 6 项（tools.ts:30-37，含 closeCreatedTask） |
| convener 运营 | `convener/index.ts`（692） | `["decision"]`（:97） | dispatchTask true、customerInput true（:84-94） | **[事实]** 内置目标仅 verifier、项目 worker 允许（`CONVENER_WORKER_DISPATCH_TARGETS` :191-198；dispatch :204-238）；preflight 覆盖 team-plan/git-action/stable-write/requirement-change（:252-257、613-633） |
| product 产品 | `product/index.ts`（40）、`internal/*` | `[]`（capabilities.ts） | dispatchTask false | **[事实]** 只允许 chief→product；convener→product 拒绝 `convener-target-forbidden`（dispatch.ts:124-147） |
| rapporteur 策划 | `rapporteur/index.ts`（63）、`internal/spec.ts`（108）、`internal/dispatch.ts`（72）、`internal/preflight.ts`（399） | `["proposal","decision"]`（spec.ts:105-108） | dispatchTask false、shell operator-approve（spec.ts:91-99） | **[事实]** 任何派发均 deny（dispatch.ts:40-72）；preflight 覆盖 detail-amendment/run-change/requirement-change；卡文本含 run 择时、结构化 Git 段（spec.ts:33、37-38） |
| nominator 人事 | `nominator/index.ts`（847） | `["appointment","appointment-write"]`（:156-158） | dispatchTask false、installSkill/installMcp true（:145-153） | **[事实]** dispatch 只允许 chief→nominator（:242-310）；preflight 覆盖 appointment（D3/三文档，:319-726） |
| verifier 验收 | `verifier/index.ts`（409） | `["acceptance"]`（:140） | dispatchTask false（:126-134） | **[事实]** dispatch 只允许 chief→verifier（:232-346）；acceptance 卡数据（:358-403） |

**工具面（`src/provider/runtime/schema.ts`，1,861 行）**

- **dispatch_task**（:614-800）：字段 roleId/task/reason/sideEffect/taskKind/expectedOutput/requestedEvidence/idempotencyKey/flowId/stepId/moduleId/modulePaths，另有 hub 专用 `resumeController`/`reviewTarget`；`taskKind` 枚举 `["dispatch","appointment","write","acceptance","shell"]`（:799）。文案写死「Chief 创建 product/rapporteur/nominator/convener/verifier；Convener 管 worker」。
- **request_choice**（:469-568）：cardKind 枚举 `["proposal","appointment","acceptance","intent-confirm","decision"]`（:527）；文案写「appointment 由 Convener 依团队计划发起」「intent-confirm 仅幕僚」「decision 仅运营（需求变更可由策划）」。**[事实]** 与设计 v2 冲突。
- **request_confirmation**（:283-467）：confirm cardKind 仅 `["appointment-write"]`（:361）；治理写卡/预约写卡；内置治理角色必须带归属键 + cardKind。
- **submit_report**（:569-613）：报告通道，无写权。
- **doc_format**（:818-968）：只读文档格式说明，索引 ≤8192 B；`src/common/编排/doc-format-specs.ts` 当前 **54 个格式 id**（A1–A25 + B1–B29）。
- **governance_matrix**（:1462-1500）：只读权力矩阵；数据源 `src/service/governance-matrix/`（门禁引擎属主）。
- **redispatch_task**（:945-968）：chief 专属重派（stuck 安全判定）。
- **git 能力**（:79-109）：`git_query`/`git_candidate`/`git_publish` 结构化工具（host 绑定 repo/ref/OID；v4 门禁规则下裸 Git 写硬拒）。
- **direct capabilities**（:37-77）：`select_run_change`/`complete_team_plan`/`activate_role_documents`/`close_created_task`/`decide_pending_request`。

**派发父门/身份/准入**

- **`src/common/gates/index.ts`（253 行）**：`evaluateChiefDispatchParent`（:228-253）判定 chief 派发父会话证据；18 项 reason 闭集（:82-100）；分支 claude/pi/codex/demo（:235-252）。**[事实]** 该门被旧 `trunk-runtime.ts` 的 repository init/controller resume 消费；普通星形派发走 `app/desktop/session.ts` 的 live-turn 身份校验，不直接调用它。
- **`src/common/编排/workflow-preconditions.ts`（1,687 行）**：`evaluateDispatchAuthorization`（:1590-1645）是硬授权唯一谓词；`CHIEF_DISPATCHABLE_BUILT_INS` 五内置（:1560-1566）；convener 分支读 `convenerRoleModule.dispatch`（:1619-1624）；`reportTargetForTaskCreator`（:1674-1682）；`evaluateDispatchPreflight`（:1651-1665）+ advisories M1–M8；`parseTeamPlan`（:60-112）校验 teamPlanSchema:3 名单/模块/writeset/依赖。
- **`src/pipeline/orchestration/run-role.ts`（3,669 行）**：`dispatchTask` 按 `capabilities.dispatchTask` 注入（:1759-1764）；模块工具声明经 D1 校验（:1932-1944、:2597）；nomimator role draft scope 走 trunk `prepareRoleDraftScope`（:1094-1100）；项目角色 assigned scope 走 trunk `prepareAssignedTaskWriteScope`（:1102-1108）；verifier assigned review 走 trunk（:1109-1116）；写门禁含 stableWritePermit/versionedDocFreeze（:1180-1240）；卡种白名单 `cardKindsOf` 读模块 `cards`（:3201-3207）；`TRIO_CARD_ORIGINATORS` 反推卡发起角色（:3212-3225）；默认 choice 卡种（:3073-3110）。

### 2.2 流程状态机、会话、卡片接线

- **任务状态机**：`src/common/编排/task-state.ts`（1,296 行）：TASKS_STATE_REL（:109）、taskIdempotencyKey（:337-345）、appendTaskEvent（:365）、replay（:1065）、taskStatusOf（:1167）、findTaskByIdempotencyKey（:1246）。事件 `task.created/delivered/reported/closed/redispatch`（`src/model/runtime.ts:1365-1446`），`request.created/presented/resolved`（:1460-1533），`approval.*`（:1599-1631）。`task.created` 有可选 flowId/runId/runState/runStage/moduleId/modulePaths/stepId（:1365-1405）；新路径可省略 runId，需增 workflowId/stage。
- **run/flow 状态机**：`src/common/编排/run-manifest.ts`（1,171 行）：`prepareRunPin`（:478-629，七类文档 + teamPlan/flow + D3 + freeze 校验）、`pinRun`（:634-707）、`verifyPinnedRun`/re-pin/run-change（:709+）。`src/pipeline/orchestration/` 的 `trunk-runtime.ts`（1,524）、`version-change-runtime.ts`（948）、`stable-write-runtime.ts`（371）、`refactor-runtime.ts`（151）承接 trunk/VCA/stable/refactor。**[事实]** 默认派发 A11 前会 `freezeExecutionRun` + `prepareRoleDispatch` + pin/roster 校验（`app/desktop/session.ts:9163-9183`）。
- **VCA/立项/activation/run pin**：`src/model/version-change.ts`（version-change/v1、doc-freeze/v1、stable-write/v1、refactor-request/v1；:19-35）；`src/service/version-change/`、`src/provider/version-change/`；`src/service/trunk/impl/apply-journal.ts` 的 `prepareRoleActivation`（:3267）、`activateRoleDocuments`（:3358）、`prepareRoleDraftScope`（:3714）、`completeTeamPlan`（:2938-3020）、`prepareRunPin` 相关。
- **会话/卡片/派发接线**：`app/desktop/session.ts`（11,225 行）：trio 来源校验（:8573-8591，chief 或 convener 均可派发）、`routeStarDispatch`（:8912）、硬授权（:8982-8992）、**convener→verifier 显式拒绝**（:8993-8994）、hubPreparation 五内置（:9000-9008）、worker 派发要求当前运营真实受派任务（:9016-9026）、run pin/freeze（:9163-9183）、提案卡冻结拒绝 `proposalCardFrozenRejection`（:3261-3281）、direct 能力装配（:4359-4371）。`app/desktop/interface.ts`、`customer-input.ts`（judge 代批通道）、`version-change.ts`（VCA/trunk IPC）、`trunk.ts`、`write-preauthorization.ts`。
- **3 张卡现状路径**：
  - 意图卡：`CHIEF_INTENT_CONFIRM_CARD`（`src/common/roles/chief/internal/intent-confirm.ts:38-47`）；run-role 校验（:1403-1414、:1625-1656）。
  - 方案卡：rapporteur `cards=["proposal","decision"]`；默认卡种（run-role:3086-3090）；选项 accept/accept-quick/revise/reject（model/runtime.ts:995）；冻结 run 上更新提案卡的拒绝（session.ts:3261-3281）；proposal-draft-run 证据绑定（apply-journal.ts:1026 A′）。
  - 任命卡：nominator `cards=["appointment","appointment-write"]`；run-role 强制 sender nominator（:1310-1323）、名单校验 `validateAppointmentCardAgainstRoster`（:1335-1343）、nominator preflight d3-card（:1349-1363）；appointment-write 仍走 nominator/request_confirmation。
  - 验收卡：verifier `cards=["acceptance"]`；默认卡种（run-role:3101-3105）；acceptance 卡数据（verifier/index.ts:358-403）。
- **高风险动作现状**：shell 审批链（`shell-gate.ts`/`operator-channel.ts`）、下载卡（`request_download`）、stable-write 卡（`stable-write-runtime.ts`）、trunk upgrade 高风险二次确认（`app/desktop/version-change.ts`、`trunk-runtime.ts:1453-1476`）；任务副作用分类 `EXTERNAL_RE`（task-state.ts:301-314）；重派高风险 0 次自动（watchdog.ts:227-232）；高危指令原因码（model/directive.ts:217-226）。

### 2.3 将被取消的 Git 治理机制（逐个列）

| 机制 | 主要文件（行） | 现状行为 | 消费者 |
| --- | --- | --- | --- |
| trunk ref / manifest / history | `src/provider/trunk/abstract/trunk-store.ts`（TRUNK_MANIFEST_REL :29、TRUNK_AMENDMENT_REL :31、TRUNK_JOURNAL_REL :33）、`impl/git-trunk-store.ts`（1,307） | `.ans/trunk/manifest.json` 原子读写、CAS、history 归档 | `trunk-service`、`apply-journal`、`trunk-runtime`、`run-manifest`、`version-change` |
| bootstrap / 冻结闭包 | `src/编排/bootstrap-frozen-closure*`、`src/service/trunk/impl/trunk-derive.ts`、`trunk-recovery.ts`、`trunk-verify.ts`、`apply-journal.ts` | 首次 bootstrap 派生/冻结七类文档；冻结闭包校验 | `run-manifest.ts::prepareRunPin`、`session.ts`、`trunk-runtime.ts` |
| 候选 ref / 发布三段式 | `src/provider/trunk/impl/git-candidate-store.ts`（候选 ref :48/:177）、`src/service/trunk/impl/git-capabilities.ts`、`schema.ts:79-109` | `git_candidate`（commit/integrate/revert/init）+ `git_publish`（documents/delivery）；候选 prepared ≠ 发布 | `run-role.ts` 注入、desktop session、trunk-runtime |
| stable-write 许可 / 确认卡 | `src/pipeline/orchestration/stable-write-runtime.ts`、`src/provider/version-change/impl/guard-freeze-registry.ts`、`src/common/门禁引擎/versioned-doc-guard.ts`（stable 许可 :1087/:1241）、`shell-write-guard.ts`（:81-94/:532-545） | `docs/workflow.md`/角色卡/边界的 stable 一次性许可 + TTL 30 分钟（version-change.ts:35） | `run-role.ts` 写门禁、`session.ts`、`version-change.ts` |
| run pin / run change | `src/common/编排/run-manifest.ts`（RUN_SCHEMA :43、pinRun :634、prepareRunPin :478、run-change :888+）、`src/model/run-change` 相关 | draft→pinned；run 绑定文档/角色/D3；continue-frozen/stop-and-restart/stop | `session.ts`、`run-role.ts`、`apply-journal.ts`、`project-state.ts` |
| 16 MiB 清单预算 | `src/provider/trunk/impl/git-command.ts:638`（inventory 4 MiB/文件、16 MiB 总） | bootstrap 初始清单预算 | `git_candidate(action=init)` |
| 发布租约 / host lease | `git-command.ts:898-1000`、`GitDocumentMutationScope.hostLeaseId`（trunk-store.ts:206-215） | host 租约、串行化 Git 文档事务 | trunk service/git capabilities |
| run 歧义 | `workflow-preconditions.ts` run 事实 advisory、`project-state.ts` run-ambiguous blocker | 多 draft/pinned run 歧义阻塞 | 派发 advisory、desktop |
| VCA/修正案 | `src/model/version-change.ts`、`src/service/version-change/`、`src/pipeline/orchestration/version-change-runtime.ts` | version-upgrade/detail-amendment 客户卡、冻结、应用 | product/rapporteur 工具、desktop |
| refactor 申请 | `refactor-runtime.ts`、`REFACTOR_REQUEST_SCHEMA` | 重构申请记录/应用调度 | convener `submit_refactor` |
| 角色激活 trunk 绑定 | `apply-journal.ts::prepareRoleActivation`（:3267）、`activateRoleDocuments`（:3358）、`prepareRoleDraftScope`（:3714） | 激活写 trunk active roles/manifest | nominator、run-role 写门禁 |
| VCA/trunk UI 面板 | `app/desktop/version-change.ts`（1,563 行；IPC 冻结表 :93-107、禁止通道 :111-116）、`app/desktop/trunk.ts` | VCA/trunk 面板与 IPC | desktop renderer |

### 2.4 账本与审计

**现有账本（`.ans/state/`，均为项目本地、应用维护）**

| 文件 | 代码常量/证据 | 用途 |
| --- | --- | --- |
| `tasks.jsonl` | `task-state.ts:109` | 任务/申请/审批/决策事件（含 `request.*`、`approval.*`） |
| `logs/<role>.jsonl` | `role-log.ts:23` | 每角色日志（脱敏、轮转） |
| `versions.jsonl` / `versions.lock` / `versions.initialized` | `versioned-doc-guard.ts:243-246` | R9 baseline 冻结/迁移 |
| `version-changes.json` / `refactor-requests.json` / `stable-writes.json` / `stable-write-permits.json` / `doc-freezes.json` | `provider/version-change/abstract/version-change-store.ts:36-42`、`freeze-cache.ts:8` | VCA/refactor/stable 许可/冻结缓存 |
| `downloads.jsonl` / `download-consumer.json` | `provider/download/abstract/*:8-9` | 下载申请/消费 |
| `customer-directives.jsonl` | `provider/directive/abstract/directive-store.ts:17` | 客户指令（审批/决策） |
| `.ans/runs/<runId>/manifest.json` | `run-manifest.ts:185-189` | run pin/文档/角色/D3 |
| `.ans/trunk/*` | `trunk-store.ts:29-35` | trunk manifest/amendment/journal/history |
| `docs/audit/shell-gate.jsonl` | `shell-audit.ts:25` | shell 执行/审批 append-only 审计 sidecar（保留） |

**文档哈希/依据绑定现状**：`run-manifest.ts`（prepareRunPin:478 / pinRun:634 / verifyPinnedRun）、`workflow-preconditions.ts::parseTeamPlan:60`、`apply-journal.ts`（activation/team-plan hash 多处）、`governance-judge-evidence.ts`（buildDecisionEvidencePacket:994 / verifyEvidenceHashes:1415）、`versioned-doc-guard.ts`（versions.lock/jsonl baseline）。

**保留机制现状**：doc_format（`doc-format-specs.ts` 54 格式；enforcement validator/convention）、judge 代批（`governance-judge*.ts`、`app/desktop/customer-input.ts::planJudge:1320`、`GOVERNANCE_CARD_GROUP`）、写区边界（`boundary-core.ts`、`resolve-write.ts`、`boundary-parse/yaml`）、高风险清单（任务副作用 `EXTERNAL_RE`、watchdog 高风险零自动重派、directive 7 项高危原因码）。

### 2.5 测试与真机

- **确定性入口**：`node --test --test-concurrency=1`（全量，555 个 `*.test.ts`）；`npm run typecheck`（`tsc --noEmit`）；renderer 触及才跑 `npm run typecheck:renderer`。
- **套件分布 [事实]**：`test/claude-adapter` 8、`test/codex-adapter` 12、`test/gates` 4、`test/pi-adapter` 43、`test/roles` 18、`test/runtime-core` 60、`test/桌面UI` 58、`test/桌面应用` 60、`test/测试` 116、`test/编排` 109、`test/装配` 11、`test/门禁引擎` 43、`test/项目管理` 13。
- **与本次强相关套件（必须处置）**：`test/roles/*`（模块差分/卡种/派发）、`test/编排/workflow-preconditions.test.ts`（派发矩阵）、`test/编排/trunk-dispatch-parent.test.ts`、`test/gates/dispatch-parent.test.ts`、`test/测试/runtime-dispatch-gate-integration.test.ts`、`test/桌面应用/star-routing.test.ts`、`test/测试/governance-e2e-auto/i-full-chain.test.ts`、`test/测试/run-pin-e2e.test.ts`、`test/测试/trunk-stable-write-integration.test.ts`、`test/测试/bootstrap-frozen-closure-integration.test.ts`、`test/测试/version-change-integration.test.ts`、`test/编排/version-change-*`、`test/编排/stable-write-*`、`test/桌面应用/version-change.test.ts`、`test/桌面应用/trunk.test.ts`。
- **已知红（近期验收口径）**：`test/测试/version-change-integration.test.ts` 9 红（`vca-channel-unavailable`，P3.1 既有产品决策；客户主权用例通过）；`test/桌面应用/optional-acceptance.test.ts` 基线 6 tests / pass 2 / fail 1 / cancelled 3 / skip 0；`test/编排/**` 基线 22 fail / 2 skip（以提案卡修复 B1 v1.1 附录 A.1 为参照，实施基线重取）。Windows symlink EPERM 偶发（g4-skill 等）。本次**不修复**、不恶化、不修改 `optional-acceptance.test.ts`。
- **跨层夹具**：`test/测试/governance-e2e-auto/i-full-chain.test.ts`（SessionManager + 假 openRoleSession，不启动模型）、`test/测试/existing-project-compat-verify/fixture.ts`（已有角色无治理记录兼容）、`test/测试/trunk-stable-write-integration.test.ts`、`bootstrap-frozen-closure-integration.test.ts`、`version-change-integration.test.ts`。
- **真机入口**：`test/桌面应用/e2e/main.mjs`（真实 Electron 主进程 + preload + renderer）、`test/测试/trunk-amendment-electron-probe.mjs`、`test/测试/t1-actual-main.mjs`、`background-tasks-e2e-real-model/e2e-background-real-model.ts`；无专用 Electron/真实模型 npm script。真实全链另授权、预算另报（§11.3）。

---

## 3. 角色权责与派发（实现级）

### 3.1 权责矩阵（默认路径）

| 生产者 | 目标 | 目的（purpose） | 允许 | 备注 |
| --- | --- | --- | --- | --- |
| convener 运营 | product / rapporteur / nominator（内置） | production | **允许** | 生产线唯一派发者；报告回 convener |
| convener 运营 | 项目角色（模块属主/实现/分析） | production | **允许** | 目标须真实枚举；实现任务须 moduleId + 属主校验 |
| convener 运营 | verifier | — | **拒绝** | `convener-to-verifier-forbidden`（质检只由幕僚创建） |
| chief 幕僚 | verifier | review / preparation | **允许** | 独立验收；报告回 chief |
| chief 幕僚 | convener | stage-request | **允许（唯一例外）** | 产线调度请求：sideEffect=read-only、无 module、无写集；**不是生产线派发** |
| chief 幕僚 | product/rapporteur/nominator | production | **拒绝** | `chief-production-dispatch-forbidden` |
| chief 幕僚 | 项目角色 | — | **拒绝** | 既有 `chief-to-project-forbidden` |
| 其它角色 | 任意 | — | **拒绝** | `unknown-source` |
| 任意 | 自身 | — | **拒绝** | `self-dispatch` |

说明：幕僚→运营的 `stage-request` 是**协调请求**，不是生产线派发；它只创建 `taskKind:"stage-request"` 的任务并要求运营在真实阶段内再派发。设计 v2 §〇「幕僚不派发生产线角色」按此口径成立（生产线角色=产品/策划/人事/实现角色）。

### 3.2 派发硬授权精确改法

**文件**：`src/common/编排/workflow-preconditions.ts`（编排属主）

1. 新增 purpose 类型（模型层，门禁引擎属主）：`src/model/role.ts` 增加
   ```ts
   export type RoleDispatchPurpose = "production" | "stage-request" | "review" | "preparation";
   ```
   `RoleDispatchPolicyInput` 增加可选 `readonly purpose?: RoleDispatchPurpose`（缺省 `"production"`，向后兼容；公共契约变更走接口评审 §4.4）。
2. `DispatchAuthorizationInput`（workflow-preconditions.ts:1525-1528）增加 `taskKind?: "stage-request"` 或 `purpose?: RoleDispatchPurpose`（同一来源，二选一实现；建议 `purpose`）。
3. `evaluateDispatchAuthorization`（:1590-1645）重写为：
   ```
   self → self-dispatch
   from 非 chief/convener → unknown-source
   from == chief:
     target project → chief-to-project-forbidden
     target == verifier && targetBuiltIn && targetExists → allow
     target == convener && targetBuiltIn && targetExists && purpose == stage-request → allow
     target ∈ {product,rapporteur,nominator} → chief-production-dispatch-forbidden（新稳定码）
     其它 → target-card-missing
   from == convener:
     targetBuiltIn:
       target ∈ {product,rapporteur,nominator} && targetExists → allow
       target == verifier → convener-to-verifier-forbidden（新稳定码；替代 session 内联拒绝 :8993）
       target == chief/convener → convener-target-forbidden
       其它 → convener-target-forbidden
     target project → targetExists ? allow : target-card-missing
   ```
4. `CHIEF_DISPATCHABLE_BUILT_INS`（:1560-1566）改为 `CHIEF_DISPATCH_COORDINATION = {"convener","verifier"}`，并在函数内按 purpose 二次收窄；不保留第二张「五内置」表。
5. `evaluateDispatchPreflight`（:1651-1665）在固定路径**不被调用**（advisories M1–M8 仅 legacy）；保留给旧项目/旧测试。
6. 新增稳定码与 i18n 消息键（登记在角色模块 api-spec、i18n 与测试；不新增客户可见门）：
   - `chief-production-dispatch-forbidden`：文案「派发未受理：生产线角色由运营派发；幕僚只派独立验收与阶段推进请求。」
   - `convener-to-verifier-forbidden`：文案「派发未受理：质检任务只由幕僚创建。」
   - `stage-request-invalid` / `stage-transition-invalid` / `stage-request-required`（§3.3）。
7. `reportTargetForTaskCreator`（:1674-1682）不变：报告回真实创建者（chief 创建的 verifier/stage-request 回 chief；convener 创建的 production 回 convener）。

**角色模块 dispatch() 精确改法**

| 模块 | 改法 |
| --- | --- |
| chief `internal/dispatch.ts` | `CHIEF_HUB_DISPATCH.targetRoleIds` 改为 `["convener","verifier"]`；`chiefDispatch` 增加 purpose 判定：convener 仅 `purpose==="stage-request"`，verifier 允许 `review`/`preparation`；project 仍拒绝；新增码 `chief-production-dispatch-forbidden`（messageKey `role.chief.dispatch.productionForbidden`） |
| convener `index.ts` | `CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds` 改为 `["product","rapporteur","nominator"]`；新增码 `convener-to-verifier-forbidden`（原 `convener-target-forbidden` 的 verifier 分支改精确码，保留旧码给 chief/convener 目标）；project 不变 |
| product `internal/dispatch.ts` | source 允许 `convener`（原只 chief）；`reportToRoleId:"convener"`；chief 来源改为 deny `chief-production-dispatch-forbidden`；project 仍 `chief-to-project-forbidden`（历史来源） |
| rapporteur `internal/dispatch.ts` | 同 product：来源允许 convener；`reportToRoleId:"convener"`；chief 来源 deny `chief-production-dispatch-forbidden` |
| nominator `index.ts` | 同 product：来源允许 convener；`reportToRoleId:"convener"`；chief 来源 deny `chief-production-dispatch-forbidden` |
| verifier `index.ts` | 来源允许 chief（review/preparation）；convener 来源 deny `convener-to-verifier-forbidden`（替代 `convenerTargetForbidden` 分支）；project 目标仍拒绝 |

**能力位**：`GovernanceCapabilities` **不变**（chief/convener dispatchTask=true，其余 false）。无新能力位。

**会话层精确改法**（`app/desktop/session.ts`）

- `routeDispatch`（:8557）：trio 下先读 `workflowMode(projectRoot)`；`fixed` → `routeFixedPathDispatch(...)`（新私有方法）；`legacy` → 现有 `routeStarDispatch(...)`。
- `routeFixedPathDispatch` 复用：目标枚举刷新、`sourceIsCurrent`、幂等查重、投递队列、`sideEffect` 分类、报告回交。**删除/跳过**：`prepareRoleDispatch`、`freezeExecutionRun`、`run-manifest` pin/roster、`evaluateDispatchPreflight` advisories、`chainDispatchFacts`、`versioned-doc-baseline` 收集、`convener→verifier` 内联拒绝（改由硬授权返回新码）、`hubPreparation` 五内置判断。
- 新增校验：`workflowService` 的 stage/purpose 校验（§3.3）；实现任务 moduleId/属主/写任务串行（§6.1）；依据一致性（§7.2）。
- `routeStarDispatch` 保持原样（legacy 兼容），但内部对 `convener→verifier` 的拒绝改为调用新硬授权码（避免双重文案）。

### 3.3 幕僚产线调度原语：`taskKind:"stage-request"`

**结论**：**不新增工具**。复用 `dispatch_task`，新增 `taskKind:"stage-request"` 子模式（schema 枚举扩展）。理由：现有任务/投递/报告/收口/幂等/重派机制可直接复用；新增工具会扩大 `RoleToolId` 闭集与全部装配/测试面，而本模式只是「幕僚→运营的协调请求」，不是新权限。

**payload（`dispatch_task` 新增可选字段）**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `taskKind` | 枚举增加 `"stage-request"` | 缺省/其它值按普通派发；`stage-request` 只允许 chief→convener |
| `workflowPath` | `"A" \| "B"` | 首次阶段请求必填；后续可省略（从账本解析） |
| `workflowId` | slug | 首次可省略（应用生成并回执）；后续必填 |
| `stage` | `"A1".."A13" \| "B1".."B4"` | 目标阶段；`stage-request` 必填 |
| `idempotencyKey` | string | 首次建议 `stage-start:<flowId>:<path>:<stage>`；后续必须 `stage:<workflowId>:<stage>:<attempt>` |

**应用处理（`app/desktop/session.ts::routeFixedPathDispatch` + `src/common/编排/workflow-service.ts`）**

1. 校验来源 chief、目标 convener、`purpose=stage-request`、`sideEffect=read-only`、无 moduleId/modulePaths、任务文本非空且自足。
2. `workflowService.requestStage({flowId, workflowId?, workflowPath?, stage, taskId, requestDigest})`：
   - 无活动 workflow ⇒ 生成 `workflowId = "wf-" + sha256(flowId|path|sourceTaskId|requestedAt).slice(0,24)`，追加 `workflow.started` + `stage.requested`；同一 `flowId` 已有活动 workflow 且不是同一请求 ⇒ `workflow-active-conflict`。
   - 有活动 workflow ⇒ 校验 `stage` 是当前阶段的合法下一阶段（§4.4），追加 `stage.requested`；非法 ⇒ `stage-transition-invalid`（不创建任务）。
3. 创建 `task.created`（`from:"chief"`,`to:"convener"`,`flowId`,`workflowId`,`stage`,`taskKind:"stage-request"`,`sideEffect:"read-only"`），幂等键如上；重复请求返回原任务 id（不重复投递）。
4. 投递运营会话队列（现有投递机）。
5. 运营收到后在其真实回合内调用 `dispatch_task` 派发生产线角色；生产任务必须携带 `workflowId` 与当前 `stage`。运营的回合若不在阶段请求任务内，生产派发被拒 `stage-request-required`。
6. 运营完成阶段后 `submit_report` 回 chief（报告按 `task.created.from` 路由）；chief 用 `close_created_task` 收口阶段请求任务（收口不是阶段完成条件，阶段完成由 §4.5 事件判定）。
7. 失败：运营报告 blocked/failed；应用追加 `stage.blocked`；chief 决定重试（新 attempt 幂等键）、返工或停止；**不弹客户卡**。

**唯一 open 请求不变量（实现必须强制）**：每个活动 workflow 恒有**至多一个** `taskKind:"stage-request"` 的 open 任务；chief 发下一阶段请求前，必须先对当前请求 `close_created_task(outcome:"accepted")`；否则 `stage-request-open`（不创建新请求）。停止/改道的唯一入口：对当前 open 请求 `close_created_task(outcome:"rejected", note)` ⇒ 应用记录 `workflow.closed outcome:"stopped"`（note 声明 reclassified 时记 `reclassified`）；`outcome:"rework"` ⇒ `stage.reworked`，workflow 继续。这样不需要新增「关闭工作流」工具，也不会出现无请求可关的悬挂状态。

**为何不用新工具（备选已评估）**：新 `request_stage_advance` 工具需要新增 `RoleToolId`/`RoleToolName`/装配表/契约测试/注入/桌面通道/通知/读取面，且与 `dispatch_task` 的任务/报告/幂等重复；本方案保留其语义在 `taskKind` 上，接口面更小。**风险**：`taskKind` 字段被模型滥用为普通派发；应用按「来源/目标/字段/副作用」四重校验 fail-closed。

### 3.4 角色模块/提示文案精确改法（逐角色）

| 角色 | cards 变更 | 卡文本/上下文变更 | preflight/tools 变更 |
| --- | --- | --- | --- |
| chief | `["intent-confirm","proposal","appointment"]`（spec.ts:72） | `card-text.ts` 重写：客户唯一入口；产线调度（阶段请求）；呈 3 卡；派独立验收；调节验收强度；依据专业建议决策；不派生产线角色；Git 普通用法；删除「新 Product/Rapporteur/Nominator/Convener/Verifier 任务全部由 Chief 创建」段（改为「阶段请求→运营派发」） | `tools.ts` 增加 `requestReleaseMerge`（§6.4）；`preflight` 保留 version-decision（legacy 可选） |
| convener | `["decision"]` 不变 | `index.ts` 卡文本重写：生产线唯一派发者（产品/策划/人事/实现）；团队计划+基线 3 件小事；集成汇总；不派质检；Git 普通用法；删除「不创建新的 Verifier 或其它内置角色任务」中的绝对化表述改为「质检只由幕僚创建」 | preflight `team-plan` 事实包改为 `{actorRoleId, operationId, flowId, workflowId, plan:{path,version,sha256?}}`（移除 runId/baseDigest 必需性；旧字段可选兼容）；`git-action`/`stable-write` preflight 仅 legacy |
| product | `[]` 不变 | 删除「version-upgrade 整单提交」作为默认；保留意图撰写/修订；报告回运营 | `submitVersionChange` 工具在固定路径不注入；preflight version-upgrade 仅 legacy |
| rapporteur | `["decision"]`（移除 proposal） | 删除「Chief 枢纽」中由 chief 派发的旧口径；方案/名单/模块/架构/契约；不发起方案卡（由幕僚呈）；细节修正走新 `-vN`，不要求 VCA；删除 run 择时/结构化 Git 段 | `submitVersionChange`/`selectRunChange` 固定路径不注入；preflight detail-amendment/run-change 仅 legacy；requirement-change 保留 |
| nominator | `["appointment-write"]`（移除 appointment；appointment-write 仅 legacy） | 任命卡由幕僚呈；人事按名单机械建卡/激活；不发起 appointment 卡；无 D3 前置（改为提案卡决定 + 名单） | `activateRoleDocuments` 新 schema（§4.2 A8）；preflight `appointment` 事实包改为 `stage:"activation"`（提案决定 + roster hash）与 `stage:"dispatch"`（任命卡决定，供应用校验）；appointment-write 仅 legacy |
| verifier | `["acceptance"]` 保留但固定路径抑制（§8.5） | 任务由幕僚创建；实施前写标准、实施后独立判定；报告回幕僚；固定路径不发 acceptance 卡 | 无专属工具；preflight review 保留；acceptance 卡数据仅 legacy |

**共享文本**：`src/common/shared/intent-entry-contract.ts` 的 nominator 职责句（约 :110-115）把「提交 appointment 前」改为「接到任命/激活任务、写卡前」；检查项不变（intentId 三处一致）。

**chief 流程资源**：`src/common/门禁引擎/workflows/chief/chief-workflow.md`（门禁引擎属主）必须整体重写为两条固定路径 + 新派发矩阵 + 3 卡 + 基线 3 件小事 + Git 普通用法 + 高风险合并卡；删除「新增/需求变更/重构/修 bug 是业务语义，不是四套固定状态机」与「五内置全部由 Chief 创建」的旧口径。版本号 `chief-workflow/v2`，内容 hash 由应用注入；旧会话沿用已注入字节。

### 3.5 工具面/schema 精确改法（`src/provider/runtime/schema.ts`，运行时核心属主）

1. **dispatch_task**（:614）：`taskKind` 枚举加 `"stage-request"`（:799）；描述改为「Chief 只创建 verifier/stage-request；Convener 创建生产线任务」；新增 `workflowPath`/`workflowId`/`stage` 可选字段（pattern 见 §3.3）；promptGuidelines 加「stage-request 不是生产线派发、无写权、运营必须再派发」。
2. **request_choice**（:469）：cardKind 枚举/文案改为「proposal/appointment 由幕僚发起（意图/方案/任命三卡）；acceptance 仅 legacy；decision 由运营/策划（需求变更审批）发起」。
3. **request_confirmation**（:283）：保持 `appointment-write` 仅 legacy；文案删除「由 Crew 按任命名单逐路径发起」的默认口径，改为「固定路径不做 appointment-write；人事在名单/提案决定范围内直接写卡并激活」。
4. **submit_report**（:569）：文案「向编排交回」改为「向任务创建者交回（幕僚或运营）」；无行为变化。
5. **contract_check**（:799 附近）：`taskKind` 枚举同步加 `"stage-request"`；topic 不变。
6. **git 能力**（:79-109）：固定路径**不注入** `git_query`/`git_candidate`/`git_publish`（见 §6.5）；legacy 保留。
7. **direct capabilities**（:37-77）：`complete_team_plan` schema v4（§5.1）；`activate_role_documents` schema v2（§4.2 A8）；`select_run_change`/`request_stable_write`/`submit_refactor`/`submit_version_change`/**`request_version_decision`** 固定路径不注入（VCA/run/trunk/版本决策绑定）；新增 `request_release_merge`（§6.4）。保留注入：`project_note`/`redispatch_task`/`terminate_role_run`/`role_activity_log`/`close_created_task`/`request_requirement_change`/`decide_pending_request`（chief 独立决策上下文）/`doc_format`/`governance_matrix`/`project_state`。

### 3.6 派发父门/准入判定

- **`src/common/gates/index.ts` 不修改**（gates-code H1=0）：固定路径不触达 trunk repository-init/controller-resume，因此不需要 `evaluateChiefDispatchParent`；chief/convener 派发的真实身份由 `app/desktop/session.ts::sourceIsCurrent` + `inspectAssignedTask`（新 `workflowService.inspectAssignedTask`）保证。
- 若独立复核认为固定路径也必须调用父门：作为**显式升级点**处理（扩展 `DispatchParentHostFacts.parent.roleId` 为 chief|convener + 新 reason 码，走 gates 接口评审）；本方案**默认不扩**，以避免无收益地重引入证据链复杂度。
- **run-role 注入改法**：新增输入 `workflowMode: "fixed" | "legacy"`（由 desktop/CLI 从 project config 读取）；固定模式下：
  - 不构造 `createTrunkService`（roleDraftScope/assignedTaskWriteScope/assignedReview 改由 `workflowService` 提供，§7.2）；
  - 写门禁跳过 `stableWritePermitOf`/`versionedDocFreezeState`（保留 `forbiddenWritePaths`、边界、F4/F6/F7、managed file protocol）；
  - 工具注入按模块 `tools()` + 固定路径过滤（不注入 legacy 工具）；
  - `moduleToolsRole`/`validateRoleToolDeclaration` 逻辑不变，新增 `requestReleaseMerge` 目录项。

### 3.7 3 张卡的归属与校验（与现状冲突的最大项）

**现状 → 目标**

| 卡 | 现状发起 | 目标发起 | 校验依据 | 账本 |
| --- | --- | --- | --- | --- |
| intent-confirm | chief | chief（不变） | intent 文档存在 + frontmatter intentId；选项 confirm/revise | `request.created/presented/resolved` + `documentRefs` |
| proposal | rapporteur | **chief** | 最新 proposal/modules/roster/architecture 存在且 hash 可算；选项 accept/revise/reject；`documentRefs` 绑定 | 同上；`workflow.stage A6` |
| appointment | nominator | **chief** | 最新 roster（basis 记录中的 path+sha256）；选项=名单角色 id、multiple=true、推荐集=名单顺序；角色卡已激活（A8） | 同上；`request.resolved.targetRoleIds` 作为 A10 派发授权 |
| acceptance | verifier | **固定路径不发**（legacy 保留） | — | — |
| decision | convener/rapporteur | 不变（材料性选择/需求变更审批） | `decision-card.ts` 允许角色不变 | 同上 |

**实现改点**

- `src/model/runtime.ts::GOVERNANCE_CARD_GROUP`：proposal/appointment/intent-confirm 仍 decision 组；新增 `merge-main:"approval"`（§8.4）。
- `run-role.ts`：
  - appointment 发送者校验 `trioSpec.id === "nominator"`（:1319）改为 `"chief"`；`nominationD3CardFacts`/nominator preflight 调用改为「应用校验 roster + 提案决定」，不再要求 D3 已选；
  - proposal 默认卡种：`cardKindsOf("chief")` 含 proposal 后，chief 发含 accept 的 choice 卡默认 proposal（`defaultChoiceKindFromModule` :3125 的 if 顺序需加 chief 分支，避免先命中 intent-confirm；建议显式 `cardKind` 必填，默认化仅兼容）；
  - 新增 `documentRefs` 采集：卡呈现前由应用计算并写入 `request.created`；裁决后写入 `request.resolved`（可选字段，向后兼容）。
- `session.ts::proposalCardFrozenRejection`（:3261）在固定路径**不调用**；改为 `proposalDocumentBinding`（§8.2）。
- `run-role.ts::governedInput` 的 appointment 分支（:1310-1371）重写为「chief 发起 + roster 校验 + appointment 选项集合/推荐集 + documentRefs」。
- `TRIO_CARD_ORIGINATORS`（:3212）由模块 cards 反推，自动更新；越权文案「该谁做」随之变化。

---

## 4. 两条路径状态机（实现级）

### 4.1 workflow 模式、账本与投影

**模式判定（`workflowMode(projectRoot)`，桌面/CLI 共用；实现建议 `app/desktop/workflow.ts` + `src/common/编排/workflow-service.ts`）**

1. 读 `.ans/project.json` 的 `workflowSchema`（新字段；`src/common/shared/config-loader.ts` + `src/model/role.ts::ProjectConfig`）：
   - `"two-fixed-paths/v1"` → `fixed`；
   - `"legacy/v1"` → `legacy`；
   - 缺省 → 按下方自动判定。
2. 自动判定：若该 `flowId` 存在活动 legacy run（`.ans/runs/<runId>/manifest.json` 的 `state ∈ {"draft","pinned"}`，且 flowId 匹配）或 `.ans/trunk/manifest.json` 的有效 trunk 指向该 flow 且未关闭 ⇒ 该 flow `legacy`；否则 `fixed`。新 flow 一律 `fixed`。
3. 首次 fixed workflow 启动时，由应用在 `.ans/project.json` 写入 `workflowSchema:"two-fixed-paths/v1"`（应用自有写；不弹卡）。

**账本**：三个新 JSONL（复用 `jsonl-ledger.ts` 的 append/read/rotation；路径常量放 `src/common/编排/workflow-service.ts` 或 `src/model/runtime.ts`）：

```
.ans/state/workflows.jsonl    schema:"ans-workflow/v1"  （5 MiB × 3）
.ans/state/basis.jsonl        schema:"ans-basis/v1"     （5 MiB × 3）
.ans/state/releases.jsonl     schema:"ans-release/v1"   （5 MiB × 3）
```

**投影**：`src/common/编排/workflow-state.ts`（新，纯函数）定义：

```ts
type WorkflowPath = "A" | "B";
type WorkflowStage =
  | "A1"|"A2"|"A3"|"A4"|"A5"|"A6"|"A7"|"A8"|"A9"|"A10"|"A11"|"A12"|"A13"
  | "B1"|"B2"|"B3"|"B4";
type StageStatus = "pending"|"requested"|"dispatched"|"in-progress"|"completed"|"blocked"|"failed"|"skipped";
interface WorkflowView {
  workflowId: string; flowId: string; path: WorkflowPath;
  stage: WorkflowStage; status: StageStatus;
  stages: Record<WorkflowStage, { status: StageStatus; attempt: number; lastEventId?: string }>;
  basisId?: string; releaseId?: string; blocked?: { code: string; summary: string };
}
function deriveWorkflowView(events: readonly WorkflowEvent[], tasks: readonly TaskStateEvent[]): WorkflowView;
function nextStages(view: WorkflowView): readonly WorkflowStage[];
```

- 事件只追加，不改旧行；读取坏行按 `jsonl-ledger` 计数，坏行不阻塞（但投影状态需 fail-closed：关键事件缺失 ⇒ `workflow-corrupt`，不猜）。
- 每个事件带 `v:1`、`at`、`schema`、`workflowId`、`flowId`、`path`、`kind`；幂等键作为事件字段 `idempotencyKey`，重复键不追加（replay）。

### 4.2 路径 A：A1–A13（每阶段）

> 角色简写：产品=product，策划=rapporteur，人事=nominator，运营=convener，幕僚=chief，实现=项目实现角色，验收=verifier。每阶段「请求任务」指幕僚→运营 `taskKind:"stage-request"`。

| Stage | 名称 | 派发/执行 | 输入/前置 | 产物 | 客户卡 | 完成条件（应用判定） | 幂等键/事件 | 失败/停止 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | 请求产品 | 幕僚 stage-request → 运营派产品 | 客户新需求；无活动 workflow | — | — | 产品任务创建（`task.created` to=product, workflowId, stage=A1） | `stage-request:<wf>:A1` + `stage.requested`/`stage.dispatched` | 运营无真实受派任务 ⇒ `stage-request-required`；不建任务 |
| A2 | 意图撰写 | 产品 | A1 | `docs/product/<flowId>-intent-vN.md`（intentId/flowId/version/goal/scope/acceptance/nonGoals） | — | 产品任务 `task.closed accepted` + 文档可读 + hash 可算 | `work:<wf>:A2:<role>`；`stage.completed A2`（cause task-closed + artifact） | 产品 blocked/failed ⇒ `stage.blocked A2`；chief 决定重试/返工/停止 |
| A3 | 意图确认 | 幕僚呈卡 | A2 | `docs/intents/<intentId>.md`（幕僚写） | **卡① intent-confirm**（confirm/revise） | `request.resolved` cardKind=intent-confirm；confirm→A4；revise→A2（新意图版本） | `intent:<wf>:<intentSha>`；`request.created/presented/resolved` + `documentRefs` | 拒绝/超时 ⇒ 不写盘、不推进；revise 回 A2；客户取消 ⇒ `workflow.closed stopped` |
| A4 | 请求策划 | 幕僚 stage-request → 运营派策划 | A3 confirm | — | — | 策划任务创建 | `stage-request:<wf>:A4` | 同 A1 |
| A5 | 方案/名单/模块/架构/契约 | 策划 | A4 + 已确认意图 | `docs/proposals/<flowId>-proposal-vN.md`（project-proposal/v2）、`modules-vN.md`（project-modules/v2）、`roster-vN.md`（project-roster/v3，含 topology）、`docs/contracts/<flowId>-architecture-vN.md`；按需其他 contracts | — | 策划任务 closed accepted + proposal/modules/roster/architecture 存在且 schema 校验通过 + hash 可算 | `work:<wf>:A5:<role>`；`stage.completed A5` | 结构/引用不合法 ⇒ 任务 blocked 回运营/幕僚；不得发方案卡 |
| A6 | 方案确认 | 幕僚呈卡 | A5 | 卡绑定 `documentRefs`（intent/proposal/modules/roster/architecture 的 path+sha256） | **卡② proposal**（accept/revise/reject） | `request.resolved` cardKind=proposal；accept→A7；revise→A5（新版本）；reject→blocked | `proposal:<wf>:<proposalSha>` | 拒绝 ⇒ A5 返工或 workflow blocked/closed；超时 ⇒ 不推进 |
| A7 | 请求人事 | 幕僚 stage-request → 运营派人事 | A6 accept | — | — | 人事任务创建（携带 roster path+sha256、提案决定 decisionId） | `stage-request:<wf>:A7` | 同 A1 |
| A8 | 建卡/激活 | 人事 | A7 + roster/提案决定 | `角色卡/<roleId>/role-card.md`、`boundary.md`、`boundary.yaml`（按名单角色）；`role.activated` 事件（每角色） | — | 全部名单角色 `role.activated` 且卡/边界 hash 记录、模块属主/写区校验通过 | `role-activation:<wf>:<role>:<rosterSha>`；`role.activated` | 名单/模块/边界不合法 ⇒ `activation-*` blocked；不弹客户卡 |
| A9 | 团队计划 + 基线 3 件小事 | 运营 | A8 | `docs/scheduling/<flowId>-team-vN.md`（teamPlanSchema:3）+ `basis.recorded`（文档 hash、team plan、repo/branch） | — | `basis.recorded` + `stage.completed A9` | `baseline:<wf>:<planSha>` | `baseline-*` 失败 ⇒ `stage.blocked A9`，只回报运营/幕僚（§5.5） |
| A10 | 任命确认 + 派实现 | 幕僚呈卡；运营派实现 | A9 + 已激活角色 | 任命卡；实现任务（每角色 moduleId + writeSet） | **卡③ appointment**（多选=名单角色；recommended=名单顺序） | `request.resolved` cardKind=appointment，`targetRoleIds`=选中；随后实现任务创建 | `appointment:<wf>:<rosterSha>`；`stage.requested/dispatched A10` | 客户选子集 ⇒ 只派选中角色；拒绝/超时 ⇒ 不派实现；后续可重呈 |
| A11 | 实现 | 实现角色 | A10 | 代码/测试/报告；任务分支 `ans/task/<workflowId>` 提交（OID 记入报告证据） | — | 所有选中角色实现任务 closed accepted + 分支有提交 + 依据未漂移 | `work:<wf>:A11:<role>:<module>:<attempt>`；`stage.completed A11` | 失败/返工 ⇒ 新 attempt；写任务串行冲突 ⇒ `write-task-busy`；依据漂移 ⇒ `basis-drift` |
| A12 | 独立验收 | 幕僚派 verifier | A10/A11（标准可先写） | `docs/quality/<flowId>-criteria-vN.md`（实施前）、`docs/quality/<flowId>-report-vN.md`（实施后） | 固定路径**不发** acceptance 卡（legacy 保留） | verifier 任务 closed accepted（report 判定通过）+ criteria/report hash 记录 | `review:<wf>:<tipOid>:<attempt>`；`stage.completed A12` | 不通过 ⇒ 回 A11（新 attempt）；缺证 ⇒ blocked；强度轻/完整由幕僚任务文本调节 |
| A13 | 集成/交付/发布 | 运营汇总 → 幕僚 → 客户 | A12 accepted + 运营最终报告 | 交付说明；`release.requested/confirmed/merged`（或 `workflow.closed delivered-unmerged`） | **高风险合并卡 `merge-main`**（approval 组；客户本人或 judge 代批） | `release.merged` 或 `workflow.closed` outcome=delivered/delivered-unmerged | `release:<wf>:<tipOid>`；`stage.completed A13`/`workflow.closed` | 卡拒绝/超时 ⇒ 不合并、workflow blocked；merge 冲突 ⇒ `release-merge-conflict`，不 force/reset |

**说明**
- A1/A4/A7 的「完成」是任务创建（派发受理）；A2/A5/A8/A9/A11/A12 的完成是任务收口/账本事件。阶段请求任务本身收口不参与阶段完成判定（避免幕僚忙时阻塞产线）。
- 「任务收口」= 创建者（运营）对生产线任务 `close_created_task accepted`；运营自身的阶段请求任务由幕僚收口。报告（`submit_report`）只是报告，不是收口。
- A10 的任命卡在角色卡激活之后（设计 v2 A8→A10 顺序），与现状 D3「先选后写卡」相反；写卡授权来自 A6 方案卡 + 名单，任命卡授权 A10 之后的实现派发（§8.3）。
- 客户卡只在 A3/A6/A10 + A13 高风险合并卡；`decision` 卡仍可用于材料性选择/需求变更审批（非固定 3 卡计数）。

**A8 `activate_role_documents` 输入（v2；复用现有 `RoleToolId`）**

```json
{
  "operationId": "op-...",
  "flowId": "snake",
  "workflowId": "wf-...",
  "proposalDecisionId": "decision-...",
  "targetRoleId": "<名单角色 id>",
  "roster": { "path": "docs/proposals/snake-roster-v1.md", "sha256": "<64hex>" },
  "documents": {
    "card": { "path": "角色卡/<id>/role-card.md", "sha256": "<64hex>" },
    "boundaryMd": { "path": "角色卡/<id>/boundary.md", "sha256": "<64hex>" },
    "boundaryYaml": { "path": "角色卡/<id>/boundary.yaml", "sha256": "<64hex>" }
  }
}
```

应用校验：`proposalDecisionId` 对应 A6 方案卡 resolved 且 `documentRefs.roster.sha256` 与入参一致；`targetRoleId` 在名单内、非内置 id、模块属主唯一；角色卡必填章节/边界解析/md-yaml 同步；边界只能取该角色名下模块的文件/目录并集；**应用重算三文档实际字节 SHA-256 并与入参比对（不一致 ⇒ `activation-hash-drift`）**；不写 trunk、不写 appointment-write 卡。成功追加 `role.activated`（含三文档 path+sha256），失败保持旧有效卡并返回 `activation-*` 码。

### 4.3 路径 B：B1–B4

| Stage | 名称 | 派发/执行 | 输入/前置 | 产物 | 客户卡 | 完成条件 | 幂等键/事件 | 失败/停止 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | 影响面分析 | 幕僚 stage-request → 运营派专业角色（模块属主优先；契约/结构用策划） | 客户修改/修复请求；已有项目；无活动同 flow workflow（或由 chief 关闭旧 workflow 后新开） | 影响面/修改建议报告（写在角色合法写区：项目角色 `角色卡/<role>/docs/change/`；策划 `docs/governance/rapporteur/`）；报告 hash 记录 | — | 分析任务 closed accepted + 报告可读 + hash 记录 | `stage-request:<wf>:B1`；`stage.completed B1` | 无模块属主且非契约/结构 ⇒ `professional-role-unavailable`；chief 可改派/升级路径 A/停止 |
| B2 | 范围决定 | 幕僚 | B1 报告 | `change.scope-decided` 事件：impactReport{path,sha256}、scope{summary,files?,rationale}、decidedBy=chief | — | 幕僚发送 B3 stage-request 时应用校验 impactReport hash 并记录事件；或 `workflow.closed no-change` | `scope:<wf>:<impactSha>:<scopeDigest>`；`change.scope-decided` | 建议不足 ⇒ 回 B1（新 attempt）；客户覆盖/改走 A ⇒ `workflow.closed reclassified` |
| B3 | 修改实现 | 运营派现有实现角色 | B2 scope + 当前文档/代码依据 | 任务分支提交、测试/报告；`stage.completed B3` | 高风险动作才出卡（删除/外部/权限等） | 所有实现任务 closed accepted + 提交 OID 记录 + 依据未漂移 | `work:<wf>:B3:<role>:<module>:<attempt>` | 同 A11；范围外写入拒绝 |
| B4 | 汇总/交付/发布 | 运营汇总 → 幕僚 → 客户 | B3 accepted | 交付说明；release 账本（同 A13） | 高风险合并卡 `merge-main` | `release.merged` 或 `workflow.closed` delivered | `release:<wf>:<tipOid>` | 同 A13 |

**B 路径前置**
- 路径 B 触发：**幕僚判断**（bug/修改/重构/修复），客户可明示覆盖（客户说走 A/重建版本 ⇒ 幕僚改走 A）。应用不做自动分类；`workflow.started.trigger = {by:"chief", reason, customerOverride?:true}` 如实记录。
- B1 前若无 basis（项目从未走 A/无 `basis.recorded`）：应用在 B1 派发时自动记录一次**只读文档快照** `basis.recorded(reason:"path-b")`（teamPlan=null、repo=existing、当前文档 hash）；这不是设计 v2 所说的「基线准备 3 件小事」——不 git init、不写团队计划、不弹卡；仅为漂移校验。
- 路径 B 不重建版本、不写团队计划、不重建角色；除非客户要求走路径 A。
- 若 B2 发现需要改契约/架构且影响面超出模块属主：策划出新的 `-vN` 方案/架构文档并重新记录 basis 快照（`basis.amended`），B3 继续；若范围升级为大改版，幕僚可 `workflow.closed reclassified` 后走 A。

### 4.4 合法转移、返工与客户覆盖

**合法转移（应用校验；`stage-transition-invalid` 拒绝）**

```
A1→A2→A3
A3(confirm)→A4→A5→A6
A6(accept)→A7→A8→A9→A10→A11→A12→A13→closed
A3(revise)→A2（attempt+1）
A6(revise)→A5（attempt+1）
A12(rework)→A11（attempt+1）
B1→B2→B3→B4→closed
B2(rework)→B1（attempt+1）
任意→closed（stop/failed/no-change/reclassified；需 chief 请求或客户取消）
```

- **skip 不在默认路径**：设计 v2 两条固定路径；例外（客户明确要求跳过/改道）由幕僚 `workflow.closed reclassified/override` 后新开 workflow，不原地跳阶段。
- **客户覆盖**：客户在会话中明示「走 A / 走 B / 换方案 / 停止」由幕僚在下一 stage-request 或 close 中体现；应用不识别自然语言自动改路（避免不可靠猜测）；`trigger.customerOverride` 记录。
- **停止/改道**：唯一入口 = 幕僚对当前 open 的阶段请求任务 `close_created_task(outcome:"rejected"/"rework", note)`；应用按 §3.3 唯一 open 请求不变量记录 `workflow.closed stopped/reclassified` 或 `stage.reworked`。不自动回滚 Git 文档/分支；保留现场与账本。保证任意活动 workflow 始终有一个可被收口的阶段请求任务，避免「无任务可关」的悬挂。
- **重试**：同阶段新 attempt 使用新幂等键；旧 attempt 事件保留；重派走 `redispatchTask`（stuck 安全判定保留）。

### 4.5 阶段完成判定（应用唯一实现）

`src/common/编排/workflow-state.ts` 提供 `stageCompletionOf(event, taskState)` 表：

| Stage | 完成事件/条件 |
| --- | --- |
| A1/A4/A7 | `task.created`（to=目标角色，workflowId+stage）→ `stage.dispatched`（阶段标记完成） |
| A2/A5 | 创建者 `task.closed outcome=accepted` + 对应文档存在/hash 可算 → `stage.completed` |
| A3/A6/A10 | `request.resolved`（cardKind 匹配；confirm/accept/selected）→ `stage.completed`；revise → `stage.reworked` |
| A8 | 全部名单角色 `role.activated` → `stage.completed` |
| A9 | `basis.recorded` → `stage.completed` |
| A11/B3 | 全部选中实现任务 `task.closed accepted` + 分支 tip OID 记录 → `stage.completed` |
| A12 | verifier `task.closed accepted` + report hash 记录 → `stage.completed` |
| A13/B4 | `release.merged` 或 `workflow.closed delivered*` → `workflow.closed` |
| B1 | 分析任务 `task.closed accepted` + 报告 hash → `stage.completed` |
| B2 | `change.scope-decided` 或 `workflow.closed no-change` → `stage.completed` |

- 事件驱动、幂等：同一完成条件重复出现只追加一次 `stage.completed`（幂等键 `complete:<wf>:<stage>:<causeRef>`）。
- 缺事件/坏行/状态不一致 ⇒ `workflow-corrupt`，交运营/幕僚核对，不猜、不自动推进。

### 4.6 路径 B 触发与客户覆盖（默认）

- 默认：**幕僚判断**；触发记录 `workflow.started.trigger`。客户可覆盖；覆盖不产生新客户卡（客户已在会话中表达）。
- 若客户要求「重建版本/新增功能包」⇒ 幕僚改走 A；若客户要求「只修 bug」⇒ B。
- 应用不做自然语言分类，不强迫固定角色顺序；只校验被请求的阶段转移合法。

---

## 5. 基线准备（3 件小事）

### 5.1 工具与输入：`complete_team_plan` v4（运营专属；复用现有 `RoleToolId`）

**现状**：`complete_team_plan`（schema.ts:50-52；apply-journal.ts:2938-3020）依赖 trunk effective digest/CAS/journal；输入 `{operationId, flowId, runId?, baseDigest?, plan:{path,sha256?,version}}`。

**新 schema（固定路径分支）**

```json
{
  "operationId": "op-...",
  "flowId": "snake",
  "workflowId": "wf-...",
  "plan": { "path": "docs/scheduling/snake-team-v1.md", "version": 1, "sha256": "<可选；声明即断言>" }
}
```

- `runId`/`baseDigest` 在固定路径**不接受**（出现即 `baseline-legacy-field-forbidden`；旧字段仅 legacy 兼容）。
- 返回回执：`{ ok:true, operationId, flowId, workflowId, basisId, git:{state,branch,headOid?}, plan:{path,version,sha256}, documents:[{kind,path,sha256}] }`；失败返回 `{ ok:false, code, message, stage:"A9" }`。
- preflight：convener 模块 `team-plan` 事实包改为 `{actorRoleId, operationId, flowId, workflowId, plan:{path,version,sha256?}}`；`runId/baseDigest` 可选仅 legacy。

### 5.2 `git init`（普通 Git；应用执行）

**规则（`src/common/编排/workflow-service.ts` + 宿主 `WorkflowGitPort`）**

1. 目标项目根 `<projectRoot>`：
   - `.git` 不存在 ⇒ 由应用执行固定 argv `git init`（不经过模型 shell；sanitized env：`GIT_CONFIG_NOSYSTEM=1`、隔离 `HOME`/`XDG_CONFIG_HOME` 到临时目录或项目外 app 目录；不读用户全局 hooks/config 产生副作用；如需可 `-c core.hooksPath=<empty>`）。
   - `.git` 已存在 ⇒ no-op（`state:"existing"`）；若是文件（worktree/submodule）同样视为 existing，不修改。
   - 项目根位于其他仓库工作树内且非本项目仓库 ⇒ `baseline-parent-repository-detected`（不自动嵌套初始化），交运营/幕僚决定。
2. 仓库本地身份：若 `user.name`/`user.email` 未配置，应用写 repo-local 默认 `ANS` / `ans@local`（只写 `.git/config`，不改用户全局配置），并在 basis 中记录 `identityDefaultsApplied:true`。
3. 分支：确保 `main` 存在（若 unborn 则记录 `mainUnborn:true`）；创建/切换到任务分支 `ans/task/<workflowId>`（从 `main` HEAD 或 unborn 开始）；工作区 dirty ⇒ `baseline-repository-dirty`，不 stash/reset/clean。
4. 记录 `repo:{state,branch,headOid?,objectFormat?}` 到 `basis.recorded`；**不写** refs/ans/*、不写 `.ans/trunk`、不做 raw-object plumbing、不建候选 ref。

### 5.3 文档哈希入账（`basis.recorded`）

**文档发现（有界）**：按 `flowId` 找最新版本（复用 `latestVersioned` 模式，但不依赖 run）：

- `docs/product/<flowId>-intent-vN.md`
- `docs/proposals/<flowId>-proposal-vN.md`
- `docs/proposals/<flowId>-modules-vN.md`
- `docs/proposals/<flowId>-roster-vN.md`
- `docs/contracts/<flowId>-architecture-vN.md`
- `docs/contracts/<flowId>-assets-vN.md`（可选）
- 其他被 proposal/roster 引用的 `docs/contracts/<flowId>-*.md`（按引用收集，去重）
- `docs/scheduling/<flowId>-team-vN.md`（团队计划，单独字段）

**预算**：最多 **32 个文件**、单文件 ≤4 MiB、总 ≤16 MiB；超限 `baseline-document-budget`（这是**读取/哈希预算**，不是被取消的 trunk 16 MiB 清单预算；语义不同）。计算 SHA-256 + bytes；文档不可读 ⇒ `baseline-document-unreadable`（附真实路径/错误）。

**账本事件**（`.ans/state/basis.jsonl`）：

```json
{
  "v": 1, "at": "2026-11-10T...Z", "schema": "ans-basis/v1",
  "kind": "basis.recorded", "basisId": "bas-<24hex>",
  "workflowId": "wf-...", "flowId": "snake",
  "documents": [{ "kind": "intent", "path": "docs/product/snake-intent-v1.md", "version": 1, "sha256": "<64hex>", "bytes": 1234 }],
  "teamPlan": { "path": "docs/scheduling/snake-team-v1.md", "version": 1, "sha256": "<64hex>" },
  "repo": { "state": "initialized", "branch": "ans/task/wf-...", "headOid": null, "mainUnborn": true },
  "operationId": "op-...", "idempotencyKey": "baseline:wf-...:<planSha>", "recordedBy": "application"
}
```

- 重复同幂等键 ⇒ replay 返回原 basisId（不追加）。
- 同 workflow 新 basis（文档修正）⇒ `basis.amended`，`previousBasisId` 指向旧记录；旧 basis 保留。
- **不把 basis 写进 Git**；`.ans/**` 由应用维护（角色禁写）。

### 5.4 团队计划落盘 + 结构校验

- 路径：`docs/scheduling/<flowId>-team-vN.md`（版本号=文件名 N=frontmatter version）。
- 结构：复用 `parseTeamPlan`（workflow-preconditions.ts:60-112）：`schema: teamPlanSchema:3`、flowId/version、modules/roster 引用 path+sha256、roleRows 覆盖名单恰好一次、writesets ⊆ 名单模块路径、无重叠、依赖无环。
- 校验输入：A6 方案卡绑定的 roster/modules hash（basis 记录前的最新文件）；不一致 ⇒ `baseline-team-plan-invalid` / `baseline-roster-drift`。
- 团队计划写入者：运营（`docs/scheduling/` 在 convener 写区）；应用只读校验 + 入账。
- `docs/workflow.md` 在固定路径**可选**，不再是派发前置；运营可在需要时维护（写区不变）。

### 5.5 失败面、重试、幂等

| 失败 | 码 | 处理 |
| --- | --- | --- |
| git init 环境/权限失败 | `baseline-git-init-failed` | 返回运营真实错误；`stage.blocked A9`；只回报运营/幕僚；不弹客户卡 |
| 项目根在外部仓库内 | `baseline-parent-repository-detected` | 同上；交运营/幕僚决定 |
| 工作区 dirty | `baseline-repository-dirty` | 不 stash/reset/clean；回报真实 diff 路径 |
| 文档不可读/缺失 | `baseline-document-missing` / `baseline-document-unreadable` | 回报具体路径；不建卡 |
| 文档预算超限 | `baseline-document-budget` | 回报文件数/字节；不建卡 |
| 团队计划结构不合法 | `baseline-team-plan-invalid` | 回报 `parseTeamPlan` 原因；不建卡 |
| 计划/文档 hash 漂移 | `baseline-plan-hash-drift` / `baseline-roster-drift` | 要求新版本/新方案卡；不建卡 |
| 账本写失败 | `baseline-ledger-write-failed` | fail-closed；不继续 |
| 重复 operation/幂等键 | `baseline-operation-conflict` / replay | replay 返回原回执；冲突拒绝 |
| 非运营发起 | `baseline-identity-invalid` | 拒绝 |

- 失败**不产生客户卡**（设计 v2 §一默认；设计 v2 §六默认 1）。
- 重试：运营修复环境/文档后以新 `operationId` 重试；同幂等键 replay 不重复记账。无新信息不重试。
- 失败事件 `stage.blocked` 带 `code/summary/attempt`；chief 可见（`project_state`/报告）。

---

## 6. Git 普通用法

### 6.1 分支/工作区模型（默认）

- **一个项目一个工作区、一次一个写任务**：默认实现任务**串行**（同一时刻至多一个写任务；读/分析任务可并行）。理由：避免多角色并发写同一工作区/分支的冲突与越权；确定性优先。
- 任务分支：`ans/task/<workflowId>`（slug 安全；workflowId 应用生成）。A9 基线创建/切换；实现角色只 `git add/commit`，不切换分支/不 merge。
- 实现任务派发时，应用校验：当前分支=任务分支、worktree 与分支 clean（或仅本任务允许的未提交改动）、上一写任务已收口；否则 `write-task-busy` / `git-branch-mismatch`。
- 提交：实现角色在自己的真实回合内用 `run_shell` 执行 `git add <paths>` + `git commit -m <message>`；**不经过**模型结构化 git 工具。
- 报告：任务报告 evidence 里记录 commit OID、变更路径、测试结论；运营汇总；幕僚发布前核 tip OID。

### 6.2 Shell 规则 v5（`src/common/门禁引擎/classify-shell.ts`）

- `SHELL_RULES_VERSION`（:1134）从 `"4"` → `"5"`；旧 v4 规则集/项目 pin 因版本不符仍 fail-closed（不静默放宽），迁移用 `defaultShellRules()` 的 v5。
- **保留** `matchReadonlyGit`（:1551-...）只读精确白名单（status/log/diff/show/rev-parse/branch list/ls-files/ls-tree/merge-base/worktree list）⇒ allow。
- **新增** `matchTaskGit(argv, facts)`（纯函数）：
  - `git add <literal paths...>`：路径必须 ⊆ 当前任务 writeSet（团队计划 writesets ∩ 模块属主）且为字面路径；拒绝 `-A/--all/./glob/pathspec magic`。
  - `git commit -m <msg>` / `git commit -F -`：允许；gate 在 spawn 前执行 `git diff --cached --name-only -z`，不得为空、不得超出 writeSet、不得包含 `.ans/**`/`角色卡/governance-boundary.yaml`/其他治理写区；拒绝 `--amend`、`--no-verify`、`-a`、`--author`。
  - 其余 Git 子命令（push/fetch/pull/remote/tag/merge/rebase/cherry-pick/revert/reset/clean/checkout/switch/stash/worktree/submodule/config/update-ref/...）⇒ 硬拒（`git-command-not-ordinary`）。
- 事实注入：`run-role.ts`/`shell-gate.ts` 增加 `taskGitScope?: {taskId, workflowId, branch, paths[]}`（来自 `workflowService.inspectAssignedTask` + 团队计划 writesets）；无 scope（读/分析角色）⇒ 写 Git 一律拒。
- **merge main 不在 shell**：`git merge` 硬拒；发布合并只经 §6.4 的应用操作 + 高风险确认卡。
- 审计：每条 git 写命令仍写 `docs/audit/shell-gate.jsonl`（命令、taskId、branch、paths、结果、sha256），保留。

### 6.3 提交门禁细节

- 应用在允许 `git commit` 前必须核：
  1. 当前分支 = `ans/task/<workflowId>`；
  2. staged 路径 ⊆ 任务 writeSet；
  3. 任务 writeSet 来自团队计划 `roleRows[].writesets` ∩ 模块路径；无团队计划（legacy）不走本路径；
  4. `.ans/**`、`角色卡/governance-boundary.yaml`、其他角色卡/治理写区不在 staged（角色本就不能写，shell 也二次拦）；
  5. 无未完成的高风险外部副作用（沿用现有 shell 审批/审计）。
- 提交不授予发布/验收/激活；`git commit` 只是任务分支记录。发布只认 `release.merged` 真实回执。

### 6.4 合并 main（高风险发布确认）

**触发工具（唯一新增 RoleToolId）**：`requestReleaseMerge` → 运行时 `request_release_merge`，仅 chief。

**输入 schema（`src/provider/runtime/schema.ts` 新增）**

```json
{
  "operationId": "op-...",
  "workflowId": "wf-...",
  "summary": "交付说明（≤4000 字符）",
  "evidence": [{ "path": "docs/quality/...-report-v1.md", "sha256": "<64hex>" }]
}
```

- `tipOid` 不由模型提供；应用从当前任务分支真实读取；`evidence` 由应用逐路径重算实际字节 SHA-256 并与入参比对（不一致 ⇒ `release-unauthorized`/`basis-drift`，不发卡）。
- 校验：chief 真实会话；workflow 处于 A13/B4；A11/B3 实现任务均 accepted；A12 verifier accepted；运营最终报告在案；basis 校验通过；当前分支=任务分支；worktree clean；main 未被其他人改动（记录 base OID）；同一 workflow 无开放 release。
- **卡**：应用构造 app-owned confirm 卡 `merge-main`（approval 组；flowId=workflow flowId；preview 列 main base OID、branch tip OID、文件数、diff stat、高风险项、合并方式）；客户本人或 judge（「替我审批」开启）可 approve；judge 不代客户 deny（沿用 approval 组语义：approve 或转人工）。
- **执行（应用，不经 shell）**：固定 argv、sanitized env：
  - main **unborn** ⇒ `git switch -c main <tipOid>`（或 `git update-ref refs/heads/main <tipOid>` 后切 HEAD）创建 main，记录 `mergeKind:"initial"`；
  - main **已存在** ⇒ 先 `git switch main`（被其他 worktree 占用/切换失败 ⇒ `release-main-busy`，不合并），再 `git merge --no-ff <branch>`；冲突 ⇒ `git merge --abort`、切回任务分支，返回 `release-merge-conflict`，不 force/reset/clean；
  - 成功后记录 `release.merged`（baseOid/tipOid/mergeOid/files/diffDigest）；工作区保留在 main（交付态）；任何切换/合并失败都切回任务分支并回报。
- **拒绝/超时**：`release.rejected`；workflow 保持 A13/B4 blocked；不合并。
- **幂等**：`release:<workflowId>:<tipOid>`；重复调用返回原 release 回执；已合并 ⇒ `release-already-merged`（no-op success）。
- **不 push/tag/发布产物**：push/tag 仍需客户逐次明确授权，单独操作（本方案不实现自动化；如实现另报预算/风险）。

### 6.5 旧 Git 机制逐文件处置（keep / deprecate / compat-only）

| 文件/模块 | 处置 | 默认路径行为 | 理由/消费者 |
| --- | --- | --- | --- |
| `src/service/trunk/**`（11 文件，含 apply-journal 4,030） | **compat-only** | 不 import/不调用 | 旧项目在飞 run/历史；删除风险高，另立清理 |
| `src/provider/trunk/**`（6 文件，含 git-command 1,006、git-trunk-store 1,307、git-candidate-store 219） | **compat-only** | 不注入 git_query/candidate/publish | 旧候选/trunk/租约/16 MiB 预算 |
| `src/common/编排/run-manifest.ts`（run pin/run-change） | **compat-only** | 不调用 | 旧 run pin；新路径无 run |
| `src/pipeline/orchestration/trunk-runtime.ts` | **compat-only** | 不调用 | 旧 bootstrap/refreeze/upgrade |
| `src/pipeline/orchestration/version-change-runtime.ts` | **compat-only**（重型可选） | 不注入 VCA 工具 | 设计 v2 例外可启用更重机制 |
| `src/pipeline/orchestration/stable-write-runtime.ts` | **deprecate**（保留代码） | 不注入/不调用 | 固定路径无 stable 许可 |
| `src/pipeline/orchestration/refactor-runtime.ts` | **deprecate**（保留代码） | 不注入 submit_refactor | 固定路径无 refactor 申请 |
| `src/provider/version-change/**`、`src/service/version-change/**` | **compat-only**（重型可选） | 不调用 | VCA/冻结/stable 存储 |
| `src/common/门禁引擎/versioned-doc-guard.ts` | **compat-only** | 固定模式跳过 freeze/stable 判定 | 旧 R9 baseline/冻结 |
| `src/common/门禁引擎/shell-write-guard.ts` | **compat-only** | 固定模式不检查 stable 拒绝 | stable 写入 |
| `src/common/门禁引擎/pin-evidence.ts` | **compat-only** | 不调用 | 边界 pin |
| `app/desktop/version-change.ts` / `trunk.ts` / `write-preauthorization.ts` | **compat-only** | 固定模式不呈现/不自触发 | VCA/trunk/appointment-write UI |
| `src/common/门禁引擎/classify-shell.ts` | **keep + 改 v5** | 普通 Git 读写 + 硬拒范围 | 所有 shell |
| `src/common/gates/index.ts` | **keep 不变** | 固定路径不调用（默认） | 旧 trunk 证据链 |
| `src/pipeline/orchestration/run-role.ts` | **keep + 改** | 固定模式分支 | 注入/写门禁 |
| 旧账本（versions/VCA/stable/doc-freezes/trunk/runs） | **compat-only** | 不写；只读历史 | 旧项目/审计 |

**结论**：默认路径**不触达** trunk/bootstrap/冻结闭包/候选 ref/run pin/stable-write 许可/16 MiB 清单预算/发布租约/run 歧义；代码保留、工具不注入、调用点跳过。删除旧机器另立后续清理变更（不在本 T3 内）。

---

## 7. 应用账本与依据钉死

### 7.1 新账本 schema/事件（完整）

**workflows.jsonl（`ans-workflow/v1`）**

| 事件 | 关键字段 | 幂等键 |
| --- | --- | --- |
| `workflow.started` | workflowId, flowId, path, trigger{by:"chief",reason,customerOverride?}, sourceTaskId, legacyStateIgnored? | `workflow-start:<flowId>:<path>:<sourceTaskId>` |
| `stage.requested` | stage, fromStage?, requestTaskId, requestDigest, attempt | `stage-request:<wf>:<stage>:<attempt>` |
| `stage.dispatched` | stage, taskId, targetRoleId, moduleId? | `stage-dispatch:<wf>:<stage>:<taskId>` |
| `stage.completed` | stage, cause{kind,ref}, artifacts[] | `stage-complete:<wf>:<stage>:<causeRef>` |
| `stage.blocked` | stage, code, summary, taskId?, attempt | `stage-block:<wf>:<stage>:<attempt>:<code>` |
| `stage.reworked` | stage, reworkOf, reason, attempt | `stage-rework:<wf>:<stage>:<attempt>` |
| `change.scope-decided` | impactReport{path,sha256}, scope{summary,files?,rationale}, decidedBy:"chief", requestTaskId | `scope:<wf>:<impactSha>:<scopeDigest>` |
| `role.activated` | roleId, decisionRef, roster{path,sha256}, documents[{path,sha256}] | `role-activation:<wf>:<role>:<rosterSha>` |
| `workflow.closed` | outcome:"delivered"\|"delivered-unmerged"\|"stopped"\|"failed"\|"no-change"\|"reclassified", reason, releaseId? | `workflow-close:<wf>:<outcome>:<reasonDigest>` |

**basis.jsonl（`ans-basis/v1`）**：`basis.recorded` / `basis.amended` / `basis.verified` / `basis.drift`（字段见 §5.3；`basis.verified` 字段 `{basisId, checkedAt, ok, documents:[{path,sha256,ok}]}`；`basis.drift` 字段 `{basisId, path, expectedSha256, actualSha256|null, detectedAt}`）。

**releases.jsonl（`ans-release/v1`）**：`release.requested` / `release.confirmed` / `release.rejected` / `release.merged` / `release.failed`（字段见 §6.4）。

**tasks.jsonl 扩展**：`task.created` 可选 `workflowId`/`stage`/`taskKind`/`workflowPath`；`request.created`/`request.resolved` 可选 `documentRefs[]` + `workflowId`/`stage`。旧事件无字段照常读取；新字段由应用写入，不信任模型自报。

### 7.2 文档 `-vN` 与依据校验

- 治理文档一律 `-vN` 普通文件；旧版本只读；修正出新版本，不原地改（沿用现有命名/写作约定）。
- `basis.recorded` 记录每个文档的 path/version/sha256/bytes；**不入 Git**。
- **校验时机**：
  1. A11/B3 实现任务派发前：`basis.verify`——每个 basis 文档当前字节 hash 必须等于记录值；不一致 ⇒ `basis-drift`（回报运营/幕僚，不派实现）。
  2. A12 验收前：复核 basis（验收报告绑定 hash）。
  3. A13/B4 发布前：复核 basis + tip OID。
  4. `project_state` 可随时展示 basis 状态（读时校验）。
- **文档修正**：新 `-vN` + `basis.amended`（`previousBasisId`）；如修改的是已确认的方案/意图，按现有 `request_requirement_change` 审批卡（decision 卡）或示意客户；不改固定 3 卡口径。
- **写门禁**：固定模式跳过 `versionedDocFreezeState`/stable 许可；仍禁止覆盖既有 `-vN` 文件（文件名/版本规则 + `forbiddenWritePaths`）；新版本文件允许写。`basis-drift` 只阻塞执行/发布，不阻塞读取/分析。

### 7.3 保留机制（不弱化）

- **append-only 审计 sidecar**：`docs/audit/shell-gate.jsonl`（`shell-audit.ts`）保留；shell/git 命令审计不减少。发布合并写 `releases.jsonl`（应用审计），不冒充客户。
- **judge 代批**：`governance-judge*.ts` + `app/desktop/customer-input.ts` 保留；作用于剩余客户卡（intent/proposal/appointment/decision）与高风险合并卡（`merge-main` approval 组）。judge 审计随行（`by:"judge-delegated"` 不冒充客户）。
- **doc_format**：`doc-format-specs.ts` 54 格式保留；更新 `team-plan/v3` 说明（固定路径无 baseDigest/runId；旧字段 legacy）；`trunk/v1`、`version-change/v1`、`stable-write/v1` 等保留为 legacy 格式；新增账本事件不要求 doc_format（应用维护，角色不写）。
- **写区边界（文件级）**：`boundary-core/parse/yaml`、`resolve-write.ts` 不变；固定路径仍逐路径拒绝越界。
- **高风险清单**：任务副作用分类（`task-state.ts:301-314`）、watchdog 高风险零自动重派（:227-232）、shell 审批、directive 7 项高危原因码（`model/directive.ts:217-226`）全部保留；合并 main 使用独立高风险确认卡，不替代其他高风险审批。

### 7.4 `project_state` 与 `governance_matrix`

- `project_state`（`src/common/编排/project-state.ts`，:1087 render）：`ProjectStateView` 增加 `workflow?: {workflowId,path,stage,status,basisId?,releaseId?,blocked?}`；固定路径的 `versions` 由最新文档 + basis 派生（不依赖 run pin）；`run` 字段显示 `none`。渲染 ≤8 KiB 预算不变；新增标签走 `ProjectStateSummaryLabels`（i18n 可注入）。
- `governance_matrix`（`src/service/governance-matrix/`，门禁引擎属主）：`buildRouting`（`routing.ts`）更新为 §3.1 矩阵：convener→生产角色；chief→verifier + stage-request；卡种/发起角色更新；`src/common/门禁引擎/governance-roles.ts::BUILT_IN_ROLE_MATRIX`（:138-218）更新 chief/convener/rapporteur/nominator/verifier 的 duty/mainChain/dispatchScope 文案。矩阵只读、不表达权限，但必须与真实模块一致。

---

## 8. 3 张客户卡与高风险

### 8.1 意图确认卡（A3）

- 发起：chief；`request_choice(cardKind="intent-confirm")`；选项 `confirm`/`revise`（`CHIEF_INTENT_CONFIRM_CARD` 不变）。
- 绑定：`documentRefs=[{kind:"intent", path, sha256}]`（应用计算）；客户确认后 `request.resolved` 记录 decisionId + documentRefs。
- 判定：confirm → A4；revise → A2（产品出新版本；旧意图只读）；超时/拒绝 → 不写盘、不推进。
- judge 代批：decision 组「替我决策」开启时可代批 `confirm`；`revise` 不代选（沿用）。

### 8.2 方案确认卡（A6）

- 发起：**chief**（从 rapporteur 移到 chief）；`request_choice(cardKind="proposal")`；选项 `accept`/`revise`/`reject`（保留 `accept-quick` 兼容 token 可不展示）。
- 绑定：`documentRefs=[intent, proposal, modules, roster, architecture]`（path+sha256，应用计算）；`preview` 展示方案摘要/模块/名单（不含全文）。
- 校验：最新 proposal/modules/roster/architecture 存在、schema 通过、hash 可算；roster 引用与 proposal/modules 一致。失败 ⇒ 不发卡（`proposal-document-missing`/`proposal-hash-drift`）。
- 判定：accept → A7；revise → A5（新版本）；reject → workflow blocked/closed（客户拒绝，不自动返工）。
- **替代现状**：固定路径不调用 `proposalCardFrozenRejection`（run pin 不存在）；legacy 路径保留。proposal-draft-run 证据绑定（A′）在固定路径不适用；以 basis 文档 hash 绑定替代。

### 8.3 任命确认卡（A10）

- 发起：**chief**（从 nominator 移到 chief）；`request_choice(cardKind="appointment", multiple=true)`；选项=名单角色 id；推荐集=名单顺序（应用从 roster 生成；不采信模型自报）。
- 校验：roster path+sha256 必须等于 basis 记录；全部名单角色已 `role.activated`（A8）；选项集合=名单；推荐集=名单顺序；不得含内置角色 id。
- 判定：`request.resolved.targetRoleIds`=客户选中；运营只能为选中角色派实现任务。选子集 ⇒ 只为子集派发。
- **替代现状**：不要求 D3 先于写卡；写卡授权来自 A6 方案卡 + roster。nominator `preflight` 的 `appointment` 事实包重定义为 activation（提案决定+roster）与 dispatch（任命卡决定）两阶段（§3.4）。
- judge 代批：decision 组可代批推荐集（沿用 D3 语义：appointment 必须等于应用提供的推荐集，不得发明 id）。

### 8.4 高风险合并卡（A13/B4）

- 卡种：`merge-main`（应用自有 confirm；approval 组；可 judge 代批）。`src/model/runtime.ts`：`GovernanceCardKind` 联合加 `"merge-main"`；`GOVERNANCE_CARD_GROUP` 加 `"merge-main":"approval"`；`GOVERNANCE_CARD_KINDS` 派生自动包含。
- 构造/呈现：仅应用（`app/desktop/workflow.ts` + 现有 customer-input 通道）；角色工具 schema 不接受该 token。
- preview 必含：workflowId/flowId、main base OID、branch tip OID、变更文件数、diff stat、合并方式（merge/initial）、高风险提示；客户 approve 后才执行。
- 裁定：客户本人或 judge（「替我审批」开启，approval 组）；judge `approve` 可代批，judge `deny` 不适用（转人工）；`manual` 转客户。决策来源如实记录（customer / judge-delegated，不冒充）。
- 高风险清单不变：发布、删除、支付、外部副作用、权限、迁移；合并 main 属发布。tag/push/产物发布另需客户授权。
- 不新增客户可见门：该卡是既有高风险确认机制对「合并 main」的具体化；固定路径的客户卡总数仍为 3 张确认卡 + 高风险动作卡（按动作出现）。

### 8.5 验收卡与 3 卡口径

- 固定路径：verifier 不发 `acceptance` 卡；验收=独立质检报告 + 幕僚决策 + 汇总客户；发布合并卡承担交付确认。
- 保留 `acceptance` 卡种/verifier `cards` 供 legacy；固定路径在卡种过滤层抑制（`cardKindsOf(roleId, workflowMode)` 或 `allowedCardKinds`）；legacy 行为逐字不变。
- 客户可见的「确认」仍只有意图/方案/任命三张；decision 卡用于材料性选择/需求变更审批（既有），不是固定确认卡。

---

## 9. 迁移/废弃清单与影响

### 9.1 机制/文件处置总表（摘要；逐文件见 §6.5 与附录 A）

| 机制/文件 | 处置 | 默认路径 | 迁移动作 |
| --- | --- | --- | --- |
| trunk ref/manifest/journal/history（`src/service/trunk/**`、`src/provider/trunk/**`） | compat-only | 不触达 | 不迁移；旧项目历史只读保留 |
| bootstrap/冻结闭包（`trunk-derive/recovery/verify`、`bootstrap-frozen-closure*`） | compat-only | 不触达 | 同上 |
| 候选 ref/发布三段式（`git-candidate-store`、`git-capabilities`、schema git 工具） | deprecate（保留代码） | 不注入/不调用 | 新路径用普通 Git + 合并卡 |
| run pin/run change（`run-manifest.ts`） | compat-only | 不调用 | 新路径无 run；旧 run 保留 |
| stable-write 许可/确认卡（`stable-write-runtime`、`versioned-doc-guard` stable 部分） | deprecate | 不注入/跳过 | 新路径普通 `-vN` |
| 16 MiB 清单预算/发布租约/run 歧义 | 随机制取消 | 不存在 | 无 |
| VCA/修正案（`version-change-*`） | compat-only（重型可选） | 不注入 | 固定路径新 `-vN`；例外可启用 |
| refactor 申请（`refactor-runtime`） | deprecate | 不注入 | — |
| 角色激活 trunk 绑定（`prepareRoleActivation/activateRoleDocuments/prepareRoleDraftScope`） | deprecate（旧函数保留） | 新 `workflowService` 版本 | 新激活只写文件+账本 |
| 意图/方案/任命卡 | **keep** | 3 张，不合并 | 方案/任命发起人改幕僚 |
| 验收卡 | compat-only | 固定路径抑制 | 内部验收 |
| 审计 sidecar/judge/doc_format/写区/高风险 | **keep** | 保留 | 矩阵/文案小幅更新 |
| `src/common/gates/index.ts` | keep 不变 | 不调用（默认） | 旧 trunk 专用 |
| `src/common/门禁引擎/workflows/chief/chief-workflow.md` | keep + **重写** | 读 v2 | 门禁引擎 owner |
| `src/common/门禁引擎/governance-roles.ts::BUILT_IN_ROLE_MATRIX` | keep + 改文案 | 读 | 门禁引擎 owner |
| `src/common/shared/intent-entry-contract.ts` | keep + 改 nominator 一句 | 读 | shared-code owner |

### 9.2 对已合并修复的影响

| 已合并修复 | 影响 | 处置 |
| --- | --- | --- |
| judge 代批（2026-11-09） | 保留；新增 `merge-main` approval 组路径 | 扩展 `governance-judge-*` 与 `customer-input.ts`；旧用例不回归 |
| doc_format（2026-11-09） | 保留；team-plan 说明更新；旧 trunk/VCA 格式保留 legacy | 更新 `doc-format-specs.ts` 文本；索引预算不增（不新增格式 id） |
| 提案卡 run 绑定修复（2026-11-09） | 固定路径改为文档 hash 绑定；legacy run 绑定保留 | 新路径不调用 frozen-run 拒绝；新增 `proposalDocumentBinding` |
| bootstrap 冻结闭包修复（#82） | 新路径不触达；代码保留 | compat-only；不回退 |
| team-plan run 绑定（P1.1） | 固定路径无 runId/baseDigest；legacy 保留 | `complete_team_plan` 双模式 |
| 文档格式/shell 审计/网络/重试（Wave-1/2） | 不冲突 | 保留 |

### 9.3 贪吃蛇 target 历史 trunk 状态

- 仓库内无贪吃蛇源码；真实 target 在仓库外（历史路径如 `ans-game2d-snake-2026-11-09\target`、`ans-snake-fullchain-run-2026-11-10\round*`）。
- `.ans/trunk` t1/t2 历史按设计 v2 §五**直接忽略**：新路径首次 `workflow.started` 记录 `legacyStateIgnored:[".ans/trunk/**", ".ans/runs/**", ...]`；不删除、不迁移、不读取为前置。
- 若旧 target 有活动 pinned run：该 flow 在 run 关闭前按 legacy 路径继续；关闭后新 flow 走固定路径。新 flow 不复用旧 pin/D3/角色激活。
- 真机全链使用**全新空项目**，不污染历史 target。

### 9.4 模式切换/迁移规则（确定性）

1. `.ans/project.json` 显式 `workflowSchema` 优先。
2. 缺省：有活动 legacy run/trunk 的 flow ⇒ legacy；否则 fixed。
3. 首次 fixed workflow 启动写 `workflowSchema:"two-fixed-paths/v1"`。
4. legacy flow 关闭后不自动迁移文档/账本；新 flow 重新记录 basis/团队计划。
5. 固定路径遇到旧账本（versions/VCA/stable/doc-freezes/trunk/runs）：只读忽略，不校验、不写、不阻塞（除非旧 run 仍活动）。
6. 不自动删除/归档旧账本；不把治理状态写回 Git。

---

## 10. 开发分工与写集建议

### 10.1 owner / 写集（单一 owner、零重叠；以 B1/团队计划最终冻结为准）

| 工作包 | owner（角色） | 写集（文件/目录） | 依赖 |
| --- | --- | --- | --- |
| W1 账本/模型基础 | 运行时核心 + shared-code + 门禁引擎 | `src/model/runtime.ts`（workflow/basis/release 类型、task 字段、merge-main 卡种；运行时核心）、`src/common/shared/config-loader.ts`（workflowSchema；shared-code）、`src/model/role.ts`（RoleDispatchPurpose；门禁引擎属主） | 无 |
| W2 工作流状态机/服务 | 编排 | `src/common/编排/workflow-state.ts`（新）、`workflow-service.ts`（新）、`basis-guard.ts`（新）、`workflow-preconditions.ts`（派发矩阵）、`run-role.ts`（固定模式分支/注入/写门禁）、`governance-judge-*`（merge-main 判定）、`project-state.ts`（workflow 视图） | W1 |
| W3 派发/会话路由 | 桌面窗口 + 编排 | `app/desktop/session.ts`（routeFixedPathDispatch、direct 能力过滤）、`app/desktop/workflow.ts`（新）、`workflow-git.ts`（新）、`customer-input.ts`（merge-main 通道）、`interface.ts`（必要时 IPC） | W1/W2 |
| W4 角色模块/卡 | chief-code、convener-code、product-code、rapporteur-code、nominator-code、verifier-code | `src/common/roles/<role>/**`（卡文本/cards/dispatch/preflight/context/tools） | W1/W2 契约 |
| W5 工具面/schema | 运行时核心 | `src/provider/runtime/schema.ts`、`src/provider/runtime/tools.ts`（request_release_merge 工具、task 字段、文案） | W1 |
| W6 门禁/矩阵/流程资源 | 门禁引擎 + gates-code | `src/common/门禁引擎/classify-shell.ts`（v5）、`governance-roles.ts`（matrix 文案）、`workflows/chief/chief-workflow.md`（重写）、`src/service/governance-matrix/**`；`src/common/gates/index.ts` **不改** | W1 |
| W7 桌面 UI/呈现 | 桌面窗口 | `app/desktop/**`（卡片呈现沿用；workflow 状态显示；VCA/trunk 面板在 fixed 模式隐藏/只读） | W1/W3 |
| W8 测试 | 测试 + 各 owner 单测 | `test/测试/**` 全链/跨层；各 owner `test/<domain>/` 单测 | W1–W7 |
| W9 独立复核/B1/B2 | 独立验收 | 只写自身 `角色卡/独立验收/docs/**`、`docs/acceptance/**`（任务精确范围授权） | 方案 |

### 10.2 开发批次（B0–B5）

| 批次 | 内容 | owner | 写集 | 依赖 | 验收钩子（D1 级） |
| --- | --- | --- | --- | --- | --- |
| **B0 基础设施/账本** | 模型类型、config workflowSchema、jsonl 账本读写、workflow-state 投影、schema/task 字段、merge-main 卡种 | 运行时核心 + shared-code + 门禁引擎 + 编排 | W1 + `workflow-state.ts`/`workflow-service` 骨架 | 无 | `npm run typecheck`；新增单测（投影/幂等/坏行）；旧测试零回归 |
| **B1 派发权/状态机** | 派发矩阵、stage-request、run-role/session 固定路由、阶段转移/完成判定 | 编排 + 桌面窗口 | W2/W3（路由部分） | B0 | 派发矩阵全组合单测；stage 转移/幂等单测；`star-routing`/`workflow-preconditions` 更新 |
| **B2 角色模块/工具面** | 6 角色 cards/dispatch/preflight/卡文本；schema 文案/字段；chief workflow 资源 | 6 个角色 code + 运行时核心 + 门禁引擎 | W4/W5/W6（资源） | B0/B1 | `test/roles/**` 差分重钉；工具注册/卡种测试；`role-module-contract` 15 项 |
| **B3 桌面/卡片** | routeFixedPathDispatch、3 卡呈现、merge-main 卡/judge、direct 能力过滤 | 桌面窗口 + 编排 | W3/W7 | B1/B2 | session 集成测试（无 run/trunk 文件）；卡片通道测试；judge 代批测试 |
| **B4 迁移/废弃** | classify-shell v5、legacy 工具不注入、legacy 路径 compat、旧状态忽略 | 门禁引擎 + 编排 + 桌面窗口 | W6 + 注入过滤 | B1–B3 | v5 规则单测；legacy fixture 不回归；fixed 模式无 trunk/run 写入断言 |
| **B5 测试/真机** | 全量确定性回归、跨层全链、真机贪吃蛇 | 测试 + 独立验收 | `test/测试/**` | B0–B4 | `node --test --test-concurrency=1` 增量不回归；真机全链报告（另授权） |

### 10.3 H1 影响（边界/写集）

- **边界修订 = 0**：所有新文件放在既有 directory 授权：
  - `src/common/编排/`（编排目录授权）：workflow-state/workflow-service/basis-guard（新文件）。
  - `app/desktop/`（桌面窗口目录授权）：workflow.ts/workflow-git.ts。
  - `src/common/shared/`（shared-code 目录授权）：config-loader 编辑（无新文件也可）。
  - `src/model/runtime.ts`、`src/model/role.ts`、`src/provider/runtime/schema.ts|tools.ts`、`src/common/门禁引擎/**`、`src/common/roles/**`：均为既有 file/directory 授权内的编辑/新增。
- **需要接口评审（非边界）**：`RoleToolId` +1（`requestReleaseMerge`）、`RoleDispatchPurpose`、`GovernanceCardKind` +1（`merge-main`）、`task.created` 字段、`dispatch_task` schema 字段。按契约 §4.4 走角色模块/门禁/gates/shared 评审，不新增客户卡。
- **若独立复核要求**：父门覆盖 fixed 派发（`src/common/gates/` reason 扩展）或新增 provider 目录 ⇒ 属显式升级点（gates-code 接口评审/人事边界修订），本方案默认不做。

---

## 11. 测试与真机

### 11.1 确定性测试矩阵（新增/更新）

| 类别 | 测试点 | 建议文件 |
| --- | --- | --- |
| 状态机 | A1–A13/B1–B4 合法转移、非法转移、重试 attempt、停止/客户覆盖、投影幂等/坏行 | `test/编排/workflow-state.test.ts`（新） |
| 派发权限 | chief/convener × 6 内置/项目 × purpose 全组合；stage-request 例外；越权码 | `test/编排/workflow-preconditions.test.ts`（更新）、`test/roles/*`（更新） |
| 阶段请求 | dispatch_task stage-request 字段/幂等/重复抑制/无写权；运营必须再派发 | `test/测试/stage-request-integration.test.ts`（新） |
| 基线 | git init（新/已存在/父仓库/dirty）、文档 hash/预算、团队计划结构、失败面/幂等 | `test/编排/baseline-service.test.ts`（新） |
| 账本/依据 | basis 记录/漂移/修正；workflows/releases 事件 schema；坏行计数；不写旧账本 | `test/编排/workflow-ledger.test.ts`（新） |
| Git v5 | add/commit 允许范围；push/merge/reset 拒绝；staged 越界拒绝；无 task scope 拒绝 | `test/门禁引擎/classify-shell-v5.test.ts`（新/更新） |
| 释放合并 | 初始 main/合并/冲突/拒绝/幂等/未授权；judge 代批；不 push/tag | `test/编排/release-merge.test.ts`（新）、`test/桌面应用` 集成 |
| 卡片 | 3 卡发起/校验/绑定/documentRefs；方案/任命发起人；验收卡抑制；merge-main 审批组 | `test/编排/decision-card.test.ts`、`test/roles/*`、`test/桌面应用/customer-input*` |
| 迁移兼容 | legacy 项目/在飞 run 走旧路径；fixed 新项目不触达 trunk/run/stable；旧账本忽略 | `test/测试/existing-project-compat-verify`、`test/测试/mode-switch.test.ts`（新） |
| 审计 | shell/git 审计行不减少；release 审计字段；judge 来源不冒充客户 | `test/编排/shell-audit.test.ts`、新增 release 审计测试 |
| 全链 | 空项目→意图→方案→激活→基线→实现→验收→合并；SessionManager 集成（假会话） | `test/测试/fixed-path-full-chain.test.ts`（新，替换/并行 `i-full-chain`） |

### 11.2 旧断言处置与 known red

- **必须重写（行为有意变化）**：`test/桌面应用/star-routing.test.ts`（chief→product/convener→verifier 旧断言）、`test/测试/governance-e2e-auto/i-full-chain.test.ts`（chief 派产品）、`test/编排/workflow-preconditions.test.ts`（convener→product 由拒改允、chief→五内置）、`test/roles/*/differential.test.ts`（卡文本/cards/dispatch 重新钉新 oracle）、`test/门禁引擎/role-module-contract.test.ts`（14→15 项）、`test/编排/convener-module-consumption.test.ts`（verifier 目标改 product/rapporteur/nominator）。
- **保持不改（legacy compat）**：`test/编排/trunk-*`、`test/测试/trunk-stable-write-integration.test.ts`、`bootstrap-frozen-closure-integration.test.ts`、`run-pin-e2e.test.ts`、`test/编排/version-change-*`、`test/桌面应用/version-change.test.ts`、`trunk.test.ts`；按 legacy 模式运行，不得为求绿修改断言。
- **known red 口径**：实施基线重取 `node --test --test-concurrency=1`；`test/测试/version-change-integration.test.ts` 9 红（vca-channel-unavailable）、`optional-acceptance.test.ts` 6/2/1/3/0、`test/编排/**` 22 fail/2 skip 为既有参照；判定：同名用例不得恶化、新增确定性失败=0、新 skip=0、既有失败消失需解释；环境抖动须同候选隔离复跑排除。不修改 `optional-acceptance.test.ts`。
- **D1/B2 证据**：每批 `npm run typecheck` + 受影响套件 before/after TAP + 失败名集合 diff + 文件清单/写集外 diff=0。

### 11.3 真机全链（一次，空项目→贪吃蛇；另授权、预算另报）

1. **隔离实例**：全新临时项目目录（空文件夹）；独立 Electron userData/session 目录、独立 `ANS_E2E_OUTDIR`；不使用 9222/9223（改用隔离端口或不开远程调试）；真实 Electron + 真实模型；预算（模型轮次/费用）另报审批；失败即停，不上报成功。
2. **步骤**：
   1. 导入空项目 → 打开幕僚 → 客户说「做一个贪吃蛇游戏（键盘控制、计分、重开、边界碰撞）」。
   2. 幕僚判断路径 A，发 A1 阶段请求；运营派产品 → `docs/product/snake-intent-v1.md` → 幕僚意图卡（客户 confirm）。
   3. 运营派策划 → proposal/modules/roster/architecture → 幕僚方案卡（客户 accept）。
   4. 运营派人事 → 角色卡/边界/激活（含 env-bootstrap 或合法省略）；运营写团队计划 + 基线（git init、hash 入账、计划落盘）。
   5. 幕僚任命卡（客户确认名单）；运营派实现角色；实现角色在 `ans/task/<workflowId>` 提交代码/测试/报告（串行写任务）。
   6. 幕僚派 verifier（实施前 criteria、实施后 report）；不通过则返工；通过后运营汇总。
   7. 幕僚汇总交付 → 高风险合并卡（客户确认）→ 应用合并 main（本地，不 push/tag）→ 客户可玩/可开。
   8. 检查：`.ans/state/workflows.jsonl`/`basis.jsonl`/`releases.jsonl` 事件完整；`.ans/trunk`、`.ans/runs` 未被新路径写入；`docs/audit/shell-gate.jsonl` 有 git 审计；3 张卡各一次；无额外客户门；游戏可玩、测试通过。
3. **失败处理**：任何阶段失败 → 停止、保留现场/账本/日志，按真实错误回报；不合并 ans-studio main、不打 tag/发布产物。
4. **预算**：单独报告真实模型使用量/费用；本方案不含预算批准。

---

## 12. 风险、默认项、待确认与披露

### 12.1 主要风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 阶段状态机与现有任务/报告/卡事件语义不一致 | 阶段卡死/误推进 | 应用唯一投影 + 幂等键 + 非法转移拒绝 + 全组合测试 |
| 幕僚→运营 stage-request 被误当生产线派发 | 权限口径争议/越权 | 四重校验（来源/目标/taskKind/sideEffect/无 module）+ 文案/矩阵/测试钉住 |
| 3 卡发起人迁移（方案/任命）破坏旧路径 | 旧项目卡失败 | 固定/legacy 双模式；旧路径逐字保留；兼容测试 |
| 任命卡在写卡之后（A8→A10）与现状 D3 相反 | 人事写卡授权缺口 | 写卡授权改由 A6 方案卡 + roster；nominator preflight/激活服务校验；测试覆盖 |
| 普通 Git 放开写入面 | 越权提交/历史破坏 | v5 精确白名单 + staged 路径校验 + 分支/任务 scope + merge 只走应用；push/tag 硬拒 |
| 合并 main 冲突/半合并 | 仓库脏/交付失败 | `merge --abort` + fail-closed + 不 force/reset；冲突回报 |
| 旧 trunk/run/VCA 代码残留 | 误触达/维护负担 | 双模式开关 + 不注入 + 调用点断言 + 后续清理变更 |
| 文档 hash 漂移/旧版本被改 | 依据失真 | basis 校验 + `-vN` 只读 + drift 阻塞执行/发布 |
| 真机全链预算/环境 | 无法完成验证 | 隔离实例、预算另报、失败即停、真实回报 |
| 接口评审（RoleToolId/卡种/purpose）未过 | 实现返工 | B0 前先走接口评审；备选：发布合并走应用 UI 动作（不加工具） |

### 12.2 默认项与待确认 Qs

**设计 v2 §六默认项（全部按默认采纳）**

1. 基线失败可见性：只回报幕僚/运营，不弹客户卡。
2. 路径 B 触发：幕僚判断；客户可明示覆盖。
3. 幕僚暂停/改道：具备请求能力，运营执行（stage-request/close）。
4. 合并 main 确认：客户本人确认卡；可 judge 代批；高风险清单不变。

**本方案默认取舍（需协调方确认，若不认可则升级）**

- Q1 **验收卡**：固定路径不发 acceptance 卡（设计 v2 只列 3 张确认卡；验收=独立质检+幕僚决策+发布合并卡）。若客户要求交付验收卡，则需新增/恢复第 4 张卡口径（与设计 v2 冲突，需客户确认）。
- Q2 **发布合并发起**：chief `request_release_merge` 触发、应用执行；若接口评审拒绝新 RoleToolId，备选为桌面 UI 动作/应用在 A13 自动呈卡（不新增工具）。
- Q3 **写任务串行**：默认同一工作区一次一个写任务（确定性/避免分支冲突）；如需并行，另立 worktree/分支模型（T3 升级）。
- Q4 **路径 B 无 basis 时的快照**：默认自动记录只读文档快照（`basis.recorded reason:"path-b"`），不视为基线 3 件小事；请复核确认此解释。
- Q5 **合并范围**：默认只本地合并 main；push/tag/产物发布不自动，另需客户授权。若客户要求自动 push，另报高风险/权限。
- Q6 **父门**：固定路径默认不调用 `evaluateChiefDispatchParent`，用 session live-turn + assigned-task 证据；若独立复核要求覆盖，作为 gates 升级点。

### 12.3 限制与披露

- 本方案只读清点 + 文档产出；未写产品/测试代码、未改角色卡/边界、未提交/推送/合并/发布；未运行真实模型/Electron。
- 行号为 HEAD `10f90c7` 快照；实施以符号名/文本锚点为准；工作树启动计划已更新（75 行 / 8,913 B / `8b207d…`）。
- 旧机器（trunk/VCA/stable/run）保留 compat；本方案不删除、不迁移历史账本；删除/清理另立变更。
- 真机全链预算另报；本方案不构成预算批准、验收或实施授权。
- 方案与设计 v2 冲突处均以设计 v2 为准；本方案未擅自扩大客户口径（Q1–Q6 需确认）。

---

## 附录 A：关键符号/行锚点索引（实施用）

| 锚点 | 文件:行 |
| --- | --- |
| 派发硬授权 | `src/common/编排/workflow-preconditions.ts:1590-1645` |
| 五内置 allowlist | `workflow-preconditions.ts:1560-1566` |
| 报告回创建者 | `workflow-preconditions.ts:1674-1682` |
| 团队计划解析 | `workflow-preconditions.ts:60-112` |
| D3 卡事实包 | `workflow-preconditions.ts:1434-1455` |
| chief dispatch | `src/common/roles/chief/internal/dispatch.ts:24-61, 88-139` |
| chief tools | `src/common/roles/chief/internal/tools.ts:30-37` |
| chief cards | `src/common/roles/chief/internal/spec.ts:61-72` |
| convener dispatch/cards | `src/common/roles/convener/index.ts:97, 191-238` |
| rapporteur cards/Git 段 | `src/common/roles/rapporteur/internal/spec.ts:37, 91-108` |
| nominator cards/preflight | `src/common/roles/nominator/index.ts:145-158, 242-310` |
| verifier cards/dispatch | `src/common/roles/verifier/index.ts:126-140, 232-346` |
| 派发父门 | `src/common/gates/index.ts:82-100, 228-253` |
| 工具 schema dispatch_task | `src/provider/runtime/schema.ts:614-800`（taskKind :799） |
| request_choice | `schema.ts:469-568`（cardKind :527） |
| request_confirmation | `schema.ts:283-467` |
| direct capabilities | `schema.ts:37-77` |
| git 能力 | `schema.ts:79-109` |
| task.created/request.* | `src/model/runtime.ts:1365-1533` |
| 卡种/分组 | `src/model/runtime.ts:887-977` |
| RoleToolId/RoleDispatchPolicyInput | `src/model/role.ts:245-330` |
| 工具装配表 | `src/common/门禁引擎/role-tool-registry.ts:52-68` |
| 角色注册/矩阵 | `src/common/门禁引擎/governance-roles.ts:138-218, 246-280` |
| shell v4/Git 白名单 | `src/common/门禁引擎/classify-shell.ts:1046, 1134, 1551` |
| run-role 工具注入 | `src/pipeline/orchestration/run-role.ts:1759-1764, 1932-1959` |
| run-role 写门禁 | `run-role.ts:1094-1240` |
| run-role 卡种 | `run-role.ts:3073-3225` |
| session 派发 | `app/desktop/session.ts:8557-8591, 8912-9183` |
| session 提案卡冻结拒绝 | `session.ts:3261-3281` |
| session direct 能力 | `session.ts:4359-4371` |
| task 账本/幂等 | `src/common/编排/task-state.ts:109, 337-345, 365` |
| jsonl 轮转 | `src/common/shared/jsonl-ledger.ts:31-32, 80+` |
| run pin | `src/common/编排/run-manifest.ts:478-707` |
| completeTeamPlan | `src/service/trunk/impl/apply-journal.ts:2938-3020` |
| 角色激活/草稿 scope | `apply-journal.ts:3267, 3358, 3714` |
| 审计 sidecar | `src/common/编排/shell-audit.ts:25` |
| doc_format 54 格式 | `src/common/编排/doc-format-specs.ts`（id 列表 :509-2130） |
| judge 代批 | `src/common/编排/governance-judge*.ts`、`app/desktop/customer-input.ts:1320` |
| 高风险副作用 | `src/common/编排/task-state.ts:301-314`、`watchdog.ts:227-232` |
| 旧 VCA UI | `app/desktop/version-change.ts:93-116` |

## 附录 B：账本事件最小示例

```jsonl
{"v":1,"at":"2026-11-10T10:00:00.000Z","schema":"ans-workflow/v1","kind":"workflow.started","workflowId":"wf-3f2a...","flowId":"snake","path":"A","trigger":{"by":"chief","reason":"客户新需求"},"sourceTaskId":"t-..."}
{"v":1,"at":"2026-11-10T10:00:01.000Z","schema":"ans-workflow/v1","kind":"stage.requested","workflowId":"wf-3f2a...","flowId":"snake","path":"A","stage":"A1","requestTaskId":"t-...","requestDigest":"<64hex>","attempt":1}
{"v":1,"at":"2026-11-10T10:05:00.000Z","schema":"ans-basis/v1","kind":"basis.recorded","basisId":"bas-9c1d...","workflowId":"wf-3f2a...","flowId":"snake","documents":[{"kind":"intent","path":"docs/product/snake-intent-v1.md","version":1,"sha256":"<64hex>","bytes":1234}],"teamPlan":{"path":"docs/scheduling/snake-team-v1.md","version":1,"sha256":"<64hex>"},"repo":{"state":"initialized","branch":"ans/task/wf-3f2a...","mainUnborn":true},"operationId":"op-...","idempotencyKey":"baseline:wf-3f2a...:<planSha>","recordedBy":"application"}
{"v":1,"at":"2026-11-10T12:00:00.000Z","schema":"ans-release/v1","kind":"release.merged","releaseId":"rel-7d...","workflowId":"wf-3f2a...","flowId":"snake","baseOid":null,"tipOid":{"objectFormat":"sha1","hex":"<40hex>"},"mergeOid":{"objectFormat":"sha1","hex":"<40hex>"},"mergeKind":"initial","files":[{"path":"src/main.ts","status":"A"}],"diffDigest":"<64hex>"}
```

## 附录 C：稳定失败码清单（本方案新增）

- 派发/阶段：`chief-production-dispatch-forbidden`、`convener-to-verifier-forbidden`、`stage-request-required`、`stage-request-open`、`stage-request-invalid`、`stage-transition-invalid`、`stage-workflow-mismatch`、`workflow-active-conflict`、`workflow-not-found`、`workflow-closed`、`workflow-corrupt`、`write-task-busy`、`module-owner-mismatch`、`professional-role-unavailable`。
- 基线：`baseline-identity-invalid`、`baseline-git-init-failed`、`baseline-parent-repository-detected`、`baseline-repository-dirty`、`baseline-document-missing`、`baseline-document-unreadable`、`baseline-document-budget`、`baseline-team-plan-missing`、`baseline-team-plan-invalid`、`baseline-plan-hash-drift`、`baseline-roster-drift`、`baseline-legacy-field-forbidden`、`baseline-operation-conflict`、`baseline-ledger-write-failed`。
- 依据：`basis-missing`、`basis-drift`、`basis-document-unreadable`、`basis-hash-mismatch`、`basis-amend-invalid`。
- 卡：`proposal-document-missing`、`proposal-hash-drift`、`appointment-invalid`（既有）、`appointment-roster-mismatch`、`appointment-card-origin-forbidden`、`acceptance-card-suppressed`。
- 激活：`activation-roster-mismatch`、`activation-role-not-selected`、`activation-document-invalid`、`activation-boundary-expansion`、`activation-hash-drift`、`activation-ledger-write-failed`。
- 发布：`release-workflow-not-ready`、`release-branch-mismatch`、`release-worktree-dirty`、`release-tip-changed`、`release-main-busy`、`release-merge-conflict`、`release-merge-failed`、`release-card-unavailable`、`release-already-merged`、`release-unauthorized`。
- Git shell：`git-command-not-ordinary`、`git-write-scope-forbidden`、`git-branch-mismatch`、`git-commit-outside-task`、`git-merge-main-forbidden`。

## 附录 D：与设计 v2 的逐条冲突与默认处置

| # | 设计 v2 | 现状 | 冲突 | 默认处置 |
| --- | --- | --- | --- | --- |
| C1 | 运营是生产线唯一派发者 | chief→五内置；convener→verifier+project | 矩阵相反 | §3.1/§3.2 重写；legacy 保留 |
| C2 | 幕僚只派独立验收；不派生产线 | chief 创建 product/rapporteur/nominator/convener/verifier | 冲突 | chief→verifier + stage-request；其余拒绝 |
| C3 | 3 卡：意图/方案/任命，幕僚呈 | 方案=rapporteur；任命=nominator；验收卡存在 | 发起人/卡数冲突 | 方案/任命移 chief；验收卡固定路径抑制 |
| C4 | A8 建卡在 A10 任命前 | D3 任命先于写卡 | 顺序冲突 | 写卡授权=A6 方案卡+roster；任命卡授权实现派发 |
| C5 | Git 普通用法 | 结构化 git_query/candidate/publish + v4 硬拒 | 冲突 | v5 普通 Git + 应用合并；旧工具不注入 |
| C6 | 取消 trunk/run pin/stable/VCA 默认 | run pin/freeze/stable 是派发前置 | 冲突 | 固定路径跳过；legacy 保留 |
| C7 | 治理状态走账本 | 治理状态在 trunk/run/versions | 冲突 | 新账本 + 文档 hash；不写 Git |
| C8 | 基线 3 件小事 | completeTeamPlan 依赖 trunk CAS/journal | 冲突 | 复用工具、固定模式新实现；legacy 双模式 |
| C9 | 高风险清单不变 | 既有 shell/trunk/directive 高风险 | 一致 | 保留；新增 merge-main 卡 |
| C10 | 不新增角色/边界/客户门 | — | 一致 | 0 角色/0 边界；merge-main 是既有高风险确认具体化 |

---

*本文件为实现级方案 v1，供独立复核与 B1 冻结；不构成实施授权、验收或客户批准。*

## 附录 E：旧机制逐文件处置（补充 §6.5；默认路径不触达）

> 处置定义：**keep** = 默认路径继续使用（可能小幅修改）；**deprecate** = 代码保留、默认不注入/不调用、后续清理候选；**compat-only** = 仅为旧项目/在飞 run/历史/旧测试保留，默认路径不 import/不调用/不写。

| 文件 | 处置 | 默认路径 | 理由/备注 |
| --- | --- | --- | --- |
| `src/service/trunk/abstract/trunk-service.ts` | compat-only | 不调用 | 旧 trunk Service 抽象 |
| `src/service/trunk/impl/amendment-expansion.ts` | compat-only | 不调用 | 修正案扩大检测（VCA/trunk） |
| `src/service/trunk/impl/amendment-validate.ts` | compat-only | 不调用 | 修正案校验 |
| `src/service/trunk/impl/apply-journal.ts` | compat-only | 不调用 | 4,030 行 trunk 两阶段 apply/journal/激活/团队计划旧实现；删除另立变更 |
| `src/service/trunk/impl/git-capabilities.ts` | deprecate | 不注入 git_query/git_candidate/git_publish | 旧结构化 Git 能力 |
| `src/service/trunk/impl/refreeze.ts` | compat-only | 不调用 | 旧 refreeze/history |
| `src/service/trunk/impl/stable-snapshot.ts` | compat-only | 不调用 | stable 快照 |
| `src/service/trunk/impl/trunk-common.ts` | compat-only | 不调用 | 共享辅助 |
| `src/service/trunk/impl/trunk-derive.ts` | compat-only | 不调用 | 旧 trunk 派生/冻结闭包 |
| `src/service/trunk/impl/trunk-recovery.ts` | compat-only | 不调用 | 旧恢复 |
| `src/service/trunk/impl/trunk-verify.ts` | compat-only | 不调用 | 旧 verify |
| `src/service/trunk/impl/upgrade-validate.ts` | compat-only | 不调用 | 版本升级链 |
| `src/service/trunk/public/trunk-service.ts` | compat-only | 不调用 | 旧公共出口 |
| `src/provider/trunk/abstract/trunk-store.ts` | compat-only | 不调用 | 旧 manifest/amendment/journal 形状 |
| `src/provider/trunk/impl/fs-trunk-store.ts` | compat-only | 不调用 | FS 存储 |
| `src/provider/trunk/impl/git-candidate-store.ts` | deprecate | 不调用 | 候选 ref（git-candidate-store） |
| `src/provider/trunk/impl/git-command.ts` | compat-only | 不调用 | 固定 Git 传输/16 MiB 清单预算/租约；只读 matcher 已独立在门禁引擎 |
| `src/provider/trunk/impl/git-trunk-store.ts` | compat-only | 不调用 | trunk Git 存储 |
| `src/provider/trunk/public/trunk-store.ts` | compat-only | 不调用 | 旧公共出口 |
| `src/common/编排/run-manifest.ts` | compat-only | 不调用 | run pin/run-change/verifyPinnedRun |
| `src/common/编排/version-decision.ts` | compat-only | 不调用 | 版本决策申请（legacy） |
| `src/model/trunk.ts` | compat-only（类型） | 不用于新路径 | 旧 Git/trunk 共享类型 |
| `src/model/version-change.ts` | compat-only（类型） | 不用于新路径 | VCA/冻结/stable/refactor 类型 |
| `src/model/project-state.ts` | keep + 扩展 | 读 | 新增 workflow 视图字段 |
| `src/service/version-change/**` | compat-only | 不调用 | VCA/冻结服务（重型例外可另启用） |
| `src/provider/version-change/**` | compat-only | 不调用 | VCA/冻结/stable 存储 |
| `src/pipeline/orchestration/trunk-runtime.ts` | compat-only | 不调用 | 旧 bootstrap/refreeze/upgrade |
| `src/pipeline/orchestration/version-change-runtime.ts` | compat-only | 不调用 | VCA 卡/应用（重型例外可另启用） |
| `src/pipeline/orchestration/stable-write-runtime.ts` | deprecate | 不调用 | stable 写入许可/卡 |
| `src/pipeline/orchestration/refactor-runtime.ts` | deprecate | 不调用 | refactor 申请 |
| `app/desktop/version-change.ts` | compat-only | 固定模式不呈现/不自触发 | VCA/trunk 面板 IPC |
| `app/desktop/trunk.ts` | compat-only | 固定模式不呈现 | trunk 面板 |
| `app/desktop/write-preauthorization.ts` | compat-only | 固定模式不使用 | appointment-write 许可 |
| `src/common/门禁引擎/versioned-doc-guard.ts` | compat-only | 固定模式跳过 freeze/stable 判定 | R9 baseline/冻结 |
| `src/common/门禁引擎/shell-write-guard.ts` | compat-only | 固定模式跳过 stable 拒绝 | stable 写入 |
| `src/common/门禁引擎/pin-evidence.ts` | compat-only | 不调用 | 边界 pin |
| `src/common/门禁引擎/classify-shell.ts` | keep + v5 | 使用 | 普通 Git + 硬拒范围 |
| `src/common/门禁引擎/role-tool-registry.ts` | keep + 1 项 | 使用 | 新增 requestReleaseMerge |
| `src/common/门禁引擎/governance-roles.ts` | keep + matrix 文案 | 使用 | 注册表 facade；不复制规格 |
| `src/common/门禁引擎/workflows/chief/chief-workflow.md` | keep + 重写 v2 | 注入 | Chief 流程资源 |
| `src/common/gates/index.ts` | keep 不变 | 默认不调用 | 旧 trunk 证据链（见 §3.6/Q6） |
| `src/pipeline/orchestration/run-role.ts` | keep + 固定模式分支 | 使用 | 注入/写门禁/卡种 |
| `src/provider/runtime/schema.ts` / `tools.ts` | keep + 编辑 | 使用 | 新工具/字段/文案 |
| `src/common/roles/{chief,convener,product,rapporteur,nominator,verifier}/**` | keep + 编辑 | 使用 | 卡文本/cards/dispatch/preflight/context |
| `src/common/shared/config-loader.ts` | keep + workflowSchema | 使用 | 项目配置 |
| `src/common/shared/intent-entry-contract.ts` | keep + nominator 一句 | 使用 | 共享文本 |
| `src/common/shared/jsonl-ledger.ts` | keep 不变 | 使用 | 新账本复用 |
| `src/common/编排/task-state.ts` | keep 不变（读侧兼容新字段） | 使用 | 任务账本 |
| `src/common/编排/workflow-preconditions.ts` | keep + 派发矩阵 | 使用 | 硬授权；advisories 仅 legacy |
| `src/common/编排/project-state.ts` | keep + workflow 视图 | 使用 | 状态摘要 |
| `src/common/编排/doc-format-specs.ts` | keep + 说明更新 | 使用 | doc_format |
| `src/common/编排/governance-judge*.ts` | keep + merge-main | 使用 | judge 代批 |
| `src/common/编排/shell-audit.ts` | keep 不变 | 使用 | 审计 sidecar |
| `src/common/编排/decision-card.ts` | keep 不变 | 使用 | decision 卡 |
| `test/编排/trunk-*`、`test/测试/trunk-stable-write-integration.test.ts`、`bootstrap-frozen-closure-integration.test.ts`、`run-pin-e2e.test.ts`、`test/编排/version-change-*`、`test/桌面应用/version-change.test.ts`、`trunk.test.ts` | compat-only（测试） | 不改断言 | 旧路径回归 |
| `test/桌面应用/star-routing.test.ts`、`test/测试/governance-e2e-auto/i-full-chain.test.ts`、`test/编排/workflow-preconditions.test.ts`、`test/roles/*`、`test/门禁引擎/role-module-contract.test.ts`、`test/编排/convener-module-consumption.test.ts` | 重写/更新（测试） | 新行为 | 见 §11.2 |
| `test/桌面应用/optional-acceptance.test.ts` | 不改（测试） | — | 基线已知红，禁止修改 |
