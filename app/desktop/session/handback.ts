// app/desktop/session/handback.ts
// B6（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.3 / §3.6 / §5 B6、附录 A handback 组）：回交提交、回交主人路由与回交展示（L3，feature 白名单 []）。
// 4 个类方法（displayHandback/handbackFlowId/handleHandback/commitHandback）与私有形状防御
// `isTaskHandbackShape` 自 app/desktop/session.ts **逐字搬移**（含 JSDoc）：方法体零改动；类外壳重建原
// receiver 面——
//  · 方案 §3.6 handback 的 2 个状态字段（enqueuedHandbackKeys/pendingHandbackKeys）**由本模块单 owner
//    持有并创建**（HandbackState）；门面仅保留同一实例访问器（delivery/store 恢复路径经门面访问器写同一
//    Set，B4 既有口径），不造第二份状态；
//  · 其余被引用的跨簇状态（starTaskIds/reportedTaskKeys/governanceHandbackMirrored/lastGovernanceRuntime/
//    taskHandbackCommits/taskDeliveryCommits/planEscalations/planEscalationPrompted）按方案 §3.6 属其他
//    模块，B6 经 `HandbackRefs` 显式传入**同一实例**（只读/按原样写入；不双写、不复制）；
//  · 尚未迁出的门面方法（findLiveRuntime/activeRuntimeFor/enqueueDelivery/drainQueue）经 `HandbackPorts`
//    箭头回调注入，运行期调用、参数逐位原样转发；
//  · 已迁出的 shared 方法经同名同义委托 → shared/*（与门面委托同一函数、同一入参）。
// **B8 修复语义逐字保留**：`isTaskHandbackShape` 形状校验先于 `hb.taskId` 读取；坏形状走 commitHandback
// 的 fail-closed 系统行；`handbackOwner` 合批语义（`resolvedTarget === handbackOwner || chief`）随
// commitHandback 全文搬移，判定/顺序/文案不变。
// 可见性 private → 模块内 public 仅为门面委托可调用（不进入公开导出面）。
// 依赖规则（结构测试 R-c）：L3 handback 只可导入 L0（contracts/shared）与外部 src；不得导入 barrel/feature。

import { createHash } from "node:crypto";
import { createDiagnosticLogger } from "../../../src/common/shared/diagnostics.ts";
import { handbackKey, renderHandbackPrompt, renderWorkReportPrompt, type HandbackEvent, type TaskHandback } from "../../../src/common/编排/handback.ts";
import { appendRoleLog, readRoleLog } from "../../../src/common/编排/role-log.ts";
import { reportTargetForTaskCreator } from "../../../src/common/编排/workflow-preconditions.ts";
import { shortenSummary, taskEvent, taskReportStatusOf, type TaskReplay } from "../../../src/common/编排/task-state.ts";
import { isBuiltInGovernanceRoleId } from "../../../src/service/boundary/resolve-boundary.ts";
import { prepareCreatedTaskClose, recordTaskObservation } from "../../../src/pipeline/orchestration/trunk-runtime.ts";
import type { RuntimeKind } from "../../../src/common/shared/runtime-shared.ts";
import type { RuntimeLiveReportViewV1, RuntimeReportSnapshotV1, TaskStateEvent } from "../../../src/model/runtime.ts";
import type { GovernanceModel } from "../../../src/model/role.ts";
import { mainT } from "../i18n.ts";
import { a11ResumeKey, evidenceOperatorBinding, isOperationsParentEffect, operationsTasks, operationsWakeKey, parkDesktopA11Disposition, workflowTaskEffectMatches, workflowWrittenReviewEvidence } from "../durable-workflow-a.ts";
import { recordAcceptanceEnvironmentReport, recoveryWakeKey } from "../durable-acceptance-environment.ts";
import { readCollectionEvidence } from "../durable-acceptance-workspace.ts";
import { verifyDurableTaskCommit } from "../workflow-git.ts";
import type { SessionManagerDeps } from "./contracts/deps.ts";
import type { DurableEvidenceRef, DurableFact, DurablePendingTask, DurableProjection } from "../../../src/model/durable-workflow.ts";
import { durableTaskId, isDirectProductCapability, recordWorkflowNotice } from "../durable-workflow.ts";
import { isRuntimeKind } from "../runtime-config.ts";
import type { DeliveryItem, DesktopOrchestrationEvent, LiveSession } from "./contracts/session-types.ts";
import { now } from "./shared/clock.ts";
import { queueKey } from "./shared/keys.ts";
import { emitDeliveryNote } from "./shared/notifier.ts";
import { chiefTaskRoleIdOf, findListingForFeedback, handbackOwnerRoleId } from "./shared/roles.ts";
import { appendTaskStateResult, readTasks, taskCreators } from "./shared/tasks-store.ts";
import { shouldSuppressStarTaskReport } from "./shared/text.ts";

function proposalEvidencePaths(flowId: string, evidence: RuntimeReportSnapshotV1["evidence"]): string[] {
  const version = "-v[1-9][0-9]{0,8}\\.md";
  const namedMaterial = new RegExp(`^(docs/proposals/${flowId}-(?:proposal|modules|roster)${version}|docs/contracts/${flowId}-architecture${version})(.*)$`, "u");
  const paths = new Set<string>();
  for (const item of evidence) {
    if (item.truncated || item.redacted || item.text.length > 512 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(item.text)) continue;
    const match = namedMaterial.exec(item.text);
    if (!match) continue;
    const ending = match[2]!.trimStart();
    if (ending) {
      const parentheses = ending.startsWith("(") && ending.endsWith(")") || ending.startsWith("（") && ending.endsWith("）");
      const note = ending.slice(1, -1);
      if (!parentheses || !note.trim() || /[.\/\\()（）\[\]【】<>`]/u.test(note)) continue;
    }
    paths.add(match[1]!);
  }
  return [...paths].sort();
}

/** handback 模块单 owner 的状态（方案 §3.6 handback 的 2 个字段；本模块创建）。 */
export interface HandbackState {
  readonly enqueuedHandbackKeys: Set<string>;
  readonly pendingHandbackKeys: Set<string>;
}

/** 回交方法读取的跨模块状态面（同一实例；方案 §3.6 归属其他模块，B6 只读/按原样写入）。 */
export interface HandbackRefs {
  starTaskIds: ReadonlySet<string>;
  reportedTaskKeys: Set<string>;
  governanceHandbackMirrored: Map<string, number>;
  lastGovernanceRuntime: ReadonlyMap<string, RuntimeKind>;
  taskHandbackCommits(): Map<string, Promise<void>>;
  taskDeliveryCommits(): ReadonlyMap<string, { done: Promise<void>; finish: () => void }>;
  planEscalations(): ReadonlyMap<string, Promise<void>>;
  planEscalationPrompted(): Set<string>;
}

/** 尚未迁出（B6 范围外）的门面方法端口；门面以箭头回调注入，参数逐位原样转发。 */
export interface HandbackPorts {
  findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined;
  activeRuntimeFor(projectRoot: string): RuntimeKind | undefined;
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void;
  drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void>;
}

/** 回交提交、回交主人路由与回交展示（原 SessionManager 4 方法的同签名实现）。 */
export class Handback {
  readonly state: HandbackState;
  private readonly refs: HandbackRefs;
  private readonly port: HandbackPorts;
  private readonly deps: SessionManagerDeps;
  constructor(refs: HandbackRefs, port: HandbackPorts, deps: SessionManagerDeps) {
    this.refs = refs;
    this.port = port;
    this.deps = deps;
    this.state = {
      enqueuedHandbackKeys: new Set<string>(),
      pendingHandbackKeys: new Set<string>(),
    };
  }

  /* 本模块单 owner 状态（方案 §3.6 handback；同一 Set 实例供 delivery/store 恢复路径读写）。 */
  private get enqueuedHandbackKeys(): Set<string> { return this.state.enqueuedHandbackKeys; }
  private get pendingHandbackKeys(): Set<string> { return this.state.pendingHandbackKeys; }

  /* 跨模块只读/按原样写入的状态（同一实例；延迟取值，两阶段装配）。 */
  private get starTaskIds(): ReadonlySet<string> { return this.refs.starTaskIds; }
  private get reportedTaskKeys(): Set<string> { return this.refs.reportedTaskKeys; }
  private get governanceHandbackMirrored(): Map<string, number> { return this.refs.governanceHandbackMirrored; }
  private get lastGovernanceRuntime(): ReadonlyMap<string, RuntimeKind> { return this.refs.lastGovernanceRuntime; }
  private get taskHandbackCommits(): Map<string, Promise<void>> { return this.refs.taskHandbackCommits(); }
  private get taskDeliveryCommits(): ReadonlyMap<string, { done: Promise<void>; finish: () => void }> { return this.refs.taskDeliveryCommits(); }
  private get planEscalations(): ReadonlyMap<string, Promise<void>> { return this.refs.planEscalations(); }
  private get planEscalationPrompted(): Set<string> { return this.refs.planEscalationPrompted(); }

  /* L0 共享函数（同名同义委托；与门面委托同一实现、同一入参）。 */
  private now(): number { return now(this.deps); }
  private queueKey(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): string {
    return queueKey(projectRoot, targetRoleId, runtime);
  }
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }
  private handbackOwnerRoleId(projectRoot: string): string | null { return handbackOwnerRoleId(projectRoot, this.deps); }
  private chiefTaskRoleIdOf(projectRoot: string): string | null { return chiefTaskRoleIdOf(projectRoot, this.deps); }
  private findListingForFeedback(projectRoot: string): ReturnType<typeof findListingForFeedback> {
    return findListingForFeedback(projectRoot, this.deps);
  }
  private async readTasks(projectRoot: string): Promise<TaskReplay> {
    return readTasks(projectRoot);
  }
  private async appendTaskStateResult(projectRoot: string, event: TaskStateEvent): ReturnType<typeof recordTaskObservation> {
    return appendTaskStateResult(projectRoot, event);
  }

  /* 尚未迁出的门面方法端口（运行期调用；参数逐位原样转发、返回原样返回）。 */
  private findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined {
    return this.port.findLiveRuntime(projectRoot, roleId);
  }
  private activeRuntimeFor(projectRoot: string): RuntimeKind | undefined {
    return this.port.activeRuntimeFor(projectRoot);
  }
  private enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void {
    return this.port.enqueueDelivery(projectRoot, targetRoleId, item);
  }
  private drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void> {
    return this.port.drainQueue(projectRoot, targetRoleId, runtime);
  }

  // —— displayHandback（B6 自 session.ts 逐字搬移）——
  displayHandback(event: HandbackEvent): DesktopOrchestrationEvent {
    const { handback: _internal, ...safe } = event;
    return { kind: 'handback', summary: event.report || event.liveReport ? safe.summary : mainT("ui.events.handbackLegacy"), ...(safe.report ? { report: safe.report } : {}), ...(safe.liveReport ? { liveReport: safe.liveReport } : {}), ...(safe.reportPersistence ? { reportPersistence: safe.reportPersistence } : {}) };
  }
  // —— handbackFlowId（B6 自 session.ts 逐字搬移）——
  /**
   * 回交所归属的治理流程 id（收尾推进用）：取该回交真实轮次 origin 上的 `flowIds`——该 origin 由
   * Convener 派发的 `dispatch` 条目带入 flowId。多流程批次/旧调用/无 flowId ⇒ 返回 undefined（不猜、不派）。
   */
  handbackFlowId(entry: LiveSession, hb: TaskHandback | undefined): string | undefined {
    if (hb === undefined || hb === null || typeof hb !== "object") return undefined; // 坏形状交给 handleHandback 的防御分支
    const origin = typeof hb.turnId === "string" && hb.turnId !== ""
      ? entry.origins.byTurn.get(hb.turnId)
      : entry.origins.running;
    const flowIds = origin?.flowIds ?? [];
    return flowIds.length === 1 ? flowIds[0] : undefined;
  }
  // —— isTaskHandbackShape（B6 自 session.ts 逐字搬移）——
  /** **坏形状防御（v2.0.0 B8 回归修复）**：按 `TaskHandback` 契约校验必要字段类型。
   *  真机形态是事件载荷缺失（`handback: undefined`）——修复前 `handleHandback` 先读 `hb.taskId` ⇒
   *  TypeError 被事件消费环兜底为通用「会话事件流异常」，专用「形状不符」防线失效。
   *  `roleId`/`status`/`summary`/`evidence`/`at` 是 `handbackKey`/渲染/落账的最小必要面；
   *  可选字段若出现也按契约校验类型。坏形状一律交给 `commitHandback` 既有 fail-closed 分支。 */
  isTaskHandbackShape(value: unknown): value is TaskHandback {
    if (value === null || typeof value !== "object") return false;
    const hb = value as Partial<Record<keyof TaskHandback, unknown>>;
    if (typeof hb.roleId !== "string") return false;
    if (hb.status !== "completed" && hb.status !== "blocked" && hb.status !== "unreported" && hb.status !== "failed" && hb.status !== "aborted") return false;
    if (typeof hb.summary !== "string") return false;
    if (!Array.isArray(hb.evidence) || !hb.evidence.every((item) => typeof item === "string")) return false;
    if (typeof hb.at !== "string") return false;
    if (hb.taskId !== undefined && typeof hb.taskId !== "string") return false;
    if (hb.turnId !== undefined && typeof hb.turnId !== "string") return false;
    if (hb.round !== undefined && typeof hb.round !== "number") return false;
    return true;
  }
  // —— handleHandback（B6 自 session.ts 逐字搬移）——
  handleHandback(projectRoot: string, runtime: RuntimeKind, hb: TaskHandback, report?: RuntimeReportSnapshotV1, liveReport?: RuntimeLiveReportViewV1, liveDurability?: 'memory-only' | 'unknown-live', flowId?: string): Promise<boolean> {
    // 形状防御必须在读 `hb.taskId` **之前**（v2.0.0 B8：此前坏载荷会抛 TypeError，退化为事件流异常）。
    if (!this.isTaskHandbackShape(hb)) return this.commitHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId);
    if (!hb.taskId) return this.commitHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId);
    const key = `${projectRoot}\u0000${hb.taskId}`;
    // Consecutive real turns of one task can finish before the prior detached report is registered.
    // Order those existing observations; never retry a rejected business operation or wait for the creator's model turn.
    const prior = this.taskHandbackCommits.get(key) ?? Promise.resolve();
    const attempt = prior.then(() => this.commitHandback(projectRoot, runtime, hb, report, liveReport, liveDurability, flowId));
    const committed = attempt.then(() => undefined, () => undefined);
    this.taskHandbackCommits.set(key, committed);
    void committed.then(() => { if (this.taskHandbackCommits.get(key) === committed) this.taskHandbackCommits.delete(key); });
    return attempt;
  }
  // —— commitHandback（B6 自 session.ts 逐字搬移）——
  async commitHandback(projectRoot: string, runtime: RuntimeKind, hb: TaskHandback, report?: RuntimeReportSnapshotV1, liveReport?: RuntimeLiveReportViewV1, liveDurability?: 'memory-only' | 'unknown-live', flowId?: string): Promise<boolean> {
    const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: hb?.roleId });
    diagnostic.record("report.received", { outcome: hb?.status });
    let pendingKey: string | undefined;
    try {
      if (!this.isTaskHandbackShape(hb)) {
        this.emitDeliveryNote(projectRoot, runtime,
          this.handbackOwnerRoleId(projectRoot),
          mainT("main.common.unknownRole"),
          mainT("main.session.handbackMalformed")
        );
        return false;
      }
      hb = structuredClone(hb);
      if (report) report = structuredClone(report);
      if (liveReport) liveReport = structuredClone(liveReport);
      if (hb.taskId?.startsWith("dw-") && this.deps.durableWorkflow) {
        return await this.commitDurableHandback(projectRoot, runtime, hb, report);
      }
      const ownerRoleId = this.handbackOwnerRoleId(projectRoot);
      // 2026-10-29（方案 v2.1 §5.1/M9，F1）：任务绑定报告**按 `task.created.from` 回创建者**——
      // 项目 worker/质检 → 发起者（运营或幕僚）；产品/策划/人事/运营由幕僚派发 → 幕僚。
      // 无任务绑定的内置 worker → 幕僚（下方既有防御分支）。用同步内存索引，避免读盘改变并发回交顺序。
      const starTask = typeof hb.taskId === "string" && hb.taskId !== "" && this.starTaskIds.has(hb.taskId);
      const chiefRoleId = this.chiefTaskRoleIdOf(projectRoot);
      const convenerRoleId = this.handbackOwnerRoleId(projectRoot);
      const taskCreator = starTask ? taskCreators.get(hb.taskId!) : undefined;
      // 2026-10-24（治理协调，设计 v1 §6.2/§6.3）：**按来源**选回交目标——
      //  · 内置治理角色（Draft/Steward/Crew/Proof；编排 `suppressHandback` 正常不发，这里只做防御路由）
      //    → Lead（`primaryRoleId`），Lead 自身不自我回交；single/su 保持旧行为（内置来源不自我回交）。
      //  · 项目 worker → Steward（`handbackOwnerRoleId` 不变；single 仍是 su）。
      // 不解除编排的 `suppressHandback`、不新增工具/账本 kind；只是消息路由。
      const listing = this.findListingForFeedback(projectRoot);
      const model: GovernanceModel = listing?.governanceModel ?? "single";
      const builtInSource = isBuiltInGovernanceRoleId(hb.roleId);
      let targetRoleId: string | null = ownerRoleId;
      if (starTask && hb.roleId !== chiefRoleId) {
        // 任务绑定：按创建者路由（creator 缺失的旧记录按 chief 兼容，保持既有主链行为）。
        targetRoleId = reportTargetForTaskCreator({ creator: taskCreator ?? "chief", chiefRoleId, convenerRoleId });
      } else if (builtInSource) {
        if (model !== "trio") return false; // single/su：内置来源（su 自身）不自我回交（旧行为逐字不变）
        const leadRoleId = typeof listing?.primaryRoleId === "string" ? listing.primaryRoleId : "";
        if (leadRoleId === "") return false; // 主入口未枚举到：不猜、不改投 Steward；settle 反馈同样按无 listing 跳过
        if (hb.roleId === leadRoleId) return false; // Lead 自身不自我回交（防循环）
        targetRoleId = leadRoleId;
      } else if (ownerRoleId !== null && hb.roleId === ownerRoleId) {
        return false; // single su 自身等防御（trio 的 Convener 走上方内置分支）
      }
      const key = `${projectRoot}\u0000${runtime}\u0000${handbackKey(hb)}`;
      let alreadyReported = false;
      // BUG-5（2026-11-05 精化）：任务已收口或**同一回合**已报告 ⇒ 重复回交不再入队；
      // blocked 之后的新回合真实报告必须投递（详见 shouldSuppressStarTaskReport 注释）。
      let closedStageRequestObservation = false;
      if (starTask && typeof hb.taskId === "string" && hb.taskId !== "") {
        const record = (await this.readTasks(projectRoot)).records.get(hb.taskId);
        // B19（2026-11-11，RR14）：已收口 **stage-request** 的最终报告不能按普通 task.reported
        // 观察写入（closed 任务的 task observation 会被 `task-observation-invalid` 拒绝），但
        // 报告本身仍须投递给 chief。标记后跳过 observation，直接进入投递队列。
        closedStageRequestObservation = record?.closed !== undefined && record.created?.taskKind === "stage-request";
        // B19：已收口 **stage-request** 的任务收口抑制不适用——幕僚通常在
        // 运营交最终报告前关闭调度请求；该报告是阶段完成/下一阶段的唯一唤醒来源，必须入队投递。
        // 生产任务的 closed/同回合抑制保持 BUG-5 原语义（重复回交不入队）。
        const suppressed = record !== undefined && !closedStageRequestObservation
          && shouldSuppressStarTaskReport({
            closed: record.closed !== undefined,
            priorTurnIds: record.reports.map((entry) => entry.turnId),
            ...(hb.turnId !== undefined ? { turnId: hb.turnId } : {}),
          });
        if (suppressed) {
          diagnostic.record("report.suppressed.task-terminal", {
            taskId: hb.taskId,
            closed: record?.closed !== undefined,
            reports: record?.reports.length ?? 0,
          });
          if (record?.closed !== undefined) return false;
          if (this.enqueuedHandbackKeys.has(key)) return true;
          alreadyReported = true; // Durable prior report without a delivery: resume only its informational handback.
        }
      }
      if (this.enqueuedHandbackKeys.has(key)) {
        diagnostic.record("report.duplicate");
        return true;
      }
      if (this.pendingHandbackKeys.has(key)) return false;
      this.pendingHandbackKeys.add(key); pendingKey = key;
      // B 批：工作结果事件（`task.reported`）——按 `taskId+turnId` 去重；写失败只诊断、不丢报告
      // （失败保 saved snapshot，可在真实新事实或显式保存/投递操作后重核；不假称已登记/已投递）。
      if (starTask && typeof hb.taskId === "string" && !closedStageRequestObservation) {
        const reportKey = `${hb.taskId}\u0000${hb.turnId ?? createHash("sha256").update(hb.summary).digest("hex").slice(0, 16)}`;
        if (!this.reportedTaskKeys.has(reportKey) && !alreadyReported) {
          // Delivery's own post-send ledger writer is independent of this detached consumer.
          const delivery = this.taskDeliveryCommits.get(`${projectRoot}\u0000${hb.taskId}`);
          if (delivery) await delivery.done;
          const reportedAt = Date.parse(hb.at);
          const event = taskEvent("task.reported", {
            taskId: hb.taskId,
            from: hb.roleId,
            status: taskReportStatusOf(hb.status),
            summary: shortenSummary(hb.summary),
            ...(hb.evidence.length > 0 ? { evidence: hb.evidence.slice(0, 5) } : {}),
            ...(hb.turnId !== undefined && hb.turnId !== "" ? { turnId: hb.turnId } : {}),
          }, () => Number.isFinite(reportedAt) ? new Date(reportedAt) : new Date(this.now()));
          const registered = await this.appendTaskStateResult(projectRoot, event);
          if (!registered.ok) {
            this.emitDeliveryNote(projectRoot, runtime, targetRoleId, hb.roleId,
              `任务报告已保存但状态登记失败，尚未投递给原创建者：${registered.code}：${registered.message}`);
            return false;
          }
          this.reportedTaskKeys.add(reportKey);
        }
      }
      // 2026-11-05（客户最终口径：不是自动发卡，是让运营自己选择）：star 任务报告 blocked（trio、flowId 可解析）
      // 时**首次即**给 convener 一条 delivery-note 提示——是否调用 `report_plan_escalation`
      // （category 选 scheme/environment/authority/evidence）向客户发方案升级卡，或继续核查/派重做，由运营自行判断。
      // 应用**不自动发卡、不替运营或客户做决定**。节流：同 flow 有在途升级卡 ⇒ 不提示；已提示且未 done ⇒ 不重复；
      // done/failed/aborted 或升级卡成功提交 ⇒ 清除标记（下一次 blocked 可再提示）。
      if (model === "trio" && starTask && typeof hb.taskId === "string" && hb.taskId !== "") {
        const promptRecord = (await this.readTasks(projectRoot)).records.get(hb.taskId);
        const promptFlowId = flowId ?? promptRecord?.created?.flowId;
        if (promptFlowId !== undefined && promptFlowId !== "") {
          const promptKey = `${projectRoot}\u0000${promptFlowId}`;
          const reportStatus = taskReportStatusOf(hb.status);
          if (reportStatus === "blocked") {
            if (!this.planEscalations.has(promptKey) && !this.planEscalationPrompted.has(promptKey)) {
              if (this.deps.customerInput !== undefined) {
                this.planEscalationPrompted.add(promptKey);
                const convener = this.handbackOwnerRoleId(projectRoot) ?? "convener";
                const runtimeForNote =
                  this.findLiveRuntime(projectRoot, convener) ??
                  this.lastGovernanceRuntime.get(projectRoot) ??
                  this.activeRuntimeFor(projectRoot) ??
                  "demo";
                this.emitDeliveryNote(
                  projectRoot,
                  runtimeForNote,
                  convener,
                  "convener",
                  mainT("main.planEscalation.blockedPrompt", {
                    flowId: promptFlowId,
                    summary: shortenSummary(hb.summary, 160),
                  }),
                );
              } else {
                // 无客户卡通道 ⇒ 只记诊断；不提示、不影响报告路由、不伪造裁定。
                createDiagnosticLogger({ component: "desktop.session", projectRoot }).record("plan-escalation.prompt.skipped", {
                  requestId: `plan-escalation-${promptFlowId}`,
                  reasonCode: "customer-card-channel-unavailable",
                });
              }
            }
          } else {
            // done/failed/aborted 都清除「已提示」标记——避免陈旧标记阻断后续新的 blocked（取舍见变更记录）。
            this.planEscalationPrompted.delete(promptKey);
          }
        }
      }
      // 输入文案：编排的 `renderHandbackPrompt`（**单一来源**——两前端共用，本层不各写一份）；**入队即定格**。
      // B 批：星形任务回交用 `renderWorkReportPrompt`（`[工作结果]` 固定字段）；旧 flow 回交逐字不变。
      // 渲染失败（载荷再坏一档）→ 如实系统行 + 不入队（**绝不**把 undefined 喂进渲染函数）。
      let text: string;
      try {
        text = starTask ? renderWorkReportPrompt(hb) : renderHandbackPrompt(hb);
      } catch (err) {
        this.emitDeliveryNote(projectRoot, runtime,
          targetRoleId,
          hb.roleId,
          mainT("main.session.handbackRenderFailed", { detail: err instanceof Error ? err.message : String(err) })
        );
        return false;
      }
      if (starTask && hb.taskId !== undefined && (targetRoleId === "chief" || targetRoleId === "convener")) {
        const closing = await prepareCreatedTaskClose({ projectRoot, actorRoleId: targetRoleId, taskId: hb.taskId });
        text += closing.ok
          ? `\n\n[应用绑定的原创建者收口依据]\n${JSON.stringify(closing)}\n由原创建者核对报告后调用 close_created_task；报告返回不等于任务已收口。`
          : `\n\n[收口依据尚不可用] ${closing.message}`;
      }
      this.enqueueDelivery(projectRoot, targetRoleId ?? "", {
        kind: "handback",
        runtime,
        targetRoleId: targetRoleId ?? "",
        sourceRoleId: hb.roleId,
        text,
        summary: mainT("ui.events.handbackDeliveryWithRole", { role: hb.roleId }),
        dedupKey: key,
        handback: hb,
        ...(starTask && hb.taskId !== undefined ? { taskId: hb.taskId } : {}),
        ...(flowId !== undefined ? { flowId } : {}),
        ...(report ? { report } : {}),
        ...(liveReport ? { liveReport, liveDurability } : {}),
      });
      this.enqueuedHandbackKeys.add(key);
      // 内置来源回交已投 Lead ⇒ 同一轮 settle 的治理反馈不再重复投（短时标记，见 mirrorGovernanceFeedback）。
      if (builtInSource && model === "trio") {
        this.governanceHandbackMirrored.set(this.queueKey(projectRoot, hb.roleId, runtime), this.now());
        diagnostic.record("report.routed.lead", { targetRoleId: targetRoleId ?? "" });
      }
      diagnostic.record("report.enqueued");
      await this.drainQueue(projectRoot, targetRoleId, runtime);
      return true;
    } catch (err) {
      diagnostic.error("report.failed", err);
      // 兜底（belt & braces）：任何意外都如实拦截为系统行——**不产生未捕获拒绝**。
      this.emitDeliveryNote(projectRoot, runtime,
        this.handbackOwnerRoleId(projectRoot),
        mainT("main.common.unknownRole"),
        mainT("main.session.handbackException", { detail: err instanceof Error ? err.message : String(err) })
      );
      return false;
    } finally {
      if (pendingKey) this.pendingHandbackKeys.delete(pendingKey);
    }
  }

  private async commitDurableHandback(
    projectRoot: string, runtime: RuntimeKind, handback: TaskHandback, report: RuntimeReportSnapshotV1 | undefined,
  ): Promise<boolean> {
    if (!report || report.taskId !== handback.taskId
      || report.source.roleId !== handback.roleId || report.source.runtime !== runtime
      || report.source.turnId !== handback.turnId || report.status !== handback.status) return false;
    const key = `durable-report:${projectRoot}:${report.reportId}`;
    if (this.pendingHandbackKeys.has(key)) return false;
    this.pendingHandbackKeys.add(key);
    try {
      return await this.persistDurableHandback(projectRoot, runtime, handback, report);
    } finally {
      this.pendingHandbackKeys.delete(key);
    }
  }

  private async persistDurableHandback(projectRoot: string, runtime: RuntimeKind, handback: TaskHandback, report: RuntimeReportSnapshotV1): Promise<boolean> {
    const durable = this.deps.durableWorkflow!;
    const store = await durable.store();
    const convener = this.handbackOwnerRoleId(projectRoot);
    const views = (await store.listProjections(projectRoot)).filter(view => view.status === "waiting");
    const revisionView = views.find(({ documentRevision }) => documentRevision?.task.taskId === report.taskId
      && documentRevision.roleId === report.source.roleId);
    const revision = revisionView?.documentRevision;
    if (revisionView && revision) {
      if (revision.status === "pending") {
        await store.failDocumentRevision(revisionView.ref, { revisionId: revision.id, turnId: report.source.turnId,
          reason: "修订回合已经结束，尚未通过专用入口提交候选。" });
        durable.activate();
      }
      return true;
    }
    if (views.some(({ documentRevision }) => documentRevision && documentRevision.status !== "resumed"
      && documentRevision.origin.taskId === report.taskId && report.source.roleId === "convener")) return true;
    const pendingFor = (view: DurableProjection) => view.pendingTasks?.find(task => task.taskId === report.taskId
      && task.roleId === report.source.roleId && (task.state === "pending" || task.state === "reported"));
    const graph = views.find(view => view.schema === 2 && (pendingFor(view) || this.graphOperatorBinding(view, report)));
    if (graph) {
      const pending = pendingFor(graph);
      if (report.origin !== "submitted-report" &&
        (!graph.workflowOwnedDispatch && !isDirectProductCapability(pending?.capability) || report.status === "completed")) return false;
      return this.commitGraphReport(graph, pending, report);
    }
    const projection = views.find(view =>
      (view.task?.taskId === report.taskId || view.task?.parentTaskId === report.taskId || (convener && [
        durableTaskId(view.ref, convener, "B1", view.attempt), durableTaskId(view.ref, convener, "B3", view.attempt),
      ].includes(report.taskId ?? ""))));
    if (!projection || projection.status !== "waiting") return false;
    if (report.origin !== "submitted-report" && (!projection.workflowOwnedDispatch || report.status === "completed")) return false;
    const { ref, attempt, stepId, action } = projection;
    const facts = store.listFacts(ref);
    const assigned = facts.find(({ fact }) => fact.kind === "task-bound" && fact.task.taskId === report.taskId)?.fact;
    const operatorStage = action === "b3-implement-and-accept" ? "B3" : "B1";
    const operatorAttempt = operatorStage === "B1" ? projection.analysisReport?.attempt ?? attempt : attempt;
    const operatorTaskId = projection.workflowOwnedDispatch ? projection.task?.parentTaskId : convener && durableTaskId(ref, convener, operatorStage, operatorAttempt);
    const parent = operatorStage === "B1"
      ? facts.find(({ fact }) => fact.kind === "stage-request" && fact.attempt === operatorAttempt)?.fact
      : projection.scope;
    const production = assigned?.kind === "task-bound" && assigned.task.roleId === handback.roleId;
    const operator = !!parent && handback.roleId === convener && report.taskId === operatorTaskId;
    if (!production && !operator) return false;
    const evidenceParent = operatorStage === "B3" && operator ? evidenceOperatorBinding(projection) : undefined;
    const audit = evidenceParent && projection.evidenceAudit;
    if (audit && evidenceParent && report.origin === "submitted-report" && report.status === "blocked") {
      const current = () => {
        const live = store.lookup(ref);
        return live?.status === "waiting" && live.stepId === stepId && live.attempt === attempt
          && live.evidenceAudit?.basis.generation === audit.basis.generation
          && store.listEffects(ref, "model-send").some(row => row.state === "succeeded" && row.intent.task?.taskId === report.taskId
            && row.intent.task?.roleId === report.source.roleId && row.intent.expected?.runtime === runtime
            && row.intent.expected?.evidenceAuditParentGeneration === String(audit.basis.generation)
            && row.result?.result?.turnId === report.source.turnId);
      };
      if (!current()) return false;
      const saved = await store.recordEvidenceBlocker(ref, { parentTask: evidenceParent, originId: report.source.turnId,
        generation: audit.basis.generation, reason: shortenSummary(report.summary.text, 300) }, current);
      if (saved.ok) durable.activate();
      return saved.ok && saved.value.state !== "ignored";
    }
    const workStep = production ? assigned.stepId : operatorStage === "B1" ? parent?.stepId : stepId;
    const workAttempt = production ? assigned.attempt : operatorAttempt;
    if (!workStep) return false;
    const cleanHandback = this.durableHandbackOf(report);
    if (projection.workflowOwnedDispatch && report.taskId) {
      const effect = store.listEffects(ref, "model-send").find(row => row.intent.stepId === workStep && row.intent.attempt === workAttempt
        && row.intent.task?.taskId === report.taskId && row.intent.task.roleId === report.source.roleId
        && row.intent.expected?.runtime === runtime);
      if (!effect || effect.state === "not-started" || effect.result?.result?.turnId !== report.source.turnId) return false;
      const journal = await this.readTasks(projectRoot);
      if (!journal.records.get(report.taskId)?.reports.some(row => row.turnId === report.source.turnId)) {
        const mirrored = await this.appendTaskStateResult(projectRoot, taskEvent("task.reported", {
          taskId: report.taskId, from: report.source.roleId, status: taskReportStatusOf(report.status),
          summary: shortenSummary(cleanHandback.summary), evidence: cleanHandback.evidence, turnId: report.source.turnId,
        }));
        if (!mirrored.ok) return false;
      }
    }
    if (projection.workflowOwnedDispatch && report.status !== "completed") {
      const chief = this.chiefTaskRoleIdOf(projectRoot);
      const summary = `${operatorStage} 工作流回交需要幕僚处理（${ref.instanceId}，#${report.taskId}）。${cleanHandback.summary}`;
      if (chief) {
        const notice = await recordWorkflowNotice(projectRoot, chief, { ref: report.reportId, summary, taskId: report.taskId ?? undefined });
        if (notice === "recorded") this.emitDeliveryNote(projectRoot, runtime, chief, report.source.roleId, summary);
        else if (notice === "failed") store.block(ref, "workflow-notice-unavailable", summary);
      }
    }
    const artifacts: DurableEvidenceRef[] = [];
    for (const reference of [...new Set(cleanHandback.evidence)].sort()) {
      const artifact = await store.readEvidence(projectRoot, reference);
      if (artifact.ok) artifacts.push(artifact.value);
    }
    const evidence = store.storeEvidence(ref, { report, handback: cleanHandback, artifacts });
    if (!evidence.ok) return false;
    const address = { stepId: workStep, attempt: workAttempt, key: `report:${report.reportId}` };
    const fact: DurableFact = production
      ? { ...address, kind: "task-report", source: "host", task: assigned.task, evidence: evidence.value }
      : { ...address, kind: "operator-report", source: "host", parentTaskId: report.taskId!, evidence: evidence.value };
    const result = await store.submit(ref, fact);
    return result.ok && result.value.state !== "ignored";
  }

  private graphOperatorBinding(view: DurableProjection, report: RuntimeReportSnapshotV1) {
    if (report.source.roleId !== "convener" || view.action !== "governed-implementation") return undefined;
    return view.pendingTasks?.find(pending => pending.stepId === view.stepId && pending.attempt === view.attempt
      && pending.task.parentTaskId === report.taskId);
  }

  private async commitGraphReport(view: DurableProjection, pending: DurablePendingTask | undefined, report: RuntimeReportSnapshotV1): Promise<boolean> {
    if (!view.workflowOwnedDispatch && !isDirectProductCapability(pending?.capability)) return this.persistGraphReport(view, pending, report);
    const key = `product:${view.ref.instanceId}:${report.reportId}`;
    if (this.pendingHandbackKeys.has(key)) return false;
    this.pendingHandbackKeys.add(key);
    try {
      return await this.persistGraphReport(view, pending, report);
    } finally {
      this.pendingHandbackKeys.delete(key);
    }
  }

  private async persistGraphReport(view: DurableProjection, pending: DurablePendingTask | undefined, report: RuntimeReportSnapshotV1): Promise<boolean> {
    const durable = this.deps.durableWorkflow!;
    const store = await durable.store();
    const { ref, projectRoot } = view;
    const operator = pending ? undefined : this.graphOperatorBinding(view, report);
    const bound = pending ?? operator;
    const taskId = report.taskId;
    if (!bound || !taskId) return false;
    const operations = view.workflowOwnedDispatch && pending?.capability === "operations-implementation" ? pending : undefined;
    const operationsParent = operations && !operations.workItemId && !operations.evidenceWorkOrder ? operations : undefined;
    const a11 = view.a11Disposition;
    if (a11?.retest && a11.state === "parked" && (taskId === a11.childTask.taskId || taskId === a11.parentTask.taskId)) return false;
    const resumedOwner = a11?.state === "resumed" && operations?.workItemId && operations.taskId === a11.childTask.taskId ? a11 : undefined;
    const retiredParent = a11?.state === "resumed" && operationsParent
      ? a11.parentReport && (store.getEvidence(ref, a11.parentReport.evidence) as { report?: RuntimeReportSnapshotV1 } | undefined)?.report : undefined;
    if (resumedOwner && report.origin !== "submitted-report") return false;
    if (retiredParent?.source.turnId === report.source.turnId) return false;
    const recovery = view.workflowOwnedDispatch && pending?.environmentRecovery ? pending : undefined;
    if (recovery?.environmentRecovery === "parent" && (report.origin !== "submitted-report" || report.status !== "blocked")) return false;
    if (operationsParent) {
      if (report.origin !== "submitted-report") return false;
      const { children } = operationsTasks(view);
      if (report.status === "completed" && !view.implementationItems?.every(item => children.some(child =>
        child.workItemId === item.id && child.state === "accepted"))) return false;
    }
    const effects = store.listEffects(ref, "model-send").filter(effect =>
      effect.intent.task?.taskId === taskId && effect.intent.task.roleId === report.source.roleId
      && effect.intent.expected?.runtime === report.source.runtime && effect.state !== "not-started");
    const effect = recovery?.environmentRecovery === "parent" ? effects.find(row => workflowTaskEffectMatches(row, recovery)
      && (row.intent.key === `model:${taskId}` || row.intent.key.startsWith("model:environment-recovery-wake:"))
      && row.result?.result?.turnId === report.source.turnId)
      : operationsParent ? effects.find(row => isOperationsParentEffect(row, operationsParent) && row.result?.result?.turnId === report.source.turnId)
      : pending ? effects.find(row => row.intent.key === `model:${resumedOwner ? a11ResumeKey(resumedOwner.key) : taskId}`)
      : effects.find(row => row.intent.key.startsWith(`model:graph-report:${bound.taskId}:`));
    const directProduct = pending && isDirectProductCapability(pending.capability) ? pending : undefined;
    const review = view.workflowOwnedDispatch && pending && (pending.capability === "independent-standard"
      || pending.capability === "independent-assessment" && pending.reviewWritePath) ? pending : undefined;
    if (!effect || (typeof effect.result?.result?.turnId === "string" && effect.result.result.turnId !== report.source.turnId)) return false;
    if (a11?.state === "resumed" && operationsParent
      && (effect.intent.key === `model:${operationsParent.taskId}` || effect.intent.key === `model:${operationsWakeKey(a11.childTask.taskId, a11.childReport.key)}`)) return false;
    const exact = review ?? operations ?? recovery ?? (pending?.evidenceWorkOrder ? pending : undefined);
    if (exact && (!workflowTaskEffectMatches(effect, exact) || effect.result?.result?.turnId !== report.source.turnId)) return false;
    if (directProduct) {
      if (effect.intent.stepId !== directProduct.stepId || effect.intent.attempt !== directProduct.attempt
        || effect.intent.task?.parentTaskId !== ref.instanceId
        || effect.result?.result?.turnId !== report.source.turnId) return false;
      if (effect.state !== "succeeded") {
        const recovered = await store.settleEffect(ref, { key: effect.intent.key, token: effect.token, outcome: "succeeded",
          evidence: "The exact product turn has a durable runtime report.", result: { turnId: report.source.turnId } });
        if (!recovered.ok) return false;
      }
    }
    const order = pending?.evidenceWorkOrder;
    const auditGeneration = view.evidenceAuditEnabled && pending?.capability === "independent-assessment"
      ? view.evidenceAudit?.basis.generation : undefined;
    const currentEvidenceTurn = () => {
      const now = store.lookup(ref);
      return now?.status === "waiting" && now.engine === "healthy" && now.stepId === view.stepId && now.attempt === view.attempt
        && now.evidenceAudit?.basis.generation === (order?.basis.generation ?? auditGeneration ?? view.evidenceAudit?.basis.generation)
        && store.listEffects(ref, "model-send").some(row => row.intent.key === effect.intent.key && row.state === "succeeded"
          && row.result?.result?.turnId === report.source.turnId);
    };
    if ((order || auditGeneration !== undefined) && (report.origin !== "submitted-report" || !currentEvidenceTurn())) return false;
    const collection = order && readCollectionEvidence(report.evidence.map(item => item.text));
    if (order && !collection) return false;
    if (operationsParent && view.evidenceAuditEnabled && view.evidenceAudit && report.status === "blocked") {
      if (effect.intent.expected?.evidenceAuditParentGeneration !== String(view.evidenceAudit.basis.generation)) return false;
      const saved = await store.recordEvidenceBlocker(ref, { parentTask: operationsParent.task, originId: report.source.turnId,
        generation: view.evidenceAudit.basis.generation, reason: shortenSummary(report.summary.text, 300) }, currentEvidenceTurn);
      if (saved.ok) durable.activate();
      return saved.ok;
    }
    const handback = this.durableHandbackOf(report);
    const proposal = view.workflowOwnedDispatch && view.action === "author-proposal" && pending?.capability === "author-proposal"
      && report.origin === "submitted-report" && report.status === "completed" ? pending : undefined;
    if (proposal && (view.status !== "waiting" || proposal.stepId !== view.stepId || proposal.attempt !== view.attempt
      || proposal.task.stage !== "A5" || proposal.task.stageAttempt !== view.attempt || proposal.task.parentTaskId !== ref.instanceId
      || proposal.roleId !== "rapporteur" || report.source.roleId !== proposal.roleId || proposal.flowId !== view.flowId
      || proposal.dispatch.actor !== "application" || proposal.dispatch.flowId !== proposal.flowId
      || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(proposal.flowId) || !isRuntimeKind(report.source.runtime)
      || !workflowTaskEffectMatches(effect, proposal) || effect.intent.kind !== "model-send" || effect.intent.expected?.roleId !== proposal.roleId
      || effect.state !== "succeeded" || effect.result?.outcome !== "succeeded" || effect.result.key !== effect.intent.key
      || effect.result.token !== effect.token || effect.result.result?.turnId !== report.source.turnId)) return false;
    const artifacts = review && report.origin === "submitted-report"
      ? await workflowWrittenReviewEvidence(store, view, review) : [];
    const directIntent = directProduct?.capability === "author-intent-direct";
    const artifactPaths = directIntent || review || order ? [] : proposal ? proposalEvidencePaths(proposal.flowId, report.evidence)
      : [...new Set(handback.evidence)].sort();
    for (const file of artifactPaths) {
      const artifact = await store.readEvidence(projectRoot, file);
      if (artifact.ok) artifacts.push(artifact.value);
    }
    const evidence = store.storeEvidence(ref, { report, handback, artifacts });
    if (!evidence.ok) return false;
    if (review?.capability === "independent-assessment" && report.origin === "submitted-report" && report.status === "blocked" && artifacts[0]
      && view.acceptanceEnvironment?.enabled) {
      const journal = await this.readTasks(projectRoot);
      if (!journal.records.get(taskId)?.reports.some(item => item.turnId === report.source.turnId)) {
        const mirrored = await this.appendTaskStateResult(projectRoot, taskEvent("task.reported", {
          taskId, from: report.source.roleId, status: "blocked", summary: shortenSummary(handback.summary),
          evidence: handback.evidence, turnId: report.source.turnId,
        }));
        if (!mirrored.ok) return false;
      }
      const missing = await recordAcceptanceEnvironmentReport({ store, view, pending: review, reportKey: `report:${report.reportId}`,
        originId: report.source.turnId, report: evidence.value, artifact: artifacts[0] });
      if (missing.ok && missing.value === "recorded") {
        durable.activate();
        return true;
      }
      if (!missing.ok) {
        const chief = this.chiefTaskRoleIdOf(projectRoot);
        if (chief) {
          const summary = `A12b 验收环境无法核验（工作流 ${ref.instanceId}，#${taskId}）。${missing.message}`;
          if (await recordWorkflowNotice(projectRoot, chief, { ref: report.reportId, summary, taskId }) === "recorded") {
            this.emitDeliveryNote(projectRoot, report.source.runtime, chief, report.source.roleId, summary);
          }
        }
      }
    }
    const task = pending?.task ?? { ...bound.task, taskId, roleId: report.source.roleId, parentTaskId: bound.taskId };
    const resumedOwnerCurrent = resumedOwner && (() => {
      const current = store.lookup(ref);
      return current?.status === "waiting" && current.engine === "healthy" && current.stepId === view.stepId
        && current.attempt === view.attempt && current.a11Disposition?.key === resumedOwner.key
        && current.a11Disposition.state === "resumed" && current.a11Disposition.generation === resumedOwner.generation
        && store.listEffects(ref, "model-send").some(row => row.intent.key === effect.intent.key && row.state === "succeeded"
          && row.result?.result?.turnId === report.source.turnId && !!operations && workflowTaskEffectMatches(row, operations));
    });
    const submit = () => store.submitCapability(ref, {
      key: `report:${report.reportId}`, stepId: bound.stepId, attempt: bound.attempt, flowId: bound.flowId,
      source: { roleId: report.source.roleId, originId: report.source.turnId, parentTaskId: taskId },
      input: pending ? { kind: "task-report", task, evidence: evidence.value, ...(resumedOwner ? { recoveryKey: resumedOwner.key } : {}),
        ...(auditGeneration !== undefined ? { evidenceAuditGeneration: auditGeneration } : {}) }
        : { kind: "operator-report", parentTaskId: taskId, evidence: evidence.value },
    }, resumedOwnerCurrent || (order || auditGeneration !== undefined ? currentEvidenceTurn : undefined));
    if (operationsParent && report.status === "blocked" && view.blockedRoutingEnabled) {
      const reported = operationsTasks(view).children.filter(child => child.state === "reported");
      if (reported.length === 1) {
        await parkDesktopA11Disposition(durable, view, reported[0]!, () => {
          const actual = store.lookup(ref);
          return actual?.status === "waiting" && actual.engine === "healthy" && actual.stepId === view.stepId
            && actual.attempt === view.attempt && operationsTasks(actual).parent?.taskId === operationsParent.taskId;
        });
      }
    }
    const parentResult = operationsParent ? await submit() : undefined;
    if (parentResult && !parentResult.ok) {
      const chief = this.chiefTaskRoleIdOf(projectRoot);
      const summary = `A11 运营汇总未收口（工作流 ${ref.instanceId}，#${taskId}）。${parentResult.message}`;
      store.block(ref, parentResult.code, summary);
      if (chief && await recordWorkflowNotice(projectRoot, chief, { ref: `workflow-a11-summary:${report.reportId}`, summary, taskId }) === "recorded") {
        this.emitDeliveryNote(projectRoot, report.source.runtime, chief, report.source.roleId, summary);
      }
      return false;
    }
    if (parentResult?.ok && parentResult.value.state === "ignored") return false;
    const state = await this.readTasks(projectRoot);
    if (view.workflowOwnedDispatch && !directProduct && !operations?.workItemId && !recovery && report.status !== "completed") {
      const chief = this.chiefTaskRoleIdOf(projectRoot);
      if (chief) {
        const summary = `${bound.task.stage} 工作流回交需要幕僚处理（工作流 ${ref.instanceId}，#${taskId}）。${handback.summary}`;
        const notice = await recordWorkflowNotice(projectRoot, chief, { ref: report.reportId, summary, taskId });
        if (notice === "failed") {
          store.block(ref, "workflow-notice-unavailable", summary);
          return false;
        }
        if (notice === "recorded") this.emitDeliveryNote(projectRoot, report.source.runtime, chief, report.source.roleId, summary);
      }
    }
    if (directIntent && report.status !== "completed") {
      const chief = this.chiefTaskRoleIdOf(projectRoot);
      if (!chief) return false;
      const clarification = report.origin === "submitted-report" && report.status === "blocked";
      const issue = clarification ? "A2 产品意图待澄清，请幕僚协调" : "A2 产品意图受阻，请幕僚核对运行状态";
      const summary = `${issue}（工作流 ${ref.instanceId}，#${taskId}）。${handback.summary}`;
      const notice = await recordWorkflowNotice(projectRoot, chief, { ref: report.reportId, summary, taskId });
      if (notice === "failed") {
        store.block(ref, "workflow-notice-unavailable", summary);
        return false;
      }
      if (notice === "recorded") this.emitDeliveryNote(projectRoot, report.source.runtime, chief, report.source.roleId, summary);
    }
    if (!state.records.get(taskId)?.reports.some(item => item.turnId === report.source.turnId)) {
      if (directProduct?.capability === "product-prepare-direct" && report.status !== "completed") {
        const chief = this.chiefTaskRoleIdOf(projectRoot);
        if (chief) {
          const summary = shortenSummary(`A1 产品受理受阻（#${taskId}） · ${handback.summary}`);
          const prior = await readRoleLog(projectRoot, { roleId: chief, since: report.at });
          if (!prior.entries.some(entry => entry.kind === "task.reported" && entry.taskId === taskId && entry.ref === report.reportId)) {
            await appendRoleLog(projectRoot, chief, { kind: "task.reported", summary, taskId,
              status: taskReportStatusOf(report.status), turnId: report.source.turnId, ref: report.reportId });
            this.emitDeliveryNote(projectRoot, report.source.runtime, chief, report.source.roleId, summary);
          }
        }
      }
      const mirrored = await this.appendTaskStateResult(projectRoot, taskEvent("task.reported", {
        taskId, from: report.source.roleId, status: taskReportStatusOf(report.status), summary: shortenSummary(handback.summary),
        evidence: handback.evidence, turnId: report.source.turnId,
      }));
      if (!mirrored.ok) return false;
    }
    const saved = parentResult ?? await submit();
    if (order && collection && saved.ok && saved.value.state !== "ignored") {
      const collected = await store.recordEvidenceCollection(ref, { task: order.task, generation: order.basis.generation,
        reportKey: saved.value.key, ...collection }, currentEvidenceTurn);
      if (collected.ok) durable.activate();
      return collected.ok && collected.value.state !== "ignored";
    }
    if (resumedOwner?.retest && (!saved.ok || saved.value.state === "ignored") && resumedOwnerCurrent?.()) {
      const failed = await store.failA11Retest(ref, resumedOwner.key, saved.ok ? "原属主的补测回交未能完成核验。" : saved.message, resumedOwnerCurrent);
      if (failed.ok) durable.activate();
    }
    if (saved.ok && recovery?.environmentRecovery === "parent" && saved.value.state !== "ignored" && view.acceptanceEnvironment?.parentTask) {
      const state = view.acceptanceEnvironment;
      const stopped = await store.settleAcceptanceEnvironment(ref, { parentTask: state.parentTask!, childTask: state.childTask,
        originId: report.source.turnId, outcome: { kind: "blocked", reason: `运营报告本次恢复受阻。${shortenSummary(handback.summary, 300)}` } },
      () => store.lookup(ref)?.acceptanceEnvironment?.parentTask?.taskId === taskId);
      if (!stopped.ok) return false;
      durable.activate();
    }
    return saved.ok && saved.value.state !== "ignored";
  }

  private durableHandbackOf(report: RuntimeReportSnapshotV1): TaskHandback {
    return { roleId: report.source.roleId, taskId: report.taskId ?? undefined, status: report.status,
      summary: report.summary.text, evidence: report.evidence.map(item => item.text), at: report.at,
      turnId: report.source.turnId, runtime: report.source.runtime, origin: report.origin };
  }

  private async resumeBlockedProductTask(
    view: DurableProjection, roleBusy: (roleId: string, runtime: RuntimeKind) => boolean,
  ): Promise<void> {
    const { ref, projectRoot, stepId, attempt, flowId } = view;
    const stage = view.action === "product-prepare" ? "A1" : view.action === "author-intent" ? "A2" : undefined;
    if (!stage || !flowId || view.pendingTasks?.some(task => task.stepId === stepId
      && task.attempt === attempt)) return;
    const read = this.deps.readDurableReports!;
    const store = await this.deps.durableWorkflow!.store();
    const stageRequest = store.listCapabilityEvents(ref).find(({ event, receipt }) => receipt.state === "consumed"
      && event.stepId === stepId && event.attempt === attempt && event.flowId === flowId
      && event.input.kind === "stage-request" && event.input.stage === stage && event.source.roleId === "chief")?.event;
    if (!stageRequest) return;
    const taskId = durableTaskId(ref, "convener", stepId, attempt);
    const effect = store.listEffects(ref, "model-send").find(item => item.intent.key === `model:${taskId}`);
    const runtime = effect?.intent.expected?.runtime;
    const turnId = effect?.result?.result?.turnId;
    if (effect?.state !== "succeeded" || typeof turnId !== "string" || !isRuntimeKind(runtime)
      || roleBusy("convener", runtime)) return;
    const journal = await this.readTasks(projectRoot);
    const parent = journal.records.get(taskId);
    if (journal.errors.length || parent?.closed || parent?.created?.workflowId !== ref.instanceId || parent.created.flowId !== flowId
      || parent.created.taskKind !== "stage-request" || parent.created.to !== "convener" || parent.created.stage !== stage
      || [...journal.records.values()].some(row => row.created?.workflowId === ref.instanceId
        && row.created.to === "product" && row.created.stage === stage)) return;
    const reports = (await read({ projectRoot, roleId: "convener", runtime })).filter(item => item.taskId === taskId
      && item.source.roleId === "convener" && item.source.runtime === runtime && item.source.turnId === turnId
      && item.origin === "submitted-report" && item.status === "blocked");
    if (reports.length !== 1) return;
    const report = reports[0]!;
    const evidence = store.storeEvidence(ref, { report, handback: this.durableHandbackOf(report) });
    if (!evidence.ok) return;
    const saved = await store.submitCapability(ref, {
      key: `${stage === "A1" ? "intake" : "intent"}-recovery:${stepId}:${attempt}`, stepId, attempt, flowId,
      source: { roleId: "convener", originId: turnId, parentTaskId: taskId },
      input: { kind: stage === "A1" ? "product-intake-recovery" : "product-intent-recovery", evidence: evidence.value },
    }, () => !roleBusy("convener", runtime));
    if (!saved.ok) store.block(ref, saved.code, saved.message);
  }

  async resumeDurableReports(projection: DurableProjection, roleBusy: (roleId: string, runtime: RuntimeKind) => boolean): Promise<void> {
    const durable = this.deps.durableWorkflow;
    const read = this.deps.readDurableReports;
    const { ref, task, projectRoot, status } = projection;
    if (!durable || !read || status !== "waiting") return;
    const store = await durable.store();
    if (projection.schema === 2) {
      const revision = projection.documentRevision;
      if (revision && revision.status !== "resumed") {
        if (revision.status !== "pending") return;
        const effect = store.listEffects(ref, "model-send").find(item => item.intent.key === `model:${revision.task.taskId}`);
        const runtime = effect?.intent.expected?.runtime;
        const turnId = effect?.result?.result?.turnId;
        if (effect?.state !== "succeeded" || !isRuntimeKind(runtime) || typeof turnId !== "string" || roleBusy(revision.roleId, runtime)) return;
        const hasReport = (await read({ projectRoot, roleId: revision.roleId, runtime })).some(report => report.taskId === revision.task.taskId
          && report.source.turnId === turnId && report.source.roleId === revision.roleId && report.source.runtime === runtime);
        if (hasReport) await store.failDocumentRevision(ref, { revisionId: revision.id, turnId,
          reason: "原修订回合已经结束，尚未通过专用入口提交候选。" });
        return;
      }
      await this.resumeBlockedProductTask(projection, roleBusy);
      if (projection.action === "verify-stop" && projection.flowId) {
        const effect = store.listEffects(ref, "model-send").find(item => item.intent.key === `model:stop:${projection.stepId}:${projection.attempt}`);
        const runtime = effect?.intent.expected?.runtime;
        const turnId = effect?.result?.result?.turnId;
        if (effect?.state === "succeeded" && isRuntimeKind(runtime) && typeof turnId === "string" && !roleBusy("convener", runtime)) {
          const report = (await read({ projectRoot, roleId: "convener", runtime })).find(item => item.source.turnId === turnId
            && item.taskId === null && item.origin === "submitted-report" && item.status === "completed");
          if (report) {
            const evidence = store.storeEvidence(ref, { report, handback: this.durableHandbackOf(report) });
            if (evidence.ok) {
              const recorded = await store.submitCapability(ref, { stepId: projection.stepId, attempt: projection.attempt,
                flowId: projection.flowId, key: `stop-verified:${report.reportId}`,
                source: { roleId: "convener", originId: turnId },
                input: { kind: "stop-verified", reportKey: report.reportId, evidence: evidence.value } }, () => !roleBusy("convener", runtime));
              if (!recorded.ok) store.block(ref, recorded.code, recorded.message);
            }
          }
        }
      }
      const pending = projection.pendingTasks?.filter(item => item.state === "pending" ||
        item.state === "reported" && item.evidenceWorkOrder && !store.listCapabilityEvents(ref).some(row =>
          row.receipt.state !== "ignored" && row.event.input.kind === "evidence-collection-recorded"
            && row.event.input.task.taskId === item.taskId && row.event.input.reportKey === item.report?.key)) ?? [];
      for (const item of pending) {
        const operationsParent = item.capability === "operations-implementation" && !item.workItemId && !item.evidenceWorkOrder;
        const a11 = projection.a11Disposition;
        const resumedOwner = a11?.state === "resumed" && a11.childTask.taskId === item.taskId ? a11 : undefined;
        const recoveryParent = item.environmentRecovery === "parent";
        const child = recoveryParent && projection.pendingTasks?.find(task => task.taskId === projection.acceptanceEnvironment?.childTask?.taskId);
        const effect = store.listEffects(ref, "model-send").findLast(row => row.state !== "not-started"
          && (operationsParent ? isOperationsParentEffect(row, item) : row.intent.key === `model:${resumedOwner ? a11ResumeKey(resumedOwner.key) : item.taskId}`
            || child && row.intent.key === `model:${recoveryWakeKey(child)}`));
        const runtime = effect?.intent.expected?.runtime;
        if (!effect || !isRuntimeKind(runtime) || roleBusy(item.roleId, runtime)) continue;
        const turnId = effect.result?.result?.turnId;
        const currentRetest = () => {
          const active = store.lookup(ref)?.a11Disposition;
          return !!resumedOwner?.retest && active?.key === resumedOwner.key && active.state === "resumed"
            && active.generation === resumedOwner.generation && !roleBusy(item.roleId, runtime);
        };
        const directProduct = isDirectProductCapability(item.capability);
        const matches = (directProduct || resumedOwner?.retest) && typeof turnId !== "string" ? [] : (await read({ projectRoot, runtime, roleId: item.roleId })).filter(report => report.taskId === item.taskId
          && (report.origin === "submitted-report" || !operationsParent && !recoveryParent && !resumedOwner && (directProduct || projection.workflowOwnedDispatch) && report.status !== "completed")
          && (!resumedOwner?.retest || report.source.roleId === item.roleId && report.source.runtime === runtime)
          && (typeof turnId !== "string" || turnId === report.source.turnId));
        if (matches.length !== 1) {
          if (resumedOwner?.retest) {
            if (effect.state === "claimed" && currentRetest()) await store.settleEffect(ref, { key: effect.intent.key, token: effect.token,
              outcome: "unknown", evidence: "The recorded A11 retest send claim has no live runtime or uniquely matching durable report." });
            const reason = typeof turnId === "string" ? "同候选补测回合已结束，缺少唯一可核验的正式回交。"
              : "同候选补测送达已进入执行边界，无法核对实际回合。";
            const failed = await store.failA11Retest(ref, resumedOwner.key, reason, currentRetest);
            if (failed.ok) durable.activate();
            continue;
          }
          if (operationsParent || recoveryParent) continue;
          if (item.environmentRecovery === "child" && projection.acceptanceEnvironment?.parentTask) {
            const parentTask = projection.acceptanceEnvironment.parentTask;
            await store.settleAcceptanceEnvironment(ref, { parentTask, childTask: item.task,
              outcome: { kind: "blocked", reason: "原依赖恢复回合缺少可核验的正式报告，请核对实际应用回执和本地输出。" } },
            () => store.lookup(ref)?.acceptanceEnvironment?.childTask?.taskId === item.taskId && !roleBusy(item.roleId, runtime));
            this.deps.durableWorkflow?.activate();
            continue;
          }
          if (item.capability === "author-intent-direct" || projection.workflowOwnedDispatch) {
            const chief = this.chiefTaskRoleIdOf(projectRoot);
            const summary = `${item.task.stage} 工作流任务回执待核对（工作流 ${ref.instanceId}，#${item.taskId}）。没有唯一匹配的回交，请幕僚核对原回合。`;
            if (!projection.blockedReason) store.block(ref, "product-receipt-unverified", summary);
            if (chief) {
              const notice = await recordWorkflowNotice(projectRoot, chief, {
                ref: `product-send-uncertain:${item.taskId}`, summary, taskId: item.taskId,
              });
              if (notice === "recorded") this.emitDeliveryNote(projectRoot, runtime, chief, chief, summary);
            }
          }
          continue;
        }
        if (item.capability === "operations-implementation" && (effect.state === "unknown" || effect.state === "claimed")) {
          if (typeof turnId !== "string" || !workflowTaskEffectMatches(effect, item)) continue;
          const exact = await store.settleEffect(ref, { key: effect.intent.key, token: effect.token, outcome: "succeeded",
            evidence: "The original A11 model turn has its matching durable report.", result: { turnId } });
          if (!exact.ok) continue;
        }
        if (item.capability === "operations-implementation" && item.workItemId) {
          for (const effect of store.listEffects(ref, "task-commit")) {
            if ((effect.state !== "claimed" && effect.state !== "unknown") || !effect.intent.expected || !workflowTaskEffectMatches(effect, item)) continue;
            const proven = await verifyDurableTaskCommit(projectRoot, effect.intent.expected);
            if (proven) await store.settleEffect(ref, { key: effect.intent.key, token: effect.token, outcome: "succeeded",
              evidence: "Recovered the original A11 commit by its branch, parent, diff and marker.", result: proven });
          }
        }
        if (!await this.commitGraphReport(projection, item, matches[0]!)) continue;
        if (!directProduct && item.capability !== "operations-implementation" && (effect.state === "unknown" || effect.state === "claimed")) {
          await store.settleEffect(ref, { key: effect.intent.key, token: effect.token, outcome: "succeeded",
            evidence: "Recovered the bound runtime turn and submitted report.", result: { turnId: matches[0]!.source.turnId } });
        }
      }
      if (projection.action === "governed-implementation"
        && !store.listCapabilityEvents(ref).some(row => row.event.stepId === projection.stepId && row.event.attempt === projection.attempt
          && row.event.input.kind === "operator-report" && row.receipt.state !== "ignored")) {
        const effects = store.listEffects(ref, "model-send");
        for (const item of projection.pendingTasks ?? []) {
          if (item.stepId !== projection.stepId || item.attempt !== projection.attempt || !item.report ||
            item.state !== "accepted" && (!projection.workflowOwnedDispatch || item.state !== "reported")) continue;
          const effect = effects.find(row => row.intent.key === `model:graph-report:${item.taskId}:${item.report!.key}`);
          const turnId = effect?.result?.result?.turnId;
          const runtime = effect?.intent.expected?.runtime;
          if (!effect || !isRuntimeKind(runtime) || typeof turnId !== "string" || roleBusy("convener", runtime)) continue;
          const report = (await read({ projectRoot, roleId: "convener", runtime })).find(saved =>
            saved.taskId === item.task.parentTaskId && saved.source.turnId === turnId &&
            (saved.origin === "submitted-report" || projection.workflowOwnedDispatch && saved.status !== "completed"));
          if (report) await this.commitGraphReport(projection, undefined, report);
        }
      }
    }
    if (!task) return;
    const facts = store.listFacts(ref);
    const required = [
      !facts.some(({ fact }) => fact.kind === "task-report" && fact.task.taskId === task.taskId) ? task.taskId : undefined,
      task.stage !== "readonly" && !facts.some(({ fact }) => fact.kind === "operator-report" && fact.parentTaskId === task.parentTaskId)
        ? task.parentTaskId : undefined,
    ].filter((id): id is string => id !== undefined);
    const effects = store.listEffects(ref, "model-send");
    for (const taskId of required) {
      const remote = effects.filter(effect => effect.intent.task?.taskId === taskId && effect.state !== "not-started");
      // The production dispatch and the operations review each have a single authorized reporting turn.
      const effect = remote.find(row => row.intent.key.startsWith("model:report:")) ?? (taskId === task.taskId && remote.length === 1 ? remote[0] : undefined);
      const roleId = effect?.intent.task?.roleId;
      const runtime = effect?.intent.expected?.runtime;
      if (!effect || !roleId || !isRuntimeKind(runtime) || roleBusy(roleId, runtime)) continue;
      const storedTurnId = effect.result?.result?.turnId;
      const matches = (await read({ projectRoot, roleId, runtime })).filter(report => report.taskId === taskId
        && (report.origin === "submitted-report" || projection.workflowOwnedDispatch && report.status !== "completed")
        && (typeof storedTurnId !== "string" || storedTurnId === report.source.turnId));
      if (matches.length !== 1) continue;
      const report = matches[0]!;
      if (!await this.commitDurableHandback(projectRoot, runtime, this.durableHandbackOf(report), report)) continue;
      if (effect.state === "unknown" || effect.state === "claimed") {
        await store.settleEffect(ref, { key: effect.intent.key, token: effect.token, outcome: "succeeded",
          evidence: "Recovered the exact assigned runtime turn and its durable submitted report.", result: { turnId: report.source.turnId } });
      }
    }
  }
}
