# 2026-10-20 变更：Lead（Liaison）设为工作流管理者

- 日期：2026-10-20
- 角色：编排
- 客户决定：「按这个做吧」——把主理 Lead 设为工作流管理者，可和所有职能角色沟通。
- 范围：`src/common/编排/governance-gate.ts`、`src/pipeline/orchestration/run-role.ts`、`src/common/编排/flow-service.ts`、`test/编排/**`、本角色文档；未改 `app/**`、`src/provider/**`、门禁卡；未 git 提交。

## 1. `governance-gate.ts`：新增 `coordinate` 门

- `GovernanceGateAction` 增加 `"coordinate"`。
- 新增 `evaluateCoordinateGate(input)`：
  - 仅 `roleId === "liaison"`（Lead）可发起；
  - 目标必须 `targetRoleId === "convener"`（Steward）；
  - `flowId` 必填且 slug；`stepId` 可选，给出时必须是 slug；
  - **不要求**提案接受/任命名单/流程步骤存在/未派发去重（这是协调消息，不是项目步骤派发）；
  - 其他来源/目标 ⇒ `forbidden`；缺 flowId ⇒ `missing-flow-id`。
- `evaluateGovernanceGate` 对 `coordinate` 跳过通用 `wrong-role` 前置（由本门返回 `forbidden`），其余动作逐字不变；账本 `errors` 非空仍全局 fail-closed。
- `dispatch` 门（Convener→项目角色）保持原五条判定，**零放宽**。

## 2. `run-role.ts`：dispatch 包装器分流

- 新增并导出纯函数 `governanceDispatchActionFor(roleId, targetRoleId)`：`liaison → convener` ⇒ `coordinate`，其余 ⇒ `dispatch`。
- `dispatchTask` 包装器用它选择门禁动作；coordinate 拒绝文案为「协调消息被治理门禁拒绝：…」，dispatch 保持「派发被治理门禁拒绝：…」。
- 能力注入不变：仍由 `capabilities.dispatchTask` 决定（门禁引擎已给 Liaison 打开 `dispatchTask:true`）；`flowGet` 所有角色、`flowStepUpdate`/`flowStepSupersede` 内置角色的注入不变。
- Liaison→项目角色仍走 `dispatch` 门（空账本 ⇒ `proposal-not-accepted`），不会被 coordinate 放宽。

## 3. `flow-service.ts`：管理者判定扩为 Steward/Lead

- 新增 `isManagerPower(power)`：`schedule`（Steward/Convener）或 `liaison`（Lead）。
- `canUpdate`：Lead 与 Steward 一样 = 全部未终态步骤。
- `update`/`supersede`：Lead 与 Steward 一样可操作全部步骤（含他人 owner）；状态迁移表中 `pending→dispatched`、`delivered→done`、`failed|blocked|aborted→dispatched`、supersede 仅管理者。
- 证据（`done` + `validateFlowEvidence`）、revision 冲突（`revision-conflict`）、per-project 串行队列、原子写等**完全不变**；错误文案同步「Steward/Lead」。

## 4. 测试与验证（真实输出）

- `test/编排/governance-gate.test.ts`：新增 coordinate 用例——Liaison→Convener 空账本且无流程文件仍 allowed；`stepId` 可选；缺 flowId `missing-flow-id`；非法 stepId `missing-step-id`；Convener/项目角色来源 `forbidden`；目标项目角色 `forbidden`；账本坏行仍 `ledger-corrupt`；既有 dispatch 空账本仍 `proposal-not-accepted`（零放宽）。
- `test/编排/governance-judge.test.ts`：新增 `governanceDispatchActionFor` 四组合；端到端 Liaison 会话——Liaison→Convener coordinate 放行到前端路由，Liaison→项目角色仍 dispatch 被拒（空账本）。
- `test/编排/flow-service.test.ts`：新增 Lead manager 用例——`canUpdate` 全部未终态、可更新他人 owner 步骤、可 supersede；`done` 证据不足仍 `insufficient-evidence`（未因管理者放宽）。
- `test/编排/liaison-session.test.ts`：能力矩阵更新——Liaison 现在注入 `dispatchTask`（coordinate）与 `flowGet`。
- `node --test "test/编排/**/*.test.ts"` → **695 tests / 695 pass / 0 fail / 0 skipped**
- `npm run typecheck` → **exit 0**（全仓）

## 5. 跨角色 / 残余

1. **门禁引擎**：已观察到 Liaison `capabilities.dispatchTask: true`（本批未改）；Lead 角色卡/提示应写清「可给 Steward 发协调消息，但不是项目步骤派发」。
2. **桌面窗口**：`dispatch_task` 的 Liaison→Convener 路由应按「协调消息」处理（开/排队/系统行）；服务端 coordinate 门已放行，不再要求提案/任命。
3. **范围**：coordinate 目前仅 Liaison→Convener；Lead→项目角色仍走 dispatch 门（需要提案接受/任命/流程步骤/去重），本批未放宽。
4. **direct flow write**：`docs/flows/<flowId>.yaml` 的直接写路径仍在（沿前一版登记），「应用唯一写者」硬门禁待后续批次。
5. Lead 的 update/supersede 仍受证据/revision/串行/原子写约束；`idempotencyKey` 仍只按 status/evidence 幂等（无跨进程 LRU）。
