# 变更记录：每个文档格式的权威说明与全员可读（T2）——B1 规范注册表批次（编排）

- 日期：2026-11-09；角色：编排（ANS 固定角色，独立上下文）。
- 工作目录：`C:\Users\51054\Desktop\work\ans-studio\.claude\worktrees\trunk-amendment`（git worktree）。
- 基线（实施前后一致）：分支 `feat/document-format-specifications`；HEAD `3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`；`git status --porcelain -- src app test` 实施前 = 0；实施后 = 仅本批 2 个新文件（untracked）。
- 依据：团队计划 `docs/scheduling/2026-11-09_team-plan_document-format-specifications.md` §三/§四/§五；方案 P1.2 `docs/planning/2026-11-09_design_document-format-specifications.md`（`886fef84…`）§2.2/§2.3/§2.3.1/§2.4/§3.1–§3.4/§4.1–§4.6/§7.1/§9.2/§10/§11；B1 v1 `docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md`（`bec45edf…`）§2.1（写集 1/2）、§3.1–§3.7、§4.1、§7、§9；复核 R1.1 `docs/planning/2026-11-09_review_document-format-specifications.md`（`2cbe6919…`）§1。
- 范围：只写本角色 Section 1 内文件——`src/common/编排/doc-format-specs.ts`（新建）、`test/编排/doc-format-specs.test.ts`（新建）、本记录、本角色证据目录。**未修改**任何 parser/validator（`workflow-preconditions.ts`/`run-manifest.ts`/`evidence-check.ts`/`boundary-*.ts`/`amendment-validate.ts`/`upgrade-validate.ts` 等）、`app/**`、`src/model/**`、角色卡/边界/`docs/**`；未提交/推送/合并/发布；未运行真实模型/Electron；未占用 9222/9223。

## 1. 交付物

| # | 文件 | 类型 | 行数 | 字节 | 原始 SHA-256 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/common/编排/doc-format-specs.ts` | 新建 | 2294 | 100,605 | `3c0c9c63ba99ad09adb379858595618b833ff20406429d46bc8160514e49bf86` |
| 2 | `test/编排/doc-format-specs.test.ts` | 新建 | 1693 | 101,313 | `54e5b01ab47c59f091ec2c9617b5209b6e3b254fe2aa757ec211455166aa2e94` |

- numstat（`git diff --no-index --numstat -- /dev/null <file>`）：`2294/0`、`1693/0`（新增/删除）。
- 候选聚合（`path + "\0" + sha256`，按路径排序后 SHA-256）：**`f6d4475ce676c55ebf462d144a58ae38ba0477a983c98ca1b1a4b266a3b3bb0f`**。
- 写集外 `src app test` diff = 0（仅上述 2 个 untracked 新文件；`git diff --stat -- src app test` 为空）。

## 2. 模块结构与数据模型（`doc-format-specs.ts`）

- 公开导出：`DOC_FORMAT_SPEC_VERSION = "doc-format-specs/v1"`、`DocFormatAudience`/`DocFormatValidatorRef`/`DocFormatFieldSpec`/`DocFormatTestSeam`/`DocFormatSpec`、`DOC_FORMAT_SPECS`、`docFormatIndexText()`、`docFormatSpecText(id, part?)`、`docFormatKnownIds()`（另导出 `DocFormatPart`/`DocFormatPresence` 类型）。
- 数据：**54 个 spec，一行一 id（A1–A25 + B1–B29）**，每个含 `title/audience/stage/pathPattern/schemaLiteral?/schemaLiteralNote?/validator/fields/loadChecks?/commonErrors/example?/exampleKind?/render?/testSeam?/specRevision`；`specRevision` 全为 1（初版）。
- 审计字段：`enforcement: "validator" | "convention"` 与真实解析器一致；分层格式（A1/A2/A3-A4/A14）用 `presence:"conditional"` + note 记录每层口径。
- 单一来源/复用：
  - 公开常量直接 import：`PROJECT_ROSTER_SCHEMA`/`PROJECT_MODULES_SCHEMA`/`PROJECT_TOPOLOGY_SCHEMA`/`PROJECT_PROPOSAL_SCHEMA`/`TEAM_PLAN_SCHEMA`（`workflow-preconditions.ts`）、`RUN_*`（`run-manifest.ts`）、`CRITERIA_SCHEMA`/`EVIDENCE_META_SCHEMA`（`evidence-check.ts`）、`CUSTOMER_DIRECTIVE_SCHEMA`、`DOWNLOAD_REQUEST_SCHEMA`、`PROJECT_STATE_SCHEMA`/`VERSION_DECISION_SCHEMA`、`TRUNK_*`/`COMPLETE_SNAPSHOT_SCHEMA`、`VERSION_CHANGE_SCHEMA`/`DOC_FREEZE_SCHEMA`/`STABLE_WRITE_SCHEMA`/`REFACTOR_REQUEST_SCHEMA`（`model/*`）。**例外（D1 后修复，见 §9）**：`governance-matrix/v1` 为架构隔离格式（`test/测试/governance-matrix-integration.test.ts` allowedConsumers 不允许 `src/common/编排/` 消费），B18 使用唯一字面量副本 `"governance-matrix/v1"`，**不 import** `src/model/governance-matrix.ts` 的公共常量；由 B18 pin/测试与全仓扫描钉住。
  - modules/roster/topology：`render: () => contractSchemaText(topic)` 同源原文；详情前加来源行「以下为 contract_check 同源原文（只读展示；本工具不构成放行/授权）」；`part` 不细分、整段返回并标注「该格式复用原文，整段返回」。
  - intent-entry：详情内嵌 `INTENT_ENTRY_TEMPLATE`/`INTENT_ENTRY_NAMING_RULE`/`INTENT_ENTRY_ID_RULE` 原文；A13 `example` 为 §2.4 的**填充后样例**（非占位符模板）。
  - 内联/无导出常量（`run-repin/v1`、`team-plan-completion/v1`、`role-authorization/v1`、`role-activation/v1`、`repository-work-source/v1`、`stable-initial-workflow*/v1`、`doc-freezes/v1`、`git-quality-report/v1`、`git-ref/v1`）由 spec 持有唯一副本，测试/全仓扫描钉住。
- 渲染：
  - 索引首行 `doc_format（只读；不构成放行/授权；doc-format-specs/v1）`；按 `stage` 分组，每行 `- <id> — <title>（<audience>）`；末行提示 `format=<id>` 与 `part=fields|example|errors`。
  - 详情顺序：头部（id/title/audience/stage/路径/schema/校验器锚点）→ 字段表（强制/约定分栏）→ 加载级与错误码 → 最小样例 → 常见错误 → `specRevision`。
  - 未知 id：纯文本「未知格式 <x>；可用：…」，回显 ≤40 字符；非字符串 id 防御性 `String()`，不抛。
- 纯数据/纯渲染：模块不 import `node:fs`、不 import `app/`/`service/`、不读写盘（测试以源码文本断言）。

## 3. 54 个 id 清单（注册表顺序；与冻结清单 deepEqual）

A 组（25）：`project-intent/v1`, `project-proposal/v2`, `project-modules/v2`, `project-roster/v3`, `project-topology/v2`, `project-architecture/v1`, `project-assets/v1`, `team-plan/v3`, `flow-yaml/v1`, `trunk-amendment/v1`, `ans-criteria/v1`, `evidence-meta/v1`, `intent-entry/v1`, `quality-report/v1`, `workflow/v1`, `contract-md/v1`, `role-card/v1`, `boundary-md/v1`, `boundary-yaml/v1`, `skill-install/v1`, `mcp-declaration/v1`, `change-package/v1`, `role-change-record/v1`, `bootstrap-manifest/v1`, `verification-attachment/v1`。

B 组（29）：`ans-run/v1`, `run-change/v1`, `run-repin/v1`, `team-plan-completion/v1`, `trunk/v1`, `trunk-apply-journal/v1`, `trunk-amendment-static/v1`, `doc-freeze/v1`, `doc-freezes/v1`, `complete-snapshot/v1`, `version-change/v1`, `stable-write/v1`, `refactor-request/v1`, `customer-directive/v1`, `download-request/v1`, `version-decision/v1`, `project-state/v1`, `governance-matrix/v1`, `task-state-event/v1`, `repository-work-source/v1`, `role-authorization/v1`, `role-activation/v1`, `stable-initial-workflow/v1`, `stable-initial-workflow-source/v1`, `project-config/v1`, `version-baseline/v1`, `download-consumer/v1`, `operation-delivery/v1`, `git-mode/v1`。

- 关键口径：A14 `schemaLiteral = git-quality-report/v1`（严格层）+ 展示层约定；A24 `audience:"app-managed"`；A22 `validator.kind:"convention"`（仅摘录）；B7 `trunk-amendment-static/v1` 与 A10 共用 `trunk-amendment/v1` 字面量；B25/B26/B27/B28/B19 无斜杠 schema 字面量（`schemaLiteralNote` 注明 `project-config/v1` 工具枚举名、`version-baseline/v1` 行内 `v:1`、`download-consumer/v1` `version:1`、`operation-delivery/v1` 无 schema 字段、`task-state-event/v1` kind 判别事件流）。

## 4. 预算实测（P1/Q14）

- 索引：**5,223 B**（`Buffer.byteLength`，≤8192 B；54 id 全量可发现，无需 stage 汇总）。
- 最大详情：**4,089 B**（`project-roster/v3`，`part=all`；≤8192 B）。其余 spec/part 均 ≤8192 B（测试逐 spec × 4 part 断言）。

## 5. 测试结构（`test/编排/doc-format-specs.test.ts`）

25 个 top-level 用例（24 个初始 + 1 个 D1 后新增 pinned-literal 用例，见 §9）覆盖 TM-1–TM-9：

1. TM-1 冻结 id 清单 54 个 deepEqual/唯一/一行一 id/三处数量一致。
2. TM-1 每 spec 必填元数据；schemaLiteral 单值/note。
3. TM-1 B 组 29 行 + A14 均有 testSeam（kind/说明/残余披露）。
4. TM-1 预算 ≤8192 B + 首行/末行提示。
5. TM-1 模块纯数据（无 `node:fs`/`app/`/`service/`/读写盘）。
6. TM-1 未知 id 纯文本、回显 ≤40 字符、非字符串不抛。
7. TM-6 modules/roster/topology 详情 `includes(contractSchemaText(topic))` + 来源行 + render 型 part 整段。
8. TM-6 intent-entry 复用模板/命名/ID 规则；A13 填充样例经 `summarizeIntent` ok。
9. TM-2 A 组样例正例（A1–A13、A17–A21，经真实 parser/validator）。
10. TM-2 A14 严格层 text-shape（键集/错误码/绑定字段存在于 `apply-journal.ts`；不宣称纯校验器正例）。
11. TM-2 B 组 exported-pure seam 正负例。
12. TM-2 B 组 public-path-fixture seam（B2/B3/B17/B25/B27/B28）。
13. TM-2 B 组 text-shape seam（逐行 schema 字面量/锚点符号/残余风险）。
14. TM-3 字段变异矩阵（数据驱动：18 个 A 组可执行 spec、113 个 validator 字段、9 个枚举字段；删除/null/类型/枚举，按 presence 断言）。
15. TM-3 分层断言 A1（门/ pin）、A2（子串 vs frontmatter）、A3/A4（paths 1–20 vs 普通模块恰 1）、A14（strict/display）。
16. TM-3 条件/专项负例（A2 intent、A3/A5 path+paths、A6 正文、A10 modify 缺 from、A19 条件目录缺 condition）。
17. TM-4 overclaim guard（34 个 convention 字段：违反值仍被接受或有显式豁免理由）。
18. TM-5 schema 字面量全仓扫描（`src/**/*.ts` 的 `xxx/vN` ∈ schemaLiteral ∪ 规范 id ∪ 显式白名单含理由）。
19. TM-8 稳定 code 扫描（按 code 族，含非后缀成员；∈ spec commonErrors/loadChecks ∪ 白名单含理由）。
20. TM-9 加载级负例：roster-*/modules-doc-*/run-pin-*（含 `loadLatestRoster`、`prepareRunPin`、`repinPinnedRun` 真实夹具）。
21. TM-9 加载级负例：plan-*/criteria-*/evidence-*/trunk-amendment-*（含 `completeTeamPlan` 前置分支、`parseCriteriaText`/`loadCriteria`、`checkEvidence`、`validateAmendment`）。
22. TM-9 加载级负例：role-card-section-missing / boundary-md-yaml-mismatch 与 review-quality-* 残余披露。
23. TM-9 MCP 声明负例（name-invalid/reserved-name/declaration-missing/declaration-parse-failed）。
24. TM-9 覆盖核对：每个 loadCheck code 已复现或有显式豁免理由；关键 code 族至少一个负例。
25. （D1 后新增）TM-1/AC-3 pinned-literal 例外：`governance-matrix/v1` 由规范持有唯一副本、不 import 被架构隔离的 `model/governance-matrix.ts`，其它公开常量仍 import（详见 §9）。

### 5.1 样例正例结果

- A1–A13、A17–A21 全部经真实解析器/校验器 `ok`（A13 为填充样例；A14 按 text-shape seam，不冒充纯校验器）。
- B 组按 §2.3.1 `testSeam` 逐行执行：`exported-pure`（B1/B5/B6/B7/B8/B9/B10/B11/B12/B13/B16/B19/B26）直接调用导出校验器；`public-path-fixture`（B2/B3/B17/B25/B27/B28）构造最小公开路径夹具；`text-shape`（B4/B14/B15/B20/B21/B22/B23/B24/B29）仅源码文本/形状断言并在规范 `testSeam.note` 披露残余风险。

### 5.2 字段变异/overclaim/扫描/负例结果（摘要）

- 变异矩阵：每个 validator 字段的删除/null/类型替换（枚举字段另加非法枚举值）按 `presence` 断言；`optional` 删除 ⇒ ok；`conditional` 字段与文本结构字段在显式豁免表中逐项给理由（如 A1 schema 分层、A2/A3/A5 path 条件字段、A19 condition 仅条件目录、行式键值登记无类型表达、A10 baseTrunk 可空）。
- overclaim：34 个 convention 字段全部有反证用例或显式豁免（约定型/仅摘录/应用写类格式无校验器可拒绝）。
- schema 扫描：`src/**/*.ts` 全部 `xxx/vN` 字面量 ∈ 注册表 ∪ 白名单（`chief-workflow/v1`、`git-initialization/v1`、`version-change-service/v1`、`chief-hub-resume/v1`、`doc-format-specs/v1`，各含理由）；`git-quality-report/v1`=A14、`git-ref/v1`=B29 不靠白名单。
- 稳定 code 扫描：166 个命中 code 全部 ∈ 规范 ∪ 白名单（含理由）；关键族（`modules-doc-*` 全 10 个、`roster-*` 主体含 `roster-role-builtin/duplicate`、`roster-directory-*`、`roster-module-unbound`、`roster-role-without-module`、`roster-module-multi-owner`、`criteria-*`、`trunk-amendment-*`、`review-quality-*`）必须出现在规范（不靠白名单）。
- 加载级/主错误码负例：roster-*/modules-doc-*/run-pin-*/criteria-*/evidence-*/trunk-amendment-*/role-card-section-missing/boundary-md-yaml-mismatch/plan-identity-invalid/plan-store-unavailable 均以最小夹具复现并断言稳定 code。

## 6. 验证记录

### 6.1 新增测试（before/after）

- **before**：`test/编排/doc-format-specs.test.ts` **不存在**（本批新建；基线命令不包含该文件）。
- **after**（`node --test --test-concurrency=1 test/编排/doc-format-specs.test.ts`，Node v24.22.1，Windows 11）：
  - run1：`# tests 25 / # pass 25 / # fail 0 / # cancelled 0 / # skipped 0 / # todo 0`，exit 0；TAP：`角色卡/编排/docs/change/2026-11-09_W1_document-format-specifications/test-doc-format-specs.tap.txt`，SHA-256 `a3b5a58e37bb524bc0be866d132c1a535b605fb0a396b355b27bffdf916a4307`。
  - run2（稳定性复跑）：`25/25/0/0/0`，exit 0；TAP：`.../test-doc-format-specs.run2.tap.txt`，SHA-256 `9a9eabbe55ee55b5a321823a3277a6e61d5948b1c63d3dae4a3a1e43807ea7fa`。两日志哈希不同仅因 TAP 含逐用例 `duration_ms`；计数/失败集合逐字一致。
- 未新增 `skip`/`todo`/force-exit/watchdog；无删除/弱化既有断言。

### 6.2 受影响既有套件（只读回归）

| 命令 | 计数（tests/pass/fail/skipped） | 日志 |
| --- | --- | --- |
| `node --test --test-concurrency=1 test/编排/workflow-preconditions.test.ts` | 29/29/0/0，exit 0 | `.../workflow-preconditions.tap.txt` |
| `node --test --test-concurrency=1 test/编排/run-manifest.test.ts` | 12/12/0/0，exit 0 | `.../run-manifest.tap.txt` |
| `node --test --test-concurrency=1 test/编排/evidence-check.test.ts` | 10/10/0/0，exit 0 | `.../evidence-check.tap.txt` |

### 6.3 typecheck

- `npm run typecheck`（`tsc --noEmit`）：**exit 0**；日志 `.../typecheck.txt`。本批新增模块/测试未引起其它文件报错。

## 7. 限制与残余（如实披露）

1. **A14 严格层无导出纯校验器**：本批按 B1/方案 seam 以源码文本钉住键集/错误码（`apply-journal.ts`），不宣称纯校验器正例；残余「测试通过但校验器另有分支」风险。
2. **B 组 text-shape 行**（B4/B14/B15/B20/B21/B22/B23/B24/B29）：仅钉住已核实的 schema 字面量/锚点/错误码文本，不宣称与运行时逐分支一致；残余风险已在各 spec `testSeam.note` 披露。
3. **plan-* loadChecks 部分未在 service 层复现**：`plan-structure-invalid`/`plan-path-invalid`/`plan-base-conflict`/`plan-owner-invalid`/`plan-hash-drift` 需要真实 trunk manifest/快照夹具（B4 text-shape seam）；本批以 `parseTeamPlan` 结构负例与 `completeTeamPlan` 前置分支（`plan-identity-invalid`/`plan-store-unavailable`）替代，`LOADCHECK_EXEMPTIONS` 逐项给理由；未伪造 service 级码。
4. **review-quality-***：无纯校验器可复现负例，仅源码文本 + 规范收录 + 残余披露（同 1）。
5. **union 保留成员**：`roster-directory-invalid/governance/overlap`、`roster-role-without-module` 等存在于 `RosterParseError` 联合但当前 `parseProjectRoster` 无生产分支；规范按 §2.4 全量口径收录，测试不作可达性声明。
6. **render 型 part 不细分**（modules/roster/topology）：`part` 整段返回同源原文；细分需改 `workflow-preconditions.ts`（写集外，另案）。
7. **行式文本/分层差异**：intent-entry 的 YAML null/数值被行式解析读作文本；A12 collection 非数组值被忽略；A19 condition 仅对 conditional-directory 生效；A10 `baseTrunk:null` 可空——均在字段 note/矩阵豁免中如实记录，未放宽任何 parser。
8. 未运行真实模型/Electron；`doc_format` 工具层（运行时核心/桌面/跨角色）不在本批（P3/P4），本批只交付规范注册表与其一致性测试。
9. 未提交/推送/合并/发布；`src app test` 写集外 diff = 0。

## 8. 证据目录

`角色卡/编排/docs/change/2026-11-09_W1_document-format-specifications/`
- `test-doc-format-specs.tap.txt`、`test-doc-format-specs.run2.tap.txt`
- `governance-matrix-integration.tap.txt`（D1 修复后）
- `workflow-preconditions.tap.txt`、`run-manifest.tap.txt`、`evidence-check.tap.txt`
- `typecheck.txt`

（TAP/日志均为本批同一候选、同命令、Node v24.22.1 的原始输出；未做任何拼接。）

## 9. D1 后修复（2026-11-10，编排）

### 9.1 失败（D1 增量回归）

- `test/测试/governance-matrix-integration.test.ts` T1-20/21「矩阵模块不被门禁/派发/冻结/trunk 导入」：**before 18/18 pass → after 17/18 fail**（隔离复跑 0/1 复现）。失败原文：
  `AssertionError [ERR_ASSERTION]: 矩阵模块不得被非授权消费方导入：src/common/编排/doc-format-specs.ts`（`actual: ['src/common/编排/doc-format-specs.ts']`，`expected: []`）。
- 本地复现命令：`node --test --test-concurrency=1 test/测试/governance-matrix-integration.test.ts`（同一失败）。

### 9.2 根因

- `doc-format-specs.ts` 为取 `GOVERNANCE_MATRIX_SCHEMA` 直接 `import { ... } from "../../model/governance-matrix.ts"`；该集成测试的 `allowedConsumers`（`:1139-1162`）不允许 `src/common/编排/` 消费 `governance-matrix`（架构隔离规则）。
- 规范注册表本可持有**唯一字面量副本**（schema 扫描可钉住），无需 import 被隔离模块。

### 9.3 修复（仅规范与其测试/记录）

1. 删除 `GOVERNANCE_MATRIX_SCHEMA` 唯一 import；B18 `governance-matrix/v1` 的 `schemaLiteral` 改为唯一字面量副本 `"governance-matrix/v1"`，并新增 `schemaLiteralNote` + 源码注释：由规范持有唯一副本；`src/model/governance-matrix.ts` 的公共常量为架构隔离，不得被 `src/common/编排/` 导入；由 B18 pin/测试与全仓扫描钉住。
2. 新增测试用例「TM-1/AC-3 pinned-literal 例外」：断言模块源码不含 `governance-matrix` 的 import 且不含 `GOVERNANCE_MATRIX_SCHEMA`；B18 `schemaLiteral` 严格等于 `"governance-matrix/v1"` 且 note 说明唯一副本；以源码文本断言 `src/model/governance-matrix.ts` 的 `GOVERNANCE_MATRIX_SCHEMA = "governance-matrix/v1"` 与副本相等；并断言其它 21 个公共常量（`PROJECT_*`/`RUN_SCHEMA`/`RUN_CHANGE_SCHEMA`/`CRITERIA_SCHEMA`/`EVIDENCE_META_SCHEMA`/`VERSION_CHANGE_SCHEMA`/`DOC_FREEZE_SCHEMA`/`STABLE_WRITE_SCHEMA`/`REFACTOR_REQUEST_SCHEMA`/`CUSTOMER_DIRECTIVE_SCHEMA`/`DOWNLOAD_REQUEST_SCHEMA`/`PROJECT_STATE_SCHEMA`/`VERSION_DECISION_SCHEMA`/`TRUNK_*`/`COMPLETE_SNAPSHOT_SCHEMA`）仍直接 import（不弱化既有单一来源策略）。
3. 未修改 `test/测试/governance-matrix-integration.test.ts`、其它产品/测试/角色卡/边界/文档。

### 9.4 重测（同一候选、同环境）

| 命令 | before | after | 日志/哈希 |
| --- | --- | --- | --- |
| `node --test --test-concurrency=1 test/编排/doc-format-specs.test.ts` | 24/24/0/0（修复前） | **25/25/0/0**，exit 0 | `test-doc-format-specs.tap.txt` SHA-256 `a3b5a58e37bb524bc0be866d132c1a535b605fb0a396b355b27bffdf916a4307`；复跑 `9a9eabbe55ee55b5a321823a3277a6e61d5948b1c63d3dae4a3a1e43807ea7fa` |
| `node --test --test-concurrency=1 test/测试/governance-matrix-integration.test.ts` | **17/18 fail**（复现） | **18/18 pass / 0 fail / 0 skip**，exit 0 | `governance-matrix-integration.tap.txt` SHA-256 `345d27d7c28d56fe5270410536c290277fa25710ab8bf33d829e0036ce8de90d` |
| `npm run typecheck` | — | exit 0 | `typecheck.txt` |
| `test/编排/workflow-preconditions.test.ts` / `run-manifest.test.ts` / `evidence-check.test.ts` | 29/29、12/12、10/10 | 同前（未受影响，重跑同结果） | 同名 TAP |

### 9.5 修复后候选身份（最终）

- `src/common/编排/doc-format-specs.ts`：2,294 行 / 100,605 B / SHA-256 `3c0c9c63ba99ad09adb379858595618b833ff20406429d46bc8160514e49bf86`。
- `test/编排/doc-format-specs.test.ts`：1,693 行 / 101,313 B / SHA-256 `54e5b01ab47c59f091ec2c9617b5209b6e3b254fe2aa757ec211455166aa2e94`。
- 聚合（`path\0sha256` 排序串联）：`f6d4475ce676c55ebf462d144a58ae38ba0477a983c98ca1b1a4b266a3b3bb0f`；numstat `2294/0`、`1693/0`。
- 预算不变：索引 5,223 B；最大详情 4,089 B（`project-roster/v3` all）。
- 写集外 `src app test` diff 仍为 0（**编排写集内**仅上述 2 个新文件 + 本记录/证据目录）。说明：D1 复验时共享 worktree 已出现其它角色 P3/P4 的在飞修改（`app/desktop/session.ts`、`src/model/runtime.ts`、`src/pipeline/orchestration/run-role.ts`、`src/provider/runtime/{tools,schema}.ts` 及 `test/runtime-core/`、`test/桌面应用/`、`test/测试/`、`test/门禁引擎/` 下的新测试），**非本角色写集、不计入本候选**；本候选身份以上述 2 文件 hash/聚合为准。HEAD 仍为 `3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`；未提交/推送/合并。
