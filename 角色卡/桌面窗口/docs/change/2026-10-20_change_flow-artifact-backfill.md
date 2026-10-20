---
id: flow-artifact-backfill
type: change
title: 流程检查前补登 flow artifact 证据（observeFlowArtifacts）——Steward 才能把 delivered 标 done
created: "2026-10-20"
status: implemented
---

# flow artifact 证据补登（旧扫描规则证据文件）

## 真机问题

短链接项目还差一层：`integration-e2e` / `verification-evidence` 的 evidence.ref 文件（`.js`/`README.md`）
是旧扫描规则下写的，重启后新扫描把既有文件当基线、不再补 `artifact.observed`，Steward 的
`flow_step_update` done 会被 `insufficient-evidence` 挡住。

编排新增 `observeFlowArtifacts({projectRoot, flowId})`（经 `src/pipeline/orchestration/flow-state.ts`
公共出口；幂等补登 flow 里 `kind:"artifact"` 且 `evidence.ref` 的文件观察记录）。桌面在流程检查里消费。

## 改动（`app/desktop/interface.ts`）

- 新增 `backfillFlowArtifacts(projectRoot, flowId, diagnostic)`，在 `dispatchAcceptanceForFlow` 中
  **验收已 accepted 收口分支之后、delivered 唤醒与验收判定之前**调用（settle / ledger / 导入 /
  verifier settle 触发的检查都覆盖）：
  1. 读 `docs/flows/<flowId>.yaml` 并解析；仅当存在 `kind:"artifact"` 且 `evidence.ref` 非空的步骤时，
     才调 `observeFlowArtifacts`（无 YAML/解析失败/无 artifact 步骤 ⇒ 不调用，交给后续判定）；
  2. 成功/部分成功只记诊断：`acceptance.artifacts.backfilled`（本次新追加数量）、
     `acceptance.artifacts.backfill-skipped`（skipped 数量）；失败记 `acceptance.artifacts.backfill-failed`
     （`ok:false` 或异常），**不阻断**后续 delivered 唤醒/验收判定（Steward/验收门会给出证据不足原因）；
  3. 计数归一：编排返回 `observed: string[]` / `skipped: {path,reason}[]`，桌面折算为数量后再入诊断；
  4. **补登是应用观察文件**（编排写 `artifact.observed{actorRoleId: step.owner, power, artifactPath,
     artifactSha256, flowId}`）——桌面不写客户决定账本、不伪造 done、不自动改 flow。
- `DesktopDeps.observeFlowArtifactsFn?`：缺省经 Pipeline 公共出口真实实现（静态导入，类型对齐
  `ObserveFlowArtifactsResult`）；测试可注入。
- 顺序保证：补登成功后再 `wakeStewardForDeliveredSteps`（见 `2026-10-20_change_delivered-step-steward-wake.md`）
  ——Steward 收到核证任务时账本已有 artifact 证据，`flow_step_update` done 才能通过证据对账。

## 测试与证据（真实输出）

- `test/桌面应用/acceptance-dispatch.test.ts` 新增 4 例（共 **34/34 过**）：
  1. delivered + artifact ref 文件存在但账本缺 ⇒ 检查时恰调一次 `observeFlowArtifacts`、账本补登恰一条
     `artifact.observed`、随后 Steward 唤醒（任务含 flow_step_update）、不伪造 done；
     重复检查（再 listProject）⇒ 仍请求补登（编排幂等）、账本仍一条、Steward 唤醒不重复；
  2. 证据文件缺失 ⇒ 补登被调用但 skipped、账本不伪造 `artifact.observed`、flow 不被改、不崩；
  3. 已有 `acceptance accepted` ⇒ **收口优先**：不请求补登、不唤醒核证、不派 verifier；
  4. **真实编排出口**（不注入）：文件存在但账本缺 ⇒ 真写 `artifact.observed`（actorRoleId=步骤 owner、
     项目角色 power=project、artifactSha256 64 位 hex、flowId 如实）；随后 Steward 唤醒；再次检查
     同 path+sha 幂等不重复追加。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **677 计 / 677 过 / 0 红**。
- `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` ⇒ **44/44 过**。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险

- 文件缺失/过大/二进制/路径非法 ⇒ 编排只 skipped，桌面只记诊断并继续唤醒 Steward——Steward 会收到
  `insufficient-evidence`，需补文件后由后续事件重试（幂等）。
- 桌面每次流程检查都会请求补登（幂等由编排的 path+sha 保证）；文件很大时读取成本由编排上限（2MiB）约束。
- 补登只覆盖 flow YAML 中显式 `kind:"artifact"` 且有 `evidence.ref` 的步骤；无 ref 的 artifact 步骤不会
  被观察（需流程单补 ref）。
- 补登与验收判定使用同一账本（append-only/fsync）；账本坏行时补登返回失败、桌面如实诊断并继续判定
  （既有 fail-closed 路径）。
