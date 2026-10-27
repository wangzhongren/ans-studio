**风险档位：T3（治理路由行为、跨角色交接、共享 i18n、治理角色卡文本；治理/共享抽象变更即使以文档或文案为主也不得压成 T0/T1/T2）｜判定依据：客户闸门 0/1/2 与实施授权记录 `docs/communication/2026-10-27_intent_gate-review-return-routing.md`（当前 95 行；SHA-256 `d651e94138d791fd6413459976286bcec8f371d82ba8ce5240e9400f2662d2dc`；blob `33349c2a5bcc677ad82da38df462e940bddb760c`；闸门 0 已确认范围 A、闸门 1 已确认方案 v3.2 且 Q1–Q10/Q12 按推荐 A、O1+O2+O3 纳入、O4 不做、闸门 2 已确认团队计划与新建 worktree、实施授权已给且 RF-03「不要求，按现方案」）、客户在闸门 1 确认的策划方案 v3.2 `docs/planning/2026-10-27_design_gate-review-return-routing.md`（978 行；SHA-256 `cf28b38eab0ac1d768a689df85b482fa9bbae75eaaf8e575c208dada3327fbb8`；blob `f21c28d87f169e42263c902467479ceef7118292`；§9 P1–P19 + G1–G6 是不得弱化的最低基线）、策划复核记录 `docs/planning/2026-10-27_review_gate-review-return-routing.md`（149 行；SHA-256 `ddb757f86b7ef3334fd74df6b94c5376a660e180d8930d3ed00978b36b71d0ae`；blob `a7a724a893af4190e7def51c7d2f465ac1ac552e`；F1–F17 全部采纳、无未解决意见）、客户在闸门 2 确认的团队计划 `docs/scheduling/2026-10-27-gate-review-return-routing-team-plan.md`（404 行；SHA-256 `b019bc19905ed8d8a865976fa5819c4d7627c133ef6d148092032b2e8b43dd87`；blob `7d6216246cbefa30f59265821e6f199c551fa050`；仅作范围、写集、阶段（S1–S7）与证据口径依据，不是标准来源）、实现提案审核记录 `角色卡/项目管理/docs/design/2026-10-27_review_gate-review-return-routing-proposal.md`（147 行；SHA-256 `123175774f5fdb69b7ec8e91af0123358c84b591157c67c68f6c2abbcc5390aa`；blob `3ea87e09e9b0157ae94d29b5ad7d964096050273`；RF-01–RF-06 为已授权实施中的实现澄清；RF-04 落为本标准 P20）、代码事实基线 main `1465833`（`14658335c08dc0bd764f3ee6be41cc907c961f2b`）；main `1465833` 的 `角色卡/项目管理/docs/project-rules.md` §二第 9/11/12 条；技能 `references/testing.md` 的 T3 定义｜选定检查：受影响层测试（`test/桌面应用/acceptance-dispatch.test.ts` 主测试面，条件 `test/桌面应用/interface.test.ts`；`test/门禁引擎/{governance-standard-workflow,verifier-artifact-report,gate-review-flow-busy,governance-trio}.test.ts`；`test/runtime-core/request-gate-review-tool.test.ts`；`test/项目管理/shared/i18n.test.ts`，条件 `i18n-guard.test.ts`）+ 跨角色 e2e（`test/测试/governance-e2e-auto/`，测试角色按 S1 约定新增用例）+ T3 串行全量回归（`node --test --test-concurrency=1 "test/**/*.test.ts"`，排除已知挂起 `test/pi-adapter/write-sequencing.test.ts` 并记录可复现的排除方式）+ `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` + 真实 Electron `test/桌面应用/e2e/main.mjs`（fresh userData，`E2E_PASS`）+ 临时/隔离项目 G4 现场形状复现 + 目标项目 `pixel-space-demo` 与 `demos/` 零写入核对｜复用证据：无（本标准 v1 先于实施写盘；判定时只复用同候选、同输入/依赖、同命令、同夹具/配置、同环境的证据；不引用 flow-skeleton、lead-governance、自动推进或任何既往验收的结论，也不为其背书）｜全量回归：T3 适用，判定时必须对当前候选执行并与实施前基线逐项对照（本文件不声明已执行，也不声明任何通过结论）**

# 验收完成标准：gate 复核报告的退回重报与通过转交闭环（gate-review-return-routing）

- 任务 ID / 产品 flowId：`2026-10-27-gate-review-return-routing` / `gate-review-return-routing`
- 标准路径 / 版本 / 日期：`docs/acceptance/gate-review-return-routing-criteria-v1.md`（实现 worktree 内路径）/ **v1** / **2026-10-27**（S1 实施前写盘，写盘即冻结）
- 阶段：**实施前完成标准**。本文件只建立标准，不实施、不判候选、不写验收报告，不预判通过或返工；**不是验收报告、不是通过/返工/证据不足结论，不含任何实施结果判定**。
- 冻结状态：**已冻结（v1）**。本变更实施开始后，不得为适配候选修改本标准、放宽或加严实质；标准升版按 §2.5 执行，受影响证据重新核对。
- 验收基线：客户在**闸门 1** 确认的策划方案 **v3.2**（`docs/planning/2026-10-27_design_gate-review-return-routing.md`；978 行；SHA-256 `cf28b38e…`）；即实施方案。上位依据是客户在**闸门 0** 确认的意图记录（范围 A）。
- 范围/写集输入：客户在**闸门 2** 确认的团队计划（`docs/scheduling/2026-10-27-gate-review-return-routing-team-plan.md`；404 行；SHA-256 `b019bc19…`）与实施授权记录；团队计划**只作范围、写集、阶段顺序（S1–S7）与证据口径依据，不是标准来源**。
- 实现澄清输入：实现提案审核记录（147 行；`12317577…`）RF-01–RF-06；其中 **RF-04 落为本标准 P20**（O2 判据），RF-03 已被客户明确「不要求，按现方案」——验收**不得**要求「同版本号报告改写必须拒绝」。
- 代码事实基线：main `1465833`（`fix(governance): return retryable flow-busy for in-flight gate reviews`；完整哈希 `14658335c08dc0bd764f3ee6be41cc907c961f2b`）。写标准时主检出 `v1.7.0-work` 脏且不含该提交，不是候选来源。
- 实施 worktree：`.claude/worktrees/gate-review-return-routing`（分支 `feat/gate-review-return-routing`）；写标准时 HEAD = `1465833`、`git status --porcelain` 为空（未实施）、与 `main`/`origin/main` 同点。
- 验收口径（客户 2026-10-27 确认，闸门 0「验收口径补记」）：按 main `1465833` 的 `角色卡/项目管理/docs/project-rules.md` §二第 11 条「**所有变更默认独立验收**」执行——本变更完成后（流程 / 证据 / change-package 齐备）**启动独立验收**，不以发布版本为条件；发布版本另行随发布流程验收。工作树未提交的 release-only 条文不作基线。**标准在实施前冻结；实施中若方案实质变化，需重开闸门 1，标准随之升版（§2.5）。**
- 风险档位：**T3**（治理路由行为、跨角色交接、共享 i18n、治理角色卡文本；不降档）。
- 目标版本：**下个正式发布版本**（客户 2026-10-27 确认）；发布版本只是其中一种变更，**不是本变更启动独立验收的条件**。
- 候选版本：待统筹在 S7 变更包 `docs/scheduling/gate-review-return-routing-change-v1.md` 中提交，以产品候选哈希标识（见变更包与 §2.1）。
- 结论：**待判定**。
- 验收报告：**另写 `docs/acceptance/gate-review-return-routing-report-v1.md`**，由内置独立验收在实施后按本标准与统筹变更包判定；结论只能是**通过 / 返工 / 证据不足**。
- 独立变更边界：本文件只判定 gate 复核退回/通过路由闭环；flow-skeleton、lead-governance、自动推进、`flow-busy` 基线变更、发布验收等其他事实的候选、证据、报告与结论不与本变更合并。

---

## 一、基线、版本冻结与范围

### 1.1 确认链与冻结版本

| 项 | 状态 | 记录与版本 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-10-27，范围 A）** | `docs/communication/2026-10-27_intent_gate-review-return-routing.md`（当前 95 行；SHA-256 / blob 见文件头）；目标版本「随下个发布版本」 |
| 闸门 1：方案确认 | **已确认（2026-10-27）**：方案 v3.2 即实施方案；Q1–Q10、Q12 按推荐 A；**O1+O2+O3 纳入，O4 不做**；Q11 按 main §二.11 | 同上「闸门 1 确认记录（2026-10-27）」；对象为方案 v3.2（978 行；SHA-256 `cf28b38e…`）与复核记录（149 行；`ddb757f8…`） |
| 闸门 2：角色指派/写集/顺序/隔离/验收安排 | **已确认（2026-10-27）**：桌面窗口、项目管理、门禁引擎、测试 4 个现有 worker + 内置独立验收 + 统筹；无新增角色/边界变更；S1–S7；**T3**；从 main `1465833` 新建独立 worktree；`test/桌面应用/` 默认不新建文件 | 同上「闸门 2 确认记录（2026-10-27）」；对象为团队计划（404 行；SHA-256 `b019bc19…`） |
| 客户实施授权 | **已给（2026-10-27，与闸门 2 分开记录）**：按范围 S1–S7；RF-03「不要求，按现方案」；实施前标准 P1–P19+G1–G6（含 O2 判据） | 同上「实施授权记录（2026-10-27）」；实施授权不等于验收通过、提交、推送、合并或发布授权 |
| 本验收标准 | **S1 实施前写盘并冻结（v1，2026-10-27）** | 本文件；写盘即冻结，之后的候选判定按本版本 |

**文档状态头与确认记录不一致的已知情况（只报告，不改写）：** 方案 v3.2 文件头仍写「待沟通提交闸门 1 / 未实施」、团队计划状态头与 §1.5/§九仍写「闸门 2 未确认、客户实施授权未给」；这些是确认前的快照，为保持客户确认的哈希不被改写，验收不修改方案或团队计划，也不把过期状态头当成未确认。以 `docs/communication/` 的闸门记录为授权事实。另：提案审核记录引用沟通记录 86 行/`a12715d7…`，当前沟通记录 95 行/`d651e941…`，差异来自其后追加的「闸门 2 确认记录」与「实施授权记录」，属预期追加，不是已确认对象的版本变化。

**冻结哈希可复算：** 判定时须重新计算方案、复核记录、团队计划、沟通记录的 SHA-256（及需要时的 `git hash-object`），与文件头一致才可继续；若方案实质变化，按 §2.5 处理，不静默沿用旧版标准或旧范围。

### 1.2 标准来源、覆盖声明与冻结口径

1. **方案 §9 是直接标准来源。** 本标准把方案 §9.1 的 P1–P19 与 §9.2 的 G1–G6 逐条展开为可核对判据（§3.0 给出覆盖映射），展开内容取自方案 §3（产品方案）、§4（架构）、§5（契约）、§6（Q 项）、§7（O 项）、§8（风险）、§9（完成标准）、§10（测试策略）与 §12（未决项），**不新增产品需求，不放宽或加严方案实质，不删减方案 §9 的任何一项**。与方案冲突时以客户确认的方案 v3.2 为准。
2. **P20 是 O2 的补充判据（RF-04），不是新需求。** 客户在闸门 1 已纳入 O2（统筹/质检角色卡补充本方案新增系统任务说明，保留基线 `flow-busy` 段）；RF-04 指出方案 §9 的 P1–P19 没有专门判据覆盖 O2 的文本变更。P20 只把已确认的 O2 变成可核对标准，不改变能力位、写权、边界，也不替代 P10/P19。
3. **团队计划不是标准来源。** 它只用于核对参与角色、逐角色写集、阶段顺序（S1–S7）、隔离方式、验收安排与证据口径；其中的建议、分工或措辞不得被用来增加、放宽或加严本标准；与方案冲突时，以方案 v3.2 为准。
4. **已冻结的 Q/O 选择：** Q1–Q10、Q12 按推荐 A；O1（缺报告提前提醒）、O2（角色卡文本）、O3（看护 tick 扫描）纳入；**O4（新增账本 kind `gate.handoff`）不做**；Q11 按 main §二.11「所有变更默认独立验收」。未选择的备选（Q1 B/C、Q2 B/C、Q3 B、Q4 B、Q6 B、Q7 B、Q8 B、Q10 B、Q12 B、范围 B/C）不是本轮要求，也不得被实施者用来替代推荐 A。
5. **RF-03 客户决定（2026-10-27）：** 「不要求『同版本号报告改写必须拒绝』，按现方案 `expectedReportVersion` 机械复核；不重开闸门 1」。验收**不得**把「同版本号改写一律拒绝」当作判据；但 P18 的「同 sha 不同版本视为新报告」与稳定身份要求仍必须判定。
6. **代码阅读不能替代行为证据。** 源码只用于定位检查与解释契约；每一条 P/G 的 pass 必须来自当前候选上的实际执行输出、文件原文或只读复算；代码审查只能作为补充（P10、P12、P20、G1、G2、G5 的结构性核对可使用 diff/grep 作为主证据，但涉及行为断言仍须测试或运行输出）。

### 1.3 交付范围、写集与明确非目标

**本轮必须覆盖的产品面（团队计划 §3.1–§3.6；方案 §10.1）：**

- **桌面窗口**：`app/desktop/interface.ts`（退回/通过路由收敛、app 私有 `gate-handoff-routing/v1`、被拒报告稳定身份、R2b 提醒与上限、O1 提前提醒、O3 看护 tick 挂点、通过转交与 `readyWakeNotified` 同口径去重、恢复/重试/去重、主理系统行如实写投递结果、结构化诊断）；`app/desktop/governance-advance.ts`（四个纯文本构建器 `buildGateReportCorrectionTaskMessage`、`buildGateReportReminderTaskMessage`、`buildGateReturnConvenerTaskMessage`、`buildGatePassHandoffTaskMessage`，无 IO）；`test/桌面应用/acceptance-dispatch.test.ts`（主测试面，扩展既有文件）；`test/桌面应用/interface.test.ts`（条件，仅既有断言/接线受影响时）；`test/桌面应用/e2e/main.mjs`（默认只运行，定向最小追加须 S1 说明）。
- **项目管理（i18n）**：`src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`（扩展 `main.gateReview.returnedToProof` / `passNote` 的路由结果表述；新增退回/补正/报告不可读/通过转交的投递失败/补正提示 key；zh/en key 与占位符一致；保留 `main.gateReview.flowBusy`）；`test/项目管理/shared/i18n.test.ts`；条件 `test/项目管理/shared/i18n-guard.test.ts`、`test/项目管理/shared/i18n-guard-allowlist.ts`（仅允许清单受影响时）。
- **门禁引擎（O2）**：`src/common/门禁引擎/governance-roles.ts`（统筹卡/质检卡补充「退回补正 / 报告不可读提醒 / 通过转交」系统任务说明；**不得改写、删除或稀释基线 `1465833` 的 `flow-busy` 段**）；条件 `test/门禁引擎/governance-standard-workflow.test.ts`、`test/门禁引擎/verifier-artifact-report.test.ts`（按新卡文本断言）；`test/门禁引擎/gate-review-flow-busy.test.ts`、`test/门禁引擎/governance-trio.test.ts` **只回归、不改**。
- **测试**：`test/测试/governance-e2e-auto/`（目录授权）内新增跨角色 e2e 用例（团队计划建议 `t-gate-review-return-routing.test.ts`，`t-` 前缀未被占用；最终文件名按 S1 既有约定定稿，变更包登记实际文件名）及目录内夹具；T3 全量、真实 Electron、临时项目 G4 场景、目标/演示零写入核对。
- **管理记录（不是产品候选）**：顶层 `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/` 与各角色自身 `docs/change/`、`docs/feature/`、`memo.md`。本文件、报告、团队计划、变更包、沟通记录是验收引用与证据载体，不纳入产品候选哈希。

**明确非目标（方案 §2.3；团队计划 §1.2、§3.7、§3.8）：**

- 不改 gate 复核标准、验收标准、`gateKind`、客户 gate 规则；不把不合规报告判为通过；应用不自动引号化、不改写报告字节；不包含 `pixel-space-demo` 现场报告的一次性修复。
- 不自动派发下游 ready 步骤（范围 C）；应用不冒充统筹、不调用 `dispatch_task`、不打开 worker 会话、不派验收。
- **不修改 `request_gate_review` 既有契约**：基线 `1465833` 的 `flow-busy` 结果码集合、Provider 转达、统筹卡既有段与 i18n 文案保持；如需修改其语义/码集合，重开闸门 1（B10）。
- **不新增工具、能力位、角色、`FlowStepKind`、`gateKind`、cardKind、账本 kind（O4 不做）**；不改角色边界/写权/角色卡（O2 的 `governance-roles.ts` 内置卡文本属治理文本，不是 worker 角色卡/边界）；不改 `request_gate_review` 注入条件（仍只注入统筹，`governanceFunction === "schedule"`）。
- 不改 `src/common/编排/**`、`src/pipeline/orchestration/**`、`app/desktop/session.ts`、`app/desktop/watchdog.ts`、`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`src/model/**`、`src/provider/**`、`src/service/**`、`src/interface/**`、构建配置/依赖/发布配方；既有 gate fail（blocker/major）返工路由与最终验收返工路由不动（B8 既有接收方差异不在本范围）。
- **不动目标项目 `pixel-space-demo` 与 `demos/`**：不修复现场报告、不写目标源码/文档/flow/账本；验证用临时/隔离项目（应用自身既有 `.ans` 治理状态除外）。
- **`test/桌面应用/` 默认不新建文件**：路由测试并入 `acceptance-dispatch.test.ts`；若实施确需 `gate-handoff-routing.test.ts`，按团队计划 §2.4/§3.10 停止并重开闸门 2/人事补边界条目，实施者不得自行新建。
- 不 commit/push/发布；不启用 task_ops、不伪造任务令牌/锁/审批/机器预检（本仓库无 `.ans/project.json`）。

### 1.4 写标准时的只读基线（2026-10-27）

| 检查 | 命令 / 方式 | 结果 |
| --- | --- | --- |
| 实施 worktree HEAD | `git -C .claude/worktrees/gate-review-return-routing rev-parse HEAD` | `14658335c08dc0bd764f3ee6be41cc907c961f2b`（= `1465833`） |
| 实施 worktree 分支/状态 | `rev-parse --abbrev-ref HEAD` / `status --porcelain` | `feat/gate-review-return-routing` / 空（未实施、未暂存） |
| main / origin/main | `git rev-parse main` / `origin/main` | 均为 `14658335c08dc0bd764f3ee6be41cc907c961f2b` |
| 方案 v3.2 | `sha256sum` + `wc -l` + `git hash-object` | `cf28b38eab0ac1d768a689df85b482fa9bbae75eaaf8e575c208dada3327fbb8` / 978 行 / `f21c28d87f169e42263c902467479ceef7118292` |
| 策划复核记录 | 同上 | `ddb757f86b7ef3334fd74df6b94c5376a660e180d8930d3ed00978b36b71d0ae` / 149 行 / `a7a724a893af4190e7def51c7d2f465ac1ac552e` |
| 团队计划 | 同上 | `b019bc19905ed8d8a865976fa5819c4d7627c133ef6d148092032b2e8b43dd87` / 404 行 / `7d6216246cbefa30f59265821e6f199c551fa050` |
| 实现提案审核记录 | 同上 | `123175774f5fdb69b7ec8e91af0123358c84b591157c67c68f6c2abbcc5390aa` / 147 行 / `3ea87e09e9b0157ae94d29b5ad7d964096050273` |
| 沟通记录（闸门 0/1/2 + 实施授权） | 同上 | `d651e94138d791fd6413459976286bcec8f371d82ba8ce5240e9400f2662d2dc` / 95 行 / `33349c2a5bcc677ad82da38df462e940bddb760c` |
| 相关测试文件存在性（worktree） | `ls test/桌面应用/{acceptance-dispatch.test.ts,interface.test.ts,e2e/main.mjs}`、`test/门禁引擎/{gate-review-flow-busy,governance-trio,governance-standard-workflow,verifier-artifact-report}.test.ts`、`test/runtime-core/request-gate-review-tool.test.ts`、`test/项目管理/shared/{i18n,i18n-guard}.test.ts`、`test/pi-adapter/write-sequencing.test.ts` | 全部存在；`test/测试/governance-e2e-auto/` 含既有 e2e 与 `fixture.ts`（新增用例可落在该目录） |
| 已知挂起测试 | `ls test/pi-adapter/write-sequencing.test.ts` | 存在；T3 全量回归须排除并记录可复现的排除方式，不得把挂起当通过（以 S1 实测为准） |
| Node / npm | `node --version` / `npm --version`（写标准 shell） | Node **v24.22.1** / npm **11.19.1**；取证时须记录实际版本与路径，不得沿用本节值而不核对 |
| 仓库脚本 | `package.json`（main `1465833`） | `typecheck` = `tsc --noEmit`；`typecheck:renderer` = `tsc -p app/renderer/tsconfig.json`；`build:renderer` = `vite build --config vite.config.ts`；`app` = `electron app/main.ts`；无独立 `test` 脚本，runner 为 `node --test` |
| task_ops | `.ans/project.json`（worktree） | **不存在**；未启用 task_ops，不伪造机器状态 |
| 既有验收目录 | `ls docs/acceptance/`（worktree） | 已有既有标准/报告（i18n、目录、写卡门禁、acceptance-rework、role-root-docs 等）；它们是既往事实，不是本变更候选或证据 |

**写标准时的只读代码事实（仅用于定位检查，不作为证据；行号为 `1465833` 快照的近似值，判定时以符号名与实际候选为准）：** `app/desktop/interface.ts::processGateReportAttempt` 约 7472 起（先写 `returned-to-proof` 的分支包含缺报告陈旧、version-older、candidate-changed、解析失败、nonblocking-fail、`gate-report-missing`/`unobservable`/`invalid`；缺报告未陈旧与 `readFile` 失败分支保持 `dispatched`）；`processGateReviewsForFlow` 约 7890；`isStewardExecutableReadyStep` 约 4751；`wakeStewardForReadySteps` 约 4789；`readyWakeNotified` 为进程内 `Map`（约 4748/4826/4876）；`noteGateOnce` 约 7248（`gateNoteState` 为内存态，见 RF-02）；gate 记录扫描枚举约 7950 只跳过 `-rework-routing.json`（新增 `-handoff-routing.json` 必须加入同一跳过规则）；`flow-busy` 判定约 6958–6961，位于 gate 记录写盘（约 7077）与账本追加（约 7086）之前（零副作用）；`RequestGateReviewResult["code"]` 含 `flow-busy`（`src/model/runtime.ts` 约 1072–1077）；Provider 冻结 code 集约 3180、专门转达/矛盾回执约 3233–3243（`src/provider/runtime/tools.ts`）；`src/provider/runtime/schema.ts` 约 1223–1229 已有 `flow-busy` 说明；统筹卡 `flow-busy` 段在 `src/common/门禁引擎/governance-roles.ts` 约 923/927/930；质检卡「应用会退回你补报告、不触发返工」约 1155；i18n `main.gateReview.flowBusy` zh-CN 1464 / en-US 1650，`passNote` zh-CN 1470 / en-US 1656，`returnedToProof` zh-CN 1474 / en-US 1660；`request_gate_review` 仅注入统筹（`app/desktop/session.ts` 约 452/670/2524 的注释与注入判据）；桌面只经 `src/pipeline/orchestration/flow-state.ts` 公共出口消费 `listReadyFlowSteps`/`completeGateStep`/`classifyGateReviewTriage`/`latestGateReviewReport`；`listReadyFlowSteps` 定义于 `src/common/编排/flow-state.ts` 约 1438；`completeGateStep` 在 `src/common/编排/flow-service.ts`（符号定位）；`parseAcceptanceTriageReport` 在 `src/common/编排/acceptance-triage.ts` 约 302。

### 1.5 本文件不产生的授权

本文件不授权提交、推送、合并、发布或任何对外操作；不授权派发 worker、修改写集/档位/方案/团队计划/沟通记录/角色卡/边界/目标项目/演示；不授权跳过闸门 2 确认的写集与阶段顺序（S1–S7）。写标准只完成实施前验收准备；实施按已给的客户实施授权与团队计划执行。

---

## 二、候选身份、证据与失效规则

### 2.1 候选身份与隔离

**产品候选**是实施 worktree 中相对基线 `1465833` 的以下精确内容：

- `app/**`（仅 `app/desktop/interface.ts`、`app/desktop/governance-advance.ts` 及 `app/desktop/` 内既有授权文件；`test/桌面应用/e2e/main.mjs` 默认不属于候选，除非 S1 说明并最小追加）；
- `src/common/shared/i18n/messages/zh-CN.ts`、`en-US.ts`；`src/common/门禁引擎/governance-roles.ts`（仅 O2 卡文本）；
- `test/**` 中本变更授权文件（`test/桌面应用/acceptance-dispatch.test.ts` 扩展、条件 `interface.test.ts`、`test/项目管理/shared/i18n.test.ts`、条件 guard、`test/门禁引擎/*` 条件卡文本测试、`test/测试/governance-e2e-auto/` 新增用例与夹具）；
- 角色自身文档中确属本任务授权的改动（`角色卡/桌面窗口/docs/{feature,change}/**`、`角色卡/项目管理/docs/change/**`、`角色卡/门禁引擎/docs/change/**`、`角色卡/测试/docs/**`，按团队计划 §三与各角色文档规则）。

**管理记录不是产品候选：** 顶层 `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/` 的文件哈希不用于标识产品候选，也不得把管理记录变化说成产品改动；方案、标准或团队计划版本变化按 §2.5 处理。

**候选隔离：**

- 候选只来自隔离 worktree 相对 `1465833` 的 diff；**不得混入主检出 `v1.7.0-work` 的 flow 骨架等未提交改动**，也不得混入 `.claude/worktrees/gate-review-flow-busy` 或 `demos/`、`.claude/`。
- `.ans/governance/...` 运行时状态（gate 记录、路由记录、账本、会话/治理状态）不是产品候选；测试夹具必须使用临时项目根。
- 若无法从 `git status --short` / `git diff` 区分某 hunk 的归属，按 `insufficient evidence` 处理，要求统筹提供候选差异说明；不得「整文件算本变更」或「整文件算既有」。
- **候选冻结：** 统筹提交变更包并声明候选后，候选冻结。判定前任一产品文件内容变化（任一 `git hash-object` / SHA-256 变化），受影响证据失效，按 §2.3 重取。

### 2.2 证据原始性与复用

- **原始证据**指：命令、cwd、时间、执行者、环境（Node/npm/OS/Shell）、退出码、stdout/stderr 原文、测试计数（pass/fail/skip/todo）、失败原文、候选文件哈希、`git status`/`git diff`、gate 记录 / 路由记录 / 账本 / flow 文件原文、e2e 与 Electron 的原始日志/报告、临时项目场景清单与哈希。开发自述、测试转述、工具成功提示、计划文本、代码注释、模型自我报告不能单独作为原始证据。
- **行为证据必须对应当前候选。** 证据生成时间须晚于本标准写盘时间；早于标准的证据只能作为实施前基线用于失败分类，不能作为通过证据。单元测试必须实际执行并记录计数，不能只贴测试文件内容。
- **复用规则：** 只有同候选、同输入/依赖、同命令、同夹具/配置、同环境的证据可以复用。复用须在报告「复用证据」栏写明来源、原候选、原命令和仍然有效的理由。候选、输入、依赖、契约、夹具、配置或环境变化时，受影响证据失效，只补失效部分。不得因为「别的角色跑过」就跳过必需检查。
- **T3 全量回归不是可复用项：** 必须对当前候选执行；实施前基线只用于区分既有失败，不能替代最终候选的全量回归。
- **证据媒体边界（客户 2026-10-27 规则）：** 验收证据**最多使用截图**，**不得要求或提供录屏/屏幕录像作为验收要求或选项**；缺少录屏不构成 `fail` 或 `insufficient evidence`。截图必须来自当前候选的真实运行、**关闭 DEBUG 覆盖层**，并记录 SHA-256、候选版本和拍摄命令/窗口尺寸；日志、校验输出和哈希可作辅助证据。
- **代码阅读不能替代行为证据：** P1–P9、P11、P13–P19 的 pass 必须来自实际执行输出、文件原文或只读复算；P10、P12、P20 与 G1/G2/G5 的结构性核对可使用 diff/grep，但涉及「不改契约」「保留文本」「不新增能力」等断言仍须测试或原文证据。

### 2.3 证据失效矩阵

| 证据生成后的变化 | 失效范围 | 处理 |
| --- | --- | --- |
| 任一 `app/**` 产品代码变化 | 桌面测试、e2e、Electron、临时项目场景、候选哈希、T3 全量结论 | 重取受影响证据；候选变化后重跑 T3 全量与真实 Electron |
| `interface.ts` 路由/记录/稳定身份/提醒/重试/去重/看护挂点变化 | `acceptance-dispatch.test.ts`、`interface.test.ts`、e2e、Electron、临时项目 | 重跑桌面套件与场景；重新记录路由记录/账本/系统行 |
| `governance-advance.ts` 任务文本变化 | 构建器单测、桌面任务文本断言、e2e | 重跑文案与链路测试；旧文本逐字对比重取 |
| `src/common/shared/i18n/messages/*` 变化 | i18n parity/guard、桌面 typecheck、系统行断言、e2e | 重跑 parity 与受影响系统行断言 |
| `src/common/门禁引擎/governance-roles.ts`（O2）变化 | 门禁引擎卡文本测试、`flow-busy` 卡断言、`governance-trio` | 重跑门禁引擎全套与 `flow-busy` 回归；重新核对基线段保留 |
| 任一 `test/**` 测试文件或夹具变化 | 该套件及其依赖的集成/e2e；全量回归 | 重跑该套件与受影响链路；不得只重跑新增用例 |
| 方案/标准/团队计划版本或确认记录变化 | 验收基线/范围依据；受影响标准行 | 方案实质变化重开闸门 1；标准按 §2.5；团队计划实质变化重签闸门 2 |
| 基线 `1465833` 之后 main 前进且涉及 gate/`request_gate_review`/角色卡/i18n | 全部代码事实、回归基线、候选身份 | 按团队计划 §2.4 第 5 条停止回报/重核；实质变化重开闸门 1，不沿用旧行号/事实 |
| 环境变化（Node/npm/OS/Shell/依赖） | 受环境影响的全量回归、e2e、Electron、临时项目 | 记录新环境并重跑受影响检查；不能把环境差异当成通过 |
| 目标/演示在核对期间被外部改动 | 零写入证据 | 记录时间与差异，重新快照；不得把外部改动算作本任务写入 |
| 证据文件被替换、丢失或无法追溯 | 对应验收行 | `insufficient evidence`，重取原始输出 |

### 2.4 T3 验收强度：全量回归、真实 Electron、临时项目、目标零写入

本变更是治理路由行为、跨角色交接、共享 i18n 与治理卡文本变更，**T3 适用且必须执行适用全量回归**，不得以「文案为主」「非发布」降档：

- **T3 串行全量**：最终候选执行 `node --test --test-concurrency=1 "test/**/*.test.ts"`（团队计划 §6.4）；排除已知挂起 `test/pi-adapter/write-sequencing.test.ts`，并在证据中记录可复现的排除方式（命令行/清单/脚本），不得静默跳过；`skip`/`todo` 不计通过。
- **类型/构建检查**：`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`（本变更预期不改渲染层，但按 T3 仍须执行并记录；不可执行时按 `insufficient evidence`，不得 N/A）。
- **基线对照**：实施前由测试角色（S1）对基线 `1465833` 跑同一组命令，记录计数、失败清单与分类；最终候选与基线逐项对照，**本次新增确定性失败不得放行**。
- **失败分类至少区分**：既有 Windows symlink `EPERM`；桌面并发/时序偶发（隔离/整文件/串行复跑分类）；`write-sequencing` 挂起（排除并记录）；其他新增失败（停止回报，不得笼统写「环境问题」）。每组既有失败须附基线原始输出与原因。
- **真实 Electron**：`test/桌面应用/e2e/main.mjs` 对当前候选 fresh userData 运行，记录命令、环境、退出码、`E2E_PASS`/`E2E_FAILURES`/`E2E_DONE` 原始输出；`E2E_PASS` 必须为 true；平台性失败按基线对照，不算本变更通过。
- **临时/隔离项目场景（G4）**：复现现场形状（gate 派发 → 结构坏的 pass 报告 → 补正任务可见 → 修正为新版本 → 机械复核通过 → 统筹收到 `[Gate 通过]`）；**不写 `pixel-space-demo` 与 `demos/`**；临时 `.ans` 与项目根落在系统临时目录。
- **目标/演示零写入**：判定时对 `pixel-space-demo` 与 `demos/` 做前后哈希/清单核对（应用自身既有 `.ans` 治理状态除外）；任何写入按 `fail`，无法核对按 `insufficient evidence`。
- 全量回归、真实 Electron、临时项目场景、目标零写入、`npm run typecheck` 缺一即 `insufficient evidence`（若已有失败证据则为 `fail`）。

### 2.5 标准版本冻结

- 本文件版本为 `gate-review-return-routing-criteria-v1`，2026-10-27 于 S1 实施前写盘后冻结。实施开始后不得为适配候选修改本标准、放宽或加严实质。
- 若发现标准本身有误、与方案 §9 冲突或与闸门 0/1/2 确认范围不一致：记录问题、理由和受影响行，递增为 v2，交沟通/统筹确认后再用新版本判定；受影响证据重新核对，旧报告过期。
- **若实施中方案实质变化**（接收方改变、改为全部自动重派、新增账本 kind、修改 `flow-busy` 契约/语义、改变「不自动通过」不变量、扩到范围 B/C、B9 触发等）：按方案 §8.2/团队计划 §7.3 **重开闸门 1**；本标准随之升版，不得静默沿用 v1 判定变更后的方案。
- 本标准是管理记录，不是客户确认记录，也不是验收结论；标准版本变化不自动改变方案、团队计划或档位。
- 本文件不声明「已验证」「已验收」「目标项目已修复」；这些表述只能出现在实施后的报告或客户沟通中，且须有对应证据。

---

## 三、验收标准

### 3.0 方案 §9 覆盖映射

| 方案 §9 项 | 本标准 | 说明 |
| --- | --- | --- |
| §9.1 P1 退回-报告侧路由 | **P1** | 直接对应，含 R1–R5 补正任务内容与投递 |
| P2 退回-统筹知情 | **P2** | 直接对应 |
| P3 候选变化 | **P3** | 直接对应；稳定身份细节并入 P18 |
| P4 多轮/预算 | **P4** | 直接对应 |
| P5 通过-转交 | **P5** | 直接对应 |
| P6 通过-去重 | **P6** | 直接对应 |
| P7 幂等/重启 | **P7** | 直接对应；崩溃窗口按方案 §9 全局说明 |
| P8 失败语义 | **P8** | 直接对应 |
| P9 不自动通过/不伪造 | **P9** | 直接对应 |
| P10 能力/边界与既有契约零变化（条件依赖 Q8/O4） | **P10** | O4 未选，按「无新增账本 kind」判定 |
| P11 扫描触发 | **P11** | 含 O1 提前提醒与 O3 看护 tick（客户已选） |
| P12 i18n/可见性 | **P12** | 直接对应 |
| P13 诊断 | **P13** | 直接对应 |
| P14 既有行为回归 | **P14** | 直接对应 |
| P15 历史退回 R7 | **P15** | 直接对应 |
| P16 路由记录损坏/fail-closed | **P16** | 直接对应 |
| P17 报告不可读提醒 R2b（含 F10 上限） | **P17** | 直接对应 |
| P18 被拒报告稳定身份（F2/F13） | **P18** | 直接对应 |
| P19 `flow-busy` 无冲突/无回归 | **P19** | 直接对应 |
| §9.2 G1–G6 | **G1–G6** | 直接对应（G3 采用团队计划 §6.4 的 T3 命令口径） |
| **O2（闸门 1 已选）+ RF-04 判据缺口** | **P20** | **补充判据**：角色卡保留基线 `flow-busy` 段、只补充本方案新增通知来源/边界、测试断言保留与新增；不是新需求，不改变能力位/边界 |

**覆盖声明：** 方案 §9 的每一项均在本标准中有对应判据，编号一一对应；未删除、未弱化、未加严方案实质。P20 只补充 O2（客户已确认选项）的核对落点。任何在判定中被发现缺失/弱化的方案项，按 `fail` 或 `insufficient evidence` 处理，不以编号或分组为由跳过。

### 3.1 验收表（判定时逐行填「实际证据路径/哈希」「候选版本」「结果」「验收判断」）

| ID | 依据（方案条款/Q/O） | 判定项（摘要） | 所需证据（摘要） | 判定规则（摘要） | 适用范围 |
| --- | --- | --- | --- | --- | --- |
| P1 | 方案 §9.1 P1；§3.1.1 R1–R5、§3.1.2；Q1 A；Q9 A/O2 | 报告侧退回后向质检成功投递一条 `[Gate 报告补正]`，含身份、上一报告、可执行错误、下一版本路径、格式要求；不含改判/已接受表述 | 桌面测试原始输出；任务文本；路由记录 JSON；gate 记录；账本/flow 快照；候选哈希 | 见 §3.2.1 | R1–R5 报告侧退回；trio 下质检会话可打开 |
| P2 | 方案 §9.1 P2；§3.1.3；Q1 A；Q10 A；§9 全局说明 | 每次退回转换向统筹成功投递一条对应系统任务（知情/需重新请求/需人工），原因与下一步如实；重复扫描不重复；部分失败只重试失败方 | 任务文本；路由记录 delivery；计数；两个 Interface 实例；主理系统行 | 见 §3.2.2 | R1–R6 退回转换；R7/R8 见 P15/P4 |
| P3 | 方案 §9.1 P3；R6；Q6 A；F2/F13 | 候选变化不向质检发补正；统筹收到「需重新 request_gate_review」；旧报告不放行；gate 保持 pending；保存稳定身份 | 任务文本；gate 记录 `returned-to-proof`；flow revision；重复扫描输出 | 见 §3.2.3 | 仅 R6 候选变化 |
| P4 | 方案 §9.1 P4；R8；Q5 A；§4.5 | 连续 3 轮报告侧退回后停止自动补正交统筹人工；投递失败每接收方最多重试 3 次；gate 始终 pending；从未自动通过 | 轮次计数；delivery attempts；人工任务文本；flow/账本快照 | 见 §3.2.4 | 全部退回 cause；R2b/O1 不计数（见 P17） |
| P5 | 方案 §9.1 P5；§3.2；Q2 A；F4；Q7 A | 收口成功后向统筹成功投递一条 `[Gate 通过]`，含身份/报告/修订/「你可派发」与「仅知情」分组或空原因；应用未派发 | 任务文本；flow diff；账本；桌面测试；e2e | 见 §3.2.5 | 通过路径（含幂等 already-done） |
| P6 | 方案 §9.1 P6；Q7 A；§3.5.4 | 同一事件周期统筹最多一条覆盖「gate 通过 + ready」的消息；既有 `[自动推进]` 不重复同一 revision+ready 集合 | 计数；去重键行为；测试输出 | 见 §3.2.6 | 通过事件与既有 ready 唤醒 |
| P7 | 方案 §9.1 P7；§3.5；§4.5 第 6 点；F5/F11 | 重复 settle/扫描/重启不重复补正或转交（除已声明崩溃窗口）；路由记录驱动恢复；同一报告身份只路由一次，新版本只开一轮 | 两个 Interface 实例；磁盘记录；计数；崩溃窗口诊断 | 见 §3.2.7 | 全部路由与重启恢复 |
| P8 | 方案 §9.1 P8；§3.4；§4.5；Q12 A | 发送/打开失败如实记 failed、主理如实说明、有界重试、只重试失败方；路由记录写失败保持 dispatched、不发任务；从不伪造成功；统筹不可用不改投主理 | 故障注入输出；诊断；系统行；路由记录；账本/flow 快照 | 见 §3.2.8 | 传输/记录写失败路径 |
| P9 | 方案 §9.1 P9；§2.1.3；§3.7；§5.5 | 无可解析 `conclusion=pass` 报告时绝不标 gate done/写 passed；不改报告字节、不写 customer.decision、不进入验收分诊；退回时 gate pending | 负例测试；报告前后 SHA-256；账本/flow 快照；diff/grep | 见 §3.2.9 | 全部 gate 路径 |
| P10 | 方案 §9.1 P10；Q8 A；O4 不做；§4.1/§4.6 | `request_gate_review` 仍只注入统筹、契约/回执码不变、`flow-busy` 保持；无新增工具/能力位/FlowStepKind/gateKind/cardKind/账本 kind；角色边界/写权未变；路由记录为 app 私有 | session 行为/断言；model/provider diff；枚举 grep；边界/角色卡 diff；账本 diff | 见 §3.2.10 | 整个变更 |
| P11 | 方案 §9.1 P11；Q3 A/O1；Q4 A/O3 | 扫描在真实事件 + 看护 tick 上运行；O1 在质检空闲无排队时一次提前提醒；重复 tick/事件不刷屏/不重复；看护不可用不影响真实事件路径 | tick 测试；计数；诊断；flow/记录快照 | 见 §3.2.11 | 触发面（含 O1/O3） |
| P12 | 方案 §9.1 P12；Q10 A；RF-05 | 新增/修改用户可见系统行 zh/en key 齐全、占位符一致；主理系统行如实反映结果；agent 任务文本与 UI 文案分开；保留 flowBusy 与 passNote 最终验收语义 | i18n parity 测试；key 清单；系统行原文；guard | 见 §3.2.12 | 全部新增/修改系统行 |
| P13 | 方案 §9.1 P13；§3.6；§二.10 打印/日志-01 | 每次路由决策/跳过/失败有结构化诊断（flowId/gateId/reasonCode/attempts），无报告正文/凭据/命令原文/个人数据，不改变控制流 | 诊断原文；字段检查；测试断言 | 见 §3.2.13 | 全部路由决策 |
| P14 | 方案 §9.1 P14；§1.4；§8.1 | 既有 gate pass/fail/nit-only/返工/恢复/gate.review/artifact.observed 除新增转交外不变；两条既有返工路由未动；既有桌面/门禁/i18n 测试通过 | 全量/定向输出；diff；既有用例清单 | 见 §3.2.14 | 既有 gate 与返工行为 |
| P15 | 方案 §9.1 P15；R7；F6；RF-02 | 实现前历史 `returned-to-proof` 无路由记录：只一次统筹「历史退回」提示（跨重启不重复），不向质检发送、不猜原因、不重派、不转 dispatched | 历史夹具；两个 Interface 实例；任务/计数；诊断 | 见 §3.2.15 | 仅实现前历史记录 |
| P16 | 方案 §9.1 P16；§3.4；F6；RF-02 | 路由记录损坏可重建；无法重建 fail-closed（不发任务、主理如实、人工）；不伪造发送/退回/通过；历史 passed 无 passHandoff 不追溯转交 | 损坏夹具；重建输出；系统行；诊断 | 见 §3.2.16 | 路由记录缺失/损坏；历史 passed |
| P17 | 方案 §9.1 P17；R2b；F10；Q3 A/O1；Q5 A | 报告存在但不可读：一次可执行提醒 + 统筹知情；记录保持 dispatched；身份 `requestId+reportPath+reportVersion`；同一版本不重复；同一 requestId 提醒（R2b+O1）上限 3 次后停止并给统筹人工提示 | readFile 失败注入；计数；gate 记录；路由记录；测试输出 | 见 §3.2.17 | R2b 与 O1 提醒 |
| P18 | 方案 §9.1 P18；§3.1.1 身份稳定性；§4.5；Q6 A；F2/F13 | R5/R6 保存被拒报告稳定身份；同一旧报告重复扫描不转 dispatched/不覆盖 revision/不调用 completeGateStep/不收口；同 sha 不同版本视为新报告；仅新版本/新 sha 或重新 request 开启新一轮；记录形状不变 | 重复扫描测试；同 sha 不同版本用例；记录 JSON；gate/flow 快照 | 见 §3.2.18 | R5/R6 被拒报告 |
| P19 | 方案 §9.1 P19；§1.4/§3.0/§5.2；B10 | flow 在途时 `request_gate_review` 返回可重试 `flow-busy`（非 unavailable），不写/不改 gate 记录/账本（即使已有旧记录）、不派任务；本方案路由不因 flow-busy 触发；卡/Provider/i18n/既有测试保持 | 桌面测试原始输出；gate/账本快照；卡文本；Provider 测试；i18n 测试 | 见 §3.2.19 | 请求时 flow-busy 及回归面 |
| P20 | 闸门 1 O2（Q9 A）+ RF-04 | 统筹/质检卡保留基线 `1465833` 的 `flow-busy` 段与既有断言；只新增本方案通知来源/边界（应用机械任务、不是客户消息/新复核轮次、不改判定）；不改能力位/写权/边界；卡文本测试保留旧断言并新增断言 | `governance-roles.ts` diff；基线段子串核对；门禁引擎测试原始输出 | 见 §3.2.20 | 仅 O2 卡文本 |
| G1 | 方案 §9.2 G1 | `npm run typecheck` 通过（0 诊断），记录候选与命令 | typecheck 原始输出；候选哈希 | 见 §3.3 | 最终候选 |
| G2 | 方案 §9.2 G2 | 定向套件通过并记录计数：`acceptance-dispatch.test.ts`（含新增路由用例）、`test/门禁引擎/*`（O2 已选）、`test/项目管理/shared/i18n.test.ts` | 各套件命令/退出码/计数/失败原文 | 见 §3.3 | 最终候选 |
| G3 | 方案 §9.2 G3；团队计划 §6.4 | T3 适用完整回归（桌面应用全套、门禁引擎全套、共享 i18n、T3 串行全量、类型/构建检查，必要时 e2e/真实 Electron），记录命令/环境/退出码/结果 | 全量原始输出；基线对照；失败分类 | 见 §3.3 | 最终候选；不得 N/A |
| G4 | 方案 §9.2 G4；团队计划 §6.4 | 临时/隔离项目复现现场形状并观察补正→修正→机械复核通过→统筹 `[Gate 通过]`；截图至多（真实运行、关闭 DEBUG、记录 sha256/候选/命令）；不要求录屏 | 场景记录；任务/系统行；截图清单与哈希；临时项目路径 | 见 §3.3 | 临时项目，不写目标/演示 |
| G5 | 方案 §9.2 G5；团队计划 §6.5 | 变更包含候选哈希、改动路径、任务节点、证据链接、风险档位 T3；未 commit/push/发布 | 变更包与复算；git 状态 | 见 §3.3 | S7 |
| G6 | 方案 §9.2 G6；团队计划 §6.1/§6.5 | 桌面窗口/门禁引擎（O2）/项目管理（i18n）按各自规则更新 feature/change 记录；链接方案与复核处置；目标/演示零写入 | 文档路径与内容摘录；目标前后哈希 | 见 §3.3 | 文档与零写入 |

### 3.2 P1–P20 逐条判定口径

> 通用要求：以下每一行的 pass 都必须有当前候选上的实际执行输出、文件原文或只读复算输出；没有执行输出、只有代码阅读或角色自述的，按 `insufficient evidence`。`fail` 需要已有证据表明不满足标准或候选包含明确不允许的改动；`insufficient evidence` 是「尚不能判断」；`not applicable` 必须写明依据，且不得把整行 N/A 当 pass。P1/P2/P5/P7 的「恰好一条/不重复」均按方案 §9 全局说明（F5/F11）解释：**除「发送成功后未落 `sent` 即崩溃」窗口外**；该窗口须有诊断，验收按已知限制核对，不因该窗口判失败或证据不足（§4.5 第 6 点）。

#### 3.2.1 P1 退回-报告侧路由

**依据：** 方案 §9.1 P1；§3.1.1 R1–R5；§3.1.2；§3.1.4；Q1 A；Q9 A/O2；§9 全局说明（F5/F11）。

**判定项：**

1. 给定 gate 记录 `dispatched` 且最新报告存在但结构不合规（至少覆盖：`acceptance-triage/v1` 段 YAML 语法错误——现场形状为某 `reason` 以反引号开头；以及语义错误如未知字段/重复 id/空 owner 或 reason/非法 severity 等，语义错误须给出字段路径），应用写出 `returned-to-proof` 记录，并向质检（verifier）**成功投递恰好一条** `[Gate 报告补正]` 系统任务（失败重试不改变「成功投递一条」的事实；按 §9 全局说明的崩溃窗口解释）。
2. 任务内容包含：`flowId` / `gateId` / `gateKind` / gate 步骤标题、复核标准路径、候选 `flowRevision`、上一份报告路径/版本/sha（若有）；**可执行原因**逐条 `path: message`（最多 5 条；语义错误给字段路径；YAML 语法错误给行/列位置与原始原因）；**格式要求清单**（恰好一个 fenced YAML 段、`schema: acceptance-triage/v1`、`conclusion` 枚举、items 必填字段、`fail`/`conditional` 至少一个 blocker/major、`pass` 不得带 blocker/major、字符串含 YAML 保留字符时需引号、长度/条数上限等，至少覆盖与本次错误相关的项与通用结构要求，不得只写「请修正格式」）；**要写的下一份报告路径与版本**（R3/R4 已有报告：`docs/acceptance/<flowId>-<gateId>-report-v(N+1).md`，版本化不覆盖旧报告；R1/R2 无报告或不可安全读取：按记录中请求的报告路径/版本写，不覆盖任何既有版本；R5 版本偏旧：按**派发要求的版本**写，不是「最新+1」，且 `expectedReportVersion` 在覆盖 `record.reportVersion` 前捕获）。
3. 任务声明这是应用对**同一轮** gate 复核（`requestId`）的机械退回补正通知，不是统筹的新请求、不是客户消息、不是新一轮复核；任务不含「要求改判 pass」「应用已接受/已通过」等表述；不附报告正文、凭据或命令原文。
4. R4（仅 minor/nit 的 fail）任务明确要求按标准重新判定：若确无 blocker/major 可改为 `pass` 并保留 minor/nit 备注，若确有 blocker/major 须如实列明依据并保持 fail，应用不替质检做结论；R4 不触发既有返工路由。
5. 退回时 gate 步骤保持 `pending`；不写 `gate.review`；不派下游；账本不新增派发。

**判定方法：** 在 `test/桌面应用/acceptance-dispatch.test.ts`（必要时含 `test/测试/governance-e2e-auto/` 新增用例）实际执行：至少一条语法错误报告（反引号 `reason`）与一条语义错误报告分别触发退回；断言记录状态、质检任务条数与文本字段、gate 步骤仍 pending、无 `gate.review`、无下游派发；另执行 R1（陈旧缺报告）、R2（`gate-report-missing`/`unobservable`）、R4、R5 各一条，核对下一版本路径与 R5 的 `expectedReportVersion` 语义；重复触发同一退回事件不重复发送（见 P7）。

**所需证据：** `acceptance-dispatch.test.ts` 原始命令、退出码、计数与失败原文；至少语法错误、语义错误、R4、R5 四份任务文本原文；路由记录 JSON；gate 记录 JSON；`ledger.jsonl` 与 flow YAML 前后快照；候选哈希与测试 diff。

**判定规则：**

- **pass：** 上述退回分支均实际执行；质检各收到一条补正任务，字段/错误/下一版本/格式要求齐全；记录 `returned-to-proof`、gate pending、无 `gate.review`、无下游派发；无改判/已接受表述；R5 使用派发要求版本。
- **fail：** 退回后不投递或投递多条（崩溃窗口除外）；任务缺错误位置/下一版本/格式要求；R4 任务要求改判或 R5 写成「最新+1」；退回时标 gate done、写 `gate.review` 或派下游；任务含「应用已接受」。
- **insufficient evidence：** 只测一条分支；没有任务文本原文；没有 gate/账本/flow 快照；候选/夹具不一致。
- **not applicable：** 无；P1 整行不得 N/A。

**适用范围：** R1–R5 报告侧退回（所有会写 `returned-to-proof` 的报告侧缺陷分支）；trio 下质检会话可打开。不适用于 gate fail（blocker/major）返工、最终验收返工、范围 B/C。

#### 3.2.2 P2 退回-统筹知情

**依据：** 方案 §9.1 P2；§3.1.3；§3.1.4；Q1 A；Q10 A；§9 全局说明（F5/F11）。

**判定项：**

1. 每一次退回转换（报告侧 R1–R5 或候选变化 R6）向统筹（convener）**成功投递恰好一条**对应系统任务：报告侧为 `[Gate 退回]`（知情）、候选变化为 `[Gate 退回·需重新请求]`；R8 的 `[Gate 退回·需人工]` 与 R7 的 `[Gate 退回·历史记录]` 分别按 P4/P15 判定，但同样受本条的内容与投递真实性要求约束。
2. 任务说明 gate 身份、原因摘要、下一步；报告侧如实写质检补正的实际投递结果（已投递/已排队/未送达并将重试）与应用将在新报告版本出现时机械复核，并明确统筹不需要重新派发质检、不要在报告未通过时派下游、不要标 gate done；R2b 提醒场景明确记录仍为 `dispatched`、未判退回、未判通过（见 P17）。
3. 任务声明消息由应用按 gate 记录机械发送，不是客户/主理/统筹的发言；应用未替统筹派发任何 flow 步骤。
4. 重复扫描/多个 settle 不重复发送；部分接收方失败只重试失败方（不重复已送达方）；投递失败如实记录（见 P8）。

**判定方法：** 在同一桌面测试/e2e 中为报告侧退回与候选变化各触发一次，统计统筹任务条数与文本；重复触发（同 identity）断言不增加；注入「质检送达成功、统筹发送失败」验证只重试统筹；检查系统行与路由记录 delivery 状态。

**所需证据：** 统筹任务文本原文（报告侧、候选变化各一份）；路由记录 `latestReturn.deliveries`；任务计数前后对照；两个 Interface 实例（重启）输出；主理系统行；候选哈希。

**判定规则：**

- **pass：** 每次退回转换恰一条对应任务；内容含原因/下一步/投递结果/应用来源声明；重复扫描不重复；部分失败只重试失败方。
- **fail：** 退回后统筹未收到或收到多条（崩溃窗口除外）；任务让统筹重派质检（报告侧 R1–R5）或错误地要求重新请求（同候选）；把失败写成成功；重复通知。
- **insufficient evidence：** 只验证一种转换；没有任务原文或 delivery 记录；没有重复触发对照。
- **not applicable：** 无；P2 整行不得 N/A。

**适用范围：** R1–R6 退回转换的统筹任务；R7/R8 的统筹任务按 P15/P4 判定但内容真实性沿用本条。

#### 3.2.3 P3 候选变化

**依据：** 方案 §9.1 P3；§3.1.1 R6；§3.1.2 第 4 点；Q6 A；F2/F13。

**判定项：**

1. gate 记录派发后 `flowRevision` 不符（候选变化）时，**不向质检发送补正任务**；统筹收到「需对新候选重新 `request_gate_review({flowId, gateId})`」任务；旧报告不用于放行；gate 步骤保持 `pending`。
2. 退回记录保存被拒报告稳定身份（见 P18）；应用不自动唤醒质检、不替统筹决定复核对象；统筹重新请求时若 flow 仍有在途工作，会收到 `flow-busy`（见 P19），应用不拦截/不改写该回执。

**判定方法：** 桌面测试构造「派发后 flow revision 变化 + 旧报告仍存在」，执行扫描；断言质检任务为 0、统筹任务为 1、gate/flow 状态；重复扫描不重复通知；随后模拟统筹重新请求并在在途工作结束后派发。

**所需证据：** 任务文本；gate 记录 `returned-to-proof` 与 `flowRevision`；flow revision 快照；质检发送计数；候选哈希。

**判定规则：**

- **pass：** 候选变化只通知统筹重新请求、无质检补正、旧报告不放行、gate pending、稳定身份已保存。
- **fail：** 向质检发补正或自动按新候选重审；旧报告被用于收口；gate 步骤被标 done；统筹任务缺失。
- **insufficient evidence：** 没有 revision 变化夹具；没有任务原文/计数；稳定身份未核对。
- **not applicable：** 无；P3 整行不得 N/A。

**适用范围：** 仅 R6 候选变化。

#### 3.2.4 P4 多轮/预算

**依据：** 方案 §9.1 P4；§3.1.1 R8；Q5 A；§4.5 第 4 点。

**判定项：**

1. 同一 gate 连续 3 轮**报告侧退回**（R1–R5，不同报告版本）仍未通过机械校验后：停止自动补正，向统筹发送 `[Gate 退回·需人工]` 人工任务（说明应用已停止自动补正、统筹核对后用 `flow_step_supersede` 换新 gate id 或修订计划、应用不会自动通过）；此后不再自动发送补正。
2. 每次退回事件投递失败后，下一次真实事件/看护 tick 只重试失败接收方，最多 **3 次**；超过后该接收方 `exhausted`，停止自动发送并给统筹人工任务；已成功接收方不重复。
3. 多轮期间 gate 步骤始终 `pending`，应用从未自动通过；R2b/O1 提醒不进入 `consecutiveReturns` 计数（提醒总上限见 P17）。

**判定方法：** 桌面测试模拟同一 gate 连续 3 个不同版本坏报告，断言第 3 轮后停止、人工任务恰一条、后续扫描不再自动补正；注入发送失败连续 3 次，断言 attempts 与 exhausted；检查 `consecutiveReturns` 与 `reminderCount` 分离。

**所需证据：** 轮次记录与计数；人工任务文本；delivery attempts/exhausted 状态；flow/gate 记录快照；测试原始输出。

**判定规则：**

- **pass：** 3 轮停止 + 人工任务；每接收方重试上限 3 次；gate 始终 pending；提醒不计数。
- **fail：** 超过 3 轮仍自动补正；无限重试；exhausted 后仍自动发送；把 R2b/O1 计入退回轮次；期间自动通过或标 done。
- **insufficient evidence：** 只测一轮或未测预算；没有计数/状态原文。
- **not applicable：** 无；P4 整行不得 N/A。

**适用范围：** 全部退回 cause 的轮次与投递预算；R2b/O1 提醒按 P17 单独计数。

#### 3.2.5 P5 通过-转交

**依据：** 方案 §9.1 P5；§3.2 第 1–8 点；Q2 A；F4；Q7 A。

**判定项：**

1. `completeGateStep` 成功（含恢复路径的幂等命中）后，向统筹**成功投递恰好一条** `[Gate 通过]` 系统任务（按 §9 全局说明的崩溃窗口解释），内容包含：gate 身份（`flowId` / `gateId` / `gateKind`）、报告路径/版本/sha、收口后的 flow revision；事实声明「gate 步骤已由应用按 Proof 报告收口 done；gate 通过 ≠ 最终验收通过 ≠ 客户批准」。
2. 下游列表按既有 `isStewardExecutableReadyStep` 口径拆分：**「你可派发」**（`owner === "convener"` 的 artifact，或 listing 中非内置项目角色的 dispatch/artifact）与 **「仅知情」**（其它内置 owner 的 ready 步骤，由既有 app/治理路径处理）；若「你可派发」为空，必须给出「无统筹可执行步骤」的明确原因（可附 `stopReason` / 仅知情列表），不伪造 ready、不把仅知情写成可派。
3. 行动要求：先 `flow_get` 读取当前流程与账本，再用既有 `dispatch_task` 按 owner 派发；同一 `parallelGroup` 可并行；不重复派已 `dispatch.accepted` 的步骤；不标 gate done、不派 `acceptance`/质检、不替客户决定；声明本消息是应用机械通知，应用未派发任何 worker、未改 flow（除 gate 收口）、未替统筹判断。
4. 应用未调用 `dispatch_task`、未打开 worker 会话、未把任何其它步骤标 `done`。

**判定方法：** 桌面测试/e2e 构造通过报告并收口；断言统筹任务一条及字段/分组/空原因；检查账本无应用写的新 `dispatch.accepted`（除既有 gate 相关审计外）与 flow 只有 gate 步骤变化；构造「无可派发、仅有仅知情」场景核对空原因；构造非内置项目角色 ready 与 convener owner ready，核对分组。

**所需证据：** 统筹任务文本原文（含分组与空原因场景）；flow YAML 前后 diff；账本 diff；`test/桌面应用/acceptance-dispatch.test.ts` 原始输出；e2e 输出；候选哈希。

**判定规则：**

- **pass：** 恰一条 `[Gate 通过]`；字段/分组/空原因正确；应用未派发；gate 通过语义声明正确。
- **fail：** 未转交或重复转交（崩溃窗口除外）；把仅知情列入可派；空列表无原因；应用调用 `dispatch_task`/打开 worker/改其它步骤；把 gate 通过说成验收通过/客户批准。
- **insufficient evidence：** 只有任务文本没有 flow/账本证据；没有分组/空原因用例；候选不一致。
- **not applicable：** 无；P5 整行不得 N/A。

**适用范围：** 通过路径（含幂等 already-done 恢复）；trio 下统筹会话可打开。

#### 3.2.6 P6 通过-去重

**依据：** 方案 §9.1 P6；§3.2 第 5 点；§3.5 第 4 点；Q7 A；F4。

**判定项：**

1. 同一事件周期内统筹最多收到一条覆盖「gate 通过 + ready」的消息；既有 `[自动推进]` 不重复发送同一 `revision + sortedReadyIds` 集合。
2. 去重键按「全部 `plan.ready` 排除 app 管理步骤」计算（包含仅知情步骤，与 `wakeStewardForReadySteps` 完全同口径）；gate-pass 消息成功投递后登记同一 `revision + sortedReadyIds`，后续通用唤醒跳过。
3. 不同 revision 或 ready 集合变化后，允许新的真实唤醒。

**判定方法：** 桌面测试在同一事件周期同时触发 gate 通过转交与既有 ready 唤醒，断言统筹消息合计一条；检查 `readyWakeNotified` 的键与 `wakeStewardForReadySteps` 同口径（含仅知情步骤）；构造不同 revision/ready 集合断言可再次唤醒。

**所需证据：** 消息计数；去重键行为断言；测试原始输出；候选哈希。

**判定规则：**

- **pass：** 同周期最多一条；键口径与既有唤醒一致；集合变化可再唤醒。
- **fail：** 双发；键只算「可派发」而漏仅知情导致重复；同 revision+集合重复唤醒。
- **insufficient evidence：** 只验证一条消息而没有去重键断言；没有同周期夹具。
- **not applicable：** 无；P6 整行不得 N/A。

**适用范围：** 通过事件与既有 `[自动推进]`。

#### 3.2.7 P7 幂等/重启

**依据：** 方案 §9.1 P7；§3.5；§4.5 第 6 点；F5/F11。

**判定项：**

1. 重复 settle/扫描/应用重启不重复发送补正或转交任务（除「发送成功后未落 `sent` 即崩溃」窗口外；该窗口须有诊断，验收按已知限制核对）。
2. 路由记录驱动恢复：`sent` 不重复；`pending`/`failed` 补投（有界）；重启后同一身份不重发。
3. 同一报告身份只路由一次；新报告版本只开启一次新路由；退回补正与通过转交分别按其身份键去重（退回含 `requestId + reportPath + reportVersion + (reportSha256 ?? "no-report")`，通过含 `reportSha256`）。

**判定方法：** 桌面测试构造同一报告重复 settle/扫描；用两个 Interface 实例（同项目根、磁盘路由记录保留）验证重启不重发与 pending/failed 补投；对新版本报告断言只开一轮；崩溃窗口以注入「发送成功、未标 sent」模拟并检查诊断/已知限制记录。

**所需证据：** 两个实例输出；路由记录原文；发送计数；新版本轮次记录；诊断；候选哈希。

**判定规则：**

- **pass：** 重复事件/重启不重发（崩溃窗口除外且有诊断）；恢复按记录；同身份只一次，新版本只一轮。
- **fail：** 重启重发已 sent；同一报告重复路由；新版本未开新一轮或被旧身份挡住；把崩溃窗口当正常重复发送且无诊断。
- **insufficient evidence：** 只测单进程重复触发；没有重启夹具；没有记录原文。
- **not applicable：** 无；P7 整行不得 N/A。

**适用范围：** 全部路由与恢复；崩溃窗口按已知限制。

#### 3.2.8 P8 失败语义

**依据：** 方案 §9.1 P8；§3.4；§4.5 第 1–6 点；Q12 A。

**判定项：**

1. 打开/发送失败时，对应接收方 delivery 为 `failed`，主理系统行如实说明「未送达/部分未送达/稍后重试」；诊断有结构化记录；下一次事件只重试失败方，有界（≤3 次），不重复已成功接收方。
2. 路由记录写失败时：不写 gate 记录的新状态（保持 `dispatched`）、不发送任何角色任务、主理系统行如实说明；下一次真实事件/看护 tick 重试整个处置。
3. 应用从不在未确认投递时声称「已转交/已通知」；统筹会话不可用时不自动改投主理（Q12 A），失败/耗尽后交主理人工转达。
4. 失败不翻转事实：gate 记录状态不因投递失败改变；不把 failed 写成 sent。

**判定方法：** 注入 open/send 失败、部分失败（质检成功、统筹失败）、路由记录写失败、`exhausted`；断言 delivery 状态、系统行文本、重试计数、无重复已成功方；检查诊断字段；检查主理系统行不出现「已通知/已转交」。

**所需证据：** 故障注入测试原始输出；路由记录 delivery 原文；主理系统行原文；诊断原文；gate/账本快照；候选哈希。

**判定规则：**

- **pass：** 失败如实、只重试失败方、有界、记录写失败零发送且保持 dispatched、无伪造成功、不改投主理。
- **fail：** 失败仍标 sent/声称已通知；重复已成功方；无限重试；记录写失败仍发任务或改 gate 状态；统筹失败改投主理。
- **insufficient evidence：** 只测成功路径；没有注入输出/记录原文/系统行。
- **not applicable：** 无；P8 整行不得 N/A。

**适用范围：** 传输/记录写失败路径；不判内容判定失败（那是 gate fail 既有路径）。

#### 3.2.9 P9 不自动通过/不伪造

**依据：** 方案 §9.1 P9；§2.1 第 3 点；§3.7；§5.5。

**判定项：**

1. 没有任何代码路径在没有可解析 `conclusion=pass` 报告时把 gate 步骤标 `done` 或写 `passed`；退回时 gate 步骤保持 `pending`。
2. 应用不修改报告字节、不自动引号化、不生成报告；不写 `customer.decision`；不把 gate 结论写入验收分诊；不伪造证据。
3. 既有 gate fail/退回路径的判定权仍在 Proof 报告与 `completeGateStep` 的机械校验。

**判定方法：** 桌面测试负例：坏报告/缺报告/不可读/候选变化/仅 minor-nit fail 均不得收口；对比报告文件前后 SHA-256；检查账本无新增 `customer.decision`；用 grep/diff 核对无新增写客户决定/分诊的代码路径；核对 `completeGateStep` 仅在有效 pass 报告时被调用。

**所需证据：** 负例测试原始输出；报告 SHA-256 前后值；账本/flow 快照；diff/grep 结果；候选哈希。

**判定规则：**

- **pass：** 全部负例不收口；报告字节不变；无 `customer.decision`/分诊写入；gate pending。
- **fail：** 任意负例收口/写 passed；修改报告字节；写客户决定或验收分诊；伪造证据。
- **insufficient evidence：** 只测正例；没有负例输出或报告哈希。
- **not applicable：** 无；P9 整行不得 N/A。

**适用范围：** 全部 gate 路径。

#### 3.2.10 P10 能力/边界与既有契约零变化

**依据：** 方案 §9.1 P10；Q8 A；O4 不做；§4.1/§4.6；B10；§二.9/§二.12。

**判定项：**

1. `request_gate_review` 仍只注入给统筹（`governanceFunction === "schedule"`）；**本方案不修改其契约/回执码集合，基线 `1465833` 的 `flow-busy` 保持**；无新增工具/能力位/`FlowStepKind`/`gateKind`/cardKind。
2. 角色边界与写权未变：`角色卡/**/boundary.md`、`boundary.yaml`、`role-card.md` 无本变更改动；`src/model/{boundary,role,decision}.ts` 与 `src/model/runtime.ts`、`src/provider/**`、`src/service/**`、`src/interface/**` 无本变更改动。
3. **账本 kind：客户未选 O4 ⇒ 无新增账本 kind**；不写 `dispatch.accepted` 冒充补正/转交派发；新增 `gate-handoff-routing/v1` 是 app 私有 `.ans` 记录（不进入 flow/账本/共享运行时契约）；app 私有 TS 联合类型（`GateReturnCause`/`GateReminderCause`/`GateHandoffStatus`）不是共享枚举。
4. `gate-review-record/v1` 形状不变；`FlowStepKind`/`gateKind`/cardKind 值集合与基线逐字一致。

**判定方法：** `git diff --name-only`/`--stat` 对照团队计划写集；`git diff` 核对上述「不改」路径为空或仅允许的 O2 卡文本；grep 枚举定义与工具注册表；检查 session.ts 注入判据行为/断言；检查账本 diff 无新 kind；检查 `.ans` 路由记录路径与 schema。

**所需证据：** diff/status 原文；枚举/工具 grep 输出；session 注入测试/断言；账本 diff；边界/角色卡 diff；路由记录 schema 原文；候选哈希。

**判定规则：**

- **pass：** 能力/回执/枚举/边界/账本 kind 零变化；flow-busy 契约保持；路由记录仅 app 私有。
- **fail：** 新增工具/能力位/枚举/账本 kind；改注入条件或回执码集合；改边界/角色卡/Model/Provider；把路由记录写入 flow/账本。
- **insufficient evidence：** 只有 diff 没有 session/工具面断言；无法区分 hunk；枚举/账本核对缺失。
- **not applicable：** 无；P10 整行不得 N/A（O4 未选是必须核对的正向事实，不是 N/A）。

**适用范围：** 整个变更。

#### 3.2.11 P11 扫描触发

**依据：** 方案 §9.1 P11；Q4 A/O3；Q3 A/O1；§3.1.1 说明。

**判定项：**

1. gate 记录扫描在约定触发面运行：既有真实事件（settle / 治理账本变化 / 导入）以及**看护 tick**（O3，复用既有 `runFlowAdvanceTick`/`onTickProject` 有界合并窗口，不新增第二套定时器/状态机）；只做 gate 处置，不触发验收派发。
2. **O1 缺报告提前提醒**：gate 记录 `dispatched`、无报告、质检空闲且无排队时，发一次「请补交报告」系统任务（按 `requestId` 去重）；质检忙/有排队时不并发注入；30 分钟陈旧兜底保留。
3. 重复 tick/事件不刷屏、不重复任务；看护不可用/未启用时不影响既有真实事件路径（只影响时效，不伪造路由）。
4. O1 提醒不改变 gate 记录状态、不进入退回轮次计数；总提醒上限见 P17。

**判定方法：** 桌面测试模拟看护 tick 重复触发，断言 gate 处置执行且任务不重复；模拟「无报告 + 质检空闲」触发 O1 一次，质检忙/排队时不发；模拟看护不可用仍由真实事件触发；检查诊断与计数。

**所需证据：** tick 测试原始输出；任务计数；诊断；gate 记录快照；候选哈希。

**判定规则：**

- **pass：** tick 扫描生效且不刷屏；O1 按空闲条件一次；看护不可用有兜底；不派验收。
- **fail：** tick 不扫描或每次刷屏；O1 并发注入/重复；看护不可用导致真实事件路径失效；tick 触发验收派发。
- **insufficient evidence：** 只测真实事件；没有 tick/O1 夹具与计数。
- **not applicable：** 无；O1/O3 已选，P11 整行不得 N/A。

**适用范围：** 触发面（真实事件 + O3 看护 tick）与 O1 提前提醒。

#### 3.2.12 P12 i18n/可见性

**依据：** 方案 §9.1 P12；Q10 A；RF-05；§3.6。

**判定项：**

1. 新增/修改的用户可见系统行在 `zh-CN` 与 `en-US` 均有 key、占位符一致；不出现未翻译硬编码用户文案（按既有 i18n guard 口径）；保留 `main.gateReview.flowBusy`（基线 `1465833`），`main.gateReview.passNote` 保留「最终客户验收」语义。
2. 主理系统行如实反映投递结果（已投递/排队/失败）；不声称未发生的事；不把 agent 任务文本当作客户 UI 文案，或反之。
3. 既有 i18n 断言如需随文案更新，只能加强/替换为同等或更强语义，并在变更包列明理由；不得为保绿删弱 `flowBusy`/`passNote`/`returnedToProof` 的语义断言。

**判定方法：** `node --test test/项目管理/shared/i18n.test.ts`（条件 guard）；检查新增 key 清单与 placeholders；对照基线断言清单（`flowBusy` 在途/暂不派发/可重试/不是故障/gate 失败/结束后重试；`passNote` 最终客户验收）；抽查主理系统行原文。

**所需证据：** i18n 测试原始输出；key/占位符清单；系统行原文；guard 允许清单 diff（若有）；候选哈希。

**判定规则：**

- **pass：** 双语 key 齐全、占位符一致；flowBusy/passNote 语义保留；系统行如实；UI 与任务文本分离。
- **fail：** 缺语言/占位符不一致；删除或稀释 flowBusy/passNote 语义；系统行伪造结果；把任务文本当 UI 文案。
- **insufficient evidence：** 只查中文；没有 key 清单/测试输出；没有系统行证据。
- **not applicable：** 无；P12 整行不得 N/A。

**适用范围：** 全部新增/修改的用户可见系统行。

#### 3.2.13 P13 诊断

**依据：** 方案 §9.1 P13；§3.6；项目规则 §二第 10 条（打印/日志-01）。

**判定项：**

1. 每次路由决策/跳过/失败都有结构化诊断（至少含 `flowId`、`gateId`、`reasonCode`、attempts；事件名可为 `gate.return.route.sent/failed/skip`、`gate.pass.handoff.sent/failed/skip`、`gate.handoff.record.*`、`gate.route.exhausted` 等，结构以实际为准）。
2. 诊断不含报告正文、凭据、命令原文或个人敏感数据；诊断不改变控制流；不伪造成功。
3. 诊断字段可供排障与只读复算。

**判定方法：** 检查诊断输出原文与字段；注入成功/失败/跳过场景各一条；grep 确认无报告正文/凭据/命令原文写入诊断；运行受影响测试确认日志不改变行为。

**所需证据：** 诊断原文样例；字段清单；测试输出；候选哈希。

**判定规则：**

- **pass：** 决策/跳过/失败均有结构化诊断；字段齐全；无敏感内容；不影响控制流。
- **fail：** 关键决策无诊断；写入报告正文/凭据/命令原文；诊断改变行为或伪造成功。
- **insufficient evidence：** 只有代码阅读；没有诊断原文。
- **not applicable：** 无；P13 整行不得 N/A。

**适用范围：** 全部路由决策（退回/提醒/通过/跳过/失败）。

#### 3.2.14 P14 既有行为回归

**依据：** 方案 §9.1 P14；§1.4；§8.1；B8。

**判定项：**

1. 既有 gate pass / fail / nit-only / 返工 / 恢复 / `gate.review` / `artifact.observed` 行为除新增转交外不变；gate 失败返工路由（`routeGateRework`，接收方按现状，B8 不改）与最终验收返工路由未被改动。
2. 既有桌面/门禁/i18n 测试保持通过；既有测试断言零放宽（只能新增或加强；因文案/契约必须调整的，须列明理由并由独立验收核对）。
3. 既有 `flow-busy` 用例（见 P19）与既有 gate 处置用例保持通过。

**判定方法：** T3 全量与受影响套件输出对照基线；`git diff` 检查 `routeGateRework`、最终验收返工相关代码零改动；核对测试 diff 无删除/弱化断言。

**所需证据：** 全量/定向测试原始输出与基线对照；相关代码 diff；测试 diff 与理由；候选哈希。

**判定规则：**

- **pass：** 既有行为不变（除新增转交）；两条返工路由未动；既有测试通过且断言未弱化。
- **fail：** 改动既有返工路由或 gate 判定；既有测试被删弱/跳过；既有行为漂移。
- **insufficient evidence：** 只跑新增测试；没有基线对照/测试 diff。
- **not applicable：** 无；P14 整行不得 N/A。

**适用范围：** 既有 gate 与返工行为面。

#### 3.2.15 P15 历史退回 R7

**依据：** 方案 §9.1 P15；§3.1.1 R7；§3.5.5；F6；RF-02（实现澄清：持久去重）。

**判定项：**

1. 实现前已存在、无路由记录的 `returned-to-proof` 记录：只向统筹发送一次「历史退回」提示（附记录中的 `error` 摘要），说明请统筹核对后按现有通道重新请求；**不向质检发送、不猜原因、不重派、不转 `dispatched`**。
2. 重复扫描不重复提示；按 RF-02 的实现口径，应写一条持久标记（如 `gate-handoff-routing/v1` 的 `latestReturn.cause="legacy"`、投递 `sent` 或等价持久记录）使跨重启也不重复提示；若实现未写持久标记，必须给出等价的可核对跨重启去重证据，否则按未满足「重复扫描不重复提示」处理。
3. 历史 `passed` 无 `passHandoff` 不追溯转交（见 P16）。

**判定方法：** 构造实现前形状的 `returned-to-proof` 记录（无路由记录），执行扫描；断言统筹任务一条、质检零条、gate 记录不变；重复扫描与两个 Interface 实例（重启）断言不再提示；检查持久标记/等价证据。

**所需证据：** 历史夹具；任务文本；两个实例输出；路由记录/持久标记；诊断；候选哈希。

**判定规则：**

- **pass：** 一次提示、不重派、不猜原因、不转 dispatched、跨重启不重复。
- **fail：** 向质检发送或自动重派；猜测原因；把记录转回 dispatched；每次扫描/重启重复提示。
- **insufficient evidence：** 只有单进程扫描；没有历史夹具或持久去重证据。
- **not applicable：** 无；P15 整行不得 N/A。

**适用范围：** 仅实现前已有、无路由记录的历史退回记录；不适用于新代码产生的退回。

#### 3.2.16 P16 路由记录损坏/fail-closed

**依据：** 方案 §9.1 P16；§3.4；§3.5.5；F6；RF-02。

**判定项：**

1. 路由记录损坏/无法解析时，应用按 gate 记录 + 报告身份**重建**路由记录（事实来自既有记录）；无法重建（如报告身份缺失）时 **fail-closed**：不发送任何角色任务、主理系统行如实提示、交人工核对；不伪造发送/退回/通过。
2. 历史 `passed` 且无 `passHandoff`：不补发追溯转交，只写诊断（除非能证明 `pending`）。
3. 重建/失败均有结构化诊断；不猜测原因、不静默丢弃。

**判定方法：** 注入损坏/未知 schema/缺失身份的路由记录，执行扫描；断言重建或 fail-closed、任务计数、主理系统行、诊断；构造历史 passed 无 passHandoff 断言不转交只诊断。

**所需证据：** 损坏夹具与输出；系统行/诊断原文；路由记录重建结果；任务计数；候选哈希。

**判定规则：**

- **pass：** 可重建则重建，不可重建则零发送 + 主理如实 + 人工；历史 passed 不追溯；无伪造。
- **fail：** 损坏记录仍发送任务或伪造状态；猜测原因；静默丢弃；历史 passed 被补发转交。
- **insufficient evidence：** 只有代码阅读；没有注入输出/系统行。
- **not applicable：** 无；P16 整行不得 N/A。

**适用范围：** 路由记录缺失/损坏；历史 passed 无 passHandoff。

#### 3.2.17 P17 报告不可读提醒 R2b（含 F10 上限与 O1）

**依据：** 方案 §9.1 P17；§3.1.1 R2b；§3.4；§3.5 第 1 点；F10；Q3 A/O1；Q5 A。

**判定项：**

1. 最新报告存在但 `readFile` 失败时，应用发一次可执行提醒（质检检查文件可读性/重写可读版本）并让统筹知情；gate 记录**保持 `dispatched`**（不转 `returned-to-proof`、不判通过、不收口）。
2. 提醒身份固定 `requestId + reportPath + reportVersion`（不用 size/mtime 作为身份）；同一版本不重复提醒；同一 `requestId` 的提醒总次数（**R2b + O1 合计**）**上限 3 次**，达到后停止提醒并给统筹一次人工提示。
3. R2b 提醒失败不伪造退回/通过；记录保持 dispatched；有界重试；提醒不进入 `consecutiveReturns` 计数。
4. 提醒任务声明记录仍为 `dispatched`、应用未判退回、未判通过。

**判定方法：** 桌面测试注入「报告存在但 `readFile` 失败」（如路径为目录/权限错误/注入读失败）；断言质检提醒一条、统筹知情一条、gate 记录仍 dispatched、无 `gate.review`、无收口；重复扫描同版本不重复；构造 4 次提醒尝试断言第 3 次后停止并给统筹人工提示；验证 O1 与 R2b 合并计数。

**所需证据：** 注入测试原始输出；提醒/知情任务文本；gate 记录原文；路由记录 `reminderCount`/deliveries；计数；候选哈希。

**判定规则：**

- **pass：** 提醒恰一次（同版本）、记录保持 dispatched、身份固定、合并上限 3 次后停止 + 人工提示、不计数退回轮次。
- **fail：** 提醒导致转退回或收口；同版本重复提醒；用 size/mtime 作身份；超过上限仍提醒；提醒进入退回轮次。
- **insufficient evidence：** 只测「不可读」一次而没有上限/去重；没有记录原文。
- **not applicable：** 无；P17 整行不得 N/A。

**适用范围：** 报告存在但不可读（R2b）与 O1 提前提醒的计数上限。

#### 3.2.18 P18 被拒报告稳定身份

**依据：** 方案 §9.1 P18；§3.1.1 身份稳定性；§3.1.2 第 4 点；§4.5；§5.4；Q6 A；F2/F13。

**判定项：**

1. R5（版本偏旧）/R6（候选不符）退回后，必须保存被拒报告的**稳定身份**：可读时退回记录的 `reportSha256` 为被拒报告真实 sha（不得以 `null` 作为「未读」默认值），比较时同时使用 `path + version + sha`；不可读时在 app 私有路由记录保存 `rejectedIdentity`（path / version / size / mtime / sha=null）。
2. 对**同一份被拒报告**重复扫描（多个 settle/账本/导入）**不得**转 `dispatched`、不得覆盖 `flowRevision`、不得调用 `completeGateStep`、不得收口；gate 步骤保持 `pending`。
3. **同 sha 不同版本视为新报告**，必须开启新一轮；只有新版本/新 sha（或完整 `rejectedIdentity` 不同）或统筹重新 `request_gate_review`（新 `requestId`）才开启新一轮。
4. `gate-review-record/v1` 形状不变；不新增记录字段以外的共享契约变化。

**判定方法：** 桌面测试构造 R5/R6 退回，记录被拒身份；重复触发多次（settle/账本/导入）断言不转 dispatched/不覆盖 revision/不收口；构造「v2 内容与 v1 相同（同 sha 不同版本）」断言视为新报告并按新版本处置；构造不可读报告断言 `rejectedIdentity` 生效；检查 `gate-review-record/v1` 解析兼容与字段形状。

**所需证据：** 重复扫描测试原始输出；gate 记录与路由记录原文；flow revision 前后值；同 sha 不同版本用例结果；候选哈希。

**判定规则：**

- **pass：** 稳定身份保存正确；同一旧报告不重开/不覆盖/不收口；同 sha 不同版本开新一轮；记录形状不变。
- **fail：** `reportSha256` 仍为 null 导致旧报告被当作新报告；旧报告触发收口/覆盖 revision；同 sha 新版本被误判为同一报告；记录形状改变。
- **insufficient evidence：** 只测一次扫描；没有同 sha 不同版本用例；没有记录原文。
- **not applicable：** 无；P18 整行不得 N/A。

**适用范围：** R5/R6 被拒报告身份与重复扫描；不适用于普通新版本报告（既有 isNew 行为）。

#### 3.2.19 P19 `flow-busy` 无冲突/无回归

**依据：** 方案 §9.1 P19；§1.4；§1.5；§3.0；§5.2；§5.4；B10。

**判定项：**

1. flow 仍有在途交付/轮次/回交时，`request_gate_review` 返回可重试的 `flow-busy`（不是 `unavailable`），**不写/不改 gate 记录/账本（即使已有旧记录）、不派任务**；在途结束后重试正常 `dispatched`；矛盾回执 `ok:true + flow-busy` 按未派发处理。
2. 本方案的退回补正/报告不可读提醒/通过转交**不因 `flow-busy` 触发**；不把 `flow-busy` 当退回/失败/已派发。
3. 统筹卡既有 `flow-busy` 段、Provider 冻结 code 集/矛盾回执处理、`src/provider/runtime/schema.ts` 说明、`main.gateReview.flowBusy` 中英文案保持；本方案**不修改**该契约/码集合。
4. 既有 `test/门禁引擎/gate-review-flow-busy.test.ts`、`test/runtime-core/request-gate-review-tool.test.ts`、`test/桌面应用/acceptance-dispatch.test.ts` 的 `flow-busy` 用例通过；`test/门禁引擎/governance-trio.test.ts` 只回归、不改变语义。

**判定方法：** 运行上述四个测试文件（T3 全量中也覆盖）；检查 `flow-busy` 用例的 gate 记录/账本零写入断言与「在途结束后重试正常派发」；检查 model/provider/i18n/卡文本 diff；构造已有旧 `returned-to-proof`/`passed` 记录时 flow 在途再请求，断言仍返回 `flow-busy` 且不触发本方案路由。

**所需证据：** 四个测试文件原始输出与计数；gate/账本快照；model/provider diff；卡文本/i18n diff；候选哈希。

**判定规则：**

- **pass：** flow-busy 零副作用、可重试、码集合与文案保持；本方案路由不被触发；既有用例全过。
- **fail：** 改为 unavailable 或修改码集合/语义；写/改 gate 记录/账本或派任务；把 flow-busy 当退回/失败/已派发；既有用例被改弱。
- **insufficient evidence：** 只跑一个测试文件；没有零副作用断言；没有 diff。
- **not applicable：** 无；P19 整行不得 N/A。

**适用范围：** 请求时 `flow-busy` 语义与回归面；不适用于本方案在记录已存在后的退回/通过路由（两者正交）。

#### 3.2.20 P20 O2 角色卡文本补充判据（RF-04）

**依据：** 闸门 1 已选 **O2**（Q9 A）；方案 §7 O2（范围收窄）；§10.2 第 4 点；RF-04；§9.1 P10/P19 的边界保持要求。

**判定项：**

1. `src/common/门禁引擎/governance-roles.ts` 中，基线 `1465833` 的 `flow-busy` 相关段**保留**：统筹卡「若流程仍有在途交付 / 运行轮次 / 回交，应用会返回可重试的 `flow-busy`——稍后重试，不反复刷请求；在途工作结束后再请求同一 gate。」、回执条目「`flow-busy`：**可重试**……（**不是 `unavailable`、不是 gate 失败、不是已派发、不是验收失败**）……」与「`flow-incomplete`……在途工作属 `flow-busy`，按该条稍后重试」等既有文本不得被改写、删除或稀释；质检卡既有 gate 结论纪律（含「应用会退回你补报告、不触发返工」）保留。
2. 只新增本方案新增系统任务的**来源与边界**说明：统筹卡说明会收到应用机械发送的「退回知情/报告不可读提醒/通过转交」系统任务（不是客户消息、不是主理发言、不是新复核轮次，应用未替统筹派发；R6 需统筹重新 `request_gate_review`）；质检卡说明会收到应用机械发送的「报告补正/报告不可读提醒」任务（同一轮复核的机械补正、不是新复核轮次、不要求改判 pass、内容判定仍由质检按标准做）。不得写入「应用可自动通过」「质检可标 gate done」「应用可派 worker/验收」「新增能力/写权」等越权表述。
3. 不改能力位、写权、边界、工具、注册表数据面；`selectGovernanceRoleCard`/角色卡注册表等非文本数据与基线一致（既有 `gate-review-flow-busy.test.ts` 的「注册表数据面零变化」断言保留）。
4. 测试断言：`test/门禁引擎/governance-standard-workflow.test.ts`、`test/门禁引擎/verifier-artifact-report.test.ts`（按实际受影响者）新增/加强断言覆盖新通知来源与边界；`test/门禁引擎/gate-review-flow-busy.test.ts`、`test/门禁引擎/governance-trio.test.ts` 的既有断言**原样保留并通过**；不得删除/放宽既有禁止项断言。

**判定方法：** 用 `git show 1465833:src/common/门禁引擎/governance-roles.ts` 提取基线文本，与候选逐段比对：基线 `flow-busy`/`flow-incomplete`/质检返回纪律段落以子串或逐行方式确认未变（新增允许，改写/删除不允许）；检查 diff 只落在卡文本字符串；运行门禁引擎四个测试文件并记录计数；grep 检查无越权/新增能力表述。

**所需证据：** `governance-roles.ts` diff；基线段子串核对结果；四个门禁引擎测试文件原始输出与计数；候选哈希。

**判定规则：**

- **pass：** 基线 `flow-busy` 段与质检纪律保留；只新增来源/边界说明；无能力/边界/注册表变化；旧断言保留且新断言覆盖 O2。
- **fail：** 改写/删除/稀释 `flow-busy` 段或质检纪律；新增越权/自动通过/新能力表述；改能力位/边界/注册表；删除或放宽既有断言。
- **insufficient evidence：** 只有 diff 没有基线段核对；没有门禁引擎测试输出；无法确认注册表数据面。
- **not applicable：** 无；O2 已选，P20 整行不得 N/A。

**适用范围：** 仅 O2 的统筹/质检卡文本与对应测试；不替代 P10（能力/边界零变化）与 P19（flow-busy 契约回归）。

### 3.3 G1–G6 逐条判定口径

**G1 类型检查（方案 §9.2 G1）：**

- **依据：** 方案 §9.2 G1；main `1465833` 的 `package.json` `typecheck` 脚本。
- **判定项：** `npm run typecheck` 对最终候选通过（0 诊断），记录候选哈希与命令。
- **所需证据：** typecheck 原始输出（退出码 0、诊断计数 0）；`git rev-parse HEAD`/候选哈希；环境（Node/npm/OS/Shell）。
- **判定规则：** pass = 0 诊断且对应当前候选；fail = 有诊断或跑在另一候选；insufficient = 命令未执行/输出缺失/环境不可用。
- **适用范围：** 最终候选；不得 N/A。

**G2 定向套件（方案 §9.2 G2）：**

- **依据：** 方案 §9.2 G2；团队计划 §3.2–§3.5、§6.3；O2 已由客户选择。
- **判定项：** 以下套件通过并记录计数：`test/桌面应用/acceptance-dispatch.test.ts`（含新增 gate 路由用例）；`test/门禁引擎/*`（O2 已选，至少 `governance-standard-workflow`、`verifier-artifact-report`、`gate-review-flow-busy`、`governance-trio`）；`test/项目管理/shared/i18n.test.ts`；条件 `test/桌面应用/interface.test.ts`、`test/项目管理/shared/i18n-guard.test.ts`。
- **所需证据：** 每个文件的命令、cwd、环境、退出码、计数（pass/fail/skip/todo）、失败原文；测试 diff；候选哈希。
- **判定规则：** pass = 全部适用套件通过、计数记录完整；fail = 套件失败或有新增跳过；insufficient = 缺命令/计数/失败原文；条件子项可 N/A 但须写明依据。
- **适用范围：** 最终候选；`acceptance-dispatch`、`i18n`、O2 卡测试不得 N/A。

**G3 T3 全量回归（方案 §9.2 G3；团队计划 §6.4）：**

- **依据：** 方案 §9.2 G3、§8.1；团队计划 §1.3、§6.4；技能 `references/testing.md` 的 T3 定义；项目规则 §二第 9 条。
- **判定项：** 对最终候选执行 `node --test --test-concurrency=1 "test/**/*.test.ts"`（排除 `test/pi-adapter/write-sequencing.test.ts` 并记录可复现的排除方式）；`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`；必要时 e2e/真实 Electron。与实施前基线逐项对照，本次新增确定性失败为零；失败分类完整（既有 EPERM/桌面偶发/挂起/新增）。
- **所需证据：** 全量命令、环境、退出码、计数、原始日志、失败清单与分类；实施前基线同命令输出；Electron/e2e 原始输出（若适用）。
- **判定规则：** pass = 全量无新增确定性失败、三类检查通过、分类完整；fail = 跳过全量/改弱断言/新增失败未处理；insufficient = 缺基线对照/原始输出/环境不可用。
- **适用范围：** 最终候选；T3 全量、类型/构建检查、真实 Electron 不得 N/A。

**G4 临时项目场景（方案 §9.2 G4；团队计划 §6.4）：**

- **依据：** 方案 §9.2 G4、§3.1、§3.2；团队计划 §6.4；客户 2026-10-27 验收证据边界（截图至多、不要求录屏）。
- **判定项：** 在**临时/隔离项目**（不是目标项目/演示）复现现场形状：gate 派发 → 结构坏的 pass 报告（如 `reason` 以反引号开头的 YAML 语法错误）→ 补正任务可见 → 修正为新版本报告 → 机械复核通过 → 统筹收到 `[Gate 通过]`；观察点包含 gate 记录 `returned-to-proof`→`passed`、gate 步骤 `pending`→`done`、补正任务与通过任务文本、主理系统行、无应用自动派发下游。
- **所需证据：** 临时项目根路径、构造步骤与命令、任务/系统行原文、gate/flow/账本快照；**如使用截图**：必须来自当前候选真实运行、关闭 DEBUG 覆盖层，记录 SHA-256、候选版本与拍摄命令/窗口尺寸；**不要求录屏，缺录屏不构成失败**。
- **判定规则：** pass = 全链路按预期；fail = 场景未跑通/应用自动派发/写目标项目；insufficient = 只有单测转述或合成描述、没有运行输出；截图缺失不单独构成失败。
- **适用范围：** 临时/隔离项目；不写 `pixel-space-demo`/`demos/`；不得 N/A。

**G5 变更包（方案 §9.2 G5；团队计划 §6.5）：**

- **依据：** 方案 §9.2 G5、§4.3–§4.5；团队计划 §6.5；项目规则 §二第 9 条。
- **判定项：** `docs/scheduling/gate-review-return-routing-change-v1.md` 至少包含：候选身份（worktree/branch、基线 `1465833`、候选提交/工作区状态、逐路径 `git hash-object` + `sha256sum` 与复算）、改动路径（只列团队计划写集内实际变更，声明无越界写/无目标项目与演示写入/`.ans` 状态不冒充候选）、任务节点 S1–S6 与角色/证据链接、证据链接（typecheck、定向套件、T3 全量、真实 Electron、临时项目场景、i18n parity、卡文本测试）、风险档位 **T3** 与依据、方案版本 v3.2（978 行/`cf28b38e…`）与复核记录、已知限制（崩溃窗口、R7 一次性提示、O4 不做、flow-busy 不触发本路由）、未 commit/push/发布。
- **所需证据：** 变更包原文；独立复算哈希；`git status`/`diff --name-only`/`diff --stat`。
- **判定规则：** pass = 内容齐全且可复算；fail = 候选与证据不符或把管理记录当产品候选；insufficient = 变更包缺失/缺项。
- **适用范围：** S7；不得 N/A。

**G6 文档与零写入（方案 §9.2 G6；团队计划 §6.1）：**

- **依据：** 方案 §9.2 G6、§2.3；团队计划 §6.1/§6.5；技能 `references/documentation.md`；客户对目标项目/演示零写入的要求。
- **判定项：** 桌面窗口、门禁引擎（O2）、项目管理（i18n）按各自文档规则更新 feature/change 记录（状态 `implemented-unverified`，未验收不写 `verified`），并链接客户确认的方案 v3.2 与复核处置；方案本身保持冻结（不得为适配实现修改方案正文/哈希）；目标项目 `pixel-space-demo` 与 `demos/` 的源码与文档零写入（应用自身既有 `.ans` 治理状态除外）。
- **所需证据：** 各角色 `docs/feature`/`docs/change` 文件路径与内容摘录；方案哈希复核（未变）；目标/演示前后哈希或清单；候选哈希。
- **判定规则：** pass = 文档齐备、状态如实、方案未改、目标零写入；fail = 文档缺失/状态提前写 `verified`/方案被改写/目标被写；insufficient = 无法核对零写入或方案哈希变化原因不明。
- **适用范围：** 文档与零写入；不得 N/A。

### 3.4 不适用（N/A）规则

- **P1–P20、G1、G3、G4、G5、G6 不得整行 `not applicable`。**
- **G2 的条件子项**（`test/桌面应用/interface.test.ts`、`i18n-guard`）若确实未受本变更影响，可记 N/A 并写明依据；`acceptance-dispatch.test.ts`、`test/项目管理/shared/i18n.test.ts` 与 O2 卡文本测试不得 N/A。
- **P10 的 O4 子项**是「O4 不做 ⇒ 无新增账本 kind」的正向核对，不得 N/A；若实施擅自新增账本 kind，按 `fail` 处理（重开闸门 1 条件）。
- **P19 不得 N/A**；若改动 `flow-busy` 契约，按 `fail` 并重开闸门 1（B10）。
- 任何 N/A 必须写明依据；无法说明依据的 N/A 按 `insufficient evidence` 处理；N/A 不得算作 pass。

---

## 四、证据计划

### 4.1 候选与基线证据

判定时统筹/验收只读执行并保留原始输出：

- `git -C .claude/worktrees/gate-review-return-routing rev-parse HEAD`、`status --short`、`diff --name-only`、`diff --stat`、完整 `git diff`（按文件分段，不可截断到无法核对）、`git diff --cached --name-only`；
- 每个产品改动文件的 `git hash-object` 与 `sha256sum`（新增文件同）；
- 方案/复核记录/团队计划/沟通记录/实现提案审核记录/本标准的 `sha256sum` + `git hash-object`；
- 实施前基线（S1）与最终候选的测试命令、退出码、cwd、时间、执行者、环境（Node/npm/OS/Shell）、测试计数、失败原文与分类；
- `pixel-space-demo` 与 `demos/` 的前后哈希/清单（零写入核对）。

### 4.2 测试命令（按仓库实际脚本；记录实际 Node/npm 路径与版本）

1. `node --test --test-concurrency=1 test/桌面应用/acceptance-dispatch.test.ts`（主测试面）；
2. 条件：`node --test --test-concurrency=1 test/桌面应用/interface.test.ts`（仅既有断言/接线受影响时）；
3. `node --test --test-concurrency=1 test/门禁引擎/gate-review-flow-busy.test.ts`；
4. `node --test --test-concurrency=1 test/门禁引擎/governance-trio.test.ts`；
5. 条件：`node --test --test-concurrency=1 test/门禁引擎/governance-standard-workflow.test.ts`、`test/门禁引擎/verifier-artifact-report.test.ts`（按 O2 卡文本断言需要，O2 已选则视为必需）；
6. `node --test --test-concurrency=1 test/runtime-core/request-gate-review-tool.test.ts`；
7. `node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts`；条件 `i18n-guard.test.ts`；
8. `node --test --test-concurrency=1 "test/测试/governance-e2e-auto/*.test.ts"`（含新增用例；若新增用例文件名不同，变更包登记实际路径）；
9. T3 全量：`node --test --test-concurrency=1 "test/**/*.test.ts"`，按 §2.4 排除 `test/pi-adapter/write-sequencing.test.ts` 并记录排除方式；
10. `npm run typecheck`；`npm run typecheck:renderer`；`npm run build:renderer`；
11. 真实 Electron：`node_modules/.bin/electron test/桌面应用/e2e/main.mjs`（以仓库实际路径为准；fresh userData；记录 `E2E_PASS`/`E2E_FAILURES`/`E2E_DONE`）。

### 4.3 夹具要求

- **桌面层**：使用 `test/桌面应用/acceptance-dispatch.test.ts` 既有 harness 或同等注入（fake flow/ledger/scripted sessions/诊断收集）；覆盖：R1–R8 退回、R2b、O1、稳定身份（含同 sha 不同版本）、候选变化、历史退回、路由记录损坏、发送/记录写失败、重试/耗尽、两个 Interface 实例重启、通过转交分组/空原因/去重、flow-busy 既有用例。
- **报告夹具**：至少包含（a）YAML 语法错误（`reason` 以反引号开头）；（b）语义错误（未知字段/重复 id/空 owner 等，给出字段路径）；（c）仅 minor/nit 的 fail；（d）版本偏旧报告；（e）存在但不可读的报告（路径为目录或注入读失败）；（f）同 sha 不同版本的新报告。报告字节前后哈希须记录。
- **e2e**：`test/测试/governance-e2e-auto/` 临时项目根与脚本化 adapter；至少一条全链路（结构坏 pass 报告 → 补正 → 新版本 → 机械复核通过 → 统筹 `[Gate 通过]`），并覆盖候选变化/历史退回/fail-closed 等关键分支（可与桌面层分工，不要求逐项重复）。
- **临时项目（G4）**：独立临时根与 `.ans`；不覆盖本仓库既有管理记录；不写 `pixel-space-demo`/`demos/`。
- 所有夹具使用独立临时根/端口/日志/输出目录；不共享可变项目根。

### 4.4 真实 Electron

- 命令：`node_modules/.bin/electron test/桌面应用/e2e/main.mjs`（以实际路径为准）。
- 必须记录：命令、时间、候选哈希、环境、退出码、OUTDIR、报告/截图清单、包含 `E2E_PASS=true` 与 `E2E_DONE=1` 的原始输出；若有 `E2E_FAILURES` 保留原文。
- `E2E_PASS` 缺失、false、无法对应候选或通过修改 `main.mjs` 换取 → 不判 pass；环境不可用按 `insufficient evidence`。
- 若为验证 gate 路由系统行做最小定向追加，须在 S1/变更包说明并保持既有断言；不得删除断言或把平台性失败改成通过。

### 4.5 临时项目场景（G4）与截图边界

- 步骤：临时项目根创建 flow（含 gate 步骤与下游 ready 步骤）→ 统筹请求 gate 复核 → 质检写出结构坏的 pass 报告（`reason` 以反引号开头）→ 观察 `returned-to-proof`、质检补正任务、统筹知情任务、主理系统行、gate 仍 pending → 质检写新版本报告 → 观察机械复核 `passed`、gate 步骤 `done`、统筹 `[Gate 通过]`（分组/空原因）、应用未派下游 → 记录所有消息与文件快照。
- 截图（至多）：来自当前候选真实运行、关闭 DEBUG 覆盖层，记录 SHA-256、候选版本、拍摄命令/窗口尺寸；**不要求录屏，缺录屏不构成失败**。
- 目标零写入：前后哈希/清单一致；不修复现场报告；不把临时场景结果说成目标项目已修复。

### 4.6 变更包（统筹提交）

路径：`docs/scheduling/gate-review-return-routing-change-v1.md`。至少含 G5 所列内容；证据链接指向原始日志/哈希；声明候选与主检出未提交改动、既有 worktree 的隔离；声明 T3 与全量回归执行情况；列出未解决问题与需要沟通/统筹澄清事项（包括 RF-01/RF-02/RF-05/RF-06 的实现口径落点）。

### 4.7 禁止事项

- 无 `.ans/project.json`、未启用 task_ops：不伪造任务令牌、锁、审批、机器预检或调度机器日志；
- 不伪造测试输出、哈希、Electron `E2E_PASS`、临时项目场景、路由记录或客户确认；
- 不修改目标项目/演示；不提交/推送/合并/发布；
- 不为通过而删除/放宽测试断言、跳过检查、把失败写成环境问题；
- 不在本文件写验收结论或报告；不把方案/团队计划/测试记录/工具成功当客户确认或验收通过。

---

## 五、判定规则与总体结论

### 5.1 每行验收判断

| 判断 | 含义 | 本任务示例 |
| --- | --- | --- |
| **pass** | 该行标准已被当前候选满足；证据原始、对应当前候选、覆盖标准。 | 退回补正/统筹知情恰一条且内容齐全；候选变化只通知统筹；3 轮停止；通过转交分组/空原因/去重正确；重启不重发；失败如实；不自动通过；能力/边界/账本 kind 零变化；扫描含 O1/O3；i18n 双语；诊断齐全；既有行为不变；历史退回/损坏 fail-closed；R2b 上限；稳定身份；flow-busy 零副作用；O2 卡文本保留并补充；G1–G6 全过。 |
| **fail** | 已有证据表明候选不满足该行标准，或候选包含明确不允许的改动。 | 退回无任务/重复；统筹被要求重派质检；候选变化自动重审；无限重试；通过转交缺分组/应用派发；重启重发；失败写成成功；自动收口；新增工具/枚举/账本 kind；改 flow-busy 契约；`test/桌面应用/` 新建文件；改目标项目；O2 改写 flow-busy 段；T3 新增失败；`E2E_PASS=false`；测试断言被放宽。 |
| **insufficient evidence** | 尚不能判断：证据缺失、输出不完整、候选/版本不符、基线不可得、命令无法复算、报告未产生等。 | 没有任务文本/路由记录/账本快照；没有重启/失败注入；没有同 sha 不同版本用例；没有 O2 基线段核对；没有 T3 基线对照；没有 Electron/临时项目证据；报告首行缺项。 |
| **not applicable** | 该行/子项确实不适用于本任务/分支，且写明依据。 | 仅 §3.4 允许的 G2 条件子项；其他行不得整行 N/A；N/A 不算 pass。 |

### 5.2 总体结论

- **通过：** P1–P20 全部适用行 pass 且 G1–G6 pass；候选哈希与证据一致；T3 全量回归对当前候选执行且无本次新增确定性失败；真实 Electron `E2E_PASS=true`；临时项目 G4 通过；目标/演示零写入；报告首行五项齐全。
- **返工：** 任一行 fail。列出差异、依据和应回到的所有者（桌面窗口、项目管理、门禁引擎、测试、统筹），由统筹安排修复与复测；验收不代改。
- **证据不足：** 没有 fail，但任一行 insufficient evidence。列出缺什么、由谁补，不能记通过。
- 若同时存在 fail 与 insufficient evidence：总体结论按**返工**，同时列出待补证据，避免修复后重复缺证。
- 结论只对当前候选有效；候选变化后按 §2.3 重新判断受影响部分。通过只表示当前候选满足本标准 v1，**不授权提交、推送、合并、发布或任何对外操作**；发布版本另行随发布验收。

### 5.3 报告要求

- 报告路径：`docs/acceptance/gate-review-return-routing-report-v1.md`（内置独立验收写，不由统筹/开发代写；本文件不是报告）。
- 报告**首行**五项：`风险档位：T3｜判定依据：…｜选定检查：…｜复用证据：…（来源/候选/仍有效理由，或「无」）｜全量回归：已执行 / N/A + 理由`；本任务全量回归应写「已执行」，不得写 N/A。
- 报告须链接：任务/阶段、客户确认的方案 v3.2（路径 + 哈希）、本标准版本与判定时计算的哈希、候选哈希、变更包、原始证据路径/哈希、未解决问题、结论理由。
- 报告须包含完整验收表（P1–P20 + G1–G6），逐行填实际证据、结果、验收判断；不得只写「已完成」或「通过」而无表。
- 报告须记录方案 §9 → 本标准覆盖映射（§3.0），并记录 RF-03 客户决定（不要求同版本号改写拒绝）。
- 报告不得与其他变更合并结论；不得声称目标项目已修复；不得要求或包含录屏。

---

## 六、判定时的只读检查步骤

验收判定时按以下顺序执行，只读，不改产品代码、测试、角色卡、边界、方案、团队计划、沟通记录、调度记录或目标项目：

1. **核对基线：** 读取沟通记录闸门 0/1/2 与实施授权；核对方案、复核记录、团队计划、沟通记录哈希与 §1.1/§1.4 一致；确认方案 v3.2 是客户确认版本、Q1–Q10/Q12 A、O1+O2+O3、O4 不做；确认 RF-03 客户决定。若基线变化，按 §2.5/§2.3 处理。
2. **核对档位：** 确认变更包为 T3，档位与改动相符；不相符时退回统筹或按更高档补证；验收可升档，不能降档。
3. **核对候选身份与变更包：** 复算 worktree HEAD、各产品文件 `git hash-object`/`sha256sum`、`status`/`diff --name-only`/`--stat`/`--cached`；与变更包对照；确认候选冻结、主检出未提交改动被隔离。
4. **核对写集：** 将改动路径与团队计划 §3.1–§3.10 对照；确认无越界、`test/桌面应用/` 未新建、目标/演示零写入、无 commit/push。
5. **核对 P1–P4：** 读退回补正/统筹知情/候选变化/多轮预算的测试与任务文本、路由记录、gate/账本/flow 快照；核对 R5 下一版本路径与 R4 措辞。
6. **核对 P5–P8：** 读通过转交/去重/幂等重启/失败语义的测试、任务文本、flow/账本、两个实例与故障注入；核对分组/空原因与未派发。
7. **核对 P9–P14：** 读不自动通过负例、能力/边界/账本 kind diff、扫描触发/O1/O3、i18n、诊断、既有行为回归；核对 flow-busy 契约未改。
8. **核对 P15–P19：** 读历史退回/损坏 fail-closed/R2b 上限/稳定身份/flow-busy 测试原文；核对同 sha 不同版本与跨重启去重。
9. **核对 P20：** 读 `governance-roles.ts` diff、基线 `flow-busy` 段子串核对、门禁引擎四个测试输出；核对注册表数据面未变。
10. **核对 G1–G6：** 对照 typecheck、定向套件、T3 全量、Electron、临时项目场景、变更包、文档与零写入证据。
11. **填写验收表并给结论：** 按 §5 逐行填 pass/fail/insufficient evidence/not applicable；写报告，首行五项，链接证据与未解决问题；报告只对当前候选有效。

---

## 七、写标准时只读事实与已知对照（只报告，不改）

以下为标准写盘时的只读核对结果；判定时若实施已按方案调整，以当前候选与测试输出为准。本节不构成对实现的豁免或放宽。`path:line` 只用于定位，实施/判定时以测试标题、文件路径与符号名为准；行号漂移不改变标准。

1. **实施 worktree 在写标准时干净且等于基线。** HEAD `14658335c08dc0bd764f3ee6be41cc907c961f2b`（`1465833`），分支 `feat/gate-review-return-routing`，`status --porcelain` 为空；`main`/`origin/main` 同点。这证明标准写于实施前。
2. **`processGateReportAttempt` 是 gate 报告处置唯一入口**（`app/desktop/interface.ts` 约 7472 起），调用方为 `processGateReviewsForFlow`（约 7890）与恢复路径。方案 §1.3 的分支事实与提案审核记录一致：缺报告未陈旧（约 7486–7518）与 `readFile` 失败（约 7571–7580）保持 `dispatched`；version-older/candidate-changed 写 `reportSha256: null`（约 7528/7553）；`isNew` 约 8065–8069。评审详见提案审核记录 §三；本节不重复全部行号。
3. **扫描枚举过滤**约 7950 只跳过 `-rework-routing.json`；新增 `<gateId>-handoff-routing.json` 必须加入同一跳过规则，否则会被当成 gate 记录解析失败。
4. **`readyWakeNotified` 是进程内 `Map`**（约 4748/4826/4876），与 `wakeStewardForReadySteps`（约 4789）同口径去重；`gateNoteState`（`noteGateOnce` 约 7248）也是内存态，因此 R7 历史退回的跨重启去重需要持久标记（RF-02），见 P15。
5. **`flow-busy` 在基线 `1465833` 已落地且零副作用**：`performRequestGateReview` 第 9 步约 6958–6961 在 gate 记录写盘（约 7077）与账本追加（约 7086）之前返回；`RequestGateReviewResult["code"]` 含 `flow-busy`（`src/model/runtime.ts` 约 1072–1077）；Provider 冻结 code 集约 3180、转达/矛盾回执约 3233–3243，`schema.ts` 约 1223–1229 有说明；统筹卡约 923/927/930；i18n zh-CN 1464 / en-US 1650；测试 `test/门禁引擎/gate-review-flow-busy.test.ts`、`test/runtime-core/request-gate-review-tool.test.ts`（约 199+）、`test/桌面应用/acceptance-dispatch.test.ts`（约 4989+）、`test/门禁引擎/governance-trio.test.ts`。本方案不改该契约。
6. **既有 i18n 断言固定了必须保留的语义**：`test/项目管理/shared/i18n.test.ts` 约 1691–1762 钉住 `main.gateReview.flowBusy` 的「在途/暂不派发/可重试/不是故障/gate 失败/结束后重试」与 `passNote` 的「最终客户验收」；`test/桌面应用/acceptance-dispatch.test.ts` 约 5460 钉住返回系统行含「报告缺失或结构不合规」。按 RF-05，这些语义与既有断言须保留或只做加强/等价替换并记录理由。
7. **`request_gate_review` 仍只注入统筹**（`app/desktop/session.ts` 约 452/670/2524 的注释与 `governanceFunction === "schedule"` 判据）；本方案不改注入条件。
8. **桌面只经 Pipeline 公共出口消费编排**：`src/pipeline/orchestration/flow-state.ts` 再导出 `listReadyFlowSteps`/`completeGateStep`/`classifyGateReviewTriage`/`latestGateReviewReport` 等；`app/desktop/interface.ts` 约 235/302 已按此导入。实现与验收不得新增 `src/common/编排/**` 的直接 import（RF-06）。
9. **既有测试文件与目录存在**：`test/桌面应用/{acceptance-dispatch,interface}.test.ts`、`test/桌面应用/e2e/main.mjs`、`test/门禁引擎/{gate-review-flow-busy,governance-trio,governance-standard-workflow,verifier-artifact-report}.test.ts`、`test/runtime-core/request-gate-review-tool.test.ts`、`test/项目管理/shared/{i18n,i18n-guard}.test.ts`、`test/测试/governance-e2e-auto/`（含 `fixture.ts`）均在基线存在；`test/pi-adapter/write-sequencing.test.ts` 存在（已知挂起，T3 排除并记录，以 S1 实测为准）。
10. **`test/桌面应用/` 是逐文件授权**：`acceptance-dispatch.test.ts`、`interface.test.ts`、`e2e/main.mjs` 已列；`gate-handoff-routing.test.ts` 不在 Section 1，团队计划 §3.10 已作为闸门 2 条件、默认不新建。验收把未授权的新建文件视为越界（`fail`），除非另有客户确认的闸门 2/边界记录。
11. **Node/npm 在写标准 shell 可用**：Node v24.22.1、npm 11.19.1；判定时仍须记录实际取证环境的版本/路径，不得沿用本节值而不核对。
12. **无 `.ans/project.json`、未启用 task_ops**：不伪造任务令牌/锁/审批/机器预检；证据以文件、原始输出与哈希为准。
13. **方案/团队计划状态头与闸门记录存在时间差**（确认前快照）；以 `docs/communication/` 为准，不修改冻结文档。
14. **提案审核记录引用沟通记录 86 行/`a12715d7…`，当前 95 行/`d651e941…`**：差异是其后追加的闸门 2 与实施授权记录，属预期；已确认对象（方案 v3.2、团队计划）哈希未变。
15. **RF-03 已由客户决定不要求**「同版本号报告改写必须拒绝」；验收不得新增该判据。若实施或后续变更想加入该语义，属方案实质变化，应重开闸门 1，不由验收自行加严。
16. **RF-01/RF-02/RF-05/RF-06 是已授权实施中的实现澄清**：分别落为失败语义（P8）、R7 跨重启去重（P15）、i18n 保留语义（P12）、公共出口导入（§七.8/P10）；它们只说明如何证明方案判据，不是新增产品需求。实现应在 S3/S4 固化并写入变更包。

---

## 八、需要沟通/统筹澄清的问题

1. **无阻断性缺口。** 截至写标准时，闸门 0/1/2、实施授权、方案/复核/团队计划/提案审核记录均齐备且哈希核对一致；本标准可逐条判定。
2. **变更包与候选冻结是判定前提。** 若 S7 未提交 `docs/scheduling/gate-review-return-routing-change-v1.md` 或候选哈希不可复算，按 `insufficient evidence`，不记通过；由统筹补齐。
3. **基线前进条件。** 若实施时 main 已前进到 `1465833` 之后且涉及 gate/`request_gate_review`/角色卡/i18n 事实，按团队计划 §2.4 第 5 条停止回报/重核；实质变化重开闸门 1，本标准随之升版。验收不得静默接受不同基线的候选。
4. **`test/桌面应用/` 新文件条件。** 默认不新建；若实施确需 `gate-handoff-routing.test.ts`，须先按闸门 2/人事补边界条目并更新团队计划写集；在此之前出现新文件按越界处理（`fail`/`insufficient evidence`），不由验收自行认可。
5. **O2 卡文本的保留核对方式。** P20 要求以基线 `1465833` 的 `flow-busy`/质检纪律段落子串或逐行方式确认未变；若实施对文本做等价重排，须在变更包说明并证明语义/既有断言均未弱化，否则按 `fail`/`insufficient evidence`。请统筹/门禁引擎在 S5a 记录基线段清单与核对结果。
6. **截图证据的可选性。** G4 如需截图，必须来自当前候选真实运行、关闭 DEBUG 覆盖层，并记录 SHA-256/候选/命令/窗口尺寸；**不要求录屏，缺录屏不构成失败**。若实施不提供截图，仅凭日志/任务文本/文件快照也可判定 G4（只要足以观察到链路）。
7. **RF 实现口径落点登记。** 请统筹在变更包记录 RF-01（运行时解析 fail-closed）、RF-02（R7 持久去重）、RF-05（i18n 语义保留）、RF-06（Pipeline 公共出口导入）的实际落点与测试证据；验收按方案 P 项判定，RF 只作澄清指针。
8. **发布验收分开。** 本变更独立验收通过不等于发布验收；发布版本另行随发布流程验收，报告不得合并结论，也不得把本变更结论写成对其他变更的背书。

---

## 九、不得据此扩张的事项

- 本文件不扩张任何角色的文件写权；独立验收只写 `docs/acceptance/`。
- 本文件不授权修改产品代码、测试、角色卡、边界、工程法案、方案、团队计划、沟通记录、调度记录、flow、账本或目标项目/演示。
- 本文件不授权提交、推送、合并、发布或任何对外操作。
- 本文件不是客户确认记录，也不是验收结论；客户确认仍以 `docs/communication/` 的记录为准。
- 实施者不得把「标准已写」「团队计划已确认」「工具成功」「测试通过」「方案已确认」当成验收通过或客户确认。
- 本文件不改变闸门 0/1/2 的确认对象和版本；意图变更重开闸门 0，方案实质变更重开闸门 1，角色/写集/顺序实质变更重开闸门 2。
- 本文件不改变 T3 档位；任何试图把治理变更降为 T0/T1/T2、或用 N/A 跳过 T3 全量/真实 Electron/临时项目/目标零写入核对的做法，按 `fail` 处理。
- 本文件不预判通过/返工/证据不足；判定只能由实施后的 `docs/acceptance/gate-review-return-routing-report-v1.md` 按本标准作出。
