---
id: governance-judge-p1-runtime-core
type: change
title: 治理卡判断 P1——中立契约、只读工具与互斥装配
created: "2026-10-18"
updated: "2026-10-18"
timezone: Asia/Shanghai
status: implemented-pending-verification
related: [judge-governance-cards-review, shell-auto-approve-review]
---

# 治理卡判断 P1：运行时核心契约层

依据 PM 评审《[「替我审批」/「替我决策」双开关——项目管理评审与 V1 拆发](../../../项目管理/docs/design/2026-10-18_design_judge-governance-cards-review.md)》§三/§五/§六（P1 波次），本角色只改 Section 1 白名单内文件。

## 改了什么

1. `src/model/runtime.ts`
   - `GovernanceJudgeGroup = "approval"|"decision"`；`GOVERNANCE_CARD_GROUP`（冻结）与 `governanceCardGroup(kind)`——**cardKind→group 的唯一映射**；`undefined`/未知 ⇒ `undefined`（永不判断）。
   - `GovernanceJudgeRequest`/`GovernanceJudgePathDecision`/`GovernanceJudgeAudit`/`GovernanceJudgeOutcome`/`GovernanceJudgeFn`/`GovernanceJudgeToolOptions`/`GovernanceJudgeContext`/`GovernanceJudgeFacts`，字段名逐字按评审 §6.1/§5.2/§5.3。
   - 可选扩展：`CustomerInputOutcome.answered.judge?`、`CustomerInputMetadata.judgeContext?`、`ShellJudgeReadStats.readPaths?`、`ShellJudgeAudit.group?: "approval"`、`GovernedToolsOptions.governanceJudge?`；`RuntimeProviderOptions.judgeMode` 复用。
2. `src/common/runtime-core/governance-judge/tools.ts`（新建）
   - `buildGovernanceJudgeTools` 恰三只：`judge_read_file`/`judge_list_dir`/`report_governance_judgement`；结构性不接写/shell/交互/派发能力。
   - `GOVERNANCE_JUDGE_REPORT_TOOL`、`GOVERNANCE_JUDGE_TOOL_NAMES`、`ALL_JUDGE_TOOL_NAMES`（与 shell judge 的并集恰四只；只用于适配器 allowlist，不用于装配）。
3. `src/common/runtime-core/shell-judge/policy.ts` 收紧
   - 任何 `.ans` 段 ⇒ 整棵 `.ans/**` 硬排除；新增 `JudgePathClass:"app-private"` 与独立 `JudgeReadCode:"app-private"`（人话「应用私有数据（账本/会话）」）。
   - 成功读取记录 `stats.readPaths`（去重、≤16）；被拒/预算/二进制不记录。
   - `shell-judge/tools.ts` 导出 `judgeToolFailure`/`judgeToolAborted`，治理工具复用同一文案。
4. `src/provider/runtime/schema.ts`：`report_governance_judgement` 的 schema/描述/guidelines（`verdict` 仅 `approve|manual`；只做正向代批；approve 必须有理由、证据与实际读取）。
5. `src/service/runtime/session.ts`：`shellJudge` 与 `governanceJudge` **恰一**（双给抛错）；`governanceJudge` 走治理工具集，`judgeMode:true`、`installedMcpServers:[]`。

## 边界与未落项（如实）

- `AdapterCapabilities` 在编排 `src/pipeline/orchestration/run-role.ts`，属编排 P2；本角色未改。
- `src/provider/pi/tools.ts` 薄转出（P3b）、三适配器 allowlist 改读 `ALL_JUDGE_TOOL_NAMES`（P3a/P3c）、`common/编排/governance-judge*` 驱动与 `run-role.ts` judgeContext/证据（P2）、桌面 `customer-input.ts` 状态机与 UI（P4/P5）均未接线；未接线前判断路径不进入。
- `test/测试/shell-judge-verify/f-readonly-sandbox.test.ts` 仍钉旧口径（`.ans` 可列、拒绝文案含「敏感」），本角色不越界修改；按评审 §6.3 需测试角色属主同步为「`.ans` 整体拒绝」。本批全量中的该 1 红为**预期红**。

## 验证（本机 Windows / Node v24.14.0）

- `node --test "test/runtime-core/**/*.test.ts"`：**184 计 / 181 过 / 3 红**；3 红均为既有 Windows `symlink EPERM`（session-store ×2、tools ×1），无新增红。
- 新增 `test/runtime-core/governance-judge.test.ts` 9 例全绿；`shell-judge.test.ts` 更新口径后全绿。
- `npx tsc --noEmit`：**0 错**。
- 全量三层 glob `node --test "test/**/*.test.ts"`：**2790 计 / 2770 过 / 17 红 / 3 跳过**。17 红归属：9 条 Windows symlink EPERM 环境红、6 条桌面 renderer/runtime-ui/vendor 哈希既有钉、1 条 runtime-core shell abort 并发时序（单独复跑通过）、1 条上述预期红。无本批其他新增红。
- 未跑真实模型/凭据/网络；未读 `.env`；未 git 提交。
