// app/desktop/session/tasks.ts
// B3（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.3 / §3.6 / §5 B3、附录 A tasks 组）：任务账本业务、卡死重派/终止/升级、角色活动日志、
// 项目备注/状态、部分产物隔离（L2，feature 白名单 []）。
// 17 个类方法（observeRoleEvent/roleActivityLogText/readRoleActivityLog/listTasks/projectStateView/
// projectStateTool/projectNote/restoreTasks/partialArtifactsFor/roleTempDir/isolatePartialArtifacts/
// chooseRedispatchTarget/terminateRoleRun/taskChainRootOf/redispatchTask/closeTask/escalateStuckTask）
// 自 app/desktop/session.ts **逐字搬移**（含 JSDoc）：方法体零改动；类外壳重建原 receiver 面——
//  · starTaskIds/activeDispatchKeys/escalationRequests/lastRoleActivity/deliveryQueues/activeDeliveries/
//    sessions/lastGovernanceRuntime 按方案 §3.6 **暂留门面**，经 `TasksState` 显式传入（同一实例引用）；
//  · 已迁出的 shared 方法（readTasks/appendTaskState/recordTaskFailure/appendRoleActivity/
//    rememberTaskCreator/roleDisplayName/chiefTaskRoleIdOf/emitDeliveryNote/sessionKey/queueKey/now）
//    经同名同义委托 → `shared/*`（与门面委托同一函数、同一入参）；
//  · B3 尚未迁出的门面方法（restoreRequestState/restoreVersionDecisions/findLiveRuntime/enqueueDelivery/
//    drainQueue/appDispatchClientMessageId/stopExactController/ensureFreshRoleSession/withRequestLifecycle）
//    经 `TasksPorts` 回调注入，参数逐位原样转发。
// 可见性 `private` → 模块内 public 仅为门面委托可调用（不进入公开导出面）。
// 依赖规则（结构测试 R-c）：L2 feature 只可导入 L0（contracts/shared）与外部 src；不得导入 barrel/feature。

import fs from "node:fs";
import path from "node:path";
import { createDiagnosticLogger } from "../../../src/common/shared/diagnostics.ts";
import { formatRoleActivityText, readRoleLog } from "../../../src/common/编排/role-log.ts";
import { extractDispatchReadPaths, planDispatchDelivery } from "../../../src/common/编排/handback.ts";
import { buildProjectStateView, renderProjectStateSummary } from "../../../src/common/编排/project-state.ts";
import { redispatchCountOf, redispatchTaskId, shortenSummary, taskCards, taskEvent, type TaskReplay } from "../../../src/common/编排/task-state.ts";
import { evaluateRedispatchSafety, type WatchdogToolResult } from "../../../src/common/编排/watchdog.ts";
import { GOVERNANCE_SLUG_PATTERN, type CustomerInputMetadata, type CustomerInputOutcome, type CustomerInputRequest, type RoleActivityLogPayload, type TaskStateEvent } from "../../../src/model/runtime.ts";
import type { OrchestrationEvent } from "../../../src/common/编排/handback.ts";
import { PROJECT_NOTE_BLOCKER_TEXT_MAX, PROJECT_NOTE_KEY_MAX, PROJECT_NOTE_NEXT_STEP_DEFAULT_KEY, PROJECT_NOTE_NEXT_STEP_TEXT_MAX, PROJECT_NOTE_REFS_MAX, type ProjectNoteInput, type ProjectNoteResult, type ProjectStateToolResult, type ProjectStateView } from "../../../src/model/project-state.ts";
import type { RuntimeKind } from "../../../src/common/shared/runtime-shared.ts";
import type { ActualDispatchSource, DeliveryItem, LiveSession } from "./contracts/session-types.ts";
import type { CloseTaskInput, CloseTaskResult, RedispatchTaskInput, RedispatchTaskResult, TaskListView, TaskRestoreReport, TerminateRoleRunInput, TerminateRoleRunResult } from "./contracts/tasks.ts";
import type { SessionManagerDeps } from "./contracts/deps.ts";
import { queueKey, sessionKey } from "./shared/keys.ts";
import { now } from "./shared/clock.ts";
import { appendRoleActivity, appendTaskState, readTasks, recordTaskFailure, rememberTaskCreator } from "./shared/tasks-store.ts";
import { chiefTaskRoleIdOf, roleDisplayName } from "./shared/roles.ts";
import { emitDeliveryNote } from "./shared/notifier.ts";
import { filePrint, shortenText } from "./shared/text.ts";
import type { AcceptanceReportDisplayV1, DesktopCustomerInputFn } from "../customer-input.ts";

/** slug 校验（与 model/runtime.ts 单一来源一致的同一构造；本模块只读使用）。 */
const GOVERNANCE_SLUG_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);

/** tasks 方法读取的实例状态（方案 §3.6：任务索引/活动日志/投递视图；B3 暂留门面——同一实例引用传入）。 */
export interface TasksState {
  sessions: ReadonlyMap<string, LiveSession>;
  deliveryQueues: ReadonlyMap<string, DeliveryItem[]>;
  activeDeliveries: ReadonlyMap<string, DeliveryItem>;
  lastGovernanceRuntime: ReadonlyMap<string, RuntimeKind>;
  starTaskIds: Set<string>;
  activeDispatchKeys: Set<string>;
  escalationRequests: Map<string, Promise<{ escalated: boolean; requestId?: string; selected?: string; message: string }>>;
  lastRoleActivity: Map<string, { at: number; kind: string; summary: string }>;
}

/** 尚未迁出（B3 范围外）的门面方法端口；门面以箭头回调注入，参数逐位原样转发、返回原样返回。 */
export interface TasksPorts {
  restoreRequestState(projectRoot: string, state: TaskReplay): Promise<{ orphaned: number; expired: number }>;
  restoreVersionDecisions(projectRoot: string, state: TaskReplay): Promise<{ reconciled: number; uncertain: number }>;
  findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined;
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void;
  drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void>;
  appDispatchClientMessageId(dedupKey: string): string;
  stopExactController(input: TerminateRoleRunInput, caller?: ActualDispatchSource): Promise<TerminateRoleRunResult>;
  ensureFreshRoleSession(projectRoot: string, roleId: string, runtime: RuntimeKind): Promise<{ ok: boolean; rebuilt: boolean; error?: string }>;
  withRequestLifecycle(
    projectRoot: string,
    sourceRoleId: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    raw: (request: CustomerInputRequest, context: Parameters<DesktopCustomerInputFn>[1], metadata?: CustomerInputMetadata) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined,
    buildContext: (request: CustomerInputRequest, extras?: { onPresented?: () => void; acceptanceReport?: AcceptanceReportDisplayV1; judgeNotice?: string }) => Parameters<DesktopCustomerInputFn>[1],
    requestIdOverride?: string,
    lifecycle?: { notify?: "default" | "resolved-only" | "none"; signal?: AbortSignal; judgeNotice?: string; onPresented?: () => void },
  ): Promise<CustomerInputOutcome | null | undefined>;
}

/** tasks 方法读取的 deps 切片（原 `this.deps` 的两项只读查询）。 */
type TasksDeps = Pick<SessionManagerDeps, "getListing" | "customerInput" | "now" | "emitEvent">;

/** 任务账本业务/重派/终止/升级（原 `SessionManager` 17 方法的同签名实现）。 */
export class Tasks {
  private readonly state: TasksState;
  private readonly port: TasksPorts;
  private readonly deps: TasksDeps;
  constructor(state: TasksState, port: TasksPorts, deps: TasksDeps) { this.state = state; this.port = port; this.deps = deps; }

  /* 原实例状态的本类只读/同名视图（同一 Map/Set 实例；方案 §3.6 暂留门面口径）。 */
  private get sessions(): ReadonlyMap<string, LiveSession> { return this.state.sessions; }
  private get deliveryQueues(): ReadonlyMap<string, DeliveryItem[]> { return this.state.deliveryQueues; }
  private get activeDeliveries(): ReadonlyMap<string, DeliveryItem> { return this.state.activeDeliveries; }
  private get lastGovernanceRuntime(): ReadonlyMap<string, RuntimeKind> { return this.state.lastGovernanceRuntime; }
  private get starTaskIds(): Set<string> { return this.state.starTaskIds; }
  private get activeDispatchKeys(): Set<string> { return this.state.activeDispatchKeys; }
  private get escalationRequests(): Map<string, Promise<{ escalated: boolean; requestId?: string; selected?: string; message: string }>> { return this.state.escalationRequests; }

  /* shared 同名同义委托（→ shared/*；与门面同名委托调用同一函数、同一入参）。 */
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string { return sessionKey(projectRoot, roleId, runtime); }
  private queueKey(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): string { return queueKey(projectRoot, targetRoleId, runtime); }
  private now(): number { return now(this.deps); }
  private async readTasks(projectRoot: string): Promise<TaskReplay> { return readTasks(projectRoot); }
  private rememberTaskCreator(taskId: string, created: { from?: "chief" | "convener" } | undefined): void { rememberTaskCreator(taskId, created); }
  private async appendTaskState(projectRoot: string, event: TaskStateEvent): Promise<boolean> { return appendTaskState(projectRoot, event); }
  private async recordTaskFailure(projectRoot: string, taskId: string, summary: string): Promise<boolean> { return recordTaskFailure(projectRoot, taskId, summary, () => this.now()); }
  private appendRoleActivity(projectRoot: string, roleId: string, input: { kind: string; summary: string; tool?: string; status?: string; taskId?: string; turnId?: string; ref?: string }): Promise<void> {
    return appendRoleActivity(projectRoot, roleId, input, { lastRoleActivity: this.state.lastRoleActivity, now: () => this.now() });
  }
  private roleDisplayName(projectRoot: string, roleId: string): string { return roleDisplayName(projectRoot, roleId, this.deps); }
  private chiefTaskRoleIdOf(projectRoot: string): string | null { return chiefTaskRoleIdOf(projectRoot, this.deps); }
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }

  /* 尚未迁出的门面方法端口（参数逐位原样转发）。 */
  private restoreRequestState(projectRoot: string, state: TaskReplay): Promise<{ orphaned: number; expired: number }> { return this.port.restoreRequestState(projectRoot, state); }
  private restoreVersionDecisions(projectRoot: string, state: TaskReplay): Promise<{ reconciled: number; uncertain: number }> { return this.port.restoreVersionDecisions(projectRoot, state); }
  private findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined { return this.port.findLiveRuntime(projectRoot, roleId); }
  private enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void { this.port.enqueueDelivery(projectRoot, targetRoleId, item); }
  private drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void> { return this.port.drainQueue(projectRoot, targetRoleId, runtime); }
  private appDispatchClientMessageId(dedupKey: string): string { return this.port.appDispatchClientMessageId(dedupKey); }
  private stopExactController(input: TerminateRoleRunInput, caller?: ActualDispatchSource): Promise<TerminateRoleRunResult> { return this.port.stopExactController(input, caller); }
  private ensureFreshRoleSession(projectRoot: string, roleId: string, runtime: RuntimeKind): Promise<{ ok: boolean; rebuilt: boolean; error?: string }> { return this.port.ensureFreshRoleSession(projectRoot, roleId, runtime); }
  private withRequestLifecycle(
    projectRoot: string,
    sourceRoleId: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    raw: (request: CustomerInputRequest, context: Parameters<DesktopCustomerInputFn>[1], metadata?: CustomerInputMetadata) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined,
    buildContext: (request: CustomerInputRequest, extras?: { onPresented?: () => void; acceptanceReport?: AcceptanceReportDisplayV1; judgeNotice?: string }) => Parameters<DesktopCustomerInputFn>[1],
    requestIdOverride?: string,
    lifecycle?: { notify?: "default" | "resolved-only" | "none"; signal?: AbortSignal; judgeNotice?: string; onPresented?: () => void },
  ): Promise<CustomerInputOutcome | null | undefined> {
    return this.port.withRequestLifecycle(projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride, lifecycle);
  }

  /** 从会话事件提取摘要并写运行日志（消息/工具/轮次终局；不写事件 detail 原文）。 */
  observeRoleEvent(projectRoot: string, roleId: string, event: OrchestrationEvent): void {
    if (event.kind === "handback") {
      this.appendRoleActivity(projectRoot, roleId, {
        kind: "report.received",
        summary: event.handback?.summary ?? event.summary,
        status: event.handback?.status,
        ...(event.handback?.taskId !== undefined ? { taskId: event.handback.taskId } : {}),
        ...(event.handback?.turnId !== undefined ? { turnId: event.handback.turnId } : {}),
      });
      return;
    }
    const detail = event.detail !== null && typeof event.detail === "object" ? event.detail as Record<string, unknown> : {};
    const tool = typeof detail.toolName === "string"
      ? detail.toolName
      : detail.call !== null && typeof detail.call === "object" && typeof (detail.call as { name?: unknown }).name === "string"
        ? String((detail.call as { name: unknown }).name)
        : undefined;
    const status = typeof detail.status === "string"
      ? detail.status
      : typeof detail.outcome === "string"
        ? detail.outcome
        : detail.ok === true ? "ok" : detail.ok === false ? "failed" : undefined;
    const kind = event.kind === "tool_call" ? "tool.call"
      : event.kind === "accepted" ? "tool.result"
        : event.kind === "denied" ? "tool.denied"
          : event.kind === "settled" ? "turn.end"
            : event.kind === "message" ? "message"
              : "event";
    this.appendRoleActivity(projectRoot, roleId, {
      kind,
      summary: event.summary,
      ...(tool !== undefined ? { tool } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(typeof event.turnId === "string" && event.turnId !== "" ? { turnId: event.turnId } : {}),
    });
  }

  /** `role_activity_log` 数据面（工具只读；失败如实回执）。 */
  async roleActivityLogText(projectRoot: string, query: RoleActivityLogPayload): Promise<WatchdogToolResult> {
    const roleId = typeof query?.roleId === "string" ? query.roleId.trim() : "";
    if (roleId === "") return { ok: false, message: "role_activity_log：缺少 roleId。" };
    const result = await readRoleLog(projectRoot, {
      roleId,
      ...(typeof query.since === "string" && query.since !== "" ? { since: query.since } : {}),
      ...(typeof query.limit === "number" ? { limit: query.limit } : {}),
    });
    if (!result.ok) return { ok: false, message: `role_activity_log：${result.message ?? "读取失败"}` };
    return { ok: true, text: formatRoleActivityText(result, roleId) };
  }

  /** 公开只读入口：角色运行日志（供 `role_activity_log` 工具/界面；失败如实）。 */
  async readRoleActivityLog(projectRoot: string, query: RoleActivityLogPayload): Promise<WatchdogToolResult> {
    return this.roleActivityLogText(projectRoot, query);
  }

  /** 任务列表（只读；坏行数如实；`tasks.jsonl` 不存在 ⇒ 空列表）。 */
  async listTasks(projectRoot: string): Promise<TaskListView> {
    const state = await this.readTasks(projectRoot);
    const tasks = taskCards(state);
    for (const record of state.records.values()) {
      this.starTaskIds.add(record.taskId);
      this.rememberTaskCreator(record.taskId, record.created);
    }
    return {
      projectRoot,
      tasks,
      errors: state.errors.length,
      unclosed: state.unclosed.length,
    };
  }

  /**
   * `project-state:get` 数据源：**直接**调用 A1 `buildProjectStateView`（UI 与工具同一 builder）。
   * 纯读、零写入；裁剪/有界/部分结果全部由 A1 决定，本层不复制派生。
   */
  async projectStateView(projectRoot: string, scope: { roleId?: string; viewerRoleId?: string; full?: boolean; flowId?: string; now?: Date } = {}): Promise<ProjectStateView> {
    return buildProjectStateView(projectRoot, scope);
  }

  /** `project_state` 工具能力：A1 文本摘要投影（同一 builder；工具层再做 8 KiB 硬截断）。 */
  async projectStateTool(projectRoot: string, roleId: string, query: { flowId?: string }): Promise<ProjectStateToolResult> {
    try {
      const view = await buildProjectStateView(projectRoot, {
        roleId,
        ...(query.flowId !== undefined ? { flowId: query.flowId } : {}),
      });
      return { ok: true, text: renderProjectStateSummary(view) };
    } catch (error) {
      return { ok: false, message: `project_state 读取失败：${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * `project_note` 受控备注（仅 chief）。校验 flow/run 存在性与文本/refs 上限；
   * append-only 写 `project.focus`/`project.note`；不改任务/run/manifest/文档。
   */
  async projectNote(input: { projectRoot: string; roleId: string; input: ProjectNoteInput }): Promise<ProjectNoteResult> {
    const { projectRoot, roleId } = input;
    const note = input.input;
    const listing = this.deps.getListing(projectRoot);
    const role = listing?.roles.find((candidate) => candidate.roleId === roleId);
    if (role === undefined || role.builtIn !== true || role.governanceFunction !== "chief") {
      return { ok: false, message: "project_note 只允许幕僚（chief）提交备注。" };
    }
    const at = new Date(this.now());
    const fail = (message: string): ProjectNoteResult => ({ ok: false, message });
    if (note.op === "set-focus") {
      if (note.cleared === true) {
        const appended = await this.appendTaskState(projectRoot, taskEvent("project.focus", { cleared: true, roleId: "chief" }, () => at));
        return appended
          ? { ok: true, message: "已清除当前 focus。", at: at.toISOString() }
          : fail("focus 清除失败：账本写入失败。");
      }
      const flowId = typeof note.flowId === "string" ? note.flowId.trim() : "";
      if (flowId === "" || !GOVERNANCE_SLUG_RE.test(flowId)) return fail("set-focus 需要合法 flowId（slug），或 cleared:true。");
      const view = await this.projectStateView(projectRoot, { full: true });
      const flow = view.flows.find((candidate) => candidate.flowId === flowId);
      if (flow === undefined) return fail(`set-focus 未执行：flow「${flowId}」不存在（无 run/任务/文档）。`);
      if (note.runId !== undefined && !flow.runs.some((run) => run.runId === note.runId)) {
        return fail(`set-focus 未执行：run「${note.runId}」不属于 flow「${flowId}」。`);
      }
      if (note.note !== undefined && Array.from(note.note).length > PROJECT_NOTE_BLOCKER_TEXT_MAX) return fail("set-focus 未执行：note 超过 500 字符上限（超限拒绝、不截断）。");
      const appended = await this.appendTaskState(projectRoot, taskEvent("project.focus", {
        flowId,
        ...(note.runId !== undefined ? { runId: note.runId } : {}),
        ...(note.note !== undefined ? { note: note.note } : {}),
        roleId: "chief",
      }, () => at));
      return appended
        ? { ok: true, message: `已记录当前 focus：${flowId}${note.runId !== undefined ? ` / ${note.runId}` : ""}。`, at: at.toISOString() }
        : fail("focus 写入失败：账本写入失败。");
    }
    const noteKind = note.op === "blocker" ? "blocker" : "next-step";
    const noteKey = typeof note.noteKey === "string" && note.noteKey.trim() !== ""
      ? note.noteKey.trim()
      : noteKind === "next-step" ? PROJECT_NOTE_NEXT_STEP_DEFAULT_KEY : "";
    if (noteKey === "" || noteKey.length > PROJECT_NOTE_KEY_MAX || !GOVERNANCE_SLUG_RE.test(noteKey)) {
      return fail(`${note.op} 需要合法 noteKey（slug，≤${PROJECT_NOTE_KEY_MAX} 字符）。`);
    }
    const text = typeof note.text === "string" ? note.text : "";
    if (text.trim() === "") return fail(`${note.op} 需要非空 text。`);
    const maxChars = noteKind === "blocker" ? PROJECT_NOTE_BLOCKER_TEXT_MAX : PROJECT_NOTE_NEXT_STEP_TEXT_MAX;
    if (Array.from(text).length > maxChars) return fail(`${note.op} 的 text 超过 ${maxChars} 字符上限（超限拒绝、不截断）。`);
    if (typeof note.active !== "boolean") return fail(`${note.op} 需要布尔参数 active。`);
    if (note.refs !== undefined) {
      if (note.refs.length > PROJECT_NOTE_REFS_MAX) return fail(`${note.op} 的 refs 超过 ${PROJECT_NOTE_REFS_MAX} 项上限（超限拒绝）。`);
      for (const ref of note.refs) {
        if (typeof ref !== "string" || ref.trim() === "" || ref.startsWith("/") || ref.includes("\\") || /^[a-zA-Z]:[\\/]/.test(ref) || ref.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
          return fail(`${note.op} 的 refs 含非法项目相对引用：${String(ref)}`);
        }
      }
    }
    const state = await this.readTasks(projectRoot);
    let latest: Extract<TaskStateEvent, { kind: "project.note" }> | undefined;
    for (const event of state.events) {
      if (event.kind === "project.note" && event.roleId === "chief" && event.noteKey === noteKey) latest = event;
    }
    const same = latest !== undefined &&
      latest.noteKind === noteKind &&
      latest.text === text &&
      latest.active === note.active &&
      JSON.stringify(latest.refs ?? []) === JSON.stringify(note.refs ?? []);
    if (same && latest !== undefined) {
      return { ok: true, message: `${note.op} 备注未变化（同 key/同文本/同 active），未重复写入。`, at: latest.at };
    }
    const appended = await this.appendTaskState(projectRoot, taskEvent("project.note", {
      noteKey,
      noteKind,
      text,
      ...(note.refs !== undefined && note.refs.length > 0 ? { refs: [...note.refs] } : {}),
      active: note.active,
      roleId: "chief",
    }, () => at));
    return appended
      ? { ok: true, message: note.active ? `已记录${noteKind === "blocker" ? "阻塞" : "下一步"}备注：${noteKey}。` : `已解除${noteKind === "blocker" ? "阻塞" : "下一步"}备注：${noteKey}。`, at: at.toISOString() }
      : fail(`${note.op} 写入失败：账本写入失败。`);
  }

  async restoreTasks(projectRoot: string): Promise<TaskRestoreReport> {
    const state = await this.readTasks(projectRoot);
    for (const record of state.records.values()) {
      this.starTaskIds.add(record.taskId);
      this.rememberTaskCreator(record.taskId, record.created);
    }
    const report: TaskRestoreReport = { restored: 0, skipped: 0, taskIds: [] };
    const requests = await this.restoreRequestState(projectRoot, state);
    report.orphanedRequests = requests.orphaned;
    report.expiredApprovals = requests.expired;
    const versionDecisions = await this.restoreVersionDecisions(projectRoot, state);
    report.versionDecisionsReconciled = versionDecisions.reconciled;
    report.versionDecisionsUncertain = versionDecisions.uncertain;
    for (const record of state.unclosed) {
      const created = record.created;
      if (created === undefined) continue;
      if (record.delivered !== undefined || record.reports.length > 0) {
        report.skipped += 1;
        continue;
      }
      const target = this.deps.getListing(projectRoot)?.roles.find((role) => role.roleId === created.to);
      if (target === undefined) {
        report.skipped += 1;
        createDiagnosticLogger({ component: "desktop.session", projectRoot }).record("tasks.restore.target-missing", { taskId: record.taskId, roleId: created.to });
        continue;
      }
      const runtime = this.findLiveRuntime(projectRoot, created.to) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
      const dedupKey = `${projectRoot}\u0000${runtime}\u0000task\u0000${record.taskId}`;
      const queuedAlready = [...this.deliveryQueues.values()].some((items) => items.some((item) => item.dedupKey === dedupKey));
      if (queuedAlready || this.activeDeliveries.get(this.queueKey(projectRoot, created.to, runtime))?.dedupKey === dedupKey) {
        report.skipped += 1;
        continue;
      }
      const probes = new Map<string, string | undefined>();
      for (const readPath of extractDispatchReadPaths(created.text)) probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
      const plan = planDispatchDelivery(
        { roleId: created.to, task: created.text },
        probes,
        {
          sourceRoleId: this.roleDisplayName(projectRoot, "chief"),
          taskId: record.taskId,
          ...(created.expectedOutput !== undefined ? { expectedOutput: created.expectedOutput } : {}),
          ...(created.requestedEvidence !== undefined ? { requestedEvidence: created.requestedEvidence } : {}),
        },
      );
      if (plan.action === "reject") {
        report.skipped += 1;
        createDiagnosticLogger({ component: "desktop.session", projectRoot }).record("tasks.restore.delivery-rejected", { taskId: record.taskId, reasonCode: "references-missing" });
        continue;
      }
      this.enqueueDelivery(projectRoot, created.to, {
        kind: "dispatch",
        runtime,
        targetRoleId: created.to,
        sourceRoleId: "chief",
        taskId: record.taskId,
        text: plan.text,
        summary: `[任务·恢复] #${record.taskId} → ${this.roleDisplayName(projectRoot, created.to)}：${shortenText(created.text, 40)}`,
        dedupKey,
        clientMessageId: this.appDispatchClientMessageId(dedupKey),
      });
      report.restored += 1;
      report.taskIds.push(record.taskId);
      void this.drainQueue(projectRoot, created.to, runtime);
    }
    return report;
  }

  async partialArtifactsFor(projectRoot: string, roleId: string, taskId: string | undefined, since?: string): Promise<string[]> {
    const log = await readRoleLog(projectRoot, { roleId, limit: 200, ...(since !== undefined && !Number.isNaN(Date.parse(since)) ? { since } : {}) });
    if (!log.ok) return [];
    const writeTool = /^(write_file|edit_file|write|edit)$/i;
    return log.entries
      .filter((entry) => entry.kind === "task.partial-artifacts" || (typeof entry.tool === "string" && writeTool.test(entry.tool)))
      .filter((entry) => taskId === undefined || entry.taskId === undefined || entry.taskId === taskId)
      .map((entry) => entry.ref ?? entry.summary)
      .slice(0, 20);
  }

  /** 角色临时区（项目相对 `temp/<role>/`；非法角色 id/逃逸 ⇒ undefined）。 */
  roleTempDir(projectRoot: string, roleId: string): { abs: string; rel: string } | undefined {
    if (typeof roleId !== "string" || roleId === "" || /[\\/]/.test(roleId) || roleId === "." || roleId === "..") return undefined;
    const rel = `temp/${roleId}`;
    const abs = path.resolve(projectRoot, ...rel.split("/"));
    const root = path.resolve(projectRoot);
    if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return undefined;
    return { abs, rel };
  }

  /**
   * B-08：把 `temp/<role>/` 中属于本次任务的产物**物理隔离**到 `temp/<role>/staging/<批次>/`。
   * 只移动任务开始后修改的文件（无 createdAt 时移动当前 temp 下全部，保守）；原子 rename；跨卷失败回退 copy+unlink。
   * 失败只记诊断并保留原文件（不丢证据），不阻塞终止回执。
   */
  async isolatePartialArtifacts(
    projectRoot: string,
    roleId: string,
    taskId: string | undefined,
    since?: string,
  ): Promise<{ artifacts: string[]; stagingDir?: string }> {
    const temp = this.roleTempDir(projectRoot, roleId);
    if (temp === undefined) return { artifacts: [] };
    const sinceMs = typeof since === "string" && !Number.isNaN(Date.parse(since)) ? Date.parse(since) : undefined;
    const candidates: { abs: string; rel: string }[] = [];
    const walk = async (dir: string, relDir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      for (const entry of entries) {
        if (relDir === temp.rel && entry.name === "staging") continue; // 隔离区不再搬
        const abs = path.join(dir, entry.name);
        const rel = `${relDir}/${entry.name}`;
        if (entry.isDirectory()) {
          await walk(abs, rel);
          continue;
        }
        if (!entry.isFile()) continue;
        try {
          const st = await fs.promises.stat(abs);
          if (sinceMs !== undefined && st.mtimeMs < sinceMs) continue;
          candidates.push({ abs, rel });
        } catch { /* 文件消失/不可读：跳过（不猜） */ }
      }
    };
    try {
      await walk(temp.abs, temp.rel);
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("role.terminate.staging.scan.failed", error);
      return { artifacts: [] };
    }
    if (candidates.length === 0) return { artifacts: [] };
    const batch = `terminated-${String(taskId ?? "unknown").replace(/[^A-Za-z0-9._-]/g, "_")}-${this.now()}`;
    const stagingRel = `${temp.rel}/staging/${batch}`;
    const stagingAbs = path.resolve(projectRoot, ...stagingRel.split("/"));
    try {
      await fs.promises.mkdir(stagingAbs, { recursive: true });
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("role.terminate.staging.mkdir.failed", error);
      return { artifacts: [] };
    }
    const isolated: string[] = [];
    for (const candidate of candidates) {
      const dest = path.join(stagingAbs, path.relative(temp.abs, candidate.abs));
      try {
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        try {
          await fs.promises.rename(candidate.abs, dest);
        } catch {
          await fs.promises.copyFile(candidate.abs, dest);
          await fs.promises.unlink(candidate.abs);
        }
        isolated.push(candidate.rel);
      } catch (error) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("role.terminate.staging.move.failed", error, { ref: candidate.rel });
      }
    }
    return { artifacts: isolated, ...(isolated.length > 0 ? { stagingDir: stagingRel } : {}) };
  }

  /** B-07：连续卡死时的替代角色（优先同项目非内置 worker；无则同角色 fresh）。 */
  chooseRedispatchTarget(projectRoot: string, currentRoleId: string, attempts: number): string {
    if (attempts < 1) return currentRoleId;
    const listing = this.deps.getListing(projectRoot);
    const chief = this.chiefTaskRoleIdOf(projectRoot);
    const candidate = listing?.roles.find((role) => role.builtIn !== true && role.roleId !== currentRoleId && role.roleId !== chief);
    return candidate?.roleId ?? currentRoleId;
  }

  async terminateRoleRun(input: TerminateRoleRunInput, chiefSource?: ActualDispatchSource): Promise<TerminateRoleRunResult> {
    if (input.roleId === "convener") return this.stopExactController(input, chiefSource);
    const projectRoot = input.projectRoot;
    const roleId = input.roleId;
    const runtime = input.runtime;
    const entry = this.sessions.get(this.sessionKey(projectRoot, roleId, runtime));
    const base: TerminateRoleRunResult = {
      ok: false,
      roleId,
      terminationConfirmed: false,
      childProcesses: 0,
      childProcessesStopped: 0,
      childResults: [],
      partialArtifacts: [],
      isolatedArtifacts: [],
      sessionFresh: false,
      abort: { ok: false, supported: false },
    };
    if (entry === undefined) {
      return { ...base, sessionFresh: true, message: "会话未开，未执行终止。" };
    }
    const taskState = input.taskId !== undefined ? await this.readTasks(projectRoot) : undefined;
    const createdAt = input.taskId !== undefined ? taskState?.records.get(input.taskId)?.created?.at : undefined;
    const logPartials = await this.partialArtifactsFor(projectRoot, roleId, input.taskId, createdAt);
    const isolation = await this.isolatePartialArtifacts(projectRoot, roleId, input.taskId, createdAt);
    const partialArtifacts = [...new Set([...logPartials, ...isolation.artifacts])].slice(0, 50);
    let childProcesses = 0;
    let childProcessesStopped = 0;
    const childResults: TerminateRoleRunResult["childResults"] = [];
    try {
      const tasks = entry.handle.listBackgroundTasks?.() ?? [];
      const running = tasks.filter((task) => task.state === "running");
      childProcesses = running.length;
      for (const task of running) {
        if (entry.handle.stopBackgroundTask === undefined) {
          childResults.push({ taskId: task.taskId, ok: false, reason: "unavailable" });
          continue;
        }
        try {
          const stopped = await entry.handle.stopBackgroundTask(task.taskId, { force: true });
          const snapshot = stopped.ok ? stopped.task : stopped.task;
          childResults.push({
            taskId: task.taskId,
            ok: stopped.ok,
            ...(stopped.ok ? {} : { reason: stopped.reason }),
            ...(snapshot?.exitCode !== undefined ? { exitCode: snapshot.exitCode } : {}),
            ...(snapshot?.signal !== undefined ? { signal: snapshot.signal } : {}),
          });
          if (stopped.ok) childProcessesStopped += 1;
        } catch (error) {
          childResults.push({ taskId: task.taskId, ok: false, reason: error instanceof Error ? error.message : String(error) });
        }
      }
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).error("role.terminate.child-list.failed", error);
    }
    entry.interactionState.turn.abort();
    let abort: { ok: boolean; supported: boolean; error?: string } = { ok: false, supported: false, error: "当前运行时不支持停止" };
    if (entry.handle.abort !== undefined) {
      try {
        const result = await Promise.race([
          entry.handle.abort(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("终止等待超时")), 5000)),
        ]);
        abort = { ok: result.ok, supported: result.supported, ...(result.error !== undefined ? { error: result.error } : {}) };
      } catch (error) {
        abort = { ok: false, supported: true, error: error instanceof Error ? error.message : String(error) };
      }
    }
    const terminationConfirmed = abort.ok && childProcessesStopped === childProcesses;
    const result: TerminateRoleRunResult = {
      ok: terminationConfirmed,
      roleId,
      terminationConfirmed,
      childProcesses,
      childProcessesStopped,
      childResults,
      partialArtifacts,
      isolatedArtifacts: isolation.artifacts,
      ...(isolation.stagingDir !== undefined ? { stagingDir: isolation.stagingDir } : {}),
      sessionFresh: false,
      abort,
      ...(terminationConfirmed ? {} : { message: abort.error ?? (childProcessesStopped !== childProcesses ? "子进程未能全部确认退出。" : "终止未确认。") }),
    };
    const exits = childResults
      .map((entry) => {
        const bits: string[] = [];
        if (entry.exitCode !== undefined) bits.push(`exitCode=${entry.exitCode}`);
        if (entry.signal !== undefined) bits.push(`signal=${entry.signal}`);
        return bits.length > 0 ? `${entry.taskId}:${bits.join("/")}` : undefined;
      })
      .filter((value): value is string => value !== undefined);
    this.appendRoleActivity(projectRoot, roleId, {
      kind: "role.terminated",
      summary: `终止：子进程 ${childProcessesStopped}/${childProcesses} 已停${exits.length > 0 ? `（${exits.join("；")}）` : ""}；abort=${abort.ok ? "ok" : abort.error ?? "unsupported"}；部分写入 ${partialArtifacts.length} 项；隔离 ${isolation.artifacts.length} 项`,
      status: terminationConfirmed ? "confirmed" : "unsafe",
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(entry.origins.running?.turnId !== undefined ? { turnId: entry.origins.running.turnId } : {}),
      ref: isolation.artifacts[0] ?? partialArtifacts[0],
    });
    // B-08：把隔离事实落角色日志（后续重派/核对读同一事实，不依赖当次内存回执）。
    if (isolation.artifacts.length > 0) {
      this.appendRoleActivity(projectRoot, roleId, {
        kind: "task.partial-artifacts",
        summary: `${isolation.artifacts.length} 项部分产物已隔离到 ${isolation.stagingDir ?? "staging"}`,
        status: "needs-review",
        ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
        ...(isolation.stagingDir !== undefined ? { ref: isolation.stagingDir } : {}),
      });
    }
    // Termination is a host observation, never a report impersonating the assigned role.
    return result;
  }

  taskChainRootOf(state: TaskReplay, taskId: string): string {
    let cursor = taskId;
    const seen = new Set<string>();
    for (;;) {
      if (seen.has(cursor)) return cursor;
      seen.add(cursor);
      const record = state.records.get(cursor);
      if (record?.retryOf === undefined) return cursor;
      cursor = record.retryOf;
    }
  }

  /**
   * **卡死终止后的安全重派**（B-07/B-08）：先终止（若会话在跑）→ 按副作用分类/终止确认/部分写入
   * 判定安全；仅 `safe` 产生新任务（新 taskId + `retryOf` + 同 idempotencyKey，原任务 closed/rework）。
   * `external|destructive|unknown`、终止未确认、已发生外部副作用 ⇒ 零自动重派；部分写入/已有完成报告
   * ⇒ needs-review。同链最多 2 次重派（首次尝试不计）；第 3 次升级、不再自动重派。
   */
  async redispatchTask(input: RedispatchTaskInput): Promise<RedispatchTaskResult> {
    const projectRoot = input.projectRoot;
    const state = await this.readTasks(projectRoot);
    const record = state.records.get(input.taskId);
    const created = record?.created;
    if (record === undefined || created === undefined) {
      return { ok: false, safety: "unsafe", autoAllowed: false, reasons: ["任务不存在或缺少 task.created"], message: "重派未执行：任务不存在。" };
    }
    if (record.closed !== undefined) {
      return { ok: false, safety: "unsafe", autoAllowed: false, reasons: ["任务已收口"], message: "重派未执行：任务已收口。" };
    }
    const root = this.taskChainRootOf(state, record.taskId);
    const attempts = redispatchCountOf(state, root);
    const maxRaw = Number(process.env["ANS_LOG_REDISPATCH_MAX"]);
    const redispatchMax = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : 2;
    if (attempts >= redispatchMax) {
      const escalation = await this.escalateStuckTask(
        projectRoot,
        record.taskId,
        root,
        attempts,
        created.flowId,
        created.to,
        this.findLiveRuntime(projectRoot, created.to) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo",
      );
      return {
        ok: false,
        safety: "needs-review",
        autoAllowed: false,
        reasons: [`同链已重派 ${attempts} 次（上限 ${redispatchMax}）；已提交升级卡（继续/重派/换人/终止，唯一推荐）`],
        message: escalation.message,
        escalated: escalation.escalated,
        ...(escalation.requestId !== undefined ? { requestId: escalation.requestId } : {}),
        ...(escalation.selected !== undefined ? { selected: escalation.selected } : {}),
      };
    }
    const requestedTarget = typeof input.to === "string" && input.to.trim() !== "" ? input.to.trim() : undefined;
    const to = requestedTarget ?? this.chooseRedispatchTarget(projectRoot, created.to, attempts);
    const originalRuntime = this.findLiveRuntime(projectRoot, created.to) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
    const termination = await this.terminateRoleRun({ projectRoot, roleId: created.to, runtime: originalRuntime, taskId: record.taskId });
    const partialArtifacts = termination.partialArtifacts;
    const completedReport = record.reports.some((entry) => entry.status === "done");
    // B-08：应用按角色日志升类（shell/后台外部命令 ⇒ 至少 external；不得降类），并检查未完成工具调用。
    const log = await readRoleLog(projectRoot, { roleId: created.to, limit: 200, ...(created.at !== undefined ? { since: created.at } : {}) });
    const toolEntries = log.ok ? log.entries.filter((entry) => typeof entry.tool === "string") : [];
    const usedExternalTool = toolEntries.some((entry) => entry.tool === "run_shell" || entry.tool === "start_background_task");
    const sideEffect = usedExternalTool && (created.sideEffect === "read-only" || created.sideEffect === "docs" || created.sideEffect === "code")
      ? "external"
      : created.sideEffect;
    const lastToolEntry = toolEntries[toolEntries.length - 1];
    const inFlightTool = lastToolEntry?.kind === "tool.call";
    const safety = evaluateRedispatchSafety({
      sideEffect,
      terminationConfirmed: termination.terminationConfirmed,
      partialArtifacts,
      completedReport,
      inFlightTool,
    });
    if (!safety.autoAllowed) {
      this.appendRoleActivity(projectRoot, "chief", {
        kind: "task.redispatch.blocked",
        summary: `任务 #${record.taskId} 不自动重派：${safety.reasons.join("；")}`,
        taskId: record.taskId,
        status: safety.safety,
      });
      this.emitDeliveryNote(projectRoot, originalRuntime, "chief", "chief", `[系统·重派] 任务 #${record.taskId} 不自动重派（${safety.safety}）：${safety.reasons.join("；")}`);
      return { ok: false, safety: safety.safety, autoAllowed: false, reasons: safety.reasons, message: `重派未执行：${safety.reasons.join("；")}` };
    }
    const targetRuntime = this.findLiveRuntime(projectRoot, to) ?? originalRuntime;
    const fresh = await this.ensureFreshRoleSession(projectRoot, to, targetRuntime);
    if (!fresh.ok) {
      this.appendRoleActivity(projectRoot, "chief", {
        kind: "task.redispatch.fresh-session-failed",
        summary: `任务 #${record.taskId} 未能建立 fresh 会话：${fresh.error ?? "未知原因"}`,
        taskId: record.taskId,
        status: "needs-review",
      });
      return {
        ok: false,
        safety: "needs-review",
        autoAllowed: false,
        reasons: [`fresh 会话未建立：${fresh.error ?? "未知原因"}`],
        message: "重派未执行：目标角色 fresh 会话未建立（不自动重派）。",
        sessionFresh: false,
      };
    }
    const newId = redispatchTaskId(record.taskId, attempts + 1);
    this.starTaskIds.add(newId);
    this.rememberTaskCreator(newId, created);
    const now = () => new Date(this.now());
    // 原任务先收口（rework/stuck-terminated），再写重派事件与新任务；任一步写失败 ⇒ 不投递（如实失败）。
    if (!(await this.recordTaskFailure(projectRoot, record.taskId, "stuck-terminated:redispatch"))) {
      return { ok: false, safety: "unsafe", autoAllowed: false, reasons: ["任务状态写入失败"], message: "重派未执行：任务状态写入失败。" };
    }
    const redispatchEvent = taskEvent("task.redispatch", {
      taskId: newId,
      retryOf: record.taskId,
      to,
      reason: "stuck",
      safety: "safe",
    }, now);
    const newCreated = taskEvent("task.created", {
      taskId: newId,
      from: created.from,
      ...(created.flowId !== undefined ? { flowId: created.flowId } : {}),
      ...(created.stepId !== undefined ? { stepId: created.stepId } : {}),
      ...(created.moduleId !== undefined ? { moduleId: created.moduleId } : {}),
      ...(created.moduleDirectory !== undefined ? { moduleDirectory: created.moduleDirectory } : {}),
      ...(created.runId !== undefined ? { runId: created.runId } : {}),
      ...(created.runState !== undefined ? { runState: created.runState } : {}),
      ...(created.runStage !== undefined ? { runStage: created.runStage } : {}),
      to,
      // B-07：同角色重派先缩窄任务（明确先做最小可验证部分；已完成部分核对后跳过）。
      text: `${created.text}\n\n[重派] 上次执行卡死；请缩窄范围，先完成最小可验证部分；已完成部分核对后跳过，不要重复。`,
      ...(created.expectedOutput !== undefined ? { expectedOutput: created.expectedOutput } : {}),
      ...(created.requestedEvidence !== undefined ? { requestedEvidence: created.requestedEvidence } : {}),
      sideEffect: created.sideEffect,
      idempotencyKey: created.idempotencyKey,
    }, now);
    if (!(await this.appendTaskState(projectRoot, redispatchEvent)) || !(await this.appendTaskState(projectRoot, newCreated))) {
      return { ok: false, safety: "unsafe", autoAllowed: false, reasons: ["重派事件写入失败"], message: "重派未完成：事件写入失败（原任务已收口，未投递新任务）。" };
    }
    const probes = new Map<string, string | undefined>();
    for (const readPath of extractDispatchReadPaths(created.text)) probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
    const plan = planDispatchDelivery(
      { roleId: to, task: created.text, reason: "stuck" },
      probes,
      {
        sourceRoleId: this.roleDisplayName(projectRoot, "chief"),
        taskId: newId,
        ...(created.expectedOutput !== undefined ? { expectedOutput: created.expectedOutput } : {}),
        ...(created.requestedEvidence !== undefined ? { requestedEvidence: created.requestedEvidence } : {}),
      },
    );
    if (plan.action === "reject") {
      await this.recordTaskFailure(projectRoot, newId, `delivery-rejected: ${shortenSummary(plan.message)}`);
      return { ok: false, safety: "unsafe", autoAllowed: false, reasons: [plan.message], message: plan.message };
    }
    const dedupKey = `${projectRoot}\u0000${targetRuntime}\u0000task\u0000${newId}`;
    this.activeDispatchKeys.add(dedupKey);
    this.enqueueDelivery(projectRoot, to, {
      kind: "dispatch",
      runtime: targetRuntime,
      targetRoleId: to,
      sourceRoleId: "chief",
      taskId: newId,
      text: plan.text,
      summary: `[任务·重派] #${newId}（retryOf ${record.taskId}）→ ${this.roleDisplayName(projectRoot, to)}：${shortenText(created.text, 40)}`,
      dedupKey,
      clientMessageId: this.appDispatchClientMessageId(dedupKey),
    });
    this.appendRoleActivity(projectRoot, "chief", { kind: "task.redispatch", summary: `重派任务 #${record.taskId} → #${newId}（${to}；safe）`, taskId: newId, status: "safe" });
    this.appendRoleActivity(projectRoot, to, { kind: "task.delivered", summary: `收到重派任务 #${newId}（retryOf ${record.taskId}）`, taskId: newId, status: "delivered" });
    void this.drainQueue(projectRoot, to, targetRuntime);
    return {
      ok: true,
      taskId: newId,
      retryOf: record.taskId,
      safety: "safe",
      autoAllowed: true,
      reasons: safety.reasons,
      message: `已终止并重派：新任务 #${newId}（retryOf #${record.taskId}）→ ${to}；第 ${attempts + 1} 次重派；fresh 会话=${fresh.rebuilt ? "已重建" : "新开/未开"}。`,
      sessionFresh: fresh.ok,
    };
  }

  /**
   * 幕僚收口任务（B-03 `task.closed`）：accepted/rework/rejected。已收口/不存在 ⇒ 如实失败（不重写历史）。
   * 只由幕僚动作调用（接口/任务卡）；角色不能自行收口。
   */
  async closeTask(input: CloseTaskInput): Promise<CloseTaskResult> {
    return { ok: false, taskId: input.taskId, message: "请由任务原创建者依据最新报告调用收口能力；客户面板不能冒充角色写入收口。" };
  }

  /**
   * B-07：连续 2 次重派仍卡死 ⇒ 经应用既有客户交互/决策通道提交「继续 / 重派 / 换人 / 终止」唯一推荐卡。
   * 不伪造客户决定：通道不可用/被取消 ⇒ 如实返回未执行；同一链只提交一次（watchdog 重复 tick 不刷屏）。
   */
  escalateStuckTask(
    projectRoot: string,
    taskId: string,
    rootTaskId: string,
    attempts: number,
    taskFlowId?: string,
    targetRoleId?: string,
    targetRuntime?: RuntimeKind,
  ): Promise<{ escalated: boolean; requestId?: string; selected?: string; message: string }> {
    const key = `${projectRoot}\u0000${rootTaskId}`;
    const existing = this.escalationRequests.get(key);
    if (existing !== undefined) return existing;
    const chiefRoleId = this.chiefTaskRoleIdOf(projectRoot);
    const runtime = this.findLiveRuntime(projectRoot, chiefRoleId ?? "") ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
    const requestId = `task-escalation-${rootTaskId}-${attempts}`;
    const promise = (async () => {
      const channel = this.deps.customerInput;
      if (channel === undefined) {
        this.appendRoleActivity(projectRoot, chiefRoleId ?? "chief", {
          kind: "task.escalation.unavailable",
          summary: `任务 #${taskId} 连续卡死升级卡未提交：客户交互/决策通道未接线`,
          taskId,
          status: "unavailable",
        });
        return { escalated: false, requestId, message: "升级未提交：客户交互/决策通道不可用（不伪造卡）。" };
      }
      const flowId = typeof taskFlowId === "string" && taskFlowId !== "" ? taskFlowId : "task-escalation";
      const request: CustomerInputRequest = {
        kind: "choice",
        cardKind: "decision",
        application: true,
        sourceRoleId: "application",
        flowId,
        title: `应用·任务升级：任务连续卡死 ${taskId}`,
        question: "任务已连续 2 次重派仍卡死。请选择处置（唯一推荐：终止）。",
        options: [
          { id: "continue", label: "继续等待/观察" },
          { id: "redispatch", label: "再重派一次（同角色 fresh 会话）" },
          { id: "replace", label: "换人执行（替代角色）" },
          { id: "terminate", label: "终止任务", recommended: true },
        ],
      };
      let outcome: CustomerInputOutcome | null | undefined;
      try {
        outcome = await this.withRequestLifecycle(
          projectRoot,
          "application",
          request,
          { taskId },
          (req, context) => channel(req, context),
          (req, extras) => ({
            roleId: "application",
            runtime,
            projectRoot,
            governanceModel: "trio",
            ...(extras?.onPresented !== undefined ? { onPresented: extras.onPresented } : {}),
          }),
          requestId,
        );
      } catch (error) {
        this.appendRoleActivity(projectRoot, chiefRoleId ?? "chief", {
          kind: "task.escalation.failed",
          summary: `任务 #${taskId} 升级卡提交失败：${error instanceof Error ? error.message : String(error)}`,
          taskId,
          status: "failed",
        });
        return { escalated: false, requestId, message: "升级卡提交失败（未获客户裁决）。" };
      }
      const selected = outcome?.outcome === "answered"
        ? (outcome.value.selected ?? []).find((id) => ["continue", "redispatch", "replace", "terminate"].includes(id))
        : undefined;
      await this.appendRoleActivity(projectRoot, chiefRoleId ?? "chief", {
        kind: "task.escalation",
        summary: `任务 #${taskId} 连续卡死升级：${outcome?.outcome ?? "unavailable"}${selected !== undefined ? `（${selected}）` : ""}`,
        taskId,
        status: selected ?? outcome?.outcome ?? "unavailable",
      });
      if (selected === "terminate") {
        if (targetRoleId !== undefined && targetRoleId !== "") {
          await this.terminateRoleRun({
            projectRoot,
            roleId: targetRoleId,
            runtime: targetRuntime ?? runtime,
            taskId,
          });
        }
        await this.recordTaskFailure(projectRoot, taskId, "stuck-escalation:terminate");
      } else if (selected === "continue" || selected === "redispatch" || selected === "replace") {
        // C 批（协调者放行前置）：continue/redispatch/replace 不自动执行第二条危险路径，但**必须定义并
        // 落地人工处置**——写角色日志 + 向幕僚发系统行，任务保持未收口（不伪造完成、不重复副作用）。
        const manual: Record<typeof selected, string> = {
          continue: "保持观察：不自动重派、不终止；巡检继续，需要收口时由幕僚手动终止或派新任务。",
          redispatch: "自动重派上限已到，不再自动重派；请人工核对部分产物后新建/重派任务（可先终止原任务）。",
          replace: "不自动换人；请人工选择替代角色并派新任务（必要时先终止原角色运行）。",
        };
        const text = `任务 #${taskId} 升级裁决「${selected}」：${manual[selected]}`;
        await this.appendRoleActivity(projectRoot, chiefRoleId ?? "chief", {
          kind: "task.escalation.manual",
          summary: text,
          taskId,
          status: selected,
        });
        this.emitDeliveryNote(projectRoot, runtime, chiefRoleId ?? "chief", "chief", `[系统·升级] ${text}`);
      }
      return {
        escalated: true,
        requestId,
        ...(selected !== undefined ? { selected } : {}),
        message: selected !== undefined
          ? `升级卡已提交并获得裁决：${selected}。`
          : "升级卡已提交，未获明确裁决（不代选）。",
      };
    })();
    this.escalationRequests.set(key, promise);
    // 同一链只提交一次（watchdog 重复 tick 直接返回同一结果，不重复弹卡）。
    return promise;
  }
}
