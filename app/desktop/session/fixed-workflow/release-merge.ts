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
import { isRuntimeKind } from "../../runtime-config.ts";
import type { DurableEvidenceRef, DurableProjection, DurableReleaseRequest, DurableReleaseSnapshot } from "../../../../src/model/durable-workflow.ts";
import type { FixedReleaseTriggerStage } from "../../workflow.ts";
import { buildMergeMainCardRequest, durableDecisionProvenance, mergeMainCardRequestId, toMergeMainCardDecision } from "../../customer-input.ts";
import { createDesktopReleaseGitPort, mergeDurableMain, previewDurableMerge, verifyDurableMerge } from "../git-ports.ts";
import { durableHash } from "../../durable-workflow.ts";
import { emitDeliveryNote } from "../shared/notifier.ts";
import { chiefTaskRoleIdOf, handbackOwnerRoleId } from "../shared/roles.ts";
import type { FixedWorkflowPorts, FixedWorkflowRefs } from "./route.ts";

/** fixed 发布合并前导/结算与自动呈卡（原 SessionManager 5 方法的同签名实现）。 */
export class FixedWorkflowRelease {
  private readonly durableCards = new Map<string, { requestId: string; controller: AbortController }>();
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

  closeDurablePresentation(projectRoot: string): void {
    this.durableCards.get(projectRoot)?.controller.abort();
    this.durableCards.delete(projectRoot);
  }

  async syncDurableRelease(projection: DurableProjection): Promise<void> {
    if ((projection.action !== "b4-customer-merge-main" && projection.action !== "customer-publish") || projection.engine !== "healthy"
      || !projection.baseline || !projection.implementation || !(projection.scope || projection.writeSets?.length)) return;
    const durable = this.deps.durableWorkflow;
    const registration = this.deps.getRegisteredProjectLifecycle?.(projection.projectRoot);
    if (!durable || !registration) return;
    const isRegistered = () => this.deps.getRegisteredProjectLifecycle?.(projection.projectRoot)?.selectionId === registration.selectionId;
    const store = await durable.store();
    const { ref, projectRoot, stepId, attempt, release } = projection;
    const definitionFile = projection.schema === 2 && projection.definitionSource === "project" ? projection.definitionFile : undefined;
    const address = { stepId, attempt };
    const writePaths = projection.scope?.writeSets.flatMap(set => set.paths)
      ?? release?.snapshot.files.filter(file => this.inDurableWriteSet(projection, file)) ?? [];
    const tried = store.listEffects(ref, "release-merge").find(effect =>
      effect.intent.requestId === release?.requestId && effect.state !== "not-started");
    if (release && tried) {
      this.closeDurablePresentation(projectRoot);
      let mainOid = tried.state === "succeeded" ? tried.result?.result?.mainOid : undefined;
      if (typeof mainOid !== "string") {
        const result = await verifyDurableMerge({ projectRoot, workflowId: ref.instanceId, requestId: release.requestId,
          snapshot: release.snapshot, writePaths, definitionFile });
        if (!result.ok) {
          store.block(ref, "workflow-merge-reconciliation-required", tried.result?.evidence ?? result.message);
          return;
        }
        const receipt = await store.settleEffect(ref, {
          key: tried.intent.key, token: tried.token, outcome: "succeeded",
          evidence: "Exact approved merge parents, operation marker, clean worktree and actual scoped diff.",
          result: result.value,
        });
        if (!receipt.ok) {
          store.block(ref, receipt.code, receipt.message);
          return;
        }
        mainOid = result.value.mainOid;
      }
      const saved = await store.submit(ref, { ...address, kind: "release-merged", source: "host", key: `release-result:${release.requestId}`,
        requestId: release.requestId, effectKey: tried.intent.key, mainOid, closed: true }).catch(error => {
        createDiagnosticLogger({ component: "desktop.durable-workflow", projectRoot }).error("workflow.release-result.failed", error);
        return { ok: false as const, code: "release-result-write-failed", message: "The verified Git merge could not be recorded." };
      });
      if (!saved.ok) store.block(ref, saved.code, saved.message);
      else if (saved.value.state === "ignored") {
        store.block(ref, "release-result-ignored", saved.value.reason ?? "The verified Git merge was not accepted by the current workflow.");
      }
      return;
    }
    if (release?.decision?.action === "reject") {
      this.closeDurablePresentation(projectRoot);
      return;
    }
    const preview = await this.durablePreview(projection);
    if (!preview.ok) {
      this.closeDurablePresentation(projectRoot);
      store.block(ref, preview.code, preview.message);
      return;
    }
    const { snapshot, diffStat } = preview;
    if (!release || !this.sameDurableSnapshot(snapshot, release.snapshot)) {
      this.closeDurablePresentation(projectRoot);
      const saved = await store.submit(ref, { ...address, kind: "release-preview", source: "host",
        key: `release-preview:${release?.generation ?? 0}:${durableHash(JSON.stringify(snapshot))}`, snapshot });
      if (!saved.ok) store.block(ref, saved.code, saved.message);
      return;
    }
    if (!release.decision) {
      this.presentDurableCard(projection, release, diffStat);
      return;
    }
    this.closeDurablePresentation(projectRoot);
    const effectKey = `release-merge:${release.requestId}`;
    let token: string | undefined;
    const merged = await mergeDurableMain({
      projectRoot, workflowId: ref.instanceId, flowId: projection.flowId ?? projection.scope?.dispatch?.flowId ?? ref.definitionId,
      release, definitionFile,
      claim: async () => {
        const fresh = await this.durablePreview(projection);
        if (!fresh.ok) return fresh;
        if (!isRegistered() || !this.sameDurableSnapshot(fresh.snapshot, snapshot)) {
          return { ok: false, code: "release-preview-drift", message: "The approved release preview has changed." };
        }
        if (projection.evidenceAuditEnabled || projection.scope?.evidenceRequirements?.length) {
          const verified = await store.verifyEvidenceAuditRelease(ref);
          if (!verified.ok) return verified;
          if (!isRegistered()) return { ok: false, code: "release-preview-drift", message: "The project selection changed during evidence verification." };
        }
        const claim = await store.claimEffect(ref, { ...address, key: effectKey, kind: "release-merge",
          requestId: release.requestId, snapshotDigest: release.digest,
          expected: { mainOid: snapshot.mainOid, tipOid: snapshot.tipOid, branch: snapshot.branch, files: snapshot.files } });
        if (!claim.ok) return claim;
        if (!claim.value.execute) return { ok: false, code: "workflow-release-in-progress", message: "The existing merge must be reconciled." };
        token = claim.value.token;
        return { ok: true };
      },
    });
    if (!merged.ok) {
      if (token) await store.settleEffect(ref, { key: effectKey, token, outcome: "unknown", evidence: merged.message });
      store.block(ref, merged.code, merged.message);
    }
    // The same verification path handles normal completion and a crash before writing the Git receipt.
  }

  private inDurableWriteSet(view: DurableProjection, file: string): boolean {
    const paths = (view.scope?.writeSets ?? view.writeSets ?? []).flatMap(set => set.paths);
    return paths.some(scope => file === scope || (!view.scope && scope.endsWith("/") && file.startsWith(scope)));
  }

  private async durablePreview(projection: DurableProjection): Promise<
    { ok: true; snapshot: DurableReleaseSnapshot; diffStat: string } | WorkflowServiceFailure
  > {
    const { projectRoot, baseline, implementation, ref } = projection;
    if (!baseline || !implementation) return { ok: false, code: "release-workflow-not-ready", message: "Release prerequisites are missing." };
    const store = await this.deps.durableWorkflow!.store();
    const latest = store.listEffects(ref, "task-commit").filter(effect =>
      effect.state === "succeeded" && effect.intent.task?.taskId === implementation.task.taskId).at(-1);
    const expectedTip = latest?.result?.result?.oid;
    const report = store.getEvidence(ref, implementation.operatorReport) as { artifacts?: DurableEvidenceRef[] } | undefined;
    if (typeof expectedTip !== "string" || !report) {
      return { ok: false, code: "release-evidence-missing", message: "The actual implementation commit and operator report must be available." };
    }
    const preview = await previewDurableMerge({ projectRoot, branch: baseline.branch, baselineOid: baseline.oid,
      definitionFile: projection.schema === 2 && projection.definitionSource === "project" ? projection.definitionFile : undefined });
    if (!preview.ok) return preview;
    const { tipOid, mainOid, diffDigest, files, diffStat } = preview.value;
    if (tipOid !== expectedTip || files.length === 0 || files.some(file => !this.inDurableWriteSet(projection, file))) {
      return { ok: false, code: "release-preview-drift", message: "The actual task tip or release files do not match the accepted implementation." };
    }
    const operatorReportArtifacts: DurableEvidenceRef[] = [];
    for (const original of report.artifacts ?? []) {
      const current = await store.readEvidence(projectRoot, original.path);
      if (!current.ok) return current;
      if (current.value.sha256 !== original.sha256) return { ok: false, code: "release-evidence-drift", message: "An accepted implementation artifact has changed." };
      operatorReportArtifacts.push(current.value);
    }
    let acceptanceArchive: DurableEvidenceRef | undefined;
    if (projection.action === "customer-publish") {
      const archived = store.listCapabilityEvents(ref).findLast(row => row.receipt.state === "consumed"
        && row.event.input.kind === "archive-verified" && row.event.input.tipOid === tipOid)?.event.input;
      if (archived?.kind !== "archive-verified") {
        return { ok: false, code: "release-archive-missing", message: "The accepted candidate requires an independent archive." };
      }
      for (const reference of [archived.criteria, archived.report, archived.archive]) {
        const actual = await store.readEvidence(projectRoot, reference.path);
        if (!actual.ok || actual.value.sha256 !== reference.sha256) {
          return { ok: false, code: "release-archive-drift", message: "Independent acceptance evidence has changed." };
        }
      }
      acceptanceArchive = archived.archive;
    }
    return { ok: true, snapshot: { mainOid, branch: baseline.branch, tipOid, baselineOid: baseline.oid,
      files, diffDigest, b3CloseKey: implementation.key, operatorReport: implementation.operatorReport,
      ...(operatorReportArtifacts.length ? { operatorReportArtifacts } : {}),
      ...(acceptanceArchive ? { acceptanceArchive } : {}) }, diffStat };
  }

  private sameDurableSnapshot(a: DurableReleaseSnapshot, b: DurableReleaseSnapshot): boolean {
    return a.mainOid === b.mainOid && a.branch === b.branch && a.tipOid === b.tipOid && a.baselineOid === b.baselineOid
      && a.diffDigest === b.diffDigest && a.b3CloseKey === b.b3CloseKey && a.operatorReport.sha256 === b.operatorReport.sha256
      && a.operatorReport.path === b.operatorReport.path && JSON.stringify(a.files) === JSON.stringify(b.files)
      && JSON.stringify(a.operatorReportArtifacts ?? []) === JSON.stringify(b.operatorReportArtifacts ?? [])
      && a.acceptanceArchive?.path === b.acceptanceArchive?.path && a.acceptanceArchive?.sha256 === b.acceptanceArchive?.sha256;
  }

  private presentDurableCard(projection: DurableProjection, release: DurableReleaseRequest, diffStat: string): void {
    if (!this.deps.customerInput || this.durableCards.get(projection.projectRoot)?.requestId === release.requestId) return;
    const { projectRoot, ref, stepId, attempt } = projection;
    const registration = this.deps.getRegisteredProjectLifecycle?.(projectRoot);
    if (!registration) return;
    this.closeDurablePresentation(projectRoot);
    const controller = new AbortController();
    this.durableCards.set(projectRoot, { requestId: release.requestId, controller });
    const selectedProject = () => this.deps.getRegisteredProjectLifecycle?.(projectRoot)?.selectionId === registration.selectionId;
    const active = () => !controller.signal.aborted && selectedProject() && this.durableCards.get(projectRoot)?.controller === controller;
    const { snapshot } = release;
    const request = buildMergeMainCardRequest({
      workflowId: ref.instanceId, flowId: projection.flowId ?? projection.scope?.dispatch?.flowId ?? ref.definitionId, releaseId: release.releaseId,
      mainBaseOid: snapshot.mainOid, branchTipOid: snapshot.tipOid, branchBaseOid: snapshot.baselineOid,
      nonMainBaseline: snapshot.baselineOid !== snapshot.mainOid, fileCount: snapshot.files.length,
      diffStat, mergeKind: "merge", highRiskNotes: ["仅本地合并。请核对正式报告中未在运行期验证的内容。"],
    });
    request.question = "是否由应用将已验收的当前候选合并到本地 main？";
    const roleId = this.chiefTaskRoleIdOf(projectRoot) ?? "chief";
    const runtime = projection.metadata.runtime;
    const durable = this.deps.durableWorkflow!;
    const readCurrent = async () => {
      if (!active()) return undefined;
      const current = await durable.lookup(ref);
      if (!active() || !current || current.status !== "waiting" || current.stepId !== stepId || current.attempt !== attempt
        || current.release?.requestId !== release.requestId || current.release.digest !== release.digest
        || current.release.generation !== release.generation || current.release.decision) return undefined;
      const preview = await this.durablePreview(current);
      return active() && preview.ok && this.sameDurableSnapshot(preview.snapshot, snapshot) ? current : undefined;
    };
    const execute = this.port.durableDecisionExecutor(projectRoot, runtime);
    const result = this.deps.customerInput(request, {
      projectRoot, roleId, ...(isRuntimeKind(runtime) ? { runtime } : {}), requestId: release.requestId, sessionSignal: controller.signal,
      governanceModel: "trio",
      durableDecision: { cardKind: "merge-main", generation: release.generation, host: execute && {
        execute,
        prepare: async () => {
          const current = await readCurrent();
          if (!current) throw new Error("The accepted release candidate, baseline, or evidence changed.");
          const store = await durable.store();
          const report = store.getEvidence(ref, snapshot.operatorReport) as { handback?: { summary?: string } } | undefined;
          const archived = current.action === "customer-publish" ? store.listCapabilityEvents(ref).findLast(row => row.receipt.state === "consumed"
            && row.event.input.kind === "archive-verified" && row.event.input.tipOid === snapshot.tipOid)?.event.input : undefined;
          if (!active() || !report || current.action === "customer-publish" && archived?.kind !== "archive-verified") {
            throw new Error("Accepted implementation or independent acceptance materials are unavailable.");
          }
          const artifacts = [snapshot.operatorReport, ...(snapshot.operatorReportArtifacts ?? []),
            ...(archived?.kind === "archive-verified" ? [archived.criteria, archived.report, archived.archive] : [])];
          return { baseDigest: release.digest, isCurrent: async () => !!await readCurrent(),
            context: JSON.stringify({ projectRoot, stage: current.action, snapshot, diffStat,
              acceptedReport: report.handback?.summary?.slice(0, 8_000), independentArchive: archived }),
            evidenceRefs: artifacts.map(artifact => ({ ...artifact, snapshotId: release.digest })) };
        },
      } },
      persistReleaseDecision: async (action, delegated, isMainFrameCurrent) => {
        const hasAuthority = () => selectedProject() && (delegated ? delegated.isCurrent() : isMainFrameCurrent?.() === true);
        if (!hasAuthority()) return { ok: false, message: "The release requires a decision in the current project window.", stale: true };
        const store = await durable.store();
        const current = await durable.lookup(ref);
        const decisionKey = `release-decision:${release.requestId}`;
        if (!hasAuthority() || current?.release?.requestId !== release.requestId) {
          return { ok: false, message: "The release card is no longer current.", stale: true };
        }
        if (current.release.decision) {
          return current.release.decision.action === action
            ? { ok: true, decisionId: current.release.decision.id }
            : { ok: false, message: "The opposite decision was already recorded." };
        }
        if (!await readCurrent()) {
          return { ok: false, message: "The release preview has changed. Wait for the updated card.", stale: true };
        }
        const saved = await store.decideRelease(ref, { stepId, attempt,
          key: decisionKey, requestId: release.requestId, digest: release.digest, generation: release.generation, action,
          provenance: durableDecisionProvenance(release.generation, delegated) }, () => active() && hasAuthority());
        if (!saved.ok || saved.value.state === "ignored") {
          return { ok: false, message: saved.ok ? "This release decision has expired." : saved.message,
            stale: saved.ok || saved.code === "release-decision-stale" };
        }
        return { ok: true, decisionId: saved.value.release?.decision?.id ?? decisionKey };
      },
    });
    void Promise.resolve(result).catch(error => {
      createDiagnosticLogger({ component: "desktop.durable-workflow", projectRoot }).error("workflow.release-card.failed", error);
    }).finally(() => {
      if (this.durableCards.get(projectRoot)?.controller === controller) this.durableCards.delete(projectRoot);
    });
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
    if (await this.deps.durableWorkflow?.owns(input.projectRoot)) {
      return { ok: false, code: "workflow-owner-conflict", message: "The durable workflow owns this repository's release." };
    }
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
