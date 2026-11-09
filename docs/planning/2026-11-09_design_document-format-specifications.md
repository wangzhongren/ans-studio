# 每个文档格式的权威说明与全员可读：方案（P1.2）

- 版本：**P1.2 小修，2026-11-09**；ANS 策划（Planning）独立上下文。P1.1 依据独立复核 R1.0（`docs/planning/2026-11-09_review_document-format-specifications.md`，F1–F16）修订；P1.2 依据窄复核 R2（G1–G4/S1–S4）小修。**P1.0/P1.1 原文未被保留（同一路径原地更新且文件未跟踪）**：历史说明见版本记录；P1.0 规模/哈希以 R1.0 复核记录 §0 引用为准（786 行 / 99,718 bytes / `0469e2dfa5891174c534c3bca03219724c429096c0fea4892982f1a1ca8f8358`），P1.1 规模/哈希以本轮交付回执/复核记录引用为准。
- 状态：**窄复核结论「建议提交（进入 B1/团队计划），must-fix 0」；P1.2 为窄复核 G1–G4/S1–S4 的处置小修，待确认后派发。未实施、未测试、未验收、未提交/推送/合并、未运行真实模型。** 相对 P1.1 仅原地更新本文件，未改代码/测试/角色卡/边界/其它文档。
- 风险档位：**建议 T2，待统筹裁决（F15）**。理由：本变更只新增**只读**说明查询面（静态文本 + 可发现入口）与一致性测试，不改任何解析/校验规则、不放宽任何门禁、不新增写路径/权限/验收语义；但新增一个对所有角色会话可见的工具，并触碰共享 Model（加法类型）、Provider 工具契约与桌面会话注入。新增工具面大于「给既有工具加可选参数」的 T2 先例，最终档位由统筹裁定，不以方案自评定档（§9.4）。
- 依据（本检出，只读复核）：
  - 意图记录：`docs/communication/2026-11-09_intent_document-format-specifications.md`（28 行，SHA-256 `bf870ae959772956912006e52c32502476ac787bdb0466d2826abd6b7e56ce8d`；客户原话「每个文档格式要给说明，并且让每个角色都能读取到」）。
  - 独立复核（R1.0）：`docs/planning/2026-11-09_review_document-format-specifications.md`（363 行 / 54,718 bytes / SHA-256 `ae4c2100b733bf056cb53cb030b7196a945b46b4e7e87a7c88420ed94fd6d294`；3 must-fix F1–F3、7 general F4–F10、6 suggestion F11–F16；结论「建议修订后提交；F1–F3 修订前不建议进入实施派发」）。
  - 预授权：`docs/communication/2026-11-07_preauthorization_proceed-without-gates.md`（闸门 1/2 免逐次确认；实质变化须停下回报）。
  - 同日并行变更（分别记账、避免同文件冲突）：`docs/communication/2026-11-09_intent_judge-delegated-decision-effectiveness.md`（SHA-256 `d084b5ffeb522a68f6ece21fd2eb486a1a075afa360e0fae46ce84f72d6b6f6f`；方案 `docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`）与 `docs/communication/2026-11-09_defect_proposal-card-run-binding.md`（SHA-256 `21dfb43cfc330dcd19058a42a5e72bd1ea27bda3a264a68770160a0173ba300c`）。
  - 并行文档当前快照（P1.1 只读核对，用于 §10）：judge 方案 **P1.1** `docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`（674 行 / 84,483 bytes / SHA-256 `72d3624249a33d84749e7c70fe7b9440326a73efd3fc14684d26ef69a5fab791`；其 §5.1 明确**不改 `app/desktop/*`、不改 `run-role.ts`**）；提案卡修复路由 `docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md`（183 行 / 32,508 bytes / SHA-256 `4e8fb3545f3679ee48b397b4c43d1eb4ab517e9b40a7e541b4ba0daf3fa7ea85`；推荐 A′ **不改 `run-manifest.ts`**；B 改 `test/桌面应用/chief-workflow.test.ts`）。
  - 代码基线：git worktree `.claude/worktrees/trunk-amendment`，HEAD `c1439ce57430ef783b80a01bb6e6437fcb20cabd`。本文所有 `file:line` 均为该快照只读核对结果；实施以符号名与文本锚点为准（并行变更合并后行号可能漂移）。
  - 窄复核（R2，独立复核上下文交付，未落盘为独立记录）：对 P1.1 的窄复核结论「建议提交（进入 B1/团队计划），must-fix 0」；处置项 G1–G4/S1–S4 见 §14。
  - 真实运行只读事实：贪吃蛇运行根 `C:\Users\51054\Desktop\work\ans-game2d-snake-run-2026-11-09`（本文不触碰；真实运行验收改用隔离端口 **9223**，见 §7.4）。
- 标记约定：**[事实]** 已只读核实的代码/文档行为；**[推断]** 基于代码但未经真实运行证实；**[待确认]** 需复核或客户确认；**[设计候选]** 本方案提议、未实施。

**版本记录**

| 版本 | 日期 | 变更摘要 | 状态 |
| --- | --- | --- | --- |
| P1.0 | 2026-11-09 | 初稿：现状与两处真机观测（含工具 schema 呈空的只读核实与范围切分）、全量格式清点（角色可写 + 应用内部）、单一事实来源设计（`doc-format-specs` + 只读 `doc_format` 工具）、可读取性/预算/回落、非目标与不变量、写集/owner、测试与验收（含 9223 隔离真实运行标准）、Q 清单、并行变更冲突与串行安排 | 草案（历史；原文被 P1.1 原地覆盖、未跟踪；规模/哈希见 R1.0 复核记录 §0） |
| P1.1 | 2026-11-09 | 按独立复核 R1.0 F1–F16 修订：A14 quality report 改分层（git 严格层 + 展示层）；B21/B22 拆分并补 B26–B29，清点定为 **54 行 / 54 个 spec**；§10 按 judge P1.1/提案卡修复真实写集重写；`testSeam`/私有常量三层钉住/render 型 part 整段语义/稳定 code 扫描；`session.test.ts` 改「新建（恢复已删除路径）」；§7.4 预置项目角色并调整预算；索引预算 ≤8 KiB；T2 改「建议、待统筹裁决」；新增 §13 复核处置记录 | 修订版（历史；已被 P1.2 窄复核小修） |
| P1.2 | 2026-11-09 | 按窄复核 R2 处置 G1–G4/S1–S4：透传面更正为 `openRoleSession` 输入 + `AdapterCapabilities`；A4 补 10 个 `roster-*` 码并扩稳定 code 扫描族；`DocFormatSpec` 增 `validator`；A13 加填充样例；`docFormatText` 与 `contractCheckText` 同型；白名单补 `version-change-service/v1`/`chief-hub-resume/v1`；A2 分层归类；P1.0/P1.1 保留措辞修正；新增 §0.5 与 §14 | 修订版；待确认进入 B1 |

---

## 0. 摘要（先读这段）

### 0.1 问题

1. **真实运行**：贪吃蛇运行中，产品写 `project-intent/v1` 第一版**缺少 frontmatter `schema` 字段**，意图确认门（`prepareIntentConfirmation`）直接拒绝（`trunk-item-invalid`），造成一次返工；同一轮运行中幕僚报告 `dispatch_task`/`git_candidate` 的参数 schema 在会话里呈空。
2. **根因不是单点**：应用真实解析/校验的文档格式很多（版本化治理文档、team plan、flow、修正案、验收标准/证据 sidecar、角色卡、两份边界、技能登记、MCP 声明、内部状态文件等），但**没有权威、完整、与校验器一致的说明**；现有说明散落在 `contract_check` 的三个 topic、角色卡片段、错误文案与各角色私有实现里，覆盖不全、无单一来源、无测试钉住。
3. **可读取性**：没有任何机制保证**所有内置治理角色与项目角色**都能在写文档前读到这些格式说明；技能（skill）需安装且按角色 id 登记，项目角色 id 是动态的，不适合作为全员通道。

### 0.2 推荐设计（一句话）

在**解析器同一侧**建立一个纯数据/纯渲染的**单一事实来源** `src/common/编排/doc-format-specs.ts`（字段表 + 最小合法样例 + 校验器锚点 + 常见错误；三个既有 `contract_check` topic 直接复用原文，不复制）；新增**只读工具 `doc_format`**（无参数返回格式索引；`format=<id>` 返回该格式权威说明；`part` 可选缩小范围），由桌面在**所有内置治理角色与项目角色**会话注入——工具描述与 `promptGuidelines` 即全员可发现入口，不改角色卡/不改现有必读机制；测试用真实解析器/校验器把「说明 == 校验器」逐项钉住（合法样例必过、必填删除/枚举变异必拒、约定字段反证必过、schema 字面量全仓扫描无遗漏），并规定 `specVersion`/`specRevision` 的版本演进。

### 0.3 本方案不做

不放宽/收紧任何校验；不改任何文档格式；不建第二份漂移说明（不生成 `docs/format-specs` 之类副本）；不替代角色卡/技能/派发必读等既有机制；不修 `dispatch_task`/`git_candidate` 的工具 schema 呈现问题（既有 `tools/list` union 事实，另案）；不改 judge 代批与提案卡修复的并行文件（串行安排见 §10）；不触碰贪吃蛇运行（9222/其临时根）。

### 0.4 P1.1 修订摘要（对应直接复核 R1.0 F1–F16）

1. **清点准确性（F1）**：A14 `quality-report/v1` 改为**分层格式**——git 质量复核路径存在严格 frontmatter 校验（`apply-journal.ts:1899-1940` `readTextQualityProof`，`schema:"git-quality-report/v1"`、精确键集/绑定字段、`review-quality-*` 拒绝，三处调用），已纳入字段表/错误码/schema 扫描；展示层（文件名/版本扫描 + judge 摘录）保留并注明关系。
2. **清点自洽（F3/F4）**：B21/B22 合并行拆为 B21–B24 四个独立 spec；新增 B26–B29 内部格式（`versions.jsonl`、`download-consumer.json`、`deliveries/*.json`、`git-mode.json`），legacy `apply-journal.json` 并入 B6；显式排除 `docs/audit/shell-gate.jsonl`、`chief-workflow/v1`、`git-initialization/v1`（§2.6）。最终清点：**54 行 / 54 个 id / 54 个 spec（A25 + B29）**，一行一 id，`schemaLiteral` 单值自洽。
3. **并行协调（F2）**：§10 按 judge 方案 P1.1（`72d36242…`）与提案卡修复路由（`4e8fb354…`）重写：judge **不含** `app/desktop/*` 与 `run-role.ts`，与本变更真实机械重叠仅 `src/model/runtime.ts`；提案卡修复 A′ **不改** `run-manifest.ts`，B 改 `app/desktop/customer-input.ts` + `test/桌面应用/chief-workflow.test.ts`；串行建议「提案卡修复 → judge → 本变更」，以协调方裁决为准。
4. **单一来源可落地（F6/F7/F8）**：schema 字面量改**三层策略**（公开常量 import / 内联副本 + owner pin 测试 / 跨角色私有常量经 owner 侧 pin 测试交叉断言）；render 型（modules/roster/topology）`part` 改整段返回 + 说明；B 组新增 `testSeam` 字段与 §2.3.1 逐行 seam 表。
5. **字段表完整（F9）**：A3/A4 补「普通模块 paths 仅 1 项」及全量 parser/加载错误码；新增稳定 code 扫描测试。
6. **真实运行可执行（F10）**：§7.4 预置 1 个已激活项目角色（准备不计客户消息/墙钟预算），产品 + 项目角色各一次真实调用；预置不可行时回落为「注册 + 数据源调用」证据并如实标注；AC-12/Q10 同步。
7. **既有事实修正（F5/F11/F12/F13/F16）**：`session.test.ts` 按「新建（恢复已删除路径，路径已在边界 §1，H1 delta 0）」处理；类型面归属改为 `GovernedToolsOptions.docFormat?`（`model/runtime.ts`）+ `openRoleSession` 输入 `docFormat?`/`AdapterCapabilities.docFormat?`（`run-role.ts`；P1.2 依 G1 更正）；Pi 的 promptGuidelines 表述更正；`contractSchemaText` 复用加来源说明行；A24 标 `app-managed`、A22 改「无校验器、仅摘录」、A10 注 no-op 快照例外。
8. **预算与档位（F14/F15）**：索引上限 4096 B → **8192 B**（P1 实测；超限按 stage 汇总），详情仍 ≤8192 B；T2 改「建议、待统筹裁决」。

### 0.5 P1.2 窄复核修订摘要（G1–G4 / S1–S4）

1. **G1**：写集/透传面更正为 `openRoleSession` 输入字段（`contractCheck :875`）+ `AdapterCapabilities`（`:304-438`，`contractCheck :409`）+ 透传 `:2106/:3546`；`RoleSessionDeps`（`:3470`）仅 `createAdapter`/`runtimeOptions`，**不加** `docFormat`。
2. **G2**：A4 补 10 个 `roster-*` 错误码；稳定 code 扫描按 code 族收集（含 `modules-doc-*` 与上述码族），白名单含理由。
3. **G3**：`DocFormatSpec.validator` 字段落地（`DocFormatValidatorRef`；convention 型用 `kind:"convention"`）。
4. **G4**：A13 提供**填充后**的具体样例（非占位符模板），§3.4 #7/§7.1 用它喂 `summarizeIntent`。
5. **S1**：`DocFormatFn`/`docFormatText` 与 `ContractCheckFn`/`contractCheckText` 同型（纯文本返回）；工具包装层统一 `{ok:true,message}`/`{ok:false,message}`。
6. **S2**：schema 扫描白名单补 `version-change-service/v1`（服务契约版本）与 `chief-hub-resume/v1`（哈希域标签）。
7. **S3**：§2.5 把 A2 仅列「字面量比对（不属严格解析）」并说明分层口径。
8. **S4**：P1.0/P1.1 原文未被保留的措辞更正为「历史说明 + 复核记录引用」。

---

## 1. 问题与现状

### 1.1 真实运行观测（[事实]，来自意图记录与同日缺陷/方案记录）

- **观测 A（意图文档 schema 缺失）**：产品写 `project-intent/v1` 第一版缺 frontmatter `schema: project-intent/v1`；意图确认卡被门禁拒绝、需要一次返工（意图记录 §背景）。
  - 对应校验器：`src/service/trunk/impl/apply-journal.ts:3313-3332`（`prepareIntentConfirmation`）。`frontmatter` 解析后要求 `shape.schema === "project-intent/v1"`（`:3324`）；不满足即 `trunk-item-invalid`（`:3314`），编排把卡标为 `declined / notPresented`（`src/pipeline/orchestration/run-role.ts:1616-1618`）。
- **观测 B（工具参数 schema 呈空）**：幕僚报告 `dispatch_task`/`git_candidate` 的参数 schema 在会话里呈空。
  - **已核实的既有事实（仅 `git_candidate`）**：union 型 Zod 注册的 `tools/list` 输出 `{type:"object",properties:{}}`；修复前后一致，校验在服务端 Zod（`docs/acceptance/2026-11-09_claude-git-candidate-fix-report-v1.md:92`；`角色卡/Claude适配器/docs/fix/2026-11-09_fix_claude-git-candidate-call-context-evidence/impl/implementation-summary.md:63,87`）。根因形状：`git_candidate` 的公共 schema 为 `{ type: "object", oneOf: [...] }`（`src/provider/runtime/schema.ts:95-101`），顶层没有 `properties`；`tools/list` 处理器原样返回该 inputSchema（`src/provider/codex/session.ts:693`）。
  - **`dispatch_task` 呈空的原因 [推断]/[待确认]**：其公共 schema 是**扁平对象**（`src/provider/runtime/schema.ts:614-732`，有 `properties`、`additionalProperties:true`、`not`/`allOf` 条件），与 union 形状不同；既有记录未单独核实其呈空机制（可能是某运行时/展示层的条件关键字剥离、或幕僚描述不精确）。**本变更不修这两个工具的 schema 呈现**；本变更只约束**新工具**必须是扁平对象（§4.6），避免重蹈 union 顶层 `oneOf` 的可读性问题。
- **共同根因（本变更要解决的）**：角色在**写之前**没有权威格式说明可读；错误只能在**写之后**从门禁拒绝文案反推。

### 1.2 现有格式说明散落在哪里（[事实]）

| 位置 | 覆盖 | 缺口 |
| --- | --- | --- |
| `contract_check` `topic: modules/roster/topology`（`src/common/编排/workflow-preconditions.ts:180-259`；工具 `src/provider/runtime/tools.ts:3101-3169`；注册 `:5206-5208`；描述 `src/provider/runtime/schema.ts:792-817`） | 仅 3 个格式；已有字段表 + 最小合法 YAML + 加载级硬拒绝；示例由真实 parser 测试钉住（`test/编排/workflow-preconditions.test.ts:1007-1145`） | 其余格式无说明；且只在**角色主动查**时可见 |
| 内置角色卡/规格文本（`src/common/门禁引擎/governance-roles.ts`、`src/common/roles/*`） | 零散字段名（如策划卡产物行）、su 卡的边界 YAML 片段（`src/common/门禁引擎/boundary-core.ts:282-330` 区域） | 无类型/必填/枚举/版本/示例；只覆盖该角色自己的产物；非权威 |
| 意图入口契约（`src/common/shared/intent-entry-contract.ts:27-37`，模板与命名规则） | `docs/intents/<intentId>.md` 的 frontmatter 模板 | 不含 `project-intent/v1` 等产品文档 schema |
| 错误文案/机械拒绝表（`src/common/编排/mechanical-rejection.ts`） | 失败后 code→owner/下一步 | 事后信息；不是写前说明 |
| 技能机制（`docs/skills/<name>/install.md` + `SKILL.md`；`src/common/编排/installed-skills.ts:94-263`） | 可按角色注入指针 + 运行期 digest | 需安装且按**角色 id 列表**登记；项目角色 id 动态；技能内容若手写即第二份漂移副本 |
| 各解析器实现 | 事实上的唯一权威 | 角色不可直接读源码；字段/枚举/错误散落在多个文件 |

### 1.3 为什么现有机制不够（目标）

- **覆盖**：至少 50+ 个被真实解析/校验的格式（§2 清点 54 个），现有 `contract_check` 只覆盖 3 个。
- **权威**：说明必须与**实际校验器**一致；不能照抄历史设计（已知历史设计与解析器有漂移，例如 `category` 长度、治理路径判定，见 `docs/planning/2026-11-03_design_contract-schema-query.md:741`）。
- **全员可读**：所有内置治理角色（chief/product/rapporteur/nominator/convener/verifier，含旧 su）与**项目角色**都要能读到；不依赖安装、不依赖动态角色登记。
- **不漂移**：单一事实来源；测试钉住；无第二份手写说明。
- **不放宽**：说明只解释既有拒绝规则，不改变接受/拒绝集合（意图记录 §理解与范围第 4 条）。

### 1.4 目标（用户可见结果）

1. 任何角色在写文档前可调用 `doc_format` 拿到：格式 id、路径/版本规则、**校验器级**字段表（必填/可选/类型/枚举/别名）、**加载级**跨文件约束与错误码、最小合法样例、常见错误与修复；照抄样例可通过对应解析器。
2. 产品按说明一次写对 `project-intent/v1`（含 `schema: project-intent/v1`），意图确认门不再因 schema 缺失拒绝。
3. 所有内置治理角色与项目角色会话都能发现并读取该说明；judge/有界决策会话的工具集**逐字不变**。
4. 说明与校验器的逐项一致性由测试钉住；未来格式/校验变更时测试先失败。

---

## 2. 全量清点（[事实]，只读；以解析器/校验器扫描为准）

### 2.1 清点方法（可复核）

1. **schema 字面量扫描**：`grep -rn 'SCHEMA = "\|schema:\s*"' --include="*.ts" src/`（已执行；结果见 §2.2/§2.3），并核对 `src/model/*.ts` 与 `src/common/编排/*.ts` 的 `*_SCHEMA` 常量。P1.1 补扫确认 `git-quality-report/v1`（A14 严格层，R1.0 F1）与本次新增 B 行涉及的 `git-ref/v1`（B29）等；无斜杠字面量（`versions.jsonl` 的 `v:1`、`download-consumer.json` 的 `version:1`）由冻结 id 清单覆盖。
2. **YAML/frontmatter 解析器扫描**：`grep -rn 'from "yaml"' --include="*.ts" src/`（命中：`evidence-check.ts`、`governance-judge-evidence.ts`、`run-manifest.ts`、`workflow-preconditions.ts`、`boundary-yaml.ts`、`classify-shell.ts`、`run-role.ts`、`trunk-runtime.ts`、`amendment-validate.ts`、`apply-journal.ts`、`upgrade-validate.ts`；逐个人工判定输入是否为项目文档）。
3. **文件名/目录约定扫描**：`grep -rn 'docs/product\|docs/proposals\|docs/contracts\|docs/scheduling\|docs/acceptance\|docs/quality\|docs/verification\|docs/intents\|docs/skills\|docs/mcp\|docs/workflow' --include="*.ts" src/`；确认哪些路径被真实读取/扫描。
4. **校验入口扫描**：`grep -rn 'parse[A-Z]\|validate[A-Z]\|isValid[A-Z]\|schemaOf\|frontmatter' --include="*.ts" src/`；只计入**输入来自项目文件/项目字节**的函数。
5. **判定口径**：一个格式被计入「被真实解析/校验」当且仅当有生产代码读取其字节并做结构性判定（解析器、形状校验、schema 比对、文件名版本扫描、或据其内容生成机器事实）。只有文档约定、无人读取的，标注「仅约定」。
6. **冻结清单**：§2.2/§2.3 的 id 集合（**54 个**：A25 + B29，一行一 id）将作为测试夹具（§3.4 #5/§7），未来新增格式必须同时更新清单与规范，不能悄悄漏掉。
7. **内部状态路径扫描（F4）**：`grep -rn '\.ans/state\|\.ans/trunk\|deliveries\|git-mode\|download-consumer' --include="*.ts" src/ app/`，逐项判定是否被真实读取/结构校验；仅写不读的（如 `docs/audit/shell-gate.jsonl`）与包内资源（`chief-workflow/v1`）在 §2.6 明确排除并给白名单理由。

### 2.2 表 A：角色/客户可写（或可读）的文档格式

| # | 格式 id | 文档/位置 | 作者/受众 | 解析器/校验器（file:line） | 强制要点（摘要） | 版本/枚举规则 | 现存最小样例位置 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | `project-intent/v1` | `docs/product/<flowId>-intent-vN.md` | product 写；全员读 | `apply-journal.ts:3313-3332`；`run-manifest.ts:406-412,527-536`；`intent-entry-contract.ts:134-151,212-255`；`governance-judge-intent.ts:196-280` | frontmatter `schema` 必填且恰为字面量（意图确认门）；`flowId`/`version` 若给出必须一致；`intentId`（意图入口链） | 文件名 `-vN.md`，N≥1；最新 N 生效；旧版只读 | `test/编排/fixtures/trunk-project.ts:203`（最小）；完整意图入口模板 `intent-entry-contract.ts:27-37` |
| A2 | `project-proposal/v2` | `docs/proposals/<flowId>-proposal-vN.md` | rapporteur 写；全员读 | `workflow-preconditions.ts:1316-1330`；`upgrade-validate.ts:50-55,99-116`；`run-manifest.ts:529-536`；`governance-judge-intent.ts:118-124` | `schema: project-proposal/v2`；正文含 roster.intent 路径；首建时 frontmatter `intent` 指向已确认意图；`intentId`（入口链） | 文件名 `-vN.md`；旧版只读；引用最新 | `test/编排/fixtures/trunk-project.ts:204` |
| A3 | `project-modules/v2` | `docs/proposals/<flowId>-modules-vN.md` | rapporteur 写；全员读 | `workflow-preconditions.ts:984-1116`（`parseProjectModules`）；`run-manifest.ts:1083-1087`；`upgrade-validate.ts:164-172` | 顶层 `schema/flowId/version/modules`；modules 1–12；每项 `id/name/purpose/category/path 或 paths/publicContract/architectureSource` | `version` 正整数且=文件名 N（加载期）；`category` 1–32 小写 slug；id 2–64 小写 slug | `workflow-preconditions.ts:131-145`（`PROJECT_MODULES_SCHEMA_EXAMPLE`） |
| A4 | `project-roster/v3` | `docs/proposals/<flowId>-roster-vN.md` | rapporteur 写；全员读 | `workflow-preconditions.ts:686-981`（`parseProjectRoster`）；`loadLatestRoster:1171-1345`；`run-manifest.ts:1049-1089`（`loadPinnedRoster`） | `schema/flowId/version/intent/proposal/architecture/modules/roles`；`envBootstrap` 对象；`modulesDoc` 可选；正文「人员+模块拓扑图」含 ```topology | `version` 正整数且=文件名 N；引用必须为最新版本；`roles` 1–12、`modules` 1–12 | `workflow-preconditions.ts:148-178`（`PROJECT_ROSTER_SCHEMA_EXAMPLE`） |
| A5 | `project-topology/v2` | roster 正文「人员+模块拓扑图」章节的 ```topology 块 | rapporteur 写；全员读 | `workflow-preconditions.ts:532-663`（`validateRosterTopology`） | `schema/modules/roles/management`；`management` 扁平字符串数组且含 convener 与全部项目角色 id；与 roster frontmatter 完全一致 | schema v2；旧 v1 不静默归一化（`roster-topology-mismatch`） | `workflow-preconditions.ts:118-128`（`PROJECT_TOPOLOGY_SCHEMA_EXAMPLE`） |
| A6 | `project-architecture/v1` | `docs/contracts/<flowId>-architecture-vN.md` | rapporteur 写；全员读 | `upgrade-validate.ts:50-55,157-163`；`run-manifest.ts:531-536`；`workflow-preconditions.ts:1331-1337` | frontmatter `schema` 恰为字面量；正文含 roster.proposal 路径（版本链） | 文件名 `-vN.md`；引用最新 | `test/编排/fixtures/trunk-project.ts:208` |
| A7 | `project-assets/v1` | `docs/contracts/<flowId>-assets-vN.md` | rapporteur 写；全员读 | `run-manifest.ts:46,538-548`；`upgrade-validate.ts:54,99-106` | frontmatter `schema` 恰为字面量；文件可选（run pin 允许 null） | 文件名 `-vN.md` | `test/编排/fixtures/trunk-project.ts:209` |
| A8 | `team-plan/v3`（文档字面量 `teamPlanSchema:3`） | `docs/scheduling/<flowId>-team-vN.md` | convener 写；全员读 | `workflow-preconditions.ts:60-112`（`parseTeamPlan`）；`apply-journal.ts:2824-2916,3411,3527,3781`；`run-manifest.ts:569-578` | frontmatter **恰为** `schema/flowId/version/modules/roster/roleRows`（无多余键）；roleRows 恰覆盖 roster 一次；writesets 在属主模块根内、无治理目录、无重叠；依赖无环 | `schema` 字面量 `teamPlanSchema:3`；`version` 正整数=路径 N；run pin 仅识别 `-team-v1.md`（既有事实，`:569`） | 最小样例：`test/编排/workflow-preconditions.test.ts:43-58`；完整文本夹具 `test/测试/git-write-chain-fixture.ts:363`；`test/编排/fixtures/trunk-project.ts:210` 为最小 frontmatter 夹具 |
| A9 | `flow-yaml/v1` | `docs/flows/<flowId>.yaml` | convener/执行期写 | `run-manifest.ts:579-597` | 非空 YAML 映射；`version` 正整数 | 无 schema 字面量；仅 `version` 被校验 | `test/编排/fixtures/trunk-project.ts:211`（`version: 1\n`） |
| A10 | `trunk-amendment/v1` | `docs/proposals/<flowId>-amendment-vN.md`（frontmatter）+ `.ans/trunk/amendment.json`（状态同 schema） | rapporteur 写；全员读 | `src/service/trunk/impl/amendment-validate.ts:83-194,254-294,314-330,332-339` | `schema/amendmentId/flowId/docVersion/baseTrunk/items`；items 非空；kind `contract/roster/execution`；change `add/modify/none`；modify 必须带 from | `amendmentId` `am-<n>`；`docVersion` 正整数=文件名 N；`baseTrunk:null` 仅 bootstrap:true；**快照解析例外**：`parseAmendmentSnapshot` 以 `allowNoop=true` 调 `validateDocShape`（`amendment-validate.ts:339`），允许 no-op 快照（应用内部路径；提交/状态层仍要求至少一个 `change != none`） | `test/编排/direct-role-capabilities.test.ts:867-876` |
| A11 | `ans-criteria/v1` | `docs/acceptance/<flowId>-criteria-vN.md` 内唯一 ```ans-criteria 块 | verifier 写；全员读 | `src/common/编排/evidence-check.ts:191-273`（`parseCriteriaText`）；`276-301`（`loadCriteria`） | 恰一个 fenced block；无 YAML 分隔符/锚点/别名；顶层恰 `schema/flowId/version/status/criteria`；criteria 1–500；每项 `id/priority/title?` | `schema` 字面量；`flowId` slug；`version` 正整数=文件名 N；`status` `final/draft`（加载要求 final）；priority `P0–P3`；id `AC-n` 或 `Pn.m` | `test/编排/evidence-check.test.ts:25-38` |
| A12 | `evidence-meta/v1` | 证据旁 `<artifact>.meta.json`（单文件或 collection） | 实现/验收角色写 | `src/common/编排/evidence-check.ts:328-370`（`parseEvidenceMeta`）；`373-529`（check/collection） | JSON；`schema` 字面量；单文件 `artifact/sha256/bytes/lines/generatedAt`；collection `collection[]/generatedAt`；hash/bytes/lines/mtime/acIds 与实际比对；P0 缺 sidecar 必拒 | 无版本字段；schema 字面量 `evidence-meta/v1` | `test/编排/evidence-check.test.ts:119-170,222-225` |
| A13 | `intent-entry/v1` | `docs/intents/<intentId>.md` | chief 写；全员读 | `src/common/shared/intent-entry-contract.ts:57-104,134-151,212-255`；`governance-judge-intent.ts:196-280` | frontmatter `intentId/flowId/goal/scope/acceptance`（judge 基准必填）；`nonGoals/constraints` 可选；正文含意图要素章节/客户原话 | `intentId` 小写 slug 且与文件名/产品意图/提案三处一致 | `intent-entry-contract.ts:27-37`（模板）；§2.4 A13 填充样例（测试正例） |
| A14 | `quality-report/v1`（**分层**：展示层 + git 严格层 `git-quality-report/v1`） | `docs/quality/<flowId>-report-vN.md` | verifier 写；全员读；git 复核任务读 | **严格层**：`apply-journal.ts:1899-1940`（`readTextQualityProof`；调用 `:1982,2749,2768`）读 frontmatter 并精确校验；**展示层**：`src/common/编排/project-state.ts:69,501-524`（仅文件名+版本扫描）；`governance-judge-evidence.ts:553-561`（首行/frontmatter/结论章节摘录） | 严格层：frontmatter `schema` 恰为 `git-quality-report/v1`；键集恰为 `schema/version/taskId/runId/flowId/candidateOperationId/candidate/criteria/checks`；`taskId/runId/flowId/candidateOperationId/candidate/criteria` 绑定任务与冻结基准；`checks` 恰 1 项 `{assertion:"nonempty-utf8", artifact:{oid,path,sha256}}`；含 secret 拒；拒绝码 `review-quality-*`（统一 `trunk-item-invalid`）。展示层：文件名/版本扫描 + 验收 judge 摘录 | 文件名 `-vN.md`，N≥1；严格层 `version?` 给出即必须=N；展示层取最新 N | 严格层：无仓库内最小样例（服务绑定；e2e 合成见 `test/测试/git-role-workflows-e2e.test.ts:710` 附近，`:277-280` 为版本断言）；展示层：无样例 |
| A15 | `workflow/v1` | `docs/workflow.md`（稳定文件名） | convener 写（stable 确认即写） | `src/common/编排/handback.ts:280-346`（必读引用提取/投递）；`src/model/trunk.ts:139-144`（`hasExecutionWorkflow`）；`versioned-doc-guard.ts:1092` | **无结构解析器**；非空；执行 trunk 的 `artifacts.workflow` 必须为 `kind:"workflow"` + 路径 `docs/workflow.md` + sha256；派发引用时附必读块（缺失降级不拒投） | 稳定文件不版本化；stable 写入需确认 | `test/编排/fixtures/trunk-project.ts:212`（`# workflow\n`） |
| A16 | `contract-md/v1` | `docs/contracts/<name>-vN.md` | 各角色写（预授权目录） | `handback.ts:286-346`（派发必读）；`versioned-doc-guard.ts`（版本化冻结）；无 schema 校验 | **仅约定**：跨角色冻结契约；版本化；被派发文本按地址引用 | 文件名 `-vN.md`；旧版只读 | 任意既有契约（如 `docs/contracts/...`）；无强制格式 |
| A17 | `role-card/v1` | `角色卡/<roleId>/role-card.md` | nominator 写（项目角色） | `src/common/门禁引擎/boundary-core.ts:75-106`（`parseSnapshotRoleDocuments`）；required sections `governance-roles.ts:351-362`；展示解析 `role-card-sections.ts:117-143`、`role-card-metadata.ts:16-28` | 三文件规范路径；10 个必填章节标签；`boundary.md`↔`boundary.yaml` 条目恒等；无条件目录/仅 project 根；archived 拒绝 | 无版本字段；路径固定 `角色卡/<roleId>/` | 既有项目角色卡（目标项目产物）；`角色卡/产品/role-card.md` 为人读样例（内置角色不走该校验） |
| A18 | `boundary-md/v1` | `角色卡/<roleId>/boundary.md` | nominator 写 | `boundary-parse.ts:75-127`（Section 1 表格）；`boundary-core.ts:95-102`（与 YAML 恒等） | Section 1 标题下表格：类型/路径/用途；类型 file/directory/条件目录；条件目录需合法 slug；宽松跳过不可识别行 | 无版本；与 boundary.yaml 条目集合必须一致 | `角色卡/编排/boundary.md`（真实样例） |
| A19 | `boundary-yaml/v1` | `角色卡/<roleId>/boundary.yaml` | nominator 写 | `boundary-yaml.ts:46-124`（`validateBoundaryYamlText` / `parseBoundaryYamlDoc`） | 顶层仅 `role/entries/archived`；entries 仅 `kind/path/purpose/root/condition`；kind `file/directory/conditional-directory`；root `project/skill`；archived 必须 boolean | 无版本号（顶层 `version` 是显式错误） | `角色卡/产品/boundary.yaml`（真实样例） |
| A20 | `skill-install/v1` | `docs/skills/<name>/install.md` + `SKILL.md` | su 写（治理） | `src/common/编排/installed-skills.ts:94-112`（登记解析）、`:194-263`（渲染/注入） | 登记四字段 `用途/适用角色/状态/安装日期`；状态 `installed/uninstalled`；`SKILL.md` 存在且算 sha256；坏件跳过不拒会话 | 无版本；skill 目录名即稳定 slug | `test/pi-adapter/installed-skills-injection.test.ts`（夹具） |
| A21 | `mcp-declaration/v1` | `docs/mcp/<name>.md` | su 写（治理） | `src/common/runtime-core/mcp-declarations.ts:122-180`（解析）、`:182-246`（加载）、`:248-300`（读取/列表） | 七键：用途/启动/参数?/环境?/适用角色/状态/安装日期；name `[A-Za-z0-9_-]+`；保留名 `ans/ans_codex` 拒；env 只收字面量或 `env:NAME` | 无版本；状态 `installed/uninstalled` | `test/runtime-core/mcp-declarations.test.ts:87` 附近夹具 |
| A22 | `change-package/v1` | `docs/scheduling/<flowId>-change-v1.md` | 历史变更包（legacy） | `governance-judge-evidence.ts:573-585`（摘录）；**无校验器** | **仅约定（摘录）**：frontmatter（riskTier/candidate/changedPaths）+ 候选/档位/证据章节 | 文件名 `-change-v1.md`（legacy） | 既有 `docs/scheduling/*change*` 记录（人读） |
| A23 | `role-change-record/v1` | `角色卡/<role>/docs/change/`、`角色卡/<role>/docs/fix/` | 各角色写 | **无解析器**；边界授予目录 | **仅约定**：变更/修复记录；应用不读取/不校验 | 无版本约束；建议日期前缀 | 既有角色 docs/change、docs/fix |
| A24 | `bootstrap-manifest/v1`（**audience: app-managed**） | `docs/bootstrap-manifest.md` | **应用写；角色不可写、不可读** | `src/common/编排/finalize.ts:115,293-379,882`（写/追加；无读解析） | **仅约定**：创世/重新接受留痕；角色不可写（仅写不读） | 无版本 | 既有项目产物 |
| A25 | `verification-attachment/v1` | `docs/verification/**` | 实现/验收角色写 | **无格式解析器**；附件旁 sidecar 走 A12 | **仅约定**：证据附件任意文件；证据 metadata 用 `evidence-meta/v1` | 无版本 | 既有目标项目产物 |

> 表 A 共 **25 行 / 25 个 id**。A14 为分层格式（严格层 `schemaLiteral` 为 `git-quality-report/v1`，展示层无 schema 字段）；A24 虽在表 A，audience 为 `app-managed`（应用写、角色不可写；F16）。每个 spec 恰一个 id；`schemaLiteral` 单值（§3.2/§3.3 #3）。

### 2.3 表 B：应用内部状态/事件格式（角色不写；应用解析）

> 这些文件不是角色可写文档；`doc_format` 仍可只读返回其简明规范（`audience:"app-managed"`），明确「角色不写、写了会被门禁拒绝」。**一行一 id**：B1–B29 共 29 个 spec；每个 spec 单一 `schemaLiteral`（文件内无 schema 字段/数值版本的显式注明，F3）。测试钉住主校验器锚点 + 一个合法样例；seam 见 §2.3.1（F8）；不做角色文档级的全量变异矩阵（§3.4）。

| # | 格式 id | 文件/位置 | 校验器（file:line） | 关键形状/枚举 |
| --- | --- | --- | --- | --- |
| B1 | `ans-run/v1` | `.ans/runs/<runId>/manifest.json` | `run-manifest.ts:209-231`（`validateRunManifest`） | `schema/runId/flowId/state(draft/pinned/closed/cancelled)/createdAt/updatedAt/schemas/documents/execution`；pin 时文档/schema/hash/roster/D3 复核 `:478-629` |
| B2 | `run-change/v1` | run manifest `runChange` | `run-manifest.ts:143-157,903-975` | `schema/decisionId/mode(continue-frozen/stop-and-restart/stop)/decidedBy(customer/judge/directive)/oldRunId/oldHashes` |
| B3 | `run-repin/v1` | run manifest `repins[]` | `run-manifest.ts:77-84,733-832` | `schema/at/applicationId/targets[{kind,path,sha256}]` |
| B4 | `team-plan-completion/v1` | `.ans/trunk/plan-completions/<hash>.json` | `apply-journal.ts:2875-2879` | `schema/operationId/actorRoleId("convener")/flowId/plan/modules/roster` |
| B5 | `trunk/v1` | `.ans/trunk/manifest.json` | `src/model/trunk.ts:90-139`；`fs-trunk-store.ts:87-121`（`isTrunkManifestShape`） | `schema/trunkVersion/source(adopted/post-run-change/amendment/upgrade/bootstrap/recovery/team-plan)/flowId/artifacts(documents/execution/workflow?/roleCards?/boundaries)/digest` |
| B6 | `trunk-apply-journal/v1` | `.ans/trunk/operations/*.json`（当前）；legacy `.ans/trunk/apply-journal.json`（`fs-trunk-store.ts:649-650`） | `git-command.ts:33-40`（`isTrunkApplyJournalShape`）；`model/trunk.ts:17,322`；`fs-trunk-store.ts:87,127,428-472,649-650` | `v/schema/operationId/applicationId/journalId/flowId/phase/message/actionSource/targetSnapshot/beforeSnapshot/before/target` |
| B7 | `trunk-amendment-static/v1` | 同 A10（文档+state 共用 schema） | `amendment-validate.ts:314-330`（`validateAmendmentState`） | 同上；state 另含 `docPath/docSha256/status/applyState/items/checks` |
| B8 | `doc-freeze/v1` | R9 baseline 冻结记录/`doc.freeze` 事件 | `src/model/version-change.ts:232-293`（`isValidDocFreezeRecord`） | `schema/applicationId/reason/origin/decidedBy?/decisionId?/actorRoleId?/source?/snapshotRef/frozenAt`（枚举以 model 为准；judge 变更将加法扩展，本变更不固化） |
| B9 | `doc-freezes/v1` | R9 派生快照缓存 | `versioned-doc-guard.ts:726`；`guard-freeze-registry.ts:279`；`fs-freeze-cache.ts:29,44`（`isDocFreezeCacheShape`） | `v/schema/files[]/state/baselineSha256?/entries/builtAt`（派生缓存，坏件 fail-closed） |
| B10 | `complete-snapshot/v1` | 精确字节快照 | `model/trunk.ts:587,645`（`isCompleteSnapshot`）；`boundary-core.ts:55-72`（`snapshotDocumentText`） | `schema/snapshotId/digest/files[{path,sha256,bytesBase64}]`；digest=排序后路径/hash/base64 的 sha256 |
| B11 | `version-change/v1` | `.ans/state/version-changes.json` 记录/事件 | `src/model/version-change.ts`（类型/枚举）；`task-state.ts:744`（事件 schema）；`service/version-change/impl/*` | `v/schema/applicationId(vc-n)/kind(detail-amendment/version-upgrade)/status/...`；kind↔发起角色映射 `VERSION_CHANGE_INITIATOR_BY_KIND` |
| B12 | `stable-write/v1` | stable 写入记录/一次性许可/事件 | `model/version-change.ts`；`task-state.ts:892`；`stable-write-service.ts` | `v/schema/requestId(sw-n)/kind(workflow/role-card/boundary)/path/...`；permit TTL 30min |
| B13 | `refactor-request/v1` | 重构申请记录/事件 | `model/version-change.ts`；`task-state.ts:857`；`refactor-validate.ts` | `v/schema/requestId(rf-n)/flowId/title/reason/scope/status` |
| B14 | `customer-directive/v1` | 客户指令事件/账本 | `src/model/directive.ts:18`；`model/directive-marker.ts`；`pipeline/orchestration/customer-directive.ts` | `schema/kind/directiveId(d-<seq>)/...`；解析器纯文本 |
| B15 | `download-request/v1` | 下载申请/结果 | `src/model/download.ts:13`；`service/download/*` | `schema/requestId/url/purpose/...`；错误码枚举 |
| B16 | `version-decision/v1` | `.ans/state/*` 决策事件 | `task-state.ts:546`；`version-decision.ts:194`；`model/project-state.ts:12` | `schema/decisionId/action/...` |
| B17 | `project-state/v1` | 派生的只读视图（不持久化） | `project-state.ts:756-1057`（`buildProjectStateView`）；`model/project-state.ts:290` | `schema/...`；纯读、无写、无缓存 |
| B18 | `governance-matrix/v1` | 派生的只读矩阵（上下文段/工具） | `service/governance-matrix/impl/builder.ts:505,556`；`renderer.ts:427` | `schema/roles/sources/warnings/render`；纯派生 |
| B19 | `task-state-event/v1` | `.ans/state/tasks.jsonl` 等事件账本 | `src/common/编排/task-state.ts:400-1140`（`validateEvent`/`validateTaskStateEvent`） | `kind`（task.created/delivered/reported/closed/redispatch、request.*、approval.*、project.*、delegation.changed 等）+ 各自字段；逐行 JSON |
| B20 | `repository-work-source/v1` | 派发工作源元数据 | `apply-journal.ts:1039,1105`；`fs-trunk-store.ts:228`；`chief/internal/dispatch.ts:42,53` | `schema:"repository-work-source/v1"/purpose:"builtin-preparation"/sourceId/flowId/...` |
| B21 | `role-authorization/v1` | stable 发布授权元数据 | `apply-journal.ts:3200`；`classify-shell.ts:539` | `schema/flowId/roleId/plan/roster/...` |
| B22 | `role-activation/v1` | stable 激活元数据 | `apply-journal.ts:3203`；`classify-shell.ts:531` | `schema/actorRoleId:"nominator"/...` |
| B23 | `stable-initial-workflow/v1` | 初始 workflow 发布元数据 | `classify-shell.ts:348`；`apply-journal.ts:1146`；`git-trunk-store.ts:295,1270` | workflow 路径/哈希/确认来源（published） |
| B24 | `stable-initial-workflow-source/v1` | 初始 workflow 来源元数据 | `classify-shell.ts:108-114,309`；`provider/trunk/abstract/trunk-store.ts:233`；`service/trunk/impl/stable-snapshot.ts:53`；`git-command.ts:423` | `schema/kind/operationId` |
| B25 | `project-config/v1`（工具枚举名；文件本身无 schema 字段） | `.ans/project.json` | `src/common/shared/config-loader.ts:96-318` | roles/governanceBoundary/pins/acceptance/governanceModel；accepted:true 必须 pin-backed；`.ans` 不可解析 ⇒ fail-closed |
| B26 | `version-baseline/v1`（行内 `v:1`，无斜杠 schema 字面量） | `.ans/state/versions.jsonl`（+ marker `.ans/state/versions.initialized`；锁 `versions.lock`） | `versioned-doc-guard.ts:243-246,368-421`（`parseVersionBaselineState`）；读取入口 `guard-freeze-registry.ts:29-35` | 每行 `v=1/flowId/doc(版本化文档 kind)/version(正整数)/path/sha256/recordedAt/recordedBy/event(baseline/frozen)`；`frozen` 行须含合法 `freeze`（B8 形状）；坏行 `baseline-corrupt`，marker/文件不一致 `baseline-missing`/`marker-missing` |
| B27 | `download-consumer/v1`（`version:1`，无斜杠字面量） | `.ans/state/download-consumer.json` | `consumer-epoch-store.ts:22-45`（`parseState`）；路径常量 `download-consumer-epoch.ts:9-10` | `version=1/enabledAt(可解析 ISO 时间)/appVersion(非空)`；坏件 `missing`/`unreadable`（`invalid-json`/`not-an-object`/`version-mismatch`/`enabledAt-invalid`/`appVersion-invalid`）/`ready` |
| B28 | `operation-delivery/v1`（无 schema 字段） | `.ans/trunk/deliveries/<sha256(key)>.json` | `guard-freeze-registry.ts:1080-1096` | JSON 对象且 `key` 与调用方 key 一致；坏件抛 `delivery-record-corrupt`（fail-closed） |
| B29 | `git-mode/v1`（media 字面量 `git-ref/v1`） | `.ans/trunk/git-mode.json` | `git-trunk-store.ts:723,1096-1108,1246`；`git-command.ts:921` | `{media:"git-ref/v1", repoId, ref, journalId?}` 或 `{media:"git-ref/v1", repoId, migrationOperationId?}`；JSON 解析失败 ⇒ 按 git 只读存储选择（fail-closed）；存在性使宿主保护要求为 `required` |

### 2.3.1 B 组测试 seam（F8）

> 每个 B 行在 `DocFormatSpec.testSeam` 中登记测试 seam（`exported-pure` / `public-path-fixture` / `text-shape`）：`exported-pure` 指可 import 的纯校验器；`public-path-fixture` 指需最小公开路径夹具（临时项目根/文件）；`text-shape` 指无可调用纯 seam，退化为文本/形状断言并在 §9.2 如实记录残余风险。

| 行 | seam（类型） | 说明 |
| --- | --- | --- |
| B1 | `validateRunManifest`（exported-pure） | 合法/非法 manifest 正负例 |
| B2 | `applyRunChange`（public-path-fixture） | 最小 pinned run 夹具；断言接受/拒绝与 code |
| B3 | `repinPinnedRun`（public-path-fixture） | 最小 pinned run 夹具 |
| B4 | 无纯校验器（text-shape） | marker 合成/策略校验内联于 `apply-journal.ts`/`classify-shell.ts`；源码文本 + 形状断言 |
| B5 | `isTrunkManifestShape`（exported-pure） | |
| B6 | `isTrunkApplyJournalShape`（exported-pure） | 含 legacy `apply-journal.json` 路径 |
| B7 | `validateAmendmentState`（exported-pure） | state 形状；文档侧由 A10 覆盖 |
| B8 | `isValidDocFreezeRecord`（exported-pure） | |
| B9 | `isDocFreezeCacheShape`（exported-pure） | 坏件 fail-closed |
| B10 | `isCompleteSnapshot`（exported-pure） | |
| B11–B13、B16、B19 | `validateTaskStateEvent`（exported-pure） | 事件逐类正负例 |
| B14 | 纯文本解析 + 模型常量（text-shape） | `CUSTOMER_DIRECTIVE_SCHEMA` 与 `d-<seq>` 规则 |
| B15 | 模型常量 + 工具形状（text-shape） | `DOWNLOAD_REQUEST_SCHEMA`；工具层参数校验在运行时核心 |
| B17 | `buildProjectStateView`（public-path-fixture，只读入参） | 派生视图，无持久化 |
| B18 | `buildGovernanceMatrix`（exported API） | 纯派生矩阵 |
| B20 | 内联校验（text-shape） | `repository-work-source/v1` 多文件内联；源码文本钉住 |
| B21/B22 | 内联校验（text-shape） | `role-authorization`/`role-activation` 无共享常量 |
| B23/B24 | 内联校验（text-shape） | `stable-initial-workflow*` 无共享常量 |
| B25 | `loadEffectiveConfig`（public-path-fixture） | 临时项目根 + `.ans/project.json` |
| B26 | `parseVersionBaselineState`（exported-pure） | 逐行正负例；marker 语义 |
| B27 | `createDownloadConsumerEpochStore(...).read()`（public-path-fixture） | 临时项目根 |
| B28 | `recordOperationDelivery`/`operationDeliveryRecorded`（public-path-fixture） | 临时项目根 |
| B29 | 无纯解析器（text-shape） | 读取选择路径复杂；源码文本 + 形状断言 |

> `text-shape` 行不宣称「测试通过 == 校验器一致」，只钉住已核实的键/枚举/错误码文本；残余风险在 §9.2 汇总。若后续 owner 提供纯校验器，升级为 `exported-pure`/`public-path-fixture`。

### 2.4 角色可写格式的逐项记录（必填/可选/类型/枚举/版本/错误/样例）

> 本节是 `doc-format-specs.ts` 的内容蓝本；**强制/约定分层**必须与校验器一致。`拒` 后括号为稳定 code（若有）。

#### A1 `project-intent/v1`

- 路径/版本：`docs/product/<flowId>-intent-vN.md`；取 N 最大者为最新；旧版只读、不原地改。
- 校验器（三层，口径不同，必须分别写明）：
  1. **意图确认门** `prepareIntentConfirmation`（`apply-journal.ts:3313-3332`）：文件必须存在、可读、UTF-8；首个 frontmatter 必须可解析为对象；`schema` 必须**恰为** `project-intent/v1`；`flowId` 若给出必须等于本次 flowId；`version` 若给出必须等于文件名 N。否则 `trunk-item-invalid`（"Intent schema/flow/version differs from the actual document"），编排返回 `declined/notPresented`（`run-role.ts:1616-1618`）。
  2. **run pin** `prepareRunPin`（`run-manifest.ts:527-536` + `schemaMatches:406-412`）：frontmatter `schema` 若存在且 ≠ 期望 ⇒ `run-pin-schema-mismatch`；**缺失 frontmatter/schema 不拒 pin**（与确认门口径不同，须如实并列）。
  3. **意图入口链**（`intent-entry-contract.ts:134-151,212-255`；`governance-judge-intent.ts:196-280`）：frontmatter `intentId` 按行解析；必须是 `GOVERNANCE_SLUG_PATTERN` 小写 slug；产品意图/提案/`docs/intents/<intentId>.md` 文件名三处一致；judge 意图基准读取 `docs/intents/<intentId>.md` 的 `goal/scope/acceptance`（必填）与 `nonGoals/customerWords`（可选）。
- 字段表（frontmatter）：
  - `schema`：string；**意图确认门必填**，字面量 `project-intent/v1`。
  - `flowId`：string；可选；给出即必须等于本次 flowId。
  - `version`：正整数；可选；给出即必须等于文件名 `-vN` 的 N。
  - `intentId`：小写 slug（`^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`）；意图入口契约**要求写**（产品意图 frontmatter 至少含 `intentId/flowId/version`）；解析器在缺省时回落 flowId（source=flow-id），但 nominator 前置与判断事实要求产品意图/提案/入口文件名三处一致——缺省会失去该一致性证据。
  - 正文（约定，解析器不校验）：目标用户与场景、要解决的问题、范围与非目标、成功/验收标准、客户原话与约束、质量档位。
- 常见错误：缺 `schema` → `trunk-item-invalid`（意图确认被拒，卡不呈现）；`schema` 写成 `project-intent/v2`/`project-proposal/v2` → 同上；`flowId` 与派发不一致 → 同上；pin 时 schema 写错且存在 → `run-pin-schema-mismatch`；`intentId` 与提案/入口不一致 → `intent-ambiguous`；入口缺 goal/scope/acceptance → `intent-missing`。
- 最小合法样例（意图确认门+pin 均过）：`---\nschema: project-intent/v1\nflowId: demo\nversion: 1\nintentId: demo-intent\n---\n# 意图\n`（正文按约定补全；仓库内最小样例见 `test/编排/fixtures/trunk-project.ts:203`）。

#### A2 `project-proposal/v2`

- 路径/版本：`docs/proposals/<flowId>-proposal-vN.md`；最新 N 生效。
- 校验器：
  1. roster 加载（`workflow-preconditions.ts:1316-1330`）：文档文本必须包含字面 `schema: project-proposal/v2`（子串匹配，不是 YAML 解析）→ 否则 `roster-reference-invalid`；正文必须包含 roster 的 `intent` 路径 → 否则 `roster-reference-inconsistent`。
  2. upgrade/首建链（`upgrade-validate.ts:99-116`）：`schemaOf` 必须恰为 `project-proposal/v2`；当 `confirmedIntent` 存在时 frontmatter `intent` 必须等于已确认意图路径且快照字节哈希匹配 → 否则 `trunk-item-invalid`。
  3. run pin（`run-manifest.ts:529-536`）：schema 若存在必须为字面量 → 否则 `run-pin-schema-mismatch`。
  4. 意图入口/judge（`governance-judge-intent.ts:118-124`）：frontmatter `intentId` 用于意图定位；与产品意图/入口不一致 → `intent-ambiguous`。
- 字段表：
  - `schema`：roster 加载与 upgrade/首建链必填（字面量 `project-proposal/v2`）；run pin 缺失不拒（但写作应总是写）。
  - `intentId`：意图入口契约要求写（小写 slug，从产品意图原样复制）；解析器缺省时回落 flowId，但三处一致由 nominator 前置/判断事实核对。
  - `intent`：首建/升级链必填；完整版本化意图路径 `docs/product/<flowId>-intent-vM.md`。
  - `flowId`/`version`：写作约定（当前 parser 不校验；文件名/引用链决定版本）。
  - 正文（约定）：提案内容；必须出现 roster 声明的 intent 路径（机器链要求）。
- 常见错误：老 v1 schema → `roster-reference-invalid`/`trunk-item-invalid`；未引用名单 intent → `roster-reference-inconsistent`；首建 frontmatter `intent` 缺失/指向错误 → `trunk-item-invalid`。
- 最小样例：`test/编排/fixtures/trunk-project.ts:204`。

#### A3 `project-modules/v2`

- 路径/版本：`docs/proposals/<flowId>-modules-vN.md`（唯一权威源；roster `modules[]` 是其派生快照）。
- 校验器：`parseProjectModules`（`workflow-preconditions.ts:984-1116`）；加载期 `loadLatestRoster:1213-1268` 校验最新文件存在、`flowId` 一致、文件名 N=frontmatter `version`、`roster.modules[]` 与本文档逐项一致；`loadPinnedRoster`（`run-manifest.ts:1083-1087`）校验 pinned 字节与解析。**跨层口径差异**：`parseProjectModules` 对 `paths` 只限 1–20，**不限制**普通模块多路径；roster 加载层额外拒绝普通模块 `paths.length > 1`（`roster-module-directory-invalid`，`workflow-preconditions.ts:901-905`；多路径仅限 env-bootstrap 固定模块）。
- 顶层字段：`schema`（必填，字面量）、`flowId`（必填非空）、`version`（必填正整数）、`modules`（必填 1–12 数组）。顶层多余键**不拒绝**（parser 不读；写作时不要依赖）。
- `modules[]` 每项：`id`（必填，2–64 小写 slug，唯一）；`name`（必填非空）；`purpose`（必填非空；别名 `responsibility`）；`category`（必填，1–32 小写 slug，大小写不敏感判定；`env/entry` 为保留类别）；`path` 或 `paths`（至少一项；`path` 与 `paths[0]` 同时给出必须一致；`paths` 1–20；路径项目相对、禁绝对/盘符/通配/空段/`.`/`..`、尾 `/`=目录、否则=文件）；`publicContract`（必填非空字符串；不能写 YAML 布尔）；`architectureSource`（必填非空字符串；写作约定为项目相对路径，parser 不校验路径形状）。
- 约束：模块路径互不重叠/嵌套（同父文件与目录合法）；不得落在治理/他人写区前缀（`.ans/`、`角色卡/`、`docs/intents|product|proposals|contracts|scheduling|quality|verification|skills|mcp|audit/`、`docs/bootstrap-manifest.md`）。
- 常见错误：`modules-doc-frontmatter`（非文本/缺 frontmatter/未闭合）、`modules-doc-yaml`、`modules-doc-schema`（schema 错/缺 flowId）、`modules-doc-flow`、`modules-doc-version`、`modules-doc-modules`（非 1–12 数组/项非对象）、`modules-doc-id`、`modules-doc-fields`、`modules-doc-directory`、`modules-doc-overlap`；加载期 `roster-modules-doc-missing/invalid`、`roster-modules-drift`。
- 最小样例：`workflow-preconditions.ts:131-145`。

#### A4 `project-roster/v3`

- 路径/版本：`docs/proposals/<flowId>-roster-vN.md`（最新 N 生效）。
- 校验器：`parseProjectRoster`（`workflow-preconditions.ts:686-981`）；`loadLatestRoster`（`:1171-1345`）；`loadPinnedRoster`（`run-manifest.ts:1049-1089`）。**多路径限制**：普通模块 `paths.length > 1` 被 roster 层拒绝（`roster-module-directory-invalid`，`workflow-preconditions.ts:901-905`；多路径仅限 env-bootstrap 固定模块）；`parseProjectModules` 本身只限 1–20、不施加该限制（跨层口径差异必须分别写明）。
- 顶层：`schema`（必填字面量）、`flowId`（必填）、`version`（必填正整数=文件名 N）、`intent`/`proposal`/`architecture`（必填版本化路径，最新版本）、`modulesDoc`（可选，必须指向最新 modules 文档）、`envBootstrap`（可选对象：`omitted:boolean`；true 时须非空 `omissionReason` 且不得含 env-bootstrap 角色或 env/entry 模块）、`modules`（必填 1–12；每项规则同 A3，且**普通模块 paths 仅 1 项**——roster 层强制，env-bootstrap 固定模块例外）、`roles`（必填 1–12）。
- `roles[]`：`id`（必填，2–64 小写 slug，唯一，不得为内置 id）、`displayName`/`purpose`/`capability`（必填非空）、`modules`（必填非空 string[]，引用已定义模块 id，角色内不重复）。
- 绑定：`roles[].modules[]` 唯一来源；每模块恰一属主、每角色至少一模块；`env/entry` 模块只能归 `env-bootstrap`；`env-bootstrap` 角色名下模块必须恰为 `env-resources`（category env）与 `entry-index`（category entry）。
- 正文：必须含「人员+模块拓扑图」章节 + ```topology 块（A5），且与 frontmatter 完全一致。
- parser 错误码（全量口径）：`roster-frontmatter-missing`、`roster-yaml-invalid`、`roster-schema-invalid`、`roster-flow-mismatch`、`roster-version-invalid`、`roster-reference-invalid`、`roster-roles-invalid`、`roster-role-fields-missing`、`roster-role-id-invalid`、`roster-role-modules-invalid`、`roster-role-builtin`、`roster-role-duplicate`、`roster-role-without-module`、`roster-module-id-invalid`、`roster-modules-invalid`、`roster-module-fields-missing`、`roster-module-directory-invalid`、`roster-module-directory-governance`、`roster-module-directory-overlap`、`roster-module-role-invalid`、`roster-module-owner-invalid`、`roster-module-multi-owner`、`roster-module-unbound`、`roster-directory-invalid`、`roster-directory-governance`、`roster-directory-overlap`、`roster-env-bootstrap-invalid`、`roster-topology-missing/invalid/mismatch`。
- 加载级硬拒绝：最新 roster 存在/可读（`roster-missing`）；文件名 N=version（`roster-version-invalid`）；最新 modules 文档存在且合法（`roster-modules-doc-missing/invalid`）；`modulesDoc` 未指向最新 modules（`roster-reference-stale`，`:1238-1246`）；roster modules[] 与 modules 文档逐项一致（`roster-modules-drift`）；intent/proposal/architecture 存在/非空/为最新（`roster-reference-missing/stale`）；proposal 含 `project-proposal/v2` 且引用名单 intent（`roster-reference-invalid/inconsistent`）；architecture 正文含名单 proposal（`roster-reference-inconsistent`）。
- 最小样例：`workflow-preconditions.ts:148-178`（含 topology 块）。

#### A5 `project-topology/v2`

- 位置：roster 正文「人员+模块拓扑图」章节内的 ```topology YAML 块（唯一机器可读格式）。
- 校验器：`validateRosterTopology`（`workflow-preconditions.ts:532-663`）。
- 字段：`schema`（必填字面量）、`modules`（必填数组；每项 `id` 非空 string、`path` 或 `paths` 至少一项且路径合法、`roleId` 非空 string；不要求 category）、`roles`（必填数组；每项 `id` 非空、`modules` 非空 string[]）、`management`（**扁平字符串数组**；必须含 convener 与全部项目角色 id；单个字符串被宽容读取但不推荐；mapping/`management.roles` 不接受）。
- 一致性：modules 的 id/路径集合/属主与 roster frontmatter modules[]/roles[].modules[] 完全一致；roles 的 id/modules 集合一致；modules 与 roles 数量一致。
- 常见错误：`roster-topology-missing`（无章节/块）、`roster-topology-invalid`（YAML/形状非法、缺 id/path/roleId）、`roster-topology-mismatch`（schema v1、缺 convener/角色、路径/属主/数量不一致）。
- 最小样例：`workflow-preconditions.ts:118-128`。

#### A6 `project-architecture/v1`

- 路径/版本：`docs/contracts/<flowId>-architecture-vN.md`（最新 N 生效）。
- 校验器：`upgrade-validate.ts:50-55,99-106,157-163`（schemaOf + 版本链）；`run-manifest.ts:527-536`；`workflow-preconditions.ts:1331-1337`（roster 链）。
- 字段：`schema` 在 upgrade/版本链必填字面量 `project-architecture/v1`；run pin 缺失不拒（建议总是写）；正文必须包含 roster 声明的 proposal 路径（机器链）。其余内容为写作约定（分层/模块/依赖方向/公开契约/数据流/扩展点）。
- 常见错误：`trunk-item-invalid`（schema 缺失/错误、正文未引用 proposal）、`run-pin-schema-mismatch`、`roster-reference-inconsistent`。
- 最小样例：`test/编排/fixtures/trunk-project.ts:208`。

#### A7 `project-assets/v1`

- 路径/版本：`docs/contracts/<flowId>-assets-vN.md`；可选存在。
- 校验器：`run-manifest.ts:46,538-548`（存在则 schema 必须为字面量；hash 必须可算）；`upgrade-validate.ts:54,99-106`。
- 字段：`schema` 在 upgrade 文档集存在时必须为字面量 `project-assets/v1`；run pin 仅在 frontmatter 给出 schema 时校验（缺失不拒）；其余为约定。
- 常见错误：`run-pin-schema-mismatch`、`run-pin-document-missing`（存在但不可读/哈希失败）、`trunk-item-invalid`。
- 最小样例：`test/编排/fixtures/trunk-project.ts:209`。

#### A8 `team-plan/v3`

- 路径/版本：`docs/scheduling/<flowId>-team-vN.md`（trunk execution/completeTeamPlan 允许 vN；**run pin 只识别 `-team-v1.md`**，`run-manifest.ts:569`，属既有事实）。
- 校验器：`parseTeamPlan`（`workflow-preconditions.ts:60-112`）；`completeTeamPlan`（`apply-journal.ts:2824-2916`）；执行 prepare 读取（`:3411,3527`）。
- frontmatter（**恰为**这些键，多键拒绝）：`schema`（字面量 `teamPlanSchema:3`）、`flowId`（=上下文）、`version`（正整数=路径 N）、`modules`（`{path,sha256}` 恰等于当前授权基线）、`roster`（`{path,sha256}` 恰等于当前名单）、`roleRows`（数组，长度=roster 角色数，每角色恰一次）。
- `roleRows[]`（**恰为**四键）：`roleId`（唯一、在 roster）、`modules`（非空 string[]，与 roster 属主一致）、`writesets`（非空 string[]，必须在属主模块根内、无治理目录、互不重叠）、`dependsOn`（string[]，可空，必须引用已定义角色且无环）。
- 每个被分配模块必须有本角色 writeset；角色依赖无环。
- 常见错误：`plan-structure-invalid`（结构/属主/写集/依赖）；`plan-path-invalid`、`plan-base-conflict`、`plan-owner-invalid`、`plan-hash-drift`、`plan-identity-invalid`；run pin 时 `-team-v1.md` 存在但 schema 错 → `run-pin-schema-mismatch`。
- 最小样例：`test/编排/workflow-preconditions.test.ts:43-58`；完整文本夹具 `test/测试/git-write-chain-fixture.ts:363`；frontmatter 最小夹具 `test/编排/fixtures/trunk-project.ts:210`。

#### A9 `flow-yaml/v1`

- 路径：`docs/flows/<flowId>.yaml`（可选）。
- 校验器：`run-manifest.ts:579-597`：文件存在时必须非空；YAML 必须可解析为映射且 `version` 为正整数；否则 `run-pin-schema-mismatch`。其他字段不校验。
- 常见错误：空文件、YAML 非法、缺/非法 `version` → `run-pin-schema-mismatch`；hash 失败 → `run-pin-document-missing`。
- 最小样例：`test/编排/fixtures/trunk-project.ts:211`。

#### A10 `trunk-amendment/v1`

- 路径：`docs/proposals/<flowId>-amendment-vN.md`（frontmatter 文档）；状态文件 `.ans/trunk/amendment.json` 共用 schema。
- 校验器：`amendment-validate.ts:83-194`（`validateDocShape`）、`:254-294`（`validateAmendment`）、`:314-330`（state）、`:332-339`（快照解析）。
- frontmatter：`schema`（必填字面量）、`amendmentId`（必填 `am-<n>`）、`flowId`（必填=提交）、`docVersion`（必填正整数=文件名 N）、`baseTrunk`（对象 `{trunkVersion,runId,digest}` 或 `null`；`null` 仅 `bootstrap:true`）、`bootstrap`（可选 boolean）、`summary`（可选 string）、`items`（非空数组）。
- `items[]`：`itemId`（非空唯一）、`kind`（`contract/roster/execution`；`workflow/boundary` 明确拒绝）、`change`（`add/modify/none`）、`from`（modify 必填；路径规范）、`to`（必填规范路径）、`roleId?`、`reason?`；提交/状态层至少一个 `change != none`。
- **快照解析例外（F16）**：`parseAmendmentSnapshot`（`:332-339`）以 `validateDocShape(..., allowNoop=true)` 校验不可变快照，**允许 no-op**（全部 `change:"none"`）；该例外仅限应用内部快照读取路径，不得写入角色写作约定。
- 常见错误：`trunk-amendment-invalid`（schema/字段/路径/kind/change/版本/空 items）、`trunk-amendment-not-found`、`trunk-item-invalid`（from/to 文件/基线/哈希）。
- 最小样例：`test/编排/direct-role-capabilities.test.ts:867-876`。

#### A11 `ans-criteria/v1`

- 路径：`docs/acceptance/<flowId>-criteria-vN.md`，文件内**唯一** ```ans-criteria fenced block。
- 校验器：`evidence-check.ts:191-273`（`parseCriteriaText`）、`:276-301`（`loadCriteria`）。
- 块内顶层（**恰为**）：`schema`（字面量 `ans-criteria/v1`）、`flowId`（slug）、`version`（正整数=文件名 N）、`status`（`final/draft`；加载要求 `final`）、`criteria`（1–500）。
- `criteria[]`（**恰为**）：`id`（canonical `AC-n` 或 `Pn.m`；唯一）、`priority`（`P0/P1/P2/P3`）、`title?`（string）。
- 其他：block 内禁止 YAML 文档分隔符 `---`、锚点/别名/合并键；多个 block → `criteria-format-ambiguous`。
- 常见错误：`criteria-format-missing`、`criteria-parse-failed`、`criteria-schema-invalid`、`criteria-version-mismatch`、`criteria-ref-mismatch`、`criteria-empty`、`criteria-too-many`、`criteria-id-invalid`、`criteria-priority-invalid`、`criteria-duplicate-ac`、`criteria-status-draft`、`criteria-missing`。
- 最小样例：`test/编排/evidence-check.test.ts:25-38`。

#### A12 `evidence-meta/v1`

- 位置：证据文件旁的 `<artifact>.meta.json`（默认命名 `validateEvidencePath` 校验）。
- 校验器：`evidence-check.ts:328-370`（解析）、`:373-529`（单/collection 检查）。
- 单文件形状：`schema`（字面量）、`artifact`、`sha256`、`bytes`、`lines`、`generatedAt`（均必填）；`command?`、`exitCode?`、`metrics?`、`acIds?`、`owner?`。
- collection 形状：`schema`、`collection[]`（每项 `artifact/sha256/bytes/lines` + `metrics?/acIds?`）、`generatedAt`、`acIds?`。
- 语义：sidecar 的 artifact/hash/bytes/lines 必须与实际一致；`generatedAt` 不得早于文件 mtime（代码允许 ≤1000ms 容差，`evidence-check.ts:445`）；`acIds` 必须含被检查 AC；P0 证据缺 sidecar 必拒；非 P0 缺 sidecar → `unverified/legacy`。
- 常见错误：`evidence-mismatch`、`evidence-path-invalid`（绝对路径/`..`/`.ans`/`.env`）、`evidence-scope-denied`（不在调用角色模块证据范围）。
- 最小样例：`test/编排/evidence-check.test.ts:119-170,222-225`。

#### A13 `intent-entry/v1`

- 路径：`docs/intents/<intentId>.md`。
- 校验器：`intent-entry-contract.ts:57-104`（唯一解析器）、`:134-151`（intentId 行解析）、`:212-255`（事实）；`governance-judge-intent.ts:196-280`（judge 摘要）。
- frontmatter：`intentId`（契约要求写，小写 slug，与文件名一致；judge 实际只在非空时校验与定位结果一致）、`flowId`（judge 校验若给出必须一致）、`goal`/`scope`/`acceptance`（judge 必填非空）、`nonGoals`（别名 `non_goals/non-goals/nonGoal/outOfScope/...`，可选）、`constraints`（可选）、`customerWords`（别名 `customer_words/customerQuote/...`，可选）。
- 正文（约定）：目标/范围/验收/非目标/客户原话等章节；judge 按标题关键词摘录。
- 常见错误：`intent-missing`（frontmatter 不可解析或缺 goal/scope/acceptance）、`intent-ambiguous`（文件 intentId/flowId 与定位不一致）、`intent-unconfirmed`（intentId 非 slug/三处不一致）。
- 最小样例：`intent-entry-contract.ts:27-37` 为模板（占位符必须替换）；**填充后的具体样例（测试正例输入，§3.4 #7）**：

```markdown
---
intentId: demo-intent
flowId: demo
goal: 交付一个可玩的贪吃蛇小游戏
scope: 单人、键盘控制、计分与重开
acceptance: 启动后完成一局并正确计分
nonGoals: 联机对战
constraints: 仅桌面浏览器
---
# 意图
目标：交付一个可玩的贪吃蛇小游戏。
```

#### A14 `quality-report/v1`（分层：git 严格层 `git-quality-report/v1` + 展示/摘录层）

- 路径：`docs/quality/<flowId>-report-vN.md`（N≥1，最新 N 为展示层当前版）。
- **严格层（git 质量复核路径）**：`readTextQualityProof`（`src/service/trunk/impl/apply-journal.ts:1899-1940`；三处调用 `:1982,2749,2768`）：
  - 证据集合中必须恰有 1 个 `docs/quality/` 下 `.md`，且匹配 `^docs/quality/[A-Za-z0-9_-]+-report-v[1-9]\d*\.md$` 并以 `<flowId>-report-v` 开头；否则 `review-quality-report-missing`。
  - 首个 frontmatter 必须可解析为对象；`schema` 恰为 `git-quality-report/v1`；键集**恰为** `schema/version/taskId/runId/flowId/candidateOperationId/candidate/criteria/checks`（未知键拒绝）；`taskId/runId/flowId` 与当前复核任务一致；`candidateOperationId/candidate/criteria` 与冻结复核基准 canonical 相等；`version` 可选、给出即必须等于文件名 N；含 secret 证据拒绝 → 统一 `review-quality-binding-invalid`。
  - `checks` 必须恰 1 项且恰两键 `{assertion:"nonempty-utf8", artifact:{oid,path,sha256}}`（artifact 恰三键）；oid=最终候选、path=目标、sha256 为字符串；否则 `review-quality-checks-missing`/`review-quality-check-invalid`。
  - 其他拒绝：`review-quality-execution-unproven`（criteria 非单一/非文本物证）、`review-quality-scope-unproven`（集成不是恰一文件文本变更）、`review-quality-content-mismatch`（blob/hash/非空 UTF-8 断言失败）。所有拒绝统一经 `invalid(...)` 返回 `trunk-item-invalid`。
  - 测试 seam：无导出纯校验器 → 服务级最小夹具（复用 `test/测试/git-role-workflows-e2e.test.ts` 的生产路径，`:277-280,710`）或源码文本钉住（键集/错误码字面量）；残余风险见 §9.2。
- **展示/摘录层**：`src/common/编排/project-state.ts:69,501-524` 只按文件名/版本扫描（展示 evidence 指针，不解析内容）；治理 judge 把**首个非空行**作为「报告首行（五项）」摘录，并摘录 frontmatter 与「结论/判定/档位/证据/复用/回归/验收」章节（`governance-judge-evidence.ts:553-561`；不解析五项字段）。
- 写作约定（展示层不强制）：verifier 角色卡要求报告写 `docs/quality/<flowId>-report-vN.md`（`src/common/roles/verifier/index.ts:46,377`）。**不得把严格层的键/绑定写成展示层必须**，反之亦然；两层分别标注 `enforcement`。

#### A15 `workflow/v1`（仅约定 + 稳定文件约束）

- 路径：`docs/workflow.md`（稳定文件名，不版本化）。
- 约束：执行 trunk 的 `artifacts.workflow` 必须为 `kind:"workflow"` + 该路径 + sha256（`src/model/trunk.ts:139-144`；`prepareExecutionRun` 拒绝缺 workflow：`apply-journal.ts:3405`）；stable 写入须当刻确认（`stable-write-service.ts`）；
- 派发必读：任务文本引用 `docs/workflow.md` 时附 sha256 必读块；缺失时**降级标注不拒投**（`handback.ts:319-346`）。
- 内容约定（不解析）：步骤表（步骤/角色/前置依赖/契约/交接物/完成口令/验收），由 convener 维护（`src/common/roles/convener/index.ts:61`）。

#### A16 `contract-md/v1`（仅约定）

- 路径：`docs/contracts/<name>-vN.md`；版本化、旧版只读；被派发文本按地址引用时附必读块与运行期哈希（`handback.ts:286-346`）；版本化冻结/覆盖由 `versioned-doc-guard.ts` 管。无 schema、无结构解析。

#### A17 `role-card/v1`

- 路径（三文件，规范路径强校验）：`角色卡/<roleId>/role-card.md`、`boundary.md`、`boundary.yaml`（`boundary-core.ts:80-82`）。
- 必填章节（`ROLE_CARD_REQUIRED_SECTIONS`，`governance-roles.ts:351-362`）：组别、工作立场、能力描述、职责与功能导航、必读资料、交接输入输出、执行原则、质量职责、标准工作流、交付物清单（等价中文/英文标题）。校验实现按**任一 `#{1,6} 空白` 行**匹配（`boundary-core.ts:84-87`）；展示解析会忽略 fenced code block（`role-card-sections.ts:76-100`）——两者口径差异如实写入规范。
- 展示解析（不拒绝）：首个 H1 为 title；「能力描述/职责与功能导航/交接输入输出/标准工作流/执行原则」章节正文（≤4000 码点）；组别/组内职责字段行（`role-card-metadata.ts:4-27`）。
- 关联拒绝码：`role-document-path-mismatch`、`role-card-section-missing:<label>`、`invalid-project-role-id`、`boundary-role-mismatch`、`boundary-md-yaml-mismatch`、`invalid-role-boundary-scope`、`boundary-outside-role-modules`、`duplicate-or-unscoped-role`、`module-owner-overlap`、`frozen-role-archived`。
- 样例：无仓库内项目角色卡；规范提供按 10 章节的最小模板（由真实 `validateRoleDocumentsSnapshot` 测试钉住）。

#### A18 `boundary-md/v1`

- 路径：`角色卡/<roleId>/boundary.md`；解析 Section 1（标题含 `Section 1` 或 `可修改文件与目录`）下的 Markdown 表格（`boundary-parse.ts:75-127`）。
- 列：类型（file/directory/条件目录；中英文关键词）、路径（优先反引号；去括号说明；去 `or` 后半）、用途。条件目录必须在类型列/额外列给合法 slug。
- 宽松解析：不可识别行跳过；但最终条目集合必须与 `boundary.yaml` **恒等**（root/kind/path/condition 排序后 JSON 相等，`boundary-core.ts:95-98`），否则 `boundary-md-yaml-mismatch`。
- 样例：`角色卡/编排/boundary.md`（真实）。

#### A19 `boundary-yaml/v1`

- 路径：`角色卡/<roleId>/boundary.yaml`。
- 严格解析：`boundary-yaml.ts:46-124`；顶层只允许 `role/entries/archived`（未知键给出纠正提示）；`archived` 必须 boolean；`entries` 必填数组；每条只允许 `kind/path/purpose/root/condition`；`kind` ∈ `file/directory/conditional-directory`；`path`/`purpose` 必填非空；`root` ∈ `project/skill`（缺省 project）；`conditional-directory` 必须合法 `condition` slug。
- 写前校验与运行时加载共用同一 parser（单一来源，`:44-45`）。
- 常见错误：`YAML 语法错误`、`顶层必须是映射`、`未知顶层键`（roleId/version/root 等有专门提示）、`entries[i]` 未知键/kind/path/purpose/root/condition 非法、`archived` 非布尔。
- 样例：`角色卡/产品/boundary.yaml`。

#### A20 `skill-install/v1`

- 路径：`docs/skills/<name>/install.md`（登记）+ `docs/skills/<name>/SKILL.md`（内容）。
- 登记字段（四字段缺一即坏件）：`用途`、`适用角色`（`、`/`，`/`,` 分隔）、`状态`（`installed/uninstalled`）、`安装日期`（首个 `YYYY-MM-DD`）。
- 渲染：命中状态 installed 且角色在列表 → 注入 `docs/skills/<name>/SKILL.md` 路径 + 运行期 sha256；坏件跳过 + 诊断，不拒开会话；零技零渲染。
- 样例：`test/pi-adapter/installed-skills-injection.test.ts`（夹具）。

#### A21 `mcp-declaration/v1`

- 路径：`docs/mcp/<name>.md`；名字=`[A-Za-z0-9_-]+`，保留名 `ans/ans_codex` 拒。
- 七键：`用途`、`启动`（必填非空，无控制字符）、`参数?`（`|`/`｜` 分隔）、`环境?`（`;`/`；` 分隔；值字面量或 `env:NAME`；`!` 开头拒）、`适用角色`、`状态`（`installed/uninstalled`）、`安装日期`。
- 坏件跳过 + 诊断；`uninstalled`/角色不命中静默过滤；零声明=`docs/mcp` 不存在。
- 样例：`test/runtime-core/mcp-declarations.test.ts:87` 附近。

#### A22–A25（仅约定）

- `change-package/v1`：`docs/scheduling/<flowId>-change-v1.md`，legacy 判断物证摘录（frontmatter riskTier/candidate/changedPaths + 关键词章节）；**无校验器、仅摘录**（`governance-judge-evidence.ts:573-585`）。
- `role-change-record/v1`：`角色卡/<role>/docs/change|fix/*.md`，应用不读取；边界授予目录。
- `bootstrap-manifest/v1`：应用写（audience `app-managed`），角色不可写、不可读；无读解析（仅写不读）。
- `verification-attachment/v1`：证据附件任意文件；元数据走 A12。

### 2.5 「被真实解析」与「仅约定」的边界（必须如实）

- **严格解析/形状校验**：A1、A3–A5、A8–A13、A14（git 严格层）、A17–A21；B1–B29 的大部分。
- **只做 schema/frontmatter 字面量比对（不属严格解析）**：A2（roster 加载为子串匹配 schema + 正文含 intent 路径；upgrade/pin 为 frontmatter 字面量比对）、A6、A7。
- **只做文件名/版本扫描或摘录**：A14（展示层）、A22（摘录）、B17/B18 派生视图。
- **仅约定（应用不解析/不校验）**：A15（workflow 内容）、A16（contracts 内容）、A22–A25（A22 仅摘录；A24 应用写、角色不写）、角色卡展示字段中未被校验的部分。
- 规范文本必须逐条标注 `enforced: true/false`；**不得把写作约定写成硬校验**（见 §3.4 #3 overclaim guard）。
- 注意：仓库自身的 `docs/acceptance/*.md`、`docs/planning/*`、`docs/communication/*`、`docs/scheduling/*change*` 是**本项目治理记录**，不是被应用解析的目标项目格式；本表只收应用在**目标项目**读取的格式。

### 2.6 明确不在本变更清点范围

- 应用 `userData` 下的偏好/运行时选择/诊断/会话索引（`<userData>/ans/*.json`、`*.jsonl`）——非项目文档，非角色可读面。
- `.git/**`、`node_modules/**`、构建产物。
- 人读治理记录（`docs/planning`、`docs/communication`、仓库 `docs/acceptance` 的验收报告/标准文档）——不是应用解析器输入。
- `docs/audit/shell-gate.jsonl`：应用写审计账本（`shell-audit.ts:25,159`；`shell-post-audit.ts:331`）；无结构读取/校验（仅存在性探测），非项目文档格式 → 不入注册表；schema/资源扫描白名单理由「仅写不读」（F4）。
- `src/common/门禁引擎/workflows/chief/chief-workflow.md`（资源版本 `chief-workflow/v1`）：应用包内 Markdown 资源；`provider/runtime/tools.ts:175-191` 读取并校验身份/版本/hash，不是目标项目文档、角色不可写 → 排除；白名单理由「应用内资源」（F4）。
- `git-initialization/v1` 等 Git 存储操作媒体标识（`provider/trunk/abstract/trunk-store.ts:188-195`；`git-command.ts:94-99`）：应用内部存储记录身份，非项目文档 → 白名单理由「存储媒体标识」；`git-ref/v1` 已由 B29 覆盖（F4）。
- 其他非文档字面量（schema 扫描白名单）：`version-change-service/v1`（服务契约版本常量，`src/service/version-change/public/version-change-service.ts:20`）——理由「服务契约版本标识，非项目文档」；`chief-hub-resume/v1`（`apply-journal.ts:2156` 的 `directHash` 域分隔标签）——理由「哈希域分隔标签，非 schema」（S2）。

---

## 3. 设计：单一事实来源

### 3.1 总体结构（[设计候选]）

| 层 | 文件（owner） | 职责 |
| --- | --- | --- |
| 规范注册表 | `src/common/编排/doc-format-specs.ts`（编排）**新建** | 全部格式的 `DocFormatSpec` 数据 + `docFormatIndexText()` + `docFormatSpecText(id, part?)`；纯数据/纯渲染，**无 I/O、无判定** |
| 工具契约 | `src/model/runtime.ts`（运行时核心） | `DocFormatInput`/`DocFormatResult`/`DocFormatFn` + `GovernedToolsOptions.docFormat?`（加法可选；`GovernedToolsOptions` 在 `:3450`，`contractCheck` 在 `:3522`；F11） |
| 工具实现/注册 | `src/provider/runtime/tools.ts`（运行时核心） | `makeDocFormatTool` + `buildGovernedTools` 注入才注册 |
| 工具描述 | `src/provider/runtime/schema.ts`（运行时核心） | 参数 schema（扁平对象）、description、promptGuidelines |
| 编排透传 | `src/pipeline/orchestration/run-role.ts`（编排） | `openRoleSession` **输入字段** `docFormat?`（`contractCheck` 在 `:875`）+ `AdapterCapabilities.docFormat?`（界面 `:304-438`；`contractCheck` 在 `:409`）+ 两处 capabilities 透传（`:2106`、`:3546`；G1）。`RoleSessionDeps`（`:3470`）仅 `createAdapter`/`runtimeOptions`，**不加** `docFormat` |
| 桌面数据源/注入 | `app/desktop/session.ts`（桌面窗口） | `docFormat: (input) => this.docFormatText(...)`；**所有角色会话**注入；数据源静态早退 |
| 一致性测试 | `test/编排/doc-format-specs.test.ts`（编排，新建）；`test/门禁引擎/doc-format-specs-pin.test.ts`（门禁引擎，新建）；`test/runtime-core/doc-format-specs-pin.test.ts`（运行时核心，新建）；`test/桌面应用/session.test.ts`（桌面窗口，**新建：恢复已删除路径**，F5）；`test/测试/doc-format-all-roles.test.ts`（测试，新建） | §7 |

**为什么放在 `src/common/编排/`**：全部 `project-*`/team plan/flow/amendment/criteria/evidence-meta/workflow/contract 的解析器与 schema 常量都在 `src/common/编排/`（`workflow-preconditions.ts`、`run-manifest.ts`、`evidence-check.ts`、`task-state.ts`、`installed-skills.ts`）或其下游 `src/service/trunk`；`model/*` 常量可 import；共享层的 `intent-entry-contract.ts` 可 import（方向 `shared ← engines`）。这样规范模块可以直接 import **公开导出的 schema 常量与既有示例常量**；**内联字面量与跨角色私有常量不强制 import**（F6），按 §3.3 #3 的三层策略处理。`app/desktop/session.ts` 已有从 `src/common/编排/workflow-preconditions.ts` 导入 `contractSchemaText` 的先例（`session.ts:158-167`），依赖方向已被接受。

**依赖/公开入口纪律（避免循环与越界）**：

- `doc-format-specs.ts` 的头部注释声明它为**稳定的公开只读入口**（与 `workflow-preconditions.ts` 同类：纯数据/纯渲染、无 I/O、无判定）；跨角色消费方（桌面会话/测试）只 import `docFormatIndexText`/`docFormatSpecText`/`DOC_FORMAT_SPECS`/`DOC_FORMAT_SPEC_VERSION` 与类型，不 import 任何 parser 私有实现。
- **单向依赖**：`doc-format-specs.ts → workflow-preconditions.ts`（常量/示例/`contractSchemaText`）单向；`workflow-preconditions.ts` **不 re-export** 规范模块（避免循环）。桌面同时 import 两个模块即可（一个既有公开入口 + 一个新公开只读入口）。
- 该文件位于编排 Section 1 已授权目录 `src/common/编排/`，**不新增路径**（§6.2 H1 delta 无）；若治理认为「公开入口清单」需要文字登记，属编排角色 `docs/feature` 的常规记录，不是 Section 1 变更。

### 3.2 规范数据模型（[设计候选]）

```ts
// src/common/编排/doc-format-specs.ts
export const DOC_FORMAT_SPEC_VERSION = "doc-format-specs/v1" as const;

export type DocFormatAudience = "role-authored" | "convention" | "app-managed";
export interface DocFormatValidatorRef {
  kind: "strict-parser" | "shape-check" | "frontmatter-check" | "filename-only" | "convention";
  file?: string;     // 仓库相对路径（convention 型可省略）
  symbol?: string;   // 函数/常量名（convention 型可省略；实现以符号名锚定，行号只作参考）
  note?: string;
}
export interface DocFormatFieldSpec {
  name: string;                 // 字段路径（如 "modules[].id"）
  type: string;                 // "string" | "正整数" | "string[]" | "对象" | "boolean" | "枚举"
  presence: "required" | "optional" | "conditional";
  enforcement: "validator" | "convention"; // 校验器强制 vs 仅写作约定
  constraints?: string;         // 正则/枚举/非空/范围/别名
  note?: string;
}
export interface DocFormatTestSeam {
  kind: "exported-pure" | "public-path-fixture" | "text-shape";
  symbol?: string;              // exported-pure：导出函数/常量名
  fixture?: string;             // public-path-fixture：最小公开路径夹具说明
  note?: string;                // text-shape：钉住方式与残余风险（§2.3.1）
}
export interface DocFormatSpec {
  id: string;                   // 稳定 id（工具枚举名；如 "project-roster/v3"）
  title: string;                // 一句话用途
  audience: DocFormatAudience;
  stage: string;                // 流程阶段（意图/提案/名单/执行/验收/角色/安装/内部）
  pathPattern: string;          // 路径模板或正则
  schemaLiteral?: string;       // **单值**（一行一 id，F3）；与解析器常量/内联字面量同值（§3.3 #3 三层策略）；无斜杠字面量/无 schema 字段在 note 注明
  schemaLiteralNote?: string;   // 如 teamPlanSchema:3、quality-report→git-quality-report/v1、行内 v:1
  validator: DocFormatValidatorRef; // 主校验器/约定标记（§7.1 逐 spec 断言；convention 型用 kind:"convention"）
  fields: readonly DocFormatFieldSpec[]; // contract-topic 格式可为空（正文复用 contractSchemaText）
  loadChecks?: readonly { code: string; rule: string }[];
  commonErrors: readonly { code: string; cause: string; fix: string }[];
  example?: string;             // 最小合法样例（full-document/frontmatter/block/object）
  exampleKind?: "full-document" | "frontmatter" | "block" | "object";
  render?: () => string;        // 复杂格式（modules/roster/topology）复用 contractSchemaText
  testSeam?: DocFormatTestSeam; // B 组/A14 严格层的测试 seam（F8）
  specRevision: number;         // 每次文本实质变化 +1
}
export const DOC_FORMAT_SPECS: readonly DocFormatSpec[];
export function docFormatIndexText(): string;                        // ≤8192 B（F14；P1 实测校准）
export function docFormatSpecText(id: string, part?: "all"|"fields"|"example"|"errors"): string; // 每格式 ≤8192 B；render 型 part 整段返回（F7）
export function docFormatKnownIds(): readonly string[];
```

- **索引**（无参数）：按 `stage` 分组，每行 `- <id> — <title>（<audience 标签>）`；首行 `doc_format（只读；不构成放行/授权；<DOC_FORMAT_SPEC_VERSION>）`；末行提示 `format=<id>` 取详情、`part=fields|example|errors` 缩小范围。**54 个 id 全量可发现是目标**；预算 ≤8192 B，P1 实测；若超限，B 组按 stage 汇总一行（`B 组内部格式 N 种：可用 format=<id> 查询`）并保留详情可查（F14/Q14）。
- **分层口径**：同一字段在不同校验层可能口径不同（典型：`project-intent/v1` 的 `schema` 在意图确认门必填、在 run pin 缺失不拒；`project-proposal/v2` 的 `schema` 在 roster 加载是子串、在 upgrade/pin 是 frontmatter 解析；`quality-report/v1` 的严格层键集与展示层摘录）。此类字段用 `presence:"conditional"` + `note` 记录每层规则；变异矩阵**按层分别断言**，不能用一个字段行掩盖差异。
- **详情**：固定顺序：头部（id/title/audience/路径/版本/schema/校验器锚点）→ 字段表（强制/约定分栏）→ 加载级约束与 error code → 最小合法样例（代码块）→ 常见错误与修复 → `specRevision`。
- **未知 id**：`{ok:false, message:"未知格式 <x>；可用：<ids>"}`（不读盘、不回显超长输入，≤40 字符引号）。
- **part**：`fields` 仅字段表 + 加载级；`example` 仅样例；`errors` 仅错误表；`all`（默认）全部。用于大格式（roster/team plan/role-card）在预算内读取。**render 型例外（modules/roster/topology）**：`part` 仍接受，但不细分，一律返回整段 `render()` 文本并在首行标注「该格式复用原文，整段返回」；测试按此断言（F7）。
- **id 与字面量关系**：一个 spec 恰一个 id；`schemaLiteral` 单值；`team-plan/v3`→文档字面量 `teamPlanSchema:3`、`quality-report/v1`→严格层 `git-quality-report/v1`、`version-baseline/v1`→行内 `v:1`、`download-consumer/v1`→`version:1`、`operation-delivery/v1`→无 schema 字段，均在 `schemaLiteralNote`/header 注明（F3/F16）。

### 3.3 复用而非复制（单一来源的具体落点）

1. **modules/roster/topology**：`render` 直接返回既有 `contractSchemaText("modules"|"roster"|"topology")`（`workflow-preconditions.ts:180-259`，导出入口 `:257-259`）；`docFormatSpecText` 在复用原文前加一行来源说明「以下为 contract_check 同源原文（只读展示；本工具不构成放行/授权）」，再只加头部/尾部与 `specRevision`，**不重写字段表**（F13）。示例复用 `PROJECT_MODULES_SCHEMA_EXAMPLE`/`PROJECT_ROSTER_SCHEMA_EXAMPLE`/`PROJECT_TOPOLOGY_SCHEMA_EXAMPLE`（`:118-178`）。**part 语义**：这三个 render 型 spec 不支持细分；`part=fields|example|errors` 一律返回整段原文并附「该格式为复用原文，整段返回」提示（F7）。测试断言详情文本 `includes(contractSchemaText(topic))` 且 schema 常量出现行集合不变。
2. **intent entry**：直接复用 `INTENT_ENTRY_TEMPLATE`、`INTENT_ENTRY_NAMING_RULE`、`INTENT_ENTRY_ID_RULE`（`intent-entry-contract.ts:19-37`）。
3. **schema 字面量（三层策略，F6）**：
   1. **公开导出常量**（`PROJECT_*`、`RUN_*`、`TEAM_PLAN_SCHEMA`、`CRITERIA_SCHEMA`、`EVIDENCE_META_SCHEMA`、`TRUNK_*`、`VERSION_CHANGE_SCHEMA`、`DOC_FREEZE_SCHEMA`、`STABLE_WRITE_SCHEMA`、`REFACTOR_REQUEST_SCHEMA`、`VERSION_DECISION_SCHEMA`、`CUSTOMER_DIRECTIVE_SCHEMA`、`DOWNLOAD_REQUEST_SCHEMA`、`GOVERNANCE_MATRIX_SCHEMA`、`PROJECT_STATE_SCHEMA` 等）：`schemaLiteral` 直接 import，不手写。
   2. **内联字面量/无导出常量**（`run-repin/v1`、`team-plan-completion/v1`、`role-authorization/v1`、`role-activation/v1`、`repository-work-source/v1`、`stable-initial-workflow*`、`doc-freezes/v1`、`git-quality-report/v1`、`git-ref/v1` 等）：spec 持有**唯一字面量副本**；由相应 owner 的 pin 测试用真实 parser/源码文本断言钉住（复制 + 测试钉住；不宣称 import 单一源）。
   3. **跨角色私有常量**（A17–A19 的 `ROLE_CARD_REQUIRED_SECTIONS`/boundary `KINDS/ROOTS/TOP_KEYS`；A21 的 `NAME_PATTERN/RESERVED_NAMES/ENV_NAME_PATTERN`）：生产模块 `doc-format-specs.ts` **不跨角色 import 私有实现**；由 owner 侧 pin 测试（`test/门禁引擎/`、`test/runtime-core/`）import 自己角色的私有常量并与 spec 文本交叉断言。若 owner 同意新增公共只读出口（写集扩展、需另评 H1/协调），可作为后续强化，本方案默认不做。
   - 一行一 id + `schemaLiteral` 单值（F3）；`team-plan/v3` 的 id 与文档字面量 `teamPlanSchema:3` 的关系、A14 的 `git-quality-report/v1` 严格层在 header/`schemaLiteralNote` 注明。
4. **既有角色卡片段**（su 卡边界 YAML 片段、策划卡产物行、意图入口角色摘要）：不搬走、不改写；规范以工具为权威，测试把既有片段中的示例抽出来喂真实 parser（§3.5），防止片段变成无效建议。
5. **不得新建第二份 Markdown 规范**：不创建 `docs/format-specs.md`、不在角色卡抄字段表、不生成技能文件副本。若未来需要人类可读版本，只能由同一模块在**运行时**渲染（不落盘进 repo）。

### 3.4 漂移防护（测试钉住「说明 == 校验器」）

1. **合法样例必过（正例）**：每个格式的 `example` 由对应真实校验器解析：
   - 严格 parser：`parseProjectModules`/`parseProjectRoster`/`parseTeamPlan`/`parseCriteriaText`/`parseEvidenceMeta` 等返回 `ok:true`；意图文档走 `prepareIntentConfirmation`/`schemaMatches`；
   - 门禁/role-card/boundary：`validateBoundaryYamlText`、`validateRoleDocumentsSnapshot`、`parseSnapshotRoleDocuments` 返回 ok；
   - 文件级 gate：在临时项目根写 example + 依赖文件，调用 `loadLatestRoster`/`prepareRunPin`/`prepareIntentConfirmation`/`validateAmendment` 等返回 ok（或仅返回预期 code 之外的 ok）。
   - **B 组按 §2.3.1 的 `testSeam` 逐行执行**：`exported-pure` 直接 import 纯校验器；`public-path-fixture` 构造最小公开路径夹具；`text-shape` 仅做源码文本/形状断言并在 §9.2 如实记录残余风险。
   - **A14 严格层**：无导出纯校验器 → 服务级最小夹具（复用 `test/测试/git-role-workflows-e2e.test.ts` 生产路径）或源码文本钉住（键集/错误码字面量断言 `apply-journal.ts` 存在）；不得宣称纯校验器正例。
   - **示例字符串只定义一次**：spec 的 `example` 就是测试输入；测试不得另写夹具副本。
2. **必填删除/类型变异矩阵**：对每个 `enforcement:"validator"` 字段：
   - 删除该字段（或置 null）→ 校验器必须拒绝（断言 `ok:false` 或抛出预期错误；能断码的断码）；
   - 类型替换（string→boolean/number/array/object）→ 必须拒绝；
   - `enum` 字段替换为非法值 → 必须拒绝；
   - `presence:"optional"` 字段删除 → 校验器必须仍 ok。
   矩阵按格式表生成（数据驱动测试），字段表变动会立即反映到测试数量/断言。
3. **约定字段反证（overclaim guard）**：对每个 `enforcement:"convention"` 字段：
   - 构造一个**违反该约定**但语法合法的值，断言校验器**仍接受**（证明规范没有把约定写成硬校验）；
   - 若校验器意外拒绝，测试失败并要求把该字段升级为 `validator` 并补错误码。
4. **schema 字面量全仓扫描**：测试扫描 `src/**/*.ts` 中形如 `"[a-z][a-z0-9-]*/v[0-9]+"` 的字符串常量，断言每个都出现在 `DOC_FORMAT_SPECS.schemaLiteral` 或一份**显式排除白名单**（含理由：`chief-workflow/v1`＝应用内资源；`git-initialization/v1`＝存储媒体标识；`version-change-service/v1`＝服务契约版本（`public/version-change-service.ts:20`）；`chief-hub-resume/v1`＝`directHash` 哈希域标签（`apply-journal.ts:2156`）；非文档 key/文件名）。`git-quality-report/v1` 由 A14 覆盖；`git-ref/v1` 由 B29 覆盖；数值版本格式（`versions.jsonl` 的 `v:1`、`download-consumer.json` 的 `version:1`）无斜杠字面量，由冻结 id 清单覆盖。新增格式字面量未登记 → 测试失败（S2）。
5. **冻结 id 清单**：`test/编排/doc-format-specs.test.ts` 内维护 §2.2/§2.3 的 id 数组（**54 个**）；断言等于 `DOC_FORMAT_SPECS.map(s=>s.id)`。新增/删除格式必须同步两处（评审可见）。
6. **加载级/主错误码钉住**：对每个 `loadChecks.code` 与每个 A 格式的主要 parser 错误码，用最小夹具复现一次（至少覆盖 `roster-*`、`modules-doc-*`、`run-pin-*`、`plan-*`、`criteria-*`、`evidence-*`、`trunk-amendment-*`、`review-quality-*`、`role-card-section-missing`、`boundary-md-yaml-mismatch`）。
7. **既有说明片段不失效**：把 su 卡边界示例、**§2.4 A13 的填充样例**（不是含占位符的 `INTENT_ENTRY_TEMPLATE`，G4）、`contract_check` 示例分别喂真实 parser（边界：`validateBoundaryYamlText`；意图入口：`summarizeIntent`；contract：`parseProjectModules/Roster`），断言 ok。
8. **稳定 code 扫描（F9/G2）**：按已知 code 族前缀收集 `src/**` 中的稳定 code 字符串（至少 `modules-doc-*`、`roster-*`、`plan-*`、`criteria-*`、`evidence-*`、`run-pin-*`、`run-manifest-*`、`review-quality-*`、`trunk-amendment-*`、`boundary-*`、`role-*`；**含不以 `-invalid/-missing/...` 结尾的成员**，如 `modules-doc-frontmatter/yaml/flow/modules`、`roster-role-builtin/duplicate`、`roster-directory-*`、`roster-module-*`），断言每个出现在 spec 的 `commonErrors`/`loadChecks` 或显式白名单（含理由）；防止 parser 分支有码而规范漏列。P2 先以 A3/A4/A14 与新增 B 行为种子，白名单随覆盖收敛。

### 3.5 版本演进策略

- `DOC_FORMAT_SPEC_VERSION` 是**规范模块契约版本**（工具输出头部可见），只在规范结构/语义变化时升级；文档格式版本由各格式自己的 schema 字面量/文件名规则决定，二者独立。
- 每个 `DocFormatSpec.specRevision` 在文本实质变化（字段/枚举/错误/样例）时 +1；纯错别字修正可不升，但交付回执说明。
- 格式升版（如 `project-roster/v4`）：解析器常量升级 → `schemaLiteral` 随 import 变化 → 旧 `id` 从注册表移除、新增新 id；测试的冻结清单与 schema 扫描会强制同步；`docFormatSpecText` 的未知 id 错误列出当前 id。解析器自身对旧版的拒绝文案保持不变（规范只解释，不改校验）。
- 兼容：工具输入/输出对旧调用是加法；`doc_format` 不存在时所有既有行为逐字不变（注入才注册）。

---

## 4. 可读取性设计（所有内置治理角色与项目角色）

### 4.1 工具契约（[设计候选]）

- 名称：`doc_format`（只读；工具名与 `contract_check` 同级）。备选名 `read_doc_format`（Q1）。
- 输入（扁平对象，无顶层 oneOf/anyOf）：
  - `format?: string`：格式 id；缺省/空串 → 索引模式。
  - `part?: "fields" | "example" | "errors"`：可选；缺省全部。
- 输出：纯文本（非 JSON），首行固定 `doc_format（只读；不构成放行/授权；<specVersion>）`；索引 ≤8192 B；详情 ≤8192 B；render 型 `part` 整段返回并附说明（F7）。
- **返回形状（S1）**：`DocFormatFn` 与 `ContractCheckFn` 同型——数据源返回**纯文本**（`string | null | undefined | void | Promise<...>`）；`docFormatText` 返回 `Promise<string>`（与 `contractCheckText` 同型），由 `makeDocFormatTool` 统一包装为工具结果 `{ok:true, message}` / `{ok:false, message}`（与 `makeContractCheckTool` 一致）。
- 失败：非字符串 `format` 由工具层拒绝；未知 id 由数据源返回纯文本「未知格式 …；可用：…」（回显 ≤40 字符）；数据源返回 null/空/抛错 → 工具层 `{ok:false, message}`（"数据源未返回格式说明（结果不明）"或如实报读取未完成）；不抛、不猜。
- **零磁盘 I/O**：数据源第一条语句静态早退到 `docFormatIndexText()/docFormatSpecText()`；早退前不得调用 `getListing`/`refreshListingNow`/任何 `readFile`/`writeFile`。不读 run、不读项目、不含角色/项目事实（静态公开信息）。
- 预算：工具层 `truncateUtf8` 防御性截断并在尾部标注「已截断；用 part=fields|example|errors 缩小范围」；索引上限 8192 B（F14）。

### 4.2 注入矩阵（谁能读）

| 会话类型 | 是否注入 `docFormat` | 依据 |
| --- | --- | --- |
| 内置治理角色（chief/product/rapporteur/nominator/convener/verifier，含旧 su） | **是** | 桌面 `openRoleSession` 与 `contractCheck` 同位无条件注入（`app/desktop/session.ts:3850-3851,4341`）；编排透传（`run-role.ts:2106,3546`）；未注入 ⇒ 工具不注册（既有「注入才注册」纪律） |
| 项目角色（roster 动态） | **是** | 项目角色走同一 `openRoleSession` 路径；不依赖技能安装/角色 id 预登记 |
| judge 会话（「替我审」/「替我决策」） | **否（逐字不变）** | judge 会话不经过 `buildGovernedTools`，只装配 `buildShellJudgeTools`/`buildGovernanceJudgeTools` 恰三只（`src/common/runtime-core/governance-judge/tools.ts:3-16,65-67`） |
| 有界 Chief 决策会话（`chiefDecisionContext`） | **否（逐字不变）** | 只允许 `decide_pending_request`（`src/provider/claude/session.ts`/`codex/session.ts` 的 bounded 分支） |
| CLI/旧调用方未注入 | **否** | 能力缺席 = 工具不存在（fail-closed；既有先例 `contract_check`） |

- 桌面注入实现：在 `openRoleSession` 输入对象与 `AdapterCapabilities` 中加 `docFormat`（与 `contractCheck` 相邻；G1）；`docFormatText` 方法与 `contractCheckText` 同型（返回 `Promise<string>`）：`if (input.format === undefined || input.format.trim()==="") return docFormatIndexText(); ...`，静态早退，不触 listing/run；`{ok,message}` 信封由工具包装层统一生成（S1）。
- 工具在 `buildGovernedTools` 中注册于 `contractCheck`/`evidenceCheck` 相邻位置（`tools.ts:5206-5211`），保持 `contract_check` 行为不变。

### 4.3 发现机制（不改角色卡/不替代必读）

- **工具描述**（`describeTool("doc_format").description`）明示：写任何治理文档/角色卡/边界/验收标准前先查；无参数列全部格式；只读、不构成放行。
- **`promptGuidelines`**：随工具注册进入 Claude/Codex 系统提示（`src/provider/claude/session.ts:318` 的 `options.tools.flatMap(tool => tool.promptGuidelines ?? [])`；`src/provider/codex/session.ts:510` 同构）。Pi 的系统提示不拼接 promptGuidelines（`src/common/pi-adapter/real-adapter.ts:372-383` 只拼角色卡/contextSections/技能），但工具定义**逐工具透传** `promptGuidelines`（`real-adapter.ts:482-496` `toPiTool`；`:1589` `bindRole`），且模型仍能看到**工具描述**——三通道合并覆盖三运行时（F12）。确定性测试断言 `toPiTool(describeTool("doc_format"))` 的 description/promptGuidelines 非空。
- **索引模式**：模型无需先知道 id；调 `doc_format()` 即得全部 id + 一句话用途。
- **不改角色卡**：本变更不编辑 `角色卡/**`、不改 `ROLE_CARD_REQUIRED_SECTIONS`、不改已有 `contract_check`/技能/派发必读机制。角色卡/技能仍是原机制；`doc_format` 是补充的只读说明面（可引用，不替代）。
- 若验收发现模型不主动查（§9.1 风险行 / §8 Q12），后续可在角色卡加一行指引（独立变更）。

### 4.4 预算、截断与不可用回落

- 索引 ≤8 KiB，单格式 ≤8 KiB（UTF-8 字节，按 `Buffer.byteLength`）；part 模式进一步缩小。**单格式详情内的最小样例目标 ≤3 KiB**（超大样例改为 frontmatter/block 最小片段；render 型整段受详情上限约束）。P1 必须用实际 spec 文本实测索引字节（F14）；若超限，B 组按 stage 汇总一行（Q14）。
- 超限：数据源先按 part 裁剪；仍超限 → `truncateUtf8` 截断 + `…（已截断；用 part=fields|example|errors 缩小范围）`，绝不静默返回半截当完整。render 型整段文本若超限，同样截断并提示。
- 不可用（数据源抛错/空）：工具 `ok:false` 如实报「读取未完成/结果不明」，不编造说明；角色可按既有流程 blocked 或改用 `contract_check`（三格式）。
- 工具自身无副作用：不写盘、不入队、不改权限/状态/会话。

### 4.5 与既有必读机制的关系

- **技能**（`installed-skills`）：仍按原机制注入；`doc_format` 不安装技能、不写 `docs/skills`。
- **派发必读**（`handback`）：仍按地址附契约/workflow 与运行期哈希；不变。
- **`contract_check`**：三格式原文继续由它提供；`doc_format` 对这三 id 返回同一原文（另加来源说明行，§3.3），避免第二份。
- **角色卡**：不改；内置卡与项目卡仍是角色身份/职责来源。
- **judge 隔离**：judge 会话工具集与系统提示逐字不变。

### 4.6 扁平 schema 约束（避免「呈空」重演）

- `doc_format` 的参数 schema 必须是**扁平对象**（顶层 `type:"object"` + `properties` + `required:[]`；**禁止**顶层 `oneOf`/`anyOf`），以便 `tools/list` 与各运行时展示层都能显示参数。
- 测试：`describeTool("doc_format").parameters` 断言无顶层 `oneOf`/`anyOf`、`properties` 非空；codex 本地 MCP `tools/list` 返回同一 `inputSchema.properties` 非空（`src/provider/codex/session.ts:693` 同路径）。
- 本变更**不修** `dispatch_task`/`git_candidate` 的呈空问题（§1.1 观测 B；另案）。

---

## 5. 非目标 / 不变量

1. **不放宽任何校验规则**：所有 parser/validator 的接受/拒绝集合逐字不变；本变更只新增只读文本与测试。**不修改** `workflow-preconditions.ts` 的解析逻辑、`apply-journal.ts` 的门禁、`run-manifest.ts` 的 pin 规则、`boundary-*.ts`、`evidence-check.ts`、`amendment-validate.ts`、`upgrade-validate.ts`。
2. **不改变任何文档格式**：不改 schema 字面量/版本号/文件名约定/字段。
3. **不建第二份漂移说明**：不新增仓库 Markdown 规范副本、不改技能文件、不在角色卡复制字段表；modules/roster/topology 复用 `contractSchemaText`；schema 字面量按 §3.3 #3 三层策略（公开常量 import；内联/私有常量副本 + owner pin 测试）。
4. **不替代既有角色卡/流程必读机制**：技能注入、派发必读、`contract_check`、角色卡正文全部保留；只新增只读工具。
5. **不改 judge 代批/提案卡修复的并行文件**：本变更不编辑 `src/service/trunk/impl/apply-journal.ts`、`src/common/编排/run-manifest.ts`、`app/desktop/customer-input.ts`、`test/桌面应用/chief-workflow.test.ts` 及 judge 写集（`src/model/version-change.ts`、`src/service/version-change/**`、`src/provider/version-change/**`、`src/pipeline/orchestration/trunk-runtime.ts`、`version-change-runtime.ts`、`src/common/编排/task-state.ts`、`src/common/门禁引擎/classify-shell.ts`）；`src/model/runtime.ts` 与 judge **同文件不同区域**（唯一机械重叠），按 §10 串行写入（同一时刻只有一个变更编辑）；`app/desktop/session.ts`/`run-role.ts` 与 judge/提案卡修复**无冲突**（judge 明确排除；F2）。
6. **不碰贪吃蛇运行**：不读/写 `C:\Users\51054\Desktop\work\ans-game2d-snake-run-2026-11-09` 的应用/端口 9222/临时根；真实运行验收只用隔离端口 9223 与独立 userData/目标项目。
7. **不提交/推送/合并/发布**：本方案只写 `docs/planning/2026-11-09_design_document-format-specifications.md`。

---

## 6. 写集 / owner（逐文件唯一，零重叠）

### 6.1 实施写集（[设计候选]）

| # | 文件 | owner（角色） | 变更内容 |
| --- | --- | --- | --- |
| 1 | `src/common/编排/doc-format-specs.ts`（新建） | 编排 | 规范注册表 + 索引/详情渲染；纯数据/纯渲染，无 I/O |
| 2 | `test/编排/doc-format-specs.test.ts`（新建） | 编排 | 注册表完整性、样例正例、字段变异矩阵、overclaim、schema/稳定 code 扫描、冻结 id 清单、预算 |
| 3 | `src/model/runtime.ts` | 运行时核心 | `DocFormatInput/DocFormatResult/DocFormatFn`；`GovernedToolsOptions.docFormat?`（加法；`GovernedToolsOptions` 在 `:3450`；F11） |
| 4 | `src/provider/runtime/tools.ts` | 运行时核心 | `makeDocFormatTool`；`buildGovernedTools` 注入才注册（contract_check 相邻） |
| 5 | `src/provider/runtime/schema.ts` | 运行时核心 | `doc_format` 参数/描述/promptGuidelines（扁平 schema） |
| 6 | `test/runtime-core/doc-format-specs-pin.test.ts`（新建） | 运行时核心 | MCP 声明格式钉住 + `describeTool("doc_format")` 扁平/非空 + 注入才注册 + `tools/list` 非空 |
| 7 | `src/pipeline/orchestration/run-role.ts` | 编排 | `openRoleSession` 输入字段 `docFormat?`（`contractCheck` 在 `:875`）+ `AdapterCapabilities.docFormat?`（`:304-438`；`contractCheck` 在 `:409`）+ 两处 capabilities 透传（`:2106`、`:3546`；G1）；`RoleSessionDeps` 不变（仅 `createAdapter`/`runtimeOptions`） |
| 8 | `app/desktop/session.ts` | 桌面窗口 | `docFormat` 能力注入（所有角色）；`docFormatText` 静态早退数据源 |
| 9 | `test/桌面应用/session.test.ts`（**新建：恢复已删除路径**，F5） | 桌面窗口 | 注入矩阵（内置/项目角色）、静态早退（不读 listing/run）、未知/非字符串、legacy `contract_check` 不变、judge 工具集不变 |
| 10 | `test/门禁引擎/doc-format-specs-pin.test.ts`（新建） | 门禁引擎 | 角色卡 10 章节/三文件路径/边界两份恒等/严格 YAML 的规范钉住 |
| 11 | `test/测试/doc-format-all-roles.test.ts`（新建） | 测试 | 跨角色集成：6 内置 + 1 项目角色会话注册 `doc_format`；judge/有界会话无；数据源只读 |
| 12 | 各角色 `角色卡/<role>/docs/change/`、`docs/fix/` 实施记录 | 各实施角色 | 变更/修复记录（按各自边界） |

### 6.2 H1 delta（Section 1 变更）

- **无**。所有新建文件均落在既有授权目录内：
  - `src/common/编排/`（编排 Section 1 目录）✓
  - `test/编排/`（编排）✓
  - `test/runtime-core/`（运行时核心）✓
  - `test/门禁引擎/`（门禁引擎）✓
  - `test/测试/`（测试）✓
  - `test/桌面应用/session.test.ts`（桌面窗口 **新建（恢复已删除路径）**：文件当前不存在；路径已列为 §1 文件条目 `角色卡/桌面窗口/boundary.yaml:99`、`boundary.md:39`，H1 delta 无；交付回执记录边界漂移——`4c24149` 删除、边界仍列，见 `docs/acceptance/2026-11-08_session-admission-approval-report-v1.md:153`；F5）✓
  - `app/desktop/session.ts`（桌面窗口既有单文件）✓
  - `src/model/runtime.ts`、`src/provider/runtime/{tools,schema}.ts`（运行时核心既有单文件）✓
  - `src/pipeline/orchestration/run-role.ts`（编排既有单文件）✓
- 不新增目录、不改角色卡/边界、不动 `.ans`/项目文档。
- **F6 备选未采用**：若复核要求 spec 直接 import 其他角色私有常量并新增公共只读出口，写集会扩展（`src/common/门禁引擎/*`、`src/common/runtime-core/*` 等），属新增变更，需更新 §6.1 并重评 H1/串行；本方案默认采用「复制 + owner 侧 pin 测试」，不扩展写集。

### 6.3 角色边界与共享 API 纪律

- `src/common/shared/` 本变更**不新增文件**（规范放在编排侧以直接 import parser 常量/示例）；若复核坚持 shared 位置，需按 shared-code 边界补「共享 API 变更评审记录 + 消费者影响清单 + 测试」，并解决 shared 不得 import 引擎私有常量的方向问题（可能需把 schema 常量下沉 model，属更大改动，不推荐）。
- `src/model/runtime.ts` 的改动是加法可选字段/类型；按既有先例（`docs/planning/2026-11-03_design_contract-schema-query.md:764`）论证为 T2 候选，但**最终档位由统筹裁决（F15）**：若统筹按「新增工具面/凡触 Model 公共工具契约即 T3」执行，则按 T3 全量回归并重评测试预算。

---

## 7. 测试与验收（B1 输入）

### 7.1 测试矩阵（[设计候选]）

| 层 | 文件 | 断言 |
| --- | --- | --- |
| 规范完整性 | `test/编排/doc-format-specs.test.ts` | id 集合=冻结清单（**54 个**）；唯一；每个 spec 有 title/audience/path/validator/specRevision；B 组与 A14 有 `testSeam`；索引 ≤8192 B；每格式详情 ≤8192 B；模块无 `node:fs` import |
| 样例正例 | 同上 | 每个 `example` 经真实 parser/validator 为 ok（A1–A13、A17–A21；A13 用 §2.4 填充样例；A14 严格层按 seam；B 组按 §2.3.1 `testSeam`） |
| 字段变异矩阵 | 同上 | 每个 `enforcement:"validator"` 字段删除/置 null/类型替换/枚举非法 ⇒ 拒绝；`optional` 删除 ⇒ ok；断言到 code（可断码处） |
| overclaim guard | 同上 | 每个 `enforcement:"convention"` 字段的违反值 ⇒ 校验器仍接受；意外拒绝则失败 |
| schema 字面量扫描 | 同上 | `src/**` 所有 schema 字面量 ∈ 注册表 ∪ 显式排除白名单（`chief-workflow/v1`、`git-initialization/v1`、`version-change-service/v1`、`chief-hub-resume/v1`，含理由）；`git-quality-report/v1` 由 A14、`git-ref/v1` 由 B29 覆盖；新字面量未登记必失败 |
| 复用单一来源 | 同上 | modules/roster/topology 详情 `includes(contractSchemaText(topic))` 且含来源说明行；render 型 `part=fields/example/errors` 整段返回 + 提示；intent-entry 详情含 `INTENT_ENTRY_TEMPLATE`；既有角色卡边界片段/模板喂真实 parser 均 ok |
| 私有常量交叉钉住（F6） | `test/门禁引擎/doc-format-specs-pin.test.ts`、`test/runtime-core/doc-format-specs-pin.test.ts` | spec 文本与 owner 私有常量相等/包含：`ROLE_CARD_REQUIRED_SECTIONS`、boundary `KINDS/ROOTS/TOP_KEYS`、MCP `NAME_PATTERN/RESERVED_NAMES/ENV_NAME_PATTERN` |
| 稳定 code 扫描（F9/G2） | `test/编排/doc-format-specs.test.ts` | `src/**` 稳定 code（按 `modules-doc-*`/`roster-*`/`plan-*`/`criteria-*`/`evidence-*`/`run-pin-*`/`run-manifest-*`/`review-quality-*`/`trunk-amendment-*`/`boundary-*`/`role-*` 等族收集，含非 `-invalid` 结尾成员）∈ 各 spec `commonErrors`/`loadChecks` ∪ 显式白名单（含理由） |
| 加载级/主错误码负例 | 同上/`test/编排/run-manifest.test.ts`/`test/编排/evidence-check.test.ts` | 每个 `loadChecks.code` 与 A 格式主要 parser 错误码至少复现一次（roster-*、modules-doc-*、run-pin-*、plan-*、criteria-*、evidence-*、trunk-amendment-*、review-quality-*、role-card-section-missing、boundary-md-yaml-mismatch） |
| 门禁格式 | `test/门禁引擎/doc-format-specs-pin.test.ts` | role-card 10 章节逐个缺失 → `role-card-section-missing:<label>`；三文件路径恒等；boundary.yaml 严格键/枚举/archived；boundary.md↔yaml 恒等；示例通过 |
| 工具层 | `test/runtime-core/doc-format-specs-pin.test.ts` | `describeTool` 扁平/非空/无顶层 oneOf；注入才注册（无 capability ⇒ 无工具）；未知/非字符串 format 拒绝；`tools/list` properties 非空；`toPiTool(describeTool("doc_format"))` description/promptGuidelines 非空（F12）；MCP 声明七键/保留名/状态钉住 |
| 桌面注入 | `test/桌面应用/session.test.ts`（新建） | 内置角色与项目角色均收到 `docFormat`；数据源索引/详情；**不调用** `getListing`/`refreshListingNow`/文件 IO；未知 format `ok:false`；legacy `contract_check` 输出不变 |
| 跨角色集成 | `test/测试/doc-format-all-roles.test.ts` | 6 内置 + 1 项目角色会话注册 `doc_format`；judge/有界会话无；所有角色数据源返回索引；无副作用 |
| 回归 | 既有套件 | 见 §7.3 |

### 7.2 验收标准（逐条可核对）

| ID | 标准 | 核对方式 |
| --- | --- | --- |
| AC-1 | 清点完整：§2.2/§2.3 的每个 id 均有规范；**54 个 spec（A25+B29，一行一 id）**且集合恰等冻结清单 | `DOC_FORMAT_SPECS.map(id)` 与测试冻结清单 deepEqual；评审对照本方案 §2 |
| AC-2 | 单一事实来源：仓库中只有一份角色可读规范文本；无新增 Markdown/技能副本 | `git status`/diff 检查；测试断言 3 个 contract topic 详情包含 `contractSchemaText` 原文且带来源说明；`docs/` 无新规范文件 |
| AC-3 | schema 字面量不漂移：每个 `schemaLiteral` 或等于 import 的公开常量、或等于 owner 侧 pin 测试钉住的内联/私有常量；全仓字面量扫描无遗漏（白名单含理由） | 测试 import 常量相等 + owner pin 测试 + 扫描测试 |
| AC-4 | 示例有效：每个有真实校验器的 A 格式（A1–A13、A17–A21）最小样例经真实解析器/校验器通过；A14 严格层按 seam（服务级夹具/源码文本）钉住并披露 | 测试正例（§7.1） |
| AC-5 | 字段表与校验器一致：必填删除/类型变异/枚举非法必拒；可选删除不拒 | 数据驱动变异矩阵 |
| AC-6 | 约定不冒充强制：每个 `enforcement:"convention"` 字段的违反值仍被接受 | overclaim guard |
| AC-7 | 加载级/主错误码可复现：每个 `loadChecks.code` 与主要 parser 错误码有负例 | 负例测试 |
| AC-8 | 工具契约：索引（≤8192 B）/详情/未知/非字符串/part（render 整段）/预算/零磁盘 IO | 工具层 + 会话层测试 |
| AC-9 | 全员可读：6 内置 + 项目角色会话注册 `doc_format`；judge/有界会话工具集逐字不变 | 跨角色集成测试 |
| AC-10 | 桌面数据源静态早退：`format` 模式不读 listing/run/文件；不写盘 | 测试 spy + 代码审查 |
| AC-11 | 无校验变更：parser/validator/角色卡/边界 diff 为 0（除规范模块与测试） | diff 审查；既有 parser 套件全绿 |
| AC-12 | 真实运行：产品按说明一次写对 `project-intent/v1`（含 schema），意图确认门不因 schema 拒绝；产品真实调用 `doc_format`；**项目角色**按 §7.4 预置并真实调用（预置不可行时回落为「会话注册 + 数据源调用」证据并如实标注，不得虚报） | §7.4 真实运行证据 |
| AC-13 | 真实运行隔离：端口 9223、独立 userData、贪吃蛇 9222/临时根零改动；运行前后状态证据 | 预检/后检 + git status |
| AC-14 | 预算/停止/回落：客户消息/工具调用/墙钟/卡数在预算内；首个决定性结果即停；应用关闭无残留；工具不可用时既有行为不变 | 驱动日志 + 进程/端口检查 |
| AC-15 | 回归与类型：§7.3 命令全绿；`npm run typecheck` 0 | 命令输出 |
| AC-16 | 不触碰并行变更：本变更 diff 不含 judge/提案卡修复文件；与 judge 仅 `src/model/runtime.ts` 同文件串行且记录在案 | `git diff --stat` + 串行记录 |
| AC-17 | 测试 seam 可执行：B 组每行 `testSeam` 有对应测试；`text-shape` 行残余风险在 §9.2 如实披露 | §2.3.1 对照测试清单 |

### 7.3 回归命令（实施前基线 + 判定）

**实施前基线（只含既有文件）**：

```bash
npm run typecheck
node --test test/编排/workflow-preconditions.test.ts
node --test test/编排/run-manifest.test.ts
node --test test/编排/evidence-check.test.ts
node --test test/门禁引擎/boundary-yaml.test.ts
node --test test/runtime-core/mcp-declarations.test.ts
node --test test/桌面应用/run-pin.test.ts
```

**实施后回归（含新建文件；新建文件在对应阶段落地后加入）**：

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

> 命令以最终文件名为准；优先在既有套件内补用例，新增文件仅限 §6 已登记路径。`test/桌面应用/session.test.ts` 当前不存在（F5），不得作为实施前基线；其新建在 P3 落地后纳入回归。

### 7.4 真实运行验收标准（**9223 隔离**；不碰贪吃蛇 9222）

**环境**：
- 真实 Electron（本 worktree `app/main.ts`）+ 真实 Claude + 真实桌面 UI；隔离 `--userData` 与 `--remote-debugging-port=9223`（**9222 保留给贪吃蛇，绝不占用/关闭**）；目标项目在仓库外新目录（如 `C:\Users\51054\Desktop\work\ans-doc-format-run-2026-11-09\target`）。
- **预置 1 个已激活项目角色（F10）**：目标项目在测量前按正常流程（或复制既有合法目标项目）具备一个项目角色的三文件角色卡 + 边界 + 激活记录。预置是**运行前置准备**，不计入客户消息/墙钟预算；预检记录其来源、路径与哈希。若无法预置，见「回落」的放宽口径。
- 预检：9222 由贪吃蛇占用（只读确认，不触碰）；9223 空闲；贪吃蛇运行根前后文件/进程状态无变化（只读快照）。

**场景（一次真实客户请求 + 一次项目角色直连查询）**：
1. 客户消息（1 条）：要求为 flow `<flowId>` 做一个小需求；幕僚派产品写产品意图。
2. **产品必须调用 `doc_format`**（`format` 缺省索引或 `format:"project-intent/v1"`）并读到说明（会话工具事实中保留调用与回执原文）。
3. 产品写 `docs/product/<flowId>-intent-v1.md`：frontmatter 含 `schema: project-intent/v1`（及 flowId/version/intentId 按规范），一次写对；幕僚发起意图确认卡。
4. 意图确认门 `prepareIntentConfirmation` 通过（无 `trunk-item-invalid` schema 拒绝，卡正常呈现并可提交；是否由客户/judge 确认不影响本项判定，但确认路径照既有机制）。
5. **全员可读**：项目载入后 6 个内置角色会话 + 1 个项目角色会话均注册 `doc_format`（真实 Electron 的会话工具目录证据）；**产品**在真实模型回合中调用 `doc_format` 并收到说明文本；**项目角色**由操作者直连会话注入 1 条查询（如「请调用 doc_format 获取格式索引或 project-intent/v1 说明」）并保留调用与回执原文（非客户消息，计入运行操作记录）。其余内置角色以工具目录注册 + 数据源可调用为证，避免无谓的真实模型成本。
6. 停止：出现决定性证据（意图确认通过 + 产品读取 + 项目角色读取）后立即 halt；应用/驱动/浏览器关闭；9223 释放、无 Electron 残留。

**预算与纪律**：
- 客户消息 1 条；操作者直连项目角色消息 ≤1 条（非客户消息）；产品 `doc_format` 调用 ≤3 次（期望 1）；项目角色 ≤1 次；模型回合总数按任务需要最小化并如实记录；墙钟 ≤20 分钟（预置准备不计）；审批卡/客户卡数量如实记录；首个决定性结果即停，不自动重试。
- 运行前后 `git status`/`git diff --stat` 证明仅允许写集变化；未提交/推送/合并/发布；不修改目标项目之外的任何运行根。
- 证据：drive 日志、UI 截图、product/chief/项目角色会话工具事实（`doc_format` 调用入参与回执原文）、意图文档字节与 hash、`prepareIntentConfirmation` 结果、各角色工具目录、项目角色预置来源/哈希、进程/端口前后检查。

**回落**：
- **项目角色无法预置时（F10 备选）**：真实运行只要求产品真实调用；项目角色证据降级为「会话注册 + 数据源可调用」（`test/测试/doc-format-all-roles.test.ts` + 真实 Electron 会话工具目录），AC-12 如实标注「未做项目角色真实模型调用」；不得把注册证据写成真实调用。
- 若 `docFormat` 能力未注入（演示/旧调用方）：`doc_format` 不存在，既有角色行为不变（单元测试覆盖）；真实运行不以此路径判定失败，但必须如实记录为未覆盖场景。

### 7.5 基线/证据口径

- 实施前先跑 §7.3 基线并记录 green baseline；判定时对当前候选重跑并逐项对照，不使用其他变更的验收结论背书。
- 证据只引用同候选/同输入/同环境的产物；方案哈希/行数/字节在交付回执中给出。

---

## 8. Q 清单（默认值；按预授权免逐次确认，除非客户改选）

| # | 问题 | 默认（推荐） | 备选与代价 |
| --- | --- | --- | --- |
| Q1 | 可读取通道 | **A：新增只读工具 `doc_format`**（工具描述 + promptGuidelines + 索引可发现） | B：扩展 `contract_check` topic（4 KiB 上限、语义混淆、~25 个 topic 膨胀；三格式仍需复用）；C：技能安装（需角色 id 登记，项目角色动态，不满足全员）；D：项目内注入文档（需写项目 docs，产生副本/漂移） |
| Q2 | 覆盖边界 | **A：全部被真实解析的格式（A 组角色可写 + B 组应用内部）都进注册表/索引；B 组简版** | B：仅角色可写文档（不满足「不得遗漏被真实解析的格式」）；C：仅版本化治理文档（更窄，不满足意图） |
| Q3 | 规范存放 | **A：`src/common/编排/doc-format-specs.ts`（与 parser 同侧，import 常量/示例）** | B：`src/common/shared/`（边界方向要求 shared 不 import 引擎私有常量；需下沉 schema 常量，改动更大）；C：生成 Markdown（第二份副本，违反非目标） |
| Q4 | 示例策略 | **A：每格式导出最小合法样例常量 + 真实 parser 正例** | B：仅字段表（形状仍靠猜，真实卡点已证明不够） |
| Q5 | 漂移防护强度 | **A：正例 + 必填删除/类型/枚举变异 + 约定字段反证 + schema 字面量扫描 + 冻结 id 清单** | B：仅正例（字段表/约定分类可漂移）；C：重写 parser 吃 schema 定义（改动放行语义，超出非目标） |
| Q6 | 是否改角色卡 | **A：不改；用工具描述/promptGuidelines/索引** | B：每个内置角色卡加一行指引（触碰角色文本，与并行变更冲突面扩大；若 Q12 真实运行证明模型不主动查再另案） |
| Q7 | 内部格式深度 | **A：字段表 + 校验器锚点 + 一个样例；不做角色文档级变异矩阵** | B：同等深度变异矩阵（成本高、收益低；内部格式角色不写） |
| Q8 | 与 `contract_check` 关系 | **A：modules/roster/topology 详情复用 `contractSchemaText` 原文；`contract_check` 逐字不变** | B：把三 topic 迁入新模块（改既有输出风险）；C：两边各写一份（违反单一来源） |
| Q9 | 工具名 | **A：`doc_format`** | B：`read_doc_format`（更冗长）；C：`format_spec`（易与代码格式化混淆） |
| Q10 | 真实运行覆盖率 | **A：预置 1 个已激活项目角色；产品 + 该项目角色各 1 次真实调用；6 内置以注册 + 数据源为证** | B：所有角色都真实调用（真实模型成本高）；C：仅产品真实调用、项目角色降级为注册 + 数据源证据（预置不可行时的回落，AC-12 如实标注；F10） |
| Q11 | 与并行变更顺序 | **A：提案卡修复（A′→B）→ judge → 本变更；本变更与 judge 仅 `src/model/runtime.ts` 同文件（不同区域）** | B：先行（需等 `runtime.ts` 串行窗口）；C：同分支并行编辑（违反单写者）；以协调方裁决为准（F2） |
| Q12 | 后续若模型不主动查 | **A：先以真实运行观察；确有需要再由客户授权独立变更加角色卡一行** | B：本次直接改角色卡（超出「不改角色卡」默认） |
| Q13 | 风险档位 | **A：交统筹裁决；方案建议 T2** | B：按 T3 全量回归（若统筹按「新增工具面/凡触 Model 公共工具契约即 T3」）；C：方案自评 T2 不待裁决（不采纳；F15） |
| Q14 | 索引预算策略 | **A：索引 ≤8192 B；P1 实测；超限则 B 组按 stage 汇总一行 + 详情可查** | B：保持 ≤4096 B 并只列 A 组（削弱 B 组可发现性）；C：54 id 全量不设上限（上下文成本；F14） |

---

## 9. 风险 / 残余 / 待确认

### 9.1 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 说明是散文，无法 100% 机械证明 | 样例/变异矩阵/overclaim/schema 扫描/load-check 负例/稳定 code 扫描多层钉住；规范变更走 `specRevision`（§3.4/§3.5） |
| 规范漏掉新格式 | schema 字面量扫描 + 冻结 id 清单（54 个）；数值版本格式（无斜杠字面量）由冻结清单覆盖；新增字面量/新 id 未登记测试失败 |
| 规范把约定写成强制（或反之） | `enforcement` 分类 + overclaim guard；评审逐项对照 §2.4 |
| 模型不主动调用 `doc_format` | 工具描述 + promptGuidelines + 索引可发现；真实运行验收强制产品读取；仍不足则 Q12 另案 |
| 工具输出挤占上下文 | 索引 ≤8 KiB、详情 ≤8 KiB、part 可选、工具层截断标注、P1 实测校准（F14） |
| 与 judge/提案卡变更冲突 | §10 单写者 + 串行合并；真实机械重叠仅 `src/model/runtime.ts`（F2） |
| 规范模块 import 解析器常量造成循环依赖 | 只 import 公开常量/示例/纯函数；内联/跨角色私有常量走「副本 + owner pin 测试」（F6）；不在规范模块 import `app/`/`service/`；测试断言模块纯数据（无 `node:fs`） |
| 跨角色私有常量副本漂移（F6） | owner 侧 pin 测试（`test/门禁引擎/`、`test/runtime-core/`）import 自己角色私有常量并与 spec 交叉断言；不宣称 import 单一源 |
| 三运行时可见性不一致 | Pi 系统提示不拼 promptGuidelines，但工具定义逐工具透传（`toPiTool`/`bindRole`）+ 工具描述可发现；真实运行覆盖 Claude；Pi/Codex 以确定性测试覆盖并如实披露（F12） |
| 真实运行无法在预算内产生项目角色真实读取（F10） | §7.4 预置 1 个已激活项目角色（准备不计预算）；预置不可行时回落为注册 + 数据源证据并如实标注 |
| 内部格式数量多、文本长 | B 组 29 个 spec 简版；索引按 stage 分组；详情按需查询 |
| 行号漂移 | 实现以符号名/文本锚点为准；方案 §2 已给符号名 |

### 9.2 残余（如实）

- 本方案不修 `dispatch_task`/`git_candidate` 的 `tools/list` 呈空（既有 union 事实；`dispatch_task` 具体机制 [推断]/[待确认]）。新工具通过扁平 schema 规避同类问题，但不代表旧工具已修复。
- **A14 严格层无导出纯校验器**：只能走服务级夹具或源码文本钉住，残余「测试通过但校验器另有分支」风险；B 组 `text-shape` 行同理（§2.3.1），已在测试矩阵逐行披露。
- **render 型 part 不细分**：modules/roster/topology 的 `part` 返回整段原文；若未来需要细分，须由编排 owner 把 contract 文本拆为字段/示例常量（`workflow-preconditions.ts` 写集变更，另案）。
- 约定类/摘录类格式（workflow/contracts/change/fix 记录；quality report **展示层**）只能钉命名/消费行为，不能钉内容质量；规范明确标注「仅约定/摘录」（A14 严格层另有钉住）。
- 真实运行按 §7.4 覆盖 Claude + 真实 UI；Pi/Codex 真实模型行为不作承诺（确定性测试覆盖）。项目角色真实模型调用取决于预置；预置不可行时按 §7.4 回落并如实标注。
- B 组部分格式（B4/B21–B24/B29 等）无纯校验器，短期只能文本/形状钉住（§2.3.1）；升级需 owner 提供导出纯函数（另案）。

### 9.3 待确认（复核/实施时）

1. `dispatch_task` 参数 schema「呈空」的真实机制（哪个运行时/展示层；是否与 `allOf/not` 条件有关）——[推断]，本变更范围外。
2. 是否需要把 `doc_format` 索引做成「按角色裁剪」（本方案默认**不裁剪**：格式是静态公开信息，全员同一份；裁剪只会增加复杂度）。
3. B 组内部格式是否全部要在工具索引中展示（默认 A：全部展示、简版；P1 实测索引字节，超 8192 B 时按 stage 汇总一行，见 Q14）。
4. §7.4 项目角色证据口径：默认预置 1 个已激活项目角色并真实调用（准备不计预算）；若协调方不接受预置，则采用回落口径（仅产品真实调用 + 项目角色注册/数据源证据），AC-12 如实标注（F10）。
5. F6 方案 2（给 `resolve-role.ts`/`resolve-boundary.ts`/`mcp-declarations.ts` 等新增公共只读导出）：本方案默认不采用；若复核坚持「一律 import」，需扩展写集、owner 同意并重评 H1/串行。
6. `test/桌面应用/session.test.ts` 的处置：默认**新建恢复该路径**（路径已在边界 §1，H1 delta 0，记录边界漂移）；若 Governance 要求改在既有文件（如 `test/桌面应用/multi-runtime.test.ts`，亦在 §1）补用例，则切换后 §7.3 相应调整（F5）。

### 9.4 风险档位与升档条件

- **建议 T2（待统筹裁决，F15）**：只读静态说明 + 只读工具 + 加法类型 + 测试；不改放行/权限/闸门/验收/证据。新增工具面大于「加可选参数」先例，最终档位由统筹裁定。
- **升档为 T3 的条件**（任一出现即重评）：要求改写任何 parser/validator 的接受/拒绝集合；要求把规范生成/落盘为仓库文档或技能副本；要求改角色卡/边界/流程必读；要求修 `dispatch_task`/`git_candidate` 的工具 schema 呈现；要求 spec 直接 import 其他角色私有常量并新增公共导出（F6 方案 2，写集扩展）；统筹/验收按「凡新增工具面/凡触 Model 公共工具契约即 T3」管理（按既有先例，本方案对 Model 是加法可选字段，不构成 breaking；仍尊重统筹口径）。

---

## 10. 与并行变更的并行/文件冲突与串行安排

### 10.1 并行变更（同日；按对方当前快照，P1.1 只读核对）

- **judge 代批生效**（`docs/planning/2026-11-09_design_judge-delegated-decision-effectiveness.md`，**P1.1，674 行 / 84,483 bytes / `72d36242…`**）真实写集（其 §5.1）：`src/model/version-change.ts`、`src/model/runtime.ts`、`src/service/trunk/impl/apply-journal.ts`、`src/service/version-change/impl/freeze-service.ts`、`src/service/version-change/abstract/version-change-service.ts`、`src/provider/version-change/impl/guard-freeze-registry.ts`、`src/pipeline/orchestration/trunk-runtime.ts`、`src/pipeline/orchestration/version-change-runtime.ts`、`src/common/编排/task-state.ts`、`src/common/门禁引擎/classify-shell.ts` 与测试。**明确排除**（其 §5.1 排除清单）：`app/desktop/*`（含 `customer-input.ts`/`session.ts`）、`app/renderer/*`、`src/model/trunk.ts`、`src/service/gate/*`、`src/provider/runtime/tools.ts`、`src/pipeline/orchestration/run-role.ts`、`src/service/version-change/impl/vca-service.ts`。
- **提案卡 draft run 绑定缺陷修复**（`docs/scheduling/2026-11-09_fix-routing_proposal-card-run-binding.md`，**183 行 / 32,508 bytes / `4e8fb354…`**）：推荐 **A′**（编排）= `src/service/trunk/impl/apply-journal.ts` + `test/编排/direct-role-capabilities.test.ts`，**明确不改 `run-manifest.ts`、不写 manifest**；**B**（桌面窗口）= `app/desktop/customer-input.ts` + `test/桌面应用/chief-workflow.test.ts`。备选方案 A（未推荐，仅当 A′ 被否决）才会编辑 `run-manifest.ts`——须在协调记录中注明该条件。
- **勘误（P1.0 §10.1 曾误述 judge 写集）**：[事实] P1.0 把 judge 描述为会改 `app/desktop/customer-input.ts`/`session.ts`/`run-role.ts`；judge P1.1 §5.1 与其 §10.1 勘误、judge 复核 R1.0 F1（`6e98749b…`）均明确相反。P1.1 已按对方现行版本更正；该勘误随本方案提交**知会统筹/沟通**（协调记录条目）。

### 10.2 冲突文件（本变更 vs 并行）

| 文件 | 本变更 | judge 代批 | 提案卡修复 | 冲突级别/安排 |
| --- | --- | --- | --- | --- |
| `src/model/runtime.ts` | 编辑（加法 `DocFormat*` 类型 + `GovernedToolsOptions.docFormat?`） | 编辑（`DocFreezeEvent` + 共享函数） | 不编辑 | **中**：同文件不同区域；**唯一机械重叠**；串行写（judge → 本变更） |
| `app/desktop/session.ts` | 编辑（注入 + 静态数据源） | **不编辑**（明确排除） | 不编辑 | **无冲突**；本变更独占 |
| `src/pipeline/orchestration/run-role.ts` | 编辑（`openRoleSession` 输入/`AdapterCapabilities` + 透传） | **不编辑**（明确排除） | 不编辑 | **无冲突**；本变更独占 |
| `test/桌面应用/session.test.ts` | **新建（恢复已删除路径，F5）** | 不编辑 | 不编辑 | **无冲突**；本变更独占 |
| `src/service/trunk/impl/apply-journal.ts` | **不编辑**（只读引用） | 编辑（主战场） | A′ 编辑 | **无**（本变更不碰） |
| `test/编排/direct-role-capabilities.test.ts` | **不编辑** | 编辑 | A′ 编辑 | **无**（本变更不碰） |
| `src/common/编排/run-manifest.ts` | **不编辑**（只读引用） | 不编辑 | A′ **明确不改**（仅未采纳备选 A 会改） | **无**（若协调方改选 A，须重评本表） |
| `src/model/version-change.ts`、`src/service/version-change/**`、`src/provider/version-change/**` | **不编辑** | 编辑 | 不编辑 | **无** |
| `src/pipeline/orchestration/trunk-runtime.ts`、`version-change-runtime.ts`、`src/common/编排/task-state.ts`、`src/common/门禁引擎/classify-shell.ts` | **不编辑**（只读引用/测试 import） | 编辑 | 不编辑 | **无** |
| `app/desktop/customer-input.ts`、`test/桌面应用/chief-workflow.test.ts` | **不编辑** | 不编辑 | B 编辑 | **无** |
| `src/common/编排/workflow-preconditions.ts`、`evidence-check.ts`、`src/common/门禁引擎/**`（除 classify-shell） | **不编辑**（复用/测试 import） | 不编辑（classify-shell 除外，见上行） | 不编辑 | **无** |

### 10.3 串行安排（推荐；以协调方裁决为准）

1. **提案卡修复（A′ → B）先行**（P0 真机阻塞）：A′ 与 judge 在 `apply-journal.ts` 与 `test/编排/direct-role-capabilities.test.ts` 同文件同区域，必须先合并。
2. **judge 代批其次**：从修复合并后的 main 重切/重放基线再实施，避免重复改写。
3. **本变更最后**：与 judge 仅 `src/model/runtime.ts` 同文件不同区域；从 judge 合并后的 main 重切 worktree，实施 §6 写集。若必须提前实施，则先完成**非共享文件**（规范注册表与独立测试）；`src/model/runtime.ts` 留到 judge 合并后由同一写者串行补齐；`app/desktop/session.ts`/`run-role.ts`/`session.test.ts` 虽无并行编辑者，仍遵守单写者纪律。
4. 同文件同一时刻只有一个变更编辑；不同变更的 worktree 合并前互相 diff 检查，冲突时后合并方 rebase 并重跑 §7.3。
5. 本变更不修改 judge/缺陷的记录、方案、验收、调度文件；账本分别记账（意图记录 §流程与授权）。
6. judge P1.1 §10.2 的推荐次序（提案卡修复 → judge → 文档格式）与本表一致；若协调方另有裁决，按裁决更新本表后再派发。

---

## 11. 实施阶段建议（仅供统筹；不是团队计划）

| 阶段 | 内容 | 依赖 | 可核对完成标志 |
| --- | --- | --- | --- |
| P1 规范注册表 | `doc-format-specs.ts`：**54 个 spec（A25 + B29）**，A 组（含 3 个 contract topic 复用 + A14 分层）+ B 组简版；索引/详情/part/预算；`DOC_FORMAT_SPEC_VERSION`；**实测索引字节（F14）** | 无 | 注册表完整性/预算测试通过；示例正例通过 |
| P2 漂移钉住 | 字段变异矩阵/overclaim/schema 扫描/加载级与主错误码负例/稳定 code 扫描；`testSeam` 测试；门禁/运行时核心/角色卡/边界/MCP 的 pin 测试（含私有常量交叉断言） | P1 | §7.1 全套测试通过 |
| P3 工具与会话 | `model/runtime.ts` 类型（`GovernedToolsOptions`）；`tools.ts`/`schema.ts`；`run-role.ts`（`openRoleSession` 输入/`AdapterCapabilities`）透传；`app/desktop/session.ts` 注入/数据源；`session.test.ts` **新建** | P2 | 工具契约/注入矩阵/静态早退测试通过；typecheck |
| P4 跨角色集成与真实运行 | `test/测试/doc-format-all-roles.test.ts`；§7.4 真实运行（预置 1 个已激活项目角色） | P3 | AC-9/AC-12/AC-13/AC-14 证据齐备 |
| P5 回归与收口 | §7.3 全量 + 既有套件；角色变更记录 | P4 | 全绿；diff 审查无越界 |

**回滚粒度**：① 工具面（类型/工具/注入/描述）可整体回滚；② 规范注册表与测试是独立改进，可保留；③ 整体回滚不影响任何已写项目文档（无状态迁移）。回滚不改变校验/格式。

---

## 12. 版本记录与文档规则

**版本记录**见头部表格。

**文档规则**：

1. 本文件是**策划方案（P 系列）**，不是实施基线；独立复核后的版本供统筹/闸门 2 使用。
2. 复核/每轮实质修改升一个小版本（P1.1、P1.2…），在头部版本记录追加一行并写明变更摘要。**本轮按任务要求在同一路径原地更新（P1.0/P1.1 原文不可得且文件未跟踪）**：历史以版本记录与复核记录引用为准；后续版本应避免原地覆盖已复核版本（建议提交历史或另存副本后再改）。
3. 小文字修正可不升版，但交付回执须说明；涉及决策、字段表、示例、Q 清单、写集、风险档位的修改必须升版。
4. 引用基线：意图 `bf870ae9…`、独立复核 R1.0 `ae4c2100…`、代码 HEAD `c1439ce`、judge 方案 P1.1 `72d36242…`、提案卡修复路由 `4e8fb354…`；实施时若基线前进，以符号名/文本锚点重新核对并记录新基线。
5. 本文不写入实施证据或验收结论；B1/验收在实施后独立进行。
6. P1.1/P1.2 对 R1.0 F1–F16 与窄复核 G1–G4/S1–S4 的逐项处置见 §13/§14；复核时按该表核对落点。

---

## 13. 独立复核（R1.0）处置记录（F1–F16）

> 复核对象：`docs/planning/2026-11-09_review_document-format-specifications.md`（363 行 / 54,718 bytes / SHA-256 `ae4c2100…`）。处置状态：**已修订**（本文件 P1.1）或**记录理由**（不采纳/后置）。本轮只改本文件；未实施、未改其它文件、未提交/推送。

| # | 复核问题（摘要） | P1.1 处置 | 落点 |
| --- | --- | --- | --- |
| F1 | A14 quality report 严格 parser 未清点、被误标无解析器 | **已修订**：A14 改分层（git 严格层 + 展示层）；`readTextQualityProof` 的路径/键集/绑定/`review-quality-*`/调用点入表；`schemaLiteral` 记为 `git-quality-report/v1` | §2.2 A14、§2.4 A14、§2.5、§3.4 #1/#4、AC-1/AC-3/AC-4 |
| F2 | §10 并行写集与冲突事实与对方相反 | **已修订**：按 judge P1.1 与 fix routing 重写 §10；judge 不含 `app/desktop/*`/`run-role.ts`；A′ 不改 `run-manifest.ts`；B 改 `chief-workflow.test.ts`；唯一机械重叠 `src/model/runtime.ts`；串行「修复→judge→本变更」；加勘误知会条目 | §5.5、§10.1–10.3、AC-16、§0.4-3 |
| F3 | 48 行 vs 50 id 与 `schemaLiteral` 单值不自洽 | **已修订**：B21/B22 拆为 B21–B24（四个独立 spec）；一行一 id；最终 **54 行/54 个 spec（A25+B29）**；`schemaLiteral` 保持单值并在表注/`schemaLiteralNote` 注明字面量关系 | §2.3、§2.3 表注、§3.2、§3.3 #3、AC-1/AC-3 |
| F4 | 内部格式清点缺口与排除口径 | **已修订**：新增 B26–B29；B6 补 legacy `apply-journal.json`；§2.6 显式排除 `docs/audit/shell-gate.jsonl`、`chief-workflow/v1`、`git-initialization/v1`（各给理由） | §2.1 #7、§2.3、§2.6、§3.4 #4 |
| F5 | `test/桌面应用/session.test.ts` 不存在 | **已修订**：改「**新建（恢复已删除路径）**」；路径已在边界 §1（`boundary.yaml:99`），H1 delta 0；记录边界漂移；§7.3 基线不含该文件 | §3.1、§6.1 #9、§6.2、§7.3、§9.3-6 |
| F6 | 「schemaLiteral 一律 import 常量」不可行 | **已修订**：三层策略（公开常量 import／内联副本 + owner pin 测试／跨角色私有常量经 owner 侧 pin 交叉断言）；AC-3 改为可执行判据；默认不扩展公共出口 | §3.1、§3.3 #3、§3.4 #4、§6.2 备选、§7.1、AC-3/AC-17 |
| F7 | render 型（modules/roster/topology）`part` 子集不可行 | **已修订**：render 型 `part` 整段返回 + 首行说明；非 render 型仍按字段/样例/错误裁剪；测试按此断言 | §3.2、§3.3 #1、§4.1、§7.1、AC-8 |
| F8 | B 组「主校验器 + 合法样例」缺可调用 seam | **已修订**：新增 `DocFormatTestSeam` 与 §2.3.1 逐行 seam 表；`text-shape` 行披露残余风险；A14 严格层给服务级夹具/源码文本 seam | §2.3.1、§3.2、§3.4 #1、§7.1、AC-17、§9.2 |
| F9 | A3/A4 漏「普通模块 paths 仅 1 项」及错误码 | **已修订**：补跨层口径（parser 1–20 / roster 层普通模块仅 1 项）；补 `modules-doc-*`/`roster-*` 全量码；新增稳定 code 扫描测试 | §2.4 A3/A4、§3.4 #6/#8、§7.1、AC-7 |
| F10 | 真实运行无法在预算内产生项目角色真实读取 | **已修订**：§7.4 预置 1 个已激活项目角色（准备不计客户消息/墙钟预算）+ 直连查询；预置不可行时回落为注册/数据源证据并如实标注；AC-12/Q10 对齐 | §7.4、§7.2 AC-12、§8 Q10、§9.3-4 |
| F11 | `AdapterCapabilities`/`GovernedToolsOptions` 归属 | **已修订（P1.2 再修正，G1）**：`model/runtime.ts` 加 `GovernedToolsOptions.docFormat?`（`:3450`）；`run-role.ts` 加 `openRoleSession` 输入 `docFormat?`（`contractCheck` 在 `:875`）与 `AdapterCapabilities.docFormat?`（`:304-438`；`contractCheck` 在 `:409`）；透传 `:2106/:3546`。P1.1 曾误写 `RoleSessionDeps.docFormat?`；该接口（`:3470`）仅 `createAdapter`/`runtimeOptions`，P1.2 已更正 | §3.1、§6.1 #3/#7、§14-G1 |
| F12 | Pi「无 promptGuidelines」表述不准确 | **已修订**：系统提示不拼接，但工具定义逐工具透传（`toPiTool:482-496`、`bindRole:1589`）；加 `toPiTool(describeTool("doc_format"))` 断言 | §4.3、§9.1、§7.1 |
| F13 | 复用 `contractSchemaText` 带出 `contract_check` 标题 | **已修订**：复用原文前加来源说明行（「以下为 contract_check 同源原文…」）；保留 `includes(contractSchemaText(topic))` 断言 | §3.3 #1、§7.1、AC-2 |
| F14 | 索引预算偏紧 | **已修订**：索引上限 4096→**8192 B**；P1 实测；超限按 stage 汇总（Q14）；详情仍 ≤8192 B | §3.2、§4.1、§4.4、§8 Q14、§9.1 |
| F15 | T2 自评 | **已修订**：改「**建议 T2，待统筹裁决**」；档位不由方案自评定；升档条件补 F6 公共出口 | 头部、§6.3、§8 Q13、§9.4 |
| F16 | A24/A22/A10 小项 | **已修订**：A24 标 `audience:"app-managed"`（应用写、角色不可写/不可读）；A22 改「无校验器、仅摘录」；A10 注 no-op 快照例外（`amendment-validate.ts:339`） | §2.2 A10/A22/A24、§2.4 A10/A22–A25 |

**未采纳/后置说明**：
- F14 的「索引只列 stage + 代表 id」未作为默认（会削弱 B 组可发现性）；改为「8 KiB 上限 + P1 实测 + 超限时 B 组 stage 汇总」（Q14）。
- F6 的「新增公共只读导出」未作为默认（扩展写集/H1）；默认「副本 + owner pin 测试」；如需可另案（§9.3-5）。
- F5 的「改用既有文件」未作为默认（语义最贴合的是恢复 `session.test.ts`）；备选已记录（§9.3-6）。

---

## 14. 窄复核（R2）处置记录（G1–G4 / S1–S4）

> 输入：独立复核上下文对 P1.1 的窄复核（结论「建议提交（进入 B1/团队计划），must-fix 0；请做 P1.2 小修订」）。本轮只改本文件；未实施、未改其它文件、未提交/推送。

| # | 问题（摘要） | P1.2 处置 | 落点 |
| --- | --- | --- | --- |
| G1 | 透传面/`contractCheck` 归属错误 | **已修订**：`openRoleSession` 输入字段 `docFormat?`（`contractCheck :875`）+ `AdapterCapabilities.docFormat?`（`:304-438`；`contractCheck :409`）+ 透传 `:2106/:3546`；`RoleSessionDeps`（`:3470`）仅 `createAdapter`/`runtimeOptions`，**不加** `docFormat` | §0.4-7、§3.1、§6.1 #7、§13-F11 |
| G2 | A4 缺 10 个 `roster-*` 码；稳定 code 扫描族不全 | **已修订**：A4 补 `roster-role-builtin/duplicate`、`roster-directory-{invalid,governance,overlap}`、`roster-module-directory-{governance,overlap}`、`roster-module-unbound`、`roster-role-without-module`、`roster-module-multi-owner`；§3.4 #8/§7.1 改为按 code 族（含 `modules-doc-*`）收集并保留白名单理由 | §2.4 A4、§3.4 #8、§7.1 |
| G3 | `DocFormatSpec` 缺 `validator` 字段 | **已修订**：`DocFormatSpec.validator: DocFormatValidatorRef`（`file`/`symbol` 对 convention 型可选；convention 型用 `kind:"convention"`）；§7.1 逐 spec 断言 | §3.2、§7.1 |
| G4 | 含占位符模板不能直接喂 `summarizeIntent` | **已修订**：A13 新增**填充后**的具体样例（非占位符模板）；§3.4 #7/§7.1 使用该样例，模板仅作字段提示 | §2.2 A13、§2.4 A13、§3.4 #7、§7.1 |
| S1 | `docFormatText` 返回形状与 `contractCheckText` 不一致 | **已修订**：`DocFormatFn` 与 `ContractCheckFn` 同型（纯文本返回）；`docFormatText` 返回 `Promise<string>`；工具包装层统一 `{ok:true,message}`/`{ok:false,message}`；未知 id 以纯文本列出可用 id | §3.1、§4.1、§4.2 |
| S2 | 扫描白名单缺 `version-change-service/v1`、`chief-hub-resume/v1` | **已修订**：加入白名单并给理由（服务契约版本；`directHash` 哈希域标签） | §2.6、§3.4 #4、§7.1 |
| S3 | §2.5 A2 同时列「严格解析」与「字面量比对」 | **已修订**：A2 仅列「只做 schema/frontmatter 字面量比对（不属严格解析）」并说明各层口径（roster 子串/正文路径；upgrade/pin 字面量） | §2.5 |
| S4 | P1.0 原文未保留、版本记录措辞 | **已修订**：头部/版本表/§12 改为「P1.0/P1.1 原文被原地覆盖、未跟踪；规模/哈希引用 R1.0 复核记录 §0」；后续版本避免原地覆盖已复核版本 | 头部、版本记录、§12 |

---

**（完）**
