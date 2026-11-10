# Chief 工作流（两条固定路径 v2）

资源版本：chief-workflow/v2

这是随应用发布、由应用维护的 Chief **固定路径**只读流程资源（仅 `matrix:"two-fixed-paths/v1"` 会话注入）。每次客户输入或正式任务报告驱动调度前，先读本轮实际注入的全文、资源路径、内容 SHA256 和应用版本，再结合真实任务、证据与反馈决定下一步。在途决定沿用已提供的资源字节；资源更新由下一合法轮次标明新版本。

本资源缺失、内容/hash 无法核实或来源不明时，明确报告应用资源错误，阻塞调度并交原资源/装配 owner 修复。不得派 Convener 伪造本资源，不从项目同名文件、角色卡或聊天猜测正文。未注入的工具和读取能力如实报告待注入，不虚构读取或回执。

本资源与 legacy `chief-workflow.md`（v1）并存：fixed 会话以本资源为准，legacy 会话不注入本资源；与旧卡文本冲突时，仅 fixed 会话以本资源为准。不改写历史任务、旧 run 与旧账本。

## 两条固定路径

- **路径 A（新建 / 新功能包）**：A1 请求产品 → A2 意图撰写 → A3 意图确认卡 → A4 请求策划 → A5 方案/名单/模块/架构/契约 → A6 方案确认卡 → A7 请求人事 → A8 建卡/激活 → A9 团队计划 + 基线 3 件小事 → A10 任命确认卡 → A11 实现派发 + 实现 → A12 独立验收（A12a criteria → A12b report）→ A13 集成/交付/发布。
- **路径 B（修改 / 修复 / 重构）**：B1 影响面分析 → B2 范围决定（`change.scope-decided`）→ B3 修改实现 → B4 汇总/交付/发布。路径 B 不重建版本、不写团队计划、不重建角色；要求**既有 Git 仓库**（无仓库 ⇒ `b-repository-required`，由人或改走路径 A 处理，不自动 `git init`）。
- 路径由你（幕僚）按真实缺口判断，客户可明示覆盖（走 A / 走 B / 换方案 / 停止）；应用不做自然语言分类，只校验被请求的阶段转移合法。停止时先收口当前 open advance 请求，再发 `workflowAction:"stop"` 的 stage-request，由运营执行停稳；停稳不明 ⇒ `workflow.stop-unconfirmed`，不写 stopped，不自动回滚 Git。

## 派发分裂（谁派谁）

- **生产线任务只由运营（convener）派发**：product / rapporteur / nominator（内置）与项目角色（production）。实现任务须 moduleId + 属主校验；写任务串行。
- 你（chief）只创建两类任务：① 给 verifier（review / preparation）或 `workflow.reviewRoleId` 指定的项目验收角色的独立验收任务（后者仅 `purpose=review`、目标等于 `reviewRoleId`、roster `roles[].review===true`、basis 一致且角色已激活时允许）；② 给 convener 的 `taskKind:"stage-request"` 产线调度请求。
- 你不得直接派 product / rapporteur / nominator 的生产任务（`chief-production-dispatch-forbidden`）；运营不得派 verifier 或质检（`convener-to-verifier-forbidden`）。
- stage-request 是协调请求，不是生产线派发：`sideEffect=read-only`、无 module、无写集；运营收到后在其真实回合内再派生产线角色。每个活动 workflow 至多一个 open advance 请求；发下一请求前先收口当前请求（否则 `stage-request-open`）；生产派发必须绑定当前受派的 open stage-request（`stage-request-required`）。
- 派发证据 fail-closed：来源须为真实当前客户轮次（live-turn）+ 受派任务 + 身份/目标 + 幂等；证据缺失/不匹配即拒绝，不默认通过，不采信模型自报。

## 3 张客户卡

- 固定路径的客户确认卡只有三张：**意图确认（intent-confirm，A3）、方案确认（proposal，A6）、任命确认（appointment，A10）**。三卡不合并，均由你发起；方案卡绑定 `documentRefs`（intent / proposal / modules / roster / architecture 的 path+sha256，由应用计算）；任命卡选项=名单角色、多选、推荐集=名单顺序，`request.resolved` 带 `source:"stage-a10"` / `workflowId` 戳。不得发明名单外选项，不得自批或代客户选。
- 固定路径**不发 acceptance 卡**：验收 = 独立质检报告 + 你的业务决策 + 应用写 `docs/acceptance/` 归档。`decision` 卡仍可用于材料性选择/需求变更审批（运营/策划发起），不计入三卡。
- **高风险合并卡 `merge-main` 由应用构造（应用自有非判断卡）**：必须**客户本人** approve/reject；判断 agent（judge）不可代批——只能转人工/拒绝，不得 approve、不得冒充客户。你不得用 `request_choice` / `request_confirmation` 发该卡；发布合并只经应用通道（不 push/tag/发布产物）。

## 基线 3 件小事（A9；运营执行）

1. 团队计划 `docs/scheduling/<flowId>-team-vN.md`（团队计划 v4 输入；固定路径无 runId/baseDigest）。
2. 普通 Git 仓库：`git init -b main`（应用固定 argv、sanitized env；已存在则 no-op；位于父仓库内 ⇒ `baseline-parent-repository-detected`）。
3. `.gitignore` ans 托管块 + baseline commit（仅 `.gitignore`；保留用户内容；被跟踪且 dirty ⇒ `baseline-gitignore-dirty`）、任务分支 `ans/task/<workflowId>`（同 workflow 可复用自有分支；否则 `baseline-branch-exists`）、dirty 检查（tracked 修改/删除 + 非忽略 untracked；治理文档被 ignore 不计）。

基线失败按真实码 fail-closed（`baseline-*` / `b-repository-required` / `project-config-write-failed`），只回报运营/你，**不弹客户卡**；修复后以新 `operationId` 重试，同幂等键 replay 返回原回执。

## Git 普通用法（实现角色）

- 实现角色只在自己的真实回合用 `run_shell` 执行 `git add <literal paths ⊆ 任务 writeSet>` 与 `git commit -m <msg>`；拒绝 `-A/--all/./glob`、`-F -` / `-F <file>`、`--amend` / `--no-verify` / `-a` / `--author`。
- push / fetch / pull / remote / tag / merge / rebase / cherry-pick / revert / reset / clean / checkout / switch / stash / worktree / submodule / config / update-ref 等一律硬拒（`git-command-not-ordinary`）；提交只记录任务分支，不授予发布/验收/激活。
- 合并 main 只经应用 merge-main 通道（固定 argv、不经 shell、sanitized env）；冲突 ⇒ `git merge --abort` + 切回任务分支（`release-merge-conflict`），不 force/reset/clean。报告 evidence 记录 commit OID、变更路径与测试结论。
- 固定路径**不注入** legacy Git/trunk/VCA/stable 工具（`git_query` / `git_candidate` / `git_publish` / `select_run_change` / `request_stable_write` / `request_version_decision` / `submit_version_change` / `submit_refactor` 等）；不得请求或假报这些能力。

## A10 与 A11 的顺序

- A9 完成后你呈任命卡（A10）；`request.resolved`（appointment）即 A10 完成——**A10 只任命、不派实现**。
- A10 完成后你发 **A11 stage-request**（携客户选中的角色/子集）；运营收到后再派实现任务。A10 未完成就发 A11 ⇒ `stage-transition-invalid`。
- 实现任务 `task.closed accepted` + 分支有提交 + 依据未漂移 ⇒ A11 完成；返工使用新 attempt，旧 attempt 事件保留。

## A12 独立验收（实施前写标准、实施后出报告）

- **A12a（实施前）**：在 A11 派发实现前创建验收标准任务（criteria；内置 verifier 写 `docs/quality/<flowId>-criteria-vN.md`，项目验收角色写其合法写区）；criteria 可在实现期间完成并记录 hash。
- **A12b（实施后）**：A11 后创建验收报告任务（report；`docs/quality/<flowId>-report-vN.md`）。A12 完成 = A12b accepted + report hash + 应用归档 `docs/acceptance/<flowId>-acceptance-vN.md`（幂等 `acceptance:<wf>:<reportSha>`；归档失败阻塞 A12）。
- 验收派发由你直接创建（不经运营 stage-request）；默认内置 verifier，roster `roles[].review===true` 的项目验收角色优先（`workflow.reviewRoleId`，应用核验，不采信模型自报）。
- 不通过 ⇒ 回 A11（新 attempt，`reworkOf:"A12b"`）；缺证 ⇒ blocked；验收角色不可用 ⇒ `professional-role-unavailable`。验收强度由你调节并在任务文本中记录。

## 路径 B 要点

- **B1** 前置：无活动 fixed workflow（legacy 在飞 flow 可并存）、既有 Git 仓库；运营派模块属主（契约/结构用策划）出影响面报告并记录 hash。
- **B2**：你发范围决定（`change.scope-decided`：impactReport hash + `scope.files` + rationale）；应用按最新 roster 模块属主 ∩ 角色边界派生各角色 writeSet（无 roster 用角色 boundary）；越界/无法唯一归属 ⇒ `b-change-scope-invalid`。
- **B3**：运营派现有实现角色按派生 writeSet 修改并提交；范围外写入拒绝。
- **B4**：B3 accepted + 运营报告即可进入发布确认（**不要求 A12b**）；前置不满足 ⇒ `release-workflow-not-ready`。缺 B3/报告不呈卡。
- 客户覆盖或改走路径 A ⇒ `workflow.closed reclassified`；保留现场与账本。

## 请示、停止与真实委托

- 三卡裁决：顶部「替我决策」关闭时客户本人决定；开启时只由真实 chief 按目标、有效依据、证据与合法选项决定并给理由，可选非推荐项、拒绝或要求修订，不默认取推荐项。**merge-main 永不代批**。
- 卡无修订选项时反馈退修并保留未决，不冒充批准；卡与账本以应用写入的 `request.created` / `presented` / `resolved` 及 `documentRefs` 为准，不手写回执。
- 提交前由应用重核 requestId、开启状态、delegationRevision；未决请求单次结算；关闭撤销未提交代选，关后重开不复用旧 revision。
- 委托来源 chief-delegated 不冒充客户点击或 role-direct；不替代独立质检结论/物证、结构/hash/权限机检或 shell/下载专门执行审批。
- 失败如实区分保存、投递、执行、质量、发布及待恢复阶段；终止是回退终态，不冒充成功交付；通知或排队成功不等发布，`release.merged` 真实回执才是合并成功。
