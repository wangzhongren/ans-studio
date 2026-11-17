import type { WorkflowStage } from './runtime.ts';

export const DURABLE_EXECUTOR = 'ans-durable-definition-v1';
export const DURABLE_ACTIVITY = 'ans-durable-apply-v1';
export const DURABLE_ACTIVITY_CONTRACT = 1;
export const DURABLE_WAKE_EVENT = 'ans-durable-fact-v1';
export const DURABLE_GRAPH_EXECUTOR = 'ans-durable-definition-v2';
export const DURABLE_GRAPH_ACTIVITY = 'ans-durable-apply-v2';
export const DURABLE_GRAPH_ACTIVITY_CONTRACT = 2;
export const DURABLE_GRAPH_WAKE_EVENT = 'ans-durable-fact-v2';

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
  | 'product-prepare' | 'author-intent' | 'confirm-intent' | 'planning-prepare' | 'author-proposal' | 'confirm-proposal'
  | 'personnel-prepare' | 'activate-roles' | 'team-baseline' | 'confirm-appointment'
  | 'independent-standard' | 'governed-implementation' | 'independent-assessment' | 'archive-acceptance'
  | 'customer-publish' | 'verify-stop' | 'retry-intent' | 'retry-proposal' | 'retry-implementation';

export type DurableRoleSelector = 'module-owner' | 'independent-reviewer';
export type DurableGraphStep = { terminal: DurableTerminal } | {
  action: DurableCapability;
  role?: DurableRoleSelector;
  next?: string;
  on?: Record<string, string>;
  maxVisits?: number;
  onLimit?: string;
};

export interface DurableGraphDefinition extends Omit<DurableDefinition, 'schema' | 'steps'> {
  schema: 2;
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

export interface DurableWriteSet {
  roleId: string;
  paths: readonly string[];
}

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

export interface DurableReleaseRequest {
  logicalKey: string;
  releaseId: string;
  requestId: string;
  digest: string;
  generation: number;
  snapshot: DurableReleaseSnapshot;
  decision?: { id: string; action: 'approve' | 'reject'; at: string; source: 'customer' };
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

export interface DurableGraphCard {
  requestId: string;
  digest: string;
  generation: number;
  cardKind: 'intent-confirm' | 'proposal' | 'appointment';
  documents: readonly DurableEvidenceRef[];
  options?: readonly string[];
  payload?: Readonly<Record<string, unknown>>;
}

export type DurableCapabilityInput =
  | { kind: 'stage-request'; stage: WorkflowStage; workflowPath: 'A' | 'B'; requestDigest: string; dispatch: DurableDispatchDetails; existingPaths?: readonly string[]; reason?: string }
  | { kind: 'task-bound'; task: DurableTaskBinding; dispatch: DurableDispatchDetails; modulePaths?: readonly string[] }
  | { kind: 'task-report'; task: DurableTaskBinding; evidence: DurableEvidenceRef }
  | { kind: 'operator-report'; parentTaskId: string; evidence: DurableEvidenceRef }
  | { kind: 'task-closed'; task: DurableTaskBinding; reportKey: string; outcome: 'accepted' | 'rework' | 'rejected'; documents?: readonly DurableEvidenceRef[]; tipOid?: string }
  | { kind: 'card-prepared'; card: DurableGraphCard }
  | { kind: 'card-decided'; requestId: string; digest: string; generation: number; decision: 'approve' | 'revise' | 'reject'; authority: 'customer' | 'delegated-chief'; selected?: readonly string[]; delegationRevision?: number }
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
  documents?: readonly DurableEvidenceRef[];
  dispatch: DurableDispatchDetails;
  modulePaths?: readonly string[];
  report?: { key: string; evidence: DurableEvidenceRef };
  outcome?: 'accepted' | 'rework' | 'rejected';
}

type FactAddress = { key: string; stepId: string; attempt: number };
export type DurableFact = FactAddress & (
  | { kind: 'stage-request'; source: 'chief'; sourceTaskId: string; requestDigest: string; dispatch: DurableDispatchDetails }
  | { kind: 'task-bound'; source: 'host'; task: DurableTaskBinding; modulePaths?: readonly string[]; dispatch?: DurableDispatchDetails }
  | { kind: 'task-report'; source: 'host'; task: DurableTaskBinding; evidence: DurableEvidenceRef }
  | { kind: 'analysis-disposition'; source: 'convener'; task: DurableTaskBinding; reportKey: string; outcome: 'usable' | 'needsFollowup' | 'blocked' }
  | { kind: 'b3-advance'; source: 'chief'; sourceTaskId: string; requestDigest: string; b1Attempt: number; reportKey: string; baselineOid: string; candidateSource: 'requestedEvidence' | 'modulePaths'; candidates: readonly string[]; writeSets: readonly DurableWriteSet[]; reason: string; dispatch?: DurableDispatchDetails }
  | { kind: 'implementation-close'; source: 'convener'; task: DurableTaskBinding; reportKey: string }
  | { kind: 'operator-report'; source: 'host'; parentTaskId: string; evidence: DurableEvidenceRef }
  | { kind: 'implementation-accepted'; source: 'convener'; task: DurableTaskBinding; reportKey: string; operatorReport: DurableEvidenceRef }
  | { kind: 'release-preview'; source: 'host'; snapshot: DurableReleaseSnapshot }
  | { kind: 'release-decision'; source: 'customer'; requestId: string; digest: string; generation: number; action: 'approve' | 'reject' }
  | { kind: 'release-merged'; source: 'host'; requestId: string; effectKey: string; mainOid: string; closed: boolean }
  | { kind: 'readonly-review'; source: 'convener'; reportKey: string; outcome: 'accepted' | 'blocked' }
  | { kind: 'capability-event'; source: 'host'; event: DurableCapabilityEvent }
  | { kind: 'effect-settled'; source: 'host'; effectKey: string }
);

export interface DurableFactReceipt {
  key: string;
  state: 'pending' | 'consumed' | 'ignored';
  reason?: string;
  release?: DurableReleaseRequest;
}

export type DurableEffect = 'dispatch' | 'model-send' | 'task-write' | 'task-commit' | 'release-merge' | 'report-delivery' | 'baseline'
  | 'role-activation' | 'acceptance-archive';

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
  definitionSource?: 'project' | 'preset';
  definitionFile?: string;
  definitionName: string;
  projectRoot: string;
  stepId: string;
  stepName: string;
  action?: DurableCapability;
  flowId?: string;
  pendingTasks?: readonly DurablePendingTask[];
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
