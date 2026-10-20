---
id: turn-auto-abort-queue-priority
type: change
title: 卡住的 Convener 按合理时限自动中止，回交优先于 system 看护项，恢复提议在决策开关下直执行
created: "2026-10-20"
status: implemented
---

# 卡住的 Convener 自动中止 + 队列优先级 + 恢复提议自动执行

## 真机问题（diagnostics 已确认）

- Convener 一个回合跑了 **1 小时**，直到「最后兜底 3600000ms」才中止；期间 **24 条**
  backend/tester/frontend 回交被 `delivery.blocked target-busy` 堵住。
- watchdog 只报 `queue-stuck` / `turn-deadline`，**不中止治理主角色**（内置治理角色被
  `govSuppressed`「主人自身忙不报」排除；到点检查按 2026-10-17 客户裁定只提示、不中止）。
- `propose_recovery` 在客户已勾选「替我决策」的情况下仍弹 `recovery-confirm` 恢复卡。
- 客户总原则：「我勾选了替我决策就不用我来管了。」

## 改动（最小可用，不扩大重构）

### 1. `app/desktop/watchdog.ts`：所有角色（含 Convener）的回合自动中止

- `WatchdogServiceDeps` 新增两个**可选**注入：
  - `onTurnDeadline(projectRoot, roleId, runtime, turnId)`——自动中止回调；
  - `autoRecoveryEnabled(projectRoot, roleId)`——按角色的自动开关读取。
  两者缺省 `undefined` ⇒ **旧行为零变化**（到点只告警、整轮最后兜底 1h）。
- 信号 #1 的评估内新增自动中止判定：角色 busy、回合已耗 ≥ 中止时限、无挂起确认卡（正确等待不中止）、
  且 `autoRecoveryEnabled` 为真 ⇒ 调用 `onTurnDeadline` 恰一次。
  - **覆盖所有角色**：不再因 `builtIn` / `governanceFunction` / 「治理主人自身忙」排除（该排除只保留给
    旧告警文案）。
  - 中止时限 `turnAbortMs`：显式覆盖（测试）→ env `ANS_PI_PROMPT_TIMEOUT_MS`（与会话同源）→
    缺省 `DEFAULT_TURN_ABORT_MS`（15 分钟）；再与运行时 `turnLastResortMs` 取较小值（不晚于最后兜底）。
  - **去重**：`autoAbortFired`（`projectRoot\0roleId` → 已触发的轮次身份）——同一 role+turnId 只触发
    一次，挡住 abort 生效前的后续 tick 与「abort→立即重开→再 abort」循环；新一轮（新 turnId）重新计时。
  - 触发后记诊断 `watchdog.auto-abort`（roleId/turnId/elapsedMs/limitMs），并经既有投递机投一条
    Lead 系统行：文首 `[系统·看护]`，「**回合自动中止**」＋「**自动中止 ≠ 客户批准**」＋后续队列说明。
  - 回调抛错只记 `watchdog.auto-abort.failed`（看护自身异常隔离，不影响会话）。

### 2. `app/desktop/interface.ts`：注入开关映射与中止执行

- `autoRecoveryEnabled`：内置治理角色（listing `builtIn` 或 `isBuiltInGovernanceRoleId`）↑「替我决策」
  （`decisionJudgeSwitch`）；项目角色 ↑「替我审批」（`shellJudgeSwitch`）。任一按角色映射开启即生效。
- `onTurnDeadline`：调 `manager.abort({projectRoot, roleId, runtime})`（即 `abortSession` 同一实现）；
  成功 ⇒ 诊断 `watchdog.auto-abort.executed` ＋ `manager.redeliverNudge` 触发一次队列 drain（settled
  前 drain 自判忙并保留，settled 后由既有 `drainAllQueuesFor` 放行）；失败 ⇒ 只记
  `watchdog.auto-abort.failed`（`unsupported`/`abort-error`），不重试、不循环。
- `SessionManager` 依赖新增 `autoDecisionEnabled: () => decisionJudgeSwitch.isEnabled()`。

### 3. `app/desktop/session.ts`：回交/派发优先于 system 看护项

- `drainQueueUnsafe` 认领时跳过 `kind:"system"` 条目，取第一个非 system 条目（回交/派发/客户消息的
  **相对顺序不变**——客户消息屏障语义保留；同类仍按到达序）；队列全是 system 时才投 system。
- 合批仍只在队首（headIndex 0）连续回交时进行；从中间认领的单条回交不跨过屏障合批。
- 效果：Convener 忙时队列里的回交不再被看护 system 项压在后面；abort/settle 后下一次 drain 立即投回交。

### 4. `app/desktop/session.ts::proposeRecovery`：决策开关开启时不再弹客户卡

- 执行动作抽出 `runAction`（abort-turn / rebuild-session / redeliver 复用既有实现——不造第二套）。
- `autoDecisionEnabled` 开 ⇒ **不呈现 `recovery-confirm` 客户卡**，直接执行，回执如实
  （executed/error/unsupported），诊断 `recovery.auto`；另投一条 Lead 系统行
  `[系统·恢复] … 自动执行（≠ 客户逐项批准）`。不写客户决定账本。
- 校验不过（缺 roleId/action/evidence、目标不在项目、内置角色）⇒ 既有 `refuse` 如实拒绝并回投提议
  角色，**不弹卡**。
- 开关关/缺省 ⇒ 旧路径**逐字不变**：推卡、恰 `allow:true` 才执行、未确认零执行（fail-closed）。

## 测试与证据

- `test/桌面应用/session.test.ts`：新增 2 例看护自动中止（Convener 开关开 ⇒ onTurnDeadline 恰一次＋
  Lead 系统行＋同轮去重；开关关 ⇒ 到 15min/1h 均不中止、旧告警语义保留）。**30/30 过**。
- `test/桌面应用/handback-delivery.test.ts`：新增队列优先级 1 例（system 先入队 ⇒ 回交仍先投递；
  队列 2→1→0 按序下降）。**16/16 过**。
- `test/桌面应用/dispatch-delivery.test.ts`：新增 proposeRecovery 自动决策 1 例（开关开 ⇒ 零卡、直接
  执行、receipt executed、Lead 系统行；证据不足 ⇒ 自动拒绝不弹卡零执行；开关关 ⇒ 卡仍在、未确认零执行）。
  **50/50 过**。
- `test/桌面应用/interface.test.ts`：新增 Interface 接线 1 例（内置 Convener 超时 + 决策开关开 ⇒ 真的
  调用会话 `abort` 恰一次；Lead 系统行 settle 后经既有投递机投出）。**63/63 过**。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **645 计 / 645 过 / 0 红**（15.9s）。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险

- 自动中止只请求停止回合；真实运行时若 abort 不生效（不支持/异常），看护按同一 role+turnId 只触发一次，
  不会循环重试——残留卡死仍由运行时 1h 最后兜底收口。
- 内置治理角色映射「替我决策」、项目角色映射「替我审批」：开关语义按客户双开关评审沿用；若客户只开
  某一组，另一类角色保持旧行为。
- 队列优先级改变的是「system 相对位置」：客户消息屏障与回交/派发相对顺序均保持不变（有既有测试钉住）。
- `proposeRecovery` 自动执行不经过判断 agent：开关本身即客户授权（客户总原则）；不写客户决定账本。
