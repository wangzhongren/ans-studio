# B6 moved methods — normalization evidence

- Source: `git show HEAD:app/desktop/session.ts` (b5901ac)
- Methods: 26 (handback 4 + helper 1 / dispatch 5 / fixed-workflow 16)
- allMethodsIdenticalUnderDocumentedAdaptations = **true**
- allMethodBodiesIdentical = **true**
- allFacadeDelegationsPresent = **true**

| method | group | source lines | target | targets lines | normalized sha equal | body sha equal | facade delegate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| displayHandback | handback | 4049-4052 | app/desktop/session/handback.ts | 133-136 | YES | YES | YES |
| handbackFlowId | handback | 4074-4085 | app/desktop/session/handback.ts | 138-149 | YES | YES | YES |
| isTaskHandbackShape | handback | 4087-4104 | app/desktop/session/handback.ts | 151-168 | YES | YES | n/a（内部 helper，仅随 handback 方法搬移） |
| handleHandback | handback | 4106-4119 | app/desktop/session/handback.ts | 170-183 | YES | YES | YES |
| commitHandback | handback | 4121-4329 | app/desktop/session/handback.ts | 185-393 | YES | YES | YES |
| routeDispatch | dispatch | 4331-4578 | app/desktop/session/dispatch.ts | 178-425 | YES | YES | YES |
| chainDispatchFacts | dispatch | 4580-4735 | app/desktop/session/dispatch.ts | 427-582 | YES | YES | YES |
| captureChiefDispatchSource | dispatch | 4737-4761 | app/desktop/session/dispatch.ts | 584-608 | YES | YES | YES |
| resumeChiefController | dispatch | 4763-4801 | app/desktop/session/dispatch.ts | 610-648 | YES | YES | YES |
| routeStarDispatch | dispatch | 4803-5450 | app/desktop/session/dispatch.ts | 650-1297 | YES | YES | YES |
| routeFixedPathDispatch | fixedWorkflowRoute | 5452-5961 | app/desktop/session/fixed-workflow/route.ts | 149-658 | YES | YES | YES |
| ensurePathBStartForDispatch | fixedWorkflowRoute | 6309-6330 | app/desktop/session/fixed-workflow/route.ts | 660-681 | YES | YES | YES |
| checkPathBWriteSetForDispatch | fixedWorkflowRoute | 6332-6377 | app/desktop/session/fixed-workflow/route.ts | 683-728 | YES | YES | YES |
| inspectFixedHandbackChild | fixedWorkflowCards | 3485-3541 | app/desktop/session/fixed-workflow/cards.ts | 98-154 | YES | YES | YES |
| completeTeamPlanFixedForHandle | fixedWorkflowCards | 5970-6024 | app/desktop/session/fixed-workflow/cards.ts | 156-210 | YES | YES | YES |
| closeCreatedTaskFixedForSession | fixedWorkflowCards | 6026-6083 | app/desktop/session/fixed-workflow/cards.ts | 212-269 | YES | YES | YES |
| verifyFixedReviewCloseBasis | fixedWorkflowCards | 6085-6112 | app/desktop/session/fixed-workflow/cards.ts | 271-298 | YES | YES | YES |
| prepareFixedAppointmentCardRequest | fixedWorkflowCards | 6143-6182 | app/desktop/session/fixed-workflow/cards.ts | 300-339 | YES | YES | YES |
| recordFixedCardWorkflowResolution | fixedWorkflowCards | 6184-6306 | app/desktop/session/fixed-workflow/cards.ts | 341-463 | YES | YES | YES |
| presentMergeMainCard | fixedWorkflowRelease | 6380-6404 | app/desktop/session/fixed-workflow/release-merge.ts | 78-102 | YES | YES | YES |
| runFixedReleaseMerge | fixedWorkflowRelease | 6406-6449 | app/desktop/session/fixed-workflow/release-merge.ts | 104-147 | YES | YES | YES |
| settleMergeMainCard | fixedWorkflowRelease | 6451-6541 | app/desktop/session/fixed-workflow/release-merge.ts | 149-239 | YES | YES | YES |
| autoPresentFixedReleaseMerge | fixedWorkflowRelease | 6543-6650 | app/desktop/session/fixed-workflow/release-merge.ts | 241-348 | YES | YES | YES |
| noteFixedReleaseAutoTrigger | fixedWorkflowRelease | 6663-6672 | app/desktop/session/fixed-workflow/release-merge.ts | 350-359 | YES | YES | YES |
| fixedPanelState | fixedWorkflowPanel | 6674-6738 | app/desktop/session/fixed-workflow/panel.ts | 18-82 | YES | YES | YES |
| dispatchAdvisorySummary | fixedWorkflowPanel | 6741-6746 | app/desktop/session/fixed-workflow/panel.ts | 84-89 | YES | YES | YES |

Adaptations (only these; all other text byte-identical):
- visibility: `private ` declaration prefix removed in module (facade keeps exact visibility/signature).
- `routeStarDispatch`: `ReturnType<SessionManager["captureChiefDispatchSource"]>` → `ReturnType<Dispatch["captureChiefDispatchSource"]>` (type-only self-view; L4 cannot import facade class).
- `routeDispatch`: `return this.routeStarDispatch(` → `return this.port.routeStarDispatch(` (facade trampoline preserves instance-level override semantics; production path identical).
