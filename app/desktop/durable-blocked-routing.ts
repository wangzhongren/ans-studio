import path from "node:path";
import { stat } from "node:fs/promises";
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
import { DURABLE_EVIDENCE_AUDIT_EXECUTOR } from "../../src/model/durable-workflow.ts";
import type { DurableA11Disposition, DurableImplementationItem, DurablePendingTask, DurableProjection, DurableResult, DurableVerificationCapabilitySnapshot, DurableVerificationPlan, DurableVerificationPreflightFn } from "../../src/model/durable-workflow.ts";
import type { CustomerInputRequest, ImplementationSelfTestObservation } from "../../src/model/runtime.ts";
import type { ImplementationRetestGuard } from "../../src/pipeline/orchestration/run-role.ts";
import { implementationTestRulesText, verifyImplementationRetestInputs } from "../../src/pipeline/orchestration/durable-workflow.ts";
import { BLOCKED_SCOPE_CARD_KIND, durableDecisionProvenance, type ChiefDecisionExecutor, type DesktopCustomerInputFn } from "./customer-input.ts";
import { a11ResumeKey, graphTurn, operationsTasks, preflightDesktopImplementationOwner, workflowTaskEffectMatches } from "./durable-workflow-a.ts";
import { durableHash, workspacePreparationSummary, type DesktopDurableWorkflow } from "./durable-workflow.ts";
import type { SessionManagerDeps } from "./session/contracts/deps.ts";
import type { LiveSession } from "./session/contracts/session-types.ts";
import { isRuntimeKind } from "./runtime-config.ts";
import { observeA11Git, recoverA11Index, sameA11GitSnapshot, type A11IndexExpectation } from "./workflow-git.ts";
import { prepareDesktopAcceptanceWorkspace } from "./durable-acceptance-workspace.ts";

export const A11_STOP_COMMAND = "/停止本次工作流";

async function unavailableA11RetestCommand(projectRoot: string, candidateOid: string, modulePaths: readonly string[],
  requirements: DurableVerificationPlan["requirements"]): Promise<string | undefined> {
  for (const { id, command } of requirements) {
    if (!command) continue;
    const result = await verifyImplementationRetestInputs(projectRoot, candidateOid, modulePaths, command);
    if (!result.ok) return `签发要求 ${id}：${result.message}`;
    const entry = command[0]!;
    if (path.isAbsolute(entry) && !(await stat(entry).catch(() => undefined))?.isFile()) {
      return `签发要求 ${id} 的执行入口 ${entry} 当前不可用。`;
    }
  }
}

export async function preflightDesktopA11RetestDelivery(store: Awaited<ReturnType<DesktopDurableWorkflow["store"]>>,
  view: DurableProjection, disposition: DurableA11Disposition): Promise<string | undefined> {
  const checked = await store.readEvidence(view.projectRoot, disposition.standard.path);
  if (!checked.ok || checked.value.sha256 !== disposition.standard.sha256) return "送达前无法重新核验原签发标准的当前字节。";
  const observation = await observeA11Git(view.projectRoot);
  if (observation.branch !== disposition.branch || observation.head !== disposition.candidateOid || !observation.indexDigest
    || !observation.worktreeDigest || observation.lock || observation.trackedDirty || observation.stagedPaths.length
    || !observation.untrackedPaths || observation.untrackedPaths.length) return "送达前无法重新核验原候选及干净的实际 Git 索引和工作区。";
  const owner = operationsTasks(view).children.find(child => child.taskId === disposition.childTask.taskId
    && child.roleId === disposition.childTask.roleId && child.workOrder?.digest === disposition.workOrderDigest);
  if (!owner?.workOrder || !disposition.retest) return "送达前无法核对当前补测工单和原属主。";
  return unavailableA11RetestCommand(view.projectRoot, disposition.candidateOid, owner.workOrder.paths, disposition.retest.missingRequirements);
}

export async function reconcileDesktopA11Disposition(durable: DesktopDurableWorkflow, view: DurableProjection,
  deps: SessionManagerDeps, key: string): Promise<DurableProjection | undefined> {
  const prior = view.a11Disposition!;
  const { projectRoot, ref } = view;
  const store = await durable.store();
  const registration = deps.getRegisteredProjectLifecycle?.(projectRoot);
  const parked = () => {
    const active = store.lookup(ref);
    return registration && deps.getRegisteredProjectLifecycle?.(projectRoot)?.selectionId === registration.selectionId
      && active?.status === "waiting" && active.engine === "healthy" && active.stepId === view.stepId && active.attempt === view.attempt
      && active.a11Disposition?.state === "parked" && active.a11Disposition.key === prior.key ? active : undefined;
  };
  if (!parked()) return;
  if (prior.retest) {
    const fresh = await observeA11Git(projectRoot);
    const child = operationsTasks(view).children.find(task => task.taskId === prior.childTask.taskId);
    const paths = child?.workOrder?.paths;
    const owner = child && paths && await preflightDesktopImplementationOwner(projectRoot, child.roleId, paths, deps);
    const runtime = view.metadata.runtime;
    const unavailable = !owner?.ok || !paths ? "当前项目无法核对原工作项的批准属主和写域。"
      : prior.retest.pendingReportReview ? undefined
        : !isRuntimeKind(runtime) || runtime === "demo" || !deps.shellGate && (!deps.shellArming || !deps.shellOperatorChannel)
        ? "当前宿主未装配受治理的真实 Shell 执行及审批。"
        : !deps.readDurableReports ? "当前宿主未装配可恢复核验的正式角色回交。"
          : await unavailableA11RetestCommand(projectRoot, prior.candidateOid, paths, prior.retest.missingRequirements);
    const observed = await store.observeA11Disposition(ref, prior.key,
      sameA11GitSnapshot(prior.observation, fresh) ? prior.observation : fresh, () => !!parked(), { unavailable });
    const active = parked();
    if (!observed.ok || !active) return;
    const current = () => {
      const latest = parked();
      return latest?.a11Disposition?.generation === observed.value.generation && latest.blockedRouting?.decision?.option !== "stop";
    };
    if (current() && !unavailable && (!observed.value.resumeExhausted || observed.value.retest?.pendingReportReview) && observed.value.standardState === "verified"
      && (!observed.value.confirmation || active.blockedRouting?.decision?.option === "wait")) {
      const resumed = await store.resumeA11Disposition(ref, prior.key, fresh, current, {});
      if (resumed.ok) { durable.activate(); return; }
    }
    return parked();
  }
  const receipt = () => store.listEffects(ref, "a11-index-recovery").find(effect => effect.intent.key === key);
  const fresh = await observeA11Git(projectRoot, prior.recovery?.paths);
  const observed = receipt()?.state === "claimed" ? { ok: true as const, value: prior }
    : await store.observeA11Disposition(ref, prior.key,
      sameA11GitSnapshot(prior.observation, fresh) ? prior.observation : fresh, () => !!parked());
  const active = parked();
  if (!observed.ok || !active) return;
  const disposition = observed.value;
  const current = () => {
    const latest = parked();
    return latest?.a11Disposition?.generation === disposition.generation && latest.blockedRouting?.decision?.option !== "stop";
  };
  const expected = receipt()?.intent.expected;
  const known = expected && typeof expected.branch === "string" && typeof expected.head === "string"
    && typeof expected.beforeIndex === "string" && typeof expected.afterIndex === "string" && typeof expected.worktreeDigest === "string"
    && Array.isArray(expected.paths) && typeof expected.lockPid === "string" && typeof expected.lockFileId === "string"
    ? expected as A11IndexExpectation : undefined;
  const settle = async (observation: Awaited<ReturnType<typeof observeA11Git>> | undefined) => {
    const effect = receipt();
    if (!effect) return false;
    if (effect.state === "succeeded") return !!observation;
    if (!observation && effect.state !== "claimed") return true;
    const outcome = observation && { branch: observation.branch, head: observation.head, indexDigest: observation.indexDigest,
      worktreeDigest: observation.worktreeDigest };
    if (outcome && (!outcome.branch || !outcome.head || !outcome.indexDigest || !outcome.worktreeDigest)) return false;
    const saved = await store.settleEffect(ref, { key, token: effect.token, outcome: observation ? "succeeded" : "unknown",
      evidence: observation ? "Verified the retained Git refs, candidate, complete index and worktree after-image."
        : "The retained Git refs, candidate or complete index state could not be proven.",
      ...(outcome ? { result: { branch: outcome.branch!, head: outcome.head!, indexDigest: outcome.indexDigest!,
        worktreeDigest: outcome.worktreeDigest! } } : {}) });
    return saved.ok;
  };
  const child = operationsTasks(active).children.find(task => task.taskId === disposition.childTask.taskId);
  let actual = disposition.observation;
  const owner = child?.workOrder && await preflightDesktopImplementationOwner(projectRoot, child.roleId, child.workOrder.paths, deps);
  if (current() && owner?.ok && disposition.standardState === "verified" && !disposition.resumeExhausted
    && (!disposition.confirmation || active.blockedRouting?.decision?.option === "wait")
    && (disposition.recovery || !fresh.stagedPaths.length)) {
    actual = await recoverA11Index({ projectRoot, branch: disposition.branch, head: disposition.candidateOid,
      recovery: disposition.recovery, expected: known, isCurrent: current, settle,
      allowManualWithExisting: active.blockedRouting?.decision?.option === "wait" && receipt()?.state !== "claimed",
      claim: async intent => {
        const operation = { key, kind: "a11-index-recovery" as const, stepId: active.stepId, attempt: active.attempt,
          task: disposition.childTask, expected: intent };
        const result = receipt() ? await store.retryA11RecoveryEffect(ref, operation, current)
          : await store.claimA11RecoveryEffect(ref, operation, current);
        return result.ok && result.value.execute;
      },
      resume: async observation => {
        const resumed = await store.resumeA11Disposition(ref, disposition.key, observation, current);
        if (resumed.ok) durable.activate();
        return resumed.ok;
      },
    });
  } else if (current() && !owner?.ok) {
    actual = { ...actual, reason: "当前项目无法核对原工作项的批准属主和写域。" };
  }
  if (!parked()) return;
  await settle(undefined);
  await store.observeA11Disposition(ref, disposition.key, actual, current);
  return parked();
}

export async function openWorkflowStopConfirmation(durable: DesktopDurableWorkflow, projectRoot: string,
  isCurrent: () => boolean): Promise<DurableResult<true>> {
  const store = await durable.store();
  const parked = (await store.listProjections(projectRoot)).filter(view => view.status === "waiting" && view.engine === "healthy"
    && (view.a11Disposition?.state === "parked" || !!view.blockedRouting?.a12bPrepareKey)
    && (view.blockedRouting?.decision?.option === "wait" || view.a11Disposition?.confirmation === "stop"
      || view.acceptanceWorkspace?.preparation?.confirmation === "stop"));
  if (!isCurrent() || parked.length !== 1) return { ok: false, code: "workflow-stop-unavailable",
    message: "当前项目必须有一个已选等待的工作流，才能打开停止确认。" };
  const view = parked[0]!;
  const preparation = view.blockedRouting?.a12bPrepareKey;
  if (preparation) {
    const task = view.pendingTasks?.find(item => item.taskId === view.acceptanceWorkspace?.basis.assessmentTask.taskId && item.state === "pending");
    if (task) await prepareDesktopAcceptanceWorkspace(store, view, task);
    const requested = await store.requestAcceptancePreparationStop(view.ref, preparation, isCurrent);
    if (!requested.ok) return requested;
    durable.activate();
    return { ok: true, value: true };
  }
  const disposition = view.a11Disposition!;
  const fresh = await observeA11Git(projectRoot, disposition.recovery?.paths);
  const observed = await store.observeA11Disposition(view.ref, disposition.key,
    sameA11GitSnapshot(fresh, disposition.observation) ? disposition.observation : fresh, isCurrent);
  if (!observed.ok) return observed;
  const requested = await store.requestA11DispositionStop(view.ref, disposition.key, isCurrent);
  if (!requested.ok) return requested;
  durable.activate();
  return { ok: true, value: true };
}

export function desktopVerificationPreflight(deps: SessionManagerDeps, runtime: RuntimeKind): DurableVerificationPreflightFn {
  return async input => {
    const roles = deps.getListing(input.projectRoot)?.roles.filter(role => role.roleId === input.roleId);
    if (roles?.length !== 1) {
      return { ok: false, code: "workflow-verification-role-unavailable", message: "当前项目无法唯一核对独立验收的实际属主。" };
    }
    const realRuntime = runtime !== "demo";
    const shellWired = realRuntime && (!!deps.shellGate || !!deps.shellArming && !!deps.shellOperatorChannel);
    return { ok: true, value: { stage: input.stage, status: [
      { capability: "module-inspection", status: "available", reason: "仅按实际任务和原角色权限读取与核对模块资料。" },
      { capability: "module-shell", status: shellWired ? "available" : "unavailable", reason: shellWired
        ? "仅工作项自己的自测。每条命令仍经原 Shell 审批、审计与受治理隔离。" : "当前运行时未装配受治理的 Shell 审批。" },
      { capability: "governed-commit", status: shellWired ? "available" : "unavailable", reason: shellWired
        ? "真实工作项开通后按批准写域和 Git 作用核验提交。" : "当前运行时无法通过原受治理 Shell 核对应交付。" },
      ...(input.ref.executor === DURABLE_EVIDENCE_AUDIT_EXECUTOR ? [
        { capability: "external-execution" as const, status: "unavailable" as const, reason: "当前宿主没有能证明实际运行对象和同一会话来源的外部执行通道。" },
        { capability: "approved-build" as const, status: "unavailable" as const,
          reason: "当前工具尚无法将实际批准的构建进程与其产物路径及字节摘要绑定为受信证据。" },
      ] : [
        { capability: "workspace-build" as const, status: "unavailable" as const, reason: "升级宿主只承认原账本实际构建回执。" },
        { capability: "workspace-preview" as const, status: "unavailable" as const, reason: "升级宿主只承认原账本实际预览回执。" },
        { capability: "workspace-browser" as const, status: "unavailable" as const, reason: "升级宿主只承认原账本实际浏览器证据与关闭回执。" },
      ]),
    ] } };
  };
}

export async function holdDesktopUnavailableAssessment(durable: DesktopDurableWorkflow, view: DurableProjection, pending: DurablePendingTask,
  deps: SessionManagerDeps, runtime: RuntimeKind, notice: (code: string, message: string) => Promise<void>): Promise<boolean> {
  const plan = view.verificationPlan;
  if (!view.blockedRoutingEnabled || !plan || pending.capability !== "independent-assessment") return false;
  const store = await durable.store();
  const registration = deps.getRegisteredProjectLifecycle?.(view.projectRoot);
  const isCurrent = () => {
    const live = store.lookup(view.ref);
    return !!registration && deps.getRegisteredProjectLifecycle?.(view.projectRoot)?.selectionId === registration.selectionId
      && live?.status === "waiting" && live.engine === "healthy" && live.stepId === view.stepId && live.attempt === view.attempt
      && live.pendingTasks?.some(task => task.taskId === pending.taskId && task.roleId === pending.roleId && task.state === "pending") === true;
  };
  if (!isCurrent()) return true;
  if (store.listEffects(view.ref, "model-send").some(effect => workflowTaskEffectMatches(effect, pending))) return false;
  if (!pending.reviewWritePath || !view.baseline) {
    await notice("workflow-verification-capabilities-missing", "当前独立验收缺实际角色写域或基线核对。");
    return true;
  }
  const preflight = desktopVerificationPreflight(deps, runtime);
  const checked = await preflight({ ref: view.ref, projectRoot: view.projectRoot, roleId: pending.roleId, taskId: pending.taskId,
    stepId: pending.stepId, attempt: pending.attempt, flowId: pending.flowId, stage: "A12b", path: pending.reviewWritePath,
    baselineOid: view.baseline.oid, proposalDecisionDigest: view.proposalDecision?.selectionDigest });
  if (!checked.ok) {
    await notice(checked.code, checked.message);
    return true;
  }
  const unavailable = checked.value.status.find(row => row.status === "unavailable"
    && plan.requirements.some(item => item.stage === "A12b" && item.capability === row.capability));
  if (!unavailable) return !isCurrent();
  const prepared = await store.prepareBlockedScopeChange(view.ref, { task: pending.task, document: plan.standard, capability: unavailable.capability,
    reason: unavailable.reason ?? "当前应用未提供签发标准要求的可核验能力。" }, isCurrent, preflight);
  if (prepared.ok) durable.activate();
  else await notice(prepared.code, prepared.message);
  return true;
}

export function verificationStandardPrompt(snapshot: DurableVerificationCapabilitySnapshot | undefined, workItems?: readonly DurableImplementationItem[]): string {
  if (!snapshot) return "";
  const audit = snapshot.status.some(row => row.capability === "external-execution" || row.capability === "approved-build");
  const status = snapshot.status.map(row => `${row.capability}: ${row.status}${row.reason ? `（${row.reason}）` : ""}`).join("\n");
  const approved = workItems?.map(item => `${item.id}（${item.roleId}，${item.paths.join("、")}）`).join("、");
  return `\n应用已核对本次正式标准任务的宿主能力。\n${status}\n` +
    "正式标准保留唯一 final ans-criteria/v1 区块。在同文件 YAML 前置区写 verificationRequirements 数组。每项使用区块里的实际 id、stage（A11 或 A12b）、capability 和 evidence 数组。" +
    "每个条目至少一项要求，每个 P0 必须有 A12b 独立验收项。A11 项须用 workItemId 绑定实际批准的工作项；A12b 无 workItemId。需要绑定明确的模块自测命令时，可用 command 写字面 argv。" +
    (approved ? `本轮应用已核对的实施工作项：${approved}。` : "") +
    (audit
      ? "每个 A12b 项还要写实际行为 behavior 和绑定来源 source。module-inspection 使用 candidate-file、evidence: [file] 和字面 paths；module-shell 使用 task-command、[command-receipt] 和准确 command；governed-commit 使用 candidate-commit、[git-commit]；approved-build 使用 task-command、[command-receipt, file]、准确 command 和预期产物 paths；external-execution 使用 external-session、[execution-session]。实际执行需求仍照实签发。取证由运营派原已批准角色，A12b 只读审计。\n" +
        '格式示例（替换为本标准的真实条目、行为及文件）：{id: AC-1, stage: A12b, capability: module-inspection, behavior: "核对交付入口", source: candidate-file, evidence: [file], paths: [src/main.js]}。'
      : "原冻结标准按原能力与证据类型核对；已退役能力只核对原账本事实。") +
    "写完完整标准后提交 completed，evidence 列实际标准文件的裸相对路径，summary 说明要求、可用能力与限制。这里的 completed 只确认标准已编制，实际签发、实操与验收结论由后续各自核对。";
}

export function verificationAssessmentPrompt(plan: DurableVerificationPlan | undefined): string {
  if (!plan) return "";
  const checks = plan.requirements.filter(item => item.stage === "A12b").map(item => `${item.id} ${item.capability}（${item.evidence.join("、")}）`);
  return `\n本次 A12b 独立验收使用冻结标准 ${plan.standard.path}，SHA-256 ${plan.standard.sha256}。实际核对 ${checks.join("；")}。` +
    "请逐条报告当期实际结果，并引用当前候选已登记的实际物证。所有独立条目实际通过时，在正式报告 YAML 前置区以 verifiedCriteria 数组列出全部通过的实际条目 ID。";
}

export function observeImplementationSelfTest(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined,
  selectionId: () => string | undefined = () => undefined) {
  const getTurn = graphTurn(durable, session);
  return async (observation: ImplementationSelfTestObservation) => {
    const live = await getTurn();
    if (!live?.view.blockedRoutingEnabled || !live.current() || live.entry.roleId !== observation.roleId
      || live.source.originId !== observation.turnId || path.relative(live.view.projectRoot, observation.cwd)) return;
    const child = operationsTasks(live.view).children.find(task => task.state === "pending" && task.taskId === live.entry.assignedTaskId
      && task.taskId === live.delivery.intent.task?.taskId && task.taskId === live.source.parentTaskId && task.roleId === observation.roleId);
    if (!child?.workOrder) return;
    const store = await durable.store();
    const retest = live.view.a11Disposition;
    if (retest?.retest && retest.childTask.taskId === child.taskId) {
      const current = a11RetestTurnCurrent(store, live, observation.turnId);
      const stillCurrent = () => !!live.delivery.selectionId && selectionId() === live.delivery.selectionId && current?.() === true;
      if (stillCurrent()) await store.recordImplementationSelfTest(live.view.ref, { task: child.task, observation }, stillCurrent);
      return;
    }
    if (observation.reviewedBy && observation.writeAuditPassed === true && observation.outcome.exitCode === 0
      && !observation.outcome.error && !observation.outcome.signal && !observation.outcome.timedOut) {
      await store.recordImplementationSelfTest(live.view.ref, { task: child.task, observation }, live.current);
    }
  };
}

function currentEvidenceCollectionTurn(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined,
  selectionId: () => string | undefined) {
  const getTurn = graphTurn(durable, session);
  return async (turnId: string) => {
    const live = await getTurn();
    const task = live?.delivery.intent.task;
    const audit = live?.view.evidenceAudit;
    if (!live || !task || !audit || task.taskId !== live.entry.assignedTaskId || task.taskId !== live.source.parentTaskId
      || live.source.originId !== turnId || audit.collector?.taskId !== task.taskId) return;
    const pending = live.view.pendingTasks?.find(row => row.taskId === task.taskId && row.roleId === task.roleId && row.state === "pending");
    const order = pending?.evidenceWorkOrder;
    if (!pending || !order || order.basis.generation !== audit.basis.generation) return;
    const store = await durable.store();
    const current = () => {
      const actual = store.lookup(live.view.ref);
      return !!live.delivery.selectionId && selectionId() === live.delivery.selectionId && live.current()
        && actual?.engine === "healthy" && actual.stepId === pending.stepId && actual.attempt === pending.attempt
        && actual.evidenceAudit?.basis.generation === order.basis.generation && actual.evidenceAudit.collector?.taskId === task.taskId
        && actual.evidenceAudit.basis.candidateOid === order.basis.candidateOid && actual.evidenceAudit.basis.branch === order.basis.branch
        && actual.evidenceAudit.basis.standard.sha256 === order.basis.standard.sha256
        && actual.pendingTasks?.some(row => row.taskId === task.taskId && row.state === "pending") === true
        && store.evidenceAuditAccess(live.view.ref, task) === "collect"
        && store.listEffects(live.view.ref, "model-send").some(row => row.intent.key === live.delivery.intent.key
          && row.state === "succeeded" && row.result?.result?.turnId === turnId && workflowTaskEffectMatches(row, pending));
    };
    if (current()) return { live, task, order, audit, store, current };
  };
}

export function observeEvidenceCollectionExecution(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined,
  selectionId: () => string | undefined) {
  const getCurrent = currentEvidenceCollectionTurn(durable, session, selectionId);
  return async (observation: ImplementationSelfTestObservation) => {
    const context = await getCurrent(observation.turnId);
    if (!context || context.task.roleId !== observation.roleId || path.relative(context.live.view.projectRoot, observation.cwd)) return;
    const { live, task, store, current } = context;
    const saved = await store.recordEvidenceExecution(live.view.ref, { task, observation }, current);
    if (saved.ok && saved.value.state !== "ignored") return { evidenceExecutionRef: saved.value.key };
  };
}

async function observeEvidenceCollectionGit(view: DurableProjection, writePaths: readonly string[],
  store: Awaited<ReturnType<DesktopDurableWorkflow["store"]>>) {
  const { projectRoot, ref } = view;
  const actual = await observeA11Git(projectRoot);
  const source = view.definitionSource === "project" ? view.definitionFile : undefined;
  let verifiedDefinitionPath: string | undefined;
  if (source && actual.untrackedPaths?.includes(source)) {
    const entries = await store.listDefinitions(projectRoot);
    const matches = entries.filter(entry => entry.source === "project" && entry.file === source && entry.definition?.id === ref.definitionId
      && entry.definition.version === ref.definitionVersion && entry.definition.digest === ref.definitionDigest);
    if (matches.length === 1) verifiedDefinitionPath = source;
  }
  const inEvidenceScope = (file: string) => file === verifiedDefinitionPath
    || writePaths.some(scope => file === scope || scope.endsWith("/") && file.startsWith(scope));
  const approved = actual.untrackedPaths?.filter(inEvidenceScope) ?? [];
  if (!approved.length) return actual;
  // Prove the current bytes of authorized evidence before classifying other untracked changes.
  // The strict whole-tree audit also compares every evidence file across the command.
  const observed = await observeA11Git(projectRoot, approved);
  if (observed.branch !== actual.branch || observed.head !== actual.head || observed.indexDigest !== actual.indexDigest
    || !observed.files || observed.files.length !== approved.length
    || JSON.stringify(observed.untrackedPaths?.filter(inEvidenceScope)) !== JSON.stringify(approved)) {
    return { ...observed, trackedDirty: true, reason: "本次批准范围内的现有取证文件无法稳定核验。" };
  }
  return { ...observed, untrackedPaths: observed.untrackedPaths?.filter(file => !inEvidenceScope(file)) };
}

export function desktopEvidenceCollectionCommandGuard(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined,
  selectionId: () => string | undefined): ImplementationRetestGuard {
  const getCurrent = currentEvidenceCollectionTurn(durable, session, selectionId);
  return async ({ turnId, toolCallId }) => {
    const context = toolCallId ? await getCurrent(turnId) : undefined;
    if (!context) return { mode: "denied" };
    const { live, order, audit, store, current } = context;
    const requirements = audit.requirements.filter(row => order.requirementIds.includes(row.id) && row.capability === "module-shell" && row.source === "task-command" && row.command);
    const approvedCommands = requirements.flatMap(row => row.command ? [row.command] : []);
    if (!approvedCommands.length) return { mode: "denied" };
    const approvedProduction = live.view.implementationItems?.flatMap(item => item.paths) ?? live.view.scope?.writeSets.flatMap(set => set.paths) ?? [];
    const modulePaths = [...new Set([...approvedProduction, ...requirements.flatMap(row => row.paths ?? [])])];
    const workOrderDigest = durableHash(JSON.stringify(order));
    return { mode: "retest", key: `evidence-command:${order.task.taskId}:${order.basis.generation}`,
      workOrderDigest, candidateOid: order.basis.candidateOid, branch: order.basis.branch, standard: order.basis.standard,
      modulePaths, approvedCommands, isCurrent: current, observeGit: () => observeEvidenceCollectionGit(live.view, order.writePaths, store) };
  };
}

type GraphTurn = NonNullable<Awaited<ReturnType<ReturnType<typeof graphTurn>>>>;

function a11RetestTurnCurrent(store: Awaited<ReturnType<DesktopDurableWorkflow["store"]>>, live: GraphTurn, turnId: string) {
  const { ref, stepId, attempt } = live.view;
  const disposition = live.view.a11Disposition;
  const key = disposition && `model:${a11ResumeKey(disposition.key)}`;
  const child = operationsTasks(live.view).children.find(task => task.taskId === disposition?.childTask.taskId
    && task.state === "pending" && task.roleId === live.entry.roleId && task.workOrder?.digest === disposition.workOrderDigest);
  if (!disposition?.retest || disposition.state !== "resumed" || !child || turnId !== live.source.originId
    || live.delivery.intent.key !== key || live.delivery.assignmentTaskId !== child.taskId || live.source.parentTaskId !== child.taskId
    || live.entry.assignedTaskId !== child.taskId || live.delivery.intent.task?.taskId !== child.taskId) return undefined;
  return () => {
    const current = store.lookup(ref);
    const active = current?.a11Disposition;
    return live.current() && current?.engine === "healthy" && current.status === "waiting" && current.stepId === stepId
      && current.attempt === attempt && active?.key === disposition.key && active.state === "resumed" && active.generation === disposition.generation
      && current.pendingTasks?.some(task => task.taskId === child.taskId && task.state === "pending") === true
      && store.listEffects(ref, "model-send").some(effect => effect.intent.key === key && effect.state === "succeeded"
        && effect.result?.result?.turnId === turnId && effect.intent.expected?.runtime === live.entry.runtime && workflowTaskEffectMatches(effect, child));
  };
}

export function desktopImplementationRetestGuard(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined,
  projectRoot: string, taskId: string, selectionId: () => string | undefined): ImplementationRetestGuard {
  const getTurn = graphTurn(durable, session);
  return async ({ turnId, toolCallId }) => {
    const live = await getTurn();
    if (!live || live.source.parentTaskId !== taskId
      || live.entry.assignedTaskId !== taskId || live.delivery.intent.task?.taskId !== taskId
      || !operationsTasks(live.view).children.some(task => task.taskId === taskId && task.state === "pending")) return { mode: "denied" };
    const disposition = live.view.a11Disposition;
    if (!disposition?.retest || disposition.childTask.taskId !== taskId) return { mode: "ordinary" };
    if (!toolCallId || live.source.originId !== turnId) return { mode: "denied" };
    const current = a11RetestTurnCurrent(await durable.store(), live, turnId);
    const isCurrent = () => !!live.delivery.selectionId && selectionId() === live.delivery.selectionId && current?.() === true;
    if (!isCurrent()) return { mode: "denied" };
    const child = operationsTasks(live.view).children.find(task => task.taskId === taskId && task.workOrder?.digest === disposition.workOrderDigest);
    if (!child?.workOrder) return { mode: "denied" };
    return { mode: "retest", key: disposition.key, candidateOid: disposition.candidateOid, branch: disposition.branch,
      workOrderDigest: disposition.workOrderDigest, standard: disposition.standard,
      approvedCommands: disposition.retest.missingRequirements.map(req => req.command),
      modulePaths: child.workOrder.paths, isCurrent, observeGit: () => observeA11Git(projectRoot) };
  };
}

type OpenScope = { requestId: string; controller: AbortController };
const cards = new WeakMap<DesktopDurableWorkflow, Map<string, OpenScope>>();

export function closeBlockedScopeCard(durable: DesktopDurableWorkflow, projectRoot: string): void {
  const registered = cards.get(durable);
  const card = registered?.get(projectRoot);
  registered?.delete(projectRoot);
  card?.controller.abort();
}

/** B2 keeps the existing main-window choice surface and binds a separate evidence write range to the original scope. */
export async function presentB2EvidenceScopeCard(input: {
  durable: DesktopDurableWorkflow;
  view: DurableProjection;
  chief: string;
  customer: DesktopCustomerInputFn;
  isRegistered: () => boolean;
}): Promise<void> {
  const { durable, view, chief, customer, isRegistered } = input;
  const choice = view.b2EvidenceDecision;
  const { projectRoot, ref } = view;
  if (!choice || choice.decision || !isRegistered()) return;
  const { binding, scopeId, roleId, writePaths, requirements } = choice;
  let registered = cards.get(durable);
  if (!registered) {
    registered = new Map();
    cards.set(durable, registered);
  }
  if (registered.get(projectRoot)?.requestId === binding.requestId) return;
  closeBlockedScopeCard(durable, projectRoot);
  const controller = new AbortController();
  const card = { requestId: binding.requestId, controller };
  registered.set(projectRoot, card);
  const release = () => { if (registered.get(projectRoot) === card) registered.delete(projectRoot); };
  try {
    const store = await durable.store();
    const current = () => {
      if (controller.signal.aborted || !isRegistered() || registered.get(projectRoot) !== card) return false;
      const live = store.lookup(ref);
      const actual = live?.b2EvidenceDecision;
      return live?.status === "waiting" && live.engine === "healthy" && actual?.scopeId === scopeId && !actual.decision
        && actual.binding.requestId === binding.requestId && actual.binding.generation === binding.generation && actual.binding.digest === binding.digest;
    };
    if (!current()) { release(); return; }
    const running = isRuntimeKind(view.metadata.runtime) ? view.metadata.runtime : undefined;
    const details = requirements.map(item => `${item.requirementId}（${item.reason}${item.paths?.length ? `，原件 ${item.paths.join("、")}` : ""}）`).join("、");
    const candidates = view.scopeDecision?.candidates.join("、");
    void Promise.resolve(customer({
      kind: "choice", cardKind: BLOCKED_SCOPE_CARD_KIND, application: true, sourceRoleId: "application", flowId: view.flowId,
      title: "确认 B2 的验收取证范围",
      question: "请选择是否将所列证据范围交给当前已核对的项目取证角色。",
      preview: `B2 范围 ${scopeId}。${candidates ? `实际实施路径 ${candidates}。` : ""}取证属主 ${roleId}，证据写域 ${writePaths.join("、")}。待取证要求 ${details}。`,
      options: [
        { id: "route", label: "批准所列取证范围", description: "允许当前指定角色按该工单收集证据。原实施范围与发布审批继续沿当前流程。" },
        { id: "wait", label: "暂不批准取证范围", description: "保留原实施流程。缺所需证据时在 B3 等待处置。" },
      ],
    }, {
      roleId: chief, runtime: running, projectRoot, requestId: binding.requestId, sessionSignal: controller.signal, governanceModel: "trio",
      durableDecision: { cardKind: BLOCKED_SCOPE_CARD_KIND, generation: binding.generation, customerOnly: true },
      persistWorkflowDecision: async (answer, delegated, isMainFrameCurrent) => {
        const authorized = () => !delegated && (isMainFrameCurrent?.() === true) && current();
        const selected = answer.kind === "choice" && answer.selected.length === 1 ? answer.selected[0] : undefined;
        const action = selected === "route" ? "approve" : selected === "wait" ? "decline" : undefined;
        if (!action || !authorized()) return { ok: false, stale: !current(), message: "请由当前项目主窗口选择同一 B2 范围。" };
        const result = await store.decideB2EvidenceScope(ref, { ...binding, action, provenance: durableDecisionProvenance(binding.generation) }, authorized);
        if (!result.ok) return { ok: false, stale: !current(), message: result.message };
        durable.activate();
        return { ok: true, decisionId: binding.requestId };
      },
    })).catch(() => undefined).finally(release);
  } catch (error) {
    release();
    throw error;
  }
}

function evidenceScopePreview(view: DurableProjection, scope: NonNullable<DurableProjection["blockedRouting"]>): string {
  const audit = view.evidenceAudit;
  if (!audit) return "";
  const sources = scope.evidenceRoute?.artifacts.map(item => `${item.requirementId}（${item.path || item.receiptId}）`).join("、");
  const proposed = scope.evidenceCompromise;
  return [
    "",
    `当前证据代次 ${audit.basis.generation}。缺项 ${audit.missing.map(item => `${item.requirementId}（${item.reason}）`).join("、")}。`,
    ...(sources ? [`同等取证路线由 ${scope.evidenceRoute?.roleId} 接续，已核实来源 ${sources}。`] : []),
    ...(proposed ? [`拟申请调整条目 ${proposed.requirementIds.join("、")}，可核对候选原件 ${proposed.paths.join("、")}。须按原流程批准修订，再签发标准并审计。`] : []),
  ].join("\n");
}

export async function presentBlockedScopeCard(input: {
  durable: DesktopDurableWorkflow;
  view: DurableProjection;
  chief: string;
  customer: DesktopCustomerInputFn;
  executeDecision?: ChiefDecisionExecutor;
  isRegistered: () => boolean;
}): Promise<void> {
  const { durable, view, chief, customer, executeDecision, isRegistered } = input;
  const scope = view.blockedRouting;
  if (scope?.kind !== "scope-change" || scope.decision || !isRegistered()) return;
  const disposition = scope.a11DispositionKey && view.a11Disposition?.key === scope.a11DispositionKey ? view.a11Disposition : undefined;
  const preparation = scope.a12bPrepareKey && view.acceptanceWorkspace?.preparation?.prepareKey === scope.a12bPrepareKey
    ? view.acceptanceWorkspace.preparation : undefined;
  const evidence = scope.evidenceAuditKey ? view.evidenceAudit : undefined;
  const confirmation = disposition?.confirmation === "stop" || preparation?.confirmation === "stop";
  const item = disposition && view.pendingTasks?.find(task => task.taskId === disposition.childTask.taskId);
  const visiblePaths = disposition?.observation.stagedPaths.filter(file =>
    item?.workOrder?.paths.some(allowed => file === allowed || allowed.endsWith("/") && file.startsWith(allowed))).slice(0, 32) ?? [];
  const { projectRoot, ref } = view;
  const { requestId, digest, generation } = scope.binding;
  let registered = cards.get(durable);
  if (!registered) {
    registered = new Map();
    cards.set(durable, registered);
  }
  if (registered.get(projectRoot)?.requestId === requestId) return;
  closeBlockedScopeCard(durable, projectRoot);
  const controller = new AbortController();
  const card = { requestId, controller };
  registered.set(projectRoot, card);
  const release = () => {
    if (registered.get(projectRoot) === card) registered.delete(projectRoot);
  };
  try {
    const store = await durable.store();
    const current = () => {
      if (controller.signal.aborted || !isRegistered() || registered.get(projectRoot) !== card) return false;
      const live = store.lookup(ref);
      const liveScope = live?.blockedRouting;
      return live?.status === "waiting" && live.engine === "healthy" && live.stepId === view.stepId && live.attempt === view.attempt
        && liveScope?.kind === "scope-change" && !liveScope.decision && liveScope.binding.requestId === requestId
        && liveScope.binding.digest === digest && liveScope.binding.generation === generation && liveScope.governanceDigest === scope.governanceDigest;
    };
    const materialsCurrent = async () => {
      if (!current()) return false;
      if (scope.evidenceAuditKey) return current();
      if (disposition) {
        const fresh = await observeA11Git(projectRoot, disposition.recovery?.paths);
        if (!current()) return false;
        const actual = sameA11GitSnapshot(disposition.observation, fresh) ? disposition.observation : fresh;
        const refreshed = await store.observeA11Disposition(ref, disposition.key, actual, current);
        if (refreshed.ok && !current()) durable.activate();
        return refreshed.ok && current();
      }
      if (preparation) {
        const task = view.pendingTasks?.find(item => item.taskId === preparation.basis.assessmentTask.taskId && item.state === "pending");
        if (!task) return false;
        await prepareDesktopAcceptanceWorkspace(store, view, task);
        if (!current()) durable.activate();
        return current();
      }
      const checked = await store.readEvidence(projectRoot, scope.document.path);
      return checked.ok && checked.value.sha256 === scope.document.sha256 && current();
    };
    if (!await materialsCurrent()) { release(); return; }
    const request: CustomerInputRequest = { kind: "choice", cardKind: BLOCKED_SCOPE_CARD_KIND, application: true, sourceRoleId: "application",
      flowId: view.flowId, title: confirmation ? "确认是否停止本次工作流" : disposition
        ? (disposition.retest ? "处理 A11 工作项缺少的自测回执" : "处理 A11 工作项的 Git 阻塞") : "决定如何处理当前验收阻塞",
      question: preparation ? workspacePreparationSummary(view) ?? scope.reason : `当前工作流需要决定。${scope.reason}`,
      preview: `原节点 ${view.stepName}，第 ${view.attempt} 次。当前依据 ${scope.document.path}，SHA-256 ${scope.document.sha256}。` +
        (scope.candidateOid ? `\n候选提交 ${scope.candidateOid}。` : "") + (disposition
          ? [`\n工作项 ${item?.workItemId ?? disposition.childTask.taskId}，原属主 ${disposition.childTask.roleId}，批准分支 ${disposition.branch}。`,
            ...(visiblePaths.length ? [`\n原工单范围内的暂存路径：${visiblePaths.join("、")}。`] : []),
            ...(disposition.retest ? [`\n待补要求：\n${implementationTestRulesText(disposition.retest.missingRequirements)}`] : []),
            `\n等待期间，可在本项目幕僚输入框输入 ${A11_STOP_COMMAND} 打开停止确认。`].join("")
          : preparation ? `\n核对第 ${preparation.generation} 次准备观察。${preparation.rework
            ? `\n原工作项 ${preparation.rework.workItemId}，原属主 ${preparation.rework.ownerTask.roleId}，核验的返工范围 ${preparation.rework.paths.join("、")}。` : ""}\n等待期间，可在本项目幕僚输入框输入 ${A11_STOP_COMMAND} 打开停止确认。`
          : evidence ? evidenceScopePreview(view, scope)
          : scope.options.some(option => option.id === "revise")
            ? "\n选择申请修订后，具体新版本仍按原批准流程处理。" : "\n当前没有核验到适用的原文件修订入口。"),
      options: scope.options.map(option => ({ id: option.id, label: option.label, description: option.impact })) };
    const runtime = isRuntimeKind(view.metadata.runtime) ? view.metadata.runtime : undefined;
    void Promise.resolve(customer(request, { roleId: chief, runtime, projectRoot, requestId, sessionSignal: controller.signal,
      governanceModel: "trio", durableDecision: { cardKind: BLOCKED_SCOPE_CARD_KIND, generation,
        ...(confirmation ? { customerOnly: true } : {}),
        host: !confirmation && executeDecision ? {
        execute: executeDecision,
        prepare: async () => {
          if (!await materialsCurrent()) throw new Error("原标准、候选或工作流卡已变化。");
          return { baseDigest: digest, isCurrent: materialsCurrent, evidenceRefs: [{ ...scope.document, snapshotId: digest }],
            context: JSON.stringify({ reason: scope.reason, origin: scope.origin, preview: request.preview, options: scope.options }) };
        },
      } : undefined },
      persistWorkflowDecision: async (answer, delegated, isMainFrameCurrent) => {
        const authorized = () => current() && (delegated ? delegated.isCurrent() : isMainFrameCurrent?.() === true);
        const option = answer.kind === "choice" && answer.selected.length === 1 ? scope.options.find(item => item.id === answer.selected[0])?.id : undefined;
        if (!option || confirmation && delegated || !authorized() || !await materialsCurrent() || !authorized()) {
          return { ok: false, stale: !current(), message: "请选择当前项目仍有效的处置选项。" };
        }
        const result = await store.decideBlockedScopeChange(ref, { requestId, digest, generation, option,
          provenance: durableDecisionProvenance(generation, delegated) }, authorized);
        if (!result.ok) return { ok: false, stale: !current(), message: result.message };
        durable.activate();
        return { ok: true, decisionId: requestId };
      },
    })).catch(() => undefined).finally(release);
  } catch (error) {
    release();
    throw error;
  }
}
