// app/desktop/session/cards/version-decisions.ts
// B5（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §3.6 / §5 B5、附录 A cards 组）：版本决策全链与恢复（L4，模块内拆分；feature 白名单
// card-gateway / evidence）。
// 17 个类方法（versionDecisionSubjectKey/isVersionDecisionRequestIdForSubject/findPendingVersionDecision/
// pendingRequestIdsForFlow/countPriorVersionDecisions/buildVersionDecisionFacts/versionDecisionCardLabels/
// decidedByText/formatTargetVersions/stripVersionDecisionPrefix/nextVersionFlowId/
// mapVersionDecisionRawOutcome/appendVersionDecisionAudit/emitVersionDecisionResolved/
// requestVersionDecision/restoreVersionDecisions/restoreRequestState）自 app/desktop/session.ts **逐字搬移**
// （含 JSDoc）：方法体零改动；类外壳重建原 receiver 面——
//  · versionDecisionPending/versionDecisionChains 与 cards/cards.ts 的 CardsState 是**同一实例**（Cards
//    单 owner 创建；本模块经 `Cards` 引用读写，不造第二份状态）；
//  · cards 模块内同义委托：withRequestLifecycle/notifyRequest → Cards 同名方法；
//  · 已迁出的 shared 方法经同名同义委托 → shared/*；未迁出的 findLiveRuntime 经端口注入；
//  · 验收拒绝计数 countAcceptanceRejections 委托同目录 acceptance-facts（模块内拆分）。
// 可见性 private → 模块内 public 仅为门面委托可调用（不进入公开导出面）。

import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import type { RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import { shortenSummary, taskEvent, type TaskReplay } from "../../../../src/common/编排/task-state.ts";
import { buildProjectStateView, deriveActiveRunFromManifests, scanRunManifestsForState, scanVersionedDocsForFlow } from "../../../../src/common/编排/project-state.ts";
import {
  buildVersionDecisionCard,
  collectResolvedWithoutExecution,
  mapVersionDecisionAnswer,
  planVersionDecisionExecution,
  supersededCloseReason,
  validateVersionDecisionContext,
  validateVersionDecisionRequest,
  versionDecisionAttempt,
  versionDecisionCardToRequest,
  versionDecisionRequestId,
  type VersionDecisionCardLabels,
  type VersionDecisionRequestSubject,
} from "../../../../src/common/编排/version-decision.ts";
import { validateDecisionCardRequest } from "../../../../src/common/编排/decision-card.ts";
import { closeRun, ensureDraftRun, readRunManifest } from "../../../../src/common/编排/run-manifest.ts";
import { VERSION_DECISION_SCHEMA, type ProjectStateDocKind, type ProjectStateView, type VersionDecisionDecidedBy, type VersionDecisionErrorCode, type VersionDecisionFacts, type VersionDecisionRequest, type VersionDecisionResult } from "../../../../src/model/project-state.ts";
import { GOVERNANCE_SLUG_PATTERN } from "../../../../src/model/runtime.ts";
import type { CustomerInputMetadata, CustomerInputOutcome, CustomerInputRequest, TaskStateEvent, VersionDecisionEvent } from "../../../../src/model/runtime.ts";
import { directiveIdFromOperatorId } from "../../directive-input.ts";
import { mainT } from "../../i18n.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";
import type { LiveSession } from "../contracts/session-types.ts";
import { now } from "../shared/clock.ts";
import { sessionKey } from "../shared/keys.ts";
import { emitDeliveryNote } from "../shared/notifier.ts";
import { chiefTaskRoleIdOf } from "../shared/roles.ts";
import { appendTaskState, readTasks } from "../shared/tasks-store.ts";
import type { AcceptanceFacts } from "./acceptance-facts.ts";
import type { Cards } from "./cards.ts";

/** 2026-11-02（版本决策）：slug 校验（与 model/runtime.ts 单一来源一致）与系统行前缀（原 session.ts 常量）。 */
const GOVERNANCE_SLUG_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);
const VERSION_DECISION_SYSTEM_PREFIX = "[系统·版本决策] ";

/** 版本决策方法读取的跨模块只读状态面（同一实例；方案 §3.6 归属其他模块）。 */
export interface VersionDecisionRefs {
  sessions: ReadonlyMap<string, LiveSession>;
  lastGovernanceRuntime: ReadonlyMap<string, RuntimeKind>;
}

/** 尚未迁出（B5 范围外）的门面方法端口；门面以箭头回调注入，参数逐位原样转发。 */
export interface VersionDecisionPorts {
  findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined;
}

/** 版本决策全链与恢复（原 SessionManager 17 方法的同签名实现）。 */
export class VersionDecisions {
  private readonly cards: Cards;
  private readonly refs: VersionDecisionRefs;
  private readonly port: VersionDecisionPorts;
  private readonly deps: SessionManagerDeps;
  private readonly acceptance: AcceptanceFacts;
  constructor(cards: Cards, refs: VersionDecisionRefs, port: VersionDecisionPorts, deps: SessionManagerDeps, acceptance: AcceptanceFacts) {
    this.cards = cards;
    this.refs = refs;
    this.port = port;
    this.deps = deps;
    this.acceptance = acceptance;
  }

  private get sessions(): ReadonlyMap<string, LiveSession> { return this.refs.sessions; }
  private get lastGovernanceRuntime(): ReadonlyMap<string, RuntimeKind> { return this.refs.lastGovernanceRuntime; }
  private get versionDecisionPending(): Map<string, string> { return this.cards.state.versionDecisionPending; }
  private get versionDecisionChains(): Map<string, Promise<void>> { return this.cards.state.versionDecisionChains; }

  /* shared 同名同义委托（→ shared/*）。 */
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string { return sessionKey(projectRoot, roleId, runtime); }
  private now(): number { return now(this.deps); }
  private chiefTaskRoleIdOf(projectRoot: string): string | null { return chiefTaskRoleIdOf(projectRoot, this.deps); }
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }
  private async readTasks(projectRoot: string): Promise<TaskReplay> { return readTasks(projectRoot); }
  private async appendTaskState(projectRoot: string, event: TaskStateEvent): Promise<boolean> { return appendTaskState(projectRoot, event); }

  /* cards 模块内同义委托（同一实现、同一入参）。 */
  private withRequestLifecycle(
    projectRoot: string,
    sourceRoleId: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    raw: (request: CustomerInputRequest, context: Parameters<import("../../customer-input.ts").DesktopCustomerInputFn>[1], metadata?: CustomerInputMetadata) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined,
    buildContext: (request: CustomerInputRequest, extras?: { onPresented?: () => void; acceptanceReport?: import("../../customer-input.ts").AcceptanceReportDisplayV1; judgeNotice?: string }) => Parameters<import("../../customer-input.ts").DesktopCustomerInputFn>[1],
    requestIdOverride?: string,
    lifecycle?: { notify?: "default" | "resolved-only" | "none"; signal?: AbortSignal; judgeNotice?: string; onPresented?: () => void },
  ): Promise<CustomerInputOutcome | null | undefined> {
    return this.cards.withRequestLifecycle(projectRoot, sourceRoleId, request, metadata, raw, buildContext, requestIdOverride, lifecycle);
  }
  private notifyRequest(
    projectRoot: string,
    requestId: string,
    sourceRoleId: string,
    title: string,
    event: "created" | "presented" | "resolved",
    detail?: string,
    after?: Promise<unknown>,
  ): Promise<void> {
    return this.cards.notifyRequest(projectRoot, requestId, sourceRoleId, title, event, detail, after);
  }
  private countAcceptanceRejections(events: readonly TaskStateEvent[], flowId: string): number {
    return this.acceptance.countAcceptanceRejections(events, flowId);
  }

  /* 尚未迁出的门面方法端口（参数逐位原样转发）。 */
  private findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined { return this.port.findLiveRuntime(projectRoot, roleId); }
  // —— versionDecisionSubjectKey（B5 自 session.ts 逐字搬移）——
  versionDecisionSubjectKey(projectRoot: string, subject: VersionDecisionRequestSubject): string {
    return `${projectRoot}\u0000${subject.flowId}\u0000${subject.runId ?? ""}`;
  }

  // —— isVersionDecisionRequestIdForSubject（B5 自 session.ts 逐字搬移）——
  isVersionDecisionRequestIdForSubject(requestId: string, subject: VersionDecisionRequestSubject): boolean {
    const prefix = subject.runId !== undefined
      ? `version-decision-${subject.runId}-`
      : `version-decision-flow-${subject.flowId}-`;
    if (!requestId.startsWith(prefix)) return false;
    const parts = requestId.slice(prefix.length).split("-");
    return parts.length === 2 && /^[a-z0-9]+$/.test(parts[0]!) && /^[0-9a-f]{8}$/.test(parts[1]!);
  }

  // —— findPendingVersionDecision（B5 自 session.ts 逐字搬移）——
  findPendingVersionDecision(events: readonly TaskStateEvent[], flowId: string, subject: VersionDecisionRequestSubject): string | undefined {
    const resolved = new Set<string>();
    const orphaned = new Set<string>();
    for (const event of events) {
      if (event.kind === "request.resolved") resolved.add(event.requestId);
      else if (event.kind === "request.orphaned") orphaned.add(event.requestId);
    }
    for (const event of events) {
      if (event.kind !== "request.created" || event.flowId !== flowId) continue;
      if (!this.isVersionDecisionRequestIdForSubject(event.requestId, subject)) continue;
      if (resolved.has(event.requestId) || orphaned.has(event.requestId)) continue;
      return event.requestId;
    }
    return undefined;
  }

  // —— pendingRequestIdsForFlow（B5 自 session.ts 逐字搬移）——
  pendingRequestIdsForFlow(events: readonly TaskStateEvent[], flowId: string): string[] {
    const created = new Set<string>();
    const done = new Set<string>();
    for (const event of events) {
      if (event.kind === "request.created" && event.flowId === flowId) created.add(event.requestId);
      else if (event.kind === "request.resolved" || event.kind === "request.orphaned") done.add(event.requestId);
    }
    return [...created].filter((requestId) => !done.has(requestId));
  }

  // —— countPriorVersionDecisions（B5 自 session.ts 逐字搬移）——
  countPriorVersionDecisions(events: readonly TaskStateEvent[], flowId: string, runId?: string): number {
    let count = 0;
    for (const event of events) {
      if (event.kind !== "version.decision" || event.flowId !== flowId) continue;
      if (runId !== undefined && event.runId !== runId) continue;
      count += 1;
    }
    return count;
  }

  // —— buildVersionDecisionFacts（B5 自 session.ts 逐字搬移）——
  buildVersionDecisionFacts(view: ProjectStateView, events: readonly TaskStateEvent[], subject: VersionDecisionRequestSubject): VersionDecisionFacts {
    const flow = view.flows.find((candidate) => candidate.flowId === subject.flowId);
    const run = subject.runId !== undefined ? flow?.runs.find((candidate) => candidate.runId === subject.runId) : undefined;
    const versions = view.versions.filter((version) => version.flowId === subject.flowId);
    const latestDocs = versions
      .filter((version) => version.latest !== undefined)
      .map((version) => ({
        docKind: version.docKind,
        version: version.latest!.version,
        path: version.latest!.path,
        ...(version.latest!.sha256 !== undefined ? { sha256: version.latest!.sha256 } : {}),
      }));
    const pinnedDocs = versions
      .filter((version) => version.pinned !== undefined)
      .map((version) => ({
        docKind: version.docKind,
        ...(version.pinned!.version !== undefined ? { version: version.pinned!.version } : {}),
        ...(version.pinned!.path !== undefined ? { path: version.pinned!.path } : {}),
        ...(version.pinned!.sha256 !== undefined ? { sha256: version.pinned!.sha256 } : {}),
      }));
    return {
      flowId: subject.flowId,
      ...(subject.runId !== undefined ? { runId: subject.runId } : {}),
      runState: run?.state === "draft" ? "draft" : run?.state === "pinned" ? "pinned" : "legacy",
      ...(run?.stage !== undefined ? { stage: run.stage } : {}),
      unclosedCount: flow?.taskCounts.unclosed ?? 0,
      blockedCount: flow?.taskCounts.blocked ?? 0,
      failedCount: flow?.taskCounts.failed ?? 0,
      pendingRequestCount: this.pendingRequestIdsForFlow(events, subject.flowId).length,
      acceptanceRejectedCount: this.countAcceptanceRejections(events, subject.flowId),
      priorVersionDecisionCount: this.countPriorVersionDecisions(events, subject.flowId, subject.runId),
      latestDocs,
      ...(pinnedDocs.length > 0 ? { pinnedDocs } : {}),
      newerThanPinned: versions.filter((version) => version.newerThanPinned).map((version) => version.docKind),
    };
  }

  // —— versionDecisionCardLabels（B5 自 session.ts 逐字搬移）——
  versionDecisionCardLabels(facts: VersionDecisionFacts, flowId: string): VersionDecisionCardLabels {
    const question = [
      mainT("ui.versionDecision.question"),
      "",
      mainT("ui.versionDecision.fact.header"),
      `- ${mainT("ui.versionDecision.fact.unclosed", { count: facts.unclosedCount })}`,
      `- ${mainT("ui.versionDecision.fact.blockedFailed", { blocked: facts.blockedCount, failed: facts.failedCount })}`,
      `- ${mainT("ui.versionDecision.fact.pendingRequests", { count: facts.pendingRequestCount })}`,
      `- ${mainT("ui.versionDecision.fact.acceptanceReworks", { count: facts.acceptanceRejectedCount })}`,
      `- ${mainT("ui.versionDecision.fact.latestVsPinned")}`,
      `- ${mainT("ui.versionDecision.fact.previousDecisions", { count: facts.priorVersionDecisionCount })}`,
    ].join("\n");
    return {
      title: mainT("ui.versionDecision.title", { flowId }),
      question,
      disclaimer: mainT("ui.versionDecision.disclaimer"),
      optionVersionModify: mainT("ui.versionDecision.option.versionModify"),
      optionNewVersionDevelopment: mainT("ui.versionDecision.option.newVersionDevelopment"),
    };
  }

  // —— decidedByText（B5 自 session.ts 逐字搬移）——
  decidedByText(decidedBy: VersionDecisionDecidedBy): string {
    if (decidedBy === "directive") return mainT("ui.versionDecision.decidedBy.directive");
    return decidedBy === "judge" ? mainT("ui.versionDecision.decidedBy.judge") : mainT("ui.versionDecision.decidedBy.customer");
  }

  // —— formatTargetVersions（B5 自 session.ts 逐字搬移）——
  formatTargetVersions(targets: Record<string, number>): string {
    return Object.entries(targets).map(([kind, version]) => `${kind}:${version}`).join(", ");
  }

  // —— stripVersionDecisionPrefix（B5 自 session.ts 逐字搬移）——
  stripVersionDecisionPrefix(text: string): string {
    return text.startsWith(VERSION_DECISION_SYSTEM_PREFIX) ? text.slice(VERSION_DECISION_SYSTEM_PREFIX.length) : text;
  }

  // —— nextVersionFlowId（B5 自 session.ts 逐字搬移）——
  nextVersionFlowId(oldFlowId: string, existing: ReadonlySet<string>): string | undefined {
    const free = (candidate: string): boolean =>
      candidate.length <= 64 && GOVERNANCE_SLUG_RE.test(candidate) && !existing.has(candidate);
    const base = `${oldFlowId}-next`;
    if (free(base)) return base;
    for (let index = 2; index <= 99; index += 1) {
      const candidate = `${oldFlowId}-next${index}`;
      if (candidate.length > 64) break;
      if (free(candidate)) return candidate;
    }
    for (let index = 2; index <= 99; index += 1) {
      const candidate = `${oldFlowId}-n${index}`;
      if (candidate.length > 64) break;
      if (free(candidate)) return candidate;
    }
    return undefined;
  }

  // —— mapVersionDecisionRawOutcome（B5 自 session.ts 逐字搬移）——
  mapVersionDecisionRawOutcome(outcome: CustomerInputOutcome | null | undefined): CustomerInputOutcome | null | undefined {
    if (outcome === null || outcome === undefined || outcome.outcome !== "answered") return outcome;
    const selected = Array.isArray(outcome.value.selected) ? outcome.value.selected : [];
    const action = selected[0];
    if (selected.length === 1 && (action === "version-modify" || action === "new-version-development")) return outcome;
    return {
      outcome: "declined",
      ...(outcome.operatorId !== undefined ? { operatorId: outcome.operatorId } : {}),
      reason: "invalid-selection",
      ...(outcome.judge !== undefined ? { judge: outcome.judge } : {}),
    };
  }

  // —— appendVersionDecisionAudit（B5 自 session.ts 逐字搬移）——
  appendVersionDecisionAudit(projectRoot: string, fields: Omit<VersionDecisionEvent, "v" | "kind" | "at">): Promise<boolean> {
    return this.appendTaskState(projectRoot, taskEvent("version.decision", fields, () => new Date(this.now())));
  }

  // —— emitVersionDecisionResolved（B5 自 session.ts 逐字搬移）——
  async emitVersionDecisionResolved(projectRoot: string, runtime: RuntimeKind, roleId: string, requestId: string, detail: string): Promise<void> {
    const appended = await this.appendTaskState(projectRoot, taskEvent("request.notified", { requestId, to: "chief", event: "resolved" }, () => new Date(this.now())));
    if (!appended) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId }).record("version-decision.notified.write-failed", { requestId });
    }
    const line = mainT("main.versionDecision.notifiedResolved", { result: this.stripVersionDecisionPrefix(detail) });
    this.emitDeliveryNote(projectRoot, runtime, roleId, "chief", line);
  }

  // —— requestVersionDecision（B5 自 session.ts 逐字搬移）——
  /**
   * 幕僚发起版本决策：校验 → 发 application-owned decision 卡（客户/判断 agent）→ 执行机器部分。
   * 申请≠批准、路线≠内容批准；不写文档、不派角色、不创建任务。失败一律结构化返回，不抛到工具层。
   */
  async requestVersionDecision(input: {
    projectRoot: string;
    roleId: string;
    runtime: RuntimeKind;
    request: VersionDecisionRequest;
    signal?: AbortSignal;
  }): Promise<VersionDecisionResult> {
    const { projectRoot, roleId, runtime, signal } = input;
    const fail = (code: VersionDecisionErrorCode, message: string, extra: Partial<VersionDecisionResult> = {}): VersionDecisionResult => ({
      ok: false,
      code,
      message,
      ...extra,
    });
    try {
      const listing = this.deps.getListing(projectRoot);
      const role = listing?.roles.find((candidate) => candidate.roleId === roleId);
      if (role === undefined || role.builtIn !== true || role.governanceFunction !== "chief") {
        return fail("channel-unavailable", mainT("main.versionDecision.error.channelUnavailable"));
      }
      const entry = this.sessions.get(this.sessionKey(projectRoot, roleId, runtime));
      if (entry === undefined || entry.governedCardContext === undefined || this.deps.customerInput === undefined) {
        return fail("channel-unavailable", mainT("main.versionDecision.error.channelUnavailable"));
      }
      const validation = validateVersionDecisionRequest(input.request);
      if (!validation.ok) return fail(validation.code, mainT("main.versionDecision.error.versionDecisionInvalid"));
      const req = validation.request;
      if (signal?.aborted) return fail("initiator-aborted", mainT("main.versionDecision.aborted"));
      const now = new Date(this.now());
      const view = await buildProjectStateView(projectRoot, { full: true, now });
      if (!view.flows.some((flow) => flow.flowId === req.flowId)) {
        return fail("flow-not-found", mainT("main.versionDecision.error.flowNotFound", { flowId: req.flowId }));
      }
      const scan = await scanRunManifestsForState(projectRoot);
      const derivation = deriveActiveRunFromManifests(scan.manifests, req.flowId);
      const preliminary = validateVersionDecisionContext({
        derivation,
        ...(req.runId !== undefined ? { requestedRunId: req.runId } : {}),
        hasPending: false,
      });
      if (!preliminary.ok) {
        const runs = derivation.activeRuns.map((run) => run.runId).join("、");
        const message = preliminary.code === "run-ambiguous"
          ? mainT("main.versionDecision.error.runAmbiguous", { runs })
          : preliminary.code === "run-change-required"
            ? mainT("main.versionDecision.error.runChangeRequired")
            : preliminary.message;
        return fail(preliminary.code, message);
      }
      const subject: VersionDecisionRequestSubject = {
        flowId: req.flowId,
        ...(preliminary.runId !== undefined ? { runId: preliminary.runId } : {}),
      };
      const pendingKey = this.versionDecisionSubjectKey(projectRoot, subject);
      const requestId = versionDecisionRequestId(subject, now);
      const previous = this.versionDecisionChains.get(projectRoot) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const tail = previous.then(() => gate);
      this.versionDecisionChains.set(projectRoot, tail);
      await previous;
      let attempt = 1;
      const state = await this.readTasks(projectRoot);
      try {
        const ledgerPending = this.findPendingVersionDecision(state.events, req.flowId, subject);
        const memoryPending = this.versionDecisionPending.get(pendingKey);
        if (ledgerPending !== undefined || memoryPending !== undefined) {
          return fail("decision-pending", mainT("main.versionDecision.error.decisionPending", { requestId: ledgerPending ?? memoryPending ?? requestId }));
        }
        attempt = versionDecisionAttempt(state.events, subject);
        this.versionDecisionPending.set(pendingKey, requestId);
      } finally {
        release();
        void tail.finally(() => {
          if (this.versionDecisionChains.get(projectRoot) === tail) this.versionDecisionChains.delete(projectRoot);
        });
      }
      try {
        const facts = this.buildVersionDecisionFacts(view, state.events, subject);
        const card = buildVersionDecisionCard({
          requestId,
          flowId: req.flowId,
          ...(subject.runId !== undefined ? { runId: subject.runId } : {}),
          action: req.action,
          reason: req.reason,
          facts,
          labels: this.versionDecisionCardLabels(facts, req.flowId),
        });
        const request = versionDecisionCardToRequest(card);
        const cardCheck = validateDecisionCardRequest({
          request,
          roleId: "application",
          governanceModel: "trio",
          metadata: { cardKind: "decision", flowId: req.flowId },
        });
        if (!cardCheck.ok) return fail("version-decision-invalid", mainT("main.versionDecision.error.versionDecisionInvalid"));
        let outcome: CustomerInputOutcome | null | undefined;
        try {
          outcome = await this.withRequestLifecycle(
            projectRoot,
            "application",
            request,
            undefined,
            async (req2, context, metadata) => this.mapVersionDecisionRawOutcome(await this.deps.customerInput!(req2, context, metadata)),
            (req2, extras) => entry.governedCardContext!(req2, extras),
            requestId,
            { notify: "none", ...(signal !== undefined ? { signal } : {}) },
          );
        } catch (error) {
          if (signal?.aborted) return fail("initiator-aborted", mainT("main.versionDecision.aborted"));
          // 通道抛错：withRequestLifecycle 已按「通道异常」写 request.resolved(unavailable)（不写 version.decision）。
          // 若 ledger 确实有该 resolved，按 decision-unavailable 回执；否则才是执行/审计失败。
          const afterError = await this.readTasks(projectRoot);
          const resolvedAfterError = afterError.events.some((event) =>
            event.kind === "request.resolved" && event.requestId === requestId,
          );
          if (resolvedAfterError) {
            await this.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, mainT("main.versionDecision.unavailable"));
            return fail("decision-unavailable", mainT("main.versionDecision.unavailable"));
          }
          return fail("execution-failed", mainT("main.versionDecision.error.executionFailed", { detail: error instanceof Error ? error.message : String(error) }));
        }
        if (outcome?.outcome === "declined" && outcome.reason === "initiator-aborted") {
          return fail("initiator-aborted", mainT("main.versionDecision.aborted"));
        }
        if (signal?.aborted) return fail("initiator-aborted", mainT("main.versionDecision.aborted"));
        const answeredOutcome = outcome !== null && outcome !== undefined && outcome.outcome === "answered" ? outcome : undefined;
        const operatorId = outcome !== null && outcome !== undefined && "operatorId" in outcome && typeof outcome.operatorId === "string" ? outcome.operatorId : undefined;
        // Q9 A（2026-11-03）：指令归属只从 `operatorId:"directive:<id>"` 解析（先于 judge/customer）。
        const directiveId = directiveIdFromOperatorId(operatorId);
        const judged = (answeredOutcome !== undefined && answeredOutcome.judge !== undefined) ||
          (typeof operatorId === "string" && operatorId.startsWith("judge:"));
        const decidedBy: VersionDecisionDecidedBy = directiveId !== undefined ? "directive" : judged ? "judge" : "customer";
        const answerOutcome: "answered" | "declined" | "unavailable" =
          answeredOutcome !== undefined ? "answered" : outcome !== null && outcome !== undefined && outcome.outcome === "declined" ? "declined" : "unavailable";
        const answerPlan = mapVersionDecisionAnswer({
          outcome: answerOutcome,
          by: decidedBy,
          ...(answeredOutcome !== undefined ? { selected: answeredOutcome.value.selected } : {}),
          ...(outcome !== null && outcome !== undefined && outcome.outcome === "declined" && outcome.reason !== undefined ? { reason: outcome.reason } : {}),
        });
        if (answerPlan.kind === "late" || answerPlan.kind === "orphan") {
          return fail("initiator-aborted", mainT("main.versionDecision.aborted"));
        }
        if (answerPlan.kind === "resolve-declined") {
          await this.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, mainT("main.versionDecision.declined"));
          return fail("decision-declined", mainT("main.versionDecision.declined"));
        }
        if (answerPlan.kind === "resolve-unavailable") {
          await this.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, mainT("main.versionDecision.unavailable"));
          return fail("decision-unavailable", mainT("main.versionDecision.unavailable"));
        }
        const decisionId = answeredOutcome?.decisionId !== undefined ? answeredOutcome.decisionId : `decision-${requestId}`;
        const baseAudit: Omit<VersionDecisionEvent, "v" | "kind" | "at" | "status"> = {
          schema: VERSION_DECISION_SCHEMA,
          decisionId,
          requestId,
          attempt,
          flowId: req.flowId,
          ...(subject.runId !== undefined ? { runId: subject.runId } : {}),
          action: answerPlan.action,
          recommendedBy: "chief",
          recommendedAction: req.action,
          decidedBy: answerPlan.decidedBy,
          ...(directiveId !== undefined ? { directiveId } : {}),
          ...(operatorId !== undefined ? { operatorId } : {}),
          reason: req.reason,
          oldFlowId: req.flowId,
          ...(subject.runId !== undefined ? { oldRunId: subject.runId } : {}),
        };
        const recordFailure = async (status: "failed" | "uncertain", message: string, extras: Partial<Omit<VersionDecisionEvent, "v" | "kind" | "at">> = {}): Promise<void> => {
          const appended = await this.appendVersionDecisionAudit(projectRoot, { ...baseAudit, status, message, ...extras });
          if (appended) await this.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, mainT("main.versionDecision.partialFailed", { detail: message }));
        };
        if (!(await this.appendVersionDecisionAudit(projectRoot, { ...baseAudit, status: "executing" }))) {
          return fail("execution-uncertain", mainT("main.versionDecision.error.executionUncertain", { detail: "executing audit write failed" }), { decisionId, action: answerPlan.action, flowId: req.flowId });
        }
        const freshScan = await scanRunManifestsForState(projectRoot);
        const freshDerivation = deriveActiveRunFromManifests(freshScan.manifests, req.flowId);
        const freshState = await this.readTasks(projectRoot);
        const pendingRequestIds = this.pendingRequestIdsForFlow(freshState.events, req.flowId);
        const latestVersions: Partial<Record<Exclude<ProjectStateDocKind, "topology">, number>> = {};
        if (answerPlan.action === "version-modify") {
          const docs = await scanVersionedDocsForFlow(projectRoot, req.flowId);
          for (const [kind, pointer] of Object.entries(docs.docs)) {
            if (kind === "topology") continue;
            latestVersions[kind as Exclude<ProjectStateDocKind, "topology">] = pointer.version;
          }
        }
        const executionPlan = planVersionDecisionExecution({
          action: answerPlan.action,
          flowId: req.flowId,
          derivation: freshDerivation,
          ...(req.runId !== undefined ? { requestedRunId: req.runId } : {}),
          hasPending: false,
          latestVersions,
          pendingRequestIds,
        });
        if (executionPlan.kind === "fail") {
          await recordFailure("failed", executionPlan.audit !== undefined ? "run-change-required" : executionPlan.message);
          return fail(executionPlan.code, executionPlan.audit !== undefined
            ? mainT("main.versionDecision.error.runChangeRequired")
            : executionPlan.message);
        }
        if (executionPlan.kind === "version-modify") {
          let effectiveRunId = executionPlan.runId;
          let runAnchor: "created" | "existing" | "unavailable" | undefined;
          if (executionPlan.needsRunAnchor) {
            const draft = await ensureDraftRun(projectRoot, req.flowId, new Date(this.now()));
            if (draft.ok) {
              effectiveRunId = draft.manifest.runId;
              runAnchor = draft.created ? "created" : "existing";
            } else {
              runAnchor = "unavailable";
            }
          }
          const executed = await this.appendVersionDecisionAudit(projectRoot, {
            ...baseAudit,
            ...(effectiveRunId !== undefined ? { runId: effectiveRunId, oldRunId: effectiveRunId } : {}),
            status: "executed",
            targetVersions: executionPlan.targetVersions,
          });
          const detail = this.stripVersionDecisionPrefix(mainT("main.versionDecision.executed.versionModify", {
            flowId: req.flowId,
            targets: this.formatTargetVersions(executionPlan.targetVersions),
          }));
          if (!executed) {
            return fail("execution-uncertain", mainT("main.versionDecision.error.executionUncertain", { detail: "executed audit write failed" }), {
              decisionId,
              action: "version-modify",
              flowId: req.flowId,
              ...(effectiveRunId !== undefined ? { runId: effectiveRunId } : {}),
              targetVersions: executionPlan.targetVersions,
              ...(runAnchor !== undefined ? { runAnchor } : {}),
            });
          }
          await this.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, `${this.decidedByText(answerPlan.decidedBy)}；${detail}`);
          return {
            ok: true,
            message: runAnchor === "unavailable" ? `${detail}（run 锚点不可用）` : detail,
            decisionId,
            action: "version-modify",
            flowId: req.flowId,
            ...(effectiveRunId !== undefined ? { runId: effectiveRunId } : {}),
            targetVersions: executionPlan.targetVersions,
            ...(runAnchor !== undefined ? { runAnchor } : {}),
          };
        }
        // new-version-development
        const freshView = await buildProjectStateView(projectRoot, { full: true, now: new Date(this.now()) });
        const newFlowId = this.nextVersionFlowId(req.flowId, new Set(freshView.flows.map((flow) => flow.flowId)));
        if (newFlowId === undefined) {
          await recordFailure("failed", "new-flow-name-unavailable");
          return fail("execution-failed", mainT("main.versionDecision.error.executionFailed", { detail: "新 flow 命名不可用" }), { decisionId, action: "new-version-development", flowId: req.flowId });
        }
        const draft = await ensureDraftRun(projectRoot, newFlowId, new Date(this.now()));
        if (!draft.ok) {
          await recordFailure("failed", `new-run-create-failed:${draft.reason}`);
          return fail("execution-failed", mainT("main.versionDecision.error.executionFailed", { detail: draft.reason }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId });
        }
        const newRunId = draft.manifest.runId;
        // 崩溃对账用：创建成功后立即补一条带 newFlowId/newRunId 的 executing（仍先于关闭旧 run 的机器效果）。
        if (!(await this.appendVersionDecisionAudit(projectRoot, {
          ...baseAudit,
          status: "executing",
          newFlowId,
          newRunId,
        }))) {
          await recordFailure("uncertain", "executing-ids-audit-write-failed", { newFlowId, newRunId });
          return fail("execution-uncertain", mainT("main.versionDecision.error.executionUncertain", { detail: "executing ids audit write failed" }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId });
        }
        const closedRunIds: string[] = [];
        for (const runId of executionPlan.oldActiveRunIds) {
          const current = await readRunManifest(projectRoot, runId);
          if (!current.ok) {
            await recordFailure("failed", `close-read-failed:${runId}`, { newFlowId, newRunId, closedRunIds: [...closedRunIds] });
            return fail("execution-failed", mainT("main.versionDecision.error.executionFailed", { detail: current.reason }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId, closedRunIds: [...closedRunIds] });
          }
          if (current.manifest.state === "pinned") {
            await recordFailure("failed", "run-change-required", { newFlowId, newRunId, closedRunIds: [...closedRunIds] });
            return fail("run-change-required", mainT("main.versionDecision.error.runChangeRequired"), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId, closedRunIds: [...closedRunIds] });
          }
          const closed = await closeRun(projectRoot, runId, "closed", supersededCloseReason(newFlowId, newRunId));
          if (!closed.ok) {
            await recordFailure("failed", `close-failed:${runId}`, { newFlowId, newRunId, closedRunIds: [...closedRunIds] });
            return fail("execution-failed", mainT("main.versionDecision.error.executionFailed", { detail: closed.reason }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId, closedRunIds: [...closedRunIds] });
          }
          closedRunIds.push(runId);
        }
        const orphanedRequestIds: string[] = [];
        for (const requestIdToOrphan of executionPlan.orphanRequestIds) {
          const appended = await this.appendTaskState(projectRoot, taskEvent("request.orphaned", { requestId: requestIdToOrphan, reason: "superseded" }, () => new Date(this.now())));
          if (!appended) {
            await recordFailure("uncertain", `orphan-failed:${requestIdToOrphan}`, { newFlowId, newRunId, closedRunIds: [...closedRunIds], orphanedRequestIds: [...orphanedRequestIds] });
            return fail("execution-uncertain", mainT("main.versionDecision.error.executionUncertain", { detail: `orphan failed: ${requestIdToOrphan}` }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId, closedRunIds: [...closedRunIds], orphanedRequestIds: [...orphanedRequestIds] });
          }
          orphanedRequestIds.push(requestIdToOrphan);
        }
        const focusAppended = await this.appendTaskState(projectRoot, taskEvent("project.focus", {
          flowId: newFlowId,
          runId: newRunId,
          roleId: "application",
          sourceDecisionId: decisionId,
          note: `superseded-by:${newFlowId}/${newRunId}`,
        }, () => new Date(this.now())));
        if (!focusAppended) {
          await recordFailure("uncertain", "focus-switch-failed", { newFlowId, newRunId, closedRunIds: [...closedRunIds], orphanedRequestIds: [...orphanedRequestIds] });
          return fail("execution-uncertain", mainT("main.versionDecision.error.executionUncertain", { detail: "focus switch failed" }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId, closedRunIds: [...closedRunIds], orphanedRequestIds: [...orphanedRequestIds] });
        }
        const executed = await this.appendVersionDecisionAudit(projectRoot, {
          ...baseAudit,
          status: "executed",
          newFlowId,
          newRunId,
          closedRunIds,
          orphanedRequestIds,
        });
        const detail = this.stripVersionDecisionPrefix(mainT("main.versionDecision.executed.newVersion", {
          oldFlowId: req.flowId,
          newFlowId,
          newRunId,
        }));
        if (!executed) {
          return fail("execution-uncertain", mainT("main.versionDecision.error.executionUncertain", { detail: "executed audit write failed" }), { decisionId, action: "new-version-development", flowId: req.flowId, newFlowId, newRunId, closedRunIds, orphanedRequestIds });
        }
        await this.emitVersionDecisionResolved(projectRoot, runtime, roleId, requestId, `${this.decidedByText(answerPlan.decidedBy)}；${detail}`);
        return {
          ok: true,
          message: detail,
          decisionId,
          action: "new-version-development",
          flowId: req.flowId,
          ...(req.runId !== undefined ? { runId: req.runId } : {}),
          newFlowId,
          newRunId,
          closedRunIds,
          orphanedRequestIds,
        };
      } finally {
        this.versionDecisionPending.delete(pendingKey);
      }
    } catch (error) {
      return fail("execution-failed", mainT("main.versionDecision.error.executionFailed", { detail: error instanceof Error ? error.message : String(error) }));
    }
  }

  // —— restoreVersionDecisions（B5 自 session.ts 逐字搬移）——
  /**
   * 重启对账（AC-8.3/R3）：executing → executed/uncertain；F5「resolved 无执行记录」→ uncertain + 通知。
   * 排除已 request.orphaned；不自动执行、不重复创建 flow/run。
   */
  async restoreVersionDecisions(projectRoot: string, state: TaskReplay): Promise<{ reconciled: number; uncertain: number }> {
    let reconciled = 0;
    let uncertain = 0;
    const latest = new Map<string, VersionDecisionEvent>();
    for (const event of state.events) {
      if (event.kind === "version.decision") latest.set(event.decisionId, event);
    }
    const chiefRoleId = this.chiefTaskRoleIdOf(projectRoot) ?? "chief";
    const runtime = this.findLiveRuntime(projectRoot, chiefRoleId) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
    for (const event of latest.values()) {
      if (event.status !== "executing") continue;
      let status: "executed" | "uncertain" = "executed";
      let message: string | undefined;
      if (event.action === "new-version-development") {
        if (event.newFlowId === undefined || event.newRunId === undefined) {
          status = "uncertain";
          message = "new-flow-run-unrecorded";
        } else {
          const newRun = await readRunManifest(projectRoot, event.newRunId);
          if (!newRun.ok || newRun.manifest.flowId !== event.newFlowId) {
            status = "uncertain";
            message = "new-run-unavailable";
          } else {
            const scan = await scanRunManifestsForState(projectRoot);
            const remaining = deriveActiveRunFromManifests(scan.manifests, event.oldFlowId ?? event.flowId).activeRuns;
            if (remaining.length > 0) {
              status = "uncertain";
              message = `old-runs-still-active:${remaining.map((run) => run.runId).join(",")}`;
            } else if (!state.events.some((candidate) =>
              candidate.kind === "project.focus" &&
              candidate.sourceDecisionId === event.decisionId &&
              candidate.flowId === event.newFlowId &&
              candidate.runId === event.newRunId,
            )) {
              status = "uncertain";
              message = "focus-not-switched";
            } else {
              for (const oldRunId of event.closedRunIds ?? []) {
                const oldRun = await readRunManifest(projectRoot, oldRunId);
                if (!oldRun.ok || (oldRun.manifest.state !== "closed" && oldRun.manifest.state !== "cancelled")) {
                  status = "uncertain";
                  message = `old-run-not-closed:${oldRunId}`;
                  break;
                }
              }
            }
          }
        }
      }
      const { v: _v, kind: _kind, at: _at, ...fields } = event;
      const appended = await this.appendVersionDecisionAudit(projectRoot, {
        ...fields,
        status,
        ...(message !== undefined ? { message } : {}),
      });
      if (!appended) continue;
      if (status === "executed") reconciled += 1;
      else uncertain += 1;
      await this.emitVersionDecisionResolved(
        projectRoot,
        runtime,
        chiefRoleId,
        event.requestId,
        status === "executed"
          ? mainT("ui.versionDecision.status.executed")
          : mainT("main.versionDecision.uncertain", { detail: message ?? "reconciliation" }),
      );
    }
    for (const pending of collectResolvedWithoutExecution(state.events)) {
      if (latest.has(pending.decisionId) || pending.flowId === undefined) continue;
      const subject: VersionDecisionRequestSubject = { flowId: pending.flowId };
      const appended = await this.appendVersionDecisionAudit(projectRoot, {
        schema: VERSION_DECISION_SCHEMA,
        decisionId: pending.decisionId,
        requestId: pending.requestId,
        attempt: versionDecisionAttempt(state.events, subject),
        flowId: pending.flowId,
        action: pending.action,
        recommendedBy: "chief",
        recommendedAction: pending.action,
        decidedBy: pending.decidedBy,
        reason: "restart-recovery:resolved-without-execution-record",
        status: "uncertain",
        message: "resolved-without-execution-record",
      });
      if (!appended) continue;
      uncertain += 1;
      await this.emitVersionDecisionResolved(
        projectRoot,
        runtime,
        chiefRoleId,
        pending.requestId,
        mainT("main.versionDecision.uncertain", { detail: "resolved-without-execution-record" }),
      );
    }
    return { reconciled, uncertain };
  }

  // —— restoreRequestState（B5 自 session.ts 逐字搬移）——
  /**
   * C-08：重启重放申请/审批——未决 `request.created` 标 `request.orphaned`（不自动执行原动作，系统通知幕僚）；
   * 未决 `approval.created` 标 `approval.expired`（命令/写盘不重放）。已结算/已标记幂等跳过。
   */
  async restoreRequestState(
    projectRoot: string,
    state: TaskReplay,
  ): Promise<{ orphaned: number; expired: number }> {
    const resolved = new Set<string>();
    const orphaned = new Set<string>();
    const approvalDone = new Set<string>();
    const createdRequests = new Map<string, { sourceRoleId: string; title: string }>();
    const createdApprovals = new Map<string, { sourceRoleId: string; summary: string }>();
    for (const event of state.events) {
      if (event.kind === "request.resolved") resolved.add(event.requestId);
      else if (event.kind === "request.orphaned") orphaned.add(event.requestId);
      else if (event.kind === "request.created") createdRequests.set(event.requestId, { sourceRoleId: event.sourceRoleId, title: event.title });
      else if (event.kind === "approval.created") createdApprovals.set(event.approvalId, { sourceRoleId: event.sourceRoleId, summary: event.summary });
      else if (event.kind === "approval.resolved" || event.kind === "approval.expired") approvalDone.add(event.approvalId);
    }
    let orphanedCount = 0;
    for (const [requestId, info] of createdRequests) {
      if (resolved.has(requestId) || orphaned.has(requestId)) continue;
      const appended = await this.appendTaskState(projectRoot, taskEvent("request.orphaned", { requestId, reason: "restart" }, () => new Date(this.now())));
      if (!appended) continue;
      orphanedCount += 1;
      // C-08：原 tool call 已不存在——结果只作系统通知/任务回投发起角色，**不自动执行原动作**。
      const sourceRuntime = this.findLiveRuntime(projectRoot, info.sourceRoleId) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
      this.emitDeliveryNote(
        projectRoot,
        sourceRuntime,
        info.sourceRoleId,
        "chief",
        `[系统·申请] 重启后申请 #${requestId}「${shortenSummary(info.title, 80)}」未决，已标记 orphaned；不会自动执行原动作，请重新发起或人工处理。`,
      );
      if (info.sourceRoleId !== "application") {
        this.notifyRequest(projectRoot, requestId, info.sourceRoleId, info.title, "resolved", "重启后未决（orphaned；不自动执行原动作）");
      }
    }
    let expiredCount = 0;
    for (const [approvalId, info] of createdApprovals) {
      if (approvalDone.has(approvalId)) continue;
      const appended = await this.appendTaskState(projectRoot, taskEvent("approval.expired", { approvalId, reason: "restart" }, () => new Date(this.now())));
      if (!appended) continue;
      expiredCount += 1;
      // C-08：命令/写盘不重放；如实通知发起角色。
      const sourceRuntime = this.findLiveRuntime(projectRoot, info.sourceRoleId) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
      this.emitDeliveryNote(
        projectRoot,
        sourceRuntime,
        info.sourceRoleId,
        "chief",
        `[系统·审批] 重启后审批 #${approvalId}「${shortenSummary(info.summary, 80)}」未决，已标记 expired；命令/写盘不重放，请重新发起并逐次确认。`,
      );
    }
    return { orphaned: orphanedCount, expired: expiredCount };
  }

}
