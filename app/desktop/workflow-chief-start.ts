import { randomUUID } from "node:crypto";
import { createDiagnosticLogger } from "../../src/common/shared/diagnostics.ts";
import type { DurableRequestWorkflowStartFn, DurableResult, DurableStartProposal } from "../../src/model/durable-workflow.ts";
import type { CustomerInputRequest } from "../../src/model/runtime.ts";
import type { DesktopCustomerInputFn } from "./customer-input.ts";
import { durableFailure, durableHash, type DesktopDurableWorkflow } from "./durable-workflow.ts";
import { mainT } from "./i18n.ts";
import { isRuntimeKind } from "./runtime-config.ts";
import type { LiveSession, TrustedWorkflowCustomerInput } from "./session/contracts/session-types.ts";

export const WORKFLOW_START_OPTION_IDS = ["approve-workflow-start", "reject-workflow-start"] as const;

export type DesktopWorkflowStartProposal = Pick<DurableStartProposal,
  "activationId" | "requestId" | "generation" | "state" | "definition" | "reason" | "createdAt" | "decision" | "startup"> & {
  requirement: { text: string };
  instanceId?: string;
};

interface StartWindow {
  projectRoot: string;
  selectionId: string;
}

interface StartDependencies {
  durable: DesktopDurableWorkflow;
  customer?: DesktopCustomerInputFn;
  selection(projectRoot: string): StartWindow | undefined;
  hasActiveTurn(projectRoot: string): boolean;
  hasPendingCard?(projectRoot: string): boolean;
  hasActiveRun(projectRoot: string): Promise<boolean>;
}

type WorkflowCard = { controller: AbortController; requestId: string; replied?: true };

function proposalView(proposal: DurableStartProposal): DesktopWorkflowStartProposal {
  const { activationId, requestId, generation, state, definition, requirement, reason, createdAt, decision, startup, instanceRef } = proposal;
  return { activationId, requestId, generation, state, definition, requirement: { text: requirement.text }, reason, createdAt,
    ...(decision ? { decision } : {}), ...(startup ? { startup } : {}), ...(instanceRef ? { instanceId: instanceRef.instanceId } : {}) };
}

export class WorkflowChiefStart {
  private readonly grants = new WeakMap<TrustedWorkflowCustomerInput, () => boolean>();
  private readonly registeredProjects = new Set<string>();
  private readonly cards = new Map<string, WorkflowCard>();
  private readonly localStartup = new Map<string, NonNullable<DesktopWorkflowStartProposal["startup"]>>();
  private selected: StartWindow | undefined;
  private working = false;
  private timer: NodeJS.Timeout | undefined;
  private readonly dependencies: StartDependencies;

  constructor(dependencies: StartDependencies) { this.dependencies = dependencies; }

  mode(projectRoot: string): boolean {
    return this.registeredProjects.has(projectRoot) || this.dependencies.selection(projectRoot) !== undefined;
  }

  issueInput(projectRoot: string, text: string, isMainFrameCurrent?: () => boolean): TrustedWorkflowCustomerInput | undefined {
    const selected = this.dependencies.selection(projectRoot);
    if (!selected || !isMainFrameCurrent?.() || !text.trim() || text.length > 12_000) return undefined;
    const grant = Object.freeze({ inputId: randomUUID(), projectRoot, selectionId: selected.selectionId, text, digest: durableHash(text) });
    this.grants.set(grant, isMainFrameCurrent);
    return grant;
  }

  requestForSession(
    projectRoot: string, roleId: string, assignedTaskId: string | undefined,
    readSession: () => LiveSession | undefined,
  ): DurableRequestWorkflowStartFn | undefined {
    if (roleId !== "chief" || assignedTaskId !== undefined || !this.dependencies.selection(projectRoot)) return undefined;
    return async choice => {
      const entry = readSession();
      const origin = entry?.origins.running;
      const grant = origin?.workflowInput;
      const ack = origin?.workflowInputAck;
      const isCurrent = () => !!entry && !!origin && !!grant && !!ack && this.grants.get(grant)?.() === true
        && entry.projectRoot === projectRoot && entry.roleId === "chief" && entry.assignedTaskId === undefined
        && readSession() === entry && entry.origins.running === origin && entry.busy && !origin.settled
        && !entry.interactionState.lifetime.signal.aborted && !entry.interactionState.turn.signal.aborted
        && origin.kind === "message" && origin.turnId === ack && origin.workflowInputAck === ack
        && this.dependencies.selection(projectRoot)?.selectionId === grant.selectionId;
      if (!isCurrent() || !entry || !grant || !ack) {
        return durableFailure("workflow-start-input-unverified", "A proposal requires the current acknowledged customer message in the ordinary Chief session.");
      }
      const store = await this.dependencies.durable.store();
      const saved = await store.proposeWorkflowStart({ ...choice, projectRoot,
        requirement: { inputId: grant.inputId, turnId: ack, text: grant.text, digest: grant.digest, runtime: entry.runtime } }, isCurrent);
      if (!saved.ok) return saved;
      this.wake(projectRoot);
      return { ok: true, value: { state: "pending", activationId: saved.value.activationId, definitionDigest: saved.value.definition.digest } };
    };
  }

  async list(projectRoot: string): Promise<DesktopWorkflowStartProposal[]> {
    if (!await this.dependencies.durable.hasStoredBusiness()) return [];
    const store = await this.dependencies.durable.store();
    return (await store.listWorkflowStartProposals(projectRoot)).map(proposal => {
      const view = proposalView(proposal);
      const local = this.localStartup.get(view.activationId);
      return view.state === "approved" && local ? { ...view, startup: local } : view;
    });
  }

  async revoke(projectRoot: string, activationId: string, requestId: string, isCurrent: () => boolean): Promise<DurableResult<DesktopWorkflowStartProposal>> {
    const store = await this.dependencies.durable.store();
    const saved = await store.decideWorkflowStart({ projectRoot, activationId, requestId, action: "revoke" }, isCurrent);
    if (!saved.ok) return saved;
    this.wake(projectRoot);
    return { ok: true, value: proposalView(saved.value) };
  }

  select(projectRoot?: string): void {
    const selection = projectRoot ? this.dependencies.selection(projectRoot) : undefined;
    if (this.selected?.selectionId === selection?.selectionId) return;
    for (const card of this.cards.values()) card.controller.abort();
    this.cards.clear();
    this.localStartup.clear();
    this.selected = selection;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (selection) {
      this.registeredProjects.add(selection.projectRoot);
      this.timer = setInterval(() => this.wake(selection.projectRoot), 1_500);
      this.timer.unref();
      this.wake(selection.projectRoot);
    }
  }

  wake(projectRoot: string): void {
    const selection = this.selected;
    if (!selection || selection.projectRoot !== projectRoot || this.working) return;
    this.working = true;
    void this.sync(selection).catch(error => {
      createDiagnosticLogger({ component: "desktop.workflow-start", projectRoot }).error("workflow-start.reconcile.failed", error);
    }).finally(() => { this.working = false; });
  }

  private async sync(selection: StartWindow): Promise<void> {
    const { projectRoot } = selection;
    const isCurrent = () => this.selected === selection && this.dependencies.selection(projectRoot)?.selectionId === selection.selectionId;
    if (!isCurrent() || !await this.dependencies.durable.hasStoredBusiness()) return;
    const store = await this.dependencies.durable.store();
    const proposals = await store.listWorkflowStartProposals(projectRoot);
    if (!isCurrent()) return;
    const pending = new Set(proposals.filter(row => row.state === "pending").map(row => row.requestId));
    for (const [id, card] of this.cards) {
      if (!pending.has(id) && !card.replied) card.controller.abort();
    }
    for (const proposal of proposals) {
      if (!isCurrent()) return;
      if (proposal.state === "pending" && this.dependencies.customer) {
        const fresh = await store.refreshWorkflowStartProposal(projectRoot, proposal.activationId, isCurrent);
        if (fresh.ok && fresh.value.state === "pending" && isCurrent()) this.present(selection, fresh.value);
        else this.cards.get(proposal.requestId)?.controller.abort();
      }
      if (proposal.state === "approved") {
        if (this.dependencies.hasActiveTurn(projectRoot)) {
          this.localStartup.set(proposal.activationId, { state: "waiting", code: "workflow-existing-turn", message: mainT("main.workflowStart.waitingForTurn") });
          continue;
        }
        if (this.dependencies.hasPendingCard?.(projectRoot)) {
          this.localStartup.set(proposal.activationId, { state: "waiting", code: "workflow-existing-card", message: mainT("main.workflowStart.waitingForCard") });
          continue;
        }
        if (await this.dependencies.hasActiveRun(projectRoot)) {
          this.localStartup.set(proposal.activationId, { state: "blocked", code: "workflow-existing-run", message: mainT("main.workflowStart.blockedByRun") });
          continue;
        }
        this.localStartup.delete(proposal.activationId);
        if (!isCurrent() || this.dependencies.hasActiveTurn(projectRoot)) continue;
        const started = await store.startApprovedWorkflow(projectRoot, proposal.activationId,
          () => isCurrent() && !this.dependencies.hasActiveTurn(projectRoot) && !this.dependencies.hasPendingCard?.(projectRoot));
        if (started.ok && started.value.instanceRef) this.dependencies.durable.activate();
      }
    }
  }

  private present(selection: StartWindow, proposal: DurableStartProposal): void {
    const customer = this.dependencies.customer;
    if (!customer || this.cards.has(proposal.requestId)) return;
    const { projectRoot } = selection;
    const controller = new AbortController();
    const card: WorkflowCard = { controller, requestId: proposal.requestId };
    this.cards.set(card.requestId, card);
    const isCurrent = () => !controller.signal.aborted && this.selected === selection
      && this.dependencies.selection(projectRoot)?.selectionId === selection.selectionId;
    const request: CustomerInputRequest = {
      kind: "choice", cardKind: "workflow-start", application: true, sourceRoleId: "application",
      title: mainT("main.workflowStart.title"), question: mainT("main.workflowStart.question"),
      preview: mainT("main.workflowStart.preview", { requirement: proposal.requirement.text, reason: proposal.reason,
        name: proposal.definition.name, source: proposal.definition.source, definitionId: proposal.definition.id,
        version: proposal.definition.version, digest: proposal.definition.digest }),
      options: [{ id: WORKFLOW_START_OPTION_IDS[0], label: mainT("main.workflowStart.approve") },
        { id: WORKFLOW_START_OPTION_IDS[1], label: mainT("main.workflowStart.reject") }],
    };
    const runtime = isRuntimeKind(proposal.requirement.runtime) ? proposal.requirement.runtime : undefined;
    void Promise.resolve(customer(request, {
      projectRoot, roleId: "chief", runtime, requestId: card.requestId, sessionSignal: controller.signal,
      persistWorkflowDecision: async (answer, delegated, isMainFrameCurrent) => {
        const mayDecide = () => isCurrent() && isMainFrameCurrent?.() === true;
        if (!mayDecide() || delegated || answer.kind !== "choice" || answer.selected.length !== 1) {
          return { ok: false, message: mainT("main.workflowStart.approvalRequired"), stale: !mayDecide() };
        }
        const option = answer.selected[0];
        const action = option === WORKFLOW_START_OPTION_IDS[0] ? "approve" : option === WORKFLOW_START_OPTION_IDS[1] ? "reject" : undefined;
        if (!action) return { ok: false, message: mainT("main.workflowStart.approvalRequired") };
        const store = await this.dependencies.durable.store();
        const saved = await store.decideWorkflowStart({ projectRoot, activationId: proposal.activationId, requestId: card.requestId, action }, mayDecide);
        if (!saved.ok) return { ok: false, message: saved.message };
        if (saved.value.state === "stale") return { ok: false, message: mainT("main.workflowStart.approvalRequired"), stale: true };
        card.replied = true;
        this.wake(projectRoot);
        return { ok: true, decisionId: card.requestId };
      },
    })).catch(error => {
      createDiagnosticLogger({ component: "desktop.workflow-start", projectRoot }).error("workflow-start.card.failed", error);
    }).finally(() => {
      if (this.cards.get(card.requestId) === card) this.cards.delete(card.requestId);
    });
  }

  async catalog(projectRoot: string, definitionId?: string): Promise<string> {
    const rows = await this.dependencies.durable.listDefinitions(projectRoot);
    const local = new Set(rows.filter(row => row.source === "project").map(row => row.id ?? row.file.replace(/\.ya?ml$/i, "")));
    const header = "Workflow definitions (Chief recommendation requires a customer approval; use request_workflow_start).";
    const lines: string[] = [header];
    for (const row of rows) {
      const id = row.id ?? row.file.replace(/\.ya?ml$/i, "");
      if (definitionId && definitionId !== id) continue;
      let line: string;
      if (row.source === "preset" && local.has(id)) line = `- ${id} (${row.source}): overridden by the project definition.`;
      else if (row.error) line = `- ${id} (${row.source}): ${row.error.code} ${row.error.message.slice(0, 160)}`;
      else line = `- ${row.name ?? id} | ${row.source} | id=${id} | v${row.version} | ${row.digest} | ${row.purpose ?? "Check the project's eligibility before proposing."}`;
      if (Buffer.byteLength([...lines, line].join("\n"), "utf8") > 2_700) {
        lines.push("More definitions exist. Use project_state with definitionId to inspect one.");
        break;
      }
      lines.push(line);
    }
    if (lines.length === 1) lines.push(definitionId ? "No definition matches this ID." : "No definitions available.");
    return lines.join("\n");
  }
}
