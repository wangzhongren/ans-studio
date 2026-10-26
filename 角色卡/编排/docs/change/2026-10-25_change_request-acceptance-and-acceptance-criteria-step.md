---
id: request-acceptance-and-acceptance-criteria-step
type: change
title: 独立复核能力透传与验收标准步骤收口助手
created: "2026-10-25"
updated: "2026-10-25"
timezone: Asia/Shanghai
status: implemented-unverified
related: []
events:
  - date: "2026-10-25"
    kind: implemented
    summary: 编排 A/B 面实现并跑通定向测试与 typecheck；桌面接线与独立验收未做
---

# 变更记录：独立复核能力透传与验收标准步骤收口助手

- 角色：编排
- 日期：2026-10-25
- 状态：**implemented-unverified**（编排面实现与定向测试已跑；桌面接线、跨角色 e2e、独立验收未做，不代表通过）
- 来源：本轮编排任务（运行时核心已新增 `request_acceptance` 工具与冻结类型；桌面需要编排层提供能力透传与 `acceptance-criteria` 步骤的公共收口出口）。未提供独立 taskId，未知项不补造。
- 写集（实际只改以下文件）：
  - `src/pipeline/orchestration/run-role.ts`（能力位、会话透传、adapter 工厂透传）
  - `src/common/编排/flow-service.ts`（新增 `completeAcceptanceCriteriaStep`）
  - `src/common/编排/governance-gate.ts`（仅把既有 `latestAcceptanceCriteriaRelPath` 改为导出，供同角色私有模块复用）
  - `src/pipeline/orchestration/flow-state.ts`（薄再导出）
  - `test/编排/request-acceptance.test.ts`（**新增** 2 例）
  - `test/编排/flow-service.test.ts`（追加 7 例；既有用例未删改）
  - 本记录
- **未改** `app/**`、`src/model/**`、`src/provider/**`、`src/common/门禁引擎/**`、其他角色资料；未 commit/push/合并/发布。

## 一、任务 A：`request_acceptance` 能力透传（编排）

运行时核心只声明能力位并负责工具参数校验/如实转达回执；派发、验收标准/变更包/风险档/流程完整性校验与 flow/账本写入由应用注入的能力实现。编排只做透传：

- `AdapterCapabilities` 新增 `requestAcceptance?: RequestAcceptanceFn`（类型单一来源 `src/model/runtime.ts`）。
- `openRoleSession` 输入新增同名可选能力；**只在内置治理角色会话**并入 capabilities（`builtInGovernance` 判定，项目角色即便误给也不注入）。未提供 ⇒ 能力缺席。
- `createRuntimeAdapterFactory` 把 `capabilities.requestAcceptance` 并入运行时选项（与 `flowGet`/`flowStepUpdate` 同形）；运行时核心据此在 `request_acceptance` 能力存在时注册工具，缺席时不注册（结构性 fail-closed）。
- **请求复核 ≠ 客户批准**：编排不写客户决定、不解释回执。

## 二、任务 B：`completeAcceptanceCriteriaStep`（应用专用）

`acceptance-criteria` 是应用自身执行的步骤；此前没有公共出口把它标 `done`，`evaluateFlowCompletion` 因它 pending 判「流程未完成」，验收无法派发。新增：

```ts
// src/pipeline/orchestration/flow-state.ts（公共出口，桌面只经此 import）
completeAcceptanceCriteriaStep(input: { projectRoot: string; flowId: string }):
  Promise<CompleteAcceptanceCriteriaStepResult>;

// CompleteAcceptanceCriteriaStepResult extends FlowToolResult
{
  evidence?: { kind: "artifact"; ref: string }; // 本次写入 flow 的证据
  criteriaPath?: string;                        // 最新标准项目相对路径
  alreadyDone?: boolean;                        // 已是 done（幂等命中）
}
```

语义：

- 只处理精确 id `acceptance-criteria`；缺该步骤 ⇒ `acceptance-criteria-step-missing`；kind 非 `artifact` ⇒ `acceptance-criteria-kind-unsupported`。
- 已 `done` ⇒ `{ok:true,idempotent:true,alreadyDone:true,code:"already-done"}`，不读标准、不写账本/flow。
- 只从 `pending`/`dispatched` 收口到 `done`；其它状态 ⇒ `acceptance-criteria-step-terminal`（不覆盖）。
- 标准存在性：复用既有版本扫描（`docs/acceptance/<flowId>-criteria-vN.md` 取最高 N，不回退旧版本）；不存在/不可读 ⇒ `acceptance-criteria-missing`；存在但超大/二进制/路径非法 ⇒ `acceptance-criteria-unobservable`（不猜、不伪造）。
- 按现有 artifact 观测规则补 `artifact.observed{actorRoleId:"app", power:"app", artifactPath, artifactSha256, flowId}`；同 path+sha（flowId 缺省或相等）不重复追加；**不写 `customer.decision`**。
- 候选 YAML 复核与 `validateFlowEvidence` 账本对账沿用 flow-service 同一套内部原语（只过滤目标步骤 issue）；对账失败 ⇒ `insufficient-evidence`；账本不可读/坏行 ⇒ `ledger-unavailable`；追加失败 ⇒ `ledger-write-failed`；flow 写失败 ⇒ `write-failed`。
- 只改目标步骤 `status`/`evidence`，不改其它步骤、owner、kind、flow schema；不新增 `FlowStepKind`、不改步骤权限规则；不注册为角色工具。
- 与 `createFlowService`/`completeRoleCardsStep` 共用 per-project 串行队列与原子写；事件 `flow.acceptance-criteria.completed`，view actor `app/app`。

## 三、验证与证据

- `npm run typecheck` → exit 0（2026-10-25，Node v24.22.1，win32）。
- `node --test "test/编排/flow-service.test.ts"` → 84 tests / 83 pass / 0 fail / 1 skip（既有 Windows 符号链接无权限 skip）。
- `node --test "test/编排/request-acceptance.test.ts"` → 2/2 pass。
- `node --test "test/编排/**/*.test.ts"` → **908 tests / 906 pass / 1 fail / 1 skip**；唯一红＝既有 Windows symlink 基线 `shell-authorized-routine.test.ts` 创建符号链接 `EPERM`（本批未触碰该测试；同文件基线一致）。
- 覆盖：能力提供 ⇒ 注册并经 provider 工具 real handler 路由载荷/转达回执；未提供/项目角色 ⇒ 能力缺席且工具不注册；标准存在 ⇒ done + app/app 观测；已 done 幂等；标准缺失失败；非 acceptance-criteria flow/kind 失败；delivered 拒绝；同 path+sha 不重复观测；不注册为角色工具且公共出口再导出。

## 四、桌面接线要点（归桌面窗口角色）

- 会话：给 `openRoleSession` 传 `requestAcceptance`（仅统筹/Steward 等内置治理角色会话；编排会再按内置治理角色收口）。回执按 `RequestAcceptanceResult.code` 如实呈现；`dispatched` 不等于客户批准。
- 收口：应用写出（或确认已有）最新标准后，从 `src/pipeline/orchestration/flow-state.ts` import `completeAcceptanceCriteriaStep`，调用 `{projectRoot, flowId}`：
  - `ok:true` 且非 `alreadyDone`：flow 已可继续走 `evaluateFlowCompletion` / 验收派发；
  - `ok:true, alreadyDone:true`：安全继续，不必重复写盘；
  - `acceptance-criteria-missing`：先派 verifier 写标准，不猜；`insufficient-evidence`/`ledger-*`/`write-failed`：如实提示并稍后重试。
- 本角色未改 `app/desktop/interface.ts`；桌面消费与 UI 状态机由桌面窗口角色实施。

## 五、未做

- 桌面 IPC/UI 接线、跨角色 e2e、真实 Electron、独立验收、T3 全量回归；未提交/暂存/推送。
