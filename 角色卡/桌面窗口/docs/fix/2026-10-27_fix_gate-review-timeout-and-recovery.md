# 桌面窗口：gate 复核回执超时误报 + “有 pass 报告但无 gate 记录”恢复

- 日期：2026-10-27
- 角色：桌面窗口
- 触发：客户反馈应用流程走不下去（pixel-snake）：Convener 调 `request_gate_review` 后，质检实际收到
  `[Gate 复核]` 任务并写出 `docs/acceptance/pixel-snake-gate-vertical-slice-report-v1.md`（pass，
  sha `a931d111…`），但 `.ans/.../gates` 无记录、账本无 gate 派发，flow 的 `gate-vertical-slice`
  仍 pending，下游 `integration-e2e` / `visual-baseline` 不启动。Convener 会话显示“gate 复核已在途
  （虽投递回执超时…）”。
- 状态：实现完成，桌面 gate 组与全文件测试通过；未跑真实 Electron e2e、未独立验收、未 commit/push、
  未重启运行中的应用（重启由主上下文统一处理）。

## 症状与根因

1. **回执误报（与 handoff 超时同源）**：`app/desktop/interface.ts::performRequestGateReview` 用
   `withGateReviewDeadline` 包 `manager.sendBackground(...)`；阶段预算缺省 **20s**，而真实引擎的
   `send` 会等整轮写入/ACK。超时分支**无条件**返回 `unavailable`，不核对质检会话是否在跑/有排队，
   于是记录与 `dispatch.accepted` 都没落盘——任务却已送达。
2. **没有“报告已有、记录缺失”的恢复**：`processGateReviewsForFlow` 只遍历**已存在的 gate 记录**，
   且 gates 目录缺失/为空时提前返回；报告处置（`processGateReportAttempt` → `completeGateStep`）
   只能从记录出发。记录缺失时，即使 pass 报告已在磁盘，也永远不会收口。

## 修复后的行为

### 1. 投递超时对账（`requestGateReviewForProject` / `performRequestGateReview`）

- 总预算缺省 **45s**；阶段预算缺省 **= 总预算**（仍可由 `DesktopDeps.requestGateReviewLimits` 注入）。
- `sendBackground` 超时后先对账 `manager.isRoleBusy(projectRoot,"verifier",runtime) ||
  manager.hasPendingDelivery(...)`：
  - **有在途/排队证据** ⇒ 继续持久化：先原子写 gate 记录（`status:"dispatched"`、`reportPath`/
    `reportVersion`/`flowRevision`），再写 `dispatch.accepted{stepId:gateId,targetRoleId:"verifier"}`，
    返回 `{ok:true, code:"dispatched"}`，文案如实写“质检确认回执超时，但目标会话仍在工作/已入队；
    记录与审计已补写，请勿重复请求”；
  - **目标既不在跑也无排队** ⇒ 仍 `unavailable`，**零 gate 记录、零账本**（不写假记录）。
- gate 记录写失败 ⇒ 仍 fail-closed（`unavailable`，不声称已派发）；**账本写失败 ⇒ 只诊断、不翻转
  回执**（gate 记录已落盘，是恢复扫描源；回执附审计失败原因）。
- 晚到投递结果只记诊断（`request-gate-review.late.failed`），不重复写记录/账本、不重试；
  重复请求仍由既有记录/在途、账本检查幂等拦下（`already-dispatched`）。

### 2. 恢复：有 pass 报告但缺 gate 记录（`recoverMissingGateRecordsForFlow`）

同一 gate 扫描（`runAcceptanceCheck` 的导入/settle/账本事件触发）在读取既有记录**之前**先做有界恢复，
且不再依赖 gates 目录存在。仅当全部满足时补建：

- flow 的 gate 步骤仍 `pending`、id 形如 `gate-<slug>`、`kind:"artifact"` 且 `gateKind` 合法；
- gate 记录**缺失**（已存在/损坏交给既有记录分支处置，不覆盖）；
- 最新 gate 报告存在、可读、`acceptance-triage/v1` 结构合格，且结论为 **`pass`**。

补建一条 `status:"dispatched"` 的记录（当前 `flowRevision` + 报告 path/version/sha，`requestId` 含
`-recovery-`），随后立即走既有 `processGateReportAttempt`：`completeGateStep` 收口 gate 步骤、
写 passed 记录、`gate.review` 审计、`artifact.observed`；pass 系统行追加“（应用恢复：此前已有通过
报告但缺少 gate 记录，已补建记录并收口）”，并记诊断 `gate.review.recovered` / `gate.review.recovered-pass`。

- 报告缺失/结构坏/结论非 pass ⇒ 跳过：不建记录、不改 flow、不写 `gate.review`/`artifact.observed`、
  不路由返工、不伪造 pass。
- 幂等：记录一旦存在就不再补建；重复扫描由 passed 分支的 `completeGateStep`（already-done）与
  `gate.review` 去重（gateId + reportSha256）兜住。
- 不改客户决定、不写 `customer.decision`、不重派 Proof。

代码位置：`app/desktop/interface.ts`（`requestGateReviewForProject`、`performRequestGateReview`、
`processGateReportAttempt`、`recoverMissingGateRecordsForFlow`、`processGateReviewsForFlow`）。

## 回归验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` | exit 0 |
| gate 专项（新增 4 例） | `node --test --test-name-pattern="2026-10-27" "test/桌面应用/acceptance-dispatch.test.ts"` | **4/4 通过** |
| 桌面验收/派发全文件 | `node --test "test/桌面应用/acceptance-dispatch.test.ts"` | **99/99 通过** |

新增用例：

- 投递回执超时但质检在途 ⇒ gate 记录（dispatched/报告 path/version/flowRevision）+ 账本
  `dispatch.accepted{stepId=gateId}` 恰一条 + `dispatched` 回执含“确认回执超时/在途/勿重复请求”；
  重复请求 `already-dispatched`、不重复派发/账本。
- 投递回执超时且目标已 settle、无排队 ⇒ `unavailable`，零 gate 记录/零派发审计，gate 保持 pending。
- pass 报告已存在但无记录 ⇒ 导入恢复补建记录（`requestId` 含 `-recovery-`）+ gate done + 恰一条
  `gate.review`/`artifact.observed`；不重派质检；系统行标注“应用恢复”；再次 settle 事件幂等。
- 报告缺失/结构坏/fail（blocker）⇒ 均不补建、不收口、不返工；正向对照 pass 流程证明扫描已执行。

## 残余风险

- 恢复以**最新报告**为准，不解析报告自由文本里的 flow revision：若报告产出后 flow 又变化（gate 仍
  pending），恢复会按当前 flowRevision 收口。`completeGateStep` 本身同样的口径；真机未见该窗口。
- 投递超时对账依赖“目标在跑/有排队”；极端竞态下目标可能正忙于无关任务，本次任务尚未进入直发阶段，
  会按在途回执（窗口很窄）。
- 在途对账即写 `dispatch.accepted`；若晚到投递实际失败，账本无法回滚（超时对账固有代价），gate 记录
  会在 30 分钟无报告后按陈旧阈值转 `returned-to-proof`（既有设计）。
- 恢复扫描在每次 `runAcceptanceCheck` 执行，读取每 flow 的 gate 报告；flow/gate 数量大时有额外只读 IO，
  但均为既有报告目录的版本扫描。
- 未跑真实 Electron e2e；pixel-snake 现场恢复需重启应用后由导入事件触发（主上下文统一重启）。
