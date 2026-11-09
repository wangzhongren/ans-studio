# 每个文档格式的权威说明与全员可读：实施前验收标准 B1 v1

- 日期：2026-11-09；固定身份：**ANS 独立验收（Independent Acceptance）唯一主上下文**。本文件只做实施前验收标准；**不实施、不派发、不运行真实模型、不运行测试、不授权提交/推送/合并/发布**。
- 风险档位：**T2（建议，按方案 P1.2 头部 §9.4；由统筹裁决，F15/Q13）**。本 B1 默认按 **T2 + 全量受影响回归** 判定；若统筹按「新增工具面/凡触 Model 公共工具契约即 T3」裁定 T3，则按 T3 执行全量回归（§4.2），AC 与判据不变。档位不得由实施侧/验收侧自行下调，也不得用 T2 口径规避 T3 回归。
- 状态：**实施前冻结标准（B1 v1）**；全部条目当前 `未取证`，不得视为已通过。B2 只对**同一最终候选**与本版本判定。
- 依据（写盘前实测）：
  - 方案 **P1.2**：`docs/planning/2026-11-09_design_document-format-specifications.md`，**979 行 / 146,555 bytes / SHA-256 `886fef84c3db34515a98f5874a33bb22134a3fc3b02f20aa3d185b828a3e7c54`**（与任务给定一致；54 行 / 54 id（A25+B29）；§7.2 AC-1..AC-17；§7.1 测试矩阵；§7.3 回归；§7.4 真实运行；§10 并行/串行；§13 F1–F16 处置；§14 G1–G4/S1–S4 处置）。
  - 复核记录：`docs/planning/2026-11-09_review_document-format-specifications.md`，**499 行 / 82,067 bytes / SHA-256 `2cbe69195f75a700ccdb747cdbdcb9343c1bfc20fb6d011367a1b39c60daee05`**（R1.0 F1–F16；R1.1 窄复核「建议提交、must-fix 0」；G1–G4/S1–S4）。
  - 意图记录（客户原话「每个文档格式要给说明，并且让每个角色都能读取到」）：`docs/communication/2026-11-09_intent_document-format-specifications.md`，**28 行 / 2,948 bytes / SHA-256 `bf870ae959772956912006e52c32502476ac787bdb0466d2826abd6b7e56ce8d`**（每格式权威说明、与实际校验器一致、所有角色可读、不放宽校验、无漂移副本）。
  - 预授权：`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`，SHA-256 `e2bdd96b19a2b58b190ea4bdeb6dc647b97139b5bf22cabcfa05dd7496d9011a`（实测）。
  - 并行 judge（只读）：团队计划 `docs/scheduling/2026-11-09_team-plan_judge-delegated-decision-effectiveness.md`，**72 行 / 8,800 bytes / SHA-256 `98dcfc80204e2ce62fa284fe16cd31ee7b23d5b079cf08508cf24879c7d15bf6`**（其中 B1 v1 `2517668c…`、串行「提案卡修复→judge→文档格式」）；judge B1 v1 `docs/acceptance/2026-11-09_judge-delegated-decision-effectiveness-criteria-v1.md`，**347 行 / 54,615 bytes / SHA-256 `2517668c819a0ccd0186a425c7ddad6bc1656619a53c5821d3347afccf55bf12`**（实测）；judge 方案 P1.2 依团队计划为 686 行 / 88,988 bytes / `1477a6e4…`（只读引用）。
  - 提案卡修复（已提交、B2 pass）：B2 报告 `docs/acceptance/2026-11-09_proposal-card-run-binding-fix-report-v1.md`，**211 行 / 33,857 bytes / SHA-256 `8af767e2fc998e7bee691f8bdb1949c582f10280632dfaf92ae7dabf69a4afc8`**；变更包 `docs/scheduling/2026-11-09_change-package_proposal-card-run-binding-fix.md`，**64 行 / 9,039 bytes / SHA-256 `e5735373b7b3cb0dfaea946ef1ac75a43a030f6aead12e7f6fbc8a22a391b01f`**；其 B1 v1.1 `docs/acceptance/2026-11-09_proposal-card-run-binding-fix-criteria-v1.md`，**294 行 / 48,124 bytes / SHA-256 `682539ba619366ae11243ccb661503ab84873549fc66d5a4b4a23c6b694918c7`**（实测；含基线已知红附录 A）；修复路由 `docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md`，**183 行 / 32,508 bytes / `4e8fb3545f3679ee48b397b4c43d1eb4ab517e9b40a7e541b4ba0daf3fa7ea85`**。
- **写盘时基线（实测）**：worktree `.claude/worktrees/trunk-amendment`；HEAD **`fb1aa39e787934f334b9c164e4221074f97f6147`**（tree `ee33c3e95d9b3fb61dc5d05eea66c2d0a2eb9583`；提交「fix(trunk,desktop): 提案确认卡 draft-run 绑定与 fail-closed 呈现（客户缺陷修复）」）；分支 `feat/plan-escalation-card`；写盘开始时 `git status --porcelain -- src app test` = **0**（干净）。工作区根另有未跟踪的治理文档（其它 B1/方案/验收报告等），**不属于本候选**，候选只按 changedPaths/manifest 认定。**实施基线必须按 BASE-1 在 judge 串行窗口后重取；本快照只作 B1 时点事实。**
- **交付时点观测（重要，如实）**：B1 写盘过程中（约 13:52–13:53）本 worktree 出现 4 个未提交修改：`src/model/runtime.ts`（+54）、`src/model/version-change.ts`（+113）、`test/runtime-core/direct-role-capabilities.test.ts`（+133）、`test/runtime-core/version-change-contract.test.ts`（+90，合计 +374/−16）；diff 内容为 `judge-delegated`/`DocFreezeSource`/`requestResolvedD3DecisionId`/`isJudgeD3Resolution` 等——**疑为 judge 变更在飞实现**（与本 B1 假设的串行次序一致），**不属于本变更候选**；本 B1 未依赖、未修改这些文件。本变更实施/B2 必须在 judge 冻结/合入后按 BASE-1 重取基线，候选不得混入这些在飞改动（BASE-4/BASE-5/R-14）。
- 关系：本 B1 只覆盖本变更；**不修改**其它 B1、其它在飞变更（judge、提案卡修复、贪吃蛇运行）与已验收候选；不改变公共校验语义；发布/tag 不在授权内。
- 编号口径：方案 §7.2 定义 **AC-1..AC-17**；本 B1 逐条展开并新增 BASE-1..BASE-8、TM-1..TM-14、RR-1..RR-8、EV1..EV6、R-1..R-13。任务口径的「AC-1/AC-3」「AC-2/AC-4」「AC-5/AC-6」「AC-7..」「AC-12/AC-13」与本表映射见 §3.18；不新增验收语义。

## 0. 范围与非目标

### 0.1 本 B1 覆盖

本变更（解析器同侧单一事实来源 `doc-format-specs` + 只读 `doc_format` 工具 + 全员注入 + 54 个格式说明与校验器一致性测试 + 跨角色注册 + 隔离真实运行）的实施前验收标准：确定性测试矩阵、受影响既有套件基线对照、旧断言改写记录、真实运行（AC-12/AC-13/AC-14）与证据层级。

### 0.2 必须保留的契约/边界（硬约束）

1. **不放宽/不收紧任何校验**：所有 parser/validator 的接受/拒绝集合逐字不变；不改任何文档格式（schema 字面量/版本号/文件名约定/字段）；`contract_check` 行为与三 topic 原文输出不变。
2. **不改角色卡/边界/流程必读**：`角色卡/**` 的 `role-card.md`、`boundary.md`、`boundary.yaml` 与技能/派发必读机制 diff = 0（各角色按自身边界写入 `角色卡/<role>/docs/change|fix/` 的实施记录除外）。
3. **不建第二份漂移副本**：不新增仓库 Markdown 规范（如 `docs/format-specs.md`）、不新增/修改技能文件副本、不在角色卡抄字段表；modules/roster/topology 详情复用既有 `contractSchemaText` 原文（前加来源说明行），不重写字段表。
4. **写集硬约束**：只允许 §2.1 文件；不新增目录；**H1 delta = 0**；若实施需要新增公共只读出口（如 `resolve-role.ts`/`resolve-boundary.ts`/`mcp-declarations.ts` 的导出，F6 方案 2）、新目录或任何写集外文件 ⇒ **立即停止并升级普通流程**，本 B1 不适用。
5. **注入契约**：`doc_format` 只在能力注入时注册（`GovernedToolsOptions.docFormat?`、`openRoleSession` 输入 `docFormat?`、`AdapterCapabilities.docFormat?` 透传，按 P1.2 §14 G1）；未注入 ⇒ 工具不存在、既有行为逐字不变。
6. **judge / 有界 Chief 隔离**：judge 会话（「替我审」/「替我决策」）与有界 Chief 决策会话（`chiefDecisionContext`）的工具集、系统提示逐字不变；不得把 `doc_format` 注入这两类会话。
7. **不修 `dispatch_task`/`git_candidate` 呈空**：该问题（含 `dispatch_task` 具体机制 [推断]/[待确认]）在本变更范围外；不得用本变更证据宣称已修复。
8. **不碰贪吃蛇**：不读/写 `C:\Users\51054\Desktop\work\ans-game2d-snake-run-2026-11-09` 的运行根、端口 **9222**、其临时根或 target；真实运行只用 **9223** 与独立 `--userData`/仓库外目标根。
9. **禁止求绿**：不得以放宽校验、删除/弱化既有断言、加 skip/force-exit/watchdog、伪造证据或「文档一套、校验另一套」达成本标准；不得修改基线已知红项（含 `test/桌面应用/optional-acceptance.test.ts`）求绿；不得把写作约定写成硬校验或反之。

### 0.3 判定对象

只判定**同一最终候选**是否满足冻结方案 P1.2、意图记录与客户要求；不判方案质量/取舍，不判其它在飞变更。B2 由**同一独立验收身份**按本 B1 执行。

## 1. 基线、实施顺序与证据层级（BASE-1..BASE-8）

| ID | 必须观察的结果 | 必要原始证据 | 判定 |
| --- | --- | --- | --- |
| BASE-1 | **实施基线（重取）**：本变更实施开始时记录 worktree、分支、HEAD/`HEAD^{tree}`、`git status --porcelain -- src app test`。实施基线必须满足串行次序（BASE-2）：提案卡修复已提交/B2 pass（写盘时 HEAD `fb1aa39e` 已满足：B2 `8af767e2…`、变更包 `e5735373…`），且 judge 变更已按其 B1/B2 冻结/合入（或至少其写集完成、无在飞编辑）。交付时点已观测到 judge 在飞修改（4 文件，见头部），因此**当前 worktree 状态不得作为本变更实施基线**。P1.2 中 `file:line` 为 `c1439ce` 快照参考，实施/验收以符号名与文本锚点重新核对。若协调方裁决不同基线/次序，记录裁决与影响后再实施。 | 基线 HEAD/tree/status/分支；提案卡修复 B2/变更包引用；judge 冻结/B2/合并记录；协调裁决记录 | 未取证 |
| BASE-2 | **实施顺序与单写者**：顺序为**提案卡修复（A′→B）→ judge → 本变更（最后）**（P1.2 §10.3；judge 团队计划 §六；Q11），以协调方裁决为准。`src/model/runtime.ts` 是本变更与 judge 的**唯一机械重叠**（同文件不同区域），必须串行写入：同一时刻只有一个变更编辑该文件；本变更不得与 judge 并行编辑。`app/desktop/session.ts`、`src/pipeline/orchestration/run-role.ts`、`test/桌面应用/session.test.ts` 虽与 judge/提案卡修复不重叠，仍遵守单写者纪律。若本变更提前实施，先完成非共享文件，`src/model/runtime.ts` 留到 judge 合并后由同一写者串行补齐，并记录。 | 协调/调度记录；单写者/串行记录；基线 HEAD；judge/提案卡修复 B2 引用 | 未取证 |
| BASE-3 | **基线已知红项 + 增量不回归口径**：(a) `test/桌面应用/optional-acceptance.test.ts` 基线 **6 tests / pass 2 / fail 1 / cancelled 3 / skip 0**（6/2/1/3/0；与提案卡修复 B2 记录的 diff=0 一致），本变更 diff 必须为 0、不修复/不弱化；(b) `test/编排/**` 基线已知红为 **22 fail / 2 skip**，集合以提案卡修复 B1 v1.1 附录 A.1 为参照，并在**本变更实施基线**上以同一命令/Node 版本重取 before/after（失败/跳过名集合逐条 diff）；(c) 其它受影响套件（`test/门禁引擎/**`、`test/runtime-core/**`、`test/桌面应用/**`、`test/测试/**` 中实际执行的文件）同样记录 before/after 计数与失败名集合。判定：**同名用例不得恶化；新增确定性失败 = 0；新 skip = 0**；环境抖动须同候选隔离复跑通过方可排除，不得豁免新增确定性失败。不以「旧套件全绿」为前提。 | 基线命令/Node 版本/TAP 输出/逐文件 hash；before/after 失败标题集合 diff；隔离复跑日志 | 未取证 |
| BASE-4 | **候选身份/写集/聚合/manifest**：候选只含 §2.1 允许文件；记录绝对检出、基线 HEAD、changedPaths（新增/修改/删除）、逐文件 raw SHA-256、可复算聚合（按路径排序后 `path + "\0" + sha256` 串联的 SHA-256）与 manifest（`src app test` 及写集）；写集外文件 diff=0（尤其 §2.2 排除清单与 judge/提案卡修复写集）；无删除/重命名越界、无新依赖；未跟踪治理文档与 judge 在飞 M 文件（头部交付时点观测的 4 文件）不计入候选。 | 候选清单/聚合/manifest；逐文件 hash；diff/numstat；稳定性快照 | 未取证 |
| BASE-5 | **稳定性**：证据运行前后同一候选/manifest/聚合/树；HEAD/tree/分支/暂存不变；任何源码/测试/依赖/夹具/构建/命令变化使证据失效并重取；不得拼接旧候选/旧证据/不同环境；不得用 judge/提案卡修复或其它 B1 的证据冒充本候选。 | manifest/聚合/树前后快照；diff 0；失效重取记录 | 未取证 |
| BASE-6 | **证据层级独立**：L1 规范注册表/数据完整性（编排单元）；L2 门禁引擎 pin（角色卡/边界）；L3 运行时核心工具契约；L4 桌面会话注入；L5 跨角色集成；L6 隔离真实运行。各层绑定候选 digest/命令/环境/退出/计数/日志 hash；低层不得替代真实运行，真实运行不得替代确定性；L4/L5 只证明注册/可调用，不等于真实模型读取（真实读取见 RR）。 | 证据索引（层级/候选/命令/环境）；交叉引用审计 | 未取证 |
| BASE-7 | **`test/桌面应用/session.test.ts` 处置**：该文件当前不存在（实测）；本变更按 P1.2 **新建（恢复已删除路径）**处理：路径已在 Section 1（`角色卡/桌面窗口/boundary.yaml:99`、`boundary.md:39`），删除提交 `4c24149`、验收报告 `docs/acceptance/2026-11-08_session-admission-approval-report-v1.md:153` 记录边界漂移；**H1 delta = 0**，交付回执必须记录该边界漂移；该文件**不得**出现在实施前基线命令中，新建后纳入实施后回归；若 Governance 要求改用既有文件（如 `test/桌面应用/multi-runtime.test.ts`，亦在 §1），则切换并同步 §4.2、记录。 | 基线文件不存在证据；边界条目；删除/漂移记录；交付回执 | 未取证 |
| BASE-8 | **H1 delta = 0 与范围闸门**：所有新建文件均落在既有授权目录：`src/common/编排/`（`角色卡/编排/boundary.yaml:80`）、`test/编排/`（`:83`）、`test/runtime-core/`（`角色卡/运行时核心/boundary.yaml:47`）、`test/门禁引擎/`（`角色卡/门禁引擎/boundary.yaml:37`）、`test/测试/`（`角色卡/测试/boundary.yaml:7`）、`test/桌面应用/session.test.ts`（边界 §1 单文件）；不新增目录、不改角色卡/边界、不动 `.ans`/项目文档。若需要 F6 方案 2（跨角色公共出口）或写集扩展 ⇒ 停止升级并重评 H1/串行。 | 边界条目；新增文件清单；H1 记录；升级记录（若有） | 未取证 |

## 2. 范围、Owner 与写集

### 2.1 实施写集（按 P1.2 §6.1；每文件唯一 owner，零重叠）

| # | 文件 | owner（角色） | 改动/用途 | 关联条目 |
| --- | --- | --- | --- | --- |
| 1 | `src/common/编排/doc-format-specs.ts`（新建） | 编排 | 54 个 `DocFormatSpec` 数据 + `docFormatIndexText()` + `docFormatSpecText(id, part?)` + `DOC_FORMAT_SPEC_VERSION`/`docFormatKnownIds()`；纯数据/纯渲染，无 I/O、无判定 | AC-1/2/3/4/5/6/7/8 |
| 2 | `test/编排/doc-format-specs.test.ts`（新建） | 编排 | 注册表完整性、冻结 id 清单、样例正例、字段变异矩阵、overclaim、schema/稳定 code 扫描、预算、复用断言 | AC-1..AC-8、AC-17、TM-1..TM-6、TM-8、TM-9 |
| 3 | `src/model/runtime.ts` | 运行时核心 | `DocFormatInput`/`DocFormatResult`/`DocFormatFn` 与 `GovernedToolsOptions.docFormat?`（加法可选；接口在 `:3450`、`contractCheck` 在 `:3522`，按 P1.2 G1/F11） | AC-8/9、AC-16 |
| 4 | `src/provider/runtime/tools.ts` | 运行时核心 | `makeDocFormatTool`；`buildGovernedTools` 注入才注册（`contract_check` 相邻，`:5206-5211` 区域）；预算/截断/回执包装与 `makeContractCheckTool` 同型 | AC-8/9/10 |
| 5 | `src/provider/runtime/schema.ts` | 运行时核心 | `doc_format` 参数 schema（扁平对象）、description、promptGuidelines | AC-8/9 |
| 6 | `test/runtime-core/doc-format-specs-pin.test.ts`（新建） | 运行时核心 | `describeTool("doc_format")` 扁平/非空/无顶层 oneOf；注入才注册；未知/非字符串；`tools/list` properties 非空；`toPiTool` description/promptGuidelines；MCP 声明格式钉住 | AC-8/9、AC-17、TM-7/10/11 |
| 7 | `src/pipeline/orchestration/run-role.ts` | 编排 | `openRoleSession` 输入 `docFormat?`（`contractCheck` 在 `:875`）+ `AdapterCapabilities.docFormat?`（接口 `:304-438`；`contractCheck` 在 `:409`）+ 两处 capabilities 透传（`:2106`、`:3546`）；`RoleSessionDeps`（`:3470`）**不加** `docFormat`（P1.2 G1） | AC-9、AC-16 |
| 8 | `app/desktop/session.ts` | 桌面窗口 | `docFormat: (input) => this.docFormatText(...)`；所有角色会话注入；数据源静态早退，不触 listing/run/文件 IO | AC-9/10 |
| 9 | `test/桌面应用/session.test.ts`（**新建：恢复已删除路径**） | 桌面窗口 | 注入矩阵（6 内置 + 项目角色）、静态早退 spy、未知/非字符串、legacy `contract_check` 不变、judge 工具集不变 | AC-9/10、AC-15、TM-12 |
| 10 | `test/门禁引擎/doc-format-specs-pin.test.ts`（新建） | 门禁引擎 | 角色卡 10 章节/三文件路径/边界两份恒等/严格 YAML 的规范钉住；私有常量交叉断言 | AC-3/5/17、TM-7/TM-10 |
| 11 | `test/测试/doc-format-all-roles.test.ts`（新建） | 测试 | 跨角色集成：6 内置 + 1 项目角色会话注册 `doc_format`；judge/有界会话无；数据源只读、无副作用 | AC-9、TM-13 |
| 12 | 各角色 `角色卡/<role>/docs/change/`、`docs/fix/` 实施记录 | 各实施角色 | 变更/修复记录（按各自边界；不在产品写集） | BASE-4、交付证据 |

### 2.2 明确排除（diff 必须为 0；防越权）

- **judge 写集**：`src/model/version-change.ts`、`src/service/trunk/impl/apply-journal.ts`、`src/service/version-change/impl/freeze-service.ts`、`src/service/version-change/abstract/version-change-service.ts`、`src/provider/version-change/impl/guard-freeze-registry.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`src/pipeline/orchestration/version-change-runtime.ts`、`src/common/编排/task-state.ts`、`src/common/门禁引擎/classify-shell.ts` 及其测试。
- **提案卡修复写集**：`src/service/trunk/impl/apply-journal.ts`、`test/编排/direct-role-capabilities.test.ts`、`app/desktop/customer-input.ts`、`test/桌面应用/chief-workflow.test.ts`。
- **校验/格式实现**：`src/common/编排/workflow-preconditions.ts`（解析逻辑）、`src/common/编排/run-manifest.ts`、`src/common/编排/evidence-check.ts`、`src/common/门禁引擎/boundary-*.ts`、`src/service/trunk/impl/amendment-validate.ts`、`src/service/trunk/impl/upgrade-validate.ts` 等 parser/validator 实现。
- **其它**：`app/renderer/**`、`角色卡/**` 的 `role-card.md`/`boundary.md`/`boundary.yaml`、`docs/skills/**`、`docs/mcp/**`、`test/桌面应用/optional-acceptance.test.ts`、`.ans/**`、目标项目产品文档；不新增依赖、不改构建/发布配置。

### 2.3 边界与升级条件

- **零重叠/无 H1**：每个产品文件按 boundary §1 单一 owner；新增测试文件均在已授权目录；桌面窗口在本变更可写 `app/desktop/session.ts` 与 `test/桌面应用/session.test.ts`（§1 单文件）。
- **升级条件（任一出现即停止并升级普通流程，本 B1 不适用）**：需要改 §0.2-1/2/3 的校验/格式/角色卡/边界/必读；需要新增公共只读出口或写集外文件（F6 方案 2）；需要新增目录；需要调整 `GovernedToolsOptions`/`AdapterCapabilities` 之外的公共契约或 IPC；需要修 `dispatch_task`/`git_candidate` 呈空；统筹/验收按 T3 且计划外扩展。

## 3. 验收标准（AC-1..AC-17）

> 判定前提：每条在**同一最终候选**上、以可复算原始证据判定；全部子判据满足方可 `pass`；任一 fail 触发项即 `fail`；证据不全为 `insufficient evidence`。全部条目当前 `未取证`。

### 3.1 AC-1（P0）：清点完整，54 个 spec（A25 + B29）

**必须观察的结果（全部满足）：**

1. `DOC_FORMAT_SPECS.map(s => s.id)` 与冻结清单 deepEqual：**54 个**（A1–A25、B1–B29），无重复、无缺失、无多余；一行一 id。
2. 每个 spec 具备 `title`/`audience`/`stage`/`pathPattern`/`validator`/`specRevision`；`schemaLiteral` 单值（或在 `schemaLiteralNote` 明确字面量关系）；A14 分层（严格层 `git-quality-report/v1` + 展示层）、A24 `audience:"app-managed"`、A22「无校验器、仅摘录」、B 组每行单一 id。
3. §2.2/§2.3 的 54 个 id 均有规范；索引/冻结清单/spec 数组三处数量一致；无「48 行/50 id」残留表述。
4. B 组每行与 A14 严格层均有 `testSeam`（`exported-pure`/`public-path-fixture`/`text-shape`），登记符号/夹具/残余风险。

**必要原始证据**：TM-1 测试日志与源码；冻结 id 清单；评审对照 P1.2 §2.2/§2.3。**判定：未取证。**

### 3.2 AC-2（P0）：单一事实来源，无第二份漂移副本

**必须观察的结果（全部满足）：**

1. 仓库中只有一份角色可读的规范文本（`doc-format-specs.ts` 渲染）；无新增仓库 Markdown 规范（`docs/format-specs.md` 等）、无新增/修改技能文件副本、无角色卡字段表副本；`docs/**`/`docs/skills/**`/`角色卡/**` 的相应 diff = 0（实施记录除外）。
2. modules/roster/topology 详情文本包含 `contractSchemaText(topic)` 原文，且前有来源说明行（「以下为 contract_check 同源原文（只读展示；本工具不构成放行/授权）」）；`part=fields|example|errors` 对 render 型一律整段返回并标注「该格式复用原文，整段返回」。
3. intent-entry 详情复用 `INTENT_ENTRY_TEMPLATE`/`INTENT_ENTRY_NAMING_RULE`/`INTENT_ENTRY_ID_RULE`；A13 正例使用**填充后**的具体样例（非占位符模板）。
4. `contract_check` 三 topic 行为/输出逐字不变（既有 `test/编排/workflow-preconditions.test.ts` 相关用例不改断言）。
5. `schemaLiteral` 不为公开常量时，持有唯一副本并由 owner pin 测试钉住（AC-3）；不出现「spec 一份、parser 一份」的未钉住副本。

**必要原始证据**：TM-6 测试；`git status`/diff；源码 grep；既有 contract 测试日志。**判定：未取证。**

### 3.3 AC-3（P0）：schema 字面量不漂移（三层策略）与 validator 字段

**必须观察的结果（全部满足）：**

1. **公开导出常量**：可 import 的 `PROJECT_*`、`RUN_*`、`TEAM_PLAN_SCHEMA`、`CRITERIA_SCHEMA`、`EVIDENCE_META_SCHEMA`、`TRUNK_*`、`VERSION_CHANGE_SCHEMA`、`DOC_FREEZE_SCHEMA`、`STABLE_WRITE_SCHEMA`、`REFACTOR_REQUEST_SCHEMA`、`VERSION_DECISION_SCHEMA`、`CUSTOMER_DIRECTIVE_SCHEMA`、`DOWNLOAD_REQUEST_SCHEMA`、`GOVERNANCE_MATRIX_SCHEMA`、`PROJECT_STATE_SCHEMA` 等，spec 直接 import，测试断言相等（不手写重复字面量）。
2. **内联/无导出常量**（`run-repin/v1`、`team-plan-completion/v1`、`role-authorization/v1`、`role-activation/v1`、`repository-work-source/v1`、`stable-initial-workflow/v1`、`stable-initial-workflow-source/v1`、`doc-freezes/v1`、`git-quality-report/v1`、`git-ref/v1` 等）：spec 持有唯一字面量副本，由相应 owner 的 pin 测试用真实 parser/源码文本断言钉住；不得宣称 import 单一源。
3. **跨角色私有常量**（`ROLE_CARD_REQUIRED_SECTIONS`、boundary `KINDS/ROOTS/TOP_KEYS`、MCP `NAME_PATTERN/RESERVED_NAMES/ENV_NAME_PATTERN`）：生产模块不跨角色 import 私有实现；由 `test/门禁引擎/`、`test/runtime-core/` 的 owner pin 测试 import 自身私有常量并与 spec 文本交叉断言。
4. **全仓扫描**：测试扫描 `src/**/*.ts` 中形如 `"[a-z][a-z0-9-]*/v[0-9]+"` 的字符串常量，断言每个都出现在 `DOC_FORMAT_SPECS.schemaLiteral` 或**显式排除白名单**（含理由：`chief-workflow/v1`＝应用内资源；`git-initialization/v1`＝存储媒体标识；`version-change-service/v1`＝服务契约版本；`chief-hub-resume/v1`＝`directHash` 哈希域标签；非文档 key/文件名）；`git-quality-report/v1` 由 A14 覆盖、`git-ref/v1` 由 B29 覆盖；数值版本（`versions.jsonl` 的 `v:1`、`download-consumer.json` 的 `version:1`）与无 schema 字段格式由冻结 id 清单覆盖。新增字面量未登记 ⇒ 测试失败。
5. **`validator` 字段**：每个 spec 有 `DocFormatValidatorRef`（`kind`/`file?`/`symbol?`/`note?`）；convention 型用 `kind:"convention"`；详情头部渲染校验器锚点；A14 分层可用两条或等价 note；`enforced` 语义与真实 parser 一致。

**必要原始证据**：TM-5/TM-7 测试；独立 schema 字面量扫描；import/源码文本断言；白名单理由清单。**判定：未取证。**

### 3.4 AC-4（P0）：最小合法样例经真实 parser/validator 正例

**必须观察的结果（全部满足）：**

1. 每个有真实校验器的 A 格式（A1–A13、A17–A21）的 `example` 由对应真实解析器/校验器解析为 `ok:true`（能断码处断码）；A13 使用 §2.4 填充后的具体样例（非 `INTENT_ENTRY_TEMPLATE` 占位符）；A14 严格层按 `testSeam`（服务级最小夹具复用 `test/测试/git-role-workflows-e2e.test.ts` 生产路径或源码文本钉住，且如实标注「无导出纯校验器」）。
2. 文件级 gate：在临时项目根写 `example` + 依赖文件，`loadLatestRoster`/`prepareRunPin`/`prepareIntentConfirmation`/`validateAmendment` 等返回 `ok`（或仅返回预期 code 之外的 `ok`）。
3. B 组按 §2.3.1 `testSeam` 逐行执行：`exported-pure` 直接 import 纯校验器；`public-path-fixture` 构造最小公开路径夹具；`text-shape` 仅做源码文本/形状断言并在 §9.2 如实披露残余风险。
4. **示例字符串只定义一次**：spec 的 `example` 就是测试输入；测试不得另写夹具副本（A13 填充样例除外，其为 spec 正例输入）。
5. 任一 example 不能通过其真实校验器 ⇒ `fail`；不得为让 example 通过而放宽校验器（属升级/停止）。

**必要原始证据**：TM-2 正例测试日志；parser 调用链；临时项目夹具；A14 seam 说明。**判定：未取证。**

### 3.5 AC-5（P0）：字段表与校验器逐项一致（变异矩阵）

**必须观察的结果（全部满足）：**

1. 对每个 `enforcement:"validator"` 字段：删除该字段（或置 null）⇒ 校验器必须拒绝（`ok:false` 或抛出预期错误；能断码的断码）；类型替换（string→boolean/number/array/object）⇒ 拒绝；`enum` 字段替换为非法值 ⇒ 拒绝。
2. `presence:"optional"` 字段删除 ⇒ 校验器仍 `ok`。
3. **分层格式按层分别断言**：A1 `schema` 在意图确认门必填、在 run pin 缺失不拒；A2 `schema` 在 roster 加载为子串匹配、在 upgrade/pin 为 frontmatter 解析；A3/A4 普通模块 `paths` 在 parser 层 1–20、在 roster 加载层普通模块恰 1 项（`roster-module-directory-invalid`）；A14 严格层键集/绑定 vs 展示层摘录；不得用一个字段行掩盖层间差异。
4. 矩阵由字段表数据驱动生成；字段表变动立即反映到测试数量/断言；任何人工豁免必须有 note 与理由，不得静默跳过。
5. 断言到稳定 code（可断码处），不得只断言「抛错」而遗漏错误分类。

**必要原始证据**：TM-3 矩阵测试与字段表快照；负例日志；按层断言清单。**判定：未取证。**

### 3.6 AC-6（P0）：约定不冒充强制（overclaim guard）

**必须观察的结果（全部满足）：**

1. 对每个 `enforcement:"convention"` 字段，构造一个**违反该约定但语法合法**的值，断言校验器**仍接受**（证明规范没有把约定写成硬校验）。
2. 若校验器意外拒绝 ⇒ 测试失败，并要求把该字段升级为 `enforcement:"validator"` 并补错误码（规范修正），不得反向放宽校验器。
3. A15/A16/A22/A23/A24/A25、A14 展示层及角色卡展示字段等「仅约定/摘录」内容均有 `enforced:false` 标注；不得把写作约定写成硬校验（或把硬校验写成约定）。
4. `enforcement` 分类与 P1.2 §2.4 逐项对照，评审可见。

**必要原始证据**：TM-4 overclaim 测试日志；字段表 `enforced` 快照；评审对照 §2.4。**判定：未取证。**

### 3.7 AC-7（P0）：加载级约束与主错误码可复现

**必须观察的结果（全部满足）：**

1. 每个 `loadChecks.code` 与每个 A 格式主要 parser 错误码至少有一个最小夹具负例：至少覆盖 `roster-*`、`modules-doc-*`、`run-pin-*`、`plan-*`、`criteria-*`、`evidence-*`、`trunk-amendment-*`、`review-quality-*`、`role-card-section-missing`、`boundary-md-yaml-mismatch`。
2. **稳定 code 扫描（G2）**：按 code 族收集 `src/**` 中的稳定 code（`modules-doc-*`、`roster-*`、`plan-*`、`criteria-*`、`evidence-*`、`run-pin-*`、`run-manifest-*`、`review-quality-*`、`trunk-amendment-*`、`boundary-*`、`role-*` 等），**包含不以 `-invalid/-missing/...` 结尾的成员**（如 `modules-doc-frontmatter/yaml/flow/modules`、`roster-role-builtin/duplicate`、`roster-directory-*`、`roster-module-*`、`roster-module-unbound`、`roster-role-without-module`、`roster-module-multi-owner`），断言每个 code 出现在 spec 的 `commonErrors`/`loadChecks` 或显式白名单（含理由）；新增 code 未登记 ⇒ 失败。
3. `loadChecks.code` 的 `rule` 文本与真实校验行为一致；不得出现规范有码而 parser 无分支，或 parser 有码而规范漏列（白名单必须可复核）。
4. A4 的 10 个补充 `roster-*` 码（G2 处置）全部在规范中；A3/A4 的跨层口径分别写明。

**必要原始证据**：TM-8/TM-9 负例日志；code 族扫描清单；白名单理由；`workflow-preconditions.ts` 的 `RosterErrorCode` 等 union 对照。**判定：未取证。**

### 3.8 AC-8（P0）：`doc_format` 工具契约（扁平/预算/零 I/O/未知 id）

**必须观察的结果（全部满足）：**

1. **扁平 schema**：`describeTool("doc_format").parameters` 顶层 `type:"object"` + `properties` 非空 + `required`；**无顶层 `oneOf`/`anyOf`**；codex 本地 MCP `tools/list` 返回同一 `inputSchema.properties` 非空。
2. **预算**：索引（无参数）≤ **8192 B**（`Buffer.byteLength`）；每格式详情 ≤ **8192 B**；render 型 `part` 整段返回并标注；非 render 型 `part=fields|example|errors` 进一步裁剪；超限由 `truncateUtf8` 防御性截断并附「已截断；用 part=fields|example|errors 缩小范围」，不得静默返回半截当完整。P1 必须实测索引字节并记录；若超限，按 Q14 允许 B 组按 stage 汇总一行 + 详情可查，同时记录该策略与 54 id 仍可发现。
3. **未知/非法输入**：未知 id 返回纯文本「未知格式 …；可用：…」（回显 ≤40 字符）；非字符串 `format` 由工具层拒绝；数据源返回 null/空/抛错 ⇒ 工具层 `{ok:false, message}`（不抛、不猜）。
4. **输出与版本**：首行固定 `doc_format（只读；不构成放行/授权；<DOC_FORMAT_SPEC_VERSION>）`；详情含 `specRevision`；`DOC_FORMAT_SPEC_VERSION` 可见；输出确定性/静态。
5. **零磁盘 I/O**：数据源第一条语句静态早退到 `docFormatIndexText()`/`docFormatSpecText()`；早退前不调用 `getListing`/`refreshListingNow`/`readFile`/`writeFile`；不读 run、不读项目、不含角色/项目事实；工具无副作用。
6. 工具描述与 `promptGuidelines` 非空；索引模式可发现全部 id（或按 Q14 汇总后仍可 `format=<id>` 查询）；模型无需先验 id。

**必要原始证据**：TM-11/TM-1 测试；字节测量记录；`tools/list` 输出；未知/非字符串负例；spy 记录。**判定：未取证。**

### 3.9 AC-9（P0）：全员可读（6 内置 + 项目角色；judge/有界不变）

**必须观察的结果（全部满足）：**

1. 6 个内置治理角色（chief/product/rapporteur/nominator/convener/verifier，含旧 su）会话与 1 个项目角色会话均注册 `doc_format`（注入才注册；真实 `openRoleSession`/会话工厂路径，非手写桩）。
2. judge 会话（「替我审」/「替我决策」）与有界 Chief 决策会话**不注册** `doc_format`；工具集与系统提示逐字不变（`buildGovernanceJudgeTools` 恰三只；有界 Chief 只允许 `decide_pending_request`）。
3. 未注入能力（CLI/旧调用方）⇒ 工具不存在，既有行为不变（fail-closed）。
4. **发现机制**：工具 description 明示写文档前先查；`promptGuidelines` 进入 Claude/Codex 系统提示；Pi 系统提示不拼接 `promptGuidelines`，但工具定义逐工具透传（`toPiTool`）且工具描述可见；确定性测试断言 `toPiTool(describeTool("doc_format"))` 的 description/promptGuidelines 非空。
5. 所有角色数据源返回索引（同一静态文本）；无角色裁剪（Q 默认不裁剪）；无副作用。
6. 不得以「注册」冒充「真实模型读取」：真实读取证据见 AC-12/RR。

**必要原始证据**：TM-12/TM-13 日志；会话工具目录；judge/有界工具集快照；Pi/Codex 断言。**判定：未取证。**

### 3.10 AC-10（P0）：桌面数据源静态早退

**必须观察的结果（全部满足）：**

1. `docFormatText` 在索引/详情模式第一条语句静态早退（`format === undefined || trim() === ""` → `docFormatIndexText()`；否则 `docFormatSpecText()`）；早退前不触 `getListing`/`refreshListingNow`/任何文件 IO。
2. 测试以 spy 断言索引/详情路径**不调用** `getListing`/`refreshListingNow`/`readFile`/`writeFile`，不读 run/项目事实；不写盘/不入队/不改会话状态。
3. legacy `contract_check` 数据源与工具输出不变；`docFormatText` 返回 `Promise<string>`（与 `contractCheckText` 同型，S1），工具包装层统一 `{ok:true,message}`/`{ok:false,message}`。
4. 同一输入多次调用返回同一静态文本（无环境依赖）。

**必要原始证据**：TM-12 spy/日志；`session.ts` 源码审查；`contract_check` 回归。**判定：未取证。**

### 3.11 AC-11（P0）：无校验变更

**必须观察的结果（全部满足）：**

1. parser/validator/格式/角色卡/边界的接受/拒绝集合逐字不变：§2.2 列出的实现文件与 `角色卡/**` 的 role-card.md/boundary.md/boundary.yaml diff = 0；不改 schema 字面量/版本/文件名/字段。
2. `contract_check` 三 topic 行为/输出逐字不变；`workflow-preconditions.ts` 解析逻辑未改（仅被 import/复用）。
3. 既有 parser 套件按 BASE-3 增量口径通过；无新增依赖/构建变更。
4. `doc_format` 不存在时（未注入）所有既有行为逐字不变（测试覆盖）。

**必要原始证据**：BASE-4 diff/numstat；`git diff` 审查；既有 parser 套件日志；未注入路径测试。**判定：未取证。**

### 3.12 AC-12（P0，真实运行）：产品依说明一次写对 `project-intent/v1`，全员可读有证据

**必须观察的结果（全部满足）：**

1. 真实 Electron（本候选 worktree `app/main.ts`）+ **真实 Claude**（非 demo）+ 真实桌面 UI；环境按 AC-13 隔离。
2. 1 条客户消息 → 幕僚派产品 → **产品真实调用 `doc_format`**（索引或 `format:"project-intent/v1"`）并读到说明；会话工具事实保留调用入参与回执原文。
3. 产品写 `docs/product/<flowId>-intent-v1.md`：frontmatter 含 `schema: project-intent/v1`（及 flowId/version/intentId 按规范），**一次写对**；`prepareIntentConfirmation` 通过（无 `trunk-item-invalid` schema 拒绝；卡正常呈现；是否由客户/judge 确认不影响本项）。
4. 全员可读：6 内置 + 1 项目角色会话注册 `doc_format`（真实 Electron 会话工具目录证据）；产品真实模型调用并收到说明；**项目角色**按 §7.4 预置并直连查询 ≤1 条（非客户消息），保留调用与回执原文；其余内置角色以工具目录注册 + 数据源可调用为证（避免无谓真实模型成本）。
5. **回落（F10）**：项目角色无法预置时，只要求产品真实调用；项目角色证据降级为「会话注册 + 数据源可调用」并**如实标注「未做项目角色真实模型调用」**；不得把注册证据写成真实调用。若 `docFormat` 能力未注入（演示/旧调用方），真实运行记录为未覆盖场景，不以此判失败（单元测试覆盖）。
6. 预算：产品 `doc_format` 调用 ≤3 次（期望 1）；项目角色 ≤1 次；客户消息 1 条；首个决定性结果即停，不自动重试。

**必要原始证据**：RR-1..RR-8；drive 日志；UI 截图；product/chief/项目角色会话工具事实（调用与回执原文）；意图文档字节与 hash；`prepareIntentConfirmation` 结果；各角色工具目录；项目角色预置来源/哈希。**判定：未取证。**

### 3.13 AC-13（P0，真实运行隔离）：9223 / 独立 userData / 仓库外目标根

**必须观察的结果（全部满足）：**

1. **隔离**：CDP 端口 **9223**（独立 `--remote-debugging-port=9223`）；独立 `--userData`（专用路径，不写全局 `%APPDATA%/Electron` 共享态）；仓库外独立目标项目根（如 `C:\Users\51054\Desktop\work\ans-doc-format-run-2026-11-09\target`）。**不得占用/关闭贪吃蛇运行中的 9222、其临时根或目标项目**（`C:\Users\51054\Desktop\work\ans-game2d-snake-run-2026-11-09` 及 target）；只读引用其证据。
2. **预检**：9222 由贪吃蛇占用（只读确认，不触碰）；9223 空闲；记录候选 HEAD/聚合、入口、provider、userData/目标根/端口；贪吃蛇运行根前后只读快照。
3. **后检**：9222 与贪吃蛇根零改动（进程/端口/临时根/目标项目关键文件 hash 只读对照）；9223 释放；无 Electron 残留；运行不写目标项目之外任何运行根。
4. **git**：运行前后 `git status`/`git diff --stat` 证明仅允许写集变化；未提交/推送/合并/发布。
5. **证据清单**：诊断原件、UI 截图、驱动日志（9223）、端口/进程前后检查、贪吃蛇根前后只读快照、目标项目关键文件 hash。

**必要原始证据**：运行配置与端口/进程前后检查；快照/hash；git 记录。**判定：未取证。**

### 3.14 AC-14（P0）：预算、停止与回落

**必须观察的结果（全部满足）：**

1. 预算（每次隔离运行）：客户消息 ≤1；卡 ≤1（意图确认卡）；操作者直连项目角色消息 ≤1（非客户消息）；产品 `doc_format` 调用 ≤3（期望 1）；项目角色 ≤1；模型回合最小化并如实记录；墙钟 ≤ **20 分钟**（预置准备不计）；审批卡/客户卡数量如实记录。
2. **首个决定性结果即 halt**；不自动重试；应用/驱动/浏览器关闭；9223 释放、无 Electron 残留。
3. 回落：`docFormat` 不可用（未注入）⇒ 既有角色行为不变（单元测试覆盖），真实运行如实记录为未覆盖；项目角色预置不可行 ⇒ 按 AC-12-5 回落并标注。
4. 出现任何非本变更卡、越界写、非预期模型调用 ⇒ 立即停止并如实报告；不得继续增加预算或重试。

**必要原始证据**：RR-5 驱动日志；消息/卡/调用计数；墙钟；进程/端口检查。**判定：未取证。**

### 3.15 AC-15（P0）：回归与类型（D1）

**必须观察的结果（全部满足）：**

1. `npm run typecheck` exit 0；若 `app/renderer/**` 被触及（本变更不应触及），`npm run typecheck:renderer` exit 0 并记录；不触及则记录「未触及」。
2. 受影响套件 before/after（BASE-3）：按 §4.2 的 T2 或 T3 口径执行；记录 tests/pass/fail/cancelled/skip/exit；失败标题集合 diff；**新增确定性失败 = 0；新 skip = 0；预存红项不恶化**。
3. `test/桌面应用/optional-acceptance.test.ts` diff = 0，计数 6/2/1/3/0 逐条对照；`test/编排/**` 基线 22 fail/2 skip 按 A.1 集合对照；`test/桌面应用/chief-workflow.test.ts` 如执行则按提案卡修复 B1 v1.1 A.2 的已知红口径只读对照（不得修改其断言）。
4. 不得以 skip/force-exit/watchdog/删除断言求绿；环境抖动须同候选隔离复跑通过方可排除。

**必要原始证据**：TM-14 日志；命令/Node 版本/环境；before/after 计数与失败名集合 diff；隔离复跑日志；typecheck 输出。**判定：未取证。**

### 3.16 AC-16（P0）：不触碰并行变更

**必须观察的结果（全部满足）：**

1. 候选 diff 不含 judge 写集、提案卡修复写集与 §2.2 排除文件；`git diff --stat` 与逐文件 hash 可复核。
2. 与 judge 的唯一机械重叠为 `src/model/runtime.ts`（不同区域）；串行写入记录在案（BASE-2），同一时刻只有一个变更编辑。
3. 若协调方改变次序/写集（如 judge 提前合并、提案卡修复重开），记录裁决并重评本项；不得静默假设。

**必要原始证据**：BASE-2/BASE-4；diff/numstat；串行记录。**判定：未取证。**

### 3.17 AC-17（P1）：测试 seam 可执行

**必须观察的结果（全部满足）：**

1. B 组 B1–B29 每行 `testSeam` 有对应测试：`exported-pure` 直接调用导出校验器；`public-path-fixture` 构造最小公开路径夹具；`text-shape` 仅做源码文本/形状断言并在 §9.2/实施回执如实披露残余风险。
2. A14 严格层 seam 已实现（服务级夹具或源码文本钉住），不宣称导出纯校验器正例。
3. 每个 seam 的符号/夹具说明与真实测试一致；不得有注册但未测试的 B 行。

**必要原始证据**：TM-9/TM-2；seam 对照表；残余风险披露。**判定：未取证。**

### 3.18 任务口径与方案 AC 对照

| 任务口径（分组） | 覆盖的方案 AC | 说明 |
| --- | --- | --- |
| AC-1/AC-3 | AC-1、AC-3 | 54 spec 清点 + schema 字面量/validator/convention/白名单一致性 |
| AC-2/AC-4 | AC-2、AC-4、AC-5、AC-6、AC-7 | 单一来源 + 样例正例 + 字段变异 + 约定反证 + 错误码/加载检查；「不得文档一套、校验另一套」 |
| AC-5/AC-6 | AC-8、AC-9、AC-10、AC-11 | `doc_format` 工具契约/全员可读/静态早退/无校验变更 |
| AC-7.. | AC-7、AC-11、AC-15、AC-16、AC-17 | 加载检查、无校验变更、D1/typecheck/受影响套件、并行隔离、seam |
| AC-12/AC-13 | AC-12、AC-13、AC-14 | 真实运行行为/隔离/预算停止；AC-12/AC-13 编号与方案同名 |

> 本表仅作口径对照，不新增/减少验收语义；以方案 AC-1..AC-17 的展开条目为准。

## 4. 测试矩阵、D1 命令与旧断言记录

### 4.1 新增/受影响矩阵（按 P1.2 §3.4/§7.1 逐条转写）

| ID | 层级/owner | 用例/断言 | 必须观察（判定要点） | 判定 |
| --- | --- | --- | --- | --- |
| TM-1 | 编排 | `test/编排/doc-format-specs.test.ts`：注册表完整性/冻结清单/唯一性/预算/无 `node:fs` | 54 id deepEqual；每个 spec 有 title/audience/path/validator/specRevision；B/A14 有 testSeam；索引 ≤8192 B、详情 ≤8192 B；模块无文件 IO import | 未取证 |
| TM-2 | 编排 | 样例正例：A1–A13、A17–A21 真实 parser/validator；A13 填充样例；A14 严格层 seam；B 组按 §2.3.1 | 全部 `ok`（或预期 code 外 ok）；example 即测试输入；A14 不宣称纯校验器正例 | 未取证 |
| TM-3 | 编排 | 字段变异矩阵（数据驱动） | 必填删除/null/类型/枚举非法 ⇒ 拒；optional 删除 ⇒ ok；按层断言（A1/A2/A3-A4/A14） | 未取证 |
| TM-4 | 编排 | overclaim guard | 每个 convention 字段的违反值仍被接受；意外拒绝 ⇒ fail/字段升级 | 未取证 |
| TM-5 | 编排 | schema 字面量全仓扫描 | `src/**/*.ts` 所有 `xxx/vN` ∈ 注册表 ∪ 白名单（含理由）；`git-quality-report`/`git-ref` 由 A14/B29；新字面量未登记失败 | 未取证 |
| TM-6 | 编排 | 复用单一来源 | modules/roster/topology 详情 `includes(contractSchemaText(topic))` + 来源行；render 型 part 整段；intent-entry 含模板/命名/ID 规则；既有 contract 测试不变 | 未取证 |
| TM-7 | 门禁引擎/运行时核心 | 私有常量交叉钉住（`test/门禁引擎/doc-format-specs-pin.test.ts`、`test/runtime-core/doc-format-specs-pin.test.ts`） | `ROLE_CARD_REQUIRED_SECTIONS`、boundary `KINDS/ROOTS/TOP_KEYS`、MCP `NAME_PATTERN/RESERVED_NAMES/ENV_NAME_PATTERN` 与 spec 文本相等/包含 | 未取证 |
| TM-8 | 编排 | 稳定 code 扫描（按 code 族，含非后缀成员） | 每个 code ∈ spec `commonErrors`/`loadChecks` ∪ 白名单（含理由）；`modules-doc-*`/`roster-*` 盲区覆盖 | 未取证 |
| TM-9 | 编排 | 加载级/主错误码负例 | `loadChecks.code` 与主要 parser code 各至少一次；`run-pin-*`/`plan-*`/`criteria-*`/`evidence-*`/`trunk-amendment-*`/`review-quality-*`/`role-card-section-missing`/`boundary-md-yaml-mismatch` 覆盖 | 未取证 |
| TM-10 | 门禁引擎 | 角色卡 10 章节逐个缺失 ⇒ `role-card-section-missing:<label>`；三文件路径；boundary.yaml 严格键/枚举/archived；boundary.md↔yaml 恒等；示例通过 | 正例通过、负例拒绝；`#{1,6} 空白` 匹配口径与展示解析差异如实 | 未取证 |
| TM-11 | 运行时核心 | `describeTool("doc_format")` 扁平/非空/无顶层 oneOf；注入才注册；未知/非字符串；`tools/list` properties 非空；`toPiTool` description/promptGuidelines 非空；MCP 声明七键/保留名/状态 | 全部成立；未注入 ⇒ 无工具；无顶层 union | 未取证 |
| TM-12 | 桌面窗口 | `test/桌面应用/session.test.ts`（新建）：内置/项目角色收到 `docFormat`；索引/详情；不调用 `getListing`/`refreshListingNow`/文件 IO；未知 format `ok:false`；legacy `contract_check` 不变 | 注入矩阵/静态早退/无副作用；`docFormatText` 返回 `Promise<string>`（S1） | 未取证 |
| TM-13 | 测试 | `test/测试/doc-format-all-roles.test.ts`：6 内置 + 1 项目角色注册；judge/有界无；所有角色数据源返回索引；无副作用 | 注册矩阵与工具集快照逐字对照；项目角色动态 id 不依赖技能登记 | 未取证 |
| TM-14 | 回归/静态门 | §4.2 before/after；`npm run typecheck`（及 renderer 如触及）；旧断言逐条记录 | 无新增确定性失败/新 skip；已知红不恶化；typecheck 0 | 未取证 |

### 4.2 D1 命令与受影响套件（before/after）

**实施前基线（只含既有文件；在 BASE-1 基线上执行并记录 Node 版本）：**

```bash
npm run typecheck
node --test test/编排/workflow-preconditions.test.ts
node --test test/编排/run-manifest.test.ts
node --test test/编排/evidence-check.test.ts
node --test test/门禁引擎/boundary-yaml.test.ts
node --test test/runtime-core/mcp-declarations.test.ts
node --test test/桌面应用/run-pin.test.ts
```

**实施后回归（新建文件落地后；文件名以最终实现为准）：**

```bash
npm run typecheck
node --test test/编排/doc-format-specs.test.ts
node --test test/编排/workflow-preconditions.test.ts
node --test test/编排/run-manifest.test.ts
node --test test/编排/evidence-check.test.ts
node --test test/门禁引擎/doc-format-specs-pin.test.ts
node --test test/门禁引擎/boundary-yaml.test.ts
node --test test/runtime-core/doc-format-specs-pin.test.ts
node --test test/runtime-core/mcp-declarations.test.ts
node --test test/桌面应用/session.test.ts
node --test test/桌面应用/run-pin.test.ts
node --test test/测试/doc-format-all-roles.test.ts
```

- **T2 默认「全量受影响回归」**：另在 before/after 运行 `node --test --test-concurrency=1 "test/编排/**/*.test.ts"`（107 个测试文件；已知红 22 fail/2 skip 按 BASE-3 对照），并以只读方式运行 `test/桌面应用/chief-workflow.test.ts`（其导入 `app/desktop/session.ts`；已知红按提案卡修复 B1 v1.1 A.2 口径对照，不得修改断言）。若协调方/验收认为 `test/门禁引擎/**`、`test/runtime-core/**`、`test/桌面应用/**`、`test/测试/**` 的其它文件受 `session.ts`/`tools.ts`/`schema.ts` 影响，则纳入受影响集合并记录。
- **T3（若统筹裁定）**：全量回归 `test/编排/**`、`test/门禁引擎/**`、`test/runtime-core/**`、`test/桌面应用/**`、`test/测试/**`（或项目既有全量命令），并执行 `npm run typecheck`（renderer 如触及则 `npm run typecheck:renderer`）；按 BASE-3 增量口径判定。
- **统一口径**：每条证据绑定候选 digest/命令/环境/Node 版本/退出/计数/日志 hash；不以绝对全绿为前提；不得加 skip/force-exit/watchdog。

### 4.3 旧断言改写逐条记录（不得静默放宽）

1. **预期不改写的既有断言（必须原样通过）**：`test/编排/workflow-preconditions.test.ts` 的 contract topic 文本/示例用例（约 `:1007-1145`）；`test/门禁引擎/boundary-yaml.test.ts`；`test/runtime-core/mcp-declarations.test.ts`；`test/桌面应用/run-pin.test.ts`；`test/编排/run-manifest.test.ts`；`test/编排/evidence-check.test.ts`；`test/编排/direct-role-capabilities.test.ts` 中与冻结/意图相关的既有用例；`test/桌面应用/optional-acceptance.test.ts`（diff=0）。
2. **允许的改写仅限**：新增测试文件；既有测试文件中为「注入才注册」新增的断言（如工具目录快照在无 capability 时不变、有 capability 时多一只 `doc_format`），必须逐条给出 `文件:行`、旧断言原文、新断言、理由（对应方案/AC）、证据行；**不得删除/弱化 fail-closed 断言**。
3. **`test/桌面应用/session.test.ts`**：新建文件（BASE-7），其断言与既有 `session-history`/`multi-runtime` 等不冲突；若为复用既有文件而改写，按上条记录。
4. **`test/桌面应用/chief-workflow.test.ts`**：本变更**不修改**其断言（diff=0）；只读回归按已知红口径对照；若实施发现必须修改（例如工具集快照受注入影响），先停止并升级复核（该文件属提案卡修复写集）。
5. **角色卡/边界片段**：su 卡边界示例、A13 填充样例、contract_check 示例分别喂真实 parser（`validateBoundaryYamlText`、`summarizeIntent`、`parseProjectModules/Roster`）均 `ok`；既有片段不改写，避免变成无效建议。

### 4.4 证据绑定

- 所有 TM 用例日志标注候选 digest/manifest、命令、环境、Node 版本、退出码与计数；同一用例不得跨候选拼接；真实运行（§5）单独层级。
- 证据层级按 BASE-6：L1 编排注册表 → L2 门禁 pin → L3 运行时工具 → L4 桌面注入 → L5 跨角色 → L6 真实运行；低层不得替代真实运行，真实运行不得替代确定性。

## 5. 真实运行标准（RR-1..RR-8；对应 AC-12/AC-13/AC-14）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| RR-1 | **环境**：真实 Electron（本候选 worktree `app/main.ts`）+ 真实 Claude（非 demo）+ 真实桌面 UI；独立 `--userData`（专用路径，不写全局共享态）；CDP 仅 **9223**；仓库外独立目标项目根（如 `C:\Users\51054\Desktop\work\ans-doc-format-run-2026-11-09\target`）；记录候选 HEAD/聚合、入口、provider、userData/目标根/端口。 | 未取证 |
| RR-2 | **预检与预置**：9222 由贪吃蛇占用（只读确认，不触碰）；9223 空闲；贪吃蛇运行根/临时根/target 前后只读快照。**预置 1 个已激活项目角色**（正常流程或复制既有合法目标项目；三文件角色卡 + 边界 + 激活记录），准备不计客户消息/墙钟预算；记录其来源/路径/哈希。预置不可行时按 RR-7 回落。 | 未取证 |
| RR-3 | **场景 A（产品）**：1 条客户消息 → 幕僚派产品 → 产品真实调用 `doc_format`（缺省索引或 `format:"project-intent/v1"`）并读到说明 → 写 `docs/product/<flowId>-intent-v1.md`（frontmatter 含 `schema: project-intent/v1` 及 flowId/version/intentId）**一次写对** → `prepareIntentConfirmation` 通过（无 schema 拒绝、卡正常呈现）；保留调用入参/回执原文、文档字节/hash、确认门结果。 | 未取证 |
| RR-4 | **场景 B（全员可读）**：6 内置角色会话 + 1 项目角色会话均注册 `doc_format`（真实 Electron 会话工具目录）；产品真实模型调用（RR-3）；项目角色由操作者直连会话注入 1 条查询（非客户消息，计入操作记录）并保留调用/回执原文；其余内置角色以注册 + 数据源可调用为证。若项目角色预置不可行 ⇒ RR-7。 | 未取证 |
| RR-5 | **隔离证明（AC-13）**：预检 9222 由贪吃蛇占用（只读）/9223 空闲；后检 9222 与贪吃蛇根零改动（进程/端口/临时根/目标项目关键文件 hash）、9223 释放、无 Electron 残留；运行不写目标项目之外任何运行根；只读引用贪吃蛇证据。 | 未取证 |
| RR-6 | **预算/纪律（AC-14）**：客户消息 ≤1；卡 ≤1；操作者直连项目角色消息 ≤1；产品 `doc_format` 调用 ≤3（期望 1）；项目角色 ≤1；模型回合最小化并如实记录；墙钟 ≤20 分钟；首个决定性结果即 halt；不自动重试；出现任何非本变更卡/越界写/非预期模型调用 ⇒ 立即停止并如实报告。 | 未取证 |
| RR-7 | **回落与如实性**：项目角色无法预置 ⇒ 真实运行只要求产品真实调用；项目角色证据降级为「会话注册 + 数据源可调用」并如实标注「未做项目角色真实模型调用」；不得把注册写成真实调用。`docFormat` 未注入 ⇒ 工具不存在、既有行为不变（单元测试覆盖），真实运行记录为未覆盖场景；不得以此路径判失败。失败/回落/下一真实门如实报告，不伪造、不宣称未发生的结果。 | 未取证 |
| RR-8 | **同一候选/证据**：RR-3/RR-4 使用同一最终候选与同一配置口径（可不同隔离目标项目）；不得用 judge/提案卡修复或其它变更的运行证据替代；运行前后 `git status`/`git diff --stat` 证明仅允许写集变化；未提交/推送/合并/发布。 | 未取证 |

## 6. 证据与检查要求（EV1–EV6）

| ID | 必须观察的结果 | 判定 |
| --- | --- | --- |
| EV1 | 基线/候选：BASE-1–BASE-5；实施基线重取；候选只含允许文件；写集外 diff=0；聚合/manifest 可复算；已知红逐条对照。 | 未取证 |
| EV2 | 规范一致性：AC-1–AC-7；TM-1–TM-10；54 spec/字段/变异/overclaim/schema 扫描/稳定 code/加载负例；`contract_check` 不变。 | 未取证 |
| EV3 | 工具/注入：AC-8–AC-11；TM-11/TM-12；扁平 schema/零 IO/预算/未知/注入才注册/静态早退；judge/有界不变；无校验变更。 | 未取证 |
| EV4 | 全员/跨层：AC-9；TM-13；6 内置 + 1 项目角色注册；数据源只读；无副作用；L1–L5 层级独立。 | 未取证 |
| EV5 | 回归/静态门：AC-11、AC-15–AC-17；TM-14；before/after 计数与失败集合 diff；`npm run typecheck` 0；旧断言改写逐条记录。 | 未取证 |
| EV6 | 真实运行：AC-12/AC-13/AC-14；RR-1–RR-8；预算/隔离/证据/如实性；9222 零改动与 9223 释放。 | 未取证 |

## 7. 判定规则

- 每条只用 `pass / fail / insufficient evidence / not applicable`。
- **pass**：当前最终候选上全部适用项有完整、可复算原始证据；54 spec 与真实 parser/validator 逐项一致（样例/变异/overclaim/schema 扫描/稳定 code/加载负例）；`doc_format` 扁平/零 IO/预算/未知 id；6 内置 + 项目角色注册且 judge/有界工具集不变；无校验/格式/角色卡/边界变更；基线按 BASE-3 增量不回归；真实运行按 AC-12/AC-13/AC-14 与 RR-1–RR-8 完成；写集合规且 H1 delta=0；无第二份漂移副本。
- **fail**：改 parser/validator/文档格式/角色卡/边界/流程必读；新增 Markdown/技能副本或未钉住的第二份说明；越写集/新目录/新公共出口未升级；`doc_format` 非扁平 schema、顶层 oneOf/anyOf、磁盘 I/O、超预算且无标注/截断、未知 id 崩溃；注入缺层（`GovernedToolsOptions`/`openRoleSession` 输入/`AdapterCapabilities`）导致工具静默不注册；judge/有界会话工具集变化；任一内置/项目角色不可注册或数据源伪造；新增确定性失败/新 skip/已知红恶化；修改 `optional-acceptance.test.ts`；真实运行占用 9222、改动贪吃蛇根/target、9223 未释放；伪造证据/把注册冒充真实调用/「文档一套、校验另一套」；删除/弱化既有断言或加 skip/force-exit/watchdog。
- **insufficient evidence**：缺基线/候选/聚合/manifest/hash；缺 before/after 计数或失败名集合 diff；缺 schema 字面量扫描/白名单理由；缺变异/overclaim/seam/负例任一矩阵；缺跨角色注册或会话工具目录；缺真实运行任一腿/隔离/预算/证据包；索引字节未实测；证据跨候选/环境拼接或无法复算。
- **not applicable**：仅限有明确依据者（Pi/Codex 真实模型行为：本变更只承诺确定性覆盖、真实运行覆盖 Claude；renderer：本变更不触及；`dispatch_task`/`git_candidate` 呈空：范围外；贪吃蛇运行：不触碰）。N/A 不等于 pass，不得用 N/A 规避安全要求。
- 不得以退出 0/自述/模型自评/局部绿/force-exit/watchdog 结束直接判 pass；不判方案质量，只判实现与本 B1/方案/意图的一致性。

## 8. 阶段出口与复判规则

| 阶段 | 出口判据 | 未过处置 |
| --- | --- | --- |
| B1 冻结 | 本文件写盘；全部条目 `未取证`；编号口径/任务映射/残余记录在案 | — |
| 协调/派发闸门 | BASE-2：提案卡修复 B2 pass/变更包就绪（已满足写盘时点）；judge 按其 B1/B2 冻结/合入；本变更团队计划/协调记录（写集/owner/串行/T2 或 T3）落地；单写者安排 | 不派发；补协调/重排；若次序变化重评 `src/model/runtime.ts` 窗口 |
| 实施基线 | BASE-1 重取；BASE-4 候选身份建立；BASE-7 `session.test.ts` 处置记录；BASE-8 H1 delta=0；写集外 diff=0 | 回 owner；越界即停止升级 |
| D1 确定性 | AC-1–AC-11、AC-15–AC-17；TM-1–TM-14；EV1–EV5；typecheck；BASE-3 增量口径 | 回 owner；不得放宽断言求绿 |
| 真实运行 | AC-12/AC-13/AC-14；RR-1–RR-8 完成并如实报告 | 不进入 B2 pass；按 insufficient/返工处理 |
| B2 | 同一独立验收身份按本 B1 全部适用项判定；证据链齐备；披露充分（Q10/Q12/Q14/T2-T3/Pi-Codex/dispatch_task） | 报告 pass/fail/insufficient；不授权发布 |
| 复判 | B1 冻结后不改标准适配候选；确需变更递增版本并记录理由/影响；候选/基线/写集/依赖/夹具/构建/命令/环境变化使证据失效并重取 | 重新取证/重判 |

## 9. 残余/待确认（R-1..R-13、Q1–Q14、G1–G4/S1–S4）

### 9.1 R 清单与处置

| # | 事项 | 本 B1 处置/条件 |
| --- | --- | --- |
| R-1 | **T2/T3 档位**（F15/Q13） | 按 P1.2 建议 T2、由统筹裁决；本 B1 默认 **T2 + 全量受影响回归**（§4.2）；若裁定 T3，按 T3 全量回归执行，AC 不变；不得自评降档。 |
| R-2 | **Q10 项目角色真实读取** | 默认预置 1 个已激活项目角色并真实调用（准备不计预算）；预置不可行时回落为「会话注册 + 数据源可调用」并如实标注；**注册不等于真实调用**，B2 不得把注册写成真实读取。 |
| R-3 | **Q12 模型不主动查** | 本变更以工具描述 + promptGuidelines + 索引发现；若真实运行观察模型不主动查，按 Q12 另案（客户授权后角色卡加一行），本 B1 不因此判 fail（除非工具不可发现/不可调用）。 |
| R-4 | **Q14 索引/P1 预算** | 索引 ≤8192 B、详情 ≤8192 B；P1 实测并记录字节；若超限，B 组按 stage 汇总一行 + 详情可查（`format=<id>`），不得丢失可发现性；实测结果写入实施/验收证据。 |
| R-5 | **Pi/Codex 真实模型** | 不作真实模型承诺；以确定性测试覆盖工具定义/描述/guidelines 与 `tools/list`；真实运行只覆盖 Claude + 真实 UI（P1.2 §9.2/F12）。 |
| R-6 | **`dispatch_task`/`git_candidate` 呈空** | 范围外；本变更只约束新工具扁平 schema；不得用本变更证据宣称旧工具已修复。 |
| R-7 | **`session.test.ts` 边界漂移** | 新建（恢复已删除路径 `4c24149`；边界 §1 已列）；H1 delta=0；交付回执记录漂移；若 Governance 要求改既有文件，切换并同步 §4.2。 |
| R-8 | **A14 严格层/B 组 text-shape 残余** | 无导出纯校验器的行为服务级/源码文本钉住；`text-shape` 行只钉已核实键/枚举/错误码文本；残余「测试通过但校验器另有分支」风险在实施/验收记录披露；不得宣称纯校验器正例。 |
| R-9 | **G2 code 族盲区** | 稳定 code 扫描按 code 族（含 `modules-doc-*`/`roster-*` 非后缀成员）收集；若实施发现新 code，补入 spec/`commonErrors`/白名单并在回执记录，**不改校验器**。 |
| R-10 | **实施基线漂移** | B1 写盘时 HEAD `fb1aa39e`（提案卡修复已提交）；judge 尚未实施/合入时，本变更须按 BASE-1/BASE-2 等待串行窗口；P1.2 `file:line` 仅 `c1439ce` 参考，实施以符号/文本锚点重核。 |
| R-11 | **F6 公共出口** | 默认「副本 + owner pin 测试」；不新增跨角色公共导出；若复核/实施坚持 import 私有常量，写集扩展/重评 H1，本 B1 停用并按普通流程处理。 |
| R-12 | **工具名/契约** | 采用 Q1/Q9 `doc_format`；不改名/不改输入输出语义；工具输入/输出为加法，未注入时不存在。 |
| R-13 | **renderer** | 本变更不触及 `app/renderer/**`；`typecheck:renderer` 仅在触及后执行并记录；真实运行使用真实 UI，不改渲染器代码。 |
| R-14 | **交付时点 judge 在飞状态** | B1 写盘过程中观测到 `src/model/runtime.ts`、`src/model/version-change.ts`、`test/runtime-core/direct-role-capabilities.test.ts`、`test/runtime-core/version-change-contract.test.ts` 未提交修改（疑为 judge 在飞，见头部）。本变更实施/B2 必须在 judge 冻结/合入后按 BASE-1 重取基线；该 4 文件即使在 B2 时仍未提交，也不得计入本候选或本变更证据；若协调方裁决顺序变化，按裁决记录。 |

### 9.2 Q1–Q14 引用（按 P1.2 §8，默认值/残余）

| # | 问题 | 本 B1 处置 |
| --- | --- | --- |
| Q1 | 可读取通道 | 采用 A：只读工具 `doc_format`（描述 + promptGuidelines + 索引）。 |
| Q2 | 覆盖边界 | 采用 A：A25 + B29 全量注册；B 组简版；AC-1 冻结清单。 |
| Q3 | 规范存放 | 采用 A：`src/common/编排/doc-format-specs.ts`；不改 shared；F6 方案 2 不采用。 |
| Q4 | 示例策略 | 采用 A：最小合法样例 + 真实 parser 正例；AC-4。 |
| Q5 | 漂移防护 | 采用 A：正例/变异/overclaim/schema 扫描/冻结 id/加载负例/稳定 code；AC-4–AC-7。 |
| Q6 | 是否改角色卡 | 采用 A：不改；工具描述/guidelines/索引；Q12 另案。 |
| Q7 | 内部格式深度 | 采用 A：字段表 + 锚点 + 一个样例 + testSeam；不做角色文档级全量变异。 |
| Q8 | 与 contract_check 关系 | 采用 A：三 topic 详情复用 `contractSchemaText`；`contract_check` 不变；AC-2。 |
| Q9 | 工具名 | 采用 A：`doc_format`。 |
| Q10 | 真实运行覆盖 | 采用 A：预置 1 个已激活项目角色 + 产品/项目角色各 ≤1 真实调用；预置不可行按 R-2 回落。 |
| Q11 | 与并行变更顺序 | 采用 A：提案卡修复 → judge → 本变更；`src/model/runtime.ts` 串行；以协调方裁决为准。 |
| Q12 | 模型不主动查 | 先真实运行观察；必要时客户授权独立变更；本 B1 不加角色卡。 |
| Q13 | 风险档位 | 交统筹裁决；本 B1 默认 T2 + 全量受影响回归，T3 则按 T3。 |
| Q14 | 索引预算 | 索引 ≤8192 B；P1 实测；超限 B 组按 stage 汇总 + 详情可查。 |

### 9.3 G1–G4 / S1–S4 引用（按 P1.2 §14 处置，实施必须照此落地）

- **G1**：`openRoleSession` 输入 `docFormat?`（`contractCheck :875`）+ `AdapterCapabilities.docFormat?`（`:304-438`；`contractCheck :409`）+ 透传 `:2106/:3546`；`RoleSessionDeps`（`:3470`）**不加** `docFormat`。
- **G2**：A4 补 10 个 `roster-*` 码；稳定 code 扫描按 code 族（含 `modules-doc-*` 与非后缀成员），白名单含理由。
- **G3**：`DocFormatSpec.validator` 必填（`DocFormatValidatorRef`；convention 型 `kind:"convention"`）。
- **G4**：A13 使用填充后的具体样例（非占位符模板）；`summarizeIntent` 正例用该样例。
- **S1**：`DocFormatFn`/`docFormatText` 与 `ContractCheckFn`/`contractCheckText` 同型（纯文本返回）；工具包装层统一 `{ok:true,message}`/`{ok:false,message}`。
- **S2**：schema 扫描白名单含 `version-change-service/v1`、`chief-hub-resume/v1`（理由见 AC-3）。
- **S3**：A2 归「只做 schema/frontmatter 字面量比对（不属严格解析）」并写明分层（roster 子串 / upgrade/pin frontmatter）。
- **S4**：P1.0/P1.1 历史字节未保留；以版本记录 + R1.0/R2 复核记录引用为准，不影响实施/验收。

## 10. 范围限制与披露

1. 本 B1 只覆盖本变更（文档格式权威说明与全员可读）；不覆盖 judge、提案卡修复、贪吃蛇运行、其它适配器/角色、公共 schema 重构。
2. 本 B1 只写 `docs/acceptance/`；**未改代码/方案/测试/角色卡/边界/其它文档；未运行真实模型/测试；不授权实施/提交/推送/合并/发布**。
3. **条件性**：本变更实施以满足 BASE-2 串行前提为准（提案卡修复 B2 pass/变更包已就绪；judge 冻结/合入；协调/团队计划放行）；若实施中发现必须新增/修改公共契约、数据模型、跨更多角色、公共出口或写集外文件 ⇒ 立即停止并升级普通流程，本 B1 作废/重写。
4. **基线已知红项**：`test/桌面应用/optional-acceptance.test.ts` 6/2/1/3/0 与本变更无关、不在写集修复；`test/编排/**` 22 fail/2 skip 以提案卡修复 B1 v1.1 附录 A.1 为参照、以本变更实施基线重取为准；B1 只按「增量不回归」判定，不得为求绿修改写集外路径。
5. **真实运行限制**：只承诺本次候选/环境/输入下的证据；真实 Electron/真实 Claude/真实 UI 与 9223 隔离是硬约束；项目角色真实调用取决于预置，预置不可行按 RR-7 如实降级；不宣称完整闭环/长期稳定性/发布。
6. **披露（Q10/Q12）**：工具目录注册（6 内置 + 项目角色）与真实模型调用是两层证据；真实调用只承诺产品 + 1 项目角色（预置成功时），其余角色为注册/数据源证据；不得把注册写成真实读取。Q12：若模型不主动查，后续另案加角色卡指引，不在本变更内。
7. **披露（P1 预算）**：索引 ≤8192 B/详情 ≤8192 B 为硬约束；P1 必须实测索引字节；若超限按 Q14 汇总（B 组 stage 一行），并记录对「全量可发现」的影响。
8. **披露（Pi/Codex）**：Pi/Codex 真实模型行为不作承诺；以确定性测试覆盖工具定义/描述/guidelines 与 `tools/list`；真实运行只覆盖 Claude。
9. **披露（dispatch_task/git_candidate）**：其呈空机制（尤其 `dispatch_task`）仍为 [推断]/[待确认]，本变更范围外；本变更只保证新工具扁平 schema。
10. **披露（T2/T3）**：档位由统筹裁决；本 B1 默认 T2 + 全量受影响回归，T3 则按 T3；不得以 T2 证据冒充 T3 全量回归。
11. **证据复用**：分层独立（BASE-6）；旧候选、其它 B1、在飞变更证据不得冒充；任何候选/环境/命令变化使证据失效并重取。

## 11. 当前状态

- **B1 完成、冻结（实施前）**；BASE-1–BASE-8、AC-1–AC-17、TM-1–TM-14、RR-1–RR-8、EV1–EV6 当前全部 `未取证`，不得判 pass。
- 本 B1 写盘时：提案卡修复已提交（HEAD `fb1aa39e`，B2 pass `8af767e2…`/变更包 `e5735373…`）；judge 尚未冻结/合入（团队计划 `98dcfc80…`；交付时点已观测到其写集 4 个在飞修改，见头部）；本变更按串行最后实施，实施基线须按 BASE-1 重取，B2 不得混入 judge 在飞状态。
- 后续由同一独立验收身份在候选/确定性测试/真实运行证据交付后按本 B1 作 B2；阶段独立报告，不跨阶段合并。
- 本 B1 不修改其它 B1/在飞变更；发布/tag 不在授权内。

**（完）**
