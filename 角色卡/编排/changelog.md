# 编排 变更记录

## 2026-10-29 — 工作流维护者化（v4.1）：机械前置、报告路由、shell 写区守卫/审计、验收最小事实

方案 v2.1 §5/§6/§8（T3；闸门 1/2 已过）。新增 `common/编排/workflow-preconditions.ts`（project-roster/v1 解析/校验、最新名单 version/hash、派发矩阵 M1–M8、报告路由 M9）。`task-state.ts`：`task.created.from`/`task.closed.by` 放宽到 chief/convener，`flowId/stepId` 与 `request.resolved.rosterVersion/rosterSha256` 校验（旧记录兼容）。`run-role.ts`：招人卡只由人事发起（选项=名单、推荐集应用生成）；移除 convener appointment 白名单；appointment-write boundary 目录 ⊆ 名单授权目录；shell 装配注入 `checkWrite` 守卫与执行前快照。`shell-gate.ts`/`shell-arming.ts`：deny 直拒、opaque → `manualOnly`、最终 allow 前快照。新增 `shell-post-audit.ts`（执行后越界写审计）。`governance-judge-facts/verdict/prompt.ts`：验收最小链事实（Q6 A），撤除旧 flow criteria/change-package 门槛。测试：新增 workflow-preconditions（8）、shell-post-audit（4）、appointment-roster（4）、acceptance-judge-minimal（3）；task-state +2、shell-operator-only +2、trio-worker-report +1；编排套件 503 计（502 过/1 红＝既有 symlink EPERM）。详见 `docs/scheduling/2026-10-29_change-workflow-maintainers-hiring.md`。

## 2026-10-29 — trio 内建 worker 注入 `submit_report`（客户真机：幕僚派发的 worker 不回短报）

**来源**：客户真机测试——幕僚派发给运营（convener）的任务完成后没有 `submit_report`，幕僚收不到回报、只能读文件/轮询。提交 `2499c01` 修正 `run-role.ts` 的 `suppressHandback`：`builtInGovernance && (trioSpec === undefined || trioSpec.id === "chief")`——trio 五个内建 worker（product/rapporteur/nominator/convener/verifier）**注入** `reportHandback`（`submit_report` 据此注册）；幕僚本人（不自我回交）与 single/su 旧模型**不注入**。幕僚卡同步改为「派发后立即结束本轮、不要 run_shell sleep / 连续 role_status 轮询」，5 张 worker 卡加「任务完成必须 submit_report 回短报」。本批只补测试与文档，未改生产逻辑。

**测试**：新增 `test/编排/trio-worker-report.test.ts`（3 tests：注入矩阵逐角色、worker 报告端到端取报告值、卡文本钉）；`test/编排` 480 计（479 过 / 1 红＝既有 Windows symlink EPERM）。**真机**（worktree 应用，客户场景）：运营收到任务后 `submit_report` 于 01:48:11 调用、`task.reported` 01:48:16 落盘，幕僚收到 `[工作结果]` 自动开启新一轮并结束回合（`role_status` 0 次、sleep 0 次）。证据见 `docs/scheduling/2026-10-29_change-test-run-fixes.md` §5。

## 2026-10-27 — 验收标准/交付演示证据改为截图 only（不得要求录屏）

**来源**：客户 2026-10-27 新规则（**ANS 系统，不是 demo**）——**策划的验收标准最多截图，不能要求录屏**；视觉证据最多真实运行截图，**不得要求录屏，缺录屏不得判失败**。本批只改编排边界内的治理会话提示词与测试；未改 `src/model/**`、`src/service/**`、`src/provider/**`、`app/**`、门禁引擎、角色卡、i18n、PM、skill、游戏项目；未新增角色/`FlowStepKind`/cardKind/权限；未 commit/push、未重启、未碰 `demos/`。

**改了什么**
- `govern-session.ts` 共 7 处 active 文案：①工程质量基线「交付」条；②标准工作流「验收标准」证据计划；③Proof 复核流程 ③；④Steward「质量与演示」；⑤Verifier「质量与演示核对」；⑥Draft「质量与证据」证据计划；⑦single/su 质量阶段要求。统一为「启动命令/访问地址 + 真实运行截图；视觉证据最多截图，不得要求录屏，缺录屏不得判失败」，保留日志/校验输出/哈希/关 DEBUG/真实启动/质量基线/架构核对/验收卡纪律。`flow-service.ts::ensureFlowSkeleton` 与 `flow-state.ts` 无录屏要求，未改。
- `test/编排/governance-session.test.ts`：trio 五角色与 single/su 提示均断言含 `真实运行截图`/`不得要求录屏`/`缺录屏不得判失败` 且不再出现 `截图/录屏`；标准工作流新增两条截图 only 断言。

**测试**：`governance-session.test.ts` **39/39**；`node --test "test/编排/**/*.test.ts"` → **1024 计/1022 过/1 红/1 skip**（唯一红＝既有 Windows symlink EPERM）；`npm run typecheck` → **exit 0**。

**跨角色待办**：① 门禁引擎角色卡 `governance-roles.ts` 仍有「截图/录屏」（质量基线/Convener/Verifier）且测试按旧文本断言，需其属主同步（本批按边界未改，两份基线暂不逐字一致）；② 桌面 `buildAcceptanceTaskMessage`/自动验收任务仍要求「截图或录屏」，需桌面属主改截图 only；③ 跨角色 e2e 与独立验收未做。详见[变更记录](docs/change/2026-10-27_change_screenshot-only-acceptance-evidence.md)。

## 2026-10-27 — 验收标准产物汇报能力透传（`report_artifact_ready`，仅质检/verifier）

**来源**：客户 2026-10-27 新设计——验收标准由质检写完后**只向应用汇报**，由应用校验并决定是否收口；质检不再盯文件自动勾卡、不得自批 flow 状态。运行时核心已交付冻结契约 `ReportArtifactFn`/`ReportArtifactInput`/`ReportArtifactReceipt` 与 `report_artifact_ready` 工具（`GovernedToolsOptions.reportArtifact`），门禁引擎同批只改 verifier 卡文本（未新增能力位）。本批只接线编排注入端；未改 `src/model/**`、`src/service/**`、`src/provider/**`、`app/**`、门禁引擎、i18n；未 commit/push、未重启应用、未碰 `demos/`。

**改了什么**
- `run-role.ts`：`AdapterCapabilities` 与 `openRoleSession` 输入新增可选 `reportArtifact?: ReportArtifactFn`（类型单一来源＝契约家 `model/runtime.ts`，字段名逐字）；注入判据 **只给内置治理角色中的质检/Proof（trio verifier）**——liaison/rapporteur/nominator/convener、single 旧 su 与项目角色即便误给也不注入（工具结构性不注册）；未提供 ⇒ 字段缺席。`createRuntimeAdapterFactory` 同名能力位显式透传 → Service `...options`（`RuntimeSessionOptions` 经 `Omit<GovernedToolsOptions,…>` 继承）→ `buildGovernedTools` 注册工具。编排**纯透传**（同一引用、不包装、不预调用），不写盘、不写 flow、不伪造接受或决定；**汇报成功 ≠ 自动完成**；不改变任何既有能力矩阵。
- 新增 `test/编排/report-artifact.test.ts` **3 例**：verifier 同引用透传 + 工具注册 + 载荷原样路由 + 回执原样转达 + 打开/开轮/settle 全程零 flow/账本写入；`deps.runtimeOptions` 残留同名能力也不能旁路给非 verifier；verifier 未提供、liaison/convener/旧 su/项目角色误给 ⇒ 不注入、工具不注册。

**测试**：定向 **3/3**；`node --test "test/编排/**/*.test.ts"` → **1024 计/1022 过/1 红/1 skip**（唯一红＝既有 Windows symlink EPERM）；`npm run typecheck` → **exit 0**（桌面属主并发补齐 `SessionManagerDeps.reportArtifact` 后全仓零错；本批编排文件始终零类型错误）。

**跨角色待办**：① 桌面窗口实现应用侧校验/收口（flowId/stepId 归属、path、sha256 一致性；按仅 verifier 注入）并补 `SessionManagerDeps` 字段；② 真实 Electron/模型端到端、跨角色 e2e 与独立验收未做。详见[变更记录](docs/change/2026-10-27_change_report-artifact-orchestration.md)。

## 2026-10-26 — 意图交接时由应用创建通用流程骨架（`ensureFlowSkeleton`，幂等、不覆盖）

**来源**：客户反馈「意图确认/交接后、提案/团队计划前 `flow_get` 报 not-found，角色无法登记 contract-freeze」。裁定：应用在**意图交接成功后、报告员开始前**按 intent 的 flowId 自动创建 `docs/flows/<flowId>.yaml` 的**通用骨架**（顶层 `status: skeleton`）；不新增 `FlowStepKind`、不预设项目角色/交付步骤。本批只改编排 `common/编排` 与应用侧公共出口，未改 `app/**`、`src/model/**`、`src/provider/**`、门禁引擎、共享 i18n；未 commit/push、未重启运行中的应用、未碰 `.claude/` 与 `demos/`。

**改了什么**
- `flow-service.ts` 新增骨架段：`FLOW_SKELETON_STATUS="skeleton"`、`buildFlowSkeletonSteps()`（八步全部 `pending`：contract-freeze/artifact/rapporteur → team-plan/artifact/convener → appointment/customer-decision/convener → role-cards/dispatch/nominator → role-readiness/artifact/convener → acceptance-criteria/artifact/verifier → change-package/artifact/convener → verification/acceptance/app；`dependsOn` 只表达标准顺序）、`ensureFlowSkeleton({projectRoot,flowId,qualityTier})`。
- `ensureFlowSkeleton` 语义：**已存在任何文件（骨架/完整流程/非法 YAML）⇒ `{ok:true,created:false}` 绝不覆盖**；存在性检查在 **per-project 串行队列**内（与 flow-service/应用专用收口同一队列，同进程并发恰一个 `created:true`）；不存在 ⇒ 候选过 `parseFlowStateYaml` 后 `mkdir -p` + 共享 `atomicWrite`（失败不触碰目标、不抛）；非法输入（projectRoot/flowId/qualityTier）fail-closed 且零落盘；不写账本/客户决定/.ans。
- `govern-session.ts` 公共出口薄再导出 `ensureFlowSkeleton`/`FLOW_SKELETON_STATUS`/`EnsureFlowSkeletonInput`/`EnsureFlowSkeletonResult`，W6-A 块补 `parseIntentFrontmatter`（桌面取意图 flowId/qualityTier）；`buildFlowSkeletonSteps` 不经公共出口暴露。
- `govern-session.ts::STANDARD_WORKFLOW_PROMPT` 补「**流程骨架与一次性替换（2026-10-26）**」一句（与门禁引擎运营卡同节成对，两处物理副本注释互指）：应用可能已建 `status: skeleton` 通用骨架；运营 / Steward 写团队计划后用一次 `cardKind=schedule-write` **一次性替换**为完整流程（含项目角色、交付步骤与 gate；保留 contract-freeze 证据）；无骨架时同一确认初始创建；替换后改用 flow 工具，其他角色不得直接写流程 YAML。不改变任何门禁判定。

**测试**：`test/编排/flow-service.test.ts` 新增 5 例（创建形状/revision=文件 sha256/不含 delivery-/gate；骨架、完整流程、非法 YAML 均不覆盖；三类非法输入零落盘；目标被目录占用或 `docs/flows` 为文件时明确失败且不破坏现场；并发恰一个 created）；`test/编排/governance-session.test.ts` 标准工作流用例补 4 条提示断言（trio 五职能 + single/su 均须含骨架/一次性替换；不成对即红）。定向 `flow-service.test.ts` + `flow-state.test.ts` **153 计/152 过/0 红/1 skipped**；`governance-session.test.ts` **39/39**；`test/编排/**` **1021 计/1019 过/1 红/1 skipped**（唯一红＝既有 Windows symlink EPERM）；`npm run typecheck` **exit 0**。

**跨角色待办**：① 桌面窗口已按本契约在 `app/desktop/session.ts::ensureIntentFlowSkeleton` 在途接线（未由本批修改）；其 `interface.ts` 用字面量 `"skeleton"` 识别骨架，建议改从公共出口只读导入 `FLOW_SKELETON_STATUS` 防漂移；② 运营 / Steward 写团队计划后用一次 `schedule-write` 把骨架替换为完整流程（保留 contract-freeze 证据）；③ 跨角色 e2e 与独立验收未做。**残余风险**：存在性检查与 rename 之间为 check-then-rename——同进程已串行化，跨进程同窗口创建同一 flow 时仍可能被覆盖（正常路径不触发；绝对保证需 `src/common/shared/` 的 no-clobber 原语）。详见[变更记录](docs/change/2026-10-26_change_intent-flow-skeleton.md)。

## 2026-10-26 — `request_requirement_change` 接入编排（报告员/统筹）+ 判断 agent 需求变更指引

**来源**：客户 2026-10-26 要求 + 同日纠正/补充（经主控任务转达；PM 规则 §二.15 与共享 i18n 已登记）。Draft / 报告员需要新授权/范围（联网、外部目录/仓库、范围、验收/技术标准、成本）时，不得写进提案卡「顺带获批」，应发 `request_requirement_change`。**需求变更审批卡由统筹（Convener）或提案角色（Rapporteur）发起**（decision 卡；发起方不得自批）；**审批人只有独立判断 agent（勾选「替我决策」时按唯一推荐项代批）或客户（未勾选时手选）**；**主理不审批，只在批准后执行意图变更**；**申请 ≠ 客户批准 ≠ 意图已变更**；不得删需求绕过闸门 0。本批只改编排注入面、decision 卡白名单/共享校验与 judge 文案，未改 `src/model/**`、`src/provider/**`、`app/**`、i18n、门禁卡，未新增 cardKind/FlowStepKind；未 commit/push、未重启应用、未碰 `demos/`。

**改了什么**
- `run-role.ts`：`AdapterCapabilities` 与 `openRoleSession` 输入新增可选 `requestRequirementChange?: RequestRequirementChangeFn`（类型单一来源＝契约家 `model/runtime.ts`，字段名逐字）；注入判据 **只给内置治理角色中的报告员 Rapporteur 与统筹 Convener**（其他内置角色、single 模型的旧 su、主理、Crew/Proof 与项目角色即便误给也不注入；工具结构性不注册）；未提供 ⇒ 字段缺席、工具不注册。`createRuntimeAdapterFactory` 同名显式透传 → Service `...options` → `buildGovernedTools`。`TRIO_CARD_KINDS.rapporteur` 增 `"decision"`（**仅限需求变更审批**；convener 原有 `"decision"` 保持）；拒绝文案同步为「统筹/Steward 或提案角色/Draft 发起」。本层**纯透传**（意图校验/去重/派发/账本/系统行由应用能力实现），**不改变** `requestClarification`/`handOffIntent`/`viewImage` 等既有能力矩阵。
- `decision-card.ts`：允许发起 decision 卡的角色收敛为 `DECISION_CARD_ALLOWED_ROLES = ["convener", "rapporteur"]`（其他内置/项目角色仍 fail-closed）；「rapporteur 仅需求变更用途」由 judge 指引/角色纪律约束（运行时契约无用途字段，机械上限只到角色）。
- `governance-judge-facts.ts`：新增并导出文案常量 `GOVERNANCE_JUDGE_REQUIREMENT_CHANGE_GUIDANCE`（**只作文案单一来源，不参与事实提炼/裁决**）：提案卡若含**未获意图授权**的新联网/外部目录/范围/成本授权 ⇒ 不得 approve；decision 组不能 deny ⇒ **manual/intent-drift**（approval 组夹带 ⇒ deny）；reason 必须写明「Draft 应先发 request_requirement_change；需求变更审批卡由统筹（Convener）或提案角色（Rapporteur）发起，发起方不得自批；审批由独立判断 agent（勾选「替我决策」时按唯一推荐项代批）或客户（未勾选时手选）完成；主理不审批，只在批准后执行意图变更；不得通过在提案卡上代批或将需求删掉绕过」。文案不再写「主理改意图 + intent-confirm 作为审批」。
- `governance-judge-prompt.ts`：系统提示新增「【提案卡与需求变更申请（2026-10-26 客户要求）】」节并逐字引用上述常量；decision rubric 由「仅统筹可发」改为「统筹/Steward 发起；报告员 Rapporteur 仅可为需求变更审批发起，发起方不得自批」；在「不判断（明确排除）」节补一句「未授权新授权属于意图漂移，不属工程质量/证据充分性排除项」。**机械权限零变化**（decision 组仍不得 deny、approval 组 deny 规则不变；`governance-judge-verdict.ts` 判定未改；`GovernanceJudgeFacts` 无新字段）。
- 新增 `test/编排/request-requirement-change.test.ts` **5 例**（rapporteur 提供 ⇒ 同引用/工具注册/载荷原样路由/回执如实；convener 同样注入；未提供 ⇒ 零注册；项目角色+旧 su+liaison/nominator/verifier 均不注入；不隐含/不改既有矩阵）；新增 `test/编排/requirement-change-judge-guidance.test.ts` **3 例**（指引文案、系统提示引用与机械权限表述、无新 cardKind/facts 字段）；`test/编排/decision-card.test.ts` 增 rapporteur 正向 1 例并把拒绝集合改为 Lead/Crew/Proof（共享校验增 rapporteur 正向与 Crew/Proof 反向）。

**测试**：定向 3 文件 **28/28**；`node --test "test/编排/**/*.test.ts"` → **1016 tests / 1014 pass / 1 fail / 1 skip**（唯一红＝既有 Windows symlink `shell-authorized-routine.test.ts:103` EPERM 基线）；`npm run typecheck` → **exit 0**。

**跨角色待办**：① 桌面窗口把 `requestRequirementChange` 注入扩展到统筹，并按新审批通道由统筹/报告员发 decision 卡（当前桌面在飞实现仍按旧口径投递主理任务，属桌面窗口属主）；② 运行时核心 model/schema 文案是否同步「统筹与报告员都可发起」以属主为准（本批未改）；③ judge 指引是提示词约束，不构成机械拦截（本批按任务要求不改机械权限）；④ 真实 Electron/e2e、独立验收、commit/push 未做。详见[变更记录](docs/change/2026-10-26_change_request-requirement-change-orchestration.md)。

## 2026-10-26 — `view_image` 接入角色会话（两轮附件设计，编排侧能力透传）

**来源**：客户要求「角色可查看项目内图片证据」；运行时核心已落 `view_image` 工具与冻结契约（`src/model/runtime.ts` `ViewImageInput`/`ViewImageFn`；`src/provider/runtime/tools.ts`）。两轮附件语义：工具本轮只回「已排队」，图片在**同一角色下一轮用户提示**以附件提供。本批只做编排注入面，未改 `src/model/**`、`src/provider/**`、`app/**`、i18n、门禁引擎；未 commit/push、未重启应用。

**改了什么**
- `run-role.ts`：`AdapterCapabilities` 与 `openRoleSession` 输入新增可选 `viewImage?: ViewImageFn`（类型单一来源＝契约家 `model/runtime.ts`，字段名逐字）；`openRoleSession` **无条件**（不按角色收窄）并入 capabilities——`view_image` 是**通用只读能力**，项目角色与内置治理角色在调用方提供时都可用；未提供 ⇒ 字段缺席、工具不注册（沿 `dispatch_task`「注入才注册」先例）。`createRuntimeAdapterFactory` 同名透传 `viewImage`，Service 以 `...options` 传给 `buildGovernedTools`（`undefined` ⇒ 零注册）。**不改变** `requestAcceptance`/`requestGateReview`/其他能力的注入矩阵；一次性 `runRole` 路径不涉及。
- 新增 `test/编排/view-image.test.ts` **3 例**（真实 `openRoleSession` + 假 provider，离线）：① 项目角色提供能力 ⇒ capabilities 同引用、provider 注册 `view_image`、handler 在 prompt 轮内读取临时项目 1×1 PNG 并把 `path`/`PromptImage`（base64+image/png）原样交给能力、回执如实含「已读取并排队/下一轮」；② su 同样可用；su/项目角色未提供 ⇒ 能力缺席且工具不注册；③ 与 `requestAcceptance` 互不隐含、两能力同给各自同引用、项目角色仍不注入 `requestAcceptance`（矩阵零放宽）。
- 文档：本记录、`api-spec.md`、`feature-map.md`、`memo.md`。

**测试**：`node --test "test/编排/view-image.test.ts"` → 3/3；`node --test "test/编排/**/*.test.ts"` → **1007 tests / 1005 pass / 1 fail / 1 skip**（唯一红＝既有 Windows symlink `shell-authorized-routine.test.ts:103` EPERM 基线）。`npm run typecheck` → **本批文件零错**；全仓 **12 处红全在桌面窗口属主文件**（`app/desktop/interface.ts` 1、`test/桌面应用/*` 5、`test/测试/*` 6）——根因是桌面 `app/desktop/view-image.ts` 仍用本地 `ViewImageFn`（`{path, images[]}`），与本批按契约家落地的 `ViewImageInput {path, image}` 不兼容；其文件注释已自述「契约落树后改从契约家只读导入」。本角色边界不允许改 `app/**`，未修。

**跨角色待办（请 pm 转达）**：① 桌面窗口把 `ViewImageFn` 改为从 `src/model/runtime.ts` 只读导入并改收单张 `input.image`、返回 `Promise<{ok,message?}>`（`interface.ts`/`session.ts` 同名字段同步）；完成后 typecheck 回绿。② 桌面投递端确认把图片放入下一轮 `PromptOptions.images`（原引用），排队/失败如实回执，不得改写成「本轮已看到」。③ 真实模型两轮附件、跨角色 e2e、独立验收未做。

详见[变更记录](docs/change/2026-10-26_change_view-image-orchestration-wiring.md)。

## 2026-10-26 — decision 卡（material-choice）编排分类与账本 + 判断 agent 合法 decision 分支

**来源**：客户 2026-10-26 规则（经主控任务转达；PM 设计登记 `2026-10-26_design_decision-card.md`，`rules-only`）——材料性选择由统筹发 `request_choice(cardKind="decision")`，卡内恰一个推荐项，「替我决策」开启默认推荐；decision 卡独立于提案/任命/验收，不是客户批准，不触发 gate/验收。运行时核心已交付 `GovernanceChoiceCardKind."decision"`、`GOVERNANCE_CARD_GROUP.decision="decision"`、`CustomerInputOption.recommended`；本批补编排分类/账本与判断 agent 分支（协调补遗：原 verdict 无 `case "decision"` 会回落 unknown/manual）。

**改了什么**
- `run-role.ts`：`TRIO_CARD_KINDS.convener` 增 `"decision"`（**仅统筹**；Lead 仍只有 intent-confirm，其他内置角色不发）；`classifyCustomerDecision` 增 `case "decision"`——恰好选中一个**卡上选项** ⇒ `decisionKind:"material-choice"` + `customerDecision:"accepted"` + `selectedOptions:[选中项]`（不写 `targetRoleIds`，不伪装任命/提案/验收）；多选/空选/未知选项 ⇒ `unclassified/none`；`ledgerEntrySignature` 纳入 `selectedOptions`；`judgeArtifactsForCard` 的 decision 卡不挂任何规范物证。**默认兜底安全缺口（协调抓出）**：`hasRecommendedOption` 在 choice 默认之前识别任一 `recommended:true`——缺 `cardKind` 的 decision 形状卡不再被默认成 appointment（Convener），直接 `declined + notPresented`、不触达客户/不写账本（CLI 同样 fail-closed）；无 recommended 的 appointment 默认零回归。
- `governance-ledger.ts`：`GovernanceDecisionKind` 增 `"material-choice"`（审计值：不满足任何 gate/验收门、不进入 `latestAcceptanceDecision`、不能充当 flow `customer-decision` 证据）；`GovernanceLedgerEntry.selectedOptions?: string[]` 可选新增（仅 material-choice 携带；门禁不读；向后兼容）。
- `governance-judge-verdict.ts`：approve switch 增 `case "decision"`（不再落未知卡种 manual）——choice 卡、**恰一个** `recommended:true`、`selected` 恰为该推荐项才 approve；否则 manual（`insufficient-evidence`/`not-recommended`）；审计经既有 `governanceJudgeAuditFromOutcome`。
- `governance-judge-facts.ts`：`requiredArtifactPaths` 增 decision ⇒ `{paths:[],missing:false}`（避免误判 artifact-missing）。
- `governance-judge-evidence.ts`/`governance-judge-prompt.ts`：证据包/卡面 options 透传 `recommended`（旧卡种包体逐字不变）；系统提示新增 decision rubric（只能按唯一推荐项代批、不得发明/改选，独立于意图/gate/验收）。
- **独立验收修复（F1/F2）**：F1——`recordCustomerDecision` 对 `declined + notPresented:true` 不再写账本（「无呈现 = 无决定」；避免 `unclassified/none` 成为未结算决定永久挡收尾门/最终验收）；早退位于 **`system:` 预授权分支之后**，`system:write-preauthorization` 拒绝仍记 `governance.preauthorization.declined` 诊断（复验收口）。F2——新增 `src/common/编排/decision-card.ts::validateDecisionCardRequest`（纯函数：仅 trio convener、choice、合法 flowId、≥2 选项、id 非空唯一、**恰一个** `recommended`），在 `governedInput` 触达 raw 客户通道之前执行（CLI/single/su/项目角色同样 fail-closed；失败 ⇒ `declined + notPresented`、不调 raw/不写账本/不带 operatorId），并经 `run-role.ts` Pipeline 公共出口再导出（含 `DECISION_CARD_MIN_OPTIONS`/两类型）供桌面窗口复用，不复制第二份。

**测试**：新增 `test/编排/decision-card.test.ts` 19 例（统筹可发/其余角色不可发；选中一个→material-choice 账本；缺 cardKind 带 recommended 不被默认 appointment 且不写任命账本；无 recommended 的 appointment 默认零回归；多选/空选/未知→unclassified；不影响 proposal/appointment/acceptance/gate；判断 approve/manual/unknown 分支；证据包推荐项；**F1 未呈现零账本 + 收尾门不被挡 + system 预授权拒绝仍记诊断；F2 共享校验正反例、缺 flowId、single/su/项目角色拒发**）。`node --test "test/编排/decision-card.test.ts"` 19/19；`node --test "test/编排/**/*.test.ts"` → **1004 tests / 1002 pass / 1 fail / 1 skip**（唯一红＝既有 Windows symlink EPERM 基线）；定向 judge/session/gate/证据包 169/169；定向桌面只读 `operator-wiring` 73/73。`npm run typecheck` → **exit 0**（本批期间桌面并行编辑的临时错误随其收口消失）。

**偏差/风险**：`rules-only` 设计原文第 4 条写「不写 `customer.decision`」；本批按主控任务与运行时核心/桌面同批约定以 `customer.decision{decisionKind:"material-choice"}` 作**审计留痕**（机械保证不触发任何门禁/验收、不是客户批准）——字面冲突如实登记，独立验收若按原文机械核对需客户/治理裁决。推荐项唯一性由桌面卡校验与 judge 分支保证（编排包装器不重复校验）；无 flowId 的卡不入账；未做桌面卡面/系统行/e2e/独立验收/commit。

详见[变更记录](docs/change/2026-10-26_change_decision-card-orchestration.md)。

## 2026-10-26 — 主理收到系统消息只向客户汇报、不派统筹（Lead/liaison prompt 规则）

**来源**：客户追加行为规则——主理（Lead/liaison）收到系统消息时只向客户汇报，**不要给统筹（Steward）发任务 / 不要 `dispatch_task`**。系统消息包括 `[系统·治理协调]`、gate pass/fail 系统行、交付/阻塞通知；客户明确要求或客户消息触发的协调仍按原规则。

**改了什么**
- `govern-session.ts::STANDARD_WORKFLOW_PROMPT` 新增「主理收到系统消息时只向客户汇报（2026-10-26 客户规则）」条：系统消息不是客户指令，不得据此给 Steward 发任务/`dispatch_task`（也不得派项目 worker）/改写成协调任务；只有客户明确要求或客户消息触发的协调才按原规则；系统消息不代表客户批准、不构成新任务。
- `governanceFunctionDiscipline` 的 liaison（主理）分支新增对应纪律；`buildGovernPrompt` 注释同步。
- `test/编排/governance-session.test.ts` 在标准工作流（trio 五角色 + single/su）与 liaison 分角色断言中补充该规则的正向 prompt 断言；既有断言未弱化。

**未改**：门禁角色卡（`governance-roles.ts`，由门禁引擎属主同步）、`app/desktop/**` 系统行/投递文案、`run-role.ts`（无 Lead 专用 prompt 文案）；未 commit/push。

**验证**：`npm run typecheck` exit 0；`node --test "test/编排/governance-session.test.ts"` 39/39；`node --test "test/编排/**/*.test.ts"` → 985 tests / 983 pass / 1 fail / 1 skip（唯一红＝既有 Windows symlink EPERM 基线）。

详见[变更记录](docs/change/2026-10-26_change_lead-system-message-report-only.md)。

## 2026-10-26 — gate 复核（`request_gate_review`）编排/Flow 核心：gateKind、completeGateStep、gate.review 账本

**来源**：客户 2026-10-26 追加授权 `request_gate_review` 与设计 `2026-10-26_design_proof-gate-reviews.md` §4/§8/§9/§10/§12（方案 C：`kind: artifact` + 可选 `gateKind`，不新增 `FlowStepKind`）。追加要求：gate 是独立于最终验收的通道；**防吹毛求疵**——fail 必须至少一个 blocker/major，只有 minor/nit 的 fail 按结构不符退回 Proof、不触发返工；pass 可带 minor/nit 备注。本批只做编排/Flow 侧核心；运行时核心契约/工具、门禁角色卡、桌面窗口由各自角色负责（同工作树并行）。

**改了什么**
- `flow-state.ts`：`FLOW_GATE_KINDS`/`FlowGateKind`/`FLOW_GATE_STEP_ID_PATTERN`/`isFlowGateKind`/`isFlowGateStepId`；`FlowStateStep.gateKind?` 解析与静态校验（只允许 artifact、`gate-<slug>` id、owner=verifier、evidence 存在且 kind=artifact、未知值/未知字段 fail-closed）；`listReadyFlowSteps` 新增 `awaiting-gate`（gate 永不 ready）。旧 flow 解析/序列化/ready/收尾门/证据对账逐字不变。
- `flow-service.ts`：序列化/视图条件携带 `gateKind`；`flow_step_update(done)` 对 gate 步骤拒绝（新 code `gate-review-required`）；`observeFlowArtifacts` 跳过含 `gateKind` 的步骤；`flow_step_supersede` 新 gate id 继承 `gateKind` 并派生约定报告 evidence；新增 app-only `completeGateStep`（最新 gate 报告 `acceptance-triage/v1`：pass 收口 done + app/app `artifact.observed`、幂等；fail 含 blocker/major ⇒ `gate-report-failed`；**只有 minor/nit 的 fail ⇒ `gate-report-nonblocking-fail` 退回 Proof、不返工**；缺/坏报告退回；不覆盖终态、不写 `customer.decision`）。
- `governance-gate.ts`：`gateReviewReportRelPath` / `latestGateReviewReport(RelPath)`（`docs/acceptance/<flowId>-<gateId>-report-vN.md`，版本化不覆盖、不与最终验收报告 `<flowId>-report-vN.md` 冲突）；criteria 扫描改为共用同一版本 helper（行为不变）。
- `governance-ledger.ts`：新增 `kind:"gate.review"` + `gateReview`（`gate-review-decision/v1`）审计字段与严格写入校验：只允许 app 记录、枚举/版本/sha/时间合法、不得携带 `decisionKind`/`customerDecision`/`acceptanceTriage`、fail/conditional 必须至少一个 blocker/major；`latestAcceptanceDecision`/收口门/分诊不读它。
- `run-role.ts`：`AdapterCapabilities`/`openRoleSession` 新增 `requestGateReview?: RequestGateReviewFn`（类型单一来源 `model/runtime.ts`），**只给内置治理角色中的 convener 注入**，其他内置角色/项目角色即便误给也不注入；工厂同名透传。
- `src/pipeline/orchestration/flow-state.ts`：公共出口再导出 gate 常量/类型、报告路径 helper、`completeGateStep` 与 `classifyGateReviewTriage`/`gateReportSeverityCounts`。

**测试**：新增 `test/编排/flow-gate.test.ts` 13 例、`test/编排/request-gate-review.test.ts` 2 例，`test/编排/governance-gate.test.ts` 追加 gate 依赖硬拦 1 例；`npm run typecheck` exit 0；`node --test "test/编排/**/*.test.ts"` → 985 tests / 983 pass / 1 fail / 1 skip（唯一红＝既有 Windows symlink EPERM 基线）；既有断言未弱化。

**未做**：`app/desktop/**`（gate 能力注入、`requestGateReviewForProject`、gate 记录/返工路由/重启恢复/系统行）、`src/model/runtime.ts` 与 `src/provider/runtime/**`、门禁角色卡/i18n、跨角色 e2e、真实界面 gate 复核、独立验收、commit/push。

详见[变更记录](docs/change/2026-10-26_change_request-gate-review-orchestration-core.md)。

## 2026-10-25 — 写入预授权 `system:` 结算与客户/judge 证据分离

**来源**：本轮编排任务。桌面「写入预授权」前闸：边界内写确认由系统直接放行、边界外直接拒绝，结算 `operatorId` 恒为 `system:write-preauthorization`（不是客户、不是 judge）。此前 `recordCustomerDecision` 把任何非 judge 的 answered/declined 都按客户输入记账（接受写 `customer-input`，拒绝写 `unclassified/none`），污染账本语义。

**改了什么**
- `recordCustomerDecision`（`src/pipeline/orchestration/run-role.ts`）新增 `operatorId` 以 `system:` 开头的分支：
  - **接受**（answered + `confirmed:true`）：写 `decisionEvidence.kind:"system-preauthorization"` + `operatorId`，**不写** `decisionKind`（门禁键）与 `targetRoleIds`，`customerDecision` 只记结算结果 `accepted`；`actorRoleId`/`power`/`paths`/`messageSummary` 照旧，不伪造客户手批。
  - **拒绝**（declined）：**不写** `customer.decision`（无 unclassified/none 污染、不挡收尾门），只记诊断 `governance.preauthorization.declined`。
  - 真实客户（`operation-*`/`cli`）与 `judge:<engine>` 路径逐字不变。
- `governance-ledger.ts` 最小扩展：`decisionEvidence.kind` 增 `"system-preauthorization"`；`decisionEvidence.operatorId?: string`；写入/读取校验要求该 kind 的 operatorId 为 `system:` 前缀、禁止 `decisionKind`/`judge`、`customerDecision` 必须为 `accepted`——`latestAcceptanceDecision`/`evaluateFlowCompletion` 等收口门不可能把系统预授权读成客户决定或未结算决定。

**测试**：`test/编排/governance-session.test.ts` 新增 3 例（系统接受形状与 latest 不污染、系统拒绝不写账本、客户/judge 回归），`test/编排/governance-ledger.test.ts` 新增 1 例（系统预授权 evidence 写入校验）；`node --test test/编排/*.test.ts` → 963 计 / 961 过 / 1 skip / 1 红（唯一红＝既有 Windows symlink EPERM 基线）；`npm run typecheck` exit 0。

**未做**：桌面侧接线（已由桌面角色完成/在途，本批只读消费其 `operatorId` 约定）、跨角色 e2e、独立验收、commit/push。

## 2026-10-25 — 独立复核能力透传（`request_acceptance`）+ 验收标准步骤收口助手

**来源**：本轮编排任务。运行时核心已新增 `request_acceptance` 工具与冻结类型；桌面需要编排层（A）把能力透传到运行时选项、（B）提供 `acceptance-criteria` 步骤的公共收口出口，否则应用验收门因该步骤 pending 永远判「流程未完成」。

**改了什么**
- `AdapterCapabilities` / `openRoleSession` 输入新增 `requestAcceptance?: RequestAcceptanceFn`（类型单一来源 `model/runtime.ts`）；只给内置治理角色会话并入 capabilities，未提供 ⇒ 工具结构性不注册。
- `createRuntimeAdapterFactory` 把 `capabilities.requestAcceptance` 并入运行时选项（与 `flowGet`/`flowStepUpdate` 同形）。
- 新增 app-only `completeAcceptanceCriteriaStep({projectRoot,flowId})`（`src/common/编排/flow-service.ts`，经 `src/pipeline/orchestration/flow-state.ts` 公共出口）：只处理精确 id `acceptance-criteria`；已 done 幂等（`already-done`）；标准取最新 `<flowId>-criteria-vN.md`；补 `artifact.observed`（app/app）后 pending/dispatched → done；证据/候选 YAML 校验沿用 flow-service 内部原语；不改其它步骤、不写 `customer.decision`、不注册为角色工具。
- `governance-gate.ts` 仅把既有 `latestAcceptanceCriteriaRelPath` 改为导出，供同角色私有 `flow-service.ts` 复用，不复制版本扫描。

**测试**：新增 `test/编排/request-acceptance.test.ts` 2 例；`flow-service.test.ts` 追加 7 例。`npm run typecheck` exit 0；`node --test "test/编排/**/*.test.ts"` → 908 tests / 906 pass / 1 fail / 1 skip（唯一红＝既有 Windows symlink EPERM 基线）；定向 `flow-service` 84（83 pass + 1 既有 skip）、`request-acceptance` 2/2。

**未做**：桌面 IPC/UI 接线、跨角色 e2e、独立验收、commit/push（均归相应角色/后续任务）。

详见[变更记录](docs/change/2026-10-25_change_request-acceptance-and-acceptance-criteria-step.md)。

## 2026-10-23 — 补登 `flow-state.ts` 至权威 `boundary.md` Section 1（Markdown/YAML 漂移校正）

**来源**：客户闸门 2（[记录](../../docs/communication/2026-10-23_intent_governance-advance-redispatch.md)「闸门 2 确认与实施授权」）明确选择「**授权人事补边界条目**」。团队计划 §4.5 核对：`src/pipeline/orchestration/flow-state.ts` 只在 `角色卡/编排/boundary.yaml`，未在权威 `角色卡/编排/boundary.md` Section 1。

**改了什么**
- `角色卡/编排/boundary.md` Section 1 在 `src/pipeline/orchestration/run-role.ts` / `govern-session.ts` 之后补一行：单文件 `src/pipeline/orchestration/flow-state.ts`，用途与 `boundary.yaml` 既有条目逐字一致：`流程状态 YAML 契约的 Pipeline 公共出口（桌面自动验收门消费；实现同源于 src/common/编排/flow-state.ts）`。
- `boundary.yaml` 已有该条目，核对路径/用途/类型一致，**未重复添加、未改其他条目**。

**性质**：既有条目的 Markdown/YAML 漂移校正，不是扩权——不新增角色、不扩大权限、不改其他路径；未改 `role-card.md`、其他角色、产品/测试源码。

## 2026-10-19 — 判断路径确定性前置封堵：长内联命令与无界递归搜索

**来源**：客户原话「grep/长内联命令 这个应该让判断AI 做好封堵。」真机：test-engineer 超长内联 `node -e` 报 `manual/context-too-large`；大目录/挂住的 grep 卡 17 分钟。本批只改编排（`src/common/编排/`、`test/编排/`、本角色文档），未碰 `app/**`、其他角色文件、运行时核心与 git 历史。

**改了什么**
- 新增 `src/common/编排/shell-command-guard.ts`（纯函数）：长内联命令（`node -e`/`python -c`/`bash -c` 等；命令 >2048B、代码 >10 行或单行 >1024B）→ `inline-too-large`；无界递归搜索（`grep -r` 无受限路径、`.`/项目根/`/`/`~`、`find /`、`rg` 全项目、包装器后同类形态）→ `unbounded-search`。具体文件/小目录、`find … -maxdepth`、管道喂入的 rg 放行。
- 接线两处、均在模型/客户通道之前：`shell-gate.ts` 的 `decide()` 在 **(c) 分类之前**封堵（classify/pm/operator 零调用；审计 branch/by=`preblock:*`）；`shell-judge.ts` 入口在建判断会话之前封堵（模型零调用、不排队、不计防循环；写 `shell-judge.preblock` 诊断）。拒绝理由逐字给出「落盘脚本」出路。
- `shell-judge-prompt.ts` 新增【长内联与无界搜索——必须 deny】小节（含「有界搜索不拦」）。

**测试**：新增 `test/编排/shell-command-guard.test.ts` 16 例；既有 risk-scope/read-discipline/读取预算/manual/并发/审计断言未改动未放宽。

**验证**：`node --test "test/编排/**/*.test.ts"` → 635 计 / 635 过 / 0 红 / 0 skipped；`npm run typecheck` → exit 0。全量 3190 计 / 3185 过 / 3 红，均为其他角色在改的渲染/推理强度用例（与本批无关）。

详见[变更记录](docs/change/2026-10-19_change_block-inline-and-unbounded-search.md)。

## 2026-10-19 — 会话重建写权注记加系统标记（系统通知，不是角色发言）

**来源**：客户反馈截图中的「会话已因边界更新重建；此前经确认发行的写权不会自动保留……」。客户原话「这个应该加一个标记啊，不然谁知道啊。」本批只改编排边界（`src/pipeline/orchestration/run-role.ts`、`test/编排/`、本角色文档），**未碰** `app/**`、门禁/写权逻辑、其他角色文件与 git 历史。

**改了什么**
- `REBUILT_SESSION_WRITE_PERMITS_NOTICE` 正文前加系统标记，改为：`【系统通知·会话重建】此前经确认发行的写权不会自动保留，如需写入请重新经 request_confirmation 确认。`——明确这是**系统注入的 notice，不是角色/客户发言**；原语义（重建 / 写权不会自动保留 / 可行恢复路径 `request_confirmation`）逐项保留，仍**不夹带任何授权语义**。常量文档注释同步说明标记来源与客户反馈。
- 注入路径**未变**：notice 仍经 `queueModelNotice` 排入下一次 `send()` 的输入前缀（`run-role.ts:1271-1272`，`${notice}\n\n${text}`），送达一次即消费、不单独开轮、不触任何判定；写权/门禁语义不变。

**测试**：`test/编排/session-handle.test.ts` F-5-opt1 例新增断言「notice 以 `【系统通知·会话重建】` 开头」；既有 `/写权不会自动保留/`、`/request_confirmation/` 与注入前缀/消费/保留断言继续满足，未放宽。跨角色只读核对 `test/桌面应用/boundary-refresh.test.ts`（按常量引用 + `includes("重建"/"不会自动保留"/"request_confirmation")`）不受影响，未改该文件。

**验证**：`node --test "test/编排/**/*.test.ts"` → **619 计 / 619 过 / 0 红 / 0 skipped**；`npm run typecheck` → **exit 0**。

**已知呈现差异（如实登记）**：桌面渲染层系统消息归类只认 `[系统·<子类>] ` 形态；本 notice 是客户消息的前缀、不是独立系统投递，改用该形态会把同一条回显里的客户正文整条归成系统 chip，故采用**正文内可见标记**（人/模型可见，不改 UI 归类）。若客户要求 UI 系统样式，需桌面角色扩展归类契约（跨角色，本批不越界）。详见[变更记录](docs/change/2026-10-19_change_rebuilt-session-notice-marker.md)。

## 2026-10-19 — 决策判断收敛为「意图漂移」判断（不再做架构/质量/证据充分性审查）

**来源**：客户新反馈原话「决策审批也改一下，就是判断意图是否偏离了客户的出发点就行了。」这是对「替我决策」（proposal / appointment / acceptance）判断 agent 的定位修正：只判断决策是否偏离客户已确认的意图；工程质量、架构章节、测试覆盖、证据充分性、实现细节由 Draft/Proof 的工作流与验收负责。

**改了什么**

- **新增** `src/common/编排/governance-judge-intent.ts`：意图基准的确定性解析——从账本 `intent.handed-off`（同 flow）、提案 frontmatter `intentId`、`docs/intents/<flowId>.md` 三级定位意图文件；复用 `parseIntentFrontmatter` 解析 goal/scope/acceptance/非目标/客户原话；账本最后一条 `intent-confirm` 必须 `accepted`（先确认后 revise ⇒ 不放行）；缺失/歧义/未确认分别返回 `intent-missing`/`intent-ambiguous`/`intent-unconfirmed`。
- **改** `governance-judge-evidence.ts`：证据包版本升 2，decision 组新增 `intent` 段（唯一意图基准）；提案摘要只取目标/范围/验收/非目标/约束/契约章节，**删除架构片段提取**；定点抽查集改为「意图 + 提案/提名」（≤2 条，验收不再要求读流程单）；意图 fail-closed 时不调用模型；approve 前哈希基线包含意图文件。
- **改** `governance-judge-prompt.ts`：新增【decision 组只判意图漂移】与【不判断：由 Draft/Proof 负责】；删除旧「架构门槛」；逐卡 rubric 改为范围/约束/已接受决定核对；请求提示渲染「客户已确认的意图摘要」；写盘族 rubric 与只读纪律逐字保留。
- **改** `governance-judge-verdict.ts`：安全 reasonCode 增加 `intent-drift/intent-missing/intent-ambiguous/intent-unconfirmed`；机械门槛零放宽（accept-quick 不代批、任命恰等推荐集、验收完成度、required-read、逐路径复核均保留）。
- **改** `governance-judge.ts`：诊断增加 `intentId/intentConfirmed`；驱动顺序不变。

**测试**：新增 `test/编排/decision-intent-drift.test.ts`（5 例：缺架构仍 allow、提案超范围/非目标/已接受决定冲突、任命扩张、验收冲突、rubric 排除项）；`test/编排/decision-evidence-packet.test.ts` 更新夹具并新增意图缺失/未确认/歧义 4 场景；`test/编排/governance-judge.test.ts` 全部 decision 夹具补意图与 intent-confirm 账本，旧架构正反例替换为意图正例。`node --test "test/编排/**/*.test.ts"` → **619 计 / 619 过 / 0 红 / 0 skipped**（上一基线 612，+7）；`npm run typecheck` → **exit 0**。

**边界与残余**：只写 `src/common/编排/**`、`test/编排/**` 与本角色文档；未改 `src/model/runtime.ts`/桌面/运行时核心/其他角色，未 git 提交。旧项目无意图文件时 decision 卡一律 `intent-missing` 回落手动（客户新定位的直接结果）；意图偏离仍是模型语义判断，builder 只做缺失/歧义/未确认的确定性兜底。跨角色测试夹具（`test/测试/governance-judge-cards-verify`、`governance-e2e-auto`）需测试属主补意图文件 + intent-confirm/handoff 账本。详见 [变更记录](docs/change/2026-10-19_change_decision-judge-intent-drift.md)。

## 2026-10-19 — shell 判断提示加入读取纪律（定点抽查 / 不重复读 / 预算耗尽如实 manual）

**来源**：真机 Proof 复核连续跑 shell 时，判断 agent 报「读取预算已用尽」回落手动。运行时核心正在把预算做成可配置（`ANS_SHELL_JUDGE_MAX_*`），编排侧提示词需引导判断 agent 节省读取。本批只改提示。

**改了什么**

- `src/common/编排/shell-judge-prompt.ts`：`judge_read_file` 工具描述注明 `offset/limit`（字节）或 `startLine/endLine`（行）范围参数（二选一）。系统提示新增【读取纪律——先判命令，再定点取证】：先 `judge_list_dir` 了解结构、只读与命令必要性直接相关的文件、不做全项目扫描；大文件用范围参数**定点抽查**、不整文件反复读；**不读 `data/**`、`*.log` 日志、构建产物、会话/审计目录**（除非命令本身直接操作且必须核对）；**同一文件不重复读取**；本地服务 curl/测试脚本优先看命令、cwd、argv 与角色任务上下文，不通读源码；**读取预算耗尽如实交回 manual、不猜测、不得据此 allow**。
- 既有 rubric、deny 档规则、不可信数据警告、输出契约、读取损伤降级与工具面逐字未动。

**测试**：新增 `test/编排/shell-judge-read-discipline.test.ts` 6 例（提示词关键字与稳定性、既有工具面/契约仍在）；既有断言零放宽。`node --test "test/编排/**/*.test.ts"` → **599 计 / 599 过 / 0 红 / 0 skipped**（上一基线 593，+6 即本批新增）；`npm run typecheck` → **exit 0**（仅 npm 镜像配置既有 warning）。

**边界与残余**：只写 `src/common/编排/shell-judge-prompt.ts`、`test/编排/` 与本角色文档；未碰运行时核心/适配器/桌面/其他角色。提示只引导不强制，真正兜底仍是运行时核心读取预算与「读取损伤 → allow 降 manual」；提示不写预算具体数值，避免与可配置默认值漂移。详见 [变更记录](docs/change/2026-10-19_change_shell-judge-read-discipline.md)。

## 2026-10-19 — 流程步骤状态：Markdown 强调符归一化 + superseded/cancelled 作废语义（真机 R2）

**来源**：真机 R2 流程单 `/Users/wangzhongren/code/vibeingcode/ans-testbed/library-lending-live/docs/flows/library-lending-v2.md`（2026-10-19 快照）：状态列写成 `**done**（证据…）`，另有一个 `**superseded**：并入 integration-e2e-v2` 的不派步骤。判断侧与桌面窗口角色 `app/desktop/governance-advance.ts#normalizeFlowStepStatus` 同源缺陷。本批只改编排边界。

**改了什么**

- `src/common/编排/governance-judge-facts.ts#normalizeFlowStepStatus`：先剥首部 `*`/`_`/反引号/空白，取引导 token 后再剥 token 尾部强调符。`**done**（…）`/`__done__`/`` `done` ``/`**Done**：xxx` 均归一化为 `done`；`**superseded**：…` ⇒ `superseded`；空/纯强调符 ⇒ `""`。`parseFlowSteps` 输出的原始 `status` 不变（错误详情仍展示原文）。
- `evaluateAcceptanceCompletion`：新增 `VOID_FLOW_STEP_STATUSES = {superseded, cancelled}`；作废步骤不参与未完成判定与 `dispatch.accepted` 对账，其他未知状态（`completed`/`已完成` 等）仍 fail-closed。其余门槛（步骤表可解析、账本可读、无未结算决定/未闭环澄清）逐字不变。
- 测试 `test/编排/governance-judge.test.ts` +4（既有断言零放宽）：强调式 done 变体与归一化；`**dispatched**` 仍失败；`superseded`/`cancelled` 无 dispatch 不挡验收且不掩盖 `pending`；真实 R2 流程单只读拷贝（四列 `stepId|步骤|执行方|状态`）解析后 7 个 `**done**` 行不再判未完成、失败详情只点名 `verification`/`acceptance`，补齐后 `{ ok: true }`。

**验证**：定向 `governance-judge.test.ts` **56/56**；`node --test "test/编排/**/*.test.ts"` → **593 计 / 593 过 / 0 红 / 0 skipped**（上一基线 589，+4 即本次新增）；`npm run typecheck` → **exit 0**（仅 npm 镜像配置既有 warning）。工作树含其他角色未提交改动，本批零新增红。

**跨角色（未越界）**：桌面窗口角色 `app/desktop/governance-advance.ts#normalizeFlowStepStatus` 与 `flowCompletionIssue` 需属主同批对齐（剥强调符 + `superseded`/`cancelled` 作废），否则「桌面仍挡、编排放行」口径漂移；两侧注释互指、规则成对契约。详见 [变更记录](docs/change/2026-10-19_change_flow-status-markdown-superseded.md)。

## 2026-10-19 — 决策证据包：请求方陈述 + 系统结构化证据包 + 定点抽查（客户新反馈）

**来源**：客户原话「决策agent 应该是别人给摘要，他再去判断吧，不是说要所有文件给他。」真机：判断 agent 被要求自己读取提案/提名/流程/6 个角色文件等全部物证；大文件撞 64KiB 单文件/192KiB 总量/8 次读取预算，6 文件写卡 preview 6.9KB 覆盖不了实际 11.5KB 内容，频繁 `read-truncated` / `insufficient-evidence` 回落手动。本批只改编排边界。

**改了什么**

- **新增** `src/common/编排/governance-judge-evidence.ts`：`buildDecisionEvidencePacket`（**确定性函数**）从实际盘面生成有界 `DecisionEvidencePacket`——决策/来源、请求方陈述（untrusted）、写盘卡逐路径待写正文（显式 `paths` + preview 标题/围栏锚点；新文件完整正文、改文件旧 sha256 + 行级变更摘要）、物证路径 + sha256 + 关键片段（架构/验收标准/候选角色/流程步骤/角色卡写区/契约章节）、机械事实（路径探测/目标文件哈希/账本记录/角色枚举）、冲突与完整性；`verifyEvidenceHashes` 在 approve 前复核判断期间漂移；证据采集不跟随符号链接、不读敏感路径（realpath 包含性 + O_NOFOLLOW + 敏感类别排除）。
- **改** `confirmed-writes.ts`：抽出 `declaredPathBodies`（与呈现前完整性闸共用同一份锚点/正文判定；闸本身行为逐字不变）。
- **改** `governance-judge.ts`：删除全量物证 required-read（`requiredReadPathsFor`/`verifyConfirmPreview`）；调用模型前先构建证据包，缺失/不可读/探测失败/冲突/正文不完整 ⇒ 直接 manual **不调用模型**；required-read 收窄为 0–2 条定点抽查；approve 前哈希复核（`evidence-hash-mismatch`）。
- **改** `governance-judge-prompt.ts`：系统提示改为「基于证据包判断 + judge_read_file 仅定点抽查」；请求提示渲染 packet，卡片明确标注请求方陈述。
- **改** `governance-judge-verdict.ts`：第 5 步改用 driver 传入的最小抽查集（未传时旧口径兼容）；导出 `isHardForbiddenPath` 与证据包共用硬禁写前缀。
- `run-role.ts`/`govern-session.ts`/桌面/运行时核心**无需改动**：`judgeContext` 形状不变，证据包由 driver 从 request + 盘面生成。

**验证**：`node --test "test/编排/**/*.test.ts"` → **589 计 / 589 过 / 0 红 / 0 skipped**（新增 `decision-evidence-packet.test.ts` 14 例；既有 judge 夹具按新契约补真实物证/逐路径正文/账本事实，断言未放宽）；`npm run typecheck` → **exit 0**。

**跨角色请求**（未越界）：`test/测试/governance-judge-cards-verify` 5 例夹具需属主更新（提名推荐集与 request 不一致、写盘 preview 无逐路径正文、acceptance 缺账本事实）；`test/测试/governance-e2e-auto` 同类旧式夹具预计需同批补正文/账本。详见 [变更记录](docs/change/2026-10-19_change_decision-evidence-packet.md)。

## 2026-10-19 — 标准工作流与 Proof 自动派发提示（独立核准是标准流程）

**来源**：客户 2026-10-19 反馈（原话「这个独立核准应该是标准流程，而不是我在发给他。」「内置角色应该有自己的工作流。」）。本批只改编排边界。

**改了什么**

- `src/pipeline/orchestration/govern-session.ts`：新增 `STANDARD_WORKFLOW_PROMPT`——阶段流转由应用负责、内置角色按标准工作流执行、客户不做内部调度；Proof 标准复核流程为「读证据 → 审批档 shell 跑测试 → 真实启动演示 → 质量/架构核对 → 验收卡」；流程齐备后应用自动派发 Proof / 验收、不需要客户手动触发，且自动派发不是验收决定。single/su 与 trio 两类治理提示均追加；`verification` 角色纪律同步加「独立核准是标准流程」。与门禁引擎角色卡「标准工作流」章节成对同步（注释互指；分层禁止导入私有 common，本层复制并注明单一来源）。
- `src/common/编排/governance-ledger.ts`：核查确认现有 `dispatch.accepted` 已含 `targetRoleId`/`stepId`/`trigger`，可直接记录 `targetRoleId:"verifier", stepId:"verification"` 用于自动派发去重——**不新增 kind/字段**；仅补字段注释（去重键 flowId+stepId；`settle` 也用于自动派发）。未改桌面触发逻辑。
- 测试：`governance-session.test.ts` +1（trio 五角色与 single/su 均含标准工作流/自动派发/Proof 复核顺序关键字）；`governance-ledger.test.ts` +1（自动派发条目记录/读回、旧条目缺 trigger 兼容、去重谓词）；既有断言零放宽。

**验证**：基线 `test/编排` 585/585 → 改动后 **587 计 / 587 过 / 0 红 / 0 skipped**；定向两文件 32/32；`npm run typecheck` **exit 0**（仅 npm 镜像配置告警）。工作树含其他角色未提交改动，本批零新增红。

**跨角色**：门禁引擎需在五张内置角色卡同批加入「标准工作流」章节并与本块逐字对齐（注释互指）；桌面自动派发若补账本记录/去重，字段已就绪（`dispatch.accepted{targetRoleId:"verifier", stepId:"verification", trigger:"settle"}`）；桌面 su 聊天不经本提示，依赖角色卡覆盖。详见 [变更记录](docs/change/2026-10-19_change_standard-workflows-prompt.md)。

## 2026-10-19 — 提案架构门槛与治理提示架构要求（Draft/Steward/Proof）

**来源**：客户 2026-10-19 新批评（原话「这个感觉也没有啥架构的啊，提案角色应该也要考虑到扩展性，给出一个架构方案啊。」）。真机 R1/R3 提案均无模块分解、依赖方向、扩展点、数据/契约版本与迁移策略。门禁引擎把「架构与可扩展性」加入工程质量基线；编排侧让提案判断 agent 与治理会话提示强制要求架构章节。本批只改编排边界。

**改了什么**

- `src/common/编排/governance-judge-prompt.ts`：proposal rubric 新增「架构门槛」——新项目须含「架构方案」、变更须含「架构影响分析」，覆盖模块分解/职责、依赖方向（无环）、数据流、扩展点、schema 与 API/契约版本/迁移/兼容/弃用、横切关注点、权衡；缺失/空洞/自相矛盾 ⇒ 不得 approve，manual 且 reasonCode 用 `insufficient-evidence`；必须实际读取 proposalPath 全文，不得仅凭 preview。通用门槛加第 6 条。
- `src/common/编排/governance-judge-verdict.ts`：proposal 分支加注释说明**有意不做**标题/关键词机械匹配（preview 有界会误伤），确定性底线是 required-read（proposalPath 必读）；判定逻辑零改动。
- `src/pipeline/orchestration/govern-session.ts`：`ENGINEERING_QUALITY_BASELINE` 与门禁引擎逐字同步新增「架构与可扩展性」条；新增 `ARCHITECTURE_EXTENSIBILITY_REQUIREMENTS`（与质量基线并列）明确 Draft/Steward/Proof 阶段职责；single/su 与 trio 均追加；Draft/Steward/Proof 角色纪律各加一段。
- 测试：`governance-judge.test.ts` +2（rubric 内容、架构缺失 manual/insufficient-evidence 保真）；`governance-session.test.ts` 扩既有断言（架构与扩展性关键字、三阶段职责）；既有断言零放宽。

**验证**：基线 `test/编排` 571/571、typecheck 0 → 改动后 `test/编排` **573 计 / 573 过 / 0 红 / 0 skipped**；定向两文件 76/76；`npm run typecheck` **exit 0**。工作树含其他角色未提交改动，本角色零新增红。

**跨角色**：门禁引擎基线「架构与可扩展性」条与五张角色卡架构职责须与本批常量同批同步（注释互指）；桌面 su 聊天不经本提示，依赖角色卡覆盖；测试角色可后续加跨文件逐字比对。详见 [变更记录](docs/change/2026-10-19_change_architecture-gate.md)。

## 2026-10-19 — 治理会话提示词注入工程质量基线（single/su 与 trio 两套）

**来源**：客户 2026-10-19 批准（原话「可以，按你说的改」）：在治理会话提示词中加入工程质量基线，并要求验收前真实启动应用演示；门禁引擎把同一基线写进五张内置治理角色卡，编排侧把基线注入治理会话提示（single/su 与 trio），使模型在意图、提案、流程、验收各阶段都受约束。本批只改编排边界。

**改了什么**

- `src/pipeline/orchestration/govern-session.ts`：新增 `ENGINEERING_QUALITY_BASELINE`（与门禁引擎角色卡常量逐字一致；编排不得跨层导入其私有 common，故在本层复制并在注释互指，改文案须两处同步）与 `ENGINEERING_QUALITY_STAGE_REQUIREMENTS`（single/su 阶段要求）。`buildGovernPrompt` 的 single/su 三个返回分支与 trio 返回均追加基线；trio 在角色纪律后、shell 审批档前追加。各角色纪律新增阶段约束：Lead 意图阶段确认质量档位（默认生产级，客户明确选原型档才可放宽并写入 `acceptance`）；Draft 提案含质量基线与证据计划；Steward 流程/派发含质量与演示要求（未真实运行不得写「已完成/可验收」）；Proof 未真实启动演示不得建议 accept（仅有测试输出或代码阅读不算演示）。**未改任何工具注册、写入门禁、派发/验收判定**。
- `test/编排/governance-session.test.ts`：钉提示词断言补充阶段关键字；循环内新增「每个 trio 提示含基线标题 + `未真实运行不得建议验收通过`」与 single/su 同样的两条断言（另加阶段要求断言）；既有断言零放宽。
- 核查 `src/pipeline/orchestration/run-role.ts`：治理会话提示**不在**此处组装（默认提示唯一组装点是 `buildGovernPrompt`），本批未改。

**验证**：基线 `node --test "test/编排/**/*.test.ts"` → 571/571；改动后同命令 → **571 计 / 571 过 / 0 红 / 0 skipped**；定向 `governance-session.test.ts` 24/24；`npm run typecheck` → **exit 0**。工作树含其他角色未提交改动，本角色零新增红。

**跨角色请求**（未越界）：① 桌面 `buildAcceptanceTaskMessage` 的「真实启动与演示」要求核查为**已由桌面属主落下**（四条硬要求），请保持与基线口径一致；② 门禁引擎五张角色卡写入同一基线时须与本文件常量逐字同步；③ 桌面 su 聊天不经本提示（走 `openRoleSession`），其基线覆盖依赖门禁引擎角色卡。详见 [变更记录](docs/change/2026-10-19_change_engineering-quality-baseline-prompt.md)。

## 2026-10-19 — 判断 agent 验收机械门槛：流程步骤 id/状态解析与桌面侧对齐（真机 R2）

**来源**：桌面窗口角色已修 `app/desktop/governance-advance.ts`（状态引导 token 规范化 + 显式 `stepId` 列优先），编排侧 `src/common/编排/governance-judge-facts.ts` 的 `parseFlowSteps` / `evaluateAcceptanceCompletion` 仍是旧口径（取「步骤」描述列当 id + `status.toLowerCase() !== "done"` 精确比较），对 canonical `| stepId | 步骤 | 状态 |` 且状态写 `done（…）` 的流程单（真机 R2：`ans-testbed/ticket-desk-live/docs/flows/ticket-desk-r2.md`）会恒定误判。本批只改编排边界。

**改了什么**

- `src/common/编排/governance-judge-facts.ts`：新增导出纯函数 `normalizeFlowStepStatus`（取引导 token，大小写不敏感；后接空白/`（`/`(`/`：`/`:`/结束；空 ⇒ `""`；原始 `status` 不动）；`parseFlowSteps` 在表头含显式 id 列（`stepId`/`step-id`/`步骤id`/`id`）时优先取该列，否则沿用「步骤/step」列（旧两列表行为不变）；`evaluateAcceptanceCompletion` 的未完成判定统一走 `normalizeFlowStepStatus`。规则与桌面侧逐字一致；分层不允许跨角色复用，两侧各自实现并在注释互相指向。验收门槛语义（全部 done、每步有 dispatch、无未结算决定/澄清、账本可读）未放宽。
- `test/编排/governance-judge.test.ts`：新增 4 例——状态引导词正反例；真实 R2 步骤表解析出 `nomination`/`role-readiness`/…/`acceptance` 十个 stepId（非描述文本）；旧两列表回退 + `步骤id`/`id`/`step-id` 列优先；验收判定在全部 `done（…）` + 全量 dispatchedStepIds 下 `{ ok: true }`，改一个执行步骤为 `pending（…）` 后 `insufficient-evidence`。既有断言零放宽。

**验证**：定向 `test/编排/governance-judge.test.ts` → **50/50 pass**；`node --test "test/编排/**/*.test.ts"` → **571 计 / 571 过 / 0 红 / 0 skipped**（上一批 567，+4 即本批新增）；`npm run typecheck` → **exit 0**。工作树含其他角色未提交改动，本角色零新增红。

**残余风险**（详见变更记录）：① 桌面/编排两份纯函数为成对契约，需同批同步；② 判断 agent 门槛仍要求**每个**步骤有 `dispatch.accepted`，真实 R2 账本中 `role-readiness`/`contract-freeze-v2`/`verification`/`acceptance` 无派发记录，复算仍会 manual（既有语义，本批未改）；③ 状态只认 `done` 引导词，`completed`/`已完成` 等仍 fail-closed。详见 [变更记录](docs/change/2026-10-19_change_judge-flow-step-parsing.md)。

## 2026-10-19 — 编排侧同步：五个内置治理角色统一 shell 审批档

**来源**：客户新规则「所有的角色，都应该有有运行shell 的权限，包括读写，以及任何的需要命令的权限，只不过都要提交审批，按照原有的流程审批。」门禁引擎已把五角色 `capabilities.shell` 统一改为 `"operator-approve"`（su 保持）；本批按其实施记录「跨角色依赖」第 2 条同步编排侧注释、治理会话提示词与测试。**判定代码零改动**（`cap.shell !== "operator-approve"` 拒绝、审批档/只读档互斥、装配失败不 arm 全部保留）。

**改了什么**

- `src/pipeline/orchestration/run-role.ts`（仅注释）：`shellGate`/`shellOperatorChannel`/`shellReadonly`/`shellOperatorOnly` 选项说明与 I-1 arm 块注释改为能力位驱动的五角色统一审批档口径；`shellOperatorOnly` 守卫说明由过时的「仅 `suppressHandback`」改为真实判据 `cap?.shell !== "operator-approve"`；旧 `none`/`readonly` 标注为历史兼容、新注册项不得再用。
- `src/pipeline/orchestration/shell-arming.ts`（仅注释）：去掉「su 不自审」「本档只服务 single/su」的旧描述，改为「审批档不自审、按能力位装配、trio 审计边界经 `auditBoundaryOf` 映射」。
- `src/pipeline/orchestration/govern-session.ts`：新增 `SHELL_APPROVAL_PROMPT_LINE`（所有内置治理角色统一审批档；只读白名单直接执行，其余含读写/任意命令逐条提交客户/判断 agent 审批；拒绝/超时/不可用不放行；**审批不等于写边界扩张，写文件仍优先 `write_file` 并经写盘确认**），single/su 与 trio 两类提示均追加；Convener 纪律删「shell 面仅只读档」，改为「内置治理角色一律拒绝；shell 审批档不改变派发对象限制」。
- `test/编排/governance-session.test.ts`：能力矩阵夹具 `shellReadonly` → `shellOperatorOnly`；rapporteur/nominator 旧「不应注入 shellGate」翻转为「应 arm 审批档」；新增专项用例——五角色（liaison/rapporteur/nominator/convener/verifier）与 su 均为 `operator-approve` ⇒ 均 arm；项目角色（能力位缺席）误传 ⇒ 仍不 arm。
- `test/编排/liaison-session.test.ts`：同一夹具与断言翻转（Liaison/Rapporteur/Nominator 应 arm 审批档）；其余能力断言逐条保留未放宽。

**验证**：基线 `test/编排` 566 计 / 564 过 / 2 红（两红均为本批预期旧断言）；改动后 `node --test "test/编排/**/*.test.ts"` → **567 计 / 567 过 / 0 红 / 0 skipped**（+1 新增用例）；定向两文件 36/36；`npm run typecheck` → **exit 0**。工作树含其他角色未提交改动，本角色零新增红。

**跨角色请求**（未越界）：① 桌面 `session.ts`/`interface.ts` 须把 `shellOperatorOnly` 从 su-only 扩到全部 `role.builtIn`，并退役 convener 只读档（其源码扫描测试同批更新）；此前真机只有 su 有审批档，convener 仍被只读档限制（更严非放宽），其余四角色仍无 `run_shell`。② 测试角色两处旧断言按新规则翻转。③ README/历史设计文档口径更新。④ 审计/卡片固定文案仍带「su-审批档」字样，改名需编排＋桌面同批（桌面按前缀解析）。详见 [变更记录](docs/change/2026-10-19_change_all-roles-shell-approval-sync.md)。

## 2026-10-19 — shell 判断：单飞 → 会话内有界并发池（真机：同轮 4 条 shell 并行）

**来源**：客户真机——前端角色同一轮并行发出 4 条 shell（`/`、`app.js`、`styles.css`、`wc`）；编排判断器单飞 `busy`，后 3 条中 2 条立即回落手动（诊断 `shell-confirm.presented requestId=sc-8 pendingCount=3`）。客户意见原文：「每条等待5s 我觉得不够吧，或者开启几个线程变形处理呢。一个角色一个呢。」本批只改编排边界。

**改了什么**

- `src/common/编排/shell-judge.ts`：删除 `let busy`，改为**每个 `createShellJudge` 闭包内**的有界并发池——默认上限 3（`ANS_SHELL_JUDGE_CONCURRENCY`，夹 1..8）；达到上限进入有界 FIFO 等待队列（默认 32，队满 `manual/queue-full`）；排队总时限 `ANS_SHELL_JUDGE_QUEUE_TIMEOUT_MS`（默认 60s，超时 `manual/queue-timeout`，reason 含「排队超时」与在跑条数）；排队中外部中止 `manual/aborted`。槽位释放直接移交队首；每请求独立计时/独立结果，某条失败不影响其他条。判断语义、规则层、`denyCounts`、失败转手动策略不变。新增诊断 `shell-judge.queued` / `shell-judge.queue.timeout` / `shell-judge.queue.full` / `shell-judge.queue.granted`（字段在落盘白名单内）。
- `test/编排/shell-judge.test.ts`：删除旧 busy 用例（其断言已被并发语义取代）。新增 `test/编排/shell-judge-concurrency.test.ts` 11 例（4 并发上限 3 全 allow、超限 FIFO、排队超时、排队中止、队满、失败隔离、独立计时、闭包隔离、并发 denyCounts、env/解析矩阵）。

**验证**：`node --test "test/编排/**/*.test.ts"` → **566/566 pass**；定向两文件 **45/45**；`npm run typecheck` → **0 错误**。

**跨角色请求**（未越界）：① 桌面 shell judge 通道超时 135s 需覆盖「排队 60s + 判断 120s」的新最坏墙钟（建议按 `ANS_SHELL_JUDGE_QUEUE_TIMEOUT_MS` 派生）；② 桌面 `judgeManualHumanReason` 可为 `queue-timeout`/`queue-full` 加显式短文案（当前走 default 会原样展示编排 reason）。详见 [变更记录](docs/change/2026-10-19_change_shell-judge-concurrency.md)。

## 2026-10-19 — 写盘确认卡「呈现前 preview 完整性闸」（真机 op-2）

**来源**：真机 op-2——一张写盘确认卡在 `paths` 声明两条新建路径（`docs/proposals/ticket-desk-collab-v1.md`、`docs/governance/rapporteur/ticket-desk-collab.md`），preview 只有提案正文；判断 agent 依 rubric 回落 manual。客户确认「可以按照你说的修改」：在出卡前拒绝不完整证据，让角色补全后重发。本批只改编排边界：`src/common/编排/{confirmed-writes.ts,governance-judge-facts.ts}`、`src/pipeline/orchestration/run-role.ts`、`test/编排/**` 与本角色文档。

**改了什么**

- `confirmed-writes.ts` 新增 `declaredConfirmPaths`（显式 `paths` 优先，未给回退 preview 一行一路径声明）与 `validateConfirmPreviewCompleteness`（确定性判定：路径须以标题/围栏说明/声明行作锚点，且其后有至少一行非空正文；围栏内路径行不算锚点）。choice 卡与无路径确认直接通过。
- `run-role.ts` 的 `governedInput` 在**调用原始客户通道之前**执行校验：不通过 ⇒ 诊断 `confirmation.preview.incomplete`、返回 `declined`（不呈现卡片、不调判断 agent、不发行写入路径、不写 `customer.decision`），错误文案列出缺正文的路径并要求补全后重试。
- `governance-judge-facts.ts` 仅纯重构：抽出 `declaredWritePathOfLine`（`declaredWritePathsFromPreview` 行为逐字不变），完整性闸与判断 agent 共用同一路径口径；判断规则本身未改。
- 测试：新增 `test/编排/confirm-preview-completeness.test.ts`（含真机 op-2 卡原文 fixture `test/编排/fixtures/op2-write-confirm-card.json`）；既有写盘卡夹具按新格式补逐路径正文，断言未放宽。

**验证**：`node --test "test/编排/**/*.test.ts"` → 556/556 pass；`npm run typecheck` → 0 错误。

**跨角色请求**（未越界）：运行时核心同步 `request_confirmation` 指引（写盘卡必须带显式 `paths` + 逐路径正文，或结构化 `writes:[{path,content}]`）；`test/测试/**`、`test/装配/**` 中 11 个文件 / 16 个旧夹具需属主补正文（实测失败原因均为「确认卡未呈现」，另有 3 个与本改动无关的既有 UI/源码钉失败）。详见 `docs/change/2026-10-19_change_write-confirm-preview-completeness.md`。

## 2026-10-18 — P2 编排：治理卡判断 agent（「替我审批」/「替我决策」）

**来源**：PM 评审 `角色卡/项目管理/docs/design/2026-10-18_design_judge-governance-cards-review.md`（status approved）§五–§七、§十、§十二；P1 运行时核心契约已冻结。本批只改编排边界：`src/common/编排/{governance-judge.ts,governance-judge-prompt.ts,governance-judge-verdict.ts,governance-judge-facts.ts,governance-ledger.ts}`（前四新增）、`src/pipeline/orchestration/{run-role.ts,govern-session.ts}`、`src/provider/runtime/tools.ts`（仅 judge 回执）、`test/编排/governance-judge.test.ts`（新增）、本角色文档；**未碰**门禁引擎、运行时核心、适配器、桌面、UI。

**改了什么**

- 新增 `src/common/编排/governance-judge.ts`：`createGovernanceJudge`（三引擎矩阵 claude/pi/codex；demo/未配置 → `manual/unsupported-engine`）。
  - 复用 shell judge 生命周期骨架（V1 **不抽** `judge-session.ts`、不改 `shell-judge.ts`）：合成角色 `governance-judge`（空边界、系统提示来自 `governance-judge-prompt.ts`）、`persistSession:false`、deny-all 写门禁、`governanceJudge` 只读能力注入、15s `AbortSignal.any`、中止/迟到 bindRole 的 dispose。
  - 每会话闭包 `busy`（第二张直接 `manual/unavailable`，不排队/不并发）；**无防循环计数**（每卡只判断一次，manual 后角色阻塞等客户）。
  - 必读物证在提示前计算并写入提示；物证缺失 → `artifact-missing`、必读超预算 → `budget`（不调用模型）。
  - **acceptance 机械门槛（P6 验收观察，安全项）**：提示前读流程单 + 账本，所有步骤必须 `done`、每个步骤都有 `dispatch.accepted`、无未结算决定（`unclassified`/`none`）、无未闭环澄清、账本可读；任一不满足 → `manual/insufficient-evidence|artifact-missing|ledger-unavailable`（原卡 + 说明），不靠模型自报。
  - 失败/超时/解析失败/中止/读取损伤一律 `manual`；本函数不抛错。多次工具调用最后一次合法生效（`governance-judge.multiple`）。
- 新增 `governance-judge-prompt.ts`：稳定系统提示（只读判断代理、只做正向代批、不可信数据警告、`.ans/**` 等硬排除、六卡种 rubric、输出契约）＋本次请求提示（卡片/候选路径/机械探测/写根/禁写/物证/推荐集/有界事实/必读路径/≤4KB `turnText`）。
- 新增 `governance-judge-verdict.ts`（**唯一规范化点**）：严格规范化 `report_governance_judgement`；`approve` 要求 reason + 至少一条 evidence；proposal/acceptance 恰 `["accept"]`（**accept-quick 不代批**）；appointment `selected` 恰等于应用推荐集、无重复、非内置、多选一致性；confirm 卡 `confirmed:true` + `pathProbes` 全 allowed + 写根/禁写/来源匹配 + 模型 `pathDecisions` 精确覆盖且全 ok；required-read ⊆ 实际读取；group/cardKind 交叉校验；读取损伤/账本错误 fail-closed。模型自报 `reasonCode` 只经安全名单映射（否则 `model-manual`）。
- 新增 `governance-judge-facts.ts`：从已刷新账本快照提炼有界事实（`proposalDecision`/`appointmentTargetRoleIds`/`dispatchedStepIds`/`unresolvedClarificationCount`/`latestDecisionKinds`；字符串 ≤128B、数组 ≤50、整体 ≤8KB）；`requiredArtifactPaths` 逐卡种规范物证；`parseRecommendedRoleIds`（frontmatter `recommended: [..]` 或固定行 `推荐：..`；缺失/歧义/重复 → undefined）。
- `src/pipeline/orchestration/run-role.ts`：
  - `AdapterCapabilities` 增 `governanceJudge?`，`createRuntimeAdapterFactory` 逐名透传（仅供 `createGovernanceJudge` 的 judge 会话；普通角色会话不注入）。
  - `governedInput` 在 `raw` 前计算 **`judgeContext`**（唯一计算点）：仅 `isTrio` + 允许的 cardKind + 合法 flowId；先 `refreshLedger()`；paths/pathProbes 复用 `extractPathCandidates` + `resolveWrite`（与 issuer 同一份）、写根/禁写、物证、推荐集、账本事实；并入传给客户通道的 metadata；`recordCustomerDecision` 仍用 `originalMetadata` 的 toolCallId/turnId。计算失败 → `unavailableReason` + `ledgerErrors:1`（禁止 approve）。
  - `recordCustomerDecision`：`answered && judge` → `decisionEvidence.kind:"judge"` + 有界 `judge` 子对象；`actorRoleId`/`power` 不变；group 与 `governanceCardGroup(cardKind)` 不符记 `governance-judge.group.mismatch`、不翻转决定；账本失败记 `governance-judge.audit.failed`。
  - 能力矩阵与 single/su/项目角色行为不变（judgeContext 不计算、`governanceJudge` 不注入）。
- `src/common/编排/governance-ledger.ts`：`decisionEvidence.kind` 增 `"judge"`、增可选 `judge?: GovernanceJudgeAudit`（向后兼容；门禁只读 `decisionKind/customerDecision`，已核对不读 `decisionEvidence`）。
- `src/provider/runtime/tools.ts`：`request_confirmation`/`request_choice` 在 `out.judge` 时回执改「客户委托的判断 agent（替我审批/替我决策）已代批（代审批/代决策；operator:judge:<engine>）…这不是客户本人点击」；客户手批文案逐字不变。
- `src/pipeline/orchestration/govern-session.ts`：按 §7.6 薄再导出 `createGovernanceJudge`/`GOVERNANCE_JUDGE_SUPPORTED_RUNTIMES`/`CreateGovernanceJudgeOptions`。

**测试**：新增 `test/编排/governance-judge.test.ts` **32 例**（六卡种正反例、required-read/物证缺失、逐路径复核、accept-quick 拒绝、任命推荐集、读取损伤、支持矩阵/超时/中止/busy、事实与推荐集解析、trio judgeContext 注入与 single/su/项目角色不注入、账本 judge 字段与 group 交叉校验、两工具回执、审计有界、**acceptance 流程完成度机械门槛正反例**、**write 新文件 preview/旧版物证正反例**）。证据：该文件 **32/32**；相关既有套件 **74/74**；P6 验收套件 **42/42**；`npm run typecheck` **0 错**；全量三层 glob `node --test "test/**/*.test.ts"` **2900 计 / 2881 过 / 16 红 / 3 skipped**——16 红逐条归因均为**他域/环境既有**：9 条 Windows symlink EPERM、5 条桌面 renderer 既有红（`test/桌面应用/`，文件未动）、vendor markdown-it pin 1 条、`test/runtime-core/tools.test.ts` 的 abort shell 1 条（单跑通过，全量负载下时序 flake）。本批零新增红。

**P6 观察补丁（同日落）**：① 验收卡新增流程完成度机械门槛（见上）；② **write 新文件修复**（真机：Rapporteur 首次写提案、目标尚不存在时被误报「规范物证缺失」）——`write` 卡 artifacts/required-read 只收**已存在**的相关物证，新建目标文件不进入 required-read；新建目标改由 `preview` 正文核对，**preview 为空 ⇒ `manual/insufficient-evidence`**（内容是否足够由 rubric 判断）；`appointment-write`/`schedule-write` 的 nomination/flow 要求不变；③ 双开关后 shell 出路句统一为 `如需执行，请关闭「替我审批」后重试。`（`shell-judge-verdict.ts` 常量/校验、`shell-judge-prompt.ts` 提示、`test/编排/shell-judge.test.ts` 断言），不再写「替我审」；④ **治理 judge 超时**（真机：多步读取频繁超时）——默认 `120_000ms`，环境变量 `ANS_GOVERNANCE_JUDGE_TIMEOUT_MS`（正整数，非法回默认）覆盖；计时只从模型判断开始（不含排队/等卡），文案带时长（如「判断超时（>120s）」）；shell judge 保持 15s；⑤ **物证命名容忍**（真机：`local-ledger-cli.proposal-v1.md` 被误报 artifact-missing）——`<flowId>-vN.md` 与 `<flowId>.proposal-vN.md` / `<flowId>.nomination-vN.md` 均解析，取最大版本；⑥ **pathProbes 只取声明写入路径**（真机：预览散文提到 18 条路径，16 条 allowed:false 导致回落）——`computeJudgeContext` **优先用 `request_confirmation` 的显式 `req.paths`**（非空时；空数组视为未给），未给时回退 preview 的「一行一个路径」声明（关键词后可直接跟路径/冒号前允许修饰词/列表符/`路径：`/反引号均容忍），**不扫描散文**；`createConfirmedWriteIssuer` 同样优先显式 `paths` 发行写集；越界声明路径仍生成 `allowed:false` probe 并整卡回落；⑦ **boundary.yaml 写前内容校验**（真机：Nominator 写出顶层含 version/roleId/root 的非法 YAML，应用照单写入后新角色无法枚举）——`write_file`/`edit_file` 在目标匹配 `角色卡/<id>/boundary.yaml` 时用门禁引擎 Service 公共出口 `validateBoundaryYamlText` 校验最终内容；非法 ⇒ 拒绝写入、零文件副作用，回执「boundary.yaml 格式非法：<原因>；顶层只允许 role / entries / archived，请按模板重写」；`role-card.md` 与其他路径不校验内容；⑧ **schedule-write 首次新建流程单**（真机：`docs/flows/<flow>.md` 尚不存在 → artifact-missing，首张卡永远无法代批）——目标 flow 文件不存在时不要求旧物证，改由 preview 正文核对（空 preview ⇒ manual）；文件已存在仍要求读取旧版；`appointment-write` 的 nomination 要求不变；⑨ **shell judge 默认超时 15s → 120s**（客户要求与治理判断一致）——`ANS_SHELL_JUDGE_TIMEOUT_MS`（正整数，非法回默认）可覆盖；文案带时长（如「判断超时（>120s）」）；shell 执行时限不变。**跨角色待办**：桌面 (a) 通道 `DEFAULT_SHELL_JUDGE_CHANNEL_TIMEOUT_MS` 仍 15s（`app/desktop/operator-channel.ts`，桌面角色边界），须同步 ≥120s，否则桌面仍在 15s 处先回落；⑩ **advisory 规则集**（客户 2026-10-18 新裁定：「(c) 规则不拒绝任何请求，只快速放行；所有拒绝由 AI 做出」）——`CreateShellGateOptions/ShellGateBuildDeps.assembleProjectShellGate` 新增 `advisoryRuleset`（项目角色默认 `true`）：`(c)=allow` 直接放行（`c-allow`，0 卡）；`risky/review/deny` **跳过 (b)** 直接交 (a)（`c-risky→a-*`/`c-review→a-*`/`c-deny→a-*`），规则判定与命中原因写入 `OperatorPrompt.reason`；构造守卫：与 `readonlyOnly`/`operatorOnly` 互斥、必须有 `operatorChannel`；`advisoryRuleset=false` 保留旧 `c-deny` 硬拒用于回归。测试：`governance-judge.test.ts` **41/41**；`shell-judge.test.ts` **29/29**；`shell-advisory-ruleset.test.ts` **7/7**；`boundary-write-validation.test.ts` **4/4**；e2e 1a **2/2**；`test/编排` **527 计/526 过**（唯一红＝既有 Windows symlink EPERM）；typecheck 0。全量仍受并行他域改动影响未能取得完成快照（此前完成快照 2900 计/2881 过/16 红均他域/环境）。

**契约偏离/边界（如实登记）**：① `governance-judge.*` 诊断的桌面侧事件（`switch.off`/`row.failed`）归 P4；`read.denied` 无逐调用回调，driver 以 `manual/read-denied` 汇总，未单独发事件。② shell 审计的 `group:"approval"` 与桌面 operator-channel 归 P4（§7.1 明示 V1 不改 `shell-judge.ts`）。③ 回执在 §7.5 金文本基础上增「代审批/代决策」分组标记，以满足 §10.2「代批行必须含代审批或代决策」。④ required-read 的「confirm 卡已存在目标文件」由 driver 用 `stat` 机械判定（应用事实不含存在位；不新增契约字段）。未 git 提交；未读 `.env`、未跑真实模型/凭据/网络。

## 2026-10-18 — W6-A 补丁：trio 的 shell 审计边界改用应用专用边界

**来源**：门禁引擎已把 `docs/audit/` 加入应用专用边界（`appGovernanceEntries`）；协调口径指出编排的 `shell-arming.ts` 审计 `pmBoundary` 仍取「首个内置角色边界」，四角色下该边界（Liaison 仅 `docs/intents/`）不含 `docs/audit/`，真机审计仍会被拒。

**改**：`src/pipeline/orchestration/shell-arming.ts` 新增 `auditBoundaryOf(project, govBoundary, roleId?)`：
- **trio**（`project.governanceModel === "trio"`，或模型缺省且首个内置角色为 trio 角色）⇒ 审计边界改用 `appGovernanceBoundary(govBoundary.acceptance)`（门禁引擎 Service 公共出口，勿复制实现；含 `docs/audit/`，应用写审计）。三层链、只读档、审批档及各自的 F-6-1 刷新闭包统一经此映射。
- **single/su** ⇒ 原样返回既有治理角色边界（`docs/audit/` 条件目录 + `shell-gate` 条件），逐字不变。
- `buildShellAuditGate` 仍固定声明 `shell-gate` 条件（额外条件对非条件条目无影响，语义保留）；应用专用边界**不注入任何角色会话**，角色仍不可写 `docs/audit/`；任何命令判定不变。

**测试**：`test/编排/shell-readonly.test.ts` +1 例——trio 只读档审计真落 `docs/audit/shell-gate.jsonl`（branch/execution/conditions 正确），且 `resolveRole("liaison")` 的边界仍拒写 `docs/audit/`；既有 single/su 审计真落盘用例不回归。证据：`test/编排/**/*.test.ts` **473 计/472 过/1 红**（唯一红＝既有 Windows symlink EPERM）；全量三层 glob **2774 计 / 2755 过 / 16 红 / 3 skipped**（16 红均他域既有/在途：9 条 Windows symlink EPERM、5 条桌面 UI 在飞源码扫描、vendor markdown-it pin、g4 读取器防御），本角色零新增红；`npm run typecheck` **0 错**（全仓）。**边界**：未 git 提交；未碰门禁引擎/运行时核心/适配器/桌面/UI。

## 2026-10-18 — W6-A：治理四角色编排接线（意图交接 / 澄清 / 账本）

**来源**：PM 评审 `角色卡/项目管理/docs/design/2026-10-18_design_governance-liaison-review.md`（status approved）§5.1–§5.4、§7、§十二 W6-A；门禁引擎与运行时核心 W6-0 已前置（注册表四角色、`handOffIntent`/`requestClarification` 能力位与两工具）。本批只改编排边界：`src/common/编排/governance-handoff.ts`（新增）、`governance-ledger.ts`、`src/pipeline/orchestration/{run-role.ts,govern-session.ts}`、`src/common/编排/args.ts`、`src/interface/cli/govern.ts`、`test/编排/`、本角色文档；**未碰**门禁引擎、运行时核心、适配器、桌面、UI。

**改了什么**

- 新增 `src/common/编排/governance-handoff.ts`（纯逻辑，不写盘/不投递）：
  - `validateIntentHandoff(input, context?)`：模型/角色防御性校验（trio + liaison）→ `intentId` slug（防穿越）→ 四要素非空、`summary` 1..200 字（超长拒绝不截断）→ 意图文件 `docs/intents/<id>.md` 存在可读、frontmatter 以 `---` 开头并闭合、顶层 `key: value`、文件 `intentId` 与入参一致、`goal/scope/acceptance` **入参与文件逐项相等**（文件是权威）、文件 `handoffKind`/`flowId` 若给出须一致 → 账本可读（坏行/不可读 fail-closed）→ 去重（`intentId+handoffKind+sha256(原始字节)`）→ `initial` 每个 `intentId` 仅一次 → `clarification`/`revision` 必须已有同 `intentId` 成功交接 → 每轮一次（同 `sessionId`+`turnId`；缺 `turnId` 降级为去重 + initial 一次性并返回 `warnings`）。
  - `intentHandoffDedupeKey()`、`intentArtifactPath()`、`countClarificationRounds()`（同一 `flowId`，无则同一 `intentId`；账本坏 → fail-closed）、`CLARIFICATION_MAX_ROUNDS = 2`。
- `src/common/编排/governance-ledger.ts`：`GovernancePower` 增 `"liaison"`（Liaison 沟通权；四角色评审 §7.1/AC 口径）；`kind` 增 `"intent.handed-off"` / `"clarification.requested"`；条目增 `intentId?` / `handoffKind?` / `trigger?("customer-decision"|"intent-handoff"|"settle")` / `turnId?`。旧条目缺省字段仍合法；门禁不读 `power`/`trigger`。
- `src/pipeline/orchestration/run-role.ts`：
  - `AdapterCapabilities` 与 `openRoleSession` 输入增 `handOffIntent` / `requestClarification`（形状单一来源 `model/runtime.ts`），并逐名透传到 `createRuntimeAdapter` 的 `GovernedToolsOptions` 同名位（未注入 ⇒ 工具不注册）。
  - 能力矩阵收窄：`confirmationMode = input.customerInput !== undefined && (cap === undefined || cap.customerInput)`——Liaison 的 `customerInput=false`，即便调用方误给通道也不注册 `request_confirmation`/`request_choice`，走静态边界 + `docs/intents/` 预授权；其余角色/项目角色逐字不变。`TRIO_CARD_KINDS.liaison = []`（结构性兜底）。
  - `handOffIntent` 包装器（仅 `isTrio && cap.handOffIntent`，**会话内串行化**）：每轮内存守卫 → `validateIntentHandoff` → 调用注入的**投递能力** → **成功后**写 `intent.handed-off{actorRoleId:"liaison", power:"liaison", targetRoleId:"rapporteur", intentId, handoffKind, flowId?, artifactPath, artifactSha256, messageSummary, turnId?, sessionId?, runtime?}`；投递失败/异常 → `{ok:false}`「…；未重试」、零成功账本；账本失败只诊断、不翻转投递结果。
  - `requestClarification` 包装器（仅 `isTrio && cap.requestClarification`，**会话内串行化**）：读账本判两轮上限 → 达到 2 轮拒绝并提示「在提案卡上请客户决定（带假设/备选）」→ 调用注入的**送达能力**（答案可随回执 `message` 返回）→ 成功后写 `clarification.requested{actorRoleId:"rapporteur", power:"proposal", flowId?, intentId?, messageSummary, turnId?, sessionId?, runtime?}`；失败零账本。
  - `artifact.observed` 对 Liaison 写 `power:"liaison"`（`GovernanceFunction` 直接可赋值给 `GovernancePower`，不再裸 cast）；`recordCustomerDecision` 的 `function` 类型扩为 `GovernanceFunction`。
- `src/pipeline/orchestration/govern-session.ts`：W6-A 薄再导出（校验/去重/轮次/常量/类型）；职能纪律提示词改为**注册表数据驱动**（`spec.displayName`，不写死 su/rapporteur/convener），新增 Liaison「沟通权纪律」（`docs/intents/`、`hand_off_intent`、**交接 ≠ 客户批准**）；`runGovernSession` 的确认制说明行按 `capabilities.customerInput` 判定（Liaison 不再误报确认制）；治理职能文案表 `GOVERNANCE_FUNCTION_LABEL`（沟通权/提案权/提名权/编排权）。
- `src/common/编排/args.ts` / `src/interface/cli/govern.ts`：**CLI 收窄（四角色评审 §4.6/AC21）**——`--function liaison` 在参数解析处显式拒绝（「联络官（liaison）仅桌面主入口提供；CLI 请用 --function proposal|nomination|schedule」），`--role liaison` 在命令层显式拒绝；`proposal|nomination|schedule` 行为与 USAGE 逐字保持，**缺省仍是 `proposal`→rapporteur**。`openGovernanceSession` 的 `governanceFunction` 类型仍含 `liaison`（桌面/测试前端按评审 §4.5 可路由）。

**测试**：新增 `test/编排/liaison-handoff.test.ts` **9 例**（合法 initial、slug/四要素/summary、文件权威三向不一致、frontmatter 缺失/未闭合/坏行、去重/initial 一次性/clarification 引用、clarification 无既有交接、每轮一次+缺 turnId 降级、账本坏 fail-closed、模型/角色防御、澄清轮次计数）与 `test/编排/liaison-session.test.ts` **12 例**（四人+su 能力矩阵；交接成功→回调+账本字段；投递失败/校验失败零账本；每轮一次+去重+**同轮并发串行化**；Liaison `artifact.observed`=liaison；澄清两轮上限+账本/失败零账本；CLI 拒绝 liaison（`--function`/`--role`）而引擎可路由、缺省 proposal、single 拒绝；提示词数据驱动；项目角色旧行为不回归）。更新 `test/编排/governance-session.test.ts` 的三权 `--function`、提示词与禁写归属文案断言。**证据**：`test/编排/**/*.test.ts` **473 计/472 过/1 红**（含本补丁 +1 例）——唯一红为既有 Windows symlink EPERM（`shell-authorized-routine.test.ts:103`）；全量三层 glob `node --test "test/**/*.test.ts"` **2774 计 / 2755 过 / 16 红 / 3 skipped**：16 红均为他域既有/在途——9 条 Windows symlink EPERM、5 条桌面 UI 在飞源码扫描、vendor markdown-it pin、`test/测试/g4-skill-verify` 读取器防御；**本角色文件零新增红**。`npm run typecheck` **0 错**（全仓）。

**与评审的差异（如实登记）**：`GovernancePower`/CLI 收窄已按评审 §7.1/§4.6/AC21 落为 `"liaison"` 与 CLI 拒绝，不再是差异。唯一保留的实现取舍：评审 §5.4 的澄清是「账本 + 主入口系统行、客户在 Liaison 回答后由 Liaison 再交接」，本批任务书写「经 customerInput 发问并返回答案」——冻结回执仅有 `{ok,message?}`，实现为送达回调把答案随 `message` 回传（能回则回，不假装）；送达端是否经客户通道发问由桌面 W6-B 决定。其余（Liaison 写权/能力、四角色枚举、交接去重/每轮一次、`intent.handed-off`、两轮上限、single/su 不变）逐项按评审。

**未做/边界**：未 git 提交；未碰门禁引擎/运行时核心/适配器/桌面/UI/其他角色文件；未读 `.env`、未跑真实模型/凭据/网络。**跨角色待 pm 转达**：① 桌面窗口 W6-B 经 `openRoleSession` 注入 `handOffIntent`（后台开/发 Rapporteur、系统行、写 `dispatch.accepted{actorRoleId:"app", power:"app", trigger:"intent-handoff", targetRoleId:"rapporteur", intentId, flowId?}`、不打开/不切换）与 `requestClarification`（主入口系统行；若经客户通道发问把答案随回执 `message` 返回）；② 桌面UI W6-C 文案/镜像按评审 §6/§9；③ 测试角色 W6-D：`governance-trio-verify/a-listing-sessions-writes` 的禁写文案断言改为 AC3 归属口径、`governance-liaison-verify/b-intent-handoff` 去掉 `"communication"` 比对（统一 `"liaison"`）并让 AC5 夹具模拟桌面投递端写 `dispatch.accepted`（或待 W6-B 真路径）。

## 2026-10-17 — V1b：治理模型 `su → trio` 显式迁移（`previewGovernanceMigration` / `migrateGovernanceModel`）＋首次收尾带模型

**来源**：PM 评审 `角色卡/项目管理/docs/design/2026-10-17_design_governance-trio-review.md` §3.2（V1b）、§5.5、§5.7、§九-12、§十一 W2/V1b。W0/W1/W2 已前置。本批只改编排边界：`src/common/编排/{governance-migration.ts,governance-record-lock.ts,finalize.ts}`、`src/pipeline/orchestration/{govern-session.ts,run-role.ts}`、`test/编排/`、本角色四文档；**未碰**门禁引擎、运行时核心、桌面、UI、其他角色测试。

**改了什么**

- 新增 `src/common/编排/governance-migration.ts`：
  - `previewGovernanceMigration({projectRoot})` **零写入**：返回 `{model:"single", targetModel:"trio", writePaths:[".ans/project.json","docs/bootstrap-manifest.md"], modelField, manifestLine:"治理模型升级（su → trio）", pinChanges:[], retainedFiles, snapshotDigest}`。`modelField` 为 `.ans` 原始字段快照（`null`=缺失，旧 single 形状）；`retainedFiles` 列出角色卡/边界/治理文档/旧 `docs/su/**`（只列确实存在者）；`snapshotDigest` 覆盖 `.ans` 原始字节 + manifest 内容/缺失。守卫：invalid-request → busy → no-record → already-trio → invalid-record → blocked（manifest 不可读 / 应用边界门禁前置拒）。
  - `migrateGovernanceModel({projectRoot, confirm:true, previewDigest})`：守卫 invalid-request（projectRoot/confirm/digest 64 hex）→ busy（**首次 await 前**占位）→ no-record → already-trio → blocked（坏 `.ans`/manifest 不可读/门禁前置拒）→ preview-stale → 写入 → write-failed。只改 `.ans` 的 `governanceModel:"trio"`：内存 `{...doc, governanceModel}` **保留全部既有/未知字段**（roles/source/pin/自定义字段）；`.ans` 先、manifest 后原子写；manifest 追加升级节（ISO 时间、旧/新模型、变更文件、`.ans` 新旧 SHA-256、客户确认）；账本 best-effort 写 `governance.migrated`（`action:"migrate"` + `previewDigest`）。**不重写角色卡/边界/pin、不删历史、不建 `角色卡/su/`**。成功 `{ok:true, phase:"write", status:"completed", model:"trio", message}`。
  - 门禁用 Service 公共出口 `appGovernanceBoundary`（不注入任何角色会话）；`.ans` 内容中的路径经 `safeProjectRel` 防逃逸后才 stat（仅预览展示）。
- 新增 `src/common/编排/governance-record-lock.ts`：把原 `finalize.ts` 的模块级 `Set` 提为 establish / reaccept / migrate **共用**的进程内同项目互斥（`tryAcquire` 同步占位、`finally` 释放、`isBusy` 只读检查）；跨进程无全局锁如实登记。
- 改 `src/common/编排/finalize.ts`：
  - `FinalizeInput.governanceModel?: GovernanceModel`：`finalizeBootstrap` **仅当给出**才在 `.ans` 写该字段（不传保持旧形状）。
  - `repinIfBootstrapped`：创世态由调用方传当前模型；**非创世态**调用方未传时从当刻 `.ans` 读取并保留既有模型（避免重 pin 把 trio 降级为 single）；`.ans` 缺失/字段非法/不可读 → 不写（旧形状不变）。
  - `GovernancePreview.governanceModel`：预览显示「将写入的治理模型」（缺省 `single`）；`establishGovernanceRecord` 把 `governanceModel` 交给 `finalizeBootstrap`（仅 trio 写 `governance.established` 的既有逻辑不变）。
  - establish/reaccept 的互斥改为调用共享锁模块；行为与文案逐字不变。
- `src/pipeline/orchestration/govern-session.ts`：追加 V1b 薄再导出（两函数、四常量、七型）；`openGovernanceSession`/`runGovernSession` 行为逐字未改。
- `src/pipeline/orchestration/run-role.ts`（V1b 接线缺口修复）：自动收尾调用点 `repinIfBootstrapped` 现在按当前模型传参——trio 传 `governanceModel:"trio"`、single 不传（旧 `.ans` 形状不变）；并把收尾边界改为 `appGovernanceBoundary(会话边界的 acceptance)`（评审 §5.3）——三人 Section 1 不含 `.ans/**`/`docs/bootstrap-manifest.md`，沿用角色边界会让创世收尾 fail-closed、`.ans` 永不落盘。single/su 仍用会话边界，行为逐字不变。

**测试**：新增 `test/编排/governance-migration.test.ts` **13 例**（预览零写入与形状、`.ans` 只增/改模型且未知字段保留、manifest 留痕/新旧哈希、账本 action+digest、pin/角色卡/旧 docs/su 不变、不建 `角色卡/su/`、already-trio/no-record/invalid-record→blocked/manifest 目录→blocked/preview-stale/busy/write-failed/invalid-request、旧 single 无字段）；扩展 `finalize.test.ts` **+3**（finalize 仅在给出时写模型；repin 创世传/不传、非创世保留 trio；**trio 创世首次 settle 收尾写出 `governanceModel:"trio"`**，single 首次收尾不写字段且顶层形状逐字不变）与 `governance-record.test.ts` **+1**（trio 预览/建立写字段）及既有断言（缺省 single 预览、不传不写字段）；`governance-record-ledger.test.ts` 补 `.ans` 模型断言并更新迁移归属注释。证据：目标 4 文件 **41/41**；`node --test "test/编排/**/*.test.ts"` → **451 计 / 450 过 / 1 红**——唯一红为既有 `shell-authorized-routine.test.ts:103` 的 Windows symlink **EPERM**（与本批零交集）；全量三层 glob `node --test "test/**/*.test.ts"` → **2618 计 / 2557 过 / 58 红 / 3 skipped**：58 红均为**他域既有/在途**（运行时核心 symlink·abort·BOM、桌面 UI/窗口迁移入口仍在 V1 占位、装配、测试角色源码钉）与同一条 Windows symlink EPERM，`test/编排/` 新增 17 例全绿、零新增红（他域待各属主接线/更新，如实登记不代为修复）；`npm run typecheck` → 本批文件零错（他域既有 4 条 + 桌面迁移占位仍回 `not-available` 2 条，待其接线）。

**未做/边界**：未 git 提交；未碰 `app/**`、`src/common/门禁引擎/**`、`src/service/**`、`src/model/**`、其他角色文件、客户项目；未读 `.env`、未跑凭据/网络命令、未调用真实模型。**跨角色待 pm 转达**：桌面窗口须把 `previewGovernanceMigration`/`migrateGovernanceModel` 接到既有 IPC 占位（`project:governance-migrate-preview`/`project:governance-migrate`），成功后清 listing 缓存 → `refreshStaleBoundaries()` → `emitProjectChanged`，不自动开会话（其占位 handler 仍回 `not-available`，待其接线）；桌面UI 按预览字段展示写路径/字段快照/manifest 行/保留文件，确认时原样回传 `snapshotDigest`。`run-role.ts` 的创世收尾缺口已在本批修复（trio 传模型 + 应用边界），无需再转达。

## 2026-10-17 — 治理记录 pin 不符「重新接受」：`previewGovernanceReacceptance` / `reacceptGovernancePins`（B1）＋ Pipeline 薄再导出（B2）

**来源**：PM 评审/任务书 `角色卡/项目管理/docs/design/2026-10-17_design_governance-pin-recovery-review.md`（status: approved）§5.2、§5.5、§六、§七。恢复只做两件事：整表重算现有 pin 写回 `.ans`，并向 manifest 追加一条「重新接受记录」；不改边界文件内容、不增删 pin、不改 roles/source、不自动开会话。

**改了什么（全部在本角色 Section 1 内）**：
- `src/common/编排/finalize.ts`：新增 `GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE`、八型（`GovernanceReacceptInput` / `GovernanceReacceptWriteInput` / `GovernanceReacceptStatus` / `GovernanceReacceptBlocker` / `GovernanceReacceptPreview` / `GovernanceReacceptPreviewFailure` / `GovernanceReacceptPreviewResult` / `ReacceptGovernancePinsResult`）、`previewGovernanceReacceptance`、`reacceptGovernancePins` 与内部共用 `evaluateGovernanceReaccept`。
  - 守卫严格按 §5.2 表 1–11：projectRoot → **与 `establishGovernanceRecord` 共用** `governanceEstablishInFlight`（`path.resolve(projectRoot)` key，不另建集合，写入在首次 await 前占位、`finally` 释放）→ `.ans` 存在（`no-record`）→ 原始记录/acceptance/pin 形状与路径安全（`invalid-record`）→ `inspectPinnedBoundaries({requiredPath})`（`ok`→`not-needed`、`invalid`→`invalid-record`、`mismatch` 继续）→ G5 `missing-file` 优先、否则 `unreadable-file`（precheck，零写入）→ G4 digest 非 64 hex=`invalid-request`/guard、不等=`preview-stale`/precheck → G6 每个 pin 目标用 `resolveBoundary` + 探测 `ProjectConfig`（同路径、accepted:true、无 pin），`parseError` 或 `entries.length===0`→`unparseable-boundary`/precheck（列全部文件）→ G3 `buildGovernanceSeedBoundary(GOVERNANCE_REACCEPT_ACCEPTANCE_SOURCE)` 对两写路径逐条 `resolveWrite`（任一拒=`blocked`/precheck）→ G8 `.ans` 先、manifest 后均经 `gatedAtomicWrite`（异常=`write-failed`/`write`，message「可能已写入部分文件…请核对现场」，绝无「已恢复/已成功」）。
  - 预览：可解析、accepted、pin 形状合法且非空、治理边界被覆盖且至少一项不一致 → `ok:true`；缺失/不可读/坏内容放进 `changed`+`blockers`、`canConfirm:false`；`ok:false` 仅 `invalid-request`/`busy`/`no-record`/`invalid-record`/`not-needed`/`blocked`（manifest 不可读或 G3 前置拒绝且无 blockers）。
  - `.ans`：保留全部既有字段（含未知字段/roles/source/accepted），**只替换** `governanceBoundary.acceptance.pin`；条目数/路径/顺序完全不变；`JSON.stringify(doc,null,2)+"\n"`。证据只返回非一致项的 `actual`；一致项判定为 `ok` 即与当刻字节相等，故沿用旧 pin 值。
  - manifest：既有全文逐字节保留；定位 `## 重新接受记录（治理记录 pin 刷新）`，存在则节末（下一 `## ` 前）追加、否则文末新增；不存在则新建最小头部；条目含 ISO 时间、变更文件数、pin 总数、逐文件旧/新完整 64 位哈希。存在但不可读 → `blocked`/precheck、零写入。
  - **不复用** `finalizeBootstrap`（其 `scanRoles` 会重建 pin 集与 roles）；复用其 `gatedAtomicWrite`、`finalizeRelPaths`、`isFile` 与一次性种子边界工厂。门禁证据只经 `src/service/boundary/resolve-boundary.ts` 公共出口；未直接导入 `src/common/门禁引擎/`。
- `src/pipeline/orchestration/govern-session.ts`：追加 §5.2 的薄再导出（两函数、常量、八型）；`openGovernanceSession`/`runGovernSession` 既有行为逐字未改。
- `test/编排/governance-reaccept.test.ts`（新增 20 例）：预览形状与 blockers、正常写入、`.ans` 只改 pin（roles/source/未知字段/路径/顺序不变）、manifest 追加/保留/新建最小头部、G1–G8 每个守卫（G3 为正向过门；固定三目录下 G3 的拒绝无法由公共 API 构造）、写入失败注入（`docs` 为文件 → `write-failed`/`write` 且 `.ans` 已落盘）、并发 busy、`preview-stale`、坏 YAML / `entries: []`、缺失/不可读、invalid-request、Pipeline 再导出同一函数引用。

**证据**：`node --test "test/编排/governance-reaccept.test.ts"` → **20/20**；`node --test "test/编排/**/*.test.ts"` → **369 计 / 368 过 / 1 红**——唯一红仍是 `shell-authorized-routine.test.ts:103` 的 Windows symlink **EPERM**（既有环境红，与本批零交集）；`node --test "test/**/*.test.ts"`（三层 glob）→ **2282 计 / 2184 过 / 95 红 / 3 skipped**，95 红全部在 `test/codex-adapter/`、`test/claude-adapter/`、`test/装配/`、`test/runtime-core/`、`test/测试/`、`test/桌面应用/` 与上述既有 symlink EPERM（缺 SDK/其他角色在途/既有环境），**本批新增 20 例全绿、无新增红**；`npm run typecheck` → 本批文件**零错**（全仓既有环境错仍在 claude-adapter/provider 与 `test/测试`）。

**未做/边界**：未 git 提交；未碰 `app/**`、`src/model/boundary.ts`、`src/common/门禁引擎/**`、其他角色文件、客户项目；未读 `.env`、未跑凭据/网络命令、未调用真实模型。**跨角色待 pm 转达**：桌面窗口按 §5.3 接两个 IPC/`listProject` 与 `previewDigest` 原样回传；桌面UI按 §5.4 呈现文案（`phase!=="write"` 可补「本次未写入任何文件」，`phase==="write"` 只逐字显示 message）。

## 2026-10-17 — 看护信号 `turn-deadline` 改为「轮次到点检查」（整轮不设超时；1 小时为最后兜底）

**来源**：PM 评审/任务书 `角色卡/项目管理/docs/design/2026-10-17_design_turn-watch-and-recover-review.md`（status: approved；客户裁定「整轮不应该有超时，应该是到了时间，su 要去看下是否卡死了……如果没卡死，就不管他」＋保留 1 小时兜底）§3.2、§4、§5.1。本轮只改编排的看护信号标签/建议；检测阈值、适配器时限、桌面/门禁卡文本归各属主。

**改了什么（全部在本角色 Section 1 内）**：
- `src/common/编排/watchdog.ts`：
  - `SIGNAL_LABELS["turn-deadline"]`：`轮次逼近超时` → **`轮次到点检查`**。
  - `SIGNAL_SUGGESTIONS["turn-deadline"]` → **`到点检查不中止本轮；请用 role_status 核对是否卡死；仍在推进则不动作；只有卡死才 propose_recovery（客户确认后应用执行）；1 小时为最后兜底。`**
  - 信号 kind 仍为 `turn-deadline`（契约不变）；`renderWatchdogRecovery` 随 label 自动变化，不改渲染结构；其余三信号文案逐字未动；不放宽任何判定。
- `test/编排/watchdog.test.ts`：四信号用例的 turn-deadline label 改为「轮次到点检查」；新增一条金文本断言（到点检查/不中止本轮/role_status 核对/没卡死不动作/只有卡死才提议/客户确认后应用执行/1 小时兜底/无「逼近超时·已超时·硬超时·剩余量」；恢复行随 label 变化）。

**证据**：`node --test "test/编排/watchdog.test.ts"` → **13/13**；`node --test "test/编排/**/*.test.ts"` → **349 计 / 348 过 / 1 红**——唯一红仍是 `shell-authorized-routine.test.ts:103` 的 Windows 符号链接 EPERM（既有环境红，与本批无关）；`npm run typecheck` 本批文件零错。

**未做/边界**：未 git 提交；未碰 `app/**`、适配器/运行时核心/门禁卡文本、其他角色文件、客户项目；未读 `.env`。跨角色待 pm 转达：桌面窗口的阈值/事实行/每轮一次/解除语义按评审 §3.2 实施；门禁引擎 su 卡「看护职责」按 §3.4 同步。

## 2026-10-17 — su 的 `run_shell` 改为「只读免审批、其余含 deny 逐条客户批准」（`operatorOnly` + `approveDeny`，编排侧）

**来源**：PM 评审/任务书 `角色卡/项目管理/docs/design/2026-10-17_design_su-shell-approval-review.md`（status: approved；客户裁定「这个su 的命令也改一下，不是只读，是只读的免审批，其他的要客户审批」＋「deny 也走客户审批」）§3.1–§3.4、§4、§5.1。本轮只做编排侧；桌面/门禁卡文本/运行时核心未碰。

**改了什么（全部在本角色 Section 1 内）**：
- `src/common/编排/shell-gate.ts`：
  - `CreateShellGateOptions` / `ShellGateBuildDeps` 新增 `operatorOnly?: boolean`、`approveDeny?: boolean`（缺省 false）。
  - **构造期守卫**（抛错 ⇒ 调用方不 arm）：`readonlyOnly && operatorOnly` 互斥；`approveDeny && !operatorOnly` 抛错；`operatorOnly` 必须有 `operatorChannel`；`operatorOnly` 不得带 `pmAsk`/`routineShellPolicy`。
  - **判定映射**（operatorOnly=true）：`allow` → 直放（`c-allow`，**0 次 operator 调用**）；`risky`/`review` → `runA`（`c-risky→a-*` / `c-review→a-*`）；`deny` + `approveDeny=true` → `runA`（`c-deny→a-*`）；`deny` + `approveDeny=false` → 既有硬拒（`c-deny`，回归）。
  - 新增 `BRANCH_C_RISKY`/`BRANCH_C_REVIEW`；`by` 后缀审批档为 `（su 审批档）`（**不复用**只读档后缀），批准后为 `... → operator:<标识>`。
  - 导出单一来源 `SU_APPROVAL_REASON_PREFIX = "su-审批档"`、`SuApprovalTier` 与 `renderSuApprovalReason(tier, detail?)`：`su-审批档[<tier>]：<命中原因>；批准后命令以当前 OS 用户权限执行，可能绕过 ANS 文件写边界。`
  - 审计字段/落盘不变（command 原文、argv、cwd、conclusion、branch、by、`conditions:["shell-gate"]`、`execution:"未执行"`）；审计失败不翻转判定。
- `src/pipeline/orchestration/shell-arming.ts`：新增 `AssembleOperatorShellGateOptions`（含 project/operatorChannel 必填、classifyShell/rules/timeoutMs/operatorTimeoutMs/now/env/auditSink；**无** pmAsk/pmRoleId/openSession/sessionDeps/routineShellPolicy）与 `assembleOperatorShellGate`（`buildShellGate({ operatorOnly:true, approveDeny:true, operatorChannel, ... })`；审计边界/刷新复用 `resolveGovernanceBoundary`，同只读档）；并再导出 `SU_APPROVAL_REASON_PREFIX`/`renderSuApprovalReason`/`SuApprovalTier` 供桌面经 Pipeline 公共出口消费。
- `src/pipeline/orchestration/run-role.ts`：新增 `shellOperatorOnly?: Omit<AssembleOperatorShellGateOptions,"project">`。优先级：`shellOperatorOnly`（su-only 校验）→ `shellReadonly` → 项目角色三层链。**su-only**：`suppressHandback === true` 才生效；项目角色误传 ⇒ 不 arm + 诊断（`reasonCode:"not-built-in-governance"`）。与 `shellReadonly` 同时给出 ⇒ **不 arm** + 诊断（`conflicts-with-shellReadonly`）。装配失败 ⇒ 不 arm。
- `src/common/编排/operator-channel.ts`：`formatOperatorPrompt` 按 `SU_APPROVAL_REASON_PREFIX` 识别模式——su 审批档显示「su 审批档：客户逐条批准，不走 (b) 审读」，不再写死「(b) 未定」；其他通道文案逐字不变。

**语义/回归**：`readonlyOnly`（su 只读档）与项目角色三层链逐字保留、缺省行为不变；旧只读档代码/测试未删（评审 §七-5）。

**测试**：新增 `test/编排/shell-operator-only.test.ts` **11 例**——allow 0 卡/审计字段；risky/review/deny × 批准/拒绝/超时/不可用（branch/by/reason）；deny+approveDeny=false 回归；五条构造守卫；`renderSuApprovalReason` 金文本；CLI 提示模式；`assembleOperatorShellGate` 装配与缺件 fail-closed；`openRoleSession` 的 su-only/互斥/缺通道不 arm。既有 `shell-gate`/`shell-readonly`/`shell-review-chain`/`shell-arming`/`run-role` 用例零改动。

**证据**：`node --test "test/编排/shell-operator-only.test.ts"` → **11/11**；`node --test "test/编排/**/*.test.ts"` → **348 计 / 347 过 / 1 红**——唯一红仍是 `shell-authorized-routine.test.ts:103` 的 Windows 符号链接 EPERM（既有环境红，与本批无关）；`npm run typecheck` → **本批文件零错**；全仓仍 85 错（claude-adapter/provider 与 `test/claude-adapter`/`test/测试` 的既有缺件）。

**未做/边界**：未 git 提交；未碰 `app/**`、`src/common/门禁引擎/**`、`src/provider/**`、`src/service/**`、其他角色文件、客户项目；未读 `.env`、未跑凭据/网络命令、未真跑 shell 命令。**跨角色待 pm 转达**：桌面窗口按 §3.5 给 su 注入 `shellOperatorOnly`（`operatorChannel` 对 su 也构造、不再传 `shellReadonly`），卡片按 §3.6 解析 `su-审批档[...]` 并显示档位/警告；门禁引擎按 §3.7 写内置角色卡命令纪律段。

## 2026-10-17 — I3「已有角色但无治理记录」兼容：`previewGovernanceRecord` / `establishGovernanceRecord`（B1）＋ Pipeline 薄再导出（B2）

**来源**：PM 评审/任务书 `角色卡/项目管理/docs/design/2026-10-17_design_existing-project-compat-review.md`（status: approved，客户裁定「推进吧，按 B+C 来」）§一、§二 I3、§四.3/§4.4/§4.6、§五 B1/B2、§七。方案级无返工项；本轮按批准口径实施，未改道 A、未给内置边界加 accepted、未加常驻治理写权。

**改了什么（全部在本角色 Section 1 内）**：
- `src/common/编排/finalize.ts`：新增 `GOVERNANCE_RECORD_ACCEPTANCE_SOURCE`（操作者动作常量，逐字：`desktop-app:操作者为已有角色的项目显式建立治理记录（操作者点击确认）`）、四型 `GovernancePreview` / `GovernancePreviewResult` / `GovernancePreviewErrorCode` / `EstablishGovernanceResult`、输入型 `GovernanceRecordInput`，以及两个函数：
  - `previewGovernanceRecord(input)`：只读。守卫顺序 invalid-request → busy → `.ans` 状态（可用→`already-established`；损坏/未接受/边界路径空→`invalid-record`）→ `hasRoles` → 既有治理文档校验 → `precheck`（`nothing-to-pin`/`blocked` 原样 message）。成功返回 `governanceBoundaryRel`、按写入顺序的 `writePaths`、`pinPaths`、`roleIds`、`adoptExistingGovernanceDoc`、`acceptanceSource`、`legacyBoundaryRoleIds`。
  - `establishGovernanceRecord(input)`：守卫（§4.6 的 3–7；importedProjectRoot/confirm 归桌面 IPC）：进程内同项目互斥 → `.ans` 必须不存在（有效/损坏均不覆盖）→ `hasRoles === true` → 既有治理文档可解析且条目非空（通过则 `writeGovernanceBoundaryDoc:false` 采纳、不覆盖）→ `finalizeBootstrap`。`phase` 三态 `guard`/`precheck`/`write`；`FinalizeResult` 逐字嵌套；写入阶段抛错捕获为 `phase:"write"` +「写入中断：…；可能已写入部分文件（治理边界文档/.ans/manifest 不保证齐全），请核对现场；本版不会自动覆盖已存在的 .ans，修复路径待后续版本。」，不自动重试、不清理已写产物；`finally` 释放互斥。
  - 复用（不复制）：`precheck`/`finalizeRelPaths`/`scanRoles`/`isGenesisState`；`precheck` 现回传 `writePaths`（按实际写入顺序：治理文档→`.ans`→manifest）与 `legacyBoundaryRoleIds`（`boundaryRel` 以 `.md` 结尾的角色），供预览与 finalize 共用同一份目标构建。
  - 一次性边界：每次调用内 `buildGovernanceSeedBoundary(<常量>)` 新建；模块级只留互斥 `Set`（无边界缓存、无配置字段）。`.ans` 持久化的是 finalize 写出的治理边界文档的 pin-backed acceptance（source 取该常量），不是种子边界。
  - 跨层导入（与既有先例一致，如实登记）：`buildGovernanceSeedBoundary`/`resolveBoundary` 从 Service 公共出口 `src/service/boundary/resolve-boundary.ts` 只读导入；`listProject` 从 `src/service/role/resolve-role.ts`；`loadEffectiveConfig`/`resolveSkillRoot` 从共享模块。**未复制任何实现**。
- `src/pipeline/orchestration/govern-session.ts`：**薄再导出** B1 的两个函数、常量与五型（含输入型），供桌面经 Pipeline 公共出口消费；`openGovernanceSession`/`runGovernSession` 既有行为逐字未改。

**为什么 `hasRoles` 用 `listProject`、pin 目标用 `scanRoles`**：`hasRoles` 是产品层既有判据（桌面 S1 与 `ProjectListing` 同源）；finalize 的 pin 目标必须与其扫描口径一致（`角色卡/` 下同时有 `role-card.md` 与可 pin 边界）。两者并非重复实现——前者判定「项目是否有角色」，后者决定「本次能 pin 什么」；`role-cards/`（英文目录）等形态会如实落到 `nothing-to-pin`（N6），不会被误报为 `no-roles`（N5/N6 的如实反映）。

**测试**：新增 `test/编排/governance-record.test.ts` **17 例**：preview 七态（S1 三写路径 + pin 列表 + legacy 提示、`already-established`、`invalid-record`、`no-roles`、`nothing-to-pin`、文档不可解析、条目为空）＋并发 busy（preview 与第二次 establish 均 busy，首个正常完成）＋invalid-request；establish 成功（三产物、`.ans` 可解析/pin-backed、pin/manifest 独立重算一致、`governanceBoundary.path` 非空、accepted、pin 覆盖治理文档与全部可 pin 角色边界、无「创世种子」标记）＋删 `.ans` 后重跑（采纳既有治理文档、pin 反映当刻字节、不复用上次结果）＋no-roles/`.ans` 已存在/损坏/坏治理文档/precheck 五类零写入＋写入阶段注入错误（`docs` 为文件 → `phase:"write"`、message 如实、`.ans`/治理文档可能已落盘）。未改既有 `finalizeBootstrap`/`repinIfBootstrapped` 用例；既有用例零调整。

**证据**：`node --test "test/编排/governance-record.test.ts"` → **17/17**；`node --test "test/编排/**/*.test.ts"` → **337 计 / 336 过 / 1 红**——唯一红 `test/编排/shell-authorized-routine.test.ts:103` 的 `symlinkSync` **EPERM**（Windows 无符号链接权限，既有环境红，与本批零交集；本批未碰该文件）；`node --test "test/编排/govern-engine.test.ts"` 包含于上述套件、全绿。`npm run typecheck` → **本批文件零错**；全仓 **85 错**，全部在 `src/provider/claude/**` 与 `test/claude-adapter/**`／`test/测试/**`，根因缺 `@anthropic-ai/claude-agent-sdk`／`zod`／MCP SDK 类型声明（既有环境，未改无关文件）。

**未做/边界**：未 git 提交；未碰 `app/**`、`src/service/**`、其他角色文件、客户项目；未读 `.env`、未跑凭据/网络命令。**跨角色待 pm 转达**：桌面 C1 在 IPC 层做 `importedProjectRoot` 与 `confirm === true` 校验，然后调用 `establishGovernanceRecord({ projectRoot })`（`skillRoot` 可省略，缺省 `resolveSkillRoot()` 与装配同源）；预览/建立的错误文案与 `phase` 语义按 §4.5 呈现。

**独立验证修正（同日，测试角色反馈后）**：① 来源常量改为 `desktop-app:操作者为已有角色的项目显式建立治理记录（操作者点击确认）`——旧文案「仅本次，不持久化」与事实矛盾：该字符串会经 `finalizeBootstrap` 写入 `.ans` 的 `acceptance.source`；**一次性的是种子边界对象**，已在常量注释中如实区分。② 写入阶段失败消息改为「写入中断：<错误>；可能已写入部分文件（治理边界文档/.ans/manifest 不保证齐全），请核对现场；本版不会自动覆盖已存在的 .ans，修复路径待后续版本。」——不再承诺「重新执行会安全采纳」（`.ans` 已落盘时重跑会得到 `already-established`，V1 不覆盖）。`phase:"write"`、`ok:false`、不自动重试、不清理已写产物均不变；测试断言同步（新增「不得承诺可重试」反向断言）。

## 2026-10-16 — G-4 V2 wave A（客户批准 V2 分批实施「按推荐批准，开始实施」）：su 预授权扩列**第四棵** `docs/mcp`（常量＋话术＋测试面同步）

**来源**：客户 2026-10-16「按推荐批准，开始实施」＝G-4 V2（MCP 安装）分批实施（PM 评审 `2026-10-15_change_kanban-fixes-pm-review.md` §「客户批准（2026-10-16）」；产品提案 revision 2 `2026-10-16_design_role-capability-install.md` §九 V2 范围①——V1 裁定①「`docs/mcp` 未扩——V2 再议」落点；PM 派发原文「编排（**预授权第四棵树 `docs/mcp`**＋话术同步）」）。本批＝**wave A 编排件**；能力位透传（`installMcp`/`uninstallMcp` 接线点亮）＝wave B、待运行时核心契约定形——**本批不做**。实施记录：`docs/change/2026-10-16_change_g4v2-mcp-preauth.md`。

**改了什么（全部在本角色 Section 1 内）**：
- `src/pipeline/orchestration/run-role.ts`：`SU_PREAUTHORIZED_WRITE_DIRS` 三棵 → **四棵**（+`"docs/mcp"`）；裁定注释块与文件头摘要同步（三棵→四棵；④ 段＝V2 来源＋提案 §九 V2 范围①；`suPreauthorizedRelOf` 段比较示例补 `docs/mcp2`）；背景指针补本批记录。
- `src/pipeline/orchestration/govern-session.ts`：两处模型可见文案预授权清单并列加 `docs/mcp/`（`runGovernSession` 确认制说明行＋`buildGovernPrompt` confirmRule——与 V1 I5 先例同口径）。
- **测试面**（沿 V1 I5 体格扩展）：`test/编排/session-handle.test.ts` 五例各加 `docs/mcp` 断言（开局免确认含子路径/绝对路径＋标题与段头注释四棵逐一点名；`docs/mcp2` 前缀负例；非 su 无预授权；静态 scope 同口径；重建后仍可写）；`test/编排/confirmation-gated.test.ts` ⑥b E2E 加两笔 `docs/mcp/{echo.md,sub/deep.md}` 真落盘断言（客户通道仍零调用；`docs/其他.md`/`角色卡/` 仍 F4 拒、零副作用）。既有断言零改动、未为变绿放松。

**语义零变化（钉死）**：仅内置治理角色（su）；仅初始 writeSet（不经发行器、开会话/重建均生效）；**只放开 F4 一环**（F6/F7/边界/条件逐字不变）；`docs/mcp2` 前缀不覆盖（段比较）；其余一切路径照旧 F4 拒。

**证据**：`node --test "test/编排/"*.test.ts` → **318/318** 全绿（收笔时含并行件工作树复跑同；只加断言未增用例）；`npm run typecheck` → **全仓 0 错**；全量测量点 → **1884 计 / 1879 过 / 4 红 / 1 skipped**——本批**直接归因 3 处**（`test/测试/`：g1-copy-and-nails:26 代码级钉子「恰为三棵」实测已得四棵；g4-skill-verify/c-preauth:113-114 ④；g4-skill-verify/h-scope-audit 范围①——均为旧态独立验证钉子、**本角色未动**、待测试角色同步翻转）；第 4 处（h-scope-audit 范围②）为 **V2 wave A 多上下文叠加**、随整体 wave 翻新。**并行实况**：wave A 其余属主正在同一工作树并行落盘（运行时核心 `model/runtime.ts`/`mcp-declarations.ts`、门禁引擎卡文本四棵+MCP 段、桌面UI）——全量为移动快照；收笔时复跑另见其批次自身红（g1 卡文本两条、su-doc-surface-convention 三条＝门禁引擎卡文本改写；范围② install_mcp 零命中＝运行时核心在途），各归各属主批次。翻转清单见实施记录 §六。

**跨角色（请 pm 转达）**：① **测试角色**——本批直接归因 3 处＋wave A 叠加 1 处独立钉子待其验证轮同步翻转（位置与改法见实施记录 §六）；② **门禁引擎**——卡文本（`BUILT_IN_ROLE_CARD_TEXT`）MCP 安装纪律段＋预授权计数四棵属其 wave A 件（已在途；其卡文本断言由该批次自行同步）；③ **运行时核心/桌面UI**——wave A 其余件并行落盘、与本批互不触；**编排自身 wave B**（能力位透传点亮两工具）待契约落盘后另批。

**附（PM 收口派发，同日落）：能力位透传收口——点亮 `install_mcp`/`uninstall_mcp`（节奏同 V1 I1/I2 末环）**——运行时核心 V2 契约落盘后，`run-role.ts` **六处逐名**收口：① import type `+ InstallMcpFn/UninstallMcpFn`（只读 model、名字逐字）；② `AdapterCapabilities` `+ installMcp?/uninstallMcp?`（注释＝只给 su＋能力级授予诚实面）；③ `openRoleSession` 输入型 `+` 同名两字段（JSDoc 同技能版体格）；④ 注入求值 `suppressHandback ? input.installMcp : undefined`（同 `uninstallMcp`）；⑤ capabilities 两条件展开；⑥ 工厂逐名并入会话构造（`undefined` ⇒ 工具不注册）。测试 `test/编排/installed-skills.test.ts` **+2**（桩捕获：su 同引用透传/项目角色误给不注入/未给不注入；端到端真实 Service 装配：su 注册两工具、载荷逐字直达、回执如实含「未改变任何角色的写边界」「能力级授予」，`registration-unchanged` 未执行如实转达；不注入/项目角色 ⇒ 零注册）→ 该文件 **20/20**、`test/编排/` **320** 全绿。evidence 全量对照**无本批新红**：收笔快照 1900 计/1891 过/8 红/1 skipped——8 红全部为 `test/测试/` 待翻新钉子（4 处＝V2 行为翻转目标〔g1-copy-and-nails 代码级钉子、c-preauth ④、h-scope-audit 范围①②〕、4 处＝门禁引擎卡文本批次〔g1 卡文本两条＋d-card-guard 两条〕）；typecheck 本批六处零错（工作树仅 `app/desktop/session.ts` 两处＝桌面UI批次在途、非本批）。至此**编排 V2 面收口**（wave A 预授权第四棵＋wave B 透传点亮）；桌面 handler/三适配器装配仍属各属主。详见实施记录 §八。

## 2026-10-16 — G-4 I4+I5（客户批准 V1，十项裁定全采纳）：开局注入渲染**单一来源** `renderInstalledSkillsSection` ＋ su 预授权扩列 `docs/skills`

**来源**：客户 2026-10-16 批准 G-4（角色能力安装）V1 实施、十项裁定全采纳（提案 `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` §九 I4/I5；呈批见提交 `d8eaa1c`）。裁定 1＝预授权扩列候选 1（`docs/skills`）→ I5；裁定 2＝加载路径终选 C「会话开局注入」→ I4；裁定 3＝两文件形态＋角色列表；裁定 6＝技能可迭代（当刻字节为准）。

**改了什么（全部在本角色 Section 1 内）**：
- **新增 `src/common/编排/installed-skills.ts`（I4 主体，落盘即契约）**：导出**冻结签名** `renderInstalledSkillsSection(projectRoot, roleId, onDiagnostic?): string`（同步；**默认两参可用**；第三参＝可选坏件回调）＋ `InstalledSkillsDiagnostic{path,reason,detail?}` 与五值原因码。判据链：扫 `docs/skills/<name>/`（扫描序确定化）→ 读 `install.md`（用途/适用角色/状态/安装日期四字段；宽容解析：BOM/CRLF/半角冒号/无横线；首现为准；日期取首个 `YYYY-MM-DD`）→ `uninstalled` 静默跳过、未知状态＝坏件 → 角色列表精确命中（不命中**不读** SKILL.md）→ `SKILL.md` 存在性校验＋**当刻字节** sha256（`finalize.ts` 同算法：「哈希只能由代码算」）→ name 排序、编号 1..N。**冻结文案逐字**（标题＋编号行＋尾句「内容以文件当刻字节为准…交 blocked 报告（不得猜）」）；**零技能⇒空串**；**坏件（登记缺失/解析失败/SKILL.md 缺失/名非法/根不可读）一律跳过＋诊断（内部 `installed-skills.skip` jsonl 记录＋可选回调），绝不抛错、绝不拒开会话**（沿 `resolve-role.ts` 防御先例）。
- **I5 `src/pipeline/orchestration/run-role.ts`**：`SU_PREAUTHORIZED_WRITE_DIRS` 两棵 → **三棵**（`docs/su`、`docs/contracts`、`docs/skills`）；裁定注释块与文件头摘要同步改写（第三棵＝G-4 裁定 1、§4.6 候选 1；`docs/mcp` 未扩、V2 另议）。语义零变化：仅 su、初始集合、只放开 F4 一环（F6/F7/边界/条件逐字不变）、`docs/skills2` 前缀不覆盖。**`govern-session.ts` 两处模型可见文案同步列三棵**（F-5-main 先例；su 卡文本归门禁引擎 I6 另行实施）。
- **测试**：新增 `test/编排/installed-skills.test.ts` **13 例**（金文本逐字/原始字节 digest 与非 UTF-8 字节/多技能排序编号/零渲染/角色过滤（别角色坏件不扰本角色）/状态过滤/EISDIR/根为文件与控制字符名防御/解析宽容与首现为准/四字段缺一/内部诊断落盘/回调抛错被吞）。既有预授权用例扩展：`session-handle.test.ts` 五例各加 `docs/skills` 断言、`confirmation-gated.test.ts` ⑥b E2E 加 `docs/skills/t1/{install.md,SKILL.md}` 真落盘断言（零确认、其余零副作用不变）。

**证据**：`node --test "test/编排/"*.test.ts` → **313/313**（基线 300 + 13）；`npm run typecheck` → **全仓 0 错**；全量 `node --test "test/**/*.test.ts"` 本批收口快照 **1790 计 / 1787 过 / 2 红 / 1 skipped**，终跑快照（并行批次继续落地后）**1799 计 / 1794 过 / 4 红 / 1 skipped**——4 红**全在 `test/测试/` 独立钉子、非本批文件**：① g1-copy-and-nails:26「恰为两棵」钉随**本裁定**过时（实得三棵；需测试角色更新）；②③ 同文件卡文本两条钉随**门禁引擎 I6 在途**（卡文本两棵→三棵）待其同步；④ pi-loopback 钉旧「URL 贪吃吞标题」随**运行时核心 `cleanpatterns-url-greedy` 在途**（已以 pristine-HEAD worktree 复验该文件 6/6 绿⇒红源在其工作树改动）。环境：Node v24.14.0、Darwin 25.6.0。未 git 提交；未碰 `app/**`、三适配器、运行时核心/门禁引擎文件、真机轮目录与测试证据目录。详见[实施记录](docs/change/2026-10-16_change_g4-skill-injection-and-preauth.md)。

**跨角色（请 pm 转达）**：① **三适配器（Claude/Codex/Pi）+ 假适配器**——系统提示拼装处调 `renderInstalledSkillsSection(projectRoot, roleId)`（两参；同步；空串⇒零渲染；非空⇒整段拼接、不得改写/另写模板；坏件处置全在函数内不必预扫）；**导出路径与签名落盘即契约**（要点见实施记录 §五）。② **运行时核心（I1/I2）**——工具与 maker 归其；登记文件未落地前本函数对所有项目零渲染。③ **门禁引擎（I6）**——su 卡文本「预置豁免」段两棵→三棵＋`boundary-core.ts:71` 一带「＝两目录」注释过期（同批核 `su-doc-surface-convention.test.ts`）。④ **测试角色**——g1-copy-and-nails 三处更新：`:26` 钉子两棵→三棵（随本裁定）、`:35`/`:99` 卡文本两棵→三棵措辞（随门禁引擎 I6；其与 I6 同批更顺）。⑤ **桌面窗口（I3）/桌面UI（I7）**——handler 与行样式归各自。

**附（PM 小扩展派发，同日同批落）**：I3 前置——`src/common/编排/installed-skills.ts` **增导出** `readSkillRegistration(projectRoot, name): SkillRegistrationView | undefined`（桌面安装 handler 的「登记含/不含角色」校验面；返回面＝内部解析的公开视图 用途/角色列表/状态/日期；与渲染器**共用 `loadRegistration` 同一判据、单一解析来源**——配置侧不得复制解析；坏件/缺失 ⇒ `undefined`（同坏件集）、`uninstalled`/角色不命中非坏件原样返回；不检查 SKILL.md；入口防御空名/`..`/分隔符）。**仅增导出**：`renderInstalledSkillsSection` 行为/文案与既有 13 例逐字未变、全绿；测试 **+3**（读取器正例含 uninstalled 视图/坏件与入口防御 ⇒ undefined/**与渲染器双向核**：坏件 undefined ⟺ 渲染器诊断、非坏件有视图 ⟺ 渲染器静默过滤）。`test/编排/` **316/316**；typecheck 全仓 **0 错**。

**附二（PM 收口派发，同日）**：G-4 V1 最后一件——I1/I2 工具**末环接线**（`src/pipeline/orchestration/run-role.ts`）：`AdapterCapabilities` 与 `openRoleSession` 输入型增 `installSkill?: InstallSkillFn` / `uninstallSkill?: UninstallSkillFn`（类型**只读导入**契约家 `model/runtime.ts`——单一来源；**字段名逐字**＝能力名，错一名 ⇒ 工具静默零注册，G-2 教训），注入判据复用 `suppressHandback`（**只给 su**；项目角色误给不注入＝零感知），`capabilities` 装配与 `createRuntimeAdapterFactory` **逐名透传**至会话构造（运行时核心 `GovernedToolsOptions` 同名能力位——「注入才注册」；`undefined` ⇒ 两工具不注册）。补上这一件后，桌面 I3 已透传的字段即点亮两工具（CLI/编排路径与桌面路径同形）。测试 **+2**（桩捕获：su 同引用/项目角色误给不注入/未给不注入；端到端真实装配：注册两工具、handler 直达注入实现（载荷逐字、成功回执含 path 且重申「未改变任何角色的写边界」、`registration-unchanged` 如实「未执行」）、不注入与项目角色 ⇒ 零注册）。`test/编排/` **318/318**；typecheck 全仓 **0 错**；**全量 `node --test "test/**/*.test.ts"` → 1829 计 / 1828 过 / 0 红 / 1 skipped（全绿，exit 0）**——相对基线 1827/1826/0/1 零新红。

## 2026-10-16 — 收束默认阈值 5 min → 30 秒（客户复裁）：`renderClosurePrompt` 改**毫秒**接口 + 两档自适应文案；常量保名改值

**来源**：客户 run-5 真机观察后复裁「没有任务就应该直接收束」——完成态收束静默阈值默认值 5 min → **30 秒**（＝一个 tick 的最小防抖），env 可调保留；**冻结接口 `renderClosurePrompt(silentMs)`**（分钟参数作废）。记档＝`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「客户裁定修订（2026-10-16，run-5 观察后）」。派发：编排＝**文案渲染器与常量**（桌面窗口并行改默认值与判定，其侧已按冻结接口直传毫秒）。

**改了什么（全部在本角色 Section 1 内）**：
- `src/common/编排/watchdog.ts`：`renderClosurePrompt(silentMinutes)` → **`renderClosurePrompt(silentMs)`**（毫秒；JSDoc 注明接口/取整/回退口径）；文案两档自适应——≥ 60 000 ms「N 分钟」、< 60 000 ms「N 秒」，两档**一律 floor**（显示值为静默时长**下界**，杜绝夸大；90 500 ms→「1 分钟」、亚秒→「0 秒」）；非法输入（非有限/≤0）回退默认 **30 秒**；**首行时长短语外其余四行逐字未动**（不强迫断言「完成」/文首标记不变）。
- 常量**保名改值**：`WATCHDOG_DEFAULT_SILENT_MINUTES = 0.5`（＝30 000 ms）。客户裁定「改名毫秒常量 / 保名改值」两法皆可——选保名：`test/测试/g2-verify/scope-audit.test.ts` 按名导入（越界不自改），改名即破其编译 ⇒ 全仓 typecheck 0 错不可保；**导出名零变化**，语义值 5→0.5 及其影响面已登记（见实施记录 §六）。
- `test/编排/watchdog.test.ts`：收束块重写并拆两例（300 s 金文本＋30 s/59 999/60 000/600 000 边界；floor 与亚秒；六类非法回退；常量自洽 0.5×60 000＝30 000）。

**证据**：`node --test "test/编排/"*.test.ts` → **300/300**（基线 299 +1）；`npm run typecheck` → **全仓 0 错**。未 git 提交；未碰 `app/desktop/**`（仅只读核对）、`test/测试/**`、kanban-live-* 与 `/private/tmp` 真机轮目录。**跨角色待 pm 转达**：① 测试角色 g2-verify 随复裁刷新（`scope-audit.test.ts:53` 常量断言 5→0.5 将红——属旧裁定 1 审计块，桌面侧断言亦过期；`scope-audit:184`/`contract-freeze:64,85` 的 `renderClosurePrompt(5)` 数字语义过期但不红）；② 独立验证口径随裁定修订更新。见[实施记录](docs/fix/2026-10-16_fix_closure-30s-ms-interface.md)。

## 2026-10-16 — G-2 / O1：看护三能力承载与透传（只 su 注入）＋ 告警/收束/恢复回执文案**单一来源**（含 U1 文首标记契约对齐）

**来源**：客户 2026-10-16 按推荐批准 G-2 按提案实施（V1a+V1b 同轮；9 个待裁点全采纳）——`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-2 客户批准与派发」；设计规格 `角色卡/产品/docs/design/2026-10-16_design_role-watchdog-and-closure.md` §十 表 O1 行（属主＝编排）。工具名以批准记录为准：`role_status` / `session_tail` / `propose_recovery`。**实施轮内与运行时核心 R1/R2 同树并行落位并完成对向对齐**（形状最终收敛为回执式，物理单一来源＝契约家 `model/runtime.ts`）；**桌面UI U1 的文首标记契约**经 PM 转达并对齐（见下）。

**改了什么（全部在本角色 Section 1 内）**：
- **新增 `src/common/编排/watchdog.ts`（文案单一来源＋契约转发）**：五件纯渲染器——`renderWatchdogAlert`（四信号告警：文首 `[系统·看护]`；信号/角色/事实/建议/纪律必含；建议按信号分派、#3 注明「F-1 已自动终止…通常无需动作」）、`renderWatchdogRecovery`（「期间共命中 N 次，抑制 M 条」）、`renderWatchdogStormGuard`、`renderClosurePrompt`（设计 §7.3 逐字；不强迫断言「完成」；非法 N 回退默认 5）、`renderRecoveryReceipt`（动作/角色/结果四值＋原因/`operator:<id>`/时间；未执行绝不假装已执行；输入＝契约 `RecoveryReceipt` ＋ action/targetRoleId/可注入 now）；常量 `WATCHDOG_ALERT/CLOSURE/RECOVERY_PREFIX`、`WATCHDOG_DISCIPLINE_LINE`、`WATCHDOG_DEFAULT_SILENT_MINUTES`、`RECOVERY_ACTIONS`、`WATCHDOG_PROMPT_GUIDELINES`（su 看护纪律三条：可自查／提议 ≠ 执行／不得据此假设任何写权——与门禁引擎 G 卡文本、R1/R2 schema 指南同口径）；十条契约类型经 `export type {…} from model/runtime.ts` **同一符号转发**（无第二份形状）。**文首标记契约**（U1 对齐）：`[系统·<子类>] `——ASCII 括号、中点 U+00B7、闭合于 `]` 且其后空白（改形态 = system 类静默回落普通气泡）；注释与测试逐字节钉住（与 `tool-rows.js::SYSTEM_HEAD` 一致）。事实行由检测侧如实传入——本层不触盘、不判定、不编造。
- **改 `src/pipeline/orchestration/run-role.ts`**：`AdapterCapabilities` 增 `roleStatus?/sessionTail?/proposeRecovery?` 三能力位 + `openRoleSession` 输入增同名三可选参数（Fn 类型从契约家 `model/runtime.ts` 导入，同 `CustomerInputFn`/`DispatchTaskFn` 先例）；注入判据复用 `suppressHandback`（内置治理角色先例，同 dispatchTask）——**只给 su**、项目角色即便误给也不注入、未给不注入（能力缺席 = fail-closed）；`createRuntimeAdapterFactory` 显式并入适配器选项同名三字段（运行时核心 `GovernedToolsOptions` 同名能力位，「注入才注册」）。
- **`test/编排/watchdog.test.ts`（新增 11 例）**：文首标记契约（全输出满足形态正则、中点 U+00B7 逐字节）；五渲染器逐字金文本＋N 边界/反向断言（不夹带授权语义）；四信号措辞各异＋#3「通常无需动作」；回执四值如实；promptGuidelines 三条钉住；**能力位只 su**（桩捕获：su 同引用/项目角色不给/未给不注入）；**端到端**（真实 Service 装配 + 演示替身：su 注册三工具且 handler 直达注入实现、declined 如实「未获执行」；项目角色零注册）。

**证据**：`node --test "test/编排/"*.test.ts` → **299/299**（288 + 11）；`npm run typecheck` → **全仓 0 错**；全量 `node --test "test/**/*.test.ts"` → **终跑 1579 计 / 1578 过 / 0 红 / 1 skipped（全绿）**——中段一次 3 红全在 `test/桌面应用/`（F-5-opt1 桌面侧注记／F-4-opt1 replayPending／P1-1 UI 撤回）＝桌面窗口/桌面UI 并行在途，随其收口自消解、与本批零交集；跳过为既有 Windows 专用用例。既有用例零改动、未为变绿放松断言。环境：Node v24.14.0、Darwin 25.6.0。未 git 提交；未碰 `app/**`、`src/provider/**`、`src/model/**`、`src/common/shared/**`、其它角色文件与测试证据目录、kanban-live-3 / `/private/tmp` 轮次目录。详见[实施记录](docs/fix/2026-10-16_fix_g2-watchdog-wiring.md)。

**跨角色（请 pm 转达）**：① **桌面窗口（W1/W3/W5）**——三类文案一律经本模块渲染（导入路径与接入要点见实施记录 §五；**勿在桌面另拼文首前缀**——标记形态是 U1 契约、本模块三前缀即单一来源）；三能力经 `openRoleSession` 入参字段名 `roleStatus` / `sessionTail` / `proposeRecovery` 注入（镜像补同名字段；字段名即契约）；两读工具返回 `WatchdogToolResult` 回执（失败**不要抛**——抛错由工具层如实转达「未完成」）；`propose_recovery` 返回 `RecoveryReceipt` 四值（declined/unsupported/error 一律未执行，绝不假装）。② **运行时核心（R1/R2）**——已同树落位并完成对向对齐（`GovernedToolsOptions` 同名能力位＋三工具注册＋schema 指南同口径；形状物理单一来源＝`model/runtime.ts`，其注释注明与 `watchdog.ts` 同名同形）。③ **门禁引擎（G）**——su 卡「看护职责段」同口径。④ **独立验证核对项**：三能力字段名、文首标记形态（二者改掉即静默失配/回落）。真机 E2E（「卡住有告警、完成会收束」）属测试/客户轮。

## 2026-10-16 — G-1 / A1：派发「必读（按序）」引用块**单一来源**（`renderDispatchPrompt` 扩展 + 提取/判据纯函数；不碰 `app/**`）

**来源**：客户 2026-10-16 批准 G-1 按提案实施（`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §「G-1 客户批准与 PM 裁定」，六项裁定全采纳提案推荐）；设计规格 `角色卡/产品/docs/design/2026-10-16_design_contract-workflow-dispatch.md` §四 + §九 A1（属主＝编排）。裁定 3 钉死失败口径：**契约缺失→拒投 + 如实回执（fail-closed）**；**workflow 缺失→降级标注**。关键约束（设计 §四.2）：**哈希只能由代码算**（su/角色都不会算 hash——`finalize.ts` 先例）——本角色只做**提取 + 渲染 + 判据**三件纯函数（不算哈希、不触盘），哈希由投递侧（桌面 `filePrint`）在投递时算。

**改了什么（全部在本角色 Section 1 内）**：
- **`src/common/编排/handback.ts`（唯一源码改动；H-1 节扩展为 H-1+G-1 共用件）**：
  - **`renderDispatchPrompt(req, opts?)`** 扩展——**无引用时旧 3 行格式逐字不变**（既有断言/去重键语义零影响）；有引用时按设计 §四.1 渲染「必读（按序）」块（编号缩进、`path（sha256:<64hex>）` 逐字注入、`任务：` 前缀），完成句仅在**引用含 workflow.md** 时切「…完成口令见 workflow.md 第 2 节」变体（不指向不在场文件）。
  - **`extractDispatchReadPaths(task)`**：固定提取——只认 `docs/workflow.md` 与 `docs/contracts/**.md`（长度守卫防 `docs/contracts/.md`）；产物路径等**不注入不校验**（§四.3 第 3 条）；token 剥离**复用** `confirmed-writes.ts::extractPathCandidates`（同源正则，不另写）；保序：workflow 置首（§五.3 阅读序）、契约首现序、去重。
  - **`planDispatchDelivery(req, probes)`**：fail-closed 判据单一来源——契约探测值缺失/非法（`<missing>`/非 64 位小写 hex 一律按不存在）→ `{action:"reject",message,systemRow}`（**结构上无 `text`**；逐字回执「派发未受理：引用的契约 <path> 不存在——未投递。」+ 系统行 `**未投递**`；多缺报首现序第一个；拒投优先于降级）；workflow 缺失 → 降级放行（块内如实标注 `（本项目未提供 workflow.md）`，措辞照设计原文；契约编号重排）；未引用路径不参与。放行 `text` 内部调用同一 `renderDispatchPrompt`（**无第二份渲染**）。
  - 新增导出类型 `DispatchReadRef` / `DispatchDeliveryPlan` / `DispatchPromptOptions`；矛盾输入（同路径既引用又标缺失）**引用为准**（测试钉住）。
- **`test/编排/dispatch-reads.test.ts`（新增 14 例，纯函数不触盘）**：提取（置首/首现序/去重/嵌套正例；产物/URL/绝对/目录式/非 md/前缀串线/CJK 紧贴/名空负例）；渲染（旧格式逐字三对照组；workflow+契约逐行金文本 + 授权语义反向断言；仅契约；降级标注；矛盾输入）；判据（全齐放行且与 render 逐字一致＝**单一来源复用断言**；契约缺失 6 种探测值拒投 + 回执逐字 + 无投递文本；多缺报首；workflow 缺失降级；未引用放行；保序编号）。

**证据**：`node --test "test/编排/"*.test.ts` → **288/288** 全绿（274 + 14）；`npm run typecheck` → **全仓 0 错**。既有用例零改动、未为变绿放松断言。环境：Node v24.14.0、Darwin 25.6.0。未 git 提交；未碰 `app/**`、`src/provider/**`、`src/common/shared/**`、其它角色文件与测试证据目录、kanban-live-3 / `/private/tmp` 轮次目录；未发真实模型请求。详见[实施记录](docs/change/2026-10-16_change_contract-workflow-dispatch-a1.md)。

**跨角色（请 pm 转达）**：① **桌面窗口（A2）**——`routeDispatch` 接线：`extractDispatchReadPaths` → `filePrint` 逐个探测（`<missing>` 原样传入）→ `planDispatchDelivery`；**判据先于去重登记**（拒投不登记：桌面去重键在送达时才释放，先登记后拒投会让修好后的同文重派被误去重）；拒投走 `fail(plan.message, plan.systemRow)` 不入队；删除 `renderDispatchPromptLocal` 并按其金文本更新 `test/桌面应用/dispatch-delivery.test.ts`（布局从单行内联收敛为本模块三行）。接口说明要点见实施记录 §五。② **门禁引擎（A3）/运行时核心（A4）**——su 卡文本 / `dispatch_task` 工具描述改「按地址引用」由各自实施（本项只备好收文本侧能力；su 内嵌全文 V1 无机械拦截，属设计 §八已知残余登记）。③ 真机复验（kanban-live 同型）属测试/客户跑。

## 2026-10-16 — su 预授权写目录（客户裁定）：`docs/su/**` + `docs/contracts/**` 预置进初始 writeSet（免确认发行）

**来源**：客户裁定 2026-10-16，原文两句——①「**这个 su 可以写 docs/su 的目录，不需要我审批**」；② 追加（经项目管理转达）「**还有个契约目录也可以给他写。**」（= `docs/contracts/**`，G-1 契约落盘目录约定；其本体落地时生效，本预授权先装好）。这是对 F-5-main 所载既有设计（「写盘许可按会话生效、只经 request_confirmation 发行、重建不自动保留」）的**客户例外**：预授权 = **初始集合的一部分**，不属「经确认发行的写权」。

**改了什么（全部在本角色 Section 1 内）**：
- **`src/pipeline/orchestration/run-role.ts`（主改动）**：新增私有常量 `SU_PREAUTHORIZED_WRITE_DIRS = ["docs/su", "docs/contracts"]` 与两个辅助——`suPreauthorizedRelOf`（目标在预授权树内 → 返回其项目根相对**词法**路径；取值规则与 `resolveWrite` 同源；`isUnderOrEqual` **段式**比较防 `docs/su2` 串线）与 `scopeWithSuPreauthorization`（树内 ⇒ 该路径**并入本次 writeSet**；树外 ⇒ **原样 base**，逐字现状）。`openRoleSession` 的 gate 构造处按既有判据 **`setup.role.kind === "built-in-governance"`**（与 suppressHandback/dispatchTask 同一判据，不硬编码 id）在**确认制动态集**与**静态 scope**两分支同口径求值；`scope === undefined` 会话不新增任何收窄/放宽。新增只读导入共享路径原语 `src/common/shared/path-primitives.ts`（§一.5 消费方名单已含编排，`confirmed-writes.ts` 同源先例）。**实现口径（如实登记）**：F4 是**精确匹配**（放目录不覆盖子路径——`govern-session.ts` 既有注释同一结论），故「预置进初始 writeSet」实现为「**求值时把目标路径本身并入 writeSet**，等价于它初始就在已发行集中」；判定链其余环节（F6 接受、F7 逃逸、边界条目、条件）**逐字不变**，fail-closed 不放松。
- **会话重建覆盖**：预授权在**会话初始化处的 gate 求值中计算**（闭包在角色上，不写入 `issued`、不经发行器、不落状态）⇒ 每次开会话/桌面 O-1 重建（重开一次会话）都同口径获得，**不随句柄/重建丢失**（测试钉住）。**F-5-opt1 重建提示 `REBUILT_SESSION_WRITE_PERMITS_NOTICE` 逐字未动**——它说的是「经确认发行的写权」，预授权不属此类，提示保持准确。
- **`src/pipeline/orchestration/govern-session.ts`（两处模型可见文案同步，各加一短句）**：`runGovernSession` 确认制说明行与 `buildGovernPrompt` 的 confirmRule 补预授权例外（「docs/su/、docs/contracts/ 属初始写集、可直接写、无需确认」）——F-5-main 先例（文案须与实现一致且可操作；否则 CLI 会继续驱动 su 为笔记发确认卡，与客户裁定相悖）。**su 卡文本的配套修改由门禁引擎另行实施（本角色不做，已登记）。**

**严格范围（复核过）**：仅内置治理角色、仅这两棵目录树；`docs/` 其它子路径、`角色卡/`、`.ans/`、`src/` 等一切其余写盘行为不变（未确认 = F4 照拒）；其他角色零变化（非 su 角色边界覆盖 `docs/` 亦无预授权——测试控变量钉住）；不改 `resolve-write.ts`/`confirmed-writes.ts`/任何 `app/**`/门禁引擎文件。

**测试**：`test/编排/session-handle.test.ts` **+5 例**（开局免确认可写含子路径/绝对路径且客户通道零调用；严格边界含 `docs/su2` 类前缀负例与 F4 理由断言；非 su 角色无预授权；静态 scope 同口径；**重建后再开仍可写**）；`test/编排/confirmation-gated.test.ts` **+1 例**（E2E：`governCommand` + 假适配器——不发 `request_confirmation` 即刻落盘 `docs/su/memo.md` 与 `docs/contracts/api-v1.md`、客户通道零调用；`docs/其他.md` 与 `角色卡/` 未确认被 F4 拒、零副作用）。既有断言零改动、未为变绿放松。

**结果**：`node --test "test/编排/"*.test.ts` → **274/274 全绿**（268 + 6）；`npm run typecheck` → **0 错**；全量 `node --test "test/**/*.test.ts"` → **1503 计 / 1502 过 / 0 红 / 1 skipped**（skip 为既有 Windows 专用用例；未见历史 2 基线红）。环境：Node v24.14.0、Darwin 25.6.0。未 git 提交；未碰真机轮目录（`ans-testbed/kanban-live-3`、`/private/tmp/ans-kanban-dev3-ad1bdf3b` 只读）与测试角色证据目录。详见[实施记录](docs/fix/2026-10-16_fix_su-notes-preauth.md)。

**跨角色（请 pm 转达）**：① **门禁引擎**——su 卡文本「确认制要点」段补预授权例外（F-5-main 段落对两棵预授权树已不必要；文本归其属主）。② **桌面窗口**——无需改动（`role.builtIn` 判据与编排 `kind` 判据同集合；O-1 重建路径无需新调用即得预授权）。③ **G-1**——契约目录本体落地时确保治理边界覆盖 `docs/`（现状种子/治理边界文档均已覆盖；预授权本身不制造边界覆盖，未覆盖时照旧「未匹配」拒）。④ 真机复验（测试/客户）：su 写 `docs/su/memo.md` 不弹确认卡且落盘；写 `docs/` 其它路径仍弹卡/未确认被拒。

## 2026-10-16 — kanban-live 修复批（实施轮）：F-6-1 审计刷新重试 + F-6-2 提示去重与如实话术；F-4-X1 操作者真实 reason 转达；F-3-d 回交截断注记；F-5-opt1 编排侧注记注入渠道

**来源**：客户 2026-10-16 按推荐批准（`角色卡/项目管理/docs/change/2026-10-15_change_kanban-fixes-pm-review.md` §客户批准记录），本角色实施项 = F-6-1 + F-6-2（本角色提案 `docs/fix/2026-10-15_fix_kanban-shell-audit-f6.md`）+ F-4-X1（桌面窗口提案 §六）+ F-3-d（Pi适配器提案 §六）+ F-5-opt1 编排侧（门禁引擎提案 §四）。**F-6-opt2/opt3 不实施**（批准范围外）。

**改了什么（全部在本角色 Section 1 内）**：
- **F-6-1 审计写刷新重试**（3 文件）：`shell-audit.ts::createFileAuditSink` 增可选 `refreshGate`——`append()` 首查被拒时**重解析一次、以新 gate 重试一次**；重试放行 → 落盘并**切换活跃门禁**（恢复后零额外开销）；重试仍拒/刷新失败 → 链式原因（原判+重解析后仍拒）、**零副作用**（重试仍在触碰文件系统之前，判定唯一经 `resolveWrite`，fail-closed 全链不绕）。`shell-gate.ts::ShellGateBuildDeps` 增可选 `auditBoundaryRefresh`（缺省不传 = 旧行为逐字）。`shell-arming.ts` 两装配入口各自注入刷新闭包：共享载入器 `loadEffectiveConfig`（只读导入）+ **同一个** `resolveGovernanceBoundary`（三层链含 `roleIdOverride`；只读档同口径）——刷新的语义 = **重读盘上 `.ans` 最新验收**，不是会话快照。
- **F-6-2 提示去重 + 如实话术**：`audit()` 按 reason 去重（同一 gate 实例：首个完整打印一次；相同 reason 只累计）；reason 变化再报一次；恢复落盘打印一行 `已恢复落盘（此前未落盘 N 条）`——本次事故 17 行噪音 → **1 行失败 + 1 行恢复**。拒绝文案去掉错误的「（缺少 `shell-gate` 条件？）」猜测（现场反例：条件已声明、缺的是接受）→ `审计写被门禁拒绝：<resolveWrite 原文>`。「审计失败不翻转判定」不变。
- **F-4-X1（跨边界小项）**：`shell-gate.ts::runA` 的 unavailable 分支**转达 `OperatorOutcome.reason` 原文**（桌面 M2 起「操作者确认超时（>Nms）…」与「本轮已结束、停止或会话已重建…」可辨）；缺原因/未回结果 → 如实兜底「操作者通道不可用（未给出原因），拒绝（fail-closed）」——**「无人值守？」固定句退场**。归因码保持 `a-unavailable`（评估结论：M-1 人话映射据码对号不看文本猜；如实性由 reason 层兑现，不引入文本嗅探改码）。既有断言更新一处：`shell-review-chain.test.ts` 的 (a) 通道不可用用例改为断言**转达真实 reason**。
- **F-3-d（跨边界小项）**：`handback.ts::withHandback` 终态回交路径——**仅 terminal-fallback** 且 settle detail `truncation==="length"` 时，摘要附 **`（截断：stopReason=length）`**（submitted-report 是模型权威值不代改；旧适配器无字段则无注记）。
- **F-5-opt1 编排侧（跨边界小项）**：`run-role.ts` 给 `RoleSessionHandle` 增**可选** `queueModelNotice?(text)`（同 `abort?` 先例，`openRoleSession` 句柄恒实现）——注记**排入下一次 send 的输入前缀**（一行加换行分隔），**送达一次即消费**（未开轮失败 → 保留随重试轮带上；开轮后失败 → 消费防重复）；不单独开轮、不触任何判定；空串忽略。导出推荐文案**单一来源** `REBUILT_SESSION_WRITE_PERMITS_NOTICE`（「会话已因边界更新重建；此前经确认发行的写权不会自动保留，如需写入请重新经 request_confirmation 确认。」——不夹带授权语义）。**桌面调用归其重建路径**（见下跨角色）。

**测试**：`shell-gate.test.ts` +7（F-6-T1 刷新恢复/字段齐备/恢复后直走新门禁；F-6-T2 缺省无刷新=现状；F-6-T3 刷新仍拒链式原因+无猜测归因；F-6-T3b 刷新失败如实；F-6-T4 去重 4 行序列（同因 3 连=1 行、变化/恢复/再失败各一行，stderr 捕获+try/finally 恢复）；F-4-X1 三态转达）；`shell-arming.test.ts` +3（**F-6-T6 事故回归 E2E**：gov.path="" 快照→审核→零副作用→按生产渲染器+同算法 sha256 写收尾物→再审**自愈落盘**恰一条→连续追加；**F-6-T6b 对照组**：不传刷新闭包→收尾后仍不落盘=旧行为；**F-6-T7** su 只读档同接线）；`handback.test.ts` +1（F-3-d 三态）；`session-handle.test.ts` +2（F-5-opt1 前缀送达/消费一次/空串忽略、未开轮失败保留）。**实施中发现并修复自身缺陷**：去重状态初版声明在 `createShellGate` 的 `return` 之后（闭包返回后才执行 ⇒ TDZ，被容错 catch 吞成「审计异常」行）——已前移声明并注释，测试捕获钉住。

**结果**：`test/编排/` **268/268**（原 256 + 12）；`npm run typecheck` **0 错**（实施中另见 `src/provider/runtime/tools.ts` 三处错=**运行时核心**并行 F-7 在途、非本批，其自消解）；全量 `node --test "test/**/*.test.ts"` **终跑 1455 计 / 1454 过 / 0 红 / 1 skipped（全绿）**——中段一次 4 红全在 `test/runtime-core/`（F-7-opt1/opt2 + F-8-a=运行时核心在途、与本批零交集），随其属主收口自消解；本次跑未再见历史 2 条基线红（其文件已被并行改动覆盖）。**本角色零红**。环境：Node v24.14.0、Darwin 25.6.0。未 git 提交；未改 kanban-live 项目与测试角色证据目录；未真跑命令、未发真实模型请求。详见[实施记录](docs/fix/2026-10-15_fix_kanban-shell-audit-f6.md#十实施记录2026-10-16-实施轮)。

**跨角色（请 pm 转达）**：① **桌面窗口（F-5-opt1 桌面侧）**——O-1 重建路径在重建后调 `handle.queueModelNotice?.(REBUILT_SESSION_WRITE_PERMITS_NOTICE)` 即闭环（可选方法，旧替身不实现亦合法）。② **Pi适配器**——F-3-d 依赖 settle detail 的 `truncation:"length"`（F-3-b 承诺字段；本侧按追加、忽略安全消费）。③ **真机复验（测试/客户）**——空文件夹 bootstrap → su 派发后紧接互动跑命令 → 日志无「未落盘」批量重复、`docs/audit/shell-gate.jsonl` 条目连续（17→1 行失败 + 1 行恢复；第 1 条物理不可恢复=fail-closed 应有残留）。

## 2026-10-15 — ORCHESTRATION-C-1 最终报告与安全历史消费

按批准A4/C2.tp1/consumer2，三源码接真实bound报告保存/ID恢复查询、治理透明代理、安全live与纯legacy投影；Window唯一enqueue，原模型text/图片不变，新显示副本不raw旁路。A4写证据与旧兼容同步。自身256/256、typecheck0；下游实际投递和真实桌面待属主。见[实施记录](docs/change/2026-10-15_change_report-provenance-consumer.md)。

## 2026-10-14 — 普通聊天不自动产生任务未报告回交

客户确认 revision 2 后实施：send 的 Pipeline 专用 handback.required 按 Core 真实ACK绑定 turnId；显式聊天覆盖旧 taskId，正式任务兜底与主动报告保留。跳过聊天仍清理本轮，未知真实轮次不借legacy。编排247/247通过，真桌面待测试角色复验。见[修复记录](docs/fix/2026-10-14_fix_chat-handback-scope.md)。

## 2026-10-13 — P1-4 CLI 产品定位：`ans role run` 帮助与启动提示如实指路（只做定位，不做能力补齐）

**来源**：产品提案 `角色卡/产品/docs/design/2026-10-13_design_desktop-ux-improvement-proposal.md` **§P1-4**，客户 2026-10-13 批准。**本轮只做定位 + 指路，不做任何能力补齐**；终端 y/n 确认通道、CLI 会话持久化、CLI 投递机——**提案明示均不做**（等定位被确认、且有真实 CLI 用户诉求再立项）。

**背景**：`ans role run` 走一次性路径（`runRole`）：不接 shell 闸（CLI 无确认框 ⇒ `run_shell` 不注册；`run-role.ts` 调 `deps.createAdapter(gate)` **不传任何 capabilities**；fail-closed 方向正确）、不传会话目录（一局即止）。缺的不是能力而是**定位**：此前没有任何一处告诉用户「这事该去桌面做」。

**改了什么**：
- **新 `src/common/编排/cli-positioning.ts`**——指路句**单一来源** `CLI_POSITIONING`：「本命令不提供 shell 与会话保持（一次性执行）；需要交互式治理会话请使用桌面应用。」（帮助输出与启动提示共用，防两处漂移；两点写实：不提供 shell/会话保持、桌面应用）。
- **`src/interface/cli/run.ts`**——新增 `-h`/`--help`：打印用法 + 指路句、**退 0**、不触配置、不开会话（测试钉工厂零调用、缺注入也可用）。既有解析/退出码路径逐字未动。
- **`src/pipeline/orchestration/run-role.ts`**——一次性会话启动提示处（「受治理工具集已建立」行之后）加**轻量一行** `record({ kind:"message", summary: CLI_POSITIONING })`：每场至多一次；不改变任何能力与判定；**用法错误路径不打印**（常规提示不打扰，测试钉住）。
- **报错路径结论（如实登记，任务书要求）**：一次性路径不传 capabilities ⇒ `run_shell` 根本不注册（`provider/pi/tools.ts` 结构性保证）⇒「调用 run_shell 失败」事件在编排/Interface 层**不存在、结构上不可改**；硬造（恒败桩工具/提示词夹带）是任务书明示的「不要为此硬造机制」——**不做**，指路由帮助 + 启动行承担。
- **跨角色登记（归装配，请 pm 转达）**：裸 `ans role run --help`（无 `--task`）被装配 `parseInvocation` 判「缺少 --task」的 unknown（退 2，到不了本命令）——装配在 `role run` 位形见到 `-h/--help` 时放行整段 argv 给 `runRoleCommand` 即可端到端生效（命令层已就位；`ans role run <角色> --task T-1 --help` 经现有路由**已实测可达**）。

**测试**：新 `test/编排/cli-positioning.test.ts` **6 例**——文案两点写实；`--help`/`-h` 各一例（退 0、含用法行与指路句、不开会话）；缺注入可用；启动恰一行；用法错误不夹带。**测试手法登记**：`captureStdout` 补丁必须**转发 + 记录**——`node --test` 的子进程上报协议帧同走 `process.stdout.write`，吞掉写入会吞掉测试计数（实测 6 例只计入 2 例；已按转发实现并注释）。

**结果**：`test/编排/` **188/188**（182+6，连跑 3 次稳定）；`npm run typecheck` **全仓零错**；全量 `node --test "test/**/*.test.ts"`（**引号带**）**948 计 / 945 过 / 2 红 / 1 skipped**——2 红均为**既有基线红**（`test/桌面应用/pi-config.test.ts` 面板键目录名、`test/项目管理/shared/path-primitives.test.ts` macOS `/var`）；**本角色零红**（首次全量运行曾另见 1 条桌面在飞快照 `queue-withdraw-lru.test.ts`〔P1-1/P1-2〕，复跑已自愈，与本改动零交集）。真实入口实测：`ans role run 编排 --task T-1 --help` → 0 含指路句；演示启动第 4 行为指路行、其余逐字不变。环境：Node v24.14.0、Darwin 25.6.0。未 git 操作、未重启桌面应用、未发真实模型请求。详见 [change 文档](docs/change/2026-10-13_change_cli-positioning.md)。

## 2026-10-13 — P0-1/P0-2 中环：句柄 `abort?()`（停当前轮次）与 `send` 透传图片

**来源**：产品提案 `角色卡/产品/docs/design/2026-10-13_design_desktop-ux-improvement-proposal.md` 的 **P0-1（图片随消息送进模型）** 与 **P0-2（跑飞轮次的「停」）**，客户 2026-10-13 批准。**前环（Pi适配器）已落并钉死契约**：`RoleSession.abort?`（可选；停当前轮不销毁会话、无在飞轮次=no-op、中止后 settled 仍发射、等待中的客户确认一并 fail-closed、错误如实上抛）与 `PromptOptions.images`；本改动为**中环**（编排句柄层），**桌面接线为后环**（停止按钮/聊天流如实一行/入队定格归桌面环节）。

**改了什么（唯一源文件 `src/pipeline/orchestration/run-role.ts`）**：
- **`RoleSessionHandle` 增可选 `abort?(): Promise<RoleSessionAbortResult>`（P0-2）**，`RoleSessionAbortResult = { ok, supported, error? }` **三态语义钉死**：会话有 abort ⇒ 透传、`{ok:true,supported:true}`；会话**不带 abort**（demo 替身）⇒ `{ok:false,supported:false,error:"当前运行时不支持停止"}`——**绝不假装已停**；SDK 报错 ⇒ `{ok:false,supported:true,error:<错误原文>}`——**不吞不谎报**（选择「结果承载错误」而非 reject：三态即调用方渲染依据，也避免未处理 rejection）。**不销毁会话**（下一条照发）。**可选方法之由**：同契约 `RoleSession.abort?` 自己的「PromptOptions 先例」——句柄面若必选会强制他角色既有替身桩（`test/桌面应用/**`，非本角色写入边界）全补实现；可选则消费规则与契约层同构（`handle.abort?.()`，**方法缺席与 supported:false 同一处理**），且 **openRoleSession 的句柄恒实现**（测试钉 `typeof === "function"`）。
- **`send` 扩为 `(text, opts?: PromptOptions)`（P0-1）**：`opts` **整包同一引用原样透传**给 `session.prompt(text, opts)`（`PromptOptions` 自契约家只读导入，**不复制形状**；**空数组=无图**同样原样）；**不传 opts 时单参调用形态逐字不变**（用例钉「恰 1 个实参」，比值相等更严）。多模态与否不猜（契约已明）；队列入队定格归后环。
- **其余逐字未动**；**只读核实**：pm-reviewer 的 `persistSession:false` 审读会话只消费 `send(text)`（单参）/`events`/`dispose`——加可选参与纯新增方法均不波及（见 change 文档）。

**测试**：新 `test/编排/session-abort-images.test.ts` **8 例**（桩适配器全程不触网）——abort 三态（异步透传＋不销毁＋下一条照发／同步 void 契约形状／缺席 supported:false 如实文案／SDK 报错 error 逐字／**假适配器端到端** supported:false）+ send 透传（opts 逐字相等**且同一引用**／空数组原样／不传 opts 恰 1 实参）。

**结果**：`test/编排/` **182/182**（174+8）；`npm run typecheck` **全仓零错**；全量 `node --test "test/**/*.test.ts"`（**引号带**）**927 计 / 924 过 / 2 红 / 1 skipped**——2 红均为**既有基线红**（`test/桌面应用/pi-config.test.ts` 面板键目录名、`test/项目管理/shared/path-primitives.test.ts` macOS `/var` 符号链接），单独复跑确认独立失败，**无新红**。环境：Node v24.14.0、Darwin 25.6.0。真机验收属后环接线完成后的**客户跑**。详见 [change 文档](docs/change/2026-10-13_change_p01-images-p02-abort-handle.md)。

**后环登记（归桌面）**：① 停止钮（仅工作中出现）调 `handle.abort?.()` 按三态如实呈现；② `session:send` 增 images（主进程重新校验）、`SessionManager.send`/`DeliveryItem` 带图入队定格、退役三处「未接线」提示行。

## 2026-10-12 — su 只读 shell（客户裁定「su 也要有 shell，但是只读」）

**来源**：客户裁定——内置治理角色 su 目前完全没有 shell（`run_shell` 不注册），给它一个**只读 shell**。设计口径已定：只读 = shell 闸 **(c) 层确定性白名单档的直接映射**——`classifyShell` 判 `allow`（命中 `allow:readonly:*`）⇒ 执行；`risky`/`review` ⇒ **一律拒**（新分支 `readonly-deny`，reason 写明命中档）；`deny` ⇒ 照旧拒（`c-deny`）。**不接 (b) su 模型审读**（su 自己就是审读者，不自审）、**不接 (a) 客户确认**（只读外的命令直接拒，不打扰客户、不弹任何对话框）。拒绝理由写死口径「这是 su 只读档的策略拒绝，不是环境故障」（让模型看懂、不诱导绕试）。

**改了什么**：
- **`src/common/编排/shell-gate.ts`**：`CreateShellGateOptions`/`ShellGateBuildDeps` 增**可选** `readonlyOnly?: boolean`（`buildShellGate` 透传；**缺省 false = 既有行为逐字不变**）；新增导出常量 **`BRANCH_READONLY_DENY = "readonly-deny"`**；`readonlyOnly === true` 时 `risky`/`review` 在进入 `runBA` 前直接返回 `readonly-deny`（(b)/(a) **结构性不可达**，即使注入也永不调用）；allow/deny 走既有 `c-allow`/`c-deny`；fail-closed 三退路语义不动。
- **`src/pipeline/orchestration/shell-arming.ts`**：新增 `AssembleReadonlyShellGateOptions`（钉死形状，**选项面无 (a)/(b) 注入点**）与 `assembleReadonlyShellGate`——复用「内置治理角色边界 → 审计边界」解析（抽为共享私有 `resolveGovernanceBoundary`，三层链与只读档**共用同一份**，行为逐字不变）组 `buildShellGate({ readonlyOnly: true })`；**不接 pmAsk、不接 operatorChannel**；`rules` 未注入 ⇒ 一律拒（fail-closed）。
- **`src/pipeline/orchestration/run-role.ts`**：`openRoleSession` 增 `shellReadonly?: Omit<AssembleReadonlyShellGateOptions, "project">`；arm 条件 =「给出即 arm」（装配失败 ⇒ 不 arm = `run_shell` 不注册）；`shellReadonly` 与 `shellOperatorChannel`/`shellArming` 同给 ⇒ **readonly 优先**（只读档执行集严格 ⊆ 三层链——更严的一档）；既有三层链路径逐字不变。⚠ **与任务书字面的一处偏差（如实登记）**：任务书 arm 条件字面写 `!suppressHandback && ...`，而 `suppressHandback === true` 恰是 su——按字面 su 永远 arm 不上，与「仅 su 的只读档」及客户裁定矛盾；实现按裁定为「给出即 arm、readonly 优先」（su 获 arm 与项目角色 readonly 优先两向测试钉住）。
- **顺带核查（只报告、未改）**：`real-adapter.ts::describeTool` 的 `run_shell` 文案是通用「过 ShellGate 审核、未获明确 allow 绝不执行」——**未把三层审核说死**，对只读档同样成立，**无需改动**。

**边界**：不改 `src/common/门禁引擎/**`（「`node --test` 不在只读白名单」是本任务接受的现状）、`src/provider/pi/**`、`app/**`、CLI 出口；审计仍落 `docs/audit/shell-gate.jsonl`（`execution` 恒「未执行」、命令逐字、分支如实；`by` 带「（su 只读档）」后缀使档位可辨识）。

**测试**：新 `test/编排/shell-readonly.test.ts` **8 例**（全部仅闸判定、绝不真跑命令）：四档映射（allow→执行 / risky、review→`readonly-deny`（reason 写明命中档）/ deny→`c-deny`）；**(b)/(a) 从未被调用**（一调用即抛错的桩 + 计数 0，四档覆盖）；`rules`/`classifyShell` 未注入 ⇒ 一律拒（fail-closed）；**真落盘** `docs/audit/shell-gate.jsonl`（逐字命令/branch/`execution` 恒「未执行」/conditions）；集成（门禁引擎实件）：`ls`/`cat`/`git status`/`node --version` 放行、`rm`→`readonly-deny`、`node --test`→`readonly-deny`、`sh -c`→`c-deny`；run-role：**su 给 `shellReadonly` ⇒ gate 到达 adapter**、su 不给 ⇒ 不 arm、**readonly 优先**（(a)/(b) 0 调用）、假适配器事件流端到端（denied + 「未执行」，无 accepted）。

**结果**：`test/编排/` **174/174**（166 + 8）；`npm run typecheck` **全仓零错**；全量 `node --test "test/**/*.test.ts"`（**引号带**）**901 计 / 898 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（桌面面板键目录名、pm shared macOS `/var`），**无新红**。环境：Node v24.14.0、Darwin 25.6.0。真机复验（su 实跑 `ls`/`git status` 类命令）属**客户跑**。

## 2026-10-12 — X-2 回交「每轮至多一份」+ 去重键去时间戳（handback 硬化）

**来源**：真机——适配器**每轮发两次 `settled`**（两个发射点；Pi适配器同刻修根因）⇒ `withHandback` 每读一个 settled 发一份回交 ⇒ 每轮两份；旧去重键含 `at`（毫秒差）⇒ 桌面判重失效 ⇒ **su 收到 7 份逐字相同的投递**。本改动为纵深防御。

**改了什么（`src/common/编排/handback.ts`）**：
- **`withHandback` 每轮至多一份**：轮次以**「settle 突发」**为界——「自上次回交以来是否出现新事件」置位判定；突发首份 settled 发回交并透传，其后重复 settled **仅透传**；其间有事件 → 新一轮照常再发。每份回交写 `round`（1 起）。**既有语义不变**：先回交后透传 settled；无 settled 不发回交。**残留如实登记**：两份 settled 之间若**夹事件**而实为同轮（根因在适配器），本层不合并（round 不同 ⇒ 键不同）。
- **`handbackKey` 改稳定键**：`<roleId>\0<taskId或空>\0<round或空>\0<内容哈希16位>`（SHA-256(`status\0summary\0evidence…`) 截 16 位，**不含 `at`**）。两类判定分工：**同轮重放/重复 settled ⇒ 恒等键 ⇒ 判重**；**新轮真返工即便文本逐字相同 ⇒ round 递增 ⇒ 键不同 ⇒ 照常各自投递**。`TaskHandback` 增**可选** `round?: number`（withHandback 写入；不进入 `renderHandbackPrompt` 文案）。
- **对桌面：零代码改动**——桌面只调 `handbackKey(hb)`（键内部形状透明）；`round` 可选字段不影响回交卡。**告诫（请 pm 转达）**：不得自行往键里拼时间戳/改用 `at`，否则两类判定一起打回原状。

**测试**：`test/编排/` **166/166**（+2；既有键用例改写）——双 settled 突发 → 恰一份回交、两份 settled 均透传、**次序（回交在第一份 settled 前）**保持、`round=1`；三连 settled 仍一份；**真返工**（两轮、报告文本逐字相同、其间有新事件且夹双 settled）→ 两份、`round=[1,2]`、**键不同**；稳定键各维断言（**同内容不同 `at` 恒等**——旧键失效的要害；round/角色/任务/摘要/证据/状态任一不同即不同）。

**结果**：`npm run typecheck` 本角色零错；全量 `node --test "test/**/*.test.ts"`（**引号带**）**889 计 / 886 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。真机复验（双 settled 消失、无重复投递）待 Pi侧根因落地后属**客户跑**。

**跨角色**：Pi适配器——每轮 `settled` 单次发射（根因侧）；桌面应用——无需改码（键使用告诫见上）。

## 2026-10-12 — R-1 修 shell 闸 (b) 审读「恒不可解析」：结论改由工具交回（客户：不应该按 json 解析）

**来源**：真机实测——角色跑 `node --test`（只读/测试类）被闸拒；su 在真机诊断「(b) 审读恒为输出不可解析」；客户裁定「**不应该按照 json 解析**」。

**根因（真机证据，只读核对）**：旧路径要求审读模型**在正文写 JSON**。playground 的 su 会话 JSONL 中 37 个审读轮 **35 轮模型轮直接网关 500**（`500 … unknown variant 'tool_removal'`——su 会话**历史**含网关不认的块，整段重发即被拒），助手消息 `content: []`、`stopReason:"error"` ⇒ `extractMessageText` 只抽 text 块得空串 ⇒ real-adapter 的 `text.length > 0` 守卫**不产 message 事件** ⇒ `defaultExtractReply` 拿空串 ⇒ **恒不可解析**（M-2 后恒 `b-unparseable-deny`）。审计 84 条旁证：`b-unparseable-deny ×24`、`b-badjson→a-allow ×9`（M-2 前——客户被迫按 9 次放行，正是「不用发给我」的来源）、`b-unavailable→a-allow ×7`、`c-allow ×31`、`c-deny ×2`、`no-classifier ×9`。**su 的怀疑核实**：取字段没取错（有正文的轮 `summary` 即模型原文）；断点是**错误轮 content 空 ⇒ 该事件根本不产生**。

**改了什么（编排 Section 1 内）**：
- **`src/common/编排/shell-gate.ts`**（形状单一来源）：`SHELL_VERDICT_TOOL_NAME = "report_shell_verdict"`；`ShellVerdictPayload { verdict: "allow"|"deny"|"unsure"; reason? }`；`ShellVerdictFn`；`normalizeShellVerdict`（取值域防御）。
- **`src/pipeline/orchestration/pm-reviewer.ts`**：**主路径 = 工具调用**——审读会话注入 `shellVerdict`（「注入才注册」；Pi适配器据此注册工具）；模型调工具 → 本层捕获 → **序列化 JSON 交回**（**构造保证可解析**）。提示词：首选且唯一结构化通道 = 调工具；正文 JSON 仅降级。**降级保留**：`defaultExtractReply` + 围栏剥离/取首个 `{}`（模型不调工具时零成本兜底）；**两手都无 ⇒ M-2 直拒不变**（不升 (a)、不打扰客户）。**审读会话不持久化**（固定 `persistSession:false`）：不恢复用户 su 会话的坏历史（500 诱因之一）、不污染其聊天记录。
- **`src/pipeline/orchestration/run-role.ts`**：输入增 `persistSession?: boolean`（缺省 true 不变）与 `shellVerdict?`；`AdapterCapabilities.shellVerdict`；工厂原样转发。

**测试**：`test/编排/` **164/164**（+4）——`shell-review-chain.test.ts`：工具四路（**review+allow 放行不打扰 / deny 拒 / unsure 升 (a) / risky 升 (a)**；断言审读会话 `persistSession===false` 且注入 `shellVerdict`）／工具参数非法 → **`b-unparseable-deny`**／降级路径正文 JSON（含围栏）仍解析；`shell-arming.test.ts` **端到端**：**真 `openRoleSession` + 真实 `assembleProjectShellGate` + 夹具模型经 `shellVerdict` 交回** ⇒ review 类命令**放行且不打扰客户**、审读会话无 `sessionDir`。

**结果**：全量 `node --test "test/**/*.test.ts"`（**引号带**）**863 计 / 860 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（桌面面板键目录名、pm shared macOS `/var`），全仓其余全绿（测试角色 t9 旧断言已随其自查更新）。`npm run typecheck`：**本角色 1 处瞬时红**——`run-role.ts` 转发 `shellVerdict` 而 Pi侧 `PiRuntimeAdapterOptions` 尚未加该可选字段（落地即消解；**未用类型断言绕过**）。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。

**报告必答**：判定来源＝工具 `report_shell_verdict{verdict,reason?}` 经 `shellVerdict` 能力交回的结构化结论；**修后角色能否自跑 `node --test`** ＝编排链证据已证「review→工具 allow→放行」（前置：Pi适配器注册该工具；另因审读会话不再恢复污染历史，真机 500 诱因随之解除）——**预计可自跑，真机复验属客户跑**；**文本解析兜底保留（降级）**，理由：零成本覆盖不调工具的模型，且不改变「两手都无 ⇒ 直拒」的 M-2 策略。

**跨角色（请 pm 转达）**：**Pi适配器**——① `PiRuntimeAdapterOptions` 增 `shellVerdict?`（消解本角色那 1 处瞬时类型红）；② 注入时注册工具 `report_shell_verdict`（schema：verdict 三值必填 + reason 可选；handler 只调能力、如实回执；不入 `GOVERNED_WRITE_TOOLS`）；③ 顺带核实网关 `tool_removal` 500。桌面无需改动（不可解析类不会再弹框——M-2 不变）。

## 2026-10-12 — M-2 shell 审读「不可解析」不再打扰客户：直接 fail-closed 拒绝 + 提示收紧

**来源**：真机首跑暴露——(a) 层对话框弹「pm 判定 JSON 不合法」；客户：「**json 不合法的问题，就不用发给我了。**」＋补充裁定「**直接拒绝就行了**」（明确**不重试**）。

**改了什么**：
- **`src/common/编排/shell-gate.ts`**：**删** `BRANCH_B_BADJSON`（旧「升 (a)」语义）；**新增稳定枚举**——归因码 `BRANCH_B_UNPARSEABLE = "b-unparseable-deny"` + **一一对应**的固定短句 `REASON_B_UNPARSEABLE = "审核未能给出明确结论，已按 fail-closed 拒绝；可换更简单的命令形式或稍后重试"`（**单一来源**；桌面 M-1 的「人话映射」**据码对号、别看文本猜**）。`runB` 解析失败（含剥围栏/取首个 JSON 后仍非法）⇒ **直接终结拒绝**（`conclusion: deny`、`by: pm:输出不可解析`）——**不进 (a)、不重试、不打扰客户**；`BOutcome.deny` 增可选 `branch` 覆盖位（缺省仍 `b-deny`）。
- **其它升级理由逐条不动**：(b) 明确判 **risky ⇒ 仍必过 (a)**；`b-unsure` / `b-unavailable`（无会话/报错）/ `b-timeout` ⇒ 升 (a)；`b-allow`（review）⇒ 终结放行；`b-deny` ⇒ 终结拒绝；c-*、a-* 全部保持。
- **`src/pipeline/orchestration/pm-reviewer.ts`**：提示侧收紧——「**只输出下列 JSON**（**不得夹带任何解释文字、不得使用代码块围栏**；**字段与取值域固定**：verdict 只能是 allow / deny / unsure；reason / sessionId / model 为字符串）」。**解析侧容错照旧**（`parsePmVerdict` 既有：剥围栏、取首个 `{...}`；新增链级测试钉住仍生效）。**无重试**（客户裁定）。

**测试**：`test/编排/` **160/160**（+1）——`shell-review-chain.test.ts` 重写「不可解析」用例（**pmAsk 恰 1 次**＝不重试、**operatorChannel 0 次**＝不进 (a)、`reason === REASON_B_UNPARSEABLE`、审计 `branch === "b-unparseable-deny"`、`conclusion === "deny"`）+ 新增「围栏包裹合法 JSON 仍解析 → `b-allow` 终结」；`shell-risky-order.test.ts`：risky + 不可解析 → **opCalls 0**、分支 `b-unparseable-deny`（原「升 (a)」断言删除）；`shell-arming.test.ts`：I-1 链上不可解析 → **operatorCalls 0**、fail-closed 短句在；unsure/超时升 (a) 断言保留。

**结果**：`npm run typecheck` 本角色零错；全量 `node --test "test/**/*.test.ts"`（**引号带**）**831 计 / 827 过 / 3 红 / 1 skipped**——3 红逐条：2 条**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）+ 1 条**测试角色旧断言**（`test/测试/t9-block3-pin-shell.test.ts:380-381` 仍断言 `b-badjson→a-*`；M-2 改判后待其更新——**请 pm 转达**；非本角色文件，未动）。**本角色零红**。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。真机复验（让 (b) 输出垃圾 → 客户不再被弹框）属**客户跑**。

## 2026-10-12 — L-1 每角色任务队列：派发受理回执单一来源；队列归属前端（不造第二套）

**来源**：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §L-1（客户：「每个角色如果正在工作，应该可以有个队列的概念，可以派发到队列里面去」）。

**队列归属结论：前端（桌面）持有**——H-1 已定「前端路由：未开会话→自动开；忙→排队；失败/超时→如实提示+保留」；现状核实：桌面投递机已实现（`app/desktop/session.ts` 按 `${projectRoot}\0${targetRoleId}` 的**到达序数组**、忙则积压、其 `settled` 后按序放行、E-1/H-1 **共用一套**、去重窗口）。编排新增队列即**第二套实现** ⇒ 不做；本层只统一**回执文案**并约定接口。

**改了什么（`src/common/编排/handback.ts`，一个纯函数）**：
- **`formatDispatchReceipt({ targetRoleId, sessionOpen, queuePosition? })`**——受理回执文案**单一来源**：
  - 忙：`已受理：目标忙，已入队（第 N 位）；受理 ≠ 完成。`（**位置口径** = 入队后在**本角色**队列中的序号（1 起、FIFO 按到达序），由队列持有方计算传入）；
  - 空闲/正在投递：`已受理：任务将投递给角色 <id> 的会话[（其会话未开——将自动开启）]；投递结果/失败会在其聊天流与 su 的聊天流如实显示（受理≠已完成）。`（按现状文案）；
  - **受理 ≠ 完成**两形态都写死；校验失败/去重等分支仍归路由实现如实填写。
- **事件外推（未新增任何冻结类型）**：入队 → 回执含**位置**；出队/投递成功/失败 → 桌面既有 `emitDeliveryNote` 系统行；完成 → 目标回交（E-1）。既有事件流已覆盖队列变化，本层不另立事件类型。

**测试**：`test/编排/handback.test.ts` **+2 例**（共 17）：回执两形态断言（忙含「入队」「第 2 位」「受理 ≠ 完成」；空闲「未开→将自动开启」分支与渠道文案）；**到达序假件驱动**（同一目标队列两条派发 → 位置 1、2；出队 A→B FIFO；清空后转空闲回执）。

**结果**：`test/编排/` **159/159**；`npm run typecheck` 本角色零错；全量 `node --test "test/**/*.test.ts"`（**引号带**）**820 计 / 815 过 / 4 红 / 1 skipped**——4 红逐条：2 条**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）+ 2 条**桌面在途**（`test/桌面应用/interface.test.ts:106`、`session.test.ts:43`——其「可见性」实现进行中）。**本角色零红**。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。

**跨角色（请 pm 转达）**：桌面 `routeDispatch` 受理回执切到 `formatDispatchReceipt`（一行；忙分支传目标队列长度+1）；`renderDispatchPromptLocal` 占位切到已落的 `renderDispatchPrompt`。

## 2026-10-12 — I-1 开放 shell：三层链装配与 arm（编排侧）

**来源**：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §I-1（客户裁定启用 V1 未接线的三层链）。**已知并接受**：V1 无 OS 沙箱——被放行命令的写入绕过写门禁（靠 (c) + su 审读守卫 + 逐条留痕）。

**改了什么**：
- **新增 `src/pipeline/orchestration/shell-arming.ts`**：`assembleProjectShellGate(opts)` 装配既有三层链——(c) `classifyShell`+规则集**注入**（未注入 ⇒ 闸一律拒绝，fail-closed；依 `shell-gate.ts` 既定架构「规则集内容不属编排」）；(b) 既有 `pm-reviewer`，审读角色 = **`listProject` 枚举的内置治理角色**（缺省即 su；拿不准/判读非法/不可用 → 升 (a)；risky → **必过 (a)**）；(a) 前端注入 `operatorChannel`（关窗/不答/超时 = **不放行**）；审计边界 = 治理角色边界（`buildShellGate` 内建 `docs/audit/shell-gate.jsonl`，审计失败不翻转判定）。
- **`src/pipeline/orchestration/run-role.ts`**：`AdapterCapabilities` 增 `shellGate`；`openRoleSession` 增 `shellOperatorChannel?`（(a) 通道兼 arm 开关）与 `shellArming?`（高级注入）；**只对项目角色 arm**（su 自身不 arm；装配失败 ⇒ 不 arm = `run_shell` 不注册）；`createPiAdapterFactory` 改 `shellGate: capabilities?.shellGate ?? shellGate`（能力面优先，第二参保留兼容）。
- **核实并钉住既有件**：命令 cwd 钉项目根 = `real-adapter.ts:755` 已传 `shellCwd: opts.projectRoot`；spawn 剥离凭据 = `tools.ts::buildShellEnv`（删 `PI_CREDENTIAL_ENV_VARS`）——两项**既有**，本层未改、未另传。

**⚠ 跨角色依赖（如实登记）**：(c) 的实件在门禁引擎**私有 common**（`src/common/门禁引擎/classify-shell.ts`）——本角色**不导入**（§6；`shell-gate.ts:49` 预期的 `src/service/gate/` 公开再出口**尚不存在**）⇒ 生产 arm 暂缺合法 (c) 注入源（缺省 ⇒ 闸一律拒绝，fail-closed）。**待办**：门禁引擎经 service 公开再导出 `classifyShell`/`defaultShellRules`（一行文件），桌面经 `shellArming` 注入实件即全链可用——请 pm 转达。

**测试（全假件，绝不真跑命令；(c) 用门禁引擎实件——test/编排 域既有做法）**：新 `test/编排/shell-arming.test.ts` **5 例**：注入即注册/不注入不存在/**su 给了也不 arm**；(c) 硬拒（`sh -c`）→ 不执行且不打扰 (b)/(a)、白名单（`ls -la`）→ 直放；review+(b)allow → **可达且不经 (a)**、risky+(b)allow → **必过 (a)**、a 拒 → 不执行；(b) badjson/unsure → 升 (a)、(a) 不可用/超时（关窗等价）→ 不执行理由如实；留痕（审计 sink 每条请求一条：command/conclusion/branch/by/条件 `shell-gate`；事件流含 run_shell 的 tool_call 与 denied）。

**结果**：`test/编排/` **157/157**；`npm run typecheck` 本角色零错；全量 `node --test "test/**/*.test.ts"`（**引号带**）**800 计 / 797 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（桌面面板键目录名、pm shared macOS `/var`），全仓其余全绿。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。真实执行路径（真命令/真模型审读/真确认框）属**客户跑**。未碰 `src/provider/**`、`src/common/pi-adapter/**`、`app/**`、他角色 tests/docs。

## 2026-10-12 — H-1 su 派发任务：文案与判定口径的单一来源 + 能力透传（只给 su）

**来源**：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §H-1（客户「给 su 加一个工具，可以派发任务」）。契约家 `DispatchTaskPayload`/`DispatchTaskFn`（`src/provider/pi/session.ts:245-282`，Pi适配器已落）；**前端路由**（转目标角色会话一条输入/自动开会话/忙时排队/去重/失败保留）与**实时校验权威**归桌面；CLI 一次性前端不做同等路由（设计已登记）。**语义硬约束：派发 ≠ 授权**。

**改了什么**：
- **`src/common/编排/handback.ts`**（两个纯函数）：**`renderDispatchPrompt(req: DispatchTaskPayload)`**——派发文案**单一来源**（两前端共用）：`[派发] 来自 su 的任务（原因：…）` → `task` **原文逐字** → 「完成后请交回报告（改了什么/结论/证据）。」；**不夹带任何授权语义**；`roleId` 用于路由/校验、不进文案。**`isDispatchableRoleId(project, roleId)`**——「非本项目角色 / 指向 su 自身 → 如实回错」的**判定口径单一来源**（`project.roles` 登记为真；内置角色不进映射 ⇒ 自身自动 false；空/未登记 false，fail-closed）；**已登记快照注意**：`project` 为会话开启快照，su 本会话新建角色不在其中——校验权威在持有**实时清单**的前端（重建 project 再判，勿凭旧快照误拒）。
- **`src/pipeline/orchestration/run-role.ts`**：`AdapterCapabilities` 增 `dispatchTask?: DispatchTaskFn`；`openRoleSession` 增输入 `dispatchTask?`（前端路由实现），**只对治理角色（su）转交**（`suppressHandback ? input.dispatchTask : undefined`——项目角色会话即便误给也不注入）；`createPiAdapterFactory` 原样转发；CLI 不传 ⇒ `dispatch_task` 在 CLI su 会话中不注册（设计已登记）。**编排未加校验包装**：校验须对活的角色清单（快照会误拒 su 刚建的角）；口径由 `isDispatchableRoleId` 单一提供，前端路由以 `{ok:false, message}` 回执如实转达 su。

**测试**：`test/编排/handback.test.ts` **+3 例**：文案逐行（三行恰界/`task` 原文/多行含空行原样/无 reason 不写原因段/roleId 不进文案/**无授权字样反向断言**）；`isDispatchableRoleId` 五态（登记 true；su 自身/未登记/空/快照外 false）；能力透传（**su 拿到、项目角色不给（即便误给）、未给路由不注入**）。

**结果**：`test/编排/` **152/152**；`npm run typecheck` 本角色零错；全量 `node --test "test/**/*.test.ts"`（**引号带**）**780 计 / 775 过 / 4 红 / 1 skipped**——4 红逐条归因：2 条**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）+ 2 条**桌面在途**（`test/桌面应用/handback-delivery.test.ts:194/214`，其 E-1 投递实现进行中）。**本角色零红**。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。闭环端到端属**客户跑**。

## 2026-10-12 — G-1 客户确认不设超时（CLI 终端问答语义同步）

**来源**：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §G-1；客户裁定「交互工具的等待**不超时**」。归属：Pi适配器（去缺省等待上限；**客户输入挂起期间 prompt 硬超时不得掐断该轮**）＋**编排**（CLI 通道语义同步）＋桌面（卡片不再按时间过期）。

**核实与改动（唯一文件 `src/common/编排/operator-channel.ts`，仅注释 + 测试）**：
- **核实结论**：编排层对客户确认的等待**本就没有计时器**——`createCliCustomerInput` 的 `readLine` 一直等作答（无 `setTimeout`/无超时选项）；`runGovernSession` 一次性壳在等待期间**无任何编排侧时限**。
- **改注释**：头注原表述「超时由消费方包装（…交互工具的 `withTimeout`）」随 G-1 不成立，改写为：**客户确认制的终端问答不设超时**；**EOF（无人值守）→ `unavailable` → 未获同意——fail-closed 不变**（硬约束，绝不改成「等待」）。shell 闸 (a) 的 `createCliOperatorChannel` 与 `shell-gate.ts` 超时属**另一条链**（shell 审核，超时 = 拒绝），未动。
- **跨角色如实指出（未动其文件）**：真正会掐断「等客户作答」的两处在 **Pi适配器**（G-1 已派其修）：`provider/pi/tools.ts` 交互工具的 `withTimeout`（`ANS_PI_CUSTOMER_INPUT_TIMEOUT_MS`，缺省 110s）与 `real-adapter` 每轮 prompt 硬超时（缺省 120s）。**本报告日核实：两项尚未落地**——落地前真实端到端「长等客户」仍可能被 110s/120s 截断，属 Pi侧在途。

**测试**：`test/编排/confirmation-gated.test.ts` **+1 例**——`readLine` 延迟 250ms 后作答仍生效（确认与多选各一次，证编排侧不设时限）；EOF → `unavailable` 保留（既有用例）。文案未动。

**结果**：`test/编排/` **149/149**；`npm run typecheck` 本角色零错；全量 `node --test "test/**/*.test.ts"`（**引号带**）**757 计 / 753 过 / 3 红 / 1 skipped**——3 红逐条归因：2 条**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）+ 1 条**桌面在途**（`test/桌面应用/renderer.test.ts:406`，「交互卡严格投递所属 pane」——其 G-1/B 组实现进行中）。**本角色零红**。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。

## 2026-10-12 — E-1 回交投递文案的单一来源（`renderHandbackPrompt` + `handbackKey`）

**来源**：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §E-1（回交后的 su 验收；客户裁定**全自动**，不做开关）。投递/排队/自动开启 su 会话归**桌面应用**；本层只提供共用件。

**改了什么（`src/common/编排/handback.ts`，两个纯函数、无接线变更）**：
- **`renderHandbackPrompt(hb: TaskHandback): string`**——投递给 su 验收的**文案单一来源**：`[回交] 来自 <角色> 的报告（任务 <taskId，若有>）` → `结论：completed|blocked` → `摘要：<summary>` → `证据：`逐条（无则「（无）」）→ `请验收：确认通过 / 要求返工 / 上报客户。`。**明确请求验收、字段逐条、不夹带权限语义**（回交只搬任务与证据，不搬身份/写权——SKILL.md 交接语义）；**两前端共用，不得各写一份**。
- **`handbackKey(hb): string`**——**去重键构造单一来源**（§E-1「一条回交只投递一次，避免重放刷屏」）：`<roleId>\0<taskId或空>\0<at>`，同一份 `TaskHandback` 恒等；**登记与排队仍归前端**（本函数只算键）。

**未做（归桌面）**：投递本身、su 忙时排队与失败如实提示、su 未开自动开启再投递、去重登记；选装 **O-E1**（su 结构化记录验收结论）未获准未做。本层未引入任何开关（客户裁定的「全自动」）。

**测试**：`test/编排/handback.test.ts` 12 例（E-1 新增 2）——文案逐行字段断言 + 「请验收」存在 + 无 taskId 不写任务段 + 无证据呈「（无）」+ **无权限字样反向断言**；去重键恒等/差异断言（角色/任务/时间任一不同即不同）。

**结果**：`test/编排/` **148/148**；`npm run typecheck` **全仓零错**；全量 `node --test "test/**/*.test.ts"`（**引号带**）**744 计 / 741 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。真实端到端（回交→su 真验收）属**客户跑**。

## 2026-10-12 — D-1 会话自持目录接线（重启恢复的编排部分）

**来源**：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §D-1（重启恢复；**客户已定存储＝项目内**）。契约钉死：适配器新增可选 `sessionDir?: string`，约定路径 `<projectRoot>/.ans/sessions/<roleId>/`；Pi适配器同刻接线（其 `session.ts:415` 已落该选项）。

**改了什么（唯一文件 `src/pipeline/orchestration/run-role.ts`）**：
- 新私有 `sessionDirFor(projectRoot, roleId)`：约定路径（`path.join(projectRoot, ".ans", "sessions", roleId)` + 尾分隔符）；`projectRoot` 为空、或 `roleId` 不安全（空、含 `/`、`\`、`..`）→ `undefined`（**不传，旧行为**）。
- `openRoleSession`：`sessionDir` 随**既有能力面**转交——`AdapterCapabilities.sessionDir`（`deps.createAdapter(gate, capabilities)` 那条）；`createPiAdapterFactory` 原样转发。
- 一次性路径 `runRole`（`ans role run`）**不传**（一局即止，无恢复语义）。

**两个决策（「谁建、何时建」与清理）**：
1. **目录创建归适配器**（编排只算路径、**不预建**）——协调方建议编排 mkdir，我选允许的备选并给理由（已同步）：① 保 T32 起「**不预建 `.ans`**」的既有语义与断言（`govern-engine.test.ts` 断言 `ans govern <空目录>` 后 `.ans` 不存在，编排预建会打破它）；② 谁落盘谁建目录，避免「编排建了目录但会话从未写」的空目录（恢复 `open(path)` 亦不需预建）。本侧测试**反向断言** `openRoleSession` 后 `.ans` 不存在。**与 `.ans/project.json`（pin）互不干扰**（已逐条核对）：载入器只认该**文件**、`isGenesisState` 只看它；pin 校验只读 pin 路径；`listProject`/`repinIfBootstrapped` 只扫 `角色卡/`；manifest 只列 `角色卡//docs/`。
2. **上限清理（N=5）：本轮不做删除，登记待办**。理由：多进程并发（桌面开着同一项目跑 CLI `ans govern`）下按 mtime 删「最旧」可能删到**另一活会话正在追加写的文件**（POSIX unlink 静默孤儿、Windows 删失败）；一个会话可能多文件（压缩/branch_summary），按文件数裁会切坏内部一致性。**建议将来**：由适配器在创建新会话时清理「非当前会话且超龄者」（它知道 live 文件），或改按龄清理。

**不改什么**：恢复流程（解析最近会话→`open`→喂 `createAgentSession`；界面只读回放持久 entry）＝ Pi适配器/桌面；无 `sessionDir` 的一切旧行为逐字不变（含 `runRole`、空 `projectRoot`）。

**测试**：新 `test/编排/session-dir.test.ts` **5 例**——路径=约定值（含尾分隔符）且**不预建目录**（反向断言）／治理角色 **su 同样拿到**（「对每个角色」）／`projectRoot` 为空 → 不传／`roleId` 不安全（`su/../evil`）→ 不传且无目录／`runRole` 不传能力面。

**结果**：`test/编排/` **146/146**；`npm run typecheck` **全仓零错**（Pi侧 `sessionDir` 已落，无瞬时红）；全量 `node --test "test/**/*.test.ts"`（**引号带**）**731 计 / 728 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（桌面面板键目录名、pm shared macOS `/var`）。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。真机重启恢复属**客户跑**。

**待办登记（归他角色）**：`.gitignore` 建议补 **`.ans/sessions/`**（现只忽略 `.ans/runtime/`；会话 JSONL 含完整对话内容，不应入库——归装配/pm）；Pi适配器：目录创建确认（若其 `SessionManager.create` 不自动建父目录，补一行 mkdir）+ 清理方案；桌面应用：恢复流程与「能力集变化」提示。

## 2026-10-12 — C-1：交报告（`submit_report`）接入回交事件 + 回交证据只取写类（噪音修正）

**来源**：设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §C-1（客户裁定「**新增交报告工具**」）；Pi适配器同刻落地 `submit_report` 工具与 `ReportHandbackFn` 契约（`session.ts:203-244`，注入才注册）。

**改了什么（位置 → 改动）**：
- **`src/common/编排/handback.ts`**：① 新增 `TaskReport`（与契约家 `ReportHandbackPayload` **同名同型**——结构对齐、不导入其实现）与 `normalizeTaskReport`（形状校验：非法 status / 空 summary → `undefined`；`evidence` 类型错按缺失——**回退，不硬失败**）；② 新增 `buildReportHandback`——**模型交的报告即回交内容**（`status`/`summary`/`evidence` 取报告值，`evidence` 缺省 `[]`；`roleId`/`taskId`/`at` 编排补）；③ `withHandback` 增 `opts.report`——settle 时**报告优先**，**未见报告回退既有推导**（`buildTaskHandback` 逐字保留）；④ **证据过滤修正**（独立噪音缺陷）：证据由「所有 `accepted` 摘要」改为**只取写类**（新 `isWriteAccepted`：兼容仓内三处实际事件形状——假适配器 `detail.call.name` / 真实适配器「`${toolName} 执行完成`」摘要 / 装配演示「写入被允许…」摘要），`read_file 执行完成` 之类**读事件不再混入证据**。
- **`src/pipeline/orchestration/run-role.ts`**：`AdapterCapabilities` 增 `reportHandback`；`openRoleSession` **只给项目角色**注入（会话闭包暂存报告，settle 取用；经既有能力面 `createAdapter(gate, capabilities)` 转交），**治理角色 su 不注入**（不自我回交，既有语义）；`createPiAdapterFactory` 原样转发（Pi适配器据此注册 `submit_report`——「注入才注册」）；一次性路径 `runRole` 不涉及（本就不产回交事件）。

**为何**：以前回交摘要是 `settled` 的「会话结束」套话、证据混着读事件——「交给 su 的产物证据」一半是噪音，且模型想表达的结论（做了什么/为何 blocked）无处安放。现在报告即回交；未交报告的一切行为与以前一致（推导 + 只写类证据）。

**不改什么**：回交「只搬证据、不搬身份与写权」（SKILL.md）不变；`HandbackEvent`/`OrchestrationEvent` 形状不变（消费方零改动）；触发时机不变（settle 时先 handback 再透传 settled）；su 不自我回交不变。工具定义与桌面回交卡归各自角色。

**测试**：`test/编排/handback.test.ts` **10 例**（新增 5：证据三形状**正反断言**（含「读事件不得进证据」）/ `normalizeTaskReport`+`buildReportHandback` 单元（非法→回退、evidence 缺省 []）/ `withHandback` 报告优先（与推导相反也取报告）·未见报告回退 / `openRoleSession` 端到端（报告=事件值；未交→回退且读不进证据；非法报告→回退）/ su 不注入 `reportHandback` 且事件流无回交）。

**结果**：`test/编排/` **141/141**；`npm run typecheck` **零错**（含 `src/provider/**`——Pi侧先前的悬空引用已随其落地消解）；全量 `node --test "test/**/*.test.ts"`（**引号带**）**718 计 / 715 过 / 2 红 / 1 skipped**——2 红均为**既有环境红**（桌面面板键目录名、pm shared macOS `/var`），**全仓其余全绿**。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。真实模型「自己写报告」的行为属**客户跑**。**未碰** `src/provider/**`、`src/common/pi-adapter/**`、`app/**`、他角色 tests/docs。

## 2026-10-12 — 客户确认制（A-3）+ 删收口改自动收尾（A-4）：编排侧

**来源**：设计稿 `角色卡/项目管理/docs/design/2026-10-12_design_governed-interaction-and-chat-ux.md`（status: approved，客户确认 A+B 全做、**A 组先行**）；客户原话「**客户确定了才加，不要有个收口，收口去掉**」。本角色只读评估（接线点/F4 发行/删收口三问）已被采纳；**O-A1 内容漂移加固客户明确不采纳**。工具与契约（`CustomerInputFn`/两交互工具/`customerInput` 注入面）由 Pi适配器先行落地；交互卡由桌面应用做。

**改了什么（逐项）**：
- **`src/pipeline/orchestration/run-role.ts`**：`openRoleSession` 增 `customerInput`（前端原始通道）——给出即**确认制收窄**：writeSet **从空开始**；发行器把「已预览且校验在边界内的具体路径」追加进 writeSet（编排内存真状态，模型不可重算）；gate 照旧 `resolveWrite`，**F4 拒一切未确认路径**。删 `genesisFinalize`/`operatorChannel`/`confirmTimeoutMs` 与句柄 `settled`/`finalize`。适配器面：`deps.createAdapter(gate, capabilities?)`（新 `AdapterCapabilities`），`createPiAdapterFactory` 转发 `customerInput`——「注入才注册」先例照旧。
- **新增 `src/common/编排/confirmed-writes.ts`**（A-3 发行器）：保守正则从 title/preview/detail 提取路径 token（排除 URL/绝对/`..`/目录式；粗体·反引号可提取）→ 逐个用同一 `resolveWrite` 探测（`{writeSet:[p],conditions}`）→ 通过才发行；仅 `confirm`+`confirmed:true` 触发（choice 不发行）。`conditionSlugsOf` 单一推导。
- **`src/common/编排/finalize.ts`**：删「提议 + 确认」整段（`createSessionFinalizer`/`createFinalizeProposer`/`confirm`/`DEFAULT_CONFIRM_TIMEOUT_MS`/本地 `withTimeout`）；**保留** `finalizeBootstrap` 写入本体（逐笔经门、无可 pin 零副作用）；`repinIfBootstrapped` **扩为含首次**：创世态 = 首次自动收尾（`.ans`+治理边界文档+manifest），非创世态 = 重 pin（不重写治理边界文档）。
- **`src/pipeline/orchestration/govern-session.ts`**：`GovernSessionInput` 删 finalize 三件套、增 `customerInput`；句柄/结果删 `settled`/`finalize`；`runGovernSession` 删 finalize 段、缺省补 `createCliCustomerInput()`；`buildGovernPrompt` 写入确认制流程（**先预览（含将要写出的路径）→ confirmed:true → 才写**）。
- **`src/common/编排/operator-channel.ts`**：新增 `createCliCustomerInput`（确认 y/n/是；选择数字序号单选 `1`、多选 `1,3`；空/未识别 → declined；EOF → unavailable——fail-closed）、`parseChoiceInput`（越界/重复/数量不符 → 拒）、`formatCustomerInputPrompt`。原 `createCliOperatorChannel` 保留（shell 闸 (a)）。
- **`src/interface/cli/govern.ts`**：删 `genesisBootstrap ⇒ finalizeBootstrap: true` 的 arm；`operatorChannel` → `customerInput` 透传。**每次 `ans govern` 都是确认制**（缺省 CLI 终端通道）。

**为何**：客户要「确认了才加」——闸语义落在既有 **F4**（不造票据：票据可由公开输入重算、证明不了审核发生）；收口的「提议+确认」与 A-1 工具族是同一件事的两套说法，删前留后；写出的产物（pin/正式态）保留**自动收尾**，否则项目永不转正、`ans govern` 每次重拿创世授权。

**注册洞（如实）**：内容漂移关不住（O-A1 未采纳）——只保证「**路径**已预览且已确认」；预览未列路径 ⇒ 不发行 ⇒ 写被 F4 拒（fail-closed）。已在 `confirmed-writes.ts`/`run-role.ts` 头注 + change 文档登记。

**测试（本角色）**：重写 `test/编排/finalize.test.ts`（自动收尾语义：首收/守卫零副作用/自动重 pin/单元）；删 `test/编排/genesis-finalize-reach.test.ts`、`test/编排/govern-finalize-wiring.test.ts`（其 API 已删）；新增 `test/编排/confirmation-gated.test.ts` 12 例；更新 `test/编排/govern.test.ts`、`govern-engine.test.ts`（确认脚本 + caps 转发）。

**结果**：`test/编排/` **136/136**；`npm run typecheck` **本角色零错**（19 处剩余全在在途角色：`app/**` 6、`test/桌面应用/**` 4、`test/测试/**` 8、`test/装配/**` 1）；全量 `node --test "test/**/*.test.ts"`（**引号带**）**714 计 / 698 过 / 15 红 / 1 skipped**——15 红逐条归因（**本角色零红**）：桌面 `finalize-wiring` 8（桌面正按 A-4 删其收口面，在途）、测试角色 `t9-block1-bootstrap` 3 + `cli-genesis-boundary` 1（用已删的 `settled`/`finalize`/`operatorChannel`）、装配 `govern-target` 第 7 例 1（脚本无确认直接写 → F4 拒；**其 120s 确认超时挂起已随收口删除消失**）、既有环境红 2（`test/桌面应用/pi-config`（目录名）、`test/项目管理/shared`（macOS `/var`））。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。真实端到端（su 真的先征询再写）属**客户跑**。**未碰** `src/provider/**`、`src/common/pi-adapter/**`、`app/**`、`test/桌面应用/**`、`test/测试/**`、`test/装配/**`、他角色 docs。

## 2026-10-12 — 创世收口接线：`ans govern <目录>` 的 bootstrap 在 CLI 真正走完（.ans + 治理边界文档 + manifest 落盘）

**来源**：客户批准本角色提案 `docs/fix/2026-10-12_fix_cli-govern-finalize-wiring.md` 的 **M1+M2**（含「M1 先落、装配随后调第 7 例」的协调顺序）。提案起因：装配 O1（外来目录 + 无 `.ans` 的回退配置补 `genesisBootstrap`）获准后，本角色受装配提案 `:150` 请求评估其对编排侧影响时**确诊**：su 从此能建角色，但收口在 CLI 下无任何入口可达。

**问题（已核对到源码）**：收口机制本身完整（`runGovernSession` 单轮 settle 后 `finalizeBootstrap===true` 才调 `handle.finalize()`；`finalize()` = 提议→挂起等确认→恰好 allow 才落盘），但把它接通的两处入口**都不存在**——① `governCommand` 从不传 `finalizeBootstrap`（接线前 `govern.ts:84-87`；`GovernDeps` 也无字段承载），全仓 `src/**`、`app/**` 无处置真（只有测试直调 `runGovernSession` 置真）⇒ `govern-session.ts:301` 在真实 CLI 里是**死码**；② 设计 §13.1 的 `finalize_bootstrap` 工具按「能力注入才注册」实现，而 `createPiAdapterFactory`（`run-role.ts:390-401`）从不注入它 ⇒ su 也无法在轮内主动提议。后果：`ans govern <空目录>` 里 su 写完角色卡后命令**退出 0**，但 `.ans`/`角色卡/governance-boundary.yaml`/`docs/bootstrap-manifest.md` 一个都不出现——项目永远停在创世态，**比报错更隐蔽**。

**改了什么（只动 Interface 一个文件）**：`src/interface/cli/govern.ts`——
- **arming**（`:113`）：`deps.project.genesisBootstrap !== undefined` 时向 `runGovernSession` 传 `finalizeBootstrap: true`。**判据只认**装配注入的该字段，**不重算**「目标目录≠自身 且 无 `.ans`」——那三个条件正是装配 M1+O1 设置它的全部前提（装配 fix 文 `:82-91`/`:110-118`），重算 = 第二份装配逻辑，违背「配置单一来源在装配」（`govern.ts:61-68`）。
- **可选 `GovernDeps.operatorChannel`**（`:44`，条件透传 `:115`）：缺省不传、机制不变（前端自动补 `createCliOperatorChannel()`）；注入面供测试确定性验证「确认→落盘／拒绝→零副作用」，与桌面经 deps 注入对话框通道同形。
- **为何不得无条件 arm**：不带目录时目标是 ans-cli 自身、演示配置 `gov.path` 非空 ⇒ `govPath` 指向门禁引擎边界，finalize 会试图把「治理边界文档」写到门禁引擎边界文件上；门禁前置全量求值会拒（零副作用），但命令会在 settle 之后从 0 转非 0——把正常入口弄红。

**新增测试**：`test/编排/govern-finalize-wiring.test.ts` 6 例——创世 arm→确认→真落盘（`.ans` pin-backed、acceptance = 「客户确认完成 bootstrap（operator:…）」、角色表含 X）／拒绝→不完成、零副作用、非 0／通道不可用 fail-closed／非创世不 arm（确认通道零调用）／无目录不 arm／`--role` 不影响 arm。全部临时目录、假适配器驱动、不发模型请求。

**跨角色（已按协调顺序实测）**：`test/装配/govern-target.test.ts:217-243` 第 7 例在本接线落地后**转红**（无确认通道 → **120s 确认硬超时** → unavailable → 非 0；断言 `EXIT_OK` 失败，实测 stderr「收口未完成：收口未获确认：客户确认超时（>120000ms）」）。**附加实测**：该例失败后其 `node --test` 子进程**不退出**（默认 CLI 通道的 readline 仍挂 stdin），整套收尾被拖住——装配随后在 deps 加一行 `operatorChannel` 放行桩（依赖本次新增字段）可同时消除「断言红/120s/挂起」三点。**未碰装配任何文件**。

**结果**：`test/编排/` **145/145**（+6）；`npm run typecheck` **0 错**；全量 `node --test "test/**/*.test.ts"`（**引号带**）含第 7 例不能自然跑完（上述挂起），复跑以 `--test-skip-pattern` 排除该例 → **686 计 / 683 过 / 2 红（均为既有环境红：`test/桌面应用` 面板键（目录名）、`test/项目管理/shared` macOS `/var`）/ 1 skipped**。环境：Node v24.14.0、Darwin 25.6.0、HEAD d933537。真实模型端到端（真 su 建角色→提议→确认）仍属**客户跑**。未发真实模型请求、未读 `.env`。

## 2026-10-11 — 去镜像：`FinalizeStatus` / `FinalizeResult` / `FinalizeBootstrapFn` 收归冻结契约家（单一来源）

**来源**：Pi适配器核查后派发，本角色**核实并执行**。此前三型由本角色定义在**私有** `src/common/编排/finalize.ts`，而 §4 冻结契约家 `src/provider/pi/session.ts`（Pi适配器 T36）**已逐字**声明同一份 ⇒ **一份契约、两处定义**——本项目一路在收敛的那类镜像（前两例为 operator 三型（T20→T21）、凭据常量 `atomicWrite`）。

**`src/common/编排/finalize.ts`**
- **删除**本地 `FinalizeStatus` / `FinalizeResult` / `FinalizeBootstrapFn` 三处定义；改为**从 `../../provider/pi/session.ts` 导入**（并入既有的 `OperatorChannelFn` / `OperatorPrompt` / `OperatorOutcome` import 块），并 `export type { FinalizeStatus, FinalizeResult, FinalizeBootstrapFn }` **再导出**以**维持本模块既有公开面（消费方零改动）**。
- 模块内用法（`SessionFinalizer`、`createFinalizeProposer` 返回型、`precheck`/`mkResult` 的 `FinalizeStatus`）**逐字不变**——只改来源。`FinalizeInput`（编排私有**输入**形状，非契约）**保留**，不在契约家、不属本次收敛对象。

**`src/pipeline/orchestration/{run-role,govern-session}.ts`**
- `type FinalizeResult` 的导入源由 `../../common/编排/finalize.ts` **改指** `../../provider/pi/session.ts`（唯一来源）；从 finalize.ts 的 import 中删去该类型项。

**为何「导入 + 再导出」而非只删**：同 T20→T21 先例——再导出**不产生第二份定义**（仍是单一来源），且令本模块公开面稳定、**不迫使任何消费方改导入**（桌面 `FinalizeResult` 本就自 `RoleSessionHandle["finalize"]` 派生，不受影响）。

**形状逐字一致、零行为变化**：普通结构类型，`FinalizeBootstrapFn` 仍可注入 Pi适配器 `finalize_bootstrap` 工具（结构类型保证）；无任何运行期差异。**未发现形状/依赖对不上的地方**。

**结果**：`test/编排/` **139/139**；`npm run typecheck` **零错误**；全量 `node --test "test/**/*.test.ts"`（带引号、走 Node glob）**677 通过 / 0 失败**（**未撞到**项目管理在查的 `test/项目管理/shared/atomic-write.test.ts` 并发 flake）。

## 2026-10-11 — 修 `test/编排/finalize.test.ts` 的时序 flake：等**确定性信号**（确认通道被调用），不再赌固定 20ms

**来源**：Pi适配器在查另一处 flake 时**顺带如实回报**（**未动**本角色文件）——`test/编排/finalize.test.ts:158`「提议挂起」用例 `await tick()`（20ms）后即断言「确认通道已被调用」，是一个**独立于其根因**的时序 flake。落点在本角色边界内（`test/编排/finalize.test.ts`）。

**为什么这值得修**：随机失败比稳定失败更严重——稳定的失败会有人去修，随机的会被当噪声忽略，从而把真 bug 藏住。且该 flake 的形态（**等一个固定时间再断言某件事发生过**）本身就是错的：它赌「20ms 足够」，而这句话**永远只是概率**。

**复现（确证根因，非推测）**：全量套件 + 24 个并行实例同跑（制造 CPU/fs 争用）→ **24 次中 2 次失败**，失败断言正是 `应已提出「su 提议收口」（走确认通道）`（`ch.prompts.length===1` 不成立）。对照：串行/低载下多次运行均不失败——与「概率性」吻合。

**根因**：`handle.finalize()` 抵达确认通道前要做**若干次真实 `fs` 异步操作**——`isGenesisState` 的 `stat`、`precheck`→`scanRoles`（`readdir` + 逐角色 `firstExistingFile`/`isFile` 的 `stat`）——然后才在 `confirm()` 里调用 `ch.fn(prompt)`。断言打在**调用 `finalize()` 后恰好 20ms**；受 CPU/fs 调度影响，那串 I/O 可能超过 20ms，此刻通道**尚未被调用** ⇒ 假失败。

**修法（首选「等信号」，不加重试、不加大 sleep）**：`deferredChannel()` 本就有「通道被调用」的可等待点（`prompts`/`fn`），给它加一个**确定性完成信号** `called: Promise<void>`——`fn` **首次被调用**即 resolve。测试把 `await tick();` 改为 `await ch.called;`：语义等价（等的是「通道真被调用」这一事件本身）、且**确定**，不再依赖时间。删去仅此一处使用的 `tick` 辅助。**信号之后零副作用断言仍成立的确定性保证**：此刻 `finalize()` 正 `await` 那个**未 resolve** 的 `p`（挂在 `confirm`），故 `.ans`/治理边界文档/manifest **必未写出**，用例随后的三条「未确认前不得写」断言确定成立（强于原 `tick`——原写法可能在通道还没被调用时就已断言）。

**边界内其余「等固定时间再断言」扫描**：`test/编排/` 全域仅此一处 `tick()`/`setTimeout`（已除）。另两处 `new Promise(() => {})`（`finalize.test.ts:268` 与 `shell-*.test.ts`）是**刻意的「永不返回 → 触发超时」**用例（等的是**超时机制**、非时间赌），确定性、非 flake——**如实登记，不属本类问题**。

**结果**：`test/编排/` **139/139**（连跑 5 次）；`npm run typecheck` **零错误**；全量 `node --test "test/**/*.test.ts"`（**带引号、走 Node glob**）**连跑 5 次：671 通过 / 0 失败**。修后同条件压力复测（30 并行实例 + 全量同跑）：**0/30 失败**（修前同条件 2/24 失败）。注：全量条数较本任务最初观察（657）上移至 **671**——系**其他角色并行**落其各自 flake 修复（Pi适配器 `fs-write.ts`、pm `env-file.ts`）所增，**非本角色**所致；本角色文件用例数不变（14）。

## 2026-10-11 — T41：三层次序支持 `risky`——**`risky` 必过 (a)（b 判放行亦然）**；`review` 仍「b 明确即终结」

**来源**：客户裁定（2026-10-11，设计 §14，**部分推翻 §7.3「危险即硬拒终结」**）——危险命令（`rm` 这类）不再一概终结：「先过 (b) pm 审读，**无论 pm 怎么判，都还要过 (a) 你本人**」＝**「pm 不是终审，你才是」**。T40 已把门禁引擎 (c) 改成四态（`allow | deny | risky | review`）并重划硬拒名单；本任务（编排）接上三层链对第四档 `risky` 的**次序与终结**。落点全在本角色边界内（`src/common/编排/shell-gate.ts`、`test/编排/`）。

**改了什么**

1. **`decide` 按四态分派**（`src/common/编排/shell-gate.ts`）：`allow`/`deny` 仍 c 层**终结**、**不进 (b)/(a)**（硬拒不可翻案不变）；`review` 与 `risky` 走**同一条** `runBA` 入口——**唯一差别是新增形参 `mustPassA = (detail.decision === "risky")`**。

2. **`runBA` 实现次序表（§14.2 要害）**：
   - **(b) 判放行**：`mustPassA`（risky）→ **升 (a)**（`runA`，分支成 `b-allow→a-allow` / `b-allow→a-deny` / `b-allow→a-unavailable` / `b-allow→a-timeout`）；否则（review）→ **终结放行**（`b-allow`，不打扰人）。
   - **(b) 判拒绝**：两档同 → **终结拒绝**（`b-deny`，**不打扰人**——risky 下 (a) 也**不**被调用）。
   - **(b) 拿不准/无会话/超时/报错/JSON 非法 → 升 (a)**：两档同（`runB` 原有逻辑不动）。
   - **(a) 放行 → 放行；拒绝/超时/不可用/未接 → 拒绝**：fail-closed 三退路**逐字保持**。

3. **新增分支常量 `BRANCH_RISKY_NO_BA = "risky-default-deny"`**：`(c)=risky` 且 **(b)/(a) 均未接入** → **默认拒**（fail-closed：risky **必过 (a)**，a 缺席即拒）。原 `review-default-deny`（review 的 (c)-only 默认拒）**不变**。头注释重述为「四态 §14.2 次序表」，并点明 risky 的设计前提（程序名在 argv 可见、客户看原文看得懂）与「re-shell/内联求值根本不到本层」。

**未改的契约（回归保证）**：`allow`/`deny` c 层终结、硬拒不可翻案、(b) 各失败路径升 (a)、(a) 各失败路径拒、(c) 规则集加载失败/无分类器/分类抛错/整体超时 → 拒——**均逐字保持**（既有 `test/编排/{shell-gate,shell-review-chain}.test.ts` 全绿佐证）。

**测试（`test/编排/shell-risky-order.test.ts`，新增 20 条，**逐行覆盖 §14.2 那张表**）**
- 表行 1 `allow` → 放行、**不进 (b)/(a)**（桩计数为 0）；行 2 `deny` → 终结拒、**不进 (b)/(a)**。
- 表行 3 `review`：(b) 放行 → **终结放行（(a) 未调用）**；(b) 拒绝 → **终结拒（(a) 未调用）**；(b) 拿不准 → 升 (a)，(a) 放行/拒绝 → 放行/拒。
- **表行 4 `risky`（要害）**：**★ (b) 放行 + (a) 拒绝 → 最终拒绝（(a) 被调用，证 pm 非终审）**；(b) 放行 + (a) 放行 → 放行（(a) 被调用）；**★ (b) 拒绝 → 终结拒绝、(a) 未被调用（不打扰人）**；(b) 拿不准/无会话/超时/JSON 非法 → 升 (a)；(a) 不可用/未接/超时 → 拒。
- **★差别证明**：同一 (b) 放行下，`review` → 不打扰人（(a) `opCalls=0`）；`risky` → 必过 (a)（`opCalls=1`）。
- **(c)-only**：`risky` → `risky-default-deny`；`review` → `review-default-deny`（未因本轮改动而变）。
- **集成（T40→T41 端到端，用门禁引擎真 `classifyShell`）**：`rm -rf build`=risky → (b) 放行 + (a) 拒绝 → 最终拒绝；`sh -c "rm -rf /"`=deny → 终结拒、(b)/(a) 未被调用（re-shell 仍硬拒）；`ls -la`=allow → 放行、不进 (b)/(a)。

**结果**：`test/编排/` **139/139**；`npm run typecheck` **零错误**。**全量 `node --test "test/**/*.test.ts"`：653 中 652 通过 / 1 失败**——唯一失败仍是 `test/测试/t9-block3-pin-shell.test.ts:248`（**测试角色边界**：断言 `rm -rf build` 硬拒，而 `rm` 现已是 `risky`；**若已接 (b)/(a) 则放行，故断言失败**）。**不属本角色、未动、如实回报**（待测试角色按 §14 新语义更新）。

## 2026-10-11 — T37：finalize 语义改造——**提议收口 → 客户确认 → 才完成**；pin 首次在确认时写、其后每轮 settle 自动重 pin

**来源**：客户裁定（2026-10-11，设计 §13，**推翻 T33/T36 的「被调用即完成」**）——「完成 bootstrap 应该是 su 主动觉得差不多了来完成；后面 su 可以动态增加和修改」+「当然需要客户确认了」。落点全在本角色边界内（`src/common/编排/finalize.ts`、`src/pipeline/orchestration/{govern-session,run-role}.ts`、重写 `test/编排/{finalize,genesis-finalize-reach}.test.ts`）。

**改了什么**

1. **finalize 语义＝「提议收口、挂起等客户确认」**（**不再「被调用即完成」**，与 shell 闸 (a) 同构）。`createSessionFinalizer`/`createFinalizeProposer` 的 `finalize()` 现在：守卫 → **su 主动提议**（构造一个 `OperatorPrompt`）→ **经注入的 `operatorChannel` 挂起问客户** → **恰好 `allow` 才落盘**。**复用 shell 闸那套 `OperatorChannelFn`/`OperatorPrompt`/`OperatorOutcome`（§4 冻结契约家 `src/provider/pi/session.ts`）、不造第二套确认机制**。**fail-closed**：通道缺省/不可用/超时（默认 120000ms）/客户拒绝 → **不完成**，返回 `status`（`declined`/`unavailable`）与给 su 的 `message`（如「收口未获确认」）。

2. **守卫**：**非创世态**（`.ans/project.json` 已存在）调用 → **拒绝**（`status:"not-genesis"`，不是静默）；会话**尚未 settle** → 拒绝（`blocked`）；**无可 pin 之物**（既无角色 boundary.yaml、也无既存治理边界文档）→ 拒绝（保留既有）；门禁拒 → 拒绝（`blocked`）。**前置预检**在「提议之前」先跑（无可 pin / 门禁拒 → **不打扰客户**，不发确认请求）。

3. **pin 更新时机（§13.3）**：
   - **首次**：**只在客户确认通过时**才写 `.ans`（**此前不写**——否则项目在确认前就变正式态，确认失去意义）。`repinIfBootstrapped` 在**创世态返回 `undefined`（不写）**，保证这一点。
   - **其后**：**每轮 su 会话 settle 后自动重扫**（`openRoleSession` 的 `events()` 在 `settled` 前调 `repinIfBootstrapped`；**仅非创世态**，缺省对**内置治理角色（su）会话**开启）→ 重扫各角色边界 + 治理边界 → 更新 `.ans` 的 pin + manifest。⇒ **客户加一个角色，pin 不会过时**。
   - **如实标注的取舍（篡改检测窗口）**：pin **自动刷新** ⇒ 它钉的是「**每轮结束时的边界面**」，**不是一个钉死不动的篡改检测**。对**外部（非经 su 会话）**的边界改动，**下一次 su settle 会吸收进 pin**——**tamper 检测窗口 = 到下一次 su settle 为止**。已写入 `finalize.ts` 头注释与 base manifest。

4. **治理边界文档真被写出（§13.2，自终止松绑）**：**首次（确认）finalize 现在写出 `角色卡/governance-boundary.yaml`**（此前 T33 **只写 `.ans`+manifest，从未写这份文档**——已核实并补齐）。内容＝三个**普通目录**（`角色卡/`、`docs/`、`.ans/`，root project、**无 slug**）。`.ans` 的 `governanceBoundary.path` 指向它 ⇒ `resolveBoundarySection` 走**项目覆盖** ⇒ su 的边界＝这份文档 ⇒ **收口后 su 仍能加/改角色**（不再被创世自终止挡死），但**仍非 blanket**（写集只有这三个目录，`src/` 仍拒）。自动重 pin **不重写**该文档（`writeGovernanceBoundaryDoc:false`），不覆盖 su 的增改。

5. **接口（供 T36/Pi适配器接）**：新增导出 `FinalizeBootstrapFn = (opts?:{acceptanceSource?;now?}) => Promise<FinalizeResult>`——**调用即提议收口并等确认**；`FinalizeResult` 增**可选** `status`/`message`（保持向后兼容：`app/desktop/session.ts` 的字面量仍编译）。`RoleSessionHandle`/`GovernanceSessionHandle` 的 `finalize` 语义随之变为提议+确认+落盘。

6. **CLI 前端**：`runGovernSession` 在未注入时默认 `createCliOperatorChannel()`（终端打印「su 提议收口」并读一行）；不可用（EOF）→ 不完成。`GovernSessionInput`/`openRoleSession` 增 `operatorChannel?`/`confirmTimeoutMs?`/`autoRepin?`（均**可选**，不破坏冻结契约）。

**测试（`test/编排/`，重写 2 文件，系统临时目录、用后清理）**
- finalize.test.ts：提议挂起（未确认前**零副作用**、不完成）；确认通过→完成（写治国边界文档[三普通目录]+`.ans`(pin 与实算一致)+manifest）；**拒绝/超时/通道不可用→不完成且零副作用**；**非创世态→拒且不覆盖既有 `.ans`**；**负例：条件目录无条件下 → 门禁前置预检即拒、`channelCalls===0`（不打扰客户）且零副作用**（证明确认前的每一笔写都过 `resolveWrite`）；单元 `finalizeBootstrap` + `isGenesisState`；**自动重 pin：确认后加角色 → 下一轮 settle 后 pin 自动纳入**；自终止松绑（收口后 su 仍可写 `角色卡/`、`src/` 仍拒）；CLI 前端放行/拒绝两条。
- genesis-finalize-reach.test.ts：桌面路径（`openRoleSession`）可达性、未 settle / 非创世态守卫、未注入通道 fail-closed、向后兼容、自动重 pin。

**结果**：`test/编排/` **119/119**；`npm run typecheck` **零错误**。**全量 609 通过 606 / 失败 3**——3 条**均在他人边界**（`test/桌面应用/finalize-wiring.test.ts` 2 条、`test/测试/t9-block1-bootstrap.test.ts` 1 条），**根因＝它们调 `finalize()` 未接确认通道、按旧「被调用即完成」断言**，实得「收口未获确认：未接入客户确认通道（unavailable）」——正是本任务 fail-closed 的预期行为。**修复归 T38（桌面接线确认通道）/ T39（测试）**，本角色越界不碰、如实回报（见 memo）。

## 2026-10-11 — T36：创世 finalize 接入**桌面实际走的那条路**（`openRoleSession`）+「何时 finalize」裁定

**来源**：测试角色的 T35 **用户入口验收**抓到——`app/desktop/` 全程无 finalize 调用。此前 finalize 只挂在 `GovernanceSessionHandle`（T33），而桌面走 `openRoleSession`（`app/desktop/session.ts`），**根本没有那个句柄** ⇒「导入空文件夹 → su 建角色」走完后**没有 pin**，项目只剩桌面「运行期同意」例外——与客户已确认的「**保留 finalize + pin**」相反。落点全在本角色边界内（`src/common/编排/finalize.ts`、`src/pipeline/orchestration/{run-role,govern-session}.ts`、新增 `test/编排/genesis-finalize-reach.test.ts`）。

**改了什么**

1. **单一机制（不 fork 实现）**：`src/common/编排/finalize.ts` 新增 `SessionFinalizer` + `createSessionFinalizer(input, isSettled)`——把「未 settle → 拒」前置守卫 + 转调 `finalizeBootstrap` 收敛为**唯一实现**。两处前端**共用同一份**：`RoleSessionHandle.finalize`（桌面路径）与 `GovernanceSessionHandle.finalize`（CLI/治理会话路径，T33 的内联守卫改为委托它，**行为逐字不变**）。`finalizeBootstrap`（判定/落盘）仍是唯一下层实现。

2. **可达性（确定性接口）**：`openRoleSession` 增**可选**入参 `genesisFinalize?: boolean`；置真时返回的 `RoleSessionHandle` 附带**可选** `settled` + `finalize(opts?)`。授权边界取**本会话解析出的边界**（创世态下即治理种子边界＝T31 的普通目录种子）——与 su **同一授权**；finalize 的写**仍经 `resolveWrite`**（不绕门）。**不破坏冻结契约**：纯**可选**成员，未开启时句柄形状与行为逐字不变（T36 测试④钉死）。治理边界文档落点对「项目未声明（桌面创世 `path` 为空串）」用默认约定路径（`governanceBoundary?.path || DEFAULT`，`govern-session.ts` 同处 `??` 改 `||`，修正空串把落点错解为项目根而漏 pin 治理边界的隐患）。

3. **时机裁定＝显式（manual）**：`genesisFinalize` 只**暴露能力**、**不自动跑**。理由：
   - **不会 pin 到半成品（①）**——su 建角色可能多轮，而**每轮都 settle**；若「settle 就 finalize」，第 1 轮后即 pin 出「只有部分角色」的 `.ans`。裁定改成**由「知道 bootstrap 已完成」的消费者显式调用**：完成与否**只有用户知道**，是唯一的可靠信号源。守卫栈＝`settled ≥ 1 轮`（su 没写过 → 拒）＋`finalizeBootstrap` 的「无可 pin 之物 → 拒」。
   - **用户怎么知道完成（②）**——**由用户断言**：桌面在 su 会话上加一个「**完成 bootstrap（写入 pin）**」动作，调 `handle.finalize()`，把返回的 `FinalizeResult`（ok/wrote/pins/roles）如实呈现。入口与文案归**桌面**（本任务只定接口与语义，见报告）。
   - **多轮建角色 × 写出 `.ans` 即自终止（③）**——`resolveBoundarySection` 对治理角色的**创世分支**在项目治理边界文档写出并经 pin 接受后即**永不求值**（项目覆盖先命中，结构性自终止）。故**多轮 su 建角色必须全部发生在创世态内**，而 finalize 是 bootstrap 的**最后一步**：多轮都在 finalize **之前**（手动触发点之前）完成，自终止只关「写完之后**再开的新会话**」，不影响本次已完成的 bootstrap。T36 测试⑤钉死自终止：`.ans` 写出后，无 `genesisBootstrap` 的重开项目里 su 写**新角色**被拒，而既有角色 X 按其被 pin 的边界仍可写。
   - **为何不取「每轮 settle 重跑（自愈）」**：会话中途关掉即留下半成品 `.ans`，且新会话因自终止无法续建——结构上不安全。**为何不取「首次出现角色（`hasRoles:false→true`）」**：那在第 **1** 个角色出现时触发，多角色 bootstrap 仍 pin 半成品。

**测试（`test/编排/genesis-finalize-reach.test.ts`，5 条，系统临时目录、用后清理）**
- ①可达性：`openRoleSession({roleId:"su", genesisFinalize:true})` + 真实适配器 → su 写出角色 X + 治理边界 → `handle.finalize()` **真写出** `.ans/project.json` + `docs/bootstrap-manifest.md`；pin 与文件实算 SHA-256 一致；经 `loadEffectiveConfig` 载入为 pin-backed accepted。
- ②时机（显式）：**多轮**每轮 settle 后 `.ans` **均不出现**（无半成品）；显式 `finalize()` 才落盘且覆盖**全量**角色（A+B）。
- ③守卫：句柄**尚未 settle** → `finalize()` 拒且零副作用。
- ④向后兼容：**不开启** `genesisFinalize` → 句柄**无** `settled`/`finalize`（冻结形状不变）。
- ⑤自终止：`.ans` 写出后，重开（无 `genesisBootstrap`）的 su 写**新角色**被拒；既有角色 X 仍可写其边界内路径。

**结果**：`test/编排/` **110/110**；`npm run typecheck` **零错误**；全量 `node --test "test/**/*.test.ts"` **581 通过 / 0 失败**（基线 576 + 本任务 5）。见 memo。

## 2026-10-11 — T33：创世 finalize（su 写完后由代码算 pin + 逐路径留痕；写入同样经 `resolveWrite`）

**来源**：本角色（编排）独立实现，落点在本角色边界内（新增 `src/common/编排/finalize.ts`、改 `src/pipeline/orchestration/govern-session.ts`、新增 `test/编排/finalize.test.ts`，另更新本角色 memo/changelog）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` **§12.5**（创世留痕与 pin：su 不会算 hash，故 pin 只能由代码在 su 写完**之后**算）+ 派发清单 **T33** 行（客户已确认保留 finalize）。前提 T31（种子边界迁入门禁引擎 + 改普通目录）、T32（退役骨架 + `ans govern` 接受目标目录、`targetDir` 透传）已落。

**背景**：客户要做真实端到端测试——空文件夹 → 与 su 对话 → su 自己决定并建出角色。su 是模型、**不会算 hash**，故 pin（`.ans/project.json` 的 `acceptance.pin`）与逐路径留痕（`docs/bootstrap-manifest.md`）**只能由代码在 su 写完「之后」**算。本任务即那台「事后」机器。

**改了什么**

1. **新增 `src/common/编排/finalize.ts`：finalizeBootstrap**
   - 扫目标项目 `角色卡/*/boundary.yaml`（有 role-card.md + boundary.yaml 的角色目录，与 `listProject` 同口径）+ 项目治理边界文档（`角色卡/governance-boundary.yaml`，`DEFAULT_GOVERNANCE_BOUNDARY_REL`）→ 逐文件算 **SHA-256**（原始字节，与门禁引擎 `io.ts::sha256File` 同算法）。
   - 写 **`.ans/project.json`**：`{ projectRoot, skillRoot, roles:{id:{card,boundary}}, governanceBoundary:{path, acceptance:{accepted:true, source, pin:[{path,sha256}]}} }`——形状对齐**装配的载入器** `src/common/shared/config-loader.ts`。pin **覆盖**治理边界文档 + 每个角色边界（否则载入角色边界时 `verifyPins` 报「未被任何 pin 覆盖」）。
   - 写 **`docs/bootstrap-manifest.md`**（逐路径留痕）：列出 `角色卡/`、`docs/` 下**实际创建**的文件 + 本 finalize 写出的两笔（`.ans/project.json`、`docs/bootstrap-manifest.md`），另附 pin 表。
   - **无可 pin 之物**（su 未写出任何 boundary.yaml / 治理边界）→ **拒绝**（否则会写出「accepted:true 却无 pin」的配置，载入方将 fail-closed 降级）。

2. **授权裁决（本任务核心）——finalize 的写走哪条授权？复用「创世授权」。**
   - finalize 的两笔写（`.ans/project.json`、`docs/bootstrap-manifest.md`）落点都在**目标项目**的治理产物目录内。此刻该项目尚无 `.ans/project.json`，故 `resolveBoundarySection` 对内置治理角色命中的是**创世种子边界**（`genesisBootstrap`，设计 §12.2）——种子条目是**普通目录** `角色卡/`、`docs/`、`.ans/`（T31 已由条件目录改为普通目录），`scope: undefined` 下命中即放行、**无需 slug**。于是 finalize 与 su 用的是**同一条授权**：同一次「操作者发起的 bootstrap」（`acceptance.source`）。**不新增任何权限**——finalize 只是同一有界创世阶段里的**另一个写入者**，写集仍是那三个治理产物目录。
   - **为何不另造「声明 `project-init` 条件的 scope」**：目标项目的创世种子边界里 `.ans/` 是**普通目录**（非条件目录），`project-init` 条件在此**无处附着**。（`project-init` 条件属 **ans-cli 本项目自身** `角色卡/装配/boundary.yaml` 的 `.ans/` 条目——那是**另一个项目**的边界，管不到目标项目。）

3. **为什么这不是「凭代码身份绕门」（最关心的一点）**
   - finalize **不直接 `fs.writeFile`**：对**每一个待写路径**都先经**同一个** `resolveWrite(targetPath, boundary, scope, ctx)` 求值；**两笔写全部前置求值，任一被拒 → 整批中止、零副作用**（尚未落任何盘、未建任何目录）；全放行才逐笔落盘，且落盘前在 `gatedAtomicWrite` 内**再求一次**（纵深防御）。即 finalize 的写与 su 的写走**同一个门**——与 `docs/scheduling/`（唯一写入者 `task_ops` 仍过门）、`docs/audit/`（shell 闸写审计仍过门）是**同一模式**，没有后门。

4. **触发时机与身份——显式，不自动**
   - `GovernanceSessionHandle` 增**显式**方法 `finalize(opts?)` + 只读 `settled`。**不在每次 settle 自动跑**：句柄是**多轮**的（su 可反复 send），自动跑会在对话**中途** pin 到**半成品**。
   - **半成品守卫**：会话**尚未 settle**（su 一个字都还没写）→ `finalize()` **拒绝**（无可 pin 之物）。`settled` 由消费事件流时观察到 `settled` 事件置真。
   - **CLI 一次性前端** `runGovernSession` 加**显式**开关 `GovernSessionInput.finalizeBootstrap`（缺省 `false`）：置真时，于其单轮 `settled` **之后**、`dispose` **之前**调一次 `handle.finalize()`——该前端的**单位就是「一次有界的治理任务」**，单轮 settle 即其完成点。多轮消费者（桌面 su 聊天）应自行调 `handle.finalize()`。结果经 `GovernSessionResult.finalize` 带出。

5. **顺带修（同属本任务所需，均在 `govern-session.ts` 内）**
   - **创世 scope 修正**：`openGovernanceSession` 原对**普通目录边界**（创世种子）也传 `{writeSet:[], conditions:[]}` → F4 的「空 writeSet＝拒一切」使 su **一个字也写不了**（违背 §12.2「su 的 scope 保持 undefined」）。改为：`conditions` 与 `writeSet` **均空**时传 `scope: undefined`（普通聊天、不做 F4 收窄）。此收窄**只**在「均空」时生效，**不放宽**任何既有 project-mode（含条件目录 / 有目标角色）的判定。
   - **创世提示语如实**：`buildGovernPrompt` 空-roleIds 分支据「本次会话能否写」措辞——创世下引导 su **据对话直接写出**治理产物，**不再误报**「不写盘」（否则会误导真实模型）。

**关键设计落实**
- **时间序**（§12.5）：pin 在 su 写完**之后**由代码算——`finalize()` 只在会话 settle 后可调，句柄半成品守卫挡住「su 还没写完就 finalize」。
- **写也必须过门**：finalize 的写经 `resolveWrite`（`scope:undefined`，创世种子边界）——**同一门禁**，非代码身份豁免。
- **形状对齐**：`.ans/project.json` 经**装配的载入器** `loadEffectiveConfig` 载入可 pin-backed accepted（测试实测），角色边界经 `verifyPins` 逐一比对通过。

**测试（`test/编排/finalize.test.ts`，6 条，系统临时目录、用后清理）**
- ① 创世 E2E：空文件夹 + `genesisBootstrap` → `openGovernanceSession` → su 会话写出角色 X 三件套 + 治理边界 → `handle.finalize()` **真的写出** `.ans/project.json` + `docs/bootstrap-manifest.md`；**pin 与文件实际 SHA-256 一致**（测试**独立重算** `createHash` 逐条比对）；留痕**列出实际创建路径**；`.ans` 经 `loadEffectiveConfig` 载入 → `source.kind==="ans"`、`accepted:true`、pin 存在；`resolveRole("X")` 无 `parseError`。
- ② **负例（拿掉授权）**：条件目录边界（未声明 `project-init`/`docs-bootstrap`）下 finalize 的两笔写被门禁拒 → `ok:false`、**零副作用**（`.ans/`、`docs/` 均未创建）——**证明 finalize 的写同样经 `resolveWrite`，不是凭代码身份绕门**。
- ③ **半成品守卫**：会话**尚未 settle** → `finalize()` 拒绝（`/settle|半成品/`）且零副作用。
- ④ 单元：`finalizeBootstrap` 直调——pin 正确（独立重算比对）；**无可 pin 之物** → 拒绝且不写 `.ans`。
- ⑤ 单元负例：边界**未接受** → 拒绝且零副作用。
- ⑥ `runGovernSession` 显式 `finalizeBootstrap:true` → 单轮 settle 后写 `.ans`（`EXIT_OK`）。

**边界说明（如实报告）**
- 全部改动落点在本角色 `Section 1` 内（`src/common/编排/`、`src/pipeline/orchestration/govern-session.ts`、`test/编排/`、本角色 memo/changelog）。**未改** `src/index.ts`（装配，T34 据 T32/T33 定义接 `projectRoot` 与 finalize 开关）。
- **hash 原语**：`finalize.ts` 用 `node:crypto` 自算 SHA-256（原始字节）——与门禁引擎 `io.ts::sha256File` **同算法**（该实现属门禁引擎私有 `common/`，§6 禁跨角色导入）。此为 2 行平凡原语，按设计 §3.11 对平凡同义物的体例**如实登记**（非另建判定逻辑）；若日后要收敛，宜由门禁引擎经 Service 面导出或被引到 `src/common/shared/`（非本角色可写）。
- **测试读入**：`test/编排/finalize.test.ts` 只读导入 `src/common/shared/config-loader.ts`（共享模块，用于验证 `.ans` 形状与生产同源）与 `src/service/role/resolve-role.ts`（Service 公共面）——**未**导入任何角色私有 `common/`。
- **跨角色已知红（未改，回报）**：`test/测试/t9-block1-bootstrap.test.ts` 仍用**已退役的** `bootstrap` 选项（第 90 行）+ 固定 7 角色骨架断言 → 其 2 条用例失败（「块1/有界创世」「块1/与 su 对话建角色」）与 typecheck 1 错（同文件第 90 行 `bootstrap`）。属**测试角色**边界（T35）。**本任务未触碰该文件**。

**回归**：`node --test test/编排/*.test.ts` **105/105**（较 T32 的 99 增 6）。`npm run typecheck`（`tsc --noEmit`）**仅余 1 处已知错**（`test/测试/t9-block1-bootstrap.test.ts:90`，非本角色）。全量 `node --test "test/**/*.test.ts"`（**带引号、走 Node glob**）**572 总计 / 570 通过 / 2 失败**（2 失败均属 `test/测试/t9-block1-bootstrap.test.ts`，见上「跨角色已知红」）。

## 2026-10-11 — T32：退役骨架（删 `bootstrap.ts`）+ `ans govern` 接受目标目录

**来源**：本角色（编排）独立实现，落点在本角色边界内（`src/common/编排/bootstrap.ts` **整删**、`src/common/编排/args.ts`、`src/interface/cli/govern.ts`、`src/pipeline/orchestration/govern-session.ts`、`test/编排/`，另更新本角色 memo/changelog）。依据设计 §12.3/§12.4/§12.7 与派发清单 **T32** 行（客户「不预建，全由 su 对话决定」）。前提 T31（门禁引擎：种子边界迁入 `governance-seed.ts`、改普通目录）已落。

**背景**：客户要做**真实端到端测试**（空文件夹 → 与 su 对话 → su 自己决定并建出角色），并明确「**不预建**」——这直接否定了固定 7 角色模板 `SCAFFOLD_ROLES` 与自动骨架 `writeGovernanceSkeleton`。同时 `ans govern` 原**不取目标目录**（只在装配注入的 project=ans-cli 自身上工作），故 CLI 连「对某个空文件夹做 bootstrap」都办不到（§12.1-3）。

**改了什么**

1. **退役骨架（`src/common/编排/bootstrap.ts` 整文件删除）**
   - 删 `SCAFFOLD_ROLES` / `ScaffoldRole`、`writeGovernanceSkeleton` / `GovernanceSkeletonResult` / `WriteGovernanceSkeletonOptions`、仅供骨架用的序列化（`serializeBoundaryYaml`/`serializeRoleCard`/`serializeMemo`/`buildProjectJson`）、`boundaryEntriesOf`/`roleDocEntries`、`sha256Hex`、`governanceConditionSlugs`、`assertWritable`/`buildBootstrapManifest`、常量 `GOVERNANCE_BOUNDARY_REL`/`BOOTSTRAP_MANIFEST_REL`/`PROJECT_INIT_CONDITION`。
   - **同时删**已被 T31 **搬走**（非 fork）的两份**死副本** `governanceBoundaryEntries` / `buildGovernanceSeedBoundaryForGate`——它们唯一来源现为门禁引擎 `src/common/门禁引擎/governance-seed.ts`（grep 确认本仓库无代码再导入本文件）。
   - **无死代码残留**：grep `编排/bootstrap` / `bootstrap.ts"` / 上述符号——全仓命中**仅文档/注释**（设计稿、各角色 changelog/memo、`governance-seed.ts`/`boundary-core.ts` 的「§6 违规已修复」说明、`src/common/装配/config-loader.ts` 的一处**文档注释**列入已删测试名，属装配边界未改）。

2. **`govern-session.ts`：不再预建骨架 + 目标目录透传**
   - **删** `GovernSessionInput.bootstrap`、`GovernanceSessionHandle.bootstrap` 及 `openGovernanceSession` 里那段「开会话前先经 `writeGovernanceSkeleton` 落骨架」的逻辑与 `runGovernSession` 里对应的记录块。引擎现只做「发现治理角色 → 解析治理边界 → 造 scope → 开内置治理角色会话」；**角色改由 su 在会话里用工具按对话写出**。
   - **加** `GovernSessionInput.targetDir?`（原样透传到 `GovernanceSessionHandle.targetDir` 与 `GovernSessionResult.targetDir`）——诊断/后续 finalize（T33）取用；真正的 projectRoot 由装配据它设入（T34）。

3. **`args.ts`：`parseGovernArgs` 增可选位置参数 `dir`（`ans govern [<目录>]`）**
   - 选**位置参数**（非 `--dir`）：与既有 `ans role run <角色>` 的**位置参数风格**一致，且 §12.3 把它列为首选形态。至多一个裸词（第二个裸词仍计「多余参数」用法错误）；缺省 `undefined`（装配回退 ans-cli 自身）。

4. **`govern.ts`：接受并传递目标目录**
   - `GovernDeps` 增可选 `targetDir?`（装配通道）；`governCommand` 以 `resolveGovernTargetDir(argv, deps)`（**argv 位置参数优先 > deps.targetDir > undefined**）算出生效目录，透传给 `runGovernSession`。
   - **导出** `resolveGovernTargetDir(argv, deps?)`——**§6 安全的 Interface 出口**（装配本已动态导入本模块，无需导入编排私有 `common/编排/args.ts`）：**装配（T34）** 据此算 `projectRoot`。头注释同步更正「本命令不取目标目录」的旧说法。

5. **`test/编排/`**：**删** `bootstrap.test.ts`（随骨架退役）；**改写** `govern.test.ts` / `govern-engine.test.ts` 的夹具——不再用 `writeGovernanceSkeleton` 造项目，改为**自备一份「项目治理边界」文档 + 直接构造 project**（贴近新形态），并**新增**目标目录解析/传递、「无 pre-scaffold 仍能开会话」用例。

**边界说明（如实报告）**
- 全部改动落点在本角色 `Section 1` 内（`src/common/编排/`、`src/interface/cli/govern.ts`、`src/pipeline/orchestration/govern-session.ts`、`test/编排/`）。**未改** `src/index.ts`（装配，T34 据本任务定义形状接线）。
- **跨角色后果（未越界改，回报）**：`test/测试/t9-block1-bootstrap.test.ts` 仍用**已退役的** `bootstrap` 选项（第 90 行）并断言固定 7 角色骨架落盘——属**测试角色**边界，现致 **typecheck 1 错**与**全量 2 失败**；须由测试角色按其任务（设计 §10.4 T18 / §12.7 T35）改写。`src/common/装配/config-loader.ts:10` 一处**文档注释**仍列已删的 `test/编排/bootstrap.test.ts`（装配边界，未改）。

**回归**：`node --test test/编排/*.test.ts` **99/99 通过**；`npm run typecheck`（`tsc --noEmit`）**1 错**（唯一的错在 `test/测试/t9-block1-bootstrap.test.ts`，见上「跨角色后果」）；全量 `node --test "test/**/*.test.ts"`（**带引号、走 Node glob**）**558 总计 / 556 通过 / 2 失败**（2 失败均属该 `test/测试/` 文件；基线 554/0，净增 4 条用例：删 bootstrap.test.ts、增目标目录用例）。

## 2026-10-11 — T23 收尾：`normalizeArgv` 收敛到共享模块（删本地副本、改只读导入，4 处调用点零改动）

**来源**：本角色（编排）独立实现，落点在本角色边界内（`src/common/编排/shell-gate.ts`，另更新本角色 memo/changelog）。依据设计 §3.11 行 7（全仓最后一处跨角色镜像收敛）与工程法案 §一.5（不得有第二份实现）、`角色卡/项目管理/docs/architecture/shared-components.md`。前提 T23（pm 已建 `src/common/shared/argv-primitives.ts` 并比对确认两份逐字相同）已落。

**背景**：`normalizeArgv` 此前在**编排**（`src/common/编排/shell-gate.ts`，拿规范化 argv **写进审计记录** `docs/audit/shell-gate.jsonl` 的 `argv` 字段）与**桌面**（`app/desktop/operator-channel.ts`，拿同一结果**展示给操作者**）各有一份**逐字相同**的本地副本。二者必须同源，否则「落进审计的 argv」与「操作者所见的 argv」会漂移——而审计的意义正是「所审的什么原文」可查。pm 的 T23 把正文**整体搬迁**到 `src/common/shared/argv-primitives.ts`（搬迁，非 fork）；本步是编排侧的收尾（T21/T22 为当时的过渡并存窗口）。

**改了什么**
- **`src/common/编排/shell-gate.ts`**：
  - **删除**文件末尾「内部辅助」区的本地 `normalizeArgv`（原 4 行：非数组→`[]`；`filter` 只留 `typeof === "string"`）。
  - **新增只读导入** `import { normalizeArgv } from "../shared/argv-primitives.ts";`（附注释说明单一来源与「不得留第二份实现」）。**行为逐字不变**——共享模块正文即由本副本逐字搬迁而来。
  - **4 处调用点零改动**（只改来源，未动调用代码）：`decide`（`const argv = normalizeArgv(req.argv)`）、`runB`（构造 `PmReviewInput.argv`）、`runA`（构造 `OperatorPrompt.argv`）、`audit`（审计记录 `argv` 字段）。
- **记录**：本角色 `memo.md` +1 行、`changelog.md` 增本小节。

**边界说明（如实报告）**：`src/common/编排/shell-gate.ts` 在 `角色卡/编排/boundary.yaml` 的 `src/common/编排/`（本角色私有辅助目录）内——**本步落点在本角色边界内，未越界**。共享模块 `src/common/shared/argv-primitives.ts` 属 pm，本角色**只读导入**，未改。

**回归**：`node --test test/编排/*.test.ts` **102/102**（未增删用例）；`npm run typecheck`（`tsc --noEmit`）**零错误**；全量 `node --test "test/**/*.test.ts"`（**带引号、走 Node glob**）**460 通过 / 0 失败**（与基线一致）。

## 2026-10-11 — T21：operator 三型收归 §4 冻结契约家（单一来源）、删本地形状定义；修 4 处 typecheck（无压制，源头收窄）

**来源**：本角色（编排）独立实现，落点在本角色边界内（`src/common/编排/{shell-gate,operator-channel}.ts`、`src/pipeline/orchestration/pm-reviewer.ts`，另更新本角色 memo/changelog）。依据 PM 裁定（T21 派发）与设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` §4（冻结契约家）、§6（禁止跨角色导入他人私有 `common/`）。前提 T20（Pi适配器把 operator 三型加进 `src/provider/pi/session.ts`）已落。

**背景**：`OperatorPrompt`/`OperatorOutcome`/`OperatorChannelFn` 原由**编排私有** `src/common/编排/shell-gate.ts` 定义，迫使**桌面应用**因 §6 只能**逐字镜像**（有漂移风险）。PM 裁定把三型挪入 **§4 冻结契约家 `src/provider/pi/session.ts`**（Provider 边界，与本角色早先放那儿的 `ShellGate`/`ShellReviewRequest`/`ShellReviewResult` 同址）。

**改了什么**
- **删本地形状定义、改从冻结契约家导入（单一来源）**：
  - `src/common/编排/shell-gate.ts`：**删除**本地 `OperatorPrompt`/`OperatorOutcome`/`OperatorChannelFn` 三处形状定义；改从 `../../provider/pi/session.ts` `import type` 引入，并 **`export type { OperatorPrompt, OperatorOutcome, OperatorChannelFn }` 再导出**——保住既有消费方（`test/编排/`、`operator-channel.ts`）**零改动**。**单一来源，非第二份**（形状逐字未变）。
  - `src/common/编排/operator-channel.ts`：`import type` 改从 `../../provider/pi/session.ts` 直接引入（不再经 shell-gate.ts 中转）。
  - `src/pipeline/orchestration/pm-reviewer.ts`：不动形状（其 `PmReviewInput`/`PmAskFn` 仍属编排自身注入点，非本次挪动对象）。
  - **行为逐字不变**：仅改类型来源与再导出，无运行时改动。
- **修 4 处 typecheck（TS18049 ×3、TS2769 ×1）——未用任何压制**：根因是两个 async 工厂的返回型被声明为**宽注入点型**（允许同步返回 + 允许 `null`/`undefined`），而实现恒回 `Promise<具体型>`。修在**源头**——把返回型收窄为其**具体形状**（仍是注入点型的**子类型**，可赋值给注入点）：
  - `createCliOperatorChannel`：返回型由 `OperatorChannelFn` 收窄为 `(prompt: OperatorPrompt) => Promise<OperatorOutcome>`（对应错误 418/421/424：`await ch(prompt)` 不再可能是 `null`/`undefined`）。
  - `createPmReviewer`：返回型由 `PmAskFn` 收窄为 `(input: PmReviewInput) => Promise<string>`（对应错误 487：`assert.rejects(ask(...))` 现收 `Promise<string>`）。
  - **测试零改动**（`test/编排/shell-review-chain.test.ts` 未动）——错误在源头修掉，非在测试处打补丁。

**边界说明（如实报告）**：`src/pipeline/orchestration/pm-reviewer.ts` 未列入 `角色卡/编排/boundary.yaml`（该文件按文件级列举 `run-role.ts`/`govern-session.ts`，且仍含已删的 `init.ts` 陈旧条目）。但 T16 changelog 已记该文件为「本角色边界内」且由本角色创建，PM 的 T21 派发亦明列 `src/pipeline/orchestration/` 为写入范围，故本次改之。`boundary.yaml` 是治理产物（由 Governance/su 维护，**本角色不自行改写**）——**建议 Governance 把 `pm-reviewer.ts` 补入、并移除陈旧的 `init.ts` 条目**。

**测试**：`node --test test/编排/*.test.ts` **102/102**（未增删用例）；`npm run typecheck` **本角色 4 处归零**（现全仓 `tsc --noEmit` 无输出）；全量 `node --test "test/**/*.test.ts"`（**带引号、走 Node glob**）**448 中 447 通过**，唯一失败 `test/pi-adapter/tools.test.ts:193`（`edit_file 命中 old_string`，**Pi适配器边界，非本角色，未改**）。

## 2026-10-11 — T16：bootstrap 改造为 su 的治理写路径、`ans init` 删除、单引擎治理会话收敛、`TaskHandback` 事件

**来源**：本角色（编排）独立实现，落点在本角色边界内（`src/interface/cli/init.ts` **删除**、`src/common/编排/bootstrap.ts`、`src/common/编排/handback.ts`（新增）、`src/pipeline/orchestration/{run-role,govern-session,pm-reviewer}.ts`、`test/编排/`，另更新本角色 memo/changelog）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` **§10**（全节，尤其 §10.4/§10.5/§10.8）与派发清单 **T16** 行。前提 T15（门禁引擎：冷启动治理边界求值）已落。

**背景**：客户 2026-10-11 推翻固定模板 init——`ans init`（固定模板摊 7 角色）**废除**，改为「导入空文件夹 → 与内置治理角色 su 对话 → su 把角色建出来」。§10.4 定：命令面删、**库面改造复用**（`bootstrap.ts` 保留为 su 的写路径）。

**改了什么**
- **`ans init` 命令面删除（§10.4）**：`src/interface/cli/init.ts` **整个文件删除**。此前它承载的骨架生成能力（遍历建目录 + 逐文件 SHA-256 pin + 逐路径留痕 + 序列化边界 YAML + `.ans/project.json`）**保留**。
- **`src/common/编排/bootstrap.ts` 改造为 su 的写入路径（§10.1/§10.4）**：
  - **保留**全部既有纯函数（`SCAFFOLD_ROLES`/`boundaryEntriesOf`/`governanceBoundaryEntries`/`serializeBoundaryYaml`/`serializeRoleCard`/`serializeMemo`/`buildProjectJson`/`buildGovernanceSeedBoundaryForGate`/`sha256Hex`）——**触发点由「一条命令」改为「su 会话」**。
  - **新增** `writeGovernanceSkeleton(opts)`：su 的**治理写路径**。给定 `projectRoot` + `source`（操作者发起的 bootstrap 指令）± `roleIds`（缺省全部骨架角色；未知 id → **抛错**），遍历建目录、逐文件算 SHA-256、写 `.ans/project.json`（accepted:true + 逐文件 pin）、写创世创建清单 `docs/bootstrap-manifest.md`，返回 `{roleIds, createdPaths, pins, manifest, manifestPath}`。
  - **新增** `governanceConditionSlugs()`（治理种子条件目录的 slug 单一取用点）。
  - **fail-closed 加固**：写盘前对**每一个待写文件**经 `resolveWrite` 对「项目根治理种子边界 + 声明全部条件 slug 的 TaskScope」求值，**任一被拒 → 整批中止、不落盘**（`assertWritable` 抛错）。较原 `init`（**只**对 `.ans/project.json` 自检）更严——直接兑现 §10.1「写集有界 + 条件有界」。（种子条目仍来自本模块 `governanceBoundaryEntries`，条件只声明才激活，非 blanket。）
  - **未改名**（任务建议「能不改名就不改名」）：门禁引擎 `src/common/门禁引擎/boundary-core.ts` 只读复用 `buildGovernanceSeedBoundaryForGate`（其边界、本角色不改）；改名会引发不必要的跨角色联动，故**保持 `bootstrap.ts`**。`bootstrap.ts` 的骨架不再预留 `src/interface/cli/init.ts`（命令面已废）。
- **`ans govern`（CLI）与桌面 su 收敛为同一引擎（§10.5）** —— `src/pipeline/orchestration/govern-session.ts` 重写：
  - **新增唯一入口** `openGovernanceSession(input, deps)`：发现内置治理角色（`listProject` 枚举，**不硬编码 "su"**）→ 解析项目治理边界 → 按条件目录给 scope → 经 `openRoleSession` 开会话；返回 `GovernanceSessionHandle`（`governanceRoleId`/`boundarySource`/`acceptance`/`scope`/`bootstrap?` + `send`/`events`/`dispose`）。失败即**抛错**（句柄式）。
  - `runGovernSession` **变薄**为 CLI 一次性前端：调 `openGovernanceSession` → 记录元信息 → 发一轮 → 以 `settled` 收口 → dispose；**装配逻辑全部在 `openGovernanceSession`**（无第二份实现）。返回形状 `{code, transcript}` **不变**（既有测试照旧）。
  - `GovernSessionInput` 新增可选 `bootstrap?: { source; roleIds? }`：给定即引擎开会话前先经 `writeGovernanceSkeleton` 落盘治理骨架（**su 的写路径真正被调用**，非死代码）。
- **`TaskHandback` 事件（§10.8）** —— 新增 `src/common/编排/handback.ts`：
  - 类型 `TaskHandback = { roleId, taskId?, status:"completed"|"blocked", summary, evidence:string[], at }`（**只搬任务与证据，不搬身份与写权**——合 SKILL.md 交接语义）；编排层事件 `HandbackEvent`；联合 `OrchestrationEvent = SessionEvent | HandbackEvent`。
  - `buildTaskHandback(events, ctx)`：结论缺省按事件流推断（**无写入被接受且有拒绝 → blocked**，否则 completed）；`summary` 取 settled 摘要；`evidence` 取各 `accepted` 摘要。
  - `withHandback(source, ctx)`：透传 `SessionEvent`；读到 `settled` 时**先发 `handback`、再透传 `settled`**（保证以 settled 为终止信号的消费方也收得到）。
  - **接线**：`openRoleSession`（`run-role.ts`）的 `events()` 现产出 `OrchestrationEvent`——**除内置治理角色外**，会话 settle 即发 handback（`RoleSessionHandle.events()` 类型随之由 `AsyncIterable<SessionEvent>` 改为 `AsyncIterable<OrchestrationEvent>`）。**su 不自我回交**（回交主体是其他角色，目的地才是 su）。**V1 仅事件**；自动多角色派发-回收 = 二期 **S1**，**本轮未做派发引擎**。
  - 消费方适配：`pm-reviewer.ts` 跳过 `handback` 事件（不参与 pm 回复提取）。
- **测试**：`test/编排/init.test.ts` **删除**（随命令面作废）。新增 `test/编排/bootstrap.test.ts`（su 写路径：骨架 + `.ans` + pin 一致 MATCH、`roleIds` 子集、未知角色抛错、条件门负例、**`ans init` 命令面已删**）、`test/编排/handback.test.ts`（形状 / withHandback 顺序 / 端到端 / su 不自我回交）、`test/编排/govern-engine.test.ts`（单引擎：句柄元信息 + gate 对项目治理边界求值 / 驱动句柄落盘 / CLI 前端同源 / `bootstrap` 选项落盘）。改写 `test/编排/govern.test.ts` 的夹具（改用 `writeGovernanceSkeleton`，不再依赖已删命令）。

**跨角色边界（如实报告，本角色不动）**
- **`src/index.ts`（装配）与 `src/common/装配/cli-parse.ts`（装配）仍属 init 相关**：`index.ts` 的 `case "init"` 动态导入**已删的** `./interface/cli/init.ts` → 抛错 → `reportUnavailable` → 退出码 **1**（并非干净的「未知命令」）；`USAGE` 文本仍列 `ans init`。**装配**已完成 `cli-parse.ts` 的 init 分支移除（`init` → `unknown`）；`index.ts` 的 `case "init"` 分支与注释仍待装配清理（本角色越界，不动）。
- **`test/测试/real-entry.test.ts`（测试角色）**：`ans init <临时目录> = 0` 断言**失效**（现 `ans init` 被 `cli-parse` 判 `unknown` → 退出码 **2**），已在设计中列为 **T18**，**本角色不改**。`ans init 无目录参数 = 2` 断言**恰好仍通过**（未知命令也是 2）。
- **`app/desktop/session.ts`（桌面应用，T17）**：`openRoleSession.events()` 产出类型改为 `OrchestrationEvent`，其 `emitEvent(ev)`（第 239 行）需同步把入参类型放宽为 `OrchestrationEvent`（或在收到 handback 时渲染卡片）——**类型层面**，运行时不受影响（Node 擦除类型）。归 **T17**。
- **`角色卡/编排/boundary.yaml`**：条目 `src/interface/cli/init.ts` 现**陈旧**（文件已删）。`boundary.yaml` 是治理产物（由 Governance/su 维护，**本角色不自行改写**）——**需 Governance 移除该条目**。

**回归**：`node --test test/编排/*.test.ts` **102/102**。全量 `node --test "test/**/*.test.ts"`（带引号、走 Node glob） **446 条 → 445 通过 / 1 失败**；唯一失败 = `test/测试/real-entry.test.ts` 的 `ans init <临时目录> = 0`（T18，测试角色边界，本角色不改）。注：全量条数较上轮基线（432）变动，含**装配角色并行**改动（`cli-parse.test.ts` 新增「init 子命令已移除」用例）与本角色增删。

## 2026-10-11 — T8b：shell 审核链接上 (b) pm 审读 + (a) 操作者确认（三层顺序落齐；硬拒不可翻案；pm/operator 均注入）

**来源**：本角色（编排）独立实现，落点在本角色边界内（`src/common/编排/shell-gate.ts`、`src/common/编排/operator-channel.ts`、`src/common/编排/shell-audit.ts`、`src/pipeline/orchestration/pm-reviewer.ts`、`test/编排/`，另更新本角色 memo/changelog）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` **§7.3**（三层职责与先后：判定顺序即交互顺序）、**§7.4**（落点：(b) 经 `openRoleSession(项目管理,…)`、(a) 经注入的操作者通道）、**§7.5**（fail-closed 三条退路：b 不可用→升级 a，a 不可用→拒，只往更严的层退）、**§7.6**（审计含 `by`/`branch`，各层可辨识）。

**背景**：T8a 只接 (c) 确定性硬地板，`review` 未接 (b)/(a) 故**默认拒绝**。本步把 (b)、(a) 接上，串成完整的 **(c)→(b)→(a)** 链。

**改了什么**
- **`src/common/编排/shell-gate.ts`（三层链主体）**：
  - `decide` 的 (c) 映射不变（白名单→放行、硬拒→拒绝终结）；`review` 改为 `return await runBA(req, by)`。
  - 新增内部 `runBA`/`runB`/`runA`：**先 (b)、再视情形 (a)**。(b) 把命令**原文**交注入的 `pmAsk`；返回值经 `parsePmVerdict` 解析为三态。**拿不准/无会话/超时/报错/JSON 非法 → `escalate`**（升级到 (a)，**绝不视为放行**）。(a) 仅在 (b) 升级时到达；**放行→放行，拒绝→拒绝，不可用/未接/超时/抛错/非法结果 → 拒绝**（fail-closed）。
  - 新增**注入点类型**：`PmAskFn`（+ `PmReviewInput`/`PmVerdictResult`）、`OperatorChannelFn`（+ `OperatorPrompt`/`OperatorOutcome`）。新增超时预算 `pmTimeoutMs`/`operatorTimeoutMs`（缺省 = `timeoutMs`；整体超时仍作最终兜底）。
  - 新增 `parsePmVerdict`（容忍 ```json 围栏与夹带文字；任何不确定 → `undefined` → 判 (b) 不可用 → 升级）。新增 `escalateBranch`/`pmBy`/`operatorBy`/`denyOutcome`。
  - **分支常量**：新增 `BRANCH_B_ALLOW/DENY/UNSURE/UNAVAILABLE/TIMEOUT/BADJSON`、`BRANCH_A_ALLOW/DENY/UNAVAILABLE/TIMEOUT`；升级链分支为 `<b>→<a>`（如 `b-unsure→a-allow`）。保留 `BRANCH_REVIEW_NO_BA`（**仅当 (b)/(a) 都未接入**的 (c)-only 装配下 review 默认拒——接任一层即走完整链）。
  - `buildShellGate` 的 `ShellGateBuildDeps` 增加 `pmAsk`/`operatorChannel`/`pmTimeoutMs`/`operatorTimeoutMs`/`rulesId` 并转发。
- **新增 `src/common/编排/operator-channel.ts`**（CLI 端操作者通道**参考实现**，本角色私有辅助目录）：`createCliOperatorChannel`——打印命令**逐字原文** + 为何升级、读一行（`readLine` **可注入**以便无 TTY/单测；缺省读 `process.stdin`）。**仅明确放行输入（y/yes/是/放行/allow）→ `allow`**；其余（含空/未识别）→ `deny`；**EOF（无人值守）→ `unavailable`**（→ shell-gate 拒）。
- **新增 `src/pipeline/orchestration/pm-reviewer.ts`**（(b) 的真实接线）：`createPmReviewer` 经 `openRoleSession(项目管理,…)` 开 pm 会话 → 发审核提示（要求**只**回 JSON）→ 取模型回复**原文** → 收口 dispose。`openSession` **可注入**（缺省 `openRoleSession`），**无真实模型即可测**（测试注桩替换）。
- **`src/common/编排/shell-audit.ts`**：仅**增补字段语义注释**——`by` 现承载 c 规则 id / `pm:<会话>(<模型>)` / `operator:<标识>`（升级链用 ` → ` 连接）；`branch` 现承载 c/b/a 各层分支 + 升级链。**记录形状不变**（`by`/`branch` 本就是字符串，够用）。

**关键设计落实**
- **硬地板不可翻案**：`decide` 在 (c) 判 `deny` 时**立即返回**，**根本不进入** `runBA`——故 (b)/(a) 即便会放行也无从翻案。测试以「(b)/(a) 桩本会放行、断言其**调用计数 = 0** 且结果仍为拒绝」钉死。
- **fail-closed 只往更严退**：b 不可用/超时 → **升级 a**（不是放行）；a 不可用/超时/未接 → **拒绝**；c 规则集失败 → 整条拒（T8a 已实现）。任一层都**不因不可用而放行**。
- **可测性**：两层都做成**注入函数**——(b) 返回 pm **原文**由本层解析（故「JSON 非法→升级」可测）；(a) 通道形状与 I/O 都可注入。**端到端真实模型轮次本机不可自动验收**（凭据命令须客户本人运行、不联网/不给凭据不可复现）——已在 `pm-reviewer.ts` 头部与 memo **如实标注**：只保证接线形状正确 + 失败一律 fail-closed。

**操作者通道 (a) 接口形状（本角色定；供桌面应用对接）**
- 输入 `OperatorPrompt = { command: string; argv: string[]; cwd: string; toolCallId: string; reason?: string }`。
- 输出 `OperatorOutcome = { outcome: "allow"; operatorId?: string } | { outcome: "deny"; operatorId?: string; reason?: string } | { outcome: "unavailable"; reason?: string }`。
- 约定：**只有 `outcome:"allow"` 是放行**；`deny`/`unavailable`/抛错/超时/非法返回 **一律拒绝**；`by` 由本层据 `operatorId` 生成（`operator:<id>` 或 `operator:未知操作者`），**通道无需自造 `by`/`branch`**。
- **跨角色不一致（如实报告）**：桌面应用角色已**先行**自建 `app/desktop/operator-channel.ts`，其**假设**形状是「通道返回整条 `ShellReviewResult`、输入为 `ShellReviewRequest`」——**与本文档形状不同**。因任务定「接口形状由编排定」，**请桌面应用按上述 `OperatorChannelFn`/`OperatorPrompt`/`OperatorOutcome` 适配**（其现有的命令呈现逻辑可复用；把「返回 ShellReviewResult」改为「返回 OperatorOutcome」，并接收多出的 `reason?` 字段即可）。两侧改的是不同文件，**不冲突**。

**测试**：新增 `test/编排/shell-review-chain.test.ts`（19 条）：(c) 白名单→放行且 **(b)/(a) 桩未被调用**；(c) 硬拒→拒绝且 **(b)/(a) 桩未被调用**（**不可翻案**）；(c) review→(b) 放行/拒绝；(b) 拿不准/超时/无会话/JSON 非法/报错 → **升级 (a)**；(a) 放行/拒绝/不可用/超时/未接 → 放行/拒绝；审计逐层 `by`/`branch` 可辨识；`parsePmVerdict` 正反例；`createCliOperatorChannel`（y/n/空/未识别/EOF）；`createPmReviewer`（注入 `openSession` 桩：返回原文 + dispose；抛错透传）。

**回归**：`node --test test/编排/*.test.ts` **94/94**（较 T8a 的 75 增 19）。全量 `node --test "test/**/*.test.ts"`（**带引号、走 Node glob**）**393/393 全绿**。注：全量较 T8a 记录的基线 360 增 33 = 本角色 19 + **桌面应用角色并行**新增（`test/桌面应用/operator-channel.test.ts` 等，18:34）——两方互不影响，全绿。

## 2026-10-11 — T8a：按新规格撤掉 token 机制、重整 shell 审核链（审核留在 execute；`shell-gate` 不再产出任何 token）

**来源**：本角色（编排）独立实现，落点在本角色边界内（`src/common/编排/shell-gate.ts`、`test/编排/shell-gate.test.ts`，另更新本角色 memo/changelog）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` 的新裁决——**§7.1 第 3 条**（票据机制废除）、**§7.2**（新闸类型无 token）、**§7.4**（落点：删 `bindShellToken`、去掉 `ShellReviewResult.token`）、**§7.5**（两条同址结构性保证）、**§7.7**（`run_shell` 扩展 handler 不做每调用 token 校验）、**§7.9/§7.10**（执行环境与命令解释模型，本步不涉及）；**PM 已裁定 T7c 的 `bindShellToken` 是错的**。

**背景（为何撤 token）**：T7c 为绕开「Pi 扩展层 `on("tool_call")` 早于 `execute`」的顺序问题，用了一枚**确定性可重算**的 token（`bindShellToken = sg1:<toolCallId>:<sha256(toolCallId\0command)>`）。PM 裁定：**可从公开输入推导的 token 证明不了「审核发生过」**——模型照方案就能伪造，**第二层兜底退化为装饰**。故新规格把审核整条移回**唯一 spawn 点 `execute`**（审核与 spawn 同址即结构性保证，不需要跨层票据），并要求删 token。

**改了什么**
- **`src/common/编排/shell-gate.ts`**：
  - **删除** `bindShellToken`（连同其 `import { createHash } from "node:crypto"`）——本模块**不再产出任何 token**。
  - **`allow` 分支**改为返回 `{ allow:true, by }`（**去掉 `token` 字段**）；`deny`/`review` 分支不变（`review` 仍**默认拒绝**）。
  - **头部注释重写**：写明「审核留在唯一 spawn 点 execute、不需要跨层票据」「为何不产出 token（§7.1 第 3 条）」及**两条同址保证**——① 未 arm → `run_shell` 不注册（能力缺席）；② `execute` 是唯一 spawn 点，只在审核返回 `allow` 后 spawn（**不靠「扩展默认 block」**——那条会 block 掉正常调用，等于保证成立但功能不可用）。
  - **保留**：审核链职责 + 审计留痕（§7.6）+ fail-closed 三退路（规则集加载失败 / 分类函数缺失或抛错 / 审核超时 → 一律拒绝）。
- **`test/编排/shell-gate.test.ts`**：**删除**断言 token 的用例（allow-token 绑定、`bindShellToken` 确定性/可辨）；**改** allow 用例为断言「放行 + `by` 正确 + **结果不含 `token` 字段**（接口对齐）」；**保留并加固** review→拒 / deny→拒 / 超时→拒 / 规则集加载失败→拒 / 审计被追加且声明 `shell-gate` 条件。

**「未走完审核链就绝不执行」现在靠什么成立（重申两条保证）**：靠**同址的两条结构性 fail-closed**，**不靠任何票据，也不靠「默认 block」**——
1. **未 arm → 工具不存在**：未注入 `ShellGate` 时 `buildGovernedTools` **不注册 `run_shell`**（能力缺席，§7.5.1）；
2. **唯一 spawn 点在审核之后**：`run_shell.execute`（Pi适配器侧）是**唯一** `spawn` 处，且**只在审核链返回 `allow` 之后** spawn；链上任一步 `deny`/报错/超时/不可用 → **不 spawn**（只往更严的层退）。
两条**都不阻断正常调用**（arm 且审核通过即执行）——**既保证、又可用**。

**跨角色边界（`ShellReviewResult` 定在谁那里）**：`ShellReviewResult` 定义在 **Pi适配器** 的 `src/provider/pi/session.ts`（**不是编排边界**），当前仍含 `{ allow:true; token:string; by:string }`。**本角色不改该文件**（越界）；该 `token` 字段由 **Pi适配器** 在同一批 T8 删除。**接口对齐要求**：`ShellReviewResult` 去掉 `token` 后，**编排与 Pi适配器两侧均不得再引用 token**——本角色已在本步全部去除（`shell-gate.ts` 不再产出/引用 token；`test/编排/` 不再断言 token）。**需跨角色配合**：本角色的 `shell-gate.ts` 返回形状（无 token）与 Pi适配器的类型定义（删 `token`）必须在**同一窗口落齐**才类型自洽。

**回归**：`node --test test/编排/*.test.ts` **75/75**（较 T7 少 2 条——删除的 token 用例）。全量 `node --test "test/**/*.test.ts"`（带引号、走 Node glob）**342 条 → 340 通过 / 2 失败**。两处失败**均属 Pi适配器并行改动 in-flight、非本角色**：`test/pi-adapter/run-shell.test.ts` 与该文件的 `ERR_MODULE_NOT_FOUND`——Pi适配器已删 `src/common/pi-adapter/shell-token.ts`，但其 `real-adapter.ts`（第 34 行）与 `run-shell.test.ts` 尚未更新 import，故 import 失败（`shell-token.ts` 缺失）。本角色的 `test/编排/` 全绿；待 Pi适配器落齐其后半，全量即可全绿。

## 2026-10-11 — T5：`ans govern` 由占位改为**真治理会话**（scope 按治理边界条件目录给出 + gate 对项目治理边界求值 + 接收配置注入）；顺带修 `ShellRules`/`ShellClass` 类型重复

**来源**：本角色（编排）独立实现，落点在本角色边界内（`src/interface/cli/govern.ts`、`src/pipeline/orchestration/govern-session.ts`、`src/common/编排/`、`test/编排/`）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` §2.2（治理边界文档即创建权来源）、§3.2（bootstrap/创建权：govern 真治理会话）、§5.2（验收）、派发清单 T5 行。

**改了什么**
- **重写** `src/pipeline/orchestration/govern-session.ts`（由「最小占位链路」改为真治理会话）：
  - **会话主体 = 内置治理角色**：id 经门禁引擎 `listProject` 枚举 `builtIn===true` 得到——**不硬编码 `"su"`**（项目管理裁决：权限以数据表达）；经 `openRoleSession`（会话式入口，允许 `project.builtInRoles` 声明的内置角色）开启。
  - **gate 求值边界 = 项目治理边界**：`resolveRole(govId, project)` → `resolveBoundarySection` 对「不在 `project.roles` 的角色」走 `governanceBoundary.path`；判定**唯一复用**门禁引擎 `resolveWrite`（编排不另写判定）。
  - **scope 不再恒为 `{writeSet:[]}`**：`conditions` = 治理边界里**所有条件目录**的 slug（激活 `角色卡/`、`docs/`、`.ans/`）；`writeSet` = 目标角色在 `角色卡/<id>/` 下的**精确文件**（`role-card.md`/`boundary.yaml`/`memo.md`，`ROLE_SCAFFOLD_FILES`）。
  - 边界 `parseError` 非空（含 **pin 失配**）→ 命令整体失败（非 0）并打印原因；成功路径与 runRole 同：prompt 一轮 → 以 `settled` 收口 → `dispose`（try/finally）。
- **重写** `src/interface/cli/govern.ts`：`governCommand(argv, deps?: GovernDeps)` **接收并使用**装配注入的 `ConfigInjection{project,configSource}`（缺注入 → `EXIT_USAGE`，不静默自持副本）；参数经 `parseGovernArgs`；适配器缺省经 `createPiAdapterFactory`（**真实治理会话**），可经 `deps.createAdapter` 注入替身。
- **新增** `parseGovernArgs`（`src/common/编排/args.ts`）：解析 `ans govern [--task <id>] [--role <角色id>]…`，未知裸词计用法错误；缺省 taskId `T-GOV-1`。
- **删除** `src/common/编排/config.ts` 的 `GOVERNANCE_ROLE_ID = "门禁引擎"`（已被「枚举内置治理角色」取代；无消费者）——治理角色不再由编排常量表示。
- **顺带修类型重复**：`src/common/编排/shell-gate.ts` 删除本地宽松 `ShellRules`（`{id?; [k]: unknown}`）与本地 `ShellClassification`，改从 `src/model/decision.ts` **导入**严格 `ShellRules` / `ShellClass` 并 re-export（唯一来源仍是 `model/decision.ts`）。审计的 ruleset 归属改走 `rulesId` 选项（见下「类型缺口」）。同步更新 `test/编排/shell-gate.test.ts`（规则集用严格形状 + 传 `rulesId`）。

**关键设计落实**
- **scope 为何给「精确文件」而非「目录」**：`resolveWrite` 的 F4 收窄是**精确匹配**（`writeSetContains` 用 `compareKey(a)===compareKey(b)`）——把条件目录路径放进 `writeSet` **不会**覆盖其子路径。故「按条件目录给出可写集」落到具体写入上**必须枚举出具体文件**；本函数据 `targetRoleIds` 生成。这是对设计 §3.2「按条件目录给出可写集（或走无 scope）」的落地选择（**未取「无 scope」**：治理边界条目**全是条件目录**，无 scope 时 `isActive` 恒假 → 一条也写不了，与 §5.2 正例相悖）。
- **不硬编码治理角色 id**：经 `listProject` 枚举（与桌面应用同源）；`openRoleSession` 的 `builtInRoles` 由该枚举结果填充。
- **越界写写前被拒**：治理边界只含 `角色卡/`/`docs/`/`.ans/`，故写项目 `src/` 或项目根以外**在写之前**被 `resolveWrite` 拒绝；拒绝零副作用（不建目录、不落盘）。

**类型缺口（如实报告，未自行 fork）**：严格 `ShellRules`（`model/decision.ts`）**无 `id` 字段**。旧版 `shell-gate.ts` 的宽松 `ShellRules` 带 `id?` 并在审计里读它（`rules.id`）——已删除该读取，审计 ruleset 归属改为**只用** `createShellGate` 的 `rulesId` 选项（`?? "default"`）。若日后确需「规则集自带 id」，应由 **门禁引擎**在 `model/decision.ts` 的 `ShellRules` 上**加一个可选 `id?: string`**（单一来源），而非在编排层再定义一份。

**测试**：`test/编排/govern.test.ts`（9 条，临时目录、用后清理）：gate 命中治理边界 + 条件 + writeSet（`角色卡/X/…` 可写；`角色卡/Y/…` 走 F4 拒）；**负例**——写项目 `src/`、项目根以外 → **写前被拒**；**负例**——改治理边界致 **pin 失配 → 命令非 0、不落盘**；**正例**——治理会话真落盘建 `角色卡/X/` → `listProject` 枚举到 X（无 `parseError`）；`governCommand` 缺注入/用法错误 → 非 0；接收配置 + 注入适配器 → 运行并落盘；`parseGovernArgs`。

**回归**：`node --test test/编排/*.test.ts` **76/76**；全量 `node --test test/*/*.test.ts` **340 条 → 339 通过 / 1 失败**。唯一失败是 **`test/测试/real-entry.test.ts:54`**（测试角色边界，**本角色不改**）：旧断言 `{ name: "govern 无配置通道", argv: ["govern"], code: 2 }` 失效——`govern` 现已**接收配置通道**，缺省走**真实 Pi 适配器**，因缺 provider 配置（`ANS_PI_BASE_URL` 等）**以退出码 1**（`EXIT_FAILURE`）结束（实测）。**应改为**：断言 `ans govern` 非 0（`status === 1`），并**更名**（不再是「无配置通道」，而是「真实 Pi 适配器缺 provider 配置」）；如需正例，另跑注入替身的 `governCommand`（见 `test/编排/govern.test.ts`）。

## 2026-10-11 — T4：`ans init` 由占位改为骨架生成器（创世例外 + `.ans` pin + 条件声明 + 拒覆盖）

**来源**：本角色（编排）独立实现，落点在本角色边界内（`src/interface/cli/init.ts`、`src/common/编排/`、`test/编排/`）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` §2.4（创世例外）、§2.5、§3.2、§3.3（pin 终态规则）、§5.2（验收）、派发清单 T4 行。

**改了什么**
- 新增 `src/common/编排/bootstrap.ts`：骨架**纯计划**生成（不触盘）——`SCAFFOLD_ROLES`（7 角色集：项目管理/编排/门禁引擎/Pi适配器/装配/测试/桌面应用）、各角色 Section 1（`boundaryEntriesOf`）、`governanceBoundaryEntries`（治理边界种子：`角色卡/`/`docs/`/`.ans/` 三条件目录，root=project）、`serializeBoundaryYaml`（严格 YAML：仅 role/entries 顶层键）、`serializeRoleCard`/`serializeMemo`（技能「长期维护者立场」开头）、`buildProjectJson`（`roles`/`governanceBoundary.path`/`acceptance.pin`，形状对齐装配载入器）、`buildGovernanceSeedBoundaryForGate`、`sha256Hex`。
- 改 `src/interface/cli/init.ts`（本角色已列文件，由 13 行占位改为生成器）：`initCommand(argv, deps: ConfigInjection)`——解析 `<目标目录> [--force]`；**接收并使用**装配注入的 `ConfigInjection`（缺注入→非 0；来源记入创建清单）；默认 **fail-closed 拒覆盖**（目标非空或含 `.ans/` → 非 0，不覆盖任何既有文件），`--force` 才覆盖；`.ans/project.json` 写入前做**门禁前置自检**（治理边界种子 + 声明 `project-init` 的 TaskScope）；落盘 7 角色骨架 + 项目级 `docs/` + `.ans/project.json` + 创建清单；打印创建清单。

**关键设计落实**
- **创世例外**（§2.4）：目标新目录**不在任何角色 Section 1 内**，授权 = **操作者 bootstrap 指令本身**（不再经 resolveWrite 对既有边界求值）。为不成为无守卫写路径：① 逐路径留痕——创建清单打印到 stdout 并落盘 `<目标>/docs/bootstrap-manifest.md`（含授权依据/执行者配置来源/创建路径/pin 表）；② 代码注释显式写明例外性质。
- **`.ans/project.json` 是唯一过门禁的写入**：`.ans/` 是条件目录（condition `project-init`）。写入前置自检以「治理边界种子 + `conditions:["project-init"]`」求值，**缺条件即被拒**（负例已测：同路径、conditions 不含 project-init → `allowed:false`）；自检不过 → 非 0 且**不落盘**。这不是形式要求，漏了会真被拒。
- **pin-backed acceptance**（§3.3）：`.ans/project.json` 写 `accepted:true` + **逐文件** `pin:[{path,sha256}]`，覆盖**每个边界文件**（7 角色 `boundary.yaml` + 治理边界种子，共 8 条），SHA-256 按原始 UTF-8 字节（与门禁引擎 `sha256File` 同算法）。载入器（装配）「有 `.ans` 且 accepted 无 pin → 置未接受」的规则**不会触发**（有 pin）。
- **角色集来源与理由**（非发明）：技能 `bootstrap-workflow.md` Path A 强制 pm（默认项目角色）+ 固定测试角色 + 装配角色，能力角色按层/能力拆分；本项目已接受的 7 角色集即该规则的一个实例（设计 §0/§3.2 亦写「7 角色骨架」）。

**测试**：`test/编排/init.test.ts`（8 条，临时目录、用后清理，不在仓库留文件）：空目录建骨架可被 `listProject` 枚举（7 角色 + su，无 `parseError`、无警告）；`.ans/project.json` 可解析且**每个 pin 的实际 SHA-256 一致（逐项打印 MATCH）**；经 `loadEffectiveConfig` 载入 → pin-backed 生效、角色边界经 SHA-256 校验 accepted；已存在目录 → 非 0 且不覆盖；`--force` 才覆盖；**缺 `project-init` 条件 → `.ans` 写被拒**（负例）；缺注入 → 非 0；用法错误 → 非 0。

**回归**：`node --test test/编排/*.test.ts` 67/67；全量 `node --test test/*/*.test.ts` 326 条 **325 通过 / 1 失败**。唯一失败是 **`test/测试/real-entry.test.ts:69`**（测试角色边界，**本角色不改**）：旧断言 `runCli(["init"]).status === 0` 失效——现 `ans init`（无目录参数）为用法错误，退出码 **2**。**应改为**：`ans init`（无参）断言非 0（2）；正例另跑 `ans init <临时目录>` 断言 0。`govern` 的 `=2` 断言不受本轮影响（T5 未做）。

## 2026-10-11 — T7 第一步：装配 ShellGate（只接 (c)）+ 审计留痕 + 超时 + 注入路径

**来源**：本角色（编排）独立实现，落点在本角色边界内（`src/common/编排/`、`src/pipeline/orchestration/run-role.ts`、`test/编排/`）。依据设计 `角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md` §7.2（机制骨架）、§7.3（组合 (c)+(b)+(a)）、§7.4（落点）、§7.5（fail-closed 三退路）、§7.6（留痕）。客户裁定「给 shell，但执行前必须过 pm 审核」；**V1 第一步只实现 (c) 确定性硬地板**（(b)/(a) 第二步，§7.8）。`classifyShell` 规则引擎归门禁引擎、`run_shell` 工具归 Pi适配器——均不在本角色；编排只**装配**命令级闸并**注入**。

**改了什么**
- 新增 `src/common/编排/shell-gate.ts`：
  - 类型按 Pi 适配器 `src/provider/pi/session.ts` 的 `ShellGate`/`ShellReviewRequest`/`ShellReviewResult` **引用/别名**，不另立第二份（避免形状漂移）。
  - `createShellGate(opts)`：调注入的 `classifyShell(argv, rules)` 并按 §7.5 映射——`allow`→`{allow:true, token, by}`、`deny`→`{allow:false, reason, by}`、**`review`→默认拒绝**（未接入 (b)/(a)，绝不因缺下一闸而放行）。超时包装**复用** `pi-adapter/timeout.ts`（超时=拒绝）。退路：规则集加载/解析失败→整条拒绝；分类函数缺失/抛错→拒绝。
  - `buildShellGate(deps)`：Pipeline 层**构造入口**（仿 `buildGate` 的注入模式），就地建好审计落盘；依赖由装配/调用方注入。
  - `bindShellToken(toolCallId, command)`：`sg1:<toolCallId>:<sha256 前 16 hex>`——与 `toolCallId` **确定性绑定**，扩展层凭 `toolCallId`+命令即可重算比对（无需共享密钥/import）。
- 新增 `src/common/编排/shell-audit.ts`：`ShellAuditSink` + `createFileAuditSink`（追加 `docs/audit/shell-gate.jsonl`；**落盘前先经 `buildShellAuditGate`** 以 pm 边界 + 声明 `shell-gate` 条件的 scope 判定，拒绝即**零副作用**）+ `createMemoryAuditSink`。记录含 §7.6 全字段（谁审的 / 命令逐字 + 规范化 argv + cwd / 结论 / 触发分支 / 时间戳 / 执行结果）+ 声明的 `conditions:["shell-gate"]`。
- 改 `src/pipeline/orchestration/run-role.ts`（本角色已列文件）：`AdapterFactoryBuilder`/`selectAdapterFactory`/`createPiAdapterFactory` 加**可选** `shellGate` 并转发给 Pi 适配器（缺省→`run_shell` 不注册，fail-closed §7.5.1）。**不破坏**契约 §5 冻结签名（末尾可选参）。

**关键设计落实**
- **review 默认拒绝**：`review` 分支**只**返回 `{allow:false}`，绝不返回 allow——把 fail-closed 的下降方向固定为「往更严」（c→拒；b→a；a→拒）。
- **审计的条件声明是硬要求**：`buildShellAuditGate` 把「声明 `shell-gate`」集中在装配处写死；缺条件时门禁在写入前拒绝（负例已测：不落盘、不建目录）。
- **能力缺席即 fail-closed**：`ShellGate` 缺席 ⇒ Pi 适配器不注册 `run_shell`；`classifyShell`/规则集不可用 ⇒ 一律拒。

**测试**：`test/编排/shell-gate.test.ts`（15 条）：allow（token 绑定）/deny（硬拒终结）/review 默认拒/超时拒/规则集加载失败拒/未注入分类函数拒/分类抛错拒/审计字段与条件声明/追加式/缺条件负例/`buildShellGate` 端到端/`selectAdapterFactory` 注入路径转发（含缺省 undefined）。

**依赖与阻塞**：门禁引擎的 `classifyShell`（与规则集）**尚未落盘**。本步按方案签名**注入**依赖、未替其实现规则集（不属编排）；待其落盘，只需在 `buildShellGate` 注入即可接线，编排代码无须再改。

**回归**：`node --test test/编排/shell-gate.test.ts` 15/15；全量 `node --test test/*/*.test.ts` 全绿。

## 2026-10-14 O1 多运行时契约迁移

客户已批准 ANS-RUNTIME-V2 revision 1 必要迁移，未扩写集。CLI/四件 Pipeline/私有 common 改走中立Model与Service、四引擎选择、隔离持久化和实际上下文；确认issuer以原signal拒绝迟到yes。本角色159/159 Pipeline、238/238回归、严格scoped tsc0；最新当前工作区全仓编译exit0（Claude/MCP/zod已可见）；B0正常依赖清单、默认Pi迁移/P1和整合尚待验。原始候选与路径见 [变更证据](docs/change/2026-10-14_change_multi-runtime-orchestration.md)。

## 2026-10-17 — 「替我审」判断 agent（P2 编排驱动与审计透传）

**来源**：PM 评审 `2026-10-17_design_shell-auto-approve-review.md`（approved，revision 2；客户 D1/D2 已拍板）§十四 P2；任务书要求「驱动落 `src/common/编排/shell-judge.ts`、经既有 `govern-session.ts` 薄再导出，不新增 pipeline 单文件」。本批只改编排边界（`src/common/编排/`、`src/pipeline/orchestration/{run-role,govern-session}.ts`、`test/编排/`），**未碰适配器、运行时核心（含 `src/service/runtime/session.ts`）、桌面、UI**。

**改了什么**
- 新增 `src/common/编排/shell-judge.ts`：`createShellJudge(opts): ShellJudgeFn` + `SHELL_JUDGE_SUPPORTED_RUNTIMES = {claude,pi,codex}` + `SHELL_JUDGE_DENY_TIER_LABEL = "deny 档 · judge 放行"` + `shellJudgeAuditOf`。
  - 合成判断角色 `shell-judge`（空边界、系统提示来自 prompt 模块）；判断专用适配器 `persistSession:false` + `shellJudge` 只读能力注入 + deny-all 写门禁；缺省工厂动态取 Pipeline `createRuntimeAdapterFactory(project, runtime, runtimeOptions)`（测试注入假 `createAdapter`）。
  - 15s 硬超时（`AbortController` + `AbortSignal.any`）、中止即 `abort()`+`dispose()`、迟到 `bindRole` 补 `dispose()`；超时前已捕获合法结论保留（超时只中止等待）。
  - 防循环 Map：同命令 `deny` +1、`allow` 删除、`manual` 不递增；上限缺省 2 → `manual/retry-capped`（不调用模型）。busy 并发 → `manual/unavailable`。
  - 支持矩阵/上下文检查在驱动层：`demo` → `unsupported-engine`；命令 >16KB / argv >256 → `context-too-large`；命令缺失 → `context-missing`；会话开不了 → `unavailable`；输出非法 → `parse-failed`；模型自报 → `model-manual`。
  - **`allow` 必须无损**：`deniedReads>0`/`budgetExceeded`/`truncatedReads>0` → 分别降 `read-denied`/`budget`/`read-truncated`；**`deny` 始终有效**。
  - **客户 D1**：`request.tier === "deny"` 且模型 allow → 照常 `allow`，置 `hardDenyOverride:true` + `label`；不转换、不拦截、不弹卡。
- 新增 `src/common/编排/shell-judge-verdict.ts`：`normalizeShellJudgeVerdict`（严格三值、allow 必须有 reason、文本 2KB/证据 10×512B 有界）、`synthesizeCustomerMessage`（含标准出路「如需执行，请关闭『替我审』后重试。」、已含不重复、内部行话不转述）、`redactJudgeText`/`redactJudgeVerdict`（环境凭据 ≥8 字符、Bearer/sk-/api-key 形态脱敏 + 有界截断）、`boundedJudgeText`、`hasInternalJargon`。
- 新增 `src/common/编排/shell-judge-prompt.ts`：稳定系统提示（五维 rubric、deny 档特殊规则、不可信数据警告、只读工具与 `report_shell_judgement` 输出契约）与本次请求提示（只放命令/argv/cwd/来源/档位/原因/当前轮文本；turnText ≤4KB 截断；不复述历史）。
- 改 `src/common/编排/shell-gate.ts`：`ReviewOutcome` 增可选 `judge`；`runA` 的 allow/deny 透传 `OperatorOutcome.judge`，`denyOutcome` 增可选参数；审计记录写可选 `judge`。`(c)/(b)` 顺序、fail-closed、超时/拒绝语义逐字不变。
- 改 `src/common/编排/shell-audit.ts`：`ShellAuditRecord.judge?: ShellJudgeAuditRecord`（含可选 `label`），向后兼容。
- 改 `src/pipeline/orchestration/run-role.ts`：`AdapterCapabilities.shellJudge?: ShellJudgeToolOptions`；`createRuntimeAdapterFactory` 逐名并入 Service 会话构造（运行时核心 `GovernedToolsOptions.shellJudge` 同名能力位）。**未给 `RuntimeAdapter` 加 judgeShell 方法**。
- 改 `src/pipeline/orchestration/govern-session.ts`：薄再导出 `createShellJudge`/`SHELL_JUDGE_SUPPORTED_RUNTIMES`/`CreateShellJudgeOptions`/`ShellJudgeFn`/`ShellJudgeOutcome`（桌面不跨角色导入私有 common）。

**测试**：新增 `test/编排/shell-judge.test.ts` 27 例（离线、假适配器；绝不调真实模型/凭据/网络）：三态与 reasonCode 全表、deny 有/无替代、读取损伤 allow→manual 且 deny 不变、D1 deny 档放行、超时保留结论/中止/预中止、迟到 bindRole dispose、防循环（上限/allow 清零/manual 不递增）、busy、支持矩阵、不可用、上下文缺失/超限、工具集恰三项与写门禁 deny-all、审计透传 judge（allow/deny/人工不带）、规范化/合成/脱敏/prompt 单元。本文件 27/27；`test/编排/**` 396 计 395 过 1 红（既有 Windows symlink EPERM）。全量三层 glob（`--test-force-exit` 收口本环境泄漏句柄）**2421 计 2398 过 20 红 / 3 skipped**——20 红均为既有环境（Windows symlink EPERM / CRLF 行尾精确钉）或他角色在途（桌面 UI/窗口、运行时核心），**本批零新增红**；不带 `--test-force-exit` 时本机会被 `test/runtime-core/prompt-start-acknowledgement.test.ts` 的子进程泄漏句柄拖住（该文件单独跑 5/5 通过，非本批文件）。

**边界与残余**：只读工具/策略/预算在运行时核心（P1），三适配器 judgeMode 在 P3a–c，桌面开关/三态映射/结果行在 P4/P5；本批不接真实模型，端到端由测试角色独立验证。

**验收缺陷修正（测试角色独立验收）**：第 9 次读取（调用预算耗尽）在运行时核心同时计入 `deniedReads` 并置 `budgetExceeded`；`damageCode` 判定顺序改为 **budget → read-truncated → read-denied**（以 `stats.budgetExceeded` 为准，不依赖单次读取错误码），避免把「判断预算耗尽」误报成「文件不可读」；预算的人话改为「判断预算耗尽（读取次数/总读取字节达上限）」。测试补两个预算优先用例（第 9 次读取 / 与截断同时）并断言预算文案不含「文件不可读」；敏感/越界仍 `read-denied`、截断仍 `read-truncated`、allow 遇任一损伤仍降 manual。

## 2026-10-17 — W2：治理三权编排接线（账本 / 三道门禁 / 能力矩阵）

**来源**：PM 评审 `2026-10-17_design_governance-trio-review.md` §5.6/§5.7/§6.2/§十一 W2（W0 契约 + W1 门禁已落地）。本批只改编排边界：`src/common/编排/{governance-ledger,governance-gate}.ts`（新）、`finalize.ts`、`src/pipeline/orchestration/{run-role,govern-session}.ts`、`src/interface/cli/govern.ts`、`src/common/编排/args.ts`、`test/编排/`、本角色四文档。**未碰**门禁引擎 / 运行时核心 / 适配器 / 桌面 / UI。

**账本**：`appendGovernanceLedger`（append-only `.ans/governance/ledger.jsonl`、按项目串行、fsync、失败只诊断不抛）、`readGovernanceLedger`（坏行/不可读进 `errors`；文件不存在=空账本）、`refreshGovernanceLedgerSnapshot`、`flushGovernanceLedger`。trio 会话 `open`/`send` 刷新快照；客户决定后同步更新内存快照并异步落盘（`customer.decision`）。

**门禁**：`evaluateGovernanceGate(input,snapshot)` 三道门全部 fail-closed——提案接受门、任命写入门、派发五条；`model!=="trio"` 不分流；账本 `errors` 非空拒一切。`run-role` 在 `resolveWrite` 之前先判 `forbiddenWritePaths`，再按路径分派门禁。

**能力矩阵**：`governanceCapabilitiesOf` 单点驱动 dispatch/roleStatus/sessionTail/proposeRecovery/installSkill(Mcp) 注入；预授权改 `scopeWithBuiltInPreauthorization`（trio 注册表 / su 四棵）；shell 按 `cap.shell`（none/readonly/operator-approve，su 旧只读兼容路径保留）。`customerInput` 按角色 cardKind 白名单（越权不弹卡），写 `decisionKind`/`customerDecision`/`targetRoleIds`/`paths`/`decisionEvidence`/`artifactSha256`。

**会话/CLI**：`GovernSessionInput.governanceFunction`、`resolveGovernanceRole` 统一解析（single 传 function 明确拒绝）；`withGovernanceRole` 只并入选中 id；默认提示词按 proposal/nomination/schedule 追加纪律（不写「已批准」），single/su 旧文案逐字保留；`--function` 与 `--role`（内置 id 选会话角色）落地。`finalize` 仅 trio 写 `governance.established`/`governance.reaccepted`；single 旧项目零新增副作用。

**测试**：新增 `governance-ledger.test.ts`（6）、`governance-gate.test.ts`（13）、`governance-session.test.ts`（18）、`governance-record-ledger.test.ts`（1）共 38 例离线全绿；`test/编排/**` 434 计 433 过 1 红（既有 Windows symlink EPERM，与本批零交集）。全量三层 glob `node --test "test/**/*.test.ts"` **2580 计 2526 过 51 红 / 3 skipped**；其中他域红 50 条（W1 基线 46 条 + W2 有意变更的 4 条源码钉/旧能力字面断言，归测试/桌面/装配属主更新），本角色新增用例零红。typecheck 全仓 0 错。

**已知取舍（如实登记）**：① 派发去重按 `flowId+stepId` 硬拒；「流程单已出新版本」的放行需带版本键（V2，本版 fail-closed）；② 账本 `artifact.observed` 仅 trio 内置角色（su/single 不写，保持旧项目零新副作用）；③ 内容漂移仍不在本机制范围（O-A1 未采纳，沿 A-3 登记）。

## 2026-10-19 — shell 判断改为「系统风险审查」并注入实际读取预算

**来源**：客户原话「判断应该告诉他预算限制。还有就是判断主要是对于系统其他的有没有风险，卡死风险，电脑其他的风险，项目内，不是随他吗，他不关心业务。」本批只改编排私有 common（`src/common/编排/shell-judge{,-prompt,-verdict}.ts`）、`test/编排/**` 与本角色文档；**未碰** `app/**`、运行时核心、适配器、门禁引擎与 git 历史。

**改了什么**
- **rubric 重写为系统风险审查**（`shell-judge-prompt.ts`）：五类风险——系统/机器（破坏性删除/覆盖、权限/系统配置、sudo/提权、装包、杀他人进程、资源耗尽）、卡死（驻留服务、阻塞/交互式、`tail -f`、无超时 sleep/脚本、无限循环、等 stdin）、越界（写项目外、路径穿越、读密钥/凭据、外发敏感数据）、并发/数据完整性（并行写同一文件）、端口/资源冲突。新增【不判断（明确排除）】：业务正确性、命令是否「必要」、测试是否合理、是否理解业务均不判断，项目内非破坏性读写/测试/本地 curl/带超时脚本由发起角色决定，不得因「看不懂业务」拦截。fail-closed 保留：有风险 deny、缺关键证据 manual、无风险 allow。deny 档特殊规则改为「风险已核对可控」口径。
- **预算明确告知**：`buildShellJudgePrompt(input, budget?)` 新增「本次读取预算（运行时解析值）」块；`createShellJudge` 每次判断调用运行时核心既有导出 `resolveShellJudgeBudget(opts.budget)` 解析一次（显式注入 > env > 缺省），同一份值注入 `ShellJudgeToolOptions.budget` 与请求提示，避免提示与实际限制分叉。`CreateShellJudgeOptions` 增可选 `budget`；新增 `formatShellJudgeBudgetBytes`（整 KiB / 精确字节）。提示要求预算耗尽时 manual 并写明缺哪项具体证据。
- **文案去「业务不必要」**：`reasonCode:"necessary"` 保留兼容，语义改为「风险审查通过（无系统风险）」；deny 兜底 / 防循环 / 默认客户说明均改为系统风险口径（不再出现「不必要」）。工具面、规则层 (c)、verdict 结构与读取损伤降级逐字未动。

**测试**：新增 `test/编排/shell-judge-risk-scope.test.ts` 13 例（rubric 五类风险；排除业务必要性；预算来自注入与 env 解析且同时进入提示/工具；无风险 allow / 有风险 deny / 缺证据 manual；客户文案无「不必要」）。更新 `shell-judge-read-discipline.test.ts` 一处语义断言（「是否必要」→「是否存在系统风险」），覆盖强度不降。`test/编排/**` **612 计 612 过 0 红 0 skipped**（基线 599，+13）；`npm run typecheck` **exit 0**。

**跨角色请求**：① 运行时核心将 `resolveShellJudgeBudget`/`ShellJudgeBudget` 登记为跨角色只读契约或收敛到 `common/shared/`（本批只读使用既有导出，未改 runtime-core；policy.ts 头注释仍写「不跨角色导出」）；② `src/provider/runtime/schema.ts` 的 `report_shell_judgement` 工具说明仍是「allow = necessary / deny = not necessary」旧口径，需属主同步为系统风险口径，避免与编排系统提示冲突。

**边界与残余**：提示只能引导，硬约束仍是运行时核心只读工具/预算与编排读取损伤降级；项目内命令若实际触及五类风险仍会 deny/manual（风险审查本职）。未 git 提交；未读 `.env`、未跑真实模型。详见[变更记录](docs/change/2026-10-19_change_shell-judge-risk-scope.md)。

## 2026-10-19 — Flow YAML：`docs/flows/<flowId>.yaml` 成为唯一机器状态

**来源**：客户原话「这些全部改成yaml。」真机反复出现流程单 Markdown 表问题（`verification` 保留字被占、`verification-evidence` 缺 dispatch 记录、aborted/failed 行挡收尾门）。本批只写 `src/common/编排/**`、`src/pipeline/orchestration/**`、`test/编排/**`、本角色文档；未碰 `app/**`、其他角色文件、git 历史。

**改了什么**
- 新增 `src/common/编排/flow-state.ts`：`parseFlowStateYaml(text, flowId)`（严格 schema：flowId/version/qualityTier/steps；kind/status/evidence.kind 枚举；保留 id；done 证据；supersede 存在性/无环；未知字段/缺必填逐条 `{path,message}`）、`validateFlowEvidence(flow, ledger)`（dispatch.accepted / customer.decision / artifact.observed 与显式 `evidence.ref` 对账；只认已结算客户决定）、`evaluateFlowCompletion(flow, ledger)`（收尾门：执行步骤 done+证据、failed/blocked/aborted 未 supersede fail-closed、验收步骤 pending、无未结算决定）、`flowCompletionIssue`（旧桌面 string|undefined 薄适配）、`flowStatePath`。复用 `yaml@2.9.0`，未加依赖。**替代关系双写**：`supersededBy`（旧→新）与 `supersedes`（新→旧）归一化为「旧→新」一条边并去重，门禁 Steward 卡要求的双写不再误报环；只写一侧合法，真环与两侧矛盾仍具体 path 拒绝。
- 新增 `src/pipeline/orchestration/flow-state.ts` 薄再导出；`govern-session.ts` 同源再导出（桌面只经 Pipeline 公共出口）。
- `governance-gate.ts`：派发门禁 YAML 优先（YAML 存在即唯一机器状态，非法 fail-closed 不回落 `.md`；缺失才回落旧 `.md`）。
- `run-role.ts`：确认卡声明 `docs/flows/<flowId>.yaml|yml` 时做写前 `parseFlowStateYaml` 校验（preview 逐路径正文提取，与 `declaredPathBodies` 同源；不合法不发卡/不发行/不写账本）；`docs/flows/*.yaml` 纳入 `write-flow` 门禁路由；判断物证/`schedule-write` artifact 优先 YAML；`artifactFlowMetadata` 识别 YAML。
- `governance-judge.ts`：验收机械门槛遇 `.yaml` 走 `parseFlowStateYaml` + `evaluateFlowCompletion`（账本 errors 先行 fail-closed），旧 `.md` 保留原判定。
- `governance-judge-evidence.ts`：决策证据包的 flow 物证为 `.yaml|.yml` 时按文件名 flowId 复用 `parseFlowStateYaml`——合法 ⇒ `entry.steps = [{id,status}]`；非法/文件名 flowId 与卡片不一致 ⇒ `flow-state-invalid` + 前 8 条 `path: message`（acceptor 底线不再泛化报「缺少可解析的步骤表」）；`extractFlowExcerpts` 给「流程状态 YAML」有界摘要（flowId/version/qualityTier + steps id/kind/status/evidence），不再标「未解析」。`.md` legacy 分支逐字不变；证据包版本 v2/上限/哈希语义未变。
- `governance-judge-facts.ts` / `governance-judge-verdict.ts` / `governance-judge-prompt.ts`：缺失物证提示、schedule-write 路径匹配与 rubric 改为 YAML 口径（`.md` 迁移兼容）。
- `govern-session.ts`：`STANDARD_WORKFLOW_PROMPT` 与 Convener/verifier 纪律改为 YAML 口径（唯一机器状态 `docs/flows/<flowId>.yaml`、同名 `.md` 仅人读视图、保留 `verification`/`acceptance`、显式 `kind`/`evidence`/`supersedes`）；`governance-session.test.ts` 补断言与反向断言（不得再指示写 `.md`）。

**测试**：新增 `test/编排/flow-state.test.ts` 32 例（含替代关系双写/单侧/真环/矛盾）；`test/编排/decision-evidence-packet.test.ts` 新增 3 例（YAML-only 验收包、非法 YAML flow-state-invalid、legacy Markdown 不变）；`node --test "test/编排/flow-state.test.ts"` **32/32**；`node --test "test/编排/decision-evidence-packet.test.ts"` **19/19**；`node --test "test/编排/**/*.test.ts"` **670 计 670 过 0 红 0 skipped**（基线 635，+35）；`npm run typecheck` **exit 0**。

**跨角色**：桌面自动验收门已并发接线（调用口径见变更记录 §7）；Steward/门禁卡文本改用 YAML；运行时核心 `write_file` 对 `docs/flows/*.yaml` 的落盘前二次校验（内容漂移）归其属主；新增 pipeline 文件需在编排 boundary Section 1 补登。**残余**：O-A1 内容漂移未采纳；YAML 缺失时仍回落旧 `.md`（迁移窗口）。详见[变更记录](docs/change/2026-10-19_change_flow-yaml-state.md)。

## 2026-10-19 — 判断新增 `deny`（approval 组写卡退回重做）

**来源**：真机 Crew 的 appointment-write 写卡内容不合规（README 归属未定、tester boundary 混入 Markdown 散文），判断 agent 只能 manual，客户被迫手批。客户原话「这个按理说不是应该替我决策的会让他重新搞吗」。本批未改 `app/**`、`test/测试/**`、运行时核心 schema。

**改了什么**
- `src/model/runtime.ts`：`GovernanceJudgeOutcome.verdict` 扩为 `approve | deny | manual`。
- `governance-judge-verdict.ts`：三值规范化（approve/deny 必须有非空 reason）；deny 仅 approval 组，返回 reasonCode（默认 `model-deny`；允许安全名单具体码）/reason/evidence/读取统计，无 value/paths/pathDecisions；decision 组 deny ⇒ manual（不代客户拒绝）；`governanceJudgeAuditFromOutcome`/有界审计保持可用。
- `governance-judge.ts`：deny 走 `governance-judge.deny` 日志（不记 manual）；证据哈希复核仅 approve。
- `governance-judge-prompt.ts`：输出契约三值；approval rubric 明确「内容/路径/完整性/一致性不合规且可修 ⇒ deny，reason 写清哪条不合规 + 应怎么改」；decision 组 manual reason 必须是可操作返工说明（哪条偏离意图/应怎么改/重发给谁）；manual 只留给判断无法完成；删除全局「从不替客户拒绝」表述（decision 组保留）。
- `run-role.ts`：桌面以 `declined`（operatorId=`judge:<engine>`）回投 deny 时，`recordCustomerDecision` 跳过写 `customer.decision`（不污染账本/不挡收尾门）。
- 治理判断的 manual 文案统一改为中性可操作表述（「请修正/补齐/缩小…后重新提交」），不再出现「已转手动确认」；读取被拒保留逐路径摘要并改为「请补齐判断所需证据（或缩小读取范围）后重新提交」。shell judge 文案未改。

**测试**：`governance-judge.test.ts` **60/60**（+4：deny 规范化/approval 合法/decision 回落 manual/审计字段；prompt 三值；driver deny 日志不记 manual；decision manual 返工原因原样保留 + approval manual 可操作修正）；`governance-session.test.ts` **26/26**（+1：judge deny 回投不写客户决定账本）；`test/编排/**` **675 计 675 过 0 红 0 skipped**；`npm run typecheck` **exit 0**（全仓）。

**跨角色**：运行时核心 `report_governance_judgement` schema 加 `deny`（已由协调者单独排）；桌面 deny/manual 映射（开关开启时一律 declined+原因回投）由桌面属主收口（本批只读核对，未改 `app/**`）；测试角色旧双值断言按需更新。详见[变更记录](docs/change/2026-10-19_change_judge-deny-approval.md)。

## 2026-10-20 — 看护文案同步：开关开启自动中止 / 自动执行恢复

桌面已实现 watchdog 自动中止（开关开启时，内置治理角色/Convener 超过 15min 自动 abort；开关关闭才保持只检查 + 1h 兜底）与恢复提议自动执行。本批只改 `src/common/编排/watchdog.ts::SIGNAL_SUGGESTIONS` 文案与 `test/编排/watchdog.test.ts` 断言，**不改检测/执行逻辑，不改 `app/**`**：
- `turn-deadline`：「开关开启且超过自动中止时限 ⇒ 桌面自动中止本轮；开关关闭 ⇒ 只检查、不中止（1 小时最后兜底）。开关开启时 propose_recovery 由桌面自动执行，关闭时需客户确认。」
- `queue-stuck` / `repeat-fail`：「需客户一键确认后由应用执行」→「开关开启时桌面自动执行，关闭时需客户一键确认」。

**证据**：`watchdog.test.ts` **11/11**；`test/编排/**` **675 计 675 过 0 红 0 skipped**；`npm run typecheck` **exit 0**（全仓）。

## 2026-10-20 — 治理 confirm 卡缺 `cardKind` 按角色/路径兜底

**来源**：真机 Convener 的写治理记录卡 `request_confirmation` 未带 `cardKind` ⇒ `governedInput` 不计算 `judgeContext` ⇒ 桌面 `planJudge` 返回 undefined，卡片直接呈现客户；客户问「这个为啥还需要我审核呢」。本批只改 `src/pipeline/orchestration/run-role.ts` 与 `test/编排/**`，未改 `app/**`。

**改了什么**
- `governedInput` 在 trio + confirm + 缺 `cardKind` + 声明路径可提取时按角色兜底：Convener 全部路径为 `docs/flows/<id>.yaml|yml` ⇒ `schedule-write`，否则 `write`；Rapporteur/Verifier ⇒ `write`；Nominator 全部路径在 `角色卡/<id>/` 下 ⇒ `appointment-write`，否则 `write`；Liaison/其他不猜；choice 卡与无路径卡不兜底。
- 兜底值同时写入传给桌面的 request 与 metadata，并继续走既有 `TRIO_CARD_KINDS` 白名单、preview 完整性闸、Flow YAML 写前校验、`computeJudgeContext` 与 `recordCustomerDecision`；诊断 `governance.cardKind.defaulted`。显式 `cardKind` 永远优先，显式非法值仍拒绝。

**测试**：新增 3 例（Convener flow YAML ⇒ schedule-write + judgeContext；Convener 治理记录 ⇒ write；Rapporteur ⇒ write；Nominator 角色卡 ⇒ appointment-write；显式非法 cardKind 仍拒；choice 不兜底）+ 扩展 single/su/项目角色零变化；`governance-judge.test.ts` **63/63**、`test/编排/**` **678 计 678 过 0 红 0 skipped**、`npm run typecheck` **exit 0**（全仓）。详见[变更记录](docs/change/2026-10-20_change_governance-cardKind-default.md)。

## 2026-10-20 — Flow 文件方法化（编排侧核心）+ 项目角色 artifact 观察

**来源**：客户拍板「按这个方案做吧」。应用是 `docs/flows/<flowId>.yaml` 唯一写者；角色改用 `flow_get` / `flow_step_update` / `flow_step_supersede`。本批只写编排边界，未改 `src/model/runtime.ts`、`src/provider/**`、`app/**`、`test/测试/**`。

**改了什么**
- 新增 `src/common/编排/flow-service.ts`：`createFlowService({projectRoot, actorRoleId, actorPower, defaultFlowId?, writeFile?})`，实现 `get`/`update`/`supersede`；类型单一来源＝运行时 `FlowTool*` 契约（再导出，不复制）。per-project 串行队列；`revision=sha256(file bytes)`；`expectedRevision` 不符 ⇒ `revision-conflict`；Steward/owner 权限与迁移表；`done` 证据 kind 对应 + `validateFlowEvidence` 对账（目标 stepId 过滤）⇒ `insufficient-evidence`；幂等（同 status/evidence 不写盘）；原子写（共享 `atomic-write`，失败 `write-failed` 不破坏原文件）；`supersede` 旧→superseded/new→pending 且非验收保留 id；诊断 `flow.update`/`flow.supersede`/`flow.conflict`。
- `run-role.ts`：每会话创建 flow service；`flowGet` 注入所有角色，`flowStepUpdate`/`flowStepSupersede` 只注入内置治理角色；缺省 flowId 用调用时 `currentFlowId`；能力经 `createRuntimeAdapterFactory` spread 透传到运行时核心三工具。
- **项目角色 artifact 观察**（真机证据缺口）：`scanPreauthorizedArtifacts` 的观察目录，内置角色仍用 `preauthorizedDirs`；项目角色用 boundary `kind:"directory"` + `root:"project"` 的目录（tester `test/`、`scripts/`，backend `src/`，frontend `public/` 等），去重合并；排除 `.ans/`、`角色卡/`、空/绝对/`..`。settle 后对新增/变更 `.md` 追加 `artifact.observed`，项目角色 `power="project"`（`GovernancePower` 新增该值）。single/su 项目零账本副作用。
- 错误码按运行时/角色卡统一：`revision-conflict`、`insufficient-evidence`；其余 `forbidden`/`invalid-transition`/`invalid-flow`/`step-not-found`/`step-exists`/`invalid-supersede`/`ledger-unavailable` 不变。

**测试**：`flow-service.test.ts` **11/11**；`governance-judge.test.ts` **64/64**（+1 注入断言）；`governance-session.test.ts` **27/27**（+1 项目角色 artifact 观察/对账）；`test/编排/**` **691 计 691 过 0 红 0 skipped**；`npm run typecheck` **exit 0**（全仓）。详见[变更记录](docs/change/2026-10-20_change_flow-service.md)。

## 2026-10-20 — Lead（Liaison）设为工作流管理者

**来源**：客户拍板「按这个做吧」——把主理 Lead 设为工作流管理者，可和所有职能角色沟通。本批未改 `app/**`、`src/provider/**`、门禁卡；未 git 提交。

**改了什么**
- `governance-gate.ts`：`GovernanceGateAction` 增加 `coordinate`；新增 `evaluateCoordinateGate`——仅 Liaison→Convener，`flowId` 必填、`stepId` 可选；不要求提案接受/任命/流程步骤/未派发去重；其他来源/目标 `forbidden`、缺 flowId `missing-flow-id`。`dispatch` 五条零放宽。
- `run-role.ts`：新增导出 `governanceDispatchActionFor(roleId,targetRoleId)`——Liaison→Convener 选 `coordinate`，其余 `dispatch`；`dispatchTask` 能力注入不变（门禁引擎已给 Liaison 打开）；`flowGet`/`flowStepUpdate`/`flowStepSupersede` 注入不变。
- `flow-service.ts`：管理者判定扩为 `schedule`（Steward/Convener）或 `liaison`（Lead）；Lead 的 `canUpdate`=全部未终态，可 update/supersede；证据/revision/串行/原子写校验不变；错误文案「Steward/Lead」。

**测试**：governance-gate 新增 coordinate 正反例；governance-judge 新增 action 选择 + Liaison 端到端 coordinate/dispatch；flow-service 新增 Lead manager；liaison-session 能力矩阵更新；`test/编排/**` **695 计 695 过 0 红 0 skipped**；`npm run typecheck` **exit 0**（全仓）。详见[变更记录](docs/change/2026-10-20_change_lead-workflow-manager.md)。

## 2026-10-20 — choice 卡缺 `cardKind` 按角色兜底（Lead intent-confirm 可代批）

**来源**：真机 bookmank op-1 需求确认卡没有 judge 事件——Lead 的 `request_choice`（intent-confirm）没带 `cardKind`，`governedInput` 只对 confirm 卡默认。客户要求「勾了替我决策就不用我管」。本批未改 `app/**`、`src/provider/**`、门禁卡。

**改了什么**
- `run-role.ts`：choice 卡缺 cardKind 时按角色默认（Liaison=intent-confirm、Rapporteur=proposal、Nominator=appointment、Verifier=acceptance；Convener/项目角色不默认），仅当在 `TRIO_CARD_KINDS` 白名单内且选项形状匹配（Liaison 含 confirm、Rapporteur/Verifier 含 accept）；兜底值写入 request/metadata，继续 `computeJudgeContext` 与判断；诊断 `governance.cardKind.defaulted{kind:"choice"}`。
- `src/model/runtime.ts`：`GOVERNANCE_CARD_GROUP` 增加 `"intent-confirm": "decision"`（推翻 2026-10-18「永不介入」旧口径）。
- `governance-judge-facts.ts`：`requiredArtifactPaths` 对 intent-confirm 不强制物证。
- `governance-judge-verdict.ts`：intent-confirm 仅代批 confirm（revise/多选 manual、缺 confirm 选项 manual）；`isConfirm` 收窄为 write/appointment-write/schedule-write（修复 intent-confirm 被误返回 confirmed:true）。
- `governance-judge-prompt.ts`：新增 intent-confirm rubric（意图摘要与客户要求一致 ⇒ confirm；偏离/无法核对 ⇒ manual 可操作返工）；通用 intent 门槛只对 proposal/appointment/acceptance。
- **Liaison 通用 choice 门控**（同日真机补充）：Lead 的 `request_choice` 无 confirm 选项（keep-v1/do-v2/lead-decide）⇒ `declined` + 指导（内部协调/工程决策，Lead 自行决定或 dispatch_task/flow_step_update），不发卡、不调判断、不写账本；显式 intent-confirm 缺 confirm 同样 declined；选项含 confirm 仍走默认+判断；其他角色零变化；诊断 `governance.choice.rejected`。

**测试**：新增 choice 默认全角色 + intent-confirm 裁决正反例 + Liaison 通用 choice/intent-confirm 缺 confirm 拒绝；既有「无 cardKind 普通选择不写账本」回归保持（选项形状守卫）；`test/编排/**` **699 计 699 过 0 红 0 skipped**；`npm run typecheck` **exit 0**（全仓）。**跨角色**：`test/runtime-core/governance-judge.test.ts:48-64` 仍钉旧映射会红（需其属主更新）；`src/provider/runtime/tools.ts:200` 注释与门禁引擎 Lead 卡文案需同步。详见[变更记录](docs/change/2026-10-20_change_choice-cardKind-intent-confirm.md)。

## 2026-10-20 — 验收 accepted 后补收口：`completeAcceptanceStep`

**来源**：真机 bookmark-manager——verifier 第二轮复核完成，验收卡被判断 agent 代批 accept，账本已有 `customer.decision{decisionKind:"acceptance",customerDecision:"accepted"}`（04:56:18），但 flow YAML 的 `verification` 仍 pending；`evaluateFlowCompletion` 已判定「已有验收决定，流程已收口」，04:56:55 又重复派了一次 verifier。本批只写编排边界，未改 `app/**`、`src/provider/**`、`test/测试/**`。

**改了什么**
- `src/common/编排/flow-service.ts` 新增并导出 `completeAcceptanceStep({projectRoot, flowId})`（**应用专用，不注册为角色工具**）：
  - 读 flow YAML；找保留验收步骤（`verification`/`acceptance`，kind acceptance）；已 done ⇒ `{ok:true,idempotent:true,revision,flow}`；
  - 读账本；必须存在该 flowId 的 `customer.decision{decisionKind:"acceptance",customerDecision:"accepted"}`；缺失（含 rejected）⇒ `acceptance-not-accepted`；账本坏行 ⇒ `ledger-unavailable`；缺保留验收步骤 ⇒ `acceptance-step-missing`；
  - 把验收步骤设为 `status:"done"`、`evidence:{kind:"acceptance",ref:"acceptance"}`（保留其他步骤/supersedes/顺序）；候选 YAML 复核通过后原子写；并发/revision 沿用 per-project 串行队列；诊断 `flow.acceptance.completed`；
  - **不写客户决定账本、不伪造客户批准**。
- `src/pipeline/orchestration/flow-state.ts` 公共出口再导出（桌面只消费公共出口）。

**测试**：`flow-service.test.ts` **17/17**（+5：accepted+pending ⇒ done+acceptance 证据/幂等；无 accepted/rejected ⇒ acceptance-not-accepted 文件不变；坏账本/非法 flow 不写盘；只读目录原子写失败原文件不变；并发两调用一完成一幂等）；`test/编排/**` **704 计 704 过 0 红 0 skipped**；`npm run typecheck` **exit 0**（全仓）。

**跨角色**：桌面在 acceptance check / verifier settle 检测到 accepted 时调用 `completeAcceptanceStep`，并在同处跳过/去重 verifier 重派。详见[变更记录](docs/change/2026-10-20_change_flow-service.md) §3.6。

## 2026-10-20 — 项目角色 artifact 观察扩展（非 `.md` + boundary file 条目）

**来源**：真机短链接项目 flow 的 `integration-e2e`（owner test，artifact，`test/e2e-fullstack.test.js`）与 `verification-evidence`（owner backend，artifact，`README.md`）已 delivered，但账本无对应 `artifact.observed`——项目角色观察仍只扫 boundary directory 的 `.md`，`.js` 与 boundary `kind:file` 条目不观察，Steward/Lead 标 done 被 `insufficient-evidence` 拒。

**改了什么**
- `run-role.ts` 项目角色扫描扩展：boundary directory 递归不再只收 `.md`，收录 `.md/.js/.mjs/.cjs/.json/.html/.css/.txt/.yaml/.yml/.png/.jpg/.jpeg/.webp/.svg`；同时收录 boundary `kind:"file"` 且 `root:"project"` 的文件（README.md、package.json 等）；单文件上限 2MiB，文本扩展名含 NUL 的明显二进制跳过并记诊断 `governance.artifact.skipped`。
- 排除 `.ans/`、`角色卡/`、`node_modules/`、`.git/`、`docs/audit/`、符号链接、项目外；去重；未变更不重复。
- 内置治理角色继续用 `preauthorizedDirs`（仍只 `.md`）；single/su 零账本副作用不变。

**测试**：tester 写 `test/evidence/foo.md` + `test/e2e-fullstack.test.js` ⇒ 两条 observed；二进制/超大/`node_modules`/私有路径跳过；`.md`/`.js` 两个 artifact 步骤 `validateFlowEvidence` 通过；backend boundary file 条目 README.md/package.json 观察与对账；未变更不重复；`governance-session.test.ts` **28/28**、`test/编排/**` **705 计 705 过 0 红 0 skipped**、`npm run typecheck` **exit 0**（全仓）。详见[变更记录](docs/change/2026-10-20_change_flow-service.md) §3.5。

## 2026-10-20 — 旧证据补偿：`observeFlowArtifacts`

**来源**：短链接项目的 `integration-e2e`（`test/e2e-fullstack.test.js`）与 `verification-evidence`（`README.md`）是旧扫描规则下写的；重启后新扫描把它们当基线，不会补 `artifact.observed`，Steward 仍被 `insufficient-evidence` 拒。

**改了什么**
- `flow-service.ts` 新增并导出 `observeFlowArtifacts({projectRoot, flowId})`（应用专用，非角色工具；经 `pipeline/orchestration/flow-state.ts` 公共出口导出）：
  - 读 flow YAML，遍历 `kind:"artifact"` 且有 `evidence.ref` 的步骤（status 不限）；
  - 路径安全（绝对/URL/`..`/项目外/`.ans`/`角色卡`/`.git`/`node_modules` 拒绝）、常规文件、≤2MiB、文本 NUL 探测；
  - 账本已有同 path+sha 的 `artifact.observed` ⇒ 幂等跳过；否则追加 `artifact.observed{actorRoleId: step.owner, power: 内置角色按 function/否则 project, artifactPath, artifactSha256, flowId}`；
  - 不写 `customer.decision`；missing/超限/二进制/路径越界进 `skipped`；流程/账本不可读或 append 失败返回 `ok:false`，不抛；共享 per-project 串行队列。

**测试**：`flow-service.test.ts` **20/20**（+3：`.js`/README/契约补记与幂等；missing/超限/二进制/路径越界 skipped 且不写客户决定；`..` fail-closed）；`test/编排/**` **708 计 708 过 0 红 0 skipped**；`npm run typecheck` **exit 0**（全仓）。

**跨角色**：桌面在 delivered → Steward/Lead 唤醒前调用 `observeFlowArtifacts`，再唤醒 Steward/Lead。详见[变更记录](docs/change/2026-10-20_change_flow-service.md) §3.7。

## 2026-10-20 — v1.4.0 发布 CI 首跑：Windows 无界 grep 漏判 + 原子写用例平台真值

**来源**：v1.4.0 发布 CI 首跑 **run 39389502551**（`0210e2b`，windows-2025「Regression tests」3357 计/3351 过/3 红/3 skipped）。两处属编排：① `shell-command-guard.test.ts:176` 的 `grep -r foo D:\a\ans-studio\ans-studio\.release\source` 得到 `allow`（应 `deny`）——真实产品缺陷；② `flow-service.test.ts:607` 原子写失败用例 `actual true`（应 `false`）——Windows 上目录 chmod 不阻止写入的测试平台真值问题。另两处红（收尾推进 settle、Pi 配置派发）不属本批，未碰。

**改了什么**
- `src/common/编排/shell-command-guard.ts`：① 非引号切分对 Windows 盘符绝对路径（`^[A-Za-z]:[\\/]`）与 UNC（`^\\\\`）保留 `\` 作路径分隔符（空白/元字符前仍走 POSIX 转义，不切词/不切命令）；② 双引号内 `\` 只对 `$`、反引号、`"`、`\`、换行转义，其余保留字面反斜杠；③ `isWidePath` 对 Windows 绝对路径用 `path.win32` 归一比较（大小写不敏感、分隔符统一、去尾分隔符），判定不依赖宿主平台。POSIX 转义/引号/管道/命令替换与无界搜索判定未放宽。
- `test/编排/shell-command-guard.test.ts`：新增平台无关回归 1 例：未加引号/双引号包裹的 `D:\…\.release\source`、含空格的 Windows 根（`\ ` 转义）、UNC 项目根、UNC 共享根 ⇒ deny；具体子目录/文件 ⇒ allow 对照。
- `test/编排/flow-service.test.ts`：`completeAcceptanceStep：原子写失败` 保留 POSIX 目录 `0o500`；`win32` 分支改为把目标 `docs/flows/flow-a.yaml` 设 `0o444`（rename 覆盖只读目标 ⇒ ERROR_ACCESS_DENIED/EACCES·EPERM，重试上界耗尽 ⇒ write-failed），finally 恢复 `0o644`；断言不放宽，并补「恢复后可正常再写一次」。

**测试**：`shell-command-guard.test.ts` **17/17**；`flow-service.test.ts` **20/20**；`test/编排/**` **709 计 709 过 0 红 0 skipped**；`npm run typecheck` **exit 0**（全仓）。

**残余**：Windows 结论仅由 CI 原生 runner 实测（本机 macOS）；win32 原子写分支依赖「rename 覆盖只读目标 ⇒ ERROR_ACCESS_DENIED/EACCES·EPERM」语义，若不符该用例会在 CI 红而非静默放宽；未重跑发布 CI。详见[变更记录](docs/change/2026-10-20_change_v1.4.0-ci-windows-guard-atomic-write.md)。
