// app/desktop/session/fixed-workflow/stage-dispatch.ts
// 2026-11-17（app-dispatch/v1 第一步，桌面窗口）：**应用侧阶段投递桥与驱动钩子**（L5，fixed-workflow 模块内）。
//
// 依据：docs/planning/2026-11-17_design_app-dispatch-builtins.md §三/§4.3/§五/§七；
// 角色卡/编排/docs/change/2026-11-17_change_app-dispatch-builtins-foundation.md §二（API 面）/§六；
// 协调者任务「stage 投递桥与驱动钩子」。
//
// 职责（只做应用接线，单一实现仍在编排 workflow-service）：
//  · 应用创建的任务（from:"application"）登记 starTaskIds/taskCreators（application）、写角色活动、
//    以 taskId+forcedWorkflowMode:"fixed" 打开目标会话（复用 route.ts 的 open/delivery/enqueue 口径）并投递；
//    投递失败**保留任务待恢复**（不写伪报告、不伪造投递成功；由 reconcile 重试）。
//  · `task.reported` 观察：stage-execution 交由编排 `observeAppDispatchTaskReport` 收口/推进；
//    A12b 由应用先补归档证据（`buildFixedCloseEvidence`）再收口（accepted 同时写 A12 聚合）；
//    A12b 标准验收 blocked ⇒ 显式 `decision:"rework"`（A12b→A11）；A13/B4 报告完成后**不**直接完成阶段
//    （release-or-close 只能由 merge-main/关闭完成）——关闭汇总任务后呈 merge-main 卡。
//  · 卡裁决后：关闭 card-prompt 任务并驱动下一阶段（A3/A6/A10 的阶段事件仍由既有
//    `recordFixedCardWorkflowResolution`/`finalizeIntent` 写；本模块只做收口+推进）。
//  · worker-dispatch 收口（Q6）：运营对应用创建的 worker-dispatch 任务调用 close_created_task 时，
//    由应用以真实创建者身份写 `task.closed(by:"application")`（不写阶段事件；阶段完成只按完成条件）。
//  · B1 完成后的 B2 范围决定（Q4）：应用按 B1 报告 + 名单/边界**确定性派生** `change.scope-decided`
//    （编排 `recordChangeScopeDecision`）；证据不足 ⇒ `b-change-scope-invalid` 阻塞（不猜）。
//  · 启动/打开项目对账：只处理 app-dispatch/v1 活动 workflow；驱动补建/补投递幂等修复。
//
// 纪律：固定-v2.1/legacy workflow **一律跳过**（Q10 在飞不迁移，旧驱动逐字保留）；不采信模型自报
// （身份/报告/证据全部来自账本与应用计算）；不新增第二份状态（唯一事实源仍是 workflows/tasks 账本）。
// 依赖规则（结构测试 R-c）：L5 fixed-workflow 只可导入 L0、card-gateway、evidence、run-change、git-ports。

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import { appendTaskEvent, readTaskState, renderTaskCardLines, shortenSummary, taskCardOf, taskEvent, type TaskRecord, type TaskReplay } from "../../../../src/common/编排/task-state.ts";
import { deriveWorkflowView } from "../../../../src/common/编排/workflow-state.ts";
import {
  closeTask as closeFixedWorkflowTask,
  driveAppDispatchStage,
  observeAppDispatchTaskReport,
  readWorkflowLedger,
  reconcileFixedWorkflow,
  recordChangeScopeDecision,
  selectWorkflow,
  type DriveAppDispatchStageReceipt,
  type ReconcileFixedWorkflowReceipt,
  type WorkflowServiceFailure,
} from "../../../../src/common/编排/workflow-service.ts";
import { getWorkflowDefinition } from "../../../../src/common/编排/workflow-definitions.ts";
import { WORKFLOW_PROTOCOL_APP_DISPATCH } from "../../../../src/model/runtime.ts";
import type { RequestCreatedEvent, TaskStateEvent, WorkflowEvent, WorkflowStage } from "../../../../src/model/runtime.ts";
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { SelectWorkflowToolResult } from "../../../../src/provider/runtime/tools.ts";
import { workflowProtocolForWorkflowId } from "../../workflow.ts";
import type { OpenResult } from "../contracts/session-types.ts";
import { now } from "../shared/clock.ts";
import { sessionKey } from "../shared/keys.ts";
import { emitDeliveryNote } from "../shared/notifier.ts";
import { appendRoleActivity, readTasks, taskCreators } from "../shared/tasks-store.ts";
import { filePrint, shortenText } from "../shared/text.ts";
import { extractDispatchReadPaths, planDispatchDelivery } from "../../../../src/common/编排/handback.ts";
// 2026-11-20（block resolver 桌面批）：app-dispatch 事实出口（receipt.blockFact / reconcile.blockFacts /
// 服务拒绝）→ 桌面 block router（只观察，不改阶段语义）。
import { blockFactFromServiceFailure, type BlockFact } from "../../../../src/common/编排/block-resolution.ts";
import { readBlockLedger, replayBlockLifecycles } from "../../../../src/common/编排/block-ledger.ts";
import type { BlockRouter } from "../../block-router.ts";
import type { FixedWorkflowPorts, FixedWorkflowRefs } from "./route.ts";
import type { FixedWorkflowRelease } from "./release-merge.ts";

/** 投递结果（失败保留待恢复；不伪造投递）。 */
export interface AppDispatchDeliveryReport {
  delivered: string[];
  failed: { taskId: string; reason: string }[];
}

/** 对账摘要（启动/打开项目时；只统计 app-dispatch/v1）。 */
export interface AppDispatchReconcileSummary {
  activeWorkflows: number;
  service?: ReconcileFixedWorkflowReceipt;
  delivered: string[];
  corrupt: string[];
  errors: string[];
}

/** 应用侧卡 prompt 的呈现事实（cards 模块经 Evidence 解析后传入本模块推进）。 */
export interface AppDispatchCardResolvedInput {
  projectRoot: string;
  workflowId: string;
  stage: WorkflowStage;
  promptId: string;
  requestId: string;
  /** 卡是否已真实结算（answered/declined）；`false`（unavailable/超时）⇒ 不关闭 prompt、不推进。 */
  resolved: boolean;
}

/** 应用任务收口（worker-dispatch，Q6）：运营以真实创建者身份收口应用任务（不写阶段事件）。 */
export interface CloseApplicationTaskInput {
  projectRoot: string;
  taskId: string;
  outcome: "accepted" | "rework" | "rejected";
  operationId: string;
  note?: string;
  now?: () => Date;
}

/**
 * 2026-11-17（app-dispatch/v1）：应用创建的请求任务（worker-dispatch）直接收口——
 * 写 `task.closed(by:"application")`（`DIRECT_ACTION_ACTORS["close-created-task"]` 已含 application），
 * **不写阶段事件**（阶段完成只按完成条件由 worker 任务收口/聚合判定）。幂等：同 operationId replay。
 * 返回 `{ok,replay}` 或稳定失败码（形状与 `WorkflowServiceFailure` 兼容）。
 */
export async function closeApplicationTaskDirect(
  input: CloseApplicationTaskInput,
): Promise<{ ok: true; replay: boolean } | WorkflowServiceFailure> {
  const now = input.now ?? (() => new Date());
  const state = await readTaskState(input.projectRoot);
  const record = state.records.get(input.taskId);
  const created = record?.created;
  if (created === undefined) return { ok: false, code: "close-task-invalid", message: `任务 ${input.taskId} 不存在。` };
  if (created.from !== "application") {
    return { ok: false, code: "close-identity-invalid", message: `任务 ${input.taskId} 不是应用创建的任务（from=${String(created.from)}）。` };
  }
  if (record?.closed !== undefined) {
    return record.closed.operationId === input.operationId
      ? { ok: true, replay: true }
      : { ok: false, code: "close-task-invalid", message: `任务 ${input.taskId} 已被收口（${record.closed.outcome}），不得重复收口。` };
  }
  const at = now().toISOString();
  const eventId = `event-${createHash("sha256").update(`${input.operationId}|${input.taskId}`).digest("hex").slice(0, 24)}`;
  const targetDigest = createHash("sha256").update(`${created.workflowId ?? ""}|${input.taskId}|${input.outcome}|${input.operationId}`).digest("hex");
  const closed: TaskStateEvent = {
    v: 1,
    at,
    kind: "task.closed",
    taskId: input.taskId,
    by: "application",
    outcome: input.outcome,
    ...(input.note !== undefined ? { note: input.note } : {}),
    operationId: input.operationId,
    eventId,
    actionSource: {
      kind: "role-direct",
      actorRoleId: "application",
      action: "close-created-task",
      operationId: input.operationId,
      applicationId: "ans-app-dispatch",
      baseDigest: null,
      targetDigest,
      at,
    },
  };
  const appended = await appendTaskEvent(input.projectRoot, closed);
  if (!appended.ok) return { ok: false, code: appended.code ?? "close-task-invalid", message: `task.closed 写入失败：${appended.message}` };
  return { ok: true, replay: false };
}

/** 应用侧阶段投递桥与驱动钩子（门面构造注入；运行期调用，无第二份状态）。 */
export class FixedWorkflowStageDispatch {
  private readonly refs: FixedWorkflowRefs;
  private readonly port: FixedWorkflowPorts;
  private readonly release: FixedWorkflowRelease;
  private readonly deps: import("../contracts/deps.ts").SessionManagerDeps;
  /** 2026-11-20（block resolver 桌面批）：block 事实汇（缺省 ⇒ 只诊断，不路由——测试/旧宿主零变化）。 */
  private readonly blockRouter: Pick<BlockRouter, "observeFactLater" | "observeFactListLater"> | undefined;
  constructor(
    refs: FixedWorkflowRefs,
    port: FixedWorkflowPorts,
    release: FixedWorkflowRelease,
    deps: import("../contracts/deps.ts").SessionManagerDeps,
    blockRouter?: Pick<BlockRouter, "observeFactLater" | "observeFactListLater">,
  ) {
    this.refs = refs;
    this.port = port;
    this.release = release;
    this.deps = deps;
    this.blockRouter = blockRouter;
  }

  /* —— L0 同名同义委托（与门面委托同一实现、同一入参） —— */
  private now(): number { return now(this.deps); }
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string { return sessionKey(projectRoot, roleId, runtime); }
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }
  private async readTasks(projectRoot: string): Promise<TaskReplay> { return readTasks(projectRoot); }
  private appendRoleActivity(projectRoot: string, roleId: string, input: { kind: string; summary: string; status?: string; taskId?: string; ref?: string }): Promise<void> {
    return appendRoleActivity(projectRoot, roleId, input, { lastRoleActivity: this.refs.lastRoleActivity, now: () => this.now() });
  }
  private diagnostics(projectRoot: string) {
    return createDiagnosticLogger({ component: "desktop.workflow", projectRoot });
  }
  private runtimeFor(projectRoot: string, roleId: string): RuntimeKind {
    return this.port.findLiveRuntime(projectRoot, roleId) ?? this.refs.lastGovernanceRuntime.get(projectRoot) ?? "pi";
  }
  private async isAppDispatch(projectRoot: string, workflowId: string): Promise<boolean> {
    return (await workflowProtocolForWorkflowId(projectRoot, workflowId)) === WORKFLOW_PROTOCOL_APP_DISPATCH;
  }

  /** 2026-11-20（block resolver 桌面批）：服务事实 → router（只观察；错误码/消息原样）。 */
  private noteServiceBlock(
    projectRoot: string,
    code: string,
    message: string,
    extra: {
      workflowId?: string;
      flowId?: string;
      stage?: WorkflowStage;
      taskId?: string;
      requestId?: string;
      detailCode?: string;
      engineCanRepair?: boolean;
      ownerRoleId?: string;
      fingerprintMaterial?: readonly string[];
    } = {},
  ): void {
    this.blockRouter?.observeFactLater(projectRoot, blockFactFromServiceFailure({
      protocol: WORKFLOW_PROTOCOL_APP_DISPATCH,
      code,
      message,
      source: "desktop.stage-dispatch",
      ...extra,
    }));
  }

  // —————————————— 投递桥 ——————————————

  /**
   * 投递应用创建的任务（逐任务）：登记创建者（application）/星形任务/角色活动，打开目标会话
   * （taskId + forcedWorkflowMode:"fixed"；忙时只入队，不打断）并投递。
   * 失败（打开失败/投递判据拒绝）⇒ **保留任务待恢复**：只记诊断 + 系统行，不写 `task.reported`、
   * 不伪造投递成功（由 reconcile/下一次驱动重试）。已投递或已有报告的任务跳过（幂等）。
   */
  async deliverTaskIds(projectRoot: string, fallbackRuntime: RuntimeKind, taskIds: readonly string[]): Promise<AppDispatchDeliveryReport> {
    const report: AppDispatchDeliveryReport = { delivered: [], failed: [] };
    if (taskIds.length === 0) return report;
    const state = await this.readTasks(projectRoot);
    for (const taskId of taskIds) {
      const record = state.records.get(taskId);
      const created = record?.created;
      if (record === undefined || created === undefined) {
        this.diagnostics(projectRoot).record("app-dispatch.deliver.task-missing", { taskId });
        this.noteServiceBlock(projectRoot, "workflow-corrupt", `应用任务 ${taskId} 在账本不存在（投递桥不猜）`, {
          fingerprintMaterial: ["deliver-task-missing", taskId],
        });
        report.failed.push({ taskId, reason: "task-not-found" });
        continue;
      }
      if (created.from !== "application") {
        this.diagnostics(projectRoot).record("app-dispatch.deliver.creator-invalid", { taskId, from: String(created.from) });
        this.noteServiceBlock(projectRoot, "workflow-corrupt", `任务 ${taskId} 不是应用创建（from=${String(created.from)}）`, {
          ...(created.workflowId !== undefined ? { workflowId: created.workflowId } : {}),
          taskId,
          fingerprintMaterial: ["deliver-creator-invalid", taskId],
        });
        report.failed.push({ taskId, reason: "creator-not-application" });
        continue;
      }
      this.refs.starTaskIds.add(taskId);
      taskCreators.set(taskId, "application");
      if (record.closed !== undefined) continue; // 已收口：不再投递
      if (record.delivered !== undefined || record.reports.length > 0) continue; // 已送达/已报告：幂等跳过
      const targetRoleId = created.to;
      let runtime = this.port.findLiveRuntime(projectRoot, targetRoleId) ?? fallbackRuntime;
      const key = this.sessionKey(projectRoot, targetRoleId, runtime);
      const existing = this.refs.sessions.get(key);
      const existingFixed = existing !== undefined && existing.projectRoot === projectRoot && existing.sessionWorkflowMode === "fixed";
      const bound = existingFixed && existing.assignedTaskId === taskId;
      const busy = existing !== undefined && (existing.busy || existing.origins.running !== undefined);
      if (existingFixed && busy && !bound) {
        // 2026-11-20（SMOKE-1 seams）：目标 fixed 会话忙 ⇒ 正常入队等待，不打断。持续 target-busy
        // 由 block router 的 card-prompt 停摆扫描（T_stall）升为 B5 事实并做有界重投/升级。
        this.diagnostics(projectRoot).record("app-dispatch.deliver.target-busy", {
          taskId,
          roleId: targetRoleId,
          taskKind: created.taskKind ?? "stage-execution",
          ...(created.workflowId !== undefined ? { workflowId: created.workflowId } : {}),
          ...(created.stage !== undefined ? { stage: created.stage } : {}),
        });
      }
      if (!bound && !(existingFixed && busy)) {
        const opened: OpenResult = await this.port.openInternal(
          { projectRoot, roleId: targetRoleId, runtime, taskId, forcedWorkflowMode: "fixed" },
          false,
        );
        if (!opened.ok) {
          this.diagnostics(projectRoot).record("app-dispatch.deliver.open-failed", { taskId, roleId: targetRoleId, reasonCode: "delivery-target-open-failed" });
          this.noteServiceBlock(projectRoot, "session-open-failed", `应用任务 ${taskId} 投递未完成：${opened.error ?? "目标会话打开失败"}`, {
            ...(created.workflowId !== undefined ? { workflowId: created.workflowId } : {}),
            ...(created.stage !== undefined ? { stage: created.stage } : {}),
            taskId,
            ...(created.promptId !== undefined ? { requestId: created.promptId } : {}),
            engineCanRepair: true,
            fingerprintMaterial: ["deliver-open-failed", taskId],
          });
          this.emitDeliveryNote(projectRoot, runtime, targetRoleId, targetRoleId,
            `[应用·任务] #${taskId} 投递未完成（任务保留待恢复）：${shortenSummary(opened.error ?? "目标会话打开失败", 160)}`);
          report.failed.push({ taskId, reason: opened.error ?? "open-failed" });
          continue;
        }
        runtime = this.refs.sessions.get(this.sessionKey(projectRoot, targetRoleId, runtime))?.runtime ?? runtime;
      }
      // 投递判据（契约引用缺失 ⇒ 拒投；与既有派发同一单一来源）。应用任务文本自足，失败只保留待恢复。
      const probes = new Map<string, string | undefined>();
      for (const readPath of extractDispatchReadPaths(created.text)) {
        probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
      }
      const plan = planDispatchDelivery(
        { roleId: targetRoleId, task: created.text },
        probes,
        {
          sourceRoleId: "application",
          taskId,
          ...(created.expectedOutput !== undefined ? { expectedOutput: created.expectedOutput } : {}),
          ...(created.requestedEvidence !== undefined ? { requestedEvidence: created.requestedEvidence } : {}),
        },
      );
      if (plan.action === "reject") {
        this.diagnostics(projectRoot).record("app-dispatch.deliver.rejected", { taskId, reasonCode: "delivery-rejected" });
        this.noteServiceBlock(projectRoot, "delivery-failed", `应用任务 ${taskId} 投递被拒：${plan.message}`, {
          ...(created.workflowId !== undefined ? { workflowId: created.workflowId } : {}),
          ...(created.stage !== undefined ? { stage: created.stage } : {}),
          taskId,
          ...(created.promptId !== undefined ? { requestId: created.promptId } : {}),
          engineCanRepair: true,
          fingerprintMaterial: ["deliver-rejected", taskId, plan.message],
        });
        this.emitDeliveryNote(projectRoot, runtime, targetRoleId, targetRoleId,
          `[应用·任务] #${taskId} 投递被拒（任务保留待恢复）：${shortenSummary(plan.message, 160)}`);
        report.failed.push({ taskId, reason: plan.message });
        continue;
      }
      const dedupKey = `${projectRoot}\u0000${runtime}\u0000task\u0000${taskId}`;
      this.port.enqueueDelivery(projectRoot, targetRoleId, {
        kind: "dispatch",
        runtime,
        targetRoleId,
        sourceRoleId: "application",
        taskId,
        text: plan.text,
        summary: `[任务·应用] #${taskId} → ${targetRoleId}：${shortenText(created.text, 40)}`,
        dedupKey,
        clientMessageId: this.port.appDispatchClientMessageId(dedupKey),
      });
      void this.appendRoleActivity(projectRoot, targetRoleId, {
        kind: "task.delivered",
        summary: `收到应用任务 #${taskId}（${created.taskKind ?? "stage-execution"}；workflow ${created.workflowId ?? "-"}）`,
        status: "delivered",
        taskId,
      });
      const card = taskCardOf(record);
      if (card !== undefined) this.emitDeliveryNote(projectRoot, runtime, targetRoleId, targetRoleId, renderTaskCardLines(card).join("；"));
      void this.port.drainQueue(projectRoot, targetRoleId, runtime);
      report.delivered.push(taskId);
    }
    return report;
  }

  // —————————————— SMOKE-1 seams：确定性重投 / card-prompt orphan 重呈现 ——————————————

  /**
   * 2026-11-20（SMOKE-1 seams）：确定性重投一个应用任务（block router 引擎动作 / 恢复路径）。
   * - **同 taskId、同幂等键**：已收口/已报告 ⇒ no-op；已在队列/在途 ⇒ 不重复入队；
   * - card-prompt 且请求为 `request.orphaned`（重启）⇒ 以**同 requestId** 追加一次 `request.created`
   *   重呈现（不新开卡），再重投同一 prompt 任务；
   * - orphan 属 superseded / 流程已关 ⇒ 按实际语义收口 prompt 任务（不重呈现、不误判）；
   * - 失败如实返回（任务保留待恢复，不伪造投递）。
   */
  async redeliverAppTask(projectRoot: string, taskId: string): Promise<{ ok: boolean; note: string; reEntry?: string }> {
    const state = await this.readTasks(projectRoot);
    const record = state.records.get(taskId);
    const created = record?.created;
    if (record === undefined || created === undefined) return { ok: false, note: `任务 ${taskId} 不存在（不猜、不重投）` };
    if (created.from !== "application") return { ok: false, note: `任务 ${taskId} 不是应用创建（不重投）` };
    if (record.closed !== undefined || record.reports.length > 0) {
      return { ok: true, note: `任务 ${taskId} 已收口/已报告；无需重投（幂等）`, reEntry: `redeliver:${taskId}:settled` };
    }
    if (created.taskKind === "card-prompt" && created.promptId !== undefined) {
      const represented = await this.representOrphanedCardRequest(projectRoot, record.taskId, created.promptId);
      if (!represented.ok) return represented;
      if (represented.kind === "settled" || represented.kind === "superseded" || represented.kind === "visible") {
        return { ok: true, note: represented.note, reEntry: `redeliver:${taskId}:${represented.kind}` };
      }
    }
    const targetRoleId = created.to;
    let runtime = this.port.findLiveRuntime(projectRoot, targetRoleId) ?? this.refs.lastGovernanceRuntime.get(projectRoot) ?? "pi";
    const existing = this.refs.sessions.get(this.sessionKey(projectRoot, targetRoleId, runtime));
    const existingFixed = existing !== undefined && existing.projectRoot === projectRoot && existing.sessionWorkflowMode === "fixed";
    const bound = existingFixed && existing.assignedTaskId === taskId;
    const busy = existing !== undefined && (existing.busy || existing.origins.running !== undefined);
    if (!bound && !(existingFixed && busy)) {
      const opened = await this.port.openInternal(
        { projectRoot, roleId: targetRoleId, runtime, taskId, forcedWorkflowMode: "fixed" },
        false,
      );
      if (!opened.ok) {
        return { ok: false, note: `重投未完成：${opened.error ?? "目标会话打开失败"}（任务保留待恢复，不伪造投递）` };
      }
      runtime = this.refs.sessions.get(this.sessionKey(projectRoot, targetRoleId, runtime))?.runtime ?? runtime;
    }
    const dedupKey = `${projectRoot}\u0000${runtime}\u0000task\u0000${taskId}`;
    const clientMessageId = this.port.appDispatchClientMessageId(dedupKey);
    const pending = this.port.pendingAppTaskDelivery?.(projectRoot, targetRoleId, runtime, clientMessageId);
    if (pending !== undefined) {
      return {
        ok: true,
        note: `任务 ${taskId} 已在${pending.queued ? "投递队列" : "投递中"}（同 taskId 幂等，不重复入队）`,
        reEntry: `redeliver:${taskId}:queued`,
      };
    }
    const probes = new Map<string, string | undefined>();
    for (const readPath of extractDispatchReadPaths(created.text)) {
      probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
    }
    const plan = planDispatchDelivery(
      { roleId: targetRoleId, task: created.text },
      probes,
      {
        sourceRoleId: "application",
        taskId,
        ...(created.expectedOutput !== undefined ? { expectedOutput: created.expectedOutput } : {}),
        ...(created.requestedEvidence !== undefined ? { requestedEvidence: created.requestedEvidence } : {}),
      },
    );
    if (plan.action === "reject") {
      return { ok: false, note: `重投被拒：${plan.message}（任务保留待恢复，不伪造投递）` };
    }
    this.refs.starTaskIds.add(taskId);
    taskCreators.set(taskId, "application");
    this.port.enqueueDelivery(projectRoot, targetRoleId, {
      kind: "dispatch",
      runtime,
      targetRoleId,
      sourceRoleId: "application",
      taskId,
      text: plan.text,
      summary: `[任务·重投] #${taskId} → ${targetRoleId}：${shortenText(created.text, 40)}`,
      dedupKey,
      clientMessageId,
    });
    void this.appendRoleActivity(projectRoot, targetRoleId, {
      kind: "task.redelivered",
      summary: `重新入队应用任务 #${taskId}（${created.taskKind ?? "stage-execution"}${created.promptId !== undefined ? `；prompt ${created.promptId}` : ""}）`,
      status: "queued",
      taskId,
    });
    void this.port.drainQueue(projectRoot, targetRoleId, runtime);
    return {
      ok: true,
      note: `任务 ${taskId} 已重新入队（目标 ${targetRoleId}${busy && existingFixed ? "，忙时等待其空闲" : ""}；同 taskId 幂等）`,
      reEntry: `redeliver:${taskId}`,
    };
  }

  /**
   * orphan card-prompt 请求的重呈现（同 requestId；内容逐项来自原应用 `request.created` 事实）。
   * 返回 `waiting`（无需重呈现）/`visible`（已呈卡等待客户，不重投）/
   * `represented`（已追加重呈现）/`settled`（已裁决收口）/
   * `superseded`（被取代或流程已关，按实际语义收口）。多 request.created 的“最后一条为准”
   * 语义由 requestViewOf / project-state 派生保持一致。
   */
  private async representOrphanedCardRequest(
    projectRoot: string,
    taskId: string,
    requestId: string,
  ): Promise<
    | { ok: true; kind: "waiting" | "represented" | "settled" | "superseded" | "visible"; note: string }
    | { ok: false; note: string }
  > {
    const state = await this.readTasks(projectRoot);
    const view = requestViewOf(state.events, requestId);
    if (view === undefined || view.created === undefined) {
      return { ok: false, note: `card-prompt 请求 ${requestId} 缺少 request.created（账本不一致；不猜、不伪造卡）` };
    }
    const created = view.created;
    const workflowId = created.workflowId;
    if (workflowId === undefined || created.stage === undefined) {
      return { ok: false, note: `card-prompt 请求 ${requestId} 缺 workflowId/stage（账本不一致）` };
    }
    if (!(await this.isAppDispatch(projectRoot, workflowId))) {
      return { ok: true, kind: "waiting", note: `请求 ${requestId} 不属于 app-dispatch/v1；不重呈现` };
    }
    const operationId = `app-card-prompt-close:${workflowId}:${created.stage}:${requestId}`;
    if (view.last === "resolved") {
      const closed = await closeApplicationTaskDirect({
        projectRoot, taskId, outcome: "accepted", operationId,
        note: `card prompt ${requestId} 已裁决；恢复收口`,
      });
      if (!closed.ok) return { ok: false, note: `请求已裁决但 prompt 任务收口失败：${closed.code}：${closed.message}` };
      return { ok: true, kind: "settled", note: `请求 ${requestId} 已裁决；prompt 任务已收口（不重呈现）` };
    }
    if (view.last === "presented") {
      return { ok: true, kind: "visible", note: `请求 ${requestId} 已呈卡等待客户；不重投、不重弹` };
    }
    if (view.last !== "orphaned" || view.orphaned === undefined) {
      return { ok: true, kind: "waiting", note: `请求 ${requestId} 当前可见等待（无需重呈现）` };
    }
    const ledger = await readWorkflowLedger(projectRoot);
    const wfView = deriveWorkflowView(
      ledger.events.filter((event) => event.workflowId === workflowId),
      state.events,
    );
    const supersededReason = view.orphaned.reason === "superseded"
      ? "superseded"
      : wfView.closed !== undefined
        ? `workflow-closed:${wfView.closed.outcome}`
        : wfView.stopping === true
          ? "workflow-stopping"
          : wfView.stage !== created.stage
            ? `stage-moved:${created.stage}->${wfView.stage}`
            : undefined;
    if (supersededReason !== undefined) {
      const closed = await closeApplicationTaskDirect({
        projectRoot, taskId, outcome: "rejected", operationId,
        note: `card prompt ${requestId} orphaned(${supersededReason})；按实际语义收口（不重呈现、不重弹新卡）`,
      });
      if (!closed.ok) return { ok: false, note: `superseded 请求 ${requestId} 的 prompt 任务收口失败：${closed.code}：${closed.message}` };
      return { ok: true, kind: "superseded", note: `请求 ${requestId} 已被取代/流程已关（${supersededReason}）；prompt 任务按实际语义收口（不重弹新卡）` };
    }
    // 同 requestId 重呈现：追加新的 request.created（内容逐项复制原应用事实；不采信模型自报）。
    const represented = taskEvent("request.created", {
      requestId,
      ...(created.flowId !== undefined ? { flowId: created.flowId } : {}),
      ...(created.cardKind !== undefined ? { cardKind: created.cardKind } : {}),
      ...(created.intentId !== undefined ? { intentId: created.intentId } : {}),
      ...(created.taskId !== undefined ? { taskId: created.taskId } : {}),
      ...(created.documentRefs !== undefined ? { documentRefs: created.documentRefs.map((ref) => ({ ...ref })) } : {}),
      ...(created.workflowId !== undefined ? { workflowId: created.workflowId } : {}),
      ...(created.stage !== undefined ? { stage: created.stage } : {}),
      ...(created.promptId !== undefined ? { promptId: created.promptId } : {}),
      sourceRoleId: created.sourceRoleId,
      title: created.title,
      ...(created.context !== undefined ? { context: created.context } : {}),
      options: created.options.map((option) => ({ ...option })),
      ...(created.recommended !== undefined ? { recommended: [...created.recommended] } : {}),
    }, () => new Date(this.now()));
    const appended = await appendTaskEvent(projectRoot, represented);
    if (!appended.ok) return { ok: false, note: `请求 ${requestId} 重呈现写入失败：${appended.message}` };
    this.diagnostics(projectRoot).record("app-dispatch.card.orphan-represented", {
      workflowId, stage: created.stage, requestId, taskId, orphanReason: view.orphaned.reason ?? null,
    });
    return { ok: true, kind: "represented", note: `请求 ${requestId} 已按同 requestId 重新呈现（不新开卡）；任务 ${taskId} 将重新投递` };
  }

  /**
   * 2026-11-20（SMOKE-1 seams）：card-prompt 投递/orphan 停摆扫描（只读账本，返回 block 事实）：
   * 1. `request.orphaned`（restart，且流程仍在该阶段）⇒ `card-prompt-orphaned`（detailCode=reconcile ⇒
   *    engine-auto-fix 同 requestId 重呈现/重投）；superseded/流程已关按实际语义**收口任务**（不造块）；
   * 2. 未送达超过 T_stall（target busy/会话打开失败/投递排队）⇒ `target-busy`（B5；引擎有界重投，
   *    **每 T_stall 窗口最多一轮**，达到 `maxAutoFixAttempts` 后同码事实带 `autoFixForbidden` ⇒ 升级属主/客户）；
   * 3. 已送达但超过 T_stall 仍未呈卡（request 仍 created）⇒ `card-prompt-stalled`（属主修复）。
   */
  async scanAppCardPromptFacts(
    projectRoot: string,
    options: { stallMs: number; maxAutoFixAttempts: number },
  ): Promise<readonly BlockFact[]> {
    const facts: BlockFact[] = [];
    const state = await this.readTasks(projectRoot);
    const nowMs = this.now();
    const workflowViews = new Map<string, ReturnType<typeof deriveWorkflowView>>();
    const stallMin = Math.max(1, Math.floor(options.stallMs / 60000));
    // 2026-11-20（SMOKE-1 seams）：target-busy 的引擎重投**有界**——按 blocks 账本已结算的
    // 同码/同 task 轮次计数与最后结算时刻，每 T_stall 窗口最多重投一轮；达到上限后升级属主。
    const engineRounds = new Map<string, { count: number; lastAtMs: number }>();
    const blockLedger = await readBlockLedger(projectRoot);
    for (const lifecycle of replayBlockLifecycles(blockLedger.events).records.values()) {
      if (lifecycle.resolution !== "fixed" || lifecycle.code !== "target-busy") continue;
      if (lifecycle.protocol !== WORKFLOW_PROTOCOL_APP_DISPATCH || lifecycle.taskId === undefined) continue;
      const atMs = Date.parse(lifecycle.updatedAt);
      const entry = engineRounds.get(lifecycle.taskId) ?? { count: 0, lastAtMs: 0 };
      entry.count += 1;
      entry.lastAtMs = Math.max(entry.lastAtMs, Number.isFinite(atMs) ? atMs : 0);
      engineRounds.set(lifecycle.taskId, entry);
    }
    for (const record of state.records.values()) {
      const created = record.created;
      if (created === undefined) continue;
      if (created.from !== "application" || created.taskKind !== "card-prompt") continue;
      if (record.closed !== undefined || record.reports.length > 0) continue;
      const workflowId = created.workflowId;
      const stage = created.stage;
      const promptId = created.promptId;
      if (workflowId === undefined || stage === undefined || promptId === undefined) continue;
      if (!(await this.isAppDispatch(projectRoot, workflowId))) continue;
      let wfView = workflowViews.get(workflowId);
      if (wfView === undefined) {
        const ledger = await readWorkflowLedger(projectRoot);
        wfView = deriveWorkflowView(
          ledger.events.filter((event) => event.workflowId === workflowId),
          state.events,
        );
        workflowViews.set(workflowId, wfView);
      }
      const requestView = requestViewOf(state.events, promptId);
      if (requestView?.last === "resolved") continue; // 已裁决：收口由 afterCardResolved/恢复处理
      if (requestView === undefined || requestView.created === undefined) {
        facts.push({
          protocol: WORKFLOW_PROTOCOL_APP_DISPATCH,
          kind: "service-rejection",
          code: "workflow-corrupt",
          detailCode: "reconcile",
          source: "desktop.stage-dispatch.card-scan",
          workflowId,
          flowId: wfView.flowId,
          stage,
          taskId: record.taskId,
          requestId: promptId,
          engineCanRepair: true,
          summary: `card-prompt 任务 ${record.taskId} 缺少 request.created（promptId=${promptId}）；账本不一致（不猜、交引擎对账）。`,
          fingerprintMaterial: ["card-prompt-request-missing", workflowId, stage, record.taskId],
        });
        continue;
      }
      if (requestView.last === "orphaned" && requestView.orphaned !== undefined) {
        const superseded = requestView.orphaned.reason === "superseded"
          || wfView.closed !== undefined
          || wfView.stopping === true
          || wfView.stage !== stage;
        if (superseded) {
          // 实际语义：请求被取代/流程已关 ⇒ 应用收口 prompt 任务（不重投、不误判、不造块）。
          const closed = await closeApplicationTaskDirect({
            projectRoot,
            taskId: record.taskId,
            outcome: "rejected",
            operationId: `app-card-prompt-close:${workflowId}:${stage}:${promptId}`,
            note: `card prompt ${promptId} orphaned(${requestView.orphaned.reason ?? "?"})；按实际语义收口（不重呈现）`,
          });
          if (!closed.ok) {
            this.diagnostics(projectRoot).record("app-dispatch.card.orphan-close.failed", { taskId: record.taskId, reasonCode: closed.code });
          }
          continue;
        }
        facts.push({
          protocol: WORKFLOW_PROTOCOL_APP_DISPATCH,
          kind: "service-rejection",
          code: "card-prompt-orphaned",
          detailCode: "reconcile",
          source: "desktop.stage-dispatch.card-scan",
          workflowId,
          flowId: wfView.flowId,
          stage,
          taskId: record.taskId,
          requestId: promptId,
          engineCanRepair: true,
          summary: `card-prompt 请求 ${promptId} 重启后被标记 orphaned（${requestView.orphaned.at}）；应用以同 requestId 重呈现/重投（不新开卡）。`,
          fingerprintMaterial: ["card-prompt-orphaned", workflowId, stage, promptId, requestView.orphaned.at],
        });
        continue;
      }
      if (requestView.last !== "created") continue; // presented ⇒ 客户可见等待（不造块）
      const createdAtMs = Date.parse(created.at);
      const ageMs = Number.isFinite(createdAtMs) ? Math.max(0, nowMs - createdAtMs) : 0;
      if (ageMs < options.stallMs) continue;
      if (record.delivered === undefined) {
        const round = engineRounds.get(record.taskId) ?? { count: 0, lastAtMs: 0 };
        // 上一轮引擎重投结算后，等满一个 T_stall 窗口再进入下一轮（避免每 tick 重投）。
        if (round.count > 0 && nowMs - round.lastAtMs < options.stallMs) continue;
        const exhausted = round.count >= Math.max(0, options.maxAutoFixAttempts);
        facts.push({
          protocol: WORKFLOW_PROTOCOL_APP_DISPATCH,
          kind: "driver-observation",
          code: "target-busy",
          source: "desktop.stage-dispatch.card-scan",
          workflowId,
          flowId: wfView.flowId,
          stage,
          taskId: record.taskId,
          requestId: promptId,
          ownerRoleId: created.to,
          engineCanRepair: true,
          // 引擎重投预算耗尽 ⇒ 同码事实带 autoFixForbidden（environment-infra 分类 ⇒ owner-repair/客户）。
          ...(exhausted ? { autoFixForbidden: true } : {}),
          summary: exhausted
            ? `card-prompt 任务 ${record.taskId} 未送达目标 ${created.to}，引擎重投已达上限 ${options.maxAutoFixAttempts} 轮（每轮 ${stallMin} 分钟）；升级属主/客户（不继续自动重投）。`
            : `card-prompt 任务 ${record.taskId} 超过 ${stallMin} 分钟未送达目标 ${created.to}（target busy/会话打开失败/队列受阻）；应用有界重投（第 ${round.count + 1} 轮）。`,
          fingerprintMaterial: exhausted
            ? ["card-prompt-undelivered", workflowId, stage, promptId, record.taskId, "round:escalated"]
            : ["card-prompt-undelivered", workflowId, stage, promptId, record.taskId, `round:${round.count}`],
        });
        continue;
      }
      const deliveredMs = Date.parse(record.delivered.at);
      const deliveredAgeMs = Number.isFinite(deliveredMs) ? Math.max(0, nowMs - deliveredMs) : 0;
      if (deliveredAgeMs >= options.stallMs) {
        facts.push({
          protocol: WORKFLOW_PROTOCOL_APP_DISPATCH,
          kind: "driver-observation",
          code: "card-prompt-stalled",
          source: "desktop.stage-dispatch.card-scan",
          workflowId,
          flowId: wfView.flowId,
          stage,
          taskId: record.taskId,
          requestId: promptId,
          ownerRoleId: created.to,
          summary: `card-prompt 任务 ${record.taskId} 已送达 ${created.to} 但超过 ${stallMin} 分钟未呈卡（request 仍等待）；交属主修复（不伪造决定）。`,
          fingerprintMaterial: ["card-prompt-stalled", workflowId, stage, promptId, record.taskId],
        });
      }
    }
    return facts;
  }

  // —————————————— select_workflow（幕僚显式选流程） ——————————————

  /**
   * `select_workflow` 应用实现：宿主已捕获 chief 当前真实客户轮次（sourceTaskId）；编排
   * `selectWorkflow` 校验注册表/幂等并写 `workflow.started`，本层只投递首阶段任务并继续驱动
   * （后续阶段由完成条件推进）。失败稳定码**原样返回**（不换形、不自造定义）。
   */
  async selectWorkflowAndDeliver(input: {
    projectRoot: string;
    runtime: RuntimeKind;
    workflowPath: "A" | "B";
    flowId: string;
    acceptanceStrength?: "light" | "standard";
    sourceTaskId?: string;
  }): Promise<SelectWorkflowToolResult> {
    const sourceTaskId = typeof input.sourceTaskId === "string" ? input.sourceTaskId.trim() : "";
    if (sourceTaskId === "") {
      return {
        ok: false,
        code: "stage-request-source-missing",
        message: "缺少 chief 当前真实客户轮次（sourceTaskId 由宿主捕获，不可模型自报）；未启动流程。",
      };
    }
    const selected = await selectWorkflow({
      projectRoot: input.projectRoot,
      flowId: input.flowId,
      workflowPath: input.workflowPath,
      sourceTaskId,
      ...(input.acceptanceStrength !== undefined ? { acceptanceStrength: input.acceptanceStrength } : {}),
    });
    if (selected.ok !== true) {
      if (selected.blockFact !== undefined) this.blockRouter?.observeFactLater(input.projectRoot, selected.blockFact);
      return { ok: false, code: selected.code, message: selected.message };
    }
    const taskIds = selected.tasks.map((task) => task.taskId);
    const delivery = await this.deliverTaskIds(input.projectRoot, input.runtime, taskIds);
    // 首阶段若创建即完成（A1/A4/A7/B?），继续驱动下一阶段并投递（失败只诊断，不伪造）。
    await this.advance(input.projectRoot, selected.workflowId, input.runtime);
    const failed = delivery.failed.length > 0 ? `；${delivery.failed.length} 个任务待恢复（${delivery.failed.map((item) => item.taskId).join("/")}）` : "";
    return {
      ok: true,
      workflowId: selected.workflowId,
      stage: selected.stage,
      taskIds,
      message: `已启动流程（protocol app-dispatch/v1；definition ${selected.definition.id}@${selected.definition.version}；验收强度 ${selected.acceptanceStrength}）。首阶段 ${selected.stage} 任务 #${taskIds.join("/")} 已登记${failed}；受理 ≠ 完成，后续阶段由应用按流程定义驱动。`,
    };
  }

  // —————————————— 驱动（driveAppDispatchStage 的应用侧包装） ——————————————

  /**
   * 推进当前 workflow 阶段（幂等；只处理 app-dispatch/v1）：
   * 1. 路径 B 的 B2：B1 完成后按应用事实确定性派生 `change.scope-decided`（Q4；失败阻塞、不猜）；
   * 2. `driveAppDispatchStage`（事件先写/幂等建任务/防重复请求）；
   * 3. 投递本次创建/复用的任务；完成态（A1/A4/A7）继续下一阶段，直到遇到在办任务或失败。
   */
  async advance(projectRoot: string, workflowId: string, fallbackRuntime: RuntimeKind): Promise<DriveAppDispatchStageReceipt | undefined> {
    if (!(await this.isAppDispatch(projectRoot, workflowId))) return undefined;
    for (let iteration = 0; iteration < 6; iteration += 1) {
      const derived = await this.deriveB2IfNeeded(projectRoot, workflowId);
      if (derived === "blocked") return undefined;
      const driven = await driveAppDispatchStage({ projectRoot, workflowId });
      if (driven.ok !== true) {
        this.diagnostics(projectRoot).record("app-dispatch.drive.failed", { workflowId, reasonCode: driven.code });
        // 2026-11-20（block resolver 桌面批）：服务拒绝的 block 事实 → router（不改阶段语义）。
        if (driven.blockFact !== undefined) this.blockRouter?.observeFactLater(projectRoot, driven.blockFact);
        if (driven.code === "workflow-corrupt") {
          this.emitDeliveryNote(projectRoot, this.runtimeFor(projectRoot, "convener"), "convener", "convener",
            `[应用·工作流] ${workflowId} 账本不一致：${shortenSummary(driven.message, 160)}（停止自动推进，请核对）`);
        }
        return undefined;
      }
      await this.deliverTaskIds(projectRoot, fallbackRuntime, driven.tasks.map((task) => task.taskId));
      const allReplay = driven.tasks.length > 0 && driven.tasks.every((task) => task.replay);
      if (!driven.completed || (allReplay && !driven.requested)) return driven;
      if (allReplay && driven.completed) return driven; // 已完成但无新任务：不循环
    }
    return undefined;
  }

  /**
   * 路径 B 的 B2 应用派生（Q4）：B1 completed 且 B2 未完成时，按 B1 报告（应用重算字节 hash）+
   * B1 任务记录的 modulePaths/证据路径为候选，属主/有效写集由编排 `recordChangeScopeDecision`
   * 按最新名单/角色边界派生；证据不足/属主不唯一 ⇒ `b-change-scope-invalid` 阻塞（不猜）。
   * 返回 `"none"`（不在窗口/已派生）、`"derived"`（已写）或 `"blocked"`（失败，停止驱动）。
   */
  private async deriveB2IfNeeded(projectRoot: string, workflowId: string): Promise<"none" | "derived" | "blocked"> {
    const ledger = await readWorkflowLedger(projectRoot);
    const wfEvents = ledger.events.filter((event) => event.workflowId === workflowId);
    const state = await this.readTasks(projectRoot);
    const view = deriveWorkflowView(wfEvents, state.events);
    if (view.path !== "B" || view.closed !== undefined || view.stopping === true) return "none";
    if (view.stages.B1.status !== "completed" || view.stages.B2.status === "completed") return "none";
    const b1 = [...state.records.values()].filter((record) =>
      record.created?.workflowId === workflowId
      && record.created.stage === "B1"
      && record.created.taskKind !== "stage-request");
    if (b1.length === 0) {
      this.noteServiceBlock(projectRoot, "b-change-scope-invalid", `B2 派生阻塞：缺少 B1 任务记录（不猜影响面）`, {
        workflowId, flowId: view.flowId, stage: "B2", detailCode: "scope-tradeoff",
        fingerprintMaterial: ["b2-derive", workflowId, "missing-b1"],
      });
      this.emitDeliveryNote(projectRoot, this.runtimeFor(projectRoot, "convener"), "convener", "convener",
        `[应用·工作流] ${workflowId} B2 派生阻塞：缺少 B1 任务记录（不猜影响面）。`);
      return "blocked";
    }
    const withDone = b1.filter((record) => record.reports.some((report) => report.status === "done"));
    const ordered = withDone.length > 0 ? withDone : b1;
    const latest = ordered[ordered.length - 1]!;
    const latestReport = [...latest.reports].reverse().find((report) => report.status === "done");
    const impactCandidates = [
      ...[...(latestReport?.evidence ?? [])].reverse(),
      ...(latest.created?.requestedEvidence ?? []),
    ];
    let impactReport: { path: string; sha256: string } | undefined;
    for (const candidate of impactCandidates) {
      const hash = await sha256OfProjectFile(projectRoot, candidate);
      if (hash !== undefined) {
        impactReport = { path: candidate.replace(/\\/g, "/").trim(), sha256: hash };
        break;
      }
    }
    if (impactReport === undefined) {
      this.noteServiceBlock(projectRoot, "b-change-scope-invalid", `B2 派生阻塞：B1 任务 ${latest.taskId} 的 done 报告未给出可读影响面文件`, {
        workflowId, flowId: view.flowId, stage: "B2", taskId: latest.taskId, detailCode: "scope-tradeoff",
        fingerprintMaterial: ["b2-derive", workflowId, "no-impact", latest.taskId],
      });
      this.emitDeliveryNote(projectRoot, this.runtimeFor(projectRoot, "convener"), "convener", "convener",
        `[应用·工作流] ${workflowId} B2 派生阻塞：B1 任务 ${latest.taskId} 的 done 报告未给出可读的项目内影响面文件（不猜）。`);
      return "blocked";
    }
    const moduleCandidates = [...new Set(b1
      .flatMap((record) => record.created?.modulePaths ?? [])
      .map((item) => item.trim().replace(/\\/g, "/"))
      .filter(isScopeFileCandidate))];
    const reportCandidates = [...new Set((latestReport?.evidence ?? [])
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().replace(/\\/g, "/"))
      .filter(isScopeFileCandidate))];
    const candidates = moduleCandidates.length > 0 ? moduleCandidates : reportCandidates;
    if (candidates.length === 0) {
      this.noteServiceBlock(projectRoot, "b-change-scope-invalid", `B2 派生阻塞：B1 任务未记录 modulePaths 且报告无可读路径`, {
        workflowId, flowId: view.flowId, stage: "B2", detailCode: "scope-tradeoff",
        fingerprintMaterial: ["b2-derive", workflowId, "no-candidates"],
      });
      this.emitDeliveryNote(projectRoot, this.runtimeFor(projectRoot, "convener"), "convener", "convener",
        `[应用·工作流] ${workflowId} B2 派生阻塞：B1 任务未记录 modulePaths 且报告无可读路径（应用不采信模型自报写集）。`);
      return "blocked";
    }
    const requestTask = [...b1]
      .filter((record) => record.created?.taskKind === "worker-dispatch" && record.created?.from === "application")
      .sort((a, b) => (a.created!.at < b.created!.at ? -1 : 1))
      .pop() ?? latest;
    const decision = await recordChangeScopeDecision({
      projectRoot,
      flowId: view.flowId,
      workflowId,
      operationId: `app-b2:${workflowId}`,
      impactReport,
      scope: {
        summary: `B2 范围决定（应用派生；B1 影响面：${impactReport.path}）`,
        files: candidates,
        rationale: `依据 B1 任务 ${latest.taskId} 的 done 报告与模块记录；属主/有效写集由应用按名单/边界派生（Q4）。`,
      },
      requestTaskId: requestTask.taskId,
    });
    if (!decision.ok) {
      this.noteServiceBlock(projectRoot, decision.code, `B2 派生阻塞（${decision.code}）：${decision.message}`, {
        workflowId, flowId: view.flowId, stage: "B2", taskId: requestTask.taskId, detailCode: "scope-tradeoff",
      });
      this.emitDeliveryNote(projectRoot, this.runtimeFor(projectRoot, "convener"), "convener", "convener",
        `[应用·工作流] ${workflowId} B2 派生阻塞（${decision.code}）：${shortenSummary(decision.message, 160)}`);
      return "blocked";
    }
    this.diagnostics(projectRoot).record("app-dispatch.b2.derived", { workflowId, files: candidates.length, replay: decision.replay });
    return "derived";
  }

  // —————————————— 报告观察/收口（task.reported） ——————————————

  /**
   * 观察应用任务报告（`task.reported` 已由 commitHandback 写入账本）：
   * - `stage-execution` 默认由编排 `observeAppDispatchTaskReport` 收口/按 Q8 重试；
   * - A12b：done ⇒ 应用先补验收归档证据再 `closeTask(accepted)`（同时写 A12 聚合）；标准验收 blocked
   *   ⇒ 显式 `decision:"rework"`（A12b→A11）；轻量验收 blocked ⇒ 先补归档，交给编排按定义接受；
   * - A13/B4：done ⇒ 关闭汇总任务（**不写阶段完成**）→ 呈 merge-main（release-or-close 只由合并/关闭完成）；
   * - 收口后驱动下一阶段并投递。
   */
  async observeApplicationTaskReport(projectRoot: string, taskId: string): Promise<void> {
    const state = await this.readTasks(projectRoot);
    const record = state.records.get(taskId);
    const created = record?.created;
    if (record === undefined || created === undefined) return;
    if (created.from !== "application" || created.taskKind !== "stage-execution") return;
    if (record.closed !== undefined) return;
    const workflowId = created.workflowId;
    const stage = created.stage;
    if (workflowId === undefined || stage === undefined) return;
    if (!(await this.isAppDispatch(projectRoot, workflowId))) return;
    const lastReport = record.reports[record.reports.length - 1];
    if (lastReport === undefined) return;
    const runtime = this.runtimeFor(projectRoot, created.to);

    if (stage === "A13" || stage === "B4") {
      if (lastReport.status === "done") {
        // release-or-close：汇总完成 ≠ 阶段完成。关闭汇总任务（应用收口，不写阶段事件）后呈 merge-main。
        await this.closeApplicationStageTask(projectRoot, record, lastReport.at, "accepted", lastReport.summary);
        await this.presentReleaseMergeFor(projectRoot, workflowId, stage === "A13" ? "A12b" : "B3");
      } else {
        const rejected = await observeAppDispatchTaskReport({ projectRoot, taskId });
        this.logObservation(projectRoot, workflowId, taskId, rejected);
      }
      return;
    }

    if (stage === "A12b" && lastReport.status === "done") {
      // 应用补归档证据（criteria/report/acceptance-archive）后按既有完成判定收口；失败交回 observe 如实拒绝。
      const evidence = await this.refs.evidence.buildFixedCloseEvidence(projectRoot, taskId, undefined);
      if (evidence.ok) {
        const closed = await closeFixedWorkflowTask({
          projectRoot,
          operationId: `app-observe:${taskId}:${lastReport.at}`,
          taskId,
          outcome: "accepted",
          note: lastReport.summary,
          actorRoleId: "application",
          ...(evidence.evidence !== undefined ? { evidence: evidence.evidence } : {}),
        });
        if (closed.ok) {
          await this.advance(projectRoot, workflowId, runtime);
          return;
        }
        this.diagnostics(projectRoot).record("app-dispatch.a12b.close-failed", { taskId, reasonCode: closed.code });
      }
    }
    if (stage === "A12b" && lastReport.status === "blocked") {
      const strength = await this.acceptanceStrength(projectRoot, workflowId);
      if (strength === "light") {
        // B31：先补应用归档（note = 报告摘要）；observe 按定义参数接受 blocked + archive（审计口径保留）。
        await this.refs.evidence.buildFixedCloseEvidence(projectRoot, taskId, lastReport.summary);
      } else {
        const observed = await observeAppDispatchTaskReport({ projectRoot, taskId, decision: "rework" });
        this.logObservation(projectRoot, workflowId, taskId, observed);
        await this.advance(projectRoot, workflowId, runtime);
        return;
      }
    }
    const observed = await observeAppDispatchTaskReport({ projectRoot, taskId });
    this.logObservation(projectRoot, workflowId, taskId, observed);
    if (observed.ok === true) {
      await this.advance(projectRoot, workflowId, runtime);
    }
  }

  private logObservation(
    projectRoot: string,
    workflowId: string,
    taskId: string,
    observed: Awaited<ReturnType<typeof observeAppDispatchTaskReport>>,
  ): void {
    if (observed.ok === true) {
      this.diagnostics(projectRoot).record("app-dispatch.observe.settled", {
        workflowId, taskId, outcome: observed.outcome, stage: observed.stage,
        stageCompleted: observed.stageCompleted, retried: observed.retried !== undefined, blocked: observed.blocked !== undefined,
        // 2026-11-20（SMOKE-1 seams）：编排对 block 事实的处置方向（retrying=重试已触发；fixed=
        // 确定性动作已收口；escalated=预算耗尽/高风险/重试失败）——桌面按事实 raise 后由 router
        // 走 engine-auto-fix（retrying/fixed）或客户/judge（escalated），不据此自造动作。
        ...(observed.blockOutcome !== undefined ? { blockOutcome: observed.blockOutcome } : {}),
      });
      // 2026-11-20（SMOKE-1 seams）：**每个** blocked/failed 报告的 blockFact（重试决策前生成；
      // retrying/fixed 也必须在 blocks.jsonl 出现 raised→routed(engine-auto-fix)→resolved(fixed)），
      // 不只依赖重试耗尽/高风险。Q8 重试期间路由分类为 protocol-reconcile ⇒ 不并发建属主修复任务。
      if (observed.blockFact !== undefined) this.blockRouter?.observeFactLater(projectRoot, observed.blockFact);
    } else {
      this.diagnostics(projectRoot).record("app-dispatch.observe.failed", { workflowId, taskId, reasonCode: observed.code });
      // close-report-missing 等收口失败（P4/P25）→ 服务事实（B1/B8）；不改收口语义。
      this.blockRouter?.observeFactLater(projectRoot, blockFactFromServiceFailure({
        protocol: WORKFLOW_PROTOCOL_APP_DISPATCH,
        code: observed.code,
        message: observed.message,
        workflowId,
        taskId,
        source: "desktop.stage-dispatch.observe",
        fingerprintMaterial: ["observe-failure", workflowId, taskId, observed.code],
      }));
    }
  }

  /** 应用收口自己的 stage-execution 任务（不经 closeTask：A13/B4 不得借此完成阶段；幂等按报告时刻）。 */
  private async closeApplicationStageTask(
    projectRoot: string,
    record: TaskRecord,
    reportedAt: string,
    outcome: "accepted" | "rework" | "rejected",
    note: string,
  ): Promise<void> {
    const result = await closeApplicationTaskDirect({
      projectRoot,
      taskId: record.taskId,
      outcome,
      operationId: `app-observe:${record.taskId}:${reportedAt}`,
      note,
    });
    if (!result.ok) {
      this.diagnostics(projectRoot).record("app-dispatch.task-close.failed", { taskId: record.taskId, reasonCode: result.code });
    }
  }

  /** 验收强度（定义参数；Q2）：started.parameters ?? 定义默认（缺省 standard）。 */
  private async acceptanceStrength(projectRoot: string, workflowId: string): Promise<"light" | "standard"> {
    try {
      const ledger = await readWorkflowLedger(projectRoot);
      const started = ledger.events.find((event): event is Extract<WorkflowEvent, { kind: "workflow.started" }> =>
        event.kind === "workflow.started" && event.workflowId === workflowId);
      const explicit = started?.parameters?.acceptanceStrength;
      if (explicit === "light" || explicit === "standard") return explicit;
      const ref = started?.definition;
      if (ref !== undefined) {
        const lookup = getWorkflowDefinition(ref.id, ref.version);
        if (lookup.ok === true) return lookup.definition.acceptance.defaultStrength;
      }
    } catch {
      /* 读失败 ⇒ 默认 standard（fail-closed 方向：不放宽轻量接受） */
    }
    return "standard";
  }

  // —————————————— merge-main 呈卡（A13/B4 汇总完成后） ——————————————

  /**
   * 呈 merge-main 卡（客户本人）：触发窗口 = 触发阶段已 completed 且 A13/B4 未完成；证据由
   * `autoPresentFixedReleaseMerge` 应用计算（A12b 归档 / B3 done 报告真实文件）。本层只找真实触发
   * 任务 id（账本事实），不猜证据。
   */
  private async presentReleaseMergeFor(
    projectRoot: string,
    workflowId: string,
    triggerStage: "A12b" | "B3",
  ): Promise<void> {
    try {
      const state = await this.readTasks(projectRoot);
      const triggerTasks = [...state.records.values()]
        .filter((record) => record.created?.workflowId === workflowId && record.created.stage === triggerStage)
        .filter((record) => record.reports.some((report) => report.status === "done"))
        .sort((a, b) => ((a.created?.at ?? "") < (b.created?.at ?? "") ? -1 : 1));
      const trigger = triggerTasks[triggerTasks.length - 1];
      if (trigger === undefined) {
        this.releaseNote(projectRoot, workflowId, `merge-main 未呈卡：缺少 ${triggerStage} 的 done 报告任务（不猜证据）。`);
        return;
      }
      await this.release.autoPresentFixedReleaseMerge({ projectRoot, workflowId, stage: triggerStage, taskId: trigger.taskId });
    } catch (error) {
      this.diagnostics(projectRoot).error("app-dispatch.release.auto-present.failed", error, { workflowId });
      this.releaseNote(projectRoot, workflowId, `merge-main 自动呈卡失败：${error instanceof Error ? error.message : String(error)}（未合并；请运营/幕僚核对）。`);
    }
  }

  private releaseNote(projectRoot: string, workflowId: string, summary: string): void {
    const runtime = this.refs.lastGovernanceRuntime.get(projectRoot) ?? "pi";
    this.emitDeliveryNote(projectRoot, runtime, "convener", "convener", `[工作流发布] ${workflowId}：${summary}`);
    this.emitDeliveryNote(projectRoot, runtime, "chief", "chief", `[工作流发布] ${workflowId}：${summary}`);
  }

  // —————————————— 卡裁决后的收口/推进 ——————————————

  /**
   * 应用卡（card-prompt）裁决后：关闭 prompt 任务（应用收口；不写阶段事件——A3/A6/A10 的阶段事件
   * 由既有 `recordFixedCardWorkflowResolution`/`finalizeIntent` 写）并驱动下一阶段。
   * `resolved=false`（通道不可用/中止）⇒ 保持 prompt 任务 open，不推进（可幂等重呈）。
   */
  async afterCardResolved(input: AppDispatchCardResolvedInput): Promise<void> {
    if (!input.resolved) return;
    if (!(await this.isAppDispatch(input.projectRoot, input.workflowId))) return;
    const state = await this.readTasks(input.projectRoot);
    const promptTask = [...state.records.values()].find((record) =>
      record.created?.taskKind === "card-prompt" && record.created?.promptId === input.promptId);
    if (promptTask !== undefined && promptTask.closed === undefined) {
      const closed = await closeApplicationTaskDirect({
        projectRoot: input.projectRoot,
        taskId: promptTask.taskId,
        outcome: "accepted",
        operationId: `app-card-prompt-close:${input.workflowId}:${input.stage}:${input.requestId}`,
        note: `card prompt ${input.promptId} resolved`,
      });
      if (!closed.ok) {
        this.diagnostics(input.projectRoot).record("app-dispatch.card-prompt.close-failed", { workflowId: input.workflowId, reasonCode: closed.code });
      }
    }
    const chiefRuntime = this.runtimeFor(input.projectRoot, "chief");
    await this.advance(input.projectRoot, input.workflowId, chiefRuntime);
  }

  // —————————————— worker-dispatch 收口后的推进 ——————————————

  /** 运营收口 worker-dispatch 任务后：按阶段完成条件推进（未完成/非法转移只诊断，不伪造阶段事件）。 */
  async afterWorkerDispatchClosed(projectRoot: string, workflowId: string, actorRoleId: string): Promise<void> {
    if (!(await this.isAppDispatch(projectRoot, workflowId))) return;
    await this.advance(projectRoot, workflowId, this.runtimeFor(projectRoot, actorRoleId));
  }

  // —————————————— 启动/打开项目对账 ——————————————

  /**
   * 启动/打开项目对账（设计 §4.3/§7.2；app-dispatch/v1 only）：
   * 1. 编排 `reconcileFixedWorkflow`：已报告未收口任务幂等收口、open 阶段幂等补建/补投递、账本一致性核验；
   * 2. 桌面侧**投递一致性**校验：活动 workflow 的应用任务未送达/未报告 ⇒ 重新入队（taskId+forced fixed）；
   * 3. 驱动 receipt 中补建的任务立即投递。fixed-v2.1/legacy 一律不触碰（服务层已跳过；本层再跳过）。
   */
  async reconcile(projectRoot: string): Promise<AppDispatchReconcileSummary> {
    const summary: AppDispatchReconcileSummary = { activeWorkflows: 0, delivered: [], corrupt: [], errors: [] };
    let service: Awaited<ReturnType<typeof reconcileFixedWorkflow>>;
    try {
      service = await reconcileFixedWorkflow({ projectRoot });
    } catch (error) {
      this.diagnostics(projectRoot).error("app-dispatch.reconcile.failed", error);
      summary.errors.push(`reconcile-failed: ${error instanceof Error ? error.message : String(error)}`);
      return summary;
    }
    if (service.ok !== true) {
      summary.errors.push(`${service.code}: ${service.message}`);
      if (service.blockFact !== undefined) this.blockRouter?.observeFactLater(projectRoot, service.blockFact);
      return summary;
    }
    summary.service = service;
    const runtime = this.refs.lastGovernanceRuntime.get(projectRoot) ?? "pi";
    for (const workflow of service.workflows) {
      if (workflow.protocol !== WORKFLOW_PROTOCOL_APP_DISPATCH) continue; // Q10：旧协议不触碰
      summary.activeWorkflows += 1;
      if (workflow.blockFacts !== undefined && workflow.blockFacts.length > 0) {
        this.blockRouter?.observeFactListLater(projectRoot, workflow.blockFacts);
      }
      if (workflow.corrupt !== undefined) summary.corrupt.push(`${workflow.workflowId}: ${workflow.corrupt}`);
      summary.errors.push(...workflow.errors.map((entry) => `${workflow.workflowId}: ${entry}`));
      const drivenTaskIds = (workflow.driven?.tasks ?? []).map((task) => task.taskId);
      if (drivenTaskIds.length > 0) {
        const report = await this.deliverTaskIds(projectRoot, runtime, drivenTaskIds);
        summary.delivered.push(...report.delivered);
        summary.errors.push(...report.failed.map((item) => `${item.taskId}: ${item.reason}`));
      }
      // 崩溃窗口兜底（设计 §4.3 恢复顺序）：服务对账只覆盖「open 阶段」（requested/dispatched/in-progress）；
      // 「上阶段已完成但下阶段尚未驱动」（如 A1 on-dispatch 完成后崩溃）由桌面 advance 幂等续驱。
      if (workflow.corrupt === undefined && workflow.skipped === undefined) {
        await this.advance(projectRoot, workflow.workflowId, runtime);
      }
      // 投递一致性：活动 workflow 的应用任务（open、未送达、无报告）重新入队（幂等键抑制重复）。
      const state = await this.readTasks(projectRoot);
      const pending = [...state.records.values()]
        .filter((record) => record.created?.from === "application" && record.created.workflowId === workflow.workflowId)
        .filter((record) => record.closed === undefined && record.delivered === undefined && record.reports.length === 0)
        .map((record) => record.taskId);
      if (pending.length > 0) {
        const report = await this.deliverTaskIds(projectRoot, runtime, pending);
        summary.delivered.push(...report.delivered);
        summary.errors.push(...report.failed.map((item) => `${item.taskId}: ${item.reason}`));
      }
    }
    if (summary.activeWorkflows > 0) {
      this.diagnostics(projectRoot).record("app-dispatch.reconcile.done", {
        workflows: summary.activeWorkflows,
        delivered: summary.delivered.length,
        corrupt: summary.corrupt.length,
        errors: summary.errors.length,
      });
    }
    return summary;
  }
}

/**
 * 2026-11-20（SMOKE-1 seams）：request 生命周期视图（**最后一条为准**；orphaned 不粘性——
 * 同 requestId 的重新呈现（新 request.created）表示重新等待）。与 block-router `findRequestState`
 * 及 project-state 派生同口径。
 */
interface RequestLedgerView {
  last: "created" | "presented" | "orphaned" | "resolved";
  created?: RequestCreatedEvent;
  orphaned?: Extract<TaskStateEvent, { kind: "request.orphaned" }>;
  resolved?: Extract<TaskStateEvent, { kind: "request.resolved" }>;
}

function requestViewOf(events: readonly TaskStateEvent[], requestId: string): RequestLedgerView | undefined {
  let view: RequestLedgerView | undefined;
  for (const event of events) {
    if (event.kind === "request.created" && event.requestId === requestId) {
      view = { last: "created", created: event };
      continue;
    }
    if (view === undefined) continue;
    if (event.kind === "request.presented" && event.requestId === requestId) {
      view.last = "presented";
    } else if (event.kind === "request.orphaned" && event.requestId === requestId) {
      view.last = "orphaned";
      view.orphaned = event;
    } else if (event.kind === "request.resolved" && event.requestId === requestId) {
      view.last = "resolved";
      view.resolved = event;
    }
  }
  return view;
}

/** 项目内文件字节 sha256（缺失/目录/非法路径 ⇒ undefined；不猜）。 */
async function sha256OfProjectFile(projectRoot: string, relPath: string): Promise<string | undefined> {
  const normalized = relPath.replace(/\\/g, "/").trim();
  if (normalized === "" || normalized.startsWith("/") || normalized.includes("://")) return undefined;
  if (normalized.split("/").some((segment) => segment === "..")) return undefined;
  try {
    const bytes = await fs.promises.readFile(path.join(projectRoot, ...normalized.split("/")));
    return createHash("sha256").update(bytes).digest("hex");
  } catch {
    return undefined;
  }
}

/** B2 范围候选：文件级项目相对路径（目录/空段/`.`/`..` 非法）。 */
function isScopeFileCandidate(value: string): boolean {
  const text = value.trim().replace(/\\/g, "/");
  if (text === "" || text.startsWith("/") || /^[a-zA-Z]:/.test(text)) return false;
  return text.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
