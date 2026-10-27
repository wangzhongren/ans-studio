# 变更记录：质检验收标准「工件就绪汇报」角色卡文本同步（report_artifact_ready）

- 状态：**implemented-unverified（已实施、未独立验收）**
- 日期：2026-10-27
- 角色：门禁引擎（Gate Engine）
- 注：同日客户卡化批次（`2026-10-27_change_customer-cardification.md`）在 `governance-roles.ts` 追加了五卡共享客户卡化总则；本记录所列 `governance-roles.ts` 哈希为当时候选，当前候选以卡化批次记录为准。
- 任务：客户新设计——质检 / Proof 写完实施前验收标准后**只向应用汇报**（新工具 `report_artifact_ready`：flowId / stepId / path / summary），由应用校验并决定是否收口；质检不得自行把步骤从 `pending` 改成 `dispatched` / `delivered` / `done`，不得自批（lead-governance-coordination；门禁引擎任务）。
- 依据：
  - 客户本轮任务说明：验收标准写完后调用 `report_artifact_ready` 汇报；等待应用 `accepted`；被拒绝 / 缺失时修正后重报；不自行 `flow_step_update` 改状态、不自批；应用决定后如仍未继续，报告产品 / 运营，不伪造完成。
  - 运行时核心在本工作树内同时开始的未提交契约（`src/model/runtime.ts::ReportArtifactInput` / `ReportArtifactReceipt` / `ReportArtifactFn`、`src/provider/runtime/tools.ts`）：`accepted:true` 只表示应用已接受该产物，是否收口 / 推进 flow 由应用决定；`ok:true` 但 `accepted` 缺失或 false 按未接受 fail-closed。本批只读对齐用词，不改其实现。
- 范围：只改本角色授权写集——`src/common/门禁引擎/governance-roles.ts` 的 `VERIFIER_CARD_TEXT` 产品数据文本与文件头注、`test/门禁引擎/governance-standard-workflow.test.ts`（既有断言更新）、`test/门禁引擎/verifier-artifact-report.test.ts`（新增）、本角色 changelog 与本变更记录。未改 `src/model/**`、`src/provider/**`、`src/pipeline/**`、`src/common/编排/**`、`app/**`、共享 i18n、PM 文档或 `demos/`；未 commit / push；未重启应用；未跑真实 Electron / 浏览器。

## 1. 写前核对与基线

- `git rev-parse --short HEAD` = `b36a971`（分支 `feat/scaffold-first-governance`，worktree `lead-governance-coordination`）。
- 写前本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **347 计 / 346 过 / 0 失败 / 1 Windows 既有 skip**。
- 写前 `VERIFIER_CARD_TEXT` 标准工作流第 2 步为被动口径：「标准落盘且结构合格后才允许实施派发」；流程工具纪律允许 Proof「把 owner=自己的步骤更新到 `delivered`（或 `failed` / `blocked`）」，`done` 由 Steward / Lead 核对账本证据后标记。
- 写作期间工作树内另有**运行时核心 / 编排 / 桌面角色的未提交实现**（`src/model/runtime.ts`、`src/provider/runtime/{schema,tools}.ts`、`src/pipeline/orchestration/run-role.ts`、`app/desktop/{interface,session,artifact-report,governance-advance}.ts` 及其测试 / 文档）。这些不是本角色改动，本批未触碰；本变更记录不把它们计入本角色候选。
- 写后本角色候选哈希（`git hash-object` / `sha256sum`）：
  - `src/common/门禁引擎/governance-roles.ts` = `d34ec35fc880e8b3d71e9a4e628f294a856755e7` / `3f08e22c72e4ef07f94943f6d2ca1346c905e17a6179e30e04e62a1e85ea9fb7`
  - `test/门禁引擎/governance-standard-workflow.test.ts` = `2f243bf28ee06d947963b3996b4bc378a31366fb` / `89ea7d307d75ee67c844c7424d68dc0cbb579374eeaef9e2d19c25af3e2d4082`
  - `test/门禁引擎/verifier-artifact-report.test.ts` = `2b30d88a2a68948898c4a8a02fe96a9957fe1692` / `5baca3f694117f309ea0a8072331eff4c41c35ad652d9cb14fa851c3e1ba9d03`

## 2. 新旧语义差异（`VERIFIER_CARD_TEXT`）

| 维度 | 旧口径 | 新口径（2026-10-27） |
| --- | --- | --- |
| 标准写完后 | 「标准落盘且结构合格后才允许实施派发」——被动等应用派发 | **调用 `report_artifact_ready({ flowId, stepId, path, summary })` 向应用汇报**，**等待应用 `accepted`**；由应用校验并决定是否收口 |
| 被拒绝 / 缺失 | 未写 | 按回执修正后**重新汇报**；`accepted` 缺失 / false / `ok:false` 均不得当已接受 |
| 步骤状态 | Proof 可把 owner=自己的步骤更新到 `delivered`（或 `failed` / `blocked`）；`done` 由 Steward / Lead 标记 | **不自行用 `flow_step_update` 改任何步骤状态**（`pending` → `dispatched` / `delivered` / `done` 等）；`done` 只能由应用收口；不得用 `failed` / `blocked` 掩盖缺口 |
| 自批 | 未显式写 | **不自批**；不用 `flow_step_update` 代替客户验收决定；步骤推进不等于客户决定 / 同意 |
| 应用决定后仍未继续 | 未写 | 如实报告 **产品 / Lead 与 运营 / Steward**，**不伪造完成** |
| gate 步骤 | 已写「done 只能由应用按 gate 报告收口」 | 逐字保留，并补「也不对 gate 步骤做 `flow_step_update`」 |
| 保留要求 | — | 验收标准结构 / 验收表 / 证据计划 / 风险档位 T0–T3 / 判定规则 / 版本冻结 / 真实启动演示 / `view_image` 不得假看 / DEBUG / gate 复核 / `acceptance-triage/v1` / 验收权与验收卡 |

- 不新增角色、`FlowStepKind`、cardKind、能力位或写权；不改变任何判定逻辑；`report_artifact_ready` 的工具实现与应用自动派发文案由运行时核心 / 编排 / 桌面角色实施。

## 3. `VERIFIER_CARD_TEXT` 具体变化

- 标准工作流第 2 步（实施前写完成标准）保留全部结构要求，尾部改为：
  - 标准写完后调用 `report_artifact_ready({ flowId, stepId, path, summary })` 向应用汇报（`stepId` 用该标准对应步骤 id，如 `acceptance-criteria`；`path` 为标准文件项目相对路径；`summary` 一句话说明标准已就绪）；
  - **等待应用 `accepted`**——由应用校验并决定是否收口；回执为拒绝 / 标准缺失时按回执修正后重新汇报；
  - **不得自行用 `flow_step_update` 改步骤状态、不得自批**；应用 `accepted` 后若流程仍未继续，如实报告 产品 / Lead 与 运营 / Steward，不伪造完成；
  - 标准冻结规则逐字保留（实施开始后不得为适配候选改动；确需变更递增版本并交沟通 / 运营确认）。
- 流程工具纪律段改为：
  - **你不自行改步骤状态、不要自己标 `done`、不自批**：不得用 `flow_step_update` 把任何步骤从 `pending` 改成 `dispatched` / `delivered` / `done`，也不得用 `failed` / `blocked` 掩盖缺口；
  - 验收标准写完后调用 `report_artifact_ready(...)` 汇报并等待回执：`accepted` 表示应用已校验并接受该产物，是否收口由应用决定；拒绝 / 缺失时按回执修正后重新汇报，不把提交当 `accepted`；
  - `done` 只能由应用收口；证据不足（`insufficient-evidence`）如实报告；应用决定后仍未继续时报告产品 / 运营，不伪造完成；
  - 保留 id `verification` / `acceptance` 的既有验收卡流程、`flow_get` 读取、禁写 `docs/flows/**`、gate 步骤例外。
- 「你的质量职责」中的实施前标准条目补一句：写完后用 `report_artifact_ready` 汇报并等待 `accepted`，不自行改步骤状态、不自批。

## 4. 测试变化

- `test/门禁引擎/governance-standard-workflow.test.ts`：
  - 流程工具纪律既有循环从「Crew / Draft / Proof」拆开：Crew / Draft 保留「只能更新自己步骤到 `delivered`、done 由 Steward / Lead 标记」断言；
  - 新增 Proof 专项断言：`report_artifact_ready({ flowId, stepId, path, summary })`、等待 `accepted`、拒绝 / 缺失修正后重报、不自行改状态、不自批、报告产品 / 运营、gate 例外；反向断言旧的「你只能把 owner=自己的步骤更新到 `delivered`」「核对完成…记录 `delivered`」「done 由 Steward / Lead…」不得残留。
- 新增 `test/门禁引擎/verifier-artifact-report.test.ts`（4 例，全部卡文本 / 注册表数据面守卫）：
  1. 工件就绪汇报：工具名与四参数、只向应用汇报、等待 `accepted`、拒绝 / 缺失重报、未继续时报告产品 / 运营、标准冻结顺序；反向禁止旧「标准落盘且结构合格后才允许实施派发」「等应用派发 / 等待应用派发」。
  2. 不自批：不自行 `flow_step_update` 改状态、不得 `failed` / `blocked` 掩盖、`done` 只由应用收口、gate 例外；反向禁止旧状态权限与自行标 done 肯定式。
  3. 既有安全检查保留：验收标准结构 / 风险档位 / 证据复用 / 升档 / 真实启动演示 / `view_image` 不得假看 / DEBUG / `insufficient evidence` / gate / 分诊 / 验收卡。
  4. 注册表数据面零变化：五角色顺序、Proof 的 entries / 预授权 / capabilities / 禁写路径均不变；不新增工具能力或写权。
- 未删除或放宽既有安全断言；新增测试只读卡文本与注册表数据，不导入运行时 / 编排实现。

## 5. 验证结果（本批写后）

- 定向：`node --test "test/门禁引擎/verifier-artifact-report.test.ts" "test/门禁引擎/governance-standard-workflow.test.ts"` ⇒ **31 计 / 31 过 / 0 失败 / 0 skip，exit 0**。
- 本角色全套：`node --test "test/门禁引擎/**/*.test.ts"` ⇒ **351 计 / 350 过 / 0 失败 / 1 Windows 既有 skip，exit 0**（写前 347 计；新增 4 例）。
- `npm run typecheck` ⇒ **exit 0，0 诊断**（最终重跑；工作树同时含其他角色未提交改动，本角色未改其文件）。写作中途该项目级检查曾因桌面注入端尚未补齐 `SessionManagerDeps.reportArtifact` 短暂报 `app/desktop/interface.ts` TS2353；该并发改动补齐后重跑通过。本角色三文件另以 `tsc --ignoreConfig ...` 限定范围检查 ⇒ **exit 0、0 诊断**。
- 未跑跨角色端到端 / 真机 Electron / 浏览器；未独立验收。

## 6. 旧文案残留核对（`VERIFIER_CARD_TEXT`）

- 以下旧绝对句在本角色卡中已不存在：`标准落盘且结构合格后才允许实施派发`、`等应用派发`、`等待应用派发`、`你只能把 owner=自己的步骤更新到 delivered`、`核对完成且账本证据齐备时，用 flow_step_update 记录 delivered`、`done 由 Steward / Lead 核对账本证据后标记`。
- 仍保留且**不属于旧自批 / 等待派发文案**的「等待 / 派发」语义：
  - 「标准复核不依赖客户催办：所有变更（含非发布）流程齐备后应用按验收门派发验收」——最终验收的既有应用自动门，保留；
  - 「收到应用派发的 gate 任务」——gate 复核入口，保留；
  - 「不接受客户手动派发作为常态」——最终验收纪律，保留。
- `report_artifact_ready` 在 Proof 卡出现 3 次（标准工作流第 2 步、流程工具纪律、质量职责）；`flow_step_update` 只出现在否定式与 gate 例外中，无肯定式自行改状态指令。

## 7. 未做 / 依赖其他角色 / 残余风险

- **本批只改角色卡文本与测试，不改工具实现**：`report_artifact_ready` 的契约与工具路由（`ReportArtifactInput` / `ReportArtifactReceipt` / `ReportArtifactFn`、工具注册与回执转达）由运行时核心实施；应用注入端（编排 / 桌面）负责路径 / 步骤 / 产物一致性校验、决定收口并写 flow。卡文本是行为约束，不是实现证据。
- **应用自动派发文案**（`app/desktop/governance-advance.ts::buildAcceptanceCriteriaTaskMessage` / `buildAcceptanceCriteriaReportReminderMessage`）已由桌面 / 编排属主在工作树内**并发更新**：提示质检写完标准后调用 `report_artifact_ready`，应用校验通过才收口 `acceptance-criteria` 步骤；该实现不在本角色边界内，本批只读核对用词、未改未验证。
- 工作树内运行时核心的未提交改动可能与后续候选变化；若 `report_artifact_ready` 的回执字段 / 语义最终变化（如 `accepted` 缺席处理、是否要求 `sha256`），须同批回改本卡文本与本批测试。
- 模型是否遵从（写完标准即汇报、等待 accepted、被拒后修正重报、不自行改状态）无机械保证；应用侧门禁 / 收口校验仍是唯一硬保证。
- 未 commit / push、未重启应用、未触碰 `demos/` 或游戏项目。
