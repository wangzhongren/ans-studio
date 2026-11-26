import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  DurableActionIntent, DurableDefinitionSnapshot, DurableDelivery, DurableEffectClaim, DurableEffectIntent, DurableEffectOutcome,
  DurableEvidenceRef, DurableFact, DurableFactReceipt, DurableInstanceRef, DurableOwner, DurableProjection, DurableReleaseRequest,
  DurableGraphCard, DurablePendingTask, DurableScopeDecision, DurableTaskBinding, DurableTerminal, DurableWriteSet,
  DurableStartInput, DurableStartProposal, DurableDocumentRevision, DurableCapabilityEvent,
} from '../../model/durable-workflow.ts';
import type { RepositoryIdentity } from './files.ts';

export interface StoredInstance {
  ref: DurableInstanceRef;
  definition: DurableDefinitionSnapshot;
  definitionSource?: 'project' | 'preset';
  definitionFile?: string;
  startupFingerprint?: string;
  projectRoot: string;
  commonDir: string;
  requestId: string;
  metadata: Record<string, string>;
  stepId: string;
  entry: number;
  attempt: number;
  status: 'waiting' | DurableTerminal;
  engine: DurableProjection['engine'];
  engineReason?: string;
  businessReason?: string;
  scheduled: boolean;
  scheduling: boolean;
  visits: Record<string, number>;
  task?: DurableTaskBinding;
  analysisReport?: DurableProjection['analysisReport'];
  readonlyReportKey?: string;
  scope?: DurableProjection['scope'];
  implementation?: DurableProjection['implementation'];
  release?: DurableReleaseRequest;
  actionIntent?: DurableActionIntent;
  baseline?: { branch: string; oid: string };
  graph?: {
    flowId?: string;
    observedHead?: string;
    observedStatus?: string;
    customerPurpose?: 'new-work' | 'existing-change';
    existingRequest?: import('../../model/durable-workflow.ts').DurableCapabilityEvent;
    card?: DurableGraphCard;
    tasks: DurablePendingTask[];
    proofs: Record<string, string>;
    writeSets?: readonly DurableWriteSet[];
    activatedRoles?: string[];
    expectedRoles?: readonly string[];
    roleDocumentPaths?: readonly string[];
    proposalRoster?: DurableEvidenceRef;
    approvedProposalRequestId?: string;
    acceptanceArchive?: DurableEvidenceRef;
    documentRevisions?: StoredDocumentRevision[];
  };
}

export interface StoredDocumentRevision extends DurableDocumentRevision {
  requestedBy: DurableCapabilityEvent['source'];
  submittedBy?: DurableCapabilityEvent['source'];
  candidateInputDigest?: string;
  basis: readonly DurableEvidenceRef[];
  updates?: readonly { original: DurableEvidenceRef; candidate: DurableEvidenceRef }[];
  missingOriginal?: boolean;
  decision?: { authority: 'customer'; decision: 'approve' | 'reject'; digest: string; at: string };
}

export interface StoredFact { fact: DurableFact; receipt: DurableFactReceipt; fingerprint: string }
export interface StoredEffect {
  intent: DurableEffectIntent;
  token: string;
  state: DurableEffectClaim['state'];
  result?: DurableEffectOutcome;
}
export interface OutboxItem { instanceId: string; key: string; nextAt: number; attempts: number; phase: 'pending' | 'accepted' }

export interface StoredStartSelection {
  definition: DurableDefinitionSnapshot;
  source: DurableStartProposal['definition']['source'];
  file: string;
  fileDigest: string;
}

export interface StoredStartProposal {
  proposal: DurableStartProposal;
  selection: StoredStartSelection;
  fingerprint: string;
  start: DurableStartInput;
}

export interface StoredApprovedStart {
  activationId: string;
  start: DurableStartInput;
  selection: StoredStartSelection;
}

type JsonRow = { data: string };
const asJson = <T>(row: unknown): T | undefined => row === undefined ? undefined : JSON.parse((row as JsonRow).data) as T;

function open(path: string, wal: boolean): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
  if (wal) db.exec('PRAGMA journal_mode=WAL');
  return db;
}

export class DurableLedger {
  readonly #db: DatabaseSync;
  readonly dataDir: string;

  constructor(dataDir: string) {
    mkdirSync(resolve(dataDir), { recursive: true, mode: 0o700 });
    this.dataDir = realpathSync(dataDir);
    this.#db = open(join(this.dataDir, 'ans-workflow.sqlite'), true);
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS instance (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, request_id TEXT NOT NULL,
        status TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(project_id, request_id)
      );
      CREATE INDEX IF NOT EXISTS instance_project ON instance(project_id, status);
      CREATE TABLE IF NOT EXISTS definition (
        project_id TEXT NOT NULL, definition_id TEXT NOT NULL, version INTEGER NOT NULL,
        digest TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(project_id, definition_id, version)
      );
      CREATE TABLE IF NOT EXISTS fact (
        id INTEGER PRIMARY KEY, instance_id TEXT NOT NULL REFERENCES instance(id), business_key TEXT NOT NULL,
        state TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(instance_id, business_key)
      );
      CREATE TABLE IF NOT EXISTS outbox (
        instance_id TEXT NOT NULL, business_key TEXT NOT NULL, next_at INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0, phase TEXT NOT NULL DEFAULT 'pending',
        PRIMARY KEY(instance_id, business_key),
        FOREIGN KEY(instance_id,business_key) REFERENCES fact(instance_id,business_key)
      );
      CREATE TABLE IF NOT EXISTS effect (
        instance_id TEXT NOT NULL REFERENCES instance(id), business_key TEXT NOT NULL,
        state TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(instance_id, business_key)
      );
      CREATE TABLE IF NOT EXISTS activity (
        instance_id TEXT NOT NULL REFERENCES instance(id), business_key TEXT NOT NULL,
        data TEXT NOT NULL, PRIMARY KEY(instance_id, business_key)
      );
      CREATE TABLE IF NOT EXISTS evidence (
        instance_id TEXT NOT NULL REFERENCES instance(id), digest TEXT NOT NULL,
        content BLOB NOT NULL, PRIMARY KEY(instance_id,digest)
      );
      CREATE TABLE IF NOT EXISTS scope_decision (
        instance_id TEXT PRIMARY KEY, request_key TEXT NOT NULL, id TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK(kind='change.scope-decided'), data TEXT NOT NULL,
        FOREIGN KEY(instance_id,request_key) REFERENCES fact(instance_id,business_key)
      );
      CREATE TABLE IF NOT EXISTS delivery_note (
        instance_id TEXT PRIMARY KEY, merge_fact_key TEXT NOT NULL, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL,
        FOREIGN KEY(instance_id,merge_fact_key) REFERENCES fact(instance_id,business_key)
      );
      CREATE TABLE IF NOT EXISTS delivery_receipt (
        delivery_id TEXT PRIMARY KEY REFERENCES delivery_note(id), delivered_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workflow_start_proposal (
        activation_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, input_id TEXT NOT NULL, generation INTEGER NOT NULL,
        state TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(project_id,input_id,generation)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS workflow_start_proposal_active_input
        ON workflow_start_proposal(project_id,input_id) WHERE state IN ('pending','approved','started');
      CREATE TABLE IF NOT EXISTS workflow_start_job (
        activation_id TEXT PRIMARY KEY REFERENCES workflow_start_proposal(activation_id),
        startup_key TEXT NOT NULL UNIQUE, data TEXT NOT NULL
      );
    `);
  }

  transaction<T>(operation: () => T): T {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void { this.#db.close(); }

  instance(instanceId: string): StoredInstance | undefined {
    return asJson(this.#db.prepare('SELECT data FROM instance WHERE id=?').get(instanceId));
  }

  request(projectId: string, requestId: string): StoredInstance | undefined {
    return asJson(this.#db.prepare('SELECT data FROM instance WHERE project_id=? AND request_id=?').get(projectId, requestId));
  }

  active(projectId?: string): StoredInstance[] {
    const rows = projectId === undefined
      ? this.#db.prepare("SELECT data FROM instance WHERE status='waiting' ORDER BY rowid").all()
      : this.#db.prepare("SELECT data FROM instance WHERE project_id=? AND status='waiting' ORDER BY rowid").all(projectId);
    return rows.map(row => asJson<StoredInstance>(row)!);
  }

  instances(projectId: string): StoredInstance[] {
    return this.#db.prepare('SELECT data FROM instance WHERE project_id=? ORDER BY rowid DESC').all(projectId)
      .map(row => asJson<StoredInstance>(row)!);
  }

  instancesForRoot(root: string): StoredInstance[] {
    return this.#db.prepare("SELECT data FROM instance WHERE json_extract(data,'$.projectRoot')=? ORDER BY rowid DESC")
      .all(root).map(row => asJson<StoredInstance>(row)!);
  }

  missingBusinessRecords(): StoredInstance[] {
    return this.#db.prepare(`SELECT i.data FROM instance AS i
      LEFT JOIN scope_decision AS s ON s.instance_id=i.id
      LEFT JOIN delivery_note AS d ON d.instance_id=i.id
      WHERE (s.instance_id IS NULL AND json_extract(i.data,'$.scope.key') IS NOT NULL)
        OR (d.instance_id IS NULL AND json_extract(i.data,'$.release.decision.action')='approve'
          AND EXISTS (SELECT 1 FROM fact AS f WHERE f.instance_id=i.id AND f.state IN ('pending','consumed')
            AND json_extract(f.data,'$.fact.kind')='release-merged'))`).all().map(row => asJson<StoredInstance>(row)!);
  }

  save(value: StoredInstance): void {
    this.#db.prepare(`INSERT INTO instance(id,project_id,request_id,status,data) VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data`)
      .run(value.ref.instanceId, value.ref.projectId, value.requestId, value.status, JSON.stringify(value));
  }

  definition(projectId: string, definitionId: string, version: number): DurableDefinitionSnapshot | undefined {
    return asJson(this.#db.prepare('SELECT data FROM definition WHERE project_id=? AND definition_id=? AND version=?')
      .get(projectId, definitionId, version));
  }

  startProposal(activationId: string): StoredStartProposal | undefined {
    return asJson(this.#db.prepare('SELECT data FROM workflow_start_proposal WHERE activation_id=?').get(activationId));
  }

  startProposals(projectId: string, inputId?: string): StoredStartProposal[] {
    const query = 'SELECT data FROM workflow_start_proposal WHERE project_id=?';
    const rows = inputId === undefined
      ? this.#db.prepare(query + ' ORDER BY rowid').all(projectId)
      : this.#db.prepare(query + ' AND input_id=? ORDER BY generation').all(projectId, inputId);
    return rows.map(row => asJson<StoredStartProposal>(row)!);
  }

  saveStartProposal(value: StoredStartProposal): void {
    const { activationId, projectId, requirement, generation, state } = value.proposal;
    this.#db.prepare(`INSERT INTO workflow_start_proposal(activation_id,project_id,input_id,generation,state,data) VALUES(?,?,?,?,?,?)
      ON CONFLICT(activation_id) DO UPDATE SET state=excluded.state,data=excluded.data`)
      .run(activationId, projectId, requirement.inputId, generation, state, JSON.stringify(value));
  }

  approvedStart(activationId: string): StoredApprovedStart | undefined {
    return asJson(this.#db.prepare('SELECT data FROM workflow_start_job WHERE activation_id=?').get(activationId));
  }

  saveApprovedStart(value: StoredApprovedStart): void {
    this.#db.prepare('INSERT INTO workflow_start_job(activation_id,startup_key,data) VALUES(?,?,?)')
      .run(value.activationId, value.start.requestId, JSON.stringify(value));
  }

  pin(projectId: string, value: DurableDefinitionSnapshot): void {
    this.#db.prepare('INSERT OR IGNORE INTO definition(project_id,definition_id,version,digest,data) VALUES(?,?,?,?,?)')
      .run(projectId, value.id, value.version, value.digest, JSON.stringify(value));
  }

  fact(instanceId: string, key: string): StoredFact | undefined {
    return asJson(this.#db.prepare('SELECT data FROM fact WHERE instance_id=? AND business_key=?').get(instanceId, key));
  }

  facts(instanceId: string, pending = false): StoredFact[] {
    const filter = pending ? " AND state='pending'" : '';
    return this.#db.prepare('SELECT data FROM fact WHERE instance_id=?' + filter + ' ORDER BY id')
      .all(instanceId).map(row => asJson<StoredFact>(row)!);
  }

  saveFact(instanceId: string, value: StoredFact): void {
    this.#db.prepare(`INSERT INTO fact(instance_id,business_key,state,data) VALUES(?,?,?,?)
      ON CONFLICT(instance_id,business_key) DO UPDATE SET state=excluded.state,data=excluded.data`)
      .run(instanceId, value.fact.key, value.receipt.state, JSON.stringify(value));
    if (value.receipt.state === 'pending') {
      this.#db.prepare('INSERT OR IGNORE INTO outbox(instance_id,business_key) VALUES(?,?)').run(instanceId, value.fact.key);
    } else {
      this.#db.prepare('DELETE FROM outbox WHERE instance_id=? AND business_key=?').run(instanceId, value.fact.key);
    }
  }

  scopeDecision(instanceId: string): DurableScopeDecision | undefined {
    return asJson(this.#db.prepare('SELECT data FROM scope_decision WHERE instance_id=?').get(instanceId));
  }

  saveScopeDecision(instanceId: string, value: DurableScopeDecision): void {
    this.#db.prepare('INSERT INTO scope_decision(instance_id,request_key,id,kind,data) VALUES(?,?,?,?,?)')
      .run(instanceId, value.b3Request.key, value.id, value.kind, JSON.stringify(value));
  }

  delivery(instanceId: string): DurableDelivery | undefined {
    const row = this.#db.prepare(`SELECT d.data,r.delivered_at AS deliveredAt FROM delivery_note AS d
      LEFT JOIN delivery_receipt AS r ON r.delivery_id=d.id WHERE d.instance_id=?`).get(instanceId);
    const note = asJson<DurableDelivery>(row);
    return note && (typeof row?.deliveredAt === 'string' ? { ...note, state: 'delivered', deliveredAt: row.deliveredAt } : note);
  }

  saveDelivery(instanceId: string, mergeKey: string, value: DurableDelivery): void {
    this.#db.prepare('INSERT INTO delivery_note(instance_id,merge_fact_key,id,data) VALUES(?,?,?,?)')
      .run(instanceId, mergeKey, value.id, JSON.stringify(value));
  }

  saveDeliveryReceipt(id: string, at: string): void {
    this.#db.prepare('INSERT INTO delivery_receipt(delivery_id,delivered_at) VALUES(?,?) ON CONFLICT(delivery_id) DO NOTHING').run(id, at);
  }

  outbox(now: number): OutboxItem[] {
    return this.#db.prepare(`SELECT instance_id AS instanceId,business_key AS key,
      next_at AS nextAt,attempts,phase FROM outbox WHERE next_at<=? ORDER BY next_at LIMIT 100`).all(now) as unknown as OutboxItem[];
  }

  postponed(item: OutboxItem, accepted: boolean): void {
    const nextAt = Date.now() + Math.min(15_000, 500 * 2 ** Math.min(item.attempts, 5));
    this.#db.prepare('UPDATE outbox SET next_at=?,attempts=attempts+1,phase=? WHERE instance_id=? AND business_key=?')
      .run(nextAt, accepted || item.phase === 'accepted' ? 'accepted' : 'pending', item.instanceId, item.key);
  }

  activity<T>(instanceId: string, key: string): T | undefined {
    return asJson(this.#db.prepare('SELECT data FROM activity WHERE instance_id=? AND business_key=?').get(instanceId, key));
  }

  saveActivity(instanceId: string, key: string, result: unknown): void {
    this.#db.prepare('INSERT INTO activity(instance_id,business_key,data) VALUES(?,?,?)').run(instanceId, key, JSON.stringify(result));
  }

  effect(instanceId: string, key: string): StoredEffect | undefined {
    return asJson(this.#db.prepare('SELECT data FROM effect WHERE instance_id=? AND business_key=?').get(instanceId, key));
  }

  effects(instanceId: string): StoredEffect[] {
    return this.#db.prepare('SELECT data FROM effect WHERE instance_id=? ORDER BY rowid').all(instanceId)
      .map(row => asJson<StoredEffect>(row)!);
  }

  saveEffect(instanceId: string, value: StoredEffect): void {
    this.#db.prepare(`INSERT INTO effect(instance_id,business_key,state,data) VALUES(?,?,?,?)
      ON CONFLICT(instance_id,business_key) DO UPDATE SET state=excluded.state,data=excluded.data`)
      .run(instanceId, value.intent.key, value.state, JSON.stringify(value));
  }

  saveEvidence(instanceId: string, digest: string, bytes: Buffer): void {
    this.#db.prepare('INSERT OR IGNORE INTO evidence(instance_id,digest,content) VALUES(?,?,?)').run(instanceId, digest, bytes);
  }

  evidence(instanceId: string, digest: string): Buffer | undefined {
    const row = this.#db.prepare('SELECT content FROM evidence WHERE instance_id=? AND digest=?').get(instanceId, digest);
    return row === undefined ? undefined : Buffer.from(row.content as Uint8Array);
  }
}

type OwnerRow = { engine: DurableOwner['engine']; instanceId: string; dataDir: string };

export interface WorkspaceReservation extends OwnerRow {
  projectId: string;
  requestId: string;
  fingerprint: string;
  state: 'reserved' | 'active';
  source?: 'project' | 'preset';
  definitionFile?: string;
  definition?: DurableDefinitionSnapshot;
  initialHead?: string;
  initialStatus?: string;
}

function workspaceOwnerDb(root: string, create: boolean): DatabaseSync | undefined {
  const names = [join(root, '.ans'), join(root, '.ans', 'state')];
  for (const name of names) {
    if (!existsSync(name) && !create) return undefined;
    if (create) {
      try { mkdirSync(name, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    }
    const info = lstatSync(name);
    if (!info.isDirectory() || info.isSymbolicLink() || resolve(realpathSync(name)).toLowerCase() !== resolve(name).toLowerCase()) {
      throw new Error('应用状态目录存在重定向。');
    }
  }
  const file = join(names[1]!, 'ans-durable-owner.sqlite');
  if (existsSync(file)) {
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('项目占用账本存在重定向。');
  } else if (!create) return undefined;
  const db = open(file, false);
  db.exec('CREATE TABLE IF NOT EXISTS workspace_owner (slot TEXT PRIMARY KEY, data TEXT NOT NULL)');
  return db;
}

export function workspaceOwner(root: string): WorkspaceReservation | undefined {
  const db = workspaceOwnerDb(root, false);
  if (!db) return undefined;
  try { return asJson(db.prepare("SELECT data FROM workspace_owner WHERE slot='workspace'").get()); }
  finally { db.close(); }
}

export function reserveWorkspace(root: string, proposed: WorkspaceReservation): WorkspaceReservation {
  const db = workspaceOwnerDb(root, true)!;
  try {
    db.exec('BEGIN IMMEDIATE');
    db.prepare("INSERT OR IGNORE INTO workspace_owner(slot,data) VALUES('workspace',?)").run(JSON.stringify(proposed));
    const recorded = asJson<WorkspaceReservation>(db.prepare("SELECT data FROM workspace_owner WHERE slot='workspace'").get())!;
    db.exec('COMMIT');
    return recorded;
  } finally { db.close(); }
}

export function changeWorkspaceOwner(root: string, previous: WorkspaceReservation, active: boolean): void {
  const db = workspaceOwnerDb(root, false);
  if (!db) return;
  try {
    const current = JSON.stringify(previous);
    if (active) db.prepare("UPDATE workspace_owner SET data=? WHERE slot='workspace' AND data=?")
      .run(JSON.stringify({ ...previous, state: 'active' }), current);
    else db.prepare("DELETE FROM workspace_owner WHERE slot='workspace' AND data=?").run(current);
  } finally { db.close(); }
}
function ownerDb(commonDir: string): DatabaseSync {
  const db = open(join(commonDir, 'ans-workflow-ownership.sqlite'), false);
  db.exec(`CREATE TABLE IF NOT EXISTS owner (
    slot TEXT PRIMARY KEY, engine TEXT NOT NULL, instance_id TEXT NOT NULL, data_dir TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS pinned_definition (
    definition_id TEXT NOT NULL, version INTEGER NOT NULL, digest TEXT NOT NULL,
    PRIMARY KEY(definition_id,version)
  )`);
  return db;
}

export function repositoryOwner(repo: Pick<RepositoryIdentity, 'commonDir'>, slot = 'path-b'): OwnerRow | undefined {
  if (!existsSync(join(repo.commonDir, 'ans-workflow-ownership.sqlite'))) return undefined;
  const db = ownerDb(repo.commonDir);
  try {
    return db.prepare('SELECT engine,instance_id AS instanceId,data_dir AS dataDir FROM owner WHERE slot=?').get(slot) as OwnerRow | undefined;
  } finally { db.close(); }
}

export function reserveOwner(repo: RepositoryIdentity, owner: OwnerRow, slot = 'path-b'): boolean {
  return reserveOwnerState(repo, owner, slot) !== 'conflict';
}

export function reserveOwnerState(repo: RepositoryIdentity, owner: OwnerRow, slot = 'path-b'): 'acquired' | 'already-owned' | 'conflict' {
  const db = ownerDb(repo.commonDir);
  try {
    db.exec('BEGIN IMMEDIATE');
    const inserted = db.prepare('INSERT OR IGNORE INTO owner(slot,engine,instance_id,data_dir) VALUES(?,?,?,?)')
      .run(slot, owner.engine, owner.instanceId, owner.dataDir);
    const current = db.prepare('SELECT engine,instance_id AS instanceId,data_dir AS dataDir FROM owner WHERE slot=?').get(slot) as OwnerRow;
    db.exec('COMMIT');
    if (Number(inserted.changes) === 1) return 'acquired';
    return current.engine === owner.engine && current.instanceId === owner.instanceId && current.dataDir === owner.dataDir
      ? 'already-owned' : 'conflict';
  } finally { db.close(); }
}

export function pinRepositoryDefinition(repo: RepositoryIdentity, definition: DurableDefinitionSnapshot): boolean {
  const db = ownerDb(repo.commonDir);
  try {
    db.prepare('INSERT OR IGNORE INTO pinned_definition(definition_id,version,digest) VALUES(?,?,?)')
      .run(definition.id, definition.version, definition.digest);
    return db.prepare('SELECT digest FROM pinned_definition WHERE definition_id=? AND version=?')
      .get(definition.id, definition.version)?.digest === definition.digest;
  } finally { db.close(); }
}

export function releaseOwner(repo: Pick<RepositoryIdentity, 'commonDir'>, owner: OwnerRow, slot = 'path-b'): void {
  const db = ownerDb(repo.commonDir);
  try {
    db.prepare('DELETE FROM owner WHERE slot=? AND engine=? AND instance_id=? AND data_dir=?')
      .run(slot, owner.engine, owner.instanceId, owner.dataDir);
  } finally { db.close(); }
}
