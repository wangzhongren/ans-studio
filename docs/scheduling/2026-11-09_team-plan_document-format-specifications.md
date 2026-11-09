# 团队计划：每个文档格式的权威说明与全员可读（T2，2026-11-09）

- **任务 ID**：`2026-11-09-document-format-specifications`
- **产品 flowId（拟）**：`document-format-specifications`
- **记录角色**：ANS 统筹调度（Scheduler，独立固定上下文）
- **日期**：2026-11-09
- **状态**：团队计划已写盘。闸门 0 已由客户「开始做」确认；闸门 1/2 按 2026-11-07 预授权/全权委托免逐次确认；实施排 judge 与团队计划 run 变更之后（单写者），待基线重取放行。**未派发实施（本计划写盘后派发）。**
- **风险档位**：**T2（建议，按 P1.2 §9.4；由统筹裁决，F15/Q13）**。本计划默认 T2 + 全量受影响回归；若统筹按「新增工具面/凡触 Model 公共工具契约即 T3」裁定 T3，则按 T3 全量回归（AC 与判据不变），档位不得由实施/验收自行下调。
- **唯一实施基线（方案 P1.2）**：`docs/planning/2026-11-09_design_document-format-specifications.md`（979 行 / 146,555 bytes / SHA-256 `886fef84c3db34515a98f5874a33bb22134a3fc3b02f20aa3d185b828a3e7c54`）。
- **独立复核**：`docs/planning/2026-11-09_review_document-format-specifications.md`（499 行 / 82,067 bytes / `2cbe69195f75a700ccdb747cdbdcb9343c1bfc20fb6d011367a1b39c60daee05`；R1.0 F1–F16 + R1.1 窄复核「建议提交、must-fix 0」；G1–G4/S1–S4）。
- **B1 v1（冻结，唯一判据）**：`docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md`（482 行 / 69,121 bytes / `bec45edfa47dd54229e1f37faac540db7ae9773e967b61004e47f65902c15dbe`；BASE-1–8、AC-1–17、TM-1–14、RR-1–8、EV1–6、R-1–14；全部 `未取证`）。
- **意图记录（闸门 0）**：`docs/communication/2026-11-09_intent_document-format-specifications.md`（28 行 / 2,948 bytes / `bf870ae959772956912006e52c32502476ac787bdb0466d2826abd6b7e56ce8d`）。
- **并行变更（只读）**：
  - judge 代批：P1.2 `1477a6e4…`；**B2 pass `07dd2da3…`**（269 行 / 48,743 bytes），候选 25 文件未提交（聚合 `9eb21d3b…`、manifest `2468fc59…`）。
  - 团队计划 run 绑定（T2）：P1.1 `2bb663fe…`、R1.1 `452f6437…`、B1 `eb94d7cb…`、团队计划 `docs/scheduling/2026-11-09_team-plan_team-plan-run-binding.md`（本日）；写集含 `src/model/runtime.ts`、`app/desktop/session.ts`。
  - 提案卡修复：已提交 HEAD `fb1aa39e`（B2 pass `8af767e2…`、变更包 `e5735373…`）。
- **基线（写本计划时实测）**：worktree `.claude/worktrees/trunk-amendment`；分支 `feat/plan-escalation-card`；HEAD `fb1aa39e787934f334b9c164e4221074f97f6147`（tree `ee33c3e95d9b3fb61dc5d05eea66c2d0a2eb9583`）；工作树携带 judge 25 文件未提交实现 + 团队计划 run 设计/B1（未实施）。**当前工作树不得作为本变更实施基线；实施须按 BASE-1 在 judge 与团队计划 run 变更冻结/合入后重取。**
- **串行次序（P1.2 §10.3；P1.1 §3.3；以协调方裁决为准）**：提案卡修复（已提交）→ judge（B2 pass，待提交/合入）→ 团队计划 run 绑定（T2，实施在 judge 后）→ **本变更（最后）**。`src/model/runtime.ts` 与 judge/团队计划 run 变更同文件不同区域；`app/desktop/session.ts` 与团队计划 run 变更同文件；`src/pipeline/orchestration/run-role.ts`、`test/桌面应用/session.test.ts` 本变更独占。同一时刻单写者；合并前互相 diff、后合并方 rebase 并重跑双方测试矩阵。

---

## 一、任务（按 P1.2 / B1，不扩大）

1. **单一事实来源**：新建 `src/common/编排/doc-format-specs.ts`，注册全部 **54 个被真实解析的格式**（A25 角色/客户可写 + B29 应用内部；一行一 id），提供 `docFormatIndexText()`/`docFormatSpecText(id, part?)`/`DOC_FORMAT_SPEC_VERSION`/`docFormatKnownIds()`；纯数据/纯渲染、无 I/O、无判定。
2. **只读工具 `doc_format`**：扁平 schema（顶层 object + 非空 properties + required，**无顶层 oneOf/anyOf**）；索引 ≤8192 B、详情 ≤8192 B、render 型 part 整段返回并标注、截断显式；未知 id 纯文本、非字符串拒绝、零磁盘 I/O。
3. **全员可读**：6 个内置治理角色 + 项目角色会话均注册 `doc_format`（注入才注册）；judge 会话（「替我审」/「替我决策」）与有界 Chief 决策会话**不注入**、工具集/系统提示逐字不变；不改角色卡/边界/流程必读。
4. **不漂移/不放宽**：54 个 spec 与真实 parser/validator 逐项一致（样例正例、字段变异、overclaim、schema 字面量扫描、稳定 code 扫描、加载级负例、私有常量 pin）；不改任何 parser/validator/文档格式/角色卡/边界；无第二份 Markdown/技能副本。
5. **真实运行**（B1 AC-12/AC-13/AC-14）：真实 Electron + 真实模型 + 真实 UI；隔离 userData、CDP **9223**；产品按说明一次写对 `project-intent/v1` + 产品/项目角色真实调用 `doc_format`；不触碰贪吃蛇 9222。

## 二、五维判断与角色

| 维度 | 判断 |
| --- | --- |
| 责任独立性 | 保留现有角色，无新增/拆分/合并：编排（规范注册表与 pin 测试）、运行时核心（DocFormat 类型/工具/schema）、门禁引擎（角色卡/边界/MCP 私有常量 pin）、桌面窗口（注入/静态数据源/新建 session 测试）、测试（跨角色集成）；无角色职责变更。 |
| 范围归属 | 全部路径在既有 Section 1；**H1 delta = 0**；`test/桌面应用/session.test.ts` 为**新建（恢复已删除路径）**，路径已在边界 §1，交付回执记录边界漂移；不新增目录/角色/技能副本。 |
| 契约影响 | 有：`GovernedToolsOptions.docFormat?`、`openRoleSession` 输入 `docFormat?`、`AdapterCapabilities.docFormat?`、`DocFormatInput/Result/Fn`、`doc_format` 工具 schema **均为加法可选/non-breaking**；不改数据模型/放行语义；若需新增公共只读出口（F6 方案 2）或写集外文件 ⇒ 停止升级。 |
| 证据独立性 | L1 规范注册表 → L2 门禁 pin → L3 运行时工具 → L4 桌面注入 → L5 跨角色 → L6 真实运行；各层独立绑定候选；B2 独立验收；统筹不判。 |
| 协调成本 | 中：与 judge/团队计划 run 变更串行（`model/runtime.ts`、`app/desktop/session.ts`），规范模块/测试为本变更独占；T2 全量受影响回归。 |

## 三、写集与 owner（按 P1.2 §6.1 / B1 §2.1；零重叠）

| # | 文件 | Owner（单一） | 用途 |
| --- | --- | --- | --- |
| 1 | `src/common/编排/doc-format-specs.ts`（新建） | 编排 | 54 个 `DocFormatSpec` + 索引/详情渲染 + 版本/已知 id；纯数据/纯渲染 |
| 2 | `test/编排/doc-format-specs.test.ts`（新建） | 编排 | 注册表完整性、冻结 id、样例正例、字段变异、overclaim、schema/稳定 code 扫描、预算、复用断言 |
| 3 | `src/model/runtime.ts` | 运行时核心 | `DocFormatInput/DocFormatResult/DocFormatFn`、`GovernedToolsOptions.docFormat?`（加法；`:3450` 区域；**只改该区域**） |
| 4 | `src/provider/runtime/tools.ts` | 运行时核心 | `makeDocFormatTool`；`buildGovernedTools` 注入才注册（`contract_check` 相邻区域） |
| 5 | `src/provider/runtime/schema.ts` | 运行时核心 | `doc_format` 参数 schema/description/promptGuidelines（扁平） |
| 6 | `test/runtime-core/doc-format-specs-pin.test.ts`（新建） | 运行时核心 | 工具形状/注入才注册/未知/非字符串/`tools/list`/`toPiTool`/MCP 声明钉住 |
| 7 | `src/pipeline/orchestration/run-role.ts` | 编排 | `openRoleSession` 输入 `docFormat?`（`:875` 区域）+ `AdapterCapabilities.docFormat?`（`:304-438`）+ 两处 capabilities 透传（`:2106`、`:3546`）；`RoleSessionDeps` 不加 |
| 8 | `app/desktop/session.ts` | 桌面窗口 | `docFormat` 注入（所有角色会话）+ `docFormatText` 静态早退数据源 |
| 9 | `test/桌面应用/session.test.ts`（**新建：恢复已删除路径**） | 桌面窗口 | 注入矩阵（6 内置 + 项目角色）、静态早退 spy、未知/非字符串、legacy `contract_check` 不变、judge 工具集不变 |
| 10 | `test/门禁引擎/doc-format-specs-pin.test.ts`（新建） | 门禁引擎 | 角色卡 10 章节/三文件路径/边界两份恒等/严格 YAML 的规范钉住；私有常量交叉断言 |
| 11 | `test/测试/doc-format-all-roles.test.ts`（新建） | 测试 | 跨角色集成：6 内置 + 1 项目角色注册 `doc_format`；judge/有界无；数据源只读无副作用 |
| 12 | 各角色 `角色卡/<role>/docs/change|fix/` 实施记录 | 各实施角色 | 按各自边界的变更/修复记录（不在产品写集） |

- **写集外 diff = 0**：judge 写集、提案卡修复写集、团队计划 run 写集、parser/validator 实现（`workflow-preconditions.ts`、`run-manifest.ts`、`evidence-check.ts`、`boundary-*.ts`、`amendment-validate.ts`、`upgrade-validate.ts` 等）、`app/renderer/**`、`角色卡/**` 的 role-card/boundary、`docs/skills/**`、`docs/mcp/**`、`test/桌面应用/optional-acceptance.test.ts`、`.ans/**`、目标项目产品文档；不新增依赖/目录/构建发布配置。
- **旧断言**：既有 contract topic/边界/run-pin/run-manifest/evidence-check 断言必须原样通过；仅允许新增测试文件与「注入才注册」新增断言，逐条记录旧/新/理由；不得删除/弱化 fail-closed 断言。

## 四、阶段计划

| 节点 | 内容 | 前置 |
| --- | --- | --- |
| G2 | 沟通留痕本计划 + P1.2 + R1.1 + B1（预授权） | 本计划写盘 |
| 基线重取（BASE-1/2） | judge、团队计划 run 变更冻结/合入后重取 HEAD/tree/status/聚合；确认单写者窗口；重取受影响套件 before | judge B2 `07dd2da3…` + 提交/合入；团队计划 run B2/合入（待实施）；本计划 |
| P1 规范注册表 | `doc-format-specs.ts` 54 spec（A25+B29）、索引/详情/part/预算/版本；实测索引字节 | 基线重取 |
| P2 漂移钉住 | 字段变异/overclaim/schema 扫描/加载级与主错误码负例/稳定 code 扫描/testSeam；门禁/运行时核心 pin | P1 |
| P3 工具与会话 | `model/runtime.ts` 类型、`tools.ts`/`schema.ts`、`run-role.ts` 透传、`app/desktop/session.ts` 注入/静态早退、`session.test.ts` 新建 | P2 |
| P4 跨角色与真实运行 | `test/测试/doc-format-all-roles.test.ts`；RR（AC-12/13/14；9223；预算） | P3 |
| P5/D1 | §7.3 全量 + 受影响套件 before/after + typecheck；已知红不恶化 | P4 |
| E3 | 按 T2 受影响全量回归（若 Q13 裁 T3 则全量 T3）；参照 D1/基线已知红 | D1 |
| E3-B | 变更包（候选/证据/披露/契约变更/边界漂移） | E3 |
| B2 | 同一独立验收按 B1 `bec45edf…` 判定 | E3-B |

## 五、验收与证据（要点）

- **候选身份**：`src app test` 逐文件 raw SHA-256 + 可复算聚合（`path + "\0" + sha256`，按路径排序后 SHA-256）+ manifest；只含写集；写集外 diff 0；稳定性前后快照；`session.test.ts` 新建/边界漂移记录。
- **B1 判据**：BASE-1–8、AC-1–17、TM-1–14、RR-1–8、EV1–6、R-1–14；旧断言改写逐条；known-red 口径（新增确定性失败=0、新 skip=0、同名不恶化）。
- **确定性**：54 spec 与真实 parser/validator 一致（样例/变异/overclaim/schema 扫描/稳定 code/加载负例）；`doc_format` 扁平/零 IO/预算/未知 id；6 内置 + 项目角色注册且 judge/有界不变；无校验/格式/角色卡/边界变更；typecheck exit 0。
- **真实运行 RR**：
  - 环境：真实 Electron（本候选 worktree `app/main.ts`）+ 真实模型 + 真实桌面 UI；隔离 `--userData`（仓库外）；CDP **仅 9223**；仓库外独立目标项目根（如 `C:\Users\51054\Desktop\work\ans-doc-format-run-2026-11-09\target`）；**9222 全程零监听/零占用**，贪吃蛇运行根/临时根/target 前后只读快照零改动。
  - 预置 1 个已激活项目角色（正常流程或复制既有合法目标项目；准备不计预算；记录来源/路径/哈希）；预置不可行按 B1 RR-7 回落并如实标注「未做项目角色真实模型调用」。
  - 场景：1 条客户消息 → 幕僚派产品 → 产品真实调用 `doc_format` 并读出说明 → 写 `project-intent/v1` 一次写对 → `prepareIntentConfirmation` 通过 → 6 内置 + 1 项目角色会话注册（真实 Electron 工具目录）→ 项目角色直连 ≤1 条查询并保留调用/回执原文。
  - 预算：客户消息 ≤1；卡 ≤1；操作者直连项目角色消息 ≤1；产品 `doc_format` ≤3（期望 1）；项目角色 ≤1；墙钟 ≤20 分钟；首果即停；不自动重试；任何非本变更卡/越界写/非预期模型调用立即停止并如实报告。
- **披露**：模型实际名（历史 RR 为 `deepseek-v4-flash`，非 Anthropic Claude；RR 须如实记录，不得宣称 Claude）；Pi/Codex 真实模型行为不作承诺（确定性覆盖）；`dispatch_task`/`git_candidate` 呈空范围外；注册不等于真实读取；A14 严格层/B 组 text-shape 残余风险；Q12 模型不主动查另案；索引预算实测。

## 六、协调项与默认处置（B1 §9）

1. **Q13（T2/T3）**：默认 T2 + 全量受影响回归；若裁 T3 按 T3 全量回归，AC 不变。**实施前须确认**。
2. **Q11/串行**：提案卡修复（已提交）→ judge（B2 pass，待提交/合入）→ 团队计划 run 绑定（T2）→ 本变更（最后）；`src/model/runtime.ts` 与 judge/团队计划 run 同文件不同区域；`app/desktop/session.ts` 与团队计划 run 串行；同一时刻单写者。
3. **Q10（项目角色）**：默认预置 1 个已激活项目角色并真实调用；预置不可行按回落口径如实标注；注册不等于真实读取。
4. **Q14（索引预算）**：索引/详情 ≤8192 B；P1 实测；超限按 B 组 stage 汇总一行 + 详情可查，不得丢失可发现性。
5. **Q1–Q9/Q12**：按 P1.2 默认（只读工具 `doc_format`、全量 54 id、规范放编排侧、样例+真实 parser、强漂移防护、不改角色卡、内部格式简版、复用 `contractSchemaText`、工具名 `doc_format`、模型不主动查另案）。
6. **F6 方案 2**（跨角色公共只读出口）：默认不采用（副本 + owner pin）；若坚持需扩展写集/重评 H1，本 B1 停用并按普通流程处理。
7. **G1–G4/S1–S4**：`openRoleSession` 输入/`AdapterCapabilities`/透传按 G1；A4 补 10 个 `roster-*` 码、稳定 code 扫描按 code 族（G2）；`validator` 必填（G3）；A13 填充样例（G4）；`docFormatText` 与 `contractCheckText` 同型（S1）；白名单含理由（S2）；A2 分层（S3）；历史字节不保留（S4）。
8. **披露/边界**：不改角色卡/边界/流程必读；不建第二份漂移副本；不修 `dispatch_task`/`git_candidate` 呈空；不碰贪吃蛇 9222/运行根；提交/推送/合并由协调方按流程；**合并需客户逐 PR「允许我合并」**；发布/tag 未授权。

## 七、写盘边界与下一步

- 本计划只写 `docs/scheduling/`；不写产品/测试/角色卡/边界/验收判据；不判验收；不实施；不提交/推送/合并/发布。
- 下一步：协调方确认 Q13（及串行窗口）→ judge 与团队计划 run 变更冻结/合入 → 基线重取 → 按 P1–P5 派发 → D1 → RR → E3 → E3-B → B2。
