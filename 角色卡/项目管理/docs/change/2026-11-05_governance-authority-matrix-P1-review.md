# 治理权力矩阵 P1 提案审核（项目管理）

- 日期：2026-11-05
- 角色：ANS 项目管理（Project Management，独立固定上下文）
- 任务：`2026-11-05-governance-authority-matrix`，P1 批次方案审核（团队计划 §5.1 节点 P1）
- 审核依据：`references/proposal-review.md`（审核口径）、`references/architecture.md`（分层/调用方向）、`references/documentation-change.md`、`references/testing.md`（T3）、`references/module-boundary.md`
- 审核对象：七份角色 P1 实现提案（门禁引擎、运行时核心、编排、Pi适配器、Claude适配器、Codex适配器、测试），哈希见 §一
- 本文件性质：**审核记录与建议，不是客户批准、不是实施授权、不是验收结论，也不替代闸门 0/1/2 或独立验收**。本审核**未实施、未测试**；只读核对哈希、行数、代码锚点与边界，未运行产品测试，未改任何代码/测试/角色卡/边界/方案/计划/验收/沟通文档，未 commit/push。
- 本阶段只写本文件：`角色卡/项目管理/docs/change/2026-11-05_governance-authority-matrix-P1-review.md`。
- 复核：五份 must-fix 修订的复核确认见 **§十二**（Revision 1 / v1.1，2026-11-05）；门禁引擎 v1.2 的最终确认见 **§十三**（批次结论 `recommend approval`）；C1a 契约冻结确认见 **§十四**（2026-11-05，基线 `0418746`，工作树未提交候选）；C1b+C2 联合冻结确认见 **§十五**（2026-11-05，同基线叠加候选）。§二/§九的批次与逐份结论以 §十二–§十五 为准（§一至§十一为第一轮记录）。

---

## 一、候选与基线哈希（本文件写盘前实测）

### 1.1 七份提案（审核对象）

| 提案 | 行数 | SHA-256 |
| --- | --- | --- |
| 门禁引擎 `角色卡/门禁引擎/docs/change/2026-11-05_governance-authority-matrix-gate-engine.md` | 635 | `ed8fda304298afc5e7b8fd3392c3a878e641d9e96487fa512564101d6e0a6323` |
| 运行时核心 `角色卡/运行时核心/docs/change/2026-11-05_governance-authority-matrix-runtime-core.md` | 354 | `d8e0bfc00aaf3cf5506bb85cf9a779cf307f3c757ea494527be462ebe8ea9cd6` |
| 编排 `角色卡/编排/docs/change/2026-11-05_governance-authority-matrix-orchestration.md` | 454 | `b45e0453c163854c94fd5788ba011ea6081ad2671c9f6d54098caad2f9ab7159` |
| Pi适配器 `角色卡/Pi适配器/docs/change/2026-11-05_governance-authority-matrix-pi-adapter.md` | 204 | `8a348b6253fe309eee9ab983cb19aee1190d43ce40df9e109174ae4cd877922a` |
| Claude适配器 `角色卡/Claude适配器/docs/change/2026-11-05_governance-authority-matrix-claude-adapter.md` | 214 | `541ee055d2552d5eaacc372f7654cfba3558abd765ce380226fa0475b95f1894` |
| Codex适配器 `角色卡/Codex适配器/docs/change/2026-11-05_governance-authority-matrix-codex-adapter.md` | 220 | `df8e5387e44bf52c82193bb30ba9f0d25718a3cf164b073d5374e6aebd9e0279` |
| 测试 `角色卡/测试/docs/change/2026-11-05_governance-authority-matrix-test.md` | 439 | `4bbc7cf6ae4fde8f11bf1b3f3308fd92774e839c59a1d68fb576550328d4c5d9` |

以上行数/哈希与任务交办值一致（`wc -l`、`sha256sum` 实测）。

### 1.2 上位基线

| 项 | 行数 | SHA-256 / 值 |
| --- | --- | --- |
| 方案 P1.1 `docs/planning/2026-11-05_design_governance-authority-matrix.md` | 1056 | `1f6518b898aa33b649c21124e26816cd05715a5eba6a147aed8b8cab9cfb26d6` |
| 团队计划 `docs/scheduling/2026-11-05_team-plan_governance-authority-matrix.md` | 660 | `07378444cb62fc714a7cce0a492ce5a12b5b7d0a0868f4602edb0be134fc7805` |
| 实施前验收标准 V1 `docs/acceptance/governance-authority-matrix-criteria-v1.md` | 327 | `f672052882f4937eac69fed617c309bb6cc6d4ed0cc68f280fe280797a5f3a2f` |
| 闸门记录 `docs/communication/2026-11-05_intent_governance-authority-matrix.md`（闸门 0/1/2 + IA + V1 核对） | 76 | `b8d7a18f38b86ae366f7ec1302f061bc2e478943025256161631758239eb3bbb` |
| B0 基线 `角色卡/测试/docs/change/2026-11-05_governance-authority-matrix-B0-baseline.md`（**HEAD `7ba8a33`，已漂移**） | 323 | `a51c466eab3c4e8984d9776be387b6901a0be6ad6b04b46c77443567bf4c4355` |
| 工程法案 `角色卡/项目管理/docs/project-rules.md`（草稿） | 160 | `362e66c5547c6d678a65bec02cbe92b5a613818ea93237906aeeaf406fa8bfad` |
| 当前候选 HEAD（本 worktree / 分支） | — | `ebbc2fcffcc5cd1c2163db72bcfb1c03d599e3e6`（`feat/governance-authority-matrix`，Merge PR #66） |
| 工作树产品/测试区 | — | `git status --porcelain -- src app test` 为空；`git diff --cached --name-only` 为空 |

**基线漂移（审核入口实测）：**

- B0 记录于 `7ba8a33`；提案多写于 `dc21fc1`；当前 HEAD 为 `ebbc2fc`（PR #66，`c3e50f5` 名单升级回绑）。
- `7ba8a33..ebbc2fc`：7 个文件、+211/−3 —— `app/renderer/src/chat/DecisionDialog.tsx`、`src/common/编排/run-manifest.ts`、`src/pipeline/orchestration/version-change-runtime.ts`、`src/provider/runtime/schema.ts`、`test/桌面UI/decision-dialog.test.ts`、`test/编排/run-manifest.test.ts`、`test/编排/version-change-runtime.test.ts`。
- `dc21fc1..ebbc2fc`：4 个文件、+168/−1 —— `src/common/编排/run-manifest.ts`、`src/pipeline/orchestration/version-change-runtime.ts`、`test/编排/run-manifest.test.ts`、`test/编排/version-change-runtime.test.ts`。
- 上述文件**均不在本特性七份提案的写集内**；提案自身的基线漂移披露止于 `dc21fc1`，缺少 PR #66 一段（测试提案 §1.2 需更新，见 T-3）。

### 1.3 只读核对事实（不替代测试）

- 七份提案记录的目标源码行数/哈希前缀与当前文件一致：`governance-roles.ts` 622/`f394a8a1…`、`resolve-role.ts` 451/`09ef633a…`、`api-spec.md` 321/`3b843835…`、`list-project.test.ts` 311/`94f97714…`、`model/runtime.ts` 3189/`ceb27df8…`、`service/runtime/session.ts` 721/`e36ffc22…`、`runtime/tools.ts` 4458/`edce1b2f…`、`runtime/schema.ts` 1655/`0e93d3ca…`、`run-role.ts` 2622/`121f47d7…`、`pi/session.ts` 422/`64cefa00…`、`real-adapter.ts` 1734/`d1355f4a…`、`claude/session.ts` 1000/`d4d6410b…`、`codex/session.ts` 995/`aa615675…`。
- `grep -n "governanceMatrix|contextSections|governance_matrix" src/ test/ app/` 当前零命中（特性未实施）。
- `test/` 共 448 个 `*.test.ts`，其中 `test/测试/` 95 个；`test/pi-adapter/write-sequencing.test.ts` 存在；`test/测试/governance-matrix-integration.test.ts` 不存在。
- 门禁引擎 `boundary.md` + `boundary.yaml` 已含 B-1（`src/model/governance-matrix.ts`）与 B-2（`src/service/governance-matrix/`）；`角色卡/门禁引擎/changelog.md` 已记 H1 落地。
- `RuntimeSessionOptions extends Omit<GovernedToolsOptions, …>` 未 Omit `governanceMatrix`；`buildGovernedTools(options.gate, {…options,…})` 会透传该字段；`providerOptions` 为显式构造，`contextSections` 需显式加法（与 C2 提案一致）。
- `GOVERNANCE_CONFIRM_CARD_KINDS = ["appointment-write"]` 在 `run-role.ts` 内；`TRIO_CARD_KINDS` 为六角色唯一表；`VERSION_CHANGE_INITIATOR_BY_KIND` 与 `REFACTOR_REQUESTED_BY` 在 Model 中（映射与提案一致）。
- `resolveBoundary` Service 公开出口存在；trio 内置角色经 `resolveBoundarySection` 返回注册表条目 + acceptance；`project.roles` 快照外角色可能落到治理边界覆盖分支（F5 风险真实存在）。
- `buildProjectConfig(listing, acceptance, env, governanceBoundaryPath)` 与 `DESKTOP_RUNTIME_CONSENT` 存在；`createGovernanceJudge`/`createShellJudge` 有 `createAdapter` 注入缝；`test/测试/chat-handback-integration.test.ts` 存在。
- 现有项目 worker 角色卡普遍只有「工作立场/系统功能导航/必读资料/执行原则」等章节；按 `ROLE_CARD_REQUIRED_SECTIONS` 的标签解析，**多数现有 worker 的 `mainChain`（交接输入输出/标准工作流）会显示 unknown**，`duty` 仅能取到「职责与功能导航」。这是设计允许的诚实未知，但属于产品可用性风险（见 §十）。

---

## 二、总体结论

**批次结论：`needs revision`（需修订后再提交复审，非驳回）。**

- 未发现治理、边界、分层或权限层面的阻断性缺陷：写集全部落在各角色 Section 1（含 B-1/B-2）；未发现并发写同一文件；Pipeline 取数、Service 纯组装、Provider 注入才注册、适配器哑拼接的总体架构成立；单一来源（Model 常量 + `TRIO_CARD_KINDS` 快照）方向正确；T3 契约变更均已披露。
- 但存在一组**必须修订的跨提案契约/行为不一致**（载体、常量归属、空串过滤、判断会话防御、验收编号与基线），以及一项**实施入口必须重记 B0** 的前置。修订量小、均为加法/收敛，不改变 P1.1 产品口径，不需要重开闸门 1/2。
- **本审核不建议在修订完成与 B0 重记之前进入 C1a**；修订完成并经本角色复核（或由统筹确认与裁决一致）后，本审核对批次转为 `recommend approval`。

| 提案 | 结论 | 必改项（编号） |
| --- | --- | --- |
| 门禁引擎（C1a/C1b） | **需修订** | G-1、G-2、G-3、G-4、G-5 |
| 运行时核心（C2） | **通过** | 无（按 R-2/R-3/R-4/R-6/R-7 实施） |
| 编排（C3） | **需修订** | O-1、O-2、O-3、O-4 |
| Pi适配器（C4a） | **需修订** | P-1 |
| Claude适配器（C4b） | **需修订** | C-1 |
| Codex适配器（C4c） | **通过** | 无（D-1–D-4 按本审核采纳） |
| 测试（T1/T2） | **需修订** | T-1、T-2、T-3、T-4 |

**阻断项判断：** 无「不可修订/需重开闸门」的阻断项；在下列前置完成前，本批次**不得**进入实施（按团队计划 §5.2「P1 审核通过前不写产品代码」）。

---

## 三、写集合规、边界与并发

### 3.1 逐角色写集核对

| 角色 | 提案写集 | 边界 Section 1 依据 | 结论 |
| --- | --- | --- | --- |
| 门禁引擎 | `src/model/governance-matrix.ts`（新）、`src/common/门禁引擎/governance-roles.ts`、`role-card-sections.ts`（新）、`src/service/role/resolve-role.ts`、`src/service/governance-matrix/`（新）、`角色卡/门禁引擎/api-spec.md`、`test/门禁引擎/**`、自身 docs | B-1 单文件 + B-2 有界目录（md/yaml 已落）、`src/common/门禁引擎/`、`src/service/role/resolve-role.ts`、`test/门禁引擎/` | **合规** |
| 运行时核心 | `src/model/runtime.ts`、`src/service/runtime/session.ts`、`src/provider/runtime/{tools,schema}.ts`、`test/runtime-core/`、自身 docs | 单文件四项 + 测试目录 | **合规** |
| 编排 | `src/pipeline/orchestration/run-role.ts`、`test/编排/`、自身 docs | 单文件 + 测试目录 | **合规** |
| Pi适配器 | `src/provider/pi/session.ts`、`src/common/pi-adapter/real-adapter.ts`、`test/pi-adapter/`、自身 docs | 单文件 + 私有目录 + 测试目录 | **合规** |
| Claude适配器 | `src/provider/claude/session.ts`、`test/claude-adapter/`、自身 docs | 单文件 + 测试目录 | **合规** |
| Codex适配器 | `src/provider/codex/session.ts`、`test/codex-adapter/`、自身 docs | 单文件 + 测试目录 | **合规** |
| 测试 | `test/测试/`（含新集成测试与证据目录）、自身 docs | 测试目录 + docs | **合规**；不新增 `test/桌面应用/` 文件、不改 `app/desktop/**` |

- 未发现越界：没有提案写 `src/model/governance-matrix.ts`（除门禁引擎）、`src/service/governance-matrix/`（除门禁引擎）、共享文件（`src/model/runtime.ts`、`run-role.ts`、各适配器）均只有一个所有者。
- 无并发写同一文件：`run-role.ts`（编排）、`model/runtime.ts`（运行时核心）、三适配器各自唯一、`test/<role>/` 各自唯一、`test/测试/` 仅测试。
- 桌面端到端归属按闸门 2/团队计划/V1 由测试在 `test/测试/` 覆盖，未扩 `test/桌面应用/`；`app/desktop/**` 只读导入，符合边界。
- 交叉引用（编排只读导入 C1b 公共入口、C2 只 `import type` C1a 的 `GovernanceMatrixFn`、三适配器只消费 `RuntimeProviderOptions`）不构成写入。

### 3.2 并发与基线

- 提案写盘时披露的在途 VCA 修改（`run-manifest.ts`、`version-change-runtime.ts` 及两个测试）已在 `c3e50f5`/`ebbc2fc` 合入；当前 `src/app/test` 工作树干净。实施入口仍须按团队计划 §1.5 重新核对单写者并更新基线；**不得**把提案写盘时的并发披露当作当前状态。
- 本审核不改变团队计划的逐节点范围预留；任何角色不得写他人路径。

---

## 四、架构与分层核对

| 检查项 | 结论 | 说明 |
| --- | --- | --- |
| Pipeline 取数 | **成立** | C3 在 `openRoleSession` 调 `listProject`、`resolveBoundary(...).acceptance`、共享 `cardSections`、卡种/发起/会话快照；纯 Service 不取数。 |
| Service 纯组装 | **成立（以 G-3/G-4 修订为条件）** | C1b 不调用其他 Service、不读盘/写盘；仅读 Model 常量与门禁引擎注册表（设计 §5.2 允许）。 |
| Provider 注入才注册 | **成立** | C2 仅当 `GovernedToolsOptions.governanceMatrix !== undefined` 注册工具；worker/su/判断会话不注入 ⇒ 工具不存在。 |
| 适配器哑拼接 | **成立（Pi 需 P-1 统一）** | 三适配器只按固定位置拼 `contextSections`；不做清洗/限长/角色判定；Claude/Codex 增加判断会话防御性置空，Pi 目前没有（跨适配器不对称）。 |
| 单一来源 | **基本成立，需收敛** | VCA/refactor 复用 Model；`TRIO_CARD_KINDS` 只由 C3 快照；`APP_ROUTING_RULES` 为唯一新增小表。但渲染上限常量、worker 显示名载体、枚举失败载体在提案间不一致（R-2/R-3/R-4）。 |
| `ProjectListing`/`ProjectRoleSummary` 契约加法 | **T3 已披露** | `issues`/`roleDirectories`/`cardSections` 为加法；消费者重测列入 T2。 |
| 运行时共享契约加法 | **T3 已披露** | `GovernanceMatrixFn` 单一来源在 Model；`contextSections` 纯展示通道；两字段均为可选加法。 |
| 门禁/派发/冻结不被矩阵接入 | **成立** | 提案明确禁止导入/调用；需 T1-21 静态检查与 T2 回归钉住。 |
| 第二权威源防护 | **成立** | 固定句、摘要声明、工具结果仅 `{ok,message}`、无 `allowed/denied`；`APP_ROUTING_RULES` 标注 app-rule。 |

**替代方案比较（审核意见）：**

- 让各消费者自行解析 `cardText`：否决。违反 `角色卡/门禁引擎/api-spec.md:68` 与单一来源；门禁引擎共享解析（C1a）是正确方向。
- 把矩阵结构化结果放进 `ToolResult`：否决。扩大公共契约、诱导消费方把矩阵当数据源；`{ok,message}` 与设计 §5.2 一致（运行时核心 R5 采纳）。
- 让适配器各自计算/组装矩阵：否决。取数属 Pipeline；适配器只拼接。
- 把纯矩阵 Service 放进 `src/common/门禁引擎/`：否决。展示组装不是门禁判定；B-2 的 Service 目录合理。
- 三适配器抽公共拼接 helper：本案不采纳。会新增源文件并超出团队计划 C4a 精确写集；两处 Pi 实现以分别断言防漂移，接受小重复。

---

## 五、跨提案裁决清单（R-1…R-14）

> 裁决对七份提案与后续实施同时生效；与 P1.1 产品口径不冲突，属实现契约的收敛/加法。「采纳」= 按此实施并写入 api-spec/测试。

| 编号 | 事项 | 裁决 | 落点 |
| --- | --- | --- | --- |
| **R-1** | 写集与单写者 | **确认**：七份写集均在 Section 1 内；唯一写入者按团队计划 §5.2；B-1/B-2 已落。实施入口重新核对，不得并发写共享文件。 | 全部提案；团队计划 §1.5 |
| **R-2** | `listProject` 枚举失败载体 | **采纳 C1a 的 `MatrixRoleDirectories.error: string` 为唯一载体**；`GovernanceMatrixInput` 不新增 `listingError`；C3 在 catch 时填 `{found:false,totalDirs:0,archivedSkips:0,error:message}`；C1b 以 `error` 优先于「尚未 bootstrap」判定，并生成 `MatrixWarning{code:"role-enumeration-failed"}`（或等效原因文本），`role-enumeration-failed` 只作原因码，不成为第二输入字段。 | 门禁引擎 G-4；编排 O-1；测试 T1-18/19 |
| **R-3** | worker 显示名/H1 载体 | **采纳 `ProjectRoleSummary.cardSections.title` 为唯一解析来源；`WorkerRoleInput.displayName` 为唯一冻结输入载体**：C3 将 `row.cardSections?.title` 填入 `displayName`；C1b 组装器只读 `WorkerRoleInput.displayName`，不直接读 `cardSections.title`（或二选一并测试钉住，见 G-1）。`ProjectRoleSummary.displayName` 语义不变（仍只给内置角色）。缺 H1 ⇒ `unknown(not-declared-in-source)`。 | 门禁引擎 G-1；编排 O-2；测试夹具 H1 |
| **R-4** | 渲染上限常量归属 | **C1b 公共入口导出命名常量**：提示块 16,000、工具 48,000、单角色 1,500，以及 displayName 80/duty 500/mainChain 800/conventions 300；`renderGovernanceMatrix` 的 `render` 统计回填本次实际生效值；C3/C4/测试只导入常量，不得在 `run-role.ts`/适配器硬编码字面量（测试可断言常量值）。 | 门禁引擎 G-3；编排 O-4；运行时核心 R1；测试 T1-23 |
| **R-5** | `contextSections` 形状与空值语义 | **采纳 `readonly string[]` 单一通道**；Service 仅在「已定义」时透传；三适配器统一：`undefined`、`[]`、全部为空串元素 ⇒ 逐字不变；非空元素按序以 `\n\n` 拼接。不允许出现第二字段/第二类型。 | 运行时核心 R6；Pi §3.2；Claude §2.2；Codex D-4 |
| **R-6** | 判断会话防御性不拼接 | **三适配器统一采纳防御性置空**：`judgeMode`/`shellJudge`/`governanceJudge` 成立时即使误传 `contextSections` 也不拼接。理由：与既有 `installedSkills`/外来 MCP 在判断会话的收口同型；只做包含性防御，不做角色/注入范围判定；避免三适配器行为不对称。Claude/Codex 保留现有提案；Pi 必须新增（P-1），并在各自测试中以「误传也不拼」钉住。若验收方坚持「适配器不判定」，则须同时从 Claude/Codex 移除该守卫并在 V1 口径中确认——本审核不建议。 | Pi P-1；Claude §六-3；Codex D-3；测试 T1-05/T-5/T7 |
| **R-7** | 空串元素过滤 | **三适配器统一过滤空串元素**（`section.length > 0`）；`[""]`/`["",""]` 视为无段并与基线逐字相等。Pi/Codex 已如此；**Claude 需补**（C-1）。 | Claude C-1；Pi §3.2；Codex D-4 |
| **R-8** | Codex 数组锚点 vs P1.1 索引 3 | **采纳 Codex D-1/D-2**：实际数组在「固定角色/项目行」与「边界 JSON」之间多一条工具说明行，矩阵片段从索引 4 起；按锚点断言（边界 JSON 之后、promptGuidelines 之前、技能节最后），不硬编码索引 3。V1 AC-1 本身是锚点式表述，不构成偏差。 | Codex D-1/D-2；测试 T1-01 |
| **R-9** | 路由 `target:"application"` 与 AC-7 | **允许** `MatrixRoutingRule.target` 取 `"application"`（下载/应用通道），必须标 `basis:"app-rule"` 且注明「不是角色」；AC-7「目标为真实角色 id 或 `customer`」按「角色目标」解释，不得编造角色 id。因 V1 已冻结，**在 E2 前须由沟通/独立验收在验收口径中记录该解释**（或由策划补一条不弱化的澄清）；若验收拒绝该解释，C1b 需改为不输出下载路由而非编造 `customer`。 | 门禁引擎 §8-9；测试 T1-15；沟通/验收（未决） |
| **R-10** | `MatrixRequestChannel` 来源分量 | **需修订**：`roleLevel`（注册表）、`cardKinds`（Pipeline 快照）、`session`（会话）来源不同，单一 `source` 不能表达 AC-5 的「复合字段内部分量各自带来源」。C1a 增加显式来源字段（如 `roleLevelSource` 取 `"builtin-registry"` 或 `"app-rule"`），或把 `requestChoice`/`requestConfirmation` 改为带分量来源的复合类型；api-spec/测试同步。 | 门禁引擎 G-2；测试 T1-13 |
| **R-11** | C1b 模块内部结构 | **采纳** `public.ts`（唯一入口）+ `impl/`（builder/routing/renderer/sanitize），**不建 `abstract/`**：操作契约已由 Model 单一声明，再建抽象层会复制契约；现有项目 Service 亦为扁平单文件惯例。须在 api-spec 记录该结构为冻结公共入口。 | 门禁引擎 §4.1/§8-7 |
| **R-12** | B0 重记与证据失效 | **强制前置**：实施入口先把分支更新到当时 `origin/main`，由测试角色**重记 B0**（HEAD/工作树/依赖/Node/npm/typecheck/受影响套件/T3 全量/失败分类）；`7ba8a33`（及提案引用的计数）只作历史参考，**旧证据不复用**；新增确定性失败 = 0、新增 skip = 0 以重记后的 B0 为基线。当前 HEAD 已是 `ebbc2fc`。 | 测试 T-3；团队计划 §1.4/§5.3；全部实施角色 |
| **R-13** | `registry-unavailable` 的可测试性 | **降为测试约束**：在「不新增生产测试缝」前提下，进程内注册表模块加载异常不可注入；C1b 须明确该分支的防御性实现，并允许用「构造 `status:"unavailable"` 的矩阵渲染路径」验证文本；AC-9 的主证据放在枚举失败/边界损坏/坏 YAML，不把注册表异常当必经用例。不得为测试在生产路径加第二套 seam。 | 门禁引擎 G-5；测试 T1-18 |
| **R-14** | `MatrixForce.conventions.unknownReason` 加法 | **采纳**：设计 §5.1 的 `conventions` 无法表达「来源章节缺失」；可选的 `unknownReason?: MatrixUnknownReason` 是满足 AC-5 的加法细化；渲染必须显示 `unknown（原因）`，不得写「无约定」。同步 api-spec 与测试。 | 门禁引擎 §8-3 |

---

## 六、逐份结论与必改项

### 6.1 门禁引擎（C1a/C1b）：需修订

总体：契约与组装/渲染设计与 P1.1 一致；纯 Service、单一来源、强制力分层、注入防护方向正确；B-1/B-2 与 api-spec 路径合规。以下为**必改**：

- **G-1（worker 显示名载体自相矛盾）**：§3.1 的 `WorkerRoleInput.cardSections` 不声明 `title`，但 §4.2 的 worker 行以 `cardSections.title` 构造 `displayName`。必须统一为冻结形状：建议 `WorkerRoleInput.displayName` 为唯一输入载体（C3 从 `ProjectRoleSummary.cardSections.title` 填入），组装器只读 `displayName`；若保留 `cardSections.title`，则必须在 `WorkerRoleInput.cardSections` 中声明 `title?: string`，且不得两处同时作为权威。缺 H1 记 `unknown(not-declared-in-source)`，不要沿用 §4.2.2 表里的示意性 `unknown（role-card）` 原因码。测试钉住「displayName === cardSections.title」或单一来源。
- **G-2（`MatrixRequestChannel` 来源分量）**：按 R-10 增加分量来源，满足 AC-5；api-spec 与构建器测试同步。
- **G-3（渲染上限常量单一来源）**：按 R-4 在 `public.ts` 导出默认常量（并保证 `MatrixRenderInfo` 回填实际生效值）；测试断言常量与 AC-13 数值一致。否则 C3 的 16000/48000 字面量将成为第二来源。
- **G-4（枚举失败载体冻结）**：按 R-2 把 `roleDirectories.error` 定为唯一载体；写清与 `found=false`/「尚未 bootstrap」的优先级；`role-enumeration-failed` 的使用方式写进 api-spec；不得让 C3 另造 `listingError`。
- **G-5（`registry-unavailable` 证据口径）**：按 R-13 明确防御性分支与测试方式；不新增生产测试缝。

非必改但需记录：`MatrixForce.conventions` 的 `builtin-registry` source 与 `unknownReason` 属加法（R-14）；`builtin-role-as-worker` 防御性警告可保留（`MatrixWarning.code` 是 string，不要求进入 `ProjectRoleIssue` 枚举）；`APP_ROUTING_RULES` 四类路由与更新纪律保留。

### 6.2 运行时核心（C2）：通过

- 契约加法（`governanceMatrix?` / `contextSections?`）最小、可选、单点透传；「注入才注册」和严格参数面正确；工具只转达 `{ok,message}`，不判定、不写盘、不缓存；判断会话结构性走 judge 工具集。
- R1–R8 均按 §七.1 采纳；跨提案裁决中属本层的只有 R-5/R-6/R-7 的通道与空值语义（适配器侧动作由 C4 落）；R-4 要求 C1b 导出常量后，C2 测试直接导入常量或断言其值，不在 `schema.ts`/`tools.ts` 复制第二套上限。
- 实施约束：`GOVERNANCE_MATRIX_TOOL_NAME` 与 schema 中的工具名/枚举字面量由测试对照钉住（不要求为消除字面量而引入循环依赖）；C1a 冻结前不得写 `import type { GovernanceMatrixFn }`；C2 出口写冻结声明并更新 `api-spec.md`。

### 6.3 编排（C3）：需修订

总体：取数、注入、门控与单一来源方向正确；chief 提示块与惰性工具闭包符合 F12；不触 `runRole`/gate/卡种/发起门控。以下为**必改**：

- **O-1（失败载体）**：D1 改为消费 C1a 冻结的 `roleDirectories.error`（R-2），删除 `listingError` 方案与「其他载体」的空泛表述；`GovernanceMatrixInput` 构造按冻结形状。
- **O-2（worker 显示名）**：D3 改为「`displayName ← ProjectRoleSummary.cardSections.title`，组装器只读 `WorkerRoleInput.displayName`」（R-3/G-1），不再写「C1a 冻结后的 H1 载体（未定）」。
- **O-3（删除猜测性回退）**：§3.1 的 `roleDirectories ?? 保守回退` 必须删除或改为「字段缺失 ⇒ 诊断为契约违约，按降级/不可用诚实处理」；不得用 `workerRows.length>0 || warnings.length>0` 猜测 `found`。这与「unknown 不猜测」同口径。
- **O-4（常量导入）**：`PROMPT_MAX_CHARS`/`TOOL_MAX_CHARS` 从 C1b 公共入口导入（R-4），不在 `run-role.ts` 写 16000/48000 字面量；若 C1b 未导出，先回 C1b 补，不在 C3 复制。

实施约束（非必改）：`initiationByRole` 允许把既有三处内联门控收成同一私有谓词，但必须保持行为逐字不变并以六角色行为对照测试钉住（AC-10）；若不想承担重构风险，可直接从既有角色集合构造快照。D2/D5/D5b/D6/D7/D8/D9/D10/D11 按 §七.4 采纳。

### 6.4 Pi适配器（C4a）：需修订

- **P-1（判断会话防御性不拼接）**：Pi 目前依赖「Pipeline 不注入 ⇒ 字段缺席」，与 Claude/Codex 的适配器级防御不一致。按 R-6，在两处 `renderSystemPrompt` 调用路径上以既有 judge 状态（`opts.judgeMode`、`shellJudge`/`governanceJudge`）做防御性置空：判断会话即使误传 `contextSections` 也不拼接；测试 T7 由「字段缺席」改为「误传也不拼」，同时保留「缺省逐字不变」用例。该守卫只做包含性防御，不改变注入范围或角色判定。
- 其余通过：两处实现同步、固定位置、非空才拼、空串过滤已具备、不做清洗/限长、无新 helper、写集合规。

### 6.5 Claude适配器（C4b）：需修订

- **C-1（空串元素过滤）**：§2.2 只写「缺省或空数组」，代码草案直接 `...contextSections`；`[""]` 会在数组中留下空元素并引入额外的 `\n\n`，与 Pi/Codex 不一致。按 R-7 增加 `section.length > 0` 过滤；测试 T-1 增加 `[""]`、`["",""]` 与基线逐字相等的断言；§2.2 措辞同步。
- 其余通过：固定位置（数组索引 3 + 相对顺序双证）、判断会话防御、工具面不变、逐字透传、写集合规。`contextSections` 或 `judgeMode` 误传的测试保留。

### 6.6 Codex适配器（C4c）：通过

- D-1（额外工具说明行）与 D-2（索引 4 vs 3）按 R-8 采纳；测试用锚点断言，不硬编码索引 3。
- D-3（判断会话守卫）与 D-4（空串过滤）按 R-6/R-7 采纳，与另两适配器统一。
- D-5（工具段归属）、D-6（基线漂移）、D-7（依赖 C2）、D-8（行号漂移）按 §七.3 采纳。
- 实施时把漂移披露更新到当前 `ebbc2fc` 并按 R-12 重记 B0；其余无需修订。

### 6.7 测试（T1/T2）：需修订

- **T-1（用例编号缺口）**：§3.3 声明 T1-01–T1-27，但实际缺 **T1-17**（G8 只有 T1-16，G9 从 T1-18 开始）。必须补齐用例或重排连续编号，并保证 §3.4 AC 映射与完成报告引用一致。
- **T-2（AC-4/AC-5 表述）**：T1-13 的「`resolveBoundary().entries` 只贡献 acceptance」应改为「`resolveBoundary(...).acceptance` 只贡献接受状态；`entries` 不采用」；同时显式断言 `listing.roles[].boundary.acceptance` 占位（`accepted:false`）不被当作真实接受状态。
- **T-3（B0 漂移更新）**：§1.2 的漂移分析止于 `dc21fc1`；当前 HEAD 已是 `ebbc2fc`（PR #66），须更新披露；明确实施入口在更新后的 `origin/main` 上由测试角色**重记 B0**，`7ba8a33` 的 4,033/9/18 与 typecheck 0 仅为历史参考，旧证据不复用；重记后以新失败名单/计数作为 T2 判据。
- **T-4（T2 全量命令可复算）**：§4.1 命令块只写 `node --test --test-concurrency=1`，但正文要求沿用 B0 的「10 个目录 glob + `test/pi-adapter` 39 个显式文件、排除 `test/pi-adapter/write-sequencing.test.ts`」文件集。必须写出**完整可复算命令**（含 glob/显式文件/排除项）与 expected/expanded/missing/extra 覆盖校验；不得用裸命令把既有挂起测试纳入或静默改变文件集。
- 其余通过：AC-1–AC-18 映射齐备（AC-12/AC-18 明确不由 T1 证明，AC-14 由 T2 证明）；注入安全夹具、桌面端到端归属、证据与截图/录屏规则符合 V1；无生产测试缝。

---

## 七、判定点逐项意见

### 7.1 运行时核心 R1–R8

| 项 | 意见 |
| --- | --- |
| R1 工具层不做第二次截断 | **采纳**。48,000 上限由 C1b 渲染器单点保证，工具层原样转达；第二套截断会制造第二语义。C1b 未导出上限常量时按 G-3 先补。 |
| R2 `roleId` trim 后透传 | **采纳**。C2 只做形状与首尾空白归一，精确（大小写敏感、非前缀）匹配由 C3 注入函数对新鲜矩阵判定；测试覆盖 `" chief "`、未知 id、空串。 |
| R3 `section` 缺省 all，可与 roleId 组合 | **采纳**。缺省不携带字段；渲染器组合过滤；非法值在 C2 拒绝、C3 再防御。 |
| R4 `ok:false` 原样转达 | **采纳**。C1b 文本与 schema/guidelines 承担「不可用 ≠ 无权限」；工具层仅在抛错/畸形回执时生成诚实文案。 |
| R5 不在 `ToolResult` 加结构化矩阵 | **采纳**。保持 `{ok,message}`；避免扩大契约与诱发第二数据源。 |
| R6 `contextSections` 空数组 | **采纳并细化（R-5/R-7）**：Service 只透传已定义值；三适配器把空数组/全空串元素视为缺席；不得在 Service 做角色或内容判定。 |
| R7 判断会话误传能力 | **采纳（结构性 + R-6 防御）**：工具面结构性隔离；提示面由三适配器防御性置空；测试两层都覆盖。 |
| R8 等 C1a 冻结 | **采纳**。不得以「先落其余三文件」为例外；C1a 冻结声明是 C2 硬前置。 |

### 7.2 判断会话防御与空串过滤（跨适配器）

| 提案 | 原口径 | 意见 |
| --- | --- | --- |
| Pi §八-3 / §3.2 | 不在适配器按 judgeMode 过滤；由字段缺席保证 | **需修订（P-1）**：改为防御性置空；理由见 R-6。空串过滤已具备，保留。 |
| Claude §六-3 / §2.2 | 判断会话防御性置空；未过滤空串元素 | 防御**采纳**；**补空串过滤**（C-1）。 |
| Codex D-3/D-4 | 判断会话守卫 + `filter(length>0)` | **采纳**（R-6/R-7），三适配器口径以此统一。 |

### 7.3 Codex D1–D8

| 项 | 意见 |
| --- | --- |
| D-1 额外工具说明行 | **采纳**：实际数组多一行；固定锚点仍成立。 |
| D-2 索引 3 vs 4 | **采纳**：按锚点断言，不硬编码 3；V1 AC-1 为锚点式。 |
| D-3 判断会话守卫 | **采纳**（R-6）。 |
| D-4 空元素过滤 | **采纳**（R-7）。 |
| D-5 工具段归属 | **采纳**：适配器不注册工具，只保位置。 |
| D-6 基线漂移 | **采纳**，更新到 `ebbc2fc` 并按 R-12 重记 B0。 |
| D-7 `contextSections` 当前不存在 | **采纳**：C2 冻结后实施；不得先改 Model。 |
| D-8 行号漂移 | **采纳**：以符号名为准。 |

### 7.4 编排 D1–D11

| 项 | 意见 |
| --- | --- |
| D1 枚举失败载体 | **需修订**：改用 `roleDirectories.error`（R-2/O-1）。 |
| D2 worker 条目只取 listing | **采纳**：`resolveBoundary` 只贡献 acceptance；测试 T1-13 修正表述（T-2）。 |
| D3 worker H1/displayName 载体 | **需修订**：固定为 `ProjectRoleSummary.cardSections.title` → `WorkerRoleInput.displayName`（R-3/O-2）。 |
| D4 渲染默认常量归属 | **需修订**：从 C1b 导出常量导入（R-4/O-4）。 |
| D5 基线漂移 | **采纳**：更新到当前基线并重记 B0（R-12/T-3）。 |
| D5b 并发写披露 | **采纳**：相关在途改动已合入 `ebbc2fc`；实施入口重新核对单写者。 |
| D6 chief 注入时点 | **采纳**：放在能力组装前、仍在 `bindRole` 前；会话标志反映实际装配结果，语义不变。 |
| D7 product 的 customerInput 会话标志 | **采纳**：用 `governedInput !== undefined`，区分宿主注入与角色能力。 |
| D8 「五角色启动不计算」证明方式 | **采纳**（测试约束）：不新增生产缝；以诊断事件 + 行为（提示快照不变、工具首调反映新值）证明；报告如实披露证明强度。 |
| D9 `resolveBoundary` 公开出口 | **采纳**：不导入门禁引擎私有实现。 |
| D10 `RuntimeSessionOptions` 位置 | **采纳**：C2 在 `src/service/runtime/session.ts` 落字段；C3 工厂透传以 C2 冻结为准。 |
| D11 工具参数两层校验 | **采纳**：C2 负责 schema/多余字段，C3 负责新鲜矩阵的枚举/存在性；不合并成第二套 schema。 |

### 7.5 门禁引擎 §8 各点

| 项 | 意见 |
| --- | --- |
| §8-1 基线漂移 | **采纳**；当前已到 `ebbc2fc`，按 R-12 重记 B0。 |
| §8-2 `resolveBoundary` vs `resolveBoundarySection` | **采纳**：经 Service 公开出口。 |
| §8-3 `conventions.unknownReason` | **采纳**（R-14）。 |
| §8-4 `roleDirectories.error` | **采纳并冻结**（R-2/G-4）；C3 不再造 `listingError`。 |
| §8-5 worker H1 公开通道 | **需修订**（G-1/R-3）：统一载体，避免 `title` 不在 `WorkerRoleInput.cardSections` 类型中。 |
| §8-6 Model 不依赖 Service | **采纳**：`MatrixIssueInput.code: string` 由 Pipeline 映射；`ProjectRoleIssue` 枚举仍在 `resolve-role.ts`。 |
| §8-7 Service 模块结构 | **采纳**（R-11）：`public.ts` + `impl/`，不建 `abstract/`；api-spec 记录。 |
| §8-8 渲染截断统计承载 | **采纳**：保留 `string` 返回；在本次请求新建的矩阵实例上回填 `render` 统计；常量按 G-3 导出。 |
| §8-9 路由目标 `application` | **采纳但附验收澄清**（R-9）；E2 前由沟通/验收记录解释。 |
| §8-10 `APP_ROUTING_RULES` 具体条目 | **采纳**：四类 app-rule；每条有测试与更新纪律。 |
| §8-11 注册表展示字段结构 | **采纳**：`matrix: { duty, mainChain, cardDiscipline?, dispatchScope? }`；只读、不参与判定。 |
| §8-12 warnings 去重规则 | **采纳**：同 `relDir` + reason 一条；汇总提示保留 `listing-warning`；测试覆盖。 |
| §8-13 防御性 `builtin-role-as-worker` | **采纳**：上游过滤 + 组装器防御并记 `MatrixWarning`；不改变角色集合。 |
| §8-14 锚点行号 | **采纳**：实施以符号名/文本锚点为准。 |

---

## 八、验收对应与 T3

### 8.1 AC 映射完整性

- 七份提案对 AC-1–AC-18 的分工已齐备：C1a/C1b 覆盖 AC-3/4/5/6/7/9/10（部分）/11（部分）/12/13/16；C2 覆盖 AC-2/10/15/16/17；C3 覆盖 AC-1/2/6/8/9/10/15/17；C4a/b/c 覆盖 AC-1 的各自固定位置与缺省不变；测试 T1/T2 覆盖跨层集成、恶意夹具、刷新、桌面端到端与全量回归；AC-12/AC-18 明确由 T2/E1/E2 与文档所有者承担。
- 需在后继修订中保持：测试 T-2 的 acceptance 表述；R-9 的 `application` 验收口径；R-10 的通道来源证据；G-3 的常量为 AC-13 证据。
- 本审核不判定任何 AC；E2 由内置独立验收按 V1 判定。

### 8.2 B0 重记（实施前置，强制）

- B0 记录于 `7ba8a33`；当前 HEAD `ebbc2fc`（PR #65、#66 已合入）。按团队计划 §1.4/§5.3、V1 §4.2 与 R-12：**实施入口必须先把分支更新到当时 `origin/main`，由测试角色重记 B0**（HEAD/工作树、依赖安装、Node/npm/OS/Shell、`typecheck`、受影响套件、T3 全量命令与文件集、失败逐名分类、skip/todo 计数），确认无产品代码改动；旧 B0 计数与旧证据**不得复用**。若重记暴露新增确定性失败或新增 skip，停止并回报统筹，不得归为环境。
- 受共享契约变更影响的消费者（`buildProjectConfig`、`list-project.test.ts`、三适配器、`buildGovernedTools` 调用方、`run-role.ts` 调用方、注册表断言）须按 T3 重测；证据只对同一候选/同一输入有效。

### 8.3 T3 口径

- 本批次 T3 成立（新增 Model/Service 公开入口、`model/runtime.ts` 共享契约、`ProjectListing`/`ProjectRoleSummary` 形状、治理注册表展示字段、跨角色提示/工具通道）。T2 必须执行全量适用回归 + `npm run typecheck`；`typecheck:renderer`/`build:renderer` 记 N/A 与理由；不得以单测替代集成/端到端/故障注入/文件账本证据。

---

## 九、实施前必须完成的前置清单

以下全部满足后，本批次才可按团队计划进入 C1a；缺一不得派发：

1. **B0 重记**：在更新后的 `origin/main` 上由测试角色重记 B0（R-12/§8.2）；旧 B0 不复用。
2. **基线复核**：确认 `ebbc2fc` 之后的在途工作（`run-manifest.ts`、`version-change-runtime.ts` 及其测试）已合入/冻结；实施入口重新核对目标文件哈希；任何漂移先回报。
3. **门禁引擎修订 G-1–G-5 并提交复审**（worker 显示名载体、`MatrixRequestChannel` 来源、常量导出、枚举失败载体、registry-unavailable 证据口径）。
4. **编排修订 O-1–O-4 并提交复审**（失败载体、H1 载体、删除猜测回退、常量导入）。
5. **Pi 修订 P-1、Claude 修订 C-1 并提交复审**（判断会话防御、空串过滤统一）。
6. **测试修订 T-1–T-4 并提交复审**（编号、acceptance 表述、B0 漂移到 `ebbc2fc`、T2 精确命令）。
7. **验收口径澄清**：R-9（`application` 目标）在 E2 前由沟通/独立验收记录；若拒绝，按不输出下载路由处理，不得编造角色。
8. **H1 复核**：确认门禁引擎 `boundary.md`/`boundary.yaml` 一致、changelog 记录完整、无其他未列 diff（本审核已只读核对，实施入口再核）。
9. **单写者预留**：按团队计划 §5.2 为 C1a→C4→T1→T2 逐节点预留；确认无其他会话并发写共享文件。
10. **api-spec 更新计划**：门禁引擎、运行时核心、三适配器的 `api-spec.md` 在各自节点完成后同步；矩阵 Model/Service 的公共形状以 C1a/C1b 冻结声明为准。
11. **不得扩写集**：B-1/B-2 之外的新路径、`test/桌面应用/` 新文件、i18n key、桌面代码、生产测试缝，均须停止回报并按闸门 2 增补。

---

## 十、风险与未决问题

### 10.1 风险

| 编号 | 风险 | 说明与缓解 |
| --- | --- | --- |
| RK-1 | 提示注入边界 | worker 角色卡摘录进入幕僚系统提示；渲染器数据化包裹/清洗/限长/固定声明是唯一防线，测试 T1-24 必须覆盖伪造分隔符、控制字符、超长、指令诱导；模型仍可能把数据当指令，固定句与声明必须逐字存在。 |
| RK-2 | unknown/来源语义 | `MatrixRequestChannel` 单 source 问题（R-10）、`roleDirectories.error` 载体（R-2）、listing acceptance 占位（T-2）是主要歧义点；按裁决收敛并在 api-spec/测试中钉住。 |
| RK-3 | 强制力分层 | worker `.ans/` 不得写硬拒；宿主未注入不得写成角色无权；内置硬拒只含 `forbiddenWritePaths`；AC-3/AC-10/AC-16 证据必须逐层断言。 |
| RK-4 | 单一来源漂移 | 渲染上限常量（R-4）、卡种快照（R-2/R-3）、`APP_ROUTING_RULES`（R-9）是新增/复用边界；任何硬编码字面量或第二张表按反例处理。 |
| RK-5 | 判断会话误注入 | 三适配器防御已统一（R-6）；若后续新增适配器/会话路径，必须复用同一防御口径。 |
| RK-6 | 真实 worker 卡章节缺失 | 现有项目 worker 卡普遍没有「交接输入输出/标准工作流」，矩阵的 `mainChain` 将显示 unknown；这是诚实语义，不得用自造解析补救。产品可用性预期应记录，后续如需提升应走方案变更（扩展章节映射），不在本批次偷加。 |
| RK-7 | 会话快照过期 | 幕僚提示块为启动快照；工具每次现算；文本含 generatedAt；不得自动改写系统提示。 |
| RK-8 | 基线/并发漂移 | `7ba8a33 → dc21fc1 → ebbc2fc` 已发生两次前进；实施入口旧证据不复用，E1 披露基线更新与冲突解决。 |
| RK-9 | Windows 环境失败 | 既有 symlink EPERM 基线只能用于分类，不得把新增红归为环境；新 B0 重记后重新对照。 |
| RK-10 | 范围蔓延 | O-1–O-8 全部未选；不得借实现加面板、缓存、导出、派发提醒、i18n key、桌面代码或生产测试缝。 |

### 10.2 未决问题

1. **R-9 `application` 路由目标的验收解释**：需沟通/独立验收在 E2 前记录；本审核只裁决「不得编造角色 id」。
2. **`registry-unavailable` 的可测试性**：R-13 降为测试约束；如验收要求可注入，需另行确认是否允许生产 seam。
3. **真实 worker 卡章节覆盖**：是否在未来扩展章节映射（例如把「系统功能导航」同时作为 mainChain 的补充来源）属方案变更，需策划/客户确认；本批次不做。
4. **`MatrixRequestChannel` 来源形状**：G-2 的具体字段名由 C1a 在冻结前确定并写入 api-spec；本审核只要求「分量来源可核对」。

---

## 十一、声明

- 本文件是**项目管理 P1 审核记录**，结论为 `needs revision`（批次级，附逐份必改项与跨提案裁决）。它**不替代**闸门 0/1/2、不替代客户实施授权（IA）、不替代独立验收；审核建议不等于客户批准，也不证明代码可用。
- 本审核**未实施、未测试**：未改任何产品/测试代码，未运行产品测试/应用，未 commit/push；只做了只读哈希/行数/锚点/边界核对与文件数统计。提案中的测试计数、B0 计数均为提案自述，本审核未复核其运行结果。
- 修订由各原所有者在其自身 `docs/change/`/`docs/feature/`/`api-spec.md` 边界内完成；本角色不代改其他角色提案。修订后按 `references/proposal-review.md` 重新核对实际版本，再更新本审核结论。
- 所有实现仍受团队计划 §5 阶段顺序、单写者、B0 重记、T3 证据与 V1 判定约束；提交/推送/合并/发布一律另行授权。

---

## 十二、复核确认（Revision 1 / v1.1，2026-11-05）

本节对五份修订提案做第二轮复核；运行时核心与 Codex 提案未修订，维持 §六「通过」结论。本节**更新 §二/§九对批次与逐份结论的表述**；§一至§十一保留为第一轮审核记录（第一轮版本 358 行 / `0128f615a7cfe52df36351036f4246d1b91efc236c7cce3852325639eccc762f`，修订提案所引用的即该版本）。本轮仍未实施、未测试，未改代码/测试/其他文档，未 commit/push。

### 12.1 修订版本核对（本文件追加前实测）

| 提案 | 修订版本 | 行数 | SHA-256 | 与交办值 |
| --- | --- | --- | --- | --- |
| 门禁引擎 | v1.1 | 663 | `3d50a17adea24abb17bffd10dfcbcc876d4f4bc4a8ac83a5f2b895a5b54583bb` | 一致 |
| 编排 | Revision 1 | 486 | `c5e4dd6200a2ca5583baf89ccf9ad9d15675c1e06304f0bb648fd28d6a64fbde` | 一致 |
| Pi适配器 | v2 | 214 | `5087e5a4282b9cfb4be63219ef361cc6d7648594934ab3d07224fecb8873654d` | 一致 |
| Claude适配器 | v2 | 219 | `011585d3aa1530bd48c136a24eaabe1b3208ebd088006f5cfd59cabd664c9e2d` | 一致 |
| 测试 | Revision 1 | 485 | `eda2588a40915f14b4f0da71478b16a7088a7e2803a02aa2910a4c32baa80dcb` | 一致 |
| 运行时核心 | v1（未修订） | 354 | `d8e0bfc00aaf3cf5506bb85cf9a779cf307f3c757ea494527be462ebe8ea9cd6` | 维持通过 |
| Codex适配器 | v1（未修订） | 220 | `df8e5387e44bf52c82193bb30ba9f0d25718a3cf164b073d5374e6aebd9e0279` | 维持通过 |
| 当前 HEAD | — | — | `ebbc2fcffcc5cd1c2163db72bcfb1c03d599e3e6` | 未变；`src app test` 干净 |

### 12.2 逐份复核结论

| 提案 | 必改项落实 | 复核结论 | 遗留项 |
| --- | --- | --- | --- |
| 门禁引擎 v1.1 | G-1 已落实（`WorkerRoleInput.displayName` 为唯一输入载体，`cardSections` 不携带 title；§3.3/§4.2/§8-5）；G-2 已落实（`MatrixRequestChannel` 三分量显式来源，§4.2 规则 9/§8-14）；G-3 已落实（`public.ts` 导出 `GOVERNANCE_MATRIX_PROMPT_MAX_CHARS`/`..._TOOL_...`/`..._PER_ROLE_...`/`..._FIELD_MAX_CHARS`，Model 只声明字段，§4.3/§8-15）；G-4 已落实（`roleDirectories.error` 唯一载体，不新增 `listingError`，§3.4/§8-4）；G-5 方向采纳 | **仍需修订（两项小修，C1a 冻结前）** | **G-2b**：worker 行 `roleLevel.source` 仍写 `"registry-capability"`（§4.2 worker 行），但项目角色不在注册表、其 `false` 来自应用规则；应改为 `"app-rule"` 或把 `roleLevel.source` 类型扩为 `"registry-capability" 或 "app-rule"`，否则 AC-5 来源不真实。**G-5b**：v1.1 把 `registry-unavailable` 从 `MatrixUnknownReason` 删除（P1.1 §5.1 明列该成员），按 P1.1 §5.4/团队计划 §1.6 属契约删除；C1a 冻结前须二选一：恢复该枚举成员（可作防御性未用值，行为不变），或由沟通/策划记录 P1.1 澄清（全局不可用改由 `status:"unavailable"` + `MatrixWarning{code:"registry-unavailable"}` 表达，V1/E2 按此解释）；否则应重开闸门 1。**G-5c（条件性）**：内部 seam `buildGovernanceMatrixWith(input, builtins)` 仅在「不进入 `public.ts`、生产路径只传真实注册表、测试经 impl 内部导入、E1 披露」条件下接受；若统筹按「不新增生产测试缝」字面口径，改用构造 `status:"unavailable"` 矩阵的渲染路径验证。 |
| 编排 Revision 1 | O-1 已落实（`roleDirectories.error`，无 `listingError`；§3.1/§9-D1）；O-2 已落实（`cardSections.title → WorkerRoleInput.displayName`；§3.1-3/§9-D3）；O-3 已落实（删除猜测回退，字段缺失=契约违约并传 `error`；§3.1/§9-D1）；O-4 已落实（导入 C1b 常量，无字面量；§3.2/§3.3/§9-D4）；D12 对齐 R-5/R-6/R-7 | **确认** | 非阻断：§3.6 诊断仍写 `governance.matrix.listing-fallback`，而 §3.1 使用 `governance.matrix.contract-violation`；实施时统一为一个事件名并在 api-spec/记录披露（不影响语义/写集）。 |
| Pi适配器 v2 | P-1 已落实（四个调用点 judge 置空：`pi/session.ts` 假适配器与公开外壳、`real-adapter.ts` `composeContext` 与 `bindRole`；T7a/T7b「误传也不拼」）；R-5 单一通道、R-7 空串过滤（T3 覆盖 `[""]`/`["",""]`） | **确认** | 无。四个调用点与当前代码（`pi/session.ts:168/356`、`real-adapter.ts:1409/1585`）逐一对应；写集未扩大。 |
| Claude适配器 v2 | C-1 已落实（`filter(section => section.length > 0)`；T-1 覆盖 `[""]`/`["",""]`/混合数组；§2.2/§六-10） | **确认** | 非阻断：§六-1 基线漂移文字仍停在 `dc21fc1`（历史快照），实施入口以 `ebbc2fc` 与重记 B0 为准即可。 |
| 测试 Revision 1 | T-1 已落实（新增 T1-17，T1-01–T1-27 连续，共 27 条）；T-2 已落实（acceptance 只来自 `resolveBoundary(...).acceptance`，listing 占位不作真实状态）；T-3 已落实（B0 更新到 `ebbc2fc`，实施入口重记、旧计数仅历史参考）；T-4 已落实（10 个目录 glob + 39 个显式 pi-adapter 文件，排除 `write-sequencing.test.ts`；实测 39 个文件与清单逐项一致、10 个 glob 覆盖全部非 pi-adapter 测试目录、447 文件口径正确） | **确认（附 T1 前遗留对齐项）** | **T-5**：T1-15 仍写「目标均为真实角色 id 或 `customer`」，与 R-9/门禁引擎 `target:"application"` 冲突；T1 前须改为「真实角色 id、`customer` 或明确标注的应用通道 `application`（不是角色）」，并保留「不编造角色」。**T-6**：T1-13 的来源枚举仍只列 `builtin-registry/model/boundary-yaml/role-card/app-rule/session`，需补 C1a 新增的 `registry-capability`/`session-snapshot`（通道分量），否则 AC-5 分项漏检。两项均不阻断 C1a，须在 T1 实施前修正。 |
| 运行时核心（未修订） | 维持第一轮结论 | **确认** | 无。R1–R8 按 §七.1；C2 是唯一不改的通过项。 |
| Codex适配器（未修订） | 维持第一轮结论；D-1/D-2/D-3/D-4 与 R-6/R-7/R-8 一致 | **确认** | 无。 |

### 12.3 跨提案裁决一致性（R-1…R-14）

| 裁决 | 复核状态 |
| --- | --- |
| R-1 写集/单写者 | **仍一致**：五份修订均未扩写集；编排仍只 `run-role.ts` + `test/编排/`；适配器各两/一文件 + 测试；测试仍 `test/测试/`。 |
| R-2 枚举失败唯一载体 | **一致**：门禁引擎 `roleDirectories.error`、编排 O-1、测试 T1-18/E1/E2 均按此；无 `listingError`。 |
| R-3 worker 显示名通道 | **一致**：`cardSections.title → WorkerRoleInput.displayName → 组装器`；门禁引擎 G-1、编排 O-2、编排测试组 D5、测试 T1-10 对齐。 |
| R-4 上限常量单一来源 | **一致**：门禁引擎 `public.ts` 导出三常量 + 字段上限；编排导入同名常量；测试 T1-23/D5/F3 按常量断言。**但** G-2b 的来源语义属另一问题（见上）。 |
| R-5 `contextSections` 单一通道/空值 | **一致**：Pi v2、Claude v2、Codex（未改）、编排 D12 均为「单一 `readonly string[]`；`undefined`/`[]`/全空串=逐字不变；非空才拼」。 |
| R-6 判断会话防御 | **一致**：Pi v2 四调用点、Claude T-5、Codex D-3、编排 D12 均防御性置空；三适配器口径统一。 |
| R-7 空串过滤 | **一致**：Pi §3.2/T3、Claude §2.2/T-1、Codex D-4 均为 `section.length > 0`。 |
| R-8 Codex 锚点 | **一致**：Codex 未修订，D-1/D-2 维持锚点断言。 |
| R-9 `application` 路由目标 | **未完全一致**：门禁引擎按 R-9 输出 `application`；测试 T1-15 仍按「角色 id 或 customer」断言（T-5）；E2 前的验收口径解释仍未记录。**不影响 C1a，但 T1 前必须修正测试并在 E2 前记录解释。** |
| R-10 通道来源分量 | **大体一致**：门禁引擎三分量已实现；**但 worker `roleLevel.source` 语义仍不准确（G-2b）**，测试 T1-13 来源枚举未含新分量（T-6）。 |
| R-11 C1b 模块结构 | **一致**：`public.ts` + `impl/`，不建 `abstract/`；§4.1/§8-7 维持。 |
| R-12 B0 重记 | **仍为强制前置**：测试 T-3 已按 `ebbc2fc` 更新；实施入口仍需重记，旧 B0 计数不复用。 |
| R-13 `registry-unavailable` 测试性 | **接受但需收口**：内部 seam 条件见 G-5c；枚举删除的契约问题见 G-5b（此项使 R-13 的处置不能只在测试层收口）。 |
| R-14 `conventions.unknownReason` 加法 | **一致**：门禁引擎 v1.1 §8-3 保留并采纳。 |

### 12.4 是否可进入 C1a

**结论：可以有条件进入 C1a（复核通过，附 C1a 冻结前小修与团队级前置）。**

条件（缺一不派发 C1a）：

1. **B0 重记（R-12）**：在更新后的 `origin/main`（当前 `ebbc2fc`，若再前进则按当时值）由测试角色重记 B0；旧 B0 计数仅历史参考。
2. **门禁引擎 v1.2 小修**：G-2b（worker `roleLevel.source` 改 `app-rule` 或扩类型并记录语义）与 G-5b（恢复 `registry-unavailable` 枚举成员，或由沟通/策划记录 P1.1 澄清；若保留删除且无澄清，按团队计划 §1.6 应重开闸门 1）。两项均为同一文件的小修，不改变产品口径、不扩写集。
3. **G-5c 条件**：内部 seam 只留在 impl、不进入 `public.ts`、生产路径只传真实注册表；否则改用构造矩阵渲染路径。
4. **单写者/基线复核**：实施入口重新核对目标文件哈希与在途写面（§三/§九）。
5. **T1 前**：测试 T-5/T-6 修正；**E2 前**：R-9 的 `application` 验收解释由沟通/独立验收记录。

满足 1–4 后可进入 C1a；C1a 冻结声明须写明 G-2b/G-5b 的处置结果与 `registry-capability`/`app-rule`/`session-snapshot` 的来源语义。编排、Pi、Claude、测试、Codex、运行时核心的修订/维持均无 C1a 阻断项；测试的 T-5/T-6 与 E2 的 R-9 属后续节点前置，不阻断 C1a。

### 12.5 遗留注意项（不改变上述结论）

1. 编排 §3.6 诊断事件名与 §3.1 不一致（`listing-fallback` vs `contract-violation`），实施时统一。
2. 门禁引擎 v1.1 的 `MatrixChannelSource` 类型已声明但字段仍用字面量；建议统一引用该类型（非阻断）。
3. `download`/`shellEscalation` 的 `roleLevel:false` 与 `source:"session"` 仍有同源的来源语义混写；若 E2 严格按 AC-5 逐分量核，建议在 api-spec 说明 `roleLevel` 为应用规则、`source` 仅指会话可用性（非阻断）。
4. 现有 worker 角色卡普遍缺「交接输入输出/标准工作流」章节，`mainChain` 将显示 unknown（诚实语义，不得自造解析）；产品可用性预期仍按 §十 RK-6 记录。
5. R-9 的验收解释、G-5b 的 P1.1 澄清（若走该路径）都必须由沟通/策划/验收在其自身记录中留下依据；本复核不代客户或验收做决定。
6. 本复核不改变 §九的其余前置（H1 复核、api-spec 更新、逐节点预留、禁止扩写集）与 §十的风险清单。
7. 门禁引擎 v1.1 的 `MatrixRequestChannel` 由 P1.1 §5.1 的扁平形状改为三分量（`roleLevel`/`cardKinds`/`session`），属为满足 AC-5 的契约细化：须在 C1a 冻结声明、api-spec 与 E1 披露；若验收按 P1.1 §5.1 逐字比对，应按 R-9 同级方式记录澄清（不改变行为、不新增权限）。

**声明重申：** 本复核确认仍**不是客户批准、不是实施授权、不是验收结论**；不替代闸门 0/1/2、IA、独立验收，也不证明代码可用。未实施、未测试；提交/推送/合并/发布一律另行授权。

---

## 十三、最终确认（门禁引擎 v1.2，2026-11-05）

本轮只读核对门禁引擎 v1.2（**670 行 / SHA-256 `275f04d363c57036511a2d8da02ac6c68abff87b66561bf592d022971ff31e51`**，与交办值一致）；未改任何提案内容，未实施代码。

### 13.1 三项复核条件的落实

| 条件 | v1.2 落点 | 确认 |
| --- | --- | --- |
| **G-2b**：worker `roleLevel.source` 不冒充注册表 | `MatrixRequestChannel.roleLevel.source` 扩为 `"registry-capability" 或 "app-rule"`（§3.1）；内置六角色 `registry-capability`、项目角色 `app-rule`（§4.2 规则 9/§8-14）；worker 行明确「项目角色不在注册表；无客户通道来自应用规则」 | **满足** |
| **G-5b**：恢复 P1.1 §5.1 的 `registry-unavailable` 成员 | `MatrixUnknownReason` 恢复该成员并注明 P1.1 §5.1 契约基线、Model 保留、生产不使用；注册表不可用仍由 `status:"unavailable"` + `MatrixWarning{code:"registry-unavailable"}` 表达（§3.1/§4.2 规则 7/§8-16） | **满足**；契约删除已消除，**不触发重开闸门 1** |
| **G-5c**：seam 三条件 | `buildGovernanceMatrixWith(input, builtins)` 仅存在于 `impl/builder.ts`：不进入 `public.ts`、生产只传真实 `BUILT_IN_GOVERNANCE_ROLES`、测试只经 `impl/builder.ts` 导入；写入 §4.1/§6.2 冻结声明与 §8-18 | **满足** |

另核对：v1.2 只改本文件、写集未扩大（670−663=7 行增量集中于上述三处与诊断附注）；G-1/G-3/G-4 维持 v1.1 已确认状态；无新偏差。诊断附注（§8-19）明确 C1a/C1b 不新增矩阵专用诊断事件、如需采用编排统一后的单一名称，符合「单一实现」原则。

### 13.2 C1a 启动结论

**是。v1.2 满足本轮复核的全部条件；批次结论由「有条件复核通过」更新为 `recommend approval`。在 B0 v2 记录完成后，C1a 无需再修订 P1 提案即可启动（无条件启动，指无进一步 P1 修订项）。**

仍需按团队计划执行的标准派发检查：更新到当时 `origin/main`、重记 B0 v2、单写者/范围预留、H1 已落核对、api-spec 更新计划。若 B0 v2 暴露方案未覆盖的语义冲突或目标文件漂移，按团队计划停止并回报统筹（不属于 P1 提案修订）。C1a 冻结声明须记录：`MatrixRequestChannel` 三分量与 `roleLevel` 来源语义、`registry-unavailable` 成员保留、内部 seam 三条件、上限常量导出名。

### 13.3 补充注意项（不阻断 C1a）

1. 测试 T-5/T-6 仍需在 T1 前修正（T1-15 的 `application` 目标、T1-13 的来源枚举）；R-9 的验收解释在 E2 前由沟通/独立验收记录。
2. 编排 §3.6 的 `listing-fallback` 与 `contract-violation` 名称在实施时统一（门禁引擎已声明不另起诊断）。
3. `download`/`shellEscalation` 的 `roleLevel:false` 与 `source:"session"` 属设计原有表述；建议 C1a api-spec 说明「roleLevel 为应用规则、source 仅指会话可用性」，非阻断。
4. `MatrixChannelSource` 类型已声明但字段仍用字面量；可选统一下，非阻断。
5. 现有 worker 角色卡缺「交接/工作流」章节导致 `mainChain` 普遍 unknown，属诚实语义与产品可用性风险（§十 RK-6），不得自造解析。

**声明：** 本最终确认不替代客户批准、IA、独立验收；未实施、未测试；提交/推送/合并/发布另行授权。

---

## 十四、C1a 契约冻结确认（2026-11-05）

本节只读核对门禁引擎 C1a 候选（基线 HEAD `0418746ae9f2ed20f389c26da34ef55840febfe6`，工作树未提交，状态 `implemented-unverified`）；未改任何候选代码/测试/提案，只写本文件。核对对象与实测身份：

| 文件 | 行数 | git blob（实测） | sha256 前缀 |
| --- | --- | --- | --- |
| `src/model/governance-matrix.ts`（新） | 257 | `1b1f6fdbb11bc96454ed0845124157f89c90276b` | `882670e83260` |
| `src/common/门禁引擎/governance-roles.ts` | 705（+83） | `f25580dfb97e9d621ec670f4ed52843f643d6201` | `f5eb64350919` |
| `src/common/门禁引擎/role-card-sections.ts`（新） | 143 | `4a8a7752675fdba407337d49f2a30a35cf44d85e` | `7e489100e29b` |
| `src/service/role/resolve-role.ts` | 520（+85/−8） | `053688ee870cc7c463fdda3a1f96e22a6946a14e` | `9c169797ff01` |
| `角色卡/门禁引擎/api-spec.md` | 363（+42） | `c2f72c4a179507bdf1c4af00ef12838bf1669396` | `defff596fa70` |
| `test/门禁引擎/governance-matrix.test.ts`（新） | 156 | `e76e906787cae16fdf1a48e6ab154230f204c91c` | `8154b101c7c2` |
| `test/门禁引擎/role-card-sections.test.ts`（新） | 128 | `7311498f56036266230b028a1103e2445b463228` | `b7254d80b687` |
| `test/门禁引擎/list-project.test.ts` | 433（+122） | `38c25fb87d8600b9d718d12f81a0b0753cb8f486` | `74abf4c4bdb2` |

工作树 `git status --porcelain -- src app test` 仅以上候选；`src/common/shared/i18n`、`app/**` 无改动；未发现写集外产品/测试变化。独立复核：`node --test --test-concurrency=1 "test/门禁引擎/**/*.test.ts"` 实测 **328 计 / 327 过 / 0 失败 / 1 skip / exit 0**（与报告一致；基线 312/311/0/1，新增 16 例）；`npm run typecheck` 实测 **exit 0**（无诊断）。

### 14.1 契约与提案 v1.2 一致性

| 核对点 | 实测 | 结论 |
| --- | --- | --- |
| `MatrixUnknownReason` | 8 个成员，含 `registry-unavailable`（Model 保留、生产不使用，注释说明 G-5b） | **一致** |
| `MatrixRequestChannel` | 三分量 `roleLevel/cardKinds/session`；`roleLevel.source` 为 `"registry-capability" 或 "app-rule"`；worker 语义注明 app-rule | **一致** |
| `MatrixForce.conventions.unknownReason?` | 存在并注明渲染 unknown | **一致** |
| `MatrixRoleDirectories.error?` | 存在；注释说明唯一载体、由 Pipeline 填 | **一致** |
| `GovernanceMatrixFn` | `(input?: { roleId?; section?: "all" \| "roles" \| "routing" }) => Promise<{ ok; message }>`；无 allowed/denied | **一致** |
| `WorkerRoleInput` | `displayName?`（H1 映射）；`cardSections` 内联结构且不含 title | **一致** |
| 注册表展示字段 | 六角色 `matrix: { duty, mainChain, cardDiscipline?, dispatchScope? }`，`duty`/`mainChain` 非空 | **一致** |
| 权限面 | `governance-roles.ts` diff 仅新增 `matrix` 字段；`entries`/`preauthorizedDirs`/`forbiddenWritePaths`/`capabilities` 零改动；六角色既有能力位与 shell 档位测试通过 | **未触碰权限面** |
| 共享解析单源 | `role-card-sections.ts` 仅从 `ROLE_CARD_REQUIRED_SECTIONS` 按 label 取 `test`，无第二份规则表；仅经 `resolve-role.ts` 公开出口消费（`grep` 实测无其他导入者）；H1→title、五章节、代码块伪标题、控制字符/空行/标记清洗、200/4,000 码点截断均有测试 | **一致** |
| `ProjectListing` 加法 | `issues` 逐 code（6 种；5 种有测试，`card-read-failed` 见偏差 3）；`roleDirectories` 计数（found/totalDirs/archivedSkips；归档不出 issue）；`cardSections.title` 附着；`warnings` 文案/行为不变 | **一致** |
| api-spec 冻结声明 | 四项齐全：①三分量与 roleLevel 来源；②`registry-unavailable` 成员保留；③C1b seam 三条件（C1a 不创建）；④上限常量导出名（常量本体属 C1b） | **齐全** |

### 14.2 五项偏差裁定

| # | 偏差 | 裁定 |
| --- | --- | --- |
| 1 | Model 用内联结构等价类型而非 import `RoleCardSections` | **接受**。Model 不导入角色私有 `common/` 是正确分层；`WorkerRoleInput.cardSections` 为矩阵所需子集（无 title），与 `RoleCardSections` 结构兼容，C3 映射与 `typecheck` 保障；不得为消重而让 Model 依赖 common。 |
| 2 | `roleDirectories.error` 由 Pipeline 填充、`listProject` 失败仍抛错 | **接受**。与 G-4/R-2 一致；`listProject` 既有「失败抛错」语义不变；Pipeline catch 后构造 `{…, error}` 是唯一载体用法；api-spec 已写明。 |
| 3 | `card-read-failed` 分支未单测（Windows 限制） | **接受（附披露）**。属环境限制下的覆盖缺口；该分支与既有 warning 同源、代码可见；E1/E2 记为未覆盖项，后续如能构造可控夹具应补测；不阻断冻结。 |
| 4 | `role-card-sections` 额外内部导出（`stripRoleDataMarkers`/块标记常量） | **接受（条件）**。仅私有模块内部与同角色 C1b 使用；不经 `public.ts` 或 `resolve-role.ts` 暴露；外部消费者仍只能经 `ProjectRoleSummary.cardSections`；api-spec 已记录。 |
| 5 | 展示摘要文案可能后续调整 | **接受**。展示文本非机器契约；同文件维护、同源评审；六角色 duty/mainChain 非空测试已钉住，AC-3 冲突时以卡文本/注册表为准；调整须保持只读、不参与判定。 |

### 14.3 冻结结论

**C1a 契约可以冻结；C1b 与 C2 可并行启动。** 未发现阻断性需修订项。冻结面：`governance-matrix/v1` Model（含 `MatrixUnknownReason` 保留成员、`MatrixRequestChannel` 三分量/`roleLevel` 来源、`MatrixForce.conventions.unknownReason`、`MatrixRoleDirectories.error`、`GovernanceMatrixFn`）、`ProjectListing`/`ProjectRoleSummary` 加法（`issues`/`roleDirectories`/`cardSections`）、共享角色卡解析公开出口（`ProjectRoleSummary.cardSections` + `RoleCardSections` 类型再导出）；C1b/C2 只按此冻结形状消费，变更回 C1a 并重跑受影响证据。

放行注意项（非阻断）：
1. E1/E2 记录本候选为 `implemented-unverified`，并披露 `card-read-failed` 未单测与 Windows 环境基线；冻结不等于验收。
2. C1b 引用块标记常量/`stripRoleDataMarkers` 时只从私有 `role-card-sections.ts` 导入（同角色私有协作），不得把其提升为跨角色公共 API。
3. `MatrixChannelSource` 类型可在 C1b/C2 实现时统一使用（当前字段用字面量），并保留 `download`/`shellEscalation` 的 roleLevel/source 语义说明；非阻断。
4. 本冻结不改变 §十二/§十三的其余结论：测试 T-5/T-6 于 T1 前修正、R-9 于 E2 前由沟通/验收记录解释；B0 重记仍按团队计划执行。
5. 相对 P1.1 §5.1 的 `MatrixRequestChannel` 形状细化（三分量）与 `ProjectListing` 加法仍须在 E1/V1 口径中如实披露；本冻结仅在实现层确认，不改客户已确认的方案语义。

**声明：** 本确认是技术冻结建议，不是客户批准、不是实施授权、不是独立验收结论；未实施新代码、未测试新行为（仅只读核对候选与运行既有候选套件/typecheck）；提交/推送/合并/发布另行授权。

---

## 十五、C1b+C2 联合冻结确认（2026-11-05）

本节只读核对 C1b（门禁引擎）与 C2（运行时核心）候选（基线 HEAD `0418746`，叠加 C1a+C1b+C2 工作树，未提交，状态 `implemented-unverified`）；未改任何候选代码/测试/提案，只写本文件。

### 15.1 候选身份（实测）

| 文件 | 行数 | git blob / sha256 前缀 |
| --- | --- | --- |
| C1b `src/service/governance-matrix/public.ts` | 19 | `132b31bb51a180fb5659c0bfc78eb5a274038d77` |
| C1b `impl/builder.ts` | 558 | `b9585525c981f5e47716a9c87ef81b40100ebbe0` |
| C1b `impl/routing.ts` | 211 | `a61364964b409688a7217e8bc37f24a7ec79906b` |
| C1b `impl/renderer.ts` | 507 | `2d10960e911ceb8e53dc2b4beebb5286e542fb16` |
| C1b `impl/sanitize.ts` | 71 | `b2b818fe514a91b7a60a649cebec9895c493d966` |
| C1b `impl/limits.ts` | 21 | `c9b34db088a512bcfc87701a645e18d83cacb167` |
| C1b `test/门禁引擎/governance-matrix-service.test.ts` | 533（12 例） | `91873c95b06beffdefd395f4fbd770dee559e144` |
| C1b `角色卡/门禁引擎/api-spec.md` | 404 | `6d0dfb6c185a190d20e53d19ad21b1d8ca7b7176` |
| C2 `src/model/runtime.ts` | 3204（+15） | sha256 `20af24789bcd…` |
| C2 `src/service/runtime/session.ts` | 729（+8） | sha256 `23228c82c4e2…` |
| C2 `src/provider/runtime/tools.ts` | 4545（+87） | sha256 `5418f8ff8dcd…` |
| C2 `src/provider/runtime/schema.ts` | 1690（+35） | sha256 `34ae96fff8a0…` |
| C2 `test/runtime-core/governance-matrix-tool.test.ts` | 313（8 例） | `d3bcb5b5b6ec…` |

独立验证：门禁引擎套件 **340 计 / 339 过 / 0 失败 / 1 skip / exit 0**（C1a 328/327/0/1，+12）；runtime-core 套件 **378 计 / 371 过 / 3 失败 / 4 skip**，3 项失败均为既有 Windows symlink `EPERM`（`session-store`/linked workspace 类，不是 governance_matrix），C2 新测试单跑 **8/8 通过、0 skip**；`npm run typecheck` **exit 0**。工作树 `src app test` 仅 C1a/C1b/C2 预期候选文件，无 i18n/`app/**` 或写集外变化。

### 15.2 契约与提案一致性核对

| 核对点 | 实测 | 结论 |
| --- | --- | --- |
| C1b 公开入口 | `public.ts` 恰 6 键：`buildGovernanceMatrix`/`renderGovernanceMatrix` + 四个上限常量；`buildGovernanceMatrixWith` 不在 `public.ts`（测试只经 `impl/builder.ts`） | **一致（R-11/G-5c）** |
| C1b 结构与纯函数 | `public.ts` + `impl/{builder,routing,renderer,sanitize,limits}.ts`，无 `abstract/`；`grep` 无 `node:`/其他 Service/Pipeline/Provider 导入；无读盘/写盘/缓存/账本 | **一致** |
| 上限常量 | `impl/limits.ts` 唯一定义 16000/48000/1500 与 80/500/800/300，`public.ts` 再导出；Model 只声明字段；C1b 测试断言数值；C3 可从 public 导入 | **符合 R-4 单一来源** |
| 渲染有界/截断 | `applyRenderInfo` 在本次请求新建矩阵实例上写 `render.truncated/omittedRoles/omittedChars/truncatedFields/perRoleMaxChars`；`render.truncated` 为唯一语义；50 角色/字段超长测试通过 | **符合已确认解释** |
| 单一来源 | 卡种只从 `input.cardKindsByRole` 反推；VCA/refactor 直接读 Model 常量；唯一手写 `APP_ROUTING_RULES` 四条；无第二张 role→cardKinds 表（源码扫描测试） | **一致** |
| 渲染安全 | worker 块固定分隔 + 数据声明；伪造标记替换；CRLF/控制字符/空行规范化；码点截断；固定句/摘要声明逐字；恶意夹具测试 | **一致** |
| C2 注入才注册 | 未注入 ⇒ `governance_matrix` 不存在；注入 ⇒ 只新增该工具且既有工具 schema/描述零变化；构造不调用函数；判断会话结构性无该工具 | **一致** |
| C2 参数/回执 | 仅 `roleId`/`section`，`additionalProperties:false`；trim 后透传；非法类型/空串/非法 section/多余字段在调用前 `ok:false`；`ok/message` 原样转达；抛错/畸形 fail-closed；结果无 allowed/denied | **一致** |
| C2 通道 | `RuntimeProviderOptions.contextSections?` / `RuntimeSessionOptions.contextSections?` 单一 `readonly string[]`；未定义不下发；`governanceMatrix` 经 `GovernedToolsOptions` 继承/透传；`GovernanceMatrixFn` 仅 `import type` | **一致** |
| C3/C4 接口 | C3 所需 `buildGovernanceMatrix`/`renderGovernanceMatrix`/三常量/`GovernanceMatrixInput` 字段均存在；C4 所需 `contextSections` 已在 `RuntimeProviderOptions`；判断会话仍不在 `buildGovernedTools` 路径 | **具备，C3/C4 可按依赖启动** |

### 15.3 偏差裁定

| # | 偏差 | 裁定 |
| --- | --- | --- |
| 1 | worker 段三态（无目录/有目录全坏/枚举失败）以内部 `MatrixWarning` 码 `worker-section-none`/`worker-section-no-valid`/`worker-section-unavailable` 传递、渲染器过滤，而非新增冻结协议字段 | **接受**。`MatrixWarning.code` 在 C1a 冻结契约中是字符串，未新增字段/未改 `GovernanceMatrix` 形状；三码只是渲染层内部指令，`warningsSection` 过滤、不入「未纳入/未知」；AC-9 三态文本与测试（AC-4/AC-9）覆盖；api-spec 已把三码记为「内部渲染指令，不作为用户警告展示」。无需回 C1a；条件：保持三码稳定、不把它们当第二套用户警告。 |
| 2 | 上限常量定义在 `impl/limits.ts`、由 `public.ts` 再导出 | **接受**。单一定义、单一公开出口；Model 不定义数值；测试断言值；C3 从 `public.ts` 导入，符合 R-4（“C1b 公共入口导出”）。 |
| 3 | 渲染截断统计写在本次请求新建的矩阵实例上（`renderGovernanceMatrix` 修改 `matrix.render`） | **接受**。C1b `buildGovernanceMatrix` 每次返回新对象；渲染只改本次实例；不共享/不持久化；`render.truncated` 唯一截断语义；与 C1a 冻结解释一致。 |
| 4 | C1b 测试 seam `buildGovernanceMatrixWith` 从 `impl/builder.ts` 导入 | **接受**。满足 G-5c 三条件：不进 public、生产只传真实注册表、测试只经 impl；未新增 public/测试专用入口。 |
| 5 | C2 schema/工具名使用字面量 `"governance_matrix"`（与 `GOVERNANCE_MATRIX_TOOL_NAME` 常量并存） | **接受**。测试对照常量与 schema；避免 schema→tools 循环依赖；不构成第二来源（工具名/枚举一致断言由 C2 测试钉住）。 |

### 15.4 冻结结论

**C1b 与 C2 可以冻结；未发现阻断性需修订项。**

- C1b 冻结面：`src/service/governance-matrix/public.ts` 的 `buildGovernanceMatrix`/`renderGovernanceMatrix` 签名、四个上限常量、`impl` 内部布局与 seam 三条件；C3 只从 public 导入。
- C2 冻结面：`GovernedToolsOptions.governanceMatrix?`、`RuntimeProviderOptions.contextSections?`、`RuntimeSessionOptions.contextSections?`、`governance_matrix` 工具 schema/描述/回执语义；C3/C4/T1 只按此消费。
- **C3 可在 C1b+C2 冻结后启动**；**C4a/C4b/C4c 可在 C2 冻结后启动，并与 C3 并行**（写集不相交）。C3 仍需等 C1b+C2 冻结声明；C4 不依赖 C1b。
- 放行注意项（非阻断）：① C3 必须保留自己的 `roleId` 精确存在性预检，避免直接依赖渲染器对未知 id 的「未找到角色 <id>」回显（AC-2 工具路径不回显）；② C3 只从 C1b `public.ts` 导入上限常量，不写字面量；③ worker-section 三码只作内部渲染指令，C3/T1 不应把它们当用户警告计数；④ C2 抛错文案含 `reasonOf(err)` 原因，若错误含路径，属诊断信息；C3/T1 不应将其作为权限结论；⑤ runtime-core 3 个既有 EPERM 失败按 B0 基线分类，不归因本特性；B0 重记仍按团队计划；⑥ 测试 T-5/T-6 于 T1 前修正、R-9 于 E2 前记录解释；⑦ 相对 P1.1 §5.1 的 `MatrixRequestChannel` 形状细化与 `ProjectListing` 加法在 E1/V1 口径如实披露；⑧ C1b api-spec 的 worker-section 三码与 C1a 冻结声明需在 E1 引用。

**声明：** 本确认是技术冻结建议，不是客户批准、不是实施授权、不是独立验收结论；未实施新代码、未测试新行为（仅只读核对候选与运行既有候选套件/typecheck）；提交/推送/合并/发布另行授权。
