**风险档位：T3（治理/权限/流程设计变更）｜判定依据：策划方案 §1/§11 与技能 `references/testing.md`（治理/权限变更即使只改文档也不能压成 T0/T1/T2）｜选定检查：v3 schema/V-D1–V-D9/V12 正负例（含 `实现目录` 必填/目录归属）、v1/v2 legacy 夹具、布局核对纯函数单测与 e2e、卡文本/任务文案断言、v3 与 legacy v2 完整链路、T3 全量回归、治理/共享抽象检查、真实启动/演示｜复用证据：无（标准 v1.1 先于实施写盘；判定时仅复用同候选、同输入/依赖、同命令的证据，见 §3.2）｜全量回归：T3 适用，判定时必须对当前候选执行并与实施前基线逐项对照（本文件不声明已执行）**

# 验收完成标准：目录级授权与目录规范（directory-ownership）

- 任务 ID：`2026-10-23-directory-ownership`
- 产品 flowId：`directory-ownership`
- 标准版本：`directory-ownership-criteria-v1.1`（2026-10-23；v1 未用于任何候选判定；v1.1 按客户闸门 1 Q9 A、团队计划 §2.3、沟通闸门 2 澄清 v3 模块清单 `实现目录` 必填）
- 阶段：**实施前完成标准**（只建立标准；本文件不实施、不判定候选、不写验收报告）
- 验收基线：客户在**闸门 1** 确认的策划方案 v1（`docs/planning/2026-10-23_design_directory-ownership.md`，2026-10-23；§13 Q1–Q12 推荐 A）
- 上位依据：客户在**闸门 0** 确认的意图记录（`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`）
- 范围/写集输入：客户在**闸门 2** 确认的团队计划（`docs/scheduling/2026-10-23-directory-ownership-team-plan.md`）；**只作范围与写集依据，不是标准来源**
- 候选版本：待统筹提交，以产品候选哈希标识（见变更包）
- 结论：**待判定**（本文件不构成通过、返工或证据不足结论）
- 验收报告：**另写** `docs/acceptance/directory-ownership-report-v1.md`；**本文件不是报告**
- 写盘日期：2026-10-23
- 版本历史：v1（2026-10-23）初版；v1.1（2026-10-23）仅按客户已确认的 Q9 A 澄清 v3 模块清单 `实现目录` 必填口径；不改变方案、团队计划、闸门 2 写集、T3 档位或 i18n T2；v1 未用于任何候选判定。

---

## 一、基线、输入性质与范围

### 1.1 验收基线与确认记录

| 闸门/输入 | 状态 | 记录 | 本轮作用 |
| --- | --- | --- | --- |
| 闸门 0：意图确认 | 已确认（2026-10-23，客户回复「可以」） | `docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`（变更 B「目录级授权 + 目录规范」） | 上位依据：上层只分配目录并给出目录规范；执行角色在目录内自行设计文件/子目录；不跨目录、不改规范、不碰他人目录；治理关键路径继续精确授权；不一次性重写历史边界 |
| 闸门 1：方案确认 | 已确认（2026-10-23，客户选择「都确认，按推荐」） | 同上文件「闸门 1 确认记录」；对象为目录授权方案 v1（含 §13 Q1–Q12 推荐 A） | **验收基线**：方案 §11 P1–P12、§2.3 范围、§5.5 治理关键路径、§12 非目标、§13 推荐 A |
| 闸门 2：角色指派/写集确认 | 已确认（2026-10-23，客户选择「确认目录授权计划」「确认并授权实施」「授权人事补边界条目」） | 同上文件「闸门 2 确认记录」；确认的团队计划 SHA-256 `fdadae1abe78e578a60250c3106fe28168be007cbc6b4259a5583210dcdf5910` / blob `3d3691d80018d0c5d52e18769f249be0aafbbc10`（与本标准写盘时实测一致） | 只用于核对参与角色、逐角色写集、阶段顺序、验收安排、证据口径；**不是标准来源** |
| 实施授权 | 已给（2026-10-23，客户明确「确认并授权实施」） | 同上「闸门 2 确认记录」；实施授权与闸门 2 分开记录 | 允许按团队计划实施；不等于验收通过、提交、推送、合并或发布授权 |
| i18n 变更（T2） | 独立确认、独立实施、独立验收 | `docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`；`docs/scheduling/2026-10-23-i18n-team-plan.md` | **与本变更分开判定、不合并报告**（见 §3.5）；本文件不判定 i18n，也不为 i18n 背书 |

**方案/团队计划状态头说明：** 策划方案文件头与 §2.1 表格仍写「草案 v1（待闸门 1 方案确认）」「闸门 1：待确认」；团队计划状态头与 §二仍写「闸门 2 未确认、实施授权未给」。沟通文件的闸门 0/1/2 确认记录已明确客户选择。本标准以 `docs/communication/` 的确认记录为授权事实，不改写方案或团队计划；判定时引用方案正文的版本与内容，不把过期状态头当成未确认。团队计划 hash 与闸门 2 记录一致，范围/写集输入可追溯。

**已发生的既有治理校正（实施前）：** 工作树已出现 `M 角色卡/桌面窗口/boundary.md`（新增 `test/桌面应用/acceptance-dispatch.test.ts`、`test/桌面应用/runtime-resolution.test.ts` 两个既有精确单文件条目）与 `M 角色卡/桌面窗口/changelog.md`（同日漂移校正记录），对应客户闸门 2「授权人事补边界条目」。`git diff --stat` 为 2 文件、4 行新增。该校正**不是**本产品候选，也不是角色迁移；判定时按 P15/G2 核对它恰好只有这两条边界条目和对应 changelog 记录，不得扩大。

### 1.2 输入性质与来源纪律

1. **方案 §11 P1–P12 是直接标准来源。** 本标准把 P1–P12 展开为 P1–P15 与 G1–G3，展开内容取自方案正文（§4–§9、§11、§13、§14），不新增产品需求，不放宽或加严方案实质。
2. **团队计划不是标准来源。** 它只用于核对参与角色、逐角色写集、阶段顺序、证据安排与验收安排；其中的建议、角色分工或措辞不得用来增加、放宽或加严本标准；与方案冲突时，以客户确认的方案 v1 为准。
3. **闸门 0 意图记录是上位依据。** 「只划分目录」「执行角色自行设计文件/子目录」「治理关键路径继续精确授权」「不一次性重写历史边界」是核心意图；不得利用实施顺手扩大。
4. **§13 Q1–Q12 推荐 A 已随闸门 1「按推荐」纳入范围。** 本标准在 §4.1.2 给出逐项映射；未选的备选分支（如 Q5 B 任务级硬拦、Q4 C 立即迁移、Q3 C 多 owner 共写）不是本轮要求，也不得被实施者用来替代推荐 A。
5. **本标准不得弱于方案 §11。** 若发现与方案 §11 实质不一致，按 §3.6 的标准版本变更流程处理，不擅自按本文件判定，也不得用本文件放宽方案标准。
6. **管理记录不是产品候选。** 顶层 `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/`、`docs/verification/` 是标准、变更包、证据与记录的载体，不混入产品候选；不得把管理记录的哈希当成产品文件哈希。
7. **不改变闸门 2 写集与档位。** 本文件只建立验收口径，不改变团队计划 §4.3/§八确认的参与角色、精确写集、阶段顺序、验收安排或 T3 档位；也不改变 i18n 变更的 T2 档位与写集。

### 1.3 交付范围、写集与明确非目标

**本轮必须覆盖的产品面（方案 §9.1/§9.2；团队计划 §4.3）：**

- **编排**：`src/common/编排/team-plan.ts`（v3 解析/类型/目录规范/V-D1–D9）；新增 `src/common/编排/directory-conformance.ts`（布局核对纯函数）；`src/pipeline/orchestration/run-role.ts`（卡前守卫/schema 3/公共出口）；`src/pipeline/orchestration/govern-session.ts`（标准工作流/Convener/Crew 提示）；`test/编排/`。
- **门禁引擎**：`src/common/门禁引擎/governance-roles.ts` 的 `CONVENER_CARD_TEXT`/`NOMINATOR_CARD_TEXT`/`VERIFIER_CARD_TEXT` 产品数据文本；`test/门禁引擎/`。
- **运行时核心（条件/推荐）**：`src/model/runtime.ts` 的 `GovernanceJudgeFacts.teamPlanSchema?: 1 | 2 | 3` 与可选有界目录摘要；`test/runtime-core/` 受影响测试；不做则 N/A + 理由。
- **桌面窗口**：`app/desktop/interface.ts`（`TeamPlanInfo` v3/`parseTeamPlanInfo`/V12 扩展/来源分流）；`app/desktop/governance-advance.ts`（Crew/readiness/验收任务文案、`teamPlanSchema` 类型 1|2|3）；`test/桌面应用/interface.test.ts`（`operator-wiring.test.ts` 条件）。
- **测试**：`test/测试/` 的 v3 夹具/负例/完整链路/布局核对 e2e；`test/测试/governance-e2e-auto/*` 受影响文件；v3 与 legacy v2 链路；T3 全量回归；真实启动/演示。
- **可选（默认 N/A）**：桌面UI 的目录/规范提示（`app/renderer/src/chat/governance-view.ts`/`role-view.ts`，须排在 i18n B1/B2 之后）；项目管理在自身 `角色卡/项目管理/docs/` 登记 v3 规则（不改 `ENGINEERING_QUALITY_BASELINE` 与既有法案文本）。

**管理记录（不是产品候选）：** 顶层 `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/`、`docs/verification/`；其中本任务的标准、报告、团队计划、变更包、沟通记录是验收引用与证据载体，不纳入产品候选。

**明确非目标（方案 §12、团队计划 §1.3、闸门 2 记录）：**

- 不一次性迁移/重写全部历史角色边界、旧 v2 团队计划、旧 flow、旧角色卡；本仓库现有角色不在本轮迁移。
- 不用目录级授权放宽治理关键路径（角色卡/边界、release/packaging、`.ans`、`src/common/shared/`、密钥相关）；这些继续精确授权。
- 不把 i18n 与目录授权合并成一个改动、一个标准或一个报告。
- 不新增 `cardKind`、`FlowStepKind`、`GovernancePower`、`GovernanceDecisionKind`、artifact kind。
- 不改变派发权归属、客户入口、角色 id/显示名/路径、工程基线文本（`ENGINEERING_QUALITY_BASELINE`）。
- 默认不改 `src/model/{boundary,role,decision}.ts`、`src/service/gate/resolve-write.ts`、`TaskScope`/F4、`src/provider/runtime/{tools,schema}.ts`；不做任务级 `writeDirs`（策略 B）。
- 不新增固定测试角色；不改变本仓库工作团队结构；不重写历史 `docs/nominations/**`、旧 flow、旧 v1/v2 团队计划。
- 不提交、不推送、不合并、不发布；未启用 task_ops，不伪造任务令牌、锁、审批或机器预检。

**写集核对口径：** 以团队计划 §4.3/§八的逐角色精确写集为准。`test/桌面应用/` 对桌面窗口是逐文件授权，默认不得新建文件；新断言并入 `interface.test.ts` 等既有精确文件，确需新文件必须先由人事按闸门 2 补充精确单文件条目。`src/common/编排/directory-conformance.ts`、`test/编排/directory-conformance.test.ts`、`test/测试/directory-layout.test.ts` 位于既有目录授权内，不触发边界变更。顶层 `docs/scheduling/` 与 `docs/acceptance/` 只由内置统筹/验收写，worker 不得写。`docs/verification/` 是产品运行期证据根，不在本仓库测试角色 Section 1 内；本仓库执行时测试证据写 `角色卡/测试/docs/`，产品 e2e 只在临时项目根内生成 `docs/verification/`。

### 1.4 完成定义（高层）

当前产品候选同时满足以下条件，才可能判**通过**：

1. §4.2 验收表 P1–P15、G1–G3 全部适用行 pass；P1–P15 不得整行 `not applicable`。
2. 风险档位核对为 T3；适用的 T3 全量回归已对当前候选执行，并与实施前基线逐项对照；无本次新增失败。
3. 真实启动应用/演示证据存在且对应当前候选；不能以单元测试或 mock 替代。
4. 候选身份可复算，变更包完整，所有改动在闸门 2 写集内；既有授权边界校正不扩大。
5. 验收报告首行含风险档位、判定依据、选定检查、复用证据、全量回归五项；报告链接标准版本、候选、证据与未解决问题。
6. v3 完整链路与 legacy v2 链路均通过；布局核对报告可复算，且与原始 `git status`/diff 一致。
7. **结构通过不等于语义正确**：应用只证明字段/覆盖/不重叠/无环/边界覆盖/路径规则；目录是否内聚、规范是否合理、共享是否必要、契约/测试面是否真实由 Convener readiness 记录，验收核对实际布局；不得把「字段齐全」当「粒度正确」。
8. 与 i18n T2 分开判定：本变更的通过只覆盖目录授权候选，不覆盖 i18n；两变更各自标准、各自报告、各自结论。

### 1.5 重要边界情形

以下情形至少构成 **fail**（有证据表明候选不满足标准）：

- v3 计划缺 `teamPlanSchema: 3`/`directories`/目录规范表仍通过；或 v2 计划被强制迁移、v2 行为被改变（P1/P9）。
- frontmatter `directories`、目录规范表、角色 `授权目录` 三处不一致（多、少、重复、owner 不符、孤儿目录）（P2/P4）。
- 目录规范缺必填字段/枚举非法；命名/子目录/文件类型/依赖/禁写区不可校验；依赖目标不存在或成环；`shared: split` 违规（P3/P5）。
- 两个角色 owner 同一目录；目录嵌套未拆分；精确文件落在他人目录内；无 owner 的目录（P4）。
- `.ans/`、`角色卡/`、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、`docs/flows/`、`docs/nominations/`、`docs/verification/`、`src/common/shared/`、release/packaging、`.env`/密钥、根单例契约被当作普通 `授权目录` 分配（P6）。
- V-D1–V-D9 缺规则、规则不阻断、只在桌面侧执行或在发卡/写账本之后才执行（P7）。
- 计划目录未被边界覆盖仍通过；`new` 角色边界目录比计划宽仍通过；`changed`/`existing` 被强制重写；来源分流把计划问题冒充 Crew 文件问题（P8）。
- 旧 v1/v2 计划、旧 flow、旧角色卡被删除/重写；v2 完整链路失败；旧计划被批量改成 v3（P9/P15）。
- Convener/Crew/Verifier 卡文本仍只讲 v2 精确写集；任务文案未含授权目录/规范/布局；卡前守卫未跑 V-D（P10）。
- readiness 没有目录/规范/共享/布局列；应用或卡文本宣称「结构通过即粒度正确/规范合理」（P11）。
- 布局核对只看计划文本不看实际改动路径；报告与候选不符；fail 仍被标 pass；跨目录/他人目录/禁写区/命名/类型/子目录越界未被发现（P12）。
- 引入任务级 `writeDirs`（策略 B）、改 `TaskScope`/F4/session/dispatch、或其它非目标改动（P13）。
- v3 破坏 Map/Reduce 并行或测试分片隔离；分片共享可变项目根/端口/日志/manifest 缺失（P14）。
- 本仓库现有角色被迁移/重写；除闸门 2 授权的两条边界条目外出现角色卡/边界改动（P15）。
- 写集越界、提交/推送/合并/发布、worker 写 `docs/scheduling/`/`docs/acceptance/`、`test/桌面应用/` 新建文件未授权（G1/G2）。
- 文档状态把设计写成已实施/已验收，或把 v1.6.0 发布候选混入本轮（G3）。

以下情形构成 **insufficient evidence**（尚不能判断）：

- 候选哈希与变更包不符，或证据来自另一个候选/HEAD/工作树。
- 缺原始命令输出、退出码、环境、测试计数或失败原文；只有角色自述或「工具成功」。
- v3/legacy 链路日志、布局核对报告、readiness 样例、卡文本断言缺失或无法对应候选。
- T3 全量回归未跑、基线未记录、既有失败没有基线对照，或新增失败被笼统归为「环境问题」。
- 真实启动/演示证据缺失、无法定位或无法对应候选。
- 报告首行缺五项，或标准/报告/方案版本无法核对。
- 既有授权边界校正的 diff 无法确认恰好只有两条条目与对应 changelog。

---

## 二、写标准时的只读基线核对（2026-10-23）

本节记录验收写标准时的实测事实，供判定时对照；不是候选，也不构成实施。

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| HEAD | `git rev-parse HEAD` | `ee59296545ce9c6ac7cae7693dfc2138b9f5e6d1` |
| 工作树 | `git status --short` | ` M docs/communication/memo.md`；` M docs/planning/memo.md`；` M 角色卡/桌面窗口/boundary.md`；` M 角色卡/桌面窗口/changelog.md`；未跟踪 `.claude/`、`demos/`、`docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md`、`docs/planning/2026-10-23_design_directory-ownership.md`、`docs/planning/2026-10-23_design_i18n.md`、`docs/scheduling/2026-10-23-directory-ownership-team-plan.md`、`docs/scheduling/2026-10-23-i18n-team-plan.md`、`docs/scheduling/memo.md`。以上除边界校正外均非产品代码改动 |
| 已跟踪代码/测试改动 | `git status --short` 对照 | 无 `src/**`、`app/**`、`test/**` 的已跟踪改动 |
| 暂存区 | `git diff --cached --name-only` | 空 |
| 边界校正 diff | `git diff --stat -- 角色卡/桌面窗口/boundary.md 角色卡/桌面窗口/changelog.md` | 2 文件、4 行新增；boundary.md 恰为 `acceptance-dispatch.test.ts`、`runtime-resolution.test.ts` 两行；changelog 为对应漂移校正记录。符合闸门 2「授权人事补边界条目」 |
| Node/npm | `node --version` / `npm --version` | 当前验收 shell（Git Bash）**不在 PATH**；上轮记录 Node v24.22.1 / npm 11.19.1 位于 `C:\Users\51054\AppData\Local\Programs\nodejs\`。实施/测试必须记录实际调用路径与实测版本，不能只写「node 可用」 |
| 平台/Shell | OS/环境 | Windows 11 Pro 10.0.26300；Git Bash |
| 仓库脚本 | `package.json` | `typecheck` = `tsc --noEmit`；`typecheck:renderer` = `tsc -p app/renderer/tsconfig.json`；`build:renderer` = `vite build --config vite.config.ts`；`app` = `electron app/main.ts`；仓库无 `test` 脚本，测试用 `node --test` |
| 新增文件预期 | 文件系统 | `src/common/编排/directory-conformance.ts` 当前不存在（实施新增）；`docs/acceptance/directory-ownership-criteria-v1.md` 当前不存在（本文件）；`docs/acceptance/directory-ownership-report-v1.md` 当前不存在（报告另写） |

**确认的基线文档哈希（写标准时工作区内容）：**

| 文件 | 角色 | `git hash-object` | `sha256sum` |
| --- | --- | --- | --- |
| `docs/planning/2026-10-23_design_directory-ownership.md` | 验收基线（方案 v1） | `bcf0e0e595f23a0ce50f3b8ca0e80d2b1fe57428` | `0f36fcd297bbefebb8826e5de41e9b2342cdd68a1bbe7e85c593bb100cc97ad6` |
| `docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md` | 闸门 0/1/2 与实施授权记录 | `2c57c0e6466390fa8f0ca377d442224eb713b507` | `f3098298f19ef21db2d473b88321e7ac18df23fee0cbea3813ba55fcb5d776a6` |
| `docs/scheduling/2026-10-23-directory-ownership-team-plan.md` | 闸门 2 确认的范围/写集（非标准来源） | `3d3691d80018d0c5d52e18769f249be0aafbbc10` | `fdadae1abe78e578a60250c3106fe28168be007cbc6b4259a5583210dcdf5910` |
| `角色卡/项目管理/docs/project-rules.md` | 工程法案（§二.9 风险档位要求） | `fdb738bb01035b9a270aaf5cbbcb89c6d1da2484` | `fdc5055906bcbb0f5d57d68cdaae05c4a27af1f13c7225374fbeda1a06ab3d9f` |

**基线边界校正文件哈希（工作区当前内容；判定时用于确认未被继续扩大）：**

| 文件 | `git hash-object` | HEAD 版本 blob |
| --- | --- | --- |
| `角色卡/桌面窗口/boundary.md` | `b13881b8935309c123a6681f1f6017583f5d18da` | `2668bc781b38f03be882f92955983d5c193e9a90` |
| `角色卡/桌面窗口/changelog.md` | `b0e7ca9a12797a52f4f35a59e7936fe87d6c46db` | `450dff29d39cd967dcb519f6a646ba98bd6f0c20` |

**环境与记录注意：**

- 团队计划实测 SHA-256/blob 与闸门 2 确认记录一致，范围/写集输入可追溯；方案与意图记录为未跟踪管理记录，哈希用于确认判定时的版本。
- 本标准自身写入后，`git status --short` 会新增 `?? docs/acceptance/directory-ownership-criteria-v1.md`；这是管理记录，不是产品候选。
- 并行任务可能同时新增其他未跟踪管理/证据文件（例如 i18n 标准 `docs/acceptance/i18n-criteria-v1.md`、测试角色的基线证据目录）；它们不属于本变更产品候选，也不得用本变更验收结论为其背书。判定时以 G1/G2 与变更包对照为准。
- 若判定时上述基线文档哈希变化，按 §3.3 处理；方案/意图/团队计划版本变化时，验收基线或范围依据失效，不能静默按旧版本判定。
- 验收 shell 无 Node PATH；判定时若需复算，按实施/测试记录的实际路径调用，并记录版本与退出码。

---

## 三、候选身份与证据失效规则

### 3.1 候选身份

**产品候选**是判定时下列文件的精确内容：

- `src/**`、`app/**`、`test/**`；
- `角色卡/**`（含 `role-card.md`、`boundary.md`、`boundary.yaml`、`api-spec.md`、`feature-map.md`、`functional-description.md`、`memo.md`、`docs/**` 等角色自身文档）；本任务默认不改角色卡/边界，唯一例外是闸门 2 已授权的桌面窗口边界漂移校正（两条精确单文件条目 + 对应 changelog）；若出现其他改动，按 P15/G2 核对授权；
- 构建/配置文件中确属本任务授权范围的改动（本任务默认不改；若出现，按 G2 核对授权）。

候选身份用以下组合标识，缺一不可：

1. `git rev-parse HEAD`；
2. 每个产品改动文件的相对路径、`git hash-object`（Git blob SHA-1）与 `sha256sum`（文件 SHA-256）；
3. `git status --short`、`git diff --name-only`、`git diff --stat`、`git diff --cached --name-only` 原始输出；
4. 变更包声明的候选标识必须与上述复算一致；不一致时按 `insufficient evidence` 处理。

**管理记录不是产品候选：** 顶层 `docs/communication/`、`docs/planning/`、`docs/scheduling/`、`docs/acceptance/`、`docs/verification/` 的文件哈希不用于标识产品候选，也不得把管理记录的变化说成产品改动。它们可以作为验收标准、变更包、证据链接的载体；若方案、标准或团队计划版本变化，按 §3.3 处理，而不是当作产品候选变化。

**候选冻结：** 统筹提交变更包并声明候选后，候选冻结。判定前任一产品文件内容变化（任一哈希变化），受影响证据失效，按 §3.3 重取；不得在变化后的候选上沿用旧证据。

### 3.2 证据原始性与复用

- **原始证据**指：原始命令输出（命令、cwd、时间、执行者、退出码、stdout/stderr）、测试计数（pass/fail/skip）、失败原文、候选文件哈希、diff/status、v3/legacy e2e 日志、布局核对报告与原始候选清单、readiness 样例、卡文本/任务文案断言输出、真实启动/演示的日志或截图清单。开发自述、测试转述、工具成功提示、计划文本都不能单独作为原始证据。
- **证据生成时间**必须晚于本标准写盘时间；早于标准的证据按流程不符处理（`insufficient evidence` 或退回统筹）。
- **复用规则：** 只有同候选、同输入/依赖、同命令、同环境的证据可以复用。复用须在报告「复用证据」栏写明来源、原候选、原命令和仍然有效的理由。候选、输入、依赖、契约、夹具、配置或环境变化时，受影响证据失效，只补失效部分；不能因为「别的角色跑过」就跳过必需检查。
- **T3 全量回归不是可复用项：** 必须对当前候选执行；基线只用于区分既有失败，不能替代最终候选的全量回归。
- **布局核对报告不是授权：** 报告是证据，不是写入权；不得因为报告 pass 就改变角色边界或计划授权，也不得用报告摘要替代原始 `git status`/diff。

### 3.3 证据失效矩阵

| 证据生成后的变化 | 失效范围 | 处理 |
| --- | --- | --- |
| 任一 `src/**` 或 `app/**` 产品代码变化 | 受影响单测/层测试/集成/e2e；V-D/V12/布局核对/卡文本断言；全量回归结论；候选哈希 | 重取受影响证据；候选变化后受影响链路与全量回归重新执行 |
| `src/common/编排/team-plan.ts` 解析/校验变化 | v3 正负例、V1–V11、V-D1–D9、V12 消费、legacy 夹具、相关 e2e | 重跑解析/校验正负例、卡前守卫与桌面写卡后校验；同一计划文本同源复验 |
| 新增 `src/common/编排/directory-conformance.ts` 或布局规则变化 | 布局核对单测/e2e、报告、受影响验收行 | 重跑布局正负例和 e2e；已有报告失效 |
| `app/desktop/interface.ts` V12/`parseTeamPlanInfo` 变化 | 桌面 V12、来源分流、legacy warning、相关 e2e | 重跑 `test/桌面应用/interface.test.ts` 与相关链路 |
| `app/desktop/governance-advance.ts` 任务文案变化 | readiness/验收任务文案断言、e2e 中冻结文案 | 重跑对应断言；不得只改断言不改真实文案 |
| `src/common/门禁引擎/governance-roles.ts` 卡文本变化 | 卡文本断言、e2e、注册表 entries/forbidden/preauthorized 对照 | 重跑 `test/门禁引擎/` 与相关 e2e；注册表写权必须零变化 |
| `src/model/runtime.ts` 共享 Model 契约变化 | 所有引用该契约的下游测试、判断物证、类型检查、桌面消费、e2e | 契约冻结后重跑所有受影响调用方；旧证据全部失效；下游不得在冻结前引用新字段 |
| 任一 `test/**` 测试文件或共享夹具变化 | 该测试套件及其依赖的集成/e2e；全量回归 | 重跑该套件与受影响链路；不得只重跑新增用例 |
| `角色卡/**`（role-card/boundary/角色文档）变化 | 治理卡文本、写权、readiness、e2e 中冻结角色卡的断言 | 除闸门 2 授权校正外，本任务默认不得改；出现即按 P15/G2 核对 |
| 构建/配置（`package.json`、`tsconfig*.json`、`vite.config.ts` 等）变化 | 构建、typecheck、全量回归；候选范围 | 本任务默认不改；若出现，按 G2 核对授权并重跑受影响检查 |
| 顶层 `docs/` 管理记录变化 | **不直接影响产品候选**；若方案/标准/团队计划版本或确认记录变化，则影响验收基线/范围依据 | 方案实质变化重开闸门 1；标准变化按 §3.6；团队计划变化重核写集；确认记录变化补沟通确认 |
| HEAD 或基线变化 | 基线对照、既有失败分类、候选身份中的 HEAD | 重新建立基线；无法建立时 `insufficient evidence` |
| 环境变化（Node/npm/OS/Shell/依赖） | 受环境影响的全量回归、e2e、启动演示 | 记录新环境并重跑受影响检查；不能把环境差异当成通过 |
| 证据文件被替换、丢失或无法追溯 | 对应验收行 | `insufficient evidence`，重取原始输出 |

### 3.4 T3 全量回归规则

本任务有代码/测试面（`src/common/编排`、`src/pipeline/orchestration`、`src/common/门禁引擎`、`src/model/runtime.ts`、`app/desktop`、`test/**`），T3 的适用全量回归**必须执行**，不能用 N/A 掩盖：

- **基线先行（D3）：** 实施前由测试角色在实施前 HEAD/工作树（与本标准 §二 基线一致）跑同一组命令，记录命令、cwd、时间、执行者、环境（Node/npm/OS/Shell）、退出码、测试计数（pass/fail/skip/todo）、失败清单与分类；基线完成前不得开始 D4 代码改动。
- **最终候选（D7）：** 对当前候选执行：
  - `node --test "test/**/*.test.ts"`
  - `npm run typecheck`
  - `npm run typecheck:renderer`
  - `npm run build:renderer`（默认 N/A：本变更不改渲染层产品代码；若桌面UI 可选项发生改动，由桌面UI 对同一候选产出并复用其证据）
- **失败分类：** 逐项区分「本次新增失败」「既有失败（如 Windows symlink `EPERM`、桌面测试并发偶发）」「环境不可用/跳过」。既有失败必须附基线原始输出、失败原文与原因，不能笼统写「环境问题」；新增失败不得放行。
- **并行偶发：** 并行全量出现桌面时序偶发时，必须以隔离/整文件/串行复跑分类；不得把新增红归为基线红，也不得用并行偶发掩盖真实失败。
- **治理/共享抽象检查：** v3 前后 v2 计划逐字不变；`src/common/shared/` 零改动；`src/model/{boundary,role,decision}.ts`/`resolve-write.ts` 零改动（除非客户改选策略 B 并另开设计）；`BUILT_IN_GOVERNANCE_ROLES` entries/forbidden/preauthorized 零变化；`ENGINEERING_QUALITY_BASELINE` 文本零变化。
- **N/A 限制：** N/A 只允许用于「某项检查确实没有代码/测试面」的个别说明，且必须写明理由；不得用 N/A 跳过全量回归、v3/legacy e2e、布局核对或真实启动/演示。
- **证据有效性：** 全量回归证据只对当前候选有效；候选变化后受影响部分失效并重跑。

### 3.5 与 i18n（T2）变更分开判定

- 本变更是「程序计划」中的变更 B（T3）；i18n 是变更 A（T2）。两者**独立标准、独立实施窗口、独立验收、独立报告**，不合并判定。
- 本文件只判定目录授权候选；不得用本报告的通过结论为 i18n 候选背书，也不得把 i18n 的 T2 证据当作本变更的 T3 证据。
- 共享文件 `app/desktop/interface.ts`、`app/desktop/governance-advance.ts`、`test/桌面应用/interface.test.ts` 按团队计划 §4.7 顺序串行写（推荐 i18n B0 → 本变更 → i18n B1/B2/B3/B4）；若候选包含 i18n 改动，必须声明为「既有上下文」，不纳入本变更候选，也不得用本变更验收结论覆盖。
- 本文件不改变闸门 2 对两变更的档位（本变更 T3、i18n T2）与写集；若客户改变顺序或合并范围，先由沟通/统筹重开确认，本标准不据此判定。

### 3.6 标准版本冻结

- 本文件版本为 `directory-ownership-criteria-v1.1`，写盘后冻结；标准先于实施，实施开始后不得为适配候选修改。
- **版本历史与本次澄清（2026-10-23）：** v1 初版；v1.1 仅澄清 v3 模块清单 `实现目录` 必填口径。依据：客户在闸门 1 已确认 §13 Q9 A「模块清单新增 `实现目录`；角色目录必须在其下」，闸门 2 确认的团队计划 §2.3 同文，`docs/communication/` 闸门 2 记录确认；方案正文 §4.5/§5.2/V-D6 的「可选但推荐/若存在」是方案内部措辞不一致，以客户已确认的 Q9 A 为授权事实。v1 尚未用于任何候选判定；本次不改变方案、团队计划、闸门 2 写集、T3 档位或 i18n T2，也不需要重开闸门 1（客户已确认 Q9 A，本次只是实施前标准的澄清）。
- 若发现标准本身有误、与方案 §11 冲突或与闸门 0/1 确认范围不一致：记录问题、理由和受影响行，递增为下一版本（v1.2 或 v2），交沟通/统筹确认后再用新版本判定；受影响证据重新核对，旧报告过期。
- 本标准是管理记录，不是客户确认记录，也不是验收结论；标准版本变化不自动改变方案或团队计划。
- **验收报告另写 `docs/acceptance/directory-ownership-report-v1.md`；本文件不是报告，不产生 pass/fail/insufficient evidence 结论。**

---

## 四、验收标准

### 4.1 标准来源映射

#### 4.1.1 方案 §11 P1–P12 与验收行

| 方案 §11 行 | 覆盖的验收行 | 说明 |
| --- | --- | --- |
| P1 v3 schema | P1、P2、P3 | schema/frontmatter/角色表/目录规范表与 v1/v2 兼容 |
| P2 目录覆盖/唯一 owner/不重叠 | P4 | 目录集合、owner 唯一、目录/精确文件不重叠 |
| P3 目录规范 | P3 | 字段/枚举/语法/依赖 DAG/禁写区 |
| P4 治理关键路径 | P6 | `.ans`/角色卡/release/shared/密钥/根单例契约精确授权 |
| P5 边界对齐（V12） | P8 | 计划目录 vs boundary；new/changed/existing；来源分流 |
| P6 实际布局核对 | P12 | 改动路径 → 目录规范；报告可复算 |
| P7 共享目录 | P5 | 单 owner/read-only/split；不允许共写 |
| P8 迁移/兼容 | P9、P15 | v1/v2/v3 共存；旧计划/flow/角色卡不重写；本仓库角色不迁移 |
| P9 卡文本/任务文案/readiness | P10、P11 | Convener/Crew/Verifier 卡文本；任务文案；readiness 目录记录 |
| P10 非目标 | P13、P15、G2 | 不改派发权/入口/命名/枚举/工程基线；不做任务级硬拦；不迁移 |
| P11 测试与证据 | P14、G1、G2、§3.4 | 受影响测试/e2e/分片；T3 全量回归；候选与证据 |
| P12 文档状态 | G3 | 实施/测试/验收状态如实；不与 v1.6.0 发布混 |

#### 4.1.2 §13 Q1–Q12 推荐 A 映射

| 问题 | 闸门 1 已选推荐 A | 覆盖行 |
| --- | --- | --- |
| Q1 规范格式/位置 | 团队计划内 Markdown 表；frontmatter `directories` 强制；不新增权威规范文件 | P1、P2、P3 |
| Q2 子目录 | 允许在 `允许子目录` 声明范围内（`—`/显式列表/`*` 一层/`**` 任意层）；超出即失败 | P3、P7、P12 |
| Q3 共享目录 | 单 owner 默认；大型共享树用 `shared: split` 显式子目录 owner；不允许共写 | P5 |
| Q4 迁移范围 | 新流程 v3；旧 v2/v1 不强制；下一次实质变更时迁移；不设硬截止；本仓库现有角色本轮不迁移 | P9、P15 |
| Q5 运行期强制力 | **策略 A**：边界目录硬拦 + 任务文本 + 布局核对；`new` 边界与计划一致；`changed`/`existing` 计划 ⊆ 边界，更宽限于模块实现目录/既有职责；不做任务级 `writeDirs` | P8、P10、P13 |
| Q6 治理关键路径 | 按方案 §5.5 清单继续精确授权；`src/model/` 不整体目录授权；`docs/verification/` 归测试/验收专用 | P6 |
| Q7 文件例外 | 允许 `精确写集` 例外，但必须写 `粒度理由`；不覆盖治理关键路径既有归属 | P4、P6 |
| Q8 命名/文件类型 | 代码/测试目录 ASCII kebab-case；扩展名按类型；角色根文档目录（中文）不在计划目录内 | P3、P12 |
| Q9 模块实现目录 | 模块清单新增 `实现目录`；v3 每个 module 必填非空，角色 implementation/tests/docs 目录必须在其下（或模块目录本身）；缺失按 V-D6 error；v2 legacy 不变 | P3、P7、P9 |
| Q10 规范变更 | 只有 Convener 能改计划/规范；新计划版本 + readiness 重跑；角色/范围实质变化重开闸门 2 | P10、P11、G2 |
| Q11 空目录 | 规范可先于目录存在；首次写入时创建；边界目录条目不要求目录已存在 | P3、P8、P12 |
| Q12 布局核对 | 测试角色/验收脚本用纯函数核对；Verifier 读报告 + 原始证据 | P12 |

#### 4.1.3 补充行说明

- **P1–P15 覆盖方案 §11 P1–P12 的全部标准，不新增产品需求。** P13 同时吸收方案 §11 P10 的非目标；G3 吸收方案 §11 P12 的文档状态要求；G1/G2 是候选身份/变更包与闸门 2 写集核对，属于验收流程要求，不是产品行为标准。
- P1–P15 中出现的「目录规范」「V-D」「V12」「布局核对」均取自方案 §4–§6、§8；不得解释为额外功能。
- 未选的备选分支（Q5 B、Q4 C、Q3 C 等）不是本轮要求；实施者不得用它们替代已确认的推荐 A。

### 4.2 验收表

下表是判定时使用的核心表格。实施前「实际证据路径/哈希」「候选版本」「结果」「验收判断」填「待提交/待判定」；判定时由独立验收按同一标准版本填入，不改变标准条文。

每行证据均须附：对应候选哈希、原始 `git status --short` / `git diff` 输出、产生该行结论的命令输出。涉及 v3/legacy 链路、布局核对、readiness、卡文本、真实启动/演示的行还须附对应原始日志/样例；只有角色自述或「工具成功」不构成原始证据。

| ID | 方案条目/标准 | 需要的证据 | 实际证据路径/哈希 | 候选版本 | 产出角色 | 结果 | 验收判断 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | v3 schema（§11 P1；§5.1–§5.3；Q1/Q6/Q11 A）：frontmatter `teamPlanSchema: 3` 与 `directories`；角色表含 `授权目录`/`精确写集`（`唯一写集` 为 v3 兼容别名带 warning；`边界` 别名在 v3 不再接受）；目录规范表存在；解析结果为 `teamPlanSchema: 1 \| 2 \| 3`；`GovernanceJudgeFacts` 类型闭环（可选 3，或有经说明的映射且不假装看到 v3）；v1 缺省/`1` 与 v2 `2` 分支逐字不变。 | schema/解析 diff；v3 样例；v1/v2 legacy 测试；别名正负例；类型 diff；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、运行时核心（条件）、桌面窗口、测试 | 待判定 | 待判定 |
| P2 | 三处一致（§11 P1/P2；§5.2；Q1 A）：frontmatter `directories`、目录规范表、角色 `授权目录` 三处完全一致（不多、不少、不重复）；每目录 owner 与规范行一致；每个目录至少被一个角色行引用（无孤儿）；角色行引用的目录都在 `directories` 中；重复/缺失/额外/owner 不符均拒绝。 | 正/负例测试；v3 样例；三集合对照输出；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、测试 | 待判定 | 待判定 |
| P3 | 目录规范字段（§11 P3；§4.3；Q2/Q8/Q9 A）：`DirectorySpec` 含 `目录/owner/类型/用途/命名/允许子目录/允许文件类型/公开契约/测试面/依赖/禁写区/共享`；类型枚举 `implementation/tests/docs/evidence/shared`；命名 `any`/`kebab-case`/`camelCase`/`snake_case`/`*.test.ts` 等固定枚举或简单正则；子目录 `—`/显式列表/`*` 一层/`**` 任意层；扩展名分号列表、`*` 仅 docs/evidence；公开契约路径或 `internal` + 理由；`implementation`/`tests` 测试面必填，`docs`/`evidence` 可 `—`；依赖目标存在、无自依赖/重复、DAG 无环且与角色 `dependsOn` 方向一致；禁写区在目录内且不与允许类型冲突；共享枚举合法；v3 模块清单每个 module 的 `实现目录` 必填非空（Q9 A），角色 implementation/tests/docs 目录必须在其下或模块目录本身。 | 解析/负例矩阵（逐字段）；规范样例；依赖 DAG 输出；缺 `实现目录`/目录不在模块实现目录内的负例；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、测试 | 待判定 | 待判定 |
| P4 | 唯一 owner/不重叠（§11 P2；§5.3 V-D2/D3/D4；Q7 A）：每个目录恰好一个 owner；不同角色目录不得相同/互为祖先/子目录（`shared: split` 父目录除外且不得被直接分配）；精确文件不得落在他人目录内；精确文件之间不得相等；目录与精确文件按包含关系判重叠；推荐角色至少有一个 `授权目录` 或 `精确写集`（文件例外需 `粒度理由`）。 | 正/负例测试；重叠矩阵；v3 样例；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、测试 | 待判定 | 待判定 |
| P5 | 共享目录（§11 P7；§4.4；§5.3 V-D5/V-D8；Q3 A）：`shared: none/read-only/split`；`none` 不得被其他角色引用；`read-only` 只能一个 owner；`split` 父目录本身不分配、子目录各行有 owner；不允许两个角色 owner 同一目录；`src/common/shared/` 仍由项目管理唯一 owner，不作为执行角色的 `授权目录`。 | 正/负例测试；共享样例；计划/boundary 对照；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、测试、项目管理（只读核对） | 待判定 | 待判定 |
| P6 | 治理关键路径精确授权（§11 P4；§5.5；Q6 A）：`.ans`、`角色卡/`、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、`docs/flows/`、`docs/nominations/`、`docs/verification/`、`src/common/shared/`、release/packaging（`package.json`、`package-lock.json`、`electron-builder.yml`、`.github/workflows/**`、`src/common/装配/release-*`、`bin/ans.js`、`tsconfig.json`、`vite.config.ts`）、`.env`/`.env.*`/密钥路径、根单例契约（`src/model/{boundary,role,decision}.ts`、`src/model/runtime.ts`）不得作为普通 `授权目录`；只能按既有治理授权精确文件；`src/model/` 不整体目录授权。 | 负例矩阵；计划/写集/边界对照；`src/common/shared/` 与 `src/model/` diff 为空；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、门禁引擎、桌面窗口、测试 | 待判定 | 待判定 |
| P7 | V-D1–V-D9（§11 P1/P3/P4；§5.3）：九条确定性规则全部实现且规则 ID/severity 可核对；V-D1 frontmatter 目录；V-D2 规范覆盖/owner/必填/枚举；V-D3 角色引用/孤儿/文件例外；V-D4 不重叠；V-D5 规范语法/依赖 DAG/split；V-D6 模块 `实现目录`（v3 每个 module 必填非空；缺失即 error；角色 implementation/tests/docs 目录必须在对应模块 `实现目录` 内或模块目录本身）/整层黑名单（至少覆盖 `src`/`app`/`test`/`common`/`shared`/`utils` 等整层名；有 `粒度理由` → exception-review，不硬拒）/单文件 warning；V-D7 治理路径；V-D8 共享策略；V-D9 路径逃逸/大小写/Windows；错误在卡前守卫阻断（不发卡、不写账本、不占 pending），warning/exception-review 不阻断；不调用模型。 | 规则 ID 清单；逐规则负例矩阵（含缺 `实现目录` 的 v3 计划被拒绝、角色目录不在模块实现目录内被拒绝）；卡前守卫测试（无卡/无账本）；路径安全测试；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、门禁引擎、测试 | 待判定 | 待判定 |
| P8 | V12 扩展（§11 P5；§5.3 V12；Q5 A）：每个 `授权目录` 被该角色 boundary.yaml 的 `directory`/`conditional-directory`（条件已声明）覆盖；每个 `精确写集` 文件被 `file` 或 `directory` 覆盖；`new` 角色边界目录（排除 `角色卡/<roleId>/` 角色根）与计划 `授权目录` 集合一致（不得更宽）；`changed`/`existing` 计划 ⊆ 边界，更宽部分必须在该角色模块实现目录/既有职责内，越出 warning + readiness；`existing` 宽边界只 warning + 迁移提示；来源分流（Crew 文件问题 vs 计划问题）可观察；V12 失败不派 readiness；v2 V12 行为不变。 | V12 正/负例；`test/桌面应用/interface.test.ts`；boundary 样例；来源分流断言；v2 回归；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 桌面窗口、编排、测试 | 待判定 | 待判定 |
| P9 | v1/v2 legacy 不变（§11 P1/P8；§5.1/§5.6；Q4 A）：缺省/`teamPlanSchema: 1` 按 legacy 只跑旧表格检查；`teamPlanSchema: 2` 按 v2 V1–V12 逐字不变；旧计划/旧 flow/旧角色卡不重写；桌面迁移 warning 保留；v2 完整链路至少一条保持通过；v2 夹具不被批量改成 v3；v3 不改变 flow schema/V11；v3 模块 `实现目录` 必填仅作用于 v3，v1/v2 legacy 不受影响。 | legacy 测试；v2 e2e；旧计划/flow/角色卡 diff；夹具清单；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、桌面窗口、测试 | 待判定 | 待判定 |
| P10 | 卡前守卫/卡文本/任务文案（§11 P9；§4.4/§5.4；§7.1/§8.3）：`validateConvenerAppointmentCard` 支持 schema 3 并在发卡前跑 V-D；Convener 卡文本要求 v3 计划/目录规范/每个 module 的 `实现目录`（必填非空）/共享/治理关键路径/readiness 目录列；Crew 卡文本要求按授权目录写 boundary（目录条目 + 精确文件）、`new` 一致、不改规范/不跨目录；Verifier 卡文本要求核对布局报告 + 原始证据、不把结构通过当语义正确；`govern-session.ts` 提示同步；`governance-advance.ts` 任务文案含授权目录/规范/布局，`teamPlanSchema` 类型 1\|2\|3，legacy v2 文案保留；注册表 entries/forbidden/preauthorized 不变。 | 卡文本 diff/断言；任务文案测试；卡前守卫测试；`governance-trio`/`governance-standard-workflow`；注册表 diff；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 门禁引擎、编排、桌面窗口、测试 | 待判定 | 待判定 |
| P11 | readiness 目录记录（§11 P9；§5.4；Q10 A）：`docs/scheduling/<flowId>-readiness-v1.md` 有 frontmatter `flowId/version/status: pass 或 gaps`；逐角色/逐目录记录 `directories/spec/shared/layout`（并保留 v2 的 module/contract/testSurface/parallel/dependsOn/granularity）；目录与模块、规范合理性、共享必要性、契约/测试面真实性、边界对齐、例外均有记录；gap 退回 Crew，计划缺细节退回 Convener；readiness 不是验收标准/客户确认；应用不声称语义正确；计划/规范变更只由 Convener 以新版本写，不原地改已确认版本，角色/范围实质变化重开闸门 2，受影响证据失效。 | readiness 样例/列；v3 e2e；任务文案；卡文本断言；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、桌面窗口、门禁引擎、测试、独立验收 | 待判定 | 待判定 |
| P12 | 布局核对纯函数（§11 P6；§6.1–§6.5；Q12 A）：`src/common/编排/directory-conformance.ts` 提供 `DirectorySpec`/`LayoutCheckInput`/`LayoutCheckRow` 纯函数，经 pipeline 公共出口消费，桌面不复制；复用 `path-primitives`/`resolveWrite` 口径；跳过管理记录与角色根工作文档；最长前缀匹配 owner；无 owner/多 owner fail；扩展名/子目录/命名/禁写区/路径安全逐项核对；删除按原路径、重命名按新路径、删除只能在自己目录内；e2e 临时项目根两角色：目录内新增文件 pass，跨目录/他人目录/禁写区/命名/子目录越界 fail；报告可复算并与原始 status/diff 一致。 | 纯函数 diff；单测正负例；e2e；报告样例；原始 `git status`/diff；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、测试、独立验收 | 待判定 | 待判定 |
| P13 | 运行期策略 A 与非目标（§11 P10；§10.4；Q5 A）：不做任务级 `writeDirs`；默认不改 `src/model/decision.ts` 的 `TaskScope`、`src/service/gate/resolve-write.ts` 的 F4、会话 scope/派发、`src/provider/runtime/{tools,schema}.ts`；运行期仍由边界目录硬拦越界写；任务文本写明授权目录/规范/不得跨目录/不得改规范；验收用布局核对兜底计划目录更细约束；不新增 `cardKind`/`FlowStepKind`/`GovernancePower`/`GovernanceDecisionKind`/artifact kind；不改派发权/客户入口/角色 id/显示名/路径/`ENGINEERING_QUALITY_BASELINE`。 | model/decision/resolve-write/session/provider diff；任务文案样例；边界硬拦测试；`writeDirs` grep；基线文本 diff；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 编排、桌面窗口、运行时核心、门禁引擎、测试 | 待判定 | 待判定 |
| P14 | Map/Reduce 与测试分片不回归（§11 P11；§5.2/§6.3；Q5 A）：v3 不改变 flow schema/V11；Map 并行组、dependsOn、Reduce 覆盖全部 Map 的行为不变；v3 e2e 含 Map 并行与 Reduce；测试分片按模块使用独立临时项目根/端口/日志/输出目录，不共享可变夹具，失败隔离，Reduce manifest 合并分片；至少一条 legacy v2 链路保持通过；不得把并行偶发当成通过或新增失败。 | `q-role-granularity`/`r-mapreduce-parallel` 输出；v3/legacy e2e 日志；分片日志/manifest；flow diff；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 测试、编排、桌面窗口 | 待判定 | 待判定 |
| P15 | 现有角色不迁移（§11 P8；§5.6；Q4 A）：本仓库 `角色卡/**` 不重写；除闸门 2 授权的桌面窗口边界漂移校正（恰好两条精确单文件条目 + 对应 changelog）外无角色卡/边界改动；不新增角色卡；旧 v1/v2 团队计划、旧 flow、旧角色卡不删除/不改写；`existing` 宽边界只 warning + 迁移提示；不强制迁移。 | `git diff -- 角色卡/**`；边界校正 diff；旧计划/flow 哈希；测试；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 人事（仅授权校正）、统筹、独立验收 | 待判定 | 待判定 |
| G1 | 变更包完整、候选身份可复算：变更包 `docs/scheduling/directory-ownership-change-v1.md` 含任务 ID、产品 flowId、候选哈希（每个产品改动文件 `git hash-object` + `sha256sum`）、`git rev-parse HEAD`、改动路径、任务节点 D1–D9、证据链接、风险档位 T3、复用证据与失效说明；候选可复算；`docs/` 管理记录不混入产品候选。 | 变更包原文；原始 hash/status 输出；验收复算输出；证据链接清单。 | 待提交 | 待提交（产品候选哈希，见变更包） | 统筹、独立验收 | 待判定 | 待判定 |
| G2 | 写集与授权：所有改动路径在闸门 2 确认的逐角色写集内；无越界、无保护文件/角色卡边界改动（授权校正除外）、无未授权用户改动；不提交/不推送/不合并/不发布；worker 不写 `docs/scheduling/`、`docs/acceptance/`；`test/桌面应用/` 不新建文件（除非闸门 2 另有精确单文件确认）；角色自身文档按写集允许。 | `git diff --name-only`/`--stat`/`status`/`--cached` 原始输出；与团队计划 §4.3/§八 对照；无提交记录；boundary/role-card 文件对照；候选哈希。 | 待提交 | 待提交（产品候选哈希，见变更包） | 统筹、独立验收 | 待判定 | 待判定 |
| G3 | 文档状态与版本记录（方案 §11 P12）：方案/实施/测试/验收状态如实；未实施不写成已实施、未验收不写成 `verified`（实现完成写 `implemented-unverified`）；未确认项标候选；不与 v1.6.0 发布记录/冻结源混；不声称已提交/推送/发布。 | 文档状态行；角色文档 diff；发布记录对照；候选哈希/diff/status。 | 待提交 | 待提交（产品候选哈希，见变更包） | 各实施角色、统筹、独立验收 | 待判定 | 待判定 |

### 4.3 各标准的具体核对口径

#### 4.3.1 P1：v3 schema 与类型闭环

**判定方法：**

- 读 `src/common/编排/team-plan.ts` diff：确认存在 v3 版本常量/分支，`parseTeamPlan` 对 `teamPlanSchema` 只接受 `1`/`2`/`3`；缺省/`1` 走 legacy，`2` 走 v2，`3` 走 v2 V1–V11 + V-D1–D9；未知值报错。
- 读 v3 样例：frontmatter `teamPlanSchema: 3`、`directories: [...]`；角色表含 `授权目录`/`精确写集`；目录规范表存在；`唯一写集` 作为 v3 兼容别名时产生 warning；`边界` 别名在 v3 报列名错误。
- 读 `src/pipeline/orchestration/run-role.ts`：卡前守卫返回 `teamPlanSchema: 1 | 2 | 3`；`src/model/runtime.ts` 的 `GovernanceJudgeFacts.teamPlanSchema?` 为 `1 | 2 | 3`，或桌面映射/丢弃 v3 信息有明确理由且 judge 不假装看到 v3；不新增 artifact kind。
- 跑 `test/编排/team-plan.test.ts`、legacy/v2 夹具；对比 v1/v2 断言与基线。

**最低证据：** 解析器/类型 diff；v3 计划样例；v1/v2 legacy 通过测试；别名正负例；类型检查输出；候选哈希/diff/status。

**通过：** 上述全部满足；v1/v2 行为逐字不变；未知 schema 被拒。
**失败：** v3 缺 `directories`/规范仍通过；v2 计划被强制迁移或 v2 行为改变；未知 schema 被接受；类型仍为 `1|2` 且未说明；新增 artifact kind。
**证据不足：** 只有 v3 样例，没有解析/legacy 测试或类型检查输出。

#### 4.3.2 P2：frontmatter/规范表/角色表三处一致

**判定方法：**

- 解析 v3 样例，构造三集合：frontmatter `directories`、目录规范表行、各角色 `授权目录` 并集；比较必须完全相等，无重复、无孤儿、无额外。
- 检查每行 owner 与对应角色的 `授权目录` 引用一致；每个目录至少被一个角色行引用；推荐角色的目录/精确写集符合 V-D3。
- 负例：frontmatter 缺目录、规范表多/少一行、重复目录、owner 不符、角色引用未声明目录、孤儿目录、同一角色重复行。

**最低证据：** 正/负例测试；三集合对照输出；v3 样例；候选哈希/diff/status。

**通过：** 三处完全一致，负例全部拒绝。
**失败：** 任一不一致仍通过；孤儿/未声明目录被接受。
**证据不足：** 只有人工样例，没有负例测试或解析输出。

#### 4.3.3 P3：DirectorySpec 字段与语法

**判定方法：**

- 逐字段核对 `DirectorySpec`/解析结果：目录、owner、类型、用途、命名、允许子目录、允许文件类型、公开契约、测试面、依赖、禁写区、共享。
- 类型枚举；命名枚举/正则；子目录 `—`/显式/`*`/`**`；扩展名列表与 `*` 限制；公开契约 `internal` + 非空理由；测试面必填规则；依赖目标存在、无自依赖/重复、DAG 无环且与角色 `dependsOn` 方向一致；禁写区在目录内且不与允许类型冲突；共享枚举。
- 负例逐字段构造；确认错误可定位到字段/目录。
- **`实现目录`（Q9 A / v1.1）：** 对 `teamPlanSchema: 3`，模块清单每个 module 必须有非空 `实现目录`；角色 `implementation`/`tests`/`docs` 目录必须在对应模块 `实现目录` 内或模块目录本身；缺失/不在其下按 V-D6 error 拒绝；v1/v2 legacy 不受影响。
- **结构通过不等于语义正确：** 字段齐全只证明可解析；目录是否内聚、规范是否合理、共享是否必要、契约/测试面是否真实，必须由 P11 readiness 记录并由验收核对实际布局（P12），不得以字段齐全代替。

**最低证据：** 解析/负例矩阵；规范样例；依赖 DAG 输出；缺 `实现目录` 的 v3 计划被拒绝、角色目录不在模块实现目录内被拒绝的负例输出；候选哈希/diff/status。

**通过：** 字段/枚举/语法/依赖/禁写区全部可校验，`实现目录` 必填与目录归属负例拒绝。
**失败：** 缺字段/空字段仍通过；扩展名过宽（implementation 用 `*`）；禁写区在目录外；依赖不存在/成环；split 违规；缺 `实现目录` 仍通过；角色目录不在模块实现目录内仍通过；把字段齐全当语义正确。
**证据不足：** 只有正向样例，没有逐字段负例或 DAG 输出。

#### 4.3.4 P4：唯一 owner 与不重叠

**判定方法：**

- 目录集合：每个目录恰好一个 owner；不同角色目录不得相同、互为祖先/子目录；`shared: split` 父目录本身不得被分配，子目录各自有 owner。
- 精确文件：不得落在他人目录内；精确文件之间不得相等；目录与精确文件按包含关系判重叠。
- 推荐角色至少有一个目录或精确写集；文件例外必须有 `粒度理由`。
- 负例：两个角色同目录、父/子目录未拆分、精确文件落入他人目录、两个精确文件相等、目录无 owner、孤儿目录。

**最低证据：** 正/负例测试；重叠矩阵；v3 样例；候选哈希/diff/status。

**通过：** 唯一 owner 与不重叠全部满足。
**失败：** 任一重叠/多 owner/孤儿/文件落入他人目录仍通过。
**证据不足：** 没有重叠矩阵或负例测试。

#### 4.3.5 P5：共享目录策略

**判定方法：**

- 核对 `shared` 枚举：`none` 私有，不得被其他角色引用；`read-only` 只能一个 owner；`split` 父目录只是容器、本身不分配，子目录各行有 owner；不允许两个角色 owner 同一目录。
- 核对 `src/common/shared/` 仍由项目管理唯一 owner，不是执行角色的 `授权目录`；shared 目录零改动（除非本变更明确不改，计划也明确不改）。
- 负例：两 owner 同目录、split 父目录被直接分配、shared 目录整目录分配给非 PM、read-only 目录被第二个角色写。

**最低证据：** 正/负例测试；共享样例；计划/boundary 对照；候选哈希/diff/status。

**通过：** 共享规则全部满足；shared 仍单一 owner。
**失败：** 多 owner 共写；split 父目录被分配；shared 整目录授权给非 PM。
**证据不足：** 没有共享样例或负例测试。

#### 4.3.6 P6：治理关键路径精确授权

**判定方法：**

- 对方案 §5.5 清单逐项构造负例：`.ans/`、`角色卡/`、`docs/scheduling/`、`docs/acceptance/`、`docs/communication/`、`docs/flows/`、`docs/nominations/`、`docs/verification/`、`src/common/shared/`、release/packaging 路径、`.env`/`.env.*`/密钥路径、根单例契约（`src/model/{boundary,role,decision}.ts`、`src/model/runtime.ts`）作为 `授权目录` 必须被 V-D7 拒绝。
- 核对精确文件例外只在既有治理授权范围内；`src/model/` 不整体目录授权；`src/common/shared/` 不作为执行角色目录；release 文件只允许精确文件。
- 核对 `src/common/shared/` 与 `src/model/{boundary,role,decision}.ts`/`resolve-write.ts` 零改动；`BUILT_IN_GOVERNANCE_ROLES` 的 entries/forbidden/preauthorized 零变化。
- 注意：治理角色自身的既有写区（如 Convener 的 `docs/scheduling/`、Verifier 的 `docs/acceptance/`）是**产品目标项目**的治理授权，不是本仓库 worker 写集；不得把两者混为一谈。

**最低证据：** 负例矩阵；计划/写集/边界对照；shared/model diff 为空；候选哈希/diff/status。

**通过：** 所有治理路径被拒绝为目录授权，精确例外在既有授权内。
**失败：** `.ans/`、`角色卡/`、shared、release、密钥或根单例目录被作为普通目录分配。
**证据不足：** 只检查了部分路径或没有负例输出。

#### 4.3.7 P7：V-D1–V-D9 九条规则

**判定方法：**

- 逐条核对 V-D1–V-D9 的规则 ID、severity、错误信息与执行位置：
  - V-D1 frontmatter 目录：非空、无重复、项目相对、以 `/` 结尾、无通配符/`..`/绝对路径/空格、不与治理路径/`角色卡/` 重叠。
  - V-D2 规范表：恰好覆盖 `directories`、不重复、owner 是推荐角色、每目录一个 owner、必填字段非空（docs/evidence 测试面可 `—`）、枚举合法。
  - V-D3 角色引用：每个 `授权目录` 在 `directories` 中、owner 一致、无孤儿、推荐角色至少一个目录或精确写集（文件例外需理由）。
  - V-D4 不重叠：同/祖先/子目录、精确文件落入他人目录、精确文件相等。
  - V-D5 规范语法：命名/子目录/扩展名/依赖/禁写区合法；依赖目标存在、无自依赖/重复、DAG 无环；split 父目录不直接分配、子目录有 owner。
  - V-D6 模块/目录（v1.1 按 Q9 A 定口径）：v3 每个 module 必须有非空 `实现目录`；缺失按 V-D6 error 拒绝；角色 `implementation`/`tests`/`docs` 目录必须在对应模块 `实现目录` 内或模块目录本身，否则拒绝；整层名黑名单 tripwire 至少覆盖 `src`/`app`/`test`/`common`/`shared`/`utils` 等整层名；有 `粒度理由` → `exception-review` 交 readiness，不硬拒；单文件目录 warning 交 readiness。
  - V-D7 治理关键路径：见 P6 清单。
  - V-D8 共享策略：见 P5。
  - V-D9 路径逃逸/大小写/Windows：posix 规范化、拒绝 `..`/空段/盘符/UNC/尾随空格/点；已存在祖先 realpath；大小写不敏感比较但保留显示。
- 确认 V-D 在 `validateConvenerAppointmentCard` 发卡前执行；失败不发卡、不写账本、不占 pending；warning/exception-review 不阻断。
- 确认应用不调用 LLM、不做语义判断；语义留给 readiness。
- 负例至少包含：缺 `实现目录` 的 v3 计划被拒绝；角色目录不在模块实现目录内被拒绝；v1/v2 legacy 不受这两条影响。

**最低证据：** 规则 ID/severity 清单；逐规则负例矩阵（含缺 `实现目录`、角色目录不在模块实现目录内两条）；卡前守卫测试（无卡/无账本）；路径安全测试；候选哈希/diff/status。

**通过：** 九条规则全部实现并阻断，执行位置正确，`实现目录` 必填与目录归属负例拒绝。
**失败：** 缺规则、规则只在桌面侧、发卡/写账本后才执行、error 不阻断、缺 `实现目录` 仍通过、角色目录不在模块实现目录内仍通过、调用模型做语义判断。
**证据不足：** 只有规则清单，没有逐规则负例或执行位置证据。

#### 4.3.8 P8：V12 扩展

**判定方法：**

- 读 `app/desktop/interface.ts` V12 扩展与 `test/桌面应用/interface.test.ts`：
  - 计划每个 `授权目录` 被该角色 `boundary.yaml` 的 `directory` 或 `conditional-directory`（条件已声明）覆盖。
  - 计划每个 `精确写集` 文件被 `file` 或 `directory` 覆盖。
  - `new` 角色：边界目录条目（排除 `角色卡/<roleId>/` 角色根）与计划 `授权目录` 集合一致；边界不能更宽；更宽阻塞。
  - `changed`/`existing`：计划 ⊆ 边界；更宽部分必须在该角色模块实现目录/既有职责内；越出 warning + readiness；`existing` 宽边界只 warning + 迁移提示，不强制重写。
  - 来源分流：Crew 文件问题 vs 计划问题在问题/文案中可区分；不得把计划错误混为边界错误。
  - V12 失败不派 readiness；问题交 Crew/Convener 修正；`existing` 的未覆盖只按方案语义 warning + 迁移提示，不等同于 `new`/`changed` 的阻塞。
  - v2 V12 行为不变（精确写集覆盖、existing warning）。
- 核对边界覆盖判定复用单一解析器（不复制 v3 解析）。

**最低证据：** V12 正/负例；`interface.test.ts` 原始输出；boundary 样例；来源分流断言；v2 回归；候选哈希/diff/status。

**通过：** 覆盖/一致/子集/来源分流全部满足，v2 不变。
**失败：** 计划目录未覆盖仍通过；`new` 更宽仍通过；`changed`/`existing` 被强制重写；来源分流错误；桌面复制 v3 解析。
**证据不足：** 只有正向用例，没有 `new` 更宽/未覆盖/来源分流负例。

#### 4.3.9 P9：v1/v2 legacy 行为逐字不变

**判定方法：**

- 跑 legacy v1 测试：缺省/`teamPlanSchema: 1` 只跑旧表格检查；缺职责仍拒绝；不强制 v2 字段。
- 跑 v2 测试：`teamPlanSchema: 2` 按 V1–V12 逐字不变；v2 计划样例、写集、模块覆盖、DAG、V12 断言与基线一致。
- 检查旧 v1/v2 计划、旧 flow、旧角色卡、旧夹具没有被删除/改写/批量迁移；v3 夹具是新增而非替换。
- 检查桌面 legacy warning 文案与触发条件不变；v2 完整链路至少一条通过。
- 检查 v3 不改变 flow schema/V11（V11 仍在 `team-plan.ts` 且 `run-role.ts` 消费）。
- v3 `实现目录` 必填与 V-D6 只作用于 `teamPlanSchema: 3`；v1/v2 计划不要求 `实现目录`，不因 v1.1 澄清改变 legacy 行为。

**最低证据：** legacy/v2 测试原始输出；v2 e2e；旧文件 diff/哈希；夹具清单；候选哈希/diff/status。

**通过：** v1/v2 行为逐字不变，v2 链路通过，旧文件未改。
**失败：** v2 行为改变；旧计划/flow/角色卡被改/删；v2 夹具被批量迁移；v2 链路失败。
**证据不足：** 只跑新增 v3 测试，没有 legacy/v2 回归输出。

#### 4.3.10 P10：卡前守卫、卡文本与任务文案

**判定方法：**

- `run-role.ts::validateConvenerAppointmentCard`：schema 3 时跑 V-D1–D9 + V11（flow 已写时）；返回 `teamPlanSchema: 1|2|3`；失败不发卡、不写账本、不占 pending。
- `governance-roles.ts` 卡文本：
  - `CONVENER_CARD_TEXT`：写 v3 计划（frontmatter `directories`、模块清单每个 module 的 `实现目录`（必填非空）、角色表 `授权目录`/`精确写集`、目录规范表、共享策略、治理关键路径、readiness 目录列）。
  - `NOMINATOR_CARD_TEXT`：Crew 按计划目录写边界（目录条目 + 精确文件）、`new` 与实际布局、不改规范/不跨目录。
  - `VERIFIER_CARD_TEXT`：核对布局报告 + 原始证据；不把结构通过当语义正确。
  - 注册表 entries/forbidden/preauthorized、`ENGINEERING_QUALITY_BASELINE`、内部 id/显示名零变化。
- `govern-session.ts`：`STANDARD_WORKFLOW_PROMPT`、Convener/Crew 提示同步 v3；v2 兼容说明保留。
- `governance-advance.ts`：`buildGovernanceAdvanceMessage`/`buildAppointmentWriteMessage`/`buildRoleReadinessTaskMessage`/`buildAcceptanceTaskMessage`/`buildAcceptanceCriteriaTaskMessage` 等任务文案含授权目录/规范/布局；`teamPlanSchema` 类型 `1|2|3`；legacy v2 文案保留。
- 跑 `test/门禁引擎/governance-trio.test.ts`、`governance-standard-workflow.test.ts`、`test/测试/` 相关断言；断言更新必须对应真实行为变化，不得删测试/放松。

**最低证据：** 卡文本 diff；任务文案测试；卡前守卫测试；注册表 diff；候选哈希/diff/status。

**通过：** 卡文本/任务文案/卡前守卫全部同步，写权不变。
**失败：** 卡文本仍只讲 v2 精确写集；任务文案未含目录/规范/布局；卡前守卫未跑 V-D；注册表写权或基线文本被改。
**证据不足：** 只改文本，没有断言/守卫测试输出。

#### 4.3.11 P11：readiness 目录记录

**判定方法：**

- 读 v3 readiness 样例 `docs/scheduling/<flowId>-readiness-v1.md`：frontmatter `flowId/version/status: pass 或 gaps`；逐角色/逐目录列 `directories/spec/shared/layout`，并保留 v2 的 module/contract/testSurface/parallel/dependsOn/granularity。
- 核对记录回答：目录与模块、规范合理性、共享必要性、契约/测试面真实性、边界对齐、例外；gap 是否退回 Crew、计划缺细节是否退回 Convener。
- 核对应用/卡文本没有宣称「结构通过即粒度正确/规范合理」；readiness 不是验收标准/客户确认。
- Q10 变更流程：计划/规范只能由 Convener 以新版本写；不原地改已确认版本；角色/范围实质变化重开闸门 2；受影响目录/证据失效。
- e2e 断言 readiness 含目录/规范/共享/布局列。

**最低证据：** readiness 样例/列；v3 e2e；任务文案；卡文本断言；候选哈希/diff/status。

**通过：** readiness 记录逐目录完整，语义复核可读，应用不越权宣称。
**失败：** 无目录/规范/共享/布局列；readiness 缺失仍通过；把结构通过当语义正确。
**证据不足：** 只有 readiness 模板，没有 v3 e2e 或样例输出。

#### 4.3.12 P12：布局核对纯函数与报告

**判定方法：**

- 确认 `src/common/编排/directory-conformance.ts` 存在（或经闸门 2 确认的等价路径），导出 `DirectorySpec`/`LayoutCheckInput`/`LayoutCheckRow` 纯函数；经 pipeline 公共出口给桌面/测试消费；桌面不复制。
- 复用 `src/common/shared/path-primitives.ts` 与 `resolveWrite` 口径；不读 git、不写报告、不调用模型。
- 核对规则：跳过 `docs/communication`/`docs/planning`/`docs/scheduling`/`docs/acceptance` 管理记录与 `角色卡/<roleId>/...` 角色根工作文档；最长前缀匹配 owner；无匹配 fail；多 owner fail；扩展名、子目录、命名、禁写区、路径安全；删除按原路径、重命名按新路径、删除只能在自己目录内。
- 跑单测正负例与 e2e（临时项目根两角色）：目录内新增文件/子目录 pass；跨目录/他人目录/禁写区/命名不符/子目录越界 fail；报告可复算；报告附原始 `git status`/diff（含未跟踪）与候选哈希。
- 生成物/忽略文件（如 `app/renderer/dist/`、`release-output/`、`node_modules/`）不在 git 候选；若出现在候选清单，按禁写区/允许类型处理，不得静默跳过。
- 确认报告是证据不是授权；Verifier 读报告 + 原始证据，不把摘要当原始证据。

**最低证据：** 纯函数 diff；单测正负例；e2e；报告样例；原始 `git status`/diff；候选哈希。

**通过：** 纯函数/规则/报告全部满足，fail 不被标 pass。
**失败：** 只看计划文本；报告与候选不符；fail 标 pass；桌面复制实现；路径安全/删除重命名未覆盖。
**证据不足：** 只有报告样例，没有单测/e2e 或原始候选清单。

#### 4.3.13 P13：运行期策略 A 与非目标

**判定方法：**

- 核对 `src/model/decision.ts` 的 `TaskScope`、`src/service/gate/resolve-write.ts` 的 F4、会话 scope/派发、`src/provider/runtime/{tools,schema}.ts` 默认未改；grep 确认无 `writeDirs`/任务级写目录参数。
- 核对运行期仍由边界目录硬拦越界写（现有 `resolveWrite` 行为）；任务文本写明授权目录/规范/不得跨目录/不得改规范；验收布局核对兜底计划目录更细约束。
- 核对非目标：不新增 `cardKind`/`FlowStepKind`/`GovernancePower`/`GovernanceDecisionKind`/artifact kind；不改派发权/客户入口/角色 id/显示名/路径/`ENGINEERING_QUALITY_BASELINE`；不改 `src/common/shared/`。
- 跑相关回归/基线文本 diff。

**最低证据：** model/decision/resolve-write/session/provider diff；任务文案样例；边界硬拦测试；`writeDirs` grep；基线文本 diff；候选哈希/diff/status。

**通过：** 策略 A 落地，非目标零变化。
**失败：** 引入任务级 `writeDirs`/改 F4/session/dispatch；新增枚举；改派发权/入口/命名/基线文本。
**证据不足：** 只声明「未改」，没有 diff/grep/测试输出。

#### 4.3.14 P14：Map/Reduce 与测试分片不回归

**判定方法：**

- 核对 v3 不改 flow schema/V11；`FlowStateStep` 可选字段、`FLOW_STEP_KINDS`、`evaluateDispatchGate` 行为不变；旧 flow 夹具通过。
- 跑 `q-role-granularity.test.ts`、`r-mapreduce-parallel.test.ts`、v3 完整链路与 legacy v2 链路；确认 Map 并行组、dependsOn、Reduce 覆盖全部 Map 不变。
- 核对测试分片：每分片独立临时项目根/端口/日志/输出目录；共享只读夹具 pin 哈希；不共享可变项目根/端口/DB/构建输出；失败隔离；Reduce manifest 合并分片；原始日志可复算。
- 并行偶发按隔离/整文件/串行复跑分类。

**最低证据：** 相关测试原始输出；v3/legacy e2e；分片日志/manifest；flow diff；候选哈希/diff/status。

**通过：** Map/Reduce 与分片无回归，链路通过。
**失败：** v3 破坏 Map/Reduce 或分片共享状态；manifest 缺失；flow schema 被改。
**证据不足：** 没有 v3 e2e 或分片日志，只有单测。

#### 4.3.15 P15：现有角色不迁移

**判定方法：**

- `git diff -- 角色卡/**`：默认除授权边界校正外为空；校正必须恰好是 `test/桌面应用/acceptance-dispatch.test.ts`、`test/桌面应用/runtime-resolution.test.ts` 两行 + 对应 changelog；不得新增角色卡/重写边界/改其他路径。
- 检查旧 v1/v2 团队计划、旧 flow、旧角色卡未被删除/改写；`existing` 宽边界只 warning + 迁移提示；不强制迁移。
- 检查本仓库现有角色没有被改成 v3 目录授权；本变更只实施产品能力。

**最低证据：** `git diff -- 角色卡/**`；边界校正 diff；旧计划/flow 哈希；测试；候选哈希/diff/status。

**通过：** 无迁移；授权校正恰好两条条目。
**失败：** 其他角色卡/边界改动；旧计划/flow 被重写；强制迁移。
**证据不足：** 无法确认校正范围或旧文件未被改。

#### 4.3.16 G1：变更包与候选身份

- 变更包至少含：任务 ID、产品 flowId、候选哈希（每个产品改动文件 `git hash-object` + `sha256sum`）、`git rev-parse HEAD`、改动路径、任务节点 D1–D9、证据链接、风险档位 T3、复用证据与失效说明。
- 候选哈希必须可复算；验收只读复算并与变更包对照。候选与证据不匹配 → `insufficient evidence`；候选变化 → 按 §3.3 重取。
- 管理记录（顶层 `docs/`）不混入产品候选；不得用 `docs/` 文件的哈希代替产品文件哈希。
- 证据：变更包原文；原始 hash/status 输出；验收复算输出；证据链接清单。

**通过：** 变更包完整、候选哈希与所有产品文件复算一致、证据链接可追溯、管理记录未混入产品候选。
**失败：** 候选哈希与文件不符且无法解释；变更包把管理记录当产品候选；候选范围越界或缺少关键节点。
**证据不足：** 变更包缺失、候选哈希只有自述、证据链接不可达或无法对应候选。

#### 4.3.17 G2：写集与授权

- `git diff --name-only` / `git diff --stat` 的所有改动路径必须落在团队计划 §4.3/§八的逐角色写集内；`git diff --cached --name-only` 为空（不暂存）；无提交、无推送、无合并、无发布。
- 不得出现未授权的 `角色卡/*/boundary.md`、`boundary.yaml`、`role-card.md` 改动；唯一例外是闸门 2 授权的桌面窗口边界漂移校正（两条精确单文件条目 + changelog）。
- `test/桌面应用/` 不得新建文件（除非闸门 2 另有精确单文件确认）；worker 不得写顶层 `docs/scheduling/`、`docs/acceptance/`；测试角色不得写 `docs/verification/`（本仓库执行写 `角色卡/测试/docs/`；产品 e2e 只在临时项目根内生成）。
- 角色自身文档（`角色卡/<role>/api-spec.md`、`角色卡/<role>/docs/**`、`memo.md`）按团队计划允许；不得把顶层 `docs/` 管理记录写成 worker 交付。
- 证据：`git diff --name-only`/`--stat`/`status`/`--cached` 原始输出；与团队计划写集对照表；无提交记录；boundary/role-card 文件对照。

**通过：** 所有改动在闸门 2 写集内；无越界/未授权改动；无提交/推送/合并/发布；授权边界校正恰好两条条目；`test/桌面应用/` 未新建文件。
**失败：** 改动越界；未授权角色卡/边界改动；提交/推送/合并/发布；worker 写 `docs/scheduling/`、`docs/acceptance/`、`docs/verification/`；`test/桌面应用/` 新建文件未授权。
**证据不足：** 只有自述，没有 diff/status 原始输出；授权边界校正范围无法确认。

#### 4.3.18 G3：文档状态与版本记录

- 方案/实施/测试/验收状态如实；未实施不写已实施，未验收不写 `verified`；实现完成但未验收写 `implemented-unverified`。
- 未确认项标候选；不把设计写成结果；不与 v1.6.0 发布记录、发布资产、冻结源混；不声称已提交/推送/发布。
- 证据：文档状态行；角色文档 diff；发布记录对照；候选哈希/diff/status。

**通过：** 文档状态如实；未实施/未验收未被写成已实施/已验证；未与 v1.6.0 发布记录或冻结源混。
**失败：** 把设计写成已实施、把未验收写成 `verified`、声称已提交/推送/发布，或把 v1.6.0 发布候选混入本轮。
**证据不足：** 文档状态行缺失、角色文档无法核对或版本记录无法追溯。

### 4.4 不适用（N/A）说明

- **P1–P15 不得整行标 `not applicable`。** 本任务有代码/测试面，T3 全量回归、v3/legacy 链路、布局核对、真实启动/演示必须执行，不能用 N/A 掩盖。
- 行内允许的 N/A 仅限：
  - **运行时核心可选子项（P1/P13）：** 若实施判断无需改 `src/model/runtime.ts`（例如桌面显式映射/丢弃 v3 信息），可对该子项记 N/A + 理由；但 P1 的 schema/类型闭环与 P13 的非目标仍须判定，且 judge 不得假装看到 v3。
  - **桌面UI 可选子项（P2/P3/P10/P11 的渲染层显示）：** 默认 N/A + 理由；不得因此跳过桌面 `interface.ts`/`governance-advance.ts`/`interface.test.ts` 的必改项。
  - **项目管理可选文档：** N/A + 理由；不作为产品候选验收项。
  - **`npm run build:renderer`：** 本变更不改渲染层产品代码，默认 N/A + 理由；若桌面UI 可选改动发生，则对同一候选执行并复用其证据。
  - **发布/打包检查：** 本轮不发布，发布流水线/资产检查 N/A + 理由；T3 全量回归与共享抽象检查仍须执行。
  - **i18n 子项：** 属变更 A（T2），本轮 N/A；不得把该 N/A 扩大到目录授权标准。
- 除上述行内分支外，任何 N/A 都必须写明依据；无法说明依据的 N/A 按 `insufficient evidence` 处理。

---

## 五、判定条件

### 5.1 每行的验收判断

| 判断 | 含义 | 本任务示例 |
| --- | --- | --- |
| **pass** | 该行标准已被当前候选满足；证据是原始的、对应当前候选、足以覆盖标准。 | v3 schema/V-D/V12 正负例齐全；三处一致；唯一 owner/不重叠；治理路径拒绝；布局核对可复算；v3/legacy 链路通过；卡文本/readiness 同步；T3 全量回归无新增失败。 |
| **fail** | 已有证据表明候选不满足该行标准，或候选包含明确不允许的改动。 | 缺规范仍通过；目录重叠；治理路径被目录授权；V-D 缺失/不阻断；V12 未覆盖仍通过；v2 行为改变；卡文本仍 v2；布局 fail 标 pass；引入任务级 `writeDirs`；角色被迁移；写集越界。 |
| **insufficient evidence** | 尚不能判断：证据缺失、输出不完整、候选/版本不符、基线不可得、命令无法复算、报告未产生等。 | 没有原始测试输出；哈希只有自述；全量回归未跑；布局报告/分片日志缺失；真实启动/演示缺失；报告首行缺项；基线文档哈希不符；授权边界校正范围无法确认。 |
| **not applicable** | 该行标准确实不适用于本任务/分支，且必须写明依据。 | 仅 §4.4 列出的行内分支；P1–P15 不得整行 N/A。 |

### 5.2 总体结论

- **通过：** 所有适用行（P1–P15、G1–G3）均为 pass；候选哈希与证据一致；T3 全量回归对当前候选执行且无本次新增失败；真实启动/演示证据有效；v3 与 legacy v2 链路通过；布局核对报告可复算；标准/报告/变更包齐备。
- **返工：** 任一行 fail。列出差异、依据和应回到的所有者（编排、门禁引擎、运行时核心、桌面窗口、桌面UI、测试、人事（仅授权校正）、统筹），由统筹安排修复与复测；验收不代改。
- **证据不足：** 没有 fail，但任一行 insufficient evidence。列出缺什么、由谁补（对应产出角色/统筹），不能记通过。
- 若同时存在 fail 与 insufficient evidence：总体结论按**返工**，同时在报告中列出待补证据，避免修复后重复缺证。
- `not applicable` 不得把不适用的行算作 pass；本任务 P1–P15 不应出现整行 N/A。
- 验收结论只对当前候选有效；候选变化后按 §3.3 重新判断受影响部分。
- 验收通过只表示当前候选满足本标准 v1；**不授权提交、推送、合并、发布或任何对外操作**；也不改变闸门 2 写集、T3 档位或 i18n T2 的独立判定。

### 5.3 报告要求与效力

- 验收报告路径：`docs/acceptance/directory-ownership-report-v1.md`（由独立验收写，不由统筹代写；**本文件不是报告**）。
- 报告**首行**必须含五项：`风险档位：T3｜判定依据：治理/权限/流程设计变更（依据 references/testing.md；治理变更即使只改文档也非 T0）｜选定检查：…｜复用证据：…（来源/候选/仍有效理由，或「无」）｜全量回归：已执行 / N/A + 理由`。本任务全量回归应写「已执行」，不得写 N/A。
- 报告须链接：任务/阶段、客户确认的策划方案版本（路径+哈希）、本标准版本 `directory-ownership-criteria-v1.1` 与判定时计算的哈希、候选哈希、变更包、原始证据路径/哈希、未解决问题、结论理由。
- 报告须包含完整验收表（P1–P15、G1–G3），逐行填实际证据、结果、验收判断；不得只写「已完成」或「通过」而无表。
- 报告须写明与 i18n T2 分开判定，不合并结论。
- 验收通过只表示当前候选满足本标准；统筹只能按匹配当前候选的通过结论放行。

---

## 六、统筹应提交的变更包与证据

判定阶段统筹须提交以下内容（缺少任一项会形成 `insufficient evidence`，除非验收能只读复算）：

### 6.1 变更包

- 路径：`docs/scheduling/directory-ownership-change-v1.md`。
- 内容：任务 ID、产品 flowId、候选哈希（每个产品改动文件 `git hash-object` + `sha256sum`）、`git rev-parse HEAD`、改动路径、任务节点 D1–D9、证据链接、风险档位 **T3**、复用证据与失效说明。

### 6.2 原始命令输出

- `git rev-parse HEAD`；
- `git status --short`；
- `git diff --name-only`；如暂存，另附 `git diff --cached --name-only`；
- `git diff --stat`；
- 完整 `git diff`（至少覆盖所有改动 hunk；过大时按文件分段，不可截断到无法核对）；
- 每个产品改动文件的 `git hash-object` 与 `sha256sum`；
- 基线（D3）与最终候选的测试命令、退出码、cwd、时间、执行者、环境（Node/npm/OS/Shell）、测试计数、失败原文。

### 6.3 测试、分片与 e2e 证据

- 定向测试：`test/编排/`（`team-plan.test.ts`、`directory-conformance.test.ts` 及受影响文件）、`test/门禁引擎/`（`governance-trio.test.ts`、`governance-standard-workflow.test.ts`）、`test/runtime-core/`（如类型变化）、`test/桌面应用/interface.test.ts`（`operator-wiring.test.ts` 条件）、`test/测试/` 相关 e2e/负例。
- v3 负例矩阵：缺 `实现目录`、角色目录不在模块实现目录内、缺规范、重复目录、多 owner、目录重叠/嵌套、治理路径目录、整层名、路径逃逸、`shared: split` 违规、`new` 边界比计划宽、计划目录未覆盖、精确文件落入他人目录、禁写区、命名/类型/子目录越界、共享多 owner、边界不一致（new vs existing）、v2 兼容。
- v3 完整链路：计划 v3 → appointment → Crew 写卡/目录边界 → V12 → readiness → Map 目录内新建文件/子目录 → 布局核对 pass → 变更包 → Verifier → acceptance。
- legacy v2 链路：至少一条 v2 完整链路保持通过；v1 legacy 夹具通过。
- 布局核对报告：附原始 `git status`/diff（含未跟踪）、候选哈希、逐路径检查表、fail 原因；报告可复算。
- 分片：每模块分片日志（命令、环境、候选哈希、退出码、pass/fail/skip、失败原文）；分片清单；独立临时根/端口/输出目录/日志证据；共享只读夹具 pin 哈希；失败隔离与只重跑记录。
- T3 全量回归：`node --test "test/**/*.test.ts"`、`npm run typecheck`、`npm run typecheck:renderer`；`build:renderer` 按 §4.4 处理；与基线逐项对照；治理/共享抽象检查（v2 逐字不变、shared/model/registry 零改动）。
- 真实启动/演示：见 §6.4。

### 6.4 真实启动/演示证据

- 启动方式：`npm run app`（Electron）或既有 `test/桌面应用/e2e/main.mjs` 总自检台；必须是真实启动应用，不能用纯单元测试/mock 代替。
- 演示内容：至少覆盖一条 v3 治理链路的关键变化（v3 团队计划 frontmatter `directories`/模块清单每个 module 的 `实现目录`（必填非空）/角色表 `授权目录`+`精确写集`/目录规范表 → appointment → Crew 写卡/目录边界 → V12（`new` 一致、`changed`/`existing` 覆盖）→ Convener readiness（目录/规范/共享/边界/契约/测试面）→ Map 在授权目录内新建文件/子目录 → 布局核对 pass → 变更包 → Verifier → acceptance）；以及至少一条 legacy v2 链路保持通过。
- 记录：启动命令、时间、候选/版本、窗口截图/日志清单；离线无真实凭据时如实记录模型桩边界。
- 缺失、失效或无法对应候选时不得建议 accept；验收按 `insufficient evidence` 处理。

### 6.5 文档与角色报告

- 各实施角色的完成报告：候选哈希、diff/status、改动路径、测试命令/输出、未解决问题、写集越界声明。
- 角色自身文档状态：`角色卡/<role>/api-spec.md`、`角色卡/<role>/docs/change/2026-10-23_change_directory-ownership.md`（或同主题单篇）、`memo.md`（按需）；实现完成但未验收的状态写 `implemented-unverified`。
- 文档不得把计划写成结果，不得声称已提交/推送/发布。

### 6.6 证据路径/哈希与复用说明

- 每份证据文件的路径与 SHA-256（若以文件形式提交）；或任务记录中的原始输出位置。
- 复用证据：来源、原候选哈希、原命令、仍然有效的理由；本任务预计复用 D3 基线仅用于失败分类，不作为最终候选验证。
- 未解决事项：实施中发现的歧义、与方案/团队计划的冲突、需要沟通澄清的问题（见 §九）。

---

## 七、判定时的只读检查步骤

验收判定时按以下顺序执行，只读，不改产品代码、测试、角色卡、边界、方案、团队计划、沟通记录或调度记录：

1. **核对基线：** 读取 `docs/communication/2026-10-23_intent_i18n-and-directory-ownership.md` 的闸门 0/1/2 与实施授权记录；核对方案、意图、团队计划版本与 §二 哈希；确认方案 v1 是客户确认版本；确认团队计划 hash 与闸门 2 记录一致。若基线文档变化，按 §3.3/§3.6 处理。
2. **核对候选身份与变更包：** 复算 `git rev-parse HEAD`、各产品文件 `git hash-object`/`sha256sum`、`git status --short`、`git diff --name-only`/`--stat`/`--cached`；与变更包对照；确认候选冻结、证据对应当前候选。
3. **核对档位：** 确认变更包为 T3，档位与改动相符；若不符，退回统筹或按更高档补证；验收可升档，不能降档。
4. **核对写集与既有校正（P15/G2）：** 将改动路径与团队计划 §4.3/§八逐角色写集对照；确认无越界、无保护文件改动、无提交/推送/发布；确认授权边界校正恰好两条条目；worker 未写顶层 `docs/scheduling/`、`docs/acceptance/`、`docs/verification/`。
5. **核对 P1–P3：** 读 v3 样例/解析器/类型/目录规范表；核对 `teamPlanSchema: 3`、`directories` 三处一致、`DirectorySpec` 字段/枚举/依赖 DAG、每个 module 的 `实现目录` 必填与角色目录归属（Q9 A/v1.1）。
6. **核对 P4–P7：** 读唯一 owner/不重叠/共享/治理路径/V-D 正负例与卡前守卫；核对 V-D1–D9 规则 ID/severity/执行位置；核对 `.ans`/角色卡/release/shared/密钥/根单例契约被拒绝为目录授权。
7. **核对 P8：** 读 `interface.ts` V12 扩展与 `interface.test.ts`；核对覆盖、`new` 一致、`changed`/`existing` 子集、来源分流、v2 不变。
8. **核对 P9：** 读 legacy/v2 测试与 v2 e2e；核对旧计划/flow/角色卡/夹具未被删除/改写；核对 v3 不改变 flow schema/V11。
9. **核对 P10–P11：** 读 Convener/Crew/Verifier 卡文本、`govern-session.ts` 提示、`governance-advance.ts` 任务文案、readiness 样例；核对卡前守卫、注册表写权零变化、readiness 目录列与语义复核。
10. **核对 P12–P13：** 读布局核对纯函数/单测/e2e/报告；核对策略 A（无 `writeDirs`、未改 TaskScope/F4/session/dispatch）与非目标零变化。
11. **核对 P14–P15：** 读 Map/Reduce/分片证据与现有角色/边界 diff；核对无回归、无迁移、授权校正范围正确。
12. **核对全量回归与真实演示：** 对照 D3 基线与最终候选原始输出；确认无本次新增失败、既有失败有基线证据；确认真实启动/演示证据存在且对应当前候选。
13. **填写验收表并给结论：** 按 §5 逐行填 pass/fail/insufficient evidence/not applicable；写报告 `docs/acceptance/directory-ownership-report-v1.md`，首行五项，链接证据与未解决问题；报告只对当前候选有效。

---

## 八、不得据此扩张的事项

- 本文件不扩张任何角色的文件写权；独立验收只写 `docs/acceptance/`。
- 本文件不授权修改产品代码、测试、角色卡、边界、工程法案、方案、团队计划、沟通记录或调度记录。
- 本文件不授权提交、推送、合并、发布或任何对外操作。
- 本文件不是客户确认记录，也不是验收结论；客户确认仍以 `docs/communication/` 的记录为准。
- 实施者不得把「标准已写」「团队计划已确认」「工具成功」当成验收通过或客户确认。
- 本文件不改变闸门 0/1/2 的确认对象和版本；方案实质变更重开闸门 1，角色指派/写集变更重开闸门 2，意图变更重开闸门 0。
- 本文件不改变 i18n T2 的独立标准、实施窗口、证据与结论；两变更不合并报告。
- 未启用 task_ops；不得伪造任务令牌、锁、审批、机器预检或账本状态；证据以文件与原始输出为准。

---

## 九、需要沟通/统筹澄清或注意的问题

> v1.1 已按 Q9 A 关闭原 §九.16 的 `实现目录` 缺口（见第 16 条）；其余缺口与澄清项保留。

1. **方案文件头状态与闸门 1 记录不一致：** 方案文件头仍写「草案 v1（待闸门 1 方案确认）」「闸门 1：待确认」，沟通记录已确认。本标准按 `docs/communication/` 为授权事实，不改方案文件；若沟通认为必须在实施前更新方案状态头，请先处理；否则按本文件执行。
2. **团队计划状态头与闸门 2 记录不一致：** 团队计划状态头与 §二仍写「闸门 2 未确认、实施授权未给」，而沟通记录已确认闸门 2 并给出实施授权；团队计划实测 SHA-256/blob 与闸门 2 记录一致。请沟通/统筹补记当前版本哈希与状态；本标准以沟通记录为授权事实，团队计划只作范围/写集输入，不因该差异改变标准。
3. **边界漂移校正与团队计划「不启用人事」的差异：** 团队计划 §1.3/§三/§八写「不启用人事（无角色/边界变更）」，但沟通闸门 2 记录明确「授权人事补边界条目」；工作树已出现 `角色卡/桌面窗口/boundary.md` 与 `changelog.md` 的 4 行新增。本标准按闸门 2 记录把它视为**已授权的治理校正**，不是产品候选、不是迁移；P15/G2 要求它恰好只有两条精确单文件条目与对应 changelog。若实际 diff 更宽，停止并回报统筹/沟通。
4. **Node 不在验收 shell 的 PATH：** 当前 Git Bash 无法直接执行 `node`/`npm`。实施/测试必须记录实际调用路径（上轮记录为 `C:\Users\51054\AppData\Local\Programs\nodejs\node.exe`）与实测版本；若某命令因 PATH/环境不可用，按 `insufficient evidence` 处理，不能写成通过。
5. **`test/桌面应用/` 逐文件授权：** 该目录对桌面窗口是逐文件授权，默认不得新建文件；新断言并入 `interface.test.ts` 等既有精确文件。若实施确需新文件，桌面窗口应停止并回报统筹，由人事按闸门 2 补充精确单文件条目，不默认派发、不越过本标准。
6. **`docs/verification/` 与本仓库测试角色边界：** 产品运行期证据根默认 `docs/verification/`，但本仓库测试角色 Section 1 不含该路径；本仓库执行时测试证据写 `角色卡/测试/docs/`，产品 e2e 只在临时项目根内生成 `docs/verification/`。若确需在本仓库写 `docs/verification/`，须另走人事改边界 + 闸门 2。
7. **新增 `src/common/编排/directory-conformance.ts` 的边界：** 该文件位于编排已授权私有目录内，新增文件不需要重写边界；`test/编排/directory-conformance.test.ts`、`test/测试/directory-layout.test.ts` 同理。若实施把布局核对放到其他路径，必须与团队计划写集一致；否则按 G2 越界或需先重开闸门 2。
8. **V11 位置与注释口径：** `src/common/编排/team-plan.ts` 头部/中部注释有「V1–V10」的表述，但 V11（flow-plan 一致性）实际也实现于本文件（约 1300 行）并由 `run-role.ts` 消费；方案与团队计划均要求 V11 不变。实施以符号与真实代码为准，不得以注释行号/编号遗漏 V11。
9. **`teamPlanSchema` 类型闭环：** `interface.ts` 现状把 `plan.teamPlanSchema` 传入 judge facts；v3 后值可为 3，若 `GovernanceJudgeFacts.teamPlanSchema` 仍为 `1|2`，TypeScript 会拒绝或桌面必须丢弃 v3 信息。推荐运行时核心扩展为 `1|2|3`（可选 `teamPlanDirectories`）；若选择桌面映射/丢弃，必须在报告中说明理由，且 judge 不得假装看到 v3；不得新增 artifact kind/枚举。
10. **无 task_ops：** 本项目无 `.ans/project.json`；不伪造任务令牌、锁、审批、机器预检；证据以文件与原始输出为准。
11. **与 i18n 的共享文件：** `app/desktop/interface.ts`、`governance-advance.ts`、`test/桌面应用/interface.test.ts` 必须按团队计划 §4.7 串行写；两变更的变更包/验收报告必须分开，不得合并判定。若候选包含 i18n 上下文改动，声明为既有上下文，不纳入本变更候选。
12. **真实启动/演示的可执行程度：** 团队计划 §6.4 指定测试角色产出；若 `npm run app` 或 `test/桌面应用/e2e/main.mjs` 在当前环境无法真实启动，测试角色须在证据中说明并给出可核对日志；验收不得用单元测试/mock 代替，缺失则 `insufficient evidence`。
13. **产品运行期 `docs/scheduling/` 与项目调度记录同名风险：** 产品 Convener 的团队计划/readiness/变更包使用 `<flowId>-team-vN.md` 等命名；本仓库演示/测试不得覆盖既有 `docs/scheduling/2026-10-23-*.md` 记录；测试夹具必须使用独立 flowId/临时项目根。
14. **Windows 既有失败：** 历史基线存在 Windows symlink EPERM 等既有失败；D3 基线必须先记录并分类，终验只对本次新增失败负责；并行全量可能出现桌面时序偶发，必须用隔离/整文件/串行复跑分类；不得用「环境问题」笼统带过。
15. **发布不授权：** 本轮只影响产品代码候选；不改 v1.6.0 发布配方/冻结源；发布另走装配流程（T3 发布前应完成适用全量回归）。验收通过不授权提交、推送、合并或发布。
16. **模块清单 `实现目录`：已按 Q9 A 定口径（v1.1，缺口关闭）。** 客户闸门 1 已确认 §13 Q9 A「模块清单新增 `实现目录`；角色目录必须在其下」，闸门 2 确认的团队计划 §2.3 同文，沟通闸门 2 记录确认；方案正文 §4.5/§5.2/V-D6 的「可选但推荐/若存在」是方案内部措辞不一致，以客户已确认的 Q9 A 为授权事实。v1.1 明确：对 `teamPlanSchema: 3`，模块清单每个 module 必须有非空 `实现目录`；角色 `implementation`/`tests`/`docs` 目录必须在对应模块 `实现目录` 内或模块目录本身；缺失/越出按 V-D6 error 拒绝；v1/v2 legacy 不受影响。标准 v1 未用于任何候选判定；不改变方案、团队计划、闸门 2 写集、T3 档位或 i18n T2。
17. **`changed`/`existing` 边界「更宽部分在既有职责内」的语义限制：** 方案要求更宽部分落在模块实现目录/既有职责内，越出 warning + readiness。模块实现目录可由目录关系确定性核对；「既有职责」是语义判断，验收只能核对 warning 是否存在、readiness 是否逐项记录并给出依据，不能客观证明职责边界本身。该项按 P8/P11 的「warning + readiness 记录」证据判定；若 readiness 只有结论没有依据，按 `insufficient evidence` 处理，不得把「没有 warning」当成语义正确。
