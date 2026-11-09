# 独立复核记录：每个文档格式的权威说明与全员可读（P1.0）

- 版本：**R1.0，2026-11-09**；ANS 独立复核（Reviewer）独立只读上下文。
- 状态：**复核记录；不是验收结论、不阻断、不实施。** 本次复核未改方案/代码/测试/角色卡/边界；未提交/推送/合并/发布；未运行真实模型/Electron/测试；仅写本记录。
- 复核规则：只作建议；逐项给出可核对依据；**不把方案推荐当客户确认**；本文严重度仅为建议分级（must-fix / general / suggestion），不代表验收判定。
- 结论（摘要）：**建议修订后提交。** 方案方向、绝大多数 file:line 引用、字段表与校验器要点核实为真；但存在 **3 项 must-fix**（A14 `git-quality-report/v1` 严格解析器未清点且被误标「无严格解析器」；§10 对 judge/提案卡并行写集的描述与对方方案及复核记录相反；B21/B22 合并行使 `schemaLiteral` 单值与 48 行/50 id 不自洽），另有 7 项 general 与 6 项 suggestion（含一个低优先小项合并）。F1–F3 修订前不建议进入实施派发。

---

## 0. 复核对象、依据与基线（快照）

| 项 | 值 |
|---|---|
| 方案 | `docs/planning/2026-11-09_design_document-format-specifications.md` |
| 方案规模 | **786 行 / 99,718 bytes / SHA-256 `0469e2dfa5891174c534c3bca03219724c429096c0fea4892982f1a1ca8f8358`**（`wc -lc` 与 `sha256sum` 实测，与任务给定一致） |
| 方案 git 状态 | 未跟踪（`git status --porcelain` = `??`）；哈希按工作区字节计算，不对应已提交 blob |
| 意图记录 | `docs/communication/2026-11-09_intent_document-format-specifications.md`（28 行 / 2,948 bytes / SHA-256 `bf870ae959772956912006e52c32502476ac787bdb0466d2826abd6b7e56ce8d`，实测一致） |
| 预授权 | `docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`（38 行 / 3,418 bytes / SHA-256 `e2bdd96b19a2b58b190ea4bdeb6dc647b97139b5bf22cabcfa05dd7496d9011a`，实测一致） |
| 并行 judge 方案 | `docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`（**P1.1 当前快照 674 行 / 84,483 bytes / SHA-256 `72d3624249a33d84749e7c70fe7b9440326a73efd3fc14684d26ef69a5fab791`**；P1.0 历史版本 550 行 / 59,176 bytes / `60c68dad…cbc8a`，见其版本表；复核期间该未跟踪草案被并发更新，引用行号以其当前快照为准） |
| 并行 judge 复核 | `docs/planning/2026-11-09_review_judge-delegated-decision-effectiveness.md`（R1.0，287 行 / 38,867 bytes / SHA-256 `6e98749bd227c6f723e70ace5200d6eaea3c5cebb777ac2ee28f06fe6a3a9b19`，实测一致） |
| 提案卡修复路由 | `docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md`（183 行 / 32,508 bytes / SHA-256 `4e8fb3545f3679ee48b397b4c43d1eb4ab517e9b40a7e541b4ba0daf3fa7ea85`，实测一致） |
| 提案卡缺陷记录 | `docs/communication/2026-11-09_defect_proposal-card-run-binding.md`（48 行 / 5,529 bytes / SHA-256 `21dfb43cfc330dcd19058a42a5e72bd1ea27bda3a264a68770160a0173ba300c`，实测一致） |
| 代码基线 | git worktree `.claude/worktrees/trunk-amendment`，HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`（分支 `feat/plan-escalation-card`）；`git status --porcelain -- src app test` 为 0；`git diff --stat 65813c9..HEAD -- src app test` 为空；`git diff --stat c1439ce..origin/main -- src app test` 亦为空（origin/main 同内容），故本记录行号对当前 main 同内容成立 |
| 角色边界快照 | `角色卡/编排/boundary.yaml`（111 行 / `dbabf44f…`）、`运行时核心`（73 行 / `06d087a9…`）、`桌面窗口`（280 行 / `e5af2b30…`）、`门禁引擎`（65 行 / `f580eca0…`）、`测试`（32 行 / `3c8f7e0e…`） |

方法：逐条阅读方案并按其 `file:line` 声明以只读方式核对代码；对清点表执行独立 `grep` 扫描（schema 字面量、`from "yaml"`、`parse*/validate*/frontmatter`、`.ans` 路径、`docs/*` 前缀）；对重点解析器/校验器逐段阅读；对写集逐文件核对 boundary §1；对并行变更读取其写集与冲突段并计算哈希。未运行测试/真实模型/Electron。行号均为 `c1439ce` 快照，实施合并后可能漂移，以符号名为准。

---

## 1. 结论摘要

方案把「格式说明」收敛到解析器同侧的纯数据/纯渲染模块 `src/common/编排/doc-format-specs.ts`，用只读 `doc_format` 工具经既有「注入才注册」链注入全部角色会话，并以真实 parser 正例、字段变异矩阵、约定反证、schema 字面量扫描与冻结 id 清单钉住漂移——方向与客户意图（每种格式有权威说明、每个角色可读取、不放宽校验）一致；§2 的 25 个角色可写格式与 23 个内部格式绝大多数引用可对上，A1–A13/A17–A21 的字段表与本人抽查的解析器要点一致。

但以下三点必须先修订：

1. **清点准确性与意图第 1 条直接冲突（F1）**：`docs/quality/<flowId>-report-vN.md` 在 git 质量复核路径存在**严格 frontmatter 校验**（`apply-journal.ts:1899-1930`，`schema:"git-quality-report/v1"`、精确键集与绑定字段、`review-quality-*` 拒绝）；方案 A14 却写「无严格解析器」并把 quality report 归为「仅约定」。方案自己的 schema 扫描会撞上 `git-quality-report/v1`；若把它当非文档白名单排除，则「不得遗漏被真实解析的格式」不成立。
2. **并行协调事实错误（F2）**：方案 §10.1 把 judge 变更描述为会改 `app/desktop/customer-input.ts`/`session.ts`/`run-role.ts`；judge 方案 P1.1 §5.1 明确排除这些文件，其 §10.1 已就此立勘误并要求知会统筹；judge 复核 R1.0 F1（`6e98749b…`）也点名本方案 `:731` 误述。方案 §10.2 又把 `test/桌面应用/session.test.ts` 记为 judge/缺陷冲突、把 `run-manifest.ts` 记为缺陷「可能编辑」——提案卡修复路由（`4e8fb354…`）推荐 A′ 明确**不改** `run-manifest.ts`、B 改 `test/桌面应用/chief-workflow.test.ts`。串行「本变更最后」的结论仍安全，但冲突矩阵须按对方现行版本更正。
3. **清点 id 数与数据模型不自洽（F3）**：B21 一行含 `role-authorization/v1` + `role-activation/v1`，B22 一行含 `stable-initial-workflow/v1` + `stable-initial-workflow-source/v1`；48 行对应 **50 个 id**，而 `DocFormatSpec.schemaLiteral` 是单值，AC-1/AC-3 与 schema 扫描无法按现行模型表达。须拆成四行/四个 spec 或扩展模型。

其余 general：内部格式清点仍有缺口（`versions.jsonl` 等，F4）；`test/桌面应用/session.test.ts` 实为已删除文件而非「既有文件」（F5）；「schemaLiteral 一律从定义处 import」对多处内联字面量与门禁/运行时核心私有常量不可同时成立（F6）；`part` 对 render 型格式不可实现（F7）；B 组「主校验器 + 合法样例」缺少可调用 seam（F8）；A3/A4 字段表与错误码覆盖不全（F9）；真实运行场景无法在预算内产生「1 个项目角色真实调用」（F10）。suggestion 见 F11–F16。

**复核结论（建议）：修订后提交；F1–F3 修订前不建议进入实施派发。** 本记录不构成验收结论。

---

## 2. 问题清单（F1..F16）

严重度：must-fix（建议修订后方可提交/派发）> general（应修订/澄清）> suggestion（建议改进，不阻断）。

| # | 严重度 | 位置（方案行） | 问题摘要 |
|---|---|---|---|
| F1 | **must-fix** | §2.2 A14 `:107`；§2.4 A14 `:288-292`；§2.5 `:354`；§3.4 `:460`；AC-1/AC-3 `:606-608` | quality report 被误标「无严格解析器」；`git-quality-report/v1` 严格 parser 未清点，A14 的 id/字段/错误码缺失 |
| F2 | **must-fix** | §5.5 `:537`；§10.1 `:731-732`；§10.2 `:738-744`；§10.3 `:751-754` | judge/提案卡并行写集与冲突描述与对方现行方案/复核相反；`app/desktop/session.ts`/`run-role.ts`/`session.test.ts`/`run-manifest.ts` 的冲突归属错误 |
| F3 | **must-fix** | §2.3 B21/B22 `:146-147`；§3.2 数据模型 `:409-427`；AC-1/AC-3 `:606-608` | B21/B22 各含两个 schema 字面量，`schemaLiteral` 单值无法表示；48 行 ≠ 50 id |
| F4 | general | §2.3 `:120-148`；§2.6 `:358-362`；AC-1 `:606` | 内部格式清点缺口：`.ans/state/versions.jsonl`、`download-consumer.json`、`.ans/trunk/deliveries/*.json`、`git-mode.json`、legacy `apply-journal.json`；`docs/audit/shell-gate.jsonl`/`chief-workflow/v1` 未显式排除 |
| F5 | general | §6.1 第 9 行 `:557`；§6.2 `:570`；§7.3 `:635` | `test/桌面应用/session.test.ts` 不存在（边界漂移），不能作为「既有文件补用例」；§7.3 基线命令会失败 |
| F6 | general | §3.1 `:380-386`；§3.3 #3 `:436-442`；AC-3 `:608` | 「schemaLiteral 一律 import 常量」「不跨角色 import 私有实现」对多处内联字面量/A17–A19/A21 不可同时成立 |
| F7 | general | §3.2 `:421-434`；§3.3 #1 `:438`；§4.1 `:481` | render 型格式（modules/roster/topology）无法实现 `part=fields/example/errors` 子集语义 |
| F8 | general | §2.3 注 `:122`；§3.4 #1/#6 `:446-462`；§7.1 `:590-595` | B 组「主校验器 + 合法样例」缺少可调用纯校验器/测试 seam（run-repin、team-plan-completion、role-auth/activation 等） |
| F9 | general | §2.4 A3 `:192-194`；A4 `:201-205`；§3.4 #6 `:462`；§7.1 `:595` | A3/A4 字段表漏「普通模块 paths 仅 1 项」；parser 错误码清单不全；loadChecks 只覆盖子集 |
| F10 | general | §7.4 `:645-658`；AC-12 `:617`；Q10 `:684`；§9.3 第 4 项 `:718` | 新空目标项目在 1 条客户消息/15 分钟内无法产生「1 个项目角色真实读取」证据；AC-12/Q10 与场景不一致 |
| F11 | suggestion | §3.1 第 2 行 `:551`；第 7 行 `:555` | `AdapterCapabilities` 实际在 `run-role.ts:304`；`model/runtime.ts` 需加的是 `GovernedToolsOptions.docFormat?`；行 2/7 的文件/接口归属需精确 |
| F12 | suggestion | §4.3 `:503`；§9.1 `:703` | Pi「无 promptGuidelines」表述不准确：适配器按工具透传 `promptGuidelines`；系统提示不拼接而已 |
| F13 | suggestion | §3.3 #1 `:438`；§7.1 `:594` | `doc_format` 复用 `contractSchemaText` 会带出「contract_check topic=…」标题与「其余参数被忽略」，易混淆 |
| F14 | suggestion | §3.2 `:425`；§4.1 `:482`；§4.4 `:510`；Q2 `:676`、§9.3 第 3 项 `:717` | 48 行/50 id 全量索引 ≤4096 B 预算偏紧（中文标题粗估 4–5 KB），截断会丢失 id、削弱可发现性 |
| F15 | suggestion | 头部 `:5`；§6.3 `:579`；§9.4 `:722-723` | T2 自评有先例但新增工具面大于「加可选参数」先例；建议由统筹裁决 T2/T3 |
| F16 | suggestion | A24 `:117`；A22 `:115`；A10 `:255` | A24 在表 A 但 audience 实为 app-managed；A22「无解析器」实为摘录解析；A10 no-op snapshot 例外未写 |

---

## 3. 逐项依据与建议

### F1（must-fix）A14 quality report：严格 parser 未清点、分类错误

**位置**：方案 A14 行 `:107`、§2.4 A14 `:288-292`、§2.5 「仅约定」`:354`、§3.4 schema 扫描 `:460`、AC-1/AC-3 `:606-608`。

**问题**：方案称 `docs/quality/<flowId>-report-vN.md`「**无严格解析器**」「无拒绝码」，只做文件名/版本扫描与 judge 摘录。但 git 质量复核路径对同一文档做严格 frontmatter 校验：

- `src/service/trunk/impl/apply-journal.ts:1899-1930`（`readTextQualityProof`）：读取 `docs/quality/<flowId>-report-v*.md`，正则取 frontmatter 并 `parseYaml`；要求 `meta.schema === "git-quality-report/v1"`；要求键集合恰为 `schema/version/taskId/runId/flowId/candidateOperationId/candidate/criteria/checks`（未知键拒绝）；校验 `taskId/runId/flowId/candidateOperationId/candidate/criteria` 与任务/冻结基准一致；拒绝文案含 `review-quality-report-missing`、`review-quality-binding-invalid`、`review-quality-checks-missing` 等（`invalid(...)` 统一返回 `trunk-item-invalid`）。调用点见 `:1982`、`:2749`、`:2768`。
- 测试也按该字面量与键集生产/断言：`test/测试/git-role-workflows-e2e.test.ts:277-280`、`:710`。
- 方案 §2.1 的 YAML 解析器扫描本就命中 `apply-journal.ts`（`:84`），但清点表未收录该格式。

**影响**：AC-1「清点完整」与 AC-3「schema 字面量不漂移」按现方案无法成立；§3.4 #4 的全仓扫描会扫到 `git-quality-report/v1`，它不是「非文档 key/文件名」，不能进排除白名单；若把它当 `quality-report/v1` 的同一格式，则 A14 的 `enforcement`/字段/错误码全部缺失，变矩阵与 overclaim guard 也无法覆盖。

**建议**：二选一并升版：
1. 新增独立格式行（如 `git-quality-report/v1`，路径 `docs/quality/<flowId>-report-vN.md`），给出 frontmatter 字段表（必填/可选/精确键集/绑定语义）、`review-quality-*` 错误、最小合法样例与真实 parser 正/负例；同时保留 A14 作为「展示/摘录」层并注明其与严格层的关系；或
2. 把 A14 改为分层格式（展示层 + git 严格层），在 A14 内列明严格 parser 与字段，避免一个 id 掩盖两套口径。
无论哪种，都须把 `git-quality-report/v1` 纳入 schema 扫描注册表（或给 A14 一个能表达两个 schema 的结构），并在 §2.5 更正「quality report 仅文件名/摘录」的表述。

### F2（must-fix）§10 并行写集/冲突事实错误

**位置**：方案 §5.5 `:537`、§10.1 `:731-732`、§10.2 `:738-744`、§10.3 `:751-754`。

**问题**：
- 方案 §10.1 `:731` 写 judge 变更会改 `src/model/version-change.ts`、`apply-journal.ts`、`version-change-service/freeze-service`、`guard-freeze-registry.ts`、`src/model/runtime.ts`、`app/desktop/customer-input.ts`、`app/desktop/session.ts`、`run-role.ts`、`classify-shell.ts` 与测试。judge 方案 P1.1 §5.1（当前快照 `:417-430`）与 §5.1 排除清单（`:430`）明确：**不改任何 `app/desktop/*`，不改 `run-role.ts`**；其真实写集还包括本方案未列的 `src/common/编排/task-state.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`version-change-runtime.ts`、`freeze-service.ts`、`version-change-service.ts`。judge P1.1 §10.1（`:592-608`）已就此立勘误，judge 复核 R1.0 F1（`6e98749b…`，`:58-73`）点名本方案 `:731`「与本方案 §5.1 排除清单相反」，并要求交统筹知会。
- 方案 §10.2 `:738` 把 `app/desktop/session.ts` 列为与 judge **高冲突**；judge 不编辑该文件。
- `:740` 把 `run-role.ts` 列为与 judge 中冲突；judge 不编辑。
- `:741` 把 `test/桌面应用/session.test.ts` 列为 judge/缺陷同文件用例；judge 不编辑；提案卡修复 B 的写集是 `app/desktop/customer-input.ts` + `test/桌面应用/chief-workflow.test.ts`（fix routing `:110-115`）。
- `:744` 把 `src/common/编排/run-manifest.ts` 记为缺陷「可能编辑」；fix routing 推荐 A′ 明确「不改 `run-manifest.ts`、不写 manifest」（`:75`）；只有未采纳的备选方案 A 才会改 `run-manifest.ts`（`:87-89`）。
- 方案 §10.3 的「judge 与提案卡修复先行、本变更最后」排序**结果仍安全**，且与 judge P1.1 推荐的「提案卡修复 → judge → 文档格式」兼容；但并列事实与冲突级别必须更正，否则协调记录会误导后续单写者执行。

**建议**：按 judge P1.1（`72d36242…` 当前快照）与 fix routing（`4e8fb354…`）重写 §10.1/§10.2：
- judge 真实重叠仅 `src/model/runtime.ts`（不同区域、串行写）；`app/desktop/session.ts`/`run-role.ts` 与 judge 无冲突；`test/桌面应用/session.test.ts` 与 judge/缺陷无冲突（且该文件本身不存在，见 F5）；`run-manifest.ts` 与缺陷推荐方案无冲突（仅备选方案 A 才编辑，须注明）。
- 列出 judge 实际写集的其余文件（`task-state.ts`、`trunk-runtime.ts`、`version-change-runtime.ts`、`freeze-service.ts`、`version-change-service.ts` 等），并写明「本变更不编辑」。
- 把「对方方案误述本 judge 写集」的勘误作为协调记录条目交统筹/沟通（judge P1.1 已把它列为提交前知会项）。

### F3（must-fix）B21/B22 合并行与 `schemaLiteral` 单值/48 行 vs 50 id

**位置**：方案 §2.3 B21/B22 `:146-147`；§3.2 `DocFormatSpec` `:409-427`（`schemaLiteral?: string` `:415`）；AC-1 `:606`；AC-3 `:608`；§3.4 #4 `:460`。

**问题**：B21 一行写 `role-authorization/v1` + `role-activation/v1`；B22 一行写 `stable-initial-workflow/v1` + `stable-initial-workflow-source/v1`。其余 B 行与 A 行均一行一 id，故表 A 25 + 表 B 23 = 48 行，但实际 id 为 **50**。`DocFormatSpec.schemaLiteral` 是单个 `string`，无法同时表示一行里的两个字面量；`DOC_FORMAT_SPECS.map(s=>s.id)` 与冻结清单 deepEqual、以及「每个字面量出现在 `DOC_FORMAT_SPECS.schemaLiteral`」的扫描都无法按现表自动成立。代码依据：`role-authorization/v1` 在 `apply-journal.ts:3200`、`classify-shell.ts:539`；`role-activation/v1` 在 `apply-journal.ts:3203`、`classify-shell.ts:531`；`stable-initial-workflow/v1` 在 `classify-shell.ts:348`、`apply-journal.ts:1146`、`git-trunk-store.ts:295,1270`；`stable-initial-workflow-source/v1` 在 `classify-shell.ts:108,309`、`provider/trunk/abstract/trunk-store.ts:233`、`service/trunk/impl/stable-snapshot.ts:53`、`git-command.ts:423` 等。

**建议**：拆分为 B21a/B21b/B22a/B22b 四行（四个 spec，各自 `schemaLiteral` 与示例），或在数据模型中支持 `schemaLiterals: readonly string[]` 并同步 AC-1/AC-3/扫描测试；同时把任务/方案中的「48 条」改为「48 行 / 50 id」或「50 个 spec」。本项与 F1 一起决定 schema 扫描测试的通过条件。

### F4（general）内部格式清点缺口与排除口径

**位置**：方案 §2.3 `:120-148`（「应用内部状态/事件格式（角色不写；应用解析）」）、§2.6 排除 `:358-362`、AC-1 `:606`。

**问题**：按方案 §2.1 的判据（生产代码读取项目字节并做结构性判定），以下内部格式被真实解析但未列入 B 表，也未在 §2.6 明确排除：

- `.ans/state/versions.jsonl`：`src/common/门禁引擎/versioned-doc-guard.ts:368-427`（`parseVersionBaselineState`）逐行 `JSON.parse` 并校验 `v=1/flowId/doc/version/path/sha256/recordedAt/recordedBy/event`，`frozen` 行还校验 `freeze` 记录；读取入口 `provider/version-change/impl/guard-freeze-registry.ts:29-35`，路径常量 `:104`。
- `.ans/state/download-consumer.json`：`src/provider/download/impl/consumer-epoch-store.ts:24-58`（`parseState`）校验 `version/enabledAt/appVersion`；路径 `src/provider/download/abstract/download-consumer-epoch.ts:9`。
- `.ans/trunk/deliveries/<hash>.json`：`src/provider/version-change/impl/guard-freeze-registry.ts:1080-1089`（`operationDeliveryRecorded`）`JSON.parse` 并校验 `key`。
- `.ans/trunk/git-mode.json`：`src/provider/trunk/impl/git-trunk-store.ts:1096-1108`、`git-command.ts:921` 读取并判定媒体/迁移字段。
- legacy `.ans/trunk/apply-journal.json`：`src/provider/trunk/impl/fs-trunk-store.ts:649-650` 用 `isTrunkApplyJournalShape` 解析；方案 B6 只写 `.ans/trunk/operations/*.json`，未写该路径。
- 另：`docs/audit/shell-gate.jsonl` 是应用写的 JSONL（`src/common/编排/shell-audit.ts:25,159`、`shell-post-audit.ts:331`），当前未发现应用读取/结构校验；`chief-workflow/v1` 是应用包内 Markdown 资源，`src/provider/runtime/tools.ts:175-191` 读取并校验身份/版本/hash。二者若不做 B 行，应在 §2.6 以「非项目文档/仅写不读」明确排除并给白名单理由。

**建议**：把上述「应用解析」项加入 B 表（B24..B28 或按需合并），或在 §2.6 用可复核的判据逐项排除；同时把 B 表的「角色不写；应用解析」定义与「仅写不读」区分开。否则 AC-1 的「每个被真实解析的格式都有规范」不成立。

### F5（general）`test/桌面应用/session.test.ts` 不存在

**位置**：方案 §6.1 第 9 行 `:557`（「既有文件补用例」）、§6.2 `:570`（「桌面窗口既有单文件」）、§7.3 `:635`（回归命令 `node --test test/桌面应用/session.test.ts`）。

**问题**：该文件当前不存在（`ls test/桌面应用/session.test.ts` → No such file）；`test/桌面应用/` 下实际有 `session-history.test.ts`、`session-rebuild-race.test.ts` 等，但没有 `session.test.ts`。`角色卡/桌面窗口/boundary.yaml:99` 与 `boundary.md:39` 仍把它列为 Section 1 单文件；`docs/acceptance/2026-11-08_session-admission-approval-report-v1.md:153` 已记录「`session.test.ts` 确为 `4c24149` 删除、`角色卡/桌面窗口/boundary.md` 仍列；本变更未恢复/未新建，交人事/治理」。因此：
- 「既有文件补用例」不实；实际会是**新建**该路径文件（该路径已在 Section 1 中，故 H1 delta 仍可为 0，但性质是新建）。
- §7.3 的「实施前基线」命令会因文件不存在而失败，不能作为 green baseline。

**建议**：选择仍在的、Section 1 已授权的既有文件补用例（如 `test/桌面应用/session-history.test.ts`、`multi-runtime.test.ts`），或明确写「重建已被删除的 `test/桌面应用/session.test.ts`（路径已在边界 §1；记录已知边界漂移）」并相应调整 §6.1/§6.2/§7.3；不要称其为「既有文件」。

### F6（general）「schemaLiteral 一律 import 常量」与跨角色私有常量不可同时成立

**位置**：方案 §3.1 `:380-386`（「不需要跨角色 import 门禁引擎/运行时核心私有实现」）、§3.3 #3 `:436-442`（「schemaLiteral 一律从定义处 import…不手写重复字面量」）、AC-3 `:608`。

**问题**：多处被清点的 schema 字面量在源码中是**内联字符串**，没有可 import 的导出常量：
- `run-repin/v1`：`run-manifest.ts:78`（类型属性）、`:816`（字面量）；无 `RUN_REPIN_SCHEMA`。
- `team-plan-completion/v1`：`apply-journal.ts:2875`、`classify-shell.ts:650`；无共享常量。
- `role-authorization/v1`/`role-activation/v1`：`apply-journal.ts:3200,3203`、`classify-shell.ts:531,539`；无共享常量。
- `repository-work-source/v1`：`src/common/roles/chief/internal/dispatch.ts:42,53`（chief-code 私有）+ 多处内联校验；无共享常量。
- `stable-initial-workflow/v1`/`source`：`classify-shell.ts:108,309,348`、`apply-journal.ts:1146`、`git-trunk-store.ts:295,1270`；无共享常量。
- `doc-freezes/v1`：`versioned-doc-guard.ts:726`、`provider/version-change/abstract/freeze-cache.ts:38`、`fs-freeze-cache.ts:29`、`guard-freeze-registry.ts:279`；均为局部常量/接口属性。
- `git-quality-report/v1`：`apply-journal.ts:1911`；同上（与 F1 关联）。

A17–A19/A21 的规则常量也在其他角色私有模块：`ROLE_CARD_REQUIRED_SECTIONS` 在 `src/common/门禁引擎/governance-roles.ts:351-362`（未从 `resolve-role.ts:72` 或 `resolve-boundary.ts:141,149` 公开导出）；boundary 的 `KINDS/ROOTS/TOP_KEYS` 在 `src/common/门禁引擎/boundary-yaml.ts:14-17`；MCP 的 `NAME_PATTERN/RESERVED_NAMES/ENV_NAME_PATTERN` 在 `src/common/runtime-core/mcp-declarations.ts:54-58`。按方案自己的「跨角色只经公开出口、不得 import 私有 common」纪律（`resolve-role.ts:66-72` 注释、`resolve-boundary.ts:114-149`），`doc-format-specs.ts`（编排）不能直接 import 这些私有常量；而方案 §3.1 又说不需要跨角色私有 import。结果「一律 import 常量」在 A17–A19/A21/B20–B22 上不可实现。

**建议**：在方案中显式选择并写明其一：
1. **钉住副本**：允许 `doc-format-specs.ts` 手写这些格式的文本/字段，由对应角色 owner 的 pin 测试（`test/门禁引擎/doc-format-specs-pin.test.ts`、`test/runtime-core/...`、`test/编排/...`）把 spec 文本与其私有常量/真实 parser 交叉断言；承认这是「受测试钉住的副本」，不是 import 单一源；
2. **增加公开导出**：在 owner 同意下给 `resolve-role.ts`/`resolve-boundary.ts`/`mcp-declarations` 等加只读导出（写集/owner 需扩展，可能触发 H1/协调），再让 spec import；
3. 调整格式位置或把相关 spec 的渲染委托给 owner 提供的纯函数。
无论哪种，AC-3 的「import 常量相等」应改为可执行的判据（如「spec 值 == 公开常量/真实 parser 接受」），否则测试设计无法落地。

### F7（general）render 型格式的 `part` 语义不可实现

**位置**：方案 §3.2 `DocFormatSpec.render`/`fields` `:416-421`、`part` `:430-434`；§3.3 #1 `:438`；§4.1 `:481`。

**问题**：modules/roster/topology 三个 spec 的 `render` 直接返回 `contractSchemaText(topic)`（`workflow-preconditions.ts:257-259`），而该文本是「标题 + 字段表 + 最小示例」的单块字符串（`CONTRACT_MODULES_SCHEMA_TEXT` 等，`:180-259`）。`part:"fields"` 要求「仅字段表 + 加载级」，`part:"example"` 要求「仅样例」，`part:"errors"` 要求「仅错误表」；对单块 render 返回值无法在不编辑 `workflow-preconditions.ts`（本变更写集不含）或不复制/解析文本的情况下拆分。方案没有定义 render 型 spec 的 part 语义，§7.1 的 part/预算测试可能无法按预期编写。

**建议**：明确 render 型 spec 的 part 规则（如 `part` 对 render 型仅做「全量原文 + 标注不支持细分」，或把 contract 文本拆为字段/示例常量——后者是 `workflow-preconditions.ts` 的写集变更，须由编排 owner 纳入并重评 H1/串行），并在 AC-8/§7.1 增加对应断言。

### F8（general）B 组「主校验器 + 合法样例」缺少可调用 seam

**位置**：方案 §2.3 注 `:122`（「测试钉住主校验器锚点 + 一个合法样例」）、§3.4 #1 `:446-450`、#6 `:462`、§7.1 `:590-595`。

**问题**：B 组中部分格式的校验是内联在带副作用的业务流程中的，没有可导出的纯校验器：
- `run-repin/v1`：`run-manifest.ts:77-84`（类型）、`:733-832`（`repinPinnedRun` 内联校验目标/哈希/冻结）；没有 `isRunRepinRecord` 导出。
- `team-plan-completion/v1`：`apply-journal.ts:2875-2879`（marker 合成）、`classify-shell.ts:650`（策略校验）；没有纯校验器。
- `role-authorization/v1`/`role-activation/v1`：`apply-journal.ts:3200-3203` 合成、`:3269/:3423` 读取校验、`classify-shell.ts:531-539`；均内联。
- 可用的导出校验器仅覆盖部分：`isTrunkApplyJournalShape`（`git-command.ts:33`）、`isValidDocFreezeRecord`（`model/version-change.ts:267`）、`validateTaskStateEvent`（`task-state.ts:1140`）、`isCompleteSnapshot`（`model/trunk.ts:645`）。

因此「B 组至少一个合法样例由主校验器验证」对 run-repin/team-plan-completion/role-auth 等只能走带副作用/需完整 run 的公开路径，测试成本与可行性未在方案中说明；若退化为文本/形状断言，就会出现「测试通过但校验器另有分支」的风险。

**建议**：为每个 B 行在规范数据中记录「测试 seam」：导出纯校验器名、或需构造的最小公开路径（如 `repinPinnedRun` 的最小 pinned run 夹具、team plan completion 的最小 trunk 夹具），并在测试矩阵中逐行标明；对确实无法纯测的格式，明确降级为「文本/形状断言」并说明残余风险。

### F9（general）A3/A4 字段表与错误码覆盖不全

**位置**：方案 A3 `:192-194`、A4 `:201-205`、§3.4 #6 `:462`、§7.1 `:595`。

**问题**：
1. **多路径限制漏写**：`parseProjectRoster` 在 `workflow-preconditions.ts:902-903` 拒绝「普通模块 paths > 1（多路径仅限 env-bootstrap 固定模块）」；方案 A3 只写 `paths` 1–20（`:192`），A4 的 `modules` 字段也未提该限制。按方案写的 `paths` 示例若含 2 项，`parseProjectModules` 可能通过而 `parseProjectRoster` 拒绝，字段表的 `enforcement` 会跨层不一致。
2. **parser 错误码清单不全**：`parseProjectModules` 还产生 `modules-doc-frontmatter`、`modules-doc-yaml`、`modules-doc-flow`、`modules-doc-modules`（`workflow-preconditions.ts:988-1013`），方案 A3 `:194` 只列 `modules-doc-schema/version/id/fields/directory/overlap`；`parseProjectRoster` 的 `roster-schema-invalid`、`roster-roles-invalid`、`roster-role-*`、`roster-modules-invalid`、`roster-module-*`、`roster-env-bootstrap-invalid` 等（`:700-980`）大多未在 A4 `:205` 列出；`modulesDoc` 的 `roster-reference-stale`（`:1238-1246`）也未在 A4 加载清单中。
3. **测试只钉 `loadChecks.code`**：§3.4 #6/§7.1 只要求每个 `loadChecks.code` 复现一次；未列入 `loadChecks` 的 parser 分支不会被负例覆盖，正是「测试通过但校验器另有分支」的风险点。

**建议**：补 A3/A4 的多路径限制及归属（roster 加载层强制，modules 解析器本身不限制）；在共同错误/加载检查中补全稳定 code，或新增「全仓稳定 code 扫描」测试：把 `src/**` 中形如 `xxx-invalid`/`xxx-missing` 的稳定 code 收集，要求每个 code 出现在 spec 的 `commonErrors`/`loadChecks` 或显式白名单（含理由）。这与 F1 的 schema 扫描同型，能机械防止漏码。

### F10（general）真实运行场景无法在预算内产生「1 个项目角色真实读取」

**位置**：方案 §7.4 `:645-658`、AC-12 `:617`、Q10 `:684`、§9.3 第 4 项 `:718`。

**问题**：§7.4 设定「目标项目在仓库外新目录」、客户消息 1 条、墙钟 ≤15 分钟，场景只要求产品写产品意图 + 意图确认通过；但 AC-12/Q10 要求「至少产品 + **1 个项目角色**真实读取到说明」。新空项目没有项目角色；项目角色要经 roster/任命/角色卡三文档 + 激活（D3/activation）才会出现在 `openRoleSession` 可枚举集合中，这需要额外的角色卡/边界/任命卡/确认步骤，与「1 条客户消息/15 分钟/卡数最小」的预算冲突。方案未说明目标项目如何预置 1 个项目角色（预置算不算运行准备、是否需客户/治理步骤），因此 AC-12 按现 §7.4 不可执行或必须显著超预算。

**建议**：二选一并写入 §7.4：
1. **预置目标项目**：在测量前用正常应用流程（或既有目标项目副本）创建一个合法的项目角色卡/边界/激活记录，明确这是运行前置准备（不计入客户消息/墙钟预算）并在预检/后检中记录来源；或
2. **放宽 AC-12**：真实模型只要求产品实际调用；项目角色的「可读取」由 `test/测试/doc-format-all-roles.test.ts` 的会话注册 + 数据源调用证据覆盖，并在 AC/Q10 中如实写明「未做项目角色真实模型调用」。
同时保持 Q10 默认 A 与 AC-12 一致，避免验收时对「全员可读」口径产生争议。

### F11（suggestion）`AdapterCapabilities`/`GovernedToolsOptions` 类型面归属

**位置**：方案 §3.1 第 2 行 `:551`（`src/model/runtime.ts` 加 `AdapterCapabilities.docFormat?`）、第 7 行 `:555`（`run-role.ts` 加 `RoleSessionDeps.docFormat?` + capabilities 透传）。

**依据**：`AdapterCapabilities` 实际定义在 `src/pipeline/orchestration/run-role.ts:304`（`contractCheck` 在其 `:875`）；`RoleSessionDeps` 在 `run-role.ts:409`；运行时核心实际注册面是 `GovernedToolsOptions`，`src/model/runtime.ts:3450`、`contractCheck` 在 `:3522`；`openRoleSession` 透传在 `run-role.ts:3546`（`capabilities?.contractCheck`）与 `:2106`。

**建议**：把写集行改为：`run-role.ts` 同时包含 `RoleSessionDeps.docFormat?`、`AdapterCapabilities.docFormat?`；`model/runtime.ts` 包含 `DocFormatInput/DocFormatResult/DocFormatFn` 与 `GovernedToolsOptions.docFormat?`（而不是 `AdapterCapabilities`）。避免实现时漏加某一层导致工具不注册（`undefined ⇒ 不注册`）。

### F12（suggestion）Pi 的 promptGuidelines 表述与测试

**位置**：方案 §4.3 `:503`、§9.1 `:703`。

**依据**：`src/common/pi-adapter/real-adapter.ts:482-496`（`toPiTool` 把 `promptGuidelines` 放进 Pi `ToolDefinition`）、`:1589`（`bindRole` 逐工具复制 `promptGuidelines`）；`renderSystemPrompt`（`:372-383`）确实不拼 `promptGuidelines`。Codex 系统提示在 `src/provider/codex/session.ts:510` 拼 `promptGuidelines`；Claude 在 `src/provider/claude/session.ts:318`。因此「Pi 无 promptGuidelines」的表述不准确；Pi 的可发现性至少依赖工具描述，且工具定义里仍带 guidelines（Pi SDK 是否展示属外部）。

**建议**：把「Pi 无 promptGuidelines」改为「Pi 系统提示不拼接 promptGuidelines，但工具定义逐工具透传；可发现性至少由工具描述保证」；并在确定性测试中加一条 `toPiTool(describeTool("doc_format"))` 的 description/promptGuidelines 非空断言（Codex 的 `tools/list` 非空已在方案内）。

### F13（suggestion）`doc_format` 复用 `contractSchemaText` 带出 `contract_check` 标题

**位置**：方案 §3.3 #1 `:438`、§7.1 复用断言 `:594`。

**依据**：`contractSchemaText` 的原文首行是 `contract_check topic=modules（只读 schema；查询不构成放行/授权）`（`workflow-preconditions.ts:181`、`:206` 等），并含「其余参数被忽略」。`doc_format` 详情若原样 `includes(contractSchemaText(topic))`，模型会看到另一个工具名，可能误以为在调 `contract_check` 或漏读 `doc_format` 的 part 语义。

**建议**：在复用原文前加一行来源说明（如「以下为 contract_check 同源原文；本工具只读展示」），保留 `includes(contractSchemaText(topic))` 测试；或在 `docFormatSpecText` 渲染时把首行替换为 `doc_format` 并向测试显式声明替换规则（后者会改变「逐字复用」的断言）。

### F14（suggestion）索引预算与 50 id 全量发现

**位置**：方案 §3.2 `:425`（索引 ≤4096 B）、§4.1 `:482`、§4.4 `:510-511`、Q2 `:676`、§9.3 第 3 项 `:717`。

**问题**：按 48 行/50 id、每行 `- <id> — <title>（audience）`，中文标题按 UTF-8 3 字节/字估算，单行约 80–120 B，50 行约 4–6 KB，加 stage 分组标题与首尾提示，很可能超过 4096 B。索引是「不知道 id 的模型」的首要发现路径；超限截断会丢掉尾部 id，直接削弱「每个格式可发现/可读取」的验收目标。

**建议**：在 P1 用实际 spec 文本测量索引字节数；若超限，二选一：提高索引上限（如 8 KiB，详情仍按需 part），或索引只列 stage + 代表 id，B 组内部格式以一行分组摘要 + `part`/详情可查。将 Q2/Q3 的「B 组是否全量展示」在 P1 前定案。

### F15（suggestion）T2/T3 由统筹裁决

**位置**：方案头部 `:5`（建议 T2）、§6.3 `:579`、§9.4 `:722-723`。

**依据**：既有 T2 先例是 `docs/planning/2026-11-03_design_contract-schema-query.md:757-772`（给 `contract_check` 加可选 `topic` 参数 + Model 加法可选字段）。本变更除了 Model 加法类型，还**新增一个对所有角色会话可见的工具**并改 `AdapterCapabilities`/`GovernedToolsOptions` 能力面；虽仍只读，工具面变化大于「加可选参数」先例。方案已写明「若统筹按凡触 Model/公共工具契约即 T3 则按 T3」，方向正确。

**建议**：把 T2 明确标为「建议、待统筹裁决」，不要由方案自行定档；若 T3，按 §9.4 做全量回归并重评测试预算；在协调记录中留痕。

### F16（suggestion）低优先内容小项合并

- **A24 `bootstrap-manifest/v1`**（表 A `:117`）：作者是应用、角色不可写、无读解析，`audience` 应为 `app-managed`；放在表 A「角色/客户可写（或可读）」下会误导。建议移入 B 表或显式标 `audience:"app-managed"`。
- **A22 `change-package/v1`**（`:115`）：方案说「无结构解析器」；`governance-judge-evidence.ts:573-585` 实际会解析 frontmatter 与结论章节做摘录，只是不做校验。建议改为「无校验器，仅摘录」。
- **A10 `trunk-amendment/v1`**（`:255`）：方案说「至少一个 `change != none`」；`parseAmendmentSnapshot` 调 `validateDocShape(..., true)`（`amendment-validate.ts:339`）允许 no-op 快照。建议注明该应用内部路径的例外，避免字段表 overclaim。

---

## 4. 已核实项（按复核重点）

### 4.1 清点完整性/准确性（重点 1）

- **行数/结构**：表 A 25 行（A1–A25）、表 B 23 行（B1–B23）与方案声明一致；但 id 数见 F3（50）。
- **schema 字面量扫描**：独立 `grep -rn --include="*.ts" -E '"[a-z][a-z0-9-]*/v[0-9]+"' src/` 结果与方案清点大体对应；新增发现 `git-quality-report/v1`（F1）及 `chief-workflow/v1`、`version-change-service/v1`、`git-ref/v1`、`git-initialization/v1` 等非文档/资源字面量（F4 白名单）。
- **YAML 解析器扫描**：`grep -rln --include="*.ts" 'from "yaml"' src/` 命中 `evidence-check.ts`、`governance-judge-evidence.ts`、`run-manifest.ts`、`workflow-preconditions.ts`、`boundary-yaml.ts`、`classify-shell.ts`、`run-role.ts`、`trunk-runtime.ts`、`amendment-validate.ts`、`apply-journal.ts`、`upgrade-validate.ts`，与方案 §2.1 #2 完全一致。
- **字段表抽查（与真实 parser 对照）**：
  - A1 `project-intent/v1`：`prepareIntentConfirmation`（`apply-journal.ts:3313-3332`）要求 `schema` 恰为字面量、`flowId`/`version` 若给出必须一致；`schemaMatches`（`run-manifest.ts:406-412`）缺失不拒；意图入口 `resolveIntentEntryReference`（`intent-entry-contract.ts:57-104`）与 `summarizeIntent`（`governance-judge-intent.ts:196-280`）的 goal/scope/acceptance 必填、intentId/flowId 一致性均核实。
  - A2：roster 加载对 proposal schema 做**子串**匹配（`workflow-preconditions.ts:1316-1330`）；upgrade 链 `schemaOf` 精确匹配与 confirmed intent 校验（`upgrade-validate.ts:50-55,99-116`）核实。
  - A3：`parseProjectModules`（`workflow-preconditions.ts:984-1116`）的 schema/flowId/version/modules 1–12、id 2–64、category 1–32、path/paths、publicContract、architectureSource 与非空约束核实；顶层多余键不拒属实。
  - A4：`parseProjectRoster`（`:686-981`）的 schema/flowId/version、intent/proposal/architecture/modulesDoc 版本化引用、roles 1–12、每模块恰一属主、envBootstrap 规则、topology 一致性与加载级 codes 核实；`loadLatestRoster`（`:1171-1345`）的 modules doc 对比、引用最新/非空、proposal/intent 链、architecture→proposal 链核实。
  - A5：`validateRosterTopology`（`:532-663`）的 schema v2、modules/roles/management 扁平数组、convener + 全部项目角色、路径/属主/数量一致核实。
  - A8：`parseTeamPlan`（`:60-112`）的 frontmatter 恰六键、roleRows 恰四键、writesets 属主根/治理目录/重叠、dependsOn 无环核实。
  - A10：`amendment-validate.ts:83-194,254-294,314-339` 的 schema/amendmentId/flowId/docVersion/baseTrunk/bootstrap/summary/items、kind/change/from/to 规则核实（no-op snapshot 例外见 F16）。
  - A11：`parseCriteriaText`（`evidence-check.ts:191-273`）的顶层/条目键集、schema/flowId/version/status/criteria 1–500、priority、id canonical、block 非法分隔符/锚点/多 block 核实。
  - A12：`parseEvidenceMeta`（`:328-370`）与 `checkEvidence`（`:373-529`）的单/collection 形状、hash/bytes/lines/mtime/acIds、P0 缺 sidecar 拒绝、非 P0 legacy 核实（`generatedAt` 有 1s 容差，方案未写，属小项）。
  - A13：`intent-entry-contract.ts` 与 `governance-judge-intent.ts` 的模板、别名、judge 必填项与错误码核实。
  - A17–A19：`parseSnapshotRoleDocuments`（`boundary-core.ts:75-106`）、`ROLE_CARD_REQUIRED_SECTIONS`（`governance-roles.ts:351-362`）、`parseBoundarySection1`（`boundary-parse.ts:75-127`）、`parseBoundaryYamlDoc`（`boundary-yaml.ts:46-124`）的三文件路径、10 章节、md↔yaml 恒等、archived、顶层键/枚举核实。
  - A20/A21：`installed-skills.ts:94-112,194-263` 的四字段/状态/SKILL.md sha256；`mcp-declarations.ts:122-300` 的七键/名称/保留名/env 规则核实。
- **B 组抽查**：B1–B3、B8–B10、B19–B23 的关键形状与校验入口核实（`run-manifest.ts:209-231,143-157,77-84,733-832`；`model/version-change.ts:267`；`boundary-core.ts:55-72`；`task-state.ts:1140`；`git-command.ts:33`；`config-loader.ts:96-330`）；B 组缺口见 F4/F8。

### 4.2 单一事实来源/工具契约（重点 2）

- **模块定位与纯净性**：`src/common/编排/doc-format-specs.ts` 位于编排 Section 1 目录（`角色卡/编排/boundary.yaml:79-82` 的 `src/common/编排/`）；方案要求纯数据/纯渲染、无 I/O，数据源静态早退（`§4.1 :484`），与既有 `contractSchemaText`（`workflow-preconditions.ts:257-259`）复用方向一致；桌面 `session.ts:158-167` 已有从 `workflow-preconditions.ts` 导入 `contractSchemaText` 的先例，依赖方向可接受。跨角色 import 的实际缺口见 F6。
- **工具注册**：`buildGovernedTools` 的「注入才注册」在 `tools.ts:5204-5210` 对 `contractCheck`/`evidenceCheck` 已是既有模式；新增 `doc_format` 可落地；无同名工具冲突（全仓 grep 无 `doc_format`）。
- **扁平 schema**：方案要求无顶层 `oneOf/anyOf`、`properties` 非空；Claude/Codex/Pi 的既有工具描述通道（`claude/session.ts:318`、`codex/session.ts:510,693`、`real-adapter.ts:482-496`）可承载。`git_candidate` 的 union `oneOf` 既有事实（`schema.ts:95-101`、`codex/session.ts:693`）与本方案「新工具扁平」约束一致；本方案不修 `dispatch_task`/`git_candidate` 呈空，属已声明范围外。
- **预算/截断**：既有 `CONTRACT_CHECK_MAX_BYTES=4096`、`EVIDENCE_CHECK_MAX_BYTES=4096`、`truncateUtf8`（`tools.ts:231,235,2997`）可复用；索引 4096 B 的可行性见 F14。
- **judge/有界 chief 不变**：`buildGovernanceJudgeTools` 恰三只（`governance-judge/tools.ts:3-16,65-67`）；有界 Chief 只允许 `decide_pending_request`（`codex/session.ts:160-161` 等）；均不经过 `buildGovernedTools`，方案「逐字不变」成立（测试须覆盖）。

### 4.3 可读取性（重点 3）

- **注入矩阵**：桌面 `openRoleSession` 对 `contractCheck` 无条件注入（`app/desktop/session.ts:3850-3851`，能力对象在 `:4341` 传递）；编排 `run-role.ts:2106`、`:3546` 透传；项目角色与内置角色共用同一 `openRoleSession` 路径。方案「6 内置 + 项目角色」的注册论证成立（项目角色的真实存在性见 F10）。
- **发现机制**：工具描述 + Claude/Codex 的 `promptGuidelines`（`claude/session.ts:318`、`codex/session.ts:510`）；Pi 的系统提示不含但工具定义透传（F12）；索引模式不依赖先验 id。方案「工具描述 + promptGuidelines + 索引」作为发现入口，方向成立。
- **不替代既有机制**：不编辑角色卡/技能/派发必读；`contract_check` 三格式原文复用；未注入不注册；与方案 §3.3/§4.5 一致。
- **全员可读的证据口径**：`test/测试/doc-format-all-roles.test.ts` 的「6+1 会话注册 + 数据源返回索引」可证明「可调用」；真实模型实际调用只覆盖产品 + 1 项目角色（Q10），与客户「每个角色都能读取到」的严格解释存在差距，方案 §9.3 第 4 项已列为待确认，建议在 AC 中把「可读取」定义为「已注册且数据源可调用」并由客户/验收确认（见 F10）。

### 4.4 漂移钉住/测试（重点 4）

- **正例/变异/overclaim/扫描/冻结 id/loadChecks**：方案 §3.4 的六层设计（示例正例、必填删除/类型/枚举变异、optional 删除不拒、convention 反证、schema 全仓扫描、冻结 id、loadChecks 负例）方向正确，且 A1 的「意图确认门 vs run pin」分层口径与代码一致（`apply-journal.ts:3313-3332` vs `run-manifest.ts:406-412`）；A2 的「子串 vs frontmatter」分层与代码一致。
- **覆盖缺口**：F6（import 不可行）、F7（part 语义）、F8（B 组 seam）、F9（code 覆盖）会削弱「测试通过 == 校验器一致」的强度；F1 的 `git-quality-report` 若未纳入，schema 扫描会失败或被迫错误白名单。
- **测试 owner/目录**：方案将 pin 测试按角色分目录（`test/编排/`、`test/门禁引擎/`、`test/runtime-core/`、`test/桌面应用/`、`test/测试/`），与 boundary 的目录授权一致；但 `test/编排/doc-format-specs.test.ts` 若覆盖 A17–A21 会涉及门禁/运行时核心私有 parser，建议把 A17–A19 的正例放到 `test/门禁引擎/`、A21 放到 `test/runtime-core/`，`test/编排/` 只测试编排可公开消费的部分（见 F6/F8）。

### 4.5 写集/owner/H1 与并行冲突（重点 5）

- **逐文件 owner 与 boundary §1 核对**（路径层面）：

| 文件 | 方案 owner | boundary §1 依据 | 结论 |
|---|---|---|---|
| `src/common/编排/doc-format-specs.ts`（新） | 编排 | `角色卡/编排/boundary.yaml:79-82` 目录 `src/common/编排/` | 在界内 |
| `test/编排/doc-format-specs.test.ts`（新） | 编排 | `角色卡/编排/boundary.yaml:83-84` 目录 `test/编排/` | 在界内 |
| `src/model/runtime.ts` | 运行时核心 | `角色卡/运行时核心/boundary.yaml` 文件条目 | 在界内 |
| `src/provider/runtime/tools.ts` / `schema.ts` | 运行时核心 | 同上文件条目 | 在界内 |
| `test/runtime-core/doc-format-specs-pin.test.ts`（新） | 运行时核心 | `:47` 目录 `test/runtime-core/` | 在界内 |
| `src/pipeline/orchestration/run-role.ts` | 编排 | `角色卡/编排/boundary.yaml:11-13` 文件条目 | 在界内 |
| `app/desktop/session.ts` | 桌面窗口 | `app/desktop/` 目录（boundary.yaml:14-16） | 在界内 |
| `test/桌面应用/session.test.ts` | 桌面窗口 | boundary.yaml:99 文件条目（但文件不存在，见 F5） | 路径在界内、文件缺失 |
| `test/门禁引擎/doc-format-specs-pin.test.ts`（新） | 门禁引擎 | `角色卡/门禁引擎/boundary.yaml:37` 目录 | 在界内 |
| `test/测试/doc-format-all-roles.test.ts`（新） | 测试 | `角色卡/测试/boundary.yaml:7` 目录 | 在界内 |

- **H1 delta**：按现行 boundary，所有路径均在 Section 1 内，**H1 delta=0 在路径层面成立**；两点保留：F5（`session.test.ts` 是已删除文件，路径在界内但性质是新建）；F6（若选择给 `resolve-role.ts`/`resolve-boundary.ts`/`mcp-declarations.ts` 加公开导出，会扩展到其他角色文件，虽仍可能不触发 H1，但需 owner/协调与写集更新）。`src/common/编排/` 的 boundary purpose 文本把 `handback.ts`/`workflow-preconditions.ts` 列为「稳定公开只读入口」；新增 `doc-format-specs.ts` 若也被视为公开入口，建议按方案 §3.1 的说明与 Governance 确认是否需要文字登记（不改变路径授权）。
- **并行冲突**：事实错误见 F2；真实机械重叠仅 `src/model/runtime.ts`（与 judge 加法类型/共享函数同文件不同区域，串行写），其余本变更文件与 judge/提案卡推荐写集不重叠。串行结论「提案卡修复 → judge → 本变更最后」安全；本变更 §10.3 可保留「最后合并」结论，但须按 F2 更正事实与哈希。

### 4.6 范围限制/Q 清单/风险档位（重点 6）

- **不放宽校验/不改格式**：方案 §5.1 的非目标与代码事实一致；本方案不改任何 parser/validator 接受/拒绝集合（除新增只读文本/测试）；`apply-journal.ts`、`run-manifest.ts`、`workflow-preconditions.ts`、`evidence-check.ts`、`boundary-*.ts`、`amendment-validate.ts` 均不在写集（方案 §5.5/§10.2）。注意 F6 若选择加导出常量会触及部分「不编辑」文件，须重新界定。
- **不替代角色卡必读**：不编辑 `角色卡/**`、不改 `ROLE_CARD_REQUIRED_SECTIONS`、不改 `contract_check`/技能/派发必读；`doc_format` 是补充只读面——与代码现状兼容。
- **内部格式简版**：B 组默认全量展示（Q2/§9.3 第 3 项）会放大索引/上下文成本（F14）；方案已提供「可关闭 B 组索引」的备选，建议在 P1 前定案。
- **风险档位**：T2 建议有 `contract-schema-query` 先例，但本变更新增工具面大于先例；见 F15，建议统筹裁决。
- **Q1–Q12 默认值**：Q1 `doc_format`、Q3 编排侧、Q4 示例+parser、Q5 五层钉住、Q6 不改角色卡、Q7 B 简版、Q8 复用 contractSchemaText、Q9 `doc_format`、Q10 6+1 注册/产品+1 实际调用、Q11 串行、Q12 后续另案——均与意图/预授权方向一致；Q10/Q12 的执行口径见 F10/§9.3 第 4 项。
- **与客户意图差距**：意图第 1 条（不得遗漏被真实解析的格式）→ F1/F4；第 2 条（说明与校验器一致）→ F6/F8/F9；第 3 条（每个角色可读取）→ F10/Q10；第 4 条（不放宽）→ 已满足。方案方向覆盖了意图，但清点与全员读取证据仍需按上述修订。

### 4.7 B1/真实运行（重点 7）

- **§7.4 环境与纪律**：隔离 9223、独立 `--userData`、仓库外目标项目、贪吃蛇 9222/临时根只读不触碰、运行前后检查、预算/停止/证据清单——与 judge 复核 R1.0 认可的 9223 协议一致（judge 复核 `:124` 明确引用本方案 §7.4 作为可对齐协议）。**这部分是本方案较强的一节**。
- **场景一致性**：产品写 `project-intent/v1` 一次写对、意图确认门通过、产品调用 `doc_format` 的证据链设计合理；**6+1 角色注册**可通过会话工具目录证明；但「1 个项目角色真实调用」与「新空目标项目/1 条消息/15 分钟」不一致（F10）。
- **Pi/Codex**：方案明确真实运行只覆盖 Claude + 真实 UI，Pi/Codex 以确定性测试覆盖并如实披露（§9.2 `:711`）；在验收只要求 Claude + UI 的前提下可接受；建议补 Pi 工具描述/guidelines 的确定性断言（F12）。
- **不夸大**：方案 §9.2 明确「不修 dispatch_task/git_candidate 呈空」「约定类只能钉命名/消费」「Pi/Codex 不作真实模型承诺」，边界诚实。

---

## 5. 未检查事项与限制（如实）

1. **未运行测试/真实模型/Electron**：本记录为只读复核；未执行 `node --test`、未启动应用、未运行真实模型；因此方案 §7.3 的基线/回归、§7.4 的真实运行均未验证。F5 的「`session.test.ts` 不存在」来自文件系统只读检查；其删除历史引用自 `docs/acceptance/2026-11-08_session-admission-approval-report-v1.md:153`。
2. **未全量逐行核对每个 parser**：对 25 个 A 行与 23 个 B 行做了抽查/关键行阅读；A1–A13、A17–A21 的字段表主要点已对照代码；B 组部分校验器仅核对锚点，未执行其分支；未构造变异矩阵验证实际拒绝/接受集合。
3. **未验证最终 spec 文本字节**：`doc-format-specs.ts` 尚不存在；F14 的索引预算是按 48 行/50 id 与中文标题的粗估，实际字节以 P1 实现为准；`part`/截断行为未实测。
4. **并行文档为未跟踪活动草案**：judge 方案在本次复核期间从 `fd17edd…` 更新到 `72d36242…`（674 行 / 84,483 bytes），本记录引用以其当前快照为准；judge 复核 `6e98749b…`、fix routing `4e8fb354…`、缺陷记录 `21dfb43c…` 在本次复核时未变。若其后续再变，F2 的事实需以最新版复核。
5. **未验证 `dispatch_task` 呈空机制**：方案 §1.1 已标 [推断]/[待确认] 且明确范围外；本记录不复核该机制。
6. **未验证边界 purpose 文本的治理解释**：`src/common/编排/` 的 purpose 是否要求登记新公开入口，属 Governance 解释；本记录只核对路径授权与 H1 delta。
7. **行号漂移**：部分方案 `file:line` 与当前文件有少量偏移（如 `test/编排/fixtures/trunk-project.ts` 的 A1–A9 样例实际在 `:203-212`，方案写 `:224-229`；`A9/A15` 写 `:228/:229`；`A2` 写 `:225`），按方案头部「以符号名为准」不影响实质；另有 `test/编排/direct-role-capabilities.test.ts:867-876` 等接近但不完全精确。引用时建议以符号/文本锚点为准。
8. **A12 `generatedAt` 容差**：代码允许 `generatedAt` 比 artifact mtime 早 ≤1000ms（`evidence-check.ts:445`），方案写「不得早于」；属表述精度小项，未列为独立 finding。
9. **A24/A22/A10 小项**合并为 F16 suggestion；不阻断。
10. **未检查**：`docs/` 下所有既有格式的实际样例是否都能通过 parser（只抽查了部分测试夹具）；未对 25 个 A 格式逐一运行 parser；未验证 `doc_format` 输出对模型的实际可读性。

---

## 6. 引用快照（本记录写盘时）

- 方案：`docs/planning/2026-11-09_design_document-format-specifications.md` — **786 行 / 99,718 bytes / `0469e2dfa5891174c534c3bca03219724c429096c0fea4892982f1a1ca8f8358`**。
- 意图：`docs/communication/2026-11-09_intent_document-format-specifications.md` — 28 行 / 2,948 bytes / `bf870ae9…ce8d`。
- 预授权：`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md` — 38 行 / 3,418 bytes / `e2bdd96b…011a`。
- 代码：HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`；`git status --porcelain -- src app test` 空；`git diff --stat 65813c9..HEAD -- src app test` 空。
- 并行 judge 方案 P1.1：当前快照 674 行 / 84,483 bytes / `72d3624249a33d84749e7c70fe7b9440326a73efd3fc14684d26ef69a5fab791`（P1.0 历史 `60c68dad…cbc8a`）。
- judge 复核 R1.0：287 行 / 38,867 bytes / `6e98749bd227c6f723e70ace5200d6eaea3c5cebb777ac2ee28f06fe6a3a9b19`。
- 提案卡修复路由：183 行 / 32,508 bytes / `4e8fb3545f3679ee48b397b4c43d1eb4ab517e9b40a7e541b4ba0daf3fa7ea85`。
- 提案卡缺陷记录：48 行 / 5,529 bytes / `21dfb43cfc330dcd19058a42a5e72bd1ea27bda3a264a68770160a0173ba300c`。
- 角色边界：`角色卡/编排/boundary.yaml` `dbabf44f…`、`角色卡/运行时核心/boundary.yaml` `06d087a9…`、`角色卡/桌面窗口/boundary.yaml` `e5af2b30…`、`角色卡/门禁引擎/boundary.yaml` `f580eca0…`、`角色卡/测试/boundary.yaml` `3c8f7e0e…`。

---

**（完）**

---

# 再复核记录（P1.0 → P1.1）

- 版本：**R2，2026-11-09**；ANS 独立复核（Reviewer）独立只读上下文。
- 状态：**复核记录；不是验收结论、不阻断、不实施。** 本次复核未改方案/代码/测试/角色卡/边界；未提交/推送/合并/发布；未运行测试/真实模型/Electron；仅追加本节到本复核记录。
- 复核对象：`docs/planning/2026-11-09_design_document-format-specifications.md` **P1.1**（**932 行 / 137,880 bytes / SHA-256 `34f8ad1bced9e5b41daff2c04de4fafaa67081033a3ca562fb774ab8bf228fc9`**；`wc -lc` 与 `sha256sum` 实测，与任务给定一致）。
- 对照基线（均实测哈希）：意图记录 `docs/communication/2026-11-09_intent_document-format-specifications.md`（28 行 / 2,948 bytes / `bf870ae959772956912006e52c32502476ac787bdb0466d2826abd6b7e56ce8d`）；judge 方案 P1.1（674 行 / 84,483 bytes / `72d3624249a33d84749e7c70fe7b9440326a73efd3fc14684d26ef69a5fab791`，其 §5.1 排除清单与 §10.1 勘误均实测核对）；提案卡修复路由（183 行 / 32,508 bytes / `4e8fb3545f3679ee48b397b4c43d1eb4ab517e9b40a7e541b4ba0daf3fa7ea85`）；提案卡缺陷记录（48 行 / 5,529 bytes / `21dfb43cfc330dcd19058a42a5e72bd1ea27bda3a264a68770160a0173ba300c`）。代码基线 HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`；工作区另有**与本复核无关**的两处未提交修改（`git diff --stat` 仅 `app/desktop/customer-input.ts`、`test/桌面应用/chief-workflow.test.ts`，疑为并行提案卡修复 B 的在飞改动，非本复核所改）；本节所有代码核对均未依赖这两文件。
- P1.0 对照方式（如实限制）：P1.0 为未跟踪文件且已被原地覆盖，本检出无 P1.0 字节可 diff；本节以 R1.0 记录（追加前 363 行 / 54,718 bytes / `ae4c2100b733bf056cb53cb030b7196a945b46b4e7e87a7c88420ed94fd6d294`，F1–F16）与 P1.1 §13 处置表逐项对照。
- 方法：按 R1.0 F1–F16 逐项核对 P1.1 落点；对 P1.1 新增/修改的 `file:line` 与符号以只读方式核对代码（HEAD `c1439ce`）；独立执行 schema 字面量扫描与稳定 code 扫描；核对并行文档写集/串行段。未运行测试/真实模型。

## 1. 结论摘要

**建议提交（进入 B1/团队计划）。** R1.0 的 3 项 must-fix 已全部落实并通过代码事实核对（F1：A14 严格层；F2：§10 并行写集与串行；F3：54 行 / 54 id 与 `schemaLiteral` 单值）；F4–F16 的处置方向与落点成立。本轮**未发现新的 must-fix**；剩余 **4 项 general**（G1–G4，其中 G1 为 F11 残余、G2 为 F9 残余）与 **4 项 suggestion**（S1–S4）。这些均为 B1/实施期应修正或澄清的锚点性/测试设计问题，不改变方案方向、不新增放行面、不放宽任何校验。R1.0 结论「修订后提交；F1–F3 修订前不建议进入实施派发」的前置条件已满足。

## 2. F1–F16 逐项核对

| # | R1.0 严重度 | P1.1 落点（本文件行） | 本轮核对结论（依据） |
| --- | --- | --- | --- |
| F1 | must-fix | §0.4-1、§2.2 A14、§2.4 A14、§2.5、§3.4 #1/#4、AC-1/AC-3/AC-4 | **已落实**。`readTextQualityProof`（`apply-journal.ts:1899-1940`）与三处调用（`:1982,2749,2768`）实测一致；`meta.schema !== "git-quality-report/v1"` 在 `:1911`；键集恰为 `schema/version/taskId/runId/flowId/candidateOperationId/candidate/criteria/checks`（未知键拒）；`checks` 恰 1 项且恰两键、`artifact` 恰三键、`assertion:"nonempty-utf8"`；7 个 `review-quality-*` code 全部存在（report-missing/binding-invalid/execution-unproven/scope-unproven/checks-missing/check-invalid/content-mismatch）；A14 `schemaLiteral=git-quality-report/v1`；展示层 `project-state.ts` 文件名/版本扫描（`QUALITY_REPORT_RE` `:69`、`scanQualityReports :501-524`）与 judge 摘录（`governance-judge-evidence.ts:553-561`）属实；A14 seam 引用的 e2e 锚点 `:277-280`（版本断言）与 `:710`（合成物证）属实；仓库内无 `docs/quality` 样例亦属实。 |
| F2 | must-fix | §5.5、§10.1–10.3、AC-16、§0.4-3 | **已落实**。judge P1.1 §5.1 写集为 10 个产品文件（`model/version-change.ts`、`model/runtime.ts`、`apply-journal.ts`、`freeze-service.ts`、`version-change-service.ts`、`guard-freeze-registry.ts`、`trunk-runtime.ts`、`version-change-runtime.ts`、`task-state.ts`、`classify-shell.ts`），排除清单明确不含任何 `app/desktop/*` 与 `run-role.ts`；与 §10.1/§10.2 一致。fix routing 推荐 A′（`apply-journal.ts` + `test/编排/direct-role-capabilities.test.ts`）明确「不改 `run-manifest.ts`、不写 manifest」（`:75`），B 为 `app/desktop/customer-input.ts` + `test/桌面应用/chief-workflow.test.ts`（`:112-115`）；仅未采纳备选 A 才改 `run-manifest.ts`（`§10.2` 已注明条件）。真实机械重叠仅 `src/model/runtime.ts`；串行「提案卡修复（A′→B）→ judge → 本变更」与 judge P1.1 §10 建议一致（judge `:656`）。P1.0 误述勘误已在 §10.1 第三项以 [事实] 记录，并承诺随提交知会统筹/沟通。 |
| F3 | must-fix | §2.3、§2.3 表注、§3.2、§3.3 #3、AC-1/AC-3、§3.4 #4–#5 | **已落实**。表 A 25 行（A1–A25）、表 B 29 行（B1–B29），共 **54 行 / 54 个 id / 54 个 spec**，一行一 id；B21–B24 为四个独立 spec，代码字面量逐一核实：`role-authorization/v1`（`apply-journal.ts:3200`、`classify-shell.ts:539`）、`role-activation/v1`（`apply-journal.ts:3203`、`classify-shell.ts:531`）、`stable-initial-workflow/v1`（`classify-shell.ts:348`、`apply-journal.ts:1146`、`git-trunk-store.ts:295,1270`）、`stable-initial-workflow-source/v1`（`classify-shell.ts:108,309`、`trunk-store.ts:233`、`stable-snapshot.ts:53`、`git-command.ts:423`）。`schemaLiteral` 单值成立（`team-plan/v3`、`quality-report/v1`、`version-baseline/v1`、`download-consumer/v1`、`operation-delivery/v1` 的字面量关系均由 `schemaLiteralNote`/表注说明）；AC-1 冻结清单 deepEqual 与 AC-3 三层策略可表达（白名单完整性见 S2；数据模型字段见 G3）。 |
| F4 | general | §2.1 #7、§2.3 B6/B26–B29、§2.6、§3.4 #4 | **已落实**。B26 `versions.jsonl`（`versioned-doc-guard.ts:243-246` 路径常量、`:368-421` `parseVersionBaselineState`；`v=1/flowId/doc/version/path/sha256/recordedAt/recordedBy/event` 与 `frozen` 行 `freeze` 校验、`baseline-corrupt`/`baseline-missing`/`marker-missing` 均属实）；B27 `download-consumer.json`（`consumer-epoch-store.ts:22-45` 的 `missing/unreadable(invalid-json/not-an-object/version-mismatch/enabledAt-invalid/appVersion-invalid)/ready`、路径 `download-consumer-epoch.ts:9-10` 属实）；B28 `deliveries/*.json`（`guard-freeze-registry.ts:1080-1096`；`key` 校验与 `delivery-record-corrupt` 属实）；B29 `git-mode.json`（`git-trunk-store.ts:723` 写 `{media:"git-ref/v1",repoId,ref,journalId}`、`:1096-1108` 选择/迁移、`:1246` 写 `{media,repoId,migrationOperationId}`、`git-command.ts:921` 存在性⇒`required` 属实）；legacy `apply-journal.json` 已并入 B6（`fs-trunk-store.ts:240` `TRUNK_JOURNAL_REL`、`:649-650` `isTrunkApplyJournalShape`）。§2.6 排除项锚点属实：`docs/audit/shell-gate.jsonl` 仅写不读（`shell-audit.ts:25,159`、`shell-post-audit.ts:331`，全仓仅写入/路径常量，无结构读取）；`chief-workflow/v1` 应用内资源（`tools.ts:175-191`）；`git-initialization/v1` 存储媒体标识（`trunk-store.ts:188-195`、`git-command.ts:94-99`）；`git-ref/v1` 由 B29 覆盖。 |
| F5 | general | §3.1、§6.1 #9、§6.2、§7.3、§9.3-6 | **已落实**。`test/桌面应用/session.test.ts` 实测不存在；`角色卡/桌面窗口/boundary.yaml:99` 与 `角色卡/桌面窗口/boundary.md:39` 仍列出该文件；删除提交 `4c24149`、验收报告 `docs/acceptance/2026-11-08_session-admission-approval-report-v1.md:153` 记录属实。P1.1 已改「新建（恢复已删除路径）」、路径在 Section 1（H1 delta 0）、§7.3 基线不含该文件。 |
| F6 | general | §3.1、§3.3 #3、§3.4 #4、§6.2 备选、§7.1、AC-3/AC-17 | **已落实（机制）**。三层策略（公开常量 import / 内联副本 + owner pin 测试 / 跨角色私有常量经 owner 侧 pin 交叉断言）覆盖 R1.0 指出的不可行点；私有常量锚点属实：`ROLE_CARD_REQUIRED_SECTIONS`（`governance-roles.ts:351-362`）、boundary `KINDS/ROOTS/TOP_KEYS`（`boundary-yaml.ts:12-15`）、MCP `NAME_PATTERN/RESERVED_NAMES/ENV_NAME_PATTERN`（`mcp-declarations.ts:54-58`）；owner pin 测试目录（`test/门禁引擎/`、`test/runtime-core/`）均在边界内。 |
| F7 | general | §3.2、§3.3 #1、§4.1、§7.1、AC-8 | **已落实**。render 型（modules/roster/topology）`part` 一律整段返回并在首行标注「该格式复用原文，整段返回」；非 render 型仍按字段/样例/错误裁剪；测试断言与文档一致。 |
| F8 | general | §2.3.1、§3.2 `testSeam`、§3.4 #1、§7.1、AC-17 | **已落实**。B1–B29 每个 id 均有 seam 类型（B11–B13/B16/B19、B21/B22、B23/B24 在表中合并行，但每个 id 的 seam 类型相同、可逐 id 登记）；A14 严格层给出服务级夹具/源码文本 seam；`text-shape` 行残余风险在 §9.2 披露。 |
| F9 | general | §2.4 A3/A4、§3.4 #6/#8、§7.1、AC-7 | **部分落实（残余 G2）**。A3/A4 的「普通模块 paths 仅 1 项」跨层口径属实（`workflow-preconditions.ts:901-905`，`roster-module-directory-invalid`），`modules-doc-*` 10 个 code 全列属实；但 A4 标注「全量口径」仍缺 10 个实际 `RosterErrorCode`，且 §3.4 #8 的稳定 code 收集正则覆盖不到这些后缀族（详见 G2）。 |
| F10 | general | §7.4、§7.2 AC-12、§8 Q10、§9.3-4 | **已落实**。§7.4 预置 1 个已激活项目角色（准备不计客户消息/墙钟预算）+ 项目角色直连查询；预置不可行时回落为「会话注册 + 数据源可调用」并如实标注；AC-12、Q10、§9.3-4 口径互相对齐（墙钟 ≤20 分钟）。 |
| F11 | suggestion | §3.1 行 7、§6.1 #7、§13 F11 | **部分落实（残余 G1）**。`model/runtime.ts` 的 `GovernedToolsOptions`（`:3450`）与 `contractCheck`（`:3522`）属实；但 `run-role.ts` 侧仍写错：`:875` 是 `openRoleSession` 输入（匿名类型）的 `contractCheck`，不是 `AdapterCapabilities`；`AdapterCapabilities` 在 `:304-438`（`contractCheck` 在 `:409`）；`RoleSessionDeps`（`:3470-3473`）仅含 `createAdapter?`/`runtimeOptions?`。详见 G1。 |
| F12 | suggestion | §4.3、§9.1、§7.1 | **已落实**。`real-adapter.ts` 的 `toPiTool`（`:482-496`）逐工具透传 `promptGuidelines`，`bindRole`（`:1589` 附近）复制 guidelines；`renderSystemPrompt`（`:372-383`）不拼接 promptGuidelines 的表述属实；§7.1 已加 `toPiTool(describeTool("doc_format"))` 断言。 |
| F13 | suggestion | §3.3 #1、§7.1、AC-2 | **已落实**。复用 `contractSchemaText` 原文前加来源说明行；`includes(contractSchemaText(topic))` 断言保留；`CONTRACT_MODULES_SCHEMA_TEXT` 首行确含 `contract_check topic=…`（`workflow-preconditions.ts:180-182`），加说明行的处理方向正确。 |
| F14 | suggestion | §3.2、§4.1、§4.4、§8 Q14、§9.1 | **已落实**。索引上限 8192 B、详情 ≤8192 B，全处一致；保留「P1 实测 + 超限按 stage 汇总」路径；Q14 备选记录 4096 B 仅作对照。 |
| F15 | suggestion | 头部、§6.3、§8 Q13、§9.4 | **已落实**。T2 改为「建议、待统筹裁决」；升档条件含 F6 公共出口与「新增工具面/凡触 Model 公共工具契约即 T3」的统筹口径。 |
| F16 | suggestion | §2.2 A10/A22/A24、§2.4 A10/A22–A25 | **已落实**。A24 标 `audience:"app-managed"`；A22 改「无校验器、仅摘录」（`governance-judge-evidence.ts:567-585` 实为摘录）；A10 注明 `parseAmendmentSnapshot` 以 `allowNoop=true` 调 `validateDocShape`（`amendment-validate.ts:339`）属实。 |

## 3. 剩余问题与建议

### G1（general，F11 残余）`run-role.ts` 透传面仍写错：`RoleSessionDeps` 与 `openRoleSession` 输入/`AdapterCapabilities` 锚点

**位置**：§3.1 表格「编排透传」行 `:442`、§6.1 第 7 行 `:637`、§13 F11 行 `:918`。

**事实（HEAD `c1439ce` 只读核对）**：
- `RoleSessionDeps`（`src/pipeline/orchestration/run-role.ts:3470-3473`）仅含 `createAdapter?: RuntimeAdapterFactory` 与 `runtimeOptions?: RuntimeAdapterFactoryOptions`；它不承载 `contractCheck` 一类的会话能力位，向它加 `docFormat?` 不会到达适配器。
- 会话能力位的真实入口是 `openRoleSession` 的输入（匿名类型，`contractCheck?: ContractCheckFn` 在 `:875`，`evidenceCheck` 在 `:877`）；`openRoleSession` 在多轮路径构造 `const capabilities: AdapterCapabilities`（`:2080` 起）并用 `...(input.contractCheck !== undefined ? { contractCheck: input.contractCheck } : {})`（`:2106`）透传。
- `AdapterCapabilities` 接口从 `:304` 起至 `:438` 止，其 `contractCheck` 在 `:409`（P1.1 §3.1 把 `contractCheck` 记为 `:875`，归属错误）。
- 工厂把 `capabilities?.contractCheck` 映射进 `RuntimeAdapterOptions` 在 `:3546`。

**影响**：按现写集实施，可能把 `docFormat?` 加到 `RoleSessionDeps`（死字段）而漏加 `openRoleSession` 输入字段；桌面在输入对象里传 `docFormat` 后不会进入 `AdapterCapabilities`，工具静默不注册（会话/集成测试会失败；若实现者尝试读取 `input.docFormat`，typecheck 也会报错）。属 B1 输入表的锚点缺陷，不构成放行风险。

**建议**：把 §3.1/§6.1/§13-F11 的该行改为「`openRoleSession` 输入加 `docFormat?: DocFormatFn`（`:875` `contractCheck` 相邻）+ `AdapterCapabilities.docFormat?`（接口 `:304-438`，`contractCheck` 在 `:409`）+ 两处透传（`:2106`、`:3546`）」；不要把 `RoleSessionDeps` 列为 docFormat 承载面。

### G2（general，F9 残余）A4「全量口径」仍缺 10 个 parser code；稳定 code 扫描的正则覆盖不到这些族

**位置**：§2.4 A4「parser 错误码（全量口径）」`:260`、§0.4-5、§3.4 #8 `:545`、§7.1 稳定 code 扫描行 `:679`、AC-7。

**事实**：
- `workflow-preconditions.ts:378-410` 的 `RosterErrorCode` union 含下列 10 个未出现在 A4 清单中的码：`roster-role-builtin`、`roster-role-duplicate`、`roster-directory-invalid`、`roster-directory-governance`、`roster-directory-overlap`、`roster-module-directory-governance`、`roster-module-directory-overlap`、`roster-module-unbound`、`roster-role-without-module`、`roster-module-multi-owner`（其中 `roster-role-builtin`/`roster-role-duplicate` 等有直接 `rosterError(...)` 调用点，如 `:743,:745`）。
- §3.4 #8 的收集口径为「形如 `xxx-invalid|xxx-missing|xxx-stale|xxx-drift|xxx-mismatch|xxx-corrupt`」；`modules-doc-*`（frontmatter/yaml/schema/flow/version/modules/id/fields/directory/overlap）与上述 `-builtin`/`-duplicate`/`-unbound`/`-multi-owner`/`-overlap`/`-governance`/`-without-module` 均不匹配该后缀集合，扫描不会收集它们。
- 方案称「P2 先以 A3/A4/A14 与新增 B 行为种子」可缓解，但若种子仍是按上述正则的自动收集，则 F9 想防的「parser 有码而规范漏列」恰在这些族上不生效。

**影响**：F9 的机械防护（稳定 code 扫描）在其最需要的 `modules-doc-*`/`roster-*` 家族上存在盲区；A4 的「全量口径」属 overclaim。

**建议**：二选一或并用——① 把扫描收集改为「显式 code 全集」：对已知 validator 模块（`workflow-preconditions.ts` 等）的 `*ErrorCode` union / code 字面量做结构化枚举，而非仅按后缀正则；② 在 §3.4 #8 明说种子为手工维护的全码清单并同步补全 A4 的 10 个码（或注明这些码的归属/可达性）。

### G3（general）`DocFormatSpec` 缺 `validator` 字段，§7.1 的完整性断言与 §3.2 详情头无法按现模型实现

**位置**：§3.2 数据模型 `:461-497`（`DocFormatValidatorRef` `:461-466`；`DocFormatSpec` `:481-497`）；§3.2 详情渲染 `:506`（头部含「校验器锚点」）；§7.1 规范完整性 `:672`（「每个 spec 有 title/audience/path/**validator**/specRevision」）。

**事实**：`DocFormatValidatorRef`（kind/file/symbol/note）已定义但未被 `DocFormatSpec` 任何字段使用；`DocFormatSpec` 只有 `testSeam`/`fields`/`loadChecks` 等，没有校验器锚点字段。因此「每个 spec 有 validator」无法写成类型级/数据级断言，详情头部也取不到锚点来源。

**建议**：在 `DocFormatSpec` 增加 `validator?: DocFormatValidatorRef`（或 `validators?: readonly DocFormatValidatorRef[]`，A14 分层可用两条），并同步 §7.1/AC-1 的完整性断言与 §3.2 渲染顺序。

### G4（general，低）§3.4 #7 直接喂 `INTENT_ENTRY_TEMPLATE` 给 `summarizeIntent` 与其实际判定不自洽

**位置**：§3.4 #7 `:544`、§3.4 #1 `:531`（「示例字符串只定义一次；测试不得另写夹具副本」）、§2.4 A13 `:343`（「模板；占位符必须替换」）、AC-4。

**事实**：`INTENT_ENTRY_TEMPLATE`（`intent-entry-contract.ts:26-37`）的 `intentId`/`flowId` 等值均为占位符文本（如 `<小写 slug；全文唯一；不得用 flowId 代替>`、`<flowId>`）；`summarizeIntent`（`governance-judge-intent.ts:200-260`）对非空 `intentId`/`flowId` 与定位结果不一致即返回 `intent-ambiguous`。把模板原样喂给 `summarizeIntent` 并断言 `ok` 无法通过（除非测试用占位符字符串构造 reference，那又不是合法 slug/flowId）。这与 §2.4 A13 自己「占位符必须替换」以及 §3.4 #1「example 即测试输入」相互矛盾。

**建议**：在 spec 中给 A13 一个填充后的具体最小样例（如 `intentId: demo-intent`、`flowId: demo`）作为 `example` 供 parser 正例；`INTENT_ENTRY_TEMPLATE` 仅作为「格式模板」引用并注明测试前必须替换占位符（或在 §3.4 #7 明说替换规则，不算「另写夹具副本」）。

### S1（suggestion）§4.2 `docFormatText` 的返回形状与 `contractCheckText`「同型」表述不一致

**位置**：§4.2 `:579`（「`docFormatText` 方法与 `contractCheckText` 同型：`… return {ok:true, text: docFormatIndexText()}`」）、§4.1 `:565`（失败 `{ok:false, message}`）。

**事实**：`contractCheckText` 实为 `Promise<string>`（`app/desktop/session.ts:10271`）；工具包装在 `makeContractCheckTool`（`tools.ts:3101-3181`）把字符串包成 `{ok:true, message}`、空/异常包成 `{ok:false, message}`。若 `docFormatText` 返回 `{ok:true,text}` 对象，按同款包装会落入「数据源未返回格式说明」。建议统一为「数据源返回 `string`；`makeDocFormatTool` 负责预算/截断与 `{ok:true,message}` 包装」，或明确写出新返回类型与包装差异。

### S2（suggestion）schema 字面量扫描白名单未列举 `version-change-service/v1`、`chief-hub-resume/v1`

**位置**：§3.4 #4 `:541`、§2.1 #1 `:97`。

**事实**：独立扫描 `src/**/*.ts` 的 `"[a-z][a-z0-9-]*/v[0-9]+"` 字面量共 38 个；除 54 id 覆盖者与白名单 `chief-workflow/v1`、`git-initialization/v1` 外，另有 `version-change-service/v1`（`src/service/version-change/public/version-change-service.ts:20`，模块公开契约版本）与 `chief-hub-resume/v1`（`apply-journal.ts:2156`，`directHash` 域分隔标签）匹配扫描正则且不在注册表内。§3.4 #4 的「白名单含理由」只列了两项，AC-3 的「全仓字面量扫描无遗漏」需把这两项显式列入（理由：模块契约版本 / 哈希域标签，非项目文档格式），或把「非文档 key/文件名」展开为可复核清单。

### S3（suggestion）§2.5 对 A2 同时列入「严格解析/形状校验」与「只做字面量比对」

**位置**：§2.5 `:414-415`。

**事实**：`:414` 写「严格解析/形状校验：A1–A5…」，`:415` 又写「只做 schema/frontmatter 字面量比对：A2（仅 schema + intent/正文含路径）、A6、A7」。A2 同时落在两类。建议改为分层表述（如「A2：roster 加载为子串匹配、upgrade/pin 为 frontmatter 严格比对」），避免两处口径冲突。

### S4（suggestion）P1.0 历史字节未保留，与版本记录「保留在版本记录中」的表述有出入

**位置**：头部版本记录 `:20`、§12 文档规则 `:894`。

**事实**：P1.0 为未跟踪文件且被 P1.1 原地覆盖，本检出无其字节（无 VCS 历史）；R1.0 记录保存了 P1.0 的哈希与 F1–F16，但无法做 P1.0↔P1.1 逐字 diff。建议在后续版本把「P1.0 作为历史版本保留」改为「P1.0 内容以 R1.0 记录与 §13 处置表为准（字节未保留）」，或将策划稿纳入可追溯存放；不影响 P1.1 的实质评审。

## 4. 本轮已核实项（摘要）

- **清点与 id**：表 A 25 行/25 id、表 B 29 行/29 id，合计 54/54；无重复 id；`54` 在 §0.2/§0.4-2/§2.1 #6/§2.2 表注/§2.3 表注/§3.4 #5/§7.1/AC-1/§11 P1 一致；无残留「48 行/50 id」计数（仅 §13 F3 历史描述保留）。
- **schema 字面量映射**：38 个实测斜杠字面量逐一对照 54 id 与白名单（除 S2 的两项外全部覆盖）；`teamPlanSchema:3` 为公开常量 `TEAM_PLAN_SCHEMA`（`workflow-preconditions.ts:35`）；`v:1`/`version:1`/无 schema 的 id 由冻结清单与 `schemaLiteralNote` 覆盖。
- **A14 严格层**：见 §2 F1 行；另核实 `git-quality-report/v1` 仅存在于 `apply-journal.ts:1911`，e2e 合成夹具在 `test/测试/git-role-workflows-e2e.test.ts:710`（另有同型 e2e 文件亦有合成，不影响结论）。
- **其余 A 格式锚点抽查**：A1 `prepareIntentConfirmation :3313-3332`（`schema !== "project-intent/v1"` 在 `:3324`）与 `run-role.ts:1616-1618` 的 `declined/notPresented` 属实；A2 子串匹配 `:1316-1330`；A3 `parseProjectModules :984-1116`；A4 `parseProjectRoster :686-981`、`loadLatestRoster :1171-1345`、`roster-reference-stale :1238-1246`；A5 `validateRosterTopology :532-663`；A8 `parseTeamPlan :60-112`、run pin 仅 `-team-v1.md`（`run-manifest.ts:569`）、`apply-journal.ts` 的 `completeTeamPlan :2824-2916` 与三处执行读取 `:3411,3527,3781`；A9 flow 校验 `:579-597`；A10 见 F16；A11 `parseCriteriaText :191-273`、`loadCriteria :276-301`；A12 `evidence-check.ts:328-370/:373-529`，`generatedAt` 1000ms 容差在 `:445`；A13 `summarizeIntent :200`、模板 `:26-37`；A17 `parseSnapshotRoleDocuments`（`boundary-core.ts:76-110`）的 10 章节与 `#{1,6} 空白` 匹配（`:85-87`）、`boundary-md-yaml-mismatch` 恒等（`:95-99`）；A18/A19 `boundary-parse.ts:75`、`boundary-yaml.ts:46` 与 `:44-45` 单一 parser 注释；A20 `installed-skills.ts:94-112/:194-263`；A21 `mcp-declarations.ts:122-180/:182-246/:248-300`。
- **B 组锚点抽查**：B4 `apply-journal.ts:2875-2879` 精确（marker `:2875-2876`、plan-completions 路径 `:2877`、prepareSnapshot `:2878-2879`）；B6 `git-command.ts:33-40`、`model/trunk.ts:17,322`、`fs-trunk-store.ts:87-121,240,650`；B16 常量 `model/project-state.ts:12`；B17 `buildProjectStateView`（`project-state.ts:759`）；B18 `buildGovernanceMatrixWith :505`/`buildGovernanceMatrix :556`；B20 `apply-journal.ts:1039,1105` 精确（两处 `repository-work-source/v1` 校验）、`fs-trunk-store.ts:228`、`chief/internal/dispatch.ts:42,53`；B25 `loadEffectiveConfig`（`config-loader.ts:318`）。
- **测试锚点**：`test/编排/fixtures/trunk-project.ts:203-212`（A1–A15 样例逐行对应）；`test/编排/evidence-check.test.ts:25-38,119-170,222-225`；`test/编排/workflow-preconditions.test.ts:43-58,1007-1145`；`test/编排/direct-role-capabilities.test.ts:867-876`；`test/测试/git-write-chain-fixture.ts:363`；`test/测试/git-role-workflows-e2e.test.ts:277-280,710`。
- **写集/边界**：§6.1 各路径均在现有 Section 1（`角色卡/编排/boundary.yaml:11-13,79-84`、`角色卡/桌面窗口/boundary.yaml:99`、`角色卡/门禁引擎/boundary.yaml:37`、`角色卡/运行时核心/boundary.yaml:47`、`角色卡/测试/boundary.yaml:7`）；新增文件不产生 H1 delta；测试侧跨角色 import 有既有先例（如 `test/门禁引擎/decision-card.test.ts` 引 `src/common/编排/decision-card.ts`）。
- **F2 并行事实**：judge P1.1 §5.1 的 10 文件写集与排除清单、§10 的串行建议、fix routing 的 A′/B 写集与「不改 `run-manifest.ts`」均已按当前快照（`72d36242…`/`4e8fb354…`）核对一致；P1.1 §10.1 第三项的勘误记录存在（P1.0 误述 judge 改 `app/desktop/*`/`run-role.ts` 与对方 §5.1 相反）。
- **Q 清单/残余**：Q1–Q14 与 §9.1–9.4 无新增冲突；F10 预置口径、F14 预算、F15 档位、F16 小项均已同步到 AC/§7.4/§13；§9.2 的残余（A14 严格层、B 组 text-shape、render 型 part）与新增 seam 表一致，无需另行升档。

## 5. 限制与未检查（如实）

1. 未运行测试/真实模型/Electron，未实施；§7.3/§7.4 的可执行性只做了文本与锚点核对。
2. P1.0 字节不可得（见 S4）；本节对 P1.0→P1.1 的「修订」判断基于 R1.0 记录与 P1.1 §13，而非逐字 diff。
3. 未逐行核对全部 54 个 spec 的每个字段（spec 文本尚不存在，`doc-format-specs.ts` 未实现）；B 组 B11–B19 等仅沿用 R1.0 抽查结论，本轮未逐一复核其分支。
4. 并行 judge 复核记录在磁盘上的当前快照已非 R1.0 时哈希（现为 362 行 / 52,462 bytes / `de1d0281d9fb6a309a5e231b095aec068bc77bb86e3bc9ad85b8931be430da7d`；头部仍标 R1.0）；其 F1 勘误内容（围绕 `app/desktop/*`/`run-role.ts` 的误述）仍存在（`:57-73`），P1.1 的引用实质成立；但 P1.1 所引 `6e98749b…` 快照已不在本检出。
5. 行号为 HEAD `c1439ce` 快照；并行变更合并后可能漂移，方案与本节均以符号/文本锚点为准。
6. 工作区基线不完全等于 HEAD：`git diff --stat` 显示 `app/desktop/customer-input.ts` 与 `test/桌面应用/chief-workflow.test.ts` 存在未提交修改（非本复核所改；疑为并行提案卡修复 B 的在飞改动）。本节引用的所有 `file:line` 均在未修改文件中核对（`session.ts`/`run-role.ts`/`apply-journal.ts`/`workflow-preconditions.ts` 等）；对 fix routing 的核对只依据其路由文档与 judge 方案，不依赖上述两文件的工作区字节。

## 6. 写盘与快照

- 本复核记录原有节（1–363 行）逐字未改；本节为追加。
- 追加前文件：363 行 / 54,718 bytes / `ae4c2100b733bf056cb53cb030b7196a945b46b4e7e87a7c88420ed94fd6d294`。追加后的行数/字节/SHA-256 见交付回执（自引用会改变哈希，故不写入本节内）。
- 本节只写本复核记录；方案、代码、测试、角色卡、边界均未改；未提交/推送/合并/发布。（工作区中 `app/desktop/customer-input.ts`、`test/桌面应用/chief-workflow.test.ts` 的未提交修改为本复核开始前已存在/并行在飞的改动，非本复核所改，见 §5-6。）

---

**（完）**
