# B3 搬出方法摘要（45 方法，逐字移动证明）

- 源：git show HEAD:app/desktop/session.ts（c616280 = origin/main，含 B0–B2；blob ab0022cd5cfa0b88eeea22458865c479634a96f7）
- 方法数：45（tasks 17 / diagnostics 17 / session-env 11）；全部在记录化适配下逐字节相等：**true**；方法体 sha256 全部相等：**true**
- 归一化：仅把声明行 `private ` 前缀去掉（模块内 public，供门面委托调用；门面侧可见性逐字不变）；方法体（含 JSDoc）零改动。

| 方法 | 模块 | HEAD 源行 | 目标行 | sha256(源归一化)=sha256(目标) |
| --- | --- | --- | --- | --- |
| `observeRoleEvent` | `app/desktop/session/tasks.ts` | 4416-4452 | 138-174 | ✅ `11642cbc92a6b7cc…` |
| `roleActivityLogText` | `app/desktop/session/tasks.ts` | 4454-4465 | 176-187 | ✅ `02e89d44f94f1800…` |
| `readRoleActivityLog` | `app/desktop/session/tasks.ts` | 5279-5282 | 189-192 | ✅ `f7c83259f5d8e0aa…` |
| `listTasks` | `app/desktop/session/tasks.ts` | 5284-5298 | 194-208 | ✅ `4b6b1893f6da11bb…` |
| `projectStateView` | `app/desktop/session/tasks.ts` | 5302-5308 | 210-216 | ✅ `2e9e9ca51cef4d5c…` |
| `projectStateTool` | `app/desktop/session/tasks.ts` | 5310-5321 | 218-229 | ✅ `7a3d55bf95a3038b…` |
| `projectNote` | `app/desktop/session/tasks.ts` | 5323-5407 | 231-315 | ✅ `db5431843ae043b7…` |
| `restoreTasks` | `app/desktop/session/tasks.ts` | 6099-6165 | 317-383 | ✅ `7009e4867f82bf3d…` |
| `partialArtifactsFor` | `app/desktop/session/tasks.ts` | 6174-6183 | 385-394 | ✅ `bcbfd670271734ab…` |
| `roleTempDir` | `app/desktop/session/tasks.ts` | 6185-6193 | 396-404 | ✅ `00c66d9b8c174bbb…` |
| `isolatePartialArtifacts` | `app/desktop/session/tasks.ts` | 6195-6267 | 406-478 | ✅ `2ff566b8a5c9894e…` |
| `chooseRedispatchTarget` | `app/desktop/session/tasks.ts` | 6282-6289 | 480-487 | ✅ `0e5ae66590c0280a…` |
| `terminateRoleRun` | `app/desktop/session/tasks.ts` | 6402-6514 | 489-601 | ✅ `87daf65061cc5e9c…` |
| `taskChainRootOf` | `app/desktop/session/tasks.ts` | 6516-6526 | 603-613 | ✅ `fe7b8256f7995b0f…` |
| `redispatchTask` | `app/desktop/session/tasks.ts` | 6528-6698 | 615-785 | ✅ `4deb4046b6f7f218…` |
| `closeTask` | `app/desktop/session/tasks.ts` | 6700-6706 | 787-793 | ✅ `ac57011a673bacb1…` |
| `escalateStuckTask` | `app/desktop/session/tasks.ts` | 6708-6828 | 795-915 | ✅ `54acf507ac36257f…` |
| `governanceOwnerRoleId` | `app/desktop/session/diagnostics.ts` | 2546-2549 | 145-148 | ✅ `ae993e5f24df3d72…` |
| `governanceRuntimeFor` | `app/desktop/session/diagnostics.ts` | 2551-2554 | 150-153 | ✅ `de0d402ac76a2a2d…` |
| `activeRuntimeFor` | `app/desktop/session/diagnostics.ts` | 2556-2564 | 155-163 | ✅ `682dd3b5b31528ad…` |
| `governanceProjectionKey` | `app/desktop/session/diagnostics.ts` | 6843-6846 | 165-168 | ✅ `ae4366910e606164…` |
| `governanceProjectionFingerprint` | `app/desktop/session/diagnostics.ts` | 6848-6873 | 170-195 | ✅ `b326ab37150da736…` |
| `registerGovernanceClientProjection` | `app/desktop/session/diagnostics.ts` | 6875-6891 | 197-213 | ✅ `3b8cab3cb89bcec1…` |
| `lookupGovernanceClientProjection` | `app/desktop/session/diagnostics.ts` | 6893-6908 | 215-230 | ✅ `0d291cd8cbb2d6ad…` |
| `mirrorGovernanceFeedback` | `app/desktop/session/diagnostics.ts` | 6910-7053 | 232-375 | ✅ `29503ef47fe1e76b…` |
| `isNetworkOffline` | `app/desktop/session/diagnostics.ts` | 7560-7564 | 377-381 | ✅ `ab1c59ef340b8458…` |
| `applyNetworkState` | `app/desktop/session/diagnostics.ts` | 7566-7591 | 383-408 | ✅ `57de1cf07c812502…` |
| `watchdogSnapshot` | `app/desktop/session/diagnostics.ts` | 10303-10361 | 410-468 | ✅ `4512593cb5e950e0…` |
| `projectRootsWithActivity` | `app/desktop/session/diagnostics.ts` | 10363-10370 | 470-477 | ✅ `60c04f31d159d7f1…` |
| `lastTurnOf` | `app/desktop/session/diagnostics.ts` | 10372-10375 | 479-482 | ✅ `73fff6e0b84a678e…` |
| `watchdogDeliver` | `app/desktop/session/diagnostics.ts` | 10377-10423 | 484-530 | ✅ `1e59c8f022916ad0…` |
| `roleStatusText` | `app/desktop/session/diagnostics.ts` | 10876-10974 | 532-630 | ✅ `4e990ead8bfdafce…` |
| `diagnosticsTailText` | `app/desktop/session/diagnostics.ts` | 10976-11016 | 632-672 | ✅ `c01ee2491209bbe9…` |
| `sessionTailText` | `app/desktop/session/diagnostics.ts` | 11018-11065 | 674-721 | ✅ `b6c169c4e18f94ce…` |
| `installationEffectObservations` | `app/desktop/session/session-env.ts` | 475-477 | 99-101 | ✅ `d0d115f2b881f641…` |
| `refuseUnprovenInstallation` | `app/desktop/session/session-env.ts` | 478-493 | 103-118 | ✅ `3280f5969dc0fc8e…` |
| `boundaryDiff` | `app/desktop/session/session-env.ts` | 1417-1437 | 120-140 | ✅ `724ee4e4ee5a33ec…` |
| `currentSkillPaths` | `app/desktop/session/session-env.ts` | 1439-1468 | 142-171 | ✅ `635457af9219e871…` |
| `rebuildIfBoundaryStale` | `app/desktop/session/session-env.ts` | 1470-1499 | 173-202 | ✅ `118a49738def8475…` |
| `rebuildIfBoundaryStaleUnsafe` | `app/desktop/session/session-env.ts` | 1501-1552 | 204-255 | ✅ `0f138c445d23d56f…` |
| `queueRebuildWritePermitsNotice` | `app/desktop/session/session-env.ts` | 1554-1572 | 257-275 | ✅ `4645f2a37ae1c42b…` |
| `refreshStaleBoundaries` | `app/desktop/session/session-env.ts` | 1574-1592 | 277-295 | ✅ `2311867d20d8182f…` |
| `activateRoleRefresh` | `app/desktop/session/session-env.ts` | 10535-10557 | 297-319 | ✅ `b6aaf9e23efa3cee…` |
| `applySkillChange` | `app/desktop/session/session-env.ts` | 10559-10699 | 321-461 | ✅ `1a93583e088919ac…` |
| `applyMcpChange` | `app/desktop/session/session-env.ts` | 10710-10847 | 463-600 | ✅ `e654317be72ea0c7…` |
