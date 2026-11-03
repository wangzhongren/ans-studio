# 意图记录：客户授权平面——两个标记 `@审批` / `@决策`

- 日期：2026-11-03
- 提出人：客户
- 记录角色：ANS 沟通（Communication）
- 闸门 0 状态：**已确认（2026-11-03）**；客户原话「确认闸门 0，现在就在新 worktree 立项开发两个标记。」
- 任务 ID / flowId：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane`
- 变更类型：新需求——客户授权平面（`customer.directive` 两个标记的路由与落账）；客户声明 **T3**（最终由策划/统筹定档）
- 与既有记录的关系：扩展原工作树 `docs/communication/memo.md` 2026-11-03 条「客户授权平面输入形态」的既有决定（两个独立标记、不做单一 `@边界`）；本记录为完整口径。

## 客户原话（2026-11-03，完整保留）

> 你在新的分支里面去开发 两个标记
>
> * `@审批` → 只发给「替我审批」
>    * 用于 shell / 联网 / 外部目录的允许、拒绝、撤销；
>    * 审批前置只读“审批指令”，不会去看决策指令；
>    * 例：`@审批 允许联网 domain=api.example.com until=session`、`@审批 允许 shell "npm install" once`、`@审批 撤销 #d-123`。
> * `@决策` → 只发给「替我决策」
>    * 用于 decision 卡的选择偏好：选推荐项 / 指定选项 / 拒绝；
>    * 决策 judge facts 只带“决策指令”，不会拿审批指令去代选；
>    * 例：`@决策 选推荐项 until=session`、`@决策 只接受方案 A`、`@决策 拒绝所有新范围`。
>
> 路由与落账
>
> * 两个标记都只在客户输入框开头识别；命中后不发给幕僚，走应用级 IPC。
> * 各走各的确认面板（预填原文、范围、资源、期限），确认后写入 `customer.directive`，用 `target: "approval" | "decision"` 区分；同一本账、两个消费者，各自只读自己的 target。
> * 回执分别显示「已记录审批指令 #id」「已记录决策指令 #id」；两个面板也分开列出生效/撤销。
> * 不写 `@边界` 了；如果客户输入 `@边界`，按普通聊天处理或提示“请用 `@审批` / `@决策`”，不做隐藏解析。
> * 高危（应用级、长期、宽范围）仍要二次确认；两个标记都不能授权代码/角色卡/边界变更，也不能跨判断器使用。
>
> 这样“打字即授权”的路径清晰：`@审批` 管放行，`@决策` 管选卡，互不串线。
> 这仍属于后续 T3「客户授权平面」的设计，等当前 schema 查询变更走完再单独立项；当前 P1.1 窄复核不受影响。

## 意图理解

- **两个独立标记**：`@审批`、`@决策`，只在客户输入框**开头**识别；命中后**不发给幕僚**，走应用级 IPC，由应用弹出确认面板、确认后落账。
- **`@审批` 只服务「替我审批」**：shell / 联网 / 外部目录的允许、拒绝、撤销；审批前置判断只读「审批指令」，不读决策指令。例：`@审批 允许联网 domain=api.example.com until=session`。
- **`@决策` 只服务「替我决策」**：decision 卡的选择偏好（选推荐项/指定选项/拒绝）；决策 judge facts 只带「决策指令」，不拿审批指令代选。例：`@决策 选推荐项 until=session`。
- **确认与落账**：两个标记各走各的确认面板（预填原文、范围、资源、期限）；确认后写入 `customer.directive`，用 `target: "approval" | "decision"` 区分；**同一本账、两个消费者**，各自只读自己的 target。
- **回执与撤销**：「已记录审批指令 #id」/「已记录决策指令 #id」分开显示；两个面板分开列出生效/撤销。
- **不做 `@边界`**：客户输入 `@边界` 按普通聊天处理，或提示改用 `@审批` / `@决策`；不做隐藏解析。
- **安全边界**：高危（应用级、长期、宽范围）仍要二次确认；两个标记都不能授权代码/角色卡/边界变更，也不能跨判断器使用。

## 范围与非目标（按客户原话）

- 做：输入框开头识别、应用级 IPC 路由、两个独立 target 的确认面板/账本记录/回执/生效与撤销、高危二次确认、与「替我审批」「替我决策」两个判断器的隔离接线。
- 不做：`@边界` 或其它旧标记的解析；审批指令参与决策判断（或反向）；任何代码/角色卡/边界授权；跨判断器复用。
- 不改：现有 `customer.directive` 账本语义之外的角色权限、闸门、验收与证据规则（如后续方案需要，另立意图）。

## 排期、分支与授权边界

- **启动（客户决定，2026-11-03）**：立即在新 worktree 立项，与 `contract-schema-query` 收尾并行。
- **新 worktree / 分支**：`.claude/worktrees/customer-authorization-plane`，分支 `feat/customer-authorization-plane`，基点 `243d8f6a6db663a383b516aad6320c5110c7f583`（`release/v1.8.4-assets`）；不占用、不污染原 worktree（`contract-schema-query` 留在原 worktree 收尾）。
- **闸门**：闸门 0 已确认；下一步策划方案 → 独立复核 → 闸门 1 → 统筹团队计划 → 闸门 2 → 实施授权 → 实施 → 独立验收。
- **提交/推送/合并/发布**：一律另行授权。

## 下一步

1. ~~沟通向客户确认闸门 0~~（已确认，2026-11-03）。
2. 交策划出方案（`customer.directive` schema、输入识别与 IPC、确认面板与回执、撤销、高危二次确认、两个判断器的接线与隔离）。
3. 复核 → 闸门 1 → 团队计划 → 闸门 2 → 实施（本 worktree 分支）→ 独立验收。

## 闸门 0 确认记录（2026-11-03）

- **客户确认**：原话「确认闸门 0，现在就在新 worktree 立项开发两个标记。」
- **确认对象**：本文件「意图理解」「范围与非目标」「排期、分支与授权边界」——两个独立标记 `@审批` / `@决策`；只在输入框开头识别、命中后不发给幕僚、走应用级 IPC；`customer.directive` 以 `target: "approval" | "decision"` 区分、同一账本两个消费者互不串线；分开的确认面板/回执/生效与撤销；不做 `@边界`；高危二次确认；两标记不得授权代码/角色卡/边界、不得跨判断器使用。
- **任务基线**：新 worktree `.claude/worktrees/customer-authorization-plane`、分支 `feat/customer-authorization-plane`、基点 `243d8f6`；与 `contract-schema-query`（原 worktree，另一窗口收尾）并行、互不干扰。
- **授权状态**：闸门 0 已确认；下一步策划方案（写入本 worktree `docs/planning/`）→ 独立复核 → 闸门 1 客户确认 → 团队计划（闸门 2）→ 实施授权。**实施、提交、推送、合并、发布均未授权。**

## 闸门 1 材料（2026-11-03，待客户确认）

- **方案（待确认对象）**：`docs/planning/2026-11-03_design_customer-authorization-plane.md` **P1.1**，**1199 行 / SHA-256 `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229`**（P1.0 1147 行 / `6260008c…` 为历史快照，不是确认对象）。
- **独立复核**：`docs/planning/2026-11-03_review_customer-authorization-plane.md`，**132 行 / SHA-256 `d258844527c382aeb1b575f9f0401a87422d557acc94fe2ea181924c6b5aa1b3`**；P1.0 完整复核结论「建议修订后提交」（F1–F9），**再复核（P1.1）结论「建议提交客户确认」**；F1–F9 与三条未解决意见均确认真实落入正文与 AC。
- **风险档位**：**T3**（客户闸门 0 已声明；方案与复核一致；触及共享 Model/公共工具契约与权限语义，需全量回归）。
- **Q1–Q10**：方案推荐全 A（Q5、Q9 见下，另有单独选择）。
- **闸门 1 单独决定项（不得随「确认方案」打包默认）**：
  - **Q5**：**A** = 本轮 `@审批` 只对 shell 命令生效，联网/外部目录仅记录、面板标注「暂无消费者」（对闸门 0 覆盖面的缩减）；**B** = 本轮实施 O1/O2，补齐联网/外部目录审批闸。未单独选择按未决，实施不得按 A。
  - **Q9**：**A（推荐）** = 审计归属扩展 `"directive"` + `directiveId`，代选如实显示为客户指令；**B** = 不改 schema，审计会误记为客户本人点击。
- **选装**：O1–O11 默认全部不实施；O1/O2 仅在 Q5 选 B 时随方案实施；O9（整体回滚开关）、O10（结构性禁止 shell 读取 `.ans`）、O11（随机后缀 ID）除非客户明确选择否则不实施。
- **披露（不影响确认）**：再复核剩余建议级事项 R1（`directivesEnabled` 能力位应明确属基础实现、O9 只加 env 分支）与 R2（AC-13 的高危子句以 Q7 A 为前提需注明），将在实施前文字收口（下一版）处理，不改语义；复核未运行测试/构建、未读取另一 worktree 的 `contract-schema-query` 未提交改动（重叠评估为文本审阅）。
- **授权状态**：闸门 1 只确认方案；团队计划（闸门 2）、实施授权、提交/推送/发布另行。

## 闸门 1 确认记录（2026-11-03）

- **客户确认（选择卡作答）**：方案确认 =「**确认 P1.1**」；Q5 =「**A：仅 shell（方案推荐）**」；Q9 =「**A：扩展 directive（推荐）**」。
- **确认对象**：方案 P1.1（1199 行 / `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229`）+ 复核记录（132 行 / `d258844527c382aeb1b575f9f0401a87422d557acc94fe2ea181924c6b5aa1b3`，再复核结论「建议提交客户确认」）。
- **确认内容**：P1.1 作为**实施与验收基线**；Q5 **A** = 本轮 `@审批` 只对 shell 命令生效，联网/外部目录仅记录并标注「暂无消费者」；Q9 **A** = 审计归属扩展 `"directive"` + `directiveId`；Q1–Q10 其余按推荐 A；O1–O11 选装均不实施（O1/O2 因 Q5 A 不实施；O9–O11 未选）。
- **授权状态**：闸门 1 已确认；下一步统筹团队计划 → 闸门 2（角色/写集/边界）→ 实施授权（另行）。实施、提交、推送、合并、发布仍未授权。

## 闸门 2 材料（2026-11-03，待客户确认）

- **团队计划**：`docs/scheduling/2026-11-03_team-plan_customer-authorization-plane.md`，**653 行 / SHA-256 `37e6bd0dcf63a29fde654ded9a1425272692b95483bab5c276cbdd16f4122fe3`**。
- **五维结论**：**不变（角色名单）+ 改边界 B-1..B-4**（职责相同，仅补精确路径/有界目录）；无新增/拆分/合并角色。
  - B-1 运行时核心：新增 `src/model/directive.ts`、`src/model/directive-marker.ts` 精确单文件。
  - B-2 编排：新增 `src/pipeline/orchestration/customer-directive.ts` 精确单文件。
  - B-3 编排：新增 `src/provider/directive/`、`src/service/directive/` 两个有界模块目录。
  - B-4 桌面窗口：新增 `test/桌面应用/directive-input.test.ts`、`test/桌面应用/directive-decision.test.ts` 精确测试文件。
  - 人事 H1 在闸门 2 后执行 B-1..B-4。
- **参与角色**：运行时核心、项目管理（共享 JSONL + i18n + P1 审核）、编排、桌面窗口、桌面UI、测试、内置独立验收、统筹、沟通；人事执行 B-x。不参与：装配、门禁引擎、产品、宣传、UIUX设计师、各适配器、项目 `角色卡/独立验收` worker。
- **风险档位**：**T3**（与闸门 1 一致）。
- **阶段**：G2 → IA → H1/V1/B0 → P1（实现提案 + 项目管理审核）→ A1/A2/A3 契约冻结（并行）→ B1 → C1 → C2 → D1 → D2 → E1 → E2 → E3。
- **验收安排**：内置独立验收实施前写 `docs/acceptance/customer-authorization-plane-criteria-v1.md`（不弱化 AC-1..AC-24；AC-23/O9 与 AC-24 的 O11 部分因未选实施记 N/A）；E2 由同一验收主上下文判定；沟通另起唯一验收主上下文。
- **证据口径**：T3 全量回归 + 受影响套件 + 双端 typecheck + build:renderer + 方案要求的真实运行截图（不录屏）；候选哈希/原始输出；不 commit/push。
- **基线协调（事实校正）**：`contract-schema-query` 的 **PR #38 已合并**（2026-11-03T04:53:28Z，merge commit `9f1a894…`；`origin/main` = `4c3a6e40…`，已含 PR #39/#40）；本 worktree 基点 `243d8f6` 为其 merge-base。计划建议 IA 后、B0 前 rebase 到当时 `origin/main` 并重记基线；旧 Model/桌面证据不复用；E1/AC-19 披露 rebase 前后 HEAD 与重跑记录。
- **开放点**：本 worktree 无 `node_modules`（B0 前安装或如实记录）；rebase 时点取 IA 时 `origin/main`；共享 JSONL 采用 A（退路 B）；`recovery-channel.ts` 条件改动；i18n 计数；R1/R2 文字收口（若改语义重开闸门 1）；第三个 `test/桌面应用/` 新文件停止回报。
- **授权状态**：本材料只请求闸门 2；**实施授权与闸门 2 分开**（可在同一次确认中分别给出）；提交/推送/合并/发布未授权。

## 闸门 2 确认记录（2026-11-03）

- **客户确认（选择卡作答）**：「**确认闸门 2**」。
- **确认对象**：团队计划 v1（653 行 / `37e6bd0dcf63a29fde654ded9a1425272692b95483bab5c276cbdd16f4122fe3`）。
- **确认内容**：参与角色与不参与角色；精确写集；**B-1..B-4**（人事 H1 执行）；**T3**；阶段顺序；验收安排（V1/E2）；证据口径；越界规则；基线 rebase 条件；共享 JSONL 施行选择。
- **授权状态**：闸门 2 已确认；实施授权见下节（分开记录）。

## 实施授权记录（2026-11-03）

- **客户授权（选择卡作答）**：「**同时授权实施**」——按团队计划 v1 与方案 P1.1 从 H1/V1/B0/P1 开始逐阶段实施；**不含提交、推送、合并、发布**（另行授权）。
- **范围**：团队计划 v1（653 / `37e6bd0d…`）+ 方案 P1.1（1199 / `7875ad6a…`）；阶段 G2 → IA → H1/V1/B0 → P1（提案 + 项目管理审核）→ A1/A2/A3 契约冻结 → B1 → C1 → C2 → D1 → D2 → E1 → E2 → E3；不扩大写集/边界/方案默认项。
- **当前**：H1（人事 B-1..B-4）与 V1（独立验收标准）可启动；B0 在基线更新到当时 `origin/main` 后进行；P1 待 V1 经沟通确认 + B0 完成后启动。

## V1 确认记录（沟通，2026-11-03）

- **标准**：`docs/acceptance/customer-authorization-plane-criteria-v1.md`，**1164 行 / SHA-256 `5ec25996b70b61653225a17464ceeb6e6db208c45fd8be2a70255e8688b0df4a`**（沟通实测）。
- **核对**：AC-1..AC-24 与方案 P1.1 §10.2 逐条逐字一致（**24/24**，未弱化/拆分/删减/新增）；每条含标准原文、所需证据、证据路径、候选标识、产出角色、判定口径；T3 全量/受影响套件/双端 typecheck/`build:renderer`/D2 真实运行截图（关闭 DEBUG、不录屏）等证据口径齐备；仅 **AC-23（O9 回滚开关）** 与 **AC-24 的 O11 子句**按未选实施记 `not applicable` 并写明依据；**无阻断发现**；14 项非阻断备注已记录。
- **沟通确认 V1 路径/版本（v1）**，作为实施前冻结的验收标准；E2 由同一独立验收主上下文按本文件判定。
- **披露**：R1/R2 编辑性收口（P1.2）尚未发生；收口后 V1 以版本注记引用新哈希，若改语义重开闸门 1；基线已按团队计划更新到 `origin/main`（当前 HEAD `4c3a6e4`，E1/B0 重记实际 HEAD）。

## P1.2 编辑性收口记录（沟通核对，2026-11-03）

- **方案**：`docs/planning/2026-11-03_design_customer-authorization-plane.md` **P1.2**，**1209 行 / SHA-256 `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688`**（沟通实测；P1.1 1199 / `7875ad6a…` 为闸门 1 确认版，P1.0 1147 / `6260008c…` 为历史）。
- **改动（仅编辑性）**：R1——§3.3/§9.5/O9 写明 `directivesEnabled` 属基础实现（指令平面启用时恒 `true`、项目切换/重载重推；O9 只加 env 控制的 `false` 分支）；R2——AC-13 高危子句注明「（Q7 A 时）」并与 §13 Q7 联动。
- **语义等价性**：未新增/删除 AC（仍 AC-1–AC-24）、未改风险档位 T3/写集/架构/共享契约/Q 与 O 选项；复核记录未改写（132 行 / `d2588445…`）。
- **闸门 1 关系**：闸门 1 确认对象仍为 P1.1；P1.2 为语义等价的编辑性版本映射（**不重开闸门 1**）；此后任何语义变化重开闸门 1。
- **V1（已完成）**：独立验收已在 V1 加「§1.2.1 版本注记：P1.2 编辑性收口」——V1 现 **1171 行 / SHA-256 `51ac0f5041e67c6dbda6fc9406103379be64530316dbcb2c268c89254b9e0069`**（原 1164 / `5ec25996…`，仅新增版本注记、未改 AC 判定口径）；**E2 基线 = P1.1 闸门 1 确认版 + P1.2 等价映射**，文本冲突时以 P1.1 为准。

## 基线更新与 B0 核对记录（沟通，2026-11-03）

- **基线**：`git fetch` 后 `origin/main` = `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`；分支 `feat/customer-authorization-plane` 以 `--ff-only` 从 `243d8f6` 快进到 `4c3a6e4`（50 files / +8518 / −13）；memo 本地修改已保全（临时副本 → 合并回写，最终 `docs/scheduling/memo.md` 131 行 / `facb6457…`），未跟踪管理文档哈希不变；产品/测试 `git status` 前后为空。
- **B0**：`角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-B0-baseline.md`，**239 行 / SHA-256 `f1c54f09b0e630e4b18378fdae1083b0158eb22538a20552d920dea8fe265441`** + 16 文件证据目录；`npm ci` 33s（Electron 二进制经 `require('electron')` 二次下载，已披露）；双端 typecheck 0、`build:renderer` 0；受影响五组 206 文件 / 2006 tests / 1993 pass / 4 fail（均既有 Windows symlink EPERM）/ 9 skip；**T3 全量 393 文件 / 3479 tests / 3452 pass / 9 fail / 18 skip**（9 失败与既有清单逐条一致，新增确定性失败 0、新增 skip 0；`write-sequencing.test.ts` 排除并记录）。
- **P1 入口**：IA ✔、V1 经沟通确认（含 P1.2 版本注记）✔、B0 ✔；按团队计划 §6.5 仍需 **H1（B-1..B-4 落地）** 完成后才派发 P1 与实施。
- **下一步**：H1（人事）执行 B-1..B-4；落地并核验后通知统筹启动 P1。

## H1 边界变更记录（沟通核验，2026-11-03）

- **执行**：人事按团队计划 B-1..B-4 落地，共 **7 条边界条目**（运行时核心 +2：`src/model/directive-marker.ts`、`src/model/directive.ts`；编排 +3：`src/pipeline/orchestration/customer-directive.ts`、`src/provider/directive/`、`src/service/directive/`；桌面窗口 +2：`test/桌面应用/directive-input.test.ts`、`directive-decision.test.ts`），三份角色根 changelog 各追加一条；md/yaml 同步一致（parseBoundaryYaml 实测 18/21/81 条、新增条目可见、用途逐字一致；既有漂移按计划不修）。
- **核验（沟通实测）**：`角色卡/运行时核心/boundary.md` `3860404817…`、`角色卡/编排/boundary.md` `891ff6dd26…`、`角色卡/桌面窗口/boundary.md` `b63c29d8f8…`；新增 7 条路径在 md 中可见；`git status --porcelain -- src app test` 为空；HEAD `4c3a6e4`。
- **边界测试**：31/31（boundary-yaml/validation/empty-builtin/boundary-matrix）与 9/9（runtime-core write-guard + 编排 boundary-write-validation）全过；resolveWrite 实测新路径放行、未列路径仍拒绝。
- **披露**：团队计划头部状态行为写盘时旧状态（闸门 2 未确认/未授权），以沟通确认记录为准；统筹可在 docs/scheduling/ 更新自身记录。
- **下一步**：通知统筹启动 P1（实现提案 + 项目管理审核）。

## P1 审核结果与 W-1 裁决请求（沟通，2026-11-03）

- **提案（5 份）**：运行时核心 148 行 / `9ab7ce0a…`；项目管理 150 / `cf362147…`；编排 161 / `998abd9b…`；桌面窗口 180 / `eec49e65…`；桌面UI 112 / `fe113942…`（沟通实测哈希一致）。
- **审核**：`角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-P1-review.md` 193 行 / SHA-256 `65f888a6f35b02439fae553d553d9471769f88a242f7eda0556032c09e41d1b2`，结论 **needs revision**：8 项阻断（P1-CAP-01..08）+ 6 项非阻断；契约冻结与实施未开工；产品/测试树为空（HEAD `4c3a6e4`）。
- **W-1（需客户裁决，阻断）**：V1 AC-22 要求 shell 卡待答时客户仍可输入 `@审批`/`@决策`；但既有 `ConfirmCard.tsx` 的 `.sc-overlay` 是 `position:fixed; inset:0; z-index:60` 的全屏 `aria-modal`，覆盖 Composer；C1/C2 现有写集均不能改它。三选一：
  - **A**：增补桌面UI（C2）写集至 `app/renderer/src/shell/ConfirmCard.tsx`（按需 `shell.css`），让 shell 卡不阻塞 Composer 或卡内提供指令入口——保持 AC-22 原语义；属**闸门 2 写集增补**（必要时人事更新 C2 边界）。
  - **B**：由 UIUX/沟通另设高于 shell 卡的全屏指令入口，并同步修正 AC-22「输入 `@审批`」的语义（方案/交互变更）。
  - **C**：客户接受修改 V1 AC-22 文本（放弃「卡待答时输入指令」），V1 递增版本并**重开闸门 1**。
- **其余 7 项阻断**（01 归属事件缺字段、02 轮转年龄写反、03 句柄类型/命名、04 `decisionGroupEnabled` 传递、05 IPC/preload 命名、06 `directiveNotice` 未消费、07 能力位先行）：待 W-1 裁决后交各 owner 窄修订并复审；审核通过前不写产品代码。

## W-1 裁决记录（闸门 2 增补确认，2026-11-03）

- **客户裁决（选择卡作答）**：「**A：扩写集（推荐）**」。
- **内容**：桌面UI（C2）写集增补至 `app/renderer/src/shell/ConfirmCard.tsx`（按需 `shell.css`），由 C2 设计 shell 卡不阻塞 Composer 或卡内提供指令入口，**保持 V1 AC-22 原语义**（shell 卡待答时客户仍可输入 `@审批`/`@决策`）。
- **性质**：**闸门 2 写集增补**（客户本次明确确认）；不改角色名单/职责、不改 P1.1 方案语义、不改 V1 标准，**不重开闸门 1**。
- **边界核对（沟通实测）**：`角色卡/桌面UI/boundary.md` 已有目录授权 `app/renderer/`（含 `src/` 源码与样式）——`ConfirmCard.tsx`/`shell.css` 在既有边界内，**无需人事 H1**；统筹在团队计划中记录 C2 写集增补即可。
- **其余**：P1-CAP-01..07 由各 owner 窄修订后交项目管理复审；审核通过前不写产品代码。

## 提交/合并预授权（客户，2026-11-03）

- **客户指示（选择卡作答）**：「**修完后自动提交合并**」——继续完成 P1 修订→复审→契约冻结→实施→D1/D2→E1/E2；**全部通过后直接提交、创建 PR 并合并**（发布/打 tag 除外）。
- **范围与条件**：授权覆盖本任务（`customer-authorization-plane`，worktree 分支 `feat/customer-authorization-plane`）的 **commit、push、创建 PR（base main）与 merge**；**不含发布/打 tag**；合并前提是 **E2 独立验收通过且 E3 放行**——若验收返工或证据不足，不提交合并，先修复。
- **执行口径**：按「产品/测试一笔 + 治理/记录一笔」分组提交；只 stage 明确任务路径、不 `git add -A`、排除无关未跟踪文件；提交信息带 Co-Authored-By；合并后不删除分支（除非客户另行指示）。

## P1 收口记录（沟通核验，2026-11-03）

- **最终提案（Revision 2，沟通实测哈希一致）**：运行时核心 172 行 / `f2570291…`；项目管理 215 / `bc630843…`；编排 242 / `0d98e200…`；桌面窗口 232 / `13f1fd1c…`；桌面UI 180 / `cde65f80…`。
- **复审**：`角色卡/项目管理/docs/change/2026-11-03_customer-authorization-plane-P1-review.md` **397 行 / SHA-256 `3faef8eec59425816f2794b6b2397af19ae57211a48e76488280b300c87d878c`**，`status: recommend-approval`；两轮修订 + 两次窄复审，P1-CAP-01..18 全部闭合；无扩写集/改方案/重开闸门的残留项。
- **团队计划闸门 2 增补**：§十三 记录 W-1=A（C2 写集增补 `ConfirmCard.tsx`/按需 `shell.css`，属既有 `app/renderer/` 目录授权、无需 H1）；追加后 **664 行 / `ecac818c…`**，确认版语义不变。
- **放行**：按实施授权进入 **A1/A2/A3 契约冻结（并行、A2/A3 先冻结）→ B1 → C1 → C2 → D1 → D2 → E1**；「审核通过前不写产品代码」的条件已满足。
- **提交/合并**：按客户预授权，在 E2 通过 + E3 放行后由沟通执行；统筹本轮不 commit/push。

## 实施完成与 D1 阻断裁决请求（沟通，2026-11-03）

- **实施**：A1/A2/A3/B1/C1/C2 全部 `implemented-unverified`；产品/测试候选 **47 路径**（A1 6 + A2/A3 5 + B1 20 + C1 10 + C2 9，含新目录）；HEAD `4c3a6e4`，未 commit/push。
- **阶段验证**：A1 runtime-core 309/302/3/4；A2/A3 项目管理 shared 175/170/0/5；B1 编排 737/736/1/0 且 typecheck 0；C1 目标 22/22、桌面全套件 522/522、typecheck 0；C2 UI 401/401、双端 typecheck/`build:renderer` 0、phase3b 45/45、phase5a 48/48（只跑不改）、真实 Electron 探针 20/20。所有失败均为 B0 既有 Windows symlink EPERM；新增确定性失败 0、新增 skip 0。
- **D1 阻断（需客户裁决，闸门 2 写集增补）**：全仓 i18n 硬编码守卫唯一失败——`app/desktop/directive-input.ts:324:10` 的「撤销」是**输入解析关键字**（`@审批/决策 撤销 #d-N` 的协议 token），不是用户可见 UI 文案（该文件 UI 文案已全部 key 化）。按 P1 复审 W-5，新增 allowlist 属写集扩张。三选一：
  - **A（推荐）**：授权项目管理在 `test/项目管理/shared/i18n-guard-allowlist.ts` 增加一条 allowlist（+分类注释「输入解析关键字，非用户可见 UI」）——一行、不改产品代码；属闸门 2 写集增补。
  - **B**：由 C1 把该关键字改为无原始 Han 的写法（如 Unicode 转义常量 + 注释），守卫保持严格、不扩写集。
  - **C**：不处理，D1/E1 如实披露；E2 可能判证据不足（不推荐）。
- **其他披露**：C2 早期真实 Electron 探针遗留一个进程（PID 35700，占 probe-run/user-data；终止被策略拒绝），D2 前需确认无残留；A1 `角色卡/运行时核心/api-spec.md` 有 EOF 空行（非产品候选），可顺手修或披露。

## i18n 守卫裁决记录（闸门 2 写集增补，2026-11-03）

- **客户裁决（选择卡作答）**：「**A：加 allowlist（推荐）**」。
- **内容**：授权项目管理在 `test/项目管理/shared/i18n-guard-allowlist.ts` 新增一条 `app/desktop/directive-input.ts` allowlist（附分类注释「输入解析关键字，非用户可见 UI；展示文案已 key 化」）；**不改产品代码**。
- **性质**：**闸门 2 写集增补**（客户本次明确确认）；不改角色/职责/方案/V1/档位，不重开闸门 1。
- **后续**：项目管理补 allowlist 并复跑 i18n 守卫；通过后进入 D1 → D2 → E1（D2 前处理/披露残留 Electron 进程 PID 35700）。

## D2 与 E1 完成记录（沟通核验，2026-11-03）

- **D2 真实运行**：`角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-real-run.md`，**459 行 / SHA-256 `df1bebd883cf42e9d0be9aebd023e6fc3f7673f1810b19a95de571da34c1faf6`**（首跑探针 63/64，S5 面板撤销回执失败 → C2 窄修 → D2-fix **64/64**；`E2E_PASS=true`、`E2E_FAILURES` 空、30 张 1360×860 截图、exit 0；探针 16 张截图、0 console error/CSP）；全新 userData；PID 35700 已终止。
- **候选**：HEAD `4c3a6e4` + **54 文件**（53 产品/测试源 + 1 test-only 探针）；冻结清单 `09-candidate-identity-fix.txt` **134 行 / `49cfc38d…`**，54/54、0 unexpected / 0 missing / 0 mismatch。
- **E1 变更包**：`docs/scheduling/customer-authorization-plane-change-v1.md`，**117 行 / SHA-256 `e3b3ca7007c38229aae1dafd4e554e70ca3fc59b9a53bc4648e0c010bfb06191`**；披露 W-1 写集增补、i18n allowlist、PID 35700、api-spec EOF、D2 未覆盖场景、O1–O11 不实施、客户提交/合并预授权存在但未执行等。
- **当前候选 T3**：403 文件 / **3624 tests / 3597 pass / 9 fail / 18 skip**（9/18 与 B0 逐条相同；新增确定性失败 0、新增 skip 0）；受影响 2151/2138/4/9；双端 typecheck + `build:renderer` 0。
- **下一步**：启动 E2 独立验收（同一主上下文，按 V1 `51ac0f50…` 判定）。

## E2 决策记录（沟通，2026-11-03）

- **E2 报告**：`docs/acceptance/customer-authorization-plane-report-v1.md`，**237 行 / SHA-256 `b19a926c29bf474fd00c52744b6e6f629bf3d7a4267a82087bd69d7afea8690e`**；总体 **证据不足**（0 fail / 7 insufficient evidence / 16 pass / 1 not applicable）。
- **不足项**：AC-1/2/3（D2 真实运行缺近失配/未命中普通投递、空正文面板、带图标记拒绝、未识别片段等子场景）、AC-6（缺 created/consumed/revoked/expired 与坏行/轮转**原始账本样例**）、AC-8（缺 shell 精确命令放行/重复回正常链与 **shell 审计 JSONL 样例**）、AC-11（缺真实重启）、AC-16（缺真实坏账本）。均无相反证据，不判 fail、不判返工。
- **候选身份**：E2 独立复算 HEAD `4c3a6e4` + 54 文件 **54/54** 一致；T3 复用 D2-fix 同候选（403/3624/3597/9/18），新增确定性失败 0、新增 skip 0；双端 typecheck 与 build 0。
- **后续**：按报告 §六补证清单，由统筹安排测试角色补 D2 真实运行子场景与原始样例（**候选保持逐字不变**；补证工具/脚本放证据目录，不进入候选）；完成后同一 E2 主上下文复判。**预授权条件（E2 通过 + E3）未满足，不提交/不合并。**

## E2 补证记录（沟通核验，2026-11-03）

- **D2 补证**：`角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D2-supplement-v1.md`，**302 行 / `68e2fe2b…`** + 245 文件证据；**140/140 checks、16 张截图**；覆盖近失配/未命中/全角/`@边界` 普通投递、空正文面板、带图拒绝、未识别片段、shell 精确命令放行与重复回正常链（shell 审计 JSONL 3 行 / `aef4541b…`，含 `by:"directive:d-1"` 与 `directive:{id,scope}`）、真实重启（`expired app-restart` / `unused-once`）、真实坏账本（3 坏行、回落、不回执不改写）。
- **账本样例**：`角色卡/编排/docs/change/2026-11-03_customer-authorization-plane-B1-ledger-samples.md`，**200 行 / `ed9076dd…`** + 证据：11 行主账本（created×6/consumed/revoked/expired×3）+ 坏行/轮转样例（badLines=1/ignoredLines=1/errors=1）。
- **候选不变**：补证前后 54/54、0 unexpected/missing/mismatch；`git ls-files` 54、staged 0；未 commit/push。
- **披露（交 E2 判定）**：派发示例 `@审批 允许 shell "npm install" 加急` 当前把尾部「加急」并入命令（未列未识别片段、确认可用）；变体 `@审批 允许 加急` 已展示未识别片段路径。
- **下一步**：同一 E2 主上下文复判受影响 AC。

## E2 终判记录（沟通，2026-11-03）

- **E2 报告 v2**：`docs/acceptance/customer-authorization-plane-report-v2.md`，**87 行 / SHA-256 `029df27d1b54b5037fbc75859f8ee5bfdbcf4d6578af3fcce33ae76ee0ab4592`**；总体 **通过（pass）**：**23 pass / 0 fail / 0 insufficient / 1 N/A**（AC-23 整体 N/A；AC-24 仅 O11 子句 N/A）。
- **v1 保留**：v1 报告（237 行 / `b19a926c…`，证据不足）作为历史；v2 为当前候选的现行 B2。
- **补证闭合**：AC-1/2/3/6/8/11/16 全部 pass；AC-3 派发示例按 P1.1 §4.2 判 pass 并附非阻断 UX 注记（引号外尾词并入命令，属更窄授权）。
- **候选**：HEAD `4c3a6e4` + 54 文件，补证前后 54/54；T3（403/3624/3597/9/18）、双端 typecheck、受影响套件、D1/D2 证据沿用有效。
- **下一步**：统筹写 E3 放行；随后按客户预授权执行提交（产品/测试 + 治理/记录分组）、推送、创建 PR 并合并（不发布）。
