// app/desktop/session/lifecycle/background.ts
// B7（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §5 B7、附录 A lifecycle 组）：3 个方法自 app/desktop/session.ts **逐字搬移**
// （含 JSDoc）：方法体零改动（仅声明行 `private ` 前缀移除——模块内 public 仅为门面委托可调用；
// 门面保留同名同签名同可见性的薄委托）。类外壳重建原 receiver 面：
//  · 本文件使用到的跨方法/跨模块调用以同名同签名薄包装指向 `LifecycleHost`（方法体文本保持
//    `this.<name>(...)` 原样；包装为运行期直转发，不加异步层）；
//  · 状态字段（方案 §3.6 的 11 个 lifecycle 字段）与只读引用经宿主访问器暴露（同一实例，无第二份状态）。
// 依赖规则（结构测试 R-c）：lifecycle（L6）只导入 L0（contracts/shared）与白名单下层。
import type { SessionEvent, RuntimeTurnOutcome, RuntimePersistenceChangeV1, ReportSaveResultV1, ReportSaveStateV1, DeliverySaveResultV1, DeliveryReceiptQueryV1, RuntimeDeliveryReceiptV1, RuntimeReportSnapshotV1, RuntimeLiveReportViewV1, RuntimeInputProvenanceV1, RuntimeLiveHandbackPresentationV1, GovernanceJudgeContext, BackgroundTaskSnapshot, BackgroundTaskReadOptions, BackgroundTaskReadResult, BackgroundTaskStopOptions, BackgroundTaskStopResult, NetworkGate, NetworkState, DocFormatFn, DocFormatInput } from "../../../../src/model/runtime.ts";
import { createDiagnosticLogger, getDiagnosticsStatus } from "../../../../src/common/shared/diagnostics.ts";
import { mainT } from "../../i18n.ts";
import { RUNTIME_KINDS, type RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type {
  DesktopOrchestrationEvent, SessionEventEnvelope, GovernanceClientProjectionV1, SessionOpenRequest,
  InternalSessionOpenRequest, ActiveRunView, EffectiveConfigInfo, SessionMessageMetadata, SessionTarget,
  OpenResult, SendResult, DeliveryQueuePersistenceOutcome, DeliveryQueuePersistenceFacts, StopResult,
  WithdrawResult, RebuildSessionResult, RedeliverResult, DeliveryAssignment, DeliveryOrigin,
  ActualDispatchSource, ControllerDisposalLease, LiveSession, ControllerResumeDelivery, DeliveryItem,
  PersistedDeliveryItemV1, DeliveryQueueRestoreReport, InstallationCapabilityTool,
  InstallationEffectRefusalObservation, DesktopSessionInventoryFact, DesktopRunStopFact,
  DesktopControllerStopFact, DesktopProjectExecutionInventory,
} from "../contracts/session-types.ts";
import type {
  BackgroundTaskView, BackgroundTasksListReply, BackgroundTaskReadInput, BackgroundTaskReadReply,
  BackgroundTaskStopInput, BackgroundTaskStopReply, TaskListView, TaskRestoreReport, TerminateRoleRunInput,
  TerminateRoleRunResult, RedispatchTaskInput, RedispatchTaskResult, CloseTaskInput, CloseTaskResult,
  NativeProjectRegistration,
} from "../contracts/tasks.ts";
import { sessionKey, targetKey, queueKey, type TargetKeyState } from "../shared/keys.ts";
import type { LifecycleHost } from "./host.ts";
import type { ObservedHandleRecord } from "./state.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";

export class LifecycleBackground {
  private readonly host: LifecycleHost;
  private readonly deps: SessionManagerDeps;
  constructor(host: LifecycleHost, deps: SessionManagerDeps) { this.host = host; this.deps = deps; }

  private get sessions(): Map<string, LiveSession> { return this.host.sessions; }
  private sessionKey(...args: Parameters<LifecycleHost["sessionKey"]>): ReturnType<LifecycleHost["sessionKey"]> { return this.host.sessionKey(...args); }

  // —— listBackgroundTasks（B7 自 session.ts 逐字搬移）——
  listBackgroundTasks(projectRoot: string, runtime: RuntimeKind): BackgroundTasksListReply {
    const tasks: BackgroundTaskView[] = [];
    let capable = 0;
    for (const entry of this.sessions.values()) {
      if (entry.projectRoot !== projectRoot || entry.runtime !== runtime) continue;
      const list = entry.handle.listBackgroundTasks;
      if (list === undefined) continue;
      capable += 1;
      try {
        for (const task of list.call(entry.handle)) {
          // 快照只读复制：加来源角色/引擎；不缓存、不跨会话记忆。
          tasks.push({ ...task, roleId: entry.roleId, runtime: entry.runtime });
        }
      } catch (error) {
        // 单会话读取异常不拖垮整个列表、也不伪造任务：如实记诊断，其余角色照常返回。
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: entry.roleId }).error(
          "background-tasks.list.failed",
          error,
          { runtime: entry.runtime },
        );
      }
    }
    return { ok: true, projectRoot, runtime, tasks, unavailable: capable === 0 };
  }

  // —— readBackgroundTask（B7 自 session.ts 逐字搬移）——
  readBackgroundTask(input: BackgroundTaskReadInput): BackgroundTaskReadReply {
    const entry = this.sessions.get(this.sessionKey(input.projectRoot, input.roleId, input.runtime));
    if (entry === undefined) {
      return { ok: false, error: mainT("main.session.releaseNoSession", { roleId: input.roleId }) };
    }
    const read = entry.handle.readBackgroundTask;
    if (read === undefined) {
      return { ok: false, error: mainT("main.backgroundTasks.unavailable") };
    }
    const options: BackgroundTaskReadOptions = {
      ...(input.stream !== undefined ? { stream: input.stream } : {}),
      ...(input.tailLines !== undefined ? { tailLines: input.tailLines } : {}),
    };
    const hasOptions = input.stream !== undefined || input.tailLines !== undefined;
    try {
      const result = read.call(entry.handle, input.taskId, hasOptions ? options : undefined);
      if (result === undefined) {
        // 未知/已过期任务：底层如实返回 undefined。本层不猜状态、不伪造日志，按失败回执。
        return { ok: false, error: mainT("main.backgroundTasks.unavailable") };
      }
      return { ok: true, result };
    } catch (error) {
      // 契约上 read 不抛；真抛了也如实回执（不静默、不伪造空结果）。
      createDiagnosticLogger({ component: "desktop.session", projectRoot: input.projectRoot, roleId: input.roleId }).error(
        "background-tasks.read.failed",
        error,
        { runtime: input.runtime, taskId: input.taskId },
      );
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // —— stopBackgroundTask（B7 自 session.ts 逐字搬移）——
  async stopBackgroundTask(input: BackgroundTaskStopInput): Promise<BackgroundTaskStopReply> {
    const entry = this.sessions.get(this.sessionKey(input.projectRoot, input.roleId, input.runtime));
    if (entry === undefined) {
      return { ok: false, reason: "closed", message: mainT("main.session.releaseNoSession", { roleId: input.roleId }) };
    }
    const stop = entry.handle.stopBackgroundTask;
    if (stop === undefined) {
      return { ok: false, reason: "unavailable", message: mainT("main.backgroundTasks.unavailable") };
    }
    const options: BackgroundTaskStopOptions | undefined = input.force === true ? { force: true } : undefined;
    try {
      return await stop.call(entry.handle, input.taskId, options);
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot: input.projectRoot, roleId: input.roleId }).error(
        "background-tasks.stop.failed",
        error,
        { runtime: input.runtime, taskId: input.taskId },
      );
      return { ok: false, reason: "unavailable", message: error instanceof Error ? error.message : String(error) };
    }
  }
}
