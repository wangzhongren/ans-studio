# 派发记录：每个文档格式的权威说明与全员可读（T2，2026-11-09）

- **任务 ID**：`2026-11-09-document-format-specifications`
- **记录角色**：ANS 统筹调度（Scheduler）
- **日期**：2026-11-09
- **状态**：团队计划已写盘；**实施已放行**。基线 `3cd55dc6ed7a67f29a827e7f633aa0afed5e29b1`（团队计划 run 变更已提交并推送，PR #80；合并待客户逐 PR 允许）；`git status --porcelain -- src app test` = 0；分支 `feat/document-format-specifications`。共享 `src/model/runtime.ts`、`app/desktop/session.ts` 以该基线串行写。
- **依据**：团队计划 `docs/scheduling/2026-11-09_team-plan_document-format-specifications.md`（`4d99586f6b32d884ab461307541e7f01f82cc092f0e5c9eaaeabc42f615ebdc2`）；方案 P1.2 `docs/planning/2026-11-09_design_document-format-specifications.md`（`886fef84…`）；复核 R1.1 `docs/planning/2026-11-09_review_document-format-specifications.md`（`2cbe6919…`，建议提交、must-fix 0）；**B1 最新 v1.1（唯一判据）** `docs/acceptance/2026-11-09_document-format-specifications-criteria-v1.md`（497 行 / 75,577 bytes / `621c5da7654407d132c29dfd87955ac52ca9ab41e66a2b3e7725271468e6244a`；v1.1 只澄清 RR 方法/AC-12-3/AC-14-1 口径，未改 AC/TM/RR/EV 强度）。
- **协调方裁决（2026-11-09）**：文档格式维持 **Q13 默认 T2**（除非策划给出实质风险升级理由并回报）；实施序：团队计划 run B2 后 → 文档格式实施 → D1 → RR → B2。

## 一、批次与单写者

| 批次 | Owner | 写集 | 前置 |
| --- | --- | --- | --- |
| B1 规范注册表 | 编排 | `src/common/编排/doc-format-specs.ts`（新建）、`test/编排/doc-format-specs.test.ts`（新建） | 基线重取（团队计划 run 提交/冻结后） |
| B2 运行时核心 | 运行时核心 | `src/model/runtime.ts`（DocFormat 类型 + `GovernedToolsOptions.docFormat?`）、`src/provider/runtime/tools.ts`、`src/provider/runtime/schema.ts`、`test/runtime-core/doc-format-specs-pin.test.ts`（新建） | B1（导出/数据模型） |
| B3 门禁引擎 | 门禁引擎 | `test/门禁引擎/doc-format-specs-pin.test.ts`（新建） | B1（规范文本） |
| B4 编排/桌面 | 编排 + 桌面窗口（分文件） | `src/pipeline/orchestration/run-role.ts`（编排）；`app/desktop/session.ts`（桌面）；`test/桌面应用/session.test.ts`（新建恢复，桌面） | B2（model/tools/schema） |
| B5 跨角色集成 | 测试 | `test/测试/doc-format-all-roles.test.ts`（新建） | B4 |
| D1 | 测试 | 受影响套件 before/after、TM-1–TM-14、typecheck | B1–B5 |
| RR | 测试 | 真实 Electron + 真实模型 + 真实 UI；隔离 userData/CDP 9223；产品 `doc_format` 读取 + 项目角色预置 ≤1 查询；预算 1 消息/卡 ≤1/产品 ≤3/项目角色 ≤1/≤20 分钟；首果即停 | D1 |
| B2 | 独立验收 | 按 B1 v1（`bec45edf…`）判定 | RR |

- **单写者**：`src/model/runtime.ts`、`app/desktop/session.ts` 与团队计划 run 候选串行；团队计划 run 15 文件在提交/冻结前不得被文档格式改写；同一时刻只有一个 owner 编辑同一文件。
- **纪律**：不改 parser/validator/文档格式/角色卡/边界/流程必读；不建第二份 Markdown/技能副本；`doc_format` 扁平 schema、零磁盘 I/O、注入才注册；judge/有界 Chief 工具集逐字不变；不修 `dispatch_task`/`git_candidate` 呈空；不碰贪吃蛇 9222/运行根；真实运行仅 9223；不提交/推送/合并/发布。
- **写集修订**：若实施发现必要测试支撑文件（如 fixture）不在 B1 §2.1，须由独立验收发 B1 v1.x 窄修订（记录旧/新/理由/影响），不得静默扩展；AC 判据不变。
- **证据**：各 owner 写自身 `角色卡/<role>/docs/change/2026-11-09_W{n}_document-format-specifications.md`；D1/RR 由测试写记录；`session.test.ts` 新建须记录边界漂移（`4c24149` 删除、边界 §1 仍列）。

## 二、放行与下一步

- 团队计划 run 已提交 `3cd55dc` / PR #80；Scheduler 已按该提交重取基线（HEAD `3cd55dc`、`src app test` clean），按 B1→B2/B3→B4→B5 派发。
- D1 通过后执行 RR（B1 AC-12/AC-13/AC-14；9223；预算；项目角色预置回落口径）；B2 由同一独立验收按 B1 `bec45edf…` 判定。
- 合并需客户逐 PR「允许我合并」；发布/tag 未授权。

## 三、实现锚点（写盘时实测；行号以最终基线为准，符号名为准）

- **运行时核心**：`GovernedToolsOptions` `src/model/runtime.ts:3509`；`contractCheck?: ContractCheckFn` `:3581`；`buildGovernedTools` `src/provider/runtime/tools.ts:5096`；`contractCheck` 注入 `:5206-5207`；`makeContractCheckTool` `:3101`。
- **编排透传**：`AdapterCapabilities.contractCheck` `src/pipeline/orchestration/run-role.ts:409`；`openRoleSession` 输入 `contractCheck?` `:875`；capabilities 透传 `:2106`、`:3546`；`RoleSessionDeps` 不加 `docFormat`。
- **桌面**：`contractCheck` 注入 `app/desktop/session.ts:3881-3882`；`contractCheckText` `:10304`；`docFormat` 与 `contractCheck` 相邻注入；数据源静态早退。
- **规范模块**：新建 `src/common/编排/doc-format-specs.ts`；复用 `contractSchemaText`（`src/common/编排/workflow-preconditions.ts:180-259`）、示例常量 `:118-178`、`INTENT_ENTRY_TEMPLATE/NAMING_RULE/ID_RULE`（`src/common/shared/intent-entry-contract.ts:19-37`）。
- **工具 schema**：`doc_format` 扁平对象（`format?: string`、`part?: "fields"|"example"|"errors"`）；无顶层 `oneOf`/`anyOf`；索引/详情 ≤8192 B；未知 id 纯文本；零磁盘 I/O；注入才注册。
- **测试**：`test/编排/doc-format-specs.test.ts`、`test/runtime-core/doc-format-specs-pin.test.ts`、`test/门禁引擎/doc-format-specs-pin.test.ts`、`test/桌面应用/session.test.ts`（新建恢复）、`test/测试/doc-format-all-roles.test.ts`；冻结 id 54（A25+B29）。

## 四、实施状态（2026-11-09）

| 批次 | 状态 | 候选文件 | 关键结果 |
| --- | --- | --- | --- |
| B1 编排注册表 | 完成 | 2 新 | `doc-format-specs.ts` `f141e4ba…`（2,291 行）；测试 `f9abe8f3…`；24/24；索引 5,223 B；最大详情 4,089 B；54 id |
| B2 运行时核心 | 完成 | 3 M + 1 新 | `runtime.ts` `89e5fbc9…`、`tools.ts` `b07c3f80…`、`schema.ts` `fd3ee646…`、pin 测试 `f05471e3…`；11/11；typecheck 0 |
| B3 门禁 pin | 完成 | 1 新 | pin 测试 `45b1ce34…`；19/19；boundary-yaml 13/13 |
| B4a 编排 run-role | 完成 | 1 M | `run-role.ts` `d754d767…`（+20/−0）；typecheck 0；run-role 直接测试 20/20 |
| B4b 桌面注入 | 完成 | 1 M + 1 新 | `session.ts` `df5bf7b0…`（+32/−1）、`session.test.ts` `23bc19a7…`（恢复 `4c24149` 删除路径，H1 delta=0）；7/7 |
| B5 跨角色集成 | 完成 | 1 新 | `doc-format-all-roles.test.ts` `d992b164…`；5/5；8 角色注册、40 次真实轮次调用 |
| D1 | 完成（v1.1） | — | 记录 `adc23f45…`（227 行 / 42,274 B）；候选 11 文件聚合 **`bcd3255392fb0e5e311c6dcec81bdfa2a0a0158af3573ac1d47f186ca4fef5b3`**、manifest 1,113 / `fc296e95…`；v1.0 曾发现 1 条 governance-matrix 导入隔离失败，编排修复（B18 唯一字面量、无 import）后 **18/18** 消除；新增确定性失败 0/新 skip 0；typecheck exit 0；TM-1–TM-14 有证据锚点 |
| RR | 完成（RR3；项目角色 RR-7 回落） | — | RR3 记录 `44bdf61c…`（212 行 / 31,639 B），证据 `25137114…`（106 文件）；1 消息 → 派发 product（无模块字段）成功 → 产品真实 `doc_format` 1 次（`project-intent/v1`，回执 2,162 B）→ 意图 v4 `905870be…` 25,686 B → `prepareIntentConfirmation` 通过 → 意图卡 1 张 + 客户 confirm + `freeze-committed`；6 内置 + 项目角色 `test-dev` 会话注册；项目角色直连被 `sendSession` 拒绝，按 **B1 v1.1 RR-7** 回落并标注；产品 1 write+5 edit（frontmatter 首写正确）、3 次 run_shell 未执行 + 1 审批卡（B1 v1.1 不计入意图卡 ≤1）；预算 1 消息/1 意图卡/产品 1/3/墙钟 ≈8m27s；9222 零监听、9223 释放、贪吃蛇零触碰；候选/manifest 前后不变；模型 `deepseek-v4-flash`（非 Anthropic） |
| B2 | **执行中** | — | 同一独立验收按 B1 v1.1 `621c5da7…` 判定 11 文件候选 + D1 v1.1 + RR3 |
