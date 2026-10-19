# 2026-10-19 变更：提案架构门槛与治理提示架构要求

## 来源

客户 2026-10-19 新批评（原话）：

> 「这个感觉也没有啥架构的啊，提案角色应该也要考虑到扩展性，给出一个架构方案啊。」

真机证据：R1/R3 提案均无模块分解、依赖方向、扩展点、数据/契约版本与迁移策略。门禁引擎角色正在把
「架构与可扩展性」加入工程质量基线（`src/common/门禁引擎/governance-roles.ts`）；编排侧负责让
**提案判断 agent** 与**治理会话提示**同样强制要求架构章节。

本批只改编排边界：`src/common/编排/governance-judge-prompt.ts`、
`src/common/编排/governance-judge-verdict.ts`（仅注释）、`src/pipeline/orchestration/govern-session.ts`、
`test/编排/**` 与本角色文档。**未新增机械文本匹配门，未改任何工具注册/写入门禁/派发与验收判定。**

## 规则（编排侧口径）

1. **判断 agent rubric（proposal 卡）**：
   - 新项目（创世 / 首次建立系统或模块）提案必须含「架构方案」章节；既有项目的变更提案必须含
     「架构影响分析」章节。
   - 章节须覆盖：模块分解与职责、依赖方向（无环）、数据流、扩展点（新增状态/角色/导出格式/统计维度时
     改哪里、不改哪里）、数据 schema 与 API/契约的版本/迁移/兼容/弃用策略、横切关注点归属、权衡与备选。
   - 缺失、只有标题/空话、或与提案范围自相矛盾 ⇒ **不得 approve**；`manual` 且模型自报
     `reasonCode:"insufficient-evidence"`（该码在 `SAFE_MANUAL_REASON_CODES` 白名单内，原样保留）。
   - 判断 agent 必须**实际读取 `proposalPath` 全文**核对，不得仅凭卡片 preview 片段判断章节存在。
2. **确定性底线（未新增文本匹配）**：`proposalPath` 本就在 `requiredReadPaths` 中，`evaluateGovernanceJudgeVerdict`
   第 5 步要求 `stats.readPaths ⊇ requiredReadPaths`，未实际读过提案全文不可能 approve。本轮**不**对
   preview/正文做「架构」关键词匹配：preview 有界（8KB），长提案的架构章节可能在片段之外，机械匹配会误伤。
3. **治理会话提示**：
   - `ENGINEERING_QUALITY_BASELINE` 副本与门禁引擎基线**逐字同步**，新增「架构与可扩展性」条。
   - 新增 `ARCHITECTURE_EXTENSIBILITY_REQUIREMENTS`（与质量基线并列追加），明确三阶段职责：
     - **Draft（提案）**：架构方案/影响分析 + 覆盖项；缺失或空洞不得建议 accept；
     - **Steward（流程/派发）**：流程与派发引用架构模块与边界；跨模块/改契约安排契约冻结与集成/端到端验证；
       扩展点必须有覆盖步骤；
     - **Proof（验收）**：核对实现与架构声明一致（模块边界/依赖方向、schema/API 版本与迁移、扩展点）；
       缺章节或偏离声明不得建议 accept。
   - single/su 追加「基线 + 阶段要求 + 架构要求」；trio 追加「角色纪律 → 基线 → 架构要求 → shell 审批档」，
     并在 Draft/Steward/Proof 角色纪律中各加一段角色专属架构要求。

## 改动文件与行号

### `src/common/编排/governance-judge-prompt.ts`

- L63-64：通用 approve 门槛新增第 6 条——proposal 卡须通过架构门槛，否则 `manual` +
  `reasonCode:"insufficient-evidence"`。
- L68-74：proposal 逐卡 rubric 新增「架构门槛」段（新项目架构方案 / 变更架构影响分析、覆盖项、
  缺失/空洞/自相矛盾 ⇒ 不得 approve、必须读全文、preview 不算核对）。

### `src/common/编排/governance-judge-verdict.ts`

- L333-337：proposal 分支新增注释，说明架构内容由 rubric 交判断 agent 核对；**有意不做**标题/关键词
  机械匹配（preview 有界、避免误伤），确定性底线是第 5 步 required-read（proposalPath 必读）。
  判定逻辑零改动。

### `src/pipeline/orchestration/govern-session.ts`

- L514-539：`ENGINEERING_QUALITY_BASELINE` 注释补充客户新批评来源；L534 新增
  「架构与可扩展性」条（与门禁引擎基线逐字一致）。
- L542-558：新增 `ARCHITECTURE_EXTENSIBILITY_REQUIREMENTS`（Draft/Steward/Proof 三阶段职责；
  注释与门禁引擎角色卡常量互指、要求同批同步）。
- L581-587：`buildGovernPrompt` 文档注释补充两类提示的架构要求与阶段职责。
- L611-613：single/su 的 `quality` 组合追加架构要求块（基线 → 阶段要求 → 架构要求）。
- L652-655：trio 返回在基线与 shell 审批档之间追加架构要求块。
- L672-675：Draft（proposal）纪律新增「架构方案/影响分析」段。
- L702-703：Steward（schedule）纪律新增「架构与边界」段。
- L734-735：Proof（verification）纪律新增「架构核对」段。

### `test/编排/governance-judge.test.ts`

- L256-271：新增 rubric 内容断言——架构门槛段、架构方案/影响分析、模块分解、依赖方向、扩展点、
  schema/API 版本迁移、横切关注点、权衡、`insufficient-evidence`、不得仅凭 preview、必须读全文。
- L273-293：新增行为断言——判断 agent 因架构章节缺失自报 `manual/insufficient-evidence` 时结论保持
  manual、不放行。

### `test/编排/governance-session.test.ts`

- L303/305/306：proposal/schedule/verification 钉提示词断言补充架构关键字
  （架构方案/影响分析/扩展点/模块分解；架构与边界/契约冻结/扩展点覆盖；架构核对/模块边界与依赖方向/
  schema、API 版本）。
- L327-335：trio 循环内新增——基线含「架构与可扩展性：」、含架构要求段、Draft/Steward/Proof 三阶段
  职责均出现；原「不得写已批准/已授权」断言保留。
- L358-366：single/su 新增同样断言。
- 既有断言零放宽。

### 文档

- 本变更记录；`角色卡/编排/changelog.md`；`角色卡/编排/memo.md`。

## 测试与验证（真实输出）

工作树含其他角色未提交改动（门禁引擎基线/角色卡、桌面任务文本、shell 判断并发池等）。

| 命令 | 结果 |
| --- | --- |
| 基线（改动前）`node --test "test/编排/**/*.test.ts"` | **571 计 / 571 过 / 0 红 / 0 skipped** |
| 基线（改动前）`npm run typecheck` | **exit 0** |
| 定向 `node --test test/编排/governance-session.test.ts test/编排/governance-judge.test.ts` | **76 计 / 76 过 / 0 红** |
| 改动后 `node --test "test/编排/**/*.test.ts"` | **573 计 / 573 过 / 0 红 / 0 skipped**（+2 = 新增判断 rubric 与行为用例） |
| 改动后 `npm run typecheck` | **exit 0**（`tsc --noEmit` 无错误；仅 npm 的 `ELECTRON_MIRROR` 配置告警） |

## 跨角色依赖（未越界修改，如实登记）

1. **门禁引擎（`src/common/门禁引擎/governance-roles.ts`）**：本批同步其 `ENGINEERING_QUALITY_BASELINE`
   的「架构与可扩展性」条（工作树当前已在 L142 落下）。两处是同一口径的物理副本（分层禁止导入其他角色
   私有 common），注释已互指；任一侧改文案必须同批同步。其五张角色卡的架构职责（文件头注释所述：
   Lead acceptance / Crew 写区模块映射 / Draft 架构方案 / Steward 流程边界 / Proof 核对声明）与本批
   `ARCHITECTURE_EXTENSIBILITY_REQUIREMENTS` 同口径，请保持同步。
2. **桌面属主（`app/desktop/**`）**：桌面 su 聊天直接走 `openRoleSession` + 用户消息，不经过
   `buildGovernPrompt`；其架构要求覆盖依赖门禁引擎五张角色卡文本。桌面验收任务文本如已含质量基线，
   建议同批补「架构声明核对」一句（本批未改 `app/**`）。
3. **测试角色**：跨文件逐字比对（编排基线副本 vs 门禁引擎基线常量）仍建议由测试角色加钉子；本批未越界
   新增跨角色测试。
4. **README/文档属主**：README 的工程质量基线章节若列了基线条目，需补「架构与可扩展性」条；本批未改。

## 残余风险

- **提示词是行为约束，不是机械门禁**：架构内容判断依赖模型执行 rubric；模型仍可能忽略。确定性底线只能
  保证「提案文件被实际读过」，不能保证「模型判对了架构质量」。
- **新项目 vs 变更的分类依赖模型判断**：提案 frontmatter/意图文件通常能区分；若两者都未写明，模型可能
  选错章节名。rubric 已要求以提案全文与意图为准，但仍属模型判断。
- **两份物理副本可能漂移**：编排常量与门禁引擎常量只能靠注释与评审同步；建议后续由测试角色加跨文件
  逐字比对。
- **preview 片段不参与架构判断**：这是有意的（避免误伤）；代价是判断 agent 必须读文件，若文件读取被拒/
  截断则 manual（fail-closed）。

## 边界声明

只写 `src/common/编排/governance-judge-prompt.ts`、`src/common/编排/governance-judge-verdict.ts`（仅注释）、
`src/pipeline/orchestration/govern-session.ts`、`test/编排/{governance-judge,governance-session}.test.ts`
与本角色 `角色卡/编排/**` 文档；未改 `app/**`、`run-role.ts`、门禁引擎、运行时核心/适配器、其他角色文件；
未执行 git 提交；未读 `.env`、未发真实模型请求。
