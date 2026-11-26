import type { WorkflowStage } from './runtime.ts';

export const DURABLE_EXECUTOR = 'ans-durable-definition-v1';
export const DURABLE_ACTIVITY = 'ans-durable-apply-v1';
export const DURABLE_ACTIVITY_CONTRACT = 1;
export const DURABLE_WAKE_EVENT = 'ans-durable-fact-v1';
export const DURABLE_GRAPH_EXECUTOR = 'ans-durable-definition-v2';
export const DURABLE_GRAPH_ACTIVITY = 'ans-durable-apply-v2';
export const DURABLE_GRAPH_ACTIVITY_CONTRACT = 2;
export const DURABLE_GRAPH_WAKE_EVENT = 'ans-durable-fact-v2';
export const DURABLE_EVIDENCE_AUDIT_EXECUTOR = 'ans-durable-evidence-audit-v1';
export const DURABLE_EVIDENCE_AUDIT_ACTIVITY = 'ans-durable-evidence-apply-v1';
export const DURABLE_EVIDENCE_AUDIT_ACTIVITY_CONTRACT = 3;
export const DURABLE_EVIDENCE_AUDIT_WAKE_EVENT = 'ans-durable-evidence-fact-v1';

export type DurableAction =
  | 'b1-impact-readonly'
  | 'b1-open-followup-attempt'
  | 'accept-b3-advance-with-b2-scope'
  | 'b3-implement-and-accept'
  | 'b4-customer-merge-main'
  | 'readonly-report'
  | 'wait-for-review';

export type DurableTerminal = 'blocked' | 'stopped' | 'delivered' | 'completed';
export type DurableStep = { terminal: DurableTerminal } | {
  action: DurableAction;
  role?: 'module-owner';
  next?: string;
  on?: Record<string, string>;
  maxVisits?: number;
  onLimit?: string;
};

export interface DurableDefinition {
  schema: 1;
  id: string;
  version: number;
  name: string;
  start: string;
  steps: Record<string, DurableStep>;
  digest: string;
}

export type DurableCapability = DurableAction
  | 'observe-existing' | 'prepare-existing-branch' | 'finish-readonly'
  | 'product-prepare' | 'product-prepare-direct' | 'author-intent' | 'author-intent-direct' | 'confirm-intent'
  | 'planning-prepare' | 'author-proposal' | 'confirm-proposal'
  | 'personnel-prepare' | 'activate-roles' | 'team-baseline' | 'confirm-appointment'
  | 'independent-standard' | 'governed-implementation' | 'operations-implementation' | 'independent-assessment' | 'archive-acceptance'
  | 'open-environment-recovery' | 'operations-environment-recovery'
  | 'customer-publish' | 'verify-stop' | 'retry-intent' | 'retry-proposal' | 'retry-implementation';

export type DurableRoleSelector = 'module-owner' | 'independent-reviewer' | 'product' | 'rapporteur' | 'nominator' | 'convener';
export type DurableGraphStep = { terminal: DurableTerminal } | {
  action: DurableCapability;
  role?: string;
  documentRevision?: true;
  blockedRouting?: true;
  next?: string;
  on?: Record<string, string>;
  onFailure?: string;
  maxVisits?: number;
  onLimit?: string;
};

export interface DurableGraphDefinition extends Omit<DurableDefinition, 'schema' | 'steps'> {
  schema: 2;
  evidenceAudit?: { version: 1; collectorRoleId: string };
  steps: Record<string, DurableGraphStep>;
}

export type DurableDefinitionSnapshot = DurableDefinition | DurableGraphDefinition;
export interface DurableDefinitionSelection { source?: 'project' | 'preset'; expectedDigest?: string }

export interface DurableInstanceRef {
  projectId: string;
  instanceId: string;
  definitionId: string;
  definitionVersion: number;
  definitionDigest: string;
  executor: string;
  activityContract: number;
}

export interface DurableConnection {
  appId: string;
  daprHost: '127.0.0.1';
  daprPort: string;
  httpPort?: number;
  daprApiToken?: string;
}

export interface DurableProblem {
  code: string;
  message: string;
  path?: string;
  missingImplementationTests?: readonly DurableVerificationRequirement[];
}

export type DurableResult<T> = { ok: true; value: T } | ({ ok: false } & DurableProblem);

export type DurableStage = WorkflowStage | 'readonly';
export interface DurableTaskBinding {
  stage: DurableStage;
  stageAttempt: number;
  executionAttempt: number;
  parentTaskId: string;
  taskId: string;
  roleId: string;
}

export interface DurableEvidenceRef {
  path: string;
  sha256: string;
}

export const DEFAULT_EVIDENCE_COLLECTOR = 'acceptance-evidence-collector';

export interface DurableEvidenceAuditBasis {
  candidateOid: string;
  branch: string;
  standard: DurableEvidenceRef;
  approvalDigest: string;
  generation: number;
}

export interface DurableEvidenceWorkOrder {
  basis: DurableEvidenceAuditBasis;
  task: DurableTaskBinding;
  parentTask: DurableTaskBinding;
  requirementIds: readonly string[];
  writePaths: readonly string[];
  sourceReceipts?: readonly { receiptId: string; taskId: string; argv: readonly string[] }[];
  approvedArtifacts?: readonly DurableEvidenceCollectionArtifact[];
}

export interface DurableEvidenceCollectionArtifact {
  requirementId: string;
  path: string;
  source: 'candidate-file' | 'task-command' | 'external-session';
  receiptId?: string;
}

export interface DurableEvidenceCollectionMissing {
  requirementId: string;
  reason: string;
}

export interface DurableEvidenceAuditRoute {
  roleId: string;
  artifacts: readonly DurableEvidenceCollectionArtifact[];
  fromGeneration: number;
}

export interface DurableB2EvidenceRequirement extends DurableEvidenceCollectionMissing {
  source?: 'candidate-file';
  paths?: readonly string[];
}

export interface DurableB2EvidenceDecision {
  binding: DurableDecisionBinding;
  scopeId: string;
  roleId: string;
  writePaths: readonly string[];
  requirements: readonly DurableB2EvidenceRequirement[];
  decision?: 'approve' | 'decline';
  provenance?: DurableDecisionProvenance;
}

export interface DurableEvidenceAuditRecord {
  id: string;
  requirementId: string;
  artifact?: DurableEvidenceRef;
  source: 'candidate-file' | 'candidate-commit' | 'task-command';
  sourceId: string;
  sourceTask?: DurableTaskBinding;
  observedAt: string;
  outcome: 'recorded' | 'executed' | 'failed';
}

export interface DurableEvidenceAuditProjection {
  basis: DurableEvidenceAuditBasis;
  requirements: readonly DurableVerificationRequirement[];
  state: 'collecting' | 'ready' | 'blocked' | 'audited';
  collector?: DurableTaskBinding;
  collectorRoleId?: string;
  auditTask?: DurableTaskBinding;
  records: readonly DurableEvidenceAuditRecord[];
  missing: readonly DurableEvidenceCollectionMissing[];
  writePaths: readonly string[];
  legacy?: true;
  route?: DurableEvidenceAuditRoute & { requestId: string; parentTask: DurableTaskBinding };
}

export interface DurableDispatchEvidenceCollectionInput {
  parentTask: DurableTaskBinding;
  roleId: string;
  originId: string;
  requestId: string;
}

export interface DurableRecordEvidenceCollectionInput {
  task: DurableTaskBinding;
  generation: number;
  artifacts: readonly DurableEvidenceCollectionArtifact[];
  missing?: readonly DurableEvidenceCollectionMissing[];
  reportKey?: string;
}

export interface DurableCloseEvidenceCollectionInput {
  parentTask: DurableTaskBinding;
  task: DurableTaskBinding;
  originId: string;
  reportKey: string;
  outcome: 'accepted' | 'rework' | 'rejected';
}

export interface DurableEvidenceBlockerInput {
  parentTask: DurableTaskBinding;
  originId: string;
  generation: number;
  reason: string;
}

export interface DurableAcceptanceEnvironmentBasis {
  candidateOid: string;
  branch: string;
  criteria: DurableEvidenceRef;
  assessmentTask: DurableTaskBinding;
}

export interface DurableAcceptanceWorkspaceBinding {
  basis: DurableAcceptanceEnvironmentBasis;
  projectRoot: string;
  workspaceRoot: string;
  workspaceIdentity: { dev: string; ino: string };
  inputRoot: string;
  outputRoot: string;
  evidenceRoot: string;
  launcherPath: string;
  launcherSha256: string;
  requiresBrowserEvidence: boolean;
  browserEvidenceSource?: 'application-browser';
  proposalDecisionDigest?: string;
  operation?: 'static';
  staticRequirements?: { build: boolean; deliveryStartup?: string; requireDeliveryStartup: boolean; requireLogicTest: boolean };
}

export type DurableAcceptanceWorkspacePreparationReceipt =
  | { kind: 'acceptance-workspace-prepared'; binding: DurableAcceptanceWorkspaceBinding }
  | { kind: 'acceptance-workspace-blocked'; basis: DurableAcceptanceEnvironmentBasis; reason: string };

export interface DurableAcceptancePreparationPath {
  path: string;
  state: 'present' | 'missing' | 'unverified';
}

export type DurableAcceptancePreparationResult =
  | { kind: 'not-applicable'; authority: 'no-workspace-required' }
  | { kind: 'prepared'; receiptId: string }
  | {
    kind: 'candidate-defect' | 'material-conflict' | 'unavailable';
    stage: 'candidate' | 'materials' | 'entry' | 'registration' | 'workspace' | 'reconciliation';
    code: string;
    reason: string;
    candidate: { state: 'verified' | 'changed' | 'unreadable'; branch?: string; oid?: string };
    paths?: readonly DurableAcceptancePreparationPath[];
  };

export interface DurableAcceptancePreparationInput {
  prepareKey: string;
  basis: DurableAcceptanceEnvironmentBasis;
  result: DurableAcceptancePreparationResult;
}

export interface DurableAcceptancePreparationRework {
  sourceCandidateOid: string;
  ownerTask: DurableTaskBinding;
  workItemId: string;
  workOrderDigest: string;
  paths: readonly string[];
  writeEffectKeys: readonly string[];
  inherited: DurableImplementationAggregate['entries'];
  reason: string;
}

export interface DurableAcceptancePreparationObservation extends DurableAcceptancePreparationInput {
  entry: number;
  generation: number;
  digest: string;
  governanceDigest: string;
  materials: readonly { ref: DurableEvidenceRef; state: 'verified' | 'missing' | 'drifted' | 'unreadable'; observedSha256?: string }[];
  effect?: { token: string; state: DurableEffectClaim['state']; receiptId?: string };
  action?: 'rework';
  rework?: DurableAcceptancePreparationRework;
  confirmation?: 'stop';
}

export interface DurableAcceptanceDispatchPermit {
  prepareKey?: string;
  generation?: number;
}

export type DurableAcceptanceWorkspaceRunReceipt = {
  binding: DurableAcceptanceWorkspaceBinding;
  preview: { reviewedBy: string; url: string; port: number; openedAt: string; expiresAt: string; httpStatus: number };
} & ({
  kind: 'acceptance-workspace-run';
  build: { reviewedBy: string; toolCallId: string; turnId: string; argv: readonly string[]; cwd: string; pid: number; exitCode: number;
    outputSha256: string; entrySha256: string; writeAuditPassed: boolean };
} | {
  kind: 'acceptance-workspace-static-run';
  stage: { reviewedBy: string; toolCallId: string; turnId: string; argv: readonly string[]; cwd: string;
    inputSha256: string; outputSha256: string; entrySha256: string; writeAuditPassed: boolean; files: readonly DurableEvidenceRef[] };
});

export interface DurableAcceptanceWorkspaceCloseReceipt {
  kind: 'acceptance-workspace-closed';
  binding: DurableAcceptanceWorkspaceBinding;
  url: string;
  closedAt: string;
}

export interface DurableAcceptanceWorkspaceEvidenceReceipt {
  kind: 'acceptance-workspace-browser-evidence';
  binding: DurableAcceptanceWorkspaceBinding;
  url: string;
  observedAt: string;
  checks: readonly string[];
  artifacts: readonly DurableEvidenceRef[];
  captureReceiptIds?: readonly string[];
}

export interface DurableAcceptanceWorkspaceBrowserCaptureReceipt {
  kind: 'acceptance-workspace-browser-capture';
  binding: DurableAcceptanceWorkspaceBinding;
  runReceiptId: string;
  url: string;
  turnId: string;
  toolCallId: string;
  startedAt: string;
  endedAt: string;
  events: DurableEvidenceRef;
  screenshots: readonly DurableEvidenceRef[];
}

export interface DurableAcceptanceWorkspaceProjection {
  basis: DurableAcceptanceEnvironmentBasis;
  state: 'eligible' | 'preparing' | 'ready' | 'running' | 'ready-for-review' | 'blocked';
  binding?: DurableAcceptanceWorkspaceBinding;
  prepareKey: string;
  runKey: string;
  closeKey: string;
  evidenceKey: string;
  receipt?: DurableAcceptanceWorkspaceRunReceipt;
  runReceiptId?: string;
  closeReceipt?: DurableAcceptanceWorkspaceCloseReceipt;
  browserEvidence?: DurableAcceptanceWorkspaceEvidenceReceipt;
  reason?: string;
  preparationGate?: true;
  preparation?: DurableAcceptancePreparationObservation;
}

/** Captured by the application from a current assessment's verified local condition. */
export type DurableAcceptanceEnvironmentMissing = {
  basis: DurableAcceptanceEnvironmentBasis;
  manifest: DurableEvidenceRef;
  lock?: DurableEvidenceRef;
  condition: { kind: 'npm-local-executable'; script: string; executable: string };
} & ({
  origin: 'preflight';
  /** The existing project installation is reserved. Recovery must use its own application slot. */
  installTarget?: 'assessment-private';
  reportKey?: never;
  report?: never;
  originId?: never;
  commandReceiptId?: never;
} | {
  origin?: 'report';
  installTarget?: never;
  reportKey: string;
  report: DurableEvidenceRef;
  originId: string;
  commandReceiptId?: string;
});

export interface DurableAcceptanceEnvironmentDispatch {
  parentTask: DurableTaskBinding;
  roleId: string;
  originId: string;
  requestId: string;
}

export interface DurableAcceptanceEnvironmentSettlement {
  parentTask: DurableTaskBinding;
  childTask?: DurableTaskBinding;
  originId?: string;
  outcome: { kind: 'restored'; commandReceiptId: string; verification: DurableEvidenceRef }
    | { kind: 'retryable' | 'blocked'; reason: string; commandReceiptId?: string };
}

export interface DurableAcceptanceEnvironmentProjection {
  enabled: boolean;
  basis?: DurableAcceptanceEnvironmentBasis;
  missing?: DurableAcceptanceEnvironmentMissing;
  state: 'assessment' | 'recovering' | 'rechecking' | 'blocked';
  attempts: number;
  maxAttempts: number;
  parentTask?: DurableTaskBinding;
  childTask?: DurableTaskBinding;
  eligibleRoleIds?: readonly string[];
  effectKey?: string;
  reason?: string;
}

export interface DurableWriteSet {
  roleId: string;
  paths: readonly string[];
}

export interface DurableDecisionBinding {
  requestId: string;
  digest: string;
  generation: number;
}

export type DurableProposalDecisionValue = string | number | boolean;
export interface DurableProposalDecisionField {
  id: string;
  label: string;
  required: boolean;
  options: readonly { value: DurableProposalDecisionValue; label: string }[];
  defaultValue?: DurableProposalDecisionValue;
}

export interface DurableProposalDecision extends DurableDecisionBinding {
  proposal: DurableEvidenceRef;
  selectionDigest: string;
  values: Readonly<Record<string, DurableProposalDecisionValue>>;
  authority: DurableDecisionProvenance['source'];
  provenance?: DurableDecisionProvenance;
}

export type DurableDecisionProvenance = { source: 'customer' } | (DurableDecisionBinding & {
  source: 'delegated-chief';
  delegationRevision: number;
  reason: string;
});

export interface DurableReleaseSnapshot {
  mainOid: string;
  branch: string;
  tipOid: string;
  baselineOid: string;
  files: readonly string[];
  diffDigest: string;
  b3CloseKey: string;
  operatorReport: DurableEvidenceRef;
  operatorReportArtifacts?: readonly DurableEvidenceRef[];
  acceptanceArchive?: DurableEvidenceRef;
}

export interface DurableReleaseRequest extends DurableDecisionBinding {
  logicalKey: string;
  releaseId: string;
  snapshot: DurableReleaseSnapshot;
  decision?: { id: string; action: 'approve' | 'reject'; at: string; source: DurableDecisionProvenance['source'];
    provenance?: DurableDecisionProvenance };
}

export interface DurableReleaseDecisionInput extends DurableDecisionBinding {
  key: string;
  stepId: string;
  attempt: number;
  action: 'approve' | 'reject';
  provenance: DurableDecisionProvenance;
}

export interface DurableScopeDecision {
  kind: 'change.scope-decided';
  id: string;
  b3Request: { key: string; sourceTaskId: string; digest: string };
  b1Report: DurableEvidenceRef & { key: string; attempt: number };
  baseline: { oid: string; branch: string };
  candidateSource: 'requestedEvidence' | 'modulePaths';
  candidates: readonly string[];
  writeSets: readonly DurableWriteSet[];
  reason: string;
  evidenceRequirements?: readonly DurableB2EvidenceRequirement[];
  evidenceAuthorization?: DurableB2EvidenceDecision;
  recordedAt: string;
  decidedAt?: string;
}

export interface DurableDelivery {
  id: string;
  state: 'pending' | 'delivered';
  releaseRequestId: string;
  mergeOid: string;
  files: readonly string[];
  diffDigest: string;
  operatorReport: DurableEvidenceRef;
  operatorReportArtifacts?: readonly DurableEvidenceRef[];
  acceptanceArchive?: DurableEvidenceRef;
  runtimeVerification: 'not-independently-verified';
  createdAt: string;
  deliveredAt?: string;
}

export interface DurableDispatchDetails {
  text: string;
  runtime?: string;
  summary?: string;
  flowId?: string;
  actor?: string;
}

export type DurableDomainOperation = 'intent-card' | 'proposal-card' | 'appointment-card' | 'close-task'
  | 'activate-roles' | 'team-baseline' | 'archive-acceptance';

export interface DurableDomainRequest {
  stepId: string;
  attempt: number;
  flowId: string;
  operation: DurableDomainOperation;
  taskId?: string;
  reconcileEffectKey?: string;
}

export interface DurableGraphCard extends DurableDecisionBinding {
  cardKind: 'intent-confirm' | 'proposal' | 'appointment';
  documents: readonly DurableEvidenceRef[];
  options?: readonly string[];
  decisionFields?: readonly DurableProposalDecisionField[];
  decisionProblem?: string;
  payload?: Readonly<Record<string, unknown>>;
}

export type DurableCapabilityInput =
  | { kind: 'stage-request'; stage: WorkflowStage; workflowPath: 'A' | 'B'; requestDigest: string; dispatch: DurableDispatchDetails; existingPaths?: readonly string[]; reason?: string }
  | { kind: 'task-bound'; task: DurableTaskBinding; dispatch: DurableDispatchDetails; modulePaths?: readonly string[]; reviewWritePath?: string;
      verificationCapabilities?: DurableVerificationCapabilitySnapshot }
  | { kind: 'implementation-dispatch'; roleId: string; requestedRoleId?: string; workItemId: string; requestId: string; text: string;
      rework: boolean; modulePaths?: readonly string[] }
  | { kind: 'environment-missing'; missing: DurableAcceptanceEnvironmentMissing }
  | { kind: 'environment-recovery-dispatch'; dispatch: DurableAcceptanceEnvironmentDispatch }
  | { kind: 'environment-recovery-settled'; settlement: DurableAcceptanceEnvironmentSettlement }
  | { kind: 'review-preflight-failed'; roleId: string; reason: string }
  | { kind: 'implementation-self-test'; receipt: DurableImplementationSelfTest }
  | { kind: 'blocked-scope-prepared'; scope: DurableBlockedRoutingProjection }
  | { kind: 'blocked-scope-decided'; decision: DurableBlockedScopeDecisionInput }
  | { kind: 'blocked-scope-resumed'; requestId: string; evidence: DurableEvidenceRef; verificationCapabilities?: DurableVerificationCapabilitySnapshot;
    evidenceAction?: 'route' | 'compromise' }
  | { kind: 'acceptance-preparation-observed'; observation: DurableAcceptancePreparationObservation }
  | { kind: 'evidence-collection-dispatched'; workOrder: DurableEvidenceWorkOrder }
  | { kind: 'evidence-collection-recorded'; task: DurableTaskBinding; basis: DurableEvidenceAuditBasis; reportKey: string;
      records: readonly DurableEvidenceAuditRecord[]; missing: readonly DurableEvidenceCollectionMissing[] }
  | { kind: 'evidence-execution-recorded'; task: DurableTaskBinding; basis: DurableEvidenceAuditBasis;
      receipt: DurableEvidenceRef; turnId: string; toolCallId: string; argv: readonly string[]; observedAt: string; exitCode: number }
  | { kind: 'evidence-collection-closed'; task: DurableTaskBinding; parentTask: DurableTaskBinding; reportKey: string;
      outcome: 'accepted' | 'rework' | 'rejected'; basis: DurableEvidenceAuditBasis }
  | { kind: 'evidence-audit-blocked'; basis: DurableEvidenceAuditBasis; task: DurableTaskBinding; scope: DurableBlockedRoutingProjection;
    missing: readonly DurableEvidenceCollectionMissing[]; legacy?: true; observation?: true }
  | { kind: 'b2-evidence-scope-prepared'; request: DurableB2EvidenceDecision }
  | { kind: 'b2-evidence-scope-decided'; request: DurableB2EvidenceDecision }
  | { kind: 'a11-disposition-updated'; disposition: DurableA11Disposition }
  | { kind: 'a11-disposition-resumed'; disposition: DurableA11Disposition }
  | { kind: 'a11-retest-observed'; disposition: DurableA11Disposition }
  | { kind: 'task-report'; task: DurableTaskBinding; evidence: DurableEvidenceRef; recoveryKey?: string; evidenceAuditGeneration?: number }
  | { kind: 'product-intake-recovery' | 'product-intent-recovery'; evidence: DurableEvidenceRef }
  | { kind: 'product-dispatch-failed' | 'task-dispatch-failed'; task: DurableTaskBinding; reason: string }
  | { kind: 'operator-report'; parentTaskId: string; evidence: DurableEvidenceRef }
  | { kind: 'task-closed'; task: DurableTaskBinding; reportKey: string; outcome: 'accepted' | 'rework' | 'rejected'; documents?: readonly DurableEvidenceRef[]; tipOid?: string; defectNote?: string }
  | { kind: 'card-prepared'; card: DurableGraphCard }
  | ({ kind: 'card-decided'; decision: 'approve' | 'revise' | 'reject'; authority: DurableDecisionProvenance['source'];
      selected?: readonly string[]; decisionValues?: Readonly<Record<string, DurableProposalDecisionValue>>;
      delegationRevision?: number; provenance?: DurableDecisionProvenance } & DurableDecisionBinding)
  | { kind: 'role-activated'; roleId: string; documents: readonly DurableEvidenceRef[]; proposalRequestId: string }
  | { kind: 'baseline-verified'; effectKey: string; baselineOid: string; branch: string; writeSets?: readonly DurableWriteSet[]; documents?: readonly DurableEvidenceRef[] }
  | { kind: 'archive-verified'; effectKey: string; criteria: DurableEvidenceRef; report: DurableEvidenceRef; archive: DurableEvidenceRef; tipOid: string; runtimeVerified: boolean }
  | { kind: 'stop-verified'; reportKey: string; evidence?: DurableEvidenceRef };

export interface DurableCapabilityEvent {
  key: string;
  stepId: string;
  attempt: number;
  flowId: string;
  source: { roleId: string; originId: string; parentTaskId?: string };
  input: DurableCapabilityInput;
}

export interface DurableDocumentRevision {
  id: string;
  path: string;
  reason: string;
  roleId: 'product' | 'rapporteur' | 'nominator' | 'convener' | 'verifier';
  task: DurableTaskBinding;
  origin: { stepId: string; entry: number; attempt: number; taskId: string };
  status: 'pending' | 'awaiting-approval' | 'ready' | 'applying' | 'resumed' | 'blocked';
  original?: DurableEvidenceRef;
  candidate?: DurableEvidenceRef;
  reviewDigest?: string;
  blockedReason?: string;
  approval?: DurableDecisionBinding & { decision: 'approve' | 'reject'; at: string; provenance: DurableDecisionProvenance };
}

export interface DurableDocumentRevisionReview extends DurableDecisionBinding {
  originalContent?: string;
  candidateContent: string;
  documents: readonly DurableEvidenceRef[];
  previews: readonly { original: DurableEvidenceRef; candidate: DurableEvidenceRef; content: string }[];
}

export interface DurableDocumentRevisionDecisionInput {
  revisionId: string;
  requestId?: string;
  generation?: number;
  digest: string;
  decision: 'approve' | 'reject';
  authority: DurableDecisionProvenance['source'];
  provenance?: DurableDecisionProvenance;
}

export interface DurablePendingTask {
  stepId: string;
  attempt: number;
  flowId: string;
  capability: DurableCapability;
  task: DurableTaskBinding;
  taskId: string;
  roleId: string;
  state: 'pending' | 'reported' | 'accepted' | 'rework' | 'rejected';
  bindingKey?: string;
  baselineOid?: string;
  reviewWritePath?: string;
  workItemId?: string;
  workOrder?: DurableImplementationWorkOrder;
  evidenceWorkOrder?: DurableEvidenceWorkOrder;
  evidenceAuditGeneration?: number;
  verificationCapabilities?: DurableVerificationCapabilitySnapshot;
  environmentRecovery?: 'parent' | 'child';
  baseOid?: string;
  commitOid?: string;
  aggregate?: DurableImplementationAggregate;
  documents?: readonly DurableEvidenceRef[];
  dispatch: DurableDispatchDetails;
  modulePaths?: readonly string[];
  report?: { key: string; evidence: DurableEvidenceRef };
  outcome?: 'accepted' | 'rework' | 'rejected';
}

type FactAddress = { key: string; stepId: string; attempt: number };
export type DurableFact = FactAddress & (
  | { kind: 'stage-request'; source: 'chief' | 'host'; sourceTaskId: string; requestDigest: string; dispatch: DurableDispatchDetails }
  | { kind: 'task-bound'; source: 'host'; task: DurableTaskBinding; modulePaths?: readonly string[]; dispatch?: DurableDispatchDetails }
  | { kind: 'task-report'; source: 'host'; task: DurableTaskBinding; evidence: DurableEvidenceRef }
  | { kind: 'analysis-disposition'; source: 'convener'; task: DurableTaskBinding; reportKey: string; outcome: 'usable' | 'needsFollowup' | 'blocked' }
  | { kind: 'b3-advance'; source: 'chief' | 'host'; sourceTaskId: string; requestDigest: string; b1Attempt: number; reportKey: string; baselineOid: string; candidateSource: 'requestedEvidence' | 'modulePaths'; candidates: readonly string[]; writeSets: readonly DurableWriteSet[]; reason: string; dispatch?: DurableDispatchDetails;
      evidenceRequirements?: readonly DurableB2EvidenceRequirement[]; evidenceAuthorization?: DurableB2EvidenceDecision }
  | { kind: 'implementation-close'; source: 'convener'; task: DurableTaskBinding; reportKey: string }
  | { kind: 'operator-report'; source: 'host'; parentTaskId: string; evidence: DurableEvidenceRef }
  | { kind: 'implementation-accepted'; source: 'convener'; task: DurableTaskBinding; reportKey: string; operatorReport: DurableEvidenceRef }
  | { kind: 'release-preview'; source: 'host'; snapshot: DurableReleaseSnapshot }
  | ({ kind: 'release-decision'; source: DurableDecisionProvenance['source']; action: 'approve' | 'reject';
      provenance?: DurableDecisionProvenance } & DurableDecisionBinding)
  | { kind: 'release-merged'; source: 'host'; requestId: string; effectKey: string; mainOid: string; closed: boolean }
  | { kind: 'readonly-review'; source: 'convener'; reportKey: string; outcome: 'accepted' | 'blocked' }
  | { kind: 'capability-event'; source: 'host'; event: DurableCapabilityEvent; decisionRecordedAt?: string }
  | ({ kind: 'intent-decision-applied'; source: 'host'; appliedAt: string } & DurableDecisionBinding)
  | { kind: 'effect-settled'; source: 'host'; effectKey: string }
  | { kind: 'document-revision'; source: 'host'; revisionId: string; state: DurableDocumentRevision['status'];
      approval?: DurableDocumentRevision['approval'] }
);

export interface DurableFactReceipt {
  key: string;
  state: 'pending' | 'consumed' | 'ignored';
  reason?: string;
  release?: DurableReleaseRequest;
}

export type DurableEffect = 'dispatch' | 'model-send' | 'task-write' | 'task-commit' | 'release-merge' | 'report-delivery' | 'baseline'
  | 'role-activation' | 'acceptance-archive' | 'environment-install' | 'acceptance-check-command'
  | 'acceptance-workspace-prepare' | 'acceptance-workspace-run' | 'acceptance-workspace-close' | 'acceptance-workspace-evidence'
  | 'acceptance-workspace-browser-capture' | 'a11-index-recovery';

export interface DurableEffectIntent {
  key: string;
  stepId: string;
  attempt: number;
  kind: DurableEffect;
  task?: DurableTaskBinding;
  requestId?: string;
  snapshotDigest?: string;
  expected?: Readonly<Record<string, string | readonly string[]>>;
}

export interface DurableEffectClaim {
  key: string;
  token: string;
  state: 'claimed' | 'not-started' | 'succeeded' | 'unknown';
  execute: boolean;
  result?: DurableEffectOutcome;
}

export interface DurableEffectOutcome {
  key: string;
  token: string;
  outcome: 'not-started' | 'succeeded' | 'unknown';
  evidence: string;
  result?: Readonly<Record<string, string | readonly string[]>>;
}

export interface DurableEffectRecord {
  intent: DurableEffectIntent;
  token: string;
  state: DurableEffectClaim['state'];
  result?: DurableEffectOutcome;
}

export interface DurableStartInput extends DurableDefinitionSelection {
  projectRoot: string;
  definitionId: string;
  requestId: string;
  metadata?: Readonly<Record<string, string>>;
  customerPurpose?: 'new-work' | 'existing-change';
}

export interface DurableStartRequirement {
  inputId: string;
  turnId: string;
  text: string;
  digest: string;
  runtime: string;
}

export interface DurableRequestWorkflowStartInput {
  definitionId: string;
  source: 'project' | 'preset';
  expectedDigest: string;
  reason: string;
}

export interface DurableStartProposalInput extends DurableRequestWorkflowStartInput {
  projectRoot: string;
  requirement: DurableStartRequirement;
  customerPurpose?: DurableStartInput['customerPurpose'];
}

export interface DurableStartProposalDecisionInput {
  projectRoot: string;
  activationId: string;
  requestId: string;
  action: 'approve' | 'reject' | 'revoke';
  provenance?: DurableDecisionProvenance;
}

export interface DurableStartProposal {
  activationId: string;
  requestId: string;
  projectId: string;
  generation: number;
  state: 'pending' | 'approved' | 'rejected' | 'revoked' | 'stale' | 'started';
  definition: Pick<DurableDefinitionSnapshot, 'id' | 'name' | 'version' | 'digest'> & {
    source: 'project' | 'preset';
    file?: string;
    fileDigest?: string;
  };
  requirement: DurableStartRequirement;
  reason: string;
  createdAt: string;
  decisionDigest?: string;
  decision?: { action: DurableStartProposalDecisionInput['action']; source: DurableDecisionProvenance['source']; at: string;
    provenance?: DurableDecisionProvenance };
  instanceRef?: DurableInstanceRef;
  startup?: { state: 'waiting' | 'blocked' | 'created' | 'scheduled'; code?: string; message?: string };
}

export type DurableRequestWorkflowStartFn = (input: DurableRequestWorkflowStartInput) =>
  Promise<DurableResult<{ state: 'pending'; activationId: string; definitionDigest: string }>>;

export interface DurableActionIntent {
  key: string;
  action: DurableCapability;
  stepId: string;
  attempt: number;
  sourceKey?: string;
}

export interface DurableProjection {
  ref: DurableInstanceRef;
  schema?: 1 | 2;
  workflowOwnedDispatch?: boolean;
  definitionSource?: 'project' | 'preset';
  definitionFile?: string;
  definitionName: string;
  projectRoot: string;
  stepId: string;
  stepName: string;
  action?: DurableCapability;
  flowId?: string;
  pendingTasks?: readonly DurablePendingTask[];
  implementationItems?: readonly DurableImplementationItem[];
  blockedRoutingEnabled?: boolean;
  verificationCapabilities?: DurableVerificationCapabilitySnapshot;
  verificationPlan?: DurableVerificationPlan;
  blockedRouting?: DurableBlockedRoutingProjection;
  a11Disposition?: DurableA11Disposition;
  implementationRepair?: DurableAcceptancePreparationRework;
  evidenceAudit?: DurableEvidenceAuditProjection;
  evidenceAuditEnabled?: true;
  evidenceCollectorRoleId?: string;
  b2EvidenceDecision?: DurableB2EvidenceDecision;
  acceptanceEnvironment?: DurableAcceptanceEnvironmentProjection;
  acceptanceWorkspace?: DurableAcceptanceWorkspaceProjection;
  proposalDecision?: DurableProposalDecision;
  documentRevisionEnabled?: boolean;
  documentRevision?: DurableDocumentRevision;
  writeSets?: readonly DurableWriteSet[];
  acceptanceArchive?: DurableEvidenceRef;
  attempt: number;
  status: 'waiting' | DurableTerminal;
  waitingFor?: string;
  blockedReason?: string;
  engine: 'pending' | 'healthy' | 'offline' | 'incompatible' | 'history-missing';
  pendingFacts: number;
  actionIntent?: DurableActionIntent;
  task?: DurableTaskBinding;
  baseline?: { branch: string; oid: string };
  stageRequest?: Extract<DurableFact, { kind: 'stage-request' }>;
  analysisReport?: { key: string; evidence: DurableEvidenceRef; attempt: number; modulePaths: readonly string[] };
  scope?: Extract<DurableFact, { kind: 'b3-advance' }>;
  scopeDecision?: DurableScopeDecision;
  implementation?: Extract<DurableFact, { kind: 'implementation-accepted' }>;
  release?: DurableReleaseRequest;
  delivery?: DurableDelivery;
  metadata: Readonly<Record<string, string>>;
}

export interface DurableImplementationItem {
  id: string;
  roleId: string;
  paths: readonly string[];
}

export const DURABLE_VERIFICATION_CAPABILITIES = ['module-inspection', 'module-shell', 'governed-commit',
  'workspace-build', 'workspace-preview', 'workspace-browser'] as const;
export const DURABLE_EVIDENCE_AUDIT_CAPABILITIES = ['module-inspection', 'module-shell', 'governed-commit',
  'external-execution', 'approved-build'] as const;
export type DurableVerificationCapability = typeof DURABLE_VERIFICATION_CAPABILITIES[number] | typeof DURABLE_EVIDENCE_AUDIT_CAPABILITIES[number];
export type DurableVerificationEvidence = 'file' | 'command-receipt' | 'git-commit' | 'browser-input' | 'browser-screenshot' | 'execution-session';

export interface DurableVerificationCapabilitySnapshot {
  stage: 'A12a' | 'A12b';
  status: readonly { capability: DurableVerificationCapability; status: 'available' | 'candidate-pending' | 'unavailable'; reason?: string }[];
}

export interface DurableVerificationRequirement {
  id: string;
  stage: 'A11' | 'A12b';
  capability: DurableVerificationCapability;
  evidence: readonly DurableVerificationEvidence[];
  workItemId?: string;
  command?: readonly string[];
  behavior?: string;
  source?: 'candidate-file' | 'candidate-commit' | 'task-command' | 'external-session';
  paths?: readonly string[];
}

export interface DurableImplementationSelfTest {
  task: DurableTaskBinding;
  workOrderDigest: string;
  candidateOid: string;
  turnId: string;
  toolCallId: string;
  argv: readonly string[];
  reviewedBy: string;
  exitCode: 0;
  writeAuditPassed: true;
  executionDigest: string;
  executionEvidence?: DurableEvidenceRef;
  retest?: { key: string; standardSha256: string; auditDigest: string };
}

export interface DurableVerificationPlan {
  standard: DurableEvidenceRef;
  capabilities: DurableVerificationCapabilitySnapshot;
  capabilitiesDigest: string;
  requirements: readonly DurableVerificationRequirement[];
}

export interface DurableImplementationWorkOrder {
  schema: 'implementation-work-order/v1';
  digest: string;
  task: DurableTaskBinding;
  workItemId: string;
  paths: readonly string[];
  standard: DurableEvidenceRef;
  capabilitiesDigest: string;
  requirements: readonly DurableVerificationRequirement[];
  deferredChecks: readonly DurableVerificationRequirement[];
}

export type DurableBlockedScopeChoice = 'wait' | 'revise' | 'stop' | 'rework' | 'route' | 'compromise';
export interface DurableBlockedScopeRequest {
  task: DurableTaskBinding;
  document: DurableEvidenceRef;
  capability: DurableVerificationCapability;
  reason: string;
}

export interface DurableBlockedScopeDecisionInput extends DurableDecisionBinding {
  option: DurableBlockedScopeChoice;
  provenance: DurableDecisionProvenance;
}

export interface DurableBlockedRoutingProjection {
  kind: 'scope-change';
  binding: DurableDecisionBinding;
  origin: { stepId: string; entry: number; attempt: number; task: DurableTaskBinding };
  document: DurableEvidenceRef;
  candidateOid?: string;
  governanceDigest: string;
  reason: string;
  capability?: DurableVerificationCapability;
  options: readonly { id: DurableBlockedScopeChoice; label: string; impact: string }[];
  decision?: DurableBlockedScopeDecisionInput;
  resumePending?: true;
  a11DispositionKey?: string;
  a12bPrepareKey?: string;
  evidenceAuditKey?: string;
  evidenceRoute?: DurableEvidenceAuditRoute;
  evidenceCompromise?: { requirementIds: readonly string[]; paths: readonly string[] };
}

export interface DurableA11GitObservation {
  branch?: string;
  head?: string;
  indexDigest?: string;
  stagedPaths: readonly string[];
  untrackedPaths?: readonly string[];
  trackedDirty: boolean;
  reason: string;
  lock?: string;
  worktreeDigest?: string;
  files?: readonly DurableEvidenceRef[];
}

export interface DurableA11Disposition {
  key: string;
  state: 'parked' | 'resumed';
  recoveryMode?: 'native' | 'manual';
  resumeExhausted?: true;
  entry: number;
  generation: number;
  childTask: DurableTaskBinding;
  parentTask: DurableTaskBinding;
  candidateOid: string;
  branch: string;
  baseOid: string;
  commitEffectKey: string;
  governanceDigest: string;
  workOrderDigest: string;
  standard: DurableEvidenceRef;
  standardState: 'verified' | 'missing' | 'drifted' | 'unreadable';
  observedStandardSha256?: string;
  observation: DurableA11GitObservation;
  childReport: NonNullable<DurablePendingTask['report']>;
  parentReport?: DurablePendingTask['report'];
  confirmation?: 'stop';
  retest?: {
    missingRequirements: readonly DurableVerificationRequirement[];
    blocker?: string;
    failure?: { toolCallId: string; turnId: string; evidence: DurableEvidenceRef; assertionFailure: boolean };
    defectNote?: string;
    pendingReportReview?: true;
    reportReviewGeneration?: number;
  };
  recovery?: {
    addEffectKey: string;
    beforeIndex: string;
    afterIndex: string;
    paths: readonly string[];
    writes: readonly DurableEvidenceRef[];
  };
}

export interface DurableImplementationAggregate {
  tipOid: string;
  entries: readonly { workItemId: string; taskId: string; reportKey: string; commitOid: string }[];
}

export interface DurableReviewPreflight {
  projectRoot: string;
  roleId: string;
  taskId: string;
  stepId: string;
  attempt: number;
  flowId: string;
  stage: 'A12a' | 'A12b';
  path: string;
}

export type DurableReviewPreflightFn = (input: DurableReviewPreflight) => Promise<DurableResult<true>>;
export type DurableVerificationPreflightFn = (input: DurableReviewPreflight & {
  ref: DurableInstanceRef; baselineOid: string; proposalDecisionDigest?: string;
}) => Promise<DurableResult<DurableVerificationCapabilitySnapshot>>;

export interface DurableOwner {
  engine: 'dapr' | 'legacy';
  instanceId: string;
  projectId: string;
  ownedByThisDataDir: boolean;
}

export interface DurableWorkerStatus {
  state: 'pending' | 'registered' | 'offline' | 'incompatible';
  executor: string;
  activityContract: number;
  reason?: string;
}
