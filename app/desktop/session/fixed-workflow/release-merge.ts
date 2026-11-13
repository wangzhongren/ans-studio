// app/desktop/session/fixed-workflow/release-merge.ts
// B6（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §5 B6、附录 A fixed-workflow 组）：merge-main 卡/发布合并/自动呈卡（L5，feature 白名单
// card-gateway/evidence/run-change/git-ports）。
// 5 个类方法（presentMergeMainCard/runFixedReleaseMerge/settleMergeMainCard/autoPresentFixedReleaseMerge/
// noteFixedReleaseAutoTrigger）自 app/desktop/session.ts **逐字搬移**（含 JSDoc）：方法体零改动；类外壳
// 重建原 receiver 面——
//  · 客户卡经 `CardGateway` 端口（refs.cardGateway → cards 模块实例；fixed 不导入 cards/**）；
//  · 自动呈卡证据经 Evidence 实例（refs.evidence，白名单 L1）；
//  · 发布 Git 端口经 `git-ports.ts`（L1；不直接导入 workflow-git）；
//  · 跨簇状态 lastGovernanceRuntime 经共享 `FixedWorkflowRefs` 显式传入（同一实例）；
//  · 尚未迁出的门面方法（findLiveRuntime）经 `FixedWorkflowPorts` 箭头回调注入；
//  · 已迁出的 shared 方法经同名同义委托 → shared/*。
// **客户本人唯一授权语义逐字保留**：approve ⇒ executeReleaseMerge；judge 只能转人工/拒绝/超时；
// 无通道/无效裁决 ⇒ 保持等待（fail-closed）。
// 可见性 private → 模块内 public 仅为门面委托可调用（`runFixedReleaseMerge` 保持 public）。

import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import { readTaskState } from "../../../../src/common/编排/task-state.ts";
import {
  executeReleaseMerge,
  prepareReleaseMerge,
  readWorkflowLedger,
  rejectReleaseMerge,
  type ReleaseMergePreview,
  type WorkflowServiceFailure,
} from "../../../../src/common/编排/workflow-service.ts";
import { deriveWorkflowView } from "../../../../src/common/编排/workflow-state.ts";
import type { CustomerInputOutcome } from "../../../../src/model/runtime.ts";
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import type { FixedReleaseTriggerStage } from "../../workflow.ts";
import { buildMergeMainCardRequest, mergeMainCardRequestId, toMergeMainCardDecision } from "../../customer-input.ts";
import { createDesktopReleaseGitPort } from "../git-ports.ts";
import { emitDeliveryNote } from "../shared/notifier.ts";
import { chiefTaskRoleIdOf, handbackOwnerRoleId } from "../shared/roles.ts";
import type { FixedWorkflowPorts, FixedWorkflowRefs } from "./route.ts";

/** fixed 发布合并前导/结算与自动呈卡（原 SessionManager 5 方法的同签名实现）。 */
export class FixedWorkflowRelease {
  private readonly refs: FixedWorkflowRefs;
  private readonly port: FixedWorkflowPorts;
  private readonly deps: import("../contracts/deps.ts").SessionManagerDeps;
  constructor(refs: FixedWorkflowRefs, port: FixedWorkflowPorts, deps: import("../contracts/deps.ts").SessionManagerDeps) {
    this.refs = refs;
    this.port = port;
    this.deps = deps;
  }

  /* 跨模块状态（同一实例；延迟取值）。 */
  private get lastGovernanceRuntime(): ReadonlyMap<string, RuntimeKind> { return this.refs.lastGovernanceRuntime; }

  /* L0 共享函数（同名同义委托；与门面委托同一实现、同一入参）。 */
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }
  private handbackOwnerRoleId(projectRoot: string): string | null { return handbackOwnerRoleId(projectRoot, this.deps); }
  private chiefTaskRoleIdOf(projectRoot: string): string | null { return chiefTaskRoleIdOf(projectRoot, this.deps); }

  /* 已迁出模块实例（白名单下层；运行时同一对象）。 */
  private presentAppCard(input: Parameters<FixedWorkflowRefs["cardGateway"]["presentAppCard"]>[0]): ReturnType<FixedWorkflowRefs["cardGateway"]["presentAppCard"]> {
    return this.refs.cardGateway.presentAppCard(input);
  }
  private fixedReleaseAutoEvidence(
    projectRoot: string,
    workflowId: string,
    stage: Parameters<FixedWorkflowRefs["evidence"]["fixedReleaseAutoEvidence"]>[2],
    taskId: string,
  ): ReturnType<FixedWorkflowRefs["evidence"]["fixedReleaseAutoEvidence"]> {
    return this.refs.evidence.fixedReleaseAutoEvidence(projectRoot, workflowId, stage, taskId);
  }

  /* 尚未迁出的门面方法端口（运行期调用；参数逐位原样转发、返回原样返回）。 */
  private findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined {
    return this.port.findLiveRuntime(projectRoot, roleId);
  }

  // —— presentMergeMainCard（B6 自 session.ts 逐字搬移）——
  async presentMergeMainCard(input: {
    projectRoot: string;
    preview: ReleaseMergePreview;
    signal?: AbortSignal;
  }): Promise<CustomerInputOutcome | undefined> {
    const request = buildMergeMainCardRequest({
      workflowId: input.preview.workflowId,
      flowId: input.preview.flowId,
      releaseId: input.preview.releaseId,
      mainBaseOid: input.preview.mainBaseOid !== null ? input.preview.mainBaseOid.hex : null,
      branchTipOid: input.preview.branchTipOid.hex,
      branchBaseOid: input.preview.branchBaseOid,
      nonMainBaseline: input.preview.nonMainBaseline,
      fileCount: input.preview.fileCount,
      diffStat: input.preview.diffStat,
      mergeKind: input.preview.mergeKind,
      highRiskNotes: input.preview.highRiskNotes,
    });
    return this.presentAppCard({
      projectRoot: input.projectRoot,
      request,
      requestId: mergeMainCardRequestId(input.preview.releaseId),
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
  }
  // —— runFixedReleaseMerge（B6 自 session.ts 逐字搬移）——
  /**
   * 固定路径发布合并的**应用入口**（A13/B4；MF-IR-8：不新增 `requestReleaseMerge` 工具）：
   * 1. `prepareReleaseMerge`（前置/漂移/preview；不满足 ⇒ `release-workflow-not-ready`，不发卡）；
   * 2. 应用构造并呈现 `merge-main` 非判断卡（客户本人）；
   * 3. 客户本人 approve ⇒ `executeReleaseMerge`（fixed argv、只本地、不 push/tag）；
   *     客户拒绝 ⇒ `release.rejected`（by customer）；judge 转人工/拒绝或超时（应用中止）⇒ `release.rejected`
   *     （by judge；judge 不可 approve/冒充客户）；无通道/无效裁决 ⇒ 保持等待、不合并（fail-closed）。
   *
   * B3.1 起「A12b/B3 accepted ⇒ 自动呈卡」复用本入口的呈现/结算段（`settleMergeMainCard`）：唯一差异是
   * 自动触发先做触发窗口/幂等守卫；发布前置仍由 `prepareReleaseMerge` 单点判定。
   */
  async runFixedReleaseMerge(input: {
    projectRoot: string;
    workflowId: string;
    operationId: string;
    summary: string;
    evidence: readonly { path: string; sha256: string }[];
    signal?: AbortSignal;
  }): Promise<{
    ok: boolean;
    code?: string;
    message: string;
    releaseId?: string;
    merged?: boolean;
    mergeOid?: string;
  }> {
    const port = createDesktopReleaseGitPort();
    const prepared = await prepareReleaseMerge({
      projectRoot: input.projectRoot,
      workflowId: input.workflowId,
      operationId: input.operationId,
      summary: input.summary,
      evidence: input.evidence,
      port,
    });
    if (!prepared.ok) return { ok: false, code: prepared.code, message: prepared.message };
    return this.settleMergeMainCard({
      projectRoot: input.projectRoot,
      workflowId: input.workflowId,
      preview: prepared.preview,
      port,
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
  }
  // —— settleMergeMainCard（B6 自 session.ts 逐字搬移）——
  /**
   * merge-main 卡的呈现 + 裁决结算（应用自有通道；**客户本人唯一授权**）：
   * approve ⇒ `executeReleaseMerge`；reject ⇒ `release.rejected by customer`；
   * judge 转人工/拒绝/超时 ⇒ `release.rejected by judge`（绝不写成客户确认）；无效裁决/无通道 ⇒ 保持等待。
   * 不含 `prepareReleaseMerge`（调用方负责前置与幂等）；release 终态只由本方法落账。
   */
  async settleMergeMainCard(input: {
    projectRoot: string;
    workflowId: string;
    preview: ReleaseMergePreview;
    port: ReturnType<typeof createDesktopReleaseGitPort>;
    signal?: AbortSignal;
  }): Promise<{
    ok: boolean;
    code?: string;
    message: string;
    releaseId?: string;
    merged?: boolean;
    mergeOid?: string;
  }> {
    const releaseId = input.preview.releaseId;
    const presented = await this.presentMergeMainCard({
      projectRoot: input.projectRoot,
      preview: input.preview,
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
    if (presented === undefined) {
      return {
        ok: false,
        code: "release-card-unavailable",
        message: "客户卡通道不可用（merge-main 未呈现）；保持等待、不合并（不默认通过）。",
        releaseId,
      };
    }
    const decision = toMergeMainCardDecision(presented);
    if (decision.kind === "approve") {
      const executed = await executeReleaseMerge({
        projectRoot: input.projectRoot,
        workflowId: input.workflowId,
        releaseId,
        confirmation: { by: "customer", ...(decision.decisionId !== undefined ? { decisionId: decision.decisionId } : {}) },
        port: input.port,
      });
      if (!executed.ok) return { ok: false, code: executed.code, message: executed.message, releaseId };
      return {
        ok: true,
        message: `已合并 main（${executed.mergeKind}；mergeOid ${executed.mergeOid.hex}）；工作区停在 main；不 push/tag。`,
        releaseId,
        merged: true,
        mergeOid: executed.mergeOid.hex,
      };
    }
    if (decision.kind === "reject") {
      const rejected = await rejectReleaseMerge({
        projectRoot: input.projectRoot,
        workflowId: input.workflowId,
        releaseId,
        by: "customer",
        ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
      });
      return {
        ok: false,
        code: rejected.ok ? "release-rejected" : rejected.code,
        message: rejected.ok ? `客户拒绝合并（release.rejected；${rejected.replay ? "replay" : "已记账"}）。` : rejected.message,
        releaseId,
      };
    }
    if (decision.kind === "judge-reject" || decision.kind === "timeout") {
      // judge 只能转人工/拒绝；超时（应用中止/窗口关闭）按非客户关闭记 release.rejected（by judge），
      // 绝不写成客户确认（release.confirmed.by 恒为 customer，由服务双检）。
      const rejected = await rejectReleaseMerge({
        projectRoot: input.projectRoot,
        workflowId: input.workflowId,
        releaseId,
        by: "judge",
        reason: decision.kind === "timeout" ? "timeout：客户未完成确认（转人工/未合并）" : decision.reason ?? "judge 转人工/拒绝",
      });
      return {
        ok: false,
        code: rejected.ok ? "release-rejected" : rejected.code,
        message: rejected.ok ? "合并未获客户本人确认（release.rejected；不合并）。" : rejected.message,
        releaseId,
      };
    }
    return {
      ok: false,
      code: "release-unauthorized",
      message: `merge-main 裁决无效（${decision.reason ?? "fail-closed"}）；保持等待、不合并、不默认通过。`,
      releaseId,
    };
  }
  // —— autoPresentFixedReleaseMerge（B6 自 session.ts 逐字搬移）——
  /**
   * T3 B3.1（AC-11/AC-14/AC-22；MF-IR-8）：fixed **A12b/B3 accepted 后自动呈 merge-main 卡**。
   *
   * - 触发窗口：A12b completed 且 A13 未完成（路径 A）/ B3 completed 且 B4 未完成（路径 B）；
   * - 证据由应用构造（不采信模型自报）：A12b ⇒ 应用验收归档 path+sha256；B3 ⇒ 该任务 done 报告证据
   *   的真实文件（逐路径重算字节 SHA-256）；
   * - `prepareReleaseMerge` 判定全部发布前置；不满足 ⇒ **不呈卡**，如实回运营/幕僚
   *   （`release-workflow-not-ready` 等），不弹注定失败卡；
   * - 幂等：同一 workflow/tip（`releaseId` 确定性派生）已呈过卡 ⇒ 不重复弹卡；已合并/已关闭 ⇒ no-op；
   * - 客户卡经应用自有通道（客户本人）；approve ⇒ `executeReleaseMerge`；judge 只能转人工/拒绝。
   */
  async autoPresentFixedReleaseMerge(input: {
    projectRoot: string;
    workflowId: string;
    stage: FixedReleaseTriggerStage;
    taskId: string;
  }): Promise<{
    status: "skipped" | "not-ready" | "already-merged" | "channel-unavailable" | "presented";
    code?: string;
    message: string;
    releaseId?: string;
    merged?: boolean;
  }> {
    const { projectRoot, workflowId, stage } = input;
    const port = createDesktopReleaseGitPort();
    try {
      const ledger = await readWorkflowLedger(projectRoot);
      const wfEvents = ledger.events.filter((event) => event.workflowId === workflowId);
      if (wfEvents.length === 0) {
        return { status: "skipped", message: `workflow ${workflowId} 不存在（不呈卡）。` };
      }
      const view = deriveWorkflowView(wfEvents, (await readTaskState(projectRoot)).events);
      const expectedPath = stage === "A12b" ? "A" : "B";
      const triggerCompleted = stage === "A12b"
        ? view.stages.A12b.status === "completed"
        : view.stages.B3.status === "completed";
      const releaseCompleted = stage === "A12b"
        ? view.stages.A13.status === "completed"
        : view.stages.B4.status === "completed";
      if (view.path !== expectedPath || view.closed !== undefined || view.stopping === true
        || !triggerCompleted || releaseCompleted) {
        return { status: "skipped", message: `workflow ${workflowId} 不在 ${stage} accepted 后的发布窗口（不呈卡）。` };
      }
      // 应用证据（A12b 归档 / B3 报告真实文件）；缺失 ⇒ 不呈卡、回运营/幕僚。
      const evidence = await this.fixedReleaseAutoEvidence(projectRoot, workflowId, stage, input.taskId);
      if (!evidence.ok) {
        this.noteFixedReleaseAutoTrigger(projectRoot, workflowId, `merge-main 未呈卡（${evidence.code}）：${evidence.message}`);
        return { status: "not-ready", code: evidence.code, message: evidence.message };
      }
      // `prepareReleaseMerge`：前置/漂移/preview + `release.requested`（同 tip 重放幂等）。
      const prepared = await prepareReleaseMerge({
        projectRoot,
        workflowId,
        operationId: `auto-release:${workflowId}:${stage}`,
        summary: `fixed ${stage} 任务已 accepted：应用自动呈 merge-main 发布确认（workflow ${workflowId}）。`,
        evidence: evidence.evidence,
        port,
      });
      if (!prepared.ok) {
        if (prepared.code === "release-already-merged" || prepared.code === "workflow-closed") {
          return { status: "already-merged", code: prepared.code, message: prepared.message };
        }
        // 前置缺失/漂移：如实回运营/幕僚，不弹注定失败卡。
        this.noteFixedReleaseAutoTrigger(projectRoot, workflowId, `merge-main 未呈卡（${prepared.code}）：${prepared.message}`);
        return { status: "not-ready", code: prepared.code, message: prepared.message };
      }
      // 幂等（同一 workflow/tip 不重复卡）：requestId 由 releaseId 确定性派生；已有任何 request 事件 ⇒ 不再弹。
      const requestId = mergeMainCardRequestId(prepared.releaseId);
      const latest = await readTaskState(projectRoot);
      const already = latest.events.some((event) =>
        (event.kind === "request.created" || event.kind === "request.presented"
          || event.kind === "request.resolved" || event.kind === "request.orphaned")
        && event.requestId === requestId);
      if (already) {
        return {
          status: "skipped",
          message: `同一 workflow/tip 的 merge-main 卡已呈过（${requestId}）；不重复。`,
          releaseId: prepared.releaseId,
        };
      }
      const settled = await this.settleMergeMainCard({
        projectRoot,
        workflowId,
        preview: prepared.preview,
        port,
      });
      if (settled.code === "release-card-unavailable") {
        this.noteFixedReleaseAutoTrigger(projectRoot, workflowId, settled.message);
        return { status: "channel-unavailable", code: settled.code, message: settled.message, releaseId: prepared.releaseId };
      }
      return {
        status: "presented",
        ...(settled.code !== undefined ? { code: settled.code } : {}),
        message: settled.message,
        releaseId: prepared.releaseId,
        ...(settled.merged !== undefined ? { merged: settled.merged } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      createDiagnosticLogger({ component: "desktop.workflow", projectRoot }).error(
        "workflow.release.auto-present.failed",
        error,
        { workflowId, stage },
      );
      this.noteFixedReleaseAutoTrigger(projectRoot, workflowId, `merge-main 自动呈卡失败：${message}（未合并；请运营/幕僚核对）。`);
      return { status: "not-ready", code: "release-auto-present-failed", message };
    }
  }
  // —— noteFixedReleaseAutoTrigger（B6 自 session.ts 逐字搬移）——
  noteFixedReleaseAutoTrigger(projectRoot: string, workflowId: string, summary: string): void {
    const targets = new Set<string>([
      this.handbackOwnerRoleId(projectRoot) ?? "convener",
      this.chiefTaskRoleIdOf(projectRoot) ?? "chief",
    ]);
    for (const roleId of targets) {
      const runtime = this.findLiveRuntime(projectRoot, roleId) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
      this.emitDeliveryNote(projectRoot, runtime, roleId, roleId, `[工作流发布] ${workflowId}：${summary}`);
    }
  }
}
