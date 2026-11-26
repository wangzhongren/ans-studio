// app/desktop/session/cards/cards.ts
// B5（2026-11-13，session.ts 重构；方案 docs/planning/2026-11-13_refactor_session-ts_plan-v1.md
// §3.2 / §3.3 / §3.6 / §5 B5、附录 A cards 组）：应用卡呈现 + 申请生命周期 + 方案升级 + 任命/stable +
// run-change 卡（L4，feature 白名单 card-gateway / evidence）。
// 21 个类方法（interpretDirective/requestRequirementChangeDecision/requestRunChangeDecision/
// pickGovernedCardEntry/presentAppCard/presentVersionChangeCard/presentAmendmentItemCard/
// presentStableWriteCard/noteVersionChange/noteVersionChangeInitiator/reportPlanEscalation/
// afterPlanEscalation/activeRunViews/proposalCardFrozenRejection/pendingVersionChangesFor/
// offerRunChangeOnFrozenContract/requestIdFor/notifyRequest/recordRequestPresented/
// appointmentWriteApplicationRejection/withRequestLifecycle）自 app/desktop/session.ts **逐字搬移**
// （含 JSDoc）：方法体零改动；类外壳重建原 receiver 面——
//  · 方案 §3.6 cards 的 7 个状态字段**由本模块单 owner 持有并创建**（CardsState；version-decisions 经
//    同一实例引用读写 versionDecisionPending/versionDecisionChains）；门面仅保留同一实例访问器；
//  · afterStableWrite/enrichAppointmentWriteBoundaryCard/afterAppointmentWriteApproved 因单模块 ≤1,500 行
//    预算移入同目录 acceptance-facts.ts（§3.2 该文件职责含 appointment-write 校验；记录 §7 偏差 1）；
//  · 已迁出的 shared 方法经同名同义委托 → shared/*（与门面委托同一函数、同一入参）；
//  · 未迁出的门面方法（findLiveRuntime/activeRuntimeFor/enqueueDelivery/drainQueue）经 `CardsPorts`
//    回调注入，参数逐位原样转发；fixed 卡钩子（prepareFixedAppointmentCardRequest/
//    recordFixedCardWorkflowResolution）经 `FixedCardHooks`（card-gateway）注入；
//  · `collectFixedProposalDocumentRefs` 直接调用已迁出的 Evidence 实例（白名单内下层 L1）；
//  · 验收事实（enrichAcceptanceJudgeContext）委托同目录 acceptance-facts（模块内拆分）。
// 可见性 private → 模块内 public 仅为门面委托可调用（不进入公开导出面）。
// 依赖规则（结构测试 R-c）：L4 cards 只可导入 L0、card-gateway（L3）、evidence（L1）与模块内文件。

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createDiagnosticLogger } from "../../../../src/common/shared/diagnostics.ts";
import { RUNTIME_KINDS, type RuntimeKind } from "../../../../src/common/shared/runtime-shared.ts";
import { shortenSummary, taskEvent, type TaskReplay } from "../../../../src/common/编排/task-state.ts";
import { declaredConfirmPaths, declaredPathBodies } from "../../../../src/common/编排/confirmed-writes.ts";
import { formatMechanicalRejection, makeMechanicalRejection, type MechanicalRejection } from "../../../../src/common/编排/mechanical-rejection.ts";
import { ENV_BOOTSTRAP_ROLE_ID, loadLatestRoster } from "../../../../src/common/编排/workflow-preconditions.ts";
import { applyRunChange, buildRunChangeCard, findActiveRun, findNewerContractDocs, listRunManifestsResult, mapRunChangeAnswer, pinnedDocsSummary, type NewerContractDoc, type RunManifest, type RunChangeMode } from "../../../../src/common/编排/run-manifest.ts";
import { stableWritePathOf } from "../../../../src/common/门禁引擎/versioned-doc-guard.ts";
import { isBuiltInGovernanceRoleId } from "../../../../src/service/boundary/resolve-boundary.ts";
import { createRuntimeAdapterFactory } from "../../../../src/pipeline/orchestration/run-role.ts";
import { createDirectiveInterpreter as realCreateDirectiveInterpreter, DIRECTIVE_INTERPRET_SUPPORTED_RUNTIMES } from "../../../../src/pipeline/orchestration/govern-session.ts";
import type { DirectiveInterpretRequest, DirectiveInterpretResult } from "../../../../src/model/directive.ts";
import type { CustomerInputMetadata, CustomerInputOutcome, CustomerInputRequest, PlanEscalationInput, PlanEscalationResult, TaskStateEvent, WorkflowDocumentRef, WorkflowStage } from "../../../../src/model/runtime.ts";
import { GOVERNANCE_SLUG_PATTERN, PLAN_ESCALATION_CATEGORIES } from "../../../../src/model/runtime.ts";
import type { VersionDecisionDecidedBy } from "../../../../src/model/project-state.ts";
import type { StableWriteRecord, VersionChangeRecord } from "../../../../src/model/version-change.ts";
import type { AmendmentItemOutcome, VcaCardOutcome } from "../../../../src/pipeline/orchestration/version-change-runtime.ts";
import type { StableWriteCardOutcome } from "../../../../src/pipeline/orchestration/stable-write-runtime.ts";
import { directiveIdFromOperatorId } from "../../directive-input.ts";
import { mainT } from "../../i18n.ts";
import { buildEffectiveProjectConfig } from "../../project.ts";
import { prepareIntent as prepareFixedIntent } from "../../../../src/common/编排/workflow-service.ts";
import { activeFixedWorkflowIdFor, markFixedProposalCardRequested, resolveFixedPathMode } from "../../workflow.ts";
import { buildPlanEscalationCard } from "../../plan-escalation.ts";
import {
  appointmentStableWriteInputs,
  buildAmendmentItemCard,
  buildStableBoundaryRisk,
  buildStableWriteCard,
  buildVersionChangeCard,
  mergeAcknowledgements,
  toAmendmentItemOutcome,
  toStableWriteOutcome,
  toVersionChangeOutcome,
  validateStableWriteCardShape,
  type AmendmentItemPresentation,
  type StableWritePreview,
  type VersionChangeStack,
} from "../../version-change.ts";
import type { AcceptanceReportDisplayV1, DesktopCustomerInputFn } from "../../customer-input.ts";
import type { SessionManagerDeps } from "../contracts/deps.ts";
import type { ActiveRunView, DeliveryItem, LiveSession } from "../contracts/session-types.ts";
import { now } from "../shared/clock.ts";
import { sessionKey } from "../shared/keys.ts";
import { emitDeliveryNote } from "../shared/notifier.ts";
import { chiefTaskRoleIdOf, handbackOwnerRoleId } from "../shared/roles.ts";
import { appendRoleActivity, appendTaskState, readTasks } from "../shared/tasks-store.ts";
import type { Evidence } from "../evidence.ts";
import type { FixedCardHooks } from "../card-gateway.ts";
import type { LoadConfigOptions, LoadedConfig } from "../../../../src/common/shared/config-loader.ts";
import { AcceptanceFacts } from "./acceptance-facts.ts";

/** 2026-11-02（版本决策）：slug 校验（与 model/runtime.ts 单一来源一致）。 */
const GOVERNANCE_SLUG_RE = new RegExp(GOVERNANCE_SLUG_PATTERN);

/** cards 模块单 owner 的状态（方案 §3.6 cards 的 7 个字段；version-decisions 经同一实例引用其 2 项）。 */
export interface CardsState {
  readonly planEscalations: Map<string, Promise<void>>;
  readonly planEscalationPrompted: Set<string>;
  readonly requestNotifiedKeys: Set<string>;
  readonly requestPresentedKeys: Set<string>;
  readonly versionDecisionPending: Map<string, string>;
  readonly versionDecisionChains: Map<string, Promise<void>>;
  readonly runChangeAutoPrompted: Set<string>;
}

/** cards 方法读取的跨模块只读状态面（同一实例；方案 §3.6 归属其他模块）。 */
export interface CardsRefs {
  sessions: ReadonlyMap<string, LiveSession>;
  lastGovernanceRuntime: ReadonlyMap<string, RuntimeKind>;
  lastRoleActivity: Map<string, { at: number; kind: string; summary: string }>;
  loadEffectiveConfig: (opts: LoadConfigOptions) => Promise<LoadedConfig>;
}

/** 尚未迁出（B5 范围外）的门面方法端口；门面以箭头回调注入，参数逐位原样转发、返回原样返回。 */
export interface CardsPorts {
  findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined;
  activeRuntimeFor(projectRoot: string): RuntimeKind | undefined;
  enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void;
  drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void>;
}

/** 应用卡呈现 + 申请生命周期 + 方案升级 + 任命/stable + run-change 卡（原 SessionManager 21 方法的同签名实现；本文件）。 */
export class Cards {
  readonly state: CardsState;
  private readonly refs: CardsRefs;
  private readonly port: CardsPorts;
  private readonly deps: SessionManagerDeps;
  private readonly evidence: Evidence;
  private readonly acceptance: AcceptanceFacts;
  private readonly fixedHooks: FixedCardHooks;
  constructor(refs: CardsRefs, port: CardsPorts, deps: SessionManagerDeps, evidence: Evidence, acceptance: AcceptanceFacts, fixedHooks: FixedCardHooks) {
    this.refs = refs;
    this.port = port;
    this.deps = deps;
    this.evidence = evidence;
    this.acceptance = acceptance;
    this.fixedHooks = fixedHooks;
    this.state = {
      planEscalations: new Map<string, Promise<void>>(),
      planEscalationPrompted: new Set<string>(),
      requestNotifiedKeys: new Set<string>(),
      requestPresentedKeys: new Set<string>(),
      versionDecisionPending: new Map<string, string>(),
      versionDecisionChains: new Map<string, Promise<void>>(),
      runChangeAutoPrompted: new Set<string>(),
    };
  }

  private get sessions(): ReadonlyMap<string, LiveSession> { return this.refs.sessions; }
  private get lastGovernanceRuntime(): ReadonlyMap<string, RuntimeKind> { return this.refs.lastGovernanceRuntime; }
  private get planEscalations(): Map<string, Promise<void>> { return this.state.planEscalations; }
  private get planEscalationPrompted(): Set<string> { return this.state.planEscalationPrompted; }
  private get requestNotifiedKeys(): Set<string> { return this.state.requestNotifiedKeys; }
  private get requestPresentedKeys(): Set<string> { return this.state.requestPresentedKeys; }
  private get runChangeAutoPrompted(): Set<string> { return this.state.runChangeAutoPrompted; }
  private get loadEffectiveConfig(): (opts: LoadConfigOptions) => Promise<LoadedConfig> { return this.refs.loadEffectiveConfig; }

  /* shared 同名同义委托（→ shared/*；与门面同名委托调用同一函数、同一入参）。 */
  private sessionKey(projectRoot: string, roleId: string, runtime: RuntimeKind): string { return sessionKey(projectRoot, roleId, runtime); }
  private now(): number { return now(this.deps); }
  private handbackOwnerRoleId(projectRoot: string): string | null { return handbackOwnerRoleId(projectRoot, this.deps); }
  private chiefTaskRoleIdOf(projectRoot: string): string | null { return chiefTaskRoleIdOf(projectRoot, this.deps); }
  private emitDeliveryNote(projectRoot: string, runtime: RuntimeKind, preferredRoleId: string | null, fallbackRoleId: string, summary: string): void {
    emitDeliveryNote(projectRoot, runtime, preferredRoleId, fallbackRoleId, summary, this.deps);
  }
  private async readTasks(projectRoot: string): Promise<TaskReplay> { return readTasks(projectRoot); }
  private async appendTaskState(projectRoot: string, event: TaskStateEvent): Promise<boolean> { return appendTaskState(projectRoot, event); }
  private appendRoleActivity(
    projectRoot: string,
    roleId: string,
    input: { kind: string; summary: string; tool?: string; status?: string; taskId?: string; turnId?: string; ref?: string },
  ): Promise<void> {
    return appendRoleActivity(projectRoot, roleId, input, { lastRoleActivity: this.refs.lastRoleActivity, now: () => this.now() });
  }

  /* 尚未迁出的门面方法端口（参数逐位原样转发）。 */
  private findLiveRuntime(projectRoot: string, roleId: string): RuntimeKind | undefined { return this.port.findLiveRuntime(projectRoot, roleId); }
  private activeRuntimeFor(projectRoot: string): RuntimeKind | undefined { return this.port.activeRuntimeFor(projectRoot); }
  private enqueueDelivery(projectRoot: string, targetRoleId: string, item: Omit<DeliveryItem, "enqueuedAt">): void { this.port.enqueueDelivery(projectRoot, targetRoleId, item); }
  private async drainQueue(projectRoot: string, targetRoleId: string | null, runtime: RuntimeKind): Promise<void> { return this.port.drainQueue(projectRoot, targetRoleId, runtime); }
  private collectFixedProposalDocumentRefs(projectRoot: string, flowId: string) { return this.evidence.collectFixedProposalDocumentRefs(projectRoot, flowId); }
  private prepareFixedAppointmentCardRequest(projectRoot: string, flowId: string, request: CustomerInputRequest) {
    return this.fixedHooks.prepareFixedAppointmentCardRequest(projectRoot, flowId, request);
  }
  private recordFixedCardWorkflowResolution(input: Parameters<FixedCardHooks["recordFixedCardWorkflowResolution"]>[0]): Promise<void> {
    return this.fixedHooks.recordFixedCardWorkflowResolution(input);
  }
  private enrichAcceptanceJudgeContext(
    projectRoot: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    sourceRoleId: string,
  ): Promise<{ metadata: CustomerInputMetadata | undefined; display?: AcceptanceReportDisplayV1 }> {
    return this.acceptance.enrichAcceptanceJudgeContext(projectRoot, request, metadata, sourceRoleId);
  }
  // —— interpretDirective（B5 自 session.ts 逐字搬移）——
  /**
   * 客户授权平面（2026-11-04 客户直修）：`@审批`/`@决策` 自然语言的**判断 AI 纯理解**入口。
   *
   * 只构造一次性只读解释会话（与「替我审批」/「替我决策」两个 judge 同一套 `runtimeOptions`/adapter
   * 工厂），不打开角色会话、不写聊天/账本、不改变任何权限；失败一律 `{ok:false}`（调用方回退现有面板）。
   * 引擎：请求显式 runtime > 该角色活会话引擎 > 本项目最近治理引擎；demo/未知 ⇒ unsupported-engine。
   */
  async interpretDirective(request: DirectiveInterpretRequest): Promise<DirectiveInterpretResult> {
    const diagnostic = createDiagnosticLogger({ component: "desktop.session.directive-interpreter" });
    if (request === null || typeof request !== "object") {
      return { ok: false, reasonCode: "context-missing", reason: "解释请求形状非法。" };
    }
    if (request.target !== "approval" && request.target !== "decision") {
      return { ok: false, reasonCode: "context-missing", reason: "解释请求缺少合法 target。" };
    }
    if (typeof request.body !== "string" || request.body.trim() === "") {
      return { ok: false, reasonCode: "context-missing", reason: "解释请求缺少正文。" };
    }
    const projectRoot = typeof request.projectRoot === "string" ? request.projectRoot.trim() : "";
    if (projectRoot === "") {
      return { ok: false, reasonCode: "context-missing", reason: "解释请求缺少项目根。" };
    }
    const explicitRuntime: RuntimeKind | undefined =
      typeof request.runtime === "string" && (RUNTIME_KINDS as readonly string[]).includes(request.runtime)
        ? (request.runtime as RuntimeKind)
        : undefined;
    const roleId = typeof request.roleId === "string" ? request.roleId : "";
    const runtime = explicitRuntime ?? this.findLiveRuntime(projectRoot, roleId) ?? this.lastGovernanceRuntime.get(projectRoot);
    if (runtime === undefined) {
      return { ok: false, reasonCode: "unavailable", reason: "没有可用的请求会话引擎，保持手动确认。" };
    }
    if (!DIRECTIVE_INTERPRET_SUPPORTED_RUNTIMES.has(runtime)) {
      return { ok: false, reasonCode: "unsupported-engine", reason: `当前引擎（${runtime}）不支持自动理解，保持手动确认。` };
    }
    const listing = this.deps.getListing(projectRoot);
    if (listing === undefined) {
      return { ok: false, reasonCode: "context-missing", reason: "项目尚未枚举（角色清单不可用），保持手动确认。" };
    }
    try {
      const { project } = await buildEffectiveProjectConfig(listing, {
        buildProjectConfig: this.deps.buildProjectConfig,
        loadEffectiveConfig: this.loadEffectiveConfig,
      });
      await this.deps.prepareRuntimeProfile?.(runtime);
      const runtimeOptions = this.deps.runtimeOptions;
      const adapterOptions = {
        ...runtimeOptions,
        ...(this.deps.shellGate !== undefined ? { shellGate: this.deps.shellGate } : {}),
      };
      const createAdapter = this.deps.createRuntimeAdapterFactory !== undefined
        ? this.deps.createRuntimeAdapterFactory(project, runtime, adapterOptions)
        : createRuntimeAdapterFactory(project, runtime, adapterOptions);
      const createInterpreter = this.deps.createDirectiveInterpreter ?? realCreateDirectiveInterpreter;
      const interpreter = createInterpreter({
        project,
        runtime,
        ...(runtimeOptions !== undefined ? { runtimeOptions } : {}),
        createAdapter,
      });
      return await interpreter({ ...request, projectRoot, roleId: roleId !== "" ? roleId : request.roleId, runtime });
    } catch (error) {
      diagnostic.error("directive-interpret.failed", error, { target: request.target, runtime });
      return { ok: false, reasonCode: "unavailable", reason: error instanceof Error ? error.message : String(error) };
    }
  }

  // —— requestRequirementChangeDecision（B5 自 session.ts 逐字搬移）——
  /**
   * **应用发起的需求变更审批卡**（2026-10-26 客户纠正）：把 `decision` 卡经**发起方会话的客户卡通道**
   * 呈现给客户/判断 agent（统筹与提案会话才有该通道）。返回：
   *  · `outcome`：卡片的最终结算（answered / declined / unavailable）——调用方据它更新票据/回执；
   *  · `first`：`{kind:"presented"}`（presenter 已成功推达，卡片进入独立审批）或
   *    `{kind:"outcome"}`（未呈现即已结算，如卡校验拒发/通道不可用/「替我决策」在呈现前代选）。
   * 工具回执据此区分「已提交独立审批」与「未提交」——绝不谎称已提交。
   * **发起方不能作答**：本方法只呈现；作答只来自客户（未勾选「替我决策」）或独立判断 agent。
   */
  requestRequirementChangeDecision(input: {
    projectRoot: string;
    roleId: string;
    runtime: RuntimeKind;
    request: CustomerInputRequest;
    metadata?: CustomerInputMetadata;
  }): {
    ok: true;
    outcome: Promise<CustomerInputOutcome>;
    first: Promise<{ kind: "presented" } | { kind: "outcome"; outcome: CustomerInputOutcome }>;
  } | { ok: false; error: string } {
    const entry = this.sessions.get(this.sessionKey(input.projectRoot, input.roleId, input.runtime));
    if (entry === undefined) {
      return { ok: false, error: "发起角色会话未开启，无法呈现需求变更审批卡" };
    }
    const channel = entry.requirementChangeCard;
    if (channel === undefined) {
      return { ok: false, error: "本会话未接入客户确认通道，无法呈现需求变更审批卡" };
    }
    let settleFirst: ((signal: { kind: "presented" } | { kind: "outcome"; outcome: CustomerInputOutcome }) => void) | undefined;
    let firstSettled = false;
    const first = new Promise<{ kind: "presented" } | { kind: "outcome"; outcome: CustomerInputOutcome }>((resolve) => {
      settleFirst = (signal) => {
        if (firstSettled) return;
        firstSettled = true;
        resolve(signal);
      };
    });
    const onPresented = (): void => settleFirst?.({ kind: "presented" });
    let outcome: Promise<CustomerInputOutcome>;
    try {
      outcome = Promise.resolve(channel(input.request, input.metadata, onPresented));
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    outcome.then(
      (settled) => settleFirst?.({ kind: "outcome", outcome: settled }),
      (error) => settleFirst?.({
        kind: "outcome",
        outcome: { outcome: "unavailable", reason: error instanceof Error ? error.message : String(error) },
      }),
    );
    return { ok: true, outcome, first };
  }

  // —— requestRunChangeDecision（B5 自 session.ts 逐字搬移）——
  /**
   * 2026-10-30（方案 v3 §3.1）：应用发起 run-change 卡（复用 decision，不新增 cardKind）。
   * 只由 app 发行；客户/judge 选择 continue-frozen/stop-and-restart/stop（或 approve/reject/cancel 回退）。
   * 2026-10-31（触发缺陷）：会话选择顺序扩展为 convener → rapporteur → chief（均需有客户卡通道）；
   * 无 pinned run / 无可呈现会话 / 无通道 ⇒ fail-closed（调用方回 `run-change-required` 结构化拒绝）。
   */
  async requestRunChangeDecision(input: {
    projectRoot: string;
    flowId: string;
    requestedBy?: "convener" | "planner" | "product";
    reason?: string;
    proposed?: { documents: Record<string, string>; schemas: Record<string, string> };
  }): Promise<
    | {
        ok: true;
        runId: string;
        outcome: Promise<CustomerInputOutcome>;
        first: Promise<{ kind: "presented" } | { kind: "outcome"; outcome: CustomerInputOutcome }>;
      }
    | { ok: false; error: string }
  > {
    const active = await findActiveRun(input.projectRoot, input.flowId);
    if (!active.ok) return { ok: false, error: active.reason };
    if (active.manifest === null || active.manifest.state !== "pinned") {
      return { ok: false, error: "当前 flow 没有 pinned run，不能发起 run-change" };
    }
    const preferred = [this.handbackOwnerRoleId(input.projectRoot), "rapporteur", this.chiefTaskRoleIdOf(input.projectRoot)]
      .filter((id): id is string => id !== null && id !== "");
    let selectedEntry: LiveSession | undefined;
    let bestRank = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.sessions) {
      if (!key.startsWith(`${input.projectRoot} `)) continue;
      if (entry.projectRoot !== input.projectRoot) continue;
      if (entry.requirementChangeCard === undefined) continue;
      if (selectedEntry === undefined) selectedEntry = entry;
      const rank = preferred.indexOf(entry.roleId);
      if (rank >= 0 && rank < bestRank) {
        bestRank = rank;
        selectedEntry = entry;
      }
    }
    if (selectedEntry === undefined || selectedEntry.requirementChangeCard === undefined) {
      return { ok: false, error: "没有可呈现 run-change 卡的统筹/提案会话（需先打开会话）" };
    }
    const currentDocs: Record<string, string> = {};
    for (const [kind, ref] of Object.entries(active.manifest.documents)) {
      if (ref !== null && ref !== undefined) currentDocs[kind] = ref.path;
    }
    const requestId = `run-change-${active.manifest.runId}`;
    const card = buildRunChangeCard({
      runId: active.manifest.runId,
      flowId: input.flowId,
      requestId,
      ...(input.requestedBy !== undefined ? { requestedBy: input.requestedBy } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      current: { state: active.manifest.state, documents: currentDocs, schemas: active.manifest.schemas },
      ...(input.proposed !== undefined ? { proposed: input.proposed } : {}),
    });
    const channel = selectedEntry.requirementChangeCard;
    let settleFirst: ((signal: { kind: "presented" } | { kind: "outcome"; outcome: CustomerInputOutcome }) => void) | undefined;
    let firstSettled = false;
    const first = new Promise<{ kind: "presented" } | { kind: "outcome"; outcome: CustomerInputOutcome }>((resolve) => {
      settleFirst = (signal) => {
        if (firstSettled) return;
        firstSettled = true;
        resolve(signal);
      };
    });
    const onPresented = (): void => settleFirst?.({ kind: "presented" });
    let rawOutcome: Promise<CustomerInputOutcome>;
    try {
      rawOutcome = Promise.resolve(channel(card.request, undefined, onPresented));
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    const outcome = rawOutcome.then(async (settled) => {
      if (settled.outcome !== "answered") {
        settleFirst?.({ kind: "outcome", outcome: settled });
        return settled;
      }
      const mode: RunChangeMode | undefined = mapRunChangeAnswer({
        ...(settled.value?.selected !== undefined ? { selected: settled.value.selected } : {}),
      });
      if (mode === undefined) {
        const unavailable: CustomerInputOutcome = { outcome: "unavailable", reason: "run-change 选择无法映射到唯一模式（fail-closed）" };
        settleFirst?.({ kind: "outcome", outcome: unavailable });
        return unavailable;
      }
      const newHashes: Record<string, string> = {};
      for (const [kind, rel] of Object.entries(input.proposed?.documents ?? {})) {
        try {
          newHashes[kind] = createHash("sha256").update(await fs.promises.readFile(path.join(input.projectRoot, rel))).digest("hex");
        } catch {
          /* 新文档不可读：不伪造 hash；apply 记录只带可读者。 */
        }
      }
      // Q9 A（2026-11-03）：三值归属——`directive:<id>` 先于 judge/customer；指令 id 只从 operatorId 解析。
      const runChangeDirectiveId = directiveIdFromOperatorId(settled.operatorId);
      const runChangeDecidedBy: VersionDecisionDecidedBy =
        runChangeDirectiveId !== undefined
          ? "directive"
          : settled.operatorId !== undefined && settled.operatorId.startsWith("judge:")
            ? "judge"
            : "customer";
      const applied = await applyRunChange(input.projectRoot, active.manifest!, {
        decisionId: settled.decisionId ?? `decision-${requestId}`,
        requestId,
        mode,
        decidedBy: runChangeDecidedBy,
        ...(runChangeDirectiveId !== undefined ? { directiveId: runChangeDirectiveId } : {}),
        ...(Object.keys(newHashes).length > 0 ? { newHashes } : {}),
      });
      if (!applied.ok) {
        const unavailable: CustomerInputOutcome = { outcome: "unavailable", reason: applied.reason };
        settleFirst?.({ kind: "outcome", outcome: unavailable });
        return unavailable;
      }
      settleFirst?.({ kind: "outcome", outcome: settled });
      return settled;
    });
    outcome.catch((error) => settleFirst?.({
      kind: "outcome",
      outcome: { outcome: "unavailable", reason: error instanceof Error ? error.message : String(error) },
    }));
    return { ok: true, runId: active.manifest.runId, outcome, first };
  }

  // —— pickGovernedCardEntry（B5 自 session.ts 逐字搬移）——
  /**
   * 治理会话客户卡通道选择（convener → rapporteur → chief；需本会话已构造 `governedCardContext`）。
   * 与 run-change 的会话选择同一顺序/同一呈现面；只选**已打开的治理会话**，不自动开会话。
   */
  pickGovernedCardEntry(projectRoot: string): LiveSession | undefined {
    const preferred = [this.handbackOwnerRoleId(projectRoot), "rapporteur", this.chiefTaskRoleIdOf(projectRoot)]
      .filter((id): id is string => id !== null && id !== "");
    let selected: LiveSession | undefined;
    let bestRank = Number.POSITIVE_INFINITY;
    for (const [key, candidate] of this.sessions) {
      if (!key.startsWith(`${projectRoot}\u0000`)) continue;
      if (candidate.projectRoot !== projectRoot) continue;
      if (candidate.governedCardContext === undefined) continue;
      if (selected === undefined) selected = candidate;
      const rank = preferred.indexOf(candidate.roleId);
      if (rank >= 0 && rank < bestRank) {
        bestRank = rank;
        selected = candidate;
      }
    }
    return selected;
  }

  // —— presentAppCard（B5 自 session.ts 逐字搬移）——
  /**
   * 应用自有卡的统一呈现（**客户本人**；`notify:"none"`；会话生命周期并入中止信号）：
   * · 只呈现，不代选/不改业务状态；无通道/无治理会话 ⇒ 返回 undefined（调用方 fail-closed）；
   * · `sourceRoleId:"application"`；`request.resolved.by` 只可能是 customer（主权卡在通道层排除
   *   judge/委托/`@决策`，`to*Outcome` 再做 operatorId/judge 二次校验）；
   * · 客户卡批准/拒绝**只经** `session:operator-response`，本方法不提供渲→主捷径。
   */
  async presentAppCard(input: {
    projectRoot: string;
    request: CustomerInputRequest;
    metadata?: CustomerInputMetadata;
    requestId: string;
    signal?: AbortSignal;
  }): Promise<CustomerInputOutcome | undefined> {
    const entry = this.pickGovernedCardEntry(input.projectRoot);
    if (entry === undefined || entry.governedCardContext === undefined || this.deps.customerInput === undefined) {
      return undefined;
    }
    const signals: AbortSignal[] = [entry.interactionState.lifetime.signal];
    if (input.signal !== undefined) signals.push(input.signal);
    try {
      const outcome = await this.withRequestLifecycle(
        input.projectRoot,
        "application",
        input.request,
        input.metadata,
        async (request, context, metadata) => this.deps.customerInput!(request, context, metadata),
        (request, extras) => entry.governedCardContext!(request, extras),
        input.requestId,
        { notify: "none", signal: AbortSignal.any(signals) },
      );
      return outcome ?? { outcome: "unavailable", reason: mainT("main.customerInput.presenterMissing") };
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot: input.projectRoot }).error("app-card.failed", error, {
        requestId: input.requestId,
      });
      return undefined;
    }
  }

  // —— presentVersionChangeCard（B5 自 session.ts 逐字搬移）——
  async presentVersionChangeCard(input: {
    projectRoot: string;
    record: VersionChangeRecord;
    signal?: AbortSignal;
  }): Promise<VcaCardOutcome> {
    const built = buildVersionChangeCard({ record: input.record });
    if (built === undefined) return { outcome: "unavailable" };
    const outcome = await this.presentAppCard({
      projectRoot: input.projectRoot,
      request: built.request,
      metadata: built.metadata,
      requestId: `vc-${input.record.applicationId}`,
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
    return toVersionChangeOutcome(outcome);
  }

  // —— presentAmendmentItemCard（B5 自 session.ts 逐字搬移）——
  async presentAmendmentItemCard(
    input: AmendmentItemPresentation & { projectRoot: string; signal?: AbortSignal },
  ): Promise<AmendmentItemOutcome> {
    const built = buildAmendmentItemCard({
      record: input.record,
      item: input.item,
      index: input.index,
      total: input.total,
      ...(input.acknowledgments !== undefined ? { acknowledgments: input.acknowledgments } : {}),
    });
    if (built === undefined) return { outcome: "unavailable" };
    const outcome = await this.presentAppCard({
      projectRoot: input.projectRoot,
      request: built.request,
      metadata: built.metadata,
      requestId: `vc-item-${input.applicationId}-${input.item.itemId}`,
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
    return toAmendmentItemOutcome(outcome, built.request);
  }

  // —— presentStableWriteCard（B5 自 session.ts 逐字搬移）——
  async presentStableWriteCard(input: {
    projectRoot: string;
    record: StableWriteRecord;
    preview: StableWritePreview;
    signal?: AbortSignal;
  }): Promise<StableWriteCardOutcome> {
    const built = buildStableWriteCard({ record: input.record, preview: input.preview });
    if (built === undefined) return { outcome: "unavailable" };
    const shape = validateStableWriteCardShape(built.request, input.preview);
    if (!shape.ok) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot: input.projectRoot }).record(
        "stable-write.card.invalid",
        { requestId: input.record.requestId, reason: shape.reason },
      );
      return { outcome: "unavailable" };
    }
    const outcome = await this.presentAppCard({
      projectRoot: input.projectRoot,
      request: built.request,
      metadata: built.metadata,
      requestId: `sw-card-${input.record.requestId}`,
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
    });
    return toStableWriteOutcome(outcome);
  }

  // —— noteVersionChange（B5 自 session.ts 逐字搬移）——
  noteVersionChange(projectRoot: string, summary: string): void {
    const chief = this.chiefTaskRoleIdOf(projectRoot);
    const runtime =
      (chief !== null ? this.findLiveRuntime(projectRoot, chief) : undefined) ??
      this.lastGovernanceRuntime.get(projectRoot) ??
      this.activeRuntimeFor(projectRoot) ??
      "demo";
    this.emitDeliveryNote(projectRoot, runtime, chief, chief ?? "chief", `[${mainT("ui.trunk.panelTitle")}] ${summary}`);
  }

  // —— noteVersionChangeInitiator（B5 自 session.ts 逐字搬移）——
  noteVersionChangeInitiator(projectRoot: string, roleId: string, summary: string): void {
    const runtime =
      this.findLiveRuntime(projectRoot, roleId) ??
      this.lastGovernanceRuntime.get(projectRoot) ??
      this.activeRuntimeFor(projectRoot) ??
      "demo";
    this.emitDeliveryNote(projectRoot, runtime, roleId, roleId, `[${mainT("ui.trunk.panelTitle")}] ${summary}`);
  }

  // —— reportPlanEscalation（B5 自 session.ts 逐字搬移）——
  /**
   * 方案升级报告（`report_plan_escalation` 落地）：只做校验/去重/发卡，**不派发、不改需求或验收标准**；
   * 卡由应用发行（application-owned decision），客户本人裁决；同一 flow 至多一张在途卡。
   * 返回 `presented` 只代表**已呈现/已发起呈现**，不代表客户结论（申请≠批准）。
   */
  async reportPlanEscalation(projectRoot: string, input: PlanEscalationInput, signal?: AbortSignal): Promise<PlanEscalationResult> {
    const roleId = typeof input?.roleId === "string" ? input.roleId : "";
    const flowId = typeof input?.flowId === "string" ? input.flowId.trim() : "";
    const summary = typeof input?.summary === "string" ? input.summary.trim() : "";
    const category = input?.category;
    if (roleId !== "convener") {
      return { ok: false, errorCode: "plan-escalation-role-not-allowed", message: "方案升级报告只能由 convener 会话提交。" };
    }
    if (flowId === "" || !GOVERNANCE_SLUG_RE.test(flowId) || summary === "" || !PLAN_ESCALATION_CATEGORIES.includes(category)) {
      return { ok: false, errorCode: "plan-escalation-invalid", message: "flowId/category/summary 非法（不猜测参数，未发卡）。" };
    }
    const key = `${projectRoot}\u0000${flowId}`;
    if (this.planEscalations.has(key)) {
      return { ok: false, errorCode: "plan-escalation-conflict", message: `flow ${flowId} 已有在途方案升级卡；客户未裁定前不重复提交。` };
    }
    const built = buildPlanEscalationCard({ flowId, category, summary });
    if (built === undefined) {
      return { ok: false, errorCode: "plan-escalation-invalid", message: "卡面字段缺失，未发卡。" };
    }
    const entry = this.pickGovernedCardEntry(projectRoot);
    if (entry === undefined || entry.governedCardContext === undefined || this.deps.customerInput === undefined) {
      return { ok: false, errorCode: "plan-escalation-channel-unavailable", message: "无客户卡通道（无已打开的治理会话）：方案升级卡未呈现；稍后可重试。" };
    }
    const requestId = `plan-escalation-${flowId}`;
    // 发卡与决策处理分离：工具调用立即返回 presented；决策经 afterPlanEscalation 如实回到运营/幕僚。
    const pending = this.presentAppCard({
      projectRoot,
      request: built.request,
      metadata: built.metadata,
      requestId,
      ...(signal !== undefined ? { signal } : {}),
    })
      .then((outcome) => this.afterPlanEscalation(projectRoot, { requestId, flowId }, outcome))
      .catch((error) => {
        createDiagnosticLogger({ component: "desktop.session", projectRoot }).error("plan-escalation.card.failed", error, { requestId });
      })
      .finally(() => {
        this.planEscalations.delete(key);
      });
    this.planEscalations.set(key, pending);
    // 升级卡已成功提交 ⇒ 清除该 flow 的「已提示」标记（下一次 blocked 可再提示；裁定前由在途卡节流）。
    this.planEscalationPrompted.delete(key);
    return { ok: true, requestId, status: "presented" };
  }

  // —— afterPlanEscalation（B5 自 session.ts 逐字搬移）——
  async afterPlanEscalation(
    projectRoot: string,
    input: { requestId: string; flowId: string },
    outcome: CustomerInputOutcome | null | undefined,
  ): Promise<void> {
    const convener = this.handbackOwnerRoleId(projectRoot) ?? "convener";
    const chief = this.chiefTaskRoleIdOf(projectRoot) ?? "chief";
    const notify = (roleId: string, text: string): void => {
      const runtime =
        this.findLiveRuntime(projectRoot, roleId) ??
        this.lastGovernanceRuntime.get(projectRoot) ??
        this.activeRuntimeFor(projectRoot) ??
        "demo";
      this.emitDeliveryNote(projectRoot, runtime, roleId, roleId, `[${mainT("ui.planEscalation.title")}] ${text}`);
    };
    if (outcome === null || outcome === undefined || outcome.outcome !== "answered") {
      const reason = outcome === null || outcome === undefined ? "unavailable" : outcome.outcome;
      notify(convener, mainT("main.planEscalation.notAnswered", { flowId: input.flowId, reason: String(reason) }));
      return;
    }
    const selected = Array.isArray(outcome.value?.selected) ? String(outcome.value.selected[0] ?? "") : "";
    let resultText: string;
    switch (selected) {
      case "escalation-revise":
        resultText = mainT("main.planEscalation.result.revise", { flowId: input.flowId });
        break;
      case "escalation-environment":
        resultText = mainT("main.planEscalation.result.environment", { flowId: input.flowId });
        break;
      case "escalation-continue":
        resultText = mainT("main.planEscalation.result.continue", { flowId: input.flowId });
        break;
      case "escalation-stop":
        resultText = mainT("main.planEscalation.result.stop", { flowId: input.flowId });
        break;
      default:
        resultText = mainT("main.planEscalation.result.unknown", { flowId: input.flowId, selected });
        break;
    }
    notify(convener, resultText);
    if (chief !== convener) notify(chief, resultText);
    if (selected === "escalation-revise") {
      // 「修订方案」⇒ 请策划（rapporteur）按客户裁定重做方案（投一条消息；不自动改方案/文档/验收标准）。
      const planner = "rapporteur";
      const runtime =
        this.findLiveRuntime(projectRoot, planner) ??
        this.lastGovernanceRuntime.get(projectRoot) ??
        this.activeRuntimeFor(projectRoot);
      if (runtime !== undefined) {
        // 运行时的投递政策（如生产宿主 `demoRuntimeAutoDeliver:false` 不自动开 demo 会话）由投递机统一裁决——
        // 本层不按 runtime 种类静默丢弃客户裁定；消息入队保留，不伪造已投递。
        const decisionKey = typeof outcome.decisionId === "string" && outcome.decisionId !== "" ? outcome.decisionId : input.requestId;
        const text = mainT("main.planEscalation.revisePrompt", { flowId: input.flowId, requestId: input.requestId });
        this.enqueueDelivery(projectRoot, planner, {
          kind: "message",
          runtime,
          targetRoleId: planner,
          sourceRoleId: convener,
          text,
          summary: shortenSummary(text, 120),
          dedupKey: `${projectRoot}\u0000plan-escalation\u0000${input.flowId}\u0000${decisionKey}`,
        });
        void this.drainQueue(projectRoot, planner, runtime);
      }
    }
  }

  // —— activeRunViews（B5 自 session.ts 逐字搬移）——
  /**
   * 2026-10-31（run-change 触发缺陷）：当前项目的 active run（draft/pinned）只读摘要——供桌面
   * 「契约变更 · 重开 run」入口判断是否可用（无 pinned run 时禁用并给原因）。
   * 只读 manifest；不读正文、不改状态、不伪装 pinned。
   */
  async activeRunViews(projectRoot: string): Promise<{ ok: true; runs: ActiveRunView[] } | { ok: false; error: string }> {
    const listed = await listRunManifestsResult(projectRoot);
    if (!listed.ok) return { ok: false, error: listed.reason };
    return {
      ok: true,
      runs: listed.manifests
        .filter((manifest) => manifest.state === "draft" || manifest.state === "pinned")
        .map((manifest) => ({
          runId: manifest.runId,
          flowId: manifest.flowId,
          state: manifest.state === "pinned" ? "pinned" : "draft",
          ...(manifest.pinnedAt !== undefined ? { pinnedAt: manifest.pinnedAt } : {}),
          ...(manifest.rosterVersion !== undefined ? { rosterVersion: manifest.rosterVersion } : {}),
          ...(manifest.roles !== undefined ? { roles: [...manifest.roles] } : {}),
          documents: pinnedDocsSummary(manifest),
        })),
    };
  }

  // —— proposalCardFrozenRejection（B5 自 session.ts 逐字搬移）——
  /**
   * 冻结 run 上出现**比 pin 更新的提案卡**时的识别（`cardKind=proposal`）：提案卡意味着要对新版本
   * 提案作答，而冻结语义规定 active run 不激活新版本 ⇒ 先尝试 run-change 卡，本提案卡以
   * `run-change-required` 三段式拒发（`notPresented`，不冒充客户拒绝）。
   * 无 pinned run / 提案版本不高于 pin ⇒ undefined（零行为变化）。
   */
  async proposalCardFrozenRejection(
    projectRoot: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    sourceRoleId?: string,
  ): Promise<{ rejection: MechanicalRejection; presented: boolean } | undefined> {
    if (request.cardKind !== "proposal") return undefined;
    const flowId = request.flowId ?? metadata?.flowId;
    if (typeof flowId !== "string" || flowId.trim() === "") return undefined;
    const active = await findActiveRun(projectRoot, flowId);
    if (!active.ok || active.manifest === null || active.manifest.state !== "pinned") return undefined;
    const newer = await findNewerContractDocs(projectRoot, active.manifest);
    const proposalDoc = newer.find((doc) => doc.kind === "proposal");
    if (proposalDoc === undefined) return undefined;
    return this.offerRunChangeOnFrozenContract({
      projectRoot,
      flowId,
      manifest: active.manifest,
      newer,
      reason: `提案卡引用了比 pin 更新的提案（${proposalDoc.path}，v${proposalDoc.version} > pin v${proposalDoc.pinnedVersion ?? "?"}）；当前 run 已冻结，新版本不激活`,
      missing: `当前 run 冻结基线内的提案版本（磁盘 ${proposalDoc.path} v${proposalDoc.version} > pin v${proposalDoc.pinnedVersion ?? "?"}）`,
      requestedBy: "planner",
      ...(sourceRoleId !== undefined ? { noteRoleId: sourceRoleId } : {}),
    });
  }

  // —— pendingVersionChangesFor（B5 自 session.ts 逐字搬移）——
  /**
   * AC-17（D2）：当前项目在途 VCA（submitted/approved）。查询失败 ⇒ fail-closed（调用方抑制自动
   * run-change）；无版本变更栈（未接）⇒ 空（旧行为零变化）。
   */
  async pendingVersionChangesFor(
    projectRoot: string,
  ): Promise<{ ok: true; pending: Array<{ applicationId: string; status: string }> } | { ok: false; reason: string }> {
    const stack = this.deps.getVersionChangeStack?.(projectRoot);
    if (stack === undefined) return { ok: true, pending: [] };
    try {
      const records = await stack.listVersionChanges();
      return {
        ok: true,
        pending: records
          .filter((record) => record.status === "submitted" || record.status === "approved")
          .map((record) => ({ applicationId: record.applicationId, status: record.status })),
      };
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot }).error(
        "version-change.pending.read.failed",
        error,
      );
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  // —— offerRunChangeOnFrozenContract（B5 自 session.ts 逐字搬移）——
  /**
   * 2026-10-31：呈现 run-change 卡（同一 run 自动仅一次）+ 组装 `run-change-required` 三段式。
   * 冻结语义不变——调用方仍拒绝原操作；客户决定后按 continue-frozen / stop-and-restart / stop 继续。
   * AC-17（D2）：修订/VCA 在途（submitted/approved）⇒ **抑制自动 offer**（不占用自动提示名额，
   * 不弹 run-change 卡；显式低层入口 `requestRunChangeDecision` 不受影响）；VCA 结束后下一次
   * 冻结冲突自动 offer 恢复。
   */
  async offerRunChangeOnFrozenContract(input: {
    projectRoot: string;
    flowId: string;
    manifest: RunManifest;
    newer: NewerContractDoc[];
    reason: string;
    /** 三段式 missing 用（「拒绝：缺少 …」通顺的名词短语）；缺省回退 reason。 */
    missing?: string;
    requestedBy?: "convener" | "planner" | "product";
    /** AC-17：系统行落位（来源角色；缺省 chief）。 */
    noteRoleId?: string;
  }): Promise<{ rejection: MechanicalRejection; presented: boolean }> {
    // AC-17（D2）：在途 VCA 抑制自动 run-change offer；不写 `runChangeAutoPrompted`，VCA 结束后可恢复。
    const inFlight = await this.pendingVersionChangesFor(input.projectRoot);
    if (!inFlight.ok || inFlight.pending.length > 0) {
      const detail = inFlight.ok
        ? inFlight.pending
            .map(
              (entry) =>
                `${entry.applicationId} (${mainT(
                  entry.status === "approved"
                    ? "ui.versionChange.status.approved"
                    : "ui.versionChange.status.submitted",
                )})`,
            )
            .join("、")
        : inFlight.reason;
      const reason = inFlight.ok
        ? `${mainT("ui.versionChange.entry")} · ${detail} — ${mainT("ui.versionChange.submitGuidance")}`
        : mainT("ui.versionChange.disabledUnknown", { detail });
      const runtime =
        (input.noteRoleId !== undefined ? this.findLiveRuntime(input.projectRoot, input.noteRoleId) : undefined) ??
        this.lastGovernanceRuntime.get(input.projectRoot) ??
        "demo";
      this.emitDeliveryNote(
        input.projectRoot,
        runtime,
        input.noteRoleId ?? null,
        "chief",
        `[${mainT("ui.trunk.panelTitle")}] ${reason}`,
      );
      return {
        rejection: makeMechanicalRejection("run-change-required", [reason], {
          action: `${mainT("ui.versionChange.entry")}: ${mainT("ui.versionChange.submitGuidance")}`,
          docs: input.newer.map((doc) => doc.path).slice(0, 5),
        }),
        presented: false,
      };
    }
    const key = `${input.projectRoot}\u0000${input.manifest.runId}`;
    const proposedDocs: Record<string, string> = {};
    for (const doc of input.newer) proposedDocs[doc.kind] = doc.path;
    let presented = false;
    if (!this.runChangeAutoPrompted.has(key)) {
      this.runChangeAutoPrompted.add(key);
      const started = await this.requestRunChangeDecision({
        projectRoot: input.projectRoot,
        flowId: input.flowId,
        ...(input.requestedBy !== undefined ? { requestedBy: input.requestedBy } : {}),
        reason: input.reason,
        ...(Object.keys(proposedDocs).length > 0 ? { proposed: { documents: proposedDocs, schemas: {} } } : {}),
      });
      if (!started.ok) {
        // 没有可呈现会话 ⇒ 不占用「已自动提示」名额：打开统筹/提案/幕僚会话后，下次冻结冲突仍可自动弹。
        this.runChangeAutoPrompted.delete(key);
      } else {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
          timer = setTimeout(() => resolve({ kind: "timeout" }), 1500);
        });
        const first = await Promise.race([started.first, timeout]);
        if (timer !== undefined) clearTimeout(timer);
        presented = first.kind === "presented" || (first.kind === "outcome" && first.outcome.outcome === "answered");
      }
    }
    const pinnedRosterPath = input.manifest.documents.roster !== null && input.manifest.documents.roster !== undefined
      ? input.manifest.documents.roster.path
      : undefined;
    const docs = [
      ...input.newer.map((doc) => doc.path),
      ...(pinnedRosterPath !== undefined ? [pinnedRosterPath] : []),
    ].slice(0, 5);
    const rejection = makeMechanicalRejection("run-change-required", [input.missing ?? input.reason], {
      action: presented
        ? "应用已向客户呈现 run-change 卡（继续冻结 / 停止并重开 run / 停止）；由客户选择模式，决定后按新模式继续。"
        : "客户可在会话头点击「契约变更 · 重开 run」发起 run-change（继续冻结 / 停止并重开 run / 停止）；若无可呈现会话，先打开统筹/提案/幕僚会话再重试。",
      docs,
    });
    return { rejection, presented };
  }

  // —— requestIdFor（B5 自 session.ts 逐字搬移）——
  requestIdFor(projectRoot: string, sourceRoleId: string, request: CustomerInputRequest, metadata?: CustomerInputMetadata): string {
    const options = request.kind === "choice" ? request.options.map((option) => `${option.id}:${option.label}:${option.recommended === true ? "1" : "0"}`).join("|") : "";
    const digest = createHash("sha256")
      .update([
        projectRoot,
        sourceRoleId,
        metadata?.turnId ?? "",
        metadata?.toolCallId ?? "",
        request.kind,
        request.title,
        options,
      ].join("\u0000"))
      .digest("hex")
      .slice(0, 16);
    return `req-${digest}`;
  }

  // —— notifyRequest（B5 自 session.ts 逐字搬移）——
  notifyRequest(
    projectRoot: string,
    requestId: string,
    sourceRoleId: string,
    title: string,
    event: "created" | "presented" | "resolved",
    detail?: string,
    after?: Promise<unknown>,
  ): Promise<void> {
    const key = `${requestId}\u0000${event}`;
    if (this.requestNotifiedKeys.has(key)) return Promise.resolve();
    this.requestNotifiedKeys.add(key);
    if (this.requestNotifiedKeys.size > 5000) {
      const oldest = this.requestNotifiedKeys.values().next().value;
      if (oldest !== undefined) this.requestNotifiedKeys.delete(oldest);
    }
    const write = after !== undefined
      ? after.then(() => this.appendTaskState(projectRoot, taskEvent("request.notified", { requestId, to: "chief", event }, () => new Date(this.now()))))
      : this.appendTaskState(projectRoot, taskEvent("request.notified", { requestId, to: "chief", event }, () => new Date(this.now())));
    const labels: Record<typeof event, string> = { created: "已提交", presented: "已呈现", resolved: "已裁决" };
    const text = `[系统·申请] ${labels[event]}：角色「${sourceRoleId}」的申请「${shortenSummary(title, 80)}」（#${requestId}）${detail !== undefined && detail !== "" ? `｜${shortenSummary(detail, 120)}` : ""}。申请保持原发起者与回报链；裁决者以结果来源为准。`;
    try {
      const target = this.chiefTaskRoleIdOf(projectRoot) ?? this.handbackOwnerRoleId(projectRoot) ?? "";
      const targetRuntime = this.findLiveRuntime(projectRoot, target) ?? this.lastGovernanceRuntime.get(projectRoot) ?? "demo";
      this.deps.emitEvent({
        roleId: target,
        projectRoot,
        runtime: targetRuntime,
        event: { kind: "message", summary: text, detail: { source: "request-notified" } },
      });
    } catch (error) {
      createDiagnosticLogger({ component: "desktop.session", projectRoot, roleId: sourceRoleId }).error("request.notify.failed", error);
    }
    return write.then(() => undefined, () => undefined);
  }

  // —— recordRequestPresented（B5 自 session.ts 逐字搬移）——
  async recordRequestPresented(projectRoot: string, requestId: string, sourceRoleId: string, title: string, to: "customer" | "judge" | "chief", notify = true): Promise<void> {
    const key = `${requestId}\u0000${to}`;
    if (this.requestPresentedKeys.has(key)) return;
    this.requestPresentedKeys.add(key);
    await this.appendTaskState(projectRoot, taskEvent("request.presented", { requestId, to }, () => new Date(this.now())));
    if (notify) await this.notifyRequest(projectRoot, requestId, sourceRoleId, title, "presented", to === "chief" ? "幕僚委托" : to === "judge" ? "判断 agent" : "客户");
  }

  // —— appointmentWriteApplicationRejection（B5 自 session.ts 逐字搬移）——
  /**
   * C-06（方案 §6.4.1/R2）：`appointment-write` 的**应用侧**事实校验（新路径）。
   *
   * 旧 flow 路径（带合法 `flowId` 且未给 targetRoleId/decisionId）逐字保持既有行为（D 批收敛）。
   * 新路径（无 flow，用 intentId/taskId 归属）必须满足：
   *  · `targetRoleId` 为非内置项目角色、`decisionId` 非空；
   *  · 声明写入路径全部位于 `角色卡/<targetRoleId>/`；
   *  · `.ans/state/tasks.jsonl` 存在对应 D3 `request.resolved`：`decisionId` 相符、`targetRoleIds`
   *    含目标、且 `intentId|taskId` 与本次申请至少一项相符（D3 记录至少带一项）。
   * 任一不满足 ⇒ 返回拒绝原因；调用方**不发卡、不写请求事件、不发行写入路径**（fail-closed）。
   * 本函数只读 `.ans/state/tasks.jsonl`（app-only），不读账本、不写账本。
   */
  async appointmentWriteApplicationRejection(
    projectRoot: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
  ): Promise<string | undefined> {
    if (request.cardKind !== "appointment-write") return undefined;
    const targetRoleId = typeof metadata?.targetRoleId === "string" ? metadata.targetRoleId.trim() : "";
    const decisionId = typeof metadata?.decisionId === "string" ? metadata.decisionId.trim() : "";
    const rawFlowId = request.flowId ?? metadata?.flowId;
    const legacyFlow = typeof rawFlowId === "string" && rawFlowId.trim() !== "";
    if (legacyFlow && targetRoleId === "" && decisionId === "") return undefined;
    // 新路径必须至少带一个归属键（run-role 同样 fail-closed；应用层在此再兜一次，避免直调包装器绕过）。
    if (!legacyFlow && metadata?.intentId === undefined && metadata?.taskId === undefined) {
      return "appointment-write 新路径缺少归属键（flowId / intentId / taskId 至少一个）；未向客户发卡、未发行任何写入路径。";
    }
    if (targetRoleId === "") {
      return "appointment-write 新路径缺少 targetRoleId（D3 目标项目角色）；未向客户发卡、未发行任何写入路径。";
    }
    if (targetRoleId.includes("/") || targetRoleId.includes("\\") || targetRoleId === "." || targetRoleId === "..") {
      return `appointment-write 的 targetRoleId 非法：${targetRoleId}；未向客户发卡、未发行任何写入路径。`;
    }
    if (isBuiltInGovernanceRoleId(targetRoleId)) {
      return `appointment-write 的 targetRoleId=${targetRoleId} 是内置治理角色/su（禁止）；未向客户发卡、未发行任何写入路径。`;
    }
    if (decisionId === "") {
      return "appointment-write 新路径缺少 decisionId（D3 request.resolved 决定 id）；未向客户发卡、未发行任何写入路径。";
    }
    const paths = declaredConfirmPaths(request);
    if (paths.length === 0) {
      return "appointment-write 必须声明至少一个实际写入路径（paths 或 preview 路径锚点）；未向客户发卡。";
    }
    const prefix = `角色卡/${targetRoleId}/`;
    const outside = paths.filter((rel) => !rel.startsWith(prefix));
    if (outside.length > 0) {
      return (
        `appointment-write 声明路径不在 角色卡/${targetRoleId}/ 之内：${outside.slice(0, 4).join("、")}` +
        `${outside.length > 4 ? ` 等 ${outside.length} 条` : ""}；未向客户发卡、未发行任何写入路径。`
      );
    }
    const state = await this.readTasks(projectRoot);
    // 归属匹配也接受 **flowId**（D3 request.created.flowId）：真实链的人事卡只带 flowId 时，
    // appointment-write 仅凭 flowId+decisionId+targetRoleId 也能对上（不强迫模型猜 intentId/taskId）。
    const requestFlows = new Map<string, string | undefined>();
    for (const event of state.events) {
      if (event.kind === "request.created") requestFlows.set(event.requestId, event.flowId);
    }
    const resolvedEvent = state.events.find((event) => {
      if (event.kind !== "request.resolved") return false;
      const record = event as unknown as {
        decisionId?: unknown;
        targetRoleIds?: unknown;
        intentId?: unknown;
        taskId?: unknown;
      };
      if (record.decisionId !== decisionId) return false;
      if (!Array.isArray(record.targetRoleIds) || !record.targetRoleIds.includes(targetRoleId)) return false;
      const resolvedIntent = typeof record.intentId === "string" ? record.intentId : undefined;
      const resolvedTask = typeof record.taskId === "string" ? record.taskId : undefined;
      const eventFlow = requestFlows.get(event.requestId);
      if (rawFlowId !== undefined && eventFlow !== undefined && eventFlow !== rawFlowId) return false;
      if (metadata?.taskId !== undefined) return resolvedTask === metadata.taskId;
      if (metadata?.intentId !== undefined) return resolvedIntent === metadata.intentId;
      return eventFlow !== undefined || resolvedIntent !== undefined || resolvedTask !== undefined;
    });
    if (resolvedEvent === undefined) {
      return (
        `appointment-write 未找到匹配的 D3 裁决：request.resolved（decisionId=${decisionId}、` +
        `targetRoleIds 含 ${targetRoleId}、intentId/taskId 一致）不存在；未向客户发卡、未发行任何写入路径。` +
        "请先由人事发起 D3 并取得客户/判断裁决后，再逐次写卡。"
      );
    }
    // 2026-10-29（方案 v2.1 §5.4/M11）：D3 若是新链记录（带名单版本/hash），必须与**当前最新名单**一致；
    // 名单已变 ⇒ 旧 D3 作废（需重新发起 D3）。旧记录（无字段）保持既有行为（兼容/回滚测试）。
    if (resolvedEvent.kind === "request.resolved") {
      const stamped = resolvedEvent as { rosterVersion?: unknown; rosterSha256?: unknown };
      if (stamped.rosterVersion !== undefined || stamped.rosterSha256 !== undefined) {
        const rosterFlow = rawFlowId ?? (typeof metadata?.flowId === "string" ? metadata.flowId : undefined) ?? request.flowId;
        if (typeof rosterFlow !== "string" || rosterFlow.trim() === "") {
          return "appointment-write 无法定位最新名单（缺 flowId）；未向客户发卡、未发行任何写入路径。";
        }
        const roster = await loadLatestRoster({ projectRoot, flowId: rosterFlow });
        if (!roster.ok) {
          return (
            `appointment-write 无法读取最新名单（${roster.reason}）；未向客户发卡、未发行任何写入路径。` +
            "请先让策划产出合法名单并重新发起 D3。"
          );
        }
        if (stamped.rosterVersion !== roster.version || stamped.rosterSha256 !== roster.sha256) {
          return (
            `appointment-write 的 D3 对应名单与当前最新名单不一致（D3 v${String(stamped.rosterVersion ?? "?")} / ` +
            `最新 v${roster.version}），旧 D3 已作废；未向客户发卡、未发行任何写入路径。请重新发起 D3 后再写卡。`
          );
        }
        // 2026-10-29（v2.18）：名单未省略 env-bootstrap 时，D3 不得取消它；取消须先出新名单版本并移除 env/entry 模块。
        const rosterHasEnv = roster.roster.roles.some((role) => role.id === ENV_BOOTSTRAP_ROLE_ID);
        const targets = Array.isArray((resolvedEvent as { targetRoleIds?: unknown }).targetRoleIds)
          ? ((resolvedEvent as { targetRoleIds?: unknown[] }).targetRoleIds ?? []).filter((id): id is string => typeof id === "string")
          : [];
        if (
          rosterHasEnv &&
          roster.roster.envBootstrap?.omitted !== true &&
          !targets.includes(ENV_BOOTSTRAP_ROLE_ID)
        ) {
          return (
            `appointment-write 被拒：D3 未选中标准角色 ${ENV_BOOTSTRAP_ROLE_ID}，但当前名单未声明省略理由；` +
            "取消 env-bootstrap 须先出带 envBootstrapOmittedReason 的新名单版本并移除 env/entry 模块，再重新发起 D3。"
          );
        }
      }
    }
    return undefined;
  }

  // —— withRequestLifecycle（B5 自 session.ts 逐字搬移）——
  /**
   * C 批：申请生命周期（created → presented(customer|judge) → resolved → notified 幕僚）。
   * 只记录/通知，不改变通道裁决；工具调用结束后结果仍原样返回发起角色。
   */
  async withRequestLifecycle(
    projectRoot: string,
    sourceRoleId: string,
    request: CustomerInputRequest,
    metadata: CustomerInputMetadata | undefined,
    raw: (request: CustomerInputRequest, context: Parameters<DesktopCustomerInputFn>[1], metadata?: CustomerInputMetadata) => Promise<CustomerInputOutcome | null | undefined> | CustomerInputOutcome | null | undefined,
    buildContext: (request: CustomerInputRequest, extras?: { onPresented?: () => void; acceptanceReport?: AcceptanceReportDisplayV1; judgeNotice?: string }) => Parameters<DesktopCustomerInputFn>[1],
    requestIdOverride?: string,
    lifecycle?: {
      notify?: "default" | "resolved-only" | "none";
      signal?: AbortSignal;
      /** 下载卡事实不可用时附在客户卡上的提示（其他卡种不传）。 */
      judgeNotice?: string;
      /** 卡片实际呈现（客户或 judge）后回调一次（下载 presenter 用它上报 requestId）。 */
      onPresented?: () => void;
    },
  ): Promise<CustomerInputOutcome | null | undefined> {
    // 2026-10-29（Q6 A）：验收卡的最小链事实由应用补充（产品意图/名单/D3/质检报告）。
    // 2026-11-02 acceptance-return-card（C2）：同一次读取的 16 KiB 安全投影随 ctx 送渲染层。
    let acceptanceReport: AcceptanceReportDisplayV1 | undefined;
    if (request.cardKind === "acceptance") {
      const enriched = await this.enrichAcceptanceJudgeContext(projectRoot, request, metadata, sourceRoleId);
      metadata = enriched.metadata;
      acceptanceReport = enriched.display;
    }
    // T3 B3（AC-13/§8.1–§8.3）：fixed 卡的应用绑定——`documentRefs`（应用计算 path+sha256[+version]）、
    // `workflowId`/`stage` 戳、任命卡选项=名单/multiple/推荐集=名单顺序、验收卡抑制。模式按本卡实际
    // flowId 现场解析（per-flow，不缓存）；绑定失败 ⇒ notPresented（不发卡、不写账本、不冒充客户拒绝）。
    // **只对 3 张 fixed 卡 + acceptance 卡**做模式解析：其他卡种（decision/download/stable-write/
    // merge-main/appointment-write 等）保持既有呈现时序（零新增 await；legacy 卡路径逐字不变）。
    let fixedCardBinding: { workflowId?: string; stage?: WorkflowStage; documentRefs?: WorkflowDocumentRef[] } | undefined;
    const cardFlowId = request.flowId ?? metadata?.flowId;
    const fixedCardKind = request.cardKind === "intent-confirm" || request.cardKind === "proposal"
      || request.cardKind === "appointment" || request.cardKind === "acceptance";
    const cardFixed = fixedCardKind
      && typeof cardFlowId === "string" && cardFlowId.trim() !== ""
      && (await resolveFixedPathMode(projectRoot, cardFlowId.trim())) === "fixed";
    if (cardFixed) {
      const fixedFlowId = cardFlowId!.trim();
      const rejectFixedCard = (code: string, message: string): CustomerInputOutcome => {
        this.appendRoleActivity(projectRoot, sourceRoleId, {
          kind: "request.rejected",
          summary: shortenSummary(`${code}：${message}`, 200),
          status: "not-presented",
        });
        return { outcome: "declined", notPresented: true, reason: `${code}：${message}` };
      };
      if (request.cardKind === "acceptance") {
        // Q1：固定路径**不发** acceptance 卡（legacy 保留；验收 = 独立质检 + 幕僚决策 + 应用归档）。
        return rejectFixedCard("acceptance-card-suppressed", "固定路径不发验收卡：验收报告由验收角色提交，应用生成 docs/acceptance 归档。");
      }
      const fixedWorkflowId = await activeFixedWorkflowIdFor(projectRoot, fixedFlowId);
      if (request.cardKind === "intent-confirm") {
        const prepared = await prepareFixedIntent({ projectRoot, flowId: fixedFlowId });
        if (!prepared.ok) return rejectFixedCard(prepared.code, prepared.message);
        fixedCardBinding = {
          ...(fixedWorkflowId !== undefined ? { workflowId: fixedWorkflowId } : {}),
          stage: "A3",
          documentRefs: prepared.documentRefs,
        };
        // T3 B3.1（去重）：run-role 已在 fixed intent-confirm 调用同一个 `prepareIntent` 并把 marker
        // 追加到 `question`（同一 marker 字符串）。桌面只在卡面尚未携带该 marker 时补一次——
        // `prepareIntent` 本身幂等（A3 在办即跳过 `stage.requested`），但 marker 不得重复追加。
        const requestQuestion = (request as { question?: unknown }).question;
        const cardText = `${typeof requestQuestion === "string" ? requestQuestion : ""}\n${request.preview ?? ""}`;
        if (!cardText.includes(prepared.marker)) {
          const priorPreview = request.preview ?? "";
          request = { ...request, preview: `${priorPreview}${priorPreview !== "" ? "\n\n" : ""}${prepared.marker}` };
        }
      } else if (request.cardKind === "proposal") {
        const refs = await this.collectFixedProposalDocumentRefs(projectRoot, fixedFlowId);
        if (!refs.ok) return rejectFixedCard(refs.code, refs.message);
        // T3 B5.1/B15.2（G-B5-3，AC-08/AC-13；v1.3 §4.2 A6）：**呈卡前**写 `stage.requested A6`
        // （幂等 `stage-request:<wf>:A6:<attempt>`，requestDigest=方案依据（proposal）字节 sha256）。
        // B15.2（RR10）：fail-closed——无活动 workflow、A5 未 completed、A6 在办/已完成均拒绝发卡；
        // 否则客户 accept 后 `stage.completed A6`（要求 view.stage==="A6"）无法落账，且会重复弹卡。
        const proposalRef = refs.refs.find((ref) => ref.kind === "proposal");
        if (proposalRef?.sha256 === undefined) {
          return rejectFixedCard("proposal-document-missing", "方案卡绑定缺少 proposal sha256（不发卡）。");
        }
        if (fixedWorkflowId === undefined) {
          return rejectFixedCard("workflow-not-found", "方案卡不可呈：flow 没有活动 fixed workflow（不发卡）。");
        }
        const marker = await markFixedProposalCardRequested({
          projectRoot,
          flowId: fixedFlowId,
          workflowId: fixedWorkflowId,
          proposalSha256: proposalRef.sha256,
        });
        if (marker !== undefined) return rejectFixedCard(marker.code, marker.message);
        fixedCardBinding = {
          workflowId: fixedWorkflowId,
          stage: "A6",
          documentRefs: refs.refs,
        };
      } else if (request.cardKind === "appointment") {
        const appointment = await this.prepareFixedAppointmentCardRequest(projectRoot, fixedFlowId, request);
        if (!appointment.ok) return rejectFixedCard(appointment.code, appointment.message);
        request = appointment.request;
        fixedCardBinding = {
          ...(fixedWorkflowId !== undefined ? { workflowId: fixedWorkflowId } : {}),
          stage: "A10",
          documentRefs: [appointment.rosterRef],
        };
        // T3 B3.1（A10 在办标记单一写入方）：`stage.requested A10` 由 run-role 在呈卡前经
        // `stage-request:<wf>:A10:1` 幂等写入（编排 B3.1）；桌面**不重复写**任何 stage/事件——
        // 这里只做卡面绑定，裁决后的 `stage.completed A10` 由 `recordFixedCardWorkflowResolution` 唯一追加。
      }
    }
    // 2026-10-31（run-change 触发）：冻结 run 上出现比 pin 更新的提案卡 ⇒ 先尝试 run-change 卡，
    // 本提案卡以 run-change-required 三段式拒发（未呈现；不冒充客户拒绝、不改冻结语义）。
    // T3 B3：fixed 路径**不调用** legacy `proposalCardFrozenRejection`（run pin 不存在；由 documentRefs 绑定替代）。
    if (request.cardKind === "proposal" && !cardFixed) {
      const frozen = await this.proposalCardFrozenRejection(projectRoot, request, metadata, sourceRoleId);
      if (frozen !== undefined) {
        const formatted = formatMechanicalRejection(frozen.rejection);
        this.appendRoleActivity(projectRoot, sourceRoleId, {
          kind: "request.rejected",
          summary: shortenSummary(`run-change-required：${frozen.rejection.missing.join("；")}`, 200),
          status: "not-presented",
        });
        return { outcome: "declined", notPresented: true, reason: formatted };
      }
    }
    const requestId = requestIdOverride ?? this.requestIdFor(projectRoot, sourceRoleId, request, metadata);
    const options = request.kind === "choice"
      ? request.options.map((option) => ({ id: option.id, label: option.label, ...(option.recommended === true ? { recommended: true } : {}) }))
      : [];
    // C-06：appointment-write 先在应用层校验 D3 事实；失败**不创建请求事件/不呈现卡片**（fail-closed）。
    if (request.cardKind === "appointment-write") {
      const rejection = await this.appointmentWriteApplicationRejection(projectRoot, request, metadata);
      if (rejection !== undefined) {
        this.appendRoleActivity(projectRoot, sourceRoleId, {
          kind: "request.rejected",
          summary: rejection,
          status: "not-presented",
        });
        return { outcome: "declined", notPresented: true, reason: rejection };
      }
    }
    // **呈现不得等待落盘**（D1「调用即呈现」+ 同一轮 signal 身份）：事件写入先发起、后串行收口，
    // 但 `raw`（客户卡通道）在首次 await 前同步调用——否则调用方会在卡片出现前看到 pending 空档，
    // 会话被释放时还会把原本有效的轮次 signal 误判为已中止。落盘顺序仍为
    // created → approval.created → presented → resolved（每一步 `.then` 接力）。
    const createdWrite = this.appendTaskState(projectRoot, taskEvent("request.created", {
      requestId,
      ...(request.flowId !== undefined ? { flowId: request.flowId } : {}),
      // 2026-10-31（D3 卡种收口）：卡种由应用从 request 对象落账（不信任模型/judge 自报）。
      ...(request.cardKind !== undefined ? { cardKind: request.cardKind } : {}),
      // T3 B3（AC-13）：fixed 卡的应用绑定（documentRefs 由应用计算；workflowId/stage 戳）。
      ...(fixedCardBinding?.documentRefs !== undefined ? { documentRefs: fixedCardBinding.documentRefs } : {}),
      ...(fixedCardBinding?.workflowId !== undefined ? { workflowId: fixedCardBinding.workflowId } : {}),
      ...(fixedCardBinding?.stage !== undefined ? { stage: fixedCardBinding.stage } : {}),
      ...(metadata?.intentId !== undefined ? { intentId: metadata.intentId } : {}),
      ...(metadata?.taskId !== undefined ? { taskId: metadata.taskId } : {}),
      sourceRoleId,
      title: request.title,
      ...(request.kind === "choice" && request.question !== undefined ? { context: request.question } : {}),
      options,
      ...(options.some((option) => option.recommended === true) ? { recommended: options.filter((option) => option.recommended === true).map((option) => option.id) } : {}),
    }, () => new Date(this.now())));
    const approvalWrite = request.cardKind === "appointment-write"
      ? createdWrite.then(() => this.appendTaskState(projectRoot, taskEvent("approval.created", {
          approvalId: requestId,
          sourceRoleId,
          approvalKind: "appointment-write",
          summary: shortenSummary(request.title, 200),
          ...(request.kind === "confirm" && request.paths !== undefined ? { declaredPaths: [...request.paths] } : {}),
          ...(metadata?.toolCallId !== undefined ? { toolCallId: metadata.toolCallId } : {}),
          ...(metadata?.turnId !== undefined ? { turnId: metadata.turnId } : {}),
        }, () => new Date(this.now()))))
      : Promise.resolve(true);
    const notifyMode = lifecycle?.notify ?? "default";
    const notifyCreated = notifyMode === "default";
    const notifyResolved = notifyMode !== "none";
    const abortSignal = lifecycle?.signal;
    let aborted = abortSignal?.aborted === true;
    let abortListener: (() => void) | undefined;
    const abortPromise: Promise<"aborted"> | undefined = abortSignal === undefined
      ? undefined
      : new Promise<"aborted">((resolve) => {
          if (abortSignal.aborted) {
            aborted = true;
            resolve("aborted");
            return;
          }
          abortListener = () => {
            aborted = true;
            resolve("aborted");
          };
          abortSignal.addEventListener("abort", abortListener, { once: true });
        });
    const createdNotify = notifyCreated
      ? this.notifyRequest(projectRoot, requestId, sourceRoleId, request.title, "created", undefined, createdWrite)
      : Promise.resolve();
    let presented = false;
    let presentedWrite: Promise<void> | null = null;
    let presentedNotified = false;
    const notifyPresented = (): void => {
      if (presentedNotified) return;
      presentedNotified = true;
      try {
        lifecycle?.onPresented?.();
      } catch {
        // 呈现回调只服务审计/下载 presenter 的 requestId 上报；异常不得影响已完成的呈现/结算。
      }
    };
    const markPresented = (to: "customer" | "judge" | "chief"): Promise<void> => {
      if (aborted) return Promise.resolve();
      if (presentedWrite !== null) return presentedWrite;
      presented = true;
      presentedWrite = createdWrite.then(() => this.recordRequestPresented(projectRoot, requestId, sourceRoleId, request.title, to, notifyCreated));
      return presentedWrite;
    };
    const context = buildContext(request, {
      onPresented: () => {
        void markPresented("customer");
        notifyPresented();
      },
      ...(acceptanceReport !== undefined ? { acceptanceReport } : {}),
      ...(lifecycle?.judgeNotice !== undefined ? { judgeNotice: lifecycle.judgeNotice } : {}),
    });
    context.requestId = requestId;
    const abortedOutcome: CustomerInputOutcome = {
      outcome: "declined",
      operatorId: "system:initiator-aborted",
      reason: "initiator-aborted",
      notPresented: true,
    };
    const appendAborted = async (): Promise<void> => {
      await createdWrite;
      if (presentedWrite !== null) await presentedWrite;
      if (await createdWrite) {
        await this.appendTaskState(projectRoot, taskEvent("request.orphaned", { requestId, reason: "initiator-aborted" }, () => new Date(this.now())));
      }
    };
    let out: CustomerInputOutcome | null | undefined;
    let abortedBeforeSettle = false;
    try {
      let rawPromise: Promise<CustomerInputOutcome | null | undefined>;
      try {
        rawPromise = Promise.resolve(raw(request, context, metadata));
      } catch (error) {
        rawPromise = Promise.reject(error);
      }
      if (abortPromise !== undefined) {
        const winner = await Promise.race([
          rawPromise.then((value) => ({ kind: "outcome" as const, value })),
          abortPromise.then(() => ({ kind: "aborted" as const })),
        ]);
        if (winner.kind === "aborted") {
          abortedBeforeSettle = true;
          // 晚到答案只进诊断；不等待、不写 resolved、不执行。
          void rawPromise.catch(() => undefined);
          createDiagnosticLogger({ component: "desktop.session", projectRoot }).record("request.aborted", { requestId, sourceRoleId });
        } else {
          out = winner.value;
        }
      } else {
        out = await rawPromise;
      }
    } catch (error) {
      if (aborted || abortSignal?.aborted === true) {
        await appendAborted();
        throw error;
      }
      await createdWrite;
      await createdNotify;
      if (presentedWrite !== null) await presentedWrite;
      await this.appendTaskState(projectRoot, taskEvent("request.resolved", {
        requestId,
        ...(request.cardKind !== undefined ? { cardKind: request.cardKind } : {}),
        by: "customer",
        choice: "unavailable",
        reason: shortenSummary(error instanceof Error ? error.message : String(error), 200),
      }, () => new Date(this.now())));
      if (notifyResolved) await this.notifyRequest(projectRoot, requestId, sourceRoleId, request.title, "resolved", "通道异常（未执行）");
      throw error;
    } finally {
      if (abortListener !== undefined) abortSignal?.removeEventListener("abort", abortListener);
    }
    if (abortedBeforeSettle) {
      await appendAborted();
      return abortedOutcome;
    }
    await createdWrite;
    await approvalWrite;
    await createdNotify;
    if (aborted || abortSignal?.aborted === true) {
      await appendAborted();
      return abortedOutcome;
    }
    const chiefSource = out !== null && out !== undefined && out.outcome !== "unavailable"
      && out.actionSource?.kind === "chief-delegated" ? out.actionSource : undefined;
    const answeredOut = out !== null && out !== undefined && out.outcome === "answered" ? out : undefined;
    const operatorId = out !== null && out !== undefined && "operatorId" in out && typeof out.operatorId === "string" ? out.operatorId : undefined;
    // Q9 A（2026-11-03）：指令归属只从 `operatorId:"directive:<id>"` 解析；不伪造 `request.presented.to`
    // （W-6：presented 仍仅 customer/judge；指令代选/拒绝在呈现之前完成）。
    const directiveId = directiveIdFromOperatorId(operatorId);
    const judgeOrigin =
      directiveId === undefined && typeof operatorId === "string" && operatorId.startsWith("judge:");
    const judged =
      directiveId === undefined &&
      answeredOut !== undefined &&
      (answeredOut.judge !== undefined || judgeOrigin);
    // 2026-11-04 下载申请（AC-21）：下载卡的 judge **deny** 也是 judge 归属（declined 路径原先只认
    // answered，会误写成 customer 且不记 presented）。限定 cardKind==="download"，其他卡种行为不变。
    const downloadJudge = request.cardKind === "download" && judgeOrigin;
    const resolvedByJudge = judged || downloadJudge;
    if (chiefSource !== undefined && !presented) {
      await markPresented("chief");
      notifyPresented();
    } else if (resolvedByJudge && !presented && (answeredOut !== undefined || downloadJudge)) {
      await markPresented("judge");
      notifyPresented();
    } else if (presentedWrite !== null) await presentedWrite;
    const choice = answeredOut !== undefined
      ? (answeredOut.value.confirmed === true ? "confirmed" : answeredOut.value.confirmed === false ? "denied" : (answeredOut.value.selected ?? []).join(",") || "answered")
      : out?.outcome ?? "unavailable";
    const selected = answeredOut?.value.selected ?? [];
    // 2026-10-29（方案 v2.1 §5.4/M4/M11）：裁决 id 回填给工具回执（appointment-write 的凭据）；
    // 招人卡同时记录**当前最新名单**的版本与 hash（应用计算，模型不可自报）。
    const decisionId = answeredOut !== undefined && chiefSource === undefined ? `decision-${requestId}` : undefined;
    if (answeredOut !== undefined && chiefSource !== undefined) delete answeredOut.decisionId;
    if (answeredOut !== undefined && decisionId !== undefined) answeredOut.decisionId = decisionId;
    let rosterStamp: { rosterVersion?: number; rosterSha256?: string } = {};
    if (request.cardKind === "appointment" && answeredOut !== undefined) {
      const rosterFlow = request.flowId ?? metadata?.flowId;
      if (typeof rosterFlow === "string" && rosterFlow.trim() !== "") {
        const roster = await loadLatestRoster({ projectRoot, flowId: rosterFlow });
        if (roster.ok) rosterStamp = { rosterVersion: roster.version, rosterSha256: roster.sha256 };
      }
    }
    const resolvedEvent = taskEvent("request.resolved", {
      requestId,
      ...(decisionId !== undefined ? { decisionId } : {}),
      // T3 B3：fixed appointment 决议**不带 legacy roster 戳**（结构性不可被 legacy D3 reader 当作 D3
      // 证据）；固定 Appointment 以 `workflowId`/`stage:"A10"` 标记（AC-13/G-10）。
      ...(request.cardKind === "appointment" && !cardFixed ? rosterStamp : {}),
      // 2026-10-31（D3 卡种收口）：只有 appointment（D3 招人）卡的选中项是角色集；其他 choice 卡
      // （decision/intent-confirm/proposal/acceptance/普通卡）只写审计字段 selectedOptionIds，
      // 防止选项 id（如 customer-local）污染 targetRoleIds 而被 D3 扫描误读。
      ...(request.cardKind !== undefined ? { cardKind: request.cardKind } : {}),
      ...(fixedCardBinding?.documentRefs !== undefined ? { documentRefs: fixedCardBinding.documentRefs } : {}),
      ...(fixedCardBinding?.workflowId !== undefined ? { workflowId: fixedCardBinding.workflowId } : {}),
      ...(fixedCardBinding?.stage !== undefined ? { stage: fixedCardBinding.stage } : {}),
      // T3 B3.1（AC-13/§8.3；运行时核心 B3.1 类型）：fixed 任命决议**原样**落 `source:"stage-a10"`。
      // 应用写入（不信任模型/判断自报）；legacy 任命决议无此字段——legacy D3 读取方不接受该来源
      // （`chainDispatchFacts` 显式排除；固定决议另有 `workflowId` 戳与省略 roster 戳双重隔离）。
      ...(cardFixed && request.cardKind === "appointment" ? { source: "stage-a10" as const } : {}),
      ...(selected.length > 0 && request.cardKind === "appointment" ? { targetRoleIds: selected } : {}),
      ...(selected.length > 0 && request.cardKind !== "appointment" ? { selectedOptionIds: selected } : {}),
      ...(metadata?.intentId !== undefined ? { intentId: metadata.intentId } : {}),
      ...(metadata?.taskId !== undefined ? { taskId: metadata.taskId } : {}),
      by: chiefSource !== undefined ? "chief-delegated" : directiveId !== undefined ? "directive" : resolvedByJudge ? "judge" : "customer",
      ...(chiefSource !== undefined ? { actionSource: chiefSource } : {}),
      ...(directiveId !== undefined ? { directiveId } : {}),
      ...(operatorId !== undefined ? { operatorId } : {}),
      choice,
      ...(out?.outcome === "declined" && out.reason !== undefined ? { reason: shortenSummary(out.reason, 200) } : {}),
      ...(judged && answeredOut?.judge !== undefined ? { judge: answeredOut.judge } : {}),
    }, () => new Date(this.now()));
    await this.appendTaskState(projectRoot, resolvedEvent);
    // T3 B3（AC-08/AC-13）：fixed 卡裁决 → 工作流阶段事件（A3/A6/A10；应用唯一实现）。
    // 失败只诊断/系统行（不重写 request.resolved、不阻塞已完成的客户决定）。
    if (cardFixed && fixedCardBinding?.workflowId !== undefined) {
      await this.recordFixedCardWorkflowResolution({
        projectRoot,
        sourceRoleId,
        flowId: cardFlowId!.trim(),
        workflowId: fixedCardBinding.workflowId,
        requestId,
        resolvedEvent,
        answered: answeredOut !== undefined,
        judged: resolvedByJudge,
        documentRefs: fixedCardBinding.documentRefs ?? [],
      });
    }
    if (request.cardKind === "appointment-write") {
      await this.appendTaskState(projectRoot, taskEvent("approval.resolved", {
        approvalId: requestId,
        by: judged ? "judge" : "customer",
        ...(operatorId !== undefined ? { operatorId } : {}),
        decision: choice,
        ...(out?.outcome === "declined" && out.reason !== undefined ? { reason: shortenSummary(out.reason, 200) } : {}),
        ...(judged && answeredOut?.judge !== undefined ? { judge: answeredOut.judge } : {}),
      }, () => new Date(this.now())));
    }
    if (notifyResolved) await this.notifyRequest(projectRoot, requestId, sourceRoleId, request.title, "resolved", resolvedByJudge ? `判断代批：${choice}` : choice);
    return out;
  }

}
