---
id: change_lead-workflow-manager
type: change
title: Lead / 主理 设为工作流管理者（dispatch_task + flow 工具纪律）
created: "2026-10-20"
updated: "2026-10-20"
timezone: Asia/Shanghai
status: implemented
role: 门禁引擎
scope: liaison 的 dispatchTask 能力位 false→true；Liaison 卡新增工作流管理纪律；Steward/Crew/Draft/Proof 卡补 Lead 协调/回交口径；权力、Section 1、预授权、禁写与其他能力位不变
events:
  - date: "2026-10-20"
    kind: implemented
    summary: Liaison dispatchTask=true（其他能力不变）；Lead 卡新增 flow_get/flow_step_update/flow_step_supersede + dispatch_task 纪律（向 Steward/项目角色派发协调、flowId/stepId、revision/证据、派发推进≠客户批准）；Steward 卡承认 Lead 工作流管理者并接受协调任务不跳证据/门禁；Crew/Draft/Proof 可向 Lead 回交/协调且不得直接写 docs/flows
  - date: "2026-10-20"
    kind: verified
    summary: 门禁引擎套件 286 计 / 285 过 / 0 红 / 1 skip（新增 1 例）；npm run typecheck exit 0；未提交 git
---

# Lead / 主理 设为工作流管理者

## 1. 客户决定

客户拍板：把主理 Lead 设为**工作流管理者**，可和所有职能角色沟通。

本批只在**门禁引擎**边界内改能力位与卡文本；不改 `src/common/编排/**`、`src/provider/**`、
`app/**`、`test/测试/**`。

## 2. 能力位变更（`src/common/门禁引擎/governance-roles.ts`）

- `liaison` 的 `capabilities.dispatchTask` 由 `false` 改为 `true`。
- 其余能力位不变：`customerInput=true`、`handOffIntent=true`、`requestClarification=false`、
  `roleStatus/sessionTail/proposeRecovery/installSkill/installMcp=false`、`shell=operator-approve`。
- `GovernanceCapabilities.dispatchTask` 的 JSDoc 更新为：convener（trio）与 su（single 旧行为）；
  2026-10-20 客户拍板 Lead / 主理 作为工作流管理者也可派发协调任务（liaison，trio）。

## 3. 卡文本变更

### Lead / 主理（`liaison`）

- 职能与权力改为「客户沟通权 + 工作流管理」（都不是决定权）。
- 「不拥有最终批准权」段保留逐字样「客户沟通 · 不拥有最终批准权」，并新增：2026-10-20 起兼任
  工作流管理者（可推进流程/派发协调任务，仍不是决定权）；派发/推进不改变任何角色写边界，也不代表
  客户批准。
- 标准工作流第 5 步：交接后阶段流转仍由应用负责；作为工作流管理者可在流程内用
  `flow_get` / `flow_step_update` / `flow_step_supersede` 协调、用 `dispatch_task` 派发协调任务，
  但不代替应用推进阶段、不催办空转。
- 新增「## 工作流管理（Lead / 主理）」段：
  - 用 `flow_get` 读取流程摘要、步骤与可更新步骤；用 `flow_step_update` 推进、
    `flow_step_supersede` 返工（旧步骤 superseded → 新步骤 pending）。
  - 证据与 revision 由服务端校验；`expectedRevision` 来自最近一次 `flow_get`（或更新回执）的
    revision；`revision-conflict`（版本冲突）重新 `flow_get` 再改、不盲目重试；
    `insufficient-evidence` 时如实报告、不标 done。
  - 用 `dispatch_task` 向 Steward / 统筹与项目角色派发协调任务；目标/任务必须自足并带 `flowId`
    （向 Steward 派协调任务可省 `stepId`）。
  - 派发/推进 ≠ 客户批准；客户决定仍走判断 agent / 客户卡（`request_choice` /
    `request_confirmation`）；不得伪造 `done` 证据、不得把步骤推进当客户已同意。
  - 仍**不得直接写 `docs/flows/**`**、不得写角色卡/提案/契约/验收；`dispatch_task` 不改变任何
    角色写边界，收到任务的角色仍按其 Section 1 与确认门工作。

### Steward / 统筹（`convener`）

- 新增段：Lead / 主理 也是工作流管理者，可用 flow 工具更新流程、用 `dispatch_task` 派发协调任务；
  Steward 收到 Lead 的协调任务时按任务文本执行，**不因来源是 Lead 就跳过证据/门禁**；Steward 仍是
  流程/排程执行者，派发/推进 ≠ 客户批准。
- 派发目标段补充：**Steward 自己的**派发目标仍只能是项目角色；除 Lead / 主理 作为工作流管理者
  向 Steward 派发协调任务外，治理角色之间不 dispatch。

### Crew / 组队、Draft / 提案、Proof / 验收

- 三张卡的流程工具纪律段补：**可向 Lead / 主理 回交/协调**；仍**不得直接写 `docs/flows/**`**；
  步骤更新仍按 flow 工具（`flow_step_update`）与账本证据——项目角色/步骤 owner 只能更新 owner=自己的
  步骤到 `delivered`（或 `failed` / `blocked`），**不要自己标 `done`**；`done` 由 Steward / Lead 核对
  账本证据后标记，证据不足不标 done。

### 保留

五卡权力/职责/Section 1/预授权/禁写/能力位（除 Liaison dispatchTask）、shell 审批档、工程质量基线、
治理卡参数、判断代批/deny 纪律、flow YAML schema 与既有 flow 工具纪律逐字保留。

## 4. 测试（真实输出）

- `node --test "test/门禁引擎/**/*.test.ts"`
  - **286 tests / 285 pass / 0 fail / 1 skipped**（基线 280/279/0/1；本批新增 1 例）。
  - 更新：`governance-trio.test.ts` 能力矩阵——Liaison `dispatchTask=true`，其余能力位不变；
    `liaison-role.test.ts` 能力快照同步。
  - 新增：`标准工作流：Lead 工作流管理者——flow_get/flow_step_update/flow_step_supersede + dispatch_task；Steward 接受 Lead 协调任务；Crew/Draft/Proof 向 Lead 回交`
    - Lead：三工具 + dispatch_task、向 Steward/项目角色派发、flowId/stepId、revision/证据、
      派发/推进 ≠ 客户批准、不得伪造 done、不得直接写 docs/flows。
    - 能力位：dispatchTask=true，handOffIntent=true，roleStatus/installSkill 仍 false。
    - Steward：承认 Lead 工作流管理者、不因来源是 Lead 跳证据/门禁、仍是流程/排程执行者。
    - Crew/Draft/Proof：可向 Lead 回交/协调、不得直接写 docs/flows、flow_step_update、证据不足。
  - 既有断言未放宽、未删除。
- `npm run typecheck` ⇒ **exit 0**。

## 5. 跨角色依赖（本角色边界外，未改）

1. **编排/桌面工具注入**：Liaison 的 `dispatchTask=true` 需要消费方按能力矩阵注入 `dispatch_task`；
   目前 `test/桌面应用/session.test.ts:992` 仍断言 `liaison.dispatchTask === undefined`，属预期红，
   须由桌面角色更新。
2. **派发目标校验**：需允许 Lead → Steward 的工作流协调任务；Steward 自己的派发目标仍只能是项目
   角色；其他治理角色之间的 dispatch 仍拒绝。该逻辑在编排/桌面，卡文本只声明口径。
3. **flow 工具注入**：Lead 使用 `flow_get` / `flow_step_update` / `flow_step_supersede` 的能力需由
   编排/运行时核心注入，并与 Steward 同权限、同样服务端校验证据与 revision；
   `GovernanceCapabilities` 目前只有 `dispatchTask`，未新增 flow 工具能力位。
4. **桌面测试文案**：`test/桌面应用/dispatch-delivery.test.ts` 中「convener：派发（唯一）」的注释/
   用例名已过时（若该用例未打开 Liaison 则不一定转红），建议其属主同步。
5. Lead 的 Section 1/禁写未变：仍只写 `docs/intents/`，`docs/flows/**` 仍禁写；流程推进只能经工具。

## 6. 残余风险

- `dispatchTask=true` 可能被消费方误用于其他治理角色目标；目标校验仍须在编排/桌面机械执行。
- Lead 同时拥有客户沟通与工作流管理，模型可能越权把派发/推进当客户批准；卡文本已明禁，无机械检查。
- flow 工具与 revision/证据校验依赖运行时实现；卡文本不实现工具。
- 真机端到端与独立复验未进行；未提交 git。

## 7. 边界与约束

仅改 `src/common/门禁引擎/governance-roles.ts`、`test/门禁引擎/governance-standard-workflow.test.ts`、
`test/门禁引擎/governance-trio.test.ts`、`test/门禁引擎/liaison-role.test.ts`、本文件、
`changelog.md`、`memo.md`。未碰 `src/common/编排/**`、`src/provider/**`、`app/**`、`test/测试/**`、
`src/service/**`、其他角色文件/测试、真实项目；不读 `.env`、不跑真实模型/凭据/网络；未 commit。
