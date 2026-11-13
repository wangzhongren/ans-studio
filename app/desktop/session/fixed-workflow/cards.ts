// app/desktop/session/fixed-workflow/cards.ts
// B6（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §5 B6、附录 A fixed-workflow 组）：固定卡请求/裁决/阶段推进 + fixed 收口/复核/回交子任务
// 账本校验（L5，feature 白名单 card-gateway/evidence/run-change/git-ports）。
// 6 个类方法（prepareFixedAppointmentCardRequest/recordFixedCardWorkflowResolution/
// completeTeamPlanFixedForHandle/closeCreatedTaskFixedForSession/verifyFixedReviewCloseBasis/
// inspectFixedHandbackChild）自 app/desktop/session.ts **逐字搬移**（含 JSDoc）：方法体零改动；类外壳重建
// 原 receiver 面——
//  · 跨簇状态（sessions/lastGovernanceRuntime）经共享 `FixedWorkflowRefs` 显式传入**同一实例**；
//  · Evidence 实例经 refs 直接调用（白名单 L1）；Git baseline 端口经 `git-ports.ts`；
//    autoPresentFixedReleaseMerge 经同模块 `FixedWorkflowRelease` 实例（L5 内部拆分）；
//  · 尚未迁出的门面方法（drainAllQueuesFor）经 `FixedWorkflowPorts` 箭头回调注入，运行期调用；
//  · 已迁出的 shared 方法经同名同义委托 → shared/*。
// **T3 B31/B34 轻量验收 close 门语义逐字保留**（verifyFixedReviewCloseBasis 先于证据/收口；drift/缺失
// fail-closed 原样透传）。
// 可见性 private → 模块内 public 仅为门面委托可调用（不进入公开导出面）。

import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import { readTaskState, type TaskReplay } from "../../../../src/common/编排/task-state.ts";
import type { TaskHandback } from "../../../../src/common/编排/handback.ts";
import {
  appendWorkflowEvent,
  closeTask as closeFixedWorkflowTask,
  completeTeamPlanFixed,
  finalizeIntent as finalizeFixedIntent,
  inspectAssignedTask as inspectWorkflowAssignedTask,
  readWorkflowLedger,
  verifyBasisForStage,
  type CompleteTeamPlanFixedResult,
  type FixedCloseCreatedTaskToolInput,
  type WorkflowServiceFailure,
} from "../../../../src/common/编排/workflow-service.ts";
import { canCompleteStage, deriveWorkflowView } from "../../../../src/common/编排/workflow-state.ts";
import { loadLatestRoster as loadLatestWorkflowRoster } from "../../../../src/common/编排/workflow-preconditions.ts";
import type { CompleteTeamPlanFn, CustomerInputRequest, TaskStateEvent, WorkflowDocumentRef, WorkflowEvent } from "../../../../src/model/runtime.ts";
import { WORKFLOW_LEDGER_SCHEMA } from "../../../../src/model/runtime.ts";
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { RoleSessionHandle } from "../../../../src/pipeline/orchestration/run-role.ts";
import { isFixedReleaseTriggerStage, type FixedReleaseTriggerStage } from "../../workflow.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";
import type { LiveSession } from "../contracts/session-types.ts";
import { createDesktopBaselineGitPort } from "../git-ports.ts";
import { now } from "../shared/clock.ts";
import { sessionKey } from "../shared/keys.ts";
import { emitDeliveryNote } from "../shared/notifier.ts";
import { readTasks } from "../shared/tasks-store.ts";
import type { FixedWorkflowPorts, FixedWorkflowRefs } from "./route.ts";
import type { FixedWorkflowRelease } from "./release-merge.ts";

/** 固定卡请求/裁决/阶段推进 + fixed 收口/复核/回交子任务校验（原 SessionManager 6 方法的同签名实现）。 */
export class FixedWorkflowCards {
  private readonly refs: FixedWorkflowRefs;
  private readonly port: FixedWorkflowPorts;
  private readonly release: FixedWorkflowRelease;
  private readonly deps: SessionManagerDeps;
  constructor(refs: FixedWorkflowRefs, port: FixedWorkflowPorts, release: FixedWorkflowRelease, deps: SessionManagerDeps) {
    this.refs = refs;
    this.port = port;
    this.release = release;
    this.deps = deps;
  }

  /* 跨模块状态（同一实例；延迟取值）。 */
  private get sessions(): ReadonlyMap<string, LiveSession> { return this.refs.sessions; }
  private get lastGovernanceRuntime(): ReadonlyMap<string, RuntimeKind> { return this.refs.lastGovernanceRuntime; }

  /* L0 共享函数（同名同义委托；与门面委托同一实现、同一入参）。 */
  private now(): number { return now(this.deps); }
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string {
    return sessionKey(projectRoot, roleId, runtime);
  }
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }
  private async readTasks(projectRoot: string): Promise<TaskReplay> {
    return readTasks(projectRoot);
  }

  /* 已迁出模块实例（白名单下层；运行时同一对象）。 */
  private buildFixedCloseEvidence(projectRoot: string, taskId: string, note: string | undefined): ReturnType<FixedWorkflowRefs["evidence"]["buildFixedCloseEvidence"]> {
    return this.refs.evidence.buildFixedCloseEvidence(projectRoot, taskId, note);
  }
  private autoPresentFixedReleaseMerge(input: {
    projectRoot: string;
    workflowId: string;
    stage: FixedReleaseTriggerStage;
    taskId: string;
  }): ReturnType<FixedWorkflowRelease["autoPresentFixedReleaseMerge"]> {
    return this.release.autoPresentFixedReleaseMerge(input);
  }

  /* 尚未迁出的门面方法端口（运行期调用；参数逐位原样转发、返回原样返回）。 */
  private drainAllQueuesFor(projectRoot: string): Promise<void> {
    return this.port.drainAllQueuesFor(projectRoot);
  }

  // —— inspectFixedHandbackChild（B6 自 session.ts 逐字搬移）——
  /**
   * T3 B8.2（2026-11-11，RR3/B8.1 披露）：fixed 子任务回交到运营（convener）的**账本校验**。
   * 只认 tasks 账本 + workflows 账本事实（**不调用** legacy `resolveDeliveryAssignment`——后者要求
   * child `parentTaskRef`/run，会把 fixed 生产任务的回交误判 `delivery-child-source-invalid`）：
   * child 真实存在且带 `workflowId`、回交角色 = 受派人、创建者 = 回交目标、workflow 存在且未关闭。
   * 任一项不满足 ⇒ 不可投递（调用方 fail-closed 诊断，不误投）。
   *
   * T3 B11.1（2026-11-11，RR6 根因「已封口 child 的回交仍排队并反复阻塞」）：child **已收口**
   * （`record.closed !== undefined`）是**可判定的终态**，不是「不可核验」——返回 `ok:true, closed:true`，
   * 由调用方丢弃该回交成员并继续 drain（不投递、不阻塞后续回交；也不伪造 task.delivered/report）。
   * 其余校验（存在性/角色/创建者/flowId/workflow 账本）逐字不变。
   */
  async inspectFixedHandbackChild(
    projectRoot: string,
    handback: TaskHandback,
    recipientRoleId: string,
    expectedFlowId: string | undefined,
  ): Promise<{ ok: true; taskId: string; workflowId: string; closed: boolean } | { ok: false; message: string }> {
    const taskId = typeof handback.taskId === "string" ? handback.taskId.trim() : "";
    if (taskId === "") return { ok: false, message: "回交缺少任务 id（无法按任务账本核对）" };
    const state = await this.readTasks(projectRoot);
    const record = state.records.get(taskId);
    if (record?.created === undefined) {
      return { ok: false, message: `任务 ${taskId} 不在 tasks 账本（无 task.created）` };
    }
    const created = record.created;
    if (typeof created.workflowId !== "string" || created.workflowId === "") {
      return { ok: false, message: `任务 ${taskId} 未绑定 workflowId（非 fixed 任务）` };
    }
    const roleId = typeof handback.roleId === "string" ? handback.roleId.trim() : "";
    if (created.to !== roleId) {
      return { ok: false, message: `回交角色 ${roleId === "" ? "（空）" : roleId} 与任务 ${taskId} 的受派人 ${created.to} 不一致` };
    }
    if (created.from !== recipientRoleId) {
      return { ok: false, message: `任务 ${taskId} 的创建者 ${created.from} 不是回交目标 ${recipientRoleId}` };
    }
    if (expectedFlowId !== undefined && expectedFlowId !== "" && created.flowId !== expectedFlowId) {
      return { ok: false, message: `任务 ${taskId} 的 flow（${created.flowId ?? "（无）"}）与投递条目（${expectedFlowId}）不一致` };
    }
    if (record.closed !== undefined) {
      // T3 B11.1（RR6）：已收口固定子任务 = 可判定终态（丢弃该回交成员），不得误判为「不可投递」反复阻塞队列。
      return { ok: true, taskId, workflowId: created.workflowId, closed: true };
    }
    const ledger = await readWorkflowLedger(projectRoot);
    const scoped = ledger.events.filter((event) => event.workflowId === created.workflowId);
    if (scoped.length === 0) {
      return { ok: false, message: `任务 ${taskId} 的 workflow ${created.workflowId} 在账本不存在` };
    }
    const view = deriveWorkflowView(scoped, state.events);
    if (view.blocked?.code === "workflow-corrupt") {
      return { ok: false, message: `任务 ${taskId} 的 workflow 账本损坏：${view.blocked.summary}` };
    }
    if (view.closed !== undefined) {
      return { ok: false, message: `任务 ${taskId} 的 workflow ${created.workflowId} 已关闭（${view.closed.outcome}）` };
    }
    return { ok: true, taskId, workflowId: created.workflowId, closed: false };
  }
  // —— completeTeamPlanFixedForHandle（B6 自 session.ts 逐字搬移）——
  /**
   * fixed `complete_team_plan` v4（A9）桌面适配：可信身份由宿主绑定（projectRoot / actorRoleId=convener /
   * 当前真实受派任务的 workflowId）；模型只给 `{operationId,flowId,plan}`。
   * 真实 Git 由 `BaselineGitPort` 执行；B29（2026-11-11，RR22/RR25/RR26）：成功与失败都**原样返回 fixed
   * 服务形状**——成功 `{ok:true,operationId,flowId,workflowId,basisId,plan,documents,replay,
   * stageCompleted}`，失败 `{ok:false,code,message}`（含桌面级前置 blocked）。工具层按入参形状
   * （workflowId+plan）路由 B25 `fixedCompleteTeamPlanReceiptResult`；**不再套 legacy
   * `DirectActionReceipt`**（其成功回执要求 `targetDigest` 为 64-hex，`bas-…` basisId 永远不合形 ⇒
   * 回执恒被降级为「结果未知或回执不完整」）。失败不弹客户卡。
   */
  async completeTeamPlanFixedForHandle(
    projectRoot: string,
    runtime: RuntimeKind,
    handle: RoleSessionHandle | undefined,
    request: Parameters<CompleteTeamPlanFn>[0],
    signal?: AbortSignal,
  ): Promise<CompleteTeamPlanFixedResult> {
    const blocked = (code: string, message: string): CompleteTeamPlanFixedResult => ({ ok: false, code, message });
    const key = this.sessionKey(projectRoot, "convener", runtime);
    const entry = this.sessions.get(key);
    const origin = entry?.origins.running;
    const current = (): boolean => !!entry && !!origin && entry.handle === handle && this.sessions.get(key) === entry
      && entry.origins.running === origin && entry.busy && !origin.settled
      && !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted;
    if (!current() || !origin?.taskId || signal?.aborted) {
      return blocked("plan-task-unavailable", "缺少当前真实受派运营回合或任务，未登记团队计划。");
    }
    const assigned = await inspectWorkflowAssignedTask({ projectRoot, actorRoleId: "convener", taskId: origin.taskId });
    if (!assigned.ok) return blocked(assigned.code, assigned.message ?? assigned.code);
    if (assigned.task.flowId !== request.flowId) {
      return blocked("plan-flow-conflict", "团队计划 flow 与实际受派任务不一致，未登记团队计划。");
    }
    if (assigned.task.workflowId === undefined) {
      return blocked("plan-task-unavailable", "fixed A9 需要受派任务绑定 workflowId（应用绑定，不采信模型自报）。");
    }
    if (!current() || signal?.aborted) {
      return blocked("plan-task-changed", "核验期间真实受派回合已变化，未登记团队计划。");
    }
    const completed = await completeTeamPlanFixed({
      projectRoot,
      flowId: request.flowId,
      workflowId: assigned.task.workflowId,
      operationId: request.operationId,
      plan: request.plan,
      port: createDesktopBaselineGitPort(),
      actorRoleId: "convener",
      ...(request.runId !== undefined ? { runId: request.runId } : {}),
      ...(request.baseDigest !== undefined ? { baseDigest: request.baseDigest } : {}),
    });
    // B29：成功/失败都**原样返回 fixed 服务形状**——成功 `{ok:true,operationId,flowId,workflowId,
    // basisId,plan,documents,replay,stageCompleted}`；失败 `{ok:false,code,message[,missing]}`。
    // 不再包装成 legacy `DirectActionReceipt`（工具层 B25 校验要求 fixed 形状；包装后的 `bas-…`
    // targetDigest 永远不被 legacy 64-hex 校验接受，回执恒被降级为「结果未知」）。
    return completed;
  }
  // —— closeCreatedTaskFixedForSession（B6 自 session.ts 逐字搬移）——
  /**
   * fixed `close_created_task` v2 桌面适配：身份（projectRoot/actorRoleId）由 run-role 绑定；
   * **应用补证据**（绝不模型自报）：报告证据文件 path+sha256、A11/B3 分支 tip OID、
   * A12b 验收归档（应用 `archiveAcceptance` 生成；失败 ⇒ `acceptance-archive-failed` 阻塞 A12）。
   */
  async closeCreatedTaskFixedForSession(
    projectRoot: string,
    actorRoleId: string,
    input: FixedCloseCreatedTaskToolInput,
    signal?: AbortSignal,
  ): Promise<Awaited<ReturnType<typeof closeFixedWorkflowTask>>> {
    if (signal?.aborted) {
      return { ok: false, code: "close-task-invalid", message: "本轮已中止，未执行收口。" };
    }
    // T3 B2.1（AC-19/T-08；MF-B2-02）：fixed verifier 的 A12a/A12b accepted 收口（criteria/report
    // 收口，含 A12b 应用验收归档）前 basis drift 复核——A12a/A12b 为 chief→verifier 直派，
    // 不经 convener 派发 basis 门。drift/缺失 ⇒ `basis-drift`/`basis-missing` fail-closed：
    // 拒绝收口/完成（不写 task.closed、不生成归档、不伪造 verified）；一致 ⇒ 按节流入账 basis.verified。
    const basisGate = await this.verifyFixedReviewCloseBasis(projectRoot, input);
    if (!basisGate.ok) return basisGate;
    const evidence = input.outcome === "accepted"
      ? await this.buildFixedCloseEvidence(projectRoot, input.taskId, input.note)
      : { ok: true as const, evidence: undefined };
    if (!evidence.ok) return evidence;
    const closed = await closeFixedWorkflowTask({
      projectRoot,
      actorRoleId,
      operationId: input.operationId,
      taskId: input.taskId,
      outcome: input.outcome,
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(evidence.evidence !== undefined ? { evidence: evidence.evidence } : {}),
    });
    if (closed.ok) {
      void this.drainAllQueuesFor(projectRoot);
      // T3 B3.1（AC-11/AC-14/AC-22；MF-IR-8）：fixed **A12b accepted（A13 前）/ B3 accepted（B4 前）**
      // ⇒ 应用自动调用 `prepareReleaseMerge` 并呈 merge-main 客户卡（不新增工具/客户门）。
      // 异步执行：收口工具立即返回；前置不满足 ⇒ 只回运营/幕僚（不弹注定失败卡）；同一 workflow/tip 幂等。
      if (input.outcome === "accepted" && closed.stageCompleted && isFixedReleaseTriggerStage(closed.stage)
        && closed.workflowId !== undefined) {
        const triggerStage: FixedReleaseTriggerStage = closed.stage;
        const triggerWorkflowId = closed.workflowId;
        void this.autoPresentFixedReleaseMerge({
          projectRoot,
          workflowId: triggerWorkflowId,
          stage: triggerStage,
          taskId: input.taskId,
        }).catch((error: unknown) => {
          createDiagnosticLogger({ component: "desktop.workflow", projectRoot }).error(
            "workflow.release.auto-present.unhandled",
            error,
            { workflowId: triggerWorkflowId, stage: triggerStage },
          );
        });
      }
    }
    return closed;
  }
  // —— verifyFixedReviewCloseBasis（B6 自 session.ts 逐字搬移）——
  /**
   * T3 B2.1（AC-19/T-08；MF-B2-02）：A12a/A12b accepted 收口前 basis 复核（`verifyBasisForStage`）。
   * - 只对真实任务的 fixed A12a/A12b 收口生效（按 `task.created` 的 workflowId/stage 判定，不认自报）；
   * - 仅 `accepted` 收口会触发阶段完成/归档 ⇒ 只在 accepted 时复核（rework/rejected 不推进完成）；
   * - 同 operationId 已收口的重试交给 `closeTask` 原样 replay（不在 replay 上重复复核）；
   * - 服务返回 `basis-drift`/`basis-missing` 等原样透传：拒绝收口/完成，如实回报（不伪造 verified）。
   */
  async verifyFixedReviewCloseBasis(
    projectRoot: string,
    input: FixedCloseCreatedTaskToolInput,
  ): Promise<{ ok: true } | WorkflowServiceFailure> {
    if (input.outcome !== "accepted") return { ok: true };
    const state = await readTaskState(projectRoot);
    const record = state.records.get(input.taskId);
    const created = record?.created;
    if (created === undefined || created.workflowId === undefined || created.stage === undefined) {
      return { ok: true }; // 非 fixed 任务/形状不全：交给 closeTask 的既有校验如实失败
    }
    if (created.stage !== "A12a" && created.stage !== "A12b") return { ok: true };
    if (record?.closed?.operationId === input.operationId) return { ok: true }; // closeTask replay 语义
    const basis = await verifyBasisForStage({
      projectRoot,
      workflowId: created.workflowId,
      stage: created.stage,
    });
    if (!basis.ok) return basis;
    return { ok: true };
  }
  // —— prepareFixedAppointmentCardRequest（B6 自 session.ts 逐字搬移）——
  /**
   * 固定任命卡（A10；v1.3 §8.3）：选项**必须恰为**最新名单角色（多选）、推荐集 = 名单顺序（应用生成、
   * 不采信模型自报）；不满足 ⇒ `appointment-invalid`（不发卡）。返回规范化后的请求 + roster 引用。
   */
  async prepareFixedAppointmentCardRequest(
    projectRoot: string,
    flowId: string,
    request: CustomerInputRequest,
  ): Promise<
    | { ok: true; request: CustomerInputRequest; rosterRef: WorkflowDocumentRef }
    | WorkflowServiceFailure
  > {
    if (request.kind !== "choice") {
      return { ok: false, code: "appointment-invalid", message: "任命卡必须是 choice 卡（多选名单角色）；未发卡。" };
    }
    const roster = await loadLatestWorkflowRoster({ projectRoot, flowId });
    if (!roster.ok) {
      return { ok: false, code: "appointment-roster-mismatch", message: `任命卡前置不满足：${roster.reason}（未发卡）。` };
    }
    const rosterIds = roster.roster.roles.map((role) => role.id);
    const optionIds = request.options.map((option) => option.id);
    const sameSet = optionIds.length === rosterIds.length
      && rosterIds.every((id) => optionIds.includes(id))
      && optionIds.every((id) => rosterIds.includes(id));
    if (request.multiple !== true || !sameSet) {
      return {
        ok: false,
        code: "appointment-invalid",
        message: "任命卡选项必须恰为最新名单角色且 multiple=true（不得发明名单外选项）；未发卡。",
      };
    }
    return {
      ok: true,
      request: {
        ...request,
        options: roster.roster.roles.map((role) => ({ id: role.id, label: role.displayName, recommended: true })),
      },
      rosterRef: { kind: "roster", path: roster.path, sha256: roster.sha256, version: roster.roster.version },
    };
  }
  // —— recordFixedCardWorkflowResolution（B6 自 session.ts 逐字搬移）——
  /**
   * fixed 卡裁决 → 工作流阶段事件（AC-08/§4.5；应用唯一实现）：
   * - intent-confirm：`confirm` ⇒ 编排 `finalizeIntent`（校验 docs/intents 入口 + hash 后 `stage.completed A3`）；
   *   `revise` ⇒ `stage.reworked A2`（reworkOf A3，attempt+1）；其他不动。
   * - proposal：`accept` ⇒ `stage.completed A6`（artifacts=documentRefs）；`revise` ⇒ `stage.reworked A5`；
   *   `reject`/拒绝 ⇒ `stage.blocked A6`（proposal-rejected）。
   * - appointment：客户选定（`targetRoleIds` 非空）⇒ `stage.completed A10`（A10 仅任命确认，不派实现）。
   * 不重写 `request.resolved`；失败只诊断 + 系统行，不阻塞已完成的客户决定、不猜。
   */
  async recordFixedCardWorkflowResolution(input: {
    projectRoot: string;
    sourceRoleId: string;
    flowId: string;
    workflowId: string;
    requestId: string;
    resolvedEvent: Extract<TaskStateEvent, { kind: "request.resolved" }>;
    answered: boolean;
    judged: boolean;
    documentRefs: readonly WorkflowDocumentRef[];
  }): Promise<void> {
    const noteFailure = (code: string, message: string): void => {
      createDiagnosticLogger({ component: "desktop.workflow", projectRoot: input.projectRoot, roleId: input.sourceRoleId })
        .record("workflow.card.stage-event.failed", { workflowId: input.workflowId, requestId: input.requestId, errorCode: code, errorMessage: message });
      this.emitDeliveryNote(
        input.projectRoot,
        this.lastGovernanceRuntime.get(input.projectRoot) ?? "pi",
        input.sourceRoleId,
        input.sourceRoleId,
        `[工作流] ${input.requestId} 的阶段事件未写入（${code}）：${message}（客户决定已保存；请运营/幕僚核对后重试）`,
      );
    };
    try {
      const ledger = await readWorkflowLedger(input.projectRoot);
      const wfEvents = ledger.events.filter((event) => event.workflowId === input.workflowId);
      if (wfEvents.length === 0) return;
      const view = deriveWorkflowView(wfEvents, (await readTaskState(input.projectRoot)).events);
      if (view.closed !== undefined) return;
      const choice = input.resolvedEvent.choice;
      const cardKind = input.resolvedEvent.cardKind;
      const at = new Date(this.now()).toISOString();
      const append = async (event: WorkflowEvent): Promise<void> => {
        const appended = await appendWorkflowEvent(input.projectRoot, event);
        if (!appended.ok) noteFailure("workflow-ledger-write-failed", appended.message);
      };
      if (cardKind === "intent-confirm") {
        if (choice === "confirm") {
          const finalized = await finalizeFixedIntent({
            projectRoot: input.projectRoot,
            event: input.resolvedEvent,
            workflowId: input.workflowId,
            flowId: input.flowId,
          });
          if (!finalized.ok) noteFailure(finalized.code, finalized.message);
          return;
        }
        if (choice === "revise" && view.stage === "A3") {
          const attempt = Math.max(1, view.stages.A2.attempt ?? 1) + 1;
          await append({
            v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.reworked",
            workflowId: input.workflowId, flowId: view.flowId, path: view.path,
            idempotencyKey: `stage-rework:${input.workflowId}:A2:${attempt}`,
            stage: "A2", reworkOf: "A3", reason: `intent revise（${input.requestId}）`, attempt,
          });
        }
        return;
      }
      if (cardKind === "proposal") {
        if (!input.answered || input.judged) return;
        if (choice.includes("accept") && !choice.includes("reject") && view.stage === "A6") {
          if (!canCompleteStage(view, "A6")) return;
          await append({
            v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.completed",
            workflowId: input.workflowId, flowId: view.flowId, path: view.path,
            idempotencyKey: `stage-complete:${input.workflowId}:A6:${input.requestId}`,
            stage: "A6",
            cause: { kind: "request-resolved", ref: input.requestId },
            artifacts: input.documentRefs.map((ref) => ({
              path: ref.path,
              ...(ref.sha256 !== undefined ? { sha256: ref.sha256 } : {}),
              ...(ref.kind !== undefined ? { kind: ref.kind } : {}),
            })),
          });
          return;
        }
        if (choice === "revise" && view.stage === "A6") {
          const attempt = Math.max(1, view.stages.A5.attempt ?? 1) + 1;
          await append({
            v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.reworked",
            workflowId: input.workflowId, flowId: view.flowId, path: view.path,
            idempotencyKey: `stage-rework:${input.workflowId}:A5:${attempt}`,
            stage: "A5", reworkOf: "A6", reason: `proposal revise（${input.requestId}）`, attempt,
          });
          return;
        }
        if ((choice.includes("reject") || !input.answered) && view.stage === "A6" && view.stages.A6.status !== "completed") {
          await append({
            v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.blocked",
            workflowId: input.workflowId, flowId: view.flowId, path: view.path,
            idempotencyKey: `stage-block:${input.workflowId}:A6:${Math.max(1, view.stages.A6.attempt ?? 1)}:proposal-rejected`,
            stage: "A6", code: "proposal-rejected",
            summary: input.resolvedEvent.reason ?? `方案卡被拒绝（${input.requestId}）`,
            attempt: Math.max(1, view.stages.A6.attempt ?? 1),
          });
        }
        return;
      }
      if (cardKind === "appointment") {
        const targets = input.resolvedEvent.targetRoleIds ?? [];
        if (!input.answered || input.judged || targets.length === 0) return;
        if (view.stage !== "A10" || view.stages.A10.status === "completed" || !canCompleteStage(view, "A10")) return;
        await append({
          v: 1, at, schema: WORKFLOW_LEDGER_SCHEMA, kind: "stage.completed",
          workflowId: input.workflowId, flowId: view.flowId, path: view.path,
          idempotencyKey: `stage-complete:${input.workflowId}:A10:${input.requestId}`,
          stage: "A10",
          cause: { kind: "appointment-confirmed", ref: input.requestId },
          artifacts: [],
        });
      }
    } catch (error) {
      noteFailure("workflow-card-stage-event-error", error instanceof Error ? error.message : String(error));
    }
  }
}
