# B7 moved methods — normalization evidence

- Source: `git show HEAD:app/desktop/session.ts` (e37da80; 4,626 行)
- Methods moved verbatim: 46（openInternalUnsafe 另作 builder 分解，见 builder-equivalence.md）
- allMethodsIdenticalUnderDocumentedAdaptations = **true**
- allMethodBodiesIdentical = **true**
- allFacadeDelegationsPresent = **true**

| method | source lines | target | target lines | normalized sha equal | body sha equal | facade delegate |
| --- | --- | --- | --- | --- | --- | --- |
| send | 3310-3434 | app/desktop/session/lifecycle/send.ts | 75-199 | YES | YES | YES |
| sendDelivery | 1273-1383 | app/desktop/session/lifecycle/send.ts | 202-312 | YES | YES | YES |
| sendFacts | 1385-1393 | app/desktop/session/lifecycle/send.ts | 315-323 | YES | YES | YES |
| beginDeliveryOrigin | 1257-1263 | app/desktop/session/lifecycle/send.ts | 326-332 | YES | YES | YES |
| captureDeliveryOrigin | 1265-1271 | app/desktop/session/lifecycle/send.ts | 335-341 | YES | YES | YES |
| trimDeliveryOrigins | 1395-1402 | app/desktop/session/lifecycle/send.ts | 344-351 | YES | YES | YES |
| failDeliveryOrigin | 1404-1409 | app/desktop/session/lifecycle/send.ts | 354-359 | YES | YES | YES |
| healStaleOrigin | 1235-1250 | app/desktop/session/lifecycle/send.ts | 362-377 | YES | YES | YES |
| consume | 3070-3302 | app/desktop/session/lifecycle/consume.ts | 76-308 | YES | YES | YES |
| listBackgroundTasks | 1138-1161 | app/desktop/session/lifecycle/background.ts | 44-67 | YES | YES | YES |
| readBackgroundTask | 1167-1197 | app/desktop/session/lifecycle/background.ts | 70-100 | YES | YES | YES |
| stopBackgroundTask | 1204-1224 | app/desktop/session/lifecycle/background.ts | 103-123 | YES | YES | YES |
| open | 1580-1592 | app/desktop/session/lifecycle/open.ts | 195-207 | YES | YES | YES |
| openInternal | 1959-1977 | app/desktop/session/lifecycle/open.ts | 210-228 | YES | YES | YES |
| openObservedRoleSession | 539-570 | app/desktop/session/lifecycle/ops.ts | 102-133 | YES | YES | YES |
| ownsControllerDisposal | 571-575 | app/desktop/session/lifecycle/ops.ts | 136-140 | YES | YES | YES |
| disposeObservedHandle | 576-592 | app/desktop/session/lifecycle/ops.ts | 143-159 | YES | YES | YES |
| observeWatchdog | 1093-1099 | app/desktop/session/lifecycle/ops.ts | 262-268 | YES | YES | YES |
| noteWatchdogActivity | 1102-1105 | app/desktop/session/lifecycle/ops.ts | 271-274 | YES | YES | YES |
| profileRevision | 1121-1121 | app/desktop/session/lifecycle/ops.ts | 277-277 | YES | YES | YES |
| profileChanged | 1122-1126 | app/desktop/session/lifecycle/ops.ts | 280-284 | YES | YES | YES |
| hasBusyRuntime | 1127-1127 | app/desktop/session/lifecycle/ops.ts | 287-287 | YES | YES | YES |
| hasStaleProfile | 1128-1128 | app/desktop/session/lifecycle/ops.ts | 290-290 | YES | YES | YES |
| liveSessionViews | 1129-1131 | app/desktop/session/lifecycle/ops.ts | 293-295 | YES | YES | YES |
| activeEntry | 1412-1414 | app/desktop/session/lifecycle/ops.ts | 257-259 | YES | YES | YES |
| disposeEntry | 1421-1486 | app/desktop/session/lifecycle/ops.ts | 162-227 | YES | YES | YES |
| evictBeyondLimit | 1499-1517 | app/desktop/session/lifecycle/ops.ts | 230-248 | YES | YES | YES |
| isPrimarySession | 1525-1528 | app/desktop/session/lifecycle/ops.ts | 251-254 | YES | YES | YES |
| openBackground | 1604-1617 | app/desktop/session/lifecycle/ops.ts | 298-311 | YES | YES | YES |
| sendBackground | 1634-1648 | app/desktop/session/lifecycle/ops.ts | 314-328 | YES | YES | YES |
| isRoleBusy | 1657-1659 | app/desktop/session/lifecycle/ops.ts | 331-333 | YES | YES | YES |
| hasLiveSession | 1662-1664 | app/desktop/session/lifecycle/ops.ts | 336-338 | YES | YES | YES |
| wasLastTurnAborted | 1667-1669 | app/desktop/session/lifecycle/ops.ts | 341-343 | YES | YES | YES |
| hasPendingDelivery | 1672-1676 | app/desktop/session/lifecycle/ops.ts | 346-350 | YES | YES | YES |
| waitForRoleSettle | 1888-1909 | app/desktop/session/lifecycle/ops.ts | 353-374 | YES | YES | YES |
| waitForRoleIdle | 1923-1957 | app/desktop/session/lifecycle/ops.ts | 377-411 | YES | YES | YES |
| abort | 3445-3472 | app/desktop/session/lifecycle/ops.ts | 414-441 | YES | YES | YES |
| stop | 3483-3535 | app/desktop/session/lifecycle/ops.ts | 444-496 | YES | YES | YES |
| isOpen | 3538-3540 | app/desktop/session/lifecycle/ops.ts | 499-501 | YES | YES | YES |
| openForRoleId | 3543-3545 | app/desktop/session/lifecycle/ops.ts | 504-506 | YES | YES | YES |
| liveRoleIds | 3548-3550 | app/desktop/session/lifecycle/ops.ts | 509-511 | YES | YES | YES |
| findLiveRuntime | 3826-3831 | app/desktop/session/lifecycle/ops.ts | 514-519 | YES | YES | YES |
| ensureFreshRoleSession | 3854-3864 | app/desktop/session/lifecycle/ops.ts | 522-532 | YES | YES | YES |
| rebuildSession | 4452-4463 | app/desktop/session/lifecycle/ops.ts | 535-546 | YES | YES | YES |
| rebuildSessionUnsafe | 4466-4494 | app/desktop/session/lifecycle/ops.ts | 549-577 | YES | YES | YES |
| isCustomerInitiatedTurn | 4515-4520 | app/desktop/session/lifecycle/ops.ts | 580-585 | YES | YES | YES |

Adaptations (only these):
- visibility: `private ` declaration prefix removed in module（门面保留原可见性/签名）。
- `stop`: `manager !== this` → `manager !== this.host.manager`（宿主=门面实例引用；跨实例协调语义逐字保留）。
- `evictBeyondLimit`: `MAX_LIVE_SESSIONS` → `this.host.maxLiveSessions`（同一常量值由门面构造传入；单一来源仍在 barrel 导出）。
