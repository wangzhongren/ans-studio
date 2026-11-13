# B5 搬出方法摘要（52 方法，逐字移动证明）

- 源：`git show HEAD:app/desktop/session.ts`（9970c3d = origin/main，含 B0–B4；9,118 行）
- 方法数：**52**（cards 43：cards.ts 21 / version-decisions.ts 17 / acceptance-facts.ts 5；run-change 9）
- 全部在记录化适配下逐字节相等：**true**；方法体 sha256 全部相等：**true**；门面薄委托全部存在：**true**
- 归一化（源与目标同规则）：（1）声明行 `private ` 前缀去掉（模块内 public，供门面委托调用；门面侧可见性逐字不变）；（2）`enrichAcceptanceJudgeContext` 的内联 `import("…src/model/runtime.ts")` 相对深度随模块目录调整（类型位置，同一模块）；（3）`ownedRunStopMembers` 局部 Map 键类型 `SessionManager` → `RunChangePeer`（编译期结构化视图，运行时同对象）。方法体其余文本（含 JSDoc）零改动。
- 定位注释（不参与方法体）：run-change 的 `ownedRunStopMembers`/`executeOwnedRunStop`/`resumeDeferredRunChanges` 声明前保留注明原 `private` 声明文本的注释行，供 chief-workflow 顺序钉按方法边界切片（钉子本身零改动）。

| 方法 | 模块 | HEAD 源行 | 目标行 | 归一化 sha256 相等 |
| --- | --- | --- | --- | --- |
| `interpretDirective` | `cards/cards.ts` | 1556-1620 | 185-249 | ✅ `4035389fb7a668da…` |
| `requestRequirementChangeDecision` | `cards/cards.ts` | 1701-1753 | 252-304 | ✅ `45d2838f18582107…` |
| `requestRunChangeDecision` | `cards/cards.ts` | 1755-1880 | 307-432 | ✅ `12526750d9c031c4…` |
| `pickGovernedCardEntry` | `cards/cards.ts` | 1884-1905 | 435-456 | ✅ `9d4494d5ba662359…` |
| `presentAppCard` | `cards/cards.ts` | 1907-1945 | 459-497 | ✅ `0d8b9394684cd76b…` |
| `presentVersionChangeCard` | `cards/cards.ts` | 1948-1963 | 500-515 | ✅ `3d8273982aef35da…` |
| `presentAmendmentItemCard` | `cards/cards.ts` | 1966-1985 | 518-537 | ✅ `3f6cdeeaad903f36…` |
| `presentStableWriteCard` | `cards/cards.ts` | 1988-2012 | 540-564 | ✅ `c0e506ef310c472d…` |
| `noteVersionChange` | `cards/cards.ts` | 2015-2023 | 567-575 | ✅ `ed34035ba5b96696…` |
| `noteVersionChangeInitiator` | `cards/cards.ts` | 2026-2033 | 578-585 | ✅ `1015e6b6f24c5462…` |
| `reportPlanEscalation` | `cards/cards.ts` | 2037-2085 | 588-636 | ✅ `af5c70bfd93cd889…` |
| `afterPlanEscalation` | `cards/cards.ts` | 2088-2153 | 639-704 | ✅ `516c505e821d5225…` |
| `activeRunViews` | `cards/cards.ts` | 2298-2320 | 707-729 | ✅ `8c1b4d11992e636e…` |
| `proposalCardFrozenRejection` | `cards/cards.ts` | 2322-2352 | 732-762 | ✅ `8263e0fa0ae7678e…` |
| `pendingVersionChangesFor` | `cards/cards.ts` | 2354-2378 | 765-789 | ✅ `59e38ba1854336c1…` |
| `offerRunChangeOnFrozenContract` | `cards/cards.ts` | 2380-2476 | 792-888 | ✅ `8d9f0c6dbe89b30f…` |
| `requestIdFor` | `cards/cards.ts` | 4306-4321 | 891-906 | ✅ `30c452b59531a13f…` |
| `notifyRequest` | `cards/cards.ts` | 4324-4358 | 909-943 | ✅ `6e4007c5be25a2c4…` |
| `recordRequestPresented` | `cards/cards.ts` | 4360-4366 | 946-952 | ✅ `ca5490a2afb16025…` |
| `appointmentWriteApplicationRejection` | `cards/cards.ts` | 4368-4491 | 955-1078 | ✅ `393b9a8d090a2557…` |
| `withRequestLifecycle` | `cards/cards.ts` | 4719-5113 | 1081-1475 | ✅ `6ef6266399047cfd…` |
| `versionDecisionSubjectKey` | `cards/version-decisions.ts` | 5142-5144 | 129-131 | ✅ `09a6da896c4cadef…` |
| `isVersionDecisionRequestIdForSubject` | `cards/version-decisions.ts` | 5147-5154 | 134-141 | ✅ `3b3b4c65af313667…` |
| `findPendingVersionDecision` | `cards/version-decisions.ts` | 5156-5170 | 144-158 | ✅ `d6a13e12e6fb5db9…` |
| `pendingRequestIdsForFlow` | `cards/version-decisions.ts` | 5172-5180 | 161-169 | ✅ `ca731af8f6c4eaf6…` |
| `countPriorVersionDecisions` | `cards/version-decisions.ts` | 5196-5204 | 172-180 | ✅ `9dd8f67be5163187…` |
| `buildVersionDecisionFacts` | `cards/version-decisions.ts` | 5206-5241 | 183-218 | ✅ `c6aa7be3094bc2ef…` |
| `versionDecisionCardLabels` | `cards/version-decisions.ts` | 5243-5262 | 221-240 | ✅ `93624d421a8b6936…` |
| `decidedByText` | `cards/version-decisions.ts` | 5264-5267 | 243-246 | ✅ `6b6f5424a07b116b…` |
| `formatTargetVersions` | `cards/version-decisions.ts` | 5269-5271 | 249-251 | ✅ `1beaef4e39080016…` |
| `stripVersionDecisionPrefix` | `cards/version-decisions.ts` | 5273-5275 | 254-256 | ✅ `64456152fe612c20…` |
| `nextVersionFlowId` | `cards/version-decisions.ts` | 5277-5293 | 259-275 | ✅ `037538175e166da4…` |
| `mapVersionDecisionRawOutcome` | `cards/version-decisions.ts` | 5295-5306 | 278-289 | ✅ `8d5ce11bf50b8dd8…` |
| `appendVersionDecisionAudit` | `cards/version-decisions.ts` | 5308-5310 | 292-294 | ✅ `96bfb7dacba41b66…` |
| `emitVersionDecisionResolved` | `cards/version-decisions.ts` | 5312-5319 | 297-304 | ✅ `e904c6fc233eb7f4…` |
| `requestVersionDecision` | `cards/version-decisions.ts` | 5321-5669 | 307-655 | ✅ `84e3d4314932a3bd…` |
| `restoreVersionDecisions` | `cards/version-decisions.ts` | 5671-5771 | 658-758 | ✅ `c14eb2e7e5ca621d…` |
| `restoreRequestState` | `cards/version-decisions.ts` | 5774-5830 | 761-817 | ✅ `a6278c5eb882fc7e…` |
| `enrichAcceptanceJudgeContext` | `cards/acceptance-facts.ts` | 4493-4717 | 53-277 | ✅ `850a505c0e2ff187…` |
| `afterStableWrite` | `cards/acceptance-facts.ts` | 2155-2185 | 280-310 | ✅ `df6a6c2ca635c7e5…` |
| `enrichAppointmentWriteBoundaryCard` | `cards/acceptance-facts.ts` | 2187-2233 | 313-359 | ✅ `72b3b555466ac555…` |
| `afterAppointmentWriteApproved` | `cards/acceptance-facts.ts` | 2235-2296 | 362-423 | ✅ `d65b65e8c1129cff…` |
| `countAcceptanceRejections` | `cards/acceptance-facts.ts` | 5182-5194 | 426-438 | ✅ `a5dc1b539333b32a…` |
| `runTaskIsFenced` | `run-change.ts` | 466-468 | 180-182 | ✅ `f8d96de8e34768b3…` |
| `selectRunChangeForHandle` | `run-change.ts` | 470-505 | 185-220 | ✅ `8f01a20159518bc7…` |
| `completeTeamPlanForHandle` | `run-change.ts` | 507-534 | 223-250 | ✅ `494f9ffe53900c40…` |
| `ownedRunStopMembers` | `run-change.ts` | 536-560 | 254-278 | ✅ `0b7f08817e836b12…` |
| `executeOwnedRunStop` | `run-change.ts` | 562-608 | 282-328 | ✅ `37cf8fdc9de46c1c…` |
| `resumeDeferredRunChanges` | `run-change.ts` | 610-624 | 332-346 | ✅ `0981220038f0cbc6…` |
| `executionInventoryFacts` | `run-change.ts` | 637-667 | 349-379 | ✅ `4003fd391ffe16c7…` |
| `controllerProducerFacts` | `run-change.ts` | 5882-5894 | 382-394 | ✅ `f09a66fe545c463d…` |
| `stopExactController` | `run-change.ts` | 5896-5991 | 397-492 | ✅ `96db2d1753143bac…` |
