// app/desktop/session/dispatch.ts
// B6（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.3 / §3.6 / §5 B6、附录 A dispatch 组）：星形/legacy 派发路由、五步链事实与幕僚控制器恢复
// （L4，feature 白名单 []）。
// 5 个类方法（routeDispatch/chainDispatchFacts/captureChiefDispatchSource/resumeChiefController/
// routeStarDispatch）自 app/desktop/session.ts **逐字搬移**（含 JSDoc）：方法体零改动；类外壳重建原
// receiver 面——
//  · 派发状态（sessions/activeDispatchKeys/starTaskIds/deliveredAppTaskIds/deliveredDeliveryKeys/
//    deliveryQueues/activeDeliveries/lastRoleActivity）按方案 §3.6 属其他模块，经 `DispatchRefs` 显式
//    传入**同一实例**（只读/按原样写入；不双写、不复制）；
//  · fixed 路径派发/摘要经 `FixedDispatchPort`（contracts，门面构造注入 → fixed-workflow 模块）；
//    dispatch（L4）不得导入 fixed-workflow（L5）——同层/上行只走端口（结构测试 R-c）；
//  · 尚未迁出的门面方法（openInternal/findLiveRuntime/enqueueDelivery/drainQueue/
//    appDispatchClientMessageId/appTaskClientMessageIdFromSeed/deliveryIsStopped/runTaskIsFenced）经
//    `DispatchPorts` 箭头回调注入，运行期调用、参数逐位原样转发；
//  · 已迁出的 shared 方法经同名同义委托 → shared/*（与门面委托同一函数、同一入参）。
// **派发 fail-closed 门逐字保留**：`document-planning-source-unavailable` 等拒绝语义、star/legacy 路由
// 条件与 chief controller 恢复（prepareControllerResume/捕获来源/lease 顺序）不变。
// 可见性 private → 模块内 public 仅为门面委托可调用（不进入公开导出面）。
// 依赖规则（结构测试 R-c）：L4 dispatch 只可导入 L0（contracts/shared）与外部 src。

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createDiagnosticLogger } from "../../../src/common/shared/diagnostics.ts";
import { extractDispatchReadPaths, planDispatchDelivery } from "../../../src/common/编排/handback.ts";
import { formatMechanicalRejection, humanRejection, technicalRejectionCode, type MechanicalRejection } from "../../../src/common/编排/mechanical-rejection.ts";
import { classifyTaskSideEffect, findTaskByIdempotencyKey, newTaskId, renderTaskCardLines, shortenSummary, taskCardOf, taskEvent, taskIdempotencyKey, type TaskReplay } from "../../../src/common/编排/task-state.ts";
import { evaluateDispatchAuthorization, loadLatestRoster, reportTargetForTaskCreator, type DispatchPreflightInput, type ProjectRoster, type RosterLoadResult } from "../../../src/common/编排/workflow-preconditions.ts";
import { collectDispatchAdvisories, type DispatchAdvisory } from "../../../src/common/编排/dispatch-advisories.ts";
import { ensureDraftRun, findActiveRun, loadPinnedRoster, readRunManifest, RUN_PENDING_FLOW_ID, validateRunManifest, verifyPinnedRun, type RunManifest } from "../../../src/common/编排/run-manifest.ts";
import { collectDispatchBaselineFacts, freezeExecutionRun, inspectAssignedTask, prepareControllerResume, prepareParentTaskRef, prepareRoleDispatch, beginGitHostAction, endGitHostAction, recordTaskObservation } from "../../../src/pipeline/orchestration/trunk-runtime.ts";
import { readRoleCapabilityProtectionScope, type RoleSessionHandle } from "../../../src/pipeline/orchestration/run-role.ts";
import { isTaskWorkSourceRef, isWorkflowPath, isWorkflowStage } from "../../../src/model/runtime.ts";
import type { DispatchReceipt, DispatchTaskPayload, GovernanceCardKind, TaskStateEvent, TaskWorkSourceRef } from "../../../src/model/runtime.ts";
import type { RuntimeKind } from "../../../src/common/shared/runtime-shared.ts";
import type { GovernanceModel } from "../../../src/model/role.ts";
import { isBuiltInGovernanceRoleId } from "../../../src/service/boundary/resolve-boundary.ts";
import { desktopProjectExecutionInventory } from "./shared/inventory.ts";
import { mainT } from "../i18n.ts";
import { dispatchFlowIdOf, ensureFixedPathStarted, isFixedPathEnabledForFlow, resolveFixedPathMode, sessionWorkflowModeForChat, type WorkflowMode } from "../workflow.ts";
import type { FixedDispatchPort } from "./contracts/ports.ts";
import type { SessionManagerDeps } from "./contracts/deps.ts";
import type { ActualDispatchSource, DeliveryItem, InternalSessionOpenRequest, LiveSession, OpenResult } from "./contracts/session-types.ts";
import { now } from "./shared/clock.ts";
import { queueKey, sessionKey } from "./shared/keys.ts";
import { emitDeliveryNote } from "./shared/notifier.ts";
import { chiefTaskRoleIdOf, dispatcherRoleIdOf, handbackOwnerRoleId, refreshListingNow, roleDisplayName } from "./shared/roles.ts";
import { appendRoleActivity, appendTaskStateResult, readTasks, recordTaskFailure, taskCreators } from "./shared/tasks-store.ts";
import { filePrint, shortenText } from "./shared/text.ts";

/** dispatch 方法读取的跨模块状态面（同一实例；延迟取值，两阶段装配）。 */
export interface DispatchRefs {
  sessions: ReadonlyMap<string, LiveSession>;
  activeDispatchKeys: Set<string>;
  starTaskIds: Set<string>;
  deliveredAppTaskIds: Set<string>;
  deliveredDeliveryKeys: Set<string>;
  deliveryQueues(): ReadonlyMap<string, DeliveryItem[]>;
  activeDeliveries(): ReadonlyMap<string, DeliveryItem>;
  lastRoleActivity: Map<string, { at: number; kind: string; summary: string }>;
}

/** 尚未迁出（B6 范围外）的门面方法端口；门面以箭头回调注入，参数逐位原样转发。 */
export interface DispatchPorts {
  openInternal(req: InternalSessionOpenRequest, userInitiated: boolean): Promise<OpenResult>;
  findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined;
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void;
  drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void>;
  appDispatchClientMessageId(dedupKey: string): string;
  appTaskClientMessageIdFromSeed(seed: string): string;
  deliveryIsStopped(key: string): boolean;
  runTaskIsFenced(projectRoot: string, taskId?: string, runId?: string): boolean;
  /** 星形路由端口：门面箭头 → 门面同名薄委托 → 本模块实现。经门面中转保持实例级覆盖（测试桩）语义。 */
  routeStarDispatch(projectRoot: string, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload, targetRoleId: string, task: string, source: ActualDispatchSource | undefined): Promise<DispatchReceipt>;
}

/** 星形/legacy 派发路由、五步链事实与幕僚控制器恢复（原 SessionManager 5 方法的同签名实现）。 */
export class Dispatch {
  private readonly refs: DispatchRefs;
  private readonly port: DispatchPorts;
  private readonly fixed: FixedDispatchPort;
  private readonly deps: SessionManagerDeps;
  constructor(refs: DispatchRefs, port: DispatchPorts, fixed: FixedDispatchPort, deps: SessionManagerDeps) {
    this.refs = refs;
    this.port = port;
    this.fixed = fixed;
    this.deps = deps;
  }

  /* 跨模块状态（同一实例；延迟取值）。 */
  private get sessions(): ReadonlyMap<string, LiveSession> { return this.refs.sessions; }
  private get activeDispatchKeys(): Set<string> { return this.refs.activeDispatchKeys; }
  private get starTaskIds(): Set<string> { return this.refs.starTaskIds; }
  private get deliveredAppTaskIds(): ReadonlySet<string> { return this.refs.deliveredAppTaskIds; }
  private get deliveredDeliveryKeys(): ReadonlySet<string> { return this.refs.deliveredDeliveryKeys; }
  private get deliveryQueues(): ReadonlyMap<string, DeliveryItem[]> { return this.refs.deliveryQueues(); }
  private get activeDeliveries(): ReadonlyMap<string, DeliveryItem> { return this.refs.activeDeliveries(); }
  private get lastRoleActivity(): Map<string, { at: number; kind: string; summary: string }> { return this.refs.lastRoleActivity; }

  /* L0 共享函数（同名同义委托；与门面委托同一实现、同一入参）。 */
  private now(): number { return now(this.deps); }
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string {
    return sessionKey(projectRoot, roleId, runtime);
  }
  private queueKey(projectRoot: string, targetRoleId: string, runtime: RuntimeKind): string {
    return queueKey(projectRoot, targetRoleId, runtime);
  }
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }
  private handbackOwnerRoleId(projectRoot: string): string | null { return handbackOwnerRoleId(projectRoot, this.deps); }
  private chiefTaskRoleIdOf(projectRoot: string): string | null { return chiefTaskRoleIdOf(projectRoot, this.deps); }
  private dispatcherRoleIdOf(projectRoot: string): string | null { return dispatcherRoleIdOf(projectRoot, this.deps); }
  private refreshListingNow(projectRoot: string): Promise<boolean> { return refreshListingNow(projectRoot, this.deps); }
  private roleDisplayName(projectRoot: string, roleId: string): string { return roleDisplayName(projectRoot, roleId, this.deps); }
  private async readTasks(projectRoot: string): Promise<TaskReplay> {
    return readTasks(projectRoot);
  }
  private async appendTaskStateResult(projectRoot: string, event: TaskStateEvent): ReturnType<typeof recordTaskObservation> {
    return appendTaskStateResult(projectRoot, event);
  }
  private async recordTaskFailure(projectRoot: string, taskId: string, summary: string): Promise<boolean> {
    return recordTaskFailure(projectRoot, taskId, summary, () => this.now());
  }
  private appendRoleActivity(
    projectRoot: string,
    roleId: string,
    input: { kind: string; summary: string; tool?: string; status?: string; taskId?: string; turnId?: string; ref?: string },
  ): Promise<void> {
    return appendRoleActivity(projectRoot, roleId, input, { lastRoleActivity: this.lastRoleActivity, now: () => this.now() });
  }

  /* fixed-workflow 端口（L4 → L5 只走端口；参数逐位原样转发）。 */
  private routeFixedPathDispatch(
    projectRoot: string,
    runtime: RuntimeKind,
    fromRoleId: string,
    d: DispatchTaskPayload,
    targetRoleId: string,
    task: string,
    source: ActualDispatchSource | undefined,
    dispatchFlowId: string,
  ): Promise<DispatchReceipt> {
    return this.fixed.routeFixedPathDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId);
  }
  private dispatchAdvisorySummary(advisories: readonly DispatchAdvisory[]): string {
    return this.fixed.dispatchAdvisorySummary(advisories);
  }

  /* 尚未迁出的门面方法端口（运行期调用；参数逐位原样转发、返回原样返回）。 */
  private openInternal(req: InternalSessionOpenRequest, userInitiated: boolean): Promise<OpenResult> {
    return this.port.openInternal(req, userInitiated);
  }
  private findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined {
    return this.port.findLiveRuntime(projectRoot, roleId);
  }
  private enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void {
    return this.port.enqueueDelivery(projectRoot, targetRoleId, item);
  }
  private drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void> {
    return this.port.drainQueue(projectRoot, targetRoleId, runtime);
  }
  private appDispatchClientMessageId(dedupKey: string): string {
    return this.port.appDispatchClientMessageId(dedupKey);
  }
  private appTaskClientMessageIdFromSeed(seed: string): string {
    return this.port.appTaskClientMessageIdFromSeed(seed);
  }
  private deliveryIsStopped(key: string): boolean {
    return this.port.deliveryIsStopped(key);
  }
  private runTaskIsFenced(projectRoot: string, taskId?: string, runId?: string): boolean {
    return this.port.runTaskIsFenced(projectRoot, taskId, runId);
  }

  // —— routeDispatch（B6 自 session.ts 逐字搬移）——
  /**
   * H-1：su 派发任务的路由（注入 su 会话的 `dispatch_task` 能力；**复用 E-1 投递机**）。
   * 校验（**如实回执**，绝不静默）：目标须是**本项目角色**且**不是内置治理角色**（含 su 自身）。
   * 回执语义：**入队即回 `{ok:true,"已受理…"}`**（受理≠已完成——目标收到/失败会在两边聊天流如实显示）；
   * 失败原因进回执（工具如实转达 su）并同步放系统行。去重：`roleId\0task\0reason`——**队列期**窗口去重
   * （载荷无 id/时间，契约钉死不扩；投递成功即释放，**返工可再派发同文任务**）；一条派发**只在在途窗口**受限。
   *
   * **首轮寻址修复（2026-10-13 真机 bootstrap J-1 缺陷）**：角色表是**导入项目时枚举的缓存**——全新空项目
   * bootstrap 首轮里，su 建好角色后**同一轮内**就派发，缓存里还没有新角色（那时 `角色卡/` 不存在）
   * ⇒ 旧实现如实回「不在本项目（未枚举到）」——J-1「落盘后自动开工」首轮必失败。现：缓存 miss 时经
   * `deps.refreshListing` **实时重枚举一次**（与界面 `listProject` 同一路径、刷**同一份**共享缓存——
   * 后续 `openInternal` 自动开会话读的也是它）再判；重枚举失败/仍无 ⇒ 按原口径如实拒绝（不静默、不重试风暴）。
   * 异步回执：契约 `DispatchTaskFn` 本就允许 `Promise<DispatchReceipt>`（工具侧 await）。
   *
   * **G-1／A2（2026-10-16 客户批准；设计 `2026-10-16_design_contract-workflow-dispatch.md` §四/§八；编排 A1
   * 接口交回 §五）——必读块接线**：提取/判据/渲染的**单一来源** = 编排 `extractDispatchReadPaths` /
   * `planDispatchDelivery` / `renderDispatchPrompt`（只读导入，本层**只做接线**）。投递时对任务文本提取的
   * 引用路径逐个 `filePrint` 探测（复用带缓存的 sha256 指纹；`<missing>` 原样传入——判据天然按缺失处理）；
   * **判据紧挨去重登记（`activeDispatchKeys.add`）之前**：拒投**不登记、不入队、不开目标会话**（登记在
   * 「送达」时才释放——若先登记后拒投，键永不释放 ⇒ 契约修好后重派同一任务文本会被误去重）；**契约缺失
   * ⇒ fail-closed 拒投**（`fail(plan.message, plan.systemRow)`：回执给工具 + 系统行进 su 聊天流，绝不静默）；
   * **workflow 缺失 ⇒ 降级标注（照投）**；无引用 ⇒ 文本 = 单一来源 `renderDispatchPrompt` 旧格式逐字。
   * 放行文本**入队即定格**（重试复用同一份——绑定「派发那一刻的契约版本」）。回交与客户消息**不经过**本段
   * （不受必读块影响）。
   */
  async routeDispatch(projectRoot: string, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload, source?: ActualDispatchSource): Promise<DispatchReceipt> {
    const targetRoleId = d && typeof d.roleId === "string" ? d.roleId.trim() : "";
    const task = d && typeof d.task === "string" ? d.task : "";
    const fail = (message: string, row: string): DispatchReceipt => {
      this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, row);
      return { ok: false, message };
    };
    if (targetRoleId === "" || task.trim() === "") {
      return fail(mainT("main.session.dispatchRejectedEmpty"), mainT("main.session.dispatchRejectedEmpty"));
    }
    // —— 来源防御性校验 ——
    // trio：只有幕僚（chief）可派发（星形主链）；single：主入口（su）。正常路径由 `open()` 的能力注入
    // 保证；这里再拒一次（绝不把「谁调用」当授权）。
    const listing = this.deps.getListing(projectRoot);
    const model: GovernanceModel = listing?.governanceModel ?? "single";
    const starChiefRoleId = this.chiefTaskRoleIdOf(projectRoot);
    if (model === "trio") {
      // 2026-10-29（方案 v2.1/Topology v4.1）：幕僚（主链/验收调度）与运营（实现/验收核对）都可派发；
      // 具体目标矩阵由 `evaluateDispatchPreflight`（M5–M8）机械执行，来源只做身份判断。
      const convenerCandidate = this.handbackOwnerRoleId(projectRoot);
      const isChiefSource = starChiefRoleId !== null && fromRoleId === starChiefRoleId;
      const isConvenerSource = convenerCandidate !== null && fromRoleId === convenerCandidate;
      if (!isChiefSource && !isConvenerSource) {
        return fail(
          mainT("main.session.dispatchWrongSource", {
            from: this.roleDisplayName(projectRoot, fromRoleId),
            dispatcher: starChiefRoleId !== null ? this.roleDisplayName(projectRoot, starChiefRoleId) : fromRoleId,
            modelNote: mainT("main.session.dispatchModelNote"),
          }),
          mainT("main.session.dispatchWrongSourceShort", { from: fromRoleId, dispatcher: fromRoleId }),
        );
      }
      // T3（2026-11-10 两条固定工作流路径，B1 AC-12）：trio 下按**被派任务的 flowId** 现场解析
      // 工作流模式（不缓存项目级单值；混合项目按 flow 分别路由）。`fixed` ⇒ 新固定路径路由；
      // 空 flowId / `legacy` / B1 启用闸未开（项目未显式 fixed 且该 flow 无 fixed workflow）⇒ 现有
      // 星形路由**逐字不变**（旧谓词/旧内联拒绝全部保留）。
      // T3 B3（AC-12/v1.3 §4.1 第 4 条）：**首次 fixed 启动顺序**——幕僚的首个 stage-request 携带
      // `workflowPath` 且启用闸未开时，先经 `ensureFixedPathStarted` 原子写 `.ans/project.json
      // workflowSchema:"two-fixed-paths/v1"`（显式 legacy/v1 不覆盖；写失败 ⇒ `project-config-write-failed`
      // fail-closed、不弹卡），再按复核后的模式路由。其余派发路径不写配置（旧项目/旧夹具零变化）。
      // T3 B7.1（2026-11-11，RR2 根因 `fixed-stage-request-fail-open`）：fixed 聊天会话**先按会话模式
      // fail-closed**——缺 `flowId/workflowPath/stage/workflowAction/roleId` 的 stage-request 与无
      // `workflowId/stage` 的普通派发一律拒绝：不创建任务、不写 `.ans/runs`/`.ans/trunk`、绝不回落
      // legacy 星形派发（RR2 实测 legacy 受理写盘的偏航路径就此关闭）。
      // legacy 聊天会话（旧项目/在飞 legacy run/显式 legacy/v1）的既有 flowId→fixed/星形路径逐字不变。
      const chatMode = await sessionWorkflowModeForChat(projectRoot);
      const dispatchFlowId = dispatchFlowIdOf(d);
      if (chatMode === "fixed") {
        if (d.taskKind === "stage-request") {
          const convenerRoleId = this.handbackOwnerRoleId(projectRoot) ?? "convener";
          const invalid: string[] = [];
          if (dispatchFlowId === "") invalid.push("flowId");
          if (!isWorkflowPath(d.workflowPath)) invalid.push('workflowPath:"A"|"B"');
          if (!isWorkflowStage(d.stage)) invalid.push("stage（A1–A13 含 A12a/A12b，或 B1–B4）");
          if (d.workflowAction !== "advance") invalid.push('workflowAction:"advance"');
          if (targetRoleId !== convenerRoleId) invalid.push(`roleId（运营 ${convenerRoleId}）`);
          if (invalid.length > 0) {
            const detail = `固定路径的 stage-request 缺少或非法：${invalid.join("、")}。stage-request 必须同时给出非空 flowId、workflowPath:"A"|"B"、合法 stage、workflowAction:"advance"、roleId（运营 ${convenerRoleId}）；本次未创建任务、未写 legacy 账本。`;
            return fail(`stage-request-invalid：${detail}`, `stage-request-invalid：${detail}`);
          }
          // 首个 stage-request 的 fixed 启动顺序（B3 既有逻辑）：启用闸未开先原子写 workflowSchema；
          // 失败 fail-closed。启动后仍不是 fixed（如该 flow 有在飞 legacy run）⇒ 拒绝，不回落星形。
          let dispatchMode: WorkflowMode;
          if (await isFixedPathEnabledForFlow(projectRoot, dispatchFlowId)) {
            dispatchMode = await resolveFixedPathMode(projectRoot, dispatchFlowId);
          } else {
            const started = await ensureFixedPathStarted(projectRoot, dispatchFlowId);
            if (!started.ok) {
              return fail(`${started.code}：${started.message}`, started.message);
            }
            dispatchMode = started.mode;
          }
          if (dispatchMode !== "fixed") {
            const detail = "固定会话的 stage-request 未能解析为 fixed workflow（该 flow 仍为 legacy）；按 fail-closed 拒绝，不回落 legacy 星形派发。";
            return fail(`stage-request-invalid：${detail}`, `stage-request-invalid：${detail}`);
          }
          return this.routeFixedPathDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId);
        }
        // A12a/A12b/verifier 直派等 fixed 任务：必须携带账本绑定证据（workflowId+stage）。
        const fixedWorkflowId = typeof d.workflowId === "string" ? d.workflowId.trim() : "";
        if (fixedWorkflowId !== "" && d.stage !== undefined) {
          return this.routeFixedPathDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId);
        }
        // T3 B8.2（2026-11-11，RR3 根因 2）：**运营（convener）的生产派发不要求模型自报 workflowId/stage**——
        // 由 `routeFixedPathDispatch` 从当前真实受派 stage-request 任务自动绑定（运营在真实任务文本里
        // 无法获知 workflowId；RR3 的 9 次合法派发就是在这一步被 `stage-request-required` 拒绝后回落
        // legacy stable-write）。绑定失败/不一致在路由内 fail-closed（`workflow-binding-unavailable` /
        // `stage-request-invalid`），仍不回落 legacy 星形派发。幕僚（chief）的缺字段派发照旧拒绝。
        const convenerRouteId = this.handbackOwnerRoleId(projectRoot) ?? "convener";
        if (fromRoleId === convenerRouteId) {
          return this.routeFixedPathDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId);
        }
        const requiredDetail = "固定路径的幕僚派发必须是 stage-request（taskKind/workflowPath/stage/flowId）或带 workflowId/stage 的 fixed 任务。";
        return fail(
          `stage-request-required：${requiredDetail}`,
          `stage-request-required：已拒绝 legacy 星形派发（${targetRoleId}）；${requiredDetail}`,
        );
      }
      if (dispatchFlowId !== "") {
        let dispatchMode = await resolveFixedPathMode(projectRoot, dispatchFlowId);
        if (
          dispatchMode === "legacy"
          && isChiefSource
          && d.taskKind === "stage-request"
          && d.workflowPath !== undefined
          && d.workflowAction !== "stop"
          && !(await isFixedPathEnabledForFlow(projectRoot, dispatchFlowId))
        ) {
          const started = await ensureFixedPathStarted(projectRoot, dispatchFlowId);
          if (!started.ok) {
            return fail(`${started.code}：${started.message}`, started.message);
          }
          dispatchMode = started.mode;
        }
        if (dispatchMode === "fixed") {
          return this.routeFixedPathDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source, dispatchFlowId);
        }
      }
      // 星形任务链（`tasks.jsonl`；不套旧 flow 派发门）；前置检查在 task.created 之前（F10）。
      return this.port.routeStarDispatch(projectRoot, runtime, fromRoleId, d, targetRoleId, task, source);
    }
    const dispatcherRoleId = this.dispatcherRoleIdOf(projectRoot);
    if (dispatcherRoleId === null) {
      return fail(
        mainT("main.session.dispatchNoDispatcher"),
        mainT("main.session.dispatchNoDispatcherShort"),
      );
    }
    if (fromRoleId !== dispatcherRoleId) {
      return fail(
        mainT("main.session.dispatchWrongSource", {
          from: this.roleDisplayName(projectRoot, fromRoleId),
          dispatcher: this.roleDisplayName(projectRoot, dispatcherRoleId),
          modelNote: "",
        }),
        mainT("main.session.dispatchWrongSourceShort", { from: fromRoleId, dispatcher: dispatcherRoleId }),
      );
    }
    const findTarget = (): { builtIn?: boolean } | undefined => {
      const current = this.deps.getListing(projectRoot);
      return current ? current.roles.find((r) => r.roleId === targetRoleId) : undefined;
    };
    let target = findTarget();
    if (!target) {
      // 缓存 miss ⇒ 实时重枚举**一次**再重试（bootstrap 首轮 / Nominator 刚写出的角色卡：缓存来自
      // 导入时点或上一轮——W6-B 真机阻塞修复）。仍 miss ⇒ 按原口径如实拒绝，不循环、不上抛。
      await this.refreshListingNow(projectRoot);
      target = findTarget();
    }
    if (!target) {
      return fail(
        mainT("main.session.dispatchUnknownTarget", { roleId: targetRoleId }),
        mainT("main.session.dispatchUnknownTargetShort", { roleId: targetRoleId })
      );
    }
    // single：内置治理角色默认拒绝（目标须是项目角色）。
    if (target.builtIn === true || isBuiltInGovernanceRoleId(targetRoleId)) {
      return fail(
        mainT("main.session.dispatchBuiltinTarget", { roleId: targetRoleId }),
        mainT("main.session.dispatchBuiltinTargetShort", { roleId: targetRoleId })
      );
    }
    const reason = d && typeof d.reason === "string" ? d.reason : undefined;
    const flowId = d && typeof d.flowId === "string" ? d.flowId : undefined;
    const stepId = d && typeof d.stepId === "string" ? d.stepId : undefined;
    // —— G-1／A2：必读引用接线（提取/判据/渲染 = 编排三件套单一来源；本层只探测 + 按判据分流）——
    // 探测：逐引用算文件**当刻字节**的内容 sha256（复用 `filePrint`；缺失/读失败返回 `<missing>`——
    // `planDispatchDelivery` 判据内天然按缺失处理，无需本层再映射）。
    const probes = new Map<string, string | undefined>();
    for (const readPath of extractDispatchReadPaths(task)) {
      probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
    }
    // 判据必须**紧挨去重登记之前**（见方法注释：拒投不登记——防「键在送达才释放」被拒投项拖成残留误去重）。
    const plan = planDispatchDelivery({ roleId: targetRoleId, task, reason }, probes, { sourceRoleId: this.roleDisplayName(projectRoot, fromRoleId) });
    if (plan.action === "reject") {
      // fail-closed 拒投：不入队、不登记去重键、不开目标会话；如实回执（工具）+ 系统行（主人聊天流）。
      return fail(plan.message, plan.systemRow);
    }
    // 去重键（评审 §5.6/§6.3-5）：既有 `roleId\0task\0reason` 之外增 `flowId\0stepId`（缺失为空串——
    // single 旧行为不变）。2026-10-20：Lead→Steward 协调消息**不套用项目步骤的 duplicate-dispatch 去重**
    // （coordinate 门已跳过该规则），这里仍按内容/在途窗口正常去重（送达即释放，同文可再次协调）。
    const dedupKey = `${projectRoot}\u0000${runtime}\u0000${targetRoleId}\u0000${task}\u0000${reason ?? ""}\u0000${flowId ?? ""}\u0000${stepId ?? ""}`;
    if (this.activeDispatchKeys.has(dedupKey)) {
      return { ok: true, message: mainT("main.session.dispatchDuplicate", { roleId: targetRoleId }) };
    }
    this.activeDispatchKeys.add(dedupKey);
    // 2026-10-29（BUG-5）：无活会话时先同步 open/resume；失败 ⇒ 释放去重键并如实拒发（不入队）。
    if (!this.sessions.has(this.sessionKey(projectRoot, targetRoleId, runtime))) {
      const opened = await this.openInternal({ projectRoot, roleId: targetRoleId, runtime }, false);
      if (!opened.ok) {
        this.activeDispatchKeys.delete(dedupKey);
        return fail(
          mainT("main.session.dispatchTargetOpenFailed", {
            target: this.roleDisplayName(projectRoot, targetRoleId),
            detail: opened.error ?? mainT("shared.common.unknownReason"),
          }),
          "派发未投递：目标会话无法打开（未入队；已如实回执）。",
        );
      }
    }
    this.enqueueDelivery(projectRoot, targetRoleId, {
      kind: "dispatch",
      runtime,
      targetRoleId,
      sourceRoleId: fromRoleId,
      ...(flowId !== undefined ? { flowId } : {}),
      // 文本：编排 `planDispatchDelivery` 产出的定格文本（必读块已由**同一单一来源** `renderDispatchPrompt`
      // 注入；无引用 = 旧格式逐字）——本层不另写渲染（本地副本 `renderDispatchPromptLocal` 已删除）。
      text: plan.text,
      summary: mainT("main.session.dispatchSummary", { from: this.roleDisplayName(projectRoot, fromRoleId), text: shortenText(task, 40) }),
      dedupKey,
      // 2026-10-25：派发任务的**内容稳定身份**（含 project/runtime/target/正文/reason/flowId/stepId）——
      // 重建续投/恢复项与新的同任务调用相认；ACK/送达后记「已投递」。显式重新入队（返工同文再派）
      // 由 `enqueueDelivery` 清除标记 ⇒ 返工回路不受影响。
      clientMessageId: this.appDispatchClientMessageId(dedupKey),
    });
    void this.drainQueue(projectRoot, targetRoleId, runtime);
    const openNote = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, runtime)) ? "" : mainT("main.session.sessionWillAutoOpen");
    return {
      ok: true,
      message: mainT("main.session.acceptedTask", { to: this.roleDisplayName(projectRoot, targetRoleId), openNote, from: "su" }),
    };
  }
  // —— chainDispatchFacts（B6 自 session.ts 逐字搬移）——
  /**
   * 2026-10-29（方案 v2.1 §5.1）：五步链派发所需的机械事实（只读；不写盘、不猜）。
   * 读盘失败一律按「未满足」处理（fail-closed）。
   */
  async chainDispatchFacts(projectRoot: string, flowHint: string | undefined): Promise<{
    flowId?: string;
    intent: { found: boolean; candidates: number };
    proposalFound: boolean;
    architectureFound: boolean;
    roster?: RosterLoadResult;
    d3Selected: string[];
    d3DecisionId?: string;
    handoffFound: boolean;
    selectedCardsFound: boolean;
    missingSelectedCardIds: string[];
  }> {
    const readNames = async (rel: string): Promise<string[]> => {
      try {
        return await fs.promises.readdir(path.join(projectRoot, rel));
      } catch {
        return [];
      }
    };
    const intentPattern = /^(.+)-intent-v\d+\.md$/;
    const rosterPattern = /^(.+)-roster-v\d+\.md$/;
    const flowsOf = (names: readonly string[], pattern: RegExp): string[] => {
      const flows = new Set<string>();
      for (const name of names) {
        const match = pattern.exec(name);
        if (match !== null) flows.add(match[1]!);
      }
      return [...flows];
    };
    const intentNames = await readNames(path.posix.join("docs", "product"));
    const rosterNames = await readNames(path.posix.join("docs", "proposals"));
    const contractNames = await readNames(path.posix.join("docs", "contracts"));
    const intentFlows = flowsOf(intentNames, intentPattern);
    const rosterFlows = flowsOf(rosterNames, rosterPattern);
    const flowId = flowHint
      ?? (intentFlows.length === 1 ? intentFlows[0] : undefined)
      ?? (rosterFlows.length === 1 ? rosterFlows[0] : undefined);
    // 2026-10-29（客户追加口径）：文档版本化——链路只认最新版本文件（旧版只读，不原地改）。
    const latestVersionedName = (names: readonly string[], pattern: RegExp): string | undefined => {
      let best = 0;
      let file: string | undefined;
      for (const name of names) {
        const match = pattern.exec(name);
        if (match === null) continue;
        const version = Number(match[1]);
        if (Number.isInteger(version) && version > best) {
          best = version;
          file = name;
        }
      }
      return file;
    };
    const escapedFlow = flowId !== undefined ? flowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : undefined;
    const latestIntentName =
      escapedFlow !== undefined ? latestVersionedName(intentNames, new RegExp(`^${escapedFlow}-intent-v(\\d+)\\.md$`)) : undefined;
    const latestProposalName =
      escapedFlow !== undefined ? latestVersionedName(rosterNames, new RegExp(`^${escapedFlow}-proposal-v(\\d+)\\.md$`)) : undefined;
    const latestArchitectureName =
      escapedFlow !== undefined
        ? latestVersionedName(contractNames, new RegExp(`^${escapedFlow}-architecture-v(\\d+)\\.md$`))
        : undefined;
    const existsFile = async (rel: string): Promise<boolean> => {
      try {
        return (await fs.promises.stat(path.join(projectRoot, rel))).isFile();
      } catch {
        return false;
      }
    };
    let intentFound = false;
    if (latestIntentName !== undefined) {
      try {
        const text = await fs.promises.readFile(path.join(projectRoot, "docs", "product", latestIntentName), "utf8");
        intentFound = text.trim() !== "" && /^#/m.test(text);
      } catch {
        intentFound = false;
      }
    }
    const proposalFound =
      latestProposalName !== undefined && (await existsFile(`docs/proposals/${latestProposalName}`));
    const architectureFound =
      latestArchitectureName !== undefined && (await existsFile(`docs/contracts/${latestArchitectureName}`));
    const roster = flowId !== undefined ? await loadLatestRoster({ projectRoot, flowId }) : undefined;

    // 最新 D3（appointment 裁决）：request.created.flowId ↔ request.resolved。
    // 2026-10-31（卡种收口）：**只接受 appointment 卡**的裁决——
    //   优先 `request.created.cardKind === "appointment"`（新事件）；resolved 自身 `cardKind === "appointment"` 亦可；
    //   两者皆缺（旧事件）时，仅当带 appointment 专属 `rosterVersion`/`rosterSha256` 戳才接受；
    //   其他 choice 卡（decision/intent-confirm/…）的裁决一律忽略——flow 匹配或仅有 targetRoleIds 都不是接受条件。
    const state = await this.readTasks(projectRoot);
    const requestFlows = new Map<string, string | undefined>();
    const requestCardKinds = new Map<string, GovernanceCardKind | undefined>();
    for (const event of state.events) {
      if (event.kind === "request.created") {
        requestFlows.set(event.requestId, event.flowId);
        requestCardKinds.set(event.requestId, event.cardKind);
      }
    }
    let d3: { targetRoleIds: string[]; at: string; decisionId?: string } | undefined;
    for (const event of state.events) {
      if (event.kind !== "request.resolved") continue;
      // T3 B3（AC-13/G-10）：fixed 议程的任命决议（带 `workflowId` 戳）不是 legacy D3 证据——
      // legacy D3 读取方只接受旧 roster 戳/无 `workflowId` 的裁决；fixed 决议不得被当作 D3。
      if (event.workflowId !== undefined) continue;
      // T3 B3.1：fixed appointment 决议的 `source:"stage-a10"`（运行时核心 B3.1 冻结字面）同属
      // fixed 来源——legacy D3 读取方不接受；即便异常缺 `workflowId` 也不得退化为 D3 证据。
      if (event.source === "stage-a10") continue;
      const targets = Array.isArray(event.targetRoleIds)
        ? event.targetRoleIds.filter((id): id is string => typeof id === "string" && id !== "")
        : [];
      if (targets.length === 0) continue;
      const createdKind = requestCardKinds.get(event.requestId);
      const resolvedKind = event.cardKind;
      const appointment = createdKind === "appointment" || resolvedKind === "appointment";
      const legacyAppointment =
        createdKind === undefined &&
        resolvedKind === undefined &&
        (event.rosterVersion !== undefined || event.rosterSha256 !== undefined);
      if (!appointment && !legacyAppointment) continue;
      const eventFlow = requestFlows.get(event.requestId);
      if (flowId !== undefined && eventFlow !== undefined && eventFlow !== flowId) continue;
      if (d3 === undefined || event.at > d3.at) {
        d3 = { targetRoleIds: targets, at: event.at, ...(event.decisionId !== undefined ? { decisionId: event.decisionId } : {}) };
      }
    }
    const convenerRoleId = this.handbackOwnerRoleId(projectRoot);
    const handoffFound = state.unclosed.some((record) => {
      const created = record.created;
      if (created === undefined) return false;
      if (created.from !== "chief" || convenerRoleId === null || created.to !== convenerRoleId) return false;
      if (created.stepId === "project-handoff") return true;
      // 旧记录无 stepId ⇒ flowId + 受限文本标记等价判定（F3 兼容口径）。
      return flowId !== undefined && created.flowId === flowId && /交付|handoff|运营/.test(created.text);
    });
    const listing = this.deps.getListing(projectRoot);
    const selected = d3?.targetRoleIds ?? [];
    const missingSelectedCardIds = selected.filter(
      (roleId) => !listing?.roles.some((role) => role.roleId === roleId && role.builtIn !== true),
    );
    const selectedCardsFound = selected.length > 0 && missingSelectedCardIds.length === 0;
    return {
      ...(flowId !== undefined ? { flowId } : {}),
      intent: { found: intentFound, candidates: intentFlows.length },
      proposalFound,
      architectureFound,
      ...(roster !== undefined ? { roster } : {}),
      d3Selected: selected,
      ...(d3?.decisionId !== undefined ? { d3DecisionId: d3.decisionId } : {}),
      handoffFound,
      selectedCardsFound,
      missingSelectedCardIds,
    };
  }
  // —— captureChiefDispatchSource（B6 自 session.ts 逐字搬移）——
  /**
   * B 批（2026-10-28）：**幕僚星形派发**——新任务链（不套旧 flow 派发门）。
   * 校验：目标须在本项目角色表（含内置角色），不能是幕僚自身；内置目标允许（B-05：任意内置/项目 worker）。
   * 持久化：先写 `task.created`（失败 ⇒ 不投递、如实回执），送达成功再写 `task.delivered`。
   * 去重：`tasks.jsonl` 中同 `idempotencyKey` 且未 closed ⇒ 不重复派发；已 closed 允许返工再派。
   * 副作用：幕僚声明 + 应用按任务文本**只升不降**（缺填/非法 ⇒ unknown）。
   * 投递复用既有投递机（自动开会话/排队/失败保留/重启续投）；回交意图携带 `taskId`。
   */
  captureChiefDispatchSource(projectRoot: string, runtime: RuntimeKind, source?: ActualDispatchSource) {
    const registration = this.deps.getRegisteredProjectLifecycle?.(projectRoot), entry = source?.entry, origin = source?.origin;
    const creatorReports = origin?.kind === "handback" ? origin.creatorReports : undefined;
    const current = () => !!entry && !!origin && this.sessions.get(this.sessionKey(projectRoot, "chief", runtime)) === entry &&
      entry.roleId === "chief" && entry.projectRoot === projectRoot && entry.busy && entry.origins.running === origin && !origin.settled &&
      !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted &&
      !this.runTaskIsFenced(projectRoot, origin.taskId, origin.assignment?.runId);
    if (!registration || !entry?.handle.sessionId || !origin?.turnId || origin.inputAccepted !== true || !current() ||
        (origin.kind !== undefined && origin.kind !== "message" && !creatorReports?.length)) return undefined;
    const hostInitialization: NonNullable<Parameters<typeof prepareRoleDispatch>[0]["hostInitialization"]> = { registration,
      parent: { roleId: "chief", runtime, sessionId: entry.handle.sessionId, turnId: origin.turnId, inputAccepted: true, settled: false,
        ...(origin.kind ? { kind: origin.kind } : {}), ...(origin.clientMessageId ? { clientMessageId: origin.clientMessageId } : {}) },
      ...(creatorReports ? { creatorReports: structuredClone(creatorReports) } : {}) };
    const isCurrent = () => { const selected = this.deps.getRegisteredProjectLifecycle?.(projectRoot);
      return current() && (!creatorReports || origin.creatorReports === creatorReports) && selected?.selectionId === registration.selectionId && selected.listingGeneration === registration.listingGeneration; };
    return { hostInitialization, isCurrent, expectedKind: creatorReports ? "chief-creator-report" : "chief-customer-turn" };
  }
  // —— resumeChiefController（B6 自 session.ts 逐字搬移）——
  async resumeChiefController(projectRoot: string, runtime: RuntimeKind, fromRoleId: string, d: DispatchTaskPayload, source?: ActualDispatchSource): Promise<DispatchReceipt> {
    const reject = (code: string, message: string): DispatchReceipt => ({ ok: false, message: `${code}：${message}` });
    if (fromRoleId !== "chief" || d.roleId !== "convener" || !d.resumeController || d.reviewTarget)
      return reject("controller-resume-source-invalid", "续接只允许幕僚明确指向原运营任务，未创建任务。");
    const host = this.captureChiefDispatchSource(projectRoot, runtime, source);
    if (!host) return reject("controller-resume-source-unavailable", "缺少当前幕僚实际输入来源。");
    const input = { projectRoot, resumeController: d.resumeController, hostInitialization: host.hostInitialization };
    const prepared = await prepareControllerResume(input);
    if (!host.isCurrent()) return reject("controller-resume-source-changed", "核验期间来源已变化。");
    if (!prepared.ok) return reject(prepared.code, prepared.message ?? prepared.code);
    const value = prepared.value, deliveryRuntime = this.findLiveRuntime(projectRoot, "convener") ?? runtime;
    const key = this.queueKey(projectRoot, "convener", deliveryRuntime), dedupKey = `hub-resume:${value.resumeKey}:${value.basisDigest}`;
    const clientMessageId = this.appTaskClientMessageIdFromSeed(dedupKey);
    if (this.deliveredAppTaskIds.has(clientMessageId) || this.deliveredDeliveryKeys.has(`${key}\u0000${dedupKey}`) ||
        this.deliveryQueues.get(key)?.some(item => item.clientMessageId === clientMessageId) || this.activeDeliveries.get(key)?.clientMessageId === clientMessageId)
      return { ok: true, message: "同一运营续接已受理或已ACK，未重复投递、未创建任务。" };
    if (this.deliveryIsStopped(key) || this.runTaskIsFenced(projectRoot, value.taskId, value.runId)) return reject("controller-resume-stopped", "原任务已停止，未重新打开。");
    const lease = beginGitHostAction({ projectRoot, kind: "dispatch" });
    if (!lease.ok) return reject(lease.code, "项目状态正在变化，续接未入队。");
    let endFailure: string | undefined;
    try {
      const fresh = await prepareControllerResume(input);
      if (!fresh.ok) return reject(fresh.code, fresh.message ?? fresh.code);
      if (!host.isCurrent() || fresh.value.resumeKey !== value.resumeKey || fresh.value.basisDigest !== value.basisDigest ||
          fresh.value.taskId !== value.taskId || fresh.value.runId !== value.runId || fresh.value.flowId !== value.flowId ||
          fresh.value.reviewTaskId !== value.reviewTaskId || fresh.value.reviewCloseOperationId !== value.reviewCloseOperationId)
        return reject("controller-resume-basis-changed", "入队前运营任务或质量依据已变化。");
      if (this.deliveryIsStopped(key) || this.runTaskIsFenced(projectRoot, value.taskId, value.runId)) return reject("controller-resume-stopped", "原任务已停止，续接未入队。");
      this.enqueueDelivery(projectRoot, "convener", { kind: "dispatch", runtime: deliveryRuntime, targetRoleId: "convener", sourceRoleId: "chief",
        taskId: value.taskId, flowId: value.flowId, text: d.task, summary: `续接 #${value.taskId}：${shortenSummary(d.task)}`, dedupKey, clientMessageId,
        controllerResume: { expected: structuredClone(d.resumeController), resumeKey: value.resumeKey, basisDigest: value.basisDigest } });
    } finally {
      const ended = endGitHostAction({ projectRoot, leaseId: lease.leaseId, inventory: desktopProjectExecutionInventory(projectRoot) });
      if (!ended.ok) endFailure = ended.code;
    }
    if (endFailure) return reject(endFailure, "续接消息已保留，但项目协调未完成，尚未投递；请核对后明确恢复。");
    void this.drainQueue(projectRoot, "convener", deliveryRuntime);
    return { ok: true, message: `已受理：续接原运营任务 #${value.taskId}，未创建任务；送达/ACK或失败另行报告，受理不等于已执行。` };
  }
  // —— routeStarDispatch（B6 自 session.ts 逐字搬移）——
  async routeStarDispatch(
    projectRoot: string,
    runtime: RuntimeKind,
    fromRoleId: string,
    d: DispatchTaskPayload,
    targetRoleId: string,
    task: string,
    source?: ActualDispatchSource,
  ): Promise<DispatchReceipt> {
    const fail = (message: string, row: string, rejection?: MechanicalRejection): DispatchReceipt => {
      if (rejection !== undefined) {
        this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, `${humanRejection(rejection)} ${technicalRejectionCode(rejection)}`);
        const formatted = formatMechanicalRejection(rejection);
        return { ok: false, message: formatted.includes(message) ? formatted : `${message}
${formatted}` };
      }
      this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, row);
      return { ok: false, message };
    };
    const chiefRoleId = this.chiefTaskRoleIdOf(projectRoot);
    if (d.resumeController !== undefined) return this.resumeChiefController(projectRoot, runtime, fromRoleId, d, source);
    // P1-R-05：会话层只拦自派；「target=幕僚且来源非幕僚」交给硬授权矩阵（convener-target-forbidden）。
    if (targetRoleId === fromRoleId) {
      return fail("派发未受理：不能派发给幕僚自己。", "派发未受理：不能派发给幕僚自己——未投递。");
    }
    const reason = d && typeof d.reason === "string" ? d.reason : undefined;
    const expectedOutput = d && typeof d.expectedOutput === "string" && d.expectedOutput.trim() !== "" ? d.expectedOutput.trim() : undefined;
    const requestedEvidence = d && Array.isArray(d.requestedEvidence)
      ? d.requestedEvidence.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 5)
      : undefined;
    const requestedModuleId = d && typeof d.moduleId === "string" && d.moduleId.trim() !== "" ? d.moduleId.trim() : undefined;
    const requestedModulePaths = d && Array.isArray(d.modulePaths)
      ? [...new Set(d.modulePaths.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()))].slice(0, 20)
      : undefined;
    const sideEffect = classifyTaskSideEffect(d?.sideEffect, task);
    const idempotencyKey = taskIdempotencyKey({
      from: fromRoleId,
      to: targetRoleId,
      text: task,
      ...(typeof d?.idempotencyKey === "string" ? { idempotencyKey: d.idempotencyKey } : {}),
      ...(requestedModuleId !== undefined ? { moduleId: requestedModuleId } : {}),
    });
    const state = await this.readTasks(projectRoot);
    // 2026-10-29（BUG-5）：同一幂等键的**已报告/已收口**任务也抑制重复派发——完成后的重复调用
    // 不得再创建 task.created 或产生新的 task.delivered。显式返工须使用新的任务文本或新的
    // `idempotencyKey`（重派走 redispatchTask，不重复本路径）。
    const duplicate = findTaskByIdempotencyKey(state, idempotencyKey);
    if (duplicate !== undefined) {
      const terminal = duplicate.closed !== undefined || duplicate.reports.length > 0;
      if (terminal) {
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: targetRoleId }).record(
          "tasks.dispatch.duplicate-terminal",
          { taskId: duplicate.taskId, closed: duplicate.closed !== undefined, reports: duplicate.reports.length },
        );
      }
      return {
        ok: true,
        message: terminal
          ? `已受理：任务 #${duplicate.taskId} 已${duplicate.closed !== undefined ? "收口" : "报告"}，重复派发已抑制（未创建新任务、未投递）；如需返工请使用新的任务文本或幂等键。`
          : `已受理：同一任务已存在（#${duplicate.taskId}），未重复派发；受理 ≠ 完成。`,
      };
    }

    // —— B1/R1：目标事实 + 硬授权（必须在任何 run 账本写入之前）——
    await this.refreshListingNow(projectRoot);
    const listingForPreflight = this.deps.getListing(projectRoot);
    const targetRole = listingForPreflight?.roles.find((role) => role.roleId === targetRoleId);
    const targetBuiltIn = targetRole?.builtIn === true || isBuiltInGovernanceRoleId(targetRoleId);
    const targetExists = targetRole !== undefined || isBuiltInGovernanceRoleId(targetRoleId);
    const convenerRoleId = this.handbackOwnerRoleId(projectRoot);
    const authorization = evaluateDispatchAuthorization({
      fromRoleId,
      targetRoleId,
      targetBuiltIn,
      targetExists,
      chiefRoleId,
      convenerRoleId,
    });
    if (!authorization.ok) {
      return fail(authorization.message, authorization.message, authorization.rejection);
    }
    if (fromRoleId === convenerRoleId && targetRoleId === "verifier")
      return fail("chief-hub-review-owner-required：新的质检任务须由幕僚创建，未登记任务。", "新的质检任务须由幕僚创建，未登记任务。");
    if (d.reviewTarget !== undefined && targetRoleId !== "verifier")
      return fail("review-target-invalid：只有真实质检目标可申请候选评审，未派发。", "只有真实质检目标可申请候选评审，未派发。");
    const mandatoryReview = d.reviewTarget !== undefined;
    if (mandatoryReview && targetRole?.builtIn !== true)
      return fail("review-target-unproven：当前登记的真实内置质检目标不可用，未派发。", "当前登记的真实内置质检目标不可用，未派发。");
    const workerDispatch = !targetBuiltIn;
    const hubPreparation = fromRoleId === chiefRoleId && targetRole?.builtIn === true &&
      ["product", "rapporteur", "nominator", "convener", "verifier"].includes(targetRoleId) && !mandatoryReview;
    if (hubPreparation && !d.flowId)
      return fail("chief-hub-flow-unavailable：缺少明确任务流程，未创建裸任务。", "缺少明确任务流程，未创建任务。");
    const documentPlanningRole = fromRoleId === chiefRoleId && targetRole?.builtIn === true && (targetRoleId === "product" || targetRoleId === "rapporteur");
    const rolePreparation = fromRoleId === chiefRoleId && targetRole?.builtIn === true && targetRoleId === "nominator";
    const expectedPreparationPurpose = hubPreparation ? "builtin-preparation" : rolePreparation ? "role-preparation" : "document-preparation";
    if (rolePreparation && !d.flowId) return fail("role-preparation-source-unavailable：人事准备缺少明确流程，未登记任务。", "人事准备缺少明确流程，未登记任务。");
    const sourceIsCurrent = () => !!source && this.sessions.get(this.sessionKey(projectRoot, fromRoleId, runtime)) === source.entry &&
      source.entry.busy && source.entry.origins.running === source.origin && !source.origin.settled &&
      !this.runTaskIsFenced(projectRoot, source.origin.taskId, source.origin.assignment?.runId) &&
      !source.entry.interactionState.lifetime.signal.aborted && !source.entry.interactionState.turn.signal.aborted;
    let parentTaskId: string | undefined;
    let executionRunId: string | undefined, executionFlowId: string | undefined;
    let executionPaths: string[] | undefined, executionModuleId: string | undefined;
    if (workerDispatch || fromRoleId === convenerRoleId) {
      if (fromRoleId !== convenerRoleId || !sourceIsCurrent() || !source?.origin.taskId)
        return fail("worker-dispatch-source-unavailable：缺少当前运营真实受派任务，未派发。", "缺少当前运营真实受派任务，未派发。");
      parentTaskId = source.origin.taskId;
      const parent = await inspectAssignedTask({ projectRoot, taskId: parentTaskId, actorRoleId: fromRoleId });
      if (!sourceIsCurrent()) return fail("worker-dispatch-source-changed：发起轮次已变化，未派发。", "发起轮次已变化，未派发。");
      if (!parent.ok) return fail(`${parent.code}：${parent.message ?? parent.code}`, `${parent.message ?? parent.code}`);
      if (d.flowId !== undefined && d.flowId !== parent.value.flowId)
        return fail("worker-dispatch-flow-mismatch：派发flow与当前真实父任务不一致。", "派发flow与当前真实父任务不一致。");
      executionRunId = parent.value.runId; executionFlowId = parent.value.flowId;
    }
    // An explicit target or actual convener-to-built-in-verifier route is mandatory immutable review,
    // never an optional legacy run anchor. Missing target material must reject before task creation.
    let preparedReview: Extract<Awaited<ReturnType<typeof prepareRoleDispatch>>, { ok: true }>["value"] | undefined;
    let workSourceRef: TaskWorkSourceRef | undefined;
    let reviewHost: ReturnType<Dispatch["captureChiefDispatchSource"]>;
    if (mandatoryReview) {
      reviewHost = this.captureChiefDispatchSource(projectRoot, runtime, source);
      if (fromRoleId !== chiefRoleId || targetRoleId !== "verifier" || !d.flowId || !reviewHost)
        return fail("review-source-unavailable：缺少当前幕僚真实输入及评审流程，未登记任务。", "缺少当前幕僚真实输入及评审流程，未登记任务。");
      if (requestedModuleId || requestedModulePaths?.length)
        return fail("review-module-scope-forbidden：评审不接受实现模块写区，未派发。", "评审不接受实现模块写区，未派发。");
      const review = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: d.flowId,
        hostInitialization: reviewHost.hostInitialization, reviewTarget: d.reviewTarget });
      if (!reviewHost.isCurrent()) return fail("review-source-changed：核验期间发起输入已变化。", "核验期间发起输入已变化。");
      if (!review.ok) return fail(`${review.code}：${review.message}`, review.message);
      const value = review.value, ref = value.initializationSource;
      const sourceRef = ref ? { sourceId: ref.sourceId, path: ref.path, sha256: ref.sha256, kind: ref.kind ?? "chief-customer-turn" } : undefined;
      if (value.kind !== "review" || value.hubRouting !== "chief-hub-v1" || !value.reviewBasisRef || !value.reviewControllerRef ||
          value.parentTaskRef || !value.runId || value.flowId !== d.flowId || !isTaskWorkSourceRef(sourceRef) || sourceRef.kind !== reviewHost.expectedKind)
        return fail("review-source-unavailable：正式评审未返回真实独立controller和完整来源。", "正式评审未返回真实独立controller和完整来源。");
      preparedReview = value; workSourceRef = sourceRef;
    }
    const chainFacts = await this.chainDispatchFacts(projectRoot, d?.flowId);
    const dispatchFlowId = executionFlowId ?? d?.flowId ?? chainFacts.flowId;
    // M1（幕僚→产品）允许尚未写 flowId：仍先生成 pending draft；后续真实 flow 到达时领养同一 runId。
    const runFlowId = dispatchFlowId ?? (fromRoleId === chiefRoleId && targetRoleId === "product" ? RUN_PENDING_FLOW_ID : undefined);
    const handoffDispatch = !hubPreparation && fromRoleId === chiefRoleId && convenerRoleId !== null && targetRoleId === convenerRoleId;
    let initializationIsCurrent: (() => boolean) | undefined;
    let initializationSelectionIsCurrent: (() => boolean) | undefined;
    let preparedTeamPlanning: Extract<Awaited<ReturnType<typeof prepareRoleDispatch>>, { ok: true }>["value"] | undefined;
    let teamPlanningHostSource: NonNullable<Parameters<typeof prepareRoleDispatch>[0]["hostInitialization"]> | undefined;
    const initializationChanged = "项目选择或发起输入已变化，初始化未派发。请在当前项目重新发起。";
    if (handoffDispatch) {
      if (dispatchFlowId === undefined) return fail("规划协调缺少明确flowId，未派发。", "请先明确当前规划所属项目。");
      const registration = this.deps.getRegisteredProjectLifecycle?.(projectRoot);
      const parentEntry = this.sessions.get(this.sessionKey(projectRoot, fromRoleId, runtime));
      const parentOrigin = parentEntry?.origins.running;
      const creatorReports = parentOrigin?.kind === "handback" ? parentOrigin.creatorReports : undefined;
      const hostInitialization = registration && parentEntry?.busy === true && parentEntry.handle.sessionId &&
        parentOrigin?.inputAccepted === true && parentOrigin.turnId && !parentOrigin.settled && sourceIsCurrent() &&
        (parentOrigin.kind === undefined || parentOrigin.kind === "message" || creatorReports?.length)
        ? { registration, parent: { roleId: "chief" as const, sessionId: parentEntry.handle.sessionId,
            turnId: parentOrigin.turnId, runtime, settled: false as const, inputAccepted: true as const,
            ...(parentOrigin.clientMessageId ? { clientMessageId: parentOrigin.clientMessageId } : {}),
            ...(parentOrigin.kind ? { kind: parentOrigin.kind } : {}) },
            ...(creatorReports ? { creatorReports: structuredClone(creatorReports) } : {}) }
        : undefined;
      const planning = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: dispatchFlowId,
        ...(hostInitialization ? { hostInitialization } : {}) });
      if (!planning.ok || planning.value.kind !== "planning") return fail(planning.ok ? "规划上下文不匹配。" : planning.message,
        planning.ok ? "规划上下文不匹配。" : planning.message);
      if (!hostInitialization || !parentEntry || !parentOrigin || !planning.value.initializationSource)
        return fail("planning-source-unavailable：未取得当前实际工作来源，未登记团队任务。", "未取得当前实际工作来源，未登记团队任务。");
      {
        const isInitialization = planning.value.purpose === "repository-initialization";
        if (isInitialization && creatorReports) return fail(initializationChanged, initializationChanged);
        if (!isInitialization && (!planning.value.runId || planning.value.flowId !== dispatchFlowId))
          return fail("planning-scope-unavailable：团队规划尚无真实独立草稿范围，未登记任务。", "团队规划尚无真实独立草稿范围，未登记任务。");
        const receipt = planning.value.initializationSource;
        const expectedKind = creatorReports ? "chief-creator-report" : "chief-customer-turn";
        const sourceRef = { kind: receipt.kind ?? "chief-customer-turn", sourceId: receipt.sourceId, path: receipt.path, sha256: receipt.sha256 };
        if (!isTaskWorkSourceRef(sourceRef) || sourceRef.kind !== expectedKind) return fail(initializationChanged, initializationChanged);
        workSourceRef = sourceRef;
        if (!isInitialization) { preparedTeamPlanning = planning.value; teamPlanningHostSource = hostInitialization; }
        initializationSelectionIsCurrent = () => {
          const current = this.deps.getRegisteredProjectLifecycle?.(projectRoot);
          return current?.selectionId === registration?.selectionId && current?.listingGeneration === registration?.listingGeneration;
        };
        initializationIsCurrent = () => {
          return initializationSelectionIsCurrent!() &&
            this.sessions.get(this.sessionKey(projectRoot, fromRoleId, runtime)) === parentEntry &&
            parentEntry.busy && parentEntry.origins.running === parentOrigin && !parentOrigin.settled &&
            (!creatorReports || parentOrigin.creatorReports === creatorReports) && sourceIsCurrent() &&
            parentOrigin.turnId === hostInitialization.parent.turnId && !parentEntry.interactionState.turn.signal.aborted;
        };
        if (!initializationIsCurrent()) return fail(initializationChanged, initializationChanged);
      }
    }

    const hasLegacyFlowTask = dispatchFlowId !== undefined && [...state.records.values()].some(
      (record) => record.created?.flowId === dispatchFlowId && record.created.runId === undefined,
    );
    // —— B1/R2：run 只读/记账 best-effort；失败只记 runFacts，不阻断派发 ——
    const runFacts: NonNullable<DispatchPreflightInput["runFacts"]> = {};
    let runManifest: RunManifest | undefined;
    let runState: "draft" | "pinned" | undefined;
    let pinnedRoster: ProjectRoster | undefined;
    let preparedDocumentPlanning: Extract<Awaited<ReturnType<typeof prepareRoleDispatch>>, { ok: true }>["value"] | undefined;
    let documentHostSource: NonNullable<Parameters<typeof prepareRoleDispatch>[0]["hostInitialization"]> | undefined;
    let documentSourceIsCurrent: (() => boolean) | undefined;
    const prepareDocumentScope = async (oldRunId?: string): Promise<DispatchReceipt | undefined> => {
        // Existing-project authoring is a new planning scope, not reuse of an old execution pin.
        const registration = this.deps.getRegisteredProjectLifecycle?.(projectRoot);
        const entry = source?.entry, origin = source?.origin;
        const customerSource = origin?.kind === undefined || origin.kind === "message";
        const creatorSource = origin?.kind === "handback" ? origin.creatorReports : undefined;
        if (!d.flowId || !registration || !entry?.handle.sessionId || !origin?.turnId || origin.inputAccepted !== true ||
            (!customerSource && !creatorSource?.length) || !sourceIsCurrent())
          return fail("document-planning-source-unavailable：缺少当前客户输入与真实项目选择，未登记文档任务。", "缺少当前客户输入与真实项目选择，未登记文档任务。");
        if (requestedModuleId || requestedModulePaths?.length)
          return fail("document-planning-module-forbidden：文档准备不授实现模块写区。", "文档准备不授实现模块写区。");
        documentHostSource = { registration, parent: { roleId: "chief", sessionId: entry.handle.sessionId, turnId: origin.turnId,
          runtime, inputAccepted: true, settled: false, ...(origin.clientMessageId ? { clientMessageId: origin.clientMessageId } : {}),
          ...(origin.kind ? { kind: origin.kind } : {}) }, ...(creatorSource ? { creatorReports: structuredClone(creatorSource) } : {}) };
        documentSourceIsCurrent = () => {
          const currentRegistration = this.deps.getRegisteredProjectLifecycle?.(projectRoot);
          return sourceIsCurrent() && (!creatorSource || origin.creatorReports === creatorSource) && currentRegistration?.selectionId === registration.selectionId && currentRegistration.listingGeneration === registration.listingGeneration;
        };
        const planning = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: d.flowId, hostInitialization: documentHostSource });
        if (!documentSourceIsCurrent()) return fail("document-planning-source-changed：准备期间客户或项目来源已变化，未登记任务。", "准备期间客户或项目来源已变化，未登记任务。");
        if (!planning.ok) return fail(`${planning.code}：${planning.message}`, planning.message);
        const executionSelection = planning.value.kind === "execution" && hubPreparation && fromRoleId === chiefRoleId && targetRoleId === "convener" && creatorSource?.length;
        if ((planning.value.kind !== "planning" && !executionSelection) || planning.value.purpose !== expectedPreparationPurpose || (hubPreparation && planning.value.hubRouting !== "chief-hub-v1") || !planning.value.runId ||
            (oldRunId !== undefined && planning.value.runId === oldRunId) || planning.value.flowId !== d.flowId || !planning.value.initializationSource)
          return fail("document-planning-basis-unavailable：缺少真实独立规划来源，未登记任务。", "缺少真实独立规划来源，未登记任务。");
        const expectedKind = creatorSource ? "chief-creator-report" : "chief-customer-turn";
        const ref = { ...planning.value.initializationSource, kind: planning.value.initializationSource.kind ?? "chief-customer-turn" };
        if (ref.kind !== expectedKind) return fail("document-planning-source-invalid：真实工作来源类型与当前输入不一致。", "真实工作来源类型与当前输入不一致。");
        if (!isTaskWorkSourceRef(ref)) return fail("document-planning-source-invalid：实际工作来源形状无效。", "实际工作来源形状无效。");
        preparedDocumentPlanning = planning.value; workSourceRef = ref;
        return undefined;
    };
    // A prior executable pin is never an authoring grant for the next customer change.
    // A fresh customer source must still be current on the original NEW draft path.
    if ((hubPreparation || documentPlanningRole || rolePreparation) && d.flowId && (source?.origin.kind === undefined || source.origin.kind === "message") &&
        (!this.deps.getRegisteredProjectLifecycle?.(projectRoot) || !sourceIsCurrent()))
      return fail("document-planning-source-unavailable：缺少当前客户输入与真实项目选择，未登记文档任务。", "缺少当前客户输入与真实项目选择，未登记文档任务。");
    // The original NEW draft/report path remains separate until it has a real document baseline.
    if ((hubPreparation || documentPlanningRole || rolePreparation) && d.flowId && sourceIsCurrent() &&
        (source?.origin.kind === undefined || source.origin.kind === "message" || source.origin.kind === "handback")) {
      const protection = await readRoleCapabilityProtectionScope({ projectRoot });
      if (!sourceIsCurrent()) return fail("document-planning-source-changed：读取保护范围期间来源已变化。", "读取保护范围期间来源已变化。");
      // This fresh observation selects compatibility only; the public planning call proves the actual scope.
      // A genuine initialized empty Git media is distinguished from corrupt/missing authority by Pipeline.
      if (hubPreparation || rolePreparation || protection.state !== "unmanaged") { const failure = await prepareDocumentScope(); if (failure) return failure; }
    }
    if (workerDispatch && executionRunId && executionFlowId && parentTaskId) {
      const operationId = `freeze-dispatch-${createHash("sha256").update(JSON.stringify([executionRunId, parentTaskId, idempotencyKey])).digest("hex").slice(0, 40)}`;
      const frozen = await freezeExecutionRun({ projectRoot, runId: executionRunId, flowId: executionFlowId, operationId });
      if (!sourceIsCurrent()) return fail("worker-dispatch-source-changed：冻结期间发起轮次已变化，未派发。", "冻结期间发起轮次已变化，未派发。");
      if (!frozen.ok) return fail(`worker-freeze stage=${frozen.stage} code=${frozen.code} parentTaskId=${parentTaskId} runId=${executionRunId}：${frozen.message}`, frozen.message);
      const execution = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: executionFlowId,
        runId: executionRunId, ...(requestedModuleId ? { moduleId: requestedModuleId } : {}) });
      if (!sourceIsCurrent()) return fail("worker-dispatch-source-changed：核验期间发起轮次已变化，未派发。", "核验期间发起轮次已变化，未派发。");
      if (!execution.ok) return fail(`${execution.code}：${execution.message}`, execution.message);
      if (execution.value.kind !== "execution" || !execution.value.moduleId || !execution.value.modulePaths?.length)
        return fail("worker-module-scope-unavailable：真实执行模块写区不可用，未派发。", "真实执行模块写区不可用，未派发。");
      const frozenShape = validateRunManifest(frozen.run);
      if (!frozenShape.ok)
        return fail(`worker-freeze-return-invalid code=${frozenShape.code} reason=${frozenShape.reason} parentTaskId=${parentTaskId} runId=${executionRunId} flowId=${executionFlowId}：实际冻结run回执形状无效，未派发。`, "实际冻结run回执形状无效，未派发。");
      if (frozenShape.manifest.state !== "pinned" || frozenShape.manifest.runId !== executionRunId || frozenShape.manifest.flowId !== executionFlowId)
        return fail(`worker-freeze-return-invalid state=${frozenShape.manifest.state} actualRunId=${frozenShape.manifest.runId} actualFlowId=${frozenShape.manifest.flowId} expectedRunId=${executionRunId} expectedFlowId=${executionFlowId}：实际冻结run回执身份不匹配，未派发。`, "实际冻结run回执身份不匹配，未派发。");
      runManifest = frozenShape.manifest; runState = "pinned";
      executionModuleId = execution.value.moduleId; executionPaths = [...execution.value.modulePaths];
      const roster = await loadPinnedRoster(projectRoot, runManifest);
      if (!roster.ok) return fail("worker-pinned-roster-unavailable：真实冻结名单不可读，未派发。", "真实冻结名单不可读，未派发。");
      pinnedRoster = roster.roster;
    } else if (!mandatoryReview && !preparedDocumentPlanning && !preparedTeamPlanning && runFlowId !== undefined) {
      const active = executionRunId ? await readRunManifest(projectRoot, executionRunId) : await findActiveRun(projectRoot, runFlowId);
      if (!active.ok) {
        runFacts.ledgerUnavailable = true;
      } else if (active.manifest !== null) {
        runManifest = active.manifest;
        runState = active.manifest.state === "pinned" ? "pinned" : "draft";
      } else {
        const draft = await ensureDraftRun(projectRoot, runFlowId, new Date(this.now()));
        if (!draft.ok) {
          runFacts.ledgerUnavailable = true;
        } else {
          runManifest = draft.manifest;
          runState = "draft";
        }
      }
      if (runManifest !== undefined && runState === "pinned" && (hubPreparation || documentPlanningRole || rolePreparation)) {
        const failure = await prepareDocumentScope(runManifest.runId); if (failure) return failure;
        runManifest = undefined; runState = undefined;
      } else if (runManifest !== undefined && runState === "pinned") {
        const verified = await verifyPinnedRun(projectRoot, runManifest);
        if (!verified.ok || verified.violations.length > 0) {
          runFacts.documentHashMismatch = true;
          runManifest = undefined;
          runState = undefined;
        } else {
          const pinnedRosterResult = await loadPinnedRoster(projectRoot, runManifest);
          if (!pinnedRosterResult.ok) {
            runFacts.pinnedRosterInvalid = true;
            runManifest = undefined;
            runState = undefined;
          } else {
            pinnedRoster = pinnedRosterResult.roster;
          }
        }
      }
    }

    // Planning coordination must not require future D3, active role documents or workflow.
    // Worker execution obtains a complete immutable pin through the separate execution preflight.

    const { baselineViolations } = await collectDispatchBaselineFacts({ projectRoot });

    // —— B1/P1 §5.4：advisory 只由 A1 collector 产出；B1 只收集事实 ——
    const targetCardFound =
      convenerRoleId !== null && targetRoleId === convenerRoleId
        ? chainFacts.selectedCardsFound
        : targetRole !== undefined;
    const advisoryRun = hasLegacyFlowTask
      ? { state: "legacy" as const }
      : runManifest !== undefined && runState !== undefined
        ? {
            state: runState,
            runId: runManifest.runId,
            ...(runManifest.roles !== undefined ? { roles: runManifest.roles } : {}),
            ...(runState === "pinned" && pinnedRoster !== undefined
              ? { modules: pinnedRoster.modules.map((module) => module.id) }
              : {}),
          }
        : undefined;
    const advisories = collectDispatchAdvisories({
      fromRoleId,
      targetRoleId,
      targetBuiltIn,
      targetExists,
      chiefRoleId,
      convenerRoleId,
      ...(chainFacts.flowId !== undefined ? { flowId: chainFacts.flowId } : {}),
      intent: chainFacts.intent,
      proposalFound: chainFacts.proposalFound,
      architectureFound: chainFacts.architectureFound,
      ...(chainFacts.roster !== undefined ? { roster: chainFacts.roster } : {}),
      d3Selected: chainFacts.d3Selected,
      ...(requestedModuleId !== undefined ? { moduleId: requestedModuleId } : {}),
      ...(requestedModulePaths !== undefined && requestedModulePaths.length > 0 ? { modulePaths: requestedModulePaths } : {}),
      handoffFound: chainFacts.handoffFound,
      ...(chainFacts.missingSelectedCardIds.length > 0 ? { missingSelectedCardIds: chainFacts.missingSelectedCardIds } : {}),
      targetCardFound,
      ...(advisoryRun !== undefined ? { run: advisoryRun } : {}),
      ...(Object.keys(runFacts).length > 0 ? { runFacts } : {}),
      ...(baselineViolations.length > 0 ? { versionedDocBaselineViolations: baselineViolations.map((violation) => violation.path) } : {}),
    });

    // —— R2 锚点：draft 直接锚定；pinned 仅在 verify+roster+目标/模块覆盖时锚定 ——
    let anchorState: "draft" | "pinned" | undefined;
    let anchorRunId: string | undefined;
    let anchorRunStage: string | undefined;
    let anchorFlowId: string | undefined;
    if (runManifest !== undefined && runState !== undefined) {
      const targetCovered = targetBuiltIn || (runManifest.roles !== undefined && runManifest.roles.includes(targetRoleId));
      const moduleCovered =
        requestedModuleId === undefined ||
        (pinnedRoster !== undefined && pinnedRoster.modules.some((module) => module.id === requestedModuleId));
      if (runState === "draft" || (targetCovered && moduleCovered)) {
        anchorState = runState;
        anchorRunId = runManifest.runId;
        anchorRunStage = runManifest.stage?.current;
        anchorFlowId = runManifest.flowId;
      }
    }

    if (preparedReview) {
      anchorState = "pinned"; // Proven by the immutable review preflight, not inferred from a role or task label.
      anchorRunId = preparedReview.runId;
      anchorFlowId = preparedReview.flowId;
    }

    if (preparedDocumentPlanning) {
      anchorState = preparedDocumentPlanning.kind === "execution" ? "pinned" : "draft"; anchorRunId = preparedDocumentPlanning.runId; anchorFlowId = preparedDocumentPlanning.flowId;
      anchorRunStage = undefined;
    }
    if (preparedTeamPlanning) {
      anchorState = "draft"; anchorRunId = preparedTeamPlanning.runId; anchorFlowId = preparedTeamPlanning.flowId;
      anchorRunStage = undefined;
    }
    // An optional legacy advisory must not erase a supplied flow and still accept a naked task.
    if (d.flowId !== undefined && anchorFlowId !== d.flowId)
      return fail("dispatch-scope-unavailable：未取得与请求一致的真实任务范围，未登记或投递任务。", "未取得与请求一致的真实任务范围，未登记或投递任务。");

    // —— 模块字段：适用名单=锚定 pinned roster，否则最新 roster（§5.3.3）——
    const applicableRoster =
      anchorState === "pinned" && pinnedRoster !== undefined
        ? pinnedRoster
        : chainFacts.roster !== undefined && chainFacts.roster.ok === true
          ? chainFacts.roster.roster
          : undefined;
    const taskModule =
      requestedModuleId !== undefined && applicableRoster !== undefined
        ? applicableRoster.modules.find((module) => module.id === requestedModuleId)
        : undefined;
    const moduleOwnerId =
      taskModule !== undefined && applicableRoster !== undefined
        ? applicableRoster.roles.find((role) => role.modules.includes(taskModule.id))?.id
        : undefined;
    const writeModule =
      taskModule !== undefined && (targetBuiltIn || targetRoleId === "verifier" || moduleOwnerId === targetRoleId);
    const taskId = newTaskId(new Date(this.now()));
    const createdAt = new Date(this.now());
    // 交付任务固定 stepId=project-handoff（M6/M7 的机械前置依据）；其余任务可带模型声明的 stepId。
    const dispatchStepId =
      fromRoleId === chiefRoleId && convenerRoleId !== null && targetRoleId === convenerRoleId
        ? "project-handoff"
        : typeof d?.stepId === "string" && d.stepId.trim() !== ""
          ? d.stepId.trim()
          : undefined;
    let created = taskEvent("task.created", {
      taskId,
      from: fromRoleId === convenerRoleId ? "convener" : "chief",
      ...(anchorState !== undefined && anchorFlowId !== undefined ? { flowId: anchorFlowId } : {}),
      ...(dispatchStepId !== undefined ? { stepId: dispatchStepId } : {}),
      ...(workerDispatch && executionModuleId && executionPaths
        ? { moduleId: executionModuleId, modulePaths: executionPaths,
            ...(taskModule?.id === executionModuleId && taskModule.path.endsWith("/") ? { moduleDirectory: taskModule.path } : {}) }
        : writeModule && taskModule !== undefined
        ? {
            moduleId: taskModule.id,
            ...(taskModule.path.endsWith("/") ? { moduleDirectory: taskModule.path } : {}),
            modulePaths: [...taskModule.paths],
          }
        : {}),
      to: targetRoleId,
      text: task,
      ...(anchorState !== undefined && anchorRunId !== undefined
        ? {
            runId: anchorRunId,
            runState: anchorState,
            ...(anchorRunStage !== undefined ? { runStage: anchorRunStage } : {}),
          }
        : {}),
      ...(expectedOutput !== undefined ? { expectedOutput } : {}),
      ...(requestedEvidence !== undefined ? { requestedEvidence } : {}),
      ...(workSourceRef ? { workSourceRef } : {}),
      ...(preparedDocumentPlanning?.hubRouting === "chief-hub-v1" ? { hubRouting: "chief-hub-v1" as const } : {}),
      ...(preparedReview ? { reviewBasisRef: preparedReview.reviewBasisRef, reviewControllerRef: preparedReview.reviewControllerRef, hubRouting: "chief-hub-v1" as const } : {}),
      sideEffect,
      idempotencyKey,
    }, () => createdAt);
    let sourceLease: { projectRoot: string; leaseId: string } | undefined;
    if (initializationIsCurrent || documentSourceIsCurrent || reviewHost) {
      const lease = beginGitHostAction({ projectRoot, kind: "dispatch" });
      if (!lease.ok) return fail("项目状态正在变更，初始化尚未派发。请稍后重试。", "项目状态正在变更，初始化尚未派发。请稍后重试。");
      sourceLease = { projectRoot, leaseId: lease.leaseId };
    }
    try {
      if (initializationIsCurrent && !initializationIsCurrent()) return fail(initializationChanged, initializationChanged);
      if (preparedReview) {
        if (!reviewHost?.isCurrent()) return fail("review-source-changed", "当前幕僚评审来源已变化。");
        const fresh = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: preparedReview.flowId, reviewTarget: d.reviewTarget, hostInitialization: reviewHost.hostInitialization });
        if (!fresh.ok) return fail(`${fresh.code}：${fresh.message}`, fresh.message);
        if (!reviewHost.isCurrent() || fresh.value.kind !== "review" || fresh.value.runId !== created.runId || fresh.value.flowId !== created.flowId ||
            fresh.value.basisDigest !== preparedReview.basisDigest || JSON.stringify(fresh.value.reviewBasisRef) !== JSON.stringify(created.reviewBasisRef) ||
            JSON.stringify(fresh.value.reviewControllerRef) !== JSON.stringify(created.reviewControllerRef) || fresh.value.initializationSource?.sourceId !== workSourceRef?.sourceId ||
            fresh.value.initializationSource?.sha256 !== workSourceRef?.sha256 || fresh.value.initializationSource?.path !== workSourceRef?.path ||
            (fresh.value.initializationSource?.kind ?? "chief-customer-turn") !== workSourceRef?.kind)
          return fail("review-basis-changed：提交前评审对象或来源已变化。", "提交前评审对象或来源已变化。");
      }
      if (preparedTeamPlanning) {
        if (!teamPlanningHostSource || !initializationIsCurrent?.()) return fail(initializationChanged, initializationChanged);
        const fresh = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: preparedTeamPlanning.flowId, hostInitialization: teamPlanningHostSource });
        if (!fresh.ok) return fail(`${fresh.code}：${fresh.message}`, fresh.message);
        const receipt = fresh.value.initializationSource;
        if (!initializationIsCurrent() || fresh.value.kind !== "planning" || fresh.value.flowId !== created.flowId ||
            fresh.value.runId !== created.runId || fresh.value.basisDigest !== preparedTeamPlanning.basisDigest ||
            receipt?.sourceId !== workSourceRef?.sourceId || receipt?.path !== workSourceRef?.path || receipt?.sha256 !== workSourceRef?.sha256 ||
            (receipt?.kind ?? "chief-customer-turn") !== workSourceRef?.kind)
          return fail("planning-source-changed：提交前团队规划依据或来源已变化，未登记任务。", "提交前团队规划依据或来源已变化，未登记任务。");
      }
      if (preparedDocumentPlanning) {
        if (!documentHostSource || !documentSourceIsCurrent?.()) return fail("document-planning-source-changed：当前客户或项目来源已变化。", "当前客户或项目来源已变化。");
        const fresh = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: preparedDocumentPlanning.flowId, hostInitialization: documentHostSource });
        if (!fresh.ok) return fail(`${fresh.code}：${fresh.message}`, fresh.message);
        if (!documentSourceIsCurrent() || fresh.value.kind !== preparedDocumentPlanning.kind ||
            created.runState !== (preparedDocumentPlanning.kind === "execution" ? "pinned" : "draft") || fresh.value.purpose !== expectedPreparationPurpose || fresh.value.hubRouting !== preparedDocumentPlanning.hubRouting ||
            fresh.value.flowId !== created.flowId || fresh.value.runId !== created.runId || fresh.value.basisDigest !== preparedDocumentPlanning.basisDigest ||
            fresh.value.initializationSource?.sourceId !== workSourceRef?.sourceId || fresh.value.initializationSource?.sha256 !== workSourceRef?.sha256 ||
            fresh.value.initializationSource?.path !== workSourceRef?.path || (fresh.value.initializationSource?.kind ?? "chief-customer-turn") !== workSourceRef?.kind)
          return fail("document-planning-source-changed：提交前真实规划依据已变化，未登记任务。", "提交前真实规划依据已变化，未登记任务。");
      }
      // Keep the lease across all ledger awaits. Cancellation does not prematurely release an in-flight append.
      if (mandatoryReview && (!preparedReview || !created.flowId || !created.runId || !created.reviewBasisRef || !created.reviewControllerRef || created.hubRouting !== "chief-hub-v1"))
        return fail("review-source-unavailable：评审来源未完整绑定，未登记任务。", "评审来源未完整绑定，未登记任务。");
      if (created.from === "convener" && created.flowId !== undefined) {
        if (!parentTaskId || created.runId !== executionRunId || created.flowId !== executionFlowId)
          return fail("task-parent-unavailable：子任务与当前实际父任务run/flow不一致，未登记任务。", "子任务与当前实际父任务run/flow不一致，未登记任务。");
        if (!sourceIsCurrent()) return fail("worker-dispatch-source-changed：发起轮次已变化，未登记任务。", "发起轮次已变化，未登记任务。");
        // A built-in target does not turn an execution dispatch into planning authorization.
        if (!workerDispatch && created.runId) {
          const checked = await prepareRoleDispatch({ projectRoot, fromRoleId, targetRoleId, flowId: created.flowId, runId: created.runId,
            parentTaskId, ...(d.reviewTarget ? { reviewTarget: d.reviewTarget } : {}), ...(requestedModuleId ? { moduleId: requestedModuleId } : {}) });
          if (!checked.ok) return fail(`${checked.code}：${checked.message}`, checked.message);
          if (!sourceIsCurrent()) return fail("worker-dispatch-source-changed：预检期间发起轮次已变化，未登记任务。", "预检期间发起轮次已变化，未登记任务。");
          if (checked.value.kind === "review") {
            if (!checked.value.reviewBasisRef || !checked.value.parentTaskRef || checked.value.runId !== created.runId ||
                checked.value.flowId !== created.flowId || created.runState !== "pinned")
              return fail("review-source-unavailable：实际评审来源或已冻结run不匹配，未派发。", "实际评审来源或已冻结run不匹配，未派发。");
            if (requestedModuleId || requestedModulePaths?.length)
              return fail("review-module-scope-forbidden：评审不接受实现模块写区，未派发。", "评审不接受实现模块写区，未派发。");
            const { moduleId, modulePaths, moduleDirectory, ...withoutModule } = created;
            created = { ...withoutModule, reviewBasisRef: checked.value.reviewBasisRef, parentTaskRef: checked.value.parentTaskRef };
          } else if (checked.value.kind === "execution") created = { ...created, moduleId: checked.value.moduleId, modulePaths: checked.value.modulePaths };
        }
        if (!executionRunId || !executionFlowId) return fail("task-parent-unavailable：缺少实际父任务run/flow，未登记任务。", "缺少实际父任务run/flow，未登记任务。");
        if (!created.reviewBasisRef) {
          const parent = await prepareParentTaskRef({ projectRoot, actorRoleId: "convener", taskId: parentTaskId,
            flowId: executionFlowId, runId: executionRunId });
          if (!parent.ok) return fail(`${parent.code}：${parent.message}`, parent.message);
          created = { ...created, parentTaskRef: parent.parentTaskRef };
        }
        if (!sourceIsCurrent())
          return fail("worker-dispatch-source-changed：父任务绑定已变化，未登记任务。", "父任务绑定已变化，未登记任务。");
      }
      const appended = await this.appendTaskStateResult(projectRoot, created);
      if (!appended.ok) return fail(`任务未登记、未投递：${appended.code}：${appended.message}`, `任务未登记、未投递：${appended.message}`);
      if (appended.replay) return { ok: true, message: `任务 #${taskId} 的同一登记已存在，未重新打开会话或投递；登记重放不授权执行。` };
      if (workerDispatch) createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: fromRoleId })
        .record("worker.dispatch.parent-observed", { taskId, parentTaskId, runId: executionRunId, flowId: executionFlowId });
      // Recheck the source-selection invariant after every ledger await, before releasing this exact lease.
      if (initializationSelectionIsCurrent && !initializationSelectionIsCurrent())
        throw new Error("子任务来源在提交期间发生变化，尚未投递，请检查诊断后重试。");
      // This committed child now owns its durable source; later parent settlement/focus changes do not revoke it.
    } finally {
      if (sourceLease) {
        const ended = endGitHostAction(sourceLease);
        if (!ended.ok) throw new Error("项目状态协调未能完成，请检查诊断后重试。");
      }
    }
    this.starTaskIds.add(taskId);
    taskCreators.set(taskId, fromRoleId === this.handbackOwnerRoleId(projectRoot) ? "convener" : "chief");
    this.appendRoleActivity(projectRoot, fromRoleId, {
      kind: "task.created",
      summary: `派发任务 #${taskId} → ${targetRoleId}：${shortenSummary(task)}`,
      taskId,
      status: sideEffect,
    });
    const probes = new Map<string, string | undefined>();
    for (const readPath of extractDispatchReadPaths(task)) {
      probes.set(readPath, await filePrint(path.join(projectRoot, readPath)));
    }
    const plan = planDispatchDelivery(
      { roleId: targetRoleId, task, ...(reason !== undefined ? { reason } : {}) },
      probes,
      {
        sourceRoleId: this.roleDisplayName(projectRoot, fromRoleId),
        taskId,
        ...(expectedOutput !== undefined ? { expectedOutput } : {}),
        ...(requestedEvidence !== undefined ? { requestedEvidence } : {}),
      },
    );
    if (plan.action === "reject") {
      await this.recordTaskFailure(projectRoot, taskId, `delivery-rejected: ${shortenSummary(plan.message)}`);
      return fail(plan.message, plan.systemRow);
    }
    // 目标已有活会话 ⇒ 按其真实引擎投递（不让幕僚会话的引擎选择串到目标）。
    // 2026-10-29（BUG-5）：目标**无活会话**时先同步 open/resume；失败则拒发并给派发者回执，
    // 绝不再把任务静默留在队列里等一个可能永远不会出现的“下次时机”。
    if (workSourceRef || created.parentTaskRef || workerDispatch) {
      const assigned = await inspectAssignedTask({ projectRoot, taskId, actorRoleId: targetRoleId });
      if (!assigned.ok) return fail(`${assigned.code}：${assigned.message ?? assigned.code}`, assigned.message ?? assigned.code);
    }
    const taskBoundDispatch = workerDispatch || created.reviewBasisRef !== undefined || created.hubRouting === "chief-hub-v1";
    let deliveryRuntime = this.findLiveRuntime(projectRoot, targetRoleId) ?? runtime;
    const existingWorker = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, deliveryRuntime));
    if (!existingWorker || taskBoundDispatch && !existingWorker.busy && existingWorker.origins.running === undefined) {
      const opened = await this.openInternal({ projectRoot, roleId: targetRoleId, runtime: deliveryRuntime,
        ...(taskBoundDispatch ? { taskId } : {}) }, false);
      if (!opened.ok) {
        await this.recordTaskFailure(projectRoot, taskId, `delivery-target-open-failed: ${shortenSummary(opened.error ?? mainT("shared.common.unknownReason"))}`);
        return fail(
          mainT("main.session.dispatchTargetOpenFailed", {
            target: this.roleDisplayName(projectRoot, targetRoleId),
            detail: opened.error ?? mainT("shared.common.unknownReason"),
          }),
          "派发未投递：目标会话无法打开（未入队；已如实回执）。",
        );
      }
      deliveryRuntime = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, deliveryRuntime))?.runtime ?? deliveryRuntime;
    }
    if (workSourceRef || created.parentTaskRef || workerDispatch) {
      const assigned = await inspectAssignedTask({ projectRoot, taskId, actorRoleId: targetRoleId });
      if (!assigned.ok || workSourceRef && (assigned.value.workSourceRef?.sourceId !== workSourceRef.sourceId ||
          assigned.value.workSourceRef.sha256 !== workSourceRef.sha256)) {
        const code = assigned.ok ? "assigned-child-work-source-mismatch" : assigned.code;
        const detail = assigned.ok ? `expectedSourceId=${workSourceRef?.sourceId} actualSourceId=${assigned.value.workSourceRef?.sourceId ?? "missing"} expectedSha256=${workSourceRef?.sha256} actualSha256=${assigned.value.workSourceRef?.sha256 ?? "missing"}` : assigned.message ?? assigned.code;
        createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: fromRoleId }).record("dispatch.child.before-enqueue-rejected", { taskId, errorCode: code, errorMessage: detail });
        await this.recordTaskFailure(projectRoot, taskId, `assigned-child-unavailable-before-enqueue:${code}:${detail}`);
        return fail(`assigned-child-unavailable-before-enqueue code=${code}：${detail}。子任务尚未投递。`, "子任务当前来源或授权已失效，尚未投递。");
      }
    }
    // The committed child's durable work source survives its parent turn settling and UI focus changes.
    // Actual child cancellation, root/basis and execution authorization are rechecked by Pipeline/Service.
    const deliveryDedupKey = `${projectRoot}\u0000${deliveryRuntime}\u0000task\u0000${taskId}`;
    this.activeDispatchKeys.add(deliveryDedupKey);
    this.enqueueDelivery(projectRoot, targetRoleId, {
      kind: "dispatch",
      runtime: deliveryRuntime,
      targetRoleId,
      sourceRoleId: fromRoleId,
      taskId,
      text: plan.text,
      summary: `[任务] #${taskId} → ${this.roleDisplayName(projectRoot, targetRoleId)}：${shortenText(task, 40)}`,
      dedupKey: deliveryDedupKey,
      clientMessageId: this.appDispatchClientMessageId(deliveryDedupKey),
    });
    // 幕僚 pane 的任务卡系统行（固定字段；受理 ≠ 完成）。
    const card = taskCardOf(state.records.get(taskId) ?? { taskId, created, reports: [], redispatches: [] });
    if (card !== undefined) {
      this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, renderTaskCardLines(card).join("；"));
    }
    void this.drainQueue(projectRoot, targetRoleId, deliveryRuntime);
    const openNote = this.sessions.get(this.sessionKey(projectRoot, targetRoleId, deliveryRuntime)) ? "" : mainT("main.session.sessionWillAutoOpen");
    const advisorySummary = this.dispatchAdvisorySummary(advisories);
    if (advisories.length > 0) {
      const diagnostic = createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: targetRoleId });
      for (const advisory of advisories) {
        diagnostic.record("tasks.dispatch.advisory", {
          sourceRoleId: fromRoleId,
          targetRoleId,
          reasonCode: advisory.code,
          phase: "dispatch",
          mode: "authorization-only",
        });
      }
      this.emitDeliveryNote(projectRoot, runtime, fromRoleId, fromRoleId, `状态提示（未阻断）：${advisorySummary}`);
    }
    return {
      ok: true,
      message:
        mainT("main.session.acceptedTask", {
          to: this.roleDisplayName(projectRoot, targetRoleId),
          openNote,
          from: this.roleDisplayName(projectRoot, fromRoleId),
        }) +
        `任务编号：#${taskId}（sideEffect=${sideEffect}；受理 ≠ 完成）。` +
        (advisories.length > 0 ? `状态提示（未阻断）：${advisorySummary}` : ""),
    };
  }
}
