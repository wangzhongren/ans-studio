import { createTranslator } from "../../src/common/shared/i18n/index.ts";
import type { DurableProjection, DurableResult } from "../../src/model/durable-workflow.ts";
import type { CustomerInputRequest, RequestDocumentRevisionFn, SubmitDocumentRevisionFn } from "../../src/model/runtime.ts";
import { DOCUMENT_REVISION_CARD_KIND, DOCUMENT_REVISION_OPTIONS, durableDecisionProvenance, type ChiefDecisionExecutor,
  type DesktopCustomerInputFn } from "./customer-input.ts";
import { graphTurn, operationsTasks } from "./durable-workflow-a.ts";
import type { DesktopDurableWorkflow } from "./durable-workflow.ts";
import { isRuntimeKind } from "./runtime-config.ts";
import type { LiveSession } from "./session/contracts/session-types.ts";
import { mainT, type MainTranslate } from "./i18n.ts";
import roleText from "./durable-workflow-role-text.json" with { type: "json" };

type Revision = NonNullable<DurableProjection["documentRevision"]>;
const workflowDecisionT = createTranslator("zh-CN");

export function isDocumentRevisionTurn(view: DurableProjection | undefined, roleId: string, taskId?: string): boolean {
  const revision = view?.documentRevision;
  return !!revision && revision.status === "pending" && revision.roleId === roleId && revision.task.taskId === taskId;
}

function failure(message: string): DurableResult<never> {
  return { ok: false, code: "workflow-document-revision-turn-invalid", message };
}

export function documentRevisionPorts(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined): {
  requestDocumentRevision: RequestDocumentRevisionFn;
  submitDocumentRevision: SubmitDocumentRevisionFn;
} {
  const getTurn = graphTurn(durable, session);
  return {
    async requestDocumentRevision(input, signal) {
      const live = await getTurn();
      if (!live?.view.documentRevisionEnabled || live.view.action !== "operations-implementation" || live.entry.roleId !== "convener") {
        return failure(roleText.documentRevision.operationsParentRequired);
      }
      const { parent } = operationsTasks(live.view);
      const isCurrent = () => !!parent && parent.taskId === live.entry.assignedTaskId
        && parent.taskId === live.source.parentTaskId && parent.taskId === live.delivery.intent.task?.taskId
        && !signal?.aborted && live.current();
      const store = await durable.store();
      if (!isCurrent()) return failure(roleText.documentRevision.originalOperationsTurnUnverified);
      const result = await store.requestDocumentRevision(live.view.ref, { ...input, source: live.source }, isCurrent);
      if (!result.ok) {
        const scope = store.lookup(live.view.ref)?.blockedRouting;
        if (scope?.kind === "scope-change" && scope.origin.task.taskId === parent?.taskId && !scope.decision) durable.activate();
        return result;
      }
      durable.activate();
      return { ok: true, value: { requestId: result.value.id, status: result.value.status,
        message: `${roleText.documentRevision.revisionAccepted[0]}${result.value.path}${roleText.documentRevision.revisionAccepted[1]}${result.value.roleId}${roleText.documentRevision.revisionAccepted[2]}` } };
    },
    async submitDocumentRevision(input, signal) {
      const live = await getTurn();
      const revision = live?.view.documentRevision;
      if (!live || !revision || !isDocumentRevisionTurn(live.view, live.entry.roleId, live.entry.assignedTaskId)) {
        return failure(roleText.documentRevision.assignedRevisionMissing);
      }
      const isCurrent = () => revision.task.taskId === live.source.parentTaskId
        && revision.task.taskId === live.delivery.intent.task?.taskId && !signal?.aborted && live.current();
      const store = await durable.store();
      if (!isCurrent()) return failure(roleText.documentRevision.revisionTurnUnverified);
      const result = await store.submitDocumentRevision(live.view.ref, { revisionId: revision.id, ...input, source: live.source }, isCurrent);
      if (!result.ok) return result;
      durable.activate();
      return { ok: true, value: { requestId: result.value.id, status: result.value.status,
        message: roleText.documentRevision.revisionCandidateRecorded } };
    },
  };
}

type OpenCard = { requestId: string; controller: AbortController };
const cards = new WeakMap<DesktopDurableWorkflow, Map<string, OpenCard>>();

export function closeDocumentRevisionCard(durable: DesktopDurableWorkflow, projectRoot: string): void {
  const byProject = cards.get(durable);
  const previous = byProject?.get(projectRoot);
  byProject?.delete(projectRoot);
  previous?.controller.abort();
}

export async function presentDocumentRevisionCard(input: {
  durable: DesktopDurableWorkflow;
  view: DurableProjection;
  revision: Revision;
  chief: string;
  customer: DesktopCustomerInputFn;
  executeDecision?: ChiefDecisionExecutor;
  isRegistered: () => boolean;
}): Promise<void> {
  const { durable, view, revision, chief, customer, isRegistered, executeDecision } = input;
  const { projectRoot, ref } = view;
  const digest = revision.reviewDigest;
  if (!digest || revision.status !== "awaiting-approval" || !isRegistered()) return;
  const requestId = `document-revision:${revision.id}:${digest}`;
  let byProject = cards.get(durable);
  if (!byProject) {
    byProject = new Map();
    cards.set(durable, byProject);
  }
  if (byProject.get(projectRoot)?.requestId === requestId) return;
  closeDocumentRevisionCard(durable, projectRoot);
  const controller = new AbortController();
  const open = { requestId, controller };
  byProject.set(projectRoot, open);
  const release = () => {
    if (byProject.get(projectRoot) === open) byProject.delete(projectRoot);
  };
  try {
    const store = await durable.store();
    const present = () => !controller.signal.aborted && isRegistered() && byProject.get(projectRoot) === open;
    const current = () => {
      if (!present()) return false;
      const live = store.lookup(ref);
      const currentRevision = live?.documentRevision;
      return live?.status === "waiting" && live.engine === "healthy" && live.stepId === revision.origin.stepId
        && live.attempt === revision.origin.attempt && currentRevision?.id === revision.id
        && currentRevision.status === "awaiting-approval" && currentRevision.reviewDigest === digest;
    };
    const review = await store.readDocumentRevisionReview(ref, revision.id);
    if (!review.ok && current()) store.block(ref, review.code, review.message);
    if (!review.ok || review.value.digest !== digest || review.value.requestId !== requestId || !current()) {
      release();
      return;
    }
    const { originalContent, candidateContent, documents, previews } = review.value;
    const evidence = documents.map(document => `${document.path}  SHA-256 ${document.sha256}`).join("\n");
    const summary = (t: MainTranslate) => {
      const companions = previews.filter(document => document.original.path !== revision.path).map(document =>
        t("main.durableWorkflow.documentRevision.companionPreview", {
          candidatePath: document.candidate.path, originalPath: document.original.path,
          sha256: document.original.sha256, content: document.content,
        }));
      return {
        title: t("main.durableWorkflow.documentRevision.title"),
        question: t("main.durableWorkflow.documentRevision.approvalQuestion", { roleId: revision.roleId, path: revision.path }),
        preview: [
          t("main.durableWorkflow.documentRevision.requestReason", { reason: revision.reason }),
          t("main.durableWorkflow.documentRevision.evidence", { evidence }),
          t("main.durableWorkflow.documentRevision.currentVersion", {
            content: originalContent ?? t("main.durableWorkflow.documentRevision.currentFileMissing"),
          }),
          t("main.durableWorkflow.documentRevision.candidatePreview", { content: candidateContent }),
          ...companions,
        ].join("\n\n"),
        options: [
          { id: DOCUMENT_REVISION_OPTIONS[0], label: t("main.durableWorkflow.documentRevision.approve") },
          { id: DOCUMENT_REVISION_OPTIONS[1], label: t("main.durableWorkflow.documentRevision.reject") },
        ],
      };
    };
    const decisionSummary = summary(workflowDecisionT);
    const request: CustomerInputRequest = {
      kind: "choice", cardKind: DOCUMENT_REVISION_CARD_KIND, application: true, sourceRoleId: "application",
      ...(view.flowId ? { flowId: view.flowId } : {}),
      ...summary(mainT),
    };
    const runtime = isRuntimeKind(view.metadata.runtime) ? view.metadata.runtime : undefined;
    void Promise.resolve(customer(request, {
      projectRoot, roleId: chief, runtime, requestId, sessionSignal: controller.signal, governanceModel: "trio",
      durableDecision: { cardKind: DOCUMENT_REVISION_CARD_KIND, generation: review.value.generation, host: executeDecision && {
        execute: (context, ...args) => executeDecision({
          ...context, request: { ...context.request, question: decisionSummary.title, options: decisionSummary.options },
        }, ...args),
        prepare: async () => {
          const readCurrent = async () => {
            if (!current()) return undefined;
            const checked = await store.readDocumentRevisionReview(ref, revision.id);
            return checked.ok && current() && checked.value.requestId === requestId && checked.value.digest === digest
              && checked.value.generation === review.value.generation ? checked.value : undefined;
          };
          const checked = await readCurrent();
          if (!checked) throw new Error(roleText.documentRevision.decisionEvidenceChanged);
          const artifacts = checked.previews.flatMap(document => [document.original, document.candidate]);
          return { baseDigest: digest, isCurrent: async () => !!await readCurrent(),
            evidenceRefs: artifacts.map(doc => ({ ...doc, snapshotId: digest })),
            context: JSON.stringify({ projectRoot, origin: revision.origin, roleId: revision.roleId, path: revision.path,
              question: decisionSummary.question, review: decisionSummary.preview.slice(0, 64_000) }),
          };
        },
      } },
      persistWorkflowDecision: async (answer, delegated, isMainFrameCurrent) => {
        const authorized = () => current() && (delegated ? delegated.isCurrent() : isMainFrameCurrent?.() === true);
        const stale = !authorized();
        if (stale || answer.kind !== "choice" || answer.selected.length !== 1) {
          return { ok: false, message: mainT("main.durableWorkflow.documentRevision.currentWindowDecisionRequired"), stale };
        }
        const [choice] = answer.selected;
        const decision = choice === DOCUMENT_REVISION_OPTIONS[0] ? "approve" : choice === DOCUMENT_REVISION_OPTIONS[1] ? "reject" : undefined;
        if (!decision) return { ok: false, message: mainT("main.durableWorkflow.documentRevision.approvalChoiceRequired") };
        const provenance = durableDecisionProvenance(review.value.generation, delegated);
        const saved = await store.decideDocumentRevision(ref, { revisionId: revision.id, digest, decision, authority: provenance.source, provenance }, authorized);
        if (!saved.ok) return { ok: false, message: saved.message, stale: !current() };
        durable.activate();
        return { ok: true, decisionId: requestId };
      },
    })).catch(() => undefined).finally(release);
  } catch (error) {
    release();
    throw error;
  }
}
