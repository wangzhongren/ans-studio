export const DURABLE_EXECUTOR = 'ans-durable-definition-v1';
export const DURABLE_ACTIVITY = 'ans-durable-apply-v1';
export const DURABLE_ACTIVITY_CONTRACT = 1;
export const DURABLE_WAKE_EVENT = 'ans-durable-fact-v1';

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

export type DurableStage = 'B1' | 'B3' | 'B4' | 'readonly';
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

export interface DurableDispatchDetails {
  text: string;
  runtime?: string;
  summary?: string;
  flowId?: string;
  actor?: string;
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
  | { kind: 'effect-settled'; source: 'host'; effectKey: string }
);

export interface DurableFactReceipt {
  key: string;
  state: 'pending' | 'consumed' | 'ignored';
  reason?: string;
  release?: DurableReleaseRequest;
}

export type DurableEffect = 'dispatch' | 'model-send' | 'task-write' | 'task-commit' | 'release-merge' | 'report-delivery' | 'baseline';

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

export interface DurableStartInput {
  projectRoot: string;
  definitionId: string;
  requestId: string;
  metadata?: Readonly<Record<string, string>>;
}

export interface DurableActionIntent {
  key: string;
  action: DurableAction;
  stepId: string;
  attempt: number;
  sourceKey?: string;
}

export interface DurableProjection {
  ref: DurableInstanceRef;
  definitionName: string;
  projectRoot: string;
  stepId: string;
  stepName: string;
  action?: DurableAction;
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
  implementation?: Extract<DurableFact, { kind: 'implementation-accepted' }>;
  release?: DurableReleaseRequest;
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
