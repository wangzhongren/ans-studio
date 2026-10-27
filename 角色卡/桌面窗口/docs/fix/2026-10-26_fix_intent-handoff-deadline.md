# 桌面窗口：意图交接回执超时误报（20s 报失败、意图其实已送达）

- 日期：2026-10-26
- 角色：桌面窗口
- 状态：实现完成，桌面测试全绿；未跑真实 Electron e2e、未独立验收、未 commit/push、未重启应用。
- 相关：[流程骨架创建/替换](2026-10-26_change_intent-flow-skeleton.md)；功能导航「治理四角色桌面端（W6-B）」。

## 症状与触发条件

1. **回执误报**（客户反馈）：`hand_off_intent` 回执显示约 20s 超时，但策划（Rapporteur）实际已收到意图。期望：回执超时后核对目标会话，已入队/在途则按成功回；实际：一律回 `{ok:false}` 并落失败系统行。
2. **无限等待**（上一轮真机缺陷）：空项目（0 个项目角色、无 `.ans/project.json`）中目标会话无法启动/写入时，Lead 调 `hand_off_intent` 会一直等。

最短复现：trio 项目由 Liaison 交接意图 → 策划会话正常启动并开始处理 → 桌面等 `sendBackground` 返回；该 promise 要等运行时本轮收尾（真实 Pi 远慢于 20s）→ 20s 阶段预算触发 → 误报失败。

## 根因

- `deliverIntentHandoff` 用 `withStageDeadline` 包 `openBackground` / `sendBackground`；阶段预算缺省 **20s**，而 `sendBackground` 在直发路径会等待 `handle.send`（真实引擎的整轮），20s 内不返回是常态。
- 超时分支原先**无条件**走 `fail()`，没有核对目标会话是否已在跑/有排队；回执与事实脱节。
- 另：打开阶段挂起仍必须有界（上一轮修复保留）。

## 修复后的行为

- 总预算缺省 **45s**；单阶段预算缺省 = 总预算（仍可由 `SessionManagerDeps.handOffIntentLimits` / `DesktopDeps.handOffIntentLimits` 注入更短值）。每阶段预算 = `min(stageMs, 剩余总预算)`。
- **打开超时**：`{ok:false}` + 系统行「打开策划会话超时（约 Ns 未确认；可能仍在启动，本次未投递）」，不重试。
- **投递超时**：先对账目标会话 `isRoleBusy(rapporteur) || hasPendingDelivery(rapporteur)`：
  - 有在途/排队证据 ⇒ `{ok:true}` + 系统行「已交给策划（工作中）」+ **写一次** `dispatch.accepted{trigger:"intent-handoff"}` 审计（与确认成功路径共用同一实现；不重复写账本），并挂晚到失败处理器：
    - 晚到失败若输入**未**交运行时（无 turnId/inputAccepted）⇒ 补一条「发送任务给策划失败」系统行；
    - 已 ACK 的晚到失败只记诊断（那是本轮运行失败，不是没投到），不与「工作中」回执矛盾；
    - 处理器自带 `catch`，不产生未捕获拒绝、不重试。
  - 目标既不在跑也无排队 ⇒ `{ok:false}` + 系统行「投递任务给策划确认超时（约 Ns 未返回；目标会话无在途任务，请核对策划会话）」。
- 目标忙时 `sendBackground` 仍走既有投递队列并回 `queued:true`（成功、不等待空闲）——语义逐字不变。
- 账本写入补上成功后的 `onGovernanceLedgerAppended` 通知（与 `routeDispatch` 同口径；失败只诊断）。

代码位置：`app/desktop/session.ts`（`deliverIntentHandoff`、`withStageDeadline`、`recordAcceptedDelivery`）；`app/desktop/interface.ts`（`handOffIntentLimits` 透传与文档注释）。

## 回归验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` | exit 0 |
| 会话测试 | `node --test "test/桌面应用/session.test.ts"` | **47/47 通过** |
| 桌面 Interface 测试 | `node --test "test/桌面应用/interface.test.ts"` | **140/140 通过** |

新增/更新的关键用例（`test/桌面应用/session.test.ts`）：

- 打开挂起 ⇒ 阶段超时 `ok:false` + 恰一条失败系统行（不挂起、不重试）。
- 投递挂起但目标忙/在途 ⇒ `ok:true`（工作）+ 恰一条系统行。
- 投递挂起且目标已 settle、无排队 ⇒ `ok:false`（**没有在途证据不谎称成功**）。
- 超时对账为在途后晚到失败 ⇒ 「工作中」+ 晚到失败各一条系统行；`dispatch.accepted` 恰一条；零未捕获拒绝。
- 目标忙 ⇒ 入队成功，settle 后按序投出唯一一条任务。

## 残余风险

- 超时不取消底层 `openBackground`/`sendBackground`：投递晚到可能实际成功，但回执已按对账结果给出；晚到失败只在未 ACK 时补系统行，已 ACK 的失败仅留诊断。
- 对账证据是「目标忙/有排队」：极端竞态下目标可能正忙于**无关**任务，而本次投递尚未进入直发阶段（`send()` 的边界重建窗口），此时会按在途回执；窗口很窄，未在真机观察到。
- 在途对账即写 `dispatch.accepted`；若晚到失败揭示输入从未被接受，账本无法回滚（超时对账的固有代价）。
- 未跑真实 Electron e2e；空项目真机链路待独立验收。
