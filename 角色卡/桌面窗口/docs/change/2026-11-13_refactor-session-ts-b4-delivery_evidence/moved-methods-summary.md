# B4 搬出方法摘要（27 方法，逐字移动证明）

- 源：git show HEAD:app/desktop/session.ts（e9d5783 = origin/main，含 B0–B3；10,252 行）
- 方法数：27（delivery/queue 20 / delivery/store 7）；全部在记录化适配下逐字节相等：**true**；方法体 sha256 全部相等：**true**
- 归一化：仅（1）声明行 `private ` 前缀去掉（模块内 public，供门面委托调用；门面侧可见性逐字不变）；（2）`queueDirectNotification` 的内联 `import("…src/model/trunk.ts")` 相对深度随模块目录调整（`../../` → `../../../`；同一模块）。方法体（含 JSDoc）零改动。

| 方法 | 模块 | HEAD 源行 | 目标行 | sha256(源归一化)=sha256(目标) |
| --- | --- | --- | --- | --- |
| `deliveryIsStopped` | `app/desktop/session/delivery/queue.ts` | 761-763 | 262-264 | ✅ `3347b73ff05610ad…` |
| `deliveryLifecycle` | `app/desktop/session/delivery/queue.ts` | 764-766 | 267-269 | ✅ `02f61ca8192c13f7…` |
| `resumeDelivery` | `app/desktop/session/delivery/queue.ts` | 767-769 | 272-274 | ✅ `87010a7a798c660f…` |
| `queueDirectNotification` | `app/desktop/session/delivery/queue.ts` | 1651-1668 | 277-294 | ✅ `adeac702f7deeae2…` |
| `forceResetDeliveryState` | `app/desktop/session/delivery/queue.ts` | 4094-4147 | 297-350 | ✅ `87d608c0d8d2a16c…` |
| `appTaskClientMessageId` | `app/desktop/session/delivery/queue.ts` | 6151-6157 | 353-359 | ✅ `e16ad383e87cf033…` |
| `appTaskClientMessageIdFromSeed` | `app/desktop/session/delivery/queue.ts` | 6159-6163 | 362-366 | ✅ `4aa5449c52a8baef…` |
| `appDispatchClientMessageId` | `app/desktop/session/delivery/queue.ts` | 6165-6169 | 369-373 | ✅ `e2e2b2a4349281fc…` |
| `rememberAppTaskDelivered` | `app/desktop/session/delivery/queue.ts` | 6171-6180 | 376-385 | ✅ `12144bfc2e484ce6…` |
| `pendingAppTaskDelivery` | `app/desktop/session/delivery/queue.ts` | 6182-6197 | 388-403 | ✅ `0f29848d4285bf11…` |
| `enqueueDelivery` | `app/desktop/session/delivery/queue.ts` | 6199-6218 | 406-425 | ✅ `198360e391360098…` |
| `withdraw` | `app/desktop/session/delivery/queue.ts` | 6521-6570 | 428-477 | ✅ `4b50056d47f560eb…` |
| `notifyRoleState` | `app/desktop/session/delivery/queue.ts` | 6572-6622 | 480-530 | ✅ `1b79d4f09a6afa53…` |
| `broadcastRoleStates` | `app/desktop/session/delivery/queue.ts` | 6624-6629 | 533-538 | ✅ `d92857835c0540de…` |
| `redeliverNudge` | `app/desktop/session/delivery/queue.ts` | 9422-9460 | 541-579 | ✅ `c5596ed6d0e4b87e…` |
| `drainAllQueuesFor` | `app/desktop/session/delivery/queue.ts` | 9563-9574 | 582-593 | ✅ `28ad559d0efe8d69…` |
| `drainPiQueuesAcrossProjects` | `app/desktop/session/delivery/queue.ts` | 9576-9584 | 596-604 | ✅ `0cefe56146d4317f…` |
| `waitForRunStopDeliveryClaims` | `app/desktop/session/delivery/queue.ts` | 9586-9615 | 607-636 | ✅ `79657d92dc3e2ec8…` |
| `drainQueue` | `app/desktop/session/delivery/queue.ts` | 9617-9641 | 639-663 | ✅ `1d5ac25e9de4d10f…` |
| `drainQueueUnsafe` | `app/desktop/session/delivery/queue.ts` | 9643-10251 | 666-1274 | ✅ `2c12d8b5310319cb…` |
| `persistableDeliveryItem` | `app/desktop/session/delivery/store.ts` | 6222-6252 | 118-148 | ✅ `0f53ff8a670b2425…` |
| `deliveryStoreItems` | `app/desktop/session/delivery/store.ts` | 6254-6274 | 151-171 | ✅ `1c78a768ac8e941d…` |
| `deliveryQueuePersistenceFacts` | `app/desktop/session/delivery/store.ts` | 6276-6281 | 174-179 | ✅ `d68bd0b94ea0e774…` |
| `finishStopPersistence` | `app/desktop/session/delivery/store.ts` | 6283-6293 | 182-192 | ✅ `33c1da853401d23e…` |
| `persistDeliveryQueues` | `app/desktop/session/delivery/store.ts` | 6295-6322 | 195-222 | ✅ `e2a52069a4ae48b2…` |
| `parsePersistedDeliveryItem` | `app/desktop/session/delivery/store.ts` | 6324-6398 | 225-299 | ✅ `40991b3799a4125e…` |
| `restorePersistedDeliveries` | `app/desktop/session/delivery/store.ts` | 6400-6519 | 302-421 | ✅ `7553180d0544206f…` |
