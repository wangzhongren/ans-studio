---
id: acceptance-close-on-accepted
type: change
title: 验收通过（accepted）即调 completeAcceptanceStep 收口——flow 验收步骤标 done、绝不再派 verifier
created: "2026-10-20"
status: implemented
---

# 验收通过即收口（不再多派 verifier）

## 真机问题

verifier 第二轮复核完成、验收卡被判断 agent 代批 accept（账本 04:56:18
`customer.decision{decisionKind:"acceptance",customerDecision:"accepted",flowId:"bookmark-manager"}`），
但 flow YAML 的 `verification` 仍 pending。`evaluateFlowCompletion` 已判定「已有验收决定，流程已收口」，
应用却在 04:56:55 又多派了一次 verifier——账本去重/运行期去重没有把「已 accepted」变成**流程收口**。

编排新增 `completeAcceptanceStep({projectRoot, flowId})`（经 `src/pipeline/orchestration/flow-state.ts`
公共出口）：accepted ⇒ 保留验收步骤标 `done` + `evidence:{kind:"acceptance",ref:"acceptance"}`；幂等、
原子写、未 accepted 拒绝。桌面只消费它。

## 改动（`app/desktop/interface.ts`）

- `dispatchAcceptanceForFlow` **先读账本、再走运行期 mtime 去重**——收口不能被「同版本已派」提前 return 挡住
  （verifier settle / 导入 / ledger 触发的 acceptance check 都走同一入口）。
- 账本（无坏行）里存在该 flow 最近一条 `customer.decision{decisionKind:"acceptance",customerDecision:"accepted"}`
  ⇒ 调 `closeAcceptedFlow`：
  - 先读 flow YAML：验收步骤（`kind:"acceptance"`）已 `done` ⇒ **不重复调用**收口（幂等）；
  - 未 done ⇒ 调 `completeAcceptanceStep`（缺省经 Pipeline 公共出口真实实现；`DesktopDeps.completeAcceptanceStepFn`
    可注入测试桩）；成功 ⇒ 诊断 `acceptance.close.completed`；失败 ⇒ 诊断 `acceptance.close.failed` +
    Lead 一条去重系统行「验收已通过但流程收口失败…未派 verifier，流程保持待收口」（同原因不刷屏、不循环）；
  - 成功后 Lead 一条去重系统行「验收已通过（判断代批或客户手批，以账本 customer.decision 为准），
    流程 X 已收口（保留验收步骤已标 done）」；**不写客户决定账本、不伪造批准**；
  - **无论收口成败，直接 return，不再派 verifier**（验收已由客户/判断决定）。
- rejected / 无验收决定 ⇒ 不调收口，走既有流程（rejected 由 `evaluateFlowCompletion` 的「已有验收决定」
  终态原因挡住、不派 verifier；无决定且门通过 ⇒ 正常派一次）。
- `acceptanceDispatchedFlows`（flow mtime）与账本 verifier 去重保持；新建收口提示去重
  `acceptanceClosedNotified` / `acceptanceCloseFailureNotified`（`projectRoot\0flowId`）。
- `DesktopDeps.completeAcceptanceStepFn?` 供测试注入；缺省 `import { completeAcceptanceStep } from
  "../../src/pipeline/orchestration/flow-state.ts"`（静态导入，类型与编排契约对齐）。

## 测试与证据（真实输出）

- `test/桌面应用/acceptance-dispatch.test.ts` 新增 5 例：
  1. accepted + verification pending ⇒ 恰调一次 `completeAcceptanceStep`、步骤 done（含 acceptance 证据）、
     **不派 verifier**、Lead 恰一条收口系统行、不写客户决定账本；再次触发检查（已 done）不重复调用/不刷屏；
  2. accepted + verification 已 done ⇒ 不收口调用、不派 verifier、Lead 一条（幂等）；
  3. rejected ⇒ 不收口、不派 verifier、无「已收口」冒充行；无验收决定 + 门通过 ⇒ 照常派 verifier（收口不介入）；
  4. 收口失败 ⇒ 只诊断 + Lead 一条含具体原因的系统行、不循环、不派 verifier；
  5. **真实编排出口**（不注入）：accepted + pending ⇒ `completeAcceptanceStep` 真写 done + acceptance 证据、
     不派 verifier。
- `node --test "test/桌面应用/acceptance-dispatch.test.ts"` ⇒ **27/27 过**。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **670 计 / 670 过 / 0 红**。
- `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` ⇒ **44/44 过**。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险

- 以「最近一条 accepted」为收口依据（先 reject 后 accept 也能正确收口）；rejected 流程由既有终态原因挡住，
  不再派 verifier，但不会自动改 flow。
- 账本坏行 ⇒ 不读决定、不收口（既有 fail-closed 路径）；flow YAML 不可读/缺保留验收步骤 ⇒ 收口失败
  如实提示，可由后续真实事件重试（同原因系统行去重）。
- 收口失败时流程保持 pending，不会自动派 verifier；需要人工/后续事件修复后重新触发。
- 桌面不写客户决定账本（收口只写 flow YAML，由编排完成）。
