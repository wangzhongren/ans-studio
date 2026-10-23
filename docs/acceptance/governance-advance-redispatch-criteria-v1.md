**风险档位：T3（治理行为与 flow 状态变更；治理/权限变更即使只改文档也不压成 T0/T1/T2）｜判定依据：客户闸门 0/1/2 记录 `docs/communication/2026-10-23_intent_governance-advance-redispatch.md`（闸门 0/1/2 均已确认）、客户在闸门 1 确认的策划方案 v1 `docs/planning/2026-10-23_design_governance-advance-redispatch.md`（299 行；SHA-256 `f3f75f283f945c4c601150291820f03a79ca216cce7859fb0e112d5120d28341`；blob `9223448f823bd30ef01c9d11d51385c3aeff9fef`）的 §1–§8、§10–§12 与 §8.3 验收要点，技能 `references/testing.md` 的 T3 定义｜选定检查：受影响层测试（`test/编排/flow-service.test.ts`、`test/桌面应用/interface.test.ts`、条件 `test/桌面应用/acceptance-dispatch.test.ts`）+ 治理全链路 e2e（`test/测试/governance-e2e-auto/`）+ 真实桌面 Interface ↔ `flow-state.ts` 公共出口 ↔ `flow-service.ts` 集成 + T3 全量回归（`node --test "test/**/*.test.ts"`，排除已知挂起 `test/pi-adapter/write-sequencing.test.ts` 并记录排除方式；`npm run typecheck`；`typecheck:renderer` 默认 N/A，若共享契约影响渲染层类型则补跑）+ 真实 Electron `test/桌面应用/e2e/main.mjs` 的 `E2E_PASS` + 目标项目 `ans-gateway` 只读复算｜复用证据：无（本标准 v1 先于实施写盘；判定时仅复用同候选、同输入/依赖、同命令、同夹具/配置、同环境的证据；不引用 i18n 或目录 v3 的验收结论，也不为其背书）｜全量回归：T3 适用，判定时必须对当前候选执行并与实施前基线逐项对照（本文件不声明已执行，也不声明任何通过结论）**

# 验收完成标准：治理写卡推进的可重入门禁闭环（governance-advance-redispatch）

- 任务 ID / 产品 flowId：`2026-10-23-governance-advance-redispatch` / `governance-advance-redispatch`
- 标准路径 / 版本 / 日期：`docs/acceptance/governance-advance-redispatch-criteria-v1.md` / **v1** / **2026-10-23**（实施前冻结）
- 阶段：**实施前完成标准**。本文件只建立标准，不实施、不判候选、不写验收报告。
- 验收基线：客户在**闸门 1** 确认的策划方案 v1（`docs/planning/2026-10-23_design_governance-advance-redispatch.md`，2026-10-23；Q1–Q8 按推荐 A 确认）；上位依据是客户在**闸门 0** 确认的意图记录。
- 范围/写集输入：客户在**闸门 2** 确认的团队计划 `docs/scheduling/2026-10-23-governance-advance-redispatch-team-plan.md`（248 行；SHA-256 `fdd9721a0fc29cac36e0103ecb8ac682bec7245bae4809997ee5a5cea576c82d`；blob `d4e4f1b97bdc3ab02cf531a6ea2931b1c53fb080`）；**只作范围、写集与证据口径依据，不是标准来源**。
- 候选版本：待统筹提交，以产品候选哈希标识（见变更包）。
- 结论：**待判定**。本文件不是报告，也不是通过、返工或证据不足结论。
- 验收报告：**另写 `docs/acceptance/governance-advance-redispatch-report-v1.md`**，由内置独立验收在实施后按本标准与统筹变更包判定；结论只能是通过 / 返工 / 证据不足。
- 独立变更边界：本文件只判定治理写卡推进可重入门禁闭环；i18n B0/B1–B4 按 `docs/acceptance/i18n-criteria-v1.md`、目录级授权 v3 按 `docs/acceptance/directory-ownership-criteria-v1.md` 分别判定；三者的候选、证据、报告与结论不合并。

---

## 一、基线、版本冻结与范围

### 1.1 确认链与冻结版本

| 项 | 状态 | 记录与版本 |
| --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-10-23，客户明确「先把这个治理推进去重漏洞作为独立变更修掉」） | `docs/communication/2026-10-23_intent_governance-advance-redispatch.md`；SHA-256 `5288ef63e45be1e0ac52b87065377765171a7a6370e8afe8278c508f4c8a0d5c`；blob `4942d84321a5302b87fc52d54580d628f5462d58` |
| 闸门 1：方案确认 | 已确认（2026-10-23，客户明确选择「确认方案 A（推荐）」，Q1–Q8 按推荐） | 同上文件「闸门 1 确认记录」；对象为策划方案 v1（299 行；SHA-256 / blob 见文件头） |
| 闸门 2：角色指派/写集/边界/档位/顺序/验收/证据口径 | 已确认（2026-10-23，客户选择「确认计划」「授权人事补边界条目」「确认并授权实施」） | 同上文件「闸门 2 确认与实施授权」；团队计划（248 行；SHA-256 / blob 见文件头） |
| 实施授权 | 已给（2026-10-23，与闸门 2 分开记录） | 同上「闸门 2 确认与实施授权」；实施授权不等于验收通过、提交、推送、合并或发布授权 |
| 本验收标准 | 实施前写盘并冻结 | 本文件 v1（2026-10-23） |

**文档状态头与确认记录不一致的已知情况：** 策划方案文件头仍写「草案 v1（待闸门 1 方案确认）」、§12 仍写「闸门 1 未确认」；团队计划状态头与 §二仍写「闸门 2 未确认、实施授权未给」。`docs/communication/` 的确认记录已明确客户选择。本标准以沟通记录为授权事实，引用方案正文的冻结版本与内容进行判定，不改写方案或团队计划，也不把过期状态头当成未确认。

**冻结哈希可复算：** 判定时须重新计算方案与团队计划哈希，与上述值一致才可继续；若方案或团队计划实质变化，按 §2.5 处理，不静默沿用旧版标准或旧范围。

### 1.2 输入性质与来源纪律

1. **方案 §8.3 是直接标准来源。** 本标准把方案 §8.3 的七条独立验收要点展开为 P1–P12，展开内容取自方案 §3（A1–A7）、§4（契约与不变量）、§6（权限与边界）、§8（测试与验收）、§10（风险与权衡）、§11（Q1–Q8 已确认推荐 A），不新增产品需求，不放宽或加严方案实质。
2. **团队计划不是标准来源。** 团队计划只用于核对参与角色、逐角色写集、阶段顺序（S1–S6）、验收安排与证据口径；其中的建议、分工或措辞不得被用来增加、放宽或加严本标准；与方案冲突时，以客户确认的方案 v1 为准。
3. **闸门 0 意图记录是上位依据。** 「恢复既有写卡门禁闭环的可重入性，不新增角色间派发通道，不改变 Crew 写卡权限，不写目标项目」是核心意图；不得借实施顺手扩大。
4. **Q1–Q8 推荐 A 已随闸门 1 纳入范围。** Q1 应用专用 `completeRoleCardsStep`；Q2 项目刷新自动触发（`listProject` 廉价探针 + 250ms 合窗 + 指纹去重）；Q3 内容指纹（目标角色六文件 sha256 + 团队计划 sha256 + validator schema 版本，不含 mtime/时间）；Q4 版本化运行期键 + 通过记录/最近 Crew 写卡为账本锚，早期 appointment 链派发不算 readiness；Q5 本轮不加显式动作、O1 不默认；Q6 证据放 `.ans/governance/role-cards/<flowId>/<fingerprint>.json` + `artifact.observed(power=app)`；Q7 role-cards 已 done 只推进 role-readiness，role-readiness 已 done 时明确不要重做；Q8 T3 全量 + 真实 Electron + 目标项目只读复算 + 夹具全链路 e2e，不代写目标项目。未选择的备选（方案 B/C、显式动作、watcher）不是本轮要求，也不得被实施者用来替代推荐 A。
5. **i18n 与目录 v3 是独立变更。** 本变更的候选、标准、报告、证据与结论不得与 i18n B0/B1–B4 或目录级授权 v3 合并；不得用它们的通过结论替代本变更证据，也不得把它们的既有工作树改动计入本变更候选或为其背书。共享文件（`app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`test/桌面应用/interface.test.ts` 等）按团队计划 §5.2 的「既有写入冻结后本变更再写」执行；候选差异只列本变更 hunk。
6. **不得以「代码阅读」代替行为证据。** 源码只用于定位检查与解释契约；每一条 P 的 pass 必须来自当前候选上的实际执行输出（单元/层测试、e2e、真实 Electron、账本/flow/记录文件的原始内容或只读复算）。代码审查只能作为补充，不能单独判 pass。静态 diff/grep 只在 P8、G1、G2 这类结构性核对中作为主证据。

### 1.3 交付范围、写集与明确非目标

**本轮必须覆盖的产品面（方案 §7、团队计划 §4.1–§4.3）：**

- **编排**：`src/common/编排/flow-service.ts` 新增应用专用 `completeRoleCardsStep`（与 `completeAcceptanceStep` 同层）及内部 helper；`src/pipeline/orchestration/flow-state.ts` 再导出（桌面唯一公共出口）；`test/编排/flow-service.test.ts` 正/负例。
- **桌面窗口**：`app/desktop/interface.ts`（版本化去重键、内容指纹、账本锚、刷新探针、完成与派发顺序、防自激、deps `completeRoleCardsStepFn`）；`app/desktop/governance-advance.ts`（`buildRoleReadinessTaskMessage` 可选 `roleCardsDone` / `roleReadinessAlreadyDone`；旧调用逐字不变）；`test/桌面应用/interface.test.ts`（既有授权单文件）；`test/桌面应用/acceptance-dispatch.test.ts`（条件，既有授权单文件）。
- **测试**：`test/测试/governance-e2e-auto/`（目录授权）内的全链路 e2e、旧账本/跨重启夹具、目标项目只读复算、T3 全量与真实 Electron 证据。
- **人事既有文档对齐（实施前已完成、非产品候选）**：`角色卡/编排/boundary.md` 补登 `src/pipeline/orchestration/flow-state.ts` 一行与对应 `changelog.md` 记录；`boundary.yaml` 已有该条目，不重复添加。该校正按闸门 2「授权人事补边界条目」执行，不是扩权。

**管理记录（不是产品候选）：** 顶层 `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/`、`docs/verification/` 以及各角色自身 `docs/change/`、`memo.md` 等。本任务的标准、报告、团队计划、变更包、沟通记录是验收引用与证据载体，不纳入产品候选。

**明确非目标（方案 §1、§6、§10；团队计划 §1.2、§4.6）：**

- 不新增角色对 `角色卡/` 的写权限；不放开治理角色互相派发；不新增 `cardKind` / `FlowStepKind` / `Power` / `Decision` 枚举；不改变 `OBSERVE_SKIP_SEGMENTS`（`角色卡/` 仍不被常规 artifact 观察）。
- 不把 Convener 的语义 readiness 判定改成应用判定；应用只记录确定性结构校验结果，不伪造客户决定或 readiness 结论。
- 不迁移/写入 `ans-gateway` 的角色卡、flow、账本；目标项目只读复算，不声称其已修复。
- 不新增文件系统 watcher；不加显式「重新校验/推进」动作（Q5）；O1 不默认。
- 不把 i18n 或目录 v3 的改动混入本变更候选；不改 `app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`src/model/**`、`src/common/shared/**`、枚举/权限模型、构建配置。
- 不在 `test/桌面应用/` 新建文件；不改 `test/桌面应用/e2e/main.mjs`（若必须修改才能产生 `E2E_PASS`，停止回报，不默认改）。
- 不提交、不推送、不合并、不发布；未启用 task_ops，不伪造任务令牌、锁、审批或机器预检。

### 1.4 写标准时的只读基线（2026-10-23）

| 检查 | 命令 / 方式 | 结果 |
| --- | --- | --- |
| 当前 HEAD | `git rev-parse HEAD` | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1` |
| 工作树（写标准前） | `git status --short` | 多文件 `M`：`app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`src/model/runtime.ts`、`src/pipeline/orchestration/*`、`src/common/编排/team-plan.ts`、`src/common/门禁引擎/governance-roles.ts`、相关测试与角色文档；未跟踪：`.claude/`、`demos/`、i18n 与目录 v3 的方案/计划/验收/证据、本变更沟通/方案/团队计划、`docs/scheduling/memo.md`、`角色卡/编排/boundary.md` 已在工作树补登 `flow-state.ts`。以上均为**既有上下文**，不纳入本变更候选 |
| 方案哈希 | `sha256sum` + `git hash-object` | `f3f75f283f945c4c601150291820f03a79ca216cce7859fb0e112d5120d28341` / `9223448f823bd30ef01c9d11d51385c3aeff9fef` |
| 团队计划哈希 | `sha256sum` + `git hash-object` | `fdd9721a0fc29cac36e0103ecb8ac682bec7245bae4809997ee5a5cea576c82d` / `d4e4f1b97bdc3ab02cf531a6ea2931b1c53fb080` |
| 意图记录哈希 | `sha256sum` + `git hash-object` | `5288ef63e45be1e0ac52b87065377765171a7a6370e8afe8278c508f4c8a0d5c` / `4942d84321a5302b87fc52d54580d628f5462d58` |
| 目标项目只读快照（非候选） | `sha256sum` | `ans-gateway/docs/flows/ai-governance-pipeline.yaml`：`85c0f2dfa2f7691c57b0d7a5a7c6490f8b9f029b487012cb53f2dfcabfb6f5b9`；`ans-gateway/.ans/governance/ledger.jsonl`：`faee1c73bfc73ec4268e5a9f4444c294e90ff336d82cece3003e7a9de5af6381`（100 行）。客户/桌面可能在本标准写盘后改动目标项目；复算时以实际复制内容和当时前后哈希为准，不要求与本节快照相同 |
| Node / npm | `node --version` / `npm --version`（当前 Git Bash） | **当前 shell PATH 未包含 Node**（`node: command not found`、`npm: command not found`）；既有记录为 Node v24.22.1 / npm 11.19.1（以实际取证环境为准）。实施/取证前须按团队计划 §1.4 导入 PATH 并记录实际版本与路径，不得伪造输出 |
| 已知挂起测试 | `ls test/pi-adapter/write-sequencing.test.ts` | 存在；T3 全量回归须排除并记录排除方式，不得把挂起当通过 |
| 仓库脚本 | `package.json` | `typecheck` = `tsc --noEmit`；`typecheck:renderer` = `tsc -p app/renderer/tsconfig.json`；`app` = `electron app/main.ts`；无独立 `test` 脚本，测试 runner 为 `node --test` |

**写标准时的只读代码事实（仅用于定位检查，不作为证据）：** `postWriteAdvanceDispatched`（`app/desktop/interface.ts:1481`）、`applicationDispatchCommitted`（1483）、`applicationConvenerDispatchKey`（1484–1485）为进程内 Set，成功后不清理；`appendApplicationDispatch`（1571–1621）以同键早退；`appointmentArtifactFeedback`（2478）按 `issuesHash` 去重（2936–2945、2995）；`runPostWriteAdvanceCheck`（3207–3440）只认最新 appointment 之后、带 `power !== "liaison"` 的 app→Convener 派发（3241–3298），`afterwards` 不区分是否带 `stepId`；`listProject`（3470+）当前不排写卡后检查；`buildRoleReadinessTaskMessage`（`app/desktop/governance-advance.ts:1047–1099`）当前无 `roleCardsDone` / `roleReadinessAlreadyDone` 选项；`completeAcceptanceStep`（`src/common/编排/flow-service.ts:643–730`）是唯一应用专用完成函数；`observeFlowArtifacts` 的 `OBSERVE_SKIP_SEGMENTS` 含 `.ans` 与 `角色卡`（735）；`src/pipeline/orchestration/flow-state.ts:21–24` 当前只再导出 `completeAcceptanceStep` / `observeFlowArtifacts`；`validateAppointmentArtifacts`（2506+）的必填条目检查使用 Set 成员判断（约 2644+），与条目顺序无关，但现有测试无逆序用例。

### 1.5 本文件不产生的授权

本文件不授权提交、推送、合并、发布，不授权派发 worker，不授权修改写集、档位、方案、团队计划、沟通记录、角色卡、边界或目标项目，也不授权跳过闸门 2 确认的写集与阶段顺序。写标准只完成实施前验收准备；实施仍按团队计划 S1–S6 与客户实施授权执行。

---

## 二、候选身份、证据与失效规则

### 2.1 候选身份与隔离

**产品候选**是判定时下列文件的精确内容：

- `src/**`、`app/**`、`test/**`（含本变更新增/修改的测试与夹具）；
- 角色自身文档中确属本任务授权的改动（`角色卡/编排/docs/change/**`、`角色卡/桌面窗口/docs/change/**`、`角色卡/测试/docs/change/**` 等，按团队计划 §4）；
- 闸门 2 授权的人事边界文档对齐（仅 `角色卡/编排/boundary.md` 的 `flow-state.ts` 一行与 `changelog.md` 对应记录），其余角色卡/边界改动一律不属于本候选。

**管理记录不是产品候选：** 顶层 `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/`、`docs/verification/` 的文件哈希不用于标识产品候选，也不得把管理记录变化说成产品改动；方案、标准或团队计划版本变化按 §2.5 处理，而不是当作产品候选变化。

**候选隔离（与 i18n / 目录 v3）：**

- 候选只含本变更 hunk；`git status --short`、`git diff --name-only`、`git diff` 必须能区分既有 i18n B0/B1–B4、目录 v3 改动与本变更改动。
- 不得把 i18n/目录 v3 的文件内容、测试断言、验收证据或结论混入本变更候选；共享文件按团队计划 §5.2 串行，S4 入口记录工作区哈希基线。
- 若无法从工作树区分某 hunk 的归属，按 `insufficient evidence` 处理，要求统筹提供基线/候选差异说明；不得「整文件算本变更」或「整文件算既有」。

**候选冻结：** 统筹提交变更包并声明候选后，候选冻结。判定前任一产品文件内容变化（任一 `git hash-object` / SHA-256 变化），受影响证据失效，按 §2.3 重取；不得在变化后的候选上沿用旧证据。

### 2.2 证据原始性与复用

- **原始证据**指：命令、cwd、时间、执行者、环境（Node/npm/OS/Shell）、退出码、stdout/stderr 原文、测试计数（pass/fail/skip/todo）、失败原文、候选文件哈希、diff/status、账本/flow/验证记录文件原文、e2e 与 Electron 的原始日志/报告/截图清单。开发自述、测试转述、工具成功提示、计划文本、代码注释都不能单独作为原始证据。
- **行为证据必须对应当前候选。** 证据的生成时间须晚于本标准写盘时间；早于标准的证据（除实施前基线，仅用于失败分类）按流程不符处理。单元测试必须实际执行并记录计数；不能只贴测试文件内容。
- **复用规则：** 只有同候选、同输入/依赖、同命令、同夹具/配置、同环境的证据可以复用。复用须在报告「复用证据」栏写明来源、原候选、原命令和仍然有效的理由。候选、输入、依赖、契约、夹具、配置或环境变化时，受影响证据失效，只补失效部分；不得因为「别的角色跑过」就跳过必需检查。
- **T3 全量回归不是可复用项：** 必须对当前候选执行；实施前基线只用于区分既有失败，不能替代最终候选的全量回归。
- **代码阅读不能替代行为证据：** 本文件 P1–P7、P9–P12 的 pass 必须来自实际执行输出或只读复算输出；P8/G1/G2 的结构性核对可以使用 diff/grep，但涉及「角色不能调用」「不伪造决定」等行为断言仍须测试。

### 2.3 证据失效矩阵

| 证据生成后的变化 | 失效范围 | 处理 |
| --- | --- | --- |
| 任一 `src/**`、`app/**` 产品代码变化 | 受影响单测/层测试/集成/e2e；候选哈希；全量回归结论；目标复算（若共享逻辑变化） | 重取受影响证据；候选变化后重跑 T3 全量与真实 Electron |
| `flow-service.ts` / `flow-state.ts` 公共出口或证据 schema 变化 | `test/编排/flow-service.test.ts`、桌面消费、e2e、目标复算 | 契约冻结后重跑受影响调用方；旧证据失效 |
| `interface.ts` 去重/指纹/探针/锚/派发顺序变化 | `test/桌面应用/interface.test.ts`、e2e、旧账本/跨重启夹具 | 重跑桌面套件与 e2e；重新记录诊断与账本 |
| `governance-advance.ts` 文案/选项变化 | 旧文案逐字断言、readiness 文案断言、桌面测试、e2e | 重跑文案与链路测试；旧调用逐字对比重取 |
| 任一 `test/**` 测试文件或共享夹具变化 | 该套件及其依赖的集成/e2e；全量回归 | 重跑该套件与受影响链路；不得只重跑新增用例 |
| 方案/标准/团队计划版本或确认记录变化 | 验收基线/范围依据；受影响标准行 | 方案实质变化重开闸门 1；标准按 §2.5；团队计划变化重核写集 |
| 目标项目复制内容或目标文件哈希变化 | 目标只读复算证据 | 重新复制并记录前后哈希；不得复用旧复制 |
| HEAD 或实施前基线变化 | 基线对照、既有失败分类、候选身份中的 HEAD | 重新建立基线；无法建立时 `insufficient evidence` |
| 环境变化（Node/npm/OS/Shell/依赖） | 受环境影响的全量回归、e2e、Electron、目标复算 | 记录新环境并重跑受影响检查；不能把环境差异当成通过 |
| 证据文件被替换、丢失或无法追溯 | 对应验收行 | `insufficient evidence`，重取原始输出 |

### 2.4 T3 全量回归与失败分类

本变更改变治理推进判定、去重与 flow 写入行为，涉及跨角色契约与编排公共出口，T3 适用且**必须执行**，不能用 N/A 掩盖：

- 最终候选执行 `node --test "test/**/*.test.ts"`；按团队计划 §6.3 排除已知挂起 `test/pi-adapter/write-sequencing.test.ts`，并在证据中记录可复现的排除方式（命令行/清单/脚本），不得静默跳过。
- 执行 `npm run typecheck`；`npm run typecheck:renderer` 默认 N/A，理由是本变更不改渲染层产品代码（团队计划 §4.6）；若共享契约或类型影响到渲染层，则补跑并记录，不得默认跳过。
- 实施前由测试角色对当前基线跑同一组命令，记录计数、失败清单与分类；最终结果与基线逐项对照，**本次新增失败不得放行**。
- 失败分类至少区分：既有 Windows symlink `EPERM`；桌面并发/时序偶发（隔离/整文件/串行复跑分类）；`write-sequencing` 挂起（排除并记录）；其他新增失败（停止回报，不得以「环境问题」笼统带过）。每组既有失败须附基线原始输出与原因。
- 全量回归证据只对当前候选有效；候选变化后受影响部分失效并重跑。
- 全量回归之外，真实 Electron `E2E_PASS`、目标项目只读复算、夹具全链路 e2e 与 `npm run typecheck` 缺一即 `insufficient evidence`（若已有失败证据则为 `fail`）。

### 2.5 标准版本冻结

- 本文件版本为 `governance-advance-redispatch-criteria-v1`，2026-10-23 写盘后冻结。实施开始后不得为适配候选修改本标准、放宽或加严实质。
- 若发现标准本身有误、与方案 §8.3 冲突或与闸门 0/1/2 确认范围不一致：记录问题、理由和受影响行，递增为 v2，交沟通/统筹确认后再用新版本判定；受影响证据重新核对，旧报告过期。
- 本标准是管理记录，不是客户确认记录，也不是验收结论；标准版本变化不自动改变方案、团队计划或档位。
- 本文件不声明「已验证」「已验收」「目标项目已修复」；这些表述只能出现在实施后的报告或客户沟通中，且须有对应证据。

---

## 三、验收标准

### 3.1 标准来源映射

#### 3.1.1 方案 §8.3 七条验收要点与覆盖行

| 方案 §8.3 要点 | 覆盖行 | 说明 |
| --- | --- | --- |
| ① 不合格不推进且只反馈一次 | P3、P2 | 反馈按指纹去重；同内容不重复；内容变化可再反馈 |
| ② Crew 重写能重新触发 | P1、P2、P6 | appointment-write/settle/刷新三类触发均可重新进入；无永久运行期键 |
| ③ 合格后 role-cards done 且证据可核对 | P4、P5 | artifact/dispatch 两种 kind；记录/账本/flow 证据可交叉核对 |
| ④ readiness 恰一次、账本恰一条、无客户决定 | P5、P3、P4 | 同指纹不重复派发；不写 `customer.decision`、不弹客户卡 |
| ⑤ 权限/边界/枚举无扩张 | P8、G2 | 仅授权的人事文档对齐；不新增写权/派发权/枚举 |
| ⑥ legacy/v2 与逆序 boundary 行为不变 | P7、P9 | 旧文案/旧最低校验/旧派发路径保留；逆序新增回归 |
| ⑦ 目标项目无写入 | P10 | 只读复制复算；目标前后哈希一致；不声称已修复 |

#### 3.1.2 方案 §8.1/§8.2 测试条目与覆盖行

| 方案条目 | 覆盖行 |
| --- | --- |
| §8.1.1 可重入正/负例（两次错误写卡两个反馈；修正后通过；role-cards 恰一次 done；readiness 恰一次；无客户卡/无 customer.decision） | P1、P3、P5 |
| §8.1.2 指纹去重（同内容不重复；内容变化允许再次反馈/派发） | P2 |
| §8.1.3 手工修改 + 刷新（无 Crew 事件，仅 `listProject`） | P6 |
| §8.1.4 跨重启账本锚（目标形态；pass 记录之后的 readiness 派发 ⇒ 挡） | P2 |
| §8.1.5 role-cards 完成（artifact/dispatch；缺步骤有/无团队计划；幂等；终态；stale） | P4、P5、P9 |
| §8.1.6 逆序 boundary | P7 |
| §8.1.7 防自激 | P6 |
| §8.1.8 legacy/v2 不变；现有测试零放宽 | P9、G2 |
| §8.2 `completeRoleCardsStep` 单测（done+evidence；幂等；终态；stale；越界；artifact.observed 幂等；无 customer.decision；原子写失败不破坏原文件） | P4 |
| §8.3 e2e/T3/Electron/目标复算 | P1、P10、P11 |

### 3.2 验收表（判定时逐行填「实际证据路径/哈希」「候选版本」「结果」「验收判断」）

下表是判定时使用的核心索引。每行证据均须附对应候选哈希、原始 `git status --short` / `git diff` 输出、产生该行结论的命令输出；涉及 flow/账本/e2e 的行还须附 flow YAML、`ledger.jsonl`、验证记录、e2e/Electron 原始日志。只有角色自述或「工具成功」不构成原始证据。

| ID | 方案条目/标准（摘要） | 判定方法 | 最低证据 | 判定规则（pass/fail/insufficient evidence/not applicable） |
| --- | --- | --- | --- | --- |
| P1 | 可重入门禁：每次 Crew appointment-write（含修正重写）、治理角色 settle、项目刷新都能进入去重校验；无永久运行期键挡后续重写 | 两轮以上行为测试 + 三类触发分别触发 | 测试/ e2e 原始输出；反馈/派发计数；flow/账本快照；候选哈希 | 见 §3.3.1；整行不得 N/A |
| P2 | 指纹/账本锚：内容指纹（六文件+团队计划+schema 版本）变化才重新反馈/派发；同内容不重复；早期 appointment 链派发不挡；跨重启锚正确 | 同内容/内容变化/mtime-only/跨重启/旧账本行为测试 | 指纹记录、反馈/派发计数、账本条目、两次进程实例输出 | 见 §3.3.2；整行不得 N/A |
| P3 | 不合格反馈：blocker ⇒ 自动反馈 Crew/Convener，按指纹去重；不写 flow、不派 Convener、不弹客户卡、不写 customer.decision；Crew 重写后可再进入 | 错误写卡行为测试 + 负例断言 | 反馈原文；客户卡调用为零；flow YAML 前后哈希；账本 diff；计数 | 见 §3.3.3；整行不得 N/A |
| P4 | `completeRoleCardsStep`：应用专用完成 role-cards；artifact/dispatch 两种 kind；done/幂等/终态/stale/越界；证据可核对；不写 customer.decision、不伪造客户批准 | 编排单测 + 桌面集成 + 文件/账本原文 | `flow-service.test.ts` 输出；记录 JSON；artifact.observed；flow YAML diff；账本条目 | 见 §3.3.4；整行不得 N/A |
| P5 | Convener 派发：合格后 role-cards 恰一次 done、readiness 恰一次派发、账本恰一条；readiness 已 done 文案不要求重做；旧调用文案逐字不变 | 桌面集成 + 文案断言 + 计数 | 派发计数、账本条目、flow done、消息原文、旧文案逐字对比 | 见 §3.3.5；整行不得 N/A |
| P6 | 项目刷新触发：listProject 廉价探针 + 250ms 合窗；手工改文件后刷新可重新校验；无自激/循环；仅 listing 签名变化或实际动作才 emitProjectChanged | 无 Crew 事件、仅刷新行为测试 + 防循环计数 | 反馈/派发计数；`emitProjectChanged` 计数；诊断原文；测试输出 | 见 §3.3.6；整行不得 N/A |
| P7 | 顺序无关：boundary 条目逆序仍通过；新增回归测试锁定；顺序不是当前卡点 | 逆序夹具正/负例 | 测试文件 diff；测试输出；flow/派发结果 | 见 §3.3.7；整行不得 N/A |
| P8 | 权限/边界/枚举：不新增 `角色卡/` 写权、不放开角色互派、不新增 cardKind/FlowStepKind/Power/Decision；应用是中介与 flow 唯一写者；人事仅补 flow-state.ts 文档漂移 | diff/grep + 角色工具面行为断言 | diff/status；枚举定义；工具清单/调用结果；边界 diff | 见 §3.3.8；整行不得 N/A |
| P9 | legacy/v2 兼容：无团队计划/无 role-cards 步骤旧行为、旧文案、旧最低校验逐字/逐行为保留；现有测试零放宽 | 旧路径测试原样执行 + 文案逐字比对 | 旧测试输出；文案原文；flow/账本快照；测试 diff | 见 §3.3.9；整行不得 N/A |
| P10 | 目标项目只读复算：ans-gateway flow/账本复制到临时夹具，断言旧 app→Convener 条目不再挡、当前指纹可放行；不写目标项目；不声称已修复 | 只读复制 + 复算测试 + 目标前后哈希 | 复制与哈希记录；复算输出；目标零写入证明；报告措辞 | 见 §3.3.10；整行不得 N/A |
| P11 | 证据/T3：候选哈希、原始命令/退出码/计数/失败原文、T3 全量（排除已知挂起）、typecheck、真实 Electron E2E_PASS、目标只读复算；失败分类 | 证据完整性核对 + 抽样复算 | 全部原始输出；候选哈希；基线对照；Electron 报告 | 见 §3.3.11；仅明确子项可 N/A |
| P12 | 文档状态：实施前标准先于实施；实现完成写 implemented-unverified；未验收不写 verified；不与 i18n/目录 v3 合并判定 | 顺序/状态/独立性核对 | 标准哈希与写盘顺序记录；角色文档状态；报告路径；候选隔离 | 见 §3.3.12；整行不得 N/A |
| G1 | 变更包完整、候选身份可复算（流程核对行，非新增产品需求） | 对照变更包与复算结果 | `docs/scheduling/governance-advance-redispatch-change-v1.md`；哈希/status/diff | 见 §3.4；整行不得 N/A |
| G2 | 写集与授权（流程核对行，非新增产品需求） | 改动路径对照团队计划 §4 | `git diff --name-only`/`--stat`/`--cached`；边界 diff | 见 §3.4；整行不得 N/A |

### 3.3 P1–P12 逐条判定口径

> 通用要求：以下每一行的 pass 都必须有当前候选上的实际执行输出；没有执行输出、只有代码阅读或角色自述的，按 `insufficient evidence`。`fail` 需要已有证据表明不满足标准或候选包含明确不允许的改动；`insufficient evidence` 是「尚不能判断」；`not applicable` 必须写明依据，且不得把整行 N/A 当 pass。

#### 3.3.1 P1 可重入门禁

**标准（方案 §3 A1/A2/A4、§8.1.1、§8.3 ①②）：** 每次 Crew appointment-write（含修正重写）、治理角色 settle、项目刷新都能进入去重校验；没有永久运行期键挡住后续重写；同一内容状态不重复反馈/派发，内容变化后可再次进入并（在满足校验时）再次放行。

**判定方法：**

1. 在桌面层/ e2e 夹具上执行至少两轮闭环：
   - 第一轮：写出不合格内容 V1 ⇒ 反馈一次；
   - 第二轮：Crew 修正重写为不合格但内容变化 V2（问题集可以相同）⇒ 必须再次进入校验并再次反馈（证明不是被 `postWriteAdvanceDispatched` / `applicationDispatchCommitted` 或 issuesHash 永久挡住）；
   - 第三轮：重写为合格 V3 ⇒ `role-cards` 恰一次 done、Convener readiness 恰一次派发、账本恰一条；
   - 第四轮：在已有成功派发后，Crew 再次写卡且内容变化 V4（仍合格）⇒ 必须重新进入校验，并产生新的通过记录；按方案 §A2「内容变化产生新指纹/新通过记录后放行」允许再次派发（若 flow 已处于 role-readiness done，文案按 P5 说明不要重做）。
2. 分别验证三类触发至少各一次：appointment-write answered、治理角色 settle、项目刷新（`listProject`，见 P6）。
3. 对同一内容重复触发（重复 settle / 重复 appointment-write / 重复刷新）⇒ 反馈与派发均不增加。
4. 旧 appointment 链（app→Convener，无 `stepId`）存在时，不得把该条目当作「已派发 readiness」而挡住本次检查（P2/P10 细化）。

**最低证据：**

- 桌面层测试或 e2e 的原始命令、退出码、计数（pass/fail/skip）与失败原文；
- 反馈消息与 Convener 消息的逐条记录（角色、文本、次数）；
- flow YAML 快照（`role-cards` status/evidence）与 `ledger.jsonl` 相关条目（`dispatch.accepted`、`artifact.observed`）；
- 候选哈希与测试文件 diff；
- 第四轮（成功派发后再重写）的实际输出，不能用代码阅读替代。

**判定规则：**

- **pass：** 两轮以上闭环实际执行通过，三类触发均能进入校验，同内容无重复，内容变化后可再次进入/放行，且没有永久运行期键阻挡的证据。
- **fail：** 任一重写被静默跳过；同内容重复反馈/派发；内容变化后仍被旧键挡住；只覆盖第一轮（无既有成功派发后的重写）却声称可重入。
- **insufficient evidence：** 只有单轮/单触发证据；没有实际执行输出；e2e 未覆盖既有成功派发后的重写；候选/夹具不一致。
- **not applicable：** 无；P1 整行不得 N/A。

#### 3.3.2 P2 指纹与账本锚

**标准（方案 §3 A2、Q3/Q4、§10.1/§10.8、§8.1.2/§8.1.4）：**

- 内容指纹 = `sha256({ schema: "role-cards-gate/v1", flowId, appointment: {path, version?}, teamPlan: {path, version, sha256} | null, roles: [{roleId, files: 六个文件各 {name, sha256 | "missing"}}] })`，角色按 `roleId` 排序；**不含 mtime/时间**。
- 反馈去重键为 `projectRoot\0flowId`，值为当前指纹；同指纹不重复反馈，指纹变化（含问题集相同但内容已改）重新反馈；通过后清除。
- 派发运行期键为 `${canonicalRoot}\0${flowId}\0convener\0${fingerprint}\0${latestCrewWriteIndex}`；同一 flow 出现新键时清理旧键；`applicationDispatchCommitted` 使用同一键；发送/账本追加失败释放占位。
- 账本放行（跨重启）：以「当前指纹的通过记录」（`artifact.observed`，power=app，记录路径/哈希见 P4）为锚；锚之后已有 app→Convener readiness 派发 ⇒ 跳过；否则放行。无通过记录的 legacy 流程以「最近 Crew appointment-write（无则最近 appointment）」为锚。**appointment 链早期无 `stepId` 的 Convener 派发不再算 readiness 已派发。**

**判定方法：**

1. 同内容重复触发（settle/刷新/appointment-write）⇒ 反馈与派发计数不增加。
2. 六文件之一内容变化 1 字节、问题集相同 ⇒ 指纹变化，必须重新反馈（或在校验通过时重新放行）。
3. 团队计划内容变化 ⇒ 指纹变化，必须重新反馈/放行；团队计划缺失（legacy）时 `teamPlan: null` 行为按 P9。
4. 仅 `utimes`/mtime 变化、内容不变 ⇒ 指纹不变，不得重新反馈/派发（证明指纹不含时间）。
5. 跨重启：构造两个新的 Interface 实例（同一项目根，磁盘账本/记录保留）：
   - 夹具 A（目标形态）：appointment → 旧 app→Convener 派发（无 `stepId`）→ 后续 Crew 写卡 → 无通过记录；新实例运行 ⇒ 旧条目不得挡住，校验/派发继续；
   - 夹具 B：通过记录之后已有 app→Convener readiness 派发（`stepId=role-readiness`）⇒ 新实例必须跳过，不重复派发、不重复反馈；
   - 夹具 C：通过记录存在但其后无 readiness 派发 ⇒ 必须放行。
6. 发送失败/账本追加失败（注入）⇒ 占位释放，下一次触发可重试，不出现永久占位。
7. 多角色目标按 `roleId` 排序稳定（同一组文件、不同顺序构造 ⇒ 指纹一致；若实现提供可核对记录，记录中的 files 顺序须稳定）。

**最低证据：**

- 每组行为测试的原始输出与计数；
- 验证记录 JSON（`fingerprint`、`files`、`teamPlan` 字段）与独立复算的指纹值（若记录暴露）；
- 两个新 Interface 实例的输出、磁盘账本与 flow 快照；
- mtime-only 测试的 `utimes` 前后哈希记录；
- 失败注入测试的原始错误与后续重试结果；
- 候选哈希。

**判定规则：**

- **pass：** 同内容不重复、内容变化可重新进入、mtime-only 不触发、跨重启 A/B/C 三夹具均符合预期、失败占位可重试，且早期 appointment 链派发不挡。
- **fail：** 指纹包含 mtime/时间；同内容重复反馈/派发；内容变化被 issuesHash 或旧键挡住；早期无 `stepId` 派发仍被当 readiness；跨重启锚错误；失败后永久占位。
- **insufficient evidence：** 只验证内容变化或只验证同内容之一；没有跨重启实例证据；没有实际记录/账本原文；指纹值无法核对。
- **not applicable：** 无；P2 整行不得 N/A。

#### 3.3.3 P3 不合格反馈

**标准（方案 §3 A3、§8.1.1、§8.3 ①）：** 存在非 warning blocker 时：记 `advance.appointment.artifacts-invalid`；经既有 `reportAppointmentArtifactIssues` 按来源自动反馈 Crew（nominator）/Convener；按指纹去重；**不写 flow、不派 Convener、不弹客户卡、不写任何 `customer.decision`**；Crew 重写后可再次进入校验。warning-only 保持现状：只记诊断，不阻塞、不派任务。

**判定方法：**

1. 触发错误写卡（缺文件/空文件/坏 YAML/role 与目录不一致/缺章节/计划写集未覆盖等）⇒ 断言：
   - Crew/Convener 收到按来源分流的反馈，逐文件列出具体问题；
   - Convener readiness 派发次数为 0；
   - 客户卡调用次数为 0（`customerInput` 记录为空）；
   - flow YAML 字节哈希与触发前一致（未写 `done`、未写事件）；
   - `ledger.jsonl` 条目数与 `customer.decision` 条目数前后一致（无新增客户决定）；
   - Lead 系统行如实说明「未通过校验、未派 readiness、未标 done」，不写「已批准/已通过」。
2. 同内容重复触发 ⇒ 反馈条数不增加（指纹去重）；内容变化但问题集相同 ⇒ 反馈条数增加（见 P2）。
3. warning-only（existing/legacy 最低检查提醒）⇒ 只记诊断（`advance.appointment.artifacts-warning`），不派任务、不阻塞，随后仍可派 readiness/旧路径。
4. 发送失败（注入 open/send 失败）⇒ 不登记去重，下一次触发重试；不得出现「已反馈」记录但实际未发出。

**最低证据：**

- 错误写卡测试/e2e 的原始输出与逐文件反馈原文；
- 客户卡调用记录（必须为空）；
- flow YAML 前后 SHA-256、账本前后条目/`customer.decision` 计数；
- 重复触发与内容变化对照的反馈计数；
- warning-only 的诊断原文与后续派发结果；
- 发送失败注入的原始错误与重试记录。

**判定规则：**

- **pass：** 所有负例均不推进、只按指纹反馈、无客户卡/客户决定、flow 未变；warning-only 不阻塞；发送失败可重试。
- **fail：** 任一 blocker 案例写了 flow、派了 Convener、弹了客户卡或写了 `customer.decision`；同内容重复反馈；反馈未按来源分流；发送失败仍登记去重。
- **insufficient evidence：** 只断言「未派 Convener」而没有 flow/账本/客户卡原始证据；没有重复触发或内容变化对照；候选不一致。
- **not applicable：** 无；P3 整行不得 N/A。

#### 3.3.4 P4 `completeRoleCardsStep`

**标准（方案 §3 A5、§4、§8.2、Q1/Q6）：** 新增应用专用 `completeRoleCardsStep`，与 `completeAcceptanceStep` 同层，经 `src/pipeline/orchestration/flow-state.ts` 公共出口导出，**不注册为角色工具**；输入 `{projectRoot, flowId, roleIds, validatedFiles:[{path,sha256}], fingerprint, appointmentArtifactPath?}`。行为：

1. `roleIds` 非空；`validatedFiles` 只落在目标角色目录的六个文件内；重新读取并核对 sha256，不一致 ⇒ `role-cards-stale`；越界路径 ⇒ 明确拒绝。
2. 读 flow，找 `id:"role-cards"` 的步骤：缺失 ⇒ `role-cards-step-missing`；已 done ⇒ `{ok:true, idempotent:true}`；`superseded/failed/blocked/aborted` ⇒ `role-cards-step-terminal`，不覆盖终态；其它 kind ⇒ `role-cards-kind-unsupported`。
3. 按步骤 `kind` 生成证据（不改 kind）：`dispatch` 要求账本已有 `dispatch.accepted{flowId, stepId:"role-cards"}` 并用 `validateFlowEvidence` 对账，证据 `{kind:"dispatch", ref:"role-cards"}`；`artifact` 写应用私有验证记录并追加幂等 `artifact.observed{actorRoleId:"app", power:"app", artifactPath, artifactSha256, flowId}`，证据 `{kind:"artifact", ref:记录路径}`。
4. 验证记录路径 `.ans/governance/role-cards/<flowId>/<fingerprint>.json`，内容含 `schema / flowId / at / roleIds / appointmentArtifactPath / teamPlan / fingerprint / files[{path,sha256}] / result:"structure-pass" / semantic:"pending"`，并明确标注「结构校验通过，不代表 readiness/验收」。
5. 与 `completeAcceptanceStep` 共用 per-project 串行队列、候选 YAML 复核与原子写；写 flow 事件 `flow.role-cards.completed`，view actor `app/app`；**不写 `customer.decision`、不写客户批准**；失败不破坏原文件。

**判定方法：**

1. 编排单测逐项覆盖：done + evidence（artifact 和 dispatch 两种 kind）；第二次调用幂等（不新增记录/账本，revision 不变）；终态拒绝；stale（校验后文件又变）；越界路径（`角色卡/other/...`、`docs/...`、绝对路径、`..`）拒绝；`artifact.observed` 同 path+sha 幂等；`dispatch` kind 无账本证据时拒绝；unsupported kind 拒绝；候选 YAML 重新解析；原子写失败原文件字节不变；并发调用经串行队列一完成一幂等。
2. 桌面集成：合格后应用调用该函数，检查 flow `role-cards` done、记录文件存在且字段可核对、`artifact.observed` 账本条目存在；未合格时不被调用。
3. 证据可核对：从记录 JSON 读取 `files[{path,sha256}]`，独立重算每个文件 SHA-256 并与记录、账本 `artifactSha256` 对照；记录中的 `fingerprint` 与 P2 指纹口径一致；flow evidence ref 指向该记录路径（artifact kind）或 `role-cards`（dispatch kind）。
4. 负例：记录/账本出现 `customer.decision` 或客户批准文案即 fail；角色工具面出现 `completeRoleCardsStep` 即 fail（P8）。

**最低证据：**

- `node --test test/编排/flow-service.test.ts` 的原始命令、退出码、计数、失败原文；
- 记录 JSON 原文与六个文件的 SHA-256 复算输出；
- flow YAML 前后 diff 与 `revision`；
- `ledger.jsonl` 中 `artifact.observed` / `dispatch.accepted` 条目原文；
- 注入 stale/越界/终态/写失败/并发的测试输出；
- 候选哈希。

**判定规则：**

- **pass：** 上述正/负例与幂等/终态/stale/越界/原子写全部实际通过；artifact 与 dispatch 两种 kind 证据均可核对；无 customer.decision；函数不在角色工具面。
- **fail：** 接受校验后变化的文件；覆盖终态；写越界路径；写 customer.decision 或客户批准；记录字段缺失/不可核对；artifact.observed 重复；函数被注册为角色工具；写失败破坏原文件。
- **insufficient evidence：** 只测一种 kind；没有记录/账本原文；没有 stale/越界负例输出；单元测试未实际执行；候选不一致。
- **not applicable：** 无；P4 整行不得 N/A。

#### 3.3.5 P5 Convener 派发

**标准（方案 §3 A4、A6、Q7、§8.1.1、§8.3 ③④）：** 合格后 `role-cards` 恰一次 done、readiness 恰一次派发、账本恰一条；`role-cards` 已 done 时消息只要求推进 `role-readiness`；`role-readiness` 已 done 时消息明确「不要重做，核对后继续推进后续步骤」；旧调用文案逐字不变；派发成功写 Lead 系统行，不表示客户批准。

**判定方法：**

1. 新流程夹具（团队计划 + flow `role-cards` pending，`role-readiness` pending）：
   - 校验通过 ⇒ `role-cards` done（artifact 或 dispatch 证据）、flow revision 恰一次变化；
   - Convener 收到恰一条 readiness 消息，账本恰一条 `dispatch.accepted{targetRoleId:"convener", stepId:"role-readiness", actorRoleId:"app", power:"app"}`（在通过记录之后）；
   - 同指纹重复 settle/刷新 ⇒ 消息与账本均不增加；
   - `role-cards` 的 `flow.role-cards.completed` 事件恰一次；记录文件每指纹一份；`artifact.observed` 每 path+sha 一条。
2. 目标形态夹具（`role-cards` artifact dispatched、`role-readiness` done）：校验通过后消息必须包含「不要重做」「核对后继续」类明确指令，且不得要求 Convener 重新完成 readiness；派发/账本仍按方案执行恰一次（用于让 Convener 核对并继续后续步骤）。
3. 旧调用文案：`buildRoleReadinessTaskMessage` 未传新选项时的 v1/v2/v3 输出与 S4 入口冻结的原文逐字相等；`buildGovernanceAdvanceMessage` legacy 输出逐字相等（以既有测试与字符串快照双重核对）。
4. 失败路径：runtime 无法解析/开或发失败 ⇒ 释放占位、只记诊断、不写「已派发」账本；下一次触发可重试。
5. Convener 系统行：成功派发后 Lead 系统行如实说明「已派发角色就绪复核」，不得出现客户批准字样。

**最低证据：**

- 桌面测试/e2e 原始输出与消息原文（含 role-cards 已 done、readiness 已 done 两种文案）；
- flow YAML（`role-cards` done + evidence）、记录 JSON、账本条目原文与计数；
- 重复触发前后的计数对照；
- 旧调用文案的逐字快照与测试输出；
- 失败注入的原始错误与重试记录；
- 候选哈希。

**判定规则：**

- **pass：** role-cards 恰一次 done、readiness 恰一次派发、账本恰一条；两种文案符合 Q7；旧调用逐字不变；失败可重试、不伪造派发。
- **fail：** 重复 done/重复派发/重复账本；readiness 已 done 仍要求重做；旧文案被改动；失败后写「已派发」；把派发写成客户批准。
- **insufficient evidence：** 只验证新文案或只验证旧文案；没有账本计数；没有重复触发对照；消息原文缺失。
- **not applicable：** 无；P5 整行不得 N/A。

#### 3.3.6 P6 项目刷新触发

**标准（方案 §3 A1、Q2、§10.2/§10.3、§8.1.3/§8.1.7）：** `listProject` 更新 listing 缓存后先做廉价探针（账本 + flow 状态 + 通过记录/派发锚）；只有存在「待校验或待派发」的 flow 才排完整检查；刷新触发使用 250ms 合窗，与既有 running/pending 合并逻辑共用，不吞信号；手工改文件后刷新可重新校验；无自激/循环；`emitProjectChanged` 仅在 listing 角色/警告签名变化或实际发出反馈/派发/完成动作时触发；探针只做廉价读取（role-cards done 且 readiness 已派发后不再读全部角色文件，方案 §10.2）。新增诊断 `advance.post-write.probe`（仅诊断，不对客户展示）。

**判定方法：**

1. 无 Crew 事件、无 settle，仅手工把不合格文件改为合格，然后调用 `listProject` ⇒ 必须排检查、通过并推进（role-cards done + readiness 派发一次）；反向：手工改坏后刷新 ⇒ 反馈一次，不推进。
2. 突发：在 <250ms 内连续多次触发刷新（≥5 次）⇒ 同一窗口内完整检查至多一次、反馈/派发不重复；窗口后仍有待处理信号时不得丢失（最终状态得到一次处理）。
3. 运行中到达：一次完整检查运行期间再次触发 ⇒ 结束后按 pending 补跑一次（不吞信号），不产生重复派发。
4. 防自激：稳定状态（已反馈或已派发）下重复 `listProject` ≥10 次 ⇒ 反馈/派发/`emitProjectChanged` 计数不随调用次数增长；无 `listProject → 检查 → projectChanged → listProject` 循环。
5. `emitProjectChanged`：探针无待办且 listing 签名不变 ⇒ 不触发；listing 角色/警告签名变化 ⇒ 触发；实际反馈/派发/完成动作 ⇒ 触发。以注入的 `emitProjectChanged` 计数器断言。
6. 廉价探针：诊断日志出现 `advance.post-write.probe`；探针不对客户展示（客户事件/界面文案不出现）；在 role-cards done 且 readiness 已派发后，重复刷新不产生完整检查/不读取全部角色文件的可观察副作用（以无新诊断/无反馈/无派发证明，辅以诊断事件名）。
7. 不影响既有触发：appointment-write answered、治理角色 settle 仍能触发（P1）。

**最低证据：**

- 仅刷新场景的测试/e2e 原始输出与计数；
- 突发合窗、运行中补跑、10 次刷新的计数记录；
- `emitProjectChanged` 计数器输出；
- 诊断日志原文（含 `advance.post-write.probe`）与客户事件清单；
- flow/账本快照；
- 候选哈希。

**判定规则：**

- **pass：** 手工改文件后刷新可重新校验/推进；250ms 合窗生效且不吞信号；无自激/循环；`emitProjectChanged` 只在签名变化或实际动作时触发；探针不面向客户。
- **fail：** 刷新永不触发；刷新造成重复反馈/派发；形成刷新循环（计数随 listProject 增长）；探针泄漏为客户文案；每次刷新都全量重读并触发 `projectChanged`。
- **insufficient evidence：** 只验证「刷新后能推进」而没验证合窗/防自激；没有 `emitProjectChanged` 计数；只有代码阅读。
- **not applicable：** 无；P6 整行不得 N/A。

#### 3.3.7 P7 顺序无关

**标准（方案 §3 A3、§2.1、§8.1.6）：** 当前解析器与 ②b 必填条目检查遍历全部 `file` 条目，不依赖顺序；boundary 条目逆序书写仍通过；新增回归测试锁定该事实；顺序不是当前卡点。

**判定方法：**

1. 构造 new 角色 boundary：六个工作文档 + 写集条目按「写集 → api-spec → memo → functional-description → feature-map → role-card」或其它非标准顺序书写，其余内容合格 ⇒ 校验通过、派发 readiness（或按 flow 契约推进），不产生顺序相关 blocker。
2. 负例：逆序且缺少某个必填条目（例如末尾缺 `api-spec.md`）⇒ 必须被逐项报告（证明检查遍历全部条目，而不是只看前几条）。
3. 与 P4/P5 联动：逆序合格后 role-cards done 与 readiness 恰一次，不被顺序问题挡住。

**最低证据：**

- 新增回归测试的 diff 与原始输出（命令、退出码、计数）；
- 逆序与缺条目负例的反馈原文；
- flow/派发结果；
- 候选哈希。

**判定规则：**

- **pass：** 逆序合格通过、缺条目负例被完整报告，测试锁定该行为。
- **fail：** 逆序被误判为不合格；只检查前几个条目；没有新增回归测试。
- **insufficient evidence：** 只有现有测试通过而没有逆序用例；或测试未实际执行。
- **not applicable：** 无；P7 整行不得 N/A。

#### 3.3.8 P8 权限、边界与枚举

**标准（方案 §6、§7、§10.9；团队计划 §4.5；闸门 2 边界授权）：** 不新增角色对 `角色卡/` 的写权限；不放开治理角色互相派发；不新增 `cardKind` / `FlowStepKind` / `Power` / `Decision` 枚举；应用仍是唯一中介与 flow 写者；`completeRoleCardsStep` 不注册为角色工具、不进 `AdapterCapabilities`；`OBSERVE_SKIP_SEGMENTS` 不变（`角色卡/` 仍不被观察）；人事仅补 `flow-state.ts` 的 Markdown/YAML 文档漂移，不扩权。

**判定方法：**

1. 结构性核对：`git diff`/`git status` 显示 `角色卡/**` 只有闸门 2 授权的人事对齐（`角色卡/编排/boundary.md` 一行 + `changelog.md` 记录），无其它角色卡/边界/YAML 改动；`src/model/**`、`src/common/shared/**`、枚举定义文件无本变更改动。
2. 枚举核对：`FLOW_STEP_KINDS`、`cardKind`、`GovernancePower`、`GovernanceDecisionKind` 的值集合与改动前逐字一致（diff/grep + 现有枚举测试）。
3. 角色工具面行为：以角色工具清单/`AdapterCapabilities` 或实际调用断言 `completeRoleCardsStep` 不可被角色调用（未知工具/未注册）；Crew 仍只能通过既有 appointment-write 写 `角色卡/`；治理角色不能互相派发。
4. 观察排除：`observeFlowArtifacts` 仍不观察 `角色卡/` 与 `.ans`（现有测试 + 行为断言）。
5. 人事对齐核对：`boundary.md` 新增行与 `boundary.yaml` 既有条目逐字一致；`changelog.md` 记录来源与性质；不得顺手改其它条目。

**最低证据：**

- `git diff --name-only`、`git diff`、`git status --short` 原文；
- 枚举定义/`OBSERVE_SKIP_SEGMENTS` 的 diff（应为空或不含新增值）；
- 角色工具面测试/调用输出；
- 人事对齐的精确 diff；
- 候选哈希。

**判定规则：**

- **pass：** 无角色写权/派发权/枚举扩张；应用仍是唯一 flow 写者；人事对齐恰好只有授权条目。
- **fail：** 新增写权/互相派发/枚举；`completeRoleCardsStep` 成为角色工具；观察排除变化；人事对齐夹带其它改动。
- **insufficient evidence：** 只有 diff 没有角色工具面行为断言；无法确认枚举/工具面；候选隔离不清。
- **not applicable：** 无；P8 整行不得 N/A（人事对齐若确实未发生，按「已由闸门 2 明确以 YAML 既有条目为授权依据」记录行内 N/A，并给出记录，但其它 P8 检查仍须判定）。

#### 3.3.9 P9 legacy / v2 兼容

**标准（方案 §3 A7、§7、§8.1.8、§10.7；团队计划 §1.2、§九.7）：** 无团队计划的 legacy 流程：校验保持最低结构检查；无 `role-cards` 步骤时走旧派发文案与旧行为；不写验证记录、不改账本种类。有团队计划（v2/v3）但 flow 缺 `role-cards` 步骤：不派 readiness，反馈 Convener 补 flow（新流程的 flow 缺陷，不静默通过）。目标项目不迁移。旧文案、旧最低校验逐字/逐行为保留；现有测试零放宽。

**判定方法：**

1. legacy（无团队计划、无 `role-cards` 步骤）：
   - 既有 `test/测试/governance-e2e-auto/l-crew-write-validation.test.ts` 与桌面 `interface.test.ts` 中 legacy 用例按原断言执行通过；
   - 合格后 Convener 收到旧文案（`buildGovernanceAdvanceMessage` 的原文，含「请写流程状态 YAML …并派发已批准步骤」），账本同形 `dispatch.accepted` 恰一条；
   - 不创建 `.ans/governance/role-cards/**` 验证记录；账本不新增 `artifact.observed` 种类；
   - existing/legacy 的最低检查仍只记 warning、不阻塞。
2. 有团队计划但 flow 缺 `role-cards` 步骤：
   - 不派 readiness；经既有后台反馈通道提示 Convener 修正 flow；无客户卡、无 `customer.decision`；
   - 补齐 flow 后再次触发可正常推进。
3. 现有测试零放宽：
   - 任何既有测试的断言删除、`skip`、`todo`、条件弱化、期望值放宽都算 fail；
   - 因新契约必须调整的既有 v2/v3 夹具（例如没有 flow `role-cards` 步骤的用例）只能补足新契约所需的夹具与**更强**断言，并逐条在变更包/角色报告中说明理由；不得删减原有断言。legacy 用例不得改动断言。
   - 以 `git diff` 核对测试文件的断言变化。

**最低证据：**

- legacy 测试的原始输出（与实施前基线同一命令）；
- 旧文案原文与新的 v2/v3 文案原文；
- flow/账本/记录目录快照（legacy 无新记录）；
- v2/v3 缺步骤反馈的原始输出与补齐后的推进输出；
- 测试文件 diff 与断言变化说明；
- 候选哈希。

**判定规则：**

- **pass：** legacy 旧行为/旧文案/旧最低校验逐字保留；v2/v3 缺步骤按方案反馈；现有测试无放宽。
- **fail：** legacy 文案或派发行为改变；legacy 写验证记录/新账本种类；v2/v3 缺步骤仍派 readiness；删除/放宽既有断言；把旧测试改成只跑新路径。
- **insufficient evidence：** 只跑新测试；没有旧文案逐字对比；没有测试 diff；没有 legacy 原始输出。
- **not applicable：** 无；P9 整行不得 N/A。

#### 3.3.10 P10 目标项目只读复算

**标准（方案 §8.3、§10.5、Q8；意图记录第 5 条）：** 把 `ans-gateway` 的 flow/账本复制到临时夹具，运行新逻辑断言「旧 app→Convener 条目（entry 17 形态，无 `stepId`）不再挡、当前指纹可放行」；**不写目标项目**；**不声称目标项目已修复**。

**判定方法：**

1. 只读复制：把 `ans-gateway/docs/flows/ai-governance-pipeline.yaml`、`.ans/governance/ledger.jsonl` 以及目标角色六文件（或能等价复算指纹的只读快照）复制到系统临时根；记录源文件 SHA-256 与复制时间。**不得**在目标项目内创建/修改任何文件（包括 `.ans/governance/role-cards/**`、flow、账本、角色卡）。
2. 在临时夹具上运行新逻辑：
   - 断言旧 app→Convener 条目（appointment 之后、Crew 写卡之前、无 `stepId`）**不再被当作** readiness 已派发；
   - 断言当前指纹（目标角色六文件 + 团队计划 + schema）可被计算并通过校验；合格后 `role-cards` 从 dispatched 补 done（artifact kind，补 evidence ref 指向 `.ans` 记录），readiness 派发按方案执行；
   - 若目标的 `role-readiness` 已 done（当前流文件为 done；意图记录快照写 delivered），消息文案按 P5 明确不要重做；以实际复制内容为准。
   - 断言复算过程中不新增 `customer.decision`、不弹客户卡。
3. 零写入证明：复算前后目标文件 SHA-256 一致（flow、ledger、角色六文件；若目标目录有其它本任务可写路径，也应无新增）；记录目标目录中 `.ans/governance/role-cards/` 不存在或未变化；可用 `get-filehash`/`sha256sum` 快照对比。
4. 报告措辞：只能写「只读复算结果」；不得写「ans-gateway 已修复/已解锁/已验收」；不得把临时夹具结果当成目标项目现场状态。

**最低证据：**

- 复制清单与每个源文件 SHA-256（前后两份）；
- 临时夹具的 flow/账本/记录原文；
- 复算测试的原始命令、退出码、计数、失败原文；
- 旧条目不再挡、指纹放行的断言输出；
- 目标零写入的前后哈希对比；
- 候选哈希与复算环境。

**判定规则：**

- **pass：** 复制自目标、旧条目不挡、当前指纹可放行、目标零写入、报告措辞不越界。
- **fail：** 写目标项目；复制内容与目标不符；旧条目仍挡；把复算说成目标已修复；在目标目录生成记录/flow/账本。
- **insufficient evidence：** 只有代码阅读或合成账本而非目标复制；没有前后哈希；没有原始输出；复算与候选不对应。
- **not applicable：** 无；P10 整行不得 N/A。

#### 3.3.11 P11 证据与 T3

**标准（方案 §8.3、§10；团队计划 §6；技能 `references/testing.md`）：** 候选哈希、原始命令/退出码/计数/失败原文、T3 全量（排除已知 `write-sequencing` 挂起）、`npm run typecheck`、真实 Electron `E2E_PASS`、目标项目只读复算；失败分类（既有 EPERM/桌面偶发/挂起/新增）；任一新增失败不得放行；T3 证据不得用 N/A 掩盖。

**判定方法：**

1. 候选身份：`git rev-parse HEAD`、每个产品改动文件的 `git hash-object` + `sha256sum`、`git status --short`、`git diff --name-only`/`--stat`/`--cached`；与变更包逐项对照；候选冻结。
2. 定向测试：`node --test test/编排/flow-service.test.ts`、`node --test test/桌面应用/interface.test.ts`（条件 `acceptance-dispatch.test.ts`）、`node --test "test/测试/governance-e2e-auto/*.test.ts"`；每条记录命令、cwd、时间、执行者、环境、退出码、计数、失败原文。
3. T3 全量：`node --test "test/**/*.test.ts"`（排除 `test/pi-adapter/write-sequencing.test.ts` 并记录排除方式）对当前候选执行；与实施前基线逐项对照；本次新增失败为零；既有失败按 §2.4 分类并附基线原文。
4. `npm run typecheck` 通过；`typecheck:renderer` 默认 N/A（理由：不改渲染层产品代码），若共享契约影响渲染层类型则补跑并记录。
5. 真实 Electron：`node_modules/.bin/electron test/桌面应用/e2e/main.mjs`；记录命令、时间、退出码、OUTDIR、`E2E_PASS=` 原始行、`E2E_FAILURES=`（若有）、`E2E_DONE=1`；`E2E_PASS` 必须为 true；不得修改该文件换取通过。
6. 目标只读复算与 e2e 全链路按 P10/P1 执行并附原始输出。
7. 失败分类完整：既有 EPERM、桌面并发/时序偶发（隔离/整文件/串行复跑）、`write-sequencing` 挂起、新增失败；不能笼统写「环境问题」。
8. 证据可复算：哈希、命令、计数与原始输出能由验收只读复算；不得伪造/截断关键输出。

**最低证据：**

- 变更包、候选哈希清单、`git` 原始输出；
- 全部定向测试与 T3 全量的原始输出、计数、失败原文、基线对照表；
- `npm run typecheck` 输出；`typecheck:renderer` 的 N/A 理由或补跑输出；
- Electron 报告原文（含 `E2E_PASS`/`E2E_DONE`）与截图/报告路径；
- 目标复算与 e2e 原始输出；
- 失败分类清单与既有失败基线证据。

**判定规则：**

- **pass：** 所有必需检查对当前候选实际执行、原始输出完整；T3 无新增失败；Electron `E2E_PASS=true`；目标复算完成且零写入；失败分类完整。
- **fail：** 任一必需检查缺失/被跳过/跑在另一候选；T3 有新增失败；Electron `E2E_PASS` 缺失或 false；证据伪造/截断；用 N/A 跳过全量回归/Electron/目标复算。
- **insufficient evidence：** 证据不完整但尚不能确定失败（如环境不可用、基线不可得、原始输出缺失）；按缺失项列出补证责任。
- **not applicable：** 仅允许 `typecheck:renderer`（不改渲染层且共享契约不影响渲染层类型）这一子项 N/A 并写明理由；P11 整行不得 N/A，全量回归/Electron/目标复算永不 N/A。

#### 3.3.12 P12 文档状态

**标准（技能 `references/documentation.md`、`references/acceptance-role.md`；团队计划 §6.1/§七；方案 §12）：** 实施前标准先于实施；实现完成写 `implemented-unverified`；未验收不写 `verified`；标准与报告分开；不与 i18n/目录 v3 合并判定；不把计划写成结果，不声称已提交/推送/发布。

**判定方法：**

1. 顺序：本文件 v1 的写盘时间/哈希在变更包与统筹记录中先于实施开始（S2 → S3/S4）；实现后的角色文档/报告不得显示标准是在实施后为适配候选补写的。以文件哈希、S2/S3 记录、变更包登记相互核对；时间戳只作辅证。
2. 状态：实现完成但未验收时，本变更相关角色文档状态为 `implemented-unverified`；不得出现 `verified`、`已验收`、`验收通过` 等字样（除非引用本变更报告的正式结论，且报告已按标准判定）。
3. 报告分离：`docs/acceptance/governance-advance-redispatch-report-v1.md` 另写；本文件不是报告；报告首行五项（档位、判定依据、选定检查、复用证据、全量回归）齐全；报告结论只对当前候选有效。
4. 独立性：本变更的候选、标准、报告、变更包与 i18n、目录 v3 全部分开；不得引用它们的通过结论替代本变更证据，也不得把本变更结论写成对它们的背书。
5. 不越界：不得声称已提交、推送、合并、发布；不得把临时夹具/目标复算说成目标项目已修复。

**最低证据：**

- 本文件哈希与写盘记录；变更包/S2 记录中的标准版本与顺序；
- 角色文档状态摘录（`implemented-unverified`）；
- 报告路径与首行五项；
- 候选隔离说明与 `git status`/diff；
- 报告中的结论措辞。

**判定规则：**

- **pass：** 标准先于实施、状态如实、报告分离且首行五项齐全、独立性/不越界措辞正确。
- **fail：** 实施后才写标准或按候选修改标准；未验收写 `verified`；报告缺失/与本文件混写；与 i18n/目录 v3 合并结论；声称已提交/推送/发布或目标已修复。
- **insufficient evidence：** 无法建立标准先于实施的顺序；角色文档状态缺失；报告未产生（若实施未完成，按「尚未到判定阶段」处理，不记 fail）。
- **not applicable：** 无；P12 整行不得 N/A。

### 3.4 G1 / G2 流程核对行（非新增产品需求）

**G1 变更包与候选身份：**

- 变更包路径：`docs/scheduling/governance-advance-redispatch-change-v1.md`（统筹写；团队计划 §4.4/S6）。
- 至少含：任务 ID、产品 flowId、候选哈希（每个产品改动文件 `git hash-object` + `sha256sum`）、`git rev-parse HEAD`、改动路径、任务节点 S1–S6、证据链接、风险档位 **T3**、复用证据与失效说明、标准版本/哈希。
- 判定：变更包与只读复算一致、候选可复算、管理记录不混入产品候选。缺项 → `insufficient evidence`；候选与证据不符 → `insufficient evidence`；把 `docs/` 管理记录当产品哈希 → `fail`。

**G2 写集与授权：**

- 所有改动路径在团队计划 §4.1–§4.3 的逐角色写集内；`test/桌面应用/` 不得新建文件；`test/桌面应用/e2e/main.mjs` 不在写集；`app/main.ts`、`app/preload.cjs`、`app/renderer/**`、`src/model/**`、`src/common/shared/**`、枚举/权限模型、构建配置不改（除非另有闸门 2 确认；本任务默认不改）。
- 唯一允许的 `角色卡/**` 改动是闸门 2 授权的人事 `flow-state.ts` 文档对齐（`boundary.md` 一行 + `changelog.md` 记录）；其它角色卡/边界改动 → `fail`。
- `git diff --cached --name-only` 为空（不暂存）；无提交/推送/合并/发布；worker 未写顶层 `docs/scheduling/`、`docs/acceptance/`；测试证据写 `角色卡/测试/docs/`（若为产品 e2e，临时项目根在系统临时目录）。
- 判定：`git diff --name-only`/`--stat`/`status`/`--cached` 原文与团队计划对照；越界 → `fail`；无法区分既有 i18n/目录 v3 改动 → `insufficient evidence`。

### 3.5 不适用（N/A）规则

- **P1–P10、P12 不得整行 `not applicable`。** 本任务有代码/测试面与行为变化，必须逐行判定。
- **P11 只允许 `typecheck:renderer` 子项 N/A**（不改渲染层且共享契约不影响渲染层类型），并写明理由；T3 全量回归、真实 Electron、目标只读复算、`npm run typecheck` 永不 N/A。
- **P8 的人事对齐子项**若客户/统筹确认以 `boundary.yaml` 既有条目为授权依据且未改 `boundary.md`，可对该子项记 N/A + 记录依据；但权限/枚举/观察排除/角色工具面等检查仍须判定。
- 任何 N/A 必须写明依据；无法说明依据的 N/A 按 `insufficient evidence` 处理；N/A 不得算作 pass。

---

## 四、证据计划

### 4.1 候选与基线证据

判定时统筹/验收只读执行并保留原始输出：

- `git rev-parse HEAD`；
- `git status --short`；
- `git diff --name-only`；如暂存，另附 `git diff --cached --name-only`；
- `git diff --stat`；完整 `git diff`（至少覆盖全部本变更 hunk；过大时按文件分段，不可截断到无法核对）；
- 每个产品改动文件的 `git hash-object` 与 `sha256sum`（新增文件同）；
- 方案/团队计划/意图记录/本标准的 `sha256sum` + `git hash-object`；
- 实施前基线（S2）与最终候选的测试命令、退出码、cwd、时间、执行者、环境（Node/npm/OS/Shell）、测试计数、失败原文与分类。

### 4.2 测试命令（按仓库实际脚本；Node 不在 PATH 时记录完整路径）

1. `node --test test/编排/flow-service.test.ts`；
2. `node --test test/桌面应用/interface.test.ts`；
3. 条件：`node --test test/桌面应用/acceptance-dispatch.test.ts`（仅当触发面/去重断言受影响时；该文件为既有精确文件）；
4. `node --test "test/测试/governance-e2e-auto/*.test.ts"`（含新增全链路、旧账本/跨重启夹具、目标只读复算；如复算脚本为独立脚本，记录命令与输出文件）；
5. T3 全量：`node --test "test/**/*.test.ts"`，按 §2.4 排除 `test/pi-adapter/write-sequencing.test.ts` 并记录排除方式；
6. `npm run typecheck`；
7. `node_modules/.bin/electron test/桌面应用/e2e/main.mjs`（真实 Electron；记录 `ANS_E2E_PROJECT`/`ANS_E2E_OUTDIR` 与报告路径）。

### 4.3 夹具要求

- **桌面层**：使用 `test/桌面应用/interface.test.ts` 既有 harness（`makePostWriteHarness` 等）或同等注入，覆盖团队计划 + flow `role-cards`（artifact 与 dispatch 两种 kind）、旧账本形态、跨重启（两个 Interface 实例）、mtime-only、发送/账本失败注入、逆序 boundary、no-op 刷新与 10 次刷新防循环。
- **e2e**：使用 `test/测试/governance-e2e-auto/fixture.ts` 的临时项目根与脚本化 adapter；新增至少一条完整链路（错误写卡 → 反馈 → 内容变化的再次反馈 → 重写通过 → role-cards done → readiness 派发 → 同内容不重复 → 成功派发后内容变化的重写可再次进入）。不得批量改既有夹具；legacy 至少保留一条不变链路。
- **目标复算**：只读复制 `ans-gateway` 的 flow、ledger 与角色文件到系统临时根；夹具 ID/flowId 不覆盖本仓库既有管理记录；复制前后记录源哈希。
- 所有夹具必须使用独立临时根/端口/日志/输出目录；不共享可变项目根；不写目标项目。

### 4.4 真实 Electron

- 命令：`node_modules/.bin/electron test/桌面应用/e2e/main.mjs`（以仓库实际路径为准）。
- 必须记录：命令、时间、候选哈希、退出码、OUTDIR、报告/截图清单、包含 `E2E_PASS=true` 与 `E2E_DONE=1` 的原始输出；若有 `E2E_FAILURES` 原文保留。
- `E2E_PASS` 缺失、false、无法对应候选或通过修改 `main.mjs` 换取 → 不判 pass；环境不可用按 `insufficient evidence`。

### 4.5 目标项目只读复算

- 只读复制 `ans-gateway` 的 `docs/flows/ai-governance-pipeline.yaml`、`.ans/governance/ledger.jsonl` 与角色六文件到临时夹具；记录源文件 SHA-256（前/后）。
- 断言：旧 app→Convener（无 `stepId`）不挡；当前指纹可计算/通过；role-cards 补 done（artifact kind，evidence ref 指向 `.ans` 记录）；readiness 派发按方案；无 `customer.decision`、无客户卡。
- 目标零写入：前后哈希一致；目标 `.ans/governance/role-cards/` 无新增；不得在目标根执行任何写命令。
- 报告措辞只写「只读复算」，不写「目标项目已修复/已解锁」。

### 4.6 变更包（统筹提交）

路径：`docs/scheduling/governance-advance-redispatch-change-v1.md`。至少含 G1 所列内容；证据链接指向原始日志/哈希；声明本变更候选与 i18n/目录 v3 的隔离；声明 T3 与全量回归执行情况；列出未解决问题与需要沟通/统筹澄清事项。

### 4.7 禁止事项

- 无 `.ans/project.json`、未启用 task_ops：不伪造任务令牌、锁、审批、机器预检或调度机器日志；
- 不伪造测试输出、哈希、Electron `E2E_PASS`、目标复算结果或客户确认；
- 不修改目标项目；不提交/推送/合并/发布；
- 不为通过而删除/放宽测试断言、跳过检查、把失败写成环境问题；
- 不在本文件写验收结论或报告。

---

## 五、判定规则与总体结论

### 5.1 每行验收判断

| 判断 | 含义 | 本任务示例 |
| --- | --- | --- |
| **pass** | 该行标准已被当前候选满足；证据原始、对应当前候选、覆盖标准。 | 两轮重写闭环通过；指纹 mtime-only 不触发；跨重启 A/B/C 正确；artifact/dispatch 证据可核对；readiness 恰一次；刷新合窗/防自激；逆序通过；目标零写入；T3 无新增失败；Electron `E2E_PASS=true`。 |
| **fail** | 已有证据表明候选不满足该行标准，或候选包含明确不允许的改动。 | 永久键仍挡重写；同内容重复派发；内容变化不重新校验；不合格仍派 Convener/写 flow/弹客户卡/写 customer.decision；role-cards 覆盖终态；旧文案改变；新增写权/枚举；写目标项目；T3 新增失败；`E2E_PASS=false`；测试断言被放宽。 |
| **insufficient evidence** | 尚不能判断：证据缺失、输出不完整、候选/版本不符、基线不可得、命令无法复算、报告未产生等。 | 没有两轮重写输出；没有跨重启实例；没有账本/记录原文；没有 `emitProjectChanged` 计数；目标复算只有代码阅读；Electron 缺原始输出；报告首行缺项。 |
| **not applicable** | 该行/子项确实不适用于本任务/分支，且写明依据。 | 仅 §3.5 允许的 `typecheck:renderer`/人事对齐子项；P1–P10、P12 不得整行 N/A；N/A 不算 pass。 |

### 5.2 总体结论

- **通过：** P1–P12 全部适用行 pass（含 G1/G2）；候选哈希与证据一致；T3 全量回归对当前候选执行且无本次新增失败；真实 Electron `E2E_PASS=true`；目标只读复算零写入；报告首行五项齐全。
- **返工：** 任一行 fail。列出差异、依据和应回到的所有者（编排、桌面窗口、测试、统筹/人事），由统筹安排修复与复测；验收不代改。
- **证据不足：** 没有 fail，但任一行 insufficient evidence。列出缺什么、由谁补，不能记通过。
- 若同时存在 fail 与 insufficient evidence：总体结论按**返工**，同时列出待补证据，避免修复后重复缺证。
- 结论只对当前候选有效；候选变化后按 §2.3 重新判断受影响部分。通过只表示当前候选满足本标准 v1，**不授权提交、推送、合并、发布或任何对外操作**。

### 5.3 报告要求

- 报告路径：`docs/acceptance/governance-advance-redispatch-report-v1.md`（独立验收写，不由统筹代写；本文件不是报告）。
- 报告**首行**五项：`风险档位：T3｜判定依据：…｜选定检查：…｜复用证据：…（来源/候选/仍有效理由，或「无」）｜全量回归：已执行 / N/A + 理由`；本任务全量回归应写「已执行」，不得写 N/A。
- 报告须链接：任务/阶段、客户确认的方案版本（路径 + 哈希）、本标准版本与判定时计算的哈希、候选哈希、变更包、原始证据路径/哈希、未解决问题、结论理由。
- 报告须包含完整验收表（P1–P12 + G1/G2），逐行填实际证据、结果、验收判断；不得只写「已完成」或「通过」而无表。
- 报告不得与 i18n/目录 v3 合并结论；不得声称目标项目已修复。

---

## 六、判定时的只读检查步骤

验收判定时按以下顺序执行，只读，不改产品代码、测试、角色卡、边界、方案、团队计划、沟通记录、调度记录或目标项目：

1. **核对基线：** 读取沟通记录闸门 0/1/2 与实施授权；核对方案、团队计划、意图记录哈希与 §1.4 一致；确认方案 v1 是客户确认版本。若基线文档变化，按 §2.5/§2.3 处理。
2. **核对候选身份与变更包：** 复算 HEAD、各产品文件 `git hash-object`/`sha256sum`、`status`/`diff --name-only`/`--stat`/`--cached`；与变更包对照；确认候选冻结、i18n/目录 v3 工作树改动被隔离。
3. **核对档位：** 确认变更包为 T3，档位与改动相符；不相符时退回统筹或按更高档补证；验收可升档，不能降档。
4. **核对写集（G2）：** 将改动路径与团队计划 §4.1–§4.3 对照；确认无越界、`test/桌面应用/` 未新建、`main.mjs` 未改、人事对齐仅授权条目、无提交/推送/发布。
5. **核对 P1–P3：** 读两轮重写闭环、三类触发、同内容/内容变化、mtime-only、负例反馈与 flow/账本/客户卡证据；核对指纹记录与计数。
6. **核对 P4–P5：** 读 `flow-service.test.ts`/桌面集成输出、记录 JSON、`artifact.observed`、flow done、readiness 消息/账本计数、两种 kind、stale/终态/越界、旧文案逐字对比。
7. **核对 P6–P7：** 读仅刷新场景、合窗/防自激计数、`emitProjectChanged` 计数、探针诊断、逆序 boundary 正/负例。
8. **核对 P8–P9：** 读 diff/枚举/角色工具面/观察排除；读 legacy 原样测试、v2/v3 缺步骤反馈、测试断言 diff（零放宽）。
9. **核对 P10：** 复算目标复制与零写入证明；读旧条目不挡/指纹放行输出；核对报告措辞不越界。
10. **核对 P11–P12：** 对照基线与最终候选的 T3 原始输出、Electron `E2E_PASS`、typecheck、失败分类；核对标准先于实施、文档状态 `implemented-unverified`、报告分离与独立性。
11. **填写验收表并给结论：** 按 §5 逐行填 pass/fail/insufficient evidence/not applicable；写报告，首行五项，链接证据与未解决问题；报告只对当前候选有效。

---

## 七、与现有测试/代码事实的已知对照与冲突（只报告，不改）

以下为标准写盘时的只读核对结果；判定时若实施已按方案调整，以当前候选与测试输出为准。本节不构成对实现的豁免或放宽。本节 `path:line` 只用于定位，实施/判定时以测试标题、文件路径与符号名为准；行号漂移不改变标准。

1. **既有 v2 桌面用例没有 flow `role-cards` 步骤，却期望 readiness 派发。** `test/桌面应用/interface.test.ts:2536–2619`（「任命→Crew 写卡主路径…通过后才派 Convener 做 role-readiness」）、`:2939–2999`（会话立即释放用例）、`:4621–4655`（existing 只做最低检查仍派 readiness）、`:4746–4786`（v2 团队计划覆盖通过派 readiness）、`:4840–4889`（existing 未覆盖只 warning 仍派 readiness）等同一模式的用例都使用 `writeTeamPlanFile`/`writeTeamPlanV2File`（团队计划存在），但没有写入含 `role-cards` 步骤的 `docs/flows/<flowId>.yaml`，却期望 Convener 收到 readiness 任务。按方案 §A4.2/A5，团队计划存在但 flow 缺 `role-cards` 步骤时应视为 flow 缺陷、反馈 Convener、**不派 readiness**；这些既有用例的期望与此冲突。实施方需在授权的既有测试文件中补足 flow 夹具与新契约断言（只能加强、不能放宽），或由统筹/策划确认「flow 文件缺失」与「flow 缺步骤」的精确处理并记录；本标准不替其决定。legacy（无团队计划）用例不受此影响。建议统筹在 S3/S4 前逐条列出受影响的 v2/v3 用例清单并确认处理方式。
2. **既有 e2e 的「Crew 修正后重新写卡」不覆盖永久键场景。** `test/测试/governance-e2e-auto/l-crew-write-validation.test.ts:214–262` 的首轮校验失败从未成功派发 Convener，因此不能证明「已有成功派发后，重写仍能重新进入」；P1 要求新增「成功派发后再重写」的闭环用例，不能以该用例替代。
3. **没有既有逆序 boundary 回归测试。** 检索 `test/桌面应用/interface.test.ts` 与 `test/测试/governance-e2e-auto/` 未发现「逆序/顺序无关」用例；P7 要求新增，现有解析器的 Set 成员判断只能说明实现事实，不能替代测试证据。
4. **当前写卡后检查无条件 `emitProjectChanged`。** `app/desktop/interface.ts:3229–3233` 在每次检查刷新后调用；方案 §A1/§10.3 要求只在 listing 签名变化或实际反馈/派发/完成动作时触发。既有 `:4179–4185` 的「强制刷新后 emitProjectChanged」与新逻辑兼容（派发是实际动作），但防自激/无操作不触发需要新增测试。
5. **目标项目快照与意图记录存在一处状态差异。** 意图记录现场写 `role-readiness: delivered`，标准写盘时目标 flow 实际为 `role-readiness: done`、`role-cards: dispatched`（artifact、无 evidence.ref）；方案 §2.1 也记为 done。P10 夹具必须以**实际复制内容**为准并记录复制时哈希，不能假设某一状态；复算结果也不等于目标项目已修复。
6. **`completeAcceptanceStep` 的客户接受门禁不能照搬到 role-cards。** `src/common/编排/flow-service.ts:695–710` 要求 `customer.decision{decisionKind:"acceptance", customerDecision:"accepted"}`；`completeRoleCardsStep` 只记录结构校验结果，若复制该门禁会导致 role-cards 永远无法完成并违反方案 §A5/§6（不伪造客户决定）。实施时需保持两者语义分离；判定以 P4 的行为证据为准。
7. **`observeFlowArtifacts` 跳过 `.ans` 与 `角色卡`。** `OBSERVE_SKIP_SEGMENTS`（`flow-service.ts:735`）含 `.ans`，所以 `.ans/governance/role-cards/<flowId>/<fingerprint>.json` 不能被 `observeFlowArtifacts` 观察；方案 §A5 要求 `completeRoleCardsStep` 自己追加 `artifact.observed(power=app)`。判定时须看到该条目，不能以 `observeFlowArtifacts` 的输出替代。
8. **旧文案基线应取 S4 入口的冻结工作树，不是 HEAD。** `app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`test/桌面应用/interface.test.ts` 等工作树已有 i18n B0/B3、目录 v3 的既有改动（团队计划 §1.4/§5.2）。P5/P9 的「旧调用文案逐字不变」必须对照 S4 入口记录的基线快照（同候选、同共享文件冻结状态），不能用 HEAD 或其它候选的字符串；否则会把 i18n/目录 v3 的改动误判为本变更改动。
9. **运行期去重集合是进程内 Set。** `postWriteAdvanceDispatched` / `applicationDispatchCommitted` 成功后不清理；方案 §A2 要求版本化键并在新键出现时清理旧键、失败释放占位。判定 P2 时以多次内容变化仍能派发/反馈、失败后可重试的行为证据为准；仅看到「Set 还在」的代码阅读不算证据。
10. **`test/桌面应用/` 逐文件授权。** 该目录不得新建文件；新断言只能并入 `interface.test.ts` 与（条件）`acceptance-dispatch.test.ts`。P1/P5/P6 的桌面测试若需要新 helper，应放在既有文件内；e2e 新用例放在 `test/测试/governance-e2e-auto/`。这与团队计划 §4.2/§4.5 一致，不属于冲突，但影响证据位置。
11. **`completeRoleCardsStep` 的公共出口尚未存在。** 当前 `src/pipeline/orchestration/flow-state.ts:21–24` 只导出 `completeAcceptanceStep` / `observeFlowArtifacts`；方案 §A5 要求新增再导出。判定时以公共出口的实际导出与桌面消费行为为准，不以源码阅读替代。

---

## 八、需要沟通/统筹澄清的问题

1. **目标项目 `role-readiness` 状态差异：** 意图记录写 `delivered`，标准写盘时目标 flow 为 `done`。请统筹在复算前记录实际复制内容与哈希；若客户/桌面在期间操作了目标项目，复算以其当时复制为准，不按旧快照判定。
2. **既有 v2/v3 桌面测试的契约调整：** 第 §七.1 条涉及的同一模式用例（至少 `interface.test.ts:2536`、`:2939`、`:4621`、`:4746`、`:4840`）需要补 flow `role-cards` 步骤夹具或由策划确认缺 flow 的处理；请统筹在 S4 前逐条列出清单、明确由桌面窗口在其授权文件内调整，且不得放宽断言。若客户/策划认为缺 flow 文件应保持旧派发而非反馈 Convener，需在实施前记录依据并重核本标准 P5/P9。
3. **「旧文案逐字不变」的基线版本：** 共享文件已有 i18n/目录 v3 改动；请统筹在 S4 入口记录 `governance-advance.ts`/`interface.ts`/`interface.test.ts` 的基线哈希与冻结状态，作为 P5/P9 逐字对比的基准；候选只含本变更 hunk。
4. **Node 不在当前验收 shell 的 PATH：** 取证环境需按团队计划 §1.4 导入 PATH 并记录 Node/npm 实际版本与完整路径；若命令不可执行，按 `insufficient evidence`，不能写成通过。
5. **无 task_ops：** 本任务不建立 `.ans/project.json`、不伪造任务令牌/锁/审批/机器预检；证据以文件、原始输出与哈希为准。若统筹启用 task_ops，须先更新计划/闸门记录，本标准不据此判定。
6. **目标项目零写入的核对方式：** 建议测试角色在复制前后对 flow、ledger、7 个角色六文件做 SHA-256 清单，并核对目标 `.ans/governance/role-cards/` 不存在或未变化；若目标目录在复算期间被客户/桌面操作，记录时间与差异，不能把客户操作误算为本任务写入。
7. **验收报告与 i18n/目录 v3 的隔离：** 报告只能引用本变更候选与证据；若需要引用共享文件的基线，只引用 S4 冻结哈希，不引用 i18n/目录 v3 的验收结论。
8. **人事边界对齐的记录：** `角色卡/编排/boundary.md` 的 `flow-state.ts` 行已在工作树补登；请统筹在变更包中登记该改动属于闸门 2 授权的人事对齐（非产品候选、非扩权），并确认 `boundary.yaml` 未被重复修改。

---

## 九、不得据此扩张的事项

- 本文件不扩张任何角色的文件写权；独立验收只写 `docs/acceptance/`。
- 本文件不授权修改产品代码、测试、角色卡、边界、工程法案、方案、团队计划、沟通记录、调度记录或目标项目。
- 本文件不授权提交、推送、合并、发布或任何对外操作。
- 本文件不是客户确认记录，也不是验收结论；客户确认仍以 `docs/communication/` 的记录为准。
- 实施者不得把「标准已写」「团队计划已确认」「工具成功」「测试通过」当成验收通过或客户确认。
- 本文件不改变闸门 0/1/2 的确认对象和版本；方案实质变更重开闸门 1，角色指派/写集变更重开闸门 2，意图变更重开闸门 0。
- 本文件不改变 T3 档位；任何试图把治理变更降为 T0/T1/T2、或用 N/A 跳过 T3 全量/真实 Electron/目标复算的做法，按 `fail` 处理。
