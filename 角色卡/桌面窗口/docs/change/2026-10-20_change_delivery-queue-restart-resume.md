---
id: delivery-queue-restart-resume
type: change
title: 投递队列持久化＋启动自动重投（重启后任务自动续跑）＋僵尸步骤自检兜底
created: "2026-10-20"
status: implemented
---

# 投递队列持久化与重启自动续跑

## 真机根因

应用重启时 test 角色正在跑 integration-e2e，排在后面的 verification-evidence 还在内存投递队列里；重启把
**在途回合与队列都丢了**，但 flow YAML 仍标 `dispatched`，应用以为任务在途 ⇒ 静默卡住（test 无
busy/queue/session）。Lead 用 `flow_step_supersede` + `dispatch_task` 恢复后，产品需要启动自检。
客户明确：重启后任务要**自动续跑**，不是只给 Lead 一条提示。

## 改动

### 1. `app/desktop/session.ts`：投递队列持久化 + 恢复重投

- `SessionManagerDeps.deliveryQueueStorePath?`（由 Interface 提供 `<userData>/ans/delivery-queue.json`；
  **不写项目文件、不写 `.env`**；缺省 ⇒ 不持久化，旧行为零变化）。
- 磁盘形状 `PersistedDeliveryItemV1`：`{version:1, items:[{key:{projectRoot,roleId,runtime},
  item:{kind,runtime,targetRoleId,sourceRoleId,text,summary,dedupKey,enqueuedAt,flowId?,deliveryId?,
  handback?,report?,liveReport?,liveDurability?}, state:"queued"|"in-flight", enqueuedAt}]}`。
  只存 **JSON 安全字段**（`opts` 图片/回调、attempt 标识不落盘——恢复到原角色后按原文本重投，任务文本自足）。
- 同步点：`enqueueDelivery`（入队）、认领（in-flight）、`delivery.end` 成功（移除＋`deliveredDeliveryKeys`
  防崩溃后重投已完成项）、失败重试（保持 queued）、settle/dispose（清理进行中）、撤回、坏条目丢弃。
  快照＝内存队列（queued）＋未完成 `activeDeliveries`（in-flight）；**原子写**（tmp+rename、串行链、
  失败只诊断，不影响内存投递）。
- **武装标志**：只有在 `restorePersistedDeliveries()` 读过磁盘（或确认文件不存在）后才允许写——防止启动早期
  一次入队用空内存快照覆盖磁盘待恢复项。
- `restorePersistedDeliveries()`（启动/项目导入时调用一次）：读回 `queued` 与 `in-flight`，一律按 queued
  重新入内存队列（崩溃时在途回合会重新开始；允许模型续做/重做），按 `project+role+runtime+dedupKey` 去重
  （已在内存/在途/已投递成功 ⇒ 跳过），复用既有 `enqueueDelivery` + `drainQueue` **自动重投**（目标未开
  自动开启，忙则排队——与正常运行同一条路径）。损坏/不可读/形状不符 ⇒ 只记诊断、返回 0、不阻塞启动、
  不猜内容。返回 `{restored, skipped, items[]}` 供 Interface 落系统行。

### 2. `app/desktop/interface.ts`：启动恢复接线 + Lead 系统行 + 僵尸步骤自检（兜底）

- `DesktopDeps.deliveryQueueStorePath?`：缺省从 `runtimeStatePath` 同目录派生
  `<userData>/ans/delivery-queue.json`；测试可注入临时路径。
- `listProject`（应用启动/项目导入/每次刷新）：
  - 首次调用触发 `restoreDeliveryQueuesOnce()`（每进程一次）；恢复 >0 时按项目给 Lead（主入口）落**一条**
    delivery-note 系统行：「已从上次运行恢复 N 条任务并重投（应用重启/崩溃后续跑；不弹客户卡、不把步骤
    标 done）」，并列出每条 `[回交/派发/系统/消息] 摘要（角色 · runtime）`。
  - 每次刷新调度**僵尸步骤自检**（40ms 合并窗口、`unref` 定时器、fire-and-forget）：等待恢复完成后，
    对每个 `docs/flows/<flowId>.yaml`（trio）解析；`status ∈ {dispatched, delivered}` 的步骤若 owner
    **无活会话、无 busy、无队列/在途投递**（跨 `RUNTIME_KINDS` 用 `hasLiveSession`/`hasPendingDelivery`/
    `isRoleBusy` 只读事实）⇒ 视为可能因重启/崩溃丢失，向 Lead 落一条系统行：列出 flowId、stepId、owner、
    status，并提示「可能因应用重启丢失；请用 flow_get 核对，必要时 flow_step_supersede 换新步骤并
    dispatch_task 重派；不要重复使用已派 stepId」。
  - 僵尸提示**去重**：`project+flowId` → `revision(sha256 bytes)+stale step ids 排序` 哈希；同集合只提示
    一次；不再 stale ⇒ 清除；revision 变化后再次 stale ⇒ 允许再提示。
  - **不自动派发、不弹客户卡、不把步骤标 done**；无 flow YAML/解析失败 ⇒ 不提示（另有验收门处理）；
    pending/done/superseded/failed/blocked 等其它状态不提示；owner 有活会话/队列/在途投递不提示。
    持久队列中已有对应项时（恢复后进入内存队列/在途）自然不会被判为僵尸。

## 测试与证据（真实输出）

- `test/桌面应用/message-queue.test.ts` 新增 3 例：
  1. enqueue 后模拟重启（新 `SessionManager` + 同一 store）⇒ 自动重投到原角色/原 runtime（store 内容
     queued/键/正文逐项断言）；
  2. `in-flight` 未完成 ⇒ 重启后重投；`delivery.end` 成功后持久项移除，新 manager 恢复 0 条（不重投）；
  3. 重复 `dedupKey` 只重投一次；坏条目/损坏 store 不崩；多项目/多角色键隔离（另一项目队列独立保留）。
- `test/桌面应用/interface.test.ts` 新增 3 例：
  1. `listProject` 触发恢复并自动重投到原角色；Lead 恰一条「已从上次运行恢复 1 条任务并重投」系统行；
     零客户卡；重复 `listProject` 不重复系统行；
  2. 僵尸自检：`dispatched`/`delivered` 且 owner 无会话/队列 ⇒ Lead 一条去重提示（含 flowId/stepId/
     owner/status + flow_get/flow_step_supersede/dispatch_task），`pending` 不提示，不开会话、不弹卡；
     同 revision 重复刷新不重复提示；revision 变化后再次 stale 可再提示；
  3. owner 有活会话 ⇒ 不误报；无 flow YAML/解析失败（坏 YAML 只记诊断）⇒ 不提示。
- `node --test "test/桌面应用/**/*.test.ts"` ⇒ **661 计 / 661 过 / 0 红**。
- `node --test "test/测试/governance-e2e-auto/**/*.test.ts"` ⇒ **44/44 过**（11.6s）。
- `npm run typecheck` ⇒ **exit 0（0 错）**。

## 残余风险

- `opts`（图片/onDeliveryProgress 回调）不持久化：重启重投只保证任务文本自足；带图消息重启后按纯文本重投。
- `in-flight` 重启后重投会让模型**重新开始该回合**（可能重复已做的工作）——按客户要求允许续做/重做。
- 存储位于 user-data（本机单点）；多实例同时运行同一 userData 会互相覆盖（当前产品单实例）。
- `delivery.end` 以 `sendDelivery` resolve 为准（真实运行时通常=回合结束）；其间崩溃会重投该回合。
- 恢复每进程一次；恢复完成前的极短窗口内若崩溃，恢复前新入队的条目可能未落盘（已用武装标志避免覆盖
  旧文件，但该新条目本身丢失）。
- 僵尸自检依赖 flow YAML 的 owner 字面 id 与 runtime 会话键；owner 无会话但正被其他机制恢复时可能提示一次
  （去重按 revision+step 集合，恢复后不再提示）。
