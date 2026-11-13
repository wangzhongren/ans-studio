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
import { reportTargetForTaskCreator } from "../../../src/common/编排/workflow-preconditions.ts";
import { shortenSummary, taskEvent, taskReportStatusOf, type TaskReplay } from "../../../src/common/编排/task-state.ts";
import { isBuiltInGovernanceRoleId } from "../../../src/service/boundary/resolve-boundary.ts";
import { prepareCreatedTaskClose, recordTaskObservation } from "../../../src/pipeline/orchestration/trunk-runtime.ts";
import type { RuntimeKind } from "../../../src/common/shared/runtime-shared.ts";
import type { RuntimeLiveReportViewV1, RuntimeReportSnapshotV1, TaskStateEvent } from "../../../src/model/runtime.ts";
import type { GovernanceModel } from "../../../src/model/role.ts";
import { mainT } from "../i18n.ts";
import type { SessionManagerDeps } from "./contracts/deps.ts";
import type { DeliveryItem, DesktopOrchestrationEvent, LiveSession } from "./contracts/session-types.ts";
import { now } from "./shared/clock.ts";
import { queueKey } from "./shared/keys.ts";
import { emitDeliveryNote } from "./shared/notifier.ts";
import { chiefTaskRoleIdOf, findListingForFeedback, handbackOwnerRoleId } from "./shared/roles.ts";
import { appendTaskStateResult, readTasks, taskCreators } from "./shared/tasks-store.ts";
import { shouldSuppressStarTaskReport } from "./shared/text.ts";

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
}
