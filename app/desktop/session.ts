// app/desktop/session.ts
// B7（2026-11-13，session.ts 重构）第二段：barrel（公开入口）。SessionManager 门面已整体迁入
// ./session/index.ts；本文件只做显式再导出——51 导出面（值 6 + 类型 45）与既有导入路径逐字不变。
// operator-channel.test.ts pin7（装配选项形状只读导入自编排、不另立第二形状；类型导入运行期擦除）：
// 该字面行须留在 barrel——模块内同 import 为 `../../../../src/...`，pin7 逐字要求两级相对路径。
import type { AssembleOperatorShellGateOptions, AssembleReadonlyShellGateOptions, RoutineShellPolicy } from "../../src/pipeline/orchestration/shell-arming.ts";
export { SessionManager, MAX_LIVE_SESSIONS } from "./session/index.ts";
export { shouldSuppressStarTaskReport } from "./session/shared/text.ts";
export { desktopProjectExecutionInventory, subscribeDesktopExecutionInventory } from "./session/shared/inventory.ts";
export { CAPABILITY_INSTALL_SYSTEM_PREFIX } from "./session/session-env.ts";
export type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
export type { RunChangeMode } from "../../src/common/编排/run-manifest.ts";
export type {
  DesktopOrchestrationEvent, SessionEventEnvelope, GovernanceClientProjectionV1, SessionOpenRequest,
  ActiveRunView, EffectiveConfigInfo, SessionMessageMetadata, SessionTarget, OpenResult, SendResult,
  DeliveryQueuePersistenceOutcome, DeliveryQueuePersistenceFacts, StopResult, WithdrawResult,
  RebuildSessionResult, RedeliverResult, PersistedDeliveryItemV1, DeliveryQueueRestoreReport,
  InstallationCapabilityTool, InstallationEffectRefusalObservation, DesktopSessionInventoryFact,
  DesktopProjectExecutionInventory,
} from "./session/contracts/session-types.ts";
export type {
  PersistenceScope, PersistenceReply, PersistenceCapabilities, PersistenceValues, PersistenceUpdated,
} from "./session/contracts/persistence.ts";
export type {
  BackgroundTaskView, BackgroundTasksListReply, BackgroundTaskReadInput, BackgroundTaskReadReply,
  BackgroundTaskStopInput, BackgroundTaskStopReply, TaskListView, TaskRestoreReport, TerminateRoleRunInput,
  TerminateRoleRunResult, RedispatchTaskInput, RedispatchTaskResult, CloseTaskInput, CloseTaskResult,
  NativeProjectRegistration,
} from "./session/contracts/tasks.ts";
export type { SessionManagerDeps } from "./session/contracts/deps.ts";
