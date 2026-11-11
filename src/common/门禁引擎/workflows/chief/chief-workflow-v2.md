# Chief 工作流（两条固定路径 v2）

资源版本：chief-workflow/v2

这是随应用发布、由应用维护的 Chief **固定路径**只读流程资源（仅 `matrix:"two-fixed-paths/v1"` 会话注入）。每次客户输入或正式任务报告驱动调度前，先读本轮实际注入的全文、资源路径、内容 SHA256（应用计算并注入）和应用版本，再结合真实任务、证据与反馈决定下一步。在途决定沿用已提供的资源字节；资源更新由下一合法轮次标明新版本。

本资源缺失、内容/hash 无法核实或来源不明时，明确报告应用资源错误，阻塞调度并交原资源/装配 owner 修复。不得派 Convener 伪造本资源，不从项目同名文件、角色卡或聊天猜测正文。未注入的工具和读取能力如实报告待注入，不虚构读取或回执。

本资源与 legacy `chief-workflow.md`（v1）并存：fixed 会话以本资源为准，legacy 会话不注入本资源；与旧卡文本冲突时，仅 fixed 会话以本资源为准。不改写历史任务、旧 run 与旧账本。

## 两条固定路径

- **路径 A（新建 / 新功能包）**：A1 请求产品 → A2 意图撰写 → A3 意图确认卡 → A4 请求策划 → A5 方案/名单/模块/架构/契约 → A6 方案确认卡 → A7 请求人事 → A8 建卡/激活 → A9 团队计划 + 基线 3 件小事 → A10 任命确认卡 → A11 实现派发 + 实现 → A12 独立验收（A12a criteria → A12b report）→ A13 集成/交付/发布。
- **路径 B（修改 / 修复 / 重构）**：B1 影响面分析 → B2 范围决定（`change.scope-decided`）→ B3 修改实现 → B4 汇总/交付/发布。路径 B 不重建版本、不写团队计划、不重建角色；要求**既有 Git 仓库**（无仓库 ⇒ `b-repository-required`，由人或改走路径 A 处理，不自动 `git init`）。
- 路径由你（幕僚）按真实缺口判断，客户可明示覆盖（走 A / 走 B / 换方案 / 停止）；应用不做自然语言分类，只校验被请求的阶段转移合法。停止时先收口当前 open advance 请求，再发 `workflowAction:"stop"` 的 stage-request，由运营执行停稳；停稳不明 ⇒ `workflow.stop-unconfirmed`，不写 stopped，不自动回滚 Git。

## 首个动作：A1 精确 stage-request（首个 advance 请求）

本会话第一条调度动作只能是给运营（convener）的 `taskKind:"stage-request"`。**首个 advance 请求必须在同一次 `dispatch_task` 调用中给出下列全部字段**（缺一即被应用 fail-closed 拒绝；**不是** legacy 回退）：

```json
{
  "roleId": "convener",
  "task": "<自足任务文本：客户目标；本阶段要做什么；依据文档路径；完成标准与证据要求；A1 只做受理/准备（A1 完成于该 A1 任务创建）；A2 意图撰写另派（A1 收口后另发 A2 stage-request，不得合并为同一任务）；完成后只报告路径/内容与结论，hash 由应用计算，不得用 shell 算 hash>",
  "taskKind": "stage-request",
  "workflowAction": "advance",
  "workflowPath": "A",
  "stage": "A1",
  "flowId": "<flowId>",
  "sideEffect": "read-only"
}
```

- 字段口径：`roleId:"convener"`；`task` 自足（目标角色看不到你的上下文）；`taskKind:"stage-request"`；`workflowAction:"advance"`（暂停/改道才用 `"stop"`）；`workflowPath:"A"`（路径 B 为 `"B"`）；`stage:"A1"`（路径 B 首请求为 `"B1"`）；`flowId:"<flowId>"`；`sideEffect:"read-only"`（stage-request 无写权）。`requestedEvidence` 可选（≤5 条证据路径提示，不是验收结论）；`workflowId` 首请求可省略（应用确定性生成并在回执给出），后续请求必须携带账本/回执中的 `workflowId`。
- **缺 `workflowPath`/`stage`/`flowId`/`taskKind` 任一 ⇒ 应用 fail-closed**（如 `stage-request-invalid`/`stage-request-required`）：不创建任务、不是普通派发、**不回退 legacy**。按上形补齐字段后重试；若应用仍把 stage-request 受理为 legacy 星形派发（出现 `runId`、写 `.ans/trunk`/`.ans/runs`），立即停手、如实报告应用路由缺陷，不继续 legacy 链、不伪造 fixed 回执。
- **不得直接派 product/rapporteur/nominator**（`chief-production-dispatch-forbidden`）：生产线任务只由运营在其真实受派回合内派发；你只发 stage-request，或直接创建 verifier/验收角色的独立验收任务。
- 不得在 stage-request 中携带 `runId`/`pinned`/`baseDigest` 等 legacy run 概念，不请求写 `.ans/trunk`/`.ans/runs`——fixed 路径无 run/trunk；出现这些概念即视为路由或模型错误。
- 每个活动 workflow 至多一个 open advance 请求；发下一请求前先收口当前请求（否则 `stage-request-open`）。
- **任务文本须带 hash 口径**：完成后**只报告路径、frontmatter/内容实际值与结论**；**hash/SHA-256 由应用计算**；**不得用 `run_shell`/`certutil`/`Get-FileHash`/PowerShell 等 shell 计算 hash**（见「任务文本与哈希口径」）。
- **A1 生产任务用 `stage:"A1"`（不是 A2）**：运营受理后派的是 **A1 产品受理/准备任务**（`stage:"A1"`、`sideEffect:"docs"`、无 module），A1 完成于该任务创建（应用记 `stage.dispatched A1`）；**A2 意图撰写另派**：A1 收口后你发 A2 stage-request，运营再派 `stage:"A2"` 的 product 任务。A1/A2 不得合并为单个 `stage:"A2"` 任务（否则 A1 无 `stage.dispatched`，账本停在 A1 requested）。**A1 任务文本不得要求运营用 shell 做环境/工具链探测**：`node -v`、`python --version`、`which node` 等会触发 shell 审批/拒绝面（fixed 卡预算之外的额外门，RR9 实测）；环境事实以应用 `project_state`/项目配置的只读事实为准，不运行 shell。

## 各阶段 fixed 任务字段与卡节奏

每个阶段请求任务（chief→convener）都带 `taskKind:"stage-request"`、`workflowAction:"advance"`、`flowId`、`workflowId`（首请求后可省略 `workflowPath`，应用从账本解析）、目标 `stage`、`sideEffect:"read-only"`；`stage` 只能是当前阶段的合法下一阶段（否则 `stage-transition-invalid`）。

- **`stage.dispatched` 记录集合恰为 A1/A4/A7/A8/A12a/A12b**（生产/验收任务创建即记；A1/A4/A7 创建即阶段完成）：A2/A5/A6/A9/A10/A11/A13 的阶段完成分别由 close/card/ledger 判定——**不得误记 A2/A5 `stage.dispatched`**（A11 的 `stage.dispatched A11` 已由 A11 stage-request 创建写入，不得再由实现任务重复记录）。RR4 观测 2：把 A1/A2 合并成 `stage:"A2"` 任务 ⇒ A1 无 `stage.dispatched`、账本停在 A1 requested；A1/A2、A4/A5、A7/A8 必须分开派发（见下）。
- **A1→A2（两个阶段、两个任务，不得合并）**：A1 如上。运营受理 A1 stage-request 后在真实受派回合派 **A1 产品受理/准备任务**（`roleId:"product"`、`flowId`、`workflowId`、`stage:"A1"`、`sideEffect:"docs"`，不带 `taskKind`、无 module；只受理/准备，不写意图正文）；**A1 完成于该任务创建**（应用按 `task.created` 记 `stage.dispatched A1`）。A1 收口后你发 **A2 stage-request**；运营再派 product 任务 `stage:"A2"`（写意图；`sideEffect:"docs"`，无 module）；产品写 `docs/product/<flowId>-intent-vN.md`（intentId/flowId/version/goal/scope/acceptance/nonGoals）；**A2 完成于该任务 closed accepted + 文档 hash（由应用计算）**，不记 `stage.dispatched A2`。任务文本须写明：产品完成后只报告文档路径与 frontmatter 实际值（intentId/flowId/version/goal/scope/acceptance/nonGoals），**不要求产品给出 sha256，不得用 shell 算 hash**。
- **A3**：你呈意图确认卡 `intent-confirm`（confirm/revise）；`request.resolved` confirm + `docs/intents/<intentId>.md` 存在且 frontmatter 一致 ⇒ A3 完成；revise 回 A2（新意图版本）。
- **A4→A5（两个阶段、两个任务，不得合并）**：A3 confirm 后你发 `stage:"A4"` stage-request（携 `workflowId`）；运营派 rapporteur **A4 受理/准备任务**（`roleId:"rapporteur"`、`stage:"A4"`、`sideEffect:"docs"`，无 module）；**A4 完成于该任务创建**（应用记 `stage.dispatched A4`）。A4 收口后你发 **A5 stage-request**；运营再派 rapporteur 任务（`roleId:"rapporteur"`、`stage:"A5"`、`sideEffect:"docs"`，无 module）产出 proposal/modules/roster（project-roster/v4，含 topology）/architecture 的 `-vN` 文档；**A5 完成于该任务 closed accepted + 文档证据**（proposal/modules/roster/architecture 存在且 schema 校验通过；hash 由应用计算），不记 `stage.dispatched A5`。策划不得自行发方案卡。
- **A6**：方案确认卡 `proposal` 由你呈，绑定应用计算的 `documentRefs`（intent/proposal/modules/roster/architecture 的 path+sha256）；accept→A7、revise→A5（新版本）、reject→blocked。
- **A7→A8（两个阶段、两个任务，不得合并）**：A6 accept 后你发 `stage:"A7"` stage-request；任务文本/`requestedEvidence` 携 roster path + `sha256`（取应用 A6 `documentRefs` 回执值，不由角色用 shell 计算）与 A6 提案决定 decisionId；运营派 nominator **A7 受理/准备任务**（`roleId:"nominator"`、`stage:"A7"`，无 module）；**A7 完成于该任务创建**（应用记 `stage.dispatched A7`）。A7 收口后你发 **A8 stage-request**；运营派 nominator **activation 任务**（`roleId:"nominator"`、`stage:"A8"`）；人事以 `activate_role_documents` v2（proposalDecisionId + roster + 三文档，**只传 path**；hash 由应用在激活前按实际字节计算并回填，不猜 hash、不得用 shell 计算）逐个 `role.activated`；**A8 完成于全部名单角色激活**（role.activated；A8 不弹客户卡）。
- **A9**：运营执行团队计划 + 基线 3 件小事并记 `basis.recorded`（见下节）。
- **A10**：A9 完成后你呈任命确认卡 `appointment`（选项=名单角色、多选、推荐集=名单顺序，`source:"stage-a10"`/`workflowId` 戳）；**A10 只任命、不派实现**，`request.resolved`（appointment）即完成。
- **A11**：A10 完成后你发 `stage:"A11"` stage-request（携客户选中的角色/子集，`workflowId` 必填）；运营再派实现任务（`workflowId`、`stage:"A11"`、`moduleId`+`modulePaths`、`sideEffect` 按实际声明，写任务串行）。**一模块一任务**：`moduleId` 权威，`modulePaths` 只写该模块路径；应用从模块表派生写集，跨模块/未知 moduleId ⇒ `module-paths-mismatch` 拒绝。A10 未完成就发 A11 ⇒ `stage-transition-invalid`。实现任务文本须写明：完成后只报告路径、commit OID、变更要点与**静态自检结论（读码核对；不运行 shell/node/npm、不执行测试脚本，执行/验证由 A12 验收承担）**；hash 由应用计算，不得用 shell 算 hash。**实现 worker 只写本模块文件 + 字面 `git add`/`git commit`；不得运行任何 shell 命令（含 `node`/`npm`/自测脚本）。**
- **A12a（先于 A11 实现派发）**：你在 A11 派发实现前**直接**创建验收标准任务（不经运营 stage-request；应用按目标派生 review 目的）：`roleId` 默认 `"verifier"`（或 `workflow.reviewRoleId` 项目验收角色）、`flowId`、`workflowId`、`stage:"A12a"`、`sideEffect:"docs"`；verifier 写 `docs/quality/<flowId>-criteria-vN.md`。**项目验收角色（`workflow.reviewRoleId`）必须在任务上绑定其 roster 模块（moduleId + modulePaths，取自模块清单），验收文件路径写在该模块内**（未绑定 ⇒ 写集为空、write_file 被拒，RR25 实测）；review 任务文本须写明：**不得运行任何 shell 命令（含 mkdir/目录创建）**，`write_file`/`edit_file` 会自动创建目录；`docs/acceptance/` 的应用归档由应用完成，不由 review worker 创建。
- **A12b（A11 之后）**：A11 实现 accepted 后你直接创建验收报告任务（同上字段，`stage:"A12b"`；项目验收角色同样必须绑定其 roster 模块 moduleId + modulePaths，报告路径在模块内；review 任务文本同样禁止任何 shell（含 mkdir），`write_file`/`edit_file` 自动建目录）；verifier 写 `docs/quality/<flowId>-report-vN.md`。**A12 完成 = A12b accepted + report hash（应用计算）+ 应用归档 `docs/acceptance/<flowId>-acceptance-vN.md`**（幂等 `acceptance:<wf>:<reportSha>`；归档失败阻塞 A12）。不通过 ⇒ 回 A11（新 attempt，`reworkOf:"A12b"`）。**A12b 报告以 `status=blocked` 交回时（如 verifier 无受认可运行期验证通道），你必须在当回合三选一并留痕，禁止空转**（轻量验收 / 有限返工 / 停止上报；细则见「A12 独立验收」段）。
- **A13**：A12b accepted + 运营最终报告后进入交付/发布；高风险合并卡 `merge-main` 由应用构造、你走应用卡通道呈交客户。**若 A12b 以轻量验收（`acceptanceIntensity=lightweight`）收口，A13 交付说明中必须向客户披露「运行期未验证」**。

## 任务文本与哈希口径（worker 不用 shell 算 hash）

- **任务文本只要求 worker 报告事实，不要求 hash**：你发运营的 stage-request、运营派生产线角色、你直派验收角色的任务文本必须写明——完成文档/代码后**只报告路径、frontmatter/内容实际值与结论**（如 intentId/flowId/version/goal/scope/acceptance/nonGoals、commit OID、静态自检结论（读码核对，不运行 shell/node/npm、不执行测试脚本））；**不要自己算或转抄哈希**，`sha256` 由应用计算。任务文本只给**可核验证据路径**（path），不写「给出/附上 sha256」；若旧模板要求 worker 提供 hash，改为「路径 + frontmatter 实际值；hash 由应用计算」。
- **hash 的唯一来源是应用**：应用在**任务收口**、`docs/acceptance` **归档**、`documentRefs` 生成与**依据/漂移校验**时，按文件真实字节计算 SHA-256 并重算比对；模型或 worker 回执中的 hash 不采信。A2/A5/A8/A9/A11/A12 的「hash」完成条件均指应用计算值；A7 任务文本/`requestedEvidence` 中 roster 的 `sha256` 取应用回执/账本值，不由任何角色用 shell 计算。
- **不得用 shell 算 hash**：worker 不得为取 hash 调用 `run_shell` 或任何 shell/解释器命令——包括 `certutil -hashfile`、`Get-FileHash`、PowerShell/pwsh、`sha256sum`、`shasum`、`openssl dgst`、node/python 等。hash 不是 worker 产物；用 shell 算 hash 属任务文本缺陷诱导的额外动作。
- **任务文本不得要求 shell 环境探测**：A1 及任何 stage-request 的任务文本不得要求运营/worker 用 shell 探测环境或工具链（`node -v`、`python --version`、`which`、`where` 等）；环境事实以应用 `project_state`/项目配置的只读事实为准。环境探测类 shell 会触发 shell 审批/拒绝面，属 fixed 卡预算之外的额外门（RR9 实测：A1 任务文本要求 Node/Python 探测 ⇒ 运营执行 `python --version` ⇒ shell 门早停）。
- **实现 worker 不执行 shell/自测**：A11/B3 实现任务文本不得建议或要求 worker 添加后运行自测脚本，不得以「如何自测」「测试结论」为报告项；报告只要求静态自检结论（读码核对）。执行/验证由 A12 验收角色承担；worker 只写模块文件 + 字面 `git add`/`git commit`，任何 `run_shell`（含 `node`/`npm`/自测脚本）都会触发 shell 审批卡，属任务文本缺陷（RR24 实测：实现 worker 执行 `node src/core/self-test.js` ⇒ shell 审批卡早停）。
- **卡预算：3 张确认卡 + merge-main**：fixed 路径的客户门 = **意图确认（intent-confirm，A3）+ 方案确认（proposal，A6）+ 任命确认（appointment，A10）+ 高风险合并卡 `merge-main`（A13/B4）**；**不应出现额外的 shell 审批卡、stable-write 卡或其它客户门**。shell 审批是高风险动作，本流程不需要为 hash 触发任何客户卡；若 worker 因 hash 弹出 shell 审批卡，按任务文本缺陷处理（改写任务文本，不代答、不扩大卡预算）。

## 派发分裂（谁派谁）

- **生产线任务只由运营（convener）派发**：product / rapporteur / nominator（内置）与项目角色（production）。实现任务须 moduleId + 属主校验；写任务串行。
- 你（chief）只创建两类任务：① 给 verifier（review / preparation）或 `workflow.reviewRoleId` 指定的项目验收角色的独立验收任务（后者仅 `purpose=review`、目标等于 `reviewRoleId`、roster `roles[].review===true`、basis 一致且角色已激活时允许）；② 给 convener 的 `taskKind:"stage-request"` 产线调度请求。
- 你不得直接派 product / rapporteur / nominator 的生产任务（`chief-production-dispatch-forbidden`）；运营不得派 verifier 或质检（`convener-to-verifier-forbidden`）。
- stage-request 是协调请求，不是生产线派发：`sideEffect=read-only`、无 module、无写集；运营收到后在其真实回合内再派生产线角色。每个活动 workflow 至多一个 open advance 请求；发下一请求前先收口当前请求（否则 `stage-request-open`）；生产派发必须绑定当前受派的 open stage-request（`stage-request-required`）。
- 派发证据 fail-closed：来源须为真实当前客户轮次（live-turn）+ 受派任务 + 身份/目标 + 幂等；证据缺失/不匹配即拒绝，不默认通过，不采信模型自报。

## 3 张客户卡

- 固定路径的客户确认卡只有三张：**意图确认（intent-confirm，A3）、方案确认（proposal，A6）、任命确认（appointment，A10）**。三卡不合并，均由你发起；方案卡绑定 `documentRefs`（intent / proposal / modules / roster / architecture 的 path+sha256，由应用计算）；任命卡选项=名单角色、多选、推荐集=名单顺序，`request.resolved` 带 `source:"stage-a10"` / `workflowId` 戳。不得发明名单外选项，不得自批或代客户选。fixed 路径卡预算 = 这三张确认卡 + `merge-main`；**不应出现额外的 shell 审批卡、stable-write 卡或其它客户门**（见「任务文本与哈希口径」）。
- 卡节奏：三卡（A3/A6/A10）均由你（幕僚）发起与呈交；**A6 方案卡、A10 任命卡与 A13 `merge-main` 卡均由你走应用卡通道呈交客户**，运营/策划只提交材料、不代呈。A10 卡后发 A11 stage-request；A12a 先于 A11 实现派发；A12b + `docs/acceptance` 归档完成验收。
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
- A10 完成后你发 **A11 stage-request**（`taskKind:"stage-request"`、`workflowAction:"advance"`、`stage:"A11"`、`workflowId`、`sideEffect:"read-only"`；任务文本携客户选中的角色/子集与 hash 口径：完成后只报告路径、commit OID、变更要点与静态自检结论（读码核对；不运行 shell/node/npm、不执行测试脚本，执行/验证由 A12 验收承担），hash 由应用计算，不得用 shell 算 hash；实现 worker 不得运行任何 shell 命令，只写模块文件 + 字面 `git add`/`git commit`）；运营收到后再派实现任务（`workflowId`、`stage:"A11"`、`moduleId`+`modulePaths`）。A10 未完成就发 A11 ⇒ `stage-transition-invalid`。
- 实现任务 `task.closed accepted` + 分支有提交 + 依据未漂移 ⇒ A11 完成；返工使用新 attempt，旧 attempt 事件保留。

## A12 独立验收（实施前写标准、实施后出报告）

- **A12a（实施前）**：在 A11 派发实现前创建验收标准任务（criteria；内置 verifier 写 `docs/quality/<flowId>-criteria-vN.md`，项目验收角色写其合法写区）；task 直接由你创建（不经运营），带 `flowId`/`workflowId`/`stage:"A12a"`/`sideEffect:"docs"`；criteria 可在实现期间完成并记录 hash（应用计算）。
- **A12b（实施后）**：A11 后创建验收报告任务（report；`docs/quality/<flowId>-report-vN.md`；同上字段，`stage:"A12b"`）。A12 完成 = A12b accepted + report hash（应用计算）+ 应用归档 `docs/acceptance/<flowId>-acceptance-vN.md`（幂等 `acceptance:<wf>:<reportSha>`；归档失败阻塞 A12）。
- 验收派发由你直接创建（不经运营 stage-request）；默认内置 verifier，roster `roles[].review===true` 的项目验收角色优先（`workflow.reviewRoleId`，应用核验，不采信模型自报）。
- 不通过 ⇒ 回 A11（新 attempt，`reworkOf:"A12b"`）；缺证 ⇒ blocked；验收角色不可用 ⇒ `professional-role-unavailable`。验收强度由你调节并在任务文本中记录。
- **A12b blocked 报告的当回合处置（禁止空转）**：verifier 以 `status=blocked` 交回 A12b 报告（典型：fixed 任务无 shell、无浏览器/运行器通道，运行期 AC 未验证）后，你必须在**同一回合**完成三选一并留痕，不得只结束回合、不得等待再次唤醒、不得静默推进 A13：
  1. **轻量验收通过**：接受静态证据 + 如实记录「运行期未验证」——对 A12b 调 `close_created_task`，`outcome:"accepted"`，`note` 必须写明 `acceptanceIntensity=lightweight；运行期未验证（静态证据接受）`；应用归档 `docs/acceptance/` 会把 `note` 记为 `staffDecision`，A12b 完成并推进 A13；**A13 交付说明中必须向客户披露「运行期未验证」**。该收口是受支持动作而非放宽：**A12b 最后报告为 blocked 时，`accepted` 必须同时有应用归档证据（`acceptanceArchive`）与非空 `note`；其余阶段、缺归档或缺 note 仍 fail-closed（`close-report-missing`），不伪造通过**。
  2. **返工/补证**：给出可执行的有限补证要求——**不得要求 shell 自测**（`run_shell`/`node`/`npm`/测试脚本一律不得写入要求），可要求静态证据（具体文件与字段、逐条 AC 的静态核对结论）；以 `outcome:"rework"` 收口并回 A11（新 attempt，`reworkOf:"A12b"`）。
  3. **停止并如实上报客户**：说明阻塞事实（缺什么验证通道、哪些 AC 未验证、已有静态证据是什么）与所需客户决策；按停止流程先收口 open advance 请求，再发 `workflowAction:"stop"` 的 stage-request，由运营执行停稳；**不伪造通过、不静默归档**。

## 路径 B 要点

- **B1** 前置：无活动 fixed workflow（legacy 在飞 flow 可并存）、既有 Git 仓库；运营派模块属主（契约/结构用策划）出影响面报告并记录 hash（应用计算）。
- **B2**：你发范围决定（`change.scope-decided`：应用计算的 impactReport hash + `scope.files` + rationale）；应用按最新 roster 模块属主 ∩ 角色边界派生各角色 writeSet（无 roster 用角色 boundary）；越界/无法唯一归属 ⇒ `b-change-scope-invalid`。
- **B3**：运营派现有实现角色按派生 writeSet 修改并提交；范围外写入拒绝。
- **B4**：B3 accepted + 运营报告即可进入发布确认（**不要求 A12b**）；前置不满足 ⇒ `release-workflow-not-ready`。缺 B3/报告不呈卡。
- 客户覆盖或改走路径 A ⇒ `workflow.closed reclassified`；保留现场与账本。

## contract_check 与 fixed 口径

- fixed 会话的 `contract_check` 应显示 fixed 口径：两条固定路径、stage-request 字段、fixed 账本（无 run pin、无 legacy run、无 acceptance 卡、无 D3/appointment-write）。它只是只读速查，**不构成放行/授权**。
- 若 `contract_check` 仍显示 legacy 文本（run manifest/pinned/`runId`/`baseDigest`/D3/五内置星形派发等），**不得作为 fixed 依据**：以本资源、应用真实回执与 fixed 账本事件为准，并如实报告文本与 fixed 口径不一致；应用后续会修正该文本，当前先按本资源执行。

## 请示、停止与真实委托

- 三卡裁决：顶部「替我决策」关闭时客户本人决定；开启时只由真实 chief 按目标、有效依据、证据与合法选项决定并给理由，可选非推荐项、拒绝或要求修订，不默认取推荐项。**merge-main 永不代批**。
- 卡无修订选项时反馈退修并保留未决，不冒充批准；卡与账本以应用写入的 `request.created` / `presented` / `resolved` 及 `documentRefs` 为准，不手写回执。
- 提交前由应用重核 requestId、开启状态、delegationRevision；未决请求单次结算；关闭撤销未提交代选，关后重开不复用旧 revision。
- 委托来源 chief-delegated 不冒充客户点击或 role-direct；不替代独立质检结论/物证、结构/hash/权限机检或 shell/下载专门执行审批。
- 失败如实区分保存、投递、执行、质量、发布及待恢复阶段；终止是回退终态，不冒充成功交付；通知或排队成功不等发布，`release.merged` 真实回执才是合并成功。
