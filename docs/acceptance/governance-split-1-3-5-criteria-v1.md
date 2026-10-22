# 验收完成标准：治理分工第 1、3、5 项（governance-split-1-3-5）

- 任务 ID：`2026-10-22-governance-split-1-3-5`
- 产品 flowId：`governance-split-1-3-5`
- 标准版本：`governance-split-1-3-5-criteria-v1`（本文件写盘后冻结）
- 阶段：**实施前完成标准**（只建立标准；本文件不判定候选、不实施）
- 风险档位：**T3（治理/权限变更）**
- 验收基线：客户在**闸门 1** 确认的策划方案 v1（`docs/planning/2026-10-22_design_governance-split-1-3-5.md`，2026-10-22）
- 上位依据：客户在**闸门 0** 确认的意图记录（`docs/communication/2026-10-22_intent_governance-split-1-3-5.md`）
- 范围/写集输入：客户在**闸门 2** 确认的团队计划（`docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md`）；**只作范围与写集依据，不是标准来源**
- 候选版本：待统筹提交，以产品候选哈希标识（见变更包）
- 结论：**待判定**（本文件不构成通过、返工或证据不足结论）
- 写盘日期：2026-10-22

---

## 一、基线、输入性质与范围

### 1.1 验收基线与确认记录

| 闸门/输入 | 状态 | 记录 | 本轮作用 |
| --- | --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-10-22） | `docs/communication/2026-10-22_intent_governance-split-1-3-5.md` | 上位依据：只优化第 1、3、5 项；第 2、4 项及其余差异不改 |
| 闸门 1：方案确认 | 已确认（2026-10-22，客户选择「确认，按推荐项」） | 同上文件「闸门 1 确认记录」；对象为策划方案 v1 | **验收基线**：方案 §11 P1–P15、§13 Q1–Q12 推荐 A、§9.8 O1–O5、§12 非目标 |
| 闸门 2：角色指派/写集确认 | 已确认（2026-10-22，客户选择「确认并授权实施」） | 团队计划 §八；确认记录见 `docs/communication/` 意图文件「闸门 2 确认与实施授权记录」 | 只用于核对参与角色、逐角色写集、阶段顺序；**不是标准来源** |
| 实施授权 | 已记录（2026-10-22，客户明确「确认并授权实施」） | 同上「闸门 2 确认与实施授权记录」 | 允许按团队计划实施；不等于验收通过、提交、推送、合并或发布授权 |

**方案文件状态头说明：** 策划方案文件头与 §2.1 仍写「草案 v1（待闸门 1 方案确认）」「闸门 1：待确认」，与沟通闸门 1 确认记录不一致。团队计划 §2.2 已记录该已知不一致。本标准以 `docs/communication/` 的闸门 1 确认记录为授权事实，不改写方案文件；实施与验收引用方案正文的版本与内容，不把过期状态头当成未确认。

### 1.2 输入性质与来源纪律

1. **方案 §11 P1–P15 是直接标准来源。** 本标准把 P1–P15 逐项展开为可核对口径；展开内容取自方案正文对应章节（§4–§8、§10–§13），不新增产品需求，不放宽或加严方案实质。
2. **团队计划不是标准来源。** 团队计划只用于确认参与角色、逐角色写集、阶段顺序与证据安排。团队计划中的建议正文、角色分工或措辞不得被用来增加、放宽或加严本标准；与方案冲突时，以客户确认的方案 v1 为准。
3. **闸门 0 意图记录是上位依据。** 第 2、4 项及与本轮无关的差异是明确非目标；不得借实施顺手扩大。
4. **§13 Q1–Q12 推荐 A 与 §9.8 O1–O5 已随闸门 1「按推荐项」纳入范围。** 本标准在 §4.1 给出逐项映射；O6（新增固定测试角色）未选，不是本轮要求。
5. **G1/G2 是验收流程与写集核对，不是新增产品需求。** 它们来自技能 `references/acceptance-role.md`、`references/evidence.md`、`references/testing.md` 对候选身份、变更包与变更授权的要求，以及闸门 2 已确认的写集；用于核对候选和证据，不改变产品行为标准。
6. **标准冲突处理。** 本文件不得弱于方案 §11。若发现本文件与方案 §11 实质不一致，按 §3.5 的标准版本变更流程处理，不擅自按本文件判定，也不得用本文件放宽方案标准。

### 1.3 交付范围与写集（只作核对依据）

**本轮必须覆盖的产品面（方案 §10.1/§10.2、团队计划 §4.2/§8）：**

- Model/Provider：`src/model/runtime.ts`、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`。
- 门禁引擎：`src/common/门禁引擎/governance-roles.ts`。
- 编排：`src/common/编排/` 方案 §10.1 列明文件、`src/pipeline/orchestration/run-role.ts`、`src/pipeline/orchestration/govern-session.ts`。
- 桌面窗口：`app/desktop/governance-advance.ts`、`interface.ts`、`session.ts`、`customer-input.ts`。
- 桌面UI：`app/renderer/src/chat/governance-view.ts`、`role-view.ts`。
- 测试：`test/runtime-core/`、`test/门禁引擎/`、`test/编排/`、`test/桌面应用/` 既有四个精确文件及 `e2e/main.mjs`、`test/桌面UI/`、`test/测试/`。
- 角色自身文档：各 worker 在自己角色目录内的 `api-spec.md`、`docs/change/`、`memo.md` 等，按团队计划 §4.2 的「自身文档」条目。

**管理记录（不是产品候选）：** 顶层 `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/`、`docs/verification/`。其中本任务的标准、报告、团队计划、变更包、沟通记录是验收的引用与证据载体，不混入产品候选。

**明确非目标（方案 §12、团队计划 §1.3）：**

- 第 2 项客户入口不唯一——不改。
- 第 4 项派发权分散——不改；appointment→Crew 是治理卡后续任务，不是派发权转移。
- 角色内部 id、显示名、`GovernanceFunction` 值、路径（`liaison`/`rapporteur`/`nominator`/`convener`/`verifier`）——不改；只更新与第 1、3 项直接相关的卡文本和 UI 文案。
- 工程基线 `ENGINEERING_QUALITY_BASELINE` 文本与工程法案 §二.9 文本——不改。
- 不新增固定测试角色；不新增 `cardKind`；不新增 `FlowStepKind`（闸门 1 选 Q4 A）。
- 不删除、不重写历史 nomination 文件、历史 flow YAML、既有角色卡。
- 不扩大写权；不提交、不推送、不合并、不发布。

**写集核对口径：** 以团队计划 §4.2/§8 的逐角色精确写集为准。`test/桌面应用/` 对该角色是逐文件授权，默认不得新建文件；若确需新文件，必须先由人事按闸门 2 补精确单文件条目，否则属越界。顶层 `docs/scheduling/` 与 `docs/acceptance/` 只由内置统筹/验收写，worker 不得写。

### 1.4 完成定义（高层）

当前产品候选同时满足以下条件，才可能判**通过**：

1. §4.2 验收表 P1–P15 全部适用行 pass，G1–G4 pass；没有整行 `not applicable`。
2. 风险档位核对为 T3；适用的全量回归已对当前候选执行，并与实施前基线（N3）对照；无本次新增失败。
3. 真实启动应用/演示证据存在且对应当前候选；不能以单元测试或 mock 替代。
4. 候选身份可复算，变更包完整，所有改动在闸门 2 写集内。
5. 验收报告首行含风险档位、判定依据、选定检查、复用证据、全量回归五项；报告链接标准版本、候选、证据与未解决问题。

### 1.5 重要边界情形

以下情形至少构成 **fail**（有证据表明不满足标准）：

- Convener 仍无 `docs/scheduling/` 写权，或 Crew 仍能发 appointment/仍能写 `docs/nominations/`（P1/P2/P6）。
- appointment 卡仍由 Crew 发起，或无效团队计划仍能弹卡/写账本（P2）。
- 客户 appointment 决定后直接派 Convener、Crew 未收到写卡任务、重复派发或重启后漏派（P3）。
- 写卡结构校验失败仍派 Convener，或把 appointment 步骤标 done（P4）。
- 新增了 `FlowStepKind` 枚举值（闸门 1 选 Q4 A），或团队计划/标准/变更包无法作为 artifact 观察（P5）。
- 扩大其他角色写权，或给 Convener `角色卡/` 写权、给 Crew `docs/scheduling/` 写权（P6）。
- 第 5 项只检查文件存在，缺章节仍通过，`api-spec.md` 无 `not-applicable` 理由，或强制重写全部既有角色卡（P7/G4）。
- readiness 未做、gap 无处可去、Crew 自行补计划，或应用宣称「能力描述已完成」（P8）。
- 实施派发前没有标准，或新 flow 被静默豁免标准门槛（P9）。
- 把治理/权限变更压成 T0/T1，报告首行缺项，或 T3 不适用的全量回归被 N/A 掩盖（P10/P15）。
- Verifier 默认自己全跑或只读报告，或没有真实启动/演示证据仍建议 accept（P11）。
- acceptance 卡先于报告、标准/报告路径混放、账本新增假验收决定（P12）。
- 改了 `ENGINEERING_QUALITY_BASELINE` 或 §二.9 文本，或弱化真实启动/演示要求（P13）。
- 顺手改了第 2/4 项、角色命名/路径或其他非目标（P14）。
- 改动越出闸门 2 写集，或把 `docs/` 管理记录混入产品候选（G1/G2）。

以下情形构成 **insufficient evidence**（尚不能判断）：

- 候选哈希与变更包不符，或证据来自另一个候选/HEAD/工作树。
- 缺原始命令输出、退出码、环境、测试计数或失败原文；只有角色自述或「工具成功」。
- 全量回归未跑、基线 N3 缺失、既有失败没有基线对照。
- 真实启动/演示证据缺失、无法定位或无法对应候选。
- 报告首行缺五项，或标准/报告版本无法核对。

---

## 二、写标准时的只读基线核对（2026-10-22）

本节记录验收写标准时的实测事实，供判定时对照；不是候选，也不构成实施。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| HEAD | `git rev-parse HEAD` | `c3693ecdcb78bd83def351c0f2967571dad7174c` |
| 工作树 | `git status --short` | ` M docs/communication/memo.md`；`?? docs/communication/2026-10-22_intent_governance-split-1-3-5.md`；`?? docs/planning/`；`?? docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md` |
| 已跟踪 diff | `git diff --name-only` | `docs/communication/memo.md`（管理记录，非产品候选） |
| 暂存区 | `git diff --cached --name-only` | 空 |
| 已跟踪 `docs/` 文件 | `git ls-files docs/` | 6 个既有管理记录（含上一轮 acceptance-risk-tier 记录） |
| 产品代码/测试改动 | `git status --short` 对照 | 无已跟踪代码/测试改动 |
| Node | 实际路径 `C:\Users\51054\AppData\Local\Programs\nodejs\node.exe` | v24.22.1 |
| npm | 同目录 `npm.cmd` | 11.19.1 |
| 平台/Shell | OS/环境 | Windows 11 Pro；Git Bash（`uname` 显示 MINGW64） |

**确认的基线文档哈希（写标准时工作区内容）：**

| 文件 | 角色 | `git hash-object` | `sha256sum` |
| --- | --- | --- | --- |
| `docs/planning/2026-10-22_design_governance-split-1-3-5.md` | 验收基线（方案 v1） | `71a0ea72c889eebac9bb637d0bda72aa8d99773a` | `2e4b486df4f3aaa5d99b8ba6b87b640ca289cd491333fee99a2666c85c89b442` |
| `docs/communication/2026-10-22_intent_governance-split-1-3-5.md` | 闸门 0/1/2 与实施授权记录 | `ee7ab8c74ef166959d35b0947f88f33cc9f6ed2f` | `f2280a8c4cd790ae721f3a429f21f471bc26584c4ba055bff69186fcc65999b2` |
| `docs/scheduling/2026-10-22-governance-split-1-3-5-team-plan.md` | 闸门 2 确认的范围/写集（非标准来源） | `a057030ce0ae32ff18169736e3771625e606e33a` | `a3755cbb4c5d5a1eb1e38c7ccabf6d3355ff14e0380d040c064f69421d025b04` |

**环境注意：**

- 验收当前 shell 中 `node` 不在 PATH；证据必须记录实际调用方式（完整路径或 worker 自己的 shell/PATH），不能只写「node 可用」。Node v24.22.1 满足 `package.json` 的 `engines: node >=23.6`。
- 本标准自身写入后，`git status --short` 会新增 `?? docs/acceptance/governance-split-1-3-5-criteria-v1.md`；这是管理记录，不是产品候选。
- 若判定时上述基线文档哈希变化，按 §3.3 处理；方案/意图/团队计划版本变化时，验收基线或范围依据失效，不能静默按旧版本判定。

---

## 三、候选身份与证据失效规则

### 3.1 候选身份

**产品候选**是判定时下列文件的精确内容：

- `src/**`、`app/**`、`test/**`；
- `角色卡/**`（含 `role-card.md`、`boundary.md`、`boundary.yaml`、`api-spec.md`、`feature-map.md`、`functional-description.md`、`memo.md`、`docs/**` 等角色自身文档）；
- 构建/配置文件中确属本任务授权范围的改动（本任务默认不改；若出现，按 G2 核对授权）。

候选身份用以下组合标识，缺一不可：

1. `git rev-parse HEAD`；
2. 每个产品改动文件的相对路径、`git hash-object`（Git blob SHA-1）与 `sha256sum`（文件 SHA-256）；
3. `git status --short`、`git diff --name-only`、`git diff --stat`、`git diff --cached --name-only` 原始输出；
4. 变更包声明的候选标识必须与上述复算一致；不一致时按 `insufficient evidence` 处理。

**管理记录不是产品候选：** 顶层 `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/`、`docs/verification/` 的文件哈希不用于标识产品候选，也不得把管理记录的变化说成产品改动。它们可以作为验收标准、变更包、证据链接的载体；若方案、标准或团队计划版本变化，按 §3.3 处理，而不是当作产品候选变化。

**候选冻结：** 统筹提交变更包并声明候选后，候选冻结。判定前任一产品文件内容变化（任一哈希变化），受影响证据失效，按 §3.3 重取；不得在变化后的候选上沿用旧证据。

### 3.2 证据原始性与复用

- **原始证据**指：原始命令输出（命令、cwd、时间、执行者、退出码、stdout/stderr）、测试计数（pass/fail/skip）、失败原文、候选文件哈希、diff/status、e2e/启动演示的日志或截图清单、账本/夹具输出。开发自述、测试转述、工具成功提示、计划文本都不能单独作为原始证据。
- **证据生成时间**必须晚于本标准写盘时间；早于标准的证据按流程不符处理（`insufficient evidence` 或退回统筹）。
- **复用规则：** 只有同候选、同输入/依赖、同命令、同环境的证据可以复用。复用须在报告「复用证据」栏写明来源、原候选、原命令和仍然有效的理由。候选、输入、依赖、契约、夹具、配置或环境变化时，受影响证据失效，只补失效部分；不能因为「别的角色跑过」就跳过必需检查。
- **T3 全量回归不是可复用项：** 必须对当前候选执行；基线 N3 只用于区分既有失败，不能替代最终候选的全量回归。

### 3.3 证据失效矩阵

| 证据生成后的变化 | 失效范围 | 处理 |
| --- | --- | --- |
| 任一 `src/**` 或 `app/**` 产品代码变化 | 受影响单测/层测试/集成/e2e；候选哈希；全量回归结论 | 重取受影响证据；候选变化后全量回归重新执行或按 §3.4 处理 |
| `src/model/runtime.ts` 等共享 Model 契约变化 | 所有引用该契约的下游测试、判断物证、类型检查、e2e | 契约冻结后重跑所有受影响调用方；旧证据全部失效 |
| 任一 `test/**` 测试文件或共享夹具变化 | 该测试套件及其依赖的集成/e2e；全量回归 | 重跑该套件与受影响链路；不得只重跑新增用例 |
| `角色卡/**`（role-card/boundary/角色文档）变化 | 治理卡文本、写权、标准工作流、readiness、e2e 中冻结角色卡的断言 | 重跑 `test/门禁引擎/`、`test/测试/` 相关 e2e；候选哈希重取 |
| 构建/配置（`package.json`、`tsconfig*.json`、`vite.config.ts` 等）变化 | 构建、typecheck、全量回归；候选范围 | 本任务默认不改；若出现，按 G2 核对授权并重跑受影响检查 |
| 顶层 `docs/` 管理记录变化 | **不直接影响产品候选**；若方案/标准/团队计划版本或确认记录变化，则影响验收基线/范围依据 | 方案实质变化重开闸门 1；标准变化按 §3.5；团队计划变化重核写集；确认记录变化补沟通确认 |
| HEAD 或基线 N3 变化 | 基线对照、既有失败分类、候选身份中的 HEAD | 重新建立基线；无法建立时 `insufficient evidence` |
| 环境变化（Node/npm/OS/Shell/依赖） | 受环境影响的全量回归、e2e、启动演示 | 记录新环境并重跑受影响检查；不能把环境差异当成通过 |
| 证据文件被替换、丢失或无法追溯 | 对应验收行 | `insufficient evidence`，重取原始输出 |

### 3.4 T3 全量回归规则

本任务有代码/测试面，T3 的适用全量回归**必须执行**，不能用 N/A 掩盖：

- 最终候选必须执行团队计划 §6.3 列出的命令（以仓库实际脚本为准）：
  - `node --test "test/**/*.test.ts"`
  - `npm run typecheck`
  - `npm run typecheck:renderer`
  - `npm run build:renderer`
- 实施前必须由测试角色在 N3 对当前 HEAD 跑同一组命令，记录基线计数、失败清单与分类；最终结果与基线逐项对照。
- 本次新增失败不得放行；既有失败（如 Windows symlink `EPERM`、缺依赖的适配器/MCP 用例）必须附基线原始输出与原因，不能笼统写「环境问题」。
- 任一命令无法运行、被跳过或未记录完整输出，按 `insufficient evidence` 处理，不得写成 pass。
- N/A 只允许用于「某项检查确实没有代码/测试面」的个别说明，且必须写明理由；不得用 N/A 跳过全量回归、e2e 或真实启动/演示。
- 全量回归证据只对当前候选有效；候选变化后受影响部分失效并重跑。

### 3.5 标准版本冻结

- 本文件版本为 `governance-split-1-3-5-criteria-v1`，写盘后冻结。实施开始后不得为适配候选修改本标准。
- 若发现标准本身有误、与方案 §11 冲突或与闸门 0/1 确认范围不一致：记录问题、理由和受影响行，递增为 v2，交沟通/统筹确认后再用新版本判定；受影响证据重新核对，旧报告过期。
- 本标准是管理记录，不是客户确认记录，也不是验收结论；标准版本变化不自动改变方案或团队计划。

---

## 四、验收标准

### 4.1 标准来源映射

#### 4.1.1 意图项与方案条目

| 意图/方案条目 | 覆盖行 | 说明 |
| --- | --- | --- |
| 第 1 项：团队判断/团队计划归统筹，Crew 只写卡 | P1–P6、G3、G4 | P1 职责与团队计划；P2 appointment 发起与守卫；P3 appointment→Crew 回路；P4 写卡校验与派 Convener；P5 flow/账本；P6 写权；G3 UI 同步；G4 兼容 |
| 第 3 项：验收先写标准、按风险档位判定 | P9–P13、P15 | P9 实施前标准；P10 档位/报告首行/全量回归条件；P11 证据复用；P12 acceptance 卡/账本/路径；P13 §二.9 一致；P15 测试与证据 |
| 第 5 项：Crew 写卡补能力与工作流描述 | P7–P8、G4 | P7 内容清单与结构硬校验；P8 readiness/gap；G4 既有角色兼容 |
| 非目标：第 2、4 项 | P14 | 客户入口、派发权不变 |
| 非目标：角色命名/路径 | P14、G3 | 内部 id/显示名/路径不变；只改相关文案 |
| 非目标：工程基线文本不变 | P13、P14 | `ENGINEERING_QUALITY_BASELINE` 与 §二.9 文本不变 |
| 候选/写集/证据流程 | G1、G2 | 技能验收要求与闸门 2 写集；不是新增产品需求 |

#### 4.1.2 §13 推荐 A 映射

| 问题 | 闸门 1 已选推荐 A | 覆盖行 |
| --- | --- | --- |
| Q1 团队计划路径与旧提名兼容 | `docs/scheduling/<flowId>-team-v1.md`；nominations 保留只读历史/过渡回落 | P1、G4 |
| Q2 Crew 的 `docs/nominations/` 写权 | 移除 | P6 |
| Q3 appointment 卡发起人 | Convener | P2 |
| Q4 步骤种类 | 不新增 `FlowStepKind`，用 step id + 现有 kind | P5 |
| Q5 风险档位载体与谁定档 | 变更包 `docs/scheduling/<flowId>-change-v1.md` 标 `riskTier`；团队计划为下限；Verifier 可升不可降 | P10 |
| Q6 实施派发是否硬性要求标准已写 | 是；`accept-quick`/旧流程显式豁免 | P9 |
| Q7 Verifier 是否仍自己跑测试/真实启动 | 默认核对原始证据，只补缺失/失效/高风险；真实启动/演示证据必须存在 | P11 |
| Q8 `docs/acceptance/` 与 `docs/verification/` 分工 | 标准/报告进 `docs/acceptance/`；详细证据留 `docs/verification/` | P12 |
| Q9 角色卡内容硬校验范围 | 结构硬校验 + Convener readiness；`api-spec.md` 可 `not-applicable` + 理由；只对 `new`/`changed` 强制 | P7、P8 |
| Q10 readiness 载体 | `docs/scheduling/<flowId>-readiness-v1.md` | P8 |
| Q11 旧流程/旧角色卡迁移 | 新流程新结构；旧文件保留；既有角色卡只做最低格式检查 | G4、P7 |
| Q12 UI 文案与角色命名 | 只改 appointment 徽标/Crew 提示；不改显示名/内部 id/路径 | G3、P14 |

#### 4.1.3 §9.8 选装映射

| 选装 | 状态 | 覆盖行 |
| --- | --- | --- |
| O1 Convener 写 `role-readiness` 记录 | 已选（推荐） | P8 |
| O2 实施派发前硬性要求验收标准已存在 | 已选（推荐） | P9 |
| O3 验收报告迁 `docs/acceptance/`，`docs/verification/` 只留证据附件 | 已选（推荐） | P12 |
| O4 旧 nomination 回落窗口 | 已选（一次性过渡，推荐） | G4 |
| O5 appointment 徽标/提示改「任命」 | 已选（推荐） | G3 |
| O6 新增固定测试角色 | 未选 | 不是本轮要求；不得顺手新增 |

### 4.2 验收表

下表是判定时使用的核心表格。实施前「实际证据路径/哈希」「结果」「验收判断」填「待提交/待判定」；判定时由独立验收按同一标准版本填入，不改变标准条文。

每行证据均须附：对应候选哈希、原始 `git status --short` / `git diff` 输出、产生该行结论的命令输出。涉及流程、UI、验收链路的行还须附 e2e 或真实启动/演示证据；只有角色自述或「工具成功」不构成原始证据。

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | 团队计划由 Convener 唯一撰写，放 `docs/scheduling/<flowId>-team-v1.md`（新版本 `-team-vN.md`），含 flowId/version/riskTier/推荐集及每个推荐角色的 roleId、职责目标、能力要求、唯一写集、依赖；Crew 只读团队计划，不再拥有提名/选择角色/组建团队职责，不再发 appointment、不再写 `docs/nominations/`。 | 角色卡文本与注册表 diff；团队计划模板/样例及 frontmatter；推荐集解析（内联数组）测试；Crew 发 appointment/写 nominations 的负例；Convener 不写角色卡的正例；e2e 时序；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 门禁引擎、编排、测试 | 待判定 | 待判定 |
| P2 | appointment 卡由 Convener 发起；卡前守卫确定性校验团队计划存在、flowId 一致、推荐集非空无重复不含内置角色、卡选项覆盖推荐集且不含内置角色、每个推荐角色有职责/能力/写集/依赖行；失败不生成客户卡、不镜像、不调判断、不写账本、不占 pending，退回 Convener。Crew 卡种白名单不含 appointment，Convener 含 appointment；不新增 `cardKind`。 | 卡种白名单/默认卡种 diff；卡前守卫负例矩阵；判断物证（teamPlan）diff；无效卡不写账本/不呈现的测试；e2e appointment 时序；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、运行时核心、门禁引擎、测试 | 待判定 | 待判定 |
| P3 | 客户 appointment 决定后，应用派 Crew（不是 Convener）执行写卡；任务含 flowId、团队计划路径/版本、任命名单、`stepId=role-cards`；账本 appointment 决定绑定团队计划 path/version/sha256；运行期 Set + 账本双重去重，重启/重复事件不重派、不漏派；拒绝/取消不派 Crew；客户手选与推荐集不同时按实际名单写卡。 | 应用回路 diff；e2e 时序；账本 `customer.decision{appointment}` 与 `dispatch.accepted` 输出；候选计划 artifactPath/Version/Sha256；重启/重复/拒绝/取消测试；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 桌面窗口、编排、测试 | 待判定 | 待判定 |
| P4 | Crew 写盘后应用强制刷新 listing 并跑扩展后的 `validateAppointmentArtifacts`；通过才派 Convener 做 readiness；失败按来源分流（Crew 文件 vs 团队计划）、反馈后重发 `appointment-write`、有界重试、最终失败落 Lead 系统行；不派 Convener、不把 appointment 步骤标 done。 | 校验器/反馈/系统行 diff；每个结构负例；来源分流测试；状态断言；e2e 写卡校验；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 桌面窗口、测试 | 待判定 | 待判定 |
| P5 | flow/账本同步：团队计划、readiness、验收标准、变更包作为 artifact 步骤可观察；appointment 决定的 power/物证更新（Convener 发起 → schedule；绑定团队计划版本/哈希）；不新增 `FlowStepKind`（Q4 A），用 step id + 现有 kind；旧 flow 不被破坏；不观察 `角色卡/`。 | flow-state/flow-service/ledger/judge 测试；flow YAML 模板；artifact.observed 输出；appointment power/物证断言；旧 flow 夹具；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、测试 | 待判定 | 待判定 |
| P6 | 写权只按本项调整：Convener `+docs/scheduling/`；Crew `−docs/nominations/` 并新增禁写 `docs/scheduling/`；Verifier `+docs/acceptance/`；其他角色不变；Convener 不获得 `角色卡/`；Crew 不获得 `docs/scheduling/`。 | 注册表 entries/preauthorized/forbidden diff；`write-team-plan` 门禁正/负例；写权正/负例测试；Liaison/其他角色 entries 未变 diff；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 门禁引擎、编排、测试 | 待判定 | 待判定 |
| P7 | 第 5 项内容清单落地：Crew 卡文本/写卡任务要求 + 确定性结构校验覆盖 role-card 必需章节、boundary 必填条目、feature-map、functional-description、memo、api-spec 或 `not-applicable` + 非空理由；完整清单只对 `new`/`changed` 角色强制，`existing` 只做存在/格式检查并记录 warning；不把文件存在当能力描述完成。 | Crew 卡文本/任务文案 diff；校验器负例矩阵；代表性角色卡样例；`l-crew-write-validation` e2e；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 门禁引擎、桌面窗口、测试 | 待判定 | 待判定 |
| P8 | 能力语义完整性由 Convener readiness 复核：`docs/scheduling/<flowId>-readiness-v1.md` 逐角色核对职责目标/能力/写集/依赖/交接/质量，`status: pass\|gaps`；gap 退回 Crew；计划缺细节退回 Convener；应用只宣称结构校验通过、不宣称能力描述已完成；readiness pass 后才派发项目角色。 | readiness 记录模板/样例；Convener 卡/提示 diff；gap/计划缺失回路测试；系统行文案；e2e；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 门禁引擎、编排、桌面窗口、测试 | 待判定 | 待判定 |
| P9 | 实施前标准：Verifier 在 appointment 决定后、实施派发前写 `docs/acceptance/<flowId>-criteria-v1.md`；标准含验收表、T0–T3 档位、判定规则、证据计划、版本冻结规则；版本/flowId 可核对；O2 硬门槛在 `evaluateDispatchGate` 对已有 appointment 决定的 flow 要求标准存在且结构合格，`accept-quick`/旧流程豁免须显式测试；缺失不派实施。 | 标准文件样例；派发门槛测试（缺失/结构不合格/豁免）；Verifier 任务文案 diff；`dispatchAcceptanceForFlow` diff；e2e 验收门槛；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 门禁引擎、编排、桌面窗口、测试 | 待判定 | 待判定 |
| P10 | 风险档位：变更包 `docs/scheduling/<flowId>-change-v1.md` 标 T0–T3；团队计划档位为下限；Verifier 可升不可降；报告首行五项（风险档位/判定依据/选定检查/复用证据/全量回归）；档位不符退回/升档；全量回归只在 T3/证据不足；`qualityTier` 不是风险档位；本任务 T3 必须执行适用全量回归。 | 变更包样例；判断门槛/报告首行测试；档位不符/降档/升档负例；本任务变更包（T3）；全量回归原始输出；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 统筹、编排、桌面窗口、测试 | 待判定 | 待判定 |
| P11 | 证据复用/检查选择：Verifier 核对开发/测试/装配角色的原始证据，只补缺失/失效/高风险；同候选有效证据可复用；候选/输入/依赖/契约变化使受影响证据失效；真实启动/演示证据必须存在（可由实施/装配/测试角色产出），缺失不得建议 accept；Verifier 不默认自己跑全部测试。 | Verifier 卡/提示/验收任务文案 diff；证据复用/失效测试；报告复用证据栏；真实启动/演示证据（命令/时间/候选/窗口截图或日志）；测试日志；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 门禁引擎、编排、桌面窗口、测试 | 待判定 | 待判定 |
| P12 | acceptance 卡/账本/路径：Verifier 在报告后发 `cardKind=acceptance`；标准/报告在 `docs/acceptance/`，详细证据在 `docs/verification/`；验收决定仍 `customer.decision{decisionKind:"acceptance"}`；判断门槛核对标准/报告/首行五项/档位不低于变更包/收尾门；不新增 `cardKind`/decision kind；标准/报告不是客户决定。 | 判断门槛/物证 diff；账本条目；路径断言；UI 提示 diff/测试；e2e；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、桌面窗口、桌面UI、测试 | 待判定 | 待判定 |
| P13 | 与工程法案 §二.9/工程基线一致：不重复、不弱化；真实启动/演示要求保留；T0–T3 定义引用 `references/testing.md`；不扩张写权；`ENGINEERING_QUALITY_BASELINE` 文本与 §二.9 文本不变。 | 规则对照表；基线文本与 `project-rules.md` diff（应为空）；报告；相关测试；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 独立验收、统筹、门禁引擎 | 待判定 | 待判定 |
| P14 | 非目标不变：第 2 项客户入口、第 4 项派发权、角色命名/内部 id/路径、其他无关治理差异均未改；不新增固定测试角色、不新增 `cardKind`、不删除历史。 | 代码/测试 diff；id/显示名 grep；客户入口/派发权回归测试；e2e；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 测试、独立验收、桌面窗口、编排 | 待判定 | 待判定 |
| P15 | 测试与证据：受影响单测/层测试/集成/e2e 更新并通过；T3 适用全量回归执行；原始输出可复算；不弱化断言；文档状态如实（`implemented-unverified`，不写 `verified`，不把计划写成结果）。 | 全部测试命令/输出；全量回归记录与 N3 基线对照；e2e；候选哈希；diff/status；文档状态摘录。 | 待提交 | 待提交（产品候选哈希，见变更包） | 测试、各实施角色、统筹 | 待判定 | 待判定 |
| G1 | 变更包完整、候选身份可复算：候选哈希（每个产品改动文件 `git hash-object` + `sha256sum`）、HEAD、改动路径、任务节点 N1–N11、证据链接、风险档位 T3、复用证据与失效说明；候选与证据匹配；`docs/` 管理记录不混入产品候选。 | 变更包原文；原始哈希/status 输出；验收复算输出；证据链接清单；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 统筹、独立验收 | 待判定 | 待判定 |
| G2 | 写集与授权：所有改动路径在闸门 2 确认的逐角色写集内；无越界、无保护文件/角色卡边界改动、无未授权用户改动；不提交/不推送/不合并/不发布；worker 不写 `docs/scheduling/`、`docs/acceptance/`；角色自身文档按写集允许。 | `git diff --name-only`/`--stat`/`status`/`--cached` 原始输出；与团队计划 §4.2/§8 对照；无提交记录；boundary 文件未变；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 统筹、独立验收 | 待判定 | 待判定 |
| G3 | UI 同步：appointment 徽标/提示改为「任命」、Crew 提示改为「客户任命后打开写卡」、下一步/报告路径/验收提示同步；角色显示名/内部 id/路径不变；客户入口不变。 | 渲染层 diff；`test/桌面UI/` 测试；`renderer.test.ts`；`typecheck:renderer`；`build:renderer`；真实启动/演示中的 UI 证据；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 桌面UI、测试 | 待判定 | 待判定 |
| G4 | 兼容与迁移（O4、Q1/Q11 A）：旧 nomination 文件保留只读/过渡回落；旧 flow YAML 与旧角色卡不被删除/重写；既有角色卡只做最低格式检查、不强制补齐第 5 项；新流程使用新结构；测试夹具使用独立 flowId/临时目录，不覆盖既有 `docs/scheduling/` 记录。 | 兼容/回落测试；旧 flow 夹具；文件清单/无删除 diff；测试夹具隔离证据；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、桌面窗口、测试 | 待判定 | 待判定 |

### 4.3 各标准的具体核对口径

#### 4.3.1 第 1 项：团队计划归统筹，Crew 只写卡（P1–P6、G3、G4）

##### P1：团队计划作者、路径与 Crew 只读

- `NOMINATOR_CARD_TEXT` 不得再有「提名权——选择角色、组建团队」或等价职责；必须改为：读客户确认后的团队计划、按任命名单写 `角色卡/<id>/**` 与配套工作文档、发 `appointment-write`、不改团队计划、不自行扩大职责、计划缺细节报告 Convener。
- `CONVENER_CARD_TEXT` 必须增加：写团队计划 `docs/scheduling/<flowId>-team-v1.md`、可发起 `request_choice(cardKind=appointment)`、在 Crew 写卡后做 readiness；保留「不写角色卡、不创建角色」。
- 注册表：Convener entries 增加 `docs/scheduling/`；Crew entries 移除 `docs/nominations/`；Crew 新增禁写 `docs/scheduling/`；其他角色不变。
- 团队计划机器字段：`flowId` 与文件名/flow YAML/卡片一致；`version` 正整数；`riskTier` T0–T3；`recommended` 必须内联数组（`recommended: [role-a, role-b]`）或固定行，不能用 YAML 块数组导致空推荐集；每个推荐角色必须有 roleId、职责目标、能力要求、唯一写集、依赖行。
- 负例：Crew 发起 appointment 被拒；Crew 写 `docs/nominations/` 被拒；Convener 写 `角色卡/` 被拒；团队计划缺失/flowId 不符/推荐集为空/角色行缺项时不发 appointment 卡。
- 证据：`governance-roles.ts` diff、注册表 diff、团队计划样例、`parseRecommendedRoleIds` 测试、`test/门禁引擎/governance-trio.test.ts`、`test/测试/governance-trio-verify/a-listing-sessions-writes.test.ts`、`test/测试/governance-e2e-auto/c-appointment-timing.test.ts` 原始输出。

##### P2：appointment 卡由 Convener 发起与卡前守卫

- `TRIO_CARD_KINDS`：nominator 不含 `appointment`；convener 含 `appointment`；`defaultGovernanceChoiceCardKind` 对 Convener 的 appointment 形状选项默认 `appointment`，对 Crew 不再默认 `appointment`。
- 卡前守卫必须在触达客户前完成六项校验：flowId 合法；团队计划存在可读；计划 frontmatter flowId 与卡片一致；`recommended` 非空、无重复、不含内置治理角色；卡选项覆盖 `recommended` 且不含内置角色；每个推荐角色有职责/能力/写集/依赖行。失败：不生成客户卡、不镜像、不调判断、不写账本、不占 pending，退回 Convener。
- 判断物证：`GovernanceAppointmentStepPayload.teamPlanPath?`（保留 `nominationPath?` legacy）；`GovernanceJudgeRequest`/`Context.artifacts.teamPlanPath?`；`requiredArtifactPaths`/`artifactRequired`/`addSpec`/prompt 的 appointment 物证改为团队计划；推荐集从团队计划解析。
- 不新增 `cardKind`；客户通道不变（第 2 项非目标）。
- 负例：计划缺失、flowId 不符、推荐集为空/重复/含内置角色、选项与推荐集不一致、角色行缺项；每个负例都断言没有客户卡、没有账本决定、没有 pending。
- 证据：`run-role.ts` diff、`runtime.ts` diff、`governance-judge-*.ts` diff、`test/编排/governance-judge.test.ts`、`test/测试/governance-e2e-auto/n-invalid-governance-card.test.ts`、`c-appointment-timing.test.ts` 原始输出。

##### P3：appointment 决定 → Crew 写卡回路、去重/重启、拒绝/取消

- `deriveGovernanceNextStep` 对 `cardKind="appointment"` 返回 Crew 写卡下一步（建议 `nextFunction="role-card-write"` / `roleId="nominator"`，或复用 `"nomination"` 但文案改为写卡；以实施为准，但不得返回 `schedule/convener`）。
- `advanceGovernanceFlow` 在 appointment 决定后：等来源 Convener 本轮 settle；强制刷新 listing；读账本最新 appointment 决定，取 `targetRoleIds` 和团队计划路径（优先账本 `artifactPath`；缺失时按 flowId 派生最新 `-team-vN.md`；仅 legacy 才回落 nomination，绝不猜）；后台打开 Crew，投递唯一一条写卡任务；任务文本包含 flowId、团队计划路径/版本、任命名单、`stepId=role-cards`、只写名单内角色、逐路径确认、计划缺细节报告 Convener、不自行扩大职责；投递成功后写 `dispatch.accepted{actorRoleId:"app", power:"app", targetRoleId:"nominator", stepId:"role-cards", trigger:"customer-decision"}`。
- 去重双重：运行期 Set 键 `<projectRoot>\0<flowId>\0appointment-crew`（投递前占位、成功保留、失败释放）；账本同 flowId 已有 `dispatch.accepted{targetRoleId:"nominator", stepId:"role-cards"}` 则不重复派。重启/重复事件：不重派、不漏派；Crew 尚未写出角色卡时，后续检查可在账本 appointment 决定后重新派写卡任务（有界，不循环）。
- 拒绝/取消：`customer.decision` 记 `unclassified/none`，不派 Crew；Convener 收到 declined 原因，修订团队计划（v2）后重发 appointment 卡；应用不自动重发、不猜客户意图。
- 客户手选与推荐集不同：按实际选择记录 `targetRoleIds`；Crew 按实际名单写卡；Convener 应修订团队计划为 v2 以反映实际任命。
- 不是派 Convener：appointment 决定后直接派 Convener 会让它在角色未写出时反复报「未枚举」；必须走 Crew。
- 证据：`governance-advance.ts`/`interface.ts`/`run-role.ts` diff；`findDecisionArtifact`/`latestVersionedArtifact` 扩展；`c-appointment-timing.test.ts`、`i-full-chain.test.ts`；重启/重复/拒绝/取消单元或夹具测试；账本原始输出。

##### P4：Crew 写卡后的结构校验与派 Convener 时机

- `validateAppointmentArtifacts` 扩展后至少检查：`role-card.md` 存在/非空/有 Markdown 标题；`boundary.yaml` 可解析、顶层 `role` 与目录一致、`entries` 非空且含必填工作文档条目；第 5 项要求的工作文档（见 P7）；`listProject` 警告。
- 写盘后强制刷新 listing；按 appointment 名单逐角色校验；通过才派 Convener 做 `role-readiness`；失败按来源分流：Crew 文件问题 → 反馈 Crew，修正后重发 `appointment-write`；团队计划缺职责/能力/写集 → 反馈 Convener 补充，Crew 暂停；重试有界、同 flow+问题哈希去重、不刷屏、不循环；最终失败落 Lead 系统行，不派 Convener、不把 appointment 步骤标 done。
- 成功后写 `dispatch.accepted{targetRoleId:"convener", stepId:"role-readiness"}`（或复用现有 appointment→convener 去重键），保留运行期+账本双重去重。
- 证据：`interface.ts` 校验/反馈/`runPostWriteAdvanceCheck` diff；`test/桌面应用/interface.test.ts` 各分支；`l-crew-write-validation.test.ts`；状态断言与系统行原文。

##### P5：flow 步骤、账本与物证同步

- 不新增 `FlowStepKind`（Q4 A）。新流程使用 step id：`team-plan`、`appointment`、`role-cards`、`role-readiness`、`acceptance-criteria`、`delivery-*`、`verification-evidence`、`change-package`、`verification`；kind 仍为现有 `dispatch`/`customer-decision`/`artifact`/`acceptance`。
- `flow-state.ts` 解析/序列化/保留 id 规则不被破坏；旧 flow YAML 仍可解析；`flowStepEvidenceKind` legacy 映射增加 `team-plan*`→artifact，旧 `nomination*`→decision 保留。
- `flow-service.ts::artifactPowerOf` 保持现有映射：convener→`schedule`、nominator→`nomination`、verifier→`verification`；团队计划/readiness/标准/变更包作为普通项目相对路径被 `artifact.observed` 观察；不观察 `角色卡/`。
- `governance-ledger.ts` 不新增 `GovernancePower`/`GovernanceDecisionKind`；appointment 决定 power 由 Convener 职能决定（`schedule`，行为变化需测试同步）；appointment 决定绑定团队计划 path/version/sha256。
- `latestVersionedArtifact` 必须支持 `docs/scheduling/<flowId>-team-vN.md`；不能靠猜目录或静默回落。
- 证据：`flow-state.test.ts`、`flow-service.test.ts`、`governance-ledger.test.ts`、`governance-judge.test.ts`；flow YAML 模板；旧 flow 夹具；`i-full-chain.test.ts`。

##### P6：写权调整边界

- 只允许：Convener `+docs/scheduling/`；Crew `−docs/nominations/`，新增禁写 `docs/scheduling/`；Verifier `+docs/acceptance/`。
- 不允许：Convener 获得 `角色卡/` 写权；Crew 获得 `docs/scheduling/` 写权；Liaison/Rapporteur/Lead/项目 worker 写权变化。
- `governance-gate.ts::GovernanceGateAction`/`ACTION_ROLE` 新增 `write-team-plan`→convener（或保留 `write-nomination` legacy + 新动作）；`write-role-card` 仍→nominator；`run-role.ts::governanceActionForPath` 路由 `docs/scheduling/<flowId>-team-vN.md`→`write-team-plan`，`docs/nominations/**` 保留 legacy。
- `LIAISON_WRITE_OWNER_HINTS` 增加 `docs/scheduling/`→Convener、`docs/acceptance/`→Verifier；更新 Crew 提示（移除 nominations）。
- 证据：注册表 diff；`governance-trio.test.ts` 写权正/负例；`governance-liaison-verify/a-roles-writes-caps.test.ts`；其他角色 entries 未变 diff；`governance-gate.test.ts`。

##### G3：UI 同步

- `governance-view.ts`：appointment 徽标/提示从「提名」改为「任命」；Crew 提示改为「客户任命后打开写卡」；下一步文案同步。
- `role-view.ts`：nomination 说明文案更新；**不改**显示名/内部 id/路径。
- Verifier settle 提示的报告路径改为 `docs/acceptance/<flowId>-report-v1.md`，附件提示 `docs/verification/`；验收卡徽标/提示补档位/标准版本。
- 客户入口/镜像路由不变（第 2 项非目标）。
- 证据：渲染层 diff；`test/桌面UI/governance-view.test.ts`、`role-view.test.ts`；`test/桌面应用/renderer.test.ts`；`npm run typecheck:renderer`；`npm run build:renderer`；真实启动/演示中的 UI 截图或日志。

##### G4：兼容与迁移（O4、Q1/Q11 A）

- 旧 `docs/nominations/<flowId>-v1.md` 保留为历史/迁移兼容；新流程优先团队计划；旧流程在过渡期可回落提名文件（O4），但不得把回落当成新流程默认路径。
- 旧 flow YAML（含 `nomination` 步骤）继续有效；不强制改写；新 flow 使用新 step id。
- 既有角色卡保留；第 5 项完整清单只对 `new`/`changed` 角色强制，`existing` 只做存在/格式检查并记录 warning；不一次性重写全部历史角色卡。
- 历史 nomination 文件、旧 flow YAML、既有角色卡不删除、不重写。
- 产品运行期测试夹具必须使用独立 flowId/临时目录，不覆盖本仓库既有 `docs/scheduling/2026-10-22-acceptance-risk-tier.md` 等调度记录（团队计划 §九.20）。
- 证据：兼容/回落测试；旧 flow 夹具；文件清单/无删除 diff；测试夹具隔离证据。

#### 4.3.2 第 5 项：Crew 写卡补齐能力与工作流描述（P7–P8）

##### P7：内容清单与确定性结构校验

- **Crew 卡文本与写卡任务**必须列出完整清单：role-card 的角色名/组别/工作立场、能力描述、职责与功能导航、必读资料、交接输入输出、执行原则、质量职责、标准工作流、交付物清单；`feature-map.md`、`functional-description.md`、`memo.md`、`api-spec.md`（或 `not-applicable` + 非空理由）；`boundary.yaml` 含角色根工作文档条目与实际写集。内容以团队计划的职责目标/能力/写集/依赖为准；计划缺细节只报告 Convener，不自行扩大职责。
- **确定性校验最低门槛：**
  - `role-card.md` 存在、非空、有 `#` 标题；含能力描述、职责/功能导航、必读资料、交接、执行原则、质量、标准工作流、交付物等等价章节。
  - `boundary.yaml` 可解析、`role` 与目录一致、`entries` 非空；至少含 `角色卡/<id>/feature-map.md`、`functional-description.md`、`memo.md`、`api-spec.md` 以及实际写集条目。
  - `feature-map.md` 存在、非空、有标题；有功能时至少有表格/列表行；无功能时如实声明。
  - `functional-description.md` 存在、非空、有标题；含职责/交接/文档/代码位置或等价文本。
  - `memo.md` 存在、非空；至少一行 `YYYY-MM-DD`；不是角色定义/任务状态/验收结论。
  - `api-spec.md` 存在、非空；有导出/共享/装配接口时含接口章节；无导出时可写 `not-applicable` + 非空、可核对理由。
  - `docs/feature/<feature-id>.md` 仅在角色拥有系统功能时要求；`docs/design|change|fix/` 仅有实际记录时要求，不创建空目录/空文件冒充交付。
- **强制范围：** `new`/`changed` 角色应用完整清单；`existing` 角色只做存在/格式检查并记录 warning（Q9/Q11 A）。不得把完整清单套到所有既有角色导致一次性重写。
- **不得假阳性：** 结构校验成功文案只写「结构校验通过（文件/章节齐全），能力内容待 Convener 角色就绪复核」，不写「能力描述已完成」。
- 证据：Crew 卡文本/任务文案 diff；校验器负例矩阵（缺 role-card、空文件、无标题、boundary 非法、role 不一致、entries 空、缺工作文档、api-spec 无理由）；代表性角色卡样例；`l-crew-write-validation.test.ts`。

##### P8：Convener readiness 与 gap 回路

- `docs/scheduling/<flowId>-readiness-v1.md`（Convener 写）：frontmatter `flowId`/`version`/`status: pass|gaps`；逐角色核对职责目标、能力要求、写集/边界、依赖/交接、质量责任，每项 pass/gap + 证据（role-card 行号/文件）。
- gap → 应用退回 Crew 修正；团队计划缺能力细节 → 反馈 Convener 补充；Crew 暂停，不自行补计划；readiness pass 后才派发项目角色。
- readiness 记录不是验收标准、不是客户确认；只是 Convener 的角色就绪判断和返工依据。
- 应用只按结构校验结果推进，不宣称语义能力已完成；系统行/提示文案不得把「文件存在」写成「能力描述已完成」。
- 证据：Convener 卡/提示 diff；readiness 样例；gap/计划缺失回路测试；系统行原文；e2e。

#### 4.3.3 第 3 项：验收先写标准、按风险档位判定（P9–P13、P15）

##### P9：实施前标准与派发门槛（O2）

- 触发：闸门 2/团队确认（appointment 决定）后、实施派发前；应用派 Verifier 写标准（不是验收卡）；可在 Crew 写卡/readiness 期间并行，但必须在实施派发前完成。
- 标准文件 `docs/acceptance/<flowId>-criteria-v1.md` 必须含：基线（客户确认方案版本、意图、团队计划/gate 2 记录只作范围）、范围/写集/非目标、验收表（ID/标准/需要的证据/实际证据路径/哈希/候选版本/产出角色/结果/验收判断）、风险档位与依据、选定检查/复用规则/全量回归条件、成功/失败/边界情形、候选身份/证据失效规则、判定规则（pass/fail/insufficient evidence/not applicable）、版本冻结规则。
- 应用确定性门槛（推荐/O2）：标准存在、非空、flowId 与 flow 一致；含验收表和 T0–T3；含判定规则；版本/哈希可复算；不满足不派实施或退回 Verifier 补充，不把「标准待补」当通过。
- O2 硬门槛：`evaluateDispatchGate` 对已有 appointment 决定的 flow，在派发项目角色前要求标准存在且结构合格；`accept-quick`/旧流程显式豁免，豁免必须有测试，不能静默绕过新 flow。
- 本任务自身：本标准在实施前写盘并冻结；判定时须核对实施证据晚于本标准写盘时间。
- 证据：Verifier 卡/`govern-session.ts`/`dispatchAcceptanceForFlow`/`evaluateDispatchGate` diff；标准文件样例；派发门槛负例；豁免测试；`f-acceptance-gate.test.ts`、`i-full-chain.test.ts`。

##### P10：风险档位、变更包与报告首行

- 档位定义以技能 `references/testing.md`「Risk-Based Verification and Change Packages」为唯一口径；不自创 T4/T0.5 等档位；`qualityTier`（prototype/production）不是风险档位。
- 变更包 `docs/scheduling/<flowId>-change-v1.md`：frontmatter `flowId`/`version`/`riskTier`/`candidate`/`changedPaths`/`evidence`；正文含候选与范围、任务节点、证据链接、档位依据、复用证据与失效说明。
- 团队计划先标计划档位；变更包按当前候选复核实际档位；两者不一致取更高档并记录理由，不得低于团队计划档位。
- Verifier 可升档（证据不足/风险更高），不能降档；升档写入报告首行与理由。
- 报告首行五项：风险档位、判定依据、选定检查、复用证据、全量回归（已执行或 N/A + 理由）。缺一不可。
- 判断门槛：`verifyAcceptanceMechanics` 在流程收尾门之外要求标准/报告存在、报告首行五项、报告档位不低于变更包档位；缺失/不一致 → `insufficient-evidence`/manual，不 auto-approve。
- 全量回归只在 T3 或证据不足时执行；本任务 T3，必须执行适用全量回归，不得用 N/A 掩盖代码/测试面。
- 证据：变更包样例；判断门槛/报告首行测试；档位不符/降档/升档负例；本任务变更包（T3）；全量回归原始输出。

##### P11：证据复用与检查选择

- Verifier 默认：读变更包（候选哈希、改动路径、任务节点、证据链接、风险档位）；先核对档位与改动是否相符；只跑/只核对受影响路径的检查；T0 文档/链接/格式，T1 受影响单测/层测试，T2 受影响角色测试+跨契约集成，T3 适用全量回归+发布/共享抽象检查。
- 证据来源：开发角色（单测/层契约）、项目管理角色（shared，如已建立）、固定测试角色或团队计划指定角色（跨角色/完整流程/回归）、装配角色（构建/启动/接线）、实施/装配/测试角色（真实启动演示）；Verifier 核对原始证据，只补缺失/失效/高风险。
- 同候选、同输入/依赖、同命令的证据可复用；候选/输入/依赖/契约/夹具/配置变化 → 受影响证据失效，只补失效部分。
- 真实启动/演示证据必须存在：启动命令、时间、候选/版本、访问地址或窗口截图/录屏清单、日志；至少覆盖一条治理链路（团队计划→appointment→Crew 写卡→readiness→实施→标准/变更包→Verifier 报告/acceptance）。缺失、失效或高风险时要求补做/复跑；没有真实启动/演示证据不得建议 accept。
- Verifier 不默认自己跑全部测试，也不把真实启动/演示当成自己的唯一职责；但保留在证据缺失/失效/高风险时亲自复跑的能力。
- 证据：Verifier 卡/提示/验收任务文案 diff；证据复用/失效测试；报告复用证据栏；真实启动/演示证据；测试日志。

##### P12：acceptance 卡、账本与路径

- Verifier 在报告完成后发 `request_choice(cardKind=acceptance, accept/reject)`；实施前的 Verifier 只写标准，不发验收卡。
- 路径：标准/报告 `docs/acceptance/`；详细原始证据/核对附件 `docs/verification/`；报告链接标准版本/哈希，附件链接报告。
- 账本：appointment/acceptance 决定不变；标准/报告/变更包是 `artifact.observed`（flow 步骤 evidence）或普通文件，不是客户决定；应用派 Verifier 写标准记 `dispatch.accepted{targetRoleId:"verifier", stepId:"acceptance-criteria"}`；判定沿用 `dispatch.accepted{targetRoleId:"verifier", stepId:"verification"}`；验收决定仍 `customer.decision{decisionKind:"acceptance"}`。
- 判断门槛：acceptance 卡判断上下文增加 `acceptanceCriteriaPath`/`acceptanceReportPath`/`changePackagePath`/`riskTier`；`verifyAcceptanceMechanics` 要求标准存在/flowId 一致、报告存在/首行五项/档位不低于变更包、流程收尾门通过；缺失/不一致 → `insufficient-evidence`/manual，不 auto-approve。
- UI：Verifier settle 提示报告路径改为 `docs/acceptance/<flowId>-report-v1.md`；验收卡徽标/提示补档位/标准版本；不改客户入口。
- 写盘确认：Verifier 写标准/报告仍用 `request_confirmation(cardKind=write, flowId, 逐路径)`；不新增 cardKind。
- 证据：判断门槛/物证 diff；账本条目；路径断言；UI diff/测试；e2e。

##### P13：与工程法案 §二.9 和工程基线一致

- 逐项对照 §二.9：统筹在变更包标 T0–T3；档位定义引用 `references/testing.md`；不得为省检查压低档位；验收先核对档位并记录；T0 只查文档、T1 单测、T2 集成、全量只在 T3/证据不足；报告首行五项；不扩张写权。
- `ENGINEERING_QUALITY_BASELINE` 的「验收前必须真实启动应用并演示」文本不变；变的只是证据来源与核对方式（实施/装配/测试角色产出，Verifier 核对），不得弱化或删除该要求。
- `角色卡/项目管理/docs/project-rules.md` §二.9 文本不变；本任务不改工程法案。
- 不得自创档位定义、不得把全量回归改成默认执行、不得把「治理/权限变更」压成 T0。
- 证据：规则对照表；`governance-roles.ts` 中 `ENGINEERING_QUALITY_BASELINE` 文本未变 diff；`project-rules.md` 未变 diff（应为空）；报告；相关测试。

##### P15：测试、全量回归与文档状态

- 受影响测试更新并通过：`test/runtime-core/`、`test/门禁引擎/`、`test/编排/`、`test/桌面应用/` 既有四个精确文件、`test/桌面UI/`、`test/测试/` 的 e2e/跨角色/负例（至少覆盖方案 §10.2 与团队计划 §4.2 列明文件）。
- T3 全量回归：按 §3.4 执行并记录；与 N3 基线对照；本次新增失败为零；既有失败有基线证据和分类。
- 原始输出可复算：命令、退出码、cwd、时间、执行者、环境（Node/npm/OS/Shell）、测试计数（pass/fail/skip）、失败原文；跳过项写明原因。
- 不弱化断言：不得为保绿删除测试、放松断言、放宽权限或隐藏错误；测试 diff 必须对应真实行为变化；新增负例覆盖方案 §8.6 与团队计划 §4.2 的可观察交付。
- 文档状态如实：实现完成但未验收的文档状态写 `implemented-unverified`，不写 `verified`；不把计划写成结果；不声称已提交/推送/发布。
- 证据：全部测试命令/输出；全量回归记录；e2e；候选哈希；diff/status；角色文档状态摘录。

#### 4.3.4 非目标（P14）

- **第 2 项客户入口：** 多个治理角色可直接发客户卡的现状不变；卡镜像路由、`request_choice`/`request_confirmation` 客户通道不变；不把入口收窄到 Lead。
- **第 4 项派发权：** `dispatchTask`/`coordinate` 门/应用后台派发矩阵不变；不新增或转移派发权。appointment→Crew 是治理卡后续任务，不是派发权转移；不得以此为由扩大 Convener/Crew 的派发能力。
- **角色命名/路径：** `liaison`/`rapporteur`/`nominator`/`convener`/`verifier`、显示名、`GovernanceFunction` 值不变；只更新与第 1、3 项直接相关的卡文本和 UI 文案。
- **其他治理差异：** 与本轮无关的验收流程、客户入口、派发结构、卡镜像、判断开关等不改。
- **不新增固定测试角色（O6 未选）；不新增 `cardKind`；不新增 `FlowStepKind`（Q4 A）；不删除历史。**
- 证据：代码/测试 diff；`grep` id/显示名；客户入口/派发权回归测试；e2e。

#### 4.3.5 候选、变更包与写集（G1–G2，流程核对）

##### G1：变更包与候选身份

- 变更包至少含：任务 ID、产品 flowId、候选哈希（每个产品改动文件的 `git hash-object` + `sha256sum`）、`git rev-parse HEAD`、改动路径、任务节点 N1–N11、证据链接、风险档位 T3、复用证据与失效说明。
- 候选哈希必须可复算；验收只读复算并与变更包对照。候选与证据不匹配 → `insufficient evidence`；候选变化 → 按 §3.3 重取。
- 管理记录（顶层 `docs/`）不混入产品候选；不得用 `docs/` 文件的哈希代替产品文件哈希。
- 证据：变更包原文；原始 hash/status 输出；验收复算输出。

##### G2：写集与授权

- `git diff --name-only` / `git diff --stat` 的所有改动路径必须落在团队计划 §4.2/§8 的逐角色写集内；`git diff --cached --name-only` 为空（不暂存）；无提交、无推送、无合并、无发布。
- 不得出现 `角色卡/*/boundary.md`、`boundary.yaml`、`role-card.md` 的未授权改动；不得出现 `package.json`/`tsconfig*.json`/`vite.config.ts` 等构建配置改动（本任务默认不改）。
- `test/桌面应用/` 不得新建文件（除非闸门 2 另有精确单文件确认）；worker 不得写顶层 `docs/scheduling/`、`docs/acceptance/`。
- 角色自身文档（`角色卡/<role>/api-spec.md`、`角色卡/<role>/docs/**`、`memo.md`）按团队计划允许；不得把顶层 `docs/` 管理记录写成 worker 交付。
- 证据：`git diff --name-only`/`--stat`/`status`/`--cached` 原始输出；与团队计划写集对照表；无提交记录；boundary/role-card 文件未变。

### 4.4 不适用（N/A）说明

- **P1–P15 全部适用，不得整行标 `not applicable`。** 本任务有代码/测试面，T3 全量回归必须执行，不能用 N/A 掩盖。
- 行内允许的 N/A 仅限：
  - **P5 的「或按客户选择的新枚举一致」备选分支**：闸门 1 已选 Q4 A（不新增 `FlowStepKind`），该备选分支不适用；P5 主标准（不新增枚举、artifact 可观察）仍须判定。若实施擅自新增枚举，按违反 Q4 A 判 **fail**，不得按 N/A 放过。
  - **P7 的 `api-spec.md` 内容**：角色无导出/共享/装配接口时，可写 `not-applicable` + 非空、可核对理由（方案 §6.1 #14）；文件本身仍必须存在、非空。
- 除上述行内分支外，任何 N/A 都必须写明依据；无法说明依据的 N/A 按 `insufficient evidence` 处理。

---

## 五、判定条件

### 5.1 每行的验收判断

| 判断 | 含义 | 本任务示例 |
| --- | --- | --- |
| **pass** | 该行标准已被当前候选满足；证据是原始的、对应当前候选、足以覆盖标准。 | Convener 发 appointment 且守卫负例齐全；appointment→Crew 恰一次；写卡失败不派 Convener；T3 全量回归无新增失败。 |
| **fail** | 已有证据表明候选不满足该行标准，或候选包含明确不允许的改动。 | Crew 仍能发 appointment/写 nominations；appointment 后直接派 Convener；新增 FlowStepKind；写入越界；治理变更压 T0。 |
| **insufficient evidence** | 尚不能判断：证据缺失、输出不完整、候选/版本不符、基线不可得、命令无法复算、报告未产生等。 | 没有原始测试输出；哈希只有自述；全量回归未跑；真实启动/演示缺失；报告首行缺项。 |
| **not applicable** | 该行标准确实不适用于本任务/分支，且必须写明依据。 | 仅 §4.4 列出的行内分支；P1–P15 不得整行 N/A。 |

### 5.2 总体结论

- **通过：** 所有适用行（P1–P15、G1–G4）均为 pass；候选哈希与证据一致；T3 全量回归对当前候选执行且无本次新增失败；真实启动/演示证据有效；标准/报告/变更包齐备。
- **返工：** 任一行 fail。列出差异、依据和应回到的所有者（按团队计划：门禁引擎/编排/运行时核心/桌面窗口/桌面UI/测试/统筹），由统筹安排修复与复测；验收不代改。
- **证据不足：** 没有 fail，但任一行 insufficient evidence。列出缺什么、由谁补（对应产出角色/统筹），不能记通过。
- 若同时存在 fail 与 insufficient evidence：总体结论按**返工**，同时在报告中列出待补证据，避免修复后重复缺证。
- `not applicable` 不得把不适用的行算作 pass；本任务 P1–P15 不应出现整行 N/A。
- 验收结论只对当前候选有效；候选变化后按 §3.3 重新判断受影响部分。

### 5.3 报告要求与效力

- 验收报告路径：`docs/acceptance/governance-split-1-3-5-report-v1.md`（由独立验收写，不由统筹代写）。
- 报告**首行**必须含五项：`风险档位：T3｜判定依据：治理/权限变更（依据 references/testing.md；治理变更即使只改文档也非 T0）｜选定检查：…｜复用证据：…（来源/候选/仍有效理由，或「无」）｜全量回归：已执行/ N/A + 理由`。本任务全量回归应写「已执行」，不得写 N/A。
- 报告须链接：任务/阶段、客户确认的策划方案版本（路径+哈希）、本标准版本 `governance-split-1-3-5-criteria-v1` 与判定时计算的哈希、候选哈希、变更包、原始证据路径/哈希、未解决问题、结论理由。
- 报告须包含完整验收表（P1–P15、G1–G4），逐行填实际证据、结果、验收判断；不得只写「已完成」或「通过」而无表。
- 验收通过只表示当前候选满足本标准；**不授权提交、推送、合并、发布或任何对外操作**。统筹只能按匹配当前候选的通过结论放行。

---

## 六、统筹应提交的变更包与证据

判定阶段统筹须提交以下内容（缺少任一项会形成 `insufficient evidence`，除非验收能只读复算）：

### 6.1 变更包

- 路径：`docs/scheduling/governance-split-1-3-5-change-v1.md`。
- 内容：任务 ID、产品 flowId、候选哈希（每个产品改动文件 `git hash-object` + `sha256sum`）、`git rev-parse HEAD`、改动路径、任务节点 N1–N11、证据链接、风险档位 **T3**、复用证据与失效说明。

### 6.2 原始命令输出

- `git rev-parse HEAD`；
- `git status --short`；
- `git diff --name-only`；如暂存，另附 `git diff --cached --name-only`；
- `git diff --stat`；
- 完整 `git diff`（至少覆盖所有改动 hunk；过大时按文件分段，不可截断到无法核对）；
- 每个产品改动文件的 `git hash-object` 与 `sha256sum`；
- 基线 N3 与最终候选的测试命令、退出码、cwd、时间、执行者、环境（Node/npm/OS/Shell）、测试计数、失败原文。

### 6.3 测试与 e2e 证据

- 定向测试：`test/runtime-core/`、`test/门禁引擎/`、`test/编排/`、`test/桌面应用/` 四个精确文件、`test/桌面UI/`、`test/测试/` 相关 e2e/负例。
- T3 全量回归：`node --test "test/**/*.test.ts"`、`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`（以仓库实际脚本为准）。
- 基线 N3：实施前对当前 HEAD 跑同一组命令的原始输出、计数、失败分类；最终结果与基线逐项对照。
- e2e：至少一条完整链路（团队计划→appointment→Crew 写卡→readiness→实施→标准/变更包→Verifier→acceptance）及负例（拒绝/取消、计划缺失、Crew 未写卡、校验失败、证据不足、档位不符）。

### 6.4 真实启动/演示证据

- 启动方式：`npm run app`（Electron）或既有 `test/桌面应用/e2e/main.mjs` 总自检台；必须是真实启动应用，不能用纯单元测试/mock 代替。
- 记录：启动命令、时间、候选/版本、访问地址或窗口截图/录屏清单、日志；至少覆盖一条治理链路的关键变化（团队计划→appointment→Crew 写卡→readiness→实施→标准/变更包→Verifier 报告/acceptance）。
- 缺失、失效或无法对应候选时不得建议 accept；验收按 `insufficient evidence` 处理。

### 6.5 文档与角色报告

- 各实施角色的完成报告：候选哈希、diff/status、改动路径、测试命令/输出、未解决问题、写集越界声明。
- 角色自身文档状态：`角色卡/<role>/api-spec.md`、`角色卡/<role>/docs/change/2026-10-22_change_governance-split-1-3-5.md`（或同主题单篇）、`memo.md`（按需）；实现完成但未验收的状态写 `implemented-unverified`。
- 文档不得把计划写成结果，不得声称已提交/推送/发布。

### 6.6 证据路径/哈希与复用说明

- 每份证据文件的路径与 SHA-256（若以文件形式提交）；或任务记录中的原始输出位置。
- 复用证据：来源、原候选哈希、原命令、仍然有效的理由；本任务预计复用 N3 基线仅用于失败分类，不作为最终候选验证。
- 未解决事项：实施中发现的歧义、与方案/团队计划的冲突、需要沟通澄清的问题。

---

## 七、判定时的只读检查步骤

验收判定时按以下顺序执行，只读，不改产品代码、测试、角色卡、边界、方案、团队计划、沟通记录或调度记录：

1. **核对基线：** 读取 `docs/communication/2026-10-22_intent_governance-split-1-3-5.md` 的闸门 0/1/2 与实施授权记录；核对方案、意图、团队计划版本与 §2 哈希；确认方案 v1 是客户确认版本。若基线文档变化，按 §3.3/§3.5 处理。
2. **核对候选身份与变更包：** 复算 `git rev-parse HEAD`、各产品文件 `git hash-object`/`sha256sum`、`git status --short`、`git diff --name-only`/`--stat`/`--cached`；与变更包对照；确认候选冻结、证据对应当前候选。
3. **核对档位：** 确认变更包为 T3，档位与改动相符；若不符，退回统筹或按更高档补证；验收可升档，不能降档。
4. **核对写集（G2）：** 将改动路径与团队计划 §4.2/§8 逐角色写集对照；确认无越界、无保护文件改动、无提交/推送/发布、worker 未写顶层 `docs/scheduling/`、`docs/acceptance/`。
5. **核对第 1 项（P1–P6、G3、G4）：** 读角色卡文本/注册表/回路/校验/flow/账本/UI diff；核对负例测试、e2e、账本输出、写入权限、兼容性。
6. **核对第 5 项（P7–P8）：** 读 Crew 卡/校验器/readiness 样例；核对内容清单、结构负例、new/changed vs existing、gap 回路。
7. **核对第 3 项（P9–P13、P15）：** 读标准/变更包/报告样例与判断门槛；核对报告首行五项、档位不匹配负例、证据复用/失效、acceptance 卡/账本/路径。
8. **核对测试与全量回归（P15）：** 对照 N3 基线与最终候选的原始输出；确认无本次新增失败；确认 e2e、真实启动/演示证据存在且对应当前候选；确认断言未弱化、文档状态如实。
9. **核对非目标（P14）：** 检查第 2/4 项、角色命名/路径、工程基线文本未变；确认无 O6/新 cardKind/新 FlowStepKind/历史删除。
10. **填写验收表并给结论：** 按 §5 逐行填 pass/fail/insufficient evidence/not applicable；写报告，首行五项，链接证据与未解决问题；报告只对当前候选有效。

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

1. **方案文件头状态与闸门 1 记录不一致：** 方案文件头仍写「草案 v1（待闸门 1 方案确认）」，沟通记录已确认。本标准按团队计划 §2.2 以沟通记录为授权事实，不改方案文件。若沟通认为必须在实施前更新方案状态头，请先处理；否则按本文件执行。
2. **`docs/` 跟踪状态与候选口径：** `docs/` 只有 6 个既有文件被跟踪，本轮方案/团队计划/标准/报告/变更包多为未跟踪管理记录。候选身份以产品代码/测试/角色卡文件哈希与已跟踪 diff 为准，不把管理记录混入产品候选；不得以「未跟踪所以不算改动」为由在 `docs/` 或其他未跟踪路径写实施产物。
3. **Node 不在验收 shell 的 PATH：** 验收实测 Node v24.22.1 位于 `C:\Users\51054\AppData\Local\Programs\nodejs\node.exe`，但 `node` 不在当前 Git Bash PATH。证据必须记录实际调用方式；测试角色应在自己的环境中确认 `node --test` 可执行并记录版本。若某命令因 PATH/环境不可用，按 `insufficient evidence` 处理，不能写成通过。
4. **真实启动/演示的可执行程度：** 团队计划 §6.4 指定测试角色产出；若 `npm run app` 或 `test/桌面应用/e2e/main.mjs` 在当前环境无法真实启动，测试角色须在证据中说明并给出可核对日志；验收不得用单元测试/mock 代替，缺失则 `insufficient evidence`。
5. **产品运行期 `docs/scheduling/` 与项目调度记录同名风险：** 产品 Convener 的团队计划/readiness/变更包使用 `<flowId>-team-vN.md` 等命名；测试夹具必须使用独立 flowId/临时目录，不覆盖本仓库既有 `docs/scheduling/2026-10-22-acceptance-risk-tier.md` 等记录（团队计划 §九.20）。
6. **本任务不使用项目 `角色卡/独立验收` worker：** 按团队计划 §3.3 E/§4.3，本任务只用内置独立验收写 `docs/acceptance/`；项目 worker 的边界不含该目录。若沟通/统筹改变该安排，需先更新团队计划并重开闸门 2，本标准不据此判定。
7. **报告首行的自检性质：** 验收报告由独立验收自己写，报告首行五项是本任务的过程要求与产品 P10/P13 的核对对象；没有第二个验收角色复核。沟通/统筹可检查格式，但不能替验收改结论。
