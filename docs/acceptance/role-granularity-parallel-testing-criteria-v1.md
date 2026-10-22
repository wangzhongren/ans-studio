# 验收完成标准：角色粒度（bounded context）与 MapReduce 并行测试

- 任务 ID：`2026-10-22-role-granularity-parallel-testing`
- 产品 flowId：`role-granularity-parallel-testing`
- 标准版本：`role-granularity-parallel-testing-criteria-v1`（本文件写盘后冻结）
- 阶段：**实施前完成标准**（只建立标准；本文件不判定候选、不实施）
- 风险档位：**T3（治理/权限/流程设计变更）**
- 验收基线：客户在**闸门 1** 确认的策划方案 v1（`docs/planning/2026-10-22_design_role-granularity-parallel-testing.md`，2026-10-22；§13 Q1–Q12 推荐 A）
- 上位依据：客户在**闸门 0** 确认的意图记录（`docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md`）
- 范围/写集输入：客户在**闸门 2** 确认的团队计划（`docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md`）；**只作范围与写集依据，不是标准来源**
- 候选版本：待统筹提交，以产品候选哈希标识（见变更包）
- 结论：**待判定**（本文件不构成通过、返工或证据不足结论）
- 写盘日期：2026-10-22

---

## 一、基线、输入性质与范围

### 1.1 验收基线与确认记录

| 闸门/输入 | 状态 | 记录 | 本轮作用 |
| --- | --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-10-22，客户明确指令「按照这个思路去修改」） | `docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md` | 上位依据：按 bounded context / 模块建角色、吸收微服务经验、MapReduce 并行测试、模块化；第 2/4 项、角色 id/显示名/路径、工程基线文本等非目标不得扩大 |
| 闸门 1：方案确认 | 已确认（2026-10-22，客户选择「确认，按推荐项」） | 同上文件「闸门 1 确认记录」；对象为策划方案 v1 | **验收基线**：方案 §11 P1–P12、§13 Q1–Q12 推荐 A、§2.3 范围、§12 非目标 |
| 闸门 2：角色指派/写集确认 | 已确认（2026-10-22，客户选择「确认并授权实施」） | 团队计划 §八；确认记录见 `docs/communication/` 意图文件「闸门 2 确认与实施授权记录」 | 只用于核对参与角色、逐角色写集、阶段顺序、证据安排；**不是标准来源** |
| 实施授权 | 已记录（2026-10-22，客户明确「确认并授权实施」） | 同上「闸门 2 确认与实施授权记录」 | 允许按团队计划实施；不等于验收通过、提交、推送、合并或发布授权 |

**方案文件状态头说明：** 策划方案文件头与 §2.1 表格仍写「草案 v1（待闸门 1 方案确认）」「闸门 1：待确认」，与沟通的闸门 1 确认记录不一致。团队计划 §2.2 已记录该已知不一致。本标准以 `docs/communication/` 的闸门 1 确认记录为授权事实，不改写方案文件；实施与验收引用方案正文的版本与内容，不把过期状态头当成未确认。

### 1.2 输入性质与来源纪律

1. **方案 §11 P1–P12 是直接标准来源。** 本标准把 P1–P12 逐项展开为可核对口径；展开内容取自方案正文对应章节（§4–§8、§10–§13），不新增产品需求，不放宽或加严方案实质。
2. **P13、P14 是方案正文已确认要求的补充行，不是新需求。** P13 来自方案 §4.4、§5.4.2、§9.1 的 Convener/Crew 卡文本同步要求；P14 来自客户在闸门 1 已确认的 §13 Q9 推荐 A（单一团队计划解析器）。两者都不得被用来增加方案之外的产品行为。
3. **团队计划不是标准来源。** 团队计划只用于确认参与角色、逐角色写集、阶段顺序与证据安排。团队计划中的建议正文、角色分工或措辞不得被用来增加、放宽或加严本标准；与方案冲突时，以客户确认的方案 v1 为准。
4. **闸门 0 意图记录是上位依据。** 第 2、4 项及与本轮无关的差异是明确非目标；不得借实施顺手扩大。
5. **§13 Q1–Q12 推荐 A 已随闸门 1「按推荐项」纳入范围。** 本标准在 §4.1.2 给出逐项映射；未选的备选分支（如 Q3 B/C、Q9 B）不是本轮要求，也不得被实施者用来替代已确认的推荐 A。
6. **G1/G2 是验收流程与写集核对，不是新增产品需求。** 它们来自技能 `references/acceptance-role.md`、`references/evidence.md`、`references/testing.md` 对候选身份、变更包与变更授权的要求，以及闸门 2 已确认的写集；用于核对候选和证据，不改变产品行为标准。
7. **标准冲突处理。** 本文件不得弱于方案 §11。若发现本文件与方案 §11 实质不一致，按 §3.5 的标准版本变更流程处理，不擅自按本文件判定，也不得用本文件放宽方案标准。

### 1.3 交付范围、写集与明确非目标

**本轮必须覆盖的产品面（方案 §9.1/§9.2）：**

- **运行时核心（Model）**：`src/model/runtime.ts` 的 `FlowToolStepView`/`FlowToolStep`/`FlowToolView`/`FlowStepSupersedeFn` 可选 `parallelGroup`/`dependsOn` 字段；`GovernanceJudgeFacts` 的可选 `teamPlanSchema`/模块摘要（如实施需要）；`GovernanceJudgeRequest`/`Context.artifacts` 沿用 `teamPlanPath`，不新增 evidence artifact kind；`GovernanceStepKind`/`cardKind`/`GovernancePower`/`GovernanceDecisionKind` 值不变。`src/provider/runtime/{tools,schema}.ts` 默认不改。
- **门禁引擎**：`src/common/门禁引擎/governance-roles.ts` 的 `CONVENER_CARD_TEXT`、`NOMINATOR_CARD_TEXT`（必改）；`VERIFIER_CARD_TEXT` 可选补充；`BUILT_IN_GOVERNANCE_ROLES` entries/forbidden/preauthorized 与 `ENGINEERING_QUALITY_BASELINE` 不改。
- **编排**：新增 `src/common/编排/team-plan.ts`（推荐/已确认 Q9 A）；`src/common/编排/flow-state.ts`、`flow-service.ts`、`governance-gate.ts`、`governance-judge-facts.ts`/`-evidence.ts`/`-prompt.ts`（可选）；`src/pipeline/orchestration/run-role.ts`、`govern-session.ts`。
- **桌面窗口**：`app/desktop/interface.ts`、`governance-advance.ts`、`customer-input.ts`（按需）；`app/renderer/src/chat/governance-view.ts`、`role-view.ts`（桌面UI，可选文案）。
- **测试**：方案 §9.2 列明的 `test/测试/governance-e2e-auto/*`、`test/编排/*`、`test/桌面应用/*` 既有精确文件、`test/门禁引擎/*`、`test/桌面UI/*`、`test/runtime-core/*`；新增文件限于各角色已授权目录。
- **角色自身文档**：各 worker 在自己角色目录内的 `api-spec.md`、`docs/change/`、`memo.md` 等，按团队计划 §4.3 的「自身文档」条目。

**管理记录（不是产品候选）：** 顶层 `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/`、`docs/verification/`。其中本任务的标准、报告、团队计划、变更包、沟通记录是验收的引用与证据载体，不混入产品候选。

**明确非目标（方案 §12、团队计划 §1.3）：**

- 第 2 项客户入口不唯一——不改。
- 第 4 项派发权分散——不改；本方案不新增或转移派发权；`ACTION_ROLE.dispatch` 仍是 `convener`。
- 角色内部 id、显示名、`GovernanceFunction` 值、路径（`liaison`/`rapporteur`/`nominator`/`convener`/`verifier`）——不改。
- 工程基线 `ENGINEERING_QUALITY_BASELINE` 文本与工程法案 §二.9 文本——不改。
- 不新增固定测试角色；不新增 `cardKind`、`FlowStepKind`、`GovernancePower`、`GovernanceDecisionKind`。
- 不引入纳米角色/函数级拆分；不把角色拆到按钮/端点级。
- 不删除、不重写历史 `docs/nominations/**`、旧 flow YAML、旧团队计划、既有角色卡。
- 不提交、不推送、不合并、不发布。

**写集核对口径：** 以团队计划 §4.3/§八 的逐角色精确写集为准。`test/桌面应用/` 对桌面窗口是逐文件授权，默认不得新建文件；若确需新文件，必须先由人事按闸门 2 补充精确单文件条目，否则属越界。顶层 `docs/scheduling/` 与 `docs/acceptance/` 只由内置统筹/验收写，worker 不得写。`docs/verification/` 是产品运行期证据根，不在本仓库测试角色 Section 1 内；本仓库执行时测试证据写 `角色卡/测试/docs/`，产品 e2e 只在临时项目根内生成 `docs/verification/`。

### 1.4 完成定义（高层）

当前产品候选同时满足以下条件，才可能判**通过**：

1. §4.2 验收表 P1–P14、G1–G2 全部适用行 pass；没有整行 `not applicable`。
2. 风险档位核对为 T3；适用的全量回归已对当前候选执行，并与实施前基线（N3）对照；无本次新增失败。
3. 真实启动应用/演示证据存在且对应当前候选；不能以单元测试或 mock 替代。
4. 候选身份可复算，变更包完整，所有改动在闸门 2 写集内。
5. 验收报告首行含风险档位、判定依据、选定检查、复用证据、全量回归五项；报告链接标准版本、候选、证据与未解决问题。
6. Map/Reduce 证据链完整：每个 Map 分片有独立原始日志/结果，Reduce manifest 合并全部分片并跑契约/集成/e2e；legacy v1 链路至少一条保持通过。

### 1.5 重要边界情形

以下情形至少构成 **fail**（有证据表明不满足标准）：

- 「前端/后端」等整层角色无 `粒度理由` 仍通过校验，或有理由但未经 readiness 例外即派发（P5）。
- 模块清单出现重复/孤儿/未声明模块，或 Reduce 角色被当作产品模块计入覆盖（P2）。
- 写集重叠、写集含通配符/散文/治理路径，或计划写集未被角色边界覆盖（V12）（P3）。
- `dependsOn` 成环、同 Map 组内互相依赖、Map 依赖 Reduce、Reduce 未覆盖全部 Map（P4）。
- 节点名仍是整层名/多模块且无理由即通过；或新建函数级/单文件/按钮/端点级纳米角色（P5）。
- 新增了 `FlowStepKind` 枚举值，或旧 flow 被破坏，或 `dependsOn` 前置未全部 `done` 仍允许派发（P6）。
- Reduce 前置未硬拦：Map 交付未 `done` 时 Reduce 步骤可被派发（P6/Q12 A）。
- 测试分片共享同一临时根/端口/日志/构建输出，或多个进程追加同一文件；一个分片失败阻塞全部独立分片；manifest 缺失（P7）。
- 复用过期证据、把治理变更压成 T0/T1、T3 全量回归未执行或用 N/A 掩盖、缺证据仍判 pass（P8/P11/P12）。
- 旧团队计划/旧 flow/旧角色卡被强制迁移、删除或重写；`existing` 角色被强制补齐完整清单（P9）。
- 顺手改了第 2/4 项、角色 id/显示名/路径、`GovernanceFunction`、工程基线文本或 §二.9 文本（P10/P12）。
- 新增固定测试角色、`cardKind`、`GovernancePower`、`GovernanceDecisionKind`，或扩大 `BUILT_IN_GOVERNANCE_ROLES` 写权（P10）。
- 团队计划 v2 仍由两份漂移解析器分别判定，或桌面直接 import 编排私有 `common`（Q9 A 未落地且无经确认的偏差记录）（P14）。
- 改动越出闸门 2 写集，或把 `docs/` 管理记录混入产品候选（G1/G2）。

以下情形构成 **insufficient evidence**（尚不能判断）：

- 候选哈希与变更包不符，或证据来自另一个候选/HEAD/工作树。
- 缺原始命令输出、退出码、环境、测试计数或失败原文；只有角色自述或「工具成功」。
- Map 分片日志/manifest 缺失、无法定位或无法对应候选；Reduce 合并结果无法复算。
- 全量回归未跑、基线 N3 缺失、既有失败没有基线对照。
- 真实启动/演示证据缺失、无法定位或无法对应候选。
- 报告首行缺五项，或标准/报告/方案版本无法核对。

---

## 二、写标准时的只读基线核对（2026-10-22）

本节记录验收写标准时的实测事实，供判定时对照；不是候选，也不构成实施。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| HEAD | `git rev-parse HEAD` | `64ed44a0ac6e75d647eadbeb3f35ae9f84625845` |
| 工作树 | `git status --short` | ` M docs/communication/memo.md`；` M docs/planning/memo.md`；`?? docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md`；`?? docs/planning/2026-10-22_design_role-granularity-parallel-testing.md`；`?? docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md` |
| 已跟踪 diff | `git diff --name-only` | `docs/communication/memo.md`、`docs/planning/memo.md`（管理记录，非产品候选） |
| 暂存区 | `git diff --cached --name-only` | 空 |
| 产品代码/测试改动 | `git status --short` 对照 | 无已跟踪代码/测试改动 |
| Node | 实际路径 `C:\Users\51054\AppData\Local\Programs\nodejs\node.exe` | v24.22.1 |
| npm | 同目录 `npm.cmd` | 11.19.1 |
| 平台/Shell | OS/环境 | Windows 11 Pro 10.0.26300；Git Bash |
| 仓库脚本 | `git show HEAD:package.json` | `typecheck` = `tsc --noEmit`；`typecheck:renderer` = `tsc -p app/renderer/tsconfig.json`；`build:renderer` = `vite build --config vite.config.ts`；`app` = `electron app/main.ts` |

**确认的基线文档哈希（写标准时工作区内容）：**

| 文件 | 角色 | `git hash-object` | `sha256sum` |
| --- | --- | --- | --- |
| `docs/planning/2026-10-22_design_role-granularity-parallel-testing.md` | 验收基线（方案 v1） | `a04e9106ef69d6efdfbb92affe91b5bd53c0fcde` | `38376e7cb3bbb5890febef311cfec30547f357361f6c124f49a6a83dd11fee83` |
| `docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md` | 闸门 0/1/2 与实施授权记录 | `b9f77b557425decc705ce4476fe02ad74ebd4943` | `f0a3d0a5b258df4917feb524117ed7c6528a11c62752556e7824c15f9b3e1b93` |
| `docs/scheduling/2026-10-22-role-granularity-parallel-testing-team-plan.md` | 闸门 2 确认的范围/写集（非标准来源） | `a4370085528f9fc78b2aad963100d5b99f98d9f0` | `73fabec537c920044ac063dffa16c097e9dd614efd48d52b91edb842b6420f07` |
| `角色卡/项目管理/docs/project-rules.md` | 工程法案（§二.9 风险档位要求） | `fdb738bb01035b9a270aaf5cbbcb89c6d1da2484` | `fdc5055906bcbb0f5d57d68cdaae05c4a27af1f13c7225374fbeda1a06ab3d9f` |

**环境与记录注意：**

- 验收当前 shell 中 `node` 不在 PATH；证据必须记录实际调用方式（完整路径或 worker 自己的 shell/PATH），不能只写「node 可用」。Node v24.22.1 满足 `package.json` 的 `engines: node >=23.6`。
- 本标准自身写入后，`git status --short` 会新增 `?? docs/acceptance/role-granularity-parallel-testing-criteria-v1.md`；这是管理记录，不是产品候选。
- 意图记录引用闸门 2 团队计划 hash `4fb701fc…`，与本标准写盘时实测的团队计划 `git hash-object` `a4370085…` / SHA-256 `73fabec5…` 不一致。团队计划只是范围/写集输入，不是标准来源；该差异作为管理记录追溯问题记录在 §九，判定时不据此改变标准，但统筹/沟通应先核对闸门 2 确认的是哪一版团队计划。
- 若判定时上述基线文档哈希变化，按 §3.3 处理；方案/意图/团队计划版本变化时，验收基线或范围依据失效，不能静默按旧版本判定。

---

## 三、候选身份与证据失效规则

### 3.1 候选身份

**产品候选**是判定时下列文件的精确内容：

- `src/**`、`app/**`、`test/**`；
- `角色卡/**`（含 `role-card.md`、`boundary.md`、`boundary.yaml`、`api-spec.md`、`feature-map.md`、`functional-description.md`、`memo.md`、`docs/**` 等角色自身文档）；本任务默认不改角色卡/边界，若出现必须按 G2 核对授权；
- 构建/配置文件中确属本任务授权范围的改动（本任务默认不改；若出现，按 G2 核对授权）。

候选身份用以下组合标识，缺一不可：

1. `git rev-parse HEAD`；
2. 每个产品改动文件的相对路径、`git hash-object`（Git blob SHA-1）与 `sha256sum`（文件 SHA-256）；
3. `git status --short`、`git diff --name-only`、`git diff --stat`、`git diff --cached --name-only` 原始输出；
4. 变更包声明的候选标识必须与上述复算一致；不一致时按 `insufficient evidence` 处理。

**管理记录不是产品候选：** 顶层 `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/`、`docs/verification/` 的文件哈希不用于标识产品候选，也不得把管理记录的变化说成产品改动。它们可以作为验收标准、变更包、证据链接的载体；若方案、标准或团队计划版本变化，按 §3.3 处理，而不是当作产品候选变化。

**候选冻结：** 统筹提交变更包并声明候选后，候选冻结。判定前任一产品文件内容变化（任一哈希变化），受影响证据失效，按 §3.3 重取；不得在变化后的候选上沿用旧证据。

### 3.2 证据原始性与复用

- **原始证据**指：原始命令输出（命令、cwd、时间、执行者、退出码、stdout/stderr）、测试计数（pass/fail/skip）、失败原文、候选文件哈希、diff/status、Map 分片原始日志、Reduce manifest、e2e/启动演示的日志或截图清单、账本/夹具输出。开发自述、测试转述、工具成功提示、计划文本都不能单独作为原始证据。
- **证据生成时间**必须晚于本标准写盘时间；早于标准的证据按流程不符处理（`insufficient evidence` 或退回统筹）。
- **复用规则：** 只有同候选、同输入/依赖、同命令、同环境的证据可以复用。复用须在报告「复用证据」栏写明来源、原候选、原命令和仍然有效的理由。候选、输入、依赖、契约、夹具、配置或环境变化时，受影响证据失效，只补失效部分；不能因为「别的角色跑过」就跳过必需检查。
- **Map 分片证据与 Reduce 证据分开核对：** 分片日志是原始证据，manifest 是索引，两者不能互相替代；测试角色的摘要不能替代分片原始输出。
- **T3 全量回归不是可复用项：** 必须对当前候选执行；基线 N3 只用于区分既有失败，不能替代最终候选的全量回归。

### 3.3 证据失效矩阵

| 证据生成后的变化 | 失效范围 | 处理 |
| --- | --- | --- |
| 任一 `src/**` 或 `app/**` 产品代码变化 | 受影响单测/层测试/集成/e2e；相关 Map 分片与 Reduce 证据；候选哈希；全量回归结论 | 重取受影响证据；候选变化后受影响分片和 Reduce 重跑；全量回归重新执行 |
| `src/model/runtime.ts` 等共享 Model 契约变化 | 所有引用该契约的下游测试、判断物证、类型检查、桌面消费、e2e | 契约冻结后重跑所有受影响调用方；旧证据全部失效；下游不得在冻结前引用新字段 |
| 任一 `test/**` 测试文件或共享夹具变化 | 该测试套件及其依赖的集成/e2e；相关分片；全量回归 | 重跑该套件与受影响链路；不得只重跑新增用例 |
| 团队计划解析/schema（`team-plan.ts`、`run-role.ts`、`interface.ts`）变化 | V1–V12、模块覆盖、写集/DAG、桌面写卡校验、相关分片/e2e | 重跑解析/校验正负例和桌面 e2e；卡前守卫与写卡后校验同源复验 |
| flow 可选字段/序列化/`evaluateDispatchGate` 变化 | flow-state/flow-service/gate 测试、Map/Reduce 派发证据、e2e | 重跑旧 flow 夹具与新字段正负例；旧 flow 逐字不变复验 |
| `角色卡/**`（role-card/boundary/角色文档）变化 | 治理卡文本、写权、readiness、e2e 中冻结角色卡的断言 | 重跑 `test/门禁引擎/`、`test/测试/` 相关 e2e；候选哈希重取；本任务默认不得改边界/角色卡 |
| 构建/配置（`package.json`、`tsconfig*.json`、`vite.config.ts` 等）变化 | 构建、typecheck、全量回归；候选范围 | 本任务默认不改；若出现，按 G2 核对授权并重跑受影响检查 |
| 顶层 `docs/` 管理记录变化 | **不直接影响产品候选**；若方案/标准/团队计划版本或确认记录变化，则影响验收基线/范围依据 | 方案实质变化重开闸门 1；标准变化按 §3.5；团队计划变化重核写集；确认记录变化补沟通确认 |
| HEAD 或基线 N3 变化 | 基线对照、既有失败分类、候选身份中的 HEAD | 重新建立基线；无法建立时 `insufficient evidence` |
| 环境变化（Node/npm/OS/Shell/依赖） | 受环境影响的全量回归、e2e、启动演示、分片日志 | 记录新环境并重跑受影响检查；不能把环境差异当成通过 |
| 证据文件被替换、丢失或无法追溯 | 对应验收行 | `insufficient evidence`，重取原始输出 |

### 3.4 T3 全量回归规则

本任务有代码/测试面（`src/common/门禁引擎`、`src/common/编排`、`src/pipeline/orchestration`、`src/model/runtime.ts`、`app/desktop` 和治理角色卡文本），T3 的适用全量回归**必须执行**，不能用 N/A 掩盖：

- 最终候选必须执行与仓库既有脚本对应的 T3 全量检查（方案 §11 P11 要求；具体命令以仓库实际脚本为准，团队计划 §6.3 只作执行安排参考）：
  - `node --test "test/**/*.test.ts"`
  - `npm run typecheck`
  - `npm run typecheck:renderer`
  - `npm run build:renderer`
- 实施前必须由测试角色在 N3 对当前 HEAD 跑同一组命令，记录基线计数、失败清单与分类；最终结果与基线逐项对照。
- 本次新增失败不得放行；既有失败（如 Windows symlink `EPERM`、桌面测试并发偶发）必须附基线原始输出与原因，不能笼统写「环境问题」。
- 并行全量出现桌面时序偶发时，必须以隔离/整文件/串行复跑分类；不得把新增红归为基线红，也不得用并行偶发掩盖真实失败。
- 任一命令无法运行、被跳过或未记录完整输出，按 `insufficient evidence` 处理，不得写成 pass。
- N/A 只允许用于「某项检查确实没有代码/测试面」的个别说明，且必须写明理由；不得用 N/A 跳过全量回归、e2e、Map 分片或真实启动/演示。
- 全量回归证据只对当前候选有效；候选变化后受影响部分失效并重跑。

### 3.5 标准版本冻结

- 本文件版本为 `role-granularity-parallel-testing-criteria-v1`，写盘后冻结。实施开始后不得为适配候选修改本标准。
- 若发现标准本身有误、与方案 §11 冲突或与闸门 0/1 确认范围不一致：记录问题、理由和受影响行，递增为 v2，交沟通/统筹确认后再用新版本判定；受影响证据重新核对，旧报告过期。
- 本标准是管理记录，不是客户确认记录，也不是验收结论；标准版本变化不自动改变方案或团队计划。

---

## 四、验收标准

### 4.1 标准来源映射

#### 4.1.1 意图/方案条目与覆盖行

| 意图/方案条目 | 覆盖行 | 说明 |
| --- | --- | --- |
| 角色粒度模型：一个角色 = 一个 bounded context / 模块或服务 | P1、P2、P5、P13 | P1 团队计划字段；P2 模块覆盖；P5 粒度/纳米/协调成本/readiness；P13 Crew 卡写 bounded context |
| 团队计划 schema v2：模块清单、角色表新列、写集、依赖、并行组 | P1–P4、P14 | P1 schema/兼容；P2 模块覆盖；P3 写集；P4 DAG/并行组；P14 单一解析器 |
| MapReduce 并行：团队计划/flow 标 Map/Reduce，测试按模块分片 | P6、P7、P8、P11 | P6 flow/gate；P7 分片/隔离/Reduce 合并；P8 证据复用/档位；P11 测试/全量回归 |
| 同步面：Convener/Crew 卡文本、flow、桌面、测试与验收文档 | P6、P7、P11、P13、P14 | P13 卡文本；P14 解析器；P6/P7/P11 行为与证据 |
| 兼容与迁移：旧计划/旧 flow/旧角色卡保持原行为 | P1、P9 | P1 legacy 分支；P9 迁移窗口/不重写 |
| 非目标：第 2/4 项、角色 id/显示名/路径、工程基线文本 | P10、P12 | P10 非目标；P12 §二.9/基线一致 |
| 候选、写集、证据流程 | G1、G2 | 技能验收要求与闸门 2 写集；不是新增产品需求 |

#### 4.1.2 §13 Q1–Q12 推荐 A 映射

| 问题 | 闸门 1 已选推荐 A | 覆盖行 |
| --- | --- | --- |
| Q1 模块粒度硬规则 | 默认一个模块一个角色、一个角色一个模块；多模块/整层例外必须写 `粒度理由` 并经 readiness 明确批准 | P1、P2、P5 |
| Q2 模块清单来源 | frontmatter `modules` + 正文模块清单表（职责/契约/架构来源）；readiness 对照客户确认的方案/架构章节 | P1、P2、P5 |
| Q3 并行组/依赖的 flow 表达 | 团队计划 v2 + flow step id/title + 可选 `parallelGroup`/`dependsOn`；不新增 `FlowStepKind`；dispatch 门禁检查前置 `done` | P6 |
| Q4 整层名/纳米启发式强度 | 通用层名/多模块无理由 → 硬拒；有理由 → readiness 例外；单文件/小写集只 warning | P5 |
| Q5 测试证据根与所有权 | 团队计划声明一个证据根（默认 `docs/verification/`），只归测试角色写；模块角色写自己的测试路径；分片日志/manifest 由测试角色写 | P7 |
| Q6 旧流程兼容窗口 | `teamPlanSchema: 2` 标记；旧计划/flow/卡保持原行为；新流程默认 v2；迁移不设硬截止 | P1、P9 |
| Q7 既有角色跨多模块 | 允许 `granularityRationale` + readiness 例外；下一次实质变更时再拆 | P5、P9 |
| Q8 Reduce 角色与测试角色 | 每个 v2 计划至少一个 Reduce 角色（通常是既有测试角色），拥有跨模块/e2e 测试面和证据根；不新增固定角色 | P2、P4、P10 |
| Q9 团队计划解析器 | 抽一个 `src/common/编排/team-plan.ts` 单一解析器，经 pipeline 公共出口给桌面；避免两份解析漂移 | P14 |
| Q10 语义粒度抽查 | 验收对本次新增/变更角色逐个核对模块/契约/测试面；旧计划只做 legacy 兼容检查 | P5、P9 |
| Q11 模块 id 形状 | ASCII slug（便于 `delivery-<module>` 映射），中文显示名放模块清单职责列 | P1、P2 |
| Q12 Reduce 前置执行强度 | dispatch 门禁硬检查 `dependsOn` 全部 `done`；flow 静态校验 Reduce 覆盖全部 Map | P6 |

#### 4.1.3 §11 P1–P12 与补充行

- **P1–P12 与方案 §11 的 P1–P12 一一对应**，行号不变；每行在方案标准基础上只展开方案正文已有的核对口径。
- **P13** 补充方案 §4.4、§5.4.2、§9.1 的 Convener/Crew 卡文本同步要求；它是方案 §11 P1/P5 的证据面细化，不是新需求。
- **P14** 补充客户在闸门 1 已确认的 §13 Q9 推荐 A（单一团队计划解析器）；不是新需求。
- **G1/G2** 是候选身份/变更包与闸门 2 写集核对，属于验收流程要求，不是产品行为标准。

### 4.2 验收表

下表是判定时使用的核心表格。实施前「实际证据路径/哈希」「候选版本」「结果」「验收判断」填「待提交/待判定」；判定时由独立验收按同一标准版本填入，不改变标准条文。

每行证据均须附：对应候选哈希、原始 `git status --short` / `git diff` 输出、产生该行结论的命令输出。涉及 flow、分片、e2e、验收链路的行还须附 Map 分片日志/manifest、e2e 或真实启动/演示证据；只有角色自述或「工具成功」不构成原始证据。

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | 团队计划 v2 schema（§11 P1；§5.1–§5.3；Q2/Q6/Q11 A）：frontmatter 含 flowId/version/riskTier/recommended（内联数组）/`teamPlanSchema: 2`/modules（内联数组、非空、无重复、ASCII slug `^[a-z][a-z0-9-]*$`、不含保留值 `reduce`）；正文模块清单表恰好覆盖 modules 集合（职责/公开契约/架构来源非空）；角色表含 roleId/类型/module/职责目标/能力要求/唯一写集/公开契约/测试面/依赖/dependsOn/并行组/组别/apiSpec/粒度理由（别名解析、同名列不得重复/歧义）；公开契约/测试面必填，Map 角色测试面至少一个测试路径，Reduce 角色测试面至少集成/e2e/装配检查之一，`internal`/`not-applicable` 需非空理由；无 `teamPlanSchema: 2` 的旧计划按 v1 校验并记迁移 warning，不被强制迁移。 | schema/解析器 diff；v2 团队计划样例（含模块清单/角色表）；legacy v1 计划通过测试与迁移 warning 测试；recommended/modules 内联数组解析测试；别名列/重复列负例；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、桌面窗口、门禁引擎、测试 | 待判定 | 待判定 |
| P2 | 模块覆盖（§11 P2；§5.2；Q8/Q11 A）：每个模块在角色表中恰好被一个 Map 角色覆盖；无重复/孤儿/未声明模块；Reduce 角色 module=reduce 且不计入模块覆盖计数；模块清单集合 = frontmatter `modules`；多模块仅用 `a+b` 过渡例外并写粒度理由；Map 角色 module 必须恰好一个模块 id（例外见 P5）。 | 模块覆盖正/负例测试（重复/孤儿/未声明/Reduce 计入）；模块清单样例；Reduce 角色样例；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、测试 | 待判定 | 待判定 |
| P3 | 写集不相交与边界覆盖（§11 P3；§5.4 V5/V12）：写集语法合法（精确路径/目录、分号分隔、目录以 `/` 结尾、无通配符/省略号/散文/`..`/绝对路径）；跨角色两两不相交（文件相等或目录前缀重叠都算重叠）；不得写 `.ans/`、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、`docs/flows/`、`docs/nominations/`、`角色卡/`；只读契约不算写集；V12：new/changed 角色边界覆盖计划写集，existing 既有边界也必须覆盖，不覆盖退回 Crew/Convener。 | 写集解析/重叠负例；治理路径负例；boundary 覆盖测试；`validateAppointmentArtifacts` 来源分流测试；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、桌面窗口、测试 | 待判定 | 待判定 |
| P4 | 依赖/并行组（§11 P4；§5.4 V7/V8）：dependsOn 目标必须是本计划角色行；无自依赖、无重复、无环（Kahn/DFS）；`依赖` 说明非空；并行组只能是 `map-<slug>` 或 `reduce`；产品模块角色必须是 `map-*`，module 为 `reduce` 的角色必须是 `reduce`；同一 `map-*` 组内角色之间不得有依赖路径；Map 角色不得依赖 Reduce 角色；每个 Reduce 角色的 dependsOn 必须直接或传递覆盖全部 Map 角色；Reduce 角色之间可顺序依赖，但不得被 Map 依赖。 | DAG/环/同组依赖/Map 依赖 Reduce/Reduce 未覆盖 Map 负例；计划样例；拓扑排序或 DFS 复算输出；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、测试 | 待判定 | 待判定 |
| P5 | 粒度与 readiness（§11 P5；§4.2–§4.5；§5.4 V9/V10；§5.4.2；Q1/Q4/Q7/Q10 A）：默认一个模块一个角色、一个角色一个模块；整层名（frontend/backend/web/server/client/ui/fullstack/all/common/shared/utils 等）或多模块 `a+b` 且无 `粒度理由` → 硬拒；有理由 → 标记 exception-review 并交 readiness 明确批准；模块清单「架构来源」为空/不可追溯 → 硬拒；单文件写集/极小模块 → warning 不硬拒，交 readiness 判断是否纳米；禁止函数级/单文件/按钮/端点级纳米角色；五维协调成本存在性检查（计划含五维/协调成本章节且非空）；Convener readiness 记录（`docs/scheduling/<flowId>-readiness-v1.md`，flowId/version/status 为 pass 或 gaps，逐角色 module/contract/testSurface/parallel/dependsOn/granularity 及证据）；gap 退回 Crew，计划缺细节退回 Convener；应用不调用 LLM 做语义判断、不宣称语义完成；验收对本次新增/变更角色逐个核对，旧计划只做 legacy 兼容检查。 | 粒度负例矩阵（整层名/多模块无理由/有理由例外/单文件 warning/纳米）；readiness 记录样例与列；Convener/Crew 卡文本断言；系统行文案；五维章节存在性测试；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 门禁引擎、编排、桌面窗口、测试、独立验收 | 待判定 | 待判定 |
| P6 | Map/Reduce flow 与 dispatch（§11 P6；§6.1/§6.2；Q3/Q12 A）：`FlowStateStep` 可选 `parallelGroup`/`dependsOn`；`STEP_KEYS` 严格（未知字段仍拒绝）；`FLOW_STEP_KINDS` 不变（仍 dispatch/customer-decision/artifact/acceptance，不新增）；旧 flow 不填字段行为逐字不变；静态校验：parallelGroup 语法、dependsOn 目标存在/无自依赖/无重复/无环、同一 `map-*` 组步骤无依赖路径、每个 reduce 步骤（dispatch/artifact，验收除外）有到所有 `map-*` dispatch 步骤的依赖路径、Map 步骤不依赖 Reduce、新契约 flow 的 Map 交付步骤依赖 `contract-freeze`；`evaluateDispatchGate` 对声明 `dependsOn` 的步骤要求前置全部 `status: done` 才允许派发，不改变派发权，旧步骤无 `dependsOn` 不新增检查；Reduce 前置硬拦。 | flow-state/flow-service/gate 测试；旧 flow 夹具；flow 样例（含 Map/Reduce 依赖）；前置未完成拒绝/完成后允许；同一 flowId+stepId 旧行为；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 运行时核心、编排、测试 | 待判定 | 待判定 |
| P7 | 测试分片与 Reduce 合并（§11 P7；§6.3/§6.6；Q5 A）：测试角色按模块分片并行；每分片独立临时项目根/端口/数据库命名空间/输出目录/日志文件；共享只读夹具 pin 哈希；不共享可变项目根/端口/DB/构建输出；不并发 `npm install`；每分片原始日志记录命令、环境、候选哈希、退出码、pass/fail/skip、失败原文；不得多进程追加同一文件；失败隔离（一个分片失败不阻塞其他独立分片，失败交模块 owner，修复后只重跑该分片和受影响下游）；Reduce 合并 `docs/verification/<flowId>/manifest.md`（或团队计划声明的证据根；含候选哈希、分片清单、命令、日志路径、结果、环境），然后跑契约/集成/e2e 和真实启动/演示；`verification-evidence` 步骤指向 manifest；证据根单一所有者（默认 `docs/verification/`，只归测试角色写；模块角色写自己的测试路径；若测试角色边界不含证据根，计划必须加写集或改用角色已有证据目录，不能写边界外）；测试角色不改模块代码。 | 测试任务文案；分片证据样例；隔离/并发测试；manifest 样例；证据根所有权/边界核对；失败隔离与只重跑记录；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 门禁引擎、编排、桌面窗口、测试 | 待判定 | 待判定 |
| P8 | 验收复用与档位（§11 P8；§6.4；testing.md）：同候选、同输入/依赖、同命令、同环境证据可复用；模块代码/测试/契约/夹具/配置变化 → 该分片和受影响 Reduce 证据失效，只补失效部分；档位按技能 `references/testing.md` 的 T0–T3；本任务 T3 默认全量回归；Verifier 核对 manifest + 分片原始日志，不把测试角色摘要当原始证据；缺失/失效判 `insufficient evidence`。 | 验收标准/报告样例；证据失效矩阵；T3 回归日志；manifest 与分片日志对照；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 独立验收、统筹、测试 | 待判定 | 待判定 |
| P9 | 兼容与迁移（§11 P9；§5.1/§5.5；§10.4；Q6/Q7/Q10 A）：旧团队计划（无 `teamPlanSchema: 2`）按 v1 只跑现有校验，不强制新字段，桌面只记迁移 warning，不阻塞旧流程；旧 flow 无并行字段不要求、不改变旧解析、dispatch 不新增前置检查；旧角色卡 `existing` 只做最低格式检查 + warning，不一次性重写；旧 nomination/旧提案不删除/不重写；迁移窗口无硬截止，新流程默认 v2；计划实质变更递增 `-team-v2.md`，角色/写集实质变化重开闸门 2（治理流程，不在验收内改）。 | legacy 计划/flow/角色卡测试；旧 flow 夹具；文件清单/无删除 diff；迁移说明；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、桌面窗口、测试 | 待判定 | 待判定 |
| P10 | 非目标不变（§11 P10；§12；Q8 A）：第 2 项客户入口、第 4 项派发权、角色 id/显示名/路径（liaison/rapporteur/nominator/convener/verifier 及显示名）、`GovernanceFunction` 值、工程基线 `ENGINEERING_QUALITY_BASELINE` 与 §二.9 文本、历史文件均不变；不新增固定测试角色；不新增 `cardKind`/`FlowStepKind`/`GovernancePower`/`GovernanceDecisionKind`；不引入纳米角色；不扩大 `BUILT_IN_GOVERNANCE_ROLES` entries/forbidden/preauthorized；不提交/推送/合并/发布。 | 代码/测试 diff；id/显示名/路径 grep；能力矩阵/客户入口/派发权回归测试；e2e；基线文本 diff；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 测试、独立验收、门禁引擎、编排、桌面窗口 | 待判定 | 待判定 |
| P11 | 测试与证据（§11 P11；§9.2；§11 证据计划）：受影响单测/层测试/集成/e2e 更新并通过（方案 §9.2 列明文件）；至少一条 v2 完整链路（团队计划 v2 → appointment → Crew 写卡 → readiness → Map 并行 → 测试分片 → Reduce → 变更包 → Verifier → acceptance），至少一条 legacy v1 链路保持通过；负例覆盖模块缺失/重复/孤儿、写集重叠、依赖环、同组依赖、整层名、多模块无理由、纳米/过细（warning + readiness 拒绝）、Reduce 未覆盖 Map、flow 前置未完成、分片共享夹具、证据失效；T3 全量回归按 §3.4 执行并与 N3 基线对照；原始输出可复算；不弱化断言；文档状态如实写 `implemented-unverified`，不写 `verified`，不把计划写成结果。 | 全部测试命令/输出；全量回归日志与 N3 基线对照；v2/legacy e2e 日志；负例矩阵；候选哈希/diff/status；角色文档状态摘录。 | 待提交 | 待提交（产品候选哈希，见变更包） | 测试、各实施角色、统筹 | 待判定 | 待判定 |
| P12 | 与 §二.9/工程基线一致（§11 P12；§9.3）：风险档位在变更包标注，定义引用 `references/testing.md`，不压档；报告首行五项；真实启动/演示保留；T0–T3 检查强度按 testing.md；不扩张写权；`ENGINEERING_QUALITY_BASELINE` 文本与 `角色卡/项目管理/docs/project-rules.md` §二.9 文本不变；本任务 T3 全量回归必须执行。 | 规则对照表；基线文本与 `project-rules.md` diff（应为空）；报告；相关测试；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 独立验收、统筹、门禁引擎 | 待判定 | 待判定 |
| P13 | Convener/Crew 提示词与角色卡同步（§4.4、§5.4.2、§9.1）：Convener 卡文本要求团队计划 v2 字段、模块清单、Map/Reduce、并行组、dependsOn、readiness 例外、flow 模板 optional 字段；Crew 卡文本要求读 module/公开契约/测试面/dependsOn/粒度理由，角色卡写 bounded context/公开契约/测试面/上下游依赖/粒度理由，boundary 按计划写集；不写整层/纳米角色；Verifier 卡为可选补充，若改不得改变真实启动/演示基线；卡文本断言同步更新。 | Convener/Crew 卡文本 diff；`test/门禁引擎/governance-trio.test.ts`、`governance-standard-workflow.test.ts`；`test/测试/` 相关卡文本断言；e2e；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 门禁引擎、编排、测试 | 待判定 | 待判定 |
| P14 | 单一团队计划解析器（Q9 A；§8.4；§14.3）：团队计划 v2 的解析/校验为单一实现 `src/common/编排/team-plan.ts`（V1–V10 等），经 `src/pipeline/orchestration/run-role.ts` 公共出口供桌面消费；桌面不直接 import `src/common/编排/` 私有实现、不保留第二份 v2 解析；卡前守卫与写卡后校验同源，结论一致；若实施未按 Q9 A 抽出，必须有统筹/沟通确认的偏差记录与 parity 测试，否则不符合已确认选择。 | 新模块 diff；import 图/grep；单源或 parity 测试；`run-role.ts`/`interface.ts` 测试；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、桌面窗口、测试 | 待判定 | 待判定 |
| G1 | 变更包完整、候选身份可复算：变更包 `docs/scheduling/role-granularity-parallel-testing-change-v1.md` 含任务 ID、产品 flowId、候选哈希（每个产品改动文件 `git hash-object` + `sha256sum`）、`git rev-parse HEAD`、改动路径、任务节点 N1–N9、证据链接、风险档位 T3、复用证据与失效说明；候选可复算；`docs/` 管理记录不混入产品候选。 | 变更包原文；原始 hash/status 输出；验收复算输出；证据链接清单；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 统筹、独立验收 | 待判定 | 待判定 |
| G2 | 写集与授权：所有改动路径在闸门 2 确认的逐角色写集内；无越界、无保护文件/角色卡边界改动、无未授权用户改动；不提交/不推送/不合并/不发布；worker 不写 `docs/scheduling/`、`docs/acceptance/`；`test/桌面应用/` 不新建文件（除非闸门 2 另有精确单文件确认）；角色自身文档按写集允许；默认无边界/角色卡改动。 | `git diff --name-only`/`--stat`/`status`/`--cached` 原始输出；与团队计划 §4.3/§八 对照；无提交记录；boundary/role-card 文件未变；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 统筹、独立验收 | 待判定 | 待判定 |

### 4.3 各标准的具体核对口径

#### 4.3.1 P1：团队计划 v2 schema 与 legacy 兼容

- **frontmatter（§5.1/§8.2）：** `flowId` 与文件名/flow/卡片一致；`version` 正整数；`riskTier` 为 T0–T3；`recommended` 非空、无重复、不含内置角色；`teamPlanSchema: 2` 标记 v2；`modules` 非空、无重复、ASCII slug（`^[a-z][a-z0-9-]*$`）、不含保留值 `reduce`。
- **内联数组解析：** `recommended`/`modules` 必须支持同一行内联数组（`recommended: [role-a, role-b]`、`modules: [module-a, module-b]`）或固定行；不得用 YAML 块数组导致空集/歧义；与现有 `parseRecommendedRoleIds` 同口径。
- **模块清单表（§5.2）：** 恰好覆盖 `modules` 集合：不多、不少、不重复；每行 `module`/职责/公开契约/架构来源非空；架构来源是可追溯引用（方案/架构章节），不是空话。
- **角色表列（§5.3）：** `roleId`、`类型`、`module`、`职责目标`、`能力要求`、`唯一写集`、`公开契约`、`测试面`、`依赖`、`dependsOn`、`并行组`、`组别`、`apiSpec`、`粒度理由`；解析器按别名匹配（`module`/`boundedContext` = module；`contract` = 公开契约；`testSurface` = 测试面；`parallelGroup` = 并行组；`granularityRationale` = 粒度理由），同名列不得重复/歧义。
- **必填与理由（§5.4 V3/V6）：** 类型只能是 `new`/`changed`/`existing`；每个推荐角色有且只有一行、角色行不重复；必填单元格非空（`粒度理由` 除外）；`apiSpec` 为 `required` 或 `not-applicable` + 理由；`公开契约`/`测试面` 非空；Map 角色测试面至少含一个测试路径；Reduce 角色测试面至少含集成/e2e/装配检查之一；`internal`/`not-applicable` 需非空理由。
- **legacy（§5.1/§5.5）：** 缺省或 `teamPlanSchema: 1` 的旧计划只跑现有 v1 校验（结构 + 推荐角色四列非空），不强制新字段；桌面只记一条迁移 warning，不阻塞旧流程；不原地改旧计划；新流程由 Convener 按 v2 写。
- **证据：** `team-plan.ts`/`run-role.ts`/`interface.ts` diff；v2 计划样例；legacy 计划通过测试与 warning 断言；内联数组/别名/重复列负例；`test/编排/team-plan.test.ts`、`test/门禁引擎/governance-standard-workflow.test.ts`、`test/测试/governance-e2e-auto/p-team-plan-guard.test.ts` 原始输出。

#### 4.3.2 P2：模块覆盖

- **集合一致（§5.2）：** 模块清单表集合 = frontmatter `modules`；`modules` 非空、无重复；每个模块在模块清单中恰有一行。
- **覆盖恰好一次（§5.4 V4）：** 每个模块在角色表中恰好被一个 Map 角色覆盖；无孤儿模块（清单有、角色没有）、无未声明模块（角色有、清单没有）、无重复覆盖（两个 Map 角色同一模块）。
- **Reduce 保留值（§5.2/§5.3）：** `reduce` 只用于不拥有产品模块的 Reduce 角色；`module: reduce` 的角色不计入模块覆盖计数；Reduce 角色不进入 `modules` 列表。
- **多模块例外（§5.3）：** 多模块只在过渡/例外时用 `a+b`，并必须写 `粒度理由`；以第一个模块为主模块；flow 交付步骤 id 用 `delivery-<主模块>`；`粒度理由` 写明主模块与其他模块及原因。
- **证据：** 模块覆盖正/负例（重复/孤儿/未声明/Reduce 计入）；模块清单样例；`test/编排/team-plan.test.ts`、`test/测试/governance-e2e-auto/q-role-granularity.test.ts` 原始输出。

#### 4.3.3 P3：写集不相交与 V12 边界覆盖

- **语法（§5.3/§5.4 V5）：** 写集为分号分隔的精确路径/目录；目录以 `/` 结尾；不支持通配符/省略号/散文/`..`/绝对路径；空项/非法项拒绝。
- **治理路径（§5.3）：** 写集不得包含 `.ans/`、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、`docs/flows/`、`docs/nominations/`、`角色卡/`；角色根工作文档由第 5 项清单另行要求，不进入模块写集。
- **不相交（§5.4 V5）：** 写集跨角色两两不相交；文件相等或目录前缀重叠都算重叠；写集全局不相交，因此并行组内必然不相交；只读契约不算写集。
- **V12（§5.4.1/§5.4.2）：** 计划写集必须被角色边界覆盖：new/changed 角色的 `boundary.yaml` entries 覆盖计划写集；existing 角色的既有边界也必须覆盖计划写集；不覆盖退回 Crew/Convener，不派 readiness。
- **证据：** 写集解析/重叠/治理路径负例；boundary 覆盖测试；`test/编排/team-plan.test.ts`、`test/桌面应用/interface.test.ts`（V12/来源分流）、`test/测试/governance-e2e-auto/q-role-granularity.test.ts` 原始输出。

#### 4.3.4 P4：依赖与并行组

- **dependsOn（§5.3/§5.4 V7）：** `无` 或角色 id 列表（逗号/顿号分隔）；目标必须是本计划角色行；无自依赖、无重复、无环（拓扑排序/Kahn 或 DFS）；`依赖` 说明非空；外部既有角色依赖写在 `依赖` 说明里，不进入 DAG。
- **并行组（§5.4 V8）：** 只能是 `map-<slug>` 或 `reduce`；module 为产品模块的角色必须是 `map-*`，module 为 `reduce` 的角色必须是 `reduce`；同一 `map-*` 组内角色之间不得有依赖路径；Map 角色不得依赖 Reduce 角色；每个 Reduce 角色的 `dependsOn` 必须直接或传递覆盖全部 Map 角色；Reduce 角色之间可顺序依赖（如测试分片→集成），但不得被 Map 角色依赖。
- **协调成本（§4.2/§5.4 V10）：** 团队计划含「五维判断/协调成本」章节且非空；内容由 readiness 判断；不得用行数/文件数硬阈值代替。
- **证据：** DAG/环/同组依赖/Map 依赖 Reduce/Reduce 未覆盖 Map 的负例；计划样例；`test/编排/team-plan.test.ts`、`test/测试/governance-e2e-auto/q-role-granularity.test.ts`、`r-mapreduce-parallel.test.ts` 原始输出。

#### 4.3.5 P5：粒度模型与 readiness 语义复核

- **默认规则（Q1 A）：** 一个模块一个角色、一个角色一个模块；一个模块不能被拆给两个角色（除非模块先在架构上拆分）；一个角色不能覆盖多个模块，除非写 `粒度理由` 并经 Convener readiness 明确批准。
- **硬拒（§4.4/§5.4 V9；Q4 A）：**
  - 模块 id 命中通用层名黑名单（`frontend`、`backend`、`web`、`server`、`client`、`ui`、`fullstack`、`all`、`common`、`shared`、`utils` 等）且 `粒度理由` 为空 → 硬拒；有理由 → `exception-review`，必须 readiness 明确批准。
  - 模块 id 含 `+`（多模块）且 `粒度理由` 为空 → 硬拒；有理由 → readiness 例外。
  - 模块清单「架构来源」为空或不是可追溯引用 → 硬拒；readiness 核对引用章节。
  - 单文件写集/极小模块 → warning，不硬拒；readiness 判断是否纳米角色；单文件模块只有在它本身是 bounded context（有独立契约/测试面/变化原因）时才允许。
- **纳米/过细（§4.2、§12.7）：** 禁止函数级/单文件/单个按钮/单个 API 端点角色；角色只做一次性/临时工作不建角色；角色只做协调/汇总/传话不是模块，由既有职责承担；新角色协调成本大于并行收益不建。不得把「模块数多」当成「粒度好」。
- **readiness（§5.4.2；Q10 A）：** `docs/scheduling/<flowId>-readiness-v1.md`，frontmatter `flowId`/`version`/`status: pass 或 gaps`；逐角色/逐计划核对模块清单与架构、内聚/耦合、粒度大小、契约、写集、测试面、并行组、例外；新增列 `module`/`contract`/`testSurface`/`parallel`/`dependsOn`/`granularity`；gap 退回 Crew 修正，计划缺细节退回 Convener 补充；readiness 不是验收标准、不是客户确认。
- **应用边界（§5.4.3）：** 应用不调用 LLM 做语义判断；只解析 `status: pass 或 gaps` 和结构化问题；结构校验通过文案不得宣称「粒度正确/能力描述已完成」。
- **验收范围（Q10 A）：** 对本次新增/变更角色逐个核对模块/契约/测试面；对旧计划只做 legacy 兼容检查，不按 v2 语义重判旧角色。
- **证据：** 粒度负例矩阵；readiness 样例/列；Convener/Crew 卡文本断言；系统行文案；五维章节存在性测试；`test/测试/governance-e2e-auto/q-role-granularity.test.ts`、`i-full-chain.test.ts` 原始输出。

#### 4.3.6 P6：Map/Reduce flow 与 dispatch 前置

- **可选字段（§6.2 方案 A；Q3 A）：** `FlowStateStep` 增加可选 `parallelGroup?: string`（`map-<slug>` 或 `reduce`）与 `dependsOn?: string[]`（前置 step id）；`STEP_KEYS` 是固定集合，未知字段仍校验失败（严格 schema 不放松）；旧 flow 不填这两个字段行为逐字不变。
- **枚举不变（§6.2；Q3 A）：** 不新增 `FlowStepKind`；`FLOW_STEP_KINDS` 仍只有 `dispatch`/`customer-decision`/`artifact`/`acceptance`；不得用 `parallelGroup` 替代证据 kind。
- **静态校验（§6.2）：** `parallelGroup` 语法合法；`dependsOn` 目标存在、无自依赖/重复/环；同一 `map-*` 组内步骤之间不得有依赖路径；每个 `reduce` 步骤（`dispatch`/`artifact`，验收除外）必须有到所有 `map-*` `dispatch` 步骤的依赖路径；Map 步骤不得依赖 Reduce 步骤；新契约 flow 的 Map 交付步骤必须依赖 `contract-freeze`。
- **dispatch 门禁（§6.2；Q12 A）：** 若步骤声明 `dependsOn`，所有前置步骤必须 `status: done` 才允许派发；不改变派发权归属（仍由 Convener 派发）；旧步骤无 `dependsOn` → 不新增检查；Reduce 前置硬拦。
- **序列化/视图（§8.4/§9.1）：** `flow-service.ts` 的 `viewOf`/`serializeFlow`/`flowStepSupersede` 携带可选字段；`FlowToolStepView`/`FlowToolStep`/`FlowStepSupersedeFn` 类型同步；旧 flow 序列化逐字不变。
- **证据：** `flow-state.test.ts`、`flow-service.test.ts`、`governance-gate.test.ts`、`test/runtime-core/governance-flow-metadata.test.ts` 原始输出；旧 flow 夹具；新 flow 样例；前置未完成拒绝/完成后允许的负例与正例。

#### 4.3.7 P7：测试分片、隔离与 Reduce 合并

- **Map 分片（§6.3）：** 测试角色按模块并行运行各模块测试面（如 `test/编排/`、`test/门禁引擎/`、`test/runtime-core/`、`test/桌面应用/` 精确文件、`test/桌面UI/`、`test/测试/governance-e2e-auto/`）；每个分片使用独立临时项目根/端口/数据库命名空间/输出目录/日志文件；共享只读夹具必须 pin 哈希；不共享可变项目根、同一端口、同一数据库、同一构建输出目录；不并发 `npm install`/构建到同一输出目录。
- **独立证据（§6.3/§8.2）：** 每个分片写独立原始日志（如 `docs/verification/<flowId>/map-<module>.log` 或团队计划声明的证据根），记录命令、环境、候选哈希、退出码、pass/fail/skip、失败原文；不得多个进程追加同一文件；manifest 不能替代分片原始日志。
- **失败隔离（§6.3）：** 一个分片失败不阻塞其他独立分片；失败分片保留原始日志，交模块 owner 修复；修复后只重跑该分片和受影响下游；测试角色不改模块代码。
- **Reduce 合并（§6.3/§8.2）：** 所有分片完成后，按顺序合并成 `docs/verification/<flowId>/manifest.md`（候选哈希、分片清单、命令、日志路径、结果、环境）；然后运行契约/集成/e2e 和真实启动/演示；最终 `verification-evidence` 步骤指向 manifest。
- **证据根所有权（§6.3；Q5 A）：** `docs/verification/`（或团队计划声明的证据根）只归测试角色写；模块角色写自己的测试路径，不写证据根；如果项目已有独立测试角色边界不含证据根，团队计划必须把它加入测试角色写集，或改用测试角色已有证据目录（如 `角色卡/测试/docs/`）；不能在计划里写一个角色边界外的路径。
- **证据：** 测试任务文案；分片证据样例；隔离/并发测试；manifest 样例；`test/测试/governance-e2e-auto/r-mapreduce-parallel.test.ts`、`i-full-chain.test.ts` 原始输出；测试角色证据目录。

#### 4.3.8 P8：验收复用与档位

- **复用（§6.4）：** Map 分片证据带候选哈希和模块标识；只有同候选、同输入/依赖、同命令、同环境可以复用；模块代码/测试/契约/夹具/配置变化 → 该分片和受影响 Reduce 证据失效，只补失效部分。
- **档位（§6.4；testing.md）：** T0 纯文档/格式（不涉及治理/权限变更）；T1 单角色局部实现；T2 跨角色/契约/数据模型/pipeline/shared；T3 发布/共享抽象/治理或权限变更。本方案自身是 T3；Map/Reduce 变更涉及治理/流程/共享 Model，验收默认 T3 全量回归。
- **Verifier 核对（§6.4）：** 核对 manifest + 分片原始日志，不把测试角色摘要当原始证据；缺失/失效 → `insufficient evidence`，不通过；可升档，不能降档。
- **证据：** 验收标准/报告样例；证据失效矩阵；T3 回归日志；manifest 与分片日志对照；`test/编排/governance-judge.test.ts`（如涉及）。

#### 4.3.9 P9：兼容与迁移

- **旧团队计划（§5.1/§5.5；Q6 A）：** 无 `teamPlanSchema: 2` → 按 v1 只跑现有校验；不强制新字段；桌面记 warning「建议迁移 team-plan v2」；不阻塞旧流程；不原地改旧计划；新流程默认 v2；迁移不设硬截止。
- **旧 flow（§5.5/§6.2）：** 无 `parallelGroup`/`dependsOn` 的旧 flow 不要求新字段；不改变旧解析；dispatch 门禁不新增前置检查；旧 flow YAML 不被删除/重写。
- **旧角色卡（§5.5；Q7/Q10 A）：** `existing` 只做最低格式检查 + warning；不一次性重写历史卡；新/变更角色才强制模块/契约/测试面内容；既有角色跨多模块允许 `granularityRationale` + readiness 例外，下一次实质变更时再拆。
- **旧 nomination/旧提案（§5.5）：** 不删除、不重写；legacy 回落保留。
- **计划版本（§5.1）：** v2 计划用 `-team-v2.md` 递增；不原地改已确认版本；角色/写集实质变化重开闸门 2（由统筹/沟通按既有规则判断）。
- **证据：** legacy 计划/flow/角色卡测试；旧 flow 夹具；文件清单/无删除 diff；迁移说明；`test/测试/real-entry.test.ts`（如涉及调度记录快照）原始输出。

#### 4.3.10 P10：非目标

- **第 2 项客户入口：** 多个治理角色可直接发客户卡的现状不变；卡镜像路由、`request_choice`/`request_confirmation` 客户通道不变；不把入口收窄到 Lead。
- **第 4 项派发权：** `dispatchTask`/`coordinate` 门/应用后台派发矩阵不变；不新增或转移派发权；`ACTION_ROLE.dispatch` 仍是 `convener`；dispatch 前置依赖检查不改变派发权归属。
- **角色命名/路径：** `liaison`/`rapporteur`/`nominator`/`convener`/`verifier`、显示名、`GovernanceFunction` 值、路径不变；只更新与角色粒度/MapReduce 直接相关的卡文本和任务文案。
- **枚举/权利：** 不新增 `cardKind`/`FlowStepKind`/`GovernancePower`/`GovernanceDecisionKind`；不新增固定测试角色（Q8 A：Reduce 角色由团队计划指定，可以是既有测试角色）；不扩大 `BUILT_IN_GOVERNANCE_ROLES` entries/forbidden/preauthorized。
- **历史与基线：** 不删除/重写历史 `docs/nominations/**`、旧 flow、旧团队计划、既有角色卡；`ENGINEERING_QUALITY_BASELINE` 与 §二.9 文本不变。
- **纳米角色：** 不引入函数级/单文件/按钮/端点级拆分。
- **证据：** 代码/测试 diff；id/显示名/路径 grep；客户入口/派发权回归测试；能力矩阵测试；e2e；基线文本 diff。

#### 4.3.11 P11：测试、全量回归与文档状态

- **受影响测试（§9.2）：** `test/测试/governance-e2e-auto/p-team-plan-guard.test.ts`（扩负例）、`fixture.ts`（v2 + 保留 v1）、`i-full-chain.test.ts`（v2 + legacy）、`c-appointment-timing.test.ts`、`b-proposal-accept-timing.test.ts`、`d-dispatch-listing.test.ts`；新增 `q-role-granularity.test.ts`、`r-mapreduce-parallel.test.ts`；`test/编排/flow-state.test.ts`、`flow-service.test.ts`、`governance-gate.test.ts`、`governance-session.test.ts`；新增 `test/编排/team-plan.test.ts`；`test/桌面应用/interface.test.ts`、`acceptance-dispatch.test.ts`、`operator-wiring.test.ts`（条件）；`test/门禁引擎/governance-trio.test.ts`、`governance-standard-workflow.test.ts`；`test/桌面UI/`（如改文案）；`test/runtime-core/governance-flow-metadata.test.ts`（如类型变化）；受影响的 `governance-trio-verify/*`、`governance-judge-cards-verify/*`、`governance-liaison-verify/*`。
- **v2/legacy e2e（§11 证据计划）：** 至少一条 v2 完整链路（团队计划 v2 → appointment → Crew 写卡 → readiness → Map 并行 → 测试分片 → Reduce → 变更包 → Verifier → acceptance）；至少一条 legacy v1 链路保持通过。
- **负例（§11 证据计划）：** 模块缺失/重复/孤儿、写集重叠、依赖环、同组依赖、整层名、多模块无理由、纳米/过细（warning + readiness 拒绝）、Reduce 未覆盖 Map、flow 前置未完成、分片共享夹具、证据失效。
- **T3 全量回归（§3.4）：** 最终候选执行 `node --test "test/**/*.test.ts"`、`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`；与 N3 基线逐项对照；本次新增失败为零；既有失败附基线证据与分类。
- **原始输出可复算：** 命令、退出码、cwd、时间、执行者、环境（Node/npm/OS/Shell）、测试计数（pass/fail/skip）、失败原文；跳过项写明原因。
- **不弱化断言：** 不得为保绿删除测试、放松断言、放宽权限或隐藏错误；测试 diff 必须对应真实行为变化；不得把「测试自述通过」当原始证据。
- **文档状态：** 实现完成但未验收的文档状态写 `implemented-unverified`，不写 `verified`；不把计划写成结果；不声称已提交/推送/发布。
- **证据：** 全部测试命令/输出；全量回归记录；e2e；候选哈希；diff/status；角色文档状态摘录。

#### 4.3.12 P12：与工程法案 §二.9 和工程基线一致

- **逐项对照 §二.9（`角色卡/项目管理/docs/project-rules.md:48`）：** 统筹在变更包标注 T0–T3；档位定义引用 `references/testing.md`；不得为省检查压低档位；验收先核对档位并记录；T0 只查文档、T1 受影响单测、T2 受影响集成、全量回归只在 T3/证据不足；报告首行五项；不扩张写权。
- **工程基线：** `ENGINEERING_QUALITY_BASELINE` 的「验收前必须真实启动应用并演示」文本不变；变的只是证据来源与核对方式（测试/实施角色产出，Verifier 核对），不得弱化或删除该要求。
- **§二.9 文本：** `角色卡/项目管理/docs/project-rules.md` §二.9 文本不变；本任务不改工程法案。
- **档位纪律：** 不得自创档位定义、不得把治理/权限变更压成 T0、不得把 T3 全量回归写成 N/A。
- **证据：** 规则对照表；`governance-roles.ts` 中 `ENGINEERING_QUALITY_BASELINE` 文本未变 diff；`project-rules.md` 未变 diff（应为空）；报告；相关测试。

#### 4.3.13 P13：Convener/Crew 提示词与角色卡同步

- **Convener（§9.1 `CONVENER_CARD_TEXT`）：** 卡文本要求团队计划 v2 字段、模块清单、Map/Reduce、并行组、dependsOn、readiness 例外、flow 模板 `parallelGroup`/`dependsOn`（方案 A）；不得把「字段齐全」写成「粒度正确」。
- **Crew（§9.1 `NOMINATOR_CARD_TEXT`）：** 卡文本要求读 module/公开契约/测试面/dependsOn/粒度理由；角色卡写 bounded context/公开契约/测试面/上下游依赖/粒度理由；boundary 按计划写集；不写整层/纳米角色；计划缺细节只报告 Convener，不自行补计划。
- **Verifier（可选）：** 若补充验收核对模块覆盖/MapReduce manifest/分片证据，不得改变真实启动/演示基线；若未改，P13 的 Verifier 子项按 N/A + 理由记录，不影响 Convener/Crew 必改项。
- **注册表/写权：** `BUILT_IN_GOVERNANCE_ROLES` entries/forbidden/preauthorized 不变；不扩大写权。
- **证据：** 卡文本 diff；`test/门禁引擎/governance-trio.test.ts`、`governance-standard-workflow.test.ts`；`test/测试/` 相关卡文本断言；e2e。

#### 4.3.14 P14：单一团队计划解析器（Q9 A）

- **单一实现（§8.4；Q9 A）：** 团队计划 v2 的解析/校验（frontmatter/模块清单/角色表别名列/写集/模块覆盖/DAG/并行组/粒度启发式 V1–V10）只有一份实现，位于 `src/common/编排/team-plan.ts`（编排私有）；不复制第二份 v2 解析。
- **公共出口（§8.4）：** 经 `src/pipeline/orchestration/run-role.ts` 或 `govern-session.ts` 公共出口给桌面消费；桌面不直接 import `src/common/编排/` 私有实现。
- **同源一致（§14.3）：** 卡前守卫（`run-role.ts::validateConvenerAppointmentCard`）与写卡后校验（`interface.ts::validateAppointmentArtifacts`/V12）对同一计划文本结论一致；不得出现「卡前通过、写卡后拒绝」或反之。
- **偏差处理：** 客户已确认 Q9 A（单一解析器）。若实施确实无法抽出，必须按团队计划 §九.3 加 parity 测试并回报统筹，经沟通/统筹确认偏差；未确认的偏差按不符合已确认选择处理，不得静默保留两份解析。
- **证据：** `team-plan.ts` diff；`run-role.ts`/`interface.ts` import 关系；单源或 parity 测试；正/负例矩阵；候选哈希。

#### 4.3.15 G1：变更包与候选身份

- 变更包至少含：任务 ID、产品 flowId、候选哈希（每个产品改动文件的 `git hash-object` + `sha256sum`）、`git rev-parse HEAD`、改动路径、任务节点 N1–N9、证据链接、风险档位 T3、复用证据与失效说明。
- 候选哈希必须可复算；验收只读复算并与变更包对照。候选与证据不匹配 → `insufficient evidence`；候选变化 → 按 §3.3 重取。
- 管理记录（顶层 `docs/`）不混入产品候选；不得用 `docs/` 文件的哈希代替产品文件哈希。
- 证据：变更包原文；原始 hash/status 输出；验收复算输出；证据链接清单。

#### 4.3.16 G2：写集与授权

- `git diff --name-only` / `git diff --stat` 的所有改动路径必须落在团队计划 §4.3/§八 的逐角色写集内；`git diff --cached --name-only` 为空（不暂存）；无提交、无推送、无合并、无发布。
- 不得出现 `角色卡/*/boundary.md`、`boundary.yaml`、`role-card.md` 的未授权改动；默认本任务无角色/边界变更。
- `test/桌面应用/` 不得新建文件（除非闸门 2 另有精确单文件确认）；worker 不得写顶层 `docs/scheduling/`、`docs/acceptance/`；测试角色不得写 `docs/verification/`（本仓库执行写 `角色卡/测试/docs/`；产品 e2e 只在临时项目根内生成）。
- 角色自身文档（`角色卡/<role>/api-spec.md`、`角色卡/<role>/docs/**`、`memo.md`）按团队计划允许；不得把顶层 `docs/` 管理记录写成 worker 交付。
- 证据：`git diff --name-only`/`--stat`/`status`/`--cached` 原始输出；与团队计划写集对照表；无提交记录；boundary/role-card 文件未变。

### 4.4 不适用（N/A）说明

- **P1–P14 全部适用，不得整行标 `not applicable`。** 本任务有代码/测试面，T3 全量回归必须执行，不能用 N/A 掩盖。
- 行内允许的 N/A 仅限：
  - **P13 的 Verifier 卡子项**：方案 §9.1 将 `VERIFIER_CARD_TEXT` 补充分列为可选；若实施未改，记录 N/A + 理由，但 Convener/Crew 必改项仍须判定。
  - **P10/P13 的桌面UI 文案子项**：方案 §9.1 将渲染层文案列为可选；若实施未改，记录 N/A + 理由；不得因此跳过桌面任务文案/解析/校验（必改项）。
  - **P6 的备选方案 B 分支**：客户已选 Q3 A（可选 flow 字段），方案 B 不适用；P6 主标准（可选字段/不新增 kind/前置 done）仍须判定。若实施擅自改成方案 B 或新增 kind，按违反 Q3 A 判 **fail**，不得按 N/A 放过。
  - **P9 的旧计划迁移截止日**：Q6 A 不设硬截止，因此「截止日强制迁移」分支不适用；旧计划兼容主标准仍须判定。
  - **P12 的发布/共享抽象检查**：本任务不发布，发布/发布流水线检查不适用；T3 全量回归仍须执行；不得把该 N/A 扩大到共享抽象/全量回归检查。
- 除上述行内分支外，任何 N/A 都必须写明依据；无法说明依据的 N/A 按 `insufficient evidence` 处理。

---

## 五、判定条件

### 5.1 每行的验收判断

| 判断 | 含义 | 本任务示例 |
| --- | --- | --- |
| **pass** | 该行标准已被当前候选满足；证据是原始的、对应当前候选、足以覆盖标准。 | 团队计划 v2 正/负例齐全；模块覆盖恰好一次；写集不相交；依赖无环；有理由的 readiness 例外记录；flow 前置未完成拒绝；分片隔离/manifest 完整；T3 全量回归无新增失败。 |
| **fail** | 已有证据表明候选不满足该行标准，或候选包含明确不允许的改动。 | 整层角色无理由通过；模块重复/孤儿；写集重叠；依赖成环；新增 FlowStepKind；前置未完成仍派发；共享临时根/日志；旧计划被强制迁移；改了第 2/4 项/命名/基线文本；写集越界。 |
| **insufficient evidence** | 尚不能判断：证据缺失、输出不完整、候选/版本不符、基线不可得、命令无法复算、报告未产生等。 | 没有原始测试输出；哈希只有自述；全量回归未跑；Map 分片日志/manifest 缺失；真实启动/演示缺失；报告首行缺项；基线文档哈希不符。 |
| **not applicable** | 该行标准确实不适用于本任务/分支，且必须写明依据。 | 仅 §4.4 列出的行内分支；P1–P14 不得整行 N/A。 |

### 5.2 总体结论

- **通过：** 所有适用行（P1–P14、G1–G2）均为 pass；候选哈希与证据一致；T3 全量回归对当前候选执行且无本次新增失败；真实启动/演示证据有效；标准/报告/变更包齐备。
- **返工：** 任一行 fail。列出差异、依据和应回到的所有者（按团队计划：运行时核心、门禁引擎、编排、桌面窗口、桌面UI、测试、统筹），由统筹安排修复与复测；验收不代改。
- **证据不足：** 没有 fail，但任一行 insufficient evidence。列出缺什么、由谁补（对应产出角色/统筹），不能记通过。
- 若同时存在 fail 与 insufficient evidence：总体结论按**返工**，同时在报告中列出待补证据，避免修复后重复缺证。
- `not applicable` 不得把不适用的行算作 pass；本任务 P1–P14 不应出现整行 N/A。
- 验收结论只对当前候选有效；候选变化后按 §3.3 重新判断受影响部分。

### 5.3 报告要求与效力

- 验收报告路径：`docs/acceptance/role-granularity-parallel-testing-report-v1.md`（由独立验收写，不由统筹代写）。
- 报告**首行**必须含五项：`风险档位：T3｜判定依据：治理/权限/流程设计变更（依据 references/testing.md；治理变更即使只改文档也非 T0）｜选定检查：…｜复用证据：…（来源/候选/仍有效理由，或「无」）｜全量回归：已执行 / N/A + 理由`。本任务全量回归应写「已执行」，不得写 N/A。
- 报告须链接：任务/阶段、客户确认的策划方案版本（路径+哈希）、本标准版本 `role-granularity-parallel-testing-criteria-v1` 与判定时计算的哈希、候选哈希、变更包、原始证据路径/哈希、未解决问题、结论理由。
- 报告须包含完整验收表（P1–P14、G1–G2），逐行填实际证据、结果、验收判断；不得只写「已完成」或「通过」而无表。
- 验收通过只表示当前候选满足本标准；**不授权提交、推送、合并、发布或任何对外操作**。统筹只能按匹配当前候选的通过结论放行。

---

## 六、统筹应提交的变更包与证据

判定阶段统筹须提交以下内容（缺少任一项会形成 `insufficient evidence`，除非验收能只读复算）：

### 6.1 变更包

- 路径：`docs/scheduling/role-granularity-parallel-testing-change-v1.md`。
- 内容：任务 ID、产品 flowId、候选哈希（每个产品改动文件 `git hash-object` + `sha256sum`）、`git rev-parse HEAD`、改动路径、任务节点 N1–N9、证据链接、风险档位 **T3**、复用证据与失效说明。

### 6.2 原始命令输出

- `git rev-parse HEAD`；
- `git status --short`；
- `git diff --name-only`；如暂存，另附 `git diff --cached --name-only`；
- `git diff --stat`；
- 完整 `git diff`（至少覆盖所有改动 hunk；过大时按文件分段，不可截断到无法核对）；
- 每个产品改动文件的 `git hash-object` 与 `sha256sum`；
- 基线 N3 与最终候选的测试命令、退出码、cwd、时间、执行者、环境（Node/npm/OS/Shell）、测试计数、失败原文。

### 6.3 测试、分片与 Reduce 证据

- 定向测试：`test/runtime-core/`、`test/门禁引擎/`、`test/编排/`、`test/桌面应用/` 既有精确文件、`test/桌面UI/`、`test/测试/` 相关 e2e/负例。
- Map 分片：每模块分片日志（命令、环境、候选哈希、退出码、pass/fail/skip、失败原文）；分片清单；独立临时根/端口/输出目录/日志证据；共享只读夹具 pin 哈希；失败隔离与只重跑记录。
- Reduce：`docs/verification/<flowId>/manifest.md`（产品运行期）或团队计划声明的本仓库证据目录；manifest 含候选哈希、分片清单、命令、日志路径、结果、环境；契约/集成/e2e/真实启动演示结果。
- T3 全量回归：`node --test "test/**/*.test.ts"`、`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`（以仓库实际脚本为准）。
- 基线 N3：实施前对当前 HEAD 跑同一组命令的原始输出、计数、失败分类；最终结果与基线逐项对照。
- e2e：至少一条 v2 完整链路（团队计划 v2 → appointment → Crew 写卡 → readiness → Map 并行 → 测试分片 → Reduce → 变更包 → Verifier → acceptance）及至少一条 legacy v1 链路；负例矩阵如 §4.3.11。

### 6.4 真实启动/演示证据

- 启动方式：`npm run app`（Electron）或既有 `test/桌面应用/e2e/main.mjs` 总自检台；必须是真实启动应用，不能用纯单元测试/mock 代替。
- 演示内容：至少覆盖一条 v2 治理链路的关键变化（团队计划 v2 模块清单/角色表/MapReduce → appointment → Crew 写卡 → Convener readiness（模块/契约/测试面/并行/粒度）→ Map 并行派发 → 测试分片 → Reduce 合并/契约/集成/e2e → 变更包 → Verifier → acceptance）；以及至少一条 legacy v1 链路保持通过。
- 记录：启动命令、时间、候选/版本、访问地址或窗口截图/录屏清单、日志；离线无真实凭据时如实记录模型桩边界。
- 缺失、失效或无法对应候选时不得建议 accept；验收按 `insufficient evidence` 处理。

### 6.5 文档与角色报告

- 各实施角色的完成报告：候选哈希、diff/status、改动路径、测试命令/输出、未解决问题、写集越界声明。
- 角色自身文档状态：`角色卡/<role>/api-spec.md`、`角色卡/<role>/docs/change/2026-10-22_change_role-granularity-parallel-testing.md`（或同主题单篇）、`memo.md`（按需）；实现完成但未验收的状态写 `implemented-unverified`。
- 文档不得把计划写成结果，不得声称已提交/推送/发布。

### 6.6 证据路径/哈希与复用说明

- 每份证据文件的路径与 SHA-256（若以文件形式提交）；或任务记录中的原始输出位置。
- 复用证据：来源、原候选哈希、原命令、仍然有效的理由；本任务预计复用 N3 基线仅用于失败分类，不作为最终候选验证。
- 未解决事项：实施中发现的歧义、与方案/团队计划的冲突、需要沟通澄清的问题。

---

## 七、判定时的只读检查步骤

验收判定时按以下顺序执行，只读，不改产品代码、测试、角色卡、边界、方案、团队计划、沟通记录或调度记录：

1. **核对基线：** 读取 `docs/communication/2026-10-22_intent-role-granularity-parallel-testing.md` 的闸门 0/1/2 与实施授权记录；核对方案、意图、团队计划版本与 §二 哈希；确认方案 v1 是客户确认版本。若基线文档变化，按 §3.3/§3.5 处理。
2. **核对候选身份与变更包：** 复算 `git rev-parse HEAD`、各产品文件 `git hash-object`/`sha256sum`、`git status --short`、`git diff --name-only`/`--stat`/`--cached`；与变更包对照；确认候选冻结、证据对应当前候选。
3. **核对档位：** 确认变更包为 T3，档位与改动相符；若不符，退回统筹或按更高档补证；验收可升档，不能降档。
4. **核对写集（G2）：** 将改动路径与团队计划 §4.3/§八 逐角色写集对照；确认无越界、无保护文件改动、无提交/推送/发布、worker 未写顶层 `docs/scheduling/`、`docs/acceptance/`、`docs/verification/`。
5. **核对 P1–P5：** 读团队计划 v2 样例/解析器/校验器/readiness 样例；核对字段、模块清单、模块覆盖、写集、DAG、并行组、粒度例外、V12、legacy 分支。
6. **核对 P6：** 读 flow-state/flow-service/gate diff 与测试；核对可选字段、旧 flow 不变、静态校验、dispatch 前置 done、Reduce 硬拦、未新增 FlowStepKind。
7. **核对 P7–P8：** 读测试任务文案、分片日志/manifest、隔离/失败隔离证据；核对证据根所有权、T0–T3、证据复用/失效。
8. **核对 P9–P10：** 读 legacy 测试/旧 flow 夹具/文件清单；核对旧计划/flow/角色卡未被删除/重写；核对第 2/4 项、命名/路径、枚举、工程基线文本未变。
9. **核对 P11–P12：** 对照 N3 基线与最终候选的原始输出；确认无本次新增失败；确认 e2e、真实启动/演示证据存在且对应当前候选；确认断言未弱化、文档状态如实；核对 §二.9/报告首行五项。
10. **核对 P13–P14：** 读 Convener/Crew 卡文本 diff 与卡文本断言；核对单一解析器/公共出口/同源一致性。
11. **填写验收表并给结论：** 按 §5 逐行填 pass/fail/insufficient evidence/not applicable；写报告，首行五项，链接证据与未解决问题；报告只对当前候选有效。

---

## 八、不得据此扩张的事项

- 本文件不扩张任何角色的文件写权；独立验收只写 `docs/acceptance/`。
- 本文件不授权修改产品代码、测试、角色卡、边界、工程法案、方案、团队计划、沟通记录或调度记录。
- 本文件不授权提交、推送、合并、发布或任何对外操作。
- 本文件不是客户确认记录，也不是验收结论；客户确认仍以 `docs/communication/` 的记录为准。
- 实施者不得把「标准已写」「团队计划已确认」「工具成功」当成验收通过或客户确认。
- 本文件不改变闸门 0/1/2 的确认对象和版本；方案实质变更重开闸门 1，角色指派/写集变更重开闸门 2，意图变更重开闸门 0。

---

## 九、需要沟通/统筹澄清或注意的问题

1. **方案文件头状态与闸门 1 记录不一致：** 方案文件头仍写「草案 v1（待闸门 1 方案确认）」「闸门 1：待确认」，沟通记录已确认。本标准按团队计划 §2.2 以沟通记录为授权事实，不改方案文件。若沟通认为必须在实施前更新方案状态头，请先处理；否则按本文件执行。
2. **团队计划 hash/状态与闸门 2 记录不一致：** 意图记录写「闸门 2 已确认并授权实施」且确认对象团队计划 hash `4fb701fc…`；但团队计划文件状态头与 §二仍写「闸门 2 待客户确认」，本标准写盘时实测团队计划为 `git hash-object` `a4370085…` / SHA-256 `73fabec5…`。请沟通/统筹核对闸门 2 确认的是哪一版团队计划，补记当前版本哈希并同步团队计划状态；本标准以方案 v1 为验收基线、团队计划仅作范围/写集输入，不因该差异改变标准，但 G2 写集核对需要可追溯的确认版本。
3. **`docs/` 跟踪状态与候选口径：** 本轮方案/意图/团队计划/标准等多为未跟踪管理记录。候选身份以产品代码/测试/角色卡文件哈希与已跟踪 diff 为准，不把管理记录混入产品候选；不得以「未跟踪所以不算改动」为由在 `docs/` 或其他未跟踪路径写实施产物。
4. **Node 不在验收 shell 的 PATH：** 验收实测 Node v24.22.1 位于 `C:\Users\51054\AppData\Local\Programs\nodejs\node.exe`，但 `node` 不在当前 Git Bash PATH。证据必须记录实际调用方式；测试角色应在自己的环境中确认 `node --test` 可执行并记录版本。若某命令因 PATH/环境不可用，按 `insufficient evidence` 处理，不能写成通过。
5. **真实启动/演示的可执行程度：** 团队计划 §6.4 指定测试角色产出；若 `npm run app` 或 `test/桌面应用/e2e/main.mjs` 在当前环境无法真实启动，测试角色须在证据中说明并给出可核对日志；验收不得用单元测试/mock 代替，缺失则 `insufficient evidence`。
6. **产品运行期 `docs/scheduling/` 与项目调度记录同名风险：** 产品 Convener 的团队计划/readiness/变更包使用 `<flowId>-team-vN.md` 等命名；测试夹具必须使用独立 flowId/临时项目根，不覆盖本仓库既有 `docs/scheduling/2026-10-22-*.md` 记录。
7. **`test/桌面应用/` 逐文件授权：** 该目录对桌面窗口是逐文件授权，默认不得新建文件；若实施确需新文件，桌面窗口应停止并回报统筹，由人事按闸门 2 补充精确单文件条目，不默认派发、不越过本标准。
8. **`docs/verification/` 与本仓库测试角色边界：** 产品运行期证据根默认 `docs/verification/`，但本仓库测试角色 Section 1 不含该路径；本仓库执行时测试证据写 `角色卡/测试/docs/`，产品 e2e 只在临时项目根内生成 `docs/verification/`。若确需在本仓库写 `docs/verification/`，须另走人事改边界 + 闸门 2，不靠「测试角色本来就会写证据」假设。
9. **单一解析器 Q9 A 的偏差处理：** 客户已确认单一解析器；若实施确实无法抽出，必须按团队计划 §九.3 加 parity 测试并回报统筹，经沟通/统筹确认偏差。不得静默保留两份解析，也不得把 parity 测试当成 Q9 A 的默认等价物。
10. **Verifier 卡与渲染层文案为可选：** 方案 §9.1 将 `VERIFIER_CARD_TEXT` 补充和渲染层文案列为可选；未改时按 N/A + 理由记录，不影响 Convener/Crew 必改项；不得因此跳过桌面任务文案/解析/校验。
11. **无 task_ops：** 本项目无 `.ans/project.json`；不伪造任务令牌、锁、审批、机器预检；证据以文件与原始输出为准。
12. **Windows 既有失败：** 历史基线存在 Windows symlink EPERM 等既有失败；N3 基线必须先记录并分类，终验只对本次新增失败负责；并行全量可能出现桌面时序偶发，必须用隔离/整文件/串行复跑分类。
13. **本任务不使用项目 `角色卡/独立验收` worker：** 按团队计划 §3.3/§7.1，本任务只用内置独立验收写 `docs/acceptance/`；项目 worker 的边界不含该目录。若沟通/统筹改变该安排，需先更新团队计划并重开闸门 2，本标准不据此判定。
