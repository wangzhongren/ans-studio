import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  DurableActionIntent, DurableDefinition, DurableEffectClaim, DurableEffectIntent, DurableEffectOutcome,
  DurableFact, DurableFactReceipt, DurableInstanceRef, DurableOwner, DurableProjection, DurableReleaseRequest,
  DurableTaskBinding, DurableTerminal,
} from '../../model/durable-workflow.ts';
import type { RepositoryIdentity } from './files.ts';

export interface StoredInstance {
  ref: DurableInstanceRef;
  definition: DurableDefinition;
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
}

export interface StoredFact { fact: DurableFact; receipt: DurableFactReceipt; fingerprint: string }
export interface StoredEffect {
  intent: DurableEffectIntent;
  token: string;
  state: DurableEffectClaim['state'];
  result?: DurableEffectOutcome;
}
export interface OutboxItem { instanceId: string; key: string; nextAt: number; attempts: number; phase: 'pending' | 'accepted' }

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

  save(value: StoredInstance): void {
    this.#db.prepare(`INSERT INTO instance(id,project_id,request_id,status,data) VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data`)
      .run(value.ref.instanceId, value.ref.projectId, value.requestId, value.status, JSON.stringify(value));
  }

  definition(projectId: string, definitionId: string, version: number): DurableDefinition | undefined {
    return asJson(this.#db.prepare('SELECT data FROM definition WHERE project_id=? AND definition_id=? AND version=?')
      .get(projectId, definitionId, version));
  }

  pin(projectId: string, value: DurableDefinition): void {
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

export function pinRepositoryDefinition(repo: RepositoryIdentity, definition: DurableDefinition): boolean {
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
