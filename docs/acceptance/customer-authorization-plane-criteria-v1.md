# 验收完成标准：客户授权平面——两个标记 `@审批` / `@决策`（T3）——实施前标准 v1

- 风险档位：**T3（共享抽象/公共入口/跨模块契约 + 权限与审计语义变更）**。本变更新增共享 Model（`directive.ts`/`directive-marker.ts`、`runtime.ts`/`project-state.ts` 加法）、`customer-directive/v1` 事件与视图、Pipeline/Service/Provider 新模块、桌面 IPC/preload 与 shell gate/decision 卡两个消费者、Q9 审计枚举扩展；按技能参考 `ans-governed-construction/references/testing.md` 的唯一定义与闸门 0/1/2 记录，**T3，不降档**，默认全量适用回归。
- 判定依据：闸门 0/1/2 与实施授权记录 `docs/communication/2026-11-03_intent_customer-authorization-plane.md`（当前 **120 行 / SHA-256 `e0b89c2645f7119241ca8d88b4c60f84ea782b6ba79b361a6e0b19d1ee85374f`**，写本文件时实测；含闸门 0/1/2 确认与实施授权）；客户在闸门 1 确认的方案 **P1.1** `docs/planning/2026-11-03_design_customer-authorization-plane.md`（**1199 行 / SHA-256 `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229`**，本文件写盘前复算一致）；复核记录 `docs/planning/2026-11-03_review_customer-authorization-plane.md`（**132 行 / `d258844527c382aeb1b575f9f0401a87422d557acc94fe2ea181924c6b5aa1b3`**，再复核结论「建议提交客户确认」，R1/R2 建议级）；闸门 2 确认的团队计划 v1 `docs/scheduling/2026-11-03_team-plan_customer-authorization-plane.md`（**653 行 / `37e6bd0dcf63a29fde654ded9a1425272692b95483bab5c276cbdd16f4122fe3`**，本文件写盘前复算一致）。本文件的 AC-1..AC-24 **逐条取自 P1.1 §10.2，不弱化、不拆分、不删减**；团队计划只作范围、写集、阶段、证据口径与 N/A 依据，不是标准来源。
- 选定检查：受影响角色层测试（运行时核心、项目管理、编排、桌面窗口、桌面UI）+ 跨层集成（`test/测试/`）+ **T3 全量适用回归**（`node --test --test-concurrency=1`，按 B0 基线分类既有 Windows 环境失败；既有排除仅 `test/pi-adapter/write-sequencing.test.ts` 并须记录理由）+ `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` + 方案 AC-1/AC-3/AC-5/AC-18 要求的**真实运行截图**（关闭 DEBUG、记录 sha256/候选/窗口尺寸/拍摄命令；**最多截图、不得要求或提供录屏**）。
- 复用证据：仅同一候选、同一输入/依赖、同一命令、同一配置/夹具的证据可复用；候选、输入、依赖、契约、IPC/preload 形状、测试夹具或构建配置变化时，受影响证据失效，只补失效部分；rebase 后旧 Model/桌面证据不得复用；E1 必须逐项列出复用理由与未失效依据。
- 全量回归：**T3 要求执行**（见 §六）；报告首行必须写「全量回归已执行（命令/范围/输出）」或团队计划认可的等价口径；不得以受影响检查替代全量回归，也不得因耗时降档。
- 任务 ID / flowId：`2026-11-03-customer-authorization-plane` / `customer-authorization-plane`。
- 标准路径 / 版本 / 日期：`docs/acceptance/customer-authorization-plane-criteria-v1.md` / **v1** / **2026-11-03**（实施前冻结）。
- 阶段与状态：**实施前完成标准**。本文件写盘时**未实施、未测试、未验收**（产品/测试工作区零改动；未安装 `node_modules`、未启用 task_ops）；本文件不声称任何能力已具备。
- 验收报告：**另写 `docs/acceptance/customer-authorization-plane-report-v1.md`，本文件不是报告**。E2 由与 V1 相同的唯一验收主上下文按本文件与统筹变更包判定，结论只能是**通过 / 返工 / 证据不足**。
- 适用变更：仅本任务（`@审批`/`@决策` 客户授权平面）。提交/推送/合并/发布不在本文件判定范围，且均未授权。

---

## 一、基线、版本冻结与范围

### 1.1 客户确认链与冻结版本

| 项 | 状态 | 记录与版本 |
| --- | --- | --- |
| 闸门 0：意图确认 | **已确认（2026-11-03）** | 沟通记录「闸门 0 确认记录」；客户原话「确认闸门 0，现在就在新 worktree 立项开发两个标记。」；两个独立标记、只在输入框开头识别、命中不投幕僚、应用级 IPC、`customer.directive` 同一账本两个 target、分开面板/回执、不做 `@边界`、高危二次确认、不得授权代码/角色卡/边界、不得跨判断器 |
| 闸门 1：方案确认 | **已确认（2026-11-03）** | 沟通记录「闸门 1 确认记录」：客户选择卡作答「确认 P1.1」；**Q5 = A（仅 shell；联网/外部目录仅记录、面板标注「暂无消费者」）**；**Q9 = A（审计枚举扩展 `"directive"` + `directiveId`）**；Q1–Q10 其余按推荐 A；**O1–O11 选装均不实施**。方案 P1.1 **1199 行 / `7875ad6a…`** 为唯一实施与验收基线 |
| 闸门 2：角色指派/写集/边界/档位/顺序/验收安排/证据口径 | **已确认（2026-11-03）** | 沟通记录「闸门 2 确认记录」：客户选择卡作答「确认闸门 2」；团队计划 v1 **653 行 / `37e6bd0d…`**；参与/不参与角色、精确写集、B-1..B-4、T3、阶段顺序、V1/E2 安排、证据口径、基线 rebase 条件 |
| 客户实施授权（IA） | **已给（2026-11-03）** | 沟通记录「实施授权记录」：客户选择卡作答「同时授权实施」；按团队计划 v1 与方案 P1.1 从 H1/V1/B0/P1 开始逐阶段实施；**不含提交、推送、合并、发布** |
| 本验收标准（V1） | **实施前写盘并冻结（2026-11-03）** | 本文件 v1；实施开始前由沟通确认路径/版本 |

本文件的验收基线是客户在闸门 1 确认的**方案 P1.1 的 AC-1..AC-24 与相关正文**，上位依据是闸门 0 意图；闸门 2 确认的团队计划只作范围、写集、阶段、证据口径与 N/A 依据。方案/团队计划文件头的历史状态字样（写于确认之前）不作为判定依据，以 `docs/communication/` 的确认记录与冻结哈希为准（见 §九.1/§九.2）。

### 1.2 版本冻结与变更规则

- 本文件在实施开始前冻结为 **v1**；实施开始后，不得为迁就候选而改写标准、放宽或加严实质。
- 确需变更标准（客户改变范围、方案实质变更、发现标准本身不可执行/自相矛盾）时：递增版本（v2…）、记录理由与受影响条目、交沟通/统筹确认，并重新核对受影响证据；未确认前仍按 v1 判定。
- 候选变化不改变标准；只使该候选上的证据失效，需按本文件重取。
- **R1/R2 文字收口（团队计划 §1.5）**：团队计划载明 R1（`directivesEnabled` 能力位应明确属基础实现、O9 只加 env 分支）与 R2（AC-13 高危子句以 Q7 A 为前提）由策划作者在实施前做**文字收口（下一版/编辑性，不改语义）**，V1 与实施引用收口后的文本与新哈希。本文件当前以 P1.1（`7875ad6a…`）为基线；收口产生新版本后，本文件以**版本注记**（v1.1，不改任何 AC 标准文本）引用新哈希；若收口改变语义，属方案实质变更，**重开闸门 1**，本文件按受影响条目递增版本。
- 本文件不是验收结论，也不是实施授权；任何通过/返工/证据不足结论只写在 `docs/acceptance/customer-authorization-plane-report-v1.md`。
- 方案实质变更（例如改变 target/期限/消费者优先级/账本位置、启用任一 O 项、改变 Q5/Q9 结论、扩大写集/边界）按团队计划 §1.5/§10.3 重开闸门 1/2；本文件随之重判，不自行放行。

### 1.2.1 版本注记：P1.2 编辑性收口（2026-11-03）

- **P1.2**：`docs/planning/2026-11-03_design_customer-authorization-plane.md`，**1209 行 / SHA-256 `1748ad2d095ec0704e6ed4156f968fee8ca7e244db35e10ed0a0cead3216d688`**（写本注记时实测）。**P1.1（1199 行 / `7875ad6a…`）仍是闸门 1 客户确认版**；复核记录未改（132 行 / `d2588445…`）。
- **P1.2 仅两处编辑性改动（不改语义）**：①§3.3 第 7 步/§9.5/O9 写明 `directivesEnabled` 的 `true` 推送与项目切换/重载重推属**基础实现**，O9 只增加由 env 控制 `false` 的分支；O9 未选时该位恒 `true`，§3.3 第 7 步的条件来源即该基础能力位（R1）；②AC-13 高危子句加「（Q7 A 时）」并注明 Q7 选 B 时该组合不适用、本条不要求，与 §13 Q7 既有说明联动（R2）。
- **语义等价结论**：AC-1–AC-24 的实质标准不变；不改变高危谓词、AC 断言、Q7 选项、开关默认、O9 可选性或任何行为；闸门 1 已确认的 Q5 A、Q9 A、Q1–Q10 其余 A、O1–O11 不实施不变。本文件 AC-1..AC-24 的引文仍为 P1.1 确认文本；AC-13 的判定口径已注明 Q7 A 前提，与 P1.2 的「（Q7 A 时）」一致，无需改动标准。
- **E2 基线**：以「**P1.1 闸门 1 确认版（1199 行 / `7875ad6a…`）+ P1.2 等价映射（1209 行 / `1748ad2d…`）**」为基线，验收报告同时引用两个哈希；若两者出现文本冲突，以 P1.1 闸门 1 确认文本为准，P1.2 仅作 R1/R2 澄清。若后续发现 P1.2 改变语义，按 §1.2 重开闸门 1 并递增本文件版本。

### 1.3 本轮范围、已确认默认项与未选实施项

**闸门 1 已确认的默认项（不重开）**：

- **Q1 A**：主进程 `Interface.sendSession` 权威识别 + 共享纯解析器；渲染侧只用同一函数做回显抑制。
- **Q2 A**：独立账本 `.ans/state/customer-directives.jsonl`（**连字符**；不是任务描述中的 `customer.directives.jsonl`，见团队计划 §10.3 第 1 项）。
- **Q3 A**：`once`/`session`/`forever`；`session` = 本次应用运行；**未被使用的 `once` 也随本次应用运行结束失效**（`expired(unused-once)`）。
- **Q4 A**：`@边界` 按普通聊天投递 + 一次性提示「请用 `@审批` / `@决策`」，不做隐藏解析。
- **Q5 A**：本轮 `@审批` 只对 shell 命令生效；`domain`/`path` 只记录、不生效，面板/回执如实标注「暂无消费者」。
- **Q6 A**：决策消费者只做确定性精确匹配；不匹配/冲突回落客户卡。
- **Q7 A**：客户指令是明确指示，独立于两个常驻开关生效；开关只决定无指令时的默认推荐/judge 行为。
- **Q8 A**：高危 = 风险横幅 + 必勾选复选框 + 主进程复核。
- **Q9 A**：`request.resolved.by`/`version.decision.decidedBy`/run manifest `decidedBy` 扩展 `"directive"` 并记 `directiveId`；逐点更新旧读者。
- **Q10 A**：独立指令面板（审批/决策两个逻辑面板）+ 提交确认模态。
- **O1–O11 全部不实施**：不新增联网域名审批消费者、不新增外部目录审批消费者、不做模型解释、不做 `until=<时长/日期>`、不做英文/别名/全角标记、不做角色级审批范围、不做面板搜索/导出、不做 `@边界` 迁移引导、不做整体回滚开关 `ANS_CUSTOMER_DIRECTIVES_DISABLED`、不做结构性禁止 shell 读取 `.ans`、不做随机后缀 ID。

**`not applicable` 的使用限制（本文件）**：

- 只允许 **AC-23 整体**（O9 未选）与 **AC-24 的 O11 子句**（O11 未选）判 `not applicable`；依据必须写明闸门 1 确认记录与团队计划 §7.1。
- 其余任何 AC **不得**用 `not applicable` 规避：缺少证据就是 `insufficient evidence`，不满足标准就是 `fail`。
- `not applicable` 不代表该领域免检：AC-23 N/A 不豁免 §3.3 第 7 步的基础能力位 `directivesEnabled`（主进程推送 `true`、项目切换重推、渲染侧据此抑制气泡；团队计划 §10.2 第 7 项/R1），该基础行为由 AC-1/AC-2/AC-22 的真实运行与 UI 证据覆盖；若实施 O9（未选），属范围外改动，按 AC-20 判 `fail`，不能反过来用 AC-23 判 `pass`。
- AC-24 只有「若 O11 被选，`d-<seq>-<4hex>` 跨重置不重号」子句 N/A；「若 O11 未选，风险如实披露 + 面板以 `(id, createdAt)` 展示」子句**仍适用**，不得整条 N/A。
- 其它 O 项（O1–O8、O10）不是 AC 条目，但受 AC-20 非目标核对约束：实施任一未选项即范围外改动，AC-20 判 `fail`。

### 1.4 写标准时的只读基线与输入哈希

| 检查 | 命令 | 结果（2026-11-03 写标准时实测） |
| --- | --- | --- |
| 分支 / HEAD（写标准开始） | `git rev-parse HEAD` | `feat/customer-authorization-plane` / `243d8f6a6db663a383b516aad6320c5110c7f583` |
| 分支 / HEAD（写标准结束，并发变化） | `git rev-parse HEAD` / `git rev-parse origin/main` | **`4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0` / 同一提交**；`git merge-base HEAD origin/main` 同为 `4c3a6e40`，`origin/main..HEAD` 与 `HEAD..origin/main` 均为 0。**这是团队计划 §八 的基线 rebase 步骤由他方并发执行（非本验收写入）**；写标准期间 HEAD 从 `243d8f6` 更新到 `origin/main`，产品/测试零改动 |
| 工作树（写标准时） | `git status --porcelain` | `M docs/scheduling/memo.md` + 4 份未跟踪管理文档（communication/planning 方案/planning 复核/team-plan）；**无 `src/`/`app/`/`test/` 改动**；本文件写盘后再增加 1 份未跟踪验收文档 |
| 暂存区 | `git diff --cached --name-only` | 空（未暂存） |
| 方案 P1.1 | `sha256sum` / `wc -l` | `7875ad6afd0331b658b99028bb3674096feede674165d56a6f3ac2fd1b74c229` / **1199 行**（与闸门 1 记录一致） |
| 复核记录 | 同上 | `d258844527c382aeb1b575f9f0401a87422d557acc94fe2ea181924c6b5aa1b3` / **132 行** |
| 团队计划 v1 | 同上 | `37e6bd0dcf63a29fde654ded9a1425272692b95483bab5c276cbdd16f4122fe3` / **653 行** |
| 沟通记录（当前） | 同上 | `e0b89c2645f7119241ca8d88b4c60f84ea782b6ba79b361a6e0b19d1ee85374f` / **120 行**（含闸门 2 与实施授权记录）。方案头引用的 69 行 / `91d77bb8…`（闸门 1 前）与团队计划头引用的 89 行 / `f3755b02…`（闸门 2 前）是历史快照，不混用 |
| Node / npm | `node --version` / `npm --version` | `v24.22.1` / `11.19.1`（写标准时可用；实施/取证仍须记录实测版本） |
| 依赖 | `ls -d node_modules` | **不存在**；B0 前须安装依赖（`node_modules` 为忽略产物）或如实记录不可用；未安装前不把任何测试声明为已跑 |
| 任务配置 | `ls .ans` | **不存在 `.ans/`，无 `.ans/project.json`**；未启用 task_ops |
| 既有排除项 | `ls test/pi-adapter/write-sequencing.test.ts` | 存在；仅按 B0 记录的理由沿用排除，**不新增排除/skip** |
| 项目规则 | `ls 角色卡/项目管理/docs/project-rules.md` | 存在；静态门按其中已确认条目核对，不虚构新规则 |
| 远程基线 | `git rev-parse origin/main` | `4c3a6e40b469a9fbe8be0dcf96ff4199221b96a0`（已含 PR #38/#39/#40；团队计划 §八实测一致） |
| Electron 夹具 | `test/桌面应用/e2e/main.mjs` | 存在（团队计划 §1.4 记录 232942 bytes；实施时以实际哈希为准） |

以上只读核对用于确认基线与约束；本文件写盘未改方案、计划、沟通记录、角色卡、边界、产品源码或测试，也未启动应用、未运行实施测试。

### 1.5 本文件不产生的授权

本文件不授权提交、推送、合并、发布，不授权派发 worker，不授权修改写集、边界或档位，不授权启动应用做「已验收」声明。实施仍按闸门 2 确认的写集与团队计划阶段执行；B-1..B-4 边界条目由人事按闸门 2 执行（本文件写盘时尚未落地，见 §九.5）。

---

## 二、判定口径与证据规则

### 2.1 四种判断与验收表

每条验收项（AC）只能判：

| 判断 | 含义 |
| --- | --- |
| `pass` | 当前候选满足该条标准，证据为该候选的原始、可复算证据 |
| `fail` | 已有证据表明不满足标准，或证据显示以弱化断言/超范围改动/绕过标准达到表面通过 |
| `insufficient evidence` | 缺少必要证据、证据属于另一候选/另一输入、无法复算、只给摘要、只凭自述，或关键结论无法成立 |
| `not applicable` | 该条（或该子句）对本轮范围不适用；**必须写明依据**，且仅限 §1.3 列明的情形 |

验收报告 `docs/acceptance/customer-authorization-plane-report-v1.md` 的核心是逐项验收表，列至少为：

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-1–AC-24 | 对应本文件条目与 P1.1 §10.2 | 本文件要求的最低证据 | 原始输出/截图/JSONL/哈希路径 | E1 候选快照（`git hash-object` + `sha256sum`；实际 HEAD） | 运行时核心/项目管理/编排/桌面窗口/桌面UI/测试/统筹 | 实际观察摘要 | pass/fail/insufficient evidence/not applicable |

**候选标识（E1 变更包候选快照）**：E1 `docs/scheduling/customer-authorization-plane-change-v1.md` 必须冻结候选：产品/测试逐文件 `git hash-object` + `sha256sum`、候选路径清单、实际实施基线 HEAD（rebase 后）、候选树哈希（如提供）、rebase 前后 HEAD 与冲突/重跑记录。每条 AC 的证据必须绑定该快照；E2 逐项核对证据哈希与 E1 一致；候选不一致按 `insufficient evidence` 处理。

### 2.2 行为证据原则（不得以「字段齐全」代替实际行为）

- 文件存在、字段名齐全、测试文件存在、key 数量对，**只是必要条件，不是通过依据**。每条必须观察实际行为：解析结果、是否调用 `SessionManager.send`/`handle.send`、是否产生角色轮次/用户消息、面板实际字段与确认可用性、账本事件、消费者实际放行/拒绝/代选、审计归属、重启/项目切换后的状态、真实渲染截图。
- 开发者自述、测试角色转述、工具「成功」、计划文字、截图缩略图、摘要，都不算原始证据；验收读取原始命令输出、文件哈希、diff/status、集成输出、账本/审计 JSONL、真实运行截图。
- 不得用「只跑了单测」代替跨层集成或真实运行；不得用「代码看起来已调用」代替实际行为；不得用「只测了一个入口」代替两个消费者/两个 target 的负例。
- 不得修改断言以保绿；不得跳过失败用例或把 `skip`/`todo` 计为通过；不得把失败归为「环境问题」而不做 B0 对照与分类。
- **客户可见面（识别/面板/回执/高危/撤销/重启失效/决策代选）必须由当前候选真实运行的截图/记录佐证**；单测只能作辅助（AC-1/AC-3/AC-5/AC-18 明确要求）。

### 2.3 「证据不足」判定口径（不弱化）

出现下列任一情形，对应 AC 判 `insufficient evidence`，不得判 `pass`：

1. 缺少该 AC「所需证据」中的任何一项原始输出/文件（只给摘要、转述、截图缩略图、口头自述）。
2. 证据与候选不匹配：文件哈希/diff 无法复算，或证据来自另一候选、另一 HEAD、另一输入/夹具；E1 候选快照与工作区不一致。
3. 该 AC 明确要求真实运行/截图/账本样例/审计样例，而只提供了单元测试或模拟输出。
4. 截图缺少候选版本、sha256、拍摄命令/窗口尺寸，或未关闭 DEBUG 覆盖层，或不是当前候选真实运行。**缺少录屏不构成 `fail` 或 `insufficient evidence`**（不得要求或提供录屏）。
5. 真实 Electron 因环境不可用无法执行，且没有该 AC 允许的等价证据；记录环境边界仍不能判 `pass`。
6. 账本/审计样例缺失或不完整（例如只有 `directive.created`，没有 consumed/revoked/expired；或 Q9 四处归属缺一处），或审计缺失被当作判定正确。
7. B0 基线未记录或失败未分类，导致无法区分既有环境失败（Windows symlink EPERM 等）与本次新增失败。
8. 只覆盖 AC 的部分路径/场景（例如只测 approval、不测 decision；只测精确命中、不测近失配；只测冲突、不测不匹配），且未说明缺口。
9. T3 全量回归未执行或只执行部分套件，或新增 skip 无理由。
10. 证据自相矛盾或无法复现（同一命令/夹具两次结果不一致且未定位）。
11. 以「代码阅读」代替本应执行的检查（例如声称识别规则正确但无解析器真值表输出；声称面板确认禁用但无 UI 测试/截图）。
12. `not applicable` 未写明依据，或用于 §1.3 未列明的情形。
13. 消费者重测缺失（`src/model/runtime.ts`/`project-state.ts`、`src/common/shared/jsonl-ledger.ts`、shared i18n、shell gate/decision 卡路径的实际消费方未按 T3 重测）。
14. 使用其他变更（i18n/目录授权/发布/`contract-schema-query` 旧证据）的通过结论或证据为本变更背书。
15. 实现/测试自评即验收结论，或实施角色自写验收报告。

**不得放宽的具体禁令**：不以时间紧降档；不以单测替代真实运行截图；不以「工具成功」「全部通过」摘要替代原始输出；不把 `skip`/`todo` 计为 pass；不因缺少录屏扣分。

### 2.4 截图与真实运行证据规则

- **最多截图，不得要求或提供录屏/屏幕录像作为验收要求或选项**；缺少录屏不构成 `fail` 或 `insufficient evidence`。
- 截图必须来自**当前候选的真实运行**（真实 Electron、临时 userData、真实 build），**关闭 DEBUG 覆盖层**，并记录：截图 SHA-256、候选版本/候选哈希、拍摄命令/复现步骤、窗口尺寸（必要时 zoom）。
- 截图覆盖按 §4.6 D2 矩阵与 AC-1/AC-3/AC-5/AC-18；日志、校验输出、账本/审计 JSONL、哈希可作辅助证据；截图与日志必须绑定同一候选。
- 多引擎边界按团队计划 §10.2 第 9 项：至少默认/一个真实引擎；其余以共享通道测试 + 账本/审计样例覆盖，缺口如实写入证据与报告；**AC-1/AC-3/AC-5/AC-18 的真实截图不得全部以共享通道测试替代**。

### 2.5 T3 与全量回归口径

- 按 `references/testing.md` 的唯一定义，本变更 T3：受影响角色层测试 + 跨角色集成 + **全量适用回归** + 双端 typecheck + `build:renderer` + 方案要求的真实运行截图。
- 全量回归命令：`node --test --test-concurrency=1` 覆盖 B0 记录的全量适用套件（若以文件清单执行，须记录清单生成命令与清单哈希）；**既有排除仅 `test/pi-adapter/write-sequencing.test.ts`**，排除理由按 B0 记录沿用（历史串行写测试），不得新增排除。
- 记录命令、环境（Node/npm、OS/Shell）、计数（pass/fail/skip/todo）、失败原文、执行时间；与 B0 基线逐名分类；**既有 Windows symlink EPERM 等环境失败按 B0 逐名对应，不计新增；新增确定性失败 = 0、新增 skip = 0**；不得把新增红归为环境。
- 消费者重测（T3）：`src/model/runtime.ts`/`project-state.ts` 的实际消费方；`src/common/shared/jsonl-ledger.ts` 的两个消费方（`task-state.ts` 与 directive Provider，若采用共享辅助 A）；shared i18n 消费方；shell gate/decision 卡路径的实际调用方。清单与结果写入 E1。
- 全量回归仅在 T3 或证据不足时要求；本任务为 T3，不适用「T2 不全量」豁免。升档不降档。

### 2.6 候选隔离与管理记录

- 本变更候选只列相对实施基线变化的 `app/`、`src/`、`test/` 路径（按闸门 2 确认的写集/边界条目 B-1..B-4）；管理记录（`docs/planning/`、`docs/scheduling/`、`docs/communication/`、`docs/acceptance/`）与角色卡 `docs/change/` 证据目录不混入产品候选。
- 候选隔离：实施前若出现并发写同一文件（团队计划 §10.1 第 14 项），按候选不可复算处理；不得把他人改动算入本候选，也不得用混入候选的证据判 `pass`。
- `app/renderer/dist/` 为忽略产物、非候选（团队计划 §九）。
- H1 的 B-1..B-4 边界条目属治理产物，不是产品候选；E2 单独核对边界 diff 与闸门 2 一致。

### 2.7 无 task_ops

本项目没有 `.ans/project.json` 任务配置，未启用 task_ops（团队计划 §1.4/§九）。取证以文件哈希、原始命令输出、diff/status、跨层集成输出、真实 Electron 截图、账本/审计 JSONL 为准；**不得伪造任务令牌、锁、审批、机器预检或 `docs/verification/` 记录**。

---

## 三、验收项（AC-1..AC-24）

### 3.0 总表

| AC | P1.1 §10.2 主题 | 最低证据（摘要） | 产出角色 | N/A |
| --- | --- | --- | --- | --- |
| AC-1 | 识别规则全部通过 | 解析器单测 + 输入夹具 + 面板测试/截图 + D2 | 运行时核心、桌面窗口、桌面UI、测试 | 不允许 |
| AC-2 | 命中不投递、未命中零变化 | 调用计数/诊断 + 集成测试 + diff + D2 | 桌面窗口、测试 | 不允许 |
| AC-3 | 面板字段/预填/确认禁用 | UI 测试 + 截图 + IPC 载荷 + D2 | 桌面UI、桌面窗口、测试 | 不允许 |
| AC-4 | 取消/关窗/不可用/写失败 | 集成测试 + 故障注入 | 桌面窗口、桌面UI、测试 | 不允许 |
| AC-5 | 回执精确/durable/不含原文/不进模型 | i18n 快照 + 集成 + 截图 + D2 | 项目管理、桌面窗口、桌面UI、测试 | 不允许 |
| AC-6 | 账本 schema/ID/轮转/坏行/幂等 | Provider/Service 单测 + 账本样例 | 运行时核心、编排、测试 | 不允许 |
| AC-7 | target 隔离 | 类型负例 + 过滤测试 + 提示词快照 | 运行时核心、编排、桌面窗口、测试 | 不允许 |
| AC-8 | 审批 allow/once/硬地板 | gate 单测/集成 + 审计 + D2 | 编排、测试 | 不允许 |
| AC-9 | 审批 deny/顺序/不翻案 | gate 配置矩阵 | 编排、测试 | 不允许 |
| AC-10 | 决策规则/冲突/默认推荐绕行/Q9 四处 | 消费者单测/集成 + 四处断言 + D2 | 桌面窗口、编排、运行时核心、项目管理、测试 | 不允许 |
| AC-11 | 期限/重启失效/分组 | 状态机 + 重启 + 面板截图 + D2 | 编排、桌面窗口、桌面UI、测试 | 不允许 |
| AC-12 | 撤销/同 target/状态 | 集成 + 账本审计 + D2 | 编排、桌面窗口、测试 | 不允许 |
| AC-13 | 高危谓词/主进程复核/Q7 A 子句 | 真值表 + 复核测试 + 截图 + D2 | 运行时核心、桌面窗口、桌面UI、测试 | 不允许 |
| AC-14 | 不授权代码/角色卡/边界 | 结构检查 + gate/decision 测试 | 运行时核心、编排、桌面窗口、测试 | 不允许 |
| AC-15 | 回归/旧读者逐点核对 | 受影响测试 + T3 全量 + 四处断言 | 桌面窗口、编排、各实施角色、测试 | 不允许 |
| AC-16 | 坏账本/主路径不受阻 | 故障注入 + D2 | 编排、桌面窗口、测试 | 不允许 |
| AC-17 | i18n 中英成对/无硬编码 | i18n 测试 + 键检查 + 截图 | 项目管理、桌面UI、测试 | 不允许 |
| AC-18 | T3 证据/截图/如实状态 | E1 变更包 + 全量回归 + 截图元数据 | 统筹、测试、桌面窗口、桌面UI、独立验收 | 不允许 |
| AC-19 | 与 `contract-schema-query` 重叠处理 | 分支/合并记录 + 证据重跑 | 统筹、运行时核心、桌面窗口、测试 | 不允许 |
| AC-20 | 非目标核对 | 结构/文本检查 + 范围清单 | 统筹、独立验收、各角色 diff | 不允许 |
| AC-21 | 闸门 1 单独决定 Q5/Q9 | 闸门 1 材料 + 客户原话 | 沟通、独立验收 | 不允许 |
| AC-22 | 面板共存/项目切换 | 集成/UI 测试 + 截图 + D2 | 桌面窗口、桌面UI、测试 | 不允许 |
| AC-23 | O9 回滚开关 | 无（O9 未选） | 独立验收（依据记录） | **整体 N/A** |
| AC-24 | 账本重置/ID 重号披露 | 单测 + 面板/审计快照 | 编排、桌面窗口、测试、独立验收 | **仅 O11 子句 N/A** |

### 3.1 AC-1 识别规则（P1.1 §10.2）

**方案标准原文（不弱化）**

> §3.1 识别规则全部通过：前导空白/空行、标记后空白边界、多行、`@审批员`/`@决策X`/正文中标记/全角 `＠`/`@边界` 不命中；空正文打开面板且确认禁用；带图标记输入明确拒绝

**所需证据（最低）**

- 解析器真值表：§3.1 全部示例（命中/不命中）、近失配（`@审批员`、`@审批-允许`、`@审批，允许`、`@决策X`）、正文中标记、全角 `＠`、`@边界`、前导空白/空行/多行、空正文。
- 输入夹具清单（每个示例一条）与解析结果原始输出。
- 桌面窗口拦截测试：命中/空正文/带图；带图命中返回明确错误且不投递、不落账。
- 桌面UI 测试/截图：空正文面板字段留空、确认禁用。
- D2 真实运行：至少一条命中路径、一条近失配普通投递、一条空正文面板、一条带图拒绝（§4.6）。

**证据路径（计划）**

- `角色卡/运行时核心/docs/change/<task>-evidence/`（解析器测试日志、夹具清单）
- `角色卡/桌面窗口/docs/change/<task>-evidence/`（拦截测试日志）
- `角色卡/桌面UI/docs/change/<task>-evidence/`（UI 测试日志 + 截图组）
- `角色卡/测试/docs/change/<task>-evidence/`（D2 运行记录与截图清单）
- E1 变更包汇总实际路径与哈希。

**产出角色**：运行时核心（A1）、桌面窗口（C1）、桌面UI（C2）、测试（D2）。

**候选标识**：E1 变更包候选快照（本 AC 证据所引文件逐文件 `git hash-object` + `sha256sum`；实际 HEAD）。

**判定口径**

- `pass`：全部示例与负例按 §3.1 结果；空正文打开面板且确认禁用；带图命中明确拒绝且无投递/落账；证据绑定当前候选。
- `fail`：任一近失配/正文中/全角/`@边界` 被识别为指令；空正文静默忽略；带图输入被投递或落账；识别只存在于渲染侧而主进程未拦截。
- `insufficient evidence`：只覆盖部分示例；无面板截图/UI 证据；只凭代码阅读。
- `not applicable`：不允许。

### 3.2 AC-2 命中不投递、未命中零变化（P1.1 §10.2）

**方案标准原文（不弱化）**

> 命中标记时**不调用** `SessionManager.send`/`handle.send`：无角色轮次、无 `lastUserText` 变化、无 `session:events` 用户消息；未命中输入与现状逐字一致

**所需证据（最低）**

- 桌面窗口集成测试/诊断：命中断言 `SessionManager.send`/`handle.send` 调用次数为 0；无角色轮次；`lastUserText` 不变；无 `session:events` 用户消息。
- 未命中路径 diff/测试：`session:send` 调用参数、顺序、图片校验、metadata、队列与 ACK 与现状一致。
- 跨层集成输出（`test/测试/`）。
- D2 真实运行：命中时输入框不出现「发给幕僚」用户气泡；未命中普通消息正常投递（§4.6）。

**证据路径（计划）**

- `角色卡/桌面窗口/docs/change/<task>-evidence/`（调用计数/诊断日志、集成测试）
- `角色卡/测试/docs/change/<task>-evidence/`（跨层集成、D2）
- E1 变更包。

**产出角色**：桌面窗口（C1）、测试（D1/D2）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：命中路径有调用计数/诊断证明 0 次 `send`/`handle.send`、无轮次/`lastUserText`/用户消息；未命中路径逐字不变；D2 无气泡且普通消息正常。
- `fail`：命中仍产生角色轮次/用户消息/`lastUserText` 变化；未命中行为改变；仅渲染侧拦截而主进程仍投递。
- `insufficient evidence`：只有单测；无调用计数/诊断；无 D2 截图。
- `not applicable`：不允许。

### 3.3 AC-3 面板字段与确认禁用（P1.1 §10.2）

**方案标准原文（不弱化）**

> 面板显示原文、动作、范围、资源、期限；解析不确定时字段留空并列出未识别片段；确认禁用直到字段有效

**所需证据（最低）**

- 桌面UI 测试：字段（原文/动作/范围/资源/期限）与预填；解析不确定时字段留空并列出未识别片段；确认按钮禁用直到字段有效。
- 截图：面板实际渲染（AC-18 规则）。
- 桌面窗口 IPC 载荷：面板请求字段与主进程校验。
- D2：面板截图（含空正文/未识别片段场景，§4.6）。

**证据路径（计划）**

- `角色卡/桌面UI/docs/change/<task>-evidence/`（UI 测试 + 截图）
- `角色卡/桌面窗口/docs/change/<task>-evidence/`（IPC 载荷样例）
- `角色卡/测试/docs/change/<task>-evidence/`（D2）
- E1 变更包。

**产出角色**：桌面UI（C2）、桌面窗口（C1）、测试（D2）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：五类字段实际显示；不确定时留空并列出片段；确认禁用；截图绑定当前候选。
- `fail`：字段缺失或猜测填充；确认在字段无效时可用；原文不可见；面板不可操作。
- `insufficient evidence`：无截图；只有 DOM/快照而无实际面板行为；IPC 载荷与渲染不一致未说明。
- `not applicable`：不允许。

### 3.4 AC-4 取消/关窗/不可用/写盘失败（P1.1 §10.2）

**方案标准原文（不弱化）**

> 取消/关窗/面板不可用/账本写失败：不落账、不投递、无“已记录”回执；原文回草稿；窗口关闭时未决面板全部取消

**所需证据（最低）**

- 集成/桌面窗口测试：取消、关窗、面板不可用、账本写失败四条路径；断言无账本事件、无投递、无「已记录」回执、原文回草稿；关窗时未决面板全部取消（`rejectAllPending` 类语义）。
- 故障注入：写盘失败与 presenter 不可用的原始输出。
- 跨层集成输出。
- 截图非强制；若提供按 §2.4 规则。

**证据路径（计划）**

- `角色卡/桌面窗口/docs/change/<task>-evidence/`
- `角色卡/桌面UI/docs/change/<task>-evidence/`
- `角色卡/测试/docs/change/<task>-evidence/`
- E1 变更包。

**产出角色**：桌面窗口（C1）、桌面UI（C2）、测试（D1）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：四条路径均不落账、不投递、无假回执；原文回草稿；关窗全部取消。
- `fail`：任一失败路径产生回执/账本事件/投递；原文丢失；关窗后仍有未决面板；失败回退为发给幕僚。
- `insufficient evidence`：只测取消、不测写失败/关窗；故障未注入；只有代码阅读。
- `not applicable`：不允许。

### 3.5 AC-5 回执（P1.1 §10.2）

**方案标准原文（不弱化）**

> 回执精确为「已记录审批指令 #d-N」「已记录决策指令 #d-N」/「已撤销审批指令 #d-N」「已撤销决策指令 #d-N」；只在 durable 追加成功后出现；不含原文全文；不进模型上下文

**所需证据（最低）**

- i18n 快照/断言：四条回执精确模板（zh-CN/en-US 成对；AC-17 交叉）。
- 集成测试：回执仅在账本 durable 追加成功后出现；写失败无回执；回执不含原文全文；回执为系统行、不是模型消息、不进模型上下文。
- 截图：回执实际渲染（AC-18 规则）。
- D2：创建/撤销回执（§4.6）。

**证据路径（计划）**

- `角色卡/项目管理/docs/change/<task>-evidence/`（i18n 快照）
- `角色卡/桌面窗口/docs/change/<task>-evidence/`（回执集成/系统行）
- `角色卡/桌面UI/docs/change/<task>-evidence/`（截图）
- `角色卡/测试/docs/change/<task>-evidence/`（D2）
- E1 变更包。

**产出角色**：项目管理（A3）、桌面窗口（C1）、桌面UI（C2）、测试（D2）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：四条回执逐字匹配；durable 成功后才出现；无原文全文；无模型消息/上下文注入；截图与日志绑定当前候选。
- `fail`：文案不符（包括 `#d-N` 形式错误）；写失败仍回执；回执带原文；回执进入模型消息/上下文。
- `insufficient evidence`：只有文案字符串检查、无实际回执运行；无截图；只有单测。
- `not applicable`：不允许。

### 3.6 AC-6 账本 schema/ID/轮转/坏行/幂等（P1.1 §10.2）

**方案标准原文（不弱化）**

> 账本路径/事件 schema/ID `d-<seq>`/target/until/seq 单调/版本/轮转/未知事件忽略/坏行计数/ID 幂等全部符合 §5

**所需证据（最低）**

- 账本路径：`.ans/state/customer-directives.jsonl`（连字符）。
- Provider/Service 单测：追加/回放/轮转（旧→新）/坏行计数/未知事件忽略/未知字段忽略/`version>1` 不可用/`seq` 单调与 max+1 分配/`d-<seq>` ID/target/until 约束/幂等。
- Model schema 类型与字段约束检查（A1）。
- 账本样例：`created/consumed/revoked/expired` 事件、`d-<seq>`、`target`、`sessionId`、`highRisk`、坏行/轮转样例（路径 + SHA-256）。
- 跨层集成输出（D1）。

**证据路径（计划）**

- `角色卡/运行时核心/docs/change/<task>-evidence/`（schema/契约测试）
- `角色卡/编排/docs/change/<task>-evidence/`（Provider/Service 测试、账本样例）
- `角色卡/测试/docs/change/<task>-evidence/`（集成）
- E1 变更包。

**产出角色**：运行时核心（A1）、编排（B1）、测试（D1）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：路径/事件/ID/seq/版本/轮转/坏行/幂等全部符合 §5；样例来自当前候选。
- `fail`：使用点号路径或混入 `tasks.jsonl`；ID 形式不符；`seq` 倒退/重复；`version>1` 被接受；轮转读取顺序错误；坏行不计数；幂等破坏。
- `insufficient evidence`：只有 schema 文件、无 Provider/Service 行为测试；无账本样例；样例来自另一候选。
- `not applicable`：不允许。

### 3.7 AC-7 target 隔离（P1.1 §10.2）

**方案标准原文（不弱化）**

> 目标隔离：approval 快照不含 decision；decision 快照不含 approval；跨 target 撤销被拒；shell judge/decision facts 提示词不含另一 target；伪造跨 target 记录被丢弃

**所需证据（最低）**

- 运行时核心：`ApprovalDirectiveFact`/`DecisionDirectiveFact` 类型分离；编译期负例（I-1）。
- 编排：`approvalFacts()`/`decisionFacts()` 只返回本 target；运行时再过滤（I-2/I-3）；伪造跨 target 记录被丢弃并记诊断。
- 桌面窗口：decision 消费者只读 decision。
- 提示词快照（I-4）：`ShellJudgeRequest` 无 decision 字段；decision facts（若 O3，未实施）无 approval 字段；快照不含另一 target 的 id/原文。
- 跨 target 撤销被拒且账本无事件（I-5）。
- 跨层集成输出（D1）。

**证据路径（计划）**

- `角色卡/运行时核心/docs/change/<task>-evidence/`（类型负例/契约测试）
- `角色卡/编排/docs/change/<task>-evidence/`（target 过滤/伪造记录测试）
- `角色卡/桌面窗口/docs/change/<task>-evidence/`（decision facts 消费）
- `角色卡/测试/docs/change/<task>-evidence/`（提示词快照/集成）
- E1 变更包。

**产出角色**：运行时核心、编排、桌面窗口、测试。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：两个快照互不含对方；跨 target 撤销返回明确错误且无事件；提示词快照不含另一 target；伪造记录被丢弃。
- `fail`：任一快照跨 target；跨 target 撤销成功；提示词出现另一 target 的 id/原文；伪造记录被消费。
- `insufficient evidence`：只测类型、不测运行时过滤；无提示词快照；无伪造注入。
- `not applicable`：不允许。

### 3.8 AC-8 审批 allow/once/硬地板（P1.1 §10.2）

**方案标准原文（不弱化）**

> 审批 allow：精确命令在硬地板之后放行；`once` 消费一次后不再生效；`session` 在本次运行内反复生效；`forever` 持续；`c=allow` 不消费；script 不适用 allow；消费 durable 失败 ⇒ 不放行

**所需证据（最低）**

- gate 单元/集成测试：精确命令（规范化 trim + 折叠空白 + cwd 项目根）在 preblock/write-guard/c=deny/script 之后放行；`once` 原子消费、二次不再生效；`session` 本次运行内反复生效；`forever` 持续；`c=allow` 不消费；script 不适用 allow；消费 durable 失败 ⇒ 不放行（回落既有路径）。
- 审计：`by:"directive:<id>"`、`directive:{id,scope}`（AC-15 交叉）。
- 跨层集成输出（D1）。
- D2：精确命令放行一次、重复执行回正常链（§4.6）。

**证据路径（计划）**

- `角色卡/编排/docs/change/<task>-evidence/`（gate 测试与审计）
- `角色卡/测试/docs/change/<task>-evidence/`（集成/D2）
- E1 变更包。

**产出角色**：编排（B1）、测试（D1/D2）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：上述行为逐项成立；审计来源正确；D2 观察一致。
- `fail`：once 重复放行；session 只一次/跨重启仍生效；forever 失效；c=allow 消费；script 被 allow 指令放行；消费失败仍放行；越过硬地板。
- `insufficient evidence`：只测部分路径；无审计样例；无 D2 时至少 gate 测试与审计齐全，否则不足以支持用户可见结论（D2 缺失按 AC-18 计入）。
- `not applicable`：不允许。

### 3.9 AC-9 审批 deny/顺序/不翻案（P1.1 §10.2）

**方案标准原文（不弱化）**

> 审批 deny：匹配命令被拒绝；**deny 指令先于 `c=allow`**（可拒绝白名单命令）；`c=allow` 只在 **allow 侧**先行（allow 指令不扩大、不消费）；不能翻案 c=deny/preblock/write-guard/readonly/script 上下文失败；deny 指令不误伤其他命令

**所需证据（最低）**

- gate 配置矩阵测试：deny 指令先于 `c=allow`；`c=allow` 只在 allow 侧先行；allow 指令不扩大、不消费；preblock/write-guard/c=deny/readonly/script 上下文失败不可翻案；deny 指令不误伤其他命令；`readonlyOnly` 不注入 `takeDirective`（构造期守卫）。
- 跨层集成输出（D1）。

**证据路径（计划）**

- `角色卡/编排/docs/change/<task>-evidence/`（gate 顺序矩阵、readonly 守卫）
- `角色卡/测试/docs/change/<task>-evidence/`（集成）
- E1 变更包。

**产出角色**：编排（B1）、测试（D1）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：顺序与不翻案逐项成立；deny 不误伤；readonly 不注入。
- `fail`：`c=allow` 覆盖 deny 指令；allow 指令被扩大/消费；任一硬地板被翻案；deny 匹配其他命令；readonly 注入 `takeDirective`。
- `insufficient evidence`：只测单一路径；无配置矩阵；无 readonly 守卫证据。
- `not applicable`：不允许。

### 3.10 AC-10 决策规则/冲突/默认推荐绕行/Q9 四处（P1.1 §10.2）

**方案标准原文（不弱化）**

> 决策：推荐项/选项 id/标签前缀/拒绝（flow/项目）按 §6.2 应用；0/多匹配回落客户卡；冲突与不匹配两条路径都绕过默认推荐（不得让 `tryAutoSelectDecision` 先行）；开关独立性按 Q7；**归属按 Q9 A**：`request.resolved.by`、`version.decision.decidedBy`、run manifest `decidedBy`、UI 文案四处均如实显示 `"directive"`（不是“客户本人点击”、不是 judge）

**所需证据（最低）**

- 决策消费者单测/集成：推荐项（卡内唯一 `recommended:true`）、选项 id、标签规范化/前缀、拒绝（flow/项目）；0/多匹配回落客户卡；冲突与不匹配都绕过 `tryAutoSelectDecision`；开关独立性按 Q7 A（开关关闭时指令仍生效，审计明确「客户指令」）。
- 四处归属断言：`request.resolved.by`、`version.decision.decidedBy`、run manifest `decidedBy`、UI 文案均显示 `"directive"`（或等价「客户指令」），不误记 customer/judge。
- `requirement-change.ts` 旧读者三值映射（AC-15 交叉）。
- 跨层集成输出（D1）。
- D2：`@决策 选推荐项 until=session` 代选与「客户指令，不是客户点击」；冲突/不匹配回落客户卡且不默认代选（§4.6）。

**证据路径（计划）**

- `角色卡/桌面窗口/docs/change/<task>-evidence/`（决策消费者、Q9 桌面读者）
- `角色卡/编排/docs/change/<task>-evidence/`（run manifest/version-decision）
- `角色卡/运行时核心/docs/change/<task>-evidence/`（枚举/类型）
- `角色卡/项目管理/docs/change/<task>-evidence/`（i18n 文案）
- `角色卡/测试/docs/change/<task>-evidence/`（D2）
- E1 变更包。

**产出角色**：桌面窗口（C1）、编排（B1）、运行时核心（A1）、项目管理（A3）、测试（D2）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：四类决策规则按 §6.2；0/多匹配回落；冲突/不匹配绕过默认推荐；Q7 A 独立性成立；四处归属如实。
- `fail`：默认推荐在冲突/不匹配时先行；指令选错选项/错误范围；开关关闭时指令不生效（Q7 A 下）；四处任一处显示 customer/judge；`requirement-change.ts` 误显示。
- `insufficient evidence`：只测推荐项、不测选项/拒绝/冲突/不匹配；四处断言缺一处；无 D2。
- `not applicable`：不允许。

### 3.11 AC-11 期限/重启失效/分组（P1.1 §10.2）

**方案标准原文（不弱化）**

> 期限：`session` 在应用重启后失效；`once` 按 Q3 策略；`forever` 持续；面板状态分组正确；不依赖时钟

**所需证据（最低）**

- 状态机/回放测试：`session` 在应用重启后（`sessionId` 不一致）失效；`once` 按 Q3 A（未使用随本次运行结束失效，`expired(unused-once)`）；`forever` 持续；不依赖时间戳。
- 面板截图：生效中/已消费/已撤销/已失效分组正确。
- D2：重启后 `session` 失效（§4.6）。
- 跨层集成输出（D1）。

**证据路径（计划）**

- `角色卡/编排/docs/change/<task>-evidence/`（状态机/回放）
- `角色卡/桌面窗口/docs/change/<task>-evidence/`（重启路径）
- `角色卡/桌面UI/docs/change/<task>-evidence/`（面板截图）
- `角色卡/测试/docs/change/<task>-evidence/`（D2）
- E1 变更包。

**产出角色**：编排（B1）、桌面窗口（C1）、桌面UI（C2）、测试（D2）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：三种期限行为与 Q3 A 一致；重启失效；面板分组正确；无时钟依赖。
- `fail`：session 跨重启仍生效；once 策略不符；forever 失效；分组错误；以时间戳判定。
- `insufficient evidence`：只测状态机、无重启；无面板截图；无 D2。
- `not applicable`：不允许。

### 3.12 AC-12 撤销（P1.1 §10.2）

**方案标准原文（不弱化）**

> 撤销：仅同 target 的 active 指令可撤销；已消费/已撤销/已失效拒绝；撤销立即影响后续请求；回执正确；账本保留历史

**所需证据（最低）**

- 集成测试：同 target 且 active 才能撤销；已消费/已撤销/已失效拒绝并给出原因；撤销立即影响后续请求；回执正确；账本保留历史（append-only，不删事件）。
- 跨 target 撤销拒绝（AC-7 交叉）。
- 账本审计样例。
- D2：撤销回执与面板移入「已撤销」（§4.6）。

**证据路径（计划）**

- `角色卡/编排/docs/change/<task>-evidence/`
- `角色卡/桌面窗口/docs/change/<task>-evidence/`
- `角色卡/测试/docs/change/<task>-evidence/`
- E1 变更包。

**产出角色**：编排（B1）、桌面窗口（C1）、测试（D2）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：撤销规则逐项成立；立即生效；回执正确；历史保留。
- `fail`：跨 target 可撤销；已消费/已撤销/已失效可撤销；撤销后仍生效；历史被删；回执错误。
- `insufficient evidence`：只测成功撤销；无账本审计；无 D2。
- `not applicable`：不允许。

### 3.13 AC-13 高危（P1.1 §10.2）

**方案标准原文（不弱化）**

> 高危：§4.3 谓词真值表通过；未勾选风险确认的落账被主进程拒绝；渲染侧无法绕过；记录保存 reasons/acknowledged；**开关关闭时的项目级 `select-recommended` 触发高危二次确认（复核未解决意见 ③）**

**所需证据（最低）**

- 高危谓词真值表（运行时核心）：长期（`forever`）、项目级拒绝、项目级选择偏好、通配域名、宽路径、宽命令（shell 元字符）、**Q7 A 下开关关闭时的项目级 `select-recommended`**；非高危示例（精确命令 + once/session、具体域名/目录 + session、开关开启时的项目级 `select-recommended`、单 flow `select-option`）。
- 主进程复核测试：未勾选/未带 `acknowledged:true` 的落账被拒绝；渲染侧无法绕过；账本保存 `highRisk:{reasons, acknowledged:true, acknowledgedAt}`。
- 面板截图：风险横幅 + 复选框 + 确认禁用。
- D2：高危未勾选被拒（§4.6）。
- 跨层集成输出（D1）。
- **Q7 A 前提**：闸门 1 已确认 Q7 A；若客户改变 Q7，按方案重开闸门 1，本子句按变更后版本判定（R2）。

**证据路径（计划）**

- `角色卡/运行时核心/docs/change/<task>-evidence/`（真值表）
- `角色卡/桌面窗口/docs/change/<task>-evidence/`（主进程复核）
- `角色卡/桌面UI/docs/change/<task>-evidence/`（截图）
- `角色卡/测试/docs/change/<task>-evidence/`（D2）
- E1 变更包。

**产出角色**：运行时核心（A1）、桌面窗口（C1）、桌面UI（C2）、测试（D2）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：真值表全部谓词/非高危示例正确；未勾选被拒；渲染侧不可绕过；记录字段完整；Q7 A 子句成立。
- `fail`：任一高危谓词缺失；未勾选仍落账；仅渲染侧拦截；`reasons/acknowledged` 未保存；开关关闭时项目级 `select-recommended` 未触发高危。
- `insufficient evidence`：只测部分谓词；无主进程复核；无截图。
- `not applicable`：不允许（Q7 A 已确认）。

### 3.14 AC-14 不授权代码/角色卡/边界（P1.1 §10.2）

**方案标准原文（不弱化）**

> 不授权代码/角色卡/边界：指令类型无写权目标；越界写命令仍被 write-guard/边界拒绝；指令不能使 proposal/appointment/acceptance 卡自动通过；不能使 `appointment-write` 自动确认

**所需证据（最低）**

- 结构检查：`ApprovalResource` 只有 `shell/domain/path`；`DecisionAction` 只有选择/拒绝；无 `write`/`code`/`role-card`/`boundary` 目标；无新增模型工具/写卡工具。
- gate/decision 测试：越界写命令仍被 write-guard/边界拒绝；指令不能使 proposal/appointment/acceptance 卡自动通过；`appointment-write` 不自动确认（B-4/B-6）。
- 跨层集成输出（D1）。

**证据路径（计划）**

- `角色卡/运行时核心/docs/change/<task>-evidence/`（类型结构检查）
- `角色卡/编排/docs/change/<task>-evidence/`（write-guard/边界）
- `角色卡/桌面窗口/docs/change/<task>-evidence/`（治理卡）
- `角色卡/测试/docs/change/<task>-evidence/`
- E1 变更包。

**产出角色**：运行时核心、编排、桌面窗口、测试。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：类型无写权目标；越界写仍拒绝；治理卡不自动通过；`appointment-write` 不自动确认。
- `fail`：出现写权目标/新工具；越界写被指令放行；proposal/appointment/acceptance 卡自动通过；`appointment-write` 自动确认。
- `insufficient evidence`：只有类型阅读、无行为测试；无越界写负例。
- `not applicable`：不允许。

### 3.15 AC-15 回归/旧读者逐点核对（P1.1 §10.2）

**方案标准原文（不弱化）**

> 回归：无指令时既有 shell 闸/判断器/decision 卡/写盘确认/验收分诊/派发行为不变；旧输入、旧账本、旧记录可读；**Q9 A 归属扩展的旧读者逐点核对**（`session.ts:4165-4197`/`:4469-4470`/`:4657-4690`、`requirement-change.ts:316-318` 等）均不把 directive 误显示为 customer/judge

**所需证据（最低）**

- 受影响角色测试全过：运行时核心、项目管理、编排、桌面窗口、桌面UI。
- **T3 全量回归**原始输出与 B0 分类（§2.5）。
- Q9 旧读者逐点核对：`app/desktop/session.ts` 的 `request.resolved.by`、`decidedByText`、`version.decision.decidedBy` 映射；`app/desktop/requirement-change.ts` 的 `=== "judge"` 读者；`src/common/编排/version-decision.ts`、`run-manifest.ts`、`project-state.ts` 枚举/映射；i18n `ui.versionDecision.decidedBy.*`；`rg` 扫描所有 `by`/`decidedBy`/`=== "judge"` 读者并逐点说明。**行号对应 `243d8f6` 快照；rebase 后以符号名/文本锚点为准（当前实施基线已更新为 `4c3a6e40`，见 §1.4/§九.3）**。
- 旧输入/旧账本/旧记录可读：未命中输入路径不变；旧 `tasks.jsonl` 记录可读；新账本无迁移。
- 无断言弱化（`git diff -U0` + 逐条理由）。

**证据路径（计划）**

- 各角色 `docs/change/<task>-evidence/`（受影响测试）
- `角色卡/测试/docs/change/<task>-evidence/`（T3 全量、B0 对照、消费者重测清单）
- `角色卡/桌面窗口/docs/change/<task>-evidence/`（Q9 旧读者）
- E1 变更包。

**产出角色**：桌面窗口（C1）、编排（B1）、各实施角色（层测试）、测试（T3 全量）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：受影响测试与全量回归符合 B0 分类（新增确定性失败 0、新增 skip 0）；旧读者逐点如实；旧输入/账本/记录可读；无断言弱化。
- `fail`：任一旧读者把 directive 误显示为 customer/judge；无指令路径行为变化；旧记录不可读；新增失败/skip；断言被弱化。
- `insufficient evidence`：全量未执行；只给摘要；B0 未记录；旧读者核对缺项。
- `not applicable`：不允许。

### 3.16 AC-16 坏账本/主路径不受阻（P1.1 §10.2）

**方案标准原文（不弱化）**

> 账本不可读/坏行：消费者按无指令处理；普通 shell/卡片路径不受阻；面板如实显示错误；不伪造回执

**所需证据（最低）**

- 故障注入测试：坏行、`version>1`、不可读；消费者返回空快照 + `ledgerErrors`，按无指令处理；普通 shell/卡片路径不受阻；面板显示错误；不伪造回执。
- 跨层集成输出（D1）。
- D2：坏账本不阻断主路径（§4.6）。

**证据路径（计划）**

- `角色卡/编排/docs/change/<task>-evidence/`
- `角色卡/桌面窗口/docs/change/<task>-evidence/`
- `角色卡/测试/docs/change/<task>-evidence/`
- E1 变更包。

**产出角色**：编排（B1）、桌面窗口（C1）、测试（D1/D2）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：消费者按无指令；主路径不受阻；面板如实报错；无假回执。
- `fail`：坏账本阻断 shell/卡片；错误被隐藏为空账本；伪造回执；删除坏行掩盖问题。
- `insufficient evidence`：只测正常账本；无故障注入；无 D2。
- `not applicable`：不允许。

### 3.17 AC-17 i18n（P1.1 §10.2）

**方案标准原文（不弱化）**

> i18n：新增文案在 zh-CN/en-US 都存在；无硬编码用户可见字符串；回执/面板/高危/错误文案可切换

**所需证据（最低）**

- `test/项目管理/shared/i18n.test.ts` 原始输出：key 计数/parity/英文零中文泄漏；计数显式更新并说明新增 key 数量（按 A3 冻结）。
- 键检查：`ui.directive.*`、回执、高危、错误、面板分组、开关状态等新增文案中英成对。
- 渲染消费测试：面板/回执/高危/错误使用新 key；无硬编码用户可见字符串。
- 截图：zh-CN/en-US 面板/回执（至少有 zh-CN 面板截图；若声明可切换，需 en-US 证据）。

**证据路径（计划）**

- `角色卡/项目管理/docs/change/<task>-evidence/`（i18n 测试/键清单）
- `角色卡/桌面UI/docs/change/<task>-evidence/`（消费测试/截图）
- `角色卡/测试/docs/change/<task>-evidence/`
- E1 变更包。

**产出角色**：项目管理（A3）、桌面UI（C2）、测试（D1）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：中英成对、计数更新、零泄漏、无硬编码、可切换。
- `fail`：缺英文；中文泄漏；计数未更新；硬编码用户可见字符串；正常套件出现 missing-key。
- `insufficient evidence`：只有键扫描、无测试输出；无渲染消费证据。
- `not applicable`：不允许。

### 3.18 AC-18 T3 证据（P1.1 §10.2）

**方案标准原文（不弱化）**

> T3 证据：候选哈希/版本、改动路径、测试命令/结果、截图（关闭 DEBUG；记录 sha256/窗口尺寸；**不要求录屏**）、全量回归按技能参考 `ans-governed-construction/references/testing.md`；未实施/未测试状态如实

**所需证据（最低）**

- E1 变更包：候选哈希/版本、改动路径、任务节点 G2–E3、证据链接、T3、复用证据与失效说明、基线 rebase 与退路 B 披露。
- 测试命令/结果原始输出（各角色 + D1 + D2）。
- 截图元数据：关闭 DEBUG、sha256、候选版本/哈希、拍摄命令/复现步骤、窗口尺寸；**不得要求或提供录屏**。
- T3 全量回归按 `references/testing.md`（§2.5）。
- 未实施/未测试状态如实（`implemented-unverified`；不得提前 `verified`）。

**证据路径（计划）**

- `docs/scheduling/customer-authorization-plane-change-v1.md`（E1）
- 各角色 `docs/change/<task>-evidence/`
- `角色卡/测试/docs/change/<task>-evidence/`
- `docs/acceptance/customer-authorization-plane-report-v1.md`（E2）

**产出角色**：统筹（E1）、测试（D1/D2）、桌面窗口/桌面UI（截图）、独立验收（E2）。

**候选标识**：E1 变更包候选快照（本条正是其载体）。

**判定口径**

- `pass`：E1 完整、候选可复算、全量回归已执行并分类、截图元数据齐全、状态如实。
- `fail`：缺候选哈希/改动路径；未运行却写通过；截图缺元数据/DEBUG 未关；要求或提供录屏；提前写 verified。
- `insufficient evidence`：E1 不完整；全量未执行；截图来自另一候选；状态不可核对。
- `not applicable`：不允许。

### 3.19 AC-19 与 `contract-schema-query` 重叠处理（P1.1 §10.2）

**方案标准原文（不弱化）**

> 与 `contract-schema-query` 的重叠处理：实施基线不含对方未提交改动；若对方先合入，完成 rebase/受影响 Model 证据重跑；如实披露

**所需证据（最低）**

- 分支/合并记录：实施基线 HEAD、`origin/main` 实际值、merge-base；对方改动已合入（PR #38/#39/#40）时，本分支已 rebase 到当时 `origin/main`（本文件写标准结束时实测 HEAD = `4c3a6e40`，见 §1.4）。
- E1 披露：rebase 前后 HEAD、冲突解决（如 `src/model/runtime.ts` 由运行时核心、`app/desktop/session.ts` 由桌面窗口）、受影响 Model/桌面证据重跑记录；旧证据不复用。
- B0 在 rebase 后重记。
- 实施基线不含对方未提交改动（若在实施窗口 `origin/main` 再次前进，重复 rebase/重记 B0 并披露）。

**证据路径（计划）**

- E1 变更包（rebase/HEAD/重跑记录）
- `角色卡/运行时核心/docs/change/<task>-evidence/`
- `角色卡/桌面窗口/docs/change/<task>-evidence/`
- `角色卡/测试/docs/change/<task>-evidence/`（B0）
- E1 变更包。

**产出角色**：统筹（E1）、运行时核心、桌面窗口、测试（B0）。

**候选标识**：E1 变更包候选快照（含实际实施基线 HEAD）。

**判定口径**

- `pass`：基线可追溯、rebase/合并记录与重跑证据完整、旧证据未复用、披露如实。
- `fail`：实施基线含对方未提交改动；rebase 后复用旧 Model/桌面证据；未披露基线变化。
- `insufficient evidence`：无 HEAD/rebase 记录；B0 未在 rebase 后记录。
- `not applicable`：不允许。

### 3.20 AC-20 非目标核对（P1.1 §10.2）

**方案标准原文（不弱化）**

> 非目标核对：无 `@边界` 解析、无英文别名/全角 `＠`（除非 O5 被选）、**无联网/目录新闸（除非 Q5 被单独确认为 B 且 O1/O2 被选）**、无模型解释（除非 O3 被选）、无 CLI 入口、无指令进模型上下文

**所需证据（最低）**

- 结构/文本检查与范围清单：`rg` 覆盖 `@边界` 解析、`@approval`/`@decision`/`＠审批`、联网/目录新闸、模型解释、CLI 指令识别、指令注入模型上下文。
- 候选 diff 逐路径核对在闸门 2 写集内；无 O1–O11 实施；无 `src/interface/cli` 指令入口；无提示词包含指令原文/id。
- E1 范围清单；E2 复核。

**证据路径（计划）**

- E1 变更包（范围清单 + `rg` 输出）
- 各角色 diff
- `docs/acceptance/customer-authorization-plane-report-v1.md`（E2）

**产出角色**：统筹（E1）、独立验收（E2）、各角色（diff）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：六项非目标全部满足；无 O 项实施；写集内。
- `fail`：实现任一未选 O 项；`@边界` 被解析；英文/全角别名命中；新增联网/目录闸；模型解释；CLI 入口；指令进模型上下文。
- `insufficient evidence`：无 `rg`/范围清单；diff 不在写集内未说明。
- `not applicable`：不允许。

### 3.21 AC-21 闸门 1 单独决定（P1.1 §10.2）

**方案标准原文（不弱化）**

> **闸门 1 单独决定（F1/F2）**：闸门 1 记录中 Q5 与 Q9 各自有客户明确选择（Q5 A/B、Q9 A/B）；没有“确认方案”即默认 A 的推断；若 Q5 未单独确认，实施不得按 A 缩减；若 Q9 未单独确认，实施不得按 A 扩展枚举

**所需证据（最低）**

- 闸门 1 材料与客户原话记录：沟通记录「闸门 1 确认记录」显示客户选择卡作答「确认 P1.1」「Q5=A」「Q9=A」；无「确认方案即默认 A」的推断。
- 本文件写标准时已实测该记录（§1.4）；E2 按同一记录复核。

**证据路径（计划）**

- `docs/communication/2026-11-03_intent_customer-authorization-plane.md`（当前 120 行 / `e0b89c26…`）
- E1/E2 引用。

**产出角色**：沟通（记录）、独立验收（E2 核对）。

**候选标识**：不适用候选快照（本条核对客户记录本身）；E2 记录引用版本/哈希。

**判定口径**

- `pass`：记录显示 Q5/Q9 各自有客户明确选择（A 或 B），实施方向与选择一致。
- `fail`：记录无单独选择而实施按 A；选择与实施不一致。
- `insufficient evidence`：记录缺失/不可核对。
- `not applicable`：不允许（本条适用且已满足）。

### 3.22 AC-22 面板共存与项目切换（P1.1 §10.2）

**方案标准原文（不弱化）**

> **面板共存与项目切换（F8/复核未解决意见 ①）**：指令面板不占 `shellCardSlot`、不进 `customer-input` 一项目一卡队列；shell 卡待答时仍可输入指令；指令面板打开时角色卡仍按各自通道推达；项目切换会取消未决面板且不带到新项目；`session` 指令按项目分开

**所需证据（最低）**

- 桌面窗口/桌面UI 集成与 UI 测试：指令面板不占 `shellCardSlot`、不进一项目一卡队列、不计入 `pendingCount/pendingRoles/judgingCount`；shell 卡待答时仍可输入指令并打开面板；指令面板打开时角色卡仍推达；不互相阻塞/合并/自动关闭；项目切换取消未决面板且不带入新项目；`session` 指令按项目账本分开。
- 截图：共存场景（若真实运行可行）；不可行时记录环境边界并用集成/UI 测试覆盖（AC-22 不强制 D2 截图，但缺口须记录）。
- 跨层集成输出（D1）。

**证据路径（计划）**

- `角色卡/桌面窗口/docs/change/<task>-evidence/`
- `角色卡/桌面UI/docs/change/<task>-evidence/`
- `角色卡/测试/docs/change/<task>-evidence/`
- E1 变更包。

**产出角色**：桌面窗口（C1）、桌面UI（C2）、测试（D1）。

**候选标识**：E1 变更包候选快照。

**判定口径**

- `pass`：共存/项目切换规则逐项成立；无阻塞/丢失/串项目。
- `fail`：指令面板占卡槽/进队列；shell 卡待答时无法打开指令面板；项目切换保留未决面板；session 指令跨项目生效。
- `insufficient evidence`：只测单场景；无项目切换；无共存证据。
- `not applicable`：不允许。

### 3.23 AC-23 回滚开关（P1.1 §10.2）

**方案标准原文（不弱化）**

> **回滚开关（F7，若 O9 被选）**：`ANS_CUSTOMER_DIRECTIVES_DISABLED=1` 时主进程不拦截标记、消费者不注入；标记文本按普通聊天投递并正常回显（渲染侧按 `directivesEnabled:false` 不抑制气泡）；不写账本、不伪造回执

**所需证据（最低）**

- 无（O9 未选，整体 `not applicable`）。依据：闸门 1 确认记录「O1–O11 选装均不实施」；团队计划 §7.1 明确 AC-23 记 `not applicable（O9 未选）`。
- E1/E2 仅核对未实施 O9（通过 AC-20 非目标检查），不需要回滚开关行为证据。
- 基础能力位 `directivesEnabled`（R1）不因本条 N/A 豁免：其基础语义（主进程推送 `true`、项目切换重推、渲染侧据此抑制气泡）由 AC-1/AC-2/AC-22 的 UI/真实运行证据覆盖。

**证据路径（计划）**

- 闸门 1 记录（沟通记录）
- E1 范围清单 + E2 报告（N/A 依据）

**产出角色**：独立验收（E2 记录 N/A 依据）；统筹（E1 范围核对）。

**候选标识**：不要求候选证据；E2 引用闸门 1 记录版本/哈希。

**判定口径**

- `not applicable`：唯一允许的判断；必须写明「O9 未选（闸门 1 确认记录）+ 团队计划 §7.1」。
- `fail`：仅当实施 O9（范围外）时，AC-20 判 fail；AC-23 本身保持 N/A（不得因未选实施而判 pass/fail）。
- `pass` / `insufficient evidence`：不使用。

### 3.24 AC-24 账本重置/ID 重号披露（P1.1 §10.2）

**方案标准原文（不弱化）**

> **账本重置/ID 重号披露（复核未解决意见 ②）**：若 O11 未选，手动改名/丢失账本后 seq 重置的风险在方案/面板/审计中如实披露；面板以 `(id, createdAt)` 展示；若 O11 被选，`d-<seq>-<4hex>` 跨重置不重号

**所需证据（最低）**

- 披露证据：方案 §5.5/§9.5 已披露（P1.1 文本）；实施后在面板/审计中如实披露 seq 重置风险（例如面板显示 `(id, createdAt)`、审计以两者关联）。
- 单元测试/面板快照：`(id, createdAt)` 展示；不自动复活旧 id、不扫描被改名文件（§5.5 行为）。
- **O11 子句 N/A**：依据闸门 1 记录「O1–O11 选装均不实施」与团队计划 §7.1；不要求 `d-<seq>-<4hex>` 证据。
- 账本样例（与 AC-6 共用）。

**证据路径（计划）**

- `角色卡/编排/docs/change/<task>-evidence/`
- `角色卡/桌面窗口/docs/change/<task>-evidence/`（面板/审计展示）
- `角色卡/测试/docs/change/<task>-evidence/`
- E1 变更包；E2 报告（N/A 依据）。

**产出角色**：编排（B1）、桌面窗口（C1）、测试、独立验收（N/A 部分）。

**候选标识**：E1 变更包候选快照（披露子句）；O11 子句不要求候选证据。

**判定口径**

- `pass`：披露存在于面板/审计；`(id, createdAt)` 展示；O11 子句按 N/A 记录依据；不得把 O11 子句缺失当 fail。
- `fail`：无披露；面板无 `createdAt`；实施 O11（范围外，AC-20 同时 fail）。
- `insufficient evidence`：披露只在方案文本、无面板/审计证据；无面板快照。
- `not applicable`：仅 O11 子句；整条不得 N/A。

### 3.25 与 P1.1 §10.2 的映射自检

| P1.1 §10.2 AC | 本文件 AC | 原文保留 | 弱化/拆分/删减 |
| --- | --- | --- | --- |
| AC-1 | AC-1 | 逐字保留 | 无 |
| AC-2 | AC-2 | 逐字保留 | 无 |
| AC-3 | AC-3 | 逐字保留 | 无 |
| AC-4 | AC-4 | 逐字保留 | 无 |
| AC-5 | AC-5 | 逐字保留 | 无 |
| AC-6 | AC-6 | 逐字保留 | 无 |
| AC-7 | AC-7 | 逐字保留 | 无 |
| AC-8 | AC-8 | 逐字保留 | 无 |
| AC-9 | AC-9 | 逐字保留 | 无 |
| AC-10 | AC-10 | 逐字保留 | 无 |
| AC-11 | AC-11 | 逐字保留 | 无 |
| AC-12 | AC-12 | 逐字保留 | 无 |
| AC-13 | AC-13 | 逐字保留（含 Q7 A 前提注记） | 无 |
| AC-14 | AC-14 | 逐字保留 | 无 |
| AC-15 | AC-15 | 逐字保留 | 无 |
| AC-16 | AC-16 | 逐字保留 | 无 |
| AC-17 | AC-17 | 逐字保留 | 无 |
| AC-18 | AC-18 | 逐字保留 | 无 |
| AC-19 | AC-19 | 逐字保留 | 无 |
| AC-20 | AC-20 | 逐字保留 | 无 |
| AC-21 | AC-21 | 逐字保留 | 无 |
| AC-22 | AC-22 | 逐字保留 | 无 |
| AC-23 | AC-23 | 逐字保留 | 无（整体 N/A 依据客户未选 O9） |
| AC-24 | AC-24 | 逐字保留 | 无（仅 O11 子句 N/A 依据客户未选 O11） |

**自检结论**：P1.1 §10.2 共 **24 条 AC**，本文件 **24 条 AC**，一一对应，无遗漏、无新增、无拆分、无弱化；`not applicable` 仅用于 AC-23 整体与 AC-24 的 O11 子句，依据均为闸门 1 客户确认记录「O1–O11 选装均不实施」。

---

## 四、证据计划

### 4.1 候选身份、基线与环境

- **B0 基线**（测试角色，rebase 后记录）：`git rev-parse HEAD`、`git status --short`、目标文件 `git hash-object` + `sha256sum`；依赖安装状态（本 worktree 写标准时无 `node_modules`）；Node/npm、OS/Shell；`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`；受影响套件与 **T3 全量基线**原始输出、失败逐名分类（含既有 Windows symlink EPERM）；确认无产品代码改动。
- **候选身份**（E1）：所有新增/改动文件（产品代码、测试、配置）的 `git hash-object` 与 `sha256sum`（工作区；CRLF/LF 差异分别记录）；新增文件同；实际实施基线 HEAD（rebase 后）；rebase 前后 HEAD、冲突解决与重跑记录（AC-19）。
- **改动范围**：`git diff --name-only` 与 `git status --short` 必须落在闸门 2 确认的写集/边界内；`git diff --cached --name-only` 为空（不暂存）；无授权外已跟踪变化。
- **环境**：Node/npm 实测版本、OS/Shell、命令工作目录；不得伪造输出。
- **候选隔离**：管理记录/证据目录不纳入候选；并发写混入按不可复算处理（团队计划 §10.1 第 14 项）。
- **证据路径模式**：`角色卡/<role>/docs/change/<task>-evidence/`（角色：运行时核心、项目管理、编排、桌面窗口、桌面UI、测试）；E1 列出每个证据文件的**实际路径 + SHA-256**。`docs/acceptance/` 只放标准与报告。

### 4.2 命令清单（最低要求，实际以仓库脚本/runner 为准）

| 范围 | 命令 | 产出角色 |
| --- | --- | --- |
| 运行时核心 | `node --test "test/runtime-core/**/*.test.ts"`；`npm run typecheck` | 运行时核心 |
| 项目管理 | `node --test "test/项目管理/shared/**/*.test.ts"`；`npm run typecheck` | 项目管理 |
| 编排 | `node --test "test/编排/**/*.test.ts"`；`npm run typecheck` | 编排 |
| 桌面窗口 | `node --test test/桌面应用/directive-input.test.ts test/桌面应用/directive-decision.test.ts` + 按需既有精确文件；`npm run typecheck`；条件 `node test/桌面应用/e2e/main.mjs` | 桌面窗口 |
| 桌面UI | `node --test "test/桌面UI/**/*.test.ts"`；`npm run typecheck:renderer`；`npm run build:renderer`；真实 Electron 冒烟（临时 userData） | 桌面UI |
| 跨层集成 | `node --test test/测试/customer-authorization-plane-integration.test.ts`（或团队计划认可的等价文件） | 测试 |
| T3 全量回归 | `node --test --test-concurrency=1`（全量适用套件；既有排除仅 `test/pi-adapter/write-sequencing.test.ts`，理由按 B0 记录） | 测试 |
| 真实 E2E 复跑 | `node test/桌面应用/e2e/main.mjs`（`E2E_PASS`/计数/截图） | 测试/桌面窗口 |
| 类型/构建 | `npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer` | 各角色/测试 |

命令若因仓库实际脚本/runner 不同而调整，须在 E1 中记录实际命令、原因与等价性；不得用不可运行的示例命令冒充结果。

### 4.3 原始输出要求

每项检查记录：命令原文、工作目录、环境（Node/npm、OS/Shell）、退出码、测试计数（pass/fail/skip/todo）、失败原文（不截断关键堆栈）、执行时间；跳过项写明原因。只给「全部通过」摘要不算原始证据。截图/账本/审计附生成命令/候选哈希/窗口尺寸/临时 userData 路径。

### 4.4 文件哈希与 diff/status

- 每个候选文件：`git hash-object <path>` + `sha256sum <path>`；新增文件同。
- `git status --short`、`git diff --name-only`、`git diff --cached --name-only`；逐路径核对写集/边界。
- 范围外文件（写集外 `src/`/`app/`/`test/`、`package.json`/锁/构建配置/发布配方、角色卡边界）记录基线/候选哈希对照，证明零改动。
- 测试 diff 用 `git diff -U0` 片段证明无弱化断言；边界 diff 仅 B-1..B-4。

### 4.5 账本、审计与 Q9 归属样例

- 提供 `.ans/state/customer-directives.jsonl` 样例（测试项目/临时 userData；路径 + SHA-256），覆盖 `directive.created/consumed/revoked/expired`、`d-<seq>`、`target`、`until`、`sessionId`、`highRisk`、坏行/轮转样例。
- 提供 shell 审计样例：`directive:{id,scope}`、`by:"directive:<id>"`，与 `judge`/`customerGrant` 互斥可区分。
- 提供四处归属断言：`request.resolved.by`、`version.decision.decidedBy`、run manifest `decidedBy`、UI 文案均显示 `"directive"`（或等价「客户指令」）；`requirement-change.ts` 旧读者三值映射不误显示。
- 新增字段（原文/卡片载荷）不得含凭据；既有 `command`/`argv` 审计行为不变；`rawText` 不打印到诊断/模型。

### 4.6 D2 真实运行场景矩阵（截图规则）

D2 由测试（跨层复跑/E2E）、桌面窗口（e2e 夹具，条件）、桌面UI（截图）执行；统筹汇总；证据必须绑定同一候选。**最多截图、不得要求或提供录屏。**

| 场景 | 步骤 | 预期观察 | 主要 AC |
| --- | --- | --- | --- |
| D2-S1 | 输入 `@审批 允许 shell "npm install" once` | 打开审批面板；无「发给幕僚」用户气泡；无角色轮次 | AC-1、AC-2 |
| D2-S2 | 面板字段与空正文 | 原文/动作/范围/资源/期限显示；空正文面板字段留空、确认禁用；未识别片段列出 | AC-3、AC-1 |
| D2-S3 | 确认落账 | 系统行回执「已记录审批指令 #d-N」；非模型消息 | AC-5 |
| D2-S4 | 角色执行完全相同的 `npm install` 两次 | 第一次按指令放行一次；第二次回正常链（或按既有审批）；审计含 `directive:<id>` | AC-8 |
| D2-S5 | 输入 `@审批 撤销 #d-N` | 面板显示摘要；回执「已撤销审批指令 #d-N」；后续请求不再按该指令 | AC-12 |
| D2-S6 | 输入 `@决策 选推荐项 until=session`；触发 decision 卡 | 代选推荐项；结果行「客户指令，不是客户点击」；四处归属为 directive | AC-10 |
| D2-S7 | 决策指令冲突/不匹配 | 卡照常呈现；不默认代选；显示未匹配/冲突说明 | AC-10 |
| D2-S8 | 重启应用（同一临时 userData） | `session` 指令失效；面板显示已失效；未使用 `once` 按 Q3 A 失效 | AC-11 |
| D2-S9 | 坏账本/坏行 | 消费者按无指令；普通 shell/卡片路径照常；面板如实显示错误；无假回执 | AC-16 |
| D2-S10 | 高危指令未勾选风险确认 | 确认禁用；主进程拒绝落账；无回执 | AC-13 |
| D2-S11 | 带图标记输入 / `@边界` 输入 | 带图明确拒绝、不投递/不落账；`@边界` 普通聊天 + 一次性提示，无隐藏解析 | AC-1、AC-20 |
| D2-S12 | 指令面板与 shell 卡共存；项目切换 | 不互相阻塞；shell 卡仍推达；项目切换取消未决面板；`session` 指令不跨项目 | AC-22 |

- 截图元数据：候选版本/哈希、截图 SHA-256、拍摄命令/复现步骤、窗口尺寸、临时 userData 路径；关闭 DEBUG 覆盖层。
- 若真实 Electron/截图因环境不可得：D2 如实记录；E2 按 AC-1/AC-3/AC-5/AC-18 判 `insufficient evidence`，不得以单测替代真实截图，不得伪造 PASS。
- 多引擎边界：至少默认/一个真实引擎；其余以共享通道测试 + 账本/审计样例覆盖并记录缺口（团队计划 §10.2 第 9 项）。

### 4.7 证据失效与复用

- 候选、输入/依赖、契约（`customer-directive/v1`）、IPC/preload 形状、`SendResult`/`ShellReviewResult`/`CustomerInputOutcome` 字段、i18n key、测试夹具、构建配置变化 → 受影响证据失效，只补失效部分；不得跨候选复用。
- rebase/合并后旧 Model/桌面证据失效，B0 重记，受影响证据重跑（AC-19）。
- 共享文件（`src/model/runtime.ts`、`app/desktop/*`、`app/main.ts`、`preload.cjs`、i18n messages、`src/pipeline/orchestration/*`、`test/桌面应用/*`）按单写者/路径预留；并发写造成的混入按不可复算处理。
- 复用证据必须在 E1 中列出「复用理由 + 未失效依据」；验收核对候选哈希一致。

### 4.8 证据路径与禁止事项

- 证据路径按团队计划 §6.4：桌面窗口/桌面UI/测试角色各自的 `角色卡/<role>/docs/change/...-evidence/`；`docs/acceptance/` 只放标准与报告；管理记录不混入产品候选。
- 禁止：伪造命令/输出/令牌/锁/审批；改断言保绿；跳过来源；把设计/计划写成已实施；把摘要当原始证据；用其它变更证据替本变更背书；写 `docs/verification/` 伪造记录。

---

## 五、成功、失败与边界情形（判定观察点）

| 情形 | 预期观察 | 判定 |
| --- | --- | --- |
| 输入开头 `@审批`/`@决策` | 命中、打开对应面板、不投递幕僚、无用户气泡 | 投递/气泡 → AC-1/AC-2 fail |
| `@审批员`/正文中标记/全角/`@边界` | 不命中；普通聊天（`@边界` 可一次性提示） | 命中 → AC-1 fail；隐藏解析 → AC-20 fail |
| 空正文/带图命中 | 空正文面板字段空、确认禁用；带图明确拒绝、不投递/不落账 | 静默忽略/投递/落账 → AC-1 fail |
| 面板显示 | 原文/动作/范围/资源/期限齐全；未识别片段列出 | 缺字段/猜测 → AC-3 fail |
| 取消/关窗/写失败 | 不落账、不投递、无假回执；原文回草稿 | 落账/假回执 → AC-4 fail |
| 落账成功 | 回执精确「已记录审批指令 #d-N」/「已记录决策指令 #d-N」；durable 后出现 | 文案错/提前回执 → AC-5 fail |
| 审批 allow 精确命令 | 硬地板之后放行；once 一次；session 运行内反复；forever 持续 | 越权/重复 → AC-8 fail |
| 审批 deny 匹配命令 | 拒绝；deny 先于 c=allow；不误伤 | 白名单覆盖 deny → AC-9 fail |
| 硬地板 + 指令 | c=deny/preblock/write-guard/readonly/script 仍拒绝 | 翻案 → AC-9/AC-14 fail |
| 决策推荐/选项/拒绝 | 按 §6.2 代选/拒绝；结果行「客户指令，不是客户点击」 | 误选/归因错误 → AC-10 fail |
| 决策冲突/不匹配 | 不代选；绕过 `tryAutoSelectDecision`；卡呈现客户 | 默认推荐先代选 → AC-10 fail |
| 期限/重启 | session 重启失效；once 按 Q3 A；forever 持续；分组正确 | 跨重启生效/分组错 → AC-11 fail |
| 撤销 | 同 target active 可撤；已消费/已撤销/已失效拒绝；立即生效；历史保留 | 跨 target/仍生效 → AC-12/AC-7 fail |
| 高危 | 谓词真值表；未勾选被主进程拒绝；记录 reasons/acknowledged | 绕过/未记录 → AC-13 fail |
| 坏账本 | 消费者按无指令；主路径照常；面板报错；无假回执 | 阻断主路径/隐藏错误 → AC-16 fail |
| 跨 target | 快照互不含；撤销被拒；提示词隔离；伪造丢弃 | 串线 → AC-7 fail |
| 旧读者/Q9 | 四处归属 `"directive"`；旧读者不误显示 customer/judge | 误显示 → AC-10/AC-15 fail |
| i18n | 中英成对、计数更新、零泄漏、无硬编码 | 缺失/泄漏 → AC-17 fail |
| 全量回归 | 与 B0 分类；新增确定性失败=0、新增 skip=0 | 新增失败/skip → AC-15/AC-18 fail |
| 真实 Electron 不可用 | 记录环境边界；AC-1/AC-3/AC-5/AC-18 真实证据缺失 | `insufficient evidence`，不得以单测替代 |
| O9/O11 未选 | AC-23 整体 N/A；AC-24 仅 O11 子句 N/A；不实施 | 实施任一 → AC-20 fail |
| 范围外改动 | 写集外/未选 O 项/构建配置改动 | AC-20/AC-18 fail 或 `insufficient evidence` |

---

## 六、T3 检查面、架构约束、升档与全量回归

### 6.1 T3 选定检查面

- 受影响角色层测试：运行时核心（解析器/高危谓词/类型隔离）、项目管理（`jsonl-ledger`、i18n）、编排（账本 Provider/Service/Pipeline、shell gate/audit、Q9 枚举、`task-state` 等价回归）、桌面窗口（sendSession 拦截、directive-input、decision 消费者、Q9 读者）、桌面UI（对话框/两个面板/回显抑制/i18n 消费）。
- 跨层集成：`test/测试/` 新集成（真实 Model/Service/Provider/Pipeline + presenter 替身 + shell gate + decision 消费者替身；创建→快照→消费→撤销→失效→坏账本；target 隔离；Q9 归属）。
- 真实 UI：D2 矩阵（§4.6）+ 截图/账本/审计样例。
- 构建/类型：`npm run typecheck`、`npm run typecheck:renderer`、`npm run build:renderer`。
- 消费者重测：§2.5 清单。
- 全量回归：§6.3。

### 6.2 架构与结构约束（静态门）

- **写权**：每个改动路径在闸门 2 确认的写集内；B-1..B-4 之外的新增路径（第三个 `test/桌面应用/` 新文件、额外 Model/Service 文件、构建配置）一律停止回报；无保护文件改动（`package.json`/锁/`tsconfig*`/`vite.config.ts`/`src/index.ts`/`bin/ans.js`/`.github/workflows/**`/`electron-builder.yml`/发布配方）。
- **分层与依赖**：`Interface → Pipeline → Service → Provider`；Model 全局共享且不依赖运行层；`directive-marker.ts` 零 import；渲染侧只导入 marker 文件，不导入 `runtime.ts`；Interface 不直接 import Service/Provider；shell gate 只经注入的 `takeDirective` 回调与 Pipeline 交互，不 import Service/Provider；不出现第二份标记解析器/第二本任务账本/第二个 decision 卡校验/第二个写门禁。
- **契约兼容**：`customer-directive/v1` 加法字段/事件；`SendResult`/`ShellReviewResult`/`CustomerInputOutcome` 加法字段；Q9 A 枚举扩展逐点更新旧验证器/读者/i18n；旧记录/旧输入可读；不删除/不改既有字段语义；不改写权限边界/结论以保绿。
- **文档记录**：各角色 `docs/change/` 状态 `implemented-unverified`；实现完成报告、E1、E2 链接一致；不提前 `verified`；不伪造 `docs/verification/`。

### 6.3 全量回归口径

- 命令：`node --test --test-concurrency=1`（全量适用套件；若以文件清单执行，记录清单生成命令与清单哈希）；**既有排除仅 `test/pi-adapter/write-sequencing.test.ts`**，理由按 B0 记录（历史串行写测试），不得新增排除。
- 记录：命令/环境/计数（pass/fail/skip/todo）/失败原文/执行时间；与 B0 基线逐名对照。
- 通过要求：**新增确定性失败 = 0、新增 skip = 0**；既有 Windows symlink EPERM 等环境失败按 B0 逐名对应，不计新增，但不得掩盖新增；任何新增失败未修复 → AC-15/AC-18 fail。
- 报告首行必须写「全量回归已执行（命令/范围/输出）」或团队计划认可的等价口径；不得以受影响检查替代。

### 6.4 升档与停止条件

- 证据不足/候选不可复算/跨层结论不成立/消费者清单不清 → 停止判定、按 `insufficient evidence` 判，并升档补证（升档不降档）。
- 实施中出现以下任一，停止并回报统筹/沟通，按方案/团队计划重开闸门 1/2：改变 target/期限/消费者优先级/账本位置；启用任一 O 项；改变 Q5/Q9 结论；扩大写集/边界；出现 B-1..B-4 之外的新路径；并发写同一文件；方案 R1/R2 收口改变语义。
- 升档后本文件标准不因升档而放宽；标准变更按 §1.2 处理。

---

## 七、与团队计划、写集与授权边界

- 写集以闸门 2 确认的团队计划 §4.1/§4.3 为准；新增文件均在既有目录授权或已确认的精确条目内（B-1：`src/model/directive.ts`/`directive-marker.ts`；B-2：`src/pipeline/orchestration/customer-directive.ts`；B-3：`src/provider/directive/`、`src/service/directive/` 有界模块目录；B-4：`test/桌面应用/directive-input.test.ts`、`directive-decision.test.ts`）。验收按该写集核对 `git diff --name-only`/`git status --short`；任何角色不得写其他角色路径、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、角色卡/边界。
- 边界变更仅限 B-1..B-4；角色职责描述、id/显示名、权限不变；H1 由人事按闸门 2 执行（写标准时尚未落地，见 §九.5）。
- 提交/推送/合并/发布未授权；本任务不写 `package.json`/锁/构建配置/发布配方/版本号；验收通过不授权提交、推送、合并、发布。
- 本文件不改变团队计划确认的参与角色、阶段顺序、档位与证据口径；实施中发现需要变更写集/档位/口径时，按团队计划回报统筹并重开闸门 2，不在验收标准中自行调整。

---

## 八、版本冻结、报告安排与 E2 判定上下文

- 本文件路径固定为 `docs/acceptance/customer-authorization-plane-criteria-v1.md`，版本 **v1**，日期 **2026-11-03**；写盘即冻结，标准先于实施。
- 实施前：沟通确认本文件路径/版本；未确认不派实施（团队计划 V1 出口）。
- 实施后：统筹提交变更包 E1；**E2 由与本文件相同的唯一验收主上下文判定**（沟通另起唯一验收主上下文，不把客户对话或沟通历史带入验收上下文；主上下文不启动子上下文，除非按验收并行取证规则由沟通统一启动 0–4 个只读取证子上下文）。
- 验收报告 `docs/acceptance/customer-authorization-plane-report-v1.md` 首行至少含：风险档位、判定依据、选定检查、复用证据、消费者重测结论、全量回归（已执行或 N/A + 理由）。逐项验收表覆盖 AC-1..AC-24。
- 结论只能是**通过 / 返工 / 证据不足**；返工交原所有者，补证由统筹安排；统筹不改验收结论。
- 本文件不包含任何候选判定、通过/返工/证据不足结论；不做验收结论的提前预告。
- 标准变更：递增版本、记录理由、交沟通/统筹确认；候选变化不改变标准，只使受影响证据失效并补证。

---

## 九、写标准时发现的待澄清项与只读核对结果（只报告，不修改）

以下为只读核对发现的事实/文档状态/口径问题，供统筹/沟通/策划处理；本文件**未修改**方案、团队计划、沟通记录、角色卡、边界、产品源码或测试，也未自行放宽标准。**阻断项：无。** 非阻断项如下；如方案/客户后续澄清与本文件理解不同，按 §1.2 递增版本重判。

1. **文档状态头漂移（方案与团队计划）**：方案 P1.1 文件头与 §状态仍写「草案 P1.1……未闸门 1 客户确认、未实施」；团队计划文件头与 §二仍写「闸门 2 未确认、实施授权未给」。沟通记录已含闸门 2 与实施授权。判定以 `docs/communication/` 的确认记录与冻结哈希为准，不影响本文件条目；建议策划/统筹在后续版本中校正状态行（非阻断）。
2. **沟通记录版本与哈希引用不混用**：当前沟通记录 **120 行 / `e0b89c26…`**（含闸门 0/1/2 与实施授权）；方案头引用的 **69 行 / `91d77bb8…`**（闸门 1 前）与团队计划头引用的 **89 行 / `f3755b02…`**（闸门 2 前）是历史快照。验收引用时以当前文件与对应小节为准，不以旧快照哈希替当前记录，也不把两者混用（非阻断）。
3. **写标准期间基线被并发更新**：写标准开始时 HEAD `243d8f6`；结束时 HEAD = `origin/main` = `4c3a6e40`（merge-base 同，ahead/behind 0/0），产品/测试零改动。该更新由他方按团队计划 §八执行，**不是本验收写入**。E1/B0 必须在 rebase 后重记实际实施基线 HEAD，旧 Model/桌面证据不得复用（AC-19）；本文件行号引用以 `243d8f6` 为快照、以符号名/文本锚点为准（非阻断）。
4. **R1/R2 文字收口尚未发生**：团队计划 §1.5 载明由策划做编辑性收口，V1 与实施引用收口后的文本与新哈希。本文件当前以 P1.1 为基线；收口后以版本注记引用新哈希，不改 AC 文本；若改语义则重开闸门 1（非阻断）。R2 的 AC-13 子句以 Q7 A 为前提，闸门 1 已确认 Q7 A，本文件按适用记录；R1 的 `directivesEnabled` 基础能力位由基础实现覆盖（AC-1/AC-2/AC-22 证据），AC-23 的 N/A 不豁免其基础行为（非阻断）。
5. **H1 边界条目尚未落地**：写标准时 `git status` 未见 `角色卡/*/boundary.md`/`boundary.yaml` 的 B-1..B-4 变更。按团队计划，H1 在闸门 2 + 实施授权后由人事执行；E2 核对边界 diff 仅 B-1..B-4、md/yaml 一致、changelog 记录（非阻断；实施前必须完成）。
6. **共享 JSONL 辅助 A/退路 B**：团队计划采用 A（`src/common/shared/jsonl-ledger.ts` 抽取 + `task-state.ts` 等价迁移），保留设计退路 B（Provider 自带等价实现、不碰 `task-state.ts`）。两者均为闸门 2 已确认的计划选择，不改变闸门 1 语义；E1 必须披露实际采用路径。若采用 A，AC-15/AC-6 需含 `task-state` 等价回归证据；若采用 B，需含 Provider 独立实现与独立测试、并证明 `task-state` 零改动（非阻断）。
7. **本 worktree 无 `node_modules`**：写标准时未安装依赖，未运行任何测试/构建；B0 前须安装或如实记录不可用。V1 不把任何未运行检查写成通过（非阻断）。
8. **D2 依赖真实 Electron 环境**：若环境不可得，D2 如实记录，E2 按 AC-1/AC-3/AC-5/AC-18 判 `insufficient evidence`；不得以单测替代真实截图，不得伪造 PASS（非阻断）。
9. **既有排除项与 Windows 环境失败**：`test/pi-adapter/write-sequencing.test.ts` 存在；仅按 B0 记录的理由排除，不新增排除/skip；既有 Windows symlink EPERM 等失败按 B0 逐名分类、不计新增。V1 写标准时未运行基线，具体失败名单以 B0 为准（非阻断）。
10. **`test/桌面应用/` 逐文件授权**：本任务仅既有精确文件 + B-4 两个新文件；若需第三个新文件，停止回报，不自行扩边界（团队计划 §4.5/§10.2 第 4/13 项；非阻断）。
11. **AC-21 已事实满足**：写标准时沟通记录已显示 Q5=A、Q9=A 为客户单独选择，无「确认方案即默认 A」推断；E2 仍按本条核对记录版本/哈希（非阻断）。
12. **AC-23/AC-24 的 N/A 依据**：O9/O11 均未选（闸门 1 记录「O1–O11 选装均不实施」；团队计划 §7.1 明确 N/A）；V1 按此写入。若客户后续选择 O9/O11，属范围变更，重开闸门 1/2 并递增本文件版本（非阻断）。
13. **任务描述中的旧口径**：任务描述写 `customer.directives.jsonl`（点号），方案 P1.1 与团队计划统一为 `.ans/state/customer-directives.jsonl`（连字符）；本文件按方案/团队计划口径，不用点号（非阻断，团队计划 §10.3 第 1 项已记录）。
14. **Node 环境**：写标准时 `node v24.22.1`/`npm 11.19.1` 可用；实施/取证仍须记录实测版本，不得以写标准时的版本替代候选运行记录（非阻断）。

---

**本文件状态：标准 v1 已冻结；未判定任何候选；未声称本变更已实施、已测试或已验收。**
