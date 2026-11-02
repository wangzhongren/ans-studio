# 验收完成标准：派发护栏只保留「谁能给谁派发」（dispatch authorization only）——实施前标准 v1

- 风险档位：**T3**（方案 §9 与闸门 1 定档、闸门 2 确认；派发受理语义属于治理/权限边界变更，不是纯文档或局部实现；不压档、不降档）。升档与停止条件见 §5.7；升档不降档。
- 判定依据：客户闸门 0/1/2 确认记录 `docs/communication/2026-11-02_intent_dispatch-guardrail-relax.md`（写标准时 **117 行** / SHA-256 `84d097926f9c39e14bc76f1a773c49fd0b7e0e370664b2283814854759cae996`，含闸门 0、闸门 1、闸门 2 确认小节；该文件是沟通管理记录、可能继续追加，验收时引用其确认小节而不引用固定行号，历史快照见 §1.1）；客户在闸门 1 确认的策划方案 **P1.1** `docs/planning/2026-11-02_design_dispatch-guardrail-relax.md`（**877 行** / SHA-256 `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649`）的 §1.2（授权矩阵）、§3.1（逐项检查）、§4（产品行为）、§5（架构与实现）、§6（`dispatch-acceptance/v2` 契约）、§7.3–§7.4（测试迁移与旧标准处置）、§8.2（AC-1–AC-8）、§8.3（T3 证据口径）、§9（风险/回滚/升档）；独立复核 `docs/planning/2026-11-02_review_dispatch-guardrail-relax.md`（**150 行** / SHA-256 `aa702f6bb9ea034c067721462ff07b64f1e34a53c8439b8c28c0dbe8ad0bfdb5`，P1.0 完整复核 F1–F12 + P1.1 再复核 R1–R4；再复核结论「建议提交客户确认」）；闸门 2 确认的团队计划 `docs/scheduling/2026-11-02_team-plan_dispatch-guardrail-relax.md`（**482 行** / SHA-256 `4ebd41fa9d68d7aca0e0847479b819965b367a87af58111128c4500f77ed074d`）§1.1（目标）、§1.2（T3 口径）、§1.3（非目标）、§4（写集/边界）、§6（R1–R4/F4 处置）、§7（验收安排与证据要求）、§8（闸门 2 确认项）。本文件的 AC 不得弱于方案 §8.2；团队计划只作范围、写集、阶段、证据口径依据，不是标准来源。
- 选定检查：**T3 口径**——受影响层测试（编排纯逻辑、桌面集成）+ 跨角色集成/完整流程回归 + **T3 全量适用回归** + `npm run typecheck` + 可跑 Electron E2E（不可跑如实记录原因）；另核 R1/R2/R3/F4/R4（§四）。全量回归是 T3 的必需项，不是可选项（技能 `references/testing.md` T3 定义与方案 §8.3）。
- 录屏与截图：**不要求录屏**。验收证据**最多使用截图**，**不得要求或提供录屏/屏幕录像作为验收要求或选项**；缺少录屏不构成 `fail` 或 `insufficient evidence`（2026-10-27 客户规则，`references/acceptance-role.md`）。如使用截图，必须来自当前候选真实运行、关闭 DEBUG 覆盖层，并记录 sha256、候选版本与拍摄命令/窗口尺寸；E2E 以 `E2E_PASS`/原始输出为主，截图只作辅助。
- 复用证据：仅同一候选、同一输入/依赖/夹具、同一命令、同一配置的证据可复用；候选、输入、依赖、契约、夹具或构建变化时，受影响证据失效，只补失效部分；不得跨候选复用，也不得用其它变更（如 shell-escalation、i18n、acceptance-evidence-path）的证据替本变更背书。
- 任务 ID / flowId：`2026-11-02-dispatch-guardrail-relax` / `dispatch-guardrail-relax`。
- 标准路径 / 版本 / 日期：`docs/acceptance/dispatch-guardrail-relax-criteria-v1.md` / **v1** / **2026-11-02**（实施前冻结）。
- 阶段与状态：**实施前完成标准**。本文件只建立标准，不判定候选；写标准时**未实施、未测试、未验收**——HEAD `c80f4944c3421554fcbd35f8570cedd3e2119a0a` 仍是旧派发前置实现（`evaluateDispatchPreflight` 仍把状态检查作为拒绝；`src/common/编排/dispatch-advisories.ts` 尚不存在）。写标准时闸门 0/1/2 已确认，**客户实施授权未给**（以沟通记录为准）。
- 验收报告：**另写 `docs/acceptance/dispatch-guardrail-relax-report-v1.md`，本文件不是报告**。实施后由同一独立验收主上下文（E2）按本标准与统筹变更包判定，结论只能是通过/返工/证据不足。
- 适用变更：仅本任务（派发护栏 P1.1）。提交/推送/合并/发布不属本任务，也不因验收通过而授权（团队计划 §八）；验收通过只表示当前候选满足本标准。

---

## 一、基线、版本冻结与范围

### 1.1 客户确认链与冻结版本

| 项 | 状态 | 记录与版本 |
| --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-11-02） | 沟通记录「闸门 0 确认记录」：客户原话「确认闸门 0：按这份意图理解推进方案」；范围＝产品派发前置（ans-studio 运行时），不是 ANS 技能自身的管理闸门；客户原话「规矩护栏，应该只管控谁能给谁派发任务，而不能管任务状态是否满足」。闸门 0 写盘快照 **67 行** / `212e987fa183e739e8bcd813e14f40d376fbc86702e792e82a7735901775bb54`（方案文件头引用值，历史快照） |
| 闸门 1：方案确认 | 已确认（2026-11-02，P1.1 为唯一实施基线） | 沟通记录「闸门 1 确认记录」：客户原话「确认闸门 1：方案 P1.1，Q1–Q5 全 A，O1/O5/O7 后续独立事项，O2–O4/O6 暂不做，planDispatchDelivery 拒投保留；接受 F4/R1–R4 披露。」；确认对象含方案 **877 行 / `54da5d31…`** 与复核 **150 行 / `aa702f6b…`** |
| 闸门 2：角色指派/写集/边界/档位/顺序/验收安排/证据口径 | 已确认（2026-11-02） | 沟通记录「闸门 2 确认记录」：客户原话「确认闸门 2：团队计划 v1 的参与角色、精确写集、B-1/B-2、T3、阶段顺序、验收安排与证据口径；实施授权另行给出。」；团队计划 **482 行 / `4ebd41fa…`** |
| 客户实施授权 | **写标准时未给**（以沟通记录为准） | 沟通记录「闸门 2 确认记录」明确「实施授权：未给出（客户明确『另行给出』）。未给前不派发任何 worker；B0/P1 及之后的实施阶段不启动。」本文件不把闸门 1/2 或团队计划当实施授权 |
| 本验收标准 | 实施前写盘并冻结 | 本文件 v1（2026-11-02） |

**引用快照说明**：团队计划文件头写「闸门 0/1 记录当前 91 行 / `b0bb187c…`」，方案文件头仍写「待闸门 1 客户确认」，团队计划文件头/§二仍写「闸门 2 未确认、实施授权未给」——这些都是写于对应确认之前的**历史状态行/历史快照**，不作为当前判定依据；当前判定以 `docs/communication/` 的确认小节、方案 P1.1 冻结哈希与团队计划冻结哈希为准（另见 §九.1/§九.2）。

### 1.2 版本冻结与变更规则

- 本文件在实施开始前冻结为 **v1**；实施开始后，不得为迁就候选而改写标准、放宽或加严实质。
- 确需变更标准（客户改变范围、方案实质变更、发现标准本身不可执行/自相矛盾）时：递增版本（v2…）、记录理由与受影响条目、交沟通/统筹确认，并重新核对受影响证据；未确认前仍按 v1 判定。
- 候选变化不改变标准；只使该候选上的证据失效，需按本文件重取。
- 本文件不是验收结论，也不是实施/提交/推送/合并/发布授权；实施授权以沟通记录为准，验收结论只写在 `docs/acceptance/dispatch-guardrail-relax-report-v1.md`。
- 方案实质变更（改授权矩阵、advisory 语义、锚点规则、写集、档位、AC 或 `planDispatchDelivery` 拒投保留）按方案 §9.3 与团队计划 §5.4 停止并重开对应闸门，本文件随之重判；不自行放行。
- R4 的编辑性文档更正（方案 §13 引用与未决项表述）不改变已确认语义；更正后的方案哈希必须作为「编辑性更正版」记录，不得当作新的语义确认版本（§4.5）。

### 1.3 本轮范围（判定边界，不重复方案正文）

本文件判定覆盖（对应方案 §1/§3/§5/§8.2 与团队计划 §1.1）：

1. **硬授权（保留拒绝）**：自派；非幕僚/运营来源；幕僚→项目 worker；运营→非质检内置；目标不存在/未枚举；幕僚→`su`/未知内置与未知非内置的类型优先顺序。拒绝在 `task.created` 之前：不写任务行、不打开目标会话、不投递；按 R1 还不得产生/领养 draft run。
2. **状态提示（advisory，不阻断）**：意图/方案/名单/模块/env-bootstrap/D3/交付/run/pin/文档哈希/版本化基线全部降级为提示 + 诊断记录（`tasks.dispatch.advisory`），返回 `ok:true` 并照常建任务、投递；幂等抑制保留为业务去重；run 记账尽力而为，不可用时任务省略 flow/run 锚点；删除「派发被冻结事实拒绝时自动弹 run-change 卡」的触发路径，保留 run-change 卡、显式入口与提案卡冻结路径；`planDispatchDelivery` 契约引用缺失继续拒投且运行文案逐字不变。
3. **测试与迁移**：按方案 §7.3 逐条把旧状态拒绝迁移为「硬负例」或「受理 + advisory」正例；不删除测试、不新增 skip/todo、不放松断言保绿。
4. **T3 证据**：受影响层测试 + 跨角色回归 + T3 全量适用回归 + `npm run typecheck` + 可跑 Electron E2E；失败分类区分既有与新增；证据最多截图、不要求录屏；无 task_ops，以文件/原始输出为证据。
5. **跨任务核对项**：R1 调用协议、R2 pin/draft 锚定三分口径、R3 `evidenceScopeRoots` 优先级与 fail-closed、F4 `redispatch_task` 只读核对、R4 方案 §13 引用更正与哈希映射（§四）。

**明确不判定为本轮缺陷或范围的边界**（依据闸门 1/2 已确认版本，不是放宽）：

- **O1/O5/O7 不实施**（后续独立事项）；**O2–O4/O6 暂不做**。角色卡文本、`dispatch_task.moduleId` 工具描述（`src/provider/runtime/schema.ts:515-519`）与新行为不一致属 O5，本任务不改，不要求修复证据，也不因未修复判 fail。
- **F4 不改**：`redispatch_task`（`src/pipeline/orchestration/run-role.ts:1280`）、`redispatchTask`/`chooseRedispatchTarget`（`app/desktop/session.ts:4324-4330`、`:4476` 起）的目标选择与授权语义不属于本任务；F4 是已披露未关闭项，留 O7；不因本任务未修改该路径判 fail（若本任务意外修改则按越权/方案偏差判返工）。
- **R1–R4 由团队计划 §6 处置**：R1 调用协议由 P1 实现提案审核与实施测试落实；R2/R3 口径按团队计划 §6.2/§6.3；R4 由策划作者编辑性更正，不改语义（§4.5）。
- 不改写权/边界（Section 1、`resolveWrite`、`TaskScope`）、shell 命令/脚本守卫、执行后审计、验收判定/验收卡、客户闸门、人事 D3 与 `appointment-write`、报告路由、任务卡格式、任务重派/看护（团队计划 §1.3）。
- 不改 `src/model/runtime.ts`、`src/common/编排/task-state.ts`（含 `run-required` schema）、`src/common/编排/run-manifest.ts`、`src/common/门禁引擎/versioned-doc-guard.ts`、`src/common/门禁引擎/governance-roles.ts`、`src/common/编排/handback.ts`（`planDispatchDelivery` 运行文案）、`src/provider/runtime/schema.ts`（O5）、`app/renderer/**`（团队计划 §1.3）。
- 不恢复已取消的 run-change-auto-approve；不新增自动批准/代批逻辑（方案 §5.6、AC-7.3）。
- 不改写历史文档：旧设计 `docs/planning/2026-10-29_design-workflow-maintainers-hiring.md`（1330 行 / `4a13e99b0b0dbb4aeb9141ed4a15fdddd4ec5021b88146589bdf1f4f8030e6b6`）与旧验收记录保持原文；方案 §7.4 的取代关系只作披露（AC-8.3）。

### 1.4 写标准时的只读基线与输入哈希

| 检查 | 命令 | 结果（2026-11-02 写标准时实测） |
| --- | --- | --- |
| 分支 / HEAD | `git rev-parse HEAD` | `feat/flow-improvements-wave1` / `c80f4944c3421554fcbd35f8570cedd3e2119a0a` |
| 工作树（写标准开始时快照） | `git status --porcelain` | 3 个已跟踪管理记录修改（`docs/communication/memo.md`、`docs/planning/memo.md`、`docs/scheduling/memo.md`）；2 个已跟踪治理文件修改（`角色卡/桌面窗口/boundary.md`、`boundary.yaml`，人事 H1 的 B-1/B-2 补登）；4 个未跟踪任务管理文档（沟通意图、方案、复核、团队计划）；**无产品代码/测试改动**（`git status --porcelain -- src app test` 为空） |
| 暂存区 | `git diff --cached --name-only` | 空（未暂存） |
| 方案 P1.1 | `wc -l` / `sha256sum` | **877 行** / `54da5d3120b973daa7bf5391d017ceb03b176f010edaed1a187d5308acf0c649` |
| 复核记录 | 同上 | **150 行** / `aa702f6bb9ea034c067721462ff07b64f1e34a53c8439b8c28c0dbe8ad0bfdb5` |
| 团队计划 | 同上 | **482 行** / `4ebd41fa9d68d7aca0e0847479b819965b367a87af58111128c4500f77ed074d` |
| 沟通记录（当前，含闸门 0/1/2） | 同上 | **117 行** / `84d097926f9c39e14bc76f1a773c49fd0b7e0e370664b2283814854759cae996`；团队计划文件头引用的 91 行 / `b0bb187c…` 与方案文件头引用的 67 行 / `212e987f…` 均为历史快照，不混用 |
| Node / npm | `node --version` / `npm --version` | `v24.22.1` / `11.19.1`（实施/取证仍须记录实测版本） |
| 任务配置 | `ls .ans/project.json` | 不存在；未启用 task_ops；`.ans/sessions/`、`.ans/su/` 为既有运行目录 |
| 关键现状代码锚点（只读核对） | Read/Grep（只读，不运行） | `src/common/编排/workflow-preconditions.ts:1187` `evaluateDispatchPreflight`；`:1189` 自派；`:1191-1197` `chief-to-project-forbidden`；`:1200-1249` 幕僚→策划/人事链；`:1251-1277` 幕僚→运营链；`:1283-1317` 运营链（`:1285` `convener-target-forbidden`、`:1290` legacy、`:1296` handoff、`:1302` run-missing、`:1305` run-pin-required、`:1308` run-role-missing、`:1311` flow-required）；`:1318-1367` 模块/选中/目标卡；`:1371` `unknown-source`；`app/desktop/session.ts:6067` `routeStarDispatch`；`:6099-6105` 幂等键（`from/to/text/moduleId`，不传 `moduleDirectory`）；`:6110-6125` 幂等抑制；`:6130-6137` 刷新枚举/目标信息；`:6138` `chainDispatchFacts`；`:6150-6178` run 读取/`ensureDraftRun`/`verifyPinnedRun`/`loadPinnedRoster`；`:6180-6222` preflight 与 run-change 派发触发；`:6225-6242` 版本化基线；`:6244-6277` handoff pin（早退 `:6245-6247`）；`:6293-6312` `task.created`；`:6331-6349` `planDispatchDelivery`；`:6354-6401` 投递/收口；`:7062-7094` `evidenceScopeRoots`；`:4324-4330` `chooseRedispatchTarget`；`:4476` 起 `redispatchTask`；`src/pipeline/orchestration/run-role.ts:1280` redispatch 仅注入幕僚；`src/common/编排/mechanical-rejection.ts:57` `target-card-missing` owner=nominator，`:117` `M5_TARGET_CARD_MISSING` 别名；`src/common/编排/handback.ts:353-378` `planDispatchDelivery` 文案（`:373-374`） |
| 既有测试锚点（只读核对） | `ls` / Grep | `test/编排/workflow-preconditions.test.ts` 存在；`test/桌面应用/{chain-enforcement,star-routing,rejection-copy,run-pin,run-change-trigger,run-change-entry,dispatch-fresh-enum}.test.ts` 均存在；`run-change-entry.test.ts:212` 仍钉 `runChangeRejectionForDispatch`（应由本任务迁移）；`test/桌面应用/e2e/main.mjs` 存在（含 `E2E_PASS` 标记）；`node_modules/.bin/electron` 存在；`test/pi-adapter/write-sequencing.test.ts` 存在（既有已知挂起，见 §5.3） |
| 新增测试文件是否存在 | `ls` | `test/编排/dispatch-advisories.test.ts` **尚不存在**（符合「实施前」状态） |
| H1 边界补登（治理，非产品候选） | `git diff` | `角色卡/桌面窗口/boundary.md` 与 `boundary.yaml` 已含 `run-change-trigger.test.ts`、`run-change-entry.test.ts` 两个逐文件条目（Delta-DGR-1/2）；**写标准开始时未观察到 `角色卡/桌面窗口/changelog.md` 的对应新增，写标准过程中（并发）该 changelog 已新增 2026-11-02 B-1/B-2 记录（人事 H1，非本验收写入）**；md/yaml/changelog 三处口径一致。H1 完成状态由统筹/人事确认，不纳入产品候选 |

以上只读核对用于确认基线与约束；本文件写盘未改方案、复核、团队计划、沟通记录、角色卡、产品源码或测试，也未启动应用。H1 边界补登是闸门 2 确认的人事治理变更（团队计划 §4.6），记录但不计入产品候选；除 B-1/B-2 外无边界变更。

### 1.5 本文件不产生的授权

本文件不授权提交、推送、合并、发布，不授权派发 worker，不授权修改写集、边界或档位，不授权启动应用做「已验收」声明。实施按闸门 2 确认的写集与团队计划阶段执行；实施授权范围以沟通记录为准。

---

## 二、判定口径与证据规则

### 2.1 四种判断与报告表

每条验收项（AC）只能判：

| 判断 | 含义 |
| --- | --- |
| `pass` | 当前候选满足该条标准，证据为该候选的原始、可复算证据 |
| `fail` | 已有证据表明不满足标准，或证据显示以弱化断言/超范围改动/绕过标准达到表面通过 |
| `insufficient evidence` | 缺少必要证据、证据属于另一候选/另一输入、无法复算、只给摘要、只凭自述，或关键结论无法成立 |
| `not applicable` | 该条对本轮范围不适用；必须写明依据 |

本任务 AC-1–AC-8 全部适用，均应给出 `pass`/`fail`/`insufficient evidence`；`not applicable` 仅当客户书面确认相关条目不再适用（范围变更）时才可使用，不得用来回避必需证据。R1/R2/R3/F4/R4 核对项按 §4.6 的规则并入总体判断。

验收报告 `docs/acceptance/dispatch-guardrail-relax-report-v1.md` 的核心是逐项验收表，列至少为：

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1–AC-8 | 本文件条目与方案 §8.2 AC-1–AC-8 | 本文件各条「所需证据」 | 原始输出/`tasks.jsonl` 摘录/哈希路径 | `git hash-object` + `sha256sum` | 编排/桌面窗口/测试/项目管理/统筹 | 实际观察摘要 | pass/fail/insufficient evidence |

总体结论：**AC-1–AC-8 全部 pass，且 R1/R2/R3/F4/R4 核对项均满足或按 §4.6 如实记录（无阻断项），才算通过**；任一项 `fail` → 返工；无 `fail` 但有任一项 `insufficient evidence` → 证据不足，不得判 pass。

### 2.2 原始证据原则（不得以「字段齐全」代替实际行为）

- 文件存在、字段名齐全、测试文件存在、断言存在，**只是必要条件，不是通过依据**。每条必须观察实际行为：捕获的拒绝码/回执原文、`tasks.jsonl` 行数与字段、诊断 `reasonCode`、目标会话是否打开、draft run 是否产生/领养、模块字段实际写入值、证据范围实际 roots、run/manifest 是否被改写。
- 开发者自述、测试角色转述、工具「成功」、计划文字、摘要，都不算原始证据；验收读取原始命令输出、文件哈希、diff/status、测试计数与失败原文、`tasks.jsonl` 原始摘录。
- 不得修改断言以保绿；不得跳过失败用例或把 `skip`/`todo` 计为通过；不得把失败归为「环境问题」而不做 B0 对照与分类。
- 不得用「代码看起来已改为 advisory」代替实际捕获回执与诊断；不得用纯函数单测代替桌面集成测试，也不得用桌面集成测试代替纯函数硬授权矩阵测试（两侧证据都要）。
- 不得用其它变更的通过结论、摘要或测试计数替本变更背书。

### 2.3 T3 证据口径

- 按 `references/testing.md` 的唯一定义，本变更 **T3**：**发布、共享抽象（Model/公共入口/跨模块契约）、治理或权限变更，或证据基础不确定**；默认验证为「全量适用回归 + 发布/共享抽象检查」。方案与闸门 1/2 均已定档 T3，本文件不压档。
- 受影响层与跨角色回归：编排纯逻辑（`workflow-preconditions.ts`、新增 `dispatch-advisories.ts`、`mechanical-rejection.ts` 文案）、桌面集成（`app/desktop/session.ts`）、任务账本/run manifest/版本基线读取、`task.created` 形状与报告路由回归；测试角色负责跨角色回归、T3 全量与可跑 E2E。
- **T3 全量适用回归是必需证据**（§5.3）；`test/pi-adapter/write-sequencing.test.ts` 为既有已知挂起，允许排除但必须记录可复现命令、原因与既有验收依据（`docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604`），不得静默跳过。
- `npm run typecheck` 必须通过；只有改渲染层才加 `typecheck:renderer`/`build:renderer`（本任务默认不改渲染层）。
- Electron E2E：可跑则记录 `E2E_PASS`、截图（最多）、候选哈希与命令；不可跑则如实记录可复核的不可用原因（命令、错误原文、环境），不得把不可用写成通过，也不得因缺录屏扣分。
- 证据不足或候选不可复算时按 §5.7 升档补证；升档不降档。

### 2.4 「证据不足」判定口径（不弱化）

出现下列任一情形，对应 AC 判 `insufficient evidence`，不得判 `pass`：

1. 缺少该 AC「所需证据」中的任何原始输出/文件（只给摘要、转述、口头自述、工具成功提示）。
2. 证据与候选不匹配：文件哈希/diff 无法复算，或证据来自另一候选、另一 HEAD、另一输入/夹具；变更包候选哈希与工作区不一致。
3. 新测试文件缺失、未运行、被 `skip`/`todo`，或断言被删除/放宽以保绿；旧负例未按方案 §7.3 逐条迁移。
4. 硬拒绝只由纯函数测试证明，桌面集成未断言「`tasks.jsonl` 行数不变、目标会话未打开」；或反过来只有桌面测试、没有纯函数授权矩阵覆盖。
5. R1 缺「硬拒绝不产生/不领养 draft run」或调用顺序证据；R2 缺 handoff 无 flowId/无 runManifest/pin 失败三类中的任一类；R3 缺正例或负例；F4 缺只读 diff 证据。
6. AC-4 只有测试文件存在，没有回执原文与诊断 `reasonCode` 记录；或状态齐备时仍产生 advisory/额外诊断噪声。
7. AC-5 只跑新增测试，没有既有范围外护栏测试（D3/appointment-write、写守卫/shell、版本化只读、验收、G-1 拒投）的回归结果。
8. AC-6 缺 `npm run typecheck` 退出码 0；缺 T3 全量回归原始输出/计数/失败分类；新 skip/todo 未清零；或测试删除/弱化无逐条说明。
9. AC-6.4 E2E 未执行且无可复核的不可用原因；或声称 `E2E_PASS=true` 但无原始输出/候选哈希。
10. 写集外改动（产品/测试/共享层/构建/发布/角色卡超出 B-1/B-2）或并发混入未隔离。
11. 变更包/证据缺方案版本、标准版本、候选哈希或节点对应关系。
12. 用其它变更（shell-escalation、i18n、directory-ownership、acceptance-evidence-path 等）的通过结论或证据为本变更背书。
13. 实施/测试自评即验收结论，或实施角色自写验收报告。
14. `not applicable` 未写明依据。
15. R4 方案 §13 更正若已执行，却无法证明是编辑性更正（改动了 Q1–Q5/AC/写集/产品语义）或哈希映射缺失；或未执行但实施记录仍把旧快照哈希当作当前复核记录。

**不得放宽的具体禁令**：不以时间紧降档；不以纯函数单测替代桌面集成；不以桌面集成替代纯函数矩阵；不以「工具成功」「全部通过」摘要替代原始输出；不把 `skip`/`todo` 计为 pass；不因缺少录屏或截图扣分（反过来也不得把录屏/截图当作必需证据要求提供）；不因 R4/F4 是文档/披露项而把其证据要求归零。

### 2.5 证据复用与失效

- 同候选、同输入/依赖/夹具、同命令的证据可以复用；候选、输入、依赖、契约、夹具、构建配置变化时，受影响证据失效，只补失效部分。
- 复用必须在统筹变更包中列出「复用理由 + 未失效依据」；验收核对候选哈希一致后才接受。
- 不得跨候选复用，也不得用其它变更的证据替本变更背书；管理记录（`docs/planning/`、`docs/scheduling/`、`docs/communication/`、`docs/acceptance/`）不纳入候选，其哈希变化不影响产品候选有效性，但变更包须把「产品候选」与「治理记录」分开列明。

### 2.6 无 task_ops

本项目没有 `.ans/project.json` 任务配置（§1.4），未启用 task_ops。取证以文件哈希、原始命令输出、diff/status、`tasks.jsonl` 摘录、Electron E2E 输出为准；**不得伪造任务令牌、锁、审批、机器预检或 `docs/verification/` 记录**。

### 2.7 候选隔离与管理记录

- 本变更产品候选只列相对 B0 基线变化的闸门 2 写集路径（团队计划 §4.1/§4.3）：`src/common/编排/workflow-preconditions.ts`、`src/common/编排/dispatch-advisories.ts`（新增）、`src/common/编排/mechanical-rejection.ts`、`test/编排/workflow-preconditions.test.ts`、`test/编排/dispatch-advisories.test.ts`（新增）、`app/desktop/session.ts`、`test/桌面应用/{chain-enforcement,star-routing,rejection-copy,run-pin,run-change-trigger,run-change-entry,dispatch-fresh-enum}.test.ts`；条件 i18n（仅 P1 审核确认需要新 key 时）：`src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n.test.ts`。
- B-1/B-2 边界条目（`角色卡/桌面窗口/boundary.md`/`boundary.yaml` + changelog）是闸门 2 确认的人事治理变更，记录但不计入产品候选；除 B-1/B-2 外无边界变更。H1 的 changelog 状态由统筹/人事确认。
- 管理记录（`docs/planning/`、`docs/scheduling/`、`docs/communication/`、`docs/acceptance/`）与角色 `docs/change/` 证据目录不混入产品候选；`app/renderer/dist/` 为忽略产物、非候选。
- 并发写同一产品文件且未隔离的，按候选不可复算处理；不得把他人改动算入本候选，也不得用混入候选的证据判 pass。

---

## 三、验收项（AC-1–AC-8）

### 3.0 总表与方案映射

| AC | 方案 §8.2 对应 | 主题 | 子项（全部保留） | 最低证据 | 产出角色 |
| --- | --- | --- | --- | --- | --- |
| AC-1 | AC-1 | 硬授权仍拒绝（负例） | AC-1.1–AC-1.7 | 纯函数矩阵输出 + 桌面集成负例 + `tasks.jsonl` 行数 + 会话/draft run 观察 + 回执码 | 编排、桌面窗口 |
| AC-2 | AC-2 | 任务状态不再阻断（正例） | AC-2.1–AC-2.9 | 桌面集成正例原始输出 + `tasks.jsonl` 摘录 + 回执/advisory + 模块字段 | 桌面窗口 |
| AC-3 | AC-3 | run 记账非阻断 | AC-3.1–AC-3.5 | `run-pin`/`chain-enforcement` 输出 + 锚点断言 + 幂等回归 | 桌面窗口 |
| AC-4 | AC-4 | 提示与记录 | AC-4.1–AC-4.3 | 回执原文 + 诊断 `reasonCode` 原始记录 + 洁净派发对照 | 桌面窗口 |
| AC-5 | AC-5 | 范围外护栏不变 | AC-5.1–AC-5.6 | 既有护栏套件回归 + verifier 模块元数据 + 证据范围正/负例 | 桌面窗口、编排、测试 |
| AC-6 | AC-6 | 测试与迁移质量 | AC-6.1–AC-6.4 | 测试 diff/计数 + source pin + typecheck + T3 全量 + E2E 记录 | 编排、桌面窗口、测试 |
| AC-7 | AC-7 | run-change 边界 | AC-7.1–AC-7.3 | run-change 测试输出 + 客户卡请求数 + 代码/diff | 桌面窗口 |
| AC-8 | AC-8 | 文档与状态如实 | AC-8.1–AC-8.3 | 文档状态核对 + 写集 diff + 历史文件零改动 | 统筹、策划、各实施角色 |

**映射自检**：AC-1–AC-8 与方案 §8.2 的 AC-1–AC-8 **一一对应**，子项编号与内容逐条保留，未拆分、未合并、未删减、未弱化。本文件新增的只是证据记录字段、判定方法、R1/R2/R3/F4/R4 核对项（来自闸门 2 确认的团队计划 §6/§7.1 与复核披露）与 T3 证据口径；这些**不新增产品行为要求**，不得被用来扩大范围或加严方案。

### 3.1 AC-1 硬授权仍拒绝（负例）（方案 §8.2 AC-1）

**标准（可核对语句）**

- **AC-1.1 自派**：`fromRoleId === targetRoleId` → `evaluateDispatchPreflight` 返回 `ok:false`、`code === "self-dispatch"`；桌面路径拒绝；`tasks.jsonl` 行数不变；目标会话未打开；无投递。
- **AC-1.2 非幕僚/运营来源**：纯函数返回 `unknown-source`；桌面来源身份校验（`routeDispatch` 的幕僚/运营判定）拒绝；无任务行；目标会话未打开。
- **AC-1.3 幕僚→项目 worker**：返回 `chief-to-project-forbidden`；无任务行；目标会话未打开。
- **AC-1.4 运营→产品/策划/人事/幕僚等非质检内置**：返回 `convener-target-forbidden`；无任务行；目标会话未打开。
- **AC-1.5 运营→不存在项目角色**：返回 `target-card-missing`（目标不存在/未枚举）；无任务行；拒绝 action 文案**同时覆盖**「角色卡/边界未就绪」与「id 拼写/角色 id 错误」两种可能，并说明下一步；owner 仍为 `nominator`，`M5_TARGET_CARD_MISSING` 旧别名保留。
- **AC-1.6 内置目标 allowlist 与类型优先**：幕僚→`su`/未知内置 id → `target-card-missing`（说明该 id 不是可派发内置角色）；幕僚→未知**非内置** id → `chief-to-project-forbidden`（类型禁止优先于存在性）；两者均无任务行。
- **AC-1.7 无 run-change 自动卡**：硬拒绝不触发 run-change 自动卡；客户卡请求数为 0。
- **补充（R1，团队计划 §6.1）**：任一硬拒绝还不得产生/领养新的 draft run；`ensureDraftRun`/`pinRun` 等 run 账本写入在硬授权之前不得发生。该点按 §4.1 判定，不单独新增 AC。

**判定方法**

1. 运行 `test/编排/workflow-preconditions.test.ts` 的硬授权正/负例：逐项断言 `ok:false` 与 `code`（自派、来源、幕僚→worker、运营→非质检内置、运营→不存在项目、幕僚→`su`/未知内置、幕僚→未知非内置）；断言这些状态缺失不再走这些码。
2. 运行桌面集成负例（`star-routing`、`chain-enforcement`、`dispatch-fresh-enum` 或新增既有授权内用例）：派发前/后 `tasks.jsonl` 行数相等；目标会话未打开（会话表/打开调用观察）；回执 `ok:false` 且不冒充送达。
3. 检查 R1：硬拒绝场景下 `ensureDraftRun` 未被调用（可注入/观察），或 run 目录/账本无新 draft；硬授权先于任何 run 账本写入（§4.1）。
4. 读取 `mechanical-rejection.ts` 的 `target-card-missing` owner/action 与别名映射；确认 action 覆盖两种原因（拼写/id、写卡/边界未就绪）。
5. 检查 run-change 调用点：派发 preflight 失败不再调用 `runChangeRejectionForDispatch`；客户卡请求计数为 0。

**所需证据**

- 纯函数测试原始输出（命令、退出码、计数、逐项 code 断言）。
- 桌面集成原始输出（派发回执、`tasks.jsonl` 前后行数、目标会话未打开证据、draft run 无新增证据）。
- `mechanical-rejection.ts` diff（owner/action/别名）与候选哈希。
- run-change 触发删除的 diff 与客户卡请求数为 0 的测试断言。

**失败示例/反例（任一即 fail）**

- 任一硬拒绝返回 `ok:true`，或任务行 +1，或目标会话被打开、任务被投递。
- 自派/幕僚→worker/运营→非质检内置不再被拒，或被错误码替代。
- 运营→不存在项目角色被受理（违反 Q1/A），或 `target-card-missing` 文案只覆盖「写卡」不覆盖「id 拼写」。
- 幕僚→未知非内置 id 返回 `target-card-missing`（应为 `chief-to-project-forbidden`），或幕僚→`su`/未知内置被放行。
- 硬拒绝触发 run-change 卡（客户卡请求数 > 0），或硬拒绝产生/领养 draft run（R1）。
- 只有纯函数断言、没有桌面集成「无任务行/无会话」证据（按 §2.4 判 insufficient）。

**来源**：方案 §1.2、§3.1 第 1–6/26 行、§4.3、§5.3.1、§8.2 AC-1；复核 F10；团队计划 §6.1（R1）。

### 3.2 AC-2 任务状态不再阻断（正例）（方案 §8.2 AC-2）

**标准（可核对语句）**

- **AC-2.1 幕僚→策划缺意图/缺 flowId**：受理（`ok:true`）；任务行 +1；advisory 按链首个未满足项记录（`flow-required` 或 `intent-missing`，按方案 §5.3.2 的链顺序；仅缺意图时为 `intent-missing`）；投递发生。
- **AC-2.2 幕僚→人事缺方案/架构/名单/模块/env-bootstrap**：受理；advisory 按链首个未满足项记录（`proposal-missing`/`roster-missing`/`roster-modules-missing`/`env-bootstrap-missing`，按实际）。
- **AC-2.3 幕僚→运营缺 D3/缺 D3 角色卡/run 为 draft**：受理；advisory `d3-missing`/`d3-selected-cards-incomplete`/`run-pin-required`（按实际；`d3-selected-cards-incomplete` 取代旧 D3 缺卡 `target-card-missing`）；任务行 +1。
- **AC-2.4 运营→worker 缺 handoff/run/module/D3 选中**：受理；advisory 对应（`handoff-missing`/`run-pin-required`/`run-role-missing`/`run-ledger-unavailable`/`flow-required`/`module-required`/`module-missing`/`module-not-owned`/`module-path-*`/`target-not-nominated`，按实际与链顺序）；任务行 +1；目标存在时投递；带模块时**仅当目标为模块属主**才写模块字段（`moduleId`/`modulePaths`，目录型模块才写 `moduleDirectory`），非属主省略并记 advisory。
- **AC-2.5 运营→质检（verifier）缺 handoff/module**：受理；advisory；投递；若带模块且模块存在于适用名单，任务**仍写** `moduleId`/`modulePaths`（**不要求属主**），以保留验收证据范围；文件型模块不写 `moduleDirectory`。
- **AC-2.6 legacy flow**：受理；advisory `run-legacy-readonly`；旧 legacy 任务记录仍可读。
- **AC-2.7 版本化文档基线违规**：受理；advisory `versioned-doc-baseline-violation`；基线/文档未被改写；旧版本写入仍被只读守卫拒绝（用既有 `versioned-doc-guard` 测试证明）。
- **AC-2.8 pinned run 文档哈希漂移/roster 读取失败**：受理；advisory（`run-document-hash-mismatch`/`run-pinned-roster-invalid`）；manifest 未被改写；任务**不锚定**该无效 pinned run。
- **AC-2.9 无 flowId 且无法唯一推断**：受理；任务创建且**不带 flow/run 锚点**；advisory `flow-required`。

**判定方法**

1. 运行改造后的 `chain-enforcement.test.ts`、`star-routing.test.ts`、`run-pin.test.ts` 正例：逐项断言 `ok:true`、`tasks.jsonl` 行数 +1、投递发生、advisory 内容（回执/诊断）；对每个旧状态码至少有一个「缺失 → 受理 + advisory」用例。
2. 读取 `tasks.jsonl` 新行：确认 `to`、`text`、`stepId`（handoff 为 `project-handoff`）、`flowId`/`runId`/`runState` 是否按 §5.5 锚定；确认模块字段写入符合 AC-2.4/AC-2.5。
3. 运行既有 `versioned-doc-guard` 测试证明旧版本写入仍被拒；对基线文件与 manifest 计算写前/写后 sha256，证明未被改写。
4. 捕获回执与诊断：advisory 的 `reasonCode`、`sourceRoleId`、`targetRoleId`、`phase:"dispatch"`、`mode:"authorization-only"`；确认 `ok:true`。
5. 检查实现 diff：状态分支不再返回 `ok:false`；`collectDispatchAdvisories` 为纯函数，不读盘/写盘；advisory 不反向影响硬授权。

**所需证据**

- 每个 AC-2 子项的测试原始输出（命令、退出码、计数、断言）。
- `tasks.jsonl` 新行摘录（行数前后、关键字段）与投递断言。
- advisory 捕获/诊断原始记录；回执原文。
- 基线/manifest 写前/写后 sha256；`versioned-doc-guard` 回归输出。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 任一状态缺失仍返回 `ok:false`、任务行不变或未投递。
- 缺 D3 选中角色卡仍用旧 `target-card-missing` 硬拒（应为 `d3-selected-cards-incomplete` advisory）。
- 实现目标非属主仍写模块字段，或 verifier 带模块却未写 `moduleId`/`modulePaths`。
- 文件型模块写 `moduleDirectory`（`task-state.ts` 目录校验会判坏）。
- 无效 pinned run 仍作为任务锚点，或 manifest/基线被改写；旧版本写入未被只读守卫拒绝。
- 无 flowId 时任务仍带 `flowId`/`runId`/`runState`（撞 `run-required` 或伪造锚点）。
- 状态缺失只改了单测、没有桌面集成证据（按 §2.4 判 insufficient）。

**来源**：方案 §3.1 第 7–25 行、§4.1、§4.2、§5.3.2、§5.5、§7.3、§8.2 AC-2；复核 F1/F2/F6；团队计划 §6.2（R2）。

### 3.3 AC-3 run 记账非阻断（方案 §8.2 AC-3）

**标准（可核对语句）**

- **AC-3.1 pinned run 不含目标角色**：受理；advisory `run-role-missing`；任务**不锚定**该 run。
- **AC-3.2 handoff pin 失败（缺 D3/缺文档）**：受理；任务创建；run 仍 draft/缺失；不伪造 pinned；advisory（`run-pin-failed`/`run-pin-required` 等）。若已有 draft run，任务可锚定该 draft（`runId`/`runState:"draft"`）；不得锚定校验失败的 pinned run（R2，§4.2）。
- **AC-3.3 run 读取/草案创建失败，或 handoff 时无 runManifest/无 flowId（`session.ts:6245-6247` 早退）**：受理；任务创建且**不带 run/flow 锚点**；advisory `run-ledger-unavailable`（无 runManifest）或 `run-pin-required`（有 draft 未 pin）；诊断有记录；不触发 run-change 卡。handoff 任务即使无锚点仍写 `stepId=project-handoff`，`handoffFound` 仍可按 stepId 识别（R2）。
- **AC-3.4 前提齐备时**：draft→pin 行为与任务锚定 `runId`/`runState` 不回归（既有 run-pin 正例仍通过）。
- **AC-3.5 幂等**：同键重复不新建/不投递，`ok:true`；终态重复提示新文本/新键（既有测试不变）。

**判定方法**

1. 运行 `run-pin.test.ts` 改造用例：pinned 不含目标、handoff 缺 D3/缺文档、pin 失败、pin 后校验失败、handoff 无 flowId/无 runManifest；断言受理、任务创建、锚点符合 R2、不伪造 pinned、不弹 run-change 卡。
2. 读取 `tasks.jsonl`：确认无锚点情形省略 `flowId`/`runId`/`runState`；有 draft 锚定情形 `runState:"draft"`；pinned 锚定仅在 `verifyPinnedRun` 通过、`loadPinnedRoster` 成功且目标/模块覆盖时。
3. 运行既有 run-pin 正例（draft→pin、任务锚定 `runId`/`runState`）：确认不回归。
4. 运行幂等既有用例：同键重复 `ok:true`、无新行/无投递；终态重复文案提示新文本/新键。
5. 检查 diff：run 读取/`ensureDraftRun`/`verifyPinnedRun`/`loadPinnedRoster` 失败路径不再 `return fail`；handoff 早退 `:6245-6247` 改为 advisory；`task.created` 构造按 §5.5 锚点规则。

**所需证据**

- `run-pin.test.ts`/`chain-enforcement.test.ts` 原始输出（命令、退出码、计数、逐断言）。
- `tasks.jsonl` 摘录（锚点字段、stepId）与投递断言。
- 诊断原始记录（`run-ledger-unavailable`/`run-pin-required`/`run-pin-failed`/`run-role-missing`）。
- 既有 run-pin 正例输出；幂等回归输出。
- `app/desktop/session.ts` diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- handoff 无 flowId/无 runManifest 仍硬拒，或任务未创建。
- pin 失败仍返回 `ok:false`、任务未创建，或伪造 `runState:"pinned"`/锚定失败 pinned。
- 无锚点任务仍写 `flowId`/`runId`/`runState`，或 `task.created` 因 `run-required` 失败。
- handoff 无锚点时丢失 `stepId=project-handoff`，导致后续 `handoffFound` 识别失败（R2）。
- 幂等行为改变（同键新建/重复投递），或终态重复未提示新文本/新键。
- 前提齐备时 draft→pin 或锚点行为回归。

**来源**：方案 §3.1 第 15/16/17/27/29 行、§5.3.3、§5.5、§8.2 AC-3；复核 F1/F5；团队计划 §6.2（R2）。

### 3.4 AC-4 提示与记录（方案 §8.2 AC-4）

**标准（可核对语句）**

- **AC-4.1 受理回执**：状态不齐的受理回执含「状态提示（未阻断）」与「受理≠已完成」（或既有回执的「受理 ≠ 完成」语义等价文本）；以「已受理」开头；不出现「派发未受理」「拒绝」「失败」等误导词。补充（方案 §4.1，同一确认版本）：提示项最多展示 3 条，其余以「另有 N 项，见诊断记录」收口；技术 code 只给模型/诊断，不塞进客户卡。
- **AC-4.2 诊断记录**：每个 advisory 在诊断中有一条 `reasonCode` 记录（事件 `tasks.dispatch.advisory`，字段含 `sourceRoleId`/`targetRoleId`/`reasonCode`/`phase:"dispatch"`/`mode:"authorization-only"`，`count` 可选）；不写任务正文/命令/密钥；不虚构成功。
- **AC-4.3 状态齐备**：无 advisory；回执与现状一致；不产生额外诊断噪声（无 `tasks.dispatch.advisory` 记录）。

**判定方法**

1. 捕获状态不齐受理的回执原文：首词/首句「已受理」；含「状态提示（未阻断）」「受理≠已完成」；不含拒绝词；提示项数量 ≤ 3（超过时以「另有 N 项，见诊断记录」收口）。
2. 读取诊断原始记录（JSONL/日志）：每个 advisory 一条、`reasonCode` 与回执一致；无任务正文/密钥；无伪造成功记录。
3. 洁净派发（状态齐备）：捕获回执与诊断，确认无 advisory、回执与 HEAD 现状一致、无额外噪声。
4. 检查实现 diff：advisory 只在有提示时记录；`createDiagnosticLogger` 复用现有诊断，不新增第二套日志框架。

**所需证据**

- 状态不齐/齐备两类回执原文（捕获或测试断言）。
- 诊断原始记录（事件、`reasonCode`、字段、条数）与洁净派发的空记录对照。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 受理回执出现「拒绝」「失败」「派发未受理」，或缺少「状态提示（未阻断）」「受理≠已完成」。
- 回执把 advisory 写成「已满足」「已确认」或客户决定；技术 code 塞进客户卡。
- 有 advisory 但诊断无对应 `reasonCode` 记录，或记录含任务正文/密钥。
- 状态齐备仍产生 advisory/额外诊断噪声，或回执与现状不一致。
- 超过 3 条提示未按方案 §4.1 收口（若实现选择展示全部且无「另有 N 项」说明）。

**来源**：方案 §4.1、§4.2、§5.3.4、§8.2 AC-4；团队计划 §7.3（诊断/证据口径）。

### 3.5 AC-5 范围外护栏不变（方案 §8.2 AC-5）

**标准（可核对语句）**

- **AC-5.1 人事通道**：无名单/D3 时人事发 D3 与 `appointment-write` 仍被拒（既有 M3/M4 测试通过）。
- **AC-5.2 写守卫/shell/版本化只读**：写权/边界、shell 命令/脚本守卫、执行后审计、版本化文档只读行为不变（既有测试通过；相关文件零改动）。
- **AC-5.3 验收语义与 verifier 元数据**：验收 criteria/evidence/客户决定权不变（既有测试通过）；verifier 任务带 `moduleId` 时仍写 `moduleId`/`modulePaths`（不要求属主），文件型模块不写 `moduleDirectory`；验收证据范围不因放宽而缩小。
- **AC-5.4 `planDispatchDelivery` 拒投**：引用契约不存在仍拒投并把已创建任务 `task.closed(rejected)`（既有 G-1 测试通过）；运行文案逐字不变；回执不冒充送达。
- **AC-5.5 目标会话无法打开**：任务仍 `task.closed(rejected)`，不投递。
- **AC-5.6 锚点省略的下游**：flow/run 锚点省略时，`evidenceScopeRoots` 等下游按「无 run/flow」如实处理：verifier 任务保留 `moduleId`/`modulePaths`；证据范围可回退 roster/角色边界；都无时 **fail-closed**，不误放行、不伪造通过。

**判定方法**

1. 运行既有范围外护栏套件：`test/编排/appointment-roster.test.ts`、`test/门禁引擎/versioned-doc-guard*.test.ts`、`test/编排/task-state.test.ts`、验收相关既有测试、G-1 测试（`test/编排/dispatch-reads.test.ts`、`test/测试/g1-verify/g1-dispatch-wiring.test.ts`、`g1-extraction-render.test.ts`）、目标会话打开失败用例；全部 pass。
2. 对 `task-state.ts`、`run-manifest.ts`、`versioned-doc-guard.ts`、`governance-roles.ts`、`handback.ts`、`src/model/runtime.ts`、`src/provider/runtime/schema.ts`、`app/renderer/**` 做 `git diff`/哈希对照，证明零改动（条件 i18n 除外）。
3. 运行 verifier 非属主模块用例：断言任务写 `moduleId`/`modulePaths`、不写 `moduleDirectory`（文件型模块）；运行证据范围正/负例（R3，§4.3）。
4. 运行 G-1 拒投：断言 `planDispatchDelivery` 返回 reject、任务 `task.closed(rejected)`、`ok:false`、文案逐字匹配既有字符串。
5. 运行目标会话打开失败用例：断言 `task.closed(rejected)`、不投递、回执如实。

**所需证据**

- 既有护栏套件原始输出（命令、退出码、计数、失败原文）。
- 零改动文件清单与基线/候选哈希对照。
- verifier 模块元数据与证据范围正/负例输出。
- G-1 拒投原始输出与文案逐字断言。
- 目标会话打开失败用例输出。

**失败示例/反例（任一即 fail）**

- 任一既有护栏测试被删除/跳过/放宽，或新行为导致其失败且未按方案处理。
- `task-state.ts`/`run-manifest.ts`/`versioned-doc-guard.ts`/`governance-roles.ts`/`handback.ts`/`src/provider/runtime/schema.ts` 被改动（超出写集/O5 未授权）。
- verifier 任务带模块却未写 `moduleId`/`modulePaths`，或写了 `moduleDirectory`；证据范围静默变空导致所有物证被拒（不是 fail-closed 的「无根拒绝」，而是「有根误空」）。
- `planDispatchDelivery` 引用缺失不再拒投，或任务未被 `rejected` 收口，或运行文案改变。
- 目标会话打开失败仍声称受理/投递。
- 角色边界根无限制放大证据范围，或模块外物证被接受（R3 负例失败）。

**来源**：方案 §3.1 第 30–32 行、§5.3.3、§5.5、§8.2 AC-5；复核 F2/F5/F7；团队计划 §6.3（R3）。

### 3.6 AC-6 测试与迁移质量（方案 §8.2 AC-6）

**标准（可核对语句）**

- **AC-6.1 不弱化测试**：不删除测试文件；不新增 `skip`/`todo`；不通过放松断言保绿；旧负例按方案 §7.3 逐条转为「硬负例」或「受理 + advisory」正例。
- **AC-6.2 run-change-entry 源码钉**：`run-change-entry.test.ts` 源码钉更新后仍覆盖显式入口/提案卡路径；不再要求源码含 `runChangeRejectionForDispatch`；保留 `proposalCardFrozenRejection`、`requestRunChangeDecision`、显式入口与 `run-change-required` 码表钉。
- **AC-6.3 类型检查与全量回归**：`npm run typecheck` 通过；T3 全量适用回归对当前候选执行；新增确定性失败为 0；既有失败按 B0 基线列出；新 skip 为 0。
- **AC-6.4 E2E**：若跑 E2E，`E2E_PASS=true` 或如实记录可复核的不可用原因；不以录屏作证据。

**判定方法**

1. 对测试 diff 逐文件核对：`git diff --diff-filter=D --name-only` 无删除；`git diff -U0` 无 `skip(`/`todo(` 新增；断言数量与强度不降低；旧负例逐条对应方案 §7.3 的迁移表。
2. 运行 `run-change-entry.test.ts`：断言显式入口/提案卡相关钉仍在；源码中不再有 `runChangeRejectionForDispatch` 钉（测试更新），但 `proposalCardFrozenRejection`/`requestRunChangeDecision`/`run-change-required` 仍被覆盖。
3. 运行 `npm run typecheck` 并记录退出码；运行 T3 全量回归（§5.3 命令）并记录计数/失败分类；与 B0 基线对照，新增确定性失败 = 0，新 skip = 0。
4. 运行 E2E（若可跑）并记录 `E2E_PASS`；不可跑时记录命令、错误原文、环境与原因；不得以录屏作为证据。

**所需证据**

- 测试 diff（删除/新增/修改逐条）与迁移映射说明。
- `run-change-entry.test.ts` 原始输出与源码钉 grep。
- `npm run typecheck` 原始输出与退出码。
- T3 全量回归原始命令、环境、计数、失败原文、B0 对照分类；排除 `write-sequencing.test.ts` 的命令与既有验收依据引用。
- E2E 原始输出/截图说明（如跑）或不可用原因（命令、错误、环境）。

**失败示例/反例（任一即 fail）**

- 删除测试文件、新增 `skip`/`todo`、放宽断言或删除负例以保绿。
- 旧负例未按 §7.3 迁移（直接删除或改成不核对行为的空壳断言）。
- `run-change-entry.test.ts` 仍要求 `runChangeRejectionForDispatch`，或迁移后丢失显式入口/提案卡覆盖。
- `npm run typecheck` 非 0 或未执行（未执行按 insufficient，视原因）。
- T3 全量未在当前候选执行、计数不可复算、新增确定性失败 > 0、或把既有失败算作通过。
- 声称 `E2E_PASS=true` 但无原始输出/候选哈希，或 E2E 未跑且无可复核原因。
- 以录屏作为证据或要求提供录屏。

**来源**：方案 §7.3、§8.1、§8.2 AC-6、§8.3；复核 F8；团队计划 §1.2、§7.3。

### 3.7 AC-7 run-change 边界（方案 §8.2 AC-7）

**标准（可核对语句）**

- **AC-7.1 不再自动弹卡**：派发不再自动呈现 run-change 卡；同一 pinned run 的 advisory 只记录，不弹卡（客户卡请求数为 0）。
- **AC-7.2 显式入口不变**：显式入口「契约变更 · 重开 run」与三种模式行为不变（`run-change-entry.test.ts` 既有用例）。
- **AC-7.3 不新增自动批准**：不新增 run-change 自动批准/代批逻辑；已取消的 run-change-auto-approve 不复活。

**判定方法**

1. 运行 `run-change-trigger.test.ts` 改造用例：pinned + 新版本派发受理 + advisory；客户卡请求数为 0；不再自动弹卡。
2. 运行 `run-change-entry.test.ts` 既有用例：显式入口与三模式行为不变；提案卡冻结路径保留。
3. 检查 diff：`runChangeRejectionForDispatch`/`dispatchFrozenConflictDetail` 及其派发调用点删除；`proposalCardFrozenRejection`/`offerRunChangeOnFrozenContract` 保留；无新增自动批准/代批分支；已取消的 run-change-auto-approve 未被恢复（对照沟通记录与既有代码）。

**所需证据**

- `run-change-trigger.test.ts`/`run-change-entry.test.ts` 原始输出。
- 客户卡请求数 0 的断言/捕获。
- 相关 diff（删除/保留/无新增）与候选哈希。

**失败示例/反例（任一即 fail）**

- 派发仍自动弹 run-change 卡，或客户卡请求数 > 0。
- 显式入口/三模式行为回归，或提案卡冻结路径被删除。
- 新增自动批准/代批逻辑，或恢复已取消的 run-change-auto-approve。

**来源**：方案 §5.6、§1.5、§8.2 AC-7；复核 R1（调用时序）与 F4（范围外披露）。

### 3.8 AC-8 文档与状态如实（方案 §8.2 AC-8）

**标准（可核对语句）**

- **AC-8.1 状态如实**：方案 P1.1 如实标注版本（P1.1）与实施状态（写方案时未实施/未测试/未验收）；方案/实施/验收文档不得把未实施写成已实施，不得把复核、团队计划或验收当作客户确认或实施授权。闸门 1/2 的确认以 `docs/communication/` 记录为准；方案文件头/团队计划文件头中早于确认的「待确认/未给」状态行属于历史状态行，不作为 fail 依据，也不得被引用为当前未确认的依据。
- **AC-8.2 角色卡/边界差异记录**：角色卡文本与新行为的差异记录为后续事项（O5），本任务不改角色卡文本/边界（闸门 2 确认的 B-1/B-2 边界补登除外；它是人事治理变更，不是 O5 对齐，也不属产品候选）。
- **AC-8.3 旧设计与旧验收记录**：按方案 §7.4 披露取代关系（P1 被 AC-1/AC-2 取代；P2/P4/P8/P11 部分取代；P3/P5/P6/P7/P9/P10 不变；G1–G6 不变）；不改写历史文件（旧设计、旧验收报告、旧团队计划保持原文）。

**判定方法**

1. 对照 `docs/communication/` 闸门 0/1/2 确认小节与方案/团队计划/验收文档的状态行；确认无「已获闸门 1/实施授权」之外的虚假声明；历史状态行按 §九.1/§九.2 处理。
2. 对 `角色卡/**` 做 `git diff`：除 B-1/B-2 两个边界条目 + changelog（人事治理）外无改动；`src/provider/runtime/schema.ts`、角色卡文本零改动；O5 仍在方案 §10/团队计划 §1.3 列为后续事项。
3. 对旧设计、旧验收报告、旧团队计划做 diff/哈希对照，证明零改动；检查实施变更记录是否按 §7.4 披露取代关系。
4. 检查 R4：方案 §13 是否已由策划作者编辑性更正（或按团队计划 §6.4 备用如实列为遗留文档项）；哈希映射按 §4.5 记录。

**所需证据**

- 文档状态核对记录（确认小节、状态行、历史状态说明）。
- `角色卡/**`、`src/provider/runtime/schema.ts` 的 diff/哈希对照与 B-1/B-2 条目。
- 旧设计/旧验收报告/旧团队计划的零改动证据。
- 实施变更记录中的 §7.4 取代关系披露；R4 更正/遗留项记录与哈希映射。

**失败示例/反例（任一即 fail）**

- 实施/验收文档声称已验收、已发布、已获客户确认或实施授权，但无对应记录。
- 把复核结论、团队计划或验收标准当成客户确认或实施授权。
- 角色卡文本被改动（O5 未授权），或边界改动超出 B-1/B-2。
- 旧设计/旧验收记录被改写或删除，或未按 §7.4 披露取代关系。
- R4 更正改动了 Q1–Q5/AC/写集/产品语义，或哈希映射缺失且把旧快照哈希当作当前复核记录。

**来源**：方案 §7.4、§8.2 AC-8、§10 O5、§13；复核 R4；团队计划 §6.4、§1.3。

---

## 四、跨任务核对项（R1、R2、R3、F4、R4）

### 4.0 总表与来源

| 核对项 | 来源 | 主题 | 最低证据 | 负责人/节点 |
| --- | --- | --- | --- | --- |
| R1 | 团队计划 §6.1；复核 R1 | 调用协议与「硬拒绝不产生任务/会话/draft run」 | P1 审核记录 + 调用顺序测试 + 硬拒绝零副作用测试 | 项目管理（P1）、编排/桌面窗口（A1/B1）、测试（D1） |
| R2 | 团队计划 §6.2；复核 R2 | pin/draft 锚定三分口径 | `run-pin` 三类 handoff 用例 + `tasks.jsonl` 锚点断言 | 桌面窗口（B1）、测试（D1） |
| R3 | 团队计划 §6.3；复核 R3 | `evidenceScopeRoots` 优先级与 fail-closed | 正例/负例 + 回退来源记录 | 桌面窗口（B1）、测试（D1）、验收 |
| F4 | 团队计划 §6.5；复核 F4 | `redispatch_task` 未被改动 | `git diff` 只读核对（run-role.ts 零改动 + session.ts hunk 不触及重派路径） | 测试（D1）、验收 |
| R4 | 团队计划 §6.4；复核 R4 | 方案 §13 引用更正与哈希映射 | 方案 §13 更正/遗留项记录 + 哈希映射 | 策划（作者）、沟通、统筹、验收 |

这些核对项来自闸门 2 确认的团队计划与复核披露，用于核对已确认方案的实施口径；**不新增产品 AC，也不得替代或弱化 AC-1–AC-8**。

### 4.1 R1 调用协议与「硬拒绝不产生任务/会话/draft run」

**标准（可核对语句）**

- **R1-a 硬授权先于 run 账本写入**：任何硬拒绝必须在 `ensureDraftRun`/`pinRun` 等 run 账本写入之前完成；硬拒绝不得产生任务行、不得打开目标会话、不得产生/领养新的 draft run。run 只读（`findActiveRun`/`verifyPinnedRun`/`loadPinnedRoster`）可在硬授权通过后进行。
- **R1-b 硬授权事实最小化**：来源/目标 id、`targetBuiltIn`、`targetExists`、`chiefRoleId`/`convenerRoleId`；这些在 `refreshListingNow` + 目标信息（`session.ts:6130-6137`）后即可得到，不依赖 chain facts 或 run 读取。
- **R1-c 单一公开入口**：`evaluateDispatchPreflight` 仍是唯一公开入口；若实现需要在硬授权前单独调用窄步骤，必须由 `workflow-preconditions.ts` 同一模块导出或由入口内部复用，不得出现第二份谓词/重复判定逻辑；实现提案必须给出最终调用图（硬授权 → 事实 → run 只读/记账 → advisory → `task.created`）。
- **R1-d advisory 不反向影响硬授权**：状态事实/run 读取失败按缺事实 → advisory，不抛到调用方；advisory 计算不得把 `ok:true` 变 `ok:false`。
- **R1-e 测试**：至少覆盖——硬拒绝（运营→非质检内置且带 flowId；幕僚→项目 worker；自派；未知来源）不产生 `tasks.jsonl` 行、不打开目标会话、**不产生/领养 draft run**（可注入/观察 `ensureDraftRun` 未被调用，或断言 run 目录/账本无新记录）；硬授权通过、状态缺失时受理 + advisory + 任务行 + 投递；调用顺序测试（session 集成或对导出窄步骤的单测）证明硬授权先于 run 账本；既有 `run-required` 正例（有 flowId 时保证 run 锚点）不回归。
- **R1-f P1 审核关口**：项目管理在 A1/B1 写代码前审核实现提案并确认 R1 协议与上述测试；审核结论应为 `recommend approval`；未确认前不得写产品代码（团队计划 §6.1.6）。

**判定方法**

1. 读取 P1 实现提案与项目管理审核记录：确认给出最终调用图、R1-a–R1-e 的落实方式、结论为 `recommend approval`；若为 `needs revision`/`not ready` 或缺失，按 §4.6 记录。
2. 读取 `app/desktop/session.ts` diff 与测试：确认硬授权调用点在 `ensureDraftRun`/`pinRun` 之前；硬拒绝路径无 run 账本写入。
3. 运行 R1-e 测试：捕获 `tasks.jsonl` 行数、目标会话状态、run 目录/账本新记录、`ensureDraftRun` 调用观察；运行调用顺序测试与 `run-required` 正例。
4. 检查 `workflow-preconditions.ts`：单一公开入口；无第二份谓词/重复判定；`collectDispatchAdvisories` 不读盘/写盘、不返回 `ok:false`。

**所需证据**

- P1 实现提案与项目管理审核记录（路径、结论、R1 覆盖）。
- 调用顺序测试/硬拒绝零副作用测试原始输出（命令、退出码、计数、断言）。
- `tasks.jsonl` 行数、目标会话状态、run 目录/账本新记录、`ensureDraftRun` 观察证据。
- `session.ts`/`workflow-preconditions.ts` diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 硬拒绝仍产生/领养 draft run，或先写 run 账本再硬授权。
- 出现第二份授权谓词/重复判定，或 `evaluateDispatchPreflight` 不再是单一入口且无同模块窄步骤说明。
- advisory 计算把 `ok:true` 变 `ok:false`，或状态事实读取失败抛到调用方。
- R1-e 测试缺失任一类（无 draft run/调用顺序/`run-required` 正例），或只有实现自述。
- P1 审核缺失、结论非 `recommend approval`，或 A1/B1 在审核前写产品代码（流程偏差，按 §4.6 判返工/证据不足）。

**来源**：团队计划 §6.1、§5.3（P1 出口）；复核 R1；方案 §5.2/§5.3.1/§5.3.2/§9.3。

### 4.2 R2 pin/draft 锚定三分口径

**标准（可核对语句）**

- **R2-a pin 失败**（handoff 时缺 D3/缺文档/pin 失败/pin 后校验失败）：派发受理；任务可锚定**已有 draft run**（`runId`/`runState:"draft"`），不得伪造 pinned；不得把校验失败的 pinned run 作为锚点；记 `run-pin-failed`/`run-pin-required` 等 advisory。
- **R2-b 无 runManifest / 无 flowId（handoff `session.ts:6245-6247` 早退）**：派发受理；任务**省略** run/flow 锚点；记 `run-ledger-unavailable`（无 runManifest）或 `run-pin-required`（有 draft 未 pin）；`stepId=project-handoff` 仍写，`handoffFound` 仍可按 stepId 识别。
- **R2-c advisory 触发口径**：方案 §4.2 的 advisory 触发说明按上述口径实现（`run-ledger-unavailable` 覆盖 handoff 无 flowId/无 runManifest；`run-pin-required` 覆盖 handoff pin 失败/早退），不把「pin 失败」笼统写成「任务省略锚点」。
- **R2-d 测试**：`run-pin.test.ts` 覆盖 handoff 无 flowId、runManifest 缺失、pin 失败三类；断言受理、锚点符合上述规则、不伪造 pinned、不触发 run-change 卡。
- **R2-e 锚定三分与正例**：三种锚定结果为——① 有可用 draft → 锚定 `runId`/`runState:"draft"`；② 合法 pinned（`verifyPinnedRun` 通过、`loadPinnedRoster` 成功且目标/模块覆盖）→ 锚定 pinned；③ 无可用 run/flow → 省略 run/flow 锚点。R2 只改变失败/缺失路径的降级，不改变合法 pinned 的正例（AC-3.4）。

**判定方法**

1. 读取 `session.ts` diff：handoff `:6245-6247` 早退改为 advisory；pin 失败/校验失败改为 advisory 并跳过 pin；`task.created` 锚点按 draft/pinned 规则构造。
2. 运行 `run-pin.test.ts` 三类用例：捕获 `tasks.jsonl` 锚点字段、advisory、`stepId`、run 状态；确认无伪造 pinned、无 run-change 卡。
3. 对照方案 §4.2 advisory 表与实现：`run-ledger-unavailable`/`run-pin-required`/`run-pin-failed` 触发链与 R2 一致；无「pin 失败即省略锚点」的混写。
4. 检查 handoff 无锚点任务：`stepId=project-handoff` 存在；后续 `handoffFound` 测试按 stepId 识别通过。

**所需证据**

- `run-pin.test.ts` 三类 handoff 原始输出（命令、退出码、计数、断言）。
- `tasks.jsonl` 锚点字段与 `stepId` 摘录；advisory 捕获；run 状态/目录证据。
- `session.ts` diff 与候选哈希；方案 §4.2 对照记录。

**失败示例/反例（任一即 fail）**

- pin 失败仍硬拒，或任务未创建。
- 伪造 `runState:"pinned"`，或锚定校验失败的 pinned run。
- 无 runManifest/flowId 时仍带锚点，或 `stepId=project-handoff` 丢失。
- 三类 handoff 场景缺任一类测试，或只测一类就声称覆盖。
- advisory 触发混写（把 pin 失败写成省略锚点、把无 runManifest 写成 pin 失败）。

**来源**：团队计划 §6.2；复核 R2；方案 §4.2、§5.3.3、§5.5、§8.2 AC-3.2/AC-3.3。

### 4.3 R3 `evidenceScopeRoots` 优先级与 fail-closed 正/负例

**标准（可核对语句）**

- **优先级**：① 任务自身 `modulePaths`（按 `taskId`/creator 兼容匹配，覆盖无 flow 锚点的 verifier 任务）→ ② 适用的 roster 模块根（pinned roster 仅在锚定时用；否则最新 roster）→ ③ 角色边界根**仅作最后兜底**，需限定到模块/角色相关范围并记录来源；都没有 → **fail-closed**，不把模块外物证算作模块证据。
- **不得静默空 roots**：不得因省略 flow 锚点让 verifier 任务的 `scopeRoots` 静默变空而拒绝所有物证；也不得用无边界的角色边界根放宽验收证据范围。
- **测试**：`chain-enforcement.test.ts`（或新增既有授权内用例）覆盖——无 flow 锚点的 verifier 任务仍以 `modulePaths` 贡献证据根（正例）；模块外物证不被接受（负例）；角色边界兜底需可核对/记录。
- **实现与审核**：桌面窗口在 B1 实现；P1 审核确认口径；V1 验收把 R3 正/负例列为核对项（团队计划 §6.3）。

**判定方法**

1. 读取 `evidenceScopeRoots` diff：确认优先级实现与来源记录；无 flow 锚点 verifier 任务按 taskId/creator 匹配 `modulePaths`；roster 回退按 pinned/latest 规则；角色边界兜底有范围限定与来源记录。
2. 运行正例：无 flow 锚点的 verifier 任务带 `modulePaths`，`scopeRoots` 非空且包含该路径；物证在该路径内被接受。
3. 运行负例：模块外物证不被接受；角色边界兜底不放宽到模块外；无 `modulePaths`/roster/边界时 fail-closed（拒绝而非误放行）。
4. 检查 P1 审核记录是否确认 R3 口径。

**所需证据**

- `evidenceScopeRoots` diff 与候选哈希。
- 正例/负例原始输出（`scopeRoots` 实际值、物证检查结果、拒绝原因）。
- 角色边界兜底的来源/范围记录。
- P1 审核记录中的 R3 覆盖。

**失败示例/反例（任一即 fail）**

- 无 flow 锚点 verifier 任务 `scopeRoots` 为空，导致所有物证被拒（静默空 roots）。
- 角色边界根无限制地纳入，模块外物证被接受（放宽验收范围）。
- 无任何根时仍误放行（未 fail-closed），或伪造证据通过。
- 只测正例、缺负例；或只有实现自述、无实际 `scopeRoots` 捕获。

**来源**：团队计划 §6.3；复核 R3；方案 §5.3.3（`evidenceScopeRoots` 行）、§5.5、§8.2 AC-5.3/AC-5.6。

### 4.4 F4 `redispatch_task` 只读核对

**标准（可核对语句）**

- `git diff --name-only` 确认 `src/pipeline/orchestration/run-role.ts` **未被修改**。
- `git diff -U0 app/desktop/session.ts` 的 hunk **不覆盖** `redispatchTask`（`:4476` 起）、`chooseRedispatchTarget`（`:4324-4330`）及重派相关区域；`session.ts` 其它区域因本任务改动属预期。
- D1 证据中记录核对命令与结果；F4 作为已披露未关闭项记录（不因本任务未修而判失败）。

**判定方法**

1. 运行 `git diff --name-only` 与 `git diff -U0 -- app/desktop/session.ts`，读取 hunk 行号/上下文，确认不触及重派路径。
2. 核对 `src/pipeline/orchestration/run-role.ts` 的 `git hash-object`/sha256 与 B0 基线一致。
3. 读取 D1 证据的 F4 核对记录（命令、输出、结论）。

**所需证据**

- `git diff --name-only`、`git diff -U0 -- app/desktop/session.ts` 原始输出。
- `run-role.ts` 基线/候选哈希对照。
- D1 F4 核对记录。

**失败示例/反例（任一即 fail）**

- `run-role.ts` 被修改（无论是否与 redispatch 直接相关）。
- `session.ts` diff 触及 `redispatchTask`/`chooseRedispatchTarget`/重派路径。
- 缺 F4 只读核对证据，或把「未改」写成自述而无 diff/哈希。

**来源**：团队计划 §6.5、§7.3；复核 F4；方案 §1.2/§1.5/§2.2/§9.1/§10 O7。

### 4.5 R4 方案 §13 引用更正与哈希映射

**标准（可核对语句）**

- 现状（写标准时）：方案 §13（`2026-11-02_design_dispatch-guardrail-relax.md:853-875`）仍引用 P1.0 复核快照（101 行 / `232c4b1c…`）并写「仍未解决的意见：无」，与当前复核记录（150 行 / `aa702f6b…`，含 F4 部分采纳 + R1–R4）不一致。
- 期望（团队计划 §6.4）：由策划作者（`docs/planning/` 所有者）在**提交前/实施前**把 §13 复核记录引用更新为当前复核记录（150 行 / `aa702f6b…`），并如实写明未决项：F4 部分采纳未关闭（O7 后续）+ R1–R3 一致性问题；**不得改已确认的方案语义、Q1–Q5、AC 或写集**。
- **哈希映射**：闸门 1 确认的 P1.1 哈希 `54da5d31…` 仍是**语义基线**；更正后的方案哈希必须记录为「编辑性更正版」，V1/验收引用两者并注明关系，不把新哈希当作新语义确认。
- **备用**：若策划上下文在实施前无法启动，实施方只能在自身变更记录中引用正确复核快照并把方案 §13 更正列为**遗留文档项**交策划；不得自行改 `docs/planning/` 或声称方案已更新。

**判定方法**

1. 读取方案 §13 当前内容与哈希：判断是否已更正；若已更正，运行 diff 核对仅涉及 §13 引用/未决项表述，无 Q1–Q5/AC/写集/产品语义变化。
2. 读取变更包/V1/实施记录中的哈希映射：确认 `54da5d31…` 为语义基线、更正版哈希标注为编辑性更正。
3. 若未更正：读取实施记录是否正确引用 `aa702f6b…` 并把 §13 更正列为遗留文档项；不得由实施方自行改 `docs/planning/`。

**所需证据**

- 方案 §13 当前文本/哈希与（如已更正）编辑性 diff。
- 变更包/实施记录中的哈希映射与遗留项记录。
- 沟通/统筹的确认记录（如涉及）。

**判定方法与处理规则**

- 已更正且证明为编辑性、哈希映射完整 → R4 核对项满足。
- 未更正但实施记录如实引用正确复核快照并列为遗留文档项 → 记为**开放文档项**，不因产品候选未修而判 fail；但验收报告必须如实列出，且不得引用旧快照哈希冒充当前记录。
- 声称已更正但无证据、更正改动了已确认语义/Q1–Q5/AC/写集、哈希映射缺失或把新哈希当语义确认 → **fail**（文档状态如实，AC-8.1/AC-8.3 相关），按 §4.6 处理。
- 任何其它角色自行修改 `docs/planning/` 或声称方案已更新 → 越权，按 §4.6 返工。

**失败示例/反例（任一即 fail）**

- 声称已更正但无 diff/哈希证据；更正触及 Q1–Q5/AC/写集/产品语义；哈希映射缺失；把更正版哈希当作新的客户确认。
- 未更正且实施记录仍引用旧快照 101 行 / `232c4b1c…` 作为当前复核记录，或未把 §13 更正列为遗留文档项。
- 任何非策划角色修改 `docs/planning/` 或声称方案已更新。

**来源**：团队计划 §6.4、§9.2；复核 R4；方案 §13。

### 4.6 核对项与 AC 的关系及总体判定

- R1 支撑 AC-1（硬拒绝零副作用）、AC-3（run 记账非阻断）、AC-6（测试质量）与 AC-7（run-change 边界）；R1 证据缺失/不满足 → 相关 AC 判 `insufficient evidence`/`fail`，总体不得通过。
- R2 支撑 AC-3.2/AC-3.3；三类 handoff 口径缺任一类 → AC-3 判 `insufficient evidence`。
- R3 支撑 AC-5.3/AC-5.6；正/负例缺一 → AC-5 判 `insufficient evidence`，若模块外物证被接受则 AC-5 判 `fail`。
- F4 是范围不变量：本任务未改重派路径是「不越权」的核对项，不作为产品功能 pass 的加分项；若改动则按越权/方案偏差判返工（F4 核对项 fail，并影响 AC-8/AC-6 的写集与方案一致性判断）。
- R4 是文档状态核对项：按 §4.5 的判定/处理规则记录；文档项开放不等于产品 AC pass，也不得把开放项隐藏。
- 总体结论要求：AC-1–AC-8 全部 pass，且 R1/R2/R3 满足、F4 未改、R4 按 §4.5 记录；任何 `fail` → 返工；无 `fail` 但有 `insufficient evidence` → 证据不足。

---

## 五、T3 依据、升档条件与证据计划

### 5.1 T3 依据

- 技能 `references/testing.md` 的唯一定义：**T3 = 发布、共享抽象（Model/公共入口/跨模块契约）、治理或权限变更，或证据基础不确定；默认验证为全量适用回归 + 发布/共享抽象检查**。
- 方案文件头与 §9 定档 **T3**：改动产品派发受理语义，属于治理/权限边界变更；即使方向是放宽，也不是纯文档或局部实现。闸门 1 确认 T3，闸门 2 确认 T3 与验证口径（团队计划 §1.2/§8.4）。
- 变更同时触及共享编排契约（`DispatchPreflightInput`/`DispatchPreflightResult`/`DispatchAdvisory`，`src/common/编排/` 唯一 primary owner 为编排；桌面窗口按冻结形状消费）与跨层集成（`app/desktop/session.ts`），符合 T3 的共享抽象/跨模块契约与治理变更判据。
- 不把「方向是放宽」「大部分是提示」当作降档理由；升档不降档。

### 5.2 受影响层与跨角色回归

| 层/角色 | 受影响内容 | 检查 |
| --- | --- | --- |
| 编排（`src/common/编排/`） | `evaluateDispatchPreflight` 硬授权；新增 `dispatch-advisories.ts`；`mechanical-rejection.ts` 文案/码表；`DispatchPreflightInput.targetExists`、`chiefRoleId: string \| null`、`ok:true.advisories` | 两个单测文件（含每个 advisory code 正/负例、链顺序、空 advisory、无拒绝返回）+ `npm run typecheck` |
| 桌面窗口（`app/desktop/session.ts`） | 硬授权接线；advisory 事实收集/回执/系统行/诊断；run 记账尽力而为；handoff 早退/pin 失败；`task.created` 锚点/模块字段；`evidenceScopeRoots`；删除派发触发 run-change | 7 个桌面测试文件 + `npm run typecheck`；R1/R2/R3 专项 |
| 任务账本/run/版本基线（只读依赖） | `task-state.ts` 的 `run-required`、`run-manifest` 读取、`versioned-doc-guard` 写入只读 | 既有测试回归 + 零改动哈希对照 |
| 跨角色/完整流程（测试角色） | 方案 §8.1 全部命令 + `test/桌面应用/**`、`test/编排/**` 补充 + T3 全量 + F4 只读核对 + E2E | D1/D2 原始输出、计数、失败分类、候选哈希 |
| 条件 i18n（项目管理） | 仅 P1 审核确认需要新 key 时 `messages/{zh-CN,en-US}.ts` 与 `i18n.test.ts` | 中英成对、计数、零中文泄漏；默认不新增 |

跨角色回归必须覆盖：硬授权负例与状态 advisory 正例；run/版本基线/模块/verifier 元数据；报告路由（`reportTargetForTaskCreator`）与任务卡回归；范围外护栏（D3/appointment-write、写守卫/shell、版本化只读、验收、G-1 拒投）不变。

### 5.3 T3 全量回归口径

- 命令（worktree 根执行；实际 runner 以仓库脚本为准）：

```bash
node --test --test-concurrency=1 $(find test -name '*.test.ts' ! -name 'write-sequencing.test.ts')
```

- `test/pi-adapter/write-sequencing.test.ts` 为既有已知挂起，按 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604` 允许排除，但必须记录排除命令、原因与既有验收依据；**不得静默跳过**。
- 记录：命令、工作目录、环境（Node/npm、OS/Shell）、退出码、测试计数（pass/fail/skip/todo）、失败原文（不截断关键堆栈）、执行时间；按 B0 基线区分既有失败与本次新增失败；**新增确定性失败必须为 0，新 skip 必须为 0**。
- 仓库既有 Windows symlink EPERM 失败与 `write-sequencing` 挂起不由本变更修复；报告中列为既有失败，不计入通过，也不得把既有失败算作本变更失败。
- 全量回归必须针对**当前候选**执行；候选变化（代码/测试/夹具/配置）使结果失效，需重跑受影响部分或全量。

### 5.4 typecheck、E2E 与截图规则

- `npm run typecheck` 必须通过并记录退出码；本任务默认不改渲染层，`typecheck:renderer`/`build:renderer` 不默认要求；如 P1 审核确认改了渲染层，按团队计划条件执行。
- E2E：可跑则执行 `node_modules/.bin/electron test/桌面应用/e2e/main.mjs`，记录 `E2E_PASS`、截图（最多）、候选哈希、命令与窗口尺寸；不可跑则记录可复核原因（命令、错误原文、环境），不得静默跳过。按团队计划 §4.3/§5.3/§7.3，验收可将 E2E 记 `not applicable`/`insufficient evidence`（视原因证据），但 AC-6.4 的「如实记录」必须满足。
- **截图规则**：最多截图，不要求录屏；截图来自当前候选真实运行、关闭 DEBUG 覆盖层，记录 sha256、候选版本、拍摄命令/窗口尺寸；不得以录屏作为验收要求或选项；缺少录屏不构成 fail/insufficient。

### 5.5 命令清单（最低要求；实际以仓库脚本/runner 为准）

| 范围 | 命令 | 产出角色 |
| --- | --- | --- |
| 编排（A1） | `node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts test/编排/dispatch-advisories.test.ts`；`npm run typecheck` | 编排 |
| 桌面窗口（B1） | `node --test --test-concurrency=1 test/桌面应用/chain-enforcement.test.ts test/桌面应用/star-routing.test.ts test/桌面应用/rejection-copy.test.ts test/桌面应用/run-pin.test.ts test/桌面应用/run-change-trigger.test.ts test/桌面应用/run-change-entry.test.ts test/桌面应用/dispatch-fresh-enum.test.ts`；`npm run typecheck` | 桌面窗口 |
| 测试（B0） | 受影响套件 + T3 全量基线 + `npm run typecheck`；记录 HEAD/工作树/Node/npm/Electron/应用启动方式/失败分类 | 测试 |
| 测试（D1） | 方案 §8.1 全部命令 + `test/桌面应用/**`、`test/编排/**` 补充 + T3 全量回归（§5.3）+ `npm run typecheck`；F4 只读核对 | 测试 |
| 测试（D2） | `node_modules/.bin/electron test/桌面应用/e2e/main.mjs`（若可跑） | 测试（桌面窗口按需支持） |
| 项目管理（P1） | 审核记录（`recommend approval`/`needs revision`/`not ready`）；条件 i18n 时 `node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts` + typecheck | 项目管理 |
| 人事（H1） | `boundary.md`/`boundary.yaml` 一致性检查、B-1/B-2 条目、changelog、哈希 | 人事 |

命令若因仓库实际脚本/runner 不同而调整，须在变更包中记录实际命令、原因与等价性；不得用不可运行的示例命令冒充结果。

### 5.6 原始输出、哈希与证据路径

- 每次检查记录：命令原文、工作目录、环境（Node/npm、OS/Shell）、退出码、测试计数（pass/fail/skip/todo）、失败原文（不截断关键堆栈）、执行时间；跳过项写明原因。只给「全部通过」摘要不算原始证据。
- 候选身份：每个改动/新增文件 `git hash-object` + `sha256sum`（工作区；CRLF/LF 差异分别记录）；新增文件同。
- 改动范围：`git status --short`、`git diff --name-only`、`git diff --cached --name-only`；逐路径核对团队计划 §4.1/§4.3 写集与 B-1/B-2；写集外改动记录基线/候选哈希对照，证明零改动。
- 测试 diff 用 `git diff -U0` 片段证明无弱化断言；`run-change-entry.test.ts` 的源码钉变更逐条列明。
- 证据路径按团队计划 §7.3：实施角色与测试角色的证据放各自 `角色卡/<role>/docs/change/...-evidence/`（或团队计划认可的等价位置）；`docs/acceptance/` 只放标准与报告；管理记录不混入产品候选。
- 禁止：伪造命令/输出/令牌/锁/审批；改断言保绿；跳过来源；把设计/计划写成已实施；把摘要当原始证据；用其它变更证据替本变更背书；写 `docs/verification/`；要求或提供录屏。
- 无 task_ops：不伪造机器状态/凭证；以文件哈希与原始输出为准（§2.6）。

### 5.7 升档与停止条件

- 实施中出现以下任一，停止并回报统筹/沟通，按方案 §9.3/团队计划 §5.4 处理（重开闸门、升档）：
  - 改 `task-state.ts` 的 `run-required` schema、改 D3/写卡/验收/写守卫/角色卡文本/边界（B-1/B-2 除外）、改 `planDispatchDelivery` 拒投行为或运行文案；
  - 改 `redispatch_task`/`redispatchTask`/`chooseRedispatchTarget` 的目标选择与授权语义（F4/O7）；
  - 新增共享抽象/公共导出/跨模块契约（超出团队计划 §4.2 的冻结形状），或改动 `src/model/runtime.ts`、`run-manifest.ts`、`versioned-doc-guard.ts`、`governance-roles.ts`、`handback.ts`、`src/provider/runtime/schema.ts`、`app/renderer/**`；
  - 写集/边界/档位变化，或需要新增未列路径（含 `test/桌面应用/e2e/` 新脚本、角色卡、`src/provider/runtime/schema.ts` 等）；
  - 证据不足以建立跨模块/全量/E2E 结论（候选不可复算、硬拒绝副作用未测、R2/R3 缺失、全量失败未分类）。
- 升档后本文件标准不因升档而放宽；标准变更按 §1.2 处理（递增版本、记录理由、交沟通/统筹确认）。
- 证据不足时按 `references/testing.md` 升到更高档补证，最高至全量回归；不得以时间紧降档。

---

## 六、成功、失败与边界情形（判定观察点）

| 情形 | 预期观察 | 判定 |
| --- | --- | --- |
| 自派 / 非幕僚运营来源 / 幕僚→项目 worker / 运营→非质检内置 | `ok:false` 对应码；`tasks.jsonl` 行数不变；目标会话未打开；无投递；无 draft run | 受理/建行/开会话/建 draft run → AC-1 fail（R1 fail） |
| 运营→不存在项目角色；幕僚→`su`/未知内置；幕僚→未知非内置 | `target-card-missing`（前二者）/`chief-to-project-forbidden`（后者）；文案覆盖 id 与写卡两种原因；无任务行 | 放行/错码/文案只覆盖一种 → AC-1 fail |
| 硬拒绝 | 不触发 run-change 自动卡；客户卡请求数 0 | 弹卡/请求数 > 0 → AC-1/AC-7 fail |
| 幕僚→策划缺意图/flow | 受理；任务行 +1；advisory（链首个）；投递 | 拒绝/无行/无投递 → AC-2 fail |
| 幕僚→人事缺方案/名单/模块/env；幕僚→运营缺 D3/卡/draft | 受理；advisory 对应；任务行 +1 | 拒绝/旧硬码 → AC-2 fail |
| 运营→worker 缺 handoff/run/module/D3 选中 | 受理；advisory 对应；任务行 +1；目标存在则投递；实现目标非属主不写模块字段 | 拒绝/非属主写字段 → AC-2 fail |
| 运营→verifier 缺 handoff/module，带模块 | 受理；advisory；任务写 `moduleId`/`modulePaths`（不要求属主）；文件型不写 `moduleDirectory` | 未写模块字段/写 `moduleDirectory` → AC-2/AC-5 fail |
| legacy flow | 受理；advisory `run-legacy-readonly`；旧记录可读 | 拒绝/旧记录不可读 → AC-2 fail |
| 版本化基线违规 | 受理；advisory；基线/文档未改写；旧版本写入仍被拒 | 拒绝/改写/旧版本写入放行 → AC-2/AC-5 fail |
| pinned 哈希漂移/roster 失败 | 受理；advisory；manifest 未改写；不锚定无效 pinned | 锚定无效 pinned/改写 → AC-2/AC-3 fail |
| 无 flowId 无法推断 | 受理；任务无 flow/run 锚点；advisory `flow-required` | 带锚点/`run-required` 失败 → AC-2/AC-3 fail |
| pinned 不含目标 | 受理；advisory `run-role-missing`；不锚定该 run | 锚定/拒绝 → AC-3 fail |
| handoff pin 失败 | 受理；任务创建；draft 可锚定、不得伪造 pinned；advisory | 拒绝/伪造 pinned/锚定失败 pinned → AC-3 fail（R2 fail） |
| handoff 无 flowId/无 runManifest | 受理；任务无锚点；`stepId=project-handoff`；advisory `run-ledger-unavailable`/`run-pin-required` | 拒绝/丢 stepId/带锚点 → AC-3 fail（R2 fail） |
| 状态齐备 | 无 advisory；回执与现状一致；无额外诊断 | advisory/回执变化/噪声 → AC-4 fail |
| 状态不齐 | 回执「已受理」「状态提示（未阻断）」「受理≠已完成」；诊断 `reasonCode`；最多 3 条提示 | 拒绝词/无记录/全部展示 → AC-4 fail |
| verifier 无 flow 锚点 | `modulePaths` 贡献证据根；模块外物证拒绝；角色边界兜底有界/记录；无根 fail-closed | 空 roots 拒全部/模块外接受/误放行 → AC-5 fail（R3 fail） |
| G-1 引用缺失 | `planDispatchDelivery` 拒投；任务 `task.closed(rejected)`；文案逐字不变 | 放行/文案变化 → AC-5 fail |
| 目标会话打不开 | `task.closed(rejected)`；不投递 | 受理/投递 → AC-5 fail |
| 幂等同键重复 | `ok:true`；不新建/不投递；终态提示新文本/新键 | 新建/重复投递 → AC-3 fail |
| 派发不再自动弹 run-change | 受理 + advisory；客户卡请求数 0；显式入口/提案卡不变 | 弹卡/入口回归 → AC-7 fail |
| typecheck | 退出码 0 | 非 0/未执行 → AC-6 fail/insufficient |
| T3 全量回归 | 当前候选执行；新增确定性失败 0；新 skip 0；既有失败分类 | 未执行/计数不可复算/新增失败 → AC-6 fail/insufficient |
| E2E | `E2E_PASS=true` + 证据，或可复核不可用原因 | 伪造/无原因 → AC-6 fail/insufficient |
| 测试迁移 | 无删测/新 skip/放宽；旧负例逐条迁移 | 删测/放宽 → AC-6 fail |
| 写集 | 仅在团队计划 §4.1/§4.3；B-1/B-2 外无边界改动 | 越界 → AC-8/总体 fail |
| F4 | `run-role.ts` 零改动；session.ts hunk 不触及重派路径 | 改动 → 返工 |
| R4 | 方案 §13 更正/遗留项记录与哈希映射 | 虚假更正/语义变更/映射缺失 → AC-8 fail |
| 录屏/截图缺失 | 方案未要求录屏 | 不构成 fail/insufficient |

---

## 七、与团队计划、写集与授权边界

- 写集以闸门 2 确认的团队计划 §4.1/§4.3 为准：编排 `src/common/编排/workflow-preconditions.ts`、新增 `dispatch-advisories.ts`、`mechanical-rejection.ts`、`test/编排/workflow-preconditions.test.ts`、新增 `test/编排/dispatch-advisories.test.ts`；桌面窗口 `app/desktop/session.ts` + 7 个 `test/桌面应用/*` 列名文件；测试 `角色卡/测试/docs/change/` 证据（默认不新增 `test/测试/` 文件）；项目管理 P1 审核记录 + 条件 i18n；人事 H1 B-1/B-2。验收按该写集核对 `git diff --name-only`/`git status --short`；任何角色不得写其他角色路径、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界（B-1/B-2 由人事执行）。
- 边界变更仅限 B-1/B-2（桌面窗口 `boundary.md`/`boundary.yaml` 新增 `run-change-trigger.test.ts`、`run-change-entry.test.ts` 精确条目 + changelog）；无其它边界改动。团队计划 §9.3 第 1 项已把方案 §7.3/§8.1 的「编排纯逻辑/桌面集成」测试标签校正为实际归属（`test/编排/` 属编排、`test/桌面应用/` 对桌面窗口逐文件授权、`test/测试/` 属测试）；验收按团队计划实际归属核对，不以方案标签文字判越权。
- 不改 `src/model/runtime.ts`、`src/common/编排/task-state.ts`（含 `run-required` schema）、`run-manifest.ts`、`versioned-doc-guard.ts`、`governance-roles.ts`、`handback.ts`（运行文案）、`src/provider/runtime/schema.ts`（O5）、`app/renderer/**`；不改 `package.json`/锁/构建/发布配方；不 commit/push/merge/release（团队计划 §八）。验收通过只表示当前候选满足本标准，不授权提交/推送/合并/发布。
- 条件 i18n 仅在 P1 审核确认需要新 key 时由项目管理按既有目录授权写；默认复用现有 `main.session.acceptedTask` + 中文 advisory 文本，不新增 key。确需新增时中英成对、计数更新、零中文泄漏。
- 无 task_ops；不伪造机器状态、凭证、锁或审批。H1 边界补登是闸门 2 确认的人事治理变更，不计入产品候选；其 changelog 完成状态由统筹/人事确认（写标准时未观察到对应新增，见 §1.4/§九.4）。

---

## 八、版本冻结与报告安排

- 本文件路径固定为 `docs/acceptance/dispatch-guardrail-relax-criteria-v1.md`，版本 **v1**，日期 **2026-11-02**；写盘即冻结，标准先于实施。
- 实施前：沟通确认本文件路径/版本；未确认不派实施（团队计划 V1 出口）。本文件不因实施授权未给而失效；实施授权另记。
- 实施后：统筹提交变更包（`docs/scheduling/dispatch-guardrail-relax-change-v1.md`：候选哈希、改动路径、节点 G2–E3、证据链接、T3、复用/失效说明）；独立验收按本文件判定并**另写** `docs/acceptance/dispatch-guardrail-relax-report-v1.md`；报告首行至少含风险档位、判定依据、选定检查、复用证据、消费者重测结论、T3 全量回归（已执行或 N/A + 理由）、E2E 状态、结论。
- 报告核心为逐项验收表（§2.1）；总体结论只能是**通过 / 返工 / 证据不足**，不得用「基本完成」「全部通过」等模糊措辞替代。
- 本文件不包含任何候选判定、通过/返工/证据不足结论；不做验收结论的提前预告。
- 标准变更：递增版本、记录理由、交沟通/统筹确认；候选变化不改变标准，只使受影响证据失效并补证。
- 验收通过不授权提交、推送、合并、发布；这些另行授权（团队计划 §八）。

---

## 九、写标准时发现的待澄清项与只读核对结果（只报告，不修改）

以下为只读核对发现的事实/文档状态/口径问题，供统筹/沟通/策划处理；本文件**未修改**方案、复核、团队计划、沟通记录、角色卡、产品源码或测试，也未自行放宽标准。除明确说明外，这些问题不改变本文件的判定力度；如方案/客户后续澄清与本文件理解不同，按 §1.2 递增版本重判。

1. **沟通记录为并发追加的管理记录**：写标准时 `117 行` / `84d09792…`；团队计划文件头引用「当前 91 行 / `b0bb187c…`」，方案文件头引用闸门 0 快照「67 行 / `212e987f…`」。验收引用其确认小节（闸门 0/1/2、实施授权），不以旧快照哈希替当前记录，也不混用。
2. **文档状态头漂移（方案/团队计划）**：方案 P1.1 文件头仍写「待闸门 1 客户确认」；团队计划文件头/§二仍写「闸门 2 未确认、实施授权未给」；沟通记录已含闸门 0/1/2 确认。判定以 `docs/communication/` 确认小节与冻结哈希为准；这些状态行是写于确认之前的历史状态行，不影响本文件条目（AC-8.1 已按此口径）。
3. **R4 未执行（写标准时）**：方案 §13 仍引用 P1.0 复核快照（101 行 / `232c4b1c…`）并写「仍未解决的意见：无」；当前复核记录为 150 行 / `aa702f6b…`（含 F4 部分采纳 + R1–R4）。R4 由策划作者在提交前/实施前编辑性更正；本文件 §4.5 已定义判定/处理规则，不自行修改方案。
4. **H1 边界补登状态**：`角色卡/桌面窗口/boundary.md` 与 `boundary.yaml` 已含 B-1/B-2 两个逐文件条目（Delta-DGR-1/2）；写标准开始时未观察到 `角色卡/桌面窗口/changelog.md` 的对应新增，**写标准过程中（并发）changelog 已新增 2026-11-02 B-1/B-2 记录（人事 H1，非本验收写入；md/yaml/changelog 口径一致）**。H1 完成状态由统筹/人事确认。H1 是治理变更，不纳入产品候选；验收只按 B-1/B-2 核对写集授权，不因 changelog 状态把产品 AC 判 fail（如统筹要求，另记 H1 遗留项）。
5. **AC-4.1 文案与既有回执**：现有受理回执使用「受理 ≠ 完成」（带空格），方案 AC-4.1 写「受理≠已完成」；本文件按语义等价处理，要求回执含「状态提示（未阻断）」与非完成标记且无拒绝词；不要求逐字等于某一空格形式。`planDispatchDelivery` 的 G-1 文案则按方案要求**逐字不变**，两者不混用。
6. **`target-card-missing` 文案覆盖两种原因**：方案 §4.3 要求 action 同时覆盖「拼写/id 错误」与「角色卡/边界未就绪」；本文件 AC-1.5 按此核对。若实现只改其中一种，按 AC-1.5 fail/insufficient，不自行放宽为「任一即可」。
7. **项目 worker 目标存在性口径**：`target-card-missing` 的「目标不存在/未枚举」以角色枚举（`角色卡/<id>/role-card.md` 与 `boundary.yaml`/`boundary.yml`/`boundary.md` 都存在且可解析）为准；listing/refresh 不可用时按方案 §5.3.3 对项目 worker 目标硬拒并不猜，内置目标仍由注册表判定。该口径属 AC-1.5 的证据细化，不新增产品要求。
8. **`planDispatchDelivery` 与 G-1**：方案 §3.1 第 30 行/§7.3 保留既有运行文案（`handback.ts:373-374`），G-1 测试逐字断言（`test/编排/dispatch-reads.test.ts`、`test/测试/g1-verify/g1-dispatch-wiring.test.ts`、`g1-extraction-render.test.ts`）；本文件 AC-5.4 按此核对，不把「引用完整性」当任务状态放宽。
9. **`write-sequencing.test.ts` 既有挂起**：方案 §8.1 允许 T3 全量回归排除并记录；本文件 §5.3 引用 `docs/acceptance/acceptance-rework-routing-criteria-v1.md:98/162/604`；实施报告必须记录排除命令与原因，不得静默跳过。
10. **Windows symlink EPERM 基线**：仓库既有失败与本变更无关；B0/D1 必须分类并列出，不得把既有失败算作通过，也不得算作本变更新增失败。
11. **E2E 可运行性与判定**：方案 AC-6.4 允许「如实记录不可用原因」；团队计划 §7.3 允许验收记 `not applicable`/`insufficient evidence`（视原因）。本文件要求原因是可复核的（命令、错误原文、环境）；只写一句「不可跑」不算。E2E 不可用不影响其它 AC 的 pass，但报告必须如实列出证据限制。
12. **AC-8.1 与闸门确认时点**：方案 P1.1 写于闸门 1 前，其「草案/待确认」状态行是历史事实；闸门 1/2 确认以沟通记录为准。本文件不要求方案回写确认状态，也不把历史状态行当虚假声明；R4 更正只允许编辑性更新 §13 引用与未决项表述。
13. **R4 更正后的哈希映射**：闸门 1 语义基线为 `54da5d31…`；若策划作者执行 R4 编辑性更正，方案哈希会变化，必须在变更包/报告/V1 中记录两哈希关系（语义基线 vs 编辑性更正版），不得把新哈希当作新的客户确认；若未更正，实施记录只引用 `aa702f6b…` 复核快照并把 §13 更正列为遗留文档项。
14. **无 task_ops 与验收凭证**：本项目无 `.ans/project.json`；验收不使用 `acceptanceToken`/`accept-plan`/`verify` 机器状态，也不伪造；证据以文件哈希与原始输出为准（§2.6）。
15. **写标准时的产品/测试零改动**：`git status --porcelain -- src app test` 为空；`test/编排/dispatch-advisories.test.ts` 尚不存在；HEAD 仍是旧派发前置实现。这些是「实施前标准」的基线事实，不构成任何实现判断。

---

**本文件状态：标准 v1 已冻结；未判定任何候选；未声称本变更已实施、已测试或已验收。**
