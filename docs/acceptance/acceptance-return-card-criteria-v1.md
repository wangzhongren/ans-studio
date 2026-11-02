# 验收完成标准：验收结果返回幕僚的卡片特殊显示 + 原文直出（acceptance return card）——实施前标准 v1

- 风险档位：**T2**（客户在闸门 1 确认、闸门 2 确认；跨渲染层、桌面 Interface 与共享 i18n 的展示/载荷变更；不改验收判定、验收卡选项/路由、报告持久化/声明语义、写权/边界；不新增共享 Model/公共导出/报告契约）。升档条件见 §6.5；升档不降档。
- 判定依据：客户闸门 0/1/2 确认记录 `docs/communication/2026-11-02_intent_acceptance-return-card.md`（写标准时 **130 行** / SHA-256 `48fa7342ff935011a55bbde284f3676b2bc96400e0100910e5246fa532b57528`，含闸门 0、闸门 1、闸门 2 确认小节；该文件是沟通管理记录、可能继续追加，验收时引用其确认小节而不引用固定行号，历史快照见 §1.1）；客户在闸门 1 确认的策划方案 **P1.2** `docs/planning/2026-11-02_design_acceptance-return-card.md`（**873 行** / SHA-256 `51057be9bc38575b86711d2c3d98120b7a42f4d75bbb7ece4c75f32796c0f2b2`）的 §1.2（用户可感知行为）、§1.4（范围/非目标）、§2（识别与数据来源）、§3（架构）、§4（实施）、§5 C1–C5（契约）、§6（兼容）、§7（选装，仅 O2 纳入）、§8.1（T2 与升档条件）、§9（AC-1–AC-14）、§10（测试计划）、§11（Q1–Q5）与 §12（F1–F12/N1–N4 处置）；独立复核 `docs/planning/2026-11-02_review_acceptance-return-card.md`（**143 行** / SHA-256 `6f8f8121ba73f95b2f816e4d7a462912b1d7e6698249ecd958e10a79fc54772f`，P1.0 快照 103 行 / `5e423152…`，P1.1 再复核结论「建议提交客户确认」、F1–F12 关闭、N1–N4 已在 P1.2 落地）；闸门 2 确认的团队计划 `docs/scheduling/2026-11-02_team-plan_acceptance-return-card.md`（**429 行** / SHA-256 `05a94dd054ac408e7a33c29f37cb130aa1de2675547af564abc46ef146bfe9b6`）§1.1（目标）、§1.2（T2 口径）、§1.3（非目标）、§4（写集/边界 B-1）、§5（阶段）、§6（实现约束与已确认口径）、§7（验收安排与证据要求）、§8（闸门 2 确认项）。本文件的 AC 不得弱于方案 §9；团队计划只作范围、写集、阶段、证据口径依据，不是标准来源。
- 选定检查：**T2 口径**——受影响层测试（桌面UI 渲染纯逻辑/组件/模板守卫、项目管理 i18n、桌面窗口 SessionManager 载荷）+ 跨层集成证据（真实报告文件 → `protectText` 16 KiB 投影 → presenter payload → 渲染层 decisionView/DOM）+ `npm run typecheck` + `npm run typecheck:renderer` + `npm run build:renderer` + **可跑的 Electron E2E**；**T2 默认不做 T3 全量回归**（证据不足或触发升档才按 T3 补证）。另核 §四 的 F3/F5/Q5-A/O2 已确认口径核对项。
- 录屏与截图：**不要求录屏**。验收证据**最多使用截图**，**不得要求或提供录屏/屏幕录像作为验收要求或选项**；缺少录屏不构成 `fail` 或 `insufficient evidence`（2026-10-27 客户规则，`references/acceptance-role.md`）。如使用截图，必须来自当前候选真实运行、关闭 DEBUG 覆盖层，并记录 sha256、候选版本与拍摄命令/窗口尺寸；AC-10 的窄屏截图按方案 §9 为可选，E2E 以原始输出/`E2E_PASS` 为主。
- 复用证据：仅同一候选、同一输入/依赖/夹具、同一命令、同一配置的证据可复用；候选、输入、依赖、契约、夹具或构建变化时，受影响证据失效，只补失效部分；不得跨候选复用，也不得用其它变更（如 acceptance-evidence-path、dispatch-guardrail-relax、i18n 等）的证据替本变更背书。
- 任务 ID / flowId：`2026-11-02-acceptance-return-card` / `acceptance-return-card`（团队计划文件头）。
- 标准路径 / 版本 / 日期：`docs/acceptance/acceptance-return-card-criteria-v1.md` / **v1** / **2026-11-02**（实施前冻结）。
- 阶段与状态：**实施前完成标准**。本文件只建立标准，不判定候选；写标准时**未实施、未测试、未验收**——HEAD `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9`，产品/测试无本任务改动（`git status --porcelain -- src app test` 为空）；新 SessionManager 测试文件尚不存在；闸门 0/1/2 已确认，**客户实施授权未给**（以沟通记录为准）。
- 验收报告：**另写 `docs/acceptance/acceptance-return-card-report-v1.md`，本文件不是报告**。实施后由同一独立验收主上下文（E2）按本标准与统筹变更包判定，结论只能是通过/返工/证据不足。
- 适用变更：仅本任务（验收结果返回幕僚的卡片特殊显示 + 原文直出）。提交/推送/合并/发布不属本任务，也不因验收通过而授权（团队计划 §1.3/§八）；验收通过只表示当前候选满足本标准。

---

## 一、基线、版本冻结与范围

### 1.1 客户确认链与冻结版本

| 项 | 状态 | 记录与版本 |
| --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-11-02） | 沟通记录「闸门 0 确认记录」：Q1 **两者都要**（verifier 验收报告返回幕僚的报告卡 + 客户侧验收决定卡）；Q2 **徽标 + 全文 + 证据**（「独立验收」徽标/标题与不同配色，`report.summary.text` 原文直接渲染，全部 `evidence` 一并展示；验收卡不再使用 180 字/4 行预览 + 折叠）。闸门 0 写盘快照 **68 行** / `54f44bbbc66926a106140460413130360334385d51882d3101384b7d9b668aa4`（方案文件头引用值，历史快照） |
| 闸门 1：方案确认 | 已确认（2026-11-02，P1.2 为唯一实施基线） | 沟通记录「闸门 1 确认记录」：客户原话「确认闸门 1：方案 P1.2，文案/冷色/preview/O2/Q5-A/F3 限制/Q4 全位置按推荐；仅 O2 纳入，其余选装不实施。」；确认对象含方案 **873 行 / `51057be9…`** 与复核 **143 行 / `6f8f8121…`** |
| 闸门 2：角色指派/写集/边界/档位/顺序/验收安排/证据口径 | 已确认（2026-11-02） | 沟通记录「闸门 2 确认记录」：客户原话「确认闸门 2：团队计划 v1 的参与角色、精确写集、B-1、T2、阶段顺序、验收安排与证据口径；实施授权另行给出。」；团队计划 **429 行 / `05a94dd0…`** |
| 客户实施授权 | **写标准时未给**（以沟通记录为准） | 沟通记录「闸门 2 确认记录」明确「实施授权：未给出（客户明确『另行给出』）。未给前不派发任何 worker；B0/P1 及之后的实施阶段不启动。」本文件不把闸门 1/2 或团队计划当实施授权 |
| 本验收标准 | 实施前写盘并冻结 | 本文件 v1（2026-11-02） |
| B-1 边界条目（治理，非产品候选） | 写标准时已由人事按闸门 2 落地（只读观察到） | `角色卡/桌面窗口/boundary.md` 与 `boundary.yaml` 含 `test/桌面应用/acceptance-return-card.test.ts` 精确单文件条目（Delta-ARC-1），`changelog.md` 有对应记录；用人事（People Operations）自身记录核对，不计入产品候选（§七） |

**引用快照说明**：沟通记录当前 **130 行 / `48fa7342…`**；团队计划文件头引用「当前 93 行 / `449bf0165d09513d3f56c518b722dc99beb97f4008a90e03667b370e58aa65dd`」是闸门 2 记录追加前的快照，方案文件头引用「68 行 / `54f44bbb…`」是闸门 0 写盘快照——均为**历史快照**，不作为当前判定依据；当前判定以 `docs/communication/` 的确认小节、方案 P1.2 冻结哈希与团队计划冻结哈希为准（另见 §九.1）。

### 1.2 版本冻结与变更规则

- 本文件在实施开始前冻结为 **v1**；实施开始后，不得为迁就候选而改写标准、放宽或加严实质。
- 确需变更标准（客户改变范围、方案实质变更、发现标准本身不可执行/自相矛盾）时：递增版本（v2…）、记录理由与受影响条目、交沟通/统筹确认，并重新核对受影响证据；未确认前仍按 v1 判定。
- 候选变化不改变标准；只使该候选上的证据失效，需按本文件重取。
- 本文件不是验收结论，也不是实施/提交/推送/合并/发布授权；实施授权以沟通记录为准，验收结论只写在 `docs/acceptance/acceptance-return-card-report-v1.md`。
- 方案实质变更（改验收判定/选项/路由/持久化/共享契约/写集/档位/AC）按方案 §8.1 与团队计划 §5.4 停止并重开对应闸门，本文件随之重判；不自行放行。
- **不得发明超出已确认方案的新要求**：本文件的证据字段、判定方法与 §四 核对项只用于核对方案 P1.2 与闸门 1/2 已确认口径，不新增产品行为要求、不改变 Q1–Q5、AC、写集、范围或风险档位。发现方案歧义时交沟通/策划澄清，不由验收自行加严或放宽。
- **AC 不得被弱化**：不得删除、合并、拆分、改写为更松的语句，或以「基本完成」「等价实现」替代方案 §9 的可核对标准；证据不足时如实判 `insufficient evidence`，不得判 `pass`。

### 1.3 本轮范围（判定边界，不重复方案正文）

本文件判定覆盖（对应方案 §1/§2/§4/§5/§9/§10 与团队计划 §1.1）：

1. **verifier 验收报告卡（两个出现位置）**：质检自己的回交行（`.msg-handback`）与幕僚收到的交付批（`.delivery-report`）在报告来源为内置质检（`RoleView.builtIn === true && governanceFunction === "verification"`）时，显示「独立验收报告」标题、「独立验收」徽标、`--info` 冷色样式；正文直接渲染完整 `summary.text`，卡内列出全部 `evidence`，不再显示 180 字/4 行预览与「查看全文」折叠；blocked/failed 危险色优先；普通报告卡逐字不变；F3 已接受限制按闸门 1 执行。
2. **客户侧验收决定卡**（`cardKind="acceptance"`，`DecisionDialog`）：显示「独立验收决定」本地化徽标与 `--info` 冷色；显示 `docs/quality/<flowId>-report-v1.md` 的 **16 KiB 安全投影原文**；O2 显示报告路径；`request.preview` 作为「验收卡说明」**始终显示**在报告原文上方（规范化后与报告文本完全重复时可去重）；报告缺失/不可读/无 flowId/**非法 flowId**/旧 payload 走 preview 降级且卡仍可作答；问题、选项、推荐、可作答性、优先级、提交/拒绝/稍后处理、焦点陷阱、二次确认全部不变。
3. **不改变**：验收判定/验收结论、选项 id/推荐/可作答性/优先级/路由、判断代批、`request.resolved`/`customer.decision`、报告持久化/声明语义、写权/边界、客户闸门、派发受理；不改报告快照/声明契约（`RuntimeReportSnapshotV1`/`RuntimeLiveReportViewV1`/`DisplayTextV1` 形状）、`reportId`/`reportPreview` 语义、报告存储/回放格式。
4. **选装**：仅 **O2** 纳入（验收决定卡显示报告路径）；O1/O3–O10 默认不实施（O10 任务级判别若要做另开 T3）；不恢复 2026-11-01 已取消的 `full-report-display` P1.3（全部交付卡默认展开/64 KiB 示例等），不复用其旧闸门确认。

**明确不判定为本轮缺陷或范围的边界**（依据闸门 1/2 已确认版本，不是放宽）：

- **F3 已接受限制**：内置质检的非验收质量核对报告也会按「独立验收报告」身份显示；项目角色不自动标记；v1 不实现任务级判别（O10），卡片文案不得声称「验收通过/已通过」。本任务不因该限制判 fail，也不要求 O10 证据；若实施擅自增加任务级判别/`reportKind` 标记，属方案外改动，按 §6.5 停止/升档。
- **O1/O3–O10 不实施**：O1（所有卡种 `cardKind` 本地化）、O3（证据超过 20 条时展开更多）、O4（旧 `docs/acceptance/` 路径回退）、O5（报告文件 SHA-256）、O6（只幕僚视图）、O7（验收字号调大）、O8（主色绿）、O9（交付批外层头部验收样式）、O10（任务级判别）均不实施，不要求证据，也不因未实现判 fail。
- **不恢复 P1.3**：不恢复 `full-report-display` 的全部交付卡默认展开、64 KiB 预算示例或 run-change 等范围；不复用旧闸门确认。
- **其它位置保持现状**：WorkOverview「最近交付」120 字摘要列表、任务面板 `TaskCenterPanel` 的 `task.lastReport` 短摘要行不是 `ReportBody` 报告卡，不显示验收样式，不因未改判 fail。
- **`acceptanceTriage` 前闸**：复核记录 §「未检查事项」未发现 `opts.acceptanceTriage` 注入点；若真实接线存在，属团队计划 §9.2 开放点 5，需在 P1/实施中确认不覆盖本 payload；本文件不据此新增 AC 或判 fail（见 §九.8）。
- **证据媒体**：不要求录屏；截图至多，不作为 AC-1–AC-14 的通用必需证据（AC-10 的窄屏截图按方案为可选）。

### 1.4 写标准时的只读基线与输入哈希

| 检查 | 命令 | 结果（2026-11-02 写标准时实测） |
| --- | --- | --- |
| 分支 / HEAD | `git rev-parse HEAD` | `feat/flow-improvements-wave1` / `5a35908ce70a0f007e22808bbc3b6f9378f0c7c9` |
| 工作树快照 | `git status --short` | 已跟踪修改：`docs/communication/2026-11-02_intent_acceptance-return-card.md`、`docs/communication/memo.md`、`docs/planning/memo.md`、`docs/scheduling/memo.md`、`角色卡/桌面窗口/boundary.md`、`boundary.yaml`、`changelog.md`（B-1 边界，人事治理）；未跟踪：本任务方案、复核记录、团队计划；**无产品/测试改动**（`git status --porcelain -- src app test` 为空） |
| 暂存区 | `git diff --cached --name-only` | 空（未暂存） |
| 方案 P1.2 | `wc -l` / `sha256sum` | **873 行** / `51057be9bc38575b86711d2c3d98120b7a42f4d75bbb7ece4c75f32796c0f2b2` |
| 复核记录 | 同上 | **143 行** / `6f8f8121ba73f95b2f816e4d7a462912b1d7e6698249ecd958e10a79fc54772f` |
| 团队计划 | 同上 | **429 行** / `05a94dd054ac408e7a33c29f37cb130aa1de2675547af564abc46ef146bfe9b6` |
| 沟通记录（当前，含闸门 0/1/2） | 同上 | **130 行** / `48fa7342ff935011a55bbde284f3676b2bc96400e0100910e5246fa532b57528`；团队计划文件头引用的 93 行 / `449bf016…` 与方案文件头引用的 68 行 / `54f44bbb…` 均为历史快照，不混用 |
| Node / npm | `node --version` / `npm --version` | `v24.22.1` / `11.19.1`（实施/取证仍须记录实测版本） |
| 仓库脚本 | `node -e "require('./package.json').scripts"` | `typecheck`（`tsc --noEmit`）、`typecheck:renderer`（`tsc -p app/renderer/tsconfig.json`）、`build:renderer`（`vite build --config vite.config.ts`）均存在；命令以实施时仓库脚本为准 |
| 受影响测试文件是否存在 | `ls` | `test/桌面UI/{report-view,role-view,decision-dialog,dialog-a11y,source-guard,theme-tokens}.test.ts`、`test/项目管理/shared/i18n.test.ts`、`i18n-guard.test.ts`、`test/桌面应用/{optional-acceptance,acceptance-evidence}.test.ts`、`test/runtime-core/{tool-display,report-provenance}.test.ts`、`test/桌面UI/phase4b-electron-smoke.mjs`、`test/桌面应用/e2e/{uiux-v2,main}.mjs` 均存在 |
| 新增测试文件是否存在 | `ls` | `test/桌面应用/acceptance-return-card.test.ts` **尚不存在**（符合「实施前」状态；B-1 已授权该精确路径） |
| 本标准文件是否存在 | `ls` | 写盘前不存在；本文件为新建 |
| Electron 可执行文件 | `ls node_modules/.bin/electron` | 存在（E2E 可运行性仍以 B0/D1 实测记录为准） |
| 任务配置 | `ls .ans/project.json` | 不存在；未启用 task_ops；证据以文件哈希与原始命令输出为准（§2.6） |
| i18n 基线 | `test/项目管理/shared/i18n.test.ts:101-110` | 当前 `ui: 907 / main: 559 / shared: 62 / preferences: 3，总计 1531`；方案 §4.4 新增 14 个 `ui.*` key，若最终 key 集与方案表一致则应为 `ui: 921 / 总计 1545`（实施时以实际测试为准；B0 复测） |
| B-1 边界（治理，非产品候选） | `grep` / `git diff --stat` | `boundary.md:76`、`boundary.yaml:217-219`、`changelog.md:3` 含 `test/桌面应用/acceptance-return-card.test.ts` 精确条目（Delta-ARC-1）；改动仅 3 文件 +7 行，由人事执行；不计入产品候选 |

以上只读核对用于确认基线与约束；本文件写盘未改方案、复核、团队计划、沟通记录、角色卡、产品源码或测试，也未启动应用。方案 §13 的代码锚点为只读参考（写标准时未重跑实现验证）；本文件不判断实现。

### 1.5 本文件不产生的授权

本文件不授权提交、推送、合并、发布，不授权派发 worker，不授权修改写集、边界或档位，不授权启动应用做「已验收」声明。实施按闸门 2 确认的写集与团队计划阶段执行；实施授权范围以沟通记录为准；B0/P1 及之后的实施阶段在实施授权前不启动（团队计划 §2.2/§5.2）。

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

本任务 AC-1–AC-14 全部适用，均应给出 `pass`/`fail`/`insufficient evidence`；`not applicable` 仅当客户书面确认相关条目不再适用（范围变更）时才可使用，不得用来回避必需证据。

验收报告 `docs/acceptance/acceptance-return-card-report-v1.md` 的核心是逐项验收表，列至少为：

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1–AC-14 | 本文件条目与方案 §9 AC-1–AC-14 | 本文件各条「所需证据」 | 原始输出/DOM 断言/哈希路径 | `git hash-object` + `sha256sum` | 桌面UI/桌面窗口/项目管理/测试/统筹 | 实际观察摘要 | pass/fail/insufficient evidence |

总体结论：**AC-1–AC-14 全部 pass，且 §四 的 F3/F5/Q5-A/O2 核对项均满足或按 §4.5 如实记录（无阻断项），才算通过**；任一项 `fail` → 返工；无 `fail` 但有任一项 `insufficient evidence` → 证据不足，不得判 pass。

### 2.2 原始证据原则（不得以「字段齐全」代替实际行为）

- 文件存在、字段名齐全、测试文件存在、断言存在，**只是必要条件，不是通过依据**。每条必须观察实际行为：渲染 DOM 原文（标题/徽标/类名/正文/证据/折叠有无）、`ctx.acceptanceReport` 与 presenter payload 实际形状/文本/字节、`request.preview` 与报告原文的实际可见顺序、选项/推荐/可作答性实际值、`git diff` 实际内容、原始命令退出码与计数。
- 开发者自述、测试角色转述、工具「成功」、计划文字、摘要，都不算原始证据；验收读取原始命令输出、文件哈希、diff/status、测试计数与失败原文、DOM 断言输出。
- 不得修改断言以保绿；不得跳过失败用例或把 `skip`/`todo` 计为通过；不得把失败归为「环境问题」而不做 B0 对照与分类。
- 不得用纯函数单测替代 SessionManager 级载荷证据，也不得用 channel 级测试（`optional-acceptance.test.ts` 直接测 `createCustomerInputChannel`，绕过 `withRequestLifecycle`/`enrichAcceptanceJudgeContext`）替代 AC-5–AC-7 的 SessionManager 级证据；反过来，不得用 SessionManager 级测试替代真实渲染 DOM/E2E 证据。
- 不得用「代码看起来已实现」代替实际捕获的 payload/DOM；不得把 `request.preview` 当作报告原文，也不得把普通卡旧断言未跑当作通过。

### 2.3 T2 证据口径

- 按 `references/testing.md` 的唯一定义，本变更 **T2**：跨角色/契约/shared（渲染层 + 桌面 Interface + 共享 i18n 的展示/载荷变更）；默认验证为受影响层测试 + 跨角色集成 + 类型/构建检查 + 可运行 E2E；**不默认全量回归**。
- 受影响层：桌面UI（渲染纯逻辑/组件/守卫/主题/可选 E2E 夹具）、桌面窗口（SessionManager 级载荷 + 既有回归）、项目管理（i18n parity/guard/计数）；跨层：真实报告文件 → `protectText(reportText, 16384)` → `ctx.acceptanceReport`/presenter payload → 渲染层 `decisionView`/DOM；报告卡两处位置的真实渲染 DOM。
- 必需检查：`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` 均须通过并记录退出码；可跑 Electron E2E 须执行并记录原始输出/`E2E_PASS`；不可跑如实记录可复核原因（命令、错误原文、环境），不得静默跳过。
- T2 默认不做 T3 全量回归；若证据不足或触发 §6.5 升档条件，按 T3 全量回归并记录排除项（既有 Windows symlink EPERM/`write-sequencing.test.ts` 挂起等），不得以时间紧降档。

### 2.4 「证据不足」判定口径（不弱化）

出现下列任一情形，对应 AC 判 `insufficient evidence`，不得判 `pass`：

1. 缺少该 AC「所需证据」中的任何原始输出/文件（只给摘要、转述、口头自述、工具成功提示）。
2. 证据与候选不匹配：文件哈希/diff 无法复算，或证据来自另一候选、另一 HEAD、另一输入/夹具；变更包候选哈希与工作区不一致。
3. 新增/更新的测试缺失、未运行、被 `skip`/`todo`，或断言被删除/放宽以保绿。
4. AC-1/AC-4/AC-10 只有纯函数测试，没有真实渲染（Electron 冒烟/定向 e2e）DOM 证据；或只有渲染 DOM、没有纯函数判据覆盖（两侧证据都要）。
5. AC-5/AC-6/AC-7 只有 channel 级 `optional-acceptance.test.ts` 证据，没有走 `withRequestLifecycle`/`enrichAcceptanceJudgeContext` 的 SessionManager 级测试；或 `ctx.acceptanceReport`/presenter payload 未被实际捕获。
6. AC-5 缺 `request.preview` 唯一 marker 在默认视图可见的用例（只用报告文本断言）。
7. AC-6 五组夹具（缺失/不可读/无 flowId/非法 flowId/旧 payload）缺任一组；或非法 flowId 未断言 judgeContext/facts/artifacts 缺失与 `unavailableReason` fail-closed 结果。
8. AC-7 缺 >16 KiB 报告的投影截断 flag/UTF-8 字节上限证据；或报告卡快照上限/省略提示未核对。
9. AC-9 缺 source-guard 原始输出，或缺含 HTML/链接/伪装 secret 的安全夹具，或缺非法 flowId/路径穿越负例。
10. AC-10 缺两处位置与危险态 DOM 断言；或只有 CSS 文本阅读、没有实际类名/DOM 捕获（窄屏截图可缺，不据此扣分）。
11. AC-12 缺 `git diff`/grep 语义路径零变化证据，或相关桌面/编排测试未跑/失败未分类。
12. AC-13 缺 `src/model/runtime.ts` 与 public 入口 diff 证据，或新增共享契约被「应用私有」自述掩盖。
13. AC-14 缺变更包原文/候选哈希/节点对应/证据链接/档位/未 commit/push 声明，或哈希不可复算。
14. `npm run typecheck`、`typecheck:renderer` 或 `build:renderer` 未执行或退出码非 0；受影响套件有未修复的确定性失败；D1 补充套件失败未按 B0 分类。
15. E2E 未执行且无可复核的不可用原因；或声称 `E2E_PASS=true` 但无原始输出/候选哈希。**注意：缺录屏或未提供录屏不构成 insufficient**；截图按 §1.3 可选。
16. 写集外改动（产品/测试/共享层/构建/发布/角色卡超出 B-1）或并发混入未隔离。
17. 变更包/证据缺方案版本、标准版本、候选哈希或节点对应关系。
18. 用其它变更的通过结论或证据为本变更背书；实施/测试自评即验收结论，或实施角色自写验收报告。
19. `not applicable` 未写明依据。

**不得放宽的具体禁令**：不以时间紧降档；不以纯函数单测替代真实渲染/CSS；不以 channel 级测试替代 SessionManager 级载荷；不以「工具成功」「全部通过」摘要替代原始输出；不把 `skip`/`todo` 计为 pass；不因缺少录屏或未提供截图扣分（反过来也不得把录屏/截图当作必需证据要求提供）。

### 2.5 证据复用与失效

- 同候选、同输入/依赖/夹具、同命令、同配置的证据可以复用；候选、输入、依赖、契约、夹具、构建配置变化时，受影响证据失效，只补失效部分。
- 复用必须在统筹变更包中列出「复用理由 + 未失效依据」；验收核对候选哈希一致后才接受。
- 不得跨候选复用，也不得用其它变更的证据替本变更背书；管理记录（`docs/planning/`、`docs/scheduling/`、`docs/communication/`、`docs/acceptance/`）不纳入候选，其哈希变化不影响产品候选有效性，但变更包须把「产品候选」与「治理记录」分开列明。

### 2.6 无 task_ops

本项目没有 `.ans/project.json` 任务配置（§1.4），未启用 task_ops。取证以文件哈希、原始命令输出、diff/status、DOM 断言、Electron E2E 输出为准；**不得伪造任务令牌、锁、审批、机器预检或 `docs/verification/` 记录**。

### 2.7 候选隔离与管理记录

- 本变更产品候选只列相对 B0 基线变化的闸门 2 写集路径（团队计划 §4.1/§4.3）：桌面UI `app/renderer/src/chat/role-view.ts`、`decision-dialog.ts`、`app/renderer/src/shell/ReportCard.tsx`、`app/renderer/src/chat/DecisionDialog.tsx`、`app/renderer/src/shell/{shell,phase4a,phase4b}.css`、对应 `test/桌面UI/*`（含条件 E2E 夹具 `phase4b-electron-smoke.mjs`/`uiux-v2.mjs`）；桌面窗口 `app/desktop/session.ts`、`app/desktop/customer-input.ts`、新增 `test/桌面应用/acceptance-return-card.test.ts`；项目管理 i18n `src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n.test.ts`；测试 `角色卡/测试/docs/change/` 证据（`test/测试/` 默认不新增）。
- B-1 边界条目（`角色卡/桌面窗口/boundary.md`/`boundary.yaml` + `changelog.md`）是闸门 2 确认的人事治理变更，记录但不计入产品候选；除 B-1 外无边界变更。
- 管理记录（`docs/planning/`、`docs/scheduling/`、`docs/communication/`、`docs/acceptance/`）与角色 `docs/change/` 证据目录不混入产品候选；`app/renderer/dist/` 为忽略产物、非候选。
- 并发写同一产品文件且未隔离的，按候选不可复算处理；不得把他人改动算入本候选，也不得用混入候选的证据判 pass。

---

## 三、验收项（AC-1–AC-14）

### 3.0 总表与方案映射

| AC | 方案 §9 对应 | 主题 | 最低证据 | 产出角色 |
| --- | --- | --- | --- | --- |
| AC-1 | AC-1 | 验收报告身份（两处位置、普通卡对照、F3 边界） | 渲染纯函数测试 + Electron 冒烟 DOM（两处）+ 普通卡/项目角色/非验收报告边界用例 | 桌面UI |
| AC-2 | AC-2 | 原文直出（完整 `summary.text`、无 180 字预览/折叠） | >180 字唯一 marker 报告 DOM + 普通卡折叠对照 | 桌面UI |
| AC-3 | AC-3 | 全部证据（逐条文本/flags、空列表、省略提示） | 3 条证据（含 redacted/truncated）+ `evidenceOmitted=2` 夹具 DOM | 桌面UI |
| AC-4 | AC-4 | 普通报告不回归 | `report-view.test.ts` + `uiux-v2.mjs` + `phase4b-electron-smoke.mjs` 原始输出 | 桌面UI |
| AC-5 | AC-5 | 验收决定卡身份与原文（徽标/16 KiB 原文/路径/预览/选项不变） | SessionManager 级 `ctx.acceptanceReport`/presenter payload + 对话框 DOM + 选项回归 + preview marker | 桌面窗口、桌面UI |
| AC-6 | AC-6 | 决定卡降级（缺失/不可读/无/非法 flowId/旧 payload） | SessionManager 级五组夹具 + judgeContext fail-closed 断言 + 对话框 DOM | 桌面窗口 |
| AC-7 | AC-7 | 有界投影（16 KiB/既有快照上限/截断 flag/文件不改写） | >16 KiB 夹具 SessionManager 测试 + DOM 文本长度/flag + 报告快照边界测试 | 桌面窗口 |
| AC-8 | AC-8 | i18n（14 key 中英成对/占位符/无硬编码/计数） | `i18n.test.ts`、`i18n-guard.test.ts` 原始输出 + key 清单 | 项目管理 |
| AC-9 | AC-9 | 安全渲染（Markdown 管线/preview 纯文本/净化/非法 flowId 不越界读） | source-guard + HTML/链接/伪 secret 夹具 + 非法 flowId/路径穿越负例 | 桌面UI、桌面窗口 |
| AC-10 | AC-10 | 可访问性/窄屏（文字徽标、ARIA/焦点、两处危险色、决定卡危险色优先、无溢出） | `dialog-a11y.test.ts` + `theme-tokens.test.ts` + 两处位置/危险态 DOM（窄屏截图可选） | 桌面UI |
| AC-11 | AC-11 | 回放/旧记录（回放分类、无法解析普通显示、旧 payload 降级） | 历史回放夹具 + 旧 payload 夹具 DOM | 桌面UI、桌面窗口 |
| AC-12 | AC-12 | 语义零变化（判定/选项/代批/路由/持久化/写权） | `git diff`/grep + 相关桌面/编排测试 + `optional-acceptance.test.ts` | 桌面窗口、测试 |
| AC-13 | AC-13 | 权限/契约（无新工具/能力位/IPC/cardKind/公共导出/共享字段） | diff/grep + payload 形状测试 + `src/model/runtime.ts`/public 入口 diff | 桌面窗口、测试 |
| AC-14 | AC-14 | 证据包（候选哈希/路径/节点/证据/档位/未提交声明） | 变更包原文 + 复算哈希 + 测试/E2E 输出 | 统筹、测试 |

**映射自检**：AC-1–AC-14 与方案 §9 的 AC-1–AC-14 **一一对应**；每条内的细项是同一 AC 的核对细项，未拆分、未合并、未删除、未弱化。本文件新增的只是证据记录字段、判定方法、证据口径与 §四 已确认核对项（F3/F5/Q5-A/O2），不新增产品行为要求，不得被用来扩大范围或加严方案。

### 3.1 AC-1 验收报告身份（方案 §9 AC-1）

**标准（可核对语句）**

- **两处位置齐全**：内置质检报告在**质检回交行**与**幕僚交付批**两个位置都显示（a）标题「独立验收报告」；（b）徽标「独立验收」；（c）`is-acceptance` 冷色样式（`--info` 头部/边框/左边条，按方案 §4.5 的对应选择器）。
- **普通报告不显示**：非内置质检来源的报告卡逐字保持现状（180 字/4 行预览 + 「查看全文」折叠），无 `is-acceptance`、无验收徽标/标题。
- **项目角色不标记**：项目角色 id 恰好为 `verifier` 但 `builtIn !== true`（或缺少 `governanceFunction`）时按普通报告卡显示，不触发验收样式。
- **F3 已接受限制**：内置质检提交的**非验收质量核对报告**也按「独立验收报告」身份显示（显式已接受限制）；但文案不得声称「验收通过/已通过」等结论，必须保留条件措辞「如本次为验收任务，是否验收通过以验收决定卡为准」及「报告本身不构成通过」语义。
- **未解析/缺字段**：角色列表不可解析或字段缺失 → 普通报告卡显示，不猜、不阻塞渲染。
- **blocked/failed/aborted**：仍保留验收身份（标题/徽标），状态与危险色如实保留。

**判定方法**

1. 运行 `role-view` 纯逻辑测试：`isVerificationRole` 对 `{builtIn:true, governanceFunction:"verification"}` 为 true；对 `{builtIn:false, governanceFunction:"verification"}`、`{builtIn:true, governanceFunction:"other"}`、`null`/缺字段为 false；项目角色 `verifier`（`builtIn:false`）不触发。
2. 运行 Electron 冒烟/定向 e2e（`phase4b-electron-smoke.mjs` 或 `uiux-v2.mjs`，按实际 harness）：分别捕获回交行与交付批的 DOM——两处均含「独立验收报告」标题、「独立验收」徽标、`is-acceptance` 类；普通报告（如角色 `A`）无这些特征。
3. 用内置质检的**非验收内容**报告夹具渲染：确认仍显示验收身份；读取免责声明/事实行原文，确认含条件措辞且无断言式通过结论。
4. 读取 DOM/类名：`ReportCard` 外层 `.msg-handback.is-acceptance`、`DeliveryCard` 报告段 `.delivery-report.is-acceptance`、`report-top`/`report-body` 的 `is-acceptance`（按方案 §4.1 第 3/5 条）。

**所需证据**

- `role-view` 纯逻辑测试原始输出（命令、退出码、计数、断言）。
- Electron 冒烟/定向 e2e 原始输出与两处位置的 DOM 断言/截图（截图可选；DOM 断言必需）。
- 普通报告对照与项目角色 `verifier`（`builtIn=false`）对照的 DOM/断言。
- 非验收质量核对报告的边界用例输出与文案原文。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 任一处位置缺少三项特征之一（标题/徽标/冷色类），或只有一处有验收样式。
- 普通报告出现 `is-acceptance`/验收徽标/标题，或普通报告预览/折叠被改变。
- 项目角色 `verifier`（`builtIn=false`）触发验收样式，或按角色 id 字符串猜测。
- 非验收质量核对报告文案声称「验收通过/已通过」，或缺少「报告本身不构成通过」语义。
- 角色列表不可解析时抛错、阻塞渲染或猜测为验收。

**来源**：方案 §9 AC-1、§1.2.1、§2.1（F3 限制）、§4.1 第 1/3/5 条、§4.4、§5 C1；闸门 1 确认记录；团队计划 §6.1。

### 3.2 AC-2 原文直出（方案 §9 AC-2）

**标准（可核对语句）**

- 验收报告卡正文直接渲染**完整 `summary.text`**（在既有快照投影上限内；不绕过 Q5-A 的上限），不再使用 180 字/4 行预览。
- 验收报告卡**不再渲染**「查看全文」折叠（`.report-complete`）；正文/证据不依赖展开交互即可读。
- 普通报告卡仍有 180 字预览与「查看全文」折叠（AC-4 判不回归）。

**判定方法**

1. 构造 `summary.text` **>180 字且末尾带唯一 marker** 的内置质检报告夹具（marker 不应出现在预览前 180 字内），渲染验收卡。
2. 捕获 DOM：断言 marker 在默认视图可见（正文文本包含 marker）；断言验收卡内无 `.report-complete`/「查看全文」；正文长度与快照 `summary.text` 一致（允许 Markdown 渲染的等价空白差异，不得截断）。
3. 同一夹具的普通报告（角色 `A`）：断言 180 字预览与 `.report-complete` 仍存在（AC-4 的对照）。
4. 检查实现 diff：验收分支使用 `full`/`report.summary.text`，普通分支保持 `reportPreview`。

**所需证据**

- >180 字唯一 marker 夹具的定义与报告快照字段。
- 验收卡 DOM 断言（marker 可见、无折叠、正文长度）原始输出。
- 普通报告对照 DOM。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 验收卡仍显示 180 字预览，marker 需展开才可见或不可见。
- 验收卡仍有「查看全文」折叠/`.report-complete`。
- 正文被二次截断（超出既有快照投影的额外截断）或丢失末尾 marker。
- 普通报告被一并改为全文直出。

**来源**：方案 §9 AC-2、§1.2.1、§4.1 第 3 条、§5 C4；闸门 0 Q2；团队计划 §6.1。

### 3.3 AC-3 全部证据（方案 §9 AC-3）

**标准（可核对语句）**

- 验收报告卡在正文内列出报告快照的**全部 `evidence`**（在既有快照上限内：单条 2 KiB、最多 32 条、快照 96 KiB），逐条显示文本与 `textFlags`（`redacted`/`truncated` 等）。
- 证据为空时显示「（未提供证据）」，不隐藏证据区块。
- `evidenceOmitted > 0` 时显示既有省略提示（「另有 N 条证据因预算省略」），不伪造未收到的证据。
- 证据列表在卡内滚动，不因长列表撑破卡片（方案 §4.5 `max-height`）。

**判定方法**

1. 构造夹具：3 条 evidence（1 条 `redacted:true`、1 条 `truncated:true`）+ `evidenceOmitted=2`；渲染验收卡。
2. 捕获 DOM：证据条数与快照 `evidence.length` 一致（3 条）；每条文本可见、flags 可见；省略提示可见且 N=2；不出现第 4 条伪造证据。
3. 空证据夹具：显示「（未提供证据）」，区块存在。
4. 检查实现 diff：验收分支渲染全部 `evidence`，不使用折叠；普通分支不变。

**所需证据**

- 3 条证据 + `evidenceOmitted=2` 夹具定义与 DOM 断言原始输出。
- 空证据夹具 DOM 断言。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 证据条目少于快照（遗漏）或多于快照（伪造）。
- flags 不显示或错误；`evidenceOmitted` 提示缺失。
- 空证据隐藏区块或显示错误文案。
- 证据仍在折叠内、需展开才可见。

**来源**：方案 §9 AC-3、§1.2.1、§4.1 第 3 条、§1.5 有界安全投影；闸门 0 Q2；团队计划 §6.1。

### 3.4 AC-4 普通报告不回归（方案 §9 AC-4）

**标准（可核对语句）**

- 普通报告卡继续使用 **180 字/4 行预览 + 「查看全文」折叠**，DOM 顺序、类名、文案与折叠行为与现状一致。
- 既有断言全部通过：`test/桌面UI/report-view.test.ts`、`test/桌面应用/e2e/uiux-v2.mjs` 的报告卡检查、`test/桌面UI/phase4b-electron-smoke.mjs` 的报告卡检查。
- `reportPreview` 纯函数语义不变（不因本任务改写）。

**判定方法**

1. 运行 `report-view.test.ts`：`reportPreview` 的既有断言全部通过，无新增/放宽。
2. 运行 `uiux-v2.mjs` 与 `phase4b-electron-smoke.mjs` 的既有报告卡检查：普通报告（角色 `A`）仍显示 180 字预览与「查看全文」折叠。
3. 检查 `git diff -U0`：普通分支的 DOM/文案/类名无功能变化；验收分支以独立条件插入。
4. 检查 `reportPreview` 实现未变（或仅注释/无关格式变化）。

**所需证据**

- 上述测试/冒烟原始输出（命令、退出码、计数、失败原文）。
- 普通报告 DOM 断言/截图（截图可选）。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 普通报告改为全文直出或丢失「查看全文」折叠。
- 普通报告卡出现验收样式/徽标。
- `report-view.test.ts` 断言被删除/放宽/新 skip 以保绿。
- 既有 `uiux-v2.mjs`/`phase4b-electron-smoke.mjs` 报告卡断言未跑或失败未分类。

**来源**：方案 §9 AC-4、§1.2.1「普通报告」行、§5 C4、§6.1；团队计划 §6.9。

### 3.5 AC-5 验收决定卡身份与原文（方案 §9 AC-5）

**标准（可核对语句）**

- `cardKind="acceptance"` 的对话框显示**本地化徽标「独立验收决定」**与 `--info` 冷色样式（`is-acceptance`），不再显示英文机器值 `acceptance`。
- 决定卡显示 `docs/quality/<flowId>-report-v1.md` 的 **16 KiB 安全投影原文**（`protectText(reportText, 16384)` 的 `DisplayTextV1`），Markdown 安全渲染。
- **O2 路径**：报告存在时显示固定约定路径 `docs/quality/<flowId>-report-v1.md`（本地化文案「报告路径：{path}」）。
- **`request.preview` 作为「验收卡说明」始终可见**（位于报告原文上方，纯文本 `<pre>`）；仅当规范化后与报告文本完全相同时去重；报告缺失时也按现状完整显示。
- **问题/选项不变**：问题文本、选项 id、推荐项、可作答性、优先级、提交/拒绝/稍后处理、焦点陷阱、二次确认与基线一致。

**判定方法**

1. 运行 **SessionManager 级测试**（B-1 新文件 `test/桌面应用/acceptance-return-card.test.ts`；`acceptance-evidence.test.ts`/`optional-acceptance.test.ts` 只读回归，不能单独作为本条证据）：走 `withRequestLifecycle`/`enrichAcceptanceJudgeContext`，在临时项目写入 `docs/quality/<flowId>-report-v1.md`，捕获 `ctx.acceptanceReport` 与 presenter payload——断言 `version:1`、`path`、`text.text/redacted/truncated` 与文件内容一致。
2. Electron 对话框渲染：断言徽标「独立验收决定」、`is-acceptance` 类、报告原文区域可见、路径可见（O2）、`request.preview` 唯一 marker 在**默认视图**可见（不折叠）。
3. 选项回归：捕获选项 id/推荐/`answerable`/优先级，与基线（HEAD 行为或既有 `optional-acceptance`/决定卡纯逻辑断言）逐项一致；实际作答一个选项，确认提交路径不变。
4. 规范化去重用例：preview 与报告文本完全重复时只显示一次；不同时两者都可见且顺序为 preview 在上。

**所需证据**

- SessionManager 级测试原始输出（命令、退出码、计数、`ctx.acceptanceReport`/payload 断言）。
- Electron 对话框 DOM/断言与选项回归输出；preview marker 用例。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 徽标仍为机器值 `acceptance`、无 `is-acceptance` 冷色样式。
- 报告原文缺失/为空/非 16 KiB 投影，或显示的是 preview 而非报告文件。
- O2 路径缺失（报告存在时）或显示模型自报的任意路径。
- preview 被默认折叠/隐藏，或 preview marker 在默认视图不可见。
- 选项 id/推荐/可作答性/优先级/提交行为改变。
- 只有 channel 级测试，无 SessionManager 级 `ctx.acceptanceReport`/payload 捕获（按 §2.4 判 insufficient）。

**来源**：方案 §9 AC-5、§1.2.2、§2.3、§3.4、§4.2、§4.3、§5 C2、§11.3 第 3/4 项；闸门 1 确认记录（O2、preview 始终可见）；复核 F4/F10/F12；团队计划 §6.4。

### 3.6 AC-6 决定卡降级（方案 §9 AC-6）

**标准（可核对语句）**

- 以下五组输入均**显示明确说明**、`request.preview` 完整可见、卡仍可作答，不抛错、不自动通过：
  1. 报告文件**缺失**；
  2. 报告文件**不可读**（路径为目录/权限/读取失败）；
  3. **无 flowId**；
  4. **非法 flowId**（不满足 `new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)`；含路径穿越/非 slug 字符）；
  5. **旧 payload**（无 `acceptanceReport` 字段）。
- 报告缺失/不可读时显示 `acceptanceReportFallback`（有 preview）或 `acceptanceReportMissing`（无 preview）语义的说明；preview 按现状完整显示（`<pre>`）。
- **不读项目外文件**：非法/缺失 flowId 时 `enrichAcceptanceJudgeContext` 不构造/不读取 `docs/quality/` 路径之外的文件；测试需断言无越界读取。
- **N4 fail-closed**：非法/缺失 flowId 时 judgeContext/facts/artifacts 按缺失处理（`qualityReportPath`/`acceptanceReportPath` 不设置），`unavailableReason` 可能变化；这是新增 fail-closed 保护，合法 slug 卡零行为变化。
- `answerable`/选项/路由与基线一致；卡仍可作答（如仍 pending）。

**判定方法**

1. 运行 SessionManager 级测试的五组夹具（临时项目；不可读夹具制造方式按实际平台记录）：逐组捕获 `ctx.acceptanceReport` 为 `undefined`/缺失，preview 仍在 presenter payload，卡可作答。
2. 非法 flowId 额外断言：judgeContext/facts/artifacts 缺失、`unavailableReason` 的 fail-closed 结果；断言未构造/未读取 `docs/quality/` 之外路径（例如用不存在的穿越路径或注入读失败，确认无越界读取）。
3. 无 flowId/旧 payload：断言不读取报告、不抛错，决定卡走 preview 降级。
4. 检查 diff：`enrichAcceptanceJudgeContext` 在构造 `reportRel` 前用本地 `new RegExp(GOVERNANCE_SLUG_PATTERN).test(flowId)`；非法/缺失时不构造、不读取；合法 slug 卡 facts/artifacts/unavailableReason 不变。

**所需证据**

- 五组 SessionManager 级夹具原始输出（命令、退出码、计数、断言）。
- 非法 flowId 的 judgeContext/facts/artifacts 缺失与 `unavailableReason` 断言；无越界读取证据。
- Electron 对话框降级 DOM（说明 + preview + 可作答）。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 任一组抛错、阻断作答、自动通过或改变选项/路由。
- 缺失/不可读时不显示说明或 preview 不可见。
- 非法/缺失 flowId 仍构造/读取 `docs/quality/` 路径（含路径穿越），或读取项目外文件。
- 合法 slug 卡的 facts/artifacts/unavailableReason 被改变（超出 N4 限定的异常输入范围）。
- 仅测试 channel 层降级，未测 `enrichAcceptanceJudgeContext` 路径（按 §2.4 判 insufficient）。

**来源**：方案 §9 AC-6、§1.2.2、§2.3（N1/N4）、§4.3、§4.6 路径行、§5 C3；闸门 1 确认记录（Q5-A/非法 flowId 知悉）；复核 F4/F9；团队计划 §6.5。

### 3.7 AC-7 有界投影（方案 §9 AC-7）

**标准（可核对语句）**

- 决定卡报告文本为 **≤16 KiB（UTF-8 前缀）** 的安全投影；超过 16 KiB 时 `truncated === true` 且 UI 显示「报告原文超出显示预算，已截断。」；净化时 `redacted === true` 且显示既有「已净化」。
- 报告卡沿用**既有快照上限**：摘要 16 KiB、单条证据 2 KiB、最多 32 条、快照 96 KiB；`evidenceOmitted` 提示正确。
- 无无限增长 DOM：报告正文/证据区卡内滚动（方案 §4.5 `max-height`），不撑破卡片。
- 投影不修改原始报告文件（文件 sha256 前后一致）。

**判定方法**

1. 构造 >16 KiB（UTF-8）报告文件，运行 SessionManager 级测试：捕获 payload `text.text`，计算 UTF-8 字节数，断言 ≤ 16384；`truncated === true`；原始文件 sha256 前后一致。
2. Electron 渲染：断言截断提示文案可见；正文区域有滚动容器/限高（DOM 类/样式检查）。
3. 报告卡快照边界：用 `report-provenance`/`tool-display` 既有测试或边界夹具，断言摘要/证据/快照上限与 `evidenceOmitted` 提示未被改变；DOM 证据条数与快照一致。
4. 净化夹具：含凭据样式文本 → `redacted === true`，UI 显示「已净化」；不泄漏明文。

**所需证据**

- >16 KiB SessionManager 测试原始输出与 UTF-8 字节计算/断言。
- 截断提示/滚动容器 DOM 断言；原始文件前后 sha256。
- 报告快照边界测试输出；净化 flag/文案断言。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- payload 文本 UTF-8 字节数 >16384，或超限无 `truncated`/提示。
- 报告卡突破既有快照上限、伪造证据或省略提示错误。
- 原始报告文件被改写/截断。
- DOM 无界增长（无滚动/限高）导致卡片布局失控。

**来源**：方案 §9 AC-7、§1.5、§1.2.2、§4.5、§4.6、§5 C2/C3、§11.2 Q5-A；闸门 1 确认记录（Q5-A）；团队计划 §6.6。

### 3.8 AC-8 i18n（方案 §9 AC-8）

**标准（可核对语句）**

- 方案 §4.4 表的 **14 个 `ui.*` key** 在中英两语言中成对存在、占位符一致：`acceptanceTitle`/`acceptanceBadge`/`acceptanceReportLabel`/`evidenceCount`/`acceptanceDecision`/`acceptanceDecisionPending`/`acceptanceDisclaimer`/`acceptanceKind`/`acceptanceReportTitle`/`acceptanceReportFallback`/`acceptanceReportMissing`/`acceptanceReportTruncated`/`acceptancePreviewLabel`/`reportPath`。
- `ReportCard.tsx`/`DecisionDialog.tsx` 无硬编码中文（不在 `i18n-guard-allowlist.ts`，守卫会拦截）。
- `test/项目管理/shared/i18n.test.ts` 的精确 key 计数更新并与实际 key 集一致；若最终 key 集与方案 §4.4 一致，应为 `ui: 921 / 总计 1545`；若不一致，P1 实现提案/变更包须逐项说明理由且不得缺失 AC-1/AC-5/AC-10 所需文案。
- `i18n-guard.test.ts` 通过；中英 parity/占位符断言通过。

**判定方法**

1. 运行 `i18n.test.ts` 与 `i18n-guard.test.ts`，记录原始输出/计数。
2. 导出/读取 `zh-CN.ts`/`en-US.ts` 新增 key 清单，逐 key 核对存在性、中文/英文值、占位符（`{count}`/`{path}`）一致。
3. 检查 `ReportCard.tsx`/`DecisionDialog.tsx` 无中文字面量/无绕过 i18n 的文案。
4. 核对计数测试的期望值与实际 key 集合一致，无删除既有 key 或放宽计数。

**所需证据**

- 两个 i18n 测试的原始输出（命令、退出码、计数、失败原文）。
- 14 个 key 的清单与中英值/占位符对照。
- 两个组件文件的中文泄漏检查（grep/守卫输出）。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 任一中英 key 缺失、值不对应、占位符不一致。
- 组件出现硬编码中文或绕过 i18n。
- 计数测试未更新/失败，或通过删除既有 key/放宽断言保绿。
- 方案 §4.4 要求的文案缺失且无 P1 说明。

**来源**：方案 §9 AC-8、§4.4、§4.2；闸门 1 确认记录（文案）；团队计划 §4.3 A1/§6.7。

### 3.9 AC-9 安全渲染（方案 §9 AC-9）

**标准（可核对语句）**

- 报告原文只经 `app/renderer/src/chat/markdown.ts::renderMarkdown` 安全渲染（`html:false`、图片转义、链接白名单）；不新增绕过管线的 `innerHTML`/`dangerouslySetInnerHTML`（局部 `markdownHtml` helper 或 `renderMarkdown` 直用均可，须满足 source-guard）。
- `request.preview` 降级仍为 `<pre>` 纯文本，不按 Markdown 渲染。
- 净化 flags 如实：含凭据/敏感样式的文本被 `protectText` 替换且 `redacted=true`；不泄漏明文。
- 非法 flowId/异常路径不读项目外文件；不接受模型/渲染层提供的任意路径。
- 无新增网络访问/文件访问/新 IPC 方法。

**判定方法**

1. 运行 `source-guard.test.ts`：Markdown 单一管线守卫通过；新增注入行符合既有允许模式。
2. 构造报告文本含 `<script>`、HTML 链接、`javascript:` 链接、伪装 secret（用测试注入的 env 值）：渲染后断言 HTML 被转义/不执行、链接受控、secret 被替换且 `redacted=true`。
3. 运行非法 flowId/路径穿越负例（AC-6 同一夹具）：断言未读取 `docs/quality/` 之外路径、未抛出未处理异常。
4. 检查 diff：无新增 `innerHTML`（除既有允许的局部 `markdownHtml` 管线）、无新增 `fetch`/`fs`/IPC；`markdown.ts` 未改或以安全方式扩展。

**所需证据**

- `source-guard.test.ts` 原始输出。
- HTML/链接/伪 secret 夹具的渲染输出与断言。
- 非法 flowId/路径穿越负例输出（与 AC-6 共享）。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 报告原文绕过 `renderMarkdown` 直接注入 HTML/执行脚本。
- preview 被按 Markdown 渲染或 HTML 注入。
- secret 明文泄漏或 `redacted` flag 不实。
- 非法 flowId/异常路径读取项目外文件或接受任意路径。
- 新增网络/文件访问/IPC 或第二 Markdown 管线。

**来源**：方案 §9 AC-9、§2.3、§4.2 第 3 条、§4.6；复核 F9/F11；团队计划 §6.8。

### 3.10 AC-10 可访问性/窄屏（方案 §9 AC-10）

**标准（可核对语句）**

- 徽标有**文字**（「独立验收」/「独立验收决定」），颜色不是唯一信息。
- 对话框既有 ARIA/焦点陷阱/二次确认断言不变（`dialog-a11y.test.ts`）。
- **两处报告卡位置**（回交行 `.msg-handback` 与交付批 `.delivery-report`）的冷色/危险色表达与方案 §4.5 一致；blocked/failed 状态下危险色优先于验收冷色（两处）。
- 决定卡高风险/破坏性状态危险色优先：`.decision-dialog.is-acceptance.is-high-risk` 用 `--danger-border`，`.decision-dialog.is-acceptance.is-destructive` 用 `--warning-border`，写在 `.is-acceptance` 之后，不被冷色覆盖。
- 200%/窄屏无横向溢出；新增样式只引用既有令牌，`theme-tokens.test.ts` 通过。
- 窄屏截图按方案 §9 为**可选**证据；缺少截图不构成 fail/insufficient。

**判定方法**

1. 运行 `dialog-a11y.test.ts`：既有 ARIA/焦点/二次确认断言通过，无删除/放宽。
2. 运行 `theme-tokens.test.ts`：新增类使用的 `var(--*)` 均有定义，无裸色值。
3. Electron DOM/类名断言：两处位置的 `is-acceptance`/`is-blocked` 类与危险色类存在；blocked/failed 夹具下危险色类优先；决定卡 high-risk/destructive 夹具下危险色类存在。
4. 窄屏/200%（若可运行）：检查无横向溢出；不可运行则记录 DOM/CSS 检查结果与原因（截图可选）。

**所需证据**

- `dialog-a11y.test.ts`/`theme-tokens.test.ts` 原始输出。
- 两处位置与危险态、决定卡 high-risk/destructive 的 DOM/类名断言。
- 窄屏/200% 检查记录（截图可选）。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 徽标仅颜色/无文字；a11y 断言回归。
- 交付批或回交行缺危险色优先，或决定卡 high-risk/destructive 被冷色覆盖。
- 新增裸色值/未定义令牌；窄屏出现横向溢出。
- 把窄屏截图缺失当作 fail/insufficient（违反证据媒体规则）。

**来源**：方案 §9 AC-10、§4.1 第 5 条、§4.5、§4.6；复核 F5；团队计划 §6.3/§6.7。

### 3.11 AC-11 回放/旧记录（方案 §9 AC-11）

**标准（可核对语句）**

- 已持久化的 verifier 报告回放：只要角色列表能解析出内置质检，仍显示验收样式（与实时渲染同一判据）；无法解析时普通显示，不猜、不迁移数据。
- 旧 acceptance 卡 payload（无 `acceptanceReport` 字段）降级为 preview + 说明；不报错、不自动通过。
- 不修改报告快照/回放格式、不补写字段、不重放客户卡跨重启（既有语义）。

**判定方法**

1. 用历史/持久化报告快照夹具回放渲染：角色列表含内置质检 → 验收样式；角色列表缺失/不可解析 → 普通卡；无异常。
2. 旧 payload 夹具（无 `acceptanceReport`）：决定卡显示 preview + 说明，卡可作答（如仍 pending）。
3. 检查 diff：报告快照/回放格式/`chat-store` 历史合并未变；未新增迁移。

**所需证据**

- 回放夹具 DOM 断言（可解析/不可解析两种）。
- 旧 payload 决定卡 DOM/可作答断言。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 回放时验收分类错误（可解析却普通、不可解析却验收/抛错）。
- 旧 payload 报错、无法作答或自动通过。
- 修改报告快照/回放格式或引入数据迁移。

**来源**：方案 §9 AC-11、§6.1–§6.4；团队计划 §6.9。

### 3.12 AC-12 语义零变化（方案 §9 AC-12）

**标准（可核对语句）**

- 验收判定、选项/推荐/可作答性/优先级、判断代批、`request.resolved`/`customer.decision`、报告持久化/声明、写权/边界均无 diff。
- `git diff`/grep 证明 `governance-judge-*`、`decisionPriority`、`isDestructiveDecision`、`recordFinalReport`、`request.resolved`/`customer.decision` 写入路径未改；`src/model/runtime.ts`、`src/common/门禁引擎/governance-roles.ts`、`src/pipeline/orchestration/run-role.ts`、`src/common/编排/handback.ts` 等只读文件零 diff。
- 相关桌面/编排测试通过；`test/桌面应用/optional-acceptance.test.ts` 作为 channel 级回归通过。
- 「零改动或仅测试/文案允许项」中的**允许项**限于本任务确认写集：i18n 文案、测试、渲染展示代码（`app/renderer` 的展示分支/CSS）与 `app/desktop` 的展示载荷；**不包括**判定/路由/持久化/写权代码。验收不得把「整体 diff 非空」误读为违反本条，也不得把语义路径的真实改动当作允许项。

**判定方法**

1. `git diff --name-only`/`git status --short`：逐路径核对语义路径零 diff（§七 清单）；允许项仅限写集。
2. `git diff -U0` 检查 `governance-judge-*`、`decisionPriority`、`isDestructiveDecision`、`recordFinalReport`、`request.resolved`/`customer.decision` 相关区域无改动。
3. 运行相关桌面/编排测试（至少 `optional-acceptance.test.ts`、`acceptance-evidence.test.ts` 回归；按 D1 命令），记录计数与失败分类。
4. 核对写权/边界：`resolveWrite`/`TaskScope`/边界解析相关文件（以实施时实际路径为准）零 diff（B-1 治理条目除外）。

**所需证据**

- `git diff --name-only`、`git diff -U0` 原始输出与语义路径零 diff 对照。
- 相关测试原始输出（命令、退出码、计数、失败原文）。
- 写权/边界零 diff 证据。
- 候选哈希。

**失败示例/反例（任一即 fail）**

- 验收判定/选项/推荐/可作答性/优先级/代批/`request.resolved`/报告持久化/声明/写权/边界任一被改变。
- 语义路径测试失败未修复，或用弱化断言掩盖。
- 把写集内的展示代码改动误列为「语义变化」而误判，或反过来把语义改动当作「允许项」。

**来源**：方案 §9 AC-12、§1.4、§5 C5、§8.1；闸门 1 确认记录（不改判定/路由）；团队计划 §6。

### 3.13 AC-13 权限/契约（方案 §9 AC-13）

**标准（可核对语句）**

- 无新增工具/能力位/IPC 方法/`cardKind`/公共导出；无新增共享报告/客户输入字段。
- `OperatorRequestPayload.acceptanceReport` 为 `app/desktop/customer-input.ts` 的**应用私有可选字段**（`{ version:1; path:string; text:DisplayTextV1 }`），只在 `app/desktop` 构造/传递、渲染层消费；不进入 `src/model/runtime.ts`、报告快照/任务账本、localStorage/indexedDB。
- `src/model/runtime.ts` 与 Service/Pipeline public 入口零 diff；`DisplayTextV1`/`GOVERNANCE_SLUG_PATTERN` 只读复用；flowId 校验用本地 `new RegExp(GOVERNANCE_SLUG_PATTERN)`，不新增共享导出。
- 无新增文件读取路径（只复用 `enrichAcceptanceJudgeContext` 已有 `docs/quality/<flowId>-report-v1.md` 读取）。

**判定方法**

1. `git diff --name-only`/`git diff`：`src/model/runtime.ts`、`src/common/shared/**`（i18n messages 除外）、Service/Pipeline public 入口零 diff；无新增 export/IPC 注册。
2. 检查 payload 形状测试/类型：`acceptanceReport` 可选；渲染层防御读取（version/text/path/UTF-8 上限），非法 → `null`。
3. 检查持久化：`tasks.jsonl`/报告快照/`chat-store` 历史/localStorage 无 `acceptanceReport` 正文写入。
4. 检查工具/能力位/`cardKind`：`src/provider/runtime/schema.ts` 零 diff；无新增 `cardKind`。

**所需证据**

- diff/grep 原始输出（共享模型/public 入口/工具 schema）。
- payload 形状与渲染防御读取测试输出。
- 持久化检查证据（无正文写入）。
- 候选哈希。

**失败示例/反例（任一即 fail）**

- 修改 `src/model/runtime.ts`/共享报告或客户输入契约/新增公共导出/IPC/工具/能力位/`cardKind`。
- `acceptanceReport` 进入共享 Model/账本/持久化。
- flowId 校验抽到共享导出而未按升档处理。
- 新增第二文件读取路径。

**来源**：方案 §9 AC-13、§3.4、§3.5、§4.3、§5 C2、§8.1；复核 N1；团队计划 §3.1/§4.2/§6.5。

### 3.14 AC-14 证据包（方案 §9 AC-14）

**标准（可核对语句）**

- T2 变更包含：候选哈希（产品/测试逐文件 `git hash-object` + `sha256sum`）、改动路径、任务节点（G2–E3 或实际节点）、证据链接、风险档位 **T2**、未 commit/push 声明。
- 内容齐全、可复算；档位与改动相符（无升档触发项）。
- 变更包路径按团队计划 E1：`docs/scheduling/acceptance-return-card-change-v1.md`（以统筹实际写盘为准）。

**判定方法**

1. 读取变更包原文：核对上述字段齐全；节点与团队计划 §5.1 对应；证据链接可打开。
2. 复算候选文件哈希与变更包一致；`git status`/`git log` 确认未 commit/push（HEAD 未前进或新提交不由本任务产生；如候选在 worktree，记录基线）。
3. 核对风险档位 T2 与 §6.5 升档条件：无共享 Model/公共导出/判定/路由/持久化变化。
4. 核对产品候选与治理记录分开列明；管理记录不混入。

**所需证据**

- 变更包原文与哈希。
- 复算的候选文件哈希清单。
- `git status`/`git log`/`git rev-parse HEAD` 原始输出。
- 测试/E2E 输出链接。

**失败示例/反例（任一即 fail）**

- 缺候选哈希/路径/节点/证据/档位/未提交声明任一。
- 哈希不可复算或与工作区不一致。
- 档位与改动不符（触发升档却仍按 T2 声称）。
- 已 commit/push（违反团队计划 §八）或声明不实。

**来源**：方案 §9 AC-14、§8.1、§10.4；团队计划 §5.1 E1/§7.2/§7.3。

---

## 四、已确认口径核对项（F3/F5/Q5-A/O2）

### 4.0 总表与来源

| 核对项 | 来源 | 主题 | 关联 AC | 最低证据 |
| --- | --- | --- | --- | --- |
| F3 | 方案 §2.1/§4.4/§9 AC-1；闸门 1 确认记录 | 内置质检非验收质量核对报告按验收身份显示；项目角色不标记；文案不声称已通过 | AC-1/AC-5/AC-9 | 边界夹具 DOM/文案原文 + 项目角色对照 + diff（无任务级判别） |
| F5 | 方案 §4.1 第 5 条/§4.5/§9 AC-1/AC-10；复核 F5 | 交付批 `.delivery-report` 与回交行两处位置；危险色优先 | AC-1/AC-10 | 两处位置 DOM/类名 + blocked/failed + 决定卡 high-risk/destructive |
| Q5-A | 方案 §1.5/§4.6/§9 AC-6/AC-7/§11.2；闸门 1 确认记录 | 报告卡既有快照上限；决定卡 16 KiB 投影；超限/净化 flags；缺失降级 | AC-6/AC-7 | >16 KiB 测试 + 快照边界测试 + 降级五组 |
| O2 | 方案 §1.2.2/§4.2/§4.4/§7 O2/§9 AC-5；闸门 1 确认记录 | 验收决定卡显示报告路径 | AC-5 | 报告存在时路径可见 + 固定约定路径 + 本地化 key |

这些核对项来自闸门 1/2 已确认的方案与团队计划，用于核对实施口径；**不新增产品 AC，也不得替代或弱化 AC-1–AC-14**。

### 4.1 F3 已接受限制

**标准（可核对语句）**

- **F3-a 限制如实**：内置质检提交的**非验收质量核对报告**也显示「独立验收报告」身份；这是 v1 显式已接受限制，不判 fail、不要求任务级判别。
- **F3-b 项目角色不标记**：只有 `RoleView.builtIn === true && governanceFunction === "verification"` 触发；项目角色 id 恰好为 `verifier` 但 `builtIn=false` 不触发；不按 id 字符串/摘要文本/报告状态猜测。
- **F3-c 文案不声称通过**：报告卡标题「独立验收报告」、徽标「独立验收」；报告事实行用条件措辞「验收决定（如适用）」/「若本次为验收任务，由客户在验收决定卡作出；报告本身不构成通过。」；免责声明「以上为质检提交的报告原文；如本次为验收任务，是否验收通过以验收决定卡为准。」；不得出现断言式「已验收通过」「验收已通过」「通过验收」等结论。
- **F3-d 不实施 O10**：不得新增任务级判别/`reportKind`/`taskKind` 读取或标记；如实施需要，按 §6.5 停止/升档（T3），不在本任务写集。

**判定方法**

1. 用内置质检的非验收内容报告夹具渲染，捕获标题/徽标/事实行/免责声明原文，逐项核对条件措辞与无断言式通过结论。
2. 用项目角色 `verifier`（`builtIn=false`）夹具渲染，确认普通卡、无验收样式。
3. `git diff`/grep 确认未新增 `reportKind`/`taskKind` 判别或任务账本读取；未新增共享契约。

**所需证据**

- 非验收质量核对报告边界夹具 DOM/文案原文。
- 项目角色 `verifier` 对照 DOM。
- 相关 diff（无任务级判别）与候选哈希。

**失败示例/反例（任一即 fail）**

- 项目角色被标记，或按 id/文本/状态猜测验收。
- 文案声称已通过，或缺少「报告本身不构成通过」/条件免责声明。
- 擅自新增任务级判别/`reportKind`（方案外，按 §6.5 停止/升档）。

**来源**：方案 §2.1（F3 限制）、§4.1 第 3 条、§4.4、§9 AC-1、§12 F3/N3；闸门 1 确认记录。

### 4.2 F5 两处位置与危险色优先

**标准（可核对语句）**

- **F5-a 交付批单独覆盖**：交付批报告段是 `.delivery-report`（无 `.msg-handback` 外层）；必须给 `.delivery-report` 加 `is-acceptance` 与 `is-blocked`（`status !== "completed"`），并让 `report-top`/`report-body` 带 `is-acceptance`；不能只依赖 `.msg-handback.is-acceptance` 选择器。
- **F5-b 两处危险色优先**：回交行 `.msg-handback.is-acceptance.is-blocked` 与交付批 `.delivery-report.is-acceptance.is-blocked` 均使用危险色（`--danger`/`--danger-border`/`--danger-bg`），危险色优先于验收冷色；徽标/标题仍保留。
- **F5-c 决定卡危险色优先**：`.decision-dialog.is-acceptance.is-high-risk` 用 `--danger-border`，`.decision-dialog.is-acceptance.is-destructive` 用 `--warning-border`，规则写在 `.is-acceptance` 之后，避免被冷色覆盖。
- **F5-d 视觉表达**：具体形状按方案 §4.5——回交行为完整边框 + 左边条，交付批为左边条 + 头部背景；两处的身份表达（标题/徽标/冷色）和危险色优先必须一致；不要求 CSS 逐字相同。

**判定方法**

1. DOM/类名断言：交付批报告段含 `delivery-report is-acceptance`；blocked/failed 时含 `is-blocked`；回交行含 `msg-handback is-acceptance`；两处 `report-top` 状态背景/边框符合方案 §4.5。
2. 决定卡 high-risk/destructive 夹具：断言 `.decision-dialog.is-acceptance.is-high-risk`/`.is-destructive` 的危险色类/样式存在且优先（可检查 CSS 顺序或计算样式）。
3. 检查 CSS diff：新增类只引用既有令牌；规则顺序满足危险色优先；无遗漏交付批选择器。
4. 与 AC-1/AC-10 的 DOM 断言共用证据。

**所需证据**

- 两处位置与 blocked/failed 的 DOM/类名断言。
- 决定卡 high-risk/destructive 的 DOM/样式断言。
- CSS diff 与令牌审计输出。

**失败示例/反例（任一即 fail）**

- 交付批无 `is-acceptance`/`is-blocked`，或只有头部背景、无冷色边条/危险色。
- 回交行或交付批危险色被验收冷色覆盖。
- 决定卡 high-risk/destructive 被冷色覆盖。
- 新增裸色值/未定义令牌。

**来源**：方案 §4.1 第 5 条、§4.5、§9 AC-1/AC-10；复核 F5（P1.1 关闭说明）；团队计划 §6.3。

### 4.3 Q5-A 有界投影与降级

**标准（可核对语句）**

- **Q5A-a 报告卡**：沿用既有快照上限——摘要 **16 KiB**、单条证据 **2 KiB**、最多 **32 条**、快照 **96 KiB**；不提高/取消上限；`evidenceOmitted` 提示如实。
- **Q5A-b 决定卡**：`protectText(reportText, 16384)` 的 **16 KiB 安全投影**；UTF-8 前缀；超限显示「报告原文超出显示预算，已截断。」；净化显示「已净化」；不在渲染层二次截断或放宽。
- **Q5A-c 降级**：报告缺失/不可读/无 flowId/非法 flowId/旧 payload → preview + 明确说明，卡可作答；不读第二路径（O4 不实施）；Q5-B（64 KiB）/Q5-C（无上限）/Q5-D（1 MiB 读取上限）不实施。
- **Q5A-d 原始文件**：投影不修改原始报告文件。

**判定方法**

1. 运行 AC-7 的 >16 KiB/净化/快照边界测试与 AC-6 的五组降级测试，核对上限与 flags。
2. 检查实现 diff：`protectText(reportText, 16384)` 在 `enrichAcceptanceJudgeContext` 内复用；报告卡未新增显示预算；无第二读取路径。
3. 核对 UI 文案 key（截断/净化）与显示条件。

**所需证据**

- >16 KiB/净化/快照边界测试原始输出。
- 五组降级测试输出。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 决定卡预算 >16 KiB 或无上限；报告卡突破既有快照上限。
- 超限/净化无 flag/文案；原始文件被改写。
- 第二读取路径（`docs/acceptance/...` 等）或 Q5-B/C/D 被实施。
- 缺失/不可读/无/非法 flowId 不降级或卡不可作答。

**来源**：方案 §1.5、§1.2.2、§4.6、§5 C2/C3、§9 AC-6/AC-7、§11.2 Q5-A；闸门 1 确认记录（Q5-A）；团队计划 §6.6。

### 4.4 O2 报告路径

**标准（可核对语句）**

- 验收决定卡在报告存在时显示固定约定路径 **`docs/quality/<flowId>-report-v1.md`**，使用本地化 key `ui.decisionDialog.reportPath`（zh「报告路径：{path}」/ en 对应文案）。
- 路径来源只限应用已使用的固定约定路径（`enrichAcceptanceJudgeContext` 读取的 `reportRel`），**不接受**模型/渲染层提供的任意路径。
- 报告缺失/无 flowId/非法 flowId 时不编造路径；显示 `acceptanceReportFallback`/`acceptanceReportMissing` 说明。
- 仅 O2 纳入；O1/O3–O10 不实施（尤其 O4 第二路径、O5 SHA-256、O6 只幕僚视图、O10 任务级判别）。

**判定方法**

1. SessionManager 测试捕获 `ctx.acceptanceReport.path === docs/quality/<flowId>-report-v1.md`；Electron DOM 断言路径文本可见（`<code>` 或等价）。
2. 无 flowId/非法 flowId/缺失夹具：断言不显示路径或显示缺失说明，无伪造路径。
3. 检查 diff：路径由 `reportRel` 构造，**构造前**已做本地 slug 校验；无第二路径；无 O5 哈希显示。
4. 核对 i18n key `reportPath` 存在且占位符一致（AC-8 共用）。

**所需证据**

- SessionManager 路径捕获与 DOM 断言。
- 缺失/非法 flowId 的路径不显示证据。
- 相关 diff 与候选哈希。

**失败示例/反例（任一即 fail）**

- 报告存在但路径缺失，或显示非固定约定路径/模型自报路径。
- 缺失/非法 flowId 时伪造路径。
- 实施 O4 第二路径/O5 SHA-256/O6 只幕僚视图/O10 任务级判别。
- 路径文案硬编码未走 i18n。

**来源**：方案 §1.2.2、§4.2、§4.4、§7 O2、§9 AC-5、§11.3 第 4 项；闸门 1 确认记录（O2 纳入）；团队计划 §6.7。

### 4.5 与 AC 和总体判定的关系

- F3 支撑 AC-1（身份/文案）、AC-5（决定卡文案）、AC-9（渲染安全）；任一项失败 → 对应 AC fail/insufficient。
- F5 支撑 AC-1（两处位置）与 AC-10（危险色/窄屏）；交付批缺覆盖或危险色被覆盖 → AC-1/AC-10 fail。
- Q5-A 支撑 AC-6（降级）与 AC-7（有界投影）；预算/降级不符 → 对应 AC fail。
- O2 支撑 AC-5；路径缺失/伪造 → AC-5 fail。
- 总体结论要求：AC-1–AC-14 全部 pass，且 §四 核对项均满足或按本文件如实记录；任何 `fail` → 返工；无 `fail` 但有 `insufficient evidence` → 证据不足。

---

## 五、成功、失败与边界情形（判定观察点）

| 情形 | 预期观察 | 判定 |
| --- | --- | --- |
| 内置质检报告（回交行） | 标题「独立验收报告」/徽标「独立验收」/`is-acceptance` 冷色；完整 `summary.text`；全部证据；无折叠 | 缺任一 → AC-1/AC-2/AC-3 fail |
| 内置质检报告（交付批） | 同上；`.delivery-report.is-acceptance` 单独覆盖 | 只覆盖回交行 → AC-1/AC-10 fail（F5） |
| 普通报告（角色 `A`） | 180 字/4 行预览 + 「查看全文」；无验收样式 | 被改为验收/全文 → AC-4 fail |
| 项目角色 id=`verifier`（`builtIn=false`） | 普通报告卡 | 触发验收 → AC-1 fail（F3） |
| 内置质检非验收质量核对报告 | 仍显示验收身份；文案无断言式通过结论 | 声称已通过/缺条件措辞 → AC-1 fail（F3） |
| blocked/failed/aborted 验收报告 | 保留身份；危险色优先（两处） | 冷色覆盖危险色 → AC-1/AC-10 fail（F5） |
| 验收决定卡（报告存在） | 「独立验收决定」徽标/冷色/16 KiB 原文/O2 路径/preview 始终可见；选项不变 | 缺原文/路径/preview/选项变化 → AC-5 fail |
| 决定卡缺失/不可读/无 flowId/非法 flowId/旧 payload | 说明 + preview 完整可见；卡可作答；无越界读取 | 抛错/自动通过/不可作答/越界 → AC-6 fail |
| 非法 flowId judgeContext | facts/artifacts 缺失；`unavailableReason` fail-closed；合法 slug 卡不变 | 仍构造/读取路径 → AC-6 fail（N4） |
| >16 KiB 报告文件 | 文本 ≤16384 UTF-8 字节；`truncated=true`；「已截断」；原文件不改写 | 超限/无 flag/改写 → AC-7 fail（Q5-A） |
| 净化夹具（伪 secret） | `redacted=true`；「已净化」；无明文泄漏 | 泄漏/flag 不实 → AC-7/AC-9 fail |
| 报告卡快照边界 | 摘要 16 KiB/单证据 2 KiB/32 条/快照 96 KiB；省略提示正确 | 突破上限/伪造证据 → AC-7 fail |
| i18n | 14 key 中英成对/占位符一致/无硬编码/计数更新 | 缺失/中文泄漏/计数失败 → AC-8 fail |
| 安全渲染 | HTML 转义/链接受控/无新 innerHTML/无第二管线 | 执行脚本/注入 → AC-9 fail |
| 回交行 vs 交付批 | 两处身份/危险色一致（形状按方案 §4.5） | 一处缺失或不一致 → AC-1/AC-10 fail（F5） |
| 决定卡 high-risk/destructive | 危险色覆盖冷色 | 冷色覆盖 → AC-10 fail（F5） |
| 200%/窄屏 | 无横向溢出（截图可选） | 溢出 → AC-10 fail；缺截图不判 fail |
| 回放（可解析内置质检） | 验收样式 | 分类错误/抛错 → AC-11 fail |
| 回放（角色不可解析） | 普通卡 | 猜测/抛错 → AC-11 fail |
| 语义路径 | 判定/选项/代批/路由/持久化/写权零 diff | 任一变化 → AC-12 fail |
| 共享契约 | `src/model/runtime.ts`/public 入口零 diff；`acceptanceReport` 应用私有 | 共享改动/公共导出 → AC-13 fail |
| typecheck / typecheck:renderer / build:renderer | 退出码 0 | 非 0/未执行 → 对应证据不足/AC-12 fail（视原因） |
| 受影响套件 | 全 pass；无删测/新 skip/放宽 | 失败/弱化 → 对应 AC fail |
| Electron E2E | `E2E_PASS=true` + 原始输出，或可复核不可用原因 | 伪造/无原因 → 证据不足 |
| 变更包 | 候选哈希/路径/节点/证据/T2/未提交声明齐全可复算 | 缺项/不可复算/已提交 → AC-14 fail |
| 截图/录屏 | 截图至多；不要求录屏 | 缺录屏不构成 fail/insufficient |

---

## 六、T2 依据、升档条件与证据计划

### 6.1 T2 依据

- 技能 `references/testing.md` 的唯一定义：**T1 局部实现；T2 跨角色/契约/shared；T3 发布/共享抽象/治理或权限变更**。本变更跨渲染层（桌面 UI 展示）、桌面 Interface（展示载荷）与共享 i18n（新增 key），属于跨角色/共享的展示/载荷变更。
- 方案 §8.1 与闸门 1/2 已定档 **T2**：不改验收判定、验收卡选项/路由、报告持久化/声明语义、写权/边界；不新增公共导出、不修改共享 Model/报告契约（`createToolDisplayContext` 是既有实现只读复用；flowId 校验用本地 `new RegExp(GOVERNANCE_SLUG_PATTERN)`）；合法 slug 卡零行为变化，非法/缺失 flowId 的 facts/artifacts 省略与 `unavailableReason` 可能变化是新增 fail-closed 保护，不算验收判定变更。
- 不把「只改显示」当作降档理由；T2 是确认档位，升档不降档。

### 6.2 受影响层与跨层证据

| 层/角色 | 受影响内容 | 检查 |
| --- | --- | --- |
| 桌面UI（`app/renderer/`） | `role-view.ts`（`isVerificationRole`）；`ReportCard.tsx`（验收分支/两处位置/证据/无折叠）；`DecisionDialog.tsx`（徽标/报告区/路径/preview/降级）；`decision-dialog.ts`（`acceptance`/`AcceptanceReportView` 防御读取）；`shell.css`/`phase4a.css`/`phase4b.css` | `role-view`/`decision-dialog`/`report-view`/`dialog-a11y`/`source-guard`/`theme-tokens` 测试；条件 E2E 夹具；`typecheck:renderer`/`build:renderer` |
| 桌面窗口（`app/desktop/`） | `session.ts`（`enrichAcceptanceJudgeContext` 复用读取/本地 slug 校验/`protectText`/display 传递/诊断）；`customer-input.ts`（`DesktopCustomerInputFn.ctx.acceptanceReport?`、`OperatorRequestPayload.acceptanceReport?`、队列/镜像/过期保留） | 新 `test/桌面应用/acceptance-return-card.test.ts`（SessionManager 级；正常/>16 KiB/空缺失/不可读/无 flowId/非法 flowId/旧 payload；judgeContext fail-closed）；`acceptance-evidence.test.ts`/`optional-acceptance.test.ts` 只读回归；`npm run typecheck` |
| 项目管理（i18n） | `src/common/shared/i18n/messages/{zh-CN,en-US}.ts` 14 个 `ui.*` key；`test/项目管理/shared/i18n.test.ts` 计数/parity | `i18n.test.ts`/`i18n-guard.test.ts`；`npm run typecheck` |
| 跨层集成 | 真实报告文件 → `protectText(reportText, 16384)` → `ctx.acceptanceReport`/presenter payload → 渲染层 `decisionView`/DOM；报告卡两处位置真实渲染 | SessionManager 级捕获 + Electron DOM；普通卡对照；选项回归 |
| 测试（D1） | 方案 §10.3 受影响套件 + 双 typecheck + `build:renderer` + 可跑 Electron E2E + T2 证据包 | 原始输出、计数、失败分类、候选哈希；不虚报全量回归 |

### 6.3 命令清单（最低要求；实际以仓库脚本/runner 为准）

| 范围 | 命令 | 产出角色 |
| --- | --- | --- |
| 桌面UI 纯逻辑/组件/守卫 | `node --test --test-concurrency=1 test/桌面UI/report-view.test.ts test/桌面UI/role-view.test.ts test/桌面UI/decision-dialog.test.ts test/桌面UI/dialog-a11y.test.ts test/桌面UI/source-guard.test.ts test/桌面UI/theme-tokens.test.ts`；`npm run typecheck:renderer`；`npm run build:renderer` | 桌面UI |
| 项目管理 i18n | `node --test --test-concurrency=1 test/项目管理/shared/i18n.test.ts test/项目管理/shared/i18n-guard.test.ts`；`npm run typecheck` | 项目管理 |
| 桌面窗口 SessionManager/回归 | `node --test --test-concurrency=1 test/桌面应用/acceptance-return-card.test.ts test/桌面应用/acceptance-evidence.test.ts test/桌面应用/optional-acceptance.test.ts`；`npm run typecheck` | 桌面窗口 |
| 投影/报告快照前提 | `node --test --test-concurrency=1 test/runtime-core/tool-display.test.ts test/runtime-core/report-provenance.test.ts` | 桌面窗口/测试 |
| 测试 D1 汇总 | 上述受影响套件 + `npm run typecheck` + `npm run typecheck:renderer` + `npm run build:renderer`；可跑 Electron E2E（`node_modules/.bin/electron test/桌面应用/e2e/main.mjs`，或按团队计划使用 `test/桌面UI/phase4b-electron-smoke.mjs`/`test/桌面应用/e2e/uiux-v2.mjs`） | 测试 |
| 项目管理 P1 审核 | 审核记录（`recommend approval`/`needs revision`/`not ready`）；i18n 变更时按上表执行 | 项目管理 |

命令若因仓库实际脚本/runner 不同而调整，须在变更包中记录实际命令、原因与等价性；不得用不可运行的示例命令冒充结果。

### 6.4 typecheck、build、E2E 与截图规则

- `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` 必须执行并记录退出码 0（本任务改渲染层，三项均为必需，不是条件项）。
- Electron E2E：优先既有 `test/桌面UI/phase4b-electron-smoke.mjs` 或 `test/桌面应用/e2e/uiux-v2.mjs` 的最小追加（团队计划 §4.3 A5）；需要时运行 `test/桌面应用/e2e/main.mjs`（只读执行）。记录 `E2E_PASS`、命令、环境、候选哈希、窗口尺寸；不可跑则记录可复核原因（命令、错误原文、环境），不得静默跳过。
- **截图规则**：最多截图，不要求录屏；截图来自当前候选真实运行、关闭 DEBUG 覆盖层，记录 sha256、候选版本、拍摄命令/窗口尺寸；不得以录屏作为验收要求或选项；缺少录屏不构成 fail/insufficient。AC-10 的窄屏截图按方案为可选。
- 无 task_ops：不伪造任务状态/凭证/锁/审批；以文件哈希与原始输出为准（§2.6）。

### 6.5 升档与停止条件

- 实施中出现以下任一，停止并回报统筹/沟通，按方案 §8.1/团队计划 §5.4 处理（重开闸门、升 T3）：
  - 修改 `src/model/runtime.ts` 的共享报告/客户输入契约（`RuntimeReportSnapshotV1`/`RuntimeLiveReportViewV1`/`DisplayTextV1`/`CustomerInputRequest` 等）；
  - 新增 Service/Pipeline 公共导出或共享抽象（含把 `protectText`/flowId 校验抽成共享 helper）；
  - 修改验收判定、`request.resolved`/`customer.decision`、验收路由或判断代批；
  - 新增 `cardKind`/工具/能力位/IPC 方法；
  - 把展示文本持久化进报告/任务存储/账本；
  - 实现任务级验收判别（O10）或恢复已取消的 `full-report-display` P1.3；
  - 写集/边界/档位变化，或需要新增未列路径（含 `test/桌面应用/` 其他新文件、新 e2e 脚本）；
  - 证据不足以建立跨层/真实渲染结论（候选不可复算、SessionManager 级测试缺失、E2E 不可复核）。
- 升档后本文件标准不因升档而放宽；标准变更按 §1.2 处理（递增版本、记录理由、交沟通/统筹确认）。
- 证据不足时按 `references/testing.md` 升到更高档补证（最高至全量回归）；不得以时间紧降档。

---

## 七、与团队计划、写集与授权边界

- 写集以闸门 2 确认的团队计划 §4.1/§4.3 为准：桌面UI `app/renderer/src/chat/role-view.ts`、`app/renderer/src/chat/decision-dialog.ts`、`app/renderer/src/shell/ReportCard.tsx`、`app/renderer/src/chat/DecisionDialog.tsx`、`app/renderer/src/shell/{shell,phase4a,phase4b}.css`、`test/桌面UI/*`（含条件 E2E 最小追加）；桌面窗口 `app/desktop/session.ts`、`app/desktop/customer-input.ts`、新增 `test/桌面应用/acceptance-return-card.test.ts`（B-1 后）；项目管理 `src/common/shared/i18n/messages/{zh-CN,en-US}.ts`、`test/项目管理/shared/i18n.test.ts`；测试 `角色卡/测试/docs/change/` 证据（`test/测试/` 默认不新增）。验收按该写集核对 `git diff --name-only`/`git status --short`；任何角色不得写其他角色路径、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界（B-1 由人事执行）。
- 边界变更仅限 **B-1**（桌面窗口 `boundary.md`/`boundary.yaml` 新增 `test/桌面应用/acceptance-return-card.test.ts` 精确条目 + `changelog.md`；写标准时已由人事落地，md/yaml/changelog 一致）；无其它边界改动。B-1 是治理变更，不纳入产品候选；验收只按 B-1 核对写集授权，不因 changelog 状态把产品 AC 判 fail。
- **只读/零 diff 文件**（产品候选范围外）：`src/model/runtime.ts`、`src/common/runtime-core/tool-display.ts`、`src/common/runtime-core/report-provenance.ts`、`src/common/门禁引擎/governance-roles.ts`、`src/pipeline/orchestration/run-role.ts`、`src/common/编排/handback.ts`、`app/desktop/interface.ts`、`app/renderer/src/chat/types.ts`、`app/renderer/src/chat/markdown.ts`、`app/renderer/src/chat/ChatRow.tsx`、`app/renderer/src/chat/TaskCenterPanel.tsx`、`app/renderer/src/index.css`。任一被修改（除已确认写集内的展示/载荷/i18n/测试）→ 停止/升档/返工。
- `test/桌面应用/acceptance-evidence.test.ts`、`optional-acceptance.test.ts`、`e2e/main.mjs` 按团队计划为**只读回归/执行**，不得修改；`test/桌面应用/` 只新增 B-1 文件。若实施需要扩展 `acceptance-evidence.test.ts` 而非新文件，须先按团队计划 §9.2 第 1 项更新闸门 2/B-1；未更新即改动按越权处理。
- 不 commit/push/merge/release（团队计划 §1.3/§八）；验收通过只表示当前候选满足标准，不授权提交/推送/合并/发布。
- 无 task_ops；不伪造机器状态。B-1 边界补登是闸门 2 确认的人事治理变更，不计入产品候选。

---

## 八、版本冻结与报告安排

- 本文件路径固定为 `docs/acceptance/acceptance-return-card-criteria-v1.md`，版本 **v1**，日期 **2026-11-02**；写盘即冻结，标准先于实施。
- 实施前：沟通确认本文件路径/版本；未确认不派实施（团队计划 V1 出口）。本文件不因实施授权未给而失效；实施授权另记。
- 实施后：统筹提交变更包（`docs/scheduling/acceptance-return-card-change-v1.md`：候选哈希、改动路径、节点 G2–E3、证据链接、T2、复用/失效说明）；独立验收按本文件判定并**另写** `docs/acceptance/acceptance-return-card-report-v1.md`；报告首行至少含风险档位、判定依据、选定检查、复用证据、消费者重测结论、T2 口径说明（是否执行全量回归及理由）、E2E 状态、结论。
- 报告核心为逐项验收表（§2.1）；总体结论只能是**通过 / 返工 / 证据不足**，不得用「基本完成」「全部通过」等模糊措辞替代。
- 本文件不包含任何候选判定、通过/返工/证据不足结论；不做验收结论的提前预告。
- 标准变更：递增版本、记录理由、交沟通/统筹确认；候选变化不改变标准，只使受影响证据失效并补证。
- 验收通过不授权提交、推送、合并、发布；这些另行授权（团队计划 §1.3/§八）。

---

## 九、写标准时发现的待澄清项与只读核对结果（只报告，不修改）

以下为只读核对发现的事实/文档状态/口径问题，供统筹/沟通/策划处理；本文件**未修改**方案、复核、团队计划、沟通记录、角色卡、产品源码或测试，也未自行放宽标准。除明确说明外，这些问题不改变本文件的判定力度；如方案/客户后续澄清与本文件理解不同，按 §1.2 递增版本重判。

1. **沟通记录为并发追加的管理记录**：写标准时 **130 行 / `48fa7342…`**；团队计划文件头引用「当前 93 行 / `449bf016…`」（闸门 2 记录追加前快照），方案文件头引用「68 行 / `54f44bbb…`」（闸门 0 写盘快照）。验收引用其确认小节（闸门 0/1/2、实施授权），不以旧快照哈希替当前记录，也不混用。
2. **文档状态头漂移（方案/团队计划）**：方案 P1.2 文件头写「草案 P1.2……待闸门 1」；团队计划文件头/§二写「闸门 2 未确认、实施授权未给」；沟通记录已含闸门 0/1/2 确认。判定以 `docs/communication/` 确认小节与冻结哈希为准；这些状态行是写于确认之前的历史状态行，不影响本文件条目（AC-14 已按此口径）。
3. **实施授权状态**：写标准时客户实施授权未给（沟通记录闸门 2 确认小节明确「另行给出」）。本文件按团队计划 V1 入口（G2 后可启动、不依赖实施授权）写盘；不据此派发或实施。实施后 E2 判定以当时的沟通记录/实施授权为准。
4. **i18n key 计数口径**：方案 §4.4/团队计划 §4.3 推算 14 个 `ui.*` key、计数 `921/1545`；实际以实施时的 key 集与 `i18n.test.ts` 为准。若最终 key 集与方案表不一致，P1 实现提案/变更包须逐项说明理由并确认不缺失 AC-1/AC-5/AC-10 所需文案；本文件不把 14/921/1545 当作可静默偏离的软目标，也不把任何不一致自行判为失败——按 §1.2 交澄清/确认后重判。
5. **O2 在 AC-5 中的表述**：方案 §9 AC-5 原文「路径（如 O2 选）可见」；闸门 1 已确认 **O2 纳入**，故本文件按「报告存在时路径为必需」判定，不再按可选处理。这是确认后的口径落地，不新增要求。
6. **AC-10 窄屏截图可选**：方案 §9 AC-10 列「Electron 窄屏断言/截图（可选）」；本文件按可选证据处理，缺少截图不构成 fail/insufficient；但两处位置/危险态的 DOM/类名断言与 `dialog-a11y`/`theme-tokens` 测试是必需证据（方案 §9 已列）。
7. **SessionManager 测试文件选择**：团队计划 B-1 已确认新增 `test/桌面应用/acceptance-return-card.test.ts`；`acceptance-evidence.test.ts`/`optional-acceptance.test.ts` 按团队计划 §4.1 为只读回归。若后续决定扩展既有文件而非新增，须先更新团队计划/闸门 2/B-1（团队计划 §9.2 第 1 项）；本文件不接受未授权的新文件或对只读回归文件的修改。
8. **`acceptanceTriage` 前闸**：复核记录未发现 `opts.acceptanceTriage` 注入点；团队计划 §9.2 开放点 5 要求若真实接线存在，在 P1/实施中确认不覆盖本 payload。本文件不把该开放点新增为 AC；若实施发现三方卡替换导致 `acceptanceReport` 无法到达 `DecisionDialog`，AC-5 证据不足，交沟通/统筹澄清（不自行放宽）。
9. **E2E harness 选择**：方案 §10.3 列 `test/桌面应用/e2e/main.mjs`；团队计划优先桌面UI 所有的 `phase4b-electron-smoke.mjs`/`uiux-v2.mjs`，`main.mjs` 只读执行。本文件按团队计划接受任一实际 harness，但必须记录实际命令、环境、`E2E_PASS`/原因与候选哈希；不得新建 e2e 脚本。
10. **「截图至多、不要求录屏」与 AC 证据**：AC-1/AC-4/AC-10 的 DOM 断言/真实渲染证据是必需的；截图不是通用必需证据（AC-10 窄屏截图可选）；缺少录屏一律不构成 fail/insufficient。
11. **AC-12 的「允许项」**：方案 §9 AC-12「上述路径零改动或仅测试/文案允许项」中的允许项限于本任务写集（i18n 文案、测试、渲染展示代码、桌面展示载荷），不包括判定/路由/持久化/写权代码。本文件按此限定解释，避免把「整体 diff 非空」误判为语义变化，也避免把语义改动误当作允许项。
12. **B-1 边界状态**：写标准时 `角色卡/桌面窗口/boundary.md`/`boundary.yaml`/`changelog.md` 已含 B-1 条目（人事执行；md/yaml 一致；改动 +7 行）。B-1 是治理变更，不纳入产品候选；验收按团队计划核对，不因 changelog 状态把产品 AC 判 fail。
13. **Node 环境**：写标准时 `node v24.22.1`/`npm 11.19.1`、`node_modules/.bin/electron` 存在；实施/取证仍须记录实测版本，且不得以写标准时的版本替代候选运行记录。
14. **方案 §13 代码锚点**：本文件引用方案 §13 的只读锚点作背景（如 `app/renderer/src/chat/report-view.ts:130-138`、`ReportCard.tsx:160-166/205-234`、`DecisionDialog.tsx:190-194/227-229`、`session.ts:3655-3819`、`report-provenance.ts:6`、`tool-display.ts:69-84`、`governance-roles.ts:234-246/418-448`、`run-role.ts:2053`）；写标准时未重跑实现验证，实施/验收以符号名与文本锚点为准（方案已说明 `93a8b93..5a35908` 仅沟通文档变化、产品代码一致）。

---

**本文件状态：标准 v1 已冻结；未判定任何候选；未声称本变更已实施、已测试或已验收。**
