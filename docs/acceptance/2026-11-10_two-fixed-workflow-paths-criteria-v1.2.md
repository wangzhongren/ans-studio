# B1 验收标准：两条固定工作流路径（T3，v1.2）

- 日期：2026-11-10
- 角色：ANS 「独立验收」（独立固定上下文；本文件由任务精确范围授权写入 `docs/acceptance/`）
- 任务 ID：`2026-11-10-two-fixed-workflow-paths`（T3 产品级重构）
- 判型：**T3**（改变内置角色权责与派发权、默认流程状态机、Git 治理机制退役、需迁移/废弃清单、验收需确定性测试 + 真机全链）
- 版本：**v1.2**（2026-11-10）。依据：B1 v1.1（`e2ad4701…`，逐字保留不改，本版底稿）+ B2 复判（`eaa6af41…`，预 RR 放行门通过）+ 协调方批准（2026-11-10：RR 预算批准 + 三项确认）。**本版变更仅为协调方确认的三项**：① AC-26 增列角色自有记录例外（`角色卡/<role>-code/docs/` 下 `api-spec.md`/`memo.md`/`feature-map.md` 属角色自有记录，允许；`89e0ed6` 中 chief/product 的记录文档按此处理、不移除）；② §二 增列 **TM-5 同名 known-red**（内容字面量 5→7，按 known-red 披露接受、不要求 pass、不得弱化断言/新增格式 id）；③ §八/§九 钉住 **`amendBasis` 使用约束**（RR 不做治理文档修正；无生产调用点；如确需使用须协调方书面授权并记录，不得绕过 basis 账本/不得由模型自报）。其余 AC/T/RR/EV 条目与 v1.1 逐字相同；不 de-scope、不新增客户口径。
- 状态：**B1 v1.2 生效（冻结）**；实现所有判据初始为 **`未取证`**；最终 B2（含 RR 证据）按本 v1.2 全量判定；确定性范围已按 v1.1 由 B2 复判（`eaa6af41…`）判定为「可进入 RR」。
- 纪律（协调方决策 #8）：分支开发、不合并 ans-studio `main`、不发布/tag、不请求客户放行；真机全链跑通前不请求合并/发布。

---

## 一、依据绑定（哈希以写盘实测为准）

| 依据 | 路径 | 实测（行 / 字节 / SHA-256） |
| --- | --- | --- |
| B1 v1（前版判据，逐字保留不改） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.md` | 197 / 33,722 / `b607f1008a3539eb88313e603bf89133138323cd7f8bbe6fd7df1f3455dadddb` |
| B1 v1.1（前版判据，逐字保留不改；本版底稿） | `docs/acceptance/2026-11-10_two-fixed-workflow-paths-criteria-v1.1.md` | 214 / 38,065 / `e2ad4701b1bda9a994616d4543fcab8b05de2f8bfcd4c9f6ee0fcc0873e0b749` |
| B2 复判（预 RR 放行门；本版修订依据） | `角色卡/独立验收/docs/change/2026-11-10_B2_re-review_two-fixed-workflow-paths.md` | 354 / 41,291 / `eaa6af41522ce38f2cceb74e45cea7c488c6a158083d5e31c8e573b91d75277e` |
| RR 执行计划（§二 预算申请值；§六 三项预 RR 确认） | `docs/scheduling/2026-11-10_RR_two-fixed-workflow-paths-plan.md` | 47 / 4,854 / `83dfe814e6520c4918324768999214dff7d9d3dd2070861101f52044f78e4fde` |
| 协调方批准（2026-11-10：RR 预算 + 三项确认；会话批复） | （无文件；批复原文引用于 `角色卡/独立验收/docs/change/2026-11-10_B1.2_two-fixed-workflow-paths.md` §2） | — |
| B2 预验收（MF-B2-01 来源，本版修订依据） | `角色卡/独立验收/docs/change/2026-11-10_B2_pre-RR_two-fixed-workflow-paths.md` | 267 / 40,790 / `5958ba3879aa6ad5df2be0e27f43ec74c7067644576a074f5d94f169dc206888` |
| 设计 v2（唯一产品依据） | `docs/planning/2026-11-10_design_two-fixed-workflow-paths.md` | 95 / 8,476 / `b075829b01a843d06a1d8ba58fb4311d95e9e087bc5fe5645b832218b8913d3d` |
| 实现级方案 v1.3（被冻结的实现依据） | `docs/proposals/2026-11-10_two-fixed-workflow-paths-design-v1.3.md` | 1,392 / 184,391 / `ae737dcf2c526a1a72faeb2cf7778f88c8fbe7a81eac52e96da0901bf0d36cd8` |
| v1.3 策划记录 | `docs/governance/rapporteur/2026-11-10_two-fixed-workflow-paths-design-record-v1.3.md` | 66 / 9,333 / `6ab9e1e9374899853836f1b0704ff619f68ee20a404a13d2a135ddd5fb9fc0b6` |
| 启动计划 + 协调方决策 §七 #1–#8 | `docs/scheduling/2026-11-10_startup_two-fixed-workflow-paths.md` | 90 / 10,820 / `08450af1b6be0cf893bea81cd73f73c990551b89c499430fd5a60d3c6cbbc215` |
| 第一轮独立复核（MF-1…MF-8） | `角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths.md` | 222 / 32,535 / `df1992df9c22af5fa915a128469fc0911c77493c21486367328a40bc35a00efc` |
| 第二轮独立复核（MF-9…MF-12） | `角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths-v1.2.md` | 202 / 30,200 / `259ecde7aad44550e29c2d018bc452d619ce3942b57625c4bfe9e5e66b93ecd1` |
| 第三轮独立复核（v1.3 通过，本 B1 来源） | `角色卡/独立验收/docs/design/2026-11-10_review_two-fixed-workflow-paths-v1.3.md` | 156 / 20,635 / `550872d772cfcf986231c5f0dfc504be83e4b67d78266db348574a648753860b` |
| 现有架构/契约（只读） | `docs/planning/2026-11-07_design_runtime-tool-surface-dispatch-gate.md` 等六份 | hash 与 v1.3 头部一致（`24150207…`/`1f6518b8…`/`067e3d2e…`/`886fef84…`/`1477a6e4…`/`2bb663fe…`） |

---

## 二、候选与基线身份

- 开发分支：`feat/two-fixed-workflow-paths`（基于 `origin/main` `d9e3e99c160599e5b53a82e105939a359f69992f`；B1 冻结时代码基线 `10f90c7`，HEAD `67b728f`，仅 docs 差异）。
- 候选定义：**同一候选** = 团队计划/D1 记录的实现分支 HEAD（含全部实现提交）；B2 全量判定须基于同一候选与同一环境。
- 已知红（实施基线重取；v1.1 事实更正：`test/编排` 计数 22→24，并增列 9 条 legacy 基线红；失败名集合均不变）：
  - `test/测试/version-change-integration.test.ts` 9 红（`vca-channel-unavailable`）；
  - `test/桌面应用/optional-acceptance.test.ts` 6 tests / pass 2 / fail 1 / cancelled 3 / skip 0；
  - `test/编排/**` **24 fail / 2 skip**（v1 误记 22 fail；v1.1 实测：代码基线 `10f90c7` 与本候选 HEAD `e28923c` 均为 24 fail，失败名集合与基线逐名一致、未变）；
  - 9 条 legacy 基线红（v1 漏列，v1.1 增列；`test/桌面应用/star-routing.test.ts` 7 条 + `test/测试/governance-e2e-auto/i-full-chain.test.ts` 2 条；在代码基线 `10f90c7` 解包独立复跑 **9/9 同名同因**，**非本候选回归**；系既有测试夹具缺陷——未提供生产门（`e71501c` 引入）要求的已注册项目生命周期/当前客户轮次，生产门 fail-closed 拒绝（`document-planning-source-unavailable`/`worker-dispatch-source-unavailable`/`chief-hub-flow-unavailable` 及由此导致的下游断言不匹配）；**不修改 legacy 断言语义**）：
    1. 星形目标（v4.1）：chief → 产品受理（链首）；chief → 运营缺 D3 受理 + advisory；幕僚自身拒绝
    2. convener 拥有 dispatch（v4.1）：未接交付时派项目 worker 受理 + advisory，建任务
    3. BUG-5：任务已报告/已收口后，同一幂等键重复派发被抑制（不建新任务、不投递）
    4. BUG-5：派发到无会话角色会先 open/resume；打开失败则如实拒绝且不入队
    5. BUG-5：排队期间任务已完成 ⇒ 已出队前不再投递/不补写 delivered（只记诊断）
    6. BUG-5：任务已报告后的重复回交被抑制（不同 handbackKey 也不重复投递）
    7. AC-4.3：洁净派发无 advisory、无诊断噪声
    8. 最小系统全链（v4.1）：六角色枚举 + 幕僚链首派发落 tasks.jsonl + 无 flow/gate/ledger + 运营派发作用域
    9. F 终态收口：幕僚调度验收（review 任务→质检回交→工作结果）且无自动验收派发
- 判定：同名用例不得恶化、新增确定性失败=0、新 skip=0；既有失败消失需解释；不改 `optional-acceptance.test.ts`。9 条 legacy 基线红按本口径判定（同名不恶化、不新增），**不要求其为 pass**；legacy 断言语义不得弱化。
- TM-5 同名 known-red（v1.2 协调方确认）：`test/编排/doc-format-specs.test.ts`「TM-5 schema 字面量全仓扫描」为同名 known-red（含于上述 `test/编排` 24 fail 清单）；失败内容字面量 **5→7**（+`chief-workflow/v2`、+`ans-task-git-shell/v1`，均为本特性 schema id；测试名/数量不变、无新增失败）；按 known-red 披露接受、**不要求 pass**；不得弱化断言、不得新增格式 id（AC-25 的 doc_format 54 格式不变）。
- H1：**0 处边界修订**（全部写集落在既有 directory/file 授权；`src/common/gates/` 不改）；无新角色、无客户可见门、无边界模型变化。
- 发布纪律：全链跑通前不合并/不发布；不打 tag；旧分支 `feat/initial-workflow-publication-completion` 暂停留历史（`4a0bafd`/`882d84b`），不参与本变更。
- 交付范围：默认路径两条固定路径（A1–A13 / B1–B4）+ Git 普通用法（任务分支提交 + 合并 main 客户本人确认）+ 应用账本；旧 trunk/run/VCA/stable 机制 compat-only（不删除、不迁移历史账本）。

---

## 三、判定规则

1. **pass**：判据全部满足，且有本文件 §七 要求的 EV 证据；证据须可复现（命令、输出、候选 hash、日志/截图）。
2. **fail**：任一判据不满足，或证据与判据矛盾，或实现自述与证据不一致（自述不替代证据）。
3. **insufficient**：证据缺失、不可读、不可复现或与候选不一致（不得按 pass 处理，不得按 NA 处理）。
4. **NA**：仅当本文件明示可 NA，或经独立验收书面同意并记录理由；默认不可 NA。
5. **同一候选**：AC/T/RR 判定须在同一候选 HEAD 与同一隔离环境中完成；环境抖动须同候选隔离复跑排除。
6. **T3 不降档**：B1 判据、确定性测试矩阵、真机全链缺一不可；不得以“已知红/旧机器兼容”为由跳过新路径判据；known red 仅按 §二 列名清单适用「同名不恶化、新增确定性失败=0、新 skip=0」口径，未列名失败一律计 fail，且 known-red 不豁免任何新路径判据。
7. B2 由独立验收按本文件全量执行；D1 为实现侧自检，不替代 B2。

---

## 四、验收标准（AC；初始状态全部 `未取证`）

### 4.1 派发分裂与 legacy 兼容

| 编号 | 判据（可判定） | 取证方式 | 状态 |
| --- | --- | --- | --- |
| **AC-01** | fixed 矩阵：convener→product/rapporteur/nominator（内置）与项目角色（production）允许；convener→verifier 拒绝 `convener-to-verifier-forbidden`；chief→verifier（review/preparation）允许；chief→convener 仅 `purpose=stage-request`（read-only、无 module/写集）；chief→product/rapporteur/nominator 拒绝 `chief-production-dispatch-forbidden`；self/unknown-source 拒绝 | T-01 全组合单测 + 集成 | 未取证 |
| **AC-02** | fixed 窄例外：chief→项目角色仅当 `purpose=review`、`targetRoleId===workflow.reviewRoleId`、roster 原文 `roles[].review===true`、basis `reviewRoleId` 一致、角色已 `role.activated` 时允许；其余项目角色仍 `chief-to-project-forbidden`；随机项目角色/未标记角色负例拒绝 | T-01/T-13 | 未取证 |
| **AC-03** | legacy 逐字兼容：`evaluateDispatchAuthorization`/`evaluateDispatchPreflight`/`CHIEF_DISPATCHABLE_BUILT_INS`/`isConvenerBuiltInDispatchTarget` 分支/顺序/文案不变；`routeStarDispatch` 逐字不改；legacy 断言（star-routing、i-full-chain、workflow-preconditions、roles 差分、convener-module-consumption）逐字保留，**不得弱化、改写或删除**；其中 workflow-preconditions、roles 差分、convener-module-consumption 须通过；star-routing 7 条与 i-full-chain 2 条为 §二 列明的基线 known-red（代码基线 `10f90c7` 同名同因、非候选回归、测试夹具缺陷），按 known-red 口径判定：同名不恶化、不新增、**不要求其为 pass**；legacy 常量 `CHIEF_HUB_DISPATCH.targetRoleIds` 五内置、`CONVENER_WORKER_DISPATCH_TARGETS.allowedBuiltInRoleIds=["verifier"]` 未改 | T-14/T-01 | 未取证 |
| **AC-04** | 派发身份等价证据（Q6）fail-closed：fixed 派发（chief/convener）须同时满足 live-turn（`sourceIsCurrent`）+ assigned-task（stage-request 绑定）+ identity/target + 幂等；证据缺失/不匹配即拒绝（`dispatch-evidence-missing`/`dispatch-source-changed`/`stage-request-required`），不得默认通过；负例（伪造 taskId、错误 creator、已关闭/停止任务、过期轮次、session 重启、fenced run、目标不存在、自派、非 reviewRoleId 项目角色）全部拒绝 | T-01/T-02 | 未取证 |

### 4.2 状态机（A1–A13 / B1–B4）

| 编号 | 判据（可判定） | 取证方式 | 状态 |
| --- | --- | --- | --- |
| **AC-05** | stage-request 原语：`dispatch_task` 新增 `taskKind`/`workflowAction`/`workflowPath`/`workflowId`/`stage`/`reworkOf` 字段（schema + `DispatchTaskPayload` + session 透传 + `contract_check.taskKind` 同步）；schema 文案模式中立（legacy 提示不因 fixed 特有文案改变）；stage-request 仅 chief→convener、`sideEffect=read-only`（豁免文本升类）、无 module/写集 | T-02/T-13 | 未取证 |
| **AC-06** | stage-request 幂等与来源：`workflowId = wf-+sha256(flowId|path|sourceTaskId|requestDigest)` 确定性（无时钟/随机）；首次请求由应用先算 workflowId、统一 `stage-request:<workflowId>:<stage>:<attempt>`；`sourceTaskId` = chief 当前真实客户轮次（host 捕获），缺失 ⇒ `stage-request-source-missing` 不创建；重复请求返回原任务、不重复投递 | T-02 | 未取证 |
| **AC-07** | open 请求不变量与停止：每活动 workflow 至多一个 open advance stage-request；下一 advance 前须收口当前请求（否则 `stage-request-open`）；stop 流程 = chief 先收口 open advance 请求 → 发 `workflowAction:"stop"` stage-request → 运营停派发/关 open 生产任务/报告 → 应用停 live 会话并核停稳证据（请求已 closed + 运营报告 + 无 open 生产任务）→ `workflow.closed stopped`；停稳不明 ⇒ `workflow.stop-unconfirmed`（不写 stopped）；reclassified 记录；不自动回滚 Git | T-02/T-03 | 未取证 |
| **AC-08** | A1–A13 状态机：合法/非法转移符合 v1.3 §4.4；A1/A4/A7 完成于目标任务创建；A2/A5/A8/A9/A11/A12 完成于收口/账本事件；A10 = 任命确认（`request.resolved` 即完成、不派实现）；卡后 chief 发 A11 stage-request 派实现；A11 完成于全部选中实现任务 `task.closed accepted` + 分支 tip；A10 未完成发 A11 ⇒ `stage-transition-invalid`；A12b rework 回 A11（`reworkOf:"A12b"`）；缺事件/坏行 ⇒ `workflow-corrupt` 不自动推进 | T-03 | 未取证 |
| **AC-09** | A12 验收：A12a criteria（**设计口径「实施前写标准」**：criteria 任务须在 A11 stage-request 派发实现前创建；criteria 可在实现期间完成并记录 hash）+ A12b report（A11 后）；A12 完成 = A12b accepted + report hash + 应用 `docs/acceptance/<flowId>-acceptance-vN.md` 归档写入（vN 随 report 版本；幂等 `acceptance:<wf>:<reportSha>`；归档失败阻塞 A12）；项目验收角色（roster `roles[].review`）走 AC-02 窄例外；验收强度由幕僚任务文本调节并记录 | T-03/T-11 | 未取证 |
| **AC-10** | B1–B4 状态机与路径 B 准备：B1 前置 = 无活动 fixed workflow（legacy 在飞 flow 可并存）+ **既有 Git 仓库**（否则 `b-repository-required`，不自动 init）；应用确保 `.gitignore` 托管块/baseline commit、从当前 HEAD 创建/复用 `ans/task/<workflowId>`、dirty 检查，`repo` 记入 `basis.recorded(reason:"path-b")`（“只读”仅指文档快照）；B3 写集 = B2 scope.files ∩ roster 属主 ∩ 角色边界（无 roster 用 boundary，越界 `b-change-scope-invalid`）；B 路径不写团队计划/不重建角色/不重建版本 | T-12 | 未取证 |
| **AC-11** | 发布前置按路径：A13 ⇒ A12b accepted + `docs/acceptance` 归档已写入；B4 ⇒ B3 accepted + 运营报告（**不要求 A12b**）；任一前置不满足 ⇒ `release-workflow-not-ready`（附路径与缺失项）；B 路径默认不新增独立核对阶段 | T-10/T-12 | 未取证 |
| **AC-12** | per-flow 模式：`workflowMode(projectRoot, flowId)` 按 flow 解析（project.json `workflowSchema` 仅默认/强制）；legacy 在飞 flow 与新 fixed flow 可并存并分别走旧/新路径；每项目同时至多一个活动 **fixed** workflow（`workflow-workspace-busy`）；project.json 写回原子、保留既有键、失败 `project-config-write-failed` fail-closed、不弹卡 | T-05 | 未取证 |

### 4.3 3 张卡与高风险

| 编号 | 判据（可判定） | 取证方式 | 状态 |
| --- | --- | --- | --- |
| **AC-13** | 3 张卡：intent-confirm（chief）、proposal（chief；`documentRefs`=intent/proposal/modules/roster/architecture）、appointment（chief；选项=roster 角色、multiple、推荐集=名单顺序、`targetRoleIds`、`source:"stage-a10"`/`workflowId` 戳；legacy D3 读取方不接受 fixed 决议为 D3 证据）；三卡不合并；`decision` 卡仅材料性选择/需求变更审批（convener/rapporteur）；fixed 不发 acceptance 卡（legacy 保留）；`cardKindsOf` fixed 取 `fixedCards`（legacy 取 `cards` 逐字不变） | T-11 | 未取证 |
| **AC-14** | merge-main：应用自有**非判断卡**（`GovernanceCardKind`/`AppOwnedGovernanceCardKind` + `merge-main`；进 `GOVERNANCE_APP_OWNED_CARD_KINDS`、**不进** `GOVERNANCE_CARD_GROUP`；`governanceCardGroup("merge-main")===undefined`；`planJudge` 排除）；**必须客户本人 approve/reject；judge 不可代批（只能转人工/拒绝，不得 approve/冒充客户）**；preview 必含 workflowId/flowId、main base OID、branch tip OID、文件数、diff stat、合并方式、高风险提示；高风险清单不变；客户卡总数仍为 3 张确认卡 + 高风险动作卡 | T-10/T-11 | 未取证 |

### 4.4 基线 / 账本 / 依据

| 编号 | 判据（可判定） | 取证方式 | 状态 |
| --- | --- | --- | --- |
| **AC-15** | 基线 3 件小事：`complete_team_plan` v4（`{operationId,flowId,workflowId,plan}`；`runId/baseDigest` 出现即 `baseline-legacy-field-forbidden`）；`git init -b main`（或 symbolic-ref；sanitized env；父仓库 `baseline-parent-repository-detected`）；`.gitignore` ans-managed 块 + baseline commit（用户内容保留、被跟踪且 dirty ⇒ `baseline-gitignore-dirty`）；任务分支 `ans/task/<workflowId>`（同 workflow 可复用自有分支；否则 `baseline-branch-exists`）；dirty 只算 tracked 修改/删除 + 非忽略 untracked（治理文档/`.ans`/`node_modules` 被 ignore 不计）；文档 hash + 团队计划结构校验 + 8 MiB 读取预算（32 文件/单文件 4 MiB） | T-07 | 未取证 |
| **AC-16** | 基线失败面与幂等：§5.5 全部失败码（`baseline-git-init-failed`/`baseline-parent-repository-detected`/`baseline-repository-dirty`/`baseline-gitignore-dirty`/`baseline-branch-exists`/`b-repository-required`/`project-config-write-failed`/`baseline-document-missing|unreadable|budget`/`baseline-team-plan-invalid`/`baseline-plan-hash-drift`/`baseline-roster-drift`/`baseline-legacy-field-forbidden`/`baseline-operation-conflict`/`baseline-ledger-write-failed`/`baseline-identity-invalid`）按真实原因 fail-closed；**失败不产生客户卡**；同幂等键 replay 返回原回执；失败事件 `stage.blocked` 带 code/summary/attempt | T-07 | 未取证 |
| **AC-17** | 账本：`.ans/state/workflows.jsonl`/`basis.jsonl`/`releases.jsonl`（`ans-workflow/v1`/`ans-basis/v1`/`ans-release/v1`；5 MiB×3 轮转）事件 schema/幂等键与 v1.3 §7.1 一致；只追加、坏行计数、关键事件缺失 ⇒ `workflow-corrupt`（不猜）；`task.created` 可选 workflowId/stage/taskKind/workflowPath（fixed：workflowId 存在 ⇒ 豁免 runId/runState；无 workflowId 旧 run-required 逐字保留）；`request.created/resolved` 可选 `documentRefs[]`（裁决事件一次写入） | T-06/T-08 | 未取证 |
| **AC-18** | fixed 收口/意图：`close_created_task` v2（fixed 模式 `{operationId,taskId,outcome,note?}`；workflowService.closeTask 校验真实创建者/报告/状态/幂等，写 `task.closed` + 阶段事件；不触 trunk/CAS；legacy 原实现与必填字段逐字保留）；A3 `prepareIntent/finalizeIntent`（应用算 intent hash、documentRefs、`docs/intents/<intentId>.md` 校验、`stage.completed A3`；不写 doc-freeze/trunk snapshot/CAS；legacy 不动） | T-04 | 未取证 |
| **AC-19** | 依据钉死：basis 文档发现/预算/SHA-256/bytes 与 `basis.recorded` 一致；A11/B3 派发前、A12a/A12b、A13/B4 发布前 drift 校验（不一致 ⇒ `basis-drift` fail-closed）；`basis.amended`/`previousBasisId`；**Q4 路径 B 自动只读快照 `reason:"path-b"`：只读、不产生写权、drift fail-closed、不视为基线 3 件小事、不弹卡**；`role.activated` 登记（model/replay/project_state/i18n）；文件在盘但账本缺失 ⇒ `role-activation-unrecorded` fail-closed；`basis.verified` 仅关键门节流记录 | T-08 | 未取证 |
| **AC-20** | A12 归档：应用生成 `docs/acceptance/<flowId>-acceptance-vN.md`（含 flowId/workflowId、criteria/report path+sha256、结论、幕僚决策、时间；应用自有、角色只读）；版本随 report 递增；幂等 `acceptance:<wf>:<reportSha>`；归档失败 ⇒ `acceptance-archive-failed` 阻塞 A12；不改变角色边界 | T-03/T-11 | 未取证 |

### 4.5 Git 普通用法 / 发布

| 编号 | 判据（可判定） | 取证方式 | 状态 |
| --- | --- | --- | --- |
| **AC-21** | Shell v5：`SHELL_RULES_VERSION="5"`（旧 v4 规则集 fail-closed 不静默放宽）；`matchReadonlyGit` 只读白名单保留；`matchTaskGit` 仅允许 `git add <literal paths ⊆ task writeSet>` 与 `git commit -m`（staged ⊆ writeSet；拒绝 `-A/--all/./glob`、`-F -`/`-F file`、`--amend/--no-verify/-a/--author`）；push/fetch/pull/remote/tag/merge/rebase/reset/clean/checkout/switch/stash/worktree/submodule/config/update-ref 等硬拒（`git-command-not-ordinary`）；`git diff --cached` 检查与 commit 同一项目级临界区（否则 `git-critical-section-busy`）；无 taskGitScope/无 writeSet 来源 ⇒ 写 Git 一律拒；每条 git 写命令写 `docs/audit/shell-gate.jsonl`（不减少） | T-09 | 未取证 |
| **AC-22** | merge main 执行：应用执行（不经 shell）、固定 argv/sanitized env；main unborn ⇒ `git switch -c main <tipOid>`/update-ref（`mergeKind:"initial"`）；main 存在 ⇒ switch main + `git merge --no-ff <branch>`（占用/失败 `release-main-busy`；冲突 `git merge --abort` 切回任务分支、`release-merge-conflict`，不 force/reset/clean）；成功后 `release.merged`（baseOid/tipOid/mergeOid/files/diffDigest），工作区停在 main；幂等 `release:<workflowId>:<tipOid>`；已合并 `release-already-merged`；拒绝/超时 `release.rejected`；**不 push/tag/发布产物**；B 路径分支若基于非 main HEAD，preview 必含 base OID 与分支↔main diff stat 披露 | T-10/T-12 | 未取证 |

### 4.6 迁移 / 角色模块 / 保留机制 / 边界

| 编号 | 判据（可判定） | 取证方式 | 状态 |
| --- | --- | --- | --- |
| **AC-23** | 迁移/废弃：trunk/bootstrap/冻结闭包/候选 ref/run pin/stable-write 许可/VCA/refactor 逐文件处置（§6.5/附录 E）keep/deprecate/compat-only 与实现一致；**默认路径不触达旧机制**（fixed 运行不写 `.ans/trunk`/`.ans/runs`/versions/stable 账本；不注入 `git_query/git_candidate/git_publish`/`select_run_change`/`request_stable_write`/`submit_refactor`/`submit_version_change`/`request_version_decision`）；旧账本只读忽略、不删除/不迁移；贪吃蛇历史 trunk t1/t2 忽略（`legacyStateIgnored` 展示）；旧分支不参与本变更；已合并修复（judge/doc-format/提案卡绑定/bootstrap 闭包）不回退 | T-14 | 未取证 |
| **AC-24** | 角色模块/工具面：6 内置角色 legacy 数据冻结（`card.text`/`cards`/capabilities/legacy 目标常量/差分 oracle 不改）；fixed 新增 `fixedCards`/`fixedTargetRoleIds`/`fixedAllowedBuiltInRoleIds`/`isConvenerFixedBuiltInDispatchTarget` + fixed context 段 + `chief-workflow-v2.md`（legacy `chief-workflow.md` 不改）；`activate_role_documents` v2（roster/提案决定/三文档 hash/`role.activated`）；`requestReleaseMerge` 按 Q2 结论（优先复用；确需新增则 B1 已钉接口/fail-closed/必要性；**接口评审失败即不支持，不得强推**）；接口评审清单（`RoleToolId` 条件项、`DispatchMatrixMode`/`RoleDispatchPurpose`/`RoleDispatchPolicyInput.matrix`、`context({matrix})`、`merge-main` 卡种、`task.created`/`dispatch_task` 字段、`close_created_task` v2、`activate_role_documents` v2、模块新导出字段、`project-roster/v4 roles[].review`）均有评审记录 | T-13 | 未取证 |
| **AC-25** | 保留机制：append-only 审计 sidecar（含 git 审计）不减少；judge 代批保留且仅作用非高风险卡（intent/proposal/appointment/decision；`merge-main` 不可代批）；doc_format 54 格式保留、`team-plan/v3` 与 `project-roster/v4`（v3 兼容、可选 `roles[].review`）说明同步、不新增格式 id；写区边界（`boundary-core/parse/yaml`、`resolve-write.ts`）不变、越界拒绝；高风险清单（任务副作用分类、watchdog 高风险零自动重派、shell 审批、directive 7 项高危原因码）不变 | T-13/T-14/T-15 | 未取证 |
| **AC-26** | 边界/H1/非目标：H1=0（无边界修订；新文件均在既有 directory 授权；`src/common/gates/` 不改）；**无新角色**；无客户可见门（merge-main 为既有高风险确认机制具体化）；不改五层架构/依赖方向/边界文件格式；不改 `角色卡/**` 文件——**角色自有记录例外（v1.2 协调方确认）：`角色卡/<role>-code/docs/` 下 `api-spec.md`/`memo.md`/`feature-map.md` 属角色自有记录（非角色卡/边界/权限/roster），允许；须保持 H1=0、纯文档、不改变写权；其它 `角色卡/**`（role-card/boundary/boundary.yaml/changelog/其它角色）仍不得改；`89e0ed6` 中 chief/product 的 api-spec/memo/feature-map 按本例外记录处理，不移除**；UI 不做改版 | T-19 | 未取证 |

### 4.7 Qs 与判定完整性

| 编号 | 判据（可判定） | 取证方式 | 状态 |
| --- | --- | --- | --- |
| **AC-27** | Qs 口径：**Q1** 固定路径不发 acceptance 卡（仅高风险动作出卡）；**Q2** 发布合并优先复用既有能力、确需新工具须 B1 钉接口/fail-closed/必要性、评审失败即不支持；**Q3** 同工作区一次一个写任务 + 每项目至多一个活动 fixed workflow；**Q5** 只本地合并 main，push/tag/产物发布另需客户授权；**Q6** 父门替代证据 fail-closed（见 AC-04）；**Q7** A12 验收角色（默认 verifier；roster review 项目角色优先）+ 应用 `docs/acceptance` 归档（见 AC-02/AC-09/AC-20） | T-01/T-10/T-12/T-13 | 未取证 |
| **AC-28** | 证据与判定完整性：全部判据基于**同一候选**与同一环境；D1 每批 `npm run typecheck` + 受影响套件 before/after TAP + 失败名集合 diff + 文件清单/写集外 diff=0；known red 按 §二 口径不恶化；接口评审记录、H1=0 证据、真机日志/截图齐全；实现自述不替代证据 | EV-01…EV-08 | 未取证 |
| **AC-29** | 确定性测试矩阵 T-01…T-20 全部执行且通过（或按判定规则记录 fail/insufficient）；新增确定性失败=0、新 skip=0 | EV-03/EV-04 | 未取证 |
| **AC-30** | 真机全链 RR-01…RR-06 全部通过（空项目→贪吃蛇；真实 Electron+真实模型+真实 UI；隔离实例；预算另报；失败即停；不合并/发布） | EV-06 | 未取证 |

---

## 五、确定性测试矩阵（T；初始状态全部 `未取证`）

> 入口：`node --test --test-concurrency=1`（全量）与 `npm run typecheck`；renderer 触及才跑 `npm run typecheck:renderer`。判定按 §三。

| 编号 | 测试点 | 建议文件/方式 | 状态 |
| --- | --- | --- | --- |
| T-01 | 派发矩阵全组合：legacy（旧断言逐字：chief→product 允许、convener→verifier 拒绝等）+ fixed（chief/convener × 6 内置/项目 × purpose；stage-request 例外；MF-10 reviewRoleId 正例/随机项目角色负例；self/unknown-source） | `test/编排/workflow-preconditions.test.ts`（旧断言不改+新增 fixed）、`test/编排/workflow-dispatch-fixed.test.ts`（新） | 未取证 |
| T-02 | stage-request：字段/幂等/重复抑制/无写权；sideEffect 豁免；首次/后续统一幂等键与 sourceTaskId 缺失拒绝；open 请求不变量；stop（含 advance 收口）/停稳不明 | `test/测试/stage-request-integration.test.ts`（新） | 未取证 |
| T-03 | 状态机 A1–A13/B1–B4：合法/非法转移、重试 attempt、stop/客户覆盖、投影幂等/坏行；A10（卡）→A11（stage-request 派实现）顺序、A10 未完成发 A11 拒绝、A11 完成条件；A12a/A12b 与 rework | `test/编排/workflow-state.test.ts`（新） | 未取证 |
| T-04 | 收口/意图：fixed close_created_task v2（无 runId/basisDigest；真实创建者/报告/幂等）；A3 intent hash/documentRefs/intent-entry；documentRefs 一次写入、finalize 不重写；不触 trunk | `test/编排/workflow-close-intent.test.ts`（新） | 未取证 |
| T-05 | 模式判定：per-flow（legacy 在飞 + 新 fixed 并存）；每项目单活动 fixed workflow；project.json 默认/强制/写回失败；混合项目路由/写门禁 | `test/编排/workflow-mode.test.ts`（新）、`test/桌面应用` 集成 | 未取证 |
| T-06 | 任务账本：fixed `task.created` 有 workflowId 无 runId 放行；无 workflowId 旧 run-required 保留；replay/幂等/收口 | `test/编排/task-state-fixed.test.ts`（新） | 未取证 |
| T-07 | 基线：git init -b main（新/已存在/父仓库）、`.gitignore` 托管块/baseline commit、dirty 只算 tracked+非忽略、branch 重试复用/冲突、文档 hash/8 MiB 预算、团队计划结构、全部失败面/幂等 | `test/编排/baseline-service.test.ts`（新） | 未取证 |
| T-08 | 账本/依据：basis 记录/漂移/修正；workflows/releases 事件 schema；basis.verified 节流；role.activated/role-activation-unrecorded；Q4 path-b 只读；坏行计数；不写旧账本 | `test/编排/workflow-ledger.test.ts`（新） | 未取证 |
| T-09 | Git v5：add/commit 允许范围；push/merge/reset 等拒绝；staged 越界拒绝；无 task scope 拒绝；critical section 并发；`-F -` 拒绝；审计行 | `test/门禁引擎/classify-shell-v5.test.ts`（新/更新）、`test/编排/shell-post-audit.test.ts`（既有，不新建） | 未取证 |
| T-10 | 释放合并：初始 main/合并/冲突/拒绝/幂等/未授权；merge-main 仅客户本人（非判断卡；judge 拒绝/转人工）；A13 需 A12b+归档、B4 仅需 B3+报告；不 push/tag；clean 语义 | `test/编排/release-merge.test.ts`（新）、`test/桌面应用` 集成 | 未取证 |
| T-11 | 卡片：3 卡发起/校验/绑定/documentRefs；方案/任命发起人；验收卡抑制；A12a/A12b + docs/acceptance 归档（版本/幂等）；merge-main 非判断卡/仅客户本人 | `test/编排/decision-card.test.ts`、`test/roles/*`、`test/桌面应用/customer-input*` | 未取证 |
| T-12 | 路径 B：无仓库 ⇒ b-repository-required；既有仓库分支创建/复用；dirty/越界拒绝；B3 写集派生；B4 发布（不要求 A12b） | `test/编排/path-b-baseline.test.ts`（新）、`test/测试/b-change-scope.test.ts`（新） | 未取证 |
| T-13 | 角色模块/工具面：legacy 差分逐字不变；fixed `fixedCards`/targets/context；tool 注册/卡种；`role-module-contract`（14 项语义保留；如新增工具则 15 项）；接口评审记录 | `test/roles/*`、`test/门禁引擎/role-module-contract.test.ts`、契约测试 | 未取证 |
| T-14 | 迁移兼容：legacy 项目/在飞 run 走旧路径且旧断言逐字不变；fixed 新项目不触达 trunk/run/stable（断言无 `.ans/trunk`/`.ans/runs`/versions/stable 写入）；旧账本忽略；旧 fixture 不回归（star-routing/i-full-chain 的 9 条 §二 known-red 按 known-red 口径判定，不要求 pass） | `test/测试/existing-project-compat-verify`、`test/测试/mode-switch.test.ts`（新）、`test/编排/trunk-*` 等既有套件 | 未取证 |
| T-15 | 审计：shell/git 审计行不减少；release 审计字段；judge 来源不冒充客户；merge-main 无 judge-delegated 来源 | `test/编排/shell-post-audit.test.ts`、新增 release 审计测试 | 未取证 |
| T-16 | 全链（假会话）：空项目→意图→方案→激活→基线→实现→验收→合并；SessionManager 集成（假 openRoleSession，不启动模型） | `test/测试/fixed-path-full-chain.test.ts`（新，与 i-full-chain 并行） | 未取证 |
| T-17 | 类型检查：`npm run typecheck` 全绿（renderer 触及则 `typecheck:renderer`） | CI/本地命令 | 未取证 |
| T-18 | known red：按 §二 基线（含 9 条 star-routing/i-full-chain 基线红与 `test/编排` 24 fail）复测；同名用例不恶化、新增确定性失败=0、新 skip=0；既有失败消失需解释；known-red 不要求为 pass | 全量 TAP before/after | 未取证 |
| T-19 | H1/边界：写集外 diff=0；`角色卡/**` 未改；`src/common/gates/` 未改；新文件位于既有 directory 授权 | diff 清单 + 边界核对 | 未取证 |
| T-20 | 文档格式：doc_format 54 格式不变；`team-plan/v3` 说明与 `contract_check` 文案同步；`project-roster/v4`（v3 兼容、可选 `roles[].review`）解析/示例/错误文案同步 | `test/编排/*doc*`、契约测试 | 未取证 |

---

## 六、真机全链（RR；另授权、预算另报；初始状态全部 `未取证`）

| 编号 | 判据 | 取证 | 状态 |
| --- | --- | --- | --- |
| **RR-01** | **隔离实例**：全新临时项目目录（空文件夹）；独立 Electron userData/session 目录、独立 `ANS_E2E_OUTDIR`；不使用 9222/9223（隔离端口或不开远程调试）；真实 Electron + 真实模型 | 环境记录/截图 | 未取证 |
| **RR-02** | **空项目→贪吃蛇全链**：导入空项目 → 幕僚 → 客户需求「做一个贪吃蛇游戏（键盘控制、计分、重开、边界碰撞）」→ A1 阶段请求 → 产品意图 → 意图卡（confirm）→ 策划方案/模块/名单/架构/契约 → 方案卡（accept）→ 人事建卡/激活 → 团队计划+基线（git init/哈希入账/计划落盘）→ 任命卡（客户确认）⇒ A10 完成 → A11 stage-request → 运营派实现 → 实现角色在 `ans/task/<workflowId>` 串行提交 → 幕僚派验收角色（A12a criteria→A12b report）→ 应用生成 `docs/acceptance/snake-acceptance-v1.md` → 运营汇总 | 会话日志/账本/截图 | 未取证 |
| **RR-03** | **发布合并**：幕僚汇总交付 → 高风险合并卡 **客户本人确认（judge 不可代批）** → 应用本地合并 main（不 push/tag）→ **客户可玩/可开**（真实 UI 验证） | 卡记录/合并回执/截图 | 未取证 |
| **RR-04** | **账本/审计检查**：`.ans/state/workflows.jsonl`/`basis.jsonl`/`releases.jsonl` 事件完整；`.ans/trunk`、`.ans/runs` 未被新路径写入；`docs/audit/shell-gate.jsonl` 有 git 审计；`.gitignore` 托管块存在、治理文档未被 Git 跟踪；3 张卡各一次；无额外客户门；无 judge 冒充客户 | 账本/审计导出 | 未取证 |
| **RR-05** | **失败即停**：任何阶段失败 → 停止、保留现场/账本/日志、按真实错误回报；不合并 ans-studio main、不打 tag/发布产物、不上报成功 | 失败记录 | 未取证 |
| **RR-06** | **预算**：单独报告真实模型使用量/费用；本 B1 不含预算批准 | 预算报告 | 未取证 |

---

## 七、证据（EV；初始状态全部 `未取证`）

| 编号 | 证据 | 要求 |
| --- | --- | --- |
| EV-01 | 候选身份 | 实现分支/HEAD/全部实现提交；无 tag；无合并 main；旧分支停用记录 |
| EV-02 | D1 每批自检 | `npm run typecheck` + 受影响套件 before/after TAP + 失败名集合 diff + 文件清单/写集外 diff=0 |
| EV-03 | known red 复测 | 按 §二 基线（v1.1：含 9 条 star-routing/i-full-chain 基线红、`test/编排` 24 fail）；TAP 对比；环境抖动隔离复跑记录（9 红基线对照与 24 fail 实测见 B1.1 记录证据） |
| EV-04 | 确定性矩阵 | T-01…T-20 执行结果（pass/fail/insufficient/NA + 证据路径） |
| EV-05 | 接口评审 | `RoleToolId`（条件）、`DispatchMatrixMode`/`RoleDispatchPurpose`/`RoleDispatchPolicyInput.matrix`、`context({matrix})`、`merge-main` 卡种（`GovernanceCardKind`/`AppOwnedGovernanceCardKind`）、`task.created`/`dispatch_task` 字段、`close_created_task` v2、`activate_role_documents` v2、模块新导出字段（`fixedCards`/`fixedTargetRoleIds`/`fixedAllowedBuiltInRoleIds`/`isConvenerFixedBuiltInDispatchTarget`）、`project-roster/v4 roles[].review` 的评审记录与结论（失败即不支持） |
| EV-06 | 真机全链 | RR-01…RR-06 日志/截图/账本/预算报告；隔离证明 |
| EV-07 | H1/边界 | 写集外 diff=0；`角色卡/**`、`src/common/gates/` 未改；边界授权清单 |
| EV-08 | B2 独立报告 | 按本 B1 全量判定的独立验收报告（含限制与披露） |

---

## 八、B1 钉住的残余项（来自第三轮复核 G/Q 与协调方预 RR 确认）

1. **A12a/A11 先后门（G-1）**：按设计 v2「实施前写标准」，A12a criteria 任务须在 A11 stage-request 派发实现前创建；criteria 可在实现期间完成并记录 hash；轻量强度如需调整须在验收报告记录理由并经幕僚确认（AC-09）。
2. **B 路径分支基线（G-2）**：B 路径分支从当前 HEAD 创建；发布 preview 必须披露 base OID 与分支↔main diff stat；HEAD 非 main 时须标注非 main 基线（AC-22）。
3. **stop 收口顺序（G-3）**：以实现 v1.3 §3.3 校验为准（先收口 open advance 请求 → 再发 stop 请求）；§4.4 的最终停稳复核同时校验请求 closed（AC-07）。
4. **首请求幂等键（G-6）**：首次 stage-request 由应用先算 workflowId 并计算统一幂等键；模型可省略 idempotencyKey（AC-06）。
5. **`requestReleaseMerge` 条件化（G-7）**：按 Q2 结论执行——优先复用既有能力；确需新增须接口评审通过，失败即不支持（AC-24）。
6. **`project-roster/v4` 兼容（G-9）**：v3/v4 双字面量接受、旧解析器兼容、doc-format 不新增 id；须有契约测试（T-20）。
7. **Q3/Q5 实现细节**：写任务串行 + 每项目至多一个活动 fixed workflow；只本地合并 main，push/tag 另授权（AC-12/AC-22/AC-27）。
8. **接口评审与 known red**：见 EV-03/EV-05；known red 按 §二 列名清单不恶化（v1.2：含 9 条 star-routing/i-full-chain 基线红、`test/编排` 24 fail 与 TM-5 同名 known-red；known-red 不要求 pass）。
9. **merge-main 客户本人测试**：非判断卡、judge 拒绝/转人工、无 judge-delegated 来源（AC-14/T-10/T-15）。
10. **Q6 负例**：伪造 taskId/错误 creator/已关闭/停止任务/过期轮次/session 重启/fenced run/目标不存在/自派/非 reviewRoleId 项目角色/未标记 review 角色（AC-04）。
11. **角色自有记录例外（v1.2 协调方确认）**：AC-26 的「不改 `角色卡/**`」按此解释——`角色卡/<role>-code/docs/` 下 `api-spec.md`/`memo.md`/`feature-map.md` 属角色自有记录（非角色卡/边界/权限/roster），允许；须保持 H1=0、纯文档、不改变写权；`89e0ed6` 中 chief/product 的 4 个记录文档按此处理、不移除；其它 `角色卡/**` 仍不得改。
12. **TM-5 同名 known-red 接受（v1.2 协调方确认）**：`test/编排/doc-format-specs.test.ts` TM-5 schema 字面量扫描内容字面量 5→7（+`chief-workflow/v2`、+`ans-task-git-shell/v1`），测试名/数量不变、无新增失败；按 known-red 披露接受、不要求 pass；不得弱化断言/新增格式 id（见 §二）。
13. **`amendBasis` 使用约束（v1.2 协调方确认）**：RR 不做治理文档修正；`amendBasis` 当前无生产调用点；如 RR 确需使用，须协调方书面授权服务调用并记录授权/调用点，不得绕过 basis 账本，不得由模型自报（AC-19 机制与证据要求不变）。

---

## 九、限制与披露

- 本 B1 v1.2 基于只读清点、三轮独立复核与 known-red 实测（v1/v1.1 继承）、B2 复判（`eaa6af41…`）与协调方 2026-11-10 批准（RR 预算 + 三项确认）；未运行实现、未运行真实 Electron/真实模型；所有判据初始 `未取证`，不得以方案/记录自述替代证据。v1.2 仅落实协调方确认的三项（AC-26 例外、TM-5 known-red、`amendBasis` 约束）；RR 预算批准事实见版本头/§一；独立取证与协调方批复引用见 `角色卡/独立验收/docs/change/2026-11-10_B1.2_two-fixed-workflow-paths.md`。
- B1 冻结依据的哈希见 §一；若依据文档或方案变更，须重新复核并更新 B1（新版本，不原地改）。
- 真机全链预算已由协调方于 2026-11-10 批准（申请值见 RR 执行计划 §二；本 B1 记录该事实，不替代批复原件）；本 B1 不构成实施授权或客户批准。
- B1 由独立验收按任务精确范围授权写入 `docs/acceptance/`；B2 由独立验收执行；实现/D1 自检不替代 B2。
- 未提交声明：本文件写入本轮工作树，未 commit/push/merge/tag/发布；未改角色卡/边界/产品代码。
