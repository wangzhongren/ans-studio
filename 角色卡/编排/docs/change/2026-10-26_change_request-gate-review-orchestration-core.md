---
id: request-gate-review-orchestration-core
type: change
title: gate 复核（request_gate_review）编排/Flow 核心：gateKind、completeGateStep、gate.review 账本
created: "2026-10-26"
updated: "2026-10-26"
timezone: Asia/Shanghai
status: implemented-unverified
related: [proof-gate-reviews, acceptance-triage]
events:
  - date: "2026-10-26"
    kind: implemented
    summary: 编排/Flow 侧核心落地并经定向测试与 typecheck；桌面接线、跨角色 e2e、独立验收未做
---

# 变更记录：gate 复核（`request_gate_review`）编排/Flow 核心

- 角色：编排
- 日期：2026-10-26
- 状态：**implemented-unverified**（编排面实现与定向测试已跑；桌面注入/派发/记录、跨角色 e2e、独立验收未做，不代表通过）
- 来源：客户 2026-10-26 追加授权 `request_gate_review` 与设计
  `角色卡/项目管理/docs/design/2026-10-26_design_proof-gate-reviews.md` §4/§8/§9/§10/§12（方案 C：
  `kind: artifact` + 可选 `gateKind`，不新增 `FlowStepKind`）。客户追加要求：gate 是**独立于最终验收**的通道；
  **防吹毛求疵**——gate `fail` 必须至少一个 blocker/major，只有 minor/nit 的 fail 按结构不符退回 Proof、
  不得触发返工；`pass` 可带 minor/nit 备注。
- 写集（实际只改以下文件）：
  - `src/common/编排/flow-state.ts`
  - `src/common/编排/flow-service.ts`
  - `src/common/编排/governance-gate.ts`（gate 报告路径/版本扫描；既有 criteria 扫描改为共用私有 helper，行为不变）
  - `src/common/编排/governance-ledger.ts`
  - `src/pipeline/orchestration/flow-state.ts`（公共出口薄再导出）
  - `src/pipeline/orchestration/run-role.ts`（仅 convener 注入 `requestGateReview`）
  - `test/编排/flow-gate.test.ts`（**新增**）、`test/编排/request-gate-review.test.ts`（**新增**）、
    `test/编排/governance-gate.test.ts`（追加 1 例 gate 依赖硬拦；既有用例未删改）
  - 本记录、`changelog.md`、`feature-map.md`、`api-spec.md`
- **未改** `src/model/runtime.ts`、`src/provider/runtime/**`、`app/desktop/**`、`src/common/门禁引擎/**`、
  共享 i18n、其他角色资料；未 commit/push、未重启应用、未碰 `demos/`。

## 一、Flow 契约（`flow-state.ts`）

- 新增 `FLOW_GATE_KINDS = ["vertical-slice", "visual-baseline", "integration-performance"]`、
  `FlowGateKind`、`FLOW_GATE_STEP_ID_PATTERN = ^gate-[a-z0-9]+(?:-[a-z0-9]+)*$`、
  `isFlowGateKind` / `isFlowGateStepId`。
- `FlowStateStep.gateKind?: FlowGateKind`（仅新增可选字段；**不是**新的 `FlowStepKind`）。解析/静态校验
  只对声明了 `gateKind` 的步骤生效：
  1. 只允许 `kind: artifact`；
  2. id 必须匹配 `gate-<slug>`（允许 `gate-visual-level-01` 多实例）；
  3. `owner` 必须是 `verifier`；
  4. `evidence` 必须存在且 `kind: artifact`（报告路径约定
     `docs/acceptance/<flowId>-<stepId>-report-vN.md`）；
  5. 未知 `gateKind` 值 / 未知字段仍 fail-closed。
- 序列化（`flow-service.ts::serializeFlow`）与 `flow_get` 视图仅在字段存在时携带 `gateKind`；
  **旧 flow（不含 `gateKind`）解析、序列化、ready、收尾门、证据对账逐字不变**。
- `listReadyFlowSteps` 新增 skip 原因 `awaiting-gate`：gate 步骤永不进入 ready（只能由应用收口）。

## 二、gate 报告路径/版本（`governance-gate.ts`）

- `gateReviewReportRelPath(flowId, gateId, version=1)` → `docs/acceptance/<flowId>-<gateId>-report-vN.md`。
- `latestGateReviewReport(projectRoot, flowId, gateId)` / `latestGateReviewReportRelPath(...)`：扫描
  `docs/acceptance/` 取最高 N；只认正整数版本与 `.md`；无匹配/目录不可读 ⇒ `undefined`（不回退旧版本）。
- `gateId` 段位于 `<flowId>-` 与 `-report-v` 之间 ⇒ 既有最终验收报告扫描 `${flowId}-report-v` 不匹配
  gate 报告，验收分诊/最终验收不会被 gate 报告污染。旧报告不覆盖（重验递增 N）。

## 三、应用专用 `completeGateStep`（`flow-service.ts`，公共出口再导出）

`completeGateStep({ projectRoot, flowId, gateId }): Promise<CompleteGateStepResult>`（与
`completeAcceptanceCriteriaStep` 同构，**不注册为角色工具**）：

- 目标步骤必须存在且含 `gateKind`、`kind: artifact`；已 done ⇒ 幂等 `already-done`（不读报告/不写盘）；
  仅 `pending`/`dispatched`/`delivered` 可收口，`failed`/`blocked`/`aborted`/`superseded` ⇒
  `gate-step-terminal`（不覆盖）。
- 报告：取最新 `<flowId>-<gateId>-report-vN.md`；缺失/不可读 ⇒ `gate-report-missing`；不可安全观察 ⇒
  `gate-report-unobservable`；复用 `acceptance-triage/v1` 解析，缺段/段坏/矛盾 ⇒ `gate-report-invalid`
  （退回 Proof，不标 done、不返工）。
- **防吹毛求疵**：`classifyGateReviewTriage` 机械判定——`fail`/`conditional` 含至少一个 blocker/major ⇒
  `gate-report-failed`（不标 done，等待返工后重新复核）；**只有 minor/nit ⇒ `gate-report-nonblocking-fail`**
  （按结构不符退回 Proof，不触发返工）；`pass` 可带 minor/nit 备注并收口。
- pass 收口：按既有 artifact 观测规则补 `artifact.observed{actorRoleId:"app",power:"app",...}`（同 path+sha
  幂等），再把 gate 步骤置 `done` + `evidence{kind:"artifact",ref:<最新报告>}`；候选 YAML 复核 +
  `validateFlowEvidence`（只过滤目标 stepId）沿用 flow-service 原语；事件 `flow.gate.completed`。
  结果额外返回 `reportPath`/`reportVersion`/`reportSha256`/`gateKind`/`severityCounts`/`itemCount`，
  供应用侧写 `gate.review` 审计（本函数不写 `customer.decision`、不写 `gate.review`、不伪造通过）。

## 四、角色工具面与边界（`flow-service.ts` / `run-role.ts`）

- `flow_step_update(status:"done")` 对含 `gateKind` 的步骤一律拒绝，新 code **`gate-review-required`**
  （manager/owner 均不能代标；检查先于 revision 冲突，返回确定原因）。
- `observeFlowArtifacts` **跳过含 `gateKind` 的步骤**：gate 报告文件存在不等于通过；失败/坏结构报告不得被
  自动观测成 done 证据。
- `flow_step_supersede` 换新 gate id（`gate-<slug>` + `kind: artifact`）时**继承旧 gateKind**并按约定派生
  新 gate 的 v1 报告 evidence 路径（工具载荷无 `gateKind`/`evidence` 字段）；非 gate 形态新 id 不继承。
- `run-role.ts`：`AdapterCapabilities` / `openRoleSession` 新增 `requestGateReview?: RequestGateReviewFn`
  （类型单一来源 `src/model/runtime.ts`）；**只对内置治理角色中的统筹/Steward（trio convener）注入**，
  其他内置角色/项目角色即便误给也不注入（工具结构性不注册）；`createRuntimeAdapterFactory` 同名透传。

## 五、账本 `gate.review`（`governance-ledger.ts`）

- 新增 `kind:"gate.review"` + 可选 `gateReview`（`gate-review-decision/v1`）：`gateId`/`gateKind`/
  `reportPath`/`reportVersion`/`reportSha256`/`conclusion`/`severityCounts`/`itemCount`/`requestId`/
  `flowRevision`/`decidedAt`。
- 写入校验：只允许应用记录（`actorRoleId`/`power` 均 `app`）；枚举/版本/sha/时间形状严格；**不得携带**
  `decisionKind`/`customerDecision`/`acceptanceTriage`；**fail/conditional 必须至少一个 blocker/major**
  （只有 minor/nit 的 fail 连审计条目也拒绝），**pass 不得带 blocker/major**（通过只允许 minor/nit 备注）。
- `latestAcceptanceDecision`、`evaluateFlowCompletion`、分诊/最终验收**不读** `gate.review`；gate 完成事实
  仍以 flow 步骤 `done` + `artifact.observed` 为准。

## 六、下游硬拦与最终验收不变

- gate 未 done ⇒ `evaluateDispatchGate` 对依赖它的下游返回 `dependencies-not-done`（应用硬拦；
  `test/编排/governance-gate.test.ts` 追加回归）；`listReadyFlowSteps` 返回 `dependency-not-done`；
  `evaluateFlowCompletion` 不 ready ⇒ `request_acceptance` 仍以既有 `flow-incomplete` 拒绝。
- gate done 后最终验收仍走既有 criteria → 变更包/riskTier → Proof 验收报告 + 验收卡 → 分诊 → 客户决定；
  本次未改验收报告版本扫描、分诊触发条件与收口语义。

## 七、验证（2026-10-26，win32 / Node v24.22.1）

- `npm run typecheck` → exit 0。
- `node --test "test/编排/**/*.test.ts"` → **985 tests / 983 pass / 1 fail / 1 skip**；唯一红＝既有 Windows
  symlink `shell-authorized-routine.test.ts:103` 创建链接 `EPERM`（基线一致，本批未触碰）。
- 定向：`test/编排/flow-gate.test.ts` 13/13；`test/编排/request-gate-review.test.ts` 2/2；
  `test/编排/governance-gate.test.ts` 28/28（含新增 gate 依赖硬拦 1 例）。既有断言未弱化/删除。
- 未做：桌面窗口 `requestGateReviewForProject`（§5.3 校验/派发）、gate 记录/返工路由/重启恢复/系统行、
  跨角色 e2e、真实 Electron/浏览器 gate 复核、独立验收、commit/push。
